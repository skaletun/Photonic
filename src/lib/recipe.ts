import type { ColorSpace, ExportFormat, KernelId } from "./config";
import { clampDpi, type PrintUnit } from "./print";
import { isKernelId, isPrintUnit } from "./storage";

export type Recipe = {
  kernel: KernelId;
  lanczosA: number;
  colorSpace: ColorSpace;
  unsharpEnabled: boolean;
  unsharpAmount: number;
  unsharpRadius: number;
  unsharpThreshold: number;
  exportFormat: ExportFormat;
  quality: number;
  lockAspect: boolean;
  scale: number;
  dpi: number;
  printUnit: PrintUnit;
};

const FORMATS: ExportFormat[] = ["original", "png", "jpeg", "webp"];

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function num(value: string | null, fallback: number) {
  if (value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function flag(value: string | null) {
  return value === "1" || value === "true";
}

export function parseRecipe(hash: string): Partial<Recipe> | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw.includes("=") ? raw : "");
  if (![...params.keys()].length) return null;

  const recipe: Partial<Recipe> = {};
  const kernel = params.get("k");
  if (kernel && isKernelId(kernel)) recipe.kernel = kernel;
  if (params.has("a")) recipe.lanczosA = clamp(Math.round(num(params.get("a"), 3)), 2, 4);
  const color = params.get("c");
  if (color === "linear" || color === "srgb") recipe.colorSpace = color;
  if (params.has("u")) recipe.unsharpEnabled = flag(params.get("u"));
  if (params.has("ua")) recipe.unsharpAmount = clamp(num(params.get("ua"), 80), 0, 200);
  if (params.has("ur")) recipe.unsharpRadius = clamp(num(params.get("ur"), 0.6), 0.4, 2.5);
  if (params.has("ut")) recipe.unsharpThreshold = clamp(num(params.get("ut"), 2), 0, 255);
  const format = params.get("f");
  if (format && (FORMATS as string[]).includes(format)) recipe.exportFormat = format as ExportFormat;
  if (params.has("q")) recipe.quality = clamp(num(params.get("q"), 92) / 100, 0.4, 1);
  if (params.has("l")) recipe.lockAspect = flag(params.get("l"));
  if (params.has("s")) recipe.scale = clamp(Math.round(num(params.get("s"), 100)), 10, 1000);
  if (params.has("dpi")) recipe.dpi = clampDpi(num(params.get("dpi"), 300));
  const printUnit = params.get("pu");
  if (printUnit && isPrintUnit(printUnit)) recipe.printUnit = printUnit;
  return Object.keys(recipe).length ? recipe : null;
}

export function serializeRecipe(recipe: Recipe) {
  const params = new URLSearchParams();
  params.set("k", recipe.kernel);
  params.set("a", String(recipe.lanczosA));
  params.set("c", recipe.colorSpace);
  params.set("u", recipe.unsharpEnabled ? "1" : "0");
  params.set("ua", String(Math.round(recipe.unsharpAmount)));
  params.set("ur", String(recipe.unsharpRadius));
  params.set("ut", String(Math.round(recipe.unsharpThreshold)));
  params.set("f", recipe.exportFormat);
  params.set("q", String(Math.round(recipe.quality * 100)));
  params.set("l", recipe.lockAspect ? "1" : "0");
  params.set("s", String(Math.round(recipe.scale)));
  params.set("dpi", String(recipe.dpi));
  params.set("pu", recipe.printUnit);
  return params.toString();
}

export function recipeFromSettings(
  settings: Omit<Recipe, "scale"> & { destW: number; destH: number; sourceWidth: number; hasSource: boolean },
  fallbackScale = 100,
) {
  const scale = settings.hasSource && settings.sourceWidth
    ? Math.round((settings.destW / settings.sourceWidth) * 100)
    : fallbackScale;
  return {
    kernel: settings.kernel,
    lanczosA: settings.lanczosA,
    colorSpace: settings.colorSpace,
    unsharpEnabled: settings.unsharpEnabled,
    unsharpAmount: settings.unsharpAmount,
    unsharpRadius: settings.unsharpRadius,
    unsharpThreshold: settings.unsharpThreshold,
    exportFormat: settings.exportFormat,
    quality: settings.quality,
    lockAspect: settings.lockAspect,
    scale: clamp(scale, 10, 1000),
    dpi: settings.dpi,
    printUnit: settings.printUnit,
  } satisfies Recipe;
}
