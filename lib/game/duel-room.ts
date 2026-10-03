import { createMatch, emptyControls, nextRound, normalizeSettings, STEP, stepMatch } from "./engine";
import type { Controls, GameEvent, Match, MatchSettings, Player } from "./engine";
import type { DuelSnapshot } from "./protocol";

export interface DuelPeer { id: string; userId: string; name: string; avatar?: string | null; emit: (event: string, data: unknown) => void; close: (code: number, reason: string) => void }
interface Slot { userId: string; name: string; avatar: string | null; peer: DuelPeer | null; ready: boolean; disconnectedAt: number | null;
  controls: Controls; lastInputAt: number; seq: number; attackEdge: boolean; jumpEdge: boolean }
const ACTIONS = ["left", "right", "jump", "crouch", "attack", "block"] as const;
const RECONNECT_GRACE = 30_000;

/** A room has no client-selected identity. The socket route supplies verified peers. */
export class DuelRoom {
  readonly peers = new Map<string, DuelPeer>();
  readonly slots: [Slot | null, Slot | null] = [null, null];
  settings: MatchSettings = normalizeSettings(null);
  match: Match | null = null;
  paused = false;
  pauseReason: string | null = null;
  revision = 0;
  matchId = 0;
  private accumulator = 0;
  private broadcastElapsed = 0;
  private events: GameEvent[] = [];
  constructor(private readonly managed = false) {}

