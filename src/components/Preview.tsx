"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { KERNEL_IDS, nextKernelId, type KernelId, type ViewMode } from "@/lib/config";
import { withBase } from "@/lib/base-path";
import {
  LONG_PRESS_MS,
  PAN_THRESHOLD,
  TRIPLE_WAIT_MS,
  clampSplit,
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
import { SAMPLE_FILES, type SampleId } from "@/lib/samples";
import { useT } from "@/hooks/useT";

export type PreviewHandle = {
  applyTransform: () => void;
  setSplit: (t: number) => void;
  zoomBy: (factor: number) => void;
  resetView: () => void;
  drawPreview: (args: { bitmap: ImageBitmap; imageData: ImageData; overview: boolean }) => void;
  drawVersus: (args: { a: ImageData; b: ImageData; overview: boolean }) => void;
  showLoupe: (imageData: ImageData | null) => void;
  destCenter: () => { x: number; y: number };
  destPointFromClient: (clientX: number, clientY: number) => { x: number; y: number };
  paintGrid: (id: string, imageData: ImageData) => void;
  clearGrid: () => void;
  getSplit: () => number;
};

type Props = {
  hasSource: boolean;
  viewMode: ViewMode;
  kernel: KernelId;
  versusA: KernelId;
  versusB: KernelId;
  holdOriginal: boolean;
  onViewMode: (mode: ViewMode) => void;
  onVersusKernel: (side: "a" | "b", id: KernelId) => void;
  onLoupePoint: (nx: number, ny: number, side: "a" | "b") => void;
  onOpen: () => void;
  onSample: (id: SampleId) => void;
  onHoldOriginal: (hold: boolean) => void;
};

type Ptr = { x: number; y: number };

function verticalSplit() {
  return window.matchMedia("(max-width: 960px)").matches;
}

export const Preview = forwardRef<PreviewHandle, Props>(function Preview(
  {
    hasSource,
    viewMode,
    kernel,
    versusA,
    versusB,
    holdOriginal,
    onViewMode,
    onVersusKernel,
    onLoupePoint,
    onOpen,
    onSample,
    onHoldOriginal,
  },
  ref,
) {
  const { t, kernelTitle } = useT();
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

  kernelRef.current = kernel;
  versusARef.current = versusA;
  versusBRef.current = versusB;
  viewModeRef.current = viewMode;
  holdRef.current = holdOriginal;
  onLoupePointRef.current = onLoupePoint;
  onHoldRef.current = onHoldOriginal;
  loupeOnRef.current = loupeOn;

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
  emitLoupeRef.current = emitLoupe;

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

  useEffect(() => {
    setSplit(splitRef.current);
    applyTransform();
    if (viewMode !== "split" && viewMode !== "versus" && loupeOnRef.current) {
      setLoupeTool(false);
    } else {
      viewportRef.current?.classList.toggle("is-loupe", loupeToolOn());
    }
  }, [holdOriginal, kernel, versusA, versusB, viewMode]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const splitter = splitterRef.current;
    if (!viewport || !splitter) return;

    const splitMode = () => {
      const mode = viewModeRef.current;
      return mode === "split" || mode === "versus";
    };

    const onSplitterDown = (event: PointerEvent) => {
      if (!splitMode()) return;
      event.preventDefault();
      event.stopPropagation();
      draggingRef.current = "split";
      splitter.setPointerCapture(event.pointerId);
    };

    const beginPinch = () => {
      const pts = [...pointersRef.current.values()];
      if (pts.length < 2) return;
      clearHoldPress();
      draggingRef.current = "pinch";
      const mid = pinchCenter(pts[0], pts[1]);
      pinchRef.current = {
        dist: Math.max(1, pinchDistance(pts[0], pts[1])),
        zoom: zoomRef.current,
        panX: panXRef.current,
        panY: panYRef.current,
        mid,
      };
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.target === splitter || splitter.contains(event.target as Node)) return;
      if (viewModeRef.current === "grid") return;
      if (viewModeRef.current === "side") return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointersRef.current.size >= 2) {
        event.preventDefault();
        window.clearTimeout(doubleTimerRef.current);
        beginPinch();
        return;
      }

      if (loupeToolOn()) {
        event.preventDefault();
        draggingRef.current = "loupe";
        panMovedRef.current = false;
        lastPtr.current = { x: event.clientX, y: event.clientY };
        emitLoupeRef.current(event.clientX, event.clientY);
        return;
      }

      const tap = { t: performance.now(), x: event.clientX, y: event.clientY };
      if (isDoubleTap(lastTapRef.current, tap)) {
        tapCountRef.current += 1;
      } else {
        tapCountRef.current = 1;
      }
      lastTapRef.current = tap;

      if (tapCountRef.current === 2) {
        event.preventDefault();
        pointersRef.current.delete(event.pointerId);
        draggingRef.current = null;
        window.clearTimeout(doubleTimerRef.current);
        doubleTimerRef.current = window.setTimeout(() => {
          tapCountRef.current = 0;
          lastTapRef.current = null;
          zoomTo(nextToggleZoom(zoomRef.current), tap.x, tap.y);
        }, TRIPLE_WAIT_MS);
        return;
      }

      if (tapCountRef.current >= 3) {
        event.preventDefault();
        pointersRef.current.delete(event.pointerId);
        draggingRef.current = null;
        window.clearTimeout(doubleTimerRef.current);
        tapCountRef.current = 0;
        lastTapRef.current = null;
        resetView();
        return;
      }

      draggingRef.current = "pan";
      panMovedRef.current = false;
      lastPtr.current = { x: event.clientX, y: event.clientY };
      panStartRef.current = { x: event.clientX, y: event.clientY };
      longPressRef.current = window.setTimeout(() => {
        if (pointersRef.current.size !== 1 || panMovedRef.current) return;
        holdFromPressRef.current = true;
        onHoldRef.current(true);
      }, LONG_PRESS_MS);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointersRef.current.has(event.pointerId)) {
        pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }

      if (draggingRef.current === "split") {
        event.preventDefault();
        const rect = viewport.getBoundingClientRect();
        setSplit(splitFromViewport(event.clientX, event.clientY, rect, verticalSplit()));
        return;
      }

      if (loupeToolOn()) {
        const rect = viewport.getBoundingClientRect();
        const over =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom;
        if (over || draggingRef.current === "loupe") {
          emitLoupeRef.current(event.clientX, event.clientY);
          if (draggingRef.current === "loupe") event.preventDefault();
        } else {
          loupeSpotRef.current && (loupeSpotRef.current.hidden = true);
        }
        if (pointersRef.current.size < 2) return;
      }

      if (pointersRef.current.size >= 2) {
        if (draggingRef.current !== "pinch") beginPinch();
        const pts = [...pointersRef.current.values()];
        const pinch = pinchRef.current;
        if (!pinch || pts.length < 2) return;
        event.preventDefault();
        const dist = Math.max(1, pinchDistance(pts[0], pts[1]));
        const mid = pinchCenter(pts[0], pts[1]);
        const next = clampZoom(pinch.zoom * (dist / pinch.dist));
        const fit = fitScale();
        panXRef.current = pinch.panX + (mid.x - pinch.mid.x);
        panYRef.current = pinch.panY + (mid.y - pinch.mid.y);
        const pan = panAfterZoom({
          panX: panXRef.current,
          panY: panYRef.current,
          fromScale: fit * pinch.zoom,
          toScale: fit * next,
          focalX: mid.x,
          focalY: mid.y,
          viewLeft: viewport.getBoundingClientRect().left,
          viewTop: viewport.getBoundingClientRect().top,
          viewW: viewport.getBoundingClientRect().width,
          viewH: viewport.getBoundingClientRect().height,
        });
        zoomRef.current = next;
        panXRef.current = pan.panX;
        panYRef.current = pan.panY;
        applyTransform();
        return;
      }

      if (draggingRef.current === "pan" && pointersRef.current.has(event.pointerId)) {
        const dx = event.clientX - lastPtr.current.x;
        const dy = event.clientY - lastPtr.current.y;
        if (
          !panMovedRef.current &&
          Math.hypot(event.clientX - panStartRef.current.x, event.clientY - panStartRef.current.y) < PAN_THRESHOLD &&
          !holdFromPressRef.current
        ) {
          return;
        }
        lastPtr.current = { x: event.clientX, y: event.clientY };
        panMovedRef.current = true;
        window.clearTimeout(longPressRef.current);
        panXRef.current += dx;
        panYRef.current += dy;
        applyTransform();
      }
    };

    const endPointer = (event: PointerEvent) => {
      const known = pointersRef.current.has(event.pointerId) || draggingRef.current === "split";
      pointersRef.current.delete(event.pointerId);
      if (!known) return;
      if (draggingRef.current === "split") {
        draggingRef.current = pointersRef.current.size ? draggingRef.current : null;
        if (!loupeToolOn()) hideLoupe();
        return;
      }

      if (pointersRef.current.size >= 2) {
        beginPinch();
        return;
      }

      if (pointersRef.current.size === 1) {
        pinchRef.current = null;
        const remaining = [...pointersRef.current.values()][0];
        draggingRef.current = loupeToolOn() ? "loupe" : "pan";
        lastPtr.current = remaining;
        return;
      }

      clearHoldPress();
      pinchRef.current = null;
      draggingRef.current = null;
      if (!loupeToolOn()) hideLoupe();
    };

    const onWheel = (event: WheelEvent) => {
      if (viewModeRef.current === "grid" || viewModeRef.current === "side") return;
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      zoomTo(zoomRef.current * factor, event.clientX, event.clientY);
    };

    const onKey = (event: KeyboardEvent) => {
      const step = event.shiftKey ? 0.08 : 0.03;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        setSplit(splitRef.current - step);
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        setSplit(splitRef.current + step);
      }
    };

    const onWindowKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !loupeOnRef.current) return;
      event.preventDefault();
      loupeOnRef.current = false;
      setLoupeOn(false);
      viewport.classList.remove("is-loupe");
      hideLoupe();
    };

    const onContextMenu = (event: Event) => {
      event.preventDefault();
    };

    const onResize = () => applyTransform();

    splitter.addEventListener("pointerdown", onSplitterDown);
    viewport.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endPointer);
    window.addEventListener("pointercancel", endPointer);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("contextmenu", onContextMenu);
    splitter.addEventListener("keydown", onKey);
    window.addEventListener("keydown", onWindowKey);
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);

    return () => {
      clearHoldPress();
      window.clearTimeout(doubleTimerRef.current);
      splitter.removeEventListener("pointerdown", onSplitterDown);
      viewport.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endPointer);
      window.removeEventListener("pointercancel", endPointer);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("contextmenu", onContextMenu);
      splitter.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onWindowKey);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <>
      <div className="stage-empty" hidden={hasSource} id="stage-empty">
        <div className="empty-copy">
          <p className="empty-kicker">{t("empty.kicker")}</p>
          <h2>{t("empty.title")}</h2>
          <p>{t("empty.body")}</p>
          <ol className="empty-steps">
            <li>
              <span className="empty-step-idx" aria-hidden="true">
                01
              </span>
              <span>{t("empty.step1")}</span>
            </li>
            <li>
              <span className="empty-step-idx" aria-hidden="true">
                02
              </span>
              <span>{t("empty.step2")}</span>
            </li>
            <li>
              <span className="empty-step-idx" aria-hidden="true">
                03
              </span>
              <span>{t("empty.step3")}</span>
            </li>
          </ol>
          <button
            className="btn-export empty-open"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
          >
            {t("empty.open")}
          </button>
        </div>
        <div className="sample-mosaic" onClick={(event) => event.stopPropagation()}>
          <p className="sample-kicker">{t("empty.samples")}</p>
          {SAMPLE_FILES.map((sample) => {
            const labelKey =
              sample.id === "photo" ? "empty.samplePhoto" : sample.id === "type" ? "empty.sampleType" : "empty.samplePixel";
            return (
              <button key={sample.id} className={`sample sample-${sample.id}`} type="button" onClick={() => onSample(sample.id)}>
                <img
                  src={withBase(`/samples/${sample.file}`)}
                  alt={t(labelKey)}
                  width={sample.id === "photo" ? 640 : sample.id === "type" ? 1280 : 32}
                  height={sample.id === "photo" ? 853 : sample.id === "type" ? 720 : 32}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
                <span>{t(labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="stage-work" ref={workRef} hidden={!hasSource} data-mode={viewMode}>
        <div className="view-modes" role="group" aria-label={t("preview.modes")}>
          {(
            [
              ["split", "preview.split", "preview.splitHint"],
              ["versus", "preview.versus", "preview.versusHint"],
              ["side", "preview.side", "preview.sideHint"],
              ["grid", "preview.grid", "preview.gridHint"],
            ] as const
          ).map(([mode, key, hint]) => (
            <button
              key={mode}
              className="chip"
              type="button"
              data-mode={mode}
              title={t(hint)}
              aria-pressed={viewMode === mode}
              onClick={() => onViewMode(mode)}
            >
              {t(key)}
            </button>
          ))}
          <button className="chip chip-fit" type="button" title={t("preview.fitHint")} onClick={() => resetView()}>
            {t("preview.fit")}
          </button>
          <button
            className="chip chip-icon chip-loupe"
            type="button"
            title={viewMode === "split" || viewMode === "versus" ? t("preview.loupeHint") : t("preview.loupeNeedView")}
            aria-label={t("preview.loupe")}
            aria-pressed={loupeOn}
            disabled={viewMode === "grid" || viewMode === "side"}
            onClick={() => setLoupeTool(!loupeOn)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7">
              <circle cx="10.2" cy="10.2" r="5.6" />
              <circle cx="10.2" cy="10.2" r="2.15" opacity="0.4" />
              <path d="M14.7 15.1 20.2 21" strokeLinecap="square" />
            </svg>
          </button>
        </div>
        <div className="zoom-readout" ref={zoomReadoutRef}>
          100%
        </div>
        <span className="badge" ref={badgeRef} hidden>
          {t("preview.badge")}
        </span>

        <div className="versus-tags" hidden={viewMode !== "versus"}>
          <button
            className="versus-tag"
            type="button"
            title={t("preview.versusTagHint")}
            onClick={() => onVersusKernel("a", nextKernelId(versusA))}
          >
            A · {kernelTitle(versusA)}
          </button>
          <button
            className="versus-tag is-b"
            type="button"
            title={t("preview.versusTagHint")}
            onClick={() => onVersusKernel("b", nextKernelId(versusB))}
          >
            B · {kernelTitle(versusB)}
          </button>
        </div>

        <div className={loupeOn ? "viewport is-loupe" : "viewport"} id="viewport" ref={viewportRef}>
          <div className="world" ref={worldRef}>
            <div className="stack" ref={stackRef}>
              <canvas ref={beforeRef} aria-label={t("preview.source")} />
              <canvas ref={afterRef} className="plate-after" aria-label={t("preview.result")} />
            </div>
          </div>
          <div
            className="splitter"
            ref={splitterRef}
            role="slider"
            tabIndex={0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={50}
            aria-label={t("preview.splitter")}
            hidden={viewMode !== "split" && viewMode !== "versus"}
          />
          <div className="side-pair">
            <figure>
              <figcaption>{t("preview.before")}</figcaption>
              <canvas ref={sideBeforeRef} />
            </figure>
            <figure>
              <figcaption>{t("preview.after")}</figcaption>
              <canvas ref={sideAfterRef} />
            </figure>
          </div>
        </div>

        <div className="compare-grid" ref={gridRef} hidden={viewMode !== "grid"}>
          {KERNEL_IDS.map((id) => (
            <figure className="compare-cell" key={id}>
              <canvas
                ref={(node) => {
                  if (node) gridCanvases.current.set(id, node);
                  else gridCanvases.current.delete(id);
                }}
              />
              <figcaption>{kernelTitle(id)}</figcaption>
            </figure>
          ))}
        </div>
        <p className="work-hint">
          {t(
            loupeOn
              ? "preview.gestureLoupe"
              : viewMode === "split" || viewMode === "versus"
                ? "preview.gesture"
                : "preview.gestureLook",
          )}
        </p>
        <div className="loupe-spot" ref={loupeSpotRef} hidden />
        <div className="loupe" ref={loupeRef} hidden>
          <canvas ref={loupeCanvasRef} width={256} height={256} />
          <span>{t("preview.loupe")}</span>
        </div>
      </div>
    </>
  );
});
