"use client";

import type { ExportFormat } from "@/lib/config";
import { MAX_PERCENT, MAX_SIDE, MIN_PERCENT } from "@/lib/config";
import { formatToMime } from "@/lib/io/encode";
import { clampInt } from "@/lib/limits";
import { CLIP_WARN } from "@/lib/meter";
import {
  DPI_PRESETS,
  convertPaper,
  fitInsidePaper,
  paperPresets,
  paperToPx,
  pxToIn,
  pxToMm,
  type PrintUnit,
} from "@/lib/print";
import { useAppState } from "./AppStateContext";
import { useT } from "@/hooks/useT";

type Props = {
  beforeChange: () => void;
  onDestChange: (width: number, height: number, paper?: { width: number; height: number } | null) => void;
  onOpen: () => void;
  onExport: () => void;
  onExportAll: () => void;
  onExportEach: () => void;
  onCopyRecipe: () => void;
  onQueueIndex: (index: number) => void;
  onQueueRemove: (index: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onInstall: () => void;
};

function formatPaper(value: number, unit: PrintUnit) {
  if (!Number.isFinite(value)) return "";
  return unit === "mm" ? String(Number(value.toFixed(1))) : String(Number(value.toFixed(2)));
}

export function Enlarger({
  beforeChange,
  onDestChange,
  onOpen,
  onExport,
  onExportAll,
  onExportEach,
  onCopyRecipe,
  onQueueIndex,
  onQueueRemove,
  onUndo,
  onRedo,
  onInstall,
}: Props) {
  const { state, dispatch } = useAppState();
  const { t: tr } = useT();
  const photonic = state.kernel === "photonic";
  const mime = formatToMime(state.exportFormat, state.sourceMime || "image/png");
  const qualityHidden = mime === "image/png";
  const aspect = state.sourceHeight ? state.sourceWidth / state.sourceHeight : 1;
  const percent = state.hasSource ? Math.round((state.destW / state.sourceWidth) * 100) : 100;
  const paperW =
    state.paperW ??
    (state.hasSource ? (state.printUnit === "mm" ? pxToMm(state.destW, state.dpi) : pxToIn(state.destW, state.dpi)) : 0);
  const paperH =
    state.paperH ??
    (state.hasSource ? (state.printUnit === "mm" ? pxToMm(state.destH, state.dpi) : pxToIn(state.destH, state.dpi)) : 0);
  const maxBin = state.meter ? Math.max(1, ...state.meter.bins) : 1;
  const clipPct = state.meter ? (state.meter.clipHigh + state.meter.clipLow) * 100 : 0;
  const iccKey =
    state.iccKind === "srgb" ? "enlarger.iccSrgb" : state.iccKind === "other" ? "enlarger.iccOther" : "enlarger.iccNone";

  function applyProfile(scale: number) {
    if (!state.hasSource) return;
    onDestChange(
      Math.max(1, Math.round(state.sourceWidth * scale)),
      Math.max(1, Math.round(state.sourceHeight * scale)),
      null,
    );
  }

  function applyPaper(width: number, height: number, unit = state.printUnit, dpi = state.dpi, lockAspect = state.lockAspect) {
    if (!state.hasSource) {
      dispatch({ type: "setPaper", width, height });
      return;
    }
    const px = paperToPx(width, height, unit, dpi);
    const dest = fitInsidePaper(state.sourceWidth, state.sourceHeight, px.width, px.height, lockAspect);
    onDestChange(dest.width, dest.height, { width, height });
  }

  return (
    <aside className="enlarger" aria-label={tr("enlarger.aria")}>
      <div
        className={state.progress !== null ? "app-progress is-on" : "app-progress"}
        hidden={state.progress === null}
        style={{ transform: `scaleX(${state.progress ?? 0})` }}
      />
      <p className="status-line" role="status" data-kind={state.statusKind || undefined}>
        {tr(state.status.key, state.status.params)}
      </p>

      {state.queueNames.length ? (
        <ul className="queue" aria-label={tr("enlarger.queue")}>
          {state.queueNames.map((name, index) => (
            <li className="queue-row" key={`${index}-${name}`}>
              <button
                className={index === state.queueIndex ? "queue-item is-current" : "queue-item"}
                type="button"
                aria-current={index === state.queueIndex ? "true" : undefined}
                disabled={state.busy}
                onClick={() => onQueueIndex(index)}
              >
                {name}
              </button>
              <button
                className="queue-remove"
                type="button"
                aria-label={tr("enlarger.remove")}
                disabled={state.busy}
                onClick={() => onQueueRemove(index)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="size-dock">
        <span className="adv-label">{tr("enlarger.size")}</span>
        <div className="field-row" id="size-panel">
        <div className="field">
          <label htmlFor="width-px">{tr("enlarger.width")}</label>
          <input
            id="width-px"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            disabled={!state.hasSource}
            value={state.hasSource ? state.destW : ""}
            onChange={(event) => {
              if (!state.hasSource) return;
              const w = clampInt(event.target.value, 1, MAX_SIDE);
              const h = state.lockAspect ? Math.max(1, Math.round(w / aspect)) : state.destH;
              onDestChange(w, h, null);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="height-px">{tr("enlarger.height")}</label>
          <input
            id="height-px"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            disabled={!state.hasSource}
            value={state.hasSource ? state.destH : ""}
            onChange={(event) => {
              if (!state.hasSource) return;
              const h = clampInt(event.target.value, 1, MAX_SIDE);
              const w = state.lockAspect ? Math.max(1, Math.round(h * aspect)) : state.destW;
              onDestChange(w, h, null);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="scale-pct">{tr("enlarger.scale")}</label>
          <input
            id="scale-pct"
            type="number"
            min={MIN_PERCENT}
            max={MAX_PERCENT}
            step={1}
            disabled={!state.hasSource}
            value={state.hasSource ? percent : ""}
            onChange={(event) => {
              if (!state.hasSource) return;
              const p = clampInt(event.target.value, MIN_PERCENT, MAX_PERCENT) / 100;
              onDestChange(
                Math.max(1, Math.round(state.sourceWidth * p)),
                Math.max(1, Math.round(state.sourceHeight * p)),
                null,
              );
            }}
          />
        </div>
        <label className="check">
          <input
            id="lock-aspect"
            type="checkbox"
            checked={state.lockAspect}
            disabled={!state.hasSource}
            onChange={(event) => {
              dispatch({ type: "setLockAspect", value: event.target.checked });
              if (!state.hasSource) return;
              if (state.paperW && state.paperH) {
                applyPaper(state.paperW, state.paperH, state.printUnit, state.dpi, event.target.checked);
              } else if (event.target.checked) {
                onDestChange(state.destW, Math.max(1, Math.round(state.destW / aspect)), null);
              }
            }}
          />
          <span>{tr("enlarger.lock")}</span>
        </label>
        <div className="profiles" role="group" aria-label={tr("enlarger.profiles")}>
          {([0.5, 2, 4] as const).map((scale) => {
            const pressed =
              state.hasSource &&
              Math.abs(state.destW / state.sourceWidth - scale) < 0.001 &&
              Math.abs(state.destH / state.sourceHeight - scale) < 0.001;
            return (
              <button
                key={scale}
                className="chip"
                type="button"
                data-scale={scale}
                disabled={!state.hasSource}
                aria-pressed={pressed}
                onClick={() => applyProfile(scale)}
              >
                {scale === 0.5 ? "½" : `${scale}×`}
              </button>
            );
          })}
        </div>
        </div>
      </div>

      <div className="print-dock">
        <span className="adv-label">{tr("enlarger.print")}</span>
        <p className="dock-hint">{tr("enlarger.printHint")}</p>
        <div className="field-row">
          <div className="field">
            <label htmlFor="paper-w">{tr("enlarger.paperW")}</label>
            <input
              id="paper-w"
              type="number"
              min={1}
              step={state.printUnit === "mm" ? 1 : 0.1}
              inputMode="decimal"
              disabled={!state.hasSource}
              value={state.hasSource ? formatPaper(paperW, state.printUnit) : ""}
              onChange={(event) => {
                const w = Number(event.target.value);
                if (!Number.isFinite(w) || w <= 0) return;
                applyPaper(w, paperH || w);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="paper-h">{tr("enlarger.paperH")}</label>
            <input
              id="paper-h"
              type="number"
              min={1}
              step={state.printUnit === "mm" ? 1 : 0.1}
              inputMode="decimal"
              disabled={!state.hasSource}
              value={state.hasSource ? formatPaper(paperH, state.printUnit) : ""}
              onChange={(event) => {
                const h = Number(event.target.value);
                if (!Number.isFinite(h) || h <= 0) return;
                applyPaper(paperW || h, h);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="print-unit">{tr("enlarger.unit")}</label>
            <select
              id="print-unit"
              value={state.printUnit}
              onChange={(event) => {
                const next = event.target.value === "mm" ? "mm" : "in";
                const from = state.printUnit;
                dispatch({ type: "setPrintUnit", value: next });
                if (state.paperW && state.paperH) {
                  const converted = convertPaper(state.paperW, state.paperH, from, next);
                  dispatch({ type: "setPaper", width: converted.width, height: converted.height });
                }
              }}
            >
              <option value="mm">{tr("enlarger.unitMm")}</option>
              <option value="in">{tr("enlarger.unitIn")}</option>
            </select>
          </div>
        </div>
        <div className="profiles" role="group" aria-label={tr("enlarger.dpi")}>
          {DPI_PRESETS.map((dpi) => (
            <button
              key={dpi}
              className="chip"
              type="button"
              aria-pressed={state.dpi === dpi}
              onClick={() => {
                dispatch({ type: "setDpi", value: dpi });
                if (state.paperW && state.paperH) applyPaper(state.paperW, state.paperH, state.printUnit, dpi);
              }}
            >
              {tr("enlarger.dpiChip", { dpi })}
            </button>
          ))}
        </div>
        <div className="profiles" role="group" aria-label={tr("enlarger.print")}>
          {paperPresets(state.printUnit).map((preset) => {
            const pressed =
              state.paperW !== null &&
              Math.abs((state.paperW ?? 0) - preset.w) < 0.05 &&
              Math.abs((state.paperH ?? 0) - preset.h) < 0.05;
            return (
              <button
                key={preset.label}
                className="chip"
                type="button"
                disabled={!state.hasSource}
                aria-pressed={pressed}
                onClick={() => applyPaper(preset.w, preset.h)}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {state.meter ? (
        <div className="meter" aria-label={tr("enlarger.meter")}>
          <div className="meter-hist">
            {state.meter.bins.map((count, index) => (
              <span key={index} style={{ height: `${(count / maxBin) * 100}%` }} />
            ))}
          </div>
          <div className="meter-scan" aria-label={tr("enlarger.scan")}>
            {state.meter.scan.map((y, index) => (
              <span key={index} style={{ height: `${(y / 255) * 100}%` }} />
            ))}
          </div>
          {clipPct > CLIP_WARN * 100 ? (
            <p className="meter-clip">{tr("enlarger.clip", { pct: clipPct.toFixed(1) })}</p>
          ) : null}
        </div>
      ) : null}

      <div className="advanced">
        <span className="adv-label">{tr("enlarger.post")}</span>
        <div className="advanced-grid">
          <label className="check">
            <input
              id="unsharp-on"
              type="checkbox"
              checked={state.unsharpEnabled}
              onChange={(event) => {
                beforeChange();
                dispatch({ type: "setUnsharpEnabled", value: event.target.checked });
              }}
            />
            <span>{tr("enlarger.unsharp")}</span>
          </label>
          <div className="field">
            <label htmlFor="color-space">
              <span>{photonic ? tr("enlarger.colorEmbedded") : tr("enlarger.color")}</span>
            </label>
            <select
              id="color-space"
              value={state.colorSpace}
              disabled={photonic}
              onChange={(event) => {
                beforeChange();
                dispatch({ type: "setColorSpace", value: event.target.value === "srgb" ? "srgb" : "linear" });
              }}
            >
              <option value="linear">{tr("enlarger.linear")}</option>
              <option value="srgb">{tr("enlarger.srgb")}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="unsharp-amount">{tr("enlarger.amount")}</label>
            <input
              id="unsharp-amount"
              className="range"
              type="range"
              min={0}
              max={200}
              value={state.unsharpAmount}
              onChange={(event) => dispatch({ type: "setUnsharpAmount", value: Number(event.target.value) })}
            />
          </div>
          <div className="field">
            <label htmlFor="unsharp-radius">{tr("enlarger.radius")}</label>
            <input
              id="unsharp-radius"
              className="range"
              type="range"
              min={0.4}
              max={2.5}
              step={0.1}
              value={state.unsharpRadius}
              onChange={(event) => dispatch({ type: "setUnsharpRadius", value: Number(event.target.value) })}
            />
          </div>
        </div>
      </div>

      <div className="export-dock">
        <span className="adv-label">{tr("enlarger.save")}</span>
        <div className="field-row">
          <div className="field">
            <label htmlFor="export-format">{tr("enlarger.format")}</label>
            <select
              id="export-format"
              value={state.exportFormat}
              onChange={(event) =>
                dispatch({
                  type: "setExportFormat",
                  value: event.target.value as ExportFormat,
                })
              }
            >
              <option value="original">{tr("enlarger.formatOriginal")}</option>
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
            </select>
          </div>
          <div className="field" hidden={qualityHidden}>
            <label htmlFor="export-quality">{tr("enlarger.quality", { q: Math.round(state.quality * 100) })}</label>
            <input
              className="quality"
              id="export-quality"
              type="range"
              min={0.4}
              max={1}
              step={0.01}
              value={state.quality}
              onChange={(event) => dispatch({ type: "setQuality", value: Number(event.target.value) })}
            />
          </div>
        </div>
        <div className={state.queueNames.length > 1 ? "export-actions" : "export-actions is-single"}>
          <button className="btn-export" type="button" disabled={state.busy || !state.hasSource} onClick={onExport}>
            {tr("enlarger.export")}
          </button>
          {state.queueNames.length > 1 ? (
            <>
              <button
                className="btn-export-all"
                type="button"
                disabled={state.busy || !state.hasSource}
                onClick={onExportAll}
              >
                {tr("enlarger.exportAll")}
              </button>
              <button
                className="btn-ghost"
                type="button"
                disabled={state.busy || !state.hasSource}
                onClick={onExportEach}
              >
                {tr("enlarger.saveEach")}
              </button>
            </>
          ) : null}
        </div>
        <div className="history-row">
          <button className="btn-ghost" type="button" disabled={state.undoDepth === 0} onClick={onUndo}>
            {tr("enlarger.undo")}
          </button>
          <button className="btn-ghost" type="button" disabled={state.redoDepth === 0} onClick={onRedo}>
            {tr("enlarger.redo")}
          </button>
          <button className="btn-ghost" type="button" title={tr("enlarger.recipeHint")} onClick={onCopyRecipe}>
            {tr("enlarger.recipe")}
          </button>
        </div>
        <p className="dock-hint">{tr("enlarger.recipeHint")}</p>
        <button className="btn-ghost" type="button" onClick={onOpen}>
          {tr("enlarger.open")}
        </button>
        {state.installReady ? (
          <button className="btn-ghost" type="button" onClick={onInstall}>
            {tr("enlarger.install")}
          </button>
        ) : null}
        {state.iosInstall ? <p className="passport-hint">{tr("enlarger.iosInstall")}</p> : null}
        {state.hasSource ? (
          <>
            <p className="passport-hint">{tr(state.hasExif ? "enlarger.passportExif" : "enlarger.passportNone")}</p>
            <p className="passport-hint">{tr(iccKey)}</p>
          </>
        ) : null}
      </div>
    </aside>
  );
}
