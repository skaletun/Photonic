import assert from "node:assert/strict";
import { test } from "vitest";
import { applyDestLumaSnap, applyLumaConsistency, boxDownsample } from "@/lib/resample/photonic-consistency";
import { analyzePatch, engineWeights } from "@/lib/resample/photonic-field";

function patch(values: number[]) {
  return Float32Array.from(values);
}

test("analyzePatch marks a vertical step as an edge", () => {
  const f = analyzePatch(patch([0.1, 0.1, 0.9, 0.1, 0.1, 0.9, 0.1, 0.1, 0.9]));
  assert.ok(f.edge > 0.6, `edge ${f.edge}`);
  assert.ok(f.aniso > f.std, `aniso ${f.aniso} std ${f.std}`);
  const w = engineWeights(f);
  assert.ok(w.line > w.texture && w.line > w.form, `weights ${JSON.stringify(w)}`);
});

test("analyzePatch marks a flat patch as form", () => {
  const f = analyzePatch(patch([0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4]));
  assert.ok(f.smoothness > 0.9, `smooth ${f.smoothness}`);
  assert.ok(f.edge < 0.05, `edge ${f.edge}`);
  assert.ok(f.confidence < 0.2, `C ${f.confidence}`);
  const w = engineWeights(f);
  assert.ok(w.form > 0.8, `form ${w.form}`);
});

test("analyzePatch treats incoherent high-frequency as noise, not a line", () => {
  const f = analyzePatch(patch([0.05, 0.95, 0.1, 0.9, 0.08, 0.92, 0.15, 0.85, 0.2]));
  assert.ok(f.edge < 0.7, `edge ${f.edge}`);
  assert.ok(f.noise > 0.2 || f.texture > 0.15, `noise ${f.noise} texture ${f.texture}`);
  const w = engineWeights(f);
  assert.ok(w.line < 0.85, `line ${w.line}`);
});

test("boxDownsample of a constant 2x field returns the constant", () => {
  const dest = new Float32Array(16).fill(0.37);
  const down = boxDownsample(dest, 4, 4, 2, 2);
  for (const v of down) assert.ok(Math.abs(v - 0.37) < 1e-6, `${v}`);
});

test("luma consistency is weak on a flat span and strong on a wide one", () => {
  const srcL = new Float32Array([0.4, 0.4, 0.4, 0.4]);
  const destA = new Float32Array(16).fill(1);

  const destFlat = new Float32Array(16).fill(0.55);
  applyLumaConsistency({
    destL: destFlat,
    destA,
    destW: 4,
    destH: 4,
    srcL,
    srcW: 2,
    srcH: 2,
    mn: new Float32Array(16).fill(0.54),
    mx: new Float32Array(16).fill(0.56),
  });
  let sumFlat = 0;
  for (const v of destFlat) sumFlat += v;
  assert.ok(Math.abs(sumFlat / destFlat.length - 0.55) < 0.01, `flat mean ${sumFlat / destFlat.length}`);

  const destWide = new Float32Array(16).fill(0.55);
  applyLumaConsistency({
    destL: destWide,
    destA,
    destW: 4,
    destH: 4,
    srcL,
    srcW: 2,
    srcH: 2,
    mn: new Float32Array(16).fill(0),
    mx: new Float32Array(16).fill(1),
  });
  let sumWide = 0;
  for (const v of destWide) sumWide += v;
  assert.ok(sumWide / destWide.length < sumFlat / destFlat.length, `wide ${sumWide / destWide.length} flat ${sumFlat / destFlat.length}`);
});

test("dest luma snap stays inside [min, max] and steepens a 2x edge", () => {
  const destL = new Float32Array([
    0.2, 0.28, 0.72, 0.8,
    0.2, 0.28, 0.72, 0.8,
    0.2, 0.28, 0.72, 0.8,
    0.2, 0.28, 0.72, 0.8,
  ]);
  const destA = new Float32Array(16).fill(1);
  const mn = new Float32Array(16).fill(0.2);
  const mx = new Float32Array(16).fill(0.8);
  const before = destL[1];
  applyDestLumaSnap({ destL, destA, destW: 4, destH: 4, mn, mx });
  for (let i = 0; i < destL.length; i += 1) {
    assert.ok(destL[i] >= 0.2 - 1e-6 && destL[i] <= 0.8 + 1e-6, `out of range ${destL[i]}`);
  }
  assert.ok(destL[1] < before, `left of edge ${destL[1]} was ${before}`);
});

test("luma consistency pulls a biased 2x block back toward the source", () => {
  const srcL = new Float32Array([0.4, 0.4, 0.4, 0.4]);
  const destL = new Float32Array(16).fill(0.55);
  const destA = new Float32Array(16).fill(1);
  const mn = new Float32Array(16).fill(0);
  const mx = new Float32Array(16).fill(1);
  applyLumaConsistency({
    destL,
    destA,
    destW: 4,
    destH: 4,
    srcL,
    srcW: 2,
    srcH: 2,
    mn,
    mx,
  });
  let sum = 0;
  for (const v of destL) sum += v;
  const mean = sum / destL.length;
  assert.ok(mean < 0.55 && mean > 0.4, `mean ${mean}`);
});
