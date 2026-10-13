"use client";
import { useAppState } from "../AppStateContext";
import { useT } from "@/hooks/useT";
import { MAX_PERCENT, MAX_SIDE, MIN_PERCENT } from "@/lib/config";
import { clampInt } from "@/lib/limits";
import { fitInsidePaper, paperToPx } from "@/lib/print";
import type { DestinationChange } from "./types";
export function SizeControls({
  onDestChange,
  beforeChange,
}: {
  onDestChange: DestinationChange;
  beforeChange: () => void;
}) {
  const { state, dispatch } = useAppState();
  const { t: tr } = useT();
  const aspect = state.sourceHeight ? state.sourceWidth / state.sourceHeight : 1;
  const percent = state.hasSource ? Math.round((state.destW / state.sourceWidth) * 100) : 100;
  function applyProfile(scale: number) {
    if (state.hasSource)
      onDestChange(
        Math.max(1, Math.round(state.sourceWidth * scale)),
        Math.max(1, Math.round(state.sourceHeight * scale)),
        null,
      );
  }
  function applyPaper(
    width: number,
    height: number,
    unit = state.printUnit,
    dpi = state.dpi,
    lockAspect = state.lockAspect,
  ) {
    const px = paperToPx(width, height, unit, dpi);
    const dest = fitInsidePaper(state.sourceWidth, state.sourceHeight, px.width, px.height, lockAspect);
    onDestChange(dest.width, dest.height, { width, height });
  }
  return (
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
              beforeChange();
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
          {([0.5, 1, 2, 4] as const).map((scale) => {
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
  );
}
