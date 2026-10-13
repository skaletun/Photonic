import { BAND_ROWS } from "../config";
import { applyDestLumaSnap, IBP_LAMBDA, SPAN_REF } from "./photonic-consistency";
import { reflectIndex } from "./separable";
import type { Region, ResampleEngineOptions } from "./types";

export type PhotonicFields = {
  L: Float32Array; A: Float32Array; ca: Float32Array; cb: Float32Array;
  mn: Float32Array; mx: Float32Array;
};
type ErrorField = { data: Float32Array; area: Region; srcW: number; srcH: number };

export async function createConsistencyError(
  options: ResampleEngineOptions & { region: Region },
  render: (region: Region) => Promise<PhotonicFields | null>,
  sourceLightness: (index: number) => number,
): Promise<ErrorField | null> {
  const { srcW, srcH, destW, destH, region, shouldAbort, onProgress } = options;
  const scaleX = destW / srcW;
  const scaleY = destH / srcH;
  const x = Math.max(0, Math.floor((region.x - 0.5) / scaleX - 0.5) - 2);
  const y = Math.max(0, Math.floor((region.y - 0.5) / scaleY - 0.5) - 2);
  const right = Math.min(srcW, Math.ceil((region.x + region.w + 1.5) / scaleX) + 2);
  const bottom = Math.min(srcH, Math.ceil((region.y + region.h + 1.5) / scaleY) + 2);
  const area = { x, y, w: right - x, h: bottom - y };
  const data = new Float32Array(area.w * area.h);
  const weight = new Float32Array(data.length);
  const dx0 = Math.max(0, Math.floor(x * scaleX));
  const dx1 = Math.min(destW, Math.ceil(right * scaleX));
  const dy0 = Math.max(0, Math.floor(y * scaleY));
  const dy1 = Math.min(destH, Math.ceil(bottom * scaleY));
  for (let band = dy0; band < dy1; band += BAND_ROWS) {
    if (shouldAbort?.()) return null;
    const strip = { x: dx0, y: band, w: dx1 - dx0, h: Math.min(BAND_ROWS, dy1 - band) };
    const fields = await render(strip);
    if (!fields) return null;
    for (let dy = 0; dy < strip.h; dy += 1) {
      const y0 = (band + dy) / scaleY;
      const y1 = (band + dy + 1) / scaleY;
      const sy0 = Math.max(y, Math.floor(y0));
      const sy1 = Math.min(bottom - 1, Math.max(sy0, Math.floor(y1 - 1e-9)));
      for (let dx = 0; dx < strip.w; dx += 1) {
        const di = dy * strip.w + dx;
        if (fields.A[di] < 1e-8) continue;
        const x0 = (dx0 + dx) / scaleX;
        const x1 = (dx0 + dx + 1) / scaleX;
        const sx0 = Math.max(x, Math.floor(x0));
        const sx1 = Math.min(right - 1, Math.max(sx0, Math.floor(x1 - 1e-9)));
        for (let sy = sy0; sy <= sy1; sy += 1) {
          const hy = Math.min(y1, sy + 1) - Math.max(y0, sy);
          if (hy <= 0) continue;
          for (let sx = sx0; sx <= sx1; sx += 1) {
            const coverage = (Math.min(x1, sx + 1) - Math.max(x0, sx)) * hy;
            if (coverage <= 0) continue;
            const i = (sy - y) * area.w + sx - x;
            data[i] += fields.L[di] * coverage;
            weight[i] += coverage;
          }
        }
      }
    }
    onProgress?.(0.5 * (band + strip.h - dy0) / (dy1 - dy0));
  }
  for (let sy = y; sy < bottom; sy += 1) {
    for (let sx = x; sx < right; sx += 1) {
      const i = (sy - y) * area.w + sx - x;
      if (weight[i] > 1e-12) data[i] /= weight[i];
      data[i] -= sourceLightness(sy * srcW + sx);
    }
  }
  return { data, area, srcW, srcH };
}

function sampleError(error: ErrorField, x: number, y: number) {
  const x0 = Math.floor(x); const y0 = Math.floor(y);
  const tx = x - x0; const ty = y - y0;
  const at = (sx: number, sy: number) => {
    const xx = reflectIndex(sx, error.srcW) - error.area.x;
    const yy = reflectIndex(sy, error.srcH) - error.area.y;
    return error.data[yy * error.area.w + xx];
  };
  return at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty)
    + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty;
}

export function correctStrip(fields: PhotonicFields, area: Region, options: ResampleEngineOptions, error: ErrorField) {
  const scaleX = options.destW / options.srcW;
  const scaleY = options.destH / options.srcH;
  for (let y = 0; y < area.h; y += 1) {
    for (let x = 0; x < area.w; x += 1) {
      const i = y * area.w + x;
      if (fields.A[i] < 1e-8) continue;
      const lo = fields.mn[i]; const hi = fields.mx[i]; const span = hi - lo;
      const gain = span > 1e-6 ? IBP_LAMBDA * Math.min(1, span / SPAN_REF) : 0;
      const cx = (area.x + x + 0.5) / scaleX - 0.5;
      const cy = (area.y + y + 0.5) / scaleY - 0.5;
      fields.L[i] = Math.max(lo, Math.min(hi, fields.L[i] - gain * sampleError(error, cx, cy)));
    }
  }
  if (options.destW > options.srcW || options.destH > options.srcH) {
    applyDestLumaSnap({ destL: fields.L, destA: fields.A, destW: area.w, destH: area.h, mn: fields.mn, mx: fields.mx });
  }
}
