import type { DuelController } from "@/lib/game/use-duel";
import { FIGHTERS } from "@/lib/game/engine";
import type { ArenaSummary, Identity } from "@/lib/game/protocol";
import { CanvasScene } from "./canvas-scene";
import { GameIcon, Wordmark } from "./game-ui";
import { PlayerAvatar } from "./player-avatar";

function Profile({ player, you, detail }: { player: Identity; you: string; detail?: string }) {
  return <div className="competition-profile"><PlayerAvatar player={player} /><div><strong>{player.name}</strong><small>{player.id === you ? "YOU · " : ""}{detail}</small></div></div>;
}

export default function CompetitionLobby({ duel, test, muted, onMute, onSettings, onHelp, onFullscreen, onWatch, onReady }: {
  duel: DuelController; test: boolean; muted: boolean; onMute: () => void; onSettings: () => void; onHelp: () => void;
  onFullscreen: () => void; onWatch: (arena: string) => void; onReady: () => void;
}) {
  const state = duel.state?.competition;
  const open = duel.status === "open";
  const own = state?.arenas.find(arena => arena.id === state.ownArenaId);
  const slot = own?.players.findIndex(player => player?.id === state?.you.id) ?? -1;
  const canReady = own?.status === "ready" || (own?.id === duel.state?.arenaId && (duel.state?.paused || duel.state?.match?.phase === "round-over"));
  const host = state?.hostId === state?.you.id;
  const pvp = state?.arenas[0];
  const defending = state?.role === "DEFENDING CHAMPION";
  const rounds = [...new Set(state?.arenas.map(arena => arena.round) ?? [])];
  const defaultWatch = state?.arenas.find(arena => arena.status === "live")?.id ?? state?.arenas.filter(arena => arena.status === "finished").at(-1)?.id;
  const watchable = (arena: ArenaSummary) => arena.status === "live" || arena.status === "finished";
  const renderMatch = (arena: ArenaSummary) => <article key={arena.id} className={`bracket-match ${arena.id === state?.ownArenaId ? "your-match" : ""}`}>
    <div className="match-card-label"><span>{arena.label}</span><span className={arena.status === "live" ? "live-label" : ""}>{arena.forfeit ? "FORFEIT" : arena.status.toUpperCase()}</span></div>
    {arena.players.map((player, index) => <div key={index} className={`bracket-player ${player?.id === arena.winnerId ? "bracket-winner" : ""}`}>
      {player ? <Profile player={player} you={state!.you.id} detail={player.id === arena.winnerId ? "WINNER" : `P${index + 1}`} /> : <span className="pending-player">{arena.status === "bye" ? "BYE" : "Awaiting qualifier"}</span>}<b>{arena.score[index]}</b>
    </div>)}
    <button data-controller-primary={arena.id === defaultWatch || undefined} className="secondary-button" disabled={!watchable(arena) || !open || (!!own && own.status === "live" && own.id !== arena.id)} onClick={() => onWatch(arena.id)}>{arena.id === state?.ownArenaId && arena.status === "live" ? "RETURN TO FIGHT" : "WATCH MATCH"}</button>
  </article>;

  return <section className="competition-screen" aria-label="DisFighters game lobby">
    <CanvasScene /><div className="competition-shade" />
    <header className="competition-top"><Wordmark /><span className="session-label"><i />{test ? "NETWORK TEST" : "DISCORD ACTIVITY"}</span>
      <div className="game-tools"><button className="icon-button" aria-label={muted ? "Enable sound" : "Mute sound"} aria-pressed={muted} onClick={onMute}><GameIcon name={muted ? "muted" : "sound"} /></button>
        <button className="icon-button" aria-label="Match settings" disabled={!state?.canChangeRules || !open} onClick={onSettings}><GameIcon name="settings" /></button>
        <button className="icon-button" aria-label="How to play" onClick={onHelp}><GameIcon name="controls" /></button>
        <button className="icon-button fullscreen-button" aria-label="Toggle fullscreen" onClick={onFullscreen}><GameIcon name="fullscreen" /></button></div>
    </header>
    {!state ? <div className="competition-connecting"><h1>JOINING THE ARENA…</h1><p>Connecting your Discord player to this Activity.</p></div> : <div className="competition-content">
      <div className="competition-heading"><div><span className="micro-label accent" lang="ar">الحلبة تجمعنا</span><h1>{state.mode === "pvp" ? "WINNER STAYS." : "ROAD TO THE FINAL."}</h1><p>{state.mode === "pvp" ? "Two fighters. One throne. The next challenger is waiting." : "Fight your bracket. Watch the rivalry. Become champion."}</p></div>
        <div className="your-profile" aria-label="Your Discord player"><Profile player={state.you} you={state.you.id} detail={state.role} /><span>{host ? "ACTIVITY HOST" : state.queuePosition ? `QUEUE #${state.queuePosition}` : state.streak ? `${state.streak} WIN STREAK` : "CASBAH · NIGHTFALL"}</span></div>
      </div>
      <div className="mode-strip"><div className="mode-options" aria-label="Game mode"><button aria-pressed={state.mode === "pvp"} disabled={!host || !state.canChangeRules || !open} onClick={() => duel.act("mode", "pvp")}>01 <strong>PVP</strong><small>WINNER STAYS</small></button><button aria-pressed={state.mode === "tournament"} disabled={!host || !state.canChangeRules || !open} onClick={() => duel.act("mode", "tournament")}>02 <strong>TOURNAMENT</strong><small>SINGLE ELIMINATION</small></button></div>
        <span className="duel-rule">FIRST TO {duel.state!.settings.winsToMatch} <i /> {duel.state!.settings.roundSeconds} SECOND ROUNDS</span>
      </div>
      {state.mode === "pvp" && pvp && <div className="pvp-layout"><div className="pvp-main"><div className="pvp-seats">{pvp.players.map((player, index) => <article className={`competition-seat player-${index}`} key={index}>
        <div className="match-card-label"><span className="player-chip">P{index + 1}</span><span>{player ? state.roster.find(entry => entry.id === player.id)?.connected ? pvp.ready[index] ? "READY" : "IN THE ARENA" : "RECONNECTING · 30s GRACE" : "OPEN SEAT"}</span></div>
        {player ? <><Profile player={player} you={state.you.id} detail={`${state.roster.find(entry => entry.id === player.id)?.streak ?? 0} WIN STREAK`} /><div className="assigned-player">{player.id === state.you.id ? "YOU · " : ""}{player.name}</div></> : <><h2>YOUR NEXT RIVAL</h2><p>Invite a friend to this Activity.</p><button className="secondary-button" disabled={!open || !!own || pvp.status === "finished"} onClick={() => duel.act("claim", index)}>TAKE P{index + 1} SEAT</button></>}
        <div className="character-identity"><span>{FIGHTERS[index].name.toUpperCase()}</span><span lang="ar">{FIGHTERS[index].arabic}</span><small>{FIGHTERS[index].title}</small></div>
      </article>)}</div>
        <div className="competition-actions">{own ? <><button className="primary-button" disabled={!open} onClick={canReady ? onReady : () => onWatch(own.id)}>{canReady ? own.ready[slot] ? "CANCEL READY" : duel.state?.paused ? "RESUME FIGHT" : "READY UP" : "RETURN TO FIGHT"}<GameIcon name="arrow" /></button><button className="text-button" onClick={() => duel.act("withdraw")}>{own.status === "live" ? "FORFEIT & WATCH" : "LEAVE SEAT"}</button></> : defending ? <><button className="primary-button" disabled>NEXT CHALLENGER · {state.transitionSeconds}s<GameIcon name="arrow" /></button><button className="text-button" onClick={() => duel.act("withdraw")}>LEAVE SEAT</button></> : <><button className="primary-button" disabled={!open || state.queuePosition !== null} onClick={() => duel.act("queue")}>{state.queuePosition ? `QUEUED · POSITION ${state.queuePosition}` : "JOIN QUEUE"}<GameIcon name="arrow" /></button>{state.queuePosition !== null && <button className="text-button" onClick={() => duel.act("withdraw")}>LEAVE QUEUE</button>}</>}
          {watchable(pvp) && <button className="secondary-button" onClick={() => onWatch(pvp.id)}>WATCH MATCH</button>}
        </div>
        <p className="competition-hint">{state.transitionSeconds !== null ? `Next challenger arrives in ${state.transitionSeconds}s. Both fighters ready up for a fresh duel.` : own ? "Both players ready up to fight. The winner keeps their seat; the loser goes to the back of the queue." : state.queuePosition ? "Your place is reserved. Watch the fight while you wait." : "Watch freely, or join the queue when you want to fight."}</p>
      </div><aside className="queue-panel"><div className="panel-title"><h2>NEXT CHALLENGERS</h2><span>{state.queue.length.toString().padStart(2, "0")}</span></div>
        {state.queue.length ? <ol className="challenger-list">{state.queue.map((player, index) => <li key={player.id}><b>{index + 1}</b><Profile player={player} you={state.you.id} detail={index === 0 ? "UP NEXT" : "WAITING"} /></li>)}</ol> : <p className="empty-list">The queue is open.<br />Be the next challenger.</p>}
      </aside></div>}
      {state.mode === "tournament" && state.tournament.state === "registration" && <div className="registration-layout"><div className="registration-intro"><span className="micro-label accent">2–16 FIGHTERS · ONE CHAMPION</span><h2>ENTER THE<br /><em>TOURNAMENT.</em></h2><p>Matches run together. Winners advance when their next opponent qualifies. Everyone can watch any available fight.</p>
        <button className="primary-button" disabled={!open} onClick={() => duel.act("register")}>{state.tournament.registered ? "WITHDRAW ENTRY" : "JOIN TOURNAMENT"}<GameIcon name="arrow" /></button>
        {host ? <button data-controller-primary={state.tournament.registered || undefined} className="secondary-button" disabled={!open || state.tournament.entrants.filter(player => state.roster.find(member => member.id === player.id)?.connected).length < 2} onClick={() => duel.act("tournament")}>START TOURNAMENT</button> : <p className="competition-hint">The Activity host starts when everyone is ready.</p>}
      </div><div className="registration-players"><div className="panel-title"><h2>THE FIGHTERS</h2><span>{state.tournament.entrants.length} / {state.tournament.capacity}</span></div><div className="entrant-grid">{state.tournament.entrants.map(player => <Profile key={player.id} player={player} you={state.you.id} detail={state.roster.find(member => member.id === player.id)?.connected ? "REGISTERED" : "RECONNECTING"} />)}</div>{!state.tournament.entrants.length && <p className="empty-list">Your name belongs here.<br />Join to enter the bracket.</p>}</div></div>}
      {state.mode === "tournament" && state.tournament.state !== "registration" && <>
        <div className="tournament-status">{state.tournament.state === "finished" ? <><span className="micro-label accent">TOURNAMENT COMPLETE</span><h2>{state.tournament.champion ? `${state.tournament.champion.name} IS THE CHAMPION.` : "NO CHAMPION · ALL FINALISTS WITHDREW"}</h2>{host && <button className="secondary-button" onClick={() => duel.act("new-tournament")}>NEW TOURNAMENT</button>}</> : own ? <><div><span className="micro-label accent">YOUR NEXT FIGHT</span><h2>{own.label} · {own.players.find(player => player?.id !== state.you.id)?.name ?? "WAITING FOR OPPONENT"}</h2></div><button className="primary-button" onClick={canReady ? onReady : () => onWatch(own.id)}>{canReady ? own.ready[slot] ? "CANCEL READY" : "READY UP" : "RETURN TO FIGHT"}<GameIcon name="arrow" /></button><button className="text-button" onClick={() => duel.act("withdraw")}>FORFEIT & WATCH</button></> : <><span className="micro-label accent">{state.role}</span><h2>{state.role === "WAITING FOR NEXT MATCH" ? "YOU ADVANCE. WATCH WHILE YOU WAIT." : "PICK A FIGHT TO WATCH."}</h2></>}</div>
        <div className="tournament-bracket" aria-label="Tournament bracket">{rounds.map(round => <section className="bracket-round" key={round}><h3>{round === rounds.at(-1) ? "THE FINAL" : `ROUND ${round}`}</h3>{state.arenas.filter(arena => arena.round === round).map(renderMatch)}</section>)}</div>
      </>}
      <div className="activity-roster"><div className="panel-title"><h2>IN THIS ACTIVITY</h2><span>{state.roster.filter(player => player.connected).length} ONLINE</span></div><div className="roster-list">{state.roster.map(player => <Profile key={player.id} player={player} you={state.you.id} detail={`${player.role} · ${player.wins} WINS`} />)}</div></div>
    </div>}
    {(duel.message || duel.status === "error" || duel.status === "closed") && <div className="lobby-connection-notice" role="status"><p>{duel.message || "Arena connection lost. Reconnect to return to this Activity."}</p><button className="secondary-button" onClick={duel.reconnect}>RECONNECT</button></div>}
    <footer className="competition-footer"><span><i /> {duel.status.toUpperCase()}</span><span>{state?.mode === "tournament" ? "LIVE BRACKET · CHOOSE YOUR MATCH" : "FAIR QUEUE · WINNER STAYS"}</span><span>DISFIGHTERS 0.3</span></footer>
  </section>;
}
