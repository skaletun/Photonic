/**
 * README stills: checker for nearest, Photonic vs Lanczos from the real engines.
 * Run: npx vite-node scripts/make-readme-images.ts
 */

import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resamplePhotonic } from "../src/lib/resample/photonic.ts";
import { resampleSeparable } from "../src/lib/resample/separable.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = join(root, "docs", "readme");
const assetsDir = join(root, "public", "assets");

const PAPER = [243, 240, 234, 255] as const;
const INK = [16, 18, 20, 255] as const;
const MUTE = [90, 88, 82, 255] as const;
const BRASS = [196, 184, 164, 255] as const;
const SIGNAL = [61, 154, 144, 255] as const;

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u32(n: number) {
  return Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
}

function chunk(type: string, data: Uint8Array) {
  const t = Buffer.from(type);
  const body = Buffer.concat([t, data]);
  return Buffer.concat([Buffer.from(u32(data.length)), body, Buffer.from(u32(crc32(body)))]);
}

function encodePng(width: number, height: number, rgba: Uint8Array) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, row + 1);
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

function fill(rgba: Uint8Array, w: number, h: number, color: readonly number[]) {
  for (let i = 0; i < w * h; i += 1) rgba.set(color, i * 4);
}

function rect(
  rgba: Uint8Array,
  w: number,
  x0: number,
  y0: number,
  rw: number,
  rh: number,
  color: readonly number[],
) {
  const h = rgba.length / (w * 4);
  const x1 = Math.min(w, x0 + rw);
  const y1 = Math.min(h, y0 + rh);
  for (let y = Math.max(0, y0); y < y1; y += 1) {
    const row = y * w * 4;
    for (let x = Math.max(0, x0); x < x1; x += 1) rgba.set(color, row + x * 4);
  }
}

const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
};

function blitGlyph(
  rgba: Uint8Array,
  w: number,
  x: number,
  y: number,
  ch: string,
  scale: number,
  color: readonly number[],
) {
  const glyph = FONT[ch] ?? FONT[" "];
  for (let gy = 0; gy < 7; gy += 1) {
    for (let gx = 0; gx < 5; gx += 1) {
      if (glyph[gy][gx] === "1") rect(rgba, w, x + gx * scale, y + gy * scale, scale, scale, color);
    }
  }
  return 6 * scale;
}

function writeText(
  rgba: Uint8Array,
  w: number,
  x: number,
  y: number,
  text: string,
  scale: number,
  color: readonly number[],
) {
  let cx = x;
  for (const ch of text) cx += blitGlyph(rgba, w, cx, y, ch, scale, color);
}

function blit(
  dest: Uint8Array,
  dw: number,
  src: Uint8Array,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
) {
  for (let y = 0; y < sh; y += 1) {
    dest.set(src.subarray(y * sw * 4, (y + 1) * sw * 4), ((dy + y) * dw + dx) * 4);
  }
}

function nearest(
  src: Uint8Array,
  sw: number,
  sh: number,
  scale: number,
): { data: Uint8Array; w: number; h: number } {
  const w = sw * scale;
  const h = sh * scale;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < w; x += 1) {
      const sx = Math.floor(x / scale);
      data.set(src.subarray((sy * sw + sx) * 4, (sy * sw + sx) * 4 + 4), (y * w + x) * 4);
    }
  }
  return { data, w, h };
}

function makeTypePlate(w: number, h: number) {
  const rgba = new Uint8Array(w * h * 4);
  fill(rgba, w, h, PAPER);
  writeText(rgba, w, 10, 14, "PHOTONIC", 3, INK);
  writeText(rgba, w, 10, 48, "Aa", 6, INK);
  rect(rgba, w, 10, h - 16, Math.floor(w * 0.55), 2, INK);
  return rgba;
}

function grayStep(w: number, h: number) {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const v = x < w / 2 ? 32 : 224;
      rgba.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return rgba;
}

function redWhite(w: number, h: number) {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const left = x < w / 2;
      rgba.set(left ? [220, 24, 24, 255] : [255, 255, 255, 255], (y * w + x) * 4);
    }
  }
  return rgba;
}

