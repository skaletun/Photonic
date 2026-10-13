import { useCallback, useState } from "react";
import { settingsFingerprint } from "@/lib/app-state";
import { AppError } from "@/lib/errors";
import { statusFromError, t } from "@/lib/i18n";
import { decodeFile } from "@/lib/io/decode";
import { attachPassport, type ImagePassport } from "@/lib/io/exif";
import { attachIcc } from "@/lib/io/icc";
import { downloadBlob, encodeImageData, extensionForMime, formatToMime, stemFromName } from "@/lib/io/encode";
import { uniqueName, zipBlobs } from "@/lib/io/zip";
import { validateDest } from "@/lib/limits";
import { estimateWorkingBytes, memoryBudget } from "@/lib/memory";
import { isAbortError } from "@/lib/resample/client";
import { currentScale, jobOptions, resultImage, type Runtime } from "./runtime";
import { destination, type StudioDocument } from "./useDocuments";
import type { RefObject } from "react";

export function useExports(
  runtime: Runtime,
  documents: RefObject<StudioDocument[]>,
  mark: (id: string, status: StudioDocument["status"], error?: string) => void,
) {
  const { state: stateRef, source: sourceRef, full: fullRef, operation: operationRef, client: clientRef } = runtime;
  const [details, setDetails] = useState<{ name: string; bytes: number; seconds: number } | null>(null);
  const run = useCallback(
    async (mode: "current" | "zip" | "each" | "retry") => {
      if (operationRef.current || !stateRef.current.hasSource) return;
      const client = clientRef.current;
      if (!client) return;
      const s = { ...stateRef.current };
      const active = documents.current[s.queueIndex];
      if (!active) return;
      const files =
        mode === "current"
          ? [active]
          : mode === "retry"
            ? documents.current.filter((item) => item.status === "error")
            : [...documents.current];
      if (!files.length) return;
      const control = new AbortController();
      operationRef.current = control;
      const signal = control.signal;
      const start = performance.now();
      const entries: { name: string; blob: Blob }[] = [];
      const used = new Set<string>();
      const scale = currentScale(s);
      let changedSource = false;
      let failures = 0;
      let completed = 0;
      let totalBytes = 0;
      client.abortActive();
      runtime.dispatch({ type: "setExporting", value: true });
      runtime.dispatch({ type: "setBusy", value: true });
      const encode = async (image: ImageData, item: StudioDocument, mime: string, passport: ImagePassport) => {
        runtime.status({ key: "status.encoding" });
        const target = formatToMime(s.exportFormat, mime);
        const raw = await encodeImageData(image, target, s.quality, s.jpegBackground);
        signal.throwIfAborted();
        const withMetadata = s.preserveMetadata
          ? await attachPassport(raw, target, passport, image.width, image.height)
          : raw;
        const blob = await attachIcc(withMetadata, target, passport.iccKind, passport.icc);
        signal.throwIfAborted();
        const name = uniqueName(
          `${stemFromName(item.file.name)}-${image.width}x${image.height}-${s.kernel}.${extensionForMime(target)}`,
          used,
        );
        return { name, blob };
      };
      try {
        for (let i = 0; i < files.length; i++) {
          signal.throwIfAborted();
          const item = files[i];
          mark(item.id, "processing");
          runtime.status({ key: "status.batchItem", params: { i: i + 1, n: files.length, name: item.file.name } });
          try {
            let image: ImageData | null =
              mode === "current" && fullRef.current.fingerprint === settingsFingerprint(s)
                ? fullRef.current.image
                : null;
            let passport = sourceRef.current.passport;
            let mime = s.sourceMime;
            if (!image) {
              let width = s.sourceWidth;
              let height = s.sourceHeight;
              if (mode !== "current") {
                const decoded = await decodeFile(item.file);
                try {
                  signal.throwIfAborted();
                  width = decoded.width;
                  height = decoded.height;
                  client.setSource(decoded.imageData);
                  changedSource = true;
                  passport = decoded.passport;
                  mime = decoded.mime;
                } finally {
                  decoded.display.close();
                }
              }
              const dest =
                mode === "current" ? { width: s.destW, height: s.destH } : destination(s, width, height, scale);
              const verdict = validateDest(dest.width, dest.height);
              if (!verdict.ok) throw new AppError(verdict.code!, verdict.params);
              if (
                estimateWorkingBytes(width, height, dest.width, dest.height, s.kernel) + runtime.cache.byteLength >
                memoryBudget()
              )
                throw new AppError("memory_budget");
              const result = await client.resample(
                jobOptions(s, { kind: "export", destW: dest.width, destH: dest.height }),
                (value) => runtime.dispatch({ type: "setProgress", value: (i + value) / files.length }),
              );
              signal.throwIfAborted();
              image = resultImage(result);
            }
            const entry = await encode(image, item, mime, passport);
            completed++;
            totalBytes += entry.blob.size;
            if (mode !== "zip") entries.length = 0;
            entries.push(entry);
            if (mode === "each" || mode === "current" || mode === "retry") downloadBlob(entry.blob, entry.name);
            mark(item.id, "ready");
          } catch (error) {
            if (isAbortError(error) || signal.aborted) {
              mark(item.id, "waiting");
              throw error;
            }
            failures++;
            mark(item.id, "error", t(s.locale, statusFromError(error).key, statusFromError(error).params));
            if (mode === "current") throw error;
          }
        }
        if (entries.length) {
          const name = mode === "zip" ? `photonic-batch-${s.kernel}.zip` : entries[0].name;
          const blob = mode === "zip" ? await zipBlobs(entries, signal) : entries[0].blob;
          signal.throwIfAborted();
          if (mode === "zip") downloadBlob(blob, name);
          const bytes = mode === "zip" ? blob.size : totalBytes;
          setDetails({ name, bytes, seconds: (performance.now() - start) / 1000 });
          runtime.status(
            { key: failures ? "studio.partial" : "studio.exportDone", params: { n: completed, failed: failures } },
            failures ? "warn" : undefined,
          );
        } else runtime.status({ key: "studio.allFailed" }, "error");
      } catch (error) {
        runtime.status(
          signal.aborted || isAbortError(error) ? { key: "studio.cancelled" } : statusFromError(error),
          signal.aborted ? undefined : "error",
        );
      } finally {
        // A batch temporarily owns the Worker source; restore the visible document even on failure.
        if (changedSource) {
          try {
            const decoded = await decodeFile(active.file);
            client.setSource(decoded.imageData);
            decoded.display.close();
          } catch (error) {
            runtime.status(statusFromError(error), "error");
          }
        }
        operationRef.current = null;
        runtime.dispatch({ type: "setExporting", value: false });
        runtime.dispatch({ type: "setBusy", value: false });
        runtime.dispatch({ type: "setProgress", value: null });
      }
    },
    [runtime, documents, mark, stateRef, sourceRef, fullRef, operationRef, clientRef],
  );
  const cancel = useCallback(() => {
    operationRef.current?.abort();
    clientRef.current?.abortActive();
  }, [operationRef, clientRef]);
  return { run, cancel, details };
}
