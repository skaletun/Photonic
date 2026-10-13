"use client";
import { useAppState } from "../AppStateContext";
import { useT } from "@/hooks/useT";
export function SharpnessControls({ beforeChange }: { beforeChange: () => void }) {
  const { state, dispatch } = useAppState();
  const { t: tr } = useT();
  const photonic = state.kernel === "photonic";
  return (
    <details className="inspector-details advanced">
      <summary>{tr("studio.advanced")}</summary>
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
            onPointerDown={beforeChange}
            onKeyDown={(event) => {
              if (event.key.startsWith("Arrow") || ["Home", "End", "PageUp", "PageDown"].includes(event.key))
                beforeChange();
            }}
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
            onPointerDown={beforeChange}
            onKeyDown={(event) => {
              if (event.key.startsWith("Arrow") || ["Home", "End", "PageUp", "PageDown"].includes(event.key))
                beforeChange();
            }}
            onChange={(event) => dispatch({ type: "setUnsharpRadius", value: Number(event.target.value) })}
          />
        </div>
      </div>
    </details>
  );
}
