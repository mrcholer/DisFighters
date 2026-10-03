import { emptyControls } from "./engine";
import type { Controls, Player } from "./engine";

export interface PadSnapshot {
  index: number; id: string; mapping: string; connected: boolean;
  axes: readonly number[]; buttons: readonly { pressed: boolean; value: number }[];
}
export type PadCommand = "confirm" | "back" | "pause" | "help" | "left" | "right" | "up" | "down";
export type PadEvent = { kind: PadCommand | "disconnect"; player: Player };
export interface PadDevice { index: number; name: string; player: Player | null; supported: boolean; armed: boolean }
export interface PadFrame { controls: [Controls, Controls]; devices: PadDevice[]; events: PadEvent[] }
interface Assignment { id: string; player: Player; armed: boolean; previous: Set<PadCommand>; direction: PadCommand | null; nextRepeat: number }
export const STICK_DEAD_ZONE = .3;
const axis = (pad: PadSnapshot, index: number) => Number.isFinite(pad.axes[index]) ? pad.axes[index] : 0;
const down = (pad: PadSnapshot, index: number) => pad.buttons[index]?.pressed === true || (Number.isFinite(pad.buttons[index]?.value) && pad.buttons[index].value > .5);
export function mergeControls(...inputs: Controls[]): Controls {
  const result = emptyControls();
  for (const input of inputs) for (const key of Object.keys(result) as (keyof Controls)[]) result[key] ||= input[key];
  if (result.left && result.right) result.left = result.right = false;
  if (result.jump && result.crouch) result.jump = result.crouch = false;
  return result;
}
export function readPad(pad: PadSnapshot): Controls {
  return mergeControls({ left: down(pad, 14) || axis(pad, 0) < -STICK_DEAD_ZONE, right: down(pad, 15) || axis(pad, 0) > STICK_DEAD_ZONE,
    jump: down(pad, 0) || down(pad, 12) || axis(pad, 1) < -STICK_DEAD_ZONE, crouch: down(pad, 13) || axis(pad, 1) > STICK_DEAD_ZONE,
    attack: down(pad, 2), block: down(pad, 1) || down(pad, 7) });
}
function name(pad: PadSnapshot) {
  if (/dualsense|054c.*0ce6|054c.*0df2/i.test(pad.id)) return "PS5";
  if (/dualshock|wireless controller|054c.*05c4|054c.*09cc/i.test(pad.id)) return "PLAYSTATION";
  if (/xbox|xinput|045e/i.test(pad.id)) return "XBOX";
  return "GAMEPAD";
}
function commands(pad: PadSnapshot) {
  const result = new Set<PadCommand>();
  if (down(pad, 0)) result.add("confirm"); if (down(pad, 1)) result.add("back");
  if (down(pad, 9)) result.add("pause"); if (down(pad, 8)) result.add("help");
  if (down(pad, 14) || axis(pad, 0) < -STICK_DEAD_ZONE) result.add("left");
  if (down(pad, 15) || axis(pad, 0) > STICK_DEAD_ZONE) result.add("right");
  if (down(pad, 12) || axis(pad, 1) < -STICK_DEAD_ZONE) result.add("up");
  if (down(pad, 13) || axis(pad, 1) > STICK_DEAD_ZONE) result.add("down");
  return result;
}
export function emptyPadFrame(): PadFrame { return { controls: [emptyControls(), emptyControls()], devices: [], events: [] }; }

/** Controller slots follow connection order, never the browser's possibly sparse index. */
export class GamepadTracker {
  private assigned = new Map<number, Assignment>();
  constructor(private readonly capacity: 1 | 2 = 2) {}
  release() { for (const assignment of this.assigned.values()) { assignment.armed = false; assignment.previous.clear(); assignment.direction = null; } }
  sample(pads: readonly (PadSnapshot | null | undefined)[], now: number): PadFrame {
    const frame = emptyPadFrame(); const connected = pads.filter((pad): pad is PadSnapshot => pad != null && pad.connected);
    for (const [index, assignment] of this.assigned) {
      if (!connected.some(pad => pad.index === index && pad.id === assignment.id && pad.mapping === "standard")) {
        this.assigned.delete(index); frame.events.push({ kind: "disconnect", player: assignment.player });
      }
    }
    for (const pad of connected) {
      const supported = pad.mapping === "standard";
      let assignment = this.assigned.get(pad.index);
      if (supported && !assignment) {
        const used = new Set([...this.assigned.values()].map(entry => entry.player));
        const player = ([0, 1] as const).find(slot => slot < this.capacity && !used.has(slot));
        if (player !== undefined) { assignment = { id: pad.id, player, armed: false, previous: new Set(), direction: null, nextRepeat: 0 }; this.assigned.set(pad.index, assignment); }
      }
      if (assignment) {
        const held = commands(pad);
        const neutral = Math.abs(axis(pad, 0)) <= STICK_DEAD_ZONE && Math.abs(axis(pad, 1)) <= STICK_DEAD_ZONE && !pad.buttons.slice(0, 16).some((_, index) => down(pad, index));
        if (!assignment.armed && neutral) assignment.armed = true;
        if (assignment.armed) {
          frame.controls[assignment.player] = readPad(pad);
          for (const command of held) if (!assignment.previous.has(command)) frame.events.push({ kind: command, player: assignment.player });
          const direction = (["up", "down", "left", "right"] as const).find(command => held.has(command)) ?? null;
          if (direction !== assignment.direction) { assignment.direction = direction; assignment.nextRepeat = now + 350; }
          else if (direction && now >= assignment.nextRepeat) { frame.events.push({ kind: direction, player: assignment.player }); assignment.nextRepeat = now + 150; }
        }
        assignment.previous = held;
      }
      frame.devices.push({ index: pad.index, name: name(pad), player: assignment?.player ?? null, supported, armed: assignment?.armed ?? false });
    }
    // Handle at most one menu action per frame. Unplugging always takes precedence.
    const disconnected = frame.events.filter(event => event.kind === "disconnect");
    const command = (["pause", "help", "back", "confirm", "up", "down", "left", "right"] as const)
      .map(kind => frame.events.find(event => event.kind === kind)).find(Boolean);
    frame.events = disconnected.length ? disconnected : command ? [command] : [];
    return frame;
  }
}
