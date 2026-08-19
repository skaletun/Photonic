import assert from "node:assert/strict";
import { test } from "vitest";
import {
  convertPaper,
  fitInsidePaper,
  inToPx,
  mmToPx,
  paperToPx,
  pxToIn,
  pxToMm,
} from "@/lib/print";

test("mm and inches convert through DPI", () => {
  assert.equal(mmToPx(25.4, 300), 300);
  assert.equal(inToPx(1, 300), 300);
  assert.ok(Math.abs(pxToMm(300, 300) - 25.4) < 1e-9);
  assert.ok(Math.abs(pxToIn(300, 300) - 1) < 1e-9);
  assert.deepEqual(paperToPx(4, 6, "in", 300), { width: 1200, height: 1800 });
  assert.equal(mmToPx(100, 300), Math.round((100 / 25.4) * 300));
});

test("fitInsidePaper contains when locked and fills when not", () => {
  const contained = fitInsidePaper(4000, 3000, 1800, 1200, true);
  assert.equal(contained.width, 1600);
  assert.equal(contained.height, 1200);
  const stretched = fitInsidePaper(4000, 3000, 1800, 1200, false);
  assert.equal(stretched.width, 1800);
  assert.equal(stretched.height, 1200);
});

test("unit conversion mm ↔ in", () => {
  const inches = convertPaper(101.6, 152.4, "mm", "in");
  assert.ok(Math.abs(inches.width - 4) < 1e-9);
  assert.ok(Math.abs(inches.height - 6) < 1e-9);
  const mm = convertPaper(4, 6, "in", "mm");
  assert.ok(Math.abs(mm.width - 101.6) < 1e-9);
});
