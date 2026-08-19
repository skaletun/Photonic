"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from "react";
import {
  DEBOUNCE_MS,
  KERNEL_IDS,
  LOUPE_DEBOUNCE_MS,
  LOUPE_SIZE,
  MAX_BATCH,
  OVERVIEW_MAX_SIDE,
  PREVIEW_FULL_MAX_PIXELS,
  type KernelId,
  type ViewMode,
} from "@/lib/config";
import { AppError } from "@/lib/errors";
import { acceptAttr, decodeFile, isSupportedFile } from "@/lib/io/decode";
import { attachPassport, type ImagePassport } from "@/lib/io/exif";
import { attachIcc } from "@/lib/io/icc";
import { downloadBlob, encodeImageData, extensionForMime, formatToMime, stemFromName } from "@/lib/io/encode";
import { zipStore } from "@/lib/io/zip";
import { destPixels, fitInside, megapixels, validateDest } from "@/lib/limits";
import { CLIP_WARN, cropAround, measureFrame } from "@/lib/meter";
import { fitInsidePaper, paperToPx } from "@/lib/print";
import { isAbortError, ResampleClient, type ResampleResult } from "@/lib/resample/client";
import { bindHotkeys } from "@/lib/hotkeys";
import { statusFromError, t, type StatusMsg } from "@/lib/i18n";
import { withBase } from "@/lib/base-path";
import { recipeFromSettings, serializeRecipe } from "@/lib/recipe";
import { SAMPLE_FILES, type SampleId } from "@/lib/samples";
import {
  hydrateSettings,
  kernelFingerprint,
  reducer,
  settingsFingerprint,
  snapshotSettings,
  type SettingsSnap,
  type UiState,
} from "@/lib/app-state";
import { loadSettings, saveSettings } from "@/lib/storage";
import {
  bindFileLaunch,
  bindInstallPrompt,
  bindShareInbox,
  isIosSafari,
  isStandalone,
  promptInstall,
  registerServiceWorker,
} from "@/lib/pwa";
import { AppStateContext } from "./AppStateContext";
import { Enlarger } from "./Enlarger";
import { KernelRail } from "./KernelRail";
import { Mast } from "./Mast";
import { Preview, type PreviewHandle } from "./Preview";
import { SiteNotes } from "./SiteNotes";

type HistoryEntry = {
  snap: SettingsSnap;
  result: ImageData | null;
  fingerprint: string;
};

type SourceRefs = {
  display: ImageBitmap | null;
  passport: ImagePassport;
};

const EMPTY_PASSPORT: ImagePassport = {
  hasExif: false,
  copyright: "",
  jpegApp1: null,
  tiff: null,
  icc: null,
  iccKind: "none",
};

type OpenOptions = {
  kernel?: KernelId;
  scale?: number;
  keepBusy?: boolean;
};

function currentScale(state: UiState) {
  if (state.recipeScale) return state.recipeScale / 100;
  if (state.hasSource && state.sourceWidth) return state.destW / state.sourceWidth;
  return 1;
}

function toImageData(result: ResampleResult) {
  const data = new Uint8ClampedArray(result.data);
  return new ImageData(data, result.width, result.height);
}

function persistable(state: UiState) {
  return {
    theme: state.theme,
    locale: state.locale,
    kernel: state.kernel,
    lanczosA: state.lanczosA,
    lockAspect: state.lockAspect,
    colorSpace: state.colorSpace,
    unsharpEnabled: state.unsharpEnabled,
    unsharpAmount: state.unsharpAmount,
    unsharpRadius: state.unsharpRadius,
    unsharpThreshold: state.unsharpThreshold,
    exportFormat: state.exportFormat,
    quality: state.quality,
    viewMode: state.viewMode,
    dpi: state.dpi,
    printUnit: state.printUnit,
    versusA: state.versusA,
    versusB: state.versusB,
  };
}

