"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { KERNEL_IDS, type KernelId, type ViewMode } from "@/lib/config";
import { useT } from "@/hooks/useT";

export type PreviewHandle = {
  applyTransform: () => void;
  setSplit: (t: number) => void;
  zoomBy: (factor: number) => void;
  resetView: () => void;
  drawPreview: (args: { bitmap: ImageBitmap; imageData: ImageData; overview: boolean }) => void;
  showLoupe: (imageData: ImageData | null) => void;
  destCenter: () => { x: number; y: number };
  paintGrid: (id: string, imageData: ImageData) => void;
  clearGrid: () => void;
  getSplit: () => number;
};

type Props = {
  hasSource: boolean;
  viewMode: ViewMode;
  kernel: KernelId;
  holdOriginal: boolean;
  onViewMode: (mode: ViewMode) => void;
  onLoupe: () => void;
  onOpen: () => void;
};

export const Preview = forwardRef<PreviewHandle, Props>(function Preview(
  { hasSource, viewMode, kernel, holdOriginal, onViewMode, onLoupe, onOpen },
  ref,
) {
  const { t, kernelTitle } = useT();

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
  const draggingRef = useRef<"split" | "pan" | null>(null);
  const lastPtr = useRef({ x: 0, y: 0 });
  const kernelRef = useRef(kernel);
  const viewModeRef = useRef(viewMode);
  const holdRef = useRef(holdOriginal);

  kernelRef.current = kernel;
  viewModeRef.current = viewMode;
  holdRef.current = holdOriginal;

  function fitScale() {
    const viewport = viewportRef.current;
    if (!viewport) return 1;
    const rect = viewport.getBoundingClientRect();
    const pad = 48;
    return Math.min((rect.width - pad) / imgWRef.current, (rect.height - pad) / imgHRef.current, 8);
  }

  function applyTransform() {
    const world = worldRef.current;
    const zoomReadout = zoomReadoutRef.current;
    const stack = stackRef.current;
    if (!world || !zoomReadout || !stack) return;
    const s = fitScale() * zoomRef.current;
    world.style.transform = `translate(calc(-50% + ${panXRef.current}px), calc(-50% + ${panYRef.current}px)) scale(${s})`;
    zoomReadout.textContent = `${Math.round(zoomRef.current * fitScale() * 100)}%`;
    stack.classList.toggle("is-nearest", kernelRef.current === "nearest");
  }

  function setSplit(t: number) {
    const v = Math.min(0.98, Math.max(0.02, t));
    splitRef.current = v;
    const work = workRef.current;
    const splitter = splitterRef.current;
    if (work) work.style.setProperty("--split", `${(holdRef.current ? 1 : v) * 100}%`);
    splitter?.setAttribute("aria-valuenow", String(Math.round(v * 100)));
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

  useImperativeHandle(ref, () => ({
    applyTransform,
    setSplit,
    getSplit: () => splitRef.current,
    zoomBy(factor: number) {
      zoomRef.current = Math.min(24, Math.max(0.15, zoomRef.current * factor));
      applyTransform();
    },
    resetView() {
      zoomRef.current = 1;
      panXRef.current = 0;
      panYRef.current = 0;
      applyTransform();
    },
    drawPreview({ bitmap, imageData, overview }) {
      const w = imageData.width;
      const h = imageData.height;
      imgWRef.current = w;
      imgHRef.current = h;
      const stack = stackRef.current;
      if (stack) {
        stack.style.width = `${w}px`;
        stack.style.height = `${h}px`;
      }
      drawBeforeTo(beforeRef.current, bitmap, w, h);
      blit(afterRef.current, imageData);
      drawBeforeTo(sideBeforeRef.current, bitmap, w, h);
      blit(sideAfterRef.current, imageData);
      if (badgeRef.current) badgeRef.current.hidden = !overview;
      applyTransform();
    },
    showLoupe(imageData) {
      const loupe = loupeRef.current;
      if (!loupe) return;
      if (!imageData) {
        loupe.hidden = true;
        return;
      }
      loupe.hidden = false;
      blit(loupeCanvasRef.current, imageData);
    },
    destCenter() {
      const viewport = viewportRef.current;
      if (!viewport) return { x: 0.5, y: 0.5 };
      const rect = viewport.getBoundingClientRect();
      const s = fitScale() * zoomRef.current;
      const cx = (rect.width / 2 - (rect.width / 2 + panXRef.current)) / s + imgWRef.current / 2;
      const cy = (rect.height / 2 - (rect.height / 2 + panYRef.current)) / s + imgHRef.current / 2;
      return {
        x: cx / imgWRef.current,
        y: cy / imgHRef.current,
      };
    },
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
  }, [holdOriginal, kernel]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const splitter = splitterRef.current;
    if (!viewport || !splitter) return;

    const onSplitterDown = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      draggingRef.current = "split";
      splitter.setPointerCapture(event.pointerId);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.target === splitter || viewModeRef.current !== "split") return;
      draggingRef.current = "pan";
      viewport.setPointerCapture(event.pointerId);
      lastPtr.current = { x: event.clientX, y: event.clientY };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (draggingRef.current === "split") {
        const rect = viewport.getBoundingClientRect();
        const vertical = window.matchMedia("(max-width: 960px)").matches;
        const t = vertical
          ? (event.clientY - rect.top) / rect.height
          : (event.clientX - rect.left) / rect.width;
        setSplit(t);
        return;
      }
      if (draggingRef.current === "pan") {
        const dx = event.clientX - lastPtr.current.x;
        const dy = event.clientY - lastPtr.current.y;
        lastPtr.current = { x: event.clientX, y: event.clientY };
        panXRef.current += dx;
        panYRef.current += dy;
        applyTransform();
      }
    };

    const onPointerUp = () => {
      draggingRef.current = null;
      if (viewModeRef.current !== "grid") onLoupe();
    };

    const onWheel = (event: WheelEvent) => {
      if (viewModeRef.current === "grid") return;
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      zoomRef.current = Math.min(24, Math.max(0.15, zoomRef.current * factor));
      applyTransform();
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

    const onResize = () => applyTransform();

    splitter.addEventListener("pointerdown", onSplitterDown);
    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", onPointerUp);
    viewport.addEventListener("wheel", onWheel, { passive: false });
    splitter.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);

    return () => {
      splitter.removeEventListener("pointerdown", onSplitterDown);
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", onPointerUp);
      viewport.removeEventListener("wheel", onWheel);
      splitter.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [onLoupe]);

  return (
    <>
      <div className="stage-empty" hidden={hasSource} id="stage-empty">
        <div className="empty-copy">
          <p className="empty-kicker">{t("empty.kicker")}</p>
          <h2>{t("empty.title")}</h2>
          <p>{t("empty.body")}</p>
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
      </div>

      <div className="stage-work" ref={workRef} hidden={!hasSource} data-mode={viewMode}>
        <div className="view-modes" role="group" aria-label={t("preview.modes")}>
          {(
            [
              ["split", "preview.split"],
              ["side", "preview.side"],
              ["grid", "preview.grid"],
            ] as const
          ).map(([mode, key]) => (
            <button
              key={mode}
              className="chip"
              type="button"
              data-mode={mode}
              aria-pressed={viewMode === mode}
              onClick={() => onViewMode(mode)}
            >
              {t(key)}
            </button>
          ))}
        </div>
        <div className="zoom-readout" ref={zoomReadoutRef}>
          100%
        </div>
        <span className="badge" ref={badgeRef} hidden>
          {t("preview.badge")}
        </span>

        <div className="viewport" id="viewport" ref={viewportRef}>
          <div className="world" ref={worldRef}>
            <div className="stack" ref={stackRef}>
              <canvas ref={beforeRef} aria-label={t("preview.source")} />
              <canvas ref={afterRef} className="plate-after" aria-label={t("preview.result")} />
              <div
                className="splitter"
                ref={splitterRef}
                role="slider"
                tabIndex={0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={50}
                aria-label={t("preview.splitter")}
              />
            </div>
          </div>
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
        <div className="loupe" ref={loupeRef} hidden>
          <canvas ref={loupeCanvasRef} width={256} height={256} />
          <span>{t("preview.loupe")}</span>
        </div>
      </div>
    </>
  );
});
