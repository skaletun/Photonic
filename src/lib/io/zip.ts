const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}

export function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number) {
  return Uint8Array.of(n & 255, (n >>> 8) & 255);
}

function u32(n: number) {
  return Uint8Array.of(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255);
}

export type ZipEntry = { name: string; data: Uint8Array };

export function zipStore(entries: ZipEntry[]) {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name.replace(/\\/g, "/"));
    const data = entry.data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    local.set([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 8, 0, 0, 0, 0, 0, 0], 0);
    local.set(u32(crc), 14);
    local.set(u32(data.length), 18);
    local.set(u32(data.length), 22);
    local.set(u16(name.length), 26);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    central.set([0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, 0, 8, 0, 0, 0, 0, 0, 0], 0);
    central.set(u32(crc), 16);
    central.set(u32(data.length), 20);
    central.set(u32(data.length), 24);
    central.set(u16(name.length), 28);
    central.set(u32(offset), 42);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  eocd.set([0x50, 0x4b, 0x05, 0x06], 0);
  eocd.set(u16(entries.length), 8);
  eocd.set(u16(entries.length), 10);
  eocd.set(u32(centralSize), 12);
  eocd.set(u32(offset), 16);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of locals) {
    out.set(part, pos);
    pos += part.length;
  }
  for (const part of centrals) {
    out.set(part, pos);
    pos += part.length;
  }
  out.set(eocd, pos);
  return out;
}

/** Store Blob parts directly instead of holding two copies of every encoded file. */
export async function zipBlobs(entries: { name: string; blob: Blob }[], signal?: AbortSignal) {
  const parts: BlobPart[] = [];
  const centrals: Uint8Array<ArrayBuffer>[] = [];
  const used = new Set<string>();
  let offset = 0;
  for (const entry of entries) {
    signal?.throwIfAborted();
    const name = new TextEncoder().encode(uniqueName(entry.name, used));
    let crc = 0xffffffff;
    const reader = entry.blob.stream().getReader();
    try {
      while (true) {
        signal?.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) break;
        for (const b of chunk.value) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
      }
    } finally {
      reader.releaseLock();
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    if (entry.blob.size > 0xffffffff || offset + entry.blob.size > 0xffffffff) throw new RangeError("ZIP32 size limit");
    const local = new Uint8Array(30 + name.length);
    local.set([0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 8], 0);
    local.set(u32(crc), 14);
    local.set(u32(entry.blob.size), 18);
    local.set(u32(entry.blob.size), 22);
    local.set(u16(name.length), 26);
    local.set(name, 30);
    const central = new Uint8Array(46 + name.length);
    central.set([0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, 0, 8], 0);
    central.set(u32(crc), 16);
    central.set(u32(entry.blob.size), 20);
    central.set(u32(entry.blob.size), 24);
    central.set(u16(name.length), 28);
    central.set(u32(offset), 42);
    central.set(name, 46);
    parts.push(local, entry.blob);
    centrals.push(central);
    offset += local.length + entry.blob.size;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  if (offset + centralSize > 0xffffffff) throw new RangeError("ZIP32 size limit");
  const end = new Uint8Array(22);
  end.set([0x50, 0x4b, 0x05, 0x06]);
  end.set(u16(entries.length), 8);
  end.set(u16(entries.length), 10);
  end.set(u32(centralSize), 12);
  end.set(u32(offset), 16);
  return new Blob([...parts, ...centrals, end], { type: "application/zip" });
}

export function uniqueName(name: string, used: Set<string>) {
  const safe = name.replace(/[\\/]/g, "-");
  const dot = safe.lastIndexOf(".");
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : "";
  let result = safe;
  let suffix = 2;
  while (used.has(result)) result = `${stem}-${suffix++}${ext}`;
  used.add(result);
  return result;
}
