import { createMatch, normalizeSettings } from "./engine";
import type { MatchSettings, Player } from "./engine";
import { DuelRoom } from "./duel-room";
import type { DuelPeer } from "./duel-room";
import type { ArenaSummary, CompetitionState, DuelSnapshot, GameMode, Identity } from "./protocol";

interface Member { profile: Identity; peer: DuelPeer | null; order: number; disconnectedAt: number | null; watching: string | null; wins: number; streak: number; queueWish: boolean }
export interface CompetitionArena {
  id: string; label: string; round: number; players: [string | null, string | null];
  sources: string[]; room: DuelRoom | null; resolved: boolean; winnerId: string | null;
  bye: boolean; forfeit: boolean; completedAt: number | null;
}
const GRACE = 30_000;
const RESULT_DELAY = 6000;
const CAPACITY = 16;
function safeAvatar(value: string | null | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "cdn.discordapp.com" ? url.href : null; } catch { return null; }
}
function seedOrder(size: number): number[] {
  let order = [1, 2];
  for (let width = 4; width <= size; width *= 2) order = order.flatMap(seed => [seed, width + 1 - seed]);
  return order;
}

/** Owns one verified Discord Activity. Each bracket pairing has its own rule simulation. */
export class ActivityCompetition {
  readonly members = new Map<string, Member>();
  readonly arenas = new Map<string, CompetitionArena>();
  readonly peers = new Map<string, string>();
  readonly entrants = new Set<string>();
  queue: string[] = [];
  mode: GameMode = "pvp";
  settings: MatchSettings = normalizeSettings(null);
  hostId: string | null = null;
  tournamentState: "registration" | "running" | "finished" = "registration";
  championId: string | null = null;
  pvpId = "";
  private order = 0;
  private serial = 0;
  private revision = 0;
  private broadcastElapsed = 0;
  private now = 0;

