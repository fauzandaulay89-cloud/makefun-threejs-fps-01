// audio.js — Procedural WebAudio: every sound is synthesized, no assets.
// A single noise buffer and a handful of oscillators cover gunfire, hits,
// reloads, footsteps, the spike and round stings. Volume falls off with
// distance from the listener (the player).

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return true;
    } catch (err) {
      ctx = null;
      return false;
    }
  }

  function noise(dur, filterFreq, type, gain, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, type, gain, slideTo = null, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Distance attenuation: 1 at the listener, ~0.15 at 40 m. */
  function att(dist) {
    return 1 / (1 + dist * 0.09);
  }

  const WEAPON_SOUND = {
    pistol: { noise: 2400, dur: 0.09, tone: 220 },
    smg: { noise: 3000, dur: 0.07, tone: 300 },
    rifle: { noise: 1800, dur: 0.12, tone: 170 },
    marksman: { noise: 1200, dur: 0.22, tone: 110 },
  };

  return {
    ensure,
    get ready() {
      return !!ctx;
    },
    shot(weaponId, dist = 0) {
      if (!ctx) return;
      const w = WEAPON_SOUND[weaponId] || WEAPON_SOUND.rifle;
      const v = att(dist);
      noise(w.dur, w.noise, 'lowpass', 0.9 * v);
      tone(w.tone, w.dur * 0.8, 'square', 0.25 * v, w.tone * 0.4);
    },
    dry() {
      tone(1400, 0.04, 'square', 0.12);
    },
    reload() {
      tone(900, 0.05, 'square', 0.15);
      tone(600, 0.05, 'square', 0.15, null, 0.18);
      tone(1100, 0.05, 'square', 0.18, null, 0.4);
    },
    hit(headshot) {
      tone(headshot ? 1900 : 1300, 0.06, 'sine', 0.3);
    },
    kill() {
      tone(660, 0.09, 'sine', 0.3);
      tone(990, 0.14, 'sine', 0.3, null, 0.09);
    },
    step(dist = 0) {
      noise(0.05, 500, 'lowpass', 0.12 * att(dist));
    },
    buy() {
      tone(1200, 0.05, 'square', 0.15);
      tone(1600, 0.06, 'square', 0.15, null, 0.06);
    },
    plantBeep() {
      tone(880, 0.08, 'square', 0.2);
      tone(880, 0.08, 'square', 0.2, null, 0.15);
    },
    defuseBeep() {
      tone(1180, 0.08, 'square', 0.2);
      tone(1180, 0.08, 'square', 0.2, null, 0.15);
    },
    planted() {
      tone(440, 0.15, 'square', 0.25);
      tone(440, 0.15, 'square', 0.25, null, 0.2);
      tone(880, 0.3, 'square', 0.25, null, 0.4);
    },
    explosion() {
      noise(1.4, 300, 'lowpass', 1.0);
      tone(60, 1.2, 'sine', 0.9, 28);
      noise(0.4, 2000, 'highpass', 0.4);
    },
    flashPop(dist = 0) {
      tone(2400, 0.3, 'sine', 0.35 * att(dist), 1200);
    },
    flashThrow() {
      noise(0.08, 900, 'bandpass', 0.2);
    },
    roundWin() {
      tone(523, 0.12, 'sine', 0.25);
      tone(659, 0.12, 'sine', 0.25, null, 0.12);
      tone(784, 0.25, 'sine', 0.3, null, 0.24);
    },
    roundLose() {
      tone(392, 0.15, 'sine', 0.22);
      tone(311, 0.3, 'sine', 0.22, null, 0.15);
    },
    click() {
      tone(1000, 0.04, 'square', 0.12);
    },
  };
}
