/** Лимиты памяти и превью. Canvas в десктопном Chrome держит ~268 Мп, Safari — меньше. */

export const ACCEPT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
  "image/x-windows-bmp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
] as const;

export const ACCEPT_EXT = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".bmp",
  ".gif",
  ".heic",
  ".heif",
  ".avif",
] as const;

export const KERNEL_IDS = [
  "photonic",
  "nearest",
  "bilinear",
  "bicubic",
  "lanczos",
  "sinc",
  "bspline",
] as const;

export type KernelId = (typeof KERNEL_IDS)[number];
export type FilterId = KernelId | "mitchell";
export type ColorSpace = "linear" | "srgb";
export type ViewMode = "split" | "side" | "grid" | "versus";
export type Theme = "dark" | "light";
export type Locale = "en" | "ru";
export type ExportFormat = "original" | "png" | "jpeg" | "webp";
export type StatusKind = "" | "error" | "warn";

export const PREVIEW_FULL_MAX_PIXELS = 8_000_000;
export const OVERVIEW_MAX_SIDE = 2048;
export const LOUPE_SIZE = 512;
export const WARN_MEGAPIXELS = 80;
export const HARD_MEGAPIXELS = 120;
export const MAX_SIDE = 16384;
export const MAX_AREA = 268_435_456;
export const MIN_PERCENT = 10;
export const MAX_PERCENT = 1000;
export const DEBOUNCE_MS = 220;
/** Пауза перед 1:1-регионом на кадрах крупнее превью. Сам кроп лупы идёт сразу. */
export const LOUPE_DEBOUNCE_MS = 100;

export function nextKernelId(id: KernelId): KernelId {
  const i = KERNEL_IDS.indexOf(id);
  return KERNEL_IDS[(i + 1) % KERNEL_IDS.length];
}

export const STORAGE_KEY = "photonic:v1";
export const BAND_ROWS = 24;
export const MAX_BATCH = 100;
