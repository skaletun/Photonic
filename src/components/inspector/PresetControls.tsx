"use client";
import { useState } from "react";
import { useT } from "@/hooks/useT";
import type { StudioPreset } from "@/lib/presets";
import { Icon } from "../Icon";
export function PresetControls({ presets, onSave, onApply, onRemove, disabled }: {
 presets: StudioPreset[]; onSave: (name: string) => void; onApply: (preset: StudioPreset) => void; onRemove: (id: string) => void; disabled: boolean;
}) {
 const {t}=useT(); const [name,setName]=useState("");
 return <details className="inspector-details"><summary>{t("studio.presets")}<span>{presets.length}</span></summary><div className="details-content">
   <form onSubmit={event=>{event.preventDefault();if(name.trim()){onSave(name);setName("");}}}>
     <label className="sr-only" htmlFor="preset-name">{t("studio.presetName")}</label><input id="preset-name" type="text" placeholder={t("studio.presetName")} value={name} maxLength={60} disabled={disabled} onChange={event=>setName(event.target.value)} />
     <button className="btn-ghost" type="submit" disabled={disabled||!name.trim()}>{t("studio.savePreset")}</button>
   </form>
   <ul className="preset-list">{presets.map(preset=><li key={preset.id}><button type="button" disabled={disabled} onClick={()=>onApply(preset)}>{preset.name}<small>{preset.settings.destW} × {preset.settings.destH}</small></button><button type="button" className="icon-button" aria-label={t("studio.deletePreset")} onClick={()=>onRemove(preset.id)}><Icon name="close" /></button></li>)}</ul>
 </div></details>;
}
