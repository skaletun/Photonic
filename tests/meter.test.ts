import assert from "node:assert/strict";
import { test } from "vitest";
import { CLIP_WARN, cropImageData, measureFrame } from "@/lib/meter";

class MemoryImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace = "srgb" as const;
  constructor(dataOrW: Uint8ClampedArray | number, width?: number, height?: number) {
    if (typeof dataOrW === "number") {
      this.width = dataOrW;
      this.height = width ?? 0;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    } else {
      this.data = dataOrW;
      this.width = width ?? 0;
      this.height = height ?? 0;
    }
  }
}

if (typeof ImageData === "undefined") {
  Object.assign(globalThis, { ImageData: MemoryImageData });
}

function frame(width: number, height: number, rgb: [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return { data, width, height } as ImageData;
}

test("64-bin luma histogram and clip share", () => {
  const black = measureFrame(frame(4, 4, [0, 0, 0]));
  assert.equal(black.bins.length, 64);
  assert.equal(black.bins[0], 16);
  assert.equal(black.clipLow, 1);
  assert.equal(black.clipHigh, 0);
  assert.equal(black.scan.length, 64);

  const white = measureFrame(frame(2, 2, [255, 255, 255]));
  assert.equal(white.clipHigh, 1);
  assert.ok(white.clipHigh > CLIP_WARN);
});

test("scanline samples the centre row", () => {
  const data = new Uint8ClampedArray(8 * 4 * 4);
  for (let x = 0; x < 8; x += 1) {
    const i = (2 * 8 + x) * 4;
    data[i] = x * 30;
    data[i + 1] = x * 30;
    data[i + 2] = x * 30;
    data[i + 3] = 255;
  }
  const meter = measureFrame({ data, width: 8, height: 4 } as ImageData);
  assert.equal(meter.scan[0], 0);
  assert.ok(meter.scan[63] > 100);
});

test("crop copies a 1:1 window", () => {
  const src = new ImageData(8, 8);
  src.data[4 * (3 * 8 + 2)] = 200;
  const crop = cropImageData(src, 2, 3, 2, 2);
  assert.equal(crop.width, 2);
  assert.equal(crop.data[0], 200);
});
