export const WORLD = { width: 1280, height: 720, floor: 584, left: 92, right: 1188 };
export const STEP = 1 / 120;
export const FIGHTERS = [
  { name: "Player One", arabic: "اللاعب الأول", title: "The street striker", color: "#f2654b", dark: "#873b39" },
  { name: "Player Two", arabic: "اللاعب الثاني", title: "The midnight sentinel", color: "#74c9d5", dark: "#366878" },
] as const;
export type Player = 0 | 1;
export type Action = "left" | "right" | "jump" | "crouch" | "attack" | "block";
export type Controls = Record<Action, boolean>;
export type Phase = "countdown" | "fighting" | "round-over" | "match-over";
export type Winner = Player | "draw" | null;
export type Pose = "idle" | "walk" | "jump" | "crouch" | "attack" | "block" | "hurt" | "ko";
export const ROUND_LENGTHS = [30, 60, 90] as const;
export const WIN_TARGETS = [1, 2, 3] as const;
export interface MatchSettings { roundSeconds: number; winsToMatch: number }
export const DEFAULT_SETTINGS: MatchSettings = { roundSeconds: 60, winsToMatch: 2 };
export const SHIELD = { max: 100, damage: 25, breakCooldown: 5, regenDelay: 1.5, regenRate: 20 };
export function normalizeSettings(value: unknown): MatchSettings {
  const candidate = value && typeof value === "object" ? value as Partial<MatchSettings> : {};
  return { roundSeconds: ROUND_LENGTHS.some(seconds => seconds === candidate.roundSeconds) ? candidate.roundSeconds! : DEFAULT_SETTINGS.roundSeconds,
    winsToMatch: WIN_TARGETS.some(wins => wins === candidate.winsToMatch) ? candidate.winsToMatch! : DEFAULT_SETTINGS.winsToMatch };
}
export interface Fighter {
  id: Player; x: number; y: number; vx: number; vy: number; facing: 1 | -1;
  health: number; crouching: boolean; blocking: boolean; grounded: boolean;
  attackTime: number | null; hitSpent: boolean; cooldown: number; hurt: number;
  wasAttackDown: boolean; wasJumpDown: boolean; pose: Pose;
  shield: number; shieldCooldown: number; shieldRegenDelay: number; guardBreakFlash: number;
}
export interface Impact { x: number; y: number; age: number; blocked: boolean; player: Player }
export interface GameEvent { type: "hit" | "block" | "shield-break" | "jump" | "round-end"; player: Player }
export interface Match {
  phase: Phase; fighters: [Fighter, Fighter]; score: [number, number]; round: number;
  remaining: number; countdown: number; time: number; resultTime: number;
  winner: Winner; impacts: Impact[]; events: GameEvent[]; shake: number;
  settings: MatchSettings;
}
export const emptyControls = (): Controls => ({ left: false, right: false, jump: false, crouch: false, attack: false, block: false });
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function createFighter(id: Player): Fighter {
  return { id, x: id === 0 ? 386 : 894, y: WORLD.floor, vx: 0, vy: 0, facing: id === 0 ? 1 : -1,
    health: 100, crouching: false, blocking: false, grounded: true, attackTime: null,
    hitSpent: false, cooldown: 0, hurt: 0, wasAttackDown: false, wasJumpDown: false, pose: "idle",
    shield: SHIELD.max, shieldCooldown: 0, shieldRegenDelay: 0, guardBreakFlash: 0 };
}
export function createMatch(options: MatchSettings = DEFAULT_SETTINGS): Match {
  const settings = normalizeSettings(options);
  return { phase: "countdown", fighters: [createFighter(0), createFighter(1)], score: [0, 0],
    round: 1, remaining: settings.roundSeconds, countdown: 3, time: 0, resultTime: 0, winner: null,
    impacts: [], events: [], shake: 0, settings };
}
export function nextRound(match: Match): Match {
  if (match.phase !== "round-over") return match;
  return { ...createMatch(match.settings), score: [...match.score], round: match.round + 1, time: match.time };
}
export function finishRound(match: Match): void {
  if (match.phase !== "fighting") return;
  const [one, two] = match.fighters;
  match.winner = one.health === two.health ? "draw" : one.health > two.health ? 0 : 1;
  if (match.winner !== "draw") match.score[match.winner] += 1;
  match.phase = match.score.some(value => value >= match.settings.winsToMatch) ? "match-over" : "round-over";
  match.resultTime = 0;
  match.events.push({ type: "round-end", player: match.winner === "draw" ? 0 : match.winner });
  for (const fighter of match.fighters) {
    fighter.blocking = false;
    fighter.attackTime = null;
    fighter.vx = 0;
    fighter.pose = fighter.health <= 0 ? "ko" : "idle";
  }
}

