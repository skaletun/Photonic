import assert from "node:assert/strict";
import { test } from "vitest";
import { HARD_MEGAPIXELS, MAX_SIDE } from "@/lib/config";
import { validateDest } from "@/lib/limits";
import {
  linearToSrgbByte,
  srgbToLinear,
  linearToSrgb,
  linearSrgbToOklab,
  oklabToLinearSrgb,
  TO_LINEAR,
  TO_SRGB,
} from "@/lib/resample/colorspace";
import {
  bilinearKernel,
  bicubicKernel,
  bsplineKernel,
  kernelWeight,
  lanczosKernel,
  mitchellKernel,
  nearestKernel,
  photonicKernel,
} from "@/lib/resample/kernels";
import { invSigmoid, lutInvSigmoid, lutSigmoid, resamplePhotonic, sigmoid } from "@/lib/resample/photonic";
import { buildContribs, reflectIndex, resampleSeparable } from "@/lib/resample/separable";

test("interpolating kernels equal 1 at origin", () => {
  assert.equal(nearestKernel(0), 1);
  assert.equal(bilinearKernel(0), 1);
  assert.equal(bicubicKernel(0), 1);
  assert.equal(lanczosKernel(0, 3), 1);
  assert.equal(photonicKernel(0), 1);
  assert.ok(Math.abs(kernelWeight("sinc", 0, 3) - 1) < 1e-9);
  assert.ok(Math.abs(kernelWeight("photonic", 0) - 1) < 1e-9);
});

test("B-spline is approximating: weight at 0 is 2/3", () => {
  assert.ok(Math.abs(bsplineKernel(0) - 2 / 3) < 1e-12);
});

test("Mitchell at 0 is 8/9", () => {
  assert.ok(Math.abs(mitchellKernel(0) - 8 / 9) < 1e-12);
});

test("Photonic Kaiser-sinc interpolates on the integer lattice", () => {
  assert.equal(photonicKernel(3), 0);
  assert.ok(Math.abs(photonicKernel(1)) < 1e-12);
  assert.ok(Math.abs(photonicKernel(2)) < 1e-12);
});

test("nearest has compact support", () => {
  assert.equal(nearestKernel(0.49), 1);
  assert.equal(nearestKernel(0.5), 0);
});

test("sRGB byte roundtrip stays within 1 level", () => {
  for (let i = 0; i < 256; i += 1) {
    const back = Math.round(linearToSrgb(srgbToLinear(i / 255)) * 255);
    assert.ok(Math.abs(back - i) <= 1, `byte ${i} -> ${back}`);
    const lut = linearToSrgbByte(TO_LINEAR[i], TO_SRGB);
    assert.ok(Math.abs(lut - i) <= 1, `lut ${i} -> ${lut}`);
  }
});

test("reflectIndex folds outside the range", () => {
  assert.equal(reflectIndex(0, 5), 0);
  assert.equal(reflectIndex(4, 5), 4);
  assert.equal(reflectIndex(-1, 5), 0);
  assert.equal(reflectIndex(5, 5), 4);
  assert.equal(reflectIndex(1, 1), 0);
});

test("contrib weights are normalized", () => {
  for (const id of ["photonic", "bilinear", "bicubic", "lanczos", "sinc", "bspline", "mitchell"]) {
    const c = buildContribs(32, 80, id, 3);
    for (let i = 0; i < 80; i += 1) {
      const n = c.counts[i];
      const o = c.offsets[i];
      let sum = 0;
      for (let k = 0; k < n; k += 1) sum += c.weights[o + k];
      assert.ok(Math.abs(sum - 1) < 1e-5, `${id} dest ${i} sum=${sum}`);
    }
  }
});

test("nearest 2×2 upscale 2x produces pixel blocks", async () => {
  const src = new Uint8ClampedArray([
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 0, 255,
  ]);
  const out = await resampleSeparable({
    src,
    srcW: 2,
    srcH: 2,
    destW: 4,
    destH: 4,
    kernelId: "nearest",
    colorSpace: "srgb",
  });
  assert.ok(out);
  const at = (x: number, y: number) => {
    const i = (y * 4 + x) * 4;
    return [out[i], out[i + 1], out[i + 2]];
  };
  assert.deepEqual(at(0, 0), [255, 0, 0]);
  assert.deepEqual(at(1, 1), [255, 0, 0]);
  assert.deepEqual(at(2, 0), [0, 255, 0]);
  assert.deepEqual(at(0, 2), [0, 0, 255]);
  assert.deepEqual(at(3, 3), [255, 255, 0]);
});

