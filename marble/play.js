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
  RoomEnvironment, InstancedMesh, Matrix4,
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
};
// The city's version of a sound where it has one, the house sound elsewhere.
function sound(name) {
  if (world.name === 'neon' && NEON_SOUNDS[name]) { if (sfx && sfx.isOn()) NEON_SOUNDS[name](); }
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
  citySound = { ac, pg, tg, tp };
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
}

// ---------- ANALYTICS ----------
const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){}, levelRestart(){}, hintUsed(){} };
const T = () => (window.ZAM_TRACK || NOOP);
T().init('marble');

// ---------- SAVE ----------
const SAVE_KEY = 'zamborin-marble.v1';
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.level) return s; } catch (_) {}
  return { level: 1, best: {} };
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
   pad that swings along x or z; at each end of its swing it sits flush with
   the stone it serves. Tops meet exactly, or the marble clips a seam. */
const THICK = 0.6;
const F = (x, z, w, d, y = 0) => ({ t: 'flat', x, z, w, d, y });
const RAMP = (x, z0, z1, w, y0, y1) => ({ t: 'ramp', x, z0, z1, w, y0, y1 });
const FERRY = (x, z, w, d, y, axis, amp, period, phase = 0) => ({ t: 'ferry', x, z, w, d, y, axis, amp, period, phase });

const LEVELS = [
  { // 1. Steer, turn right, a narrow bridge.
    start: [0, 0, 1], gates: [[4.8, 0, -19.5]], goal: [4.8, 0, -37.2],
    pieces: [F(0, 0, 5, 5), F(0, -7, 3.2, 9), F(2.4, -13.1, 8, 3.2), F(4.8, -19.7, 3.2, 10),
             F(4.8, -28.7, 1.8, 8), F(4.8, -36.7, 6, 8)],
  },
  { // 2. Down a ramp, across a sliding pad, and up again.
    start: [0, 0, 1], gates: [[0, -2.5, -14], [0, -2.5, -22.8]], goal: [0, 0, -36.3],
    pieces: [F(0, 0, 5, 5), RAMP(0, -2.5, -10.5, 3.2, 0, -2.5), F(0, -13.5, 4, 6, -2.5),
             FERRY(0, -18.25, 3.6, 3.5, -2.5, 'x', 3, 5.5), F(0, -22.5, 4, 5, -2.5),
             RAMP(0, -25, -33, 3.2, -2.5, 0), F(0, -36, 6, 6)],
  },
  { // 3. Narrow planks, and a ferry across a gap.
    start: [0, 0, 1], gates: [[5.2, 0, -16], [5.2, 0, -34.1]], goal: [5.2, 0, -48.2],
    pieces: [F(0, 0, 5, 5), F(0, -5.5, 1.6, 6), F(2.6, -9.3, 6.8, 1.6), F(5.2, -14.6, 1.6, 9),
             F(5.2, -21.1, 4, 4), FERRY(5.2, -27.6, 3, 3, 0, 'z', 3, 6, Math.PI / 2),
             F(5.2, -34.1, 4, 4), F(5.2, -40.1, 1.6, 8), F(5.2, -47.6, 6, 7)],
  },
];

let levelGroup = null;
let colliders = [], ferries = [], gates = [], goal = null, level = null;

function platformGeometry(w, h, d) {
  const g = new RoundedBoxGeometry(w, h, d, 3, Math.min(0.14, h / 2 - 0.01));
  // The top takes world-scale UVs, one tile to a metre, so a long plank and a
  // square pad show the same tile. Group 2 is the +y face.
  const pos = g.attributes.position, uv = g.attributes.uv, top = g.groups[2];
  for (let i = top.start; i < top.start + top.count; i++) uv.setXY(i, pos.getX(i) / 2, pos.getZ(i) / 2);
  uv.needsUpdate = true;
  return g;
}

