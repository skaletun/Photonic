import { useEffect, useRef, type RefObject } from "react";
import type { ViewMode } from "@/lib/config";
import {
  LONG_PRESS_MS,
  PAN_THRESHOLD,
  TRIPLE_WAIT_MS,
  clampZoom,
  isDoubleTap,
  nextToggleZoom,
  panAfterZoom,
  pinchCenter,
  pinchDistance,
  splitFromViewport,
} from "@/lib/preview-gestures";
type Ptr = { x: number; y: number };
type InteractionRefs = {
  viewportRef: RefObject<HTMLDivElement | null>;
  splitterRef: RefObject<HTMLDivElement | null>;
  viewModeRef: RefObject<ViewMode>;
  draggingRef: RefObject<"split" | "pan" | "pinch" | "loupe" | null>;
  pointersRef: RefObject<Map<number, Ptr>>;
  pinchRef: RefObject<{ dist: number; zoom: number; panX: number; panY: number; mid: Ptr } | null>;
  zoomRef: RefObject<number>;
  panXRef: RefObject<number>;
  panYRef: RefObject<number>;
  doubleTimerRef: RefObject<number>;
  panMovedRef: RefObject<boolean>;
  lastPtr: RefObject<Ptr>;
  tapCountRef: RefObject<number>;
  lastTapRef: RefObject<{ t: number; x: number; y: number } | null>;
  panStartRef: RefObject<Ptr>;
  longPressRef: RefObject<number>;
  holdFromPressRef: RefObject<boolean>;
  onHoldRef: RefObject<(hold: boolean) => void>;
  emitLoupeRef: RefObject<(x: number, y: number) => void>;
  loupeSpotRef: RefObject<HTMLDivElement | null>;
  splitRef: RefObject<number>;
  loupeOnRef: RefObject<boolean>;
};
type Actions = {
  applyTransform: () => void;
  loupeToolOn: () => boolean;
  resetView: () => void;
  setSplit: (value: number) => void;
  zoomTo: (zoom: number, x: number, y: number) => void;
  clearHoldPress: () => void;
  hideLoupe: () => void;
  fitScale: () => number;
  setLoupeOn: (value: boolean) => void;
};
function verticalSplit() {
  return window.matchMedia("(max-width: 960px)").matches;
}
export function usePreviewInteractions(refs: InteractionRefs, actions: Actions) {
  const {
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
  } = refs;
  const live = useRef(actions);
  useEffect(() => {
    live.current = actions;
  });
  useEffect(() => {
    const {
      applyTransform,
      loupeToolOn,
      resetView,
      setSplit,
      zoomTo,
      clearHoldPress,
      hideLoupe,
      fitScale,
      setLoupeOn,
    } = live.current;
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
          if (loupeSpotRef.current) loupeSpotRef.current.hidden = true;
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
  }, [
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
  ]);
}
