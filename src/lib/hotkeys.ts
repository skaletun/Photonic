import type { KernelId } from "./config";
import { KERNEL_IDS } from "./config";

type HotkeyHandlers = {
  onSave: () => void;
  onUndo: () => void;
  onOpen: () => void;
  onKernel: (id: KernelId) => void;
  onZoom: (factor: number) => void;
  onHoldOriginal: (hold: boolean) => void;
};

export function bindHotkeys({ onSave, onUndo, onOpen, onKernel, onZoom, onHoldOriginal }: HotkeyHandlers) {
  const isField = (el: EventTarget | null) => {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const meta = event.ctrlKey || event.metaKey;
    if (meta && event.key.toLowerCase() === "s") {
      event.preventDefault();
      onSave();
      return;
    }
    if (meta && event.key.toLowerCase() === "z" && !event.shiftKey) {
      event.preventDefault();
      onUndo();
      return;
    }
    if (meta && event.key.toLowerCase() === "o") {
      event.preventDefault();
      onOpen();
      return;
    }
    if (isField(event.target)) return;
    if (event.key >= "1" && event.key <= "7") {
      const id = KERNEL_IDS[Number(event.key) - 1];
      if (id) onKernel(id);
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      onZoom(1.15);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      onZoom(1 / 1.15);
      return;
    }
    if (event.code === "Space" && !event.repeat) {
      event.preventDefault();
      onHoldOriginal(true);
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (event.code === "Space") onHoldOriginal(false);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
}
