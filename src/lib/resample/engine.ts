import { resamplePhotonic } from "./photonic";
import { resampleSeparable } from "./separable";
import { unsharpMask } from "./unsharp";
import type { Region, ResampleEngineOptions, ResampleJobOptions } from "./types";

export type SourceFrame = { width: number; height: number; data: Uint8ClampedArray };

export async function resampleFrame(
  source: SourceFrame,
  opts: ResampleJobOptions,
  callbacks: Pick<ResampleEngineOptions, "shouldAbort" | "onProgress"> = {},
) {
  const requested = opts.region;
  const radius =
    opts.unsharp?.enabled && opts.unsharp.amount > 0
      ? Math.max(1, Math.ceil(Math.max(0.4, opts.unsharp.radius) * 3))
      : 0;
  let region: Region | undefined = requested;
  if (requested && radius) {
    const x = Math.max(0, requested.x - radius);
    const y = Math.max(0, requested.y - radius);
    region = {
      x,
      y,
      w: Math.min(opts.destW, requested.x + requested.w + radius) - x,
      h: Math.min(opts.destH, requested.y + requested.h + radius) - y,
    };
  }
  const resample = opts.kernelId === "photonic" ? resamplePhotonic : resampleSeparable;
  const identity = opts.destW === source.width && opts.destH === source.height;
  let pixels: Uint8ClampedArray | null;
  if (identity) {
    const area = region ?? { x: 0, y: 0, w: opts.destW, h: opts.destH };
    pixels = new Uint8ClampedArray(area.w * area.h * 4);
    for (let y = 0; y < area.h; y += 1) {
      const start = ((area.y + y) * source.width + area.x) * 4;
      pixels.set(source.data.subarray(start, start + area.w * 4), y * area.w * 4);
    }
  } else
    pixels = await resample({
      src: source.data,
      srcW: source.width,
      srcH: source.height,
      destW: opts.destW,
      destH: opts.destH,
      kernelId: opts.kernelId,
      a: opts.a,
      colorSpace: opts.kernelId === "photonic" ? "linear" : opts.colorSpace,
      region,
      ...callbacks,
    });
  if (!pixels || callbacks.shouldAbort?.()) return null;
  const width = region?.w ?? opts.destW;
  const height = region?.h ?? opts.destH;
  if (radius && opts.unsharp) unsharpMask(pixels, width, height, opts.unsharp);
  if (callbacks.shouldAbort?.()) return null;
  if (!requested || !region || (requested.w === region.w && requested.h === region.h)) return pixels;
  const out = new Uint8ClampedArray(requested.w * requested.h * 4);
  for (let y = 0; y < requested.h; y += 1) {
    const start = ((requested.y - region.y + y) * region.w + requested.x - region.x) * 4;
    out.set(pixels.subarray(start, start + requested.w * 4), y * requested.w * 4);
  }
  return out;
}
