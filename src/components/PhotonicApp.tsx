"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  DEBOUNCE_MS,
  KERNEL_IDS,
  LOUPE_SIZE,
  OVERVIEW_MAX_SIDE,
  PREVIEW_FULL_MAX_PIXELS,
  type KernelId,
  type ViewMode,
} from "@/lib/config";
import { AppError } from "@/lib/errors";
import { acceptAttr, decodeFile, isSupportedFile } from "@/lib/io/decode";
import { downloadBlob, encodeImageData, extensionForMime, formatToMime, stemFromName } from "@/lib/io/encode";
import { destPixels, fitInside, megapixels, validateDest } from "@/lib/limits";
import { isAbortError, ResampleClient, type ResampleResult } from "@/lib/resample/client";
import { bindHotkeys } from "@/lib/hotkeys";
import { statusFromError, t, type StatusMsg } from "@/lib/i18n";
import {
  hydrateSettings,
  reducer,
  settingsFingerprint,
  snapshotSettings,
  type SettingsSnap,
  type UiState,
} from "@/lib/app-state";
import { loadSettings, saveSettings } from "@/lib/storage";
import { bindFileLaunch, registerServiceWorker } from "@/lib/pwa";
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
};

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
  };
}

export function PhotonicApp() {
  const [state, dispatch] = useReducer(reducer, null, () => hydrateSettings(loadSettings()));
  const stateRef = useRef(state);
  stateRef.current = state;

  const clientRef = useRef<ResampleClient | null>(null);
  const previewRef = useRef<PreviewHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceRefs = useRef<SourceRefs>({ display: null });
  const fullResultRef = useRef<ImageData | null>(null);
  const fullFingerprintRef = useRef("");
  const historyRef = useRef<HistoryEntry[]>([]);
  const previewTimer = useRef(0);
  const loupeTimer = useRef(0);

  const setStatus = useCallback((status: StatusMsg, kind?: UiState["statusKind"]) => {
    dispatch({ type: "setStatus", status, kind });
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
  }, []);

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
      previewRef.current?.showLoupe(null);
      dispatch({ type: "setOverview", value: false });
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
      dispatch({ type: "setOverview", value: overview });
      if (overview) scheduleLoupe();
      else previewRef.current?.showLoupe(null);
      const mp = megapixels(s.destW, s.destH).toFixed(2);
      setStatus({ key: "status.dims", params: { w: s.destW, h: s.destH, mp, kernel: s.kernel } });
    } catch (error) {
      if (!isAbortError(error)) setStatus(statusFromError(error), "error");
    } finally {
      dispatch({ type: "setProgress", value: null });
      dispatch({ type: "setBusy", value: false });
    }
  }, [checkDest, resampleOptions, setStatus]);

  const runLoupe = useCallback(async () => {
    const s = stateRef.current;
    const client = clientRef.current;
    if (!s.hasSource || !client || destPixels(s.destW, s.destH) <= PREVIEW_FULL_MAX_PIXELS) return;
    const center = previewRef.current?.destCenter() ?? { x: 0.5, y: 0.5 };
    const size = Math.min(LOUPE_SIZE, s.destW, s.destH);
    const x = Math.max(0, Math.min(s.destW - size, Math.round(center.x * s.destW - size / 2)));
    const y = Math.max(0, Math.min(s.destH - size, Math.round(center.y * s.destH - size / 2)));
    try {
      const result = await client.resample(
        resampleOptions({
          kind: "loupe",
          region: { x, y, w: size, h: size },
        }),
      );
      previewRef.current?.showLoupe(toImageData(result));
    } catch (error) {
      if (!isAbortError(error)) setStatus(statusFromError(error), "error");
    }
  }, [resampleOptions, setStatus]);

  function scheduleLoupe() {
    window.clearTimeout(loupeTimer.current);
    loupeTimer.current = window.setTimeout(() => {
      void runLoupe();
    }, 160);
  }

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
      if (stateRef.current.viewMode === "grid") void runGrid();
      else void runPreview();
    }, DEBOUNCE_MS);
  }, [runGrid, runPreview]);

  const loadFile = useCallback(
    async (file: File) => {
      if (!isSupportedFile(file)) {
        setStatus({ key: "error.unsupported_type" }, "error");
        return;
      }
      const client = clientRef.current;
      if (!client) return;
      try {
        dispatch({ type: "setBusy", value: true });
        setStatus({ key: "status.reading" });
        const decoded = await decodeFile(file);
        sourceRefs.current.display?.close();
        client.setSource(decoded.imageData);
        sourceRefs.current.display = decoded.display;
        fullResultRef.current = null;
        fullFingerprintRef.current = "";
        historyRef.current = [];
        dispatch({
          type: "setSource",
          width: decoded.width,
          height: decoded.height,
          name: decoded.name,
          mime: decoded.mime,
          isGif: decoded.isGif,
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
        dispatch({ type: "setBusy", value: false });
      }
    },
    [setStatus],
  );

  const openFile = useCallback(() => fileInputRef.current?.click(), []);

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
      const mime = formatToMime(s.exportFormat, s.sourceMime);
      setStatus({ key: "status.encoding" });
      const blob = await encodeImageData(imageData, mime, s.quality);
      const name = `${stemFromName(s.sourceName)}-${s.destW}x${s.destH}-${s.kernel}.${extensionForMime(mime)}`;
      downloadBlob(blob, name);
      setStatus({ key: "status.saved", params: { name, kb: (blob.size / 1024).toFixed(0) } });
    } catch (error) {
      if (!isAbortError(error)) setStatus(statusFromError(error), "error");
    } finally {
      dispatch({ type: "setProgress", value: null });
      dispatch({ type: "setBusy", value: false });
    }
  }, [checkDest, resampleOptions, setStatus]);

  const onKernel = useCallback((id: KernelId) => {
    if (stateRef.current.kernel === id) return;
    pushHistory();
    dispatch({ type: "setKernel", kernel: id });
  }, [pushHistory]);

  const onDestChange = useCallback((width: number, height: number) => {
    pushHistory();
    dispatch({ type: "setDest", width, height });
  }, [pushHistory]);

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
    state.hasSource,
    scheduleWork,
  ]);

  useEffect(() => {
    return bindHotkeys({
      onSave: () => {
        void exportResult();
      },
      onUndo: () => {
        const prev = historyRef.current.pop();
        if (!prev) {
          setStatus({ key: "status.nothingToUndo" });
          return;
        }
        dispatch({ type: "applySnap", snap: prev.snap });
        fullResultRef.current = prev.result;
        fullFingerprintRef.current = prev.fingerprint;
        setStatus({ key: "status.undone" });
      },
      onOpen: openFile,
      onKernel,
      onZoom: (factor) => previewRef.current?.zoomBy(factor),
      onHoldOriginal: (hold) => dispatch({ type: "setHoldOriginal", value: hold }),
    });
  }, [exportResult, onKernel, openFile, setStatus]);

  useEffect(() => {
    const take = (file: File | undefined) => {
      if (file) void loadFile(file);
    };
    bindFileLaunch((file) => take(file));
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
      take(event.dataTransfer?.files?.[0]);
    };
    const onPaste = (event: ClipboardEvent) => {
      take(event.clipboardData?.files?.[0]);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, [loadFile]);

  return (
    <AppStateContext.Provider value={{ state, dispatch }}>
      <div className="app">
        <Mast />
        <main className="bench">
          <KernelRail onKernel={onKernel} />
          <section className="stage" aria-label={t(state.locale, "stage.aria")}>
            <div
              className={state.dragOver ? "preview-frame is-drag" : "preview-frame"}
              onClick={() => {
                if (!state.hasSource) openFile();
              }}
            >
              <Preview
                ref={previewRef}
                hasSource={state.hasSource}
                viewMode={state.viewMode}
                kernel={state.kernel}
                holdOriginal={state.holdOriginal}
                onViewMode={(mode: ViewMode) => dispatch({ type: "setViewMode", value: mode })}
                onLoupe={scheduleLoupe}
                onOpen={openFile}
              />
            </div>
          </section>
          <Enlarger
            beforeChange={pushHistory}
            onDestChange={onDestChange}
            onOpen={openFile}
            onExport={() => void exportResult()}
          />
        </main>
        <SiteNotes />
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept={acceptAttr()}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void loadFile(file);
          }}
        />
      </div>
    </AppStateContext.Provider>
  );
}
