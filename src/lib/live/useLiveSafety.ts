"use client";
import { useCallback, useSyncExternalStore } from "react";
import { useLiveStore } from "./LiveProvider";
import type { LiveScope } from "./store";
export function useLiveSafety(scope: LiveScope) {
  const store = useLiveStore();
  const subscribe = useCallback(
    (fn: () => void) => {
      store?.safetyListeners.add(fn);
      return () => {
        store?.safetyListeners.delete(fn);
      };
    },
    [store],
  );
  const snapshot = useCallback(
    () =>
      !!store &&
      [...store.entries.values()].some(
        (e) =>
          e.listeners.size && e.dependencies.includes(scope) && !!e.state.error,
      ),
    [store, scope],
  );
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
