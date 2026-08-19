import assert from "node:assert/strict";
import { test } from "vitest";
import { parseRecipe, recipeFromSettings, serializeRecipe, type Recipe } from "@/lib/recipe";

const base: Recipe = {
  kernel: "photonic",
  lanczosA: 3,
  colorSpace: "linear",
  unsharpEnabled: false,
  unsharpAmount: 80,
  unsharpRadius: 0.6,
  unsharpThreshold: 2,
  exportFormat: "jpeg",
  quality: 0.92,
  lockAspect: true,
  scale: 400,
  dpi: 300,
  printUnit: "in",
};

test("empty hash is not a recipe", () => {
  assert.equal(parseRecipe(""), null);
  assert.equal(parseRecipe("#"), null);
  assert.equal(parseRecipe("#hero"), null);
});

test("round-trips a recipe without an image", () => {
  const hash = serializeRecipe(base);
  assert.equal(hash.includes("data:"), false);
  assert.equal(hash.includes("http"), false);
  const parsed = parseRecipe(`#${hash}`);
  assert.ok(parsed);
  assert.equal(parsed.kernel, "photonic");
  assert.equal(parsed.scale, 400);
  assert.equal(parsed.exportFormat, "jpeg");
  assert.equal(parsed.quality, 0.92);
  assert.equal(parsed.lockAspect, true);
  assert.equal(parsed.unsharpEnabled, false);
  assert.equal(parsed.dpi, 300);
  assert.equal(parsed.printUnit, "in");
});

test("print unit uses pu so unsharp u still works", () => {
  const parsed = parseRecipe("#u=1&pu=mm&dpi=360");
  assert.ok(parsed);
  assert.equal(parsed.unsharpEnabled, true);
  assert.equal(parsed.printUnit, "mm");
  assert.equal(parsed.dpi, 360);
});

test("ignores unknown kernels and clamps scale", () => {
  const parsed = parseRecipe("#k=nope&s=9000&a=2&c=srgb");
  assert.ok(parsed);
  assert.equal(parsed.kernel, undefined);
  assert.equal(parsed.scale, 1000);
  assert.equal(parsed.lanczosA, 2);
  assert.equal(parsed.colorSpace, "srgb");
});

test("recipeFromSettings uses percent scale, not pixels", () => {
  const recipe = recipeFromSettings(
    {
      ...base,
      destW: 800,
      destH: 600,
      sourceWidth: 200,
      hasSource: true,
    },
    100,
  );
  assert.equal(recipe.scale, 400);
});
