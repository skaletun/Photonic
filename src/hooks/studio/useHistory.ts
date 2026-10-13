import { useCallback, useRef } from "react";
import { snapshotSettings, type SettingsSnap } from "@/lib/app-state";
import type { Runtime } from "./runtime";

export function useHistory(runtime: Runtime) {
  const { state: stateRef, full: fullRef, operation: operationRef } = runtime;
  const past = useRef<SettingsSnap[]>([]);
  const future = useRef<SettingsSnap[]>([]);
  const sync = useCallback(
    () => runtime.dispatch({ type: "setHistory", undo: past.current.length, redo: future.current.length }),
    [runtime],
  );
  const push = useCallback(() => {
    if (!stateRef.current.hasSource || operationRef.current) return;
    const snap = snapshotSettings(stateRef.current);
    if (JSON.stringify(past.current.at(-1)) === JSON.stringify(snap)) return;
    past.current.push(snap);
    if (past.current.length > 50) past.current.shift();
    future.current = [];
    sync();
  }, [sync, stateRef, operationRef]);
  const clear = useCallback(() => {
    past.current = [];
    future.current = [];
    sync();
  }, [sync]);
  const navigate = useCallback(
    (redo: boolean) => {
      if (operationRef.current) return;
      const from = redo ? future.current : past.current;
      const to = redo ? past.current : future.current;
      const snap = from.pop();
      if (!snap) return;
      to.push(snapshotSettings(stateRef.current));
      fullRef.current = { image: null, fingerprint: "" };
      runtime.dispatch({ type: "applySnap", snap });
      sync();
    },
    [runtime, sync, stateRef, fullRef, operationRef],
  );
  return {
    push,
    clear,
    undo: useCallback(() => navigate(false), [navigate]),
    redo: useCallback(() => navigate(true), [navigate]),
  };
}
