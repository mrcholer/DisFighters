import { useCallback, useEffect, useRef, useState } from "react";
import { useWS } from "ludicord/ws/client";
import type { Controls } from "./engine";
import type { DuelSnapshot } from "./protocol";
import type { GameAudio } from "./audio";

export function useDuel(enabled: boolean, audio: GameAudio) {
  const socket = useWS("/ws/duel", { enabled });
  const [state, setState] = useState<DuelSnapshot | null>(null);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const current = useRef<DuelSnapshot | null>(null);
  const sequence = useRef(0);
  const lastInput = useRef({ key: "", time: 0 });
  useEffect(() => {
    const snapshot = socket.on("snapshot", data => {
      const next = data as DuelSnapshot;
      if (!next || !Number.isSafeInteger(next.revision) || !Array.isArray(next.seats)) return;
      if (current.current && next.revision < current.current.revision) return;
      for (const event of next.events ?? []) audio.play(event.type);
      if (next.matchId !== current.current?.matchId || next.arenaId !== current.current?.arenaId) lastInput.current = { key: "", time: 0 };
      current.current = next; setState(next);
    });
    const replaced = socket.on("replaced", () => { setMessage("You connected in another window. This window is now disconnected."); socket.close(); });
    const notification = socket.on("notice", data => { if (typeof data === "string") setNotice(data); });
    return () => { snapshot(); replaced(); notification(); };
  }, [audio, socket]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 5000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (socket.status === "open") { current.current = null; socket.emit("sync"); }
  }, [socket]);
  const act = useCallback((event: "ready" | "pause" | "lobby" | "settings" | "claim" | "mode" | "queue" | "withdraw" | "register" | "tournament" | "new-tournament" | "watch", data?: unknown) => {
    if (socket.status === "open") socket.emit(event, data);
  }, [socket]);
  const sendInput = useCallback((controls: Controls, force = false) => {
    if (socket.status !== "open" || current.current?.yourSlot === null || !current.current?.match) return;
    const key = JSON.stringify(controls); const now = performance.now();
    if (!force && key === lastInput.current.key && now - lastInput.current.time < 100) return;
    lastInput.current = { key, time: now };
    socket.emit("input", { seq: sequence.current++, matchId: current.current.matchId, arenaId: current.current.arenaId, controls });
  }, [socket]);
  const reconnect = () => { setMessage(""); socket.reconnect(); };
  return { state, status: socket.status, message, notice, act, sendInput, reconnect };
}
export type DuelController = ReturnType<typeof useDuel>;
