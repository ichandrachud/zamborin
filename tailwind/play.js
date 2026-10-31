/* TAILWIND — v1. One plane, flat ground, distance and a best.

   Draw the catapult back, let go, watch it run out. The rollout is the payoff,
   so the camera follows the whole way and nothing interrupts it.

   THE LAUNCHER IS A SLINGSHOT, NOT A GUN. A forked post, a rubber band, and the
   aeroplane sitting in the band. Dragging back stretches the band and swings the
   whole rig to point where it will fire, so the thing you grab and the thing
   that throws are the same object.

   TWO CAMERA SCALES. At rest the shot is close: the plane is about 40% of the
   frame, which is the only distance at which the band, the fork and the
   aircraft read as one machine. That framing cannot survive the flight — the
   arc tops out around 40 m and runs on for 500 — so releasing pulls the camera
   back to frame the whole arc, well past the requested half, and eases between
   the two rather than cutting.

   NO TRAJECTORY PREVIEW, DELIBERATELY. A dotted arc hands over the answer and
   turns the draw into a readout rather than a judgement. The instruments are
   the angle in degrees and the draw as a bar; everything else is learned by
   watching it land.
*/
(function () {
'use strict';

const M = window.TAILWIND_MODEL;

// The six aircraft, in the order they appear on the pick screen. The blurb says
// how each one wants to be flown, because that is the actual decision — every
// plane in the fleet tops out within 1% of the same distance, and what differs
// is the launch that gets it there (best draw runs 0.51 to 0.85). Flying one on
// another's launch costs up to half the distance.
const FLEET = [
  { key: 'Lacerta', file: 'lacerta.webp', blurb: 'Long wing, light bones. The most forgiving to aim — but it will not take a hard draw.' },
  { key: 'Vesper',  file: 'vesper.webp',  blurb: 'No weakness to work around, and no special talent either.' },
  { key: 'Tsunami', file: 'tsunami.webp', blurb: 'All lift and no manners. Floats, once you stop over-winding it.' },
  { key: 'Sirocco', file: 'sirocco.webp', blurb: 'Short wing, big engine. Wants speed rather than height.' },
  { key: 'Zephyr',  file: 'zephyr.webp',  blurb: 'Heavy and blunt, and strong enough to take almost any launch.' },
  { key: 'Tempest', file: 'tempest.webp', blurb: 'Built like a bridge. The only one that shrugs off a full draw.' },
];
// Wind for the day, metres per second, negative into the aeroplane's face. The
// range is weighted to headwinds because that is where the LAUNCH ANGLE becomes
// a decision: in calm air the best aim is simply as steep as the catapult goes,
// but from about 6 m/s on the nose the best angle drops away — to 46° on
// Lacerta and 28° on Tempest at 8 m/s — and it differs per aeroplane. It also
// moves who is fastest: Lacerta owns calm air, Tempest a stiff breeze, Zephyr
// a gale. Rolled once per attempt and shown before you touch the band.
// THE GOLF METER. The shipped control was a drag, and a drag has no time
// pressure: you could take five seconds lining it up and let go exactly on the
// number you learned last go, so once you knew the answer there was no
// execution left and nothing survived into the hundredth attempt. Both numbers
// are now set by a tap against a sweep you cannot sit on.
//
// Nothing else changes. The physics is untouched, so the wind still decides
// which angle you are aiming AT, launch strain still puts the best draw in the
// interior rather than at the stop, and the six planes still differ in which
// mistake costs them — over-draw ruins Lacerta, under-draw wastes Tempest.
//
// The two speeds are the whole difficulty dial (see meter.js). The 90%-of-best
// band is 9-13° of aim but only ~5% of the draw, so the draw sweep runs slower
// to give the same forgiveness in milliseconds.
//
// DOUBLED on 2026-08-20 at the user's call, from 0.80 / 1.90. Measured across
// the fleet against a 40 ms release error, the windows halve from 84-128 ms to
// 42-64, the mean launch drops from 88% of a perfect one to 82%, and goes
// landing inside 95% of perfect fall from one in four to one in twelve. A
// near-perfect launch stays around one in a hundred. That is the intent — it is
// meant to want a sharp hand — but it is the difficulty knob, and turning it
// back is a one-number change with nothing else to undo.
//
// Note the aim is now the tighter of the two on five of the six planes, which
// it was not before: their 90% aim band is only 9° against Lacerta's 13.
const ANG_SWEEP  = 0.40;   // seconds to run the aim across its whole range
const PULL_SWEEP = 0.95;   // seconds to draw the band from slack to full
// Both ping-pong rather than stopping at the end, so missing your moment costs
// you the wait for it to come round instead of the attempt.
const tri = (t, period) => { const u = (t % (2 * period)) / period; return u <= 1 ? u : 2 - u; };

const WIND_MIN = -15, WIND_MAX = 3;

// ONE TURBO BOOST PER FLIGHT, spent by tapping while airborne.
// It is paid for in airframe load, the same currency the launch pays in, so a
// boost taken at speed strains the wing and a boost taken slow costs almost
// nothing. That is what stops "tap immediately, always" from being correct.
// Tunable from the query string so a setting can be tried without a redeploy:
//   ?dv=10&stroke=1.5      dv is the impulse in m/s, stroke is the burn length
const QS_ = new URLSearchParams(location.search);
// (scaled with the model's HEFT, so the boost does to the heavier aeroplane what it did to the light one)
const BOOST_DV     = Math.max(0, Number(QS_.get('dv')) || 80 * Math.sqrt(M.CFG.HEFT || 1));
const BOOST_STROKE = Math.max(0.1, Number(QS_.get('stroke')) || 16);
// THE SWEET SPOT, GRADED. Every release is judged against the best this aeroplane can do in today's wind (the
// model's peak(), found while the player is still looking at the sling). A perfect one lets go clean (model.js,
// CLEAN_AT) and flies further; great and good are said out loud so you know how close you were, and in which flight.
const GRADES = [[M.CFG.CLEAN_AT, 'PERFECT'], [0.90, 'GREAT'], [0.80, 'GOOD']];
const gradeOf = (q) => { for (const [at, g] of GRADES) if (q >= at) return g; return null; };
// And the landing, by the angle it came in at (model.js, SKIP_MAX and DIG_FREE).
// Into a strong headwind even the best launch meets the ground steeply, so DUG IN is kept for the really steep ones.
const DUG_AT = M.CFG.DIG_FREE + 10;
const landingOf = (f) => f.skipped ? 'SKIPPED AND SLID' : f.touchGam > DUG_AT ? 'DUG IN' : 'LANDED';
// THE PACE OF A GO (owner, 2026-10-30: "it still doesn't have the speed of the Pingu game. Not the satisfaction or
// regret"). Measured, a go took 40 s and more, three quarters of it a steady glide, and the verdict came at the end.
// The physics is untouched; the REPLAY is not. The hit and the first second of climb play in real time, the glide in
// the middle is fast-forwarded so it lasts about CRUISE_S on screen, the approach and the touch play in real time again,
// and the slide runs quick. A whole flight is now about nine seconds.
const LAUNCH_SIM = 1.1, LAND_SIM = 1.4, CRUISE_S = 3.5, SLIDE_S = 1.8;
const smooth = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
function playRate(f, t) {
  const tt = f.touchT || f.t;
  const cruise = Math.max(0, tt - LAUNCH_SIM - LAND_SIM);
  const fast = Math.max(1, cruise / CRUISE_S);
  if (t >= tt) return 1 + (Math.max(1, (f.t - tt) / SLIDE_S) - 1) * smooth(tt + 0.5, tt + 1.4, t);
  return 1 + (fast - 1) * smooth(LAUNCH_SIM, LAUNCH_SIM + 0.8, t) * (1 - smooth(tt - LAND_SIM - 2.5, tt - LAND_SIM, t));
}
// THE HIT: the frame holds for a beat at the release and the world jolts, both scaled by how good it was, so a clean
// strike lands in the hand before the aeroplane has gone anywhere.
const HIT = { PERFECT: [150, 0.55], GREAT: [90, 0.32], GOOD: [60, 0.18], none: [30, 0.08] };
// THE MISS, named at once: which of the two taps cost the most, and which way.
function missOf(pk, angle, pull, wind) {
  const qA = M.quality(S.plane, angle, pk.pull, wind, pk), qP = M.quality(S.plane, pk.angle, pull, wind, pk);
  if (1 - qA >= 1 - qP) return angle > pk.angle ? 'aimed too high' : 'aimed too low';
  return pull > pk.pull ? 'drew too hard' : 'drew too soft';
}
function rollWind() {
  const t = Math.random();
  return Math.round((WIND_MIN + (WIND_MAX - WIND_MIN) * t) * Math.sqrt(M.CFG.HEFT || 1) * 2) / 2;   // (HEFT: as above)
}

const STATS = [
  ['WEIGHT',   (t) => t.weight],
  ['LIFT',     (t) => t.lift],
  ['DRAG',     (t) => t.drag],
  ['STRENGTH', (t) => t.tough],
];
const ZAM = window.ZAM_UI;          // shared button system, shared/ui.js
// gain 2.4 lifts the loudest transient from -11.7 dBFS to about -4, which is
// a normal listening level instead of one that needs the system volume at max.
// The limiter in shared/sfx.js catches the overlaps.
const SFX = window.ZSFX.create({ storageKey: 'zamborin.tailwind.sound', gain: 2.4 });

// ANALYTICS. Same shape as the rest of the fleet: a NOOP stand-in so a blocked
// or absent tracker can never throw into the frame loop. Tailwind has no
// levels, so it reports the two events that mean something here — the session
// started, and someone actually chose a plane and began — and lets the module
// count the seconds. levelStart/levelComplete are deliberately NOT faked from
// launches, or maxLevel and levelsCompleted would stop meaning the same thing
// fleet-wide, which is the one rule shared/analytics.js asks callers to keep.
const T_NOOP = { init() {}, gameStart() {}, levelStart() {}, levelComplete() {},
                 levelRestart() {}, hintUsed() {} };
const TRACK = () => (window.ZAM_TRACK || T_NOOP);

// SOUND. The one-shots come from shared/sfx.js. What that library cannot give
// is a note that is HELD — and this game is mostly holding: a band under
// tension that creaks higher as you draw it, and an aeroplane whose rush rises
// and falls with its airspeed for half a minute. So the sustained voices are
// built here on the very context the shared engine opens, which is what its own
// header invites. Two layers, because one is not convincing: filtered noise for
// the air going past, and a low body tone underneath it so the thing has mass.
const VOICE = {
  ctx: null, ready: false,
  rushGain: null, rushFilter: null, bodyOsc: null, bodyGain: null,
  stretchOsc: null, stretchGain: null, stretchFilt: null,
  bedGain: null, bedLevel: 0, bedNext: 0, bedTarget: -1, adSilent: false,

  init() {
    if (this.ready) return;
    const ctx = SFX.ensureAudio();
    if (!ctx) return;
    this.ctx = ctx;

    // a long noise buffer, looped — the air
    // PINK, not white (owner, 2026-10-30: "I was never a fan of the sounds"). White noise has as much energy in
    // every octave's top as its bottom and through any filter it still reads as static; pink falls 3 dB an octave,
    // which is how wind actually sounds. Paul Kellet's filter, the standard way to make it.
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    // LOWPASS, not bandpass. A band centred at 700 keeps the noise energy in
    // the 400-1500 Hz region, which is where a phone speaker is most efficient
    // and where the ear tires fastest — so on a handset a thirty-second flight
    // was thirty seconds of hiss, and the honest report was that a player would
    // mute the game within two goes. A lowpass keeps only the bottom of the
    // noise: air moving past, felt rather than heard, and largely below what a
    // phone speaker even reproduces. Turning hiss down only makes quieter hiss;
    // this removes the band it lived in.
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 400; filt.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(filt); filt.connect(g); g.connect(SFX.out() || ctx.destination);
    src.start(0);
    this.rushFilter = filt; this.rushGain = g;

    // the airframe's own low note
    const osc = ctx.createOscillator();
    osc.type = 'triangle'; osc.frequency.value = 90;
    const og = ctx.createGain(); og.gain.value = 0;
    osc.connect(og); og.connect(SFX.out() || ctx.destination); osc.start(0);
    this.bodyOsc = osc; this.bodyGain = og;

    // the band, creaking upward as it is drawn
    // TRIANGLE, not sawtooth. A sawtooth carries every harmonic at 1/n and at
    // 130-180 Hz that is a buzz you cannot listen to for long. You only have to
    // listen to it for long on two of the six planes — Lacerta wants the
    // fleet's lowest draw at 0.51 and Tempest its highest at 0.85, and hunting
    // an extreme means riding the sweep round again when you overshoot. Both
    // were reported as unpleasant and the middle four were not, which is the
    // exposure time talking, not the pitch. A triangle has odd harmonics only,
    // falling at 1/n^2: the same note, a quarter of the rasp.
    const so = ctx.createOscillator();
    so.type = 'triangle'; so.frequency.value = 60;
    const sg = ctx.createGain(); sg.gain.value = 0;
    const sf = ctx.createBiquadFilter();
    sf.type = 'lowpass'; sf.frequency.value = 900;
    so.connect(sf); sf.connect(sg); sg.connect(SFX.out() || ctx.destination); so.start(0);
    this.stretchFilt = sf;
    this.stretchOsc = so; this.stretchGain = sg;

    // THE BED. A game with no continuous voice sounds switched off between
    // launches, and this one spends most of its time between launches. The
    // same noise buffer as the rush, but taken low and wide rather than
    // band-limited: the rush lives at 420-1520 Hz and sweeps, so the bed is
    // put under it at 260 with a gentle lowpass and never competes for the
    // same air. A BufferSource cannot be started twice, hence a second one.
    const bsrc = ctx.createBufferSource();
    bsrc.buffer = buf; bsrc.loop = true;
    const bfilt = ctx.createBiquadFilter();
    bfilt.type = 'lowpass'; bfilt.frequency.value = 260; bfilt.Q.value = 0.4;
    const bg2 = ctx.createGain(); bg2.gain.value = 0;
    bsrc.connect(bfilt); bfilt.connect(bg2); bg2.connect(SFX.out() || ctx.destination);
    bsrc.start(0);
    this.bedGain = bg2;

    // THE PROPELLER. The six aeroplanes spin their propellers in flight now, so the air carries a soft toy-engine
    // hum: a low sawtooth, rounded off by a lowpass, pulsed at the blades' rate so it purrs rather than drones.
    const po = ctx.createOscillator(); po.type = 'sawtooth'; po.frequency.value = 40;
    const pf = ctx.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 340; pf.Q.value = 0.7;
    const pam = ctx.createGain(); pam.gain.value = 0.6;
    const plfo = ctx.createOscillator(); plfo.frequency.value = 22; const pdep = ctx.createGain(); pdep.gain.value = 0.4;
    plfo.connect(pdep); pdep.connect(pam.gain);
    const pg = ctx.createGain(); pg.gain.value = 0;
    po.connect(pf); pf.connect(pam); pam.connect(pg); pg.connect(SFX.out() || ctx.destination); po.start(0); plfo.start(0);
    this.propOsc = po; this.propLfo = plfo; this.propGain = pg; this.propFilt = pf;

    // THE WHEELS ON GRASS, from touchdown until it stops: low pink noise that slows and darkens with the aeroplane,
    // with the small unevenness of a field in it. This is the landing now, instead of a single thump.
    const rsrc = ctx.createBufferSource(); rsrc.buffer = buf; rsrc.loop = true; rsrc.playbackRate.value = 0.7;
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 400; rf.Q.value = 0.5;
    const rg = ctx.createGain(); rg.gain.value = 0;
    rsrc.connect(rf); rf.connect(rg); rg.connect(SFX.out() || ctx.destination); rsrc.start(0);
    this.rollGain = rg; this.rollFilt = rf;
    this.pink = buf;

    this.ready = true;
  },

  // Everything is ramped, never set: a step change on a live gain is a click.
  set(node, v, t) {
    if (!node || !this.ctx) return;
    const now = this.ctx.currentTime;
    node.cancelScheduledValues(now);
    node.setValueAtTime(node.value, now);
    node.linearRampToValueAtTime(v, now + (t || 0.06));
  },

  flight(speed, alt, ground) {
    if (!this.ready) return;
    const on = SFX.isOn();
    const s = Math.max(0, Math.min(1, speed / 60));
    // the propeller: it hums with the airspeed, and swells for a moment after a boost
    const now = this.ctx.currentTime, surge = Math.max(0, (this.boostUntil || 0) - now) / 1.6;
    this.set(this.propGain.gain, on && !ground ? 0.010 + 0.014 * s + 0.05 * surge : (on && ground ? 0.006 * s : 0), 0.12);
    this.set(this.propOsc.frequency, 30 + 34 * s + 38 * surge, 0.12);
    this.set(this.propLfo.frequency, 14 + 26 * s + 20 * surge, 0.12);
    // the wheels, only while they are on the grass; a little uneven, as a field is
    const r = Math.max(0, Math.min(1, speed / 26));
    this.set(this.rollGain.gain, on && ground ? (0.030 + 0.055 * r) * (0.85 + Math.random() * 0.3) : 0, ground ? 0.08 : 0.15);
    this.set(this.rollFilt.frequency, 160 + 520 * r, 0.1);
    // Cut back after the master gain went to 2.4: at the old coefficients the
    // rush peaked at 0.25 into the limiter and was the loudest sustained thing
    // in the game by a distance, which is what made it harsh rather than fast.
    // The filter ceiling comes down with it — a 0.7-Q bandpass centred at 1520
    // is a bright hiss, and the speed reads just as well at 1140.
    this.set(this.rushGain.gain, on ? 0.010 + 0.030 * s * s : 0, 0.10);
    // 260-680 Hz. The corner opens with speed, so the rush still brightens as
    // it accelerates, but it never climbs into the band that was the problem.
    this.set(this.rushFilter.frequency, 260 + 420 * s, 0.10);
    // The airframe's low note carries a touch more of the load now that the
    // noise above it carries less: it is the part that reads as an aeroplane
    // rather than as static.
    this.set(this.bodyGain.gain, on ? 0.019 * s : 0, 0.10);
    this.set(this.bodyOsc.frequency, 62 + 70 * s, 0.10);
  },
  // `held` is the band drawn and LOCKED, which is what setAng is: the assembly
  // swings about the screw but nothing is stretching any more. Without it the
  // voice simply froze at its last setPull value and droned on unchanged for as
  // long as the player took to choose an angle — a sawtooth describing a motion
  // that had stopped. Held, it drops to a quarter and the filter closes down,
  // so the band still reads as loaded without sitting on the ear.
  stretch(pull, held) {
    if (!this.ready) return;
    const on = SFX.isOn() && pull > 0.02;
    const g  = held ? 0.25 : 1;
    this.set(this.stretchGain.gain, on ? (0.005 + 0.013 * pull) * g : 0, held ? 0.30 : 0.05);
    this.set(this.stretchOsc.frequency, 55 + 145 * pull, 0.05);
    if (this.stretchFilt) this.set(this.stretchFilt.frequency, held ? 420 : 900, 0.30);
  },
  hush() {
    if (!this.ready) return;
    this.set(this.rushGain.gain, 0, 0.25);
    this.set(this.bodyGain.gain, 0, 0.25);
    this.set(this.stretchGain.gain, 0, 0.08);
    if (this.propGain) this.set(this.propGain.gain, 0, 0.6);
    if (this.rollGain) this.set(this.rollGain.gain, 0, 0.5);
  },

  // ---- one-shots, made here so they belong with the held voices (owner, 2026-10-30) ----
  // A note shaped like a struck thing: a quick attack and a long exponential fall, never a step.
  note(freq, at, dur, gain, type, attack, to) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, at);
    if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur * 0.8);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + (attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(SFX.out() || c.destination); o.start(at); o.stop(at + dur + 0.05);
  },
  air(at, dur, gain, f0, f1, q) {
    const c = this.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.pink; f.type = 'bandpass'; f.Q.value = q || 0.7;
    f.frequency.setValueAtTime(f0, at); f.frequency.exponentialRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f); f.connect(g); g.connect(SFX.out() || c.destination); src.start(at, Math.random()); src.stop(at + dur + 0.05);
  },
  // The band letting go: a deep rubber thwum, and the aeroplane's rush away.
  thwum(pull) {
    if (!this.ready || !SFX.isOn()) return;
    const t = this.ctx.currentTime;
    this.note(150 + 60 * pull, t, 0.34, 0.16 + 0.06 * pull, 'sine', 0.005, 48);
    this.note(300 + 120 * pull, t, 0.12, 0.03, 'triangle', 0.003, 120);
    this.air(t + 0.02, 0.5, 0.10 + 0.05 * pull, 450, 1500, 0.6);
  },
  // Touchdown: the tyres kissing the grass, twice and softly. The rolling that follows is the held voice above.
  kiss(speed) {
    if (!this.ready || !SFX.isOn()) return;
    const t = this.ctx.currentTime, s = Math.max(0.3, Math.min(1, speed / 35));
    this.note(78, t, 0.22, 0.05 * s, 'sine', 0.018);
    this.air(t, 0.18, 0.04 * s, 380, 220, 0.8);
    this.note(84, t + 0.11, 0.18, 0.03 * s, 'sine', 0.02);
  },
  // A release graded against today's best (owner, 2026-10-30, after Pingu Throw): the sweet spot has to be felt. A
  // clean, bright crack for a perfect one, with a ring over it; a smaller tap for great; nothing for the rest.
  crack(grade) {
    if (!this.ready || !SFX.isOn() || !grade || grade === 'GOOD') return;
    const t = this.ctx.currentTime + 0.03, perfect = grade === 'PERFECT';
    this.note(1350, t, 0.07, perfect ? 0.06 : 0.035, 'triangle', 0.002, 700);
    this.air(t, 0.09, perfect ? 0.06 : 0.03, 2600, 1800, 1.4);
    if (perfect) { this.note(1046.5, t + 0.04, 0.9, 0.03, 'sine', 0.006); this.note(1568, t + 0.04, 0.6, 0.012, 'sine', 0.006); }
  },
  // A landing that digs in: a dull thump into turf, nothing like the kiss.
  dig(speed) {
    if (!this.ready || !SFX.isOn()) return;
    const t = this.ctx.currentTime, s = Math.max(0.4, Math.min(1, speed / 40));
    this.note(56, t, 0.32, 0.10 * s, 'sine', 0.006, 38);
    this.air(t, 0.35, 0.07 * s, 500, 160, 0.6);
  },
  // A boost: the engine opens up for a moment.
  boost() {
    if (!this.ready || !SFX.isOn()) return;
    const t = this.ctx.currentTime; this.boostUntil = t + 1.6;
    this.air(t, 0.7, 0.07, 700, 1600, 0.5);
  },
  // The flight is over: a warm bell, three rising notes for a new best and one gentle one otherwise.
  chime(best) {
    if (!this.ready || !SFX.isOn()) return;
    const t = this.ctx.currentTime + 0.05;
    const notes = best ? [523.25, 659.25, 783.99] : [587.33];
    notes.forEach((f, i) => {
      const at = t + i * 0.13;
      this.note(f, at, 1.6, 0.05, 'sine', 0.012);
      this.note(f * 2, at, 0.9, 0.012, 'sine', 0.01);
      this.note(f * 2.76, at, 0.5, 0.005, 'sine', 0.006);
    });
  },

  // Called every frame. A bed held at one level reads as hiss rather than
  // weather, so it is re-aimed every 2.5-4 s and walked there over more than
  // a second — slow enough that you notice it has moved, never that it moved.
  // Ducked to 40% in flight so the rush stays the loudest thing in the air.
  bed(flying) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (now >= this.bedNext) {
      this.bedLevel = 0.008 + Math.random() * 0.006;
      this.bedNext  = now + 2.5 + Math.random() * 1.5;
    }
    const want = (SFX.isOn() && !this.adSilent)
      ? this.bedLevel * (flying ? 0.40 : 1) : 0;
    // only ramp when the target actually moves: re-issuing the same ramp on
    // every frame restarts it 60 times a second and it never arrives.
    if (Math.abs(want - this.bedTarget) > 0.0004) {
      this.bedTarget = want;
      this.set(this.bedGain.gain, want, 1.2);
    }
  },

  // An advertisement is not the end of a flight, so this is not hush(). It
  // silences everything including the bed, and deliberately does NOT touch
  // SFX.setOn: that is the player's saved preference in localStorage, and an
  // ad has no business overwriting it.
  adMute() {
    if (!this.ready) return;
    this.adSilent = true;
    this.hush();
    this.set(this.bedGain.gain, 0, 0.15);
    this.bedTarget = 0;
  },
  adResume() {
    this.adSilent = false;
    this.bedTarget = -1;          // force the next bed() to walk it back in
  },
};

