import test from "node:test";
import assert from "node:assert/strict";
import { createMatch, emptyControls, STEP, stepMatch } from "../lib/game/engine.ts";
import { GamepadTracker, mergeControls, readPad } from "../lib/game/gamepads.ts";
import type { PadSnapshot } from "../lib/game/gamepads.ts";
function pad(index = 0, held: number[] = [], axes = [0, 0], id = "Xbox XInput"): PadSnapshot {
  return { index, id, connected: true, mapping: "standard", axes, buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: held.includes(index), value: held.includes(index) ? 1 : 0 })) };
}
test("Xbox, DualShock 4 and DualSense standard layouts drive the same combat controls", () => {
  for (const id of ["Xbox XInput", "DualShock 4 Wireless Controller", "DualSense Wireless Controller"]) {
    assert.equal(readPad(pad(0, [0], [0, 0], id)).jump, true);
    assert.equal(readPad(pad(0, [2], [0, 0], id)).attack, true);
    for (const button of [1, 7]) assert.equal(readPad(pad(0, [button], [0, 0], id)).block, true);
    assert.equal(readPad(pad(0, [13], [0, 0], id)).crouch, true);
    assert.equal(readPad(pad(0, [14], [0, 0], id)).left, true);
    assert.equal(readPad(pad(0, [15], [0, 0], id)).right, true);
  }
});
test("stick drift and non-finite axes do not move a player; opposing sources neutralize movement", () => {
  assert.deepEqual(readPad(pad(0, [], [.29, -.3])), emptyControls());
  assert.deepEqual(readPad(pad(0, [], [NaN, Infinity])), emptyControls());
  assert.equal(readPad(pad(0, [], [-.7, .8])).left, true); assert.equal(readPad(pad(0, [], [-.7, .8])).crouch, true);
  assert.equal(mergeControls({ ...emptyControls(), left: true, attack: true }, { ...emptyControls(), right: true, block: true }).left, false);
  assert.equal(mergeControls({ ...emptyControls(), left: true }, { ...emptyControls(), right: true }).right, false);
});
test("sparse indexes use stable local assignments, including unplug and replacement without moving P2 into P1", () => {
  const input = new GamepadTracker(); input.sample([null, null, pad(3)], 0);
  let frame = input.sample([pad(0, [], [0, 0], "DualSense"), null, pad(3)], 16);
  assert.deepEqual(frame.devices.map(device => device.player), [1, 0]);
  frame = input.sample([pad(0, [15], [0, 0], "DualSense")], 32);
  assert.deepEqual(frame.events, [{ kind: "disconnect", player: 0 }]); assert.equal(frame.controls[1].right, true);
  assert.equal(frame.controls[0].right, false);
  frame = input.sample([pad(0, [], [0, 0], "DualSense"), pad(6)], 48);
  assert.deepEqual(frame.devices.map(device => device.player), [1, 0]);
});
test("one online controller maps to the local input slot even when its browser index is five", () => {
  const input = new GamepadTracker(1); const frame = input.sample([pad(5), pad(7, [], [0, 0], "DualSense")], 0);
  assert.deepEqual(frame.devices.map(device => device.player), [0, null]);
  const next = input.sample([pad(5, [2]), pad(7, [15], [0, 0], "DualSense")], 16);
  assert.equal(next.controls[0].attack, true); assert.deepEqual(next.controls[1], emptyControls());
});
test("connecting, resuming focus and starting a fresh round require neutral controls before combat", () => {
  const input = new GamepadTracker(); let frame = input.sample([pad(0, [2, 9], [.8, 0])], 0);
  assert.equal(frame.devices[0].armed, false); assert.deepEqual(frame.controls[0], emptyControls()); assert.deepEqual(frame.events, []);
  input.sample([pad()], 16); frame = input.sample([pad(0, [2], [.8, 0])], 32); assert.equal(frame.controls[0].attack, true);
  input.release(); frame = input.sample([pad(0, [2], [.8, 0])], 48); assert.deepEqual(frame.controls[0], emptyControls());
  input.sample([pad()], 64); frame = input.sample([pad(0, [2])], 80); assert.equal(frame.controls[0].attack, true);
});
test("Start/Options and confirmation are edge-triggered; simultaneous inputs and disconnect cannot double-toggle pause", () => {
  const input = new GamepadTracker(); input.sample([pad(), pad(1)], 0);
  let frame = input.sample([pad(0, [0, 9]), pad(1, [9])], 16); assert.deepEqual(frame.events, [{ kind: "pause", player: 0 }]);
  frame = input.sample([pad(0, [9]), pad(1, [9])], 32); assert.deepEqual(frame.events, []);
  input.sample([pad(), pad(1)], 48); frame = input.sample([pad(1, [9])], 64); assert.deepEqual(frame.events, [{ kind: "disconnect", player: 0 }]);
});
test("menu navigation repeats at a controlled rate and unknown mappings never receive combat input", () => {
  const input = new GamepadTracker(); input.sample([pad()], 0);
  assert.equal(input.sample([pad(0, [15])], 16).events[0].kind, "right");
  assert.deepEqual(input.sample([pad(0, [15])], 100).events, []);
  assert.equal(input.sample([pad(0, [15])], 366).events[0].kind, "right");
  const unknown = input.sample([{ ...pad(2, [2], [.8, 0]), mapping: "" }], 380);
  assert.deepEqual(unknown.controls, [emptyControls(), emptyControls()]); assert.equal(unknown.devices[0].supported, false);
});
test("held controller punch hits once, releases rearm it, and guard blocks the real rule simulation", () => {
  const match = createMatch(); match.phase = "fighting"; match.fighters[0].x = 550; match.fighters[1].x = 690;
  const input = new GamepadTracker(); input.sample([pad(), pad(1)], 0);
  for (let frame = 0; frame < 120; frame++) stepMatch(match, input.sample([pad(0, [2]), pad(1, [7])], frame * 9).controls, STEP);
  assert.equal(match.fighters[1].health, 100); assert.equal(match.fighters[1].shield, 75);
  stepMatch(match, input.sample([pad(), pad(1)], 1100).controls, STEP);
  for (let frame = 0; frame < 30; frame++) stepMatch(match, input.sample([pad(0, [2]), pad(1)], 1110 + frame * 9).controls, STEP);
  assert.equal(match.fighters[1].health, 88);
});

test("empty browser slots and undefined snapshots are ignored", () => {
  const pads: (PadSnapshot | null | undefined)[] = Array(4); pads[3] = pad(3);
  const input = new GamepadTracker();
  assert.equal(input.sample(Array.from(pads), 0).devices[0].player, 0);
  pads[3] = pad(3, [15]);
  assert.equal(input.sample(pads, 16).controls[0].right, true);
});
