import type { KernelId } from "./config";

export function memoryBudget() {
  if (typeof navigator === "undefined") return 768 * 1024 * 1024;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const mobile =
    /iPhone|iPad|Android/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return (mobile || (memory !== undefined && memory <= 4) ? 256 : 768) * 1024 * 1024;
}

/**
 * Peak resident memory, not the sum of all phases.
 *
 * Decode: source ImageBitmap, canvas and ImageData coexist briefly.
 * Resample: the worker owns the source RGBA buffer, one output buffer and
 * (for Photonic upscaling) a source-resolution consistency-error field.
 * Encode: output ImageData, destination canvas and the encoder's backing
 * storage can coexist with the worker's source. The worker's strip scratch
 * is no longer live during encoding.
 *
 * These conservative estimates are heuristics, not a browser memory API.
 * Actual allocation errors still need to be caught at the call site.
 */
export function estimateWorkingBytes(srcW: number, srcH: number, destW: number, destH: number, kernel: KernelId) {
  const sourcePixels = srcW * srcH;
  const destPixels = destW * destH;
  const sourceRgba = sourcePixels * 4;
  const destRgba = destPixels * 4;
  const fixedOverhead = 16 * 1024 * 1024;
  const consistency =
    (kernel === "photonic" || kernel === "photonic-tcr") && destW >= srcW && destH >= srcH
      ? sourcePixels * 8
      : 0;
  const stripWorkspace = Math.max(srcW, destW) * 8192;

  const decodePeak = sourceRgba * 3 + fixedOverhead;
  const resamplePeak = sourceRgba + destRgba + consistency + stripWorkspace + fixedOverhead;
  const encodePeak = sourceRgba + destRgba * 3 + fixedOverhead;
  return Math.max(decodePeak, resamplePeak, encodePeak);
}
