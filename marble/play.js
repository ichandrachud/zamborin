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
  RoomEnvironment, InstancedMesh, Matrix4, Object3D,
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
    renderer.setPixelRatio(Math.min(2, dpr));
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
  zap() {                                             // caught by a scanner
    voice('sawtooth', 1500, 90, 0.38, 0.045); voice('square', 760, 60, 0.3, 0.025); voice('sine', 2400, 380, 0.16, 0.02);
  },
  power() {                                           // a power switch: a clunk, then the power rising
    voice('square', 90, 55, 0.14, 0.05); voice('sine', 160, 60, 0.18, 0.07);
    voice('sawtooth', 110, 660, 0.9, 0.014, 0.08); voice('sine', 220, 1320, 0.8, 0.035, 0.08);
  },
  pass() { voice('sine', 330, 660, 0.3, 0.05); voice('sine', 990, 990, 0.25, 0.02, 0.08); },       // through a wall of its own colour
  buzz() { voice('square', 110, 100, 0.22, 0.035); voice('sawtooth', 55, 50, 0.2, 0.03); },        // a wall of the other colour
  bump() {                                            // a car meets the marble: a thud, and two notes of horn
    voice('sine', 170, 55, 0.3, 0.11); voice('triangle', 90, 40, 0.25, 0.05);
    voice('square', 466, 466, 0.1, 0.022, 0.06); voice('square', 370, 370, 0.16, 0.022, 0.2);
  },
};
// The city's version of a sound where it has one, the house sound elsewhere.
function sound(name) {
  if ((world.name === 'neon' || ['boost', 'jump', 'bump', 'depart', 'tint', 'pass', 'buzz', 'warp', 'tube', 'pop', 'power', 'zap', 'knock', 'clink'].includes(name)) && NEON_SOUNDS[name]) { if (sfx && sfx.isOn()) NEON_SOUNDS[name](); }
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
  const r = seeded(4242 + n * 131), g = (n - 1) / 39, W = (a, b) => mix(a, b, g);
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
  straight(5, wide);
  for (let f = 2 + Math.round(g * 3); f > 0; f--) {
    if (r() < 0.55) jog(r() < 0.4 ? narrow : wide); else straight(r2(W(6, 10) + r() * 2), narrow);
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
   listed in the order the marble meets them. */
const DISTRICTS = ['Downtown', 'Transit', 'Holograms', 'Boost', 'Express'];
function makeLevel(n) {
  const r = seeded(9001 + n * 7919);
  const d = Math.floor((n - 1) / 8), k = ((n - 1) % 8) / 7, g = (n - 1) / 39;
  const W = (a, b) => mix(a, b, g);
  const wide = W(4, 2.2), narrow = Math.max(1.3, W(2.5, 1.4) - 0.25 * k);
  const saveEvery = W(15, 28);
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
  const dwell = r2(W(1.6, 0.9)), runT = W(2.4, 1.6), period = r2(2 * dwell + 2 * runT);
  function slide() {                                    // a pad that carries you sideways, to a path further over
    const amp = r2(W(2.6, 3.4));
    let dir = r() < 0.5 ? -1 : 1;
    if (x + 2 * amp * dir < -3 || x + 2 * amp * dir > 9) dir = -dir;
    pieces.push(FERRY(r2(x + amp * dir), z - 1.5, r2(Math.max(2.6, wide + 0.4)), 3, y, 'x', amp, period, dwell, r2(r() * 6.28)));
    x = r2(x + 2 * amp * dir); on(3);
    straight(r2(3 + r() * 2), wide);                    // somewhere to land
  }
  function shuttle() {                                  // a pad that carries you over a long gap
    const gap = r2(W(6, 10)), pad = 3;
    pieces.push(FERRY(x, z - gap / 2, r2(wide + 0.4), pad, y, 'z', r2((gap - pad) / 2), period, dwell, r2(r() * 6.28)));
    on(gap);
    straight(r2(3 + r() * 2), wide);
  }
  function bridge(w) {                                  // a hologram bridge: cross while it is lit
    const len = r2(W(4, 8)), lit = Math.max(len / 4.5 + 0.9, mix(3.4, 1.9, g)), dark = mix(1.2, 2.2, g);
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
    const off = 3.2, len = r2(W(16, 20)), wideW = r2(Math.max(2.4, wide));
    const longLeft = x >= 3, xs = r2(x + (longLeft ? off : -off)), xl = r2(x + (longLeft ? -off : off));
    pieces.push(F(x, z - 1.5, r2(2 * off + wideW), 3, y)); on(3);             // where it splits
    const z0 = z;
    if (n >= 17 && r() < 0.6) {                                              // the narrow way, with a bridge on it
      const a = r2(len * 0.3), b = r2(len * 0.4), c = r2(len - a - b);
      const lit = Math.max(b / 4.5 + 0.9, mix(3.4, 1.9, g)), dark = mix(1.2, 2.2, g);
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
    const D = r2(W(18, 26)), gap = D + TRAIN_DECK, runT = W(3.8, 3.0), dwellT = r2(W(3.8, 2.8));
    pieces.push(TRAIN(x, r2(z - gap / 2), 1.8, y, r2(D / 2), r2(2 * dwellT + 2 * runT), dwellT, r2(r() * 6.28), r2(W(0.35, 0.8))));
    on(gap);
    straight(r2(6 + r() * 3), wide);                    // the next station
  }
  function cross(w) {                                   // flying cars across the road, and a light to cross by
    const two = n >= 20 && r() < 0.35 + 0.4 * g;         // later, two lanes going opposite ways
    const d = two ? 3.8 : 2.4, speed = r2(W(7, 11) + r());
    const lane = (dz, dir) => {
      const gaps = [];                                  // seconds between cars, uneven, so some gaps are worth waiting for
      for (let i = 3 + Math.floor(r() * 2); i > 0; i--) gaps.push(r2(W(3.4, 2.7) + r() * W(2.6, 1.8)));
      return { dz, dir, speed, gaps, phase: r2(r()) };
    };
    pieces.push(CROSS(x, z - d / 2, w, d, y, two ? [lane(-0.8, 1), lane(0.8, -1)] : [lane(0, r() < 0.5 ? 1 : -1)]));
    on(d);
  }
  /* MAGLEV STRIPS (owner, 2026-09-27: "proceed on the next 4 blocks and
     obstacles"): road that pulls the marble toward one edge. Later, two
     strips in a row that pull opposite ways. */
  let magsN = 0, windsN = 0;
  function maglev(w) {
    const mw = r2(Math.max(w, 2)), pull = r2(W(6, 11));
    let dir = r() < 0.5 ? -1 : 1;
    for (let i = n >= 25 && r() < 0.5 ? 2 : 1; i > 0; i--) {
      const len = r2(W(7, 10) + r() * 2);
      pieces.push(MAG(x, r2(z - len / 2), mw, len, y, r2(dir * pull)));
      on(len); dir = -dir;
    }
    straight(r2(3 + r() * 2), w);
  }
  /* WIND BETWEEN THE TOWERS: two towers stand beside the road with a gap
     between them, and gusts blow out of the gap across the road. Straight
     road before and after, where the towers stand. */
  function gusts(w) {
    const ww = r2(Math.max(w, 1.8)), len = r2(W(8, 11) + r() * 2), period = r2(W(4.4, 3.4) + r() * 0.8);
    straight(4.5, ww);
    pieces.push(WIND(x, r2(z - len / 2), ww, len, y, r() < 0.5 ? -1 : 1, r2(W(7, 12)), period, r2(W(1.8, 2.2)), r2(r() * period)));
    on(len);
    straight(r2(5 + r() * 2), ww);
  }
  /* THE ROUNDABOUT: in from the south; out to the west, north or east, where
     one road leads on and the others stop short. A road out to the side
     turns north again past the ring. The first one leads straight on. */
  let roundsN = 0;
  function roundabout() {
    roundsN++;
    const ew = r2(Math.max(2.2, narrow + 0.5)), ro = RB_RO, spin = r2(W(0.5, 0.8));
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
    const side = x <= 3 ? 1 : -1, len = r2(W(4, 9) + r() * 2), zj = r2(z - jw / 2);
    pieces.push(F(x, zj, jw, jw, y));                   // the junction
    const a = r2(x + side * jw / 2), b = r2(a + side * len), px = r2(b + side * 1.3);
    pieces.push({ ...F(r2((a + b) / 2), zj, len, sw, y), detour: k }, { ...F(px, zj, 2.6, 2.6, y), detour: k });
    const run0 = 2.5, dl = r2(W(4, 7)), cz = r2(zj + sw / 2 - 0.28), ex = r2(x + side * (jw / 2 - 0.28));
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
    const gap = r2(kind === 'crate' ? W(1.7, 1.3) : W(1.6, 1.2)), ow = r2(Math.max(wide, 3.2, 2 * gap + 0.8)), half = ow / 2;
    const rows = 3 + Math.round(W(0, 2) + r()), sp = r2(kind === 'crate' ? W(3.4, 2.9) : W(3.1, 2.5));
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
    const two = n >= 35 && (scansN === 1 || r() < 0.5), sw = r2(Math.max(wide, 2.4));   // from 35, a level's first has two bars
    const d = r2(two ? W(3.6, 4.4) : W(4, 5.5) + r() * 0.8), period = r2(W(4, 3.2) + r() * 0.5 + (two ? 0.4 : 0));
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
  const features = 2 + Math.round(k * 2) + d, length = 45 + 155 * g;
  straight(5, wide);
  for (let f = 0; f < features + 8 && (f < features || run < length); f++) {
    const pool = f % 2 ? EARLIER[d] : OWN[d];
    const pick = f === 0 ? opener : pool[Math.floor(r() * pool.length)];
    const w = r() < 0.3 + 0.35 * k ? narrow : wide;
    if (pick === 'ramp' && n >= 3) ramp(w);
    else if (pick === 'narrow' && n >= 4) straight(r2(W(6, 12) + r() * 2), narrow);
    else if (pick === 'slide') slide();
    else if (pick === 'shuttle') shuttle();
    else if (pick === 'bridge') bridge(w);
    else if (pick === 'boost') boost(wide);
    else if (pick === 'jump') jump(wide);
    else if (pick === 'boostJump') boostJump(wide);
    else if (pick === 'cross' && n >= 5) cross(w);
    else if (pick === 'ride') { if (n >= 13 && !rides) ride(); else shuttle(); }
    else if (pick === 'locks') { if (n >= 21) locks(n >= 33 && r() < 0.5 ? 2 : 1); else bridge(w); }
    else if (pick === 'wormhole') { if (n >= 11 && !worms) wormhole(); else jog(w); }
    else if (pick === 'fork') { if (n >= 7) fork(); else jog(w); }
    else if (pick === 'loop') { if (n >= 27 && loops < 2) loopDeLoop(); else boostJump(wide); }
    else if (pick === 'mag') { if (magsN++ < 2) maglev(w); else jog(w); }
    else if (pick === 'wind') { if (windsN++ < 2) gusts(w); else jog(w); }
    else if (pick === 'round') { if (!roundsN) roundabout(); else jog(w); }
    else if (pick === 'tube') { if (!tubesN) glassTube(); else boost(wide); }
    else if (pick === 'switch') { if (!switchesN) powerSwitch(); else jog(w); }
    else if (pick === 'scan') { if (scansN < 2) scanner(); else jog(w); }
    else if (pick === 'bollards' || pick === 'barriers' || pick === 'crates') { if (blocksN < 2) obstacles(pick.slice(0, -1)); else jog(w); }
    else jog(w);
    straight(r2(mix(6, 4, g) + r() * 3), r() < 0.5 ? wide : narrow);
  }
  pieces.push(F(x, z - 3.5, 6, 7, y));                  // the finish, and the orange ring on it
  return { start: [0, 0, 1], gates, goal: [x, y, r2(z - 4)], pieces, district: DISTRICTS[d], length: Math.round(run + 7) };
}
const LEVELS = Array.from({ length: 40 }, (_, i) => makeLevel(i + 1));
/* TIME STARS (owner, 2026-09-27: "let's do the 3 you suggest"). Each level has
   a star time: finish under it and the level's star is yours. Each was set by
   the autopilot racing the course, quick and clean with no falls, by the
   quicker way at a fork, plus 6% (at least a second), rounded up to a whole
   second, and never more than half a second under its careful run, so the
   autopilot playing carefully earns none of them. The courses come
   from their seeds, so these hold until a course changes; then they must be
   raced again. */
const STAR_TIMES = [23, 27, 22, 29, 25, 19, 25, 33, 33, 44, 54, 33, 66, 61, 51, 65, 60, 48, 44, 70,
                    62, 69, 57, 60, 39, 39, 41, 46, 49, 52, 43, 48, 80, 82, 50, 75, 53, 77, 106, 60];

let levelGroup = null;
let colliders = [], ferries = [], holos = [], pads = [], crossings = [], riders = [], curtains = [], locks = [], wormholes = [], loopsIn = [], mags = [], winds = [], rounds = [], tubes = [], switches = [], scans = [], posts = [], blinkers = [], gates = [], goal = null, level = null;

function platformGeometry(w, h, d) {
  const g = new RoundedBoxGeometry(w, h, d, 3, Math.min(0.14, h / 2 - 0.01));
  // The top takes world-scale UVs, one tile to a metre, so a long plank and a
  // square pad show the same tile. Group 2 is the +y face.
  const pos = g.attributes.position, uv = g.attributes.uv, top = g.groups[2];
  for (let i = top.start; i < top.start + top.count; i++) uv.setXY(i, pos.getX(i) / 2, pos.getZ(i) / 2);
  uv.needsUpdate = true;
  return g;
}

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
  const tx = pc.x - pc.dir * (w / 2 + TOWER_OFF + TOWER_W / 2), H = TOWER_UP + 70;
  for (const tz of [pc.z + d / 2 + TOWER_D / 2, pc.z - d / 2 - TOWER_D / 2]) {
    const t = new Mesh(new BoxGeometry(TOWER_W, H, TOWER_D), face);
    t.position.set(tx, pc.y + TOWER_UP - H / 2, tz);
    levelGroup.add(t);
    const lamp = new Mesh(new SphereGeometry(0.3, 10, 8), new MeshBasicMaterial({ color: 0xFF2D48, toneMapped: false }));
    lamp.position.set(tx, pc.y + TOWER_UP + 0.3, tz);
    levelGroup.add(lamp);
  }
  const n = 64, streaks = new InstancedMesh(new PlaneGeometry(1, 0.2), glowMat(0xE4F8FF, 0, streakTex), n);
  streaks.material.side = DoubleSide;
  // The streaks stream out of the gap, across the road and on over the city.
  const from = tx + pc.dir * TOWER_W / 2, to = pc.x + pc.dir * (w / 2 + 7);
  const Wd = { dir: pc.dir, force: pc.force, period: pc.period, gust: pc.gust, phase: pc.phase,
               x: pc.x, z: pc.z, w, d, y: pc.y, span: w + 8, from, to, streaks, bits: [] };
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
      S.at.forEach((a, i) => S.dots.setColorAt(i, a <= reach ? DOT_ON : DOT_OFF));
      S.dots.instanceColor.needsUpdate = true;
    }
    if (S.top) { S.top.emissiveIntensity = S.top0 * road; S.side.emissiveIntensity = S.side0 * Math.max(0.15, road); }
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
  const nrm = new Vector3(1, 0, 0), bi = new Vector3(), t = new Vector3(), c = new Vector3();
  tubeDir(T, 0, t); nrm.set(-t.z, 0, t.x).normalize();
  for (let i = 0; i < ringN; i++) {
    const sI = Math.min(T.len, i * 0.2);
    tubeAt(T, sI, c); tubeDir(T, sI, t);
    nrm.addScaledVector(t, -nrm.dot(t)).normalize(); bi.crossVectors(t, nrm);
    for (let j = 0; j < seg; j++) {
      const a = j / seg * Math.PI * 2, k = (i * seg + j) * 3;
      pos[k] = c.x + (nrm.x * Math.cos(a) + bi.x * Math.sin(a)) * TUBE_R;
      pos[k + 1] = c.y + (nrm.y * Math.cos(a) + bi.y * Math.sin(a)) * TUBE_R;
      pos[k + 2] = c.z + (nrm.z * Math.cos(a) + bi.z * Math.sin(a)) * TUBE_R;
      if (i < ringN - 1) { const b = i * seg, j2 = (j + 1) % seg; idx.push(b + j, b + seg + j, b + j2, b + j2, b + seg + j, b + seg + j2); }
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const glass = new Mesh(geo, tubeGlassMat()); glass.renderOrder = 2;
  // Rings of light every 1.4 m, and a bigger one at each open end.
  const n = Math.floor(T.len / 1.4), rings = new InstancedMesh(new TorusGeometry(TUBE_R + 0.015, 0.03, 6, 40),
    new MeshBasicMaterial({ color: 0xFFFFFF, toneMapped: false }), n), o = new Object3D(), col = new Color(0x2A9FC0);
  for (let i = 0; i < n; i++) {
    const sI = (i + 0.5) * T.len / n;
    tubeAt(T, sI, o.position); tubeDir(T, sI, t); o.quaternion.setFromUnitVectors(_tz, t); o.updateMatrix();
    rings.setMatrixAt(i, o.matrix); rings.setColorAt(i, col);
  }
  const ends = [0, T.len].map((sI) => {
    const m = new Mesh(new TorusGeometry(TUBE_R + 0.12, 0.07, 10, 48), new MeshBasicMaterial({ color: 0x5FE8FF, toneMapped: false }));
    tubeAt(T, sI, m.position); tubeDir(T, sI, t); m.quaternion.setFromUnitVectors(_tz, t);
    const halo = new Mesh(new CircleGeometry(TUBE_R + 0.5, 40), glowMat(0x34E0FF, 0.35, dot));
    halo.position.copy(m.position); halo.quaternion.copy(m.quaternion);
    levelGroup.add(m, halo); return m;
  });
  levelGroup.add(glass, rings);
  const out = new Vector3(); tubeAt(T, 0, out);
  tubes.push({ pc, T, rings, ringS: Array.from({ length: n }, (_, i) => (i + 0.5) * T.len / n), mouth: out, cap: 1.25, ends });
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
function animateTubes() {
  const col = new Color();
  for (const U of tubes) {
    const at = ball.tube && ball.tube.U === U ? ball.tube.s : -99;
    U.ringS.forEach((sI, i) => {                        // a ring flares as the marble passes and fades behind it
      const d = at - sI, f = d > -1.2 && d < 7 ? (d < 0 ? 1 + d / 1.2 : Math.exp(-d / 2.2)) : 0;
      U.rings.setColorAt(i, col.setRGB(0.16 + 0.84 * f, 0.62 + 0.38 * f, 0.75 + 0.25 * f));
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
  if (!crossKit) crossKit = carKit(neonEnvMap() || envTex);
  const K = crossKit, top = pc.y, near = pc.z + d / 2;
  const X = { lanes: [], cars: [], lights: [], green: true, greenSince: 0, w, x: pc.x, top };
  pc.lanes.forEach((L, li) => {
    const len = L.speed * L.gaps.reduce((a, b) => a + b, 0);
    const lane = { ...L, z: pc.z + L.dz, len, at: [] };
    let s = 0;
    for (const gap of L.gaps) { lane.at.push(s); s += gap * L.speed; }
    X.lanes.push(lane);
    // The lane in the air: a faint road with dashed edges, 60 m of it.
    const road = new Mesh(new PlaneGeometry(60, 2 * CAR_HZ + 0.2), glowMat(0xFFFFFF, 0.8, laneTex));
    road.rotation.x = -Math.PI / 2; road.position.set(pc.x, top + 0.02, lane.z);
    levelGroup.add(road);
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
  levelGroup.add(line);
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
  for (const sx of [-1, 1]) {
    const rail = new Mesh(new BoxGeometry(0.06, 0.05, len), new MeshBasicMaterial({ color: 0x5FE8FF, toneMapped: false }));
    rail.position.set(pc.x + sx * 0.3, pc.y - TRAIN_H - 1.8 - 0.25, (zA + zB) / 2);
    levelGroup.add(rail);
  }
  c.train = { pull: pc.pull, model, beacons, warned: false };
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
  curtains.push({ ...pc, mat, flash: 0 });
}
function buildLock(pc) {
  const H = 1.8, w = pc.w + 0.3;
  const mat = glowMat(TINTS[pc.col], 0.75, fieldTex.clone());
  mat.map.repeat.set(w / 1.2, H / 1.2); mat.side = DoubleSide;
  const wall = new Mesh(new PlaneGeometry(w, H), mat);
  wall.position.set(pc.x, pc.y + H / 2, pc.z);
  const frame = new MeshBasicMaterial({ color: TINTS[pc.col], toneMapped: false });
  for (const [sx, sy, px, py] of [[w, 0.08, 0, H], [0.08, H, -w / 2, H / 2], [0.08, H, w / 2, H / 2]]) {
    const b = new Mesh(new BoxGeometry(sx, sy, 0.1), frame);
    b.position.set(pc.x + px, pc.y + py, pc.z);
    levelGroup.add(b);
  }
  levelGroup.add(wall);
  const q = new Quaternion();
  locks.push({ mesh: wall, mat, pos: new Vector3(pc.x, pc.y + H / 2, pc.z), prev: new Vector3(), quat: q, inv: q.clone().invert(),
               half: new Vector3(w / 2, H / 2, 0.12), delta: new Vector3(), ferry: null, lock: pc.col, flash: 0, buzzT: 0, z: pc.z });
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
  loopsIn.push(L);
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
  for (const c of colliders) if (c.obstacle) new Set(c.mesh.material).forEach((m) => m.dispose());
  scene.remove(grp);
  grp.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && !Array.isArray(o.material)) o.material.dispose();
  });
}
function enterPocket(W) {
  pocket = { colliders, ferries, holos, pads, crossings, riders, curtains, locks, wormholes, loopsIn, mags, winds, rounds, tubes, switches, scans, posts, blinkers, gates, goal, level, levelGroup,
             world: world.name, from: W };
  levelGroup.visible = false;
  const P = W.pc.pocket;
  levelGroup = new Group(); scene.add(levelGroup);
  colliders = []; ferries = []; holos = []; pads = []; crossings = []; riders = []; curtains = []; locks = []; wormholes = []; loopsIn = []; mags = []; winds = []; rounds = []; tubes = []; switches = []; scans = []; posts = []; blinkers = []; gates = [];
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
  ({ colliders, ferries, holos, pads, crossings, riders, curtains, locks, wormholes, loopsIn, mags, winds, rounds, tubes, switches, scans, posts, blinkers, gates, goal, level, levelGroup } = S);
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
    const Z = X.w / 2 + CAR_HX + R, mid = lane.len / 2;
    for (let i = 0; i < lane.at.length; i++) {
      const s = carS(lane, i, t);
      if (s > mid - Z - lane.speed * CROSS_WARN && s < mid + Z) return false;
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
    for (const car of X.cars) car.mesh.position.set(car.x, X.top + CAR_LIFT, car.lane.z);
    for (const L of X.lights) {
      const col = X.green ? 0x3DFF8A : 0xFF2D48;
      L.lamp.material.color.setHex(col); L.halo.material.color.setHex(col);
    }
  }
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
  if (pc.t === 'block') { buildBlock(pc); return; }
  if (pc.t === 'gauntlet') return;
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

function loadLevel(n) {
  if (pocket) { freeCourse(levelGroup); levelGroup = pocket.levelGroup; ({ holos, pads, ferries, locks, mags, switches } = pocket); pocket = null; }
  levelNo = Math.max(1, Math.min(LEVELS.length, n));
  level = LEVELS[levelNo - 1];
  if (levelGroup) {
    for (const c of holos) for (const m of c.holoMats) m.dispose();
    for (const c of pads) if (c.padFx.tex) c.padFx.tex.dispose();
    for (const c of ferries) if (c.train) for (const t of c.train.model.userData.maps) t.dispose();
    for (const c of locks) c.mat.map.dispose();
    for (const c of mags) c.magFx.tex.dispose();
    for (const S of switches) if (S.top) { S.top.dispose(); S.side.dispose(); }
    for (const c of colliders) if (c.obstacle) new Set(c.mesh.material).forEach((m) => m.dispose());
    scene.remove(levelGroup);
    levelGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      // Stone is shared across levels; each ring owns its materials.
      if (o.material && !Array.isArray(o.material)) o.material.dispose();
    });
  }
  levelGroup = new Group();
  scene.add(levelGroup);
  colliders = []; ferries = []; holos = []; pads = []; crossings = []; riders = []; curtains = []; locks = []; wormholes = []; loopsIn = []; mags = []; winds = []; rounds = []; tubes = []; switches = []; scans = []; posts = []; blinkers = []; gates = [];
  for (const pc of level.pieces) buildPiece(pc);
  if (world.name !== 'void') setWorld(world.name);   // scenery that follows the course is rebuilt for it
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
  ball.grounded = true; ball.onFerry = null; ball.airT = 0; ball.boostT = 0; ball.jumpCD = 0; ball.hitT = 0; ball.onLoop = null; ball.onRound = null; ball.tube = null;
  setTint(0); spawnTint = 0; loopView = 0; loopAt = null;
  lastGroundY = sy;
  clock = 0; falls = 0; started = false;
  setState('play');
  updateCamera(0, true);
  save.level = levelNo; persist();
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

const ball = { p: new Vector3(), v: new Vector3(), spin: new Vector3(), grounded: false,
               onFerry: null, airT: 0, pad: null, boostT: 0, jumpCD: 0, onBoost: false, hitT: 0, tint: 0, onLoop: null, mag: 0, push: 0, onRound: null, tube: null };
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
  const floor = _N.y > 0.55;
  const rel = ball.v.dot(_N) - (c.ferry ? c.delta.dot(_N) / dt : 0);
  if (rel < 0) {
    const e = floor ? (rel < -7 ? 0.25 : 0) : 0.35;
    ball.v.addScaledVector(_N, -(1 + e) * rel);
    if (floor && rel < -4 && ball.airT > 0.12) { play('land'); shake = Math.max(shake, 0.12); }
    else if (c.lock) { if (!c.buzzT) { sound('buzz'); c.buzzT = 0.35; } c.flash = 1; }
    else if (c.obstacle && !floor) { if (rel < -1.2 && simT - knockT > 0.12) { knockT = simT; sound('knock'); } }
    else if (!floor && rel < -3) play('tick');
  }
  if (floor) { ball.grounded = true; if (c.ferry) ball.onFerry = c; if (c.pad) ball.pad = c.pad; if (c.mag) ball.mag = c.mag; }
}

function step(dt, ix, iz) {
  simT += dt;
  for (const c of ferries) updateFerry(c, simT);
  if (ball.tube) { rideTube(dt); for (const c of crossings) crossStep(c, simT); return; }   // in a tube, the tube steers
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
  if (ball.grounded) ball.spin.set(ball.v.z, 0, -ball.v.x).multiplyScalar(1 / R);
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
  ball.v.set(0, 0, 0); ball.onFerry = null; ball.boostT = 0; ball.hitT = 0;
  setState('home');
  if (REDUCED) arrive();
}
function arrive() {
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
function startGoal() {
  setState('goal');
  ball.v.set(0, 0, 0);
  goal.t0 = performance.now();
  sound('win');
  burst(goal.pos.x, goal.pos.y + 1.3, goal.pos.z, 0xFFD23F, 56, 6);
  burst(goal.pos.x, goal.pos.y + 1.3, goal.pos.z, 0xFFFFFF, 22, 5);
  const best = save.best[levelNo];
  if (!best || clock < best) save.best[levelNo] = clock;
  lastWasBest = !best || clock < best;
  lastStar = clock < STAR_TIMES[levelNo - 1];
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
  T().levelRestart(levelNo);
  if (state === 'play' || state === 'fall' || state === 'home') flyTo(startPos);
  else loadLevel(levelNo);
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
  animateBlocks();
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
let loopView = 0, loopAt = null, tubeView = 0;
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
    else if (state === 'win') { play('start'); loadLevel(levelNo >= LEVELS.length ? 1 : levelNo + 1); }
  }
}

// ---------- HUD ----------
const L = { hit: {}, cardBody: null };
const SEP = '   ·   ';
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
  const lv = 'LEVEL ' + levelNo, tm = fmt(clock), fl = 'FALLS ' + falls, starT = STAR_TIMES[levelNo - 1], sT = fmt(starT);
  const forms = [[lv, { t: 'TIME ' + tm, s: sT }, fl], [lv, { t: tm, s: sT }, fl], [lv, { t: tm, s: sT }], [lv, tm]];
  ctx.font = '600 16px Inter, sans-serif';
  const sepW = ctx.measureText(SEP).width;
  const segW = (g) => (typeof g === 'string' ? ctx.measureText(g).width : ctx.measureText(g.t).width + 11 + STAR_W + 5 + ctx.measureText(g.s).width);
  const width = (f) => f.reduce((a, g, i) => a + segW(g) + (i ? sepW : 0), 0);
  let form = forms[forms.length - 1];
  for (const f of forms) if (width(f) <= room) { form = f; break; }
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = TOK.ink72;
  let x = x0;
  const have = !!save.stars[levelNo], still = clock < starT;
  form.forEach((g, i) => {
    if (i) { ctx.fillText(SEP, x, ly); x += sepW; }
    if (typeof g === 'string') { ctx.fillText(g, x, ly); x += segW(g); return; }
    ctx.fillText(g.t, x, ly);
    const sx = x + ctx.measureText(g.t).width + 11;
    drawStarIcon(sx + STAR_W / 2, ly - 1, STAR_W / 2, have, have || still ? TOK.accent2 : TOK.tint40);
    ctx.fillStyle = TOK.ink72; ctx.fillText(g.s, sx + STAR_W + 5, ly);          // the time stays readable; the star greys
    x += segW(g);
  });
  const txt = form.map((g) => (typeof g === 'string' ? g : g.t + ' *' + g.s)).join(SEP);
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
};
const POCKET_NEWS = { crystal: 'The crystal canyon: the road is slippery. Brake early' };
function drawNews() {
  const t = pocket ? POCKET_NEWS[level.world] : NEWS[levelNo];
  if (!t || state !== 'play' || ball.p.z < -12) return;
  const pad = MODE === 'mobile' ? PHONE_PAD : SIDE_PAD;
  const lines = wrapText(t, LW - 2 * pad - 36, 16);
  ctx.font = '600 16px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 28, h = lines.length * 22 + 14;
  const cy = topBand() + 22 + h / 2;
  UI.roundRectPath(ctx, LW / 2 - w / 2, cy - h / 2, w, h, 15);
  ctx.fillStyle = 'rgba(10,16,28,0.72)'; ctx.fill();
  ctx.fillStyle = TOK.ink92;
  lines.forEach((l, i) => ctx.fillText(l, LW / 2, cy + (i - (lines.length - 1) / 2) * 22 + 1));
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  L.news = { x: LW / 2 - w / 2, y: cy - h / 2, w, h, lines };
}

// ---------- CARDS (DESIGN-SYSTEM 5, drawn as Comb draws them) ----------
const RULES = [
  'Drag anywhere to roll the marble. The further you drag, the harder it rolls. On a computer the arrow keys work too.',
  'Roll through the orange ring at the end of the course to finish the level.',
  'Blue rings save your place. Roll through one and it turns green.',
  'Each level has a star time, shown by the star at the bottom. Finish under it to win the level\'s star.',
  'Where the road splits, the narrow way is quicker and the wide way is safer. Both lead on.',
  'Roll off the edge and the marble flies back to the last green ring. The fall is counted, and nothing else is lost.',
  'Bollards, road barriers and cargo crates are solid. Steer through the gaps: a hard knock near the edge can throw the marble off the road.',
  'A dark road cannot be crossed. Follow the line of lamps down the side road to its switch and roll over it: the road lights up.',
  'Flying cars cross some roads. Wait at the line for the green light, then roll across.',
  'Some pads move. Wait for one to line up with the path, roll on, and ride it across.',
  'A wormhole takes the marble to the crystal canyon, where the road is slippery. Cross it to come out on the far side.',
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
    for (const r of RULES) { const lines = wrapText(r, pw - 100, 16); items.push({ t: 'rule', lines, h: lines.length * 22 + 13 }); }
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
      ctx.fillText('Level ' + levelNo + ' of ' + LEVELS.length, mid, yy + 22);
      ctx.fillStyle = TOK.text; ctx.font = '800 34px Inter, sans-serif';
      ctx.fillText(fmt(clock), mid, yy + 64);
      ctx.fillStyle = TOK.ink82; ctx.font = '600 16px Inter, sans-serif';
      ctx.fillText(lastWasBest ? 'Your best time' : 'Best ' + fmt(best || clock), mid, yy + 92);
      // The star: this run's, or the one already won, or the time to beat for it.
      const st = STAR_TIMES[levelNo - 1], have = !!save.stars[levelNo];
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
  const g = mesh.geometry, pos = g.attributes.position, uv = g.attributes.uv, top = g.groups[2];
  const hx = g.parameters.width / 2, hz = g.parameters.depth / 2;
  for (let i = top.start; i < top.start + top.count; i++) {
    if (perPiece) uv.setXY(i, (pos.getX(i) / hx + 1) / 2, (pos.getZ(i) / hz + 1) / 2);
    else uv.setXY(i, pos.getX(i) / 2, pos.getZ(i) / 2);
  }
  uv.needsUpdate = true;
}
function restoreCourse() {
  for (const c of colliders) {
    if (c.obstacle) continue;
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
      if (seen.has(m)) continue;
      seen.add(m);
      for (const t of [m.map, m.emissiveMap]) if (t && t.isCanvasTexture && t !== dot) t.dispose();
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
  // Chrome, so the neon city runs across it.
  chrome() { marble.material = new MeshStandardMaterial({ color: 0xFFFFFF, metalness: 1, roughness: 0.05, envMap: neonEnvMap() || envTex, envMapIntensity: 1.4 }); },
  // Faceted, like everything in the low-poly valley.
  faceted() {
    marble.geometry = new IcosahedronGeometry(R, 1);
    marble.material = new MeshStandardMaterial({ color: 0xFF6B3D, roughness: 0.5, flatShading: true });
  },
};
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
      const x = span[0] - 4 + r() * (span[1] - span[0] + 8);
      d0.set((r() - 0.5) * 0.3, 1, (r() - 0.5) * 0.3).normalize();
      cluster(x, -40 + r() * 6, z + (r() - 0.5) * 3, d0, 10 + r() * 14, huesFor(), 2 + Math.floor(r() * 2));
    }
  }
  // Beside the road: clusters rising from below with their tips under the road's
  // level, so they line the way and can never stand in front of it.
  span = null;
  for (let z = 14; z > end - 6; z -= 3.2) {
    span = reach(z + 1.5, z - 1.5);
    if (!span) continue;
    for (const sd of [-1, 1]) {
      if (r() < 0.35) continue;
      const edge = sd < 0 ? span[0] : span[1], size = 3 + r() * 4, lean = 0.1 + r() * 0.35;
      d0.set(sd * Math.sin(lean), Math.cos(lean), (r() - 0.5) * 0.3).normalize();
      cluster(edge + sd * (1.6 + r() * 2), -1.4 - size * 1.05, z + (r() - 0.5) * 1.5, d0, size, huesFor(), 1 + Math.floor(r() * 2));
    }
  }
  const crystalMat = tintedGlow(new MeshStandardMaterial({ color: 0x0C0B08, roughness: 0.18, metalness: 0.45, envMap: env, envMapIntensity: 1.2,
    emissive: 0xFFFFFF, emissiveMap: crystalEdgeTex(), emissiveIntensity: 1.55, flatShading: true }), 'canyon-crystals');
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
  let t = 0;
  w.tick = (dt) => {
    if (REDUCED) return;
    t += dt;
    const a = moteGeo.attributes.position.array;
    for (let i = 0; i < nMotes; i++) { a[i * 3 + 1] += dt * (0.3 + (i % 7) * 0.07); a[i * 3] += Math.sin(t * 0.7 + i) * dt * 0.15; if (a[i * 3 + 1] > 2) a[i * 3 + 1] = -40; }
    moteGeo.attributes.position.needsUpdate = true;
    flow.offset.y -= dt * 0.1;
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
function neonGrid(core, halo, haloCol) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
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
    if (c.power) {
      const S = c.power;
      if (S.top) { S.top.dispose(); S.side.dispose(); }
      S.top = M.top.clone(); S.side = M.side.clone(); S.top0 = M.top.emissiveIntensity; S.side0 = M.side.emissiveIntensity;
      c.mesh.material = [S.side, S.side, S.top, M.under, S.side, S.side]; setTopUV(c.mesh, false);
      continue;
    }
    const [side, top] = c.ferry ? [M.ferrySide, M.ferryTop] : c.pad ? [M.padSide, M.padTop] : c.mag ? [M.magSide, M.padTop]
      : c.lane ? [M.laneSide[c.lane], M.laneTop[c.lane]] : [M.side, M.top];
    c.mesh.material = [side, side, top, M.under, side, side]; setTopUV(c.mesh, false);
  }
  return neonStyle;
}
function neonMaterials(style) {
  const under = new MeshStandardMaterial({ color: 0x080C16, roughness: 1 });
  let top, side;
  if (style === 'glowgrid') {
    top = new MeshStandardMaterial({ color: 0x0A0F1E, metalness: 0.4, roughness: 0.3, emissive: 0xFFFFFF,
      emissiveMap: neonGrid(3, 7, 'rgba(255,60,210,0.95)'), emissiveIntensity: 1.5 });
    side = new MeshStandardMaterial({ color: 0x140A24, metalness: 0.5, roughness: 0.3, emissive: 0xFF3FD0, emissiveIntensity: 0.3 });
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
      emissiveMap: neonGrid(3, 7, 'rgba(80,180,255,0.95)'), emissiveIntensity: 1.3 }),
    ferrySide: new MeshStandardMaterial({ color: 0x0C1830, metalness: 0.5, roughness: 0.3, emissive: 0x5FB8FF, emissiveIntensity: 0.35 }),
    padTop: new MeshStandardMaterial({ color: 0x0A0F1E, metalness: 0.4, roughness: 0.3 }),
    padSide: new MeshStandardMaterial({ color: 0x1C1606, metalness: 0.5, roughness: 0.3, emissive: PAD_YELLOW, emissiveIntensity: 0.45 }),
    magSide: new MeshStandardMaterial({ color: 0x06141C, metalness: 0.5, roughness: 0.3, emissive: 0x34E0FF, emissiveIntensity: 0.45 }),
    // A lane of a colour lock glows in the colour its curtain gives.
    laneTop: [null, 'rgba(150,255,60,0.95)', 'rgba(150,100,255,0.95)'].map((halo) => halo && new MeshStandardMaterial({
      color: 0x0A0F1E, metalness: 0.4, roughness: 0.3, emissive: 0xFFFFFF, emissiveMap: neonGrid(3, 7, halo), emissiveIntensity: 1.4 })),
    laneSide: [null, 0xA8FF3E, 0x9D6BFF].map((col) => col && new MeshStandardMaterial({
      color: 0x10131C, metalness: 0.5, roughness: 0.3, emissive: col, emissiveIntensity: 0.4 })),
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

// ---------- LOOP ----------
let last = performance.now(), frames = 0, frameMs = 16.7, simHold = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  frameMs += ((now - last) - frameMs) * 0.05;
  last = now; frames++;
  if (renderer) {
    if (!simHold) update(dt, now);
    renderer.render(scene, camera);
  }
  drawHUD(now);
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
  const [h, v] = location.hash.slice(1).split('-');
  if (h === 'level') {                                  // #level-17 opens course 17, to look at one
    const n = parseInt(v, 10);
    if (n >= 1 && n <= LEVELS.length) loadLevel(n);
    if (world.name === 'neon') return;
  }
  const name = h && h !== 'level' ? h : 'neon';
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
                    gates: gates.map((g) => g.passed), frames, frameMs: +frameMs.toFixed(1) }),
    reach: (n) => loadLevel(n),
    tint: () => ball.tint,
    simT: () => +simT.toFixed(3),
    holos: () => holos.map((c) => { const h = holoState(c.holo, simT); return { lit: h.lit, t: +h.t.toFixed(3), left: +h.left.toFixed(3) }; }),
    switches: () => switches.map((S) => ({ on: S.on, x: S.pc.x, z: S.pc.z })),
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
    closeup: (on) => {
      closeup = !!on;
      camera.fov = on ? 30 : camParams().fov; camera.updateProjectionMatrix();
      return closeup;
    },
  };
}
