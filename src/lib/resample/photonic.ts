/**
 * Пайплайн Photonic: линейный sRGB → OKLab, нормированная сигмоида на L,
 * Kaiser-sinc по светлоте, Mitchell по цветности, NoHalo по локальным соседям.
 */

import { BAND_ROWS } from "../config";
import { TO_LINEAR, TO_SRGB, linearSrgbToOklab, linearToSrgbByte, oklabToLinearSrgb } from "./colorspace";
import { buildContribs, reflectIndex } from "./separable";
import type { ResampleEngineOptions } from "./types";

/** Contrast ImageMagick / Robidoux для sigmoidal-contrast. */
export const SIGMOID_K = 6.5;
export const SIGMOID_MID = 0.5;
/** Остаток выброса при апскейле (почти жёсткий клип). */
export const HALO_RESIDUAL = 0.04;
/** При даунскейле чуть мягче — иначе режется антиалиасинг. */
export const HALO_RESIDUAL_DOWN = 0.07;
/** Чуть шире окно luma при уменьшении — меньше муара. */
export const DOWNSCALE_AA = 1.07;

const LUT_N = 4096;
const labTmp = new Float32Array(3);
const rgbTmp = new Float32Array(3);

function rawSigmoid(x: number, k: number, m: number) {
  return 1 / (1 + Math.exp(k * (m - x)));
}

/**
 * Нормированная сигмоида: 0→0, 1→1, середина на 0.5.
 * Без нормировки чёрное поднимается (~0.037) и белое садится.
 */
export function sigmoid(x: number, k = SIGMOID_K) {
  const lo = rawSigmoid(0, k, SIGMOID_MID);
  const hi = rawSigmoid(1, k, SIGMOID_MID);
  return (rawSigmoid(x, k, SIGMOID_MID) - lo) / (hi - lo);
}

export function invSigmoid(s: number, k = SIGMOID_K) {
  const t = s < 0 ? 0 : s > 1 ? 1 : s;
  const lo = rawSigmoid(0, k, SIGMOID_MID);
  const hi = rawSigmoid(1, k, SIGMOID_MID);
  let u = lo + t * (hi - lo);
  const e = 1e-12;
  if (u < e) u = e;
  else if (u > 1 - e) u = 1 - e;
  return SIGMOID_MID - Math.log(1 / u - 1) / k;
}

const TO_SIG = new Float32Array(LUT_N);
const FROM_SIG = new Float32Array(LUT_N);
for (let i = 0; i < LUT_N; i += 1) {
  const x = i / (LUT_N - 1);
  TO_SIG[i] = sigmoid(x);
  FROM_SIG[i] = invSigmoid(x);
}

export function lutSigmoid(y: number) {
  const t = y < 0 ? 0 : y > 1 ? 1 : y;
  return TO_SIG[(t * (LUT_N - 1) + 0.5) | 0];
}

export function lutInvSigmoid(s: number) {
  const t = s < 0 ? 0 : s > 1 ? 1 : s;
  return FROM_SIG[(t * (LUT_N - 1) + 0.5) | 0];
}

export function softHaloClamp(value: number, min: number, max: number, residual = HALO_RESIDUAL) {
  if (value > max) return max + residual * (value - max);
  if (value < min) return min + residual * (value - min);
  return value;
}

function yieldTick() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function decodeLab(src: Uint8ClampedArray, si: number, dest: Float32Array, di: number) {
  const a = src[si + 3] / 255;
  if (a < 1e-8) {
    dest[di] = 0;
    dest[di + 1] = 0;
    dest[di + 2] = 0;
    dest[di + 3] = 0;
    return;
  }
  linearSrgbToOklab(TO_LINEAR[src[si]], TO_LINEAR[src[si + 1]], TO_LINEAR[src[si + 2]], labTmp);
  dest[di] = sigmoid(labTmp[0]);
  dest[di + 1] = labTmp[1];
  dest[di + 2] = labTmp[2];
  dest[di + 3] = a;
}

