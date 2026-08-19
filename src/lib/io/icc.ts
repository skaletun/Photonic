/**
 * ICC read/write without a CMS. Canvas pixels are sRGB — we tag sRGB,
 * never re-label Display P3 (or any other space) as if the samples were P3.
 */

import { crc32 } from "./zip";

export type IccKind = "none" | "srgb" | "other";

const ICC_HEADER = "ICC_PROFILE\0";

function latin1(bytes: Uint8Array, start: number, len: number) {
  const end = Math.min(bytes.length, start + len);
  let out = "";
  for (let i = start; i < end; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

function writeLatin1(buf: Uint8Array, offset: number, text: string) {
  for (let i = 0; i < text.length; i += 1) buf[offset + i] = text.charCodeAt(i) & 0xff;
}

function s15(n: number) {
  return Math.round(n * 65536);
}

function aligned(n: number) {
  return (n + 3) & ~3;
}

/** Compact matrix sRGB v2 profile (gamma 2.2). Built in-repo, not fetched. */
export function buildSrgbIcc() {
  const descText = "sRGB";
  const descAsciiLen = descText.length + 1;
  const descSize = 4 + 4 + 4 + descAsciiLen + 4 + 4 + 2 + 1 + 67;
  const xyzSize = 20;
  const curvSize = 14;
  const tagCount = 8;
  const header = 128;
  const tagTable = 4 + tagCount * 12;
  let cursor = header + tagTable;
  const descOff = cursor;
  cursor += aligned(descSize);
  const wtptOff = cursor;
  cursor += aligned(xyzSize);
  const rOff = cursor;
  cursor += aligned(xyzSize);
  const gOff = cursor;
  cursor += aligned(xyzSize);
  const bOff = cursor;
  cursor += aligned(xyzSize);
  const trcOff = cursor;
  cursor += aligned(curvSize);
  const size = cursor;

  const buf = new Uint8Array(size);
  const view = new DataView(buf.buffer);

  view.setUint32(0, size);
  writeLatin1(buf, 4, "none");
  view.setUint32(8, 0x02100000);
  writeLatin1(buf, 12, "mntr");
  writeLatin1(buf, 16, "RGB ");
  writeLatin1(buf, 20, "XYZ ");
  view.setUint16(24, 2024);
  view.setUint16(26, 1);
  view.setUint16(28, 1);
  writeLatin1(buf, 36, "acsp");
  writeLatin1(buf, 40, "MSFT");
  writeLatin1(buf, 48, "IEC ");
  view.setInt32(68, s15(0.9642));
  view.setInt32(72, s15(1));
  view.setInt32(76, s15(0.8249));
  writeLatin1(buf, 80, "none");

  view.setUint32(header, tagCount);
  const tags: [string, number, number][] = [
    ["desc", descOff, descSize],
    ["wtpt", wtptOff, xyzSize],
    ["rXYZ", rOff, xyzSize],
    ["gXYZ", gOff, xyzSize],
    ["bXYZ", bOff, xyzSize],
    ["rTRC", trcOff, curvSize],
    ["gTRC", trcOff, curvSize],
    ["bTRC", trcOff, curvSize],
  ];
  tags.forEach((tag, i) => {
    const off = header + 4 + i * 12;
    writeLatin1(buf, off, tag[0]);
    view.setUint32(off + 4, tag[1]);
    view.setUint32(off + 8, tag[2]);
  });

  writeLatin1(buf, descOff, "desc");
  view.setUint32(descOff + 8, descAsciiLen);
  writeLatin1(buf, descOff + 12, descText);

  const writeXyz = (off: number, x: number, y: number, z: number) => {
    writeLatin1(buf, off, "XYZ ");
    view.setInt32(off + 8, s15(x));
    view.setInt32(off + 12, s15(y));
    view.setInt32(off + 16, s15(z));
  };
  writeXyz(wtptOff, 0.95045, 1, 1.08905);
  writeXyz(rOff, 0.43607, 0.22249, 0.01392);
  writeXyz(gOff, 0.38515, 0.71687, 0.09708);
  writeXyz(bOff, 0.14308, 0.06061, 0.7141);

  writeLatin1(buf, trcOff, "curv");
  view.setUint32(trcOff + 8, 1);
  view.setUint16(trcOff + 12, Math.round(2.2 * 256));

  return buf;
}

export const SRGB_ICC = buildSrgbIcc();

export function classifyIcc(profile: Uint8Array | null | undefined): IccKind {
  if (!profile || profile.length < 128) return "none";
  if (latin1(profile, 36, 4) !== "acsp") return "other";
  const window = latin1(profile, 0, Math.min(profile.length, 640));
  if (/sRGB/i.test(window) || /IEC 61966/i.test(window)) return "srgb";
  return "other";
}

function readJpegIcc(bytes: Uint8Array) {
  const chunks: { seq: number; data: Uint8Array }[] = [];
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x00 || marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      offset += 2;
      continue;
    }
    if (marker === 0x01 || marker === 0xd8) {
      offset += 2;
      continue;
    }
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (size < 2 || offset + 2 + size > bytes.length) break;
    if (marker === 0xe2) {
      const payload = bytes.subarray(offset + 4, offset + 2 + size);
      if (payload.length >= 14 && latin1(payload, 0, 12) === ICC_HEADER) {
        chunks.push({ seq: payload[12], data: payload.subarray(14) });
      }
    }
    offset += 2 + size;
  }
  if (!chunks.length) return null;
  chunks.sort((a, b) => a.seq - b.seq);
  const total = chunks.reduce((n, c) => n + c.data.length, 0);
  const out = new Uint8Array(total);
  let n = 0;
  for (const chunk of chunks) {
    out.set(chunk.data, n);
    n += chunk.data.length;
  }
  return out;
}

