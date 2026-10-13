import { afterEach, expect, it, vi } from "vitest";
import { ByteCache } from "../src/lib/byte-cache";
import { memoryBudget, estimateWorkingBytes } from "../src/lib/memory";
import { zipBlobs, crc32 } from "../src/lib/io/zip";
afterEach(() => vi.unstubAllGlobals());
it("evicts by bytes and recency and rejects oversized cache entries", () => {
  const cache = new ByteCache<{ data: Uint8Array }>(8);
  cache.set("a", { data: new Uint8Array(4) });
  cache.set("b", { data: new Uint8Array(4) });
  cache.get("a");
  cache.set("c", { data: new Uint8Array(4) });
  expect(cache.get("b")).toBeUndefined();
  expect(cache.get("a")).toBeDefined();
  cache.set("large", { data: new Uint8Array(9) });
  expect(cache.byteLength).toBe(8);
  expect(cache.get("large")).toBeUndefined();
});
it("uses a smaller budget for mobile and accounts for output encoding", () => {
  vi.stubGlobal("navigator", { userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 5 });
  expect(memoryBudget()).toBe(256 * 1024 * 1024);
  expect(estimateWorkingBytes(1000, 1000, 8000, 8000, "photonic")).toBeGreaterThan(memoryBudget());
});
it("writes UTF-8 ZIP entries with unique names and correct CRC", async () => {
  const payload = new Uint8Array([1, 2, 3]);
  const blob = await zipBlobs([
    { name: "снимок.png", blob: new Blob([payload]) },
    { name: "снимок.png", blob: new Blob([payload]) },
  ]);
  const data = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(data.buffer);
  expect(view.getUint16(6, true) & 0x800).toBe(0x800);
  expect(view.getUint32(14, true)).toBe(crc32(payload));
  expect(new TextDecoder().decode(data)).toContain("снимок-2.png");
});
it("cancels ZIP assembly before consuming another file", async () => {
  const control = new AbortController();
  control.abort();
  await expect(zipBlobs([{ name: "a", blob: new Blob(["data"]) }], control.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
});