// ADS. GameDistribution hosts its own copy of this game and requires a preroll
// and a midroll; nothing here fires anywhere else, because `gdsdk` only exists
// on a page that loaded their SDK. That is the point: this file is byte-for-byte
// the same on zamborin.com and in the portal package, which is both less to
// maintain and what GD's own agreement asks for (2.6.4, the copy they serve must
// match the version published elsewhere).
//
// Both calls sit inside pointer handlers, which GD requires, and both sit in
// phases where the simulation is idle — 'pick' and 'rest' — so an advertisement
// can never interrupt a flight in progress.
let lastAdAt = -Infinity;
const GD = {
  show() {
    if (!window.gdsdk || typeof window.gdsdk.showAd !== 'function') return;
    lastAdAt = performance.now();
    try { window.gdsdk.showAd(); } catch (e) { /* never throw into a handler */ }
  },
  // GD's guidelines bless a timer for games that have no levels to break on,
  // and this one has none. They throttle server-side as well, so this is the
  // polite floor rather than the only guard.
  due() { return performance.now() - lastAdAt > 120000; },
};
window.addEventListener('gd-pause',  () => VOICE.adMute());
window.addEventListener('gd-resume', () => VOICE.adResume());

// The snap: the band letting go, then the airframe leaving the arm. Two events
// a few milliseconds apart, because a single burst reads as a click, not a snap.
// (2026-10-30: the snap was a square-wave click and a hiss; now VOICE.thwum, a rubber band and a rush of air.)
function snapSound(pull) { VOICE.thwum(pull); }
// Touchdown. The owner (2026-10-30): "it sounds like a tin can has crashed on a pavement. It is not the sound of a
// plane gracefully landing." Now a soft tyre kiss, and the grass rolling under the wheels until it stops.
function touchSound(speed) { VOICE.kiss(speed); }
const KEY = 'zamborin.tailwind.bests';
function loadBests() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}
function saveBests(b) { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) {} }