function encodeLab(Lsig: number, ca: number, cb: number, a: number, dest: Uint8ClampedArray, di: number) {
  if (a < 1e-8) {
    dest[di] = 0;
    dest[di + 1] = 0;
    dest[di + 2] = 0;
    dest[di + 3] = 0;
    return;
  }
  oklabToLinearSrgb(invSigmoid(Lsig), ca, cb, rgbTmp);
  dest[di] = linearToSrgbByte(rgbTmp[0], TO_SRGB);
  dest[di + 1] = linearToSrgbByte(rgbTmp[1], TO_SRGB);
  dest[di + 2] = linearToSrgbByte(rgbTmp[2], TO_SRGB);
  dest[di + 3] = Math.round(Math.min(1, Math.max(0, a)) * 255);
}

/**
 * Диапазон светлоты для NoHalo: 2×2 соседа при апскейле,
 * след пикселя назначения в источнике — при даунскейле.
 */
function neighborSpan(center: number, scale: number): [number, number] {
  if (scale >= 1) {
    const i = Math.floor(center);
    return [i, i + 1];
  }
  const half = 0.5 / scale;
  return [Math.floor(center - half), Math.ceil(center + half)];
}

export async function resamplePhotonic(options: ResampleEngineOptions) {
  const { src, srcW, srcH, destW, destH, region, onProgress, shouldAbort } = options;
  const rx = region?.x ?? 0;
  const ry = region?.y ?? 0;
  const rw = region?.w ?? destW;
  const rh = region?.h ?? destH;

  const scaleX = destW / srcW;
  const scaleY = destH / srcH;
  const downX = scaleX < 1;
  const downY = scaleY < 1;
  const residual = downX || downY ? HALO_RESIDUAL_DOWN : HALO_RESIDUAL;

  const lumaX = buildContribs(srcW, destW, "photonic", 3, downX ? DOWNSCALE_AA : 1);
  const lumaY = buildContribs(srcH, destH, "photonic", 3, downY ? DOWNSCALE_AA : 1);
  const chromaX = buildContribs(srcW, destW, "mitchell", 2);
  const chromaY = buildContribs(srcH, destH, "mitchell", 2);

  const out = new Uint8ClampedArray(rw * rh * 4);
  const labRows = new Map<number, Float32Array>();
  const lumaCache = new Map<number, Float32Array>();
  const chromaCache = new Map<number, Float32Array>();

  const labRow = (sy: number) => {
    let row = labRows.get(sy);
    if (row) return row;
    row = new Float32Array(srcW * 4);
    const base = sy * srcW * 4;
    for (let sx = 0; sx < srcW; sx += 1) {
      decodeLab(src, base + sx * 4, row, sx * 4);
    }
    labRows.set(sy, row);
    return row;
  };

  const lumaHoriz = (sy: number) => {
    let row = lumaCache.get(sy);
    if (row) return row;
    const lab = labRow(sy);
    row = new Float32Array(rw * 2);
    for (let dx = 0; dx < rw; dx += 1) {
      const destX = rx + dx;
      const off = lumaX.offsets[destX];
      const n = lumaX.counts[destX];
      let y = 0;
      let a = 0;
      for (let k = 0; k < n; k += 1) {
        const sx = lumaX.indices[off + k];
        const w = lumaX.weights[off + k];
        const o = sx * 4;
        const alpha = lab[o + 3];
        y += lab[o] * alpha * w;
        a += alpha * w;
      }
      row[dx * 2] = y;
      row[dx * 2 + 1] = a;
    }
    lumaCache.set(sy, row);
    return row;
  };

  const chromaHoriz = (sy: number) => {
    let row = chromaCache.get(sy);
    if (row) return row;
    const lab = labRow(sy);
    row = new Float32Array(rw * 2);
    for (let dx = 0; dx < rw; dx += 1) {
      const destX = rx + dx;
      const off = chromaX.offsets[destX];
      const n = chromaX.counts[destX];
      let ca = 0;
      let cb = 0;
      for (let k = 0; k < n; k += 1) {
        const sx = chromaX.indices[off + k];
        const w = chromaX.weights[off + k];
        const o = sx * 4;
        const alpha = lab[o + 3];
        ca += lab[o + 1] * alpha * w;
        cb += lab[o + 2] * alpha * w;
      }
      row[dx * 2] = ca;
      row[dx * 2 + 1] = cb;
    }
    chromaCache.set(sy, row);
    return row;
  };

  const prune = (minRow: number) => {
    for (const key of lumaCache.keys()) {
      if (key < minRow) lumaCache.delete(key);
    }
    for (const key of chromaCache.keys()) {
      if (key < minRow) chromaCache.delete(key);
    }
    for (const key of labRows.keys()) {
      if (key < minRow) labRows.delete(key);
    }
  };

  const localRange = (destX: number, destY: number) => {
    const cx = (destX + 0.5) / scaleX - 0.5;
    const cy = (destY + 0.5) / scaleY - 0.5;
    const [x0, x1] = neighborSpan(cx, scaleX);
    const [y0, y1] = neighborSpan(cy, scaleY);
    let mnL = Infinity;
    let mxL = -Infinity;
    let mnA = Infinity;
    let mxA = -Infinity;
    let mnB = Infinity;
    let mxB = -Infinity;
    for (let y = y0; y <= y1; y += 1) {
      const row = labRow(reflectIndex(y, srcH));
      for (let x = x0; x <= x1; x += 1) {
        const o = reflectIndex(x, srcW) * 4;
        if (row[o + 3] < 1e-8) continue;
        const L = row[o];
        const ca = row[o + 1];
        const cb = row[o + 2];
        if (L < mnL) mnL = L;
        if (L > mxL) mxL = L;
        if (ca < mnA) mnA = ca;
        if (ca > mxA) mxA = ca;
        if (cb < mnB) mnB = cb;
        if (cb > mxB) mxB = cb;
      }
    }
    if (!(mnL <= mxL)) {
      mnL = 0;
      mxL = 1;
      mnA = 0;
      mxA = 0;
      mnB = 0;
      mxB = 0;
    }
    return { mnL, mxL, mnA, mxA, mnB, mxB };
  };

  for (let band = 0; band < rh; band += BAND_ROWS) {
    if (shouldAbort?.()) return null;
    const bandH = Math.min(BAND_ROWS, rh - band);

    let minSrcRow = srcH;
    for (let dy = 0; dy < bandH; dy += 1) {
      const destY = ry + band + dy;
      const lumaOff = lumaY.offsets[destY];
      const lumaN = lumaY.counts[destY];
      for (let k = 0; k < lumaN; k += 1) {
        const row = lumaY.indices[lumaOff + k];
        if (row < minSrcRow) minSrcRow = row;
      }
      const chromaOff = chromaY.offsets[destY];
      const chromaN = chromaY.counts[destY];
      for (let k = 0; k < chromaN; k += 1) {
        const row = chromaY.indices[chromaOff + k];
        if (row < minSrcRow) minSrcRow = row;
      }
    }
    prune(minSrcRow);

    for (let dy = 0; dy < bandH; dy += 1) {
      const destY = ry + band + dy;
      const yOff = lumaY.offsets[destY];
      const yN = lumaY.counts[destY];
      const cOff = chromaY.offsets[destY];
      const cN = chromaY.counts[destY];

      for (let dx = 0; dx < rw; dx += 1) {
        let Lp = 0;
        let A = 0;
        for (let k = 0; k < yN; k += 1) {
          const w = lumaY.weights[yOff + k];
          const horiz = lumaHoriz(lumaY.indices[yOff + k]);
          Lp += horiz[dx * 2] * w;
          A += horiz[dx * 2 + 1] * w;
        }
        let ca = 0;
        let cb = 0;
        for (let k = 0; k < cN; k += 1) {
          const w = chromaY.weights[cOff + k];
          const horiz = chromaHoriz(chromaY.indices[cOff + k]);
          ca += horiz[dx * 2] * w;
          cb += horiz[dx * 2 + 1] * w;
        }
        const di = ((band + dy) * rw + dx) * 4;
        if (A < 1e-8) {
          out[di] = 0;
          out[di + 1] = 0;
          out[di + 2] = 0;
          out[di + 3] = 0;
          continue;
        }
        const invA = 1 / A;
        const { mnL, mxL, mnA, mxA, mnB, mxB } = localRange(rx + dx, destY);
        const Lsig = softHaloClamp(Lp * invA, mnL, mxL, residual);
        encodeLab(
          Lsig,
          softHaloClamp(ca * invA, mnA, mxA, residual),
          softHaloClamp(cb * invA, mnB, mxB, residual),
          A,
          out,
          di,
        );
      }
    }
    onProgress?.((band + bandH) / rh);
    await yieldTick();
  }

  return out;
}
