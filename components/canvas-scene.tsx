import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useGameLoop } from "ludicord/activity";
import { drawArena } from "@/lib/game/renderer";
import type { Match } from "@/lib/game/engine";

export function CanvasScene({ match, paused, tick }: {
  match?: RefObject<Match>; paused?: RefObject<boolean>; tick?: (elapsed: number, time: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const background = useRef<HTMLImageElement | null>(null);
  const reducedMotion = useRef(false);
  const size = useRef({ width: 1280, height: 720 });
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const image = new Image(); image.src = "/arena.svg";
    background.current = image;
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => { reducedMotion.current = query.matches; };
    updateMotion(); query.addEventListener("change", updateMotion);
    const resize = () => {
      size.current = { width: element.clientWidth, height: element.clientHeight };
      const dpr = Math.min(devicePixelRatio || 1, 2);
      element.width = Math.round(size.current.width * dpr);
      element.height = Math.round(size.current.height * dpr);
    };
    resize(); const observer = new ResizeObserver(resize); observer.observe(element);
    return () => { observer.disconnect(); query.removeEventListener("change", updateMotion); background.current = null; };
  }, []);
  useGameLoop(({ delta, time }) => {
    if (!paused?.current) tick?.(delta / 1000, time);
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || size.current.width === 0) return;
    const image = background.current;
    drawArena(ctx, size.current.width, size.current.height, image?.complete && image.naturalWidth ? image : null,
      match?.current.time ?? time / 1000, match?.current ?? null, reducedMotion.current);
  }, { pauseWhenHidden: true, maxDelta: 100 });
  return <canvas ref={canvas} className="arena-canvas" aria-label={match ? "DisFighters arena: Player One versus Player Two" : "Player One and Player Two in the night-time casbah arena"}>
    DisFighters requires a browser with Canvas support.
  </canvas>;
}
