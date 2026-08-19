"use client";

import type { ExportFormat } from "@/lib/config";
import { MAX_PERCENT, MAX_SIDE, MIN_PERCENT } from "@/lib/config";
import { formatToMime } from "@/lib/io/encode";
import { clampInt } from "@/lib/limits";
import { useAppState } from "./AppStateContext";
import { useT } from "@/hooks/useT";

type Props = {
  beforeChange: () => void;
  onDestChange: (width: number, height: number) => void;
  onOpen: () => void;
  onExport: () => void;
};

export function Enlarger({ beforeChange, onDestChange, onOpen, onExport }: Props) {
  const { state, dispatch } = useAppState();
  const { t: tr } = useT();
  const photonic = state.kernel === "photonic";
  const mime = formatToMime(state.exportFormat, state.sourceMime || "image/png");
  const qualityHidden = mime === "image/png";
  const aspect = state.sourceHeight ? state.sourceWidth / state.sourceHeight : 1;
  const percent = state.hasSource ? Math.round((state.destW / state.sourceWidth) * 100) : 100;

  function applyProfile(scale: number) {
    if (!state.hasSource) return;
    onDestChange(
      Math.max(1, Math.round(state.sourceWidth * scale)),
      Math.max(1, Math.round(state.sourceHeight * scale)),
    );
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
              onDestChange(w, h);
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
              onDestChange(w, h);
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
              if (event.target.checked && state.hasSource) {
                onDestChange(state.destW, Math.max(1, Math.round(state.destW / aspect)));
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
            <span>Unsharp Mask</span>
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
        <button className="btn-export" type="button" disabled={state.busy || !state.hasSource} onClick={onExport}>
          {tr("enlarger.export")}
        </button>
        <button className="btn-ghost" type="button" onClick={onOpen}>
          {tr("enlarger.open")}
        </button>
      </div>
    </aside>
  );
}
