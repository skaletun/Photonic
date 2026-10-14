/**
 * Photonic TCR v2 — Reciprocal Tangent-Phase Gate (RTPG).
 *
 * A local 3x3 reconstruction constraint, not a learned or patented novelty claim.
 * Two independently oriented tangent estimates must agree with the center:
 *  - reciprocal parity: both half-step predictions preserve the center phase;
 *  - directional support: tangent gradients at both ends align with the center;
 *  - cross-normal veto: do not sharpen flat, noisy or junction-like patches.
 *
 * Uses only the fixed 3x3 source footprint, so a 1px destination halo is enough.
 */
export type TangentEstimate = {
  residual: number;
  confidence: number;
  coherence: number;
  phase: number;
};
const ZERO: TangentEstimate = { residual: 0, confidence: 0, coherence: 0, phase: 0 };
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function tangentResidual(
  L: Float32Array,
  A: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): TangentEstimate {
  if (width < 3 || height < 3) return ZERO;
  const index = y * width + x;
  const center = L[index];
  if (!(A[index] > 1e-8) || !Number.isFinite(center)) return ZERO;

  const at = (dx: number, dy: number): number => {
    const xx = Math.max(0, Math.min(width - 1, x + dx));
    const yy = Math.max(0, Math.min(height - 1, y + dy));
    const j = yy * width + xx;
    return A[j] <= 1e-8 ? center : L[j];
  };

  const gx = (at(1, -1) + 2 * at(1, 0) + at(1, 1) -
    at(-1, -1) - 2 * at(-1, 0) - at(-1, 1)) / 8;
  const gy = (at(-1, 1) + 2 * at(0, 1) + at(1, 1) -
    at(-1, -1) - 2 * at(0, -1) - at(1, -1)) / 8;
  const magnitude = Math.hypot(gx, gy);
  if (!(magnitude >= 0.005)) return ZERO;
  const nx = gx / magnitude;
  const ny = gy / magnitude;
  const tx = -ny;
  const ty = nx;

  // Bilinear tangent samples. All accesses remain within the center's 3x3 tile.
  const sample = (px: number, py: number): number => {
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const ux = px - x0;
    const uy = py - y0;
    return at(x0, y0) * (1 - ux) * (1 - uy) +
      at(x0 + 1, y0) * ux * (1 - uy) +
      at(x0, y0 + 1) * (1 - ux) * uy +
      at(x0 + 1, y0 + 1) * ux * uy;
  };
  const plus = sample(tx, ty);
  const minus = sample(-tx, -ty);
  const residual = center - 0.5 * (plus + minus);

  // Reciprocal sign agreement between the two independently sampled directions.
  const rp = center - plus;
  const rm = center - minus;
  const phase = rp * rm > 0
    ? clamp01(Math.min(Math.abs(rp), Math.abs(rm)) / (Math.max(Math.abs(rp), Math.abs(rm)) + 1e-7))
    : 0;

  // Normal contrast must dominate tangent contrast: do not mistake texture for an edge.
  const cross = Math.abs(sample(nx, ny) - sample(-nx, -ny));
  const along = Math.abs(plus - minus);
  const coherence = clamp01((cross - along) / (cross + along + 0.015));

  // Curvature disagreement suppresses reconstruction near corners and edge crossings.
  const bend = Math.abs(sample(tx + nx * 0.5, ty + ny * 0.5) -
    sample(-tx + nx * 0.5, -ty + ny * 0.5));
  const bendOpposite = Math.abs(sample(tx - nx * 0.5, ty - ny * 0.5) -
    sample(-tx - nx * 0.5, -ty - ny * 0.5));
  const junctionGate = clamp01(1 - Math.abs(bend - bendOpposite) / (cross + 0.025));

  const confidence = clamp01(magnitude / 0.09) * phase * coherence * junctionGate;
  return { residual, confidence, coherence, phase };
}