function buildPiece(pc) {
  const h = THICK, quat = new Quaternion(), center = new Vector3();
  let w = pc.w, d = pc.d;
  if (pc.t === 'ramp') {
    const len = pc.z0 - pc.z1, dy = pc.y1 - pc.y0;
    d = Math.hypot(len, dy);
    quat.setFromEuler(new Euler(Math.atan2(dy, len), 0, 0));
    const up = new Vector3(0, 1, 0).applyQuaternion(quat);
    center.set(pc.x, (pc.y0 + pc.y1) / 2, (pc.z0 + pc.z1) / 2).addScaledVector(up, -h / 2);
  } else {
    center.set(pc.x, pc.y - h / 2, pc.z);
  }
  const isFerry = pc.t === 'ferry';
  const mesh = new Mesh(platformGeometry(w, h, d), faceMats(isFerry ? ferryStone : stone));
  mesh.position.copy(center); mesh.quaternion.copy(quat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  levelGroup.add(mesh);
  const c = { mesh, pos: center.clone(), prev: center.clone(), quat, inv: quat.clone().invert(),
              half: new Vector3(w / 2, h / 2, d / 2), delta: new Vector3(), ferry: null };
  if (isFerry) {
    c.ferry = { base: center.clone(), axis: pc.axis, amp: pc.amp, period: pc.period, phase: pc.phase };
    ferries.push(c);
  }
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
  levelNo = Math.max(1, Math.min(LEVELS.length, n));
  level = LEVELS[levelNo - 1];
  if (levelGroup) {
    scene.remove(levelGroup);
    levelGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      // Stone is shared across levels; each ring owns its materials.
      if (o.material && !Array.isArray(o.material)) o.material.dispose();
    });
  }
  levelGroup = new Group();
  scene.add(levelGroup);
  colliders = []; ferries = []; gates = [];
  for (const pc of level.pieces) buildPiece(pc);
  if (world.name !== 'void') setWorld(world.name);   // scenery that follows the course is rebuilt for it
  level.minTop = Math.min(...level.pieces.map((p) => (p.t === 'ramp' ? Math.min(p.y0, p.y1) : p.y)));
  for (const [x, y, z] of level.gates) gates.push(makeRing(x, y, z, false));
  goal = makeRing(level.goal[0], level.goal[1], level.goal[2], true);
  simT = 0;
  for (const c of ferries) updateFerry(c, 0);
  const [sx, sy, sz] = level.start;
  startPos.set(sx, sy + R + 0.01, sz);
  spawn.copy(startPos);
  ball.p.copy(startPos); ball.v.set(0, 0, 0); ball.spin.set(0, 0, 0);
  ball.grounded = true; ball.onFerry = null; ball.airT = 0;
  lastGroundY = sy;
  clock = 0; falls = 0; started = false;
  setState('play');
  updateCamera(0, true);
  save.level = levelNo; persist();
  T().levelStart(levelNo);
}

function updateFerry(c, t) {
  const f = c.ferry;
  c.prev.copy(c.pos);
  c.pos.copy(f.base);
  c.pos[f.axis] += f.amp * Math.sin(2 * Math.PI * t / f.period + f.phase);
  c.delta.subVectors(c.pos, c.prev);
  c.mesh.position.copy(c.pos);
}

// ---------- THE MARBLE ----------
const G = 22;              // gravity, a little over twice Earth's: a marble this size feels floaty at 9.8
const ACC_GROUND = 18, ACC_AIR = 6;
const DAMP_GROUND = 1.6, DAMP_AIR = 0.12;   // per second; enough grip to hold a 1.6 m plank
const VMAX = 8;            // horizontal speed cap, metres per second
const STEP = 1 / 240;      // physics runs at 240 Hz whatever the display does

const ball = { p: new Vector3(), v: new Vector3(), spin: new Vector3(), grounded: false,
               onFerry: null, airT: 0 };
const startPos = new Vector3(), spawn = new Vector3();
let lastGroundY = 0, simT = 0, acc = 0;

const _L = new Vector3(), _Q = new Vector3(), _N = new Vector3(), _q = new Quaternion(), _ax = new Vector3();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* Sphere against a box, in the box's own frame where it is axis-aligned: the
   closest point of the box to the marble's centre, and out along the line
   between them. A ramp is just a box turned about x. */
function collide(c, dt) {
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
    else if (!floor && rel < -3) play('tick');
  }
  if (floor) { ball.grounded = true; if (c.ferry) ball.onFerry = c; }
}

