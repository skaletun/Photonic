"use client";
import { useEffect } from "react";
import { applyAppUpdate, themeColorFor } from "@/lib/pwa";
import { useAppState } from "./AppStateContext";
import { useT } from "@/hooks/useT";
import { Icon } from "./Icon";
export function Mast({
  onOpen,
  onHelp,
  lab,
  onLab,
}: {
  onOpen: () => void;
  onHelp: () => void;
  lab: boolean;
  onLab: (value: boolean) => void;
}) {
  const { state, dispatch } = useAppState();
  const { t } = useT();
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColorFor(state.theme));
  }, [state.theme]);
  useEffect(() => {
    document.documentElement.lang = state.locale;
    document.title = t("meta.title");
  }, [state.locale, t]);
  return (
    <header className="mast">
      <a className="wordmark" href="./">
        Photonic<span>STUDIO</span>
      </a>
      <div className="workspace-switch" role="group" aria-label={t("studio.title")}>
        <button type="button" aria-pressed={!lab} onClick={() => onLab(false)}>
          Studio
        </button>
        <button type="button" aria-pressed={lab} onClick={() => onLab(true)}>
          Lab
        </button>
      </div>
      <span className="privacy-label">
        <Icon name="shield" />
        {t(state.offline ? "studio.offline" : "studio.private")}
      </span>
      <div className="mast-actions">
        {state.updateReady ? (
          <button
            className="btn-ghost update-btn"
            type="button"
            disabled={state.exporting}
            onClick={() => void applyAppUpdate()}
          >
            {t("studio.update")}
          </button>
        ) : null}
        <button className="btn-primary open-btn" type="button" onClick={onOpen}>
          <Icon name="plus" />
          <span>{t("studio.open")}</span>
        </button>
        <div className="lang-switch" role="group" aria-label={t("mast.langGroup")}>
          {(["en", "ru"] as const).map((locale) => (
            <button
              type="button"
              key={locale}
              aria-pressed={state.locale === locale}
              onClick={() => dispatch({ type: "setLocale", locale })}
            >
              {locale.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label={t(state.theme === "dark" ? "mast.themeToLight" : "mast.themeToDark")}
          onClick={() => dispatch({ type: "setTheme", theme: state.theme === "dark" ? "light" : "dark" })}
        >
          <Icon name={state.theme === "dark" ? "sun" : "moon"} />
        </button>
        <button className="icon-button help-btn" type="button" aria-label={t("studio.help")} onClick={onHelp}>
          <Icon name="help" />
        </button>
      </div>
    </header>
  );
}
