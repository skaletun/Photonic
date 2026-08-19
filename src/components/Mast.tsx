"use client";

import { useEffect } from "react";
import { themeColorFor } from "@/lib/pwa";
import { useAppState } from "./AppStateContext";
import { useT } from "@/hooks/useT";

export function Mast() {
  const { state, dispatch } = useAppState();
  const { t } = useT();

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", themeColorFor(state.theme));
  }, [state.theme]);

  useEffect(() => {
    document.documentElement.lang = state.locale;
    document.title = t("meta.title");
  }, [state.locale, t]);

  return (
    <header className="mast">
      <a className="wordmark" href="./">
        Photonic
      </a>
      <div className="mast-mid">
        <p className="lede">
          {t("mast.ledeStart")}
          <em>{t("mast.ledeEm")}</em>
          {t("mast.ledeEnd")}
        </p>
        <nav className="mast-nav" aria-label={t("mast.nav")}>
          <a href="#faq">{t("mast.faq")}</a>
          <a href="#contacts">{t("mast.contacts")}</a>
          <a href="#support">{t("mast.support")}</a>
        </nav>
      </div>
      <div className="mast-actions">
        <div className="lang-switch" role="group" aria-label={t("mast.langGroup")}>
          <button
            type="button"
            className="lang-btn"
            aria-pressed={state.locale === "en"}
            onClick={() => dispatch({ type: "setLocale", locale: "en" })}
          >
            EN
          </button>
          <button
            type="button"
            className="lang-btn"
            aria-pressed={state.locale === "ru"}
            onClick={() => dispatch({ type: "setLocale", locale: "ru" })}
          >
            RU
          </button>
        </div>
        <button
          className="theme-toggle"
          type="button"
          aria-label={state.theme === "dark" ? t("mast.themeToLight") : t("mast.themeToDark")}
          onClick={() => dispatch({ type: "setTheme", theme: state.theme === "dark" ? "light" : "dark" })}
        >
          {state.theme === "dark" ? (
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="12" cy="12" r="4.2" />
              <path d="M12 3.2v1.8M12 19v1.8M3.2 12h1.8M19 12h1.8M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M18.4 5.6l-1.3 1.3M6.9 17.1l-1.3 1.3" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M15.4 13.8A6.2 6.2 0 0 1 10.2 4.6 6.4 6.4 0 1 0 19.4 13.8a6.2 6.2 0 0 1-4 0Z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
