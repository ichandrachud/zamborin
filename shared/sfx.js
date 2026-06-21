/* Zamborin shared SFX engine — one Web Audio context per game, a named
   library of one-shot effects, and raw `tone()` / `noise()` primitives
   for game-specific sounds.

   Usage:
     const sfx = ZSFX.create({ storageKey: 'zamborin-tessera.sound' });
     // First user gesture (pointerdown, keydown):
     sfx.ensureAudio();
     // Play named effects:
     sfx.play('tick');
     sfx.play('drop');
     sfx.play('win');
     // Or roll your own:
     sfx.tone(440, 0.1, 0.05, 'triangle');
     sfx.noise(0.1, 240, 1.5, 0.3);
     // Mute toggle:
     sfx.setOn(false);
*/
(function () {
  'use strict';

  // ---------- LIBRARY ----------
  // Each entry is a function `(api) => void` that schedules sound on the
  // shared AudioContext. Adding a new effect = add a new entry.
  const LIB = {
    // --- UI feedback ---
    click:    a => a.tone(1800, 0.025, 0.030, 'square'),
    tick:     a => a.tone(1600, 0.020, 0.025, 'square'),
    ping:     a => a.tone(1200, 0.040, 0.035, 'sine'),
    pop:      a => a.tone(660,  0.060, 0.050, 'sine'),

    // --- Falling / placing ---
    drop:     a => a.tone(440,  0.060, 0.070, 'triangle'),
    land:     a => { a.tone(220, 0.14, 0.13, 'sine'); setTimeout(() => a.tone(140, 0.18, 0.11, 'sine'), 50); },
    step:     a => a.tone(280,  0.040, 0.025, 'sine'),

    // --- Positive ---
    start:    a => { a.tone(523, 0.10, 0.05, 'triangle'); setTimeout(() => a.tone(784, 0.12, 0.05, 'triangle'), 80); },
    unlock:   a => { a.tone(660, 0.10, 0.06, 'triangle'); setTimeout(() => a.tone(880, 0.10, 0.06, 'triangle'), 70); },
    finish:   a => { a.tone(784, 0.12, 0.07, 'triangle'); setTimeout(() => a.tone(1047, 0.16, 0.07, 'triangle'), 90); },
    success:  a => { a.tone(523, 0.12, 0.06, 'triangle'); setTimeout(() => a.tone(659, 0.14, 0.06, 'triangle'), 80); setTimeout(() => a.tone(784, 0.18, 0.07, 'triangle'), 160); },
    win:      a => { a.tone(523, 0.13, 0.08, 'triangle'); setTimeout(() => a.tone(659, 0.13, 0.08, 'triangle'),  90); setTimeout(() => a.tone(784, 0.13, 0.08, 'triangle'), 180); setTimeout(() => a.tone(1047, 0.22, 0.10, 'triangle'), 280); },

    // --- Negative ---
    fail:     a => { a.tone(330, 0.18, 0.06, 'triangle'); setTimeout(() => a.tone(247, 0.18, 0.06, 'triangle'), 140); setTimeout(() => a.tone(196, 0.28, 0.06, 'triangle'), 280); },
    error:    a => a.tone(200, 0.15, 0.06, 'sawtooth'),

    // --- Hits / impacts ---
    capture:  a => { a.noise(0.10, 240, 1.5, 0.30); setTimeout(() => a.tone(180, 0.18, 0.10, 'square'), 30); },
    thump:    a => a.tone(120, 0.16, 0.14, 'sine'),

    // --- Dice / wooden pieces ---
    'dice-shake': a => {
      a.woodClack(220, 0.10, 0.16);
      setTimeout(() => a.woodClack(180, 0.10, 0.13), 100);
      setTimeout(() => a.woodClack(240, 0.10, 0.14), 220);
      setTimeout(() => a.woodClack(195, 0.10, 0.12), 340);
      setTimeout(() => a.woodClack(215, 0.10, 0.10), 470);
    },
    'dice-land': a => {
      a.woodClack(150, 0.22, 0.24);
      setTimeout(() => a.woodClack(115, 0.28, 0.18), 60);
    },
  };

  // ---------- FACTORY ----------
  function create(opts) {
    opts = opts || {};
    const storageKey = opts.storageKey || 'zamborin.sound';
    let audioCtx = null;
    let on = (() => {
      try { return localStorage.getItem(storageKey) !== '0'; }
      catch (_) { return true; }
    })();

    function ensureAudio() {
      if (audioCtx) return audioCtx;
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (_) { audioCtx = null; }
      return audioCtx;
    }

    function setOn(v) {
      on = !!v;
      try { localStorage.setItem(storageKey, on ? '1' : '0'); } catch (_) {}
    }
    function isOn() { return on; }

    function tone(freq, dur, gain, type) {
      if (!on || !audioCtx) return;
      const t0 = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(audioCtx.destination);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    }

    function noise(dur, freq, q, gain) {
      if (!on || !audioCtx) return;
      const t0 = audioCtx.currentTime;
      const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const env = 1 - (i / data.length);
        data[i] = (Math.random() * 2 - 1) * env;
      }
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = freq;
      filter.Q.value = q;
      const g = audioCtx.createGain();
      g.gain.value = gain;
      src.connect(filter); filter.connect(g); g.connect(audioCtx.destination);
      src.start(t0);
    }

    // Wooden clack — damped low sine + 5ms low-passed noise attack. Reads
    // as "wood on wood" rather than "ceramic on ceramic" (the noise gives
    // a percussive "tk" front, the sine gives a hollow body).
    function woodClack(freq, dur, gain) {
      if (!on || !audioCtx) return;
      const t0 = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(audioCtx.destination);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
      const len = Math.max(1, Math.floor(audioCtx.sampleRate * 0.005));
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const filt = audioCtx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = freq * 4;
      const ng = audioCtx.createGain();
      ng.gain.value = gain * 0.30;
      src.connect(filt); filt.connect(ng); ng.connect(audioCtx.destination);
      src.start(t0);
    }

    // Convenience: a 3-note arpeggio that scales pitch with `extra`
    // (e.g. word length above a base). Used by Tessera for word-clear.
    function arpeggio(baseHz, gain, extra) {
      const baseGain = gain != null ? gain : 0.06;
      const lift = Math.pow(1.12, Math.max(0, extra || 0));
      tone(baseHz * lift,         0.12, baseGain, 'triangle');
      setTimeout(() => tone(baseHz * lift * 1.25, 0.14, baseGain,        'triangle'),  80);
      setTimeout(() => tone(baseHz * lift * 1.5,  0.18, baseGain + 0.01, 'triangle'), 160);
    }

    const api = {
      ensureAudio, setOn, isOn,
      tone, noise, woodClack, arpeggio,
      play(name, opts) {
        const recipe = LIB[name];
        if (!recipe) return;
        recipe(api, opts || {});
      },
      // Expose the library for inspection / custom additions.
      lib: LIB,
    };
    return api;
  }

  window.ZSFX = { create };
})();
