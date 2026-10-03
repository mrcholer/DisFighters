import { FIGHTERS, WORLD } from "./engine";
import type { Fighter } from "./engine";

type Point = readonly [number, number];
const INK = "#101a25";
function shape(ctx: CanvasRenderingContext2D, path: string, color: string | CanvasGradient, outline = INK, width = 2) {
  const p = new Path2D(path); ctx.fillStyle = color; ctx.fill(p);
  if (width) { ctx.strokeStyle = outline; ctx.lineWidth = width; ctx.stroke(p); }
}
function line(ctx: CanvasRenderingContext2D, path: string, color: string, width = 1.5) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(new Path2D(path));
}
function gradient(ctx: CanvasRenderingContext2D, left: string, right: string, x = -32, width = 65) {
  const g = ctx.createLinearGradient(x, 0, x + width, 0); g.addColorStop(0, left); g.addColorStop(.5, right); g.addColorStop(1, left); return g;
}
function oval(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}
/** Tapered painted limbs rotate around their joints, keeping every pose connected. */
function segment(ctx: CanvasRenderingContext2D, from: Point, to: Point, top: number, bottom: number, dark: string, light: string) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  ctx.save(); ctx.translate(...from); ctx.rotate(Math.atan2(to[1] - from[1], to[0] - from[0]) - Math.PI / 2);
  shape(ctx, `M ${-top} 0 Q ${-top - 3} ${length * .4} ${-bottom} ${length} Q 0 ${length + bottom * .7} ${bottom} ${length} Q ${top + 3} ${length * .4} ${top} 0 Q 0 ${-top * .65} ${-top} 0Z`, gradient(ctx, dark, light, -top, top * 2));
  line(ctx, `M ${-top * .5} 6 Q ${-top * .45} ${length * .5} ${-bottom * .5} ${length - 7}`, "#ffffff15", 2);
  ctx.restore();
}
function boot(ctx: CanvasRenderingContext2D, foot: Point, front: boolean, gold: boolean) {
  ctx.save(); ctx.translate(...foot);
  shape(ctx, "M-12-20 10-20 13-5 Q24-4 27 3 L27 8-17 8-15-4Z", front ? "#293443" : "#18232f");
  shape(ctx, "M-16 4 27 4 28 9-17 9Z", "#111a25", INK, 1);
  line(ctx, "M-10-14 7-14M-10-9 8-9M-10-4 9-4", gold ? "#c7b479" : "#77858f", 1.4);
  line(ctx, "M-13 3 20 3", "#a5b0b8", 1); ctx.restore();
}
function fist(ctx: CanvasRenderingContext2D, hand: Point, wrist: Point, isPlayerTwo: boolean) {
  ctx.save(); ctx.translate(...hand); ctx.rotate(Math.atan2(hand[1] - wrist[1], hand[0] - wrist[0]));
  shape(ctx, "M-13-9 Q-4-15 6-11 L13-5 13 5 Q8 12-3 11 L-13 8Z", isPlayerTwo ? "#d8ebe4" : "#ead5b4", INK, 1.8);
  shape(ctx, "M-14-9-5-10-4 10-15 8Z", isPlayerTwo ? "#326878" : "#a2443c", INK, 1);
  line(ctx, "M-2-8 0 8M3-8 5 8M8-5 9 4", isPlayerTwo ? "#8fadae" : "#b19d81", .9);
  line(ctx, "M-13-4-6-4M-13 2-5 2", "#e6c77c", 1.2); ctx.restore();
}

