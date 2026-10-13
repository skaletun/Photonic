import { useCallback, useEffect, useRef } from "react";
import {
  DEBOUNCE_MS,
  KERNEL_IDS,
  LOUPE_DEBOUNCE_MS,
  LOUPE_SIZE,
  OVERVIEW_MAX_SIDE,
  PREVIEW_FULL_MAX_PIXELS,
  type KernelId,
} from "@/lib/config";
import { kernelFingerprint, previewIdentity, settingsFingerprint, type UiState } from "@/lib/app-state";
import { destPixels, fitInside, validateDest } from "@/lib/limits";
import { cropAround, measureFrame } from "@/lib/meter";
import { AppError } from "@/lib/errors";
import { statusFromError } from "@/lib/i18n";
import { isAbortError } from "@/lib/resample/client";
import { jobOptions, resultImage, type Runtime } from "./runtime";

export function usePreviewPipeline(runtime: Runtime, state: UiState) {
  const {
    state: stateRef,
    source: sourceRef,
    full: fullRef,
    operation: operationRef,
    client: clientRef,
    preview: previewRef,
    previewImage: previewImageRef,
  } = runtime;
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const point = useRef({ x: 0.5, y: 0.5, side: "b" as "a" | "b" });
  const frames = useRef<{ a: ImageData | null; b: ImageData | null }>({ a: null, b: null });
  const frameVersion = useRef(-1);
  const update = useCallback(async () => {
    if (operationRef.current) return;
    const s = stateRef.current;
    const client = clientRef.current;
    const source = sourceRef.current;
    if (!s.hasSource || !client || !source.display) {
      frames.current = { a: null, b: null };
      return;
    }
    const token = ++sequence.current;
    const verdict = validateDest(s.destW, s.destH);
    if (!verdict.ok) {
      runtime.status(statusFromError(new AppError(verdict.code!, verdict.params)), "error");
      return;
    }
    const version = source.version;
    const current = () => token === sequence.current && version === sourceRef.current.version && !operationRef.current;
    const overview = destPixels(s.destW, s.destH) > PREVIEW_FULL_MAX_PIXELS;
    const size = overview ? fitInside(s.destW, s.destH, OVERVIEW_MAX_SIDE) : { width: s.destW, height: s.destH };
    const render = async (
      id: KernelId,
      index: number,
      count: number,
      region?: { x: number; y: number; w: number; h: number },
    ) => {
      const key = `${version}|${kernelFingerprint(s, id)}|${size.width}x${size.height}|${region ? JSON.stringify(region) : ""}`;
      const cached = runtime.cache.get(key);
      if (cached) return cached;
      const result = await client.resample(
        jobOptions(s, {
          kernelId: id,
          kind: "preview",
          destW: region ? s.destW : size.width,
          destH: region ? s.destH : size.height,
          region,
        }),
        (value) => {
          if (current()) runtime.dispatch({ type: "setProgress", value: (index + value) / count });
        },
      );
      if (!current()) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      const image = resultImage(result);
      runtime.cache.set(key, image);
      return image;
    };
    try {
      runtime.dispatch({ type: "setBusy", value: true });
      runtime.status({ key: "status.interpolating" });
      if (s.viewMode === "grid") {
        previewRef.current?.clearGrid();
        const w = Math.min(280, s.destW);
        const h = Math.min(280, s.destH);
        const region = {
          x: Math.max(0, Math.min(s.destW - w, Math.round(point.current.x * s.destW - w / 2))),
          y: Math.max(0, Math.min(s.destH - h, Math.round(point.current.y * s.destH - h / 2))),
          w,
          h,
        };
        for (let i = 0; i < KERNEL_IDS.length; i++) {
          const image = await render(KERNEL_IDS[i], i, KERNEL_IDS.length, region);
          if (!current()) return;
          previewRef.current?.paintGrid(KERNEL_IDS[i], image);
        }
        runtime.status({ key: "status.gridDone" });
      } else if (s.viewMode === "versus") {
        const a = await render(s.versusA, 0, 2);
        const b = await render(s.versusB, 1, 2);
        if (!current()) return;
        previewRef.current?.drawVersus({ a, b, overview });
        frames.current = { a, b };
        frameVersion.current = version;
        previewImageRef.current = b;
        runtime.dispatch({ type: "setMeter", value: measureFrame(b) });
        runtime.status({ key: "status.versus", params: { w: s.destW, h: s.destH, a: s.versusA, b: s.versusB } });
      } else {
        const image = await render(s.kernel, 0, 1);
        if (!current()) return;
        previewRef.current?.drawPreview({ bitmap: source.display, imageData: image, overview });
        frames.current = { a: image, b: image };
        frameVersion.current = version;
        previewImageRef.current = image;
        fullRef.current = overview ? { image: null, fingerprint: "" } : { image, fingerprint: settingsFingerprint(s) };
        runtime.dispatch({ type: "setMeter", value: measureFrame(image) });
        runtime.status({
          key: "status.dims",
          params: { w: s.destW, h: s.destH, mp: ((s.destW * s.destH) / 1e6).toFixed(2), kernel: s.kernel },
        });
      }
      runtime.dispatch({ type: "setOverview", value: overview });
      runtime.dispatch({ type: "setPreviewFingerprint", value: previewIdentity(s) });
    } catch (error) {
      if (current() && !isAbortError(error)) runtime.status(statusFromError(error), "error");
    } finally {
      if (current()) {
        runtime.dispatch({ type: "setBusy", value: false });
        runtime.dispatch({ type: "setProgress", value: null });
      }
    }
  }, [runtime, stateRef, sourceRef, fullRef, operationRef, clientRef, previewRef, previewImageRef]);
  const loupe = useCallback(
    (x: number, y: number, side: "a" | "b") => {
      point.current = { x, y, side };
      if (operationRef.current || stateRef.current.busy) return;
      const s = stateRef.current;
      const image = frames.current[side];
      if (image && frameVersion.current === sourceRef.current.version && image.width === s.destW) {
        previewRef.current?.showLoupe(cropAround(image, x, y, LOUPE_SIZE));
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const client = clientRef.current;
        if (!client || operationRef.current || !s.hasSource) return;
        const version = sourceRef.current.version;
        const kernelId = s.viewMode === "versus" ? (side === "a" ? s.versusA : s.versusB) : s.kernel;
        const w = Math.min(LOUPE_SIZE, s.destW);
        const h = Math.min(LOUPE_SIZE, s.destH);
        const region = {
          x: Math.max(0, Math.min(s.destW - w, Math.round(x * s.destW - w / 2))),
          y: Math.max(0, Math.min(s.destH - h, Math.round(y * s.destH - h / 2))),
          w,
          h,
        };
        try {
          const result = await client.resample(jobOptions(s, { kernelId, kind: "loupe", region }));
          if (
            version === sourceRef.current.version &&
            point.current.x === x &&
            point.current.y === y &&
            !operationRef.current
          )
            previewRef.current?.showLoupe(resultImage(result));
        } catch (error) {
          if (!isAbortError(error)) runtime.status(statusFromError(error), "error");
        }
      }, LOUPE_DEBOUNCE_MS);
    },
    [runtime, stateRef, sourceRef, operationRef, clientRef, previewRef],
  );
  useEffect(() => {
    sequence.current++;
    if (operationRef.current) return;
    const timeout = setTimeout(() => {
      void update();
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timeout);
    };
  }, [
    runtime,
    operationRef,
    update,
    state.sourceRevision,
    state.kernel,
    state.lanczosA,
    state.destW,
    state.destH,
    state.colorSpace,
    state.unsharpEnabled,
    state.unsharpAmount,
    state.unsharpRadius,
    state.unsharpThreshold,
    state.viewMode,
    state.versusA,
    state.versusB,
    state.hasSource,
    state.exporting,
  ]);
  useEffect(
    () => () => {
      sequence.current++;
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { loupe, refresh: update };
}
