import test from "node:test";
import assert from "node:assert/strict";
import { createMatch, emptyControls, finishRound, nextRound, normalizeSettings, SHIELD, STEP, stepMatch, WORLD } from "../lib/game/engine.ts";
import type { Controls, Match } from "../lib/game/engine.ts";

function advance(match: Match, seconds: number, one: Partial<Controls> = {}, two: Partial<Controls> = {}) {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) stepMatch(match, [{ ...emptyControls(), ...one }, { ...emptyControls(), ...two }], STEP);
}
function fighting(close = false) {
  const match = createMatch(); match.phase = "fighting";
  if (close) { match.fighters[0].x = 550; match.fighters[1].x = 690; }
  return match;
}
test("countdown prevents early movement and hits", () => {
  const match = createMatch(); const x = match.fighters[0].x;
  advance(match, 2, { right: true, attack: true });
  assert.equal(match.phase, "countdown"); assert.equal(match.fighters[0].x, x); assert.equal(match.fighters[1].health, 100);
  advance(match, 1.1); assert.equal(match.phase, "fighting");
});
test("movement stays in bounds and push boxes cannot overlap at a wall", () => {
  const match = fighting(); advance(match, 10, { left: true }, { right: true });
  assert.equal(match.fighters[0].x, WORLD.left); assert.equal(match.fighters[1].x, WORLD.right);
  match.fighters[1].x = WORLD.left + 100;
  advance(match, 1, {}, { left: true });
  assert.ok(match.fighters[1].x - match.fighters[0].x >= 93.99);
});
test("a punch hits only once per press and does not hit from across the arena", () => {
  const distant = fighting(); advance(distant, .8, { attack: true }); assert.equal(distant.fighters[1].health, 100);
  const match = fighting(true); advance(match, 1, { attack: true }); assert.equal(match.fighters[1].health, 88);
  advance(match, .5, { attack: true }); assert.equal(match.fighters[1].health, 88);
  advance(match, .1); match.fighters[0].x = match.fighters[1].x - 140;
  advance(match, .4, { attack: true }); assert.equal(match.fighters[1].health, 76);
});
test("guard absorbs high attacks; low attacks require a crouching guard", () => {
  const guarded = fighting(true); advance(guarded, .35, { attack: true }, { block: true });
  assert.equal(guarded.fighters[1].health, 100);
  const low = fighting(true); advance(low, .35, { crouch: true, attack: true }, { block: true });
  assert.equal(low.fighters[1].health, 88);
  const lowGuard = fighting(true); advance(lowGuard, .35, { crouch: true, attack: true }, { crouch: true, block: true });
  assert.equal(lowGuard.fighters[1].health, 100);
  assert.equal(guarded.fighters[1].shield, 75);
});
test("four blocked hits break guard, leave the fighter vulnerable, and fully restore after the cooldown", () => {
  const match = fighting(true); const defender = match.fighters[1];
  for (let hit = 0; hit < 4; hit++) {
    match.fighters[0].x = defender.x - 140;
    advance(match, .1, {}, { block: true });
    advance(match, .4, { attack: true }, { block: true });
  }
  assert.equal(defender.health, 100); assert.equal(defender.shield, 0);
  assert.ok(defender.shieldCooldown > 4.6); assert.equal(defender.blocking, false);
  advance(match, .4, {}, { block: true }); match.fighters[0].x = defender.x - 140;
  advance(match, .4, { attack: true }, { block: true }); assert.equal(defender.health, 88);
  const remaining = defender.shieldCooldown;
  advance(match, remaining - .05, {}, { block: true }); assert.equal(defender.shield, 0);
  advance(match, .1, {}, { block: true }); assert.equal(defender.shield, SHIELD.max); assert.equal(defender.shieldCooldown, 0); assert.equal(defender.blocking, true);
});
test("damaged guard regenerates only after releasing it and waiting for the delay", () => {
  const match = fighting(true); const defender = match.fighters[1];
  advance(match, .35, { attack: true }, { block: true }); assert.equal(defender.shield, 75);
  advance(match, 2, {}, { block: true }); assert.equal(defender.shield, 75);
  advance(match, .5); assert.ok(defender.shield > 75 && defender.shield < 100);
  advance(match, 1); assert.equal(defender.shield, 100);
  const delayed = fighting(true); advance(delayed, .35, { attack: true }, { block: true });
  advance(delayed, .5); assert.equal(delayed.fighters[1].shield, 75);
});
test("custom round length and win target survive subsequent rounds; invalid stored settings fall back", () => {
  const match = createMatch({ roundSeconds: 30, winsToMatch: 3 });
  assert.equal(match.remaining, 30); match.phase = "fighting"; match.fighters[1].health = 0; finishRound(match);
  const two = nextRound(match); assert.equal(two.remaining, 30); assert.deepEqual(two.settings, match.settings);
  assert.equal(two.fighters[1].shield, 100); two.phase = "fighting"; two.fighters[1].health = 0; finishRound(two);
  assert.equal(two.phase, "round-over");
  const three = nextRound(two); three.phase = "fighting"; three.fighters[1].health = 0; finishRound(three); assert.equal(three.phase, "match-over");
  const quick = createMatch({ roundSeconds: 90, winsToMatch: 1 }); quick.phase = "fighting"; quick.fighters[1].health = 0; finishRound(quick); assert.equal(quick.phase, "match-over");
  assert.deepEqual(normalizeSettings({ roundSeconds: -1, winsToMatch: Infinity }), { roundSeconds: 60, winsToMatch: 2 });
  assert.deepEqual(normalizeSettings(null), { roundSeconds: 60, winsToMatch: 2 });
});
test("jumping is edge-triggered, lands, and cannot be restarted mid-air", () => {
  const match = fighting(); advance(match, .2, { jump: true });
  assert.ok(match.fighters[0].y < WORLD.floor); const vy = match.fighters[0].vy;
  advance(match, .01); advance(match, .01, { jump: true });
  assert.ok(match.fighters[0].vy > vy);
  advance(match, 1, { jump: true }); assert.equal(match.fighters[0].y, WORLD.floor); assert.equal(match.fighters[0].grounded, true);
});
test("simultaneous strikes trade fairly and a simultaneous knockout is a draw", () => {
  const match = fighting(true); advance(match, .25, { attack: true }, { attack: true });
  assert.equal(match.fighters[0].health, 88); assert.equal(match.fighters[1].health, 88);
  const draw = fighting(true); draw.fighters.forEach(fighter => { fighter.health = 12; });
  advance(draw, .2, { attack: true }, { attack: true });
  assert.equal(draw.winner, "draw"); assert.deepEqual(draw.score, [0, 0]); assert.equal(draw.phase, "round-over");
});
test("round wins are awarded once, first to two ends the match, and rematch resets it", () => {
  const match = fighting(true); match.fighters[1].health = 12; advance(match, .2, { attack: true });
  assert.equal(match.phase, "round-over"); assert.deepEqual(match.score, [1, 0]);
  finishRound(match); advance(match, 1, { attack: true }); assert.deepEqual(match.score, [1, 0]);
  const round = nextRound(match); assert.equal(round.round, 2); assert.equal(round.fighters[1].health, 100); assert.deepEqual(round.score, [1, 0]);
  round.phase = "fighting"; round.fighters[1].health = 0; finishRound(round);
  assert.equal(round.phase, "match-over"); assert.deepEqual(round.score, [2, 0]); assert.equal(nextRound(round), round);
  assert.deepEqual(createMatch().score, [0, 0]);
});
test("timeout compares health; invalid elapsed values cannot corrupt the simulation", () => {
  const match = fighting(); const time = match.remaining;
  stepMatch(match, [emptyControls(), emptyControls()], NaN); assert.equal(match.remaining, time);
  stepMatch(match, [emptyControls(), emptyControls()], -1); assert.equal(match.remaining, time);
  match.remaining = .01; match.fighters[1].health = 88; advance(match, .1);
  assert.equal(match.winner, 0); assert.equal(match.remaining, 0);
  const draw = fighting(); draw.remaining = .01; advance(draw, .1); assert.equal(draw.winner, "draw");
});
