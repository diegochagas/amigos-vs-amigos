// Pure fight logic: no DOM, no timers, no Math.random. step() advances one 60 Hz frame.
import {
  STAGE_W, MAX_HP, MAX_METER, ROUND_TIME, TIMER_TICK, WINS_NEEDED, WALK_FWD, WALK_BACK,
  JUMP_VY, JUMP_VX, GRAVITY, EDGE, BODY_GAP, MAX_SPREAD, INTRO_FRAMES, KO_FRAMES, WIN_FRAMES,
  MOVES, PROJECTILE, HURT,
} from "./config.js";

export const NO_INPUT = Object.freeze({ left: false, right: false, up: false, down: false, a: false, b: false });
const NEUTRAL = new Set(["idle", "walk", "crouch"]);
const WIN_DELAY = 80;               // frames after the KO before the winner celebrates

function createFighter(id, side) {
  return {
    id, side, x: 0, y: 0, vx: 0, vy: 0, facing: side === 0 ? 1 : -1,
    state: "idle", t: 0, stun: 0, hp: MAX_HP, meter: 0, wins: 0,
    hitDone: false, combo: 0, back: false, prev: { a: false, b: false },
  };
}

function resetRound(m) {
  m.fighters.forEach((f, i) => {
    Object.assign(f, {
      x: STAGE_W / 2 + (i === 0 ? -190 : 190), y: 0, vx: 0, vy: 0, facing: i === 0 ? 1 : -1,
      state: "idle", t: 0, stun: 0, hp: MAX_HP, hitDone: false, combo: 0, back: false,
    });
  });
  m.projectiles = [];
  m.phase = "intro";
  m.t = 0;
  m.time = ROUND_TIME;
  m.freeze = 0;
  m.roundWinner = null;
}

export function createMatch(p1, p2) {
  const m = { fighters: [createFighter(p1, 0), createFighter(p2, 1)], round: 1, winner: null, events: [] };
  resetRound(m);
  return m;
}

export function hurtBox(f) {
  const h = f.state === "crouch" ? HURT.crouch : f.y < 0 ? HURT.air : HURT.stand;
  return [f.x + h[0], f.x + h[1], f.y + h[2], f.y + h[3]];
}

export function attackBox(f) {
  const mv = MOVES[f.state];
  if (!mv || !mv.box) return null;
  const from = mv.startup, to = mv.startup + mv.active;
  if (f.t < from || f.t >= to) return null;
  const [x0, x1, y0, y1] = mv.box;
  const a = f.x + f.facing * x0, b = f.x + f.facing * x1;
  return [Math.min(a, b), Math.max(a, b), f.y + y0, f.y + y1];
}

const overlap = (a, b) => a[0] < b[1] && a[1] > b[0] && a[2] < b[3] && a[3] > b[2];

function setState(f, state) {
  f.state = state;
  f.t = 0;
  f.hitDone = false;
}

function startSuper(f, m) {
  if (f.meter >= MAX_METER) {
    f.meter = 0;
    setState(f, "hyper");
    m.freeze = 34;
    m.events.push({ type: "super", who: f.side });
  } else {
    setState(f, "special");
  }
  f.vx = 0;
}