function makePixelHouse() {
  const w = 32;
  const h = 32;
  const rgba = new Uint8Array(w * h * 4);
  const sky = [91, 181, 171, 255] as const;
  const paper = [243, 241, 236, 255] as const;
  const brass = [196, 184, 164, 255] as const;
  fill(rgba, w, h, sky);
  rect(rgba, w, 0, 22, 32, 10, paper);
  rect(rgba, w, 8, 12, 16, 12, INK);
  rect(rgba, w, 6, 10, 20, 3, brass);
  rect(rgba, w, 14, 6, 4, 5, INK);
  rect(rgba, w, 12, 18, 4, 6, SIGNAL);
  rect(rgba, w, 18, 16, 4, 4, paper);
  rect(rgba, w, 2, 24, 3, 3, INK);
  rect(rgba, w, 27, 25, 2, 2, INK);
  return rgba;
}

function makeChecker(size: number, cell: number) {
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      rgba.set(on ? INK : PAPER, (y * size + x) * 4);
    }
  }
  return rgba;
}

async function up(src: Uint8Array, w: number, h: number, kernel: "photonic" | "lanczos", scale: number) {
  const destW = w * scale;
  const destH = h * scale;
  const options = {
    src: new Uint8ClampedArray(src),
    srcW: w,
    srcH: h,
    destW,
    destH,
    a: 3 as const,
    colorSpace: "linear" as const,
  };
  const out =
    kernel === "photonic"
      ? await resamplePhotonic(options)
      : await resampleSeparable({ ...options, kernelId: "lanczos" });
  if (!out) throw new Error(`resample failed: ${kernel}`);
  return { data: new Uint8Array(out), w: destW, h: destH };
}

async function panel(src: Uint8Array, w: number, h: number, scale: number, view: number) {
  const photonic = await up(src, w, h, "photonic", scale);
  const lanczos = await up(src, w, h, "lanczos", scale);
  const pView = nearest(photonic.data, photonic.w, photonic.h, view);
  const lView = nearest(lanczos.data, lanczos.w, lanczos.h, view);
  return { photonic: pView, lanczos: lView };
}

async function main() {
  await mkdir(docsDir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });

  const checker = makeChecker(32, 4);
  await writeFile(join(assetsDir, "checker.png"), encodePng(32, 32, checker));
  const checkerNn = nearest(checker, 32, 32, 8);
  await writeFile(join(docsDir, "checker-nn.png"), encodePng(checkerNn.w, checkerNn.h, checkerNn.data));

  const pixel = makePixelHouse();
  const pixelNn = nearest(pixel, 32, 32, 8);
  await writeFile(join(docsDir, "pixel-nn.png"), encodePng(pixelNn.w, pixelNn.h, pixelNn.data));

  const typeW = 160;
  const typeH = 90;
  const type = makeTypePlate(typeW, typeH);
  const typePanel = await panel(type, typeW, typeH, 4, 1);
  const stepPanel = await panel(grayStep(20, 12), 20, 12, 4, 4);
  const haloPanel = await panel(redWhite(16, 12), 16, 12, 4, 4);

  const gap = 18;
  const labelH = 36;
  const colW = Math.max(typePanel.photonic.w, stepPanel.photonic.w, haloPanel.photonic.w);
  const pad = 36;
  const width = pad * 2 + colW * 2 + gap;
  const blocks = [
    { title: "TYPE", panel: typePanel },
    { title: "STEP", panel: stepPanel },
    { title: "RED - WHITE", panel: haloPanel },
  ];
  let height = pad + 52;
  for (const block of blocks) height += labelH + block.panel.photonic.h + 28;
  height += pad;

  const canvas = new Uint8Array(width * height * 4);
  fill(canvas, width, height, PAPER);
  writeText(canvas, width, pad, 22, "PHOTONIC  VS  LANCZOS", 3, INK);
  writeText(canvas, width, pad, 48, "SAME SOURCE   4X", 1, MUTE);

  let y = pad + 64;
  for (const block of blocks) {
    writeText(canvas, width, pad, y, "PHOTONIC", 2, SIGNAL);
    writeText(canvas, width, pad + colW + gap, y, "LANCZOS", 2, MUTE);
    y += 22;
    blit(canvas, width, block.panel.photonic.data, block.panel.photonic.w, block.panel.photonic.h, pad, y);
    blit(
      canvas,
      width,
      block.panel.lanczos.data,
      block.panel.lanczos.w,
      block.panel.lanczos.h,
      pad + colW + gap,
      y,
    );
    rect(canvas, width, pad + colW + Math.floor(gap / 2) - 1, y, 2, block.panel.photonic.h, BRASS);
    y += block.panel.photonic.h + 28;
  }

  await writeFile(join(docsDir, "photonic-vs-lanczos.png"), encodePng(width, height, canvas));
  console.log("Wrote public/assets/checker.png and docs/readme/{photonic-vs-lanczos,pixel-nn,checker-nn}.png");
}

await main();
