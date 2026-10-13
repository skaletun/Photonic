import { describe, expect, it } from "vitest";
import { resamplePhotonic } from "../src/lib/resample/photonic";
import { resampleFrame } from "../src/lib/resample/engine";
import golden from "./fixtures/photonic-golden.json";

function source(width = 7, height = 9) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (i * 29) % 256; data[i + 1] = (i * 17) % 256; data[i + 2] = (i * 11) % 256;
    data[i + 3] = (i / 4) % 5 === 0 ? 0 : 255;
  }
  return { data, width, height };
}
function crop(data: Uint8ClampedArray, width: number, x: number, y: number, w: number, h: number) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) out.set(data.subarray(((y + row) * width + x) * 4, ((y + row) * width + x + w) * 4), row * w * 4);
  return out;
}
describe("bounded Photonic pipeline", () => {
  it("preserves the previous full-frame algorithm byte for byte", async () => {
    const src = source();
    for (const frame of golden) {
      const pixels = await resamplePhotonic({ src: src.data, srcW: src.width, srcH: src.height, destW: frame.destW, destH: frame.destH });
      expect(Array.from(pixels!)).toEqual(frame.data);
    }
  });
  it("matches regions to full exports across strip boundaries, edges, transparency and fractional scales", async () => {
    const src = source();
    for (const kernelId of ["photonic", "lanczos", "nearest"]) {
      for (const [destW, destH] of [[19, 57], [14, 18], [3, 4], [7, 9]]) {
        for (const sharpen of [false, true]) {
          const opts = { destW, destH, kernelId, unsharp: { enabled: sharpen, amount: 80, radius: 0.6, threshold: 2 } };
          const full = await resampleFrame(src, opts);
          for (const region of [{ x: 0, y: 0, w: Math.min(3, destW), h: Math.min(4, destH) },
            { x: destW - 2, y: destH - 2, w: 2, h: 2 },
            { x: 1, y: Math.min(23, destH - 2), w: 2, h: 2 }]) {
            const roi = await resampleFrame(src, { ...opts, region });
            expect(roi, `${kernelId} ${destW}×${destH}, sharpen=${sharpen}, y=${region.y}`).toEqual(crop(full!, destW, region.x, region.y, region.w, region.h));
          }
        }
      }
    }
  });
  it("stops a cancelled calculation without allocating a full result", async () => {
    const src = source();
    expect(await resampleFrame(src, { destW: 1000, destH: 1000, kernelId: "photonic" }, { shouldAbort: () => true })).toBeNull();
  });
});