function updateFighter(fighter: Fighter, opponent: Fighter, input: Controls, dt: number, match: Match) {
  fighter.cooldown = Math.max(0, fighter.cooldown - dt);
  fighter.hurt = Math.max(0, fighter.hurt - dt);
  fighter.guardBreakFlash = Math.max(0, fighter.guardBreakFlash - dt);
  fighter.shieldRegenDelay = Math.max(0, fighter.shieldRegenDelay - dt);
  if (fighter.shieldCooldown > 0) {
    fighter.shieldCooldown = Math.max(0, fighter.shieldCooldown - dt);
    if (fighter.shieldCooldown === 0) fighter.shield = SHIELD.max;
  } else if (!input.block && fighter.shieldRegenDelay === 0) {
    fighter.shield = Math.min(SHIELD.max, fighter.shield + SHIELD.regenRate * dt);
  }
  if (fighter.attackTime !== null) {
    fighter.attackTime += dt;
    if (fighter.attackTime >= 0.38) fighter.attackTime = null;
  }
  const attackPressed = input.attack && !fighter.wasAttackDown;
  const jumpPressed = input.jump && !fighter.wasJumpDown;
  fighter.wasAttackDown = input.attack;
  fighter.wasJumpDown = input.jump;
  if (fighter.attackTime === null && fighter.hurt === 0) fighter.facing = opponent.x >= fighter.x ? 1 : -1;
  fighter.crouching = input.crouch && fighter.grounded && fighter.hurt === 0;
  fighter.blocking = input.block && fighter.shieldCooldown === 0 && fighter.shield > 0 && fighter.grounded && fighter.hurt === 0 && fighter.attackTime === null;
  if (jumpPressed && fighter.grounded && !fighter.crouching && !fighter.blocking && fighter.hurt === 0 && fighter.attackTime === null) {
    fighter.vy = -800;
    fighter.grounded = false;
    match.events.push({ type: "jump", player: fighter.id });
  }
  if (attackPressed && fighter.cooldown === 0 && fighter.hurt === 0 && !fighter.blocking && fighter.attackTime === null) {
    fighter.attackTime = 0;
    fighter.hitSpent = false;
    fighter.cooldown = 0.43;
  }
  if (fighter.hurt > 0) {
    fighter.x += fighter.vx * dt;
    fighter.vx *= Math.exp(-9 * dt);
  } else {
    const direction = Number(input.right) - Number(input.left);
    fighter.vx = fighter.blocking || fighter.crouching ? 0 : direction * (fighter.attackTime === null ? 330 : 65);
    fighter.x += fighter.vx * dt;
  }
  if (!fighter.grounded) {
    fighter.vy += 2000 * dt;
    fighter.y += fighter.vy * dt;
    if (fighter.y >= WORLD.floor) {
      fighter.y = WORLD.floor; fighter.vy = 0; fighter.grounded = true;
    }
  }
  fighter.x = clamp(fighter.x, WORLD.left, WORLD.right);
  fighter.pose = fighter.hurt > 0 ? "hurt" : fighter.attackTime !== null ? "attack" : fighter.blocking ? "block"
    : !fighter.grounded ? "jump" : fighter.crouching ? "crouch" : Math.abs(fighter.vx) > 1 ? "walk" : "idle";
}

