import type { ColorSpace, ExportFormat, KernelId, Locale, StatusKind, Theme, ViewMode } from "./config";
import type { StatusMsg } from "./i18n";
import type { IccKind } from "./io/icc";
import type { FrameMeter } from "./meter";
import type { PrintUnit } from "./print";
import { parseRecipe } from "./recipe";
import { DEFAULTS, type PersistableSettings } from "./storage";

export type UiState = PersistableSettings & {
  destW: number;
  destH: number;
  split: number;
  holdOriginal: boolean;
  status: StatusMsg;
  statusKind: StatusKind;
  busy: boolean;
  progress: number | null;
  hasSource: boolean;
  sourceWidth: number;
  sourceHeight: number;
  sourceName: string;
  sourceRevision: number;
  previewFingerprint: string;
  sourceMime: string;
  sourceIsGif: boolean;
  overview: boolean;
  dragOver: boolean;
  offline: boolean;
  recipeScale: number | null;
  queueNames: string[];
  queueIndex: number;
  hasExif: boolean;
  iccKind: IccKind;
  meter: FrameMeter | null;
  paperW: number | null;
  paperH: number | null;
  undoDepth: number;
  redoDepth: number;
  installReady: boolean;
  iosInstall: boolean;
  exporting: boolean;
  updateReady: boolean;
};

export type SettingsSnap = {
  destW: number;
  destH: number;
  kernel: KernelId;
  lanczosA: number;
  lockAspect: boolean;
  colorSpace: ColorSpace;
  unsharpEnabled: boolean;
  unsharpAmount: number;
  unsharpRadius: number;
  unsharpThreshold: number;
  dpi: number;
  printUnit: PrintUnit;
  paperW: number | null;
  paperH: number | null;
  exportFormat: ExportFormat;
  quality: number;
  jpegBackground: string;
  preserveMetadata: boolean;
};

export function settingsFingerprint(state: UiState) {
  return [
    state.destW,
    state.destH,
    state.kernel,
    state.lanczosA,
    state.colorSpace,
    state.unsharpEnabled,
    state.unsharpAmount,
    state.unsharpRadius,
    state.unsharpThreshold,
  ].join("|");
}

export function kernelFingerprint(state: UiState, kernelId: KernelId) {
  return [
    state.destW,
    state.destH,
    kernelId,
    state.lanczosA,
    (kernelId === "photonic" || kernelId === "photonic-tcr") ? "linear" : state.colorSpace,
    state.unsharpEnabled,
    state.unsharpAmount,
    state.unsharpRadius,
    state.unsharpThreshold,
  ].join("|");
}

export function snapshotSettings(state: UiState): SettingsSnap {
  return {
    destW: state.destW,
    destH: state.destH,
    kernel: state.kernel,
    lanczosA: state.lanczosA,
    lockAspect: state.lockAspect,
    colorSpace: state.colorSpace,
    unsharpEnabled: state.unsharpEnabled,
    unsharpAmount: state.unsharpAmount,
    unsharpRadius: state.unsharpRadius,
    unsharpThreshold: state.unsharpThreshold,
    dpi: state.dpi,
    printUnit: state.printUnit,
    paperW: state.paperW,
    paperH: state.paperH,
    exportFormat: state.exportFormat,
    quality: state.quality,
    jpegBackground: state.jpegBackground,
    preserveMetadata: state.preserveMetadata,
  };
}

export function createInitialState(): UiState {
  return {
    ...DEFAULTS,
    destW: 0,
    destH: 0,
    split: 0.5,
    holdOriginal: false,
    status: { key: "status.ready" },
    statusKind: "",
    busy: false,
    progress: null,
    hasSource: false,
    sourceWidth: 0,
    sourceHeight: 0,
    sourceName: "",
    sourceRevision: 0,
    previewFingerprint: "",
    sourceMime: "",
    sourceIsGif: false,
    overview: false,
    dragOver: false,
    offline: false,
    recipeScale: null,
    queueNames: [],
    queueIndex: 0,
    hasExif: false,
    iccKind: "none",
    meter: null,
    paperW: null,
    paperH: null,
    undoDepth: 0,
    redoDepth: 0,
    installReady: false,
    iosInstall: false,
    exporting: false,
    updateReady: false,
  };
}

