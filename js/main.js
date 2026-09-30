// Boot, scenes (title -> select -> vs -> fight -> continue/ending) and the 60 Hz loop.
import { VIEW_W, VIEW_H, STAGE_W, FLOOR_Y, MAX_HP, INTRO_FRAMES, FIGHTERS, ROSTER, WINS_NEEDED } from "./config.js";
import { createRng } from "./rng.js";
import { createMatch, step, NO_INPUT } from "./match.js";
import { createAi, aiInput } from "./ai.js";
import { createInput } from "./input.js";
import { createRenderer } from "./render.js";
import { t, setLang, getLang, pickLang } from "./i18n.js";
import { initAudio, sfx, startMusic, stopMusic, setMuted, isMuted } from "./audio.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed")) || (Date.now() & 0x7fffffff);
const rng = createRng(seed);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const canvas = $("game");
const game = { scene: "loading", t: 0, cursor: 0, player: null, ladder: [], stage: 0, match: null, ai: null, paused: false, endKind: "ko", overT: 0 };
let R = null, input = null, prev = {}, taps = [];

function loadImage(src) {
  return new Promise((ok, fail) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => fail(new Error(`could not load ${src}`));
    im.src = src;
  });
}

async function boot() {
  setLang(pickLang(params.get("lang"), store.get("ava.lang"), navigator.language));
  setMuted(store.get("ava.muted") === "1");
  applyLang();
  const meta = await (await fetch("assets/sprites.json")).json();
  const [stage, ...imgs] = await Promise.all([loadImage("assets/stage.jpg"), ...ROSTER.map((id) => loadImage(`assets/${id}.png`))]);
  const sheets = Object.fromEntries(ROSTER.map((id, i) => [id, imgs[i]]));
  R = createRenderer(canvas, { meta, sheets, stage });
  input = createInput(document, $("pad"), $("buttons"));
  if (matchMedia("(pointer: coarse)").matches || params.get("touch") === "1") document.body.classList.add("touch");
  window.addEventListener("touchstart", () => document.body.classList.add("touch"), { once: true, passive: true });
  bindUi();
  go("title");
  let last = performance.now(), acc = 0;
  const frame = (now) => {
    acc += Math.min(100, now - last);
    last = now;
    while (acc >= 1000 / 60) {
      acc -= 1000 / 60;
      if (!game.paused) update();
    }
    draw();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function go(scene) {
  game.scene = scene;
  game.t = 0;
  document.body.dataset.scene = scene;
  $("status").textContent = scene;
}

function applyLang() {
  document.documentElement.lang = getLang() === "pt" ? "pt-BR" : "en";
  $("langBtn").textContent = t("lang");
  $("menuBtn").setAttribute("aria-label", t("menu"));
  $("menuTitle").textContent = t("paused");
  $("resumeBtn").textContent = t("resume");
  $("soundBtn").textContent = t(isMuted() ? "soundOff" : "soundOn");
  $("fullBtn").textContent = t("fullscreen");
  $("quitBtn").textContent = t("quit");
  $("help").textContent = t("help");
  $("helpKeys").textContent = t("helpKeys");
}

function setPaused(p) {
  game.paused = p;
  $("menu").hidden = !p;
  if (p) stopMusic();
  else {
    input.clear();
    if (game.scene === "fight") startMusic();
  }
}

// Full screen + landscape lock. False when the browser has no API (iPhone) or refuses.
async function enterFullscreen() {
  const el = document.documentElement;
  if (!el.requestFullscreen) return false;
  try {
    await el.requestFullscreen({ navigationUI: "hide" });
  } catch {
    return false;
  }
  try {
    await screen.orientation?.lock?.("landscape");
  } catch { /* desktop browsers cannot lock */ }
  return true;
}

function bindUi() {
  const wake = () => initAudio();
  // iOS only unlocks audio from touchend/click, other browsers from pointerdown/keydown.
  for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) window.addEventListener(type, wake);
  // Keep keyboard focus off the corner buttons so Enter/Z go to the game.
  for (const id of ["langBtn", "menuBtn"]) $(id).addEventListener("click", (e) => e.currentTarget.blur());
  $("langBtn").addEventListener("click", () => {
    setLang(getLang() === "pt" ? "en" : "pt");
    store.set("ava.lang", getLang());
    applyLang();
  });
  $("menuBtn").addEventListener("click", () => setPaused(!game.paused));
  $("resumeBtn").addEventListener("click", () => setPaused(false));
  $("soundBtn").addEventListener("click", () => {
    setMuted(!isMuted());
    store.set("ava.muted", isMuted() ? "1" : "0");
    applyLang();
  });
  $("fullBtn").addEventListener("click", async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    else await enterFullscreen();
    setPaused(false);
  });
  // Browsers only allow full screen from a tap or key press, so the first one does it.
  if (params.get("fullscreen") !== "0") {
    let tries = 0;
    const auto = async (e) => {
      if (e.code === "Escape" || e.target.closest?.("#top, #menu")) return;
      if (document.fullscreenElement || ++tries > 3 || (await enterFullscreen())) {
        for (const type of ["pointerup", "keydown"]) window.removeEventListener(type, auto);
      }
    };
    for (const type of ["pointerup", "keydown"]) window.addEventListener(type, auto);
  }
  $("quitBtn").addEventListener("click", () => {
    setPaused(false);
    stopMusic();
    go("title");
  });
  window.addEventListener("keydown", (e) => {
    if (!game.paused || e.target.closest?.("#menu")) return;
    if (e.code === "Escape" || e.code === "KeyP" || e.code === "Enter") setPaused(false);
  });
  canvas.addEventListener("pointerdown", (e) => {
    const r = canvas.getBoundingClientRect();
    taps.push({ x: ((e.clientX - r.left) / r.width) * VIEW_W, y: ((e.clientY - r.top) / r.height) * VIEW_H });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.scene === "fight") setPaused(true);
  });
}

