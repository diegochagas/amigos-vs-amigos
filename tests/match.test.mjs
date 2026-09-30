// Pure fight logic, no DOM, no dependencies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRng } from "../js/rng.js";
import { createMatch, step, NO_INPUT, hurtBox, attackBox } from "../js/match.js";
import { createAi, aiInput } from "../js/ai.js";
import { INTRO_FRAMES, TIMER_TICK, MAX_HP, MAX_METER, MOVES, STAGE_W, EDGE, BODY_GAP, WINS_NEEDED } from "../js/config.js";

const inp = (keys) => ({ ...NO_INPUT, ...keys });
function ready() {
  const m = createMatch("jose", "rachel");
  for (let i = 0; i < INTRO_FRAMES; i++) step(m);
  assert.equal(m.phase, "fight");
  return m;
}
function run(m, frames, a = NO_INPUT, b = NO_INPUT) {
  const seen = [];
  for (let i = 0; i < frames; i++) seen.push(...step(m, a, b).events);
  return seen;
}
function closeIn(m) {
  m.fighters[0].x = 500;
  m.fighters[1].x = 600;
}

test("seeded RNG is deterministic and in [0, 1)", () => {
  const a = createRng(42), b = createRng(42), c = createRng(43);
  const xs = [a(), a(), a()];
  assert.deepEqual(xs, [b(), b(), b()]);
  assert.notDeepEqual(xs, [c(), c(), c()]);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test("nobody can act or be hurt during the round intro", () => {
  const m = createMatch("jose", "rachel");
  closeIn(m);
  run(m, INTRO_FRAMES - 1, inp({ a: true }));
  assert.equal(m.phase, "intro");
  assert.equal(m.fighters[1].hp, MAX_HP);
});

test("a punch in range hits once, damages, builds meter and pushes back", () => {
  const m = ready();
  closeIn(m);
  const x0 = m.fighters[1].x;
  const ev = run(m, 1, inp({ a: true })).concat(run(m, 20));
  assert.equal(ev.filter((e) => e.type === "hit").length, 1);
  assert.equal(m.fighters[1].hp, MAX_HP - MOVES.punch.dmg);
  assert.equal(m.fighters[0].meter, MOVES.punch.gain);
  assert.ok(m.fighters[1].x > x0);
});

test("a punch out of range whiffs", () => {
  const m = ready();
  run(m, 1, inp({ a: true }));
  run(m, 20);
  assert.equal(m.fighters[1].hp, MAX_HP);
});

test("holding back blocks a kick and takes no damage", () => {
  const m = ready();
  closeIn(m);
  const ev = run(m, 1, inp({ b: true }), inp({ right: true })).concat(run(m, 12, NO_INPUT, inp({ right: true })));
  assert.ok(ev.some((e) => e.type === "block"));
  assert.equal(m.fighters[1].hp, MAX_HP);
});

test("A+B throws a projectile that crosses the stage and hits", () => {
  const m = ready();
  const ev = run(m, 1, inp({ a: true, b: true })).concat(run(m, 80));
  assert.ok(ev.some((e) => e.type === "fire"));
  assert.equal(m.fighters[1].hp, MAX_HP - MOVES.special.dmg);
  assert.equal(m.projectiles.length, 0);
});

test("crouching ducks under a projectile", () => {
  const m = ready();
  run(m, 1, inp({ a: true, b: true }));
  run(m, 80, NO_INPUT, inp({ down: true }));
  assert.equal(m.fighters[1].hp, MAX_HP);
});

test("pressing B just after A still gives the special (touch screens)", () => {
  const m = ready();
  run(m, 2, inp({ a: true }));
  run(m, 1, inp({ a: true, b: true }));
  assert.equal(m.fighters[0].state, "special");
});

test("a full meter turns A+B into the hyper, which empties the meter and hits many times", () => {
  const m = ready();
  m.fighters[0].meter = MAX_METER;
  const ev = run(m, 1, inp({ a: true, b: true })).concat(run(m, 160));
  assert.ok(ev.some((e) => e.type === "super"));
  assert.equal(m.fighters[0].meter, 0);
  assert.ok(ev.filter((e) => e.type === "hit").length >= 4);
  assert.ok(m.fighters[1].hp < MAX_HP - 15);
});

test("combo hits scale damage down", () => {
  const m = ready();
  closeIn(m);
  run(m, 1, inp({ a: true }));
  run(m, 5);
  const afterFirst = m.fighters[1].hp;
  m.fighters[0].state = "idle";           // cancel recovery so the second punch lands in hitstun
  m.fighters[1].x = 600;
  run(m, 1, inp({ a: true }));
  run(m, 6);
  assert.equal(m.fighters[0].combo, 2);
  assert.ok(afterFirst - m.fighters[1].hp < MOVES.punch.dmg);
});

test("fighters stay inside the stage and never overlap", () => {
  const m = ready();
  run(m, 400, inp({ right: true }), inp({ right: true }));
  const [a, b] = m.fighters;
  assert.ok(b.x <= STAGE_W - EDGE && a.x >= EDGE);
  assert.ok(Math.abs(b.x - a.x) >= BODY_GAP - 0.001);
});

test("jumping leaves the ground and lands back in idle", () => {
  const m = ready();
  run(m, 5, inp({ up: true }));
  assert.ok(m.fighters[0].y < 0);
  run(m, 60);
  assert.equal(m.fighters[0].y, 0);
  assert.equal(m.fighters[0].state, "idle");
});

test("KO ends the round, the winner gets a win and the next round resets health", () => {
  const m = ready();
  closeIn(m);
  m.fighters[1].hp = 3;
  const ev = run(m, 1, inp({ a: true })).concat(run(m, 12));
  assert.ok(ev.some((e) => e.type === "ko" && e.who === 0));
  assert.equal(m.phase, "ko");
  run(m, 400);
  assert.equal(m.fighters[0].wins, 1);
  assert.equal(m.round, 2);
  assert.equal(m.fighters[1].hp, MAX_HP);
  assert.equal(m.phase, "intro");
});

test("time up gives the round to the fighter with more health", () => {
  const m = ready();
  m.fighters[0].hp = 40;
  m.time = 1;
  const ev = run(m, 60);
  assert.ok(ev.some((e) => e.type === "timeup" && e.who === 1));
});

test("two round wins end the match", () => {
  const m = ready();
  m.fighters[0].wins = WINS_NEEDED - 1;
  closeIn(m);
  m.fighters[1].hp = 1;
  run(m, 1, inp({ a: true }));
  run(m, 500);
  assert.equal(m.phase, "over");
  assert.equal(m.winner, 0);
});

test("boxes follow the fighter's facing", () => {
  const m = ready();
  const f = m.fighters[1];
  f.state = "punch";
  f.t = MOVES.punch.startup;
  const box = attackBox(f);
  assert.ok(box[1] <= f.x && box[0] < box[1]);
  const h = hurtBox(f);
  assert.ok(h[0] < f.x && h[1] > f.x);
});

test("CPU vs CPU with the same seed replays identically and finishes a match", () => {
  const play = (seed) => {
    const rng = createRng(seed), m = createMatch("diego", "jose"), ais = [createAi(2), createAi(2)];
    let frames = 0;
    while (m.phase !== "over" && frames < 60 * 60 * 8) {
      step(m, aiInput(m, 0, ais[0], rng), aiInput(m, 1, ais[1], rng));
      frames++;
    }
    return { frames, winner: m.winner, hp: m.fighters.map((f) => f.hp), phase: m.phase };
  };
  const a = play(7);
  assert.equal(a.phase, "over");
  assert.deepEqual(a, play(7));
});

test("blocking chip damage never raises health", () => {
  const m = ready();
  m.fighters[1].hp = 0.6;
  run(m, 1, inp({ a: true, b: true }), inp({ right: true }));
  run(m, 80, NO_INPUT, inp({ right: true }));
  assert.ok(m.fighters[1].hp <= 0.6 && m.fighters[1].hp > 0);
  assert.equal(m.phase, "fight");
});

test("no projectile survives the end of a round", () => {
  // P2's shot was jumped over and is still flying behind P1 when P1's shot lands the KO.
  const m = ready();
  m.fighters[1].hp = 1;
  run(m, 1, inp({ a: true, b: true }));
  m.projectiles.push({ owner: 1, x: m.fighters[0].x - 120, y: -170, vx: -1 });
  for (let i = 0; i < 200 && m.phase === "fight"; i++) step(m);
  assert.equal(m.phase, "ko");
  assert.deepEqual(m.projectiles, []);
});

test("a special that was mid-cast when time ran out does not fire", () => {
  const m = ready();
  m.fighters[0].hp = 50;
  m.time = 1;
  m.t = TIMER_TICK - 4;
  m.fighters[1].state = "special";
  m.fighters[1].t = MOVES.special.startup - 8;
  const ev = run(m, 40);
  assert.equal(m.phase, "ko");
  assert.ok(!ev.some((e) => e.type === "fire"));
  assert.deepEqual(m.projectiles, []);
});
