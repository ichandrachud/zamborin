/* ============================================================
   Litmus in 3D · A Zamborin Game (first slice, 2026-10-02)
   ============================================================

   Litmus played in first person (owner, 2026-10-02): you float in an empty,
   dark space with the atoms all around you and turn a full circle to find
   them. Tap an atom and it glides over to clasp the atom you hold; hold to
   drift toward one. Only the game is on screen: the target molecule at the
   top and one pause button. Everything else is in the menu card it opens.

   The rules are /chemistry/'s, unchanged: model.js decides what a bond makes
   and levels.js holds the levels. This file places the atoms around you,
   moves them, finds the hands that meet, and draws it all. Its own rules:
     nothing reacts on its own: only what is pulled in, or what you hold as
       you turn and drift, can grab;
     a pulled atom grabs anything it could bond with that it passes near, all
       the way in, so you turn for a clear line (and so does what you hold);
     every atom floats in the space, the level's spare atoms too (owner,
       2026-10-02); you start holding one of them.

   Two canvases share the frame, as in Marble. #world is three.js underneath;
   #game is the house canvas UI on top, drawn by shared/ui.js. The world takes
   game-art colours; the chrome takes tokens. */

import {
  WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight,
  Mesh, Group, SphereGeometry, TorusGeometry, CylinderGeometry, PlaneGeometry, LatheGeometry, Vector2,
  BufferGeometry, Float32BufferAttribute, Points, PointsMaterial,
  MeshPhysicalMaterial, MeshBasicMaterial, Sprite, SpriteMaterial, CanvasTexture,
  SRGBColorSpace, Color, Vector3, Quaternion, Euler, NeutralToneMapping,
  PMREMGenerator, AdditiveBlending, BackSide,
} from './assets/three-r186.min.js';

const M = window.ChemModel, LV = window.ChemLevels, UI = window.ZAM_UI;

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
  bgCard: '#131F36', line: '#1F2D4A',
  text: '#FFFFFF', textDim: '#C5CFE0', ink92: 'rgba(255,255,255,0.92)', ink90: 'rgba(255,255,255,0.90)',
  ink82: 'rgba(255,255,255,0.82)', ink72: 'rgba(255,255,255,0.72)',
  tint03: 'rgba(255,255,255,0.03)', tint07: 'rgba(255,255,255,0.07)',
  tint10: 'rgba(255,255,255,0.10)', tint12: 'rgba(255,255,255,0.12)',
  green: '#5DD39E',
  scrim: 'rgba(10,16,28,0.88)', scrimWin: 'rgba(10,16,28,0.82)',
};
// Litmus's accent, the band blue of /chemistry/: white on it is 5.2:1.
const ACCENT = '#1C73A1';

// ---------- THE ATOMS' COLOURS ----------
// /chemistry/play.js's ART, as it is there: the element colours are the game's.
const ART = {
  H:  { hi: '#B9BBBF', lo: '#737D8C', ink: '#1E2A3C' },
  O:  { hi: '#F47A66', lo: '#8A2A1E', ink: '#FFFFFF' },
  N:  { hi: '#7A9EF2', lo: '#22408F', ink: '#FFFFFF' },
  C:  { hi: '#838C9D', lo: '#343B48', ink: '#FFFFFF' },
  F:  { hi: '#A6CBCC', lo: '#31777C', ink: '#10363A' },
  Cl: { hi: '#ADCD7A', lo: '#42761E', ink: '#17330B' },
  Na: { hi: '#9E82C5', lo: '#44267B', ink: '#FFFFFF' },
  K:  { hi: '#F0A9D2', lo: '#82255F', ink: '#FFFFFF' },
  Mg: { hi: '#F2D27C', lo: '#8C6A1C', ink: '#3A2A06' },
  Ca: { hi: '#D6CAAE', lo: '#8E764E', ink: '#3A2C12' },
  Al: { hi: '#C3C8DD', lo: '#555C7A', ink: '#1E2233' },
  Fe: { hi: '#CF986D', lo: '#6C3D1F', ink: '#FFFFFF' },
  Zn: { hi: '#ABBDCD', lo: '#3B566B', ink: '#FFFFFF' },
  Cu: { hi: '#F0A878', lo: '#8A3B12', ink: '#FFFFFF' },
};
const GREEN_TIP = 0x5DF0A8, WHITE_TIP = 0xEAF4FF, AMBER_TIP = 0xFFB25C;

/* EACH CHAPTER HAS ITS OWN COLOUR OF SPACE (owner, 2026-10-02). Only the
   Moleculator's is drawn: the dark navy of the frames. */
const SPACE = {
  moleculator: {
    stops: ['#03050C', '#0B1830', '#02040A'],
    glows: [[0.25, 0.5, 0.22, 'rgba(40,96,190,0.35)'], [0.75, 0.5, 0.22, 'rgba(60,70,170,0.28)'], [0.5, 0.52, 0.18, 'rgba(30,110,170,0.22)']],
    mote: 0xA8C8FF, ring: 0x3A6AB8, rim: 0x8A6AFF,
  },
};

// ---------- TUNING ----------
// Distances are in atom radii, as in /chemistry/, so the rules read the same.
const U = 0.55;                 // one atom radius, in world units
const TUNE = {
  bond: 2.8,                    // between two bonded centres
  capture: 3.0,                 // centres this close and two free hands grab
  snap: 3.6,                    // a grab that helps clasps this close (/chemistry/, 2026-09-25)
  keep: 5.4, collide: 2.3, spread: 1.62,
  hand: 2.0,                    // a hand's length from its atom's centre
  drift: 0.42, spin: 0.5, driftTau: 3,
  glideMax: 16, glideAcc: 20,   // a pulled atom comes in at up to this many radii a second
  hold: 20,                     // what you hold floats this far in front of you
  near: 25.5, far: 47,          // where the level's atoms start, from you
  bubble: 11,                   // nothing floats closer to you than this
  room: 62,                     // nothing goes further from the middle than this, you included
  driftSpeed: 6,                // when you hold to drift
  holdMs: 260, tapPx: 9,
  cardFailMs: 1500, cardAfterMs: 500,
  /* A made molecule glows and turns in front of you, then flies up into the
     target (owner, 2026-10-02: "glow and rotate for 2 seconds"). */
  spinMs: 2000, flyMs: 1100,
};
const STEP = 1 / 60;
// The checks may run the world faster (?harness=1&speed=3): more steps a frame, nothing else changes.
const SPEED = HARNESS ? Math.max(1, Math.min(6, +(new URLSearchParams(location.search).get('speed')) || 1)) : 1;

// ---------- CANVASES ----------
let LW = 760, LH = 600;
const hud = document.getElementById('game');
const ctx = hud.getContext('2d');
const worldCanvas = document.getElementById('world');
const gameWrap = hud.parentElement;
const fullWindow = () => document.body.classList.contains('focus-mode') ||
                         document.body.classList.contains('embed');
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
  renderer.setPixelRatio(Math.min(2, dpr));
  renderer.setSize(cssW, cssH, false);
  fitCamera();
  fitLegend();
}
function onResize() { setCanvasVars(); fitFullscreen(); resizeCanvases(); }

// ---------- AUDIO ----------
// A lab at night, as /chemistry/: quiet and precise.
const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zam.litmus3d.sfx', gain: 3 }) : null;
const PITCH = { H: 1175, O: 988, N: 784, C: 587, F: 1047, Cl: 880, Na: 698, K: 698, Mg: 659, Ca: 523, Al: 622, Fe: 440, Zn: 554, Cu: 494 };
const SND = {
  on:     () => !!(sfx && sfx.isOn()),
  ready:  () => { if (sfx) sfx.ensureAudio(); },
  toggle: () => { if (sfx) { sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.play('click'); } },
  pick:   () => { if (sfx) sfx.play('tick'); },
  glide:  () => { if (sfx) { sfx.tone(392, 0.22, 0.02, 'sine'); setTimeout(() => sfx.tone(523, 0.26, 0.018, 'sine'), 90); } },
  clasp:  (el, n) => {
    if (!sfx) return;
    for (let i = 0; i < Math.min(3, n); i++) {
      setTimeout(() => { sfx.woodClack(PITCH[el] * 0.5, 0.06, 0.12); sfx.tone(PITCH[el], 0.09, 0.03, 'triangle'); }, i * 55);
    }
  },
  refuse: () => { if (sfx) { sfx.tone(196, 0.12, 0.05, 'sine'); setTimeout(() => sfx.tone(165, 0.14, 0.04, 'sine'), 70); } },
  waste:  () => { if (sfx) sfx.play('thump'); },
  lift:   () => { if (sfx) sfx.play('success'); },
  lost:   () => { if (sfx) sfx.tone(196, 0.16, 0.05, 'sine'); },
  win:    () => { if (sfx) sfx.play('win'); },
  fail:   () => { if (sfx) sfx.play('fail'); },
};

