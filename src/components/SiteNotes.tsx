"use client";

import { SITE_LINKS } from "@/lib/site-links";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/hooks/useT";

const FAQ: { q: MessageKey; a: MessageKey }[] = [
  { q: "faq.qHow", a: "faq.aHow" },
  { q: "faq.q1", a: "faq.a1" },
  { q: "faq.q2", a: "faq.a2" },
  { q: "faq.q3", a: "faq.a3" },
  { q: "faq.q4", a: "faq.a4" },
  { q: "faq.q5", a: "faq.a5" },
  { q: "faq.q6", a: "faq.a6" },
  { q: "faq.q7", a: "faq.a7" },
  { q: "faq.q8", a: "faq.a8" },
  { q: "faq.q9", a: "faq.a9" },
];

const CONTACTS: { href: string; name: MessageKey; hint: MessageKey; external: boolean }[] = [
  {
    href: SITE_LINKS.github,
    name: "contacts.github",
    hint: "contacts.githubHint",
    external: true,
  },
  {
    href: SITE_LINKS.mail,
    name: "contacts.mail",
    hint: "contacts.mailHint",
    external: false,
  },
  {
    href: SITE_LINKS.telegram,
    name: "contacts.telegram",
    hint: "contacts.telegramHint",
    external: true,
  },
];

export function SiteNotes() {
  const { t } = useT();
  const external = t("contacts.external");

  return (
    <div className="site-notes">
      <section className="site-faq" id="faq" aria-labelledby="faq-title">
        <p className="site-kicker">{t("faq.kicker")}</p>
        <h2 id="faq-title" className="site-title">
          {t("faq.title")}
        </h2>
        <div className="faq-list">
          {FAQ.map((item, index) => (
            <details key={item.q} className="faq-item">
              <summary>
                <span className="faq-idx" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="faq-q">{t(item.q)}</span>
              </summary>
              <p className="faq-a">{t(item.a)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="site-contacts" id="contacts" aria-labelledby="contacts-title">
        <div className="contacts-copy">
          <p className="site-kicker">{t("contacts.kicker")}</p>
          <h2 id="contacts-title" className="site-title site-title-display">
            {t("contacts.title")}
          </h2>
          <p className="contacts-lead">{t("contacts.lead")}</p>
        </div>
        <ul className="contact-list">
          {CONTACTS.map((item) => (
            <li key={item.href}>
              <a
                className="contact-link"
                href={item.href}
                {...(item.external
                  ? { target: "_blank", rel: "noopener noreferrer", title: external }
                  : {})}
              >
                <span className="contact-name">{t(item.name)}</span>
                <span className="contact-hint">{t(item.hint)}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="site-support" id="support" aria-labelledby="support-title">
        <div className="support-copy">
          <p className="site-kicker">{t("support.kicker")}</p>
          <h2 id="support-title" className="site-title">
            {t("support.title")}
          </h2>
          <p className="support-lead">{t("support.lead")}</p>
        </div>
        <div className="support-ways">
          <a
            className="support-donatex"
            href={SITE_LINKS.donatex}
            target="_blank"
            rel="noopener noreferrer"
            title={external}
          >
            {t("support.donatex")}
          </a>
          <a
            className="support-alerts"
            href={SITE_LINKS.alerts}
            target="_blank"
            rel="noopener noreferrer"
            title={external}
          >
            {t("support.alerts")}
          </a>
          <a
            className="support-tbank"
            href={SITE_LINKS.tbank}
            target="_blank"
            rel="noopener noreferrer"
            title={external}
          >
            {t("support.tbank")}
          </a>
        </div>
        <p className="support-note">{t("support.note")}</p>
      </section>
      <footer className="site-legal">
        <span className="site-legal-mark">Photonic</span>
        <p>{t("footer.rights", { year: new Date().getFullYear() })}</p>
      </footer>
    </div>
  );
}