// ---------- update ----------
const SELECT = { size: 132, gap: 26, y: 330 };
const selectX = (i) => VIEW_W / 2 - (ROSTER.length * SELECT.size + (ROSTER.length - 1) * SELECT.gap) / 2 + i * (SELECT.size + SELECT.gap);

function startFight() {
  game.match = createMatch(game.player, game.ladder[game.stage]);
  game.ai = createAi(game.stage + 1);
  game.overT = 0;
  R.resetCamera();
  startMusic();
  go("fight");
}

function update() {
  game.t++;
  R.tick();
  const now = input.poll(), press = {};
  for (const k of ["left", "right", "up", "down", "a", "b", "start", "pause"]) press[k] = now[k] && !prev[k];
  prev = now;
  const myTaps = taps;
  taps = [];
  const ok = press.a || press.start;
  if ((press.pause || press.start) && game.scene === "fight") return setPaused(true);

  if (game.scene === "title") {
    if (ok || myTaps.length) {
      sfx("ok");
      go("select");
    }
  } else if (game.scene === "select") {
    const n = ROSTER.length;
    let pick = ok;
    if (press.left || press.right) {
      game.cursor = (game.cursor + (press.right ? 1 : n - 1)) % n;
      sfx("blip");
    }
    for (const p of myTaps) {
      const i = ROSTER.findIndex((_, k) => p.x >= selectX(k) && p.x <= selectX(k) + SELECT.size && p.y >= SELECT.y && p.y <= SELECT.y + SELECT.size);
      if (i < 0) continue;
      if (i === game.cursor) pick = true;
      else {
        game.cursor = i;
        sfx("blip");
      }
    }
    if (press.b) go("title");
    else if (pick) {
      game.player = ROSTER[game.cursor];
      const others = ROSTER.filter((id) => id !== game.player);
      if (rng() < 0.5) others.reverse();
      game.ladder = [...others, game.player];   // last stage: your own shadow
      game.stage = 0;
      sfx("ok");
      go("vs");
    }
  } else if (game.scene === "vs") {
    if (game.t === 1) sfx("round");
    if (game.t > 170 || (game.t > 40 && (ok || myTaps.length))) startFight();
  } else if (game.scene === "fight") {
    const m = game.match;
    step(m, m.phase === "fight" ? now : NO_INPUT, aiInput(m, 1, game.ai, rng));
    R.consume(m.events);
    for (const e of m.events) {
      if (e.type === "hit") sfx(e.heavy ? "heavy" : "hit");
      else if (e.type === "ko" || e.type === "timeup") {
        game.endKind = e.type;
        sfx("ko");
      } else if (e.type === "over") sfx(e.who === 0 ? "win" : "lose");
      else sfx(e.type);
    }
    if (m.phase === "over" && ++game.overT > 40) {
      stopMusic();
      if (m.winner === 0) {
        game.stage++;
        go(game.stage >= game.ladder.length ? "ending" : "vs");
        if (game.scene === "ending") sfx("win");
      } else go("continue");
    }
  } else if (game.scene === "continue") {
    if (game.t > 30 && (ok || myTaps.length)) {
      sfx("ok");
      go("vs");
    } else if (game.t > 60 * 10 + 120) go("title");
  } else if (game.scene === "ending") {
    if (game.t > 150 && (ok || myTaps.length)) go("title");
  }
}

