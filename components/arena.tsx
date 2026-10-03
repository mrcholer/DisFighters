import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent, RefObject } from "react";
import { createMatch, emptyControls, FIGHTERS, nextRound, STEP, stepMatch } from "@/lib/game/engine";
import type { Action, Controls, Match, MatchSettings, Player } from "@/lib/game/engine";
import type { GameAudio } from "@/lib/game/audio";
import type { DuelController } from "@/lib/game/use-duel";
import { CanvasScene } from "./canvas-scene";
import { ControlsGuide, GameIcon, Wordmark } from "./game-ui";
import { PlayerAvatar } from "./player-avatar";
import { mergeControls } from "@/lib/game/gamepads";
import type { PadEvent } from "@/lib/game/gamepads";
import type { GamepadController } from "@/lib/game/use-gamepads";
import { controllerMenu } from "@/lib/game/controller-menu";

const KEYS: Record<string, readonly [Player, Action]> = {
  KeyA: [0, "left"], KeyD: [0, "right"], KeyW: [0, "jump"], KeyS: [0, "crouch"], KeyF: [0, "attack"], KeyG: [0, "block"],
  ArrowLeft: [1, "left"], ArrowRight: [1, "right"], ArrowUp: [1, "jump"], ArrowDown: [1, "crouch"], KeyK: [1, "attack"], KeyL: [1, "block"],
};
function snapshot(match: Match) {
  return { phase: match.phase, health: match.fighters.map(fighter => fighter.health), score: [...match.score],
    time: Math.ceil(match.remaining), countdown: Math.ceil(match.countdown), round: match.round, winner: match.winner,
    shield: match.fighters.map(fighter => Math.ceil(fighter.shield)), shieldCooldown: match.fighters.map(fighter => fighter.shieldCooldown),
    guardBreak: match.fighters.map(fighter => fighter.guardBreakFlash > 0) };
}
type Hud = ReturnType<typeof snapshot>;

