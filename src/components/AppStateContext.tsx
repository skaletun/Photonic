"use client";

import { createContext, useContext, type Dispatch } from "react";
import type { Action, UiState } from "@/lib/app-state";

type AppStateContextValue = {
  state: UiState;
  dispatch: Dispatch<Action>;
};

export const AppStateContext = createContext<AppStateContextValue | null>(null);

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("AppStateContext is missing");
  return ctx;
}
