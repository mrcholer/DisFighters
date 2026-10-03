import { useEffect, useRef } from "react";
import { FIGHTERS, ROUND_LENGTHS, WIN_TARGETS } from "@/lib/game/engine";
import type { MatchSettings } from "@/lib/game/engine";

export function Wordmark({ large = false }: { large?: boolean }) {
  return <span className={large ? "wordmark wordmark-large" : "wordmark"}>DIS<span>FIGHTERS</span><i aria-hidden="true">◆</i></span>;
}
export function GameIcon({ name }: { name: "sound" | "muted" | "fullscreen" | "controls" | "gamepad" | "settings" | "arrow" | "pause" | "close" }) {
  const paths = {
    sound: <><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
    muted: <><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 6 6m0-6-6 6"/></>,
    fullscreen: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>,
    controls: <><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h2m3 0h2m3 0h2M6 13h2m3 0h2m3 0h2M7 16h10"/></>,
    gamepad: <><path d="M7 7h10c3 0 4 3 5 10 .4 3-3 3-5 0l-1-1H8l-1 1c-2 3-5.4 3-5 0 1-7 2-10 5-10Z" /><path d="M7 10v5m-2.5-2.5h5"/><circle cx="16" cy="11" r=".7"/><circle cx="18" cy="14" r=".7"/></>,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6"/>,
    pause: <><path d="M7 4v16m10-16v16"/></>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    settings: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
export const BINDINGS = [
  { player: "PLAYER 01", name: FIGHTERS[0].name, move: ["A", "D"], jump: "W", crouch: "S", attack: "F", block: "G" },
  { player: "PLAYER 02", name: FIGHTERS[1].name, move: ["←", "→"], jump: "↑", crouch: "↓", attack: "K", block: "L" },
] as const;
export function ControlsGuide({ online = false }: { online?: boolean }) {
  return <><div className="controls-guide">{BINDINGS.map((binding, index) => <section className={`control-player player-${index}`} key={binding.name}>
    <span className="micro-label">{online ? index === 0 ? "PREFERRED KEYS" : "ALTERNATE KEYS" : binding.player}</span><h3>{online ? index === 0 ? "WASD" : "ARROWS" : binding.name}</h3>
    <dl>
      <div><dt>Move</dt><dd>{binding.move.map(key => <kbd key={key}>{key}</kbd>)}</dd></div>
      <div><dt>Jump / crouch</dt><dd><kbd>{binding.jump}</kbd><kbd>{binding.crouch}</kbd></dd></div>
      <div><dt>Punch</dt><dd><kbd>{binding.attack}</kbd></dd></div>
      <div><dt>Block</dt><dd><kbd>{binding.block}</kbd></dd></div>
    </dl>
  </section>)}</div><section className="controller-guide" aria-label="Controller controls"><span className="micro-label accent">XBOX · PS4 · PS5</span>
    <dl><div><dt>Move / crouch</dt><dd>LEFT STICK / D-PAD</dd></div><div><dt>Jump / confirm</dt><dd>A / CROSS</dd></div><div><dt>Punch</dt><dd>X / SQUARE</dd></div><div><dt>Guard</dt><dd>B / CIRCLE · RT / R2</dd></div><div><dt>Pause / ready</dt><dd>START / OPTIONS</dd></div><div><dt>Help / back</dt><dd>VIEW / SHARE · B / CIRCLE</dd></div></dl>
    <p>Connect by USB or pair with your PC over Bluetooth. Press a button, then release the controls to activate. {online ? "Your controller operates only your own fighter." : "The first two controllers take Player One and Player Two; keyboard and touch also work."}</p>
  </section></>;
}
export function ControlsDialog({ onClose, online = false }: { onClose: () => void; online?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="controls-dialog" aria-labelledby="controls-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <button className="icon-button dialog-close" aria-label="Close controls" onClick={onClose} autoFocus><GameIcon name="close" /></button>
    <span className="micro-label accent">KNOW YOUR MOVES</span><h2 id="controls-title">MAKE YOUR<br /><em>FIRST HIT.</em></h2>
    <p>{online ? "Each player controls their own fighter. Choose a controller or either set of keys." : "Two fighters. Controllers, keyboard or touch. Settle it in the arena."}</p><ControlsGuide online={online} />
    <div className="control-tip"><span>GOOD TO KNOW</span> Hold crouch + punch for a low attack. Crouch + block to defend it. Four blocked hits break a full shield and briefly stun you. Guard returns at full strength after 5 seconds. Release guard to regenerate a damaged shield.</div>
    <p className="controls-note"><kbd>ESC</kbd> pauses the fight. Losing focus pauses automatically. Touch controls are available in the arena.</p>
  </dialog>;
}

export function SettingsDialog({ settings, onChange, onClose, online = false }: { settings: MatchSettings; onChange: (settings: MatchSettings) => void; onClose: () => void; online?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="controls-dialog settings-dialog" aria-labelledby="settings-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <button className="icon-button dialog-close" aria-label="Close match settings" onClick={onClose} autoFocus><GameIcon name="close" /></button>
    <span className="micro-label accent">YOUR ARENA. YOUR RULES.</span><h2 id="settings-title">MATCH<br /><em>SETTINGS.</em></h2>
    <p>Set the pace before stepping into the arena.</p>
    <fieldset className="setting-group"><legend>ROUND LENGTH</legend><div>{ROUND_LENGTHS.map(seconds => <button key={seconds} aria-pressed={settings.roundSeconds === seconds} onClick={() => onChange({ ...settings, roundSeconds: seconds })}>{seconds}<small>SECONDS</small></button>)}</div></fieldset>
    <fieldset className="setting-group"><legend>ROUNDS TO WIN</legend><div>{WIN_TARGETS.map(wins => <button key={wins} aria-pressed={settings.winsToMatch === wins} onClick={() => onChange({ ...settings, winsToMatch: wins })}>{wins}<small>{wins === 1 ? "QUICK DUEL" : `BEST OF ${wins * 2 - 1}`}</small></button>)}</div></fieldset>
    <div className="control-tip"><span>SHIELD RULES</span>100 strength · 25 lost per blocked hit · 5-second recovery after a break. A draw awards no point; play another round to settle it.</div>
    <button className="primary-button settings-done" onClick={onClose}>READY TO FIGHT<GameIcon name="arrow" /></button>
    <p className="controls-note">{online ? "Host rules apply to both players. Both must ready up after changes." : "Saved on this device. These rules also apply to restarts and rematches."}</p>
  </dialog>;
}
