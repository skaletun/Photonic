/**
 * Tangent-Coherent Residual (TCR), experimental Photonic reconstruction.
 *
 * Builds a local tangential predictor from the destination lightness gradient.
 * Residual is sharpened only when a reliable dominant orientation exists.
 * Sampling is restricted to a 3x3 halo, preserving tile/full-frame parity.
 * This is a deterministic heuristic, not a learned super-resolution model.
 */
export function tangentResidual(
  L: Float32Array,
  A: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): { residual: number; confidence: number } {
  const i = y * width + x;
  const center = L[i];
  if (A[i] < 1e-8 || width < 3 || height < 3) return { residual: 0, confidence: 0 };
  const at = (dx: number, dy: number) => {
    const xx = Math.max(0, Math.min(width - 1, x + dx));
    const yy = Math.max(0, Math.min(height - 1, y + dy));
    const j = yy * width + xx;
    return A[j] < 1e-8 ? center : L[j];
  };
  const gx = (at(1, -1) + 2 * at(1, 0) + at(1, 1) - at(-1, -1) - 2 * at(-1, 0) - at(-1, 1)) / 8;
  const gy = (at(-1, 1) + 2 * at(0, 1) + at(1, 1) - at(-1, -1) - 2 * at(0, -1) - at(1, -1)) / 8;
  const magnitude = Math.hypot(gx, gy);
  if (magnitude < 0.005) return { residual: 0, confidence: 0 };
  const tx = -gy / magnitude;
  const ty = gx / magnitude;
  // The tangent stays within one pixel, so 1px strip padding is sufficient.
  const bilinear = (fx: number, fy: number) => {
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const u = fx - x0;
    const v = fy - y0;
    return at(x0 - x, y0 - y) * (1 - u) * (1 - v) +
      at(x0 + 1 - x, y0 - y) * u * (1 - v) +
      at(x0 - x, y0 + 1 - y) * (1 - u) * v +
      at(x0 + 1 - x, y0 + 1 - y) * u * v;
  };
  const p = bilinear(x + tx, y + ty);
  const n = bilinear(x - tx, y - ty);
  const residual = center - (p + n) * 0.5;
  const disagreement = Math.abs(p - n);
  const confidence = Math.min(1, magnitude / 0.09) * Math.max(0, 1 - disagreement / (magnitude + 0.025));
  return { residual, confidence };
}
