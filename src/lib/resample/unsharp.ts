/** Unsharp Mask: original + amount * (original − gaussian). Порог отсекает плоские участки. */

function gaussianKernel(radius: number) {
  const sigma = Math.max(0.4, radius);
  const radiusPx = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radiusPx * 2 + 1);
  const s2 = 2 * sigma * sigma;
  let sum = 0;
  for (let i = -radiusPx; i <= radiusPx; i += 1) {
    const v = Math.exp(-(i * i) / s2);
    kernel[i + radiusPx] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] /= sum;
  return { kernel, radiusPx };
}

function reflect(i: number, n: number) {
  if (n <= 1) return 0;
  const period = n * 2;
  let x = i % period;
  if (x < 0) x += period;
  return x < n ? x : period - 1 - x;
}

/**
 * amount: 0–200 (как в pica), radius: σ в пикселях, threshold: 0–255
 */
export function unsharpMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: { amount?: number; radius?: number; threshold?: number },
) {
  const amount = (opts.amount ?? 0) / 100;
  if (amount <= 0) return data;
  const threshold = opts.threshold ?? 0;
  const { kernel, radiusPx } = gaussianKernel(opts.radius ?? 0.6);

  const src = data;
  const rows = new Map<number, Float32Array>();
  const horizontal = (y: number) => {
    const existing = rows.get(y);
    if (existing) return existing;
    const row = new Float32Array(width * 3);
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = -radiusPx; k <= radiusPx; k += 1) {
        const xx = reflect(x + k, width);
        const w = kernel[k + radiusPx];
        const i = (y * width + xx) * 4;
        r += src[i] * w;
        g += src[i + 1] * w;
        b += src[i + 2] * w;
      }
      const o = x * 3;
      row[o] = r;
      row[o + 1] = g;
      row[o + 2] = b;
    }
    rows.set(y, row);
    return row;
  };

  for (let y = 0; y < height; y += 1) {
    // Cache every original row needed before writing sharpened pixels in place.
    for (let k = -radiusPx; k <= radiusPx; k += 1) horizontal(reflect(y + k, height));
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = -radiusPx; k <= radiusPx; k += 1) {
        const yy = reflect(y + k, height);
        const w = kernel[k + radiusPx];
        const row = rows.get(yy)!;
        const i = x * 3;
        r += row[i] * w;
        g += row[i + 1] * w;
        b += row[i + 2] * w;
      }
      const o = (y * width + x) * 4;
      const blur = [Math.fround(r), Math.fround(g), Math.fround(b)];
      for (let c = 0; c < 3; c += 1) {
        const diff = src[o + c] - blur[c];
        if (Math.abs(diff) >= threshold) src[o + c] = Math.round(src[o + c] + amount * diff);
      }
    }
    for (const key of rows.keys()) if (key < y - radiusPx) rows.delete(key);
  }

  return src;
}
