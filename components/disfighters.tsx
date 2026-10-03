import { useCallback, useEffect, useRef, useState } from "react";
import { GameAudio } from "@/lib/game/audio";
import { useLudicordSession } from "ludicord/auth";
import { useDiscord } from "ludicord/discord";
import { useDuel } from "@/lib/game/use-duel";
import { FIGHTERS, normalizeSettings } from "@/lib/game/engine";
import type { MatchSettings } from "@/lib/game/engine";
import { useGamepads } from "@/lib/game/use-gamepads";
import type { PadEvent } from "@/lib/game/gamepads";
import { controllerMenu } from "@/lib/game/controller-menu";
import Arena from "./arena";
import CompetitionLobby from "./competition-lobby";
import { CanvasScene } from "./canvas-scene";
import { ControlsDialog, GameIcon, SettingsDialog, Wordmark } from "./game-ui";

const ASSETS = ["/arena.svg", "/icon.svg"];
const FONTS = ['400 14px "Barlow"', '600 14px "Barlow"', '700 32px "Barlow Condensed"', '800 32px "Barlow Condensed"', 'italic 800 32px "Barlow Condensed"'];
const ASSET_TOTAL = ASSETS.length + FONTS.length;
function initialMute() { try { return localStorage.getItem("disfighters:muted") === "true"; } catch { return false; } }
function initialSettings() { try { return normalizeSettings(JSON.parse(localStorage.getItem("disfighters:settings") ?? "null")); } catch { return normalizeSettings(null); } }