function step(dt, ix, iz) {
  simT += dt;
  for (const c of ferries) updateFerry(c, simT);
  if (ball.onFerry) ball.p.add(ball.onFerry.delta);      // a pad carries what rests on it
  const a = ball.grounded ? ACC_GROUND : ACC_AIR;
  ball.v.x += ix * a * dt; ball.v.z += iz * a * dt;
  ball.v.y = Math.max(-30, ball.v.y - G * dt);
  const k = Math.exp(-(ball.grounded ? DAMP_GROUND : DAMP_AIR) * dt);
  ball.v.x *= k; ball.v.z *= k;
  const hs = Math.hypot(ball.v.x, ball.v.z);
  if (hs > VMAX) { ball.v.x *= VMAX / hs; ball.v.z *= VMAX / hs; }
  ball.p.addScaledVector(ball.v, dt);
  ball.grounded = false; ball.onFerry = null;
  for (const c of colliders) collide(c, dt);
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
  ball.v.set(0, 0, 0); ball.onFerry = null;
  setState('home');
  if (REDUCED) arrive();
}
function arrive() {
  ball.p.copy(flight.to); ball.v.set(0, 0, 0);
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
  sound('unlock');
  burst(g.pos.x, g.pos.y + 1.1, g.pos.z, 0x5DD39E, 26, 4);
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
  save.level = Math.min(LEVELS.length, levelNo + 1);
  persist();
  T().levelComplete(levelNo);
}
let lastWasBest = false;

function restartLevel() {
  for (const g of gates) {
    g.passed = false; g.t0 = 0; g.ring.scale.setScalar(1);
    g.mat.color.setHex(gateColour()); g.mat.emissive.setHex(gateColour()); g.mat.emissiveIntensity = 0.35;
    g.discMat.color.setHex(gateColour()); g.discMat.opacity = 0.13;
  }
  clock = 0; falls = 0; started = false;
  spawn.copy(startPos);
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
    else { simT += STEP; for (const c of ferries) updateFerry(c, simT); }
  }

  if (state === 'play') {
    for (const g of gates) if (!g.passed && crossed(g, 2.2)) passGate(g);
    if (crossed(goal, 3.2)) startGoal();
    else if (ball.p.y < level.minTop - 2.2) startFall();
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
  }
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
let camY = 0, closeup = false, peekCam = null;
const cityRefs = { frozen: false };                   // the harness's handles on the city, for stills
function updateCamera(dt, snap) {
  const P = camParams();
  const k = snap ? 1 : 1 - Math.exp(-5 * dt);
  camFocus.x += (ball.p.x - camFocus.x) * k;
  camFocus.z += (ball.p.z - camFocus.z) * k;
  // Height follows the ground the marble last stood on, so a fall drops away
  // from the camera instead of dragging it down into the void.
  const ty = state === 'home' ? flight.to.y - R : state === 'fall' ? camY : lastGroundY;
  camY += (ty - camY) * (snap ? 1 : 1 - Math.exp(-3 * dt));
  let sx = 0, sy = 0;
  if (shake > 0) {
    shake = Math.max(0, shake - dt);
    if (!REDUCED) { sx = (Math.random() - 0.5) * shake * 0.3; sy = (Math.random() - 0.5) * shake * 0.3; }
  }
  camera.position.set(camFocus.x + sx, camY + P.h + sy, camFocus.z + P.back);
  camera.lookAt(camFocus.x + sx, camY, camFocus.z - P.ahead);
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

function readInput() {
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
function drawReadout() {
  const phone = MODE === 'mobile', ly = LH - botBand() / 2, x0 = phone ? PHONE_PAD : SIDE_PAD;
  const room = phone ? LW - PHONE_PAD * 2 - 44 - 8 : LW - SIDE_PAD * 2;
  const lv = 'LEVEL ' + levelNo, tm = fmt(clock);
  const forms = [lv + SEP + 'TIME ' + tm + SEP + 'FALLS ' + falls, lv + SEP + tm + SEP + 'FALLS ' + falls, lv + SEP + tm];
  ctx.font = '600 16px Inter, sans-serif';
  let txt = forms[forms.length - 1];
  for (const f of forms) if (ctx.measureText(f).width <= room) { txt = f; break; }
  ctx.fillStyle = TOK.ink72; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, x0, ly);
  L.readout = { text: txt, x: x0, w: ctx.measureText(txt).width };
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

// ---------- CARDS (DESIGN-SYSTEM 5, drawn as Comb draws them) ----------
const RULES = [
  'Drag anywhere to roll the marble. The further you drag, the harder it rolls. On a computer the arrow keys work too.',
  'Roll through the orange ring at the end of the course to finish the level.',
  'Blue rings save your place. Roll through one and it turns green.',
  'Roll off the edge and the marble flies back to the last green ring. The fall is counted, and nothing else is lost.',
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
  } else items.push({ t: 'won', h: 96 });
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
      : last ? 'That was the last of the three courses.'
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

function drawHUD(now) {
  const s = hud.width / LW;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, LW, LH);
  L.hit = {};
  if (!renderer) { drawNoWorld(); return; }
  drawScrims();
  L.ghost = null;
  drawGhost(now);
  drawStick();
  drawControls();
  drawReadout();
  L.cardBody = null;
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
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

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
    if (c.deco) { for (const d of c.deco) c.mesh.remove(d); c.deco = []; }
    c.mesh.material = faceMats(c.ferry ? ferryStone : stone); setTopUV(c.mesh, false);
  }
}

