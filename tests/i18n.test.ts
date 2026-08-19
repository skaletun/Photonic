import assert from "node:assert/strict";
import { test } from "vitest";
import { en } from "@/lib/i18n/en";
import { ru } from "@/lib/i18n/ru";
import { t } from "@/lib/i18n";

test("en and ru expose the same keys", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ru).sort());
});

test("English strings have no Cyrillic", () => {
  const cyrillic = /[\u0400-\u04FF]/;
  for (const [key, value] of Object.entries(en)) {
    assert.equal(cyrillic.test(value), false, key);
  }
});

test("interpolates named placeholders", () => {
  assert.equal(t("en", "status.dims", { w: 800, h: 600, mp: "0.48", kernel: "photonic" }), "800×600 · 0.48 MP · photonic");
  assert.equal(t("ru", "status.dims", { w: 800, h: 600, mp: "0.48", kernel: "photonic" }), "800×600 · 0.48 Мп · photonic");
});