  constructor() { this.createPvp([null, null], 0); }
  private identity(id: string | null): Identity | null { return id ? this.members.get(id)?.profile ?? null : null; }
  private member(id: string) { const userId = this.peers.get(id); return userId ? this.members.get(userId) ?? null : null; }
  private wrapped(peer: DuelPeer): DuelPeer { return { ...peer, emit() {}, close() {} }; }
  private notice(id: string, text: string) { this.member(id)?.peer?.emit("notice", text); }
  private ownArena(userId: string): CompetitionArena | null {
    return [...this.arenas.values()].find(arena => !arena.resolved && arena.players.includes(userId)) ?? null;
  }
  private busy() {
    return this.mode === "tournament" ? this.tournamentState === "running"
      : [...this.arenas.values()].some(arena => arena.room?.match && !arena.resolved);
  }
  private updateHost() {
    if (this.hostId && this.members.get(this.hostId)?.peer) return;
    this.hostId = [...this.members.values()].filter(member => member.peer).sort((a, b) => a.order - b.order)[0]?.profile.id ?? null;
  }
  join(peer: DuelPeer, now: number) {
    this.now = now; this.expire(now);
    let member = this.members.get(peer.userId);
    if (!member && this.members.size >= 128) { peer.close(1013, "Activity player capacity reached"); return; }
    if (!member) {
      member = { profile: { id: peer.userId, name: peer.name.slice(0, 32), avatar: safeAvatar(peer.avatar) }, peer: null,
        order: this.order++, disconnectedAt: null, watching: null, wins: 0, streak: 0, queueWish: false };
      this.members.set(peer.userId, member);
    }
    const previous = member.peer;
    member.profile = { id: peer.userId, name: peer.name.slice(0, 32), avatar: safeAvatar(peer.avatar) };
    member.peer = peer; member.disconnectedAt = null; this.peers.set(peer.id, peer.userId);
    if (previous && previous.id !== peer.id) { this.peers.delete(previous.id); previous.emit("replaced", "This player connected in another window."); previous.close(4001, "Player already connected"); }
    this.updateHost();
    const own = this.ownArena(peer.userId);
    if (own?.room) own.room.join(this.wrapped(peer), now, own.players.indexOf(peer.userId) as Player);
    else if (this.mode === "pvp") {
      const arena = this.arenas.get(this.pvpId)!;
      if (arena.players.some(id => id === null) && this.queue.length === 0) this.seatPvp(peer.userId, arena.players.indexOf(null) as Player, now);
      else if (member.queueWish) this.enqueue(peer.userId);
      this.fillPvp(now);
    }
    if (!member.watching || !this.arenas.has(member.watching)) member.watching = this.ownArena(peer.userId)?.id ?? this.defaultWatch();
    this.broadcast();
  }
  leave(id: string, now: number) {
    const member = this.member(id); this.peers.delete(id);
    if (!member || member.peer?.id !== id) return;
    member.peer = null; member.disconnectedAt = now;
    this.queue = this.queue.filter(userId => userId !== member.profile.id);
    this.ownArena(member.profile.id)?.room?.leave(id, now); this.updateHost(); this.broadcast();
  }
  private createArena(id: string, label: string, round: number, players: [string | null, string | null], sources: string[], now: number): CompetitionArena {
    const room = new DuelRoom(true); room.settings = { ...this.settings };
    const arena: CompetitionArena = { id, label, round, players, sources, room, resolved: false, winnerId: null, bye: false, forfeit: false, completedAt: null };
    this.arenas.set(id, arena);
    for (const [slot, userId] of players.entries()) {
      const member = userId ? this.members.get(userId) : null;
      if (member?.peer) { room.join(this.wrapped(member.peer), now, slot as Player); member.watching = id; }
    }
    return arena;
  }
  private createPvp(players: [string | null, string | null], now: number) {
    const old = this.arenas.get(this.pvpId);
    if (old) this.arenas.delete(old.id);
    this.pvpId = `pvp-${++this.serial}`;
    this.createArena(this.pvpId, "WINNER STAYS", 1, players, [], now);
    for (const member of this.members.values()) member.watching = this.pvpId;
  }
  private seatPvp(userId: string, slot: Player, now: number) {
    const arena = this.arenas.get(this.pvpId)!;
    if (arena.room?.match || arena.players[slot] !== null || arena.players.includes(userId)) return;
    const players = [...arena.players] as [string | null, string | null]; players[slot] = userId;
    this.members.get(userId)!.queueWish = true; this.queue = this.queue.filter(id => id !== userId);
    this.createPvp(players, now);
  }
  private enqueue(userId: string) {
    const member = this.members.get(userId);
    const arena = this.arenas.get(this.pvpId);
    if (member?.peer && !this.queue.includes(userId) && !this.ownArena(userId) && arena?.winnerId !== userId) this.queue.push(userId);
  }
  private fillPvp(now: number) {
    const arena = this.arenas.get(this.pvpId)!;
    if (arena.room?.match) return;
    for (const slot of [0, 1] as const) if (this.arenas.get(this.pvpId)!.players[slot] === null) {
      let next = this.queue.shift(); while (next && (!this.members.get(next)?.peer || this.arenas.get(this.pvpId)!.players.includes(next))) next = this.queue.shift();
      if (next) this.seatPvp(next, slot, now);
    }
  }
  configure(id: string, data: unknown) {
    const member = this.member(id); if (member?.profile.id !== this.hostId || this.busy()) return;
    this.settings = normalizeSettings(data);
    for (const arena of this.arenas.values()) if (arena.room && !arena.room.match) { arena.room.settings = { ...this.settings }; for (const slot of arena.room.slots) if (slot) slot.ready = false; }
    this.broadcast();
  }
  chooseMode(id: string, data: unknown) {
    const member = this.member(id);
    if (member?.profile.id !== this.hostId || (data !== "pvp" && data !== "tournament") || this.mode === data) return;
    if (this.busy()) { this.notice(id, "Finish the current competition before changing modes."); return; }
    this.mode = data; this.arenas.clear(); this.entrants.clear(); this.queue = []; this.championId = null; this.tournamentState = "registration";
    for (const entry of this.members.values()) { entry.watching = null; entry.queueWish = false; }
    if (data === "pvp") {
      const first = [...this.members.values()].filter(entry => entry.peer).sort((a, b) => a.order - b.order).slice(0, 2);
      first.forEach(entry => { entry.queueWish = true; });
      this.createPvp([first[0]?.profile.id ?? null, first[1]?.profile.id ?? null], this.now);
    }
    this.broadcast();
  }
  joinQueue(id: string, seat?: unknown) {
    const member = this.member(id); if (!member || this.mode !== "pvp") return;
    member.queueWish = true;
    const arena = this.arenas.get(this.pvpId)!;
    if (!this.ownArena(member.profile.id) && this.queue.length === 0 && (seat === 0 || seat === 1) && arena.players[seat] === null && !arena.room?.match) this.seatPvp(member.profile.id, seat, this.now);
    else this.enqueue(member.profile.id);
    this.fillPvp(this.now); this.broadcast();
  }
  register(id: string) {
    const member = this.member(id); if (!member || this.mode !== "tournament" || this.tournamentState !== "registration") return;
    if (this.entrants.has(member.profile.id)) this.entrants.delete(member.profile.id);
    else if (this.entrants.size < CAPACITY) this.entrants.add(member.profile.id);
    else this.notice(id, "This tournament is full. You can still watch every match.");
    this.broadcast();
  }
  startTournament(id: string) {
    const member = this.member(id); if (member?.profile.id !== this.hostId || this.mode !== "tournament" || this.tournamentState !== "registration") return;
    const entrants = [...this.entrants].map(userId => this.members.get(userId)!).filter(entry => entry?.peer).sort((a, b) => a.order - b.order);
    if (entrants.length < 2) { this.notice(id, "At least two connected players must join the tournament."); return; }
    this.entrants.clear(); entrants.forEach(entry => this.entrants.add(entry.profile.id));
    this.arenas.clear(); this.tournamentState = "running";
    const generation = ++this.serial; const size = 2 ** Math.ceil(Math.log2(entrants.length)); const seeds = seedOrder(size);
    let previous: string[] = [];
    for (let round = 1, count = size / 2; count >= 1; round++, count /= 2) {
      const current: string[] = [];
      for (let index = 0; index < count; index++) {
        const arenaId = `t${generation}-r${round}-m${index + 1}`;
        const label = count === 1 ? "FINAL" : count === 2 ? `SEMIFINAL ${index + 1}` : `ROUND ${round} · MATCH ${index + 1}`;
        const players: [string | null, string | null] = round === 1 ? [entrants[seeds[index * 2] - 1]?.profile.id ?? null, entrants[seeds[index * 2 + 1] - 1]?.profile.id ?? null] : [null, null];
        const sources = round === 1 ? [] : [previous[index * 2], previous[index * 2 + 1]];
        this.arenas.set(arenaId, { id: arenaId, label, round, players, sources, room: null, resolved: false, winnerId: null, bye: false, forfeit: false, completedAt: null });
        current.push(arenaId);
      }
      previous = current;
    }
    this.progressBracket(this.now); this.broadcast();
  }
  newTournament(id: string) {
    if (this.member(id)?.profile.id !== this.hostId || this.tournamentState !== "finished") return;
    this.arenas.clear(); this.entrants.clear(); this.championId = null; this.tournamentState = "registration";
    for (const member of this.members.values()) member.watching = null; this.broadcast();
  }
  private progressBracket(now: number) {
    for (const arena of this.arenas.values()) {
      if (arena.resolved || arena.room) continue;
      if (arena.sources.length) {
        const sources = arena.sources.map(source => this.arenas.get(source)!);
        if (!sources.every(source => source.resolved)) continue;
        arena.players = [sources[0].winnerId, sources[1].winnerId];
      }
      if (arena.players.some(player => player === null)) { arena.resolved = true; arena.bye = true; arena.winnerId = arena.players.find(Boolean) ?? null; arena.completedAt = now; }
      else {
        const created = this.createArena(arena.id, arena.label, arena.round, arena.players, arena.sources, now);
        for (const userId of created.players) this.members.get(userId!)?.peer?.emit("notice", `Your ${created.label.toLowerCase()} is ready. Ready up when you're prepared.`);
      }
    }
    const final = [...this.arenas.values()].at(-1);
    if (final?.resolved) { this.tournamentState = "finished"; this.championId = final.winnerId; }
  }
  ready(id: string) {
    const member = this.member(id); if (!member) return;
    const arena = this.ownArena(member.profile.id); if (!arena?.room || arena.resolved) return;
    if (arena.room.match?.phase === "match-over") return;
    arena.room.ready(id);
    if (arena.room.match && !arena.room.paused) for (const userId of arena.players) { const player = this.members.get(userId!); if (player) player.watching = arena.id; }
    this.broadcast();
  }
  input(id: string, data: unknown, now: number) {
    const member = this.member(id); const arena = member ? this.ownArena(member.profile.id) : null;
    if (!arena?.room || !data || typeof data !== "object" || (data as { arenaId?: unknown }).arenaId !== arena.id) return;
    arena.room.input(id, data, now);
  }
  pause(id: string) { const member = this.member(id); if (member) { this.ownArena(member.profile.id)?.room?.pause(id); this.broadcast(); } }
  watch(id: string, data: unknown) {
    const member = this.member(id); if (!member || typeof data !== "string" || !this.arenas.has(data)) return;
    const own = this.ownArena(member.profile.id);
    if (own?.room?.match && own.room.match.phase !== "match-over" && data !== own.id) { this.notice(id, "Finish your fight before switching to another match."); return; }
    member.watching = data; this.broadcast();
  }
  withdraw(id: string) {
    const member = this.member(id); if (!member) return;
    member.queueWish = false; this.queue = this.queue.filter(userId => userId !== member.profile.id);
    if (this.mode === "tournament" && this.tournamentState === "registration") this.entrants.delete(member.profile.id);
    const arena = this.ownArena(member.profile.id);
    if (arena) {
      const opponent = arena.players.find(userId => userId && userId !== member.profile.id) ?? null;
      if (this.mode === "pvp" && !arena.room?.match) {
        const players = arena.players.map(userId => userId === member.profile.id ? null : userId) as [string | null, string | null];
        this.createPvp(players, this.now); this.fillPvp(this.now);
      } else this.finish(arena, opponent, true, this.now);
    }
    this.broadcast();
  }
  private finish(arena: CompetitionArena, winnerId: string | null, forfeit: boolean, now: number) {
    if (arena.resolved) return;
    arena.resolved = true; arena.winnerId = winnerId; arena.completedAt = now; arena.forfeit = forfeit;
    if (forfeit && arena.room) {
      const match = arena.room.match ?? createMatch(this.settings); arena.room.match = match;
      match.phase = "match-over"; match.winner = winnerId ? arena.players.indexOf(winnerId) as Player : "draw";
      match.score = winnerId ? [match.winner === 0 ? this.settings.winsToMatch : 0, match.winner === 1 ? this.settings.winsToMatch : 0] : [0, 0];
      arena.room.paused = false; arena.room.pauseReason = null;
    }
    if (winnerId) { const winner = this.members.get(winnerId)!; winner.wins++; if (this.mode === "pvp") winner.streak++; }
    for (const userId of arena.players) if (userId && userId !== winnerId) {
      const loser = this.members.get(userId)!; loser.streak = 0;
      if (this.mode === "pvp" && loser.peer && loser.queueWish && !this.queue.includes(userId)) this.queue.push(userId);
    }
    if (this.mode === "tournament") this.progressBracket(now);
  }
  private rotatePvp(now: number) {
    const arena = this.arenas.get(this.pvpId)!;
    if (!arena.resolved || now - arena.completedAt! < RESULT_DELAY) return;
    const member = arena.winnerId ? this.members.get(arena.winnerId) : null;
    const winner = member?.peer && member.queueWish ? arena.winnerId : null;
    const slot = winner ? arena.players.indexOf(winner) as Player : 0;
    const players: [string | null, string | null] = [null, null]; if (winner) players[slot] = winner;
    this.createPvp(players, now); this.fillPvp(now);
  }
  private expire(now: number) {
    for (const arena of this.arenas.values()) {
      if (arena.resolved) continue;
      const absent = arena.players.filter(userId => { const member = userId ? this.members.get(userId) : null; return member && !member.peer && member.disconnectedAt !== null && now - member.disconnectedAt >= GRACE; });
      if (!absent.length) continue;
      for (const userId of absent) this.members.get(userId!)!.queueWish = false;
      const winner = arena.players.find(userId => userId && !absent.includes(userId) && this.members.get(userId)?.peer) ?? null;
      if (this.mode === "pvp" && !arena.room?.match) {
        const players = arena.players.map(userId => absent.includes(userId) ? null : userId) as [string | null, string | null]; this.createPvp(players, now); this.fillPvp(now);
      } else this.finish(arena, winner, true, now);
    }
    if (this.tournamentState === "registration") for (const userId of this.entrants) {
      const member = this.members.get(userId)!; if (!member.peer && member.disconnectedAt !== null && now - member.disconnectedAt >= GRACE) this.entrants.delete(userId);
    }
  }
  tick(elapsed: number, now: number) {
    this.now = now; this.expire(now);
    for (const arena of this.arenas.values()) if (arena.room && !arena.resolved) {
      arena.room.tick(elapsed, now);
      if (arena.room.match?.phase === "match-over") {
        const score = arena.room.match.score; const winner = score[0] > score[1] ? 0 : 1; this.finish(arena, arena.players[winner], false, now);
      }
    }
    if (this.mode === "pvp") this.rotatePvp(now);
    this.broadcastElapsed += elapsed;
    if (this.broadcastElapsed >= .05) { this.broadcastElapsed = 0; this.broadcast(); }
  }
  private defaultWatch() { return [...this.arenas.values()].find(arena => arena.room?.match && !arena.resolved)?.id ?? [...this.arenas.keys()][0] ?? null; }
  private role(member: Member) {
    if (!member.peer) return "OFFLINE";
    if (this.ownArena(member.profile.id)) return "FIGHTER";
    if (this.mode === "pvp") {
      if (this.arenas.get(this.pvpId)?.winnerId === member.profile.id && member.queueWish) return "DEFENDING CHAMPION";
      return this.queue.includes(member.profile.id) ? "QUEUED" : "SPECTATOR";
    }
    if (!this.entrants.has(member.profile.id)) return "SPECTATOR";
    if (this.tournamentState === "registration") return "REGISTERED";
    if (this.championId === member.profile.id) return "CHAMPION";
    const lost = [...this.arenas.values()].some(arena => arena.resolved && !arena.bye && arena.players.includes(member.profile.id) && arena.winnerId !== member.profile.id);
    return lost ? "ELIMINATED" : "WAITING FOR NEXT MATCH";
  }
  private summary(arena: CompetitionArena): ArenaSummary {
    return { id: arena.id, label: arena.label, round: arena.round, players: arena.players.map(id => this.identity(id)) as ArenaSummary["players"], sources: arena.sources,
      status: arena.resolved ? arena.bye ? "bye" : "finished" : arena.room?.match ? "live" : arena.room ? "ready" : "waiting",
      winnerId: arena.winnerId, score: arena.room?.match?.score ?? [0, 0], forfeit: arena.forfeit,
      ready: [arena.room?.slots[0]?.ready ?? false, arena.room?.slots[1]?.ready ?? false] };
  }
  snapshot(id: string): DuelSnapshot | null {
    const member = this.member(id); if (!member) return null;
    const arena = this.arenas.get(member.watching ?? "") ?? this.arenas.get(this.defaultWatch() ?? "");
    const own = this.ownArena(member.profile.id);
    const base = arena?.room?.snapshot(id);
    const seats = (arena?.players ?? [null, null]).map((userId, slot) => {
      const entry = userId ? this.members.get(userId) : null;
      return entry ? { ...entry.profile, connected: entry.peer !== null, ready: base?.seats[slot]?.ready ?? false } : null;
    }) as DuelSnapshot["seats"];
    const pvp = this.arenas.get(this.pvpId);
    const competition: CompetitionState = { mode: this.mode, you: member.profile, hostId: this.hostId, role: this.role(member), ownArenaId: own?.id ?? null,
      roster: [...this.members.values()].sort((a, b) => a.order - b.order).map(entry => ({ ...entry.profile, connected: entry.peer !== null, role: this.role(entry), streak: entry.streak, wins: entry.wins })),
      queue: this.queue.map(userId => this.identity(userId)!).filter(Boolean), queuePosition: this.queue.includes(member.profile.id) ? this.queue.indexOf(member.profile.id) + 1 : null,
      streak: member.streak, arenas: [...this.arenas.values()].map(entry => this.summary(entry)), canChangeRules: member.profile.id === this.hostId && !this.busy(),
      transitionSeconds: this.mode === "pvp" && pvp?.resolved ? Math.max(0, Math.ceil((RESULT_DELAY - (this.now - pvp.completedAt!)) / 1000)) : null,
      tournament: { state: this.tournamentState, entrants: [...this.entrants].map(userId => this.identity(userId)!).filter(Boolean), capacity: CAPACITY,
        champion: this.identity(this.championId), registered: this.entrants.has(member.profile.id) } };
    return { revision: this.revision, matchId: base?.matchId ?? 0, match: base?.match ?? null, settings: { ...this.settings }, seats,
      yourSlot: arena?.resolved ? null : base?.yourSlot ?? null, paused: base?.paused ?? false, pauseReason: base?.pauseReason ?? null,
      events: base?.events ?? [], arenaId: arena?.id, competition };
  }
  broadcast() {
    this.revision++; for (const member of this.members.values()) if (member.peer) member.peer.emit("snapshot", this.snapshot(member.peer.id));
    for (const arena of this.arenas.values()) arena.room?.drainEvents();
  }
  get empty() { return [...this.members.values()].every(member => !member.peer && member.disconnectedAt !== null && this.now - member.disconnectedAt >= GRACE); }
}
