"use client";
import { useCallback, useEffect, useRef } from "react";
import { SoundController, type SoundName } from "./controller";
import { startAutomaticSound } from "./automatic";
export function useProtocolSounds(userId?: string) {
  const controller = useRef<SoundController | null>(null);
  useEffect(() => {
    if (!userId) return;
    const storage = {
      getItem: () => null,
      setItem: () => {},
    };
    const audio = new SoundController(() => {
      const Constructor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Constructor) throw Error("unsupported");
      return new Constructor({ latencyHint: "interactive" });
    }, storage, "abaad:sounds:" + userId, () => {}, true);
    controller.current = audio;
    const stopAutomatic = startAutomaticSound(audio, window, document);
    return () => { stopAutomatic(); audio.dispose(); controller.current = null; };
  }, [userId]);
  const play = useCallback((name: SoundName, id: string) => controller.current?.play(name, id), []);
  const unlock = useCallback(() => { void controller.current?.unlock(); }, []);
  return { play, unlock };
}