export default function Arena({ audio, onExit, muted, onMute, settings, online, onBrowse, gamepads, padEvents }: {
  audio: GameAudio; onExit: () => void; muted: boolean; onMute: () => void; settings: MatchSettings; online?: DuelController; onBrowse?: () => void;
  gamepads: GamepadController; padEvents: RefObject<((event: PadEvent) => void) | null>;
}) {
  const match = useRef(createMatch(settings));
  const paused = useRef(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hud, setHud] = useState<Hud>(() => snapshot(match.current));
  const keyboard = useRef(new Set<string>());
  const touch = useRef(new Map<number, readonly [Player, Action]>());
  const accumulator = useRef(0);
  const lastHud = useRef(0);
  const pausePanel = useRef<HTMLDivElement>(null);
  const connection = useRef(online);
  const controller = useRef(gamepads);
  const arenaRoot = useRef<HTMLElement>(null);
  const interpolation = useRef<{ target: Match; from: [number, number][]; elapsed: number } | null>(null);
  const generation = useRef("");
  const realtime = online !== undefined;
  const displayPaused = online ? online.state?.paused === true || online.status !== "open" : isPaused;
  const spectator = online !== undefined && online.state?.yourSlot === null;
  const onlineState = online?.state;
  useEffect(() => { connection.current = online; }, [online]);
  useEffect(() => { controller.current = gamepads; }, [gamepads]);
  useEffect(() => {
    const target = onlineState?.match;
    if (!target) return;
    const next = structuredClone(target);
    const key = `${onlineState.arenaId}:${onlineState.matchId}`;
    const sameMatch = generation.current === key;
    if (!sameMatch) controller.current.release();
    interpolation.current = { target: next, from: sameMatch ? match.current.fighters.map(fighter => [fighter.x, fighter.y]) : next.fighters.map(fighter => [fighter.x, fighter.y]), elapsed: 0 };
    generation.current = key;
    match.current = structuredClone(next); setHud(snapshot(next));
  }, [onlineState]);
  const clearInput = useCallback(() => {
    keyboard.current.clear(); touch.current.clear(); accumulator.current = 0;
    controller.current.release();
    for (const fighter of match.current.fighters) { fighter.wasAttackDown = false; fighter.wasJumpDown = false; }
    connection.current?.sendInput(emptyControls(), true);
  }, []);
  const sendHeldInput = useCallback(() => {
    const live = connection.current;
    if (!live || live.state?.yourSlot === null) return;
    const controls = emptyControls();
    for (const code of keyboard.current) controls[KEYS[code][1]] = true;
    for (const [, action] of touch.current.values()) controls[action] = true;
    live.sendInput(mergeControls(controls, controller.current.frame.current.controls[0]), true);
  }, []);
  const pause = useCallback((value: boolean) => {
    if (connection.current) { clearInput(); connection.current.act(value ? "pause" : "ready"); return; }
    paused.current = value; setIsPaused(value); clearInput();
  }, [clearInput]);
  useEffect(() => { if (realtime) { paused.current = displayPaused; if (displayPaused) clearInput(); } }, [clearInput, displayPaused, realtime]);
  const advance = useCallback(() => {
    if (connection.current) { connection.current.act("ready"); return; }
    if (match.current.phase !== "round-over" && match.current.phase !== "match-over") return;
    match.current = match.current.phase === "match-over" ? createMatch(match.current.settings) : nextRound(match.current);
    clearInput(); pause(false); setHud(snapshot(match.current)); audio.play("start");
  }, [audio, clearInput, pause]);
  const restart = () => { match.current = createMatch(match.current.settings); pause(false); setHud(snapshot(match.current)); audio.play("start"); };
  useEffect(() => {
    padEvents.current = event => {
      const live = connection.current;
      if (event.kind === "disconnect") {
        clearInput();
        if ((!live || live.state?.yourSlot !== null) && (match.current.phase === "fighting" || match.current.phase === "countdown")) pause(true);
        return;
      }
      audio.unlock();
      const finished = match.current.phase === "round-over" || match.current.phase === "match-over";
      if (event.kind === "pause" && !finished && (!live || live.state?.yourSlot !== null)) { pause(!paused.current); return; }
      if ((paused.current || finished) && arenaRoot.current) controllerMenu(arenaRoot.current, event.kind);
    };
    return () => { padEvents.current = null; };
  }, [audio, clearInput, padEvents, pause]);

  useEffect(() => {
    if (!displayPaused) return;
    const before = document.activeElement;
    const buttons = Array.from(pausePanel.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    buttons[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || buttons.length === 0) return;
      const first = buttons[0]; const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", trap);
    return () => { window.removeEventListener("keydown", trap); if (before instanceof HTMLElement && before.isConnected) before.focus(); };
  }, [displayPaused]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
      if (event.code === "Escape") { event.preventDefault(); if (!event.repeat) pause(!paused.current); return; }
      if (event.code === "Enter" && (match.current.phase === "round-over" || match.current.phase === "match-over")) {
        if (!(event.target instanceof HTMLButtonElement)) { event.preventDefault(); advance(); } return;
      }
      if (KEYS[event.code]) { event.preventDefault(); if (!paused.current) {
        keyboard.current.add(event.code);
        sendHeldInput();
      } }
    };
    const up = (event: KeyboardEvent) => {
      keyboard.current.delete(event.code);
      if (KEYS[event.code]) sendHeldInput();
    };
    const blur = () => {
      clearInput();
      if (match.current.phase === "fighting" || match.current.phase === "countdown") pause(true);
    };
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    window.addEventListener("blur", blur); document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", down); window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", visibility); clearInput();
    };
  }, [advance, clearInput, pause, sendHeldInput]);

  const tick = useCallback((elapsed: number, time: number) => {
    const live = connection.current;
    if (live) {
      const slot = live.state?.yourSlot;
      if (slot !== null && slot !== undefined) {
        const controls = emptyControls();
        for (const code of keyboard.current) controls[KEYS[code][1]] = true;
        for (const [, action] of touch.current.values()) controls[action] = true;
        live.sendInput(mergeControls(controls, controller.current.frame.current.controls[0]));
      }
      const view = interpolation.current;
      if (view) {
        view.elapsed += elapsed; const alpha = Math.min(1, view.elapsed / .05);
        for (const [index, fighter] of match.current.fighters.entries()) {
          fighter.x = view.from[index][0] + (view.target.fighters[index].x - view.from[index][0]) * alpha;
          fighter.y = view.from[index][1] + (view.target.fighters[index].y - view.from[index][1]) * alpha;
        }
        match.current.time = view.target.time + Math.min(view.elapsed, .05);
      }
      return;
    }
    accumulator.current += Math.min(elapsed, 0.1);
    const inputs: [Controls, Controls] = [emptyControls(), emptyControls()];
    for (const code of keyboard.current) { const [player, action] = KEYS[code]; inputs[player][action] = true; }
    for (const [player, action] of touch.current.values()) inputs[player][action] = true;
    for (const player of [0, 1] as const) inputs[player] = mergeControls(inputs[player], controller.current.frame.current.controls[player]);
    while (accumulator.current >= STEP) {
      stepMatch(match.current, inputs, STEP);
      for (const event of match.current.events) audio.play(event.type);
      accumulator.current -= STEP;
    }
    if (time - lastHud.current >= 50) { lastHud.current = time; setHud(snapshot(match.current)); }
  }, [audio]);
  const pointerDown = (event: PointerEvent<HTMLButtonElement>, player: Player, action: Action) => {
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    if (!paused.current && !spectator) touch.current.set(event.pointerId, [player, action]);
    sendHeldInput();
  };
  const pointerUp = (event: PointerEvent<HTMLButtonElement>) => { touch.current.delete(event.pointerId); sendHeldInput(); };
  const finished = hud.phase === "round-over" || hud.phase === "match-over";
  const winnerName = hud.winner === "draw" ? "DRAW" : hud.winner === null ? "" : (online?.state?.seats[hud.winner]?.name ?? FIGHTERS[hud.winner].name).toUpperCase();

  return <section ref={arenaRoot} className="fight-screen" aria-label={online ? "Real-time Discord duel" : "Local two-player test fight"}>
    <CanvasScene match={match} paused={paused} tick={tick} />
    <div className="arena-top-shade" />
    <div className="combat-hud">
      {[0, 1].map(player => <div className={`fighter-hud player-${player}`} key={player}>
        <div className="fighter-name"><span className="player-chip">P{player + 1}</span>{online?.state?.seats[player] && <PlayerAvatar player={{ name: online.state.seats[player]!.name, avatar: online.state.seats[player]!.avatar ?? null }} />}<strong>{online ? online.state?.seats[player]?.name : FIGHTERS[player].name.toUpperCase()}</strong>{!online && <span className="arabic-name" lang="ar">{FIGHTERS[player].arabic}</span>}</div>
        {online && <div className="duel-player-name">{online.state?.yourSlot === player ? "YOU · " : ""}{online.state?.seats[player]?.name ?? "RECONNECTING"}</div>}
        <div className="health-track" role="progressbar" aria-label={`${FIGHTERS[player].name} health`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={hud.health[player]}>
          <div className="health-fill" style={{ width: `${hud.health[player]}%` }} /><span>{hud.health[player]}</span>
        </div>
        <div className={`shield-hud ${hud.shieldCooldown[player] > 0 ? "broken" : ""} ${hud.guardBreak[player] ? "just-broken" : ""}`}>
          <div className="shield-track" role="progressbar" aria-label={`${FIGHTERS[player].name} shield`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={hud.shield[player]}><i style={{ width: `${hud.shield[player]}%` }} /></div>
          <span>{hud.shieldCooldown[player] > 0 ? `BROKEN · ${hud.shieldCooldown[player].toFixed(1)}s` : `SHIELD ${hud.shield[player]}%`}</span>
        </div>
        <div className="round-wins" aria-label={`${FIGHTERS[player].name}: ${hud.score[player]} round wins`}>
          {Array.from({ length: settings.winsToMatch }, (_, index) => <i key={index} className={index < hud.score[player] ? "won" : ""} />)}<span>{FIGHTERS[player].name.toUpperCase()} · {player === 0 ? "STRIKER" : "SENTINEL"}</span>
        </div>
      </div>)}
      <div className="round-clock"><span>ROUND {hud.round.toString().padStart(2, "0")}</span><strong className={hud.time <= 10 ? "urgent" : ""}>{hud.time.toString().padStart(2, "0")}</strong><small>FIRST TO {settings.winsToMatch}</small></div>
    </div>
    <div className="match-meta"><span><i /> {online ? spectator ? "SPECTATING" : "DISCORD DUEL" : "BROWSER TEST"}</span><span>CASBAH · NIGHTFALL</span></div>
    <div className="arena-corner-brand"><Wordmark /></div>
    <div className="arena-buttons">
      {onBrowse && <button className="secondary-button match-browser-button" onClick={onBrowse}>{online?.state?.competition?.mode === "tournament" ? "VIEW BRACKET" : "LOBBY & QUEUE"}</button>}
      <button className="icon-button" aria-label={muted ? "Enable sound" : "Mute sound"} aria-pressed={muted} onClick={onMute}><GameIcon name={muted ? "muted" : "sound"} /></button>
      <button className="icon-button" aria-label="Pause game" disabled={spectator} onClick={() => pause(true)}><GameIcon name="pause" /></button>
    </div>
    <div className="keyboard-hints"><span><kbd>A</kbd><kbd>D</kbd> MOVE <kbd>W</kbd> JUMP <kbd>S</kbd> CROUCH <kbd>F</kbd> HIT <kbd>G</kbd> BLOCK</span><span>{online ? spectator ? "WATCH THE RIVALRY" : "ARROW KEYS + K / L ALSO WORK · ESC TO PAUSE" : <><kbd>←</kbd><kbd>→</kbd> MOVE <kbd>↑</kbd> JUMP <kbd>↓</kbd> CROUCH <kbd>K</kbd> HIT <kbd>L</kbd> BLOCK</>}</span></div>
    {!spectator && <div className={`touch-controls ${online ? "online-touch" : ""}`} aria-label="Touch controls">{(online ? [online.state!.yourSlot!] : [0, 1] as const).map(player => <div className={`touch-player player-${player}`} key={player}>
      <span>P{player + 1}</span>{(["left", "right", "jump", "crouch", "attack", "block"] as const).map(action => <button key={action}
        aria-label={`Player ${player + 1} ${action}`} onPointerDown={event => pointerDown(event, player, action)} onPointerUp={pointerUp}
        onPointerCancel={pointerUp} onLostPointerCapture={pointerUp} onContextMenu={event => event.preventDefault()}>
        {{ left: "←", right: "→", jump: "↑", crouch: "↓", attack: "HIT", block: "GUARD" }[action]}
    </button>)}</div>)}</div>}
    {!displayPaused && (hud.phase === "countdown" || (hud.phase === "fighting" && hud.time === settings.roundSeconds)) && <div className="countdown-overlay" aria-live="polite"><span>ROUND {hud.round}</span><strong key={hud.phase === "fighting" ? "fight" : hud.countdown}>{hud.phase === "fighting" ? "FIGHT" : hud.countdown}</strong><small>{hud.phase === "fighting" ? "MAKE YOUR MOVE" : "GET READY"}</small></div>}
    {!displayPaused && !finished && hud.guardBreak.some(Boolean) && <div className="guard-break-notice" role="status">{hud.guardBreak.map((broken, player) => broken ? <span key={player}>{FIGHTERS[player].name.toUpperCase()} · SHIELD BROKEN</span> : null)}</div>}
    {!displayPaused && finished && <div className="result-overlay" role="status">
      <span className="micro-label">{hud.winner === "draw" ? "EVENLY MATCHED" : hud.phase === "match-over" ? "MATCH COMPLETE" : `ROUND ${hud.round} COMPLETE`}</span>
      <h2>{winnerName}<em>{hud.winner === "draw" ? "RUN IT BACK." : hud.phase === "match-over" ? "TAKES THE MATCH." : "WINS THE ROUND."}</em></h2>
      <div className="result-score"><span className="red">{online?.state?.seats[0]?.name ?? FIGHTERS[0].name.toUpperCase()} {hud.score[0]}</span><i>—</i><span className="blue">{hud.score[1]} {online?.state?.seats[1]?.name ?? FIGHTERS[1].name.toUpperCase()}</span></div>
      {!spectator && <button className="primary-button" onClick={advance}>{online && online.state?.seats[online.state.yourSlot!]?.ready ? "CANCEL READY" : hud.phase === "match-over" ? "REMATCH" : hud.winner === "draw" ? "FIGHT AGAIN" : "NEXT ROUND"}<GameIcon name="arrow" /></button>}
      {online && <p className="controls-note">{hud.phase !== "match-over" ? "Both players must confirm the next round." : online.state?.competition?.mode === "pvp" ? `Winner stays. Next challenger in ${online.state.competition.transitionSeconds ?? 0}s.` : "Winner advances. Choose a match to watch in the bracket."}</p>}
      {onBrowse && <button data-controller-primary className="secondary-button" onClick={onBrowse}>{online?.state?.competition?.mode === "tournament" ? "VIEW BRACKET" : "LOBBY & QUEUE"}</button>}
      {!spectator && <button className="text-button" onClick={onExit}>RETURN TO LOBBY</button>}
    </div>}
    {displayPaused && <div className="pause-overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div ref={pausePanel} className="pause-panel"><span className="micro-label accent">TAKE A BREATHER</span><h2 id="pause-title">PAUSED.</h2>
        <div className="pause-actions">{online && online.status !== "open" ? <button className="primary-button" onClick={online.reconnect}>RECONNECT<GameIcon name="arrow" /></button> : !spectator && <button className="primary-button" onClick={() => pause(false)} autoFocus>{online?.state?.seats[online.state.yourSlot!]?.ready ? "CANCEL READY" : "RESUME FIGHT"}<GameIcon name="arrow" /></button>}
          {!online && <button className="secondary-button" onClick={restart}>RESTART MATCH</button>}{onBrowse && <button className="secondary-button" onClick={onBrowse}>{online?.state?.competition?.mode === "tournament" ? "VIEW BRACKET" : "LOBBY & QUEUE"}</button>}{!spectator && <button className="text-button" onClick={onExit}>{online ? "FORFEIT & WATCH" : "RETURN TO LOBBY"}</button>}</div>
        <ControlsGuide online={online !== undefined} /><p className="controls-note">{online ? online.message || online.state?.pauseReason || "Connection lost. Reconnecting to your duel…" : <>The clock is stopped. Press <kbd>ESC</kbd> to resume.</>}</p>
      </div>
    </div>}
  </section>;
}
