// Shared numbers. Distances are game pixels on a 960x540 view, times are 60 Hz frames.
export const VIEW_W = 960;
export const VIEW_H = 540;
export const STAGE_W = 1180;
export const FLOOR_Y = 474;

export const MAX_HP = 100;
export const MAX_METER = 100;
export const ROUND_TIME = 99;
export const TIMER_TICK = 50;
export const WINS_NEEDED = 2;

export const WALK_FWD = 4.4;
export const WALK_BACK = 3.3;
export const JUMP_VY = -17;
export const JUMP_VX = 4.8;
export const GRAVITY = 0.85;
export const EDGE = 60;             // closest a fighter gets to the stage edge
export const BODY_GAP = 74;         // fighters can't stand closer than this
export const MAX_SPREAD = VIEW_W - 150;

export const INTRO_FRAMES = 130;
export const KO_FRAMES = 190;
export const WIN_FRAMES = 170;

// box: [x0, x1, y0, y1] in front of the attacker's feet (y is negative upward).
export const MOVES = {
  punch: { startup: 4, active: 4, recovery: 9, dmg: 6, box: [20, 150, -220, -150], hitstun: 15, blockstun: 9, push: 5, gain: 8 },
  kick: { startup: 7, active: 5, recovery: 15, dmg: 10, box: [20, 182, -215, -105], hitstun: 19, blockstun: 12, push: 8, gain: 11 },
  air: { startup: 3, active: 60, recovery: 0, dmg: 9, box: [0, 170, -200, -30], hitstun: 17, blockstun: 10, push: 6, gain: 9 },
  special: { startup: 13, active: 0, recovery: 24, dmg: 12, chip: 2, hitstun: 18, blockstun: 12, push: 7, gain: 6 },
  hyper: { startup: 26, active: 42, recovery: 26, dmg: 5, chip: 1, every: 6, box: [50, 760, -235, -95], hitstun: 14, blockstun: 10, push: 4, gain: 0 },
};
export const PROJECTILE = { speed: 9.5, y: -170, r: 24 };

export const HURT = {
  stand: [-36, 36, -250, 0],
  crouch: [-42, 42, -135, 0],
  air: [-36, 36, -230, -40],
};

export const FIGHTERS = {
  jose: { name: "JOSÉ", color: "#ff8a1e", glow: "#ffd23c" },
  rachel: { name: "RACHEL", color: "#ff3d6e", glow: "#ffb0d0" },
  diego: { name: "DIEGO", color: "#2ea8ff", glow: "#b8f0ff" },
};
export const ROSTER = ["jose", "rachel", "diego"];
