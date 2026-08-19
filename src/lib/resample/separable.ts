/**
 * Сепарабельный ресемплинг: вклад по X, затем по Y.
 * При даунскейле окно ядра растягивается (низкочастотный предфильтр).
 * Края — reflect. Цвет — премультиплицированная альфа.
 */

import { BAND_ROWS } from "../config";
import { kernelSupport, kernelWeight } from "./kernels";
import { TO_LINEAR, TO_SRGB, linearToSrgbByte } from "./colorspace";
import type { Contribs, ResampleEngineOptions } from "./types";

export function reflectIndex(i: number, n: number) {
  if (n <= 1) return 0;
  const period = n * 2;
  let x = i % period;
  if (x < 0) x += period;
  return x < n ? x : period - 1 - x;
}

/**
 * Таблица вкладов для одной оси.
 * @param blur доп. растяжение окна (антиалиасинг при даунскейле).
 */
export function buildContribs(
  srcSize: number,
  destSize: number,
  kernelId: string,
  a: number,
  blur = 1,
): Contribs {
  const scale = destSize / srcSize;
  const filterScale = (scale < 1 ? 1 / scale : 1) * blur;
  const support = kernelSupport(kernelId, a) * filterScale;
  const offsets = new Int32Array(destSize);
  const counts = new Int32Array(destSize);

  let total = 0;
  const tapLists: { indices: number[]; weights: number[] }[] = new Array(destSize);

  for (let i = 0; i < destSize; i += 1) {
    const center = (i + 0.5) / scale - 0.5;
    const left = Math.ceil(center - support);
    const right = Math.floor(center + support);
    const indices: number[] = [];
    const weights: number[] = [];
    let sum = 0;

    for (let j = left; j <= right; j += 1) {
      const w = kernelWeight(kernelId, (j - center) / filterScale, a);
      if (w === 0) continue;
      indices.push(reflectIndex(j, srcSize));
      weights.push(w);
      sum += w;
    }

    if (weights.length === 0 || sum === 0) {
      const nearest = reflectIndex(Math.round(center), srcSize);
      indices.push(nearest);
      weights.push(1);
      sum = 1;
    }

    const inv = 1 / sum;
    for (let k = 0; k < weights.length; k += 1) weights[k] *= inv;

    tapLists[i] = { indices, weights };
    offsets[i] = total;
    counts[i] = weights.length;
    total += weights.length;
  }

  const indices = new Int32Array(total);
  const weights = new Float32Array(total);
  for (let i = 0; i < destSize; i += 1) {
    const { indices: idx, weights: wts } = tapLists[i];
    const o = offsets[i];
    for (let k = 0; k < idx.length; k += 1) {
      indices[o + k] = idx[k];
      weights[o + k] = wts[k];
    }
  }

  return { indices, weights, offsets, counts };
}

function decodeSample(src: Uint8ClampedArray, si: number, linear: boolean, out: Float32Array) {
  const a = src[si + 3] / 255;
  if (linear) {
    out[0] = TO_LINEAR[src[si]] * a;
    out[1] = TO_LINEAR[src[si + 1]] * a;
    out[2] = TO_LINEAR[src[si + 2]] * a;
  } else {
    out[0] = (src[si] / 255) * a;
    out[1] = (src[si + 1] / 255) * a;
    out[2] = (src[si + 2] / 255) * a;
  }
  out[3] = a;
}

function encodePixel(
  r: number,
  g: number,
  b: number,
  a: number,
  linear: boolean,
  dest: Uint8ClampedArray,
  di: number,
) {
  if (a < 1e-8) {
    dest[di] = 0;
    dest[di + 1] = 0;
    dest[di + 2] = 0;
    dest[di + 3] = 0;
    return;
  }
  const invA = 1 / a;
  const rr = r * invA;
  const gg = g * invA;
  const bb = b * invA;
  if (linear) {
    dest[di] = linearToSrgbByte(rr, TO_SRGB);
    dest[di + 1] = linearToSrgbByte(gg, TO_SRGB);
    dest[di + 2] = linearToSrgbByte(bb, TO_SRGB);
  } else {
    dest[di] = Math.round(Math.min(1, Math.max(0, rr)) * 255);
    dest[di + 1] = Math.round(Math.min(1, Math.max(0, gg)) * 255);
    dest[di + 2] = Math.round(Math.min(1, Math.max(0, bb)) * 255);
  }
  dest[di + 3] = Math.round(Math.min(1, Math.max(0, a)) * 255);
}

