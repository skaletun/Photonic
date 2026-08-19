const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
const MAX_APP1_TIFF = 65527;

import { readIcc, type IccKind } from "./icc";

export type ImagePassport = {
  hasExif: boolean;
  copyright: string;
  jpegApp1: Uint8Array | null;
  tiff: Uint8Array | null;
  icc: Uint8Array | null;
  iccKind: IccKind;
};

function latin1(bytes: Uint8Array, start: number, len: number) {
  const end = Math.min(bytes.length, start + len);
  let out = "";
  for (let i = start; i < end; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

function asciiDecode(bytes: Uint8Array) {
  return Array.from(bytes)
    .filter((b) => b >= 32 && b < 127)
    .map((b) => String.fromCharCode(b))
    .join("")
    .replace(/\0+$/g, "")
    .trim();
}

function read16(bytes: Uint8Array, offset: number, le: boolean) {
  return le ? bytes[offset] | (bytes[offset + 1] << 8) : (bytes[offset] << 8) | bytes[offset + 1];
}

function read32(bytes: Uint8Array, offset: number, le: boolean) {
  return le
    ? bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)
    : (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset];
}

function write16(bytes: Uint8Array, offset: number, value: number, le: boolean) {
  if (le) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
  } else {
    bytes[offset] = (value >>> 8) & 0xff;
    bytes[offset + 1] = value & 0xff;
  }
}

function write32(bytes: Uint8Array, offset: number, value: number, le: boolean) {
  if (le) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
    bytes[offset + 3] = (value >>> 24) & 0xff;
  } else {
    bytes[offset] = (value >>> 24) & 0xff;
    bytes[offset + 1] = (value >>> 16) & 0xff;
    bytes[offset + 2] = (value >>> 8) & 0xff;
    bytes[offset + 3] = value & 0xff;
  }
}

function typeSize(type: number) {
  if (type === 1 || type === 2 || type === 6 || type === 7) return 1;
  if (type === 3 || type === 8) return 2;
  if (type === 4 || type === 9 || type === 11) return 4;
  if (type === 5 || type === 10 || type === 12) return 8;
  return 1;
}

type IfdEntry = { tag: number; type: number; count: number; valueOff: number; fieldOff: number };

function readIfd(tiff: Uint8Array, ifdOff: number, le: boolean): IfdEntry[] {
  if (ifdOff < 0 || ifdOff + 2 > tiff.length) return [];
  const count = read16(tiff, ifdOff, le);
  if (count > 256) return [];
  const entries: IfdEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    const fieldOff = ifdOff + 2 + i * 12;
    if (fieldOff + 12 > tiff.length) break;
    entries.push({
      tag: read16(tiff, fieldOff, le),
      type: read16(tiff, fieldOff + 2, le),
      count: read32(tiff, fieldOff + 4, le) >>> 0,
      valueOff: read32(tiff, fieldOff + 8, le) >>> 0,
      fieldOff,
    });
  }
  return entries;
}

function entryDataOffset(entry: IfdEntry) {
  const size = typeSize(entry.type) * entry.count;
  return size <= 4 ? entry.fieldOff + 8 : entry.valueOff;
}

function readAsciiTag(tiff: Uint8Array, entries: IfdEntry[], tag: number) {
  const entry = entries.find((item) => item.tag === tag);
  if (!entry) return "";
  const off = entryDataOffset(entry);
  const size = Math.min(typeSize(entry.type) * entry.count, tiff.length - off);
  if (size <= 0 || off < 0) return "";
  return asciiDecode(tiff.subarray(off, off + size));
}

function tiffSpan(tiff: Uint8Array) {
  if (tiff.length < 8) return 0;
  const le = tiff[0] === 0x49;
  if (!((tiff[0] === 0x49 && tiff[1] === 0x49) || (tiff[0] === 0x4d && tiff[1] === 0x4d))) return 0;
  const seen = new Set<number>();
  let max = 8;
  const visit = (ifdOff: number) => {
    if (ifdOff < 8 || ifdOff + 2 > tiff.length || seen.has(ifdOff)) return;
    seen.add(ifdOff);
    const count = read16(tiff, ifdOff, le);
    if (count > 256) return;
    max = Math.max(max, ifdOff + 2 + count * 12 + 4);
    for (const entry of readIfd(tiff, ifdOff, le)) {
      const size = typeSize(entry.type) * entry.count;
      if (size > 4) max = Math.max(max, entry.valueOff + size);
      if (entry.tag === 0x8769 || entry.tag === 0x8825 || entry.tag === 0xa005) {
        visit(entry.valueOff);
      }
    }
  };
  visit(read32(tiff, 4, le) >>> 0);
  return Math.min(tiff.length, Math.max(8, max));
}

