import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_BATCH, type KernelId } from "@/lib/config";
import { decodeFile, isSupportedFile } from "@/lib/io/decode";
import { AppError } from "@/lib/errors";
import { statusFromError } from "@/lib/i18n";
import { fitInsidePaper, paperToPx } from "@/lib/print";
import { withBase } from "@/lib/base-path";
import { SAMPLE_FILES, type SampleId } from "@/lib/samples";
import { currentScale, EMPTY_PASSPORT, type Runtime } from "./runtime";

export type DocumentStatus = "waiting" | "processing" | "ready" | "error";
export type StudioDocument = { id: string; file: File; url: string; status: DocumentStatus; error?: string };
export function destination(state: Runtime["state"]["current"], width: number, height: number, scale: number) {
  if (state.paperW && state.paperH) {
    const sheet = paperToPx(state.paperW, state.paperH, state.printUnit, state.dpi);
    return fitInsidePaper(width, height, sheet.width, sheet.height, state.lockAspect);
  }
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export function useDocuments(runtime: Runtime, clearHistory: () => void) {
  const {
    state: stateRef,
    source: sourceRef,
    full: fullRef,
    operation: operationRef,
    client: clientRef,
    preview: previewRef,
  } = runtime;
  const [documents, setDocuments] = useState<StudioDocument[]>([]);
  const ref = useRef<StudioDocument[]>([]);
  const loading = useRef(0);
  const update = useCallback(
    (items: StudioDocument[], index = stateRef.current.queueIndex) => {
      ref.current = items;
      setDocuments(items);
      runtime.dispatch({ type: "setQueue", names: items.map((item) => item.file.name), index });
    },
    [runtime, stateRef],
  );
  const mark = useCallback(
    (id: string, status: DocumentStatus, error?: string) => {
      update(ref.current.map((item) => (item.id === id ? { ...item, status, error } : item)));
    },
    [update],
  );
  const open = useCallback(
    async (index: number, options: { kernel?: KernelId; scale?: number } = {}) => {
      if (operationRef.current) return;
      const item = ref.current[index];
      if (!item) return;
      const token = ++loading.current;
      const scale = options.scale ? options.scale / 100 : currentScale(stateRef.current);
      sourceRef.current.version++;
      clientRef.current?.abortActive();
      runtime.dispatch({ type: "setBusy", value: true });
      runtime.status({ key: "status.reading" });
      try {
        const decoded = await decodeFile(item.file);
        if (token !== loading.current) {
          decoded.display.close();
          return;
        }
        sourceRef.current.display?.close();
        clientRef.current?.setSource(decoded.imageData);
        sourceRef.current = {
          display: decoded.display,
          passport: decoded.passport,
          version: sourceRef.current.version,
        };
        fullRef.current = { image: null, fingerprint: "" };
        runtime.cache.clear();
        clearHistory();
        const dest = destination(stateRef.current, decoded.width, decoded.height, scale);
        if (options.kernel) runtime.dispatch({ type: "setKernel", kernel: options.kernel });
        runtime.dispatch({
          type: "setSource",
          width: decoded.width,
          height: decoded.height,
          name: decoded.name,
          mime: decoded.mime,
          isGif: decoded.isGif,
          destW: dest.width,
          destH: dest.height,
          hasExif: decoded.passport.hasExif,
          iccKind: decoded.passport.iccKind,
        });
        runtime.dispatch({ type: "setQueueIndex", index });
        previewRef.current?.resetView();
        runtime.status({
          key: decoded.isGif ? "status.loadedGif" : "status.loaded",
          params: { w: decoded.width, h: decoded.height, kb: (item.file.size / 1024).toFixed(0) },
        });
      } catch (error) {
        if (token === loading.current) {
          mark(item.id, "error", item.file.name);
          runtime.status(error instanceof AppError ? statusFromError(error) : { key: "error.read_failed" }, "error");
        }
      } finally {
        if (token === loading.current) runtime.dispatch({ type: "setBusy", value: false });
      }
    },
    [runtime, clearHistory, mark, stateRef, sourceRef, fullRef, operationRef, clientRef, previewRef],
  );
  const add = useCallback(
    async (files: File[], options: { kernel?: KernelId; scale?: number; replace?: boolean } = {}) => {
      const supported = files.filter(isSupportedFile);
      if (!supported.length) {
        runtime.status({ key: "error.unsupported_type" }, "error");
        return;
      }
      const previous = options.replace ? [] : ref.current;
      if (previous.length + supported.length > MAX_BATCH) {
        runtime.status({ key: "error.batch_too_large", params: { max: MAX_BATCH } }, "error");
        return;
      }
      if (options.replace && operationRef.current) return;
      if (options.replace) ref.current.forEach((item) => URL.revokeObjectURL(item.url));
      const items = supported.map((file) => ({
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
        status: "waiting" as const,
      }));
      const index = previous.length ? stateRef.current.queueIndex : 0;
      update([...previous, ...items], index);
      if (!previous.length) await open(0, options);
    },
    [runtime, update, open, stateRef, operationRef],
  );
  const remove = useCallback(
    async (index: number) => {
      if (operationRef.current) return;
      const item = ref.current[index];
      if (!item) return;
      URL.revokeObjectURL(item.url);
      const current = stateRef.current.queueIndex;
      const items = ref.current.filter((_, i) => i !== index);
      const next = Math.max(0, Math.min(items.length - 1, current - (index < current ? 1 : 0)));
      update(items, next);
      if (!items.length) {
        loading.current++;
        sourceRef.current.version++;
        clientRef.current?.abortActive();
        sourceRef.current.display?.close();
        sourceRef.current = { display: null, passport: EMPTY_PASSPORT, version: sourceRef.current.version };
        fullRef.current = { image: null, fingerprint: "" };
        runtime.cache.clear();
        clearHistory();
        runtime.dispatch({ type: "clearSource" });
        runtime.dispatch({ type: "setBusy", value: false });
      } else if (index === current) await open(next);
    },
    [runtime, update, open, clearHistory, stateRef, sourceRef, fullRef, operationRef, clientRef],
  );
  const move = useCallback(
    (index: number, direction: -1 | 1) => {
      if (operationRef.current) return;
      const items = [...ref.current];
      const target = index + direction;
      if (target < 0 || target >= items.length) return;
      const activeId = items[stateRef.current.queueIndex]?.id;
      [items[index], items[target]] = [items[target], items[index]];
      update(
        items,
        items.findIndex((item) => item.id === activeId),
      );
    },
    [update, stateRef, operationRef],
  );
  const sample = useCallback(
    async (id: SampleId) => {
      const item = SAMPLE_FILES.find((sample) => sample.id === id);
      if (!item) return;
      try {
        const response = await fetch(withBase(`/samples/${item.file}`));
        if (!response.ok) throw new Error("sample");
        await add([new File([await response.blob()], item.file, { type: item.mime })], {
          kernel: item.kernel,
          scale: item.scale,
          replace: true,
        });
      } catch {
        runtime.status({ key: "error.read_failed" }, "error");
      }
    },
    [runtime, add],
  );
  useEffect(
    () => () => {
      loading.current++;
      ref.current.forEach((item) => URL.revokeObjectURL(item.url));
    },
    [],
  );
  return { documents, documentsRef: ref, add, open, remove, move, mark, sample };
}
