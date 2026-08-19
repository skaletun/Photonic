export const ZOOM_MIN = 0.15;
export const ZOOM_MAX = 24;
export const SPLIT_MIN = 0.02;
export const SPLIT_MAX = 0.98;
export const DOUBLE_TAP_MS = 320;
export const DOUBLE_TAP_DIST = 28;
export const TRIPLE_WAIT_MS = 240;
export const PAN_THRESHOLD = 10;
export const LONG_PRESS_MS = 450;

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function clampZoom(zoom: number) {
  return clamp(zoom, ZOOM_MIN, ZOOM_MAX);
}

export function clampSplit(t: number) {
  return clamp(t, SPLIT_MIN, SPLIT_MAX);
}

export function pinchDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pinchCenter(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function splitFromViewport(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  vertical: boolean,
) {
  if (rect.width <= 0 || rect.height <= 0) return 0.5;
  const t = vertical ? (clientY - rect.top) / rect.height : (clientX - rect.left) / rect.width;
  return clampSplit(t);
}

/** Keep the focal point (client coords) stuck to the same image pixel after a scale change. Pan is in CSS pixels. */
export function panAfterZoom(args: {
  panX: number;
  panY: number;
  fromScale: number;
  toScale: number;
  focalX: number;
  focalY: number;
  viewLeft: number;
  viewTop: number;
  viewW: number;
  viewH: number;
}) {
  if (args.fromScale <= 0 || args.viewW <= 0 || args.viewH <= 0) {
    return { panX: args.panX, panY: args.panY };
  }
  const cx = args.viewLeft + args.viewW / 2;
  const cy = args.viewTop + args.viewH / 2;
  const ox = args.focalX - cx - args.panX;
  const oy = args.focalY - cy - args.panY;
  const k = args.toScale / args.fromScale;
  return {
    panX: args.focalX - cx - ox * k,
    panY: args.focalY - cy - oy * k,
  };
}

export function imageClipInset(args: {
  split: number;
  vertical: boolean;
  panX: number;
  panY: number;
  scale: number;
  imgW: number;
  imgH: number;
  viewW: number;
  viewH: number;
}) {
  const split = clampSplit(args.split);
  if (args.scale <= 0 || args.imgW <= 0 || args.imgH <= 0) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  if (args.vertical) {
    const line = split * args.viewH;
    const localY = (line - args.viewH / 2 - args.panY) / args.scale + args.imgH / 2;
    return { top: clamp(localY, 0, args.imgH), right: 0, bottom: 0, left: 0 };
  }
  const line = split * args.viewW;
  const localX = (line - args.viewW / 2 - args.panX) / args.scale + args.imgW / 2;
  return { top: 0, right: 0, bottom: 0, left: clamp(localX, 0, args.imgW) };
}

export function clipPathFromInset(inset: { top: number; right: number; bottom: number; left: number }) {
  return `inset(${inset.top}px ${inset.right}px ${inset.bottom}px ${inset.left}px)`;
}

export function isDoubleTap(
  prev: { t: number; x: number; y: number } | null,
  next: { t: number; x: number; y: number },
  maxMs = DOUBLE_TAP_MS,
  maxDist = DOUBLE_TAP_DIST,
) {
  if (!prev) return false;
  return next.t - prev.t <= maxMs && Math.hypot(next.x - prev.x, next.y - prev.y) <= maxDist;
}

export function nextToggleZoom(zoom: number) {
  return zoom > 1.35 ? 1 : 2.4;
}

export function destPointFromClient(args: {
  clientX: number;
  clientY: number;
  viewLeft: number;
  viewTop: number;
  viewW: number;
  viewH: number;
  panX: number;
  panY: number;
  scale: number;
  imgW: number;
  imgH: number;
}) {
  if (args.scale <= 0 || args.imgW <= 0 || args.imgH <= 0 || args.viewW <= 0 || args.viewH <= 0) {
    return { x: 0.5, y: 0.5 };
  }
  const lx = args.clientX - args.viewLeft;
  const ly = args.clientY - args.viewTop;
  const px = (lx - (args.viewW / 2 + args.panX)) / args.scale + args.imgW / 2;
  const py = (ly - (args.viewH / 2 + args.panY)) / args.scale + args.imgH / 2;
  return { x: px / args.imgW, y: py / args.imgH };
}

export function versusSideFromClient(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  split: number,
  vertical: boolean,
): "a" | "b" {
  if (rect.width <= 0 || rect.height <= 0) return "b";
  const t = vertical ? (clientY - rect.top) / rect.height : (clientX - rect.left) / rect.width;
  return t < split ? "a" : "b";
}
