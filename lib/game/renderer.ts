import { WORLD } from "./engine";
import type { Fighter, Match } from "./engine";
import { drawFighter } from "./fighters";

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
}
export function drawArena(ctx: CanvasRenderingContext2D, width: number, height: number, background: HTMLImageElement | null, time: number, match: Match | null, reducedMotion = false) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#101721"; ctx.fillRect(0, 0, width, height);
  const portraitFight = match !== null && width / height < .9;
  const visibleWidth = portraitFight ? Math.max(620, Math.abs(match.fighters[0].x - match.fighters[1].x) + 220) : WORLD.width;
  const scale = Math.min(width / visibleWidth, Math.max(180, height - (portraitFight ? 230 : 0)) / WORLD.height);
  const middle = match ? (match.fighters[0].x + match.fighters[1].x) / 2 : WORLD.width / 2;
  const camera = portraitFight ? Math.max(visibleWidth / 2, Math.min(WORLD.width - visibleWidth / 2, middle)) : WORLD.width / 2;
  const ox = width / 2 - camera * scale;
  const oy = (height - WORLD.height * scale) / 2 - (portraitFight ? 20 : 0);
  ctx.translate(ox, oy); ctx.scale(scale, scale);
  if (match && match.shake > 0 && !reducedMotion) ctx.translate(Math.sin(time * 180) * 4, Math.cos(time * 145) * 2);
  if (background) ctx.drawImage(background, 0, 0, WORLD.width, WORLD.height);
  const shade = ctx.createLinearGradient(0, 0, 0, WORLD.height);
  shade.addColorStop(0, "#09101d70"); shade.addColorStop(.55, "#09101d08"); shade.addColorStop(1, "#070c17bb");
  ctx.fillStyle = shade; ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  if (!reducedMotion) {
    for (let i = 0; i < 24; i++) {
      const x = (i * 137 + time * (8 + i % 5)) % WORLD.width;
      const y = 130 + (i * 97 + Math.sin(time + i) * 12) % 420;
      ctx.globalAlpha = .15 + Math.sin(time * .7 + i) * .1;
      ellipse(ctx, x, y, 1.3, 1.3, "#f3d4a0");
    }
    ctx.globalAlpha = 1;
  }
  if (match) {
    const order = [...match.fighters].sort((a, b) => a.y - b.y);
    for (const fighter of order) drawFighter(ctx, fighter, reducedMotion ? 0 : time);
    for (const impact of match.impacts) {
      const progress = impact.age / .32;
      ctx.save(); ctx.translate(impact.x, impact.y); ctx.globalAlpha = 1 - progress;
      const color = impact.blocked ? "#92e8f4" : "#ffe6aa";
      if (impact.blocked) {
        ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 12 + progress * 30, 0, Math.PI * 2); ctx.stroke();
      } else {
        for (let i = 0; i < 9; i++) {
          const angle = i / 9 * Math.PI * 2;
          ctx.strokeStyle = color; ctx.lineWidth = 3 * (1 - progress) + 1; ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * (5 + progress * 22), Math.sin(angle) * (5 + progress * 22));
          ctx.lineTo(Math.cos(angle) * (24 + progress * 44), Math.sin(angle) * (24 + progress * 44)); ctx.stroke();
        }
        ellipse(ctx, 0, 0, 9 * (1 - progress), 9 * (1 - progress), "#fff9dc");
      }
      ctx.restore();
    }
  } else {
    const portrait = width / height < .9;
    const preview = [
      { id: 0, x: portrait ? 455 : 790, y: WORLD.floor, facing: 1 },
      { id: 1, x: portrait ? 925 : 1060, y: WORLD.floor, facing: -1 },
    ];
    for (const fighter of preview) drawFighter(ctx, { ...fighter, pose: "idle", grounded: true, crouching: false, blocking: false, hurt: 0, attackTime: null } as Fighter, reducedMotion ? 0 : time, portrait ? 1.8 : 1.12);
  }
}