function pngKeyword(data: Uint8Array) {
  let z = 0;
  while (z < data.length && data[z] !== 0) z += 1;
  return { keyword: latin1(data, 0, z), rest: data.subarray(z + 1) };
}

function readPngIccHint(bytes: Uint8Array) {
  if (bytes.length < 16 || bytes[0] !== 0x89) return { profile: null as Uint8Array | null, kind: "none" as IccKind };
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const len =
      ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    if (offset + 12 + len > bytes.length) break;
    const type = latin1(bytes, offset + 4, 4);
    if (type === "iCCP") {
      const { keyword } = pngKeyword(bytes.subarray(offset + 8, offset + 8 + len));
      const kind: IccKind = /srgb/i.test(keyword) ? "srgb" : "other";
      return { profile: null, kind };
    }
    if (type === "sRGB") return { profile: null, kind: "srgb" as const };
    if (type === "IEND") break;
    offset += 12 + len;
  }
  return { profile: null, kind: "none" as IccKind };
}

function readWebpIcc(bytes: Uint8Array) {
  if (bytes.length < 12) return null;
  if (latin1(bytes, 0, 4) !== "RIFF" || latin1(bytes, 8, 4) !== "WEBP") return null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = latin1(bytes, offset, 4);
    const size = bytes[offset + 4] | (bytes[offset + 5] << 8) | (bytes[offset + 6] << 16) | (bytes[offset + 7] << 24);
    const data = bytes.subarray(offset + 8, Math.min(bytes.length, offset + 8 + size));
    if (type === "ICCP") return data.slice();
    offset += 8 + size + (size % 2);
  }
  return null;
}

export function readIcc(bytes: Uint8Array, mime: string): { profile: Uint8Array | null; kind: IccKind } {
  if (mime === "image/jpeg") {
    const profile = readJpegIcc(bytes);
    return { profile, kind: classifyIcc(profile) };
  }
  if (mime === "image/webp") {
    const profile = readWebpIcc(bytes);
    return { profile, kind: classifyIcc(profile) };
  }
  if (mime === "image/png") return readPngIccHint(bytes);
  return { profile: null, kind: "none" };
}

