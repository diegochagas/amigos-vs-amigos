// CPU opponent: picks short scripted actions from the match state and a seeded RNG.
import { MAX_METER } from "./config.js";

const ATTACKING = new Set(["punch", "kick", "air", "hyper"]);

export function createAi(level = 1) {
  return { level, queue: [] };      // queue: [input, frames] steps still to play
}

const hold = (keys, frames) => [Object.assign({ left: false, right: false, up: false, down: false, a: false, b: false }, keys), frames];

export function aiInput(m, side, ai, rng) {
  const me = m.fighters[side], opp = m.fighters[1 - side];
  if (m.phase !== "fight") {
    ai.queue = [];
    return hold({}, 1)[0];
  }
  if (!ai.queue.length) ai.queue = plan(m, me, opp, ai, rng);
  const stepNow = ai.queue[0];
  if (--stepNow[1] <= 0) ai.queue.shift();
  return stepNow[0];
}

function plan(m, me, opp, ai, rng) {
  const toward = opp.x >= me.x ? "right" : "left";
  const away = toward === "right" ? "left" : "right";
  const dist = Math.abs(opp.x - me.x);
  const skill = Math.min(0.9, 0.25 + 0.2 * ai.level);      // chance to react well
  const pause = Math.max(2, Math.round(22 - 6 * ai.level)); // thinking time between actions
  const shot = m.projectiles.find((p) => p.owner !== me.side);
  const r = rng();

  if (shot && Math.abs(shot.x - me.x) < 260 && rng() < skill) {
    return r < 0.5 ? [hold({ [away]: true }, 22)] : [hold({ up: true, [toward]: true }, 3), hold({}, 20)];
  }
  if (ATTACKING.has(opp.state) && dist < 210 && rng() < skill) return [hold({ [away]: true }, 16)];
  if (me.meter >= MAX_METER && dist < 520 && rng() < 0.5 + skill / 2) {
    return [hold({ a: true, b: true }, 3), hold({}, pause)];
  }
  if (dist > 400) {
    if (r < 0.3) return [hold({ a: true, b: true }, 3), hold({}, pause + 20)];
    if (r < 0.45) return [hold({ up: true, [toward]: true }, 3), hold({}, 12), hold({ b: true }, 3), hold({}, 10)];
    return [hold({ [toward]: true }, 18 + Math.floor(rng() * 16))];
  }
  if (dist > 165) {
    if (r < 0.5) return [hold({ [toward]: true }, 10 + Math.floor(rng() * 10))];
    if (r < 0.65) return [hold({ a: true, b: true }, 3), hold({}, pause + 16)];
    if (r < 0.85) return [hold({ up: true, [toward]: true }, 3), hold({}, 10), hold({ b: true }, 3), hold({}, 8)];
    return [hold({}, pause)];
  }
  if (r < 0.34) return [hold({ a: true }, 3), hold({}, 10), hold({ a: true }, 3), hold({}, pause)];
  if (r < 0.62) return [hold({ b: true }, 3), hold({}, pause + 12)];
  if (r < 0.74) return [hold({ a: true }, 3), hold({}, 11), hold({ b: true }, 3), hold({}, pause + 8)];
  if (r < 0.86) return [hold({ [away]: true }, 14)];
  return [hold({ down: true }, 12)];
}
