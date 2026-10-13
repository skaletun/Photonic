import { MAX_SIDE, KERNEL_IDS } from "./config";
import type { SettingsSnap } from "./app-state";
import type { PersistableSettings } from "./storage";
const KEY = "photonic:presets:v1";
export type StudioPreset = {
  id: string;
  name: string;
  settings: SettingsSnap;
  scale: number;
  exportFormat: PersistableSettings["exportFormat"];
  quality: number;
  dpi: number;
  paperW: number | null;
  paperH: number | null;
  printUnit: PersistableSettings["printUnit"];
};
export function loadPresets(): StudioPreset[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (item): item is StudioPreset =>
          !!item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          item.name.length <= 60 &&
          !!item.settings &&
          KERNEL_IDS.includes(item.settings.kernel) &&
          typeof item.settings.lockAspect === "boolean" &&
          ["linear", "srgb"].includes(item.settings.colorSpace) &&
          Number.isFinite(item.settings.lanczosA) &&
          item.settings.lanczosA >= 2 &&
          item.settings.lanczosA <= 4 &&
          typeof item.settings.unsharpEnabled === "boolean" &&
          Number.isFinite(item.settings.unsharpAmount) &&
          item.settings.unsharpAmount >= 0 &&
          item.settings.unsharpAmount <= 200 &&
          Number.isFinite(item.settings.unsharpRadius) &&
          item.settings.unsharpRadius >= 0.4 &&
          item.settings.unsharpRadius <= 2.5 &&
          Number.isFinite(item.settings.unsharpThreshold) &&
          item.settings.unsharpThreshold >= 0 &&
          item.settings.unsharpThreshold <= 255 &&
          typeof item.settings.jpegBackground === "string" &&
          /^#[0-9a-f]{6}$/i.test(item.settings.jpegBackground) &&
          typeof item.settings.preserveMetadata === "boolean" &&
          Number.isInteger(item.settings.destW) &&
          item.settings.destW > 0 &&
          item.settings.destW <= MAX_SIDE &&
          Number.isInteger(item.settings.destH) &&
          item.settings.destH > 0 &&
          item.settings.destH <= MAX_SIDE &&
          Number.isFinite(item.scale) &&
          item.scale > 0 &&
          (item.paperW === null || (Number.isFinite(item.paperW) && item.paperW > 0)) &&
          (item.paperH === null || (Number.isFinite(item.paperH) && item.paperH > 0)) &&
          ["original", "jpeg", "png", "webp"].includes(item.exportFormat) &&
          Number.isFinite(item.quality) &&
          item.quality >= 0.4 &&
          item.quality <= 1 &&
          Number.isFinite(item.dpi) &&
          item.dpi >= 72 &&
          item.dpi <= 1200 &&
          ["in", "mm"].includes(item.printUnit),
      )
      .slice(0, 20);
  } catch {
    return [];
  }
}
export function savePresets(presets: StudioPreset[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(presets.slice(0, 20)));
    return true;
  } catch {
    return false;
  }
}