// ---------- draw ----------
const isFinal = () => game.stage === game.ladder.length - 1;
const foeName = () => (isFinal() ? `${t("shadow")} ${FIGHTERS[game.player].name}` : FIGHTERS[game.ladder[game.stage]].name);
const idleFrame = (k = 0) => `idle_${[0, 1, 2, 3, 2, 1][Math.floor((game.t + k) / 8) % 6]}`;
const danceFrame = (k = 0) => `dance_${Math.floor((game.t + k) / 9) % 6}`;
const blink = () => Math.floor(game.t / 28) % 2 === 0;

function backdrop(hue) {
  const { ctx } = R;
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, `hsl(${hue},85%,14%)`);
  g.addColorStop(1, `hsl(${hue + 40},90%,32%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#fff";
  for (let i = -2; i < 14; i++) {
    const x = i * 110 + ((game.t * 1.5) % 110);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 40, 0);
    ctx.lineTo(x - 160, VIEW_H);
    ctx.lineTo(x - 200, VIEW_H);
    ctx.fill();
  }
  ctx.restore();
}

function draw() {
  if (!R) return;
  const { ctx, text, sprite, portrait, banner } = R;
  ctx.imageSmoothingEnabled = true;
  const s = game.scene;
  if (s === "title") {
    R.resetCamera((STAGE_W - VIEW_W) / 2 + Math.sin(game.t / 240) * 100);
    R.drawStage(0.35);
    ROSTER.forEach((id, i) => sprite(id, idleFrame(i * 7), 250 + i * 230, FLOOR_Y + 30, i === 2 ? -1 : 1, 1));
    ctx.save();
    ctx.translate(VIEW_W / 2, 118);
    ctx.rotate(-0.035);
    text("AMIGOS", -150, -28, 96, { fill: "gold", stroke: "#7a1200", lineWidth: 14 });
    text("VS.", 118, -6, 62, { fill: "#fff", stroke: "#c4001a", lineWidth: 12 });
    text("AMIGOS", 120, 62, 96, { fill: "gold", stroke: "#10104a", lineWidth: 14 });
    ctx.restore();
    text(t("subtitle"), VIEW_W / 2, 238, 26, { fill: "#8fe9ff" });
    if (blink()) text(t(document.body.classList.contains("touch") ? "startTouch" : "start"), VIEW_W / 2, VIEW_H - 76, 30, { fill: "#fff" });
  } else if (s === "select") {
    backdrop(225);
    const id = ROSTER[game.cursor];
    text(t("choose"), VIEW_W / 2, 46, 44, { fill: "gold", stroke: "#7a1200" });
    sprite(id, idleFrame(), 190, 330, 1, 1.05);
    text(FIGHTERS[id].name, VIEW_W / 2, 118, 64, { fill: "#fff", stroke: FIGHTERS[id].color, lineWidth: 12 });
    ROSTER.forEach((fid, i) => {
      portrait(fid, selectX(i), SELECT.y, SELECT.size);
      text(FIGHTERS[fid].name, selectX(i) + SELECT.size / 2, SELECT.y + SELECT.size + 20, 22);
    });
    const cx = selectX(game.cursor);
    ctx.lineWidth = 8;
    ctx.strokeStyle = blink() ? "#ffe600" : "#ff3d3d";
    ctx.strokeRect(cx - 6, SELECT.y - 6, SELECT.size + 12, SELECT.size + 12);
    text("1P", cx + 8, SELECT.y - 14, 26, { fill: "#ff3d3d", stroke: "#fff", lineWidth: 5, align: "left" });
    text(t("confirm"), VIEW_W / 2, VIEW_H - 64, 22, { fill: "#8fe9ff" });
  } else if (s === "vs") {
    backdrop(isFinal() ? 285 : 350);
    const foe = game.ladder[game.stage], k = Math.min(1, game.t / 18);
    sprite(game.player, idleFrame(), -200 + 430 * k, 505, 1, 1.5);
    sprite(foe, idleFrame(11), VIEW_W + 200 - 430 * k, 505, -1, 1.5, { shadow: isFinal() });
    text(isFinal() ? t("final") : `${t("stage")} ${game.stage + 1}`, VIEW_W / 2, 50, 40, { fill: "#fff" });
    banner("VS", game.t, 150, VIEW_H / 2 - 10);
    text(FIGHTERS[game.player].name, 30, VIEW_H - 40, 46, { align: "left", stroke: FIGHTERS[game.player].color, lineWidth: 10 });
    text(foeName(), VIEW_W - 30, VIEW_H - 40, 46, { align: "right", stroke: isFinal() ? "#5b1d8f" : FIGHTERS[foe].color, lineWidth: 10, maxWidth: 430 });
  } else if (s === "fight") {
    const m = game.match;
    R.drawMatch(m, { p1: FIGHTERS[game.player].name, p2: foeName(), shadow: isFinal() });
    if (m.phase === "intro") {
      const cut = INTRO_FRAMES - 40;
      const last = m.fighters[0].wins === WINS_NEEDED - 1 && m.fighters[1].wins === WINS_NEEDED - 1;
      if (m.t < cut) banner(last ? t("finalRound") : `${t("round")} ${m.round}`, m.t);
      else banner(t("fight"), m.t - cut, 120);
    } else if (m.phase === "ko" || m.phase === "over") {
      const w = m.phase === "over" ? m.winner : m.roundWinner, k = m.phase === "over" ? 999 : m.t;
      if (k < 95) banner(t(game.endKind === "timeup" ? "timeup" : "ko"), k, 140);
      else {
        banner(w === null ? t("draw") : t(w === 0 ? "youWin" : "youLose"), k - 95, 96);
        if (w !== null && m.fighters[w].hp >= MAX_HP) text(t("perfect"), VIEW_W / 2, VIEW_H * 0.42 + 78, 44, { fill: "#8fe9ff" });
      }
    }
    if (game.paused) {
      ctx.fillStyle = "rgba(0,0,30,.6)";
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  } else if (s === "continue") {
    R.drawStage(0.7);
    sprite(game.player, "ko", VIEW_W / 2, FLOOR_Y + 20, 1, 1);
    const left = 9 - Math.floor(game.t / 60);
    if (left >= 0) {
      text(t("continue"), VIEW_W / 2, 150, 84, { fill: "gold", stroke: "#7a1200" });
      text(String(left), VIEW_W / 2, 270, 130, { fill: "#fff", stroke: "#c4001a", plain: true });
    } else text(t("gameOver"), VIEW_W / 2, 200, 100, { fill: "#ff3d3d", stroke: "#fff" });
  } else if (s === "ending") {
    R.resetCamera();
    R.drawStage(0.25);
    const others = ROSTER.filter((id) => id !== game.player);
    sprite(others[0], danceFrame(3), 210, FLOOR_Y + 24, 1, 1);
    sprite(others[1], danceFrame(6), VIEW_W - 210, FLOOR_Y + 24, -1, 1);
    sprite(game.player, danceFrame(), VIEW_W / 2, FLOOR_Y + 50, 1, 1.25);
    banner(t("congrats"), game.t, 78, 80);
    text(`${FIGHTERS[game.player].name} ${t("champion")}`, VIEW_W / 2, 150, 40, { fill: "#fff", stroke: FIGHTERS[game.player].color, lineWidth: 9 });
    if (game.t > 150 && blink()) text(t("thanks"), VIEW_W / 2, VIEW_H - 70, 28, { fill: "#8fe9ff" });
  }
}

// Read-only peek for the e2e tests.
window.__game = { seed, get scene() { return game.scene; }, get match() { return game.match; }, get paused() { return game.paused; } };

boot().catch((err) => {
  console.error(err);
  $("status").textContent = `error: ${err.message}`;
});
