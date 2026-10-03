import type { Controls, GameEvent, Match, MatchSettings, Player } from "./engine";
export interface Identity { id: string; name: string; avatar: string | null }
export interface Seat { name: string; connected: boolean; ready: boolean; id?: string; avatar?: string | null }
export type GameMode = "pvp" | "tournament";
export interface ArenaSummary {
  id: string; label: string; round: number; players: [Identity | null, Identity | null];
  status: "waiting" | "ready" | "live" | "finished" | "bye";
  winnerId: string | null; score: [number, number]; sources: string[]; forfeit: boolean;
  ready: [boolean, boolean];
}
export interface CompetitionState {
  mode: GameMode; you: Identity; hostId: string | null;
  roster: (Identity & { connected: boolean; role: string; streak: number; wins: number })[];
  queue: Identity[]; queuePosition: number | null; streak: number;
  arenas: ArenaSummary[]; ownArenaId: string | null;
  tournament: { state: "registration" | "running" | "finished"; entrants: Identity[]; capacity: number; champion: Identity | null; registered: boolean };
  role: string; canChangeRules: boolean; transitionSeconds: number | null;
}
export interface DuelSnapshot {
  revision: number; matchId: number; match: Match | null; settings: MatchSettings;
  seats: [Seat | null, Seat | null]; yourSlot: Player | null;
  paused: boolean; pauseReason: string | null; events: GameEvent[];
  arenaId?: string; competition?: CompetitionState;
}
export interface InputPacket { seq: number; matchId: number; arenaId?: string; controls: Controls }

