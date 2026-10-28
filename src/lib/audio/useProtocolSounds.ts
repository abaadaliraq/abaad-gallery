"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SoundController, type SoundName, type SoundStatus } from "./controller";
export function useProtocolSounds(userId?: string) {
  const controller = useRef<SoundController | null>(null);
  const [status, setStatus] = useState<SoundStatus>("locked");
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const storage = {
      getItem: (key: string) => window.localStorage.getItem(key),
      setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
    };
    const audio = new SoundController(() => {
      const Constructor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Constructor) throw Error("unsupported");
      return new Constructor({ latencyHint: "interactive" });
    }, storage, "abaad:sounds:" + userId, state => { if (alive) setStatus(state); });
    controller.current = audio;
    queueMicrotask(() => { if (alive) setStatus(audio.status); });
    return () => { alive = false; audio.dispose(); controller.current = null; };
  }, [userId]);
  const play = useCallback((name: SoundName, id: string) => controller.current?.play(name, id), []);
  const enable = useCallback(() => { void controller.current?.test(); }, []);
  const mute = useCallback(() => controller.current?.mute(), []);
  const unlock = useCallback(() => { void controller.current?.unlock(); }, []);
  return { status, play, enable, mute, unlock, testSound: enable };
}
