// Keyboard + on-screen controls -> one { left, right, up, down, a, b, start } object.
const KEYS = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
  KeyA: "left", KeyD: "right", KeyW: "up", KeyS: "down",
  KeyZ: "a", KeyJ: "a", KeyX: "b", KeyK: "b", Enter: "start", Escape: "pause", KeyP: "pause",
};

// Which directions a touch at (dx, dy) from the pad centre means; size = pad half-width.
export function padDirections(dx, dy, size) {
  const dead = size * 0.22, out = { left: false, right: false, up: false, down: false };
  if (Math.hypot(dx, dy) < dead) return out;
  const ang = Math.atan2(dy, dx), slice = Math.PI / 8;      // 8-way, diagonals are 45° wide
  out.right = Math.abs(ang) < 3 * slice;
  out.left = Math.abs(ang) > 5 * slice;
  out.down = ang > slice && ang < 7 * slice;
  out.up = ang < -slice && ang > -7 * slice;
  return out;
}

// A thumb between A and B presses both: each button reacts inside `reach` of its centre.
export function buttonsAt(x, y, centres, reach) {
  const out = {};
  for (const [name, c] of Object.entries(centres)) out[name] = Math.hypot(x - c[0], y - c[1]) <= reach;
  return out;
}

export function createInput(doc, pad, buttons) {
  const keys = {}, state = { left: false, right: false, up: false, down: false, a: false, b: false, start: false, pause: false };
  const padTouches = new Map(), btnTouches = new Map(), latch = {};
  const NAMES = Object.keys(state);

  function refresh() {
    const touch = { left: false, right: false, up: false, down: false, a: false, b: false };
    if (pad) {
      const r = pad.getBoundingClientRect();
      for (const p of padTouches.values()) {
        const d = padDirections(p.x - (r.left + r.width / 2), p.y - (r.top + r.height / 2), r.width / 2);
        for (const k in d) touch[k] = touch[k] || d[k];
      }
      for (const k of ["left", "right", "up", "down"]) pad.classList.toggle(k, touch[k]);
    }
    if (buttons) {
      const centres = {};
      let reach = 0;
      for (const el of buttons.querySelectorAll("[data-btn]")) {
        const r = el.getBoundingClientRect();
        centres[el.dataset.btn] = [r.left + r.width / 2, r.top + r.height / 2];
        reach = r.width * 0.72;
      }
      for (const p of btnTouches.values()) {
        const hit = buttonsAt(p.x, p.y, centres, reach);
        for (const k in hit) touch[k] = touch[k] || hit[k];
      }
      for (const el of buttons.querySelectorAll("[data-btn]")) el.classList.toggle("on", touch[el.dataset.btn]);
    }
    for (const k of NAMES) {
      const on = !!keys[k] || !!touch[k];
      if (on && !state[k]) latch[k] = true;
      state[k] = on;
    }
  }

  // One snapshot per game frame. A press that started and ended between two frames
  // (a quick tap) still shows up once, so it is never lost.
  state.poll = () => {
    const out = {};
    for (const k of NAMES) {
      out[k] = state[k] || !!latch[k];
      latch[k] = false;
    }
    return out;
  };

  doc.addEventListener("keydown", (e) => {
    const k = KEYS[e.code];
    if (!k || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.("#menu")) return;
    keys[k] = true;
    e.preventDefault();
    refresh();
  });
  doc.addEventListener("keyup", (e) => {
    const k = KEYS[e.code];
    if (!k) return;
    keys[k] = false;
    refresh();
  });

  function bind(el, map) {
    if (!el) return;
    const set = (e) => {
      map.set(e.pointerId, { x: e.clientX, y: e.clientY });
      e.preventDefault();
      refresh();
    };
    const drop = (e) => {
      map.delete(e.pointerId);
      refresh();
    };
    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture?.(e.pointerId);
      set(e);
    });
    el.addEventListener("pointermove", (e) => map.has(e.pointerId) && set(e));
    el.addEventListener("pointerup", drop);
    el.addEventListener("pointercancel", drop);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  // Forget taps made while nobody was reading (the pause menu was open).
  state.clear = () => {
    for (const k in latch) latch[k] = false;
  };
  bind(pad, padTouches);
  bind(buttons, btnTouches);
  window.addEventListener("blur", () => {
    for (const k in keys) keys[k] = false;
    for (const k in latch) latch[k] = false;
    padTouches.clear();
    btnTouches.clear();
    refresh();
  });
  return state;
}