function setWorld(name) {
  if (world.group) scene.remove(world.group);
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
    if (c.ferry) continue;
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
  w.restyle = () => { for (const c of colliders) if (!c.ferry) c.mesh.material = faceMats(lagoonStone); };
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
  // An amethyst: violet glass with a faceted crystal glowing at its heart.
  amethyst() {
    marble.material = new MeshPhysicalMaterial({ color: 0xF2D2FF, transmission: 1, thickness: 0.8, ior: 1.54, roughness: 0.05,
      attenuationColor: new Color(0xA040F0), attenuationDistance: 0.55, clearcoat: 1, envMap: envTex, envMapIntensity: 1.4 });
    skinParts.add(new Mesh(new IcosahedronGeometry(R * 0.42, 0), new MeshStandardMaterial({
      color: 0xFF8AEA, emissive: 0xFF3FD0, emissiveIntensity: 1.9, flatShading: true })));
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
  goal.mat.color.setHex(goalCol); goal.mat.emissive.setHex(goalCol); goal.discMat.color.setHex(goalCol);
}
const gateColour = () => (world.rings ? world.rings[0] : 0xFFFFFF);
// Things fixed to a course piece ride with it, ferries included.
function addDeco(c, obj) { (c.deco || (c.deco = [])).push(obj); c.mesh.add(obj); }
const HIDDEN = new MeshBasicMaterial({ visible: false });

// ---- 1. Crystal canyon at night: slate with glowing runes, pink crystals, an amethyst marble ----
function glyph(g, x, y, k) {
  g.beginPath();
  if (k === 0) g.arc(x, y, 7, 0, Math.PI * 2);
  else if (k === 1) { g.moveTo(x - 7, y - 7); g.lineTo(x + 7, y + 7); g.moveTo(x + 7, y - 7); g.lineTo(x - 7, y + 7); }
  else if (k === 2) for (let a = 0; a < 3; a++) { g.moveTo(x - 7, y - 6 + a * 6); g.lineTo(x + 7, y - 6 + a * 6); }
  else if (k === 3) { g.arc(x, y, 7, 0.4, Math.PI * 1.7); g.moveTo(x, y); g.lineTo(x + 6, y - 4); }
  else { g.moveTo(x, y - 8); g.lineTo(x + 7, y + 6); g.lineTo(x - 7, y + 6); g.closePath(); }
  g.stroke();
}
function runeTop(len, seed) {
  const H = 1024, r = seeded(seed);
  const map = canvasTex(256, H, (g) => {
    g.fillStyle = '#2A3850'; g.fillRect(0, 0, 256, H);
    for (let i = 0; i < 70; i++) {
      const x = r() * 256, y = r() * H, rad = 20 + r() * 60;
      const rg = g.createRadialGradient(x, y, 0, x, y, rad);
      rg.addColorStop(0, r() < 0.5 ? 'rgba(70,96,130,0.35)' : 'rgba(20,30,48,0.35)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.fillStyle = 'rgba(8,14,26,0.7)'; g.fillRect(30, 0, 3, H); g.fillRect(223, 0, 3, H);
  });
  const glow = canvasTex(256, H, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, H);
    g.strokeStyle = '#FFF'; g.lineWidth = 3; g.lineCap = 'round';
    const n = Math.max(3, Math.round(len * 1.3));
    for (let i = 0; i < n; i++) {
      const y = (i + 0.5) * H / n;
      glyph(g, 15, y, (i * 3) % 5); glyph(g, 241, y, (i * 3 + 2) % 5);
    }
  });
  return new MeshStandardMaterial({ map, roughness: 0.8, emissive: new Color(0x54E0FF), emissiveMap: glow, emissiveIntensity: 1.4 });
}
const crystalMat = new MeshStandardMaterial({ color: 0xFFB8F2, emissive: 0xFF3FD0, emissiveIntensity: 1.1, roughness: 0.25, flatShading: true });
function crystal(h, rad) {
  const g = new Group();
  const body = new Mesh(new CylinderGeometry(rad, rad * 0.9, h, 6), crystalMat); body.position.y = h / 2; g.add(body);
  const tip = new Mesh(new ConeGeometry(rad, rad * 1.8, 6), crystalMat); tip.position.y = h + rad * 0.9; g.add(tip);
  return g;
}
function cluster(G, x, y, z, s, seed) {
  const r = seeded(seed), c = new Group();
  for (let i = 0; i < 6; i++) {
    const k = crystal((1.2 + r() * 2.4) * s, (0.22 + r() * 0.2) * s);
    k.rotation.set((r() - 0.5) * 1.2, r() * 6, (r() - 0.5) * 1.2);
    k.position.set((r() - 0.5) * s, 0, (r() - 0.5) * s);
    c.add(k);
  }
  const halo = new Sprite(new SpriteMaterial({ map: dot, color: 0xFF4FD8, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false }));
  halo.scale.set(2.6 * s, 2.6 * s, 1); halo.position.y = 1.3 * s; halo.material.opacity = 0.45; c.add(halo);
  const base = new Mesh(new IcosahedronGeometry(1, 0), new MeshStandardMaterial({ color: 0x2C4460, roughness: 0.95, flatShading: true }));
  base.scale.set(1.3 * s, 0.7 * s, 1.3 * s); base.position.y = -0.2 * s; c.add(base);
  c.position.set(x, y, z); G.add(c);
}
WORLDS_ADD('crystal', (w) => {
  scene.background = gradientTex([[0, '#070F24'], [0.5, '#0C1E3C'], [1, '#101832']]);
  scene.fog.color.setHex(0x0B1B33); scene.fog.near = 18; scene.fog.far = 90;
  hemi.color.setHex(0x6A96D8); hemi.groundColor.setHex(0x2A1A40); hemi.intensity = 1.9;
  sun.color.setHex(0xB8CCFF); sun.intensity = 2.3;
  w.marble = 'amethyst'; w.rings = [0x54E0FF, 0xFF4FD8];
  const G = w.group, r = seeded(12);
  // Canyon walls: great low-poly boulders either side, mossed on top.
  const rock = new MeshStandardMaterial({ color: 0x33506E, roughness: 0.95, flatShading: true });
  const moss = new MeshStandardMaterial({ color: 0x3E9384, roughness: 0.9, flatShading: true });
  for (const side of [-1, 1]) for (let i = 0; i < 10; i++) {
    const b = new Mesh(new IcosahedronGeometry(1, 0), rock);
    b.scale.set(7 + r() * 6, 20 + r() * 12, 7 + r() * 5);
    b.position.set(side < 0 ? -14 - r() * 5 : 21 + r() * 5, -20 + r() * 5, 10 - i * 8.5); b.rotation.y = r() * 3; G.add(b);
    const m = new Mesh(new IcosahedronGeometry(1, 0), moss);
    m.scale.set(b.scale.x * 0.8, 1.6, b.scale.z * 0.8); m.position.set(b.position.x, b.position.y + b.scale.y * 0.86, b.position.z); G.add(m);
  }
  const floor = new Mesh(new PlaneGeometry(200, 200), new MeshStandardMaterial({ color: 0x0B1626, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -30, -40); G.add(floor);
  // Crystals: on the canyon floor, on the walls, and close by the course.
  for (let i = 0; i < 14; i++) cluster(G, -12 + r() * 32, -30, 6 - r() * 60, 2.2 + r() * 1.6, 100 + i);
  for (const [x, y, z, s] of [[-12, -2, -12, 1.8], [19, -1, -26, 2], [-11, -4, -34, 1.6], [18, -6, -6, 1.4], [-4.2, -2.4, -6, 1.0], [9.4, -2.2, -18, 0.9], [1.6, -2.4, -31, 0.9]]) cluster(G, x, y, z, s, Math.round(x * 13 + z));
  w.restyle = () => {
    const side = new MeshStandardMaterial({ color: 0x1E2A3C, roughness: 0.9 });
    const under = new MeshStandardMaterial({ color: 0x141C2A, roughness: 1 });
    colliders.forEach((c, i) => {
      c.mesh.material = [side, side, runeTop(c.half.z * 2, 40 + i), under, side, side];
      setTopUV(c.mesh, true);
    });
  };
});

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
  const lanes = [
    { axis: 'z', at: -7, y: -3.2, dir: -1, from: 30, to: -110 }, { axis: 'z', at: -11.5, y: -4.6, dir: 1, from: 30, to: -110 },
    { axis: 'z', at: 13, y: -3.6, dir: 1, from: 30, to: -110 },  { axis: 'z', at: 17.5, y: -4.8, dir: -1, from: 30, to: -110 },
    { axis: 'x', at: -17, y: -3.0, dir: 1, from: -37, to: 43 },  { axis: 'x', at: -37, y: -4.4, dir: -1, from: -37, to: 43 },
    { axis: 'x', at: -52, y: -3.4, dir: 1, from: -37, to: 43 },
  ];
  const cars = [];
  lanes.forEach((l) => { const n = l.axis === 'z' ? 4 : 3; for (let i = 0; i < n; i++) cars.push({ l, u: (i + r() * 0.6) / n, v: 9 + r() * 7 }); });
  const N = cars.length;
  const carProf = (t) => {                       // t: 0 at the tail, 1 at the nose
    const kn = Math.min(1, (1 - t) * 2.3 / 0.95), kt = Math.min(1, t * 2.3 / 0.3);
    const rn = Math.sqrt(1 - (1 - kn) * (1 - kn)), rt = Math.sqrt(1 - (1 - kt) * (1 - kt));
    return { w: 0.52 * (0.25 + 0.75 * Math.sqrt(kn)) * (0.6 + 0.4 * rt), top: -0.12 + 0.32 * rn * (0.7 + 0.3 * rt), bot: -0.2 + 0.06 * (1 - kn) };
  };
  const body = new InstancedMesh(loft(2.3, carProf, 22, 18), new MeshStandardMaterial({ color: 0xFFFFFF, metalness: 0.55, roughness: 0.28, envMap: env }), N);
  const canopy = new InstancedMesh(new SphereGeometry(0.5, 18, 10), new MeshStandardMaterial({ color: 0x0A1222, metalness: 0.9, roughness: 0.08, envMap: env, envMapIntensity: 1.4 }), N);
  /* Lights, after the owner's note that the headlights read as "small white
     squares": a thin LED strip across the nose and another across the tail,
     and a soft cone of light spilling ahead of the car, which is what reads
     as "lights on" from the game's camera above. */
  const heads = new InstancedMesh(new BoxGeometry(0.05, 0.04, 0.44), new MeshBasicMaterial({ color: 0xEAF6FF, toneMapped: false }), N);
  const tails = new InstancedMesh(new BoxGeometry(0.04, 0.05, 0.5), new MeshBasicMaterial({ color: 0xFF2D48, toneMapped: false }), N);
  const coneTex = canvasTex(128, 64, (g) => {
    const img = g.createImageData(128, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
      const u = x / 127, v = (y / 63 - 0.5), half = 0.1 + 0.36 * u;
      const k = Math.exp(-(v / half) * (v / half) * 3) * Math.pow(1 - u, 1.6) * Math.min(1, u / 0.06) * 150;
      const i = (y * 128 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = k; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  const beams = new InstancedMesh(new PlaneGeometry(2.6, 1.6), new MeshBasicMaterial({ map: coneTex, color: 0xDDF2FF, transparent: true,
    blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }), N);
  const tailGlow = new InstancedMesh(new PlaneGeometry(0.9, 0.7), new MeshBasicMaterial({ map: dot, color: 0xFF2D48, transparent: true,
    opacity: 0.8, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }), N);
  const under = new InstancedMesh(new PlaneGeometry(1.9, 1.0), new MeshBasicMaterial({ map: dot, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), N);
  const paint = [0xF2F4F8, 0x9FB4D8, 0xFF8A3D, 0xFFD23F, 0x2EC4B6, 0xE63946, 0xB8C0CC];
  const colr = new Color();
  cars.forEach((c, i) => {
    body.setColorAt(i, colr.setHex(paint[i % paint.length]));
    under.setColorAt(i, colr.setHex(i % 3 ? 0x34E0FF : 0xFF8A5C));
  });
  G.add(body, canopy, heads, tails, under, beams, tailGlow);
  // Where each part sits on a car, in the car's own frame (x forward).
  const part = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0) =>
    new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(rx, 0, 0)), new Vector3(sx, sy, sz));
  const P_CANOPY = part(-0.1, 0.17, 0, 0.8, 0.36, 0.5);
  const P_HEAD = part(0.95, -0.06, 0), P_TAIL = part(-1.155, 0.0, 0);
  const P_BEAM = part(2.25, -0.08, 0, 1, 1, 1, -Math.PI / 2), P_TAILGLOW = part(-1.45, -0.02, 0, 1, 1, 1, -Math.PI / 2);
  const P_UNDER = part(0, -0.27, 0, 1, 1, 1, -Math.PI / 2);
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

  // The sky train: ONE body, lofted from nose to nose. Pearl white, a dark
  // skirt, a cyan line along each side, windows on the sides only, a
  // windscreen wrapped over each nose, white lights at the front and red at
  // the back, and a cyan glow underneath where it floats over the track.
  const TL = 30, NOSE = 6;
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
  train.position.set(-95, -5, TRAIN_Z); G.add(train);
  cityRefs.train = train;
  cityRefs.cars = () => cars.map((c) => { body.getMatrixAt(cars.indexOf(c), m); return new Vector3().setFromMatrixPosition(m).toArray(); });
  // Dark steel: magenta belongs to the course alone, or the eye reads the track as more course.
  const track = new Mesh(new BoxGeometry(260, 0.5, 0.8), new MeshStandardMaterial({ color: 0x1C2438, metalness: 0.5, roughness: 0.5 }));
  track.position.set(3, -6.2, TRAIN_Z); G.add(track);
  for (let x = -120; x <= 120; x += 16) {
    const pylon = new Mesh(new BoxGeometry(0.7, 60, 0.7), new MeshStandardMaterial({ color: 0x10162A, roughness: 0.8 }));
    pylon.position.set(x, -36.4, TRAIN_Z); G.add(pylon);
  }

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
  const boards = [];
  [[-12, -1.5, -12, 0.5], [18, -2.5, -20, -0.5], [-11, -3, -40, 0.45], [16, -1, -52, -0.45], [-14, -4, -64, 0.4]].forEach(([x, y, z, turn], i) => {
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
  w.marble = 'chrome'; w.rings = [0x34E0FF, 0xFF6A3C];
  const G = w.group, r = seeded(41), stripes = stripeTex();
  const box = new BoxGeometry(1, 1, 1);
  const towerA = new MeshStandardMaterial({ color: 0x0B1020, roughness: 0.6, emissive: 0x34E0FF, emissiveMap: stripes, emissiveIntensity: 1.3 });
  const towerB = new MeshStandardMaterial({ color: 0x0B1020, roughness: 0.6, emissive: 0xFF6A3C, emissiveMap: stripes, emissiveIntensity: 1.3 });
  const live = neonLive && !REDUCED;
  if (live) { flickerWindows(towerA, 0); flickerWindows(towerB, 57); }
  const A = new InstancedMesh(box, towerA, 220), B = new InstancedMesh(box, towerB, 220);
  const m = new Matrix4(), q = new Quaternion(), pos = new Vector3(), sc = new Vector3();
  let a = 0, b = 0;
  const tops = [];
  for (let x = -80; x <= 86; x += 7) for (let z = 26; z >= -210; z -= 7) {
    if (r() < 0.35) continue;
    if (Math.abs(z - TRAIN_Z) < 5) continue;                      // the train's line
    const nearCourse = x > -10 && x < 18 && z > -60;
    const top = nearCourse ? -12 - r() * 20 : -6 - r() * 26 + (Math.abs(x - 3) > 40 ? r() * 20 : 0);
    const h = top + 70, wdt = 3 + r() * 3;
    pos.set(x + r() * 2, top - h / 2, z + r() * 2); sc.set(wdt, h, 3 + r() * 3); m.compose(pos, q, sc);
    tops.push({ x: pos.x, y: top, z: pos.z });
    if (r() < 0.55 && a < 220) A.setMatrixAt(a++, m); else if (b < 220) B.setMatrixAt(b++, m);
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
  const cubes = new InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 2, 0.12), cubeMat, 70), col = new Color();
  const hang = [];
  for (let i = 0; i < 70; i++) {
    pos.set(-40 + r() * 90, -18 + r() * 30, -8 - r() * 145);
    if (pos.x > -6 && pos.x < 14 && pos.z > -50 && pos.y > -4) pos.y -= 12;
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
function neonCourse(style) {
  neonStyle = style;
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
  for (const c of colliders) { c.mesh.material = [side, side, top, under, side, side]; setTopUV(c.mesh, false); }
  return neonStyle;
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
let last = performance.now(), frames = 0, frameMs = 16.7;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  frameMs += ((now - last) - frameMs) * 0.05;
  last = now; frames++;
  if (renderer) {
    update(dt, now);
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
  const name = h || 'neon';
  if (name === 'neon') {
    neonStyle = ['grid', 'glowgrid', 'edges', 'frosted'].includes(v) ? v : 'glowgrid';   // #neon-edges and so on
    neonLive = v !== 'still';                                                            // #neon-still: the city unmoving
  }
  setWorld(WORLDS[name] ? name : 'void');
}
worldFromHash();
window.addEventListener('hashchange', worldFromHash);

// ---------- HARNESS ----------
if (HARNESS) {
  window.__marble = {
    state: () => ({ phase: state, level: levelNo, clock: +clock.toFixed(2), falls, started, everMoved,
                    LW, LH, mode: MODE, webgl: !!renderer, grounded: ball.grounded,
                    ball: ball.p.toArray().map((v) => +v.toFixed(3)),
                    v: ball.v.toArray().map((v) => +v.toFixed(3)),
                    gates: gates.map((g) => g.passed), frames, frameMs: +frameMs.toFixed(1) }),
    reach: (n) => loadLevel(n),
    complete: () => { if (state === 'play') { ball.p.set(goal.pos.x, goal.pos.y + R, goal.pos.z); } },
    hits: () => JSON.parse(JSON.stringify(L.hit)),
    course: () => JSON.parse(JSON.stringify(level)),
    ferries: () => ferries.map((c) => c.pos.toArray()),
    readout: () => ({ ...L.readout }),
    ghost: () => (L.ghost ? JSON.parse(JSON.stringify(L.ghost)) : null),
    rulesFit: () => {
      const c = cardLayout('rules');
      const sum = c.HEADER + c.viewH + c.FOOTER;
      return { fits: sum === c.ph && c.py >= 0 && c.py + c.ph <= LH, cardH: c.ph, frameH: LH,
               viewportH: c.viewH, contentH: c.contentH, scrollMax: c.scrollMax,
               overlapPx: Math.max(0, c.py + c.ph - LH) };
    },
    progress: () => JSON.parse(JSON.stringify(save)),
    look: (name) => { setLook(name); return look; },
    eye: (style) => { buildEye(style); return eyeStyle; },
    world: (name) => setWorld(name),
    skin: (name) => setMarbleSkin(name),
    neon: (style) => neonCourse(style),
    audio: () => citySound && { roll: roll ? +roll.g.gain.value.toFixed(4) : null, city: +citySound.pg.gain.value.toFixed(4),
                                train: +citySound.tg.gain.value.toFixed(4), state: citySound.ac.state },
    peek: (p, a) => { peekCam = p ? { pos: p, at: a } : null; return !!peekCam; },
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
