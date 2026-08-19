import assert from "node:assert/strict";
import { test } from "vitest";
import {
  clampZoom,
  clipPathFromInset,
  destPointFromClient,
  imageClipInset,
  isDoubleTap,
  nextToggleZoom,
  panAfterZoom,
  pinchCenter,
  pinchDistance,
  splitFromViewport,
  versusSideFromClient,
} from "@/lib/preview-gestures";

test("pinch geometry", () => {
  assert.equal(pinchDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.deepEqual(pinchCenter({ x: 0, y: 2 }, { x: 4, y: 6 }), { x: 2, y: 4 });
});

test("split follows the viewport, not the image", () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };
  assert.equal(splitFromViewport(200, 50, rect, false), 0.5);
  assert.equal(splitFromViewport(100, 100, rect, true), 0.5);
  assert.equal(splitFromViewport(0, 0, rect, false), 0.02);
});

test("zoom around a point keeps that point stuck", () => {
  const pan = panAfterZoom({
    panX: 0,
    panY: 0,
    fromScale: 1,
    toScale: 2,
    focalX: 150,
    focalY: 100,
    viewLeft: 0,
    viewTop: 0,
    viewW: 200,
    viewH: 200,
  });
  assert.equal(pan.panX, -50);
  assert.equal(pan.panY, 0);
  const back = panAfterZoom({
    ...pan,
    fromScale: 2,
    toScale: 1,
    focalX: 150,
    focalY: 100,
    viewLeft: 0,
    viewTop: 0,
    viewW: 200,
    viewH: 200,
  });
  assert.ok(Math.abs(back.panX) < 1e-9);
  assert.ok(Math.abs(back.panY) < 1e-9);
});

test("clip inset maps a centered split to the image center", () => {
  const inset = imageClipInset({
    split: 0.5,
    vertical: false,
    panX: 0,
    panY: 0,
    scale: 1,
    imgW: 200,
    imgH: 100,
    viewW: 200,
    viewH: 100,
  });
  assert.equal(inset.left, 100);
  assert.equal(inset.top, 0);
  assert.equal(clipPathFromInset(inset), "inset(0px 0px 0px 100px)");
});

test("double-tap toggle and clamp", () => {
  assert.equal(nextToggleZoom(1), 2.4);
  assert.equal(nextToggleZoom(2.4), 1);
  assert.equal(clampZoom(0), 0.15);
  assert.equal(isDoubleTap({ t: 0, x: 10, y: 10 }, { t: 200, x: 12, y: 11 }), true);
  assert.equal(isDoubleTap({ t: 0, x: 10, y: 10 }, { t: 800, x: 12, y: 11 }), false);
});

test("dest point from client maps the image centre", () => {
  const pt = destPointFromClient({
    clientX: 100,
    clientY: 80,
    viewLeft: 0,
    viewTop: 0,
    viewW: 200,
    viewH: 160,
    panX: 0,
    panY: 0,
    scale: 1,
    imgW: 200,
    imgH: 160,
  });
  assert.ok(Math.abs(pt.x - 0.5) < 1e-9);
  assert.ok(Math.abs(pt.y - 0.5) < 1e-9);
});

test("versus side follows the splitter", () => {
  const rect = { left: 0, top: 0, width: 200, height: 100 };
  assert.equal(versusSideFromClient(40, 50, rect, 0.5, false), "a");
  assert.equal(versusSideFromClient(160, 50, rect, 0.5, false), "b");
  assert.equal(versusSideFromClient(100, 20, rect, 0.5, true), "a");
  assert.equal(versusSideFromClient(100, 80, rect, 0.5, true), "b");
});
