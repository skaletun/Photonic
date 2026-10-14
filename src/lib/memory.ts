import type { KernelId } from "./config";

export function memoryBudget() {
  if (typeof navigator === "undefined") return 768 * 1024 * 1024;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const mobile =
    /iPhone|iPad|Android/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return (mobile || (memory !== undefined && memory <= 4) ? 256 : 768) * 1024 * 1024;
}

/** Source, result, Canvas encoder and bounded algorithm workspace, in bytes. */
export function estimateWorkingBytes(srcW: number, srcH: number, destW: number, destH: number, kernel: KernelId) {
  const source = srcW * srcH;
  const dest = destW * destH;
  const consistency = (kernel === "photonic" || kernel === "photonic-tcr") && destW >= srcW && destH >= srcH ? source * 8 : 0;
  return source * 4 + dest * 16 + consistency + Math.max(srcW, destW) * 8192 + 16 * 1024 * 1024;
}
