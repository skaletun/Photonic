import { withBase } from "./base-path";

type LaunchFile = { getFile: () => Promise<File> };

type LaunchParams = { files: LaunchFile[] };

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    launchQueue?: {
      setConsumer: (callback: (params: LaunchParams) => void) => void;
    };
  }
}

const INBOX = "photonic-inbox";

export function registerServiceWorker(onUpdate?: (available: boolean) => void) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !window.isSecureContext) return () => {};
  let disposed = false;
  let registration: ServiceWorkerRegistration | null = null;
  const check = () => { if (!disposed) onUpdate?.(Boolean(registration?.waiting && navigator.serviceWorker.controller)); };
  const install = () => {
    const worker = registration?.installing;
    worker?.addEventListener("statechange", check);
    check();
  };
  const register = () => {
    void navigator.serviceWorker.register(withBase("/sw.js"), { scope: withBase("/") }).then(reg => {
      if (disposed) return;
      registration = reg; reg.addEventListener("updatefound", install); install();
    }).catch(() => {});
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
  return () => { disposed = true; window.removeEventListener("load", register); registration?.removeEventListener("updatefound", install); };
}

export async function applyAppUpdate() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration(withBase("/"));
  if (!registration?.waiting) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
  registration.waiting.postMessage({ type: "SKIP_WAITING" });
}

export function bindFileLaunch(onFiles: (files: File[]) => void) {
  window.launchQueue?.setConsumer((params) => {
    if (!params.files.length) return;
    void Promise.all(params.files.map((handle) => handle.getFile())).then((files) => {
      if (files.length) onFiles(files);
    });
  });
}

export function themeColorFor(theme: "dark" | "light") {
  return theme === "light" ? "#F3F0EA" : "#101214";
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

export function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export async function drainShareInbox(): Promise<File[]> {
  if (typeof window === "undefined" || !("caches" in window)) return [];
  const cache = await caches.open(INBOX);
  const keys = await cache.keys();
  const inbox = keys
    .filter((req) => /\/inbox\//.test(req.url))
    .sort((a, b) => a.url.localeCompare(b.url));
  const files: File[] = [];
  for (const req of inbox) {
    const res = await cache.match(req);
    if (!res) continue;
    const blob = await res.blob();
    const rawName = res.headers.get("X-Filename") || "shared";
    let name = rawName;
    try {
      name = decodeURIComponent(rawName);
    } catch {
      name = rawName;
    }
    const type = res.headers.get("Content-Type") || blob.type || "application/octet-stream";
    files.push(new File([blob], name, { type }));
    await cache.delete(req);
  }
  return files;
}

export function bindShareInbox(onFiles: (files: File[]) => void) {
  const drain = () => {
    void drainShareInbox().then((files) => {
      if (files.length) onFiles(files);
    });
  };
  drain();
  if (!("serviceWorker" in navigator)) return () => {};
  const onMessage = (event: MessageEvent<{ type?: string }>) => {
    if (event.data?.type === "photonic-share") drain();
  };
  navigator.serviceWorker.addEventListener("message", onMessage);
  const onVis = () => {
    if (document.visibilityState === "visible") drain();
  };
  document.addEventListener("visibilitychange", onVis);
  return () => {
    navigator.serviceWorker.removeEventListener("message", onMessage);
    document.removeEventListener("visibilitychange", onVis);
  };
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

export function bindInstallPrompt(onChange: (available: boolean) => void) {
  if (typeof window === "undefined") return () => {};
  if (isStandalone()) {
    onChange(false);
    return () => {};
  }
  const onPrompt = (event: Event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    onChange(true);
  };
  const onInstalled = () => {
    deferredPrompt = null;
    onChange(false);
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return choice.outcome === "accepted";
}