function destForSource(state: UiState, width: number, height: number, scale: number) {
  if (state.paperW && state.paperH) {
    const sheet = paperToPx(state.paperW, state.paperH, state.printUnit, state.dpi);
    return fitInsidePaper(width, height, sheet.width, sheet.height, state.lockAspect);
  }
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function PhotonicApp() {
  const [state, dispatch] = useReducer(reducer, null, () => hydrateSettings(loadSettings()));
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  });

  const clientRef = useRef<ResampleClient | null>(null);
  const previewRef = useRef<PreviewHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceRefs = useRef<SourceRefs>({ display: null, passport: EMPTY_PASSPORT });
  const queueRef = useRef<File[]>([]);
  const emptyTapRef = useRef({ x: 0, y: 0, moved: false });
  const fullResultRef = useRef<ImageData | null>(null);
  const fullFingerprintRef = useRef("");
  const versusCacheRef = useRef(new Map<string, ImageData>());
  const historyRef = useRef<HistoryEntry[]>([]);
  const redoRef = useRef<HistoryEntry[]>([]);
  const loupePointRef = useRef({ x: 0.5, y: 0.5, side: "b" as "a" | "b" });
  const previewPixelsRef = useRef<ImageData | null>(null);
  const versusPixelsRef = useRef<{ a: ImageData; b: ImageData } | null>(null);
  const previewTimer = useRef(0);
  const loupeTimer = useRef(0);
  const loupeRaf = useRef(0);

  const setStatus = useCallback((status: StatusMsg, kind?: UiState["statusKind"]) => {
    dispatch({ type: "setStatus", status, kind });
  }, []);

  const syncHistory = useCallback(() => {
    dispatch({ type: "setHistory", undo: historyRef.current.length, redo: redoRef.current.length });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  useEffect(() => {
    saveSettings(persistable(state));
  }, [
    state.theme,
    state.locale,
    state.kernel,
    state.lanczosA,
    state.lockAspect,
    state.colorSpace,
    state.unsharpEnabled,
    state.unsharpAmount,
    state.unsharpRadius,
    state.unsharpThreshold,
    state.exportFormat,
    state.quality,
    state.viewMode,
    state.dpi,
    state.printUnit,
    state.versusA,
    state.versusB,
  ]);

  useEffect(() => {
    const client = new ResampleClient();
    clientRef.current = client;
    return () => {
      client.terminate();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  useEffect(() => {
    const sync = () => {
      const offline = !navigator.onLine;
      dispatch({ type: "setOffline", value: offline });
      if (offline && !stateRef.current.busy) {
        setStatus({ key: "status.offline" });
      } else if (!offline && !stateRef.current.hasSource && !stateRef.current.busy) {
        setStatus({ key: "status.ready" });
      }
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, [setStatus]);

  const resampleOptions = useCallback((extra: Partial<{ kernelId: KernelId; kind: string; destW: number; destH: number; region: { x: number; y: number; w: number; h: number } }> = {}) => {
    const s = stateRef.current;
    const kernelId = extra.kernelId ?? s.kernel;
    return {
      destW: extra.destW ?? s.destW,
      destH: extra.destH ?? s.destH,
      kernelId,
      a: s.lanczosA,
      colorSpace: kernelId === "photonic" ? ("linear" as const) : s.colorSpace,
      unsharp: {
        enabled: s.unsharpEnabled,
        amount: s.unsharpAmount,
        radius: s.unsharpRadius,
        threshold: s.unsharpThreshold,
      },
      ...extra,
    };
  }, []);

  const pushHistory = useCallback(() => {
    const s = stateRef.current;
    if (!s.hasSource) return;
    historyRef.current.push({
      snap: snapshotSettings(s),
      result: fullResultRef.current,
      fingerprint: fullFingerprintRef.current,
    });
    if (historyRef.current.length > 20) historyRef.current.shift();
    redoRef.current = [];
    syncHistory();
  }, [syncHistory]);

  const checkDest = useCallback(() => {
    const s = stateRef.current;
    const verdict = validateDest(s.destW, s.destH);
    if (!verdict.ok && verdict.code) {
      setStatus(statusFromError(new AppError(verdict.code, verdict.params)), "error");
      return false;
    }
    if (verdict.warn && verdict.code) {
      setStatus(statusFromError(new AppError(verdict.code, verdict.params)), "warn");
    }
    return true;
  }, [setStatus]);

  const applyMeter = useCallback(
    (imageData: ImageData) => {
      const meter = measureFrame(imageData);
      dispatch({ type: "setMeter", value: meter });
      const s = stateRef.current;
      if (s.unsharpEnabled && meter.clipHigh > CLIP_WARN) {
        setStatus({ key: "status.clipWarn", params: { pct: (meter.clipHigh * 100).toFixed(1) } }, "warn");
      }
      return meter;
    },
    [setStatus],
  );

  const cachePut = useCallback((key: string, imageData: ImageData) => {
    versusCacheRef.current.set(key, imageData);
    if (versusCacheRef.current.size > 8) {
      const first = versusCacheRef.current.keys().next().value;
      if (first) versusCacheRef.current.delete(first);
    }
  }, []);

  const runPreview = useCallback(async () => {
    const s = stateRef.current;
    const client = clientRef.current;
    const display = sourceRefs.current.display;
    if (!s.hasSource || !client || !display || !checkDest()) return;
    const fp = settingsFingerprint(s);
    if (fullResultRef.current && fullFingerprintRef.current === fp) {
      previewRef.current?.drawPreview({
        bitmap: display,
        imageData: fullResultRef.current,
        overview: false,
      });
      previewPixelsRef.current = fullResultRef.current;
      previewRef.current?.showLoupe(null);
      dispatch({ type: "setOverview", value: false });
      applyMeter(fullResultRef.current);
      return;
    }

    const pixels = destPixels(s.destW, s.destH);
    const overview = pixels > PREVIEW_FULL_MAX_PIXELS;
    const target = overview
      ? fitInside(s.destW, s.destH, OVERVIEW_MAX_SIDE)
      : { width: s.destW, height: s.destH };

    try {
      dispatch({ type: "setBusy", value: true });
      setStatus({ key: overview ? "status.overview" : "status.interpolating" });
      const result = await client.resample(
        resampleOptions({
          destW: target.width,
          destH: target.height,
          kind: overview ? "overview" : "full",
        }),
        (value) => dispatch({ type: "setProgress", value }),
      );
      const imageData = toImageData(result);
      if (!overview) {
        fullResultRef.current = imageData;
        fullFingerprintRef.current = fp;
      } else {
        fullResultRef.current = null;
        fullFingerprintRef.current = "";
      }
      previewRef.current?.drawPreview({ bitmap: display, imageData, overview });
      previewPixelsRef.current = imageData;
      dispatch({ type: "setOverview", value: overview });
      const meter = applyMeter(imageData);
      const mp = megapixels(s.destW, s.destH).toFixed(2);
      if (!(s.unsharpEnabled && meter.clipHigh > CLIP_WARN)) {
        setStatus({ key: "status.dims", params: { w: s.destW, h: s.destH, mp, kernel: s.kernel } });
      }
    } catch (error) {
      if (!isAbortError(error)) setStatus(statusFromError(error), "error");
    } finally {
      dispatch({ type: "setProgress", value: null });
      dispatch({ type: "setBusy", value: false });
    }
  }, [applyMeter, checkDest, resampleOptions, setStatus]);

  const runVersus = useCallback(async () => {
    const s = stateRef.current;
    const client = clientRef.current;
    if (!s.hasSource || !client || !checkDest()) return;
    const pixels = destPixels(s.destW, s.destH);
    const overview = pixels > PREVIEW_FULL_MAX_PIXELS;
    const target = overview
      ? fitInside(s.destW, s.destH, OVERVIEW_MAX_SIDE)
      : { width: s.destW, height: s.destH };
    const kernels: KernelId[] = [s.versusA, s.versusB];
    try {
      dispatch({ type: "setBusy", value: true });
      setStatus({ key: overview ? "status.overview" : "status.interpolating" });
      const frames: ImageData[] = [];
      for (let i = 0; i < kernels.length; i += 1) {
        const kernelId = kernels[i];
        const key = `${overview ? "ov" : "full"}|${kernelFingerprint(s, kernelId)}`;
        let imageData = versusCacheRef.current.get(key);
        if (!imageData) {
          const result = await client.resample(
            resampleOptions({
              kernelId,
              destW: target.width,
              destH: target.height,
              kind: overview ? "overview" : "full",
            }),
            (value) => dispatch({ type: "setProgress", value: (i + value) / 2 }),
          );
          imageData = toImageData(result);
          cachePut(key, imageData);
        } else {
          dispatch({ type: "setProgress", value: (i + 1) / 2 });
        }
        if (!overview && kernelId === s.kernel) {
          fullResultRef.current = imageData;
          fullFingerprintRef.current = settingsFingerprint(s);
        }
        frames.push(imageData);
      }
      previewRef.current?.drawVersus({ a: frames[0], b: frames[1], overview });
      versusPixelsRef.current = { a: frames[0], b: frames[1] };
      dispatch({ type: "setOverview", value: overview });
      const meter = applyMeter(frames[1]);
      if (!(s.unsharpEnabled && meter.clipHigh > CLIP_WARN)) {
        setStatus({
          key: "status.versus",
          params: { w: s.destW, h: s.destH, a: s.versusA, b: s.versusB },
        });
      }
    } catch (error) {
      if (!isAbortError(error)) setStatus(statusFromError(error), "error");
    } finally {
      dispatch({ type: "setProgress", value: null });
      dispatch({ type: "setBusy", value: false });
    }
  }, [applyMeter, cachePut, checkDest, resampleOptions, setStatus]);

  const loupeFrame = useCallback(() => {
    const s = stateRef.current;
    const point = loupePointRef.current;
    const kernelId = s.viewMode === "versus" ? (point.side === "a" ? s.versusA : s.versusB) : s.kernel;
    const fullKey = `full|${kernelFingerprint(s, kernelId)}`;
    const cached = versusCacheRef.current.get(fullKey);
    if (cached && cached.width === s.destW) return { image: cached, isFull: true };
    if (kernelId === s.kernel && fullResultRef.current && fullResultRef.current.width === s.destW) {
      return { image: fullResultRef.current, isFull: true };
    }
    if (s.viewMode === "versus") {
      const frames = versusPixelsRef.current;
      const image = point.side === "a" ? frames?.a : frames?.b;
      if (image) return { image, isFull: image.width === s.destW };
    }
    const preview = previewPixelsRef.current;
    if (preview) return { image: preview, isFull: preview.width === s.destW };
    return null;
  }, []);

  const paintLoupe = useCallback(() => {
    const point = loupePointRef.current;
    const frame = loupeFrame();
    if (!frame) return false;
    previewRef.current?.showLoupe(cropAround(frame.image, point.x, point.y, LOUPE_SIZE));
    return frame.isFull;
  }, [loupeFrame]);

  const runLoupeRegion = useCallback(async () => {
    const s = stateRef.current;
    const client = clientRef.current;
    if (!s.hasSource || !client) return;
    if (destPixels(s.destW, s.destH) <= PREVIEW_FULL_MAX_PIXELS) return;
    const point = loupePointRef.current;
    const kernelId = s.viewMode === "versus" ? (point.side === "a" ? s.versusA : s.versusB) : s.kernel;
    const size = Math.min(LOUPE_SIZE, s.destW, s.destH);
    const x = Math.max(0, Math.min(s.destW - size, Math.round(point.x * s.destW - size / 2)));
    const y = Math.max(0, Math.min(s.destH - size, Math.round(point.y * s.destH - size / 2)));
    try {
      const result = await client.resample(
        resampleOptions({
          kernelId,
          kind: "loupe",
          region: { x, y, w: size, h: size },
        }),
      );
      const latest = loupePointRef.current;
      if (latest.x !== point.x || latest.y !== point.y || latest.side !== point.side) return;
      previewRef.current?.showLoupe(toImageData(result));
    } catch (error) {
      if (!isAbortError(error)) setStatus(statusFromError(error), "error");
    }
  }, [resampleOptions, setStatus]);

  const scheduleLoupe = useCallback(
    (nx: number, ny: number, side: "a" | "b") => {
      loupePointRef.current = { x: nx, y: ny, side };
      if (loupeRaf.current) return;
      loupeRaf.current = requestAnimationFrame(() => {
        loupeRaf.current = 0;
        const isFull = paintLoupe();
        window.clearTimeout(loupeTimer.current);
        if (isFull) return;
        loupeTimer.current = window.setTimeout(() => {
          void runLoupeRegion();
        }, LOUPE_DEBOUNCE_MS);
      });
    },
    [paintLoupe, runLoupeRegion],
  );

  const runGrid = useCallback(async () => {
    const s = stateRef.current;
    const client = clientRef.current;
    if (!s.hasSource || !client || !checkDest()) return;
    previewRef.current?.clearGrid();
    const size = Math.min(280, s.destW, s.destH);
    const region = {
      x: Math.max(0, Math.floor((s.destW - size) / 2)),
      y: Math.max(0, Math.floor((s.destH - size) / 2)),
      w: size,
      h: size,
    };
    try {
      dispatch({ type: "setBusy", value: true });
      setStatus({ key: "status.gridRunning" });
      for (let i = 0; i < KERNEL_IDS.length; i += 1) {
        const id = KERNEL_IDS[i];
        setStatus({ key: "status.gridItem", params: { id, i: i + 1, n: KERNEL_IDS.length } });
        const result = await client.resample(
          resampleOptions({ kernelId: id, kind: "grid", region }),
          (value) => dispatch({ type: "setProgress", value: (i + value) / KERNEL_IDS.length }),
        );
        previewRef.current?.paintGrid(id, toImageData(result));
      }
      setStatus({ key: "status.gridDone" });
    } catch (error) {
      if (!isAbortError(error)) setStatus(statusFromError(error), "error");
    } finally {
      dispatch({ type: "setProgress", value: null });
      dispatch({ type: "setBusy", value: false });
    }
  }, [checkDest, resampleOptions, setStatus]);

  const scheduleWork = useCallback(() => {
    window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => {
      const mode = stateRef.current.viewMode;
      if (mode === "grid") void runGrid();
      else if (mode === "versus") void runVersus();
      else void runPreview();
    }, DEBOUNCE_MS);
  }, [runGrid, runPreview, runVersus]);

  const loadFile = useCallback(
    async (file: File, options: OpenOptions = {}) => {
      if (!isSupportedFile(file)) {
        setStatus({ key: "error.unsupported_type" }, "error");
        return;
      }
      const client = clientRef.current;
      if (!client) return;
      const manageBusy = !options.keepBusy;
      try {
        if (manageBusy) dispatch({ type: "setBusy", value: true });
        setStatus({ key: "status.reading" });
        if (options.kernel) dispatch({ type: "setKernel", kernel: options.kernel });
        const decoded = await decodeFile(file);
        sourceRefs.current.display?.close();
        client.setSource(decoded.imageData);
        sourceRefs.current.display = decoded.display;
        sourceRefs.current.passport = decoded.passport;
        fullResultRef.current = null;
        fullFingerprintRef.current = "";
        versusCacheRef.current.clear();
        historyRef.current = [];
        redoRef.current = [];
        syncHistory();
        const scale = options.scale ? options.scale / 100 : currentScale(stateRef.current);
        const dest = destForSource(stateRef.current, decoded.width, decoded.height, scale);
        dispatch({
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
        previewRef.current?.resetView();
        setStatus({
          key: decoded.isGif ? "status.loadedGif" : "status.loaded",
          params: {
            w: decoded.width,
            h: decoded.height,
            kb: (file.size / 1024).toFixed(0),
          },
        });
      } catch (error) {
        setStatus(error instanceof AppError ? statusFromError(error) : { key: "error.read_failed" }, "error");
      } finally {
        if (manageBusy) dispatch({ type: "setBusy", value: false });
      }
    },
    [setStatus, syncHistory],
  );

  const loadQueue = useCallback(
    async (files: File[], options: OpenOptions = {}) => {
      const supported = files.filter(isSupportedFile);
      if (!supported.length) {
        setStatus({ key: "error.unsupported_type" }, "error");
        return;
      }
      if (supported.length > MAX_BATCH) {
        setStatus({ key: "error.batch_too_large", params: { max: MAX_BATCH } }, "error");
        return;
      }
      queueRef.current = supported;
      dispatch({ type: "setQueue", names: supported.map((file) => file.name), index: 0 });
      await loadFile(supported[0], options);
    },
    [loadFile, setStatus],
  );

  const openIndex = useCallback(
    async (index: number) => {
      const file = queueRef.current[index];
      if (!file) return;
      dispatch({ type: "setQueueIndex", index });
      await loadFile(file);
    },
    [loadFile],
  );

  const clearStage = useCallback(() => {
    sourceRefs.current.display?.close();
    sourceRefs.current.display = null;
    sourceRefs.current.passport = EMPTY_PASSPORT;
    fullResultRef.current = null;
    fullFingerprintRef.current = "";
    previewPixelsRef.current = null;
    versusPixelsRef.current = null;
    versusCacheRef.current.clear();
    historyRef.current = [];
    redoRef.current = [];
    queueRef.current = [];
    window.cancelAnimationFrame(loupeRaf.current);
    loupeRaf.current = 0;
    window.clearTimeout(loupeTimer.current);
    syncHistory();
    previewRef.current?.showLoupe(null);
    dispatch({ type: "clearSource" });
  }, [syncHistory]);

  const removeQueue = useCallback(
    async (index: number) => {
      const files = queueRef.current.slice();
      if (!files[index]) return;
      const current = stateRef.current.queueIndex;
      files.splice(index, 1);
      queueRef.current = files;
      if (!files.length) {
        clearStage();
        return;
      }
      let nextIndex = current;
      if (index < current) nextIndex = current - 1;
      else if (index === current) nextIndex = Math.min(index, files.length - 1);
      dispatch({ type: "setQueue", names: files.map((file) => file.name), index: nextIndex });
      if (index === current) await loadFile(files[nextIndex]);
    },
    [clearStage, loadFile],
  );

  const openFile = useCallback(() => fileInputRef.current?.click(), []);

  const loadSample = useCallback(
    async (id: SampleId) => {
      const sample = SAMPLE_FILES.find((item) => item.id === id);
      if (!sample) return;
      try {
        const response = await fetch(withBase(`/samples/${sample.file}`));
        if (!response.ok) throw new Error("sample");
        const blob = await response.blob();
        const file = new File([blob], sample.file, { type: sample.mime });
        await loadQueue([file], { kernel: sample.kernel, scale: sample.scale });
      } catch {
        setStatus({ key: "error.read_failed" }, "error");
      }
    },
    [loadQueue, setStatus],
  );

  const exportEncoded = useCallback(async (imageData: ImageData, fileName: string, sourceMime: string) => {
    const s = stateRef.current;
    const mime = formatToMime(s.exportFormat, sourceMime);
    const raw = await encodeImageData(imageData, mime, s.quality);
    const passport = sourceRefs.current.passport;
    const withPass = await attachPassport(raw, mime, passport, imageData.width, imageData.height);
    const blob = await attachIcc(withPass, mime, passport.iccKind, passport.icc);
    const name = `${stemFromName(fileName)}-${imageData.width}x${imageData.height}-${s.kernel}.${extensionForMime(mime)}`;
    return { blob, name, mime };
  }, []);

  const exportResult = useCallback(async () => {
    const s = stateRef.current;
    const client = clientRef.current;
    if (!s.hasSource || !client || !checkDest()) return;
    const fp = settingsFingerprint(s);
    try {
      dispatch({ type: "setBusy", value: true });
      setStatus({ key: "status.exportFull" });
      let imageData = fullResultRef.current && fullFingerprintRef.current === fp ? fullResultRef.current : null;
      if (!imageData) {
        const result = await client.resample(resampleOptions({ kind: "full" }), (value) =>
          dispatch({ type: "setProgress", value }),
        );
        imageData = toImageData(result);
        fullResultRef.current = imageData;
        fullFingerprintRef.current = fp;
      }
      setStatus({ key: "status.encoding" });
      const { blob, name } = await exportEncoded(imageData, s.sourceName, s.sourceMime);
      downloadBlob(blob, name);
      setStatus({ key: "status.saved", params: { name, kb: (blob.size / 1024).toFixed(0) } });
    } catch (error) {
      if (!isAbortError(error)) setStatus(statusFromError(error), "error");
    } finally {
      dispatch({ type: "setProgress", value: null });
      dispatch({ type: "setBusy", value: false });
    }
  }, [checkDest, exportEncoded, resampleOptions, setStatus]);

  const exportAll = useCallback(async () => {
    const files = queueRef.current;
    const client = clientRef.current;
    if (!files.length || !client) {
      await exportResult();
      return;
    }
    if (files.length === 1) {
      await exportResult();
      return;
    }
    const s = stateRef.current;
    const scale = currentScale(s);
    try {
      dispatch({ type: "setBusy", value: true });
      setStatus({ key: "status.batchExport" });
      const entries: { name: string; data: Uint8Array }[] = [];
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        setStatus({ key: "status.batchItem", params: { i: i + 1, n: files.length, name: file.name } });
        const decoded = await decodeFile(file);
        const dest = destForSource(s, decoded.width, decoded.height, scale);
        const verdict = validateDest(dest.width, dest.height);
        if (!verdict.ok && verdict.code) {
          decoded.display.close();
          setStatus(statusFromError(new AppError(verdict.code, verdict.params)), "error");
          const current = files[stateRef.current.queueIndex] ?? files[0];
          if (current) await loadFile(current, { keepBusy: true });
          return;
        }
        client.setSource(decoded.imageData);
        sourceRefs.current.passport = decoded.passport;
        const result = await client.resample(
          resampleOptions({ destW: dest.width, destH: dest.height, kind: "full" }),
          (value) => dispatch({ type: "setProgress", value: (i + value) / files.length }),
        );
        decoded.display.close();
        const imageData = toImageData(result);
        const { blob, name } = await exportEncoded(imageData, file.name, decoded.mime);
        entries.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      const zip = zipStore(entries);
      const archive = `photonic-batch-${s.kernel}.zip`;
      downloadBlob(new Blob([new Uint8Array(zip)], { type: "application/zip" }), archive);
      setStatus({ key: "status.batchSaved", params: { name: archive, n: files.length } });
      const current = files[stateRef.current.queueIndex] ?? files[0];
      if (current) await loadFile(current, { keepBusy: true });
    } catch (error) {
      if (!isAbortError(error)) setStatus(statusFromError(error), "error");
    } finally {
      dispatch({ type: "setProgress", value: null });
      dispatch({ type: "setBusy", value: false });
    }
  }, [exportEncoded, exportResult, loadFile, resampleOptions, setStatus]);

  const exportEach = useCallback(async () => {
    const files = queueRef.current;
    const client = clientRef.current;
    if (!files.length || !client) {
      await exportResult();
      return;
    }
    if (files.length === 1) {
      await exportResult();
      return;
    }
    const s = stateRef.current;
    const scale = currentScale(s);
    try {
      dispatch({ type: "setBusy", value: true });
      setStatus({ key: "status.batchExport" });
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        setStatus({ key: "status.batchItem", params: { i: i + 1, n: files.length, name: file.name } });
        const decoded = await decodeFile(file);
        const dest = destForSource(s, decoded.width, decoded.height, scale);
        const verdict = validateDest(dest.width, dest.height);
        if (!verdict.ok && verdict.code) {
          decoded.display.close();
          setStatus(statusFromError(new AppError(verdict.code, verdict.params)), "error");
          const current = files[stateRef.current.queueIndex] ?? files[0];
          if (current) await loadFile(current, { keepBusy: true });
          return;
        }
        client.setSource(decoded.imageData);
        sourceRefs.current.passport = decoded.passport;
        const result = await client.resample(
          resampleOptions({ destW: dest.width, destH: dest.height, kind: "full" }),
          (value) => dispatch({ type: "setProgress", value: (i + value) / files.length }),
        );
        decoded.display.close();
        const imageData = toImageData(result);
        const { blob, name } = await exportEncoded(imageData, file.name, decoded.mime);
        downloadBlob(blob, name);
        if (i < files.length - 1) await sleep(450);
      }
      setStatus({ key: "status.savedEach", params: { n: files.length } });
      const current = files[stateRef.current.queueIndex] ?? files[0];
      if (current) await loadFile(current, { keepBusy: true });
    } catch (error) {
      if (!isAbortError(error)) setStatus(statusFromError(error), "error");
    } finally {
      dispatch({ type: "setProgress", value: null });
      dispatch({ type: "setBusy", value: false });
    }
  }, [exportEncoded, exportResult, loadFile, resampleOptions, setStatus]);

  const copyRecipe = useCallback(async () => {
    const s = stateRef.current;
    const recipe = recipeFromSettings(s, s.recipeScale ?? 100);
    const url = `${window.location.origin}${withBase("/")}#${serializeRecipe(recipe)}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus({ key: "status.recipeCopied" });
    } catch {
      setStatus({ key: "error.unknown" }, "error");
    }
  }, [setStatus]);

  const onKernel = useCallback((id: KernelId) => {
    if (stateRef.current.kernel === id) return;
    pushHistory();
    dispatch({ type: "setKernel", kernel: id });
  }, [pushHistory]);

  const onDestChange = useCallback((width: number, height: number, paper?: { width: number; height: number } | null) => {
    pushHistory();
    dispatch({ type: "setDest", width, height });
    if (paper) dispatch({ type: "setPaper", width: paper.width, height: paper.height });
    else dispatch({ type: "setPaper", width: null, height: null });
  }, [pushHistory]);

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) {
      setStatus({ key: "status.nothingToUndo" });
      return;
    }
    redoRef.current.push({
      snap: snapshotSettings(stateRef.current),
      result: fullResultRef.current,
      fingerprint: fullFingerprintRef.current,
    });
    dispatch({ type: "applySnap", snap: prev.snap });
    fullResultRef.current = prev.result;
    fullFingerprintRef.current = prev.fingerprint;
    syncHistory();
    setStatus({ key: "status.undone" });
  }, [setStatus, syncHistory]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) {
      setStatus({ key: "status.nothingToRedo" });
      return;
    }
    historyRef.current.push({
      snap: snapshotSettings(stateRef.current),
      result: fullResultRef.current,
      fingerprint: fullFingerprintRef.current,
    });
    dispatch({ type: "applySnap", snap: next.snap });
    fullResultRef.current = next.result;
    fullFingerprintRef.current = next.fingerprint;
    syncHistory();
    setStatus({ key: "status.redone" });
  }, [setStatus, syncHistory]);

  useEffect(() => {
    scheduleWork();
  }, [
    state.kernel,
    state.lanczosA,
    state.destW,
    state.destH,
    state.colorSpace,
    state.unsharpEnabled,
    state.unsharpAmount,
    state.unsharpRadius,
    state.viewMode,
    state.versusA,
    state.versusB,
    state.hasSource,
    scheduleWork,
  ]);

  useEffect(() => {
    return bindHotkeys({
      onSave: () => {
        void exportResult();
      },
      onUndo: undo,
      onRedo: redo,
      onOpen: openFile,
      onKernel,
      onZoom: (factor) => previewRef.current?.zoomBy(factor),
      onHoldOriginal: (hold) => dispatch({ type: "setHoldOriginal", value: hold }),
    });
  }, [exportResult, onKernel, openFile, redo, undo]);

  useEffect(() => {
    bindFileLaunch((files) => {
      void loadQueue(files);
    });
    const unbindShare = bindShareInbox((files) => {
      void loadQueue(files);
    });
    const activate = () => dispatch({ type: "setDragOver", value: true });
    const deactivate = () => dispatch({ type: "setDragOver", value: false });
    const onDragOver = (event: DragEvent) => {
      event.preventDefault();
      activate();
    };
    const onDragLeave = (event: DragEvent) => {
      if (event.relatedTarget === null) deactivate();
    };
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      deactivate();
      const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
      if (files.length) void loadQueue(files);
    };
    const onPaste = (event: ClipboardEvent) => {
      const files = event.clipboardData?.files ? Array.from(event.clipboardData.files) : [];
      if (files.length) void loadQueue(files);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      unbindShare();
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, [loadQueue]);

  useEffect(() => {
    dispatch({ type: "setIosInstall", value: isIosSafari() && !isStandalone() });
    return bindInstallPrompt((available) => {
      dispatch({ type: "setInstallReady", value: available });
    });
  }, []);

  return (
    <AppStateContext.Provider value={{ state, dispatch }}>
      <div className={state.hasSource ? "app has-source" : "app"}>
        <Mast />
        <main className="bench">
          <KernelRail onKernel={onKernel} />
          <section className="stage" aria-label={t(state.locale, "stage.aria")}>
            <div
              className={state.dragOver ? "preview-frame is-drag" : "preview-frame"}
              onPointerDown={(event) => {
                if (state.hasSource) return;
                emptyTapRef.current = { x: event.clientX, y: event.clientY, moved: false };
              }}
              onPointerMove={(event) => {
                if (state.hasSource || emptyTapRef.current.moved) return;
                if (Math.hypot(event.clientX - emptyTapRef.current.x, event.clientY - emptyTapRef.current.y) > 12) {
                  emptyTapRef.current.moved = true;
                }
              }}
              onClick={(event) => {
                if (state.hasSource || emptyTapRef.current.moved) return;
                if (event.target instanceof Element && event.target.closest("button")) return;
                openFile();
              }}
            >
              <Preview
                ref={previewRef}
                hasSource={state.hasSource}
                viewMode={state.viewMode}
                kernel={state.kernel}
                versusA={state.versusA}
                versusB={state.versusB}
                holdOriginal={state.holdOriginal}
                onViewMode={(mode: ViewMode) => dispatch({ type: "setViewMode", value: mode })}
                onVersusKernel={(side, id) => dispatch({ type: "setVersus", side, kernel: id })}
                onLoupePoint={scheduleLoupe}
                onOpen={openFile}
                onSample={(id) => void loadSample(id)}
                onHoldOriginal={(hold) => dispatch({ type: "setHoldOriginal", value: hold })}
              />
            </div>
          </section>
          <Enlarger
            beforeChange={pushHistory}
            onDestChange={onDestChange}
            onOpen={openFile}
            onExport={() => void exportResult()}
            onExportAll={() => void exportAll()}
            onExportEach={() => void exportEach()}
            onCopyRecipe={() => void copyRecipe()}
            onQueueIndex={(index) => void openIndex(index)}
            onQueueRemove={(index) => void removeQueue(index)}
            onUndo={undo}
            onRedo={redo}
            onInstall={() => {
              void promptInstall().then((ok) => {
                if (ok) dispatch({ type: "setInstallReady", value: false });
              });
            }}
          />
        </main>
        <SiteNotes />
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept={acceptAttr()}
          multiple
          onChange={(event) => {
            const files = event.target.files ? Array.from(event.target.files) : [];
            event.target.value = "";
            if (files.length) void loadQueue(files);
          }}
        />
      </div>
    </AppStateContext.Provider>
  );
}