const FRAME_W = 760, FRAME_H = 600;   // the site-wide desktop frame
// The catapult artwork is tailwind/assets/catapult.svg. It is READ at runtime
// rather than copied in, so editing the asset changes the game; the values
// below are only a fallback for when the fetch fails. Its pivot circle is the
// launch point, and the pivot's height above the trunk's foot sets the world
// scale, so the aeroplane and the machine can never drift out of proportion.
const SVG = { w: 111, h: 177, px: 94.342, py: 37, pivotH: 140 };

// Every proportion below is measured off the design drawing and expressed as a
// multiple of the PIVOT HEIGHT, which is the one length the artwork and the
// game agree on. The catapult's own shape comes from the SVG, so it is right by
// construction; these are the numbers that place the aeroplane against it.
// The check that the measuring was sound: the design's fork-top sits at 1.270
// pivot heights and the asset draws it at 1.264.
const PLANE_OF_PIVOT = 0.715;   // plane length; was 0.975, a third too big
const NEST_DX = -0.207;         // its centre, left of the fork
// (the sling used to sit a little above the pivot too, at +0.044 of pivot
//  height — that is where model CFG.LAUNCH_H comes from. Nothing reads it now
//  that the assembly hangs off the screw itself.)
const BAND_T0 = 2.8, BAND_T1 = 5.4;    // band HALF-width at fork / far end, SVG units
const PLANE_LEN_M = PLANE_OF_PIVOT * 8.0;   // PIVOT_H, in world metres
// Chosen so the whole rig fits: the fork stands 1.264 pivot heights tall, which
// at this scale is about 65% of the frame, leaving sky above it.
const REST_PLANE_FRAC = 0.29;         // how much of the frame the plane fills at rest
const FLY_PLANE_FRAC = 0.12;          // and in the wide shot
// A full draw as a share of the frame, not a fixed pixel count: pinned at 260
// the drawn-back plane ran off the left edge of a phone.
const maxDrag = () => Math.min(260, W * 0.34);
const GROUND_FRAC = 0.17;             // apron below the horizon

// Palette from shared/tokens.css. ACCENT_MARK is the locked Zamborin coral; the
// two INK values are dark enough to hold AA against sky and grass, which the
// accent itself does not, so accent is used for marks and ink for type.
//
// ACCENT is the BUTTON fill only, and is darker so white type on it measures
// 4.85:1 rather than 4.04:1. ACCENT_MARK is deliberately UNCHANGED: every other
// use here sits over the sky photograph, not the dark page, so a lighter coral
// would make those WORSE. Those marks need a reading pass against the art, not
// a contrast sweep against a flat colour.
const ACCENT = '#C24A39';
const ACCENT_MARK = '#D8523F';
const INK = 'rgba(14,23,38,0.92)';        // --bg at full strength

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Trunk taken verbatim from the asset. The band is redrawn rather than blitted
// because it has to stretch and swing to wherever the plane has been pulled;
// it keeps the asset's own gradient and taper.
let TRUNK_FILL = '#887135';
let TRUNK = new Path2D('M100.842 0C100.842 0.999954 98.0757 14.9667 97.8423 18C96.9952 29.0136 99.3773 68.0199 100.429 88.5C100.733 89.8333 101.442 92.5 101.842 92.5C102.242 92.5 104.342 87.1667 105.342 84.5L106.842 86C104.971 91.3333 101.29 102.9 101.536 106.5C103.294 124.511 107.871 158.786 110.342 176.5H86.3423C90.8422 167.999 92.3423 120 92.3423 116.5C92.3423 112.994 92.3422 35.4997 90.3423 28C88.7422 22.0001 84.0089 15.8333 81.8423 13.5L83.8423 11.5C86.6756 16.1667 92.2852 23.2999 92.8423 22C95.8422 15.0001 96.8423 6.49988 99.3423 0H100.842Z');

fetch('./assets/catapult.svg')
  .then(r => r.ok ? r.text() : Promise.reject())
  .then(txt => {
    const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return;
    const root = doc.querySelector('svg');
    const vb = (root && root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) { SVG.w = vb[2]; SVG.h = vb[3]; }
    // the trunk is the flat-filled path; the band is the one on a gradient
    const solid = [...doc.querySelectorAll('path')]
      .find(el => /^#/.test(el.getAttribute('fill') || ''));
    if (solid && solid.getAttribute('d')) {
      TRUNK = new Path2D(solid.getAttribute('d'));
      TRUNK_FILL = solid.getAttribute('fill');
    }
    const c = doc.querySelector('circle');
    if (c) { SVG.px = +c.getAttribute('cx'); SVG.py = +c.getAttribute('cy'); }
    SVG.pivotH = SVG.h - SVG.py;
  })
  .catch(() => {});   // the inlined fallback above already draws

// LOADING ORDER IS PART OF THE DESIGN, NOT AN AFTERTHOUGHT.
// The picker is the first thing on screen and it needs six sprites; the
// backdrop is not needed until a plane has been chosen and it weighs more than
// all six together. Requesting them in one undifferentiated burst — which is
// what this did — puts a megabyte nobody is looking at yet in front of the six
// images the player is staring at, and on a slow connection the cards sit empty
// while it arrives. The sprites are marked high priority and go out first; the
// full backdrop is held back until they are in (or 4 s have passed, so a single
// stalled sprite cannot strand the scenery for ever).
const ART = {};
let artLeft = FLEET.length;
for (const f of FLEET) {
  const im = new Image();
  im.fetchPriority = 'high';
  const done = () => { if (--artLeft === 0) loadBackdrop(); };
  im.onload = () => { ART[f.key].ok = true; done(); };
  im.onerror = done;
  im.src = './assets/' + f.file;
  ART[f.key] = { img: im, ok: false };
}
const art = () => ART[S.plane];
// The 3D world (world3d.js) photographs each aeroplane side on once its models are in, and those portraits take
// the paintings' place on the pick cards and in the sling's measurements, so the cards show the planes you fly.
window.addEventListener('tailwind-art', (e) => { const d = e.detail; if (d && ART[d.key]) ART[d.key] = { img: d.img, ok: true }; });

// Scenery. The backdrop is one wide strip carrying mountains, a treeline and a
// field; the sky is a plain vertical gradient, so it stretches to any size
// without showing it. BG_HORIZON is where the field meets the treeline in that
// strip, which is what lets the same image serve as both the far scenery above
// the ground line and the near grass below it.
const BG_HORIZON = 0.54;
const skyImg = new Image(); let skyOK = false;
skyImg.onload = () => { skyOK = true; };
skyImg.src = './assets/sky.jpg';

// The backdrop arrives in two passes. background-lq.webp is the same picture at
// a fifth of the width and 22 KB, so it lands almost at once even on a bad line
// and the scene is a landscape from the first frame — soft, but the right
// mountains in the right places. The full strip replaces it when it gets here,
// and because both are the same image at the same aspect nothing moves when it
// does. Before this the wait was a flat green rectangle, which does not read as
// loading, it reads as broken.
const bgLoImg = new Image(); let bgLoOK = false;
bgLoImg.onload = () => { bgLoOK = true; };
bgLoImg.src = './assets/background-lq.webp';

const bgImg = new Image(); let bgOK = false;
bgImg.onload = () => { bgOK = true; };
bgImg.fetchPriority = 'low';
let backdropAsked = false;
function loadBackdrop(force) {
  // The painted backdrop is only the fallback now: while the 3D world is on its way or running, its megabyte is not
  // fetched at all. If the 3D world gives up (no WebGL, a failed load) it is fetched then, and if its files never
  // arrive at all, so that nothing can even say it failed, the deadline below fetches it anyway.
  const w3 = window.TAILWIND_3D;
  if (!force && window.TAILWIND_3D_WANTED && !(w3 && w3.failed)) return;
  if (force && w3 && w3.ready) return;
  if (backdropAsked) return;
  backdropAsked = true;
  bgImg.src = './assets/background.webp';
}
setTimeout(loadBackdrop, 4000);
window.addEventListener('tailwind-3d-failed', () => loadBackdrop());
setTimeout(() => loadBackdrop(true), 9000);

let W = FRAME_W, H = FRAME_H, groundY = 0, wide = true;

const S = {
  phase: 'pick',
  plane: FLEET[0].key,
  bests: loadBests(),
  wind: 0,
  cards: [],
  angle: 22, pull: 0, meterT: 0,
  dragging: false,
  flight: null, flightStart: 0,
  dist: 0,
  beatBest: false,
  btn: null, chg: null, snd: null, touched: false,
  camX: 0, camY: 0, ppm: 40, ppmTarget: 40, bgZoom: 1, bgZoomTarget: 1,
};

Object.defineProperty(S, 'best', {
  get() { return this.bests[this.plane] || 0; },
  set(v) { this.bests[this.plane] = v; saveBests(this.bests); },
});

// The reference width the world is drawn against. On desktop it is the house
// frame and NOT the live canvas width, so going full screen shows more sky and
// more field at the same scale rather than magnifying what was already there.
const scaleRefW = () => (wide ? FRAME_W : W);
function restPPM() { return (REST_PLANE_FRAC * scaleRefW()) / PLANE_LEN_M; }

// Releasing dollies the camera back a little, it does not cut to a wide shot.
// Pulling back shrinks what is near far more than what is far away, so the
// aeroplane loses a fifth of its size while the mountains lose three percent —
// that ratio IS the perspective. Scaling both by the same amount, or scaling
// the backdrop not at all, is what made the earlier zoom read as flat.
// Both scales come from ONE camera distance, so they can never drift apart.
// DEPTH is how much further off the scenery is than the aeroplane, and it is
// not invented: it is what the earlier 20%-near / 3%-far calibration works out
// to. Pull the camera back by d and a thing at distance x scales by x/(x+d),
// so the plane loses a lot and the ridge behind it loses almost nothing.
const DEPTH = 8;
const FLY_ZOOM = FLY_PLANE_FRAC / REST_PLANE_FRAC;   // hold the wide shot at 12%
// The wide shot is for the part of the flight that needs width. On the way down
// the camera comes back in, so the touchdown is watched from close to rather
// than from the same distance as the cruise — the approach is the bit worth
// seeing. Driven by height, so it eases out on the climb and in on the descent
// without anything having to know which phase the flight is in.
const LAND_ZOOM = 0.62;
const ZOOM_ALT = 34;        // metres over which it opens out to the wide shot
// WITHOUT A BOOST NOTHING CAN PASS 132.1 m, measured across the whole input
// space, and the zoom saturated at 34 m, which was fine because chase() kept the
// aeroplane framed. A boost roughly doubles that ceiling and the shot had
// nowhere left to go. Above 135 m it keeps opening out, so the climb reads as
// height rather than running off the top. Below that nothing has changed, so an
// unboosted flight looks exactly as it always did.
const HIGH_ALT = 135;
function zoomForAlt(alt) {
  const t = Math.max(0, Math.min(1, alt / ZOOM_ALT));
  let z = LAND_ZOOM + (FLY_ZOOM - LAND_ZOOM) * t;
  if (alt > HIGH_ALT) z = Math.max(z * (HIGH_ALT / alt), FLY_ZOOM * 0.32);
  return z;
}

// THE CLOSING ZOOM WAITS FOR THE AEROPLANE TO STOP. Driving it off the run as
// well as the height was tried, so that the camera drew in over the last tenth
// of the distance: it read as wrong on a desktop, because the camera is pulling
// in while the aeroplane is still travelling and the two motions fight. Height
// alone during the flight, and the whole closing move happens in one piece once
// it is at rest — see the 'rest' branch, which targets LAND_IN and eases there.
const LAND_IN = 0.80;                            // the resting shot, vs the rest-of-game shot
const bgForZoom = (z) => DEPTH / (DEPTH + (1 / z - 1));
const BG_ZOOM = DEPTH / (DEPTH + (1 / FLY_ZOOM - 1));   // works out at 0.77
// How much of the frame the backdrop stands in, and how fast it drifts. The two
// are linked: the strip is 6.7x wider than tall, so a shorter backdrop is also a
// narrower one and runs out sooner. At 0.80 it carries about 610 m of launch.
const BG_FILL = 0.80;
const BG_PARALLAX = 0.13;       // the ridge only; the field runs at 1.0
const GRASS_SPAN_M = 600;       // world metres across one copy of the field
const GRASS_X0 = -80;           // where its left edge sits, in world metres
function flyPPM() { return FLY_ZOOM * restPPM(); }

// Sizing follows the house pattern (see prism/play.js): the LOGICAL size goes
// onto the body as --canvas-w / --canvas-h, shared/chrome.css sizes the wrapper
// from those, and the canvas element is left to CSS. Drawing then happens in
// logical units with one scale transform, so the same code serves the 760x600
// desktop frame and a full-bleed phone. Setting canvas.style directly — which
// is what this file did while it was a bare prototype — fights the page layout
// the moment the game is put inside the site chrome.
const MODE = (matchMedia('(pointer: coarse)').matches || window.innerWidth < 768)
  ? 'mobile' : 'desktop';
document.body.classList.add('mode-' + MODE);
let SCALE = 1;

// A phone reported the game drawn into a tall narrow strip down the left of the
// screen, correctly proportioned but occupying about a fifth of the width. That
// shape is what you get when the CSS box and the W x H this file draws in
// disagree about ASPECT: a single uniform scale cannot satisfy both, so the
// drawing is fitted inside the mismatched box and the rest of the canvas is
// left bare.
//
// The disagreement is available in two ways, and this sizes defensively against
// both rather than picking one, because the failure only shows on real handsets:
//
//   1. chrome.css derives the wrap's box from --canvas-w / --canvas-h in
//      100dvh units. Feed it a bad --canvas-h and it computes a bad WIDTH from
//      the ratio: with 393 x 1672 declared and 745 of real dvh, that formula
//      gives a wrap 175 px wide, which is the reported strip almost exactly.
//   2. window.innerHeight is not dependable on every mobile browser. Some
//      in-app browsers report a layout height far taller than the screen.
//
// So: cross-check the viewport instead of trusting innerHeight alone, pin the
// canvas as well as the wrap so no CSS ratio gets a vote, and refuse to fit
// into a box whose aspect does not match — draw at our own size instead of
// silently letterboxing.
function viewport() {
  const vv = window.visualViewport;
  const w = [window.innerWidth, vv && vv.width, document.documentElement.clientWidth]
    .filter((v) => typeof v === 'number' && v > 120);
  const h = [window.innerHeight, vv && vv.height, document.documentElement.clientHeight]
    .filter((v) => typeof v === 'number' && v > 120);
  return { w: Math.round(Math.min(...w)), h: Math.round(Math.min(...h)) };
}

function resizeCanvas() {
  const d = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  if (!wide) { canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; }
  else { canvas.style.width = ''; canvas.style.height = ''; }
  const r = canvas.getBoundingClientRect();
  let cw = r.width > 8 ? r.width : W, ch = r.height > 8 ? r.height : H;
  // If the box we were given is not the shape we draw, our own numbers win.
  if (Math.abs((cw / ch) / (W / H) - 1) > 0.02) { cw = W; ch = H; }
  const bw = Math.round(cw * d), bh = Math.round(ch * d);
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  SCALE = bw / W;
}

function fit() {
  wide = MODE === 'desktop';
  const focus = document.body.classList.contains('focus-mode');
  const vp = viewport();
  // FULL SCREEN GIVES THE GAME MORE ROOM, IT DOES NOT ENLARGE IT. The shipped
  // behaviour keeps the logical canvas at the 760x600 house frame and lets CSS
  // stretch it, so the read-outs, the pills and the aeroplane all magnify
  // together and the control row can be pushed past the foot of the screen.
  // Taking the viewport's real pixels instead means the UI is drawn at its own
  // size and the extra room becomes more sky and more field.
  W = (wide && !focus) ? FRAME_W : vp.w;
  H = (wide && !focus) ? FRAME_H : vp.h;
  document.body.style.setProperty('--canvas-w', W + 'px');
  document.body.style.setProperty('--canvas-h', H + 'px');
  // Inline sizing from JS, never CSS dvh: chrome.css sizes the wrap from
  // 100dvh, which does not always agree with the height actually on screen,
  // and the disagreement lands as a letterbox or a control row below the fold.
  const wrap = canvas.parentElement;
  if (wrap) {
    if (!wide || focus) { wrap.style.width = W + 'px'; wrap.style.height = H + 'px'; }
    else { wrap.style.width = ''; wrap.style.height = ''; }
  }
  // ...AND ITS CONTAINER. Sizing the wrap correctly is only half of it: the row
  // it sits in is still `height: 100dvh` and centres its child, and on iOS
  // Safari dvh resolves to the URL-bar-hidden height even while the bar is
  // showing. The row is then taller than the screen, the correctly-sized wrap
  // is centred inside it, and the top of the game — the splash wordmark — is
  // pushed up behind the browser chrome. Same measured H, same reasoning.
  const row = document.querySelector('.play-row');
  if (row) row.style.height = (!wide || focus) ? H + 'px' : '';
  resizeCanvas();
  groundY = Math.round(H * (1 - GROUND_FRAC));
  if (S.phase !== 'fly' && S.phase !== 'rest') { S.ppm = S.ppmTarget = lockPPM(); }
}
// The first measurement on a handset is taken while the splash is up and the
// address bar is still settling, and this file had no way to correct it — every
// other game in the fleet re-fits on these three and this one did not.
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 100));
window.addEventListener('splash-done', fit);
window.addEventListener('load', fit);
if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);

