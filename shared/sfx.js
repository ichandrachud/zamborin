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
     sfx.paper(0.08, 0.07, 3000);   // sharp attack, fibre crackle
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

    // --- Paper ---
    // crease is the fold itself: a bright snap, then the sheet settling a beat
    // later, then a faint low body so it lands rather than just hisses.
    // ONE gesture, not two. The old version fired a snap and then a body 26ms
    // later, which reads as click-then-clunk, a latch rather than a crease.
    crease:   a => a.paper(0.07, 0.10, 1800),
    // the same material handled gently: shorter, quieter, duller corner.
    unfold:   a => a.paper(0.055, 0.055, 1100),
    // a sheet sliding over another, for a piece being placed rather than folded
    'paper-slide': a => a.paper(0.09, 0.040, 900),

    // --- Thread / cloth, for Needle ---
    // a stitch is a short pull through cloth: soft, low, no bright snap
    stitch:   a => a.paper(0.06, 0.050, 700),
    // the cloth refusing: dull and low, deliberately not a buzzer
    snag:     a => { a.tone(150, 0.13, 0.045, 'sine'); a.paper(0.07, 0.030, 500); },

    // --- Glass, for Stained ---
    // a pane meeting the window: bright and short, with a small ring above it
    glass:    a => { a.tone(1320, 0.05, 0.030, 'sine'); setTimeout(() => a.tone(1980, 0.07, 0.016, 'sine'), 12); },
    // a pane turning in place: the same material, lower and quieter
    turn:     a => a.tone(880, 0.045, 0.022, 'sine'),

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
    const masterGain = opts.gain != null ? opts.gain : 1;
    let audioCtx = null;
    let master = null;
    let on = (() => {
      try { return localStorage.getItem(storageKey) !== '0'; }
      catch (_) { return true; }
    })();

    /* OUTPUT STAGE. Everything used to connect straight to ctx.destination at
       the gain each recipe named, and those gains are small: the loudest thing
       in the fleet is a 0.26 noise burst, which is -11.7 dBFS, and the UI click
       is -30.5. Playable only with the system volume near maximum, which is
       also what makes any harsh voice unbearable — you have turned everything
       up to hear the quiet things.

       So: one master gain per game, and a limiter behind it. `gain` defaults to
       1, so every game that does not ask for it sounds exactly as before. The
       limiter sits below the threshold at those levels and does nothing until a
       boosted game stacks several sounds at once, which is precisely when it
       should. */
    function ensureAudio() {
      if (audioCtx) return audioCtx;
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (_) { audioCtx = null; }
      if (audioCtx) {
        master = audioCtx.createGain();
        master.gain.value = masterGain;
        const lim = audioCtx.createDynamicsCompressor();
        lim.threshold.value = -3;   lim.knee.value = 0;
        lim.ratio.value     = 20;   lim.attack.value = 0.003;
        lim.release.value   = 0.10;
        // NOT out() — that returns master, and master -> lim -> master is a
        // delay-free cycle, which Web Audio mutes entirely. The limiter is the
        // last node before the speakers by definition.
        master.connect(lim); lim.connect(audioCtx.destination);
      }
      return audioCtx;
    }
    // Where every voice should connect — including the sustained ones a game
    // builds itself on this context, so they ride the same master.
    function out() { return master || (audioCtx ? audioCtx.destination : null); }

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
      osc.connect(g); g.connect(out());
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
      src.connect(filter); filter.connect(g); g.connect(out());
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
      osc.connect(g); g.connect(out());
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
      src.connect(filt); filt.connect(ng); ng.connect(out());
      src.start(t0);
    }

    /* Paper. Rewritten 2026-08-23 after the first version was described as "a
       metal case shutting", which was a fair hearing of three mistakes:

         a PURE TONE was mixed in underneath as a "landing". Nothing about paper
           is pitched, and a sine is the most metallic thing available. Gone.
         the filter was a BANDPASS, which resonates. A resonance is a ring and a
           ring is what metal does. Now a highpass: it takes the boom out without
           putting a pitch in.
         the body was mostly SMOOTH noise with a little crackle on top, so it had
           a continuous tail to ring through. Now the signal is ONLY crackle: amp
           starts at zero and exists solely as micro-transients, which is what
           paper physically is, a lot of tiny fibre releases rather than a tone.

       `bright` is the highpass corner: ~1800 is a crisp new sheet, ~900 a softer
       thicker one. Keep durations short. Long is what makes it a container. */
    function paper(dur, gain, bright) {
      if (!on || !audioCtx) return;
      const t0 = audioCtx.currentTime;
      const sr = audioCtx.sampleRate;
      const len = Math.max(1, Math.floor(sr * dur));
      const buf = audioCtx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      let amp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(1 - t, 2.2);
        // dense re-triggering, each snap decaying fast. No smooth bed at all.
        if (Math.random() < 0.055) amp = 1;
        amp *= 0.80;
        d[i] = (Math.random() * 2 - 1) * env * amp;
      }
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const filt = audioCtx.createBiquadFilter();
      filt.type = 'highpass';
      filt.frequency.value = bright || 1500;
      filt.Q.value = 0.4;
      const g = audioCtx.createGain();
      g.gain.value = gain != null ? gain : 0.09;
      src.connect(filt); filt.connect(g); g.connect(out());
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
      ensureAudio, setOn, isOn, out,
      tone, noise, woodClack, arpeggio, paper,
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
