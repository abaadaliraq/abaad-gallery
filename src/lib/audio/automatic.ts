import type { SoundController } from "./controller";

/** Try on mount, then use genuine browser gestures if autoplay is restricted. */
export function startAutomaticSound(
  audio: Pick<SoundController, "unlock">,
  target: EventTarget,
  page: EventTarget & { readonly visibilityState: DocumentVisibilityState },
) {
  const resume = () => { void audio.unlock(); };
  const visible = () => { if (page.visibilityState === "visible") resume(); };
  const events = ["pointerdown", "touchend", "keydown", "click", "focus", "pageshow"];
  for (const event of events) target.addEventListener(event, resume, { capture: true, passive: true });
  page.addEventListener("visibilitychange", visible);
  resume();
  return () => {
    for (const event of events) target.removeEventListener(event, resume, { capture: true });
    page.removeEventListener("visibilitychange", visible);
  };
}
