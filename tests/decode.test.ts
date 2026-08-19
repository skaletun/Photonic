import assert from "node:assert/strict";
import { test } from "vitest";
import { sniffMagic, sniffMime } from "@/lib/io/decode";

test("sniffs JPEG PNG WebP GIF BMP", () => {
  assert.equal(sniffMagic(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffMagic(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  const webp = new Uint8Array(12);
  webp.set([0x52, 0x49, 0x46, 0x46], 0);
  webp.set([0x57, 0x45, 0x42, 0x50], 8);
  assert.equal(sniffMagic(webp), "image/webp");
  assert.equal(sniffMagic(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])), "image/gif");
  assert.equal(sniffMagic(new Uint8Array([0x42, 0x4d, 0x00, 0x00])), "image/bmp");
});

test("sniffs HEIC and AVIF from ftyp brand", () => {
  const heic = new Uint8Array(12);
  heic.set([0x66, 0x74, 0x79, 0x70], 4);
  heic.set([0x68, 0x65, 0x69, 0x63], 8);
  assert.equal(sniffMagic(heic), "image/heic");

  const heif = new Uint8Array(12);
  heif.set([0x66, 0x74, 0x79, 0x70], 4);
  heif.set([0x6d, 0x69, 0x66, 0x31], 8);
  assert.equal(sniffMagic(heif), "image/heic");

  const avif = new Uint8Array(12);
  avif.set([0x66, 0x74, 0x79, 0x70], 4);
  avif.set([0x61, 0x76, 0x69, 0x66], 8);
  assert.equal(sniffMagic(avif), "image/avif");
});

test("sniffMime maps heif and empty type with extension", () => {
  const file = new File([new Uint8Array(12)], "frame.heic", { type: "" });
  assert.equal(sniffMime(file), "image/heic");
  const typed = new File([new Uint8Array(12)], "frame.heif", { type: "image/heif" });
  assert.equal(sniffMime(typed), "image/heic");
});