export function stripJpegIcc(jpeg: Uint8Array) {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;
  const parts: Uint8Array[] = [jpeg.subarray(0, 2)];
  let offset = 2;
  while (offset + 1 <= jpeg.length && jpeg[offset] === 0xff) {
    const marker = jpeg[offset + 1];
    if (marker === 0xda) {
      parts.push(jpeg.subarray(offset));
      return concat(parts);
    }
    if (marker === 0xd9) {
      parts.push(jpeg.subarray(offset));
      return concat(parts);
    }
    if (marker === 0x00 || marker === 0xff) {
      parts.push(jpeg.subarray(offset, offset + 1));
      offset += 1;
      continue;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xd8) {
      parts.push(jpeg.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (offset + 4 > jpeg.length) {
      parts.push(jpeg.subarray(offset));
      return concat(parts);
    }
    const size = (jpeg[offset + 2] << 8) | jpeg[offset + 3];
    const next = offset + 2 + size;
    const payload = jpeg.subarray(offset + 4, Math.min(jpeg.length, next));
    const isIcc = marker === 0xe2 && payload.length >= 12 && latin1(payload, 0, 12) === ICC_HEADER;
    if (!isIcc) parts.push(jpeg.subarray(offset, next));
    offset = next;
  }
  if (offset < jpeg.length) parts.push(jpeg.subarray(offset));
  return concat(parts);
}

function concat(parts: Uint8Array[]) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let n = 0;
  for (const part of parts) {
    out.set(part, n);
    n += part.length;
  }
  return out;
}

function jpegInsertAfterApp01(jpeg: Uint8Array) {
  let offset = 2;
  while (offset + 4 <= jpeg.length && jpeg[offset] === 0xff) {
    const marker = jpeg[offset + 1];
    if (marker !== 0xe0 && marker !== 0xe1) break;
    const size = (jpeg[offset + 2] << 8) | jpeg[offset + 3];
    offset += 2 + size;
  }
  return offset;
}

export function injectJpegIcc(jpeg: Uint8Array, profile: Uint8Array) {
  const stripped = stripJpegIcc(jpeg);
  const chunkMax = 65519;
  const chunks: Uint8Array[] = [];
  const total = Math.max(1, Math.ceil(profile.length / chunkMax));
  for (let i = 0; i < total; i += 1) {
    const slice = profile.subarray(i * chunkMax, Math.min(profile.length, (i + 1) * chunkMax));
    const payload = new Uint8Array(14 + slice.length);
    writeLatin1(payload, 0, ICC_HEADER);
    payload[12] = i + 1;
    payload[13] = total;
    payload.set(slice, 14);
    const app2 = new Uint8Array(4 + payload.length);
    app2[0] = 0xff;
    app2[1] = 0xe2;
    const size = payload.length + 2;
    app2[2] = (size >> 8) & 0xff;
    app2[3] = size & 0xff;
    app2.set(payload, 4);
    chunks.push(app2);
  }
  const extra = chunks.reduce((n, c) => n + c.length, 0);
  const insertAt = jpegInsertAfterApp01(stripped);
  const out = new Uint8Array(stripped.length + extra);
  out.set(stripped.subarray(0, insertAt), 0);
  let n = insertAt;
  for (const chunk of chunks) {
    out.set(chunk, n);
    n += chunk.length;
  }
  out.set(stripped.subarray(insertAt), n);
  return out;
}

function pngChunk(type: string, data: Uint8Array) {
  const t = new TextEncoder().encode(type);
  const body = new Uint8Array(t.length + data.length);
  body.set(t, 0);
  body.set(data, t.length);
  const crc = crc32(body);
  const out = new Uint8Array(8 + data.length + 4);
  out[0] = (data.length >>> 24) & 255;
  out[1] = (data.length >>> 16) & 255;
  out[2] = (data.length >>> 8) & 255;
  out[3] = data.length & 255;
  out.set(body, 4);
  out[8 + data.length] = (crc >>> 24) & 255;
  out[9 + data.length] = (crc >>> 16) & 255;
  out[10 + data.length] = (crc >>> 8) & 255;
  out[11 + data.length] = crc & 255;
  return out;
}

function stripPngColorChunks(png: Uint8Array) {
  if (png.length < 33 || png[0] !== 0x89) return png;
  const parts: Uint8Array[] = [png.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= png.length) {
    const len =
      ((png[offset] << 24) | (png[offset + 1] << 16) | (png[offset + 2] << 8) | png[offset + 3]) >>> 0;
    const next = offset + 12 + len;
    if (next > png.length) {
      parts.push(png.subarray(offset));
      break;
    }
    const type = latin1(png, offset + 4, 4);
    if (type !== "iCCP" && type !== "sRGB") parts.push(png.subarray(offset, next));
    if (type === "IEND") break;
    offset = next;
  }
  return concat(parts);
}

async function deflateZlib(data: Uint8Array) {
  if (typeof CompressionStream === "undefined") return null;
  const payload = new Uint8Array(data.byteLength);
  payload.set(data);
  // pipeThrough reads while compressing. write()+close() then Response(readable)
  // deadlocks in Chromium: the writable never drains.
  const stream = new Blob([payload]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function injectPngIcc(png: Uint8Array, profile: Uint8Array) {
  const stripped = stripPngColorChunks(png);
  const compressed = await deflateZlib(profile);
  if (!compressed || stripped.length < 33) return stripped;
  const keyword = new TextEncoder().encode("sRGB");
  const payload = new Uint8Array(keyword.length + 2 + compressed.length);
  payload.set(keyword, 0);
  payload[keyword.length] = 0;
  payload[keyword.length + 1] = 0;
  payload.set(compressed, keyword.length + 2);
  const chunk = pngChunk("iCCP", payload);
  let insertAt = stripped.length - 12;
  let offset = 8;
  while (offset + 12 <= stripped.length) {
    const len =
      ((stripped[offset] << 24) | (stripped[offset + 1] << 16) | (stripped[offset + 2] << 8) | stripped[offset + 3]) >>>
      0;
    const type = latin1(stripped, offset + 4, 4);
    if (type === "IDAT" || type === "IEND") {
      insertAt = offset;
      break;
    }
    offset += 12 + len;
  }
  const out = new Uint8Array(stripped.length + chunk.length);
  out.set(stripped.subarray(0, insertAt), 0);
  out.set(chunk, insertAt);
  out.set(stripped.subarray(insertAt), insertAt + chunk.length);
  return out;
}

function stripWebpIccp(webp: Uint8Array) {
  if (webp.length < 12 || latin1(webp, 0, 4) !== "RIFF" || latin1(webp, 8, 4) !== "WEBP") return webp;
  const parts: Uint8Array[] = [webp.subarray(0, 12)];
  let offset = 12;
  while (offset + 8 <= webp.length) {
    const type = latin1(webp, offset, 4);
    const size = webp[offset + 4] | (webp[offset + 5] << 8) | (webp[offset + 6] << 16) | (webp[offset + 7] << 24);
    const next = offset + 8 + size + (size % 2);
    if (type !== "ICCP") parts.push(webp.subarray(offset, Math.min(webp.length, next)));
    offset = next;
  }
  const out = concat(parts);
  const riffSize = out.length - 8;
  out[4] = riffSize & 255;
  out[5] = (riffSize >>> 8) & 255;
  out[6] = (riffSize >>> 16) & 255;
  out[7] = (riffSize >>> 24) & 255;
  return out;
}

export function injectWebpIcc(webp: Uint8Array, profile: Uint8Array) {
  const stripped = stripWebpIccp(webp);
  if (stripped.length < 12) return stripped;
  const pad = profile.length % 2;
  const chunk = new Uint8Array(8 + profile.length + pad);
  writeLatin1(chunk, 0, "ICCP");
  chunk[4] = profile.length & 255;
  chunk[5] = (profile.length >>> 8) & 255;
  chunk[6] = (profile.length >>> 16) & 255;
  chunk[7] = (profile.length >>> 24) & 255;
  chunk.set(profile, 8);
  const out = new Uint8Array(stripped.length + chunk.length);
  out.set(stripped, 0);
  out.set(chunk, stripped.length);
  const riffSize = out.length - 8;
  out[4] = riffSize & 255;
  out[5] = (riffSize >>> 8) & 255;
  out[6] = (riffSize >>> 16) & 255;
  out[7] = (riffSize >>> 24) & 255;
  if (latin1(out, 12, 4) === "VP8X" && out.length > 24) {
    out[20] = out[20] | 0x20;
  }
  return out;
}

export function profileForExport(kind: IccKind, source: Uint8Array | null) {
  if (kind === "srgb" && source && source.length >= 128 && classifyIcc(source) === "srgb") return source;
  return SRGB_ICC;
}

export async function attachIcc(blob: Blob, mime: string, kind: IccKind, source: Uint8Array | null) {
  if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") return blob;
  const profile = profileForExport(kind, source);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (mime === "image/jpeg") return new Blob([new Uint8Array(injectJpegIcc(bytes, profile))], { type: mime });
  if (mime === "image/webp") return new Blob([new Uint8Array(injectWebpIcc(bytes, profile))], { type: mime });
  return new Blob([new Uint8Array(await injectPngIcc(bytes, profile))], { type: mime });
}