test("bilinear downscale of a flat field stays flat", async () => {
  const src = new Uint8ClampedArray(8 * 8 * 4);
  for (let i = 0; i < src.length; i += 4) {
    src[i] = 120;
    src[i + 1] = 40;
    src[i + 2] = 200;
    src[i + 3] = 255;
  }
  const out = await resampleSeparable({
    src,
    srcW: 8,
    srcH: 8,
    destW: 3,
    destH: 3,
    kernelId: "bilinear",
    colorSpace: "srgb",
  });
  assert.ok(out);
  for (let i = 0; i < out.length; i += 4) {
    assert.ok(Math.abs(out[i] - 120) <= 1);
    assert.ok(Math.abs(out[i + 1] - 40) <= 1);
    assert.ok(Math.abs(out[i + 2] - 200) <= 1);
    assert.equal(out[i + 3], 255);
  }
});

test("destination limits warn and reject oversized frames", () => {
  assert.equal(validateDest(800, 600).ok, true);
  assert.equal(validateDest(0, 10).ok, false);
  assert.equal(validateDest(MAX_SIDE + 1, 10).ok, false);
  const warn = validateDest(10000, 9000);
  assert.equal(warn.ok, true);
  assert.equal(warn.warn, true);
  const hard = Math.ceil(Math.sqrt(HARD_MEGAPIXELS * 1_000_000)) + 200;
  const refused = validateDest(hard, hard);
  assert.equal(refused.ok, false);
});

test("sigmoid roundtrip stays close on [0,1]", () => {
  assert.ok(Math.abs(sigmoid(0)) < 1e-12);
  assert.ok(Math.abs(sigmoid(1) - 1) < 1e-12);
  assert.ok(Math.abs(sigmoid(0.5) - 0.5) < 1e-12);
  for (const x of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    const back = invSigmoid(sigmoid(x));
    assert.ok(Math.abs(back - x) < 1e-6, `analytic ${x} -> ${back}`);
    const lut = lutInvSigmoid(lutSigmoid(x));
    assert.ok(Math.abs(lut - x) < 0.004, `lut ${x} -> ${lut}`);
  }
});

test("OKLab roundtrip of sRGB bytes stays within 1 level", () => {
  const lab = [0, 0, 0];
  const rgb = [0, 0, 0];
  const samples = [
    [0, 0, 0],
    [255, 255, 255],
    [120, 40, 200],
    [255, 0, 0],
    [16, 16, 16],
  ];
  for (const [r, g, b] of samples) {
    linearSrgbToOklab(TO_LINEAR[r], TO_LINEAR[g], TO_LINEAR[b], lab);
    oklabToLinearSrgb(lab[0], lab[1], lab[2], rgb);
    const back = [
      linearToSrgbByte(rgb[0], TO_SRGB),
      linearToSrgbByte(rgb[1], TO_SRGB),
      linearToSrgbByte(rgb[2], TO_SRGB),
    ];
    assert.ok(Math.abs(back[0] - r) <= 1, `R ${r} -> ${back[0]}`);
    assert.ok(Math.abs(back[1] - g) <= 1, `G ${g} -> ${back[1]}`);
    assert.ok(Math.abs(back[2] - b) <= 1, `B ${b} -> ${back[2]}`);
  }
});

function grayStep(width: number, height: number, lo: number, hi: number) {
  const src = new Uint8ClampedArray(width * height * 4);
  const mid = width / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = x < mid ? lo : hi;
      const i = (y * width + x) * 4;
      src[i] = v;
      src[i + 1] = v;
      src[i + 2] = v;
      src[i + 3] = 255;
    }
  }
  return src;
}