function yieldTick() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Ресемплинг полной картинки или прямоугольника в координатах назначения. */
export async function resampleSeparable(options: ResampleEngineOptions) {
  const {
    src,
    srcW,
    srcH,
    destW,
    destH,
    kernelId = "bilinear",
    a = 3,
    colorSpace = "linear",
    region,
    onProgress,
    shouldAbort,
  } = options;

  const rx = region?.x ?? 0;
  const ry = region?.y ?? 0;
  const rw = region?.w ?? destW;
  const rh = region?.h ?? destH;
  const linear = colorSpace === "linear";

  if (kernelId === "nearest") {
    return resampleNearest(src, srcW, srcH, destW, destH, rx, ry, rw, rh, onProgress, shouldAbort);
  }

  const contribX = buildContribs(srcW, destW, kernelId, a);
  const contribY = buildContribs(srcH, destH, kernelId, a);

  const out = new Uint8ClampedArray(rw * rh * 4);
  const tmp = new Float32Array(rw * 4);
  const sample = new Float32Array(4);
  const horizCache = new Map<number, Float32Array>();

  const horizRow = (sy: number) => {
    let row = horizCache.get(sy);
    if (row) return row;
    row = new Float32Array(rw * 4);
    for (let dx = 0; dx < rw; dx += 1) {
      const destX = rx + dx;
      const off = contribX.offsets[destX];
      const n = contribX.counts[destX];
      let r = 0;
      let g = 0;
      let b = 0;
      let al = 0;
      for (let k = 0; k < n; k += 1) {
        const sx = contribX.indices[off + k];
        const w = contribX.weights[off + k];
        decodeSample(src, (sy * srcW + sx) * 4, linear, sample);
        r += sample[0] * w;
        g += sample[1] * w;
        b += sample[2] * w;
        al += sample[3] * w;
      }
      const o = dx * 4;
      row[o] = r;
      row[o + 1] = g;
      row[o + 2] = b;
      row[o + 3] = al;
    }
    horizCache.set(sy, row);
    return row;
  };

  const pruneCache = (minRow: number) => {
    for (const key of horizCache.keys()) {
      if (key < minRow) horizCache.delete(key);
    }
  };

  for (let band = 0; band < rh; band += BAND_ROWS) {
    if (shouldAbort?.()) return null;
    const bandH = Math.min(BAND_ROWS, rh - band);

    let minSrcRow = srcH;
    let maxSrcRow = 0;
    for (let dy = 0; dy < bandH; dy += 1) {
      const destY = ry + band + dy;
      const off = contribY.offsets[destY];
      const n = contribY.counts[destY];
      for (let k = 0; k < n; k += 1) {
        const row = contribY.indices[off + k];
        if (row < minSrcRow) minSrcRow = row;
        if (row > maxSrcRow) maxSrcRow = row;
      }
    }
    pruneCache(minSrcRow);

    for (let dy = 0; dy < bandH; dy += 1) {
      const destY = ry + band + dy;
      const off = contribY.offsets[destY];
      const n = contribY.counts[destY];
      tmp.fill(0);
      for (let k = 0; k < n; k += 1) {
        const srcRow = contribY.indices[off + k];
        const w = contribY.weights[off + k];
        const horiz = horizRow(srcRow);
        for (let dx = 0; dx < rw; dx += 1) {
          const s = dx * 4;
          tmp[s] += horiz[s] * w;
          tmp[s + 1] += horiz[s + 1] * w;
          tmp[s + 2] += horiz[s + 2] * w;
          tmp[s + 3] += horiz[s + 3] * w;
        }
      }
      const outRow = (band + dy) * rw * 4;
      for (let dx = 0; dx < rw; dx += 1) {
        const t = dx * 4;
        encodePixel(tmp[t], tmp[t + 1], tmp[t + 2], tmp[t + 3], linear, out, outRow + t);
      }
    }
    onProgress?.((band + bandH) / rh);
    await yieldTick();
  }

  return out;
}

async function resampleNearest(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  onProgress?: (value: number) => void,
  shouldAbort?: () => boolean,
) {
  const out = new Uint8ClampedArray(rw * rh * 4);
  for (let dy = 0; dy < rh; dy += 1) {
    if (dy % BAND_ROWS === 0) {
      if (shouldAbort?.()) return null;
      onProgress?.(dy / rh);
      await yieldTick();
    }
    const sy = reflectIndex(Math.floor((ry + dy + 0.5) * srcH / destH), srcH);
    for (let dx = 0; dx < rw; dx += 1) {
      const sx = reflectIndex(Math.floor((rx + dx + 0.5) * srcW / destW), srcW);
      const si = (sy * srcW + sx) * 4;
      const di = (dy * rw + dx) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  onProgress?.(1);
  return out;
}
