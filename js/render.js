// Canvas drawing: stage, fighters, effects and HUD. Reads match state, never changes it.
import { VIEW_W, VIEW_H, STAGE_W, FLOOR_Y, MAX_HP, MAX_METER, MOVES, PROJECTILE, FIGHTERS, WINS_NEEDED } from "./config.js";
import { t } from "./i18n.js";

const FONT = '"Arial Black", "Arial Bold", Impact, "Helvetica Neue", Arial, sans-serif';
const STAGE_H = 792, STAGE_Y = -190;        // stage image is drawn 1180 wide; its top is cropped

export function createRenderer(canvas, assets) {
  const ctx = canvas.getContext("2d");
  const { meta, sheets, stage } = assets;
  const [CW, CH] = meta.cell, [AX, AY] = meta.anchor;
  const fx = [];                             // sparks and flashes, render-side only
  let camX = (STAGE_W - VIEW_W) / 2, shake = 0, tick = 0;

  // Dark purple copy of a fighter for the final "shadow" opponent. Built by hand because
  // canvas filters are missing on iOS Safari.
  const shadows = {};
  function shadowSheet(id) {
    if (shadows[id]) return shadows[id];
    const c = document.createElement("canvas");
    c.width = sheets[id].width;
    c.height = sheets[id].height;
    const x = c.getContext("2d");
    x.drawImage(sheets[id], 0, 0);
    const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) * 0.45;
      d[i] = l * 0.95 + 18;
      d[i + 1] = l * 0.6;
      d[i + 2] = l * 1.35 + 30;
    }
    x.putImageData(img, 0, 0);
    return (shadows[id] = c);
  }

  function text(str, x, y, size, o = {}) {
    ctx.save();
    ctx.font = `${o.plain ? "" : "italic "}900 ${size}px ${FONT}`;
    ctx.textAlign = o.align || "center";
    ctx.textBaseline = o.baseline || "middle";
    ctx.lineJoin = "round";
    if (o.maxWidth) {
      const w = ctx.measureText(str).width;
      if (w > o.maxWidth) ctx.font = `${o.plain ? "" : "italic "}900 ${Math.floor(size * o.maxWidth / w)}px ${FONT}`;
    }
    if (o.stroke !== null) {
      ctx.lineWidth = o.lineWidth || Math.max(3, size / 6);
      ctx.strokeStyle = o.stroke || "#10104a";
      ctx.strokeText(str, x, y);
    }
    let fill = o.fill || "#fff";
    if (fill === "gold") {
      fill = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
      fill.addColorStop(0, "#fff7a8");
      fill.addColorStop(0.5, "#ffd21e");
      fill.addColorStop(1, "#ff7a00");
    }
    ctx.fillStyle = fill;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function sprite(id, frame, x, y, facing = 1, scale = 1, o = {}) {
    const names = meta.fighters[id];
    let i = names.indexOf(frame);
    if (i < 0) i = 0;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(facing * scale, scale);
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    const src = [o.shadow ? shadowSheet(id) : sheets[id], (i % meta.cols) * CW, Math.floor(i / meta.cols) * CH, CW, CH, -AX, -AY, CW, CH];
    ctx.drawImage(...src);
    if (o.flash) {
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(...src);
    }
    ctx.restore();
  }

  function portrait(id, x, y, size, flip = false, dark = false) {
    const [px, py, pw, ph] = meta.portraits[id];
    ctx.save();
    ctx.fillStyle = dark ? "#2a1140" : FIGHTERS[id].color;
    ctx.fillRect(x, y, size, size);
    const g = ctx.createLinearGradient(0, y, 0, y + size);
    g.addColorStop(0, "rgba(255,255,255,.35)");
    g.addColorStop(1, "rgba(0,0,40,.45)");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, size, size);
    const sheet = dark ? shadowSheet(id) : sheets[id];
    if (flip) {
      ctx.translate(x + size, y);
      ctx.scale(-1, 1);
      ctx.drawImage(sheet, px, py, pw, ph, 0, 0, size, size);
    } else ctx.drawImage(sheet, px, py, pw, ph, x, y, size, size);
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#fff";
    ctx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
  }

  function frameOf(f) {
    const pp = [0, 1, 2, 3, 2, 1];
    switch (f.state) {
      case "idle": return `idle_${pp[Math.floor(f.t / 8) % 6]}`;
      case "walk": return ["walk_0", "idle_0", "walk_1", "idle_2"][Math.floor(f.t / 6) % 4];
      case "crouch": return "crouch";
      case "jump": return "jump";
      case "air": return "kick";
      case "punch": return f.t < MOVES.punch.startup ? "idle_1" : f.t < MOVES.punch.startup + MOVES.punch.active + 4 ? "punch" : "idle_0";
      case "kick": return f.t < MOVES.kick.startup - 2 ? "idle_1" : f.t < MOVES.kick.startup + MOVES.kick.active + 6 ? "kick" : "idle_0";
      case "special": return f.t < 5 ? "idle_3" : "special";
      case "hyper": return "special";
      case "block": return "block";
      case "hit": return "hit";
      case "ko": return f.y < 0 || f.t < 12 ? "hit" : "ko";
      case "win": return `dance_${Math.floor(f.t / 9) % 6}`;
      default: return "idle_0";
    }
  }

  function drawStage(dim = 0) {
    ctx.drawImage(stage, -Math.round(camX), STAGE_Y, STAGE_W, STAGE_H);
    if (dim > 0) {
      ctx.fillStyle = `rgba(6,0,40,${dim})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  function drawFighter(f, o = {}) {
    const x = f.x - camX, lying = f.state === "ko" && f.y >= 0 && f.t >= 12;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,30,.4)";
    ctx.beginPath();
    ctx.ellipse(x, FLOOR_Y + 4, (lying ? 120 : 62) * (1 + f.y / 600), 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    sprite(f.id, frameOf(f), x, FLOOR_Y + f.y, f.facing, 1, { shadow: o.shadow, flash: f.state === "hit" && f.t < 4 });
  }

  function drawProjectile(p, id) {
    const x = p.x - camX, y = FLOOR_Y + p.y, r = PROJECTILE.r, c = FIGHTERS[id];
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 3; i >= 0; i--) {
      ctx.globalAlpha = 0.25 + 0.15 * (3 - i);
      ctx.fillStyle = i ? c.color : "#fff";
      ctx.beginPath();
      ctx.ellipse(x - Math.sign(p.vx) * i * 12, y, r * (0.6 + i * 0.22) * (1 + 0.1 * Math.sin(tick / 2 + i)), r * (0.55 + i * 0.12), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBeam(f) {
    const mv = MOVES.hyper, k = f.t - mv.startup;
    if (k < 0 || k >= mv.active) return;
    const x0 = f.x - camX + f.facing * 70, y = FLOOR_Y + f.y - 165, len = VIEW_W, c = FIGHTERS[f.id];
    const h = (70 + 14 * Math.sin(tick * 1.7)) * Math.min(1, k / 4, (mv.active - k) / 6);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const [s, col, a] of [[1.5, c.color, 0.45], [1, c.glow, 0.7], [0.45, "#fff", 1]]) {
      ctx.globalAlpha = a;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(x0, y, h * s * 0.8, h * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(f.facing === 1 ? x0 : x0 - len, y - (h * s) / 2, len, h * s);
    }
    ctx.restore();
  }

  function drawFx() {
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i], k = e.t / e.life;
      if (++e.t > e.life) {
        fx.splice(i, 1);
        continue;
      }
      const x = e.x - camX, y = FLOOR_Y + e.y;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(x, y);
      if (e.kind === "block") {
        ctx.strokeStyle = `rgba(140,220,255,${1 - k})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, 14 + 40 * k, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const n = e.heavy ? 10 : 7, R = (e.heavy ? 78 : 52) * (0.3 + k);
        ctx.fillStyle = `rgba(255,${230 - 120 * k},${80 * (1 - k)},${1 - k})`;
        ctx.beginPath();
        for (let j = 0; j < n * 2; j++) {
          const a = (j / (n * 2)) * Math.PI * 2 + e.rot, r = j % 2 ? R * 0.35 : R;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${1 - k})`;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function bar(x, w, frac, lag, flip) {
    const y = 26, h = 22;
    ctx.fillStyle = "#0a0a3c";
    ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    ctx.fillStyle = "#1c6cff";
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = "#3a0a0a";
    ctx.fillRect(x, y, w, h);
    const draw = (fr, fill) => {
      const bw = Math.round(w * Math.max(0, fr));
      ctx.fillStyle = fill;
      ctx.fillRect(flip ? x : x + w - bw, y, bw, h);
    };
    draw(lag, "#ff2d2d");
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#fffbb0");
    g.addColorStop(0.45, "#ffe600");
    g.addColorStop(1, "#e89a00");
    draw(frac, g);
  }

  const lag = [1, 1];
  function drawHud(m, labels) {
    const [a, b] = m.fighters, W = 340;
    [a, b].forEach((f, i) => {
      const fr = f.hp / MAX_HP;
      lag[i] = fr > lag[i] ? fr : Math.max(fr, lag[i] - 0.006);
    });
    bar(78, W, a.hp / MAX_HP, lag[0], false);
    bar(VIEW_W - 78 - W, W, b.hp / MAX_HP, lag[1], true);
    portrait(a.id, 10, 10, 58, false);
    portrait(b.id, VIEW_W - 68, 10, 58, true, labels.shadow);
    // Timer.
    ctx.fillStyle = "#0a0a3c";
    ctx.beginPath();
    ctx.moveTo(VIEW_W / 2 - 52, 37);
    ctx.lineTo(VIEW_W / 2 - 30, 8);
    ctx.lineTo(VIEW_W / 2 + 30, 8);
    ctx.lineTo(VIEW_W / 2 + 52, 37);
    ctx.lineTo(VIEW_W / 2 + 30, 66);
    ctx.lineTo(VIEW_W / 2 - 30, 66);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#1c6cff";
    ctx.lineWidth = 3;
    ctx.stroke();
    text(String(m.time).padStart(2, "0"), VIEW_W / 2, 39, 40, { fill: "gold", stroke: "#7a1200", plain: true });
    text(labels.p1, 80, 66, 20, { align: "left", fill: "#fff" });
    text(labels.p2, VIEW_W - 80, 66, 20, { align: "right", fill: "#fff" });
    for (let i = 0; i < WINS_NEEDED; i++) {
      for (const [f, x] of [[a, 410 - i * 22], [b, VIEW_W - 410 + i * 22]]) {
        ctx.beginPath();
        ctx.arc(x, 66, 7, 0, Math.PI * 2);
        ctx.fillStyle = i < f.wins ? "#ffe600" : "#0a0a3c";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    // Super meters.
    [a, b].forEach((f, i) => {
      const w = 230, x = i === 0 ? 24 : VIEW_W - 24 - w, y = VIEW_H - 26, full = f.meter >= MAX_METER;
      ctx.fillStyle = "#0a0a3c";
      ctx.fillRect(x - 3, y - 3, w + 6, 18);
      ctx.fillStyle = "#123";
      ctx.fillRect(x, y, w, 12);
      const bw = (w * f.meter) / MAX_METER;
      ctx.fillStyle = full ? (Math.floor(tick / 5) % 2 ? "#fff" : "#ffe600") : FIGHTERS[f.id].color;
      ctx.fillRect(i === 0 ? x : x + w - bw, y, bw, 12);
      if (full) text(t("max"), i === 0 ? x + w + 8 : x - 8, y + 6, 18, { align: i === 0 ? "left" : "right", fill: "gold" });
      if (f.combo >= 2) {
        text(`${f.combo} ${t("hits")}`, i === 0 ? 30 : VIEW_W - 30, 150, 34, { align: i === 0 ? "left" : "right", fill: "gold", stroke: "#7a1200" });
      }
    });
  }

  function banner(str, k, size = 92, y = VIEW_H * 0.42, o = {}) {
    // k: frames since it appeared; zooms in then settles.
    const s = k < 10 ? 2.6 - 1.6 * (k / 10) : 1;
    ctx.save();
    ctx.translate(VIEW_W / 2, y);
    ctx.scale(s, s);
    ctx.globalAlpha = Math.min(1, k / 6);
    text(str, 0, 0, size, { fill: "gold", stroke: "#7a1200", lineWidth: size / 7, maxWidth: VIEW_W * 0.9, ...o });
    ctx.restore();
  }

  return {
    ctx, text, sprite, portrait, banner, drawStage,
    tick: () => ++tick,
    resetCamera(x = (STAGE_W - VIEW_W) / 2) {
      camX = x;
      lag[0] = lag[1] = 1;
      fx.length = 0;
    },
    consume(events) {
      for (const e of events) {
        if (e.type === "hit") {
          fx.push({ kind: "hit", x: e.x, y: e.y, t: 0, life: e.heavy ? 16 : 11, heavy: e.heavy, rot: tick });
          shake = e.heavy ? 9 : 5;
        } else if (e.type === "block") fx.push({ kind: "block", x: e.x, y: e.y, t: 0, life: 12 });
        else if (e.type === "ko" || e.type === "thud") shake = 14;
      }
    },
    drawMatch(m, labels) {
      const [a, b] = m.fighters;
      const target = Math.min(STAGE_W - VIEW_W, Math.max(0, (a.x + b.x) / 2 - VIEW_W / 2));
      camX += (target - camX) * 0.18;
      const hyper = m.fighters.find((f) => f.state === "hyper");
      ctx.save();
      if (shake > 0.5) {
        ctx.translate(Math.round((Math.random() - 0.5) * shake), Math.round((Math.random() - 0.5) * shake));
        shake *= 0.82;
      }
      drawStage(hyper ? 0.62 : 0);
      if (m.freeze > 0 && hyper) {
        // Hyper flash: speed lines behind the fighter.
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = FIGHTERS[hyper.id].color;
        for (let i = 0; i < 26; i++) {
          const y = (i * 53 + tick * 37) % VIEW_H;
          ctx.globalAlpha = 0.25 + (i % 4) * 0.12;
          ctx.lineWidth = 2 + (i % 3) * 2;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(VIEW_W, y);
          ctx.stroke();
        }
        ctx.restore();
      }
      const order = a.state === "hit" || a.state === "ko" || a.state === "block" ? [a, b] : [b, a];
      for (const f of order) drawFighter(f, { shadow: labels.shadow && f === b });
      for (const f of m.fighters) if (f.state === "hyper") drawBeam(f);
      for (const p of m.projectiles) drawProjectile(p, m.fighters[p.owner].id);
      drawFx();
      ctx.restore();
      drawHud(m, labels);
    },
  };
}
