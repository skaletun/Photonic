import type { Locale } from "../config";
import type { ErrorCode } from "../errors";
import { toAppError } from "../errors";
import { en, type MessageKey, type Messages } from "./en";
import { ru } from "./ru";

export type { MessageKey, Messages };
export type MessageParams = Record<string, string | number>;

export type StatusMsg = {
  key: MessageKey;
  params?: MessageParams;
};

const dictionaries: Record<Locale, Messages> = { en, ru };

const ERROR_KEYS: Record<ErrorCode, MessageKey> = {
  unsupported_type: "error.unsupported_type",
  decode_failed: "error.decode_failed",
  frame_too_large: "error.frame_too_large",
  canvas_unavailable: "error.canvas_unavailable",
  out_of_memory: "error.out_of_memory",
  pixels_unreadable: "error.pixels_unreadable",
  encode_failed: "error.encode_failed",
  source_missing: "error.source_missing",
  worker_failed: "error.worker_failed",
  unknown: "error.unknown",
  dest_min: "error.dest_min",
  dest_side: "error.dest_side",
  dest_area: "error.dest_area",
  dest_hard: "error.dest_hard",
  dest_warn: "error.dest_warn",
};

export function interpolate(template: string, params?: MessageParams) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] === undefined ? `{${name}}` : String(params[name]),
  );
}

export function t(locale: Locale, key: MessageKey, params?: MessageParams) {
  return interpolate(dictionaries[locale][key], params);
}

export function isMessageKey(value: string): value is MessageKey {
  return Object.hasOwn(en, value);
}

export function kernelTitleKey(id: string): MessageKey {
  const key = `kernel.${id}.title`;
  return isMessageKey(key) ? key : "kernel.photonic.title";
}

export function kernelHintKey(id: string): MessageKey {
  const key = `kernel.${id}.hint`;
  return isMessageKey(key) ? key : "kernel.photonic.hint";
}

export function statusFromError(error: unknown): StatusMsg {
  const appError = toAppError(error);
  return { key: ERROR_KEYS[appError.code], params: appError.params };
}

export { en, ru };
