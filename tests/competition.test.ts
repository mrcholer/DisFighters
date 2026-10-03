import test from "node:test";
import assert from "node:assert/strict";
import { ActivityCompetition } from "../lib/game/competition.ts";
import type { CompetitionArena } from "../lib/game/competition.ts";
import type { DuelPeer } from "../lib/game/duel-room.ts";
import { emptyControls, finishRound } from "../lib/game/engine.ts";

function peer(id: string, userId = id): DuelPeer {
  return { id, userId, name: `Discord ${userId}`, avatar: `https://cdn.discordapp.com/avatars/${userId}/test.png`, emit() {}, close() {} };
}
function activity(count = 4) {
  const game = new ActivityCompetition(); for (let i = 1; i <= count; i++) game.join(peer(String(i)), i);
  game.configure("1", { roundSeconds: 30, winsToMatch: 1 }); return game;
}
function pvp(game: ActivityCompetition) { return game.arenas.get(game.pvpId)!; }
function start(game: ActivityCompetition, arena: CompetitionArena) {
  for (const player of arena.players) game.ready(game.members.get(player!)!.peer!.id);
  assert.ok(arena.room!.match); arena.room!.match!.phase = "fighting";
}
function win(game: ActivityCompetition, arena: CompetitionArena, slot: 0 | 1, now: number) {
  start(game, arena); arena.room!.match!.fighters[slot === 0 ? 1 : 0].health = 0;
  finishRound(arena.room!.match!); game.tick(.05, now);
}
function tournament(count: number) {
  const game = activity(count); game.chooseMode("1", "tournament");
  // Registration order must not override original Activity join order.
  for (let i = count; i >= 1; i--) game.register(String(i)); game.startTournament("1"); return game;
}

