/**
 * Один шаг обратной согласованности по сигмоидной L:
 * area-downsample dest → размер источника, вычесть долю ошибки.
 * Не цикл. Chroma не трогаем.
 */

import { tangentResidual } from "./photonic-tcr";

export const IBP_LAMBDA = 0.48;
export const DEST_SNAP = 0.55;
export const SPAN_REF = 0.1;

function spanGain(min: number, max: number) {
  const span = max - min;
  if (!(span > 1e-6)) return 0;
  const t = span / SPAN_REF;
  return t > 1 ? 1 : t < 0 ? 0 : t;
}

function reflect(i: number, n: number) {
  if (n <= 1) return 0;
  const period = n * 2;
  let x = i % period;
  if (x < 0) x += period;
  return x < n ? x : period - 1 - x;
}

export function boxDownsample(
  dest: Float32Array,
  destW: number,
  destH: number,
  srcW: number,
  srcH: number,
  destA?: Float32Array,
): Float32Array {
  const out = new Float32Array(srcW * srcH);
  const weight = new Float32Array(srcW * srcH);
  const scaleX = destW / srcW;
  const scaleY = destH / srcH;
  for (let dy = 0; dy < destH; dy += 1) {
    const y0 = dy / scaleY;
    const y1 = (dy + 1) / scaleY;
    const sy0 = Math.max(0, Math.floor(y0));
    const sy1 = Math.min(srcH - 1, Math.max(sy0, Math.floor(y1 - 1e-9)));
    for (let dx = 0; dx < destW; dx += 1) {
      const di = dy * destW + dx;
      if (destA && destA[di] < 1e-8) continue;
      const v = dest[di];
      const x0 = dx / scaleX;
      const x1 = (dx + 1) / scaleX;
      const sx0 = Math.max(0, Math.floor(x0));
      const sx1 = Math.min(srcW - 1, Math.max(sx0, Math.floor(x1 - 1e-9)));
      for (let sy = sy0; sy <= sy1; sy += 1) {
        const oy0 = Math.max(y0, sy);
        const oy1 = Math.min(y1, sy + 1);
        const hy = oy1 - oy0;
        if (hy <= 0) continue;
        for (let sx = sx0; sx <= sx1; sx += 1) {
          const ox0 = Math.max(x0, sx);
          const ox1 = Math.min(x1, sx + 1);
          const area = (ox1 - ox0) * hy;
          if (area <= 0) continue;
          const i = sy * srcW + sx;
          out[i] += v * area;
          weight[i] += area;
        }
      }
    }
  }
  for (let i = 0; i < out.length; i += 1) {
    if (weight[i] > 1e-12) out[i] /= weight[i];
  }
  return out;
}

function sampleBilinear(src: Float32Array, srcW: number, srcH: number, x: number, y: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const tx = x - x0;
  const ty = y - y0;
  const i00 = reflect(y0, srcH) * srcW + reflect(x0, srcW);
  const i10 = reflect(y0, srcH) * srcW + reflect(x1, srcW);
  const i01 = reflect(y1, srcH) * srcW + reflect(x0, srcW);
  const i11 = reflect(y1, srcH) * srcW + reflect(x1, srcW);
  return src[i00] * (1 - tx) * (1 - ty) + src[i10] * tx * (1 - ty) + src[i01] * (1 - tx) * ty + src[i11] * tx * ty;
}

export function applyLumaConsistency(options: {
  destL: Float32Array;
  destA: Float32Array;
  destW: number;
  destH: number;
  srcL: Float32Array;
  srcW: number;
  srcH: number;
  mn: Float32Array;
  mx: Float32Array;
  lambda?: number;
}) {
  const { destL, destA, destW, destH, srcL, srcW, srcH, mn, mx } = options;
  const lambda = options.lambda ?? IBP_LAMBDA;
  if (!(lambda > 0) || destW < srcW || destH < srcH) return;

  const down = boxDownsample(destL, destW, destH, srcW, srcH, destA);
  const err = new Float32Array(srcW * srcH);
  for (let i = 0; i < err.length; i += 1) err[i] = down[i] - srcL[i];

  const scaleX = destW / srcW;
  const scaleY = destH / srcH;
  for (let dy = 0; dy < destH; dy += 1) {
    for (let dx = 0; dx < destW; dx += 1) {
      const i = dy * destW + dx;
      if (destA[i] < 1e-8) continue;
      const lo = mn[i];
      const hi = mx[i];
      const cx = (dx + 0.5) / scaleX - 0.5;
      const cy = (dy + 0.5) / scaleY - 0.5;
      const gain = lambda * spanGain(lo, hi);
      let next = destL[i] - gain * sampleBilinear(err, srcW, srcH, cx, cy);
      if (next < lo) next = lo;
      if (next > hi) next = hi;
      destL[i] = next;
    }
  }
}

/**
 * Контраст внутри [mn, mx] на готовом dest L: 3×3 high-pass, сила от ширины
 * исходного диапазона. После IBP возвращает snap краёв, не выходя за NoHalo.
 */
export function applyDestLumaSnap(options: {
  destL: Float32Array;
  destA: Float32Array;
  destW: number;
  destH: number;
  mn: Float32Array;
  mx: Float32Array;
  amount?: number;
  coherent?: boolean;
}) {
  const { destL, destA, destW, destH, mn, mx } = options;
  const amount = options.amount ?? DEST_SNAP;
  if (!(amount > 0) || destW < 1 || destH < 1) return;

  const sourceL = options.coherent ? new Float32Array(destL) : destL;
  const blur = new Float32Array(destL.length);
  for (let y = 0; y < destH; y += 1) {
    for (let x = 0; x < destW; x += 1) {
      const i = y * destW + x;
      if (destA[i] < 1e-8) {
        blur[i] = destL[i];
        continue;
      }
      let sum = 0;
      let wsum = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        const yy = reflect(y + ky, destH);
        for (let kx = -1; kx <= 1; kx += 1) {
          const xx = reflect(x + kx, destW);
          const j = yy * destW + xx;
          if (destA[j] < 1e-8) continue;
          sum += destL[j];
          wsum += 1;
        }
      }
      blur[i] = wsum > 0 ? sum / wsum : destL[i];
    }
  }

  for (let i = 0; i < destL.length; i += 1) {
    if (destA[i] < 1e-8) continue;
    const lo = mn[i];
    const hi = mx[i];
    const g = amount * spanGain(lo, hi);
    if (!(g > 0)) continue;
    const x = i % destW;
    const y = Math.floor(i / destW);
    const tangent = options.coherent ? tangentResidual(sourceL, destA, destW, destH, x, y) : null;
    const adaptive = tangent ? tangent.confidence : 0;
    const residual = tangent ? tangent.residual : 0;
    let next = destL[i] + g * ((1 - adaptive) * (destL[i] - blur[i]) + adaptive * residual);
    if (next < lo) next = lo;
    if (next > hi) next = hi;
    destL[i] = next;
  }
}