export default function DisFighters() {
  const [screen, setScreen] = useState<"loading" | "lobby" | "fight">("loading");
  const [loaded, setLoaded] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<MatchSettings>(initialSettings);
  const [muted, setMuted] = useState(initialMute);
  const [notice, setNotice] = useState("");
  const [browsingArena, setBrowsingArena] = useState<string | null>(null);
  const [audio] = useState(() => new GameAudio());
  const session = useLudicordSession();
  const discord = useDiscord();
  const browserLocalTest = discord.status === "outside-discord" && new URLSearchParams(location.search).get("test") === "local";
  const onlineMode = discord.status === "ready" || (session?.kind === "development" && !browserLocalTest);
  const padEvents = useRef<(event: PadEvent) => void>(() => {});
  const arenaPadEvents = useRef<((event: PadEvent) => void) | null>(null);
  const gamepads = useGamepads(onlineMode, padEvents);
  const releasePads = gamepads.release;
  const duel = useDuel(onlineMode && session !== null, audio);
  const duelAction = duel.act;
  const rules = onlineMode ? duel.state?.settings ?? settings : settings;
  const liveFight = onlineMode && duel.state?.match !== null && duel.state?.match !== undefined && browsingArena !== duel.state?.arenaId;
  const currentScreen = screen === "loading" ? "loading" : liveFight ? "fight" : onlineMode && screen === "fight" ? "lobby" : screen;
  const root = useRef<HTMLElement>(null);
  const ready = loaded === ASSET_TOTAL;
  useEffect(() => {
    let cancelled = false;
    const images: HTMLImageElement[] = [];
    setLoaded(0); setLoadError(false);
    const imageTasks = ASSETS.map(src => new Promise<void>((resolve, reject) => {
      const image = new Image(); images.push(image);
      image.onload = () => { if (!cancelled) setLoaded(value => value + 1); resolve(); };
      image.onerror = () => reject(new Error("Asset unavailable")); image.src = src;
    }));
    const fontTasks = FONTS.map(font => document.fonts.load(font).then(() => { if (!cancelled) setLoaded(value => value + 1); }));
    void Promise.all([...imageTasks, ...fontTasks]).catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; images.forEach(image => { image.onload = null; image.onerror = null; }); };
  }, [attempt]);
  useEffect(() => { audio.muted = muted; try { localStorage.setItem("disfighters:muted", String(muted)); } catch { /* Preferences are optional. */ } }, [audio, muted]);
  useEffect(() => () => audio.dispose(), [audio]);
  useEffect(() => { try { localStorage.setItem("disfighters:settings", JSON.stringify(settings)); } catch { /* Settings still work in memory. */ } }, [settings]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(timer); }, [notice]);
  const enterLobby = useCallback(() => { if (!ready || loadError) return; releasePads(); audio.unlock(); audio.play("select"); setScreen("lobby"); }, [audio, ready, loadError, releasePads]);
  const startFight = useCallback(() => { releasePads(); audio.unlock(); audio.play("start"); if (onlineMode) { setBrowsingArena(null); duelAction("ready"); } else setScreen("fight"); }, [audio, onlineMode, duelAction, releasePads]);
  const returnLobby = useCallback(() => { audio.play("select"); if (onlineMode) duelAction("lobby"); else setScreen("lobby"); }, [audio, onlineMode, duelAction]);
  const mute = useCallback(() => {
    audio.muted = !audio.muted;
    if (!audio.muted) { audio.unlock(); audio.play("select"); }
    setMuted(audio.muted);
  }, [audio]);
  useEffect(() => {
    if (currentScreen === "fight" || showControls || showSettings) return;
    const key = (event: KeyboardEvent) => {
      if (currentScreen === "lobby" && event.key === "?") { event.preventDefault(); audio.play("select"); setShowControls(true); return; }
      if (event.code !== "Enter" || event.repeat || event.target instanceof HTMLButtonElement) return;
      event.preventDefault(); if (currentScreen === "loading") enterLobby(); else startFight();
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [audio, currentScreen, showControls, showSettings, enterLobby, startFight]);
  const fullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await root.current?.requestFullscreen(); }
    catch { setNotice("Fullscreen is unavailable in this frame. You can keep playing here."); }
  };
  useEffect(() => {
    padEvents.current = event => {
      if (currentScreen === "fight") { arenaPadEvents.current?.(event); return; }
      if (event.kind === "disconnect") return;
      audio.unlock();
      if (event.kind === "back" && (showControls || showSettings)) { releasePads(); setShowControls(false); setShowSettings(false); return; }
      if (event.kind === "help" && currentScreen === "lobby" && !showSettings) { releasePads(); setShowControls(value => !value); return; }
      if (root.current) controllerMenu(root.current, event.kind);
    };
    return () => { padEvents.current = () => {}; };
  }, [audio, currentScreen, showControls, showSettings, releasePads]);

  return <main ref={root} className={`game-shell screen-${currentScreen}`}>
    {currentScreen === "loading" && <section className="loading-screen" aria-label="DisFighters loading screen">
      <div className="loading-grid" /><div className="loading-glow" />
      <div className="loading-content"><span className="micro-label accent">AN ORIGINAL ARCADE RIVALRY</span>
        <h1 className="loading-title">DIS<span>FIGHTERS</span></h1><span className="loading-arabic" lang="ar">الحلبة تنتظرك</span>
        <div className="loading-progress" role="progressbar" aria-label="Preparing game assets" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(loaded / ASSET_TOTAL * 100)}><i style={{ width: `${loaded / ASSET_TOTAL * 100}%` }} /></div>
        <div className="loading-status"><span>{loadError ? "ARENA UNAVAILABLE" : ready ? "YOUR ARENA IS READY" : "PREPARING THE ARENA"}</span><span>{Math.round(loaded / ASSET_TOTAL * 100)}%</span></div>
        {loadError ? <><p className="load-error">Couldn't load the arena. Check your connection and try again.</p><button className="primary-button" onClick={() => setAttempt(value => value + 1)}>RETRY LOADING<GameIcon name="arrow" /></button></>
          : <button className="primary-button enter-button" disabled={!ready} onClick={enterLobby}>ENTER THE LOBBY<GameIcon name="arrow" /></button>}
        <small className="enter-hint">{ready && !loadError ? "or press ENTER / A / CROSS" : ""}</small>
      </div><div className="loading-bottom"><span>DISFIGHTERS · FIRST PLAYABLE</span><span>BUILT FOR THE RIVALRY</span></div>
    </section>}
    {currentScreen === "lobby" && onlineMode && <CompetitionLobby duel={duel} test={session?.kind === "development"} muted={muted} onMute={mute}
      onSettings={() => setShowSettings(true)} onHelp={() => setShowControls(true)} onFullscreen={() => void fullscreen()} onReady={startFight}
      onWatch={arena => { audio.unlock(); duel.act("watch", arena); setBrowsingArena(null); }} />}
    {currentScreen === "lobby" && !onlineMode && <section className="lobby-screen" aria-label="DisFighters game lobby">
      <CanvasScene /><div className="lobby-vignette" /><div className="lobby-scanlines" />
      <div className="lobby-top"><Wordmark /><span className="session-label"><i /> BROWSER TEST <span>LOCAL 1V1</span></span>
        <div className="game-tools"><button className="icon-button" aria-label={muted ? "Enable sound" : "Mute sound"} aria-pressed={muted} onClick={mute}><GameIcon name={muted ? "muted" : "sound"} /></button>
          <button className="icon-button" aria-label="Match settings" onClick={() => { audio.play("select"); setShowSettings(true); }}><GameIcon name="settings" /></button>
          <button className="icon-button fullscreen-button" aria-label="Toggle fullscreen" onClick={() => void fullscreen()}><GameIcon name="fullscreen" /></button></div>
      </div>
      <div className="lobby-headline"><span className="edition-label"><i /> 1V1 ARCADE FIGHTING</span><h1>EVERY<br />RIVALRY<br /><em>STARTS HERE.</em></h1><p>One arena. Two fighters.<br />Make the first move.</p><span className="headline-arabic" lang="ar">خصمان. حلبة واحدة.</span></div>
      <div className="arena-title"><span>THE ARENA</span><strong>CASBAH</strong><small>NIGHTFALL <i /> STAGE 01</small></div>
      <div className="versus-mark" aria-hidden="true">VS</div>
      <div className="lobby-bottom">
        {FIGHTERS.map((fighter, player) => <div key={fighter.name} className={`lobby-fighter-card player-${player}`}>
          <div className="fighter-card-top"><span className="player-chip">P{player + 1}</span><span>READY TO FIGHT</span><i /></div>
          <div className="fighter-card-name"><strong>{fighter.name.toUpperCase()}</strong><span lang="ar">{fighter.arabic}</span></div>
          <small>{fighter.title.toUpperCase()}</small><div className="fighter-card-controls"><kbd>{player === 0 ? "W A S D" : "↑ ← ↓ →"}</kbd><span>MOVE</span><kbd>{player === 0 ? "F / G" : "K / L"}</kbd><span>HIT / GUARD</span></div>
        </div>)}
        <div className="lobby-start"><span className="duel-rule">{rules.winsToMatch === 1 ? "QUICK DUEL" : `BEST OF ${rules.winsToMatch * 2 - 1}`} <i /> {rules.roundSeconds} SECOND ROUNDS</span><button className="primary-button fight-button" onClick={startFight}><span>START FIGHT<small>LOCAL TEST · TWO PLAYERS</small></span><GameIcon name="arrow" /></button>
          <button className="controls-button" onClick={() => { audio.play("select"); setShowControls(true); }}><GameIcon name="controls" /> HOW TO PLAY <kbd>?</kbd></button></div>
      </div>
      <div className="lobby-bottom-line"><span><i /> TEST PREVIEW · LOCAL PLAY</span><span>PLAY WITH FRIENDS INSIDE DISCORD</span><span>PROTOTYPE 0.3</span></div>
      {showControls && <ControlsDialog online={false} onClose={() => setShowControls(false)} />}
      {showSettings && <SettingsDialog online={false} settings={rules} onChange={setSettings} onClose={() => setShowSettings(false)} />}
    </section>}
    {currentScreen === "lobby" && onlineMode && showControls && <ControlsDialog online onClose={() => setShowControls(false)} />}
    {currentScreen === "lobby" && onlineMode && showSettings && <SettingsDialog online settings={rules} onChange={value => duel.act("settings", value)} onClose={() => setShowSettings(false)} />}
    {currentScreen === "fight" && <Arena audio={audio} onExit={returnLobby} muted={muted} onMute={mute} settings={rules} online={onlineMode ? duel : undefined}
      gamepads={gamepads} padEvents={arenaPadEvents}
      onBrowse={onlineMode ? () => { if (duel.state?.yourSlot !== null && duel.state?.match?.phase !== "match-over") duel.act("pause"); setBrowsingArena(duel.state?.arenaId ?? "hub"); } : undefined} />}
    {(notice || duel.notice) && <div className="game-notice" role="status">{notice || duel.notice}</div>}
    {(gamepads.devices.length > 0 || gamepads.error) && <div className={`controller-indicator ${currentScreen === "fight" ? "in-fight" : ""}`} role="status" aria-label="Controller status"><GameIcon name="gamepad" />
      <span>{gamepads.error || gamepads.devices.map(device => `${device.name} · ${!device.supported ? "UNSUPPORTED MAPPING" : device.player === null ? "STANDBY" : !device.armed ? "RELEASE CONTROLS" : onlineMode ? "YOU" : `P${device.player + 1}`}`).join(" / ")}</span>
    </div>}
  </main>;
}