  join(peer: DuelPeer, now: number, preferred?: Player) {
    this.expireSeats(now);
    const existing = this.slots.findIndex(slot => slot?.userId === peer.userId);
    const vacancy = preferred !== undefined && this.slots[preferred] === null ? preferred : this.slots.findIndex(slot => slot === null);
    const index = existing >= 0 ? existing : this.match === null ? vacancy : -1;
    this.peers.set(peer.id, peer);
    if (index >= 0) {
      const previous = this.slots[index];
      const previousPeer = previous?.peer;
      this.slots[index] = { userId: peer.userId, name: peer.name.slice(0, 32), avatar: peer.avatar ?? null, peer, ready: false, disconnectedAt: null,
        controls: emptyControls(), lastInputAt: now, seq: -1, attackEdge: false, jumpEdge: false };
      if (previousPeer && previousPeer.id !== peer.id) {
        this.peers.delete(previousPeer.id); previousPeer.emit("replaced", "This player connected in another window."); previousPeer.close(4001, "Player already connected");
      }
      if (existing >= 0 && this.match && this.paused) this.pauseReason = "Both players must ready up to resume.";
    }
    this.broadcast();
  }
  leave(id: string, now: number) {
    this.peers.delete(id);
    const slot = this.slots.find(slot => slot?.peer?.id === id);
    if (!slot) return;
    slot.peer = null; slot.disconnectedAt = now; slot.controls = emptyControls(); slot.attackEdge = false; slot.jumpEdge = false;
    if (this.match !== null) this.setPaused("Opponent disconnected. Waiting up to 30 seconds for reconnection.");
    else if (!this.managed) this.slots[this.slots.indexOf(slot)] = null;
    this.broadcast();
  }
  private owner(id: string) { return this.slots.find(slot => slot?.peer?.id === id) ?? null; }
  claim(id: string, now: number) { const peer = this.peers.get(id); if (peer && !this.owner(id) && this.match === null) this.join(peer, now); }
  private clearControls() {
    for (const slot of this.slots) if (slot) { slot.controls = emptyControls(); slot.attackEdge = false; slot.jumpEdge = false; }
    for (const fighter of this.match?.fighters ?? []) { fighter.wasAttackDown = false; fighter.wasJumpDown = false; }
    this.accumulator = 0;
  }
  private setPaused(reason: string) {
    this.paused = true; this.pauseReason = reason; this.clearControls();
    for (const slot of this.slots) if (slot) slot.ready = false;
  }
  input(id: string, data: unknown, now: number) {
    const slot = this.owner(id);
    if (!slot || !this.match || this.paused || !data || typeof data !== "object") return;
    const packet = data as Record<string, unknown>;
    if (!Number.isSafeInteger(packet.seq) || (packet.seq as number) <= slot.seq || (packet.seq as number) < 0 || packet.matchId !== this.matchId) return;
    const controls = packet.controls as Record<string, unknown> | undefined;
    if (!controls || typeof controls !== "object" || !ACTIONS.every(action => typeof controls[action] === "boolean")) return;
    slot.seq = packet.seq as number; slot.lastInputAt = now;
    slot.attackEdge ||= controls.attack === true && !slot.controls.attack;
    slot.jumpEdge ||= controls.jump === true && !slot.controls.jump;
    slot.controls = Object.fromEntries(ACTIONS.map(action => [action, controls[action]])) as Controls;
  }
  configure(id: string, data: unknown) {
    if (this.slots[0]?.peer?.id !== id || this.match !== null) return;
    this.settings = normalizeSettings(data); for (const slot of this.slots) if (slot) slot.ready = false;
    this.broadcast();
  }
  ready(id: string) {
    const slot = this.owner(id); if (!slot) return;
    if (this.match !== null && !this.paused && this.match.phase !== "round-over" && this.match.phase !== "match-over") return;
    slot.ready = !slot.ready;
    if (this.slots.every(slot => slot?.peer && slot.ready)) {
      if (this.match === null || this.match.phase === "match-over") { this.match = createMatch(this.settings); this.matchId++; }
      else if (this.match.phase === "round-over") { this.match = nextRound(this.match); this.matchId++; }
      this.paused = false; this.pauseReason = null; this.clearControls();
      for (const player of this.slots) if (player) player.ready = false;
    }
    this.broadcast();
  }
  pause(id: string) { if (this.owner(id) && this.match && !this.paused) { this.setPaused("A player paused. Both players must ready up to resume."); this.broadcast(); } }
  lobby(id: string) { if (!this.owner(id)) return; this.resetMatch(); this.broadcast(); }
  private resetMatch() {
    this.match = null; this.matchId++; this.paused = false; this.pauseReason = null; this.events = []; this.clearControls();
    for (const slot of this.slots) if (slot) slot.ready = false;
  }
  private expireSeats(now: number) {
    if (this.managed) return;
    let expired = false;
    for (const player of [0, 1] as const) {
      const slot = this.slots[player];
      if (slot?.disconnectedAt !== null && slot?.disconnectedAt !== undefined && now - slot.disconnectedAt >= RECONNECT_GRACE) { this.slots[player] = null; expired = true; }
    }
    if (expired) { this.resetMatch(); this.broadcast(); }
  }
  tick(elapsed: number, now: number) {
    this.expireSeats(now);
    this.broadcastElapsed += elapsed;
    if (this.match && !this.paused && this.slots.every(slot => slot?.peer)) {
      this.accumulator += Math.min(Math.max(elapsed, 0), .1);
      while (this.accumulator >= STEP) {
        const inputs = this.slots.map((slot, index) => {
          if (!slot || now - slot.lastInputAt > 350) { if (slot) { slot.controls = emptyControls(); slot.attackEdge = false; slot.jumpEdge = false; } return emptyControls(); }
          const controls = { ...slot.controls };
          if (slot.attackEdge) { controls.attack = true; this.match!.fighters[index].wasAttackDown = false; }
          if (slot.jumpEdge) { controls.jump = true; this.match!.fighters[index].wasJumpDown = false; }
          slot.attackEdge = false; slot.jumpEdge = false; return controls;
        }) as [Controls, Controls];
        stepMatch(this.match, inputs, STEP); this.events.push(...this.match.events);
        this.accumulator -= STEP;
      }
    }
    if (this.broadcastElapsed >= .05) { this.broadcastElapsed = 0; this.broadcast(); }
  }
  snapshot(id: string): DuelSnapshot {
    const index = this.slots.findIndex(slot => slot?.peer?.id === id);
    return { revision: this.revision, matchId: this.matchId, match: this.match, settings: { ...this.settings },
      seats: this.slots.map(slot => slot ? { id: slot.userId, name: slot.name, avatar: slot.avatar, connected: slot.peer !== null, ready: slot.ready } : null) as DuelSnapshot["seats"],
      yourSlot: index < 0 ? null : index as Player, paused: this.paused, pauseReason: this.pauseReason, events: this.events };
  }
  broadcast() {
    this.revision++;
    if (!this.managed) { for (const peer of this.peers.values()) peer.emit("snapshot", this.snapshot(peer.id)); this.events = []; }
  }
  drainEvents() { this.events = []; }
  get empty() { return this.peers.size === 0 && this.slots.every(slot => slot === null); }
}