/** Original illustrated fighters, sharing a joint rig but distinct anatomy and clothing. */
export function drawFighter(ctx: CanvasRenderingContext2D, fighter: Fighter, time: number, extraScale = 1) {
  const isPlayerTwo = fighter.id === 1;
  const palette = FIGHTERS[fighter.id];
  const crouch = fighter.crouching ? 90 : 0;
  const walk = fighter.pose === "walk";
  const cycle = Math.sin(time * 12);
  const air = !fighter.grounded;
  const active = fighter.attackTime !== null;
  const attack = fighter.attackTime ?? 0;
  const punch = active ? Math.sin(Math.min(1, attack / .105) * Math.PI / 2) * (attack > .19 ? Math.max(0, 1 - (attack - .19) / .19) : 1) : 0;
  const bob = fighter.pose === "ko" ? 0 : walk ? Math.abs(cycle) * 3 : Math.sin(time * 3 + fighter.id) * 1.5;
  const skinDark = isPlayerTwo ? "#a47056" : "#955b42";
  const skinLight = isPlayerTwo ? "#e8b78f" : "#cf976d";
  const clothDark = isPlayerTwo ? "#223f53" : "#813735";
  const clothLight = isPlayerTwo ? "#4598aa" : "#d95745";
  ctx.save();
  oval(ctx, fighter.x, WORLD.floor + 6, Math.max(25, 59 - (WORLD.floor - fighter.y) * .11) * extraScale, 10 * extraScale, "#060e1bb0");
  ctx.translate(fighter.x, fighter.y); ctx.scale(fighter.facing * extraScale, extraScale);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (fighter.pose === "ko") { ctx.translate(-35, -15); ctx.rotate(-Math.PI / 2); }
  ctx.translate(fighter.hurt > 0 ? -7 : 0, bob);
  const hip: Point = [-4, -108 + crouch * .58];
  const stride = walk ? cycle * 28 : 0;
  const backKnee: Point = [-25 - stride * .55 - crouch * .24, -57 + crouch * .33 + (air ? 15 : 0)];
  const frontKnee: Point = [26 + stride * .55 + crouch * .23, -54 + crouch * .35 - (air ? 5 : 0)];
  const backFoot: Point = [-41 - stride, air ? -30 : -10];
  const frontFoot: Point = [38 + stride, air ? -47 : -10];
  const trouserDark = isPlayerTwo ? "#586876" : "#273140";
  const trouserLight = isPlayerTwo ? "#a0b1b9" : "#475166";
  segment(ctx, hip, backKnee, 19, 16, isPlayerTwo ? "#394f60" : "#202b39", isPlayerTwo ? "#697d8b" : "#333f50");
  segment(ctx, backKnee, backFoot, 16, 9, "#253445", isPlayerTwo ? "#69858c" : "#384453"); boot(ctx, backFoot, false, isPlayerTwo);
  segment(ctx, [hip[0] + 12, hip[1]], frontKnee, 21, 17, trouserDark, trouserLight);
  segment(ctx, frontKnee, frontFoot, 17, 10, trouserDark, trouserLight);
  ctx.save(); ctx.translate(...frontKnee);
  shape(ctx, isPlayerTwo ? "M-15 0 12-3 13 24 0 35-14 24Z" : "M-12-12 11-14 14 7-10 12Z", isPlayerTwo ? "#244554" : "#333f50", INK, 1.2);
  line(ctx, isPlayerTwo ? "M-10 5 8 3M-8 12 8 10M-5 21 5 19" : "M-6-6 7-7", isPlayerTwo ? "#cbb987" : "#68707a", 1.2); ctx.restore();
  boot(ctx, frontFoot, true, isPlayerTwo);

  ctx.save(); ctx.translate(punch * 4, crouch);
  if (fighter.hurt > 0) ctx.rotate(-.065);
  if (isPlayerTwo) {
    // Split coat tails move independently of the front leg.
    shape(ctx, `M-25-134 Q-35-86 ${-49 - cycle * 4}-50 L-14-66 3-110Z`, "#244654");
    shape(ctx, "M4-127 Q18-92 39-61 L17-70-3-106Z", "#31616e");
    line(ctx, "M-25-120-39-61M14-111 30-71", "#bca86f", 2);
  } else {
    shape(ctx, `M-22-111 Q-34-86 ${-41 - cycle * 5}-77 L-28-81-13-109Z`, "#b64339");
    line(ctx, "M-25-103-33-83", "#edbd76", 1.4);
  }
  const rearShoulder: Point = [-26, -182]; const rearElbow: Point = [-40, -155]; const rearHand: Point = [-19, -204];
  segment(ctx, rearShoulder, rearElbow, 13, 10, clothDark, clothLight);
  segment(ctx, rearElbow, rearHand, 10, 7, skinDark, skinLight); fist(ctx, rearHand, rearElbow, isPlayerTwo);
  // Curved shoulders, narrow waist and shaded fabric replace the flat stick-body silhouette.
  shape(ctx, "M-29-187 Q-13-197 8-196 Q29-193 34-177 L25-143 22-111 Q4-103-22-113 L-28-145Z", gradient(ctx, clothDark, clothLight));
  if (isPlayerTwo) {
    shape(ctx, "M-9-193 9-191 16-162 4-117-17-114-15-150Z", "#1c354a", INK, 1);
    shape(ctx, "M-23-187-12-192-6-159-13-124-25-117-26-157Z", "#539aaa", INK, 1.4);
    shape(ctx, "M13-193 29-185 24-157 10-134-1-151Z", "#65b6c0", INK, 1.4);
    line(ctx, "M-13-189-5-161-13-123M15-187 7-158 16-150", "#e0c894", 2);
    shape(ctx, "M-17-197-3-206 16-197 22-183 2-175-13-184Z", gradient(ctx, "#356779", "#82c3c9"), INK, 1.5);
    line(ctx, "M-12-192 3-185 16-190", "#c7e5da", 1.4);
  } else {
    shape(ctx, "M-12-192 7-192 17-177 10-144 11-113-12-113-19-153Z", gradient(ctx, "#aeb4ad", "#f1e2c4"), INK, 1.3);
    shape(ctx, "M-30-184-15-193-13-170-20-146-16-115-27-118Z", "#a94137", INK, 1.4);
    shape(ctx, "M10-193 27-188 33-174 23-152 19-116 10-113 7-147 17-170Z", "#e36449", INK, 1.4);
    line(ctx, "M-19-185-23-167M21-184 24-173M-14-151 9-145M-9-130 10-127", "#f7be86", 1.2);
    shape(ctx, "M-27-157-15-159-16-143-26-142Z", "#773b37", INK, 1);
  }
  shape(ctx, "M-23-117 23-117 25-107-24-106Z", "#c7a975", INK, 1.4);
  shape(ctx, "M-2-117 9-117 9-106-2-106Z", "#eddb9c", INK, 1.2);
  line(ctx, "M1-114 6-114 6-109 1-109Z", "#7e6c4a", 1);
  // Adult face in three-quarter profile, with individual hair and facial details.
  shape(ctx, "M-7-206-8-190 Q4-183 15-193 L12-209Z", skinDark, INK, 1.5);
  if (isPlayerTwo) {
    shape(ctx, `M-14-238 Q-33-244-27-214 Q-27-190 ${-44 - cycle * 3}-171 Q-20-174-16-199 L-8-229Z`, "#132937");
    line(ctx, "M-24-230 Q-22-203-33-187", "#345b6a", 2);
    shape(ctx, "M-24-233-16-234-16-225-25-225Z", "#bcaa75", INK, 1);
  }
  shape(ctx, "M-14-235 Q-7-247 9-241 Q17-237 17-222 L23-213 16-210 14-200 Q2-192-9-205 L-15-220Z", gradient(ctx, skinDark, skinLight, -17, 42), INK, 1.8);
  shape(ctx, "M-15-221 Q-25-225-21-214 Q-19-208-13-210Z", skinLight, INK, 1.3);
  line(ctx, "M-19-220-16-216-19-214", skinDark, 1);
  if (isPlayerTwo) {
    shape(ctx, "M-18-220 Q-25-241-11-248 Q3-252 14-241 L20-230 12-229 5-238-8-237-13-217Z", "#162936");
    line(ctx, "M-17-236 Q-5-248 10-238", "#3b5c6b", 2);
  } else {
    shape(ctx, "M-16-218-20-230 Q-20-243-7-247 L2-251 5-246 13-245 17-234 8-236-1-239-11-232-11-219Z", "#19232b");
    line(ctx, "M-14-236-5-241 7-239", "#495050", 1.5);
    shape(ctx, "M-10-211-4-208 7-206 15-210 14-200 5-196-5-201Z", "#3d3530", "#3d3530", 0);
    line(ctx, "M-4-204 4-200 11-203", "#71604a", .9);
  }
  line(ctx, "M3-226 12-225", "#2d2927", 2.4);
  line(ctx, "M5-222 11-222", "#192731", 1.6); oval(ctx, 9, -222, 1.2, 1.1, "#eddfc2");
  line(ctx, "M14-220 16-213 20-213M8-205 14-205", "#754e3e", 1.1);
  if (!isPlayerTwo) line(ctx, "M-4-226-2-220", "#e2b08d", 1.3);
  const shoulder: Point = [24, -184];
  const elbow: Point = fighter.blocking ? [42, -175] : [49 + punch * 48, -153 - punch * 20];
  const hand: Point = fighter.blocking ? [40, -216] : [61 + punch * 105, -198 + punch * 26];
  segment(ctx, shoulder, elbow, isPlayerTwo ? 13 : 16, 11, isPlayerTwo ? clothDark : skinDark, isPlayerTwo ? clothLight : skinLight);
  if (!isPlayerTwo) { line(ctx, `M${elbow[0] - 11} ${elbow[1] - 8} Q${elbow[0] - 21} ${elbow[1] - 23} 31-178`, "#edba87", 1.3); }
  segment(ctx, elbow, hand, 11, 7, skinDark, skinLight);
  if (isPlayerTwo) {
    const cuff: Point = [elbow[0] + (hand[0] - elbow[0]) * .7, elbow[1] + (hand[1] - elbow[1]) * .7];
    segment(ctx, elbow, cuff, 12, 9, "#254b5b", "#5799a5");
  }
  fist(ctx, hand, elbow, isPlayerTwo);
  if (fighter.blocking) {
    ctx.globalAlpha = .25 + (fighter.shield / 100) * .4;
    shape(ctx, "M77-239 Q108-206 82-152 L53-146 Q29-175 39-217Z", "#82ddeb12", "#9be9ed", 2.2);
    line(ctx, "M55-221 75-199 59-171", "#bceceb", 2); ctx.globalAlpha = 1;
  }
  if (fighter.guardBreakFlash > 0) {
    const progress = 1 - fighter.guardBreakFlash / .85;
    ctx.globalAlpha = 1 - progress;
    for (let i = 0; i < 6; i++) {
      ctx.save(); ctx.translate(65 + Math.cos(i) * progress * 80, -195 + Math.sin(i) * progress * 70); ctx.rotate(i + progress * 2);
      shape(ctx, "M-7-14 10-8 5 12-9 4Z", "#acdbe93a", "#b1edfa", 1.8); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  if (punch > .72) {
    for (let i = 0; i < 3; i++) line(ctx, `M${91 - i * 8}-${184 - i * 10} ${148 - i * 8}-${184 - i * 10}`, "#f3dca36a", 1.7);
  }
  // Moonlit edge highlights maintain the silhouettes against the dark stage.
  line(ctx, "M-27-181 Q-33-165-27-147M-14-241 Q-7-248 1-245", palette.color + "9c", 1.2);
  ctx.restore(); ctx.restore();
}
