/* ============================================================
   Marble · A Zamborin Game (a 3D test)
   ============================================================

   The first 3D game on the site, built to answer one question: how does 3D
   play in a phone browser? A chrome marble on a glowing course high above a
   neon city (the owner's choice of world, 2026-09-26), blue rings that save
   your place and an orange ring at the far end.

   Two canvases share the frame. #world is three.js (WebGL) underneath. #game is
   the house canvas UI on top, so the controls, the read-out and the cards are
   drawn by shared/ui.js exactly as in every other game, and the design system
   applies to them unchanged. The world takes game-art colours; the chrome
   takes tokens. */

import {
  WebGLRenderer, Scene, PerspectiveCamera, Fog, HemisphereLight, DirectionalLight, DoubleSide,
  Mesh, Group, SphereGeometry, TorusGeometry, CircleGeometry, BufferGeometry, BoxGeometry,
  CylinderGeometry, PlaneGeometry, RingGeometry, ConeGeometry, IcosahedronGeometry, Sprite, SpriteMaterial,
  Float32BufferAttribute, Points, PointsMaterial, MeshStandardMaterial,
  MeshPhysicalMaterial, MeshBasicMaterial, CanvasTexture, RepeatWrapping,
  SRGBColorSpace, Color, Vector3, Quaternion, Euler, PCFShadowMap, NeutralToneMapping,
  PMREMGenerator, AdditiveBlending, DynamicDrawUsage, RoundedBoxGeometry,
  RoomEnvironment, InstancedMesh, Matrix4, Object3D, LatheGeometry, Vector2,
} from './assets/three-r186.min.js';

// ---------- MODE ----------
// A browser can report a 0-wide viewport on the first frame; zero means "not
// measured yet", so it must not count as narrow (DESIGN-SYSTEM 2).
const MODE = (matchMedia('(pointer: coarse)').matches ||
              (window.innerWidth > 0 && window.innerWidth < 768)) ? 'mobile' : 'desktop';
document.body.classList.add('mode-' + MODE);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const HARNESS = /[?&]harness=1(&|$)/.test(location.search);

// ---------- TOKENS ----------
// Canvas cannot read CSS variables, so the chrome's tokens are restated here,
// named. Nothing in the chrome may use a colour that is not in this list.
const TOK = {
  bg: '#0E1726', bgCard: '#131F36',
  text: '#FFFFFF', ink92: 'rgba(255,255,255,0.92)', ink90: 'rgba(255,255,255,0.90)',
  ink82: 'rgba(255,255,255,0.82)', ink72: 'rgba(255,255,255,0.72)',
  tint07: 'rgba(255,255,255,0.07)', tint12: 'rgba(255,255,255,0.12)',
  tint40: 'rgba(255,255,255,0.40)',
  accent: '#C24A39', accentText: '#FF6B5C',
  accent2: '#FFD23F',                                   // --accent-2, the sunshine highlight: the stars
  scrim: 'rgba(10,16,28,0.88)', scrimWin: 'rgba(10,16,28,0.82)',
};

// ---------- CANVASES ----------
let LW = 760, LH = 600;
const hud = document.getElementById('game');
const ctx = hud.getContext('2d');
const worldCanvas = document.getElementById('world');
const gameWrap = hud.parentElement;
const UI = window.ZAM_UI;

const SIDE_PAD = 30, PHONE_PAD = 16;
const topBand = () => (MODE === 'mobile' ? 64 : 56);
const botBand = () => (MODE === 'mobile' ? 52 : 40);

// In the site's full screen and in an embed the window is the frame
// (DESIGN-SYSTEM 2.2): a 3D view simply widens, so there is nothing to
// letterbox. A desktop window narrower than 760 is laid out at 760 and scaled.
const fullWindow = () => document.body.classList.contains('focus-mode') ||
                         document.body.classList.contains('embed');

/* THE NOTCH. In an app's web view, or a phone held sideways, the page runs
   under the status bar and the notch, and a control drawn there cannot be
   pressed. env() can only be read through CSS, so a probe carries the insets
   and the frame gives up the top and the sides. The bottom is left alone: the
   phone's bottom band is already 52 tall to clear the home indicator (2.1).
   play.css pads .play-row by the same amounts, so the frame lands exactly in
   the room that is left. */
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
  'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) 0 env(safe-area-inset-left,0px)';
document.body.appendChild(probe);
function room() {
  const cs = getComputedStyle(probe);
  const t = parseFloat(cs.paddingTop) || 0, l = parseFloat(cs.paddingLeft) || 0, r = parseFloat(cs.paddingRight) || 0;
  return { w: Math.max(0, window.innerWidth - l - r), h: Math.max(0, window.innerHeight - t) };
}
function setCanvasVars() {
  const { w, h } = room();
  if (MODE === 'mobile') { LW = w || 390; LH = h || 844; }
  else if (fullWindow() && w > 0 && h > 0) { LW = Math.max(760, w); LH = Math.round(LW * h / w); }
  else { LW = 760; LH = 600; }
  document.body.style.setProperty('--canvas-w', LW + 'px');
  document.body.style.setProperty('--canvas-h', LH + 'px');
}
function fitFullscreen() {
  if (MODE === 'mobile' || fullWindow()) {
    const { w, h } = room();
    gameWrap.style.width = w + 'px';
    gameWrap.style.height = h + 'px';
  } else { gameWrap.style.width = ''; gameWrap.style.height = ''; }
}
let cssW = 760, cssH = 600;
const quality = { max: 2, ratio: 2, cap: 2, slow: 0, fast: 0, settle: 0, sinceUp: 99, shadows: true };   // the 3D view's resolution, which follows the phone (see adaptQuality)
function resizeCanvases() {
  const rect = gameWrap.getBoundingClientRect();
  cssW = rect.width || LW; cssH = rect.height || LH;
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const bW = Math.round(cssW * dpr), bH = Math.round(cssH * dpr);
  if (hud.width !== bW) hud.width = bW;
  if (hud.height !== bH) hud.height = bH;
  if (renderer) {
    // Two, not three: a phone's third device pixel costs more than a third of
    // the frame time and nobody can see it on a moving scene.
    quality.max = Math.min(2, dpr);
    renderer.setPixelRatio(Math.min(quality.ratio, quality.max));
    renderer.setSize(cssW, cssH, false);
  }
  fitCamera();
  fitBackground();
}
function onResize() {
  setCanvasVars(); fitFullscreen(); resizeCanvases();
}

// ---------- AUDIO ----------
// Gain 2.4, as Tailwind: the fleet is mixed about 4x too quiet (DESIGN-SYSTEM 9).
const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zamborin-marble.sound', gain: 2.4 }) : null;
const play = (name) => { if (sfx) sfx.play(name); };

/* THE ROLL. A marble you cannot hear rolling feels like a picture sliding over
   a picture. Brown noise through a low-pass, its level and brightness riding
   the marble's speed, and silent the moment it leaves the ground. */
let roll = null;
function ensureRoll() {
  if (roll || !sfx || !sfx.out) return;
  sfx.ensureAudio();
  const out = sfx.out();
  if (!out) return;
  const ac = out.context;
  const n = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  let v = 0;
  for (let i = 0; i < n; i++) { v = (v + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = v * 3.5; }
  // End where it starts, or the loop clicks once every two seconds.
  const drift = d[n - 1] - d[0];
  for (let i = 0; i < n; i++) d[i] -= drift * i / (n - 1);
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 0.7;
  const g = ac.createGain(); g.gain.value = 0;
  src.connect(f); f.connect(g); g.connect(out); src.start();
  roll = { ac, f, g };
}
function updateRoll() {
  if (!roll) return;
  const sp = Math.hypot(ball.v.x, ball.v.z);
  const on = sfx.isOn() && ball.grounded && state === 'play';
  const t = roll.ac.currentTime;
  roll.g.gain.setTargetAtTime(on ? Math.min(0.14, 0.14 * sp / VMAX) : 0, t, 0.05);
  roll.f.frequency.setTargetAtTime(200 + sp * 55, t, 0.08);
}

/* ---------- THE NEON CITY'S SOUND (owner, 2026-09-26: "work on the sounds") ----------
   A two-note chime at a blue ring, a rising run at the orange one, a falling
   sweep when the marble drops off and a shimmer as it comes home, a low hum
   under the whole city, and the train's rush as it passes, from its own side.
   The marble itself keeps the rolling rumble it always had: an electric hum
   and a tick per grid line were tried under it, and the owner preferred the
   rumble ("I liked the sound you had before better"). Everything goes through
   the house sound module (DESIGN-SYSTEM 9), so the sound switch silences it. */
let citySound = null;                                 // the continuous voices, built on the first touch
function voice(type, f0, f1, dur, gain, delay = 0) { // one note, gliding from f0 to f1
  const out = sfx && sfx.out && sfx.out();
  if (!out || !sfx.isOn()) return;
  const ac = out.context, t0 = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
}
const NOTE_STEPS = [0, 2, 4, 7, 9]; let noteK = 0;      // the tiles' notes climb a pentatonic scale
const TONE_STEPS = [0, 2, 4, 7, 9, 12]; let toneK = 0;  // a tune's drums: each its own note and colour
const TONE_COLS = [0xFF5A5A, 0xFFD23F, 0x3DDC84, 0x4F8BFF, 0xC061FF, 0x3FF0FF];
const NEON_SOUNDS = {
  unlock() {                                          // a blue ring: two notes a fifth apart, and their echo
    for (const [d, k] of [[0, 1], [0.16, 0.45]]) { voice('triangle', 1318.5, 1318.5, 0.22, 0.07 * k, d); voice('sine', 1975.5, 1975.5, 0.3, 0.06 * k, d + 0.09); }
  },
  win() {                                             // the orange ring: a rising run, a whoosh, a chord
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => voice('triangle', f, f, 0.28, 0.07, i * 0.09));
    voice('sawtooth', 180, 1400, 0.45, 0.016);
    [523.25, 783.99, 1318.5].forEach((f) => voice('sine', f, f, 0.9, 0.035, 0.4));
  },
  drop() { voice('sine', 620, 70, 0.55, 0.08); voice('triangle', 310, 40, 0.55, 0.03); },
  home() { voice('sine', 220, 880, 0.16, 0.05); voice('sine', 1760, 1760, 0.12, 0.025); voice('sine', 90, 60, 0.18, 0.08, 0.14); },
  boost() { voice('sawtooth', 160, 900, 0.32, 0.018); voice('sine', 440, 1320, 0.28, 0.04); },     // a speed strip: a rising rush
  jump() { voice('square', 260, 780, 0.16, 0.022); voice('sine', 520, 1560, 0.2, 0.05); },         // a jump pad: a quick spring upward
  warp() {                                            // into a wormhole: a rising rush and a shimmer
    voice('sawtooth', 110, 1600, 0.7, 0.018); voice('sine', 220, 1760, 0.6, 0.05);
    voice('triangle', 1318.5, 2637, 0.5, 0.02, 0.3); voice('sine', 880, 880, 0.6, 0.03, 0.42);
  },
  depart() {                                          // the train is about to go: a station chime, two notes down
    voice('sine', 659.25, 659.25, 0.5, 0.06); voice('sine', 523.25, 523.25, 0.7, 0.06, 0.32);
    voice('triangle', 1318.5, 1318.5, 0.3, 0.015); voice('triangle', 1046.5, 1046.5, 0.4, 0.015, 0.32);
  },
  tint() { voice('sine', 880, 1320, 0.25, 0.05); voice('triangle', 1760, 2640, 0.2, 0.015, 0.04); },  // a curtain colours the marble
  tube() { voice('sawtooth', 140, 900, 0.5, 0.016); voice('sine', 330, 1320, 0.45, 0.045); },     // into a glass tube: drawn in with a rush
  pop() { voice('sine', 1100, 520, 0.14, 0.05); voice('triangle', 2200, 1400, 0.1, 0.012); },     // and out of it
  knock() { voice('sine', 190, 80, 0.14, 0.07); voice('triangle', 380, 150, 0.08, 0.025); },      // against a barrier or a crate
  clink() { voice('triangle', 1250, 930, 0.12, 0.03); voice('sine', 2500, 2100, 0.09, 0.014); },  // against a bollard
  crack() { for (const [f, dl] of [[2600, 0], [3300, 0.04], [2100, 0.09]]) voice('square', f, f * 0.7, 0.05, 0.018, dl); },   // a crystal slab cracking
  shatter() { for (let i = 0; i < 6; i++) voice('sine', 2200 + i * 380, 1400 + i * 200, 0.12 + i * 0.02, 0.03, i * 0.03); voice('triangle', 700, 200, 0.3, 0.03); },
  burn() { voice('sawtooth', 320, 70, 0.45, 0.045); voice('square', 1300, 380, 0.3, 0.014); voice('sine', 140, 50, 0.3, 0.07); },   // caught by a flame
  flame() { voice('sawtooth', 90, 300, 0.35, 0.02); voice('sine', 180, 520, 0.3, 0.02); },                                          // a jet lighting
  blast() { voice('sine', 170, 50, 0.32, 0.1); voice('sawtooth', 420, 90, 0.35, 0.035); },                                         // hit by a fireball
  zap() {                                             // caught by a scanner
    voice('sawtooth', 1500, 90, 0.38, 0.045); voice('square', 760, 60, 0.3, 0.025); voice('sine', 2400, 380, 0.16, 0.02);
  },
  power() {                                           // a power switch: a clunk, then the power rising
    voice('square', 90, 55, 0.14, 0.05); voice('sine', 160, 60, 0.18, 0.07);
    voice('sawtooth', 110, 660, 0.9, 0.014, 0.08); voice('sine', 220, 1320, 0.8, 0.035, 0.08);
  },
  pass() { voice('sine', 330, 660, 0.3, 0.05); voice('sine', 990, 990, 0.25, 0.02, 0.08); },       // through a wall of its own colour
  key() {                                             // a key taken: a bright chime, and a glint over it
    voice('triangle', 1567.98, 1567.98, 0.2, 0.06); voice('sine', 2349.3, 2349.3, 0.32, 0.045, 0.07); voice('sine', 3135.96, 3135.96, 0.22, 0.018, 0.13);
  },
  gate() {                                            // a gate opened: the key turns, the bars slide down, a chord
    voice('square', 140, 80, 0.1, 0.05, 0.3); voice('triangle', 1046.5, 1046.5, 0.12, 0.03, 0.3);
    voice('sawtooth', 240, 70, 0.5, 0.018, 0.38);
    [523.25, 659.25, 783.99].forEach((f, i) => voice('sine', f, f, 0.6, 0.035, 0.45 + i * 0.05));
  },
  glint() { voice('triangle', 2637, 2637, 0.12, 0.035); voice('sine', 3520, 3520, 0.18, 0.02, 0.04); },   // a mirror turned
  lit() { [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => voice('sine', f, f, 0.8, 0.03, i * 0.06)); voice('triangle', 1975.5, 1975.5, 0.5, 0.015, 0.2); },   // the crystal lit
  unlit() { voice('sine', 987.77, 493.88, 0.35, 0.03); },
  charge() { voice('sawtooth', 220, 1760, 0.35, 0.02); voice('square', 3000, 2400, 0.05, 0.012, 0.05); voice('sine', 880, 1320, 0.3, 0.04, 0.1); },   // charged
  earth() { voice('sine', 880, 110, 0.4, 0.05); voice('sawtooth', 400, 60, 0.3, 0.012); },                                                      // grounded
  whirr() { voice('sawtooth', 120, 240, 0.42, 0.02); voice('square', 60, 80, 0.4, 0.012); voice('triangle', 880, 1320, 0.12, 0.03, 0.36); },   // a lever thrown, a section turning
  thunk() { voice('sine', 170, 85, 0.2, 0.09); voice('triangle', 440, 400, 0.08, 0.025); voice('sine', 660, 990, 0.25, 0.03, 0.06); },   // a plate pressed
  scrape() { voice('sawtooth', 95, 62, 0.3, 0.035); voice('square', 150, 120, 0.26, 0.012); voice('sine', 70, 55, 0.3, 0.06); },           // a crate pushed
  glide() { voice('triangle', 1900, 2600, 0.32, 0.018); voice('sine', 3100, 2400, 0.4, 0.012, 0.04); voice('sine', 240, 200, 0.3, 0.02); },   // off across the ice
  crunch() { voice('sawtooth', 120, 70, 0.12, 0.03); voice('square', 260, 180, 0.08, 0.012, 0.02); voice('sine', 90, 60, 0.18, 0.05); },    // stopped by snow
  tone() { const f = 523.25 * Math.pow(2, TONE_STEPS[toneK] / 12); voice('sine', f * 1.5, f, 0.05, 0.04); voice('triangle', f, f, 0.36, 0.07); voice('sine', 2 * f, 2 * f, 0.22, 0.018); voice('sine', f / 2, f / 2, 0.3, 0.035); },   // a drum of a tune
  note() { const f = 392 * Math.pow(2, NOTE_STEPS[noteK % NOTE_STEPS.length] / 12 + Math.floor(noteK / NOTE_STEPS.length)); voice('triangle', f, f, 0.22, 0.05); voice('sine', 2 * f, 2 * f, 0.16, 0.015); },   // a tile lit: each a step up
  click() { voice('square', 2200, 1400, 0.03, 0.035); voice('triangle', 520, 780, 0.16, 0.05, 0.03); voice('sine', 1040, 1560, 0.22, 0.03, 0.06); },   // a switch pressed
  reset() { voice('sawtooth', 1300, 150, 0.55, 0.016); voice('sine', 1760, 330, 0.5, 0.045); voice('sine', 220, 220, 0.3, 0.04, 0.45); },   // a square put back
  buzz() { voice('square', 110, 100, 0.22, 0.035); voice('sawtooth', 55, 50, 0.2, 0.03); },        // a wall of the other colour
  bump() {                                            // a car meets the marble: a thud, and two notes of horn
    voice('sine', 170, 55, 0.3, 0.11); voice('triangle', 90, 40, 0.25, 0.05);
    voice('square', 466, 466, 0.1, 0.022, 0.06); voice('square', 370, 370, 0.16, 0.022, 0.2);
  },
};
// The city's version of a sound where it has one, the house sound elsewhere.
function sound(name) {
  if ((world.name === 'neon' || ['boost', 'jump', 'bump', 'depart', 'tint', 'pass', 'buzz', 'key', 'gate', 'reset', 'click', 'thunk', 'scrape', 'whirr', 'charge', 'earth', 'glint', 'lit', 'unlit', 'warp', 'tube', 'pop', 'power', 'zap', 'knock', 'clink', 'crack', 'shatter', 'burn', 'flame', 'blast', 'glide', 'crunch', 'note', 'tone'].includes(name)) && NEON_SOUNDS[name]) { if (sfx && sfx.isOn()) NEON_SOUNDS[name](); }
  else play(name === 'home' ? 'land' : name);
}
function ensureCitySound() {
  if (citySound || !sfx || !sfx.out) return;
  sfx.ensureAudio();
  const out = sfx.out();
  if (!out) return;
  const ac = out.context;
  const p1 = ac.createOscillator(), p2 = ac.createOscillator();          // the city: two low voices, the filter breathing
  p1.type = p2.type = 'sawtooth'; p1.frequency.value = 55; p2.frequency.value = 82.6;
  const pf = ac.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 320; pf.Q.value = 0.8;
  const lfo = ac.createOscillator(), lfoG = ac.createGain(); lfo.frequency.value = 0.07; lfoG.gain.value = 140;
  lfo.connect(lfoG); lfoG.connect(pf.frequency);
  const pg = ac.createGain(); pg.gain.value = 0;
  p1.connect(pf); p2.connect(pf); pf.connect(pg); pg.connect(out); p1.start(); p2.start(); lfo.start();
  const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), nd = nb.getChannelData(0);   // the train's rush
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const ns = ac.createBufferSource(); ns.buffer = nb; ns.loop = true;
  const tf = ac.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 520; tf.Q.value = 0.7;
  const tg = ac.createGain(); tg.gain.value = 0;
  const tp = ac.createStereoPanner ? ac.createStereoPanner() : null;
  ns.connect(tf); tf.connect(tg);
  if (tp) { tg.connect(tp); tp.connect(out); } else tg.connect(out);
  ns.start();
  // The wind between the towers: the same noise, higher and hollow, swelling
  // just before a gust and through it, from the side it blows from.
  const ws = ac.createBufferSource(); ws.buffer = nb; ws.loop = true; ws.playbackRate.value = 0.73;
  const wf = ac.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 760; wf.Q.value = 0.9;
  const wg = ac.createGain(); wg.gain.value = 0;
  const wp = ac.createStereoPanner ? ac.createStereoPanner() : null;
  ws.connect(wf); wf.connect(wg);
  if (wp) { wg.connect(wp); wp.connect(out); } else wg.connect(out);
  ws.start();
  // A scanner: a low electric hum, its filter opening as the bar slides fastest.
  const s1 = ac.createOscillator(), s2 = ac.createOscillator();
  s1.type = s2.type = 'sawtooth'; s1.frequency.value = 110; s2.frequency.value = 116.5;
  const sf = ac.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 600; sf.Q.value = 1.4;
  const sg = ac.createGain(); sg.gain.value = 0;
  s1.connect(sf); s2.connect(sf); sf.connect(sg); sg.connect(out); s1.start(); s2.start();
  citySound = { ac, pg, tg, tp, wf, wg, wp, sf, sg };
}
function updateCitySound() {
  const c = citySound;
  if (!c) return;
  const t = c.ac.currentTime, on = sfx.isOn() && world.name === 'neon';
  c.pg.gain.setTargetAtTime(on && state !== 'rules' ? 0.022 : 0, t, 0.4);
  const tr = cityRefs.train;
  if (tr && on) {
    const dx = tr.position.x - camera.position.x, dy = tr.position.y - camera.position.y, dz = TRAIN_Z - camera.position.z;
    c.tg.gain.setTargetAtTime(Math.pow(Math.max(0, 1 - Math.hypot(dx, dy, dz) / 45), 2) * 0.09, t, 0.1);
    if (c.tp) c.tp.pan.setTargetAtTime(Math.max(-1, Math.min(1, dx / 25)), t, 0.1);
  } else c.tg.gain.setTargetAtTime(0, t, 0.1);
  let wl = 0, wd = 0;                                   // the loudest gust near the marble
  if (on) for (const W of winds) {
    const near = Math.max(0, 1 - Math.max(0, Math.abs(ball.p.z - W.z) - W.d / 2) / 18);
    const l = windState(W, simT).show * near;
    if (l > wl) { wl = l; wd = W.dir; }
  }
  c.wg.gain.setTargetAtTime(0.11 * wl, t, 0.08);
  let sl = 0, sv = 0;                                   // the nearest scanner, and how fast its bar is sliding
  if (on) for (const Sc of scans) {
    const near = Math.max(0, 1 - Math.max(0, Math.abs(ball.p.z - Sc.zc) - Sc.d / 2) / 14);
    if (near > sl) { sl = near; sv = Math.abs(Math.sin(2 * Math.PI * (simT + Sc.phase) / Sc.period)); }
  }
  c.sg.gain.setTargetAtTime(0.035 * sl, t, 0.1);
  c.sf.frequency.setTargetAtTime(450 + 1100 * sv, t, 0.05);
  c.wf.frequency.setTargetAtTime(560 + 520 * wl, t, 0.1);
  if (c.wp) c.wp.pan.setTargetAtTime(-0.55 * wd, t, 0.2);
}

// ---------- ANALYTICS ----------
const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){}, levelRestart(){}, hintUsed(){} };
const T = () => (window.ZAM_TRACK || NOOP);
T().init('marble');

// ---------- SAVE ----------
const SAVE_KEY = 'zamborin-marble.v1';
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.level) { s.best = s.best || {}; s.stars = s.stars || {}; return s; } } catch (_) {}
  return { level: 1, best: {}, stars: {} };
}
const save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) {} }

// ---------- THE WORLD ----------
let renderer = null;
try {
  renderer = new WebGLRenderer({ canvas: worldCanvas, antialias: true, alpha: true,
                                 powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);          // the Portal wash on .game-wrap is the sky
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = NeutralToneMapping;      // keeps hues; ACES would push the coral to orange
  // Glass draws the scene a second time to see through it. The marble is a
  // small thing on a phone, so that second pass can run at half size there.
  if (MODE === 'mobile') renderer.transmissionResolutionScale = 0.5;
} catch (_) { renderer = null; }

const scene = new Scene();
// Distant stone sinks into Surface, the wash's middle stop, rather than ending
// at a hard far plane.
scene.fog = new Fog(0x131F36, 24, 58);
const camera = new PerspectiveCamera(50, 760 / 600, 0.1, 700);

/* The light comes from up and slightly left, as in every Zamborin game
   (DESIGN-SYSTEM 6), and a little from the viewer's side so the faces the
   camera sees are the lit ones. */
const hemi = new HemisphereLight(0xDDE8FF, 0x1A2A45, 1.15);
scene.add(hemi);
const sun = new DirectionalLight(0xFFF3E2, 2.6);
const SUN_OFFSET = new Vector3(-7, 15, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(MODE === 'mobile' ? 1024 : 2048, MODE === 'mobile' ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 3;
scene.add(sun, sun.target);

// ---------- TEXTURES ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'));
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = RepeatWrapping; t.anisotropy = 4; }
  return t;
}
/* Tiles, one to a metre. In 3D the eye reads speed from texture sliding past,
   and a plain surface under a rolling ball looks as if nothing is moving. Two
   close values and a soft bevel on each tile, lit from the upper left: an edge
   made of value, not a line. */
const tiles = (a, b) => canvasTex(128, 128, (g) => {
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    g.fillStyle = (i + j) % 2 ? a : b;
    g.fillRect(i * 64, j * 64, 64, 64);
    const lg = g.createLinearGradient(i * 64, j * 64, i * 64 + 64, j * 64 + 64);
    lg.addColorStop(0, 'rgba(255,255,255,0.14)');
    lg.addColorStop(0.45, 'rgba(255,255,255,0)');
    lg.addColorStop(1, 'rgba(0,0,0,0.07)');
    g.fillStyle = lg; g.fillRect(i * 64, j * 64, 64, 64);
  }
}, true);
// The marble's own markings: two cream bands winding round it, so its roll
// shows. Equirectangular, so the bands wrap the sphere.
const swirl = canvasTex(256, 128, (g) => {
  g.fillStyle = '#FF6B5C'; g.fillRect(0, 0, 256, 128);
  g.lineCap = 'round';
  for (const [col, w, ph, amp] of [['#FFF1EC', 15, 0, 26], ['#FFD9D2', 6, Math.PI, 30]]) {
    g.strokeStyle = col; g.lineWidth = w; g.beginPath();
    for (let x = -8; x <= 264; x += 4) {
      const y = 64 + Math.sin(x / 256 * Math.PI * 4 + ph) * amp;
      if (x === -8) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
});
// A dot with a thin bright core and a tight feather (DESIGN-SYSTEM 6: never a
// wide wash), for sparks and the dust in the void.
const dot = canvasTex(64, 64, (g) => {
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.3, 'rgba(255,255,255,0.85)');
  rg.addColorStop(0.55, 'rgba(255,255,255,0.18)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
});

// ---------- MATERIALS (game art) ----------
const stone = [
  new MeshStandardMaterial({ color: 0xD2C2A6, roughness: 0.9 }),                // sides
  new MeshStandardMaterial({ map: tiles('#EFE9DD', '#E3DBCB'), roughness: 0.82 }), // top
  new MeshStandardMaterial({ color: 0x8E8474, roughness: 1 }),                   // underside
];
// A pad that moves is a different stone, so it reads as a different thing
// before it has moved.
const ferryStone = [
  new MeshStandardMaterial({ color: 0x86B9C6, roughness: 0.8 }),
  new MeshStandardMaterial({ map: tiles('#CBE8EF', '#B8DEE7'), roughness: 0.7 }),
  new MeshStandardMaterial({ color: 0x55808C, roughness: 1 }),
];
// BoxGeometry's face order: +x, -x, +y (top), -y, +z, -z.
const faceMats = (m) => [m[0], m[0], m[1], m[2], m[0], m[0]];

let envTex = null;
if (renderer) {
  const pm = new PMREMGenerator(renderer);
  envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
}
const R = 0.42;                               // the marble's radius, in metres
const marble = new Mesh(new SphereGeometry(R, 48, 32), new MeshPhysicalMaterial({
  map: swirl, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06,
  envMap: envTex, envMapIntensity: 1.0,
}));
marble.castShadow = true;
scene.add(marble);

/* ---------- THE MARBLE'S LOOK ----------
   The owner chose clear glass with a stronger coloured eye (2026-09-26), from a
   sheet of three looks:
     now    the painted coral marble as first built
     glass  clear glass with a coloured eye inside, like a cat's-eye: the glass
            is mostly highlights, and what shows through it is the stone
     sun    the same glass, plus the point of focused sunlight it throws into
            its own shadow, which real marbles do (a burning glass; kept for the
            burning-glass idea, not shown in play)
   Glass picks up the pale stone behind it, so at game size the eye has to carry
   the marble: EYES holds the strengths laid out for the owner. */
const paintedMat = marble.material;
const glassMat = new MeshPhysicalMaterial({
  color: 0xFFFFFF, metalness: 0, roughness: 0.07, transmission: 1, thickness: 0.32, ior: 1.52,
  clearcoat: 1, clearcoatRoughness: 0.03, envMap: envTex, envMapIntensity: 1.4,
  attenuationColor: new Color(0xDDEFE8), attenuationDistance: 3,
});
/* The eye: three petals twisted round the middle, the way a cat's-eye is made.
   Each petal runs from the axis outward, so no two cross: two whole vanes
   crossing on the axis drew a stair-stepped seam once the glass magnified it. */
function vane(color, turn, width, glow) {
  const segs = 48, w = R * width, len = R * 1.4, twist = Math.PI;
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const y = -len / 2 + len * i / segs, a = turn + twist * (i / segs - 0.5);
    for (const r of [0.004, w]) pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  for (let i = 0; i < segs; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return new Mesh(g, new MeshStandardMaterial({ color, roughness: 0.35, side: DoubleSide,
                                                 emissive: color, emissiveIntensity: glow }));
}
const EYES = {
  soft:      { width: 0.17, glow: 0.12, petals: [0xFF6B5C, 0xFF6B5C, 0xFFF1EC] },   // as first shown
  stronger:  { width: 0.22, glow: 0.22, petals: [0xFF6B5C, 0xFF6B5C, 0xFF6B5C] },
  strongest: { width: 0.25, glow: 0.30, petals: [0xD62828, 0xD62828, 0xD62828] },   // a deeper marble red
};
const eye = new Group();
eye.rotation.z = 0.5;
marble.add(eye);
let eyeStyle = 'stronger';
function buildEye(style) {
  eyeStyle = style;
  for (const m of [...eye.children]) { eye.remove(m); m.geometry.dispose(); m.material.dispose(); }
  const e = EYES[style];
  e.petals.forEach((c, i) => eye.add(vane(c, i * Math.PI * 2 / e.petals.length, e.width, e.glow)));
}
buildEye(eyeStyle);
// The point of sunlight: a thin bright core with a tight feather, added to the
// shadow it sits in, on the line from the sun through the marble's centre.
const sunPoint = new Mesh(new CircleGeometry(0.24, 32), new MeshBasicMaterial({
  map: dot, color: 0xFFF1CF, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
sunPoint.rotation.x = -Math.PI / 2;
sunPoint.visible = false;
scene.add(sunPoint);
let look = 'glass';
function setLook(name) {
  look = name;
  marble.material = name === 'now' ? paintedMat : glassMat;
  eye.visible = name !== 'now';
}
setLook(look);
function updateSunPoint() {
  const on = look === 'sun' && ball.grounded && state !== 'fall' && state !== 'home' && state !== 'goal';
  sunPoint.visible = on;
  if (!on) return;
  const d = _ax.copy(SUN_OFFSET).normalize().negate();       // from the sun, through the marble
  const t = R / -d.y;
  sunPoint.position.set(ball.p.x + d.x * t, ball.p.y - R + 0.012, ball.p.z + d.z * t);
  // Lying flat (x turned down), its local y runs along the ground: turn that
  // toward the sun's heading and stretch it by the slant of the light.
  sunPoint.rotation.set(-Math.PI / 2, 0, Math.atan2(-d.x, -d.z));
  sunPoint.scale.set(1, 1 / -d.y, 1);
}

/* The dust: a few hundred faint motes in the void. Without anything between
   the course and the sky, the eye has nothing to judge depth or movement by
   once the stone leaves the frame. */
{
  const n = 260, a = new Float32Array(n * 3);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    a[i * 3] = -24 + rnd() * 54; a[i * 3 + 1] = -16 + rnd() * 26; a[i * 3 + 2] = 14 - rnd() * 80;
  }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(a, 3));
  scene.add(new Points(g, new PointsMaterial({ size: 0.09, map: dot, color: 0xA9BCE0,
    transparent: true, opacity: 0.5, depthWrite: false })));
}

// ---------- SPARKS ----------
const SPARKS = 160;
const sparkGeo = new BufferGeometry();
sparkGeo.setAttribute('position', new Float32BufferAttribute(new Float32Array(SPARKS * 3), 3).setUsage(DynamicDrawUsage));
sparkGeo.setAttribute('color', new Float32BufferAttribute(new Float32Array(SPARKS * 3), 3).setUsage(DynamicDrawUsage));
const sparkPts = new Points(sparkGeo, new PointsMaterial({ size: 0.24, map: dot, vertexColors: true,
  transparent: true, depthWrite: false, blending: AdditiveBlending }));
sparkPts.frustumCulled = false;
scene.add(sparkPts);
const sparks = [];
function burst(x, y, z, hex, n, speed) {
  if (REDUCED) return;                          // the ring's colour and the sound still answer
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  for (let i = 0; i < n; i++) {
    if (sparks.length >= SPARKS) sparks.shift();
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, k = Math.sqrt(1 - u * u);
    const sp = speed * (0.45 + Math.random() * 0.55);
    sparks.push({ x, y, z, vx: k * Math.cos(th) * sp, vy: Math.abs(u) * sp + 1.5, vz: k * Math.sin(th) * sp,
                  life: 0, max: 0.55 + Math.random() * 0.45, r, g, b });
  }
}
function updateSparks(dt) {
  const P = sparkGeo.attributes.position.array, C = sparkGeo.attributes.color.array;
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life += dt;
    if (s.life >= s.max) { sparks.splice(i, 1); continue; }
    s.vy -= 9 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    s.vx *= 0.97; s.vz *= 0.97;
  }
  for (let i = 0; i < SPARKS; i++) {
    const s = sparks[i];
    if (!s) { P[i * 3 + 1] = -999; C[i * 3] = C[i * 3 + 1] = C[i * 3 + 2] = 0; continue; }
    P[i * 3] = s.x; P[i * 3 + 1] = s.y; P[i * 3 + 2] = s.z;
    const f = 1 - s.life / s.max;                 // additive, so fading to black is fading out
    C[i * 3] = s.r * f; C[i * 3 + 1] = s.g * f; C[i * 3 + 2] = s.b * f;
  }
  sparkGeo.attributes.position.needsUpdate = true;
  sparkGeo.attributes.color.needsUpdate = true;
}

// ---------- THE COURSES ----------
/* Every piece is a box. F is a flat pad whose TOP is at y, centred on (x, z).
   RAMP runs from z0 to z1 (forward is -z), climbing from y0 to y1. FERRY is a
   pad that runs to and fro along x or z, amp either side of (x, z), and waits
   `dwell` seconds at each end of its run, where it sits flush with the stone
   it serves. Tops meet exactly, or the marble clips a seam.
   HOLO is a hologram bridge, solid only while it is lit: lit for `on` seconds
   of every `period`. BOOST is a speed strip that drives the marble on along
   -z. JUMP is a pad that throws the marble up and on over the gap after it. */
const THICK = 0.6;
const F = (x, z, w, d, y = 0) => ({ t: 'flat', x, z, w, d, y });
const RAMP = (x, z0, z1, w, y0, y1) => ({ t: 'ramp', x, z0, z1, w, y0, y1 });
const FERRY = (x, z, w, d, y, axis, amp, period, dwell, phase = 0) => ({ t: 'ferry', x, z, w, d, y, axis, amp, period, dwell, phase });
const HOLO = (x, z, w, d, y, period, on, phase = 0) => ({ t: 'holo', x, z, w, d, y, period, on, phase });
const BOOST = (x, z, w, d, y) => ({ t: 'boost', x, z, w, d, y });
const JUMP = (x, z, w, d, y) => ({ t: 'jump', x, z, w, d, y });
/* MAG is a maglev strip: road that pulls the marble sideways at `pull` m/s²
   (plus is toward +x). WIND is road that gusts blow across, `force` m/s² along
   `dir` (+1 or -1 in x), for `gust` seconds of every `period`, rising and
   falling away, with a sign of each gust coming just before it. */
const MAG = (x, z, w, d, y, pull) => ({ t: 'mag', x, z, w, d, y, pull });
const WIND = (x, z, w, d, y, dir, force, period, gust, phase) => ({ t: 'wind', x, z, w, d, y, dir, force, period, gust, phase });
// CROSS is a stretch of road that one or two lanes of flying cars cross.
const CROSS = (x, z, w, d, y, lanes) => ({ t: 'cross', x, z, w, d, y, lanes });
/* TRAIN is the sky train you ride: a deck on its roof, TRAIN_DECK long, that
   runs to and fro along z between two stations as a ferry does, amp either
   side of z. `pull` is how much of the train's own acceleration the marble
   feels: it rolls back as the train pulls away and on as it brakes. */
const TRAIN_DECK = 18, TRAIN_H = 0.3;
/* COLOUR LOCKS: a CURTAIN of light across a lane colours the marble that rolls
   through it (colour 1 lime, 2 violet); a LOCK is a wall across the road that
   lets through only a marble of its own colour. Lane planks carry `lane`, the
   colour of their curtain. */
const CURTAIN = (x, z, w, y, col) => ({ t: 'curtain', x, z, w, d: 0.1, y, col });
/* WORMHOLES: WORM stands on the road. 'in' swallows the marble and carries
   `pocket`, the course in the other world; 'exit' ends that course; 'out' is
   its twin in the city, past a gap no marble can cross, where it comes back. */
const WORM = (x, z, w, y, dir, pocket = null) => ({ t: 'worm', x, z, w, d: 0.3, y, dir, pocket });
/* LOOP is a loop-de-loop, shaped as the owner drew it (2026-09-27: "a gentle
   curve that starts on the plane of the rail"): a long lead-in that leaves the
   road flat and curves up, the loop, and a lead-out that comes down as gently.
   Its band is w wide and steps `shift` across as it turns, so the road out
   runs beside the road in. The road in ends at z; the road out starts LOOP_RUN
   further on, shift further over. */
const LOOP_R = 1.55, LOOP_RA = 5, LOOP_A = 0.72;
const LOOP_RUN = Math.round(2 * (LOOP_RA - LOOP_R) * Math.sin(LOOP_A) * 100) / 100;
const LOOP = (x, z, w, y, shift) => ({ t: 'loop', x, z, w, d: 0.1, y, shift });
// The course through a wormhole's world: short, its own shapes, its own rule.
function makePocket(n) {
  const r = seeded(4242 + n * 131), g = Math.min(1, (n - 1) / 39), W = (a, b) => mix(a, b, g), e = Math.max(0, (n - 40) / 60);
  const r2 = (v) => Math.round(v * 100) / 100;
  const wide = r2(W(4, 2.6)), narrow = r2(Math.max(1.5, W(2.6, 1.6)));
  const pieces = [F(0, 0, 5, 5)];
  let x = 0, z = -2.5;
  const straight = (len, w) => { pieces.push(F(x, r2(z - len / 2), w, len, 0)); z = r2(z - len); };
  const jog = (w) => {
    let dx = (r() < 0.5 ? -1 : 1) * (2.5 + r() * 2);
    if (x + dx < -3 || x + dx > 9) dx = -dx;
    pieces.push(F(r2(x + dx / 2), r2(z - w / 2), r2(Math.abs(dx) + w), w, 0));
    x = r2(x + dx); z = r2(z - w);
  };
  // Crystals on the path: rows across a wider stretch, one gap in each, never straight on from the last.
  const shardRows = () => {
    const gap = r2(W(2, 1.6)), ow = r2(Math.max(3.6, 2 * gap + 0.9)), half = ow / 2, rows = 2 + Math.round(W(0, 2) + r()), sp = r2(W(5, 4.2));
    straight(3, ow);
    const L = r2(rows * sp + 1.6), z0 = z, path = [], points = [];
    let side = r() < 0.5 ? -1 : 1;
    for (let i = 0; i < rows; i++) {
      const rz = r2(z0 - 1.6 - i * sp), gx = r2(x + side * (gap / 2 + 0.1 + r() * Math.max(0, half - gap - 0.2)));
      side = -side;
      path.push([gx, r2(rz + 1.4)], [gx, r2(rz - 1.4)]);
      for (let px = gx - gap / 2 - 0.46; px >= x - half + 0.25; px -= 0.86) points.push([r2(px), r2(rz + (r() - 0.5) * 0.3), r2(0.4 + r() * 0.08)]);
      for (let px = gx + gap / 2 + 0.46; px <= x + half - 0.25; px += 0.86) points.push([r2(px), r2(rz + (r() - 0.5) * 0.3), r2(0.4 + r() * 0.08)]);
    }
    path.push([x, r2(z0 - L + 0.2)]);
    pieces.push({ ...F(x, r2(z0 - L / 2), ow, L, 0), gauntlet: true }, GAUNTLET('shard', x, r2(z0 - L / 2), ow, L, 0, path), SHARDS(points, 0, x, r2(z0 - L / 2), ow, L));
    z = r2(z0 - L);
    straight(r2(3 + r() * 2), ow);
  };
  // Fire jets: one line of vents, later two, the second going out a second after the first.
  const fireLine = () => {
    const ow = r2(Math.max(wide, 3)), two = n >= 24, d = two ? 7.4 : 3.8, period = r2(W(3.6, 3) + r() * 0.4), on = r2(Math.min(W(1.2, 1.5), period - 1.8));
    straight(3.5, ow);
    const ph = r2(r() * period), lines = [{ dz: r2(d / 2 - 1.2), period, on, phase: ph }];
    if (two) lines.push({ dz: r2(d / 2 - 1.2 - 3.6), period, on, phase: r2(ph - 1.0) });
    pieces.push(FLAMES(x, r2(z - d / 2), ow, d, 0, lines));
    z = r2(z - d);
    straight(r2(3.5 + r() * 2), ow);
  };
  // Fireballs rolling across, out of one cliff and into the other; later two lanes, opposite ways.
  const fireCross = () => {
    const ow = r2(Math.max(wide, 3)), two = n >= 33 && r() < 0.6, d = two ? 3.8 : 2.4, speed = r2(W(5.5, 7) + r() * 0.6);
    const lane = (dz, dir) => {
      const gaps = []; for (let i = 3 + Math.floor(r() * 2); i > 0; i--) gaps.push(r2(W(4, 3.3) + r() * W(2.6, 1.8)));
      return { dz, dir, speed, gaps, phase: r2(r()) };
    };
    straight(3.5, ow);
    pieces.push({ ...CROSS(x, r2(z - d / 2), ow, d, 0, two ? [lane(-0.8, 1), lane(0.8, -1)] : [lane(0, r() < 0.5 ? 1 : -1)]), fire: true });
    z = r2(z - d);
    straight(r2(3.5 + r() * 2), ow);
  };
  // A crystal bridge: slabs end to end over a gap; each cracks when rolled onto and drops away a moment later.
  const crackBridge = () => {
    const bw = r2(Math.max(narrow + 0.4, 2.2)), slabs = 2 + Math.round(W(0, 2) + r() * 0.6), sl = 2.2;
    straight(4.5, Math.max(wide, bw));
    for (let i = 0; i < slabs; i++) pieces.push({ ...F(x, r2(z - sl / 2 - i * sl), bw, sl, 0), crack: true });
    z = r2(z - slabs * sl);
    straight(r2(4.5 + r() * 2), Math.max(wide, bw));
  };
  straight(5, wide);
  const pool = ['path', 'path'];
  if (n >= 11) pool.push('shards');
  if (n >= 13) pool.push('fire');
  if (n >= 20) pool.push('fireballs');
  if (n >= 22) pool.push('crack');
  const intro = { 11: 'shards', 13: 'fire', 20: 'fireballs', 22: 'crack' }[n];
  for (let f = 2 + Math.round(g * 3) + Math.round(2 * e); f > 0; f--) {
    const pick = intro && f === 2 + Math.round(g * 3) ? intro : pool[Math.floor(r() * pool.length)];
    if (pick === 'shards') shardRows();
    else if (pick === 'fire') fireLine();
    else if (pick === 'fireballs') fireCross();
    else if (pick === 'crack') crackBridge();
    else { if (r() < 0.55) jog(r() < 0.4 ? narrow : wide); else straight(r2(W(6, 10) + r() * 2), narrow); }
    straight(r2(4 + r() * 3), wide);
  }
  pieces.push(F(x, r2(z - 3.5), 5, 7, 0), WORM(x, r2(z - 4.5), 5, 0, 'exit'));
  return { pieces, start: [0, 0, 1], world: 'crystal' };
}
const LOCK = (x, z, w, y, col) => ({ t: 'lock', x, z, w, d: 0.24, y, col });
/* ROUND is a roundabout: a ring road from RB_RI to RB_RO round a raised
   island, turning clockwise (seen from above) at `spin` radians a second.
   The road in meets it from the south; `exits` names the roads out (W, N, E)
   and `lead` the one that leads on. The others stop short. */
const RB_RI = 2, RB_RO = 4.6, ISLAND_H = 0.7, RB_CF = 0.7;
/* SWITCH is a power switch: a button at (x, z) on a pad at the end of a side
   road that leaves the main road at the junction (jx, jz). Rolling over it
   lights the dark road `link` (a flat carrying `dark: link`), which cannot be
   crossed until then. `cable` is the line of lights from the button to the
   dark road, as [x, z] corners. */
const SWITCH = (x, z, y, link, jx, jz, cable) => ({ t: 'switch', x, z, y, link, jx, jz, cable, w: 1.6, d: 1.6 });
/* OBSTACLES on the road. POSTS is a set of neon bollards, one at each of
   `points` ([x, z]), standing on road at y; x, z, w, d give the patch they
   stand in. BLOCK is one solid obstacle, a road barrier or a cargo crate, w by
   d and h tall, standing at y (higher, on a stack), turned `yaw`. GAUNTLET
   marks a stretch of them and carries `path`, the line a careful player takes
   through the gaps. */
const POSTS = (points, y, x, z, w, d) => ({ t: 'posts', points, y, x, z, w, d });
const BLOCK = (kind, x, z, w, d, h, y, yaw = 0) => ({ t: 'block', kind, x, z, w, d, h, y, yaw });
const GAUNTLET = (kind, x, z, w, d, y, path) => ({ t: 'gauntlet', kind, x, z, w, d, y, path });
/* THE CANYON'S OWN OBSTACLES (owner, 2026-09-27: "are there any obstacles in
   the wormhole world? ... Some crystals lying on the path? some fire?"; chose
   all four offered). SHARDS: crystal clusters grown up out of the road, one at
   each of `points` ([x, z, radius]); x, z, w, d give the patch they stand in.
   FLAMES: road with lines of fire vents across it, each line { dz, period,
   on, phase }: flame for `on` seconds of every `period`. A flat piece with
   `crack` is a crystal slab that cracks when rolled onto and drops away a
   moment later. Rolling fireballs are a crossing with `fire`. */
const SHARDS = (points, y, x, z, w, d) => ({ t: 'shards', points, y, x, z, w, d });
const FLAMES = (x, z, w, d, y, lines) => ({ t: 'flames', x, z, w, d, y, lines });
const POST_R = 0.16, POST_H = 0.85;
/* SCAN is road swept by a scanner: a red bar of light that sweeps from side to
   side across it, a little past each edge, once every `period` seconds; with
   `bars` 2, a second bar sweeps the other way and they cross in the middle.
   Touching a bar sends the marble back to the last ring. */
const SCAN = (x, z, w, d, y, period, phase, bars) => ({ t: 'scan', x, z, w, d, y, period, phase, bars });
/* TUBE is a glass tube: its mouth stands at the end of the road (z), and it
   carries the marble up, once round a coil out over the city (to `side`, +1
   or -1 in x), and down onto the road that starts `gap` further on. */
const TUBE = (x, z, y, side, gap) => ({ t: 'tube', x, z, y, side, gap, w: 1.6, d: gap });
const ROUND = (x, z, y, spin, exits, lead, ew) => ({ t: 'round', x, z, y, ri: RB_RI, ro: RB_RO, w: 2 * RB_RO, d: 2 * RB_RO, spin, exits, lead, ew });
const TRAIN = (x, z, w, y, amp, period, dwell, phase, pull) => ({ t: 'train', x, z, w, d: TRAIN_DECK, y, axis: 'z', amp, period, dwell, phase, pull });
/* PUZZLE SQUARES (owner, 2026-09-27: "besides running and clearing obstacles
   there is nothing that is keeping the user from reaching the end ... where the
   user has to get the key, or do something that will open the next gate? This
   will be a theme through all worlds ... it should be cerebral, not just going
   through the motions"). From level 2 the finish stands past a walled square
   of CELL-metre cells, a small puzzle, and the camera rises to show all of it.
   A square is drawn as a map: 2 rows + 1 lines of 2 cols + 1 characters, north
   at the top. Odd places on odd lines are cells: '.' floor, '#' no floor, or a
   letter from the legend. The places between are edges: ' ' open, '-' and '|'
   walls, or a letter from the legend. The way in is the south edge of column
   `entry`, the way out the north edge of column `exit`. What a legend holds:
     key: n       a stand with key n on it (1 gold, 2 silver, 3 copper). Roll
                  over it to take the key. You carry one at a time: the key you
                  held is left on the stand in its place
     keygate: n   a gate that key n opens, and keeps: one key, one gate
     switch: L    a switch: roll over it to flip every gate of letter L
     sgate: L     a gate that switch L flips, shut to open and open to shut;
                  `open: 1` if it starts open
     weight: 1    a crate. Roll into it to push it one cell, if the cell past
                  it is clear floor with no wall or gate between (a crate
                  never crosses a gate, open or shut)
     plate: L     a plate: while something heavy is on it, its gates are open
     pgate: L     a gate held open by plate L
     tile: m      a section of road over the gap ('#'), turning on a pivot:
                  m is which sides it joins (1 north, 2 east, 4 south, 8
                  west, added); `lever` names the levers that turn it
     lever: L     a lever: roll over it to turn every section of lever L a
                  quarter turn clockwise
     charger: 1   a pad that charges the marble; ground: 1 one that empties it
     cgate: 1     a gate of lightning that only a charged marble passes
     magnet: 1    a charged floor: like charges push apart, so a charged
                  marble cannot roll onto it
     source: d    on an edge of the square, a lamp shining in (d the way it
                  shines); receptor: 1 a crystal on an edge; the beam passes
                  over walls and gates
     mirror: m    a mirror over the cell, '/' or '\\' as seen from above;
                  roll over the cell to turn it
     lgate: 1     a gate of light, open while the beam reaches the crystal
   Every layout is solved by a search before it goes in (the same rules, in
   pzsolve), which also counts the traps: moves after which the way out can no
   longer be reached. The reset pad on a bay beside the road in puts the square
   back as it was. */
const CELL = 2.2, WALL_H = 0.7, WALL_T = 0.26;
// PLAZAS START
const KEYS = { a: { key: 1 }, b: { key: 2 }, c: { key: 3 }, A: { keygate: 1 }, B: { keygate: 2 }, C: { keygate: 3 } };
const WEIGHTS = { W: { weight: 1 }, P: { plate: 'A' }, Q: { plate: 'B' }, A: { pgate: 'A' }, B: { pgate: 'B' } };
const LIGHT = { m: { mirror: '/' }, n: { mirror: '\\' }, S: { source: 'e' }, T: { source: 'w' }, R: { receptor: 1 }, X: { lgate: 1 } };
const CHARGE = { C: { charger: 1 }, G: { ground: 1 }, F: { magnet: 1 }, E: { cgate: 1 } };
const SWITCHES = { X: { switch: 'A' }, Y: { switch: 'B' }, Z: { switch: 'C' },
                   A: { sgate: 'A' }, a: { sgate: 'A', open: 1 }, B: { sgate: 'B' }, b: { sgate: 'B', open: 1 }, C: { sgate: 'C' }, c: { sgate: 'C', open: 1 } };
// The squares past level 40 were found by a search that mixes the mechanics (pzgen.js: keys, switches, crates and plates,
// charge, light), aimed at a number of steps that climbs with the level, rewarding dead ends and punishing clutter. One
// legend serves them all.
const TWIN = { t: { twin: 1 }, p: { twinPad: 1 } };      // the twin: where it starts, its pad
const TUNE = { a: { tone: 0 }, b: { tone: 1 }, c: { tone: 2 }, d: { tone: 3 }, e: { tone: 4 }, f: { tone: 5 } };   // the drums of a tune
const PIT = { W: { weight: 1 }, _: { pit: 1 } };          // build a road: a crate, a gap it fills
const ICE = { o: { rock: 1 }, s: { snow: 1 } };           // the ice mazes: a rock, snow (a hole is '#', a cell with no floor)
const GEN = { a: { key: 1 }, b: { key: 2 }, A: { keygate: 1 }, B: { keygate: 2 },
              x: { switch: 'A' }, y: { switch: 'B' }, X: { sgate: 'A' }, Y: { sgate: 'B' }, u: { sgate: 'A', open: 1 }, v: { sgate: 'B', open: 1 },
              W: { weight: 1 }, P: { plate: 'A' }, Q: { plate: 'B' }, G: { pgate: 'A' }, H: { pgate: 'B' },
              z: { charger: 1 }, g: { ground: 1 }, f: { magnet: 1 }, E: { cgate: 1 },
              m: { mirror: '/' }, n: { mirror: '\\' }, S: { source: 'e' }, T: { source: 'w' }, R: { receptor: 1 }, L: { lgate: 1 } };
const PLAZAS = {
  // The first: the way out is locked, and its key is in a room whose door is round the far side.
  K1: { entry: 2, exit: 2, legend: KEYS, map: [
    '+-+-+A+-+-+',
    '|. . . . .|',
    '+ +-+ +-+ +',
    '|. . .|. .|',
    '+ + + + + +',
    '|. . .|a .|',
    '+ + + +-+-+',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  // Two rooms and one gold key: only one room holds the key to the way out.
  K2: { entry: 2, exit: 2, legend: KEYS, map: [
    '+-+-+B+-+-+',
    '|c .|.|. b|',
    '+ + + + + +',
    '|. .A.A. .|',
    '+-+-+ +-+-+',
    '|. . . . .|',
    '+ + + + + +',
    '|a . . . .|',
    '+-+-+ +-+-+'] },
  // Three gold gates and two gold keys: the room beside the first key is a trap.
  K3: { entry: 2, exit: 2, legend: KEYS, map: [
    '+-+-+A+-+-+',
    '|b .|.|. a|',
    '+ + + + + +',
    '|. .|.|. .|',
    '+-+A+B+C+-+',
    '|c|. . . .|',
    '+A+ + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|a . . . c|',
    '+-+-+ +-+-+'] },
  // Three copper gates and two copper keys, both behind silver gates: one copper gate must stay shut.
  K4: { entry: 2, exit: 2, legend: KEYS, map: [
    '+-+-+C+-+-+',
    '|a .|.|. c|',
    '+ + + + + +',
    '|. .|.|. .|',
    '+ + + + + +',
    '|. .|.|. .|',
    '+-+C+C+B+-+',
    '|.A. . .B.|',
    '+ + + + + +',
    '|b|. . .|c|',
    '+-+ + + +-+',
    '|. a . b .|',
    '+-+-+ +-+-+'] },
  // Switches. The first: one letter, two switches. A opens the way to the far side and shuts the
  // way out; on the far side, A again.
  S1: { entry: 2, exit: 2, legend: SWITCHES, map: [
    '+-+-+a+-+-+',
    '|. . . . X|',
    '+ +-+-+-+-+',
    '|.|. . . .|',
    '+A+ + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|X . . . .|',
    '+-+-+ +-+-+'] },
  // A opens the room with B in it, and shuts the way to the exit: A, B, then A again.
  S2: { entry: 2, exit: 2, legend: SWITCHES, map: [
    '+-+-+B+-+-+',
    '|X .|.|. Y|',
    '+ +-+a+A+-+',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  // Three switches, each opening the next room: A, B, C, and A once more for the way out.
  S3: { entry: 2, exit: 2, legend: SWITCHES, map: [
    '+-+-+C+-+-+',
    '|Y .|.|. Z|',
    '+ + + + + +',
    '|. .|.|. .|',
    '+-+A+a+B+-+',
    '|. . . . .|',
    '+ + + + +-+',
    '|. . .|. .|',
    '+ + + + + +',
    '|. . .|. X|',
    '+-+-+ +-+-+'] },
  // As S3, but C shuts the room A stands in: press A the second time before C.
  S4: { entry: 2, exit: 2, legend: SWITCHES, map: [
    '+-+-+C+-+-+',
    '|Y .|.|. Z|',
    '+ + + + + +',
    '|. .|.|. .|',
    '+-+A+a+B+-+',
    '|. . . . .|',
    '+ + + +c+-+',
    '|. . .|. .|',
    '+ + + + + +',
    '|. . .|. X|',
    '+-+-+ +-+-+'] },
  // Weights. The first: one crate, one plate; push it across, then up.
  W1: { entry: 2, exit: 2, legend: WEIGHTS, map: [
    '+-+-+A+-+-+',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . P|',
    '+ + + + + +',
    '|. W . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  // The plate is in a nook: the crate can go in from one side only.
  W2: { entry: 2, exit: 2, legend: WEIGHTS, map: [
    '+-+-+A+-+-+',
    '|. . . .|P|',
    '+ + + + + +',
    '|. . . . .|',
    '+ +-+ + + +',
    '|. W . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  // Two crates stacked in the way, two plates, two gates in a row: which crate goes where, and in what order?
  W3: { entry: 2, exit: 2, legend: WEIGHTS, map: [
    '+-+-+B+-+-+',
    '|. .|.|. .|',
    '+ + +A+ + +',
    '|. . W . .|',
    '+ + + + + +',
    '|. . W . .|',
    '+ + + +-+-+',
    '|. . P . Q|',
    '+-+ + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  // Bridges. The first: one gap, one turning section, one lever.
  B1: { entry: 2, exit: 2, legend: { L: { lever: 'A' }, 1: { tile: 10, lever: 'A' } }, map: [
    '+-+-+ +-+-+',
    '|. . . . .|',
    '+ + + + + +',
    ' # # 1 # # ',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|L . . . .|',
    '+-+-+ +-+-+'] },
  // Two corners on one lever: no straight way over. Turn them until they make a zigzag.
  B2: { entry: 2, exit: 2, legend: { L: { lever: 'A' }, 1: { tile: 12, lever: 'A' }, 2: { tile: 3, lever: 'A' } }, map: [
    '+-+-+ +-+-+',
    '|. . . . .|',
    '+ + + + + +',
    ' # 1 2 # # ',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . L|',
    '+-+-+ +-+-+'] },
  // The key is over the gap on the left, the way out on the right, and the one lever turns both bridges.
  B3: { entry: 2, exit: 2, legend: { L: { lever: 'A' }, 1: { tile: 5, lever: 'A' }, 2: { tile: 10, lever: 'A' }, a: { key: 1 }, A: { keygate: 1 } }, map: [
    '+-+-+A+-+-+',
    '|. . . . .|',
    '+-+-+ + + +',
    '|a .|. . .|',
    '+ + + + + +',
    ' # 1 # 2 # ',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|L . . . .|',
    '+-+-+ +-+-+'] },
  // The hub: a turning crossing over the city. The key to the west, the lever to the east, the way out north.
  B4: { entry: 2, exit: 2, legend: { L: { lever: 'A' }, 1: { tile: 7, lever: 'A' }, a: { key: 1 }, A: { keygate: 1 } }, map: [
    '+ + +A+ + +',
    ' # # . # # ',
    '+ + + + + +',
    ' # # . # # ',
    '+ + + + + +',
    '|a . 1 L .|',
    '+ + + + + +',
    ' # # . # # ',
    '+ + + + + +',
    ' # # . # # ',
    '+ + + + + +'] },
  // Charge. The first: the way out lets only a charged marble through; the charger is off to one side.
  C1: { entry: 2, exit: 2, legend: CHARGE, map: [
    '+-+-+E+-+-+',
    '|. . . . .|',
    '+ +-+-+-+ +',
    '|.|. . .|.|',
    '+ +-+ +-+ +',
    '|. . . . C|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  // Charge to get in; the charged floor turns you back: ground yourself, cross, and charge again.
  C2: { entry: 2, exit: 2, legend: CHARGE, map: [
    '+-+-+E+-+-+',
    '|. . . . .|',
    '+-+-+-+-+ +',
    '|G . . F C|',
    '+-+-+E+-+-+',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|C . . . .|',
    '+-+-+ +-+-+'] },
  // The key needs charge to reach, the way out needs none, and the only ground is in a room that opens onto it.
  C3: { entry: 2, exit: 2, legend: { ...CHARGE, a: { key: 1 }, A: { keygate: 1 } }, map: [
    '+-+-+A+-+-+',
    '|G F .|. a|',
    '+ + + + + +',
    '|. .|F|. .|',
    '+-+E+ +E+-+',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|C . . . .|',
    '+-+-+ +-+-+'] },
  // Silver opens the charger's room, charge opens the gold key's, the way out needs none. The ground beside the gold key shuts you in.
  C4: { entry: 2, exit: 2, legend: { ...CHARGE, a: { key: 1 }, b: { key: 2 }, A: { keygate: 1 }, B: { keygate: 2 } }, map: [
    '+-+-+A+-+-+',
    '|. C|.|G a|',
    '+ + + + + +',
    '|. .|F|. .|',
    '+-+B+ +E+-+',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|b . . . G|',
    '+-+-+ +-+-+'] },
  // Light. The first: one mirror turns the beam onto the crystal, and the way out opens while it is lit.
  L1: { entry: 2, exit: 2, legend: LIGHT, map: [
    '+-+-+X+R+-+',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    'S. . . n .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  // Three mirrors: the beam must snake across the square and back to reach the crystal.
  L2: { entry: 2, exit: 2, legend: LIGHT, map: [
    '+-+R+X+-+-+',
    '|. . . . .|',
    '+ + + + + +',
    'S. . . m .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. m . n .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  // Both mirrors stand in the only way to the exit, and rolling through turns them: step back once.
  L3: { entry: 2, exit: 2, legend: LIGHT, map: [
    '+-+-+X+-+-+',
    '|. .|.|. .|',
    '+ + + + + +',
    'S. .|n|. .|',
    '+ + + + + +',
    '|. .|m|. .R',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  // The key is behind a gate of light; the mirror that lights it is where you stand to open it.
  L4: { entry: 2, exit: 2, legend: { ...LIGHT, a: { key: 1 }, A: { keygate: 1 } }, map: [
    '+-+-+A+R+-+',
    '|. . .|. a|',
    '+ + + +X+-+',
    'S. . . n .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  // PAST 40
  // The squares of levels 41-100 (found by pzgen.js, one for each level, each harder than the one before).
  G41: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+A+-+-+',
    '|.|.|. . .|',
    '+-+ +-+ +A+',
    'R. n . .|.|',
    '+A+-+-+A+ +',
    '|. n a|.|.T',
    '+B+ +-+ + +',
    '|a|m .A. .|',
    '+ + +-+ + +',
    '|. b .|. .|',
    '+-+-+ +-+-+',
  ] },
  G42: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+B+-+-+',
    '|b .|g|. .|',
    '+ + + + +-+',
    '|. .|f . a|',
    '+-+ + +E+ +',
    '|. a|.B.Bg|',
    '+B+ +-+ +A+',
    '|z|. .|. .|',
    '+ + +-+-+ +',
    '|. . . . .|',
    '+-+-+ +-+-+',
  ] },
  G43: { entry: 2, exit: 2, legend: GEN, map: [
    '+R+-+G+-+-+',
    '|. .|m .|.|',
    '+ +-+ + +G+',
    '|. . n|. .|',
    '+ + +L+-+ +',
    '|. . W .|n|',
    '+ + + + + +',
    '|. W . P .T',
    '+ +H+ + + +',
    '|QL. . . .|',
    '+-+-+ +-+-+',
  ] },
  G44: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+G+-+-+',
    '|. .|.X. .|',
    '+ +-+ + + +',
    '|P|.|.|. .|',
    '+ + +G+-+v+',
    '|. .|. .|x|',
    '+ + + +X+ +',
    '|. W . W .|',
    '+u+ +-+ + +',
    '|x . . y .|',
    '+-+-+ +-+-+',
  ] },
  G45: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+A+-+-+',
    '|a .|. .|.|',
    '+ +-+-+A+ +',
    '|. y a|. .|',
    '+ +A+ +A+ +',
    '|x .|. .|.|',
    '+ +u+ + + +',
    '|. .A. x .|',
    '+ + + + +-+',
    '|. b . . .|',
    '+-+-+ +-+-+',
  ] },
  G46: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+G+-+-+',
    '|.|.X. x x|',
    '+ +-+-+X+ +',
    '|. . W . .|',
    '+ + + + + +',
    '|P . . .Y.|',
    '+-+ + +G+-+',
    '|. . y|.|.|',
    '+ + + +-+ +',
    '|. . . .|.|',
    '+-+-+ +-+-+',
  ] },
  G47: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+B+-+-+',
    '|. bB.ux .|',
    '+ + +-+ + +',
    '|.|.|y .|.|',
    '+ +-+ + +-+',
    '|. a a xu.|',
    '+ + +B+ + +',
    '|.|. . . .|',
    '+ +-+ + +Y+',
    '|. . . . .|',
    '+-+-+ +-+-+',
  ] },
  G48: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+G+-+-+',
    '|.|.Hz|. f|',
    '+ +-+ + +-+',
    '|.|. W . .|',
    '+ + + + + +',
    '|P f f g .|',
    '+ +-+ +-+ +',
    '|g .|Q W .|',
    '+ +G+ +-+G+',
    '|. . . .H.|',
    '+-+-+ +-+-+',
  ] },
  G49: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+A+-+-+',
    '|.|a|.|. .|',
    '+ + +A+ +-+',
    '|.|gA.A.|.|',
    '+-+ + + + +',
    '|. . g . .|',
    '+ +A+-+ + +',
    '|.|.B. b .|',
    '+-+ + +-+ +',
    '|z a|. . .|',
    '+-+-+ +-+-+',
  ] },
  G50: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+G+-+-+',
    '|QH.G.|f .|',
    '+ + + + +-+',
    '|.|g g . .|',
    '+ + + + + +',
    '|.|WGf|. .|',
    '+ + + + + +',
    '|z . . P .|',
    '+ + +E+ + +',
    '|. . . W .|',
    '+-+-+ +-+-+',
  ] },
  G51: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+Y+-+-+',
    '|. m m . .|',
    '+ +-+-+ + +',
    'Rn .|n . .|',
    '+ +-+u+ + +',
    'S.|.|. . .|',
    '+ +Y+v+ +v+',
    '|.|y .X.|.|',
    '+ + +-+-+-+',
    '|x|. . . .|',
    '+-+-+ +-+-+',
  ] },
  G52: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+H+-+-+',
    '|Q . . .G.|',
    '+-+ +-+ + +',
    '|. .|.G. .|',
    '+ + + + + +',
    '|.G. . P .|',
    '+ +G+ + +-+',
    '|f z WGW g|',
    '+ + + + + +',
    '|f g|. .|.|',
    '+-+-+ +-+-+',
  ] },
  G53: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+H+-+-+',
    '|b a . . .|',
    '+ + + +A+-+',
    '|. W . .|.|',
    '+ + + + + +',
    '|. QB.|a|.|',
    '+ + + +-+ +',
    '|.G.|W|. .|',
    '+-+A+ +A+ +',
    '|P .|. . .|',
    '+-+-+ +-+-+',
  ] },
  G54: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+H+-+-+',
    '|m . . . m|',
    '+ + +L+-+-+',
    'R. . . n .|',
    '+-+ + + + +',
    '|. W|. . .T',
    '+L+ + + +H+',
    '|.H. W .|.|',
    '+-+-+ + +-+',
    '|.|. . Q|.|',
    '+-+-+ +-+-+',
  ] },
  G55: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+B+-+-+',
    'R. .|m|. .|',
    '+A+-+ + +-+',
    '|. .|.|. .|',
    '+A+ + + + +',
    'S. a . n a|',
    '+ +-+-+-+ +',
    '|m .B. b n|',
    '+ + +-+ +-+',
    '|.|. .|.|.|',
    '+-+-+ +-+-+',
  ] },
  G56: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+A+-+-+',
    '|.|. .|. y|',
    '+-+-+ + + +',
    '|x a|.|.|.|',
    '+ +-+A+ + +',
    '|.|.Ab .A.|',
    '+ + +-+ + +',
    '|.|x . .|a|',
    '+X+ + +Y+-+',
    '|. .|. .|.|',
    '+-+-+ +-+-+',
  ] },
  G57: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+H+-+-+',
    '|. . . . .|',
    '+ + + +Y+G+',
    '|. . x y P|',
    '+ + + + +X+',
    '|. Wu. W|x|',
    '+-+ + + + +',
    '|. . .G. Q|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+',
  ] },
  G58: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+G+-+-+',
    '|. . a . W|',
    '+A+-+ + +-+',
    '|. W . . .|',
    '+ +-+ + +A+',
    '|. .AQ .A.|',
    '+ + + +A+-+',
    '|. . b . .|',
    '+-+-+ + +-+',
    '|. P . .|.|',
    '+-+-+ +-+-+',
  ] },
  G59: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+A+-+-+',
    '|.|. x y .|',
    '+-+ + +v+-+',
    '|. .|. .|.|',
    '+ + +-+X+ +',
    '|.|g|. . .|',
    '+-+-+ +-+A+',
    '|f a|b z a|',
    '+A+ + + +-+',
    '|. .A.|.|.|',
    '+ + + + + +',
    '|. x|.|. .|',
    '+-+-+ +-+-+',
  ] },
  G60: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+L+-+R+',
    'S. .|. .|n|',
    '+ + +-+ + +',
    '|. . .|m .|',
    '+X+ + + +-+',
    '|n y a x|.|',
    '+ +-+L+-+ +',
    '|bux . . .|',
    '+ +-+-+A+ +',
    '|.|. . .Am|',
    '+ + + + + +',
    '|.|.|.|. a|',
    '+-+-+ +-+-+',
  ] },
  G61: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+H+-+-+',
    '|P W . . .|',
    '+ + +Y+ +-+',
    '|. .|W a y|',
    '+ + + +-+G+',
    '|.|a . Q .|',
    '+ +-+ + + +',
    '|x b . .|.|',
    '+ + +A+X+-+',
    '|. . .|.|.|',
    '+-+-+ +-+ +',
    '|.G.|. .|.|',
    '+-+-+ +-+-+',
  ] },
  G62: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+A+-+-+',
    '|. .Bn x .|',
    '+ +-+-+-+ +',
    '|. . . . m|',
    '+ +-+-+X+-+',
    'S. xA. m .|',
    '+ + +-+ +-+',
    '|.|b a y|.|',
    '+ +-+ + +-+',
    'R.|. .A. .|',
    '+-+-+ +B+-+',
    '|. . . .|.|',
    '+-+-+ +-+-+',
  ] },
  G63: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+G+-+-+',
    '|. .uQ .|.|',
    '+-+ +-+ + +',
    '|. yu.|W|P|',
    '+X+X+ + + +',
    '|.|.|.|. .|',
    '+ +-+ + + +',
    '|. .|. . x|',
    '+-+-+ + + +',
    '|.|. a bA.|',
    '+ +-+ +-+ +',
    '|. .|.|.|.|',
    '+-+-+ +-+-+',
  ] },
  G64: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+A+-+-+',
    '|. z . .|.|',
    '+ + +-+ +u+',
    '|. . . g f|',
    '+ + +-+A+ +',
    '|. bA.|.|.|',
    '+-+ + +-+-+',
    '|. y .|.A.|',
    '+-+-+A+ + +',
    '|.|. g|x .|',
    '+ +-+ + +-+',
    '|. . . a a|',
    '+-+-+ +-+-+',
  ] },
  G65: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+Y+-+-+',
    '|.B.|. .|.|',
    '+-+ +-+X+ +',
    '|. x b W .|',
    '+X+-+-+-+ +',
    '|. . a P .|',
    '+B+-+A+-+ +',
    '|y|. .|. x|',
    '+-+-+ + + +',
    '|. W . . .|',
    '+ +-+-+ + +',
    '|. . .|.|.|',
    '+-+-+ +-+-+',
  ] },
  G66: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+A+-+-+',
    '|. . f . .|',
    '+ + + +E+-+',
    '|z W|. g|.|',
    '+-+ +-+-+-+',
    '|. . . W P|',
    '+-+ + + + +',
    '|.|.|. .A.|',
    '+ + +-+E+ +',
    '|. .|.|. a|',
    '+-+ +-+ + +',
    '|f b .A.Ag|',
    '+-+-+ +-+-+',
  ] },
  G67: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+G+-+-+',
    '|. W .A.|.|',
    '+-+ + +A+B+',
    '|Q . b . .|',
    '+ + + +A+-+',
    '|. . . P a|',
    '+-+-+ +-+-+',
    '|. W . a .|',
    '+ + + + + +',
    '|.A. . . .|',
    '+-+-+ +-+-+',
  ] },
  G68: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+B+-+-+',
    '|m|. a|.|.|',
    '+-+-+ +-+ +',
    '|. . n n .|',
    '+-+B+ + + +',
    '|. .|.|. gR',
    '+-+-+-+ + +',
    '|. .|f .A.|',
    '+ + +A+A+A+',
    '|.|. g z aT',
    '+ + + + +-+',
    '|b m . . .|',
    '+-+-+ +-+-+',
  ] },
  G69: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+A+-+-+',
    '|.|. .A. .|',
    '+ + +-+ + +',
    '|.X. .|W .|',
    '+ +G+-+ +-+',
    '|. . . W .|',
    '+ + +Y+ + +',
    '|y P a|Q x|',
    '+ +-+-+A+ +',
    '|. . a b|.|',
    '+ + + +-+ +',
    '|.|. .|.|.|',
    '+-+-+ +-+-+',
  ] },
  G70: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+G+-+-+',
    'R. .|a . .|',
    '+A+ + + + +',
    '|.|.|.|. .T',
    '+ +-+ +-+A+',
    '|n W P m m|',
    '+ + + +H+-+',
    '|W|n . . .|',
    '+ + + + + +',
    '|. a . . Q|',
    '+ + + + +-+',
    '|.A. .A. .|',
    '+-+-+ +-+-+',
  ] },
  G71: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+H+-+-+',
    '|.|.|g|. y|',
    '+ + + + + +',
    '|. g|x . .|',
    '+X+ + + +-+',
    '|.|Q . . .|',
    '+X+ +E+ + +',
    '|x . . f|.|',
    '+ +-+ +Y+ +',
    '|WuW . . .|',
    '+ + + +-+ +',
    '|. z .|. f|',
    '+-+-+ +-+-+',
  ] },
  G72: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+G+R+-+',
    '|.L. . . .|',
    '+ + + + + +',
    '|. . x|.|.|',
    '+ +-+ +-+ +',
    '|W|nG. m x|',
    '+ + +H+ + +',
    '|n Q y . .|',
    '+ + + + +-+',
    '|. W|.|PX.|',
    '+-+ +-+ +G+',
    '|. . .|. .T',
    '+-+-+ +-+-+',
  ] },
  G73: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+A+-+-+',
    '|y g x|.|.|',
    '+ +-+-+-+ +',
    '|. . .A. z|',
    '+-+-+-+-+X+',
    '|. . a . .|',
    '+ + + + + +',
    '|a f . b .|',
    '+ +A+-+-+ +',
    '|.Bx|. f g|',
    '+ + + +X+ +',
    '|.|.|. . .|',
    '+-+-+ +-+-+',
  ] },
  G74: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+B+-+-+',
    '|z|g a|. .|',
    '+ + +-+ +-+',
    '|. . W .AP|',
    '+ +-+ + +-+',
    '|f .G. g .|',
    '+-+B+A+-+ +',
    '|. . . .|W|',
    '+ + + +-+ +',
    '|.|.B. . .|',
    '+ + + +-+ +',
    '|.|. .|a b|',
    '+-+-+ +-+-+',
  ] },
  G75: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+E+-+-+',
    '|.|. x xv.|',
    '+ + + + + +',
    '|. . . . g|',
    '+ + + +G+-+',
    '|f W f W .|',
    '+ +-+ + + +',
    '|. .Y. z .|',
    '+X+-+ +-+X+',
    '|. . . . .|',
    '+ +-+ + + +',
    '|P|y . .|.|',
    '+-+-+ +-+-+',
  ] },
  G76: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+A+-+R+',
    '|.|.Ab|a|.|',
    '+-+-+ + +-+',
    '|z|. m . .|',
    '+ +-+E+ + +',
    'S.|. .A. .|',
    '+ + + +-+ +',
    '|m nL.|. .|',
    '+-+-+A+ +-+',
    '|. n g|. .|',
    '+ + + + + +',
    '|. a .|f|.|',
    '+-+-+ +-+-+',
  ] },
  G77: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+A+-+-+',
    '|. . g . .|',
    '+-+v+A+-+-+',
    '|x|.|.|b .|',
    '+ +-+B+-+ +',
    '|x . g . .|',
    '+ + +A+-+ +',
    '|a . .|z .|',
    '+-+-+ + +A+',
    '|. . .|. .|',
    '+-+ +-+ + +',
    '|a . . y|.|',
    '+-+-+ +-+-+',
  ] },
  G78: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+G+R+-+',
    '|.|QG. n .|',
    '+-+ +H+ + +',
    '|.|. . .|.|',
    '+G+-+-+ + +',
    'Sx W . .un|',
    '+ + +-+ +-+',
    '|. . W P .|',
    '+ + + + + +',
    '|.|. mX. m|',
    '+-+-+ +-+ +',
    '|. . . .|.|',
    '+-+-+ +-+-+',
  ] },
  G79: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+A+R+-+',
    '|f|. .|.|.|',
    '+ + +-+ + +',
    '|.B.|. . .|',
    '+-+B+-+ + +',
    '|. . g m m|',
    '+L+ +-+ + +',
    '|. .|. z n|',
    '+-+-+ + + +',
    '|n . b . f|',
    '+ +-+ + + +',
    'S. .B.|.|a|',
    '+ + +B+ +-+',
    '|a|. .|. .|',
    '+-+-+ +-+-+',
  ] },
  G80: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+E+-+-+',
    '|. f . .|.|',
    '+ + + +G+E+',
    '|. . .|. .|',
    '+-+-+-+ + +',
    '|. g . m|W|',
    '+-+ +-+-+ +',
    '|z . . gL.|',
    '+-+-+G+ + +',
    '|. .|. . n|',
    '+-+ + + + +',
    'Sf W P . .|',
    '+ + +-+ + +',
    '|. f . .G.R',
    '+-+-+ +-+-+',
  ] },
  G81: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+E+-+-+',
    '|. .v. f .|',
    '+ +-+-+ + +',
    '|x y|. f .|',
    '+ +-+ + + +',
    '|. .Ya . .|',
    '+-+-+-+ + +',
    '|. . . . .|',
    '+ +-+ + +-+',
    '|.A.|fA. .|',
    '+u+ + +-+ +',
    '|.|. z|.|b|',
    '+-+ + + + +',
    '|.|.|. x a|',
    '+-+-+ +-+-+',
  ] },
  G82: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+L+-+R+',
    'Sf|g .|.|n|',
    '+-+ + + + +',
    '|. f .|. z|',
    '+ +-+-+ + +',
    '|.|.|. . m|',
    '+X+ + +-+ +',
    '|. . . .v.|',
    '+ + +E+-+ +',
    '|. n .|.|.|',
    '+ +X+-+ + +',
    '|. . x g|y|',
    '+ + +-+ +Y+',
    '|. .|. m .|',
    '+-+-+ +-+-+',
  ] },
  G83: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+A+-+-+',
    '|gY. g b z|',
    '+ + +A+ + +',
    '|.|.|. . a|',
    '+u+-+-+-+-+',
    '|.Bf . . .|',
    '+ + + + + +',
    '|.|.|. . .|',
    '+ +-+ + + +',
    '|. .|. . y|',
    '+ +A+-+ + +',
    '|.|x .|a|.|',
    '+ + + +-+ +',
    '|.|.|. . .|',
    '+-+-+ +-+-+',
  ] },
  G84: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+E+R+-+',
    '|. . . g y|',
    '+ + + + +-+',
    '|.|. . .|.|',
    '+ + + +Y+ +',
    '|f .uf|x .|',
    '+ + + + +-+',
    '|mL.|. .|.|',
    '+-+-+ + + +',
    '|z n|. n .|',
    '+-+ +-+ +-+',
    '|. x . m .|',
    '+-+ +X+-+ +',
    'S. .v. . .|',
    '+-+-+ +-+-+',
  ] },
  G85: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+B+-+-+',
    '|. .|g .|.|',
    '+-+ + +-+ +',
    '|. f QH. .|',
    '+-+G+ + + +',
    '|b|. W .|.|',
    '+ + + +-+ +',
    '|.|a|aA. .|',
    '+A+ +-+-+ +',
    '|P z W . .|',
    '+-+ + + + +',
    '|.|gA. . .|',
    '+-+-+ +-+-+',
  ] },
  G86: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+H+-+-+',
    '|y|.|.|.|Q|',
    '+-+ + +A+ +',
    '|.|.|a .|.|',
    '+ +-+ + + +',
    '|.|. b|W .|',
    '+ + +-+ + +',
    '|.Y.|.|.H.|',
    '+A+ + + + +',
    '|. . x . a|',
    '+ +Y+ + + +',
    '|. . . . .|',
    '+-+-+ +-+-+',
  ] },
  G87: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+L+R+-+',
    '|.L.G.|.|.|',
    '+-+ +-+ +-+',
    '|.|. . .|.|',
    '+-+-+ + + +',
    '|. W y . .|',
    '+u+ + +-+ +',
    '|m .|P m .|',
    '+ + + + +-+',
    '|x . . x .|',
    '+ +-+-+ + +',
    'Sn|.|. . .|',
    '+-+-+ +-+-+',
  ] },
  G88: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+X+-+-+',
    '|.|. x .E.|',
    '+ + +-+ + +',
    '|g|.|.|. .|',
    '+ +-+ +G+G+',
    '|. .|.E.|.|',
    '+ + + +-+ +',
    '|. g y P .|',
    '+-+ + +-+ +',
    '|Q W .|. .|',
    '+ + + +-+ +',
    '|.|.|.|. z|',
    '+ +-+ + + +',
    '|f . . WYx|',
    '+-+-+ +-+-+',
  ] },
  G89: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+B+-+-+',
    '|. n . . .|',
    '+ +A+B+-+-+',
    '|. . W .H.|',
    '+-+-+-+A+ +',
    'S. .|. W m|',
    '+ + + + + +',
    '|.|. . m .R',
    '+ +A+ + + +',
    '|. a|b . Q|',
    '+ +-+-+ + +',
    '|. a . .|.|',
    '+-+-+ +-+-+',
  ] },
  G90: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+G+-+-+',
    '|. . a|.|b|',
    '+ + + + + +',
    '|W . W P|.|',
    '+X+ + + +G+',
    '|xX.|. . y|',
    '+ + +-+ + +',
    '|.|Q .G. .|',
    '+ + + +-+ +',
    '|. . .|.|x|',
    '+ +-+-+-+ +',
    '|.B. .|. .|',
    '+ +-+ + + +',
    '|. .|. . .|',
    '+-+-+ +-+-+',
  ] },
  G91: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+R+B+-+-+',
    '|. . . W .|',
    '+-+ + + + +',
    '|Q|. P|.Aa|',
    '+ +G+A+ +-+',
    '|. .|.|. .|',
    '+ +-+-+ +-+',
    'S. W n . .|',
    '+ +-+A+-+-+',
    '|m bL. . .|',
    '+ +-+ +-+ +',
    '|m . n .|a|',
    '+ +-+-+ + +',
    '|. . . . .|',
    '+-+-+ +-+-+',
  ] },
  G92: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+Y+-+-+',
    '|. y|x . nR',
    '+ + + + + +',
    '|.YxG. Q|n|',
    '+-+-+ + + +',
    '|m W .|.|.|',
    '+ +-+ + +-+',
    'S. W .u.|.|',
    '+ + +-+ + +',
    '|. . . . .|',
    '+ +-+ + +-+',
    '|P . . .|.|',
    '+ + + + + +',
    '|. .|.L.G.|',
    '+-+-+ +-+-+',
  ] },
  G93: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+H+-+-+',
    '|. W . . .|',
    '+ + +-+-+ +',
    '|.|P x|. .|',
    '+ +Y+ + + +',
    '|.|gEz .X.|',
    '+ + +-+-+ +',
    '|. . W . .|',
    '+-+ +v+-+G+',
    '|g . x|.|.|',
    '+ + + + +-+',
    '|f . . . .|',
    '+ +-+ +-+-+',
    '|Q y . .|.|',
    '+-+-+ +-+-+',
  ] },
  G94: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+Y+-+-+',
    '|. . .|. n|',
    '+ + +-+ + +',
    '|. . .|y|.|',
    '+ +-+ +-+ +',
    'Sa .|mu. mR',
    '+ + +-+-+ +',
    '|. . .|. .|',
    '+-+ + +-+-+',
    '|x .L.|. .|',
    '+A+-+Y+ +-+',
    '|b .L. n a|',
    '+-+ +-+ + +',
    '|. . . x .|',
    '+-+-+ +-+-+',
  ] },
  G95: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+Y+-+-+',
    '|. .|. . .|',
    '+X+-+ + +-+',
    '|n .|. m .|',
    '+ + +-+G+ +',
    '|.|. x . .|',
    '+ + + +-+-+',
    '|. .|W . .|',
    '+ + +v+ + +',
    '|m W P|x|.|',
    '+ + +L+ +-+',
    '|. .|. y .R',
    '+-+ +-+-+-+',
    '|.G. . . .T',
    '+-+-+ +-+-+',
  ] },
  G96: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+H+-+-+',
    '|x . . .|.|',
    '+ + +-+ + +',
    '|. W b .|.|',
    '+-+ +X+-+ +',
    '|a W yua .|',
    '+ +A+ + +-+',
    '|Q . . .|.|',
    '+ + +-+ + +',
    '|. x .|. .|',
    '+-+ + + + +',
    '|. . .|.A.|',
    '+ +-+ +-+u+',
    '|. .|. . .|',
    '+-+-+ +-+-+',
  ] },
  G97: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+A+-+-+',
    'R.|. . . .|',
    '+H+A+ + +-+',
    'S.|. .|W|.|',
    '+B+ + + + +',
    '|P|.|W .|.|',
    '+-+-+ + + +',
    '|m|. nA. .|',
    '+-+ +A+ + +',
    '|b m . . Q|',
    '+ +-+-+ + +',
    '|.|. a . .|',
    '+ + + + + +',
    '|a . .|.|.|',
    '+-+-+ +-+-+',
  ] },
  G98: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+A+-+-+',
    '|. .|y|a .R',
    '+ + +B+ + +',
    '|. . m . n|',
    '+ +-+ +-+-+',
    '|. .|x . .|',
    '+-+-+-+-+ +',
    '|. . xA. m|',
    '+-+-+ +-+ +',
    '|. . n|.|.|',
    '+B+ + +-+-+',
    '|. .ua . .|',
    '+ + + + + +',
    '|bA. . . .T',
    '+-+-+ +-+-+',
  ] },
  G99: { entry: 2, exit: 2, legend: GEN, map: [
    '+R+-+H+-+-+',
    'S. .|xv.|.|',
    '+ +-+ +-+ +',
    '|. . . .|.|',
    '+ + + + +-+',
    '|m|. W . .|',
    '+ +H+ +H+-+',
    '|n . . . .|',
    '+ + + +-+ +',
    '|Q|P . . m|',
    '+ +-+-+ + +',
    '|.|y . . .|',
    '+-+ +-+G+G+',
    '|. n .|. .|',
    '+-+-+ +-+-+',
  ] },
  G100: { entry: 2, exit: 2, legend: GEN, map: [
    '+-+-+G+-+-+',
    '|P . . y .|',
    '+E+Y+-+ + +',
    '|. . . .|.|',
    '+X+ + + + +',
    '|.|. Q|g|.|',
    '+-+ + + + +',
    '|. W|x|. .|',
    '+ + + + +-+',
    '|. x . z .|',
    '+ + + +-+ +',
    '|.u. f WX.|',
    '+-+ + +-+-+',
    '|. . .|f .|',
    '+-+-+ +-+-+',
  ] },
  // PAST 40 END
  // The finales. The crate must hold the key room's door open, and then stands in the way out.
  F2: { entry: 2, exit: 2, legend: { W: { weight: 1 }, Q: { plate: 'B' }, B: { pgate: 'B' }, k: { key: 1 }, K: { keygate: 1 } }, map: [
    '+-+-+K+-+-+',
    '|. .|.|. k|',
    '+ + + +B+-+',
    '|. . Q . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. W . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  // The switch opens the mirror's room and shuts the way out; the mirror lights the key's gate.
  F1: { entry: 2, exit: 2, legend: { P: { switch: 'A' }, D: { sgate: 'A' }, d: { sgate: 'A', open: 1 }, S: { source: 'e' }, R: { receptor: 1 },
                                     n: { mirror: '\\' }, L: { lgate: 1 }, k: { key: 1 }, K: { keygate: 1 } }, map: [
    '+-+-+K+R+-+',
    '|. .|.|. k|',
    '+ + + +-+L+',
    'S. .|.|n .|',
    '+ + +d+D+-+',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|P . . . .|',
    '+-+-+ +-+-+'] },
  // ICE MAZES (owner, 2026-09-28, the first of eight new puzzles on the road). The floor is ice: the marble slides until
  // something stops it, 'o' a rock (a cell short of it), 's' snow (on it); over a hole, '#', it drops. Found by a search
  // (icegen.js) for the fewest slides out, nowhere to get stuck, and a field that random pushing rarely gets out of.
  I1: { entry: 2, exit: 2, ice: true, legend: ICE, map: [    // 4 slides: a rock stops you a cell short
    '+-+-+ +-+-+',
    '|. . . o .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . o . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  I2: { entry: 2, exit: 2, ice: true, legend: ICE, map: [    // 6 slides: snow stops you on it
    '+-+-+ +-+-+',
    '|. . . . .|',
    '+ + + + + +',
    '|. s s . o|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|o . . . .|',
    '+ + + + + +',
    '|. . o . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  I3: { entry: 2, exit: 2, ice: true, legend: ICE, map: [    // 9 slides, and holes
    '+-+-+ +-+-+',
    '|. . . o .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|# . . s .|',
    '+ + + + + +',
    '|. # . . o|',
    '+ + + + + +',
    '|. . o . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  I4: { entry: 2, exit: 2, ice: true, legend: ICE, map: [    // 14 slides
    '+-+-+ +-+-+',
    '|# . . o .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. s . . o|',
    '+ + + + + +',
    '|o . o . .|',
    '+ + + + + +',
    '|. . . o .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . o|',
    '+-+-+ +-+-+'] },
  // BUILD A ROAD (owner, 2026-09-28, the second new puzzle: "push blocks to build a road"). A chasm of gaps '_' right
  // across; a crate pushed into a gap drops in and fills it, and it is road after. Found by a search (fillgen.js).
  P1: { entry: 2, exit: 2, legend: PIT, map: [             // 1 push: fill the gap, cross
    '+-+-+ +-+-+',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|_ _ _ _ _|',
    '+ + + + + +',
    '|W . . W .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  P2: { entry: 2, exit: 2, legend: PIT, map: [             // 6 pushes: two rows of gaps, one crate over the other
    '+-+-+ +-+-+',
    '|. . . . .|',
    '+ + + + + +',
    '|_ _ _ _ _|',
    '+ + + + + +',
    '|_ _ _ _ _|',
    '+ + + +-+ +',
    '|. . . . .|',
    '+ + + + + +',
    '|. W W W .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  P3: { entry: 2, exit: 2, legend: PIT, map: [             // 10 pushes: four crates, and the order matters
    '+-+-+ +-+-+',
    '|. . . . _|',
    '+ + + +-+ +',
    '|_ _ _ _ _|',
    '+ + + + + +',
    '|_ _ _ _ _|',
    '+ + + + + +',
    '|. . . . W|',
    '+ + + + + +',
    '|. . . W .|',
    '+ + + + + +',
    '|W . . . W|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  // COVER EVERY TILE (owner, 2026-09-28, the third new puzzle). A tile lights as the marble rolls onto it and crumbles
  // when it leaves; once every tile is lit, a bridge appears at the way out. So: one route through every tile, ending
  // at the way out. Each push rolls the marble one tile. Found by a search (covergen.js): T2 and T3 have one route only.
  T1: { entry: 2, exit: 2, cover: true, legend: {}, map: [ // 15 tiles, two routes
    '+-+-+ +-+-+',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  T2: { entry: 2, exit: 2, cover: true, legend: {}, map: [ // 20 tiles, one route
    '+-+-+ +-+-+',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+ + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  T3: { entry: 2, exit: 2, cover: true, legend: {}, map: [ // 28 tiles, one route, round two holes
    '+-+-+ +-+-+',
    '|. . . . .|',
    '+ + + +-+ +',
    '|. . . . .|',
    '+ + + + + +',
    '|.|. . . .|',
    '+ + + + + +',
    '|. # . . .|',
    '+ + + + + +',
    '|. # . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  // REMEMBER THE TUNE (owner, 2026-09-28, the fourth new puzzle). Drums, each its own colour and note, play a tune as
  // the marble comes in; roll over them in the same order and a portal opens over the missing road beyond. A wrong
  // drum: they flash, and play it again. The pad by the road in plays it again too. Later, drums stand in rows, so the
  // way from one to the next must go round the others.
  M1: { entry: 2, exit: 2, tune: 'bac', legend: TUNE, map: [   // three drums, three notes
    '+-+-+ +-+-+',
    '|. . . . .|',
    '+ + + + + +',
    '|a . b . c|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  M2: { entry: 2, exit: 2, tune: 'adbca', legend: TUNE, map: [ // four drums, five notes
    '+-+-+ +-+-+',
    '|. . . . .|',
    '+ + + + + +',
    '|. . d . .|',
    '+ + + + + +',
    '|b . . . c|',
    '+ + + + + +',
    '|. . a . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  M3: { entry: 2, exit: 2, tune: 'cafbecd', legend: TUNE, map: [ // six drums in rows, seven notes: go round them
    '+-+-+ +-+-+',
    '|. . . . .|',
    '+ + + + + +',
    '|d . e . f|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|a . b . c|',
    '+ + + + + +',
    '|. . . . .|',
    '+ + + + + +',
    '|. . . . .|',
    '+-+-+ +-+-+'] },
  // THE TWIN (owner, 2026-09-28, the fifth new puzzle). A wall down the middle: you on the left, your twin on the right
  // from 't'. Each push moves you a tile and your twin a tile the mirror way (east for you is west for it); a wall stops
  // either alone. Stand at the way out while your twin stands on its pad 'p', and the bridge appears. (twingen.js)
  D1: { entry: 1, exit: 1, twin: true, legend: TWIN, map: [   // 7 pushes
    '+-+ +-+-+-+-+',
    '|. . .|. . t|',
    '+ + +-+ + + +',
    '|. . .|. . p|',
    '+ + + + + + +',
    '|. . .|. . .|',
    '+ + + + + + +',
    '|. . .|. . .|',
    '+-+ +-+-+-+-+'] },
  D2: { entry: 1, exit: 1, twin: true, legend: TWIN, map: [   // 12 pushes
    '+-+ +-+-+-+-+',
    '|. . .|. . .|',
    '+ + + + + + +',
    '|. . .|t . .|',
    '+ + + + + + +',
    '|. . .|. . .|',
    '+ + + + + + +',
    '|. . .|. p .|',
    '+ + + +-+ + +',
    '|. . .|. . .|',
    '+-+ +-+-+-+-+'] },
  D3: { entry: 1, exit: 1, twin: true, legend: TWIN, map: [   // 18 pushes
    '+-+ +-+-+-+-+',
    '|. .|.|. . .|',
    '+ + + + + + +',
    '|. . .|. . t|',
    '+ + + + + + +',
    '|. . .|. . p|',
    '+ + + + + + +',
    '|. . .|. . .|',
    '+ + + + + + +',
    '|. . .|. . .|',
    '+ + + +-+ + +',
    '|. . .|. . .|',
    '+-+ +-+-+-+-+'] },
};
// PLAZAS END
// Which square each level ends with; '~' mirrors it left to right.
// The new puzzles, each tried first on a course of its own (#try-<kind>, #try-<kind>-tokyo), easy to hard.
const TRY_COURSES = { ice: ['I1', 'I2', 'I3', 'I4'], road: ['P1', 'P2', 'P3'], tiles: ['T1', 'T2', 'T3'], tune: ['M1', 'M2', 'M3'], twin: ['D1', 'D2', 'D3'] },
      TRY_TITLES = { ice: 'ICE MAZES', road: 'BUILD A ROAD', tiles: 'EVERY TILE', tune: 'THE TUNE', twin: 'THE TWIN' };
const TRY_NEWS = { ice: 'Four ice mazes, easy to hard. On ice the marble slides until something stops it',
                   road: 'Three chasms. Push crates into the gaps to make a road across',
                   tiles: 'Light every tile. Each one crumbles behind you',
                   tune: 'Listen, then play it back. The way on opens when you do',
                   twin: 'Your twin moves as your mirror. Stand at the way out while it stands on its pad' };
const PLAZA_AT = { 2: 'K1', 3: 'K2', 4: 'K2~', 5: 'K3', 6: 'K3~', 7: 'K4', 8: 'K4~', 9: 'S1', 10: 'S2', 11: 'S2~', 12: 'S3', 13: 'S4~',
                   14: 'W1', 15: 'W2', 16: 'W3', 17: 'W3~', 18: 'B1', 19: 'B2', 20: 'B3', 21: 'B3~', 22: 'B4', 23: 'B2~',
                   24: 'C1', 25: 'C2', 26: 'C2~', 27: 'C3', 28: 'C3~', 29: 'C4',
                   30: 'L1', 31: 'L2', 32: 'L3', 33: 'L4', 34: 'L2~', 35: 'L3~',
                   // The Express: the hardest of each, the other way round from before, and two that mix them
                   36: 'S4', 37: 'C4~', 38: 'L4~', 39: 'F2', 40: 'F1' };  // (S4 mirrored: its trap room on the other side from S3's)
Object.assign(PLAZA_AT, { 41: 'G41', 42: 'G42', 43: 'G43', 44: 'G44', 45: 'G45', 46: 'G46', 47: 'G47', 48: 'G48', 49: 'G49', 50: 'G50', 51: 'G51', 52: 'G52', 53: 'G53', 54: 'G54', 55: 'G55', 56: 'G56', 57: 'G57', 58: 'G58', 59: 'G59', 60: 'G60', 61: 'G61', 62: 'G62', 63: 'G63', 64: 'G64', 65: 'G65', 66: 'G66', 67: 'G67', 68: 'G68', 69: 'G69', 70: 'G70', 71: 'G71', 72: 'G72', 73: 'G73', 74: 'G74', 75: 'G75', 76: 'G76', 77: 'G77', 78: 'G78', 79: 'G79', 80: 'G80', 81: 'G81', 82: 'G82', 83: 'G83', 84: 'G84', 85: 'G85', 86: 'G86', 87: 'G87', 88: 'G88', 89: 'G89', 90: 'G90', 91: 'G91', 92: 'G92', 93: 'G93', 94: 'G94', 95: 'G95', 96: 'G96', 97: 'G97', 98: 'G98', 99: 'G99', 100: 'G100' });   // past 40: a square of its own for each level
function plazaLayout(id) {
  const flipped = id.endsWith('~'), T = PLAZAS[flipped ? id.slice(0, -1) : id];
  const cols = (T.map[0].length - 1) / 2, rows = (T.map.length - 1) / 2;
  if (!flipped) return { id, cols, rows, map: T.map, legend: T.legend, entry: T.entry, exit: T.exit, ice: T.ice, cover: T.cover, tune: T.tune, twin: T.twin };
  const legend = {};
  for (const [ch, v] of Object.entries(T.legend)) {                 // and anything that points turns with it
    const u = legend[ch] = { ...v };
    if (u.mirror) u.mirror = u.mirror === '/' ? '\\' : '/';
    if (u.source === 'e' || u.source === 'w') u.source = u.source === 'e' ? 'w' : 'e';
    if ('tile' in u) u.tile = (u.tile & 5) | (u.tile & 2 ? 8 : 0) | (u.tile & 8 ? 2 : 0);
  }
  return { id, cols, rows, map: T.map.map((l) => [...l].reverse().join('')), legend, entry: cols - 1 - T.entry, exit: cols - 1 - T.exit, ice: T.ice, cover: T.cover, tune: T.tune, twin: T.twin };
}
// A square's map read into cells[r][c], edges h[k][c] (the south edge of row k) and v[r][c] (the west edge of column c).
function plazaGrid(pc) {
  const { map, legend, rows, cols } = pc;
  const edge = (ch) => (ch === ' ' ? null : ch === '-' || ch === '|' ? 'wall' : { ...legend[ch], ch });
  const cells = [], h = [], v = [];
  for (let k = 0; k <= rows; k++) { const l = map[2 * (rows - k)]; h.push([]); for (let c = 0; c < cols; c++) h[k].push(edge(l[2 * c + 1])); }
  for (let r = 0; r < rows; r++) {
    const l = map[2 * (rows - 1 - r) + 1]; cells.push([]); v.push([]);
    for (let c = 0; c < cols; c++) { const ch = l[2 * c + 1]; cells[r].push(ch === '.' ? {} : ch === '#' ? { void: true } : { ...legend[ch], ch }); }
    for (let c = 0; c <= cols; c++) v[r].push(edge(l[2 * c]));
  }
  return { cells, h, v };
}
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const mix = (a, b, t) => a + (b - a) * t;

/* FORTY LEVELS IN FIVE DISTRICTS OF THE CITY (owner, 2026-09-26: "write 40
   levels", progressively harder and longer). Each district brings one new
   thing and keeps what came before:
     1-8    Downtown    turns, narrowing paths, ramps
     9-16   Transit     pads that slide across a gap, and pads that ferry you over one
     17-24  Holograms   bridges that switch off and on: cross while they are lit
     25-32  Boost       speed strips, and jump pads over gaps
     33-40  Express     all of it, on the longest courses
   makeLevel(n) builds course n from its own seed, so it is the same every
   time. Across the forty, courses grow from about 45 m to about 200 m, paths
   narrow from 4 m to 1.3 m, the blue rings that save your place grow further
   apart, and the windows to cross a bridge or catch a pad shrink. Pieces are
   listed in the order the marble meets them.
   AND ON TO A HUNDRED (owner, 2026-09-28: "the difficulty level of level 1 of
   tokyo should be harder than the 50th level of the neon city. The levels will
   increase in difficulty from level 1 to 100"; chose everything getting harder
   together, one count from 1 to 100). Levels 1-40 stay exactly as they were.
   From 41 each level is harder than the one before, all the way: the settings
   stay at level 40's and e, how far past 40 a level is (0 to 1 at 100), pushes
   them on, never past what the marble can do (8 m/s, 18 m/s2 of grip): wider
   gaps between save rings, longer courses packed closer, narrower roads, less
   time on the timed pieces, stronger pulls, quicker traffic, more of
   everything, and a harder puzzle square at the end. 41-50 are the neon
   city's last district, the Skyline; 51-100 are Tokyo, in five districts. */
// Which of its courses each level past 40 plays: of 200 made from its seed, the one that keeps the climb steady, each
// scoring harder than the level before, and 41 harder than any level from 1 to 40 (hazards weighted by how hard they
// are to pass, narrow road, road between rings).
const LEVEL_VARIANT = {
  41: 52, 42: 196, 43: 146, 44: 1, 45: 20, 46: 78, 47: 23, 48: 60, 49: 106, 50: 50, 51: 148, 52: 111,
  53: 117, 54: 149, 55: 77, 56: 173, 57: 66, 58: 125, 59: 197, 60: 108, 61: 2, 62: 80, 63: 73, 64: 193,
  65: 64, 66: 75, 67: 81, 68: 7, 69: 7, 70: 72, 71: 83, 72: 23, 73: 185, 74: 196, 75: 177, 76: 156,
  77: 189, 78: 48, 79: 90, 80: 168, 81: 191, 82: 26, 83: 18, 84: 198, 85: 172, 86: 97, 87: 136, 88: 138,
  89: 141, 90: 155, 91: 197, 92: 88, 93: 47, 94: 157, 95: 121, 96: 102, 97: 33, 98: 46, 99: 6, 100: 117,
};
const DISTRICTS = ['Downtown', 'Transit', 'Holograms', 'Boost', 'Express', 'Skyline', 'Shibuya', 'Akihabara', 'Asakusa', 'Shinjuku', 'Tokyo Tower'];
function makeLevel(n, variant = LEVEL_VARIANT[n] || 0, test = null) {
  const r = seeded(9001 + n * 7919 + variant * 104729);
  const d = n <= 40 ? Math.floor((n - 1) / 8) : 5 + Math.floor((n - 41) / 10), k = n <= 40 ? ((n - 1) % 8) / 7 : 1;
  const g = Math.min(1, (n - 1) / 39), e = Math.max(0, (n - 40) / 60);   // past 40, the ladder climbs by e alone, so no level is easier than the last
  const W = (a, b) => mix(a, b, g);
  const wide = W(4, 2.2) - 0.45 * e, narrow = Math.max(1.3 - 0.12 * e, W(2.5, 1.4) - 0.25 * k - 0.12 * e);
  const saveEvery = W(15, 28) + 17 * e;
  const pieces = [F(0, 0, 5, 5)], gates = [];
  let x = 0, y = 0, z = -2.5, run = 0, sinceSave = 0;
  const on = (len) => { z -= len; run += len; sinceSave += len; };
  const r2 = (v) => Math.round(v * 100) / 100;
  function straight(len, w, ring = false) {
    pieces.push(F(x, z - len / 2, w, len, y));
    if ((ring || sinceSave >= saveEvery) && len >= 4) { gates.push([x, y, r2(z - len / 2)]); sinceSave = -len / 2; }
    on(len);
  }
  function jog(w) {                                     // a step sideways, two square turns
    let dx = (r() < 0.5 ? -1 : 1) * (2.5 + r() * 2.5);
    if (x + dx < -3 || x + dx > 9) dx = -dx;
    pieces.push(F(r2(x + dx / 2), z - w / 2, r2(Math.abs(dx) + w), w, y));
    x = r2(x + dx); on(w);
  }
  function ramp(w) {
    const len = r2(6 + r() * 2);
    let dy = (r() < 0.5 ? -1 : 1) * r2(1 + r());
    if (y + dy < -1.2 || y + dy > 2.4) dy = -dy;
    pieces.push(RAMP(x, z, z - len, w, y, r2(y + dy)));
    y = r2(y + dy); on(len);
  }
  // A moving pad waits at each end of its run for about a second and a half
  // early on, under one late; the runs between get quicker too.
  const dwell = r2(W(1.6, 0.9) - 0.1 * e), runT = W(2.4, 1.6) - 0.2 * e, period = r2(2 * dwell + 2 * runT);   // a wait under 0.8 s is a pad you cannot catch
  function slide() {                                    // a pad that carries you sideways, to a path further over
    const amp = r2(W(2.6, 3.4) + 0.6 * e);
    let dir = r() < 0.5 ? -1 : 1;
    if (x + 2 * amp * dir < -3 || x + 2 * amp * dir > 9) dir = -dir;
    pieces.push(FERRY(r2(x + amp * dir), z - 1.5, r2(Math.max(2.6, wide + 0.4)), 3, y, 'x', amp, period, dwell, r2(r() * 6.28)));
    x = r2(x + 2 * amp * dir); on(3);
    straight(r2(3 + r() * 2), wide);                    // somewhere to land
  }
  function shuttle() {                                  // a pad that carries you over a long gap
    const gap = r2(W(6, 10) + 3 * e), pad = 3;
    pieces.push(FERRY(x, z - gap / 2, r2(wide + 0.4), pad, y, 'z', r2((gap - pad) / 2), period, dwell, r2(r() * 6.28)));
    on(gap);
    straight(r2(3 + r() * 2), wide);
  }
  function bridge(w) {                                  // a hologram bridge: cross while it is lit
    const len = r2(W(4, 8) + 3 * e), lit = Math.max(len / 4.5 + 0.9 - 0.35 * e, mix(3.4, 1.9, g) - 0.35 * e), dark = mix(1.2, 2.2, g) + 0.8 * e;
    pieces.push(HOLO(x, z - len / 2, w, len, y, r2(lit + dark), r2(lit), r2(r() * (lit + dark))));
    on(len);
    straight(r2(3 + r() * 2), w);
  }
  function locks(times) {                               // the road forks into two lanes, a colour on each, then a wall of one
    const laneW = r2(Math.max(1.4, narrow)), off = r2(laneW / 2 + 0.5), L = r2(W(6, 8)), wideW = r2(2 * off + laneW);
    for (let k = 0; k < times; k++) {
      pieces.push(F(x, z - 1.5, wideW, 3, y)); on(3);
      const left = r() < 0.5 ? 1 : 2, col = r() < 0.5 ? 1 : 2;
      pieces.push({ ...F(r2(x - off), r2(z - L / 2), laneW, L, y), lane: left }, { ...F(r2(x + off), r2(z - L / 2), laneW, L, y), lane: 3 - left });
      pieces.push(CURTAIN(r2(x - off), r2(z - L / 2), laneW, y, left), CURTAIN(r2(x + off), r2(z - L / 2), laneW, y, 3 - left));
      on(L);
      pieces.push(F(x, z - 2.5, wideW, 5, y), LOCK(x, r2(z - 3.2), wideW, y, col));
      on(5);
    }
  }
  /* FORKS (owner, 2026-09-27: "What about having loop de loops, forks and
     wormholes"). The road splits in two and joins again: a narrow way straight
     through, quicker and harder (later with a bridge that switches off on it),
     and a wide way that swings out and back, longer and safer. The game keeps
     each level's best time, so the choice is worth making. */
  function fork() {
    const off = 3.2, len = r2(W(16, 20) + 4 * e), wideW = r2(Math.max(2.4, wide));
    const longLeft = x >= 3, xs = r2(x + (longLeft ? off : -off)), xl = r2(x + (longLeft ? -off : off));
    pieces.push(F(x, z - 1.5, r2(2 * off + wideW), 3, y)); on(3);             // where it splits
    const z0 = z;
    if (n >= 17 && r() < 0.6 + 0.3 * e) {                                    // the narrow way, with a bridge on it
      const a = r2(len * 0.3), b = r2(len * 0.4), c = r2(len - a - b);
      const lit = Math.max(b / 4.5 + 0.9 - 0.35 * e, mix(3.4, 1.9, g) - 0.35 * e), dark = mix(1.2, 2.2, g) + 0.8 * e;
      pieces.push({ ...F(xs, r2(z0 - a / 2), narrow, a, y), branch: 'short' },
                  { ...HOLO(xs, r2(z0 - a - b / 2), narrow, b, y, r2(lit + dark), r2(lit), r2(r() * (lit + dark))), branch: 'short' },
                  { ...F(xs, r2(z0 - a - b - c / 2), narrow, c, y), branch: 'short' });
    } else pieces.push({ ...F(xs, r2(z0 - len / 2), narrow, len, y), branch: 'short' });
    const out = longLeft ? -1 : 1, sw = r2(2.4 + r()), l1 = 2.5, mid = r2(len - 5 - 2 * wideW);   // the wide way swings out and back
    pieces.push({ ...F(xl, r2(z0 - l1 / 2), wideW, l1, y), branch: 'long' },
                { ...F(r2(xl + out * sw / 2), r2(z0 - l1 - wideW / 2), r2(sw + wideW), wideW, y), branch: 'long' },
                { ...F(r2(xl + out * sw), r2(z0 - l1 - wideW - mid / 2), wideW, mid, y), branch: 'long' },
                { ...F(r2(xl + out * sw / 2), r2(z0 - l1 - wideW - mid - wideW / 2), r2(sw + wideW), wideW, y), branch: 'long' },
                { ...F(xl, r2(z0 - len + l1 / 2), wideW, l1, y), branch: 'long' });
    on(len);
    pieces.push(F(x, z - 1.5, r2(2 * off + wideW), 3, y)); on(3);             // where it joins
  }
  /* LOOP-DE-LOOPS (owner, 2026-09-27). Yellow arrows, a short run, and a
     loop: fast enough and it carries the marble round; too slow and the
     marble falls back and can try again. */
  let loops = 0;
  function loopDeLoop() {
    loops++;
    const lw = 2.2, shift = r2((x < 3 ? 1 : -1) * 2.9);
    pieces.push(BOOST(x, z - 1.5, lw, 3, y)); on(3);
    straight(3, lw);
    pieces.push(LOOP(x, z, lw, y, shift));
    on(LOOP_RUN);
    x = r2(x + shift);
    straight(r2(9 + r() * 3), Math.min(wide, 2.6));
  }
  let worms = 0;
  function wormhole() {                                 // the road ends at a wormhole; past a gap, its twin
    worms++;
    straight(7, wide, true);                            // the approach, with a ring on it
    pieces.push(WORM(x, r2(z + 1.4), wide, y, 'in', makePocket(n)));
    on(14);                                             // nothing crosses this but the wormhole
    const zOut = r2(z - 1.4);
    straight(r2(8 + r() * 3), wide);
    pieces.push(WORM(x, zOut, wide, y, 'out'));
  }
  let rides = 0;
  function ride() {                                     // the sky train: on at one station, off at the next
    rides++;
    straight(6, wide, true);                            // the platform, with a ring on it
    const D = r2(W(18, 26) + 6 * e), gap = D + TRAIN_DECK, runT = W(3.8, 3.0) - 0.3 * e, dwellT = r2(W(3.8, 2.8) - 0.4 * e);
    pieces.push(TRAIN(x, r2(z - gap / 2), 1.8, y, r2(D / 2), r2(2 * dwellT + 2 * runT), dwellT, r2(r() * 6.28), r2(W(0.35, 0.8) + 0.08 * e)));
    on(gap);
    straight(r2(6 + r() * 3), wide);                    // the next station
  }
  function cross(w) {                                   // flying cars across the road, and a light to cross by
    const two = n >= 20 && r() < 0.35 + 0.4 * g + 0.25 * e;   // later, two lanes going opposite ways, and past 64 sometimes three
    const three = two && e > 0.4 && r() < 0.5;
    const d = three ? 5.2 : two ? 3.8 : 2.4, speed = r2(W(7, 11) + 3 * e + r());
    const lane = (dz, dir) => {
      const gaps = [];                                  // seconds between cars, uneven, so some gaps are worth waiting for
      for (let i = 3 + Math.floor(r() * 2); i > 0; i--) gaps.push(r2(W(3.4, 2.7) - 0.4 * e + r() * (W(2.6, 1.8) - 0.4 * e)));
      return { dz, dir, speed, gaps, phase: r2(r()) };
    };
    pieces.push(CROSS(x, z - d / 2, w, d, y, three ? [lane(-1.6, 1), lane(0, -1), lane(1.6, 1)] : two ? [lane(-0.8, 1), lane(0.8, -1)] : [lane(0, r() < 0.5 ? 1 : -1)]));
    on(d);
  }
  /* MAGLEV STRIPS (owner, 2026-09-27: "proceed on the next 4 blocks and
     obstacles"): road that pulls the marble toward one edge. Later, two
     strips in a row that pull opposite ways. */
  let magsN = 0, windsN = 0;
  function maglev(w) {
    const mw = r2(Math.max(w, 2)), pull = r2(W(6, 11) + 3 * e);
    let dir = r() < 0.5 ? -1 : 1;
    for (let i = n >= 25 && r() < 0.5 + 0.4 * e ? 2 : 1; i > 0; i--) {
      const len = r2(W(7, 10) + 3 * e + r() * 2);
      pieces.push(MAG(x, r2(z - len / 2), mw, len, y, r2(dir * pull)));
      on(len); dir = -dir;
    }
    straight(r2(3 + r() * 2), w);
  }
  /* WIND BETWEEN THE TOWERS: two towers stand beside the road with a gap
     between them, and gusts blow out of the gap across the road. Straight
     road before and after, where the towers stand. */
  function gusts(w) {
    const ww = r2(Math.max(w, 1.8)), len = r2(W(8, 11) + 3 * e + r() * 2), period = r2(W(4.4, 3.4) - 0.3 * e + r() * 0.8);
    straight(4.5, ww);
    pieces.push(WIND(x, r2(z - len / 2), ww, len, y, r() < 0.5 ? -1 : 1, r2(W(7, 12) + 2.5 * e), period, r2(W(1.8, 2.2)), r2(r() * period)));
    on(len);
    straight(r2(5 + r() * 2), ww);
  }
  /* THE ROUNDABOUT: in from the south; out to the west, north or east, where
     one road leads on and the others stop short. A road out to the side
     turns north again past the ring. The first one leads straight on. */
  let roundsN = 0;
  function roundabout() {
    roundsN++;
    const ew = r2(Math.max(2.2, narrow + 0.5)), ro = RB_RO, spin = r2(W(0.5, 0.8) + 0.25 * e);
    straight(4, ew);                                    // the road in (a ring on it, if one is due)
    const cx = x, cz = r2(z - ro), side = r2(ro + 1.5 + ew / 2);
    const leads = ['N'];                                // a road out to the side must stay over the city's clear lane
    if (cx - side >= -4) leads.push('W');
    if (cx + side <= 10) leads.push('E');
    const lead = n === 19 ? 'N' : leads[Math.floor(r() * leads.length)];
    pieces.push(ROUND(cx, cz, y, spin, ['W', 'N', 'E'], lead, ew));
    // Every road out starts under the ring's edge, a hair lower, so it meets the curve with no gap.
    const out = (dir, len, stub) => {
      const a = ro - 0.3, b = ro + len, m = (a + b) / 2;
      const q = dir === 'N' ? F(cx, r2(cz - m), ew, r2(b - a), r2(y - 0.004)) : F(r2(cx + (dir === 'E' ? m : -m)), cz, r2(b - a), ew, r2(y - 0.004));
      pieces.push({ ...q, spoke: true, ...(stub ? { stub: dir } : {}) });
    };
    pieces.push({ ...F(cx, r2(cz + ro - 0.15), ew, 0.3, r2(y - 0.004)), spoke: true });
    for (const dir of ['W', 'N', 'E']) if (dir !== lead) out(dir, 3.2, true);
    const L = lead === 'N' ? 2 * ro + 2.5 : ro + side + ew;              // about how far the marble rolls, round and out
    run += L; sinceSave += L;
    if (lead === 'N') { out('N', 2.5); z = r2(cz - ro - 2.5); }
    else { out(lead, r2(1.5 + ew)); x = r2(cx + (lead === 'E' ? side : -side)); z = r2(cz - ew / 2); }
    straight(r2((lead === 'N' ? 5 : 7) + r() * 2), ew); // on from the roundabout, clear of the road that stops short
  }
  /* POWER SWITCHES: a ring, a junction, a side road out to the switch, then a
     short run to the dark road. The side road heads toward the middle of the
     city and grows longer through the game. */
  let switchesN = 0;
  function powerSwitch() {
    const k = switchesN++, jw = r2(Math.max(wide, 2.4)), sw = r2(Math.max(narrow, 1.8));
    straight(4, jw, true);                              // a ring before the junction: a fall comes back here
    const side = x <= 3 ? 1 : -1, len = r2(W(4, 9) + 4 * e + r() * 2), zj = r2(z - jw / 2);
    pieces.push(F(x, zj, jw, jw, y));                   // the junction
    const a = r2(x + side * jw / 2), b = r2(a + side * len), px = r2(b + side * 1.3);
    pieces.push({ ...F(r2((a + b) / 2), zj, len, sw, y), detour: k }, { ...F(px, zj, 2.6, 2.6, y), detour: k });
    const run0 = 2.5, dl = r2(W(4, 7) + 3 * e), cz = r2(zj + sw / 2 - 0.28), ex = r2(x + side * (jw / 2 - 0.28));
    // The lamps: from the button along the near edge of the side road, then along the main road to the dark road.
    pieces.push(SWITCH(px, zj, y, k, x, zj, [[r2(px - side * 0.95), cz], [ex, cz], [ex, r2(z - jw - run0)]]));
    on(jw); run += 2 * (len + 1.3); sinceSave += 2 * (len + 1.3);
    straight(run0, jw);
    pieces.push({ ...F(x, r2(z - dl / 2), jw, dl, y), dark: k }); on(dl);
    straight(r2(4 + r() * 2), jw);
  }
  /* OBSTACLES: a run-in, a wider stretch with rows across it and one way
     through each, never straight on from the last, and a run-out. No ring
     inside a stretch. Gaps narrow and rows close up through the game.
     Bollards stand in gates; barriers leave their gap at alternate edges, so
     the way snakes; crates lie in rows, some stacked, with the gap anywhere. */
  let blocksN = 0;
  function obstacles(kind) {
    blocksN++;
    // Wide enough that every gap can sit clear of the middle line, so no way through is straight on.
    const gap = r2(kind === 'crate' ? W(1.7, 1.3) - 0.15 * e : W(1.6, 1.2) - 0.12 * e), ow = r2(Math.max(wide, 3.2, 2 * gap + 0.8)), half = ow / 2;
    const rows = 3 + Math.round(W(0, 2) + r()) + Math.round(3 * e), sp = r2(kind === 'crate' ? W(3.4, 2.9) - 0.45 * e : W(3.1, 2.5) - 0.35 * e);
    straight(3, ow);
    const L = r2(rows * sp + 1.2), z0 = z, path = [], points = [], blocks = [];
    let side = r() < 0.5 ? -1 : 1;
    for (let i = 0; i < rows; i++) {
      const rz = r2(z0 - 1.2 - i * sp);
      const gx = r2(kind === 'barrier' ? x + side * (half - gap / 2) : x + side * (gap / 2 + 0.1 + r() * Math.max(0, half - gap - 0.2)));
      side = -side;
      path.push([gx, r2(rz + 1)], [gx, r2(rz - 1)]);
      const a = gx - gap / 2, b = gx + gap / 2, lo = x - half, hi = x + half;
      if (kind === 'bollard') {                         // posts out from the gap each way, too close together to pass
        for (let px = a - POST_R; px >= lo + POST_R - 1e-6; px -= 0.62) points.push([r2(px), rz]);
        for (let px = b + POST_R; px <= hi - POST_R + 1e-6; px += 0.62) points.push([r2(px), rz]);
      } else if (kind === 'barrier') {                  // one barrier across the rest of the road
        const bw = r2(ow - gap), bx = r2(gx < x ? (b + hi) / 2 : (lo + a) / 2);
        blocks.push(BLOCK('barrier', bx, rz, bw, 0.34, 0.75, y));
      } else {                                          // crates out from the gap each way, a hand's width apart, some stacked
        for (const dir of [-1, 1]) {
          let at = dir < 0 ? a : b, first = true;
          for (;;) {
            const left = dir < 0 ? at - lo : hi - at;
            if (left < 0.5) break;
            const sz = r2(Math.min(0.78 + r() * 0.27, left)), cx = r2(at + dir * sz / 2), h1 = r2(sz * 0.92);
            blocks.push(BLOCK('crate', cx, r2(rz + (r() - 0.5) * 0.2), sz, sz, h1, y, first ? 0 : r2((r() - 0.5) * 0.24)));
            if (r() < 0.3) { const s2 = r2(sz * 0.82); blocks.push(BLOCK('crate', cx, rz, s2, s2, r2(s2 * 0.92), r2(y + h1), r2((r() - 0.5) * 0.5))); }
            at += dir * (sz + 0.06 + r() * 0.22); first = false;
          }
        }
      }
    }
    path.push([x, r2(z0 - L + 0.2)]);                     // back to the middle for the road on
    pieces.push({ ...F(x, r2(z0 - L / 2), ow, L, y), gauntlet: true }, GAUNTLET(kind, x, r2(z0 - L / 2), ow, L, y, path));
    if (points.length) pieces.push(POSTS(points, y, x, r2(z0 - L / 2), ow, L));
    pieces.push(...blocks);
    on(L);
    straight(r2(3 + r() * 2), ow);
  }
  /* SCANNER LASERS: a little road to wait on, the scanned stretch, and on.
     Later the stretch is longer, the bar quicker, and from level 35 some have
     two bars. */
  let scansN = 0;
  function scanner() {
    scansN++;
    // Every stretch leaves a fair window: with one bar, a side stays clear for over half its sweep; with two,
    // the middle clears between crossings, so those stretches are shorter and their sweep slower.
    const two = n >= 35 && (scansN === 1 || r() < 0.5 + 0.4 * e), sw = r2(Math.max(wide, 2.4));   // from 35, a level's first has two bars
    const d = r2(two ? W(3.6, 4.4) + 0.4 * e : W(4, 5.5) + 0.4 * e + r() * 0.8), period = r2(W(4, 3.2) - 0.15 * e + r() * 0.5 + (two ? 0.4 : 0));   // longer or quicker, and it cannot be run from a standing start
    straight(3, sw);
    pieces.push(SCAN(x, r2(z - d / 2), sw, d, y, period, r2(r() * period), two ? 2 : 1));
    on(d);
    straight(r2(3 + r() * 2), sw);
  }
  /* THE GLASS TUBE: the road ends at its mouth; it lands the marble on a long
     road ahead, over the gap. Its coil swings out toward the middle of the city. */
  let tubesN = 0;
  function glassTube() {
    tubesN++;
    straight(5, r2(Math.max(2.2, narrow + 0.4)));       // the road to the mouth (a ring on it, if one is due)
    const gap = r2(W(18, 24));
    pieces.push(TUBE(x, z, y, x < 3 ? 1 : -1, gap));
    run += gap + 28; sinceSave += gap + 28;             // the ride is longer than the gap it crosses
    z = r2(z - gap);
    straight(r2(10 + r() * 3), Math.max(wide, 2.6));    // somewhere to land
  }
  function boost(w) {                                   // a speed strip, and room to spend the speed
    pieces.push(BOOST(x, z - 1.5, w, 3, y)); on(3);
    straight(r2(14 + r() * 4), w);
  }
  function jump(w) {                                    // a jump pad, a gap, a long landing
    pieces.push(JUMP(x, z - 0.75, w, 1.5, y)); on(1.5);
    on(r2(mix(2.5, 3.5, k)));
    straight(r2(8 + r() * 3), Math.max(w, 2.2));
  }
  function boostJump(w) {
    pieces.push(BOOST(x, z - 1.5, w, 3, y)); on(3);
    straight(4, w);
    jump(w);
  }
  /* THE PUZZLE SQUARE before the finish (PLAZAS): the road in, with a ring on
     it and the square's reset pad on a bay beside it; a step sideways if the
     square would stand out past the city's clear lane; the square; a short
     road out to the finish. */
  function square(id) {
    const T = plazaLayout(id), W = T.cols * CELL, D = T.rows * CELL, rw = 2.4, iw = r2(Math.max(rw, Math.min(wide, 3)));
    straight(5, iw, true);                              // the road in, with a ring on it
    const bs = x > 3 ? -1 : 1, bx = r2(x + bs * (iw / 2 + 1.1)), bz = r2(z + 2.5);
    if (!T.ice && !T.cover && !T.twin) pieces.push({ ...F(bx, bz, 2.2, 2.2, y), bay: true }, { t: 'reset', x: bx, z: bz, y, w: 1.5, d: 1.5 });   // (ice, tiles, twins reset themselves)
    const x0 = r2(Math.min(14.5 - W, Math.max(-8.5, x - (T.entry + 0.5) * CELL))), ex = r2(x0 + (T.entry + 0.5) * CELL);
    if (Math.abs(ex - x) > 0.05) { pieces.push(F(r2((x + ex) / 2), r2(z - rw / 2), r2(Math.abs(ex - x) + rw), rw, y)); x = ex; on(rw); }
    straight(1.5, rw);
    pieces.push({ t: 'plaza', ...T, x: r2(x0 + W / 2), z: r2(z - D / 2), w: W, d: D, y, x0, z0: r2(z) });
    on(D); run += D;                                    // the way through a square is longer than the square
    x = r2(x0 + (T.exit + 0.5) * CELL);
    if (T.cover || T.twin) { pieces.push({ ...F(x, r2(z - 1.5), rw, 3, y), bridge: true }); on(3); }   // the bridge out: there once solved
    if (T.tune) {                                       // a ledge, a portal on it (open once the tune is played), the missing road, the far side
      straight(2.5, rw);
      const pz = r2(z + 0.9), gap = 7;
      on(gap);
      pieces.push({ t: 'portal', x, z: pz, y, w: 2.4, d: 0.3, to: [x, y, r2(z - 1.5)] });   // (w, d: its footprint, for what measures the course)
    }
    straight(2, rw);
  }
  // Every other feature is the district's own, so it carries the district;
  // the rest are what came before. The Express draws on everything.
  const ALL = ['bridge', 'slide', 'shuttle', 'boostJump', 'jump', 'jog', 'ramp', 'narrow', 'cross', 'ride', 'locks', 'wormhole', 'fork', 'loop'];
  const OWN = [['jog', 'ramp', 'narrow', 'ramp', 'cross'], ['slide', 'shuttle', 'ride', 'wormhole'], ['bridge', 'bridge', 'locks'], ['jump', 'boostJump', 'boost', 'loop'], ALL];
  const EARLIER = [['jog', 'narrow', 'fork'], ['jog', 'ramp', 'narrow', 'cross', 'fork'], ['jog', 'slide', 'shuttle', 'narrow', 'cross', 'wormhole', 'fork'],
                   ['bridge', 'slide', 'shuttle', 'jog', 'cross', 'locks', 'wormhole', 'fork'], ALL];
  // What a level opens with: its district's new thing, and a crossing where they begin.
  const OPENER = ['jog', 'slide', 'bridge', 'jump', 'boostJump'], opener = n === 5 ? 'cross' : n === 7 ? 'fork' : n === 11 ? 'wormhole' : n === 13 ? 'ride'
    : n === 3 ? 'bollards' : n === 6 ? 'switch' : n === 8 ? 'barriers' : n === 12 ? 'crates' : n === 15 ? 'mag' : n === 19 ? 'round' : n === 21 ? 'locks' : n === 23 ? 'wind' : n === 27 ? 'loop' : n === 29 ? 'tube' : n === 31 ? 'scan' : OPENER[d];
  // The newer challenges join the draw from the level that brings each in, so
  // the courses before it stay exactly as they were.
  if (n >= 3) { OWN[0].push('bollards'); EARLIER[1].push('bollards'); EARLIER[2].push('bollards'); EARLIER[3].push('bollards'); ALL.push('bollards'); }
  if (n >= 8) { OWN[0].push('barriers'); EARLIER[1].push('barriers'); EARLIER[2].push('barriers'); EARLIER[3].push('barriers'); ALL.push('barriers'); }
  if (n >= 12) { OWN[1].push('crates'); EARLIER[2].push('crates'); EARLIER[3].push('crates'); ALL.push('crates'); }
  if (n >= 6) { OWN[0].push('switch'); EARLIER[1].push('switch'); EARLIER[2].push('switch'); EARLIER[3].push('switch'); ALL.push('switch'); }
  if (n >= 15) { OWN[1].push('mag'); EARLIER[2].push('mag'); EARLIER[3].push('mag'); ALL.push('mag'); }
  if (n >= 19) { OWN[2].push('round'); EARLIER[3].push('round'); ALL.push('round'); }
  if (n >= 23) { OWN[2].push('wind'); EARLIER[3].push('wind'); ALL.push('wind'); }
  if (n >= 29) { OWN[3].push('tube'); ALL.push('tube'); }
  if (n >= 31) { OWN[3].push('scan'); ALL.push('scan', 'scan'); }      // the newest danger turns up often in the Express
  // Past 40, every district draws on everything, each with its favourites: the Skyline and Tokyo Tower all of it; Shibuya
  // its crossings and road works; Akihabara its lanes, walkways, screens and crates; Asakusa its bridges and gates;
  // Shinjuku its wind, loops, screens and rides.
  OWN.push(ALL, ['cross', 'barriers', 'bollards', 'round', 'switch', 'cross'], ['locks', 'mag', 'scan', 'crates', 'slide'],
           ['bridge', 'wormhole', 'round', 'bollards', 'fork', 'bridge'], ['wind', 'loop', 'scan', 'boostJump', 'ride', 'wind', 'bridge', 'tube'], ALL);
  while (EARLIER.length < OWN.length) EARLIER.push(ALL);
  const features = n <= 40 ? 2 + Math.round(k * 2) + d : 8 + Math.round(7 * e), length = 45 + 155 * g + 190 * e;
  if (test) {                                           // a course to try a new puzzle on (#try-ice): its puzzles in turn, easy to hard
    straight(8, wide);
    for (const id of TRY_COURSES[test]) { square(id); straight(8, wide); }
    pieces.push(F(x, z - 3.5, 6, 7, y));
    return { start: [0, 0, 1], gates, goal: [x, y, r2(z - 4)], pieces, district: DISTRICTS[d], length: Math.round(run + 7), test, title: TRY_TITLES[test],
             star: Math.round((run + 7) / 1.6) };
  }
  straight(5, wide);
  for (let f = 0; f < features + 8 && (f < features || run < length); f++) {
    const pool = f % 2 ? EARLIER[d] : OWN[d];
    const pick = f === 0 ? (n > 40 ? OWN[d][n % OWN[d].length] : opener) : pool[Math.floor(r() * pool.length)];
    const w = r() < 0.3 + 0.35 * k + 0.2 * e ? narrow : wide;
    if (pick === 'ramp' && n >= 3) ramp(w);
    else if (pick === 'narrow' && n >= 4) straight(r2(W(6, 12) + r() * 2), narrow);
    else if (pick === 'slide') slide();
    else if (pick === 'shuttle') shuttle();
    else if (pick === 'bridge') bridge(w);
    else if (pick === 'boost') boost(wide);
    else if (pick === 'jump') jump(wide);
    else if (pick === 'boostJump') boostJump(wide);
    else if (pick === 'cross' && n >= 5) cross(w);
    else if (pick === 'ride') { if (n >= 13 && rides < 1 + (e > 0.6 ? 1 : 0)) ride(); else shuttle(); }
    else if (pick === 'locks') { if (n >= 21) locks(n >= 33 && r() < 0.5 + 0.3 * e ? (e > 0.5 && r() < 0.5 ? 3 : 2) : 1); else bridge(w); }
    else if (pick === 'wormhole') { if (n >= 11 && !worms) wormhole(); else jog(w); }
    else if (pick === 'fork') { if (n >= 7) fork(); else jog(w); }
    else if (pick === 'loop') { if (n >= 27 && loops < 2 + (e > 0.5 ? 1 : 0)) loopDeLoop(); else boostJump(wide); }
    else if (pick === 'mag') { if (magsN++ < 2 + (e > 0.4 ? 1 : 0)) maglev(w); else jog(w); }
    else if (pick === 'wind') { if (windsN++ < 2 + (e > 0.4 ? 1 : 0)) gusts(w); else jog(w); }
    else if (pick === 'round') { if (roundsN < 1 + (e > 0.5 ? 1 : 0)) roundabout(); else jog(w); }
    else if (pick === 'tube') { if (!tubesN) glassTube(); else boost(wide); }
    else if (pick === 'switch') { if (switchesN < 1 + (e > 0.3 ? 1 : 0)) powerSwitch(); else jog(w); }
    else if (pick === 'scan') { if (scansN < 2 + Math.round(2 * e)) scanner(); else jog(w); }
    else if (pick === 'bollards' || pick === 'barriers' || pick === 'crates') { if (blocksN < 2 + Math.round(2 * e)) obstacles(pick.slice(0, -1)); else jog(w); }
    else jog(w);
    straight(r2(mix(6, 4, g) - 1.5 * e + r() * (3 - 1.2 * e)), r() < 0.5 ? wide : narrow);
  }
  if (PLAZA_AT[n]) square(PLAZA_AT[n]);
  pieces.push(F(x, z - 3.5, 6, 7, y));                  // the finish, and the orange ring on it
  return { start: [0, 0, 1], gates, goal: [x, y, r2(z - 4)], pieces, district: DISTRICTS[d], length: Math.round(run + 7) };
}
const LEVELS = Array.from({ length: 100 }, (_, i) => makeLevel(i + 1));
/* TIME STARS (owner, 2026-09-27: "let's do the 3 you suggest"). Each level has
   a star time: finish under it and the level's star is yours. Each was set by
   the autopilot racing the course, quick and clean with no falls, by the
   quicker way at a fork, plus 6% (at least a second), rounded up to a whole
   second, and never more than half a second under its careful run, so the
   autopilot playing carefully earns none of them. The courses come
   from their seeds, so these hold until a course changes; then they must be
   raced again. In a puzzle square the autopilot takes the shortest way the
   search finds, so a star there is for a square you have already worked
   out. (Raced again 2026-09-27, when every level from 2 gained its square;
   41-100 raced 2026-09-28.) */
const STAR_TIMES = [23, 45, 41, 48, 64, 58, 68, 77, 48, 71, 95, 74, 112, 77, 70, 105, 92, 59, 59, 113,
                    95, 107, 70, 97, 60, 59, 67, 72, 82, 62, 55, 58, 102, 104, 60, 136, 86, 92, 139, 94,
                    95, 112, 89, 105, 110, 173, 87, 150, 164, 116, 133, 131, 113, 115, 193, 144, 125, 111, 196, 107,
                    117, 120, 137, 130, 150, 132, 141, 127, 145, 124, 208, 219, 236, 208, 169, 198, 225, 191, 215, 151,
                    165, 169, 129, 162, 160, 151, 171, 160, 177, 208, 187, 149, 217, 240, 245, 167, 214, 181, 269, 249];

let levelGroup = null;
let colliders = [], ferries = [], holos = [], pads = [], crossings = [], riders = [], curtains = [], locks = [], wormholes = [], loopsIn = [], mags = [], winds = [], rounds = [], tubes = [], switches = [], scans = [], posts = [], blinkers = [], flames = [], cracks = [], plazas = [], gates = [], goal = null, level = null;

/* A slab: a rounded box, drawn in two calls rather than six. The box keeps
   each face as its own run of vertices (+x, -x, +y, -y, +z, -z); the top's run
   moves to the end, and the other five become one run in the sides' material
   (the underside is never seen from above). A phone pays for every draw call,
   and the course is made of slabs: this took about two thirds of the calls. */
function platformGeometry(w, h, d) {
  const g = new RoundedBoxGeometry(w, h, d, 3, Math.min(0.14, h / 2 - 0.01));
  const top = g.groups[2], n = g.attributes.position.count, order = [];
  for (let i = 0; i < n; i++) if (i < top.start || i >= top.start + top.count) order.push(i);
  for (let i = top.start; i < top.start + top.count; i++) order.push(i);
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.attributes[name], k = a.itemSize, src = a.array, dst = new src.constructor(src.length);
    order.forEach((from, to) => { for (let j = 0; j < k; j++) dst[to * k + j] = src[from * k + j]; });
    a.array.set(dst);
  }
  g.clearGroups();
  g.addGroup(0, n - top.count, 0);                        // sides and underside: material 0 (a side)
  g.addGroup(n - top.count, top.count, 2);                // the top: material 2
  g.userData.top = g.groups[1];
  // The top takes world-scale UVs, one tile to a metre, so a long plank and a
  // square pad show the same tile.
  const pos = g.attributes.position, uv = g.attributes.uv, tg = g.userData.top;
  for (let i = tg.start; i < tg.start + tg.count; i++) uv.setXY(i, pos.getX(i) / 2, pos.getZ(i) / 2);
  uv.needsUpdate = true;
  return g;
}
const topGroup = (g) => g.userData.top || g.groups[2];   // a slab's top face, however its faces are grouped

/* THE PIECES THAT ACT ON THE MARBLE show what they do before they do it. A
   hologram bridge is see-through, flickers just before it switches off, and
   leaves a faint ghost of itself while it is dark, brightening as it comes
   back. A speed strip carries yellow arrows running the way it throws you. A
   jump pad pulses yellow rings. Yellow belongs to these two alone. */
const PAD_YELLOW = 0xFFD23F;
const glowMat = (color, opacity, map) => new MeshBasicMaterial({ color, map: map || null, transparent: true, opacity,
  blending: AdditiveBlending, depthWrite: false, toneMapped: false });
const holoTex = canvasTex(256, 256, (g) => {
  g.fillStyle = 'rgb(70,14,60)'; g.fillRect(0, 0, 256, 256);          // added to what is behind, so dark is clear
  g.fillStyle = 'rgba(255,120,230,0.35)';
  for (let y = 0; y < 256; y += 8) g.fillRect(0, y, 256, 2);            // scan lines
  g.filter = 'blur(6px)'; g.fillStyle = 'rgba(255,60,210,0.9)';
  for (const p of [0, 128, 256]) { g.fillRect(0, p - 6, 256, 12); g.fillRect(p - 6, 0, 12, 256); }
  g.filter = 'none'; g.fillStyle = '#FFE6FA';
  for (const p of [0, 128, 256]) { g.fillRect(0, p - 1.5, 256, 3); g.fillRect(p - 1.5, 0, 3, 256); }
}, true);
const arrowTex = canvasTex(128, 128, (g) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.filter = 'blur(5px)'; g.strokeStyle = 'rgba(255,190,40,0.9)'; g.lineWidth = 22;
  g.beginPath(); g.moveTo(22, 92); g.lineTo(64, 42); g.lineTo(106, 92); g.stroke();
  g.filter = 'none'; g.strokeStyle = '#FFF4C2'; g.lineWidth = 9;
  g.beginPath(); g.moveTo(22, 92); g.lineTo(64, 42); g.lineTo(106, 92); g.stroke();   // points up the canvas, which is on along -z
}, true);
const holoState = (h, t) => {                           // lit or dark at time t, and how far into it
  const u = ((t + h.phase) % h.period + h.period) % h.period;
  return u < h.on ? { lit: true, t: u, left: h.on - u } : { lit: false, t: u - h.on, left: h.period - u };
};
function dressPiece(c, pc, w, d) {
  if (pc.t === 'holo') {
    c.holo = { period: pc.period, on: pc.on, phase: pc.phase };
    c.holoMats = [glowMat(0xFF3FD0, 0.5), glowMat(0xFFFFFF, 1, holoTex), glowMat(0xFF3FD0, 0.2), glowMat(0xFFD6F6, 1)];
    c.mesh.castShadow = false;
    for (const sx of [-1, 1]) {                         // a bright line down each edge, so its width is plain
      const edge = new Mesh(new PlaneGeometry(0.07, d), c.holoMats[3]);
      edge.rotation.x = -Math.PI / 2; edge.position.set(sx * (w / 2 - 0.05), c.half.y + 0.012, 0);
      c.mesh.add(edge);
    }
    holos.push(c);
  } else if (pc.t === 'boost' || pc.t === 'jump') {
    c.pad = pc.t;
    const top = c.half.y + 0.012;
    if (pc.t === 'boost') {
      const t = arrowTex.clone();
      t.repeat.set(Math.max(1, Math.round((w - 0.3) / 1.4)), (d - 0.3) / 1.1);
      const deco = new Mesh(new PlaneGeometry(w - 0.3, d - 0.3), glowMat(0xFFFFFF, 1, t));
      deco.rotation.x = -Math.PI / 2; deco.position.y = top;
      c.mesh.add(deco); c.padFx = { tex: t };
    } else {
      const rings = [0, 1, 2].map(() => {
        const m = new Mesh(new RingGeometry(0.86, 1, 48), glowMat(PAD_YELLOW, 1));
        m.rotation.x = -Math.PI / 2; m.position.y = top; c.mesh.add(m); return m;
      });
      const core = new Mesh(new CircleGeometry(0.2, 32), glowMat(0xFFF4C2, 1));
      core.rotation.x = -Math.PI / 2; core.position.y = top; c.mesh.add(core);
      c.padFx = { rings, R: Math.min(w, d) / 2 - 0.08 };
    }
    pads.push(c);
  } else if (pc.t === 'cross') buildCrossing(c, pc, w, d);
  else if (pc.t === 'mag') buildMag(c, pc, w, d);
  else if (pc.t === 'wind') buildWind(c, pc, w, d);
  else if (pc.t === 'scan') buildScan(c, pc, w, d);
  else if (pc.t === 'flames') buildFlames(c, pc, w, d);
  else if (pc.t === 'train') buildRide(c, pc, w, d);
}
// BoxGeometry's face order: +x, -x, +y (top), -y, +z, -z.
function holoFaces(c) { const [side, top, under] = c.holoMats; c.mesh.material = [side, side, top, under, side, side]; }
// What each special piece does on screen, every frame.
function animatePieces(dt) {
  for (const c of holos) {
    const s = holoState(c.holo, simT);
    let k;
    if (s.lit) k = REDUCED ? 1 : s.left < 0.6 ? (Math.floor(s.left * 16) % 2 ? 0.2 : 1) : Math.min(1, s.t / 0.12);
    else k = 0.16 + 0.16 * s.t / (c.holo.period - c.holo.on);
    const [side, top, under, edge] = c.holoMats;
    top.opacity = k; side.opacity = 0.5 * k; under.opacity = 0.2 * k; edge.opacity = Math.min(1, k * 1.15);
  }
  for (const c of pads) {
    if (c.pad === 'boost') { if (!REDUCED) c.padFx.tex.offset.y -= dt * 1.6; continue; }
    c.padFx.rings.forEach((m, i) => {
      const p = REDUCED ? 0.6 : ((simT * 0.9 + i / 3) % 1);          // three rings, each spreading outward and fading
      m.scale.setScalar(c.padFx.R * (0.25 + 0.75 * p));
      m.material.opacity = REDUCED ? 0.8 : Math.sin(Math.PI * p);
    });
  }
}

/* MAGLEV STRIPS (owner, 2026-09-27: "proceed on the next 4 blocks and
   obstacles"). A strip of road with the train's maglev in it: cyan field lines
   run across it the way it pulls, and the edge it pulls toward glows. On it
   the marble is pulled sideways; hold the stick against the pull. */
const magTex = canvasTex(128, 128, (g) => {              // chevrons pointing up the canvas, turned to point across the road
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.filter = 'blur(5px)'; g.strokeStyle = 'rgba(60,220,255,0.85)'; g.lineWidth = 16;
  g.beginPath(); g.moveTo(28, 86); g.lineTo(64, 50); g.lineTo(100, 86); g.stroke();
  g.filter = 'none'; g.strokeStyle = '#E8FCFF'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(28, 86); g.lineTo(64, 50); g.lineTo(100, 86); g.stroke();
}, true);
function buildMag(c, pc, w, d) {
  c.mag = pc.pull;
  const t = magTex.clone();
  t.repeat.set(Math.max(1, Math.round((d - 0.3) / 1.6)), Math.max(2, Math.round((w - 0.3) / 0.9)));
  const deco = new Mesh(new PlaneGeometry(d - 0.3, w - 0.3), glowMat(0xFFFFFF, 0.95, t));
  deco.rotation.set(-Math.PI / 2, 0, pc.pull > 0 ? -Math.PI / 2 : Math.PI / 2);   // arrows point the way it pulls
  deco.position.y = c.half.y + 0.012;
  c.mesh.add(deco);
  const edge = new Mesh(new BoxGeometry(0.1, 0.06, d), new MeshBasicMaterial({ color: 0x5FE8FF, toneMapped: false }));
  edge.position.set(Math.sign(pc.pull) * (w / 2 - 0.05), c.half.y + 0.03, 0);
  c.mesh.add(edge);
  c.magFx = { tex: t };
  mags.push(c);
}
/* WIND BETWEEN THE TOWERS. Gusts blow across a stretch of road: streaks of
   light stream across it the way the wind blows, faint just before a gust and
   strong through it; between gusts the air is still. In a gust the marble is
   pushed across, in the air too; wait for a lull, or lean into it. */
const WIND_RAMP = 0.45, WIND_WARN = 0.8;
function windState(W, t) {                              // how hard it blows now (0 to 1), and how close a gust is (for the streaks)
  const u = (((t + W.phase) % W.period) + W.period) % W.period, sm = (v) => v * v * (3 - 2 * v);
  let k = 0;
  if (u < W.gust) k = u < WIND_RAMP ? sm(u / WIND_RAMP) : u > W.gust - WIND_RAMP ? sm((W.gust - u) / WIND_RAMP) : 1;
  const warn = u > W.period - WIND_WARN ? (u - (W.period - WIND_WARN)) / WIND_WARN : 0;
  return { k, show: Math.max(k, 0.3 * warn) };
}
const streakTex = canvasTex(256, 32, (g) => {            // a streak of air: a bright head, a tail that fades behind it
  const lg = g.createLinearGradient(0, 0, 256, 0);
  lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.55, 'rgba(255,255,255,0.5)'); lg.addColorStop(0.97, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = lg;
  g.filter = 'blur(5px)'; g.globalAlpha = 0.55; g.fillRect(6, 10, 244, 12);     // a tight feather
  g.filter = 'none'; g.globalAlpha = 1; g.fillRect(8, 14.5, 242, 3);            // and a thin bright core
});
let windStripes = null;                                 // the towers' lit floors, made once
const TOWER_W = 3.4, TOWER_D = 3.4, TOWER_UP = 13, TOWER_OFF = 8.5;
function buildWind(c, pc, w, d) {
  // Two towers on the side the wind comes from, one at each end of the gap.
  if (!windStripes) { windStripes = stripeTex(); windStripes.wrapS = windStripes.wrapT = RepeatWrapping; windStripes.repeat.set(1, 3); }   // floors a third as tall as the city's: a slim, tall tower
  const face = new MeshStandardMaterial({ color: 0x0B1020, roughness: 0.6, emissive: 0xFF6A3C, emissiveMap: windStripes, emissiveIntensity: 1.3 });
  const tx = pc.x - pc.dir * (w / 2 + TOWER_OFF + TOWER_W / 2), H = TOWER_UP + 70, towers = [];
  for (const tz of [pc.z + d / 2 + TOWER_D / 2, pc.z - d / 2 - TOWER_D / 2]) {
    const t = new Mesh(new BoxGeometry(TOWER_W, H, TOWER_D), face);
    t.position.set(tx, pc.y + TOWER_UP - H / 2, tz);
    levelGroup.add(t);
    const lamp = new Mesh(new SphereGeometry(0.3, 10, 8), new MeshBasicMaterial({ color: 0xFF2D48, toneMapped: false }));
    lamp.position.set(tx, pc.y + TOWER_UP + 0.3, tz);
    levelGroup.add(lamp); towers.push(t, lamp);
  }
  const n = 64, streaks = new InstancedMesh(new PlaneGeometry(1, 0.2), glowMat(0xE4F8FF, 0, streakTex), n);
  streaks.material.side = DoubleSide;
  // The streaks stream out of the gap, across the road and on over the city.
  const from = tx + pc.dir * TOWER_W / 2, to = pc.x + pc.dir * (w / 2 + 7);
  const Wd = { dir: pc.dir, force: pc.force, period: pc.period, gust: pc.gust, phase: pc.phase,
               x: pc.x, z: pc.z, w, d, y: pc.y, span: w + 8, from, to, streaks, bits: [], towers };
  const r = seeded(1 + Math.abs(Math.round(pc.z * 13 + pc.x * 7)));      // a seed must be positive
  for (let i = 0; i < n; i++) Wd.bits.push({ s: r(), z: pc.z + (r() - 0.5) * (d - 0.6), y: pc.y + 0.15 + r() * r() * 2.4, len: 2 + r() * 2.5, v: 0.8 + r() * 0.5 });
  streaks.frustumCulled = false;
  levelGroup.add(streaks);
  winds.push(Wd);
}
function windPush(W) {                                  // the push on the marble here and now, in m/s² along x
  if (Math.abs(ball.p.z - W.z) > W.d / 2 + 0.3 || Math.abs(ball.p.x - W.x) > W.span / 2 || ball.p.y < W.y - 1 || ball.p.y > W.y + 4) return 0;
  return W.dir * W.force * windState(W, simT).k;
}
function animateMagsAndWinds(dt) {
  for (const c of mags) if (!REDUCED) c.magFx.tex.offset.y -= dt * 1.2;          // the chevrons flow the way it pulls
  const o = new Object3D();
  for (const W of winds) {
    const st = windState(W, simT), m = W.streaks;
    m.material.opacity = st.show;
    W.bits.forEach((b, i) => {
      if (!REDUCED) b.s = (b.s + dt * b.v * (0.3 + 1.7 * st.show) * 18 / Math.abs(W.to - W.from)) % 1;   // about 18 m/s in a gust
      o.position.set(W.from + (W.to - W.from) * b.s, b.y, b.z);
      // Each streak grows in and dies away across the gap, and points the way it blows.
      o.rotation.set(0, 0, 0); o.scale.set(W.dir * b.len * (0.4 + 0.8 * st.show) * Math.sin(Math.PI * b.s), 1, 1);
      o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }
}

/* THE ROUNDABOUT (owner, 2026-09-27: "proceed on the next 4 blocks and
   obstacles"). A ring road turns round a glowing island, clockwise seen from
   above, and carries the marble round with it, pushing it gently outward.
   Roads leave it on three sides; one leads on and the others stop short at
   a red bar. Ride it round and roll off at the right moment: the ring keeps
   carrying the marble sideways as it goes. */
let polarTex = null;                                    // the ring's grid: circles and spokes, the course's magenta
function ringGrid() {
  if (polarTex) return polarTex;
  polarTex = canvasTex(1024, 1024, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 1024);
    const px = 512 / RB_RO, lines = (wd, col) => {
      g.strokeStyle = col; g.lineWidth = wd;
      for (let i = 0; i <= 3; i++) { g.beginPath(); g.arc(512, 512, (RB_RI + (RB_RO - RB_RI) * i / 3) * px - (i === 3 ? wd / 2 : 0), 0, 2 * Math.PI); g.stroke(); }
      for (let i = 0; i < 20; i++) {
        const a = i * Math.PI / 10, c = Math.cos(a), s = Math.sin(a);
        g.beginPath(); g.moveTo(512 + c * RB_RI * px, 512 + s * RB_RI * px); g.lineTo(512 + c * RB_RO * px, 512 + s * RB_RO * px); g.stroke();
      }
    };
    g.filter = 'blur(7px)'; lines(11, 'rgba(255,60,210,0.95)'); g.filter = 'none';
    lines(3, '#FFFFFF');
  });
  polarTex.anisotropy = 4;
  return polarTex;
}
function buildRound(pc) {
  const { x, z, y, ri, ro } = pc;
  const spinGrp = new Group(), fixed = new Group();
  spinGrp.position.set(x, y, z); fixed.position.set(x, y, z);
  const top = new Mesh(new RingGeometry(ri, ro, 96, 1), new MeshStandardMaterial({ color: 0x0A0F1E, metalness: 0.4, roughness: 0.3,
    emissive: 0xFFFFFF, emissiveMap: ringGrid(), emissiveIntensity: 1.5 }));
  top.rotation.x = -Math.PI / 2; top.receiveShadow = true;
  const rim = new Mesh(new CylinderGeometry(ro, ro, THICK, 96, 1, true), new MeshStandardMaterial({ color: 0x140A24, metalness: 0.5, roughness: 0.3,
    emissive: 0xFF3FD0, emissiveIntensity: 0.3 }));
  rim.position.y = -THICK / 2;
  const under = new Mesh(new RingGeometry(ri, ro, 96, 1), new MeshStandardMaterial({ color: 0x080C16, roughness: 1 }));
  under.rotation.x = Math.PI / 2; under.position.y = -THICK;
  // Lights round the rim, turning with it, so the turn shows from behind.
  const lamps = new InstancedMesh(new BoxGeometry(0.34, 0.07, 0.05), new MeshBasicMaterial({ color: 0xFFE6FA, toneMapped: false }), 24);
  const o = new Object3D();
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12;
    o.position.set(Math.cos(a) * (ro + 0.026), -0.12, Math.sin(a) * (ro + 0.026)); o.rotation.set(0, -a + Math.PI / 2, 0);
    o.updateMatrix(); lamps.setMatrixAt(i, o.matrix);
  }
  spinGrp.add(top, rim, under, lamps);
  // The island: dark glass with a cyan rim, and above it a slow gyroscope of light.
  const island = new Mesh(new CylinderGeometry(ri - 0.02, ri - 0.02, THICK + ISLAND_H, 64), new MeshStandardMaterial({ color: 0x0C1426, metalness: 0.6,
    roughness: 0.25, envMap: neonEnvMap() || envTex, emissive: 0x34E0FF, emissiveIntensity: 0.08 }));
  island.position.y = (ISLAND_H - THICK) / 2; island.castShadow = true;
  const lip = new Mesh(new TorusGeometry(ri - 0.06, 0.045, 8, 96), new MeshBasicMaterial({ color: 0x5FE8FF, toneMapped: false }));
  lip.rotation.x = Math.PI / 2; lip.position.y = ISLAND_H;
  const glow = new Mesh(new CircleGeometry(ri - 0.1, 64), glowMat(0x34E0FF, 0.22, dot));
  glow.rotation.x = -Math.PI / 2; glow.position.y = ISLAND_H + 0.01;
  const gyro = new Group(), rings = [[0.95, 0xFF8A5C, 0], [0.72, 0x5FF0FF, 1.1], [0.5, 0xFFD6F4, 2.2]].map(([rad, col, tilt]) => {
    const m = new Mesh(new TorusGeometry(rad, 0.03, 8, 72), new MeshBasicMaterial({ color: col, toneMapped: false }));
    m.rotation.set(Math.PI / 2 + tilt * 0.5, tilt, 0); gyro.add(m); return m;
  });
  const core = new Mesh(new SphereGeometry(0.16, 20, 14), new MeshBasicMaterial({ color: 0xFFF4E8, toneMapped: false }));
  gyro.add(core); gyro.position.y = ISLAND_H + 0.95;
  fixed.add(island, lip, glow, gyro);
  levelGroup.add(spinGrp, fixed);
  rounds.push({ pc, x, z, y, ri, ro, spin: pc.spin, spinGrp, gyro, rings });
}
// The marble against a roundabout: the island's wall, top edge and top, then
// the ring's top and outer edge. Both are checked every step, so a marble
// pressed against the island still rides the ring.
const _rn = new Vector3();
function roundPush(pen, onRing, Rd) {
  ball.p.addScaledVector(_rn, pen);
  const floor = _rn.y > 0.55, rel = ball.v.dot(_rn);
  if (rel < 0) {
    ball.v.addScaledVector(_rn, -(1 + (floor ? (rel < -7 ? 0.25 : 0) : 0.35)) * rel);
    if (floor && rel < -4 && ball.airT > 0.12) { play('land'); shake = Math.max(shake, 0.12); }
    else if (!floor && rel < -3) play('tick');
  }
  if (floor) { ball.grounded = true; if (onRing) ball.onRound = Rd; }
}
function roundContact(Rd) {
  let dx = ball.p.x - Rd.x, dz = ball.p.z - Rd.z, r = Math.hypot(dx, dz) || 1e-6;
  if (r > Rd.ro + R + 0.05 || ball.p.y > Rd.y + ISLAND_H + R + 0.1 || ball.p.y < Rd.y - THICK - R) return;
  if (r < Rd.ri + R && ball.p.y < Rd.y + ISLAND_H + R) {                          // the island
    const ux = dx / r, uz = dz / r;
    let pen = 0;
    if (r < Rd.ri && ball.p.y - R > Rd.y + ISLAND_H - 0.25) { _rn.set(0, 1, 0); pen = Rd.y + ISLAND_H + R - ball.p.y; }   // on its top
    else if (ball.p.y > Rd.y + ISLAND_H) {                                        // its top edge
      _rn.set(dx - ux * Rd.ri, ball.p.y - Rd.y - ISLAND_H, dz - uz * Rd.ri); const d = _rn.length();
      if (d < R && d > 1e-6) { _rn.multiplyScalar(1 / d); pen = R - d; }
    } else { _rn.set(ux, 0, uz); pen = Rd.ri + R - r; }                            // its wall
    if (pen > 0) {
      roundPush(pen, false, Rd);
      dx = ball.p.x - Rd.x; dz = ball.p.z - Rd.z; r = Math.hypot(dx, dz) || 1e-6;
    }
  }
  if (r >= Rd.ri && r <= Rd.ro) {                                                 // the ring's top
    if (ball.p.y - Rd.y < R && ball.p.y - Rd.y > -0.3) { _rn.set(0, 1, 0); roundPush(Rd.y + R - ball.p.y, true, Rd); }
  } else if (r > Rd.ro) {                                                         // its outer edge
    const ux = dx / r, uz = dz / r, ey = clamp(ball.p.y, Rd.y - THICK, Rd.y);
    _rn.set(dx - ux * Rd.ro, ball.p.y - ey, dz - uz * Rd.ro); const d = _rn.length();
    if (d < R && d > 1e-6) { _rn.multiplyScalar(1 / d); roundPush(R - d, _rn.y > 0.55, Rd); }
  }
}
function animateRounds(dt) {
  for (const Rd of rounds) {
    Rd.spinGrp.rotation.y = -Rd.spin * simT;
    if (!REDUCED) { Rd.gyro.rotation.y += dt * 0.5; Rd.rings.forEach((m, i) => { m.rotation.z += dt * (0.4 + 0.3 * i) * (i % 2 ? -1 : 1); }); }
  }
}

/* POWER SWITCHES (owner, 2026-09-27: "let's do the 3 you suggest"). The road
   ahead is dark: its grid is out but for a fitful flicker, and a dark road
   cannot be crossed. A line of unlit lamps runs from it, back along the road
   and down a side road, to a switch: a round button with the power sign on
   it, its ring pulsing. Roll over the button and the lamps light one after
   another, back to the dark road, which flickers on and holds. */
const powerGlyph = canvasTex(128, 128, (g) => {          // the power sign: a ring open at the top, a bar through the gap
  const draw = () => {
    g.beginPath(); g.arc(64, 68, 34, -Math.PI / 2 + 0.62, 1.5 * Math.PI - 0.62); g.stroke();
    g.beginPath(); g.moveTo(64, 20); g.lineTo(64, 62); g.stroke();
  };
  g.lineCap = 'round';
  g.filter = 'blur(6px)'; g.strokeStyle = 'rgba(255,120,230,0.9)'; g.lineWidth = 22; draw();
  g.filter = 'none'; g.strokeStyle = '#FFFFFF'; g.lineWidth = 9; draw();
});
const DOT_OFF = new Color(0x62557E), DOT_ON = new Color(0xFFD6F4), PULSE_V = 14;
function buildSwitch(pc) {
  const grp = new Group(); grp.position.set(pc.x, pc.y, pc.z);
  const base = new Mesh(new CylinderGeometry(0.78, 0.84, 0.05, 48), new MeshStandardMaterial({ color: 0x151A2A, metalness: 0.7, roughness: 0.3,
    envMap: neonEnvMap() || envTex }));
  base.position.y = 0.025; base.receiveShadow = true;
  const faceMat = glowMat(0xFFFFFF, 0.7, powerGlyph), face = new Mesh(new CircleGeometry(0.62, 48), faceMat);
  face.rotation.x = -Math.PI / 2; face.position.y = 0.052;
  const ringMat = new MeshBasicMaterial({ color: 0xFF7FE6, toneMapped: false, transparent: true, opacity: 0.8 });
  const ring = new Mesh(new TorusGeometry(0.76, 0.035, 8, 64), ringMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.055;
  const halo = new Mesh(new CircleGeometry(1.3, 48), glowMat(0xFF3FD0, 0.25, dot));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.012;
  grp.add(base, face, ring, halo);
  levelGroup.add(grp);
  // The lamps along the cable, a hand's width in from the road's edge.
  const pts = pc.cable, lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = lens[lens.length - 1], n = Math.max(2, Math.floor(L / 0.55)), dots = new InstancedMesh(new BoxGeometry(0.13, 0.035, 0.13),
    new MeshBasicMaterial({ color: 0xFFFFFF, toneMapped: false }), n), o = new Object3D(), at = [];
  for (let i = 0; i < n; i++) {
    const sI = (i + 0.5) * L / n;
    let k = 1; while (k < lens.length - 1 && lens[k] < sI) k++;
    const f = (sI - lens[k - 1]) / Math.max(1e-6, lens[k] - lens[k - 1]);
    o.position.set(pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * f, pc.y + 0.018, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * f);
    o.updateMatrix(); dots.setMatrixAt(i, o.matrix); dots.setColorAt(i, DOT_OFF); at.push(sI);
  }
  levelGroup.add(dots);
  switches.push({ pc, on: false, t: 0, lit: 0, face, faceMat, ringMat, halo, button: base, dots, at, L, decals: [], top: null, side: null, top0: 1, side0: 1 });
}
// Over the button: the switch is on, and the dark road is solid from now on.
function switchStep() {
  for (const S of switches) {
    if (S.on || !ball.grounded) continue;
    if (Math.hypot(ball.p.x - S.pc.x, ball.p.z - S.pc.z) < 0.8 && Math.abs(ball.p.y - R - S.pc.y) < 0.2) { S.on = true; S.t = 0; sound('power'); }
  }
}
function animateSwitches(dt) {
  for (const S of switches) {
    let road;
    if (!S.on) {                                        // waiting: the ring pulses; the dark road stirs now and then
      const p = REDUCED ? 0.7 : 0.5 + 0.5 * Math.sin(simT * 4);
      S.ringMat.opacity = 0.45 + 0.5 * p; S.faceMat.opacity = 0.5 + 0.35 * p;
      const f = REDUCED ? 0 : ((simT * 0.7 + S.pc.link * 0.37) % 2.6);
      road = f < 0.12 ? 0.25 : f > 0.3 && f < 0.36 ? 0.18 : 0.05;
    } else {
      S.t += dt;
      const reach = REDUCED ? S.L : S.t * PULSE_V, since = S.t - S.L / PULSE_V;
      S.ringMat.opacity = 1; S.faceMat.opacity = 1;
      if (S.button.position.y > -0.02) S.button.position.y -= dt * 0.25;       // the button sinks home
      // The dark road flickers on as the light arrives, then holds.
      road = since < 0 ? 0.05 : REDUCED ? 1 : since < 0.08 ? 0.55 : since < 0.16 ? 0.08 : since < 0.28 ? 0.8 : since < 0.34 ? 0.25 : 1;
      for (const g of S.decals) g.material.opacity = since < 0 ? 0.45 : Math.max(0, 0.45 - since);
      S.at.forEach((a, i) => S.dots.setColorAt(i, a <= reach ? S.dotOn || DOT_ON : S.dotOff || DOT_OFF));
      S.dots.instanceColor.needsUpdate = true;
    }
    if (S.top && S.fade) { S.top.opacity = S.side.opacity = 0.28 + 0.72 * road; }             // the wasteland's ghost of a road fills in
    else if (S.top) { S.top.emissiveIntensity = S.top0 * road; S.side.emissiveIntensity = S.side0 * Math.max(0.15, road); }
  }
}

/* OBSTACLES ON THE ROAD (owner, 2026-09-27: "How about solid obstacles that sit
   on the tracks that the marble has to go around carefully?"; chose neon
   bollards, road barriers and cargo crates). Solid: the marble bounces off
   with a knock, and a hard knock near the edge can throw it off the road.
     bollards  short dark posts, a glowing band and cap, a pool of light at the
               foot; in rows across the road, one gap in each
     barriers  low road-works barriers, orange and white stripes lit in the
               dark, a blinking amber lamp at each end; each leaves a gap at
               one edge, the other edge next, so the way snakes
     crates    dark cargo crates, glowing lavender edges, "this way up" arrows,
               some stacked; one way through each row */
const barrierTex = canvasTex(128, 64, (g) => {          // one tile, half a metre of barrier: stripes leaning the way
  g.fillStyle = '#FF6A14'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#FFF1E2';
  for (let i = -2; i < 5; i++) { g.beginPath(); g.moveTo(i * 32, 64); g.lineTo(i * 32 + 16, 64); g.lineTo(i * 32 + 48, 0); g.lineTo(i * 32 + 32, 0); g.closePath(); g.fill(); }
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 128, 5); g.fillRect(0, 59, 128, 5);
}, true);
const crateFace = (arrows) => canvasTex(128, 128, (g) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(200,170,255,0.14)';
  for (let y = 18; y < 120; y += 17) g.fillRect(10, y, 108, 2);           // slats, faint
  g.filter = 'blur(4px)'; g.strokeStyle = 'rgba(185,145,255,0.9)'; g.lineWidth = 11; g.strokeRect(6, 6, 116, 116);
  g.filter = 'none'; g.strokeStyle = '#F0E8FF'; g.lineWidth = 3; g.strokeRect(6, 6, 116, 116);   // the glowing edge
  if (arrows) {                                         // this way up
    g.strokeStyle = 'rgba(225,205,255,0.85)'; g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const ax of [48, 80]) { g.beginPath(); g.moveTo(ax, 84); g.lineTo(ax, 48); g.moveTo(ax - 9, 57); g.lineTo(ax, 46); g.lineTo(ax + 9, 57); g.stroke(); }
    g.fillStyle = 'rgba(225,205,255,0.85)'; g.fillRect(38, 90, 52, 4);
  }
});
const crateSideTex = crateFace(true), crateTopTex = crateFace(false);
function buildBlock(pc) {
  const quat = new Quaternion().setFromEuler(new Euler(0, pc.yaw || 0, 0));
  const center = new Vector3(pc.x, pc.y + pc.h / 2, pc.z), geo = new BoxGeometry(pc.w, pc.h, pc.d);
  let mats;
  const parts = [];
  if (pc.kind === 'crate') {
    const side = new MeshStandardMaterial({ color: 0x191824, roughness: 0.55, metalness: 0.2, emissive: 0xFFFFFF, emissiveMap: crateSideTex, emissiveIntensity: 1 });
    const top = new MeshStandardMaterial({ color: 0x191824, roughness: 0.55, metalness: 0.2, emissive: 0xFFFFFF, emissiveMap: crateTopTex, emissiveIntensity: 1 });
    mats = [side, side, top, top, side, side];
  } else {
    // The stripes run the length of each face, a tile to every half metre.
    const uv = geo.attributes.uv;
    for (let f = 0; f < 6; f++) {
      const len = f < 2 ? pc.d : f < 4 ? pc.w : pc.w;
      for (let i = f * 4; i < f * 4 + 4; i++) uv.setX(i, uv.getX(i) * len / 0.5);
    }
    const stripe = new MeshStandardMaterial({ color: 0x2A1A10, roughness: 0.5, emissive: 0xFFFFFF, emissiveMap: barrierTex, emissiveIntensity: 0.85 });
    const top = new MeshStandardMaterial({ color: 0x1A1D26, roughness: 0.6, metalness: 0.3 });
    mats = [stripe, stripe, top, top, stripe, stripe];
    for (const e of [-1, 1]) {                          // a blinking amber lamp at each end
      const lamp = new Mesh(new SphereGeometry(0.075, 12, 8), new MeshBasicMaterial({ color: 0xFFB23F, toneMapped: false }));
      lamp.position.set(e * (pc.w / 2 - 0.12), pc.h / 2 + 0.07, 0);
      const halo = new Sprite(new SpriteMaterial({ map: dot, color: 0xFFA12E, transparent: true, blending: AdditiveBlending, depthWrite: false }));
      halo.scale.set(0.6, 0.6, 1); halo.position.copy(lamp.position);
      blinkers.push({ lamp, halo, ph: (e > 0 ? 0.5 : 0) + (pc.x * 0.13 + pc.z * 0.07) % 1 });
      parts.push(lamp, halo);
    }
  }
  const mesh = new Mesh(geo, mats);
  mesh.position.copy(center); mesh.quaternion.copy(quat); mesh.castShadow = true; mesh.receiveShadow = true;
  for (const part of parts) mesh.add(part);
  levelGroup.add(mesh);
  colliders.push({ mesh, pos: center.clone(), prev: center.clone(), quat, inv: quat.clone().invert(),
                   half: new Vector3(pc.w / 2, pc.h / 2, pc.d / 2), delta: new Vector3(), ferry: null, holo: null, pad: null, obstacle: pc.kind });
}
let postKit = null;                                     // a bollard's shapes and materials, made once
function buildPosts(pc) {
  if (!postKit) postKit = {
    body: new CylinderGeometry(POST_R, POST_R * 1.1, POST_H, 20), band: new CylinderGeometry(POST_R + 0.012, POST_R + 0.012, 0.09, 20, 1, true),
    cap: new CylinderGeometry(POST_R * 0.82, POST_R * 0.82, 0.025, 20), pool: new PlaneGeometry(1.15, 1.15), halo: new PlaneGeometry(0.75, 0.42),
  };
  const K = postKit, n = pc.points.length, o = new Object3D();
  const body = new InstancedMesh(K.body, new MeshStandardMaterial({ color: 0x151A28, metalness: 0.75, roughness: 0.3, envMap: neonEnvMap() || envTex,
    emissive: 0x34E0FF, emissiveIntensity: 0.07 }), n);
  const light = new MeshBasicMaterial({ color: 0xC4F7FF, toneMapped: false });
  const band = new InstancedMesh(K.band, light, n), cap = new InstancedMesh(K.cap, light, n);
  const pool = new InstancedMesh(K.pool, glowMat(0x34E0FF, 0.5, dot), n), halo = new InstancedMesh(K.halo, glowMat(0x5FE8FF, 0.9, dot), n);
  pc.points.forEach(([x, z], i) => {
    const set = (m, y, rx = 0) => { o.position.set(x, pc.y + y, z); o.rotation.set(rx, 0, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); };
    set(body, POST_H / 2); set(band, POST_H * 0.72); set(cap, POST_H + 0.012); set(pool, 0.012, -Math.PI / 2); set(halo, POST_H * 0.72);
    posts.push({ x, z, y: pc.y, r: POST_R, h: POST_H });
  });
  body.castShadow = true;
  levelGroup.add(body, band, cap, pool, halo);
}
// A bollard: the marble against its side, pushed straight out from its middle.
let knockT = -1;
function postContact(P) {
  const dx = ball.p.x - P.x, dz = ball.p.z - P.z, d = Math.hypot(dx, dz);
  if (d >= P.r + R || d < 1e-6 || ball.p.y - R > P.y + P.h - 0.05 || ball.p.y + R < P.y) return;
  const nx = dx / d, nz = dz / d, rel = ball.v.x * nx + ball.v.z * nz;
  ball.p.x += nx * (P.r + R - d); ball.p.z += nz * (P.r + R - d);
  if (rel < 0) {
    ball.v.x -= 1.35 * rel * nx; ball.v.z -= 1.35 * rel * nz;
    if (rel < -1.2 && simT - knockT > 0.12) { knockT = simT; sound('clink'); }
  }
}
function animateBlocks() {
  for (const B of blinkers) {
    const on = REDUCED || ((simT * 1.1 + B.ph) % 1) < 0.5;
    B.lamp.material.color.setHex(on ? 0xFFB23F : 0x3A2408); B.halo.material.opacity = on ? 1 : 0;
  }
}

// ---- CRYSTALS ON THE PATH: clusters of glowing crystal grown up out of the road, solid.
function buildShards(pc) {
  const geos = [3, 5, 8].map((k) => crystalPointGeo(k * 13)), lists = geos.map(() => []);
  const mat = tintedGlow(new MeshStandardMaterial({ color: 0x0C0B08, roughness: 0.18, metalness: 0.45, envMap: crystalEnvMap() || envTex, envMapIntensity: 1.2,
    emissive: 0xFFFFFF, emissiveMap: crystalEdgeTex(), emissiveIntensity: 1.8, flatShading: true }), 'shard-crystals');
  const r = seeded(7 + Math.round(Math.abs(pc.z) * 13)), up = new Vector3(0, 1, 0), d0 = new Vector3(), m = new Matrix4(), q = new Quaternion();
  for (const [x, z, rad] of pc.points) {
    const hues = r() < 0.5 ? CANYON_YELLOWS : CANYON_REDS;
    for (let k = 0; k < 5; k++) {                        // one tall point, and short ones leaning out round it
      const main = k === 0, len = main ? 1.15 + r() * 0.5 : 0.45 + r() * 0.5, prad = len * (main ? 0.3 : 0.34), a = r() * 6.28, lean = main ? r() * 0.18 : 0.35 + r() * 0.35;
      d0.set(Math.cos(a) * Math.sin(lean), Math.cos(lean), Math.sin(a) * Math.sin(lean));
      q.setFromUnitVectors(up, d0).multiply(new Quaternion().setFromAxisAngle(up, r() * 6.28));
      const off = main ? 0 : rad * 0.45;
      m.compose(new Vector3(x + Math.cos(a) * off, pc.y - 0.05, z + Math.sin(a) * off), q, new Vector3(prad, len / 1.7, prad));
      lists[k % 3].push([m.clone(), hues[Math.floor(r() * hues.length)]]);
    }
    const glow = new Mesh(new CircleGeometry(rad * 1.6, 24), glowMat(0xFFB030, 0.3, dot)); glow.rotation.x = -Math.PI / 2; glow.position.set(x, pc.y + 0.012, z);
    levelGroup.add(glow);
    posts.push({ x, z, y: pc.y, r: rad, h: 1.4 });
  }
  const col = new Color();
  geos.forEach((g, k) => {
    if (!lists[k].length) return;
    const im = new InstancedMesh(g, mat, lists[k].length);
    lists[k].forEach(([mm, hue], i) => { im.setMatrixAt(i, mm); im.setColorAt(i, col.setHex(hue)); });
    im.castShadow = true; levelGroup.add(im);
  });
}
// ---- FIRE JETS: vents across the road that blast flame in a rhythm, a glow and a hiss first.
const FLAME_UP = 0.15, FLAME_DOWN = 0.22, FLAME_WARN = 0.65, FLAME_H = 3.2;
// A tongue of flame, base at the bottom: a tapering body, white-yellow low, orange, red at the tip, with a bright core.
const flameTex = canvasTex(64, 256, (g) => {
  const body = () => { g.beginPath(); g.moveTo(32, 2); g.bezierCurveTo(46, 70, 60, 150, 54, 212); g.quadraticCurveTo(46, 252, 32, 252); g.quadraticCurveTo(18, 252, 10, 212); g.bezierCurveTo(4, 150, 18, 70, 32, 2); };
  const lg = g.createLinearGradient(0, 256, 0, 0);
  lg.addColorStop(0, 'rgba(255,245,200,1)'); lg.addColorStop(0.18, 'rgba(255,205,90,1)'); lg.addColorStop(0.5, 'rgba(255,120,30,0.9)'); lg.addColorStop(0.82, 'rgba(210,40,15,0.55)'); lg.addColorStop(1, 'rgba(160,20,10,0)');
  g.filter = 'blur(4px)'; g.fillStyle = lg; body(); g.fill();
  g.filter = 'blur(2px)';
  const core = g.createLinearGradient(0, 256, 0, 60); core.addColorStop(0, 'rgba(255,255,240,1)'); core.addColorStop(0.5, 'rgba(255,240,170,0.8)'); core.addColorStop(1, 'rgba(255,200,80,0)');
  g.fillStyle = core; g.beginPath(); g.moveTo(32, 60); g.bezierCurveTo(40, 120, 44, 190, 40, 226); g.quadraticCurveTo(32, 244, 24, 226); g.bezierCurveTo(20, 190, 24, 120, 32, 60); g.fill();
  g.filter = 'none';
});
const slotTex = canvasTex(128, 32, (g) => {             // the vent's slots: dark iron, a glow in each slot
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 32);
  for (let x = 6; x < 128; x += 14) { g.fillStyle = 'rgba(255,120,40,0.9)'; g.fillRect(x, 9, 8, 14); g.fillStyle = 'rgba(255,230,160,1)'; g.fillRect(x + 2, 13, 4, 6); }
}, true);
function flameState(L, t) {                             // how high the flame stands now (0 to 1), and how long it has been out
  const u = ((t + L.phase) % L.period + L.period) % L.period;
  if (u < L.on) return { active: true, h: Math.min(1, u / FLAME_UP) * (u > L.on - FLAME_DOWN ? (L.on - u) / FLAME_DOWN : 1), offFor: -1, warn: false };
  return { active: false, h: 0, offFor: u - L.on, warn: u > L.period - FLAME_WARN };
}
function buildFlames(c, pc, w, d) {
  const F = { pc, x: pc.x, w, top: pc.y, lines: [] }, iron = new MeshStandardMaterial({ color: 0x1C1A18, metalness: 0.7, roughness: 0.45 });
  const n = Math.max(3, Math.round(w / 0.5));
  for (const L of pc.lines) {
    const lz = pc.z + L.dz;
    const grate = new Mesh(new BoxGeometry(w - 0.1, 0.04, 0.7), iron); grate.position.set(0, c.half.y + 0.012, L.dz); c.mesh.add(grate);
    const t = slotTex.clone(); t.repeat.set(Math.round(w / 1.4), 1);
    const slots = new Mesh(new PlaneGeometry(w - 0.2, 0.5), glowMat(0xFFFFFF, 0.5, t)); slots.rotation.x = -Math.PI / 2; slots.position.set(0, c.half.y + 0.036, L.dz); c.mesh.add(slots);
    const glow = new Mesh(new PlaneGeometry(w + 1, 3.2), glowMat(0xFF6A1A, 0, dot)); glow.rotation.x = -Math.PI / 2; glow.position.set(0, c.half.y + 0.02, L.dz); c.mesh.add(glow);
    const sprites = [];
    for (let k = 0; k < n * 2; k++) {
      const sp = new Sprite(new SpriteMaterial({ map: flameTex, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: k % 2 ? 0.9 : 0.75 }));
      sp.position.set(pc.x - w / 2 + (Math.floor(k / 2) + 0.5) * w / n + (k % 2 ? 0.08 : -0.06), pc.y, lz); sp.visible = false; levelGroup.add(sp); sprites.push(sp);
    }
    const NS = 60, sArr = new Float32Array(NS * 3), sLife = new Float32Array(NS);
    for (let k = 0; k < NS; k++) sArr[k * 3 + 1] = -999;
    const sGeo = new BufferGeometry(); sGeo.setAttribute('position', new Float32BufferAttribute(sArr, 3).setUsage(DynamicDrawUsage));
    const sparks = new Points(sGeo, new PointsMaterial({ size: 0.16, map: dot, color: 0xFFC060, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    sparks.frustumCulled = false; levelGroup.add(sparks);
    F.lines.push({ ...L, z: lz, sprites, slots, tex: t, glow, lit: false, sGeo, sLife, next: 0 });
  }
  flames.push(F);
}
function flameStep() {
  for (const F of flames) for (const L of F.lines) {
    const st = flameState(L, simT);
    if (st.active && !L.lit && Math.abs(ball.p.z - L.z) < 16) sound('flame');
    L.lit = st.active;
    if (!st.active || st.h < 0.35) continue;
    if (Math.abs(ball.p.z - L.z) < 0.42 + R * 0.7 && Math.abs(ball.p.x - F.x) < F.w / 2 + 0.2 && ball.p.y - F.top < FLAME_H * 0.8 * st.h + 0.2) { burn(); return; }
  }
}
function burn() {                                       // caught in the flame: a burst of fire, and back to the last ring
  sound('burn'); shake = Math.max(shake, 0.3);
  burst(ball.p.x, ball.p.y, ball.p.z, 0xFF6A1A, 34, 4.5);
  burst(ball.p.x, ball.p.y, ball.p.z, 0xFFE08A, 14, 3);
  ball.v.set(0, 0, 0);
  startFall();
}
function animateFlames() {
  for (const F of flames) for (const L of F.lines) {
    const st = flameState(L, simT), flick = (k) => 0.85 + 0.15 * Math.sin(simT * 23 + k * 1.7) + 0.08 * Math.sin(simT * 41 + k);
    const sputter = st.warn && !REDUCED;                // just before: little flames licking up
    L.sprites.forEach((sp, k) => {
      const inner = k % 2 === 1, size = inner ? 0.72 : 1;
      const h = (st.active ? FLAME_H * st.h * flick(k) : sputter ? 0.55 * (0.5 + 0.5 * Math.sin(simT * 30 + k * 2.3)) : 0) * size;
      sp.visible = h > 0.05;
      sp.scale.set((inner ? 0.42 : 0.7) * (0.6 + 0.4 * Math.min(1, h)), h, 1); sp.position.y = F.top + h / 2 - 0.05;
    });
    const sa = L.sGeo.attributes.position.array;       // sparks thrown up while it burns
    for (let k = 0; k < L.sLife.length; k++) {
      if (L.sLife[k] > 0) { L.sLife[k] -= 1 / 60; sa[k * 3 + 1] += (2.2 + (k % 5) * 0.5) / 60; sa[k * 3] += Math.sin(simT * 7 + k) * 0.01; if (L.sLife[k] <= 0) sa[k * 3 + 1] = -999; }
      else if (st.active && !REDUCED && (k + Math.floor(simT * 60)) % 9 === 0) { sa[k * 3] = F.x + (Math.random() - 0.5) * F.w; sa[k * 3 + 1] = F.top + 0.3; sa[k * 3 + 2] = L.z + (Math.random() - 0.5) * 0.4; L.sLife[k] = 0.6 + Math.random() * 0.5; }
    }
    L.sGeo.attributes.position.needsUpdate = true;
    L.slots.material.opacity = st.active ? 1 : sputter ? 0.6 + 0.4 * Math.sin(simT * 25) : 0.35;
    L.glow.material.opacity = st.active ? 0.55 * st.h : sputter ? 0.18 : 0;
    if (!REDUCED) L.tex.offset.x = simT * 0.2;
  }
}
// ---- CRACKING CRYSTAL BRIDGES: clear crystal slabs that crack when rolled onto, and drop a moment later.
const CRACK_T = 0.9, CRACK_BACK = 3.2;
const crackTex = canvasTex(256, 256, (g) => {           // jagged cracks from a point, bright
  const r = seeded(29);
  g.lineCap = 'round';
  const branch = (x, y, a, len, wd) => {
    if (len < 6 || wd < 0.6) return;
    g.lineWidth = wd; g.strokeStyle = 'rgba(255,248,220,0.95)'; g.beginPath(); g.moveTo(x, y);
    let px = x, py = y;
    for (let k = 0; k < 5; k++) { px += Math.cos(a) * len / 5 + (r() - 0.5) * 8; py += Math.sin(a) * len / 5 + (r() - 0.5) * 8; g.lineTo(px, py); }
    g.stroke();
    branch(px, py, a + (r() - 0.5) * 1.4, len * 0.6, wd * 0.7);
    if (r() < 0.6) branch(px, py, a + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6), len * 0.5, wd * 0.6);
  };
  for (let k = 0; k < 7; k++) branch(128, 128, k / 7 * 6.28 + r() * 0.5, 70 + r() * 40, 3.2);
});
const slabTex = canvasTex(256, 256, (g) => {            // pale crystal: soft facets, a bright rim
  g.fillStyle = '#6E6450'; g.fillRect(0, 0, 256, 256);
  const r = seeded(33);
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,236,190' : '140,120,80'},${0.12 + r() * 0.18})`; g.beginPath(); g.moveTo(r() * 256, r() * 256); g.lineTo(r() * 256, r() * 256); g.lineTo(r() * 256, r() * 256); g.fill(); }
  g.strokeStyle = 'rgba(255,244,210,0.95)'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 250);
});
function buildCrackSlab(c, pc, w, d) {
  c.obstacle = 'crack';
  c.crack = { state: 'whole', t0: 0, goneAt: 0, back: -9 };
  const glass = new MeshStandardMaterial({ color: 0xFFF1D0, transparent: true, opacity: 0.62, roughness: 0.06, metalness: 0.15, envMap: crystalEnvMap() || envTex,
    envMapIntensity: 1.5, emissive: 0xFFC860, emissiveIntensity: 0.22 });
  const top = new MeshStandardMaterial({ map: slabTex, transparent: true, opacity: 0.8, roughness: 0.05, metalness: 0.2, envMap: crystalEnvMap() || envTex,
    envMapIntensity: 1.3, emissive: 0xFFE0A0, emissiveMap: slabTex, emissiveIntensity: 0.55 });
  c.mesh.material = [glass, glass, top, glass, glass, glass];
  setTopUV(c.mesh, true);
  const crackMesh = new Mesh(new PlaneGeometry(w - 0.1, d - 0.1), glowMat(0xFFFFFF, 0, crackTex)); crackMesh.rotation.x = -Math.PI / 2; crackMesh.position.y = c.half.y + 0.015;
  c.mesh.add(crackMesh);
  c.crackFx = { cracks: crackMesh, glass, top, base: c.mesh.position.clone() };
  cracks.push(c);
}
function crackStep() {
  for (const c of cracks) {
    const K = c.crack;
    if (K.state === 'cracking' && simT - K.t0 > CRACK_T) {
      K.state = 'gone'; K.goneAt = simT; sound('shatter');
      burst(c.pos.x, c.pos.y + c.half.y, c.pos.z, 0xFFE6A8, 26, 4); burst(c.pos.x, c.pos.y + c.half.y, c.pos.z, 0xFFB040, 12, 3);
    } else if (K.state === 'gone' && simT - K.goneAt > CRACK_BACK) {
      const over = Math.abs(ball.p.x - c.pos.x) < c.half.x + R && Math.abs(ball.p.z - c.pos.z) < c.half.z + R && ball.p.y > c.pos.y - 3;
      if (!over) { K.state = 'whole'; K.back = simT; }
    }
  }
}
function animateCracks(dt) {
  for (const c of cracks) {
    const K = c.crack, fx = c.crackFx;
    if (K.state === 'gone') {                            // falling away, fading
      const u = simT - K.goneAt;
      c.mesh.position.set(fx.base.x, fx.base.y - 4 * u * u, fx.base.z); c.mesh.rotation.set(u * 0.6, 0, u * 0.4);
      c.mesh.visible = u < 1.4; fx.cracks.material.opacity = 1;
      continue;
    }
    c.mesh.visible = true; c.mesh.rotation.set(0, 0, 0);
    const k = K.state === 'cracking' ? Math.min(1, (simT - K.t0) / CRACK_T) : 0, shiver = K.state === 'cracking' && !REDUCED ? (Math.random() - 0.5) * 0.04 * k : 0;
    c.mesh.position.set(fx.base.x + shiver, fx.base.y, fx.base.z + shiver);
    fx.cracks.material.opacity = k;
    const back = Math.min(1, (simT - K.back) / 0.4);   // grown back: fading in
    fx.glass.opacity = 0.62 * back; fx.top.opacity = 0.8 * back;
  }
}
// ---- ROLLING FIREBALLS: balls of fire rolling in stone channels, out of one cliff, across the road, into the other.
const FB_R = 0.55;
const lavaTex = canvasTex(128, 64, (g) => {
  g.fillStyle = '#FF7A1A'; g.fillRect(0, 0, 128, 64);
  const r = seeded(51);
  for (let i = 0; i < 40; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,230,120,0.9)' : 'rgba(170,30,10,0.8)'; g.beginPath(); g.ellipse(r() * 128, r() * 64, 4 + r() * 12, 2 + r() * 6, r() * 3, 0, 7); g.fill(); }
}, true);
const scorchTex = canvasTex(128, 32, (g) => {
  const lg = g.createLinearGradient(0, 0, 0, 32); lg.addColorStop(0, 'rgba(20,10,5,0)'); lg.addColorStop(0.5, 'rgba(20,10,5,0.75)'); lg.addColorStop(1, 'rgba(20,10,5,0)');
  g.fillStyle = lg; g.fillRect(0, 0, 128, 32);
  const r = seeded(9); for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(255,${80 + r() * 100},20,${0.4 + r() * 0.5})`; g.fillRect(r() * 128, 12 + r() * 8, 2 + r() * 6, 1.5); }
}, true);
function buildFireCrossing(c, pc, w, d) {
  const top = pc.y, near = pc.z + d / 2;
  const X = { lanes: [], cars: [], lights: [], green: true, greenSince: 0, w, x: pc.x, top, fire: true, warn: 2.1 };
  const stone = new MeshStandardMaterial({ color: 0x2E2620, roughness: 0.9 }), ballMat = new MeshBasicMaterial({ map: lavaTex, toneMapped: false });
  pc.lanes.forEach((L, li) => {
    const len = L.speed * L.gaps.reduce((a, b) => a + b, 0);
    const lane = { ...L, z: pc.z + L.dz, len, at: [] };
    let s = 0;
    for (const gap of L.gaps) { lane.at.push(s); s += gap * L.speed; }
    X.lanes.push(lane);
    for (const sx of [-1, 1]) {                          // the channel either side: a stone ledge with embers along it
      const ledge = new Mesh(new BoxGeometry(30, 0.5, 1.3), stone); ledge.position.set(pc.x + sx * (w / 2 + 15), top - 0.36, lane.z); ledge.receiveShadow = true; levelGroup.add(ledge);
      const ember = new Mesh(new PlaneGeometry(30, 0.2), glowMat(0xFF6A1A, 0.9)); ember.rotation.x = -Math.PI / 2; ember.position.set(pc.x + sx * (w / 2 + 15), top - 0.1, lane.z); levelGroup.add(ember);
    }
    const scorch = new Mesh(new PlaneGeometry(w, 1.2), new MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false })); scorch.rotation.x = -Math.PI / 2; scorch.position.set(pc.x, top + 0.013, lane.z); levelGroup.add(scorch);
    lane.at.forEach((_, i) => {
      const grp = new Group(), ball2 = new Mesh(new SphereGeometry(FB_R, 24, 16), ballMat);
      const halo = new Sprite(new SpriteMaterial({ map: dot, color: 0xFF8A2A, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false })); halo.scale.set(3.6, 3.6, 1);
      grp.add(ball2, halo); levelGroup.add(grp);
      const trail = [];
      for (let k = 0; k < 5; k++) { const sp = new Sprite(new SpriteMaterial({ map: flameTex, transparent: true, blending: AdditiveBlending, depthWrite: false })); levelGroup.add(sp); trail.push(sp); }
      X.cars.push({ mesh: grp, ball: ball2, trail, lane, i, x: 0 });
    });
  });
  const line = new Mesh(new PlaneGeometry(w - 0.2, 0.09), glowMat(0xFFFFFF, 0.9));
  line.rotation.x = -Math.PI / 2; line.position.set(pc.x, top + 0.02, near - 0.12); levelGroup.add(line);
  const housingMat = new MeshStandardMaterial({ color: 0x241C16, metalness: 0.5, roughness: 0.4 });
  for (const sx of [-1, 1]) {
    const post = new Group();
    const housing = new Mesh(new RoundedBoxGeometry(0.46, 0.46, 0.16, 2, 0.07), housingMat);
    const lamp = new Mesh(new CircleGeometry(0.16, 28), new MeshBasicMaterial({ color: 0x3DFF8A, toneMapped: false })); lamp.position.z = 0.085;
    const halo = new Mesh(new PlaneGeometry(1.2, 1.2), glowMat(0x3DFF8A, 0.8, dot)); halo.position.z = 0.09;
    post.add(housing, lamp, halo); post.position.set(pc.x + sx * (w / 2 + 0.4), top + 1.15, near - 0.12); levelGroup.add(post);
    X.lights.push({ lamp, halo });
  }
  c.cross = X;
  crossings.push(c);
}

/* SCANNER LASERS (owner, 2026-09-27: "let's do the 3 you suggest"). A stretch
   of road between two red thresholds is swept by a scanner: a bar of red light
   standing on the road, a thin bright line along the surface with a curtain of
   light rising from it, sliding from side to side across the road and a little
   past each edge. It hums as it goes. Touch it and the marble is caught with a
   zap and flies back to the last ring. The way through: down one side, just
   after the bar has left it. Where two bars sweep, down the middle just after
   they cross. */
const SCAN_OVER = 0.45, SCAN_H = 0.95;
const scanTex = canvasTex(8, 128, (g) => {               // the curtain: brightest at the road, gone by the top
  const lg = g.createLinearGradient(0, 0, 0, 128);
  lg.addColorStop(0, 'rgba(255,40,70,0)'); lg.addColorStop(0.6, 'rgba(255,40,70,0.28)'); lg.addColorStop(0.95, 'rgba(255,70,95,0.85)');
  lg.addColorStop(1, 'rgba(255,200,210,1)');
  g.fillStyle = lg; g.fillRect(0, 0, 8, 128);
});
const strandTex = canvasTex(32, 128, (g) => {           // one upright strand: a thin bright core in a tight feather, fading at the top
  const fade = g.createLinearGradient(0, 0, 0, 128);
  fade.addColorStop(0, 'rgba(255,255,255,0)'); fade.addColorStop(0.18, 'rgba(255,255,255,1)'); fade.addColorStop(1, 'rgba(255,255,255,1)');
  const across = g.createLinearGradient(0, 0, 32, 0);
  across.addColorStop(0, 'rgba(255,40,70,0)'); across.addColorStop(0.38, 'rgba(255,50,80,0.75)'); across.addColorStop(0.47, 'rgba(255,215,222,1)');
  across.addColorStop(0.53, 'rgba(255,215,222,1)'); across.addColorStop(0.62, 'rgba(255,50,80,0.75)'); across.addColorStop(1, 'rgba(255,40,70,0)');
  g.fillStyle = across; g.fillRect(0, 0, 32, 128);
  g.globalCompositeOperation = 'destination-in'; g.fillStyle = fade; g.fillRect(0, 0, 32, 128);
});
const scanGlowTex = canvasTex(64, 8, (g) => {            // its light on the road, feathering out to each side
  const lg = g.createLinearGradient(0, 0, 64, 0);
  lg.addColorStop(0, 'rgba(255,40,70,0)'); lg.addColorStop(0.5, 'rgba(255,60,90,0.9)'); lg.addColorStop(1, 'rgba(255,40,70,0)');
  g.fillStyle = lg; g.fillRect(0, 0, 64, 8);
});
function buildScan(c, pc, w, d) {
  const top = c.half.y, red = new MeshBasicMaterial({ color: 0xFF2D48, toneMapped: false });
  for (const e of [1, -1]) {                            // the thresholds: a red line across the road, a post with a lamp at each end
    const line = new Mesh(new BoxGeometry(w, 0.02, 0.06), red);
    line.position.set(0, top + 0.012, e * (d / 2 - 0.05)); c.mesh.add(line);
    for (const sx of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(0.12, 1.05, 0.12), new MeshStandardMaterial({ color: 0x151A2A, metalness: 0.7, roughness: 0.35 }));
      post.position.set(sx * (w / 2 + 0.2), top + 0.5, e * (d / 2 - 0.05)); c.mesh.add(post);
      const lamp = new Mesh(new SphereGeometry(0.08, 12, 8), red);
      lamp.position.set(sx * (w / 2 + 0.2), top + 1.08, e * (d / 2 - 0.05)); c.mesh.add(lamp);
    }
  }
  const Sc = { pc, x: pc.x, zc: pc.z, y: pc.y, d, w, A: w / 2 + SCAN_OVER, period: pc.period, phase: pc.phase, bars: [] };
  for (let i = 0; i < (pc.bars || 1); i++) {
    const g = new Group();
    const sheet = new Mesh(new PlaneGeometry(d, SCAN_H), glowMat(0xFFFFFF, 0.9, scanTex));
    sheet.material.side = DoubleSide; sheet.rotation.y = Math.PI / 2; sheet.position.y = SCAN_H / 2;
    const core = new Mesh(new BoxGeometry(0.035, 0.02, d), new MeshBasicMaterial({ color: 0xFFE0E6, toneMapped: false }));
    core.position.y = 0.013;
    const glow = new Mesh(new PlaneGeometry(1.1, d), glowMat(0xFFFFFF, 1, scanGlowTex));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.01;
    g.add(sheet, core, glow);
    // A row of upright strands along the bar, facing down the road, so it reads from behind as a fence of light.
    const ns = Math.max(3, Math.round(d / 0.85)), strands = new InstancedMesh(new PlaneGeometry(0.2, SCAN_H), glowMat(0xFFFFFF, 1, strandTex), ns), o = new Object3D();
    for (let k = 0; k < ns; k++) { o.position.set(0, SCAN_H / 2, -d / 2 + (k + 0.5) * d / ns); o.updateMatrix(); strands.setMatrixAt(k, o.matrix); }
    strands.material.side = DoubleSide;
    g.add(strands);
    for (const e of [1, -1]) {                          // where the bar meets each threshold
      const nub = new Mesh(new BoxGeometry(0.16, 0.07, 0.12), red);
      nub.position.set(0, 0.035, e * (d / 2 - 0.05)); g.add(nub);
    }
    g.position.set(pc.x, pc.y, pc.z);
    levelGroup.add(g); Sc.bars.push(g);
  }
  scans.push(Sc);
}
function scanX(Sc, t, i) {                              // where bar i stands at time t
  return Sc.x + (i ? -1 : 1) * Sc.A * Math.cos(2 * Math.PI * (t + Sc.phase) / Sc.period);
}
function scanStep() {
  for (const Sc of scans) {
    if (Math.abs(ball.p.z - Sc.zc) > Sc.d / 2 + R * 0.5 || ball.p.y - Sc.y > SCAN_H + R || ball.p.y < Sc.y - 0.3) continue;
    for (let i = 0; i < Sc.bars.length; i++) if (Math.abs(ball.p.x - scanX(Sc, simT, i)) < R + 0.03) { zap(); return; }
  }
}
function zap() {                                        // caught: a zap, sparks, and back to the last ring
  sound('zap'); shake = Math.max(shake, 0.25);
  burst(ball.p.x, ball.p.y, ball.p.z, 0xFF2D48, 30, 4);
  burst(ball.p.x, ball.p.y, ball.p.z, 0xFFFFFF, 10, 3);
  ball.v.set(0, 0, 0);
  startFall();
}
function animateScans() {
  for (const Sc of scans) Sc.bars.forEach((g, i) => { g.position.x = scanX(Sc, simT, i); });
}

/* THE GLASS TUBE (owner, 2026-09-27: "proceed on the next 4 blocks and
   obstacles"; on the menu as "a breather, and a spectacle"). The road ends
   at the mouth of a clear tube. Roll in and it takes the marble: up, once
   round a coil high over the city, and down onto the road ahead, where it
   lets go. Nothing to steer: the rings of light along it flare as the marble
   shoots through. */
const TUBE_R = 0.8, TUBE_V = 13, TUBE_V_OUT = 7, TUBE_DS = 0.05;
// A smooth path through the points (centripetal Catmull-Rom), measured out
// every TUBE_DS metres so a ride can go at an even pace.
function tubePath(P) {
  const Q = [P[0].map((v, i) => 2 * v - P[1][i]), ...P, P[P.length - 1].map((v, i) => 2 * v - P[P.length - 2][i])];
  const dense = [];
  for (let k = 0; k + 3 < Q.length; k++) {
    const [p0, p1, p2, p3] = Q.slice(k, k + 4), dist = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])));
    const t1 = dist(p0, p1), t2 = t1 + dist(p1, p2), t3 = t2 + dist(p2, p3);
    const L = (a, b, ta, tb, u) => a.map((v, i) => ((tb - u) * v + (u - ta) * b[i]) / (tb - ta));
    for (let j = 0; j < 40; j++) {
      const u = t1 + (t2 - t1) * j / 40;
      const A1 = L(p0, p1, 0, t1, u), A2 = L(p1, p2, t1, t2, u), A3 = L(p2, p3, t2, t3, u);
      dense.push(L(L(A1, A2, 0, t2, u), L(A2, A3, t1, t3, u), t1, t2, u));
    }
  }
  dense.push(P[P.length - 1]);
  const acc = [0];
  for (let i = 1; i < dense.length; i++) { const a = dense[i - 1], b = dense[i]; acc.push(acc[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])); }
  const len = acc[acc.length - 1], n = Math.floor(len / TUBE_DS) + 1, pts = new Float32Array(n * 3);
  for (let i = 0, j = 0; i < n; i++) {
    const s = i * TUBE_DS;
    while (j < acc.length - 2 && acc[j + 1] < s) j++;
    const f = (s - acc[j]) / Math.max(1e-6, acc[j + 1] - acc[j]);
    for (let c = 0; c < 3; c++) pts[i * 3 + c] = dense[j][c] + (dense[j + 1][c] - dense[j][c]) * f;
  }
  return { pts, n, len: (n - 1) * TUBE_DS };
}
function tubeAt(T, s, out) {                           // the point at s metres along, into out
  const f = clamp(s / TUBE_DS, 0, T.n - 1.001), i = Math.floor(f), k = f - i, q = T.pts;
  return out.set(q[i * 3] + (q[i * 3 + 3] - q[i * 3]) * k, q[i * 3 + 1] + (q[i * 3 + 4] - q[i * 3 + 1]) * k, q[i * 3 + 2] + (q[i * 3 + 5] - q[i * 3 + 2]) * k);
}
function tubeDir(T, s, out) {                          // the way it runs there
  const i = clamp(Math.floor(s / TUBE_DS), 0, T.n - 2), q = T.pts;
  return out.set(q[i * 3 + 3] - q[i * 3], q[i * 3 + 4] - q[i * 3 + 1], q[i * 3 + 5] - q[i * 3 + 2]).normalize();
}
let tubeGlass = null;
function tubeGlassMat() {                               // clear, and bright only where the eye meets it edge-on
  if (tubeGlass) return tubeGlass;
  tubeGlass = new MeshStandardMaterial({ color: 0x9FDFFF, metalness: 0.1, roughness: 0.08, transparent: true, depthWrite: false, side: DoubleSide,
                                         envMap: neonEnvMap() || envTex, envMapIntensity: 1.1 });
  tubeGlass.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
  {
    float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.4);
    gl_FragColor.rgb += vec3(0.3, 0.8, 1.0) * rim * 0.8;
    gl_FragColor.a = clamp(0.05 + 0.75 * rim, 0.0, 1.0);
  }`);
  };
  tubeGlass.customProgramCacheKey = () => 'tube-glass';
  return tubeGlass;
}
const _ta = new Vector3(), _tb = new Vector3(), _tn = new Vector3(), _tq = new Quaternion(), _tz = new Vector3(0, 0, 1);
function buildTube(pc) {
  const { x, z, side: sd, gap } = pc, yc = pc.y + R, zc = z - gap / 2, cx = x + sd * 6.5, RH = 4.5;
  const P = [[x, yc, z + 0.8], [x, yc + 0.1, z - 1.6], [x + sd * 0.7, yc + 2.6, z - 4.6]];
  for (let i = 0; i <= 8; i++) {                        // once round, drifting forward so the coil clears itself
    const a = i * Math.PI / 4;
    P.push([cx - sd * RH * Math.cos(a), yc + 9 - 2.6 * i / 8, zc - RH * Math.sin(a) - 2.4 * i / 8]);   // a coil: down 2.6 m as it goes round
  }
  P.push([x + sd * 1.1, yc + 4.2, zc - 7.5], [x, yc + 1.9, z - gap + 2.2], [x, yc + 0.95, z - gap - 1.3]);
  const T = tubePath(P);
  // The glass: rings of vertices round the path, carried along it without twisting.
  const ringN = Math.floor(T.len / 0.2) + 1, seg = 20, pos = new Float32Array(ringN * seg * 3), idx = [];
  const coord = new Float32Array(ringN * seg * 3);         // metres along, and the angle round (cos, sin): for a world's own look
  const nrm = new Vector3(1, 0, 0), bi = new Vector3(), t = new Vector3(), c = new Vector3();
  tubeDir(T, 0, t); nrm.set(-t.z, 0, t.x).normalize();
  for (let i = 0; i < ringN; i++) {
    const sI = Math.min(T.len, i * 0.2);
    tubeAt(T, sI, c); tubeDir(T, sI, t);
    nrm.addScaledVector(t, -nrm.dot(t)).normalize(); bi.crossVectors(t, nrm);
    for (let j = 0; j < seg; j++) {
      const a = j / seg * Math.PI * 2, k = (i * seg + j) * 3;
      coord[k] = sI; coord[k + 1] = Math.cos(a); coord[k + 2] = Math.sin(a);
      pos[k] = c.x + (nrm.x * Math.cos(a) + bi.x * Math.sin(a)) * TUBE_R;
      pos[k + 1] = c.y + (nrm.y * Math.cos(a) + bi.y * Math.sin(a)) * TUBE_R;
      pos[k + 2] = c.z + (nrm.z * Math.cos(a) + bi.z * Math.sin(a)) * TUBE_R;
      if (i < ringN - 1) { const b = i * seg, j2 = (j + 1) % seg; idx.push(b + j, b + seg + j, b + j2, b + j2, b + seg + j, b + seg + j2); }
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  geo.setAttribute('tubeCoord', new Float32BufferAttribute(coord, 3));
  const glass = new Mesh(geo, tubeGlassMat()); glass.renderOrder = 2;
  // Rings of light every 1.4 m, and a bigger one at each open end.
  const n = Math.floor(T.len / 1.4), rings = new InstancedMesh(new TorusGeometry(TUBE_R + 0.015, 0.03, 6, 40),
    new MeshBasicMaterial({ color: 0xFFFFFF, toneMapped: false }), n), o = new Object3D(), col = new Color(0x2A9FC0);
  for (let i = 0; i < n; i++) {
    const sI = (i + 0.5) * T.len / n;
    tubeAt(T, sI, o.position); tubeDir(T, sI, t); o.quaternion.setFromUnitVectors(_tz, t); o.updateMatrix();
    rings.setMatrixAt(i, o.matrix); rings.setColorAt(i, col);
  }
  const halos = [], ends = [0, T.len].map((sI) => {
    const m = new Mesh(new TorusGeometry(TUBE_R + 0.12, 0.07, 10, 48), new MeshBasicMaterial({ color: 0x5FE8FF, toneMapped: false }));
    tubeAt(T, sI, m.position); tubeDir(T, sI, t); m.quaternion.setFromUnitVectors(_tz, t);
    const halo = new Mesh(new CircleGeometry(TUBE_R + 0.5, 40), glowMat(0x34E0FF, 0.35, dot));
    halo.position.copy(m.position); halo.quaternion.copy(m.quaternion);
    levelGroup.add(m, halo); halos.push(halo); return m;
  });
  levelGroup.add(glass, rings);
  const out = new Vector3(); tubeAt(T, 0, out);
  tubes.push({ pc, T, rings, ringS: Array.from({ length: n }, (_, i) => (i + 0.5) * T.len / n), mouth: out, cap: 1.25, ends, halos, glass });
}
// Into a tube's mouth: any marble rolling over the road's end, at road height.
function tubeCatch() {
  for (const U of tubes) {
    const m = U.mouth;
    if (ball.p.z < m.z + 0.1 && ball.p.z > m.z - 1.2 && Math.abs(ball.p.x - m.x) < U.cap && Math.abs(ball.p.y - m.y) < 0.9) {
      ball.tube = { U, s: Math.max(0, m.z - ball.p.z), t: 0, v0: Math.max(3, -ball.v.z), off: new Vector3().subVectors(ball.p, tubeAt(U.T, 0, _ta)) };
      ball.tube.off.z = 0;
      sound('tube');
      return;
    }
  }
}
function rideTube(dt) {
  const k = ball.tube, T = k.U.T;
  k.t += dt;
  let v = k.v0 + (TUBE_V - k.v0) * (1 - Math.exp(-3.5 * k.t));          // drawn in, quicker and quicker
  const left = T.len - k.s;
  if (left < 7) v = TUBE_V_OUT + (v - TUBE_V_OUT) * left / 7;              // easing before it lets go
  k.s += v * dt;
  tubeDir(T, Math.min(k.s, T.len - TUBE_DS), _tb);
  if (k.s >= T.len) {                                                     // out, onto the road ahead
    tubeAt(T, T.len, ball.p); ball.v.copy(_tb).multiplyScalar(TUBE_V_OUT);
    ball.tube = null; ball.airT = 0; sound('pop');
    return;
  }
  tubeAt(T, k.s, ball.p).addScaledVector(k.off, Math.max(0, 1 - k.t / 0.3));
  ball.v.copy(_tb).multiplyScalar(v);
  ball.grounded = false; ball.spin.set(_tb.z, 0, -_tb.x).multiplyScalar(v / R);
}
const TUBE_PAL = [0.16, 0.62, 0.75, 1, 1, 1];            // a ring's colour at rest, and lit (a world may give its own: U.pal)
function animateTubes() {
  const col = new Color();
  for (const U of tubes) {
    const at = ball.tube && ball.tube.U === U ? ball.tube.s : -99, p = U.pal || TUBE_PAL;
    U.ringS.forEach((sI, i) => {                        // a ring flares as the marble passes and fades behind it
      const d = at - sI, f = d > -1.2 && d < 7 ? (d < 0 ? 1 + d / 1.2 : Math.exp(-d / 2.2)) : 0;
      U.rings.setColorAt(i, col.setRGB(p[0] + (p[3] - p[0]) * f, p[1] + (p[4] - p[1]) * f, p[2] + (p[5] - p[2]) * f));
    });
    U.rings.instanceColor.needsUpdate = true;
  }
}

/* TRAFFIC CROSSINGS (owner, 2026-09-27: "lets start adding these", the first of
   three new challenges). One or two lanes of flying cars cross the road at
   marble height; each lane is marked in the air beyond the road, so it reads
   with no car in it. A light over each side of the stop line shows green when
   it is safe to start across: no car will reach the crossing for CROSS_WARN
   seconds, time enough to cross at a normal push with room to spare. A car
   that meets the marble throws it off the road. Traffic is regular for each
   lane but the gaps differ, so some are worth waiting for. */
const CROSS_WARN = 1.2, CAR_LIFT = 0.42, CAR_HX = 1.15, CAR_HY = 0.36, CAR_HZ = 0.5;
let crossKit = null;                                    // the cars' shapes, made once and shared
const laneTex = canvasTex(128, 32, (g) => {             // 4 m of lane: a faint road with dashed edges
  g.fillStyle = 'rgb(18,34,52)'; g.fillRect(0, 0, 128, 32);           // added to what is behind, so dark is clear
  g.fillStyle = '#EAF6FF';
  for (let u = 0; u < 128; u += 32) { g.fillRect(u, 0, 18, 3); g.fillRect(u, 29, 18, 3); }
}, true);
laneTex.repeat.set(15, 1);
function buildCrossing(c, pc, w, d) {
  if (pc.fire) { buildFireCrossing(c, pc, w, d); return; }
  if (!crossKit) crossKit = carKit(neonEnvMap() || envTex);
  const K = crossKit, top = pc.y, near = pc.z + d / 2;
  const X = { lanes: [], cars: [], lights: [], parts: [], green: true, greenSince: 0, w, x: pc.x, top };
  pc.lanes.forEach((L, li) => {
    const len = L.speed * L.gaps.reduce((a, b) => a + b, 0);
    const lane = { ...L, z: pc.z + L.dz, len, at: [] };
    let s = 0;
    for (const gap of L.gaps) { lane.at.push(s); s += gap * L.speed; }
    X.lanes.push(lane);
    // The lane in the air: a faint road with dashed edges, 60 m of it.
    const road = new Mesh(new PlaneGeometry(60, 2 * CAR_HZ + 0.2), glowMat(0xFFFFFF, 0.8, laneTex));
    road.rotation.x = -Math.PI / 2; road.position.set(pc.x, top + 0.02, lane.z);
    levelGroup.add(road); X.parts.push(road);
    lane.at.forEach((_, i) => {
      const car = new Group(), paintHex = CAR_PAINT[(li * 3 + i * 2) % CAR_PAINT.length];
      const add = (geo, mat, at) => { const m = new Mesh(geo, mat); if (at) { m.matrixAutoUpdate = false; m.matrix.copy(at); } car.add(m); return m; };
      add(K.body, K.paint(paintHex)); add(K.canopy, K.canopyMat, CAR_AT.canopy);
      add(K.head, K.headMat, CAR_AT.head); add(K.tail, K.tailMat, CAR_AT.tail);
      add(K.beam, K.beamMat, CAR_AT.beam); add(K.tailGlow, K.tailGlowMat, CAR_AT.tailGlow);
      add(K.under, K.underMat(i % 2 ? 0x34E0FF : 0xFF8A5C), CAR_AT.under);
      car.rotation.y = L.dir > 0 ? 0 : Math.PI;
      levelGroup.add(car);
      X.cars.push({ mesh: car, lane, i, x: 0 });
    });
  });
  // The stop line, and a light floating over each side of it.
  const line = new Mesh(new PlaneGeometry(w - 0.2, 0.09), glowMat(0xFFFFFF, 0.9));
  line.rotation.x = -Math.PI / 2; line.position.set(pc.x, top + 0.02, near - 0.12);
  levelGroup.add(line); X.parts.push(line);
  const housingMat = new MeshStandardMaterial({ color: 0x141B2E, metalness: 0.5, roughness: 0.4 });
  for (const sx of [-1, 1]) {
    const post = new Group();
    const housing = new Mesh(new RoundedBoxGeometry(0.46, 0.46, 0.16, 2, 0.07), housingMat);
    const lamp = new Mesh(new CircleGeometry(0.16, 28), new MeshBasicMaterial({ color: 0x3DFF8A, toneMapped: false }));
    lamp.position.z = 0.085;
    const halo = new Mesh(new PlaneGeometry(1.2, 1.2), glowMat(0x3DFF8A, 0.8, dot));
    halo.position.z = 0.09;
    post.add(housing, lamp, halo);
    post.position.set(pc.x + sx * (w / 2 + 0.4), top + 1.15, near - 0.12);
    levelGroup.add(post);
    X.lights.push({ lamp, halo });
  }
  c.cross = X;
  crossings.push(c);
}
/* RIDING THE SKY TRAIN (owner, 2026-09-27; the second of the three). The road
   stops at a station and the sky train comes in along the road's line: the
   same train as the city's, with a deck on its roof in the moving pads' pale
   blue grid, so it reads as something you can ride. It waits, its amber
   corner lights blink and a chime sounds just before it goes, and it runs to
   the next station and waits there. The marble feels the train pull away and
   brake (`pull`): hold on, or roll off the back. */
function buildRide(c, pc, w, d) {
  const model = trainModel(neonEnvMap() || envTex);
  model.rotation.y = Math.PI / 2;                       // its length along z, the front toward -z
  model.position.y = -TRAIN_H / 2 - 1.0;                // its roof under the deck
  model.scale.z = 1.6;                                  // wider than the deck, so from above it reads as a train
  c.mesh.add(model);
  /* The roof falls away either side of the deck. Two sloping surfaces ride
     with the train there, so a marble that slips off the deck's side rolls
     off the roof rather than sinking into it. */
  c.riders = [];
  for (const sx of [-1, 1]) {
    const q = new Quaternion().setFromEuler(new Euler(0, 0, -sx * 0.45));
    const off = new Vector3(sx * 1.12, -0.32, 0);
    const r = { pos: c.pos.clone().add(off), prev: new Vector3(), quat: q, inv: q.clone().invert(),
                half: new Vector3(0.26, 0.05, d / 2), delta: new Vector3(), ferry: c.ferry, off };
    c.riders.push(r); riders.push(r);
  }
  const beacons = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const b = new Group();
    const lamp = new Mesh(new CircleGeometry(0.11, 20), new MeshBasicMaterial({ color: 0xFFB23F, toneMapped: false }));
    const halo = new Mesh(new PlaneGeometry(0.9, 0.9), glowMat(0xFFB23F, 0.8, dot));
    lamp.rotation.x = halo.rotation.x = -Math.PI / 2; halo.position.y = 0.004;
    b.add(lamp, halo);
    b.position.set(sx * (w / 2 - 0.18), TRAIN_H / 2 + 0.014, sz * (d / 2 - 0.35));
    c.mesh.add(b); beacons.push(b);
  }
  // The guideway between the stations, under the train's path.
  const zA = pc.z + pc.amp + d / 2, zB = pc.z - pc.amp - d / 2, len = zA - zB;
  const beam = new Mesh(new BoxGeometry(0.9, 0.45, len), new MeshStandardMaterial({ color: 0x1A2233, metalness: 0.65, roughness: 0.3,
    envMap: neonEnvMap() || envTex, emissive: 0x34E0FF, emissiveIntensity: 0.06 }));
  beam.position.set(pc.x, pc.y - TRAIN_H - 1.8 - 0.5, (zA + zB) / 2);
  levelGroup.add(beam);
  const parts = [beam];
  for (const sx of [-1, 1]) {
    const rail = new Mesh(new BoxGeometry(0.06, 0.05, len), new MeshBasicMaterial({ color: 0x5FE8FF, toneMapped: false }));
    rail.position.set(pc.x + sx * 0.3, pc.y - TRAIN_H - 1.8 - 0.25, (zA + zB) / 2);
    levelGroup.add(rail); parts.push(rail);
  }
  c.train = { pull: pc.pull, model, beacons, warned: false, parts };
  c.ferry.v = 0; c.ferry.a = 0;
}
// At which end of its run a moving pad is waiting (1 the +amp end, -1 the other,
// 0 moving), and for how much longer.
function ferryStop(f, t) {
  const u = ((t / f.period + f.phase / (2 * Math.PI)) % 1 + 1) % 1, a = f.dwell / f.period;
  if (u < a) return { end: 1, left: (a - u) * f.period };
  if (u >= 0.5 && u < 0.5 + a) return { end: -1, left: (0.5 + a - u) * f.period };
  return { end: 0, left: 0 };
}
function animateRides() {
  for (const c of ferries) {
    if (!c.train) continue;
    const st = ferryStop(c.ferry, simT), T = c.train;
    const warn = st.end !== 0 && st.left < 1.2;
    const on = warn && (REDUCED || Math.floor(st.left * 5) % 2 === 0);
    for (const b of T.beacons) b.visible = on;
    if (warn && !T.warned && ball.p.distanceTo(c.pos) < 30) sound('depart');
    T.warned = warn;
  }
}

/* COLOUR LOCKS (owner, 2026-09-27; the third of the three). The road forks
   into two lanes with a curtain of light across each, one lime and one
   violet; rolling through a curtain gives the marble its colour, which it
   wears as a glow and a trail. Past the fork a wall of one colour crosses the
   road and lets through only a marble of that colour: look ahead at the wall,
   then pick the lane. A wrong pick is not a fall: go back up the other lane.
   Lime and violet are used nowhere else, and differ in lightness, so they
   stay apart for colour-blind players too. The marble's colour is kept at
   each save ring. */
const TINTS = [0x3FE8FF, 0xA8FF3E, 0x9D6BFF];           // none (the trail's own cyan), lime, violet
const curtainTex = canvasTex(64, 128, (g) => {          // streaks of light, rising, over a faint sheet
  g.fillStyle = 'rgb(46,46,46)'; g.fillRect(0, 0, 64, 128);
  const r = seeded(17);
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.6})`; g.fillRect(r() * 62, 0, 1 + r() * 2.5, 128); }
  const lg = g.createLinearGradient(0, 0, 0, 128);
  lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = lg; g.fillRect(0, 0, 64, 128);
}, true);
const fieldTex = canvasTex(128, 128, (g) => {           // a hexagon field
  g.fillStyle = 'rgb(40,40,40)'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#FFFFFF'; g.lineWidth = 3;
  const hex = (cx, cy, r) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; g[i ? 'lineTo' : 'moveTo'](cx + r * Math.cos(a), cy + r * Math.sin(a)); } g.closePath(); g.stroke(); };
  for (let row = -1; row < 4; row++) for (let col = -1; col < 3; col++) hex(col * 64 + (row % 2 ? 32 : 0) + 16, row * 37, 21);
}, true);
function buildCurtain(pc) {
  const H = 1.5, mat = glowMat(TINTS[pc.col], 0.9, curtainTex);
  const sheet = new Mesh(new PlaneGeometry(pc.w, H), mat);
  sheet.material.side = DoubleSide;
  sheet.position.set(pc.x, pc.y + H / 2, pc.z);
  const bar = new Mesh(new BoxGeometry(pc.w + 0.1, 0.07, 0.07), new MeshBasicMaterial({ color: TINTS[pc.col], toneMapped: false }));
  bar.position.set(pc.x, pc.y + H, pc.z);
  levelGroup.add(sheet, bar);
  curtains.push({ ...pc, mat, flash: 0, parts: [sheet, bar] });
}
function buildLock(pc) {
  const H = 1.8, w = pc.w + 0.3;
  const mat = glowMat(TINTS[pc.col], 0.75, fieldTex.clone());
  mat.map.repeat.set(w / 1.2, H / 1.2); mat.side = DoubleSide;
  const wall = new Mesh(new PlaneGeometry(w, H), mat);
  wall.position.set(pc.x, pc.y + H / 2, pc.z);
  const frame = new MeshBasicMaterial({ color: TINTS[pc.col], toneMapped: false }), frames = [];
  for (const [sx, sy, px, py] of [[w, 0.08, 0, H], [0.08, H, -w / 2, H / 2], [0.08, H, w / 2, H / 2]]) {
    const b = new Mesh(new BoxGeometry(sx, sy, 0.1), frame);
    b.position.set(pc.x + px, pc.y + py, pc.z);
    levelGroup.add(b); frames.push(b);
  }
  levelGroup.add(wall);
  const q = new Quaternion();
  locks.push({ mesh: wall, mat, pos: new Vector3(pc.x, pc.y + H / 2, pc.z), prev: new Vector3(), quat: q, inv: q.clone().invert(),
               half: new Vector3(w / 2, H / 2, 0.12), delta: new Vector3(), ferry: null, lock: pc.col, flash: 0, buzzT: 0, z: pc.z, frames });
}
// The marble wears its colour as a soft glow and in its trail.
const aura = new Sprite(new SpriteMaterial({ map: dot, color: TINTS[1], transparent: true, opacity: 1,
  blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
aura.scale.set(2.6, 2.6, 1); aura.visible = false;
const auraRing = new Mesh(new RingGeometry(0.46, 0.62, 48), new MeshBasicMaterial({ color: TINTS[1], transparent: true, opacity: 0.95,
  blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
auraRing.rotation.x = -Math.PI / 2; auraRing.visible = false;
scene.add(aura, auraRing);
function setTint(col) {
  if (ball.tint === col) return;
  ball.tint = col;
  if (col) { aura.material.color.setHex(TINTS[col]); auraRing.material.color.setHex(TINTS[col]); }
  if (lastTrail) lastTrail.mesh.material.color.setHex(TINTS[col]);
}
// Every physics step: a curtain crossed colours the marble; a wall of its own
// colour, passed, answers with a ripple.
function tintStep() {
  for (const c of curtains) {
    if (Math.abs(ball.p.z - c.z) < 0.2 && Math.abs(ball.p.x - c.x) < c.w / 2 + 0.1 && Math.abs(ball.p.y - R - c.y) < 0.8 && ball.tint !== c.col) {
      setTint(c.col); c.flash = 1; sound('tint');
    }
  }
  for (const c of locks) {
    if (ball.tint === c.lock && Math.abs(ball.p.z - c.z) < 0.15 && Math.abs(ball.p.x - c.pos.x) < c.half.x && !c.passing) { c.passing = true; c.flash = 1; sound('pass'); }
    if (Math.abs(ball.p.z - c.z) > 1) c.passing = false;
  }
}
function animateTints(dt) {
  const charged = plazas.some((P) => P.charged);
  if (charged) {                                        // charged: the aura in lightning yellow, flickering (over any colour)
    aura.visible = auraRing.visible = !!renderer;
    aura.material.color.setHex(CHARGE_COL); auraRing.material.color.setHex(CHARGE_COL);
    aura.material.opacity = REDUCED ? 0.8 : 0.55 + 0.45 * Math.abs(Math.sin(simT * 23) * Math.sin(simT * 7));
    aura.position.copy(marble.position);
    auraRing.position.set(marble.position.x, marble.position.y - R + 0.03, marble.position.z);
    return;
  }
  aura.material.opacity = 1;
  if (ball.tint) { aura.material.color.setHex(TINTS[ball.tint]); auraRing.material.color.setHex(TINTS[ball.tint]); }
  aura.visible = auraRing.visible = !!ball.tint && !!renderer;
  aura.position.copy(marble.position);
  auraRing.position.set(marble.position.x, marble.position.y - R + 0.03, marble.position.z);
  if (!REDUCED) curtainTex.offset.y -= dt * 0.6;
  for (const c of curtains) { c.flash = Math.max(0, c.flash - dt * 2.5); c.mat.opacity = 0.9 + 0.1 * c.flash; }
  for (const c of locks) { c.flash = Math.max(0, c.flash - dt * 2.5); c.buzzT = Math.max(0, c.buzzT - dt); c.mat.opacity = 0.75 + 0.25 * c.flash; }
}

/* THE LOOP, as a surface. In its own plane (u forward, y up) its line is three
   arcs meeting without a kink: a lead-in of radius LOOP_RA from the flat road
   turning up through LOOP_A, the loop of radius LOOP_R, and a lead-out that
   mirrors the lead-in and lands flat. It is sampled finely, and the marble
   meets the nearest sample's surface along its own normal, so it rolls round
   a curve, not over a chain of boxes, and keeps its speed. Across the band it
   steps over by `shift` from start to end. A marble that comes in fast (the
   yellow arrows) is carried: on the steep part the stick rests, nothing slows
   it, and it never drops below a pace that clears the top. The camera swings
   out to the side to show the loop, and back. */
function loopProfile() {
  const pts = [], a = LOOP_A, Ra = LOOP_RA, r = LOOP_R, cu = (Ra - r) * Math.sin(a), cy = Ra - (Ra - r) * Math.cos(a);
  let s = 0;
  const add = (u, y, f) => { if (pts.length) { const q = pts[pts.length - 1]; s += Math.hypot(u - q[0], y - q[1]); } pts.push([u, y, f, s]); };
  for (let f = 0; f < a; f += 0.02 / Ra) add(Ra * Math.sin(f), Ra - Ra * Math.cos(f), f);
  for (let f = a; f < 2 * Math.PI - a; f += 0.02 / r) add(cu + r * Math.sin(f), cy - r * Math.cos(f), f);
  for (let f = 2 * Math.PI - a; f <= 2 * Math.PI + 1e-9; f += 0.02 / Ra) add(2 * cu + Ra * Math.sin(f), Ra - Ra * Math.cos(f), f);
  return { pts, len: s, top: cy + r };
}
const LOOP_PROFILE = loopProfile();
function buildLoop(pc) {
  const P = LOOP_PROFILE, L = { x0: pc.x, y0: pc.y, z0: pc.z, shift: pc.shift, w: pc.w, ride: false, cx: pc.x, cy: pc.y + LOOP_PROFILE.top / 2 };
  // A point of the band: along it at sample i, across it at a (-1 to 1), lifted h off its surface.
  const at = (i, a, h) => {
    const [u, y, f, s] = P.pts[i], nx = -Math.sin(f), ny = Math.cos(f);
    return [pc.x + pc.shift * s / P.len + a * pc.w / 2, pc.y + y + ny * h, pc.z - (u + nx * h)];
  };
  const idx = [], pos = [], uv = [];
  const strip = (a0, h0, a1, h1, flip) => {
    const b = pos.length / 3;
    for (let i = 0; i < P.pts.length; i += 3) {
      pos.push(...at(i, a0, h0), ...at(i, a1, h1));
      const v = P.pts[i][3] / 2; uv.push((a0 + 1) * pc.w / 4, v, (a1 + 1) * pc.w / 4, v);
    }
    const n = (pos.length / 3 - b) / 2;
    for (let i = 0; i < n - 1; i++) { const k = b + i * 2; if (flip) idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); else idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  };
  const mesh = (flipSets) => {
    pos.length = 0; uv.length = 0; idx.length = 0;
    for (const f of flipSets) strip(...f);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos.slice(), 3)); g.setAttribute('uv', new Float32BufferAttribute(uv.slice(), 2));
    g.setIndex(idx.slice()); g.computeVertexNormals();
    return g;
  };
  const M = neonMats.glowgrid || (neonMats.glowgrid = neonMaterials('glowgrid'));
  const surface = new Mesh(mesh([[-1, 0, 1, 0, false]]), M.top);                  // where the marble rolls
  const back = new Mesh(mesh([[-1, -0.18, 1, -0.18, true]]), M.top);               // the other side of the band, gridded too
  const walls = new Mesh(mesh([[-1, 0, -1, 0.3, true], [1, 0, 1, 0.3, false], [-1, -0.18, -1, 0, true], [1, -0.18, 1, 0, false]]), M.side);
  surface.receiveShadow = true;
  levelGroup.add(surface, back, walls);
  // A bright line along the top of each low wall.
  const n = Math.floor(P.pts.length / 3), bars = new InstancedMesh(new BoxGeometry(0.06, 0.06, 1.02), new MeshBasicMaterial({ color: 0xFF8AE8, toneMapped: false }), 2 * n);
  const o = new Object3D();
  let k = 0;
  for (const a of [-1, 1]) for (let i = 0; i + 3 < P.pts.length; i += 3) {
    const p = at(i, a, 0.3), q = at(i + 3, a, 0.3);
    o.position.set((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
    o.lookAt(q[0], q[1], q[2]); o.scale.set(1, 1, Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]));
    o.updateMatrix(); bars.setMatrixAt(k++, o.matrix);
  }
  bars.count = k;
  levelGroup.add(bars);
  L.look = { surface, back, walls, bars, w: pc.w };
  loopsIn.push(L);
}
// A loop dressed in a world's rail: the neon city's gridded glass is every world's default; Tokyo Drift gives it its gold rail.
function loopLook(L, top, side, lineHex) {
  const K = L.look;
  if (!K) return;
  K.surface.material = K.back.material = top; K.walls.material = side; K.bars.material.color.setHex(lineHex);
}
// Every physics step: the loop's surface against the marble.
function loopContact(L) {
  const P = LOOP_PROFILE, u = L.z0 - ball.p.z, yb = ball.p.y - L.y0;
  if (u < -0.6 || u > LOOP_RUN + 3.4 || yb < -1.2 || yb > P.top + 1.2) { L.ride = false; return; }
  let best = -1, bd = 1e9;
  for (let i = 0; i < P.pts.length; i++) {
    const [pu, py, , s] = P.pts[i];
    if (Math.abs(ball.p.x - (L.x0 + L.shift * s / P.len)) > L.w / 2 + 0.12) continue;
    const d = (u - pu) * (u - pu) + (yb - py) * (yb - py);
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0 || bd > 1.2) return;
  const [pu, py, f, s] = P.pts[best], nu = -Math.sin(f), ny = Math.cos(f);
  const d = (u - pu) * nu + (yb - py) * ny;                  // how far off the surface, along its normal
  if (d > R + 0.02 || d < R - 0.7) return;
  const push = R - d;
  if (push > 0) { ball.p.z -= nu * push; ball.p.y += ny * push; }
  // Velocity in the loop's plane: forward (-z) and up.
  let vu = -ball.v.z, vy = ball.v.y;
  const vn = vu * nu + vy * ny;
  if (vn < 0) { vu -= vn * nu; vy -= vn * ny; }
  const steep = f > 0.35 && f < 2 * Math.PI - 0.35;
  if (!steep) {
    ball.grounded = true;                                    // the gentle ends are road
    if (f < 0.35) L.ride = vu > 10;                          // coming in fast enough to be carried
  } else {
    ball.onLoop = L; ball.p.x = L.x0 + L.shift * s / P.len; ball.v.x = 0;
    if (L.ride) {                                           // carried: never below a pace that clears the top
      const sp = vu * Math.cos(f) + vy * Math.sin(f);
      if (sp < 8.5) { vu += (8.5 - sp) * Math.cos(f); vy += (8.5 - sp) * Math.sin(f); }
    }
  }
  ball.v.z = -vu; ball.v.y = vy;
}

/* WORMHOLES (owner, 2026-09-27: "wormholes that put you in a completely
   different world that you have to pass to get to the other side"; the
   crystal canyon first). A ring of light standing across the road with a
   swirl turning inside it. Roll in and the city gives way to the canyon in a
   burst of light; the canyon's course ends at a second wormhole, which brings
   the marble back out of the first one's twin, past a gap nothing else can
   cross. Coming out, the twin closes behind the marble, so it never stands
   between the camera and the marble. */
const vortexTex = canvasTex(256, 256, (g) => {
  const img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const dx = (x - 127.5) / 128, dy = (y - 127.5) / 128, rr = Math.hypot(dx, dy), i = (y * 256 + x) * 4;
    if (rr >= 1) { img.data[i + 3] = 255; continue; }
    const arms = Math.pow(0.5 + 0.5 * Math.cos(3 * (Math.atan2(dy, dx) + 5.5 * rr)), 2);
    const v = Math.min(1, arms * Math.pow(1 - rr, 0.5) * 0.85 + Math.exp(-rr * rr * 28));
    const mid = Math.min(1, rr * 1.6), rim = Math.max(0, rr * 2 - 1);      // white core, violet, cyan at the rim
    img.data[i] = v * (255 - 95 * mid - 80 * rim); img.data[i + 1] = v * (255 - 135 * mid + 90 * rim); img.data[i + 2] = v * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
});
function buildWormhole(pc) {
  const rad = Math.max(1.5, pc.w / 2 + 0.4), grp = new Group();
  const disc = new Mesh(new CircleGeometry(rad * 0.96, 64), glowMat(0xFFFFFF, 0.95, vortexTex));
  disc.material.side = DoubleSide;
  const ring = new Mesh(new TorusGeometry(rad, 0.1, 12, 72), new MeshBasicMaterial({ color: 0xEFE6FF, toneMapped: false }));
  const halo = new Mesh(new TorusGeometry(rad, 0.3, 10, 72), glowMat(0xA78BFF, 0.4));
  grp.add(disc, ring, halo);
  grp.position.set(pc.x, pc.y + rad, pc.z);
  levelGroup.add(grp);
  const W = { pc, grp, disc, rad, open: 1, closing: false, spin: pc.dir === 'out' ? -1.4 : 1.4 };
  wormholes.push(W);
  if (pc.dir === 'out') { const twin = [...wormholes].reverse().find((o) => o.pc.dir === 'in' && !o.twin); if (twin) twin.twin = W; }
}
function animateWormholes(dt) {
  for (const W of wormholes) {
    if (!REDUCED) W.disc.rotation.z += dt * W.spin;
    if (W.closing) W.open = Math.max(0, W.open - dt / 0.6);
    W.grp.scale.setScalar(Math.max(0.001, ease(W.open)));
    W.grp.visible = W.open > 0;
  }
}
const inPortal = (W) => W.open > 0.5 && Math.abs(ball.p.z - W.pc.z) < 0.35 && Math.abs(ball.p.x - W.pc.x) < W.rad &&
                        ball.p.y - R > W.pc.y - 0.5 && ball.p.y - R < W.pc.y + W.rad * 2;
// The jump between worlds: the course left behind waits, hidden, until the
// marble comes back.
let pocket = null;
const WARP_IN = 0.35, WARP_OUT = 0.5;
const warp = { go: null, done: false };
function startWarp(W) {
  warp.go = W.pc.dir === 'in' ? () => enterPocket(W) : leavePocket;
  warp.done = false;
  ball.v.set(0, 0, 0); ball.onFerry = null;
  sound('warp');
  setState('warp');
}
function freeCourse(grp) {
  for (const c of holos) for (const m of c.holoMats) m.dispose();
  for (const c of pads) if (c.padFx.tex) c.padFx.tex.dispose();
  for (const c of ferries) if (c.train) for (const t of c.train.model.userData.maps) t.dispose();
  for (const c of locks) c.mat.map.dispose();
  for (const c of mags) c.magFx.tex.dispose();
  for (const S of switches) if (S.top) { S.top.dispose(); S.side.dispose(); }
  for (const c of colliders) if (c.obstacle) new Set([].concat(c.mesh.material)).forEach((m) => { if (!m.userData.keep) m.dispose(); });
  scene.remove(grp);
  grp.traverse((o) => {
    if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose();
    if (o.material && !Array.isArray(o.material) && !o.material.userData.keep) o.material.dispose();
  });
}
function enterPocket(W) {
  pocket = { colliders, ferries, holos, pads, crossings, riders, curtains, locks, wormholes, loopsIn, mags, winds, rounds, tubes, switches, scans, posts, blinkers, flames, cracks, plazas, gates, goal, level, levelGroup,
             world: world.name, from: W };
  levelGroup.visible = false;
  const P = W.pc.pocket;
  levelGroup = new Group(); scene.add(levelGroup);
  colliders = []; ferries = []; holos = []; pads = []; crossings = []; riders = []; curtains = []; locks = []; wormholes = []; loopsIn = []; mags = []; winds = []; rounds = []; tubes = []; switches = []; scans = []; posts = []; blinkers = []; flames = []; cracks = []; plazas = []; gates = [];
  goal = null;
  level = { pieces: P.pieces, gates: [], start: P.start, world: P.world };
  for (const pc of P.pieces) buildPiece(pc);
  level.minTop = Math.min(...P.pieces.map((q) => q.y));
  setWorld(P.world);
  const [sx, sy, sz] = P.start;
  spawn.set(sx, sy + R + 0.01, sz);
  ball.p.copy(spawn); ball.v.set(0, 0, -2.5);
  ball.grounded = true; ball.airT = 0; ball.boostT = 0; ball.hitT = 0;
  lastGroundY = sy;
  ripple(ball.p);
}
function leavePocket() {
  freeCourse(levelGroup);
  const S = pocket; pocket = null;
  ({ colliders, ferries, holos, pads, crossings, riders, curtains, locks, wormholes, loopsIn, mags, winds, rounds, tubes, switches, scans, posts, blinkers, flames, cracks, plazas, gates, goal, level, levelGroup } = S);
  levelGroup.visible = true;
  setWorld(S.world);
  const out = S.from.twin;
  // Come out of the twin, rolling on, and it closes behind; this is a place to come back to after a fall.
  spawn.set(out.pc.x, out.pc.y + R + 0.01, out.pc.z - 1.2); spawnTint = ball.tint;
  ball.p.copy(spawn); ball.v.set(0, 0, -3);
  ball.grounded = true; ball.airT = 0;
  lastGroundY = out.pc.y;
  out.closing = true;
  ripple(ball.p);
}
// A ring of light on the road where the marble comes out.
const rippleMesh = new Mesh(new RingGeometry(0.8, 1, 64), glowMat(0xCFC0FF, 0));
rippleMesh.rotation.x = -Math.PI / 2; rippleMesh.visible = false; scene.add(rippleMesh);
let rippleT = 1;
function ripple(p) { rippleMesh.position.set(p.x, p.y - R + 0.03, p.z); rippleT = 0; }
function animateRipple(dt) {
  rippleT = Math.min(1, rippleT + dt / 0.8);
  rippleMesh.visible = rippleT < 1;
  rippleMesh.scale.setScalar(0.4 + 2.6 * ease(rippleT));
  rippleMesh.material.opacity = 0.9 * (1 - rippleT);
}

// Where each car of a lane is along it, at time t: s runs the way the lane goes.
const carS = (lane, i, t) => (((lane.speed * t + lane.phase * lane.len + lane.at[i]) % lane.len) + lane.len) % lane.len;
function crossingGreen(X, t) {
  for (const lane of X.lanes) {
    const Z = X.w / 2 + (X.fire ? FB_R : CAR_HX) + R, mid = lane.len / 2;
    for (let i = 0; i < lane.at.length; i++) {
      const s = carS(lane, i, t);
      if (s > mid - Z - lane.speed * (X.warn || CROSS_WARN) && s < mid + Z) return false;
    }
  }
  return true;
}
// Every physics step: move the cars, and throw the marble if one meets it.
function crossStep(c, t) {
  const X = c.cross;
  for (const car of X.cars) {
    const L = car.lane, s = carS(L, car.i, t);
    car.x = X.x - L.dir * L.len / 2 + L.dir * s;
    if (ball.hitT > 0 || state !== 'play') continue;
    if (X.fire) {                                       // a fireball: a sphere rolling in its channel
      const dx = ball.p.x - car.x, dy = ball.p.y - (X.top + FB_R - 0.05), dz = ball.p.z - L.z, rr = R + FB_R - 0.05;
      if (dx * dx + dy * dy + dz * dz < rr * rr) {
        ball.v.set(L.dir * Math.max(10, L.speed * 1.4), 5, ball.v.z * 0.3);
        ball.hitT = 0.6; ball.onFerry = null; shake = 0.4;
        sound('blast'); burst(ball.p.x, ball.p.y, ball.p.z, 0xFF7A1A, 28, 4); burst(ball.p.x, ball.p.y, ball.p.z, 0xFFE08A, 12, 3);
      }
      continue;
    }
    const cy = X.top + CAR_LIFT;
    const dx = ball.p.x - clamp(ball.p.x, car.x - CAR_HX, car.x + CAR_HX);
    const dy = ball.p.y - clamp(ball.p.y, cy - CAR_HY, cy + CAR_HY);
    const dz = ball.p.z - clamp(ball.p.z, L.z - CAR_HZ, L.z + CAR_HZ);
    if (dx * dx + dy * dy + dz * dz < R * R) {
      ball.v.set(L.dir * Math.max(11, L.speed * 1.3), 5.5, ball.v.z * 0.3);
      ball.hitT = 0.6; ball.onFerry = null; shake = 0.35;
      sound('bump');
    }
  }
  const green = crossingGreen(X, t);
  if (green && !X.green) X.greenSince = t;
  X.green = green;
}
function animateCrossings() {
  for (const c of crossings) {
    const X = c.cross;
    for (const car of X.cars) {
      if (!X.fire) { car.mesh.position.set(car.x, X.top + CAR_LIFT, car.lane.z); continue; }
      const y = X.top + FB_R - 0.05;
      car.mesh.position.set(car.x, y, car.lane.z);
      car.ball.rotation.z = -car.x / FB_R;               // rolling
      car.trail.forEach((sp, k) => {                      // a tail of flame streaming out behind
        sp.position.set(car.x - car.lane.dir * (0.45 + k * 0.42), y + 0.05 + k * 0.1, car.lane.z);
        const f = 1 - k / car.trail.length, fl = 0.85 + 0.15 * Math.sin(simT * 17 + k + car.i);
        sp.scale.set(1.3 * f * fl, 1.3 * f * fl, 1); sp.material.opacity = 0.8 * f;
      });
    }
    for (const L of X.lights) {
      const col = X.green ? 0x3DFF8A : 0xFF2D48;
      L.lamp.material.color.setHex(col); L.halo.material.color.setHex(col);
    }
  }
}

/* THE PUZZLE SQUARES, built. The floor is course, a slab to a cell, so each
   world styles it (the city lays each cell as a tile with a glowing edge).
   Walls and gates are their own: dark walls with a bright line along the top;
   a gate of glowing bars in the colour of the key that opens it, that key's
   sign lying over it. A key floats turning over its stand, and the key the
   marble carries floats over the marble, so what you hold is always in view. */
const PAD_R = 0.75, GATE_H = 1.1, KEY_UP = 1.05, KEY_FLY = 0.38;
const KEY_COLS = [0xFFFFFF, 0xFFC83D, 0xD8E6F6, 0xFF8A55];   // none, gold, silver, copper
// A key's bow is its sign: gold round, silver three-sided, copper square.
function bowGeo(n, rad, tube) {
  const g = new TorusGeometry(rad, tube, 8, [40, 40, 3, 4][n]);
  if (n === 2) g.rotateZ(Math.PI / 3);                 // a point away from the shaft
  if (n === 3) g.rotateZ(Math.PI / 4);                 // flat sides
  return g;
}
const lineGlowTex = canvasTex(8, 64, (g) => {           // a line's halo, across v: bright in the middle, gone at the edges
  const lg = g.createLinearGradient(0, 0, 0, 64);
  lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.36, 'rgba(255,255,255,0.18)');
  lg.addColorStop(0.5, 'rgba(255,255,255,0.9)'); lg.addColorStop(0.64, 'rgba(255,255,255,0.18)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = lg; g.fillRect(0, 0, 8, 64);
});
const wallGlowTex = canvasTex(8, 64, (g) => {          // a wall's sides: lit along the top, dark at the foot
  const lg = g.createLinearGradient(0, 0, 0, 64);
  lg.addColorStop(0, 'rgb(170,150,255)'); lg.addColorStop(0.18, 'rgb(70,58,140)'); lg.addColorStop(1, 'rgb(6,6,16)');
  g.fillStyle = lg; g.fillRect(0, 0, 8, 64);
});
const sheetTex = canvasTex(8, 64, (g) => {              // the light between a gate's bars: strongest at the foot
  const lg = g.createLinearGradient(0, 0, 0, 64);
  lg.addColorStop(0, 'rgba(255,255,255,0.05)'); lg.addColorStop(1, 'rgba(255,255,255,0.75)');
  g.fillStyle = lg; g.fillRect(0, 0, 8, 64);
});
const resetGlyph = canvasTex(128, 128, (g) => {          // a circling arrow: put it back
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  const arrow = (w) => {
    g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.arc(64, 64, 34, -Math.PI * 0.2, Math.PI * 1.45); g.stroke();
    const a = Math.PI * 1.45, tx = 64 + 34 * Math.cos(a), ty = 64 + 34 * Math.sin(a);
    g.beginPath(); g.moveTo(tx - 16, ty - 4); g.lineTo(tx + 2, ty - 2); g.lineTo(tx - 4, ty + 16); g.stroke();
  };
  g.filter = 'blur(5px)'; g.strokeStyle = 'rgba(255,255,255,0.8)'; arrow(16);
  g.filter = 'none'; g.strokeStyle = '#FFFFFF'; arrow(7);
});
function keyModel(n, P) {
  const mat = P.mats.key[n], g = new Group(), inner = new Group();
  const edge = [0, 0.19, 0.095, 0.134][n];
  const bow = new Mesh(bowGeo(n, 0.19, 0.055), mat);
  const shaft = new Mesh(new BoxGeometry(0.72 - edge, 0.075, 0.075), mat); shaft.position.x = (edge + 0.72) / 2;
  const bit1 = new Mesh(new BoxGeometry(0.075, 0.17, 0.075), mat); bit1.position.set(0.66, -0.1, 0);
  const bit2 = new Mesh(new BoxGeometry(0.075, 0.11, 0.075), mat); bit2.position.set(0.52, -0.07, 0);
  inner.add(bow, shaft, bit1, bit2); inner.position.x = -0.26 * 1.4; inner.scale.setScalar(1.4);
  for (const m of [bow, shaft, bit1, bit2]) m.castShadow = true;
  const glow = new Sprite(new SpriteMaterial({ map: dot, color: KEY_COLS[n], transparent: true, opacity: 0.42,
    blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  glow.scale.set(1.9, 1.9, 1);
  g.add(glow, inner);
  g.rotation.order = 'YXZ';                            // turning about the upright, lying back toward the camera
  levelGroup.add(g);
  return g;
}
function buildPlaza(pc) {
  const G = plazaGrid(pc);
  const P = { pc, grid: G, x0: pc.x0, z0: pc.z0, y: pc.y, cols: pc.cols, rows: pc.rows, stands: [], gates: [], keys: [],
              held: null, onPad: -1, cam: null, reset: null, noteT: 0 };
  const X = P.X = (c) => P.x0 + (c + 0.5) * CELL, Z = P.Z = (r) => P.z0 - (r + 0.5) * CELL;
  const env = neonEnvMap() || envTex;
  P.mats = {
    wall: new MeshStandardMaterial({ color: 0x141833, metalness: 0.4, roughness: 0.4, emissive: 0xFFFFFF, emissiveMap: wallGlowTex, emissiveIntensity: 1 }),
    line: new MeshBasicMaterial({ color: 0xF6F2FF, toneMapped: false }),
    halo: glowMat(0xB7A6FF, 0.85, lineGlowTex),
    base: new MeshStandardMaterial({ color: 0x151A2A, metalness: 0.7, roughness: 0.3, envMap: env }),
    key: KEY_COLS.map((col) => new MeshStandardMaterial({ color: col, metalness: 0.85, roughness: 0.25, emissive: col, emissiveIntensity: 0.5, envMap: env })),
  };
  // The floor: a slab to a cell.
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
    if (!G.cells[r][c].void && !('tile' in G.cells[r][c])) buildPiece({ t: 'flat', x: X(c), z: Z(r), w: CELL, d: CELL, y: P.y, cell: true, pit: G.cells[r][c].pit });
  }
  // The walls, a straight run of wall edges at a time, each end reaching over the corner.
  const wallRun = (x, z, lx, lz) => {
    const box = new Mesh(new BoxGeometry(lx, WALL_H, lz), P.mats.wall);   // one material, one draw call
    box.position.set(x, P.y + WALL_H / 2, z); box.castShadow = true; box.receiveShadow = true;
    const L = Math.max(lx, lz), along = lx > lz;
    const line = new Mesh(new BoxGeometry(along ? L : 0.05, 0.02, along ? 0.05 : L), P.mats.line);
    line.position.set(x, P.y + WALL_H + 0.011, z);
    const halo = new Mesh(new PlaneGeometry(L + 0.24, 0.5), P.mats.halo);
    halo.rotation.set(-Math.PI / 2, 0, along ? 0 : Math.PI / 2); halo.position.set(x, P.y + WALL_H + 0.024, z);
    levelGroup.add(box, line, halo);
    colliders.push({ mesh: box, pos: box.position.clone(), prev: box.position.clone(), quat: new Quaternion(), inv: new Quaternion(),
                     half: new Vector3(lx / 2, WALL_H / 2, lz / 2), delta: new Vector3(), ferry: null, holo: null, pad: null, obstacle: 'wall' });
  };
  for (let k = 0; k <= P.rows; k++) for (let c = 0, c0 = -1; c <= P.cols; c++) {
    const w = c < P.cols && plazaWall(G.h[k][c]);
    if (w && c0 < 0) c0 = c;
    if (!w && c0 >= 0) { const a = P.x0 + c0 * CELL - WALL_T / 2, b = P.x0 + c * CELL + WALL_T / 2; wallRun((a + b) / 2, P.z0 - k * CELL, b - a, WALL_T); c0 = -1; }
  }
  for (let c = 0; c <= P.cols; c++) for (let r = 0, r0 = -1; r <= P.rows; r++) {
    const w = r < P.rows && plazaWall(G.v[r][c]);
    if (w && r0 < 0) r0 = r;
    if (!w && r0 >= 0) { const a = P.z0 - r0 * CELL + WALL_T / 2, b = P.z0 - r * CELL - WALL_T / 2; wallRun(P.x0 + c * CELL, (a + b) / 2, WALL_T, a - b); r0 = -1; }
  }
  if (pc.ice) buildIce(P);
  if (pc.cover) buildCover(P);
  if (pc.tune) buildTune(P);
  if (pc.twin) buildTwin(P);
  // The gates.
  // (Each is named by its edge as the search names it: H c,k is the south edge of row k in column c; V c,r the west edge of column c in row r.)
  for (let k = 0; k <= P.rows; k++) for (let c = 0; c < P.cols; c++) if (G.h[k][c] && !plazaWall(G.h[k][c])) buildGate(P, G.h[k][c], X(c), P.z0 - k * CELL, true, 'H' + c + ',' + k);
  for (let r = 0; r < P.rows; r++) for (let c = 0; c <= P.cols; c++) if (G.v[r][c] && !plazaWall(G.v[r][c])) buildGate(P, G.v[r][c], P.x0 + c * CELL, Z(r), false, 'V' + c + ',' + r);
  // The stands, and their keys.
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
    const cell = G.cells[r][c];
    if (!('key' in cell)) continue;
    const grp = new Group(); grp.position.set(X(c), P.y, Z(r));
    const base = new Mesh(new CylinderGeometry(0.62, 0.7, 0.07, 48), P.mats.base);
    base.position.y = 0.035; base.receiveShadow = true;
    const ringMat = glowMat(KEY_COLS[cell.key], 0.9);
    const ring = new Mesh(new RingGeometry(0.56, 0.6, 48), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.074;
    const pool = new Mesh(new CircleGeometry(1.05, 48), glowMat(KEY_COLS[cell.key], 0.2, dot));
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.012;
    grp.add(base, ring, pool);
    levelGroup.add(grp);
    const s = { c, r, x: X(c), z: Z(r), ringMat, pool, key: null, flash: 0 };
    if (cell.key) {
      const K = { n: cell.key, model: keyModel(cell.key, P), home: s, to: s, from: new Vector3(), t: 1, spin: Math.random() * 6 };
      s.key = K; P.keys.push(K);
    }
    P.stands.push(s);
  }
  // The switches: a round button with its letter, in its letter's colour.
  P.switches = [];
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
    const cell = G.cells[r][c];
    if (!('switch' in cell)) continue;
    const col = LETTER_COLS[cell.switch], grp = new Group(); grp.position.set(X(c), P.y, Z(r));
    const base = new Mesh(new CylinderGeometry(0.72, 0.8, 0.06, 48), P.mats.base); base.position.y = 0.03; base.receiveShadow = true;
    const button = new Group();
    const cap = new Mesh(new CylinderGeometry(0.56, 0.6, 0.1, 48), new MeshStandardMaterial({ color: 0x1B2138, metalness: 0.6, roughness: 0.3, emissive: col, emissiveIntensity: 0.25 }));
    cap.position.y = 0.11;
    const faceMat = new MeshBasicMaterial({ color: col, map: glyphTex(cell.switch), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    const face = new Mesh(new CircleGeometry(0.5, 40), faceMat); face.rotation.x = -Math.PI / 2; face.position.y = 0.162;
    button.add(cap, face);
    const ringMat = glowMat(col, 0.85), ring = new Mesh(new RingGeometry(0.66, 0.72, 48), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.065;
    const pool = new Mesh(new CircleGeometry(1.1, 48), glowMat(col, 0.18, dot)); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.012;
    grp.add(base, button, ring, pool);
    levelGroup.add(grp);
    P.switches.push({ c, r, letter: cell.switch, button, faceMat, ringMat, pool, press: 0 });
  }
  // The plates: square, low, in their letter's colour; they sink when pressed.
  P.plates = [];
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
    const cell = G.cells[r][c];
    if (!('plate' in cell)) continue;
    const col = LETTER_COLS[cell.plate], grp = new Group(); grp.position.set(X(c), P.y, Z(r));
    const frame = new Mesh(new BoxGeometry(1.66, 0.05, 1.66), P.mats.base); frame.position.y = 0.025; frame.receiveShadow = true;
    const top = new Group();
    const slabMat = new MeshStandardMaterial({ color: 0x1B2138, metalness: 0.6, roughness: 0.35, emissive: col, emissiveIntensity: 0.2 });
    const slab = new Mesh(new BoxGeometry(1.36, 0.07, 1.36), slabMat); slab.position.y = 0.085; slab.receiveShadow = true;
    const faceMat = new MeshBasicMaterial({ color: col, map: plateTex, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    const face = new Mesh(new PlaneGeometry(1.36, 1.36), faceMat); face.rotation.x = -Math.PI / 2; face.position.y = 0.122;
    const glyphMat = new MeshBasicMaterial({ color: col, map: glyphTex(cell.plate), transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    const glyph = new Mesh(new PlaneGeometry(0.66, 0.66), glyphMat); glyph.rotation.x = -Math.PI / 2; glyph.position.y = 0.124;
    top.add(slab, face, glyph);
    const pool = new Mesh(new CircleGeometry(1.15, 48), glowMat(col, 0.14, dot)); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.012;
    grp.add(frame, top, pool);
    levelGroup.add(grp);
    P.plates.push({ c, r, letter: cell.plate, top, slabMat, faceMat, glyphMat, pool, on: false, k: 0, flash: 0 });
  }
  // The crates: heavy, pushed a cell at a time.
  P.crates = [];
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
    if (!G.cells[r][c].weight) continue;
    if (!P.mats.crate) {
      const side = new MeshStandardMaterial({ color: 0x1A1612, metalness: 0.55, roughness: 0.45, emissive: 0xFFFFFF, emissiveMap: weightSideTex, emissiveIntensity: 1 });
      const top = new MeshStandardMaterial({ color: 0x1A1612, metalness: 0.55, roughness: 0.45, emissive: 0xFFFFFF, emissiveMap: weightTopTex, emissiveIntensity: 1 });
      P.mats.crate = [side, side, top, P.mats.base, side, side];
    }
    const mesh = new Mesh(new BoxGeometry(CRATE, CRATE_H, CRATE), P.mats.crate);
    mesh.position.set(X(c), P.y + CRATE_H / 2, Z(r)); mesh.castShadow = true; mesh.receiveShadow = true;
    levelGroup.add(mesh);
    const W = { P, c, r, c0: c, r0: r, mesh, moving: false, t: 0, fc: c, fr: r, tc: c, tr: r, pushT: 0, blockT: -9 };
    const q = new Quaternion();
    W.col = { mesh, pos: mesh.position.clone(), prev: mesh.position.clone(), quat: q, inv: q.clone(), half: new Vector3(CRATE / 2, CRATE_H / 2, CRATE / 2),
              delta: new Vector3(), ferry: null, holo: null, pad: null, obstacle: 'weight', crate: W };
    colliders.push(W.col); P.crates.push(W);
  }
  // The gaps a crate can fill: an amber rim round each, the crates' own colour.
  P.pits = [];
  for (const col of colliders) if (col.pit && col.cell && Math.abs(col.pos.y + col.half.y - P.y) < 0.01) {
    const c = Math.floor((col.pos.x - P.x0) / CELL), r = Math.floor((P.z0 - col.pos.z) / CELL);
    if (c < 0 || c >= P.cols || r < 0 || r >= P.rows) continue;
    if (!P.mats.pit) P.mats.pit = new MeshBasicMaterial({ color: 0xFFB250, toneMapped: false });
    const rim = new Group();
    for (const [dx, dz, w, d] of [[0, 1, 1, 0], [0, -1, 1, 0], [1, 0, 0, 1], [-1, 0, 0, 1]]) {
      const bar = new Mesh(new BoxGeometry(w ? CELL - 0.1 : 0.09, 0.05, d ? CELL - 0.1 : 0.09), P.mats.pit);
      bar.position.set(P.X(c) + dx * (CELL / 2 - 0.1), P.y + 0.03, P.Z(r) - dz * (CELL / 2 - 0.1)); rim.add(bar);
    }
    levelGroup.add(rim);
    P.pits.push({ c, r, col, rim });
  }
  // The turning sections: a square of road over the gap on a pivot, lit along the road it makes, with a
  // railing on each side it does not join, the way a bridge has parapets. Only the joined sides are open.
  P.tiles = [];
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
    const cell = G.cells[r][c];
    if (!('tile' in cell)) continue;
    const col = LETTER_COLS[cell.lever[0]], grp = new Group(); grp.position.set(X(c), P.y, Z(r));
    if (!P.mats.tile) {
      P.mats.tile = new MeshStandardMaterial({ color: 0x0E1426, metalness: 0.5, roughness: 0.3 });
      P.mats.tileEdge = new MeshStandardMaterial({ color: 0x141833, metalness: 0.4, roughness: 0.4, emissive: 0xFFFFFF, emissiveMap: wallGlowTex, emissiveIntensity: 0.8 });
    }
    const stripeMat = new MeshBasicMaterial({ color: col, toneMapped: false, transparent: true, opacity: 0.9 });
    const haloMat = glowMat(col, 0.55, lineGlowTex), railTop = new MeshBasicMaterial({ color: col, toneMapped: false });
    const deck = new Mesh(new BoxGeometry(CELL - 0.08, THICK, CELL - 0.08), [P.mats.tileEdge, P.mats.tileEdge, P.mats.tile, P.mats.tile, P.mats.tileEdge, P.mats.tileEdge]);
    deck.position.y = -THICK / 2; deck.castShadow = true; deck.receiveShadow = true; grp.add(deck);
    const hubMat = new MeshBasicMaterial({ color: col, map: glyphTex(cell.lever), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    const hub = new Mesh(new CircleGeometry(0.34, 32), hubMat); hub.rotation.x = -Math.PI / 2; hub.position.y = 0.022; grp.add(hub);
    for (const [bit, dx, dz] of [[1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]]) {
      const alongX = !dx;
      if (cell.tile & bit) {                             // the road, from the middle out to this side
        const b = new Mesh(new BoxGeometry(dx ? 1.02 : 0.1, 0.02, dx ? 0.1 : 1.02), stripeMat); b.position.set(dx * 0.59, 0.012, dz * 0.59); grp.add(b);
        const h = new Mesh(new PlaneGeometry(1.3, 0.7), haloMat); h.rotation.set(-Math.PI / 2, 0, dx ? 0 : Math.PI / 2); h.position.set(dx * 0.59, 0.02, dz * 0.59); grp.add(h);
      } else {                                           // a railing along this side
        const rail = new Mesh(new BoxGeometry(alongX ? CELL - 0.08 : 0.2, RAIL_H, alongX ? 0.2 : CELL - 0.08), P.mats.wall);
        rail.position.set(dx * (CELL / 2 - 0.14), RAIL_H / 2, dz * (CELL / 2 - 0.14)); rail.castShadow = true; grp.add(rail);
        const top = new Mesh(new BoxGeometry(alongX ? CELL - 0.08 : 0.05, 0.02, alongX ? 0.05 : CELL - 0.08), railTop);
        top.position.set(dx * (CELL / 2 - 0.14), RAIL_H + 0.011, dz * (CELL / 2 - 0.14)); grp.add(top);
      }
    }
    levelGroup.add(grp);
    // For the marble: the deck, always; a railing on each side the road does not join.
    const arms = [];
    for (const [bit, dx, dz] of [[0, 0, 0], [1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]]) {
      const q = new Quaternion(), box = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), Array(6).fill(HIDDEN));
      box.visible = false; levelGroup.add(box);
      const pos = bit ? new Vector3(X(c) + dx * (CELL / 2 - 0.14), P.y + RAIL_H / 2, Z(r) + dz * (CELL / 2 - 0.14)) : new Vector3(X(c), P.y - THICK / 2, Z(r));
      const half = bit ? new Vector3(dx ? 0.1 : CELL / 2, RAIL_H / 2, dx ? CELL / 2 : 0.1) : new Vector3(CELL / 2, THICK / 2, CELL / 2);
      const col2 = { mesh: box, pos, prev: pos.clone(), quat: q, inv: q.clone(), delta: new Vector3(), ferry: null, holo: null, pad: null, obstacle: 'tile', half, arm: { bit, on: true } };
      colliders.push(col2); arms.push(col2.arm);
    }
    const T = { c, r, lever: cell.lever, mask0: cell.tile, mask: cell.tile, grp, arms, turn: 0, shown: 0, stripeMat, hubMat };
    T.setArms = () => { for (const a of T.arms) a.on = !a.bit || !(T.mask & a.bit); };   // a railing stands where the road does not join
    T.setArms();
    P.tiles.push(T);
  }
  // The levers: a disc with a turning arrow, its letter, and a handle that throws over each time.
  P.levers = [];
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
    const cell = G.cells[r][c];
    if (!('lever' in cell) || 'tile' in cell) continue;
    const col = LETTER_COLS[cell.lever], grp = new Group(); grp.position.set(X(c), P.y, Z(r));
    const base = new Mesh(new CylinderGeometry(0.72, 0.8, 0.06, 48), P.mats.base); base.position.y = 0.03; base.receiveShadow = true;
    const faceMat = new MeshBasicMaterial({ color: col, map: turnGlyph, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    const face = new Mesh(new CircleGeometry(0.66, 48), faceMat); face.rotation.x = -Math.PI / 2; face.position.y = 0.064;
    const letter = new Mesh(new CircleGeometry(0.3, 32), new MeshBasicMaterial({ color: col, map: glyphTex(cell.lever), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    letter.rotation.x = -Math.PI / 2; letter.position.y = 0.066;
    const handle = new Group();
    const stick = new Mesh(new CylinderGeometry(0.045, 0.045, 0.75, 10), P.mats.base); stick.position.y = 0.375;
    const knob = new Mesh(new SphereGeometry(0.12, 16, 12), new MeshBasicMaterial({ color: col, toneMapped: false })); knob.position.y = 0.77;
    handle.add(stick, knob); handle.position.set(0, 0.06, 0); handle.rotation.z = 0.55;
    grp.add(base, face, letter, handle);
    levelGroup.add(grp);
    P.levers.push({ c, r, letter: cell.lever, handle, faceMat, throwT: 0, side: 1 });
  }
  // Chargers and grounds: round pads, a bolt or the sign for earth. Charged floors: plus signs, and a
  // field over them that stands up when the marble is charged.
  P.charges = []; P.magnets = []; P.charged = false; P.sparkT = 0;
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
    const cell = G.cells[r][c];
    if (cell.charger || cell.ground) {
      const col = cell.charger ? CHARGE_COL : GROUND_COL, grp = new Group(); grp.position.set(X(c), P.y, Z(r));
      const base = new Mesh(new CylinderGeometry(0.72, 0.8, 0.06, 48), P.mats.base); base.position.y = 0.03; base.receiveShadow = true;
      const faceMat = new MeshBasicMaterial({ color: col, map: cell.charger ? boltTex : groundTex, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
      const face = new Mesh(new CircleGeometry(0.58, 40), faceMat); face.rotation.x = -Math.PI / 2; face.position.y = 0.064;
      const ringMat = glowMat(col, 0.85), ring = new Mesh(new RingGeometry(0.64, 0.7, 48), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.065;
      const pool = new Mesh(new CircleGeometry(1.1, 48), glowMat(col, 0.16, dot)); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.012;
      grp.add(base, face, ring, pool);
      levelGroup.add(grp);
      P.charges.push({ c, r, kind: cell.charger ? 'charger' : 'ground', faceMat, ringMat, pool, flash: 0 });
    }
    if (cell.magnet) {
      const grp = new Group(); grp.position.set(X(c), P.y, Z(r));
      const plate = new Mesh(new PlaneGeometry(CELL - 0.2, CELL - 0.2), new MeshBasicMaterial({ color: CHARGE_COL, map: plusTex, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
      plate.rotation.x = -Math.PI / 2; plate.position.y = 0.014;
      const fieldMat = glowMat(CHARGE_COL, 0, gateFieldTex); fieldMat.side = DoubleSide;
      const field = new Mesh(new BoxGeometry(CELL - 0.3, 1.1, CELL - 0.3), fieldMat); field.position.y = 0.55; field.visible = false;
      grp.add(plate, field);
      levelGroup.add(grp);
      const q = new Quaternion(), box = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), Array(6).fill(HIDDEN));
      box.visible = false; levelGroup.add(box);
      const pos = new Vector3(X(c), P.y + 0.6, Z(r));
      const M = { P, c, r, fieldMat, field, plateMat: plate.material, k: 0, buzzT: 0 };
      colliders.push({ mesh: box, pos, prev: pos.clone(), quat: q, inv: q.clone(), half: new Vector3(CELL / 2 - 0.05, 0.6, CELL / 2 - 0.05),
                       delta: new Vector3(), ferry: null, holo: null, pad: null, obstacle: 'magnet', magnet: M });
      P.magnets.push(M);
    }
  }
  // The light: a lamp on one edge, a crystal on another, mirrors over some cells, and the beam between.
  P.mirrors = []; P.mirrorAt = []; P.source = null; P.crystal = null; P.lit = false;
  const edgeAt = (kind, a, b) => (kind === 'H' ? { x: X(a), z: P.z0 - b * CELL } : { x: P.x0 + a * CELL, z: Z(b) });
  for (let k = 0; k <= P.rows; k++) for (let c = 0; c < P.cols; c++) {
    const e = G.h[k][c];
    if (e && e.source) P.source = { ...edgeAt('H', c, k), d: e.source, c, r: e.source === 'n' ? k : k - 1 };
    if (e && e.receptor) P.crystal = edgeAt('H', c, k);
  }
  for (let r = 0; r < P.rows; r++) for (let c = 0; c <= P.cols; c++) {
    const e = G.v[r][c];
    if (e && e.source) P.source = { ...edgeAt('V', c, r), d: e.source, c: e.source === 'e' ? c : c - 1, r };
    if (e && e.receptor) P.crystal = edgeAt('V', c, r);
  }
  if (P.source) {
    const S = P.source, grp = new Group(); grp.position.set(S.x, P.y + BEAM_Y, S.z);
    const [dx, dz] = { e: [1, 0], w: [-1, 0], n: [0, -1], s: [0, 1] }[S.d];
    const house = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), P.mats.base); grp.add(house);
    const post = new Mesh(new BoxGeometry(0.16, BEAM_Y - WALL_H, 0.16), P.mats.base); post.position.y = -(BEAM_Y - WALL_H) / 2 - 0.1; grp.add(post);
    const lens = new Mesh(new CircleGeometry(0.2, 32), new MeshBasicMaterial({ color: 0xFFFFFF, toneMapped: false }));
    lens.position.set(dx * 0.26, 0, dz * 0.26); lens.rotation.y = Math.atan2(dx, dz);   // facing into the square
    const glow = new Sprite(new SpriteMaterial({ map: dot, color: LIGHT_COL, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    glow.scale.set(1.6, 1.6, 1); glow.position.set(dx * 0.3, 0, dz * 0.3);
    grp.add(lens, glow); levelGroup.add(grp);
  }
  if (P.crystal) {
    const C = P.crystal, grp = new Group(); grp.position.set(C.x, P.y + BEAM_Y - 0.35, C.z);
    const post = new Mesh(new BoxGeometry(0.16, BEAM_Y - WALL_H - 0.3, 0.16), P.mats.base); post.position.y = -(BEAM_Y - WALL_H - 0.3) / 2; grp.add(post);
    const mat = new MeshStandardMaterial({ color: CRYSTAL_COL, metalness: 0.1, roughness: 0.15, emissive: CRYSTAL_COL, emissiveIntensity: 0.3, transparent: true, opacity: 0.92 });
    const gem = new Mesh(crystalPointGeo(71), mat); gem.scale.set(0.3, 0.75, 0.3); grp.add(gem);
    const halo = new Sprite(new SpriteMaterial({ map: dot, color: CRYSTAL_COL, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.scale.set(2.4, 2.4, 1); halo.position.y = 0.4; grp.add(halo);
    levelGroup.add(grp);
    Object.assign(P.crystal, { mat, halo, k: 0 });
  }
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
    const cell = G.cells[r][c];
    if (!cell.mirror) continue;
    if (!P.mats.mirror) {
      P.mats.mirror = new MeshStandardMaterial({ color: 0xE6F2FF, metalness: 1, roughness: 0.06, envMap: env });
      P.mats.frame = new MeshBasicMaterial({ color: LIGHT_COL, toneMapped: false });
    }
    const pad = new Group(); pad.position.set(X(c), P.y, Z(r));
    const base = new Mesh(new CylinderGeometry(0.72, 0.8, 0.06, 48), P.mats.base); base.position.y = 0.03; base.receiveShadow = true;
    const ringMat = glowMat(LIGHT_COL, 0.7), ring = new Mesh(new RingGeometry(0.64, 0.7, 48), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.065;
    const line = new Mesh(new BoxGeometry(1.0, 0.02, 0.09), P.mats.frame); line.position.y = 0.075;
    pad.add(base, ring, line);
    const panel = new Group(); panel.position.set(X(c), P.y + BEAM_Y, Z(r));
    const glass = new Mesh(new BoxGeometry(1.0, 0.8, 0.05), P.mats.mirror);
    const edges = [[1.06, 0.05, 0, 0.42], [1.06, 0.05, 0, -0.42], [0.05, 0.84, 0.52, 0], [0.05, 0.84, -0.52, 0]].map(([w, h, x, y]) => {
      const b = new Mesh(new BoxGeometry(w, h, 0.07), P.mats.frame); b.position.set(x, y, 0); return b;
    });
    panel.add(glass, ...edges);
    levelGroup.add(pad, panel);
    const a = cell.mirror === '/' ? Math.PI / 4 : -Math.PI / 4;
    panel.rotation.y = a; line.rotation.y = a;
    const M = { c, r, m0: cell.mirror, m: cell.mirror, panel, line, ringMat, turn: a, shown: a, flash: 0 };
    P.mirrors.push(M); P.mirrorAt[r * P.cols + c] = M;
  }
  if (P.source) {
    P.mats.beamCore = new MeshBasicMaterial({ color: 0xFFFBEA, toneMapped: false });
    P.mats.beamGlow = glowMat(LIGHT_COL, 0.3);
    P.beamGrp = new Group(); levelGroup.add(P.beamGrp);
    drawBeam(P);
  }
  // The reset pad, on its bay beside the road in.
  let rp = null;                                        // its own: the nearest (a course may hold several squares)
  for (const q of level.pieces) if (q.t === 'reset' && (!rp || Math.hypot(q.x - pc.x0, q.z - pc.z0) < Math.hypot(rp.x - pc.x0, rp.z - pc.z0))) rp = q;
  if (rp && Math.hypot(rp.x - pc.x0, rp.z - pc.z0) > 12) rp = null;
  if (rp) {
    const grp = new Group(); grp.position.set(rp.x, rp.y, rp.z);
    const base = new Mesh(new CylinderGeometry(0.7, 0.78, 0.06, 48), P.mats.base); base.position.y = 0.03;
    const glyphMat = glowMat(0xFFFFFF, 0.85, resetGlyph), glyph = new Mesh(new CircleGeometry(0.6, 48), glyphMat);
    glyph.rotation.x = -Math.PI / 2; glyph.position.y = 0.064;
    const ring = new Mesh(new RingGeometry(0.66, 0.72, 48), glowMat(0xFFFFFF, 0.8));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.065;
    grp.add(base, glyph, ring);
    levelGroup.add(grp);
    P.reset = { x: rp.x, z: rp.z, glyphMat, flash: 0 };
  }
  plazas.push(P);
}
// A gate on an edge: bars across the doorway, a sheet of light between them, the sign of what opens it lying over it.
const LETTER_COLS = { A: 0x4F8BFF, B: 0x3DE8A6, C: 0xFF5A8A };
const glyphs = {};                                      // a letter, drawn once, lit in whatever colour it is given
function glyphTex(ch) {
  return glyphs[ch] || (glyphs[ch] = canvasTex(128, 128, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
    g.font = '800 92px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.filter = 'blur(6px)'; g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillText(ch, 64, 70);
    g.filter = 'none'; g.fillStyle = '#FFFFFF'; g.fillText(ch, 64, 70);
  }));
}
const CRATE = 1.5, CRATE_H = 1.1, CRATE_SLIDE = 0.3, CRATE_DROP = 0.22, TURN_T = 0.45, RAIL_H = 0.55;
const turnGlyph = canvasTex(128, 128, (g) => {          // a lever's face: an arrow turning clockwise round the rim
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  const arrow = (w) => {
    g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.arc(64, 64, 50, -Math.PI * 0.85, Math.PI * 0.55); g.stroke();
    const a = Math.PI * 0.55, tx = 64 + 50 * Math.cos(a), ty = 64 + 50 * Math.sin(a);
    g.beginPath(); g.moveTo(tx + 16, ty - 6); g.lineTo(tx, ty); g.lineTo(tx + 3, ty - 18); g.stroke();
  };
  g.filter = 'blur(4px)'; g.strokeStyle = 'rgba(255,255,255,0.7)'; arrow(12);
  g.filter = 'none'; g.strokeStyle = '#FFFFFF'; arrow(5);
});
const plateTex = canvasTex(128, 128, (g) => {            // a pressure plate: a square with corner brackets
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  const draw = (w) => {
    g.lineWidth = w; g.strokeRect(12, 12, 104, 104);
    for (const [x, y, sx, sy] of [[4, 4, 1, 1], [124, 4, -1, 1], [4, 124, 1, -1], [124, 124, -1, -1]]) {
      g.beginPath(); g.moveTo(x, y + sy * 22); g.lineTo(x, y); g.lineTo(x + sx * 22, y); g.stroke();
    }
  };
  g.filter = 'blur(4px)'; g.strokeStyle = 'rgba(255,255,255,0.7)'; draw(8);
  g.filter = 'none'; g.strokeStyle = '#FFFFFF'; draw(3);
});
const weightTex = (top) => canvasTex(128, 128, (g) => { // a heavy crate's face: a lit frame, a brace across it, rivets
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  const draw = (w, a) => {
    g.strokeStyle = `rgba(255,178,80,${a})`; g.lineWidth = w; g.strokeRect(7, 7, 114, 114);
    g.beginPath(); if (top) { g.moveTo(18, 18); g.lineTo(110, 110); g.moveTo(110, 18); g.lineTo(18, 110); } else { g.moveTo(18, 110); g.lineTo(110, 18); } g.stroke();
  };
  g.filter = 'blur(5px)'; draw(10, 0.8); g.filter = 'none'; draw(3.5, 1);
  g.fillStyle = '#FFE2B8'; for (const [x, y] of [[16, 16], [112, 16], [16, 112], [112, 112]]) { g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); }
});
const weightSideTex = weightTex(false), weightTopTex = weightTex(true);
const CHARGE_COL = 0xFFE14A, GROUND_COL = 0x8CF5C8, LIGHT_COL = 0xFFF0C8, CRYSTAL_COL = 0x9FF2FF, BEAM_Y = 1.8;
const sunTex = canvasTex(128, 128, (g) => {             // a gate of light's sign: a sun
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  const draw = (w) => {
    g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.arc(64, 64, 20, 0, 7); g.stroke();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(64 + Math.cos(a) * 32, 64 + Math.sin(a) * 32); g.lineTo(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48); g.stroke(); }
  };
  g.filter = 'blur(5px)'; g.strokeStyle = 'rgba(255,255,255,0.75)'; draw(10);
  g.filter = 'none'; g.strokeStyle = '#FFFFFF'; draw(4);
});
const boltTex = canvasTex(128, 128, (g) => {            // a lightning bolt
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  const bolt = () => { g.beginPath(); g.moveTo(74, 10); g.lineTo(34, 70); g.lineTo(62, 70); g.lineTo(50, 118); g.lineTo(94, 52); g.lineTo(66, 52); g.closePath(); };
  g.filter = 'blur(6px)'; g.fillStyle = 'rgba(255,255,255,0.7)'; bolt(); g.fill();
  g.filter = 'none'; g.fillStyle = '#FFFFFF'; bolt(); g.fill();
});
const groundTex = canvasTex(128, 128, (g) => {          // the sign for earth: a stem and three bars, shorter and shorter
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  const draw = () => { g.fillRect(58, 14, 12, 44); g.fillRect(22, 58, 84, 11); g.fillRect(38, 78, 52, 11); g.fillRect(52, 98, 24, 11); };
  g.filter = 'blur(6px)'; g.fillStyle = 'rgba(255,255,255,0.7)'; draw();
  g.filter = 'none'; g.fillStyle = '#FFFFFF'; draw();
});
const plusTex = canvasTex(128, 128, (g) => {            // a charged floor: plus signs, and a lit edge
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  const draw = (w) => {
    g.lineWidth = w; g.strokeRect(10, 10, 108, 108);
    for (const [x, y] of [[40, 40], [88, 40], [40, 88], [88, 88]]) { g.beginPath(); g.moveTo(x - 13, y); g.lineTo(x + 13, y); g.moveTo(x, y - 13); g.lineTo(x, y + 13); g.stroke(); }
  };
  g.filter = 'blur(5px)'; g.strokeStyle = 'rgba(255,255,255,0.75)'; draw(9);
  g.filter = 'none'; g.strokeStyle = '#FFFFFF'; draw(3.5);
});
const gateFieldTex = fieldTex.clone();
gateFieldTex.repeat.set((CELL - WALL_T) / 1.1, GATE_H / 1.1);
function buildGate(P, e, x, z, alongX, ek) {
  const span = CELL - WALL_T, kind = 'keygate' in e ? 'key' : 'sgate' in e ? 'switch' : 'pgate' in e ? 'plate' : 'cgate' in e ? 'charge' : 'light';
  const need = e.keygate || 0, letters = e.sgate || e.pgate || '';
  const col = kind === 'key' ? KEY_COLS[need] : kind === 'charge' ? CHARGE_COL : kind === 'light' ? LIGHT_COL : LETTER_COLS[letters[0]];
  const grp = new Group(); grp.position.set(x, P.y, z);
  if (!alongX) grp.rotation.y = Math.PI / 2;
  const barMat = new MeshBasicMaterial({ color: col, toneMapped: false, transparent: true });
  const bars = new Group();
  let sheetMat, field = null, fieldMat = null;
  if (kind === 'key') {                                 // bars that sink into the floor when the key turns
    for (let i = -2; i <= 2; i++) {
      const b = new Mesh(new CylinderGeometry(0.04, 0.04, GATE_H, 10), barMat);
      b.position.set(i * span / 5.4, GATE_H / 2, 0); bars.add(b);
    }
    sheetMat = glowMat(col, 0.35, sheetTex);
  } else {                                              // a field of light that switches off and on
    fieldMat = glowMat(col, 0.75, gateFieldTex); fieldMat.side = DoubleSide;
    field = new Mesh(new PlaneGeometry(span, GATE_H), fieldMat); field.position.y = GATE_H / 2;
    grp.add(field);
    sheetMat = glowMat(col, 0.3, sheetTex);
  }
  const rail = new Mesh(new BoxGeometry(span, 0.07, 0.07), barMat); rail.position.y = GATE_H; (kind === 'key' ? bars : grp).add(rail);
  const sheet = new Mesh(new PlaneGeometry(span, GATE_H), sheetMat);
  sheet.material.side = DoubleSide; sheet.position.y = GATE_H / 2; (kind === 'key' ? bars : grp).add(sheet);
  // Its sign, lying over it: the shape of the key that opens it, or the letter of the switch that flips it.
  const signMat = kind === 'key' ? new MeshBasicMaterial({ color: col, toneMapped: false, transparent: true })
    : new MeshBasicMaterial({ color: col, toneMapped: false, transparent: true, map: kind === 'charge' ? boltTex : kind === 'light' ? sunTex : glyphTex(letters[0]), blending: AdditiveBlending, depthWrite: false });
  const sign = new Mesh(kind === 'key' ? bowGeo(need, 0.3, 0.055) : new PlaneGeometry(0.72, 0.72), signMat);
  sign.rotation.x = -Math.PI / 2; sign.position.y = GATE_H + 0.32;
  if (kind !== 'key' && !alongX) sign.rotation.z = -Math.PI / 2;   // a letter reads upright from the camera, whichever way the gate runs
  const signGlow = new Mesh(new CircleGeometry(0.62, 32), glowMat(col, 0.35, dot));
  signGlow.rotation.x = -Math.PI / 2; signGlow.position.y = GATE_H + 0.3;
  const posts = [-1, 1].map((sx) => {
    const p = new Mesh(new BoxGeometry(0.16, GATE_H + 0.12, 0.16), P.mats.wall);
    p.position.set(sx * span / 2, (GATE_H + 0.12) / 2, 0); p.castShadow = true; return p;
  });
  grp.add(bars, sign, signGlow, ...posts);
  levelGroup.add(grp);
  const init = e.open ? 'open' : 'shut';
  const g = { P, e, ek, kind, need, letters, col, x, z, alongX, init, state: init, t: 0, open: init === 'open' ? 1 : 0, bars, sign, signMat, sheetMat,
              field, fieldMat, railMat: barMat, flash: 0, buzzT: 0 };
  const q = new Quaternion(), box = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), Array(6).fill(HIDDEN));
  box.position.set(x, P.y + GATE_H / 2, z); box.visible = false; levelGroup.add(box);
  colliders.push({ mesh: box, pos: box.position.clone(), prev: box.position.clone(), quat: q, inv: q.clone(), gate: g,
                   half: alongX ? new Vector3(span / 2, GATE_H / 2, 0.1) : new Vector3(0.1, GATE_H / 2, span / 2),
                   delta: new Vector3(), ferry: null, holo: null, pad: null, obstacle: 'gate' });
  P.gates.push(g);
}
// Touching a gate: with its key, the key flies into it and it opens; without, a buzz.
function gateTouch(g) {
  if (g.state !== 'shut') return;
  const P = g.P;
  if (g.kind === 'key' && P.held && P.held.n === g.need) {
    const K = P.held; P.held = null;
    flyKey(K, g); K.used = true;
    g.state = 'opening'; g.t = 0;
    sound('gate');
  } else if (g.buzzT <= 0) { sound('buzz'); g.buzzT = 0.45; g.flash = 1; }
}
/* Rolling into a crate: square on to one of its faces, it slides a cell the
   way you push, if that cell is clear. A hard roll pushes at once; a gentle
   one pushes after a moment of leaning on it (the stick held toward it). */
const plazaWall = (e) => e === 'wall' || !!(e && (e.source || e.receptor));   // a lamp or a crystal stands on a wall
const pzRotCW = (m) => ((m << 1) & 15) | (m >> 3);          // north to east, east to south, south to west, west to north
const plazaEdge = (P, c, r, d) => (d === 'n' ? P.grid.h[r + 1][c] : d === 's' ? P.grid.h[r][c] : d === 'e' ? P.grid.v[r][c + 1] : P.grid.v[r][c]);
function crateTouch(W, n, rel) {
  if (W.moving || W.sunk || Math.abs(n.y) > 0.3) return;
  const ax = Math.abs(n.x) > 0.9 ? 'x' : Math.abs(n.z) > 0.9 ? 'z' : null;
  if (!ax) { W.pushT = 0; return; }                    // on a corner: no push
  const dx = ax === 'x' ? -Math.sign(n.x) : 0, dz = ax === 'z' ? -Math.sign(n.z) : 0;
  const lean = ball.in[0] * dx + ball.in[1] * dz;
  if (-rel > 1.8) { W.pushT = 0; tryPush(W, dx, dz); return; }
  W.pushT = lean > 0.45 ? W.pushT + STEP : 0;
  if (W.pushT > 0.12) { W.pushT = 0; tryPush(W, dx, dz); }
}
function tryPush(W, dx, dz) {
  const P = W.P, dc = dx, dr = -dz, tc = W.c + dc, tr = W.r + dr;
  const dir = dc > 0 ? 'e' : dc < 0 ? 'w' : dr > 0 ? 'n' : 's';
  const ok = tc >= 0 && tc < P.cols && tr >= 0 && tr < P.rows && plazaEdge(P, W.c, W.r, dir) === null &&
             !P.grid.cells[tr][tc].void && !('tile' in P.grid.cells[tr][tc]) &&
             !P.crates.some((o) => o !== W && !o.sunk && ((o.c === tc && o.r === tr) || (o.moving && o.tc === tc && o.tr === tr)));
  if (!ok) { if (simT - W.blockT > 0.5) { W.blockT = simT; sound('knock'); } return; }
  W.moving = true; W.t = 0; W.fc = W.c; W.fr = W.r; W.tc = tc; W.tr = tr;
  W.into = (P.pits || []).find((q) => q.c === tc && q.r === tr && !q.col.pit.filled) || null;   // over a gap: it will drop in
  sound('scrape');
}
/* The beam: from the lamp, straight on over walls and gates, turned by each
   mirror it meets (a '/' mirror turns north to east and east to north, south
   to west and west to south; a '\\' the other way), until it leaves the
   square: on the crystal it is lit. The search follows the same rule. */
const BEAM_DIR = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] };
function plazaBeam(P) {
  const S = P.source;
  let c = S.c, r = S.r, d = S.d;
  const pts = [[S.x, S.z]];
  for (let i = 0; i < 64; i++) {
    const M = P.mirrorAt[r * P.cols + c];
    if (M) { d = M.m === '/' ? { n: 'e', e: 'n', s: 'w', w: 's' }[d] : { n: 'w', w: 'n', s: 'e', e: 's' }[d]; pts.push([P.X(c), P.Z(r)]); }
    const [dc, dr] = BEAM_DIR[d], nc = c + dc, nr = r + dr;
    if (nc < 0 || nc >= P.cols || nr < 0 || nr >= P.rows) {
      const e = plazaEdge(P, c, r, d);
      pts.push([P.X(c) + dc * CELL / 2, P.Z(r) - dr * CELL / 2]);
      return { lit: !!(e && e !== 'wall' && e.receptor), pts };
    }
    c = nc; r = nr;
  }
  return { lit: false, pts };
}
function drawBeam(P) {
  for (const o of [...P.beamGrp.children]) { P.beamGrp.remove(o); o.geometry.dispose(); }
  const B = plazaBeam(P), y = P.y + BEAM_Y;
  for (let i = 1; i < B.pts.length; i++) {
    const [x0, z0] = B.pts[i - 1], [x1, z1] = B.pts[i], len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 1e-3) continue;
    for (const [rad, mat] of [[0.035, P.mats.beamCore], [0.14, P.mats.beamGlow]]) {
      const m = new Mesh(new CylinderGeometry(rad, rad, len, 10, 1, true), mat);
      m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      if (Math.abs(x1 - x0) > Math.abs(z1 - z0)) m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2;
      P.beamGrp.add(m);
    }
  }
  const was = P.lit; P.lit = B.lit;
  for (const g of P.gates) if (g.kind === 'light') g.state = P.lit ? 'open' : 'shut';
  return was !== P.lit;
}
// Every physics step, whatever the marble is doing: crates in motion slide on, and turning sections finish turning.
function plazaMove() {
  for (const P of plazas) for (const T of P.tiles) if (T.moving > 0) T.moving -= STEP;
  for (const P of plazas) for (const W of P.crates) {
    if (!W.moving) continue;
    if (W.drop !== undefined) {                         // into the gap: down until its top is the road, and the gap is road
      W.drop = Math.min(1, W.drop + STEP / CRATE_DROP);
      W.col.prev.copy(W.col.pos); W.col.pos.y = P.y + CRATE_H / 2 - (CRATE_H - 0.006) * ease(W.drop); W.mesh.position.copy(W.col.pos);
      if (W.drop >= 1) { W.moving = false; W.drop = undefined; }
      continue;
    }
    W.t = Math.min(1, W.t + STEP / CRATE_SLIDE);
    const u = ease(W.t);
    W.col.prev.copy(W.col.pos);
    W.col.pos.set(P.X(W.fc) + (P.X(W.tc) - P.X(W.fc)) * u, P.y + CRATE_H / 2, P.Z(W.fr) + (P.Z(W.tr) - P.Z(W.fr)) * u);
    W.mesh.position.copy(W.col.pos);
    if (W.t >= 1) {
      W.moving = false; W.c = W.tc; W.r = W.tr;
      if (W.into) {                                     // it drops in: the gap is road from now
        const G = W.into; W.into = null; W.sunk = G; W.moving = true; W.drop = 0;
        G.col.pit.filled = true; G.col.mesh.visible = true; G.rim.visible = false;
        sound('thunk'); burst(P.X(W.c), P.y + 0.2, P.Z(W.r), 0xFFB250, 16, 2.4);
      }
    }
  }
}
function flyKey(K, to) {
  K.from.copy(K.model.position); K.to = to; K.t = 0;
}
// Every physics step: which cell's pad the marble is on. Rolling onto one is what works it.
function plazaStep() {
  for (const P of plazas) {
    let on = -1;
    if (ball.grounded && Math.abs(ball.p.y - R - P.y) < 0.25) {
      const c = Math.floor((ball.p.x - P.x0) / CELL), r = Math.floor((P.z0 - ball.p.z) / CELL);
      if (c >= 0 && c < P.cols && r >= 0 && r < P.rows) { if (Math.hypot(ball.p.x - P.X(c), ball.p.z - P.Z(r)) < PAD_R) on = r * P.cols + c; }
      else if (P.reset && Math.hypot(ball.p.x - P.reset.x, ball.p.z - P.reset.z) < PAD_R) on = -2;
    }
    for (const pl of P.plates) {                        // a plate is down under a crate, or under the marble
      const byCrate = P.crates.some((W) => !W.moving && W.c === pl.c && W.r === pl.r);
      const byMarble = ball.grounded && Math.abs(ball.p.y - R - P.y) < 0.3 && Math.hypot(ball.p.x - P.X(pl.c), ball.p.z - P.Z(pl.r)) < PAD_R;
      const down = byCrate || byMarble;
      if (down !== pl.on) { pl.on = down; pl.flash = 1; sound(down ? 'thunk' : 'tick'); }
    }
    for (const g of P.gates) if (g.kind === 'plate') g.state = P.plates.some((pl) => pl.on && g.letters.includes(pl.letter)) ? 'open' : 'shut';
    for (const g of P.gates) if (g.kind === 'charge') g.state = P.charged ? 'open' : 'shut';
    if (on === P.onPad) continue;
    P.onPad = on;
    if (on === -2) resetPlaza(P, false);
    else if (on >= 0) padEnter(P, on % P.cols, Math.floor(on / P.cols));
  }
}
function padEnter(P, c, r) {
  const cell = P.grid.cells[r][c];
  if ('key' in cell) {                                  // a stand: take its key, and leave the one you held
    const s = P.stands.find((q) => q.c === c && q.r === r), had = P.held, there = s.key;
    if (!had && !there) return;
    P.held = there; s.key = had;
    if (there) flyKey(there, 'marble');
    if (had) flyKey(had, s);
    s.flash = 1;
    sound('key');
  }
  if ('lever' in cell && !('tile' in cell)) {           // a lever: every section of its letter turns a quarter, clockwise
    const L = cell.lever;
    for (const T of P.tiles) if (T.lever.includes(L)) { T.mask = pzRotCW(T.mask); T.turn -= Math.PI / 2; T.moving = TURN_T; T.setArms(); }
    const lv = P.levers.find((q) => q.c === c && q.r === r); lv.throwT = 1; lv.side = -lv.side;
    sound('whirr');
  }
  if (cell.mirror) {                                    // a mirror: a quarter turn, and the beam goes another way
    const M = P.mirrorAt[r * P.cols + c];
    M.m = M.m === '/' ? '\\' : '/'; M.turn += Math.PI / 2; M.flash = 1;
    sound('glint');
    if (drawBeam(P)) sound(P.lit ? 'lit' : 'unlit');
  }
  if (cell.charger || cell.ground) {                    // charged, or emptied
    const was = P.charged; P.charged = !!cell.charger;
    P.charges.find((q) => q.c === c && q.r === r).flash = 1;
    if (was !== P.charged) { sound(P.charged ? 'charge' : 'earth'); burst(ball.p.x, ball.p.y, ball.p.z, P.charged ? CHARGE_COL : GROUND_COL, 18, 3); }
  }
  if ('tone' in cell) tunePress(P, cell.tone);         // a drum of a tune
  if ('switch' in cell) {                               // a switch: every gate of its letter flips
    const L = cell.switch;
    for (const g of P.gates) if (g.kind === 'switch' && g.letters.includes(L)) { g.state = g.state === 'open' ? 'shut' : 'open'; g.flash = 1; }
    P.switches.find((q) => q.c === c && q.r === r).press = 1;
    sound('click');
  }
}
// Back as it was: every key to its own stand, every gate shut.
function resetPlaza(P, quiet) {
  let moved = !!P.held;
  P.held = null;
  for (const s of P.stands) s.key = null;
  for (const K of P.keys) {
    if (K.used || K.to !== K.home) moved = true;
    K.used = false; K.fade = 0; K.home.key = K; flyKey(K, K.home); K.model.visible = true; K.model.scale.setScalar(1);
  }
  for (const g of P.gates) if (g.state !== g.init) { g.state = g.init; g.t = 0; moved = true; }
  if (P.charged) { P.charged = false; moved = true; }
  for (const M of P.mirrors) if (M.m !== M.m0) { M.m = M.m0; M.turn += Math.PI / 2; moved = true; if (quiet) M.shown = M.turn; }
  if (P.source) drawBeam(P);
  for (const g of P.gates) if (g.kind === 'charge') g.state = 'shut';
  for (const T of P.tiles) if (T.mask !== T.mask0) {    // every section turned back
    moved = true;
    while (T.mask !== T.mask0) { T.mask = pzRotCW(T.mask); T.turn -= Math.PI / 2; }
    T.moving = TURN_T; T.setArms();
    if (quiet) { T.moving = 0; T.shown = T.turn; }
  }
  for (const G of P.pits || []) if (G.col.pit.filled) { G.col.pit.filled = false; G.col.mesh.visible = false; G.rim.visible = true; moved = true; }
  for (const W of P.crates) {                           // every crate back where it stood
    if (W.c !== W.c0 || W.r !== W.r0 || W.moving) moved = true;
    W.moving = false; W.c = W.fc = W.tc = W.c0; W.r = W.fr = W.tr = W.r0; W.sunk = null; W.into = null; W.drop = undefined;
    W.col.pos.set(P.X(W.c0), P.y + CRATE_H / 2, P.Z(W.r0)); W.col.prev.copy(W.col.pos); W.mesh.position.copy(W.col.pos);
    if (!quiet) burst(W.col.pos.x, P.y + 0.3, W.col.pos.z, 0xFFB250, 10, 2);
  }
  if (quiet) { for (const K of P.keys) K.t = 1; for (const g of P.gates) g.open = g.init === 'open' ? 1 : 0; }
  if (P.reset) P.reset.flash = 1;
  if (quiet && (P.cov || P.twin)) {                    // a restart: unsolved again, the bridge gone
    if (P.cov) { P.covDone = false; resetCover(P); }
    if (P.twin) { P.twin.done = false; resetTwin(P); }
    const B = coverBridge(P); if (B) { B.bridge.on = false; B.mesh.visible = false; }
  }
  if (P.tune) {                                         // a restart: unplayed again; the pad by the road: play it again
    if (quiet) { Object.assign(P.tune, { at: 0, done: false, play: null, heard: false, wrong: 0 }); if (P.portal) { P.portal.open = false; P.portal.k = 0; P.portal.grp.visible = false; } }
    else { tuneReplay(P); return; }
  }
  if (!quiet) sound(moved ? 'reset' : 'tick');
}
/* ICE (owner, 2026-09-28: "a maze could be a very interesting addition"; the
   first of eight new puzzles, on the road). The floor of an ice maze is black
   ice: the marble slides until something stops it, a wall, a rock (a cell short
   of it) or snow (on it); over a hole it drops, back to the ring before the
   maze. At rest, it goes the way it is pointed, straight along the grid, and it
   glides without turning. Out through the gap it came in by, it is back on the
   road; out through the far gap, on its way. */
const ICE_V = 5.2;
const iceTex = canvasTex(256, 256, (g) => {             // a cell of black ice: frost cracks, a sheen, and a groove round its edge
  const rg = g.createRadialGradient(128, 128, 10, 128, 128, 190);
  rg.addColorStop(0, '#1E4C6E'); rg.addColorStop(1, '#10304B');
  g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
  let sd = 7; const rn = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  g.lineCap = 'round';
  for (let i = 0; i < 14; i++) {                        // cracks, branching a little
    let x = rn() * 256, y = rn() * 256, a = rn() * 6.28;
    g.strokeStyle = `rgba(170,232,255,${0.25 + rn() * 0.3})`; g.lineWidth = 0.8 + rn() * 1.4;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4 + rn() * 4; k++) { a += (rn() - 0.5) * 1.3; x += Math.cos(a) * (8 + rn() * 18); y += Math.sin(a) * (8 + rn() * 18); g.lineTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 0.07; g.fillStyle = '#FFFFFF';        // a sheen across it
  g.beginPath(); g.moveTo(30, 256); g.lineTo(120, 0); g.lineTo(175, 0); g.lineTo(85, 256); g.fill();
  g.globalAlpha = 1;
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + rn() * 0.5})`; g.fillRect(rn() * 256, rn() * 256, 1.5, 1.5); }
  for (let i = 0; i < 9; i++) {                         // bubbles caught in it
    g.strokeStyle = 'rgba(200,240,255,0.35)'; g.lineWidth = 1; g.beginPath(); g.arc(rn() * 256, rn() * 256, 2 + rn() * 5, 0, 6.28); g.stroke();
  }
  g.strokeStyle = 'rgba(165,225,255,0.55)'; g.lineWidth = 5; g.strokeRect(2.5, 2.5, 251, 251);   // the groove between cells
});
const snowTex = canvasTex(128, 128, (g) => {
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 128, 128);
  let sd = 11; const rn = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) { const v = 205 + Math.floor(rn() * 50); g.fillStyle = `rgb(${v},${v + 3 > 255 ? 255 : v + 3},255)`; g.fillRect(rn() * 128, rn() * 128, 2, 2); }
});
function buildIce(P) {
  const G = P.grid, env = neonEnvMap() || envTex, pos = [], uv = [], nor = [], idx = [];
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {        // the sheet: a quad to a cell, turned about
    if (G.cells[r][c].void) continue;
    const xa = P.x0 + c * CELL, xb = xa + CELL, za = P.z0 - r * CELL, zb = za - CELL, b = pos.length / 3, t = (c * 7 + r * 3) % 4;
    const U = [[0, 0], [1, 0], [1, 1], [0, 1]];
    [[xa, za], [xb, za], [xb, zb], [xa, zb]].forEach(([x, z], i) => { pos.push(x, P.y + 0.012, z); nor.push(0, 1, 0); uv.push(...U[(i + t) % 4]); });
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  P.mats.ice = new MeshStandardMaterial({ color: 0xFFFFFF, map: iceTex, roughness: 0.05, metalness: 0.3, envMap: env, envMapIntensity: 2.2,
                                          emissive: 0xFFFFFF, emissiveMap: iceTex, emissiveIntensity: 0.45 });
  const sheet = new Mesh(geo, P.mats.ice); sheet.receiveShadow = true; levelGroup.add(sheet);
  P.iceSheet = sheet;
  P.mats.rock = new MeshStandardMaterial({ color: 0xCFEBFF, roughness: 0.22, metalness: 0.08, emissive: 0x5FB8FF, emissiveIntensity: 0.35, flatShading: true, envMap: env });
  P.mats.snow = new MeshStandardMaterial({ color: 0xFFFFFF, map: snowTex, roughness: 0.95, emissive: 0xC8D8F0, emissiveIntensity: 0.35 });
  P.mats.hole = new MeshBasicMaterial({ color: 0xFF3048, toneMapped: false });
  P.rocks = []; P.drifts = [];
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
    const cell = G.cells[r][c], x = P.X(c), z = P.Z(r);
    if (cell.rock) {                                    // a boulder of ice, a little different each time
      const geo2 = new IcosahedronGeometry(0.66, 0), a = geo2.attributes.position;
      let sd = 1 + c * 31 + r * 17; const rn = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < a.count; i++) { const k = 0.85 + rn() * 0.3; a.setXYZ(i, a.getX(i) * k, a.getY(i) * k, a.getZ(i) * k); }
      geo2.computeVertexNormals();
      const m = new Mesh(geo2, P.mats.rock); m.scale.set(1.1, 0.9, 1.1); m.rotation.y = rn() * 6.28;
      m.position.set(x, P.y + 0.5, z); m.castShadow = true; levelGroup.add(m);
      colliders.push({ mesh: m, pos: m.position.clone(), prev: m.position.clone(), quat: new Quaternion(), inv: new Quaternion(),
                       half: new Vector3(0.7, 0.5, 0.7), delta: new Vector3(), ferry: null, holo: null, pad: null, obstacle: 'rock' });
      P.rocks.push({ c, r, mesh: m });
    }
    if (cell.snow) {                                    // a drift of snow, low and soft: an uneven edge, lumps on top
      const geo3 = new SphereGeometry(1, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2), a = geo3.attributes.position;
      const ph = c * 1.7 + r * 2.9;
      for (let i = 0; i < a.count; i++) {
        const px = a.getX(i), py = a.getY(i), pz = a.getZ(i), th = Math.atan2(pz, px);
        const edge = 1 + 0.1 * Math.sin(3 * th + ph) + 0.06 * Math.sin(5 * th + 2 * ph), lump = 1 + 0.35 * Math.max(0, Math.sin(4 * th + ph) * Math.sin(py * 6 + ph));
        a.setXYZ(i, px * edge, py * lump, pz * edge);
      }
      geo3.computeVertexNormals();
      const m = new Mesh(geo3, P.mats.snow);
      m.scale.set(0.9, 0.2, 0.9); m.position.set(x, P.y + 0.012, z); m.castShadow = true; m.receiveShadow = true; levelGroup.add(m);
      P.drifts.push({ c, r, mesh: m });
    }
    if (cell.void) {                                    // a hole: a red rim round it
      for (const [dx, dz, w, d] of [[0, 1, 1, 0], [0, -1, 1, 0], [1, 0, 0, 1], [-1, 0, 0, 1]]) {
        const bar = new Mesh(new BoxGeometry(w ? CELL - 0.1 : 0.09, 0.05, d ? CELL - 0.1 : 0.09), P.mats.hole);
        bar.position.set(x + dx * (CELL / 2 - 0.1), P.y + 0.03, z - dz * (CELL / 2 - 0.1)); levelGroup.add(bar);
      }
    }
  }
}
/* THE TWIN (owner, 2026-09-28, the fifth new puzzle). A wall down the middle
   of the square: you on the left, your twin, a marble of violet glass, on the
   right. Each push moves you a tile, and your twin a tile the mirror way (east
   for you is west for it); a wall stops either one alone, which is how the two
   are put out of step. Stand at the way out while your twin stands on its pad,
   and the bridge appears. Back out the way in, or a fall, and the twin is home. */
const TWIN_COL = 0xB18CFF;
function buildTwin(P) {
  const G = P.grid, env = neonEnvMap() || envTex;
  let start = null, pad = null;
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) { if (G.cells[r][c].twin) start = [c, r]; if (G.cells[r][c].twinPad) pad = [c, r]; }
  const mesh = new Mesh(new SphereGeometry(R, 32, 18), new MeshStandardMaterial({ color: 0xD9CBFF, metalness: 0.3, roughness: 0.08, envMap: env, envMapIntensity: 1.4,
                                                                           transparent: true, opacity: 0.9, emissive: 0x7A5CFF, emissiveIntensity: 0.7 }));
  mesh.castShadow = true; mesh.position.set(P.X(start[0]), P.y + R, P.Z(start[1])); levelGroup.add(mesh);
  const glow = new Mesh(new CircleGeometry(0.85, 40), glowMat(TWIN_COL, 0.45, dot));   // a glow under it, so it is seen on any floor
  glow.rotation.x = -Math.PI / 2; glow.position.set(P.X(start[0]), P.y + 0.02, P.Z(start[1])); levelGroup.add(glow);
  const ring = (c, r) => {                              // a violet ring: the twin's pad, and yours (the way out)
    const g = new Group(); g.position.set(P.X(c), P.y, P.Z(r));
    const m = new Mesh(new RingGeometry(0.7, 0.8, 48), glowMat(TWIN_COL, 0.85)); m.rotation.x = -Math.PI / 2; m.position.y = 0.02;
    const pool = new Mesh(new CircleGeometry(1.05, 40), glowMat(TWIN_COL, 0.14, dot)); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.014;
    g.add(m, pool); levelGroup.add(g); return m;
  };
  P.twin = { c: start[0], r: start[1], c0: start[0], r0: start[1], fc: start[0], fr: start[1], t: 1, pad, mesh, glow, done: false,
             rings: [ring(pad[0], pad[1]), ring(P.pc.exit, P.rows - 1)] };
}
function resetTwin(P) {
  const T = P.twin; T.c = T.fc = T.c0; T.r = T.fr = T.r0; T.t = 1;
  T.mesh.position.set(P.X(T.c), P.y + R, P.Z(T.r)); T.glow.position.set(P.X(T.c), P.y + 0.02, P.Z(T.r));
}
function animateTwin(P, dt) {
  const T = P.twin;
  if (T.t < 1) {
    T.t = Math.min(1, T.t + dt * COVER_V / CELL);
    const u = ease(T.t);
    T.mesh.position.set(P.X(T.fc) + (P.X(T.c) - P.X(T.fc)) * u, P.y + R, P.Z(T.fr) + (P.Z(T.r) - P.Z(T.fr)) * u);
    T.mesh.rotation.x -= (T.r - T.fr) * dt * COVER_V / R; T.mesh.rotation.z -= (T.c - T.fc) * dt * COVER_V / R;
    T.glow.position.set(T.mesh.position.x, P.y + 0.02, T.mesh.position.z);
  }
  const I = ball.ice, here = I && I.P === P && !I.dc && !I.dr;
  const on = here && I.c === P.pc.exit && I.r === P.rows - 1, its = T.t >= 1 && T.c === T.pad[0] && T.r === T.pad[1];
  T.rings[0].material.opacity = its ? 1 : 0.6; T.rings[1].material.opacity = on ? 1 : 0.6;
  if (!T.done && on && its) {                          // both on their pads: the bridge
    T.done = true;
    const B = coverBridge(P);
    if (B) { B.bridge.on = true; B.mesh.visible = true; burst(B.pos.x, P.y + 0.3, B.pos.z, TWIN_COL, 30, 3.5); }
    burst(T.mesh.position.x, T.mesh.position.y, T.mesh.position.z, TWIN_COL, 20, 3);
    sound('unlock');
  }
}
/* THE TUNE (owner, 2026-09-28, the fourth new puzzle: "remember the tune").
   Drums, each its own colour and note, play a tune as the marble comes in
   (once the camera has risen over them). Rolled over in the same order, a
   portal opens on the ledge past the square and takes the marble over the
   missing road. A wrong drum: they all flash and it plays again. The pad by
   the road in plays it again too. While it plays, the drums do not count. */
const TUNE_ON = 0.45, TUNE_GAP = 0.2;
function buildTune(P) {
  const G = P.grid, T = P.tune = { seq: [...P.pc.tune].map((ch) => P.pc.legend[ch].tone), drums: [], at: 0, done: false, play: null, heard: false, wrong: 0 };
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
    const cell = G.cells[r][c];
    if (!('tone' in cell)) continue;
    const col = TONE_COLS[cell.tone], grp = new Group(); grp.position.set(P.X(c), P.y, P.Z(r));
    const shell = new Mesh(new CylinderGeometry(0.74, 0.8, 0.16, 40), P.mats.base); shell.position.y = 0.08; shell.receiveShadow = true;
    const headMat = new MeshBasicMaterial({ color: col, transparent: true, opacity: 0.58, toneMapped: false });
    const head = new Mesh(new CircleGeometry(0.66, 40), headMat); head.rotation.x = -Math.PI / 2; head.position.y = 0.165;
    const ringMat = glowMat(col, 0.7), ring = new Mesh(new RingGeometry(0.72, 0.8, 48), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.17;
    const pool = new Mesh(new CircleGeometry(1.15, 40), glowMat(col, 0.12, dot)); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.012;
    grp.add(shell, head, ring, pool); levelGroup.add(grp);
    T.drums.push({ c, r, tone: cell.tone, head, headMat, ringMat, pool, k: 0, flash: 0 });
  }
}
function buildPortal(pc) {                              // a ring of light on the ledge, shut until its tune is played
  const P = plazas[plazas.length - 1];
  const grp = new Group(); grp.position.set(pc.x, pc.y + 1.15, pc.z);
  const ring = new Mesh(new TorusGeometry(1.05, 0.07, 12, 64), glowMat(0xDCCBFF, 0.95));
  const halo = new Mesh(new TorusGeometry(1.05, 0.2, 10, 64), glowMat(0x9A7BFF, 0.3));
  const disc = new Mesh(new CircleGeometry(1.0, 48), glowMat(0x7FE9FF, 0.35, dot));
  grp.add(ring, halo, disc); grp.scale.setScalar(0.001); grp.visible = false; levelGroup.add(grp);
  const far = new Mesh(new RingGeometry(0.8, 0.95, 48), glowMat(0xCFC0FF, 0.35));   // where it comes out: a faint ring over there
  far.rotation.x = -Math.PI / 2; far.position.set(pc.to[0], pc.to[1] + 0.03, pc.to[2]); levelGroup.add(far);
  P.portal = { pc, grp, disc, far, open: false, k: 0, lastZ: null };
}
function tunePress(P, tone) {
  const T = P.tune, D = T.drums.find((q) => q.tone === tone);
  D.flash = 1; toneK = tone; sound('tone');
  if (T.done || T.play) return;                         // a tune played, or playing: a drum is just a drum
  if (!T.heard) { T.play = { t: -0.4 }; return; }       // not heard yet: hear it first
  if (tone === T.seq[T.at]) {
    if (++T.at === T.seq.length) {                      // the whole tune: the portal opens
      T.done = true;
      if (P.portal) { P.portal.open = true; P.portal.grp.visible = true; burst(P.portal.pc.x, P.portal.pc.y + 1.2, P.portal.pc.z, 0xDCCBFF, 30, 3.5); }
      for (const q of T.drums) q.flash = 1;
      sound('unlock');
    }
  } else { T.at = 0; T.wrong = 1; sound('buzz'); T.play = { t: -1.3 }; }   // wrong: they flash, and it plays again
}
function tuneReplay(P) { if (P.tune && !P.tune.done) { P.tune.at = 0; P.tune.play = { t: -0.5 }; } }
function animateTune(P, dt) {
  const T = P.tune;
  if (!T.heard && !T.play && !T.done && plazaAt === P && plazaView > 0.8 && state === 'play') T.play = { t: -0.3 };   // the camera is over it: play
  let lit = -1;
  if (T.play) {
    const was = Math.floor(T.play.t / (TUNE_ON + TUNE_GAP));
    T.play.t += dt;
    const slot = Math.floor(T.play.t / (TUNE_ON + TUNE_GAP));
    if (T.play.t >= 0 && slot < T.seq.length) {
      if (slot !== was || T.play.t - dt < 0) { toneK = T.seq[slot]; sound('tone'); }
      if (T.play.t - slot * (TUNE_ON + TUNE_GAP) < TUNE_ON) lit = T.seq[slot];
    } else if (slot >= T.seq.length) { T.play = null; T.heard = true; }
  }
  T.wrong = Math.max(0, T.wrong - dt * 1.6);
  for (const D of T.drums) {
    D.flash = Math.max(0, D.flash - dt * 3);
    D.k += ((D.tone === lit ? 1 : 0) - D.k) * (REDUCED ? 1 : 1 - Math.exp(-18 * dt));
    const on = Math.max(D.k, D.flash);
    D.headMat.color.setHex(T.wrong > 0.05 && Math.sin(T.wrong * 30) > 0 ? 0xFF2D48 : TONE_COLS[D.tone]);
    D.headMat.opacity = 0.58 + 0.42 * on; D.pool.material.opacity = 0.14 + 0.45 * on; D.ringMat.opacity = 0.7 + 0.3 * on;   // each colour plain at rest, bright when it sounds
    D.head.position.y = 0.165 - 0.05 * D.flash;
  }
  const Pt = P.portal;
  if (Pt) {                                             // it grows open, and its middle turns
    Pt.k += ((Pt.open ? 1 : 0) - Pt.k) * (REDUCED ? 1 : 1 - Math.exp(-5 * dt));
    Pt.grp.scale.setScalar(Math.max(0.001, Pt.k)); Pt.grp.visible = Pt.k > 0.01;
    Pt.disc.rotation.z += dt * 1.5;
    Pt.far.material.opacity = 0.2 + 0.5 * Pt.k;
  }
}
// Through an open portal: over the missing road, rolling on as it went in.
function portalStep() {
  for (const P of plazas) {
    const Pt = P.portal; if (!Pt) continue;
    const z0 = Pt.lastZ; Pt.lastZ = ball.p.z;
    if (!Pt.open || z0 === null || !(z0 > Pt.pc.z && ball.p.z <= Pt.pc.z)) continue;
    if (Math.abs(ball.p.x - Pt.pc.x) > 1.1 || Math.abs(ball.p.y - R - Pt.pc.y) > 1) continue;
    burst(ball.p.x, ball.p.y, ball.p.z, 0xDCCBFF, 18, 3);
    ball.p.set(Pt.pc.to[0], Pt.pc.to[1] + R + 0.01, Pt.pc.to[2]); ball.v.y = 0;
    Pt.lastZ = ball.p.z; ripple(ball.p); sound('warp');
  }
}
/* EVERY TILE (owner, 2026-09-28, the third new puzzle). A tile lights as the
   marble rolls onto it and crumbles when it leaves; once every tile is lit, the
   bridge out appears. Each push rolls the marble one tile (the ice's grid,
   one step at a time), so the puzzle is the route, not the steering. A fall,
   or rolling back out the way in, and the tiles are all back. Solved, it
   stays solved: the tiles come back, the bridge stays. */
const COVER_V = 4, COVER_DARK = new Color(0x4A3F78), COVER_LIT = new Color(0xFFC94A);
const coverTileTex = canvasTex(128, 128, (g) => {       // a tile: a bright rim, a softer middle
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#9A9A9A'; g.fillRect(10, 10, 108, 108);
  const rg = g.createRadialGradient(64, 64, 8, 64, 64, 70); rg.addColorStop(0, '#CFCFCF'); rg.addColorStop(1, '#8A8A8A');
  g.fillStyle = rg; g.fillRect(14, 14, 100, 100);
});
function buildCover(P) {
  const G = P.grid, pos = [], uv = [], col = [], idx = [];
  P.cov = []; P.covSlab = []; P.covLit = 0; P.covTotal = 0; P.covDone = false;
  for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
    const i = r * P.cols + c;
    if (G.cells[r][c].void) { P.cov[i] = -1; continue; }
    P.cov[i] = 0; P.covTotal++;
    const xa = P.x0 + c * CELL + 0.06, xb = xa + CELL - 0.12, za = P.z0 - r * CELL - 0.06, zb = za - CELL + 0.12, b = pos.length / 3;
    [[xa, za, 0, 0], [xb, za, 1, 0], [xb, zb, 1, 1], [xa, zb, 0, 1]].forEach(([x, z, u, v]) => { pos.push(x, P.y + 0.014, z); uv.push(u, v); col.push(COVER_DARK.r, COVER_DARK.g, COVER_DARK.b); });
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    P.covSlab[i] = colliders.find((q) => q.cell && Math.abs(q.pos.x - P.X(c)) < 0.01 && Math.abs(q.pos.z - P.Z(r)) < 0.01);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3)); geo.setIndex(idx);
  P.covBase = pos.slice();                              // where each tile's corners are, to put them back
  P.covMesh = new Mesh(geo, new MeshBasicMaterial({ map: coverTileTex, vertexColors: true, toneMapped: false }));
  levelGroup.add(P.covMesh);
  P.covQuad = [];                                       // which quad (four corners) each tile is
  let q = 0; for (let i = 0; i < P.cov.length; i++) if (P.cov[i] !== -1) P.covQuad[i] = q++;
}
function coverBridge(P) {                              // the bridge out (built after its square, so found when it is wanted)
  const bx = P.X(P.pc.exit), bz = P.z0 - P.rows * CELL - 1.5;
  return colliders.find((q) => q.bridge && Math.abs(q.pos.x - bx) < 0.05 && Math.abs(q.pos.z - bz) < 0.05) || null;
}
function coverPaint(P, i, color, hide) {
  const q = P.covQuad[i], g = P.covMesh.geometry, C = g.attributes.color, Pp = g.attributes.position;
  for (let k = 0; k < 4; k++) {
    C.setXYZ(q * 4 + k, color.r, color.g, color.b);
    const j = (q * 4 + k) * 3;
    if (hide) Pp.setXYZ(q * 4 + k, P.covBase[j], P.covBase[j + 1] - 40, P.covBase[j + 2]);
    else Pp.setXYZ(q * 4 + k, P.covBase[j], P.covBase[j + 1], P.covBase[j + 2]);
  }
  C.needsUpdate = true; Pp.needsUpdate = true;
}
function coverArrive(P, c, r, c0, r0) {
  if (P.covDone) return;
  if (r0 >= 0 && r0 < P.rows && c0 >= 0 && c0 < P.cols) {   // the tile it left crumbles
    const j = r0 * P.cols + c0;
    if (P.cov[j] === 1) {
      P.cov[j] = 2; coverPaint(P, j, COVER_LIT, true);
      const S = P.covSlab[j]; if (S) { S.gone = true; S.mesh.visible = false; }
      burst(P.X(c0), P.y + 0.05, P.Z(r0), 0xFFC94A, 14, 2.6); sound('crack');
    }
  }
  const i = r * P.cols + c;
  if (P.cov[i] !== 0) return;
  P.cov[i] = 1; P.covLit++; coverPaint(P, i, COVER_LIT, false);
  noteK = P.covLit - 1; sound('note');
  if (P.covLit === P.covTotal) {                        // every tile lit: the bridge
    P.covDone = true;
    const B = coverBridge(P);
    if (B) { B.bridge.on = true; B.mesh.visible = true; burst(B.pos.x, P.y + 0.3, B.pos.z, 0xFFC94A, 30, 3.5); }
    sound('unlock');
  }
}
function resetCover(P) {                                // every tile back; a square solved keeps its bridge
  for (let i = 0; i < P.cov.length; i++) {
    if (P.cov[i] === -1) continue;
    P.cov[i] = P.covDone ? 1 : 0; coverPaint(P, i, P.covDone ? COVER_LIT : COVER_DARK, false);
    const S = P.covSlab[i]; if (S) { S.gone = false; S.mesh.visible = true; }
  }
  if (!P.covDone) P.covLit = 0;
}
// What lies the way (dc, dr) goes from cell (c, r) of an ice maze (r = -1: on the road before its gap): 'open', 'wall' or 'out'.
function iceAhead(P, c, r, dc, dr) {
  const G = P.grid, nc = c + dc, nr = r + dr;
  let e;
  if (dr) { if (c < 0 || c >= P.cols) return 'wall'; e = G.h[dr > 0 ? r + 1 : r]; e = e ? e[c] : 'wall'; }
  else { if (r < 0 || r >= P.rows) return 'wall'; e = G.v[r][dc > 0 ? c + 1 : c]; }
  if (e) return 'wall';                                 // (no gates on ice)
  if (nr < 0 || nr >= P.rows || nc < 0 || nc >= P.cols) return 'out';
  return G.cells[nr][nc].rock ? 'wall' : 'open';
}
// Onto the ice: wherever the marble rolls onto a maze, the ice takes it, sliding on the way it was going.
function iceCatch() {
  if (!ball.grounded) return;
  for (const P of plazas) {
    if (!(P.pc.ice || P.pc.cover || P.pc.twin) || Math.abs(ball.p.y - R - P.y) > 0.3) continue;
    const fc = (ball.p.x - P.x0) / CELL, fr = (P.z0 - ball.p.z) / CELL, c = Math.floor(fc), r = Math.floor(fr);
    if (c < 0 || c >= P.cols || r < 0 || r >= P.rows || P.grid.cells[r][c].void || (P.cov && P.cov[r * P.cols + c] === 2)) continue;
    const [dc, dr] = Math.abs(ball.v.x) > Math.abs(ball.v.z) ? [Math.sign(ball.v.x) || 1, 0] : [0, ball.v.z > 0 ? -1 : 1];
    const pc = c - dc, pr = r - dr;                     // the cell it came from (or the road), and how far past its middle
    const u = dc ? (ball.p.x - P.X(pc)) * dc : (P.Z(pr) - ball.p.z) * dr;
    ball.ice = { P, c: pc, r: pr, dc, dr, u: clamp(u, 0, CELL), armed: false, last: [dc, dr], nudge: 0, nd: [0, 0] };
    if (P.pc.ice) sound('glide');
    return;
  }
}
function iceStop(I, snow) {
  I.dc = 0; I.dr = 0; I.u = 0;
  sound(snow ? 'crunch' : 'knock');
  if (snow) burst(ball.p.x, ball.p.y - R + 0.1, ball.p.z, 0xFFFFFF, 10, 1.6);
}
function iceStep(dt, ix, iz) {
  const I = ball.ice, P = I.P;
  if (!I.dc && !I.dr) {                                 // at rest: the stick sends it, straight along the grid
    const m = Math.max(Math.abs(ix), Math.abs(iz));
    if (m < 0.3) I.armed = true;                        // a push counts once the stick has been let go, or turned another way
    else if (!(P.twin && P.twin.t < 1)) {                // (not while the twin is still moving)
      const [dc, dr] = Math.abs(ix) > Math.abs(iz) ? [Math.sign(ix), 0] : [0, iz < 0 ? 1 : -1];
      if (I.armed || dc !== I.last[0] || dr !== I.last[1]) {
        I.armed = false; I.last = [dc, dr];
        const mine = iceAhead(P, I.c, I.r, dc, dr), T = P.twin, its = T && iceAhead(P, T.c, T.r, -dc, dr) === 'open';
        if (its) { T.fc = T.c; T.fr = T.r; T.c -= dc; T.r += dr; T.t = 0; }   // the twin goes the mirror way
        if (mine === 'wall') { I.nudge = 0.16; I.nd = [dc, dr]; if (!its) sound('bump'); }   // it will not go that way
        else { I.dc = dc; I.dr = dr; I.u = 0; if (P.pc.ice) sound('glide'); }
      }
    }
  } else {
    const V = P.pc.ice ? ICE_V : COVER_V;
    I.u += V * dt;
    for (;;) {
      const nc = I.c + I.dc, nr = I.r + I.dr, out = nr < 0 || nr >= P.rows || nc < 0 || nc >= P.cols;
      const hole = !out && (P.grid.cells[nr][nc].void || (P.cov && P.cov[nr * P.cols + nc] === 2));
      if (out && I.u >= CELL / 2 + 0.35 || hole && I.u >= CELL / 2 + 0.12) {
        if (P.pc.cover && out && nr < 0) resetCover(P);  // back out the way in: the tiles are all back
        if (P.twin && out && nr < 0 && !P.twin.done) resetTwin(P);   // (and the twin is home)
        else if (P.pc.cover && out) coverArrive(P, nc, nr, I.c, I.r);   // (out over the bridge: the last tile goes too)
        ball.v.set(I.dc * V, 0, -I.dr * V);             // off the grid: onto the road, or down the hole
        ball.p.x = P.X(I.c) + I.dc * I.u; ball.p.z = P.Z(I.r) - I.dr * I.u;
        ball.ice = null;
        return;
      }
      if (I.u < CELL) break;
      const c0 = I.c, r0 = I.r;
      I.u -= CELL; I.c = nc; I.r = nr;                  // at the middle of the next cell
      if (P.pc.cover || P.pc.twin) { if (P.pc.cover) coverArrive(P, I.c, I.r, c0, r0); I.dc = 0; I.dr = 0; I.u = 0; break; }   // a tile at a time
      const cell = P.grid.cells[I.r][I.c];
      if (cell.snow) { iceStop(I, true); break; }
      if (iceAhead(P, I.c, I.r, I.dc, I.dr) === 'wall') { iceStop(I, false); break; }
    }
  }
  I.nudge = Math.max(0, I.nudge - dt);
  const nk = I.nudge > 0 ? 0.14 * Math.sin(Math.PI * I.nudge / 0.16) : 0;
  ball.p.set(P.X(I.c) + I.dc * I.u + I.nd[0] * nk, P.y + R, P.Z(I.r) - I.dr * I.u - I.nd[1] * nk);
  const V2 = P.pc.ice ? ICE_V : COVER_V;
  ball.v.set(I.dc * V2, 0, -I.dr * V2);
  ball.grounded = true; ball.airT = 0; lastGroundY = P.y;
}
const _kp = new Vector3();
function animatePlazas(dt) {
  for (const P of plazas) {
    for (const K of P.keys) {
      // Where it belongs: over its stand, over the marble, or in the lock of the gate it opened.
      const T = K.to, bob = REDUCED ? 0 : Math.sin(simT * 2.2 + K.spin) * 0.06;
      if (T === 'marble') _kp.set(marble.position.x, marble.position.y + KEY_UP + bob, marble.position.z);
      else if (T.need !== undefined) _kp.set(T.x, P.y + GATE_H + 0.3, T.z);
      else _kp.set(T.x, P.y + KEY_UP + bob, T.z);
      K.t = Math.min(1, K.t + dt / KEY_FLY);
      if (K.t < 1 && !REDUCED) {                         // an arc from where it was
        const u = ease(K.t);
        K.model.position.lerpVectors(K.from, _kp, u);
        K.model.position.y += Math.sin(Math.PI * u) * 0.9;
      } else K.model.position.copy(_kp);
      K.spin += dt * (T === 'marble' ? 1.6 : 1.1);
      K.model.rotation.set(-1.1, K.spin, 0);
      if (K.used) {                                     // into the lock, and gone
        if (K.t >= 1) K.fade = Math.min(1, (K.fade || 0) + dt / 0.3);
        const s = 1 - (K.fade || 0);
        K.model.scale.setScalar(Math.max(0.001, s)); K.model.visible = s > 0.01;
      }
    }
    for (const s of P.stands) {
      s.flash = Math.max(0, s.flash - dt * 2.5);
      const col = KEY_COLS[s.key ? s.key.n : 0];
      s.ringMat.color.setHex(col); s.pool.material.color.setHex(col);
      s.ringMat.opacity = (s.key ? 0.55 : 0.25) + 0.45 * s.flash;
      s.pool.material.opacity = (s.key ? 0.2 : 0.06) + 0.3 * s.flash;
    }
    for (const g of P.gates) {
      g.buzzT = Math.max(0, g.buzzT - dt); g.flash = Math.max(0, g.flash - dt * 3);
      if (g.kind === 'key') {                           // the key flies in, then the bars sink
        if (g.state === 'opening') { g.t += dt; if (g.t >= KEY_FLY + 0.22) g.state = 'open'; }
        const target = g.state === 'shut' ? 0 : g.state === 'opening' ? Math.max(0, (g.t - KEY_FLY) / 0.45) : 1;
        g.open += (Math.min(1, target) - g.open) * (REDUCED ? 1 : 1 - Math.exp(-14 * dt));
        g.bars.position.y = -GATE_H * 1.02 * ease(g.open);
        g.bars.visible = g.open < 0.99;
        g.signMat.opacity = (1 - g.open) * (0.85 + 0.15 * Math.sin(simT * 4)) + 0.6 * g.flash;
        g.sign.visible = g.signMat.opacity > 0.01;
        g.sheetMat.opacity = 0.35 * (1 - g.open) + 0.4 * g.flash;
      } else {                                          // a field: out when open, its frame and letter left dim
        g.open += ((g.state === 'open' ? 1 : 0) - g.open) * (REDUCED ? 1 : 1 - Math.exp(-12 * dt));
        const on = g.kind === 'charge' ? 1 - 0.6 * g.open : 1 - g.open, flick = REDUCED ? 1 : 0.9 + 0.1 * Math.sin(simT * 9 + g.x);   // lightning never quite goes out
        g.fieldMat.opacity = 0.7 * on * flick + 0.25 * g.flash; g.field.visible = g.fieldMat.opacity > 0.01;
        g.sheetMat.opacity = 0.3 * on + 0.3 * g.flash;
        g.railMat.opacity = 0.35 + 0.65 * on;
        g.signMat.opacity = 0.45 + 0.55 * on + 0.4 * g.flash;
      }
    }
    for (const T of P.tiles) {                          // a section eases round to where it is turning to
      T.shown += (T.turn - T.shown) * (REDUCED ? 1 : 1 - Math.exp(-10 * dt));
      if (Math.abs(T.turn - T.shown) < 1e-3) T.shown = T.turn;
      T.grp.rotation.y = T.shown;
      T.stripeMat.opacity = T.moving > 0 ? 0.5 : 0.9;
    }
    for (const lv of P.levers) {
      lv.throwT = Math.max(0, lv.throwT - dt * 2.5);
      lv.handle.rotation.z += (0.55 * lv.side - lv.handle.rotation.z) * (REDUCED ? 1 : 1 - Math.exp(-14 * dt));   // thrown over, side to side
      lv.faceMat.opacity = 0.75 + 0.25 * lv.throwT;
    }
    for (const M of P.mirrors) {
      M.shown += (M.turn - M.shown) * (REDUCED ? 1 : 1 - Math.exp(-12 * dt));
      M.panel.rotation.y = M.line.rotation.y = M.shown;
      M.flash = Math.max(0, M.flash - dt * 2.5); M.ringMat.opacity = 0.55 + 0.45 * M.flash;
    }
    if (P.crystal) {
      const C = P.crystal; C.k += ((P.lit ? 1 : 0) - C.k) * (REDUCED ? 1 : 1 - Math.exp(-6 * dt));
      C.mat.emissiveIntensity = 0.3 + 2.2 * C.k;
      C.halo.material.opacity = C.k * (REDUCED ? 0.8 : 0.7 + 0.3 * Math.sin(simT * 5));
    }
    for (const q of P.charges) { q.flash = Math.max(0, q.flash - dt * 2.2); q.ringMat.opacity = 0.6 + 0.4 * q.flash; q.pool.material.opacity = 0.14 + 0.35 * q.flash; }
    for (const M of P.magnets) {                        // the field stands up while the marble is charged
      M.buzzT = Math.max(0, M.buzzT - dt); M.k = Math.max(0, M.k - dt * 3);
      const up = P.charged ? 1 : 0;
      M.fieldMat.opacity += ((0.22 + 0.4 * M.k) * up - M.fieldMat.opacity) * (REDUCED ? 1 : 1 - Math.exp(-8 * dt));
      M.field.visible = M.fieldMat.opacity > 0.01;
      M.plateMat.opacity = 0.55 + 0.35 * up + (REDUCED ? 0 : 0.1 * Math.sin(simT * 7 + M.c));
    }
    if (P.charged) {                                    // the marble crackles
      P.sparkT -= dt;
      if (P.sparkT <= 0 && !REDUCED) { P.sparkT = 0.12 + Math.random() * 0.15; burst(marble.position.x, marble.position.y + 0.1, marble.position.z, CHARGE_COL, 3, 2.2); }
    }
    for (const pl of P.plates) {                        // down: sunk and bright
      pl.k += ((pl.on ? 1 : 0) - pl.k) * (REDUCED ? 1 : 1 - Math.exp(-16 * dt)); pl.flash = Math.max(0, pl.flash - dt * 2.5);
      pl.top.position.y = -0.045 * pl.k;
      pl.slabMat.emissiveIntensity = 0.2 + 0.9 * pl.k;
      pl.faceMat.opacity = 0.65 + 0.35 * pl.k; pl.glyphMat.opacity = 0.65 + 0.35 * pl.k;
      pl.pool.material.opacity = 0.12 + 0.3 * pl.k + 0.2 * pl.flash;
    }
    for (const S of P.switches) {                       // a press: the button dips and flares
      S.press = Math.max(0, S.press - dt * 2.2);
      S.button.position.y = -0.06 * Math.sin(Math.PI * Math.min(1, (1 - S.press) * 1.6)) * (S.press > 0 ? 1 : 0);
      S.faceMat.opacity = 0.85 + 0.15 * S.press; S.ringMat.opacity = 0.6 + 0.4 * S.press;
      S.pool.material.opacity = 0.16 + 0.4 * S.press;
    }
    if (P.reset) { P.reset.flash = Math.max(0, P.reset.flash - dt * 2); P.reset.glyphMat.opacity = 0.7 + 0.3 * P.reset.flash; }
    if (plazaAt === P && plazaView > 0.6) P.noteT += dt;   // how long its note has been up
    if (P.tune) animateTune(P, dt);
    if (P.twin) animateTwin(P, dt);
  }
}
// The square the marble is in, or on the road into (with its reset pad).
function plazaHere() {
  for (const P of plazas) {
    const W = P.cols * CELL, D = P.rows * CELL;
    if (ball.p.x > P.x0 - 1.2 && ball.p.x < P.x0 + W + 1.2 && ball.p.z < P.z0 + 5.8 && ball.p.z > P.z0 - D - 0.6) return P;
  }
  return null;
}
/* Where the camera stands to show all of a square in this frame: back and up,
   looking down at about 56 degrees, as close as it can be with the square's
   corners (and a wall's height over them) inside the frame, clear of the top
   band and the bottom edge. Worked out once for each frame shape. */
const _pc = new PerspectiveCamera(), _pv = new Vector3();
function plazaCam(P) {
  const key = cssW + 'x' + cssH + ':' + camera.fov;
  if (P.cam && P.cam.key === key) return P.cam;
  const W = P.cols * CELL, D = P.rows * CELL, cx = P.x0 + W / 2, cz = P.z0 - D / 2, pitch = 0.98;
  _pc.fov = camera.fov; _pc.aspect = cssW / cssH; _pc.near = 0.1; _pc.far = 700; _pc.updateProjectionMatrix();
  const pts = [];
  for (const x of [P.x0 - 0.3, P.x0 + W + 0.3]) for (const z of [P.z0 + 0.5, P.z0 - D - 0.5]) for (const y of [P.y, P.y + 1.5]) pts.push(new Vector3(x, y, z));
  const TOP = 0.62, BOT = -0.88, SIDE = 0.93;           // room at the top for the square's note
  const fit = (dist, shift) => {
    _pc.position.set(cx, P.y + dist * Math.sin(pitch), cz + shift + dist * Math.cos(pitch));
    _pc.lookAt(cx, P.y, cz + shift); _pc.updateMatrixWorld();
    let side = 0, top = -9, bot = 9;
    for (const p of pts) { _pv.copy(p).project(_pc); side = Math.max(side, Math.abs(_pv.x)); top = Math.max(top, _pv.y); bot = Math.min(bot, _pv.y); }
    return { ok: side < SIDE && top < TOP && bot > BOT, top, bot };
  };
  let shift = 0, dist = 30;
  for (let round = 0; round < 4; round++) {
    let lo = 3, hi = 90;
    for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (fit(m, shift).ok) hi = m; else lo = m; }
    dist = hi;
    const f = fit(dist, shift), mid = (f.top + f.bot) / 2, want = (TOP + BOT) / 2;
    shift -= (mid - want) * D * 0.35;                   // aim further on to lower it in the frame, nearer to raise it
  }
  fit(dist, shift);
  P.cam = { key, pos: _pc.position.clone(), at: new Vector3(cx, P.y, cz + shift) };
  return P.cam;
}

function buildPiece(pc) {
  if (pc.t === 'loop') { buildLoop(pc); return; }
  if (pc.t === 'worm') { buildWormhole(pc); return; }
  if (pc.t === 'curtain') { buildCurtain(pc); return; }
  if (pc.t === 'lock') { buildLock(pc); return; }
  if (pc.t === 'round') { buildRound(pc); return; }
  if (pc.t === 'tube') { buildTube(pc); return; }
  if (pc.t === 'switch') { buildSwitch(pc); return; }
  if (pc.t === 'posts') { buildPosts(pc); return; }
  if (pc.t === 'shards') { buildShards(pc); return; }
  if (pc.t === 'block') { buildBlock(pc); return; }
  if (pc.t === 'gauntlet' || pc.t === 'reset') return;   // a reset pad is built with its square
  if (pc.t === 'plaza') { buildPlaza(pc); return; }
  if (pc.t === 'portal') { buildPortal(pc); return; }
  let h = THICK;
  const quat = new Quaternion(), center = new Vector3();
  let w = pc.w, d = pc.d;
  if (pc.t === 'ramp') {
    const len = pc.z0 - pc.z1, dy = pc.y1 - pc.y0;
    d = Math.hypot(len, dy);
    quat.setFromEuler(new Euler(Math.atan2(dy, len), 0, 0));
    const up = new Vector3(0, 1, 0).applyQuaternion(quat);
    center.set(pc.x, (pc.y0 + pc.y1) / 2, (pc.z0 + pc.z1) / 2).addScaledVector(up, -h / 2);
  } else if (pc.t === 'train') {
    h = TRAIN_H;
    center.set(pc.x, pc.y - h / 2, pc.z);
  } else {
    center.set(pc.x, pc.y - h / 2, pc.z);
  }
  const isFerry = pc.t === 'ferry' || pc.t === 'train';
  const mesh = new Mesh(platformGeometry(w, h, d), faceMats(isFerry ? ferryStone : stone));
  mesh.position.copy(center); mesh.quaternion.copy(quat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  levelGroup.add(mesh);
  const c = { mesh, pos: center.clone(), prev: center.clone(), quat, inv: quat.clone().invert(),
              half: new Vector3(w / 2, h / 2, d / 2), delta: new Vector3(), ferry: null, holo: null, pad: null };
  if (isFerry) {
    c.ferry = { base: center.clone(), axis: pc.axis, amp: pc.amp, period: pc.period, dwell: pc.dwell, phase: pc.phase };
    ferries.push(c);
  }
  if (pc.lane) c.lane = pc.lane;
  if (pc.cell) c.cell = true;                           // a puzzle square's floor tile
  if (pc.pit) { c.pit = { filled: false }; mesh.visible = false; }   // a gap: road only once a crate fills it
  if (pc.bridge) { c.bridge = { on: false }; mesh.visible = false; }   // the way out of a square of tiles: there once they are all lit
  if (pc.crack) buildCrackSlab(c, pc, w, d);
  if (pc.dark !== undefined) {                          // a dark road: solid only once its switch is on
    const S = switches[pc.dark];
    c.power = S;
    const g = new Mesh(new PlaneGeometry(1.5, 1.5), glowMat(0xFFFFFF, 0.45, powerGlyph));
    g.rotation.x = -Math.PI / 2; g.position.y = h / 2 + 0.014;
    mesh.add(g); S.decals.push(g);
  }
  if (pc.stub) {                                        // a road out of a roundabout that stops short: a red bar across its end
    const along = pc.stub === 'N' ? [0, -1] : pc.stub === 'W' ? [-1, 0] : [1, 0];
    const bar = new Mesh(new BoxGeometry(along[0] ? 0.1 : w, 0.08, along[0] ? d : 0.1), new MeshBasicMaterial({ color: 0xFF2D48, toneMapped: false }));
    bar.position.set(along[0] * (w / 2 - 0.05), h / 2 + 0.04, along[1] * (d / 2 - 0.05));
    mesh.add(bar);
  }
  dressPiece(c, pc, w, d);
  if (c.holo) holoFaces(c);
  colliders.push(c);
}

function makeRing(x, y, z, isGoal) {
  const rad = isGoal ? 1.3 : 1.1, col = isGoal ? 0xFFD23F : 0xFFFFFF;
  const grp = new Group();
  const mat = new MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: isGoal ? 0.85 : 0.35,
                                         roughness: 0.35 });
  const ring = new Mesh(new TorusGeometry(rad, isGoal ? 0.1 : 0.07, 12, 64), mat);
  ring.position.y = rad;                       // standing on the stone, facing the way you roll
  const discMat = new MeshBasicMaterial({ color: col, transparent: true, opacity: isGoal ? 0.26 : 0.13,
                                          depthWrite: false });
  const disc = new Mesh(new CircleGeometry(rad * 0.92, 48), discMat);
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.012;
  grp.add(ring, disc);
  grp.position.set(x, y, z);
  levelGroup.add(grp);
  return { grp, ring, mat, disc, discMat, pos: new Vector3(x, y, z), passed: false, t0: 0 };
}

function loadLevel(n, custom = null) {
  // Loaded from inside a wormhole's world (a restart as the warp flashes), the level still belongs to the world it left.
  const home = pocket ? pocket.world : world.name;
  if (pocket) { freeCourse(levelGroup); levelGroup = pocket.levelGroup; ({ holos, pads, ferries, locks, mags, switches } = pocket); pocket = null; }
  levelNo = Math.max(1, Math.min(LEVELS.length, n));
  level = custom || LEVELS[levelNo - 1];                 // (custom: a course to try a new puzzle on)
  if (levelGroup) {
    for (const c of holos) for (const m of c.holoMats) m.dispose();
    for (const c of pads) if (c.padFx.tex) c.padFx.tex.dispose();
    for (const c of ferries) if (c.train) for (const t of c.train.model.userData.maps) t.dispose();
    for (const c of locks) c.mat.map.dispose();
    for (const c of mags) c.magFx.tex.dispose();
    for (const S of switches) if (S.top) { S.top.dispose(); S.side.dispose(); }
    for (const c of colliders) if (c.obstacle) new Set([].concat(c.mesh.material)).forEach((m) => { if (!m.userData.keep) m.dispose(); });
    scene.remove(levelGroup);
    levelGroup.traverse((o) => {
      // Stone is shared across levels, and so is a world's kit (userData.keep); each ring owns its materials.
      if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose();
      if (o.material && !Array.isArray(o.material) && !o.material.userData.keep) o.material.dispose();
    });
  }
  tkUndo.length = 0; tkTicks.length = 0;               // the course it dressed is gone, and what moved it each frame goes too
  levelGroup = new Group();
  scene.add(levelGroup);
  colliders = []; ferries = []; holos = []; pads = []; crossings = []; riders = []; curtains = []; locks = []; wormholes = []; loopsIn = []; mags = []; winds = []; rounds = []; tubes = []; switches = []; scans = []; posts = []; blinkers = []; flames = []; cracks = []; plazas = []; gates = [];
  for (const pc of level.pieces) buildPiece(pc);
  // The world follows the course: the neon city to 50, Tokyo from 51 (a world picked to look at, such as the hills, stays).
  // Its scenery follows the course too, so it is rebuilt for it.
  if (['neon', 'tokyo', 'dystopia'].includes(home)) setWorld(levelNo > 50 ? 'tokyo' : 'neon');
  else if (home !== 'void' || world.name !== 'void') setWorld(home);
  level.minTop = Math.min(...level.pieces.map((p) => (p.t === 'ramp' ? Math.min(p.y0, p.y1) : p.y)));
  for (const [x, y, z] of level.gates) gates.push(makeRing(x, y, z, false));
  goal = makeRing(level.goal[0], level.goal[1], level.goal[2], true);
  if (world.rings) tintRings(world.rings[0], world.rings[1]);   // the world was set before these rings were made
  simT = 0;
  for (const c of ferries) updateFerry(c, 0);
  for (const c of crossings) crossStep(c, 0);
  const [sx, sy, sz] = level.start;
  startPos.set(sx, sy + R + 0.01, sz);
  spawn.copy(startPos);
  ball.p.copy(startPos); ball.v.set(0, 0, 0); ball.spin.set(0, 0, 0);
  ball.grounded = true; ball.onFerry = null; ball.airT = 0; ball.boostT = 0; ball.jumpCD = 0; ball.hitT = 0; ball.onLoop = null; ball.onRound = null; ball.tube = null; ball.ice = null;
  setTint(0); spawnTint = 0; loopView = 0; loopAt = null; plazaView = 0; plazaAt = null;
  lastGroundY = sy;
  clock = 0; falls = 0; started = false;
  setState('play');
  updateCamera(0, true);
  if (!level.test) { save.level = levelNo; persist(); }   // a try-out course is not a level: it keeps no place
  T().levelStart(levelNo);
}

/* Where a moving pad is, as a share of its run: +1 and -1 are its two ends,
   where it waits; between them it eases out and in, so it never jerks. */
function ferryAt(f, t) {
  const u = ((t / f.period + f.phase / (2 * Math.PI)) % 1 + 1) % 1, a = f.dwell / f.period;
  const ease3 = (v) => v * v * (3 - 2 * v);
  if (u < a) return 1;
  if (u < 0.5) return 1 - 2 * ease3((u - a) / (0.5 - a));
  if (u < 0.5 + a) return -1;
  return -1 + 2 * ease3((u - 0.5 - a) / (0.5 - a));
}
function updateFerry(c, t) {
  const f = c.ferry;
  c.prev.copy(c.pos);
  c.pos.copy(f.base);
  c.pos[f.axis] += f.amp * ferryAt(f, t);
  c.delta.subVectors(c.pos, c.prev);
  if (c.train) {
    const v = c.delta[f.axis] / STEP; f.a = t > STEP ? (v - f.v) / STEP : 0; f.v = v;
    for (const r of c.riders) { r.prev.copy(r.pos); r.pos.copy(c.pos).add(r.off); r.delta.copy(c.delta); }
  }
  c.mesh.position.copy(c.pos);
}

// ---------- THE MARBLE ----------
const G = 22;              // gravity, a little over twice Earth's: a marble this size feels floaty at 9.8
const ACC_GROUND = 18, ACC_AIR = 6;
const DAMP_GROUND = 1.6, DAMP_AIR = 0.12;   // per second; enough grip to hold a 1.6 m plank
const VMAX = 8;            // horizontal speed cap, metres per second
/* A speed strip pushes on along -z and lifts the cap for a moment after, with
   less grip, so the rush lasts about a second. A jump pad throws the marble
   up, and on at no less than JUMP_ON, which clears any gap a course has. */
const BOOST_ACC = 34, VBOOST = 13, BOOST_T = 1, JUMP_UP = 9, JUMP_ON = 8;
const STEP = 1 / 240;      // physics runs at 240 Hz whatever the display does

const ball = { p: new Vector3(), v: new Vector3(), spin: new Vector3(), grounded: false, in: [0, 0],
               onFerry: null, airT: 0, pad: null, boostT: 0, jumpCD: 0, onBoost: false, hitT: 0, tint: 0, onLoop: null, mag: 0, push: 0, onRound: null, tube: null, ice: null };
let spawnTint = 0;                                      // the marble's colour when it passed its last ring
const startPos = new Vector3(), spawn = new Vector3();
let lastGroundY = 0, simT = 0, acc = 0;

const _L = new Vector3(), _Q = new Vector3(), _N = new Vector3(), _q = new Quaternion(), _ax = new Vector3();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* Sphere against a box, in the box's own frame where it is axis-aligned: the
   closest point of the box to the marble's centre, and out along the line
   between them. A ramp is just a box turned about x. */
function collide(c, dt) {
  // A hologram holds the marble only while it is lit, and only from above: one
  // that lights up round a marble already falling through it lets it fall.
  if (c.holo && (!holoState(c.holo, simT).lit || ball.p.y - R < c.pos.y + c.half.y - 0.3)) return;
  if (c.lock && ball.tint === c.lock) return;
  if (c.power && !c.power.on) return;                   // a dark road is not there until its switch is on
  if (c.crack && c.crack.state === 'gone') return;       // a crystal slab that has dropped away
  if (c.gate && c.gate.state === 'open') return;         // an open gate in a puzzle square
  if (c.magnet && !c.magnet.P.charged) return;            // a charged floor pushes only a charged marble away
  if (c.arm && !c.arm.on) return;                         // a turning section's railing, on a side its road joins
  if (c.pit && !c.pit.filled) return;                     // a gap no crate has filled
  if (c.bridge && !c.bridge.on) return;                   // a bridge not there yet
  if (c.gone) return;                                     // a tile that has crumbled
  _L.subVectors(ball.p, c.pos).applyQuaternion(c.inv);
  const h = c.half;
  if (Math.abs(_L.x) > h.x + R || Math.abs(_L.y) > h.y + R || Math.abs(_L.z) > h.z + R) return;
  _Q.set(clamp(_L.x, -h.x, h.x), clamp(_L.y, -h.y, h.y), clamp(_L.z, -h.z, h.z));
  _N.subVectors(_L, _Q);
  const d2 = _N.lengthSq();
  let pen;
  if (d2 > 1e-10) {
    if (d2 >= R * R) return;
    const d = Math.sqrt(d2);
    _N.multiplyScalar(1 / d); pen = R - d;
  } else {                                     // centre inside the box: leave by the nearest face
    const px = h.x - Math.abs(_L.x), py = h.y - Math.abs(_L.y), pz = h.z - Math.abs(_L.z);
    if (py <= px && py <= pz) { _N.set(0, _L.y < 0 ? -1 : 1, 0); pen = py + R; }
    else if (px <= pz) { _N.set(_L.x < 0 ? -1 : 1, 0, 0); pen = px + R; }
    else { _N.set(0, 0, _L.z < 0 ? -1 : 1); pen = pz + R; }
  }
  _N.applyQuaternion(c.quat);
  ball.p.addScaledVector(_N, pen);
  if (c.gate) gateTouch(c.gate);
  if (c.magnet && c.magnet.buzzT <= 0) { c.magnet.buzzT = 0.45; c.magnet.k = 1; sound('buzz'); }
  const floor = _N.y > 0.55;
  const rel = ball.v.dot(_N) - (c.ferry ? c.delta.dot(_N) / dt : 0);
  if (c.crate && !floor) crateTouch(c.crate, _N, rel);
  if (rel < 0) {
    const e = floor ? (rel < -7 ? 0.25 : 0) : 0.35;
    ball.v.addScaledVector(_N, -(1 + e) * rel);
    if (floor && rel < -4 && ball.airT > 0.12) { play('land'); shake = Math.max(shake, 0.12); }
    else if (c.lock) { if (!c.buzzT) { sound('buzz'); c.buzzT = 0.35; } c.flash = 1; }
    else if (c.obstacle && !floor) { if (rel < -1.2 && simT - knockT > 0.12) { knockT = simT; sound('knock'); } }
    else if (!floor && rel < -3) play('tick');
  }
  if (floor) {
    ball.grounded = true; if (c.ferry) ball.onFerry = c; if (c.pad) ball.pad = c.pad; if (c.mag) ball.mag = c.mag;
    if (c.crack && c.crack.state === 'whole') { c.crack.state = 'cracking'; c.crack.t0 = simT; sound('crack'); }
  }
}

function step(dt, ix, iz) {
  simT += dt;
  ball.in[0] = ix; ball.in[1] = iz;                     // the stick, for what leans on things (a crate)
  for (const c of ferries) updateFerry(c, simT);
  if (ball.tube) { rideTube(dt); for (const c of crossings) crossStep(c, simT); return; }   // in a tube, the tube steers
  if (ball.ice) { iceStep(dt, ix, iz); for (const c of crossings) crossStep(c, simT); return; }   // on ice, the ice does
  if (ball.onFerry) {
    ball.p.add(ball.onFerry.delta);                    // a pad carries what rests on it
    const T = ball.onFerry.train;                      // and a train pulls on what rides it
    if (T) ball.v[ball.onFerry.ferry.axis] -= ball.onFerry.ferry.a * T.pull * dt;
  }
  if (ball.onRound) {                                   // a roundabout carries what rests on it round with it,
    const Rd = ball.onRound, a = -Rd.spin * dt, dx = ball.p.x - Rd.x, dz = ball.p.z - Rd.z, c = Math.cos(a), s = Math.sin(a);
    ball.p.x = Rd.x + dx * c + dz * s; ball.p.z = Rd.z - dx * s + dz * c;
    const f = RB_CF * Rd.spin * Rd.spin;                // and pushes it gently outward
    ball.v.x += dx * f * dt; ball.v.z += dz * f * dt;
  }
  const WP = world.physics;                             // a world may grip differently: crystal is slippery
  if (ball.onLoop) { ix = 0; iz = 0; }                  // round a loop the loop carries the marble
  const a = ball.grounded ? (WP ? WP.acc : ACC_GROUND) : ACC_AIR;
  ball.v.x += ix * a * dt; ball.v.z += iz * a * dt;
  ball.v.y = Math.max(-30, ball.v.y - G * dt);
  const k = ball.onLoop ? 1 : Math.exp(-(ball.grounded ? (WP ? WP.damp : DAMP_GROUND) * (ball.boostT > 0 ? 0.35 : 1) : DAMP_AIR) * dt);
  ball.v.x *= k; ball.v.z *= k;
  const hs = Math.hypot(ball.v.x, ball.v.z), cap = VMAX + (VBOOST - VMAX) * clamp(ball.boostT / 0.5, 0, 1);
  if (hs > cap && !ball.onLoop) { ball.v.x *= cap / hs; ball.v.z *= cap / hs; }
  ball.p.addScaledVector(ball.v, dt);
  ball.grounded = false; ball.onFerry = null; ball.pad = null; ball.mag = 0; ball.onRound = null;
  for (const c of colliders) collide(c, dt);
  for (const c of riders) collide(c, dt);
  for (const c of locks) collide(c, dt);
  for (const Rd of rounds) roundContact(Rd);
  for (const P of posts) postContact(P);
  if (tubes.length) tubeCatch();
  if (switches.length) switchStep();
  if (scans.length && state === 'play') scanStep();
  if (flames.length && state === 'play') flameStep();
  if (cracks.length) crackStep();
  if (plazas.length) { plazaMove(); if (state === 'play') { plazaStep(); iceCatch(); portalStep(); } }
  ball.onLoop = null;
  for (const L of loopsIn) loopContact(L);
  tintStep();
  ball.boostT = Math.max(0, ball.boostT - dt); ball.jumpCD = Math.max(0, ball.jumpCD - dt); ball.hitT = Math.max(0, ball.hitT - dt);
  for (const c of crossings) crossStep(c, simT);
  // Pushed across: by a maglev strip underfoot, and by any gust blowing here.
  let push = ball.mag;
  for (const W of winds) push += windPush(W);
  ball.v.x += push * dt; ball.push = push;
  if (ball.pad === 'boost') {
    ball.v.z -= BOOST_ACC * dt; ball.boostT = BOOST_T;
    if (!ball.onBoost) sound('boost');
  } else if (ball.pad === 'jump' && ball.jumpCD === 0) {
    ball.v.y = JUMP_UP; ball.v.z = Math.min(ball.v.z, -JUMP_ON); ball.jumpCD = 0.4;
    sound('jump');
  }
  ball.onBoost = ball.pad === 'boost';
  ball.airT = ball.grounded ? 0 : ball.airT + dt;
  if (ball.grounded) lastGroundY = ball.p.y - R;
}

// The marble turns as it rolls: angular velocity is up x velocity over radius.
function spinMarble(dt) {
  if (ball.ice && ball.ice.P.pc.ice) ball.spin.multiplyScalar(Math.exp(-8 * dt));   // on ice it glides
  else if (ball.grounded) ball.spin.set(ball.v.z, 0, -ball.v.x).multiplyScalar(1 / R);
  else ball.spin.multiplyScalar(Math.exp(-0.6 * dt));
  const w = ball.spin.length();
  if (w > 1e-4) {
    _q.setFromAxisAngle(_ax.copy(ball.spin).multiplyScalar(1 / w), w * dt);
    marble.quaternion.premultiply(_q);
  }
  marble.position.copy(ball.p);
}

// ---------- STATE ----------
// play | fall | home (flying back) | goal (the win on the board) | win (card) | rules (card)
let state = 'play', stateT = 0, resume = 'play', resumeT = 0;
let levelNo = 1, clock = 0, falls = 0, started = false, everMoved = false, shake = 0, cardScroll = 0;
const flight = { from: new Vector3(), ctl: new Vector3(), to: new Vector3(), dur: 0.7 };

function setState(s) { state = s; stateT = 0; }

function startFall() {
  falls++;
  sound('drop');
  setState('fall');
}
/* A fall is refused, not punished: the marble flies back to where it came
   from, visibly, on an arc (DESIGN-SYSTEM 10.2), and lands with a thud. */
function flyTo(dest) {
  flight.from.copy(ball.p);
  flight.to.copy(dest);
  flight.ctl.addVectors(flight.from, flight.to).multiplyScalar(0.5);
  flight.ctl.y = Math.max(flight.from.y, flight.to.y) + 4;
  flight.dur = Math.min(0.9, 0.45 + flight.from.distanceTo(flight.to) * 0.02);
  ball.v.set(0, 0, 0); ball.onFerry = null; ball.boostT = 0; ball.hitT = 0; ball.ice = null;
  setState('home');
  if (REDUCED) arrive();
}
function arrive() {
  for (const c of cracks) if (c.crack.state !== 'whole') { c.crack.state = 'whole'; c.crack.back = simT; }   // the bridges stand again
  for (const P of plazas) if (P.cov && flight.to.z > P.z0 - 0.1) resetCover(P);   // and the tiles of a square ahead
  for (const P of plazas) if (P.tune && !P.tune.done && flight.to.z > P.z0 - 0.1) Object.assign(P.tune, { at: 0, heard: false, play: null });   // a tune ahead, to hear again
  for (const P of plazas) if (P.twin && !P.twin.done && flight.to.z > P.z0 - 0.1) resetTwin(P);   // a twin ahead, home again
  ball.p.copy(flight.to); ball.v.set(0, 0, 0);
  setTint(spawnTint);
  ball.grounded = true; ball.airT = 0;
  lastGroundY = flight.to.y - R;
  sound('home');
  shake = 0.3;
  burst(ball.p.x, ball.p.y - R + 0.05, ball.p.z, 0xFFFFFF, 14, 3);
  setState('play');
}
function passGate(g) {
  g.passed = true; g.t0 = performance.now();
  g.mat.color.setHex(0x5DD39E); g.mat.emissive.setHex(0x5DD39E); g.mat.emissiveIntensity = 0.7;
  g.discMat.color.setHex(0x5DD39E); g.discMat.opacity = 0.22;
  spawn.set(g.pos.x, g.pos.y + R + 0.01, g.pos.z);
  spawnTint = ball.tint;
  sound('unlock');
  if (world.glowGates) lightGate(g);
  else burst(g.pos.x, g.pos.y + 1.1, g.pos.z, 0x5DD39E, 26, 4);
}
/* THE NEON GATES LIGHT UP (owner, 2026-09-26: "make the neon gates glow when
   passed"). A ring passed flashes white-hot and settles into a steady green
   glow, a tight halo hugging its tube (DESIGN-SYSTEM 6: a thin bright core,
   never a wide wash); one ring of light pulses outward; the pad under it
   brightens. It stays lit, so the lit rings are the ones holding your place.
   No sparks in the city: the glow is the answer, and it keeps to "no confetti". */
const GATE_GREEN = new Color(0x5DD39E), GATE_WHITE = new Color(0xFFFFFF);
function lightGate(g) {
  const rad = g.ring.geometry.parameters.radius, y = g.ring.position.y;
  const add = (m) => { m.position.y = y; g.grp.add(m); return m; };
  const glowMat = (color, opacity) => new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending,
                                                             depthWrite: false, side: DoubleSide, toneMapped: false });
  g.glow = {
    inner: add(new Mesh(new TorusGeometry(rad, 0.13, 10, 72), glowMat(0x5DD39E, 0.4))),
    outer: add(new Mesh(new TorusGeometry(rad, 0.24, 10, 72), glowMat(0x5DD39E, 0.14))),
    pulse: add(new Mesh(new RingGeometry(rad * 0.94, rad * 1.06, 72), glowMat(0xBFFFE0, 0.9))),
  };
  g.discMat.opacity = 0.34;
}
const TRY = {};                                         // each try-out course, made when first asked for
function loadTry(kind, tokyo) {
  const n = tokyo ? 51 : 41, k = kind + (tokyo ? '-tokyo' : '');
  loadLevel(n, TRY[k] || (TRY[k] = makeLevel(n, 0, kind)));
}
const starTime = () => (level.test ? level.star : STAR_TIMES[levelNo - 1]);
function startGoal() {
  setState('goal');
  ball.v.set(0, 0, 0);
  goal.t0 = performance.now();
  sound('win');
  burst(goal.pos.x, goal.pos.y + 1.3, goal.pos.z, 0xFFD23F, 56, 6);
  burst(goal.pos.x, goal.pos.y + 1.3, goal.pos.z, 0xFFFFFF, 22, 5);
  lastStar = clock < starTime();
  if (level.test) { lastWasBest = false; return; }      // a try-out course keeps no times or stars
  const best = save.best[levelNo];
  if (!best || clock < best) save.best[levelNo] = clock;
  lastWasBest = !best || clock < best;
  if (lastStar) save.stars[levelNo] = 1;
  save.level = Math.min(LEVELS.length, levelNo + 1);
  persist();
  T().levelComplete(levelNo);
}
let lastWasBest = false, lastStar = false;
const starCount = () => Object.keys(save.stars).length;
// A five-point star, point up: filled, or drawn as an outline.
function drawStarIcon(cx, cy, r, filled, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.46 : r;
    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
  if (filled) { ctx.fillStyle = color; ctx.fill(); }
  else { ctx.strokeStyle = color; ctx.lineWidth = 1.75; ctx.lineJoin = 'round'; ctx.stroke(); }
}

function restartLevel() {
  if (pocket && state !== 'warp') leavePocket();
  for (const W of wormholes) { W.open = 1; W.closing = false; }
  for (const g of gates) {
    if (g.glow) {
      for (const m of Object.values(g.glow)) { g.grp.remove(m); m.geometry.dispose(); m.material.dispose(); }
      g.glow = null;
    }
    g.passed = false; g.t0 = 0; g.ring.scale.setScalar(1);
    g.mat.color.setHex(gateColour()); g.mat.emissive.setHex(gateColour()); g.mat.emissiveIntensity = 0.35;
    g.discMat.color.setHex(gateColour()); g.discMat.opacity = 0.13;
  }
  clock = 0; falls = 0; started = false;
  spawn.copy(startPos); spawnTint = 0; setTint(0);
  for (const P of plazas) resetPlaza(P, true);
  T().levelRestart(levelNo);
  if (state === 'play' || state === 'fall' || state === 'home') flyTo(startPos);
  else loadLevel(levelNo, level.test ? level : null);
}

/* A ring counts when the marble crosses its line anywhere across the path,
   not only through the hoop: a save missed by rolling along the edge of a wide
   pad would read as a bug. Every ring stands across a path that runs along z. */
const crossed = (m, halfW) => Math.abs(ball.p.z - m.pos.z) < 0.6 && Math.abs(ball.p.x - m.pos.x) < halfW &&
                              Math.abs(ball.p.y - R - m.pos.y) < 1.4;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function update(dt, now) {
  if (state === 'rules') return;              // the world holds still behind the card
  stateT += dt;
  const [ix, iz] = readInput();
  if ((ix || iz) && state === 'play') {
    if (!started) { started = true; T().gameStart(); }
    everMoved = true;
  }
  if (started && (state === 'play' || state === 'fall' || state === 'home')) clock += dt;

  acc = Math.min(acc + dt, 0.1);
  while (acc >= STEP) {
    acc -= STEP;
    if (state === 'play' || state === 'fall') step(STEP, state === 'play' ? ix : 0, state === 'play' ? iz : 0);
    else { simT += STEP; for (const c of ferries) updateFerry(c, simT); for (const c of crossings) crossStep(c, simT); }
  }

  if (state === 'play') {
    for (const g of gates) if (!g.passed && crossed(g, 2.2)) passGate(g);
    for (const W of wormholes) if ((W.pc.dir === 'in' || W.pc.dir === 'exit') && inPortal(W)) { startWarp(W); break; }
    if (state !== 'play') { /* into a wormhole */ }
    else if (goal && crossed(goal, 3.2)) startGoal();
    else if (ball.p.y < level.minTop - 2.2) startFall();
  } else if (state === 'warp') {
    // The light swells, the worlds change behind it at its brightest, and it clears.
    if (!warp.done && stateT >= WARP_IN) { warp.done = true; warp.go(); updateCamera(0, true); }
    if (stateT >= WARP_IN + WARP_OUT) setState('play');
  } else if (state === 'fall') {
    if (stateT > 0.55) flyTo(spawn);
  } else if (state === 'home') {
    const t = ease(Math.min(1, stateT / flight.dur)), u = 1 - t;
    ball.p.set(
      u * u * flight.from.x + 2 * u * t * flight.ctl.x + t * t * flight.to.x,
      u * u * flight.from.y + 2 * u * t * flight.ctl.y + t * t * flight.to.y,
      u * u * flight.from.z + 2 * u * t * flight.ctl.z + t * t * flight.to.z);
    ball.spin.set(-6, 0, 0);
    if (stateT >= flight.dur) arrive();
  } else if (state === 'goal') {
    // The marble settles into the ring and lifts, the ring flares, the sparks
    // fly; the card comes after (DESIGN-SYSTEM 10.2).
    const k = 1 - Math.exp(-8 * dt);
    ball.p.x += (goal.pos.x - ball.p.x) * k;
    ball.p.z += (goal.pos.z - ball.p.z) * k;
    ball.p.y += (goal.pos.y + R + 0.5 * Math.min(1, stateT / 0.6) - ball.p.y) * k;
    ball.spin.set(0, 9, 0);
    if (stateT > (REDUCED ? 0.35 : 1.15)) { setState('win'); cardScroll = 0; }
  }

  if (state === 'home' || state === 'goal') {
    const w = ball.spin.length();
    if (w > 1e-4) { _q.setFromAxisAngle(_ax.copy(ball.spin).multiplyScalar(1 / w), w * dt); marble.quaternion.premultiply(_q); }
    marble.position.copy(ball.p);
  } else spinMarble(dt);

  animateRings(now, dt);
  animatePieces(dt);
  animateCrossings();
  animateRides();
  animateTints(dt);
  animateWormholes(dt);
  animateRipple(dt);
  animateMagsAndWinds(dt);
  animateRounds(dt);
  animateTubes();
  animateSwitches(dt);
  animateScans();
  animateFlames();
  animateCracks(dt);
  animateBlocks();
  animatePlazas(dt);
  for (const f of tkTicks) f(dt);
  updateSparks(dt);
  updateCamera(dt, false);
  updateSunPoint();
  if (world.tick) world.tick(dt);
  updateRoll();
  updateCitySound();
}

function animateRings(now, dt) {
  for (const g of gates) {
    if (!g.t0) continue;
    const k = Math.min(1, (now - g.t0) / 450);
    g.ring.scale.setScalar(REDUCED ? 1 : 1 + 0.28 * Math.sin(Math.PI * k));
    if (g.glow) {
      const fl = REDUCED ? 0 : 1 - Math.min(1, (now - g.t0) / 650);        // the flash, settling into the steady glow
      const breathe = REDUCED ? 0 : 0.05 * Math.sin(now / 380);
      g.mat.emissive.copy(GATE_GREEN).lerp(GATE_WHITE, fl * 0.8);
      g.mat.emissiveIntensity = 1.5 + 2.5 * fl;
      g.glow.inner.material.opacity = 0.34 + 0.35 * fl + breathe;
      g.glow.outer.material.opacity = 0.12 + 0.2 * fl + breathe * 0.5;
      const p = Math.min(1, (now - g.t0) / 700);                             // one ring of light, outward
      g.glow.pulse.visible = !REDUCED && p < 1;
      g.glow.pulse.scale.setScalar(1 + 0.9 * ease(p));
      g.glow.pulse.material.opacity = 0.9 * (1 - p);
    }
  }
  if (!goal) return;                         // a wormhole's world has no finish ring
  goal.ring.rotation.y += dt * 0.8;
  if (goal.t0) {
    const k = Math.min(1, (now - goal.t0) / 900);
    goal.ring.scale.setScalar(REDUCED ? 1.15 : 1 + 0.35 * Math.sin(Math.PI * Math.min(1, k * 1.4)) + 0.15 * k);
    goal.mat.emissiveIntensity = 0.85 + 1.4 * (1 - k);
    goal.ring.rotation.y += dt * 6 * (1 - k);
  } else {
    goal.discMat.opacity = 0.2 + 0.08 * Math.sin(now / 420);
  }
}

// ---------- CAMERA ----------
/* It never turns. The course runs away from the viewer, so "drag up" always
   means "roll away", which is the one mapping a thumb learns in a second. A
   tall phone needs to see further ahead and has less width, so it sits higher
   with a wider lens; a landscape frame sits lower. */
function camParams() {
  const t = clamp((LW / LH - 0.5) / 0.75, 0, 1);  // 0 a tall phone, 1 landscape
  return { fov: 60 - 12 * t, h: 9.2 - 3.2 * t, back: 8.6 - 0.8 * t, ahead: 4.4 - 1.2 * t };
}
function fitCamera() {
  camera.fov = camParams().fov;
  camera.aspect = cssW / cssH;
  camera.updateProjectionMatrix();
}
const camFocus = new Vector3();
let loopView = 0, loopAt = null, tubeView = 0, plazaView = 0, plazaAt = null;
const _lp = new Vector3(), _la = new Vector3(), _lb = new Vector3();
let camY = 0, closeup = false, peekCam = null;
const cityRefs = { frozen: false };                   // the harness's handles on the city, for stills
function updateCamera(dt, snap) {
  const P = camParams();
  const k = snap ? 1 : 1 - Math.exp(-5 * dt);
  camFocus.x += (ball.p.x - camFocus.x) * k;
  camFocus.z += (ball.p.z - camFocus.z) * k;
  // Height follows the ground the marble last stood on, so a fall drops away
  // from the camera instead of dragging it down into the void.
  const ty = state === 'home' ? flight.to.y - R : state === 'fall' ? camY : ball.tube ? ball.p.y - R : lastGroundY;
  camY += (ty - camY) * (snap ? 1 : 1 - Math.exp(-(ball.tube ? 5 : 3) * dt));
  tubeView += ((ball.tube && !REDUCED ? 1 : 0) - tubeView) * (snap ? 1 : 1 - Math.exp(-2.5 * dt));
  let sx = 0, sy = 0;
  if (shake > 0) {
    shake = Math.max(0, shake - dt);
    if (!REDUCED) { sx = (Math.random() - 0.5) * shake * 0.3; sy = (Math.random() - 0.5) * shake * 0.3; }
  }
  camera.position.set(camFocus.x + sx, camY + P.h + 2.5 * tubeView + sy, camFocus.z + P.back + 5 * tubeView);
  camera.lookAt(camFocus.x + sx, camY, camFocus.z - P.ahead);
  // Round a loop: out to the side, where the loop shows as a loop.
  loopView += ((ball.onLoop && !REDUCED ? 1 : 0) - loopView) * (snap ? 1 : 1 - Math.exp(-(ball.onLoop ? 9 : 7) * dt));
  if (ball.onLoop) loopAt = ball.onLoop;
  if (loopView > 0.001 && loopAt) {
    const L = loopAt, side = L.shift > 0 ? -1 : 1, k = ease(loopView);
    _lp.set(L.x0 + L.shift / 2 + side * 9.5, L.cy + 2, L.z0 - LOOP_RUN / 2 + 4);
    camera.position.lerp(_lp, k);
    _la.set(L.x0 + L.shift / 2, L.cy, L.z0 - LOOP_RUN / 2);
    _lb.set(camFocus.x + sx, camY, camFocus.z - P.ahead).lerp(_la, k);
    camera.lookAt(_lb);
  }
  // In a puzzle square, and on the road into it: up and back, to show the whole square.
  const Pz = state === 'goal' || state === 'win' ? null : plazaHere();
  plazaView += ((Pz ? 1 : 0) - plazaView) * (snap || REDUCED ? 1 : 1 - Math.exp(-2.2 * dt));
  if (Pz) plazaAt = Pz;
  if (plazaView > 0.001 && plazaAt) {
    const V = plazaCam(plazaAt), k = ease(plazaView);
    camera.position.lerp(V.pos, k);
    _lb.set(camFocus.x + sx, camY, camFocus.z - P.ahead).lerp(V.at, k);
    camera.lookAt(_lb);
  }
  if (peekCam) { camera.position.set(...peekCam.pos); camera.lookAt(...peekCam.at); }
  if (closeup) {                              // the harness's still-life view of the marble
    camera.position.set(ball.p.x + 1.35, ball.p.y + 1.05, ball.p.z + 2.1);
    camera.lookAt(ball.p.x + 0.12, ball.p.y - 0.2, ball.p.z - 0.1);
  }
  // The sun rides with the view, so its shadow map always covers the marble.
  sun.target.position.set(camFocus.x, camY, camFocus.z - 2);
  sun.position.copy(sun.target.position).add(SUN_OFFSET);
}

// ---------- INPUT ----------
/* Drag anywhere to roll. Where the finger lands is the centre of a stick; how
   far it has moved from there is how hard the marble is pushed, full at JR.
   Past JR the centre follows the finger, so reversing is always one short
   movement away rather than a long drag back. */
const JR = 52, DEAD = 0.1;
let joy = null, pressed = null, cardDrag = null;
const keys = new Set();

let forced = null;                                      // the harness's stick, for fast checks
function readInput() {
  if (forced) return forced;
  let x = 0, z = 0;
  if (joy) {
    const dx = (joy.x - joy.ox) / JR, dy = (joy.y - joy.oy) / JR;
    const m = Math.hypot(dx, dy);
    if (m > DEAD) { const s = Math.min(1, (m - DEAD) / (1 - DEAD)) / m; x = dx * s; z = dy * s; }
  }
  const kx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
  const kz = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
  if (kx || kz) { const m = Math.hypot(kx, kz); x = kx / m; z = kz / m; }
  return [x, z];
}

function toLogical(e) {
  const rect = hud.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (LW / rect.width), y: (e.clientY - rect.top) * (LH / rect.height) };
}
const inBox = (p, b) => b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
const cardOpen = () => state === 'rules' || state === 'win';
function hitKey(p) {
  // While a card is up only its button answers; the controls under the scrim are asleep.
  const keysUp = cardOpen() ? ['cta'] : ['restart', 'rules', 'sound'];
  for (const k of keysUp) if (inBox(p, L.hit[k])) return k;
  return null;
}
function firstGesture() {
  if (sfx) sfx.ensureAudio();
  ensureRoll();
  ensureCitySound();
}
/* SOUND FROM THE FIRST LIFT OF A FINGER (owner, 2026-09-27: "The sound isn't
   playing for the first 25-30 seconds"). A phone lets a page start sound only
   from a touch that has ended (touchend, pointerup, click) or a key, and only
   if the sound is started right there, in that event. The audio was built when
   the first drag began, so it stayed held back ("suspended") until some sound
   happened to start inside a tap: on an iPhone, NEXT at the end of level 1. So
   every such event, anywhere on the page (the cover included), wakes it and
   starts a silent sound there and then, the old iPhone way. It keeps listening,
   because a phone call or another app can put the audio to sleep again. */
let audioAwake = false;
function audioIsAwake() {                                // tell the page, once: its cover need not ask for a tap
  if (audioAwake) return;
  audioAwake = true;
  window.dispatchEvent(new Event('audio-awake'));
}
function wakeAudio() {
  if (!sfx) return;
  const ctx = sfx.ensureAudio();
  if (!ctx) return;
  if (ctx.state === 'running') { audioIsAwake(); return; }
  try { ctx.resume().then(() => { if (ctx.state === 'running') audioIsAwake(); }).catch(() => {}); } catch (_) {}
  try { const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); s.connect(ctx.destination); s.start(0); } catch (_) {}
}
for (const ev of ['pointerdown', 'touchstart', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, wakeAudio, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) wakeAudio(); });

hud.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  firstGesture();
  const p = toLogical(e);
  const k = hitKey(p);
  if (k) { pressed = { key: k, id: e.pointerId }; return; }
  if (cardOpen()) {
    if (state === 'rules' && inBox(p, L.cardBody)) cardDrag = { id: e.pointerId, y: p.y, s: cardScroll };
    return;
  }
  joy = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
  try { hud.setPointerCapture(e.pointerId); } catch (_) {}
});
hud.addEventListener('pointermove', (e) => {
  const p = toLogical(e);
  if (joy && e.pointerId === joy.id) {
    joy.x = p.x; joy.y = p.y;
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, m = Math.hypot(dx, dy);
    if (m > JR) { joy.ox = joy.x - dx / m * JR; joy.oy = joy.y - dy / m * JR; }
  }
  if (cardDrag && e.pointerId === cardDrag.id) cardScroll = cardDrag.s + (cardDrag.y - p.y);
});
function endPointer(e, cancelled) {
  const p = toLogical(e);
  if (pressed && e.pointerId === pressed.id) {
    const k = pressed.key; pressed = null;
    if (!cancelled && hitKey(p) === k) act(k);
  }
  if (joy && e.pointerId === joy.id) joy = null;
  if (cardDrag && e.pointerId === cardDrag.id) cardDrag = null;
}
hud.addEventListener('pointerup', (e) => endPointer(e, false));
hud.addEventListener('pointercancel', (e) => endPointer(e, true));
hud.addEventListener('wheel', (e) => {
  if (state !== 'rules') return;
  e.preventDefault();
  cardScroll += e.deltaY;
}, { passive: false });

const KEYMAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
                 KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down' };
window.addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code];
  if (k) {
    firstGesture();
    if (!cardOpen()) { keys.add(k); e.preventDefault(); }
    else if (state === 'rules' && (k === 'up' || k === 'down')) { cardScroll += k === 'up' ? -40 : 40; e.preventDefault(); }
  } else if ((e.code === 'Enter' || e.code === 'Space') && cardOpen()) { e.preventDefault(); act('cta'); }
  else if (e.code === 'Escape' && state === 'rules') act('cta');
});
window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
window.addEventListener('blur', () => { keys.clear(); joy = null; });

function act(k) {
  if (k === 'sound') { if (sfx) sfx.setOn(!sfx.isOn()); play('click'); return; }
  play('click');
  if (k === 'restart') restartLevel();
  else if (k === 'rules') { resume = state; resumeT = stateT; joy = null; keys.clear(); cardScroll = 0; setState('rules'); }
  else if (k === 'cta') {
    if (state === 'rules') { state = resume; stateT = resumeT; }   // back exactly where it paused
    else if (state === 'win') { play('start'); if (level.test) loadLevel(levelNo, level); else loadLevel(levelNo >= LEVELS.length ? 1 : levelNo + 1); }
  }
}

// ---------- HUD ----------
const L = { hit: {}, cardBody: null };
const SEP = '   ·   ', SEP_TIGHT = '  ·  ';
const fmt = (s) => { const t = Math.floor(s); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

/* The one departure from the house pattern, and Tailwind's: a scrim behind
   each band. The palette's white controls assume a dark ground, and here pale
   stone passes under them. It feathers out rather than ending in a bar. */
function drawScrims() {
  const t = topBand(), b = botBand(), f = 22, a = 'rgba(10,16,28,0.82)', z = 'rgba(10,16,28,0)';
  let g = ctx.createLinearGradient(0, 0, 0, t + f);
  g.addColorStop(0, a); g.addColorStop(t / (t + f), a); g.addColorStop(1, z);
  ctx.fillStyle = g; ctx.fillRect(0, 0, LW, t + f);
  g = ctx.createLinearGradient(0, LH - b - f, 0, LH);
  g.addColorStop(0, z); g.addColorStop(f / (b + f), a); g.addColorStop(1, a);
  ctx.fillStyle = g; ctx.fillRect(0, LH - b - f, LW, b + f);
}

// Controls at the top (DESIGN-SYSTEM 4.2). The house order is map, Undo,
// Restart, Hint, Skip, Rules; Marble has only Restart and Rules.
function drawControls() {
  const cy = topBand() / 2;
  if (MODE === 'mobile') {
    const items = ['restart', 'rules'], D = UI.PILL.iconW, n = items.length;
    const gap = Math.max(4, Math.min(28, (LW - PHONE_PAD * 2 - n * D) / (n - 1)));
    let x = PHONE_PAD;
    for (const k of items) {
      L.hit[k] = UI.drawRound(ctx, x + D / 2, cy);
      UI.drawIcon(ctx, k, x + D / 2, cy);
      x += D + gap;
    }
    return;
  }
  let x = SIDE_PAD;
  L.hit.sound = UI.drawPill(ctx, '', x + UI.PILL.iconW / 2, cy, { w: UI.PILL.iconW });
  UI.drawIcon(ctx, 'sound', x + UI.PILL.iconW / 2, cy, { on: sfx ? sfx.isOn() : true });
  x += UI.PILL.iconW + UI.PILL.gap;
  for (const [k, label] of [['restart', 'Restart'], ['rules', 'Rules']]) {
    const w = UI.pillWidth(ctx, label);
    L.hit[k] = UI.drawPill(ctx, label, x + w / 2, cy, { w });
    x += w + UI.PILL.gap;
  }
}

/* The read-out, one line at the bottom left (DESIGN-SYSTEM 4.3). It can grow
   (a long time, many falls), so it has forms, the shortest last, and takes the
   longest that fits (10.3). */
/* The star time rides beside the clock, as a star and a time: a filled star
   when the level's star is already yours, a gold outline while this run can
   still earn it, and a grey one once the clock has passed it. */
const STAR_W = 17;
function drawReadout() {
  const phone = MODE === 'mobile', ly = LH - botBand() / 2, x0 = phone ? PHONE_PAD : SIDE_PAD;
  const room = phone ? LW - PHONE_PAD * 2 - 44 - 8 : LW - SIDE_PAD * 2;
  const lv = level.title || 'LEVEL ' + levelNo, tm = fmt(clock), fl = 'FALLS ' + falls, starT = starTime(), sT = fmt(starT);
  // Before FALLS is dropped, the dots close up a little: LEVEL 100 on a phone needs a few pixels more.
  const forms = [[SEP, [lv, { t: 'TIME ' + tm, s: sT }, fl]], [SEP, [lv, { t: tm, s: sT }, fl]], [SEP_TIGHT, [lv, { t: tm, s: sT }, fl]],
                 [SEP, [lv, { t: tm, s: sT }]], [SEP, [lv, tm]]];
  ctx.font = '600 16px Inter, sans-serif';
  const segW = (g) => (typeof g === 'string' ? ctx.measureText(g).width : ctx.measureText(g.t).width + 11 + STAR_W + 5 + ctx.measureText(g.s).width);
  const width = ([sp, f]) => f.reduce((a, g, i) => a + segW(g) + (i ? ctx.measureText(sp).width : 0), 0);
  let [sep, form] = forms[forms.length - 1];
  for (const f of forms) if (width(f) <= room) { [sep, form] = f; break; }
  const sepW = ctx.measureText(sep).width;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = TOK.ink72;
  let x = x0;
  const have = !!save.stars[levelNo], still = clock < starT;
  form.forEach((g, i) => {
    if (i) { ctx.fillText(sep, x, ly); x += sepW; }
    if (typeof g === 'string') { ctx.fillText(g, x, ly); x += segW(g); return; }
    ctx.fillText(g.t, x, ly);
    const sx = x + ctx.measureText(g.t).width + 11;
    drawStarIcon(sx + STAR_W / 2, ly - 1, STAR_W / 2, have, have || still ? TOK.accent2 : TOK.tint40);
    ctx.fillStyle = TOK.ink72; ctx.fillText(g.s, sx + STAR_W + 5, ly);          // the time stays readable; the star greys
    x += segW(g);
  });
  const txt = form.map((g) => (typeof g === 'string' ? g : g.t + ' *' + g.s)).join(sep);
  L.readout = { text: txt, x: x0, w: x - x0 };
  if (phone) {
    // The sound switch, bare at the bottom right; no circle, but a full target.
    const sx = LW - PHONE_PAD - 11;
    UI.drawIcon(ctx, 'sound', sx, ly, { on: sfx ? sfx.isOn() : true });
    L.hit.sound = { x: Math.round(Math.min(LW - 44, sx - 20)), y: Math.round(Math.min(LH - 44, ly - 22)), w: 44, h: 44 };
  }
  ctx.textBaseline = 'alphabetic';
}

// The stick under the finger: a ring where the touch began, a knob where it is.
function drawStick() {
  if (!joy || cardOpen()) return;
  const dx = joy.x - joy.ox, dy = joy.y - joy.oy;
  ctx.save();
  ctx.beginPath(); ctx.arc(joy.ox, joy.oy, JR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10,16,28,0.45)'; ctx.fill();
  ctx.lineWidth = UI.PILL.borderW; ctx.strokeStyle = TOK.tint40; ctx.stroke();
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
  ctx.beginPath(); ctx.arc(joy.ox + dx, joy.oy + dy, 20, 0, Math.PI * 2);
  ctx.fillStyle = TOK.ink92; ctx.fill();
  ctx.restore();
}

/* Where the marble is on the screen, and how big: the ghost stick is placed
   against it rather than at a fixed spot, which covered the marble on a short
   phone. */
const _sp = new Vector3();
function marbleOnScreen() {
  _sp.copy(ball.p).project(camera);
  const d = camera.position.distanceTo(ball.p);
  const r = R / (d * Math.tan(camera.fov * Math.PI / 360)) * (LH / 2);
  return { x: (_sp.x + 1) / 2 * LW, y: (1 - _sp.y) / 2 * LH, r };
}
// A backing under HUD type drawn over the world, which may be pale stone.
function backedText(t, cx, cy) {
  const w = ctx.measureText(t).width + 24, h = 30;
  UI.roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fillStyle = 'rgba(10,16,28,0.62)'; ctx.fill();
  ctx.fillStyle = TOK.ink92; ctx.fillText(t, cx, cy + 1);
}

/* The verb, shown at rest (DESIGN-SYSTEM 10.1): the stick drawn below the
   marble, or beside it when there is no room below, and a fingertip pushing it
   forward on a loop. It stops at the first input and does not come back in
   this visit. */
function drawGhost(now) {
  if (everMoved || levelNo !== 1 || state !== 'play') return;
  const m = marbleOnScreen(), pad = MODE === 'mobile' ? PHONE_PAD : SIDE_PAD;
  const maxY = LH - botBand() - JR - 44;          // leaves room for the caption
  let cx = m.x, cy = m.y + m.r + 16 + (JR - 8) + 20;
  if (cy > maxY) {
    cy = Math.min(maxY, m.y + 12);
    cx = m.x + m.r + JR + 28;
    if (cx > LW - pad - JR) cx = m.x - m.r - JR - 28;
  }
  cx = clamp(cx, pad + JR, LW - pad - JR);
  const ph = (now % 1900) / 1900;
  const push = ph < 0.15 ? 0 : ph < 0.55 ? ease((ph - 0.15) / 0.4) : ph < 0.8 ? 1 : 1 - ease((ph - 0.8) / 0.2);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, JR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10,16,28,0.45)'; ctx.fill();
  ctx.lineWidth = UI.PILL.borderW; ctx.strokeStyle = TOK.tint40; ctx.stroke();
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
  ctx.beginPath(); ctx.arc(cx, cy - push * (JR - 8), 20, 0, Math.PI * 2);
  ctx.fillStyle = TOK.ink92; ctx.fill();
  ctx.restore();
  ctx.font = '600 16px Inter, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const cap = MODE === 'mobile' ? ['Drag to roll'] : ['Drag to roll, or use the arrow keys', 'Drag to roll'];
  let t = cap[cap.length - 1];
  for (const c of cap) if (ctx.measureText(c).width + 24 <= LW - 2 * pad) { t = c; break; }
  const w = ctx.measureText(t).width + 24;
  backedText(t, clamp(cx, pad + w / 2, LW - pad - w / 2), cy + JR + 26);
  L.ghost = { x: cx - JR, y: cy - JR, w: JR * 2, h: JR * 2, marble: m };
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

/* A new thing gets one line the first time it comes: at the start of the level
   that opens its district, until the marble has rolled on a way. */
const NEWS = {
  3: 'Bollards stand across the road. Steer through the gap in each row',
  5: 'Flying cars cross the road. Wait at the line for the green light',
  6: 'The road ahead is dark. Follow the lamps to its switch, roll over it, and come back',
  8: 'Road works! Snake round the barriers, from one gap to the next',
  7: 'The road splits. The narrow way is quicker; the wide way is safer',
  9: 'Some pads move. Wait for one to line up with the path, then roll on',
  11: 'A wormhole! Roll in to cross the crystal canyon, and come out on the far side',
  12: 'Cargo crates on the road. Find the way through each row',
  13: 'The sky train stops here. Roll onto its roof, and hold on when it moves',
  15: 'Maglev strips pull the marble to one side. Steer against the arrows',
  17: 'Bridges switch off and on. Cross while they are lit',
  19: 'The roundabout turns. Ride it round, and roll off where the road leads on',
  21: 'A wall lets through only its own colour. Take the lane that matches it',
  23: 'Wind blows between the towers. When the streaks come, lean into them',
  25: 'Yellow arrows speed you up. Yellow rings throw you over a gap',
  27: 'A loop! Hit the yellow arrows first, and it carries you round',
  29: 'A glass tube! Roll into it, and it carries you over the city',
  31: 'A scanner sweeps the road. Roll down one side just after the red bar has left it',
  33: 'The Express: everything at once, on the longest courses',
  41: 'The Skyline, the city at its hardest: everything at once, closer together and quicker',
  51: 'Tokyo! Everything you know in its own form, and harder than anything in the neon city',
};
// The same notes where a world has dressed its pieces in its own look (the dystopian city: tokyoPieces).
const NEWS_TOKYO = {
  3: 'Lanterns stand across the road. Steer through the gap in each row',
  5: 'Trams cross the road. Wait at the line while the red lights flash',
  6: 'The road ahead is dark. Follow the lanterns to the switch, roll over it, and come back',
  8: 'Road works! Snake round the barricades, from one gap to the next',
  11: 'A torii gate! Roll through to cross the crystal canyon, and come out on the far side',
  12: 'Wooden crates on the road. Find the way through each row',
  13: 'The train stops here. Roll onto its roof, and hold on when it moves',
  15: 'Moving walkways carry the marble to one side. Steer against the arrows',
  17: 'Paper bridges light up and go dark. Cross while they are lit',
  19: 'The stage turns. Ride it round, and roll off where the road leads on',
  21: 'A paper screen lets through only its own colour. Take the lane whose curtain matches it',
  23: 'Wind blows between the towers. When the carp streamers fly out, lean into it',
  29: 'A paper lantern! Roll into it, and it carries you over the city',
  31: 'A gold screen slides across the road. Roll down one side just after it has passed',
};
const POCKET_NEWS = { crystal: 'The crystal canyon: the road is slippery. Brake early' };
const POCKET_NEWS_AT = {                                 // where each canyon obstacle first appears
  11: 'The crystal canyon: slippery, and crystals grow on the road. Line up early',
  13: 'Fire jets! Wait for the flames to die, then go',
  20: 'Fireballs roll across. Wait at the line for the green light',
  22: 'Crystal bridges crack under you. Keep rolling, never stop on them',
};
// A square's own note, for its first few seconds on screen.
const PLAZA_NEWS = {
  K1: 'The way out is locked. Its key is somewhere in the square',
  K2: 'One gold key, two gold gates. A gate keeps its key: pick the room you need',
  K3: 'Three gold gates, and only two gold keys. Look before you open one',
  K4: 'Count the copper gates, and the copper keys, before you open any',
  S1: 'A switch flips every gate with its letter: shut ones open, open ones shut. Both switches here are A',
  S2: 'Which gates does each switch flip? You may need one twice',
  S3: 'Three switches, three rooms. Work out the order before you roll',
  S4: 'The same switches, and a door that shuts on you. Mind the order',
  W1: 'A plate holds its gate open while something heavy sits on it. Push the crate onto it',
  W2: 'A crate only goes where you push it. Get behind it first',
  W3: 'Two crates, two plates. Which crate goes where, and which first?',
  B1: 'A lever turns the road over the gap a quarter turn. Line it up, then cross',
  B2: 'No straight way over. Turn the bridges until they make a path',
  B3: 'One lever turns both bridges. The key is over one, the way out over the other',
  B4: 'The crossing turns with the lever. Key first, and mind which way you are cut off',
  C1: 'Lightning gates let only a charged marble through. Find the charger',
  C2: 'Like charges push apart: a charged marble cannot roll onto a charged floor',
  C3: 'Charge to reach the key; no charge to reach the way out. Where can you ground?',
  C4: 'Two keys, one charge. Do not ground yourself where you cannot charge again',
  L1: 'Roll under a mirror to turn it. Light the crystal, and the gate of light opens',
  L2: 'Three mirrors. Trace the beam before you turn any',
  L3: 'Every time you roll under a mirror, it turns. Even on the way out',
  L4: 'The key is behind the light. The gate opens only while the crystal is lit',
  F2: 'The crate can hold the key room open. Then it is in your way',
  F1: 'A switch, a mirror and a key. Which first?',
  I1: 'Ice: the marble slides until something stops it. A rock stops it a cell short',
  I2: 'Snow stops the marble on it. Where can you stop?',
  I3: 'Slide over a hole and you drop. Plan around them',
  I4: 'Plan the whole way out before the first push',
  P1: 'A crate pushed into a gap fills it. Then you can roll across',
  P2: 'Two rows of gaps: push one crate over a filled gap into the next',
  P3: 'Four crates. Which goes where, and in what order?',
  T1: 'Light every tile and a bridge appears. Each tile crumbles once you leave it',
  T2: 'Only one way covers them all. Where must it end?',
  T3: 'Holes and a wall. Plan the whole route first',
  M1: 'Listen to the drums, then roll over them in the same order',
  M2: 'Five notes this time. The pad by the road in plays it again',
  M3: 'Seven notes, and the drums stand in rows: go round, not over',
  D1: 'Your twin moves the mirror way. A wall stops one of you, not both',
  D2: 'Get out of step with your twin, then back in',
  D3: 'Walk it through in your head before the first push',
};
const PLAZA_NOTE_T = 7;
function drawNews() {
  let t = pocket ? (POCKET_NEWS_AT[levelNo] || POCKET_NEWS[level.world]) : level.test ? TRY_NEWS[level.test] : (world.news && world.news[levelNo]) || NEWS[levelNo], alpha = 1;
  const Pz = !pocket && plazaAt && plazaView > 0.6 ? plazaAt : null, note = Pz && PLAZA_NEWS[Pz.pc.id.replace('~', '')];
  if (note && Pz.noteT < PLAZA_NOTE_T) { t = note; alpha = Math.min(1, (PLAZA_NOTE_T - Pz.noteT) / 0.6, Pz.noteT / 0.3); }
  else if (ball.p.z < -12) return;
  if (!t || state !== 'play') return;
  ctx.globalAlpha = alpha;
  const pad = MODE === 'mobile' ? PHONE_PAD : SIDE_PAD;
  const lines = wrapText(t, LW - 2 * pad - 36, 16);
  ctx.font = '600 16px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 28, h = lines.length * 22 + 14;
  const cy = topBand() + 22 + h / 2;
  UI.roundRectPath(ctx, LW / 2 - w / 2, cy - h / 2, w, h, 15);
  ctx.fillStyle = 'rgba(10,16,28,0.72)'; ctx.fill();
  ctx.fillStyle = TOK.ink92;
  lines.forEach((l, i) => ctx.fillText(l, LW / 2, cy + (i - (lines.length - 1) / 2) * 22 + 1));
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
  L.news = { x: LW / 2 - w / 2, y: cy - h / 2, w, h, lines };
}

// ---------- CARDS (DESIGN-SYSTEM 5, drawn as Comb draws them) ----------
const RULES = [
  'Drag anywhere to roll the marble. The further you drag, the harder it rolls. On a computer the arrow keys work too.',
  'Roll through the orange ring at the end of the course to finish the level.',
  'Blue rings save your place. Roll through one and it turns green.',
  'From level 2 the finish stands past a puzzle square, and its way out is shut. As you roll up to the square the camera rises to show all of it: look before you move.',
  'Keys: roll over a key to take it. You carry one at a time, so taking another leaves the one you held in its place. A gate opens for the key of its colour and shape, and keeps it: count your keys before you open a gate.',
  'Switches: roll over a switch to flip every gate with its letter. Shut gates open and open gates shut, so a switch can shut the way you came. You can press a switch again.',
  'Crates and plates: a plate holds its gates open while something heavy is on it. Roll into a crate to push it one cell. A crate cannot be pulled, and never goes through a gate, so push it with care.',
  'Turning bridges: a lever turns every bridge with its letter a quarter turn clockwise. Roll over the lever again to turn them again. A bridge is open only where its lit road meets the side; railings close the rest.',
  'Charge: a charger (a bolt) charges the marble and a ground pad empties it. Lightning gates let only a charged marble through. Charged floors (plus signs) push a charged marble away, the way like charges do.',
  'Light: a lamp shines a beam across the square, over the walls. Roll under a mirror to turn it a quarter turn, and the beam goes another way. A gate of light is open only while the beam reaches the crystal.',
  'Stuck in a square? Roll over the reset pad beside the road into it, and the square goes back as it was.',
  'Each level has a star time, shown by the star at the bottom. Finish under it to win the level\'s star.',
  'Where the road splits, the narrow way is quicker and the wide way is safer. Both lead on.',
  'Roll off the edge and the marble flies back to the last green ring. The fall is counted, and nothing else is lost.',
  'Bollards, road barriers and cargo crates are solid. Steer through the gaps: a hard knock near the edge can throw the marble off the road.',
  'A dark road cannot be crossed. Follow the line of lamps down the side road to its switch and roll over it: the road lights up.',
  'Flying cars cross some roads. Wait at the line for the green light, then roll across.',
  'Some pads move. Wait for one to line up with the path, roll on, and ride it across.',
  'A wormhole takes the marble to the crystal canyon, where the road is slippery. Cross it to come out on the far side.',
  'In the canyon: crystals grow on the road (steer through the gaps), fire jets flare in a rhythm (wait for the flames to die), fireballs roll across (wait for the green light), and crystal bridges crack under you (keep rolling).',
  'The sky train stops at stations. Roll onto its roof, hold on as it pulls away, and roll off at the next station.',
  'Maglev strips pull the marble toward the edge their arrows point to. Steer the other way to stay on.',
  'A roundabout turns and carries the marble round with it. Roll off onto the road that leads on; the others stop short at a red bar.',
  'Gusts blow out of the gaps between towers. Streaks of light come just before each gust: lean into it, or wait for it to pass.',
  'See-through bridges switch off and on. Cross while they are lit. They flicker just before they go dark.',
  'Yellow arrows speed the marble up. Yellow rings throw it into the air, over the gap ahead.',
  'A loop carries the marble round if it comes in fast. Roll over the yellow arrows before it.',
  'A glass tube carries the marble over the city to the road ahead. Just roll into it.',
  'A red scanner bar sweeps across some roads, and touching it sends the marble back to the last ring. Roll down one side just after the bar has left it. Where two bars sweep, go down the middle just after they cross.',
  'Lime and violet walls let through only a marble of their own colour. Roll through a curtain of that colour first: it colours the marble.',
];
// The same rules where a world has dressed its pieces in its own look (the dystopian city: tokyoPieces), keyed by how each begins.
const RULES_TOKYO = new Map(Object.entries({
  'Bollards, road barriers': 'Lanterns, road-works barricades and wooden crates are solid. Steer through the gaps: a hard knock near the edge can throw the marble off the road.',
  'A dark road': 'A dark road cannot be crossed. Follow the line of lanterns down the side road to its switch and roll over it: the road lights up.',
  'Flying cars': 'Little trams cross some roads. While one is coming the red lights flash and the arms come down: wait at the line, and roll across when they go up.',
  'A wormhole': 'A torii gate takes the marble to the crystal canyon, where the road is slippery. Cross it to come out on the far side.',
  'The sky train': 'The train stops at stations. Roll onto its roof, hold on as it pulls away, and roll off at the next station.',
  'Maglev strips': 'Moving walkways carry the marble toward the edge their arrows point to. Steer the other way to stay on.',
  'A roundabout turns': 'A revolving stage turns and carries the marble round with it. Roll off onto the road that leads on; the others stop short at a red bar.',
  'Gusts blow': 'Gusts blow out of the gaps between towers. Just before each one the carp streamers fly out and streaks of air come: lean into it, or wait for it to pass.',
  'See-through bridges': 'Paper bridges light up and go dark. Cross while they are lit. They flicker just before they go dark.',
  'A glass tube': 'A long paper lantern carries the marble over the city to the road ahead. Just roll into it.',
  'A red scanner bar': 'A gold folding screen slides across some roads, and touching it sends the marble back to the last ring. Roll down one side just after it has passed. Where two screens slide, go down the middle just after they cross.',
  'Lime and violet walls': 'Lime and violet paper screens let through only a marble of their own colour. Roll through a curtain of that colour first: it colours the marble.',
}).map(([k, v]) => [RULES.find((q) => q.startsWith(k)), v]));
function wrapText(text, maxW, size) {
  ctx.font = '500 ' + size + 'px Inter, sans-serif';
  const out = []; let line = '';
  for (const w of text.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
function cardLayout(kind) {
  const pw = Math.min(LW - 56, 470), ph = Math.min(LH - 20, 420);
  const px = Math.round((LW - pw) / 2), py = Math.max(10, Math.round((LH - ph) / 2));
  const HEADER = 154, FOOTER = 98, viewTop = py + HEADER, viewH = Math.max(40, ph - HEADER - FOOTER);
  const items = [];
  if (kind === 'rules') {
    for (const r of RULES) { const lines = wrapText((world.rules && world.rules.get(r)) || r, pw - 100, 16); items.push({ t: 'rule', lines, h: lines.length * 22 + 13 }); }
  } else items.push({ t: 'won', h: 158 });
  let contentH = 0; for (const it of items) contentH += it.h;
  contentH = Math.max(0, contentH - 13);
  const last = levelNo >= LEVELS.length;
  return {
    kind, px, py, pw, ph, HEADER, FOOTER, viewTop, viewH, items, contentH,
    scrollMax: Math.max(0, contentH - viewH),
    ctaCy: py + ph - FOOTER + 16 + UI.CTA.h / 2,
    title: kind === 'rules' ? 'MARBLE' : 'CLEARED',
    cta: kind === 'rules' ? 'PLAY' : last ? 'PLAY AGAIN' : 'NEXT',
    subtitle: kind === 'rules' ? 'Roll the marble along the course and through the orange ring.'
      : last ? 'That was the last of the forty courses.'
      : falls === 0 ? 'The whole course without a single fall.'
      : 'Home, with ' + falls + (falls === 1 ? ' fall' : ' falls') + ' on the way.',
  };
}
function fadeEdge(c, top) {
  const y = top ? c.viewTop : c.viewTop + c.viewH - 20;
  const g = ctx.createLinearGradient(0, y, 0, y + 20);
  g.addColorStop(top ? 0 : 1, TOK.bgCard);
  g.addColorStop(top ? 1 : 0, 'rgba(19,31,54,0)');
  ctx.fillStyle = g; ctx.fillRect(c.px + 1, y, c.pw - 2, 20);
}
function drawCard(kind) {
  const c = cardLayout(kind);
  cardScroll = Math.max(0, Math.min(cardScroll, c.scrollMax));
  L.cardBody = { x: c.px, y: c.viewTop, w: c.pw, h: c.viewH, max: c.scrollMax };
  ctx.save();
  ctx.fillStyle = kind === 'win' ? TOK.scrimWin : TOK.scrim;
  ctx.fillRect(0, 0, LW, LH);
  UI.roundRectPath(ctx, c.px, c.py, c.pw, c.ph, 22);
  ctx.fillStyle = TOK.bgCard; ctx.fill();
  ctx.strokeStyle = TOK.tint12; ctx.lineWidth = 1;
  UI.roundRectPath(ctx, c.px + 0.5, c.py + 0.5, c.pw - 1, c.ph - 1, 22); ctx.stroke();

  ctx.fillStyle = TOK.text; ctx.font = '800 40px Inter, sans-serif'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(c.title, c.px + 34, c.py + 34 + 34);
  ctx.fillStyle = TOK.ink82;
  const sub = wrapText(c.subtitle, c.pw - 68, 17).slice(0, 2);
  ctx.font = '600 17px Inter, sans-serif';
  for (let i = 0; i < sub.length; i++) ctx.fillText(sub[i], c.px + 34, c.py + 34 + 54 + 17 + i * 24);

  ctx.save();
  ctx.beginPath(); ctx.rect(c.px, c.viewTop, c.pw, c.viewH); ctx.clip();
  let yy = c.viewTop - cardScroll, n = 0;
  for (const it of c.items) {
    if (it.t === 'won') {
      const mid = c.px + c.pw / 2, best = save.best[levelNo];
      ctx.textAlign = 'center';
      ctx.fillStyle = TOK.ink90; ctx.font = '500 16px Inter, sans-serif';
      ctx.fillText(level.test ? level.title : 'Level ' + levelNo + ' of ' + LEVELS.length, mid, yy + 22);
      ctx.fillStyle = TOK.text; ctx.font = '800 34px Inter, sans-serif';
      ctx.fillText(fmt(clock), mid, yy + 64);
      ctx.fillStyle = TOK.ink82; ctx.font = '600 16px Inter, sans-serif';
      ctx.fillText(lastWasBest ? 'Your best time' : 'Best ' + fmt(best || clock), mid, yy + 92);
      // The star: this run's, or the one already won, or the time to beat for it.
      const st = starTime(), have = !level.test && !!save.stars[levelNo];
      const line = lastStar ? 'Star earned: under ' + fmt(st) : have ? 'Your star, for under ' + fmt(st) : 'Beat ' + fmt(st) + ' for the star';
      ctx.font = '600 17px Inter, sans-serif';
      const lw = ctx.measureText(line).width, sx = mid - (lw + 24) / 2;
      drawStarIcon(sx + 9, yy + 125, 10, lastStar || have, lastStar || have ? TOK.accent2 : TOK.tint40);
      ctx.fillStyle = lastStar ? TOK.text : TOK.ink82; ctx.textAlign = 'left';
      ctx.fillText(line, sx + 24, yy + 131);
      ctx.textAlign = 'center'; ctx.fillStyle = TOK.ink72; ctx.font = '500 16px Inter, sans-serif';
      ctx.fillText(starCount() + ' of ' + LEVELS.length + ' stars', mid, yy + 154);
      ctx.textAlign = 'left';
    } else {
      n++;
      ctx.beginPath(); ctx.arc(c.px + 43, yy + 11, 12, 0, Math.PI * 2);
      ctx.fillStyle = TOK.accentText; ctx.fill();
      ctx.fillStyle = TOK.bg; ctx.font = '800 14px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(n), c.px + 43, yy + 12);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = TOK.ink90; ctx.font = '500 16px Inter, sans-serif';
      for (let i = 0; i < it.lines.length; i++) ctx.fillText(it.lines[i], c.px + 66, yy + 17 + i * 22);
    }
    yy += it.h;
  }
  ctx.restore();
  if (cardScroll > 1) fadeEdge(c, true);
  if (cardScroll < c.scrollMax - 1) fadeEdge(c, false);
  L.hit.cta = UI.drawCTA(ctx, c.cta, c.px + c.pw / 2, c.ctaCy, TOK.accent);
  ctx.restore();
  return c;
}

function drawNoWorld() {
  ctx.fillStyle = TOK.ink90; ctx.font = '600 17px Inter, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = wrapText('This game needs 3D graphics, and this browser has them switched off.', LW - 64, 17);
  ctx.font = '600 17px Inter, sans-serif';
  lines.forEach((l, i) => ctx.fillText(l, LW / 2, LH / 2 + (i - (lines.length - 1) / 2) * 26));
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

// The jump between worlds, on the screen: light swelling out of the marble,
// rings rushing past, then clearing on the other world.
function drawWarp() {
  if (state !== 'warp') return;
  const k = stateT < WARP_IN ? ease(stateT / WARP_IN) : 1 - ease(Math.min(1, (stateT - WARP_IN) / WARP_OUT));
  const m = marbleOnScreen(), diag = Math.hypot(LW, LH);
  const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, diag * (0.2 + 1.1 * k));
  g.addColorStop(0, `rgba(255,255,255,${k})`); g.addColorStop(0.3, `rgba(200,175,255,${0.97 * k})`);
  g.addColorStop(0.65, `rgba(110,215,255,${0.9 * k})`); g.addColorStop(1, `rgba(24,12,60,${0.85 * k})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
  if (REDUCED) return;
  ctx.save();
  for (let i = 0; i < 7; i++) {
    const p = (stateT * 2.4 + i / 7) % 1;
    ctx.beginPath(); ctx.arc(m.x, m.y, p * diag * 0.85, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.55 * k * (1 - p)})`; ctx.lineWidth = 2 + 12 * p; ctx.stroke();
  }
  ctx.restore();
}

function drawHUD(now) {
  const s = hud.width / LW;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, LW, LH);
  L.hit = {};
  if (!renderer) { drawNoWorld(); return; }
  drawScrims();
  L.ghost = null; L.news = null;
  drawGhost(now);
  drawNews();
  drawStick();
  drawControls();
  drawReadout();
  L.cardBody = null;
  drawWarp();
  if (state === 'rules') drawCard('rules');
  else if (state === 'win') drawCard('win');
}

// ---------- WORLDS (mock-ups for the owner, 2026-09-26) ----------
/* The owner asked what could replace the dark void, and picked four worlds to
   see as frames: sunny hills with a sea and waterfalls (in the spirit of the
   Sonic games, without Sega's own checkered earth or totems), a giant child's
   desk, a sunlit lagoon under water, and space made spectacular. Only the
   harness switches them; the game plays the void until one is chosen. Each
   world sets the sky, fog and light, adds its scenery, and may restyle the
   course (the desk turns the stone into books, rulers and an eraser). */
const WORLDS = {};
const WORLDS_ADD = (name, build) => { WORLDS[name] = build; };
const DEFAULT_WORLD = { fog: [0x131F36, 24, 58], hemi: [0xDDE8FF, 0x1A2A45, 1.15], sun: [0xFFF3E2, 2.6] };
let world = { name: 'void', group: null, tick: null, restyle: null };

function gradientTex(stops) {
  return canvasTex(4, 512, (g) => {
    const lg = g.createLinearGradient(0, 0, 0, 512);
    for (const [t, c] of stops) lg.addColorStop(t, c);
    g.fillStyle = lg; g.fillRect(0, 0, 4, 512);
  });
}
// A painted backdrop is fitted to the frame the way CSS "cover" fits a picture.
function fitBackground() {
  const t = scene.background;
  if (!t || !t.userData || !t.userData.cover) return;
  const a = cssW / cssH;
  if (a < 1) { t.repeat.set(a, 1); t.offset.set((1 - a) / 2, 0); }
  else { t.repeat.set(1, 1 / a); t.offset.set(0, (1 - 1 / a) / 2); }
}
function coverTex(size, draw) { const t = canvasTex(size, size, draw); t.userData.cover = true; return t; }

// Top-face UVs, per mesh: world-scale tiles for stone, 0..1 across a piece for the desk's printed tops.
function setTopUV(mesh, perPiece) {
  const g = mesh.geometry, pos = g.attributes.position, uv = g.attributes.uv, top = topGroup(g);
  const hx = g.parameters.width / 2, hz = g.parameters.depth / 2;
  for (let i = top.start; i < top.start + top.count; i++) {
    if (perPiece) uv.setXY(i, (pos.getX(i) / hx + 1) / 2, (pos.getZ(i) / hz + 1) / 2);
    else uv.setXY(i, pos.getX(i) / 2, pos.getZ(i) / 2);
  }
  uv.needsUpdate = true;
}
function restoreCourse() {
  tkUndoAll();                                          // whatever a world dressed the pieces in (the dystopian city: tokyoPieces)
  const NM = neonMats.glowgrid || (neonMats.glowgrid = neonMaterials('glowgrid'));
  for (const L of loopsIn) loopLook(L, NM.top, NM.side, 0xFF8AE8);
  for (const c of colliders) {
    if (c.obstacle) continue;
    c.mesh.castShadow = true;                             // (the city turns this off again: see neonCourse)
    if (c.deco) { for (const d of c.deco) c.mesh.remove(d); c.deco = []; }
    c.mesh.material = faceMats(c.ferry ? ferryStone : stone); setTopUV(c.mesh, false);
    if (c.holo) holoFaces(c);
  }
}
/* A world is rebuilt for every course, so the one it replaces is let go: its
   shapes, its materials and the textures it drew. Shared light maps stay. */
function disposeWorld(grp) {
  const seen = new Set();
  grp.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    for (const m of [].concat(o.material || [])) {
      if (seen.has(m) || m.userData.keep) continue;       // a world's kit kept from course to course (the dystopian city's walls and signs)
      seen.add(m);
      for (const t of [m.map, m.emissiveMap, m.normalMap]) if (t && t.isCanvasTexture && t !== dot) t.dispose();
      m.dispose();
    }
  });
}

function setWorld(name) {
  if (world.group) { scene.remove(world.group); disposeWorld(world.group); }
  if (scene.background && scene.background.isCanvasTexture) scene.background.dispose();
  scene.background = null;
  const [fc, fn, ff] = DEFAULT_WORLD.fog;
  scene.fog.color.setHex(fc); scene.fog.near = fn; scene.fog.far = ff;
  hemi.color.setHex(DEFAULT_WORLD.hemi[0]); hemi.groundColor.setHex(DEFAULT_WORLD.hemi[1]); hemi.intensity = DEFAULT_WORLD.hemi[2];
  sun.color.setHex(DEFAULT_WORLD.sun[0]); sun.intensity = DEFAULT_WORLD.sun[1];
  restoreCourse();
  world = { name: 'void', group: null, tick: null, restyle: null, marble: null, rings: null };
  setMarbleSkin('glass');
  tintRings(0xFFFFFF, 0xFFD23F);
  const build = WORLDS[name];
  if (build) {
    world = { name, group: new Group(), tick: null, restyle: null, marble: null, rings: null };
    build(world);
    scene.add(world.group);
    if (world.restyle) world.restyle();
    for (const c of holos) holoFaces(c);                 // a hologram is a hologram in every world
    if (world.marble) setMarbleSkin(world.marble);
    if (world.rings) tintRings(world.rings[0], world.rings[1]);
  }
  fitBackground();
  return world.name;
}

// ---- 1. Sunny hills: a bright sky, a sparkling sea far below, islands with palms and a waterfall ----
function cloudTex() {
  return canvasTex(256, 128, (g) => {
    const r = seeded(11);
    for (let i = 0; i < 9; i++) {
      const x = 50 + r() * 156, y = 70 - Math.sin((x - 50) / 156 * Math.PI) * 26 + r() * 10, rad = 22 + r() * 22;
      const rg = g.createRadialGradient(x - rad * 0.3, y - rad * 0.4, rad * 0.2, x, y, rad);
      rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.7, 'rgba(244,249,255,0.95)'); rg.addColorStop(1, 'rgba(214,229,245,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
  });
}
function palm(x, y, z, h, lean) {
  const tree = new Group();
  const bark = new MeshStandardMaterial({ color: 0xB9854F, roughness: 0.9 });
  const frond = new MeshStandardMaterial({ color: 0x3CAB4C, roughness: 0.7, side: DoubleSide });
  let px = 0, py = 0;
  for (let i = 0; i < 5; i++) {                       // a trunk that curves as it rises
    const seg = new Mesh(new CylinderGeometry(0.22 - i * 0.02, 0.26 - i * 0.02, h / 5, 8), bark);
    seg.position.set(px, py + h / 10, 0); seg.rotation.z = -lean * (i + 1) * 0.12;
    tree.add(seg); px += Math.sin(lean * (i + 1) * 0.12) * h / 5; py += h / 5;
  }
  for (let i = 0; i < 7; i++) {                       // fronds drooping outward
    const f = new Mesh(new ConeGeometry(0.55, 3.4, 4, 1), frond);
    f.scale.set(1, 1, 0.12);
    const a = i / 7 * Math.PI * 2;
    f.position.set(px + Math.cos(a) * 1.3, py - 0.2, Math.sin(a) * 1.3);
    f.lookAt(px + Math.cos(a) * 4, py - 1.6, Math.sin(a) * 4); f.rotateX(Math.PI / 2);
    tree.add(f);
  }
  tree.position.set(x, y, z);
  return tree;
}
function isle(x, y, z, r, seed) {
  const g = new Group(), rr = seeded(seed);
  const grass = new Mesh(new SphereGeometry(r, 28, 12), new MeshStandardMaterial({ color: 0x5FC25C, roughness: 0.85 }));
  grass.scale.set(1, 0.26, 1); grass.position.y = 0.2; g.add(grass);
  const earth = new Mesh(new ConeGeometry(r * 0.97, r * 1.5, 24, 1), new MeshStandardMaterial({ color: 0xECB57E, roughness: 0.95 }));
  earth.rotation.x = Math.PI; earth.position.y = -r * 0.75; g.add(earth);
  const rock = new Mesh(new ConeGeometry(r * 0.6, r * 1.1, 18, 1), new MeshStandardMaterial({ color: 0xC0824F, roughness: 1 }));
  rock.rotation.x = Math.PI; rock.position.y = -r * 1.35; g.add(rock);
  const n = Math.max(1, Math.round(r / 3));
  for (let i = 0; i < n; i++) {
    const a = rr() * Math.PI * 2, d = rr() * r * 0.5;
    g.add(palm(Math.cos(a) * d, 0.3, Math.sin(a) * d, 3.5 + rr() * 2.5, (rr() - 0.5) * 2));
  }
  g.position.set(x, y, z);
  return g;
}
WORLDS_ADD('hills', (w) => {
  scene.background = gradientTex([[0, '#1A5FC8'], [0.42, '#3E93E6'], [0.74, '#9CD4FF'], [1, '#DDF2FF']]);
  scene.fog.color.setHex(0xBFE3FF); scene.fog.near = 50; scene.fog.far = 300;
  hemi.color.setHex(0xD4EBFF); hemi.groundColor.setHex(0xB9D6EE); hemi.intensity = 1.9;
  sun.color.setHex(0xFFF6E2); sun.intensity = 3.1;
  const G = w.group, r = seeded(5);
  const sea = canvasTex(256, 256, (g) => {
    g.fillStyle = '#2F8BD8'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 14; i++) {                  // broad swells of lighter and darker water
      const sx = r() * 256, sy = r() * 256;
      const rg = g.createRadialGradient(sx, sy, 0, sx, sy, 40 + r() * 60);
      rg.addColorStop(0, r() > 0.5 ? 'rgba(90,170,235,0.35)' : 'rgba(20,90,170,0.3)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
    }
    for (let i = 0; i < 40; i++) {                  // a few small glints
      g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.35})`;
      g.fillRect(r() * 256, r() * 256, 2 + r() * 5, 1);
    }
  }, true);
  sea.repeat.set(40, 40);
  const water = new Mesh(new CircleGeometry(520, 64), new MeshStandardMaterial({ map: sea, roughness: 0.35 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, -34, -150); G.add(water);
  // Far hills on the horizon, fading into haze.
  for (let i = 0; i < 9; i++) {
    const h = new Mesh(new SphereGeometry(40 + r() * 40, 32, 16),
      new MeshStandardMaterial({ color: [0x4FB35A, 0x43A553, 0x5DBE63][i % 3], roughness: 0.9 }));
    h.scale.y = 0.45; h.position.set(-200 + i * 50 + r() * 20, -46, -270 - r() * 30); G.add(h);
  }
  // Islands with palms, one with a waterfall.
  const isles = [[-26, -10, -40, 7, 1], [32, -14, -60, 9, 2], [-40, -20, -88, 11, 3], [14, -24, -118, 12, 4], [46, -8, -30, 5, 5]];
  for (const [x, y, z, rad, s] of isles) G.add(isle(x, y, z, rad, s));
  const fall = canvasTex(64, 256, (g) => {
    const lg = g.createLinearGradient(0, 0, 0, 256);
    lg.addColorStop(0, 'rgba(255,255,255,0.95)'); lg.addColorStop(0.7, 'rgba(200,236,255,0.8)'); lg.addColorStop(1, 'rgba(200,236,255,0)');
    g.fillStyle = lg; g.fillRect(8, 0, 48, 256);
    g.fillStyle = 'rgba(160,210,245,0.5)';
    for (let x = 12; x < 56; x += 7) g.fillRect(x, 0, 2, 256);
  });
  const wf = new Mesh(new PlaneGeometry(3.2, 22), new MeshBasicMaterial({ map: fall, transparent: true, depthWrite: false }));
  wf.position.set(30, -25, -50.6); G.add(wf);
  // Clouds, some high and far, some drifting below the course.
  const ct = cloudTex();
  const clouds = [[-30, 16, -90, 26], [18, 22, -130, 34], [60, 12, -100, 24], [-70, 26, -160, 40], [-16, -16, -30, 16], [26, -22, -18, 18], [-44, -4, -60, 20], [85, 30, -190, 44]];
  for (const [x, y, z, s] of clouds) {
    const sp = new Sprite(new SpriteMaterial({ map: ct, transparent: true, depthWrite: false }));
    sp.scale.set(s, s / 2, 1); sp.position.set(x, y, z); G.add(sp);
  }
});

// ---- 2. A giant child's desk: books, rulers and an eraser, a sunny window, the room out of focus ----
function rulerTex(len, cm) {
  return canvasTex(128, 1024, (g) => {
    g.fillStyle = '#EDCF93'; g.fillRect(0, 0, 128, 1024);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(160,110,50,${0.05 + (i % 3) * 0.02})`; g.fillRect(0, i * 17 + 3, 128, 2); }
    const n = Math.round(len * cm);
    g.fillStyle = '#3A2A18'; g.font = '600 18px Inter, sans-serif'; g.textAlign = 'center';
    for (let i = 0; i <= n * 10; i++) {
      const y = 1024 - i / (n * 10) * 1024, long = i % 10 === 0, mid = i % 5 === 0;
      const t = long ? 30 : mid ? 20 : 12;
      g.fillRect(0, y - 1, t, 2); g.fillRect(128 - t, y - 1, t, 2);
      if (long && i > 0 && i < n * 10) g.fillText(String(i / 10), 64, y + 6);
    }
  });
}
function paperTex() {
  return canvasTex(512, 512, (g) => {
    g.fillStyle = '#FBF7EC'; g.fillRect(0, 0, 512, 512);
    g.fillStyle = 'rgba(80,130,210,0.55)'; for (let y = 40; y < 512; y += 28) g.fillRect(0, y, 512, 2);
    g.fillStyle = 'rgba(220,70,70,0.6)'; g.fillRect(70, 0, 3, 512);
  });
}
function coverTexBook(col, band) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = col; g.fillRect(0, 0, 256, 256);
    g.fillStyle = band; g.fillRect(28, 60, 200, 40); g.fillRect(28, 112, 150, 12);
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 3; g.strokeRect(14, 14, 228, 228);
  });
}
function book(w, h, d, col) {
  const pages = new MeshStandardMaterial({ color: 0xF3EBD9, roughness: 0.95 });
  const cover = new MeshStandardMaterial({ color: col, roughness: 0.75 });
  return new Mesh(new BoxGeometry(w, h, d), [pages, cover, cover, cover, pages, pages]);
}
WORLDS_ADD('desk', (w) => {
  scene.background = coverTex(512, (g) => {
    const lg = g.createLinearGradient(0, 0, 0, 512);
    lg.addColorStop(0, '#C9AE8C'); lg.addColorStop(0.6, '#DCC6A6'); lg.addColorStop(1, '#E7D6BC');
    g.fillStyle = lg; g.fillRect(0, 0, 512, 512);
    g.filter = 'blur(12px)';
    g.fillStyle = '#FFF6DE'; g.fillRect(40, 30, 190, 230);                 // the window, up and to the left
    g.fillStyle = 'rgba(214,196,168,0.9)'; g.fillRect(130, 30, 10, 230); g.fillRect(40, 140, 190, 10);
    g.fillStyle = 'rgba(126,156,186,0.85)'; g.fillRect(0, 10, 42, 290);   // a curtain
    g.fillStyle = '#6A4A33'; g.fillRect(330, 60, 170, 250);               // a bookshelf
    const cols = ['#C94F4F', '#E0A33A', '#4F7FC9', '#5AA66A', '#8A5FC0', '#E07A5F', '#3F8F9F'];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) {
      g.fillStyle = cols[(i + row * 3) % cols.length];
      g.fillRect(340 + i * 17, 72 + row * 80, 13, 64 - (i % 3) * 8);
    }
    g.fillStyle = 'rgba(255,238,190,0.9)'; g.beginPath(); g.arc(290, 330, 36, 0, Math.PI * 2); g.fill();  // a lamp's glow
    g.filter = 'none';
  });
  scene.fog.color.setHex(0xD8C3A4); scene.fog.near = 34; scene.fog.far = 110;
  hemi.color.setHex(0xFFF1DE); hemi.groundColor.setHex(0x7A5A3E); hemi.intensity = 1.1;
  sun.color.setHex(0xFFE6C2); sun.intensity = 3.0;
  const G = w.group, r = seeded(9);
  const wood = canvasTex(512, 512, (g) => {
    g.fillStyle = '#CDA77E'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = `rgba(${120 + r() * 40},${80 + r() * 25},${45 + r() * 20},${0.10 + r() * 0.14})`;
      g.lineWidth = 1 + r() * 3; g.beginPath();
      const y = r() * 512; g.moveTo(0, y);
      for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x / 90 + i) * 6);
      g.stroke();
    }
  }, true);
  wood.repeat.set(2, 2);
  const desk = new Mesh(new PlaneGeometry(260, 260), new MeshStandardMaterial({ map: wood, roughness: 0.55 }));
  desk.rotation.x = -Math.PI / 2; desk.position.set(0, -9, -60); desk.receiveShadow = true; G.add(desk);
  // Stacks of books hold the course up off the desk.
  const bookCols = [0x2F6F73, 0xC24A39, 0xE3A33B, 0x4F6FB5, 0x6A9F58, 0x8C5FB0, 0xD9774F];
  for (const c of colliders) {
    if (c.ferry || c.obstacle) continue;
    let y = -9, k = 0;
    const top = c.pos.y - c.half.y;
    while (y < top - 0.05) {
      const t = Math.min(top - y, 1.1 + r() * 0.6);
      const b = book(c.half.x * 2 * (0.8 + r() * 0.3), t, c.half.z * 2 * (0.75 + r() * 0.3), bookCols[(k * 3 + Math.abs(Math.floor(c.pos.z))) % 7]);
      b.position.set(c.pos.x + (r() - 0.5) * 0.5, y + t / 2, c.pos.z + (r() - 0.5) * 0.5);
      b.rotation.y = (r() - 0.5) * 0.16; b.castShadow = true; b.receiveShadow = true;
      G.add(b); y += t; k++;
    }
  }
  // Things on the desk: a pencil pot, loose pencils, a crumpled paper ball.
  const pot = new Mesh(new CylinderGeometry(2.4, 2.2, 7, 32, 1, true), new MeshStandardMaterial({ color: 0x5A87C2, roughness: 0.5, side: DoubleSide }));
  pot.position.set(-15, -5.5, -26); G.add(pot);
  const pcols = [0xF2C230, 0xE0513A, 0x3E9E5A, 0x4A74C9, 0x9A5FC4];
  for (let i = 0; i < 6; i++) {
    const p = new Mesh(new CylinderGeometry(0.34, 0.34, 11, 6), new MeshStandardMaterial({ color: pcols[i % 5], roughness: 0.6 }));
    p.position.set(-15 + Math.cos(i) * 1.1, -2.5, -26 + Math.sin(i) * 1.1); p.rotation.set((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4); G.add(p);
    const tip = new Mesh(new ConeGeometry(0.34, 1.1, 6), new MeshStandardMaterial({ color: 0xE9C99A, roughness: 0.8 }));
    tip.position.copy(p.position).add(new Vector3(0, 6, 0)); tip.rotation.copy(p.rotation); G.add(tip);
  }
  for (let i = 0; i < 3; i++) {
    const p = new Mesh(new CylinderGeometry(0.34, 0.34, 11, 6), new MeshStandardMaterial({ color: pcols[(i + 2) % 5], roughness: 0.6 }));
    p.rotation.set(Math.PI / 2, 0, 0.4 + i * 0.7); p.position.set(14 + i * 2.2, -8.66, -12 - i * 5); p.castShadow = true; G.add(p);
  }
  const ball = new Mesh(new IcosahedronGeometry(2.2, 1), new MeshStandardMaterial({ color: 0xF4F1EA, roughness: 0.95, flatShading: true }));
  ball.position.set(15, -6.9, -34); ball.castShadow = true; G.add(ball);
  // The course itself becomes things from the desk.
  w.restyle = () => {
    const bookSkin = { top: coverTexBook('#2F6F73', '#E9D9B6'), side: 0xF3EBD9 };   // a hardcover book to start on
    const eraser = { top: null, side: 0xF29AA8, topCol: 0xF6B3BE };                // a pink eraser
    const notebook = { top: paperTex(), side: 0xF3EBD9 };                           // a notebook to finish on
    colliders.forEach((c, i) => {
      if (c.ferry) return;
      const s = i === 0 ? bookSkin : i === colliders.length - 1 ? notebook : i % 3 === 2 ? eraser : { ruler: true };
      const len = c.half.z * 2;
      let topMat, sideMat;
      if (s.ruler) {
        topMat = new MeshStandardMaterial({ map: rulerTex(len, 1), roughness: 0.6 });
        sideMat = new MeshStandardMaterial({ color: 0xD9B77C, roughness: 0.7 });
      } else {
        topMat = new MeshStandardMaterial({ map: s.top || null, color: s.top ? 0xFFFFFF : s.topCol, roughness: 0.8 });
        sideMat = new MeshStandardMaterial({ color: s.side, roughness: 0.9 });
      }
      c.mesh.material = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
      setTopUV(c.mesh, true);
    });
  };
});

// ---- 3. A sunlit lagoon: light rippling over the stone, shafts from the surface, fish and coral ----
function causticsTex() {
  const N = 256, pts = [], r = seeded(21);
  for (let i = 0; i < 26; i++) pts.push([r() * N, r() * N]);
  return canvasTex(N, N, (g) => {
    const img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let f1 = 1e9, f2 = 1e9;
      for (const [px, py] of pts) for (let ox = -N; ox <= N; ox += N) for (let oy = -N; oy <= N; oy += N) {
        const d = Math.hypot(x - px - ox, y - py - oy);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      const e = f2 - f1, v = Math.pow(Math.max(0, 1 - e / 6), 2.6) * 255;
      const k = (y * N + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.filter = 'blur(1.4px)'; g.drawImage(g.canvas, 0, 0); g.filter = 'none';
  }, true);
}
WORLDS_ADD('lagoon', (w) => {
  scene.background = gradientTex([[0, '#8BEAE2'], [0.3, '#3EC1D2'], [0.72, '#137DAA'], [1, '#0A4E7B']]);
  scene.fog.color.setHex(0x2598BA); scene.fog.near = 12; scene.fog.far = 62;
  hemi.color.setHex(0xA8F4FF); hemi.groundColor.setHex(0x0C4A6A); hemi.intensity = 1.25;
  sun.color.setHex(0xE6FFFF); sun.intensity = 2.3;
  const G = w.group, r = seeded(33), caus = causticsTex();
  caus.repeat.set(0.6, 0.6);
  const causBed = caus.clone(); causBed.repeat.set(110, 110);
  // Light from the surface ripples over everything.
  const lagoonTop = stone[1].clone(); lagoonTop.emissive = new Color(0xCFF8FF); lagoonTop.emissiveMap = caus; lagoonTop.emissiveIntensity = 0.38;
  const lagoonStone = [stone[0], lagoonTop, stone[2]];
  w.restyle = () => { for (const c of colliders) if (!c.ferry && !c.obstacle) c.mesh.material = faceMats(lagoonStone); };
  w.tick = (dt) => { for (const t of [caus, causBed]) { t.offset.x += dt * 0.03; t.offset.y += dt * 0.017; } };
  const sand = canvasTex(256, 256, (g) => {
    g.fillStyle = '#E3D2A0'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 26; i++) { g.strokeStyle = 'rgba(170,140,80,0.25)'; g.lineWidth = 3; g.beginPath(); const y = i * 10; g.moveTo(0, y); for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x / 30 + i) * 3); g.stroke(); }
  }, true);
  sand.repeat.set(30, 30);
  const bedMat = new MeshStandardMaterial({ map: sand, roughness: 0.95, emissive: new Color(0xBFF6FF), emissiveMap: causBed, emissiveIntensity: 0.28 });
  const bed = new Mesh(new PlaneGeometry(300, 300), bedMat);
  bed.rotation.x = -Math.PI / 2; bed.position.set(0, -14, -60); bed.receiveShadow = true; G.add(bed);
  // Coral, rocks and weed on the bed.
  const coralCols = [0xFF7A8A, 0xFF9E4F, 0xA078FF, 0xFFCF5A, 0x3FC2A0];
  for (let i = 0; i < 38; i++) {
    const x = -30 + r() * 60, z = 10 - r() * 80;
    if (Math.abs(x - 2) < 5 && z > -45) continue;
    const kind = i % 3, col = coralCols[i % 5];
    if (kind === 0) {
      const rock = new Mesh(new IcosahedronGeometry(1.5 + r() * 2.5, 1), new MeshStandardMaterial({ color: 0x5E7F86, roughness: 1, flatShading: true }));
      rock.position.set(x, -14, z); rock.scale.y = 0.6; G.add(rock);
    } else if (kind === 1) {
      for (let b = 0; b < 5; b++) {
        const c = new Mesh(new CylinderGeometry(0.18, 0.3, 2 + r() * 2.5, 6), new MeshStandardMaterial({ color: col, roughness: 0.7 }));
        c.position.set(x + (r() - 0.5) * 1.6, -13 + r(), z + (r() - 0.5) * 1.6); c.rotation.set((r() - 0.5) * 0.9, 0, (r() - 0.5) * 0.9); G.add(c);
      }
    } else {
      const weed = new Mesh(new ConeGeometry(0.35, 6 + r() * 6, 5), new MeshStandardMaterial({ color: 0x2E9F6A, roughness: 0.8 }));
      weed.position.set(x, -11, z); weed.rotation.z = (r() - 0.5) * 0.4; G.add(weed);
    }
  }
  // Shafts of light from the surface, slanting with the sun.
  const shaft = canvasTex(64, 256, (g) => {
    const lg = g.createLinearGradient(0, 0, 64, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg; g.fillRect(0, 0, 64, 256);
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createLinearGradient(0, 0, 0, 256); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade; g.fillRect(0, 0, 64, 256);
  });
  for (let i = 0; i < 7; i++) {
    const s = new Mesh(new PlaneGeometry(2.5 + r() * 3, 60), new MeshBasicMaterial({ map: shaft, color: 0xCFFBFF, transparent: true,
      opacity: 0.16, blending: AdditiveBlending, depthWrite: false, fog: false }));
    s.position.set(-24 + i * 9 + r() * 4, 6, -20 - r() * 45); s.rotation.z = 0.35; G.add(s);
  }
  // A few fish, and a small school.
  const fishCols = [0xFF8A3D, 0xFFD23F, 0x4FA8FF];
  const fish = (x, y, z, s, col, dir) => {
    const f = new Group();
    const body = new Mesh(new SphereGeometry(0.6, 16, 10), new MeshStandardMaterial({ color: col, roughness: 0.5 }));
    body.scale.set(1.5, 0.75, 0.4); f.add(body);
    const tail = new Mesh(new ConeGeometry(0.45, 0.7, 4), new MeshStandardMaterial({ color: col, roughness: 0.5 }));
    tail.rotation.z = dir > 0 ? Math.PI / 2 : -Math.PI / 2; tail.position.x = -dir * 1.05; tail.scale.z = 0.3; f.add(tail);
    f.position.set(x, y, z); f.scale.setScalar(s); return f;
  };
  G.add(fish(-7, -2, -14, 1.3, fishCols[0], 1), fish(12, -4, -26, 1.6, fishCols[2], -1), fish(-14, 2, -40, 1.2, fishCols[1], 1));
  for (let i = 0; i < 12; i++) G.add(fish(18 + r() * 8, -1 + r() * 4, -44 - r() * 8, 0.55, 0xBFE6FF, -1));
  const bub = new Float32Array(90 * 3);
  for (let i = 0; i < 90; i++) { bub[i * 3] = -8 + r() * 20; bub[i * 3 + 1] = -12 + r() * 22; bub[i * 3 + 2] = -r() * 40; }
  const bg = new BufferGeometry(); bg.setAttribute('position', new Float32BufferAttribute(bub, 3));
  G.add(new Points(bg, new PointsMaterial({ size: 0.16, map: dot, color: 0xE8FFFF, transparent: true, opacity: 0.7, depthWrite: false })));
});

// ---- 4. Space, made spectacular: a nebula, a ringed planet, a moon, a falling star ----
WORLDS_ADD('space', (w) => {
  scene.background = coverTex(1024, (g) => {
    const r = seeded(77);
    const lg = g.createLinearGradient(0, 0, 0, 1024);
    lg.addColorStop(0, '#060A1C'); lg.addColorStop(0.5, '#0E1430'); lg.addColorStop(1, '#171038');
    g.fillStyle = lg; g.fillRect(0, 0, 1024, 1024);
    g.filter = 'blur(40px)';
    for (const [x, y, rad, col] of [[260, 300, 260, 'rgba(192,79,216,0.35)'], [620, 220, 300, 'rgba(54,194,216,0.25)'], [760, 520, 240, 'rgba(107,79,216,0.35)'], [420, 560, 200, 'rgba(255,107,92,0.18)']]) {
      g.fillStyle = col; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    g.filter = 'blur(10px)';                               // the Milky Way, a faint band
    g.save(); g.translate(512, 512); g.rotate(-0.5); g.fillStyle = 'rgba(220,225,255,0.10)'; g.fillRect(-800, -70, 1600, 140); g.restore();
    g.filter = 'none';
    for (let i = 0; i < 900; i++) {
      const b = r(), s = b > 0.985 ? 2.2 : b > 0.9 ? 1.4 : 0.8;
      g.fillStyle = `rgba(255,255,255,${0.35 + b * 0.65})`; g.beginPath(); g.arc(r() * 1024, r() * 1024, s, 0, Math.PI * 2); g.fill();
    }
  });
  scene.fog.color.setHex(0x0B1026); scene.fog.near = 40; scene.fog.far = 140;
  hemi.color.setHex(0xAFBCFF); hemi.groundColor.setHex(0x221A4A); hemi.intensity = 1.0;
  sun.color.setHex(0xFFFFFF); sun.intensity = 2.8;
  const G = w.group;
  const bands = canvasTex(64, 512, (g) => {
    const cols = ['#F2D7A6', '#E8B982', '#D99A6A', '#F5E3C0', '#C98457', '#EAC79A', '#B8714A', '#F0D2A0'];
    let y = 0; const r = seeded(4);
    while (y < 512) { const h = 18 + r() * 50; g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(0, y, 64, h); y += h; }
    g.filter = 'blur(3px)'; g.drawImage(g.canvas, 0, 0);
  });
  const planet = new Mesh(new SphereGeometry(34, 64, 32), new MeshStandardMaterial({ map: bands, roughness: 0.8, fog: false }));
  planet.position.set(44, -64, -150); planet.rotation.z = 0.35; G.add(planet);
  const ringTex = canvasTex(512, 512, (g) => {
    const rg = g.createRadialGradient(256, 256, 0, 256, 256, 256);
    rg.addColorStop(0.0, 'rgba(0,0,0,0)'); rg.addColorStop(0.62, 'rgba(0,0,0,0)');
    rg.addColorStop(0.66, 'rgba(240,215,170,0.75)'); rg.addColorStop(0.74, 'rgba(210,170,120,0.35)');
    rg.addColorStop(0.8, 'rgba(245,225,190,0.8)'); rg.addColorStop(0.9, 'rgba(200,160,110,0.45)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 512, 512);
  });
  const ring = new Mesh(new RingGeometry(40, 70, 128), new MeshBasicMaterial({ map: ringTex, transparent: true, side: DoubleSide, depthWrite: false, fog: false }));
  // RingGeometry's UVs are planar, so the radial bands of the texture fall on the ring.
  ring.position.copy(planet.position); ring.rotation.set(-1.25, 0.1, 0.35); G.add(ring);
  const moon = new Mesh(new SphereGeometry(6, 32, 16), new MeshStandardMaterial({ color: 0xBFC3CF, roughness: 1, fog: false }));
  moon.position.set(-44, -24, -104); G.add(moon);
  const streak = canvasTex(256, 16, (g) => {
    const lg = g.createLinearGradient(0, 0, 256, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = lg; g.fillRect(0, 6, 256, 4);
  });
  const star = new Mesh(new PlaneGeometry(26, 1.2), new MeshBasicMaterial({ map: streak, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }));
  star.position.set(-26, -12, -120); star.rotation.z = -0.45; G.add(star);
});

// ---------- WORLDS, ROUND TWO (the owner's own pictures, 2026-09-26) ----------
/* Of the first four the owner liked the desk best, because its course was
   made of the world's own things, and sent six pictures of the kind of world
   they meant: a crystal canyon at night, a lantern-lit temple, a bright sky of
   toy blocks, a neon city, a low-poly valley. They asked that the marble and
   the course match the world. So each world here dresses three things: the
   scenery, the course, and the marble. */

// ---- the marble's skins ----
const sphereGeo = marble.geometry;
const skinParts = new Group();
marble.add(skinParts);
let marbleSkin = 'glass';
let neonEnv = null;
function neonEnvMap() {
  if (neonEnv || !renderer) return neonEnv;
  const t = canvasTex(512, 256, (g) => {
    const lg = g.createLinearGradient(0, 0, 0, 256);
    lg.addColorStop(0, '#05040C'); lg.addColorStop(0.42, '#1A0B2E'); lg.addColorStop(0.52, '#FF5A3C');
    lg.addColorStop(0.6, '#2A0F3A'); lg.addColorStop(1, '#05040C');
    g.fillStyle = lg; g.fillRect(0, 0, 512, 256);
    const r = seeded(3);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(80,230,255,0.95)' : 'rgba(255,140,60,0.95)';
      g.fillRect(r() * 512, 50 + r() * 150, 3 + r() * 14, 2 + r() * 22);
    }
  });
  const pm = new PMREMGenerator(renderer);
  neonEnv = pm.fromEquirectangular(t).texture;
  pm.dispose();
  return neonEnv;
}
const SKINS = {
  glass() { marble.material = glassMat; eye.visible = true; },
  // Clear crystal with a red crystal heart, for the crystal canyon's green road.
  quartz() {
    marble.material = new MeshPhysicalMaterial({ color: 0xFFFFFF, transmission: 1, thickness: 0.45, ior: 1.54, roughness: 0.03,
      attenuationColor: new Color(0xFFE8D8), attenuationDistance: 2.4, clearcoat: 1,
      envMap: crystalEnvMap() || envTex, envMapIntensity: 1.6 });
    skinParts.add(new Mesh(new IcosahedronGeometry(R * 0.36, 0), new MeshStandardMaterial({
      color: 0xFF7A60, emissive: 0xFF2A1A, emissiveIntensity: 1.8, roughness: 0.25, flatShading: true })));
  },
  // A white candy marble with rainbow sprinkles: bright on any coloured block.
  candy() {
    const t = canvasTex(256, 128, (g) => {
      g.fillStyle = '#FFFDF8'; g.fillRect(0, 0, 256, 128);
      const r = seeded(8), cols = ['#FF5F8F', '#FFB23F', '#3FC9C0', '#7F6BFF', '#FFD84D', '#5FB0FF'];
      g.lineCap = 'round'; g.lineWidth = 5;
      for (let i = 0; i < 90; i++) {
        const x = r() * 256, y = 10 + r() * 108, a = r() * Math.PI;
        g.strokeStyle = cols[i % cols.length]; g.beginPath();
        g.moveTo(x - Math.cos(a) * 6, y - Math.sin(a) * 6); g.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); g.stroke();
      }
    });
    marble.material = new MeshPhysicalMaterial({ map: t, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, envMap: envTex, envMapIntensity: 0.9 });
  },
  // A gold orb, for the castle ruins' grey stone and golden light.
  gold() { marble.material = new MeshStandardMaterial({ color: 0xFFC65A, metalness: 1, roughness: 0.16, envMap: envTex, envMapIntensity: 1.3 }); },
  // A ladybird: glossy red, black spots, for the forest's green and brown.
  ladybird() {
    const t = canvasTex(512, 256, (g) => {
      g.fillStyle = '#D8231C'; g.fillRect(0, 0, 512, 256);
      const r = seeded(14);
      g.fillStyle = '#141010';
      for (const [x, y, s] of [[70, 80, 26], [150, 150, 30], [220, 70, 22], [320, 170, 28], [400, 90, 26], [470, 190, 20], [40, 190, 18], [260, 210, 16], [350, 40, 16]]) {
        g.beginPath(); g.arc(x + (r() - 0.5) * 8, y, s, 0, Math.PI * 2); g.fill();
      }
      g.fillRect(0, 0, 512, 14); g.fillRect(0, 242, 512, 14);           // black at the poles
      g.fillRect(254, 0, 4, 256);                                        // where the wing cases meet
    });
    marble.material = new MeshPhysicalMaterial({ map: t, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, envMap: envTex, envMapIntensity: 0.8 });
  },
  // A temari, the Japanese thread ball, for Tokyo: red silk wound over, gold threads from pole to pole, a chrysanthemum of
  // petals at each pole and zigzags round the middle; red on the pale rail, and every turn of it shows.
  temari() { marble.material = new MeshStandardMaterial({ map: temariTex(), roughness: 0.62, envMap: tokyoEnvMap() || envTex, envMapIntensity: 0.35 }); },
  // Steel, polished, for the dystopian city: it carries the teal smog, the sunset and the lights.
  steel() { marble.material = new MeshStandardMaterial({ color: 0xFFFFFF, metalness: 1, roughness: 0.06, envMap: tokyoEnvMap() || envTex, envMapIntensity: 1.3 }); },
  // Chrome, so the neon city runs across it.
  chrome() { marble.material = new MeshStandardMaterial({ color: 0xFFFFFF, metalness: 1, roughness: 0.05, envMap: neonEnvMap() || envTex, envMapIntensity: 1.4 }); },
  // Faceted, like everything in the low-poly valley.
  faceted() {
    marble.geometry = new IcosahedronGeometry(R, 1);
    marble.material = new MeshStandardMaterial({ color: 0xFF6B3D, roughness: 0.5, flatShading: true });
  },
};
let temariMemo = null;
function temariTex() {
  return temariMemo || (temariMemo = canvasTex(512, 256, (g) => {
    g.fillStyle = '#B81E2C'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = 'rgba(255,255,255,0.07)'; for (let y = 0; y < 256; y += 3) g.fillRect(0, y, 512, 1);          // the wound silk
    const petals = (top, cols) => {
      for (let k = 0; k < 16; k++) {
        const x0 = k * 32, x1 = x0 + 32, y = top ? 56 : 200, tip = top ? 70 : 186, pole = top ? 0 : 256;
        g.fillStyle = cols[k % cols.length]; g.beginPath(); g.moveTo(x0, pole); g.lineTo(x1, pole); g.lineTo(x1, y); g.lineTo(x0 + 16, tip); g.lineTo(x0, y); g.closePath(); g.fill();
      }
    };
    petals(true, ['#FFFFFF', '#F7A8C4', '#F2C230', '#2E8A5A']); petals(false, ['#2E8A5A', '#FFFFFF', '#F7A8C4', '#F2C230']);
    g.lineWidth = 4; g.lineJoin = 'round';
    for (const [col, off] of [['#FFFFFF', -6], ['#F2C230', 0], ['#2E8A5A', 6]]) {
      g.strokeStyle = col; g.beginPath();
      for (let x = 0; x <= 512; x += 16) g.lineTo(x, 128 + off + ((x / 16) % 2 ? 20 : -20));
      g.stroke();
    }
    g.fillStyle = '#E8C050'; for (let k = 0; k < 8; k++) g.fillRect(k * 64 - 1.5, 0, 3, 256);
  }));
}
function setMarbleSkin(name) {
  for (const m of [...skinParts.children]) skinParts.remove(m);
  eye.visible = false;
  if (marble.geometry !== sphereGeo) { marble.geometry.dispose(); marble.geometry = sphereGeo; }
  marbleSkin = SKINS[name] ? name : 'glass';
  SKINS[marbleSkin]();
  return marbleSkin;
}
function tintRings(gateCol, goalCol) {
  for (const g of gates) if (!g.passed) { g.mat.color.setHex(gateCol); g.mat.emissive.setHex(gateCol); g.discMat.color.setHex(gateCol); }
  if (goal) { goal.mat.color.setHex(goalCol); goal.mat.emissive.setHex(goalCol); goal.discMat.color.setHex(goalCol); }
}
const gateColour = () => (world.rings ? world.rings[0] : 0xFFFFFF);
// Things fixed to a course piece ride with it, ferries included.
function addDeco(c, obj) { (c.deco || (c.deco = [])).push(obj); c.mesh.add(obj); }
const HIDDEN = new MeshBasicMaterial({ visible: false });

// ---- 1. The crystal canyon: where the wormholes lead ----
/* THE CRYSTAL CANYON. The owner's direction, in order (2026-09-27): the
   wormholes lead here, and it "has to be just as glowing and beautiful and
   compliment the style visually"; then "more quartz like ... more like a
   canyon", with pictures that were for the crystals' SHAPES only; then, of a
   washed-out daylight try: "Make them look like real crystals in cliffs in a
   glowing neon world like our city ... where you are using orange, light
   purple, cyan and black for the city, use yellows, greens, reds and black".
   So: the city's night and its thin bright lines, in the canyon's own colours.
   Dark cliffs rise on both sides and follow the road, far enough out never to
   hide it. Real crystals grow from them, from the canyon floor and beside the
   road: clusters of irregular points, uneven sides, a taper, a leaning tip,
   a few big and many small, glowing along their edges and toward their tips,
   in yellows and reds. A red river of light winds far down, and embers rise.
   Green is the road's alone, as magenta is in the city: dark crystal glass
   under a green facet lattice. The marble is clear with a red crystal heart. */
let crystalEnv = null;
function crystalEnvMap() {
  if (crystalEnv || !renderer) return crystalEnv;
  const t = canvasTex(512, 256, (g) => {
    const lg = g.createLinearGradient(0, 0, 0, 256);
    lg.addColorStop(0, '#030402'); lg.addColorStop(0.45, '#0B1408'); lg.addColorStop(0.55, '#5A1A08');
    lg.addColorStop(0.62, '#140605'); lg.addColorStop(1, '#020202');
    g.fillStyle = lg; g.fillRect(0, 0, 512, 256);
    const r = seeded(7);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = ['rgba(255,210,60,0.95)', 'rgba(255,70,50,0.95)', 'rgba(120,255,110,0.8)'][i % 3];
      g.fillRect(r() * 512, 60 + r() * 140, 2 + r() * 8, 4 + r() * 28);
    }
  });
  const pm = new PMREMGenerator(renderer);
  crystalEnv = pm.fromEquirectangular(t).texture;
  pm.dispose();
  return crystalEnv;
}
// The road's top: a diamond lattice of facets, a thin bright core in a tight green feather.
function facetTex() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    const lattice = (wd, col, blur) => {
      g.filter = blur ? `blur(${blur}px)` : 'none';
      g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'round';
      g.beginPath();
      for (const [x0, y0, x1, y1] of [[0, 0, 256, 256], [256, 0, 0, 256], [128, 0, 256, 128], [0, 128, 128, 256], [128, 0, 0, 128], [256, 128, 128, 256]]) {
        g.moveTo(x0, y0); g.lineTo(x1, y1);
      }
      g.stroke(); g.filter = 'none';
    };
    lattice(12, 'rgba(60,255,90,0.9)', 7);
    lattice(2.5, '#EFFFE8', 0);
  }, true);
}
/* One crystal point, irregular as real ones are: six sides of uneven width
   round a slightly lopsided section, a taper toward the top, and a pointed
   end whose apex leans off the axis. Height about 1.7 at scale 1. UVs put the
   sides in the left half of the texture and the pointed end's faces in the
   right half, so both can glow along their edges. */
function crystalPointGeo(seed) {
  const r = seeded(seed), n = 6, ring = [], top = [], taper = 0.74 + r() * 0.18;
  for (let i = 0; i < n; i++) {
    const a = (i + (r() - 0.5) * 0.45) / n * Math.PI * 2, rad = 0.7 + r() * 0.42;
    ring.push([Math.cos(a) * rad, 0, Math.sin(a) * rad]);
    top.push([Math.cos(a) * rad * taper, 1, Math.sin(a) * rad * taper]);
  }
  const apex = [(r() - 0.5) * 0.4, 1.4 + r() * 0.6, (r() - 0.5) * 0.4];
  const pos = [], uv = [];
  const tri = (a, b, c, ua, ub, uc) => { pos.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc); };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tri(ring[i], top[j], ring[j], [0.02, 0], [0.48, 1], [0.48, 0]);
    tri(ring[i], top[i], top[j], [0.02, 0], [0.02, 1], [0.48, 1]);
    tri(top[i], apex, top[j], [0.52, 0], [0.75, 1], [0.98, 0]);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
// A crystal's light: its edges bright (a thin core in a tight feather), a glow
// rising along its sides, and its pointed end lit brightest at the tip.
function crystalEdgeTex() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    const lg = g.createLinearGradient(0, 256, 0, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0.03)'); lg.addColorStop(0.7, 'rgba(255,255,255,0.16)'); lg.addColorStop(1, 'rgba(255,255,255,0.4)');
    g.fillStyle = lg; g.fillRect(0, 0, 128, 256);
    const line = (pts, wide) => {
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.filter = 'blur(5px)'; g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = wide;
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      g.filter = 'none'; g.strokeStyle = '#FFFFFF'; g.lineWidth = 3;
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    };
    line([[4, 256], [4, 0]], 12); line([[124, 256], [124, 0]], 12);
    const tip = g.createLinearGradient(0, 256, 0, 0);                  // the pointed end: brightest at its tip
    tip.addColorStop(0, 'rgba(255,255,255,0.22)'); tip.addColorStop(1, 'rgba(255,255,255,0.85)');
    g.fillStyle = tip; g.beginPath(); g.moveTo(133, 256); g.lineTo(192, 0); g.lineTo(251, 256); g.closePath(); g.fill();
    line([[133, 256], [192, 0], [251, 256]], 12);
  });
}
// Emissive times each instance's own colour, as the city's lit cubes do.
function tintedGlow(mat, key) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#if defined( USE_INSTANCING_COLOR ) || defined( USE_COLOR )\n  totalEmissiveRadiance *= vColor.rgb;\n#endif');
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}
// The same glow, with pulses of light racing forward along the canyon through
// every crystal: a bright band every forty-five metres, rolling at about nine metres a second.
function pulsingGlow(mat, key, time) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWz;').replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    vec4 wq = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      wq = instanceMatrix * wq;
    #endif
    vWz = (modelMatrix * wq).z;
  }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWz;\nuniform float uTime;').replace('#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
#if defined( USE_INSTANCING_COLOR ) || defined( USE_COLOR )
  totalEmissiveRadiance *= vColor.rgb;
#endif
  totalEmissiveRadiance *= 0.7 + 1.5 * pow(max(0.0, sin(vWz * 0.14 + uTime * 1.2)), 6.0);`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}
// Rough dark rock: a ball pushed about by a noise that is the same wherever two
// faces share a corner, so it has no cracks.
function rockGeo(seed) {
  const g = new IcosahedronGeometry(1, 2), p = g.attributes.position, cols = [], c = new Color();
  const tones = [0x3A2C24, 0x4A3528, 0x2E2620, 0x523A2C, 0x352B24, 0x42302A];
  const hash = (x, y, z) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 13.3) * 43758.5453; return v - Math.floor(v); };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.76 + 0.36 * hash(Math.round(x * 40), Math.round(y * 40), Math.round(z * 40));
    p.setXYZ(i, x * k, y * k, z * k);
    c.setHex(tones[Math.floor(hash(Math.round(x * 5), Math.round(y * 9), Math.round(z * 5)) * tones.length)]);
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}
const CANYON_YELLOWS = [0xFFC400, 0xFFD60A, 0xFFAA00], CANYON_REDS = [0xFF2E22, 0xFF4A2E, 0xE01A34];
WORLDS_ADD('crystal', (w) => {
  scene.background = gradientTex([[0, '#020201'], [0.4, '#060805'], [0.66, '#1A0806'], [0.82, '#0C0504'], [1, '#030202']]);
  scene.fog.color.setHex(0x160806); scene.fog.near = 24; scene.fog.far = 125;
  hemi.color.setHex(0x3A6A34); hemi.groundColor.setHex(0x8A2A10); hemi.intensity = 1.35;   // green from above, the red river's light from below
  sun.color.setHex(0xFFE9C8); sun.intensity = 1.2;
  w.marble = 'quartz'; w.rings = [0x54E0FF, 0xFF6A3C]; w.glowGates = true;
  w.physics = { acc: 10, damp: 0.4 };                     // crystal is slippery: less grip, and the marble slides on
  const G = w.group, r = seeded(12), env = crystalEnvMap() || envTex;
  const end = courseEnd(), deep = Math.min(-120, end - 90);
  const m = new Matrix4(), q = new Quaternion(), pos = new Vector3(), sc = new Vector3(), col = new Color(), e = new Euler();
  const up = new Vector3(0, 1, 0), dir = new Vector3(), side = new Vector3();
  // Where the road reaches across over a stretch, so the cliffs clear its turns.
  const road = (level ? level.pieces : []).filter((p) => p.t !== 'worm' && p.t !== 'curtain' && p.t !== 'lock' && p.t !== 'loop');
  const reach = (z0, z1) => {
    let lo = 1e9, hi = -1e9;
    for (const p of road) {
      const a = p.t === 'ramp' ? Math.max(p.z0, p.z1) : p.z + p.d / 2, b = p.t === 'ramp' ? Math.min(p.z0, p.z1) : p.z - p.d / 2;
      if (a < z1 || b > z0) continue;
      lo = Math.min(lo, p.x - p.w / 2); hi = Math.max(hi, p.x + p.w / 2);
    }
    return lo > hi ? null : [lo, hi];
  };
  // Where the mine carts cross under the road, and where the spark geysers stand: kept clear of crystals.
  const CROSS_Z = []; for (let z = -8; z > end + 8; z -= 20) CROSS_Z.push(z);
  const VENT_Z = []; for (let z = -18; z > end + 6; z -= 20) VENT_Z.push(z);
  const inLane = (z, pad) => CROSS_Z.some((c) => Math.abs(z - c) < pad) || VENT_Z.some((c) => Math.abs(z - c) < pad * 0.8);
  // CRYSTALS: clusters of irregular points from six shapes, one draw each.
  const kinds = [1, 2, 3, 4, 5, 6].map((k) => crystalPointGeo(k * 17)), lists = kinds.map(() => []);
  const addPoint = (x, y, z, d, len, rad, hue) => {
    q.setFromUnitVectors(up, d); q.multiply(new Quaternion().setFromAxisAngle(up, r() * 6.28));
    m.compose(pos.set(x, y, z), q, sc.set(rad, len / 1.7, rad));
    lists[Math.floor(r() * kinds.length)].push([m.clone(), hue]);
  };
  // A cluster: a few long points and many short ones, fanning out from one root.
  const cluster = (x, y, z, d0, size, hues, big = 2) => {
    for (let i = 0; i < big + 5 + Math.floor(r() * 6); i++) {
      const main = i < big, spread = main ? 0.35 : 0.95, len = size * (main ? 0.65 + r() * 0.35 : 0.18 + r() * 0.35);
      dir.set(d0.x + (r() - 0.5) * spread, d0.y + (r() - 0.5) * spread * 0.6, d0.z + (r() - 0.5) * spread).normalize();
      const rad = len * (0.17 + r() * 0.12), hue = hues[Math.floor(r() * hues.length)];
      addPoint(x + (r() - 0.5) * size * 0.25, y + (r() - 0.5) * size * 0.1, z + (r() - 0.5) * size * 0.25, dir, len, rad, hue);
    }
  };
  const huesFor = () => (r() < 0.5 ? CANYON_YELLOWS : CANYON_REDS);
  // THE CLIFFS: dark rock either side, from far below to high above, crystals growing out of them.
  const rockMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.1, flatShading: true, envMap: env, envMapIntensity: 0.5 });
  const rocks = [rockGeo(1), rockGeo(2), rockGeo(3)], placed = [[], [], []];
  let span = [-3, 3];
  for (let z = 18; z > deep; z -= 3.1) {
    span = reach(z + 16, z - 16) || span;
    for (const sd of [-1, 1]) {
      const edge = sd < 0 ? span[0] : span[1];
      for (const layer of [0, 1]) {
        const x = edge + sd * (layer ? 11 + r() * 5 : 4.8 + r() * 1.4), top = layer ? 16 + r() * 18 : 7 + r() * 13;
        const sx = layer ? 5 + r() * 4 : 2.4 + r() * 2, sz = 2.6 + r() * 1.8, sy = (top + 50) / 2;
        placed[Math.floor(r() * 3)].push([x + sd * sx * 0.55, top - sy, z + r() * 1.5, sx, sy, sz, r() * 6]);
        if (layer && r() < 0.8) {                                    // the far cliffs glitter with crystal too
          d0.set(-sd * (0.4 + r() * 0.5), 1, (r() - 0.5) * 0.5).normalize();
          cluster(x - sd * 0.6, -6 + r() * 20, z, d0, 1.6 + r() * 2.6, huesFor(), 1);
        }
        if (!layer && r() < 0.9) {
          // Out of the cliff face, leaning out over the canyon; above the road only
          // as far as keeps its tips well clear of the road's edge.
          const y = -12 + r() * 20, size = 2.2 + r() * 4.2;
          const lean = y > -1.5 ? Math.asin(Math.min(0.95, 2.2 / size)) * r() : 0.3 + r() * 0.8;
          d0.set(-sd * Math.sin(lean), Math.cos(lean), (r() - 0.5) * 0.4);
          cluster(x - sd * 0.3, y, z + (r() - 0.5) * 2, d0, size, huesFor(), 1 + Math.floor(r() * 2));
        }
      }
    }
  }
  placed.forEach((list, k) => {
    const im = new InstancedMesh(rocks[k], rockMat, list.length);
    list.forEach(([x, y, z, sx, sy, sz, turn], i) => { m.compose(pos.set(x, y, z), q.setFromEuler(e.set(0, turn, 0)), sc.set(sx, sy, sz)); im.setMatrixAt(i, m); });
    G.add(im);
  });
  // From the canyon floor far below: great clusters glowing up out of the dark.
  span = [-3, 3];
  for (let z = 14; z > deep; z -= 6) {
    span = reach(z + 8, z - 8) || span;
    for (let k = 0; k < 2; k++) {
      const x = span[0] - 4 + r() * (span[1] - span[0] + 8), size = inLane(z, 5) ? 6 + r() * 8 : 10 + r() * 14;   // lower where the carts cross
      d0.set((r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3).normalize();
      cluster(x, -40 + r() * 6, z + (r() - 0.5) * 3, d0, size, huesFor(), 2 + Math.floor(r() * 2));
    }
  }
  const tipsBeside = [];
  // Beside the road: clusters rising from below with their tips under the road's
  // level, so they line the way and can never stand in front of it.
  span = null;
  for (let z = 14; z > end - 6; z -= 3.2) {
    span = reach(z + 1.5, z - 1.5);
    if (!span || inLane(z, 4)) continue;
    for (const sd of [-1, 1]) {
      if (r() < 0.35) continue;
      const edge = sd < 0 ? span[0] : span[1], size = 3 + r() * 4, lean = 0.1 + r() * 0.35, cx = edge + sd * (1.6 + r() * 2), cz = z + (r() - 0.5) * 1.5;
      d0.set(sd * Math.sin(lean), Math.cos(lean), (r() - 0.5) * 0.3).normalize();
      cluster(cx, -1.4 - size * 1.05, cz, d0, size, huesFor(), 1 + Math.floor(r() * 2));
      tipsBeside.push([cx + d0.x * size * 0.3, -1.6, cz, sd]);
    }
  }
  const lifeT = { value: 0 };
  const crystalMat = pulsingGlow(new MeshStandardMaterial({ color: 0x0C0B08, roughness: 0.18, metalness: 0.45, envMap: env, envMapIntensity: 1.2,
    emissive: 0xFFFFFF, emissiveMap: crystalEdgeTex(), emissiveIntensity: 1.55, flatShading: true }), 'canyon-crystals', lifeT);
  kinds.forEach((geo, k) => {
    const list = lists[k];
    if (!list.length) return;
    const im = new InstancedMesh(geo, crystalMat, list.length);
    list.forEach(([mm, hue], i) => { im.setMatrixAt(i, mm); im.setColorAt(i, col.setHex(hue)); });
    G.add(im);
  });
  // The river of light far down: red, winding under the road.
  const flow = canvasTex(64, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 64, 256);
    const rr = seeded(23);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + rr() * 0.6})`; g.fillRect(rr() * 60, rr() * 256, 1 + rr() * 3, 20 + rr() * 60); }
    const lg = g.createLinearGradient(0, 0, 64, 0);
    lg.addColorStop(0, 'rgba(0,0,0,1)'); lg.addColorStop(0.25, 'rgba(0,0,0,0)'); lg.addColorStop(0.75, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = lg; g.fillRect(0, 0, 64, 256);
  }, true);
  const riverLen = 22 - deep, riverGeo = new PlaneGeometry(10, riverLen, 1, 80);
  riverGeo.rotateX(-Math.PI / 2);
  const rp = riverGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) rp.setX(i, rp.getX(i) + 6 * Math.sin(rp.getZ(i) * 0.045));
  const river = new Mesh(riverGeo, new MeshBasicMaterial({ map: flow, color: 0xFF3A1A, transparent: true, opacity: 0.95,
    blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  flow.repeat.set(1, riverLen / 18);
  river.position.set(3, -44, (22 + deep) / 2); G.add(river);
  // Embers rising out of the depths.
  const nMotes = 380, moteArr = new Float32Array(nMotes * 3), moteCol = new Float32Array(nMotes * 3);
  for (let i = 0; i < nMotes; i++) {
    moteArr[i * 3] = -18 + r() * 44; moteArr[i * 3 + 1] = -40 + r() * 42; moteArr[i * 3 + 2] = 14 - r() * (14 - end + 20);
    col.setHex(r() < 0.5 ? 0xFFD23A : 0xFF5A30); moteCol.set([col.r, col.g, col.b], i * 3);
  }
  const moteGeo = new BufferGeometry();
  moteGeo.setAttribute('position', new Float32BufferAttribute(moteArr, 3).setUsage(DynamicDrawUsage));
  moteGeo.setAttribute('color', new Float32BufferAttribute(moteCol, 3));
  const motes = new Points(moteGeo, new PointsMaterial({ size: 0.2, map: dot, vertexColors: true, transparent: true, opacity: 0.95,
    blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  motes.frustumCulled = false; G.add(motes);
  // ---- THE CANYON ALIVE (owner, 2026-09-27: "increase the motion and moving elements in the crystal wormhole
  // world"). The canyon is narrow, its cliffs a few metres off the road, so everything that moves is in the gap
  // the camera looks down into, below the road or on the near cliff faces, never over the road.
  const minTop = level ? level.minTop : 0, CT = Math.min(-6, minTop - 5);          // the carts' track, under the road
  const spanAt = (z) => reach(z + 3, z - 3) || [-3, 3];
  const glowSprite = (col2, size, op) => { const sp = new Sprite(new SpriteMaterial({ map: dot, color: col2, transparent: true, opacity: op, blending: AdditiveBlending, depthWrite: false })); sp.scale.set(size, size, 1); return sp; };
  // MINE CARTS heaped with glowing crystal, out of a tunnel in one cliff, over a timber trestle under the road, into the other.
  const timber = new MeshStandardMaterial({ color: 0x3A2A1E, roughness: 0.9 }), ironM = new MeshStandardMaterial({ color: 0x2A2A2C, metalness: 0.7, roughness: 0.4 });
  const loadM = [0xFFC400, 0xFF4A2E].map((c) => new MeshStandardMaterial({ color: 0x0C0B08, roughness: 0.2, metalness: 0.4, envMap: env, emissive: c, emissiveMap: crystalEdgeTex(), emissiveIntensity: 1.9, flatShading: true }));
  const trains = [];
  for (const zc of CROSS_Z) {
    const sp = spanAt(zc), xL = sp[0] - 5.2, xR = sp[1] + 5.2, len = xR - xL;
    const deck = new Mesh(new BoxGeometry(len + 4, 0.3, 2.2), timber); deck.position.set((xL + xR) / 2, CT - 0.35, zc); G.add(deck);
    for (let x = xL + 0.4; x < xR; x += 0.8) { const sl = new Mesh(new BoxGeometry(0.25, 0.14, 2), timber); sl.position.set(x, CT - 0.13, zc); G.add(sl); }
    for (const dz of [-0.55, 0.55]) { const rail = new Mesh(new BoxGeometry(len + 4, 0.1, 0.1), ironM); rail.position.set((xL + xR) / 2, CT, zc + dz); G.add(rail); }
    for (let x = xL + 2; x < xR - 1; x += 4) for (const dz of [-0.9, 0.9]) { const leg = new Mesh(new BoxGeometry(0.35, 34, 0.35), timber); leg.position.set(x, CT - 17.5, zc + dz); G.add(leg); }
    for (const x of [xL, xR]) {                           // the tunnel mouths, timber-framed, a lamp over each
      const hole = new Mesh(new BoxGeometry(1.2, 2.6, 2.8), new MeshBasicMaterial({ color: 0x000000 })); hole.position.set(x + (x < 0 ? -0.4 : 0.4), CT + 1.1, zc); G.add(hole);
      for (const dz of [-1.5, 1.5]) { const post = new Mesh(new BoxGeometry(0.35, 3, 0.35), timber); post.position.set(x, CT + 1.2, zc + dz); G.add(post); }
      const lintel = new Mesh(new BoxGeometry(0.4, 0.4, 3.4), timber); lintel.position.set(x, CT + 2.8, zc); G.add(lintel);
      const lamp = glowSprite(0xFFB24A, 3, 0.8); lamp.position.set(x + (x < 0 ? 0.5 : -0.5), CT + 3.3, zc); G.add(lamp);
    }
    const dir = trains.length % 2 ? -1 : 1, carts = [];
    for (let k = 0; k < 5; k++) {
      const cart = new Group();
      const bin = new Mesh(new BoxGeometry(1.7, 0.9, 1.2), ironM); bin.position.y = 0.75; cart.add(bin);
      if (k === 0) { const lampF = glowSprite(0xFFF1C8, 2.4, 0.95); lampF.position.set(0.95, 0.9, 0); cart.add(lampF); }
      for (const bx of [-0.6, 0.6]) { const band = new Mesh(new BoxGeometry(0.08, 0.95, 1.24), timber); band.position.set(bx, 0.75, 0); cart.add(band); }
      for (const wx of [-0.55, 0.55]) for (const wz of [-0.55, 0.55]) { const wh = new Mesh(new CylinderGeometry(0.26, 0.26, 0.12, 12), ironM); wh.rotation.x = Math.PI / 2; wh.position.set(wx, 0.26, wz); cart.add(wh); }
      for (let j = 0; j < 5; j++) { const cp = new Mesh(kinds[j % 6], loadM[(j + k) % 2]); cp.scale.set(0.28, 0.4 + r() * 0.25, 0.28); cp.position.set((r() - 0.5) * 1.1, 1.1, (r() - 0.5) * 0.7); cp.rotation.set((r() - 0.5) * 0.8, r() * 6, (r() - 0.5) * 0.8); cart.add(cp); }
      const halo = glowSprite(k % 2 ? 0xFF6A3C : 0xFFC400, 3.4, 0.6); halo.position.y = 1.3; cart.add(halo);
      cart.scale.setScalar(1.25); cart.position.set(0, CT, zc); G.add(cart); carts.push(cart);
    }
    trains.push({ carts, zc, xL: xL - 9, xR: xR + 9, dir, ph: r() });
  }
  // FLOATING CRYSTALS hovering in the gap, turning and bobbing, each with a faint halo.
  const floaters = [], FIM = [new InstancedMesh(kinds[1], crystalMat, 16), new InstancedMesh(kinds[4], crystalMat, 16)];
  for (let i = 0; i < 32; i++) {
    const z = 10 - r() * (10 - end + 4), sp = spanAt(z), x = sp[0] - 3.8 + r() * (sp[1] - sp[0] + 7.6), y = -12 + r() * 13;
    const near = courseTopNear(x, z, 2.2);
    if (near !== null && y > near - 2.5) continue;                              // never in front of the road
    const size = 0.7 + r() * 1.6, hue = (r() < 0.5 ? CANYON_YELLOWS : CANYON_REDS)[Math.floor(r() * 3)], im = FIM[i % 2], k = floaters.filter((f) => f.im === im).length;
    if (k >= 16) continue;
    im.setColorAt(k, col.setHex(hue));
    const halo = glowSprite(hue, size * 3.2, 0.28); halo.position.set(x, y, z); G.add(halo);
    floaters.push({ im, k, x, y, z, size, ax: new Vector3(r() - 0.5, 1, r() - 0.5).normalize(), sp: 0.3 + r() * 0.6, ph: r() * 6.3, halo });
  }
  for (const im of FIM) { im.count = floaters.filter((f) => f.im === im).length; G.add(im); }
  // FALLS OF MOLTEN LIGHT pouring from cracks in the near cliff faces, down into the depths.
  const pourT = canvasTex(32, 256, (g) => {
    const rr = seeded(41);
    for (let i = 0; i < 60; i++) { const x = rr() * 32, y = rr() * 256, ln = 20 + rr() * 70; const lg = g.createLinearGradient(0, y, 0, y + ln); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, `rgba(255,255,255,${0.35 + rr() * 0.6})`); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = lg; g.fillRect(x, y, 1.5 + rr() * 3, ln); g.fillRect(x, y - 256, 1.5 + rr() * 3, ln); }
  }, true);
  const pours = [];
  for (let i = 0, z = 4; z > end + 4 && i < 8; i++, z -= 12 + r() * 6) {
    const sp = spanAt(z), sd = i % 2 ? 1 : -1, x = (sd < 0 ? sp[0] : sp[1]) + sd * 4.4, top = 1 + r() * 5, h = top + 44, hue = i % 3 ? 0xFFB020 : 0xFF5A24;
    const pm = new MeshBasicMaterial({ map: pourT.clone(), color: hue, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false });
    pm.map.repeat.set(1, h / 16);
    const pour = new Mesh(new PlaneGeometry(1.8, h), pm); pour.position.set(x, top - h / 2, z); pour.rotation.y = Math.PI / 2; G.add(pour);
    const src = glowSprite(hue, 3.2, 0.9); src.position.set(x, top, z); G.add(src);
    pours.push({ pm, src, ph: r() * 6 });
  }
  // FIREFLIES in swarms under the road, swirling.
  const NS = 9, PER = 26, ffArr = new Float32Array(NS * PER * 3), ffCol = new Float32Array(NS * PER * 3), swarms = [];
  for (let k = 0; k < NS; k++) {
    const z = 6 - (k + 0.5) / NS * (6 - end), sp = spanAt(z);
    swarms.push({ x: (sp[0] + sp[1]) / 2 + (k % 2 ? 1 : -1) * (sp[1] - sp[0]) * 0.5, y: Math.min(-2.5, minTop - 2.5) - r() * 3, z, rx: 2 + r() * 2.5, sp: 0.2 + r() * 0.3, ph: r() * 6.3,
                  bits: Array.from({ length: PER }, () => ({ a: r() * 6.3, b: r() * 6.3, rad: 0.5 + r() * 1.8, w: 0.8 + r() * 1.6 })) });
    for (let j = 0; j < PER; j++) { col.setHex(r() < 0.6 ? 0xC8FF5A : 0xFFE45A); ffCol.set([col.r, col.g, col.b], (k * PER + j) * 3); }
  }
  const ffGeo = new BufferGeometry(); ffGeo.setAttribute('position', new Float32BufferAttribute(ffArr, 3).setUsage(DynamicDrawUsage)); ffGeo.setAttribute('color', new Float32BufferAttribute(ffCol, 3));
  const fireflies = new Points(ffGeo, new PointsMaterial({ size: 0.42, map: dot, vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  fireflies.frustumCulled = false; G.add(fireflies);
  // BATS: flocks swooping and jinking through the canyon below the road, dark against the glowing crystals.
  const batGeo = (() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([0, 0, 0.15, -0.35, 0.05, 0.1, -0.75, 0.12, -0.15, -0.5, 0, -0.1, -0.3, 0.02, -0.2, 0, 0, -0.15,
                                                            0, 0, 0.15, 0.35, 0.05, 0.1, 0.75, 0.12, -0.15, 0.5, 0, -0.1, 0.3, 0.02, -0.2, 0, 0, -0.15], 3));
    g.setIndex([0, 1, 5, 1, 2, 3, 1, 3, 4, 1, 4, 5, 6, 11, 7, 7, 9, 8, 7, 10, 9, 7, 11, 10]);
    g.computeVertexNormals();
    return g;
  })();
  const NBAT = 30, bats = new InstancedMesh(batGeo, new MeshBasicMaterial({ color: 0x0A0606, side: DoubleSide }), NBAT), colonies = [];
  for (let i = 0; i < NBAT; i++) {
    const f = Math.floor(i / 10);
    if (!colonies[f]) colonies[f] = { z0: 4 - (f + 0.5) / 3 * (4 - end), y: Math.min(-3, minTop - 3) - r() * 4, sp: 0.5 + r() * 0.3, ph: r() * 6.3 };
    colonies[f].b = (colonies[f].b || []).concat([{ i, dx: (r() - 0.5) * 3, dy: (r() - 0.5) * 1.6, dz: (r() - 0.5) * 3, ph: r() * 6.3, flap: 14 + r() * 6 }]);
  }
  G.add(bats);
  // LIGHTNING leaping between the crystals beside the road: now and then a crackling arc, flickering, then gone.
  const SEGS = 14, arcs = [];
  const arcCore = new MeshBasicMaterial({ color: 0xFFF6D8, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false });
  const arcGlow = new MeshBasicMaterial({ color: 0xFFB040, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false });
  const ribbon = (mat) => {
    const g = new BufferGeometry(), idx = [];
    g.setAttribute('position', new Float32BufferAttribute(new Float32Array((SEGS + 1) * 6), 3).setUsage(DynamicDrawUsage));
    for (let k = 0; k < SEGS; k++) { const i2 = k * 2; idx.push(i2, i2 + 1, i2 + 2, i2 + 1, i2 + 3, i2 + 2); }
    g.setIndex(idx);
    const mm = new Mesh(g, mat); mm.frustumCulled = false; mm.visible = false; G.add(mm); return mm;
  };
  for (let i = 0; i < tipsBeside.length && arcs.length < 16; i++) {
    const A = tipsBeside[i], B = tipsBeside.find((t2, j) => j > i && t2[3] === A[3] && Math.abs(t2[2] - A[2]) > 2.5 && Math.abs(t2[2] - A[2]) < 9);
    if (!B) continue;
    const fA = glowSprite(0xFFD890, 2.2, 0), fB = glowSprite(0xFFD890, 2.2, 0); fA.position.set(A[0], A[1], A[2]); fB.position.set(B[0], B[1], B[2]); G.add(fA, fB);
    arcs.push({ A, B, core: ribbon(arcCore), glow: ribbon(arcGlow), fA, fB, period: 2.2 + r() * 3.5, ph: r() * 6, jag: -1 });
  }
  const _ap = new Vector3(), _ad = new Vector3(), _ac = new Vector3(), _an = new Vector3();
  const jagArc = (Ar, core, glow) => {                    // a fresh crooked path from A to B, bowed up a little
    const pts = [];
    for (let k = 0; k <= SEGS; k++) {
      const u = k / SEGS, j = k === 0 || k === SEGS ? 0 : 0.38;
      pts.push(new Vector3(Ar.A[0] + (Ar.B[0] - Ar.A[0]) * u + (r() - 0.5) * j, Ar.A[1] + Math.sin(Math.PI * u) * 1.1 + (r() - 0.5) * j, Ar.A[2] + (Ar.B[2] - Ar.A[2]) * u + (r() - 0.5) * j));
    }
    for (const [mesh, wd] of [[core, 0.07], [glow, 0.5]]) {
      const arr = mesh.geometry.attributes.position.array;
      pts.forEach((pt, k) => {
        _ad.subVectors(pts[Math.min(SEGS, k + 1)], pts[Math.max(0, k - 1)]).normalize();
        _ac.subVectors(camera.position, pt).normalize();
        _an.crossVectors(_ad, _ac).normalize().multiplyScalar(wd / 2);
        arr.set([pt.x + _an.x, pt.y + _an.y, pt.z + _an.z, pt.x - _an.x, pt.y - _an.y, pt.z - _an.z], k * 6);
      });
      mesh.geometry.attributes.position.needsUpdate = true;
    }
  };
  // JELLYFISH OF LIGHT rising slowly out of the depths beside the road, bells pulsing, tendrils trailing.
  const bellGeo = new SphereGeometry(1, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), tentGeo = new PlaneGeometry(0.22, 2.6, 1, 6);
  tentGeo.translate(0, -1.3, 0);
  const bellT = canvasTex(64, 64, (g) => { const rg = g.createRadialGradient(32, 24, 2, 32, 32, 36); rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(0.55, 'rgba(255,255,255,0.3)'); rg.addColorStop(0.9, 'rgba(255,255,255,0.75)'); rg.addColorStop(1, 'rgba(255,255,255,0.2)'); g.fillStyle = rg; g.fillRect(0, 0, 64, 64); });
  const tentT = canvasTex(16, 128, (g) => { const lg = g.createLinearGradient(0, 0, 0, 128); lg.addColorStop(0, 'rgba(255,255,255,0.95)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = lg; g.fillRect(6, 0, 4, 128); });
  const jellyHues = [0x7CFFB0, 0xFFE070, 0xFF8A5A];
  const bellMats = jellyHues.map((h) => new MeshBasicMaterial({ map: bellT, color: h, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }));
  const tentMats = jellyHues.map((h) => new MeshBasicMaterial({ map: tentT, color: h, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }));
  const jellies = [];
  for (let i = 0; i < 12; i++) {
    const z = 2 - (i + 0.5) / 12 * (2 - end), sp = spanAt(z), sd = i % 2 ? 1 : -1, x = (sd < 0 ? sp[0] : sp[1]) + sd * (1.4 + r() * 1.8), h2 = i % 3;
    const near = courseTopNear(x, z, 1.6), topY = (near === null ? 0 : near) - 1.8;
    const grp = new Group(), bell = new Mesh(bellGeo, bellMats[h2]); grp.add(bell);
    const tents = [];
    for (let k = 0; k < 6; k++) { const tm = new Mesh(tentGeo, tentMats[h2]); const a2 = (k / 6) * 6.28; tm.position.set(Math.cos(a2) * 0.55, 0.05, Math.sin(a2) * 0.55); tm.rotation.y = -a2; grp.add(tm); tents.push(tm); }
    const glow = glowSprite(jellyHues[h2], 5, 0.3); glow.position.y = 0.2; grp.add(glow);
    grp.scale.setScalar(0.8 + r() * 0.5); G.add(grp);
    jellies.push({ grp, bell, tents, x, z, y: topY - r() * 18, topY, ph: r() * 6.3, rate: 1.1 + r() * 0.5 });
  }
  // RIFTS: small wormholes torn open in the cliff faces, spinning, drawing streams of light in.
  const rifts = [];
  for (let i = 0, z = -5; z > end + 4 && i < 7; i++, z -= 11 + r() * 5) {
    const sp = spanAt(z), sd = i % 2 ? -1 : 1, x = (sd < 0 ? sp[0] : sp[1]) + sd * 4.2, y = -2.5 - r() * 4, rad = 1.1 + r() * 0.5;
    const disc = new Mesh(new CircleGeometry(rad, 48), glowMat(0xFFFFFF, 0.95, vortexTex)); disc.material.side = DoubleSide;
    const ring = new Mesh(new TorusGeometry(rad, 0.08, 8, 48), new MeshBasicMaterial({ color: 0xEFE6FF, toneMapped: false }));
    const halo = glowSprite(0xA78BFF, rad * 4.5, 0.5);
    for (const o of [disc, ring]) { o.position.set(x, y, z); o.rotation.y = -sd * Math.PI / 2; G.add(o); }
    halo.position.set(x - sd * 0.2, y, z); G.add(halo);
    rifts.push({ disc, x, y, z, sd, rad, spin: (i % 2 ? 1 : -1) * 1.6 });
  }
  const PR = 28, rArr = new Float32Array(Math.max(1, rifts.length) * PR * 3), rCol = new Float32Array(Math.max(1, rifts.length) * PR * 3);
  for (let i = 0; i < rArr.length / 3; i++) { col.setHex(i % 3 ? 0xD8C8FF : 0xFFFFFF); rCol.set([col.r, col.g, col.b], i * 3); }
  const rGeo = new BufferGeometry(); rGeo.setAttribute('position', new Float32BufferAttribute(rArr, 3).setUsage(DynamicDrawUsage)); rGeo.setAttribute('color', new Float32BufferAttribute(rCol, 3));
  const riftSparks = new Points(rGeo, new PointsMaterial({ size: 0.26, map: dot, vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  riftSparks.frustumCulled = false; G.add(riftSparks);
  // SPARK GEYSERS: vents on ledges below the road, each erupting now and then, the sparks falling back short of the road.
  const vents = [];
  for (let i = 0; i < VENT_Z.length; i++) {
    const z = VENT_Z[i], sp = spanAt(z), sd = i % 2 ? 1 : -1, x = (sd < 0 ? sp[0] : sp[1]) + sd * (1.8 + r() * 1.2), y = Math.min(-8, minTop - 8);
    const ledge = new Mesh(rocks[i % 3], rockMat); ledge.scale.set(1.6, 0.6, 1.4); ledge.position.set(x, y - 0.4, z); G.add(ledge);
    const flash = glowSprite(0xFFD24A, 5, 0); flash.position.set(x, y + 0.6, z); G.add(flash);
    vents.push({ x, y, z, period: 3.5 + r() * 2, ph: r() * 5, flash, fired: -1 });
  }
  const NG = 360, gArr = new Float32Array(NG * 3), gVel = new Float32Array(NG * 3), gLife = new Float32Array(NG);
  for (let i = 0; i < NG; i++) gArr[i * 3 + 1] = -999;
  const gGeo = new BufferGeometry(); gGeo.setAttribute('position', new Float32BufferAttribute(gArr, 3).setUsage(DynamicDrawUsage));
  const sparks = new Points(gGeo, new PointsMaterial({ size: 0.36, map: dot, color: 0xFFC24A, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  sparks.frustumCulled = false; G.add(sparks);
  let gNext = 0;
  let t = 0;
  w.tick = (dt) => {
    if (REDUCED) return;
    t += dt; lifeT.value = t;
    for (const T of trains) {                             // carts: across and away into the rock, round again
      const L = T.xR - T.xL;
      T.carts.forEach((c, k) => { const u = ((T.ph * L + t * 4.2 * T.dir - k * 2.6 * T.dir) % L + L) % L; c.position.x = T.xL + u; c.rotation.y = T.dir > 0 ? 0 : Math.PI; c.position.y = CT + Math.abs(Math.sin(t * 9 + k)) * 0.03; });
    }
    for (const F of floaters) {                           // floaters: turning slowly, bobbing
      q.setFromAxisAngle(F.ax, t * F.sp + F.ph); const by = Math.sin(t * 0.8 + F.ph) * 0.45;
      m.compose(pos.set(F.x, F.y + by, F.z), q, sc.set(F.size * 0.5, F.size, F.size * 0.5)); F.im.setMatrixAt(F.k, m); F.halo.position.y = F.y + by;
    }
    q.identity(); for (const im of FIM) im.instanceMatrix.needsUpdate = true;
    for (const P of pours) { P.pm.map.offset.y = t * 1.6 + P.ph; P.src.material.opacity = 0.75 + 0.2 * Math.sin(t * 7 + P.ph); }
    for (const C of colonies) {                            // bats: a figure-of-eight through the gap, jinking
      const a2 = t * C.sp + C.ph, sp = spanAt(C.z0), cx = (sp[0] + sp[1]) / 2, hw = (sp[1] - sp[0]) / 2 + 3.5;
      for (const B of C.b) {
        const jx = Math.sin(t * 3.1 + B.ph) * 0.6, jy = Math.sin(t * 4.3 + B.ph) * 0.4;
        const x = cx + Math.sin(a2) * hw + B.dx + jx, z = C.z0 + Math.sin(a2 * 2) * 9 + B.dz, y = C.y + B.dy + jy;
        const yaw = Math.atan2(Math.cos(a2) * hw, Math.cos(a2 * 2) * 18);
        q.setFromEuler(e.set(0, yaw, Math.sin(a2) * 0.4)); const fl = 0.25 + 0.75 * Math.abs(Math.sin(t * B.flap + B.ph));
        m.compose(pos.set(x, y, z), q, sc.set(1.3, fl * 1.3, 1.3)); bats.setMatrixAt(B.i, m);
      }
    }
    q.identity(); bats.instanceMatrix.needsUpdate = true;
    for (const Ar of arcs) {                               // lightning: on for a moment every few seconds, re-crooked as it crackles
      const u = ((t + Ar.ph) % Ar.period), on = u < 0.42 && (u < 0.12 || u > 0.18);
      Ar.core.visible = Ar.glow.visible = on;
      const fl = on ? 0.9 : Math.max(0, 0.6 - (u - 0.42) * 3);
      Ar.fA.material.opacity = Ar.fB.material.opacity = u < 0.42 ? 0.9 : Math.max(0, fl);
      if (on) { const j = Math.floor(u / 0.06); if (j !== Ar.jag) { Ar.jag = j; jagArc(Ar, Ar.core, Ar.glow); } }
    }
    for (const J of jellies) {                             // jellyfish: a slow rise that surges with each pulse of the bell, then round again
      const pulse = Math.sin(t * J.rate * 2.4 + J.ph), squeeze = 0.5 + 0.5 * pulse;
      J.y += dt * (0.25 + 0.75 * Math.max(0, pulse));
      if (J.y > J.topY) J.y = J.topY - 20;
      J.grp.position.set(J.x + Math.sin(t * 0.4 + J.ph) * 0.5, J.y, J.z + Math.cos(t * 0.33 + J.ph) * 0.5);
      J.bell.scale.set(1 - 0.22 * squeeze, 0.75 + 0.3 * squeeze, 1 - 0.22 * squeeze);
      J.tents.forEach((tm, k) => { tm.rotation.x = Math.sin(t * 2 + J.ph + k) * 0.25; tm.scale.y = 0.85 + 0.2 * (1 - squeeze); });
      J.grp.visible = J.y > J.topY - 19.5;
    }
    const ra = rGeo.attributes.position.array;             // rifts: spinning, and light spiralling in
    rifts.forEach((Rf, i) => {
      Rf.disc.rotation.z = t * Rf.spin;
      for (let k = 0; k < PR; k++) {
        const u = ((t * 0.55 + k / PR) % 1), rr = Rf.rad * (0.2 + 2.6 * (1 - u)), a2 = k * 2.4 + u * 7 * Math.sign(Rf.spin), idx = (i * PR + k) * 3;
        ra[idx] = Rf.x - Rf.sd * (0.15 + (1 - u) * 0.6); ra[idx + 1] = Rf.y + Math.sin(a2) * rr; ra[idx + 2] = Rf.z + Math.cos(a2) * rr;
      }
    });
    rGeo.attributes.position.needsUpdate = true;
    const fa = ffGeo.attributes.position.array;           // fireflies: each swarm drifts, each fly loops round its middle
    swarms.forEach((S, k) => {
      const cx = S.x + Math.sin(t * S.sp + S.ph) * S.rx, cz = S.z + Math.cos(t * S.sp * 0.7 + S.ph) * 3;
      S.bits.forEach((B, j) => { const i3 = (k * PER + j) * 3, a2 = t * B.w + B.a; fa[i3] = cx + Math.cos(a2) * B.rad; fa[i3 + 1] = S.y + Math.sin(a2 * 1.3 + B.b) * B.rad * 0.6; fa[i3 + 2] = cz + Math.sin(a2) * B.rad; });
    });
    ffGeo.attributes.position.needsUpdate = true;
    for (const V of vents) {                              // geysers: a flash, a fountain of sparks
      const cyc = Math.floor((t + V.ph) / V.period), u = ((t + V.ph) % V.period);
      V.flash.material.opacity = u < 0.5 ? (1 - u / 0.5) * 0.9 : 0;
      if (cyc !== V.fired) {
        V.fired = cyc;
        for (let n = 0; n < 90; n++) { const i = gNext; gNext = (gNext + 1) % NG; gArr[i * 3] = V.x; gArr[i * 3 + 1] = V.y + 0.4; gArr[i * 3 + 2] = V.z; const a2 = r() * 6.3, sp2 = r() * 1.8; gVel[i * 3] = Math.cos(a2) * sp2; gVel[i * 3 + 1] = 7.5 + r() * 2.5; gVel[i * 3 + 2] = Math.sin(a2) * sp2; gLife[i] = 1.5 + r() * 0.6; }
      }
    }
    for (let i = 0; i < NG; i++) {
      if (gLife[i] <= 0) continue;
      gLife[i] -= dt; gVel[i * 3 + 1] -= 10 * dt;
      gArr[i * 3] += gVel[i * 3] * dt; gArr[i * 3 + 1] += gVel[i * 3 + 1] * dt; gArr[i * 3 + 2] += gVel[i * 3 + 2] * dt;
      if (gLife[i] <= 0) gArr[i * 3 + 1] = -999;
    }
    gGeo.attributes.position.needsUpdate = true;
    const a = moteGeo.attributes.position.array;
    for (let i = 0; i < nMotes; i++) { a[i * 3 + 1] += dt * (0.3 + (i % 7) * 0.07); a[i * 3] += Math.sin(t * 0.7 + i) * dt * 0.15; if (a[i * 3 + 1] > 2) a[i * 3 + 1] = -40; }
    moteGeo.attributes.position.needsUpdate = true;
    flow.offset.y -= dt * 0.35;
    crystalMat.emissiveIntensity = 1.55 + 0.12 * Math.sin(t * 0.9);
  };
  w.restyle = () => {
    const top = new MeshStandardMaterial({ color: 0x060A06, metalness: 0.35, roughness: 0.14, envMap: env, envMapIntensity: 1,
      emissive: 0xFFFFFF, emissiveMap: facetTex(), emissiveIntensity: 1.4 });
    const sideMat = new MeshStandardMaterial({ color: 0x0A140A, metalness: 0.45, roughness: 0.3, emissive: 0x3CFF6A, emissiveIntensity: 0.32 });
    const under = new MeshStandardMaterial({ color: 0x040504, roughness: 1 });
    for (const c of colliders) { if (c.obstacle) continue; c.mesh.material = [sideMat, sideMat, top, under, sideMat, sideMat]; setTopUV(c.mesh, false); }
  };
});
const d0 = new Vector3();

// ---- 2. Toy blocks in the sky: a course of coloured blocks, block islands, big clouds, a candy marble ----
const blockMat = new MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.5 });
const BLOCK_PAIRS = [[0xFF7FA8, 0xFFA24C], [0x3FD0C9, 0xFFD84D], [0xB48CFF, 0xFF7FA8], [0xFFA24C, 0x3FD0C9], [0x5FB8FF, 0xFFD84D]];
function blockPiece(c, pair) {
  const hx = c.half.x, hz = c.half.z;
  const nx = Math.max(1, Math.round(hx * 2 / 1.1)), nz = Math.max(1, Math.round(hz * 2 / 1.1));
  const sx = hx * 2 / nx, sz = hz * 2 / nz;
  const im = new InstancedMesh(new RoundedBoxGeometry(sx * 0.97, c.half.y * 2, sz * 0.97, 2, 0.09), blockMat, nx * nz);
  const m = new Matrix4(), col = new Color();
  let k = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    m.makeTranslation(-hx + sx * (i + 0.5), 0, -hz + sz * (j + 0.5));
    im.setMatrixAt(k, m); im.setColorAt(k, col.setHex(pair[(i + j) % 2])); k++;
  }
  im.castShadow = true; im.receiveShadow = true;
  return im;
}
WORLDS_ADD('blocks', (w) => {
  scene.background = gradientTex([[0, '#4FBDFF'], [0.45, '#8FDAFF'], [0.8, '#E2F5FF'], [1, '#FFE6F1']]);
  scene.fog.color.setHex(0xD9F1FF); scene.fog.near = 40; scene.fog.far = 210;
  hemi.color.setHex(0xE0F6FF); hemi.groundColor.setHex(0xFFD1E6); hemi.intensity = 1.5;
  sun.color.setHex(0xFFFFFF); sun.intensity = 3.0;
  w.marble = 'candy';
  const G = w.group, r = seeded(21);
  // Floating islands and towers of blocks, all one draw.
  const N = 260, cols = [0xFF7FA8, 0xFFA24C, 0x3FD0C9, 0xFFD84D, 0xB48CFF, 0x5FB8FF];
  const im = new InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 2, 0.08), blockMat, N);
  const m = new Matrix4(), col = new Color(), q = new Quaternion(), pos = new Vector3(), sc = new Vector3();
  let k = 0;
  const spots = [];
  for (let i = 0; i < 26; i++) {
    const x = (r() < 0.5 ? -1 : 1) * (10 + r() * 45) + 3, z = 12 - r() * 130, y = -28 + r() * 34;
    spots.push([x, y, z, 2 + Math.floor(r() * 4), 1 + Math.floor(r() * 3), r() < 0.25]);
  }
  for (const [x, y, z, a, b, tower] of spots) {
    const cA = cols[Math.floor(r() * cols.length)], cB = cols[Math.floor(r() * cols.length)];
    for (let i = 0; i < a && k < N; i++) for (let j = 0; j < b && k < N; j++) {
      const h = tower ? 3 + Math.floor(r() * 8) : 1;
      pos.set(x + i * 2.1, y - h / 2, z - j * 2.1); sc.set(2, h, 2);
      m.compose(pos, q, sc); im.setMatrixAt(k, m); im.setColorAt(k, col.setHex((i + j) % 2 ? cA : cB)); k++;
    }
  }
  im.count = k; im.castShadow = true; G.add(im);
  // A striped ball floating off to one side, as in the owner's picture.
  const ballTex = canvasTex(256, 128, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#FF9CC4' : '#FF6FA6'; g.fillRect(0, i * 16, 256, 16); } });
  const ball = new Mesh(new SphereGeometry(7, 32, 16), new MeshStandardMaterial({ map: ballTex, roughness: 0.5 }));
  ball.position.set(38, 8, -70); ball.rotation.z = 0.4; G.add(ball);
  const ct = cloudTex();
  for (const [x, y, z, s] of [[-26, 10, -60, 34], [30, 16, -110, 46], [-60, 22, -150, 56], [14, -24, -30, 26], [-30, -18, -20, 24], [48, -10, -44, 30], [70, 26, -180, 60]]) {
    const sp = new Sprite(new SpriteMaterial({ map: ct, transparent: true, depthWrite: false }));
    sp.scale.set(s, s / 2, 1); sp.position.set(x, y, z); G.add(sp);
  }
  w.restyle = () => {
    colliders.forEach((c, i) => { c.mesh.material = HIDDEN; addDeco(c, blockPiece(c, BLOCK_PAIRS[i % BLOCK_PAIRS.length])); });
  };
});

// ---- 3. Neon city: glowing towers below, lit cubes in the air, a glass course with a grid, a chrome marble ----
/* THE CITY ALIVE (owner, 2026-09-26: "Now let's bring the city to life"). Three
   things move, all kept quiet enough that the eye stays on the marble, and
   none of them moves for a player who has asked for reduced motion:
     windows  each lit row of each tower goes dark now and then and comes
              back, at its own random moment, as a city does at night
     cubes    the lit cubes in the air bob and turn, slowly
     trail    a thin ribbon of light runs behind the marble and fades within
              half a second: a bright core in a tight feather (DESIGN-SYSTEM 6)
   #neon-still on the link keeps the city as it was, to compare. */
let neonLive = true;
const cityTime = { value: 0 };
function flickerWindows(mat, seed) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = cityTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vInst;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\n  vInst = float(gl_InstanceID);\n#else\n  vInst = 0.0;\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vInst;\nuniform float uTime;\nfloat cityHash(float n) { return fract(sin(n) * 43758.5453); }')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    // One row of windows is one 12px band of the stripe texture.
    float row = floor(vEmissiveMapUv.y * 256.0 / 12.0);
    float h = cityHash(vInst * 17.13 + row * 3.71 + ${seed.toFixed(1)});
    float cycle = floor(uTime * (0.10 + h * 0.22) + h * 13.0);
    float on = step(0.14, cityHash(h * 91.7 + cycle * 7.3));
    totalEmissiveRadiance *= mix(0.1, 1.0, on);
  }`);
  };
  mat.customProgramCacheKey = () => 'city-windows-' + seed;
}
const TRAIL_N = 40;
let lastTrail = null;                                   // for the harness
function makeTrail() {
  const geo = new BufferGeometry();
  const pos = new Float32BufferAttribute(new Float32Array(TRAIL_N * 6), 3).setUsage(DynamicDrawUsage);
  const uv = new Float32BufferAttribute(new Float32Array(TRAIL_N * 4), 2).setUsage(DynamicDrawUsage);
  geo.setAttribute('position', pos); geo.setAttribute('uv', uv);
  const idx = [];
  for (let i = 0; i < TRAIL_N - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  geo.setIndex(idx); geo.setDrawRange(0, 0);
  // Across the ribbon: a bright core and a tight feather. Along it: bright at
  // the head, gone at the tail. Additive, so black is simply no light.
  const tex = canvasTex(64, 64, (g) => {
    const img = g.createImageData(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const u = Math.abs(x / 63 - 0.5) * 2, head = Math.pow(1 - y / 63, 1.4);
      const v = Math.min(1, Math.exp(-u * u * 40) + Math.exp(-u * u * 6) * 0.55) * head * 255;
      const k = (y * 64 + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  // Cyan, so it never reads as one more line of the course's magenta grid.
  const mesh = new Mesh(geo, new MeshBasicMaterial({ map: tex, color: 0x3FE8FF, transparent: true, blending: AdditiveBlending,
                                                     depthWrite: false, side: DoubleSide, toneMapped: false }));
  mesh.frustumCulled = false;
  const pts = [];
  function update() {
    const now = performance.now() / 1000, rolling = state === 'play' || state === 'fall';
    const x = ball.p.x, y = ball.p.y - R + 0.03, z = ball.p.z;
    if (!rolling) pts.length = 0;
    else {
      // Lay a point each time the marble has gone 8 cm past the last one laid.
      // (Moving the newest point along with the marble instead meant a marble
      // slower than about 5 m/s never laid a second point: no trail at all.)
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(x - last.x, y - last.y, z - last.z) > 0.08) pts.push({ x, y, z, t: now });
    }
    while (pts.length && now - pts[0].t > 0.5) pts.shift();
    while (pts.length > TRAIL_N - 1) pts.shift();
    // The ribbon runs from the oldest point laid to the marble itself.
    const line = rolling ? pts.concat([{ x, y, z, t: now }]) : pts;
    const n = line.length;
    if (n < 2) { geo.setDrawRange(0, 0); return; }
    const P = pos.array, U = uv.array, half = 0.26;
    for (let i = 0; i < n; i++) {
      const a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)], p = line[i];
      let dx = b.x - a.x, dz = b.z - a.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      P[i * 6] = p.x - dz * half; P[i * 6 + 1] = p.y; P[i * 6 + 2] = p.z + dx * half;
      P[i * 6 + 3] = p.x + dz * half; P[i * 6 + 4] = p.y; P[i * 6 + 5] = p.z - dx * half;
      const v = i / (n - 1);                                   // 0 at the tail, 1 at the head
      U[i * 4] = 0; U[i * 4 + 1] = v; U[i * 4 + 2] = 1; U[i * 4 + 3] = v;
    }
    pos.needsUpdate = true; uv.needsUpdate = true;
    geo.setDrawRange(0, (n - 1) * 6);
  }
  lastTrail = { mesh, geo, pts };
  return { mesh, update };
}

/* A FUTURISTIC CITY (owner, 2026-09-26: "can the floating cubes move? Can
   there be moving floating cars? some other objects that make this look like
   a futuristic city"). Everything that moves keeps to where it cannot hide
   the course: traffic flies just above the rooftops and under the course, the
   train runs under the narrow bridge in a gap kept free of towers, and the
   billboards stand beside the course, never over it. */
const TRAIN_Z = -26;                                    // the train's line, kept clear of towers
// Where the course ends (it runs along -z), so the city reaches past it.
function courseEnd() {
  let z = 0;
  for (const p of level ? level.pieces : []) z = Math.min(z, p.t === 'ramp' ? p.z1 : p.z - p.d / 2);
  return z;
}
/* A body lofted along x through rounded-rectangle sections: prof(t) gives each
   section's half-width, top and bottom, for t from 0 (the back, -x) to 1 (the
   front, +x). UVs run u along the body and v round the section from its
   bottom (0.25 the right side, 0.5 the top, 0.75 the left). */
function loft(len, prof, stations, around) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= stations; i++) {
    const t = i / stations, x = -len / 2 + t * len, p = prof(t);
    for (let j = 0; j <= around; j++) {
      const a = j / around, th = a * Math.PI * 2 - Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
      const z = Math.sign(c) * Math.pow(Math.abs(c), 0.55), y = Math.sign(s) * Math.pow(Math.abs(s), 0.55);
      pos.push(x, p.bot + (y + 1) / 2 * (p.top - p.bot), z * p.w);
      uv.push(t, a);
    }
  }
  const ring = around + 1;
  for (let i = 0; i < stations; i++) for (let j = 0; j < around; j++) {
    const k = i * ring + j;
    idx.push(k, k + ring, k + 1, k + 1, k + ring, k + ring + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/* The sky train as one model, for the city's line and for the train you ride.
   Its length runs along x, the front at +x. */
const TRAIN_LEN = 30, TRAIN_NOSE = 6;
function trainModel(env) {
  // The sky train: ONE body, lofted from nose to nose. Pearl white, a dark
  // skirt, a cyan line along each side, windows on the sides only, a
  // windscreen wrapped over each nose, white lights at the front and red at
  // the back, and a cyan glow underneath where it floats over the track.
  const TL = TRAIN_LEN, NOSE = TRAIN_NOSE;
  const trainProf = (t) => {
    const d = Math.min(t, 1 - t) * TL;
    if (d >= NOSE) return { w: 0.9, top: 1.0, bot: -0.8 };
    const k = d / NOSE, round = Math.sqrt(1 - (1 - k) * (1 - k));   // the roof sweeps down to a low tip
    return { w: 0.9 * (0.02 + 0.98 * Math.sqrt(k)), top: -0.62 + 1.62 * round, bot: -0.8 + 0.2 * (1 - k) * (1 - k) };
  };
  // Texture space: u runs along the train (0 the back, 1 the front), v round
  // its section from the bottom (0.25 the right side, 0.5 the roof, 0.75 the left).
  const W = 2048, H = 256, noseU = NOSE / TL;
  const band = (g, v0, v1, fill, u0 = 0, u1 = 1) => { g.fillStyle = fill; g.fillRect(u0 * W, (1 - v1) * H, (u1 - u0) * W, (v1 - v0) * H); };
  const sides = [[0.253, 0.305], [0.695, 0.747]], stripes = [[0.222, 0.238], [0.762, 0.778]];
  const trainMap = canvasTex(W, H, (g) => {
    band(g, 0, 1, '#EEF2F8');
    band(g, 0, 0.17, '#2A3244'); band(g, 0.83, 1, '#2A3244');                     // the dark skirt
    for (const [a, b] of stripes) band(g, a, b, '#34C9E0');
    for (const [a, b] of sides) {
      band(g, a, b, '#16203A', noseU + 0.015, 1 - noseU - 0.015);                  // the window band, sides only
      for (let x = (noseU + 0.03) * W, i = 0; x < (1 - noseU - 0.03) * W - 60; x += 92, i++) {
        g.fillStyle = i % 5 === 2 ? '#0B1224' : '#BFEFFF';                         // every fifth a door
        g.fillRect(x, (1 - b) * H + 2, 64, (b - a) * H - 4);
      }
    }
    for (const [u0, u1] of [[0.04, noseU - 0.012], [1 - noseU + 0.012, 0.96]]) {  // windscreens over the noses
      const gr = g.createLinearGradient(0, 0.25 * H, 0, 0.75 * H);
      gr.addColorStop(0, '#0E1626'); gr.addColorStop(0.5, '#3A4C70'); gr.addColorStop(1, '#0E1626');
      g.fillStyle = gr; g.fillRect(u0 * W, 0.28 * H, (u1 - u0) * W, 0.44 * H);
    }
  });
  const trainGlow = canvasTex(W, H, (g) => {
    band(g, 0, 1, '#000');
    for (const [a, b] of stripes) band(g, a, b, '#1FA8C0');
    for (const [a, b] of sides) for (let x = (noseU + 0.03) * W, i = 0; x < (1 - noseU - 0.03) * W - 60; x += 92, i++) {
      if (i % 5 === 2) continue;
      g.fillStyle = '#9FEFFF'; g.fillRect(x, (1 - b) * H + 2, 64, (b - a) * H - 4);
    }
    for (const v of [0.21, 0.79]) {                                               // headlights and tail lights
      g.fillStyle = '#FFFFFF'; g.fillRect(0.975 * W, (1 - v - 0.02) * H, 0.018 * W, 0.04 * H);
      g.fillStyle = '#FF2D48'; g.fillRect(0.007 * W, (1 - v - 0.02) * H, 0.018 * W, 0.04 * H);
    }
  });
  const train = new Group();
  train.userData.maps = [trainMap, trainGlow];
  const trainBody = new Mesh(loft(TL, trainProf, 90, 36), new MeshStandardMaterial({ map: trainMap, emissive: 0xFFFFFF, emissiveMap: trainGlow,
    emissiveIntensity: 1.1, metalness: 0.35, roughness: 0.3, envMap: env }));
  train.add(trainBody);
  const glowTex = canvasTex(64, 64, (g) => {
    const lg = g.createLinearGradient(0, 0, 0, 64);
    lg.addColorStop(0, 'rgba(0,0,0,1)'); lg.addColorStop(0.5, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = lg; g.fillRect(0, 0, 64, 64);
  });
  const hover = new Mesh(new PlaneGeometry(TL - 8, 1.1), new MeshBasicMaterial({ map: glowTex, color: 0x34E0FF, transparent: true,
    blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  hover.rotation.x = -Math.PI / 2; hover.position.y = -0.92; train.add(hover);
  train.userData.maps.push(glowTex);
  return train;
}

/* A flying car's parts: a lofted body in its own paint, a dark glass canopy,
   LED strips across the nose and the tail, a soft cone of light ahead and a
   glow underneath. The city draws many at once with instancing; a crossing
   draws a few as plain meshes. Lights, after the owner's note that the first
   headlights read as "small white squares": a thin strip across the nose, and
   the cone spilling ahead, which is what reads as "lights on" from above. */
const carProf = (t) => {                                // t: 0 at the tail, 1 at the nose
  const kn = Math.min(1, (1 - t) * 2.3 / 0.95), kt = Math.min(1, t * 2.3 / 0.3);
  const rn = Math.sqrt(1 - (1 - kn) * (1 - kn)), rt = Math.sqrt(1 - (1 - kt) * (1 - kt));
  return { w: 0.52 * (0.25 + 0.75 * Math.sqrt(kn)) * (0.6 + 0.4 * rt), top: -0.12 + 0.32 * rn * (0.7 + 0.3 * rt), bot: -0.2 + 0.06 * (1 - kn) };
};
// Where each part sits on a car, in the car's own frame (x forward).
const carPart = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0) =>
  new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(rx, 0, 0)), new Vector3(sx, sy, sz));
const CAR_AT = {
  canopy: carPart(-0.1, 0.17, 0, 0.8, 0.36, 0.5), head: carPart(0.95, -0.06, 0), tail: carPart(-1.155, 0.0, 0),
  beam: carPart(2.25, -0.08, 0, 1, 1, 1, -Math.PI / 2), tailGlow: carPart(-1.45, -0.02, 0, 1, 1, 1, -Math.PI / 2),
  under: carPart(0, -0.27, 0, 1, 1, 1, -Math.PI / 2),
};
const CAR_PAINT = [0xF2F4F8, 0x9FB4D8, 0xFF8A3D, 0xFFD23F, 0x2EC4B6, 0xE63946, 0xB8C0CC];
function carKit(env) {
  const coneTex = canvasTex(128, 64, (g) => {
    const img = g.createImageData(128, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
      const u = x / 127, v = (y / 63 - 0.5), half = 0.1 + 0.36 * u;
      const k = Math.exp(-(v / half) * (v / half) * 3) * Math.pow(1 - u, 1.6) * Math.min(1, u / 0.06) * 150;
      const i = (y * 128 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = k; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  return {
    body: loft(2.3, carProf, 22, 18),
    paint: (color) => new MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.28, envMap: env }),
    canopy: new SphereGeometry(0.5, 18, 10),
    canopyMat: new MeshStandardMaterial({ color: 0x0A1222, metalness: 0.9, roughness: 0.08, envMap: env, envMapIntensity: 1.4 }),
    head: new BoxGeometry(0.05, 0.04, 0.44), headMat: new MeshBasicMaterial({ color: 0xEAF6FF, toneMapped: false }),
    tail: new BoxGeometry(0.04, 0.05, 0.5), tailMat: new MeshBasicMaterial({ color: 0xFF2D48, toneMapped: false }),
    beam: new PlaneGeometry(2.6, 1.6), beamMat: new MeshBasicMaterial({ map: coneTex, color: 0xDDF2FF, transparent: true,
      blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    tailGlow: new PlaneGeometry(0.9, 0.7), tailGlowMat: new MeshBasicMaterial({ map: dot, color: 0xFF2D48, transparent: true,
      opacity: 0.8, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }),
    under: new PlaneGeometry(1.9, 1.0),
    underMat: (color) => new MeshBasicMaterial({ map: dot, color, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
  };
}
function futureCity(G, tops, r) {
  const m = new Matrix4(), q = new Quaternion(), pos = new Vector3(), sc = new Vector3(), up = new Vector3(0, 1, 0);
  /* THE OWNER'S NOTES ON THE FIRST CITY (2026-09-26): the train had windows on
     its roof and was "4 similar solids stuck to each other"; the cars were
     "solids with one end glowing"; every billboard showed the same ad. So the
     train is one lofted body with a nose at each end and windows on its sides
     only, the cars are shaped with a canopy and lights, and each billboard
     carries its own ad. */
  const env = neonEnvMap() || envTex;

  // Flying cars: a shaped body in its own paint, a dark glass canopy, two
  // headlights, two taillights, and a glow underneath.
  const end = courseEnd(), far = Math.min(-110, end - 60);
  const lanes = [
    { axis: 'z', at: -7, y: -3.2, dir: -1, from: 30, to: far }, { axis: 'z', at: -11.5, y: -4.6, dir: 1, from: 30, to: far },
    { axis: 'z', at: 13, y: -3.6, dir: 1, from: 30, to: far },  { axis: 'z', at: 17.5, y: -4.8, dir: -1, from: 30, to: far },
    { axis: 'x', at: -17, y: -3.0, dir: 1, from: -37, to: 43 },  { axis: 'x', at: -37, y: -4.4, dir: -1, from: -37, to: 43 },
    { axis: 'x', at: -52, y: -3.4, dir: 1, from: -37, to: 43 },
  ];
  for (let z = -74, i = 0; z > end - 20; z -= 22, i++) {                      // cross traffic all along a long course
    lanes.push({ axis: 'x', at: z, y: [-3.0, -4.4, -3.4][i % 3], dir: i % 2 ? 1 : -1, from: -37, to: 43 });
  }
  const cars = [], zCars = Math.max(4, Math.round((30 - far) / 35));
  lanes.forEach((l) => { const n = l.axis === 'z' ? zCars : 3; for (let i = 0; i < n; i++) cars.push({ l, u: (i + r() * 0.6) / n, v: 9 + r() * 7 }); });
  const N = cars.length, K = carKit(env);
  const body = new InstancedMesh(K.body, K.paint(0xFFFFFF), N);
  const canopy = new InstancedMesh(K.canopy, K.canopyMat, N);
  const heads = new InstancedMesh(K.head, K.headMat, N), tails = new InstancedMesh(K.tail, K.tailMat, N);
  const beams = new InstancedMesh(K.beam, K.beamMat, N), tailGlow = new InstancedMesh(K.tailGlow, K.tailGlowMat, N);
  const under = new InstancedMesh(K.under, K.underMat(0xFFFFFF), N);
  const colr = new Color();
  cars.forEach((c, i) => {
    body.setColorAt(i, colr.setHex(CAR_PAINT[i % CAR_PAINT.length]));
    under.setColorAt(i, colr.setHex(i % 3 ? 0x34E0FF : 0xFF8A5C));
  });
  G.add(body, canopy, heads, tails, under, beams, tailGlow);
  const P_CANOPY = CAR_AT.canopy, P_HEAD = CAR_AT.head, P_TAIL = CAR_AT.tail;
  const P_BEAM = CAR_AT.beam, P_TAILGLOW = CAR_AT.tailGlow, P_UNDER = CAR_AT.under;
  const carM = new Matrix4(), one = new Vector3(1, 1, 1);
  function placeCars() {
    cars.forEach((c, i) => {
      // dir 1 runs from 'from' to 'to', dir -1 the other way; the car faces the way it goes.
      const L = c.l, span = L.to - L.from, f = ((c.u % 1) + 1) % 1, s = L.dir > 0 ? L.from + f * span : L.to - f * span;
      const dx = L.axis === 'x' ? Math.sign(span) * L.dir : 0, dz = L.axis === 'z' ? Math.sign(span) * L.dir : 0;
      q.setFromAxisAngle(up, Math.atan2(-dz, dx));
      carM.compose(pos.set(L.axis === 'x' ? s : L.at, L.y, L.axis === 'z' ? s : L.at), q, one);
      body.setMatrixAt(i, carM);
      canopy.setMatrixAt(i, m.multiplyMatrices(carM, P_CANOPY));
      under.setMatrixAt(i, m.multiplyMatrices(carM, P_UNDER));
      heads.setMatrixAt(i, m.multiplyMatrices(carM, P_HEAD));
      tails.setMatrixAt(i, m.multiplyMatrices(carM, P_TAIL));
      beams.setMatrixAt(i, m.multiplyMatrices(carM, P_BEAM));
      tailGlow.setMatrixAt(i, m.multiplyMatrices(carM, P_TAILGLOW));
    });
    for (const im of [body, canopy, heads, tails, under, beams, tailGlow]) im.instanceMatrix.needsUpdate = true;
  }
  placeCars();

  const train = trainModel(env);
  train.position.set(-95, -5, TRAIN_Z); G.add(train);
  cityRefs.train = train;
  cityRefs.cars = () => cars.map((c) => { body.getMatrixAt(cars.indexOf(c), m); return new Vector3().setFromMatrixPosition(m).toArray(); });
  /* THE GUIDEWAY (owner: "futuristic rails with a faint glow rather than just
     a black strip"). A rounded gunmetal beam that takes the city's reflections,
     a faint cyan line along each side, two cyan guide rails along its top in a
     soft glow, and dashes of light running along them the way the train goes.
     Cyan, the train's colour: magenta belongs to the course alone, or the eye
     would read the track as more course. */
  const beamGlow = canvasTex(8, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 8, 256);
    g.fillStyle = '#34E0FF'; for (const v of [0.25, 0.75]) g.fillRect(0, (1 - v) * 256 - 1.5, 8, 3);
  });
  const beam = new Mesh(loft(260, () => ({ w: 0.55, top: 0.22, bot: -0.42 }), 2, 24), new MeshStandardMaterial({
    color: 0x1A2233, metalness: 0.65, roughness: 0.3, envMap: env, emissive: 0xFFFFFF, emissiveMap: beamGlow, emissiveIntensity: 0.55 }));
  beam.position.set(3, -6.2, TRAIN_Z); G.add(beam);
  const railTex = canvasTex(256, 4, (g) => {
    g.fillStyle = '#2A9FB4'; g.fillRect(0, 0, 256, 4);
    g.fillStyle = '#D8FCFF'; g.fillRect(20, 0, 26, 4); g.fillRect(150, 0, 10, 4);
  }, true);
  railTex.repeat.set(260 / 8, 1);                      // one run of dashes every 8 m
  const railMat = new MeshBasicMaterial({ map: railTex, toneMapped: false });
  for (const z of [-0.36, 0.36]) {
    const rail = new Mesh(new BoxGeometry(260, 0.05, 0.07), railMat);
    rail.position.set(3, -5.96, TRAIN_Z + z); G.add(rail);
  }
  const railHalo = canvasTex(8, 128, (g) => {          // a thin core in a tight feather round each rail
    const img = g.createImageData(8, 128);
    for (let y = 0; y < 128; y++) {
      const v = y / 127, d = Math.min(Math.abs(v - 0.243), Math.abs(v - 0.757));
      const k = Math.min(1, Math.exp(-d * d * 9000) + Math.exp(-d * d * 600) * 0.35) * 255;
      for (let x = 0; x < 8; x++) { const i = (y * 8 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = k; img.data[i + 3] = 255; }
    }
    g.putImageData(img, 0, 0);
  });
  const halo = new Mesh(new PlaneGeometry(260, 1.5), new MeshBasicMaterial({ map: railHalo, color: 0x34E0FF, transparent: true,
    opacity: 0.55, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.set(3, -5.93, TRAIN_Z); G.add(halo);
  const pylonMat = new MeshStandardMaterial({ color: 0x141B2E, metalness: 0.5, roughness: 0.45, envMap: env });
  const capMat = new MeshBasicMaterial({ color: 0x34E0FF, toneMapped: false });
  for (let x = -120; x <= 120; x += 16) {
    const pylon = new Mesh(new BoxGeometry(0.7, 60, 0.7), pylonMat);
    pylon.position.set(x, -36.4, TRAIN_Z); G.add(pylon);
    const cap = new Mesh(new BoxGeometry(0.95, 0.06, 0.95), capMat);      // where each support meets the beam
    cap.position.set(x, -6.64, TRAIN_Z); G.add(cap);
  }
  cityRefs.railTex = railTex;

  // Hologram billboards beside the course: five different ads, each its own
  // colour and drawing, no words and no brands.
  const adBase = (g, h1, h2) => {
    const lg = g.createLinearGradient(0, 0, 256, 144);
    lg.addColorStop(0, `hsla(${h1},100%,58%,0.6)`); lg.addColorStop(1, `hsla(${h2},100%,52%,0.28)`);
    g.fillStyle = lg; g.fillRect(0, 0, 256, 144);
    g.strokeStyle = 'rgba(255,255,255,0.92)'; g.fillStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
  };
  const scan = (g) => { for (let y = 0; y < 144; y += 4) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y, 256, 1); } };
  const ADS = [
    { hue: [300, 250], draw(g) {                          // music: a speaker and a level meter
      g.beginPath(); g.arc(70, 72, 38, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(70, 72, 16, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 7; i++) { const h = 20 + ((i * 37) % 60); g.fillRect(132 + i * 16, 110 - h, 10, h); }
    } },
    { hue: [200, 260], draw(g) {                          // space travel: a ringed planet and a rocket's arc
      g.beginPath(); g.arc(92, 76, 30, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.ellipse(92, 76, 58, 14, -0.3, 0, Math.PI * 2); g.stroke();
      g.setLineDash([2, 12]); g.beginPath(); g.moveTo(150, 120); g.quadraticCurveTo(200, 30, 236, 28); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(236, 28, 6, 0, Math.PI * 2); g.fill();
    } },
    { hue: [20, 350], scroll: true, draw(g) {             // speed: chevrons that run across it
      for (let x = -40; x < 300; x += 44) { g.beginPath(); g.moveTo(x, 36); g.lineTo(x + 26, 72); g.lineTo(x, 108); g.stroke(); }
    } },
    { hue: [35, 10], draw(g) {                            // a cafe: a cup with steam rising
      g.beginPath(); g.moveTo(88, 62); g.lineTo(96, 116); g.lineTo(150, 116); g.lineTo(158, 62); g.closePath(); g.stroke();
      g.beginPath(); g.arc(166, 86, 14, -1.2, 1.2); g.stroke();
      for (const x of [104, 123, 142]) { g.beginPath(); g.moveTo(x, 50); g.bezierCurveTo(x - 10, 38, x + 10, 30, x, 16); g.stroke(); }
    } },
    { hue: [150, 190], draw(g) {                          // health: a heartbeat line and a pulse dot
      g.beginPath(); g.moveTo(10, 80); g.lineTo(80, 80); g.lineTo(96, 40); g.lineTo(114, 116); g.lineTo(132, 60); g.lineTo(146, 80); g.lineTo(246, 80); g.stroke();
      g.beginPath(); g.arc(214, 80, 9, 0, Math.PI * 2); g.fill();
    } },
  ];
  const boards = [], boardsAt = [[-12, -1.5, -12, 0.5], [18, -2.5, -20, -0.5], [-11, -3, -40, 0.45], [16, -1, -52, -0.45], [-14, -4, -64, 0.4]];
  for (let z = -78, i = 0; z > end - 10; z -= 13 + r() * 5, i++) {           // and on, beside a long course, clear of the train
    if (Math.abs(z - TRAIN_Z) < 8) continue;
    const left = i % 2 === 1;
    boardsAt.push([left ? -11 - r() * 3 : 16 + r() * 2, -1 - r() * 3, z, (left ? 1 : -1) * (0.4 + r() * 0.1)]);
  }
  boardsAt.forEach(([x, y, z, turn], i) => {
    const ad = ADS[i % ADS.length];
    const t = canvasTex(256, 144, (g) => { adBase(g, ad.hue[0], ad.hue[1]); ad.draw(g); scan(g); }, !!ad.scroll);
    const b = new Mesh(new PlaneGeometry(7, 3.94), new MeshBasicMaterial({ map: t, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }));
    b.position.set(x, y, z); b.rotation.y = turn; G.add(b); boards.push({ b, t, ph: r() * 6, scroll: !!ad.scroll });
  });

  // Red lights blinking on the tallest towers.
  const tall = tops.filter((t) => t.y > -16).slice(0, 36);
  const lamps = new InstancedMesh(new SphereGeometry(0.35, 8, 6), new MeshBasicMaterial({ color: 0xFFFFFF }), Math.max(1, tall.length));
  const lampCol = new Color(), lampPh = tall.map(() => r() * 3);
  tall.forEach((t, i) => { m.compose(pos.set(t.x, t.y + 0.4, t.z), q.identity(), sc.set(1, 1, 1)); lamps.setMatrixAt(i, m); lamps.setColorAt(i, lampCol.setHex(0xFF2D48)); });
  lamps.count = tall.length; G.add(lamps);
  return (dt, t) => {
    if (cityRefs.frozen) return;
    for (const c of cars) c.u += c.v * dt / Math.abs(c.l.to - c.l.from);
    placeCars();
    train.position.x += 14 * dt;
    if (train.position.x > 110) train.position.x = -110;
    railTex.offset.x -= dt * 0.9;                       // light running along the rails, the way the train goes
    for (const bd of boards) { if (bd.scroll) bd.t.offset.x = -t * 0.35; bd.b.material.opacity = 0.84 + 0.16 * Math.sin(t * 2 + bd.ph); }
    tall.forEach((_, i) => lamps.setColorAt(i, lampCol.setHex(((t + lampPh[i]) % 1.6) < 0.35 ? 0xFF2D48 : 0x2A060C)));
    if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
  };
}

function stripeTex() {
  return canvasTex(64, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 64, 256);
    const r = seeded(31);
    for (let y = 6; y < 256; y += 12) { g.fillStyle = `rgba(255,255,255,${0.55 + r() * 0.45})`; g.fillRect(4, y, 56, 4); }
  });
}
WORLDS_ADD('neon', (w) => {
  scene.background = gradientTex([[0, '#05040C'], [0.35, '#140A26'], [0.62, '#3A1238'], [0.8, '#7A2A3A'], [1, '#1A0B22']]);
  scene.fog.color.setHex(0x160A24); scene.fog.near = 25; scene.fog.far = 175;
  hemi.color.setHex(0x4A3A8A); hemi.groundColor.setHex(0x0A0612); hemi.intensity = 0.7;
  sun.color.setHex(0xB8C8FF); sun.intensity = 1.3;
  w.marble = 'chrome'; w.rings = [0x34E0FF, 0xFF6A3C]; w.glowGates = true;
  const G = w.group, r = seeded(41), stripes = stripeTex();
  const box = new BoxGeometry(1, 1, 1);
  const towerA = new MeshStandardMaterial({ color: 0x0B1020, roughness: 0.6, emissive: 0x34E0FF, emissiveMap: stripes, emissiveIntensity: 1.3 });
  const towerB = new MeshStandardMaterial({ color: 0x0B1020, roughness: 0.6, emissive: 0xFF6A3C, emissiveMap: stripes, emissiveIntensity: 1.3 });
  const live = neonLive && !REDUCED;
  if (live) { flickerWindows(towerA, 0); flickerWindows(towerB, 57); }
  // The city runs 150 m past the end of the course, where the fog closes.
  const end = courseEnd(), cityEnd = Math.min(-210, end - 150), rExt = seeded(43), rOld = r;
  const cap = Math.round(250 + (26 - cityEnd) * 1.4);
  const A = new InstancedMesh(box, towerA, cap), B = new InstancedMesh(box, towerB, cap);
  const m = new Matrix4(), q = new Quaternion(), pos = new Vector3(), sc = new Vector3();
  let a = 0, b = 0;
  const tops = [];
  for (let x = -80; x <= 86; x += 7) for (let z = 26; z >= cityEnd; z -= 7) {
    const rr = z >= -210 ? r : rExt;                              // past the first 210 m, a stream of its own
    if (rr() < 0.35) continue;
    if (Math.abs(z - TRAIN_Z) < 5) continue;                      // the train's line
    const nearCourse = x > -10 && x < 18 && z > Math.min(-60, end - 10);   // low under the course, all the way along
    const top = nearCourse ? -12 - rr() * 20 : -6 - rr() * 26 + (Math.abs(x - 3) > 40 ? rr() * 20 : 0);
    const h = top + 70, wdt = 3 + rr() * 3;
    pos.set(x + rr() * 2, top - h / 2, z + rr() * 2); sc.set(wdt, h, 3 + rr() * 3); m.compose(pos, q, sc);
    tops.push({ x: pos.x, y: top, z: pos.z });
    if (rr() < 0.55 && a < cap) A.setMatrixAt(a++, m); else if (b < cap) B.setMatrixAt(b++, m);
  }
  A.count = a; B.count = b; G.add(A, B);
  // Lit cubes hanging in the air.
  // Lit and shaded, so their faces show which way they turn (the owner: "some
  // shade and light so the dimension can be seen"), with rounded edges to
  // catch the light, and still glowing in their own colour.
  const cubeMat = new MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.35, metalness: 0.2, emissive: 0xFFFFFF, emissiveIntensity: 0.4,
                                             envMap: neonEnvMap() || envTex, envMapIntensity: 0.6 });
  cubeMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#if defined( USE_INSTANCING_COLOR ) || defined( USE_COLOR )\n  totalEmissiveRadiance *= vColor.rgb;\n#endif');
  };
  cubeMat.customProgramCacheKey = () => 'lit-cubes';
  const more = Math.max(0, Math.round((-153 - (end - 30)) / 2.1));   // more cubes along a long course
  const cubes = new InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 2, 0.12), cubeMat, 70 + more), col = new Color();
  const hang = [];
  for (let i = 0; i < 70 + more; i++) {
    const r = i < 70 ? rOld : rExt;
    pos.set(-40 + r() * 90, -18 + r() * 30, i < 70 ? -8 - r() * 145 : -153 + (end - 30 + 153) * r());
    // Under the course wherever it runs, orbit and all, so none can hide it.
    if (pos.x > -12 && pos.x < 20 && pos.z > Math.min(-50, end - 10) && pos.y > -4) pos.y = Math.min(pos.y - 12, -4.5);
    if (pos.z > -30 && Math.abs(pos.x - 3) < 15) pos.x += pos.x < 3 ? -12 : 12;   // nothing swimming into the camera
    const s = 0.4 + r() * 1.2; sc.set(s, s, s);
    const rx = r() * 3, ry = r() * 3;
    q.setFromEuler(new Euler(rx, ry, 0)); m.compose(pos, q, sc);
    cubes.setMatrixAt(i, m); cubes.setColorAt(i, col.setHex(r() < 0.5 ? 0x5FF0FF : 0xFF8A5C));
    hang.push({ x: pos.x, y: pos.y, z: pos.z, s, rx, ry, ph: r() * 6.3, spin: 0.15 + r() * 0.35, bob: 0.3 + r() * 0.5,
                orbit: 1.5 + r() * 4, rate: (0.12 + r() * 0.18) * (r() < 0.5 ? -1 : 1) });
  }
  q.identity(); G.add(cubes);
  const trail = live ? makeTrail() : null;
  if (trail) G.add(trail.mesh);
  const cityMoves = futureCity(G, tops, r);
  const e = new Euler();
  w.tick = (dt) => {
    if (!live) return;
    cityTime.value += dt;
    const t = cityTime.value;
    for (let i = 0; i < hang.length; i++) {
      const c = hang[i];
      const a = t * c.rate + c.ph;
      pos.set(c.x + Math.cos(a) * c.orbit, c.y + Math.sin(t * 0.6 + c.ph) * c.bob, c.z + Math.sin(a) * c.orbit);
      q.setFromEuler(e.set(c.rx + t * c.spin, c.ry + t * c.spin * 0.7, 0));
      sc.set(c.s, c.s, c.s); m.compose(pos, q, sc); cubes.setMatrixAt(i, m);
    }
    cubes.instanceMatrix.needsUpdate = true;
    trail.update();
    cityMoves(dt, t);
  };
  w.restyle = () => neonCourse(neonStyle);
});

/* THE COURSE IN THE NEON CITY. The owner found it merging into the city: its
   grid was the same cyan as half the towers, and its dark glass as dark as
   their faces. Three ways to lift it out, for a side-by-side sheet:
     grid      as first built: dark glass, a cyan grid
     glowgrid  A: the grid glows in magenta, a colour the city never uses,
               a thin bright core in a tight halo
     edges     B: the slabs' sides are lit, so the course's outline shines;
               the top is calm dark glass with only a faint grid
     frosted   C: a lighter frosted top glowing faintly from within, a thin
               white grid; the course is the brightest surface on screen
   The owner chose A (2026-09-26), so it is the neon course now; the others
   stay on the link (#neon-grid, #neon-edges, #neon-frosted) to compare. */
let neonStyle = 'glowgrid';
function neonGrid(core, halo, haloCol, base = '#000') {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    const lines = (wd, col) => {
      g.fillStyle = col;
      for (const p of [0, 128, 256]) { g.fillRect(0, p - wd / 2, 256, wd); g.fillRect(p - wd / 2, 0, wd, 256); }
    };
    if (halo) { g.filter = `blur(${halo}px)`; lines(halo * 1.6, haloCol); g.filter = 'none'; }
    lines(core, '#FFFFFF');
  }, true);
}
/* Pads that move keep their own colour here too: the same dark glass with a
   pale blue grid, so a moving pad reads as a different thing before it has
   moved. Speed strips and jump pads are plain dark glass with yellow sides,
   under their yellow arrows and rings. Holograms keep their own light. Each
   style's materials are made once and shared by every course. */
const neonMats = {};
function neonCourse(style) {
  neonStyle = style;
  const M = neonMats[style] || (neonMats[style] = neonMaterials(style));
  for (const c of colliders) {
    if (c.holo || c.obstacle) continue;
    // Nothing in the city far below takes a shadow, so the course's slabs casting
    // them was a second drawing of every slab for nothing. The marble's shadow on
    // the course is kept.
    c.mesh.castShadow = false;
    if (c.power) {
      const S = c.power;
      if (S.top) { S.top.dispose(); S.side.dispose(); }
      S.top = M.top.clone(); S.side = M.side.clone(); S.top0 = M.top.emissiveIntensity; S.side0 = M.side.emissiveIntensity; S.fade = false;
      c.mesh.material = [S.side, S.side, S.top, M.under, S.side, S.side]; setTopUV(c.mesh, false);
      continue;
    }
    const [side, top] = c.ferry ? [M.ferrySide, M.ferryTop] : c.pad ? [M.padSide, M.padTop] : c.mag ? [M.magSide, M.padTop]
      : c.lane ? [M.laneSide[c.lane], M.laneTop[c.lane]] : c.cell ? [M.side, M.cellTop] : [M.side, M.top];
    c.mesh.material = [side, side, top, M.under, side, side]; setTopUV(c.mesh, !!c.cell);
  }
  return neonStyle;
}
function neonMaterials(style) {
  const under = new MeshStandardMaterial({ color: 0x080C16, roughness: 1 });
  let top, side;
  if (style === 'glowgrid') {
    /* Contrast (a player, 2026-09-27: "the contrast between the rail and the
       background needs to be adjusted"). Measured on the painted pixels, the
       glass between the lines was exactly as dark as the city round it (1.03:1),
       and a slab's edge that fell between grid lines was not marked at all. So
       the glass has a faint glow of its own, and every slab's sides carry a
       light band, brightest along the top edge, so the course's outline is lit
       wherever it runs (value, not a drawn outline). */
    top = new MeshStandardMaterial({ color: 0x0A0F1E, metalness: 0.4, roughness: 0.3, emissive: 0xFFFFFF,
      emissiveMap: neonGrid(3, 7, 'rgba(255,60,210,0.95)', '#2C0C36'), emissiveIntensity: 1.5 });
    side = new MeshStandardMaterial({ color: 0x140A24, metalness: 0.5, roughness: 0.3, emissive: 0xFFFFFF, emissiveIntensity: 1,
      emissiveMap: canvasTex(8, 64, (g) => {
        const lg = g.createLinearGradient(0, 0, 0, 64);
        lg.addColorStop(0, 'rgb(255,170,240)'); lg.addColorStop(0.1, 'rgb(235,70,200)'); lg.addColorStop(0.4, 'rgb(90,18,80)'); lg.addColorStop(1, 'rgb(16,5,18)');
        g.fillStyle = lg; g.fillRect(0, 0, 8, 64);
      }) });
  } else if (style === 'edges') {
    top = new MeshStandardMaterial({ color: 0x0B1322, metalness: 0.4, roughness: 0.25, emissive: 0x34E0FF,
      emissiveMap: neonGrid(2, 0), emissiveIntensity: 0.22 });
    side = new MeshStandardMaterial({ color: 0xFFD6F4, roughness: 0.4, emissive: 0xFF7FE6, emissiveIntensity: 2.2 });
  } else if (style === 'frosted') {
    const frost = canvasTex(256, 256, (g) => {
      g.fillStyle = '#141E36'; g.fillRect(0, 0, 256, 256);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (const p of [0, 128, 256]) { g.fillRect(0, p - 1, 256, 2); g.fillRect(p - 1, 0, 2, 256); }
    }, true);
    top = new MeshStandardMaterial({ color: 0x4A62A0, metalness: 0.1, roughness: 0.55, emissive: 0xFFFFFF, emissiveMap: frost, emissiveIntensity: 0.95 });
    side = new MeshStandardMaterial({ color: 0x2A3C68, metalness: 0.2, roughness: 0.5, emissive: 0x5F7FFF, emissiveIntensity: 0.4 });
  } else {
    top = new MeshStandardMaterial({ color: 0x0B1322, metalness: 0.4, roughness: 0.25, emissive: 0x34E0FF, emissiveMap: neonGrid(3, 0), emissiveIntensity: 0.9 });
    side = new MeshStandardMaterial({ color: 0x101A30, metalness: 0.5, roughness: 0.3, emissive: 0x6A2AFF, emissiveIntensity: 0.18 });
  }
  return {
    top, side, under,
    ferryTop: new MeshStandardMaterial({ color: 0x0A0F1E, metalness: 0.4, roughness: 0.3, emissive: 0xFFFFFF,
      emissiveMap: neonGrid(3, 7, 'rgba(80,180,255,0.95)', style === 'glowgrid' ? '#0C1C3A' : '#000'), emissiveIntensity: 1.3 }),
    ferrySide: new MeshStandardMaterial({ color: 0x0C1830, metalness: 0.5, roughness: 0.3, emissive: 0x5FB8FF, emissiveIntensity: 0.35 }),
    padTop: new MeshStandardMaterial({ color: 0x0A0F1E, metalness: 0.4, roughness: 0.3 }),
    padSide: new MeshStandardMaterial({ color: 0x1C1606, metalness: 0.5, roughness: 0.3, emissive: PAD_YELLOW, emissiveIntensity: 0.45 }),
    magSide: new MeshStandardMaterial({ color: 0x06141C, metalness: 0.5, roughness: 0.3, emissive: 0x34E0FF, emissiveIntensity: 0.45 }),
    // A lane of a colour lock glows in the colour its curtain gives.
    laneTop: [null, ['rgba(150,255,60,0.95)', '#122A0A'], ['rgba(150,100,255,0.95)', '#1A0E36']].map((l) => l && new MeshStandardMaterial({
      color: 0x0A0F1E, metalness: 0.4, roughness: 0.3, emissive: 0xFFFFFF, emissiveMap: neonGrid(3, 7, l[0], style === 'glowgrid' ? l[1] : '#000'), emissiveIntensity: 1.4 })),
    laneSide: [null, 0xA8FF3E, 0x9D6BFF].map((col) => col && new MeshStandardMaterial({
      color: 0x10131C, metalness: 0.5, roughness: 0.3, emissive: col, emissiveIntensity: 0.4 })),
    // A puzzle square's floor: a tile to a cell, each with its own glowing edge.
    cellTop: new MeshStandardMaterial({ color: 0x0A0F1E, metalness: 0.4, roughness: 0.3, emissive: 0xFFFFFF, emissiveIntensity: 0.8,
      emissiveMap: canvasTex(256, 256, (g) => {
        g.fillStyle = '#2C0C36'; g.fillRect(0, 0, 256, 256);                // the glass's own faint glow, as the course's
        g.filter = 'blur(6px)'; g.strokeStyle = 'rgba(255,60,210,0.9)'; g.lineWidth = 10; g.strokeRect(16, 16, 224, 224);
        g.filter = 'none'; g.strokeStyle = '#FFD6F4'; g.lineWidth = 3; g.strokeRect(16, 16, 224, 224);
        g.fillStyle = 'rgba(255,120,230,0.5)'; for (const [cx, cy] of [[16, 16], [240, 16], [16, 240], [240, 240]]) { g.beginPath(); g.arc(cx, cy, 5, 0, 7); g.fill(); }
      }) }),
  };
}

// ---- 4. Low-poly valley: grassy ledges over trees, sheep and snowy peaks, a faceted marble ----
const valleyY = (x, z) => -46 + 3 * Math.sin(x * 0.05) + 2.5 * Math.cos(z * 0.07) + 1.5 * Math.sin((x + z) * 0.11);
WORLDS_ADD('valley', (w) => {
  scene.background = gradientTex([[0, '#3FE0D6'], [0.5, '#9FF0DE'], [0.85, '#F2F7D8'], [1, '#FFF1CF']]);
  scene.fog.color.setHex(0xCFEFE0); scene.fog.near = 30; scene.fog.far = 230;
  hemi.color.setHex(0xD8FFF6); hemi.groundColor.setHex(0x7BBF5A); hemi.intensity = 1.35;
  sun.color.setHex(0xFFF4DC); sun.intensity = 3.2;
  w.marble = 'faceted';
  const G = w.group, r = seeded(51);
  // The valley floor: faceted, in patches of green and gold.
  const land = new PlaneGeometry(420, 420, 84, 84);
  land.rotateX(-Math.PI / 2);
  const p = land.attributes.position, colours = [], cl = new Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i) - 80;
    p.setY(i, valleyY(x, z) + (r() - 0.5) * 0.8);
    cl.setHex(Math.sin(x * 0.03) + Math.cos(z * 0.04) > 1.1 ? 0xE6D25A : r() < 0.5 ? 0x5CC95A : 0x6FD65F);
    colours.push(cl.r, cl.g, cl.b);
  }
  land.setAttribute('color', new Float32BufferAttribute(colours, 3));
  land.computeVertexNormals();
  const ground = new Mesh(land, new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  ground.position.z = -80; ground.receiveShadow = true; G.add(ground);
  const leaf = new MeshStandardMaterial({ color: 0x5FC83E, roughness: 0.8, flatShading: true });
  const leaf2 = new MeshStandardMaterial({ color: 0x3FA83A, roughness: 0.8, flatShading: true });
  const bark = new MeshStandardMaterial({ color: 0x6B4A32, roughness: 0.9, flatShading: true });
  for (let i = 0; i < 70; i++) {
    const x = -80 + r() * 170, z = 20 - r() * 170, y = valleyY(x, z), s = 1.6 + r() * 1.8;
    if (Math.abs(x - 3) < 14 && z > -60) continue;           // nothing tall right under the course
    const trunk = new Mesh(new CylinderGeometry(0.22 * s, 0.32 * s, 2.4 * s, 5), bark); trunk.position.set(x, y + 1.2 * s, z); G.add(trunk);
    const crown = new Mesh(new IcosahedronGeometry(1.6 * s, 0), i % 3 ? leaf : leaf2); crown.position.set(x, y + 3.2 * s, z); crown.rotation.y = r() * 3; G.add(crown);
  }
  const wool = new MeshStandardMaterial({ color: 0xF6F6F2, roughness: 0.9, flatShading: true });
  const black = new MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  for (let i = 0; i < 16; i++) {
    const x = -40 + r() * 90, z = 5 - r() * 80, y = valleyY(x, z);
    const body = new Mesh(new IcosahedronGeometry(0.9, 0), wool); body.scale.set(1.3, 0.9, 1); body.position.set(x, y + 0.8, z); G.add(body);
    const head = new Mesh(new BoxGeometry(0.5, 0.5, 0.6), black); head.position.set(x + 1.1, y + 1.0, z); G.add(head);
  }
  const rockM = new MeshStandardMaterial({ color: 0x6E7A86, roughness: 0.9, flatShading: true });
  const snow = new MeshStandardMaterial({ color: 0xF4F8FF, roughness: 0.7, flatShading: true });
  for (let i = 0; i < 11; i++) {
    const h = 50 + r() * 50, rad = 28 + r() * 22, x = -190 + i * 38 + r() * 10, z = -230 - r() * 30;
    const peak = new Mesh(new ConeGeometry(rad, h, 7), rockM); peak.position.set(x, -30 + h / 2, z); peak.rotation.y = r() * 3; G.add(peak);
    const cap = new Mesh(new ConeGeometry(rad * 0.34, h * 0.34, 7), snow); cap.position.set(x, -30 + h - h * 0.17 + 0.3, z); cap.rotation.y = peak.rotation.y; G.add(cap);
  }
  const cloudM = new MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.9, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const cx = -50 + r() * 110, cy = 4 + r() * 14, cz = -20 - r() * 110;
    for (let j = 0; j < 3; j++) { if (Math.abs(cx - 3) < 12 && cz > -50) break; const puff = new Mesh(new IcosahedronGeometry(2.4 + r() * 2, 0), cloudM); puff.position.set(cx + j * 3, cy + r(), cz + r() * 2); G.add(puff); }
  }
  w.restyle = () => {
    const grass = new MeshStandardMaterial({ color: 0xB4EC72, roughness: 0.9, flatShading: true });
    const earth = new MeshStandardMaterial({ color: 0xB07A45, roughness: 0.95, flatShading: true });
    const under = new MeshStandardMaterial({ color: 0x8A5A32, roughness: 1 });
    const tuftM = new MeshStandardMaterial({ color: 0x5FC83E, roughness: 0.9, flatShading: true });
    colliders.forEach((c, i) => {
      c.mesh.material = [earth, earth, grass, under, earth, earth];
      const rr = seeded(60 + i), n = Math.round(c.half.z * 2.2);
      for (let k = 0; k < n; k++) for (const sx of [-1, 1]) {
        const t = new Mesh(new ConeGeometry(0.16, 0.45, 4), tuftM);
        t.position.set(sx * (c.half.x - 0.12), c.half.y + 0.18, -c.half.z + (k + rr()) * (c.half.z * 2 / n));
        addDeco(c, t);
      }
    });
  };
});

// ---- 5. Tokyo Drift: the city, the course an elevated rail through its streets ----
/* TOKYO DRIFT (owner, 2026-09-28, of the dystopian city below: "I like this
   even though it is not dystopian. It just feels japanese. We can just call
   this level Tokyo Drift. So now I want you to lean into the Tokyo and
   Japanese iconography and symbolism and fill the world with that visual
   language ... The loop needs to be the same material as the current gold
   rail ... can we make the metro trail a little different than the last
   world?"). So: a scramble crossing where the traffic stops and the crowd
   crosses every way at once; a temple off the avenue (a great gate with its
   giant red lantern, stone lanterns, the main hall, a five-storey pagoda);
   tiled roofs curving up at the eaves on the low buildings; carp streamers on
   the wind; sakura petals drifting across the rail; a festival down a side
   street; the Great Wave on a wall; Tokyo Tower at the avenue's end and Fuji
   on the horizon; a bullet train and a line-green commuter train; the signs
   of an everyday Tokyo street. The link opens it as #tokyo (and #dystopia). */
/* THE DYSTOPIAN CITY (owner, 2026-09-28, of a first try in a Mad Max desert:
   "This is not what I had in mind. I need it to match the richness of the
   first neon city world we build. There need to be more buildings and the
   whole world needs to look like a futuristic dystopia ... lots of buildings,
   not in a desert, but a city landscape and the marble rail is an elevated
   bridge going through the streets of the city. Transportation, monorail
   metros etc. Imagine a dystopian tokyo 500 years into the future", with five
   pictures: a canyon city of lantern-lit markets under mushroom towers; a
   megacity of towers joined by giant tubes, swarms of craft over it; pagodas
   under a hovering ship; white domed towers over an arched monorail and tall
   kanji signboards; a tower of machinery venting smoke into a teal haze).
   The course is an elevated rail down the middle of an avenue, level with the
   sixth or seventh floor: pale concrete, a warm light along each edge.
   Buildings line the avenue on both sides, some below the rail, some towering
   over it: shopfronts at the street, then balconies, glass, white towers,
   soot-black industry. Tall kanji signs stick out into the avenue; screens
   play on the corners. Hover cars fill the street and fly lanes just below
   the rail; two monorails run beside it; a metro crosses under it at the
   side streets; drones patrol; lanterns hang over the market; sakura on the
   pavements, shrines and gardens on the low roofs, stacks venting smoke.
   Dusk: a teal smog that glows warm toward the sunset at the avenue's end. */
// Texture coordinates from the world, for boxes that are never turned, so a
// facade keeps one scale on a block of any size.
function worldMapped(mat, scale, key) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWScale = { value: scale };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWScale;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
  {
    vec4 wq = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      wq = instanceMatrix * wq;
    #endif
    wq = modelMatrix * wq;
    vec3 an = abs(normal);
    vec2 wuv = (an.x > 0.5 ? wq.zy : (an.z > 0.5 ? wq.xy : wq.xz)) * uWScale;
    #ifdef USE_MAP
      vMapUv = wuv;
    #endif
    #ifdef USE_EMISSIVEMAP
      vEmissiveMapUv = wuv;
    #endif
    #ifdef USE_BUMPMAP
      vBumpMapUv = wuv;
    #endif
  }`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}
const birdGeo = (() => {                                  // a bird: two thin wings in a shallow V
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([0, 0, 0.12, -0.55, 0.12, -0.05, 0, 0, -0.12, 0, 0, 0.12, 0.55, 0.12, -0.05, 0, 0, -0.12], 3));
  g.computeVertexNormals();
  return g;
})();
/* HAZE WITH THE SUN IN IT. Far things fade as they do in fog, but into a haze
   that burns brighter the nearer the eye looks toward the low sun, so the
   distance glows and near things stay crisp. The fog's own colour is the haze
   away from the sun. Each frame the sun's direction is carried into the
   camera's view for the shader (this world only: the others keep plain fog). */
const HAZE = { sun: { value: new Vector3(0, 0, -1) }, col: { value: new Color(0xFFB48E) }, k: { value: 3 },
               dir: new Vector3(0.05, 0.06, -1).normalize() };
function hazed(mat) {
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, rd) => {
    prev.call(mat, sh, rd);
    Object.assign(sh.uniforms, { uHazeSun: HAZE.sun, uHazeCol: HAZE.col, uHazeK: HAZE.k });
    sh.vertexShader = sh.vertexShader
      .replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\nvarying vec3 vHazeView;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\n  vHazeView = mvPosition.xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nvarying vec3 vHazeView;\nuniform vec3 uHazeSun, uHazeCol;\nuniform float uHazeK;')
      .replace('#include <fog_fragment>', `#ifdef USE_FOG
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    float hz = pow( max( dot( normalize( vHazeView ), uHazeSun ), 0.0 ), uHazeK );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, mix( fogColor, uHazeCol, hz ), fogFactor );
  #endif`);
  };
  mat.customProgramCacheKey = () => 'haze|' + key;
  return mat;
}
/* THE RAIL'S EDGE LIGHT, drawn by the shader from each slab's own size (its
   halfSize attribute, set in tokyoCourse): a thin warm line a little in from
   each side, in a soft glow. It keeps its width on a slab of any size and
   fades where it would be thinner than a pixel rather than shimmer. */
function edgeGlow(mat, col) {
  const u = { value: new Color(col).multiplyScalar(1.6) };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = u;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 halfSize;\nvarying vec2 vHalf;\nvarying vec2 vSlab;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vHalf = halfSize; vSlab = position.xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uGlow;\nvarying vec2 vHalf;\nvarying vec2 vSlab;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  if ( vHalf.x > 0.5 ) {
    float ex = vHalf.x - abs( vSlab.x ), fe = max( fwidth( ex ), 1e-4 );
    float core = ( 1.0 - smoothstep( 0.045 - fe, 0.045 + fe, abs( ex - 0.3 ) ) ) * clamp( 0.09 / fe, 0.0, 1.0 );
    float halo = exp( -pow( ( ex - 0.3 ) / 0.16, 2.0 ) ) * 0.3;
    totalEmissiveRadiance += uGlow * max( core, halo );
  }`);
  };
  mat.customProgramCacheKey = () => 'edge-glow';
  return mat;
}
function setHalfSize(mesh) {
  const g = mesh.geometry;
  if (g.attributes.halfSize || !g.parameters) return;
  const n = g.attributes.position.count, a = new Float32Array(n * 2), hx = g.parameters.width / 2, hz = g.parameters.depth / 2;
  for (let i = 0; i < n; i++) { a[i * 2] = hx; a[i * 2 + 1] = hz; }
  g.setAttribute('halfSize', new Float32BufferAttribute(a, 2));
}
// Soft blotches that wrap round the edges of a tile, so it repeats without a seam.
function blotches(g, W, H, r, n, r0, r1, cols) {
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * H, rad = r0 + r() * (r1 - r0), c = cols[Math.floor(r() * cols.length)];
    const c0 = `rgba(${c})`, c1 = `rgba(${c.slice(0, c.lastIndexOf(','))},0)`;
    for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) {
      const cx = x + dx, cy = y + dy;
      if (cx + rad < 0 || cx - rad > W || cy + rad < 0 || cy - rad > H) continue;
      const rg = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      rg.addColorStop(0, c0); rg.addColorStop(1, c1);
      g.fillStyle = rg; g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
  }
}
/* Texture coordinates from the world for the city's blocks, with the floors
   counted up from the street, so every storey of every building lines up
   (the street's height changes with the course: STREET is set by each
   build). Sides run the way a reader looks at them, so the words on a
   shopfront never read backwards. */
const STREET = { value: 0 };
function cityMapped(mat, sw, sh, dy) {
  const u = { value: new Vector3(sw, sh, dy) };
  mat.onBeforeCompile = (s) => {
    s.uniforms.uCity = u; s.uniforms.uStreet = STREET;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uCity;\nuniform float uStreet;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
  {
    vec4 wq = vec4( position, 1.0 );
    #ifdef USE_INSTANCING
      wq = instanceMatrix * wq;
    #endif
    wq = modelMatrix * wq;
    vec2 wuv = abs( normal.y ) > 0.5 ? wq.xz * uCity.x
      : vec2( ( abs( normal.x ) > 0.5 ? -sign( normal.x ) * wq.z : sign( normal.z ) * wq.x ) * uCity.x, ( wq.y - uStreet - uCity.z ) * uCity.y );
    #ifdef USE_MAP
      vMapUv = wuv;
    #endif
    #ifdef USE_EMISSIVEMAP
      vEmissiveMapUv = wuv;
    #endif
  }`);
  };
  mat.customProgramCacheKey = () => 'city-mapped';
  return mat;
}
let tokyoEnv = null;
function tokyoEnvMap() {                                   // the smog's teal, the sunset, the city's lights: for chrome and glass
  if (tokyoEnv || !renderer) return tokyoEnv;
  const t = canvasTex(512, 256, (g) => {
    const lg = g.createLinearGradient(0, 0, 0, 256);
    lg.addColorStop(0, '#2A3C44'); lg.addColorStop(0.28, '#5A7E86'); lg.addColorStop(0.44, '#D8A88E'); lg.addColorStop(0.49, '#FFD8B4');
    lg.addColorStop(0.52, '#2C3438'); lg.addColorStop(1, '#0E1214');
    g.fillStyle = lg; g.fillRect(0, 0, 512, 256);
    const r = seeded(5);
    for (let i = 0; i < 90; i++) {                         // the city's lights below the horizon
      g.fillStyle = ['rgba(255,190,120,0.7)', 'rgba(255,214,170,0.7)', 'rgba(120,230,255,0.6)', 'rgba(255,190,120,0.7)'][i % 4];
      g.fillRect(r() * 512, 136 + r() * 100, 2 + r() * 4, 2 + r() * 4);
    }
    const sg = g.createRadialGradient(128, 124, 2, 128, 124, 64);
    sg.addColorStop(0, 'rgba(255,236,210,1)'); sg.addColorStop(1, 'rgba(255,190,140,0)');
    g.fillStyle = sg; g.fillRect(0, 0, 512, 256);
  });
  const pm = new PMREMGenerator(renderer);
  tokyoEnv = pm.fromEquirectangular(t).texture;
  pm.dispose(); t.dispose();
  return tokyoEnv;
}
/* The rail's materials, made once and shared by every course: pale concrete
   in panels of 4 m (nothing fine to shimmer), a warm light along each edge
   and on the lip of each side. Pads that move are steel with a cyan edge;
   speed strips, magnets and colour lanes keep the colours that say what they
   are. */
let tokyoMats = null;
function tokyoCourseMaterials() {
  if (tokyoMats) return tokyoMats;
  const r = seeded(29), env = tokyoEnvMap() || envTex;
  const deck = canvasTex(512, 512, (g) => {
    g.fillStyle = '#CFCAC0'; g.fillRect(0, 0, 512, 512);
    blotches(g, 512, 512, r, 30, 30, 110, ['176,170,160,0.3', '228,224,216,0.3', '150,140,126,0.16']);
    g.fillStyle = 'rgba(120,114,106,0.55)';
    for (let k = 0; k < 4; k++) { g.fillRect(k * 128, 0, 2, 512); g.fillRect(0, k * 128, 512, 2); }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let k = 0; k < 4; k++) { g.fillRect(k * 128 + 2, 0, 1, 512); g.fillRect(0, k * 128 + 2, 512, 1); }
  }, true);
  deck.repeat.set(0.125, 0.125);
  const plate = canvasTex(256, 256, (g) => {               // a moving pad: brushed steel in plates
    g.fillStyle = '#A8B0B4'; g.fillRect(0, 0, 256, 256);
    blotches(g, 256, 256, r, 14, 20, 70, ['200,208,212,0.35', '120,128,132,0.3']);
    g.fillStyle = 'rgba(40,46,50,0.6)'; g.fillRect(0, 0, 256, 3); g.fillRect(0, 0, 3, 256);
  }, true);
  plate.repeat.set(0.5, 0.5);
  const yard = canvasTex(256, 256, (g) => {                // a puzzle square's floor: a slab to a cell, a joint all round
    g.fillStyle = '#C4BEB2'; g.fillRect(0, 0, 256, 256);
    blotches(g, 256, 256, r, 12, 20, 60, ['150,144,134,0.3', '220,214,204,0.3']);
    g.strokeStyle = 'rgba(70,66,60,0.8)'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 248);
    g.strokeStyle = 'rgba(255,236,206,0.6)'; g.lineWidth = 2; g.strokeRect(10, 10, 236, 236);
  });
  const sideT = canvasTex(8, 64, (g) => {
    const lg = g.createLinearGradient(0, 0, 0, 64);
    lg.addColorStop(0, '#F2EEE6'); lg.addColorStop(0.12, '#C8C2B8'); lg.addColorStop(0.6, '#A8A298'); lg.addColorStop(1, '#6E6860');
    g.fillStyle = lg; g.fillRect(0, 0, 8, 64);
  });
  const lip = (col) => canvasTex(8, 64, (g) => {           // light along the top of a side, gone a third of the way down
    const lg = g.createLinearGradient(0, 0, 0, 64);
    lg.addColorStop(0, col); lg.addColorStop(0.1, col); lg.addColorStop(0.3, '#000'); lg.addColorStop(1, '#000');
    g.fillStyle = lg; g.fillRect(0, 0, 8, 64);
  });
  const top = () => hazed(edgeGlow(new MeshStandardMaterial({ map: deck, roughness: 0.78 }), 0xFFE2BC));
  const side = (lipCol, map, color = 0xFFFFFF) => hazed(new MeshStandardMaterial({ map, color, roughness: 0.8, emissive: 0xFFFFFF, emissiveMap: lip(lipCol), emissiveIntensity: 1.4 }));
  tokyoMats = {
    make: { top, side: () => side('#FFE2BC', sideT) },
    top: top(), side: side('#FFE2BC', sideT),
    padTop: hazed(new MeshStandardMaterial({ map: deck, roughness: 0.78 })),
    ferryTop: hazed(edgeGlow(new MeshStandardMaterial({ map: plate, roughness: 0.4, metalness: 0.6, envMap: env, envMapIntensity: 0.6 }), 0x6FE8FF)),
    ferrySide: side('#9FF0FF', null, 0x3E6A80),
    padSide: side('#FFE67A', null, PAD_YELLOW),
    magSide: side('#9FF4FF', null, 0x2FB6D8),
    // A lane of a colour lock has its edge light in the colour its curtain gives.
    laneTop: [null, 0xB6F04C, 0xB48EFF].map((c) => c && hazed(edgeGlow(new MeshStandardMaterial({ map: deck, roughness: 0.78 }), c))),
    laneSide: [null, ['#D8FF9A', 0x8FD83A], ['#D6C4FF', 0x9A6BF0]].map((l) => l && side(l[0], null, l[1])),
    cellTop: hazed(new MeshStandardMaterial({ map: yard, roughness: 0.9 })),
    // The loop in the same gold rail: pale concrete, a warm line a little in from each edge, its low walls lit warm.
    loopTop: (w) => loopTops[w] || (loopTops[w] = hazed(new MeshStandardMaterial({ map: deck, roughness: 0.78, emissive: 0xFFFFFF, emissiveMap: loopLines(w) }))),
    loopWall: hazed(new MeshStandardMaterial({ color: 0xE6DED0, roughness: 0.8, emissive: 0xFFD8A8, emissiveIntensity: 0.35 })),
  };
  return tokyoMats;
}
const loopTops = {};
function loopLines(w) {                                   // across a loop's band (u 0 to w/2 in its uv), a warm line 0.3 m in from each edge
  const t = canvasTex(256, 4, (g) => {
    const img = g.createImageData(256, 4), f0 = 0.3 / w;
    for (let x = 0; x < 256; x++) {
      const f = x / 255, d = Math.min(Math.abs(f - f0), Math.abs(f - (1 - f0))) * w;   // metres from the nearer line
      const k = Math.min(1, Math.exp(-d * d / 0.0025) + Math.exp(-d * d / 0.03) * 0.3) * 255;
      for (let y = 0; y < 4; y++) { const i = (y * 256 + x) * 4; img.data[i] = k; img.data[i + 1] = k * 0.89; img.data[i + 2] = k * 0.74; img.data[i + 3] = 255; }
    }
    g.putImageData(img, 0, 0);
  });
  t.repeat.set(2 / w, 1);
  return t;
}
/* The course in the city. As in the neon city, the slabs cast no shadow. A
   dark road here is a ghost of a road, see-through until its switch is on,
   when it fills in (animateSwitches, S.fade). */
function tokyoCourse() {
  const M = tokyoCourseMaterials();
  for (const c of colliders) {
    if (c.holo || c.obstacle) continue;
    c.mesh.castShadow = false;
    setHalfSize(c.mesh);
    let side, top;
    if (c.power) {
      const S = c.power;
      if (S.top) { S.top.dispose(); S.side.dispose(); }
      S.top = M.make.top(); S.side = M.make.side(); S.top.transparent = S.side.transparent = true; S.fade = true;
      side = S.side; top = S.top;
    } else {
      [side, top] = c.ferry ? [M.ferrySide, M.ferryTop] : c.pad ? [M.padSide, M.padTop] : c.mag ? [M.magSide, M.padTop]
        : c.lane ? [M.laneSide[c.lane], M.laneTop[c.lane]] : c.cell ? [M.side, M.cellTop] : [M.side, M.top];
    }
    c.mesh.material = [side, side, top, side, side, side]; setTopUV(c.mesh, !!c.cell);
  }
  for (const L of loopsIn) loopLook(L, M.loopTop(L.look.w), M.loopWall, 0xFFE2BC);
  tokyoPieces();
}
/* TOKYO'S OWN PIECES (owner, 2026-09-28: "can we make the obstacles and
   challenges on the course more characteristic of this world and different
   than the neon city?"). Every piece keeps its rules, its size and the
   colours that mean something (yellow on the pads, lime and violet at the
   locks, a key's metal, a letter's colour); only its look becomes Tokyo's:
     bollards        red paper lanterns on posts, a pool of their light below
     barriers        the kawaii barricades of Japanese road works: two of the
                     city's mascots holding a red and white board between them
     crates          dark cedar boxes, roped, a character brushed on each
     crossings       level crossings: a little tram line crosses the rail; while
                     it is not safe the crossbuck's red lamps flash by turns and
                     the arms come down, and when it is they go up. 止まれ
                     ("stop") is painted on the road before the line
     hologram roads  paper screens lit from below, flickering like lanterns
     wormholes       torii, sakura swirling in the gate
     roundabouts     a revolving stage, as kabuki has, round a garden of raked
                     gravel, a rock and a stone lantern
     glass tubes     one long paper lantern, lit from inside, the light
                     running along it with the marble
     scanners        a folding screen of gold leaf, a wave and pines painted on
                     it, sliding across the road
     switches        a lacquer button; the lamps along the cable are lanterns
     colour lanes    noren to roll through; the lock a paper screen
     maglev strips   a moving walkway, carrying the marble sideways
     wind            a carp-streamer pole by the road: the carp stand out in a
                     gust and hang in a lull
     jump pads       a taiko drum's head
     speed strips    yellow tactile paving down each edge
     the sky train   a commuter train, as the city's own lines run
     puzzle squares  walls of white plaster over black tiles set in a white
                     lattice (namako walls), dark roof tiles along the top;
                     cedar chests to push; stone bases; paper screens for
                     gates; the turning sections little vermilion bridges.
   The pieces are built as the neon city's; this dresses them after, hiding
   the neon parts and adding its own, and lists what it changed so that
   restoreCourse puts it back for any other world. */
const tkUndo = [], tkTicks = [];
const tkSet = (o, k, v) => { const old = o[k]; o[k] = v; tkUndo.push(() => { o[k] = old; }); };
const tkColor = (c, hex) => { const old = c.getHex(); c.setHex(hex); tkUndo.push(() => c.setHex(old)); };
const tkHide = (...list) => { for (const o of list) if (o && o.visible) { o.visible = false; tkUndo.push(() => { o.visible = true; }); } };
function tkFree(o) {
  o.traverse((k) => {
    if (k.geometry && !k.geometry.userData.keep) k.geometry.dispose();
    for (const m of [].concat(k.material || [])) if (!m.userData.keep) m.dispose();
  });
}
const tkAdd = (parent, o) => { parent.add(o); tkUndo.push(() => { parent.remove(o); tkFree(o); }); return o; };
const tkTick = (f) => { tkTicks.push(f); tkUndo.push(() => { const i = tkTicks.indexOf(f); if (i >= 0) tkTicks.splice(i, 1); }); };
function tkUndoAll() { while (tkUndo.length) tkUndo.pop()(); }
// Several shapes, each placed by a matrix, in one geometry: a colour to each, and texture from one atlas (rect: where its own
// texture lies in the atlas; none, and it takes the atlas's white corner, so its colour is its own).
function atlasModel(parts, white) {
  let n = 0;
  const flat = parts.map(([g0, hex, mtx, rect]) => {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (g !== g0) g0.dispose();
    g.applyMatrix4(mtx); n += g.attributes.position.count;
    return [g, hex, rect];
  });
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), U = new Float32Array(n * 2), col = new Color();
  let o = 0;
  for (const [g, hex, rect] of flat) {
    const k = g.attributes.position.count, uv = g.attributes.uv;
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
    col.setHex(hex);
    for (let i = 0; i < k; i++) {
      const j = o + i;
      C[j * 3] = col.r; C[j * 3 + 1] = col.g; C[j * 3 + 2] = col.b;
      U[j * 2] = rect ? rect[0] + (rect[1] - rect[0]) * uv.getX(i) : white[0];
      U[j * 2 + 1] = rect ? rect[2] + (rect[3] - rect[2]) * uv.getY(i) : white[1];
    }
    o += k; g.dispose();
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new Float32BufferAttribute(N, 3));
  geo.setAttribute('color', new Float32BufferAttribute(C, 3)); geo.setAttribute('uv', new Float32BufferAttribute(U, 2));
  return geo;
}
const VERMILION = 0xE0402A, SUMI = 0x1C1A1A;
/* A torii, its opening `open` wide and `high` to the underside of its tie
   beam, standing on y = 0 (its pillars go on down `below`), facing along z. */
function toriiParts(L, open, high, below = 0, rPil = 0.17) {
  const px = open / 2 + rPil, H = high + 0.5 + below;
  for (const s of [-1, 1]) {
    L.push([new CylinderGeometry(rPil * 0.9, rPil * 1.1, H, 12), VERMILION, placeAt(s * px, H / 2 - below, 0)]);
    L.push([new CylinderGeometry(rPil * 1.25, rPil * 1.25, 0.28, 12), SUMI, placeAt(s * px, 0.14, 0)]);   // the black foot at the road
  }
  const span = 2 * px;
  L.push([new BoxGeometry(span + 0.9, 0.2, 0.18), VERMILION, placeAt(0, high + 0.1, 0)]);                // the tie beam, through the pillars
  L.push([new BoxGeometry(0.16, 0.3, 0.14), VERMILION, placeAt(0, high + 0.35, 0)]);                     // its strut
  L.push([new BoxGeometry(0.44, 0.34, 0.06), SUMI, placeAt(0, high + 0.35, 0.1)]);                        // and the tablet on it
  L.push([new BoxGeometry(span + 1.5, 0.16, 0.3), VERMILION, placeAt(0, high + 0.58, 0)]);
  L.push([new BoxGeometry(span + 1.3, 0.2, 0.36), SUMI, placeAt(0, high + 0.76, 0)]);                    // the black top beam
  for (const s of [-1, 1]) L.push([new BoxGeometry(0.9, 0.18, 0.36), SUMI, placeAt(s * (span / 2 + 0.95), high + 0.84, 0, 0, 0, s * 0.22)]);   // turned up at its ends
}
let tkKitMemo = null;
function tkKit() {
  if (tkKitMemo) return tkKitMemo;
  const env = tokyoEnvMap() || envTex, r = seeded(61);
  const G = (g) => { g.userData.keep = true; return g; };
  const M = (m) => { m.userData.keep = true; return hazed(m); };
  const K = {};
  K.props = M(new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 }));
  K.lit = M(new MeshBasicMaterial({ vertexColors: true }));
  K.stone = M(new MeshStandardMaterial({ color: 0x55524E, roughness: 0.85 }));
  K.wood = M(new MeshStandardMaterial({ color: 0x3E2C20, roughness: 0.7 }));
  K.lacquer = M(new MeshStandardMaterial({ color: SUMI, roughness: 0.3, metalness: 0.2, envMap: env, envMapIntensity: 0.5 }));
  K.vermilion = M(new MeshStandardMaterial({ color: VERMILION, roughness: 0.4, envMap: env, envMapIntensity: 0.4 }));
  K.redLacquer = M(new MeshStandardMaterial({ color: 0xB0241E, roughness: 0.3, metalness: 0.2, envMap: env, envMapIntensity: 0.6 }));
  K.concrete = M(new MeshStandardMaterial({ color: 0x8E8C86, roughness: 0.9 }));
  K.steel = M(new MeshStandardMaterial({ color: 0x9AA2A8, roughness: 0.35, metalness: 0.8, envMap: env }));
  K.yellow = M(new MeshStandardMaterial({ color: 0xF2C230, roughness: 0.5 }));
  K.gold = M(new MeshStandardMaterial({ color: 0xE8C050, metalness: 0.8, roughness: 0.3, envMap: env }));
  K.hoop = G(new TorusGeometry(TUBE_R + 0.06, 0.11, 10, 48)); K.hoopEdge = G(new TorusGeometry(TUBE_R + 0.17, 0.03, 6, 48));   // a glass tube's ends

  // A paper lantern on a post, lit from inside: white paper, ribbed, red at top and bottom, 祭 ("festival") in red on it. White,
  // and bright, so it stands out from the pale rail (red paper measured 1.1:1 against it).
  const lanternT = canvasTex(64, 128, (g) => {
    const lg = g.createLinearGradient(0, 0, 0, 128);
    lg.addColorStop(0, '#F6E2C0'); lg.addColorStop(0.5, '#FFF8EC'); lg.addColorStop(1, '#F6E2C0');
    g.fillStyle = lg; g.fillRect(0, 0, 64, 128);
    g.fillStyle = 'rgba(150,110,70,0.3)'; for (let y = 6; y < 128; y += 10) g.fillRect(0, y, 64, 2);
    g.fillStyle = '#C8202A'; g.fillRect(0, 0, 64, 18); g.fillRect(0, 110, 64, 18);
    g.font = `900 40px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('祭', 16, 64); g.fillText('祭', 48, 64);
  });
  K.postGeo = G(new CylinderGeometry(0.06, 0.075, 0.44, 8).translate(0, 0.22, 0));
  K.lanternGeo = G(new LatheGeometry([[0.11, 0], [0.145, 0.05], [0.158, 0.19], [0.145, 0.33], [0.11, 0.38]].map(([a, b]) => new Vector2(a, b)), 16));
  K.lanternMat = M(new MeshStandardMaterial({ map: lanternT, emissive: 0xFFFFFF, emissiveMap: lanternT, emissiveIntensity: 1.0, roughness: 0.8 }));
  K.capGeo = G(new CylinderGeometry(0.12, 0.12, 0.04, 14));
  K.poolGeo = G(new PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2));
  K.poolMat = M(new MeshBasicMaterial({ map: dot, color: 0xFF9A50, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false }));

  // Cedar boxes, dark, roped, a character brushed on: sake, rice, tea.
  const crateSide = (ch) => canvasTex(128, 128, (g) => {
    g.fillStyle = '#4A3122'; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 32) { g.fillStyle = `rgba(${r() < 0.5 ? '255,220,180,0.06' : '0,0,0,0.12'})`; g.fillRect(0, y, 128, 32); g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, y, 128, 2); }
    g.fillStyle = '#C8AE78'; for (const x of [18, 102]) g.fillRect(x, 0, 8, 128);                  // the rope
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (const x of [18, 102]) for (let y = 0; y < 128; y += 6) g.fillRect(x, y, 8, 2);
    g.fillStyle = '#F4EEE2'; g.font = `900 62px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 64, 68);
  });
  const crateTop = canvasTex(128, 128, (g) => {
    g.fillStyle = '#553A28'; g.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 32) { g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x, 0, 2, 128); }
    g.fillStyle = '#C8AE78'; g.fillRect(18, 0, 8, 128); g.fillRect(102, 0, 8, 128); g.fillRect(0, 60, 128, 8);
  });
  const top = M(new MeshStandardMaterial({ map: crateTop, roughness: 0.8 }));
  K.crateMats = ['酒', '米', '茶'].map((ch) => { const s = M(new MeshStandardMaterial({ map: crateSide(ch), roughness: 0.8 })); return [s, s, top, top, s, s]; });

  // The barricades' atlas: the four mascots' faces, drawn for a sphere (half as wide as tall, round the front), then a board's
  // red and white stripes, then a white corner for everything painted plain.
  const AW = 1024, AH = 768, uvr = (x, y, w, h) => [x / AW, (x + w) / AW, 1 - (y + h) / AH, 1 - y / AH];
  const SKIN = ['#FFFBF2', '#FFC6D7', '#6CC24A', '#FFFDF8'];
  K.atlas = canvasTex(AW, AH, (g) => {
    for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) {        // eyes open, then shut
      g.fillStyle = SKIN[i]; g.fillRect(i * 256, row * 256, 256, 256);
      g.save(); g.translate(i * 256 + 64, row * 256 + 128); g.scale(0.5, 1); MASCOTS[i](g, 78, row === 1, false); g.restore();
    }
    g.fillStyle = '#F4F0EA'; g.fillRect(0, 512, 1024, 128);
    g.fillStyle = '#D42A26';
    for (let x = -128; x < 1100; x += 64) { g.beginPath(); g.moveTo(x, 640); g.lineTo(x + 32, 640); g.lineTo(x + 96, 512); g.lineTo(x + 64, 512); g.closePath(); g.fill(); }
    g.fillStyle = '#FFFFFF'; g.fillRect(960, 704, 64, 64);
  });
  K.faceRect = [0, 1, 2, 3].map((i) => uvr(i * 256 + 2, 2, 252, 252));
  K.shutRect = [0, 1, 2, 3].map((i) => uvr(i * 256 + 2, 258, 252, 252));
  K.stripeRect = uvr(0, 518, 1024, 116);
  K.white = [(992 + 0.5) / AW, 1 - 736 / AH];
  K.atlasMat = M(new MeshStandardMaterial({ vertexColors: true, map: K.atlas, roughness: 0.45 }));

  // A little tram, cream over its line's colour, lit windows, a pantograph on the roof: +x forward, on the rails at y -0.42.
  K.tram = [0xB8305A, 0x1E7A45, 0xC8541A, 0x1E4E9A].map((band) => {   // deep colours and a dark roof: it has to stand out on the pale deck
    const b = [], l = [];
    b.push([new BoxGeometry(2.24, 0.3, 0.96), band, placeAt(0, -0.2, 0)], [new BoxGeometry(2.2, 0.36, 0.94), 0xF2ECDC, placeAt(0, 0.12, 0)],
           [new BoxGeometry(2.14, 0.08, 0.9), 0x34383C, placeAt(0, 0.33, 0)], [new BoxGeometry(2.25, 0.04, 0.97), band, placeAt(0, 0.28, 0)]);
    for (const x of [-0.7, 0.7]) b.push([new BoxGeometry(0.56, 0.08, 0.8), 0x2A2C2E, placeAt(x, -0.38, 0)]);
    for (const x of [-1.11, 1.11]) b.push([new BoxGeometry(0.03, 0.2, 0.7), 0x283038, placeAt(x, 0.13, 0)]);
    for (const s of [-1, 1]) b.push([new BoxGeometry(0.02, 0.26, 0.02), 0x3A3C40, placeAt(s * 0.12, 0.49, 0, 0, 0, s * 0.5)]);
    b.push([new BoxGeometry(0.03, 0.02, 0.5), 0x3A3C40, placeAt(0, 0.6, 0)]);
    l.push([new BoxGeometry(1.86, 0.17, 0.955), 0xE8D2A8, placeAt(-0.02, 0.13, 0)], [new BoxGeometry(0.02, 0.06, 0.14), 0xFFF6DC, placeAt(1.125, -0.13, 0)],
           [new BoxGeometry(0.02, 0.06, 0.14), 0xFF2A30, placeAt(-1.125, -0.13, 0)]);
    return [G(paintedModel(b)), G(paintedModel(l))];
  });

  // Paper: a shoji's lattice over lit paper. Added to the light behind (the hologram roads, the screens of light), dark is clear.
  K.shoji = canvasTex(256, 256, (g) => {
    g.fillStyle = 'rgb(200,172,140)'; g.fillRect(0, 0, 256, 256);
    blotches(g, 256, 256, r, 18, 10, 40, ['255,236,210,0.35', '150,120,90,0.2']);
    g.fillStyle = '#000';
    for (let x = 0; x <= 256; x += 64) g.fillRect(x - 3, 0, 6, 256);
    for (let y = 0; y <= 256; y += 43) g.fillRect(0, y - 3, 256, 6);
    for (const p of [0, 256]) { g.fillRect(p - 7, 0, 14, 256); g.fillRect(0, p - 7, 256, 14); }
  }, true);
  K.shojiField = canvasTex(256, 128, (g) => {                // a gate's screen: three panes by two, a frame round it
    g.fillStyle = 'rgb(210,210,210)'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#000';
    for (const x of [85, 171]) g.fillRect(x - 3, 0, 6, 128);
    g.fillRect(0, 61, 256, 6); g.fillRect(0, 0, 256, 8); g.fillRect(0, 120, 256, 8); g.fillRect(0, 0, 8, 128); g.fillRect(248, 0, 8, 128);
  });
  K.shojiLock = canvasTex(128, 256, (g) => {                 // the lock's screen, lit paper in its colour, a dark lattice
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#3A2A20';
    for (const x of [0, 42, 85, 128]) g.fillRect(x - 4, 0, 8, 256);
    for (let y = 0; y <= 256; y += 51.2) g.fillRect(0, y - 4, 128, 8);
  }, true);

  // Sakura swirling in a torii: pink and white petals in a spiral round a warm glow, dark (clear) outside.
  K.swirl = M(new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, opacity: 0.95,
    map: canvasTex(256, 256, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
      const rg = g.createRadialGradient(128, 128, 4, 128, 128, 124);
      rg.addColorStop(0, 'rgba(255,236,226,0.95)'); rg.addColorStop(0.35, 'rgba(255,140,180,0.55)'); rg.addColorStop(0.8, 'rgba(160,50,110,0.25)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
      for (let arm = 0; arm < 5; arm++) for (let t = 0.08; t < 1; t += 0.035) {
        const a = arm * 1.2566 + t * 5.2, rad = t * 118, x = 128 + Math.cos(a) * rad, y = 128 + Math.sin(a) * rad;
        g.save(); g.translate(x, y); g.rotate(a + 1.2); g.globalAlpha = 0.9 * (1 - t * 0.6);
        g.fillStyle = r() < 0.6 ? '#FFB8D0' : '#FFFFFF'; g.beginPath(); g.ellipse(0, 0, 6 + t * 6, 3 + t * 3, 0, 0, 7); g.fill();
        g.restore();
      }
      g.globalAlpha = 1;
    }) }));

  // The revolving stage: planks of cypress radiating, a groove at each third, a lacquer band at the rim.
  K.stage = M(new MeshStandardMaterial({ roughness: 0.55, map: canvasTex(1024, 1024, (g) => {
    const px = 512 / RB_RO;
    g.fillStyle = '#C8955E'; g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 48; i++) {
      const a0 = i * Math.PI / 24, a1 = a0 + Math.PI / 24;
      g.fillStyle = i % 2 ? '#BE8950' : '#D2A068'; g.beginPath(); g.moveTo(512, 512); g.arc(512, 512, 512, a0, a1); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(60,34,18,0.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(512, 512); g.lineTo(512 + Math.cos(a0) * 512, 512 + Math.sin(a0) * 512); g.stroke();
    }
    g.strokeStyle = 'rgba(60,34,18,0.7)'; g.lineWidth = 5;
    for (let k = 0; k <= 3; k++) { g.beginPath(); g.arc(512, 512, (RB_RI + (RB_RO - RB_RI) * k / 3) * px, 0, 7); g.stroke(); }
    g.strokeStyle = '#B8322A'; g.lineWidth = 0.28 * px; g.beginPath(); g.arc(512, 512, (RB_RO - 0.14) * px, 0, 7); g.stroke();
  }) }));
  K.gravel = M(new MeshStandardMaterial({ roughness: 1, map: canvasTex(512, 512, (g) => {     // raked round, as a temple garden is
    g.fillStyle = '#D6D2C8'; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(120,114,104,0.55)'; g.lineWidth = 3;
    for (let rad = 12; rad < 256; rad += 13) { g.beginPath(); g.arc(256, 256, rad, 0, 7); g.stroke(); }
    g.strokeStyle = '#5A7A44'; g.lineWidth = 22; g.beginPath(); g.arc(256, 256, 244, 0, 7); g.stroke();   // moss at the edge
  }) }));
  K.island = [K.stone, K.gravel, K.stone];

  // A folding screen: gold leaf laid in squares, clouds, pines on the left and a wave on the right.
  K.byobu = M(new MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.45, envMap: env, envMapIntensity: 0.8,
    map: canvasTex(1024, 256, (g) => {
      for (let x = 0; x < 1024; x += 32) for (let y = 0; y < 256; y += 32) { g.fillStyle = ['#D8B25C', '#E0BC66', '#CFA852', '#DDB862'][Math.floor(r() * 4)]; g.fillRect(x, y, 32, 32); }
      g.fillStyle = 'rgba(255,244,210,0.55)';
      for (const [x, y, w] of [[120, 40, 260], [520, 70, 300], [300, 200, 240], [760, 30, 200]]) { g.beginPath(); g.ellipse(x, y, w / 2, 16, 0, 0, 7); g.fill(); }
      g.strokeStyle = '#4A3424'; g.lineWidth = 12; g.lineCap = 'round';
      g.beginPath(); g.moveTo(40, 256); g.bezierCurveTo(90, 180, 60, 120, 150, 90); g.stroke();
      g.lineWidth = 6; g.beginPath(); g.moveTo(90, 150); g.lineTo(230, 120); g.moveTo(120, 100); g.lineTo(300, 70); g.stroke();
      for (const [x, y, w] of [[230, 116, 70], [300, 66, 80], [160, 88, 60], [90, 150, 50], [250, 170, 60]]) {
        g.fillStyle = '#26442C'; g.beginPath(); g.ellipse(x, y, w, 18, -0.1, 0, 7); g.fill();
        g.fillStyle = '#3A5E3A'; g.beginPath(); g.ellipse(x - 6, y - 5, w * 0.7, 9, -0.1, 0, 7); g.fill();
      }
      g.fillStyle = '#1E3C78';
      g.beginPath(); g.moveTo(560, 256); g.bezierCurveTo(600, 150, 700, 90, 800, 100); g.bezierCurveTo(880, 108, 900, 160, 870, 180);
      g.bezierCurveTo(850, 150, 800, 150, 780, 180); g.bezierCurveTo(760, 210, 780, 240, 800, 256); g.closePath(); g.fill();
      g.fillStyle = '#4A74B0'; g.beginPath(); g.moveTo(640, 256); g.bezierCurveTo(660, 180, 720, 130, 780, 128); g.bezierCurveTo(740, 160, 730, 220, 750, 256); g.closePath(); g.fill();
      g.fillStyle = '#F6F2E8';
      for (let k = 0; k < 8; k++) { const a = -2.6 + k * 0.32, x = 820 + Math.cos(a) * 60, y = 150 + Math.sin(a) * 55; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); }
      g.fillStyle = '#1E3C78'; g.fillRect(860, 220, 164, 36);
    }) }));

  // Noren, the split curtain of a shop's door, in each lane's colour: a white crest, a darker hem, two slits (transparent).
  K.noren = [null, 0x7CC22C, 0x7A52D6].map((hex) => hex && M(new MeshStandardMaterial({ alphaTest: 0.5, side: DoubleSide, roughness: 0.9,
    emissive: hex, emissiveIntensity: 0.35, map: canvasTex(192, 128, (g) => {
      const c = '#' + hex.toString(16).padStart(6, '0');
      g.fillStyle = c; g.fillRect(0, 0, 192, 128);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 192, 14);
      for (const x of [64, 128]) g.clearRect(x - 2, 20, 4, 108);
      g.strokeStyle = '#FFFFFF'; g.lineWidth = 6; g.beginPath(); g.arc(96, 64, 26, 0, 7); g.stroke();
      g.fillStyle = '#FFFFFF'; for (let k = 0; k < 5; k++) { const a = k * 1.2566 - Math.PI / 2; g.beginPath(); g.arc(96 + Math.cos(a) * 11, 64 + Math.sin(a) * 11, 8, 0, 7); g.fill(); }   // a plum-blossom crest
    }) })));

  // A moving walkway: a dark belt, soft grooves along the way it runs, white chevrons (pointing up the canvas, the way it carries).
  K.belt = canvasTex(128, 128, (g) => {
    g.fillStyle = '#34383C'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(255,255,255,0.05)'; for (let x = 4; x < 128; x += 16) g.fillRect(x, 0, 6, 128);
    g.strokeStyle = '#EEF2F2'; g.lineWidth = 10; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(30, 84); g.lineTo(64, 50); g.lineTo(98, 84); g.stroke();
  }, true);

  // A taiko drum's head: cowhide, a dark rim with its studs, three commas turning round the middle.
  K.taiko = M(new MeshStandardMaterial({ roughness: 0.7, map: canvasTex(256, 256, (g) => {
    const rg = g.createRadialGradient(128, 128, 20, 128, 128, 128);
    rg.addColorStop(0, '#EEDDB8'); rg.addColorStop(0.8, '#D8C094'); rg.addColorStop(0.86, '#3A2418'); rg.addColorStop(1, '#2A1A12');
    g.fillStyle = rg; g.beginPath(); g.arc(128, 128, 127, 0, 7); g.fill();
    g.fillStyle = '#C8A450'; for (let k = 0; k < 28; k++) { const a = k * Math.PI / 14; g.beginPath(); g.arc(128 + Math.cos(a) * 118, 128 + Math.sin(a) * 118, 3.5, 0, 7); g.fill(); }
    for (let k = 0; k < 3; k++) {
      g.save(); g.translate(128, 128); g.rotate(k * 2.0944);
      g.fillStyle = '#B8261E'; g.beginPath(); g.arc(0, -22, 20, 0, 7); g.fill();
      g.beginPath(); g.moveTo(-20, -22); g.bezierCurveTo(-22, -60, 20, -70, 46, -44); g.bezierCurveTo(20, -58, 4, -40, 20, -22); g.closePath(); g.fill();
      g.restore();
    }
  }) }));
  // Tactile paving, the yellow blocks of every Japanese platform: raised bars along the way to go.
  K.tactile = M(new MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.7, map: canvasTex(64, 64, (g) => {
    g.fillStyle = '#E8BA1E'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 62, 64, 2); g.fillRect(62, 0, 2, 64);
    for (const x of [10, 26, 42]) { g.fillStyle = '#F8D448'; g.fillRect(x, 6, 10, 52); g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x + 8, 6, 2, 52); }
  }, true) }));

  // A namako wall: white plaster over black tiles set on the diagonal in raised white joints; 1 m to a tile across, the wall's
  // height up it. A dark roof of tiles goes along the top.
  K.namako = M(new MeshStandardMaterial({ roughness: 0.85, map: canvasTex(256, 256, (g) => {
    g.fillStyle = '#F0ECE2'; g.fillRect(0, 0, 256, 256);
    blotches(g, 256, 110, r, 8, 10, 30, ['210,204,190,0.3']);
    g.save(); g.beginPath(); g.rect(0, 110, 256, 146); g.clip();
    g.fillStyle = '#34363C'; g.fillRect(0, 110, 256, 146);
    g.strokeStyle = '#ECE8DE'; g.lineWidth = 12;             // square to the eye on the wall: 256 px is a metre along it, and its 0.7 m height up it
    const run = 146 * 256 / 366;
    for (let k = -4; k < 8; k++) { g.beginPath(); g.moveTo(k * 85.3, 110); g.lineTo(k * 85.3 + run, 256); g.stroke(); g.beginPath(); g.moveTo(k * 85.3, 256); g.lineTo(k * 85.3 + run, 110); g.stroke(); }
    g.restore();
    g.fillStyle = '#2A2622'; g.fillRect(0, 104, 256, 8);
  }, true) }));
  K.chest = (() => {                                        // a cedar chest to push: dark wood, iron at the corners, a ring handle
    const side = canvasTex(128, 128, (g) => {
      g.fillStyle = '#5A3A24'; g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 21) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y, 128, 2); }
      g.fillStyle = '#26221E';
      for (const [x, y] of [[0, 0], [100, 0], [0, 100], [100, 100]]) g.fillRect(x, y, 28, 28);
      g.strokeStyle = '#B08A3A'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 16, 0, 7); g.stroke();
      g.fillStyle = '#26221E'; g.fillRect(50, 40, 28, 12);
    });
    const topT = canvasTex(128, 128, (g) => {
      g.fillStyle = '#5E3E28'; g.fillRect(0, 0, 128, 128);
      for (let x = 0; x < 128; x += 32) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, 0, 2, 128); }
      g.fillStyle = '#26221E'; g.fillRect(0, 0, 128, 10); g.fillRect(0, 118, 128, 10); g.fillRect(0, 0, 10, 128); g.fillRect(118, 0, 10, 128);
    });
    const s = M(new MeshStandardMaterial({ map: side, roughness: 0.7 })), t = M(new MeshStandardMaterial({ map: topT, roughness: 0.7 }));
    return [s, s, t, t, s, s];
  })();
  K.deck = M(new MeshStandardMaterial({ roughness: 0.7, map: canvasTex(128, 128, (g) => {   // a little bridge's planks
    g.fillStyle = '#9A7048'; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) { g.fillStyle = y % 32 ? '#A57A50' : '#936A42'; g.fillRect(0, y, 128, 14); }
  }) }));
  K.dotGeo = G(new CylinderGeometry(0.07, 0.07, 0.17, 10).translate(0, 0.1, 0));   // a switch cable's little lantern
  // Carp streamers: a cone of cloth, scales and an eye at the mouth, fixed at the mouth (x = 0) and streaming along +x.
  K.koiGeo = G(new CylinderGeometry(0.42, 0.2, 1, 12, 1, true).rotateZ(Math.PI / 2).translate(0.5, 0, 0));
  K.koiMat = M(new MeshStandardMaterial({ side: DoubleSide, roughness: 0.6, map: canvasTex(128, 64, (g) => {
    g.fillStyle = '#F4F4F2'; g.fillRect(0, 0, 128, 64);
    g.strokeStyle = 'rgba(40,40,48,0.45)'; g.lineWidth = 2;
    for (let y = 16; y < 58; y += 7) for (let x = (y % 14 ? 0 : 4); x < 132; x += 8) { g.beginPath(); g.arc(x, y, 4, Math.PI, 0); g.stroke(); }
    for (const u of [0.25, 0.75]) { g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(u * 128, 7, 4.5, 0, 7); g.fill(); g.fillStyle = '#101010'; g.beginPath(); g.arc(u * 128, 7, 2.2, 0, 7); g.fill(); }
  }) }));
  const ride = commuterModel(env, '#2E9A5A', 2);
  ride.traverse((o) => { if (o.geometry) o.geometry.userData.keep = true; if (o.material) o.material.userData.keep = true; });
  K.ride = ride;
  return tkKitMemo = K;
}
/* THE GLASS TUBE IN TOKYO: one long paper lantern (owner, 2026-09-28, of a
   tunnel of torii: "The japanese gates don't work on the tube as the gates
   don't twist and turn well"; shown three looks, each round all the way so
   it holds however the tube coils, "lets go with the paper lantern"). Bamboo
   ribs, a red band every 3 m, black lacquer at each end, lit from inside; the
   light runs along it with the marble. Drawn in the glass from where each
   point lies along the tube and round it (tubeCoord, set in buildTube). */
function lanternGlass(len) {
  const m = new MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.9, metalness: 0.05, transparent: true, depthWrite: false, side: DoubleSide });
  const u = { uAt: { value: -99 }, uLen: { value: len } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 tubeCoord;\nvarying vec3 vTube;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vTube = tubeCoord;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTube;\nuniform float uAt, uLen;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
  {
    float s = vTube.x, rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
    float dr = abs(fract(s / 0.3 + 0.5) - 0.5) * 0.3;                      // metres to the nearest bamboo rib
    float rib = 1.0 - smoothstep(0.012, 0.026, dr);
    float band = smoothstep(0.02, 0.05, 0.25 - abs(mod(s + 1.5, 3.0) - 1.5)); // a red band every 3 m
    float cap = 1.0 - smoothstep(0.3, 0.36, min(s, uLen - s));             // black lacquer at each end
    float glow = exp(-pow((s - uAt) / 2.2, 2.0));                           // the lantern lights up round the marble
    vec3 c = mix(vec3(1.0, 0.84, 0.58), vec3(0.86, 0.14, 0.08), band);
    c = c * (0.95 + 0.6 * glow) + vec3(1.0, 0.66, 0.34) * (0.18 + glow * 0.6);
    c = mix(c, vec3(0.26, 0.17, 0.1), rib);
    c = mix(c, vec3(0.07, 0.06, 0.06), cap);
    gl_FragColor = vec4(c, clamp(0.62 + 0.25 * rim + 0.4 * max(rib, cap) + 0.2 * band, 0.0, 0.97));
  }`);
  };
  m.customProgramCacheKey = () => 'tube-lantern';
  m.userData.u = u;
  return m;
}
function dressTube(U, K) {
  const T = U.T, mat = lanternGlass(T.len), u = mat.userData.u, at = new Vector3();
  tkSet(U.glass, 'material', mat);
  tkUndo.push(() => mat.dispose());
  tkHide(U.rings, ...U.ends, ...U.halos);                  // the ribs and bands are in the paper itself
  tkTick(() => { u.uAt.value = ball.tube && ball.tube.U === U ? ball.tube.s : -99; });   // where the marble is along it, for the light that runs with it
  for (const s of [0, T.len]) {                            // a black lacquer hoop with a gold edge at each end
    const g = new Group(), d = tubeDir(T, Math.min(s, T.len - TUBE_DS), new Vector3());
    g.add(new Mesh(K.hoop, K.lacquer), new Mesh(K.hoopEdge, K.gold));
    tubeAt(T, s, g.position); g.lookAt(at.copy(g.position).add(d));
    tkAdd(levelGroup, g);
  }
}
function tokyoPieces() {
  const K = tkKit(), o = new Object3D();
  // BOLLARDS: a red paper lantern on each, one set of shapes for every bollard in the course.
  if (postKit && posts.length) {
    tkHide(...levelGroup.children.filter((m) => m.isInstancedMesh && [postKit.body, postKit.band, postKit.cap, postKit.pool, postKit.halo].includes(m.geometry)));
    const n = posts.length, post = new InstancedMesh(K.postGeo, K.wood, n), lamp = new InstancedMesh(K.lanternGeo, K.lanternMat, n);
    const caps = new InstancedMesh(K.capGeo, K.lacquer, n * 2), pool = new InstancedMesh(K.poolGeo, K.poolMat, n);
    const set = (m, j, P, y) => { o.position.set(P.x, P.y + y, P.z); o.updateMatrix(); m.setMatrixAt(j, o.matrix); };
    posts.forEach((P, i) => { set(post, i, P, 0); set(lamp, i, P, 0.43); set(caps, i * 2, P, 0.43); set(caps, i * 2 + 1, P, 0.81); set(pool, i, P, 0.013); });
    post.castShadow = lamp.castShadow = true;
    for (const m of [post, lamp, caps, pool]) tkAdd(levelGroup, m);
  }
  // BARRIERS and CRATES.
  const figs = [];
  let nb = 0, nc = 0;
  for (const c of colliders) {
    if (c.obstacle === 'crate') tkSet(c.mesh, 'material', K.crateMats[nc++ % K.crateMats.length]);
    if (c.obstacle !== 'barrier') continue;
    tkHide(c.mesh);
    const w = c.half.x * 2, a = nb++ % 4, at = new Matrix4().compose(new Vector3(c.pos.x, c.pos.y - c.half.y, c.pos.z), c.quat, new Vector3(1, 1, 1));
    const add = (g, hex, mtx, rect) => figs.push([g, hex, at.clone().multiply(mtx), rect]);
    add(new BoxGeometry(w - 0.5, 0.34, 0.07), 0xFFFFFF, placeAt(0, 0.4, 0), K.stripeRect);
    const body = [0xFFF6EA, 0xFFC0D2, 0x6CC24A, 0xFFFDF8][a];
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.25);
      add(new BoxGeometry(0.5, 0.12, 0.34), 0x2A2C30, placeAt(x, 0.06, 0));   // the weighted black base it stands on: a dark footprint on the pale rail
      add(new SphereGeometry(0.22, 16, 12), body, placeAt(x, 0.38, 0, 0, 0, 0, 1, 1.15, 0.75));
      add(new SphereGeometry(0.07, 8, 6), a === 3 ? SUMI : body, placeAt(x - s * 0.21, 0.42, 0.05));   // a paw on the board
      add(new SphereGeometry(0.24, 20, 14), 0xFFFFFF, placeAt(x, 0.72, 0), K.faceRect[a]);
      if (a === 0) for (const e of [-1, 1]) add(new ConeGeometry(0.08, 0.17, 8), e < 0 ? 0xF0943A : 0x2E2824, placeAt(x + e * 0.13, 0.94, 0, 0, 0, -e * 0.35));
      if (a === 1) for (const e of [-1, 1]) add(new SphereGeometry(0.06, 8, 8), 0xFFB4CB, placeAt(x + e * 0.09, 1.06, 0, 0, 0, -e * 0.25, 1, 3.4, 0.7));
      if (a === 2) { add(new SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xF6F6F2, placeAt(x, 0.86, 0, -0.2)); add(new BoxGeometry(0.07, 0.07, 0.02), 0x1E9A48, placeAt(x, 0.98, 0.14)); }
      if (a === 3) for (const e of [-1, 1]) add(new SphereGeometry(0.075, 10, 8), SUMI, placeAt(x + e * 0.16, 0.9, 0));
    }
  }
  if (figs.length) { const m = new Mesh(atlasModel(figs, K.white), K.atlasMat); m.castShadow = true; tkAdd(levelGroup, m); }
  // CROSSINGS: a little railway across the road, a crossbuck and an arm each side, 止まれ before the line.
  const stopT = K.stopT || (K.stopT = canvasTex(256, 96, (g) => {
    g.font = `900 76px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = 'rgba(40,36,32,0.75)'; g.lineWidth = 10; g.lineJoin = 'round'; g.strokeText('止まれ', 128, 50, 240);   // worn white paint, edged dark so it reads on the pale deck
    g.fillStyle = '#FFFFFF'; g.fillText('止まれ', 128, 50, 240);
  }));
  for (const c of crossings) {
    const X = c.cross;
    if (X.fire) continue;
    tkHide(...X.parts, ...X.lights.map((L) => L.lamp.parent));
    const near = c.pos.z + c.half.z, top = X.top, parts = [];
    for (const L of X.lanes) {
      for (let x = -30; x <= 30; x += 0.55) parts.push([new BoxGeometry(0.14, 0.05, 1.3), 0x4A3A2C, placeAt(X.x + x, top + 0.025, L.z)]);
      for (const dz of [-0.36, 0.36]) parts.push([new BoxGeometry(60, 0.06, 0.07), 0x8A9098, placeAt(X.x, top + 0.08, L.z + dz)]);
      for (const s of [-1, 1]) parts.push([new BoxGeometry(30 - X.w / 2, 0.32, 1.1), 0x4E5660, placeAt(X.x + s * (X.w / 2 + (30 - X.w / 2) / 2), top - 0.16, L.z)]);
    }
    const arms = [], lamps = [new MeshBasicMaterial({ color: 0x3A0A0A }), new MeshBasicMaterial({ color: 0x3A0A0A })];
    for (const s of [-1, 1]) {
      const x = X.x + s * (X.w / 2 + 0.5), z = near - 0.12;
      for (let k = 0; k < 6; k++) parts.push([new CylinderGeometry(0.05, 0.05, 0.3, 8), k % 2 ? 0x1A1A1A : 0xF2C230, placeAt(x, top + 0.15 + k * 0.3, z)]);
      for (const e of [-1, 1]) {
        parts.push([new BoxGeometry(0.66, 0.13, 0.03), 0x1A1A1A, placeAt(x, top + 1.98, z + 0.02, 0, 0, e * 0.6)]);
        parts.push([new BoxGeometry(0.6, 0.08, 0.03), 0xF2C230, placeAt(x, top + 1.98, z + 0.04, 0, 0, e * 0.6)]);
      }
      parts.push([new BoxGeometry(0.56, 0.05, 0.05), 0x1A1A1A, placeAt(x, top + 1.55, z + 0.03)], [new BoxGeometry(0.2, 0.34, 0.2), 0x2A2A2A, placeAt(x, top + 1.1, z + 0.2)]);
      for (const e of [-1, 1]) {
        parts.push([new CylinderGeometry(0.1, 0.1, 0.05, 16), 0x1A1A1A, placeAt(x + e * 0.2, top + 1.55, z + 0.06, Math.PI / 2)]);
        const lp = new Mesh(new CircleGeometry(0.075, 18), lamps[(e + s) / 2 === 0 ? 0 : 1]);
        lp.position.set(x + e * 0.2, top + 1.55, z + 0.09); tkAdd(levelGroup, lp);
      }
      const arm = new Group(), L = X.w / 2 + 0.25;              // striped black and yellow, as every crossing's arm is
      for (let k = 0; k < 6; k++) { const seg = new Mesh(new BoxGeometry(L / 6, 0.06, 0.05), k % 2 ? K.lacquer : K.yellow); seg.position.x = (k + 0.5) * L / 6; arm.add(seg); }
      arm.position.set(x, top + 1.1, z + 0.32); arm.rotation.set(0, s > 0 ? Math.PI : 0, Math.PI / 2);
      tkAdd(levelGroup, arm); arms.push(arm);
    }
    const stop = new Mesh(new PlaneGeometry(Math.min(2.4, X.w * 0.6), 0.9), new MeshBasicMaterial({ map: stopT, transparent: true, depthWrite: false }));
    stop.rotation.x = -Math.PI / 2; stop.position.set(X.x, top + 0.016, near + 0.75); tkAdd(levelGroup, stop);
    tkAdd(levelGroup, new Mesh(paintedModel(parts), K.props));
    X.cars.forEach((car, i) => {
      for (const ch of car.mesh.children) tkHide(ch);
      const [bg, lg] = K.tram[(X.lanes.indexOf(car.lane) * 2 + i) % K.tram.length], g = new Group();
      g.add(new Mesh(bg, K.props), new Mesh(lg, K.lit));
      tkAdd(car.mesh, g);
    });
    let angle = Math.PI / 2;
    tkTick((dt) => {                                       // the lamps flash by turns and the arms come down while it is not safe
      const shut = !X.green, on = REDUCED || ((simT * 1.6) % 1) < 0.5;
      lamps[0].color.setHex(shut && on ? 0xFF2A20 : 0x3A0A0A); lamps[1].color.setHex(shut && (REDUCED || !on) ? 0xFF2A20 : 0x3A0A0A);
      const want = shut ? 0 : Math.PI / 2;
      angle += (want - angle) * (REDUCED ? 1 : 1 - Math.exp(-6 * dt));
      for (const a of arms) a.rotation.z = angle;
    });
  }
  // HOLOGRAM ROADS: paper lit from below.
  for (const c of holos) {
    const old = c.holoMats, mats = [glowMat(0xFFB070, 0.5), glowMat(0xFFFFFF, 1, K.shoji), glowMat(0xFFB070, 0.2), glowMat(0xFFE6C4, 1)];
    for (const ch of c.mesh.children) if (ch.material === old[3]) tkSet(ch, 'material', mats[3]);
    c.holoMats = mats;
    tkUndo.push(() => { c.holoMats = old; for (const m of mats) m.dispose(); });
  }
  // PADS: a jump pad is a taiko drum's head; a speed strip has yellow tactile paving down each edge.
  for (const c of pads) {
    const top = c.half.y;
    if (c.pad === 'jump') {
      for (const ch of c.mesh.children) if (!c.padFx.rings.includes(ch)) tkHide(ch);
      const head = new Mesh(new CircleGeometry(c.padFx.R + 0.06, 48), K.taiko);
      head.rotation.x = -Math.PI / 2; head.position.y = top + 0.006; tkAdd(c.mesh, head);
    } else {
      const d = c.half.z * 2 - 0.3;
      for (const s of [-1, 1]) {
        const g = new PlaneGeometry(0.32, d), uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * d / 0.32);
        const strip = new Mesh(g, K.tactile); strip.rotation.x = -Math.PI / 2; strip.position.set(s * (c.half.x - 0.3), top + 0.008, 0);
        tkAdd(c.mesh, strip);
      }
    }
  }
  // MAGLEV STRIPS: a moving walkway.
  for (const c of mags) {
    const deco = c.mesh.children.find((m) => m.material && m.material.map === c.magFx.tex);
    if (!deco) continue;
    const t = K.belt.clone(); t.repeat.copy(c.magFx.tex.repeat);
    const mat = hazed(new MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.3 }));
    tkSet(deco, 'material', mat); tkSet(c.magFx, 'tex', t);
    tkUndo.push(() => { t.dispose(); mat.dispose(); });
  }
  // WIND: the towers in the city's walls, the streaks warm, and a carp-streamer pole on the windward edge.
  if (winds.length) {
    const TK = tokyoKit(), [f, rf] = TK.mats.white, koi = new InstancedMesh(K.koiGeo, K.koiMat, winds.length * 3), carps = [];
    koi.frustumCulled = false;
    const poleParts = [];
    for (const W of winds) {
      for (const t of W.towers) if (t.geometry.type === 'BoxGeometry') tkSet(t, 'material', [f, f, rf, rf, f, f]);
      tkColor(W.streaks.material.color, 0xFFF2E0);
      const px = W.x - W.dir * (W.w / 2 + 0.7);
      poleParts.push([new CylinderGeometry(0.05, 0.07, 10, 8), 0xE8E2D4, placeAt(px, W.y + 0.5, W.z)], [new SphereGeometry(0.12, 10, 8), 0xE8C050, placeAt(px, W.y + 5.6, W.z)]);
      for (let k = 0; k < 4; k++) poleParts.push([new BoxGeometry(0.7, 0.04, 0.04), 0xE8C050, placeAt(px, W.y + 5.3, W.z, 0, k * Math.PI / 4)]);
      [[3.0, 0x2A2A30, 4.9], [2.4, 0xD8342A, 3.9], [1.9, 0x2A5AB8, 3.0]].forEach(([L, hex, y], k) => {
        koi.setColorAt(carps.length, new Color(hex)); carps.push({ W, L, x: px, y: W.y + y, z: W.z, ph: k * 1.7 + W.z });
      });
    }
    tkAdd(levelGroup, new Mesh(paintedModel(poleParts), K.props)); tkAdd(levelGroup, koi);
    const e = new Euler(), q = new Quaternion(), p = new Vector3(), sc = new Vector3(), m = new Matrix4();
    tkTick(() => {
      carps.forEach((C, i) => {
        const k = windState(C.W, simT).k, fl = REDUCED ? 0 : Math.sin(simT * 7 + C.ph) * (0.05 + 0.1 * k), br = 1 + (REDUCED ? 0 : 0.08 * Math.sin(simT * 5 + C.ph));
        e.set(fl, C.W.dir > 0 ? 0 : Math.PI, -(1 - k) * 1.35 + fl * 0.5, 'YXZ');
        m.compose(p.set(C.x, C.y, C.z), q.setFromEuler(e), sc.set(C.L * (0.9 + 0.1 * k), 0.24 * C.L * br, 0.24 * C.L * br));
        koi.setMatrixAt(i, m);
      });
      koi.instanceMatrix.needsUpdate = true;
    });
  }
  // WORMHOLES: a torii, sakura swirling in it.
  for (const W of wormholes) {
    const [disc, ring, halo] = W.grp.children;
    tkHide(ring, halo); tkSet(disc, 'material', K.swirl);
    const L = []; toriiParts(L, 2 * W.rad, 2 * W.rad + 0.05, 3.2);
    tkAdd(W.grp, new Mesh(paintedModel(L.map(([g0, hex, mtx]) => [g0, hex, new Matrix4().makeTranslation(0, -W.rad, 0).multiply(mtx)])), K.props));
  }
  // ROUNDABOUTS: a revolving stage round a garden.
  for (const Rd of rounds) {
    const [top, rim, , lamps] = Rd.spinGrp.children, fixed = Rd.gyro.parent, [island, lip, glow] = fixed.children;
    tkSet(top, 'material', K.stage); tkSet(rim, 'material', K.redLacquer); tkColor(lamps.material.color, 0xFFD49A);
    tkHide(lip, glow, Rd.gyro); tkSet(island, 'material', K.island);
    const g = [], H = ISLAND_H;
    g.push([new IcosahedronGeometry(0.45, 0), 0x6A6660, placeAt(0.35, H + 0.18, -0.25, 0.3, 0.5, 0, 1.3, 0.75, 1)],
           [new IcosahedronGeometry(0.3, 0), 0x5E5A54, placeAt(-0.45, H + 0.1, 0.45, 0.2, 1.1, 0, 1.1, 0.7, 1)],
           [new SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x4E7A3A, placeAt(-0.7, H, -0.55, 0, 0, 0, 1.3, 0.4, 1.1)]);
    const lx = 0.95, lz = 0.75;                            // a stone lantern
    g.push([new BoxGeometry(0.34, 0.1, 0.34), 0x8E8A82, placeAt(lx, H + 0.05, lz)], [new CylinderGeometry(0.07, 0.09, 0.42, 8), 0x8E8A82, placeAt(lx, H + 0.31, lz)],
           [new BoxGeometry(0.3, 0.06, 0.3), 0x8E8A82, placeAt(lx, H + 0.55, lz)], [new ConeGeometry(0.3, 0.2, 4), 0x7E7A72, placeAt(lx, H + 0.86, lz, 0, Math.PI / 4)],
           [new SphereGeometry(0.05, 8, 6), 0x7E7A72, placeAt(lx, H + 0.99, lz)]);
    tkAdd(fixed, new Mesh(paintedModel(g), K.props));
    tkAdd(fixed, new Mesh(paintedModel([[new BoxGeometry(0.2, 0.2, 0.2), 0xFFC878, placeAt(lx, H + 0.68, lz)]]), K.lit));
  }
  // GLASS TUBES: one long paper lantern (dressTube).
  for (const U of tubes) dressTube(U, K);
  // SCANNERS: a folding screen of gold, sliding across.
  for (const Sc of scans) {
    const n = Math.max(4, Math.round(Sc.d / 0.9)), pw = Sc.d / n, parts = [];
    for (let k = 0; k < n; k++) {
      const z = -Sc.d / 2 + (k + 0.5) * pw, x = k % 2 ? 0.05 : -0.05, ry = k % 2 ? 0.22 : -0.22;
      parts.push([new BoxGeometry(0.04, SCAN_H - 0.08, pw), 0xFFFFFF, placeAt(x, SCAN_H / 2, z, 0, ry), [k / n, (k + 1) / n, 0, 1]]);
      for (const y of [0.03, SCAN_H - 0.03]) parts.push([new BoxGeometry(0.06, 0.06, pw), SUMI, placeAt(x, y, z, 0, ry)]);
      parts.push([new BoxGeometry(0.06, SCAN_H, 0.05), SUMI, placeAt(x, SCAN_H / 2, z - pw / 2 + 0.02, 0, ry)]);
    }
    parts.push([new BoxGeometry(0.06, SCAN_H, 0.05), SUMI, placeAt(0, SCAN_H / 2, Sc.d / 2 - 0.02)]);
    const geo = atlasModel(parts, [0.999, 0.001]);
    for (const g of Sc.bars) {
      const [sheet, , , strands, ...nubs] = g.children;
      tkHide(sheet, strands, ...nubs);                     // its line and its glow on the road stay, so from behind you see where it is
      const m = new Mesh(geo, K.byobu); m.castShadow = true; tkAdd(g, m);
    }
  }
  // SWITCHES: a lacquer button in gold; lanterns along the cable.
  for (const S of switches) {
    tkSet(S.button, 'material', K.redLacquer);
    tkColor(S.faceMat.color, 0xFFD890); tkColor(S.ringMat.color, 0xFFC060); tkColor(S.halo.material.color, 0xFF9A40);
    for (const g of S.decals) tkColor(g.material.color, 0xFFD8A0);
    tkSet(S.dots, 'geometry', K.dotGeo); tkSet(S, 'dotOn', new Color(0xFFC878)); tkSet(S, 'dotOff', new Color(0x6A5646));
    const paint = (on, off) => { S.at.forEach((a, i) => S.dots.setColorAt(i, S.on && a <= S.t * PULSE_V ? on : off)); S.dots.instanceColor.needsUpdate = true; };
    paint(S.dotOn, S.dotOff);
    tkUndo.push(() => paint(DOT_ON, DOT_OFF));
  }
  // COLOUR LANES: noren to roll through; the lock a paper screen in its colour.
  for (const C of curtains) {
    const [sheet, bar] = C.parts;
    tkHide(sheet); tkSet(bar, 'material', K.wood);
    const g = new PlaneGeometry(C.w, 1.15); g.translate(0, -0.575, 0);
    const noren = new Mesh(g, K.noren[C.col]); noren.position.set(C.x, C.y + 1.5, C.z); tkAdd(levelGroup, noren);
    tkTick(() => { noren.rotation.x = REDUCED ? 0 : 0.7 * C.flash * (0.6 + 0.4 * Math.sin(simT * 11)); });
  }
  for (const L of locks) {
    const old = L.mat, t = K.shojiLock.clone(); t.repeat.set(Math.max(1, Math.round(L.half.x * 2 / 0.9)), 1);
    const mat = new MeshBasicMaterial({ color: TINTS[L.lock], map: t, transparent: true, opacity: old.opacity, side: DoubleSide });
    tkSet(L.mesh, 'material', mat); L.mat = mat;
    tkUndo.push(() => { L.mat = old; t.dispose(); mat.dispose(); });
    for (const f of L.frames) tkSet(f, 'material', K.wood);
  }
  // THE SKY TRAIN you ride: a commuter train, on a concrete guideway.
  for (const c of ferries) {
    if (!c.train) continue;
    tkHide(c.train.model);
    const t = K.ride.clone(); t.rotation.y = Math.PI / 2; t.position.y = -TRAIN_H / 2 - 1.58;
    tkAdd(c.mesh, t);
    const [beam, ...rails] = c.train.parts;
    tkSet(beam, 'material', K.concrete); for (const rl of rails) tkSet(rl, 'material', K.steel);
  }
  // PUZZLE SQUARES.
  const walls = colliders.filter((c) => c.obstacle === 'wall');
  if (walls.length) {
    const box = [], caps = [];
    for (const c of walls) {
      tkHide(c.mesh);
      const { x: hx, y: hy, z: hz } = c.half, g = new BoxGeometry(hx * 2, hy * 2, hz * 2), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {                  // a tile to a metre along the wall, the wall's height up it
        const wx = c.pos.x + p.getX(i), wz = c.pos.z + p.getZ(i), along = Math.abs(n.getX(i)) > 0.5 ? wz : wx;
        uv.setXY(i, Math.abs(n.getY(i)) > 0.5 ? 0 : along, (p.getY(i) + hy) / (hy * 2));
      }
      g.translate(c.pos.x, c.pos.y, c.pos.z); box.push(g);
      const L = Math.max(hx, hz) * 2 + 0.12, alongX = hx > hz, T = Math.min(hx, hz) * 2 + 0.16;
      caps.push([new BoxGeometry(alongX ? L : T, 0.09, alongX ? T : L), 0x3A3F48, placeAt(c.pos.x, c.pos.y + hy + 0.045, c.pos.z)],
                [new BoxGeometry(alongX ? L : 0.14, 0.07, alongX ? 0.14 : L), 0x2A2E36, placeAt(c.pos.x, c.pos.y + hy + 0.12, c.pos.z)]);
    }
    const mg = new BufferGeometry(), all = box.map((g) => g.toNonIndexed());
    for (const name of ['position', 'normal', 'uv']) {
      const k = all[0].attributes[name].itemSize, arr = new Float32Array(all.reduce((a, g) => a + g.attributes[name].count, 0) * k);
      let at = 0; for (const g of all) { arr.set(g.attributes[name].array, at); at += g.attributes[name].array.length; }
      mg.setAttribute(name, new Float32BufferAttribute(arr, k));
    }
    for (const g of [...box, ...all]) g.dispose();
    const wm = new Mesh(mg, K.namako); wm.castShadow = wm.receiveShadow = true;
    tkAdd(levelGroup, wm); tkAdd(levelGroup, new Mesh(paintedModel(caps), K.props));
  }
  for (const P of plazas) {
    levelGroup.traverse((m) => { if (m.isMesh && (m.material === P.mats.line || m.material === P.mats.halo)) tkHide(m); });   // the walls' lit tops
    const rails = new Set();
    for (const T of P.tiles) T.grp.traverse((m) => {
      if (m.material === P.mats.wall) { rails.add(m); tkSet(m, 'material', K.vermilion); }
      else if (Array.isArray(m.material) && m.material[2] === P.mats.tile) tkSet(m, 'material', [K.vermilion, K.vermilion, K.deck, K.deck, K.vermilion, K.vermilion]);
    });
    levelGroup.traverse((m) => {
      if (!m.isMesh || rails.has(m)) return;
      if (m.material === P.mats.base) tkSet(m, 'material', K.stone);
      else if (m.material === P.mats.wall && m.parent !== levelGroup) tkSet(m, 'material', K.wood);   // a gate's posts
    });
    for (const W of P.crates) tkSet(W.mesh, 'material', K.chest);
    if (P.rocks) for (const Rk of P.rocks) {            // an ice maze is a frozen garden pond: its rocks, pale granite stones
      tkHide(Rk.mesh);                                  // (no snow on them: white is snow's, and snow does the opposite)
      const mt = new Matrix4().compose(Rk.mesh.position.clone().setY(P.y + 0.46), Rk.mesh.quaternion, new Vector3(1.05, 1.05, 1.05));
      const st = new Mesh(paintedModel([[Rk.mesh.geometry.clone(), 0xB3ADA2, mt]]), K.props); st.castShadow = true;
      tkAdd(levelGroup, st);
    }
    for (const g of P.gates) if (g.fieldMat) tkSet(g.fieldMat, 'map', K.shojiField);
    for (const M of P.magnets) tkSet(M.fieldMat, 'map', K.shojiField);
  }
}
// Many plain shapes, each placed by a matrix and given a colour, made into one geometry with vertex colours: many things in one draw.
function paintedModel(parts) {
  let n = 0;
  const flat = parts.map(([g0, hex, mtx]) => {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (g !== g0) g0.dispose();
    g.applyMatrix4(mtx); n += g.attributes.position.count;
    return [g, hex];
  });
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), col = new Color();
  let o = 0;
  for (const [g, hex] of flat) {
    const k = g.attributes.position.count;
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
    col.setHex(hex);
    for (let i = o; i < o + k; i++) { C[i * 3] = col.r; C[i * 3 + 1] = col.g; C[i * 3 + 2] = col.b; }
    o += k; g.dispose();
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(N, 3));
  geo.setAttribute('color', new Float32BufferAttribute(C, 3));
  return geo;
}
// A unit box with its faces in two groups, the sides and then the top and bottom: a facade and a roof in two draws.
function twoGroupBox() {
  const g = new BoxGeometry(1, 1, 1), idx = g.index.array, gr = g.groups, out = [];
  for (const k of [0, 1, 4, 5, 2, 3]) for (let i = gr[k].start; i < gr[k].start + gr[k].count; i++) out.push(idx[i]);
  g.setIndex(out); g.clearGroups(); g.addGroup(0, 24, 0); g.addGroup(24, 12, 1);
  return g;
}
const _wp = new Matrix4(), _wq = new Quaternion(), _we = new Euler(), _wv = new Vector3(), _ws = new Vector3();
// A matrix from a place, a turn and a size.
const placeAt = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  _wp.compose(_wv.set(x, y, z), _wq.setFromEuler(_we.set(rx, ry, rz)), _ws.set(sx, sy, sz)).clone();
/* Smoke that billows and thins: each puff ages through a few layers, each
   drawn larger and fainter, so a plume grows and clears in a handful of draws. */
function makePlume(G, colour, sizes, opacities, cap, tex, order) {
  const layers = sizes.map((s, i) => {
    const geo = new BufferGeometry(), attr = new Float32BufferAttribute(cap * 3, 3).setUsage(DynamicDrawUsage), arr = attr.array;   // (the attribute's own array: it copies any it is given)
    geo.setAttribute('position', attr); geo.setDrawRange(0, 0);
    const pts = new Points(geo, hazed(new PointsMaterial({ color: colour, size: s, map: tex, transparent: true, opacity: opacities[i], depthWrite: false })));
    pts.frustumCulled = false; pts.renderOrder = order; G.add(pts);
    return { geo, arr };
  });
  const parts = [];
  return {
    emit(x, y, z, vx, vy, vz, life) { if (parts.length < cap * layers.length) parts.push({ x, y, z, vx, vy, vz, age: 0, life }); },
    step(dt, wind) {
      const counts = layers.map(() => 0), drag = Math.exp(-1.3 * dt);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age >= p.life) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
        p.x += (p.vx + wind) * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vx *= drag; p.vz *= drag;
        const k = Math.min(layers.length - 1, Math.floor(p.age / p.life * layers.length)), L = layers[k];
        if (counts[k] >= cap) continue;
        L.arr[counts[k] * 3] = p.x; L.arr[counts[k] * 3 + 1] = p.y; L.arr[counts[k] * 3 + 2] = p.z; counts[k]++;
      }
      layers.forEach((L, k) => { L.geo.setDrawRange(0, counts[k]); L.geo.attributes.position.needsUpdate = true; });
    },
  };
}
/* KAWAII (owner, 2026-09-28: "Are there other elements you can add such as
   anime, or the hello-kitty-like japanese elements"). The city's own mascots,
   original characters and nobody else's: Mike the calico cat, Momo the pink
   rabbit, Kero the frog in a site helmet (the green cross is the Japanese
   sign for safety), Pan the panda and Musubi the rice ball. Each is a round
   face with the eyes low and wide apart, big shining eyes, rosy cheeks and a
   small mouth, drawn round (0, 0) with s the half-width of the face; `shut`
   closes the eyes (a blink, a wink). They go on the trains, the screens, the
   balloons over the festival and the barricades on the course. */
const kEyes = (g, s, dx, y, rx, ry, shut) => {
  for (const sx of [-1, 1]) {
    const x = sx * dx * s;
    if (shut) {                                            // a happy closed eye, curved up
      g.strokeStyle = '#2A1E1C'; g.lineWidth = Math.max(1.2, 0.07 * s); g.lineCap = 'round';
      g.beginPath(); g.arc(x, y * s + ry * 0.3 * s, rx * 1.1 * s, Math.PI + 0.5, -0.5); g.stroke();
      continue;
    }
    g.fillStyle = '#2A1E1C'; g.beginPath(); g.ellipse(x, y * s, rx * s, ry * s, 0, 0, 7); g.fill();
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(x - rx * 0.32 * s, y * s - ry * 0.38 * s, rx * 0.44 * s, 0, 7); g.fill();
    g.beginPath(); g.arc(x + rx * 0.36 * s, y * s + ry * 0.42 * s, rx * 0.2 * s, 0, 7); g.fill();
  }
};
const kCheeks = (g, s, dx, y) => { g.fillStyle = 'rgba(255,110,140,0.6)'; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * dx * s, y * s, 0.17 * s, 0.1 * s, 0, 0, 7); g.fill(); } };
const kLine = (g, s, w = 0.06) => { g.strokeStyle = '#3A2622'; g.lineWidth = Math.max(1, w * s); g.lineCap = 'round'; g.lineJoin = 'round'; };
const MASCOTS = [
  (g, s, shut, ears = true) => {                           // Mike, the calico cat
    const ear = (sx, col) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(sx * 0.95 * s, -0.2 * s); g.lineTo(sx * 0.8 * s, -1.02 * s); g.lineTo(sx * 0.2 * s, -0.66 * s); g.closePath(); g.fill();
      g.fillStyle = '#FFC4C4'; g.beginPath(); g.moveTo(sx * 0.8 * s, -0.36 * s); g.lineTo(sx * 0.73 * s, -0.84 * s); g.lineTo(sx * 0.38 * s, -0.63 * s); g.closePath(); g.fill();
    };
    if (ears) { ear(-1, '#F0943A'); ear(1, '#2E2824'); }
    g.save(); g.fillStyle = '#FFFBF2'; g.beginPath(); g.ellipse(0, 0, s, 0.84 * s, 0, 0, 7); g.fill(); g.clip();
    g.fillStyle = '#F0943A'; g.beginPath(); g.ellipse(-0.66 * s, -0.52 * s, 0.58 * s, 0.5 * s, 0.45, 0, 7); g.fill();   // an orange patch
    g.fillStyle = '#2E2824'; g.beginPath(); g.ellipse(0.74 * s, -0.66 * s, 0.44 * s, 0.34 * s, -0.35, 0, 7); g.fill();   // and a black one
    g.restore();
    kEyes(g, s, 0.4, 0.1, 0.14, 0.19, shut); kCheeks(g, s, 0.66, 0.36);
    g.fillStyle = '#F07A8A'; g.beginPath(); g.moveTo(-0.07 * s, 0.22 * s); g.lineTo(0.07 * s, 0.22 * s); g.lineTo(0, 0.29 * s); g.closePath(); g.fill();
    kLine(g, s, 0.05);
    for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * 0.075 * s, 0.31 * s, 0.075 * s, 0.15, Math.PI - 0.15); g.stroke(); }   // the mouth: ω
    for (const k of [-1, 0, 1]) for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 0.62 * s, 0.2 * s + k * 0.09 * s); g.lineTo(sx * 0.96 * s, 0.16 * s + k * 0.14 * s); g.stroke(); }
  },
  (g, s, shut, ears = true) => {                           // Momo, the pink rabbit, one ear flopped
    if (ears) for (const sx of [-1, 1]) {
      g.save(); g.translate(sx * 0.4 * s, -0.62 * s); g.rotate(sx > 0 ? 1.05 : -0.16);
      g.fillStyle = '#FFB4CB'; g.beginPath(); g.ellipse(0, -0.56 * s, 0.25 * s, 0.62 * s, 0, 0, 7); g.fill();
      g.fillStyle = '#FFE0E9'; g.beginPath(); g.ellipse(0, -0.54 * s, 0.12 * s, 0.46 * s, 0, 0, 7); g.fill();
      g.restore();
    }
    g.fillStyle = '#FFC6D7'; g.beginPath(); g.ellipse(0, 0, s, 0.82 * s, 0, 0, 7); g.fill();
    kEyes(g, s, 0.42, 0.08, 0.13, 0.18, shut); kCheeks(g, s, 0.66, 0.34);
    g.fillStyle = '#E0607E'; g.beginPath(); g.ellipse(0, 0.22 * s, 0.07 * s, 0.05 * s, 0, 0, 7); g.fill();
    kLine(g, s, 0.05); g.beginPath(); g.moveTo(0, 0.26 * s); g.lineTo(0, 0.33 * s); g.stroke();
    for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * 0.08 * s, 0.31 * s, 0.08 * s, 0.4, Math.PI - 0.4); g.stroke(); }
  },
  (g, s, shut, ears = true) => {                           // Kero, the frog, in a white site helmet with the green cross
    for (const sx of [-1, 1]) { g.fillStyle = '#6CC24A'; g.beginPath(); g.arc(sx * 0.5 * s, -0.46 * s, 0.36 * s, 0, 7); g.fill(); }
    g.fillStyle = '#6CC24A'; g.beginPath(); g.ellipse(0, 0.08 * s, s, 0.72 * s, 0, 0, 7); g.fill();
    if (ears) {
      g.fillStyle = '#F6F6F2'; g.beginPath(); g.ellipse(0, -0.72 * s, 0.42 * s, 0.3 * s, 0, Math.PI, 0); g.fill();
      g.fillRect(-0.52 * s, -0.74 * s, 1.04 * s, 0.08 * s);
      g.fillStyle = '#1E9A48'; g.fillRect(-0.05 * s, -0.96 * s, 0.1 * s, 0.2 * s); g.fillRect(-0.1 * s, -0.91 * s, 0.2 * s, 0.1 * s);
    }
    for (const sx of [-1, 1]) {
      g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(sx * 0.5 * s, -0.46 * s, 0.26 * s, 0, 7); g.fill();
      if (shut) { kLine(g, s, 0.07); g.beginPath(); g.arc(sx * 0.5 * s, -0.4 * s, 0.14 * s, Math.PI + 0.5, -0.5); g.stroke(); }
      else { g.fillStyle = '#2A1E1C'; g.beginPath(); g.arc(sx * 0.5 * s, -0.42 * s, 0.14 * s, 0, 7); g.fill(); g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(sx * 0.5 * s - 0.05 * s, -0.47 * s, 0.05 * s, 0, 7); g.fill(); }
    }
    kCheeks(g, s, 0.66, 0.3);
    kLine(g, s, 0.06); g.beginPath(); g.arc(0, 0.06 * s, 0.4 * s, 0.35, Math.PI - 0.35); g.stroke();
  },
  (g, s, shut, ears = true) => {                           // Pan, the panda
    if (ears) for (const sx of [-1, 1]) { g.fillStyle = '#26221F'; g.beginPath(); g.arc(sx * 0.74 * s, -0.6 * s, 0.28 * s, 0, 7); g.fill(); }
    g.fillStyle = '#FFFDF8'; g.beginPath(); g.ellipse(0, 0, s, 0.84 * s, 0, 0, 7); g.fill();
    for (const sx of [-1, 1]) { g.fillStyle = '#26221F'; g.beginPath(); g.ellipse(sx * 0.4 * s, 0.06 * s, 0.22 * s, 0.3 * s, sx * 0.55, 0, 7); g.fill(); }
    if (shut) { g.strokeStyle = '#FFFFFF'; g.lineWidth = Math.max(1.2, 0.06 * s); g.lineCap = 'round'; for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * 0.4 * s, 0.1 * s, 0.1 * s, Math.PI + 0.5, -0.5); g.stroke(); } }
    else for (const sx of [-1, 1]) {
      g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(sx * 0.4 * s, 0.04 * s, 0.09 * s, 0, 7); g.fill();
      g.fillStyle = '#26221F'; g.beginPath(); g.arc(sx * 0.4 * s + 0.02 * s, 0.06 * s, 0.05 * s, 0, 7); g.fill();
    }
    kCheeks(g, s, 0.68, 0.38);
    g.fillStyle = '#26221F'; g.beginPath(); g.ellipse(0, 0.28 * s, 0.09 * s, 0.06 * s, 0, 0, 7); g.fill();
    kLine(g, s, 0.05); for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * 0.07 * s, 0.36 * s, 0.07 * s, 0.2, Math.PI - 0.2); g.stroke(); }
  },
  (g, s, shut) => {                                        // Musubi, the rice ball, in its band of nori
    g.fillStyle = '#FFFDF6'; g.beginPath();
    g.moveTo(0, -0.95 * s); g.quadraticCurveTo(0.2 * s, -0.95 * s, 0.9 * s, 0.4 * s); g.quadraticCurveTo(1.02 * s, 0.84 * s, 0.5 * s, 0.84 * s);
    g.lineTo(-0.5 * s, 0.84 * s); g.quadraticCurveTo(-1.02 * s, 0.84 * s, -0.9 * s, 0.4 * s); g.quadraticCurveTo(-0.2 * s, -0.95 * s, 0, -0.95 * s); g.fill();
    g.save(); g.clip(); g.fillStyle = '#1E2A22'; g.fillRect(-0.42 * s, 0.46 * s, 0.84 * s, 0.5 * s); g.restore();
    kEyes(g, s, 0.3, 0.06, 0.1, 0.14, shut); kCheeks(g, s, 0.5, 0.26);
    kLine(g, s, 0.05); g.beginPath(); g.arc(0, 0.16 * s, 0.1 * s, 0.3, Math.PI - 0.3); g.stroke();
  },
];
/* TOKYO'S TRAINS, not the neon city's (owner: "can we make the metro trail a
   little different than the last world?", then "can you make the train that
   runs parallel to the tracks similar to the crosstown one so that it is
   different than the neon city?"). Every train here is a commuter train:
   stainless steel, a flat black face, a band in its line's colour, doors down
   each side. Crossing under the rail at the side streets, the green line; on
   the elevated lines beside it, the orange line, and a train wrapped all over
   in pink with the city's mascots down its sides and sakura on its roof.
   One lofted body each, +x forward. */
const trainBand = (g, W, H, v0, v1, fill, u0 = 0, u1 = 1) => { g.fillStyle = fill; g.fillRect(u0 * W, (1 - v1) * H, (u1 - u0) * W, (v1 - v0) * H); };
function commuterModel(env, line = '#7DC242', cars = 3, wrap = false) {
  const TL = 18 * cars, NOSE = 1.6, W = 2048, H = 256, nu = NOSE / TL, r = seeded(18 + cars + (wrap ? 5 : 0));
  const prof = (t) => {
    const d = Math.min(t, 1 - t) * TL;
    if (d >= NOSE) return { w: 1.4, top: 1.55, bot: -1.2 };
    if (d >= 0.25) { const k = (d - 0.25) / (NOSE - 0.25); return { w: 1.4 * (0.9 + 0.1 * k), top: 1.3 + 0.25 * k, bot: -1.15 - 0.05 * k }; }
    const k = Math.sqrt(d / 0.25);                                             // a flat face, rounded into the body
    return { w: 1.26 * k + 0.02, top: -0.2 + 1.5 * k, bot: -1.15 };
  };
  const B = (g, ...a) => trainBand(g, W, H, ...a), wins = [[0.255, 0.335], [0.665, 0.745]], lit = [];
  const map = canvasTex(W, H, (g) => {
    B(g, 0, 1, wrap ? '#F7B6CC' : '#C4C9CC');
    if (!wrap) for (let x = 0; x < W; x += 12) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, 0, 2, H); }   // the corrugation of stainless steel
    else {                                                                     // sakura all over the roof
      for (let i = 0; i < 140; i++) {
        const x = r() * W, y = (1 - 0.39 - r() * 0.22) * H, rr = 3 + r() * 3;
        g.fillStyle = r() < 0.5 ? '#FFFFFF' : '#FF8AB0';
        for (let p = 0; p < 5; p++) { const a = p * 1.2566 + x; g.beginPath(); g.arc(x + Math.cos(a) * rr * 0.6, y + Math.sin(a) * rr * 0.6, rr * 0.55, 0, 7); g.fill(); }
      }
    }
    B(g, 0, 0.08, '#4A5056'); B(g, 0.92, 1, '#4A5056');
    for (const [a, b] of [[0.345, 0.375], [0.625, 0.655]]) B(g, a, b, line);   // the line's colour, under the roof
    for (let car = 0; car < cars; car++) {
      const u0 = car / cars, u1 = (car + 1) / cars;
      if (!wrap) for (const [a, b] of wins) for (let k = 0; k < 6; k++) {
        const w0 = u0 + (u1 - u0) * (0.06 + k * 0.155), w1 = w0 + (u1 - u0) * 0.1;
        if (w0 < nu + 0.005 || w1 > 1 - nu - 0.005) continue;
        B(g, a, b, '#2A3440', w0, w1); lit.push([a, b, w0, w1, r() < 0.9]);
      }
      for (const [a0, a1] of [[0.09, 0.335], [0.665, 0.91]]) for (let k = 0; k < 4; k++) {   // doors, framed in the line's colour
        const d0 = u0 + (u1 - u0) * (0.13 + k * 0.23);
        B(g, a0, a1, line, d0 - 0.002, d0 + 0.014); B(g, a0 + 0.01, a1 - 0.01, wrap ? '#FFE6EE' : '#8E969C', d0, d0 + 0.012);
      }
      if (wrap) for (let k = 0; k < 3; k++) {                                // a mascot between each pair of doors, upright on both sides
        const u = u0 + (u1 - u0) * (0.245 + 0.008 * cars + k * 0.23), M = MASCOTS[(car * 3 + k) % 4], s = 0.105 * H;
        g.save(); g.translate(u * W, (1 - 0.205) * H); M(g, s, false); g.restore();
        g.save(); g.translate(u * W, (1 - 0.795) * H); g.rotate(Math.PI); M(g, s, false); g.restore();
      }
      B(g, 0.08, 0.92, '#3A4048', u1 - 0.0015, u1 + 0.0015);
    }
    for (const [u0, u1] of [[0, nu * 0.95], [1 - nu * 0.95, 1]]) { B(g, 0.12, 0.88, '#16181C', u0, u1); B(g, 0.3, 0.7, line, u0, u1); B(g, 0.34, 0.66, '#1E2A36', u0, u1); }   // the black face with its band
  });
  const glow = canvasTex(W, H, (g) => {
    B(g, 0, 1, '#000');
    for (const [a, b, w0, w1, on] of lit) if (on) B(g, a, b, '#F4F6EE', w0, w1);
    for (const v of [0.2, 0.8]) { B(g, v - 0.03, v + 0.03, '#FFFFFF', 0.996, 1); B(g, v - 0.03, v + 0.03, '#FF2D48', 0, 0.004); }
  });
  const train = new Group();
  train.add(new Mesh(loft(TL, prof, 30 * cars + 10, 28), new MeshStandardMaterial({ map, emissive: 0xFFFFFF, emissiveMap: glow,
    metalness: wrap ? 0.15 : 0.55, roughness: wrap ? 0.45 : 0.35, envMap: env })));
  return train;
}
const JP = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "YuGothic", "Meiryo", "Noto Sans CJK JP", "Noto Sans JP", sans-serif';
/* THE CITY'S KIT, made once and kept from course to course (userData.keep:
   disposeWorld leaves it): five kinds of wall, a roof, the street, and an
   atlas of signs. Walls are drawn in pairs, colour and light, so a window
   lit at dusk glows in the same place it shows. */
let tokyoKitMemo = null;
function tokyoKit() {
  if (tokyoKitMemo) return tokyoKitMemo;
  const r = seeded(97), env = tokyoEnvMap() || envTex;
  const kept = (t) => { t.userData.keep = true; return t; };
  const pair = (W, H, draw) => {
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const a = mk(), b = mk(), ga = a.getContext('2d'), gb = b.getContext('2d');
    gb.fillStyle = '#000'; gb.fillRect(0, 0, W, H);
    draw(ga, gb);
    const tex = (c) => { const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.wrapS = t.wrapT = RepeatWrapping; t.anisotropy = 4; return kept(t); };
    return { map: tex(a), light: tex(b) };
  };
  const lit = (g, L, x, y, w, h, col, a = 0.55) => { L.fillStyle = col; L.fillRect(x, y, w, h); g.globalAlpha = a; g.fillStyle = col; g.fillRect(x, y, w, h); g.globalAlpha = 1; };
  const WARM = ['#FFB468', '#FFCB8A', '#FF9E57', '#FFDDAA'];
  // Apartments: balconies five storeys to a 16 m tile, a window lit in four, air conditioners, washing, plants.
  const resi = pair(512, 512, (g, L) => {
    g.fillStyle = '#59615F'; g.fillRect(0, 0, 512, 512);
    blotches(g, 512, 512, r, 18, 30, 110, ['40,46,46,0.3', '120,126,122,0.2', '70,60,50,0.18']);
    for (let i = 0; i < 26; i++) {
      const x = r() * 512, y = r() * 512, h = 40 + r() * 140, lg = g.createLinearGradient(0, y, 0, y + h);
      lg.addColorStop(0, 'rgba(24,28,28,0.35)'); lg.addColorStop(1, 'rgba(24,28,28,0)');
      g.fillStyle = lg; g.fillRect(x, y, 4 + r() * 14, h);
    }
    const FH = 512 / 5, BW = 128;
    for (let f = 0; f < 5; f++) for (let b = 0; b < 4; b++) {
      const x = b * BW, y = f * FH, wx = x + 18, wy = y + 20, ww = BW - 36, wh = FH - 48;
      g.fillStyle = '#161C1E'; g.fillRect(x + 10, y + 14, BW - 20, FH - 34);
      if (r() < 0.42) {
        lit(g, L, wx, wy, ww, wh, r() < 0.15 ? '#9FD8FF' : WARM[Math.floor(r() * 4)]);
        if (r() < 0.5) { const cw = ww * (0.2 + r() * 0.5); L.fillStyle = 'rgba(0,0,0,0.6)'; L.fillRect(wx + (r() < 0.5 ? 0 : ww - cw), wy, cw, wh); }
      } else { g.fillStyle = '#222C30'; g.fillRect(wx, wy, ww, wh); }
      g.fillStyle = '#7F8786'; g.fillRect(x, y + FH - 14, BW, 10);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y + FH - 4, BW, 4);
      g.fillStyle = '#8C9493'; g.fillRect(x + 10, y + FH - 30, BW - 20, 3);
      if (r() < 0.55) { g.fillStyle = '#B9BFBD'; g.fillRect(x + BW - 44, y + FH - 38, 26, 20); g.fillStyle = '#4A5052'; g.beginPath(); g.arc(x + BW - 31, y + FH - 28, 6, 0, 7); g.fill(); }
      if (r() < 0.18) for (let k = 0; k < 4; k++) { g.fillStyle = ['#D8C8B0', '#8FA8C8', '#C87A6A', '#E8E0D0'][k]; g.fillRect(x + 24 + k * 14, y + FH - 28, 10, 12 + r() * 6); }
      if (r() < 0.12) { g.fillStyle = '#4E7A48'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + 20 + r() * 60, y + FH - 30, 5 + r() * 5, 0, 7); g.fill(); } }
    }
  });
  // Offices: dark glass three storeys to a 12 m tile, panes lit cool or warm, spandrels, mullions.
  const glass = pair(512, 512, (g, L) => {
    const lg = g.createLinearGradient(0, 0, 512, 512);
    lg.addColorStop(0, '#20343C'); lg.addColorStop(0.5, '#172830'); lg.addColorStop(1, '#2A4048');
    g.fillStyle = lg; g.fillRect(0, 0, 512, 512);
    const FH = 512 / 3;
    for (let f = 0; f < 3; f++) {
      for (let p = 0; p < 8; p++) if (r() < 0.4) lit(g, L, p * 64 + 3, f * FH + 26, 58, FH - 30, r() < 0.7 ? '#D6EEFF' : '#FFE2BC', 0.25);
      g.fillStyle = '#2C383C'; g.fillRect(0, f * FH, 512, 24);
      g.fillStyle = 'rgba(160,200,210,0.12)'; g.fillRect(0, f * FH + 24, 512, 3);
    }
    for (let p = 0; p <= 8; p++) { g.fillStyle = '#0C1416'; g.fillRect(p * 64 - 2, 0, 4, 512); L.fillStyle = '#000'; L.fillRect(p * 64 - 2, 0, 4, 512); }
  });
  // White towers: pale panels, a ribbon of windows to each storey, a strip of warm light under it, fins.
  const white = pair(512, 512, (g, L) => {
    g.fillStyle = '#D5D3CC'; g.fillRect(0, 0, 512, 512);
    blotches(g, 512, 512, r, 12, 30, 90, ['170,168,160,0.3', '236,234,228,0.3', '120,110,96,0.15']);
    const FH = 512 / 3;
    for (let f = 0; f < 3; f++) {
      const y = f * FH + 40, h = 62;
      g.fillStyle = '#1D2A30'; g.fillRect(0, y, 512, h);
      for (let s = 0; s < 8; s++) if (r() < 0.45) lit(g, L, s * 64 + 2, y + 2, 60, h - 4, r() < 0.6 ? '#FFE3BF' : '#DDF2FF', 0.3);
      L.fillStyle = '#FFCF9A'; L.fillRect(0, y + h + 6, 512, 4);
      g.fillStyle = '#FFE6C8'; g.fillRect(0, y + h + 6, 512, 4);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y + h, 512, 6);
    }
    for (let v = 0; v < 4; v++) { g.fillStyle = '#ECEAE4'; g.fillRect(v * 128 + 60, 0, 10, 512); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(v * 128 + 70, 0, 4, 512); }
  });
  // Old industry: soot-black brick and concrete, pipes up the wall, small windows glowing orange.
  const grime = pair(512, 512, (g, L) => {
    g.fillStyle = '#4A403A'; g.fillRect(0, 0, 512, 512);
    blotches(g, 512, 512, r, 30, 20, 100, ['30,26,24,0.35', '110,70,48,0.25', '96,90,84,0.25']);
    for (let f = 0; f < 5; f++) for (let k = 0; k < 5; k++) {
      const x = k * 102 + 30, y = f * 102.4 + 28;
      g.fillStyle = '#15110F'; g.fillRect(x, y, 44, 36);
      if (r() < 0.32) lit(g, L, x + 3, y + 3, 38, 30, r() < 0.7 ? '#FF9A45' : '#FFD27A', 0.4);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, y + 36, 44, 16);
    }
    for (const px of [12, 238, 470]) {
      const lg = g.createLinearGradient(px, 0, px + 16, 0);
      lg.addColorStop(0, '#2A2622'); lg.addColorStop(0.4, '#8A8076'); lg.addColorStop(1, '#3A342E');
      g.fillStyle = lg; g.fillRect(px, 0, 16, 512);
      for (let y = 30; y < 512; y += 102.4) { g.fillStyle = '#2A2622'; g.fillRect(px - 3, y, 22, 6); }
    }
    g.fillStyle = '#6E665E'; g.fillRect(0, 300, 512, 10); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 310, 512, 4);
  });
  // The street's shopfronts, 6 m to the tile and fixed to the street: lit windows, awnings, a sign over each shop.
  const SHOPS = ['ラーメン', 'コンビニ', '薬', '酒', 'カフェ', '花', '寿司', '電器', '本', '服', '茶', '肉', 'うどん', '質'];
  const podium = pair(512, 256, (g, L) => {
    const px = 512 / 12, Y = (mm) => 256 - mm * px;
    g.fillStyle = '#3A4042'; g.fillRect(0, 0, 512, 256);
    blotches(g, 512, 256, r, 14, 16, 60, ['24,28,30,0.4', '90,96,96,0.25']);
    for (let s = 0; s < 3; s++) {
      const x0 = s * 4 * px, w = 4 * px, wy0 = Y(2.9), wy1 = Y(0.2);
      if (r() < 0.18) {
        g.fillStyle = '#6A6E6E'; g.fillRect(x0 + 8, wy0, w - 16, wy1 - wy0);
        g.fillStyle = 'rgba(0,0,0,0.16)'; for (let y = wy0; y < wy1; y += 10) g.fillRect(x0 + 8, y, w - 16, 2);
      } else {
        lit(g, L, x0 + 8, wy0, w - 16, wy1 - wy0, ['#FFE4BC', '#D8F4FF', '#FFC8E8', '#FFD08A', '#E8FFD8'][Math.floor(r() * 5)], 0.6);
        L.fillStyle = 'rgba(0,0,0,0.35)'; for (const sy of [0.35, 0.6, 0.85]) L.fillRect(x0 + 12, wy0 + (wy1 - wy0) * sy, w - 24, 4);
        L.fillStyle = 'rgba(0,0,0,0.55)'; for (let k = 0; k < 3; k++) L.fillRect(x0 + 20 + r() * (w - 50), wy1 - 34 - r() * 10, 10, 34);
      }
      g.fillStyle = ['#B8262E', '#1F5FA8', '#2E7D4F', '#E8E2D4', '#D8A020', '#6A3A8A'][Math.floor(r() * 6)];
      g.fillRect(x0 + 4, Y(3.35), w - 8, Y(2.95) - Y(3.35));
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0 + 4, Y(2.95), w - 8, 4);
      const sc = ['#FF3B3B', '#FFD23F', '#3BD1FF', '#FF5FB0', '#FFFFFF', '#FF8A3A'][Math.floor(r() * 6)], sy0 = Y(4.3), sy1 = Y(3.5);
      g.fillStyle = '#141414'; g.fillRect(x0 + 10, sy0, w - 20, sy1 - sy0);
      const txt = SHOPS[Math.floor(r() * SHOPS.length)];
      for (const c of [g, L]) {
        c.fillStyle = sc; c.font = `900 ${Math.round((sy1 - sy0) * 0.72)}px ${JP}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(txt, x0 + w / 2, (sy0 + sy1) / 2 + 1, w - 30);
      }
    }
    for (let k = 0; k < 6; k++) { const x = 20 + k * 82; g.fillStyle = '#1A2022'; g.fillRect(x, Y(5.7), 44, Y(4.8) - Y(5.7)); if (r() < 0.4) lit(g, L, x + 3, Y(5.6), 38, Y(4.9) - Y(5.6), WARM[Math.floor(r() * 4)], 0.4); }
  });
  const roofT = kept(canvasTex(256, 256, (g) => {
    g.fillStyle = '#3E4446'; g.fillRect(0, 0, 256, 256);
    blotches(g, 256, 256, r, 20, 16, 60, ['28,32,34,0.4', '96,102,100,0.3', '70,60,50,0.2']);
    g.fillStyle = 'rgba(20,24,26,0.6)'; for (let i = 0; i < 4; i++) g.fillRect(r() * 220, r() * 220, 20 + r() * 20, 20 + r() * 20);
  }, true));
  const groundT = kept(canvasTex(512, 512, (g) => {        // asphalt, wet in patches
    g.fillStyle = '#2C3234'; g.fillRect(0, 0, 512, 512);
    blotches(g, 512, 512, r, 40, 30, 120, ['16,18,20,0.45', '62,68,70,0.3', '48,44,40,0.3']);
  }, true));
  /* THE SIGNS, in one atlas: sixteen tall ones that stick out into the avenue,
     one character above another, and eight that run across a shopfront. Real
     words a Tokyo street would carry, a few of them this city's own: oxygen,
     rations, clean water, cyber-bodies, "under surveillance". */
  const SV = [['ラーメン', '#C8202A', '#FFFFFF'], ['居酒屋', '#141414', '#FF6A3A', 1], ['薬局', '#F4F2EC', '#1E8F4E'], ['寿司', '#1B3F8A', '#FFFFFF'],
              ['焼き鳥', '#141414', '#FF4A3A', 1], ['天ぷら', '#F2C230', '#141414'], ['旅館', '#3A2A1E', '#F2E2C0'], ['蕎麦', '#101014', '#40E8FF', 1],
              ['銭湯', '#F4F0E6', '#1F66C8'], ['喫茶', '#5A3A28', '#F8E6C8'], ['甘味処', '#B01E24', '#FFFFFF'], ['和菓子', '#1E7A45', '#FFFFFF'],
              ['宿', '#6E1418', '#F2C45A'], ['酒場', '#141414', '#FF4FC8', 1], ['東京', '#FFFFFF', '#D0202A'], ['うどん', '#F4F2EC', '#C8202A']];
  const SHZ = [['カラオケ', '#FF4FA0', '#FFFFFF'], ['ホテル', '#1B2A6E', '#FFD23F'], ['24時間', '#FFFFFF', '#D0202A'], ['営業中', '#1E8F4E', '#FFFFFF'],
               ['渋谷', '#141414', '#40E8FF', 1], ['ゲーム', '#6A2AC8', '#FFFFFF'], ['地下鉄', '#1F66C8', '#FFFFFF'], ['出口', '#F2C230', '#141414']];
  const AW = 1024, AH = 1280, uv = (x, y, w, h) => [x / AW, (x + w) / AW, 1 - (y + h) / AH, 1 - y / AH];
  const atlas = kept(canvasTex(AW, AH, (g) => {
    const panel = (x, y, w, h, [txt, bg, fg, neon], vertical) => {
      g.fillStyle = bg; g.fillRect(x + 4, y + 4, w - 8, h - 8);
      g.strokeStyle = neon ? fg : 'rgba(0,0,0,0.35)'; g.lineWidth = 6; g.strokeRect(x + 12, y + 12, w - 24, h - 24);
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (neon) { g.shadowColor = fg; g.shadowBlur = 14; }
      const chars = [...txt];
      if (vertical) {
        const step = (h - 64) / chars.length, sz = Math.min(92, step * 0.9);
        g.font = `900 ${sz}px ${JP}`;
        chars.forEach((ch, i) => {
          const cy = y + 32 + (i + 0.5) * step;
          if (ch === 'ー') { g.save(); g.translate(x + w / 2, cy); g.rotate(Math.PI / 2); g.fillText(ch, 0, 0); g.restore(); }   // the long mark stands upright in a column
          else g.fillText(ch, x + w / 2, cy);
        });
      } else {
        g.font = `900 ${Math.min(80, (w - 40) / chars.length * 1.05)}px ${JP}`;
        g.fillText(txt, x + w / 2, y + h / 2 + 2, w - 34);
      }
      g.shadowBlur = 0;
    };
    SV.forEach((s, i) => panel((i % 8) * 128, Math.floor(i / 8) * 512, 128, 512, s, true));
    SHZ.forEach((s, i) => panel((i % 4) * 256, 1024 + Math.floor(i / 4) * 128, 256, 128, s, false));
  }));
  const keepMat = (m) => { m.userData.keep = true; return m; };
  const facade = (t, sw, sh, dy, extra = {}) => keepMat(hazed(cityMapped(new MeshStandardMaterial({ map: t.map, emissive: 0xFFFFFF, emissiveMap: t.light,
    emissiveIntensity: 1.05, roughness: 0.85, ...extra }), sw, sh, dy)));
  const roofMat = keepMat(hazed(cityMapped(new MeshStandardMaterial({ map: roofT, roughness: 0.95 }), 1 / 10, 1 / 10, 0)));
  tokyoKitMemo = {
    mats: {
      resi: [facade(resi, 1 / 16, 1 / 16, 6), roofMat],
      glass: [facade(glass, 1 / 12, 1 / 12, 6, { roughness: 0.3, metalness: 0.4, envMap: env, envMapIntensity: 0.7 }), roofMat],
      white: [facade(white, 1 / 12, 1 / 12, 6, { roughness: 0.6 }), roofMat],
      grime: [facade(grime, 1 / 16, 1 / 16, 6), roofMat],
      podium: [facade(podium, 1 / 12, 1 / 6, 0), roofMat],
    },
    ground: keepMat(hazed(new MeshStandardMaterial({ map: groundT, roughness: 0.62, metalness: 0.2, envMap: env, envMapIntensity: 0.45 }))),
    signs: keepMat(hazed(new MeshBasicMaterial({ map: atlas }))),
    tall: SV.map((_, i) => uv((i % 8) * 128 + 4, Math.floor(i / 8) * 512 + 4, 120, 504)),
    wide: SHZ.map((_, i) => uv((i % 4) * 256 + 4, 1024 + Math.floor(i / 4) * 128 + 4, 248, 120)),
  };
  return tokyoKitMemo;
}
/* THE SCREENS on the corners, two frames each, turning over now and then:
   koi in dark water, 東京 ("Tokyo") then 渋谷 ("Shibuya"), Fuji at dusk, a
   steaming bowl of ramen, a daruma (its second eye painted in when the wish
   comes true), a lucky cat waving. */
const SCREENS = [
  (g, k) => {
    g.fillStyle = '#082440'; g.fillRect(0, 0, 256, 160);
    g.strokeStyle = 'rgba(120,200,255,0.35)'; g.lineWidth = 2;
    for (const [x, y, rr] of [[60, 40, 18 + k * 8], [200, 120, 26 - k * 8], [150, 30, 10 + k * 6]]) { g.beginPath(); g.arc(x, y, rr, 0, 7); g.stroke(); }
    g.save(); g.translate(128 + (k ? 12 : -12), 84); g.rotate(k ? 0.35 : -0.2);
    g.fillStyle = '#FF7A2A'; g.beginPath(); g.ellipse(0, 0, 54, 20, 0, 0, 7); g.fill();
    g.fillStyle = '#FFF4E8'; g.beginPath(); g.ellipse(-8, -4, 26, 11, 0, 0, 7); g.fill();
    g.fillStyle = '#FF7A2A'; g.beginPath(); g.moveTo(-48, 0); g.lineTo(-86, k ? -24 : -16); g.lineTo(-86, k ? 18 : 24); g.closePath(); g.fill();
    g.fillStyle = '#141414'; g.beginPath(); g.arc(40, -5, 3, 0, 7); g.fill();
    g.restore();
  },
  (g, k) => {
    g.fillStyle = '#C8202A'; g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#FFFFFF'; g.font = `900 ${k ? 84 : 96}px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(k ? '渋谷' : '東京', 128, 84, 236);
    g.fillStyle = 'rgba(0,0,0,0.16)'; for (let y = 0; y < 160; y += 4) g.fillRect(0, y, 256, 2);
  },
  (g, k) => {
    const lg = g.createLinearGradient(0, 0, 0, 160);
    lg.addColorStop(0, '#2A4A7A'); lg.addColorStop(0.62, '#F4A07A'); lg.addColorStop(1, '#F8D8A8');
    g.fillStyle = lg; g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#E8402E'; g.beginPath(); g.arc(176, 72 + k * 8, 24, 0, 7); g.fill();
    g.fillStyle = '#3A4A6A'; g.beginPath(); g.moveTo(16, 160); g.lineTo(104, 56); g.lineTo(152, 56); g.lineTo(240, 160); g.closePath(); g.fill();
    g.fillStyle = '#F4F4F2'; g.beginPath(); g.moveTo(104, 56); g.lineTo(152, 56); g.lineTo(166, 74); g.lineTo(150, 70); g.lineTo(138, 82); g.lineTo(124, 70); g.lineTo(106, 78); g.lineTo(92, 72); g.closePath(); g.fill();
    g.fillStyle = '#FFFFFF'; g.font = `900 22px ${JP}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('富士山', 12, 20);
  },
  (g, k) => {
    g.fillStyle = '#3A1A0C'; g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#D8262E'; g.beginPath(); g.moveTo(58, 88); g.quadraticCurveTo(128, 170, 198, 88); g.closePath(); g.fill();
    g.fillStyle = '#F4E6C8'; g.fillRect(56, 84, 144, 8);
    g.strokeStyle = '#FFE08A'; g.lineWidth = 3; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(80 + i * 22, 90); g.quadraticCurveTo(90 + i * 22, 70, 84 + i * 22, 56); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 4;
    for (const x of [96, 128, 160]) { g.beginPath(); g.moveTo(x, 50); g.bezierCurveTo(x - 12 + k * 20, 36, x + 12 - k * 20, 26, x, 10); g.stroke(); }
    g.fillStyle = '#FFFFFF'; g.font = `900 24px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ラーメン', 128, 142);
  },
  (g, k) => {
    g.fillStyle = '#F4E6C8'; g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#C8202A'; g.beginPath(); g.ellipse(128, 88, 58, 64, 0, 0, 7); g.fill();
    g.fillStyle = '#F8F0E0'; g.beginPath(); g.ellipse(128, 76, 34, 28, 0, 0, 7); g.fill();
    g.strokeStyle = '#1A1A1A'; g.lineWidth = 3;
    for (const sx of [-1, 1]) { g.beginPath(); g.arc(128 + sx * 14, 74, 9, 0, 7); g.stroke(); }
    g.fillStyle = '#1A1A1A'; g.beginPath(); g.arc(114, 74, 5, 0, 7); g.fill();
    if (k) { g.beginPath(); g.arc(142, 74, 5, 0, 7); g.fill(); }
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(128 + sx * 6, 60); g.quadraticCurveTo(128 + sx * 18, 52, 128 + sx * 28, 62); g.stroke(); }
    g.fillStyle = '#F2C230'; g.font = `900 22px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('福', 128, 126);
  },
  (g, k) => {
    g.fillStyle = '#F4E4C4'; g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#FFFFFF'; g.strokeStyle = '#1A1A1A'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(128, 112, 44, 40, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.arc(128, 62, 34, 0, 7); g.fill(); g.stroke();
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(128 + s * 30, 44); g.lineTo(128 + s * 22, 22); g.lineTo(128 + s * 10, 34); g.fill(); g.stroke(); }
    g.fillStyle = '#D8262E'; g.fillRect(96, 90, 64, 8);
    g.fillStyle = '#F2C230'; g.beginPath(); g.arc(128, 104, 9, 0, 7); g.fill();
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.ellipse(176, k ? 48 : 70, 12, 20, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#1A1A1A'; for (const s of [-1, 1]) { g.beginPath(); g.arc(128 + s * 12, 58, 3.5, 0, 7); g.fill(); }
  },
];
/* THE CITY'S ANIME: Hana, a magical girl of its own (nobody else's): pink hair
   cut in a bob, cat ears on her headband, big violet eyes, a sailor collar, a
   star on a wand. Drawn round (0, 0), s the radius of her head; `wink` shuts
   her right eye. */
function animeGirl(g, s, wink) {
  const hair = '#FF78B4', hairDark = '#E0508E';
  g.fillStyle = hair; g.beginPath(); g.ellipse(0, 0.22 * s, 1.16 * s, 1.2 * s, 0, 0, 7); g.fill();                    // her hair, behind
  for (const sx of [-1, 1]) {                                                                                         // cat ears on the headband
    g.fillStyle = hair; g.beginPath(); g.moveTo(sx * 0.98 * s, -0.5 * s); g.lineTo(sx * 0.82 * s, -1.38 * s); g.lineTo(sx * 0.24 * s, -0.96 * s); g.closePath(); g.fill();
    g.fillStyle = '#FFE0EE'; g.beginPath(); g.moveTo(sx * 0.84 * s, -0.66 * s); g.lineTo(sx * 0.78 * s, -1.16 * s); g.lineTo(sx * 0.42 * s, -0.92 * s); g.closePath(); g.fill();
  }
  g.fillStyle = '#FFE6D8'; g.beginPath(); g.ellipse(0, 0.16 * s, 0.88 * s, 0.84 * s, 0, 0, 7); g.fill();              // her face
  g.fillStyle = hair; g.beginPath();                                                                                  // her fringe, in points
  g.moveTo(-0.96 * s, 0.2 * s); g.quadraticCurveTo(-1.02 * s, -0.9 * s, 0, -0.98 * s); g.quadraticCurveTo(1.02 * s, -0.9 * s, 0.96 * s, 0.2 * s);
  for (let k = 0; k <= 8; k++) { const x = 0.96 * s - k * 0.24 * s, y = k % 2 ? -0.02 * s : -0.34 * s + Math.abs(k - 4) * 0.02 * s; g.lineTo(x, y); }
  g.closePath(); g.fill();
  for (const sx of [-1, 1]) {                                                                                         // the locks down each side
    g.beginPath(); g.moveTo(sx * 0.9 * s, -0.2 * s); g.quadraticCurveTo(sx * 1.02 * s, 0.5 * s, sx * 0.86 * s, 0.98 * s); g.lineTo(sx * 0.7 * s, 0.4 * s); g.closePath(); g.fill();
  }
  g.strokeStyle = hairDark; g.lineWidth = Math.max(1, 0.03 * s);
  for (const x of [-0.5, -0.1, 0.3]) { g.beginPath(); g.moveTo(x * s, -0.9 * s); g.quadraticCurveTo((x - 0.05) * s, -0.6 * s, (x - 0.1) * s, -0.3 * s); g.stroke(); }
  for (const sx of [-1, 1]) {                                                                                         // her eyes
    const ex = sx * 0.37 * s, ey = 0.26 * s;
    if (wink && sx > 0) {
      g.strokeStyle = '#3A2030'; g.lineWidth = Math.max(1.5, 0.07 * s); g.lineCap = 'round';
      g.beginPath(); g.moveTo(ex - 0.16 * s, ey - 0.02 * s); g.lineTo(ex, ey - 0.12 * s); g.lineTo(ex + 0.16 * s, ey - 0.02 * s); g.stroke();
      continue;
    }
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.ellipse(ex, ey, 0.19 * s, 0.25 * s, 0, 0, 7); g.fill();
    const ig = g.createLinearGradient(0, ey - 0.24 * s, 0, ey + 0.24 * s);
    ig.addColorStop(0, '#5A2FA8'); ig.addColorStop(0.6, '#9A6BEA'); ig.addColorStop(1, '#E0C8FF');
    g.fillStyle = ig; g.beginPath(); g.ellipse(ex + sx * 0.01 * s, ey + 0.02 * s, 0.155 * s, 0.22 * s, 0, 0, 7); g.fill();
    g.fillStyle = '#2A1440'; g.beginPath(); g.ellipse(ex + sx * 0.01 * s, ey, 0.075 * s, 0.12 * s, 0, 0, 7); g.fill();
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(ex - 0.06 * s, ey - 0.09 * s, 0.065 * s, 0, 7); g.fill();
    g.beginPath(); g.arc(ex + 0.06 * s, ey + 0.1 * s, 0.03 * s, 0, 7); g.fill();
    g.strokeStyle = '#3A2030'; g.lineWidth = Math.max(1.5, 0.07 * s); g.lineCap = 'round';                            // the lash line, flicked out
    g.beginPath(); g.ellipse(ex, ey, 0.2 * s, 0.26 * s, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.beginPath(); g.moveTo(ex + sx * 0.19 * s, ey - 0.12 * s); g.lineTo(ex + sx * 0.28 * s, ey - 0.2 * s); g.stroke();
  }
  g.fillStyle = 'rgba(255,110,140,0.5)'; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * 0.58 * s, 0.52 * s, 0.14 * s, 0.07 * s, 0, 0, 7); g.fill(); }
  g.fillStyle = '#C8384E'; g.beginPath(); g.moveTo(-0.1 * s, 0.6 * s); g.quadraticCurveTo(0, 0.76 * s, 0.1 * s, 0.6 * s); g.closePath(); g.fill();   // an open smile
  g.fillStyle = '#1E2A5A'; g.beginPath(); g.moveTo(-0.9 * s, 1.35 * s); g.lineTo(-0.5 * s, 0.92 * s); g.lineTo(0, 1.3 * s); g.lineTo(0.5 * s, 0.92 * s); g.lineTo(0.9 * s, 1.35 * s); g.closePath(); g.fill();   // her sailor collar
  g.strokeStyle = '#FFFFFF'; g.lineWidth = Math.max(1, 0.035 * s);
  g.beginPath(); g.moveTo(-0.78 * s, 1.3 * s); g.lineTo(-0.48 * s, 1.0 * s); g.lineTo(0, 1.24 * s); g.lineTo(0.48 * s, 1.0 * s); g.lineTo(0.78 * s, 1.3 * s); g.stroke();
  g.fillStyle = '#E0303A'; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(0, 1.28 * s); g.lineTo(sx * 0.28 * s, 1.16 * s); g.lineTo(sx * 0.24 * s, 1.44 * s); g.closePath(); g.fill(); }   // the bow
}
const star = (g, x, y, r1, r0, col) => {                  // a five-pointed star
  g.fillStyle = col; g.beginPath();
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r0 : r1; g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
};
const sparkles = (g, W, H, seed, k) => {                  // twinkles that move between the two frames
  const r = seeded(seed + k);
  for (let i = 0; i < 9; i++) { const x = r() * W, y = r() * H, z = 3 + r() * 5; g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(x - z, y - 1, z * 2, 2); g.fillRect(x - 1, y - z, 2, z * 2); }
};
const kawaiiTitle = (g, txt, x, y, size, fill, edge) => {
  g.font = `900 ${size}px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.strokeStyle = edge; g.lineWidth = size * 0.22; g.strokeText(txt, x, y); g.fillStyle = fill; g.fillText(txt, x, y);
};
// The screens' new frames: the mascots and Hana (the corner screens and the scramble's play them among the rest).
const KAWAII_SCREENS = [
  (g, k) => {                                              // Mike the cat, waving, then winking
    const lg = g.createLinearGradient(0, 0, 0, 160); lg.addColorStop(0, '#FFE4EE'); lg.addColorStop(1, '#FFC4D8');
    g.fillStyle = lg; g.fillRect(0, 0, 256, 160); sparkles(g, 256, 160, 5, k);
    g.fillStyle = '#FFFBF2'; g.beginPath(); g.ellipse(128, 150, 50, 40, 0, 0, 7); g.fill();
    g.save(); g.translate(128, 82); MASCOTS[0](g, 50, !!k); g.restore();
    g.save(); g.translate(186, k ? 92 : 104); g.rotate(k ? -0.5 : -0.2); g.fillStyle = '#FFFBF2'; g.beginPath(); g.ellipse(0, 0, 13, 20, 0, 0, 7); g.fill(); g.restore();
    kawaiiTitle(g, 'ミケ', 46, 34, 30, '#FFFFFF', '#E0508E');
  },
  (g, k) => {                                              // Hana, the city's own anime heroine, and her star
    const lg = g.createLinearGradient(0, 0, 256, 160); lg.addColorStop(0, '#FFD6EC'); lg.addColorStop(1, '#C8B4FF');
    g.fillStyle = lg; g.fillRect(0, 0, 256, 160); sparkles(g, 256, 160, 9, k);
    g.save(); g.translate(96, 70); animeGirl(g, 46, !!k); g.restore();
    g.strokeStyle = '#FFE070'; g.lineWidth = 4; g.beginPath(); g.moveTo(150, 140); g.lineTo(k ? 196 : 186, k ? 60 : 66); g.stroke();
    star(g, k ? 198 : 188, k ? 56 : 62, 22, 9, '#FFE070');
    kawaiiTitle(g, '魔法少女ハナ', 128, 146, 20, '#FFFFFF', '#8A3AB8');
  },
  (g, k) => {                                              // Momo the rabbit, and hearts
    g.fillStyle = '#FFF0F6'; g.fillRect(0, 0, 256, 160);
    for (let i = 0; i < 7; i++) { const x = 20 + i * 38, y = 30 + ((i + k) % 3) * 40; g.fillStyle = 'rgba(255,120,170,0.5)'; g.beginPath(); g.arc(x - 5, y, 6, 0, 7); g.arc(x + 5, y, 6, 0, 7); g.moveTo(x - 11, y + 2); g.lineTo(x, y + 14); g.lineTo(x + 11, y + 2); g.fill(); }
    g.save(); g.translate(128, 96); MASCOTS[1](g, 42, !!k); g.restore();
    kawaiiTitle(g, 'かわいい', 128, 26, 26, '#FF5FA2', '#FFFFFF');
  },
  (g, k) => {                                              // Kero the frog, safety first at the road works
    g.fillStyle = '#E8F6DC'; g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#1E9A48'; g.fillRect(0, 138, 256, 22);
    g.save(); g.translate(128, 84 + (k ? -4 : 0)); MASCOTS[2](g, 44, !!k); g.restore();
    kawaiiTitle(g, '安全第一', 128, 149, 17, '#FFFFFF', '#1E9A48');
  },
  (g, k) => {                                              // Pan the panda, and bamboo
    g.fillStyle = '#E6F4E0'; g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#6AAE50'; for (const x of [22, 44, 212, 234]) { g.fillRect(x, 0, 9, 160); for (let y = 20; y < 160; y += 36) g.fillRect(x - 1, y, 11, 3); }
    g.save(); g.translate(128, 88); g.rotate(k ? 0.12 : -0.12); MASCOTS[3](g, 46, !!k); g.restore();
    kawaiiTitle(g, 'パンダ', 128, 24, 22, '#26221F', '#FFFFFF');
  },
];
SCREENS.push(...KAWAII_SCREENS);
const tokyoDrift = (w) => {
  const K = tokyoKit(), G = w.group, r = seeded(71), end = courseEnd(), live = !REDUCED, env = tokyoEnvMap() || envTex;
  const pieces = level ? level.pieces : [];
  let lo = 0;
  for (const p of pieces) lo = Math.min(lo, p.t === 'ramp' ? Math.min(p.y0, p.y1) : (p.y || 0));
  const GROUND = lo - 26, startCam = (level ? level.start[2] : 0) + 8.6;
  STREET.value = GROUND;
  // The sky, seen only when the view turns up (out beside a loop): smog, teal above, warm where the sun has gone down.
  scene.background = coverTex(512, (g) => {
    const lg = g.createLinearGradient(0, 0, 0, 512);
    lg.addColorStop(0, '#1E2E36'); lg.addColorStop(0.45, '#48666C'); lg.addColorStop(0.72, '#C8987E'); lg.addColorStop(0.8, '#F4BE96');
    lg.addColorStop(0.86, '#6A7A78'); lg.addColorStop(1, '#2A3438');
    g.fillStyle = lg; g.fillRect(0, 0, 512, 512);
    g.fillStyle = 'rgba(88,104,120,0.85)'; g.beginPath(); g.moveTo(170, 420); g.quadraticCurveTo(250, 380, 282, 338); g.lineTo(322, 338);   // Fuji on the horizon
    g.quadraticCurveTo(354, 380, 434, 420); g.closePath(); g.fill();
    g.fillStyle = 'rgba(244,240,236,0.9)'; g.beginPath(); g.moveTo(282, 338); g.lineTo(322, 338); g.lineTo(334, 352); g.lineTo(320, 348); g.lineTo(310, 358);
    g.lineTo(300, 348); g.lineTo(288, 356); g.lineTo(272, 350); g.closePath(); g.fill();
  });
  scene.fog.color.setHex(0x587478); scene.fog.near = 50; scene.fog.far = 360;
  HAZE.col.value.setHex(0xFFB48E); HAZE.k.value = 3; HAZE.dir.set(0.05, 0.06, -1).normalize();
  hemi.color.setHex(0x9CC4C8); hemi.groundColor.setHex(0x2E2622); hemi.intensity = 0.8;
  sun.color.setHex(0xFFD6B0); sun.intensity = 1.8;
  w.marble = 'temari'; w.rings = [0x34E0FF, 0xFF6A3C]; w.glowGates = true; w.news = NEWS_TOKYO; w.rules = RULES_TOKYO;
  w.restyle = tokyoCourse;
  const m = new Matrix4(), q = new Quaternion(), e = new Euler(), pos = new Vector3(), sc = new Vector3(), col = new Color(), up = new Vector3(0, 1, 0);
  const props = [], glows = [];                            // still shapes the light falls on, and ones that shine by themselves
  const box = (L, sx, sy, sz, hex, x, y, z, ry = 0) => L.push([new BoxGeometry(sx, sy, sz), hex, placeAt(x, y, z, 0, ry, 0)]);
  const cyl = (L, rt, rb, h, seg, hex, x, y, z, rx = 0, rz = 0) => L.push([new CylinderGeometry(rt, rb, h, seg), hex, placeAt(x, y, z, rx, 0, rz)]);

  // THE AVENUE: its middle and half-width from where the course runs, and the places its pieces need kept clear.
  let minX = 1e9, maxX = -1e9;
  const keep = [], streets = [];                           // keep: [x0, x1, z0, z1, 'all' | 'low', highest roof]
  for (const p of pieces) {
    let x0, x1, z0, z1;
    if (p.t === 'plaza') { x0 = p.x0; x1 = p.x0 + p.cols * CELL; z0 = p.z0 - p.rows * CELL; z1 = p.z0; }
    else if (p.x === undefined) continue;
    else {
      const hw = p.t === 'round' ? p.ro : (p.w || 4) / 2, sh = p.shift || 0, hd = p.t === 'round' ? p.ro : (p.d || 6) / 2;
      x0 = p.x + Math.min(0, sh) - hw; x1 = p.x + Math.max(0, sh) + hw;
      if (p.t === 'ramp') { z0 = Math.min(p.z0, p.z1); z1 = Math.max(p.z0, p.z1); } else { z0 = p.z - hd; z1 = p.z + hd; }
    }
    minX = Math.min(minX, x0); maxX = Math.max(maxX, x1);
    if (p.t === 'wind') { const tx = p.x - p.dir * (p.w / 2 + TOWER_OFF + TOWER_W / 2); keep.push([tx - 3.5, tx + 3.5, z0 - 3, z1 + 3, 'all']); }
    if (p.t === 'cross') streets.push([z1 + 5, z0 - 5]);          // a crossing's traffic runs down a side street
    if (p.t === 'loop') {                                          // the camera swings out beside a loop: nothing tall there
      const side = p.shift > 0 ? -1 : 1, cx = p.x + p.shift / 2;
      keep.push([Math.min(cx + side * 4, cx + side * 16), Math.max(cx + side * 4, cx + side * 16), p.z - LOOP_RUN - 8, p.z + 8, 'low', p.y - 3]);
    }
  }
  if (minX > maxX) { minX = -4; maxX = 10; }
  const CX = (minX + maxX) / 2, HW = Math.max(6, (maxX - minX) / 2 + 1.5), IN = HW + 7.5;   // the rail's band, and the building fronts
  const Z_TOP = 70, Z_BOT = end - 330;
  for (let z = 30 - r() * 25; z > Z_BOT; z -= 58 + r() * 26) streets.push([z + 7, z - 7]);
  streets.sort((a, b) => b[0] - a[0]);
  for (let i = streets.length - 1; i > 0; i--) if (streets[i][0] > streets[i - 1][1] - 6) { streets[i - 1][1] = Math.min(streets[i - 1][1], streets[i][1]); streets.splice(i, 1); }
  const inStreet = (z0, z1) => streets.find(([hi, lowz]) => z0 < hi && z1 > lowz);
  const keepHit = (x0, x1, z0, z1) => keep.find((k) => x1 > k[0] && x0 < k[1] && z1 > k[2] && z0 < k[3]);
  // TOKYO'S SET PIECES, each at its own side street or stretch of the avenue: a scramble crossing, a temple, a festival street, the Great Wave.
  const ahead = streets.filter(([a]) => a < -20);
  const SCR = ahead[0] || null;                            // the scramble crossing: the first side street ahead
  const MATSURI = ahead.find((st) => st !== SCR) || null, WAVE = ahead.find((st) => st !== SCR && st !== MATSURI) || null;
  let TEMPLE = null;                                       // a stretch at least 46 m long between side streets, on one side
  {
    let hi = Z_TOP; const gaps = [];
    for (const [a, b] of streets) { if (a < hi) gaps.push([hi, a]); hi = Math.min(hi, b); }
    const pick = gaps.filter(([a, b]) => a - b >= 46 && a < -10).sort((g1, g2) => Math.abs((g1[0] + g1[1]) / 2 - end * 0.55) - Math.abs((g2[0] + g2[1]) / 2 - end * 0.55))[0];
    if (pick) {
      const zc = (pick[0] + pick[1]) / 2, ts = r() < 0.5 ? -1 : 1, xa = CX + ts * IN, xb = CX + ts * (IN + 40);
      TEMPLE = { s: ts, z0: zc - 21, z1: zc + 21 };
      keep.push([Math.min(xa, xb) - 0.5, Math.max(xa, xb) + 0.5, TEMPLE.z0 - 1, TEMPLE.z1 + 1, 'all']);
    }
  }

  // THE BUILDINGS: boxes of five kinds, each style one instanced mesh; a podium of shopfronts under every one.
  const B = { resi: [], glass: [], white: [], grime: [], podium: [] }, tops = [];
  const addBox = (style, cx, y0, cz, sx, h, sz, tint) => B[style].push([cx, y0 + h / 2, cz, sx, h, sz, tint]);
  const sp = [], su = [], si = [];                          // the signs, as quads over the atlas
  const quad = (cx, cy, cz, wdt, hgt, nx, nz, R) => {
    const rx = nz, rz = -nx, b = sp.length / 3, hw = wdt / 2, hh = hgt / 2;
    sp.push(cx - rx * hw, cy - hh, cz - rz * hw, cx + rx * hw, cy - hh, cz + rz * hw, cx + rx * hw, cy + hh, cz + rz * hw, cx - rx * hw, cy + hh, cz - rz * hw);
    su.push(R[0], R[2], R[1], R[2], R[1], R[3], R[0], R[3]);
    si.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const sign = (cx, cy, cz, wdt, hgt, nx, nz, R) => { quad(cx + nx * 0.03, cy, cz + nz * 0.03, wdt, hgt, nx, nz, R); quad(cx - nx * 0.03, cy, cz - nz * 0.03, wdt, hgt, -nx, -nz, R); };
  const blossoms = [], stacks = [], lowRoofs = [], fronts = [];   // [x, y, z, size, colour]; the chimneys' tops; clear low roofs; the front row
  const roofs = [], koi = [];                              // tiled roofs [x, y, z, half x, height, half z, colour]; carp streamers
  const NEON = [0xFFB040, 0xFF5A3A, 0xFFE6C0, 0xFF8A3A, 0xFF3B3B];   // the corners lit warm, as paper and sign light is: cyan and violet were the neon city's
  const addKoi = (x, y, z) => {                             // a carp-streamer pole: black, red and blue carp on the wind
    cyl(props, 0.08, 0.11, 11, 6, 0xD8D0C0, x, y + 5.5, z);
    for (let k = 0; k < 4; k++) box(props, 0.9, 0.05, 0.05, 0xF2C230, x, y + 11, z, k * Math.PI / 4);
    [4, 3.2, 2.6].forEach((L, k) => koi.push({ x, y: y + 10.1 - k * 1.45, z, L, c: [0x2A2A30, 0xD8342A, 0x2A5AB8][k], ph: r() * 9 }));
  };
  const roofStuff = (xa, xb, z0, z1, roof) => {            // what a low roof carries, seen from the rail
    const n = 2 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const x = xa + 1.5 + r() * (xb - xa - 3), z = z0 + 1.5 + r() * (z1 - z0 - 3), kind = r();
      if (kind < 0.3) box(props, 1.3, 0.9, 0.9, 0xB4BAB8, x, roof + 0.45, z, r() * 3);                      // an air conditioner
      else if (kind < 0.48) { cyl(props, 0.9, 0.9, 1.6, 12, [0xC8B89A, 0x6A8AA8, 0x8A9A92][Math.floor(r() * 3)], x, roof + 1.7, z); for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) box(props, 0.1, 0.9, 0.1, 0x3A3A3A, x + dx, roof + 0.45, z + dz); }   // a water tank on legs
      else if (kind < 0.6) { cyl(props, 0.06, 0.08, 5, 5, 0x3A3E40, x, roof + 2.5, z); glows.push([new SphereGeometry(0.16, 6, 4), 0xFF2D48, placeAt(x, roof + 5.1, z)]); }   // a mast, its red lamp
      else if (kind < 0.75) { for (let j = 0; j < 4; j++) blossoms.push([x + (r() - 0.5) * 2.4, roof + 1 + r() * 0.8, z + (r() - 0.5) * 2.4, 0.9 + r() * 0.6, r() < 0.5 ? 0 : 1]); cyl(props, 0.12, 0.16, 1.2, 5, 0x4A3A2E, x, roof + 0.6, z); }   // a garden, sakura or green
      else if (kind < 0.86) {                                                                               // a shrine and its torii
        box(props, 1.6, 1.3, 1.4, 0xE8E0D0, x, roof + 0.65, z); box(props, 2.0, 0.25, 1.8, 0x2A2E30, x, roof + 1.42, z);
        for (const dx of [-0.9, 0.9]) cyl(props, 0.09, 0.09, 2.2, 6, 0xD8342A, x + dx, roof + 1.1, z + 1.8);
        box(props, 2.5, 0.16, 0.24, 0xD8342A, x, roof + 2.25, z + 1.8); box(props, 2.1, 0.12, 0.2, 0xD8342A, x, roof + 1.85, z + 1.8);
      } else {                                                                                              // a sign on a frame, lit
        const R = K.wide[Math.floor(r() * K.wide.length)], sw = 4 + r() * 2;
        sign(x, roof + 1.9, z, sw, sw / 2, 0, 1, R);
        box(props, 0.12, 1.6, 0.12, 0x2A2A2E, x - sw * 0.4, roof + 0.8, z); box(props, 0.12, 1.6, 0.12, 0x2A2A2E, x + sw * 0.4, roof + 0.8, z);
      }
    }
  };
  // A building on the avenue: shopfronts, a body in one style, a tier on the tall ones, signs out over the street.
  const building = (xa, xb, z0, z1, roof, s) => {
    const cx = (xa + xb) / 2, cz = (z0 + z1) / 2, sx = xb - xa, sz = z1 - z0, tint = 0.68 + r() * 0.32, face = s < 0 ? xb : xa, into = -s;
    addBox('podium', cx, GROUND, cz, sx, 6, sz, tint);
    const style = roof > GROUND + 40 ? ['resi', 'glass', 'white', 'grime', 'resi'][Math.floor(r() * 5)] : ['resi', 'grime', 'resi', 'white'][Math.floor(r() * 4)];
    if (roof > GROUND + 7) {
      const inset = r() < 0.4 ? 0.7 : 0;
      addBox(style, cx, GROUND + 6, cz, sx - inset * 2, roof - GROUND - 6, sz - inset * 2, tint);
      if (roof > GROUND + 40 && r() < 0.5) { const h2 = 8 + r() * 26; addBox(style, cx - s * sx * 0.12, roof, cz, sx * 0.62, h2, sz * 0.66, tint); tops.push([cx, roof + h2, cz]); }
      else tops.push([cx, roof, cz]);
    }
    const hi = Math.min(roof - 2, GROUND + 24), n = hi > GROUND + 11 ? 1 + Math.floor(r() * 2.6) : 0;
    for (let k = 0; k < n; k++) {                          // tall signs sticking out into the avenue, facing along it
      const R = K.tall[Math.floor(r() * K.tall.length)], hgt = 4.2 + r() * 2.2, wdt = hgt / 4;
      const sy = GROUND + 6.8 + hgt / 2 + r() * Math.max(0, hi - GROUND - 7 - hgt), szz = z0 + 1 + r() * (sz - 2);
      sign(face + into * (wdt / 2 + 0.25), sy, szz, wdt, hgt, 0, 1, R);
      box(props, wdt + 0.3, 0.1, 0.1, 0x2A2A2E, face + into * (wdt / 2 + 0.15), sy + hgt / 2 + 0.06, szz);
    }
    if (r() < 0.6) sign(face + into * 0.12, GROUND + 4.95, cz, Math.min(sz - 1, 5 + r() * 3), 1.2, into, 0, K.wide[Math.floor(r() * K.wide.length)]);   // a sign along the shopfront
    if (roof > lo + 2 && r() < 0.55) {                     // light up the corners that face the avenue
      const c = NEON[Math.floor(r() * NEON.length)];
      for (const zc of [z0 + 0.12, z1 - 0.12]) box(glows, 0.16, roof - GROUND - 7, 0.16, c, face + into * 0.1, (GROUND + 6.5 + roof) / 2, zc);
    }
    if (roof < lo - 3) {
      const tiled = r() < 0.45, k0 = koi.length, s0 = stacks.length;
      if (tiled) roofs.push([cx, roof, cz, sx / 2, 2.2 + r() * 1.6, sz / 2, r() < 0.8 ? 0x3A4250 : 0x4E7A6A]);   // a tiled roof, the old way
      else roofStuff(xa, xb, z0, z1, roof);
      if (koi.length < 9 && r() < 0.12) addKoi(cx + (r() - 0.5) * sx * 0.3, roof, cz + (r() - 0.5) * sz * 0.3);
      if (s > 0 && stacks.length < 3 && r() < 0.2) {       // a chimney, downwind of the rail, venting
        const x = cx + 2, h = 16 + r() * 8;
        for (let k = 0; k < 3; k++) cyl(props, 1.0 - k * 0.1, 1.1 - k * 0.1, h / 3, 14, k % 2 ? 0xE8E4DC : 0xB8262E, x, roof + h / 6 + k * h / 3, cz);
        stacks.push([x, roof + h + 0.5, cz]);
      }
      if (!tiled && koi.length === k0 && stacks.length === s0) lowRoofs.push({ face, s, cz, sx, sz, roof });   // a clear roof, for a giant mascot
    }
    fronts.push({ s, z0, z1, roof });
  };
  // The front row: along the avenue, some under the rail and some towering over it.
  for (const s of [-1, 1]) for (let z = Z_TOP; z > Z_BOT;) {
    const wd = 7 + r() * 9, z1 = z, z0 = z - wd, st = inStreet(z0, z1);
    if (st) { z = st[1]; continue; }
    const depth = 10 + r() * 10, face = CX + s * (IN + (r() < 0.3 ? r() * 2.5 : 0));
    const xa = s < 0 ? face - depth : face, xb = s < 0 ? face : face + depth, hit = keepHit(xa, xb, z0, z1);
    if (hit && hit[4] === 'all') { z = z0 - 1; continue; }
    let roof = r() < 0.5 ? GROUND + 9 + r() * 12 : GROUND + 30 + r() * 44;
    if (hit) roof = Math.min(roof, hit[5]);
    building(xa, xb, z0, z1, roof, s);
    z = z0 - (r() < 0.25 ? 1.5 + r() * 3 : 0.3);
  }
  // The row behind: towers.
  for (const s of [-1, 1]) for (let z = Z_TOP; z > Z_BOT;) {
    const wd = 12 + r() * 18, z1 = z, z0 = z - wd, st = inStreet(z0, z1);
    if (st) { z = st[1]; continue; }
    const face = CX + s * (IN + 21 + r() * 6), depth = 16 + r() * 22, xa = s < 0 ? face - depth : face, xb = s < 0 ? face : face + depth;
    if (keepHit(xa, xb, z0, z1)?.[4] === 'all') { z = z0 - 2; continue; }
    const roof = GROUND + 50 + r() * 120, style = ['glass', 'white', 'resi', 'glass', 'grime'][Math.floor(r() * 5)], tint = 0.7 + r() * 0.3;
    addBox('podium', (xa + xb) / 2, GROUND, (z0 + z1) / 2, xb - xa, 6, wd, tint);
    addBox(style, (xa + xb) / 2, GROUND + 6, (z0 + z1) / 2, xb - xa, roof - GROUND - 6, wd, tint);
    tops.push([(xa + xb) / 2, roof, (z0 + z1) / 2]);
    z = z0 - 2 - r() * 4;
  }
  // The city beyond, in the smog: towers further out, and on past the course's end.
  for (let i = 0; i < 150; i++) {
    const s = r() < 0.5 ? -1 : 1, x = CX + s * (58 + r() * 190), z = Z_TOP - r() * (Z_TOP - Z_BOT + 60), wd = 16 + r() * 26;
    if (inStreet(z - wd / 2, z + wd / 2) && Math.abs(x - CX) < 110) continue;
    const roof = GROUND + 30 + r() * 200, style = ['glass', 'white', 'resi', 'grime'][Math.floor(r() * 4)];
    addBox(style, x, GROUND, z, 14 + r() * 24, roof - GROUND, wd, 0.6 + r() * 0.4);
    tops.push([x, roof, z]);
  }
  for (const [style, list] of Object.entries(B)) {
    if (!list.length) continue;
    const im = new InstancedMesh(twoGroupBox(), K.mats[style], list.length);
    list.forEach(([x, y, z, sx, sy, sz, tint], i) => { m.compose(pos.set(x, y, z), q.identity(), sc.set(sx, sy, sz)); im.setMatrixAt(i, m); im.setColorAt(i, col.setRGB(tint, tint, tint)); });
    G.add(im);
  }

  // THE STREET: one wide floor of wet asphalt; pavements, lane lines and crossings on it.
  const Wg = 640, Dg = Z_TOP - Z_BOT + 120, gg = new PlaneGeometry(Wg, Dg);
  gg.rotateX(-Math.PI / 2);
  const guv = gg.attributes.uv; for (let i = 0; i < guv.count; i++) guv.setXY(i, guv.getX(i) * Wg / 22, guv.getY(i) * Dg / 22);
  const ground = new Mesh(gg, K.ground); ground.position.set(CX, GROUND, (Z_TOP + Z_BOT) / 2 - 20); G.add(ground);
  const runs = [];                                         // the avenue between side streets
  { let hi = Z_TOP; for (const [a, b] of streets) { if (a < hi) runs.push([hi, a]); hi = Math.min(hi, b); } if (hi > Z_BOT) runs.push([hi, Z_BOT]); }
  const road = HW;                                         // the roadway's half width, under the rail
  for (const [a, b] of runs) {
    const zc = (a + b) / 2, len = a - b;
    for (const s of [-1, 1]) box(props, 3.4, 0.3, len, 0x5E6462, CX + s * (IN - 1.7), GROUND + 0.15, zc);
    for (let x = CX - road + 3.3; x < CX + road - 0.5; x += 3.3) {                                       // dashed lane lines
      if (Math.abs(x - CX) < 0.6) continue;
      for (let z = a - 3; z > b + 2; z -= 9) box(props, 0.14, 0.03, 3, 0xC8C8C0, x, GROUND + 0.02, z - 1.5);
    }
    box(props, 0.3, 0.03, len, 0xC8B040, CX, GROUND + 0.02, zc);                                          // the centre line
  }
  for (const [a, b] of streets) for (const zc of [a - 1.8, b + 1.8]) for (let x = CX - IN + 3.6; x < CX + IN - 3.4; x += 1.1) box(props, 0.55, 0.03, 3.2, 0xD2D2CA, x, GROUND + 0.02, zc);   // zebra crossings
  // Street lamps along the kerbs, vending machines against the shops, and the light they throw on the wet street.
  const pools = [];                                        // [x, z, size, colour]
  for (const s of [-1, 1]) for (const [a, b] of runs) {
    for (let z = a - 6; z > b + 4; z -= 17) {
      const x = CX + s * (IN - 3.2);
      cyl(props, 0.1, 0.14, 7.5, 6, 0x2E3436, x, GROUND + 3.75, z);
      box(props, 1.6, 0.12, 0.16, 0x2E3436, x - s * 0.7, GROUND + 7.4, z);
      box(glows, 0.9, 0.12, 0.3, 0xFFE6C0, x - s * 1.2, GROUND + 7.3, z);
      pools.push([x - s * 1.4, z, 7, 0xFFC890]);
    }
    for (let z = a - 3; z > b + 3; z -= 4) pools.push([CX + s * (IN - 1.6), z - r() * 2, 4.5, [0xFFB468, 0x9FD8FF, 0xFF7FB0, 0xFFD890][Math.floor(r() * 4)]]);
    for (let z = a - 4 - r() * 10; z > b + 3; z -= 14 + r() * 20) {
      const x = CX + s * (IN - 0.45), n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) box(glows, 0.75, 1.9, 0.9, [0xE8F4FF, 0x9FD8FF, 0xFF6A6A, 0xFFF0C8][Math.floor(r() * 4)], x, GROUND + 1.25, z - k * 0.95);
    }
  }
  if (pools.length) {
    const pm = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), hazed(new MeshBasicMaterial({ map: dot, transparent: true, opacity: 0.22,
      blending: AdditiveBlending, depthWrite: false })), pools.length);
    pools.forEach(([x, z, s, c], i) => { m.compose(pos.set(x, GROUND + 0.06, z), q.identity(), sc.set(s, 1, s)); pm.setMatrixAt(i, m); pm.setColorAt(i, col.setHex(c)); });
    pm.renderOrder = -1; G.add(pm);
  }
  // SKYWALKS across the avenue, below the rail: enclosed bridges, lit inside.
  const walks = [];
  for (const t of [0.3, 0.75]) {
    const z = t * end - 6;
    if (end > -80 && t > 0.5) continue;
    if (inStreet(z - 3, z + 3)) continue;
    walks.push(z);
    box(props, IN * 2, 3.2, 3.2, 0x2C3238, CX, GROUND + 8.05, z);
    for (const dz of [-1.62, 1.62]) box(glows, IN * 2 - 1, 0.7, 0.04, 0xFFD7A6, CX, GROUND + 8.3, z + dz);
  }
  const nearWalk = (z) => walks.some((wz) => Math.abs(wz - z) < 3.5);
  // THE RAIL'S GANTRIES: it stands on pedestals on steel crossbeams over the avenue, each beam on a column at either kerb, so the traffic
  // runs free beneath. Dark, and well below the rail, or from above a beam would read as more course.
  const gz = [];
  for (const c of colliders) {
    if (c.obstacle || c.holo || c.cell || c.ferry) continue;
    const hz = c.half.z, n = Math.abs(c.quat.x) > 1e-3 ? 1 : Math.max(1, Math.round(hz * 2 / 16));
    for (let k = 0; k < n; k++) gz.push([c.pos.z + hz - (k + 0.5) * (hz * 2 / n), c.pos.y - c.half.y - 0.02]);
  }
  for (const P of plazas) for (const az of [-1, 1]) gz.push([P.z0 - P.rows * CELL / 2 + az * P.rows * CELL / 4, P.y - THICK - 0.02]);
  gz.sort((a, b) => b[0] - a[0]);
  let lastG = 1e9;
  for (const [z, top] of gz) {
    if (lastG - z < 14 || nearWalk(z)) continue;
    lastG = z;
    const beam = top - 3.2, H = beam - 0.45 - GROUND;
    for (const s of [-1, 1]) box(props, 1.0, H, 1.0, 0x46505A, CX + s * (HW + 0.6), GROUND + H / 2, z);
    box(props, 2 * HW + 2.0, 0.7, 0.7, 0x3E4850, CX, beam, z);
    for (const c of colliders) {                           // a pedestal up to each stretch of rail above this beam
      if (c.obstacle || c.holo || c.ferry || Math.abs(c.pos.z - z) > c.half.z || Math.abs(c.quat.x) > 1e-3) continue;
      const ptop = c.pos.y - c.half.y - 0.02;
      if (Math.abs(ptop - top) < 0.5) box(props, 0.9, ptop - beam - 0.45, 0.9, 0x39424A, c.pos.x, (ptop + beam + 0.45) / 2, z);
    }
  }
  // LANTERNS in rows along the shopfronts, under the eaves, where the izakaya are.
  const lanterns = [];
  for (const s of [-1, 1]) for (const [a, b] of runs) for (let z = a - 4 - r() * 12; z > b + 6; z -= 18 + r() * 22) {
    const len = 6 + r() * 10, c = r() < 0.7 ? 0xFF3A2A : [0xFFF0D8, 0xFFB040][Math.floor(r() * 2)];
    for (let k = 0; k < len; k += 1.3) lanterns.push([CX + s * (IN - 0.7), GROUND + 3.3, z - k, c]);
  }
  // A FESTIVAL down one side street: stalls under striped awnings, each with its lantern, and lanterns strung across overhead.
  if (MATSURI) {
    const zc = (MATSURI[0] + MATSURI[1]) / 2;
    for (const s of [-1, 1]) for (let d = 4; d < 46; d += 3.3) {
      const x = CX + s * (IN + d);
      for (const side of [-1, 1]) {
        const z = zc + side * 4.6;
        box(props, 2.6, 1.1, 1.6, 0x6A4A32, x, GROUND + 0.55, z);
        box(props, 2.9, 0.12, 2.1, [0xD8342A, 0x2A5AB8, 0xE8E0D0, 0xF2C230][Math.floor(r() * 4)], x, GROUND + 2.5, z - side * 0.2);
        for (const dx of [-1.3, 1.3]) box(props, 0.08, 2.4, 0.08, 0x3A2A1E, x + dx, GROUND + 1.2, z + side * 0.7);
        lanterns.push([x, GROUND + 2.05, z - side * 0.9, 0xFF3A2A]);
      }
      for (let k = -5; k <= 5.01; k += 1.25) lanterns.push([x, GROUND + 5.2 - 0.3 * (1 - (k / 5) ** 2), zc + k, Math.round(k / 1.25) % 3 ? 0xFF3A2A : 0xFFF0D8]);
    }
  }
  if (lanterns.length) {
    const lm = new InstancedMesh(new SphereGeometry(0.26, 8, 6), hazed(new MeshBasicMaterial({ color: 0xFFFFFF })), lanterns.length);
    lanterns.forEach(([x, y, z, c], i) => { m.compose(pos.set(x, y, z), q.identity(), sc.set(1, 1.35, 1)); lm.setMatrixAt(i, m); lm.setColorAt(i, col.setHex(c)); });
    G.add(lm);
  }
  // THE SCRAMBLE CROSSING: stripes corner to corner as well as across, like Shibuya's.
  if (SCR) {
    const [za, zb] = SCR, xL = CX - IN + 3.5, xR = CX + IN - 3.5;
    for (const [x0, z0, x1, z1] of [[xL, za - 1.5, xR, zb + 1.5], [xR, za - 1.5, xL, zb + 1.5]]) {
      const len = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / len, dz = (z1 - z0) / len, ry = Math.atan2(-dx, -dz);
      for (let k = 1.2; k < len - 1; k += 1.1) box(props, 3.4, 0.03, 0.55, 0xD2D2CA, x0 + dx * k, GROUND + 0.025, z0 + dz * k, ry);
    }
    for (const s of [-1, 1]) for (let z = zb + 1; z < za - 0.5; z += 1.1) box(props, 3.2, 0.03, 0.55, 0xD2D2CA, CX + s * (IN - 1.7), GROUND + 0.025, z);
  }
  // A torii: two vermilion pillars, a black cap over a red lintel, a tie beam; its beams run along its own x.
  const torii = (x, y, z, ry, H, Wd) => {
    for (const k of [-1, 1]) cyl(props, 0.28, 0.32, H, 10, 0xD8342A, x + Math.cos(ry) * k * Wd / 2, y + H / 2, z - Math.sin(ry) * k * Wd / 2);
    box(props, Wd + 1.8, 0.42, 0.62, 0x1E1E22, x, y + H + 0.24, z, ry);
    box(props, Wd + 1.4, 0.34, 0.5, 0xD8342A, x, y + H - 0.16, z, ry);
    box(props, Wd + 0.5, 0.3, 0.34, 0xD8342A, x, y + H - 1.3, z, ry);
  };
  const toro = (x, y, z) => {                              // a stone lantern, its fire box lit
    box(props, 0.72, 0.26, 0.72, 0x8E8A82, x, y + 0.13, z); cyl(props, 0.15, 0.19, 1.0, 8, 0x8E8A82, x, y + 0.76, z);
    box(props, 0.62, 0.12, 0.62, 0x8E8A82, x, y + 1.32, z); box(glows, 0.42, 0.42, 0.42, 0xFFC878, x, y + 1.59, z);
    roofs.push([x, y + 1.8, z, 0.44, 0.45, 0.44, 0x8E8A82]);
  };
  // THE TEMPLE: a gravel precinct off the avenue, a great gate with its giant red lantern, stone lanterns along the path, the main
  // hall, a five-storey pagoda, sakura, a torii and a carp pole.
  if (TEMPLE) {
    const ts = TEMPLE.s, tz = (TEMPLE.z0 + TEMPLE.z1) / 2, tx = (d) => CX + ts * (IN + d), G0 = GROUND + 0.3;
    box(props, 40, 0.3, 42, 0xB8B0A0, tx(20), GROUND + 0.15, tz);
    for (const dz of [-3.4, 3.4]) for (const d of [0.8, 3.2]) cyl(props, 0.34, 0.38, 7, 10, 0xD8342A, tx(d), G0 + 3.5, tz + dz);
    box(props, 3.4, 0.7, 8.4, 0x8A2A22, tx(2), G0 + 7.1, tz);
    roofs.push([tx(2), G0 + 7.4, tz, 2.9, 3.1, 5.3, 0x3A4250]);
    glows.push([new SphereGeometry(1.3, 18, 12), 0xE8402E, placeAt(tx(2), G0 + 4.3, tz, 0, 0, 0, 1, 1.5, 1)]);    // the giant red lantern
    for (const dy of [-1.95, 1.95]) cyl(props, 0.95, 0.95, 0.3, 16, 0x1E1E22, tx(2), G0 + 4.3 + dy, tz);
    for (let d = 8; d <= 22; d += 3.5) for (const dz of [-3.2, 3.2]) toro(tx(d), G0, tz + dz);
    box(props, 12, 6.5, 16, 0xEEE6D8, tx(30), G0 + 3.25, tz);
    for (let k = -3; k <= 3; k++) cyl(props, 0.3, 0.32, 6.5, 8, 0xD8342A, tx(23.8), G0 + 3.25, tz + k * 2.3);
    roofs.push([tx(30), G0 + 6.4, tz, 8.2, 5.2, 10.4, 0x3E4854]);
    const pz = tz - 12;                                     // the pagoda: five storeys, each under its own roof, a bronze spire
    let py = G0;
    box(props, 7.2, 1.2, 7.2, 0x9A948A, tx(14), py + 0.6, pz); py += 1.2;
    for (let i = 0; i < 5; i++) {
      const bw = 5 - i * 0.55;
      box(props, bw, 3.2, bw, i % 2 ? 0xD8342A : 0xE8DCC8, tx(14), py + 1.6, pz);
      roofs.push([tx(14), py + 3.0, pz, bw / 2 + 1.5, 1.5, bw / 2 + 1.5, 0x3A4250]);
      py += 3.7;
    }
    cyl(props, 0.16, 0.28, 7, 8, 0x5A4A38, tx(14), py + 3.5, pz);
    for (let k = 0; k < 9; k++) cyl(props, 0.55 - k * 0.03, 0.55 - k * 0.03, 0.1, 10, 0x6A5840, tx(14), py + 1 + k * 0.6, pz);
    torii(tx(9), G0, tz + 12, Math.PI / 2, 6, 4.4);
    for (const [d, dz] of [[10, 16], [21, 17], [34, -15], [8, -17], [36, 14]]) {
      cyl(props, 0.18, 0.26, 3.4, 6, 0x3A2A22, tx(d), G0 + 1.7, tz + dz);
      for (let k = 0; k < 12; k++) blossoms.push([tx(d) + (r() - 0.5) * 3.4, G0 + 3.5 + r() * 2, tz + dz + (r() - 0.5) * 3.4, 0.6 + r() * 0.55, 0]);
    }
    addKoi(tx(37), G0, tz + 19);
  }
  // SAKURA on the pavements.
  for (const s of [-1, 1]) for (const [a, b] of runs) for (let z = a - 10 - r() * 10; z > b + 5; z -= 22 + r() * 16) {
    const x = CX + s * (IN - 2.4);
    cyl(props, 0.16, 0.24, 3.4, 6, 0x3A2A22, x, GROUND + 1.9, z);
    for (let k = 0; k < 11; k++) blossoms.push([x + (r() - 0.5) * 3, GROUND + 3.6 + r() * 1.8, z + (r() - 0.5) * 3, 0.55 + r() * 0.5, 0]);
  }
  if (blossoms.length) {
    const bm = new InstancedMesh(new IcosahedronGeometry(1, 1), hazed(new MeshStandardMaterial({ roughness: 0.9 })), blossoms.length);
    blossoms.forEach(([x, y, z, s, kind], i) => {
      m.compose(pos.set(x, y, z), q.setFromEuler(e.set(r() * 3, r() * 3, 0)), sc.set(s, s * 0.8, s)); bm.setMatrixAt(i, m);
      bm.setColorAt(i, col.setHex(kind ? [0x4E7A48, 0x6A9A58][Math.floor(r() * 2)] : [0xFFC4D4, 0xFFAFC8, 0xFFE0E8, 0xF890B0][Math.floor(r() * 4)]));
    });
    G.add(bm);
  }

  // THE TILED ROOFS: a hip roof whose slopes curve in and turn up at the eaves, the Japanese way, one instanced mesh for all.
  if (roofs.length) {
    const roofGeo = new LatheGeometry([[0.06, 1], [0.24, 0.8], [0.44, 0.56], [0.64, 0.33], [0.82, 0.14], [0.95, 0.04], [1.02, 0.02], [1.08, 0.07]].map(([a, b]) => new Vector2(a, b)), 4, Math.PI / 4);
    const rm = new InstancedMesh(roofGeo, hazed(new MeshStandardMaterial({ roughness: 0.5, metalness: 0.25, flatShading: true, envMap: env, envMapIntensity: 0.4 })), roofs.length);
    roofs.forEach(([x, y, z, hx, h, hz, c], i) => { m.compose(pos.set(x, y, z), q.identity(), sc.set(hx / 0.7071 * 1.06, h, hz / 0.7071 * 1.06)); rm.setMatrixAt(i, m); rm.setColorAt(i, col.setHex(c)); });
    G.add(rm);
  }
  // KOINOBORI: carp streamers on the wind, fluttering, a scale pattern and an eye at the mouth.
  const koiT = canvasTex(128, 64, (g) => {
    g.fillStyle = '#F4F4F2'; g.fillRect(0, 0, 128, 64);
    g.strokeStyle = 'rgba(40,40,48,0.45)'; g.lineWidth = 2;
    for (let y = 16; y < 58; y += 7) for (let x = (y % 14 ? 0 : 4); x < 132; x += 8) { g.beginPath(); g.arc(x, y, 4, Math.PI, 0); g.stroke(); }
    for (const u of [0.25, 0.75]) { g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(u * 128, 7, 4.5, 0, 7); g.fill(); g.fillStyle = '#101010'; g.beginPath(); g.arc(u * 128, 7, 2.2, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, 0, 128, 2);
  });
  const koiMesh = new InstancedMesh(new CylinderGeometry(0.42, 0.2, 1, 12, 1, true).rotateZ(Math.PI / 2).translate(0.5, 0, 0),
    hazed(new MeshStandardMaterial({ map: koiT, side: DoubleSide, roughness: 0.6 })), Math.max(1, koi.length));
  koiMesh.count = koi.length; koiMesh.frustumCulled = false; G.add(koiMesh);
  koi.forEach((K2, i) => koiMesh.setColorAt(i, col.setHex(K2.c)));
  const moveKoi = (t) => {
    koi.forEach((K2, i) => {
      const f = Math.sin(t * 2.3 + K2.ph), br = 1 + 0.08 * Math.sin(t * 4 + K2.ph);
      m.compose(pos.set(K2.x, K2.y, K2.z), q.setFromEuler(e.set(0.2 * f, 0.25 * Math.sin(t * 1.3 + K2.ph), -0.12 + 0.08 * Math.sin(t * 1.7 + K2.ph))), sc.set(K2.L, 0.24 * K2.L * br, 0.24 * K2.L * br));
      koiMesh.setMatrixAt(i, m);
    });
    koiMesh.instanceMatrix.needsUpdate = true;
  };
  moveKoi(0);
  // THE ELEVATED LINES, one on each side just outside the rail: a concrete viaduct with parapets, piers, masts for the
  // overhead wire. Commuter trains on both, as on the line that crosses under: the orange line on the left, and on the right
  // the pink train wrapped in the city's mascots. The viaducts grey and unlit, so none of it reads as more course.
  const Z_A = Z_TOP + 20, Z_B = Z_BOT - 20, MLEN = Z_A - Z_B, zMid = (Z_A + Z_B) / 2;
  const monos = [{ x: CX - (HW + 3), y: GROUND + 11, dir: -1 }, { x: CX + (HW + 3), y: GROUND + 14.5, dir: 1 }];
  for (const M of monos) {
    const out = Math.sign(M.x - CX);
    box(props, 3.4, 1.4, MLEN, 0x8E8C86, M.x, M.y - 0.7, zMid);
    for (const dx of [-1.6, 1.6]) box(props, 0.2, 0.6, MLEN, 0x9C9A94, M.x + dx, M.y + 0.3, zMid);
    for (let z = Z_A - 8; z > Z_B; z -= 25) {
      if (nearWalk(z)) continue;
      box(props, 1.6, M.y - 1.4 - GROUND, 1.6, 0x8A8882, M.x, GROUND + (M.y - 1.4 - GROUND) / 2, z);
      box(props, 4.2, 0.8, 1.8, 0x8A8882, M.x, M.y - 1.8, z);
    }
    for (let z = Z_A - 14; z > Z_B; z -= 28) {
      box(props, 0.22, 4.4, 0.22, 0x5A6068, M.x + out * 1.5, M.y + 2.2, z);
      box(props, 1.9, 0.12, 0.12, 0x5A6068, M.x + out * 0.55, M.y + 4.3, z);
    }
  }
  const trains = [], COMM = commuterModel(env), LINES = [commuterModel(env, '#F26B21', 4), commuterModel(env, '#FF4F8E', 4, true)];
  const addTrain = (model, x, y, z, axis, dir, v) => {
    const t = trains.some((T) => T.model === model) ? model.clone() : model;
    t.rotation.y = axis === 'z' ? (dir < 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    t.position.set(x, y, z); G.add(t); trains.push({ t, model, axis, dir, v });
  };
  monos.forEach((M, i) => { for (const k of [0, 1]) addTrain(LINES[i], M.x, M.y + 1.65, startCam - 60 - k * 170 - (M.dir > 0 ? 80 : 0), 'z', M.dir, 24); });
  // A COMMUTER LINE crossing under the rail at a side street or two, on a low viaduct with its own masts.
  const metroZ = streets.filter(([a, b]) => a - b >= 13 && a < 20 && b > end - 40).slice(0, 2).map(([a, b]) => (a + b) / 2);
  for (const mz of metroZ) {
    const my = GROUND + 6;
    box(props, 340, 1.3, 4, 0x8E8C86, CX, my - 0.65, mz);
    for (const dz of [-1.9, 1.9]) box(props, 340, 0.5, 0.2, 0x9C9A94, CX, my + 0.25, mz + dz);
    for (let x = CX - 160; x <= CX + 160; x += 24) if (Math.abs(x - CX) > HW + 3) box(props, 1.4, my - 1.3 - GROUND, 1.4, 0x8A8882, x, GROUND + (my - 1.3 - GROUND) / 2, mz);
    for (let x = CX - 156; x <= CX + 156; x += 26) {
      if (monos.some((M) => Math.abs(x - M.x) < 5)) continue;
      box(props, 0.2, 4.2, 0.2, 0x5A6068, x, my + 2.1, mz - 1.8); box(props, 0.12, 0.12, 1.8, 0x5A6068, x, my + 4.1, mz - 0.9);
    }
    addTrain(COMM, CX - 120 + r() * 240, my + 1.55, mz, 'x', r() < 0.5 ? 1 : -1, 16);
  }
  // THE TRAFFIC, Tokyo's own and on the ground (the flying cars were the neon city's): boxy little kei cars, sedans, taxis with
  // the lamp on the roof lit, a bus in the kerb lanes, each throwing its headlights ahead of it on the wet street. Japan drives on
  // the left. Each kind of car is one shape in two draws, its body and its lights, the paint set car by car.
  const lanes = [], nl = Math.max(1, Math.floor(road / 3.3));
  for (let k = 0; k < nl; k++) for (const s of [-1, 1]) lanes.push({ axis: 'z', at: CX + s * (1.65 + k * 3.3), dir: s < 0 ? -1 : 1, v: 10 + r() * 5, n: 4, kerb: k === nl - 1 });
  for (const st of streets) {
    if (st === SCR) continue;
    const zc = (st[0] + st[1]) / 2;
    lanes.push({ axis: 'x', at: zc - 2, dir: 1, v: 11 + r() * 4, n: 1, from: CX - 100, to: CX + 100 },
               { axis: 'x', at: zc + 2, dir: -1, v: 11 + r() * 4, n: 1, from: CX - 100, to: CX + 100 });
  }
  const SCR_T = 36, SCR_GO = 12;                           // the scramble's cycle: cars for 12 s, then everyone on foot, every way at once
  const PAINT = 0xFFFFFF, GLASS = 0x2A3238, TRIM = 0x3C4044, HEAD = 0xFFF2D8, TAIL = 0xFF2A30;
  const wheel = (L, rad, x, z) => L.push([new CylinderGeometry(rad, rad, 0.2, 10), 0x141414, placeAt(x, rad, z, Math.PI / 2)]);
  const sedan = (b, l) => {
    box(b, 4.6, 0.6, 1.72, PAINT, 0, 0.56, 0); box(b, 2.3, 0.52, 1.56, GLASS, -0.3, 1.11, 0); box(b, 2.1, 0.08, 1.6, PAINT, -0.36, 1.4, 0);
    for (const x of [2.32, -2.32]) box(b, 0.1, 0.24, 1.74, TRIM, x, 0.38, 0);
    for (const x of [1.45, -1.45]) for (const z of [0.74, -0.74]) wheel(b, 0.3, x, z);
    for (const z of [0.58, -0.58]) { box(l, 0.05, 0.1, 0.36, HEAD, 2.33, 0.72, z); box(l, 0.05, 0.12, 0.3, TAIL, -2.33, 0.76, z * 1.05); }
  };
  const KINDS = [
    { len: 3.4, paint: [0xF4F2EC, 0xE8DCC0, 0xA8D8CC, 0xF6C0CC, 0x8FA0B0, 0xF4F2EC, 0x2A2E34, 0xDCD4EC], make: (b, l) => {   // a kei car: short, narrow, tall
      box(b, 3.4, 0.72, 1.48, PAINT, 0, 0.58, 0); box(b, 2.66, 0.74, 1.42, GLASS, -0.28, 1.31, 0); box(b, 2.78, 0.1, 1.48, PAINT, -0.24, 1.72, 0);
      for (const x of [1.72, -1.72]) box(b, 0.1, 0.26, 1.5, TRIM, x, 0.36, 0);
      for (const x of [1.1, -1.1]) for (const z of [0.64, -0.64]) wheel(b, 0.27, x, z);
      for (const z of [0.5, -0.5]) { box(l, 0.05, 0.13, 0.3, HEAD, 1.73, 0.74, z); box(l, 0.05, 0.22, 0.16, TAIL, -1.73, 0.86, z * 1.2); }
    } },
    { len: 4.6, paint: [0xECEEF0, 0x24282C, 0x9AA2AA, 0x3A4A6A, 0x7A1E24, 0xECEEF0], make: sedan },
    { len: 4.6, paint: [0x1E2A44, 0x16161A, 0x1E2A44, 0xE8E4DA, 0x2E6A4A, 0xC8642A], make: (b, l) => { sedan(b, l); box(l, 0.24, 0.2, 0.52, 0xFFD890, -0.34, 1.54, 0); } },   // a taxi, its roof lamp lit
    { len: 10.5, paint: [0xF4F4F0], make: (b, l) => {        // a bus: white, a green band, lit windows, the destination lit over the windscreen
      box(b, 10.5, 2.1, 2.49, PAINT, 0, 1.4, 0); box(b, 10.3, 0.3, 2.4, 0xD4D6D8, 0, 2.6, 0); box(b, 10.52, 0.22, 2.51, 0x2E9A5A, 0, 1.12, 0);
      box(b, 0.06, 1.1, 2.3, GLASS, 5.25, 1.78, 0);
      for (const x of [3.4, -3.4]) for (const z of [1.1, -1.1]) wheel(b, 0.48, x, z);
      box(l, 9.3, 0.8, 2.52, 0xC8B89A, -0.35, 1.86, 0); box(l, 0.05, 0.3, 1.6, 0xFFB040, 5.28, 2.36, 0);
      for (const z of [0.95, -0.95]) { box(l, 0.05, 0.16, 0.3, HEAD, 5.28, 0.72, z); box(l, 0.05, 0.3, 0.2, TAIL, -5.28, 0.9, z); }
    } },
  ];
  const cars = [], perKind = KINDS.map(() => 0);
  for (const L of lanes) for (let i = 0; i < L.n; i++) {
    const kind = L.kerb && i === 0 ? 3 : [0, 0, 1, 2, 2][Math.floor(r() * 5)];
    cars.push({ L, kind, j: perKind[kind]++, len: KINDS[kind].len,
                s: L.axis === 'z' ? startCam + 20 - (i + r() * 0.7) * 300 / L.n : L.from + (i + r() * 0.6) / L.n * (L.to - L.from) });
  }
  const bodyMat = hazed(new MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.3, envMap: env, envMapIntensity: 0.7 }));
  const lightMat = hazed(new MeshBasicMaterial({ vertexColors: true }));
  const carIM = KINDS.map((K, k) => {
    const b = [], l = []; K.make(b, l);
    const body = new InstancedMesh(paintedModel(b), bodyMat, Math.max(1, perKind[k])), lit = new InstancedMesh(paintedModel(l), lightMat, Math.max(1, perKind[k]));
    body.count = lit.count = perKind[k];
    for (const im of [body, lit]) { im.frustumCulled = false; G.add(im); }
    return { body, lit, beamAt: new Matrix4().makeTranslation(K.len / 2 + 3.4, 0.05, 0) };
  });
  cars.forEach((c) => { const K = KINDS[c.kind]; carIM[c.kind].body.setColorAt(c.j, col.setHex(K.paint[Math.floor(r() * K.paint.length)])); });
  const coneT = canvasTex(128, 64, (g) => {                // headlights on the street: bright at the car, spreading and fading ahead
    const img = g.createImageData(128, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
      const u = x / 127, v = y / 63 - 0.5, half = 0.14 + 0.34 * u, k = Math.exp(-(v / half) * (v / half) * 3) * Math.pow(1 - u, 1.5) * Math.min(1, u / 0.05) * 170;
      const i = (y * 128 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = k; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  const beams = new InstancedMesh(new PlaneGeometry(6.8, 3.2).rotateX(-Math.PI / 2), hazed(new MeshBasicMaterial({ map: coneT, color: 0xFFE4C0,
    transparent: true, blending: AdditiveBlending, depthWrite: false })), cars.length);
  beams.frustumCulled = false; beams.renderOrder = -1; G.add(beams);
  const carM = new Matrix4(), one = new Vector3(1, 1, 1);
  const streetLanes = lanes.filter((L) => L.axis === 'z');
  const moveCars = (dt, camZ, t) => {
    if (SCR && (t % SCR_T) >= SCR_GO - 1) for (const L of streetLanes) {     // queue at the stop line while the crowd crosses, nose to tail
      const line = L.dir < 0 ? SCR[0] + 1.2 : SCR[1] - 1.2;
      let at = 0;
      cars.filter((c) => c.L === L && (L.dir < 0 ? c.s >= line - 0.2 && c.s < line + 70 : c.s <= line + 0.2 && c.s > line - 70))
        .sort((a, b) => (L.dir < 0 ? a.s - b.s : b.s - a.s)).forEach((c) => { c.hold = line - L.dir * (at + c.len / 2); at += c.len + 1.4; });
    }
    cars.forEach((c, i) => {
      const L = c.L;
      if (c.hold !== undefined) { const nx = c.s + L.dir * L.v * dt; c.s = L.dir < 0 ? Math.max(nx, c.hold) : Math.min(nx, c.hold); c.hold = undefined; }
      else c.s += L.dir * L.v * dt;
      if (L.axis === 'z') { if (c.s < camZ - 290) c.s += 320; else if (c.s > camZ + 30) c.s -= 320; }
      else if (c.s > L.to) c.s = L.from; else if (c.s < L.from) c.s = L.to;
      const dx = L.axis === 'x' ? L.dir : 0, dz = L.axis === 'z' ? L.dir : 0, IM = carIM[c.kind];
      q.setFromAxisAngle(up, Math.atan2(-dz, dx));
      carM.compose(pos.set(L.axis === 'x' ? c.s : L.at, GROUND, L.axis === 'z' ? c.s : L.at), q, one);
      IM.body.setMatrixAt(c.j, carM); IM.lit.setMatrixAt(c.j, carM);
      beams.setMatrixAt(i, m.multiplyMatrices(carM, IM.beamAt));
    });
    for (const IM of carIM) IM.body.instanceMatrix.needsUpdate = IM.lit.instanceMatrix.needsUpdate = true;
    beams.instanceMatrix.needsUpdate = true;
  };
  const moveTrains = (dt, camZ) => {
    for (const T of trains) {
      const p = T.t.position;
      if (T.axis === 'z') {
        p.z += T.dir * T.v * dt;
        if (T.dir < 0 && p.z < camZ - 300) p.z = camZ + 40;
        if (T.dir > 0 && p.z > camZ + 40) p.z = camZ - 300;
      } else { p.x += T.dir * T.v * dt; if (p.x > CX + 150) p.x = CX - 150; if (p.x < CX - 150) p.x = CX + 150; }
    }
  };

  // CROWS, as every Tokyo street has, wheeling over the avenue below the rail.
  const crows = new InstancedMesh(birdGeo, hazed(new MeshStandardMaterial({ color: 0x1E1E22, side: DoubleSide, roughness: 1 })), 10);
  crows.frustumCulled = false; G.add(crows);
  const crowList = [...Array(10)].map((_, i) => ({ x: CX + (r() - 0.5) * 2 * HW, y: lo - 5 - r() * 8, z: startCam - 25 - i * 28, rad: 5 + r() * 6, ph: r() * 6.3, sp: 0.35 + r() * 0.25 }));
  const moveCrows = (t, camZ) => {
    crowList.forEach((C, i) => {
      if (C.z < camZ - 285) C.z += 300; else if (C.z > camZ + 15) C.z -= 300;
      const a = t * C.sp + C.ph;
      m.compose(pos.set(C.x + Math.cos(a) * C.rad, C.y + Math.sin(t + C.ph) * 0.8, C.z + Math.sin(a) * C.rad), q.setFromEuler(e.set(0, -a, 0)),
        sc.set(1.3, (0.35 + 0.65 * Math.abs(Math.sin(t * 6 + C.ph))) * 1.3, 1.3));
      crows.setMatrixAt(i, m);
    });
    crows.instanceMatrix.needsUpdate = true;
  };

  // PEOPLE: walking the pavements both ways, and a crowd at the scramble's four corners that crosses every way when the lights let them.
  const personGeo = paintedModel([[new CylinderGeometry(0.2, 0.24, 1.2, 7), 0xFFFFFF, placeAt(0, 0.6, 0)], [new SphereGeometry(0.16, 8, 6), 0x2A221C, placeAt(0, 1.38, 0)]]);
  const people = [], PCOL = [0x1E2226, 0xE8E8E4, 0x2A3A5A, 0x8A1E24, 0xD8C8A8, 0x3A5A3A, 0xE8A8B8, 0x4A4A50, 0x1E2226, 0x2A3A5A];
  for (const s of [-1, 1]) for (let i = 0; i < 34; i++) people.push({ k: 'walk', x: CX + s * (IN - 1.7 + (r() - 0.5) * 2.2), z: startCam - r() * 170, v: (r() < 0.5 ? -1 : 1) * (1 + r() * 0.6) });
  const corners = SCR ? [[CX - IN + 1.6, SCR[0] + 1.6], [CX + IN - 1.6, SCR[0] + 1.6], [CX - IN + 1.6, SCR[1] - 1.6], [CX + IN - 1.6, SCR[1] - 1.6]] : [];
  if (SCR) for (let i = 0; i < 72; i++) { const c0 = i % 4; people.push({ k: 'scr', at: c0, to: -1, jx: (r() - 0.5) * 3, jz: (r() - 0.5) * 2.2, x: corners[c0][0], z: corners[c0][1], v: 1.3 + r() * 0.5, go: r() * 3, cyc: -1 }); }
  for (const P of people) if (P.k === 'scr') { P.x += P.jx; P.z += P.jz; }
  const crowd = new InstancedMesh(personGeo, hazed(new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })), people.length);
  crowd.frustumCulled = false; G.add(crowd);
  people.forEach((P, i) => crowd.setColorAt(i, col.setHex(PCOL[i % PCOL.length])));
  const movePeople = (dt, t, camZ) => {
    const cyc = Math.floor(t / SCR_T), ph = t % SCR_T, walk = ph >= SCR_GO;
    people.forEach((P, i) => {
      if (P.k === 'walk') {
        P.z += P.v * dt;
        if (P.z < camZ - 175) P.z += 190; else if (P.z > camZ + 15) P.z -= 190;
      } else if (walk && P.to < 0 && P.cyc !== cyc && ph >= SCR_GO + P.go) { P.to = (P.at + 1 + Math.floor(Math.random() * 3)) % 4; P.cyc = cyc; }
      else if (P.to >= 0) {
        const tx = corners[P.to][0] + P.jx, tz = corners[P.to][1] + P.jz, dx = tx - P.x, dz = tz - P.z, d = Math.hypot(dx, dz);
        if (d < 0.3) { P.at = P.to; P.to = -1; } else { P.x += dx / d * P.v * dt; P.z += dz / d * P.v * dt; }
      }
      m.compose(pos.set(P.x, GROUND + 0.02, P.z), q.identity(), sc.set(1, 1, 1)); crowd.setMatrixAt(i, m);
    });
    crowd.instanceMatrix.needsUpdate = true;
  };
  const petalT = canvasTex(32, 32, (g) => {
    const rg = g.createRadialGradient(16, 16, 1, 16, 16, 14);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.6, 'rgba(255,255,255,0.9)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.beginPath(); g.ellipse(16, 16, 13, 8, 0.6, 0, 7); g.fill();
  });
  const NPT = 220, petalGeo = new BufferGeometry();
  petalGeo.setAttribute('position', new Float32BufferAttribute(NPT * 3, 3).setUsage(DynamicDrawUsage));
  const petalPts = new Points(petalGeo, hazed(new PointsMaterial({ color: 0xFFC8D8, size: 0.55, map: petalT, transparent: true, depthWrite: false })));
  petalPts.frustumCulled = false; petalPts.renderOrder = 2; G.add(petalPts);
  const petals = [...Array(NPT)].map(() => ({ x: CX + (r() - 0.5) * 34, y: lo - 12 + r() * 20, z: startCam - 4 - r() * 70, v: 0.5 + r() * 0.6, ph: r() * 9 }));
  const movePetals = (dt, t, camZ) => {                    // sakura petals drifting down across the rail on the breeze
    const a = petalGeo.attributes.position.array;
    petals.forEach((P, i) => {
      P.y -= P.v * dt; P.x += (0.8 + Math.sin(t * 0.7 + P.ph) * 0.6) * dt; P.z += Math.cos(t * 0.5 + P.ph) * 0.3 * dt;
      if (P.y < lo - 14) P.y += 22;
      if (P.z > camZ - 3) P.z -= 70; else if (P.z < camZ - 75) P.z += 70;
      if (P.x > CX + 18) P.x -= 36;
      a[i * 3] = P.x; a[i * 3 + 1] = P.y; a[i * 3 + 2] = P.z;
    });
    petalGeo.attributes.position.needsUpdate = true;
  };
  // SCREENS on the far corners of the side streets, turned toward the approach; two giant ones high on the towers behind.
  const screens = [];
  const addScreen = (x, y, z, wdt, hgt, ry, k) => {
    const t = canvasTex(256, 320, (g) => { for (let f = 0; f < 2; f++) { g.save(); g.translate(0, f * 160); g.beginPath(); g.rect(0, 0, 256, 160); g.clip(); SCREENS[k % SCREENS.length](g, f); g.restore(); } });
    t.repeat.set(1, 0.5); t.offset.set(0, 0.5);
    const scr = new Mesh(new PlaneGeometry(wdt, hgt), hazed(new MeshBasicMaterial({ map: t })));
    scr.position.set(x, y, z); scr.rotation.y = ry; G.add(scr);
    const back = [new BoxGeometry(wdt + 0.5, hgt + 0.5, 0.4), 0x1A1E22, placeAt(x - Math.sin(ry) * 0.25, y, z - Math.cos(ry) * 0.25, 0, ry, 0)];
    props.push(back);
    screens.push({ t, ph: r() * 3, every: 1.1 + r() * 0.8 });
  };
  const cornerShows = [6, 2, 7, 0, 8, 3, 9];               // the cat, Fuji, Hana, koi, the rabbit, ramen, the frog
  streets.filter((st) => st[0] < 30 && st !== SCR).slice(0, 7).forEach(([a, b], i) => {
    const s = i % 2 ? 1 : -1;
    addScreen(CX + s * (IN + 4.5), GROUND + 15, b + 0.3, 8, 5, 0, cornerShows[i]);
  });
  if (SCR) for (const s of [-1, 1]) {                      // the scramble's screens, on every corner that faces the approach
    addScreen(CX + s * (IN + 4.5), GROUND + 14, SCR[1] + 0.3, 8, 5, 0, s < 0 ? 10 : 3);
    addScreen(CX + s * (IN + 9), GROUND + 24, SCR[1] + 0.3, 13, 8, 0, s < 0 ? 7 : 1);
  }
  if (WAVE) {                                              // the Great Wave, painted high on a wall over a side street
    const t2 = canvasTex(512, 320, (g) => {
      g.fillStyle = '#EDE3CC'; g.fillRect(0, 0, 512, 320);
      g.fillStyle = '#E4D6B8'; for (let y = 0; y < 320; y += 6) g.fillRect(0, y, 512, 1);
      g.fillStyle = '#F4F4F2'; g.beginPath(); g.moveTo(300, 250); g.lineTo(356, 196); g.lineTo(412, 250); g.closePath(); g.fill();       // Fuji, far off
      g.fillStyle = '#5A6E8A'; g.beginPath(); g.moveTo(290, 262); g.lineTo(334, 216); g.lineTo(356, 206); g.lineTo(378, 216); g.lineTo(422, 262); g.closePath(); g.fill();
      g.fillStyle = '#F4F4F2'; g.beginPath(); g.moveTo(340, 212); g.lineTo(356, 200); g.lineTo(372, 212); g.lineTo(364, 218); g.lineTo(356, 212); g.lineTo(348, 218); g.closePath(); g.fill();
      const wave = (x0, y0, sc2, flip) => {                // a curling wave: deep blue, lighter inside, a claw of foam along its crest
        g.save(); g.translate(x0, y0); g.scale(flip ? -sc2 : sc2, sc2);
        g.fillStyle = '#1B3A6B'; g.beginPath(); g.moveTo(-120, 120); g.bezierCurveTo(-110, 20, -40, -70, 60, -80); g.bezierCurveTo(120, -84, 150, -40, 130, -10);
        g.bezierCurveTo(110, -40, 70, -40, 50, -10); g.bezierCurveTo(30, 30, 40, 80, 60, 120); g.closePath(); g.fill();
        g.fillStyle = '#4A78A8'; g.beginPath(); g.moveTo(-80, 120); g.bezierCurveTo(-70, 40, -20, -30, 40, -40); g.bezierCurveTo(10, -10, 0, 60, 20, 120); g.closePath(); g.fill();
        g.fillStyle = '#F4F4F2';
        for (let k = 0; k < 9; k++) { const a = -2.4 + k * 0.32, cx2 = 60 + Math.cos(a) * 70, cy2 = -10 + Math.sin(a) * 70; g.beginPath(); g.arc(cx2, cy2, 9, 0, 7); g.fill(); g.beginPath(); g.arc(cx2 + 7, cy2 + 5, 5, 0, 7); g.fill(); }
        g.restore();
      };
      wave(150, 200, 1.1, false); wave(430, 260, 0.45, true);
      g.fillStyle = '#1B3A6B'; g.fillRect(0, 296, 512, 24);
    });
    const s = 1, mural = new Mesh(new PlaneGeometry(20, 12.5), hazed(new MeshBasicMaterial({ map: t2 })));
    mural.position.set(CX + s * (IN + 16), GROUND + 25, WAVE[1] + 0.3); G.add(mural);
    props.push([new BoxGeometry(20.6, 13.1, 0.4), 0x2A2E32, placeAt(CX + s * (IN + 16), GROUND + 25, WAVE[1] + 0.05)]);
  }
  for (const s of [-1, 1]) addScreen(CX + s * (IN + 20.6), GROUND + 36, 0.45 * end - 30 * s, 16, 10, -s * (Math.PI / 2 - 0.55), s < 0 ? 6 : 4);
  // THE CITY'S MASCOTS, giant, up on the low roofs along the avenue as Tokyo's shops put theirs: Mike the calico cat beckoning
  // with one paw, Momo, Kero in his helmet, Pan; every one of them blinks now and then, facing the rail.
  const KT = tkKit(), giants = [];
  {
    let lastZ = 1e9, a = 0;
    for (const L of lowRoofs.sort((p, q) => q.cz - p.cz)) {
      if (giants.length >= 7 || L.cz > startCam - 12 || lastZ - L.cz < 36 || L.sx < 7 || L.sz < 7) continue;
      if (keepHit(L.face - 5, L.face + 5, L.cz - 5, L.cz + 5)) continue;   // nothing tall where the camera swings out beside a loop
      lastZ = L.cz;
      const k = Math.max(0.7, Math.min(1.35, (lo + 2 - L.roof) / 8.8)), who = a++ % 4, P = [], body = [0xFFF6EA, 0xFFC0D2, 0x6CC24A, 0xFFFDF8][who];
      const add = (g, hex, mtx, rect) => P.push([g, hex, mtx, rect]), limb = who === 3 ? SUMI : body;
      add(new SphereGeometry(2.1, 24, 16), body, placeAt(0, 2.2, 0, 0, 0, 0, 1, 1.1, 0.9));
      for (const e of [-1, 1]) add(new SphereGeometry(0.6, 12, 10), limb, placeAt(e * 1.2, 0.45, 1.4, 0, 0, 0, 1, 0.7, 1.2));
      for (const e of who === 0 ? [-1] : [-1, 1]) add(new SphereGeometry(0.55, 12, 10), limb, placeAt(e * 1.75, 2.6, 1.0));
      add(new SphereGeometry(2.0, 32, 24), 0xFFFFFF, placeAt(0, 5.4, 0), KT.faceRect[who]);
      if (who === 0) {
        for (const e of [-1, 1]) add(new ConeGeometry(0.67, 1.4, 12), e < 0 ? 0xF0943A : 0x2E2824, placeAt(e * 1.08, 7.1, 0, 0, 0, -e * 0.35));
        add(new TorusGeometry(1.45, 0.18, 8, 32), 0xD8342A, placeAt(0, 3.95, 0.1, Math.PI / 2 - 0.2)); add(new SphereGeometry(0.34, 12, 10), 0xF2C230, placeAt(0, 3.7, 1.55));
      }
      if (who === 1) for (const e of [-1, 1]) add(new SphereGeometry(0.5, 12, 10), 0xFFB4CB, placeAt(e * 0.75, 8.2, 0, 0, 0, -e * (e > 0 ? 0.9 : 0.25), 1, 3.4, 0.7));
      if (who === 2) { add(new SphereGeometry(1.67, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0xF6F6F2, placeAt(0, 6.55, 0, -0.2)); add(new BoxGeometry(0.6, 0.6, 0.1), 0x1E9A48, placeAt(0, 7.6, 1.18, -0.3)); }
      if (who === 3) for (const e of [-1, 1]) add(new SphereGeometry(0.62, 12, 10), SUMI, placeAt(e * 1.33, 6.9, 0));
      const grp = new Group(), x = L.face + L.s * 2.4 * k;
      grp.add(new Mesh(atlasModel(P, KT.white), KT.atlasMat));
      const blink = new Mesh(atlasModel([[new SphereGeometry(2.03, 32, 24), 0xFFFFFF, placeAt(0, 5.4, 0), KT.shutRect[who]]], KT.white), KT.atlasMat);
      blink.visible = false; grp.add(blink);
      let paw = null;
      if (who === 0) {                                   // the beckoning paw, from the shoulder
        paw = new Group(); paw.position.set(1.5, 3.3, 0.5);
        paw.add(new Mesh(atlasModel([[new CylinderGeometry(0.45, 0.5, 1.7, 12), body, placeAt(0, 0.85, 0)], [new SphereGeometry(0.6, 12, 10), body, placeAt(0, 1.8, 0.1)]], KT.white), KT.atlasMat));
        grp.add(paw);
      }
      grp.position.set(x, L.roof, L.cz); grp.rotation.y = -L.s * Math.PI / 4; grp.scale.setScalar(k);
      G.add(grp); giants.push({ blink, paw, next: 1 + r() * 4, ph: r() * 6 });
    }
  }
  // And as advertising balloons, tethered to the elevated lines' outer parapets, bobbing on the breeze beside the rail.
  const first = Math.floor(r() * 4);                        // which mascot greets you first, course by course
  for (let i = 0, z = startCam - 34; z > end - 40 && i < 8; z -= 62 + r() * 20, i++) {
    const M = monos[i % 2], out = Math.sign(M.x - CX), who = (i + first) % 4, P = [], body = [0xFFF6EA, 0xFFC0D2, 0x6CC24A, 0xFFFDF8][who];
    if (keepHit(M.x + out * 1.6 - 2.5, M.x + out * 1.6 + 2.5, z - 2.5, z + 2.5)) continue;
    const add = (g, hex, mtx, rect) => P.push([g, hex, mtx, rect]);
    add(new SphereGeometry(1.9, 32, 24), 0xFFFFFF, placeAt(0, 0, 0), KT.faceRect[who]);
    add(new SphereGeometry(1.1, 16, 12), body, placeAt(0, -2.2, -0.2, 0, 0, 0, 1, 0.9, 0.9));
    if (who === 0) for (const e of [-1, 1]) add(new ConeGeometry(0.64, 1.3, 12), e < 0 ? 0xF0943A : 0x2E2824, placeAt(e * 1.03, 1.62, 0, 0, 0, -e * 0.35));
    if (who === 1) for (const e of [-1, 1]) add(new SphereGeometry(0.48, 12, 10), 0xFFB4CB, placeAt(e * 0.72, 2.6, 0, 0, 0, -e * (e > 0 ? 0.9 : 0.25), 1, 3.4, 0.7));
    if (who === 2) { add(new SphereGeometry(1.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0xF6F6F2, placeAt(0, 1.1, 0, -0.2)); add(new BoxGeometry(0.56, 0.56, 0.1), 0x1E9A48, placeAt(0, 2.1, 1.1, -0.3)); }
    if (who === 3) for (const e of [-1, 1]) add(new SphereGeometry(0.6, 12, 10), SUMI, placeAt(e * 1.27, 1.45, 0));
    const grp = new Group(), y = lo - 2.2 + r() * 1.2, px = M.x + out * 1.6;
    grp.add(new Mesh(atlasModel(P, KT.white), KT.atlasMat));
    grp.position.set(px, y, z); grp.rotation.y = -out * 0.5; G.add(grp);
    props.push([new CylinderGeometry(0.02, 0.02, y - 3.3 - M.y, 4), 0xE8E4DC, placeAt(px, (y - 3.3 + M.y) / 2, z)]);   // its tether
    giants.push({ grp, y, ph: r() * 6, blink: null, next: 1e9 });
  }
  const moveGiants = (t) => {
    for (const M of giants) {
      if (M.grp) { M.grp.position.y = M.y + 0.35 * Math.sin(t * 0.9 + M.ph); M.grp.rotation.z = 0.06 * Math.sin(t * 0.7 + M.ph); continue; }
      if (t > M.next + 0.16) M.next = t + 2.5 + Math.random() * 4;
      M.blink.visible = t > M.next;
      if (M.paw) M.paw.rotation.x = -0.25 + 0.45 * Math.sin(t * 2.6 + M.ph);
    }
  };
  // ANIME POSTERS as tall as the buildings, on corners that face the approach, across the street from a corner screen: Hana,
  // the city's own anime heroine, and the mascots all together.
  const POSTERS = [
    (g) => {
      const lg = g.createLinearGradient(0, 0, 0, 384); lg.addColorStop(0, '#FFD0E6'); lg.addColorStop(1, '#B8A4FF');
      g.fillStyle = lg; g.fillRect(0, 0, 256, 384); sparkles(g, 256, 384, 21, 0); sparkles(g, 256, 384, 23, 1);
      g.save(); g.translate(128, 160); animeGirl(g, 82, false); g.restore();
      g.strokeStyle = '#FFE070'; g.lineWidth = 6; g.beginPath(); g.moveTo(40, 320); g.lineTo(58, 214); g.stroke(); star(g, 60, 204, 30, 12, '#FFE070');
      kawaiiTitle(g, '魔法少女', 128, 312, 40, '#FFFFFF', '#C8387E'); kawaiiTitle(g, 'ハナ', 128, 356, 44, '#FFE070', '#8A3AB8');
      kawaiiTitle(g, '新シリーズ', 128, 30, 22, '#FFFFFF', '#E0508E');
    },
    (g) => {
      g.fillStyle = '#FFF4C8'; g.fillRect(0, 0, 256, 384);
      for (let y = 0; y < 384; y += 32) { g.fillStyle = y % 64 ? '#FFEAB0' : '#FFF4C8'; g.fillRect(0, y, 256, 32); }
      [[0, 128, 110, 60], [1, 68, 214, 42], [2, 188, 214, 42], [3, 128, 292, 46]].forEach(([i, x, y, sz]) => { g.save(); g.translate(x, y); MASCOTS[i](g, sz, false); g.restore(); });
      kawaiiTitle(g, 'なかよし', 128, 30, 36, '#FF5FA2', '#FFFFFF'); kawaiiTitle(g, 'トーキョー', 128, 360, 30, '#FFFFFF', '#E0508E');
    },
  ];
  {
    let n = 0;
    streets.filter((st) => st[0] < 30 && st !== SCR).slice(0, 7).forEach(([, b], i) => {
      const s = i % 2 ? -1 : 1, F = fronts.find((q) => q.s === s && Math.abs(q.z1 - b) < 0.5 && q.roof > GROUND + 30);
      if (n >= POSTERS.length || i % 2 === 0 || !F) return;
      const t = canvasTex(256, 384, POSTERS[n++]);
      const pm = new Mesh(new PlaneGeometry(11, 16.5), hazed(new MeshBasicMaterial({ map: t })));
      pm.position.set(CX + s * (IN + 6.5), GROUND + 19.5, b + 0.3); G.add(pm);
      props.push([new BoxGeometry(11.6, 17.1, 0.3), 0x1A1E22, placeAt(CX + s * (IN + 6.5), GROUND + 19.5, b + 0.1)]);
    });
  }
  // STACKS on the low roofs downwind, venting smoke that leans away from the rail; red lamps on the tallest towers.
  const WIND = 2.6;
  const puffT = canvasTex(64, 64, (g) => {
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(0.45, 'rgba(255,255,255,0.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  });
  const smoke = makePlume(G, 0x4A4E50, [4, 6.5, 9.5, 13], [0.45, 0.33, 0.2, 0.09], 90, puffT, 2);
  const tall = tops.filter((tp) => tp[1] > lo + 30).slice(0, 40);
  const lamps = new InstancedMesh(new SphereGeometry(0.45, 8, 6), new MeshBasicMaterial({ color: 0xFFFFFF, fog: false }), Math.max(1, tall.length));
  tall.forEach(([x, y, z], i) => { m.compose(pos.set(x, y + 0.5, z), q.identity(), sc.set(1, 1, 1)); lamps.setMatrixAt(i, m); lamps.setColorAt(i, col.setHex(0xFF2D48)); });
  lamps.count = tall.length; G.add(lamps);
  const lampPh = tall.map(() => r() * 2);
  // TOKYO TOWER at the avenue's far end, lit orange and white against the dusk: four legs splayed to the ground, the body in bands.
  {
    const tx0 = CX + 34, tz0 = end - 240, ORANGE = 0xFF7A34, WHITE = 0xFFE8D2;
    for (const [sx2, sz2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const dx = -sx2 * 10, dz = -sz2 * 10, H = 56, L = Math.hypot(dx, H, dz), rz0 = -Math.asin(dx / L), rx0 = Math.asin(dz / (L * Math.cos(rz0)));
      glows.push([new BoxGeometry(2.4, L, 2.4), ORANGE, placeAt(tx0 + sx2 * 17 + dx / 2, GROUND + H / 2, tz0 + sz2 * 17 + dz / 2, rx0, 0, rz0)]);
    }
    glows.push([new BoxGeometry(16, 5, 16), WHITE, placeAt(tx0, GROUND + 58, tz0)]);
    let y = GROUND + 60.5, r0 = 7;
    for (const [h, r1, c] of [[24, 5.4, ORANGE], [4, 5.2, WHITE], [22, 3.8, ORANGE], [4, 3.6, WHITE], [18, 2.4, ORANGE], [4, 2.2, WHITE], [14, 1.2, ORANGE]]) {
      glows.push([new CylinderGeometry(r1, r0, h, 4), c, placeAt(tx0, y + h / 2, tz0, 0, Math.PI / 4, 0)]); y += h; r0 = r1;
    }
    glows.push([new BoxGeometry(8, 3.5, 8), WHITE, placeAt(tx0, GROUND + 112, tz0)]);
    glows.push([new CylinderGeometry(0.3, 0.9, 30, 6), WHITE, placeAt(tx0, y + 15, tz0)]);
  }
  // Everything still, in one mesh lit by the world and one that shines.
  G.add(new Mesh(paintedModel(props), hazed(new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1 }))));
  G.add(new Mesh(paintedModel(glows), hazed(new MeshBasicMaterial({ vertexColors: true }))));
  const sg = new BufferGeometry();
  sg.setAttribute('position', new Float32BufferAttribute(sp, 3)); sg.setAttribute('uv', new Float32BufferAttribute(su, 2)); sg.setIndex(si);
  G.add(new Mesh(sg, K.signs));

  let t = 0, warming = true;
  const step = (dt) => {                                   // everything that moves
    t += dt;
    const camZ = warming ? startCam : camera.position.z;
    moveCars(dt, camZ, t); moveTrains(dt, camZ); moveCrows(t, camZ); moveKoi(t); moveGiants(t); movePeople(dt, t, camZ); movePetals(dt, t, camZ);
    for (const [x, y, z] of stacks) if (Math.random() < dt * 6) smoke.emit(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5), 0, 2 + Math.random(), 0, 7 + Math.random() * 2);
    smoke.step(dt, WIND);
    for (const S of screens) S.t.offset.y = ((t + S.ph) % (S.every * 2)) < S.every ? 0.5 : 0;
    tall.forEach((_, i) => lamps.setColorAt(i, col.setHex(((t + lampPh[i]) % 1.6) < 0.35 ? 0xFF2D48 : 0x2A060C)));
    if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
  };
  for (let i = 0; i < 60; i++) step(1 / 30);               // open with the traffic already moving and smoke in the air
  warming = false;
  w.tick = (dt) => {
    camera.updateMatrixWorld();
    HAZE.sun.value.copy(HAZE.dir).transformDirection(camera.matrixWorldInverse);
    if (!live || cityRefs.frozen) return;
    step(Math.min(dt, 0.05));
  };
};
WORLDS_ADD('tokyo', tokyoDrift);
WORLDS_ADD('dystopia', tokyoDrift);

// ---------- TREES, GROWN THE WAY EZ-TREE GROWS THEM ----------
/* (owner, 2026-09-27: "I would like to see trees. can you make something like
   this https://www.eztree.dev/", with a picture of one: an oak-like tree, a
   bark-textured trunk forking into limbs and twigs, leaves in dense clusters,
   grass and flowers under it, in haze.) The way Dan Greenheck's EZ-Tree grows
   a tree (MIT), written afresh here: a branch grows section by section, each
   section turned a little at random (more as it thins), twisted, and drawn up
   toward the light, tapering as it goes; children sprout along it at a set
   angle, turned round it by the golden angle, shorter toward its tip; the
   last branches carry cards of leaves. The leaves are lit as one volume (each
   card's normal points out from the crown's middle), so a crown reads as a
   crown and not as a heap of flat cards, and they sway in the wind. */
const _ty = new Vector3(0, 1, 0), _tx = new Vector3(1, 0, 0);
const TREE_KINDS = {
  oak:     { levels: 3, length: [7.5, 5, 2.4, 1.05], radius: [0.48, 0.6, 0.62, 0.62], taper: [0.72, 0.72, 0.72, 0.78], sections: [10, 7, 5, 3],
             segments: [10, 7, 5, 3], children: [7, 5, 3], angle: [0, 56, 48, 44], start: [0, 0.34, 0.26, 0.18], gnarl: [0.07, 0.22, 0.32, 0.45],
             twist: 0.06, up: 0.035, shorten: 0.45, leaves: { count: 5, start: 0.12, size: 1.35, angle: 42, double: true } },
  ash:     { levels: 3, length: [10.5, 4.6, 2.1, 1], radius: [0.4, 0.55, 0.6, 0.62], taper: [0.75, 0.72, 0.72, 0.78], sections: [11, 6, 5, 3],
             segments: [9, 6, 4, 3], children: [6, 4, 3], angle: [0, 40, 44, 44], start: [0, 0.5, 0.3, 0.2], gnarl: [0.04, 0.16, 0.26, 0.38],
             twist: 0.05, up: 0.06, shorten: 0.5, leaves: { count: 5, start: 0.15, size: 1.2, angle: 40, double: true } },
  bush:    { levels: 2, length: [1, 2.4, 1.2], radius: [0.16, 0.72, 0.72], taper: [0.5, 0.75, 0.8], sections: [2, 6, 4],
             segments: [6, 4, 3], children: [9, 4], angle: [0, 62, 46], start: [0, 0.05, 0.2], gnarl: [0.1, 0.3, 0.42],
             twist: 0.05, up: 0.05, shorten: 0.3, leaves: { count: 9, start: 0.1, size: 0.95, angle: 45, double: true } },
};
function growTree(o, seed) {
  const r = seeded(seed);
  const bark = { pos: [], nrm: [], uv: [], idx: [] }, spots = [];
  const tq = new Quaternion(), tq2 = new Quaternion(), te = new Euler(), dir = new Vector3(), off = new Vector3();
  const upQ = new Quaternion();                          // the light: straight up
  const queue = [{ o: new Vector3(), q: new Quaternion(), len: o.length[0], rad: o.radius[0], lvl: 0 }];
  const ringAt = (rings, t) => {                         // a point part way along a branch
    const f = t * (rings.length - 1), i = Math.min(rings.length - 2, Math.floor(f)), k = f - i, A = rings[i], B = rings[i + 1];
    return { p: A.p.clone().lerp(B.p, k), q: A.q.clone().slerp(B.q, k), rad: A.rad + (B.rad - A.rad) * k };
  };
  while (queue.length) {
    const b = queue.shift(), n = o.sections[b.lvl], seg = o.segments[b.lvl], step = b.len / n;
    const rings = [], p = b.o.clone(), q = b.q.clone();
    for (let i = 0; i <= n; i++) {
      rings.push({ p: p.clone(), q: q.clone(), rad: Math.max(0.012, b.rad * (1 - o.taper[b.lvl] * i / n)) });
      if (i === n) break;
      p.addScaledVector(dir.set(0, 1, 0).applyQuaternion(q), step);
      const g = o.gnarl[b.lvl];
      q.multiply(tq.setFromEuler(te.set((r() - 0.5) * g, (r() - 0.5) * g, (r() - 0.5) * g)));
      q.multiply(tq.setFromAxisAngle(_ty, o.twist));
      q.rotateTowards(upQ, o.up * step);
    }
    // The bark: a ring of vertices at each section, the texture kept square on thick and thin alike.
    const base = bark.pos.length / 3, around = Math.max(1, Math.round((2 * Math.PI * b.rad) / 0.55));
    let along = 0;
    rings.forEach((R, i) => {
      if (i) along += R.p.distanceTo(rings[i - 1].p);
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * Math.PI * 2;
        off.set(Math.cos(a), 0, Math.sin(a)).applyQuaternion(R.q);
        bark.pos.push(R.p.x + off.x * R.rad, R.p.y + off.y * R.rad, R.p.z + off.z * R.rad);
        bark.nrm.push(off.x, off.y, off.z);
        bark.uv.push((j / seg) * around, along / 1.1);
      }
    });
    for (let i = 0; i < n; i++) for (let j = 0; j < seg; j++) {
      const a = base + i * (seg + 1) + j, c = a + seg + 1;
      bark.idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
    if (b.lvl < o.levels) {                              // children, turned round by the golden angle
      const lv = b.lvl + 1, nc = o.children[b.lvl];
      for (let c = 0; c < nc; c++) {
        const t = o.start[lv] + (1 - o.start[lv]) * ((c + 0.25 + r() * 0.5) / nc);
        const R = ringAt(rings, t);
        const cq = R.q.clone().multiply(tq.setFromAxisAngle(_ty, c * 2.39996 + r() * 0.5))
          .multiply(tq2.setFromAxisAngle(_tx, ((o.angle[lv] + (r() - 0.5) * 16) * Math.PI) / 180));
        queue.push({ o: R.p, q: cq, len: o.length[lv] * (1 - o.shorten * t) * (0.8 + r() * 0.4), rad: R.rad * o.radius[lv], lvl: lv });
      }
    } else {                                             // leaves along the last branches
      const L = o.leaves;
      for (let k = 0; k < L.count; k++) {
        const R = ringAt(rings, L.start + (1 - L.start) * r());
        const lq = R.q.clone().multiply(tq.setFromAxisAngle(_ty, r() * 6.2832))
          .multiply(tq2.setFromAxisAngle(_tx, ((L.angle + (r() - 0.5) * 30) * Math.PI) / 180));
        spots.push([R.p, lq, L.size * (0.75 + r() * 0.5), r()]);
      }
    }
  }
  // The leaves: cards, crossed in pairs; their normals from the crown's middle.
  const leaf = { pos: [], nrm: [], uv: [], col: [], idx: [] }, mid = new Vector3();
  for (const [p] of spots) mid.add(p);
  mid.multiplyScalar(1 / Math.max(1, spots.length)); mid.y -= 1;
  const corner = [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]], nv = new Vector3();
  for (const [p, q, s, v] of spots) {
    for (let d = 0; d < (o.leaves.double ? 2 : 1); d++) {
      const qq = d ? q.clone().multiply(tq.setFromAxisAngle(_ty, Math.PI / 2)) : q, b0 = leaf.pos.length / 3;
      for (const [cx, cy] of corner) {
        off.set(cx * s, cy * s, 0).applyQuaternion(qq).add(p);
        leaf.pos.push(off.x, off.y, off.z);
        nv.subVectors(off, mid).normalize();
        leaf.nrm.push(nv.x, nv.y, nv.z);
        leaf.uv.push(cx + 0.5, cy);
        const tint = 0.78 + v * 0.36;
        leaf.col.push(tint * (0.96 + v * 0.06), tint, tint * (0.9 + v * 0.1));
      }
      leaf.idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
    }
  }
  const geo = (g, cols) => {
    const G = new BufferGeometry();
    G.setAttribute('position', new Float32BufferAttribute(g.pos, 3));
    G.setAttribute('normal', new Float32BufferAttribute(g.nrm, 3));
    G.setAttribute('uv', new Float32BufferAttribute(g.uv, 2));
    if (cols) G.setAttribute('color', new Float32BufferAttribute(g.col, 3));
    G.setIndex(g.idx);
    G.computeBoundingSphere();
    return G;
  };
  return { bark: geo(bark), leaves: geo(leaf, true) };
}
// Bark: deep fissures between ridges, as a colour and a normal map from one height field.
function barkMaps(seed) {
  const W = 256, H = 512, r = seeded(seed), cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#9A9A9A'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1400; i++) { const v = 120 + r() * 70; g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(r() * W, r() * H, 2 + r() * 6, 2 + r() * 10); }
  g.lineCap = 'round';
  for (let k = 0; k < 34; k++) {                         // the fissures, wandering down the bark
    let x = r() * W;
    g.strokeStyle = `rgba(20,20,20,${0.55 + r() * 0.4})`; g.lineWidth = 3 + r() * 7;
    g.beginPath(); g.moveTo(x, -10);
    for (let y = 0; y <= H + 10; y += 18) { x += (r() - 0.5) * 12; g.lineTo(x, y); }
    g.stroke();
    for (const dx of [-W, W]) { g.save(); g.translate(dx, 0); g.stroke(); g.restore(); }   // wrap round
  }
  for (let k = 0; k < 40; k++) {                         // short cracks across the ridges
    const x = r() * W, y = r() * H;
    g.strokeStyle = 'rgba(30,30,30,0.5)'; g.lineWidth = 1.5 + r() * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 24, y + (r() - 0.5) * 6); g.stroke();
  }
  const h = g.getImageData(0, 0, W, H).data, at = (x, y) => h[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  const colour = canvasTex(W, H, (c) => {
    const img = c.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = at(x, y), n = (r() - 0.5) * 0.08, i = (y * W + x) * 4;
      img.data[i] = 255 * Math.min(1, 0.2 + v * 0.42 + n); img.data[i + 1] = 255 * Math.min(1, 0.16 + v * 0.36 + n); img.data[i + 2] = 255 * Math.min(1, 0.12 + v * 0.3 + n); img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }, true);
  const normal = canvasTex(W, H, (c) => {
    const img = c.createImageData(W, H), k = 3.2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * k, dy = (at(x, y - 1) - at(x, y + 1)) * k, l = Math.hypot(dx, dy, 1), i = (y * W + x) * 4;
      img.data[i] = (dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }, true);
  normal.colorSpace = '';                                // data, not a colour
  return { colour, normal };
}
// A sprig of lobed leaves on a twig, for the leaf cards.
function leafSprigTex(seed, hues) {
  const r = seeded(seed);
  return canvasTex(256, 256, (g) => {
    g.lineCap = 'round';
    g.strokeStyle = '#5A4630'; g.lineWidth = 3; g.beginPath(); g.moveTo(128, 256); g.quadraticCurveTo(122, 140, 132, 26); g.stroke();
    const leafAt = (x, y, ang, len, wid, col) => {
      g.save(); g.translate(x, y); g.rotate(ang);
      g.beginPath(); g.moveTo(0, 0);
      const N = 16;
      for (let i = 1; i <= N; i++) { const t = i / N, w = wid * Math.pow(Math.sin(Math.PI * t), 0.75) * (1 + 0.28 * Math.sin(t * Math.PI * 8)); g.lineTo(w, -len * t); }
      for (let i = N - 1; i >= 1; i--) { const t = i / N, w = wid * Math.pow(Math.sin(Math.PI * t), 0.75) * (1 + 0.28 * Math.sin(t * Math.PI * 8 + 0.6)); g.lineTo(-w, -len * t); }
      g.closePath();
      const lg = g.createLinearGradient(-wid, 0, wid, 0);
      lg.addColorStop(0, col[0]); lg.addColorStop(0.55, col[1]); lg.addColorStop(1, col[2]);
      g.fillStyle = lg; g.fill();
      g.strokeStyle = 'rgba(210,235,150,0.55)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len * 0.92); g.stroke();   // the midrib
      g.strokeStyle = 'rgba(30,60,20,0.35)'; g.lineWidth = 1;
      for (let t = 0.2; t < 0.9; t += 0.16) { g.beginPath(); g.moveTo(0, -len * t); g.lineTo(wid * 0.7, -len * (t + 0.08)); g.moveTo(0, -len * t); g.lineTo(-wid * 0.7, -len * (t + 0.08)); g.stroke(); }
      g.restore();
    };
    const sets = hues.map((h) => h);
    for (let i = 0; i < 13; i++) {
      const t = 0.1 + i * 0.068, side = i % 2 ? 1 : -1, y = 256 - t * 230, x = 128 + (t - 0.5) * 4;
      const ang = side * (0.55 + r() * 0.5) - side * t * 0.3;
      leafAt(x, y, ang, 46 + r() * 30 - t * 10, 15 + r() * 7, sets[Math.floor(r() * sets.length)]);
    }
    leafAt(132, 30, (r() - 0.5) * 0.3, 56, 18, sets[0]);  // the leaf at the tip
  });
}
// Grass cards: lit like the ground whichever side faces us, the tips swaying.
function grassMaterial(tex, time) {
  const m = new MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: DoubleSide, roughness: 0.9 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    vec3 wp = position;
    #ifdef USE_INSTANCING
      wp = (instanceMatrix * vec4(position, 1.0)).xyz;
    #endif
    transformed.x += sin(uTime * 2.1 + wp.x * 0.6 + wp.z * 0.4) * 0.12 * position.y;
    transformed.z += cos(uTime * 1.7 + wp.z * 0.5) * 0.08 * position.y;
  }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize( vNormal );');
  };
  m.customProgramCacheKey = () => 'grass-sway';
  return m;
}
// Leaves that sway in the wind, lit as a volume from both sides.
function leafMaterial(tex, time) {
  const m = new MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: DoubleSide, vertexColors: true, roughness: 0.78, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  {
    vec3 wp = position;
    #ifdef USE_INSTANCING
      wp = (instanceMatrix * vec4(position, 1.0)).xyz;
    #endif
    float h = clamp(position.y * 0.07, 0.0, 1.0);
    transformed.x += (sin(uTime * 1.3 + wp.x * 0.25 + wp.z * 0.18) * 0.09 + sin(uTime * 3.7 + wp.y * 1.3 + wp.x) * 0.035) * h;
    transformed.z += (cos(uTime * 1.1 + wp.z * 0.22) * 0.07 + sin(uTime * 4.1 + wp.x * 1.1) * 0.03) * h;
  }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize( vNormal );');   // one volume, whichever side faces us
  };
  m.customProgramCacheKey = () => 'leaf-sway';
  return m;
}

// ---- 6. The enchanted forest: giant mossy trees, white mushrooms, daisies, a castle far off ----
/* THE LUSH FOREST (owner, 2026-09-27: "A lush forest", with a picture of a
   storybook wood: huge trees whose crowns are round mossy clumps, tall white
   mushrooms, daisies, a winding earth path, warm light and a castle far off).
   The course is a raised earth path, orange-brown on its moss-edged sides,
   winding a few metres above a forest floor of moss mounds, ferns, mushrooms
   great and small and drifts of daisies. Giant trees stand beside the way,
   their crowns high overhead; sunbeams slant through; pollen drifts and
   butterflies flit; a white castle with blue spires stands in the haze beyond.
   The marble is a ladybird. */
// Where the course runs: the top of the highest piece within `margin` of (x, z), or null.
function courseTopNear(x, z, margin) {
  let top = null;
  for (const p of level ? level.pieces : []) {
    if (p.t === 'worm' || p.t === 'curtain' || p.t === 'lock' || p.t === 'gauntlet' || p.t === 'posts' || p.t === 'switch') continue;
    const zc = p.t === 'ramp' ? (p.z0 + p.z1) / 2 : p.z, d = p.t === 'ramp' ? Math.abs(p.z0 - p.z1) : (p.d || 0);
    const y = p.t === 'ramp' ? Math.max(p.y0, p.y1) : (p.y || 0) + (p.t === 'block' ? p.h : 0);
    const hw = (p.t === 'round' ? p.ro : (p.w || 0) / 2) + margin, hd = (p.t === 'round' ? p.ro : d / 2) + margin;
    if (Math.abs(x - p.x) < hw && Math.abs(z - zc) < hd) top = top === null ? y : Math.max(top, y);
  }
  return top;
}
function mossTex(seed, base, dots) {
  const r = seeded(seed);
  return canvasTex(256, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 26; i++) {                         // soft patches, lighter and darker
      const x = r() * 256, y = r() * 256, rad = 20 + r() * 40, rg = g.createRadialGradient(x, y, 0, x, y, rad);
      const c = r() < 0.5 ? '150,200,80' : '40,90,25';
      rg.addColorStop(0, `rgba(${c},0.25)`); rg.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 9000; i++) {                       // the moss itself: tiny tufts
      const v = r();
      g.fillStyle = v < 0.45 ? `rgba(38,78,18,${0.18 + r() * 0.25})` : v < 0.93 ? `rgba(170,215,95,${0.16 + r() * 0.22})` : `rgba(245,248,200,${0.3 + r() * 0.3})`;
      g.fillRect(r() * 256, r() * 256, 1 + r() * (dots || 2), 1 + r() * (dots || 2));
    }
  }, true);
}
let forestMats = null;
function forestMaterials() {
  if (forestMats) return forestMats;
  const r = seeded(29);
  const earth = canvasTex(256, 256, (g) => {                 // packed earth, a few pebbles, fallen leaves
    g.fillStyle = '#A9683A'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 26; i++) {
      const x = r() * 256, y = r() * 256, rad = 16 + r() * 36, rg = g.createRadialGradient(x, y, 0, x, y, rad), c = r() < 0.5 ? '190,130,80' : '120,70,35';
      rg.addColorStop(0, `rgba(${c},0.3)`); rg.addColorStop(1, `rgba(${c},0)`); g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 3000; i++) { const v = r(); g.fillStyle = v < 0.5 ? `rgba(100,58,28,${0.12 + r() * 0.2})` : `rgba(210,160,105,${0.10 + r() * 0.2})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2); }
    for (let i = 0; i < 26; i++) {                           // pebbles, earth-coloured
      const x = r() * 256, y = r() * 256, s = 2 + r() * 3;
      g.fillStyle = 'rgba(70,40,20,0.4)'; g.beginPath(); g.ellipse(x + 1, y + 1.5, s, s * 0.6, 0, 0, Math.PI * 2); g.fill();
      const v = 150 + r() * 40; g.fillStyle = `rgb(${v},${v * 0.85},${v * 0.7})`; g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 14; i++) {                           // fallen leaves
      const x = r() * 256, y = r() * 256, a = r() * 6.3;
      g.fillStyle = ['#C9A23A', '#8FB040', '#D07A2E', '#B8C24A'][Math.floor(r() * 4)];
      g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(80,60,20,0.5)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-6, 0); g.lineTo(6, 0); g.stroke(); g.restore();
    }
  }, true);
  const edge = canvasTex(64, 64, (g) => {                    // the path's side: moss at the top, earth below
    const lg = g.createLinearGradient(0, 0, 0, 64);
    lg.addColorStop(0, '#6FA83A'); lg.addColorStop(0.22, '#4E8A2C'); lg.addColorStop(0.3, '#7A5130'); lg.addColorStop(1, '#4E3320');
    g.fillStyle = lg; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,80,20' : '160,210,90'},${0.2 + r() * 0.3})`; g.beginPath(); g.arc(r() * 64, r() * 18, 1 + r() * 3, 0, Math.PI * 2); g.fill(); }
  }, true);
  const plank = canvasTex(128, 128, (g) => {                 // a moving pad: a raft of pale planks
    for (let i = 0; i < 4; i++) { g.fillStyle = ['#D9B98A', '#CFAE7C', '#E0C293', '#C9A472'][i]; g.fillRect(0, i * 32, 128, 32); g.fillStyle = 'rgba(90,60,30,0.5)'; g.fillRect(0, i * 32, 128, 2); }
    for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(120,85,50,0.25)'; g.beginPath(); const y = r() * 128; g.moveTo(0, y); g.lineTo(128, y + (r() - 0.5) * 6); g.stroke(); }
  }, true);
  forestMats = {
    top: new MeshStandardMaterial({ map: earth, roughness: 0.95 }),
    side: new MeshStandardMaterial({ map: edge, roughness: 0.95 }),
    under: new MeshStandardMaterial({ color: 0x3E2A1A, roughness: 1 }),
    ferryTop: new MeshStandardMaterial({ map: plank, roughness: 0.8 }),
    ferrySide: new MeshStandardMaterial({ color: 0x8A6238, roughness: 0.85 }),
  };
  return forestMats;
}
WORLDS_ADD('forest', (w) => {
  scene.background = coverTex(512, (g) => {
    const lg = g.createLinearGradient(0, 0, 0, 512);
    lg.addColorStop(0, '#8FD0F2'); lg.addColorStop(0.45, '#CDEBEA'); lg.addColorStop(0.75, '#F4EFD2'); lg.addColorStop(1, '#DCEBC0');
    g.fillStyle = lg; g.fillRect(0, 0, 512, 512);
    const sg = g.createRadialGradient(150, 110, 6, 150, 110, 190);
    sg.addColorStop(0, 'rgba(255,252,230,1)'); sg.addColorStop(0.2, 'rgba(255,246,210,0.7)'); sg.addColorStop(1, 'rgba(255,246,210,0)');
    g.fillStyle = sg; g.fillRect(0, 0, 512, 512);
  });
  scene.fog.color.setHex(0xD7EACB); scene.fog.near = 22; scene.fog.far = 130;
  hemi.color.setHex(0xEAF8FF); hemi.groundColor.setHex(0x5C8A34); hemi.intensity = 1.35;
  sun.color.setHex(0xFFF0CC); sun.intensity = 3.1;
  w.marble = 'ladybird'; w.rings = [0xFFFFFF, 0xFFC23F];
  w.restyle = () => {
    const M = forestMaterials();
    for (const c of colliders) {
      if (c.holo || c.obstacle) continue;
      const top = c.ferry ? M.ferryTop : M.top, side = c.ferry ? M.ferrySide : M.side;
      c.mesh.material = [side, side, top, M.under, side, side]; setTopUV(c.mesh, false);
    }
  };
  const G = w.group, r = seeded(81), end = courseEnd(), far = Math.min(-170, end - 110);
  const minTop = level ? level.minTop : 0, FLOOR = Math.min(-8, minTop - 7);
  const m = new Matrix4(), q = new Quaternion(), pos = new Vector3(), sc = new Vector3(), col = new Color(), e = new Euler();
  const along = (k) => 26 - k * (26 - far);                  // a z from 0 (behind the start) to 1 (past the end)
  // THE FLOOR: gentle mossy ground, a winding earth path across it.
  const floorGeo = new PlaneGeometry(260, 26 - far + 60, 90, 120);
  floorGeo.rotateX(-Math.PI / 2);
  const fp = floorGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i), z = fp.getZ(i);
    fp.setY(i, 1.2 * Math.sin(x * 0.09) * Math.cos(z * 0.07) + 0.8 * Math.sin((x + z) * 0.05) + (Math.abs(x - 3) > 40 ? (Math.abs(x - 3) - 40) * 0.12 : 0));
  }
  floorGeo.computeVertexNormals();
  const floorT = canvasTex(512, 512, (g) => {             // dark earth, grown over by moss and short grass in patches
    const rr = seeded(4);
    g.fillStyle = '#5E4431'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${rr() < 0.5 ? '40,28,18' : '120,92,66'},${0.2 + rr() * 0.3})`; g.fillRect(rr() * 512, rr() * 512, 1 + rr() * 3, 1 + rr() * 3); }
    for (let i = 0; i < 60; i++) {
      const x = rr() * 512, y = rr() * 512, rad = 30 + rr() * 70;
      for (const [dx, dy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
        const rg = g.createRadialGradient(x + dx, y + dy, rad * 0.3, x + dx, y + dy, rad);
        rg.addColorStop(0, 'rgba(92,140,52,0.95)'); rg.addColorStop(0.75, 'rgba(84,124,48,0.7)'); rg.addColorStop(1, 'rgba(84,124,48,0)');
        g.fillStyle = rg; g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
      }
    }
    for (let i = 0; i < 9000; i++) { const v = rr(); g.fillStyle = v < 0.5 ? `rgba(46,80,26,${0.15 + rr() * 0.2})` : `rgba(150,190,90,${0.12 + rr() * 0.18})`; g.fillRect(rr() * 512, rr() * 512, 1 + rr() * 2, 1 + rr() * 2); }
  }, true);
  const floor = new Mesh(floorGeo, worldMapped(new MeshStandardMaterial({ map: floorT, roughness: 1 }), 1 / 9, 'forest-floor'));
  floor.position.set(3, FLOOR, (26 + far) / 2); floor.receiveShadow = true; G.add(floor);
  const groundY = (x, z) => FLOOR + 1.2 * Math.sin((x - 3) * 0.09) * Math.cos((z - (26 + far) / 2) * 0.07) + 0.8 * Math.sin(((x - 3) + (z - (26 + far) / 2)) * 0.05);
  // TREES grown like EZ-Tree's: oaks and ashes beside the way and off into the haze, bushes where only a bush fits.
  const windT = { value: 0 };
  const barkM = barkMaps(17);
  const barkMat = new MeshStandardMaterial({ map: barkM.colour, normalMap: barkM.normal, normalScale: new Vector2(1.5, 1.5), roughness: 0.93 });
  const leafA = leafMaterial(leafSprigTex(3, [['#3A6623', '#578A31', '#77A745'], ['#476F28', '#679A3A', '#8DB852'], ['#335C20', '#4C7E2E', '#68973C']]), windT);
  const leafB = leafMaterial(leafSprigTex(8, [['#44702A', '#6A9C3A', '#97C058'], ['#3A6324', '#5A8C38', '#7FAE4B']]), windT);
  const kinds = [[TREE_KINDS.oak, 11, leafA], [TREE_KINDS.oak, 23, leafB], [TREE_KINDS.ash, 5, leafB], [TREE_KINDS.bush, 7, leafA], [TREE_KINDS.bush, 19, leafB]].map(([o, sd, lm]) => {
    const g = growTree(o, sd);
    g.leaves.computeBoundingBox();
    const bb = g.leaves.boundingBox;
    return { g, lm, h: bb.max.y, crown: Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z) };
  });
  const groups = new Map();
  const plant = (ki, x, z, s) => {
    const K = kinds[ki], gy = groundY(x, z), near = courseTopNear(x, z, K.crown * s + 1.2);
    if (near !== null && gy + K.h * s > near - 1.4) return false;     // it would come up into the path: not here
    const key = ki + ':' + Math.floor((26 - z) / 40) + ':' + (x < 3 ? 0 : 1);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([x, gy - 0.15, z, s, r() * 6.2832, r()]);
    return true;
  };
  for (let z = 20; z > far; z -= 10) for (let x = -56; x < 62; x += 10) {
    if (r() < 0.3) continue;
    const px = x + (r() - 0.5) * 8, pz = z + (r() - 0.5) * 8, big = r() < 0.72;
    if (big && plant(r() < 0.42 ? 0 : r() < 0.6 ? 1 : 2, px, pz, 0.85 + r() * 0.5)) { if (r() < 0.35) plant(3 + (r() < 0.5 ? 0 : 1), px + (r() - 0.5) * 5, pz + (r() - 0.5) * 5, 0.8 + r() * 0.5); }
    else plant(3 + (r() < 0.5 ? 0 : 1), px, pz, 0.8 + r() * 0.6);
  }
  const tint = new Color();
  for (const [key, list] of groups) {
    const K = kinds[+key.split(':')[0]];
    const trunks = new InstancedMesh(K.g.bark, barkMat, list.length), crowns = new InstancedMesh(K.g.leaves, K.lm, list.length);
    list.forEach(([x, y, z, s, turn, v], i) => {
      q.setFromEuler(e.set(0, turn, 0)); m.compose(pos.set(x, y, z), q, sc.set(s, s * (0.92 + v * 0.16), s));
      trunks.setMatrixAt(i, m); crowns.setMatrixAt(i, m);
      crowns.setColorAt(i, tint.setRGB(0.86 + v * 0.22, 0.92 + v * 0.1, 0.8 + v * 0.2));
    });
    q.identity();
    trunks.computeBoundingSphere(); crowns.computeBoundingSphere();
    trunks.castShadow = crowns.castShadow = true; trunks.receiveShadow = crowns.receiveShadow = true;
    G.add(trunks, crowns);
  }
  // GRASS in tufts over the floor, swaying.
  const bladeT = canvasTex(128, 128, (g) => {
    const rr = seeded(12);
    for (let i = 0; i < 46; i++) {
      const x0 = 20 + rr() * 88, lean = (rr() - 0.5) * 50, hgt = 60 + rr() * 64, w = 2.5 + rr() * 3;
      const c = [['#3F6B24', '#7FAE45'], ['#4A7A2A', '#9BC45A'], ['#355E1F', '#6C9C3A'], ['#56832F', '#B2CF6A']][Math.floor(rr() * 4)];
      const lg = g.createLinearGradient(0, 128, 0, 128 - hgt); lg.addColorStop(0, c[0]); lg.addColorStop(1, c[1]);
      g.fillStyle = lg; g.beginPath(); g.moveTo(x0 - w, 128); g.quadraticCurveTo(x0 + lean * 0.3, 128 - hgt * 0.6, x0 + lean, 128 - hgt); g.quadraticCurveTo(x0 + lean * 0.3 + w * 0.4, 128 - hgt * 0.55, x0 + w, 128); g.closePath(); g.fill();
    }
  });
  const tuftGeo = (() => {                                 // three crossed cards, their normals straight up, so they light like the ground
    const P = [], N = [], U = [], I = [];
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3, c = Math.cos(a) * 0.5, sn = Math.sin(a) * 0.5, b = P.length / 3;
      P.push(-c, 0, -sn, c, 0, sn, c, 1, sn, -c, 1, -sn); N.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0); U.push(0, 0, 1, 0, 1, 1, 0, 1); I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(P, 3)); g.setAttribute('normal', new Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new Float32BufferAttribute(U, 2)); g.setIndex(I); return g;
  })();
  const grassMat = grassMaterial(bladeT, windT);
  const NG = 9000, grass = new InstancedMesh(tuftGeo, grassMat, NG);
  for (let i = 0; i < NG; i++) {
    const x = 3 + (r() - 0.5) * 80 * (0.3 + r() * 0.7), z = along(r()), s = 0.6 + r() * 0.7;
    q.setFromEuler(e.set(0, r() * 3.14, 0)); m.compose(pos.set(x, groundY(x, z) - 0.05, z), q, sc.set(s * 1.3, s, s * 1.3)); grass.setMatrixAt(i, m);
  }
  q.identity(); grass.computeBoundingSphere(); grass.receiveShadow = true; G.add(grass);
  // Yellow and violet flowers among the grass, as in the owner's picture.
  const flowerTex = (petal, centre) => canvasTex(64, 64, (g) => {
    g.translate(32, 32);
    for (let i = 0; i < 5; i++) { g.rotate((Math.PI * 2) / 5); g.fillStyle = petal; g.beginPath(); g.ellipse(0, -13, 8, 13, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = centre; g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fill();
  });
  for (const [petal, centre, n] of [['#FFD23A', '#E08A12', 1400], ['#7A5BE0', '#F2E27A', 900]]) {
    const fl = new InstancedMesh(new PlaneGeometry(1, 1), new MeshStandardMaterial({ map: flowerTex(petal, centre), alphaTest: 0.5, side: DoubleSide, roughness: 0.8 }), n);
    for (let i = 0; i < n; i++) {
      const x = 3 + (r() - 0.5) * 80 * (0.3 + r() * 0.7), z = along(r()), s = 0.28 + r() * 0.2;
      q.setFromEuler(e.set(-Math.PI / 2 + (r() - 0.5) * 0.7, 0, r() * 6.3)); m.compose(pos.set(x, groundY(x, z) + 0.35 + r() * 0.35, z), q, sc.set(s, s, s)); fl.setMatrixAt(i, m);
    }
    q.identity(); fl.computeBoundingSphere(); G.add(fl);
  }
  // MUSHROOMS: white caps on pale stems, a few giants whose caps come up beside the path.
  const capGeo = new SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const gillGeo = new CircleGeometry(1, 28); gillGeo.rotateX(Math.PI / 2);
  const stemGeo = new CylinderGeometry(0.16, 0.22, 1, 14);
  const capMat = new MeshStandardMaterial({ color: 0xFBF6EC, roughness: 0.55 }), gillMat = new MeshStandardMaterial({ color: 0xE6D6BE, roughness: 0.9, side: DoubleSide });
  const stemMat = new MeshStandardMaterial({ color: 0xF1EADB, roughness: 0.7 });
  const NM = 420, caps = new InstancedMesh(capGeo, capMat, NM), gills = new InstancedMesh(gillGeo, gillMat, NM), stems = new InstancedMesh(stemGeo, stemMat, NM);
  let nm = 0;
  const mushroom = (x, z, h, cw) => {
    if (nm >= NM) return;
    const gy = groundY(x, z), tilt = (r() - 0.5) * 0.25;
    q.setFromEuler(e.set(tilt, 0, (r() - 0.5) * 0.25));
    m.compose(pos.set(x, gy + h / 2, z), q, sc.set(cw * 0.9, h, cw * 0.9)); stems.setMatrixAt(nm, m);
    m.compose(pos.set(x, gy + h, z), q, sc.set(cw, cw * 0.62, cw)); caps.setMatrixAt(nm, m);
    m.compose(pos.set(x, gy + h + 0.01, z), q, sc.set(cw * 0.93, 1, cw * 0.93)); gills.setMatrixAt(nm++, m);
    q.identity();
  };
  for (let i = 0; i < 90; i++) {                          // clusters of small ones
    const cx = -45 + r() * 96, cz = along(r()), n = 2 + Math.floor(r() * 5);
    for (let k = 0; k < n; k++) {
      const x = cx + (r() - 0.5) * 3, z = cz + (r() - 0.5) * 3, h = 0.4 + r() * 1.3, cw = 0.35 + r() * 0.6, near = courseTopNear(x, z, cw + 0.6);
      if (near === null || groundY(x, z) + h + cw < near - 1) mushroom(x, z, h, cw);
    }
  }
  for (let i = 0; i < 70; i++) {                          // giants, their caps kept below the path where they stand under it
    const x = -30 + r() * 66, z = along(r()), cw = 1.2 + r() * 1.6, near = courseTopNear(x, z, cw + 1.2), gy = groundY(x, z);
    const maxH = near === null ? 9 : near - 1.2 - 0.75 * cw - gy;       // the top of its cap stays that far under the path
    const h = Math.min(maxH, 3 + r() * 6);
    if (h > 1.6) mushroom(x, z, h, cw);
  }
  stems.count = caps.count = gills.count = nm;
  caps.castShadow = true; stems.castShadow = true;
  G.add(stems, caps, gills);
  // DAISIES and FERNS carpeting the floor.
  const daisyT = canvasTex(64, 64, (g) => {
    g.translate(32, 32);
    for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.fillStyle = '#FFFFFF'; g.beginPath(); g.ellipse(0, -16, 4.2, 13, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#F2B81F'; g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(200,120,10,0.6)'; g.beginPath(); g.arc(1.5, 1.5, 5, 0, Math.PI * 2); g.fill();
  });
  const ND = 7000, daisies = new InstancedMesh(new PlaneGeometry(1, 1), new MeshStandardMaterial({ map: daisyT, alphaTest: 0.5, roughness: 0.8, side: DoubleSide }), ND);
  for (let i = 0; i < ND; i++) {
    const cx = -50 + r() * 106, cz = along(r()), s = 0.45 + r() * 0.45;
    q.setFromEuler(e.set(-Math.PI / 2 + (r() - 0.5) * 0.6, 0, r() * 6.3));
    m.compose(pos.set(cx, groundY(cx, cz) + 0.35 + r() * 0.2, cz), q, sc.set(s, s, s)); daisies.setMatrixAt(i, m);
  }
  q.identity(); G.add(daisies);
  const fernT = canvasTex(64, 128, (g) => {
    g.strokeStyle = '#3F7A26'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(32, 128); g.quadraticCurveTo(30, 60, 36, 4); g.stroke();
    for (let y = 12; y < 124; y += 7) {
      const wdt = 26 * Math.sin((y / 128) * Math.PI) + 4;
      g.fillStyle = y % 14 ? '#5C9C36' : '#4E8A2E';
      g.beginPath(); g.ellipse(32 - wdt / 2, y, wdt / 2, 3, -0.35, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(32 + wdt / 2, y, wdt / 2, 3, 0.35, 0, Math.PI * 2); g.fill();
    }
  });
  const NF = 1800, ferns = new InstancedMesh(new PlaneGeometry(1, 2), new MeshStandardMaterial({ map: fernT, alphaTest: 0.45, side: DoubleSide, roughness: 0.85 }), NF);
  for (let i = 0; i < NF; i += 6) {                       // rosettes of six fronds
    const cx = -50 + r() * 106, cz = along(r()), s = 0.8 + r() * 0.9, gy = groundY(cx, cz);
    for (let k = 0; k < 6 && i + k < NF; k++) {
      const a = k * Math.PI / 3 + r() * 0.3;
      q.setFromEuler(e.set(0, a, 0), 'YXZ'); q.multiply(new Quaternion().setFromEuler(new Euler(-0.9, 0, 0)));
      m.compose(pos.set(cx + Math.sin(a) * 0.6 * s, gy + 0.7 * s, cz + Math.cos(a) * 0.6 * s), q, sc.set(s, s, s)); ferns.setMatrixAt(i + k, m);
    }
  }
  q.identity(); G.add(ferns);
  // THE CASTLE, white with blue spires, in the haze beyond the end of the path.
  const castle = new Group(), white = new MeshStandardMaterial({ color: 0xF4EEE2, roughness: 0.8 }), roofM = new MeshStandardMaterial({ color: 0x6F8FC4, roughness: 0.6 });
  const towerAt = (x, z, rad, h) => {
    const t = new Mesh(new CylinderGeometry(rad, rad * 1.05, h, 20), white); t.position.set(x, h / 2, z);
    const cone = new Mesh(new ConeGeometry(rad * 1.25, rad * 2.8, 20), roofM); cone.position.set(x, h + rad * 1.4, z);
    castle.add(t, cone);
  };
  towerAt(0, 0, 3.4, 26); towerAt(-9, 3, 2.4, 19); towerAt(9, 2, 2.6, 21); towerAt(-4, -6, 2, 30); towerAt(5, -5, 1.8, 24);
  const wall = new Mesh(new BoxGeometry(22, 12, 6), white); wall.position.set(0, 6, 4); castle.add(wall);
  castle.position.set(26, FLOOR - 2, far + 10); castle.rotation.y = -0.4; G.add(castle);
  // SUNBEAMS slanting through, soft.
  const beamT = canvasTex(64, 256, (g) => {
    const lg = g.createLinearGradient(0, 0, 64, 0);
    lg.addColorStop(0, 'rgba(255,245,200,0)'); lg.addColorStop(0.5, 'rgba(255,245,200,0.9)'); lg.addColorStop(1, 'rgba(255,245,200,0)');
    g.fillStyle = lg; g.fillRect(0, 0, 64, 256);
    const fade = g.createLinearGradient(0, 0, 0, 256);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(0.3, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = fade; g.fillRect(0, 0, 64, 256);
  });
  const beams = [];
  for (let i = 0; i < 12; i++) {
    const b = new Mesh(new PlaneGeometry(4 + r() * 5, 60), glowMat(0xFFF1C8, 0.16, beamT));
    b.material.side = DoubleSide;
    b.position.set(-25 + r() * 56, FLOOR + 22, along(r() * 0.9)); b.rotation.set(0, r() * 0.8 - 0.4, 0.45);
    G.add(b); beams.push(b);
  }
  // POLLEN drifting, BUTTERFLIES flitting.
  const NP = 500, pp = new Float32Array(NP * 3);
  for (let i = 0; i < NP; i++) { pp[i * 3] = -30 + r() * 66; pp[i * 3 + 1] = FLOOR + r() * 16; pp[i * 3 + 2] = along(r()); }
  const pollenGeo = new BufferGeometry(); pollenGeo.setAttribute('position', new Float32BufferAttribute(pp, 3));
  const pollen = new Points(pollenGeo, new PointsMaterial({ color: 0xFFF6C8, size: 0.12, transparent: true, opacity: 0.85, depthWrite: false }));
  G.add(pollen);
  const wingT = canvasTex(64, 64, (g) => {
    g.fillStyle = '#FFB23F'; g.beginPath(); g.ellipse(32, 24, 26, 18, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#FF7A3C'; g.beginPath(); g.ellipse(32, 46, 16, 12, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(40,20,10,0.8)'; g.beginPath(); g.arc(24, 20, 4, 0, Math.PI * 2); g.fill();
  });
  const NB = 44, flies = new InstancedMesh(new PlaneGeometry(0.6, 0.6), new MeshBasicMaterial({ map: wingT, alphaTest: 0.5, side: DoubleSide }), NB * 2);
  const bugs = [];
  for (let i = 0; i < NB; i++) bugs.push({ x: 3 + (r() - 0.5) * 22, y: Math.min(FLOOR + 1 + r() * 7, minTop - 1.5), z: along(r() * 0.95), ph: r() * 6.3, rad: 1 + r() * 3, sp: 0.4 + r() * 0.6, hue: r() });
  const wingL = new Quaternion(), wingR = new Quaternion();
  const placeBugs = (t) => {
    bugs.forEach((B, i) => {
      const a = t * B.sp + B.ph;
      pos.set(B.x + Math.cos(a) * B.rad, B.y + Math.sin(t * 1.7 + B.ph) * 0.6, B.z + Math.sin(a * 1.3) * B.rad);
      const flap = 0.2 + 1.2 * Math.abs(Math.sin(t * 14 + B.ph));
      wingL.setFromEuler(e.set(0, -a, flap)); wingR.setFromEuler(e.set(0, -a, -flap));
      m.compose(pos, wingL, sc.set(1, 1, 1)); flies.setMatrixAt(i * 2, m);
      m.compose(pos, wingR, sc.set(1, 1, 1)); flies.setMatrixAt(i * 2 + 1, m);
    });
    flies.instanceMatrix.needsUpdate = true;
  };
  placeBugs(0); G.add(flies);
  // FALLING LEAVES, turning as they drift down through the sunbeams.
  const oneLeafT = canvasTex(32, 32, (g) => {
    g.fillStyle = '#C9A13A'; g.beginPath(); g.ellipse(16, 16, 7, 13, 0.4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(110,80,20,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(10, 28); g.lineTo(22, 4); g.stroke();
  });
  const NL = 260, falling = new InstancedMesh(new PlaneGeometry(0.75, 0.75), new MeshStandardMaterial({ map: oneLeafT, alphaTest: 0.5, side: DoubleSide, roughness: 0.8 }), NL);
  const leafCols = [0xFFFFFF, 0xE6C27A, 0xB8D07A, 0xE8A05A, 0xD4E08A];
  const drifting = Array.from({ length: NL }, (_, i) => {
    falling.setColorAt(i, col.setHex(leafCols[i % leafCols.length]));
    return { x: 3 + (r() - 0.5) * 24, y: FLOOR + r() * 22, z: along(r()), v: 0.5 + r() * 0.7, sw: 0.4 + r() * 1.2, ph: r() * 6.3, spin: 1 + r() * 3 };
  });
  G.add(falling);
  // BIRDS flying through the wood in small flocks.
  const birdIM = new InstancedMesh(birdGeo, new MeshStandardMaterial({ color: 0x5A4632, side: DoubleSide, roughness: 1 }), 24), flights = [];
  for (let i = 0; i < 24; i++) {
    const f = Math.floor(i / 8);
    if (!flights[f]) flights[f] = { y: Math.min(FLOOR + 3 + r() * 3, minTop - 3), z: along(0.08 + f * 0.3), sp: 7 + r() * 3, dir: f % 2 ? 1 : -1, ph: r() * 200 };
    flights[f].b = (flights[f].b || []).concat([{ i, dx: (r() - 0.5) * 6, dy: (r() - 0.5) * 2.5, dz: (r() - 0.5) * 6, flap: 9 + r() * 4 }]);
  }
  G.add(birdIM);
  // A STREAM winding over the floor, flowing, stones along its banks, dragonflies over it.
  const sx = (z) => 3 + 16 * Math.sin(z * 0.028 + 1.2) + 5 * Math.sin(z * 0.071);
  const flowT = canvasTex(64, 128, (g) => {
    g.fillStyle = '#4C8FA0'; g.fillRect(0, 0, 64, 128);
    const rr = seeded(18);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(210,240,245,${0.15 + rr() * 0.35})`; const x = rr() * 64, y = rr() * 128; g.fillRect(x, y, 1 + rr() * 5, 1); g.fillRect(x, y - 128, 1 + rr() * 5, 1); }
  }, true);
  flowT.repeat.set(1, 1);
  const SP = [], SU = [], SI = [], NSEG = 140;
  for (let i = 0; i <= NSEG; i++) {
    const z = 26 - (i / NSEG) * (26 - far), x = sx(z), dxdz = (sx(z - 0.5) - sx(z + 0.5)), nl = Math.hypot(1, dxdz), wdt = 1.6 + 0.6 * Math.sin(i * 0.4);
    for (const side of [-1, 1]) { const px = x + side * wdt / Math.sqrt(nl) , pz = z + side * wdt * dxdz / nl * 0; SP.push(px, groundY(px, pz) + 0.12, pz); SU.push(side < 0 ? 0 : 1, i * 0.25); }
    if (i < NSEG) { const k = i * 2; SI.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const streamGeo = new BufferGeometry(); streamGeo.setAttribute('position', new Float32BufferAttribute(SP, 3)); streamGeo.setAttribute('uv', new Float32BufferAttribute(SU, 2)); streamGeo.setIndex(SI); streamGeo.computeVertexNormals();
  const stream = new Mesh(streamGeo, new MeshStandardMaterial({ map: flowT, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.92, side: DoubleSide }));
  stream.receiveShadow = true; G.add(stream);
  const pebbles = new InstancedMesh(new IcosahedronGeometry(1, 1), new MeshStandardMaterial({ color: 0x9A9488, roughness: 0.9, flatShading: true }), 260);
  for (let i = 0; i < 260; i++) {
    const z = 26 - r() * (26 - far), side = r() < 0.5 ? -1 : 1, x = sx(z) + side * (1.8 + r() * 1.2), s2 = 0.25 + r() * 0.45;
    q.setFromEuler(e.set(r(), r() * 6, r())); m.compose(pos.set(x, groundY(x, z) + s2 * 0.3, z), q, sc.set(s2 * 1.3, s2 * 0.7, s2)); pebbles.setMatrixAt(i, m);
    pebbles.setColorAt(i, col.setHex([0xFFFFFF, 0xDAD4C6, 0xB8B2A4, 0xC8D0B0][i % 4]));
  }
  q.identity(); pebbles.computeBoundingSphere(); pebbles.castShadow = true; G.add(pebbles);
  const dfly = new InstancedMesh(new BoxGeometry(0.08, 0.08, 0.9), new MeshStandardMaterial({ color: 0x2EB8C8, metalness: 0.6, roughness: 0.3, envMap: envTex }), 10);
  const dwing = new InstancedMesh(new PlaneGeometry(1.2, 0.2), new MeshStandardMaterial({ color: 0xDFF6FF, transparent: true, opacity: 0.55, side: DoubleSide, roughness: 0.2 }), 20);
  const darters = Array.from({ length: 10 }, () => { const z = 20 - r() * (20 - far); return { z0: z, x: sx(z), z, y: 0, tx: 0, tz: 0, ty: 0, wait: r() * 2 }; });
  for (const D of darters) { D.y = groundY(D.x, D.z) + 1 + r(); D.tx = D.x; D.tz = D.z; D.ty = D.y; }
  G.add(dfly, dwing);
  // PENNANTS on the castle's spires, streaming.
  const pennantT = canvasTex(64, 16, (g) => { g.fillStyle = '#C8403A'; g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 8); g.lineTo(0, 16); g.fill(); });
  const pennantM = new MeshStandardMaterial({ map: pennantT, alphaTest: 0.4, side: DoubleSide, roughness: 0.8 });
  pennantM.onBeforeCompile = (sh) => { sh.uniforms.uTime = windT; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.z += sin(uTime * 5.0 - position.x * 1.2) * 0.35 * (position.x + 2.0) / 4.0;'); };
  pennantM.customProgramCacheKey = () => 'pennant';
  const penGeo = new PlaneGeometry(4, 1, 8, 1); penGeo.translate(2, 0, 0);
  castle.updateMatrixWorld(true);
  for (const [tx, h, tz, rad] of [[0, 26, 0, 3.4], [-9, 19, 3, 2.4], [9, 21, 2, 2.6], [-4, 30, -6, 2], [5, 24, -5, 1.8]]) {
    const pole = new Mesh(new CylinderGeometry(0.08, 0.08, 3, 6), new MeshStandardMaterial({ color: 0x444444 })); pole.position.set(tx, h + rad * 2.8 + 1.5, tz); castle.add(pole);
    const pen = new Mesh(penGeo, pennantM); pen.position.set(tx, h + rad * 2.8 + 2.5, tz); castle.add(pen);
  }
  const live = !REDUCED;
  let t = 0;
  w.tick = (dt) => {
    if (!live) return;
    t += dt;
    windT.value = t;
    placeBugs(t);
    drifting.forEach((L, i) => {                          // leaves: down, side to side, turning
      L.y -= L.v * dt;
      if (L.y < groundY(L.x, L.z) + 0.1) { L.y = FLOOR + 18 + r() * 6; L.x = 3 + (r() - 0.5) * 24; }
      q.setFromEuler(e.set(t * L.spin + L.ph, t * L.spin * 0.7, Math.sin(t * 1.6 + L.ph) * 0.8));
      m.compose(pos.set(L.x + Math.sin(t * 1.3 + L.ph) * L.sw, L.y, L.z + Math.cos(t * 0.9 + L.ph) * L.sw * 0.5), q, sc.set(1, 1, 1)); falling.setMatrixAt(i, m);
    });
    q.identity(); falling.instanceMatrix.needsUpdate = true;
    for (const F of flights) {                            // flocks: straight across, back round again
      const span = 140, u = ((t * F.sp + F.ph) % span + span) % span;
      for (const B of F.b) {
        q.setFromEuler(e.set(0, F.dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0));
        m.compose(pos.set(3 + F.dir * (u - span / 2) + B.dx, F.y + B.dy + Math.sin(t * 2 + B.i) * 0.3, F.z + B.dz), q, sc.set(0.7, (0.3 + 0.7 * Math.abs(Math.sin(t * B.flap + B.i))) * 0.7, 0.7));
        birdIM.setMatrixAt(B.i, m);
      }
    }
    q.identity(); birdIM.instanceMatrix.needsUpdate = true;
    flowT.offset.y = -t * 0.35;
    darters.forEach((D, i) => {                           // dragonflies: dart, hover, dart again
      D.wait -= dt;
      if (D.wait <= 0) { D.tz = D.z0 + (r() - 0.5) * 10; D.tx = sx(D.tz) + (r() - 0.5) * 4; D.ty = groundY(D.tx, D.tz) + 0.8 + r() * 1.6; D.wait = 0.6 + r() * 1.8; }
      const k = 1 - Math.exp(-7 * dt), hx = D.tx - D.x, hz = D.tz - D.z;
      D.x += hx * k; D.z += hz * k; D.y += (D.ty - D.y) * k;
      const yaw = Math.atan2(hx, hz);
      q.setFromEuler(e.set(0, yaw, 0)); m.compose(pos.set(D.x, D.y + Math.sin(t * 9 + i) * 0.04, D.z), q, sc.set(1, 1, 1)); dfly.setMatrixAt(i, m);
      for (const k2 of [0, 1]) { q.setFromEuler(e.set(Math.sin(t * 60 + i + k2) * 0.5, yaw, 0)); m.compose(pos.set(D.x, D.y + 0.05, D.z + (k2 ? 0.18 : -0.18)), q, sc.set(1, 1, 1)); dwing.setMatrixAt(i * 2 + k2, m); }
    });
    q.identity(); dfly.instanceMatrix.needsUpdate = true; dwing.instanceMatrix.needsUpdate = true;
    const a = pollenGeo.attributes.position;
    for (let i = 0; i < NP; i++) { a.array[i * 3 + 1] += dt * 0.15; if (a.array[i * 3 + 1] > FLOOR + 16) a.array[i * 3 + 1] = FLOOR; a.array[i * 3] += Math.sin(t * 0.5 + i) * dt * 0.08; }
    a.needsUpdate = true;
    beams.forEach((b, i) => { b.material.opacity = 0.12 + 0.05 * Math.sin(t * 0.4 + i); });
  };
});

// ---- 7. The castle ruins: stone by stone, broken walls and towers, ivy and trees, late golden light ----
/* RUINS OF AN OLD CASTLE (owner, 2026-09-27: "Ruins of a old castle", one of
   the worlds to choose from). No picture came with it, so the familiar form:
   a castle long fallen, its curtain walls and round towers standing to ragged
   heights, stone by stone, with arrow slits, a gateway arch, crenellations
   where a wall still keeps its top, rubble fallen at their feet, ivy up the
   stones, trees grown up through the courtyards, grass and flowers over all,
   a moat gone to a still green water, tattered banners stirring, crows round
   the tallest tower, and late golden light with the hills in haze beyond. The
   path is worn flagstones along what is left; the marble is a gold orb. */
function stoneFaceTex(seed) {                              // one stone's face: speckled, pitted, darker at its edges
  const r = seeded(seed);
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#A9A597'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 6; i++) { const x = r() * 128, y = r() * 128, rad = 20 + r() * 40, rg = g.createRadialGradient(x, y, 0, x, y, rad), c = r() < 0.5 ? '70,68,60' : '210,206,194'; rg.addColorStop(0, `rgba(${c},0.3)`); rg.addColorStop(1, `rgba(${c},0)`); g.fillStyle = rg; g.fillRect(0, 0, 128, 128); }
    for (let i = 0; i < 1400; i++) { const v = r(); g.fillStyle = v < 0.5 ? `rgba(70,66,58,${0.12 + r() * 0.22})` : `rgba(232,228,216,${0.1 + r() * 0.2})`; g.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2); }
    for (let i = 0; i < 4; i++) { g.strokeStyle = 'rgba(50,46,40,0.35)'; g.lineWidth = 1; g.beginPath(); let x = r() * 128, y = r() * 128; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }   // cracks
    for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(70,62,50,0.3)'; g.beginPath(); g.arc(r() * 128, r() * 128, 1 + r() * 3, 0, Math.PI * 2); g.fill(); }
    const edge = (x0, y0, x1, y1, w, c) => { const lg = g.createLinearGradient(x0, y0, x1, y1); lg.addColorStop(0, c); lg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = lg; g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || w, Math.abs(y1 - y0) || w); };
    edge(0, 0, 0, 12, 128, 'rgba(255,248,230,0.35)');       // the top edge catches the light
    edge(0, 128, 0, 112, 128, 'rgba(40,34,26,0.55)');       // the bottom in shadow
    edge(0, 0, 10, 0, 128, 'rgba(60,52,40,0.35)'); edge(128, 0, 118, 0, 128, 'rgba(40,34,26,0.45)');
    g.strokeStyle = 'rgba(40,34,26,0.5)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 125, 125);   // the mortar line
  });
}
let ruinMats = null;
function ruinMaterials() {
  if (ruinMats) return ruinMats;
  const r = seeded(37);
  const flag = canvasTex(512, 512, (g) => {                  // flagstones: big irregular slabs, dark joints, moss in the cracks
    g.fillStyle = '#3E3A33'; g.fillRect(0, 0, 512, 512);
    // A jittered grid of corners, each cell a slab with its own shade.
    const N = 5, pt = [];
    for (let j = 0; j <= N; j++) { pt[j] = []; for (let i = 0; i <= N; i++) { const edge = i === 0 || i === N || j === 0 || j === N; pt[j][i] = [i * 512 / N + (edge ? 0 : (r() - 0.5) * 50), j * 512 / N + (edge ? 0 : (r() - 0.5) * 50)]; } }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const c = [pt[j][i], pt[j][i + 1], pt[j + 1][i + 1], pt[j + 1][i]], v = 168 + r() * 30, warm = r() < 0.5;
      g.fillStyle = warm ? `rgb(${v + 6},${v},${v - 10})` : `rgb(${v - 2},${v},${v - 2})`;
      g.beginPath(); c.forEach(([x, y], k) => { const cx = (c[0][0] + c[2][0]) / 2, cy = (c[0][1] + c[2][1]) / 2, px = x + (cx - x) * 0.035, py = y + (cy - y) * 0.035; if (k) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); g.fill();
    }
    for (let i = 0; i < 9000; i++) { const v = r(); g.fillStyle = v < 0.5 ? `rgba(70,64,54,${0.1 + r() * 0.18})` : `rgba(245,240,228,${0.08 + r() * 0.14})`; g.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 2); }
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) for (let k = 0; k < 6; k++) {       // moss where the slabs meet
      g.fillStyle = `rgba(${90 + r() * 40},${120 + r() * 40},${50 + r() * 20},${0.45 + r() * 0.4})`;
      g.beginPath(); g.arc(pt[j][i][0] + (r() - 0.5) * 30, pt[j][i][1] + (r() - 0.5) * 30, 1.5 + r() * 3.5, 0, Math.PI * 2); g.fill();
    }
  }, true);
  flag.repeat.set(0.5, 0.5);
  const course = canvasTex(128, 128, (g) => {                // the path's sides: courses of dressed stone
    g.fillStyle = '#3E3830'; g.fillRect(0, 0, 128, 128);
    for (let j = 0; j < 4; j++) for (let i = -1; i < 3; i++) {
      const v = 150 + r() * 50, x = i * 64 + (j % 2) * 32;
      g.fillStyle = `rgb(${v},${v * 0.92},${v * 0.8})`; g.fillRect(x + 2, j * 32 + 2, 60, 28);
    }
  }, true);
  ruinMats = {
    top: new MeshStandardMaterial({ map: flag, roughness: 0.9 }),
    side: new MeshStandardMaterial({ map: course, roughness: 0.92 }),
    under: new MeshStandardMaterial({ color: 0x4A4238, roughness: 1 }),
    ferryTop: new MeshStandardMaterial({ color: 0x8A6A44, roughness: 0.8 }),
    ferrySide: new MeshStandardMaterial({ color: 0x5E4630, roughness: 0.85 }),
  };
  return ruinMats;
}
WORLDS_ADD('ruins', (w) => {
  scene.background = coverTex(512, (g) => {
    const lg = g.createLinearGradient(0, 0, 0, 512);
    lg.addColorStop(0, '#5E7FB0'); lg.addColorStop(0.35, '#A9B7C8'); lg.addColorStop(0.62, '#F2C9A0'); lg.addColorStop(0.78, '#F7B775'); lg.addColorStop(1, '#C98A5E');
    g.fillStyle = lg; g.fillRect(0, 0, 512, 512);
    const sg = g.createRadialGradient(120, 330, 6, 120, 330, 170);
    sg.addColorStop(0, 'rgba(255,244,210,1)'); sg.addColorStop(0.25, 'rgba(255,214,150,0.7)'); sg.addColorStop(1, 'rgba(255,200,130,0)');
    g.fillStyle = sg; g.fillRect(0, 0, 512, 512);
    const r = seeded(5);                                   // hills in the haze
    for (const [y0, c] of [[360, 'rgba(150,120,120,0.55)'], [390, 'rgba(120,100,95,0.6)']]) {
      g.fillStyle = c; g.beginPath(); g.moveTo(0, 512);
      for (let x = 0; x <= 512; x += 16) g.lineTo(x, y0 - 30 * Math.sin(x * 0.012 + y0) - 18 * Math.sin(x * 0.031) - r() * 6);
      g.lineTo(512, 512); g.closePath(); g.fill();
    }
  });
  scene.fog.color.setHex(0xD9CDB8); scene.fog.near = 28; scene.fog.far = 160;
  hemi.color.setHex(0xD4E2F4); hemi.groundColor.setHex(0x55683A); hemi.intensity = 1.2;
  sun.color.setHex(0xFFE0B8); sun.intensity = 3.0;
  w.marble = 'gold'; w.rings = [0xFFFFFF, 0xFFB23F];
  w.restyle = () => {
    const M = ruinMaterials();
    for (const c of colliders) {
      if (c.holo || c.obstacle) continue;
      const top = c.ferry ? M.ferryTop : M.top, side = c.ferry ? M.ferrySide : M.side;
      c.mesh.material = [side, side, top, M.under, side, side]; setTopUV(c.mesh, false);
    }
  };
  const G = w.group, r = seeded(91), end = courseEnd(), far = Math.min(-170, end - 110);
  const minTop = level ? level.minTop : 0, GROUND = Math.min(-12, minTop - 11);
  const m = new Matrix4(), q = new Quaternion(), pos = new Vector3(), sc = new Vector3(), col = new Color(), e = new Euler();
  const along = (k) => 26 - k * (26 - far);
  const groundY = (x, z) => GROUND + 1.1 * Math.sin(x * 0.07 + 1) * Math.cos(z * 0.05) + 0.7 * Math.sin((x - z) * 0.04);
  // THE GROUND: grass over low hills, and the old moat, still water.
  const gGeo = new PlaneGeometry(300, 26 - far + 80, 80, 110); gGeo.rotateX(-Math.PI / 2);
  const gp = gGeo.attributes.position, zc = (26 + far) / 2;
  for (let i = 0; i < gp.count; i++) gp.setY(i, groundY(gp.getX(i) + 3, gp.getZ(i) + zc) - GROUND);
  gGeo.computeVertexNormals();
  const grassT = canvasTex(256, 256, (g) => {
    const rr = seeded(8);
    g.fillStyle = '#6E8A3A'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 26; i++) { const x = rr() * 256, y = rr() * 256, rad = 20 + rr() * 50, rg = g.createRadialGradient(x, y, 0, x, y, rad), c = rr() < 0.5 ? '150,160,70' : '60,90,30'; rg.addColorStop(0, `rgba(${c},0.35)`); rg.addColorStop(1, `rgba(${c},0)`); g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    for (let i = 0; i < 8000; i++) { const v = rr(); g.fillStyle = v < 0.5 ? `rgba(50,70,25,${0.15 + rr() * 0.2})` : `rgba(190,200,110,${0.12 + rr() * 0.18})`; g.fillRect(rr() * 256, rr() * 256, 1 + rr() * 2, 1 + rr() * 2); }
  }, true);
  const ground = new Mesh(gGeo, worldMapped(new MeshStandardMaterial({ map: grassT, roughness: 1 }), 1 / 6, 'ruins-ground'));
  ground.position.set(3, GROUND, zc); ground.receiveShadow = true; G.add(ground);
  const moat = new Mesh(new PlaneGeometry(26, 26 - far + 60), new MeshStandardMaterial({ color: 0x4E6A48, roughness: 0.15, metalness: 0.2 }));
  moat.rotation.x = -Math.PI / 2; moat.position.set(-34, GROUND + 0.9, zc); G.add(moat);
  // THE STONES: every wall and tower laid stone by stone, in one draw.
  const faces = [stoneFaceTex(3), stoneFaceTex(9)];
  const stoneMat = new MeshStandardMaterial({ map: faces[0], roughness: 0.93 });
  const CAP = 16000, stones = new InstancedMesh(new BoxGeometry(1, 1, 1), stoneMat, CAP);
  const tones = [0xF4F2EC, 0xE4E2DA, 0xD2D0C6, 0xC4C2B8, 0xE8DFCC, 0xD8CFB8, 0xB8BCB0];
  let ns = 0;
  const stone = (x, y, z, sx, sy, sz, yaw, mossy) => {
    if (ns >= CAP) return;
    q.setFromEuler(e.set((r() - 0.5) * 0.03, yaw + (r() - 0.5) * 0.03, (r() - 0.5) * 0.03));
    m.compose(pos.set(x, y, z), q, sc.set(sx, sy, sz)); stones.setMatrixAt(ns, m);
    col.setHex(tones[Math.floor(r() * tones.length)]);
    if (mossy) col.lerp(new Color(0x9CB070), 0.35 + r() * 0.3);
    stones.setColorAt(ns++, col);
  };
  // How high a stone may stand here: under the path it stays well below it.
  const ceiling = (x, z) => { const t = courseTopNear(x, z, 1.4); return t === null ? 99 : t - 1.6; };
  const ivySpots = [];
  // A wall from (x0, z0) to (x1, z1), `thick` thick, standing to a ragged height round `h`.
  const wall = (x0, z0, x1, z1, h, thick, opts = {}) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / len, uz = (z1 - z0) / len, yaw = Math.atan2(-uz, ux);
    const SW = 1.6, SH = 0.78, n = Math.ceil(len / SW), ph = r() * 10, gate = opts.gate ? [len * 0.4, len * 0.4 + 4.2] : null;
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) * SW, cx = x0 + ux * a, cz = z0 + uz * a, gy = groundY(cx, cz);
      let top = gy + h * (0.55 + 0.45 * Math.abs(Math.sin(i * 0.23 + ph)) * (0.8 + 0.2 * Math.sin(i * 1.7 + ph))) - (r() < 0.2 ? r() * 3 : 0);
      top = Math.min(top, ceiling(cx, cz));
      const courses = Math.floor((top - gy) / SH);
      for (let k = 0; k < courses; k++) {
        const y = gy + (k + 0.5) * SH;
        if (gate && a > gate[0] && a < gate[1] && y < gy + 3.4 + Math.sin(((a - gate[0]) / 4.2) * Math.PI) * 1.2) continue;   // the gateway's opening
        if (opts.slits && k > 3 && k < courses - 2 && i % 5 === 2 && k % 6 < 2) continue;                                      // arrow slits
        const off = (k % 2) * SW * 0.5;
        if (r() < 0.035 && k > 2) continue;                                                                                    // a stone fallen out
        const sw = SW * (0.7 + r() * 0.6), sh = SH * (0.85 + r() * 0.3);
        stone(cx + ux * (off - SW / 4 + (r() - 0.5) * 0.3), y, cz + uz * (off - SW / 4), sw, sh * 0.96, thick * (0.95 + r() * 0.08), yaw, k < 3 || r() < 0.08);
      }
      if (opts.crenel && courses > 3 && top > gy + h * 0.9 && i % 2 === 0) stone(cx, gy + (courses + 0.5) * SH + 0.3, cz, SW * 0.95, SH * 1.8, thick, yaw, false);   // a merlon
      if (r() < 0.22) ivySpots.push([cx, gy, cz, top, yaw]);
    }
    if (gate) {                                             // the arch over the gate, stone by stone
      const gx = x0 + ux * (gate[0] + 2.1), gz = z0 + uz * (gate[0] + 2.1), gy = groundY(gx, gz);
      for (let k = 0; k <= 12; k++) {
        const t = (k / 12) * Math.PI, ax = Math.cos(t) * 2.3, ay = Math.sin(t) * 2.3;
        q.setFromEuler(e.set(0, yaw, t - Math.PI / 2));
        m.compose(pos.set(gx + ux * ax, gy + 3.4 + ay, gz + uz * ax), q, sc.set(0.6, 0.9, thick * 1.05));
        if (ns < CAP) { stones.setMatrixAt(ns, m); stones.setColorAt(ns++, col.setHex(0xE8E0D0)); }
      }
    }
  };
  // A round tower: rings of stones, broken off at the top unless it keeps its roof.
  const roofs = [];
  const tower = (cx, cz, rad, h, roofed) => {
    const gy = groundY(cx, cz), SH = 0.78, n = Math.max(10, Math.round((2 * Math.PI * rad) / 1.5)), ph = r() * 6;
    const ceil = Math.min(ceiling(cx, cz), ceiling(cx + rad, cz), ceiling(cx - rad, cz), ceiling(cx, cz + rad), ceiling(cx, cz - rad));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, top = Math.min(ceil, gy + h - (roofed ? 0 : 3.5 * Math.abs(Math.sin(a * 1.5 + ph)) + r() * 1.5));
      const courses = Math.floor((top - gy) / SH);
      for (let k = 0; k < courses; k++) {
        const aa = a + (k % 2) * Math.PI / n;
        if (k > 5 && k % 7 === 3 && i % Math.max(3, Math.floor(n / 4)) === 0) continue;   // windows
        stone(cx + Math.cos(aa) * rad, gy + (k + 0.5) * SH, cz + Math.sin(aa) * rad, (2 * Math.PI * rad) / n * 1.02, SH * 0.96, 1.1, -aa + Math.PI / 2, k < 3);
      }
    }
    if (roofed && gy + h + 2 < ceil) roofs.push([cx, gy + h, cz, rad]);
    if (r() < 0.5) ivySpots.push([cx + rad, gy, cz, gy + h * 0.8, 0]);
  };
  // The plan: curtain walls along both sides of the way, towers at their corners, cross walls below the path, a keep off to one side.
  const L = 26 - far;
  for (const side of [-1, 1]) {
    const x = 3 + side * (15 + r() * 4);
    let z = 22;
    while (z > far + 10) {
      const seg = 22 + r() * 18, z1 = Math.max(far, z - seg), h = 7 + r() * 9;
      wall(x, z, x + (r() - 0.5) * 6, z1, h, 2.2, { crenel: r() < 0.6, slits: true, gate: r() < 0.3 });
      tower(x + side * 1.5, z1, 3.2 + r() * 1.2, h + 4 + r() * 6, r() < 0.35);
      z = z1 - 2;
    }
  }
  for (let i = 0; i < 7; i++) {                             // cross walls, broken low where the path runs over them
    const z = along(0.05 + i * 0.14 + r() * 0.05);
    wall(-12, z, 18, z + (r() - 0.5) * 6, 5 + r() * 6, 1.8, { slits: false, gate: r() < 0.5 });
  }
  for (let i = 0; i < 3; i++) tower(-28 - r() * 10, along(0.15 + i * 0.3), 5 + r() * 2, 20 + r() * 8, i === 1);   // the keep's towers, tall, out beyond the moat
  // Rubble at the walls' feet.
  for (let i = 0; i < 900; i++) {
    const x = 3 + (r() < 0.5 ? -1 : 1) * (6 + r() * 20), z = along(r()), s = 0.4 + r() * 0.9, gy = groundY(x, z);
    if (gy + s > ceiling(x, z)) continue;
    q.setFromEuler(e.set(r() * 0.8, r() * 6, r() * 0.8)); m.compose(pos.set(x, gy + s * 0.25, z), q, sc.set(s * 1.2, s * 0.6, s * 0.9));
    if (ns < CAP) { stones.setMatrixAt(ns, m); stones.setColorAt(ns++, col.setHex(tones[Math.floor(r() * tones.length)]).lerp(new Color(0x9CB070), r() * 0.4)); }
  }
  q.identity();
  stones.count = ns; stones.castShadow = true; stones.receiveShadow = true; stones.computeBoundingSphere();
  G.add(stones);
  // Conical roofs, slate, on the towers that kept them.
  const slate = new MeshStandardMaterial({ color: 0x5A6478, roughness: 0.7 });
  for (const [x, y, z, rad] of roofs) { const c = new Mesh(new ConeGeometry(rad * 1.25, rad * 2.6, 24), slate); c.position.set(x, y + rad * 1.3, z); c.castShadow = true; G.add(c); }
  // IVY climbing the stones.
  const ivyT = canvasTex(64, 256, (g) => {
    const rr = seeded(44);
    for (let k = 0; k < 9; k++) {
      let x = 6 + rr() * 52;
      for (let y = 256; y > 0; y -= 4) {
        if (y < 256 - (80 + rr() * 176)) break;
        x += (rr() - 0.5) * 3;
        g.fillStyle = ['#3F6A2A', '#557F35', '#2F5620', '#6B9440'][Math.floor(rr() * 4)];
        g.beginPath(); g.ellipse(x + (rr() - 0.5) * 7, y, 3.5 + rr() * 2.5, 2.5 + rr() * 2, rr() * 3, 0, Math.PI * 2); g.fill();
      }
    }
  });
  const ivy = new InstancedMesh(new PlaneGeometry(1, 1), new MeshStandardMaterial({ map: ivyT, alphaTest: 0.45, side: DoubleSide, roughness: 0.85 }), ivySpots.length * 2 + 1);
  let ni = 0;
  for (const [x, gy, z, top, yaw] of ivySpots) for (const sgn of [-1, 1]) {
    const hgt = Math.max(1, (top - gy) * (0.5 + r() * 0.5)), wid = 1.5 + r() * 2.5;
    q.setFromEuler(e.set(0, yaw, 0)); const n = new Vector3(0, 0, sgn * 1.15).applyQuaternion(q);
    m.compose(pos.set(x + n.x, gy + hgt / 2, z + n.z), q, sc.set(wid, hgt, 1)); ivy.setMatrixAt(ni++, m);
  }
  q.identity(); ivy.count = ni; ivy.computeBoundingSphere(); G.add(ivy);
  // TREES grown up through the ruins, grass and flowers over everything.
  const windT = { value: 0 };
  const barkM = barkMaps(23);
  const barkMat = new MeshStandardMaterial({ map: barkM.colour, normalMap: barkM.normal, normalScale: new Vector2(1.5, 1.5), roughness: 0.93 });
  const leafM = leafMaterial(leafSprigTex(31, [['#4E6A26', '#708E36', '#94AE4C'], ['#5A7229', '#80983A', '#A8B858'], ['#445E22', '#627E30', '#86A044']]), windT);
  const kinds = [[TREE_KINDS.oak, 41], [TREE_KINDS.ash, 43], [TREE_KINDS.bush, 47]].map(([o, sd]) => {
    const g = growTree(o, sd); g.leaves.computeBoundingBox(); const bb = g.leaves.boundingBox;
    return { g, h: bb.max.y, crown: Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z) };
  });
  const planted = kinds.map(() => []);
  for (let i = 0; i < 160; i++) {
    const x = 3 + (r() - 0.5) * 110, z = along(r()), ki = r() < 0.3 ? 0 : r() < 0.5 ? 1 : 2, s = ki === 2 ? 0.8 + r() * 0.6 : 0.7 + r() * 0.45;
    const K = kinds[ki], gy = groundY(x, z), near = courseTopNear(x, z, K.crown * s + 1.2);
    if (near !== null && gy + K.h * s > near - 1.4) continue;
    planted[ki].push([x, gy - 0.1, z, s, r() * 6.3, r()]);
  }
  planted.forEach((list, ki) => {
    if (!list.length) return;
    const trunks = new InstancedMesh(kinds[ki].g.bark, barkMat, list.length), crowns = new InstancedMesh(kinds[ki].g.leaves, leafM, list.length);
    list.forEach(([x, y, z, s, turn, v], i) => {
      q.setFromEuler(e.set(0, turn, 0)); m.compose(pos.set(x, y, z), q, sc.set(s, s, s));
      trunks.setMatrixAt(i, m); crowns.setMatrixAt(i, m); crowns.setColorAt(i, col.setRGB(0.9 + v * 0.2, 0.9 + v * 0.1, 0.78 + v * 0.2));
    });
    q.identity();
    trunks.computeBoundingSphere(); crowns.computeBoundingSphere();
    trunks.castShadow = crowns.castShadow = true;
    G.add(trunks, crowns);
  });
  const bladeT = canvasTex(128, 128, (g) => {
    const rr = seeded(13);
    for (let i = 0; i < 40; i++) {
      const x0 = 20 + rr() * 88, lean = (rr() - 0.5) * 50, hgt = 50 + rr() * 70, wd = 2.5 + rr() * 3, c = [['#46692A', '#8DB450'], ['#50772E', '#A8C866'], ['#3A5E22', '#76A040']][Math.floor(rr() * 3)];
      const lg = g.createLinearGradient(0, 128, 0, 128 - hgt); lg.addColorStop(0, c[0]); lg.addColorStop(1, c[1]);
      g.fillStyle = lg; g.beginPath(); g.moveTo(x0 - wd, 128); g.quadraticCurveTo(x0 + lean * 0.3, 128 - hgt * 0.6, x0 + lean, 128 - hgt); g.quadraticCurveTo(x0 + lean * 0.3 + wd * 0.4, 128 - hgt * 0.55, x0 + wd, 128); g.closePath(); g.fill();
    }
  });
  const tuft = new BufferGeometry();
  { const P = [], N = [], U = [], I = [];
    for (let k = 0; k < 3; k++) { const a = (k * Math.PI) / 3, c = Math.cos(a) * 0.5, sn = Math.sin(a) * 0.5, b = P.length / 3; P.push(-c, 0, -sn, c, 0, sn, c, 1, sn, -c, 1, -sn); N.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0); U.push(0, 0, 1, 0, 1, 1, 0, 1); I.push(b, b + 1, b + 2, b, b + 2, b + 3); }
    tuft.setAttribute('position', new Float32BufferAttribute(P, 3)); tuft.setAttribute('normal', new Float32BufferAttribute(N, 3)); tuft.setAttribute('uv', new Float32BufferAttribute(U, 2)); tuft.setIndex(I); }
  const grass = new InstancedMesh(tuft, grassMaterial(bladeT, windT), 7000);
  for (let i = 0; i < 7000; i++) {
    const x = 3 + (r() - 0.5) * 90 * (0.3 + r() * 0.7), z = along(r()), s = 0.6 + r() * 0.8;
    q.setFromEuler(e.set(0, r() * 3.1, 0)); m.compose(pos.set(x, groundY(x, z) - 0.05, z), q, sc.set(s * 1.3, s, s * 1.3)); grass.setMatrixAt(i, m);
  }
  q.identity(); grass.computeBoundingSphere(); G.add(grass);
  // BANNERS, torn and faded, stirring on the tallest walls.
  const bannerT = canvasTex(64, 192, (g) => {
    g.fillStyle = '#8E2A26'; g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 0); g.lineTo(64, 150); g.lineTo(52, 170); g.lineTo(44, 150); g.lineTo(30, 186); g.lineTo(20, 158); g.lineTo(8, 176); g.lineTo(0, 150); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.08)'; for (let y = 0; y < 150; y += 6) g.fillRect(0, y, 64, 2);
    g.fillStyle = '#D9A93A'; g.beginPath(); g.moveTo(32, 40); g.lineTo(44, 62); g.lineTo(32, 90); g.lineTo(20, 62); g.closePath(); g.fill();   // a gold device
    g.strokeStyle = '#D9A93A'; g.lineWidth = 3; g.strokeRect(6, 6, 52, 130);
  });
  const bannerMat = new MeshStandardMaterial({ map: bannerT, alphaTest: 0.4, side: DoubleSide, roughness: 0.9 });
  bannerMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed.z += sin(uTime * 2.2 + position.y * 2.0) * 0.25 * (0.5 - position.y);');
  };
  bannerMat.customProgramCacheKey = () => 'banner';
  const bannerGeo = new PlaneGeometry(1.4, 4.2, 1, 12); bannerGeo.translate(0, -2.1, 0);
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1, x = 3 + side * 13.6, z = along(0.05 + i * 0.12), top = Math.min(groundY(x, z) + 11, ceiling(x, z));
    const b = new Mesh(bannerGeo, bannerMat); b.position.set(x, top, z); b.rotation.y = Math.PI / 2; G.add(b);
  }
  // CROWS wheeling round the tallest towers.
  const crows = new InstancedMesh(birdGeo, new MeshStandardMaterial({ color: 0x1E1E22, side: DoubleSide, roughness: 1 }), 18), crowList = [];
  for (let i = 0; i < 18; i++) crowList.push({ x: 3 + (i % 3 - 1) * 10, y: Math.min(-4, minTop - 4) - r() * 5, z: along(0.1 + (i % 3) * 0.3), rad: 7 + r() * 7, ph: r() * 6.3, sp: 0.35 + r() * 0.25 });
  G.add(crows);
  // MOTES in the low sun.
  const NP = 400, pp = new Float32Array(NP * 3);
  for (let i = 0; i < NP; i++) { pp[i * 3] = -25 + r() * 56; pp[i * 3 + 1] = GROUND + r() * 18; pp[i * 3 + 2] = along(r()); }
  const moteGeo = new BufferGeometry(); moteGeo.setAttribute('position', new Float32BufferAttribute(pp, 3));
  G.add(new Points(moteGeo, new PointsMaterial({ color: 0xFFE2B0, size: 0.1, transparent: true, opacity: 0.8, depthWrite: false })));
  // TORCHES in iron brackets on the walls by the way, flames flickering, sparks rising.
  const flameT = canvasTex(64, 128, (g) => {
    const rg = g.createRadialGradient(32, 92, 2, 32, 80, 60);
    rg.addColorStop(0, 'rgba(255,250,220,1)'); rg.addColorStop(0.25, 'rgba(255,200,90,0.95)'); rg.addColorStop(0.6, 'rgba(255,110,30,0.6)'); rg.addColorStop(1, 'rgba(200,40,10,0)');
    g.fillStyle = rg; g.beginPath(); g.moveTo(32, 4); g.quadraticCurveTo(60, 70, 44, 118); g.quadraticCurveTo(32, 128, 20, 118); g.quadraticCurveTo(4, 70, 32, 4); g.fill();
  });
  const iron = new MeshStandardMaterial({ color: 0x2A2622, metalness: 0.6, roughness: 0.5 });
  // Each stands on a stone pillar just off the path's edge, its flame at the path's height, alternate sides.
  const torches = [], pillarM = new MeshStandardMaterial({ map: faces[0], roughness: 0.93 });
  let lastTz = 99, tSide = -1;
  for (const pc of (level ? level.pieces : [])) {
    if (pc.t !== 'flat' || pc.d < 4 || pc.dark !== undefined || pc.gauntlet || pc.spoke || pc.detour !== undefined) continue;
    const z = pc.z; if (lastTz - z < 11) continue;
    lastTz = z; tSide = -tSide;
    const x = pc.x + tSide * (pc.w / 2 + 1.3), gy = groundY(x, z);
    if (courseTopNear(x, z, 0.6) !== null) continue;         // another piece is right there: not here
    const pil = new Mesh(new BoxGeometry(1.3, pc.y - 0.4 - gy, 1.3), pillarM); pil.position.set(x, (pc.y - 0.4 + gy) / 2, z); pil.castShadow = true; G.add(pil);
    const post = new Mesh(new CylinderGeometry(0.12, 0.09, 1.2, 8), iron); post.position.set(x, pc.y + 0.2, z); G.add(post);
    const cup = new Mesh(new CylinderGeometry(0.32, 0.18, 0.4, 10), iron); cup.position.set(x, pc.y + 0.85, z); G.add(cup);
    const fl = new Sprite(new SpriteMaterial({ map: flameT, color: 0xFFFFFF, transparent: true, blending: AdditiveBlending, depthWrite: false }));
    fl.scale.set(0.9, 1.6, 1); fl.position.set(x, pc.y + 1.75, z); G.add(fl);
    const glow = new Sprite(new SpriteMaterial({ map: dot, color: 0xFF9A3A, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false }));
    glow.scale.set(5, 5, 1); glow.position.copy(fl.position); G.add(glow);
    torches.push({ fl, glow, y: pc.y + 1.75, ph: r() * 20, x, z });
  }
  const NE = 160, ep = new Float32Array(NE * 3), eLife = new Float32Array(NE);
  const emberGeo = new BufferGeometry(); emberGeo.setAttribute('position', new Float32BufferAttribute(ep, 3));
  G.add(new Points(emberGeo, new PointsMaterial({ color: 0xFFB050, size: 0.12, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false })));
  // A WATERMILL on the moat: its wheel turning under a flume of falling water.
  const millX = 3 - 22, millZ = along(0.18), millY = GROUND + 0.9;
  const timber = new MeshStandardMaterial({ color: 0x6A4A30, roughness: 0.85 });
  const wheel = new Group();
  const rim = new Mesh(new TorusGeometry(4, 0.22, 8, 40), timber); wheel.add(rim);
  const rim2 = rim.clone(); rim2.position.z = 1.4; wheel.add(rim2);
  for (let k = 0; k < 16; k++) {
    const a2 = (k / 16) * Math.PI * 2, paddle = new Mesh(new BoxGeometry(0.15, 1.1, 1.5), timber); paddle.position.set(Math.cos(a2) * 4, Math.sin(a2) * 4, 0.7); paddle.rotation.z = a2; wheel.add(paddle);
    if (k % 2 === 0) { const spoke = new Mesh(new BoxGeometry(8, 0.18, 0.18), timber); spoke.rotation.z = a2; spoke.position.z = 0.7; wheel.add(spoke); }
  }
  wheel.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  wheel.position.set(millX + 7, millY + 3.2, millZ); wheel.rotation.y = Math.PI / 2; G.add(wheel);
  const millHouse = new Mesh(new BoxGeometry(8, 7, 9), new MeshStandardMaterial({ map: faces[1], roughness: 0.9 })); millHouse.position.set(millX, millY + 3, millZ); millHouse.castShadow = true; G.add(millHouse);
  const millRoof = new Mesh(new ConeGeometry(7.2, 4.5, 4), new MeshStandardMaterial({ color: 0x7A4A36, roughness: 0.8 })); millRoof.position.set(millX, millY + 8.8, millZ); millRoof.rotation.y = Math.PI / 4; G.add(millRoof);
  const flume = new Mesh(new BoxGeometry(1.4, 0.5, 14), timber); flume.position.set(millX + 7, millY + 8, millZ + 6); G.add(flume);
  const pourT = canvasTex(32, 128, (g) => { const rr = seeded(3); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(220,240,250,${0.3 + rr() * 0.5})`; const x = rr() * 32, y = rr() * 128; g.fillRect(x, y, 2, 12 + rr() * 20); g.fillRect(x, y - 128, 2, 12 + rr() * 20); } }, true);
  const pour = new Mesh(new PlaneGeometry(1.3, 4), new MeshBasicMaterial({ map: pourT, transparent: true, depthWrite: false, side: DoubleSide })); pour.position.set(millX + 7, millY + 5.8, millZ - 0.9); pour.rotation.y = Math.PI / 2; G.add(pour);
  // A HORSE AND CART on a road that passes under the path, to and fro.
  const roadZ = along(0.12), dirt = new Mesh(new PlaneGeometry(140, 5), new MeshStandardMaterial({ color: 0x9A7A56, roughness: 1 }));
  dirt.rotation.x = -Math.PI / 2; dirt.position.set(3, groundY(3, roadZ) + 0.25, roadZ); G.add(dirt);
  const cart = new Group(), hide = new MeshStandardMaterial({ color: 0x6E4A30, roughness: 0.8 }), cloth = new MeshStandardMaterial({ color: 0xE8DCC0, roughness: 0.9 });
  const bed = new Mesh(new BoxGeometry(2.2, 0.9, 3.6), timber); bed.position.set(0, 1.3, 0); cart.add(bed);
  const cover = new Mesh(new CylinderGeometry(1.2, 1.2, 3.6, 16, 1, true, 0, Math.PI), cloth); cover.material.side = DoubleSide; cover.rotation.set(Math.PI / 2, 0, Math.PI / 2); cover.position.set(0, 1.75, 0); cart.add(cover);
  const cartWheels = [];
  for (const sx2 of [-1.25, 1.25]) for (const sz of [-1, 1]) { const wl = new Mesh(new TorusGeometry(0.6, 0.1, 6, 16), timber); wl.position.set(sx2, 0.7, sz); wl.rotation.y = Math.PI / 2; cart.add(wl); cartWheels.push(wl); }
  const horse = new Group();
  const hb = new Mesh(capsule(0.7, 2), hide); hb.rotation.x = Math.PI / 2; hb.position.set(0, 2, 0); horse.add(hb);
  const neck = new Mesh(capsule(0.35, 1.2), hide); neck.position.set(0, 2.9, 1.3); neck.rotation.x = 0.6; horse.add(neck);
  const head = new Mesh(capsule(0.28, 0.9), hide); head.position.set(0, 3.45, 1.95); head.rotation.x = 1.7; horse.add(head);
  const legs = [];
  for (const [lx, lz] of [[-0.4, 0.9], [0.4, 0.9], [-0.4, -0.9], [0.4, -0.9]]) { const leg = new Group(), lm = new Mesh(new CylinderGeometry(0.13, 0.1, 1.5, 6), hide); lm.position.y = -0.75; leg.add(lm); leg.position.set(lx, 1.6, lz); horse.add(leg); legs.push(leg); }
  horse.position.set(0, 0, 4.2); cart.add(horse);
  cart.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  G.add(cart);
  // CLOUDS sailing slowly across the sky.
  const ct = cloudTex(), clouds = [];
  for (let i = 0; i < 9; i++) { const sp = new Sprite(new SpriteMaterial({ map: ct, color: 0xFFF1DE, transparent: true, opacity: 0.9, depthWrite: false })); const sz2 = 40 + r() * 50; sp.scale.set(sz2, sz2 * 0.4, 1); sp.position.set(-120 + r() * 240, 28 + r() * 25, far - 20 + r() * 60); G.add(sp); clouds.push({ sp, v: 1 + r() * 1.5 }); }
  const live = !REDUCED;
  let t = 0;
  const placeCrows = () => {
    crowList.forEach((C, i) => {
      const a = t * C.sp + C.ph;
      q.setFromEuler(e.set(0, -a, 0));
      m.compose(pos.set(C.x + Math.cos(a) * C.rad, C.y + Math.sin(t + C.ph) * 0.8, C.z + Math.sin(a) * C.rad), q, sc.set(1.1, (0.35 + 0.65 * Math.abs(Math.sin(t * 6 + C.ph))) * 1.1, 1.1));
      crows.setMatrixAt(i, m);
    });
    q.identity(); crows.instanceMatrix.needsUpdate = true;
  };
  placeCrows();
  w.tick = (dt) => {
    if (!live) return;
    t += dt; windT.value = t;
    placeCrows();
    for (const T of torches) {                            // each flame its own flicker
      const f = 0.82 + 0.12 * Math.sin(t * 13 + T.ph) + 0.08 * Math.sin(t * 29 + T.ph * 1.7);
      T.fl.scale.set(0.9 * f, 1.6 * (0.9 + 0.2 * Math.sin(t * 17 + T.ph)), 1); T.glow.material.opacity = 0.4 + 0.2 * f;
    }
    const ea = emberGeo.attributes.position;
    for (let i = 0; i < NE; i++) {                        // sparks off the torches, rising and dying
      eLife[i] -= dt;
      if (eLife[i] <= 0 && torches.length) { const T = torches[i % torches.length]; ea.array[i * 3] = T.x; ea.array[i * 3 + 1] = T.y; ea.array[i * 3 + 2] = T.z; eLife[i] = 0.8 + ((i * 0.37 + t) % 1) * 1.4; }
      ea.array[i * 3 + 1] += dt * 1.6; ea.array[i * 3] += Math.sin(t * 3 + i) * dt * 0.4;
    }
    ea.needsUpdate = true;
    wheel.rotation.z = -t * 0.6;
    pourT.offset.y = t * 1.2;
    { const span = 110, u = ((t * 2.4) % (2 * span)), fwd = u < span, xx = 3 - span / 2 + (fwd ? u : 2 * span - u);   // the cart, along the road and back
      cart.position.set(xx, groundY(xx, roadZ) + 0.2, roadZ); cart.rotation.y = fwd ? Math.PI / 2 : -Math.PI / 2;
      for (const wl of cartWheels) wl.rotation.x = t * 3.7;
      legs.forEach((lg, k) => { lg.rotation.x = Math.sin(t * 7 + (k % 2 ? Math.PI : 0) + (k > 1 ? Math.PI / 2 : 0)) * 0.5; }); }
    for (const C of clouds) { C.sp.position.x += C.v * dt; if (C.sp.position.x > 140) C.sp.position.x = -140; }
    const a = moteGeo.attributes.position;
    for (let i = 0; i < NP; i++) { a.array[i * 3 + 1] += dt * 0.12; if (a.array[i * 3 + 1] > GROUND + 18) a.array[i * 3 + 1] = GROUND; }
    a.needsUpdate = true;
  };
});

// ---- 8. The study: a schoolchild's desk at a marble's scale, crowded with things ----
/* THE DESK, MADE RICH (owner, 2026-09-27: "I like the desk, but it needs to be
   much richer visually"). A glass marble on a real desk, everything at the
   marble's scale (about fifty times life): the path is rulers, closed books
   and erasers laid end to end, held up on stacks of books; the desk round it
   is crowded: pencils sharpened and not, a pencil cup, crayons spilled from
   their box, an open exercise book with a doodle, sticky notes, paper clips,
   an eraser worn at one corner, a sharpener in its shavings, scissors, a mug
   of cocoa, a globe, a potted cactus, dice, a desk lamp pooling warm light,
   all under a sunny window, the room beyond softly out of focus. */
function spineTex(base, band, title) {
  return canvasTex(64, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 64, 256);
    const lg = g.createLinearGradient(0, 0, 64, 0); lg.addColorStop(0, 'rgba(0,0,0,0.3)'); lg.addColorStop(0.2, 'rgba(255,255,255,0.12)'); lg.addColorStop(0.8, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = lg; g.fillRect(0, 0, 64, 256);
    g.fillStyle = band; g.fillRect(0, 22, 64, 8); g.fillRect(0, 226, 64, 8);
    g.fillStyle = band; for (let i = 0; i < title; i++) g.fillRect(18, 70 + i * 16, 28 - (i % 2) * 8, 6);     // a title, as bars
  });
}
function studyBook(w, h, d, base, band, rr) {            // a hardback lying flat: a cover, a spine, the page block
  const g = new Group();
  const pages = new Mesh(new BoxGeometry(w - 0.3, h * 0.84, d - 0.2), new MeshStandardMaterial({ map: paperStackTex(), roughness: 0.9 }));
  pages.position.x = 0.1; g.add(pages);
  const cover = new MeshStandardMaterial({ color: base, roughness: 0.6 });
  for (const sy of [-1, 1]) { const c = new Mesh(new BoxGeometry(w, h * 0.08, d), cover); c.position.y = sy * h * 0.46; g.add(c); }
  const spine = new Mesh(new BoxGeometry(0.12, h, d), new MeshStandardMaterial({ map: spineTex('#' + base.toString(16).padStart(6, '0'), band, 2 + Math.floor(rr() * 3)), roughness: 0.6 }));
  spine.rotation.y = 0; spine.position.x = -w / 2; g.add(spine);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
let paperStackT = null;
function paperStackTex() {
  return paperStackT || (paperStackT = canvasTex(64, 64, (g) => {
    g.fillStyle = '#F1E9D6'; g.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 2) { g.fillStyle = `rgba(160,140,110,${0.15 + (y % 6 === 0 ? 0.15 : 0)})`; g.fillRect(0, y, 64, 1); }
  }, true));
}
function pencil(len, colour, sharpened) {                // hexagonal, painted, a ferrule and eraser at one end, a cone of wood and a lead at the other
  const g = new Group(), rad = 0.36;
  const body = new Mesh(new CylinderGeometry(rad, rad, len, 6), new MeshStandardMaterial({ color: colour, roughness: 0.45 }));
  g.add(body);
  const ferrule = new Mesh(new CylinderGeometry(rad * 1.02, rad * 1.02, 0.9, 16), new MeshStandardMaterial({ color: 0xC9C2B0, metalness: 0.9, roughness: 0.3, envMap: envTex }));
  ferrule.position.y = -len / 2 - 0.45; g.add(ferrule);
  const rub = new Mesh(new CylinderGeometry(rad * 0.98, rad * 0.98, 0.7, 16), new MeshStandardMaterial({ color: 0xF09AA4, roughness: 0.8 }));
  rub.position.y = -len / 2 - 1.25; g.add(rub);
  if (sharpened) {
    const wood = new Mesh(new CylinderGeometry(0.06, rad, 1.5, 6), new MeshStandardMaterial({ color: 0xE8C898, roughness: 0.8 }));
    wood.position.y = len / 2 + 0.75; g.add(wood);
    const lead = new Mesh(new ConeGeometry(0.08, 0.35, 8), new MeshStandardMaterial({ color: 0x3A3A3E, metalness: 0.4, roughness: 0.4 }));
    lead.position.y = len / 2 + 1.55; g.add(lead);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
let studyMats = null;
function studyMaterials() {
  if (studyMats) return studyMats;
  const ruler = canvasTex(512, 64, (g) => {                 // a wooden ruler: grain, centimetres and millimetres
    g.fillStyle = '#E3C48E'; g.fillRect(0, 0, 512, 64);
    const r = seeded(6);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(170,120,60,${0.1 + r() * 0.15})`; g.lineWidth = 1 + r() * 2; g.beginPath(); const y = r() * 64; g.moveTo(0, y); g.bezierCurveTo(170, y + (r() - 0.5) * 10, 340, y + (r() - 0.5) * 10, 512, y); g.stroke(); }
    g.fillStyle = '#2A2118';
    for (let i = 0; i <= 100; i++) { const x = 6 + i * 5; g.fillRect(x, 0, 1.2, i % 10 === 0 ? 22 : i % 5 === 0 ? 15 : 9); }
    g.font = 'bold 13px sans-serif'; for (let i = 0; i <= 10; i++) g.fillText(String(i), 3 + i * 50, 38);
  }, true);
  studyMats = {
    top: new MeshStandardMaterial({ map: ruler, roughness: 0.55 }),
    side: new MeshStandardMaterial({ color: 0xC9A46C, roughness: 0.6 }),
    under: new MeshStandardMaterial({ color: 0xA88455, roughness: 0.8 }),
    eraserTop: new MeshStandardMaterial({ color: 0xF4B3BC, roughness: 0.85 }),
    eraserSide: new MeshStandardMaterial({ color: 0xE895A2, roughness: 0.85 }),
    bookTop: new MeshStandardMaterial({ map: canvasTex(256, 256, (g) => {
      g.fillStyle = '#2F6F73'; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#E9D9B6'; g.lineWidth = 6; g.strokeRect(20, 20, 216, 216);
      g.fillStyle = '#E9D9B6'; g.fillRect(60, 90, 136, 14); g.fillRect(80, 118, 96, 8);
    }, true), roughness: 0.6 }),
    ferryTop: new MeshStandardMaterial({ color: 0x9DC6E8, roughness: 0.3, metalness: 0.1 }),
    ferrySide: new MeshStandardMaterial({ color: 0x6FA2CC, roughness: 0.35 }),
  };
  return studyMats;
}
WORLDS_ADD('study', (w) => {
  scene.background = coverTex(512, (g) => {                 // the room, out of focus
    const lg = g.createLinearGradient(0, 0, 0, 512);
    lg.addColorStop(0, '#E8D8BF'); lg.addColorStop(0.6, '#F1E3CB'); lg.addColorStop(1, '#E6D2B2');
    g.fillStyle = lg; g.fillRect(0, 0, 512, 512);
    g.filter = 'blur(14px)';
    g.fillStyle = '#FFF8E6'; g.fillRect(250, 20, 220, 250);                                   // the window, sunlit
    g.fillStyle = 'rgba(214,198,170,0.9)'; g.fillRect(355, 20, 10, 250); g.fillRect(250, 140, 220, 10);
    g.fillStyle = 'rgba(160,205,240,0.9)'; g.fillRect(262, 34, 88, 100); g.fillRect(372, 34, 88, 100);   // sky in the panes
    g.fillStyle = 'rgba(110,170,90,0.9)'; g.beginPath(); g.arc(300, 120, 34, 0, 7); g.arc(420, 110, 40, 0, 7); g.fill();   // a tree outside
    g.fillStyle = 'rgba(220,110,90,0.9)'; g.fillRect(470, 10, 42, 290); g.fillRect(210, 10, 42, 290);   // curtains
    g.fillStyle = '#7A5A3E'; g.fillRect(20, 50, 160, 300);                                      // a bookcase
    const cols = ['#C94F4F', '#E0A33A', '#4F7FC9', '#5AA66A', '#8A5FC0', '#E07A5F', '#3F8F9F', '#F2C230'];
    for (let row = 0; row < 4; row++) for (let i = 0; i < 9; i++) { g.fillStyle = cols[(i + row * 3) % 8]; g.fillRect(30 + i * 16, 62 + row * 72, 12, 56 - (i % 3) * 8); }
    g.fillStyle = 'rgba(255,230,160,0.9)'; g.beginPath(); g.arc(200, 380, 40, 0, 7); g.fill();  // a lamp's glow
    g.filter = 'none';
  });
  scene.fog.color.setHex(0xE9DAC0); scene.fog.near = 40; scene.fog.far = 140;
  hemi.color.setHex(0xFFF3E0); hemi.groundColor.setHex(0x8A6A48); hemi.intensity = 1.05;
  sun.color.setHex(0xFFE8C6); sun.intensity = 3.1;
  w.marble = 'glass'; w.rings = [0x4F9DE0, 0xE8563F];
  const G = w.group, r = seeded(59), end = courseEnd(), minTop = level ? level.minTop : 0, DESK = Math.min(-9, minTop - 8);
  const far = Math.min(-160, end - 90), mid = (26 + far) / 2;
  // THE DESK: planks of oak, varnished.
  const oak = canvasTex(1024, 1024, (g) => {
    const rr = seeded(3);
    for (let p = 0; p < 4; p++) {
      const x0 = p * 256, tone = 185 + rr() * 30;
      g.fillStyle = `rgb(${tone},${tone * 0.72},${tone * 0.46})`; g.fillRect(x0, 0, 256, 1024);
      for (let i = 0; i < 70; i++) {
        g.strokeStyle = `rgba(${110 + rr() * 30},${65 + rr() * 20},${30 + rr() * 15},${0.12 + rr() * 0.2})`; g.lineWidth = 1 + rr() * 3;
        g.beginPath(); let x = x0 + rr() * 256; g.moveTo(x, 0);
        for (let y = 0; y <= 1024; y += 32) { x += Math.sin(y * 0.01 + i) * 3; g.lineTo(x, y); } g.stroke();
      }
      for (let k = 0; k < 2; k++) { const kx = x0 + 40 + rr() * 170, ky = rr() * 1024; g.strokeStyle = 'rgba(90,50,20,0.4)'; g.lineWidth = 2; for (let e = 4; e < 22; e += 5) { g.beginPath(); g.ellipse(kx, ky, e * 0.6, e * 1.6, 0, 0, 7); g.stroke(); } }
      g.fillStyle = 'rgba(60,35,15,0.6)'; g.fillRect(x0, 0, 3, 1024);                          // the seam between planks
    }
  }, true);
  const deskTop = new Mesh(new PlaneGeometry(300, 300), worldMapped(new MeshStandardMaterial({ map: oak, roughness: 0.38, metalness: 0.05, envMap: envTex, envMapIntensity: 0.4 }), 1 / 40, 'study-desk'));
  deskTop.rotation.x = -Math.PI / 2; deskTop.position.set(0, DESK, mid); deskTop.receiveShadow = true; G.add(deskTop);
  // Where a thing may stand: clear of the path's footprint, or low enough under it.
  const clear = (x, z, rad, h) => { const t = courseTopNear(x, z, rad + 0.8); return t === null || DESK + h < t - 1.5; };
  let turn = 0;
  const along = (rad, h) => {                              // set pieces take turns along the way, a side each, near enough to see
    const k = turn++, side = k % 2 ? 1 : -1, z0 = 2 - k * 22;
    for (let i = 0; i < 40; i++) { const x = 3 + side * (rad + 5 + r() * 8), z = z0 - r() * 12; if (clear(x, z, rad, h)) return [x, z]; }
    return null;
  };
  const spot = (tries, rad, h, xr = 40) => { for (let i = 0; i < tries; i++) { const x = 3 + (r() - 0.5) * 2 * xr, z = mid + (r() - 0.5) * (26 - far); if (clear(x, z, rad, h)) return [x, z]; } return null; };
  // STACKS OF BOOKS hold the path up.
  const bookCols = [[0x2F6F73, '#E9D9B6'], [0xB8403A, '#F2D59A'], [0xE3A33B, '#5A3A1A'], [0x3F5FA8, '#F4E6C8'], [0x5E9A58, '#F4E6C8'], [0x7E4FA8, '#F2D59A'], [0xD9774F, '#FFF1DA'], [0x2C3E58, '#D9B66A']];
  for (const c of colliders) {
    if (c.ferry || c.obstacle) continue;
    let y = DESK, k = 0;
    const top = c.pos.y - c.half.y;
    while (y < top - 0.05) {
      const t = Math.min(top - y, 1.2 + r() * 0.8), [base, band] = bookCols[(k * 3 + Math.abs(Math.floor(c.pos.z))) % bookCols.length];
      const b = studyBook(c.half.x * 2 * (0.9 + r() * 0.3), t, c.half.z * 2 * (0.8 + r() * 0.3), base, band, r);
      b.position.set(c.pos.x + (r() - 0.5) * 0.6, y + t / 2, c.pos.z + (r() - 0.5) * 0.6); b.rotation.y = (r() - 0.5) * 0.2 + (k % 2 ? Math.PI : 0);
      G.add(b); y += t; k++;
    }
  }
  // PENCILS: loose on the desk, sharpened and not.
  const pcols = [0xF2C230, 0xE0513A, 0x3E9E5A, 0x4A74C9, 0x9A5FC4, 0xF08A3A, 0x2B2B2B];
  for (let i = 0; i < 26; i++) {
    const s = spot(20, 6, 1); if (!s) continue;
    const p = pencil(9 + r() * 4, pcols[i % pcols.length], r() < 0.75);
    p.rotation.set(Math.PI / 2, 0, r() * 6.3); p.position.set(s[0], DESK + 0.36, s[1]); G.add(p);
  }
  // A PENCIL CUP, full.
  const cupAt = spot(40, 4, 14, 26) || [-18, -30];
  const cup = new Mesh(new CylinderGeometry(3, 2.8, 8, 40, 1, true), new MeshStandardMaterial({ color: 0x3E7BC0, roughness: 0.35, side: DoubleSide }));
  cup.position.set(cupAt[0], DESK + 4, cupAt[1]); cup.castShadow = true; G.add(cup);
  const cupBase = new Mesh(new CylinderGeometry(2.8, 2.8, 0.3, 40), cup.material); cupBase.position.set(cupAt[0], DESK + 0.15, cupAt[1]); G.add(cupBase);
  for (let i = 0; i < 9; i++) {
    const p = pencil(11 + r() * 3, pcols[i % pcols.length], true), a = (i / 9) * 6.3;
    p.position.set(cupAt[0] + Math.cos(a) * 1.4, DESK + 7 + r() * 1.5, cupAt[1] + Math.sin(a) * 1.4); p.rotation.set((r() - 0.5) * 0.35 + Math.sin(a) * 0.2, 0, (r() - 0.5) * 0.35 - Math.cos(a) * 0.2);
    G.add(p);
  }
  // CRAYONS spilled from their box.
  const crayonCols = [0xE23A3A, 0xF28C28, 0xF6D23A, 0x4DB34D, 0x3A7AE0, 0x7A4AD0, 0xE05AA0, 0x8A5A30];
  const boxAt = spot(40, 5, 3) || [20, -40];
  const box = new Mesh(new BoxGeometry(7, 2.2, 4.4), new MeshStandardMaterial({ map: canvasTex(128, 64, (g) => {
    g.fillStyle = '#F6D23A'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#2E7D32'; g.fillRect(0, 40, 128, 24);
    g.fillStyle = '#E23A3A'; g.font = 'bold 22px sans-serif'; g.fillText('CRAYONS', 12, 30);
  }), roughness: 0.6 }));
  box.position.set(boxAt[0], DESK + 1.1, boxAt[1]); box.rotation.y = r() * 6.3; box.castShadow = true; G.add(box);
  for (let i = 0; i < 12; i++) {
    const cg = new Group(), colr = crayonCols[i % crayonCols.length];
    const wax = new Mesh(new CylinderGeometry(0.42, 0.42, 5.5, 14), new MeshStandardMaterial({ color: colr, roughness: 0.5 }));
    const label = new Mesh(new CylinderGeometry(0.44, 0.44, 3.4, 14), new MeshStandardMaterial({ map: canvasTex(64, 32, (g) => { g.fillStyle = '#' + colr.toString(16).padStart(6, '0'); g.fillRect(0, 0, 64, 32); g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 4, 64, 3); g.fillRect(0, 25, 64, 3); for (let x = 4; x < 64; x += 14) g.fillRect(x, 12, 8, 7); }), roughness: 0.7 }));
    const tip = new Mesh(new ConeGeometry(0.42, 0.9, 14), wax.material); tip.position.y = 3.2;
    cg.add(wax, label, tip); cg.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const a = r() * 6.3, d = 5 + r() * 6;
    const cx = boxAt[0] + Math.cos(a) * d, cz = boxAt[1] + Math.sin(a) * d;
    if (!clear(cx, cz, 3, 1)) continue;
    cg.rotation.set(Math.PI / 2, 0, r() * 6.3); cg.position.set(cx, DESK + 0.42, cz); G.add(cg);
  }
  // AN OPEN EXERCISE BOOK, with a doodle, and STICKY NOTES.
  const nbAt = spot(40, 9, 1) || [-20, -60];
  const leafTex = (doodle) => canvasTex(256, 320, (g) => {
    g.fillStyle = '#FBF8F0'; g.fillRect(0, 0, 256, 320);
    g.fillStyle = 'rgba(90,140,210,0.5)'; for (let y = 24; y < 320; y += 16) g.fillRect(0, y, 256, 1.5);
    g.fillStyle = 'rgba(220,80,80,0.6)'; g.fillRect(30, 0, 2, 320);
    g.strokeStyle = '#2A4A9A'; g.lineWidth = 2.5; g.lineCap = 'round';
    if (doodle) { g.beginPath(); g.arc(128, 150, 40, 0, 7); g.stroke(); g.beginPath(); g.arc(114, 140, 5, 0, 7); g.arc(142, 140, 5, 0, 7); g.fill(); g.beginPath(); g.arc(128, 158, 18, 0.2, Math.PI - 0.2); g.stroke();   // a smiling face
      for (let i = 0; i < 8; i++) { const a = i * 0.785; g.beginPath(); g.moveTo(128 + Math.cos(a) * 50, 150 + Math.sin(a) * 50); g.lineTo(128 + Math.cos(a) * 66, 150 + Math.sin(a) * 66); g.stroke(); } }
    else for (let y = 40; y < 300; y += 16) { g.beginPath(); g.moveTo(40, y - 3); for (let x = 40; x < 220 - (y % 48); x += 8) g.lineTo(x + 4, y - 3 - Math.abs(Math.sin(x * 0.7 + y)) * 5); g.stroke(); }   // handwriting
  });
  for (const [dx, doodle, tilt] of [[-4.6, false, 0.05], [4.6, true, -0.05]]) {
    const pg = new Mesh(new PlaneGeometry(9, 11.5), new MeshStandardMaterial({ map: leafTex(doodle), roughness: 0.9 }));
    pg.rotation.set(-Math.PI / 2, 0, tilt); pg.position.set(nbAt[0] + dx, DESK + 0.12, nbAt[1]); pg.receiveShadow = true; G.add(pg);
  }
  const noteCols = ['#FFE66D', '#FF9FB2', '#9BE3A0', '#8FD3FF', '#FFB86B'];
  for (let i = 0; i < 16; i++) {
    const s = spot(20, 3, 0.2); if (!s) continue;
    const n = new Mesh(new PlaneGeometry(3.8, 3.8), new MeshStandardMaterial({ map: canvasTex(64, 64, (g) => {
      g.fillStyle = noteCols[i % 5]; g.fillRect(0, 0, 64, 64); g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, 0, 64, 12);
      g.strokeStyle = 'rgba(40,40,80,0.7)'; g.lineWidth = 2; for (let y = 24; y < 58; y += 10) { g.beginPath(); g.moveTo(8, y); g.lineTo(20 + ((i * 7 + y) % 36), y); g.stroke(); }
    }), roughness: 0.9 }));
    n.rotation.set(-Math.PI / 2, 0, r() * 6.3); n.position.set(s[0], DESK + 0.05 + i * 0.002, s[1]); n.receiveShadow = true; G.add(n);
  }
  // PAPER CLIPS: a loop of wire, twice.
  const clipGeo = (() => {
    const pts = [[0, 0], [0, 3.2], [1.1, 3.2], [1.1, -0.4], [0.35, -0.4], [0.35, 2.6], [0.75, 2.6]], path = [];
    for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 8; k++) { const t = k / 8; path.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]); }
    const g = new Group();
    const mat = new MeshStandardMaterial({ color: 0xD8DCE2, metalness: 1, roughness: 0.2, envMap: envTex });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const seg = new Mesh(new CylinderGeometry(0.07, 0.07, len, 6), mat);
      seg.position.set((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2); seg.rotation.set(Math.PI / 2, 0, -Math.atan2(b[0] - a[0], b[1] - a[1])); g.add(seg);
    }
    return g;
  });
  for (let i = 0; i < 10; i++) { const s = spot(20, 2, 0.2); if (!s) continue; const c = clipGeo(); c.position.set(s[0], DESK + 0.08, s[1]); c.rotation.y = r() * 6.3; G.add(c); }
  // A MUG OF COCOA, steaming.
  const mugAt = spot(60, 4, 9, 30) || [22, -80];
  const mugMat = new MeshStandardMaterial({ color: 0xF4F0E6, roughness: 0.3 });
  const mug = new Mesh(new CylinderGeometry(3, 2.7, 7, 40, 1, true), mugMat); mug.material.side = DoubleSide;
  mug.position.set(mugAt[0], DESK + 3.5, mugAt[1]); mug.castShadow = true; G.add(mug);
  const cocoa = new Mesh(new CircleGeometry(2.9, 32), new MeshStandardMaterial({ color: 0x6A3E22, roughness: 0.25 }));
  cocoa.rotation.x = -Math.PI / 2; cocoa.position.set(mugAt[0], DESK + 6.2, mugAt[1]); G.add(cocoa);
  const handle = new Mesh(new TorusGeometry(1.6, 0.35, 12, 24, Math.PI * 1.3), mugMat); handle.position.set(mugAt[0] + 3.1, DESK + 3.5, mugAt[1]); handle.rotation.z = -Math.PI * 0.65; G.add(handle);
  const band = new Mesh(new CylinderGeometry(3.02, 2.9, 1.2, 40, 1, true), new MeshStandardMaterial({ color: 0xE8563F, roughness: 0.4 })); band.position.set(mugAt[0], DESK + 4.5, mugAt[1]); G.add(band);
  const steam = [];
  for (let i = 0; i < 5; i++) {
    const sp = new Sprite(new SpriteMaterial({ map: dot, color: 0xFFFFFF, transparent: true, opacity: 0.25, depthWrite: false }));
    sp.scale.set(2.4, 2.4, 1); sp.position.set(mugAt[0], DESK + 7 + i * 1.4, mugAt[1]); G.add(sp); steam.push(sp);
  }
  // A GLOBE on its stand, off to one side.
  const glAt = spot(60, 6, 16, 34) || [-26, -100];
  const globeT = canvasTex(512, 256, (g) => {
    g.fillStyle = '#4A8FD0'; g.fillRect(0, 0, 512, 256);
    const rr = seeded(22); g.fillStyle = '#7FB76A';
    for (let i = 0; i < 16; i++) { g.beginPath(); const cx = rr() * 512, cy = 50 + rr() * 156; for (let k = 0; k < 9; k++) { const a = (k / 9) * 6.3, rad = 20 + rr() * 34; g.lineTo(cx + Math.cos(a) * rad * 1.3, cy + Math.sin(a) * rad * 0.8); } g.closePath(); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; for (let y = 32; y < 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); } for (let x = 0; x < 512; x += 43) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  });
  const globe = new Mesh(new SphereGeometry(5, 40, 24), new MeshStandardMaterial({ map: globeT, roughness: 0.4 }));
  globe.position.set(glAt[0], DESK + 10, glAt[1]); globe.rotation.order = 'ZYX'; globe.rotation.z = 0.4; globe.castShadow = true; G.add(globe);   // it turns on its own tilted axis
  const brass = new MeshStandardMaterial({ color: 0xC9A04A, metalness: 1, roughness: 0.3, envMap: envTex });
  const meridian = new Mesh(new TorusGeometry(5.5, 0.18, 8, 48, Math.PI * 1.2), brass); meridian.position.copy(globe.position); meridian.rotation.set(0, Math.PI / 2, -0.4 + Math.PI * 0.4); G.add(meridian);
  const stem = new Mesh(new CylinderGeometry(0.4, 0.6, 4.5, 12), brass); stem.position.set(glAt[0], DESK + 2.8, glAt[1]); G.add(stem);
  const foot = new Mesh(new CylinderGeometry(3, 3.4, 0.6, 32), new MeshStandardMaterial({ color: 0x5A3A22, roughness: 0.5 })); foot.position.set(glAt[0], DESK + 0.3, glAt[1]); G.add(foot);
  // A POTTED CACTUS, and DICE.
  const potAt = spot(60, 4, 11, 32) || [28, -120];
  const pot = new Mesh(new CylinderGeometry(3, 2.3, 4.5, 32), new MeshStandardMaterial({ color: 0xC8683E, roughness: 0.8 })); pot.position.set(potAt[0], DESK + 2.25, potAt[1]); pot.castShadow = true; G.add(pot);
  const cactusMat = new MeshStandardMaterial({ color: 0x4E9A4E, roughness: 0.7 });
  const cac = new Mesh(capsule(1.5, 5), cactusMat); cac.position.set(potAt[0], DESK + 7, potAt[1]); cac.castShadow = true; G.add(cac);
  for (const s of [-1, 1]) { const arm = new Mesh(capsule(0.7, 2.4), cactusMat); arm.position.set(potAt[0] + s * 1.9, DESK + 7.5 + s * 0.6, potAt[1]); G.add(arm); }
  for (let i = 0; i < 3; i++) {
    const s = spot(20, 2, 2); if (!s) continue;
    const die = new Mesh(new RoundedBoxGeometry(2, 2, 2, 3, 0.3), new MeshStandardMaterial({ map: dieTex(), roughness: 0.3 }));
    die.position.set(s[0], DESK + 1, s[1]); die.rotation.set(0, r() * 6.3, 0); die.castShadow = true; G.add(die);
  }
  // A DESK LAMP, pooling warm light on the desk.
  const lampAt = spot(80, 8, 26, 38) || [30, -50];
  const lampMat = new MeshStandardMaterial({ color: 0x2E5F8A, roughness: 0.35, metalness: 0.3 });
  const lb = new Mesh(new CylinderGeometry(3.4, 3.8, 0.8, 32), lampMat); lb.position.set(lampAt[0], DESK + 0.4, lampAt[1]); G.add(lb);
  const arm1 = new Mesh(new CylinderGeometry(0.28, 0.28, 12, 10), lampMat); arm1.position.set(lampAt[0], DESK + 6.4, lampAt[1]); arm1.rotation.z = 0.35; G.add(arm1);
  const arm2 = new Mesh(new CylinderGeometry(0.25, 0.25, 10, 10), lampMat); arm2.position.set(lampAt[0] - 5.2, DESK + 14.5, lampAt[1]); arm2.rotation.z = -1.1; G.add(arm2);
  const shade = new Mesh(new ConeGeometry(2.8, 4, 32, 1, true), new MeshStandardMaterial({ color: 0x2E5F8A, roughness: 0.35, side: DoubleSide })); shade.position.set(lampAt[0] - 9.5, DESK + 15.5, lampAt[1]); shade.rotation.z = 0.5; G.add(shade);
  const bulb = new Mesh(new SphereGeometry(1, 16, 12), new MeshBasicMaterial({ color: 0xFFF1C8 })); bulb.position.set(lampAt[0] - 10.2, DESK + 14.2, lampAt[1]); G.add(bulb);
  const pool = new Mesh(new CircleGeometry(9, 40), glowMat(0xFFD89A, 0.35, dot)); pool.rotation.x = -Math.PI / 2; pool.position.set(lampAt[0] - 13, DESK + 0.03, lampAt[1]); G.add(pool);
  const chrome = new MeshStandardMaterial({ color: 0xE8ECF0, metalness: 1, roughness: 0.08, envMap: envTex, envMapIntensity: 1.2 });
  // A NEWTON'S CRADLE, clicking back and forth.
  const ncAt = along(5, 7);
  const cradle = [];
  if (ncAt) {
    const nc = new Group(), black = new MeshStandardMaterial({ color: 0x1C1C20, roughness: 0.3 });
    const base = new Mesh(new BoxGeometry(7, 0.5, 4.4), black); base.position.y = 0.25; nc.add(base);
    for (const sz of [-1.9, 1.9]) {
      for (const sx of [-3.1, 3.1]) { const post = new Mesh(new CylinderGeometry(0.12, 0.12, 5.6, 10), chrome); post.position.set(sx, 3.3, sz); nc.add(post); }
      const bar = new Mesh(new CylinderGeometry(0.12, 0.12, 6.2, 10), chrome); bar.rotation.z = Math.PI / 2; bar.position.set(0, 6.1, sz); nc.add(bar);
    }
    const strM = new MeshBasicMaterial({ color: 0x9A9A9A });
    for (let k = 0; k < 5; k++) {
      const piv = new Group(); piv.position.set(-2 + k, 6.1, 0);
      const ball = new Mesh(new SphereGeometry(0.5, 24, 16), chrome); ball.position.y = -4.1; ball.castShadow = true; piv.add(ball);
      for (const sz of [-1.9, 1.9]) { const len = Math.hypot(4.1, 1.9), st = new Mesh(new CylinderGeometry(0.02, 0.02, len, 4), strM); st.position.set(0, -2.05, sz / 2); st.rotation.x = Math.atan2(sz, 4.1) * -1; piv.add(st); }
      nc.add(piv); cradle.push(piv);
    }
    nc.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    nc.position.set(ncAt[0], DESK, ncAt[1]); nc.rotation.y = r() * 6.3; G.add(nc);
  }
  // A DESK FAN, blades spinning, its head turning to and fro.
  const fanAt = along(7, 13);
  let fanHead = null, fanBlades = null;
  if (fanAt) {
    const fan = new Group(), cream = new MeshStandardMaterial({ color: 0xF1E8D6, roughness: 0.4 });
    const fb = new Mesh(new CylinderGeometry(2.6, 3, 0.8, 32), cream); fb.position.y = 0.4; fan.add(fb);
    const st = new Mesh(new CylinderGeometry(0.35, 0.45, 6, 12), cream); st.position.y = 3.6; fan.add(st);
    fanHead = new Group(); fanHead.position.y = 7.2; fan.add(fanHead);
    const motor = new Mesh(new SphereGeometry(1.3, 20, 14), cream); motor.scale.set(1, 1, 1.4); motor.position.z = -1; fanHead.add(motor);
    for (const zz of [0.3, 1.1]) { const ring = new Mesh(new TorusGeometry(3.3, 0.07, 6, 48), chrome); ring.position.z = zz; fanHead.add(ring); }
    for (let k = 0; k < 16; k++) { const a2 = (k / 16) * Math.PI * 2, wire = new Mesh(new CylinderGeometry(0.035, 0.035, 3.3, 4), chrome); wire.position.set(Math.cos(a2) * 1.65, Math.sin(a2) * 1.65, 1.15); wire.rotation.z = a2 - Math.PI / 2; fanHead.add(wire); }
    fanBlades = new Group(); fanBlades.position.z = 0.7; fanHead.add(fanBlades);
    const bladeM = new MeshStandardMaterial({ color: 0x7FB8D8, roughness: 0.3, transparent: true, opacity: 0.85, side: DoubleSide });
    for (let k = 0; k < 3; k++) { const bl = new Mesh(new CircleGeometry(1.4, 16, 0, 1.1), bladeM); bl.rotation.z = (k / 3) * Math.PI * 2; bl.position.z = 0.02 * k; fanBlades.add(bl); }
    const hub = new Mesh(new SphereGeometry(0.4, 12, 10), chrome); hub.position.z = 0.9; fanHead.add(hub);
    fan.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    fan.position.set(fanAt[0], DESK, fanAt[1]); fan.rotation.y = fanAt[0] < 3 ? Math.PI / 2 : -Math.PI / 2; G.add(fan);
  }
  // A GOLDFISH BOWL: a fish going round, bubbles rising.
  const fbAt = along(5, 8);
  let fish = null, fishTail = null;
  const bubbles = [];
  if (fbAt) {
    const bowl = new Group();
    const glass = new Mesh(new SphereGeometry(3.6, 40, 28), new MeshStandardMaterial({ color: 0xDFF4FF, transparent: true, opacity: 0.18, roughness: 0.02, envMap: envTex, envMapIntensity: 1.5, depthWrite: false }));
    glass.position.y = 3.4; bowl.add(glass);
    const water = new Mesh(new SphereGeometry(3.45, 36, 24, 0, Math.PI * 2, Math.PI * 0.28, Math.PI * 0.72), new MeshStandardMaterial({ color: 0x7FC8E8, transparent: true, opacity: 0.35, roughness: 0.1, depthWrite: false }));
    water.position.y = 3.4; bowl.add(water);
    const gravel = new Mesh(new CylinderGeometry(2.4, 1.6, 0.8, 24), new MeshStandardMaterial({ color: 0xC89A6A, roughness: 1 })); gravel.position.y = 0.6; bowl.add(gravel);
    const weed = new Mesh(new ConeGeometry(0.5, 3.4, 6), new MeshStandardMaterial({ color: 0x3E9A4E, roughness: 0.8 })); weed.position.set(0.9, 2.5, 0.4); bowl.add(weed);
    fish = new Group();
    const orange = new MeshStandardMaterial({ color: 0xFF8A1E, roughness: 0.35 });
    const body = new Mesh(new SphereGeometry(0.55, 18, 12), orange); body.scale.set(1.6, 1, 0.7); fish.add(body);
    fishTail = new Mesh(new ConeGeometry(0.45, 0.8, 4), orange); fishTail.rotation.z = Math.PI / 2; fishTail.position.x = -1.1; fish.add(fishTail);
    const eye = new Mesh(new SphereGeometry(0.09, 8, 6), new MeshBasicMaterial({ color: 0x111111 })); eye.position.set(0.6, 0.15, 0.3); fish.add(eye);
    bowl.add(fish);
    for (let k = 0; k < 7; k++) { const bb = new Mesh(new SphereGeometry(0.12, 8, 6), new MeshStandardMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.6, roughness: 0 })); bowl.add(bb); bubbles.push({ bb, ph: k / 7 }); }
    bowl.position.set(fbAt[0], DESK, fbAt[1]); G.add(bowl);
  }
  // PAPER PLANES gliding in loops over the desk.
  const planeGeo = new BufferGeometry();
  planeGeo.setAttribute('position', new Float32BufferAttribute([0, 0, 1.6, -1.1, 0.05, -1.2, 0, 0, -1.2, 0, 0, 1.6, 1.1, 0.05, -1.2, 0, 0, -1.2, 0, 0, 1.6, 0, -0.35, -1.2, 0, 0, -1.2], 3));
  planeGeo.computeVertexNormals();
  const paperM = new MeshStandardMaterial({ color: 0xFBF8F0, roughness: 0.8, side: DoubleSide });
  const planes = [];
  for (let k = 0; k < 3; k++) {
    const pl = new Mesh(planeGeo, paperM); pl.scale.setScalar(1.3); pl.castShadow = true; G.add(pl);
    const side = k % 2 ? 1 : -1;
    planes.push({ pl, cx: 3 + side * (4 + r() * 5), cz: -12 - k * 40 - r() * 10, rx: 9 + r() * 5, rz: 10 + r() * 8, y: Math.min(DESK + 5 + r() * 2, minTop - 3), sp: 0.22 + r() * 0.1, ph: r() * 6.3 });
  }
  // A WIND-UP CAR running round in circles, its key turning.
  const wuAt = along(8, 3);
  let wind = null, windKey = null;
  if (wuAt) {
    wind = new Group();
    const tinRed = new MeshStandardMaterial({ color: 0xD8352E, metalness: 0.5, roughness: 0.35, envMap: envTex });
    const body = new Mesh(new RoundedBoxGeometry(3.4, 1.2, 1.8, 2, 0.35), tinRed); body.position.y = 1; wind.add(body);
    const cab = new Mesh(new RoundedBoxGeometry(1.6, 0.9, 1.6, 2, 0.3), new MeshStandardMaterial({ color: 0xBFE3FF, metalness: 0.3, roughness: 0.2 })); cab.position.set(-0.2, 1.95, 0); wind.add(cab);
    for (const sx of [-1.1, 1.1]) for (const sz of [-0.95, 0.95]) { const wh = new Mesh(new CylinderGeometry(0.45, 0.45, 0.3, 14), new MeshStandardMaterial({ color: 0x222222 })); wh.rotation.x = Math.PI / 2; wh.position.set(sx, 0.45, sz); wind.add(wh); }
    windKey = new Group(); windKey.position.set(-1.9, 1.2, 0);
    const shaft = new Mesh(new CylinderGeometry(0.1, 0.1, 0.8, 8), chrome); shaft.rotation.z = Math.PI / 2; windKey.add(shaft);
    for (const s2 of [-1, 1]) { const lobe = new Mesh(new TorusGeometry(0.35, 0.08, 6, 16), chrome); lobe.position.set(-0.45, s2 * 0.38, 0); lobe.rotation.y = Math.PI / 2; windKey.add(lobe); }
    wind.add(windKey);
    wind.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    G.add(wind);
  }
  // AN ALARM CLOCK, its second hand ticking.
  const ckAt = along(4, 8);
  let secHand = null;
  if (ckAt) {
    const ck = new Group(), bodyM = new MeshStandardMaterial({ color: 0x2E6FB0, roughness: 0.3, metalness: 0.3 });
    const face = new Mesh(new CylinderGeometry(2.6, 2.6, 1.2, 40), [bodyM, new MeshStandardMaterial({ map: canvasTex(128, 128, (g) => {
      g.fillStyle = '#FFFDF6'; g.beginPath(); g.arc(64, 64, 64, 0, 7); g.fill(); g.fillStyle = '#222';
      for (let i = 0; i < 12; i++) { const a2 = (i / 12) * Math.PI * 2; g.fillRect(64 + Math.sin(a2) * 52 - 2, 64 - Math.cos(a2) * 52 - 5, 4, 10); }
    }), roughness: 0.4 }), bodyM]);
    face.rotation.x = Math.PI / 2; face.position.y = 3.2; ck.add(face);
    for (const s2 of [-1, 1]) { const bell = new Mesh(new SphereGeometry(0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), chrome); bell.position.set(s2 * 1.5, 5.4, 0); bell.rotation.z = -s2 * 0.4; ck.add(bell); const leg = new Mesh(new CylinderGeometry(0.15, 0.2, 1, 8), chrome); leg.position.set(s2 * 1.6, 0.5, 0); ck.add(leg); }
    const hand = (len, w2, col2) => { const h2 = new Mesh(new BoxGeometry(w2, len, 0.06), new MeshBasicMaterial({ color: col2 })); h2.geometry.translate(0, len / 2, 0); h2.position.set(0, 3.2, 0.64); ck.add(h2); return h2; };
    hand(1.3, 0.16, 0x222222).rotation.z = -1.2; hand(1.9, 0.12, 0x222222).rotation.z = 0.6; secHand = hand(2.1, 0.05, 0xD8352E);
    ck.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    ck.position.set(ckAt[0], DESK, ckAt[1]); ck.rotation.y = (ckAt[0] < 3 ? 1 : -1) * 0.6; G.add(ck);
  }
  // DUST in the sunlight.
  const NP = 300, pp = new Float32Array(NP * 3);
  for (let i = 0; i < NP; i++) { pp[i * 3] = -25 + r() * 56; pp[i * 3 + 1] = DESK + r() * 20; pp[i * 3 + 2] = mid + (r() - 0.5) * (26 - far); }
  const dustGeo = new BufferGeometry(); dustGeo.setAttribute('position', new Float32BufferAttribute(pp, 3));
  G.add(new Points(dustGeo, new PointsMaterial({ color: 0xFFF4DA, size: 0.1, transparent: true, opacity: 0.8, depthWrite: false })));
  // The path: rulers end to end, a book to start on, erasers here and there.
  w.restyle = () => {
    const M = studyMaterials();
    colliders.forEach((c, i) => {
      if (c.holo || c.obstacle) return;
      if (c.ferry) { c.mesh.material = [M.ferrySide, M.ferrySide, M.ferryTop, M.under, M.ferrySide, M.ferrySide]; return; }
      const eraser = i % 5 === 3, book = i === 0;
      const top = book ? M.bookTop : eraser ? M.eraserTop : M.top, side = eraser ? M.eraserSide : M.side;
      c.mesh.material = [side, side, top, M.under, side, side];
      setTopUV(c.mesh, book);
      if (!book && !eraser) {                             // the ruler's marks run along the piece
        const gg = c.mesh.geometry, uv = gg.attributes.uv, P = gg.attributes.position, tg = topGroup(gg);
        const along = c.half.z >= c.half.x;
        // (turned a quarter turn when it runs along the way, never mirrored, so its numbers read)
        for (let k = tg.start; k < tg.start + tg.count; k++) uv.setXY(k, (along ? -P.getZ(k) : P.getX(k)) / 10 + 0.5, (along ? -P.getX(k) / (2 * c.half.x) : -P.getZ(k) / (2 * c.half.z)) + 0.5);
        uv.needsUpdate = true;
      }
    });
  };
  const live = !REDUCED;
  let t = 0;
  w.tick = (dt) => {
    if (!live) return;
    t += dt;
    if (cradle.length) {                                  // the end balls swing out and back in turn; the middle three stay put
      const sw = Math.sin(t * 5.2), A = 0.62;
      cradle[0].rotation.z = sw > 0 ? -A * sw : 0; cradle[4].rotation.z = sw < 0 ? -A * sw : 0;
    }
    if (fanHead) { fanHead.rotation.y = Math.sin(t * 0.35) * 0.7; fanBlades.rotation.z = -t * 18; }
    globe.rotation.y = t * 0.25;
    if (fish) { const a2 = t * 0.7; fish.position.set(Math.cos(a2) * 1.6, 3 + Math.sin(t * 1.3) * 0.4, Math.sin(a2) * 1.6); fish.rotation.y = -a2 - Math.PI / 2; fishTail.rotation.y = Math.sin(t * 9) * 0.5; }
    for (const B of bubbles) { const k = (t * 0.3 + B.ph) % 1; B.bb.position.set(0.5 + Math.sin(t * 3 + B.ph * 9) * 0.2, 1 + k * 4.6, -0.3); B.bb.visible = k < 0.95; }
    for (const P of planes) {                             // a long lazy loop, banking into its turns
      const a2 = t * P.sp + P.ph, x = P.cx + Math.sin(a2) * P.rx, z = P.cz + Math.sin(a2 * 2) * P.rz * 0.5, nx = P.cx + Math.sin(a2 + 0.05) * P.rx, nz = P.cz + Math.sin((a2 + 0.05) * 2) * P.rz * 0.5;
      P.pl.position.set(x, P.y + Math.sin(a2 * 3) * 1.2, z); P.pl.rotation.set(0, Math.atan2(nx - x, nz - z), -Math.cos(a2) * 0.5, 'YXZ');
    }
    if (wind) { const a2 = t * 0.45; wind.position.set(wuAt[0] + Math.cos(a2) * 6, DESK, wuAt[1] + Math.sin(a2) * 6); wind.rotation.y = -a2; windKey.rotation.x = t * 4; }
    if (secHand) secHand.rotation.z = -Math.floor(t) * (Math.PI / 30);
    steam.forEach((sp, i) => { const k = ((t * 0.35 + i / 5) % 1); sp.position.y = DESK + 7 + k * 7; sp.position.x = mugAt[0] + Math.sin(t + i) * 0.6 * k; sp.material.opacity = 0.28 * Math.sin(Math.PI * k); sp.scale.setScalar(2 + k * 3); });
    const a = dustGeo.attributes.position;
    for (let i = 0; i < NP; i++) { a.array[i * 3 + 1] += Math.sin(t * 0.3 + i) * dt * 0.08; a.array[i * 3] += Math.cos(t * 0.2 + i * 1.3) * dt * 0.06; }
    a.needsUpdate = true;
  };
});

// ---- 9. The playroom: a nursery floor at a marble's scale, crowded with toys ----
/* THE TOY ROOM, MADE RICH (owner, 2026-09-27: "I like the idea of the toy
   bricks, but the environment needs to be much richer with toys and other
   objects"). A candy marble in a sunny nursery, at the marble's scale: the
   path is wooden alphabet blocks and bright plastic bricks, held up on towers
   of bricks; far below, a play rug printed with roads on a wooden floor, and
   toys everywhere: a teddy bear as tall as a house, a wooden train running
   round its track, stacking rings, a rubber duck, a spinning top that spins,
   toy cars on the rug's roads, a beach ball, a xylophone, a toy box spilling,
   alphabet blocks in towers, bunting overhead, the room bright beyond. */
const TOY_COLS = [0xE8403A, 0xF7B32B, 0x2E86DE, 0x27AE60, 0x9B59B6, 0xFF7F50, 0x16A5A5, 0xF368E0];
function letterBlockTex(ch, col) {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#F4E3C3'; g.fillRect(0, 0, 128, 128);                  // pale beech
    const r = seeded(ch.charCodeAt(0));
    for (let i = 0; i < 30; i++) { g.strokeStyle = `rgba(190,150,100,${0.1 + r() * 0.15})`; g.beginPath(); const y = r() * 128; g.moveTo(0, y); g.lineTo(128, y + (r() - 0.5) * 8); g.stroke(); }
    g.strokeStyle = col; g.lineWidth = 7; g.strokeRect(9, 9, 110, 110);
    g.fillStyle = col; g.font = 'bold 76px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 64, 70);
  });
}
function furTex(base) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    const r = seeded(9);
    for (let i = 0; i < 9000; i++) { const v = r(); g.strokeStyle = v < 0.5 ? 'rgba(70,40,20,0.25)' : 'rgba(250,220,180,0.22)'; g.lineWidth = 1; const x = r() * 256, y = r() * 256; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 5, y + 3 + r() * 5); g.stroke(); }
  }, true);
}
const letterStripTex = () => canvasTex(1024, 128, (g) => {
  'MARBLEFUN'.slice(0, 8).split('').forEach((ch, i) => {
    const x = i * 128, colr = '#' + TOY_COLS[i % TOY_COLS.length].toString(16).padStart(6, '0');
    g.fillStyle = '#F4E3C3'; g.fillRect(x, 0, 128, 128);
    g.strokeStyle = colr; g.lineWidth = 7; g.strokeRect(x + 9, 9, 110, 110);
    g.fillStyle = colr; g.font = 'bold 76px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, x + 64, 70);
  });
}, true);
let playMats = null;
function playMaterials() {
  if (playMats) return playMats;
  playMats = {
    bricks: TOY_COLS.map((c) => new MeshPhysicalMaterial({ color: c, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.2 })),
    letters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((ch, i) => new MeshStandardMaterial({ map: letterBlockTex(ch, '#' + TOY_COLS[i % TOY_COLS.length].toString(16).padStart(6, '0')), roughness: 0.7 })),
    beech: new MeshStandardMaterial({ color: 0xE9D2A8, roughness: 0.7 }),
    strip: new MeshStandardMaterial({ map: letterStripTex(), roughness: 0.7 }),
    under: new MeshStandardMaterial({ color: 0xB89A70, roughness: 0.9 }),
    ferryTop: new MeshPhysicalMaterial({ color: 0xFFFFFF, roughness: 0.25, clearcoat: 0.6 }),
    ferrySide: new MeshPhysicalMaterial({ color: 0xDADDE8, roughness: 0.3, clearcoat: 0.4 }),
  };
  return playMats;
}
WORLDS_ADD('playroom', (w) => {
  scene.background = coverTex(512, (g) => {                 // the nursery beyond, softly out of focus
    const lg = g.createLinearGradient(0, 0, 0, 512);
    lg.addColorStop(0, '#CFE6F7'); lg.addColorStop(0.6, '#EAF4FB'); lg.addColorStop(1, '#F6EEDD');
    g.fillStyle = lg; g.fillRect(0, 0, 512, 512);
    g.filter = 'blur(10px)';
    const r = seeded(4);
    for (let i = 0; i < 28; i++) { g.fillStyle = ['rgba(255,214,90,0.8)', 'rgba(255,160,180,0.7)', 'rgba(150,200,255,0.8)'][i % 3]; const x = r() * 512, y = r() * 300; g.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * 6.28, rad = k % 2 ? 6 : 14; g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } g.fill(); }   // stars on the wallpaper
    g.fillStyle = '#FFFBEA'; g.fillRect(170, 30, 180, 220); g.fillStyle = 'rgba(160,210,250,0.9)'; g.fillRect(182, 42, 72, 90); g.fillRect(266, 42, 72, 90);   // the window
    g.fillStyle = '#B5835A'; g.fillRect(380, 90, 130, 230);                                   // a shelf of toys
    for (let row = 0; row < 3; row++) for (let i = 0; i < 5; i++) { g.fillStyle = ['#E8403A', '#F7B32B', '#2E86DE', '#27AE60', '#9B59B6'][(i + row) % 5]; g.beginPath(); g.arc(398 + i * 24, 140 + row * 70, 9 + (i % 2) * 4, 0, 7); g.fill(); }
    g.filter = 'none';
  });
  scene.fog.color.setHex(0xF1F4F2); scene.fog.near = 80; scene.fog.far = 280;
  hemi.color.setHex(0xFFFFFF); hemi.groundColor.setHex(0xC9A87C); hemi.intensity = 1.25;
  sun.color.setHex(0xFFF2DC); sun.intensity = 3.0;
  w.marble = 'candy'; w.rings = [0x2E86DE, 0xE8403A];
  const G = w.group, r = seeded(73), end = courseEnd(), minTop = level ? level.minTop : 0, FLOOR = Math.min(-10, minTop - 9);
  const far = Math.min(-170, end - 100), mid = (26 + far) / 2;
  const m = new Matrix4(), q = new Quaternion(), pos = new Vector3(), sc = new Vector3(), col = new Color(), e = new Euler();
  const clear = (x, z, rad, h) => { const t = courseTopNear(x, z, rad + 0.8); return t === null || FLOOR + h < t - 1.5; };
  const spot = (tries, rad, h, xr = 40) => { for (let i = 0; i < tries; i++) { const x = 3 + (r() - 0.5) * 2 * xr, z = mid + (r() - 0.5) * (26 - far); if (clear(x, z, rad, h)) return [x, z]; } return null; };
  // Set pieces take turns along the way, a side each, near enough to see.
  let turn = 0;
  const along = (rad, h) => {
    const k = turn++, side = k % 2 ? 1 : -1, z0 = 4 - k * 26;
    for (let i = 0; i < 40; i++) { const x = 3 + side * (rad + 7 + r() * 12), z = z0 - r() * 14; if (clear(x, z, rad, h)) return [x, z]; }
    return spot(60, rad, h, 44);
  };
  // THE FLOOR: honey boards, and a play rug printed with roads.
  const boards = canvasTex(512, 512, (g) => {
    const rr = seeded(2);
    for (let p = 0; p < 8; p++) {
      const t = 205 + rr() * 25; g.fillStyle = `rgb(${t},${t * 0.74},${t * 0.48})`; g.fillRect(0, p * 64, 512, 64);
      for (let i = 0; i < 16; i++) { g.strokeStyle = `rgba(150,100,55,${0.1 + rr() * 0.15})`; g.beginPath(); const y = p * 64 + rr() * 64; g.moveTo(0, y); g.lineTo(512, y + (rr() - 0.5) * 6); g.stroke(); }
      g.fillStyle = 'rgba(90,60,30,0.5)'; g.fillRect(0, p * 64, 512, 2); const cut = rr() * 512; g.fillRect(cut, p * 64, 2, 64);
    }
  }, true);
  const floor = new Mesh(new PlaneGeometry(320, 320), worldMapped(new MeshStandardMaterial({ map: boards, roughness: 0.45, envMap: envTex, envMapIntensity: 0.3 }), 1 / 24, 'play-floor'));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, FLOOR, mid); floor.receiveShadow = true; G.add(floor);
  const rugT = canvasTex(1024, 1024, (g) => {
    g.fillStyle = '#7CC36A'; g.fillRect(0, 0, 1024, 1024);                                    // grass
    g.fillStyle = '#6FB35E'; for (let i = 0; i < 400; i++) g.fillRect(Math.random() * 1024, Math.random() * 1024, 6, 6);
    g.strokeStyle = '#555A60'; g.lineWidth = 90; g.lineJoin = 'round';                        // the roads
    g.beginPath(); g.moveTo(80, 200); g.lineTo(940, 200); g.lineTo(940, 820); g.lineTo(80, 820); g.closePath(); g.moveTo(510, 200); g.lineTo(510, 820); g.stroke();
    g.strokeStyle = '#F4F4F4'; g.lineWidth = 6; g.setLineDash([30, 26]);
    g.beginPath(); g.moveTo(80, 200); g.lineTo(940, 200); g.lineTo(940, 820); g.lineTo(80, 820); g.closePath(); g.moveTo(510, 200); g.lineTo(510, 820); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#5DADE2'; g.beginPath(); g.ellipse(270, 510, 120, 80, 0, 0, 7); g.fill();  // a pond
    for (const [x, y, c] of [[700, 420, '#E8403A'], [760, 420, '#F7B32B'], [700, 600, '#2E86DE'], [300, 330, '#F368E0'], [230, 690, '#FF7F50']]) { g.fillStyle = c; g.fillRect(x - 26, y - 26, 52, 52); g.fillStyle = '#8B4513'; g.beginPath(); g.moveTo(x - 32, y - 26); g.lineTo(x, y - 56); g.lineTo(x + 32, y - 26); g.fill(); }   // little houses
    g.strokeStyle = '#D6453D'; g.lineWidth = 26; g.strokeRect(13, 13, 998, 998);             // the border
  });
  const rug = new Mesh(new PlaneGeometry(60, 60), new MeshStandardMaterial({ map: rugT, roughness: 0.95 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(3, FLOOR + 0.03, mid * 0.6); rug.receiveShadow = true; G.add(rug);
  // TOWERS OF BRICKS hold the path up: plastic bricks, studs on top, stacked and turned.
  const studGeo = new CylinderGeometry(0.24, 0.24, 0.18, 14);
  const BR = playMaterials().bricks, brickTowers = [], studs = [];
  for (const c of colliders) {
    if (c.ferry || c.obstacle) continue;
    let y = FLOOR, k = 0;
    const top = c.pos.y - c.half.y;
    while (y < top - 0.05) {
      const h = Math.min(top - y, 1.2), bw = Math.max(1.6, c.half.x * 2 * (0.6 + r() * 0.35)), bd = Math.max(1.6, c.half.z * 2 * (0.5 + r() * 0.4));
      const b = new Mesh(new BoxGeometry(bw, h, bd), BR[(k + Math.abs(Math.floor(c.pos.z * 3))) % BR.length]);
      b.position.set(c.pos.x + (r() - 0.5) * 0.6, y + h / 2, c.pos.z + (r() - 0.5) * 0.6); b.rotation.y = (r() - 0.5) * 0.3; b.castShadow = true; b.receiveShadow = true;
      G.add(b); y += h; k++;
    }
  }
  // Toys stand where they are clear of the path.
  // ALPHABET BLOCKS in towers and heaps.
  const PM = playMaterials();
  for (let i = 0; i < 14; i++) {
    const s = spot(30, 3, 2.2 * 5, 42); if (!s) continue;
    const n = 1 + Math.floor(r() * 5);
    for (let k = 0; k < n; k++) {
      if (!clear(s[0], s[1], 3, 2.2 * (k + 1))) break;
      const mats = Array.from({ length: 6 }, () => PM.letters[Math.floor(r() * 26)]);
      const b = new Mesh(new RoundedBoxGeometry(2.2, 2.2, 2.2, 2, 0.14), mats);
      b.position.set(s[0] + (r() - 0.5) * 0.4, FLOOR + 1.1 + k * 2.2, s[1] + (r() - 0.5) * 0.4); b.rotation.y = r() * 1.5; b.castShadow = true; b.receiveShadow = true; G.add(b);
    }
  }
  // THE TEDDY BEAR, sitting, as tall as a house.
  const bearAt = along(9, 16) || [-24, -10];
  const fur = new MeshStandardMaterial({ map: furTex('#B07A45'), roughness: 1 }), pale = new MeshStandardMaterial({ map: furTex('#E2B98A'), roughness: 1 });
  const bear = new Group();
  const part = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const mm = new Mesh(geo, mat); mm.position.set(x, y, z); mm.scale.set(sx, sy, sz); mm.castShadow = true; bear.add(mm); return mm; };
  const ball8 = new SphereGeometry(1, 32, 20);
  part(ball8, fur, 0, 4.2, 0, 4, 4.6, 3.6);                  // body
  part(ball8, pale, 0, 4, 2.4, 2.6, 3, 1.6);                 // tummy
  part(ball8, fur, 0, 10, 0.3, 3.3, 3, 3);                   // head
  part(ball8, pale, 0, 9.2, 3, 1.4, 1.1, 1);                 // muzzle
  part(ball8, new MeshStandardMaterial({ color: 0x2A1A12, roughness: 0.3 }), 0, 9.7, 3.9, 0.45, 0.35, 0.3);   // nose
  for (const sx of [-1, 1]) {
    part(ball8, fur, sx * 2.4, 12.6, 0, 1.2, 1.2, 0.7); part(ball8, pale, sx * 2.4, 12.6, 0.35, 0.7, 0.7, 0.4);   // ears
    part(ball8, new MeshStandardMaterial({ color: 0x14100E, roughness: 0.1, metalness: 0.2 }), sx * 1.2, 10.6, 2.7, 0.38, 0.38, 0.3);   // button eyes
    const arm = part(ball8, fur, sx * 4, 5.5, 1, 1.3, 3, 1.3); arm.rotation.z = sx * 0.5;
    part(ball8, fur, sx * 2.2, 1.4, 2.6, 1.5, 1.5, 3); part(ball8, pale, sx * 2.2, 1.4, 5.4, 1.2, 1.2, 0.4);        // legs and pads
  }
  const bow = new Mesh(new TorusGeometry(1, 0.35, 10, 20), new MeshStandardMaterial({ color: 0xE8403A, roughness: 0.5 }));
  bow.position.set(0, 7.6, 2.8); bow.scale.set(1.3, 0.8, 1); bear.add(bow);
  bear.position.set(bearAt[0], FLOOR, bearAt[1]); bear.rotation.y = bearAt[0] < 3 ? 0.7 : -0.7; G.add(bear);
  // THE TRAIN: a wooden engine and trucks going round a loop of wooden track.
  const trackAt = along(12, 3) || [30, -60], TR = 11;
  const wood2 = new MeshStandardMaterial({ color: 0xDDB47C, roughness: 0.7 });
  const track = new Mesh(new TorusGeometry(TR, 0.9, 6, 80), wood2); track.rotation.x = Math.PI / 2; track.scale.set(1, 1, 0.35); track.position.set(trackAt[0], FLOOR + 0.3, trackAt[1]); track.receiveShadow = true; G.add(track);
  const groove = new Mesh(new TorusGeometry(TR, 0.28, 4, 80), new MeshStandardMaterial({ color: 0xB8905A, roughness: 0.8 })); groove.rotation.x = Math.PI / 2; groove.position.set(trackAt[0], FLOOR + 0.62, trackAt[1]); G.add(groove);
  const train = [];
  const truck = (colr, engine) => {
    const t = new Group();
    const body = new Mesh(new RoundedBoxGeometry(engine ? 4.2 : 3.4, engine ? 1.8 : 1.3, 2, 2, 0.18), new MeshPhysicalMaterial({ color: colr, roughness: 0.35, clearcoat: 0.5 }));
    body.position.y = 1.5; t.add(body);
    if (engine) {
      const cab = new Mesh(new RoundedBoxGeometry(1.6, 1.6, 2, 2, 0.15), body.material); cab.position.set(-1.2, 3, 0); t.add(cab);
      const funnel = new Mesh(new CylinderGeometry(0.35, 0.45, 1.4, 14), new MeshStandardMaterial({ color: 0x222222, roughness: 0.4 })); funnel.position.set(1.3, 3, 0); t.add(funnel);
    } else {
      for (let k = 0; k < 3; k++) { const cargo = new Mesh(new RoundedBoxGeometry(0.9, 0.9, 0.9, 2, 0.1), BR[(k + train.length) % BR.length]); cargo.position.set(-1 + k, 2.6, 0); t.add(cargo); }
    }
    for (const sx of [-1.2, 1.2]) for (const sz of [-1.05, 1.05]) { const wh = new Mesh(new CylinderGeometry(0.55, 0.55, 0.3, 16), new MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.5 })); wh.rotation.x = Math.PI / 2; wh.position.set(sx, 0.6, sz); t.add(wh); }
    t.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    G.add(t); train.push(t);
  };
  truck(0xE8403A, true); truck(0xF7B32B); truck(0x2E86DE); truck(0x27AE60);
  // STACKING RINGS on their post.
  const ringsAt = along(5, 12);
  if (ringsAt) {
    const post = new Mesh(new CylinderGeometry(0.5, 0.5, 11, 16), PM.beech); post.position.set(ringsAt[0], FLOOR + 5.5, ringsAt[1]); G.add(post);
    for (let k = 0; k < 6; k++) { const rg = new Mesh(new TorusGeometry(3.4 - k * 0.45, 0.9 - k * 0.05, 16, 40), BR[k]); rg.rotation.x = Math.PI / 2; rg.position.set(ringsAt[0], FLOOR + 0.9 + k * 1.65, ringsAt[1]); rg.castShadow = true; G.add(rg); }
    const knob = new Mesh(new SphereGeometry(1, 20, 14), BR[6]); knob.position.set(ringsAt[0], FLOOR + 11.4, ringsAt[1]); G.add(knob);
  }
  // A RUBBER DUCK.
  const duckAt = along(4, 7);
  if (duckAt) {
    const duck = new Group(), yel = new MeshPhysicalMaterial({ color: 0xFFD21F, roughness: 0.3, clearcoat: 0.5 });
    const db = new Mesh(new SphereGeometry(3, 28, 20), yel); db.scale.set(1.25, 0.85, 1); db.position.y = 2.6; duck.add(db);
    const dh = new Mesh(new SphereGeometry(1.8, 24, 18), yel); dh.position.set(2.2, 5.4, 0); duck.add(dh);
    const beak = new Mesh(new SphereGeometry(0.9, 16, 12), new MeshPhysicalMaterial({ color: 0xFF7A1A, roughness: 0.35 })); beak.scale.set(1.3, 0.45, 0.9); beak.position.set(3.8, 5.1, 0); duck.add(beak);
    for (const sz of [-0.8, 0.8]) { const eye = new Mesh(new SphereGeometry(0.28, 12, 10), new MeshStandardMaterial({ color: 0x111111, roughness: 0.2 })); eye.position.set(3.05, 6, sz); duck.add(eye); }
    duck.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    duck.position.set(duckAt[0], FLOOR, duckAt[1]); duck.rotation.y = r() * 6.3; G.add(duck);
  }
  // A SPINNING TOP, spinning.
  const topAt = along(3, 6), tops = [];
  if (topAt) {
    const top = new Group();
    const stripes = canvasTex(256, 64, (g) => { const cs = ['#E8403A', '#F7B32B', '#2E86DE', '#27AE60', '#9B59B6', '#FF7F50', '#F368E0', '#16A5A5']; for (let i = 0; i < 16; i++) { g.fillStyle = cs[i % 8]; g.fillRect(i * 16, 0, 16, 64); } });
    const body = new Mesh(new LatheGeometry([[0.05, 0], [1.2, 1.2], [2.6, 2.1], [2.4, 2.6], [0.4, 3.2], [0.3, 4.6]].map(([a, b]) => new Vector2(a, b)), 40), new MeshPhysicalMaterial({ map: stripes, roughness: 0.3, clearcoat: 0.6 }));
    top.add(body); body.castShadow = true;
    top.position.set(topAt[0], FLOOR, topAt[1]); top.rotation.z = 0.08; G.add(top); tops.push(top);
  }
  // TOY CARS on the rug's roads, driving round.
  const cars = [];
  for (let i = 0; i < 4; i++) {
    const car = new Group(), colr = BR[(i * 3) % BR.length];
    const body = new Mesh(new RoundedBoxGeometry(3.6, 1.1, 1.8, 2, 0.3), colr); body.position.y = 0.9; car.add(body);
    const cabin = new Mesh(new RoundedBoxGeometry(1.8, 0.9, 1.6, 2, 0.3), new MeshPhysicalMaterial({ color: 0xBFE3FF, roughness: 0.1, transmission: 0.3 })); cabin.position.set(-0.2, 1.8, 0); car.add(cabin);
    for (const sx of [-1.1, 1.1]) for (const sz of [-0.95, 0.95]) { const wh = new Mesh(new CylinderGeometry(0.5, 0.5, 0.32, 16), new MeshStandardMaterial({ color: 0x222222, roughness: 0.6 })); wh.rotation.x = Math.PI / 2; wh.position.set(sx, 0.5, sz); car.add(wh); }
    car.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    G.add(car); cars.push({ car, u: i / 4 });
  }
  // A BEACH BALL, a TOY BOX spilling, a XYLOPHONE.
  const bbAt = along(5, 9);
  if (bbAt) {
    const bt = canvasTex(512, 256, (g) => { const cs = ['#E8403A', '#FFFFFF', '#2E86DE', '#FFFFFF', '#F7B32B', '#FFFFFF']; for (let i = 0; i < 6; i++) { g.fillStyle = cs[i]; g.fillRect(i * 85.4, 0, 86, 256); } g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 512, 22); g.fillRect(0, 234, 512, 22); });
    const bb = new Mesh(new SphereGeometry(4, 40, 28), new MeshPhysicalMaterial({ map: bt, roughness: 0.25, clearcoat: 0.8 })); bb.position.set(bbAt[0], FLOOR + 4, bbAt[1]); bb.rotation.set(0.4, 0.3, 0.2); bb.castShadow = true; G.add(bb);
  }
  const boxAt = along(8, 9);
  if (boxAt) {
    const chest = new Group(), wood = new MeshStandardMaterial({ color: 0x5B8FD1, roughness: 0.5 });
    const sides = [[0, 3, 3.5, 12, 6, 0.4], [0, 3, -3.5, 12, 6, 0.4], [6, 3, 0, 0.4, 6, 7], [-6, 3, 0, 0.4, 6, 7], [0, 0.2, 0, 12, 0.4, 7]];
    for (const [x, y, z, sx, sy, sz] of sides) { const p = new Mesh(new BoxGeometry(sx, sy, sz), wood); p.position.set(x, y, z); p.castShadow = true; chest.add(p); }
    const lid = new Mesh(new BoxGeometry(12, 0.4, 7), new MeshStandardMaterial({ color: 0xF7B32B, roughness: 0.5 })); lid.position.set(0, 7.2, -5.4); lid.rotation.x = -1.2; chest.add(lid);
    for (let k = 0; k < 7; k++) { const tb = new Mesh(new SphereGeometry(1 + r() * 0.8, 20, 14), BR[k % BR.length]); tb.position.set((r() - 0.5) * 9, 5.5 + r() * 1.5, (r() - 0.5) * 4); chest.add(tb); }
    chest.position.set(boxAt[0], FLOOR, boxAt[1]); chest.rotation.y = r() * 6.3; G.add(chest);
  }
  const xyAt = along(8, 3);
  if (xyAt) {
    const xy = new Group();
    for (let k = 0; k < 8; k++) { const bar = new Mesh(new RoundedBoxGeometry(1.2, 0.5, 6 - k * 0.45, 2, 0.12), BR[k % BR.length]); bar.position.set(-5 + k * 1.45, 1.4, 0); bar.castShadow = true; xy.add(bar); }
    for (const sz of [-2.3, 2.3]) { const rail = new Mesh(new BoxGeometry(12.5, 0.9, 0.6), PM.beech); rail.position.set(-0.2, 0.6, sz * 0.9); xy.add(rail); }
    xy.position.set(xyAt[0], FLOOR, xyAt[1]); xy.rotation.y = r() * 6.3; G.add(xy);
  }
  // LOOSE BRICKS on the floor, studs up.
  const nbk = 160, bricksIM = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshPhysicalMaterial({ color: 0xFFFFFF, roughness: 0.28, clearcoat: 0.6 }), nbk);
  const studsIM = new InstancedMesh(studGeo, new MeshPhysicalMaterial({ color: 0xFFFFFF, roughness: 0.28, clearcoat: 0.6 }), nbk * 8);
  let nb = 0, nst = 0;
  for (let i = 0; i < nbk; i++) {
    const x = 3 + (r() - 0.5) * 84, z = mid + (r() - 0.5) * (26 - far);
    if (!clear(x, z, 2, 1.4)) continue;
    const L = r() < 0.5 ? 2 : 4, yaw = r() * 6.3, cc = TOY_COLS[Math.floor(r() * TOY_COLS.length)];
    q.setFromEuler(e.set(0, yaw, 0)); m.compose(pos.set(x, FLOOR + 0.5, z), q, sc.set(L * 0.8, 1, 1.6)); bricksIM.setMatrixAt(nb, m); bricksIM.setColorAt(nb++, col.setHex(cc));
    for (let a = 0; a < L; a++) for (let b = 0; b < 2; b++) {
      const lx = (a - (L - 1) / 2) * 0.8, lz = (b - 0.5) * 0.8, cs = Math.cos(yaw), sn = Math.sin(yaw);
      m.compose(pos.set(x + lx * cs + lz * sn, FLOOR + 1.09, z - lx * sn + lz * cs), q, sc.set(1, 1, 1)); studsIM.setMatrixAt(nst, m); studsIM.setColorAt(nst++, col.setHex(cc));
    }
  }
  q.identity(); bricksIM.count = nb; studsIM.count = nst; bricksIM.castShadow = true;
  bricksIM.computeBoundingSphere(); studsIM.computeBoundingSphere(); G.add(bricksIM, studsIM);
  // A TOY ROBOT, standing guard.
  const robAt = along(4, 13);
  if (robAt) {
    const rob = new Group(), tin = new MeshStandardMaterial({ color: 0xB8C4D0, metalness: 0.8, roughness: 0.3, envMap: envTex }), red = new MeshPhysicalMaterial({ color: 0xE8403A, roughness: 0.3, clearcoat: 0.5 });
    const add = (geo, mat, x, y, z) => { const mm = new Mesh(geo, mat); mm.position.set(x, y, z); mm.castShadow = true; rob.add(mm); return mm; };
    add(new RoundedBoxGeometry(4, 4.4, 2.8, 2, 0.3), tin, 0, 6.2, 0); add(new RoundedBoxGeometry(2.8, 2.6, 2.4, 2, 0.3), tin, 0, 9.8, 0);
    add(new BoxGeometry(2.2, 1.2, 0.2), new MeshBasicMaterial({ color: 0x7FE8FF }), 0, 9.9, 1.25);
    for (const sx of [-1, 1]) { add(new RoundedBoxGeometry(1.2, 3.8, 1.2, 2, 0.2), red, sx * 1.1, 2, 0); add(new RoundedBoxGeometry(0.9, 3.4, 0.9, 2, 0.2), red, sx * 2.6, 6, 0); add(new SphereGeometry(0.35, 12, 10), new MeshBasicMaterial({ color: 0xFFE14A }), sx * 0.7, 10.4, 1.3); }
    add(new CylinderGeometry(0.08, 0.08, 1.4, 6), tin, 0, 11.8, 0); add(new SphereGeometry(0.3, 12, 10), red, 0, 12.6, 0);
    rob.position.set(robAt[0], FLOOR, robAt[1]); rob.rotation.y = robAt[0] < 3 ? 0.9 : -0.9; G.add(rob);
  }
  // BUNTING strung overhead, off to the sides.
  const flags = new InstancedMesh(new ConeGeometry(0.9, 1.8, 3), new MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.7 }), 90);
  let nf = 0;
  for (const side of [-1, 1]) {
    const x = 3 + side * 24;
    for (let z = 20; z > far && nf < 90; z -= 5) {
      const sag = Math.sin(((z % 20) / 20) * Math.PI) * 2.5;
      q.setFromEuler(e.set(Math.PI, 0, 0)); m.compose(pos.set(x, 12 - sag, z), q, sc.set(1, 1, 0.2)); flags.setMatrixAt(nf, m); flags.setColorAt(nf++, col.setHex(TOY_COLS[nf % TOY_COLS.length]));
    }
  }
  q.identity(); flags.count = nf; flags.computeBoundingSphere(); G.add(flags);
  // SOAP BUBBLES drifting up, shimmering.
  const bubbleM = new MeshPhysicalMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.28, roughness: 0, metalness: 0.1, iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 700], envMap: envTex, envMapIntensity: 1.6, depthWrite: false });
  const NBU = 40, bubbleIM = new InstancedMesh(new SphereGeometry(1, 20, 14), bubbleM, NBU);
  const bubs = Array.from({ length: NBU }, () => ({ x: 3 + (r() - 0.5) * 28, y: FLOOR + r() * 24, z: mid + (r() - 0.5) * (26 - far), s: 0.4 + r() * 0.9, v: 0.6 + r() * 0.8, ph: r() * 6.3 }));
  G.add(bubbleIM);
  // A MOBILE hung high overhead, stars and planets turning on their threads.
  const mobiles = [];
  for (let k = 0; k < 3; k++) {
    const side = k % 2 ? 1 : -1, mob = new Group(), threadM = new MeshBasicMaterial({ color: 0x8A8A8A });
    const cross = new Mesh(new CylinderGeometry(0.08, 0.08, 9, 6), PM.beech); cross.rotation.z = Math.PI / 2; mob.add(cross);
    const cross2 = cross.clone(); cross2.rotation.set(Math.PI / 2, 0, 0); mob.add(cross2);
    const top = new Mesh(new CylinderGeometry(0.03, 0.03, 20, 4), threadM); top.position.y = 10; mob.add(top);
    const hangers = [];
    [[4.5, 0], [-4.5, 0], [0, 4.5], [0, -4.5]].forEach(([hx, hz], j) => {
      const len = 3 + j * 0.8, th = new Mesh(new CylinderGeometry(0.02, 0.02, len, 4), threadM); th.position.set(hx, -len / 2, hz); mob.add(th);
      const shape = j % 2 ? new Mesh(new SphereGeometry(0.9, 20, 14), PM.bricks[(j + k) % PM.bricks.length]) : new Mesh(new CylinderGeometry(1.1, 1.1, 0.3, 5), new MeshPhysicalMaterial({ color: 0xFFD21F, roughness: 0.3, clearcoat: 0.5 }));
      if (!(j % 2)) shape.rotation.x = Math.PI / 2;
      shape.position.set(hx, -len - 0.9, hz); mob.add(shape); hangers.push(shape);
    });
    mob.position.set(3 + side * (10 + r() * 3), Math.min(3, minTop + 3), -6 - k * 45); G.add(mob);
    mobiles.push({ mob, hangers, sp: (k % 2 ? 1 : -1) * 0.25 });
  }
  // A TOY PLANE flying round on its string from a peg, propeller a blur.
  const tpAt = along(10, 8);
  let tplane = null, prop = null;
  if (tpAt) {
    tplane = new Group();
    const fus = new Mesh(capsule(0.5, 3.2), PM.bricks[0]); fus.rotation.z = Math.PI / 2; tplane.add(fus);
    const wing = new Mesh(new RoundedBoxGeometry(1.2, 0.18, 6, 2, 0.08), PM.bricks[1]); tplane.add(wing);
    const tail = new Mesh(new RoundedBoxGeometry(0.8, 1.2, 0.18, 2, 0.06), PM.bricks[1]); tail.position.set(-1.8, 0.6, 0); tplane.add(tail);
    prop = new Mesh(new BoxGeometry(0.1, 2.2, 0.25), new MeshStandardMaterial({ color: 0x333333 })); prop.position.set(2.2, 0, 0); tplane.add(prop);
    tplane.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const peg = new Mesh(new CylinderGeometry(0.4, 0.6, 7, 12), PM.beech); peg.position.set(tpAt[0], FLOOR + 3.5, tpAt[1]); G.add(peg);
    G.add(tplane);
  }
  const tpLine = new Mesh(new CylinderGeometry(0.03, 0.03, 1, 4), new MeshBasicMaterial({ color: 0x777777 })); if (tpAt) G.add(tpLine);
  // A BOUNCING BALL, and a JACK-IN-THE-BOX that pops up now and then.
  const bounceAt = along(3, 10);
  let bouncer = null;
  if (bounceAt) { bouncer = new Mesh(new SphereGeometry(1.4, 28, 20), new MeshPhysicalMaterial({ color: 0x16A5A5, roughness: 0.2, clearcoat: 1 })); bouncer.castShadow = true; G.add(bouncer); }
  const jackAt = along(4, 12);
  let jack = null, spring = null;
  if (jackAt) {
    const jb = new Group(), boxM = new MeshPhysicalMaterial({ map: canvasTex(64, 64, (g) => { g.fillStyle = '#E8403A'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#F7B32B'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(16 + (i % 2) * 32, 16 + Math.floor(i / 2) * 32, 9, 0, 7); g.fill(); } }), roughness: 0.4, clearcoat: 0.4 });
    const bx = new Mesh(new BoxGeometry(4, 4, 4), boxM); bx.position.y = 2; jb.add(bx);
    const lid = new Mesh(new BoxGeometry(4, 0.3, 4), new MeshPhysicalMaterial({ color: 0x2E86DE, roughness: 0.4 })); lid.position.set(0, 4.3, -2); lid.rotation.x = -1.9; lid.geometry.translate(0, 0, 2); jb.add(lid);
    spring = new Mesh(new CylinderGeometry(0.6, 0.6, 1, 10, 6, true), new MeshStandardMaterial({ color: 0xC0C4C8, metalness: 0.9, roughness: 0.3, wireframe: true })); jb.add(spring);
    jack = new Group();
    const head = new Mesh(new SphereGeometry(1.2, 22, 16), new MeshStandardMaterial({ color: 0xFFE0C0, roughness: 0.6 })); jack.add(head);
    const hat = new Mesh(new ConeGeometry(1, 2, 16), PM.bricks[4]); hat.position.y = 1.7; jack.add(hat);
    const nose = new Mesh(new SphereGeometry(0.3, 12, 10), PM.bricks[0]); nose.position.z = 1.15; jack.add(nose);
    for (const sx of [-0.45, 0.45]) { const ey = new Mesh(new SphereGeometry(0.14, 8, 6), new MeshBasicMaterial({ color: 0x111111 })); ey.position.set(sx, 0.35, 1.05); jack.add(ey); }
    const ruff = new Mesh(new TorusGeometry(1.1, 0.35, 8, 20), PM.bricks[1]); ruff.rotation.x = Math.PI / 2; ruff.position.y = -1.1; jack.add(ruff);
    jb.add(jack);
    jb.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    jb.position.set(jackAt[0], FLOOR, jackAt[1]); jb.rotation.y = jackAt[0] < 3 ? 0.8 : -0.8; G.add(jb);
  }
  // The path: alphabet blocks and bright bricks, turn about.
  w.restyle = () => {
    colliders.forEach((c, i) => {
      if (c.holo || c.obstacle) return;
      if (c.ferry) { c.mesh.material = [PM.ferrySide, PM.ferrySide, PM.ferryTop, PM.under, PM.ferrySide, PM.ferrySide]; return; }
      if (i % 3 === 1) {                                  // a brick: glossy plastic all round
        const b = PM.bricks[(i * 5) % PM.bricks.length];
        c.mesh.material = [b, b, b, PM.under, b, b];
      } else {                                            // a long wooden block, letters along its sides, square
        c.mesh.material = [PM.strip, PM.strip, PM.beech, PM.under, PM.strip, PM.strip];
        const gg = c.mesh.geometry, P = gg.attributes.position, uv = gg.attributes.uv;
        for (const [f, along] of [[0, (k) => -P.getZ(k)], [1, (k) => P.getZ(k)], [4, (k) => P.getX(k)], [5, (k) => -P.getX(k)]])
          for (let k = f * 4; k < f * 4 + 4; k++) uv.setXY(k, along(k) / (0.6 * 8), (P.getY(k) + c.half.y) / (2 * c.half.y));
        uv.needsUpdate = true;
      }
      setTopUV(c.mesh, false);
    });
  };
  const live = !REDUCED;
  let t = 0;
  const placeToys = () => {
    train.forEach((tk, i) => { const a = t * 0.22 - i * 0.36; tk.position.set(trackAt[0] + Math.cos(a) * TR, FLOOR + 0.55, trackAt[1] + Math.sin(a) * TR); tk.rotation.y = -a - Math.PI / 2; });
    for (const T of tops) T.rotation.y = t * 9;
    bubs.forEach((B, i) => {                              // bubbles: up, wobbling, and round again
      B.y += B.v * (1 / 60);
      if (B.y > FLOOR + 30) { B.y = FLOOR + 1; B.x = 3 + (r() - 0.5) * 28; }
      m.compose(pos.set(B.x + Math.sin(t * 0.8 + B.ph) * 1.5, B.y, B.z + Math.cos(t * 0.6 + B.ph) * 1.2), q, sc.set(B.s * (1 + 0.05 * Math.sin(t * 5 + B.ph)), B.s * (1 - 0.05 * Math.sin(t * 5 + B.ph)), B.s));
      bubbleIM.setMatrixAt(i, m);
    });
    bubbleIM.instanceMatrix.needsUpdate = true;
    for (const M2 of mobiles) { M2.mob.rotation.y = t * M2.sp; M2.hangers.forEach((h, j) => { h.rotation.y = t * (0.6 + j * 0.2); }); }
    if (tplane) {                                         // round the peg on its line, rising and dipping a little
      const a2 = t * 0.9, R2 = 10, px = tpAt[0] + Math.cos(a2) * R2, pz = tpAt[1] + Math.sin(a2) * R2, py = FLOOR + 7 + Math.sin(a2 * 2) * 1.2;
      tplane.position.set(px, py, pz); tplane.rotation.set(0, -a2 - Math.PI / 2, 0.35, 'YXZ'); prop.rotation.x = t * 40;
      const dx = px - tpAt[0], dy = py - (FLOOR + 7), dz = pz - tpAt[1], L2 = Math.hypot(dx, dy, dz);
      tpLine.position.set((px + tpAt[0]) / 2, (py + FLOOR + 7) / 2, (pz + tpAt[1]) / 2); tpLine.scale.set(1, L2, 1);
      tpLine.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(dx, dy, dz).normalize());
    }
    if (bouncer) {                                        // a bounce: up and down, squashed as it lands
      const u = (t * 0.9) % 1, hgt = 4 * u * (1 - u) * 9, squash = u < 0.06 || u > 0.94 ? 0.75 : 1;
      bouncer.position.set(bounceAt[0], FLOOR + 1.4 * squash + hgt, bounceAt[1]); bouncer.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    }
    if (jack) {                                           // out it pops, bobs on its spring, and sinks back
      const u = (t % 6) / 6, up = u < 0.1 ? u / 0.1 : u < 0.55 ? 1 : u < 0.7 ? 1 - (u - 0.55) / 0.15 : 0;
      const bob = up > 0.99 ? Math.sin(t * 9) * 0.35 * Math.exp(-(u - 0.1) * 8) : 0, hgt = 3.2 + up * 4 + bob;
      jack.position.y = hgt + 1.2; spring.position.y = 3.2 + (hgt - 3.2) / 2; spring.scale.y = Math.max(0.05, hgt - 3.2);
    }
    cars.forEach((C, i) => {                              // round the rug's ring road
      const u = ((t * 0.035 + C.u) % 1), per = u * 4, k = Math.floor(per), f = per - k, rz = mid * 0.6, rx = 3;
      const corners = [[rx - 25.3, rz - 18.3], [rx + 25.1, rz - 18.3], [rx + 25.1, rz + 18], [rx - 25.3, rz + 18]];   // the rug's ring road
      const A = corners[k], B = corners[(k + 1) % 4];
      C.car.position.set(A[0] + (B[0] - A[0]) * f, FLOOR + 0.05, A[1] + (B[1] - A[1]) * f); C.car.rotation.y = -Math.atan2(B[1] - A[1], B[0] - A[0]);
    });
  };
  placeToys();
  w.tick = (dt) => { if (!live) return; t += dt; placeToys(); };
});
function capsule(rad, len) {                               // a cylinder with round ends (the trimmed library has no CapsuleGeometry)
  return new LatheGeometry(capsuleProfile(rad, len), 20);
}
function capsuleProfile(rad, len) {
  const pts = [];
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2); pts.push(new Vector2(Math.cos(a) * rad, -len / 2 + Math.sin(a) * rad)); }
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); pts.push(new Vector2(Math.cos(a) * rad, len / 2 + Math.sin(a) * rad)); }
  return pts;
}
let dieT = null;
function dieTex() {
  return dieT || (dieT = canvasTex(64, 64, (g) => {
    g.fillStyle = '#FBFAF6'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#C8352E'; for (const [x, y] of [[18, 18], [46, 46], [32, 32], [46, 18], [18, 46]]) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
  }));
}

// ---------- LOOP ----------
let last = performance.now(), frames = 0, frameMs = 16.7, simHold = false;
const perf = { update: 0, render: 0, stall: 0 };        // script time per frame, for the harness (and a test's stall)
/* QUALITY FOLLOWS THE PHONE (a player, 2026-09-27: "there is a lag in the motion
   on phones"; the owner's phone felt none). A phone that cannot keep up draws
   fewer pixels: after the first three seconds, if frames come slower than about
   48 a second for a second and a half, the 3D view's resolution steps down a
   quarter, as far as the screen's own pixels; at full speed for eight seconds it
   steps back up, and if that step brings the slowness straight back, it stays
   down for good rather than flicker between the two. Still too slow at the
   screen's own pixels, and the sun stops casting shadows. The controls and the
   read-out stay sharp. */
function adaptQuality(dt) {
  if (frames < 180 || !renderer) return;
  quality.sinceUp += dt;
  if (quality.settle > 0) { quality.settle -= dt; return; }
  if (frameMs > 21) { quality.slow += dt; quality.fast = 0; }
  else if (frameMs < 18) { quality.fast += dt; quality.slow = 0; }      // full speed on a 60 Hz screen is 16.7
  else { quality.slow = 0; quality.fast = 0; }
  if (quality.slow > 1.5) {
    quality.slow = 0; quality.settle = 1.5;
    if (quality.sinceUp < 6) quality.cap = quality.ratio - 0.25;       // the last step up was one too many
    if (quality.ratio > 1) { quality.ratio = Math.max(1, quality.ratio - 0.25); resizeCanvases(); }
    else if (quality.shadows) { quality.shadows = false; sun.castShadow = false; }
  } else if (quality.fast > 8 && quality.ratio < Math.min(quality.max, quality.cap)) {
    quality.fast = 0; quality.settle = 1.5; quality.sinceUp = 0;
    quality.ratio = Math.min(quality.max, quality.cap, quality.ratio + 0.25); resizeCanvases();
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  if (now - last < 250) frameMs += ((now - last) - frameMs) * 0.05;   // a hidden tab's long gap is not a slow frame
  last = now; frames++;
  if (renderer) {
    const t0 = performance.now();
    if (!simHold) update(dt, now);
    const t1 = performance.now();
    renderer.render(scene, camera);
    perf.update += (t1 - t0 - perf.update) * 0.05; perf.render += (performance.now() - t1 - perf.render) * 0.05;
    if (perf.stall) { const until = performance.now() + perf.stall; while (performance.now() < until) { /* a test: a slow phone */ } }
    adaptQuality(dt);
  }
  drawHUD(now);
  if (frames === 2) window.dispatchEvent(new Event('game-ready'));   // drawn, shaders built: the page may take the cover away
}

// ---------- BOOT ----------
setCanvasVars();
fitFullscreen();
resizeCanvases();
loadLevel(save.level || 1);
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
window.addEventListener('load', onResize);
window.visualViewport?.addEventListener('resize', onResize);
setTimeout(onResize, 0);
setTimeout(onResize, 300);
requestAnimationFrame(frame);
/* THE GAME'S WORLD IS THE NEON CITY (owner, 2026-09-26). The plain link opens
   it. The other mock-ups stay on the link's #name to compare (hills, desk,
   lagoon, space, crystal, blocks, valley), and #void is the dark void the
   game started with. */
function worldFromHash() {
  const [h, v, w] = location.hash.slice(1).split('-');
  if (h === 'try' && TRY_COURSES[v]) { loadTry(v, w === 'tokyo'); setWorld(w === 'tokyo' ? 'tokyo' : 'neon'); return; }   // #try-ice, #try-ice-tokyo
  if (h === 'level') {                                  // #level-17 opens course 17, to look at one
    const n = parseInt(v, 10);
    if (n >= 1 && n <= LEVELS.length) loadLevel(n);
  }
  let name = h && h !== 'level' ? h : null;
  if (name === 'tokyo' && levelNo <= 50) loadLevel(51);                            // #tokyo: Tokyo's first course
  if (!name || ['neon', 'tokyo', 'dystopia'].includes(name)) name = levelNo > 50 ? 'tokyo' : 'neon';   // the world follows the course
  if (name === 'neon') {
    neonStyle = ['grid', 'glowgrid', 'edges', 'frosted'].includes(v) ? v : 'glowgrid';   // #neon-edges and so on
    neonLive = v !== 'still';                                                            // #neon-still: the city unmoving
  }
  setWorld(WORLDS[name] ? name : 'void');
}
worldFromHash();
window.addEventListener('hashchange', worldFromHash);

// ---------- HARNESS ----------
let fakeNow = 0;
if (HARNESS) {
  window.__marble = {
    state: () => ({ phase: state, level: levelNo, clock: +clock.toFixed(2), falls, started, everMoved, pocket: !!pocket, push: +ball.push.toFixed(3), tube: !!ball.tube,
                    ...(() => { const Rd = ball.onRound; if (!Rd) return { carry: [0, 0], cf: [0, 0] };
                                const dx = ball.p.x - Rd.x, dz = ball.p.z - Rd.z, f = RB_CF * Rd.spin * Rd.spin;
                                return { carry: [-Rd.spin * dz, Rd.spin * dx], cf: [dx * f, dz * f] }; })(),
                    spawn: spawn.toArray().map((v) => +v.toFixed(2)),
                    LW, LH, mode: MODE, webgl: !!renderer, grounded: ball.grounded,
                    ball: ball.p.toArray().map((v) => +v.toFixed(3)),
                    v: ball.v.toArray().map((v) => +v.toFixed(3)),
                    gates: gates.map((g) => g.passed), frames, frameMs: +frameMs.toFixed(1),
                    ice: ball.ice && { c: ball.ice.c, r: ball.ice.r, moving: !!(ball.ice.dc || ball.ice.dr), x0: ball.ice.P.x0, z0: ball.ice.P.z0 } }),
    reach: (n) => (typeof n === 'string' ? loadTry(n.split('-')[0], n.endsWith('-tokyo')) : loadLevel(n)),   // 41, or 'ice', 'ice-tokyo'
    tint: () => ball.tint,
    simT: () => +simT.toFixed(3),
    holos: () => holos.map((c) => { const h = holoState(c.holo, simT); return { lit: h.lit, t: +h.t.toFixed(3), left: +h.left.toFixed(3) }; }),
    switches: () => switches.map((S) => ({ on: S.on, x: S.pc.x, z: S.pc.z })),
    flames: () => flames.map((F) => ({ lines: F.lines.map((L) => { const st = flameState(L, simT); return { active: st.active, h: +st.h.toFixed(2), offFor: +st.offFor.toFixed(3), z: L.z }; }) })),
    cracks: () => cracks.map((c) => ({ state: c.crack.state, z: c.pos.z })),
    plaza: () => plazas.map((P) => ({ held: P.held ? P.held.n : 0, onPad: P.onPad, x0: P.x0, z0: P.z0, y: P.y, cols: P.cols, rows: P.rows,
                                      gates: P.gates.map((g) => ({ ek: g.ek, state: g.state })), crates: P.crates.map((W) => ({ c: W.c, r: W.r, moving: W.moving, sunk: !!W.sunk })),
                                      tune: P.tune && { seq: P.tune.seq, at: P.tune.at, done: P.tune.done, playing: !!P.tune.play, heard: P.tune.heard },
                                      twin: P.twin && { c: P.twin.c, r: P.twin.r, moving: P.twin.t < 1, done: P.twin.done, pad: P.twin.pad },
                                      tiles: P.tiles.map((T) => ({ c: T.c, r: T.r, mask: T.mask, moving: T.moving > 0 })), charged: P.charged, lit: P.lit,
                                      mirrors: P.mirrors.map((M) => ({ c: M.c, r: M.r, m: M.m })), stands: P.stands.map((s) => ({ c: s.c, r: s.r, n: s.key ? s.key.n : 0 })),
                                      view: +plazaView.toFixed(3), cam: P.cam && { pos: P.cam.pos.toArray().map((v) => +v.toFixed(2)), at: P.cam.at.toArray().map((v) => +v.toFixed(2)) } })),
    scans: () => scans.map((Sc) => ({ x: Sc.x, z: Sc.zc, d: Sc.d, w: Sc.w, A: Sc.A, period: Sc.period, phase: Sc.phase, bars: Sc.bars.length,
                                      at: Sc.bars.map((_, i) => +scanX(Sc, simT, i).toFixed(3)) })),
    winds: () => winds.map((W) => { const st = windState(W, simT); return { k: +st.k.toFixed(3), show: +st.show.toFixed(3), z: W.z, d: W.d }; }),
    windDebug: () => winds.map((W) => { const m = W.streaks, e = []; for (let i = 0; i < 4; i++) { const a = new Matrix4(); m.getMatrixAt(i, a); e.push(a.elements.map((v) => +v.toFixed(2))); }
      return { op: m.material.opacity, count: m.count, inScene: !!m.parent && !!m.parent.parent, from: W.from, to: W.to, e, map: !!m.material.map, vis: m.visible }; }),
    crossings: () => crossings.map((c) => ({ green: c.cross.green, greenFor: c.cross.green ? +(simT - c.cross.greenSince).toFixed(3) : -1,
                                             cars: c.cross.cars.map((k) => [+k.x.toFixed(2), k.lane.z]) })),
    // Fast checks: hold the clock, then run the game a step at a time with a
    // given stick, through the same update() a frame runs.
    hold: (on) => { simHold = !!on; return simHold; },
    drive: (ix, iz, steps = 1) => {
      forced = [ix, iz];
      for (let i = 0; i < steps; i++) update(1 / 60, (fakeNow += 1000 / 60));
      forced = null;
      return state;
    },
    complete: () => { if (state === 'play') { ball.p.set(goal.pos.x, goal.pos.y + R, goal.pos.z); } },
    hits: () => JSON.parse(JSON.stringify(L.hit)),
    course: () => JSON.parse(JSON.stringify(level)),
    ferries: () => ferries.map((c) => c.pos.toArray()),
    readout: () => ({ ...L.readout }),
    ghost: () => (L.ghost ? JSON.parse(JSON.stringify(L.ghost)) : null),
    news: () => (L.news ? JSON.parse(JSON.stringify(L.news)) : null),
    rulesFit: () => {
      const c = cardLayout('rules');
      const sum = c.HEADER + c.viewH + c.FOOTER;
      return { fits: sum === c.ph && c.py >= 0 && c.py + c.ph <= LH, cardH: c.ph, frameH: LH,
               viewportH: c.viewH, contentH: c.contentH, scrollMax: c.scrollMax,
               overlapPx: Math.max(0, c.py + c.ph - LH) };
    },
    progress: () => JSON.parse(JSON.stringify(save)),
    starTime: (n) => STAR_TIMES[(n || levelNo) - 1],
    look: (name) => { setLook(name); return look; },
    eye: (style) => { buildEye(style); return eyeStyle; },
    world: (name) => setWorld(name),
    skin: (name) => setMarbleSkin(name),
    neon: (style) => neonCourse(style),
    audio: () => citySound && { roll: roll ? +roll.g.gain.value.toFixed(4) : null, city: +citySound.pg.gain.value.toFixed(4),
                                train: +citySound.tg.gain.value.toFixed(4), state: citySound.ac.state },
    peek: (p, a, fov) => {
      peekCam = p ? { pos: p, at: a } : null;
      camera.fov = p && fov ? fov : camParams().fov; camera.updateProjectionMatrix();
      return !!peekCam;
    },
    place: (x, y, z) => { ball.p.set(x, y, z); ball.v.set(0, 0, 0); marble.position.copy(ball.p); return ball.p.toArray(); },
    freeze: (on) => { cityRefs.frozen = !!on; return cityRefs.frozen; },
    trainAt: (x) => { if (cityRefs.train) cityRefs.train.position.x = x; return !!cityRefs.train; },
    cars: () => (cityRefs.cars ? cityRefs.cars() : []),
    trail: () => lastTrail && { n: lastTrail.pts.length, count: lastTrail.geo.drawRange.count, inScene: !!lastTrail.mesh.parent && !!lastTrail.mesh.parent.parent,
                               first: lastTrail.pts[0], last: lastTrail.pts[lastTrail.pts.length - 1] },
    quiet: () => { everMoved = true; },       // no drag hint, for stills
    courseShown: (on) => { levelGroup.visible = !!on; return levelGroup.visible; },   // hide the course, to measure it against the city
    stall: (ms) => { perf.stall = ms; return ms; },     // a test: make every frame this much slower, as a slow phone would be
    perf: () => ({ update: +perf.update.toFixed(2), render: +perf.render.toFixed(2), frameMs: +frameMs.toFixed(1), calls: renderer && renderer.info.render.calls,
                   quality: { ...quality },
                   tris: renderer && renderer.info.render.triangles, colliders: colliders.length, shadow: renderer && renderer.shadowMap.enabled,
                   ratio: renderer && renderer.getPixelRatio(), geometries: renderer && renderer.info.memory.geometries, textures: renderer && renderer.info.memory.textures }),
    closeup: (on) => {
      closeup = !!on;
      camera.fov = on ? 30 : camParams().fov; camera.updateProjectionMatrix();
      return closeup;
    },
  };
}
