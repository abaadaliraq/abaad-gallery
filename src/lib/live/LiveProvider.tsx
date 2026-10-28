"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { LiveStore, type LiveScope } from "./store";
const Context = createContext<LiveStore | null>(null);
export function LiveProvider({
  role,
  userId,
  children,
}: {
  role: string;
  userId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const store = useMemo(
    () =>
      new LiveStore(
        role,
        () => router.replace("/?notice=session"),
        undefined,
        undefined,
        userId,
      ),
    [role, userId, router],
  );
  useEffect(() => {
    store.activate();
    const tick = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        void store.check();
    };
    const offline = () => store.offline();
    const restored = (e: PageTransitionEvent) => {
      if (e.persisted) void store.check(true);
    };
    const invalidate = (e: Event) => {
      const scopes = (e as CustomEvent<LiveScope[]>).detail;
      void store.invalidate(scopes);
    };
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("abaad-ui-" + userId)
        : null;
    if (channel) channel.onmessage = () => void store.check(true);
    const changed = (e: Event) => {
      invalidate(e);
      channel?.postMessage("changed");
    };
    const initial = setTimeout(tick, 400),
      timer = setInterval(tick, 5000);
    window.addEventListener("focus", tick);
    window.addEventListener("online", tick);
    window.addEventListener("offline", offline);
    window.addEventListener("pageshow", restored);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("abaad:data-changed", changed);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      window.removeEventListener("online", tick);
      window.removeEventListener("offline", offline);
      window.removeEventListener("pageshow", restored);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("abaad:data-changed", changed);
      channel?.close();
      store.dispose();
    };
  }, [store, userId]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export const useLiveStore = () => useContext(Context);
export function announceChange(scopes: LiveScope[]) {
  window.dispatchEvent(
    new CustomEvent("abaad:data-changed", { detail: scopes }),
  );
}
