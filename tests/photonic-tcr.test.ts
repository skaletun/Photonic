import assert from "node:assert/strict";
import { test } from "vitest";
import { tangentResidual } from "@/lib/resample/photonic-tcr";
import { resampleFrame } from "@/lib/resample/engine";

test("TCR is inert on constant lightness", () => {
  const l = new Float32Array(25).fill(0.45);
  const a = new Float32Array(25).fill(1);
  const result = tangentResidual(l, a, 5, 5, 2, 2);
  assert.equal(result.confidence, 0);
  assert.equal(result.residual, 0);
});

test("TCR rejects transparent center pixels", () => {
  const l = Float32Array.from({ length: 25 }, (_, i) => i / 24);
  const a = new Float32Array(25).fill(1);
  a[12] = 0;
  const result = tangentResidual(l, a, 5, 5, 2, 2);
  assert.equal(result.residual, 0);
  assert.equal(result.confidence, 0);
});

test("TCR confidence and residual remain finite on random and diagonal patterns", () => {
  const a = new Float32Array(81).fill(1);
  const l = Float32Array.from({ length: 81 }, (_, i) => ((i * 73 + 19) % 127) / 127);
  for (let y = 0; y < 9; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      const { residual, confidence, coherence, phase } = tangentResidual(l, a, 9, 9, x, y);
      assert.ok(coherence >= 0 && coherence <= 1);
      assert.ok(phase >= 0 && phase <= 1);
      assert.ok(Number.isFinite(residual));
      assert.ok(Number.isFinite(confidence));
      assert.ok(confidence >= 0 && confidence <= 1);
    }
  }
});

function fixture(): { width: number; height: number; data: Uint8ClampedArray } {
  const width = 8, height = 8;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const v = x + y < 8 ? 32 : 224;
    const i = (y * width + x) * 4;
    data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
  }
  return { width, height, data };
}

test("TCR full frame and cropped regions produce identical pixels", async () => {
  const source = fixture();
  const settings = { kernelId: "photonic-tcr", destW: 24, destH: 24 };
  const full = await resampleFrame(source, settings);
  const region = { x: 5, y: 7, w: 11, h: 10 };
  const crop = await resampleFrame(source, { ...settings, region });
  assert.ok(full && crop);
  for (let y = 0; y < region.h; y += 1) {
    const start = ((y + region.y) * settings.destW + region.x) * 4;
    assert.deepEqual(
      Array.from(crop.subarray(y * region.w * 4, (y + 1) * region.w * 4)),
      Array.from(full.subarray(start, start + region.w * 4)),
    );
  }
});
