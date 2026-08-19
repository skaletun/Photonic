import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { withBase } from "@/lib/base-path";
import { fontFaceCss } from "@/lib/font-faces";
import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/styles/shell.css";
import "@/styles/controls.css";
import "@/styles/preview.css";
import "@/styles/site-notes.css";

export const metadata: Metadata = {
  title: "Photonic — classical image resampler",
  description:
    "Photonic is a local image resampler. The Photonic kernel and classic filters. No AI, no upload.",
  applicationName: "Photonic",
  manifest: withBase("/manifest.webmanifest"),
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Photonic",
  },
  icons: {
    icon: [
      { url: withBase("/icons/icon-192.png"), sizes: "192x192", type: "image/png" },
      { url: withBase("/icons/icon-512.png"), sizes: "512x512", type: "image/png" },
    ],
    apple: withBase("/icons/apple-touch-icon.png"),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F3F0EA" },
    { media: "(prefers-color-scheme: dark)", color: "#101214" },
  ],
};

const bootScript = `try{var s=JSON.parse(localStorage.getItem("photonic:v1")||"{}");var th=s.settingsRev>=2&&(s.theme==="light"||s.theme==="dark")?s.theme:"light";document.documentElement.dataset.theme=th;var l=s.locale;if(l!=="en"&&l!=="ru")l=String(navigator.language||"").toLowerCase().indexOf("ru")===0?"ru":"en";document.documentElement.lang=l;}catch(e){document.documentElement.dataset.theme="light"}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: fontFaceCss() }} />
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