export function boundTiff(tiff: Uint8Array) {
  const span = tiffSpan(tiff);
  if (!span) return tiff.subarray(0, Math.min(tiff.length, MAX_APP1_TIFF));
  return tiff.subarray(0, Math.min(span, MAX_APP1_TIFF));
}

function tiffFromExifPayload(payload: Uint8Array) {
  const limit = Math.min(payload.length, 24);
  for (let i = 0; i < limit; i += 1) {
    if (
      i + 8 <= payload.length &&
      payload[i] === 0x45 &&
      payload[i + 1] === 0x78 &&
      payload[i + 2] === 0x69 &&
      payload[i + 3] === 0x66
    ) {
      return boundTiff(payload.subarray(i + 6));
    }
    if (
      (payload[i] === 0x49 && payload[i + 1] === 0x49 && payload[i + 2] === 0x2a) ||
      (payload[i] === 0x4d && payload[i + 1] === 0x4d && payload[i + 2] === 0x00 && payload[i + 3] === 0x2a)
    ) {
      return boundTiff(payload.subarray(i));
    }
  }
  return null;
}

function walkIsoBoxes(bytes: Uint8Array, start: number, end: number, depth: number, onExif: (payload: Uint8Array) => void) {
  if (depth > 12) return;
  let offset = start;
  while (offset + 8 <= end) {
    let size =
      ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    const type = latin1(bytes, offset + 4, 4);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      const hi =
        ((bytes[offset + 8] << 24) | (bytes[offset + 9] << 16) | (bytes[offset + 10] << 8) | bytes[offset + 11]) >>> 0;
      const lo =
        ((bytes[offset + 12] << 24) | (bytes[offset + 13] << 16) | (bytes[offset + 14] << 8) | bytes[offset + 15]) >>> 0;
      if (hi !== 0) break;
      size = lo;
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) break;
    const payloadStart = offset + header;
    const payloadEnd = offset + size;
    if (type === "Exif") onExif(bytes.subarray(payloadStart, payloadEnd));
    if (type === "meta" || type === "moov" || type === "udta" || type === "iprp") {
      const inner = type === "meta" ? payloadStart + 4 : payloadStart;
      walkIsoBoxes(bytes, inner, payloadEnd, depth + 1, onExif);
    }
    offset += size;
  }
}

function zeroIfd(tiff: Uint8Array, ifdOff: number) {
  if (ifdOff + 2 > tiff.length) return;
  const le = tiff[0] === 0x49;
  const count = read16(tiff, ifdOff, le);
  if (count > 256) return;
  for (const entry of readIfd(tiff, ifdOff, le)) {
    const size = typeSize(entry.type) * entry.count;
    if (size > 4 && entry.valueOff >= 0 && entry.valueOff < tiff.length) {
      tiff.fill(0, entry.valueOff, Math.min(tiff.length, entry.valueOff + size));
    }
  }
  tiff.fill(0, ifdOff, Math.min(tiff.length, ifdOff + 2 + count * 12 + 4));
}

function writeDim(tiff: Uint8Array, entry: IfdEntry, value: number, le: boolean) {
  if (entry.type === 3 && entry.count === 1) write16(tiff, entry.fieldOff + 8, value, le);
  if (entry.type === 4 && entry.count === 1) write32(tiff, entry.fieldOff + 8, value, le);
}

function patchIfd(tiff: Uint8Array, ifdOff: number, width: number, height: number) {
  if (ifdOff + 8 > tiff.length) return;
  const le = tiff[0] === 0x49;
  const entries = readIfd(tiff, ifdOff, le);
  for (const entry of entries) {
    if (entry.tag === 0x0112 && entry.count === 1) {
      if (entry.type === 3) write16(tiff, entry.fieldOff + 8, 1, le);
      if (entry.type === 4) write32(tiff, entry.fieldOff + 8, 1, le);
    }
    if (entry.tag === 0x0100 || entry.tag === 0xa002) writeDim(tiff, entry, width, le);
    if (entry.tag === 0x0101 || entry.tag === 0xa003) writeDim(tiff, entry, height, le);
  }
  const gps = entries.find((entry) => entry.tag === 0x8825);
  if (gps) {
    zeroIfd(tiff, gps.valueOff);
    const count = read16(tiff, ifdOff, le);
    const start = gps.fieldOff;
    tiff.copyWithin(start, start + 12, ifdOff + 2 + count * 12 + 4);
    write16(tiff, ifdOff, count - 1, le);
  }
  const exif = entries.find((entry) => entry.tag === 0x8769);
  if (exif) patchIfd(tiff, exif.valueOff, width, height);
}