const sx = (wx) => (wx - S.camX) * S.ppm;
const sy = (wy) => groundY - (wy - S.camY) * S.ppm;
// The aeroplane launches from x = 0; the fork stands a little to its right, so
// the first thing a launch does is pass behind the trunk.
const TREE_X = -NEST_DX * M.CFG.PIVOT_H;
const pad  = () => ({ x: sx(TREE_X), y: sy(M.CFG.PIVOT_H) });   // the screw
// There is no second anchor any more. The aeroplane hangs off the screw at the
// end of the band, so where it rests falls out of the draw length and the aim
// rather than being a point of its own.

// ---- input ---------------------------------------------------------------
function pointer(e) {
  const r = canvas.getBoundingClientRect();
  const p = e.touches ? e.touches[0] : e;
  // the canvas is displayed at whatever size the layout gives it, so a tap has
  // to be converted back into the logical frame the game draws in
  return {
    x: (p.clientX - r.left) * (W / (r.width || W)),
    y: (p.clientY - r.top) * (H / (r.height || H)),
  };
}
function hitSound(p) {
  const b = S.snd;
  return !!b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}
function hitChange(p) {
  const b = S.chg;
  return !!b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}
function hitBtn(p) {
  const b = S.btn;
  return !!b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}
// A touch that is not swallowed also fires a compatibility mousedown, and this
// game now counts taps for everything: one stray duplicate would skip a whole
// stage of the launch. preventDefault below suppresses it in every browser that
// honours it, and this guard covers the ones that do not.
let lastTouchAt = 0;
function onDown(e) {
  if (e.type === 'touchstart') lastTouchAt = performance.now();
  else if (performance.now() - lastTouchAt < 600) return;   // ghost mouse event
  if (S.phase === 'fly') {
    if (S.boostLeft > 0 && S.flight) {
      e.preventDefault();
      const tNow = S.simT;
      S.flight = M.fly(S.plane, S.angle, S.pull, {
        trace: true, wind: S.wind,
        boost: { t: tNow, dv: BOOST_DV }, boostStroke: BOOST_STROKE, clean: S.clean
      });
      S.boostLeft = 0;
      S.boostAt = tNow;
      S.boostFlash = performance.now();
      VOICE.boost();
    }
    return;
  }
  e.preventDefault();
  SFX.ensureAudio(); VOICE.init();     // browsers only allow this on a gesture
  const p = pointer(e);
  if (S.phase === 'pick') {
    for (const c of S.cards) {
      if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h) {
        S.plane = c.f.key; SFX.play('pop'); TRACK().gameStart();
        GD.show();                      // preroll: this is the Play button
        resetToAim();
        return;
      }
    }
    return;
  }
  if (hitSound(p)) { SFX.setOn(!SFX.isOn()); if (SFX.isOn()) SFX.play('click'); return; }
  if (hitChange(p)) { SFX.play('click'); S.phase = 'pick'; S.flight = null; VOICE.hush(); return; }
  if (S.phase === 'rest') {           // anywhere but the two pills goes again: one tap, no button to find
    if (now0() - S.restAt > 350) {
      SFX.play('click');
      if (GD.due()) GD.show();          // midroll: between launches, never during
      resetToAim();
    }
    return;
  }
  // tap 1 starts the aim sweeping, tap 2 locks it and starts the band drawing,
  // tap 3 lets go
  if (S.phase === 'aim')     { S.phase = 'setPull'; S.meterT = 0; S.pull = 0; SFX.play('click'); return; }
  if (S.phase === 'setPull') { S.phase = 'setAng';  S.meterT = 0; SFX.play('click'); return; }
  if (S.phase === 'setAng')  { VOICE.stretch(0); snapSound(S.pull); launch(); return; }
}
// Nothing is dragged any more, but the move and up listeners stay registered
// and inert: a touchstart that called preventDefault suppresses the synthetic
// mouse pair, and swallowing the rest here keeps a stray gesture from reaching
// the page underneath.
function onMove(e) { if (S.phase === 'setAng' || S.phase === 'setPull') e.preventDefault(); }
function onUp(e)   { if (S.phase === 'setAng' || S.phase === 'setPull') e.preventDefault(); }
const now0 = () => performance.now();
function resetToAim() {
  S.phase = 'aim'; S.flight = null;
  S.boostLeft = 1; S.boostAt = null; S.boostFlash = 0; S.spd = 0;
  S.alt = 0; S.screenY = 0; S.screenX = 0; S.minScreenY = null;
  S.meterT = 0; S.angle = M.CFG.ANG_MIN; S.pull = 0;   // slack, and lying level
  VOICE.hush();
  // fresh conditions every attempt, rolled and solved on the rest screen while the last result was being read
  const ready = S.next && S.next.plane === S.plane;
  S.wind = ready ? S.next.wind : rollWind();
  S.peak = ready && S.next.peak ? S.next.peak : null;
  S.next = null;
  S.grade = null; S.clean = false; S.callAt = 0; S.landAt = 0; S.miss = null; S.freezeUntil = 0; S.shake = 0;
  // the band starts drawing by itself a beat after the plane is in the sling, so a go is two taps, not three. If
  // today's best is not solved yet it is solved first, so the sweep never stutters under it.
  S.autoAt = 0;
  const want = { plane: S.plane, wind: S.wind };
  if (S.peak) S.autoAt = now0() + 300;
  else setTimeout(() => {
    if (S.plane !== want.plane || S.wind !== want.wind) return;
    if (!S.peak) S.peak = M.peak(want.plane, want.wind);
    S.autoAt = now0() + 250;
  }, 40);
  S.dist = 0; S.beatBest = false;
  S.ppmTarget = restPPM();
  S.bgZoomTarget = 1;
}
function launch() {
  if (!S.peak) S.peak = M.peak(S.plane, S.wind);
  S.quality = M.quality(S.plane, S.angle, S.pull, S.wind, S.peak);
  S.grade = gradeOf(S.quality); S.clean = S.grade === 'PERFECT';
  S.callAt = performance.now();
  S.miss = S.grade === 'PERFECT' ? null : missOf(S.peak, S.angle, S.pull, S.wind);
  const hit = HIT[S.grade || 'none'];
  S.freezeUntil = S.callAt + hit[0]; S.shake = hit[1]; S.shakeAt = S.callAt;
  VOICE.crack(S.grade);
  S.flight = M.fly(S.plane, S.angle, S.pull, { trace: true, wind: S.wind, clean: S.clean });
  S.flightStart = performance.now(); S.simT = 0;
  S.phase = 'fly';
  S.beatBest = false; S.dist = 0; S.touched = false; S.reTouched = false;
  S.bgZoomTarget = BG_ZOOM;
  S.ppmTarget = flyPPM();
}
canvas.addEventListener('mousedown', onDown);
window.addEventListener('mousemove', onMove);
window.addEventListener('mouseup', onUp);
canvas.addEventListener('touchstart', onDown, { passive: false });
window.addEventListener('touchmove', onMove, { passive: false });
window.addEventListener('touchend', onUp, { passive: false });

