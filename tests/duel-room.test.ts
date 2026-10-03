import test from "node:test";
import assert from "node:assert/strict";
import { DuelRoom } from "../lib/game/duel-room.ts";
import type { DuelPeer } from "../lib/game/duel-room.ts";
import { emptyControls } from "../lib/game/engine.ts";

function peer(id: string, userId = id): DuelPeer {
  return { id, userId, name: `Player ${userId}`, emit() {}, close() {} };
}
function started() {
  const room = new DuelRoom(); room.join(peer("one"), 0); room.join(peer("two"), 0);
  room.ready("one"); room.ready("two"); room.match!.phase = "fighting";
  return room;
}
test("two distinct identities ready up; spectators cannot change rules, control fighters, or start a duel", () => {
  const room = new DuelRoom(); room.join(peer("one"), 0); room.join(peer("two"), 0); room.join(peer("viewer"), 0);
  assert.equal(room.snapshot("viewer").yourSlot, null);
  room.configure("two", { roundSeconds: 30, winsToMatch: 1 }); assert.equal(room.settings.roundSeconds, 60);
  room.configure("viewer", { roundSeconds: 30, winsToMatch: 1 }); assert.equal(room.settings.roundSeconds, 60);
  room.configure("one", { roundSeconds: 30, winsToMatch: 1 }); assert.equal(room.settings.roundSeconds, 30);
  room.ready("one"); room.ready("viewer"); assert.equal(room.match, null);
  room.ready("two"); assert.equal(room.match!.remaining, 30);
  room.pause("viewer"); assert.equal(room.paused, false);
  room.lobby("viewer"); assert.notEqual(room.match, null);
});
test("server inputs ignore stale sequences, old matches, forged slots, and malformed controls", () => {
  const room = started(); const x = room.match!.fighters[0].x;
  const controls = { ...emptyControls(), right: true };
  room.input("viewer", { seq: 1, matchId: room.matchId, controls }, 0);
  room.input("one", { seq: 1, matchId: room.matchId - 1, controls }, 0);
  room.input("one", { seq: 1, matchId: room.matchId, controls: { right: true } }, 0);
  room.tick(.05, 50); assert.equal(room.match!.fighters[0].x, x);
  room.input("one", { seq: 2, matchId: room.matchId, player: 1, userId: "two", controls }, 50);
  room.input("one", { seq: 1, matchId: room.matchId, controls: emptyControls() }, 50);
  room.tick(.05, 100); assert.ok(room.match!.fighters[0].x > x); assert.equal(room.match!.fighters[1].x, 894);
});
test("held movement expires without renewal; a rapid press and release still produces a punch", () => {
  const room = started(); room.match!.fighters[0].x = 550; room.match!.fighters[1].x = 690;
  room.input("one", { seq: 1, matchId: room.matchId, controls: { ...emptyControls(), attack: true } }, 0);
  room.input("one", { seq: 2, matchId: room.matchId, controls: emptyControls() }, 1);
  for (let i = 0; i < 20; i++) room.tick(.01, 2 + i * 10);
  assert.equal(room.match!.fighters[1].health, 88);
  room.input("one", { seq: 3, matchId: room.matchId, controls: { ...emptyControls(), left: true } }, 200);
  room.tick(.05, 220); const moved = room.match!.fighters[0].x;
  room.tick(.05, 600); assert.equal(room.match!.fighters[0].x, moved);
});
test("disconnect freezes a duel, reserves the same player's slot, and requires both players to resume", () => {
  const room = started(); room.leave("two", 100);
  const time = room.match!.remaining; room.tick(.1, 1000); assert.equal(room.match!.remaining, time); assert.equal(room.paused, true);
  room.join(peer("newcomer"), 1001); assert.equal(room.snapshot("newcomer").yourSlot, null);
  room.join(peer("two-returned", "two"), 1002); assert.equal(room.snapshot("two-returned").yourSlot, 1);
  room.ready("one"); assert.equal(room.paused, true); room.ready("two-returned"); assert.equal(room.paused, false);
  room.tick(.05, 1050); assert.ok(room.match!.remaining < time);
  room.leave("two-returned", 2000); room.tick(.05, 32001); assert.equal(room.match, null); assert.equal(room.slots[1], null);
  room.claim("newcomer", 32002); assert.equal(room.snapshot("newcomer").yourSlot, 1);
});
test("duplicate windows replace the connection without gaining another fighter or letting old disconnect eject the player", () => {
  const room = started(); let closed = false;
  room.slots[0]!.peer!.close = () => { closed = true; };
  room.join(peer("one-replacement", "one"), 100); assert.equal(closed, true);
  assert.equal(room.snapshot("one-replacement").yourSlot, 0); room.leave("one", 101);
  assert.equal(room.slots[0]!.peer!.id, "one-replacement"); assert.equal(room.paused, false);
});
test("a single player's pause and next-round vote cannot advance shared gameplay", () => {
  const room = started(); room.pause("one"); room.ready("one"); assert.equal(room.paused, true);
  room.ready("two"); assert.equal(room.paused, false);
  room.match!.phase = "round-over"; room.match!.score = [1, 0]; const id = room.matchId;
  room.ready("one"); assert.equal(room.match!.round, 1); room.ready("two"); assert.equal(room.match!.round, 2); assert.equal(room.matchId, id + 1);
});