export function tiffFromJpeg(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 < bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda) break;
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (marker === 0xe1 && size >= 8) {
      const payload = bytes.subarray(offset + 4, offset + 2 + size);
      if (payload.length >= 8 && payload[0] === 0x45 && payload[1] === 0x78) {
        return { app1Start: offset, app1End: offset + 2 + size, tiff: payload.subarray(6) };
      }
    }
    offset += 2 + size;
  }
  return null;
}

export function tiffFromHeif(bytes: Uint8Array) {
  const found: Uint8Array[] = [];
  walkIsoBoxes(bytes, 0, bytes.length, 0, (payload) => {
    const tiff = tiffFromExifPayload(payload);
    if (tiff) found.push(tiff);
  });
  if (found.length) return found[0];
  const needle = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  for (let i = 0; i < bytes.length - 16; i += 1) {
    let hit = true;
    for (let n = 0; n < needle.length; n += 1) {
      if (bytes[i + n] !== needle[n]) {
        hit = false;
        break;
      }
    }
    if (!hit) continue;
    const tiff = boundTiff(bytes.subarray(i + 6));
    if ((tiff[0] === 0x49 && tiff[1] === 0x49) || (tiff[0] === 0x4d && tiff[1] === 0x4d)) return tiff;
  }
  return null;
}

