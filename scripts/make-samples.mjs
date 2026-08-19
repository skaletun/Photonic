import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "samples");

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u32(n) {
  return Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = u32(data.length);
  const body = Buffer.concat([t, data]);
  const crc = u32(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function fill(rgba, w, h, color) {
  for (let i = 0; i < w * h; i += 1) rgba.set(color, i * 4);
}

function rect(rgba, w, x0, y0, rw, rh, color) {
  const x1 = Math.min(w, x0 + rw);
  const y1 = y0 + rh;
  for (let y = y0; y < y1; y += 1) {
    const row = y * w * 4;
    for (let x = x0; x < x1; x += 1) rgba.set(color, row + x * 4);
  }
}

const FONT = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  g: ["00000", "01111", "10001", "01111", "00001", "01110", "00000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function blitGlyph(rgba, w, x, y, ch, scale, color) {
  const glyph = FONT[ch];
  if (!glyph) return 5 * scale;
  for (let gy = 0; gy < 7; gy += 1) {
    for (let gx = 0; gx < 5; gx += 1) {
      if (glyph[gy][gx] === "1") rect(rgba, w, x + gx * scale, y + gy * scale, scale, scale, color);
    }
  }
  return 6 * scale;
}

function writeText(rgba, w, x, y, text, scale, color) {
  let cx = x;
  for (const ch of text) cx += blitGlyph(rgba, w, cx, y, ch, scale, color);
}

function makeType() {
  const w = 1280;
  const h = 720;
  const rgba = Buffer.alloc(w * h * 4);
  fill(rgba, w, h, [243, 240, 234, 255]);
  const ink = [26, 28, 27, 255];
  writeText(rgba, w, 72, 88, "PHOTONIC", 14, ink);
  writeText(rgba, w, 72, 280, "Aa", 28, ink);
  writeText(rgba, w, 72, 540, " agata ", 10, ink);
  rect(rgba, w, 72, 500, 420, 3, ink);
  return encodePng(w, h, rgba);
}

function makePixel() {
  const w = 32;
  const h = 32;
  const rgba = Buffer.alloc(w * h * 4);
  const sky = [91, 181, 171, 255];
  const paper = [243, 241, 236, 255];
  const ink = [16, 18, 20, 255];
  const brass = [196, 184, 164, 255];
  const signal = [61, 154, 144, 255];
  fill(rgba, w, h, sky);
  rect(rgba, w, 0, 22, 32, 10, paper);
  rect(rgba, w, 8, 12, 16, 12, ink);
  rect(rgba, w, 6, 10, 20, 3, brass);
  rect(rgba, w, 14, 6, 4, 5, ink);
  rect(rgba, w, 12, 18, 4, 6, signal);
  rect(rgba, w, 18, 16, 4, 4, paper);
  rect(rgba, w, 2, 24, 3, 3, ink);
  rect(rgba, w, 27, 25, 2, 2, ink);
  return encodePng(w, h, rgba);
}

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "type.png"), makeType());
await writeFile(join(outDir, "pixel.png"), makePixel());
console.log("Wrote public/samples/type.png and pixel.png");
