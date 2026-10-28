"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LiveStore, type LiveScope, type LiveState } from "./store";
import { announceChange, useLiveStore } from "./LiveProvider";
export function useLiveData<T>(
  endpoint: string,
  query: string,
  scope: LiveScope,
  role: string,
  active = true,
) {
  const inherited = useLiveStore(),
    router = useRouter();
  const local = useMemo(
    () => new LiveStore(role, () => router.replace("/?notice=session")),
    [role, router],
  );
  const store = inherited || local,
    key = endpoint + (query ? "?" + query : "");
  const [state, setState] = useState<LiveState<T>>({
    data: null,
    error: "",
    fetching: true,
    slow: false,
    checkedAt: 0,
    limited: false,
    denied: false,
  });
  useEffect(() => {
    if (!active) return;
    store.activate();
    let current = true;
    const update = () => {
      const entry = store.entry(key, scope).state;
      setState((previous) => ({
        ...entry,
        data: entry.denied ? null : (entry.data as T | null) || previous.data,
      }));
    };
    const off = store.subscribe(key, scope, update);
    const timer = setTimeout(
      () => {
        if (current) {
          update();
          void store.load(key, scope);
        }
      },
      new URLSearchParams(query).get("q") ? 200 : 0,
    );
    const fallback = !inherited
      ? setInterval(() => {
          if (document.visibilityState === "visible") void store.check();
        }, 5000)
      : undefined;
    return () => {
      current = false;
      off();
      clearTimeout(timer);
      if (fallback) clearInterval(fallback);
    };
  }, [store, key, scope, active, inherited, query]);
  useEffect(
    () => () => {
      local.dispose();
    },
    [local],
  );
  const refresh = useCallback(async () => {
    announceChange([scope, "overview"]);
    await store.load(key, scope, true);
  }, [store, key, scope]);
  return {
    ...state,
    data: state.data,
    loading: !state.data && state.fetching,
    updating: !!state.data && state.fetching,
    refresh,
  };
}
