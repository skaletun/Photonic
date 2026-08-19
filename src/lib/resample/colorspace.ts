/** Переход sRGB ↔ линейный свет. Интерполяция в линейном пространстве ближе к физике. */

export function srgbToLinear(c: number) {
  if (c <= 0.04045) return c / 12.92;
  return ((c + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c: number) {
  if (c <= 0.0031308) return 12.92 * c;
  return 1.055 * c ** (1 / 2.4) - 0.055;
}

/** LUT байт → линейный 0..1 и линейный → байт (4096 ступеней, меньше бандинга). */
export function createColorLuts() {
  const toLinear = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) {
    toLinear[i] = srgbToLinear(i / 255);
  }
  const toSrgb = new Uint8Array(4096);
  for (let i = 0; i < 4096; i += 1) {
    const encoded = linearToSrgb(i / 4095);
    toSrgb[i] = Math.round(Math.min(1, Math.max(0, encoded)) * 255);
  }
  return { toLinear, toSrgb };
}

export function linearToSrgbByte(x: number, toSrgb: Uint8Array) {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return toSrgb[(t * 4095 + 0.5) | 0];
}

const SHARED = createColorLuts();
export const TO_LINEAR = SHARED.toLinear;
export const TO_SRGB = SHARED.toSrgb;

/**
 * Линейный sRGB → OKLab. Светлота L ближе к восприятию, чем BT.709 Y,
 * поэтому раздельный ресемплинг L / chroma меньше рвёт цвет на контурах.
 */
export function linearSrgbToOklab(r: number, g: number, b: number, out: Float32Array | number[]) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  out[0] = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  out[1] = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  out[2] = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  return out;
}

export function oklabToLinearSrgb(L: number, a: number, b: number, out: Float32Array | number[]) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0897293787 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  out[0] = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  out[1] = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  out[2] = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return out;
}
