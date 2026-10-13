"use client";
import { useRef, useState } from "react";
import { useStudio } from "@/hooks/studio/useStudio";
import { acceptAttr } from "@/lib/io/decode";
import { t } from "@/lib/i18n";
import { AppStateContext } from "./AppStateContext";
import { Enlarger } from "./Enlarger";
import { Mast } from "./Mast";
import { Preview } from "./Preview";
import { SiteNotes } from "./SiteNotes";
import { DocumentQueue } from "./DocumentQueue";
import { Icon } from "./Icon";
import { promptInstall } from "@/lib/pwa";
export function PhotonicApp() {
 const {state,dispatch,runtime,history,docs,pipeline,exports:exportsPipeline,input:inputRef,preview:previewRef,openFile,onKernel,onDestChange,copyRecipe,presets,savePreset,applyPreset,removePreset}=useStudio();
 const [lab,setLab]=useState(false);const help=useRef<HTMLDialogElement>(null);
 const tr=(key:Parameters<typeof t>[1])=>t(state.locale,key);
 return <AppStateContext.Provider value={{state,dispatch}}>
  <div className={state.hasSource?"app has-source":"app"} data-lab={lab}>
   <Mast onOpen={openFile} onHelp={()=>help.current?.showModal()} lab={lab} onLab={value=>{setLab(value);if(state.hasSource)dispatch({type:"setViewMode",value:value?"versus":"split"});}} />
   <main className="bench">
    <section className="stage" aria-label={tr("stage.aria")}>
     <div className="document-toolbar"><div className="document-title"><Icon name="image" /><strong>{state.hasSource?state.sourceName:tr("studio.title")}</strong>{state.hasSource?<span>{state.sourceWidth} × {state.sourceHeight}</span>:null}</div>
      <div className="history-row"><button className="icon-button" type="button" disabled={!state.undoDepth||state.exporting} aria-label={tr("enlarger.undo")} onClick={history.undo}><Icon name="undo" /></button><button className="icon-button" type="button" disabled={!state.redoDepth||state.exporting} aria-label={tr("enlarger.redo")} onClick={history.redo}><Icon name="redo" /></button><button className="icon-button" type="button" disabled={!state.hasSource} aria-label={tr("enlarger.recipe")} onClick={()=>void copyRecipe()}><Icon name="link" /></button></div>
     </div>
     <div className={state.dragOver?"preview-frame is-drag":"preview-frame"}>
      <Preview ref={previewRef} hasSource={state.hasSource} viewMode={state.viewMode} kernel={state.kernel} versusA={state.versusA} versusB={state.versusB} holdOriginal={state.holdOriginal}
       onViewMode={value=>dispatch({type:"setViewMode",value})} onVersusKernel={(side,kernel)=>dispatch({type:"setVersus",side,kernel})} onLoupePoint={pipeline.loupe}
       onOpen={openFile} onSample={id=>void docs.sample(id)} onHoldOriginal={value=>dispatch({type:"setHoldOriginal",value})} />
     </div>
    </section>
    <Enlarger runtime={runtime} lab={lab} beforeChange={history.push} onDestChange={onDestChange} onKernel={onKernel}
     onExport={()=>void exportsPipeline.run("current")} onExportAll={()=>void exportsPipeline.run("zip")} onExportEach={()=>void exportsPipeline.run("each")} onCancel={exportsPipeline.cancel}
     presets={presets} onPresetSave={savePreset} onPresetApply={applyPreset} onPresetRemove={removePreset} exportDetails={exportsPipeline.details} />
   </main>
   <DocumentQueue documents={docs.documents} onOpen={openFile} onSelect={index=>void docs.open(index)} onRemove={index=>void docs.remove(index)} onMove={docs.move} onRetry={()=>void exportsPipeline.run("retry")} />
   <footer className="app-status"><p role="status" data-kind={state.statusKind}>{t(state.locale,state.status.key,state.status.params)}</p>{state.progress!==null?<progress value={state.progress} max={1} aria-label={tr("studio.processing")} />:null}<span>sRGB · {state.hasSource?(state.destW*state.destH/1e6).toFixed(2)+" MP":"Photonic 1.0"}</span></footer>
  </div>
  <dialog className="help-dialog" ref={help}><div className="dialog-heading"><h2>{tr("studio.help")}</h2><button className="icon-button" type="button" aria-label={tr("studio.close")} onClick={()=>help.current?.close()}><Icon name="close" /></button></div>{state.installReady?<button className="btn-primary" type="button" onClick={()=>void promptInstall()}>{tr("enlarger.install")}</button>:null}{state.iosInstall?<p>{tr("enlarger.iosInstall")}</p>:null}<SiteNotes /></dialog>
  <input ref={inputRef} className="sr-only" aria-label={tr("studio.open")} type="file" accept={acceptAttr()} multiple onChange={event=>{const files=Array.from(event.target.files??[]);event.target.value="";if(files.length)void docs.add(files);}} />
 </AppStateContext.Provider>;
}
