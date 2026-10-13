import { useEffect, useLayoutEffect, useImperativeHandle, useRef, useState, type ForwardedRef } from "react";
import {
  clampSplit,
  clampZoom,
  clipPathFromInset,
  destPointFromClient,
  imageClipInset,
  panAfterZoom,
  versusSideFromClient,
} from "@/lib/preview-gestures";
import type { PreviewProps, PreviewHandle } from "./types";
import { usePreviewInteractions } from "./usePreviewInteractions";
type Ptr = { x: number; y: number };
function verticalSplit() {
  return window.matchMedia("(max-width: 960px)").matches;
}
export function useCanvasPreview(props: PreviewProps, ref: ForwardedRef<PreviewHandle>) {
  const { viewMode, kernel, versusA, versusB, holdOriginal, onLoupePoint, onHoldOriginal } = props;
  const [loupeOn, setLoupeOn] = useState(false);

  const workRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const afterRef = useRef<HTMLCanvasElement>(null);
  const splitterRef = useRef<HTMLDivElement>(null);
  const sideBeforeRef = useRef<HTMLCanvasElement>(null);
  const sideAfterRef = useRef<HTMLCanvasElement>(null);
  const loupeRef = useRef<HTMLDivElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);
  const loupeSpotRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const zoomReadoutRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const gridCanvases = useRef(new Map<string, HTMLCanvasElement>());

  const zoomRef = useRef(1);
  const panXRef = useRef(0);
  const panYRef = useRef(0);
  const splitRef = useRef(0.5);
  const imgWRef = useRef(1);
  const imgHRef = useRef(1);
  const draggingRef = useRef<"split" | "pan" | "pinch" | "loupe" | null>(null);
  const pointersRef = useRef(new Map<number, Ptr>());
  const lastPtr = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const pinchRef = useRef<{
    dist: number;
    zoom: number;
    panX: number;
    panY: number;
    mid: Ptr;
  } | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const tapCountRef = useRef(0);
  const doubleTimerRef = useRef(0);
  const longPressRef = useRef(0);
  const holdFromPressRef = useRef(false);
  const panMovedRef = useRef(false);
  const kernelRef = useRef(kernel);
  const versusARef = useRef(versusA);
  const versusBRef = useRef(versusB);
  const viewModeRef = useRef(viewMode);
  const holdRef = useRef(holdOriginal);
  const onLoupePointRef = useRef(onLoupePoint);
  const onHoldRef = useRef(onHoldOriginal);
  const loupeOnRef = useRef(false);
  const emitLoupeRef = useRef<(clientX: number, clientY: number) => void>(() => {});

  useLayoutEffect(() => {
    kernelRef.current = kernel;
    versusARef.current = versusA;
    versusBRef.current = versusB;
    viewModeRef.current = viewMode;
    holdRef.current = holdOriginal;
    onLoupePointRef.current = onLoupePoint;
    onHoldRef.current = onHoldOriginal;
    loupeOnRef.current = loupeOn;
  }, [kernel, versusA, versusB, viewMode, holdOriginal, onLoupePoint, onHoldOriginal, loupeOn]);

  function fitScale() {
    const viewport = viewportRef.current;
    if (!viewport) return 1;
    const rect = viewport.getBoundingClientRect();
    const pad = 48;
    return Math.min((rect.width - pad) / imgWRef.current, (rect.height - pad) / imgHRef.current, 8);
  }

  function pointFromClient(clientX: number, clientY: number) {
    const viewport = viewportRef.current;
    if (!viewport) return { x: 0.5, y: 0.5 };
    const rect = viewport.getBoundingClientRect();
    return destPointFromClient({
      clientX,
      clientY,
      viewLeft: rect.left,
      viewTop: rect.top,
      viewW: rect.width,
      viewH: rect.height,
      panX: panXRef.current,
      panY: panYRef.current,
      scale: fitScale() * zoomRef.current,
      imgW: imgWRef.current,
      imgH: imgHRef.current,
    });
  }

  function applySplitClip() {
    const after = afterRef.current;
    const work = workRef.current;
    const splitter = splitterRef.current;
    const viewport = viewportRef.current;
    const t = holdRef.current ? 1 : splitRef.current;
    if (work) work.style.setProperty("--split", `${t * 100}%`);
    splitter?.setAttribute("aria-valuenow", String(Math.round(splitRef.current * 100)));
    if (!after || !viewport) return;
    const rect = viewport.getBoundingClientRect();
    const inset = imageClipInset({
      split: t,
      vertical: verticalSplit(),
      panX: panXRef.current,
      panY: panYRef.current,
      scale: fitScale() * zoomRef.current,
      imgW: imgWRef.current,
      imgH: imgHRef.current,
      viewW: rect.width,
      viewH: rect.height,
    });
    after.style.clipPath = clipPathFromInset(inset);
  }

  function applyNearest() {
    const stack = stackRef.current;
    const before = beforeRef.current;
    const after = afterRef.current;
    if (!stack || !before || !after) return;
    const versus = viewModeRef.current === "versus";
    stack.classList.toggle("is-nearest", !versus && kernelRef.current === "nearest");
    before.classList.toggle("is-nearest", versus && versusARef.current === "nearest");
    after.classList.toggle("is-nearest", versus && versusBRef.current === "nearest");
  }

  function applyTransform() {
    const world = worldRef.current;
    const zoomReadout = zoomReadoutRef.current;
    const stack = stackRef.current;
    if (!world || !zoomReadout || !stack) return;
    const s = fitScale() * zoomRef.current;
    world.style.transform = `translate(calc(-50% + ${panXRef.current}px), calc(-50% + ${panYRef.current}px)) scale(${s})`;
    zoomReadout.textContent = `${Math.round(zoomRef.current * fitScale() * 100)}%`;
    applyNearest();
    applySplitClip();
  }

  function setSplit(t: number) {
    splitRef.current = clampSplit(t);
    applySplitClip();
  }

  function resetView() {
    zoomRef.current = 1;
    panXRef.current = 0;
    panYRef.current = 0;
    applyTransform();
  }

  function zoomTo(nextZoom: number, focalX: number, focalY: number) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const fit = fitScale();
    const from = fit * zoomRef.current;
    const zoom = clampZoom(nextZoom);
    const to = fit * zoom;
    const pan = panAfterZoom({
      panX: panXRef.current,
      panY: panYRef.current,
      fromScale: from,
      toScale: to,
      focalX,
      focalY,
      viewLeft: rect.left,
      viewTop: rect.top,
      viewW: rect.width,
      viewH: rect.height,
    });
    zoomRef.current = zoom;
    panXRef.current = pan.panX;
    panYRef.current = pan.panY;
    applyTransform();
  }

  function blit(canvas: HTMLCanvasElement | null, imageData: ImageData) {
    if (!canvas) return;
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext("2d")?.putImageData(imageData, 0, 0);
  }

  function drawBeforeTo(canvas: HTMLCanvasElement | null, bitmap: ImageBitmap, w: number, h: number) {
    if (!canvas) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = kernelRef.current !== "nearest";
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
  }

  function sizeStack(w: number, h: number) {
    imgWRef.current = w;
    imgHRef.current = h;
    const stack = stackRef.current;
    if (stack) {
      stack.style.width = `${w}px`;
      stack.style.height = `${h}px`;
    }
  }

  function loupeAllowed() {
    const mode = viewModeRef.current;
    return mode === "split" || mode === "versus";
  }

  function loupeToolOn() {
    return loupeOnRef.current && loupeAllowed();
  }

  function hideLoupe() {
    const loupe = loupeRef.current;
    const spot = loupeSpotRef.current;
    if (loupe) {
      loupe.hidden = true;
      loupe.classList.remove("is-follow");
    }
    if (spot) spot.hidden = true;
  }

  function placeLoupe(clientX: number, clientY: number) {
    const loupe = loupeRef.current;
    const spot = loupeSpotRef.current;
    const work = workRef.current;
    if (!loupe || !work) return;
    const rect = work.getBoundingClientRect();
    const w = Math.min(rect.width * 0.38, 168);
    const h = w + 28;
    let x = clientX - rect.left + 22;
    let y = clientY - rect.top - h - 10;
    if (y < 8) y = clientY - rect.top + 22;
    if (x + w > rect.width - 8) x = clientX - rect.left - w - 16;
    if (x < 8) x = 8;
    loupe.style.left = `${x}px`;
    loupe.style.top = `${y}px`;
    loupe.style.right = "auto";
    loupe.style.bottom = "auto";
    loupe.classList.add("is-follow");
    if (spot) {
      spot.hidden = false;
      spot.style.left = `${clientX - rect.left}px`;
      spot.style.top = `${clientY - rect.top}px`;
    }
  }

  function emitLoupe(clientX: number, clientY: number) {
    if (!loupeAllowed()) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    placeLoupe(clientX, clientY);
    const onPoint = onLoupePointRef.current;
    if (typeof onPoint !== "function") return;
    const pt = pointFromClient(clientX, clientY);
    const rect = viewport.getBoundingClientRect();
    const side = versusSideFromClient(clientX, clientY, rect, splitRef.current, verticalSplit());
    onPoint(pt.x, pt.y, side);
  }
  useLayoutEffect(() => {
    emitLoupeRef.current = emitLoupe;
  });

  function setLoupeTool(on: boolean) {
    const next = on && loupeAllowed();
    loupeOnRef.current = next;
    setLoupeOn(next);
    viewportRef.current?.classList.toggle("is-loupe", next);
    if (!next) {
      hideLoupe();
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    emitLoupe(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function clearHoldPress() {
    window.clearTimeout(longPressRef.current);
    longPressRef.current = 0;
    if (holdFromPressRef.current) {
      holdFromPressRef.current = false;
      onHoldRef.current(false);
    }
  }

  useImperativeHandle(ref, () => ({
    applyTransform,
    setSplit,
    getSplit: () => splitRef.current,
    zoomBy(factor: number) {
      const viewport = viewportRef.current;
      const rect = viewport?.getBoundingClientRect();
      const cx = rect ? rect.left + rect.width / 2 : 0;
      const cy = rect ? rect.top + rect.height / 2 : 0;
      zoomTo(zoomRef.current * factor, cx, cy);
    },
    resetView,
    drawPreview({ bitmap, imageData, overview }) {
      sizeStack(imageData.width, imageData.height);
      drawBeforeTo(beforeRef.current, bitmap, imageData.width, imageData.height);
      blit(afterRef.current, imageData);
      drawBeforeTo(sideBeforeRef.current, bitmap, imageData.width, imageData.height);
      blit(sideAfterRef.current, imageData);
      if (badgeRef.current) badgeRef.current.hidden = !overview;
      applyTransform();
    },
    drawVersus({ a, b, overview }) {
      sizeStack(a.width, a.height);
      blit(beforeRef.current, a);
      blit(afterRef.current, b);
      blit(sideBeforeRef.current, a);
      blit(sideAfterRef.current, b);
      if (badgeRef.current) badgeRef.current.hidden = !overview;
      applyTransform();
    },
    showLoupe(imageData) {
      const loupe = loupeRef.current;
      if (!loupe) return;
      if (!imageData) {
        if (!loupeOnRef.current) hideLoupe();
        return;
      }
      loupe.hidden = false;
      blit(loupeCanvasRef.current, imageData);
    },
    destCenter() {
      const viewport = viewportRef.current;
      if (!viewport) return { x: 0.5, y: 0.5 };
      const rect = viewport.getBoundingClientRect();
      return pointFromClient(rect.left + rect.width / 2, rect.top + rect.height / 2);
    },
    destPointFromClient: pointFromClient,
    paintGrid(id, imageData) {
      const canvas = gridCanvases.current.get(id);
      if (!canvas) return;
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      canvas.getContext("2d")?.putImageData(imageData, 0, 0);
    },
    clearGrid() {
      for (const canvas of gridCanvases.current.values()) {
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.fillStyle = "#101214";
        ctx.fillRect(0, 0, canvas.width || 1, canvas.height || 1);
      }
    },
  }));

  const liveActions = useRef({ applyTransform, loupeToolOn, setLoupeTool, setSplit, resetView, zoomTo });
  useEffect(() => {
    liveActions.current = { applyTransform, loupeToolOn, setLoupeTool, setSplit, resetView, zoomTo };
  });
  useEffect(() => {
    const actions = liveActions.current;
    actions.setSplit(splitRef.current);
    actions.applyTransform();
    if (viewMode !== "split" && viewMode !== "versus" && loupeOnRef.current) actions.setLoupeTool(false);
    else viewportRef.current?.classList.toggle("is-loupe", actions.loupeToolOn());
  }, [holdOriginal, kernel, versusA, versusB, viewMode]);

  usePreviewInteractions(
    {
      viewportRef,
      splitterRef,
      viewModeRef,
      draggingRef,
      pointersRef,
      pinchRef,
      zoomRef,
      panXRef,
      panYRef,
      doubleTimerRef,
      panMovedRef,
      lastPtr,
      tapCountRef,
      lastTapRef,
      panStartRef,
      longPressRef,
      holdFromPressRef,
      onHoldRef,
      emitLoupeRef,
      loupeSpotRef,
      splitRef,
      loupeOnRef,
    },
    { applyTransform, loupeToolOn, resetView, setSplit, zoomTo, clearHoldPress, hideLoupe, fitScale, setLoupeOn },
  );
  const actualPixels = () => {
    zoomRef.current = clampZoom(1 / fitScale());
    panXRef.current = 0;
    panYRef.current = 0;
    applyTransform();
  };
  return {
    workRef,
    viewportRef,
    worldRef,
    stackRef,
    beforeRef,
    afterRef,
    splitterRef,
    sideBeforeRef,
    sideAfterRef,
    loupeRef,
    loupeCanvasRef,
    loupeSpotRef,
    badgeRef,
    zoomReadoutRef,
    gridRef,
    gridCanvases,
    loupeOn,
    setLoupeTool,
    resetView,
    actualPixels,
  };
}
