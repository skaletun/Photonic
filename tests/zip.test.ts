import assert from "node:assert/strict";
import { test } from "vitest";
import { crc32, zipStore } from "@/lib/io/zip";

test("crc32 of hello", () => {
  assert.equal(crc32(new TextEncoder().encode("hello")), 0x3610a686);
});

test("store zip has local signatures and no compression", () => {
  const a = new TextEncoder().encode("one");
  const b = new Uint8Array([1, 2, 3, 4]);
  const zip = zipStore([
    { name: "a.jpg", data: a },
    { name: "nested/b.webp", data: b },
  ]);
  assert.equal(zip[0], 0x50);
  assert.equal(zip[1], 0x4b);
  assert.equal(zip[2], 0x03);
  assert.equal(zip[3], 0x04);
  assert.equal(zip[8], 0);
  assert.equal(zip[9], 0);
  const asText = new TextDecoder().decode(zip);
  assert.match(asText, /a\.jpg/);
  assert.match(asText, /nested\/b\.webp/);
  const eocd = zip.subarray(zip.length - 22);
  assert.equal(eocd[0], 0x50);
  assert.equal(eocd[1], 0x4b);
  assert.equal(eocd[2], 0x05);
  assert.equal(eocd[3], 0x06);
  assert.equal(eocd[10], 2);
});
