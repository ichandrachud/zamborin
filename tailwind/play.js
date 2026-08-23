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
// is the launch that gets it there (best draw runs 0.51 to 0.80). Flying one on
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
function rollWind() {
  const t = Math.random();
  return Math.round((WIND_MIN + (WIND_MAX - WIND_MIN) * t) * 2) / 2;
}

const STATS = [
  ['WEIGHT',   (t) => t.weight],
  ['LIFT',     (t) => t.lift],
  ['DRAG',     (t) => t.drag],
  ['STRENGTH', (t) => t.tough],
];
const ZAM = window.ZAM_UI;          // shared button system, shared/ui.js
const SFX = window.ZSFX.create({ storageKey: 'zamborin.tailwind.sound' });

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
  stretchOsc: null, stretchGain: null,

  init() {
    if (this.ready) return;
    const ctx = SFX.ensureAudio();
    if (!ctx) return;
    this.ctx = ctx;

    // a long noise buffer, looped — the air
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 700; filt.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(filt); filt.connect(g); g.connect(ctx.destination);
    src.start(0);
    this.rushFilter = filt; this.rushGain = g;

    // the airframe's own low note
    const osc = ctx.createOscillator();
    osc.type = 'triangle'; osc.frequency.value = 90;
    const og = ctx.createGain(); og.gain.value = 0;
    osc.connect(og); og.connect(ctx.destination); osc.start(0);
    this.bodyOsc = osc; this.bodyGain = og;

    // the band, creaking upward as it is drawn
    const so = ctx.createOscillator();
    so.type = 'sawtooth'; so.frequency.value = 60;
    const sg = ctx.createGain(); sg.gain.value = 0;
    const sf = ctx.createBiquadFilter();
    sf.type = 'lowpass'; sf.frequency.value = 900;
    so.connect(sf); sf.connect(sg); sg.connect(ctx.destination); so.start(0);
    this.stretchOsc = so; this.stretchGain = sg;

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

  flight(speed, alt) {
    if (!this.ready) return;
    const on = SFX.isOn();
    const s = Math.max(0, Math.min(1, speed / 60));
    this.set(this.rushGain.gain, on ? 0.020 + 0.085 * s * s : 0, 0.10);
    this.set(this.rushFilter.frequency, 420 + 1100 * s, 0.10);
    this.set(this.bodyGain.gain, on ? 0.014 * s : 0, 0.10);
    this.set(this.bodyOsc.frequency, 62 + 70 * s, 0.10);
  },
  stretch(pull) {
    if (!this.ready) return;
    const on = SFX.isOn() && pull > 0.02;
    this.set(this.stretchGain.gain, on ? 0.006 + 0.020 * pull : 0, 0.05);
    this.set(this.stretchOsc.frequency, 55 + 145 * pull, 0.05);
  },
  hush() {
    if (!this.ready) return;
    this.set(this.rushGain.gain, 0, 0.25);
    this.set(this.bodyGain.gain, 0, 0.25);
    this.set(this.stretchGain.gain, 0, 0.08);
  },
};

// The snap: the band letting go, then the airframe leaving the arm. Two events
// a few milliseconds apart, because a single burst reads as a click, not a snap.
function snapSound(pull) {
  if (!SFX.isOn()) return;
  SFX.noise(0.055, 1500 + 900 * pull, 1.1, 0.16 + 0.10 * pull);
  SFX.tone(190 - 50 * pull, 0.11, 0.10, 'square');
  setTimeout(() => SFX.noise(0.20, 520, 0.8, 0.07 + 0.05 * pull), 35);
}
// Touchdown: one thump for the undercarriage, then grass under the wheels.
function touchSound(speed) {
  if (!SFX.isOn()) return;
  const s = Math.max(0, Math.min(1, speed / 40));
  SFX.tone(105, 0.16, 0.09 + 0.05 * s, 'sine');
  SFX.noise(0.34, 300, 0.6, 0.05 + 0.06 * s);
}
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
function loadBackdrop() {
  if (backdropAsked) return;
  backdropAsked = true;
  bgImg.src = './assets/background.webp';
}
setTimeout(loadBackdrop, 4000);

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

