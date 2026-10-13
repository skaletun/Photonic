"use client";
import Image from "next/image";
import { useState } from "react";
import type { StudioDocument } from "@/hooks/studio/useDocuments";
import { useT } from "@/hooks/useT";
import { useAppState } from "./AppStateContext";
import { Icon } from "./Icon";
function Thumbnail({ item }: { item: StudioDocument }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <Icon name="image" />
  ) : (
    <Image unoptimized src={item.url} alt="" width={48} height={48} onError={() => setFailed(true)} />
  );
}
export function DocumentQueue({
  documents,
  onOpen,
  onSelect,
  onRemove,
  onMove,
  onRetry,
}: {
  documents: StudioDocument[];
  onOpen: () => void;
  onSelect: (index: number) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRetry: () => void;
}) {
  const { t } = useT();
  const { state } = useAppState();
  return (
    <section className="document-queue" aria-label={t("studio.queue")}>
      <div className="queue-heading">
        <span>
          {t("studio.queue")} <b>{documents.length.toString().padStart(2, "0")}</b>
        </span>
        <button type="button" className="icon-button" aria-label={t("studio.add")} onClick={onOpen}>
          <Icon name="plus" />
        </button>
        {documents.some((item) => item.status === "error") ? (
          <button className="btn-ghost" type="button" disabled={state.exporting || state.busy} onClick={onRetry}>
            {t("studio.retry")}
          </button>
        ) : null}
      </div>
      <ol className="document-list">
        {documents.map((item, index) => (
          <li
            key={item.id}
            className={index === state.queueIndex ? "document is-current" : "document"}
            data-status={item.status}
          >
            <button
              type="button"
              className="document-select"
              aria-current={index === state.queueIndex ? "true" : undefined}
              disabled={state.exporting}
              onClick={() => onSelect(index)}
            >
              <span className="document-thumbnail">
                <Thumbnail item={item} />
              </span>
              <span className="document-copy">
                <strong>{item.file.name}</strong>
                <span title={item.error}>
                  {t(`studio.${item.status}`)}
                  {item.status === "ready" ? <Icon name="check" width="12" height="12" /> : null}
                </span>
              </span>
            </button>
            <div className="document-actions">
              <button
                type="button"
                className="icon-button"
                aria-label={t("studio.moveLeft")}
                disabled={state.exporting || index === 0}
                onClick={() => onMove(index, -1)}
              >
                <Icon name="arrowLeft" width="14" height="14" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={t("studio.moveRight")}
                disabled={state.exporting || index === documents.length - 1}
                onClick={() => onMove(index, 1)}
              >
                <Icon name="arrowRight" width="14" height="14" />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={t("enlarger.remove")}
                disabled={state.exporting}
                onClick={() => onRemove(index)}
              >
                <Icon name="close" width="14" height="14" />
              </button>
            </div>
          </li>
        ))}
      </ol>
      {!documents.length ? <p className="queue-empty">{t("studio.noSource")}</p> : null}
    </section>
  );
}