function stepFighter(f, inp, opp, m) {
  const pressA = inp.a && !f.prev.a, pressB = inp.b && !f.prev.b;
  f.prev.a = inp.a;
  f.prev.b = inp.b;
  f.t++;
  f.back = f.facing === 1 ? inp.left : inp.right;
  const both = (pressA && inp.b) || (pressB && inp.a);

  if (NEUTRAL.has(f.state)) {
    f.facing = opp.x >= f.x ? 1 : -1;
    f.back = f.facing === 1 ? inp.left : inp.right;
    if (both) startSuper(f, m);
    else if (pressA || pressB) {
      setState(f, pressA ? "punch" : "kick");
      f.vx = 0;
      m.events.push({ type: "whoosh" });
    } else if (inp.up) {
      setState(f, "jump");
      f.vy = JUMP_VY;
      f.vx = inp.right ? JUMP_VX : inp.left ? -JUMP_VX : 0;
      m.events.push({ type: "jump" });
    } else if (inp.down) {
      if (f.state !== "crouch") setState(f, "crouch");
      f.vx = 0;
    } else if (inp.left !== inp.right) {
      if (f.state !== "walk") setState(f, "walk");
      const dir = inp.right ? 1 : -1;
      f.vx = dir * (dir === f.facing ? WALK_FWD : WALK_BACK);
    } else {
      if (f.state !== "idle") setState(f, "idle");
      f.vx = 0;
    }
  } else if (f.state === "punch" || f.state === "kick") {
    const mv = MOVES[f.state];
    // Pressing the other button during startup turns the move into the special.
    if (f.t <= mv.startup && both) startSuper(f, m);
    else if (f.t >= mv.startup + mv.active + mv.recovery) setState(f, "idle");
  } else if (f.state === "jump") {
    if (pressA || pressB) {
      setState(f, "air");
      m.events.push({ type: "whoosh" });
    }
  } else if (f.state === "special") {
    const mv = MOVES.special;
    if (f.t === mv.startup && m.phase === "fight" && !m.projectiles.some((p) => p.owner === f.side)) {
      m.projectiles.push({ owner: f.side, x: f.x + f.facing * 70, y: PROJECTILE.y, vx: f.facing * PROJECTILE.speed });
      f.meter = Math.min(MAX_METER, f.meter + mv.gain);
      m.events.push({ type: "fire", who: f.side });
    }
    if (f.t >= mv.startup + mv.recovery) setState(f, "idle");
  } else if (f.state === "hyper") {
    const mv = MOVES.hyper;
    if (f.t >= mv.startup + mv.active + mv.recovery) setState(f, "idle");
  } else if (f.state === "block") {
    f.vx *= 0.8;
    if (f.t >= f.stun) setState(f, "idle");
  } else if (f.state === "hit") {
    f.vx *= 0.86;
    if (f.t >= f.stun && f.y >= 0) {
      setState(f, "idle");
      opp.combo = 0;
    }
  } else if (f.state === "ko") {
    if (f.y >= 0) f.vx *= 0.9;
  }

  // Physics.
  f.x += f.vx;
  if (f.y < 0 || f.vy < 0) {
    f.vy += GRAVITY;
    f.y += f.vy;
    if (f.y >= 0) {
      f.y = 0;
      f.vy = 0;
      if (f.state === "jump" || f.state === "air") {
        setState(f, "idle");
        f.vx = 0;
      } else if (f.state === "ko") {
        m.events.push({ type: "thud" });
      }
    }
  }
}

function applyHit(att, def, mv, m, at) {
  const canBlock = def.y >= 0 && (NEUTRAL.has(def.state) || def.state === "block") && def.back;
  if (canBlock) {
    def.hp = Math.max(Math.min(def.hp, 1), def.hp - (mv.chip || 0));   // chip never kills, never heals
    setState(def, "block");
    def.stun = mv.blockstun;
    def.vx = att.facing * mv.push;
    m.events.push({ type: "block", x: at[0], y: at[1] });
    return;
  }
  att.combo = def.state === "hit" ? att.combo + 1 : 1;
  const scale = Math.max(0.4, 1 - 0.1 * (att.combo - 1));
  def.hp = Math.max(0, def.hp - mv.dmg * scale);
  att.meter = Math.min(MAX_METER, att.meter + mv.gain);
  def.meter = Math.min(MAX_METER, def.meter + mv.gain / 2);
  setState(def, "hit");
  def.stun = mv.hitstun;
  def.vx = att.facing * mv.push;
  if (def.y < 0) def.vy = -6;
  m.events.push({ type: "hit", x: at[0], y: at[1], heavy: mv.dmg >= 9, combo: att.combo, who: att.side });
  if (def.hp <= 0) {
    setState(def, "ko");
    def.vy = -11;
    def.vx = att.facing * 6.5;
    endRound(m, att.side, "ko");
  }
}

function endRound(m, winner, how) {
  m.phase = "ko";
  m.t = 0;
  m.roundWinner = winner;
  m.projectiles = [];
  m.events.push({ type: how, who: winner });
}

function resolveHits(m) {
  const [a, b] = m.fighters;
  for (const [att, def] of [[a, b], [b, a]]) {
    if (m.phase !== "fight" || def.state === "ko") continue;
    const box = attackBox(att);
    if (!box) continue;
    const mv = MOVES[att.state];
    if (att.state === "hyper") {
      if ((att.t - mv.startup) % mv.every !== 0) continue;
    } else if (att.hitDone) continue;
    const hurt = hurtBox(def);
    if (!overlap(box, hurt)) continue;
    att.hitDone = true;
    const hx = Math.max(box[0], hurt[0]) / 2 + Math.min(box[1], hurt[1]) / 2;
    applyHit(att, def, mv, m, [hx, Math.max(box[2], hurt[2]) / 2 + Math.min(box[3], hurt[3]) / 2]);
  }
}

