/* ============================================================
   Litmus in 3D · its own sound: DEEP SPACE

   The owner's pick (2026-10-04) of three directions on a listening page
   (https://claude.ai/artifact/Gp7XB9PjBc2RUHiws8JdyY), so the game sounds
   like no other Zamborin game: soft bells made by frequency modulation and
   slow swelling pads, in a room that rings. Each element bonds on its own
   note; the reaction in the sphere, silent before, swells as the molecules
   swirl, sparkles as they turn to dust, and blooms as the atoms re-form.

   Built on the shared engine's context (shared/sfx.js): it wakes with it and
   follows the game's Sound on/off. The voices are the listening page's, at
   its level: they pass the same gentle compressor there, then out through
   the shared output (which this game boosts three times, so a third here).
   ============================================================ */
(function (root) {
  'use strict';
  root.LitmusSound = function (sfx) {
    let ctx = null, voices = null, wetIn = null, noiseBuf = null;
    const BOOST = 3;                       // the game's shared output gain (play.js: ZSFX.create({ gain: 3 }))
    function wake() {
      if (!sfx || !sfx.isOn()) return null;
      const c = sfx.ensureAudio(); if (!c) return null;
      if (c.state === 'suspended') c.resume();
      if (c !== ctx) {                     // first use, or a new context: build the chain on it
        ctx = c;
        voices = ctx.createGain(); voices.gain.value = 0.9;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
        const down = ctx.createGain(); down.gain.value = 1 / BOOST;
        voices.connect(comp); comp.connect(down); down.connect(sfx.out());
        const verb = ctx.createConvolver(); verb.buffer = room(3.2, 2.6);
        wetIn = ctx.createGain(); const wetOut = ctx.createGain(); wetOut.gain.value = 0.7;
        wetIn.connect(verb); verb.connect(wetOut); wetOut.connect(voices);
        noiseBuf = null;
      }
      return ctx.currentTime + 0.02;
    }
    // the room: two seconds and more of noise dying away, one for each ear
    function room(sec, decay) {
      const n = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, n, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
      return buf;
    }
    function bus(wet) { const g = ctx.createGain(); g.connect(voices); if (wet > 0) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(wetIn); } return g; }
    const X = (v) => Math.max(0.0001, v);
    function env(param, t, a, peak, d) { param.setValueAtTime(0.0001, t); param.exponentialRampToValueAtTime(X(peak), t + a); param.exponentialRampToValueAtTime(0.0001, t + a + d); }
    function osc(type, f, t, a, peak, d, out, f2) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d * 0.6);
      env(g.gain, t, a, peak, d); o.connect(g); g.connect(out); o.start(t); o.stop(t + a + d + 0.05);
    }
    function noise(t, dur, peak, a, out, filt) {
      if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = filt.type; f.Q.value = filt.q || 0.8;
      f.frequency.setValueAtTime(filt.f0, t); if (filt.f1) f.frequency.exponentialRampToValueAtTime(filt.f1, t + dur);
      const g = ctx.createGain(); env(g.gain, t, a, peak, dur - a);
      s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    }
    // a soft bell: one tone bending another (frequency modulation), the bend dying away so it rings pure
    function bell(f, t, vel, dec, out, ratio, index) {
      const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
      c.frequency.value = f; m.frequency.value = f * (ratio || 3.5);
      mg.gain.setValueAtTime(f * (index || 2.2), t); mg.gain.exponentialRampToValueAtTime(X(f * 0.05), t + dec * 0.7);
      m.connect(mg); mg.connect(c.frequency); env(g.gain, t, 0.004, vel, dec); c.connect(g); g.connect(out);
      c.start(t); m.start(t); c.stop(t + dec + 0.05); m.stop(t + dec + 0.05);
    }
    // a slow pad: three slightly detuned saws for each note, through a filter that opens or closes
    function pad(freqs, t, a, hold, rel, vel, out, f0, f1) {
      const lp = ctx.createBiquadFilter(), g = ctx.createGain(); lp.type = 'lowpass'; lp.Q.value = 0.7;
      lp.frequency.setValueAtTime(f0, t); lp.frequency.exponentialRampToValueAtTime(f1, t + a + hold);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(X(vel), t + a); g.gain.setValueAtTime(X(vel), t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
      lp.connect(g); g.connect(out);
      for (const f of freqs) for (const det of [-6, 0, 6]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        const og = ctx.createGain(); og.gain.value = 0.18 / freqs.length; o.connect(og); og.connect(lp); o.start(t); o.stop(t + a + hold + rel + 0.05);
      }
    }
    const play = (fn) => (...args) => { const t = wake(); if (t != null) fn(t, ...args); };

    return {
      // a button: the menu, a tab, Next level
      tap: play((t) => bell(1318.5, t, 0.16, 0.22, bus(0.3), 2, 0.8)),
      // something glides in: a breath rising, and a tone sliding up a fifth
      glide: play((t) => { const o = bus(0.5); noise(t, 0.4, 0.06, 0.15, o, { type: 'bandpass', f0: 400, f1: 2400, q: 2 }); osc('sine', 440, t, 0.06, 0.16, 0.34, o, 660); }),
      // let go of what you hold: the glide reversed, a breath falling and a tone sliding down
      release: play((t) => { const o = bus(0.5); noise(t, 0.35, 0.05, 0.05, o, { type: 'bandpass', f0: 2000, f1: 450, q: 2 }); osc('sine', 660, t, 0.02, 0.13, 0.3, o, 440); }),
      // a bond: a bell on the element's own note, one for each bond of a double or triple
      bond: play((t, f, n) => { const o = bus(0.55); for (let i = 0; i < Math.min(3, n || 1); i++) bell(f * [1, 1.5, 2][i], t + i * 0.07, i ? 0.18 : 0.3, 1.0, o, 3.5, 2.4); }),
      // a molecule made (the Moleculator): a small bloom
      made: play((t) => { const o = bus(0.7); osc('sine', 146.83, t, 0.01, 0.3, 0.9, o); bell(587.3, t, 0.24, 1.6, o, 3.5, 2); bell(880, t + 0.05, 0.14, 1.4, o, 3.5, 2); }),
      // the agent flies into the sphere: the space opens a little
      agent: play((t) => { const o = bus(0.6); pad([220, 329.63, 493.88], t, 0.35, 0.2, 0.6, 0.6, o, 400, 3200); bell(987.8, t + 0.25, 0.12, 0.9, o, 2, 1.2); }),
      /* The reaction, on the sphere's own timeline (reactor-scene.js startRun: `o` is 0.8 with an agent flying in
         first, else 0): the pad opens as the molecules swirl, bells sparkle thicker as they turn to dust, a deep bloom
         as the atoms re-form, a bright bell at the flash, and a breath upward as the products fly off. */
      reaction: play((t, o) => {
        const out = bus(0.75), s = t + (o || 0);
        pad([146.83, 220, 329.63, 369.99, 554.37], s + 0.3, 1.6, 1.4, 1.4, 0.34, out, 220, 2600);
        const arp = [1174.7, 1318.5, 1480, 1760, 2217.5];
        for (let k = 0; k < 14; k++) bell(arp[k % arp.length] * (k > 7 ? 2 : 1), s + 1.2 + k * 0.15, 0.07 + k * 0.006, 0.6, out, 2, 1);
        osc('sine', 73.4, s + 3.4, 0.01, 0.45, 1.4, out); bell(587.3, s + 3.4, 0.26, 2.2, out, 3.5, 2); bell(880, s + 3.43, 0.16, 2, out, 3.5, 2);
        bell(1760, s + 4.25, 0.14, 1.4, out, 3.5, 1.6);
        noise(s + 5.95, 0.5, 0.05, 0.2, out, { type: 'bandpass', f0: 500, f1: 3000, q: 2 });
      }),
      // nothing happens: a low falling 'bwom'; and, with no chances left, the reaction poured away after it
      bounce: play((t, at, poured) => {
        const o = bus(0.35), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(o);
        const s = t + (at || 0); osc('sine', 220, s, 0.005, 0.5, 0.3, lp, 105); osc('triangle', 110, s, 0.005, 0.2, 0.25, lp, 70);
        if (poured) { const p = t + poured, q = bus(0.6); pad([196, 293.66, 349.23], p, 0.1, 0.6, 0.8, 0.75, q, 2600, 180); noise(p, 1.3, 0.06, 0.2, q, { type: 'bandpass', f0: 2000, f1: 200, q: 1.5 }); }
      }),
      // a tap the game refuses (too far, the sphere full): a quieter 'bwom'
      refuse: play((t) => { const o = bus(0.25), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(o); osc('sine', 196, t, 0.005, 0.32, 0.22, lp, 120); }),
      // an atom or a molecule lost to the space
      lost: play((t) => { const o = bus(0.4); bell(293.66, t, 0.2, 0.7, o, 1.4, 1.2); }),
      // a goal made: it flies up into its orb
      goal: play((t) => { const o = bus(0.75); bell(1760, t, 0.3, 2.4, o, 3.5, 1.8); bell(2637, t + 0.08, 0.12, 1.8, o, 2, 1); }),
      won: play((t) => { const o = bus(0.75); pad([146.83, 220, 329.63, 415.3], t, 0.4, 1.1, 1.4, 0.24, o, 600, 2400); [587.3, 659.25, 739.99, 830.6, 880, 1108.7, 1318.5].forEach((f, i) => bell(f, t + i * 0.11, 0.24, 1.6, o, 3.5, 1.8)); }),
      lostLevel: play((t) => { const o = bus(0.5); pad([146.83, 174.61, 220], t, 0.2, 0.6, 1.0, 0.75, o, 1400, 200); }),
    };
  };
}(typeof self !== 'undefined' ? self : this));
