import { withBase } from "./base-path";

type LaunchFile = { getFile: () => Promise<File> };

type LaunchParams = { files: LaunchFile[] };

declare global {
  interface Window {
    launchQueue?: {
      setConsumer: (callback: (params: LaunchParams) => void) => void;
    };
  }
}

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(withBase("/sw.js"), {
      scope: withBase("/"),
    });
  });
}

export function bindFileLaunch(onFile: (file: File) => void) {
  window.launchQueue?.setConsumer((params) => {
    const handle = params.files[0];
    if (!handle) return;
    void handle.getFile().then(onFile);
  });
}

export function themeColorFor(theme: "dark" | "light") {
  return theme === "light" ? "#F3F0EA" : "#101214";
}
