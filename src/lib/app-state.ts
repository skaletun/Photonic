import type { ColorSpace, ExportFormat, KernelId, Locale, StatusKind, Theme, ViewMode } from "./config";
import type { StatusMsg } from "./i18n";
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
  sourceMime: string;
  sourceIsGif: boolean;
  overview: boolean;
  dragOver: boolean;
  offline: boolean;
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
    sourceMime: "",
    sourceIsGif: false,
    overview: false,
    dragOver: false,
    offline: false,
  };
}

export function hydrateSettings(saved: PersistableSettings): UiState {
  return { ...createInitialState(), ...saved };
}

export type Action =
  | { type: "hydrate"; saved: PersistableSettings }
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
    }
  | { type: "applySnap"; snap: SettingsSnap };

export function reducer(state: UiState, action: Action): UiState {
  switch (action.type) {
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
        sourceWidth: action.width,
        sourceHeight: action.height,
        sourceName: action.name,
        sourceMime: action.mime,
        sourceIsGif: action.isGif,
        destW: action.width,
        destH: action.height,
        overview: false,
      };
    case "applySnap":
      return { ...state, ...action.snap };
    default:
      return state;
  }
}
