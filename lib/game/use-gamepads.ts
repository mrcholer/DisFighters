import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { emptyPadFrame, GamepadTracker } from "./gamepads";
import type { PadDevice, PadEvent, PadSnapshot } from "./gamepads";

export function useGamepads(online: boolean, onEvent: RefObject<(event: PadEvent) => void>) {
  const frame = useRef(emptyPadFrame());
  const tracker = useRef<GamepadTracker | null>(null);
  const [devices, setDevices] = useState<PadDevice[]>([]);
  const [error, setError] = useState("");
  const release = useCallback(() => { tracker.current?.release(); frame.current.controls = emptyPadFrame().controls; }, []);
  useEffect(() => {
    const input = new GamepadTracker(online ? 1 : 2); tracker.current = input; frame.current = emptyPadFrame();
    let animation = 0; let signature = ""; let focused = document.hasFocus(); let failed = false;
    const blur = () => { focused = false; release(); };
    const focus = () => { focused = true; release(); };
    const visibility = () => { focused = !document.hidden && document.hasFocus(); release(); };
    const poll = (now: number) => {
      if (typeof navigator.getGamepads !== "function") { setError("Controllers unavailable in this browser"); return; }
      let pads: readonly (PadSnapshot | null | undefined)[] = [];
      try { pads = Array.from(navigator.getGamepads()); }
      catch (cause) {
        setError(cause instanceof DOMException && cause.name === "SecurityError" ? "Controller access blocked in this frame" : "Controllers unavailable in this browser");
        failed = true;
      }
      const next = input.sample(pads, now);
      if (!focused || document.hidden) { input.release(); next.controls = emptyPadFrame().controls; next.events = next.events.filter(event => event.kind === "disconnect"); }
      frame.current = next;
      const key = JSON.stringify(next.devices);
      if (key !== signature) { signature = key; setDevices(next.devices); }
      for (const event of next.events) onEvent.current(event);
      if (!failed) animation = requestAnimationFrame(poll);
    };
    window.addEventListener("blur", blur); window.addEventListener("focus", focus); document.addEventListener("visibilitychange", visibility);
    animation = requestAnimationFrame(poll);
    return () => { cancelAnimationFrame(animation); window.removeEventListener("blur", blur); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", visibility); release(); tracker.current = null; };
  }, [online, onEvent, release]);
  return { frame, release, devices, error };
}
export type GamepadController = ReturnType<typeof useGamepads>;
