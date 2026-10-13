import { MAX_SIDE, KERNEL_IDS } from "./config";
import type { SettingsSnap } from "./app-state";
import type { PersistableSettings } from "./storage";
const KEY = "photonic:presets:v1";
export type StudioPreset = { id: string; name: string; settings: SettingsSnap; scale: number; exportFormat: PersistableSettings["exportFormat"]; quality: number; dpi: number; paperW: number | null; paperH: number | null; printUnit: PersistableSettings["printUnit"] };
export function loadPresets(): StudioPreset[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is StudioPreset => !!item && typeof item.id === "string" && typeof item.name === "string" && item.name.length <= 60 &&
      !!item.settings && KERNEL_IDS.includes(item.settings.kernel) && Number.isInteger(item.settings.destW) && item.settings.destW > 0 && item.settings.destW <= MAX_SIDE &&
      Number.isInteger(item.settings.destH) && item.settings.destH > 0 && item.settings.destH <= MAX_SIDE && Number.isFinite(item.scale) && item.scale > 0 &&
      ["original", "jpeg", "png", "webp"].includes(item.exportFormat) && Number.isFinite(item.quality) && item.quality >= 0.4 && item.quality <= 1 &&
      Number.isFinite(item.dpi) && item.dpi >= 72 && item.dpi <= 1200 && ["in", "mm"].includes(item.printUnit)).slice(0, 20);
  } catch { return []; }
}
export function savePresets(presets: StudioPreset[]) {
  try { localStorage.setItem(KEY, JSON.stringify(presets.slice(0, 20))); return true; } catch { return false; }
}