test("join order assigns only two distinct Discord identities, with verified profiles and a host", () => {
  const game = activity(); const snapshot = game.snapshot("1")!;
  assert.deepEqual(snapshot.seats.map(seat => seat?.id), ["1", "2"]);
  assert.equal(snapshot.competition!.you.name, "Discord 1"); assert.match(snapshot.seats[0]!.avatar!, /cdn.discordapp.com/);
  assert.equal(snapshot.competition!.hostId, "1"); assert.equal(game.snapshot("3")!.yourSlot, null);
  assert.equal(game.snapshot("3")!.competition!.role, "SPECTATOR");
  let closed = false; game.members.get("1")!.peer!.close = () => { closed = true; };
  game.join(peer("replacement", "1"), 20); assert.equal(closed, true); game.leave("1", 21);
  assert.equal(game.snapshot("replacement")!.yourSlot, 0); assert.equal(game.members.size, 4);
  game.join({ ...peer("5"), avatar: "https://untrusted.example/avatar.png" }, 22);
  assert.equal(game.snapshot("5")!.competition!.you.avatar, null);
});
test("FIFO winner-stays queue rotates once after results, resets combat, and requeues the loser last", () => {
  const game = activity(); game.joinQueue("3"); game.joinQueue("4"); game.joinQueue("3");
  assert.deepEqual(game.queue, ["3", "4"]); const old = pvp(game); win(game, old, 0, 1000);
  assert.deepEqual(game.queue, ["3", "4", "2"]); assert.equal(game.snapshot("1")!.competition!.streak, 1);
  assert.equal(game.snapshot("1")!.competition!.role, "DEFENDING CHAMPION");
  game.withdraw("2"); game.joinQueue("2"); assert.deepEqual(game.queue, ["3", "4", "2"]);
  game.tick(.05, 6999); assert.equal(pvp(game).id, old.id);
  game.tick(.05, 7000); assert.deepEqual(pvp(game).players, ["1", "3"]);
  assert.deepEqual(game.queue, ["4", "2"]); assert.equal(pvp(game).room!.match, null);
  start(game, pvp(game)); assert.deepEqual(pvp(game).room!.match!.score, [0, 0]); assert.equal(pvp(game).room!.match!.fighters[1].health, 100);
  game.tick(.05, 7050); assert.equal(game.members.get("1")!.wins, 1);
});
test("voluntary seat release fills from the queue, spectators cannot jump it, and winners may leave between fights", () => {
  const game = activity(); game.joinQueue("3"); game.joinQueue("4", 0);
  game.withdraw("1"); assert.deepEqual(pvp(game).players, ["3", "2"]); assert.deepEqual(game.queue, ["4"]);
  game.withdraw("4"); assert.deepEqual(game.queue, []);
  win(game, pvp(game), 0, 1000); game.withdraw("3"); game.joinQueue("1"); game.tick(.05, 7000);
  assert.deepEqual(pvp(game).players, ["2", "1"]);
});
test("only the host changes modes and rules; ongoing fights lock both", () => {
  const game = activity(); game.chooseMode("2", "tournament"); assert.equal(game.mode, "pvp");
  game.configure("3", { roundSeconds: 90, winsToMatch: 3 }); assert.equal(game.settings.roundSeconds, 30);
  start(game, pvp(game)); game.chooseMode("1", "tournament"); game.configure("1", { roundSeconds: 90, winsToMatch: 3 });
  assert.equal(game.mode, "pvp"); assert.equal(game.settings.roundSeconds, 30);
  game.leave("1", 100); assert.equal(game.hostId, "2"); assert.equal(game.snapshot("2")!.competition!.canChangeRules, false);
});
test("tournament pairings run independently; waiting winners watch and then receive the final", () => {
  const game = tournament(4); const first = [...game.arenas.values()].filter(arena => arena.round === 1);
  assert.deepEqual(first.map(arena => arena.players), [["1", "4"], ["2", "3"]]);
  start(game, first[0]); start(game, first[1]); game.pause("1"); assert.equal(first[0].room!.paused, true); assert.equal(first[1].room!.paused, false);
  game.withdraw("4"); assert.equal(game.snapshot("1")!.competition!.role, "WAITING FOR NEXT MATCH");
  game.watch("1", first[1].id); assert.equal(game.snapshot("1")!.arenaId, first[1].id); assert.equal(game.snapshot("1")!.yourSlot, null);
  const x = first[1].room!.match!.fighters[0].x;
  game.input("1", { arenaId: first[1].id, matchId: 1, seq: 1, controls: { ...emptyControls(), right: true } }, 30);
  game.tick(.05, 50); assert.equal(first[1].room!.match!.fighters[0].x, x);
  game.withdraw("3"); const final = [...game.arenas.values()].at(-1)!;
  assert.deepEqual(final.players, ["1", "2"]); assert.equal(game.snapshot("1")!.competition!.ownArenaId, final.id);
  win(game, final, 1, 1000); assert.equal(game.tournamentState, "finished"); assert.equal(game.championId, "2");
  assert.equal(game.snapshot("2")!.competition!.role, "CHAMPION"); assert.equal(game.snapshot("1")!.competition!.role, "ELIMINATED");
  game.newTournament("3"); assert.equal(game.tournamentState, "finished"); game.newTournament("1"); assert.equal(game.entrants.size, 0);
});
test("3, 5, 8 and 16 entrants use byes fairly and yield exactly one champion", () => {
  for (const count of [3, 5, 8, 16]) {
    const game = tournament(count); const byes = [...game.arenas.values()].filter(arena => arena.bye);
    assert.equal(byes.length, 2 ** Math.ceil(Math.log2(count)) - count);
    let now = 100;
    while (game.tournamentState === "running") {
      const arena = [...game.arenas.values()].find(entry => entry.room && !entry.resolved)!;
      assert.ok(arena); win(game, arena, 0, now += 100);
    }
    assert.equal(game.championId, "1"); assert.equal([...game.members.values()].reduce((sum, member) => sum + member.wins, 0), count - 1);
  }
});
test("a fighting entrant cannot switch matches; input must target their own current arena and generation", () => {
  const game = tournament(4); const arenas = [...game.arenas.values()].filter(arena => arena.round === 1);
  start(game, arenas[0]); start(game, arenas[1]); game.watch("1", arenas[1].id);
  assert.equal(game.snapshot("1")!.arenaId, arenas[0].id);
  const controls = { ...emptyControls(), right: true }; const room = arenas[0].room!; const x = room.match!.fighters[0].x;
  game.input("1", { arenaId: arenas[1].id, matchId: room.matchId, seq: 1, controls }, 10);
  game.input("1", { arenaId: arenas[0].id, matchId: room.matchId - 1, seq: 1, controls }, 10);
  game.input("3", { arenaId: arenas[0].id, matchId: room.matchId, seq: 1, controls }, 10);
  game.tick(.05, 50); assert.equal(room.match!.fighters[0].x, x);
  game.input("1", { arenaId: arenas[0].id, matchId: room.matchId, seq: 2, controls }, 60);
  game.tick(.05, 100); assert.ok(room.match!.fighters[0].x > x);
});
test("reconnect reserves seats for 30 seconds; expiry forfeits only that bracket pairing", () => {
  const game = tournament(4); const arenas = [...game.arenas.values()].filter(arena => arena.round === 1);
  start(game, arenas[0]); start(game, arenas[1]); game.leave("4", 100);
  assert.equal(arenas[0].room!.paused, true); assert.equal(arenas[1].room!.paused, false);
  game.join(peer("4-back", "4"), 1000); assert.equal(game.snapshot("4-back")!.yourSlot, 1);
  game.ready("1"); game.ready("4-back"); assert.equal(arenas[0].room!.paused, false);
  game.leave("4-back", 2000); game.tick(.05, 31999); assert.equal(arenas[0].resolved, false);
  game.tick(.05, 32000); assert.equal(arenas[0].winnerId, "1"); assert.equal(arenas[0].forfeit, true);
  assert.equal(arenas[1].resolved, false); assert.equal(game.snapshot("1")!.competition!.role, "WAITING FOR NEXT MATCH");
});
test("both absent finalists produce no fabricated champion, and registration expires offline entries", () => {
  const game = tournament(2); start(game, [...game.arenas.values()][0]); game.leave("1", 100); game.leave("2", 100);
  game.tick(.05, 30100); assert.equal(game.tournamentState, "finished"); assert.equal(game.championId, null); assert.equal(game.empty, true);
  const registration = activity(2); registration.chooseMode("1", "tournament"); registration.register("1"); registration.register("2");
  registration.leave("2", 100); registration.tick(.05, 30100); assert.equal(registration.entrants.has("2"), false);
  registration.startTournament("1"); assert.equal(registration.tournamentState, "registration");
});
