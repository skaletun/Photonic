import assert from "node:assert/strict";
import { test } from "vitest";
import { en } from "@/lib/i18n/en";
import { ru } from "@/lib/i18n/ru";
import { t } from "@/lib/i18n";
import { SITE_LINKS } from "@/lib/site-links";

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

test("license FAQ is not MIT", () => {
  assert.match(en["faq.a8"], /all rights reserved/i);
  assert.match(en["faq.a8"], /SIL Open Font License/);
  assert.match(en["support.lead"], /not MIT/);
  assert.match(ru["faq.a8"], /все права защищены/i);
  assert.match(ru["support.lead"], /не MIT/);
});

test("telegram points at the Photonic channel", () => {
  assert.equal(SITE_LINKS.telegram, "https://t.me/photonic_scale");
  assert.equal(en["contacts.telegramHint"], "t.me/photonic_scale");
  assert.equal(ru["contacts.telegramHint"], "t.me/photonic_scale");
});

test("how-to FAQ explains open, size, download", () => {
  assert.match(en["faq.aHow"], /Download/);
  assert.match(ru["faq.aHow"], /Скачать/);
  assert.match(en["empty.step3"], /Download/);
  assert.match(ru["empty.step3"], /Скачайте/);
});

test("loupe is a preview tool", () => {
  assert.match(en["preview.loupeHint"], /loupe/i);
  assert.match(ru["preview.loupeHint"], /Лупа/);
  assert.match(en["preview.gestureLoupe"], /loupe icon/);
  assert.match(ru["preview.gestureLoupe"], /лупы/);
});

test("share-target FAQ does not fake iOS", () => {
  assert.match(en["faq.a9"], /iOS Safari has no share target/);
  assert.match(ru["faq.a9"], /нет share target/);
});
