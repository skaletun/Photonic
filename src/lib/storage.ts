import type { ColorSpace, ExportFormat, KernelId, Locale, Theme, ViewMode } from "./config";
import { STORAGE_KEY } from "./config";
import { clampDpi, type PrintUnit } from "./print";

export type PersistableSettings = {
  theme: Theme;
  locale: Locale;
  kernel: KernelId;
  lanczosA: number;
  lockAspect: boolean;
  colorSpace: ColorSpace;
  unsharpEnabled: boolean;
  unsharpAmount: number;
  unsharpRadius: number;
  unsharpThreshold: number;
  exportFormat: ExportFormat;
  quality: number;
  viewMode: ViewMode;
  dpi: number;
  printUnit: PrintUnit;
  versusA: KernelId;
  versusB: KernelId;
};

export const DEFAULTS: PersistableSettings = {
  theme: "light",
  locale: "en",
  kernel: "photonic",
  lanczosA: 3,
  lockAspect: true,
  colorSpace: "linear",
  unsharpEnabled: false,
  unsharpAmount: 80,
  unsharpRadius: 0.6,
  unsharpThreshold: 2,
  exportFormat: "original",
  quality: 0.92,
  viewMode: "split",
  dpi: 300,
  printUnit: "in",
  versusA: "photonic",
  versusB: "lanczos",
};

export function isKernelId(value: unknown): value is KernelId {
  return (
    value === "photonic" ||
    value === "nearest" ||
    value === "bilinear" ||
    value === "bicubic" ||
    value === "lanczos" ||
    value === "sinc" ||
    value === "bspline"
  );
}

export function isViewMode(value: unknown): value is ViewMode {
  return value === "split" || value === "side" || value === "grid" || value === "versus";
}

export function isPrintUnit(value: unknown): value is PrintUnit {
  return value === "mm" || value === "in";
}

export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  return /^ru\b/i.test(navigator.language) ? "ru" : "en";
}

export function loadSettings(): PersistableSettings {
  const browserLocale = detectBrowserLocale();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULTS, locale: browserLocale, printUnit: browserLocale === "ru" ? "mm" : "in" };
    }
    const parsed = JSON.parse(raw) as Partial<PersistableSettings> & { settingsRev?: number };
    const kernel = isKernelId(parsed.kernel) ? parsed.kernel : DEFAULTS.kernel;
    const locale = parsed.locale === "en" || parsed.locale === "ru" ? parsed.locale : browserLocale;
    const rev = typeof parsed.settingsRev === "number" ? parsed.settingsRev : 0;
    const theme =
      rev >= 2 && (parsed.theme === "light" || parsed.theme === "dark") ? parsed.theme : DEFAULTS.theme;
    const viewMode = isViewMode(parsed.viewMode) ? parsed.viewMode : DEFAULTS.viewMode;
    const printUnit = isPrintUnit(parsed.printUnit) ? parsed.printUnit : locale === "ru" ? "mm" : "in";
    const dpi = typeof parsed.dpi === "number" ? clampDpi(parsed.dpi) : DEFAULTS.dpi;
    const versusA = isKernelId(parsed.versusA) ? parsed.versusA : DEFAULTS.versusA;
    const versusB = isKernelId(parsed.versusB) ? parsed.versusB : DEFAULTS.versusB;
    return {
      ...DEFAULTS,
      ...parsed,
      kernel,
      locale,
      theme,
      viewMode,
      printUnit,
      dpi,
      versusA,
      versusB,
    };
  } catch {
    return { ...DEFAULTS, locale: browserLocale, printUnit: browserLocale === "ru" ? "mm" : "in" };
  }
}

export function saveSettings(state: PersistableSettings) {
  const payload = {
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
    settingsRev: 2,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota or private mode — settings simply will not persist.
  }
}
