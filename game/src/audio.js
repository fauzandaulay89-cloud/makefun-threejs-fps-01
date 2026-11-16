// Procedural sound: every effect is synthesised with WebAudio, so the game
// ships no audio assets and makes no network request. The context is created
// lazily on the first user gesture (pointer lock), which is also what the
// browser's autoplay policy wants.
export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      context = new AC();
      master = context.createGain();
      master.gain.value = 0.32;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  // A short burst of filtered noise: the body of every gunshot and explosion.
  function noiseBurst(duration, filterFreq, gainValue, when = 0) {
    if (!ensure() || muted) return;
    const t = context.currentTime + when;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
    source.stop(t + duration);
  }

  // A pure tone with a fast decay: clicks, ticks, beeps and the round horn.
  function tone(freq, duration, gainValue, type = 'sine', when = 0, slideTo = 0) {
    if (!ensure() || muted) return;
    const t = context.currentTime + when;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    // kind: 'rifle' | 'smg' | 'marksman' | 'pistol' | 'enemy' (distant, quieter).
    shot(kind) {
      if (kind === 'marksman') {
        noiseBurst(0.22, 900, 0.9);
        tone(160, 0.12, 0.5, 'square', 0, 60);
      } else if (kind === 'smg') {
        noiseBurst(0.09, 2400, 0.5);
      } else if (kind === 'pistol') {
        noiseBurst(0.12, 1800, 0.6);
      } else if (kind === 'enemy') {
        noiseBurst(0.14, 700, 0.25);
      } else {
        noiseBurst(0.16, 1400, 0.8);
        tone(110, 0.08, 0.4, 'square', 0, 55);
      }
    },
    dryFire() {
      tone(1400, 0.04, 0.25, 'square');
    },
    reload() {
      tone(900, 0.05, 0.3, 'square');
      tone(600, 0.05, 0.3, 'square', 0.18);
      tone(1100, 0.05, 0.3, 'square', 0.55);
    },
    hit(kill) {
      tone(kill ? 1900 : 1500, 0.06, 0.35, 'sine');
      if (kill) tone(2400, 0.09, 0.3, 'sine', 0.06);
    },
    hurt() {
      tone(220, 0.12, 0.4, 'sawtooth', 0, 110);
    },
    plantBeep() {
      tone(1250, 0.07, 0.35, 'sine');
    },
    spikeBeep() {
      tone(1750, 0.05, 0.3, 'sine');
    },
    defuseBeep() {
      tone(980, 0.07, 0.3, 'sine');
    },
    flash() {
      noiseBurst(0.5, 500, 0.7);
      tone(3200, 0.4, 0.12, 'sine', 0, 2400);
    },
    buy() {
      tone(880, 0.05, 0.3, 'sine');
      tone(1320, 0.07, 0.3, 'sine', 0.05);
    },
    deny() {
      tone(220, 0.12, 0.35, 'square');
    },
    horn(win) {
      if (win) {
        tone(523, 0.18, 0.4, 'triangle');
        tone(659, 0.18, 0.4, 'triangle', 0.16);
        tone(784, 0.34, 0.4, 'triangle', 0.32);
      } else {
        tone(392, 0.22, 0.4, 'triangle');
        tone(311, 0.22, 0.4, 'triangle', 0.2);
        tone(233, 0.4, 0.4, 'triangle', 0.4);
      }
    },
  };
}