function stepProjectiles(m) {
  const r = PROJECTILE.r;
  for (const p of m.projectiles) p.x += p.vx;
  const [p0, p1] = [m.projectiles.find((p) => p.owner === 0), m.projectiles.find((p) => p.owner === 1)];
  if (p0 && p1 && Math.abs(p0.x - p1.x) < r * 2) {
    m.events.push({ type: "block", x: (p0.x + p1.x) / 2, y: PROJECTILE.y });
    m.projectiles = [];
    return;
  }
  m.projectiles = m.projectiles.filter((p) => {
    if (p.x < -60 || p.x > STAGE_W + 60) return false;
    const def = m.fighters[1 - p.owner];
    if (def.state === "ko" || m.phase !== "fight") return true;
    if (!overlap([p.x - r, p.x + r, p.y - r, p.y + r], hurtBox(def))) return true;
    applyHit(m.fighters[p.owner], def, MOVES.special, m, [p.x, p.y]);
    return false;
  });
  if (m.phase !== "fight") m.projectiles = [];      // that hit ended the round
}

function separate(m) {
  const [a, b] = m.fighters;
  if (a.state !== "ko" && b.state !== "ko" && Math.abs(a.y - b.y) < 120) {
    const dx = b.x - a.x, gap = BODY_GAP - Math.abs(dx);
    if (gap > 0) {
      const dir = dx === 0 ? (a.side === 0 ? 1 : -1) : Math.sign(dx);
      a.x -= (dir * gap) / 2;
      b.x += (dir * gap) / 2;
    }
  }
  for (const f of m.fighters) f.x = Math.min(STAGE_W - EDGE, Math.max(EDGE, f.x));
  // Re-apply the gap after the wall clamp so nobody is pushed through a cornered fighter.
  if (a.state !== "ko" && b.state !== "ko" && Math.abs(a.y - b.y) < 120 && Math.abs(b.x - a.x) < BODY_GAP) {
    const left = a.x <= b.x ? a : b, right = left === a ? b : a;
    if (left.x <= EDGE) right.x = left.x + BODY_GAP;
    else left.x = right.x - BODY_GAP;
  }
  const spread = Math.abs(a.x - b.x) - MAX_SPREAD;
  if (spread > 0) {
    const left = a.x < b.x ? a : b, right = left === a ? b : a;
    left.x += spread / 2;
    right.x -= spread / 2;
  }
}

export function step(m, in0 = NO_INPUT, in1 = NO_INPUT) {
  m.events = [];
  if (m.phase === "over") return m;
  m.t++;
  if (m.phase === "intro") {
    if (m.t === 1) m.events.push({ type: "round", n: m.round });
    if (m.t === INTRO_FRAMES - 40) m.events.push({ type: "fight" });
    if (m.t >= INTRO_FRAMES) {
      m.phase = "fight";
      m.t = 0;
    }
    return m;
  }
  if (m.phase === "fight") {
    if (m.freeze > 0) {
      m.freeze--;
      return m;
    }
    const [a, b] = m.fighters;
    stepFighter(a, in0, b, m);
    stepFighter(b, in1, a, m);
    separate(m);
    resolveHits(m);
    if (m.phase === "fight") stepProjectiles(m);
    if (m.phase === "fight" && m.t % TIMER_TICK === 0) {
      m.time--;
      if (m.time <= 0) {
        m.time = 0;
        endRound(m, a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1, "timeup");
      }
    }
    return m;
  }
  // phase "ko": the round is decided; let bodies settle, then celebrate, then move on.
  const slow = m.t < 50 && m.t % 2 === 1;
  if (!slow) {
    const [a, b] = m.fighters;
    for (const f of m.fighters) if (NEUTRAL.has(f.state) && f.state !== "idle") setState(f, "idle");
    stepFighter(a, NO_INPUT, b, m);
    stepFighter(b, NO_INPUT, a, m);
    separate(m);
  }
  const w = m.roundWinner === null ? null : m.fighters[m.roundWinner];
  if (w && m.t >= WIN_DELAY && w.state === "idle") setState(w, "win");
  if (m.t >= KO_FRAMES + WIN_FRAMES) {
    if (w) w.wins++;
    if (w && w.wins >= WINS_NEEDED) {
      m.phase = "over";
      m.winner = m.roundWinner;
      m.events.push({ type: "over", who: m.winner });
    } else {
      if (w) m.round++;
      resetRound(m);
    }
  }
  return m;
}