export function hydrateSettings(saved: PersistableSettings): UiState {
  const base = { ...createInitialState(), ...saved };
  if (typeof window === "undefined") return base;
  const recipe = parseRecipe(window.location.hash);
  if (!recipe) return base;
  return {
    ...base,
    kernel: recipe.kernel ?? base.kernel,
    lanczosA: recipe.lanczosA ?? base.lanczosA,
    colorSpace: recipe.colorSpace ?? base.colorSpace,
    unsharpEnabled: recipe.unsharpEnabled ?? base.unsharpEnabled,
    unsharpAmount: recipe.unsharpAmount ?? base.unsharpAmount,
    unsharpRadius: recipe.unsharpRadius ?? base.unsharpRadius,
    unsharpThreshold: recipe.unsharpThreshold ?? base.unsharpThreshold,
    exportFormat: recipe.exportFormat ?? base.exportFormat,
    quality: recipe.quality ?? base.quality,
    lockAspect: recipe.lockAspect ?? base.lockAspect,
    recipeScale: recipe.scale ?? null,
    dpi: recipe.dpi ?? base.dpi,
    printUnit: recipe.printUnit ?? base.printUnit,
  };
}

export type Action =
  | { type: "hydrate"; saved: PersistableSettings }
  | { type: "setPreviewFingerprint"; value: string }
  | { type: "setExporting"; value: boolean }
  | { type: "setUpdateReady"; value: boolean }
  | { type: "setJpegBackground"; value: string }
  | { type: "setPreserveMetadata"; value: boolean }
  | { type: "setTheme"; theme: Theme }
  | { type: "setLocale"; locale: Locale }
  | { type: "setKernel"; kernel: KernelId }
  | { type: "setLanczosA"; value: number }
  | { type: "setDest"; width: number; height: number }
  | { type: "setLockAspect"; value: boolean }
  | { type: "setColorSpace"; value: ColorSpace }
  | { type: "setUnsharpEnabled"; value: boolean }
  | { type: "setUnsharpAmount"; value: number }
  | { type: "setUnsharpRadius"; value: number }
  | { type: "setExportFormat"; value: ExportFormat }
  | { type: "setQuality"; value: number }
  | { type: "setViewMode"; value: ViewMode }
  | { type: "setSplit"; value: number }
  | { type: "setHoldOriginal"; value: boolean }
  | { type: "setStatus"; status: StatusMsg; kind?: StatusKind }
  | { type: "setBusy"; value: boolean }
  | { type: "setProgress"; value: number | null }
  | { type: "setDragOver"; value: boolean }
  | { type: "setOverview"; value: boolean }
  | { type: "setOffline"; value: boolean }
  | {
      type: "setSource";
      width: number;
      height: number;
      name: string;
      mime: string;
      isGif: boolean;
      destW: number;
      destH: number;
      hasExif: boolean;
      iccKind: IccKind;
    }
  | { type: "clearSource" }
  | { type: "applySnap"; snap: SettingsSnap }
  | { type: "setRecipeScale"; value: number | null }
  | { type: "setQueue"; names: string[]; index: number }
  | { type: "setQueueIndex"; index: number }
  | { type: "setVersus"; side: "a" | "b"; kernel: KernelId }
  | { type: "setDpi"; value: number }
  | { type: "setPrintUnit"; value: PrintUnit }
  | { type: "setPaper"; width: number | null; height: number | null }
  | { type: "setMeter"; value: FrameMeter | null }
  | { type: "setHistory"; undo: number; redo: number }
  | { type: "setInstallReady"; value: boolean }
  | { type: "setIosInstall"; value: boolean };

