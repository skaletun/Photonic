export type PrintUnit = "mm" | "in";

export const DPI_PRESETS = [300, 360, 600] as const;
export const MIN_DPI = 72;
export const MAX_DPI = 1200;

export const MM_PRESETS = [
  { w: 100, h: 150, label: "10×15" },
  { w: 150, h: 200, label: "15×20" },
  { w: 200, h: 300, label: "20×30" },
] as const;

export const IN_PRESETS = [
  { w: 4, h: 6, label: "4×6" },
  { w: 5, h: 7, label: "5×7" },
  { w: 8, h: 10, label: "8×10" },
] as const;

export function clampDpi(value: number) {
  if (!Number.isFinite(value)) return 300;
  return Math.min(MAX_DPI, Math.max(MIN_DPI, Math.round(value)));
}

export function mmToPx(mm: number, dpi: number) {
  return Math.max(1, Math.round((mm / 25.4) * dpi));
}

export function inToPx(inches: number, dpi: number) {
  return Math.max(1, Math.round(inches * dpi));
}

export function pxToMm(px: number, dpi: number) {
  if (dpi <= 0) return 0;
  return (px / dpi) * 25.4;
}

export function pxToIn(px: number, dpi: number) {
  if (dpi <= 0) return 0;
  return px / dpi;
}

export function paperToPx(width: number, height: number, unit: PrintUnit, dpi: number) {
  if (unit === "mm") return { width: mmToPx(width, dpi), height: mmToPx(height, dpi) };
  return { width: inToPx(width, dpi), height: inToPx(height, dpi) };
}

export function convertPaper(width: number, height: number, from: PrintUnit, to: PrintUnit) {
  if (from === to) return { width, height };
  if (from === "mm") return { width: width / 25.4, height: height / 25.4 };
  return { width: width * 25.4, height: height * 25.4 };
}

export function paperPresets(unit: PrintUnit) {
  return unit === "mm" ? MM_PRESETS : IN_PRESETS;
}

/**
 * lockAspect: contain the source in the paper rectangle.
 * Unlocked: dest is the paper pixel size (may stretch).
 */
export function fitInsidePaper(
  srcW: number,
  srcH: number,
  paperW: number,
  paperH: number,
  lockAspect: boolean,
) {
  const sheetW = Math.max(1, Math.round(paperW));
  const sheetH = Math.max(1, Math.round(paperH));
  if (!lockAspect || srcW <= 0 || srcH <= 0) {
    return { width: sheetW, height: sheetH };
  }
  const scale = Math.min(sheetW / srcW, sheetH / srcH);
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale)),
  };
}