// ---- playback ------------------------------------------------------------
function sample(tr, t) {
  if (t <= 0) return tr[0];
  let lo = 0, hi = tr.length - 1;
  if (t >= tr[hi].t) return tr[hi];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; (tr[m].t <= t ? lo = m : hi = m); }
  const a = tr[lo], b = tr[hi], k = (t - a.t) / Math.max(1e-6, b.t - a.t);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, th: a.th + (b.th - a.th) * k };
}

// ---- clouds --------------------------------------------------------------
// The sky was a flat fill that never moved, so above the treeline the frame held
// nothing at all: no height, no speed, nothing to pass. Clouds carry both, and
// they are the only layer that can — they drift as you travel AND slide down the
// frame as you climb, so the same object reports both axes.
//
// Baked to sprites once at boot rather than drawn as live gradients. Several
// dozen radial fills a frame is real cost for a shape that never changes.
//
// No outlines anywhere, per the house rule: every edge is a gradient falling to
// transparent, and the form is read from value alone.
const CLOUD_PAR    = 0.22;   // parallax: the ridge runs 0.13, the field runs 1.0
const CLOUD_COL_M  = 115;    // world metres between cloud slots, across
const CLOUD_ROW_M  = 72;     // and up
const CLOUD_BASE_M = 45;     // none below this, so they sit clear of the treeline
const CLOUD_TOP_M  = 620;    // none above this
const cloudSprites = [];

const CLOUD_SPR_W = 360, CLOUD_SPR_H = 200, CLOUD_R_MAX = 58;
function makeCloudSprite(seed) {
  const cv = document.createElement('canvas');
  cv.width = CLOUD_SPR_W; cv.height = CLOUD_SPR_H;
  const g = cv.getContext('2d');
  let st = seed >>> 0;
  const rnd = () => (st = (st * 1103515245 + 12345) >>> 0) / 4294967296;
  const lobes = 5 + Math.floor(rnd() * 4);
  // EVERY LOBE STAYS A FULL RADIUS INSIDE THE SPRITE. The first version let
  // them run to 153 px in a 128 px canvas, so the gradient was cut off square
  // and the sprite's own bounds read as a straight edge along the bottom of
  // every cloud. A soft edge has to have somewhere to fade OUT to.
  for (let i = 0; i < lobes; i++) {
    const r  = CLOUD_R_MAX * (0.55 + 0.45 * rnd());
    const cx = r + (CLOUD_SPR_W - 2 * r) * rnd();
    const cy = r + (CLOUD_SPR_H - 2 * r) * (0.28 + 0.44 * rnd());
    const grd = g.createRadialGradient(cx, cy - r * 0.30, r * 0.10, cx, cy, r);
    grd.addColorStop(0.00, 'rgba(255,255,255,0.90)');
    grd.addColorStop(0.50, 'rgba(255,255,255,0.46)');
    grd.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  }
  return cv;
}
for (let i = 0; i < 5; i++) cloudSprites.push(makeCloudSprite(0x9e37 + i * 2654435761));