function extrema(out: Uint8ClampedArray) {
  let min = 255;
  let max = 0;
  for (let i = 0; i < out.length; i += 4) {
    const v = out[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

function riseWidth(out: Uint8ClampedArray, width: number, height: number, lo: number, hi: number) {
  const y = (height / 2) | 0;
  const t10 = lo + 0.1 * (hi - lo);
  const t90 = lo + 0.9 * (hi - lo);
  let x10 = -1;
  let x90 = -1;
  for (let x = 0; x < width; x += 1) {
    const v = out[(y * width + x) * 4];
    if (x10 < 0 && v >= t10) x10 = x;
    if (x90 < 0 && v >= t90) x90 = x;
  }
  return x90 - x10;
}

function redWhiteStep(width: number, height: number) {
  const src = new Uint8ClampedArray(width * height * 4);
  const mid = width / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const left = x < mid;
      src[i] = left ? 220 : 240;
      src[i + 1] = left ? 36 : 240;
      src[i + 2] = left ? 36 : 240;
      src[i + 3] = 255;
    }
  }
  return src;
}

/** Положительный G−R / B−R — голубой ореол у красно-белого края. */
function maxCyanShift(out: Uint8ClampedArray) {
  let max = 0;
  for (let i = 0; i < out.length; i += 4) {
    const cyan = Math.max(out[i + 1] - out[i], out[i + 2] - out[i]);
    if (cyan > max) max = cyan;
  }
  return max;
}

test("Photonic rings less than Lanczos-3 on a gray step", async () => {
  const lo = 32;
  const hi = 224;
  const src = grayStep(16, 16, lo, hi);
  const common = { srcW: 16, srcH: 16, destW: 32, destH: 32 };
  const lanczos = await resampleSeparable({
    src,
    ...common,
    kernelId: "lanczos",
    a: 3,
    colorSpace: "linear",
  });
  const photonic = await resamplePhotonic({
    src: grayStep(16, 16, lo, hi),
    ...common,
  });
  assert.ok(lanczos && photonic);
  const l = extrema(lanczos);
  const p = extrema(photonic);
  const lOver = Math.max(0, l.max - hi) + Math.max(0, lo - l.min);
  const pOver = Math.max(0, p.max - hi) + Math.max(0, lo - p.min);
  assert.ok(lOver > 0, `Lanczos should overshoot, got min=${l.min} max=${l.max}`);
  assert.ok(
    pOver < lOver,
    `Photonic overshoot ${pOver} (min=${p.min} max=${p.max}) should be < Lanczos ${lOver} (min=${l.min} max=${l.max})`,
  );
  assert.ok(pOver <= 4, `Photonic overshoot should stay tiny, got ${pOver}`);
});

test("Photonic edge is sharper than bilinear", async () => {
  const lo = 32;
  const hi = 224;
  const src = grayStep(16, 16, lo, hi);
  const common = { src, srcW: 16, srcH: 16, destW: 32, destH: 32 };
  const bilinear = await resampleSeparable({
    ...common,
    kernelId: "bilinear",
    colorSpace: "linear",
  });
  const photonic = await resamplePhotonic({
    src: grayStep(16, 16, lo, hi),
    srcW: 16,
    srcH: 16,
    destW: 32,
    destH: 32,
  });
  assert.ok(bilinear && photonic);
  const bW = riseWidth(bilinear, 32, 32, lo, hi);
  const pW = riseWidth(photonic, 32, 32, lo, hi);
  assert.ok(pW > 0 && bW > 0, `rise widths bilinear=${bW} photonic=${pW}`);
  assert.ok(pW <= bW, `Photonic rise ${pW} should be <= bilinear ${bW}`);
});

test("Photonic has less cyan halo than RGB Lanczos on a red-white edge", async () => {
  const src = redWhiteStep(16, 16);
  const common = { srcW: 16, srcH: 16, destW: 32, destH: 32 };
  const lanczos = await resampleSeparable({
    src,
    ...common,
    kernelId: "lanczos",
    a: 3,
    colorSpace: "linear",
  });
  const photonic = await resamplePhotonic({
    src: redWhiteStep(16, 16),
    ...common,
  });
  assert.ok(lanczos && photonic);
  const lCyan = maxCyanShift(lanczos);
  const pCyan = maxCyanShift(photonic);
  assert.ok(lCyan > 0, `Lanczos should show a cyan halo, got ${lCyan}`);
  assert.ok(pCyan < lCyan, `Photonic cyan ${pCyan} should be < Lanczos ${lCyan}`);
});

test("Photonic keeps a flat field", async () => {
  const src = new Uint8ClampedArray(8 * 8 * 4);
  for (let i = 0; i < src.length; i += 4) {
    src[i] = 120;
    src[i + 1] = 40;
    src[i + 2] = 200;
    src[i + 3] = 255;
  }
  const out = await resamplePhotonic({
    src,
    srcW: 8,
    srcH: 8,
    destW: 5,
    destH: 5,
  });
  assert.ok(out);
  for (let i = 0; i < out.length; i += 4) {
    assert.ok(Math.abs(out[i] - 120) <= 2, `R ${out[i]}`);
    assert.ok(Math.abs(out[i + 1] - 40) <= 2, `G ${out[i + 1]}`);
    assert.ok(Math.abs(out[i + 2] - 200) <= 2, `B ${out[i + 2]}`);
    assert.equal(out[i + 3], 255);
  }
});