function separatesFighters(match: Match) {
  const [one, two] = match.fighters;
  if (Math.abs(one.y - two.y) > 150 || Math.abs(one.x - two.x) >= 94) return;
  const direction = one.x <= two.x ? 1 : -1;
  const overlap = 94 - Math.abs(one.x - two.x);
  one.x = clamp(one.x - overlap / 2 * direction, WORLD.left, WORLD.right);
  two.x = clamp(two.x + overlap / 2 * direction, WORLD.left, WORLD.right);
  // At a wall the unpinned fighter absorbs the remaining push-box overlap.
  const remaining = 94 - Math.abs(one.x - two.x);
  if (remaining > 0) {
    if (one.x === WORLD.left || one.x === WORLD.right) two.x = clamp(two.x + remaining * direction, WORLD.left, WORLD.right);
    else one.x = clamp(one.x - remaining * direction, WORLD.left, WORLD.right);
  }
}

function strike(attacker: Fighter, defender: Fighter) {
  if (attacker.attackTime === null || attacker.attackTime < 0.085 || attacker.attackTime > 0.19 || attacker.hitSpent) return null;
  const near = attacker.x + attacker.facing * 25;
  const far = attacker.x + attacker.facing * 184;
  const y = attacker.y - (attacker.crouching ? 82 : 172);
  const bodyTop = defender.y - (defender.crouching ? 153 : 247);
  const bodyBottom = defender.y - 16;
  if (Math.max(near, far) < defender.x - 37 || Math.min(near, far) > defender.x + 37
    || y + 18 < bodyTop || y - 18 > bodyBottom) return null;
  const facingAttacker = defender.facing === (attacker.x >= defender.x ? 1 : -1);
  return { attacker, defender, y, blocked: defender.blocking && facingAttacker && (!attacker.crouching || defender.crouching) };
}

/** Advance one bounded simulation tick. Both strikes are sampled before applying damage. */
export function stepMatch(match: Match, inputs: readonly [Controls, Controls], elapsed: number): void {
  const dt = clamp(Number.isFinite(elapsed) ? elapsed : 0, 0, 1 / 30);
  if (dt === 0) return;
  match.events = [];
  match.time += dt;
  match.shake = Math.max(0, match.shake - dt);
  for (const impact of match.impacts) impact.age += dt;
  match.impacts = match.impacts.filter(impact => impact.age < 0.32);
  if (match.phase === "round-over" || match.phase === "match-over") {
    match.resultTime += dt;
    return;
  }
  if (match.phase === "countdown") {
    match.countdown = Math.max(0, match.countdown - dt);
    if (match.countdown === 0) match.phase = "fighting";
    return;
  }
  match.remaining = Math.max(0, match.remaining - dt);
  updateFighter(match.fighters[0], match.fighters[1], inputs[0], dt, match);
  updateFighter(match.fighters[1], match.fighters[0], inputs[1], dt, match);
  separatesFighters(match);
  const hits = [strike(match.fighters[0], match.fighters[1]), strike(match.fighters[1], match.fighters[0])];
  for (const hit of hits) {
    if (!hit) continue;
    const { attacker, defender, y, blocked } = hit;
    attacker.hitSpent = true;
    match.impacts.push({ x: defender.x - attacker.facing * 34, y, age: 0, blocked, player: attacker.id });
    match.events.push({ type: blocked ? "block" : "hit", player: attacker.id });
    if (blocked) {
      defender.x = clamp(defender.x + attacker.facing * 9, WORLD.left, WORLD.right);
      defender.shield = Math.max(0, defender.shield - SHIELD.damage);
      defender.shieldRegenDelay = SHIELD.regenDelay;
      if (defender.shield === 0) {
        defender.shieldCooldown = SHIELD.breakCooldown;
        defender.blocking = false;
        defender.hurt = 0.6;
        defender.pose = "hurt";
        defender.vx = attacker.facing * 180;
        defender.guardBreakFlash = 0.85;
        match.shake = 0.16;
        match.events.push({ type: "shield-break", player: defender.id });
      }
    } else {
      defender.health = Math.max(0, defender.health - 12);
      defender.hurt = 0.25;
      defender.vx = attacker.facing * 250;
      defender.attackTime = null;
      defender.blocking = false;
      defender.pose = "hurt";
      match.shake = 0.12;
    }
  }
  if (match.remaining === 0 || match.fighters.some(fighter => fighter.health <= 0)) finishRound(match);
}
