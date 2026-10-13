"use client";
import Image from "next/image";
import { forwardRef } from "react";
import { KERNEL_IDS, nextKernelId } from "@/lib/config";
import { withBase } from "@/lib/base-path";
import { SAMPLE_FILES } from "@/lib/samples";
import { useT } from "@/hooks/useT";
import { useCanvasPreview } from "./preview/useCanvasPreview";
import type { PreviewHandle, PreviewProps } from "./preview/types";
export type { PreviewHandle } from "./preview/types";
export const Preview = forwardRef<PreviewHandle, PreviewProps>(function Preview(props, ref) {
  const { hasSource, viewMode, versusA, versusB, onViewMode, onVersusKernel, onOpen, onSample } = props;
  const { t, kernelTitle } = useT();
  const {
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
  } = useCanvasPreview(props, ref);
  return (
    <>
      <div className="stage-empty" hidden={hasSource} id="stage-empty">
        <div className="empty-copy">
          <p className="empty-kicker">{t("empty.kicker")}</p>
          <h2>{t("studio.emptyTitle")}</h2>
          <p>{t("studio.emptyHint")}</p>
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
              sample.id === "photo"
                ? "empty.samplePhoto"
                : sample.id === "type"
                  ? "empty.sampleType"
                  : "empty.samplePixel";
            return (
              <button
                key={sample.id}
                className={`sample sample-${sample.id}`}
                type="button"
                onClick={() => onSample(sample.id)}
              >
                <Image
                  unoptimized
                  src={withBase(`/samples/${sample.file}`)}
                  alt=""
                  width={sample.id === "photo" ? 640 : sample.id === "type" ? 1280 : 32}
                  height={sample.id === "photo" ? 853 : sample.id === "type" ? 720 : 32}
                  loading="eager"
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
          <button className="chip" type="button" title={t("studio.actual")} onClick={actualPixels}>
            1:1
          </button>
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
