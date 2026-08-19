import assert from "node:assert/strict";
import { test } from "vitest";
import {
  SRGB_ICC,
  classifyIcc,
  injectJpegIcc,
  injectPngIcc,
  injectWebpIcc,
  readIcc,
  stripJpegIcc,
} from "@/lib/io/icc";

function jpegShell() {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xff, 0xd9,
  ]);
}

function webpShell() {
  const out = new Uint8Array(30);
  out.set([0x52, 0x49, 0x46, 0x46], 0);
  out[4] = 22;
  out.set([0x57, 0x45, 0x42, 0x50], 8);
  out.set([0x56, 0x50, 0x38, 0x58], 12);
  out[16] = 10;
  return out;
}

test("built profile is tagged sRGB", () => {
  assert.equal(classifyIcc(SRGB_ICC), "srgb");
  assert.equal(SRGB_ICC[36], 0x61);
  assert.equal(classifyIcc(null), "none");
});

test("JPEG APP2 ICC survives inject and is readable", () => {
  const withIcc = injectJpegIcc(jpegShell(), SRGB_ICC);
  const found = readIcc(withIcc, "image/jpeg");
  assert.equal(found.kind, "srgb");
  assert.ok(found.profile);
  assert.equal(found.profile?.length, SRGB_ICC.length);
  assert.equal(found.profile?.[36], 0x61);
  const stripped = stripJpegIcc(withIcc);
  assert.equal(readIcc(stripped, "image/jpeg").kind, "none");
  const again = injectJpegIcc(withIcc, SRGB_ICC);
  const round = readIcc(again, "image/jpeg");
  assert.equal(round.kind, "srgb");
  assert.equal(round.profile?.length, SRGB_ICC.length);
});

test("PNG iCCP chunk is inserted before IDAT", async () => {
  const png = Uint8Array.from(
    Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
  );
  const withIcc = await Promise.race([
    injectPngIcc(png, SRGB_ICC),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("injectPngIcc hung")), 3000);
    }),
  ]);
  const found = readIcc(withIcc, "image/png");
  assert.equal(found.kind, "srgb");
});

test("WebP ICCP chunk is present after inject", () => {
  const withIcc = injectWebpIcc(webpShell(), SRGB_ICC);
  const found = readIcc(withIcc, "image/webp");
  assert.equal(found.kind, "srgb");
  assert.equal(found.profile?.length, SRGB_ICC.length);
});
