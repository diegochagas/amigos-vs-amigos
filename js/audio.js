// Tiny WebAudio synth: sound effects and a looping chiptune, no audio files.
let ctx = null, master = null, musicTimer = null, muted = false, noiseBuf = null;

export function initAudio() {
  if (ctx) return ctx.resume();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}
export const isMuted = () => muted;

function tone(type, f0, f1, dur, vol = 0.3, when = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur, vol, freq, when = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + when, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = "bandpass";
  f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t0);
  s.stop(t0 + dur);
}

const SFX = {
  blip: () => tone("square", 880, 1320, 0.07, 0.15),
  ok: () => { tone("square", 660, 660, 0.08, 0.18); tone("square", 990, 990, 0.14, 0.18, 0.08); },
  whoosh: () => noise(0.12, 0.25, 1800),
  jump: () => tone("square", 260, 620, 0.14, 0.12),
  hit: () => { noise(0.14, 0.7, 900); tone("sine", 190, 60, 0.16, 0.6); },
  heavy: () => { noise(0.22, 0.9, 600); tone("sine", 150, 40, 0.26, 0.8); },
  block: () => { noise(0.06, 0.4, 3200); tone("square", 520, 400, 0.06, 0.12); },
  fire: () => { tone("sawtooth", 220, 900, 0.25, 0.25); noise(0.25, 0.2, 2400); },
  super: () => { for (let i = 0; i < 6; i++) tone("sawtooth", 220 * 2 ** (i / 3), 220 * 2 ** (i / 3 + 0.3), 0.3, 0.2, i * 0.07); },
  ko: () => { tone("sine", 220, 30, 0.9, 0.9); noise(0.6, 0.6, 300); },
  thud: () => { tone("sine", 110, 40, 0.2, 0.7); noise(0.1, 0.3, 200); },
  round: () => { tone("square", 440, 440, 0.12, 0.2); tone("square", 554, 554, 0.12, 0.2, 0.13); tone("square", 659, 659, 0.25, 0.2, 0.26); },
  fight: () => { tone("sawtooth", 330, 660, 0.35, 0.3); noise(0.3, 0.3, 1200); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone("square", f, f, 0.18, 0.2, i * 0.12)); },
  lose: () => { [392, 330, 262, 196].forEach((f, i) => tone("square", f, f, 0.25, 0.2, i * 0.18)); },
};
export function sfx(name) {
  if (ctx && !muted && SFX[name]) SFX[name]();
}

// 16-step loop in A minor: bass on every step, lead arpeggio on top.
const BASS = [110, 110, 220, 110, 131, 131, 262, 131, 98, 98, 196, 98, 123, 123, 247, 165];
const LEAD = [440, 0, 523, 659, 0, 523, 659, 784, 392, 0, 494, 587, 0, 494, 659, 0];
export function startMusic() {
  if (!ctx || musicTimer) return;
  let step = 0, next = ctx.currentTime + 0.05;
  const len = 60 / 148 / 2;
  musicTimer = setInterval(() => {
    while (next < ctx.currentTime + 0.2) {
      const when = Math.max(0, next - ctx.currentTime);
      if (!muted) {
        tone("triangle", BASS[step], BASS[step], len * 0.9, 0.22, when);
        if (LEAD[step]) tone("square", LEAD[step], LEAD[step], len * 0.8, 0.05, when);
        if (step % 4 === 2) noise(0.05, 0.12, 5000, when);
      }
      step = (step + 1) % 16;
      next += len;
    }
  }, 50);
}
export function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = null;
}
