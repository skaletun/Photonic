import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { hydrateSettings, reducer, snapshotSettings } from "@/lib/app-state";
import { loadSettings, saveSettings } from "@/lib/storage";
import { ByteCache } from "@/lib/byte-cache";
import type { KernelId, StatusKind } from "@/lib/config";
import type { StatusMsg } from "@/lib/i18n";
import { ResampleClient } from "@/lib/resample/client";
import type { PreviewHandle } from "@/components/Preview";
import { bindHotkeys } from "@/lib/hotkeys";
import { bindFileLaunch, bindInstallPrompt, bindShareInbox, isIosSafari, isStandalone, registerServiceWorker } from "@/lib/pwa";
import { withBase } from "@/lib/base-path";
import { recipeFromSettings, serializeRecipe } from "@/lib/recipe";
import { loadPresets, savePresets, type StudioPreset } from "@/lib/presets";
import { EMPTY_PASSPORT, currentScale, type Runtime } from "./runtime";
import { useHistory } from "./useHistory";
import { useDocuments } from "./useDocuments";
import { usePreviewPipeline } from "./usePreviewPipeline";
import { useExports } from "./useExports";

export function useStudio() {
  const [state, dispatch] = useReducer(reducer, null, () => hydrateSettings(loadSettings()));
  const stateRef = useRef(state);
  useLayoutEffect(() => { stateRef.current = state; });
  const client = useRef<ResampleClient | null>(null);
  const preview = useRef<PreviewHandle | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const source = useRef<Runtime["source"]["current"]>({ display: null, passport: EMPTY_PASSPORT, version: 0 });
  const full = useRef<Runtime["full"]["current"]>({ image: null, fingerprint: "" });
  const operation = useRef<AbortController | null>(null);
  const previewImage = useRef<ImageData | null>(null);
  const [cache] = useState(() => new ByteCache<ImageData>());
  const status = useCallback((status: StatusMsg, kind?: StatusKind) => dispatch({ type: "setStatus", status, kind }), []);
  const runtime = useMemo<Runtime>(() => ({ state: stateRef, dispatch, client, preview, source, full, operation, previewImage, cache, status }), [cache, status]);
  const history = useHistory(runtime);
  const docs = useDocuments(runtime, history.clear);
  const { push: pushHistory, undo, redo } = history;
  const pipeline = usePreviewPipeline(runtime, state);
  const exports = useExports(runtime, docs.documentsRef, docs.mark);
  const { run: exportRun } = exports;
  const { add: addDocuments } = docs;
  const [presets, setPresets] = useState<StudioPreset[]>(loadPresets);
  const saved = JSON.stringify({ theme: state.theme, locale: state.locale, kernel: state.kernel, lanczosA: state.lanczosA,
    lockAspect: state.lockAspect, colorSpace: state.colorSpace, unsharpEnabled: state.unsharpEnabled, unsharpAmount: state.unsharpAmount,
    unsharpRadius: state.unsharpRadius, unsharpThreshold: state.unsharpThreshold, exportFormat: state.exportFormat, quality: state.quality,
    viewMode: state.viewMode, dpi: state.dpi, printUnit: state.printUnit, versusA: state.versusA, versusB: state.versusB,
    jpegBackground: state.jpegBackground, preserveMetadata: state.preserveMetadata });
  useEffect(() => { saveSettings(JSON.parse(saved)); }, [saved]);
  const dispose = useCallback(() => { operation.current?.abort(); source.current.display?.close(); cache.clear(); client.current = null; }, [cache]);
  useEffect(() => {
    const worker = new ResampleClient(); client.current = worker;
    return () => { worker.terminate(); dispose(); };
  }, [dispose]);
  useEffect(() => registerServiceWorker(available => dispatch({ type: "setUpdateReady", value: available })), []);
  useEffect(() => {
    const sync = () => dispatch({ type: "setOffline", value: !navigator.onLine });
    sync(); window.addEventListener("online", sync); window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);
  const openFile = useCallback(() => input.current?.click(), []);
  const onKernel = useCallback((kernel: KernelId) => {
    if (operation.current || stateRef.current.kernel === kernel) return;
    pushHistory(); dispatch({ type: "setKernel", kernel });
  }, [pushHistory]);
  const onDestChange = useCallback((width: number, height: number, paper?: { width: number; height: number } | null) => {
    if (operation.current) return;
    pushHistory(); dispatch({ type: "setDest", width, height });
    dispatch({ type: "setPaper", width: paper?.width ?? null, height: paper?.height ?? null });
  }, [pushHistory]);
  const copyRecipe = useCallback(async () => {
    const s = stateRef.current;
    const recipe = recipeFromSettings(s, currentScale(s) * 100);
    try { await navigator.clipboard.writeText(`${window.location.origin}${withBase("/")}#${serializeRecipe(recipe)}`); status({ key: "status.recipeCopied" }); }
    catch { status({ key: "error.unknown" }, "error"); }
  }, [status]);
  const savePreset = useCallback((name: string) => {
    const s = stateRef.current; if (!s.hasSource || !name.trim()) return;
    const next = [...presets, { id: crypto.randomUUID(), name: name.trim().slice(0, 60), settings: snapshotSettings(s), scale: currentScale(s),
      exportFormat: s.exportFormat, quality: s.quality, dpi: s.dpi, paperW: s.paperW, paperH: s.paperH, printUnit: s.printUnit }].slice(-20);
    if (!savePresets(next)) { status({ key: "studio.storageFailed" }, "warn"); return; }
    setPresets(next); status({ key: "studio.presetSaved" });
  }, [presets, status]);
  const applyPreset = useCallback((preset: StudioPreset) => {
    if (operation.current || !stateRef.current.hasSource) return;
    pushHistory(); dispatch({ type: "applySnap", snap: preset.settings });
    dispatch({ type: "setExportFormat", value: preset.exportFormat }); dispatch({ type: "setQuality", value: preset.quality });
    dispatch({ type: "setDpi", value: preset.dpi }); dispatch({ type: "setPrintUnit", value: preset.printUnit });
    dispatch({ type: "setPaper", width: preset.paperW, height: preset.paperH });
  }, [pushHistory]);
  const removePreset = useCallback((id: string) => { const next = presets.filter(item => item.id !== id); if (savePresets(next)) setPresets(next); }, [presets]);
  useEffect(() => bindHotkeys({ onSave: () => void exportRun("current"), onUndo: undo, onRedo: redo,
    onOpen: openFile, onKernel, onZoom: factor => preview.current?.zoomBy(factor), onHoldOriginal: value => dispatch({ type: "setHoldOriginal", value }) }),
    [exportRun, undo, redo, openFile, onKernel]);
  useEffect(() => {
    const add = (files: File[]) => void addDocuments(files);
    bindFileLaunch(add); const unbind = bindShareInbox(add);
    const over = (event: DragEvent) => { if (!event.dataTransfer?.types.includes("Files")) return; event.preventDefault(); dispatch({ type: "setDragOver", value: true }); };
    const leave = (event: DragEvent) => { if (!event.relatedTarget) dispatch({ type: "setDragOver", value: false }); };
    const drop = (event: DragEvent) => { event.preventDefault(); dispatch({ type: "setDragOver", value: false }); if (event.dataTransfer?.files.length) add(Array.from(event.dataTransfer.files)); };
    const paste = (event: ClipboardEvent) => { if (event.clipboardData?.files.length) { event.preventDefault(); add(Array.from(event.clipboardData.files)); } };
    window.addEventListener("dragover", over); window.addEventListener("dragleave", leave); window.addEventListener("drop", drop); window.addEventListener("paste", paste);
    return () => { unbind(); window.removeEventListener("dragover", over); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); window.removeEventListener("paste", paste); };
  }, [addDocuments]);
  useEffect(() => { dispatch({ type: "setIosInstall", value: isIosSafari() && !isStandalone() }); return bindInstallPrompt(value => dispatch({ type: "setInstallReady", value })); }, []);
  return { state, dispatch, runtime, history, docs, pipeline, exports, input, preview, openFile, onKernel, onDestChange,
    copyRecipe, presets, savePreset, applyPreset, removePreset };
}
