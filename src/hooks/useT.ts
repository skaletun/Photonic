"use client";

import { useCallback } from "react";
import { kernelHintKey, kernelTitleKey, kernelUseKey, t, type MessageKey, type MessageParams } from "@/lib/i18n";
import { useAppState } from "@/components/AppStateContext";

export function useT() {
  const { state } = useAppState();
  const translate = useCallback(
    (key: MessageKey, params?: MessageParams) => t(state.locale, key, params),
    [state.locale],
  );
  const kernelTitle = useCallback((id: string) => translate(kernelTitleKey(id)), [translate]);
  const kernelHint = useCallback((id: string) => translate(kernelHintKey(id)), [translate]);
  const kernelUse = useCallback((id: string) => translate(kernelUseKey(id)), [translate]);
  return {
    t: translate,
    locale: state.locale,
    kernelTitle,
    kernelHint,
    kernelUse,
  };
}