export function reducer(state: UiState, action: Action): UiState {
  switch (action.type) {
    case "setPreviewFingerprint":
      return { ...state, previewFingerprint: action.value };
    case "setExporting":
      return { ...state, exporting: action.value };
    case "setUpdateReady":
      return { ...state, updateReady: action.value };
    case "setJpegBackground":
      return { ...state, jpegBackground: action.value };
    case "setPreserveMetadata":
      return { ...state, preserveMetadata: action.value };
    case "hydrate":
      return { ...state, ...action.saved };
    case "setTheme":
      return { ...state, theme: action.theme };
    case "setLocale":
      return { ...state, locale: action.locale };
    case "setKernel":
      return {
        ...state,
        kernel: action.kernel,
        colorSpace: action.kernel === "photonic" ? "linear" : state.colorSpace,
      };
    case "setLanczosA":
      return { ...state, lanczosA: action.value };
    case "setDest":
      return { ...state, destW: action.width, destH: action.height };
    case "setLockAspect":
      return { ...state, lockAspect: action.value };
    case "setColorSpace":
      return { ...state, colorSpace: action.value };
    case "setUnsharpEnabled":
      return { ...state, unsharpEnabled: action.value };
    case "setUnsharpAmount":
      return { ...state, unsharpAmount: action.value };
    case "setUnsharpRadius":
      return { ...state, unsharpRadius: action.value };
    case "setExportFormat":
      return { ...state, exportFormat: action.value };
    case "setQuality":
      return { ...state, quality: action.value };
    case "setViewMode":
      return { ...state, viewMode: action.value };
    case "setSplit":
      return { ...state, split: action.value };
    case "setHoldOriginal":
      return { ...state, holdOriginal: action.value };
    case "setStatus":
      return { ...state, status: action.status, statusKind: action.kind ?? "" };
    case "setBusy":
      return { ...state, busy: action.value };
    case "setProgress":
      return { ...state, progress: action.value };
    case "setDragOver":
      return { ...state, dragOver: action.value };
    case "setOverview":
      return { ...state, overview: action.value };
    case "setOffline":
      return { ...state, offline: action.value };
    case "setSource":
      return {
        ...state,
        hasSource: true,
        sourceRevision: state.sourceRevision + 1,
        previewFingerprint: "",
        sourceWidth: action.width,
        sourceHeight: action.height,
        sourceName: action.name,
        sourceMime: action.mime,
        sourceIsGif: action.isGif,
        destW: action.destW,
        destH: action.destH,
        overview: false,
        hasExif: action.hasExif,
        iccKind: action.iccKind,
        recipeScale: null,
        meter: null,
      };
    case "clearSource":
      return {
        ...state,
        hasSource: false,
        sourceWidth: 0,
        sourceHeight: 0,
        sourceName: "",
        sourceMime: "",
        sourceIsGif: false,
        destW: 0,
        destH: 0,
        overview: false,
        hasExif: false,
        iccKind: "none",
        recipeScale: null,
        meter: null,
        queueNames: [],
        queueIndex: 0,
        status: { key: "status.queueEmpty" },
        statusKind: "",
      };
    case "setRecipeScale":
      return { ...state, recipeScale: action.value };
    case "setQueue":
      return { ...state, queueNames: action.names, queueIndex: action.index };
    case "setQueueIndex":
      return { ...state, queueIndex: action.index };
    case "setVersus":
      return action.side === "a" ? { ...state, versusA: action.kernel } : { ...state, versusB: action.kernel };
    case "setDpi":
      return { ...state, dpi: action.value };
    case "setPrintUnit":
      return { ...state, printUnit: action.value };
    case "setPaper":
      return { ...state, paperW: action.width, paperH: action.height };
    case "setMeter":
      return { ...state, meter: action.value };
    case "setHistory":
      return { ...state, undoDepth: action.undo, redoDepth: action.redo };
    case "setInstallReady":
      return { ...state, installReady: action.value };
    case "setIosInstall":
      return { ...state, iosInstall: action.value };
    case "applySnap":
      return { ...state, ...action.snap };
    default:
      return state;
  }
}

export function previewIdentity(state: UiState) {
  return `${state.sourceRevision}|${settingsFingerprint(state)}|${state.viewMode}|${state.versusA}|${state.versusB}`;
}
