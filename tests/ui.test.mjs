// i18n tables, touch-control geometry and asset metadata.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { LANGS, keysOf, pickLang, setLang, t } from "../js/i18n.js";
import { padDirections, buttonsAt } from "../js/input.js";
import { ROSTER, FIGHTERS } from "../js/config.js";

test("every language has the same keys and no empty string", () => {
  const base = keysOf("en").sort();
  for (const l of LANGS) {
    assert.deepEqual(keysOf(l).sort(), base, l);
    setLang(l);
    for (const k of base) assert.ok(t(k).length > 0, `${l}.${k}`);
  }
  setLang("en");
});

test("language pick: URL beats saved choice beats browser, unknown falls back to English", () => {
  assert.equal(pickLang("pt", "en", "en-US"), "pt");
  assert.equal(pickLang(null, "pt", "en-US"), "pt");
  assert.equal(pickLang(null, null, "pt-BR"), "pt");
  assert.equal(pickLang("xx", null, "fr-FR"), "en");
});

test("d-pad: dead centre is neutral, arms are single directions, corners are diagonals", () => {
  const none = { left: false, right: false, up: false, down: false };
  assert.deepEqual(padDirections(3, -4, 80), none);
  assert.deepEqual(padDirections(60, 0, 80), { ...none, right: true });
  assert.deepEqual(padDirections(-60, 5, 80), { ...none, left: true });
  assert.deepEqual(padDirections(0, -60, 80), { ...none, up: true });
  assert.deepEqual(padDirections(50, -50, 80), { ...none, right: true, up: true });
  assert.deepEqual(padDirections(-50, 50, 80), { ...none, left: true, down: true });
});

test("a thumb between A and B presses both, on one button only that one", () => {
  const centres = { b: [100, 100], a: [220, 100] }, reach = 65;
  assert.deepEqual(buttonsAt(100, 100, centres, reach), { b: true, a: false });
  assert.deepEqual(buttonsAt(225, 110, centres, reach), { b: false, a: true });
  assert.deepEqual(buttonsAt(160, 100, centres, reach), { b: true, a: true });
  assert.deepEqual(buttonsAt(160, 300, centres, reach), { b: false, a: false });
});

test("sprite atlas has every frame the game draws, for every fighter", () => {
  const meta = JSON.parse(readFileSync(new URL("../assets/sprites.json", import.meta.url)));
  const need = ["idle_0", "idle_1", "idle_2", "idle_3", "walk_0", "walk_1", "jump", "crouch", "punch", "kick",
    "special", "block", "hit", "ko", "dance_0", "dance_1", "dance_2", "dance_3", "dance_4", "dance_5"];
  for (const id of ROSTER) {
    assert.ok(FIGHTERS[id], id);
    assert.deepEqual(need.filter((n) => !meta.fighters[id].includes(n)), [], id);
    assert.equal(meta.portraits[id].length, 4);
    assert.ok(existsSync(new URL(`../assets/${id}.png`, import.meta.url)), `${id}.png`);
  }
  assert.ok(existsSync(new URL("../assets/stage.jpg", import.meta.url)));
});

test("a key tapped and released between two frames is still seen once", async () => {
  const { createInput } = await import("../js/input.js");
  const handlers = {};
  const doc = { addEventListener: (type, fn) => (handlers[type] = fn) };
  globalThis.window = { addEventListener() {} };
  const input = createInput(doc, null, null);
  const ev = (code) => ({ code, target: {}, preventDefault() {} });
  handlers.keydown(ev("KeyZ"));
  handlers.keyup(ev("KeyZ"));
  assert.equal(input.poll().a, true);
  assert.equal(input.poll().a, false);
  handlers.keydown(ev("ArrowLeft"));
  assert.equal(input.poll().left, true);
  assert.equal(input.poll().left, true);      // still held
  handlers.keyup(ev("ArrowLeft"));
  assert.equal(input.poll().left, false);
  // Taps made while the game is paused are dropped, and Ctrl/Cmd shortcuts are not game input.
  handlers.keydown(ev("KeyZ"));
  handlers.keyup(ev("KeyZ"));
  input.clear();
  assert.equal(input.poll().a, false);
  handlers.keydown({ ...ev("KeyS"), ctrlKey: true });
  assert.equal(input.poll().down, false);
  delete globalThis.window;
});