// ---------- THE WORLD ----------
const renderer = new WebGLRenderer({ canvas: worldCanvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.autoClear = false;
const scene = new Scene();
const FOV = MODE === 'mobile' ? 68 : 58;
const cam = new PerspectiveCamera(FOV, 1, 0.1, 1200);
cam.rotation.order = 'YXZ';
function fitCamera() {
  cam.aspect = cssW / Math.max(1, cssH);
  cam.updateProjectionMatrix();
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const DOT = canvasTex(128, 128, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  r.addColorStop(0.6, 'rgba(255,255,255,0.12)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});
// Glow: a thin bright core with a tight feather (DESIGN-SYSTEM 6), never a wash.
function glow(color, size, opacity) {
  const s = new Sprite(new SpriteMaterial({ map: DOT, color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  s.scale.set(size, size, 1);
  return s;
}

/* AN EMPTY SPACE: nothing but a soft gradient at infinity, drifting motes for
   depth, and two faint rings far below that keep a horizon to turn against.
   No planet, no stars-and-station look (owner: "an empty space, not space as
   in outer space above the earth"). */
const space = SPACE.moleculator;
const voidTex = canvasTex(1024, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, space.stops[0]); gr.addColorStop(0.5, space.stops[1]); gr.addColorStop(1, space.stops[2]);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (const [x, y, r, c] of space.glows) {
    const q = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w);
    q.addColorStop(0, c); q.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = q; g.fillRect(0, 0, w, h);
  }
});
const dome = new Mesh(new SphereGeometry(900, 48, 24), new MeshBasicMaterial({ map: voidTex, side: BackSide, depthWrite: false, toneMapped: false }));
dome.rotation.y = -Math.PI / 2;
scene.add(dome);
const env = (() => {
  const s = new Scene();
  s.add(new Mesh(new SphereGeometry(50, 32, 16), new MeshBasicMaterial({ map: voidTex, side: BackSide })));
  const box = new Mesh(new PlaneGeometry(34, 22), new MeshBasicMaterial({ color: 0xFFFFFF })); box.position.set(-26, 26, 18); box.lookAt(0, 0, 0); s.add(box);
  const rimP = new Mesh(new PlaneGeometry(40, 10), new MeshBasicMaterial({ color: 0x5A9AFF })); rimP.position.set(24, 6, -30); rimP.lookAt(0, 0, 0); s.add(rimP);
  const pm = new PMREMGenerator(renderer); const t = pm.fromScene(s, 0.02).texture; pm.dispose(); return t;
})();
{
  const R = mulberry(21), p = [];
  for (let i = 0; i < 1500; i++) { const r = 4 + R() * 70, an = R() * Math.PI * 2, y = (R() - 0.5) * 70; p.push(Math.cos(an) * r, y, Math.sin(an) * r); }
  const mg = new BufferGeometry(); mg.setAttribute('position', new Float32BufferAttribute(p, 3));
  scene.add(new Points(mg, new PointsMaterial({ size: 0.11, color: space.mote, map: DOT, transparent: true, depthWrite: false, opacity: 0.85, blending: AdditiveBlending })));
  for (const [y, w, o] of [[-22, 0.18, 0.45], [-40, 0.1, 0.25]]) {
    const ring = new Mesh(new TorusGeometry(140, w, 6, 240), new MeshBasicMaterial({ color: space.ring, transparent: true, opacity: o, toneMapped: false }));
    ring.rotation.x = Math.PI / 2; ring.position.y = y; scene.add(ring);
  }
}
// The light rides with you: up and slightly left of wherever you look (DESIGN-SYSTEM 6).
scene.add(new HemisphereLight(0x9AB8FF, 0x101624, 0.7));
const sun = new DirectionalLight(0xFFF4E4, 2.4), rim = new DirectionalLight(space.rim, 1.2);
scene.add(sun, sun.target, rim, rim.target);
const SUN_AT = new Vector3(-40, 30, 20), RIM_AT = new Vector3(20, 10, -60);

// ---------- ATOM PIECES ----------
const rOf = (el) => (el === 'H' ? 0.78 : 1) * U;
const geo = new Map();
function cached(key, make) { if (!geo.has(key)) geo.set(key, make()); return geo.get(key); }
const mats = new Map();
function mat(key, make) { if (!mats.has(key)) mats.set(key, make()); return mats.get(key); }
const ballMat = (el, waste) => mat('ball' + el + (waste ? 'w' : ''), () => {
  const base = new Color(ART[el].hi).lerp(new Color(ART[el].lo), 0.5);
  const c = new Color(ART[el].hi).lerp(base, 0.28);
  if (waste) c.lerp(new Color('#38404E'), 0.6);
  return new MeshPhysicalMaterial({ color: c, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, envMap: env,
    envMapIntensity: waste ? 0.5 : 1.5, emissive: base, emissiveIntensity: waste ? 0 : 0.1, transparent: true });
});
const tipMat = (hex) => mat('tip' + hex, () => new MeshBasicMaterial({ color: hex, toneMapped: false }));
const letterTex = new Map();
/* THE LETTERS. A far atom's letter was a few pixels tall and could not be read
   (owner, 2026-10-02: "a little bigger"). Each letter is drawn large in its
   texture, sized on the atom as before when the atom is near, and grown as the
   atom gets further away so its capitals never stand under LETTER.cap pixels,
   up to a size that still sits on the ball. */
const LETTER = { cap: 11, font: (el) => (el.length > 1 ? 72 : 88), max: 1.9 };
const capOf = (el) => 0.727 * LETTER.font(el) / 128;      // Inter's capital height, as a share of the texture
const letterBase = (el) => (el.length > 1 ? 0.97 : 0.91);  // radii: the size the letters had, near
const letterDraws = [];
function letterMat(el) {
  return mat('letter' + el, () => {
    const draw = (g, w) => {
      g.clearRect(0, 0, w, w);
      g.fillStyle = ART[el].ink; g.font = `700 ${LETTER.font(el)}px Inter, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(el, w / 2, w / 2 + 4);
    };
    const map = canvasTex(128, 128, draw);
    letterDraws.push(() => { draw(map.image.getContext('2d'), 128); map.needsUpdate = true; });
    // drawn last and over everything (drawWorld hides it behind a nearer atom), and a sprite always stands upright
    return new SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, map });
  });
}
// A letter drawn before Inter arrived is in the system face: draw them again once it is here.
if (document.fonts) document.fonts.load('700 72px Inter').then(() => letterDraws.forEach((f) => f())).catch(() => {});
const Y_UP = new Vector3(0, 1, 0), X_AXIS = new Vector3(1, 0, 0);

/* THE JOIN (owner, 2026-10-03: the arm stuck on the atom "feels a little
   amateurish / unreal"). An arm or a bond is not pushed into its atom: it is
   drawn out of it, as glass is pulled, a smooth flare leaving the ball along the
   ball's own curve and narrowing into a slim stem, all in the atom's own glass,
   so atom and arm read as one piece. Built along +Y from the atom's centre. */
const ARM = { reach: 1.32, base: 0.085, end: 0.06 };   // the flare ends this many radii out; the stem's radii, in radii
function flareGeo(r, endRad) {
  return cached('flare' + r.toFixed(4) + ':' + endRad.toFixed(4), () => {
    const phi = 36 * Math.PI / 180, on = (a, k) => new Vector2(r * k * Math.sin(a), r * k * Math.cos(a));
    const p0 = on(phi, 1), c = p0.clone().add(new Vector2(-Math.cos(phi), Math.sin(phi)).multiplyScalar(0.42 * r)), p2 = new Vector2(endRad, ARM.reach * r);
    const pts = [on(phi + 0.12, 0.97)];   // it starts just under the surface, so there is no seam
    for (let i = 0; i <= 18; i++) {
      const t = i / 18, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, k = t * t;
      pts.push(new Vector2(a * p0.x + b * c.x + k * p2.x, a * p0.y + b * c.y + k * p2.y));
    }
    return new LatheGeometry(pts, 36);
  });
}

/* An atom's look: glossy glass, a tight glow of its own colour, slim hands drawn
   out of it with small glowing tips (owner, 2026-10-02). The hands shown are its
   FREE hands; a bond is drawn as a glass rod between two atoms. */
function makeView(a) {
  const el = a.el, r = rOf(el), hi = new Color(ART[el].hi).getHex();
  const g = new Group();
  const ball = new Mesh(cached('ball' + r, () => new SphereGeometry(r, 40, 28)), ballMat(el));
  const halo = glow(hi, r * 2.7, 0.38);
  const letter = new Sprite(letterMat(el)); letter.scale.set(r * letterBase(el), r * letterBase(el), 1); letter.renderOrder = 50;
  g.add(ball, halo, letter);
  const L = r * (TUNE.hand - ARM.reach - 0.1);
  const hands = [];
  for (let i = 0; i < M.ELEMENTS[el].hands; i++) {
    const flare = new Mesh(flareGeo(r, ARM.base * r), ballMat(el));
    const arm = new Mesh(cached('stem' + r, () => new CylinderGeometry(ARM.end * r, ARM.base * r, L, 14)), ballMat(el));
    const tip = new Mesh(cached('tip' + r, () => new SphereGeometry(0.17 * r, 14, 10)), tipMat(WHITE_TIP));
    const tg = glow(hi, 0.9 * r, 0.7);
    g.add(flare, arm, tip, tg);
    hands.push({ flare, arm, tip, tg });
  }
  scene.add(g);
  const R = Math.random;
  return {
    id: a.id, el, r, g, ball, halo, letter, hands,
    frame: 'world',              // 'world', or 'cam' while you hold it (then pos is in front of you)
    pos: new Vector3(), wp: new Vector3(), prev: new Vector3(), vel: new Vector3(),
    q: new Quaternion().setFromEuler(new Euler(R() * 6.3, R() * 6.3, R() * 6.3)), w: new Vector3(),
    shake: 0, flash: 0, lift: null, fade: 1,
  };
}
const V = new Map();          // atom id -> its view
const view = (id) => V.get(id);

/* Free hands point away from the bonds an atom already has; a lone atom's
   point the ideal way for their number and turn slowly with it. */
const IDEAL = {
  1: [[1, 0, 0]],
  2: [[1, 0, 0], [-0.94, 0.34, 0]],
  3: [[1, 0, 0], [-0.5, 0.866, 0], [-0.5, -0.866, 0]],
  4: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
};
const tmpA = new Vector3(), tmpB = new Vector3(), tmpC = new Vector3(), tmpQ = new Quaternion();
function handDirs(v) {
  const a = st.atoms[v.id], f = a.free, out = [];
  if (!f) return out;
  if (!a.bonds.length) {
    for (const d of IDEAL[Math.min(4, f)]) out.push(new Vector3(...d).normalize().applyQuaternion(v.q));
    return out;
  }
  const axis = new Vector3();
  for (const b of a.bonds) { const o = view(b.to); if (o) axis.add(tmpA.copy(o.wp).sub(v.wp).normalize()); }
  axis.negate();
  if (axis.lengthSq() < 1e-4) axis.copy(Y_UP).applyQuaternion(v.q);
  axis.normalize();
  const p = tmpB.set(0, 1, 0).applyQuaternion(v.q).cross(axis);
  if (p.lengthSq() < 1e-4) p.set(1, 0, 0).cross(axis);
  p.normalize();
  const q = tmpC.copy(axis).cross(p).normalize();
  if (f === 1) out.push(axis.clone());
  else {
    const cone = f === 2 ? 0.87 : 1.05;
    for (let i = 0; i < f; i++) {
      const th = (i / f) * Math.PI * 2;
      out.push(axis.clone().multiplyScalar(Math.cos(cone))
        .addScaledVector(p, Math.sin(cone) * Math.cos(th)).addScaledVector(q, Math.sin(cone) * Math.sin(th)).normalize());
    }
  }
  return out;
}

// ---------- BONDS, DRAWN ----------
const bondViews = new Map();  // 'a-b' -> { a, b, order, meshes }
const stickMat = (el) => mat('stick' + el, () => new MeshPhysicalMaterial({
  color: new Color(ART[el].hi).lerp(new Color(ART[el].lo), 0.25), roughness: 0.25, metalness: 0.35, clearcoat: 1, envMap: env, envMapIntensity: 1.1,
}));
function addBondView(a, b, order) {
  const key = Math.min(a, b) + '-' + Math.max(a, b);
  const rad = order > 1 ? 0.085 * U : 0.12 * U, spread = order === 1 ? 0 : order === 2 ? 0.16 * U : 0.22 * U;
  const meshes = [], flares = [];
  for (let k = 0; k < order; k++) {
    for (const id of [a, b]) {
      const m = new Mesh(cached('stick' + rad, () => new CylinderGeometry(rad, rad, 1, 12)), ballMat(view(id).el));
      scene.add(m); meshes.push(m);
    }
  }
  // each end is drawn out of its atom, wide enough to hold all the bond's rods
  for (const id of [a, b]) { const v = view(id), f = new Mesh(flareGeo(v.r, spread + rad), ballMat(v.el)); scene.add(f); flares.push(f); }
  bondViews.set(key, { a, b, order, meshes, flares });
}
function drawBond(bv) {
  const A = view(bv.a), B = view(bv.b);
  const d = tmpA.copy(B.wp).sub(A.wp), L = d.length();
  if (L < 1e-5) return;
  d.normalize();
  tmpQ.setFromUnitVectors(Y_UP, d);
  const side = tmpB.copy(d).cross(tmpC.copy(cam.position).sub(A.wp)).normalize();
  const offs = bv.order === 1 ? [0] : bv.order === 2 ? [-0.16 * U, 0.16 * U] : [-0.22 * U, 0, 0.22 * U];
  const fade = Math.min(A.fade, B.fade);
  let i = 0;
  for (const off of offs) {
    for (const [from, half] of [[A.wp, 0], [B.wp, 1]]) {
      const m = bv.meshes[i++];
      m.quaternion.copy(tmpQ);
      m.scale.set(1, L / 2, 1);
      m.position.copy(A.wp).addScaledVector(d, L * (half ? 0.75 : 0.25)).addScaledVector(side, off);
      m.visible = fade > 0.02 && A.g.visible && B.g.visible;
    }
  }
  [[A, d, bv.flares[0]], [B, tmpC.copy(d).negate(), bv.flares[1]]].forEach(([v, dir, f]) => {
    f.position.copy(v.g.position); f.quaternion.setFromUnitVectors(Y_UP, dir); f.scale.setScalar(v.g.scale.x);
    f.visible = fade > 0.02 && A.g.visible && B.g.visible;
  });
}
function clearWorld() {
  for (const v of V.values()) scene.remove(v.g);
  for (const bv of bondViews.values()) for (const m of bv.meshes.concat(bv.flares)) scene.remove(m);
  V.clear(); bondViews.clear();
  for (const t of trail) t.s.visible = false;
}

// ---------- THE TRAIL ----------
// No beam (owner, 2026-10-02): a pulled atom glides in with a short fading trail.
const trail = [];
for (let i = 0; i < 28; i++) { const s = glow(0xFFFFFF, 1, 0); s.visible = false; scene.add(s); trail.push({ s, t0: 0, life: 0, size: 1 }); }
let trailNext = 0;
// a soft light behind a molecule as it is made
const auraSprite = glow(0xBFE3FF, 1, 0); auraSprite.visible = false; scene.add(auraSprite);
function dropTrail(p, el, r) {
  const t = trail[trailNext++ % trail.length];
  t.s.position.copy(p); t.s.material.color.set(ART[el].hi); t.s.visible = true;
  t.t0 = clock(); t.life = 480; t.size = r * 2.2;
}
// A clasp flashes where the hands met.
const flashes = [];
for (let i = 0; i < 6; i++) { const s = glow(0xFFFFFF, 1, 0); s.visible = false; scene.add(s); flashes.push({ s, t0: -1e9 }); }
let flashNext = 0;
function flashAt(p) { const f = flashes[flashNext++ % flashes.length]; f.s.position.copy(p); f.s.visible = true; f.t0 = clock(); }

// ---------- THE TARGET, AT THE TOP ----------
/* The one legend in play (owner, 2026-10-02): the molecule to make, at the
   top, drawn like the atoms, pinned to the screen so it stays put while you
   turn. From the first frame the owner chose a faint glass strip behind it, so
   it reads as the goal and not one more atom, and its name with the formula in
   brackets under it. */
const ov = new Scene();
const ovCam = new PerspectiveCamera(30, 1, 1, 4000);
ov.add(new HemisphereLight(0x9AB8FF, 0x101624, 0.8));
const ovSun = new DirectionalLight(0xFFF4E4, 2.2); ovSun.position.set(-40, 30, 40); ov.add(ovSun);
let legend = { h: 120, group: null, strip: null, mols: [], pulse: -1e9 };
const stripTex = canvasTex(512, 128, (g, w, h) => {
  const r = 30;
  const path = () => { g.beginPath(); g.roundRect(1, 1, w - 2, h - 2, r); };
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(1, 'rgba(255,255,255,0.04)');
  path(); g.fillStyle = gr; g.fill();
  path(); g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2; g.stroke();
});
const shapes = new Map();
function molecule3d(key) {
  if (!shapes.has(key)) shapes.set(key, shapeOf(key));
  return shapes.get(key);
}
function shapeOf(key) {
  /* The target's true shape, roughly: its flat layout (model.js) relaxed in
     three dimensions so bonds are even and atoms stand apart. */
  const T = M.MOLECULES[key], lay = M.layoutMolecule(key), R = mulberry(key.length * 97 + 5);
  const p = lay.atoms.map((a, i) => new Vector3(a.x * TUNE.bond, -a.y * TUNE.bond + (i % 2 ? 0.5 : -0.5), (R() - 0.5) * 0.3));
  const n = p.length, B = TUNE.bond;
  for (let it = 0; it < 300; it++) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const bonded = T.adj[i].some(([k]) => k === j);
      const d = tmpA.copy(p[j]).sub(p[i]), L = d.length() || 1e-4;
      let c = 0;
      if (bonded) c = (L - B) * 0.3;
      else if (L < B * 1.75) c = (L - B * 1.75) * 0.1;
      if (c) { d.multiplyScalar(c / L); p[i].add(d); p[j].sub(d); }
    }
  }
  const mid = p.reduce((s, q) => s.add(q), new Vector3()).multiplyScalar(1 / n);
  p.forEach((q) => { q.sub(mid); q.z *= 0.5; });
  const bonds = [];
  T.adj.forEach((list, i) => list.forEach(([j, o]) => { if (i < j) bonds.push([i, j, o]); }));
  return { els: T.els, p, bonds };
}
function buildLegend() {
  if (legend.group) ov.remove(legend.group);
  const G = new Group(); ov.add(G);
  legend.group = G; legend.mols = []; legend.pending = 0;
  for (const t of st.targets) {
    const m = molecule3d(t.key), g = new Group();
    // its own materials, so dimming a made target never dims an atom in the space
    const own = new Map(), mine = (k, make) => { if (!own.has(k)) own.set(k, make().clone()); return own.get(k); };
    m.els.forEach((el, i) => {
      const b = new Mesh(cached('ball' + rOf(el), () => new SphereGeometry(rOf(el), 40, 28)), mine('b' + el, () => ballMat(el)));
      b.position.copy(m.p[i]).multiplyScalar(U); b.scale.setScalar(0.74); g.add(b);
    });
    for (const [i, j, o] of m.bonds) {
      const a = m.p[i].clone().multiplyScalar(U), b = m.p[j].clone().multiplyScalar(U);
      const d = b.clone().sub(a), L = d.length(); d.normalize();
      const side = d.clone().cross(new Vector3(0, 0, 1)).normalize();
      const offs = o === 1 ? [0] : o === 2 ? [-0.16 * U, 0.16 * U] : [-0.22 * U, 0, 0.22 * U];
      const rad = o > 1 ? 0.085 * U : 0.12 * U;
      for (const off of offs) for (const [el, k] of [[m.els[i], 0.25], [m.els[j], 0.75]]) {
        const s = new Mesh(cached('stick' + rad, () => new CylinderGeometry(rad, rad, 1, 10)), mine('s' + el, () => stickMat(el)));
        s.material.transparent = true;
        s.quaternion.setFromUnitVectors(Y_UP, d); s.scale.set(1, L / 2, 1);
        s.position.copy(a).addScaledVector(d, L * k).addScaledVector(side, off);
        g.add(s);
      }
    }
    const box = { w: 0, h: 0 };
    for (const q of m.p) { box.w = Math.max(box.w, Math.abs(q.x) * U + U); box.h = Math.max(box.h, Math.abs(q.y) * U + U); }
    G.add(g);
    legend.mols.push({ key: t.key, g, box });
  }
  const strip = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: stripTex, transparent: true, depthWrite: false, toneMapped: false }));
  strip.renderOrder = -1; G.add(strip);
  legend.strip = strip;
  fitLegend();
}
/* The legend's room, in the frame's units: a strip along the top, right of the
   pause button and level with it. The molecule sits in its upper part (`mol`
   is the molecule's middle, from the top of the strip); the name below. */
const LEGEND = { top: 10, h: 100, mol: 38, label: 78 };
function fitLegend() {
  /* The legend has its own small camera over that room, set so one world unit
     is one CSS pixel at the legend's depth. */
  const k = cssW / LW;     // CSS px per frame unit
  legend.h = LEGEND.h;
  const vh = LEGEND.h * k;
  ovCam.aspect = cssW / vh;
  ovCam.updateProjectionMatrix();
  legend.D = (vh / 2) / Math.tan((ovCam.fov / 2) * Math.PI / 180);
  ovCam.position.set(0, 0, legend.D); ovCam.lookAt(0, 0, 0);
  if (!legend.group) return;
  const pb = pauseBox();
  const left = pb.x + pb.w + 12, right = LW - (MODE === 'mobile' ? 16 : 30);
  const stripW = right - left, stripH = LEGEND.h;
  const cx = (left + right) / 2 - LW / 2;
  // the strip sits behind the molecule, so it is scaled up by its extra distance to be stripW across on screen
  const behind = (legend.D + 40) / legend.D;
  legend.strip.scale.set(stripW * k * behind, stripH * k * behind, 1);
  legend.strip.position.set(cx * k * behind, 0, -40);
  // the molecules side by side, as large as the room lets them be (a ball no bigger than 15px)
  const n = legend.mols.length, gap = 18, molH = 52;
  const wSum = legend.mols.reduce((s, m) => s + m.box.w * 2, 0);
  const sc = Math.min((stripW - 36 - gap * (n - 1)) / Math.max(1e-3, wSum),
                      molH / Math.max(1e-3, Math.max(...legend.mols.map((m) => m.box.h * 2))),
                      15 / U) * k;
  let x = cx * k - ((wSum * sc) + gap * k * (n - 1)) / 2;
  const y = (LEGEND.h / 2 - LEGEND.mol) * k;
  for (const m of legend.mols) {
    m.g.scale.setScalar(sc); m.g.userData.base = sc;
    m.g.position.set(x + m.box.w * sc, y, 0);
    x += m.box.w * 2 * sc + gap * k;
  }
  legend.cx = cx; legend.w = stripW;
}

// ---------- LEVEL ----------
const LIST = MODE === 'mobile' ? LV.mobile : LV.desktop;
/* PROGRESS. The phone and the desktop play different level sets (as /chemistry/),
   so each keeps its own record. Levels open in order; a returning player lands
   on the first level not yet done (DESIGN-SYSTEM 10.1). */
const SAVE_KEY = 'zam.litmus3d.progress';
let save = (() => { try { const v = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } })();
const doneSet = () => new Set((save[MODE] && save[MODE].done) || []);
function markDone(n) {
  const d = doneSet(); d.add(n);
  save[MODE] = { done: [...d].sort((a, b) => a - b), last: n };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) { /* private window: play on unsaved */ }
}
const isOpen = (n) => n === 1 || doneSet().has(n) || doneSet().has(n - 1);
function firstUndone() { const d = doneSet(); for (let n = 1; n <= LIST.length; n++) if (!d.has(n)) return n; return LIST.length; }
// Which 3D placement each level uses: tools/litmus3d/levels.mjs picks the first one its checks pass.
const PLACES = (window.LITMUS3D_PLACES && window.LITMUS3D_PLACES[MODE]) || [];
let levelNo = (() => { const m = location.hash.match(/level-(\d+)/); const n = m ? +m[1] : firstUndone(); return Math.max(1, Math.min(LIST.length, n)); })();
let LEVEL = null, st = null;
let held = new Set();         // the atoms you hold: they float in front of you and turn with you
let glide = null;             // an atom on its way in
let card = null, menu = null;
let firstInput = false, hintId = -1, refused = null;
let levelT0 = 0;

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const HOLD = new Vector3();
function fitHold() {
  // what you hold sits a little below the middle of the view
  const below = (MODE === 'mobile' ? 13 : 11) * Math.PI / 180, d = TUNE.hold * U;
  HOLD.set(0, -Math.sin(below) * d, -Math.cos(below) * d);
}
fitHold();
function holdWorld(yaw, pitch, at, out) {
  return out.copy(HOLD).applyEuler(new Euler(pitch, yaw, 0, 'YXZ')).add(at);
}
function segDist(p, a, b) {
  const ab = tmpA.copy(b).sub(a), t = Math.max(0, Math.min(1, tmpB.copy(p).sub(a).dot(ab) / Math.max(1e-6, ab.lengthSq())));
  return tmpC.copy(a).addScaledVector(ab, t).distanceTo(p);
}

/* THE LEVEL, PLACED ROUND YOU. A level of /chemistry/ is a list of atoms for a
   flat dish; here they float round you, nearer than `far` and no nearer than
   `near`, a little more than half of them in the half you face at the start.
   One atom you need waits straight ahead, a little high, on a clear line (as
   the owner's frame), and every atom you need has a clear line in from some
   way you can face. Placed from the level's seed, so a level is always the
   same place. A 3D layout per level, checked by a search and then played, is
   the real job and is not done: see the handoff. */
const FRONT = (() => {
  // the view you start with, in degrees either side of straight ahead
  const vHalf = FOV / 2, aspect = MODE === 'mobile' ? 390 / 844 : 760 / 600;
  const hHalf = Math.atan(Math.tan(vHalf * Math.PI / 180) * aspect) * 180 / Math.PI;
  return { yaw: Math.max(20, hHalf * 1.15), pitch: vHalf * 0.72 };
})();
/* The headings a player turns to for a pull: the atom a little above the middle
   of the view, or a little off to one side. The placement's check and the pilot
   use the same ones, so a line the check calls clear is one the pilot can take. */
const HEADS = [[0, 0.1], [0, 0.22], [0.12, 0.1], [-0.12, 0.1], [0, 0], [0.24, 0.1], [-0.24, 0.1], [0.12, 0.22], [-0.12, 0.22], [0, -0.1]];
// The pilot may also look further up or down for a line; the placement's check keeps to HEADS.
const PILOT_HEADS = HEADS.concat([[0, 0.35], [0.12, 0.35], [-0.12, 0.35], [0.24, 0.22], [-0.24, 0.22], [0, -0.25], [0.12, -0.1], [-0.12, -0.1]]);
const VIEW_ASPECT = MODE === 'mobile' ? 390 / 844 : 760 / 600;   // the frame the levels are placed for
function placeAtoms(ids, leadId, seed, variant, hazards) {
  const R = mulberry(seed * 9973 + 1 + variant * 7919), origin = new Vector3();
  const near = TUNE.near * U, far = TUNE.far * U, keep = TUNE.keep * U * 1.15;
  const needEls = new Set();
  for (const t of st.targets) for (const el of M.MOLECULES[t.key].els) needEls.add(el);
  let best = null;
  for (let attempt = 0; attempt < 80; attempt++) {
    const pos = new Map();
    const at = (yawDeg, pitchDeg, d) => new Vector3(0, 0, -d).applyEuler(new Euler(pitchDeg * Math.PI / 180, yawDeg * Math.PI / 180, 0, 'YXZ'));
    if (leadId >= 0) pos.set(leadId, at(-7 + R() * 4, 6 + R() * 4, near + 1 + R() * 2));
    const rest = ids.filter((id) => id !== leadId);
    rest.forEach((id, i) => {
      for (let tries = 0; tries < 500; tries++) {
        // a little over half in the view you start with, the rest all the way round
        const front = i < rest.length * 0.55;
        const yaw = front ? (R() - 0.5) * 2 * FRONT.yaw : (R() - 0.5) * 360;
        const pitch = Math.asin((R() * 2 - 1) * Math.sin((front ? FRONT.pitch : 32) * Math.PI / 180)) * 180 / Math.PI;
        const p = at(yaw, pitch, near + R() * (far - near));
        let ok = true;
        for (const q of pos.values()) if (q.distanceTo(p) < keep) { ok = false; break; }
        if (ok || tries === 499) { pos.set(id, p); break; }
      }
    });
    /* THE LESSON'S HAZARDS, ON THE OBVIOUS LINE. Each hazard the level names
       (the hydrogen that takes the chlorine meant for the iron) waits on the
       straight line an atom you need would take if you simply faced it and
       tapped, so the careless pull loses it and turning finds the clear one
       (a careful player is never left without a line: checked below). Never
       on the first atom's line, which the hint points at. */
    const wanted = ids.filter((id) => id !== leadId && !hazards.includes(id) && needEls.has(st.atoms[id].el));
    hazards.forEach((h, i) => {
      if (!wanted.length) return;
      const t = wanted[(i + Math.floor(R() * wanted.length)) % wanted.length], tp = pos.get(t);
      // the heading of a player who faces the atom and taps (HEADS[0])
      const yaw = Math.atan2(-tp.x, -tp.z), pitch = Math.atan2(tp.y, Math.hypot(tp.x, tp.z)) + HEADS[0][1];
      const a = holdWorld(yaw, pitch, origin, new Vector3());
      const side = new Vector3(R() - 0.5, R() - 0.5, R() - 0.5).cross(tp.clone().sub(a)).normalize();
      const p = tp.clone().lerp(a, 0.3 + R() * 0.3).addScaledVector(side, R() * TUNE.capture * U * 0.5);
      if (p.length() > (TUNE.bubble + 4) * U) pos.set(h, p);
    });
    /* Every atom a target needs has a clear line in from a heading where it is
       on screen to be tapped (HEADS), from where you start. */
    const reach = TUNE.snap * U * 1.2, anchor = new Vector3(), half = Math.tan((FOV / 2) * Math.PI / 180), q = new Quaternion();
    const clearFrom = (id, heads) => {
      const p = pos.get(id), yaw0 = Math.atan2(-p.x, -p.z), pitch0 = Math.atan2(p.y, Math.hypot(p.x, p.z));
      for (const [oy, op] of heads) {
        const yaw = yaw0 + oy, pitch = pitch0 + op;
        const d = p.clone().applyQuaternion(q.setFromEuler(new Euler(pitch, yaw, 0, 'YXZ')).invert());
        if (d.z > -1 || Math.abs(d.y / -d.z) > half * 0.8 || Math.abs(d.x / -d.z) > half * VIEW_ASPECT * 0.8) continue;
        holdWorld(yaw, pitch, origin, anchor);
        if (![...pos].some(([o, w]) => o !== id && segDist(w, p, anchor) < reach)) return true;
      }
      return false;
    };
    let open = 0, needed = 0;
    for (const id of ids) {
      if (!needEls.has(st.atoms[id].el)) continue;
      needed++;
      if (clearFrom(id, HEADS)) open++;
    }
    // and the lead's line is clear from the start, as the hint shows it
    const leadClear = leadId < 0 || clearFrom(leadId, HEADS.slice(0, 2));
    const score = open + (leadClear ? 1 : 0);
    if (!best || score > best.score) best = { pos, score, attempt };
    if (open === needed && leadClear) break;
  }
  for (const [id, p] of best.pos) { const v = view(id); v.pos.copy(p); v.wp.copy(p); v.prev.copy(p); }
  return best;
}

let placement = null, hazardIds = [];
function startLevel(n, variant) {
  levelNo = n;
  LEVEL = LIST[n - 1];
  clearWorld();
  st = M.createState(LEVEL);
  // The panel's atoms float with the others (owner, 2026-10-02): you hold the first.
  const spare = [];
  for (const [el, k] of Object.entries(LEVEL.avail || {})) for (let i = 0; i < k; i++) { const id = M.take(st, el); M.commit(st, id); spare.push(id); }
  for (const a of st.atoms) V.set(a.id, makeView(a));
  held = new Set();
  const first = spare.length ? spare[0] : -1;
  const floating = st.atoms.map((a) => a.id).filter((id) => id !== first);
  // the lead: an atom straight ahead that the one you hold can take, and that helps
  let lead = -1;
  if (first >= 0) {
    held.add(first);
    const v = view(first); v.frame = 'cam'; v.pos.copy(HOLD);
    for (const id of floating) { const pv = M.preview(st, first, id); if (pv && !pv.lost) { lead = id; break; } }
  }
  // the atoms that are the level's named hazards (levels.js `hazards`), one per entry
  hazardIds = [];
  for (const el of LEVEL.hazards || []) {
    const id = floating.find((k) => k !== lead && st.atoms[k].el === el && !hazardIds.includes(k));
    if (id != null) hazardIds.push(id);
  }
  const vnt = variant != null ? variant : (PLACES[n - 1] || 0);
  placement = placeAtoms(floating, lead, LEVEL.seed, vnt, hazardIds);
  placement.variant = vnt;
  hintId = lead;
  glide = null; card = null; menu = null; map = null; refused = null;
  previews.clear(); helpCache.clear();
  aura = null; auraSprite.visible = false;
  look.yaw = 0; look.pitch = 0; look.vy = 0; look.vp = 0; look.pos.set(0, 0, 0); look.drift = null;
  gyroReset();
  levelT0 = clock();
  updateCamera(0);
  for (const v of V.values()) worldOf(v, v.wp);
  for (const v of V.values()) v.prev.copy(v.wp);
  buildLegend();
}

// ---------- LOOKING, TURNING, DRIFTING ----------
const look = { yaw: 0, pitch: 0, vy: 0, vp: 0, pos: new Vector3(), drift: null };
const PITCH_MAX = 80 * Math.PI / 180;
const gyro = { on: false, q: new Quaternion(), yawOff: 0, pitchOff: 0, fresh: false, last: 0 };
function gyroReset() { gyro.fresh = true; }
const zee = new Vector3(0, 0, 1), qX = new Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
function onOrient(e) {
  if (e.alpha == null || e.beta == null || e.gamma == null) return;
  const d2r = Math.PI / 180;
  const orient = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * d2r;
  const q = new Quaternion().setFromEuler(new Euler(e.beta * d2r, e.alpha * d2r, -e.gamma * d2r, 'YXZ'));
  q.multiply(qX).multiply(new Quaternion().setFromAxisAngle(zee, -orient));
  gyro.q.copy(q); gyro.last = performance.now();
  if (!gyro.on || gyro.fresh) {
    /* Keep the view where it is: from here on the phone turns it, and a drag
       still adds to it. The phone's own heading and tilt at this moment are
       taken off, so holding it tipped back does not tip the view down. */
    const f = new Vector3(0, 0, -1).applyQuaternion(q);
    gyro.yawOff = -Math.atan2(-f.x, -f.z);
    gyro.pitchOff = -Math.asin(Math.max(-1, Math.min(1, f.y)));
    gyro.on = true; gyro.fresh = false;
  }
}
let orientAsked = false;
function askOrientation() {
  /* Moving the phone to turn needs the player's permission on an iPhone, and the
     question can only be asked from a tap. Without it the game plays fully by
     dragging. */
  if (orientAsked || MODE !== 'mobile' || typeof DeviceOrientationEvent === 'undefined') return;
  orientAsked = true;
  const listen = () => window.addEventListener('deviceorientation', onOrient);
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission().then((r) => { if (r === 'granted') listen(); }).catch(() => {});
  } else listen();
}
function updateCamera(dt) {
  if (dt > 0 && !drag.active) {
    // a flick keeps turning a moment
    look.yaw += look.vy * dt; look.pitch += look.vp * dt;
    const k = Math.exp(-dt * 5); look.vy *= k; look.vp *= k;
  }
  look.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, look.pitch));
  if (gyro.on && performance.now() - gyro.last < 1000) {
    cam.quaternion.setFromAxisAngle(Y_UP, look.yaw + gyro.yawOff).multiply(gyro.q)
      .multiply(tmpQ.setFromAxisAngle(X_AXIS, look.pitch + gyro.pitchOff));
  } else {
    cam.quaternion.setFromEuler(new Euler(look.pitch, look.yaw, 0, 'YXZ'));
  }
  if (look.drift && dt > 0) {
    look.drift.v = Math.min(TUNE.driftSpeed * U, look.drift.v + TUNE.driftSpeed * U * 2 * dt);
    look.pos.addScaledVector(look.drift.dir, look.drift.v * dt);
    const lim = TUNE.room * U;
    if (look.pos.length() > lim) look.pos.setLength(lim);
  }
  cam.position.copy(look.pos);
  cam.updateMatrixWorld();
  dome.position.copy(cam.position);
  sun.position.copy(SUN_AT).applyQuaternion(cam.quaternion).add(cam.position);
  sun.target.position.copy(cam.position).add(tmpA.set(0, 0, -10).applyQuaternion(cam.quaternion));
  rim.position.copy(RIM_AT).applyQuaternion(cam.quaternion).add(cam.position);
  rim.target.position.copy(sun.target.position);
  sun.target.updateMatrixWorld(); rim.target.updateMatrixWorld();
}
function worldOf(v, out) {
  if (v.frame === 'cam') return out.copy(v.pos).applyQuaternion(cam.quaternion).add(cam.position);
  return out.copy(v.pos);
}
function toCam(id) {
  const v = view(id);
  if (v.frame === 'cam') return;
  v.pos.copy(v.wp).sub(cam.position).applyQuaternion(tmpQ.copy(cam.quaternion).invert());
  v.frame = 'cam';
}
function toWorld(id) {
  const v = view(id);
  if (v.frame !== 'cam') return;
  v.pos.copy(v.wp); v.frame = 'world'; v.vel.set(0, 0, 0);
}

// ---------- GRABS ----------
/* Answers about pairs of atoms, keyed by their ids and the state's version.
   Both start again with every level: ids and versions start again too, and a
   previous level's answer would otherwise be read as this one's. */
const previews = new Map(), helpCache = new Map();
function previewOf(a, b) {
  const key = Math.min(a, b) + ':' + Math.max(a, b) + ':' + st.version;
  if (!previews.has(key)) { if (previews.size > 400) previews.clear(); previews.set(key, M.preview(st, a, b)); }
  return previews.get(key);
}
// how close two free hands must come to grab: sooner for a grab that helps
function reachOf(a, b) {
  const pv = previewOf(a, b);
  if (!pv) return 0;
  return (pv.lost ? TUNE.capture : TUNE.snap) * U;
}
const live = (id) => st.atoms[id] && st.atoms[id].status === 'live';

function bondAtoms(a, b) {
  const A = view(a), B = view(b);
  const mid = tmpA.copy(A.wp).add(B.wp).multiplyScalar(0.5).clone();
  const ev = M.bond(st, a, b);
  if (!ev) return null;
  if (HARNESS) bondLog.push(`${st.atoms[a].el}${held.has(a) ? '(held)' : glide && glide.ids.has(a) ? '(pulled)' : ''}-${st.atoms[b].el}${held.has(b) ? '(held)' : glide && glide.ids.has(b) ? '(pulled)' : ''}x${ev.order}${ev.done ? ' ' + ev.done.kind : ''}${ev.lost ? ' LOST' : ''}`);
  previews.clear();
  addBondView(a, b, ev.order);
  flashAt(mid);
  SND.clasp(st.atoms[b].el, ev.order);
  const group = M.groupOf(st, a);
  // whatever touches what you hold becomes part of it
  if (held.has(a) || held.has(b)) { for (const id of group) { toCam(id); held.add(id); } }
  if (ev.done && ev.done.kind === 'required') {
    startLift(ev.done.ids);
    for (const id of ev.done.ids) held.delete(id);
    setTimeout(SND.lift, 120);
  } else if (ev.done) {
    // finished, and not on the list: it is used up, and lets go of you
    for (const id of ev.done.ids) { toWorld(id); held.delete(id); const v = view(id); v.ball.material = ballMat(v.el, true); v.halo.visible = false; v.letter.material = mat('letterw' + v.el, () => { const m = letterMat(v.el).clone(); m.opacity = 0.5; return m; }); }
    setTimeout(SND.waste, 60);
  }
  if (ev.lost) setTimeout(SND.lost, 90);
  if (st.result) endLevel();
  return ev;
}

/* What you hold grabs what it passes as you turn and drift, as anything the
   player carries does in /chemistry/. Checked along the way it moved, in steps
   under half a radius, so a fast turn cannot jump past an atom. */
function heldSweep() {
  if (!held.size) return;
  const ids = [...held];
  for (const h of ids) {
    if (!held.has(h) || !live(h) || !st.atoms[h].free) continue;
    const v = view(h), from = v.prev, to = v.wp;
    const n = Math.max(1, Math.ceil(from.distanceTo(to) / (0.45 * U)));
    for (let i = 1; i <= n; i++) {
      const p = tmpB.copy(from).lerp(to, i / n);
      for (const o of V.values()) {
        if (held.has(o.id) || !live(o.id) || !st.atoms[o.id].free || (glide && glide.ids.has(o.id))) continue;
        const reach = reachOf(h, o.id);
        if (reach && p.distanceTo(o.wp) < reach) { bondAtoms(h, o.id); return; }
      }
    }
  }
}

// ---------- PULLING AN ATOM IN ----------
function pull(id) {
  if (glide || card || menu || !st || st.result) return;
  if (!live(id) || held.has(id)) return;
  const piece = M.groupOf(st, id);
  let best = null;
  if (held.size) {
    // the tapped atom's free hand and the nearest of yours that it could take
    for (const t of [id, ...piece.filter((x) => x !== id)]) {
      if (!st.atoms[t].free) continue;
      for (const h of held) {
        if (!st.atoms[h].free || !M.canBond(st, t, h)) continue;
        const d = view(t).wp.distanceTo(view(h).wp);
        if (!best || d < best.d) best = { t, h, d };
      }
      if (best) break;
    }
    if (!best) { refuse(id); return; }
  }
  glide = { ids: new Set(piece), lead: best ? best.t : id, to: best ? best.h : -1, v: 0, t0: clock(), trailT: 0 };
  firstInput = true;
  SND.glide();
}
/* LET GO (owner, 2026-10-02): tap what you hold and it floats off where it
   is, a little aside so the next atom you call in does not meet it, and your
   hand is empty. Tap any atom then and it comes to your hand. It is how a
   piece is built on its own and joined later (an O-H for Al(OH)3). */
function letGo() {
  if (glide || !held.size || card) return;
  const side = tmpA.set(1, 0.45, 0).applyQuaternion(cam.quaternion).normalize().multiplyScalar(3.4);
  for (const id of held) { toWorld(id); view(id).vel.copy(side); }
  const first = view([...held][0]);
  flashAt(first.wp.clone());
  held.clear();
  firstInput = true;
  if (sfx) sfx.play('pop');
}
function refuse(id) {
  // a refusal answers visibly: the atom shakes where it is, its hands flash amber
  const v = view(id); v.shake = clock(); refused = { id, t0: clock() };
  SND.refuse();
}
function glideStep(dt) {
  const g = glide;
  if (!live(g.lead) || (g.to >= 0 && !live(g.to))) { glide = null; return; }
  g.v = Math.min(TUNE.glideMax * U, g.v + TUNE.glideAcc * U * dt);
  const lead = view(g.lead);
  const goal = g.to >= 0 ? view(g.to).wp : worldOf({ frame: 'cam', pos: HOLD }, tmpC.set(0, 0, 0)).clone();
  const total = g.v * dt;
  const n = Math.max(1, Math.ceil(total / (0.45 * U)));
  const step = new Vector3();
  for (let i = 0; i < n; i++) {
    const dist = lead.wp.distanceTo(goal);
    if (g.to >= 0 && dist < TUNE.snap * U) { const ev = bondAtoms(g.lead, g.to); glide = null; if (!ev) return; return; }
    if (g.to < 0 && dist < 0.3 * U) {
      // into your empty hand
      for (const id of g.ids) { toCam(id); held.add(id); }
      glide = null; return;
    }
    const s = Math.min(total / n, Math.max(0, dist - (g.to >= 0 ? TUNE.bond * U : 0)));
    step.copy(goal).sub(lead.wp).setLength(Math.max(1e-6, s));
    for (const id of g.ids) { const v = view(id); v.pos.add(step); v.wp.add(step); }
    // a pulled atom grabs what it passes, all the way in
    for (const x of g.ids) {
      if (!live(x) || !st.atoms[x].free) continue;
      for (const o of V.values()) {
        if (g.ids.has(o.id) || !live(o.id) || !st.atoms[o.id].free) continue;
        if (o.id === g.to && x === g.lead) continue;
        const reach = reachOf(x, o.id);
        if (!reach || view(x).wp.distanceTo(o.wp) >= reach) continue;
        const ev = bondAtoms(x, o.id);
        if (!ev) continue;
        if (ev.done || held.has(x)) { glide = null; return; }
        g.ids = new Set(M.groupOf(st, g.lead));
        if (!st.atoms[g.lead].free) {
          // the lead's last hand went to what it passed: what is left of the piece still comes in on another hand
          const nxt = [...g.ids].find((k) => st.atoms[k].free && (g.to < 0 || M.canBond(st, k, g.to)));
          if (nxt == null) { glide = null; return; }
          g.lead = nxt;
        }
        break;
      }
    }
    if (s <= 1e-6) break;
  }
  if (clock() - g.trailT > 34) { g.trailT = clock(); dropTrail(lead.wp, lead.el, lead.r); }
}

// ---------- LIFT, WIN, FAIL ----------
const liftTimes = () => (REDUCED ? { spin: 0, fly: 0 } : { spin: TUNE.spinMs, fly: TUNE.flyMs });
let aura = null;
function startLift(ids) {
  /* The molecule is kept in front of you while it celebrates: each atom's place
     is held relative to your view, so it turns with you if you turn. */
  const now = clock(), { spin, fly } = liftTimes();
  const inv = cam.quaternion.clone().invert();
  const locals = ids.map((id) => view(id).wp.clone().sub(cam.position).applyQuaternion(inv));
  const mid = locals.reduce((m, q) => m.add(q), new Vector3()).multiplyScalar(1 / locals.length);
  const size = Math.max(...locals.map((q) => q.distanceTo(mid))) + U * 2;
  ids.forEach((id, i) => { const v = view(id); v.lift = { t0: now, spin, fly, local: locals[i], mid, size }; v.frame = 'lift'; });
  aura = { t0: now, spin, mid, size };
  legend.pending = now + spin + fly;
}
function endLevel() {
  const r = st.result;
  glide = null; look.drift = null;
  const { spin, fly } = liftTimes();
  if (r.kind === 'win') markDone(levelNo);
  card = { kind: r.kind, showAt: clock() + (r.kind === 'win' ? spin + fly + TUNE.cardAfterMs : TUNE.cardFailMs), sounded: false, scroll: 0 };
}

// ---------- THE STEP ----------
function simStep(dt) {
  updateCamera(dt);
  for (const v of V.values()) { v.prev.copy(v.wp); if (v.frame === 'cam') worldOf(v, v.wp); }
  if (!card) heldSweep();
  if (glide) glideStep(dt);
  if (!REDUCED) thermal(dt);
  relax();
  for (const v of V.values()) if (v.frame === 'cam') worldOf(v, v.wp);
}
function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function thermal(dt) {
  for (const v of V.values()) {
    const a = st.atoms[v.id];
    if (v.lift || a.status === 'gone') continue;
    const m = M.ELEMENTS[v.el].mass, calm = a.status === 'waste' ? 0.45 : 1;
    const vm = TUNE.drift * U * calm / Math.pow(m, 0.3), wm = TUNE.spin * calm / Math.pow(m, 0.3);
    const k = Math.sqrt(2 * dt / TUNE.driftTau);
    v.w.multiplyScalar(1 - dt / TUNE.driftTau).add(tmpA.set(gauss(), gauss(), gauss()).multiplyScalar(wm * k));
    const ang = v.w.length() * dt;
    if (ang > 0) v.q.premultiply(tmpQ.setFromAxisAngle(tmpA.copy(v.w).normalize(), ang));
    if (v.frame === 'cam' || (glide && glide.ids.has(v.id))) continue;
    v.vel.multiplyScalar(1 - dt / TUNE.driftTau).add(tmpA.set(gauss(), gauss() * 0.6, gauss()).multiplyScalar(vm * k));
    v.pos.addScaledVector(v.vel, dt);
  }
}
function relax() {
  const B = TUNE.bond * U;
  const list = [...V.values()].filter((v) => !v.lift && st.atoms[v.id].status !== 'gone');
  const root = new Map();
  for (const v of list) if (!root.has(v.id)) { const g = M.groupOf(st, v.id); for (const id of g) root.set(id, g[0]); }
  for (let it = 0; it < 3; it++) {
    // bonds hold their length; atoms of one molecule stand apart
    for (const v of list) {
      for (const b of st.atoms[v.id].bonds) {
        if (b.to < v.id) continue;
        const o = view(b.to);
        if (o.frame !== v.frame) continue;
        const d = tmpA.copy(o.pos).sub(v.pos), L = d.length() || 1e-6;
        const c = (L - B) * 0.3 / L;
        v.pos.addScaledVector(d, c); o.pos.addScaledVector(d, -c);
      }
    }
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (a.frame !== b.frame) continue;
        const d = tmpA.copy(b.pos).sub(a.pos), L = d.length() || 1e-6;
        const same = root.get(a.id) === root.get(b.id);
        if (same) { if (L < B * TUNE.spread) { const c = (B * TUNE.spread - L) * 0.1 / L; a.pos.addScaledVector(d, -c); b.pos.addScaledVector(d, c); } continue; }
        if (a.frame === 'cam') continue;
        if (glide && (glide.ids.has(a.id) || glide.ids.has(b.id))) continue;
        let min = 0, stiff = 0;
        if (L < TUNE.collide * U) { min = TUNE.collide * U; stiff = 0.5; }
        else if (L < TUNE.keep * U && st.atoms[a.id].free && st.atoms[b.id].free) { min = TUNE.keep * U; stiff = 0.025; }
        if (min) { const c = (min - L) * stiff / L / 2; a.pos.addScaledVector(d, -c); b.pos.addScaledVector(d, c); }
      }
    }
  }
  // what you hold stays where you hold it
  const mine = list.filter((v) => v.frame === 'cam');
  if (mine.length) {
    const mid = mine.reduce((s, v) => s.add(v.pos), new Vector3()).multiplyScalar(1 / mine.length);
    const c = tmpA.copy(HOLD).sub(mid).multiplyScalar(0.12);
    for (const v of mine) v.pos.add(c);
  }
  // nothing floats into your face, and nothing leaves the room
  const bubble = TUNE.bubble * U, lim = TUNE.room * U;
  for (const v of list) {
    if (v.frame === 'cam' || (glide && glide.ids.has(v.id))) continue;
    const d = tmpA.copy(v.pos).sub(cam.position), L = d.length();
    if (L < bubble) v.pos.addScaledVector(d, (bubble - L) * 0.08 / Math.max(L, 1e-3));
    if (v.pos.length() > lim) v.pos.setLength(lim);
    v.wp.copy(v.pos);
  }
}

// ---------- DRAWING THE WORLD ----------
const camDir = new Vector3();
function drawWorld(now) {
  camDir.set(0, 0, -1).applyQuaternion(cam.quaternion);
  const camInv = cam.quaternion.clone().invert();
  const legendAt = rayDir({ x: LW / 2 + (legend.cx || 0), y: LEGEND.top + LEGEND.mol }).multiplyScalar(14).applyQuaternion(camInv);   // in front of you
  const pairs = new Map();
  if (glide && glide.to >= 0) { pairs.set(glide.lead, glide.to); pairs.set(glide.to, glide.lead); }
  for (const v of V.values()) {
    const a = st.atoms[v.id];
    let p = v.wp, scale = 1;
    if (v.lift) {
      const L = v.lift, t = now - L.t0, q = tmpB;
      if (t < L.spin) {
        // one slow turn about your view's up, swelling a little, its glow brightening and easing
        const k = t / L.spin, e = k * k * (3 - 2 * k), swell = Math.sin(k * Math.PI);
        q.copy(L.local).sub(L.mid).applyAxisAngle(Y_UP, e * Math.PI * 2).multiplyScalar(1 + 0.08 * swell).add(L.mid);
        v.halo.visible = true;
        const hs = v.r * (2.7 + 2.4 * swell); v.halo.scale.set(hs, hs, 1);
        v.halo.material.opacity = 0.38 + 0.5 * swell;
      } else {
        const k = L.fly ? Math.min(1, (t - L.spin) / L.fly) : 1, e = k * k * (3 - 2 * k);
        if (k >= 1) {
          if (!L.landed) { L.landed = true; if (sfx) sfx.play('finish'); }
          v.g.visible = false; v.wp.copy(cam.position); continue;
        }
        q.copy(L.local).lerp(legendAt, e);
        scale = 1 - 0.75 * e; v.fade = 1 - Math.max(0, (k - 0.6) / 0.4);
        v.halo.material.opacity = 0.38 * v.fade;
      }
      p = q.applyQuaternion(cam.quaternion).add(cam.position);
      v.wp.copy(p);
    } else if (a.status === 'gone') { v.g.visible = false; continue; }
    v.g.visible = true;
    v.g.position.copy(p);
    if (v.shake && now - v.shake < 420) {
      const k = 1 - (now - v.shake) / 420;
      v.g.position.addScaledVector(tmpA.set(1, 0, 0).applyQuaternion(cam.quaternion), Math.sin((now - v.shake) / 26) * 0.22 * k);
    }
    v.g.scale.setScalar(scale);
    v.ball.material.opacity = v.fade;
    /* the letter sits on the face toward you, never too small to read, and in front of
       the atom's own sticks: a bond turned toward you used to cross it (owner, 2026-10-03) */
    v.letter.position.copy(tmpA.copy(cam.position).sub(p).normalize().multiplyScalar(v.r * 1.7));
    const depth = Math.max(0.5, tmpA.copy(p).sub(cam.position).dot(camDir));
    const perUnit = (LH / 2) / (depth * Math.tan((FOV / 2) * Math.PI / 180));   // frame pixels per world unit there
    const ls = Math.min(v.r * LETTER.max, Math.max(v.r * letterBase(v.el), LETTER.cap / capOf(v.el) / perUnit));
    v.letter.scale.set(ls, ls, 1);
    const dirs = a.status === 'live' ? handDirs(v) : [];
    const partner = pairs.get(v.id);
    if (partner != null && dirs.length) dirs[0] = tmpC.copy(view(partner).wp).sub(p).normalize().clone();
    const amber = refused && refused.id === v.id && now - refused.t0 < 420;
    v.hands.forEach((h, i) => {
      const d = dirs[i];
      const on = !!d && !v.lift;
      h.arm.visible = h.flare.visible = h.tip.visible = h.tg.visible = on;
      if (!on) return;
      const len = v.r * TUNE.hand, L = v.r * (TUNE.hand - ARM.reach - 0.1);
      h.flare.quaternion.setFromUnitVectors(Y_UP, d);
      h.arm.position.copy(d).multiplyScalar(v.r * ARM.reach + L / 2);
      h.arm.quaternion.copy(h.flare.quaternion);
      h.tip.position.copy(d).multiplyScalar(len);
      h.tg.position.copy(h.tip.position);
      const green = partner != null && i === 0;
      h.tip.material = tipMat(green ? GREEN_TIP : amber ? AMBER_TIP : WHITE_TIP);
      h.tg.material.color.set(green ? GREEN_TIP : amber ? AMBER_TIP : ART[v.el].hi);
      const s = (green ? 1.9 : 0.9) * v.r; h.tg.scale.set(s, s, 1);
      h.tg.material.opacity = green ? 0.95 : 0.7;
    });
  }
  if (aura) {
    const t = now - aura.t0;
    if (t >= aura.spin) { auraSprite.visible = false; aura = null; }
    else {
      const swell = Math.sin((t / aura.spin) * Math.PI);
      auraSprite.visible = true;
      auraSprite.position.copy(aura.mid).applyQuaternion(cam.quaternion).add(cam.position);
      const s = aura.size * (2.2 + 0.6 * swell); auraSprite.scale.set(s, s, 1);
      auraSprite.material.opacity = 0.42 * swell;
    }
  }
  for (const bv of bondViews.values()) drawBond(bv);
  lettersFace();
  for (const t of trail) {
    if (!t.s.visible) continue;
    const k = (now - t.t0) / t.life;
    if (k >= 1) { t.s.visible = false; continue; }
    t.s.material.opacity = 0.42 * (1 - k);
    const s = t.size * (1 - 0.5 * k); t.s.scale.set(s, s, 1);
  }
  for (const f of flashes) {
    if (!f.s.visible) continue;
    const k = (now - f.t0) / 380;
    if (k >= 1) { f.s.visible = false; continue; }
    f.s.material.opacity = 0.9 * (1 - k);
    const s = U * (2 + 4 * k); f.s.scale.set(s, s, 1);
  }
}
/* LETTERS, ALWAYS LEGIBLE (owner, 2026-10-03: "all letters on top of the atoms
   must be clearly legible and always vertical"). A letter is drawn over
   everything, so no stick, glow or trail crosses it; it shows only when no
   nearer atom covers its own atom's middle on the screen. */
function lettersFace() {
  const seen = [];
  for (const v of V.values()) { if (!v.g.visible) continue; const s = screenOf(v); if (s) seen.push({ v, x: s.x, y: s.y, r: s.r * v.g.scale.x, z: s.z }); else v.letter.visible = false; }
  for (const A of seen) {
    let hidden = A.v.g.scale.x < 0.45 || A.v.fade < 0.3;
    for (const B of seen) { if (hidden) break; if (B !== A && B.z < A.z - 0.05 && Math.hypot(A.x - B.x, A.y - B.y) < B.r * 0.92) hidden = true; }
    A.v.letter.visible = !hidden;
  }
}
function drawLegend(now) {
  if (!legend.group) return;
  const sway = REDUCED ? 0 : Math.sin(now / 2600) * 0.35;
  let pulse = 0;
  if (legend.pending && now >= legend.pending) { legend.pulse = now; legend.pending = 0; }
  if (now - legend.pulse < 600) pulse = Math.sin((now - legend.pulse) / 600 * Math.PI) * 0.12;
  legend.mols.forEach((m, i) => {
    const t = st.targets[i], made = (st.made[t.key] || 0) >= t.n && !legend.pending;   // lit until the molecule lands
    m.g.rotation.set(0.25, sway, 0);
    m.g.scale.setScalar(m.g.userData.base * (1 + pulse));
    m.g.traverse((o) => { if (o.material) o.material.opacity = made ? 0.35 : 1; });
  });
}

// ---------- THE CHROME ----------
const hits = {};
// The one control in play, level with the legend (this game's exception to DESIGN-SYSTEM 4.2).
const pauseBox = () => ({ x: MODE === 'mobile' ? 16 : 30, y: LEGEND.top + LEGEND.h / 2 - 22, w: 44, h: 44 });
function drawPause() {
  const b = pauseBox(), cx = b.x + 22, cy = b.y + 22;
  UI.drawRound(ctx, cx, cy);
  // the pause mark, in the controls' own ink (drawIcon has no pause)
  ctx.fillStyle = UI.PILL.text;
  UI.roundRectPath(ctx, cx - 6.5, cy - 7.5, 4.5, 15, 1.5); ctx.fill();
  UI.roundRectPath(ctx, cx + 2, cy - 7.5, 4.5, 15, 1.5); ctx.fill();
  hits.pause = b;
}

// The verb shown at rest (DESIGN-SYSTEM 10.1): a soft ring taps the atom to pull in, until the first input.
function drawHint(now) {
  if (firstInput || card || menu || map || hintId < 0 || !live(hintId) || held.has(hintId)) return;
  const s = screenOf(view(hintId));
  if (!s) return;
  for (let k = 0; k < 2; k++) {
    const t = ((now - levelT0) / 1400 + k * 0.5) % 1;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 1.4 + t * 26, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - t)})`; ctx.lineWidth = 2; ctx.stroke();
  }
}

function screenOf(v) {
  const d = tmpA.copy(v.wp).sub(cam.position);
  const z = d.dot(camDir.set(0, 0, -1).applyQuaternion(cam.quaternion));
  if (z <= 0.2) return null;
  const p = tmpB.copy(v.wp).project(cam);
  const x = (p.x + 1) / 2 * LW, y = (1 - p.y) / 2 * LH;
  const r = v.r / (z * Math.tan((FOV / 2) * Math.PI / 180)) * (LH / 2);
  return { x, y, r, z };
}

/* THE MENU CARD. Everything that is not the game lives here (owner,
   2026-10-02): the chapter and level, what to make with the count, the atoms
   around you, how to play, and Resume, Restart, Levels and Sound. Three zones,
   as the rules modal: the header and the footer stay, the middle scrolls. */
const MENU = { pad: 26, kick: 16, make: 26, head: 18, row: 34, bullet: 17, lineH: 26 };
function aroundYou() {
  const n = {};
  for (const a of st.atoms) if (a.status === 'live' && !held.has(a.id)) n[a.el] = (n[a.el] || 0) + 1;
  return M.ORDER.filter((el) => n[el]).map((el) => [el, n[el]]);
}
const formulaOf = (key) => M.MOLECULES[key].formula;
const HOW = MODE === 'mobile'
  ? [['Drag', ' to look round you'], ['Tap an atom', ' to pull it in'], ['Hold', ' to drift toward it'], ['Tap what you hold', ' to let it go']]
  : [['Drag', ' to look round you'], ['Click an atom', ' to pull it in'], ['Hold', ' to drift toward it'], ['Click what you hold', ' to let it go']];
/* Every line of the card is placed here once, as an offset in its zone, and
   drawMenu only draws what this says, so the fit check measures what is drawn. */
function menuLayout() {
  const pw = Math.min(LW - 32, 470), x = Math.round((LW - pw) / 2), inner = pw - MENU.pad * 2;
  const chips = aroundYou().map(([el, k]) => ({ el, label: `${el} ×${k}`, w: 0 }));
  ctx.font = `600 ${MENU.bullet + 1}px Inter, sans-serif`;
  for (const c of chips) c.w = 22 + 10 + ctx.measureText(c.label).width + 22;
  const rows = []; let row = [], rw = 0;
  for (const c of chips) { if (row.length && rw + c.w > inner) { rows.push(row); row = []; rw = 0; } row.push(c); rw += c.w; }
  if (row.length) rows.push(row);
  // header: the kicker, the target's picture, the Make line (centres)
  const head = { kick: 34, pic: 34 + 22 + 48, make: 34 + 22 + 96 + 20 };
  const headerH = head.make + 17 + 18;
  // body: Around you, its rows, a rule, How to play, its three lines (centres)
  const body = { around: 16 + 13 }; let y = body.around + 13 + 22;
  body.rows = rows.map(() => { const r = y; y += MENU.row; return r; });
  body.rule = y - MENU.row / 2 + 18;
  body.how = body.rule + 18 + 13;
  y = body.how + 13 + 4;
  body.lines = HOW.map(() => (y += MENU.lineH));
  const bodyH = y + 9 + 16;
  const footerH = 16 + 50 + 12 + 40 + 26;
  const ph = Math.min(LH - 20, headerH + bodyH + footerH);
  const top = Math.max(10, Math.round((LH - ph) / 2));
  const viewH = ph - headerH - footerH;
  return { x, y: top, pw, ph, inner, head, headerH, body, bodyH, footerH, viewH, rows, scrollMax: Math.max(0, bodyH - viewH) };
}
function drawCardBox(x, y, w, h) {
  UI.roundRectPath(ctx, x, y, w, h, 22); ctx.fillStyle = TOK.bgCard; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = TOK.tint12; UI.roundRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 22); ctx.stroke();
}
function drawMiniMolecule(key, cx, cy, maxW, maxH) {
  // the target as a little ball-and-stick picture, for the card (game art)
  const m = molecule3d(key);
  const xs = m.p.map((q) => q.x), ys = m.p.map((q) => q.y);
  const w = Math.max(...xs) - Math.min(...xs) + 2, h = Math.max(...ys) - Math.min(...ys) + 2;
  const s = Math.min(maxW / w, maxH / h, 13);
  const P = m.p.map((q) => ({ x: cx + q.x * s, y: cy - q.y * s }));
  ctx.lineCap = 'round';
  for (const [i, j, o] of m.bonds) {
    const dx = P[j].x - P[i].x, dy = P[j].y - P[i].y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const offs = o === 1 ? [0] : o === 2 ? [-2.6, 2.6] : [-3.6, 0, 3.6];
    for (const off of offs) {
      ctx.strokeStyle = '#A9B4C8'; ctx.lineWidth = o > 1 ? 2.6 : 3.6;
      ctx.beginPath(); ctx.moveTo(P[i].x + nx * off, P[i].y + ny * off); ctx.lineTo(P[j].x + nx * off, P[j].y + ny * off); ctx.stroke();
    }
  }
  m.els.forEach((el, i) => {
    const r = s * (el === 'H' ? 0.78 : 1) * 1.05;
    const g = ctx.createRadialGradient(P[i].x - r * 0.35, P[i].y - r * 0.4, r * 0.1, P[i].x, P[i].y, r);
    g.addColorStop(0, ART[el].hi); g.addColorStop(1, ART[el].lo);
    ctx.beginPath(); ctx.arc(P[i].x, P[i].y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  });
}
function chipBall(el, x, y, r) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 2, x, y, r);
  g.addColorStop(0, ART[el].hi); g.addColorStop(1, ART[el].lo);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
}
function drawMenu() {
  const L = menuLayout();
  ctx.fillStyle = TOK.scrimWin; ctx.fillRect(0, 0, LW, LH);
  drawCardBox(L.x, L.y, L.pw, L.ph);
  const cx = L.x + L.pw / 2, lx = L.x + MENU.pad;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 ${MENU.kick}px Inter, sans-serif`; ctx.fillStyle = TOK.textDim;
  ctx.fillText(`MOLECULATOR  ·  LEVEL ${levelNo}`, cx, L.y + L.head.kick);
  drawMiniMolecule(st.targets[0].key, cx, L.y + L.head.pic, L.inner * 0.8, 60);
  ctx.font = `800 ${MENU.make}px Inter, sans-serif`; ctx.fillStyle = TOK.text;
  if (menu.note && clock() - menu.note < 2400) {
    ctx.font = `700 ${MENU.head}px Inter, sans-serif`; ctx.fillStyle = TOK.ink82;
    ctx.fillText('Only this level is built so far', cx, L.y + L.head.make);
  } else {
    const made = st.targets.reduce((s, t) => s + Math.min(t.n, st.made[t.key] || 0), 0), total = st.targets.reduce((s, t) => s + t.n, 0);
    ctx.fillText(`Make ${st.targets.map((t) => formulaOf(t.key)).join(' + ')}   ${made} / ${total}`, cx, L.y + L.head.make);
  }
  // the body, scrolled
  const by = L.y + L.headerH;
  ctx.fillStyle = TOK.tint10; ctx.fillRect(lx, by - 1, L.inner, 1);
  ctx.save();
  ctx.beginPath(); ctx.rect(L.x, by, L.pw, L.viewH); ctx.clip();
  const sc = menu.scroll = Math.max(0, Math.min(L.scrollMax, menu.scroll || 0));
  const at = (dy) => by + dy - sc;
  ctx.textAlign = 'left';
  ctx.font = `700 ${MENU.head}px Inter, sans-serif`; ctx.fillStyle = TOK.text;
  ctx.fillText('Around you', lx, at(L.body.around));
  L.rows.forEach((row, i) => {
    let xx = lx;
    for (const c of row) {
      chipBall(c.el, xx + 11, at(L.body.rows[i]), 11);
      ctx.font = `600 ${MENU.bullet + 1}px Inter, sans-serif`; ctx.fillStyle = TOK.ink90;
      ctx.fillText(c.label, xx + 32, at(L.body.rows[i]) + 1);
      xx += c.w;
    }
  });
  ctx.fillStyle = TOK.tint10; ctx.fillRect(lx, at(L.body.rule), L.inner, 1);
  ctx.font = `700 ${MENU.head}px Inter, sans-serif`; ctx.fillStyle = TOK.text;
  ctx.fillText('How to play', lx, at(L.body.how));
  HOW.forEach(([b, rest], i) => {
    const yy = at(L.body.lines[i]);
    ctx.beginPath(); ctx.arc(lx + 5, yy, 4, 0, Math.PI * 2); ctx.fillStyle = TOK.green; ctx.fill();
    ctx.font = `700 ${MENU.bullet}px Inter, sans-serif`; ctx.fillStyle = TOK.text;
    ctx.fillText(b, lx + 20, yy + 1);
    const bw = ctx.measureText(b).width;
    ctx.font = `500 ${MENU.bullet}px Inter, sans-serif`; ctx.fillStyle = TOK.ink90;
    fitText(rest, lx + 20 + bw, yy + 1, L.inner - 20 - bw);
  });
  ctx.restore();
  // a fade says there is more above or below (DESIGN-SYSTEM 5.3)
  if (sc > 0) fade(L.x, by, L.pw, 20, true);
  if (sc < L.scrollMax) fade(L.x, by + L.viewH - 20, L.pw, 20, false);
  // the footer
  const fy = by + L.viewH;
  ctx.fillStyle = TOK.tint10; ctx.fillRect(lx, fy, L.inner, 1);
  hits.resume = UI.drawCTA(ctx, 'RESUME', cx, fy + 16 + 25, ACCENT, L.inner);
  const labels = [['restart', 'Restart'], ['levels', 'Levels'], ['sound', SND.on() ? 'Sound on' : 'Sound off']];
  const py = fy + 16 + 50 + 12 + 20, gap = 10, pw = (L.inner - gap * 2) / 3;
  ctx.font = '700 15px Inter, sans-serif';
  const words = labels.every(([, l]) => ctx.measureText(l).width + 24 <= pw);
  let px = lx;
  for (const [id, label] of labels) {
    if (words) hits[id] = UI.drawPill(ctx, label, px + pw / 2, py, { w: pw });
    else {
      // too narrow for words: the house round icons, in the same order
      hits[id] = UI.drawRound(ctx, px + pw / 2, py);
      UI.drawIcon(ctx, id === 'levels' ? 'map' : id, px + pw / 2, py, { on: SND.on() });
    }
    px += pw + gap;
  }
  ctx.textAlign = 'left';
  menu.box = L;
}
function fade(x, y, w, h, top) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(top ? 0 : 1, 'rgba(19,31,54,1)'); g.addColorStop(top ? 1 : 0, 'rgba(19,31,54,0)');
  ctx.fillStyle = g; ctx.fillRect(x + 1, y, w - 2, h);
}
// A string that can grow is measured against its room, shortest form last (DESIGN-SYSTEM 10.3).
function fitText(s, x, y, room) {
  if (ctx.measureText(s).width <= room) { ctx.fillText(s, x, y); return; }
  // (centred or left-aligned alike: the text is cut, never the position)
  let t = s; while (t.length > 1 && ctx.measureText(t + '…').width > room) t = t.slice(0, -1);
  ctx.fillText(t + '…', x, y);
}

// THE RESULT CARD, after the board has answered (DESIGN-SYSTEM 10.2): the rules modal's box.
function drawCard(now) {
  if (!card || now < card.showAt) return;
  if (!card.sounded) { card.sounded = true; (card.kind === 'win' ? SND.win : SND.fail)(); }
  const pw = Math.min(LW - 56, 470), ph = Math.min(LH - 20, 300);
  const x = (LW - pw) / 2, y = Math.max(10, (LH - ph) / 2);
  ctx.fillStyle = card.kind === 'win' ? TOK.scrimWin : TOK.scrim; ctx.fillRect(0, 0, LW, LH);
  drawCardBox(x, y, pw, ph);
  const cx = LW / 2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '800 34px Inter, sans-serif'; ctx.fillStyle = TOK.text;
  const title = card.kind === 'win' ? `${st.targets.map((t) => formulaOf(t.key)).join(' + ')} made` : 'Not this time';
  ctx.fillText(title, cx, y + 34 + 24);
  ctx.font = '600 17px Inter, sans-serif'; ctx.fillStyle = TOK.ink82;
  const sub = card.kind === 'win' ? LEVEL.note : 'An atom grabbed a hand the molecule needed on its way in. Turn for a clear line and try again.';
  wrap(sub, x + 34, y + 34 + 54 + 14, pw - 68, 24, 4);
  hits.cta = UI.drawCTA(ctx, card.kind === 'win' ? (levelNo < LIST.length ? 'Next level' : 'Play again') : 'Try again', cx, y + ph - 32 - 25, ACCENT);
  card.box = { x, y, w: pw, h: ph };
}
function wrap(s, x, y, w, lh, max) {
  const words = s.split(' '); let line = '', n = 0;
  ctx.textAlign = 'left';
  for (const wd of words) {
    const t = line ? line + ' ' + wd : wd;
    if (ctx.measureText(t).width > w && line) { ctx.fillText(line, x, y + n * lh); line = wd; if (++n >= max) return; }
    else line = t;
  }
  if (line) ctx.fillText(line, x, y + n * lh);
}

/* The name under the target, with the formula in brackets (owner, 2026-10-02):
   "Aluminium oxide (Al₂O₃)". Measured against the strip, with shorter forms. */
function legendLabel() {
  const ts = st.targets;
  const name = (t) => { const m = M.MOLECULES[t.key]; return m.name[0].toUpperCase() + m.name.slice(1); };
  const count = (t) => (t.n > 1 ? ` ×${t.n}` : '');
  return [
    ts.map((t, i) => `${i ? name(t).toLowerCase() : name(t)} (${formulaOf(t.key)})${count(t)}`).join(' + '),
    ts.map((t) => `${formulaOf(t.key)}${count(t)}`).join(' + '),
  ];
}
function drawLegendLabel() {
  if (!legend.group || menu || map || (card && clock() >= card.showAt)) return;
  ctx.font = '700 16px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const room = legend.w - 28, forms = legendLabel();
  const text = forms.find((f) => ctx.measureText(f).width <= room) || forms[forms.length - 1];
  const done = st.targets.every((t) => (st.made[t.key] || 0) >= t.n) && !legend.pending;
  ctx.fillStyle = done ? TOK.ink72 : TOK.text;
  fitText(text, LW / 2 + legend.cx, LEGEND.top + LEGEND.label, room);
  ctx.textAlign = 'left';
  legend.labelText = text;
}

function drawHud(now) {
  const k = hud.width / LW;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, LW, LH);
  for (const key in hits) delete hits[key];
  drawHint(now);
  drawLegendLabel();
  if ((!card || now < card.showAt) && !map) drawPause();
  if (map) drawMap();
  else if (menu) drawMenu();
  drawCard(now);
}

// ---------- THE LEVEL MAP ----------
/* Every Moleculator level as a numbered cell: done, the next one, open, or
   not yet. On a phone the map shows the levels and nothing else (DESIGN-SYSTEM
   4.4): picking one is how you leave it. The desktop map keeps a band at the
   top with a way back to the menu. */
let map = null;   // { scroll, press, cells }
function mapLayout() {
  const band = MODE === 'mobile' ? 0 : 56, pad = MODE === 'mobile' ? 16 : 30;
  const top = band + 12, availW = LW - pad * 2;
  const cols = Math.max(4, Math.min(10, Math.round(availW / 68)));
  const cw = availW / cols, ch = Math.max(52, Math.min(68, cw * 0.92));
  const rows = Math.ceil(LIST.length / cols), viewH = LH - top - 12;
  const contentH = rows * ch;
  return { band, pad, top, cols, cw, ch, rows, viewH, contentH, scrollMax: Math.max(0, contentH - viewH) };
}
function openMap() {
  const L = mapLayout(), row = Math.floor((firstUndone() - 1) / L.cols);
  map = { scroll: Math.max(0, Math.min(L.scrollMax, row * L.ch - L.viewH / 2 + L.ch / 2)), press: null, cells: [] };
}
function drawMap() {
  const L = mapLayout(), d = doneSet(), next = firstUndone();
  map.scroll = Math.max(0, Math.min(L.scrollMax, map.scroll));
  ctx.fillStyle = TOK.scrim; ctx.fillRect(0, 0, LW, LH);
  if (L.band) {
    hits.mapBack = UI.drawPill(ctx, 'Back', L.pad + 40, L.band / 2);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    ctx.font = '600 16px Inter, sans-serif'; ctx.fillStyle = TOK.ink72;
    ctx.fillText(`MOLECULATOR   ·   ${d.size} OF ${LIST.length} DONE`, LW - L.pad, L.band / 2 + 1);
    ctx.textAlign = 'left';
  }
  ctx.save();
  ctx.beginPath(); ctx.rect(0, L.top, LW, L.viewH); ctx.clip();
  map.cells = [];
  for (let i = 0; i < LIST.length; i++) {
    const n = i + 1, x = L.pad + (i % L.cols) * L.cw, y = L.top + Math.floor(i / L.cols) * L.ch - map.scroll;
    if (y + L.ch < L.top || y > L.top + L.viewH) continue;
    const b = { x: x + 4, y: y + 4, w: L.cw - 8, h: L.ch - 8, n };
    const open = isOpen(n), done = d.has(n);
    UI.roundRectPath(ctx, b.x, b.y, b.w, b.h, 14);
    ctx.fillStyle = done ? ACCENT : open ? TOK.tint07 : TOK.tint03; ctx.fill();
    if (n === next || (open && !done)) {
      ctx.lineWidth = n === next ? 2 : 1.5; ctx.strokeStyle = n === next ? TOK.text : UI.PILL.border;
      UI.roundRectPath(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 14); ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 18px Inter, sans-serif'; ctx.fillStyle = open ? TOK.text : UI.PILL.textDim;
    ctx.fillText(String(n), b.x + b.w / 2, b.y + b.h / 2 + 1);
    map.cells.push(b);
  }
  ctx.restore();
  ctx.textAlign = 'left';
  const fadeTo = (y, up) => { const g = ctx.createLinearGradient(0, y, 0, y + 20); g.addColorStop(up ? 0 : 1, 'rgba(10,16,28,0.9)'); g.addColorStop(up ? 1 : 0, 'rgba(10,16,28,0)'); ctx.fillStyle = g; ctx.fillRect(0, y, LW, 20); };
  if (map.scroll > 0) fadeTo(L.top, true);
  if (map.scroll < L.scrollMax) fadeTo(L.top + L.viewH - 20, false);
  map.box = L;
}
function mapDown(p, e) {
  if (inBox(p, hits.mapBack)) { SND.pick(); map = null; return; }
  map.press = { y0: p.y, s0: map.scroll, moved: false, x: p.x, y: p.y };
  try { hud.setPointerCapture(e.pointerId); } catch (_) {}
}
function mapMove(p) {
  const pr = map.press;
  if (Math.abs(p.y - pr.y0) > TUNE.tapPx) pr.moved = true;
  if (pr.moved) map.scroll = pr.s0 - (p.y - pr.y0);
}
function mapUp(p) {
  const pr = map.press; map.press = null;
  if (pr.moved) return;
  const c = map.cells.find((b) => inBox(p, b));
  if (!c) return;
  if (!isOpen(c.n)) { SND.refuse(); return; }
  SND.pick(); startLevel(c.n);
}

// ---------- INPUT ----------
const drag = { active: false, id: null, x0: 0, y0: 0, x: 0, y: 0, t0: 0, mode: null, lastX: 0, lastY: 0, lastT: 0 };
function pt(e) {
  const r = hud.getBoundingClientRect();
  return { x: (e.clientX - r.left) * LW / r.width, y: (e.clientY - r.top) * LH / r.height };
}
const inBox = (p, b) => b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
function atomAt(p) {
  let best = null;
  for (const v of V.values()) {
    if (!live(v.id) || v.lift) continue;
    const s = screenOf(v);
    if (!s) continue;
    const hit = Math.max(26, s.r * 1.7), d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d <= hit && (!best || d / hit < best.k)) best = { id: v.id, k: d / hit };
  }
  return best ? best.id : null;
}
let audioAwake = false;
function wake() {
  if (!audioAwake) { audioAwake = true; SND.ready(); window.dispatchEvent(new Event('audio-awake')); }
  askOrientation();
}
hud.addEventListener('pointerdown', (e) => {
  if (drag.active) return;
  const p = pt(e);
  if (card && clock() >= card.showAt) {
    if (inBox(p, hits.cta)) { SND.pick(); startLevel(card.kind === 'win' && levelNo < LIST.length ? levelNo + 1 : levelNo); }
    return;
  }
  if (map) { mapDown(p, e); return; }
  if (card) return;
  if (menu) { menuDown(p, e); return; }
  if (inBox(p, hits.pause)) { SND.pick(); menu = { scroll: 0 }; look.drift = null; return; }
  Object.assign(drag, { active: true, id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y, t0: clock(), mode: 'pending', lastX: p.x, lastY: p.y, lastT: clock() });
  look.vy = look.vp = 0;
  try { hud.setPointerCapture(e.pointerId); } catch (_) {}
});
hud.addEventListener('pointermove', (e) => {
  if (menu && menu.drag) { const p = pt(e); menu.scroll = menu.drag.s0 - (p.y - menu.drag.y0); return; }
  if (map && map.press) { mapMove(pt(e)); return; }
  if (!drag.active || e.pointerId !== drag.id) return;
  const p = pt(e);
  if (drag.mode === 'pending' && Math.hypot(p.x - drag.x0, p.y - drag.y0) > TUNE.tapPx) {
    // a drag after all: the view follows the finger from where it first touched, not from where the drag was recognised
    drag.mode = 'look'; firstInput = true; drag.x = drag.x0; drag.y = drag.y0;
  }
  if (drag.mode === 'look') {
    // drag the space: it follows the finger, a full screen height is the view's height
    const k = (FOV * Math.PI / 180) / LH;
    look.yaw += (p.x - drag.x) * k; look.pitch += (p.y - drag.y) * k;
    const now = clock(), dt = Math.max(1, now - drag.lastT) / 1000;
    look.vy = (p.x - drag.lastX) * k / dt; look.vp = (p.y - drag.lastY) * k / dt;
    drag.lastX = p.x; drag.lastY = p.y; drag.lastT = now;
  }
  if (drag.mode === 'drift') look.drift.dir.copy(rayDir(p));
  drag.x = p.x; drag.y = p.y;
});
function endPointer(e) {
  if (menu && menu.drag) { menu.drag = null; return; }
  if (map && map.press) { mapUp(pt(e)); return; }
  if (!drag.active || e.pointerId !== drag.id) return;
  drag.active = false;
  wake();
  if (drag.mode === 'pending') {
    const id = atomAt({ x: drag.x0, y: drag.y0 });
    if (id != null) { if (held.has(id)) letGo(); else pull(id); }
  }
  if (drag.mode === 'drift') look.drift = null;
  if (drag.mode === 'look' && clock() - drag.lastT > 60) look.vy = look.vp = 0;
  drag.mode = null;
}
hud.addEventListener('pointerup', endPointer);
hud.addEventListener('pointercancel', endPointer);
for (const ev of ['touchend', 'pointerup', 'click']) window.addEventListener(ev, () => wake(), { passive: true });
hud.addEventListener('wheel', (e) => {
  if (map) { map.scroll += e.deltaY; e.preventDefault(); }
  else if (menu) { menu.scroll = (menu.scroll || 0) + e.deltaY; e.preventDefault(); }
}, { passive: false });
function rayDir(p) {
  return new Vector3((p.x / LW) * 2 - 1, 1 - (p.y / LH) * 2, 0.5).unproject(cam).sub(cam.position).normalize();
}
function holdCheck() {
  // held still long enough: drift toward what is under the finger
  if (drag.active && drag.mode === 'pending' && clock() - drag.t0 > TUNE.holdMs && !card && !menu) {
    drag.mode = 'drift'; firstInput = true;
    look.drift = { dir: rayDir({ x: drag.x, y: drag.y }), v: 0 };
  }
}
function menuDown(p, e) {
  const L = menu.box;
  if (inBox(p, hits.resume)) { SND.pick(); menu = null; return; }
  if (inBox(p, hits.restart)) { SND.pick(); startLevel(levelNo); return; }
  if (inBox(p, hits.levels)) { SND.pick(); openMap(); return; }
  if (inBox(p, hits.sound)) { SND.toggle(); return; }
  if (L && p.y > L.y + L.headerH && p.y < L.y + L.headerH + L.viewH && inBox(p, { x: L.x, y: L.y, w: L.pw, h: L.ph })) {
    menu.drag = { y0: p.y, s0: menu.scroll || 0 };
    try { hud.setPointerCapture(e.pointerId); } catch (_) {}
  }
}
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p') { if (card) return; if (map) { map = null; return; } menu = menu ? null : { scroll: 0 }; }
});

// ---------- THE LOOP ----------
const clock = () => performance.now();
let last = clock(), acc = 0, ready = false;
function frame() {
  const now = clock();
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  holdCheck();
  if (!menu && !map) {
    acc += dt * SPEED;
    let n = 0;
    while (acc >= STEP && n < 6 * SPEED) { simStep(STEP); acc -= STEP; n++; }
    if (n === 6 * SPEED) acc = 0;
  } else updateCamera(0);
  drawWorld(now);
  drawLegend(now);
  renderer.setViewport(0, 0, cssW, cssH); renderer.setScissorTest(false);
  renderer.clear();
  renderer.render(scene, cam);
  // the target, over the top of the frame
  if (!menu && !map && !(card && now >= card.showAt)) {
    const k = cssW / LW, vh = LEGEND.h * k, vy = cssH - (LEGEND.top + LEGEND.h) * k;
    renderer.clearDepth();
    renderer.setScissorTest(true);
    renderer.setScissor(0, vy, cssW, vh);
    renderer.setViewport(0, vy, cssW, vh);
    renderer.render(ov, ovCam);
    renderer.setScissorTest(false);
  }
  drawHud(now);
  if (!ready) { ready = true; window.dispatchEvent(new Event('game-ready')); }
  requestAnimationFrame(frame);
}

// ---------- START ----------
for (const ev of ['resize', 'orientationchange', 'splash-done', 'load']) window.addEventListener(ev, onResize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
setCanvasVars(); fitFullscreen();
const rect0 = gameWrap.getBoundingClientRect(); cssW = rect0.width || LW; cssH = rect0.height || LH;
startLevel(levelNo);
resizeCanvases();
document.fonts && document.fonts.ready.then(() => {});
requestAnimationFrame(frame);

// ---------- HARNESS ----------
if (HARNESS) {
  window.__litmus3d = {
    state: () => ({ LW, LH, MODE, level: levelNo, hint: hintId, held: [...held], glide: !!glide, result: st.result, made: st.made,
      card: card && card.kind, menu: !!menu, map: !!map, yaw: look.yaw, pitch: look.pitch, variant: placement && placement.variant,
      placement: placement && { attempt: placement.attempt, score: placement.score }, hazards: hazardIds }),
    atoms: () => [...V.values()].map((v) => { const s = screenOf(v); return { id: v.id, el: v.el, status: st.atoms[v.id].status, free: st.atoms[v.id].free, held: held.has(v.id), screen: s && { x: Math.round(s.x), y: Math.round(s.y), r: +s.r.toFixed(1) }, dist: +v.wp.distanceTo(cam.position).toFixed(2) }; }),
    hits: () => JSON.parse(JSON.stringify(hits)),
    look: (yaw, pitch) => { look.yaw = yaw; look.pitch = pitch; look.vy = look.vp = 0; },
    menu: (on) => { menu = on ? { scroll: 0 } : null; },
    map: (on) => { if (on) openMap(); else map = null; },
    quiet: () => { firstInput = true; },
    freeze: () => { for (const v of V.values()) { v.vel.set(0, 0, 0); v.w.set(0, 0, 0); } },
    menuFit: () => { if (!menu || !menu.box) return null; const L = menu.box; return { fits: L.headerH + L.viewH + L.footerH === L.ph && L.y >= 0 && L.y + L.ph <= LH, cardH: L.ph, frameH: LH, viewportH: L.viewH, contentH: L.bodyH, scrollMax: L.scrollMax }; },
    level: (n, variant) => { startLevel(n, variant); firstInput = true; pilot = null; pilotLast = -1; pilotDrifts = 0; bondLog.length = 0; return { level: levelNo, variant: placement.variant, score: placement.score }; },
    progress: () => JSON.parse(JSON.stringify(save)),
    /* THE PILOT, for checks only. next() says what a player would do now: drag
       to turn (frame units), tap an atom (to pull it in, or to let go of what is
       held), wait, or that it is done or stuck. The check performs every drag
       and tap as real touch or mouse events; nothing here moves the game.
       Careful: an atom that helps, from a heading where its straight line in,
       and the turn to get there, pass nothing it could grab. Careless: the
       nearest atom that helps, faced straight on, as a player who just taps
       what they see. */
    next: (careless) => pilotNext(!!careless),
    helps: (a, b) => helps(a, b),
    // for a stuck pilot: for atom `id`, every heading tried, and what blocks it
    why: (id) => {
      const out = [], tp = view(id).wp, d = tp.clone().sub(cam.position);
      const yaw0 = Math.atan2(-d.x, -d.z), pitch0 = Math.atan2(d.y, Math.hypot(d.x, d.z));
      for (let oy = -0.6; oy <= 0.61; oy += 0.15) for (let op = -0.4; op <= 0.41; op += 0.2) {
        const yaw = yaw0 + oy, pitch = pitch0 + op;
        out.push([+oy.toFixed(2), +op.toFixed(2), onScreenAt(id, yaw, pitch) ? (clearAt(id, yaw, pitch) ? (sweepClear(look.yaw, look.pitch, yaw, pitch) ? 'ok' : 'sweep') : 'line') : 'off']);
      }
      return { el: st.atoms[id].el, dist: +d.length().toFixed(1), held: [...held].map((h) => st.atoms[h].el), out: out.filter((o) => o[2] !== 'off').map((o) => o.join(' ')).join(' | ') };
    },
  };
}
let pilot = null, pilotLast = -1, lastCands = [], pilotDrifts = 0;
const bondLog = [];
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function pilotNext(careless) {
  if (!st) return { type: 'wait' };
  if (card) return { type: 'done', result: st.result && st.result.kind, bonds: bondLog.slice() };
  if (st.result || glide || menu || map) {
    const g = glide && { lead: st.atoms[glide.lead].el + glide.lead, to: glide.to, dist: +view(glide.lead).wp.distanceTo(glide.to >= 0 ? view(glide.to).wp : holdWorld(look.yaw, look.pitch, cam.position, new Vector3())).toFixed(2), v: +glide.v.toFixed(2), ids: [...glide.ids] };
    return { type: 'wait', why: st.result ? 'result' : glide ? 'glide' : menu ? 'menu' : 'map', glide: g };
  }
  if (pilot && pilot.kind === 'pull' && (!live(pilot.id) || held.has(pilot.id))) pilot = null;
  if (pilot && pilot.kind === 'letgo' && !held.has(pilot.id)) pilot = null;
  if (!pilot) {
    pilot = planMove(careless);
    if (!pilot && !held.size && !careless && pilotDrifts < 6 && lastCands.length) {
      /* No clear line from here: drift toward the nearest atom that is wanted, as
         a player would, so its line in is short. An empty hand grabs nothing on
         the way. Face it first, then hold on it. */
      const ids = lastCands.map((c) => +c.replace(/^\D+/, '')).filter((id) => live(id));
      ids.sort((a, b) => view(a).wp.distanceTo(cam.position) - view(b).wp.distanceTo(cam.position));
      const id = ids[0], d = view(id).wp.clone().sub(cam.position);
      if (d.length() > TUNE.hold * U + 3) {
        pilotDrifts++;
        pilot = { kind: 'drift', id, yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)), path: [] };
      }
    }
    if (!pilot) {
      // why: for each atom it wanted, what stood in the way at each heading
      const why = lastCands.map((c) => { const id = +c.replace(/^\D+/, ''); const r = window.__litmus3d.why(id); return c + ' d' + r.dist + ': ' + r.out; });
      return { type: 'stuck', held: [...held].map((h) => st.atoms[h].el + h), why };
    }
  }
  const k = (FOV * Math.PI / 180) / LH;
  // the way there: any headings to pass first (over the top of the crowd), then the pull's own
  while (pilot.path && pilot.path.length) {
    const [wy, wp] = pilot.path[0];
    if (Math.abs(wrapAngle(wy - look.yaw)) / k > 12 || Math.abs(wp - look.pitch) / k > 12) break;
    pilot.path.shift();
  }
  const [ty, tpch] = pilot.path && pilot.path.length ? pilot.path[0] : [pilot.yaw, pilot.pitch];
  let dy = wrapAngle(ty - look.yaw) / k, dp = (tpch - look.pitch) / k;
  if (Math.abs(dy) > 12 || Math.abs(dp) > 12) {
    dy = Math.max(-LW * 0.7, Math.min(LW * 0.7, dy)); dp = Math.max(-LH * 0.45, Math.min(LH * 0.45, dp));
    const x0 = LW / 2 - dy / 2, y0 = LH * 0.62 - dp / 2;
    return { type: 'drag', pts: [x0, y0, x0 + dy, y0 + dp] };
  }
  const move = pilot; pilot = null;
  const sp = screenOf(view(move.id));
  if (!sp) return { type: 'wait' };
  if (move.kind === 'drift') {
    // hold long enough to drift a few metres' worth, no further than the hold distance from it
    const far = view(move.id).wp.distanceTo(cam.position) - TUNE.hold * U - 2;
    return { type: 'hold', pt: [sp.x, sp.y], ms: Math.round(Math.max(380, Math.min(1400, 300 + far / (TUNE.driftSpeed * U * SPEED) * 1000))), el: st.atoms[move.id].el };
  }
  if (move.kind === 'letgo') pilotLast = M.groupOf(st, move.id)[0];
  return { type: 'tap', pt: [sp.x, sp.y], kind: move.kind, el: st.atoms[move.id].el, id: move.id, cands: lastCands, held: [...held].map((h) => st.atoms[h].el + h) };
}
// the pair a tap on `id` would make: its free hand (the tapped atom's first) and the nearest of yours it can take
function pairFor(id) {
  const piece = M.groupOf(st, id);
  for (const t of [id, ...piece.filter((x) => x !== id)]) {
    if (!st.atoms[t].free) continue;
    let best = null;
    for (const h of held) {
      if (!st.atoms[h].free || !M.canBond(st, t, h)) continue;
      const d = view(t).wp.distanceTo(view(h).wp);
      if (!best || d < best.d) best = { t, h, d };
    }
    if (best) return best;
  }
  return null;
}
/* A grab helps when it loses nothing AND what it makes is part of a target:
   a molecule on the list, or a piece some target can still grow from (the
   green palm of /chemistry/). Making a salt nobody asked for loses nothing
   either, and helps nobody. */
function helps(a, b) {
  const key = Math.min(a, b) + ':' + Math.max(a, b) + ':' + st.version;
  if (helpCache.has(key)) return helpCache.get(key);
  if (helpCache.size > 600) helpCache.clear();
  let ok = false;
  if (M.canBond(st, a, b)) {
    const c = M.clone(st), ev = M.bond(c, a, b);
    if (ev && !ev.lost) {
      if (ev.done) ok = ev.done.kind === 'required';
      else { const f = c.analysis.fragments.find((fr) => fr.ids.includes(a)); ok = !!(f && f.green); }
    }
  }
  helpCache.set(key, ok);
  return ok;
}
function planMove(careless) {
  const cands = [];
  for (const v of V.values()) {
    const t = v.id;
    if (!live(t) || held.has(t) || v.lift || !st.atoms[t].free) continue;
    if (held.size) {
      const pr = pairFor(t);
      if (!pr || !helps(pr.h, pr.t)) continue;
      cands.push({ t, size: M.groupOf(st, t).length });
    } else {
      // an empty hand: fetch something that has a helpful partner out there
      const piece = new Set(M.groupOf(st, t));
      if (piece.has(pilotLast) && V.size > piece.size + 1) continue;
      let ok = false;
      for (const u of V.values()) {
        if (piece.has(u.id) || !live(u.id) || !st.atoms[u.id].free) continue;
        if (helps(t, u.id)) { ok = true; break; }
      }
      if (ok) cands.push({ t, size: piece.size });
    }
  }
  let best = null;
  lastCands = cands.map((c) => st.atoms[c.t].el + c.t);
  for (const c of cands) {
    const tp = view(c.t).wp, d = tp.clone().sub(cam.position);
    const yaw0 = Math.atan2(-d.x, -d.z), pitch0 = Math.atan2(d.y, Math.hypot(d.x, d.z));
    const heads = careless ? [HEADS[0]] : PILOT_HEADS;
    for (const [oy, op] of heads) {
      const yaw = yaw0 + oy, pitch = Math.max(-1.2, Math.min(1.2, pitch0 + op));
      if (careless) { if (!onScreenAt(c.t, yaw, pitch)) continue; }
      else if (!clearAt(c.t, yaw, pitch)) continue;
      let path = [], extra = 0;
      if (!careless && !sweepClear(look.yaw, look.pitch, yaw, pitch)) {
        // straight round would carry what you hold through the crowd: look up (or down), turn there, come back
        path = null;
        for (const P of [1.15, -1.15]) {
          if (sweepClear(look.yaw, look.pitch, look.yaw, P) && sweepClear(look.yaw, P, yaw, P) && sweepClear(yaw, P, yaw, pitch)) {
            path = [[look.yaw, P], [yaw, P]]; extra = Math.abs(P - look.pitch) + Math.abs(P - pitch); break;
          }
        }
        if (!path) continue;
      }
      const turn = Math.abs(wrapAngle(yaw - look.yaw)) + Math.abs(pitch - look.pitch) + extra - (held.size ? 0 : c.size * 0.3);
      if (!best || turn < best.turn) best = { kind: 'pull', id: c.t, yaw, pitch, turn, path };
      break;
    }
  }
  if (best) return best;
  // nothing to pull: let go of what you hold, and build elsewhere
  if (held.size) { const id = [...held][0]; return { kind: 'letgo', id, yaw: look.yaw, pitch: look.pitch }; }
  return null;
}
// where an atom held in front of you would be, facing (yaw, pitch)
function heldAt(id, yaw, pitch, out) {
  return out.copy(view(id).pos).applyEuler(new Euler(pitch, yaw, 0, 'YXZ')).add(cam.position);
}
function onScreenAt(t, yaw, pitch) {
  const q = new Quaternion().setFromEuler(new Euler(pitch, yaw, 0, 'YXZ'));
  const d = view(t).wp.clone().sub(cam.position).applyQuaternion(q.invert());
  if (d.z > -1) return false;
  const half = Math.tan((FOV / 2) * Math.PI / 180);
  return Math.abs(d.y / -d.z) < half * 0.8 && Math.abs(d.x / -d.z) < half * (cssW / cssH) * 0.8;
}
function clearAt(t, yaw, pitch) {
  // on screen, and nothing it could grab within reach of its straight line in
  if (!onScreenAt(t, yaw, pitch)) return false;
  const pr = held.size ? pairFor(t) : null;
  const goal = pr ? heldAt(pr.h, yaw, pitch, new Vector3()) : holdWorld(yaw, pitch, cam.position, new Vector3());
  const piece = new Set(M.groupOf(st, t));
  for (const o of V.values()) {
    if (piece.has(o.id) || held.has(o.id) || !live(o.id) || !st.atoms[o.id].free) continue;
    for (const x of piece) {
      if (!st.atoms[x].free) continue;
      if (helps(x, o.id)) continue;   // a grab that helps may happen on the way
      const r = reachOf(x, o.id), from = view(x).wp, to = goal.clone().add(from).sub(view(pr ? pr.t : t).wp);
      if (r && segDist(o.wp, from, to) < r * 1.35) return false;   // room for the drift while it comes in
    }
  }
  return true;
}
function sweepClear(y0, p0, yaw, pitch) {
  // turning from (y0, p0) to (yaw, pitch) carries what you hold past nothing it could grab to harm
  const dyaw = wrapAngle(yaw - y0), dp = pitch - p0, p = new Vector3();
  const n = Math.max(6, Math.ceil((Math.abs(dyaw) + Math.abs(dp)) / 0.05));
  for (let i = 1; i <= n; i++) {
    const y = y0 + dyaw * i / n, pt = p0 + dp * i / n;
    for (const h of held) {
      if (!st.atoms[h].free) continue;
      heldAt(h, y, pt, p);
      for (const o of V.values()) {
        if (held.has(o.id) || !live(o.id) || !st.atoms[o.id].free || helps(h, o.id)) continue;
        const r = reachOf(h, o.id); if (r && p.distanceTo(o.wp) < r * 1.2) return false;
      }
    }
  }
  return true;
}
