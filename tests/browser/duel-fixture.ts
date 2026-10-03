import type { Page } from "@playwright/test";
import type { DuelSnapshot } from "../../lib/game/protocol";

/** Observe the public socket stream without changing game state or transport. */
export function observeDuel(page: Page) {
  const state = { current: null as DuelSnapshot | null };
  page.on("websocket", socket => socket.on("framereceived", ({ payload }) => {
    try {
      const packet = JSON.parse(String(payload));
      if (packet.event === "snapshot" && packet.data?.match) state.current = packet.data;
    } catch { /* Ignore non-JSON transport frames. */ }
  }));
  return state;
}
export type DuelObserver = ReturnType<typeof observeDuel>;
