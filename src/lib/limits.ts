import { HARD_MEGAPIXELS, MAX_AREA, MAX_SIDE, WARN_MEGAPIXELS } from "./config";
import type { ErrorCode, ErrorParams } from "./errors";

export function clampInt(value: string | number, min: number, max: number) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function destPixels(width: number, height: number) {
  return width * height;
}

export function megapixels(width: number, height: number) {
  return (width * height) / 1_000_000;
}

export type DestVerdict = {
  ok: boolean;
  warn: boolean;
  code?: ErrorCode;
  params?: ErrorParams;
};

export function validateDest(width: number, height: number): DestVerdict {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return { ok: false, warn: false, code: "dest_min" };
  }
  if (width > MAX_SIDE || height > MAX_SIDE) {
    return { ok: false, warn: false, code: "dest_side", params: { max: MAX_SIDE } };
  }
  const area = width * height;
  if (area > MAX_AREA) {
    return { ok: false, warn: false, code: "dest_area" };
  }
  const mp = area / 1_000_000;
  if (mp > HARD_MEGAPIXELS) {
    return {
      ok: false,
      warn: true,
      code: "dest_hard",
      params: { mp: mp.toFixed(0), limit: HARD_MEGAPIXELS },
    };
  }
  if (mp > WARN_MEGAPIXELS) {
    return {
      ok: true,
      warn: true,
      code: "dest_warn",
      params: { mp: mp.toFixed(0) },
    };
  }
  return { ok: true, warn: false };
}

export function fitInside(width: number, height: number, maxSide: number) {
  const long = Math.max(width, height);
  if (long <= maxSide) return { width, height };
  const scale = maxSide / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