function cloudHash(a, b) {
  let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function clouds() {
  const s = S.ppm * CLOUD_PAR;                 // px per world metre in this layer
  if (!(s > 0.01) || !cloudSprites.length) return;
  const hz = sy(0);                            // the world's ground line
  const M = 260;                               // draw margin, in px
  const cx0 = Math.floor((S.camX - M / s) / CLOUD_COL_M);
  const cx1 = Math.ceil((S.camX + (W + M) / s) / CLOUD_COL_M);
  const ry0 = Math.floor((S.camY - M / s) / CLOUD_ROW_M);
  const ry1 = Math.ceil((S.camY + (groundY + M) / s) / CLOUD_ROW_M);
  ctx.save();
  for (let ci = cx0; ci <= cx1; ci++) {
    for (let ri = ry0; ri <= ry1; ri++) {
      const wy = ri * CLOUD_ROW_M;
      if (wy < CLOUD_BASE_M || wy > CLOUD_TOP_M) continue;
      const h = cloudHash(ci, ri);
      if ((h & 3) === 0) continue;             // gaps, so the field is not a grid
      const jx = ((h >>> 4) & 255) / 255 - 0.5;
      const jy = ((h >>> 12) & 255) / 255 - 0.5;
      const wx = ci * CLOUD_COL_M + jx * CLOUD_COL_M * 0.8;
      const px = (wx - S.camX) * s;
      const py = groundY - (wy + jy * CLOUD_ROW_M * 0.7 - S.camY) * s;
      const sprite = cloudSprites[(h >>> 20) % cloudSprites.length];
      const scale = (0.50 + ((h >>> 24) & 255) / 255 * 1.05) * (s * 46) / CLOUD_SPR_H;
      const dw = CLOUD_SPR_W * scale, dh = CLOUD_SPR_H * scale;
      if (px + dw < -8 || px - dw > W + 8 || py + dh < -8 || py - dh > H + 8) continue;
      // Fade out as they approach the horizon, so a landing is not flown through
      // a bank of cloud sitting on the treeline.
      const fade = Math.max(0, Math.min(1, (hz - (py + dh * 0.5)) / 120));
      if (fade <= 0.01) continue;
      ctx.globalAlpha = fade * (0.42 + ((h >>> 16) & 63) / 63 * 0.46);
      ctx.drawImage(sprite, px - dw / 2, py - dh / 2, dw, dh);
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---- scenery -------------------------------------------------------------
// One backdrop, drawn once. Its own horizon is pinned to the world's ground
// line and its foot runs off the bottom of the frame, so the grass the plane
// lands on IS the grass in the picture — no second, tiled ground layer, and so
// no repeat to notice. The strip is 6.7 times wider than it is tall, which at
// this scale is enough to carry a launch of about 900 m before it would run
// out; past that it holds at its edge rather than showing one.
function sky() {
  if (skyOK) ctx.drawImage(skyImg, 0, 0, W, H);
  else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3E9BFB'); g.addColorStop(1, '#CDE6FA');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  clouds();

  // Whichever backdrop has arrived. Same picture, same aspect, so every
  // measurement below is taken from the one being drawn and the swap is
  // invisible.
  const bg = bgOK ? bgImg : (bgLoOK ? bgLoImg : null);
  if (!bg) {
    ctx.fillStyle = '#8A9E7A'; ctx.fillRect(0, sy(0), W, H - sy(0));
    return;
  }

  const bh = H * BG_FILL * S.bgZoom;
  const bw = bh * (bg.naturalWidth / bg.naturalHeight);
  const hz = sy(0);                                  // the world's ground line
  let x = -((S.camX * S.ppm + 0.70 * W) * BG_PARALLAX);
  x = Math.max(-(bw - W), Math.min(0, x));

  const iw = bg.naturalWidth, ih = bg.naturalHeight;
  // Ridge and treeline at their own scale, above the ground line. These are
  // miles off, so they drift slowly — that part was right.
  ctx.drawImage(bg, 0, 0, iw, ih * BG_HORIZON,
                x, hz - BG_HORIZON * bh, bw, BG_HORIZON * bh);
  // THE FIELD RUNS AT FULL WORLD SPEED. It was drifting at the ridge's 0.13,
  // which meant an aeroplane covering 600 m slid over ground that had moved
  // 78 m: the camera and the scenery were plainly telling different stories,
  // and the trunk planted in that field went with it. Ground you are about to
  // land on is directly underneath, so it has no parallax at all.
  //
  // It cannot repeat inside a flight either. GRASS_SPAN_M of world is laid
  // across the strip's full width and every other copy is mirrored, giving a
  // period of twice that — further than any launch goes — so the first seam is
  // never reached, and it would be a reflection if it were. Only the sliver
  // actually on screen is drawn, so the width costs nothing.
  const grassH = Math.max((1 - BG_HORIZON) * bh, H - hz);
  if (hz < H) {
    const gw = GRASS_SPAN_M * S.ppm;                 // one copy, in screen px
    const wrapv = (v, m) => ((v % m) + m) % m;
    const base = sx(GRASS_X0);
    for (let i = Math.floor((0 - base) / gw) - 1; ; i++) {
      const gx = base + i * gw;
      if (gx >= W) break;
      const xa = Math.max(0, gx), xb = Math.min(W, gx + gw);
      if (xb <= xa) continue;
      // Which slice of the artwork lands in [xa, xb]. On a mirrored copy that
      // mapping runs backwards, so the slice comes from the far end and the
      // draw is reflected about the RIGHT EDGE OF THE VISIBLE PART. Reflecting
      // about the copy's own centre — which is what the first attempt did —
      // threw the mirrored copies to the wrong screen position entirely and
      // left bare sky below the horizon past the first 600 m.
      const flip = wrapv(i, 2) === 1;
      const sLo = flip ? 1 - (xb - gx) / gw : (xa - gx) / gw;
      const sHi = flip ? 1 - (xa - gx) / gw : (xb - gx) / gw;
      ctx.save();
      if (flip) { ctx.translate(xb, 0); ctx.scale(-1, 1); }
      ctx.drawImage(bg,
        sLo * iw, ih * BG_HORIZON, (sHi - sLo) * iw, ih * (1 - BG_HORIZON),
        flip ? 0 : xa, hz, xb - xa, grassH);
      ctx.restore();
    }
  }
}

// WHERE PERFECT WOULD HAVE LANDED, from the moment you let go: a gold flag on the strip, so a launch that falls short
// of it falls short in front of you. (A perfect release lets go clean and passes it.)
function perfectLine() {
  if (!S.peak || !(S.phase === 'fly' || S.phase === 'rest')) return;
  const x = sx(S.peak.dist);
  if (x < -80) return;
  if (x > W - 8) {
    // still ahead and off the frame: a gold pointer at the right edge, with how far there is to go
    const y = Math.min(groundY - 34, H - BAR_H - 140), left = Math.round(S.peak.dist - S.dist);   // clear of the verdict
    ctx.fillStyle = '#FFD23F';
    ctx.beginPath(); ctx.moveTo(W - 8, y); ctx.lineTo(W - 22, y - 9); ctx.lineTo(W - 22, y + 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(10,16,28,0.62)';
    ctx.font = '800 12px Inter, system-ui, sans-serif';
    const label = 'PERFECT  ' + left + ' m', tw = ctx.measureText(label).width;
    ctx.fillRect(W - 30 - tw - 14, y - 12, tw + 14, 24);
    ctx.fillStyle = '#FFD23F'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(label, W - 37, y + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    return;
  }
  ctx.strokeStyle = '#FFD23F';                          // --accent-2
  ctx.lineWidth = 3; ctx.setLineDash([10, 6]);
  ctx.beginPath(); ctx.moveTo(x, HUD_H() + 54); ctx.lineTo(x, groundY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = INK;                                  // type over the sky takes ink, as the BEST label does
  ctx.font = '800 12px Inter, system-ui, sans-serif';
  const near = x > W - 150;
  ctx.textAlign = near ? 'right' : 'left';
  ctx.fillText('PERFECT ' + Math.round(S.peak.dist) + ' m', x + (near ? -6 : 6), HUD_H() + 62);
  ctx.textAlign = 'left';
}
function bestLine() {
  perfectLine();
  if (S.best <= 0) return;
  const x = sx(S.best);
  if (x < -80 || x > W + 80) return;
  ctx.strokeStyle = ACCENT_MARK;
  ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, groundY); ctx.stroke();
  ctx.setLineDash([]);
  // W21: this label is TYPE over the sky photograph, and this file's own palette
  // note says the accent does not hold AA against sky and grass, which is why INK
  // exists and why every other label uses it. The dashed line above stays coral,
  // so the mark still reads as the personal best; only the words change.
  ctx.fillStyle = INK;
  ctx.font = '700 12px Inter, system-ui, sans-serif';
  const near = x > W - 130;
  ctx.textAlign = near ? 'right' : 'left';
  ctx.fillText('BEST ' + Math.round(S.best) + ' m', x + (near ? -6 : 6), HUD_H() + 40);
}

// ---- the catapult --------------------------------------------------------
// Drawn in two passes with the aeroplane between them, because the band lies
// OVER the fuselage: trunk first, then the plane, then the band and its pivot.
function svgScale() { return (M.CFG.PIVOT_H * S.ppm) / SVG.pivotH; }

function trunk() {
  const o = pad(), k = svgScale();
  if (o.x < -SVG.w * k - 200 || o.x > W + SVG.w * k + 200) return;
  ctx.save();
  ctx.translate(o.x - SVG.px * k, o.y - SVG.py * k);
  ctx.scale(k, k);
  ctx.fillStyle = TRUNK_FILL;
  ctx.fill(TRUNK);
  ctx.restore();
}

// The band runs from the pivot to wherever the plane is, narrow at the fork and
// broad at the far end, with the asset's own gradient: flat #FFA200 for the
// first two thirds, darkening to #B37405 at the plane.
function band(aiming, planePos) {
  const o = pad(), k = svgScale();
  if (aiming && planePos) {
    // Aimed at the aeroplane and run on past its tail, which is exactly how the
    // drawing has it: at rest that lands at 0.57 pivot heights, and drawing back
    // stretches it without any special case.
    const dx = planePos.x - o.x, dy = planePos.y - o.y;
    const len = Math.hypot(dx, dy) + PLANE_LEN_M * S.ppm * 0.5;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(Math.atan2(dy, dx));
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, '#FFA200');
    g.addColorStop(0.654, '#FFA200');
    g.addColorStop(1, '#B37405');
    ctx.fillStyle = g;
    const t0 = BAND_T0 * k, t1 = BAND_T1 * k;
    ctx.beginPath();
    ctx.moveTo(0, -t0); ctx.lineTo(len, -t1); ctx.lineTo(len, t1); ctx.lineTo(0, t0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#939393';
  ctx.beginPath(); ctx.arc(o.x, o.y, 5.5 * k, 0, 6.284); ctx.fill();
  ctx.fillStyle = '#3E3E3E';
  ctx.beginPath(); ctx.arc(o.x, o.y, 3.667 * k, 0, 6.284); ctx.fill();
}

// A cast shadow on the field, tight and dark under the wheels and broad and
// faint when the aeroplane is high. It is the only cue that says how far above
// the grass the thing actually is, which is what makes an approach read as an
// approach rather than a sprite sliding sideways.
const SHADOW_FADE = 28;         // metres of altitude over which it disappears

function shadow(worldX, worldY) {
  const alt = Math.max(0, worldY - M.CFG.GEAR_H);
  if (alt > SHADOW_FADE) return;
  const t = 1 - alt / SHADOW_FADE;             // 1 on the ground, 0 high up
  const w = PLANE_LEN_M * S.ppm;
  const rx = w * (0.30 + 0.24 * (1 - t));      // spreads as it climbs
  const ry = Math.max(1.5, rx * 0.17);
  const cx = sx(worldX), cy = sy(0);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
  g.addColorStop(0, `rgba(24,38,16,${(0.42 * t * t).toFixed(3)})`);
  g.addColorStop(0.65, `rgba(24,38,16,${(0.22 * t * t).toFixed(3)})`);
  g.addColorStop(1, 'rgba(24,38,16,0)');
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(1, ry / rx); ctx.translate(-cx, -cy);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, rx, 0, 6.284); ctx.fill();
  ctx.restore();
}

function plane(px, py, th) {
  const a = art();
  const w = PLANE_LEN_M * S.ppm;
  const h = w * (a && a.ok ? a.img.naturalHeight / a.img.naturalWidth : 0.5);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-th);
  // Always drawn about its own centre. Lifting the sprite to stand it on its
  // wheels put it right on the ground and wrong in the sling; the model carries
  // the ride height instead (GEAR_H), so one anchor now serves both.
  if (a && a.ok) ctx.drawImage(a.img, -w / 2, -h / 2, w, h);
  else {
    ctx.fillStyle = '#20405F';
    ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(-w / 2, h / 4); ctx.lineTo(-w / 3, 0); ctx.lineTo(-w / 2, -h / 4);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ---- HUD -------------------------------------------------------------------
// Laid out the way the rest of the fleet does it — see untangle and needle. A
// fixed band across the top carrying three slots, each an 11px uppercase label
// over a 24px value, side padding of 30 (18 on a phone), and every control in a
// single row along the bottom taking its size from shared/ui.js. Before this,
// the wind sat top-left, the aeroplane pill top-centre, the distance top-right
// and the angle and draw floated below the wind on a fourth line of their own,
// none of them sharing an edge or a baseline.
//
// The one departure from the house pattern is a scrim behind each band. Every
// other Zamborin game has a dark playfield, so the palette's white and muted
// greys land on it correctly; this one has a bright sky and a lit field, and
// the same greys are illegible on both. A scrim gives the band the ground the
// palette assumes, which keeps the colours the shared ones rather than a set
// invented for this game.
// Desktop sets label and value on ONE line, so the band only needs 46px; a
// phone has no room for that and keeps the stacked form.
const HUD_H = () => (wide ? 46 : 78);
const SIDE_PAD = () => (wide ? 30 : 18);
const BAR_H = 74;                      // the control row along the foot

// Airspeed is shown because the rule the boost turns on is "energy
// added slowly is worth more than energy added fast", and without a number for
// speed that rule is invisible — the player would be guessing at a hidden state
// rather than reading a shown one.
function drawBoostHud() {
  const cx = W / 2, boxW = 168, boxH = S.boostLeft > 0 ? 54 : 40, y0 = H - boxH - 16;
  // A backing, because this sits over sky, cliffs or grass depending on where
  // the aeroplane is, and amber-on-grass was unreadable at exactly the moment
  // the player needs to read it.
  ctx.save();
  ctx.fillStyle = 'rgba(10,16,28,0.62)';
  ctx.beginPath();
  const rr = 10, x0 = cx - boxW / 2;
  ctx.moveTo(x0 + rr, y0);
  ctx.arcTo(x0 + boxW, y0, x0 + boxW, y0 + boxH, rr);
  ctx.arcTo(x0 + boxW, y0 + boxH, x0, y0 + boxH, rr);
  ctx.arcTo(x0, y0 + boxH, x0, y0, rr);
  ctx.arcTo(x0, y0, x0 + boxW, y0, rr);
  ctx.closePath(); ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  // Airspeed IS the mechanic made visible: energy added slowly buys far more
  // than energy added fast, so without a number for speed the player is
  // guessing at a hidden state instead of reading a shown one.
  ctx.font = '700 17px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(Math.round(S.spd || 0) + ' m/s', cx, y0 + 18);

  if (S.boostLeft > 0) {
    const pulse = 0.68 + 0.32 * Math.sin(performance.now() / 240);
    ctx.font = '800 13px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,201,84,' + pulse.toFixed(3) + ')';
    ctx.fillText('TAP TO BOOST', cx, y0 + 39);
  } else if (S.boostFlash && performance.now() - S.boostFlash < 1200) {
    const k = 1 - (performance.now() - S.boostFlash) / 1200;
    ctx.font = '800 15px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,176,54,' + k.toFixed(3) + ')';
    ctx.fillText('BOOST', cx, y0 + 31);
  } else if (S.boostAt != null) {
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.fillText('boosted at ' + S.boostAt.toFixed(1) + 's', cx, y0 + 31);
  }
  ctx.restore();
}


// THE CALLS: how the release went, as it leaves the sling, and how the landing went, from touchdown to the end. Same
// backing and type as the boost read-out. They sit just under the top band, where nothing else lives in flight.
function callPill(text, sub, col, y, alpha) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '800 16px Inter, system-ui, sans-serif';
  const tw = ctx.measureText(text).width;
  ctx.font = '600 12px Inter, system-ui, sans-serif';
  const sw = sub ? ctx.measureText(sub).width + 14 : 0;
  const w = tw + sw + 32, h = 34, x0 = (W - w) / 2, rr = h / 2;
  ctx.fillStyle = 'rgba(10,16,28,0.62)';
  ctx.beginPath();
  ctx.moveTo(x0 + rr, y); ctx.arcTo(x0 + w, y, x0 + w, y + h, rr); ctx.arcTo(x0 + w, y + h, x0, y + h, rr);
  ctx.arcTo(x0, y + h, x0, y, rr); ctx.arcTo(x0, y, x0 + w, y, rr); ctx.closePath(); ctx.fill();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = '800 16px Inter, system-ui, sans-serif'; ctx.fillStyle = col;
  ctx.fillText(text, x0 + 16, y + h / 2 + 1);
  if (sub) {
    ctx.font = '600 12px Inter, system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.70)';
    ctx.fillText(sub, x0 + 16 + tw + 14, y + h / 2 + 1);
  }
  ctx.restore();
}
function drawCalls() {
  const now = performance.now(), y = HUD_H() + 12;
  const col = (g) => g === 'PERFECT' ? '#FFD23F' : g === 'GREAT' ? '#FFFFFF' : 'rgba(255,255,255,0.75)';   // --accent-2
  const f = S.flight;
  if (S.phase === 'rest' && f) {
    // the verdict, held: how it left and how it came down
    const parts = [];
    if (S.grade) parts.push(S.grade + ' RELEASE');
    parts.push(landingOf(f));
    // above the button bar, clear of the BEST marker's label at the top of the field
    callPill(parts.join('  \u00b7  '), f.slide >= 1 ? 'slid ' + Math.round(f.slide) + ' m' : '',
             S.grade === 'PERFECT' ? col('PERFECT') : '#FFFFFF', H - BAR_H - 50, 1);
    // and the regret, said plainly: what it cost, and which tap
    if (S.miss && S.peak) {
      const short = Math.round(S.peak.dist - f.dist);
      if (short > 0) callPill(short + ' m SHORT OF PERFECT', S.miss, 'rgba(255,255,255,0.80)', H - BAR_H - 92, 1);
    }
    return;
  }
  if (S.phase !== 'fly' || !f) return;
  if (S.touched) {
    const k = Math.min(1, (now - S.landAt) / 250);
    const slid = Math.max(0, S.dist - f.touchX);
    callPill(landingOf(f), slid >= 1 ? Math.round(slid) + ' m' : '',
             f.touchGam > DUG_AT ? 'rgba(255,255,255,0.75)' : '#FFFFFF', y, k);
  } else if (S.grade) {
    const age = now - S.callAt, k = age < 1600 ? 1 : Math.max(0, 1 - (age - 1600) / 500);
    callPill(S.grade + ' RELEASE', S.clean ? 'clean, more speed' : S.miss || '', col(S.grade), y, k);
  } else if (S.miss) {
    const age = now - S.callAt, k = age < 1600 ? 1 : Math.max(0, 1 - (age - 1600) / 500);
    callPill('MISSED IT', S.miss, 'rgba(255,255,255,0.75)', y, k);
  }
}

// Speaker drawn as paths. House rule: flat vector glyphs, never an emoji.
// T3: the OFF state was white at 0.34, which measured 3.10 over the bar where the
// grass is behind it but 2.90 over mid sky and 2.70 over bright sky, and the bar
// is only 82% opaque so the photograph decides. 0.45 measures 4.43 / 3.96 / 3.57
// across those three and is still half the lit state's 0.92, so off still reads
// as off.
function speakerGlyph(cx, cy, on) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = on ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.moveTo(-7, -3); ctx.lineTo(-3, -3); ctx.lineTo(1, -7);
  ctx.lineTo(1, 7); ctx.lineTo(-3, 3); ctx.lineTo(-7, 3);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = on ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  if (on) {
    ctx.beginPath(); ctx.arc(2, 0, 4.5, -0.9, 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(2, 0, 7.5, -0.9, 0.9); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(9, 4);
    ctx.moveTo(9, -4); ctx.lineTo(4, 4); ctx.stroke();
  }
  ctx.restore();
}

function hudSlot(x, align, label, value, sub, valueCol, subCol) {
  ctx.textBaseline = 'alphabetic';
  if (wide) {
    // one line: LABEL  value  sub
    const lw = (t, f) => { ctx.font = f; return ctx.measureText(t).width; };
    const fL = '700 11px Inter, system-ui, sans-serif';
    const fV = '800 20px Inter, system-ui, sans-serif';
    const fS = '700 11px Inter, system-ui, sans-serif';
    const wL = lw(label, fL), wV = lw(value, fV), wS = sub ? lw(sub, fS) : 0;
    const total = wL + 10 + wV + (sub ? 10 + wS : 0);
    let cx = align === 'left' ? x : align === 'right' ? x - total : x - total / 2;
    ctx.textAlign = 'left';
    ctx.font = fL; ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(label, cx, 30); cx += wL + 10;
    ctx.font = fV; ctx.fillStyle = valueCol || '#FFFFFF';
    ctx.fillText(value, cx, 30); cx += wV + 10;
    if (sub) {
      ctx.font = fS; ctx.fillStyle = subCol || 'rgba(255,255,255,0.55)';
      ctx.fillText(sub, cx, 30);
    }
    return;
  }
  ctx.textAlign = align;
  ctx.font = '700 11px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(label, x, 22);
  ctx.font = '800 24px Inter, system-ui, sans-serif';
  ctx.fillStyle = valueCol || '#FFFFFF';
  ctx.fillText(value, x, 48);
  if (sub) {
    ctx.font = '700 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = subCol || 'rgba(255,255,255,0.55)';
    ctx.fillText(sub, x, 64);
  }
}

// The wind's needle, drawn small enough to sit inside the band beside its figure.
function windNeedle(cx, cy, r) {
  const aw = Math.abs(S.wind), head = S.wind < 0;
  const col = aw < 0.6 ? 'rgba(255,255,255,0.55)' : (head ? ACCENT_MARK : '#5DD39E');
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.stroke();
  if (aw >= 0.6) {
    const frac = Math.min(1, aw / Math.abs(WIND_MIN)), len = r * 0.78, dir = head ? -1 : 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6 + 1.8 * frac;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - dir * len, cy); ctx.lineTo(cx + dir * len, cy); ctx.stroke();
    const hb = 4.5 + 2 * frac;
    ctx.beginPath();
    ctx.moveTo(cx + dir * len, cy);
    ctx.lineTo(cx + dir * (len - hb * 1.4), cy - hb);
    ctx.moveTo(cx + dir * len, cy);
    ctx.lineTo(cx + dir * (len - hb * 1.4), cy + hb);
    ctx.stroke();
  }
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(cx, cy, 3.4, 0, 6.283); ctx.fill();
  return col;
}

function hud() {
  const PX = SIDE_PAD(), band = HUD_H();

  // --- top band -------------------------------------------------------------
  // A band with an edge, not a fade. The feathered version smeared into the sky
  // and never read as a piece of chrome; a hard rule at the bottom does, and it
  // also gives the aeroplane a line to stay below.
  ctx.fillStyle = 'rgba(14,23,38,0.82)';
  ctx.fillRect(0, 0, W, band);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(0, band - 1, W, 1);

  const aw = Math.abs(S.wind);
  const wcol = windNeedle(PX + 13, wide ? 23 : 40, wide ? 11 : 14);
  hudSlot(PX + (wide ? 32 : 38), 'left', 'WIND',
          aw < 0.6 ? 'Still' : aw.toFixed(1),
          aw < 0.6 ? '' : (S.wind < 0 ? 'M/S HEADWIND' : 'M/S TAILWIND'),
          wcol, 'rgba(255,255,255,0.55)');

  hudSlot(W / 2, 'center', 'AIRCRAFT', S.plane.toUpperCase(), '', '#FFFFFF');

  hudSlot(W - PX, 'right', 'DISTANCE', Math.round(S.dist) + ' m',
          S.best > 0 ? 'BEST ' + Math.round(S.best) + ' m' : '',
          S.beatBest ? '#FFD23F' : '#FFFFFF',            // --accent-2 on a record
          S.beatBest ? '#FFD23F' : 'rgba(255,255,255,0.55)');

  // --- what you are doing right now, next to the aeroplane -----------------
  // Angle and draw are live feedback, not standing statistics, so they belong
  // where the hand is rather than in the band with the things that persist.
  // NEITHER THE ANGLE NOR THE DRAW IS SHOWN, DELIBERATELY, and for the same
  // reason there is no trajectory preview: a number or a meter on screen is a
  // thing to memorise, and once you know the day's best aim reads 64 degrees at
  // three quarters of a bar you stop judging and start dialling. The band's own
  // stretch and the aeroplane's attitude say both of them, which you read rather
  // than copy. The draw carried a bar until 2026-08-20 on the argument that it
  // was a strength being held rather than an answer; it is both, and the band
  // was already saying it.

  // --- control row along the foot ------------------------------------------
  // Nothing to press while it is in the air, so nothing is drawn: the bar and
  // its buttons leave entirely and the flight has the frame to itself.
  drawCalls();
  if (S.phase === 'fly') { S.btn = null; S.chg = null; S.snd = null;
    drawBoostHud();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; return; }

  const rowY = H - BAR_H / 2;
  ctx.fillStyle = 'rgba(14,23,38,0.82)';
  ctx.fillRect(0, H - BAR_H, W, BAR_H);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(0, H - BAR_H, W, 1);

  if (S.phase === 'rest') {
    // Measure both, then centre the pair, so the row is balanced rather than
    // the CTA centred with a pill hung off it.
    const wSnd = ZAM.PILL.iconW;
    const wPill = ZAM.pillWidth(ctx, 'CHANGE');
    const wCta = ZAM.ctaWidth(ctx, 'TRY AGAIN');
    const total = wSnd + ZAM.PILL.gap + wPill + ZAM.PILL.gap + wCta;
    let x = (W - total) / 2;
    S.snd = ZAM.drawPill(ctx, '', x + wSnd / 2, rowY, { w: wSnd });
    speakerGlyph(x + wSnd / 2, rowY, SFX.isOn());
    x += wSnd + ZAM.PILL.gap;
    S.chg = ZAM.drawPill(ctx, 'CHANGE', x + wPill / 2, rowY);
    x += wPill + ZAM.PILL.gap;
    S.btn = ZAM.drawCTA(ctx, 'TRY AGAIN', x + wCta / 2, rowY, ACCENT);
  } else {
    S.btn = null;
    const wSnd = ZAM.PILL.iconW;
    const wPill = ZAM.pillWidth(ctx, 'CHANGE AIRCRAFT');
    let x = (W - (wSnd + ZAM.PILL.gap + wPill)) / 2;
    S.snd = ZAM.drawPill(ctx, '', x + wSnd / 2, rowY, { w: wSnd });
    speakerGlyph(x + wSnd / 2, rowY, SFX.isOn());
    x += wSnd + ZAM.PILL.gap;
    S.chg = ZAM.drawPill(ctx, 'CHANGE AIRCRAFT', x + wPill / 2, rowY);
    if (S.phase === 'aim' || S.phase === 'setAng' || S.phase === 'setPull') {
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      // sits on lit grass, not on the bar, so it takes dark ink and a light
      // backing rather than the band's white
      ctx.font = '600 14px Inter, system-ui, sans-serif';
      const msg = S.phase === 'aim'     ? 'get ready'
                : S.phase === 'setPull' ? 'tap to set the force'
                :                         'tap to launch';
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillText(msg, W / 2, H - BAR_H - 13);
      ctx.fillStyle = INK;
      ctx.fillText(msg, W / 2, H - BAR_H - 14);
    }
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

// ---- the pick screen -------------------------------------------------------
// Six cards, art and four bars each. The bars are the aeroplane's real stats
// straight out of the model, not decoration: WEIGHT sets how fast it leaves the
// arm from a given draw, LIFT its glide, DRAG what that glide costs, and
// STRENGTH how far the catapult can be wound before the airframe suffers for it.
function pickLayout() {
  const cols = W >= 640 ? 3 : 2, rows = Math.ceil(FLEET.length / cols);
  const padX = W >= 640 ? 24 : 12, top = W >= 640 ? 92 : 104, gap = W >= 640 ? 16 : 10;
  const cw = (W - padX * 2 - gap * (cols - 1)) / cols;
  const ch = Math.min((H - top - 28 - gap * (rows - 1)) / rows, W >= 640 ? 236 : 210);
  return FLEET.map((f, i) => ({
    f, x: padX + (i % cols) * (cw + gap), y: top + Math.floor(i / cols) * (ch + gap),
    w: cw, h: ch,
  }));
}

function statBar(x, y, w, label, v, warm) {
  ctx.textAlign = 'left';
  ctx.font = '700 10px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(label, x, y);
  const bw = w, by = y + 4;
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  ctx.fillRect(x, by, bw, 5);
  ctx.fillStyle = warm ? ACCENT_MARK : '#B0E0E6';        // --brand for the good stats
  ctx.fillRect(x, by, Math.max(2, bw * v), 5);
}

function drawPick() {
  ctx.fillStyle = '#0E1726';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 26px Inter, system-ui, sans-serif';
  ctx.fillText('Choose your aircraft', W / 2, 46);
  ctx.font = '500 13px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.60)';
  const sub = W >= 640
    ? 'Every one of them will fly about as far. They do not fly the same way.'
    : 'All fly about as far — none the same way.';
  ctx.fillText(sub, W / 2, 68);

  S.cards = pickLayout();
  for (const c of S.cards) {
    const t = M.PLANES[c.f.key], a = ART[c.f.key];
    const sel = c.f.key === S.plane;
    ctx.fillStyle = sel ? '#1A2A45' : '#131F36';
    ZAM.roundRectPath(ctx, c.x, c.y, c.w, c.h, 12); ctx.fill();
    ctx.strokeStyle = sel ? ACCENT_MARK : 'rgba(255,255,255,0.10)';
    ctx.lineWidth = sel ? 2 : 1;
    ZAM.roundRectPath(ctx, c.x, c.y, c.w, c.h, 12); ctx.stroke();

    // art, fitted into the top of the card
    const box = { w: c.w - 24, h: c.h * 0.34 };
    if (a && a.ok) {
      const r = Math.min(box.w / a.img.naturalWidth, box.h / a.img.naturalHeight);
      const dw = a.img.naturalWidth * r, dh = a.img.naturalHeight * r;
      ctx.drawImage(a.img, c.x + (c.w - dw) / 2, c.y + 12 + (box.h - dh) / 2, dw, dh);
    } else {
      // Sprite still on the wire. An empty top third of the card reads as a
      // broken card; a slow pulse reads as one that is still arriving.
      const pulse = 0.05 + 0.035 * (0.5 + 0.5 * Math.sin(performance.now() / 480));
      ctx.fillStyle = `rgba(255,255,255,${pulse.toFixed(3)})`;
      ZAM.roundRectPath(ctx, c.x + 12, c.y + 12, box.w, box.h, 8);
      ctx.fill();
    }

    let yy = c.y + 16 + box.h;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 17px Inter, system-ui, sans-serif';
    ctx.fillText(c.f.key, c.x + 12, yy + 6);
    const rec = S.bests[c.f.key];
    if (rec) {
      ctx.textAlign = 'right';
      ctx.font = '600 12px Inter, system-ui, sans-serif';
      // 0.45 measured 4.37:1 on the card, under the 4.5:1 AA bar for text this
      // size. 0.55 is what the stat labels beside it already use, and measures
      // 5.83:1 on the same background.
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(Math.round(rec) + ' m', c.x + c.w - 12, yy + 6);
      ctx.textAlign = 'left';
    }
    yy += 20;

    // the four bars, two to a row
    const colW = (c.w - 24 - 10) / 2;
    STATS.forEach(([label, get], i) => {
      const bx = c.x + 12 + (i % 2) * (colW + 10);
      const by = yy + Math.floor(i / 2) * 22;
      statBar(bx, by, colW, label, get(t), label === 'DRAG');
    });
    yy += 46;

    ctx.font = '500 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.52)';
    wrapText(c.f.blurb, c.x + 12, yy + 2, c.w - 24, 13);
  }
}

function wrapText(text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '', yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; }
    else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

// ---- loop ----------------------------------------------------------------
// Frame-rate independent smoothing. The flight itself is advanced from the
// wall clock, so a per-frame lerp desynchronises from it the moment the frame
// rate drops — throttled in a background tab the camera fell 300 m behind the
// aeroplane and the screen showed empty sky. Converting the per-frame rate into
// a per-second one keeps the two together on any display.
let lastT = 0;
const ease = (k, dt) => 1 - Math.pow(1 - k, dt * 60);

// After the launch the aeroplane is pinned to the middle of the frame and the
// world moves around it, rather than being led from a third of the way in. The
// vertical half of that matters as much as the horizontal: it lets the ground
// fall away on the climb and rise to meet the aircraft on the approach, which
// is where the sense of gliding down comes from.
// Centred left-to-right, and the ground held still. Centring the aeroplane
// VERTICALLY as well moved the ground line to the middle of the frame, so a
// landing came to rest a long way from where the foot of the catapult had been
// standing a moment earlier — and ground level cannot move. The camera only
// lifts when the aeroplane would otherwise climb out of the top of the frame.
function chase(wx, wy, k, dt) {
  const a = ease(k, dt);
  S.camX += ((wx - (W * 0.5) / S.ppm) - S.camX) * a;
  // THE AEROPLANE SITS IN THE MIDDLE OF THE FRAME WHILE IT IS UP THERE. Pinning
  // it just under the read-out band was the first fix for a boosted climb
  // outrunning the camera; it kept the aeroplane on screen and parked it on the
  // top edge for the whole flight, which is not a shot, it is a near miss.
  // The band's lower edge and the frame's foot give the two hard limits, and
  // the shot aims at the midpoint between them.
  const half = PLANE_LEN_M * S.ppm * 0.34;
  const yTop = HUD_H() + half + 14;          // clear of the read-outs
  const yBot = H - half - 14;                // clear of the foot
  const yMid = (yTop + yBot) / 2;
  // The camera height that puts the aeroplane on screen row y is
  // wy - (groundY - y) / ppm. Floored at zero, so while it is on or near the
  // ground the shot stays anchored to the ground line and take-off and landing
  // look exactly as they always did — the centring only takes over once the
  // aeroplane is high enough to have left that anchor behind.
  const want = Math.max(0, wy - (groundY - yMid) / S.ppm);
  S.camY += (want - S.camY) * a;
  // Whatever the easing is doing, it may not let the aeroplane leave the frame.
  // A boost adds vertical speed faster than the ease can follow, so these are
  // the backstops: worst case it rides a limit for a moment and settles back to
  // the middle, rather than flying off the top.
  const loCam = Math.max(0, wy - (groundY - yTop) / S.ppm);
  const hiCam = wy - (groundY - yBot) / S.ppm;
  if (S.camY < loCam) S.camY = loCam;
  if (hiCam > loCam && S.camY > hiCam) S.camY = hiCam;
}

// THE PLANE STAYS PUT; THE WORLD MOVES (owner, 2026-10-30): "the plane always needs to stay in the center of the
// screen and everything else moves. The position of the plane and the position/angle of the camera in relation to
// the plane should always stay constant." So one zoom, the plane a quarter of the frame's width, held at the middle
// of the play area in every phase, with no easing to lag it. The horizon stays level (the owner's choice); the
// aeroplane pitches about its own centre. The zooms and chases above are kept for the painted 2D fallback's history
// but nothing calls them now.
const LOCK_PLANE_FRAC = 0.25;
const lockPPM = () => (LOCK_PLANE_FRAC * scaleRefW()) / PLANE_LEN_M;
function lockOn(wx, wy) {
  S.ppm = S.ppmTarget = lockPPM();
  const yMid = (HUD_H() + (H - BAR_H)) / 2;
  S.camX = wx - (W * 0.5) / S.ppm;
  S.camY = wy - (groundY - yMid) / S.ppm;
}

function follow(wx, wy, k, leadFrac, dt) {
  // aiming needs room to the LEFT of the post for the drawn-back plane; flying
  // needs room to the right for where it is going
  const lead = (W * (leadFrac || 0.34)) / S.ppm;
  const head = (H * 0.62) / S.ppm;
  const a = ease(k, dt);
  S.camX += ((wx - lead) - S.camX) * a;
  S.camY += (Math.max(0, wy - head) - S.camY) * a;
}

function frame(now) {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const dt = Math.min(0.25, lastT ? (now - lastT) / 1000 : 1 / 60);
  lastT = now;
  S.ppm += (S.ppmTarget - S.ppm) * ease(0.09, dt);
  S.bgZoom += (S.bgZoomTarget - S.bgZoom) * ease(0.09, dt);

  // Above the pick-screen early return: the bed plays on that screen too, and
  // it is where a player spends the seconds before their first launch.
  VOICE.bed(S.phase === 'fly');

  if (S.phase === 'pick') { drawPick(); requestAnimationFrame(frame); return; }
  if (S.phase === 'aim' && S.autoAt && now >= S.autoAt) { S.phase = 'setPull'; S.meterT = 0; S.pull = 0; S.autoAt = 0; }

  let pp = null, pth = 0, pw = null;   // screen pos, pitch, world pos
  if (S.phase === 'fly') {
    const tr = S.flight.trace;
    if (now >= S.freezeUntil) S.simT += dt * playRate(S.flight, S.simT);
    const t = S.simT;
    const q = sample(tr, t);
    S.dist = q.x; pth = q.th;
    // airspeed straight off the trace, so the rush tracks what is actually
    // happening rather than an approximation of it
    const q2 = sample(tr, t + 0.06);
    const spd = Math.hypot(q2.x - q.x, q2.y - q.y) / 0.06;
    VOICE.flight(spd, q.y, q.y <= M.build(S.plane).gearH + 0.4);
    S.spd = spd; S.alt = q.y;
    if (!S.touched && q.y <= M.build(S.plane).gearH + 0.4) {
      S.touched = true; S.landAt = now;
      if (S.flight.touchGam > DUG_AT) VOICE.dig(spd); else touchSound(spd);
    }
    // a skip comes back down: the second, softer kiss
    if (S.touched && !S.reTouched && S.flight.skipped && now - S.landAt > 250 && q.y <= M.build(S.plane).gearH + 0.05) {
      S.reTouched = true; touchSound(spd * 0.6);
    }
    lockOn(q.x, q.y);
    if (!S.beatBest && S.best > 0 && q.x > S.best) S.beatBest = true;
    if (t >= tr[tr.length - 1].t) {
      S.dist = S.flight.dist;
      if (S.dist > S.best) { S.best = S.dist; S.beatBest = true; }
      S.phase = 'rest'; S.restAt = now;
      VOICE.hush();
      // the next go's wind, and its best launch, solved now while this result is on screen
      const nx = { plane: S.plane, wind: rollWind(), peak: null }; S.next = nx;
      setTimeout(() => { if (S.next === nx) nx.peak = M.peak(nx.plane, nx.wind); }, 450);
      VOICE.chime(S.beatBest);
    }
    pp = { x: sx(q.x), y: sy(q.y) }; pw = q;
    // measured HERE, after chase() has moved the camera, because this is the
    // position the renderer actually uses. Reading it before chase() measures
    // last frame's camera and reports a plane that left a frame it never left.
    S.screenY = pp.y; S.screenX = pp.x;
    if (S.minScreenY == null || pp.y < S.minScreenY) S.minScreenY = pp.y;
  } else if (S.phase === 'rest' && S.flight) {
    const e = S.flight.trace[S.flight.trace.length - 1];
    // The closing move, and the only place it happens. The flight ends around
    // 0.62 of the rest shot on height alone; stopping is what asks the camera to
    // come the rest of the way in, so it reads as settling on the result rather
    // than as a dolly fighting an aeroplane that is still moving.
    lockOn(e.x, e.y);
    pp = { x: sx(e.x), y: sy(e.y) }; pth = e.th; pw = e;
  } else {
    // The catapult IS the meter. The aeroplane's own attitude shows the aim
    // running up and down its range, and the band's own stretch shows the draw
    // filling — the same two things you already read off the artwork, now
    // moving on their own schedule. No bar is drawn for either, for the reason
    // the angle read-out was dropped: a meter with a mark on it is a mark to
    // memorise, and you would dial it rather than judge it.
    if (S.phase === 'setPull') {
      // The band stretches and the aeroplane rides out along it, because it is
      // held IN the sling — the draw is a thing you watch happen, not a bar.
      S.meterT += dt;
      S.pull = tri(S.meterT, PULL_SWEEP);
      VOICE.stretch(S.pull);
    } else if (S.phase === 'setAng') {
      // Then band and aeroplane swing about the screw TOGETHER, as one rigid
      // piece. Nothing slides along anything; the whole assembly rotates.
      S.meterT += dt;
      S.angle = M.CFG.ANG_MIN + (M.CFG.ANG_MAX - M.CFG.ANG_MIN) * tri(S.meterT, ANG_SWEEP);
      VOICE.stretch(S.pull, true);      // loaded and locked, no longer drawing
    }
    // ONE RIGID ASSEMBLY, HUNG OFF THE SCREW: the band runs from the screw out to the aeroplane and the aeroplane
    // lies along it, nose back up the band. Draw changes the length; aim swings the whole thing about the screw.
    // Worked in world metres now that the camera rides the aeroplane: the plane is placed, then the camera.
    // NEVER INTO THE GROUND (owner, 2026-10-30: "when the plane is on the sling and user is choosing the angle, the
    // plane tends to go into the ground"). A steep aim swings it down toward the field, so the draw is shortened
    // until the plane's LOWEST point, tail or wheels at that angle, clears the grass; before, only its middle did.
    const a = S.angle * Math.PI / 180, ox = TREE_X, oy = M.CFG.PIVOT_H;
    const ar = art(), aspect = ar && ar.ok ? ar.img.naturalWidth / ar.img.naturalHeight : 2;
    let r = PLANE_LEN_M * 0.30 + Math.max(0, Math.min(1, S.pull)) * maxDrag() / lockPPM();
    const below = (PLANE_LEN_M / 2) * Math.sin(a) + (PLANE_LEN_M / aspect / 2) * Math.cos(a) + 0.35;
    if (Math.sin(a) > 0.001) r = Math.min(r, Math.max(0, (oy - below) / Math.sin(a)));
    const wx = ox - Math.cos(a) * r, wy = oy - Math.sin(a) * r;
    lockOn(wx, wy);
    pp = { x: sx(wx), y: sy(wy) };
    pth = a;
  }

  const aiming = S.phase === 'aim' || S.phase === 'setAng' || S.phase === 'setPull';
  // THE WORLD IN 3D (world3d.js), once it is ready: it draws sky, valley, slingshot and aeroplane under this canvas
  // from this camera, so this canvas only carries the marks and read-outs. The aeroplane's place is handed over in
  // world metres, worked back from the screen point every phase above already computes.
  const w3 = window.TAILWIND_3D;
  if (w3 && w3.ready) {
    ctx.clearRect(0, 0, W, H);
    // the jolt of the hit: the camera, not the chrome, and gone in a third of a second
    const sk = S.shake ? S.shake * Math.max(0, 1 - (now - S.shakeAt) / 320) : 0;
    const jx = sk ? sk * Math.sin(now * 0.11) : 0, jy = sk ? sk * Math.cos(now * 0.083) : 0;
    w3.render({ W, H, scale: SCALE, camX: S.camX + jx, camY: S.camY + jy, ppm: S.ppm, groundY, key: S.plane,
      pose: pp ? { x: S.camX + pp.x / S.ppm, y: S.camY + (groundY - pp.y) / S.ppm, th: pth } : null,
      aiming, flying: S.phase === 'fly', pivot: { x: TREE_X, y: M.CFG.PIVOT_H } });
    bestLine(); hud();
    requestAnimationFrame(frame);
    return;
  }
  sky(); bestLine();
  if (pw) shadow(pw.x, pw.y);
  // Always behind the trunk, which is what sells the trunk as standing in the
  // field rather than being painted on the sky. A steep aim swings the
  // aeroplane across it and it is partly hidden while you choose; the user
  // called that fine on 2026-08-20, so the earlier in-front-while-aiming
  // exception is gone. The band stays over the top, as in the reference.
  if (pp) plane(pp.x, pp.y, pth);
  trunk();
  band(aiming, pp);
  hud();
  requestAnimationFrame(frame);
}

TRACK().init('tailwind');
fit();
S.ppm = S.ppmTarget = restPPM();
S.camX = -(W * 0.34) / S.ppm;
// Debug handle, as every game on the site carries one.
window.__tailwind = {
  get state() {
    return { phase: S.phase, dist: S.dist, best: S.best, spd: S.spd, alt: S.alt,
             boostLeft: S.boostLeft, boostAt: S.boostAt,
             screenX: S.screenX, screenY: S.screenY, minScreenY: S.minScreenY,
             camY: S.camY, ppm: S.ppm, W, H, plane: S.plane, wind: S.wind,
             grade: S.grade, quality: S.quality, peak: S.peak, miss: S.miss, simT: S.simT,
             landing: S.flight ? { gam: S.flight.touchGam, skipped: S.flight.skipped, slide: S.flight.slide } : null };
  },
  get cfg() { return { dv: BOOST_DV, stroke: BOOST_STROKE }; },
  // does the aeroplane stay inside the frame for the WHOLE flight?
  framing() {
    if (!S.flight || !S.flight.trace) return { ok: null, why: 'no flight' };
    return { minScreenY: S.minScreenY, H,
             leftTop: S.minScreenY != null && S.minScreenY < 0,
             clearance: S.minScreenY == null ? null : Math.round(S.minScreenY) };
  }
};

requestAnimationFrame(frame);
})();
