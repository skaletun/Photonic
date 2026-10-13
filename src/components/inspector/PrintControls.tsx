"use client";
import { useAppState } from "../AppStateContext";
import { useT } from "@/hooks/useT";
import { DPI_PRESETS, convertPaper, fitInsidePaper, paperPresets, paperToPx, pxToIn, pxToMm, type PrintUnit } from "@/lib/print";
import type { DestinationChange } from "./types";
function formatPaper(value: number, unit: PrintUnit) {
  if (!Number.isFinite(value)) return "";
  return unit === "mm" ? String(Number(value.toFixed(1))) : String(Number(value.toFixed(2)));
}

export function PrintControls({ onDestChange, beforeChange }: { onDestChange: DestinationChange; beforeChange: () => void }) {
 const {state,dispatch}=useAppState(); const {t:tr}=useT();
 const paperW = state.paperW ?? (state.hasSource ? (state.printUnit === "mm" ? pxToMm(state.destW,state.dpi) : pxToIn(state.destW,state.dpi)) : 0);
 const paperH = state.paperH ?? (state.hasSource ? (state.printUnit === "mm" ? pxToMm(state.destH,state.dpi) : pxToIn(state.destH,state.dpi)) : 0);
 function applyPaper(width:number,height:number,unit=state.printUnit,dpi=state.dpi,lockAspect=state.lockAspect) {
 beforeChange(); const px=paperToPx(width,height,unit,dpi);const dest=fitInsidePaper(state.sourceWidth,state.sourceHeight,px.width,px.height,lockAspect); onDestChange(dest.width,dest.height,{width,height}); }
 return (
<details className="inspector-details print-dock">
        <summary>{tr("studio.print")}</summary><div className="details-content">
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
      </div></details>
 );
}
