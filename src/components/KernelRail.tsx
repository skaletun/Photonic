"use client";

import { useEffect, useRef } from "react";
import { KERNEL_IDS } from "@/lib/config";
import { getKernel, kernelSupport, kernelWeight } from "@/lib/resample/kernels";
import { useAppState } from "./AppStateContext";
import { useT } from "@/hooks/useT";

const SAMPLES = 72;

function sampleYs(id: string, a: number) {
  const support = kernelSupport(id, a);
  const ys = new Float32Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i += 1) {
    const x = -support + (2 * support * i) / (SAMPLES - 1);
    ys[i] = kernelWeight(id, x, a);
  }
  return ys;
}

function renderPlot(svg: SVGSVGElement, ys: Float32Array) {
  const w = 240;
  const h = 96;
  const pad = 10;
  let peak = 1;
  for (let i = 0; i < ys.length; i += 1) peak = Math.max(peak, Math.abs(ys[i]));
  const pts: string[] = [];
  for (let i = 0; i < ys.length; i += 1) {
    const px = pad + (i / (ys.length - 1)) * (w - pad * 2);
    const py = h / 2 - (ys[i] / peak) * (h / 2 - pad);
    pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }
  const area = `${pad},${h / 2} ${pts.join(" ")} ${w - pad},${h / 2}`;
  svg.innerHTML = `
    <line class="axis" x1="${pad}" y1="${h / 2}" x2="${w - pad}" y2="${h / 2}"></line>
    <polygon class="lobe" points="${area}"></polygon>
    <polyline points="${pts.join(" ")}"></polyline>
  `;
}

type Props = {
  onKernel: (id: (typeof KERNEL_IDS)[number]) => void;
};

export function KernelRail({ onKernel }: Props) {
  const { state, dispatch } = useAppState();
  const { t, kernelTitle, kernelHint, kernelUse } = useT();
  const plotRef = useRef<SVGSVGElement>(null);
  const currentYs = useRef<Float32Array | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const svg = plotRef.current;
    if (!svg) return;
    const target = sampleYs(state.kernel, state.lanczosA);
    if (!currentYs.current) {
      currentYs.current = Float32Array.from(target);
      renderPlot(svg, currentYs.current);
      return;
    }
    cancelAnimationFrame(rafRef.current);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      currentYs.current = target;
      renderPlot(svg, currentYs.current);
      return;
    }
    const from = Float32Array.from(currentYs.current);
    const start = performance.now();
    const dur = 480;
    const step = (now: number) => {
      const tNow = Math.min(1, (now - start) / dur);
      const e = 1 - (1 - tNow) ** 3;
      if (!currentYs.current) currentYs.current = new Float32Array(SAMPLES);
      for (let i = 0; i < SAMPLES; i += 1) {
        currentYs.current[i] = from[i] + (target[i] - from[i]) * e;
      }
      renderPlot(svg, currentYs.current);
      if (tNow < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [state.kernel, state.lanczosA]);

  const meta = getKernel(state.kernel);

  return (
    <aside className="rail" aria-label={t("rail.aria")}>
      <p className="rail-kicker">{t("rail.kicker")}</p>
      <p className="rail-lead">{t("rail.lead")}</p>
      <svg className="kernel-plot" ref={plotRef} viewBox="0 0 240 96" role="img" aria-label={t("rail.plot")} />
      <ul className="kernel-list">
        {KERNEL_IDS.map((id, index) => (
          <li key={id}>
            <button
              type="button"
              className="kernel-item"
              data-kernel={id}
              aria-pressed={state.kernel === id}
              style={{ animationDelay: `${0.1 + index * 0.07}s` }}
              onClick={() => onKernel(id)}
            >
              <span className="idx" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="title">{kernelTitle(id)}</span>
              <span className="use">{kernelUse(id)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="window-a" hidden={!meta.variableSupport}>
        <label htmlFor="lanczos-a">{t("rail.windowA", { a: state.lanczosA })}</label>
        <input
          className="range"
          id="lanczos-a"
          type="range"
          min={2}
          max={4}
          step={0.5}
          value={state.lanczosA}
          onChange={(event) => dispatch({ type: "setLanczosA", value: Number(event.target.value) })}
        />
      </div>
      <p className="hint">{kernelHint(state.kernel)}</p>
    </aside>
  );
}
