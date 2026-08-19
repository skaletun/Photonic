/**
 * Компактное поле признаков по 3×3 сигмоидной L.
 * Confidence — доказательство структуры, не «приятность».
 */

export const EDGE_ANISO = 2.4;
export const TEXTURE_STD = 0.02;

export type PhotonicFeatures = {
  mag: number;
  std: number;
  aniso: number;
  gx: number;
  gy: number;
  edge: number;
  texture: number;
  noise: number;
  smoothness: number;
  confidence: number;
};

export type EngineWeights = {
  line: number;
  form: number;
  texture: number;
};

function clamp01(x: number) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/** Sobel + статистики 3×3, row-major. */
export function analyzePatch(patch: Float32Array): PhotonicFeatures {
  let sum = 0;
  let sum2 = 0;
  for (let i = 0; i < 9; i += 1) {
    const v = patch[i];
    sum += v;
    sum2 += v * v;
  }
  const mean = sum / 9;
  const variance = Math.max(0, sum2 / 9 - mean * mean);
  const std = Math.sqrt(variance);
  const gx = -patch[0] + patch[2] - 2 * patch[3] + 2 * patch[5] - patch[6] + patch[8];
  const gy = -patch[0] - 2 * patch[1] - patch[2] + patch[6] + 2 * patch[7] + patch[8];
  const mag = Math.hypot(gx, gy);
  const aniso = mag / (std + 1e-6);
  const edge = clamp01((aniso - 0.6) / (EDGE_ANISO + 0.4));
  const noise = clamp01(std / 0.14) * clamp01(1.15 - aniso);
  const texture = clamp01(std / 0.07) * (1 - edge) * (1 - noise);
  const smoothness = clamp01(1 - std / 0.035);
  const confidence = clamp01(edge + texture * 0.7);
  return { mag, std, aniso, gx, gy, edge, texture, noise, smoothness, confidence };
}

export function engineWeights(features: PhotonicFeatures): EngineWeights {
  const line = features.edge;
  const texture = features.texture;
  const form = features.smoothness + (1 - features.confidence) * 0.4;
  const sum = line + texture + form;
  if (!(sum > 1e-8)) return { line: 0, form: 1, texture: 0 };
  return { line: line / sum, form: form / sum, texture: texture / sum };
}
