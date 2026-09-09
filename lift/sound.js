/* Lift — the sound of a hotel on fire.

   Everything is synthesised on the shared Zamborin audio context, so mute is
   still silence and the game still weighs nothing. The house rule binds: sound
   only ever reinforces something the picture already says. The roar tracks
   smoke you can see, the alarm is the building's, and a cough only ever lands
   on somebody visibly doubling over.

   This lives apart from play.js because of the bench. sound-bench.html loads
   the same module and plays each voice ALONE, which is the only honest way to
   judge one: inside a run they all arrive at once and nothing is separable.

   Two principles run through the whole file, and they are what the first
   attempt got wrong:
     1. A sound is identified by its PATTERN and its NOISE, not by its pitch.
        A fire alarm is a temporal-three horn; two pleasant tones is a doorbell.
        Fire is crackle on a bed; a steady bed alone is an air conditioner.
     2. Nothing in a burning building is musical. No triads, no chirps. The one
        exception is the lift bell, because a real lift really does chime.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LiftSound = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Every level in one table so the bench can move them and the owner can
     name numbers rather than adjectives. */
  /* These are not guesses. Each voice was rendered into an OfflineAudioContext
     and measured, and the first set was wrong in a way no amount of reading the
     code would have shown: at a full fire with the car moving, the BED came out
     louder than every event in the game (-25.8 dB against a collapse at -29.0),
     so the fire drowned the thing it was warning you about. The bed is now held
     about 6 dB down and the events sit on top of it where they belong. */
  const MIX = {
    alarm:   0.024,   // 33% duty over a whole run - it must not be the loudest thing
    roarLo:  0.024,   // the fire at rest
    roarHi:  0.050,   // ...and with the building well alight
    crackle: 0.032,   // held while the roar came down: crackle is what says FIRE
    motor:   0.024,
    rumble:  0.030,
    bell:    0.075,
    doors:   0.075,
    step:    0.045,
    cough:   0.340,   // it is the WARNING - it has to clear the fire
    collapse:0.210,   // the loudest thing in the game, on purpose
    misland: 0.085,
    wave:    0.075,
    end:     0.110
  };

  function create(sfx) {
    let white = null, brownB = null, amb = null;
    let alarmT = 0, crackT = 0;

    function rawCtx() { const d = sfx && sfx.out(); return (d && d.context) ? d.context : null; }
    function ctx() { return (sfx && sfx.isOn()) ? rawCtx() : null; }
    function dest() { return sfx.out(); }

    function whiteBuf(ac) {
      if (white && white.sampleRate === ac.sampleRate) return white;
      const n = Math.floor(ac.sampleRate * 2), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      white = b; return b;
    }
    function brownBuf(ac) {
      if (brownB && brownB.sampleRate === ac.sampleRate) return brownB;
      const n = Math.floor(ac.sampleRate * 3), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
      let last = 0;
      for (let i = 0; i < n; i++) { last = last * 0.92 + (Math.random() * 2 - 1) * 0.08; d[i] = last * 4.2; }
      brownB = b; return b;
    }

    /* ---------- TWO PRIMITIVES ----------
       Every percussive voice below is some number of these two, layered. */

    // a short piece of noise through one filter
    function burst(o) {
      const ac = ctx(); if (!ac) return;
      const t = ac.currentTime + (o.at || 0), g = ac.createGain();
      const s = ac.createBufferSource(); s.buffer = whiteBuf(ac); s.loop = true;
      s.playbackRate.value = o.rate || 1;
      const f = ac.createBiquadFilter();
      f.type = o.type || 'bandpass'; f.frequency.value = o.freq; f.Q.value = o.q == null ? 1 : o.q;
      const a = o.attack == null ? 0.004 : o.attack;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
      s.connect(f); f.connect(g); g.connect(dest());
      s.start(t, Math.random() * 1.5); s.stop(t + o.dur + 0.05);
    }

    // one pitched body, optionally falling
    function hit(o) {
      const ac = ctx(); if (!ac) return;
      const t = ac.currentTime + (o.at || 0);
      const osc = ac.createOscillator(); osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f0, t);
      if (o.f1 != null) osc.frequency.exponentialRampToValueAtTime(Math.max(18, o.f1), t + o.dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t + (o.attack == null ? 0.006 : o.attack));
      g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
      let node = osc;
      if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); node = f; }
      node.connect(g); g.connect(dest());
      osc.start(t); osc.stop(t + o.dur + 0.05);
    }

    /* ---------- THE ALARM ----------
       NFPA temporal three: half a second on, half off, three times, then a
       second and a half of nothing. That PATTERN is what every person alive
       hears as a building fire alarm. The tone is two squares a few Hz apart
       so they beat against each other the way a real horn does, dulled as if
       it is mounted down the corridor rather than over your head. Rectangular
       envelope, because horns do not swell. */
    function horn(at, dur, gain) {
      const ac = ctx(); if (!ac) return;
      const t = ac.currentTime + at, G = gain == null ? MIX.alarm : gain;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(G, t + 0.010);
      g.gain.setValueAtTime(G, t + dur - 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2100; lp.Q.value = 0.9;
      const pk = ac.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1400; pk.Q.value = 1.1; pk.gain.value = 6;
      [698, 705].forEach(f => {
        const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = f;
        o.connect(lp); o.start(t); o.stop(t + dur + 0.05);
      });
      lp.connect(pk); pk.connect(g); g.connect(dest());
    }
    function alarmCycle() { for (let i = 0; i < 3; i++) horn(i * 1.0, 0.5); }

    /* ---------- ONE-SHOTS ---------- */

    /* A lift bell is a struck bar: a few INHARMONIC partials decaying at
       different rates, plus the strike. Three is enough to stop it reading as
       a sine beep. This is the only pleasant sound in the game. */
    function bell(v) {
      const k = v == null ? 1 : v;
      burst({ freq: 3200, q: 0.8, dur: 0.035, gain: 0.020 * k, attack: 0.001 });
      hit({ f0: 1046, dur: 0.80, gain: MIX.bell * k, type: 'sine', attack: 0.002 });
      hit({ f0: 2593, dur: 0.42, gain: 0.030 * k, type: 'sine', attack: 0.002 });
      hit({ f0: 3660, dur: 0.22, gain: 0.013 * k, type: 'sine', attack: 0.002 });
    }

    /* Doors: a slide with weight, then the stop. Opening ends soft; closing
       gets the latch, which is the sound that says the car is free to move. */
    function doors(closing) {
      const d = 0.42;
      burst({ freq: 200, q: 0.5, type: 'lowpass', dur: d, gain: MIX.doors * 1.7, attack: 0.05, rate: 0.5 });
      burst({ freq: 430, q: 0.35, dur: d, gain: MIX.doors * 1.3, attack: 0.06, rate: 0.8 });
      if (closing) {
        hit({ at: d - 0.06, f0: 150, f1: 90, dur: 0.14, gain: 0.075, type: 'sine' });
        burst({ at: d - 0.06, freq: 1400, q: 0.9, dur: 0.05, gain: 0.030, attack: 0.001 });
      } else {
        hit({ at: d - 0.05, f0: 120, f1: 84, dur: 0.10, gain: 0.038, type: 'sine' });
      }
    }

    /* Feet on hotel carpet: a scuff and a soft body, unevenly spaced, so a
       group boarding sounds like a group and not a metronome. */
    function steps(n, hurried) {
      const gap = hurried ? 0.085 : 0.13;
      let at = 0;
      for (let i = 0; i < Math.max(1, n); i++) {
        burst({ at, freq: 1700 + Math.random() * 900, q: 0.7, dur: 0.045, gain: 0.028, attack: 0.001 });
        hit({ at, f0: 96 + Math.random() * 24, f1: 62, dur: 0.09, gain: MIX.step, type: 'sine' });
        at += gap + Math.random() * gap * 0.6;
      }
    }

    /* A cough is three things inside 300ms: the glottis letting go, the body
       of it, and the breath after. Two puffs of noise is a puff of noise. The
       seed picks a voice, so eight people do not cough in unison and the men
       and the women on screen do not sound the same. */
    function cough(seed) {
      const r = ((Math.sin((seed || 1) * 12.9898) * 43758.5453) % 1 + 1) % 1;
      const f = r < 0.5 ? 360 + r * 320 : 600 + (r - 0.5) * 480;
      burst({ freq: 1500, q: 0.7, dur: 0.022, gain: 0.200, attack: 0.0008 });
      burst({ at: 0.012, freq: f, q: 1.8, dur: 0.20, gain: MIX.cough, attack: 0.006 });
      burst({ at: 0.012, freq: f * 2.4, q: 1.6, dur: 0.13, gain: MIX.cough * 0.42, attack: 0.006 });
      burst({ at: 0.170, freq: 2400, q: 0.5, dur: 0.24, gain: 0.030, attack: 0.05 });
    }

    /* Somebody going down on carpet, and the run getting one closer to over.
       Deliberately the loudest event in the game: it is the only thing the
       player is actually being punished for. */
    function collapse() {
      hit({ f0: 78, f1: 46, dur: 0.34, gain: MIX.collapse, type: 'sine' });
      burst({ freq: 260, q: 0.4, type: 'lowpass', dur: 0.26, gain: 0.085, attack: 0.004 });
      burst({ at: 0.06, freq: 900, q: 0.6, dur: 0.30, gain: 0.030, attack: 0.02 });
      hit({ at: 0.02, f0: 190, f1: 88, dur: 0.60, gain: 0.055, type: 'sawtooth', lp: 300 });
    }

    /* The car stopping where it should not have. It costs seconds, so it has
       to sound like a mistake: a dull clunk and a moment of grind. */
    function misland() {
      hit({ f0: 128, f1: 96, dur: 0.16, gain: MIX.misland, type: 'sine' });
      burst({ freq: 420, q: 0.7, dur: 0.20, gain: 0.045, attack: 0.006, rate: 0.7 });
    }

    /* The fire taking another step: a gust and a drop underneath it. */
    function waveUp() {
      burst({ freq: 300, q: 0.35, type: 'lowpass', dur: 1.10, gain: MIX.wave, attack: 0.45, rate: 0.6 });
      hit({ f0: 120, f1: 44, dur: 0.90, gain: 0.075, type: 'triangle' });
    }

    /* The only good thing that happens in this building. Feet going away, and
       a low warm bell over them - a reward that is not a chirp. */
    function rescue(n) {
      steps(Math.min(6, 2 + (n || 1)), true);
      hit({ at: 0.10, f0: 523, dur: 0.55, gain: 0.055, type: 'sine', attack: 0.004 });
      hit({ at: 0.10, f0: 1046, dur: 0.30, gain: 0.020, type: 'sine', attack: 0.004 });
    }

    /* The end. The alarm has already stopped; what is left is the building. */
    function runEnd() {
      hit({ f0: 150, f1: 38, dur: 1.5, gain: MIX.end, type: 'sawtooth', lp: 260 });
      burst({ freq: 220, q: 0.3, type: 'lowpass', dur: 1.6, gain: 0.075, attack: 0.02, rate: 0.5 });
    }

    /* ---------- THE BED ----------
       Two held graphs, steered every frame. The fire breathes because an LFO
       walks its filter; without that it is a fan. The motor gets LOUDER with
       speed and barely moves in pitch, because a pitch that tracks speed is a
       car engine and this is a machine running at one rate. */
    function ensure() {
      if (amb) return amb;
      const ac = rawCtx(); if (!ac) return null;
      const d = dest();

      const src = ac.createBufferSource(); src.buffer = brownBuf(ac); src.loop = true;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = 0.9;
      const roar = ac.createGain(); roar.gain.value = 0;
      const lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.11;
      const lfoG = ac.createGain(); lfoG.gain.value = 150;
      lfo.connect(lfoG); lfoG.connect(lp.frequency);
      src.connect(lp); lp.connect(roar); roar.connect(d); src.start(); lfo.start();

      const h1 = ac.createOscillator(); h1.type = 'sawtooth'; h1.frequency.value = 48;
      const h2 = ac.createOscillator(); h2.type = 'triangle'; h2.frequency.value = 312;
      const h2g = ac.createGain(); h2g.gain.value = 0.16;
      const mlp = ac.createBiquadFilter(); mlp.type = 'lowpass'; mlp.frequency.value = 520;
      const motor = ac.createGain(); motor.gain.value = 0;
      h1.connect(mlp); h2.connect(h2g); h2g.connect(mlp); mlp.connect(motor); motor.connect(d);
      h1.start(); h2.start();

      const rs = ac.createBufferSource(); rs.buffer = brownBuf(ac); rs.loop = true;
      const rlp = ac.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 170;
      const rumble = ac.createGain(); rumble.gain.value = 0;
      rs.connect(rlp); rlp.connect(rumble); rumble.connect(d); rs.start();

      amb = { ac, roar, motor, rumble, hum: h1 };
      return amb;
    }

    function ambience(dt, s) {
      const on = !!(sfx && sfx.isOn());
      if (!amb && on) ensure();
      if (!amb) return;
      const live = on && !!s.live, t = amb.ac.currentTime;
      const burn = Math.max(0, Math.min(1, s.burn || 0)), sp = Math.max(0, Math.min(1, s.speed || 0));
      amb.roar.gain.setTargetAtTime(live ? MIX.roarLo + (MIX.roarHi - MIX.roarLo) * burn : 0, t, 0.6);
      amb.motor.gain.setTargetAtTime(live ? sp * MIX.motor : 0, t, 0.05);
      amb.rumble.gain.setTargetAtTime(live ? sp * MIX.rumble : 0, t, 0.05);
      amb.hum.frequency.setTargetAtTime(46 + sp * 5, t, 0.3);

      /* Crackle. This is the whole difference between fire and wind: little
         irregular breaks on top of the bed, arriving faster as more of the
         building goes up. */
      crackT -= dt;
      if (crackT <= 0) {
        crackT = (0.55 - 0.40 * burn) * (0.4 + Math.random() * 1.2);
        if (live && burn > 0.02) {
          const n = 1 + (Math.random() < burn ? 1 : 0);
          for (let i = 0; i < n; i++)
            burst({ at: i * 0.03 * Math.random(), freq: 900 + Math.random() * 2400, q: 1.4,
                    dur: 0.012 + Math.random() * 0.035,
                    gain: (0.010 + MIX.crackle * Math.random()) * (0.4 + burn), attack: 0.001 });
        }
      }

      alarmT -= dt;
      if (alarmT <= 0) { alarmT = 4.5; if (live) alarmCycle(); }
    }

    return { MIX, horn, alarmCycle, bell, doors, steps, cough, collapse, misland, waveUp, rescue, runEnd, ambience };
  }

  return { create, MIX };
});
