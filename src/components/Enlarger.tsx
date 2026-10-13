"use client";
import { useState } from "react";
import type { KernelId } from "@/lib/config";
import type { StudioPreset } from "@/lib/presets";
import type { Runtime } from "@/hooks/studio/runtime";
import { useAppState } from "./AppStateContext";
import { useT } from "@/hooks/useT";
import { KernelRail } from "./KernelRail";
import { Icon } from "./Icon";
import { SizeControls } from "./inspector/SizeControls";
import { PrintControls } from "./inspector/PrintControls";
import { SharpnessControls } from "./inspector/SharpnessControls";
import { PresetControls } from "./inspector/PresetControls";
import { ExportControls, readableBytes } from "./inspector/ExportControls";
import type { DestinationChange } from "./inspector/types";
type Props = {
 runtime: Runtime; lab: boolean; beforeChange: () => void; onDestChange: DestinationChange; onKernel: (id: KernelId) => void;
 onExport: () => void; onExportAll: () => void; onExportEach: () => void; onCancel: () => void;
 presets: StudioPreset[]; onPresetSave: (name: string) => void; onPresetApply: (preset: StudioPreset) => void; onPresetRemove: (id: string) => void;
 exportDetails: { name: string; bytes: number; seconds: number } | null;
};
export function Enlarger(props: Props) {
 const {state}=useAppState();const {t}=useT();const [tab,setTab]=useState<"size"|"method"|"export">("size");
 return <aside className="enlarger" aria-label={t("enlarger.aria")} data-tab={tab}>
  <div className="inspector-heading"><Icon name="sliders" /><h2>{t("studio.settings")}</h2><span>{props.lab?"LAB":"STUDIO"}</span></div>
  <div className="mobile-tabs" role="tablist" aria-label={t("studio.settings")}>{(["size","method","export"] as const).map(item=><button type="button" key={item} role="tab" aria-selected={tab===item} aria-controls={`panel-${item}`} id={`tab-${item}`} onClick={()=>setTab(item)}>{t(`studio.${item}`)}</button>)}</div>
  <fieldset className="inspector-body" disabled={state.exporting}>
   <section className="inspector-section section-size" id="panel-size" aria-labelledby="tab-size"><SizeControls beforeChange={props.beforeChange} onDestChange={props.onDestChange} />
    <PresetControls presets={props.presets} onSave={props.onPresetSave} onApply={props.onPresetApply} onRemove={props.onPresetRemove} disabled={!state.hasSource||state.exporting} />
    <PrintControls beforeChange={props.beforeChange} onDestChange={props.onDestChange} />
   </section>
   <section className="inspector-section section-method" id="panel-method" aria-labelledby="tab-method"><KernelRail onKernel={props.onKernel} beforeChange={props.beforeChange} lab={props.lab} /><SharpnessControls beforeChange={props.beforeChange} /></section>
   <section className="inspector-section section-export" id="panel-export" aria-labelledby="tab-export"><span className="adv-label">{t("studio.export")}</span><ExportControls runtime={props.runtime} /></section>
  </fieldset>
  <div className="export-footer">
   <div className="result-summary"><span>{t("studio.result")}</span><strong>{state.hasSource?`${state.destW.toLocaleString(state.locale)} × ${state.destH.toLocaleString(state.locale)}`:"—"}<small> px</small></strong></div>
   {state.exporting?<button className="btn-primary" type="button" onClick={props.onCancel}><Icon name="close" />{t("studio.cancel")}</button>:<button className="btn-primary btn-export" type="button" disabled={state.busy||!state.hasSource} onClick={props.onExport}><Icon name="download" />{t("enlarger.export")}</button>}
   {state.queueNames.length>1&&!state.exporting?<div className="batch-actions"><button className="btn-ghost" type="button" disabled={state.busy||!state.hasSource} onClick={props.onExportAll}>{t("enlarger.exportAll")}</button><button className="btn-ghost" type="button" disabled={state.busy||!state.hasSource} onClick={props.onExportEach}>{t("enlarger.saveEach")}</button></div>:null}
   {props.exportDetails?<p className="export-receipt" title={props.exportDetails.name}>{t("studio.exportDetails",{size:readableBytes(props.exportDetails.bytes),seconds:props.exportDetails.seconds.toFixed(1)})}</p>:null}
  </div>
 </aside>;
}