export function tiffFromWebp(bytes: Uint8Array) {
  if (bytes.length < 12) return null;
  if (latin1(bytes, 0, 4) !== "RIFF" || latin1(bytes, 8, 4) !== "WEBP") return null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = latin1(bytes, offset, 4);
    const size = bytes[offset + 4] | (bytes[offset + 5] << 8) | (bytes[offset + 6] << 16) | (bytes[offset + 7] << 24);
    const data = bytes.subarray(offset + 8, Math.min(bytes.length, offset + 8 + size));
    if (type === "EXIF") {
      const start = data[0] === 0x45 && data[1] === 0x78 ? 6 : 0;
      return boundTiff(data.subarray(start));
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

function copyrightFromPng(bytes: Uint8Array) {
  if (bytes.length < 16 || bytes[0] !== 0x89) return "";
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const len =
      ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    if (offset + 12 + len > bytes.length) break;
    const type = latin1(bytes, offset + 4, 4);
    if (type === "tEXt") {
      const data = bytes.subarray(offset + 8, offset + 8 + len);
      let z = 0;
      while (z < data.length && data[z] !== 0) z += 1;
      if (asciiDecode(data.subarray(0, z)) === "Copyright") return asciiDecode(data.subarray(z + 1));
    }
    if (type === "IEND") break;
    offset += 12 + len;
  }
  return "";
}

export function readPassport(bytes: Uint8Array, mime: string): ImagePassport {
  const iccRead = readIcc(bytes, mime);
  const color = { icc: iccRead.profile, iccKind: iccRead.kind };
  let tiff: Uint8Array | null = null;
  let jpegApp1: Uint8Array | null = null;
  if (mime === "image/jpeg") {
    const found = tiffFromJpeg(bytes);
    if (found) {
      tiff = boundTiff(found.tiff.slice());
      jpegApp1 = bytes.subarray(found.app1Start, found.app1End).slice();
    }
  } else if (mime === "image/webp") {
    const found = tiffFromWebp(bytes);
    if (found) tiff = found.slice();
  } else if (mime === "image/heic" || mime === "image/heif") {
    const found = tiffFromHeif(bytes);
    if (found) tiff = found.slice();
  } else if (mime === "image/png") {
    const copyright = copyrightFromPng(bytes);
    return { hasExif: Boolean(copyright), copyright, jpegApp1: null, tiff: null, ...color };
  }
  if (!tiff || tiff.length < 8) {
    return { hasExif: false, copyright: "", jpegApp1: null, tiff: null, ...color };
  }
  const le = tiff[0] === 0x49;
  const ifd0 = read32(tiff, 4, le) >>> 0;
  const entries = readIfd(tiff, ifd0, le);
  const copyright = readAsciiTag(tiff, entries, 0x8298) || readAsciiTag(tiff, entries, 0x013b);
  return { hasExif: true, copyright, jpegApp1, tiff, ...color };
}

export function prepareTiff(tiff: Uint8Array, width: number, height: number) {
  const copy = boundTiff(tiff).slice();
  const le = copy[0] === 0x49;
  const ifd0 = read32(copy, 4, le) >>> 0;
  patchIfd(copy, ifd0, width, height);
  return copy;
}

export function injectJpegExif(jpeg: Uint8Array, tiff: Uint8Array) {
  const clipped = tiff.length > MAX_APP1_TIFF ? tiff.subarray(0, MAX_APP1_TIFF) : tiff;
  const payload = new Uint8Array(6 + clipped.length);
  payload.set(EXIF_HEADER, 0);
  payload.set(clipped, 6);
  const app1 = new Uint8Array(4 + payload.length);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  const size = payload.length + 2;
  app1[2] = (size >> 8) & 0xff;
  app1[3] = size & 0xff;
  app1.set(payload, 4);

  let insertAt = 2;
  if (jpeg.length > 4 && jpeg[2] === 0xff && jpeg[3] === 0xe0) {
    const jfifSize = (jpeg[4] << 8) | jpeg[5];
    insertAt = 4 + jfifSize;
  }
  const out = new Uint8Array(jpeg.length + app1.length);
  out.set(jpeg.subarray(0, insertAt), 0);
  out.set(app1, insertAt);
  out.set(jpeg.subarray(insertAt), insertAt + app1.length);
  return out;
}

function pngChunk(type: string, data: Uint8Array) {
  const t = new TextEncoder().encode(type);
  const len = new Uint8Array([
    (data.length >>> 24) & 255,
    (data.length >>> 16) & 255,
    (data.length >>> 8) & 255,
    data.length & 255,
  ]);
  const body = new Uint8Array(t.length + data.length);
  body.set(t, 0);
  body.set(data, t.length);
  let crc = 0xffffffff;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  for (const b of body) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  crc = (crc ^ 0xffffffff) >>> 0;
  const crcBytes = new Uint8Array([(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255]);
  const out = new Uint8Array(8 + data.length + 4);
  out.set(len, 0);
  out.set(body, 4);
  out.set(crcBytes, 8 + data.length);
  return out;
}

export function injectPngText(png: Uint8Array, keyword: string, text: string) {
  if (!text || png.length < 33) return png;
  const iend = png.length - 12;
  const payload = new TextEncoder().encode(`${keyword}\0${text}`);
  const textChunk = pngChunk("tEXt", payload);
  const out = new Uint8Array(png.length + textChunk.length);
  out.set(png.subarray(0, iend), 0);
  out.set(textChunk, iend);
  out.set(png.subarray(iend), iend + textChunk.length);
  return out;
}

export function injectWebpExif(webp: Uint8Array, tiff: Uint8Array) {
  if (webp.length < 12) return webp;
  if (latin1(webp, 0, 4) !== "RIFF" || latin1(webp, 8, 4) !== "WEBP") return webp;
  const payload = tiff;
  const pad = payload.length % 2;
  const chunk = new Uint8Array(8 + payload.length + pad);
  chunk.set([0x45, 0x58, 0x49, 0x46], 0);
  chunk[4] = payload.length & 255;
  chunk[5] = (payload.length >>> 8) & 255;
  chunk[6] = (payload.length >>> 16) & 255;
  chunk[7] = (payload.length >>> 24) & 255;
  chunk.set(payload, 8);
  const out = new Uint8Array(webp.length + chunk.length);
  out.set(webp, 0);
  out.set(chunk, webp.length);
  const riffSize = out.length - 8;
  out[4] = riffSize & 255;
  out[5] = (riffSize >>> 8) & 255;
  out[6] = (riffSize >>> 16) & 255;
  out[7] = (riffSize >>> 24) & 255;
  if (latin1(out, 12, 4) === "VP8X" && out.length > 24) {
    out[20] = out[20] | 0x08;
  }
  return out;
}

export async function attachPassport(blob: Blob, mime: string, passport: ImagePassport, width: number, height: number) {
  if (!passport.hasExif || !passport.tiff) {
    if (mime === "image/png" && passport.copyright) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return new Blob([new Uint8Array(injectPngText(bytes, "Copyright", passport.copyright))], { type: mime });
    }
    return blob;
  }
  const tiff = prepareTiff(passport.tiff, width, height);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (mime === "image/jpeg") return new Blob([new Uint8Array(injectJpegExif(bytes, tiff))], { type: mime });
  if (mime === "image/png") {
    return new Blob([new Uint8Array(injectPngText(bytes, "Copyright", passport.copyright || " "))], { type: mime });
  }
  if (mime === "image/webp") return new Blob([new Uint8Array(injectWebpExif(bytes, tiff))], { type: mime });
  return blob;
}
