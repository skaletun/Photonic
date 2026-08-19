import assert from "node:assert/strict";
import { test } from "vitest";
import {
  injectJpegExif,
  injectPngText,
  prepareTiff,
  readPassport,
  tiffFromHeif,
  tiffFromJpeg,
} from "@/lib/io/exif";

function write16(buf: Uint8Array, off: number, value: number) {
  buf[off] = value & 255;
  buf[off + 1] = (value >>> 8) & 255;
}

function write32(buf: Uint8Array, off: number, value: number) {
  buf[off] = value & 255;
  buf[off + 1] = (value >>> 8) & 255;
  buf[off + 2] = (value >>> 16) & 255;
  buf[off + 3] = (value >>> 24) & 255;
}

function writeEntry(buf: Uint8Array, off: number, tag: number, type: number, count: number, value: number) {
  write16(buf, off, tag);
  write16(buf, off + 2, type);
  write32(buf, off + 4, count);
  write32(buf, off + 8, value);
}

function makeTiff() {
  const tiff = new Uint8Array(104);
  tiff[0] = 0x49;
  tiff[1] = 0x49;
  tiff[2] = 0x2a;
  write32(tiff, 4, 8);
  write16(tiff, 8, 6);
  writeEntry(tiff, 10, 0x0112, 3, 1, 6);
  writeEntry(tiff, 22, 0x8298, 2, 2, 0x63);
  writeEntry(tiff, 34, 0x0100, 3, 1, 100);
  writeEntry(tiff, 46, 0x0101, 3, 1, 50);
  writeEntry(tiff, 58, 0xa002, 4, 1, 100);
  writeEntry(tiff, 70, 0x8825, 4, 1, 86);
  write32(tiff, 82, 0);
  write16(tiff, 86, 1);
  writeEntry(tiff, 88, 0x0001, 2, 2, 0x4e);
  write32(tiff, 100, 0);
  return tiff;
}

function read16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function read32(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
}

function tagsOf(tiff: Uint8Array) {
  const ifd0 = read32(tiff, 4) >>> 0;
  const count = read16(tiff, ifd0);
  const tags = new Map<number, number>();
  for (let i = 0; i < count; i += 1) {
    const field = ifd0 + 2 + i * 12;
    tags.set(read16(tiff, field), read32(tiff, field + 8) >>> 0);
  }
  return tags;
}

function jpegShell() {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xff, 0xd9,
  ]);
}

test("JPEG EXIF keeps copyright, sets orientation 1, drops GPS, updates size", () => {
  const tiff = makeTiff();
  const jpeg = injectJpegExif(jpegShell(), tiff);
  const passport = readPassport(jpeg, "image/jpeg");
  assert.equal(passport.hasExif, true);
  assert.equal(passport.copyright, "c");

  const prepared = prepareTiff(passport.tiff as Uint8Array, 800, 600);
  const tags = tagsOf(prepared);
  assert.equal(tags.get(0x0112), 1);
  assert.equal(tags.has(0x8825), false);
  assert.equal(tags.get(0x0100), 800);
  assert.equal(tags.get(0x0101), 600);
  assert.equal(tags.get(0xa002), 800);

  const exported = injectJpegExif(jpegShell(), prepared);
  const found = tiffFromJpeg(exported);
  assert.ok(found);
  const outTags = tagsOf(found.tiff);
  assert.equal(outTags.has(0x8825), false);
  assert.equal(outTags.get(0x0112), 1);
  const roundTrip = readPassport(exported, "image/jpeg");
  assert.equal(roundTrip.copyright, "c");
});

test("PNG tEXt Copyright is preserved", () => {
  const png = Uint8Array.from(
    Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
  );
  const withText = injectPngText(png, "Copyright", "Studio");
  const passport = readPassport(withText, "image/png");
  assert.equal(passport.hasExif, true);
  assert.equal(passport.copyright, "Studio");
});

test("HEIF ISOBMFF Exif box yields a bounded TIFF", () => {
  const tiff = makeTiff();
  const payload = new Uint8Array(6 + tiff.length);
  payload.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0);
  payload.set(tiff, 6);
  const size = 8 + payload.length;
  const box = new Uint8Array(24 + size);
  box.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], 0);
  box[24] = (size >>> 24) & 255;
  box[25] = (size >>> 16) & 255;
  box[26] = (size >>> 8) & 255;
  box[27] = size & 255;
  box.set([0x45, 0x78, 0x69, 0x66], 28);
  box.set(payload, 32);
  const found = tiffFromHeif(box);
  assert.ok(found);
  assert.ok(found.length <= tiff.length + 16);
  const tags = tagsOf(found);
  assert.equal(tags.get(0x0112), 6);
  assert.equal(tags.has(0x8825), true);
});
