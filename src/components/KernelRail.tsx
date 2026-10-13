"use client";
import { KERNEL_IDS, type KernelId } from "@/lib/config";
import { getKernel, kernelSupport, kernelWeight } from "@/lib/resample/kernels";
import { useAppState } from "./AppStateContext";
import { useT } from "@/hooks/useT";
export function KernelRail({ onKernel, beforeChange, lab }: { onKernel: (id: KernelId) => void; beforeChange: () => void; lab: boolean }) {
  const { state, dispatch } = useAppState(); const { t, kernelTitle, kernelHint } = useT();
  const support = kernelSupport(state.kernel, state.lanczosA);
  const points = Array.from({ length: 73 }, (_, i) => `${10 + i * 220 / 72},${48 - kernelWeight(state.kernel, -support + support * 2 * i / 72, state.lanczosA) * 32}`).join(" ");
  const meta = getKernel(state.kernel);
  return <section className="method-panel" aria-label={t("rail.aria")}>
    <div className="field"><label htmlFor="kernel-select">{t("studio.method")}</label>
      <select id="kernel-select" value={state.kernel} onChange={event => onKernel(event.target.value as KernelId)}>{KERNEL_IDS.map(id => <option key={id} value={id}>{kernelTitle(id)}</option>)}</select>
    </div>
    <p className="dock-hint">{kernelHint(state.kernel)}</p>
    <div className="field" hidden={!meta.variableSupport}><label htmlFor="lanczos-a">{t("rail.windowA", { a: state.lanczosA })}</label>
      <input id="lanczos-a" type="range" min={2} max={4} step={0.5} value={state.lanczosA} onPointerDown={beforeChange} onKeyDown={beforeChange} onChange={event => dispatch({ type: "setLanczosA", value: Number(event.target.value) })} />
    </div>
    {lab ? <details className="inspector-details" open><summary>{t("studio.analysis")}</summary><div className="details-content">
      <svg className="kernel-plot" viewBox="0 0 240 96" role="img" aria-label={t("rail.plot")}><path d="M10 48h220" className="axis" /><polygon points={`10,48 ${points} 230,48`} className="lobe" /><polyline points={points} /></svg>
      {state.meter ? <div className="meter" aria-label={t("enlarger.meter")}><div className="meter-hist">{state.meter.bins.map((count, i) => <span key={i} style={{ height: `${count / Math.max(1, ...state.meter!.bins) * 100}%` }} />)}</div></div> : null}
      <p className="dock-hint">{t("studio.labHint")}</p>
    </div></details> : null}
  </section>;
}