function restPPM() { return (REST_PLANE_FRAC * W) / PLANE_LEN_M; }

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
function zoomForAlt(alt) {
  const t = Math.max(0, Math.min(1, alt / ZOOM_ALT));
  return LAND_ZOOM + (FLY_ZOOM - LAND_ZOOM) * t;
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
  const vp = viewport();
  W = wide ? FRAME_W : vp.w;
  H = wide ? FRAME_H : vp.h;
  document.body.style.setProperty('--canvas-w', W + 'px');
  document.body.style.setProperty('--canvas-h', H + 'px');
  if (!wide) {
    const wrap = canvas.parentElement;
    if (wrap) { wrap.style.width = W + 'px'; wrap.style.height = H + 'px'; }
  }
  resizeCanvas();
  groundY = Math.round(H * (1 - GROUND_FRAC));
  if (S.phase !== 'fly' && S.phase !== 'rest') { S.ppm = S.ppmTarget = restPPM(); }
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
  if (S.phase === 'fly') return;
  e.preventDefault();
  SFX.ensureAudio(); VOICE.init();     // browsers only allow this on a gesture
  const p = pointer(e);
  if (S.phase === 'pick') {
    for (const c of S.cards) {
      if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h) {
        S.plane = c.f.key; SFX.play('pop'); TRACK().gameStart(); resetToAim();
        return;
      }
    }
    return;
  }
  if (hitSound(p)) { SFX.setOn(!SFX.isOn()); if (SFX.isOn()) SFX.play('click'); return; }
  if (hitChange(p)) { SFX.play('click'); S.phase = 'pick'; S.flight = null; VOICE.hush(); return; }
  if (S.phase === 'rest') {           // nothing but the button is live here
    if (hitBtn(p)) { SFX.play('click'); resetToAim(); }
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
function resetToAim() {
  S.phase = 'aim'; S.flight = null;
  S.meterT = 0; S.angle = M.CFG.ANG_MIN; S.pull = 0;   // slack, and lying level
  VOICE.hush();
  S.wind = rollWind();                  // fresh conditions every attempt
  S.dist = 0; S.beatBest = false;
  S.ppmTarget = restPPM();
  S.bgZoomTarget = 1;
}
function launch() {
  S.flight = M.fly(S.plane, S.angle, S.pull, { trace: true, wind: S.wind });
  S.flightStart = performance.now();
  S.phase = 'fly';
  S.beatBest = false; S.dist = 0; S.touched = false;
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

function bestLine() {
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
  if (S.phase === 'fly') { S.btn = null; S.chg = null; S.snd = null;
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
      const msg = S.phase === 'aim'     ? 'tap to draw the band'
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
  // The aeroplane must never climb under the band. The ceiling used to be a
  // flat 12% of the frame, which is above the band on a phone, so a steep
  // launch flew up behind the read-outs and out of sight. It is now the band's
  // own lower edge plus room for the aircraft itself, so it stays in the clear.
  const clear = HUD_H() + PLANE_LEN_M * S.ppm * 0.34 + 14;
  const lift = Math.max(0, wy - (groundY - clear) / S.ppm);
  S.camY += (lift - S.camY) * a;
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

  if (S.phase === 'pick') { drawPick(); requestAnimationFrame(frame); return; }

  let pp = null, pth = 0, pw = null;   // screen pos, pitch, world pos
  if (S.phase === 'fly') {
    const tr = S.flight.trace;
    const t = (now - S.flightStart) / 1000;
    const q = sample(tr, t);
    S.dist = q.x; pth = q.th;
    // airspeed straight off the trace, so the rush tracks what is actually
    // happening rather than an approximation of it
    const q2 = sample(tr, t + 0.06);
    const spd = Math.hypot(q2.x - q.x, q2.y - q.y) / 0.06;
    VOICE.flight(spd, q.y);
    if (!S.touched && q.y <= M.build(S.plane).gearH + 0.4) {
      S.touched = true; touchSound(spd);
    }
    const z = zoomForAlt(q.y - (M.build(S.plane).gearH || 0));
    S.ppmTarget = z * restPPM();
    S.bgZoomTarget = bgForZoom(z);
    chase(q.x, q.y, 0.14, dt);
    if (!S.beatBest && S.best > 0 && q.x > S.best) S.beatBest = true;
    if (t >= tr[tr.length - 1].t) {
      S.dist = S.flight.dist;
      if (S.dist > S.best) { S.best = S.dist; S.beatBest = true; }
      S.phase = 'rest';
      VOICE.hush();
      SFX.play(S.beatBest ? 'success' : 'drop');
    }
    pp = { x: sx(q.x), y: sy(q.y) }; pw = q;
  } else if (S.phase === 'rest' && S.flight) {
    const e = S.flight.trace[S.flight.trace.length - 1];
    // The closing move, and the only place it happens. The flight ends around
    // 0.62 of the rest shot on height alone; stopping is what asks the camera to
    // come the rest of the way in, so it reads as settling on the result rather
    // than as a dolly fighting an aeroplane that is still moving.
    S.ppmTarget = LAND_IN * restPPM();
    S.bgZoomTarget = bgForZoom(LAND_IN);
    chase(e.x, 0, 0.10, dt);
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
    }
    follow(0, M.CFG.LAUNCH_H, 0.16, 0.70, dt);
    // ONE RIGID ASSEMBLY, HUNG OFF THE SCREW. The band runs from the screw out
    // to the aeroplane and the aeroplane lies ALONG it, nose pointing back up
    // the band — which is the way it will travel when the sling lets go. Draw
    // changes the length; aim rotates the whole thing about the screw. Nothing
    // is positioned independently of anything else, which is what was wrong
    // before: the aeroplane was anchored at its own point, clamped upward out
    // of the field on steep aims, and rotated on a separate rule, so the band
    // crossed the fuselage at an angle nothing was holding it at.
    const o = pad();                       // the screw, not a second anchor
    const a = S.angle * Math.PI / 180;
    const ar = art();
    const halfH = (PLANE_LEN_M * S.ppm) *
      (ar && ar.ok ? ar.img.naturalHeight / ar.img.naturalWidth : 0.5) / 2;
    // slack length, so it sits just off the screw with nothing drawn
    let r = PLANE_LEN_M * S.ppm * 0.30 + Math.max(0, Math.min(1, S.pull)) * maxDrag();
    // A steep aim swings the aeroplane down towards the field. Shortening the
    // draw is what the ground would really do, and it keeps the assembly rigid;
    // clamping the aeroplane upward instead is what bent it before.
    const floor = sy(0) - halfH * 0.5;
    if (Math.sin(a) > 0.001) r = Math.min(r, Math.max(0, (floor - o.y) / Math.sin(a)));
    pp = { x: o.x - Math.cos(a) * r, y: o.y + Math.sin(a) * r };
    pth = a;
  }

  const aiming = S.phase === 'aim' || S.phase === 'setAng' || S.phase === 'setPull';
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
requestAnimationFrame(frame);
})();
