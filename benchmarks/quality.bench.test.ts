import { expect, it } from "vitest";
import { resampleFrame, type SourceFrame } from "../src/lib/resample/engine";
import type { KernelId } from "../src/lib/config";

/**
 * Synthetic reconstruction microbenchmark, NOT a claim of superiority on real photos.
 * The same high-resolution reference is downsampled and then reconstructed with
 * each method. No network requests, image files, or external benchmark datasets.
 */
const SIDE = 192;
const LOW_SIDE = SIDE / 2;
const METHODS: KernelId[] = ["photonic", "photonic-tcr", "lanczos", "bicubic", "nearest"];
type Pattern = "photo-like" | "hard-edges" | "small-type" | "pixel-art";
const PATTERNS: Pattern[] = ["photo-like", "hard-edges", "small-type", "pixel-art"];

function patternFrame(pattern: Pattern): SourceFrame {
  const data = new Uint8ClampedArray(SIDE * SIDE * 4);
  for (let y = 0; y < SIDE; y++) {
    for (let x = 0; x < SIDE; x++) {
      const xx = x / SIDE;
      const yy = y / SIDE;
      const i = (y * SIDE + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      if (pattern === "photo-like") {
        const texture = 20 * Math.sin(x * 0.31) * Math.sin(y * 0.17);
        const detail = 15 * Math.sin((x + y) * 0.64);
        r = 35 + 170 * xx + texture;
        g = 38 + 150 * yy + texture * 0.8 + detail;
        b = 75 + 100 * (1 - xx) + detail;
      } else if (pattern === "hard-edges") {
        const block = (x > 36 && x < 158 && y > 39 && y < 151) || Math.abs(x - y) < 3;
        r = block ? 236 : 25;
        g = block ? 75 : 28;
        b = block ? 55 : 222;
      } else if (pattern === "small-type") {
        // Repeating thin glyph-like stems and crossbars at different widths.
        const stem = ((x - 9) % 22 + 22) % 22 < 3;
        const line = ((y - 8) % 27 + 27) % 27 < 3;
        const descender = x % 31 < 5 && y % 41 > 32;
        r = g = b = stem || (line && x % 8 < 5) || descender ? 15 : 245;
      } else {
        const tileX = Math.floor(x / 12);
        const tileY = Math.floor(y / 12);
        r = (tileX * 47 + tileY * 15) % 256;
        g = (tileX * 13 + tileY * 57) % 256;
        b = ((tileX ^ tileY) * 61) % 256;
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width: SIDE, height: SIDE, data };
}

async function resize(source: SourceFrame, width: number, height: number, kernelId: KernelId) {
  const data = await resampleFrame(source, {
    kernelId,
    destW: width,
    destH: height,
    colorSpace: "linear",
    a: 3,
    kind: "benchmark",
  });
  if (!data) throw new Error("Unexpected cancelled resample");
  return { width, height, data };
}

function score(reference: Uint8ClampedArray, actual: Uint8ClampedArray) {
  // RGB PSNR, and non-overlapping 8×8 local-window luma SSIM (not multiscale SSIM).
  let squaredError = 0;
  const refL = new Float64Array(SIDE * SIDE);
  const actL = new Float64Array(SIDE * SIDE);
  for (let i = 0; i < SIDE * SIDE; i++) {
    const j = i * 4;
    for (let c = 0; c < 3; c++) squaredError += (reference[j + c] - actual[j + c]) ** 2;
    refL[i] = 0.2126 * reference[j] + 0.7152 * reference[j + 1] + 0.0722 * reference[j + 2];
    actL[i] = 0.2126 * actual[j] + 0.7152 * actual[j + 1] + 0.0722 * actual[j + 2];
  }
  const mse = squaredError / (SIDE * SIDE * 3);
  const psnr = mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse);
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  let ssimTotal = 0;
  let windows = 0;
  for (let y0 = 0; y0 < SIDE; y0 += 8) {
    for (let x0 = 0; x0 < SIDE; x0 += 8) {
      let meanA = 0;
      let meanB = 0;
      let squareA = 0;
      let squareB = 0;
      let cross = 0;
      for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
          const i = (y0 + dy) * SIDE + x0 + dx;
          const a = refL[i];
          const b = actL[i];
          meanA += a;
          meanB += b;
          squareA += a * a;
          squareB += b * b;
          cross += a * b;
        }
      }
      meanA /= 64;
      meanB /= 64;
      const varA = Math.max(0, squareA / 64 - meanA * meanA);
      const varB = Math.max(0, squareB / 64 - meanB * meanB);
      const covariance = cross / 64 - meanA * meanB;
      ssimTotal +=
        ((2 * meanA * meanB + c1) * (2 * covariance + c2)) /
        ((meanA * meanA + meanB * meanB + c1) * (varA + varB + c2));
      windows++;
    }
  }
  return { psnr: Number(psnr.toFixed(3)), ssim: Number((ssimTotal / windows).toFixed(5)) };
}

it("prints comparable PSNR, local SSIM and execution time for deterministic 2× samples", async () => {
  const report: Array<{ pattern: Pattern; method: KernelId; psnr: number; ssim: number; ms: number }> = [];
  for (const pattern of PATTERNS) {
    const original = patternFrame(pattern);
    const reduced = await resize(original, LOW_SIDE, LOW_SIDE, "lanczos");
    for (const method of METHODS) {
      const start = performance.now();
      const reconstructed = await resize(reduced, SIDE, SIDE, method);
      const ms = Number((performance.now() - start).toFixed(1));
      const metrics = score(original.data, reconstructed.data);
      expect(Number.isFinite(metrics.psnr)).toBe(true);
      expect(Number.isFinite(metrics.ssim)).toBe(true);
      expect(metrics.ssim).toBeLessThanOrEqual(1.00001);
      report.push({ pattern, method, ...metrics, ms });
    }
  }
  console.log("Photonic synthetic reconstruction benchmark (192×192 → 96×96 → 192×192):");
  console.table(report);
  console.log("Times are single-run Node measurements; do not use them as browser performance claims.");
}, 120_000);
