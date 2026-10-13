"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { ExportFormat } from "@/lib/config";
import { encodeImageData, formatToMime } from "@/lib/io/encode";
import { cropAround } from "@/lib/meter";
import { statusFromError } from "@/lib/i18n";
import { useT } from "@/hooks/useT";
import type { Runtime } from "@/hooks/studio/runtime";
import { useAppState } from "../AppStateContext";
import { Icon } from "../Icon";
export function readableBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
export function ExportControls({ runtime }: { runtime: Runtime }) {
  const { state, dispatch } = useAppState();
  const { t } = useT();
  const mime = formatToMime(state.exportFormat, state.sourceMime || "image/png");
  const dialog = useRef<HTMLDialogElement>(null);
  const [images, setImages] = useState<{ before: string; after: string; bytes: number } | null>(null);
  const [encoding, setEncoding] = useState(false);
  useEffect(
    () => () => {
      if (images) {
        URL.revokeObjectURL(images.before);
        URL.revokeObjectURL(images.after);
      }
    },
    [images],
  );
  async function preview() {
    const image = runtime.previewImage.current;
    if (!image) return;
    setEncoding(true);
    try {
      const crop = cropAround(image, 0.5, 0.5, Math.min(512, image.width, image.height));
      const before = await encodeImageData(crop, "image/png", 1);
      const after = await encodeImageData(crop, mime, state.quality, state.jpegBackground);
      setImages({ before: URL.createObjectURL(before), after: URL.createObjectURL(after), bytes: after.size });
      dialog.current?.showModal();
    } catch (error) {
      runtime.status(statusFromError(error), "error");
    } finally {
      setEncoding(false);
    }
  }
  return (
    <section className="format-panel">
      <div className="field">
        <label htmlFor="export-format">{t("enlarger.format")}</label>
        <select
          id="export-format"
          value={state.exportFormat}
          onChange={(event) => dispatch({ type: "setExportFormat", value: event.target.value as ExportFormat })}
        >
          <option value="original">{t("enlarger.formatOriginal")}</option>
          <option value="png">PNG</option>
          <option value="jpeg">JPEG</option>
          <option value="webp">WebP</option>
        </select>
      </div>
      <div className="field" hidden={mime === "image/png"}>
        <label htmlFor="export-quality">{t("enlarger.quality", { q: Math.round(state.quality * 100) })}</label>
        <input
          id="export-quality"
          type="range"
          min={0.4}
          max={1}
          step={0.01}
          value={state.quality}
          onChange={(event) => dispatch({ type: "setQuality", value: Number(event.target.value) })}
        />
      </div>
      <div className="field color-field" hidden={mime !== "image/jpeg"}>
        <label htmlFor="jpeg-background">{t("studio.background")}</label>
        <input
          id="jpeg-background"
          type="color"
          value={state.jpegBackground}
          onChange={(event) => dispatch({ type: "setJpegBackground", value: event.target.value })}
        />
        <span>{state.jpegBackground.toUpperCase()}</span>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={state.preserveMetadata}
          onChange={(event) => dispatch({ type: "setPreserveMetadata", value: event.target.checked })}
        />
        <span>{t("studio.metadata")}</span>
      </label>
      <p className="dock-hint">{t("studio.metadataHint")}</p>
      <button
        type="button"
        className="btn-ghost preview-encode"
        disabled={!state.hasSource || state.busy || encoding}
        onClick={() => void preview()}
      >
        {t("studio.encodingPreview")}
      </button>
      <dialog className="compression-dialog" ref={dialog}>
        <div className="dialog-heading">
          <h2>{t("studio.encodingPreview")}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={t("studio.close")}
            onClick={() => dialog.current?.close()}
          >
            <Icon name="close" />
          </button>
        </div>
        <p className="dock-hint">{t("studio.previewHint")}</p>
        {images ? (
          <div className="compression-pair">
            <figure>
              <Image unoptimized src={images.before} alt={t("studio.beforeEncoding")} width={512} height={512} />
              <figcaption>{t("studio.beforeEncoding")}</figcaption>
            </figure>
            <figure>
              <Image unoptimized src={images.after} alt={t("studio.afterEncoding")} width={512} height={512} />
              <figcaption>
                {t("studio.afterEncoding")} · {readableBytes(images.bytes)}
              </figcaption>
            </figure>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}
