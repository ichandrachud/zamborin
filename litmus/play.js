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
  Mesh, Group, SphereGeometry, CylinderGeometry, PlaneGeometry, LatheGeometry, Vector2,
  BufferGeometry, Float32BufferAttribute, Points, PointsMaterial,
  MeshPhysicalMaterial, MeshBasicMaterial, Sprite, SpriteMaterial, CanvasTexture,
  SRGBColorSpace, Color, Vector3, Quaternion, Euler, NeutralToneMapping,
  PMREMGenerator, AdditiveBlending, BackSide, DoubleSide, BoxGeometry, RoundedBoxGeometry,
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
// for making the cover art only: the world alone, none of the play's controls or goals
const COVER = HARNESS && /[?&]cover=1(&|$)/.test(location.search);
/* THE CHAPTER (owner, 2026-10-03: "Build all 3 sequentially, moleculator, reactor, carbon chamber"). Each is its own
   address, as its space's colour and light are built once: the Moleculator at /litmus/, the Reactor at
   /litmus/?chapter=reactor (or carbon), or #reactor where a page cannot change its address (a private phone link).
   The Carbon Chamber plays on the Reactor's sphere (reactor-scene.js) with its own agents, levels and space. */
const CHAPTER = (() => {
  const q = new URLSearchParams(location.search).get('chapter');
  for (const c of ['reactor', 'carbon']) if (q === c || new RegExp(`(^#|-)${c}(-|$)`).test(location.hash)) return c;
  return 'moleculator';
})();
const REACTOR = CHAPTER !== 'moleculator';       // the sphere's chapters: the Reactor and the Carbon Chamber
const CHAPTER_NAME = { moleculator: 'MOLECULATOR', reactor: 'REACTOR', carbon: 'CARBON CHAMBER' }[CHAPTER];
if (REACTOR && window.ReactorChem) window.ReactorChem.setChapter(CHAPTER);

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
  // the Reactor's (sulphur and bromine as /chemistry/ draws them; silver new)
  S:  { hi: '#BAA952', lo: '#765F0B', ink: '#3A2E00' },
  Br: { hi: '#E0785A', lo: '#6E2414', ink: '#FFFFFF' },
  Ag: { hi: '#E3E6EA', lo: '#7C8591', ink: '#1E2233' },
};
const GREEN_TIP = 0x5DF0A8, WHITE_TIP = 0xEAF4FF, AMBER_TIP = 0xFFB25C;

/* EACH CHAPTER HAS ITS OWN COLOUR OF SPACE (owner, 2026-10-02): the
   Moleculator's dark navy; the Reactor's EMBER (owner's pick, 2026-10-03). */
const SPACE = {
  moleculator: {
    stops: ['#03050C', '#0B1830', '#02040A'],
    glows: [[0.25, 0.5, 0.22, 'rgba(40,96,190,0.35)'], [0.75, 0.5, 0.22, 'rgba(60,70,170,0.28)'], [0.5, 0.52, 0.18, 'rgba(30,110,170,0.22)']],
    mote: 0xA8C8FF, ring: 0x3A6AB8, rim: 0x8A6AFF, envRim: 0x5A9AFF,
  },
  // the Carbon Chamber's WINE (owner, 2026-10-03: for the Carbon Chamber only)
  carbon: {
    stops: ['#0A0306', '#2C0C1E', '#050204'],
    glows: [[0.25, 0.5, 0.22, 'rgba(190,50,110,0.28)'], [0.75, 0.5, 0.22, 'rgba(140,40,120,0.24)'], [0.5, 0.52, 0.18, 'rgba(200,70,100,0.2)']],
    mote: 0xFFC2DC, ring: 0xA83A70, rim: 0xFF8AC0, envRim: 0xFF8AC0,
  },
  reactor: {
    stops: ['#0B0605', '#2A140C', '#060303'],
    glows: [[0.25, 0.5, 0.22, 'rgba(200,90,40,0.28)'], [0.75, 0.5, 0.22, 'rgba(170,70,50,0.22)'], [0.5, 0.52, 0.18, 'rgba(210,120,50,0.2)']],
    mote: 0xFFD2A8, ring: 0xB0603A, rim: 0xFFA070, envRim: 0xFFA070,
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
  /* Everything floating revolves slowly round you (owner, 2026-10-03: "the molecules could be revolving around"),
     a turn in about three minutes, so the space shows it goes all the way round. Radians a second. */
  revolve: 0.035,
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
  /* Never laid out shorter than 450, as /chemistry/: a phone on its side or a small embed (480x360) is drawn at 450
     tall and scaled to fit, so the goals, the sphere and the agents all have their room. */
  if ((MODE === 'mobile' || fullWindow()) && LH < 450 && w > 0 && h > 0) { LH = 450; LW = Math.round(450 * w / h); }
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
  if (RX) RX.relayout();   // the Reactor's sphere, agents and their names follow the frame (full screen)
  fitScrim();
}
function onResize() { setCanvasVars(); fitFullscreen(); resizeCanvases(); }

// ---------- AUDIO ----------
// The game's own sound, DEEP SPACE (owner, 2026-10-04: "more different than every other Zamborin game"): soft bells
// and slow pads in a ringing room, in litmus/sound.js, on the shared engine's context and its Sound on/off.
const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zam.litmus3d.sfx', gain: 3 }) : null;
const LS = sfx && window.LitmusSound ? window.LitmusSound(sfx) : null;
const PITCH = { H: 1175, O: 988, N: 784, C: 587, F: 1047, Cl: 880, Na: 698, K: 698, Mg: 659, Ca: 523, Al: 622, Fe: 440, Zn: 554, Cu: 494 };
const SND = {
  on:       () => !!(sfx && sfx.isOn()),
  ready:    () => { if (sfx) sfx.ensureAudio(); },
  toggle:   () => { if (sfx) { sfx.setOn(!sfx.isOn()); if (sfx.isOn() && LS) LS.tap(); } },
  pick:     () => { if (LS) LS.tap(); },
  glide:    () => { if (LS) LS.glide(); },
  release:  () => { if (LS) LS.release(); },
  clasp:    (el, n) => { if (LS) LS.bond(PITCH[el] || 660, n); },
  refuse:   () => { if (LS) LS.refuse(); },
  waste:    () => { if (LS) LS.lost(); },
  lift:     () => { if (LS) LS.made(); },
  lost:     () => { if (LS) LS.lost(); },
  goal:     () => { if (LS) LS.goal(); },
  win:      () => { if (LS) LS.won(); },
  fail:     () => { if (LS) LS.lostLevel(); },
  // the sphere's (reactor-scene.js): the agent flying in, the reaction on its timeline, a wrong agent and a pour
  agent:    () => { if (LS) LS.agent(); },
  reaction: (o) => { if (LS) LS.reaction(o); },
  bounce:   (at, poured) => { if (LS) LS.bounce(at, poured); },
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

/* AN EMPTY SPACE: nothing but a soft gradient at infinity and drifting motes for
   depth. No planet, no stars-and-station look (owner: "an empty space, not space
   as in outer space above the earth"), and no rings (owner, 2026-10-03: not the
   rings that tell you to turn; the atoms revolving round you do that). */
const space = SPACE[CHAPTER];
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
  const rimP = new Mesh(new PlaneGeometry(40, 10), new MeshBasicMaterial({ color: space.envRim })); rimP.position.set(24, 6, -30); rimP.lookAt(0, 0, 0); s.add(rimP);
  const pm = new PMREMGenerator(renderer); const t = pm.fromScene(s, 0.02).texture; pm.dispose(); return t;
})();
{
  const R = mulberry(21), p = [];
  for (let i = 0; i < 1500; i++) { const r = 4 + R() * 70, an = R() * Math.PI * 2, y = (R() - 0.5) * 70; p.push(Math.cos(an) * r, y, Math.sin(an) * r); }
  const mg = new BufferGeometry(); mg.setAttribute('position', new Float32BufferAttribute(p, 3));
  scene.add(new Points(mg, new PointsMaterial({ size: 0.11, color: space.mote, map: DOT, transparent: true, depthWrite: false, opacity: 0.85, blending: AdditiveBlending })));
}
/* OUT OF FOCUS WITH DISTANCE (owner, 2026-10-03: "as many atoms as possible floating", the far ones "out of focus as
   they go further out", "the closest ones clearest and easiest to grab"). A soft disc of an atom's colour stands in for
   its blur: a level's atom fades into one the further it is from you, and far beyond reach a field of them, out of
   focus, fills the space all round. They revolve with everything else and cannot be grabbed. */
const BOKEH = canvasTex(128, 128, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, 'rgba(255,255,255,0.95)'); r.addColorStop(0.55, 'rgba(255,255,255,0.8)');
  r.addColorStop(0.85, 'rgba(255,255,255,0.28)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});
const FOCUS = { sharp: 30, soft: 72 };   // radii from you: sharp to here, fully out of focus by there
const farField = new Group(); scene.add(farField);
// the Reactor's space is filled with real molecules instead, sharp and tappable (owner, 2026-10-03: "the rest are blurred.
// that doesn't work"; "a lot of molecules floating just like the V1 flat game"): no blurred field there
farField.visible = !REACTOR;
{
  const R = mulberry(77), els = ['H', 'H', 'O', 'C', 'N', 'Cl', 'H', 'O', 'Na', 'C', 'Mg', 'Ca'];
  for (let i = 0; i < 180; i++) {
    // a direction evenly over the whole sphere, beyond the room the level's atoms keep to
    const z = R() * 2 - 1, a = R() * Math.PI * 2, rr = Math.sqrt(1 - z * z), dist = (80 + R() * 70) * U;
    const el = els[Math.floor(R() * els.length)];
    const s = new Sprite(new SpriteMaterial({ map: BOKEH, color: new Color(ART[el].hi), transparent: true, depthWrite: false, opacity: 0.18 + R() * 0.26 }));
    const size = (el === 'H' ? 0.78 : 1) * U * (3.4 + R() * 1.8);
    s.scale.set(size, size, 1); s.position.set(Math.cos(a) * rr * dist, z * dist, Math.sin(a) * rr * dist);
    farField.add(s);
  }
}

// The light rides with you: up and slightly left of wherever you look (DESIGN-SYSTEM 6).
scene.add(new HemisphereLight(0x9AB8FF, 0x101624, 0.7));
const sun = new DirectionalLight(0xFFF4E4, 2.4), rim = new DirectionalLight(space.rim, 1.2);
scene.add(sun, sun.target, rim, rim.target);
for (const o of scene.children) if (o.isLight) o.layers.enable(1);   // they light the Reactor's agents too, drawn on layer 1
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
  // its own glass (ball and hands), so it can go out of focus on its own as it gets further from you
  const own = ballMat(el).clone();
  const ball = new Mesh(cached('ball' + r, () => new SphereGeometry(r, 40, 28)), own);
  const halo = glow(hi, r * 2.7, 0.38);
  const letter = new Sprite(letterMat(el)); letter.scale.set(r * letterBase(el), r * letterBase(el), 1); letter.renderOrder = 50;
  const blur = new Sprite(new SpriteMaterial({ map: BOKEH, color: new Color(ART[el].hi), transparent: true, depthWrite: false, opacity: 0 }));
  blur.visible = false;
  g.add(ball, halo, letter, blur);
  const L = r * (TUNE.hand - ARM.reach - 0.1);
  const hands = [];
  for (let i = 0; i < M.ELEMENTS[el].hands; i++) {
    const flare = new Mesh(flareGeo(r, ARM.base * r), own);
    const arm = new Mesh(cached('stem' + r, () => new CylinderGeometry(ARM.end * r, ARM.base * r, L, 14)), own);
    const tip = new Mesh(cached('tip' + r, () => new SphereGeometry(0.17 * r, 14, 10)), tipMat(WHITE_TIP));
    const tg = glow(hi, 0.9 * r, 0.7);
    g.add(flare, arm, tip, tg);
    hands.push({ flare, arm, tip, tg });
  }
  scene.add(g);
  const R = Math.random;
  return {
    id: a.id, el, r, g, ball, halo, letter, hands, blur, own,
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
  // each atom's own glass and blur go with it (a level change must not leave materials behind)
  for (const v of V.values()) { scene.remove(v.g); v.own.dispose(); v.ball.material.dispose(); v.blur.material.dispose(); }
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
/* THE GOALS, AT THE TOP (owner, 2026-10-03: the flat strip "does not match the rest of the visual language"; the
   pause sign "makes it seem like it is an animation or a video"). Each thing to make is an ORB, the same glass shell
   as the reaction sphere and the agents in the studies, with the molecule floating in it and its name and formula
   under it; a made one's shell turns gold. The menu is a small plain orb at the top left. */
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const SHELL = { a: '#FF2E6E', b: '#22C8F0', dark: '#140A1E' }, DONE_SHELL = { a: '#FFC24A', b: '#FF7A3A', dark: '#1E1006' };
const INK_DONE = '#9EC2FF';       // a made goal's name: the Moleculator's own light blue
const orbLayers = {};
// A dark ball whose edge glows in a band of colour (bright, nearly invisible, bright, nearly invisible), a crisp edge,
// a soft light outside it, the whole feathered before the canvas's own edge (the studies' shell, as drawn there).
function paintOrb(g, S, o) {
  const c = S / 2, R = S * o.R, cols = o.cols;
  g.clearRect(0, 0, S, S);
  if (o.outer > 0) {
    g.globalCompositeOperation = 'lighter';
    for (const [col, ang] of [[cols.a, -Math.PI / 2], [cols.b, Math.PI * 0.8]]) {
      const x = c + Math.cos(ang) * R * 0.85, y = c + Math.sin(ang) * R * 0.85, gr0 = g.createRadialGradient(x, y, 0, x, y, R * 0.95);
      gr0.addColorStop(0, hexA(col, 0.28 * o.outer)); gr0.addColorStop(1, hexA(col, 0)); g.fillStyle = gr0; g.fillRect(0, 0, S, S);
    }
    g.globalCompositeOperation = 'source-over';
  }
  let gr = g.createRadialGradient(c - R * 0.15, c - R * 0.2, 0, c, c, R);
  gr.addColorStop(0, `rgba(14,14,26,${o.body})`); gr.addColorStop(1, `rgba(6,6,14,${Math.min(1, o.body + 0.2)})`);
  g.fillStyle = gr; g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.fill();
  const L = orbLayers[S] || (orbLayers[S] = Object.assign(document.createElement('canvas'), { width: S, height: S })), q = L.getContext('2d');
  q.globalCompositeOperation = 'source-over'; q.clearRect(0, 0, S, S);
  if (q.createConicGradient) {
    const cg = q.createConicGradient(-Math.PI / 2, c, c);
    for (const [k, col] of [[0, cols.a], [0.1, cols.a], [0.22, cols.dark], [0.38, cols.dark], [0.52, cols.b], [0.7, cols.b], [0.8, cols.dark], [0.88, cols.dark], [1, cols.a]]) cg.addColorStop(k, col);
    q.fillStyle = cg;
  } else q.fillStyle = cols.a;
  q.beginPath(); q.arc(c, c, R, 0, Math.PI * 2); q.fill();
  q.globalCompositeOperation = 'destination-in';
  gr = q.createRadialGradient(c, c, 0, c, c, R);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.58, 'rgba(0,0,0,0)'); gr.addColorStop(0.8, 'rgba(0,0,0,0.25)');
  gr.addColorStop(0.93, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.985, 'rgba(0,0,0,0.78)'); gr.addColorStop(1, 'rgba(0,0,0,0.7)');
  q.fillStyle = gr; q.fillRect(0, 0, S, S); q.globalCompositeOperation = 'source-over';
  g.globalCompositeOperation = 'lighter'; g.drawImage(L, 0, 0);
  g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = Math.max(1, S / 300); g.beginPath(); g.arc(c, c, R * 0.992, 0, Math.PI * 2); g.stroke();
  g.globalCompositeOperation = 'destination-in';
  const fe = g.createRadialGradient(c, c, S * 0.38, c, c, S * 0.5); fe.addColorStop(0, 'rgba(0,0,0,1)'); fe.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fe; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
}
/* Where the goals sit, in the frame's units: one in the middle, two or three side by side (clear of the menu orb).
   `wrap` is the room for each one's name. */
const GOAL_Y = 46;
/* The goals along the top: as far apart as designed, but each orb clear of the menu button and the edge, and each name
   in its own strip (lo to hi) so it never meets a neighbour's or leaves the frame (a 320-wide phone, a portal's
   800x450). A name too wide for its strip shows its formula instead (goalLines). */
function goalLayout(n) {
  const mob = MODE === 'mobile';
  if (n <= 1) return [{ x: LW / 2, R: mob ? 40 : 44, wrap: LW - 80, lo: 40, hi: LW - 40 }];
  const m = pauseBox(), left = m.x + m.w + 8, right = LW - 8;
  const R = n === 2 ? (mob ? 34 : 40) : (mob ? 28 : 36), want = n === 2 ? (mob ? 88 : 130) : (mob ? 115 : 180);
  const sp = Math.min(want, (right - left - 2 * R) / 2), ks = n === 2 ? [-1, 1] : [-1, 0, 1];
  const cx = Math.max(left + sp + R, Math.min(right - sp - R, LW / 2 + (n === 3 && mob ? 20 : 0)));
  const xs = ks.map((k) => cx + k * sp);
  return xs.map((x, i) => {
    const lo = i === 0 ? 8 : (xs[i - 1] + x) / 2 + 4, hi = i === xs.length - 1 ? LW - 8 : (x + xs[i + 1]) / 2 - 4;
    return { x, R, lo, hi, wrap: Math.min(n === 2 ? sp * 2 - 16 : sp - 6, hi - lo) };
  });
}
const shapes = new Map();
function molecule3d(key) {
  if (!shapes.has(key)) shapes.set(key, shapeOf(key));
  return shapes.get(key);
}
function shapeOf(key) {
  // a Reactor molecule: lab.js's picture, as the space draws it
  if (REACTOR) {
    const sp = window.ReactorChem.SPECIES[key];
    const p = sp.atoms.map((a, i) => new Vector3(a.x * 2.6, -a.y * 2.6, ((i * 0.37) % 1 - 0.5) * 0.65));
    return { els: sp.atoms.map((a) => a.el), p, bonds: sp.bonds.map((b) => [b.a, b.b, b.order]) };
  }
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
  if (legend.group) { ov.remove(legend.group); for (const m of legend.mols) { m.map.dispose(); m.orb.material.dispose(); } }
  const G = new Group(); ov.add(G);
  legend.group = G; legend.mols = []; legend.pending = 0;
  for (const t of st.targets) {
    const m = molecule3d(t.key), g = new Group();
    // its own materials, so nothing done to a goal ever touches an atom in the space
    const own = new Map(), mine = (k, make) => { if (!own.has(k)) own.set(k, make().clone()); return own.get(k); };
    let ext = 0;
    m.els.forEach((el, i) => {
      const b = new Mesh(cached('ball' + rOf(el), () => new SphereGeometry(rOf(el), 40, 28)), mine('b' + el, () => ballMat(el)));
      b.position.copy(m.p[i]).multiplyScalar(U); b.scale.setScalar(0.74); g.add(b);
      ext = Math.max(ext, m.p[i].length() * U + rOf(el) * 0.74);
    });
    for (const [i, j, o] of m.bonds) {
      const a = m.p[i].clone().multiplyScalar(U), b = m.p[j].clone().multiplyScalar(U);
      const d = b.clone().sub(a), L = d.length(); d.normalize();
      const side = d.clone().cross(new Vector3(0, 0, 1)).normalize();
      const offs = o === 1 ? [0] : o === 2 ? [-0.16 * U, 0.16 * U] : [-0.22 * U, 0, 0.22 * U];
      const rad = o > 1 ? 0.085 * U : 0.12 * U;
      for (const off of offs) for (const [el, k] of [[m.els[i], 0.25], [m.els[j], 0.75]]) {
        const s = new Mesh(cached('stick' + rad, () => new CylinderGeometry(rad, rad, 1, 10)), mine('s' + el, () => stickMat(el)));
        s.quaternion.setFromUnitVectors(Y_UP, d); s.scale.set(1, L / 2, 1);
        s.position.copy(a).addScaledVector(d, L * k).addScaledVector(side, off);
        g.add(s);
      }
    }
    // the orb, behind the molecule (and hidden by it)
    const cv = Object.assign(document.createElement('canvas'), { width: 256, height: 256 }), map = new CanvasTexture(cv); map.colorSpace = SRGBColorSpace;
    const orb = new Sprite(new SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped: false })); orb.renderOrder = -1;
    G.add(orb, g);
    const rec = { key: t.key, g, ext: ext || U, orb, cv, map, done: null };
    paintGoal(rec, false);
    legend.mols.push(rec);
  }
  fitLegend();
}
function paintGoal(m, done) {
  m.done = done;
  paintOrb(m.cv.getContext('2d'), 256, { cols: done ? DONE_SHELL : SHELL, R: 0.36, body: 0.6, outer: done ? 0.95 : 0.45 });
  m.map.needsUpdate = true;
}
/* The legend's room, in the frame's units: a band along the top, the goals' orbs in it (`GOAL_Y` from its top), their
   names under them drawn on the 2D layer. */
const LEGEND = { top: 10, h: 100 };
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
  const lay = goalLayout(legend.mols.length), behind = (legend.D + 120) / legend.D, y = (LEGEND.h / 2 - GOAL_Y) * k;
  legend.mols.forEach((m, i) => {
    const L = lay[i], x = (L.x - LW / 2) * k, os = L.R / 0.36 * k * behind;
    m.orb.scale.set(os, os, 1); m.orb.position.set(x * behind, y * behind, -120);
    const sc = L.R * 0.72 * k / m.ext;      // the molecule fills the orb's middle
    m.g.scale.setScalar(sc); m.g.userData.base = sc; m.g.position.set(x, y, 0);
  });
  legend.lay = lay;
}

/* A soft dark fade over the top of the space (as in the studies): atoms drifting under the goals go quiet there
   instead of crowding their names. Not a strip: no edge, only the space getting darker. Drawn between the world and
   the goals. */
const scrim = { s: new Scene(), c: new PerspectiveCamera(6, 1, 1, 100000), mesh: null };
// how dark the fade is at height y of the frame (0 to 1): names drawn over the space go as dark as what they name
function shadeAt(y) {
  const t = y / LH, st = scrim.stops || [[0, 0], [1, 0]];
  for (let i = 1; i < st.length; i++) if (t <= st[i][0]) { const [a, p] = st[i - 1], [b, q] = st[i]; return b > a ? p + (q - p) * Math.max(0, (t - a) / (b - a)) : q; }
  return st[st.length - 1][1];
}
function fitScrim() {
  const D = (cssH / 2) / Math.tan(3 * Math.PI / 180);
  scrim.c.aspect = cssW / Math.max(1, cssH); scrim.c.position.set(0, 0, D); scrim.c.lookAt(0, 0, 0); scrim.c.updateProjectionMatrix();
  if (scrim.mesh) { scrim.s.remove(scrim.mesh); scrim.mesh.material.map.dispose(); scrim.mesh.material.dispose(); }
  const end = Math.min(0.5, (LEGEND.top + GOAL_Y + 44 + 64) / LH);    // fades out just below the goals' names
  scrim.stops = [[0, 0.92], [end * 0.55, 0.78], [end, 0]];
  if (REACTOR) {   // the Reactor's goals keep a darker band: dark down past their names, gone 90px below (owner, 2026-10-03)
    const nm = LEGEND.top + GOAL_Y + 44;
    const tail = Math.min(90, LH * 0.12);     // a short window keeps more of its height clear
    scrim.stops = [[0, 0.94], [(nm + 14) / LH, 0.86], [(nm + 14 + tail * 0.4) / LH, 0.42], [(nm + 14 + tail) / LH, 0]];
  }
  // the Reactor's agents sit at the foot: the space darkens again from under the sphere, so what floats there goes
  // quiet behind them instead of running into them (owner, 2026-10-03). The agents are drawn after it.
  const band = RX && RX.band();
  if (band) { const a = Math.max(scrim.stops[scrim.stops.length - 1][0] + 0.02, (band.top - 12) / LH), b = Math.max(a + 0.04, band.full / LH); scrim.stops.push([a, 0], [(a + b) / 2, 0.42], [b, 0.82], [1, 0.92]); }
  else scrim.stops.push([1, 0]);
  const map = canvasTex(4, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h);
    for (const [k, al] of scrim.stops) gr.addColorStop(k, `rgba(2,4,10,${al})`);
    g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  scrim.mesh = new Mesh(new PlaneGeometry(cssW, cssH), new MeshBasicMaterial({ map, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  scrim.s.add(scrim.mesh);
}

// ---------- THE REACTOR'S SCENE ----------
/* reactor-scene.js plays the Reactor in this world (as /chemistry/'s lab-scene.js plays it there): it is handed the
   camera, the materials and the goal orbs, and tells this file when a product lands and when the level ends. */
const RX = REACTOR && window.ReactorScene ? window.ReactorScene({
  THREE: { Vector3, Quaternion, Euler, Color, Group, Mesh, Sprite, SpriteMaterial, CanvasTexture, SRGBColorSpace, SphereGeometry, CylinderGeometry,
    BoxGeometry, RoundedBoxGeometry, PlaneGeometry, MeshPhysicalMaterial, MeshBasicMaterial, BufferGeometry, Float32BufferAttribute, Points, PointsMaterial,
    AdditiveBlending, BackSide, DoubleSide, PMREMGenerator, Scene },
  scene, cam, renderer, U, ART, rOf, ballMat, stickMat, letterMat, letterBase, cached, DOT, MODE, REDUCED, Y_UP, SND,
  clock: () => clock(), frame: () => ({ LW, LH }), shade: (y) => (menu || map || COVER ? 0 : shadeAt(y)),
  // where the goals' names end (two lines when there are several goals, which may wrap)
  goalsBottom: (targets) => {
    const n = Math.max(1, targets.length), lay = goalLayout(n);
    ctx.save(); ctx.font = '600 16px Inter, sans-serif';
    const lines = Math.max(1, ...targets.map((t, i) => goalLines(t, lay[i].wrap, n).length));
    ctx.restore();
    return LEGEND.top + GOAL_Y + lay[0].R + 20 + 19 * (lines - 1) + 10;
  },
  // where goal i's orb is, in the world, and its molecule landing there
  goalWorld: (i) => { const L = (legend.lay || goalLayout(1))[i] || goalLayout(1)[0]; return rayDir({ x: L.x, y: LEGEND.top + GOAL_Y }).multiplyScalar(14).add(cam.position); },
  hold: () => { legend.pending = Infinity; },
  landed: () => { legend.pending = clock(); SND.goal(); },
  moved: () => { moves++; },
  ended: (r) => endLevel(r),
}) : null;

// ---------- ANALYTICS ----------
// The site's play counters (shared/analytics.js), kept as the 2D game kept them: one level number across the chapters
// (the Moleculator 1-100, the Reactor 101-160, the Carbon Chamber 161-200), and 0 for the daily molecule, as Comb does.
// A move is a bond made, or a reaction or a wrong agent in the sphere.
const NOOP = { init() {}, levelStart() {}, levelComplete() {}, levelRestart() {}, track() {} };
const TRACK = () => (window.ZAM_TRACK || NOOP);
TRACK().init('litmus');
const trackedLevel = () => (dailyOn ? 0 : { moleculator: 0, reactor: 100, carbon: 160 }[CHAPTER] + levelNo);
let moves = 0;

// ---------- LEVEL ----------
// the Reactor's 60 levels are one list for both (litmus/reactor-levels.js)
/* The phone's first two levels were both water (owner, 2026-10-04: "The first 2 levels are both H2O"). The 2D game's
   levels.js stays as it is (the live /chemistry/ plays it); here phone level 2 makes hydrogen gas, keeping its lesson:
   the hydrogen you hold grabs the first hand it touches, and the sodium on the way is the trap. */
const OWN = { mobile: { 2: { targets: [['hydrogen-gas', 1]], avail: { H: 1 }, needs: ['H'] } } };
// a changed level's atoms are dealt again from its recipe (levels.js withCrowd), as the 2D game deals them
const moleculator = (set) => set.map((L, i) => { const o = (OWN[MODE] || {})[i + 1]; return o ? LV.withCrowd(Object.assign({}, L, o), L.crowd[0]) : L; });
const LIST = CHAPTER === 'carbon' ? window.CARBON_LEVELS : REACTOR ? window.REACTOR_LEVELS : moleculator(MODE === 'mobile' ? LV.mobile : LV.desktop);
/* PROGRESS. The phone and the desktop play different level sets (as /chemistry/),
   so each keeps its own record. Levels open in order; a returning player lands
   on the first level not yet done (DESIGN-SYSTEM 10.1). */
const SAVE_KEY = { moleculator: 'zam.litmus3d.progress', reactor: 'zam.litmus3d.reactor', carbon: 'zam.litmus3d.carbon' }[CHAPTER];
let save = (() => { try { const v = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } })();
const doneSet = () => new Set((save[MODE] && save[MODE].done) || []);
function markDone(n) {
  const d = doneSet(); d.add(n);
  save[MODE] = { done: [...d].sort((a, b) => a - b), last: n };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) { /* private window: play on unsaved */ }
}
const isOpen = (n) => n === 1 || doneSet().has(n) || doneSet().has(n - 1);
function firstUndone() { const d = doneSet(); for (let n = 1; n <= LIST.length; n++) if (!d.has(n)) return n; return LIST.length; }
// Which 3D placement each level uses: tools/litmus/levels.mjs picks the first one its checks pass.
const PLACES = (window.LITMUS3D_PLACES && window.LITMUS3D_PLACES[MODE]) || [];
let levelNo = (() => { const m = location.hash.match(/level-(\d+)/); const n = m ? +m[1] : firstUndone(); return Math.max(1, Math.min(LIST.length, n)); })();
/* ---------- THE DAILY (NEW-GAME-PROMPT 9; owner, 2026-10-04: "Daily molecule") ----------
   One molecule a day in the Moleculator, the same for everyone: the date (UTC) picks it from the molecules a level makes
   on its own in both sets (48), in an order that runs through them all before any comes back. Its atoms are dealt from
   that level's recipe with the day's own seed, and each day's 3D placement was played and won by the pilot before it
   shipped (dailies.js, tools/litmus/levels.mjs --daily). A streak counts days in a row; only the daily moves it. A
   returning player lands on it until it is done; a new one starts at level 1. */
const DAY_MS = 86400000, DAILY_EPOCH = Date.UTC(2026, 9, 4);      // day 0: 4 October 2026
const dayOf = (ms) => Math.floor((ms - DAILY_EPOCH) / DAY_MS);
const TODAY = dayOf(Date.now());
const DAILY_KEYS = (() => {
  const one = (set) => new Set(set.filter((L) => L.targets.length === 1 && L.targets[0][1] === 1).map((L) => L.targets[0][0]));
  const a = one(LV.mobile), b = one(LV.desktop);
  return [...a].filter((k) => b.has(k)).sort();
})();
function dailyKey(day) {
  const n = DAILY_KEYS.length, cycle = Math.floor(day / n), pos = ((day % n) + n) % n;
  let x = (cycle * 7919 + 2026) | 0;
  const r = () => { x = (x + 0x6D2B79F5) | 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const order = DAILY_KEYS.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order[pos];
}
// a day's code (dailies.js): its deal of atoms times ten, plus its placement; a deal past the first is a fresh seed
function dailyLevel(day, code) {
  const key = dailyKey(day), base = LIST.find((L) => L.targets.length === 1 && L.targets[0][0] === key && L.targets[0][1] === 1);
  return LV.withCrowd(Object.assign({}, base, { seed: 50000 + day + 7919 * Math.floor((code || 0) / 10) }), base.crowd[0]);
}
const DAILY_PLACES = (window.LITMUS3D_DAILIES && window.LITMUS3D_DAILIES[MODE]) || [];
const dailyCode = (day) => DAILY_PLACES[day] || 0;
const dailyDate = (day) => new Date(DAILY_EPOCH + day * DAY_MS).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '').toUpperCase();
const dailyDone = () => !!(save.daily && save.daily.last === TODAY);
let dailyOn = false, dailyDay = TODAY;
function markDaily() {
  if (dailyDay !== TODAY || dailyDone()) return;     // an old day, or today's again: the streak stays
  const d = save.daily || {};
  save.daily = { last: TODAY, streak: d.last === TODAY - 1 ? (d.streak || 0) + 1 : 1 };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) { /* private window: play on unsaved */ }
  TRACK().track('daily_played', { streak: save.daily.streak });
}
let dailyCodeNow = 0;
function startDaily(code, day) { dailyDay = day != null ? day : TODAY; dailyCodeNow = code != null ? code : dailyCode(dailyDay); startLevel(levelNo, dailyCodeNow % 10, true); }
// after a level, what comes next: the daily again if it was lost, else the ladder
const nextFromCard = (won) => betweenLevels(() => (dailyOn ? (won ? startLevel(firstUndone()) : startDaily()) : startLevel(won && levelNo < LIST.length ? levelNo + 1 : levelNo)), won);
const againFromCard = () => { if (!card || card.kind !== 'win') TRACK().levelRestart(trackedLevel()); betweenLevels(() => (dailyOn ? startDaily() : startLevel(levelNo)), false); };
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
   way you can face. The rest are all round you, above and below as well. Placed from the level's seed, so a level is always the
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
        // the rest all round you, above and below too (owner, 2026-10-03: atoms everywhere you can look)
        const pitch = Math.asin((R() * 2 - 1) * Math.sin((front ? FRONT.pitch : 72) * Math.PI / 180)) * 180 / Math.PI;
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

let placement = null, hazardIds = [], opening = null, splashGone = false;
window.addEventListener('splash-done', () => { splashGone = true; if (opening && opening.t0 === Infinity) opening.t0 = clock() + 600; });
function startLevel(n, variant, isDaily) {
  levelNo = n;
  dailyOn = !!isDaily && !REACTOR;
  LEVEL = dailyOn ? dailyLevel(dailyDay, dailyCodeNow) : LIST[n - 1];
  moves = 0; TRACK().levelStart(trackedLevel());
  clearWorld();
  if (REACTOR) {
    st = RX.start(LEVEL, n);
    card = null; menu = null; map = null; glide = null; opening = null; hintId = -1;
    look.yaw = 0; look.pitch = 0; look.vy = 0; look.vp = 0; look.pos.set(0, 0, 0); look.drift = null;
    gyroReset(); levelT0 = clock(); updateCamera(0);
    legend.pending = 0;
    buildLegend();
    return;
  }
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
  const vnt = variant != null ? variant : dailyOn ? dailyCodeNow % 10 : (PLACES[n - 1] || 0);
  placement = placeAtoms(floating, lead, LEVEL.seed, vnt, hazardIds);
  placement.variant = vnt;
  hintId = lead;
  glide = null; card = null; menu = null; map = null; refused = null;
  previews.clear(); helpCache.clear();
  aura = null; auraSprite.visible = false;
  look.yaw = 0; look.pitch = 0; look.vy = 0; look.vp = 0; look.pos.set(0, 0, 0); look.drift = null;
  /* THE OPENING (owner, 2026-10-03: "the first onboarding session could show that the user pans to find the right
     molecule"). The very first time, you start facing away from the atom to take, and a finger drags the view round to
     it; then the ring shows the tap. Any touch hands the view straight back to you. */
  opening = null;
  if (!HARNESS && n === 1 && !doneSet().size && !save.opened) {
    look.yaw = Math.PI; opening = { t0: splashGone ? clock() + 700 : Infinity, ms: 1900 };   // it starts once the cover has gone
    save.opened = true; try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) { /* private window */ }
  }
  gyroReset();
  levelT0 = clock();
  updateCamera(0);
  for (const v of V.values()) worldOf(v, v.wp);
  for (const v of V.values()) v.prev.copy(v.wp);
  buildLegend();
}

// ---------- LOOKING, TURNING, DRIFTING ----------
const look = { yaw: 0, pitch: 0, vy: 0, vp: 0, pos: new Vector3(), drift: null };
// you may look up to straight overhead and down to straight below, and up stays up (owner, 2026-10-03)
const PITCH_MAX = 88 * Math.PI / 180;
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
  if (opening) {
    const k = opening.t0 === Infinity ? 0 : Math.max(0, Math.min(1, (clock() - opening.t0) / opening.ms));
    look.yaw = Math.PI * (1 - k * k * (3 - 2 * k));
    if (k >= 1) opening = null;
  }
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
  moves++;
  if (HARNESS) bondLog.push(`${st.atoms[a].el}${held.has(a) ? '(held)' : glide && glide.ids.has(a) ? '(pulled)' : ''}-${st.atoms[b].el}${held.has(b) ? '(held)' : glide && glide.ids.has(b) ? '(pulled)' : ''}x${ev.order}${ev.done ? ' ' + ev.done.kind : ''}${ev.lost ? ' LOST' : ''}`);
  previews.clear();
  addBondView(a, b, ev.order);
  flashAt(mid);
  SND.clasp(st.atoms[b].el, ev.order);
  const group = M.groupOf(st, a);
  // whatever touches what you hold becomes part of it
  if (held.has(a) || held.has(b)) { for (const id of group) { toCam(id); held.add(id); } }
  if (ev.done && ev.done.kind === 'required') {
    startLift(ev.done.ids, ev.done.key);
    for (const id of ev.done.ids) held.delete(id);
    setTimeout(SND.lift, 120);
  } else if (ev.done) {
    // finished, and not on the list: it is used up, and lets go of you
    for (const id of ev.done.ids) { toWorld(id); held.delete(id); const v = view(id); v.ball.material = ballMat(v.el, true).clone(); v.halo.visible = false; v.letter.material = mat('letterw' + v.el, () => { const m = letterMat(v.el).clone(); m.opacity = 0.5; return m; }); }
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
  SND.release();
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
function startLift(ids, key) {
  /* The molecule is kept in front of you while it celebrates: each atom's place
     is held relative to your view, so it turns with you if you turn. */
  const now = clock(), { spin, fly } = liftTimes();
  const inv = cam.quaternion.clone().invert();
  const locals = ids.map((id) => view(id).wp.clone().sub(cam.position).applyQuaternion(inv));
  const mid = locals.reduce((m, q) => m.add(q), new Vector3()).multiplyScalar(1 / locals.length);
  const size = Math.max(...locals.map((q) => q.distanceTo(mid))) + U * 2;
  const goal = Math.max(0, st.targets.findIndex((t) => t.key === key));      // which orb it flies to
  ids.forEach((id, i) => { const v = view(id); v.lift = { t0: now, spin, fly, local: locals[i], mid, size, goal }; v.frame = 'lift'; });
  aura = { t0: now, spin, mid, size };
  legend.pending = now + spin + fly;
}
function endLevel(rr) {
  if (REACTOR) {
    if (card) return;
    if (rr.kind === 'win') { markDone(levelNo); TRACK().levelComplete(trackedLevel(), moves); }
    card = { kind: rr.kind, why: rr.why, showAt: clock() + (rr.kind === 'win' ? 700 : TUNE.cardFailMs), sounded: false, scroll: 0, tab: 0, electrons: false };
    return;
  }
  const r = st.result;
  glide = null; look.drift = null;
  const { spin, fly } = liftTimes();
  if (r.kind === 'win') { if (dailyOn) markDaily(); else markDone(levelNo); TRACK().levelComplete(trackedLevel(), moves); }
  card = { kind: r.kind, showAt: clock() + (r.kind === 'win' ? spin + fly + TUNE.cardAfterMs : TUNE.cardFailMs), sounded: false, scroll: 0, tab: 0, electrons: false };
}

// ---------- THE STEP ----------
function simStep(dt) {
  if (REACTOR) { updateCamera(dt); RX.step(dt); return; }
  updateCamera(dt);
  for (const v of V.values()) { v.prev.copy(v.wp); if (v.frame === 'cam') worldOf(v, v.wp); }
  if (!card) heldSweep();
  if (glide) glideStep(dt);
  if (!REDUCED) thermal(dt);
  revolve(dt);
  relax();
  for (const v of V.values()) if (v.frame === 'cam') worldOf(v, v.wp);
}
// The whole floating world turns about the room's upright axis, rigidly, so a level's lines stay as they were placed.
function revolve(dt) {
  const a = TUNE.revolve * dt;
  if (!a) return;
  const q = new Quaternion().setFromAxisAngle(Y_UP, a);
  for (const v of V.values()) {
    if (v.frame !== 'world' || v.lift || st.atoms[v.id].status === 'gone' || (glide && glide.ids.has(v.id))) continue;
    v.pos.applyQuaternion(q); v.vel.applyQuaternion(q); v.q.premultiply(q);
  }
  farField.rotation.y += a;
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
  if (REACTOR) { RX.draw(now); return; }
  camDir.set(0, 0, -1).applyQuaternion(cam.quaternion);
  const camInv = cam.quaternion.clone().invert();
  // where each goal's orb is, in front of you
  const goalAt = (legend.lay || goalLayout(1)).map((L) => rayDir({ x: L.x, y: LEGEND.top + GOAL_Y }).multiplyScalar(14).applyQuaternion(camInv));
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
          if (!L.landed) { L.landed = true; SND.goal(); }
          v.g.visible = false; v.wp.copy(cam.position); continue;
        }
        q.copy(L.local).lerp(goalAt[L.goal] || goalAt[0], e);
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
    // out of focus with distance: the glass fades into a soft disc of its own colour; the nearest stay sharp
    const fd = v.lift ? 0 : Math.max(0, Math.min(1, (tmpA.copy(p).sub(cam.position).length() / U - FOCUS.sharp) / (FOCUS.soft - FOCUS.sharp)));
    const blurK = fd * fd * (3 - 2 * fd);
    v.ball.material.opacity = v.own.opacity = v.fade * (1 - 0.82 * blurK);
    v.blur.visible = blurK > 0.02;
    if (v.blur.visible) { const bs = v.r * (2.1 + 1.4 * blurK); v.blur.scale.set(bs, bs, 1); v.blur.material.opacity = 0.8 * blurK * v.fade; }
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
      h.arm.visible = h.flare.visible = on;
      h.tip.visible = h.tg.visible = on && blurK < 0.6;     // out of focus, the bright tips go first
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
      h.tg.material.opacity = (green ? 0.95 : 0.7) * (1 - blurK);
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
    const t = st.targets[i], made = (st.made[t.key] || 0) >= t.n && !legend.pending;   // gold once the molecule has landed
    if (made !== m.done) paintGoal(m, made);
    m.g.rotation.set(0.25, sway, 0);
    m.g.scale.setScalar(m.g.userData.base * (1 + pulse));
  });
}

// ---------- THE CHROME ----------
const hits = {};
// The one control in play: a small plain orb at the top left, level with the goals; it opens the menu card.
const pauseBox = () => ({ x: MODE === 'mobile' ? 16 : 30, y: LEGEND.top + GOAL_Y - 22, w: 44, h: 44 });
/* The menu: a hamburger, three short rounded lines and nothing behind them (owner, 2026-10-03: "show a menu
   hamburger", "no bubble behind the hamburger"). A soft dark shadow keeps it readable over a bright molecule. */
function drawPause() {
  const b = pauseBox(), cx = b.x + 22, cy = b.y + 22;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 6;
  ctx.strokeStyle = TOK.text; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const dy of [-7, 0, 7]) { ctx.moveTo(cx - 10, cy + dy); ctx.lineTo(cx + 10, cy + dy); }
  ctx.stroke();
  ctx.restore();
  hits.pause = b;
}

// The verb shown at rest (DESIGN-SYSTEM 10.1): a soft ring taps the atom to pull in, until the first input.
function drawHint(now) {
  if (firstInput || opening || card || menu || map || hintId < 0 || !live(hintId) || held.has(hintId)) return;
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
  if (REACTOR) {
    // the molecules floating round you, by formula, each with a ball of its first atom other than hydrogen
    const n = {};
    for (const p of st.pieces) if (p.zone === 'space') n[p.key] = (n[p.key] || 0) + 1;
    return Object.keys(n).map((k) => { const sp = window.ReactorChem.SPECIES[k], a = sp.atoms.find((x) => x.el !== 'H') || sp.atoms[0]; return [a.el, n[k], sp.formula]; });
  }
  const n = {};
  for (const a of st.atoms) if (a.status === 'live' && !held.has(a.id)) n[a.el] = (n[a.el] || 0) + 1;
  return M.ORDER.filter((el) => n[el]).map((el) => [el, n[el]]);
}
const molInfo = (key) => (REACTOR ? window.ReactorChem.SPECIES[key] : M.MOLECULES[key]);
const formulaOf = (key) => molInfo(key).formula;
const HOW = REACTOR
  ? [['Drag', ' to look round you'], [MODE === 'mobile' ? 'Tap a molecule' : 'Click a molecule', ' to put it in the sphere'], [MODE === 'mobile' ? 'Tap an agent' : 'Click an agent', ' to start a reaction'], ['Two chances', ' a level at the agent']]
  : MODE === 'mobile'
  ? [['Drag', ' to look round you'], ['Tap an atom', ' to pull it in'], ['Hold', ' to drift toward it'], ['Tap what you hold', ' to let it go']]
  : [['Drag', ' to look round you'], ['Click an atom', ' to pull it in'], ['Hold', ' to drift toward it'], ['Click what you hold', ' to let it go']];
/* Every line of the card is placed here once, as an offset in its zone, and
   drawMenu only draws what this says, so the fit check measures what is drawn. */
function menuLayout() {
  const pw = Math.min(LW - 32, 470), x = Math.round((LW - pw) / 2), inner = pw - MENU.pad * 2;
  const chips = aroundYou().map(([el, k, f]) => ({ el, label: `${f || el} ×${k}`, w: 0 }));
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
  ctx.fillText(dailyOn ? `DAILY  ·  ${dailyDate(dailyDay)}` : `${CHAPTER_NAME}  ·  LEVEL ${levelNo}`, cx, L.y + L.head.kick);
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
  if (ctx.measureText(s).width <= room) { ctx.fillText(s, x, y); return { w: ctx.measureText(s).width, cut: false }; }
  // (centred or left-aligned alike: the text is cut, never the position)
  let t = s; while (t.length > 1 && ctx.measureText(t + '…').width > room) t = t.slice(0, -1);
  ctx.fillText(t + '…', x, y);
  return { w: ctx.measureText(t + '…').width, cut: true };
}
let drawnNames = [];      // the goals' names as last drawn, for the window sweep (tools/litmus/sizes.mjs)

// THE RESULT CARD, after the board has answered (DESIGN-SYSTEM 10.2): the rules modal's box.
function drawCard(now) {
  if (!card || now < card.showAt) return;
  if (!card.sounded) { card.sounded = true; (card.kind === 'win' ? SND.win : SND.fail)(); }
  if (card.kind === 'win') { if (REACTOR) drawReactorCard(); else drawLearn(); return; }
  const pw = Math.min(LW - 56, 470), ph = Math.min(LH - 20, 300);
  const x = (LW - pw) / 2, y = Math.max(10, (LH - ph) / 2);
  ctx.fillStyle = card.kind === 'win' ? TOK.scrimWin : TOK.scrim; ctx.fillRect(0, 0, LW, LH);
  drawCardBox(x, y, pw, ph);
  const cx = LW / 2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '800 34px Inter, sans-serif'; ctx.fillStyle = TOK.text;
  const words = !REACTOR ? ['Not this time', 'An atom grabbed a hand the molecule needed on its way in. Turn for a clear line and try again.', 'Try again']
    : card.kind === 'win' ? ['Made', `${st.targets.map((t) => formulaOf(t.key)).join(' + ')}. Every goal made.`, levelNo < LIST.length ? 'Next level' : 'Play again']
    : card.why === 'agent' ? ['Poured away', 'A wrong agent with no chances left: the reaction was poured away.', 'Try again']
    : ['Not this time', 'What the goals need can no longer be made: something they need was used up or lost.', 'Try again'];
  ctx.fillText(words[0], cx, y + 34 + 24);
  ctx.font = '600 17px Inter, sans-serif'; ctx.fillStyle = TOK.ink82;
  wrap(words[1], x + 34, y + 34 + 54 + 14, pw - 68, 24, 4);
  hits.cta = UI.drawCTA(ctx, words[2], cx, y + ph - 32 - 25, ACCENT);
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

/* ---------- WHAT YOU BUILT ----------
   After a won level, a card for each molecule it asked for (owner, 2026-10-03),
   in a science textbook's words (learn.js, cards.js): what the formula says,
   the molecule in its real shape with the angle a textbook gives, or its
   electrons as a dot-and-cross diagram, and one everyday fact. A level that
   asked for several molecules has a tab for each. When it is too tall for the
   frame its middle scrolls (DESIGN-SYSTEM 5.3). Wide frames set the picture
   beside the words. */
const LEARN = window.LitmusLearn;
const LC = { pad: 22, text: 16, line: 22, diag: 190, diagWide: 230, col: 300 };
const elInk = (el) => (el === 'H' ? '#E8EEF8' : ART[el].hi);
/* The molecule as the space draws it, glossy glass, rendered once into a
   picture by a small renderer of its own (a texture cannot cross between two
   renderers, so it has its own light and its own glass). */
let iconKit = null;
const icons = new Map();
function molIcon(key) {
  if (icons.has(key)) return icons.get(key);
  const S = 512;
  if (!iconKit) {
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const r = new WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setClearColor(0x000000, 0); r.toneMapping = NeutralToneMapping; r.toneMappingExposure = 1.05;
    const pm = new PMREMGenerator(r), es = new Scene();
    es.add(new Mesh(new SphereGeometry(50, 32, 16), new MeshBasicMaterial({ color: 0x0C1426, side: BackSide })));
    const bx = new Mesh(new PlaneGeometry(34, 22), new MeshBasicMaterial({ color: 0xFFFFFF })); bx.position.set(-26, 26, 18); bx.lookAt(0, 0, 0); es.add(bx);
    const rp = new Mesh(new PlaneGeometry(40, 10), new MeshBasicMaterial({ color: 0x8A6AFF })); rp.position.set(24, 6, -30); rp.lookAt(0, 0, 0); es.add(rp);
    const envI = pm.fromScene(es, 0.02).texture; pm.dispose();
    const sc = new Scene();
    sc.add(new HemisphereLight(0x9AB8FF, 0x101624, 0.7));
    const sun = new DirectionalLight(0xFFF4E4, 2.4); sun.position.set(-40, 30, 20); sc.add(sun);
    const rim = new DirectionalLight(0x8A6AFF, 1.2); rim.position.set(20, 10, -60); sc.add(rim);
    const glass = new Map();
    const G = (el) => { if (!glass.has(el)) { const base = new Color(ART[el].hi).lerp(new Color(ART[el].lo), 0.5);
      glass.set(el, new MeshPhysicalMaterial({ color: new Color(ART[el].hi).lerp(base, 0.28), roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02,
        envMap: envI, envMapIntensity: 1.5, emissive: base, emissiveIntensity: 0.1 })); } return glass.get(el); };
    iconKit = { cv, r, sc, G, cam: new PerspectiveCamera(26, 1, 0.1, 400) };
  }
  const { cv, r, sc, G, cam: c2 } = iconKit;
  const s = LEARN.shape3d(key), B = TUNE.bond * U;
  const at = s.els.map((el, i) => ({ el, p: new Vector3(...s.p[i]).multiplyScalar(B), r: rOf(el) }));
  // centred on its outline
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const a of at) { x0 = Math.min(x0, a.p.x - a.r); x1 = Math.max(x1, a.p.x + a.r); y0 = Math.min(y0, a.p.y - a.r); y1 = Math.max(y1, a.p.y + a.r); }
  const mid = new Vector3((x0 + x1) / 2, (y0 + y1) / 2, 0), ext = Math.max(x1 - x0, y1 - y0) / 2;
  for (const a of at) a.p.sub(mid);
  const g = new Group(); sc.add(g);
  for (const a of at) { const b = new Mesh(cached('ball' + a.r, () => new SphereGeometry(a.r, 40, 28)), G(a.el)); b.position.copy(a.p); g.add(b); }
  for (const [i, j, o] of s.bonds) {
    const A = at[i], Bn = at[j], L = Bn.p.distanceTo(A.p), d = Bn.p.clone().sub(A.p).normalize();
    if (o === 1) {
      // a single bond drawn out of each atom as pulled glass, as in the space
      for (const [a, dir] of [[A, d], [Bn, d.clone().negate()]]) {
        const rad = ARM.base * U, q = new Quaternion().setFromUnitVectors(Y_UP, dir);
        const fl = new Mesh(flareGeo(a.r, rad), G(a.el)); fl.position.copy(a.p); fl.quaternion.copy(q); g.add(fl);
        const stm = new Mesh(cached('stick' + rad, () => new CylinderGeometry(rad, rad, 1, 12)), G(a.el));
        stm.quaternion.copy(q); stm.scale.set(1, L / 2, 1); stm.position.copy(a.p).addScaledVector(dir, L / 4); g.add(stm);
      }
      continue;
    }
    // a double or triple bond as two or three rods side by side, as the goals draw them
    const side = d.clone().cross(new Vector3(0, 0, 1)).normalize(), rad = 0.085 * U;
    for (const off of o === 2 ? [-0.16 * U, 0.16 * U] : [-0.22 * U, 0, 0.22 * U]) for (const [a, k] of [[A, 0.25], [Bn, 0.75]]) {
      const stm = new Mesh(cached('stick' + rad, () => new CylinderGeometry(rad, rad, 1, 10)), G(a.el));
      stm.quaternion.setFromUnitVectors(Y_UP, d); stm.scale.set(1, L / 2, 1);
      stm.position.copy(A.p).addScaledVector(d, L * k).addScaledVector(side, off); g.add(stm);
    }
  }
  c2.position.set(0, 0, ext / Math.tan(13 * Math.PI / 180) * 1.12); c2.lookAt(0, 0, 0); c2.updateMatrixWorld(); c2.updateProjectionMatrix();
  // each letter upright in front of its atom, unless a nearer atom covers it
  for (const a of at) {
    const hid = at.some((b) => b !== a && b.p.z > a.p.z + 0.1 && Math.hypot(b.p.x - a.p.x, b.p.y - a.p.y) < b.r * 0.8);
    if (hid) continue;
    const lt = new Sprite(letterMat(a.el)); const k = a.r * letterBase(a.el);
    lt.scale.set(k, k, 1); lt.position.copy(a.p).add(new Vector3(0, 0, a.r * 1.3)); lt.renderOrder = 50; g.add(lt);
  }
  r.render(sc, c2);
  const spots = at.map((a) => { const q = a.p.clone().project(c2); return { x: (q.x + 1) / 2, y: (1 - q.y) / 2 }; });
  sc.remove(g);
  const img = document.createElement('canvas'); img.width = img.height = S; img.getContext('2d').drawImage(cv, 0, 0);
  const out = { img, spots, arc: s.arc };
  icons.set(key, out);
  return out;
}
function textLines(s, w) {
  const out = []; let cur = '';
  for (const wd of s.split(' ')) { const t = cur ? cur + ' ' + wd : wd; if (!cur || ctx.measureText(t).width <= w) cur = t; else { out.push(cur); cur = wd; } }
  if (cur) out.push(cur);
  return out;
}
/* Every line of the card is placed here once, and drawLearn draws only what
   this says, so learnFit measures what is drawn. */
// a daily's card says the streak where the others say what you built
const learnTitle = () => (dailyOn && save.daily && dailyDay === TODAY ? `Daily done · ${save.daily.streak} in a row` : 'What you built');
function learnLayout() {
  const wide = LW >= 640, keys = st.targets.map((t) => t.key), key = keys[card.tab] || keys[0], c = LEARN.card(key);
  const pw = wide ? Math.min(LW - 40, 720) : Math.min(LW - 24, 470), x = Math.round((LW - pw) / 2), P = LC.pad, inner = pw - 2 * P;
  const textW = wide ? inner - LC.col - 24 : inner;
  ctx.font = `500 ${LC.text}px Inter, sans-serif`;
  const read = textLines(c.read, textW), say = textLines(card.electrons ? c.electrons : c.atoms, textW), fact = textLines(c.fact, textW);
  // the header: the title with its kind of bonding beside it (or under it, if there is no room), the name, the tabs
  ctx.font = '700 24px Inter, sans-serif'; const titleW = ctx.measureText(learnTitle()).width;
  ctx.font = '600 16px Inter, sans-serif'; const kickW = ctx.measureText(c.kicker).width + 24;
  const head = {}; let h = P;
  head.title = h + 15;
  if (titleW + 16 + kickW <= inner) { head.kick = { x: x + P + inner - kickW, y: h, w: kickW }; h += 30; }
  else { h += 30 + 8; head.kick = { x: x + P, y: h, w: kickW }; h += 30; }
  h += 8; head.name = h + 13; h += 26;
  if (c.also) { head.also = h + 11; h += 22; }
  if (keys.length > 1) {
    ctx.font = '600 16px Inter, sans-serif';
    head.tabs = []; let tx = x + P; h += 10;
    for (const k of keys) { const w = ctx.measureText(M.MOLECULES[k].formula).width + 28; head.tabs.push({ x: tx, y: h, w, h: 36 }); tx += w + 8; }
    h += 36;
  }
  const headerH = h + 14;
  // the legend under the diagram: which mark is whose
  const legW = wide ? LC.col : inner, leg = [];
  if (card.electrons) {
    ctx.font = '600 16px Inter, sans-serif';
    let row = [], rw = 0;
    for (const [m, el, nm] of c.legend) {
      const w = ctx.measureText(`${m} ${nm}`).width;
      if (row.length && rw + 16 + w > legW) { leg.push(row); row = []; rw = 0; }
      row.push({ m, el, nm, w }); rw += (row.length > 1 ? 16 : 0) + w;
    }
    if (row.length) leg.push(row);
  }
  // the body, in its own offsets: the picture (and its switch), what the formula says, the bonding, the everyday fact
  const body = {}; let y = 0;
  const pic = (y0) => {
    let q = y0; body.diag = { y: q, h: wide ? LC.diagWide : LC.diag }; q += body.diag.h + 6;
    body.leg = leg.map(() => { const r = q + 11; q += LC.line; return r; }); if (leg.length) q += 6;
    body.toggle = q; q += 40;
    return q;
  };
  const words = (y0) => {
    let q = y0;
    body.read = read.map(() => { const r = q + 11; q += LC.line; return r; }); q += 12;
    body.say = say.map(() => { const r = q + 11; q += LC.line; return r; }); q += 14;
    body.every = q + 11; q += LC.line + 4;
    body.fact = fact.map(() => { const r = q + 11; q += LC.line; return r; });
    return q;
  };
  if (wide) y = Math.max(pic(0), words(0));
  else {
    // one column: the reading, the picture and its switch, the bonding, the fact
    body.read = read.map(() => { const r = y + 11; y += LC.line; return r; }); y += 12;
    y = pic(y) + 14;
    body.say = say.map(() => { const r = y + 11; y += LC.line; return r; }); y += 14;
    body.every = y + 11; y += LC.line + 4;
    body.fact = fact.map(() => { const r = y + 11; y += LC.line; return r; });
  }
  const bodyH = y + 12;
  const footerH = 16 + 50 + P;
  const ph = Math.min(LH - 12, headerH + bodyH + footerH), top = Math.max(6, Math.round((LH - ph) / 2)), viewH = ph - headerH - footerH;
  return { wide, key, c, keys, x, y: top, pw, ph, P, inner, textW, read, say, fact, leg, head, headerH, body, bodyH, footerH, viewH, scrollMax: Math.max(0, bodyH - viewH) };
}
function drawLearn() {
  const L = learnLayout(), { c } = L, lx = L.x + L.P;
  ctx.fillStyle = TOK.scrimWin; ctx.fillRect(0, 0, LW, LH);
  drawCardBox(L.x, L.y, L.pw, L.ph);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  // header
  ctx.font = '700 24px Inter, sans-serif'; ctx.fillStyle = TOK.text; ctx.fillText(learnTitle(), lx, L.y + L.head.title);
  const k = L.head.kick;
  UI.roundRectPath(ctx, k.x, L.y + k.y, k.w, 30, 15); ctx.strokeStyle = INK_DONE; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.font = '600 16px Inter, sans-serif'; ctx.fillStyle = INK_DONE; ctx.fillText(c.kicker, k.x + 12, L.y + k.y + 15);
  ctx.font = '700 20px Inter, sans-serif'; ctx.fillStyle = TOK.text; ctx.fillText(c.name, lx, L.y + L.head.name);
  const nw = ctx.measureText(c.name + ' ').width;
  ctx.font = '600 20px Inter, sans-serif'; ctx.fillStyle = INK_DONE; ctx.fillText(c.formula, lx + nw + 4, L.y + L.head.name);
  if (c.also) { ctx.font = '500 16px Inter, sans-serif'; ctx.fillStyle = TOK.textDim; ctx.fillText(`Also called ${c.also}`, lx, L.y + L.head.also); }
  if (L.head.tabs) L.head.tabs.forEach((b, i) => {
    const on = i === card.tab, bb = { x: b.x, y: L.y + b.y, w: b.w, h: b.h };
    UI.roundRectPath(ctx, bb.x, bb.y, bb.w, bb.h, 18);
    if (on) { ctx.fillStyle = INK_DONE; ctx.fill(); } else { ctx.strokeStyle = TOK.tint12; ctx.lineWidth = 1.2; ctx.stroke(); }
    ctx.font = '600 16px Inter, sans-serif'; ctx.fillStyle = on ? TOK.bgCard : TOK.ink90; ctx.textAlign = 'center';
    ctx.fillText(M.MOLECULES[L.keys[i]].formula, bb.x + bb.w / 2, bb.y + bb.h / 2 + 1); ctx.textAlign = 'left';
    hits['tab' + i] = bb;
  });
  // body, scrolled
  const by = L.y + L.headerH;
  ctx.fillStyle = TOK.tint10; ctx.fillRect(lx, by - 1, L.inner, 1);
  ctx.save(); ctx.beginPath(); ctx.rect(L.x, by, L.pw, L.viewH); ctx.clip();
  const sc = card.scroll = Math.max(0, Math.min(L.scrollMax, card.scroll || 0)), at = (dy) => by + dy - sc;
  const tx = L.wide ? lx + LC.col + 24 : lx, colCx = L.wide ? lx + LC.col / 2 : L.x + L.pw / 2, colW = L.wide ? LC.col : L.inner;
  ctx.font = `500 ${LC.text}px Inter, sans-serif`; ctx.fillStyle = TOK.ink82;
  L.read.forEach((ln, i) => ctx.fillText(ln, tx, at(L.body.read[i])));
  // the picture: the atoms in their real shape, with the angle a textbook gives, or their electrons
  const D = L.body.diag, dcy = at(D.y + D.h / 2);
  if (card.electrons) LEARN.drawElectrons(ctx, L.key, colCx, dcy, colW - 20, D.h - 16, elInk, 'Inter, sans-serif');
  else {
    const ic = molIcon(L.key), sz = Math.min(colW, D.h + 40), ix = colCx - sz / 2, iy = dcy - sz / 2;
    ctx.drawImage(ic.img, ix, iy, sz, sz);
    if (ic.arc && c.angle) {
      const [o, a, b] = ic.arc.map((i) => [ix + ic.spots[i].x * sz, iy + ic.spots[i].y * sz]);
      const a1 = Math.atan2(a[1] - o[1], a[0] - o[0]), a2 = Math.atan2(b[1] - o[1], b[0] - o[0]);
      let m = Math.atan2(Math.sin(a1) + Math.sin(a2), Math.cos(a1) + Math.cos(a2)), half = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))) / 2;
      if (Math.hypot(Math.sin(a1) + Math.sin(a2), Math.cos(a1) + Math.cos(a2)) < 0.05) { m = Math.PI / 2; half = Math.PI / 2; }   // a straight line: the half circle below
      const rA = Math.min(34, sz * 0.12);
      ctx.strokeStyle = INK_DONE; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(o[0], o[1], rA, m - half, m + half); ctx.stroke();
      ctx.font = '600 16px Inter, sans-serif'; ctx.fillStyle = INK_DONE; ctx.textAlign = 'center';
      ctx.fillText(c.angle, o[0] + Math.cos(m) * (rA + 16), o[1] + Math.sin(m) * (rA + 14));
      ctx.textAlign = 'left';
    }
  }
  // which mark is whose, in each element's colour
  ctx.font = '600 16px Inter, sans-serif'; ctx.textAlign = 'left';
  L.leg.forEach((row, i) => {
    const w = row.reduce((s, it) => s + it.w, 0) + 16 * (row.length - 1); let xx = colCx - w / 2;
    for (const it of row) { ctx.fillStyle = elInk(it.el); ctx.fillText(`${it.m} ${it.nm}`, xx, at(L.body.leg[i])); xx += it.w + 16; }
  });
  // the switch between the two views
  const lbl = card.electrons ? 'See the atoms' : 'See the electrons', bw = ctx.measureText(lbl).width + 36, tb = { x: colCx - bw / 2, y: at(L.body.toggle), w: bw, h: 40 };
  UI.roundRectPath(ctx, tb.x, tb.y, tb.w, tb.h, 20); ctx.fillStyle = 'rgba(158,194,255,0.14)'; ctx.fill(); ctx.strokeStyle = INK_DONE; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = INK_DONE; ctx.textAlign = 'center'; ctx.fillText(lbl, colCx, tb.y + 21); ctx.textAlign = 'left';
  if (tb.y + tb.h > by && tb.y < by + L.viewH) hits.toggle = tb;
  ctx.font = `500 ${LC.text}px Inter, sans-serif`; ctx.fillStyle = TOK.text;
  L.say.forEach((ln, i) => ctx.fillText(ln, tx, at(L.body.say[i])));
  ctx.font = '600 16px Inter, sans-serif'; ctx.fillStyle = INK_DONE; ctx.fillText('Everyday', tx, at(L.body.every));
  ctx.font = `500 ${LC.text}px Inter, sans-serif`; ctx.fillStyle = TOK.ink90;
  L.fact.forEach((ln, i) => ctx.fillText(ln, tx, at(L.body.fact[i])));
  ctx.restore();
  if (sc > 0) fade(L.x, by, L.pw, 20, true);
  if (sc < L.scrollMax) fade(L.x, by + L.viewH - 20, L.pw, 20, false);
  // footer: build it again, or on
  const fy = by + L.viewH;
  ctx.fillStyle = TOK.tint10; ctx.fillRect(lx, fy, L.inner, 1);
  const half = (L.inner - 12) / 2, cy = fy + 16 + 25;
  hits.again = UI.drawPill(ctx, 'Build again', lx + half / 2, cy, { w: half });
  hits.cta = UI.drawCTA(ctx, levelNo < LIST.length ? 'Next level' : 'Play again', lx + half + 12 + half / 2, cy, ACCENT, half);
  card.box = L;
}
/* ---------- WHAT JUST HAPPENED (the Reactor) ----------
   After a won Reactor level, a card for each reaction it took (reactor-cards.js): its topic; the word and the
   balanced equation; the atoms counted on each side and what that shows; what the agent did, beside the agent (iron
   drawn as the Moleculator draws it, owner 2026-10-03); a line from the real world. Several reactions, a tab each. */
function rcLayout() {
  const steps = RX.steps(), tab = Math.min(card.tab, steps.length - 1), step = steps[tab];
  const c = window.ReactorCards.card(step.r, step.agent);
  const pw = Math.min(LW - 24, 520), x = Math.round((LW - pw) / 2), P = LC.pad, inner = pw - 2 * P;
  ctx.font = '700 24px Inter, sans-serif'; const titleW = ctx.measureText('What just happened').width;
  ctx.font = '600 16px Inter, sans-serif'; const kickW = ctx.measureText(c.topic).width + 24;
  const head = {}; let h = P;
  head.title = h + 15;
  if (titleW + 16 + kickW <= inner) { head.kick = { x: x + P + inner - kickW, y: h, w: kickW }; h += 30; }
  else { h += 30 + 8; head.kick = { x: x + P, y: h, w: kickW }; h += 30; }
  if (steps.length > 1) {
    ctx.font = '600 16px Inter, sans-serif';
    head.tabs = []; let tx = x + P; h += 12;
    steps.forEach((s0, i) => { const label = `${i + 1}`, w = Math.max(44, ctx.measureText(label).width + 28); head.tabs.push({ x: tx, y: h, w, h: 36, label }); tx += w + 8; });
    h += 36;
  }
  const headerH = h + 14;
  ctx.font = `500 ${LC.text}px Inter, sans-serif`;
  const words = textLines(c.words, inner), atoms = textLines(c.atoms, inner), mass = textLines(c.mass, inner);
  const jobW = inner - 64, job = textLines(c.job, jobW), world = c.world ? textLines(c.world, inner) : [];
  ctx.font = '700 22px Inter, sans-serif'; const eq = textLines(c.equation, inner);
  const body = {}; let y = 0;
  const lines = (arr, lh = LC.line) => arr.map(() => { const r = y + lh / 2; y += lh; return r; });
  body.words = lines(words); y += 6;
  body.eq = lines(eq, 30); y += 12;
  body.atoms = lines(atoms); y += 4;
  body.mass = lines(mass); y += 16;
  const jobTop = y; body.job = lines(job); y = Math.max(y, jobTop + 52); body.jobTop = jobTop; y += 14;
  if (world.length) { body.wl = y + 11; y += LC.line + 4; body.world = lines(world); }
  const bodyH = y + 12, footerH = 16 + 50 + P;
  const ph = Math.min(LH - 12, headerH + bodyH + footerH), top = Math.max(6, Math.round((LH - ph) / 2)), viewH = ph - headerH - footerH;
  return { c, steps, x, y: top, pw, ph, P, inner, head, headerH, body, bodyH, footerH, viewH, words, eq, atoms, mass, job, world, scrollMax: Math.max(0, bodyH - viewH) };
}
const rcAgentImg = new Map();
function drawReactorCard() {
  const L = rcLayout(), { c } = L, lx = L.x + L.P;
  ctx.fillStyle = TOK.scrimWin; ctx.fillRect(0, 0, LW, LH);
  drawCardBox(L.x, L.y, L.pw, L.ph);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = '700 24px Inter, sans-serif'; ctx.fillStyle = TOK.text; ctx.fillText('What just happened', lx, L.y + L.head.title);
  const k = L.head.kick;
  UI.roundRectPath(ctx, k.x, L.y + k.y, k.w, 30, 15); ctx.strokeStyle = INK_DONE; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.font = '600 16px Inter, sans-serif'; ctx.fillStyle = INK_DONE; ctx.fillText(c.topic, k.x + 12, L.y + k.y + 15);
  if (L.head.tabs) L.head.tabs.forEach((b, i) => {
    const on = i === card.tab, bb = { x: b.x, y: L.y + b.y, w: b.w, h: b.h };
    UI.roundRectPath(ctx, bb.x, bb.y, bb.w, bb.h, 18);
    if (on) { ctx.fillStyle = INK_DONE; ctx.fill(); } else { ctx.strokeStyle = TOK.tint12; ctx.lineWidth = 1.2; ctx.stroke(); }
    ctx.font = '600 16px Inter, sans-serif'; ctx.fillStyle = on ? TOK.bgCard : TOK.ink90; ctx.textAlign = 'center';
    ctx.fillText(b.label, bb.x + bb.w / 2, bb.y + bb.h / 2 + 1); ctx.textAlign = 'left';
    hits['tab' + i] = bb;
  });
  const by = L.y + L.headerH;
  ctx.fillStyle = TOK.tint10; ctx.fillRect(lx, by - 1, L.inner, 1);
  ctx.save(); ctx.beginPath(); ctx.rect(L.x, by, L.pw, L.viewH); ctx.clip();
  const sc = card.scroll = Math.max(0, Math.min(L.scrollMax, card.scroll || 0)), at = (dy) => by + dy - sc;
  ctx.font = `500 ${LC.text}px Inter, sans-serif`; ctx.fillStyle = TOK.ink82;
  L.words.forEach((ln, i) => ctx.fillText(ln, lx, at(L.body.words[i])));
  ctx.font = '700 22px Inter, sans-serif'; ctx.fillStyle = INK_DONE;
  L.eq.forEach((ln, i) => ctx.fillText(ln, lx, at(L.body.eq[i])));
  ctx.font = `500 ${LC.text}px Inter, sans-serif`; ctx.fillStyle = TOK.ink90;
  L.atoms.forEach((ln, i) => ctx.fillText(ln, lx, at(L.body.atoms[i])));
  L.mass.forEach((ln, i) => ctx.fillText(ln, lx, at(L.body.mass[i])));
  // the agent: iron as the Moleculator draws it; the others their own orb; none, a quiet ring
  const ax = lx + 24, ay = at(L.body.jobTop + 24);
  if (c.agent === 'iron') {
    const g = ctx.createRadialGradient(ax - 7, ay - 8, 2, ax, ay, 22); g.addColorStop(0, ART.Fe.hi); g.addColorStop(1, ART.Fe.lo);
    ctx.beginPath(); ctx.arc(ax, ay, 22, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.font = '700 18px Inter, sans-serif'; ctx.fillStyle = ART.Fe.ink; ctx.textAlign = 'center'; ctx.fillText('Fe', ax, ay + 1); ctx.textAlign = 'left';
  } else if (c.agent) {
    if (!rcAgentImg.has(c.agent)) rcAgentImg.set(c.agent, RX.agentImage(c.agent));
    ctx.drawImage(rcAgentImg.get(c.agent), ax - 34, ay - 34, 68, 68);
  } else { ctx.strokeStyle = TOK.tint12; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ax, ay, 20, 0, Math.PI * 2); ctx.stroke(); }
  ctx.font = `500 ${LC.text}px Inter, sans-serif`; ctx.fillStyle = TOK.text;
  L.job.forEach((ln, i) => ctx.fillText(ln, lx + 64, at(L.body.job[i])));
  if (L.world.length) {
    ctx.font = '600 16px Inter, sans-serif'; ctx.fillStyle = INK_DONE; ctx.fillText('In the real world', lx, at(L.body.wl));
    ctx.font = `500 ${LC.text}px Inter, sans-serif`; ctx.fillStyle = TOK.ink90;
    L.world.forEach((ln, i) => ctx.fillText(ln, lx, at(L.body.world[i])));
  }
  ctx.restore();
  if (sc > 0) fade(L.x, by, L.pw, 20, true);
  if (sc < L.scrollMax) fade(L.x, by + L.viewH - 20, L.pw, 20, false);
  const fy = by + L.viewH;
  ctx.fillStyle = TOK.tint10; ctx.fillRect(lx, fy, L.inner, 1);
  const half = (L.inner - 12) / 2, cy = fy + 16 + 25;
  hits.again = UI.drawPill(ctx, 'Build again', lx + half / 2, cy, { w: half });
  hits.cta = UI.drawCTA(ctx, levelNo < LIST.length ? 'Next level' : 'Play again', lx + half + 12 + half / 2, cy, ACCENT, half);
  card.box = L;
}
function rcDown(p, e) {
  if (inBox(p, hits.cta)) { SND.pick(); nextFromCard(true); return; }
  if (inBox(p, hits.again)) { SND.pick(); againFromCard(); return; }
  const n = RX.steps().length;
  for (let i = 0; i < n; i++) if (inBox(p, hits['tab' + i])) { SND.pick(); card.tab = i; card.scroll = 0; return; }
  const L = card.box;
  if (L && p.y > L.y + L.headerH && p.y < L.y + L.headerH + L.viewH && inBox(p, { x: L.x, y: L.y, w: L.pw, h: L.ph })) {
    card.drag = { y0: p.y, s0: card.scroll || 0 };
    try { hud.setPointerCapture(e.pointerId); } catch (_) {}
  }
}
function learnDown(p, e) {
  if (inBox(p, hits.cta)) { SND.pick(); nextFromCard(true); return; }
  if (inBox(p, hits.again)) { SND.pick(); againFromCard(); return; }
  for (let i = 0; i < st.targets.length; i++) if (inBox(p, hits['tab' + i])) { SND.pick(); card.tab = i; card.scroll = 0; return; }
  if (inBox(p, hits.toggle)) { SND.pick(); card.electrons = !card.electrons; return; }
  const L = card.box;
  if (L && p.y > L.y + L.headerH && p.y < L.y + L.headerH + L.viewH && inBox(p, { x: L.x, y: L.y, w: L.pw, h: L.ph })) {
    card.drag = { y0: p.y, s0: card.scroll || 0 };
    try { hud.setPointerCapture(e.pointerId); } catch (_) {}
  }
}

/* Each goal's name under its orb, with the formula in brackets (owner, 2026-10-02): "Aluminium oxide (Al₂O₃)", and
   how many when more than one. With two or three goals the name wraps in its own room, the formula on the last line. */
function goalLines(t, wrapW, n) {
  const m = molInfo(t.key), name = m.name[0].toUpperCase() + m.name.slice(1), tail = `(${formulaOf(t.key)})${t.n > 1 ? ` ×${t.n}` : ''}`;
  if (n <= 1 && ctx.measureText(`${name} ${tail}`).width <= wrapW) return [`${name} ${tail}`];
  const lines = []; let cur = '';
  for (const wd of name.split(' ')) { const tr = cur ? cur + ' ' + wd : wd; if (!cur || ctx.measureText(tr).width <= wrapW) cur = tr; else { lines.push(cur); cur = wd; } }
  if (ctx.measureText(`${cur} ${tail}`).width <= wrapW) lines.push(`${cur} ${tail}`); else lines.push(cur, tail);
  // the shorter form, when a word of the name will not fit its strip: the formula alone
  if (lines.some((ln) => ctx.measureText(ln).width > wrapW)) return [`${formulaOf(t.key)}${t.n > 1 ? ` ×${t.n}` : ''}`];
  return lines;
}
function drawLegendLabel() {
  if (!legend.group || !legend.lay || menu || map || (card && clock() >= card.showAt)) return;
  ctx.font = '600 16px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // during a reaction its equation stands in place of the goals' names (the agent is never written over the arrow)
  const eq = REACTOR && RX.equation();
  if (eq) {
    const L0 = legend.lay[0];
    ctx.font = '700 18px Inter, sans-serif'; ctx.fillStyle = TOK.text;
    fitText(eq, LW / 2, LEGEND.top + GOAL_Y + L0.R + 22, LW - 40);
    ctx.textAlign = 'left';
    return;
  }
  const n = st.targets.length;
  drawnNames = [];
  st.targets.forEach((t, i) => {
    const L = legend.lay[i], done = legend.mols[i] && legend.mols[i].done;
    ctx.fillStyle = done ? INK_DONE : TOK.text;
    goalLines(t, L.wrap, n).forEach((ln, j) => {
      // centred under its orb, slid inward only as far as its strip needs
      const w = Math.min(ctx.measureText(ln).width, L.wrap), x = Math.max(L.lo + w / 2, Math.min(L.hi - w / 2, L.x));
      const y = LEGEND.top + GOAL_Y + L.R + 20 + j * 19, f = fitText(ln, x, y, L.wrap);
      drawnNames.push({ text: ln, x: x - f.w / 2, y: y - 10, w: f.w, h: 20, cut: f.cut, goal: i });
    });
  });
  ctx.textAlign = 'left';
}

function drawOpening(now) {
  if (!opening) return;
  const a = (now - opening.t0) / opening.ms;          // below 0 the finger arrives, above 1 it lifts
  if (a < -0.3 || a > 1.15) return;
  const k = Math.max(0, Math.min(1, a)), e = k * k * (3 - 2 * k), x = LW * (0.74 - 0.48 * e), y = LH * 0.6;
  const show = Math.min(1, (a + 0.3) / 0.25) * (1 - Math.max(0, (a - 1) / 0.15)), r = 18 * (a >= 0 && a <= 1 ? 0.86 : 1.1);
  ctx.fillStyle = `rgba(255,255,255,${0.22 * show})`; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = `rgba(255,255,255,${0.8 * show})`; ctx.lineWidth = 2; ctx.stroke();
}
function drawHud(now) {
  const k = hud.width / LW;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, LW, LH);
  for (const key in hits) delete hits[key];
  if (COVER) return;
  if (!REACTOR) { drawHint(now); drawOpening(now); }
  else if (!firstInput && !card && !menu && !map) {
    // the Reactor's first-tap ring, until your first touch (as the Moleculator's)
    const h = RX.hintAt();
    if (h) for (let k = 0; k < 2; k++) {
      const t = ((now - levelT0) / 1400 + k * 0.5) % 1;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r * 1.1 + t * 26, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - t)})`; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  drawLegendLabel();
  if (REACTOR && !menu && !map && !(card && now >= card.showAt)) RX.hud(ctx, TOK);
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
  // the chapters, as two pills above the levels: the one you are in, and the other to go to
  const chap = { y: band + 12 + 20 }, top = band + 12 + 52, availW = LW - pad * 2;
  const cols = Math.max(4, Math.min(10, Math.round(availW / 68)));
  const cw = availW / cols, ch = Math.max(52, Math.min(68, cw * 0.92));
  const rows = Math.ceil(LIST.length / cols), viewH = LH - top - 12;
  const contentH = rows * ch;
  return { band, pad, chap, top, cols, cw, ch, rows, viewH, contentH, scrollMax: Math.max(0, contentH - viewH) };
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
    if (CHAPTER === 'moleculator') {
      const label = dailyDone() ? `Daily done · ${save.daily.streak} in a row` : 'Daily molecule';
      const w = UI.pillWidth(ctx, label);
      hits.mapDaily = UI.drawPill(ctx, label, L.pad + 80 + 16 + w / 2, L.band / 2);
    }
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    ctx.font = '600 16px Inter, sans-serif'; ctx.fillStyle = TOK.ink72;
    ctx.fillText(`${CHAPTER_NAME}   ·   ${d.size} OF ${LIST.length} DONE`, LW - L.pad, L.band / 2 + 1);
    ctx.textAlign = 'left';
  }
  {
    const names = [['moleculator', 'Moleculator'], ['reactor', 'Reactor'], ['carbon', MODE === 'mobile' ? 'Carbon' : 'Carbon Chamber']], w = Math.min(160, (LW - L.pad * 2 - 20) / 3);
    names.forEach(([id, label], i) => {
      const cx = LW / 2 + (i - 1) * (w + 10), on = id === CHAPTER;
      if (on) {
        const b = { x: cx - w / 2, y: L.chap.y - 20, w, h: 40 };
        UI.roundRectPath(ctx, b.x, b.y, b.w, b.h, 20); ctx.fillStyle = ACCENT; ctx.fill();
        ctx.font = '700 15px Inter, sans-serif'; ctx.fillStyle = TOK.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx, L.chap.y + 1);
        ctx.textAlign = 'left';
      } else hits['chap_' + id] = UI.drawPill(ctx, label, cx, L.chap.y, { w });
    });
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
    ctx.font = '700 18px Inter, sans-serif'; ctx.fillStyle = open ? TOK.text : 'rgba(255,255,255,0.6)';   // locked: dimmer, still AA
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
  if (inBox(p, hits.mapDaily)) { SND.pick(); startDaily(); return; }
  // the other chapter: its own address (its space is built for it)
  for (const id of ['moleculator', 'reactor', 'carbon']) if (inBox(p, hits['chap_' + id])) {
    SND.pick();
    const q = new URLSearchParams(location.search);
    q.delete('chapter');
    // by the address's # part, which every page can change, then a fresh start in that chapter's space
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + (id === 'moleculator' ? '#' : '#' + id));
    location.reload();
    return;
  }
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
    if (card.kind === 'win') (REACTOR ? rcDown : learnDown)(p, e);
    else if (inBox(p, hits.cta)) { SND.pick(); againFromCard(); }     // a lost level: Try again
    return;
  }
  if (map) { mapDown(p, e); return; }
  if (card) return;
  if (menu) { menuDown(p, e); return; }
  if (inBox(p, hits.pause)) { SND.pick(); menu = { scroll: 0 }; look.drift = null; return; }
  opening = null;
  Object.assign(drag, { active: true, id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y, t0: clock(), mode: 'pending', lastX: p.x, lastY: p.y, lastT: clock() });
  drag.carry = REACTOR ? RX.pressWaiting(p) : null;
  look.vy = look.vp = 0;
  try { hud.setPointerCapture(e.pointerId); } catch (_) {}
});
hud.addEventListener('pointermove', (e) => {
  if (menu && menu.drag) { const p = pt(e); menu.scroll = menu.drag.s0 - (p.y - menu.drag.y0); return; }
  if (card && card.drag) { const p = pt(e); card.scroll = card.drag.s0 - (p.y - card.drag.y0); return; }
  if (map && map.press) { mapMove(pt(e)); return; }
  if (!drag.active || e.pointerId !== drag.id) return;
  const p = pt(e);
  if (drag.mode === 'pending' && Math.hypot(p.x - drag.x0, p.y - drag.y0) > TUNE.tapPx) {
    // a drag after all: the view follows the finger from where it first touched, not from where the drag was recognised
    drag.mode = drag.carry != null ? 'carry' : 'look'; firstInput = true; drag.x = drag.x0; drag.y = drag.y0;
  }
  if (drag.mode === 'carry') { RX.dragWaiting(drag.carry, rayDir(p).applyQuaternion(cam.quaternion.clone().invert())); drag.x = p.x; drag.y = p.y; return; }
  if (drag.mode === 'look') {
    // drag the space: it follows the finger, a full screen height is the view's height
    const k = (FOV * Math.PI / 180) / LH;
    look.yaw += (p.x - drag.x) * k; look.pitch += (p.y - drag.y) * k;
    const now = clock(), dt = Math.max(1, now - drag.lastT) / 1000;
    look.vy = (p.x - drag.lastX) * k / dt; look.vp = (p.y - drag.lastY) * k / dt;
    drag.lastX = p.x; drag.lastY = p.y; drag.lastT = now;
  }
  if (drag.mode === 'drift' && look.drift) look.drift.dir.copy(rayDir(p));   // the level may have ended mid-drift
  drag.x = p.x; drag.y = p.y;
});
function endPointer(e) {
  if (menu && menu.drag) { menu.drag = null; return; }
  if (card && card.drag) { card.drag = null; return; }
  if (map && map.press) { mapUp(pt(e)); return; }
  if (!drag.active || e.pointerId !== drag.id) return;
  drag.active = false;
  wake();
  if (drag.mode === 'pending' && REACTOR) { if (RX.tap({ x: drag.x0, y: drag.y0 })) firstInput = true; }
  else if (drag.mode === 'pending') {
    const id = atomAt({ x: drag.x0, y: drag.y0 });
    if (id != null) { if (held.has(id)) letGo(); else pull(id); }
  }
  if (drag.mode === 'carry') RX.dropWaiting(drag.carry, { x: drag.x, y: drag.y }, rayDir({ x: drag.x, y: drag.y }));
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
  else if (card && clock() >= card.showAt) { card.scroll = (card.scroll || 0) + e.deltaY; e.preventDefault(); }
}, { passive: false });
function rayDir(p) {
  return new Vector3((p.x / LW) * 2 - 1, 1 - (p.y / LH) * 2, 0.5).unproject(cam).sub(cam.position).normalize();
}
function holdCheck() {
  // held still long enough: drift toward what is under the finger
  if (!REACTOR && drag.active && drag.mode === 'pending' && clock() - drag.t0 > TUNE.holdMs && !card && !menu) {
    drag.mode = 'drift'; firstInput = true;
    look.drift = { dir: rayDir({ x: drag.x, y: drag.y }), v: 0 };
  }
}
function menuDown(p, e) {
  const L = menu.box;
  if (inBox(p, hits.resume)) { SND.pick(); menu = null; return; }
  if (inBox(p, hits.restart)) { SND.pick(); againFromCard(); return; }
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

// ---------- THE PORTAL (NEW-GAME-PROMPT 8; shared/portal.js) ----------
/* Harmless on zamborin.com, where there is no portal and every call does nothing. In a portal package the game is
   paused and silenced for the whole of an ad (restoring the player's own sound setting after), play is reported as it
   starts and stops (a card, the menu or the map up is not play), and an ad may come only between levels: as Comb, on
   CrazyGames every third level won from level 4, two minutes apart, never the daily; on GameDistribution a mid-roll is
   asked on each way out of a card, which their review wants. Never on the menu or the map. */
const portal = window.ZAM_PORTAL;
let adPaused = false, playingNow = false, completions = 0, lastAd = 0, adBusy = false;
if (portal) {
  portal.init({
    onPause: () => { adPaused = true; },
    onResume: () => { adPaused = false; },
    isMuted: () => (sfx ? !sfx.isOn() : false),
    setMuted: (m) => { if (sfx) sfx.setOn(!m); },
  });
  portal.loadingStart();
  window.addEventListener('splash-done', () => portal.loadingStop(), { once: true });
}
function reportPlaying() {
  const on = !!portal && !document.getElementById('splash') && !card && !menu && !map && !adPaused;
  if (on === playingNow) return;
  playingNow = on;
  if (on) portal.gameplayStart(); else portal.gameplayStop();
}
function betweenLevels(then, won) {
  if (!portal || !portal.name) { then(); return; }
  if (portal.name === 'gd') { if (adBusy) return; adBusy = true; portal.interstitial(() => { adBusy = false; then(); }); return; }
  if (won) completions++;
  const now = Date.now();
  if (won && !dailyOn && levelNo >= 4 && completions % 3 === 0 && now - lastAd > 120000) { lastAd = now; portal.interstitial(then); return; }
  then();
}

// ---------- THE LOOP ----------
const clock = () => performance.now();
let last = clock(), acc = 0, ready = false;
function frame() {
  const now = clock();
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  holdCheck();
  reportPlaying();
  if (!menu && !map && !adPaused) {
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
  if (!menu && !map && !COVER) { renderer.clearDepth(); renderer.render(scrim.s, scrim.c); }
  if (REACTOR) { cam.layers.set(1); renderer.render(scene, cam); cam.layers.set(0); }   // the agents, over the fade
  // the target, over the top of the frame
  if (!menu && !map && !COVER && !(card && now >= card.showAt)) {
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
if (CHAPTER === 'moleculator' && !/level-\d+/.test(location.hash) && doneSet().size > 0 && !dailyDone()) startDaily();
else startLevel(levelNo);
resizeCanvases();
document.fonts && document.fonts.ready.then(() => {});
requestAnimationFrame(frame);

// ---------- HARNESS ----------
if (HARNESS) {
  window.__litmus3d = {
    state: () => ({ LW, LH, MODE, level: levelNo, hint: hintId, held: [...held], glide: !!glide, result: st.result, made: st.made,
      card: card && card.kind, targets: st.targets.length, chapter: CHAPTER, menu: !!menu, map: !!map, yaw: look.yaw, pitch: look.pitch, variant: placement && placement.variant,
      placement: placement && { attempt: placement.attempt, score: placement.score }, hazards: hazardIds }),
    atoms: () => [...V.values()].map((v) => { const s = screenOf(v); return { id: v.id, el: v.el, status: st.atoms[v.id].status, free: st.atoms[v.id].free, held: held.has(v.id), screen: s && { x: Math.round(s.x), y: Math.round(s.y), r: +s.r.toFixed(1) }, dist: +v.wp.distanceTo(cam.position).toFixed(2) }; }),
    hits: () => JSON.parse(JSON.stringify(hits)),
    look: (yaw, pitch) => { look.yaw = yaw; look.pitch = pitch; look.vy = look.vp = 0; },
    menu: (on) => { menu = on ? { scroll: 0 } : null; },
    map: (on) => { if (on) openMap(); else map = null; },
    quiet: () => { firstInput = true; },
    freeze: () => { for (const v of V.values()) { v.vel.set(0, 0, 0); v.w.set(0, 0, 0); } },
    menuFit: () => { if (!menu || !menu.box) return null; const L = menu.box; return { fits: L.headerH + L.viewH + L.footerH === L.ph && L.y >= 0 && L.y + L.ph <= LH, cardH: L.ph, frameH: LH, viewportH: L.viewH, contentH: L.bodyH, scrollMax: L.scrollMax }; },
    // the won card for the current level, at a tab and a view; and what it measures
    learn: (tab = 0, electrons = false) => { card = { kind: 'win', showAt: 0, sounded: true, scroll: 0, tab, electrons }; },
    rcFit: () => {
      if (!card || !card.box || !REACTOR) return null;
      const L = card.box; ctx.font = `500 ${LC.text}px Inter, sans-serif`;
      const widest = Math.max(...[...L.words, ...L.atoms, ...L.mass, ...L.world].map((s) => ctx.measureText(s).width), ...L.job.map((s) => ctx.measureText(s).width + 64));
      ctx.font = '700 22px Inter, sans-serif'; const eqW = Math.max(...L.eq.map((s) => ctx.measureText(s).width));
      return { fits: L.headerH + L.viewH + L.footerH === L.ph && L.y >= 0 && L.y + L.ph <= LH && L.viewH > 120, widest: Math.max(widest, eqW), inner: L.inner, scrollMax: L.scrollMax, steps: L.steps.length };
    },
    shade: (y) => shadeAt(y),
    rcCard: (tab = 0) => { card = { kind: 'win', showAt: 0, sounded: true, scroll: 0, tab, electrons: false }; },
    learnFit: () => {
      if (!card || !card.box) return null;
      const L = card.box; ctx.font = `500 ${LC.text}px Inter, sans-serif`;
      const widest = Math.max(...[...L.read, ...L.say, ...L.fact].map((s) => ctx.measureText(s).width));
      const legendW = Math.max(0, ...L.leg.map((row) => row.reduce((s, it) => s + it.w, 0) + 16 * (row.length - 1)));
      ctx.font = '700 24px Inter, sans-serif'; const tw = ctx.measureText(learnTitle()).width;
      const k = L.head.kick, headerFits = k.y > L.P + 1 || L.x + L.P + tw + 8 <= k.x;
      const tabsFit = !L.head.tabs || L.head.tabs.every((b) => b.x + b.w <= L.x + L.pw - L.P);
      return { key: L.key, fits: L.headerH + L.viewH + L.footerH === L.ph && L.y >= 0 && L.y + L.ph <= LH && L.viewH > 120, headerFits: headerFits && tabsFit,
        cardH: L.ph, frameH: LH, viewH: L.viewH, bodyH: L.bodyH, scrollMax: L.scrollMax, widest, textW: L.textW, legendW, colW: L.wide ? LC.col : L.inner };
    },
    level: (n, variant) => { if (REACTOR) { startLevel(n); firstInput = true; return { level: levelNo }; } startLevel(n, variant); firstInput = true; pilot = null; pilotLast = -1; pilotDrifts = 0; bondLog.length = 0; return { level: levelNo, variant: placement.variant, score: placement.score }; },
    progress: () => JSON.parse(JSON.stringify(save)),
    /* every word the 2D layer draws in the next frame, with its box (CSS pixels) and colour: for the contrast check on
       the painted pixel (tools/litmus/contrast.mjs) */
    texts: () => new Promise((done) => {
      const out = [], draw = ctx.fillText, box = hud.getBoundingClientRect();     // in the page: the canvas sits below the header
      let frames = 0;
      ctx.fillText = function (t, x, y, ...rest) {
        if (frames > 0) return draw.call(this, t, x, y, ...rest);     // one frame's words only
        const m = this.getTransform(), w = this.measureText(String(t)).width, size = +((this.font.match(/(\d+(?:\.\d+)?)px/) || [])[1] || 16);
        const al = this.textAlign, bl = this.textBaseline;
        const x0 = al === 'center' ? x - w / 2 : al === 'right' || al === 'end' ? x - w : x;
        const y0 = bl === 'middle' ? y - size * 0.5 : bl === 'top' ? y : bl === 'bottom' ? y - size : y - size * 0.78;
        const sx = m.a / (hud.width / cssW), sy = m.d / (hud.height / cssH);
        const yy = box.top + (m.f / (hud.height / cssH)) + y0 * sy, xx = box.left + (m.e / (hud.width / cssW)) + x0 * sx;
        const shown = yy + size * sy > box.top && yy < box.bottom && xx + w * sx > box.left && xx < box.right;   // drawn outside the canvas: not seen
        if (shown && String(t).trim()) out.push({ text: String(t), x: box.left + (m.e / (hud.width / cssW)) + x0 * sx, y: box.top + (m.f / (hud.height / cssH)) + y0 * sy, w: w * sx, h: size * sy, size: size * sy, color: String(this.fillStyle), alpha: this.globalAlpha, font: this.font });
        return draw.call(this, t, x, y, ...rest);
      };
      requestAnimationFrame(() => { frames = 0; requestAnimationFrame(() => { frames = 1; requestAnimationFrame(() => { ctx.fillText = draw; done(out); }); }); });
    }),
    // a result card that is not a win, for the contrast check
    failCard: (why) => { card = { kind: 'fail', why: why || null, showAt: 0, sounded: true, scroll: 0, tab: 0, electrons: false }; },
    // where everything on the play screen is, in frame units, for the window sweep (tools/litmus/sizes.mjs)
    geom: () => ({
      LW, LH, cssW, cssH, winW: innerWidth, winH: innerHeight, mode: MODE, chapter: CHAPTER, level: levelNo,
      pause: hits.pause || null,
      goals: (legend.lay || []).map((L) => ({ x: L.x, y: LEGEND.top + GOAL_Y, R: L.R })),
      names: drawnNames.slice(),
      sphere: REACTOR ? RX.geom() : null,
    }),
    daily: (day, variant) => { startDaily(variant, day); firstInput = true; pilot = null; pilotLast = -1; pilotDrifts = 0; bondLog.length = 0; return { level: levelNo, day, key: dailyKey(day), variant: placement.variant, score: placement.score }; },
    dailyInfo: () => ({ today: TODAY, keys: DAILY_KEYS.length, key: dailyKey(TODAY), on: dailyOn, done: dailyDone(), save: save.daily || null }),
    /* THE PILOT, for checks only. next() says what a player would do now: drag
       to turn (frame units), tap an atom (to pull it in, or to let go of what is
       held), wait, or that it is done or stuck. The check performs every drag
       and tap as real touch or mouse events; nothing here moves the game.
       Careful: an atom that helps, from a heading where its straight line in,
       and the turn to get there, pass nothing it could grab. Careless: the
       nearest atom that helps, faced straight on, as a player who just taps
       what they see. */
    next: (careless) => (REACTOR ? (card ? { type: 'done', result: card.kind } : menu || map ? { type: 'wait' } : RX.pilot(!!careless)) : pilotNext(!!careless)),
    // the cover's scene: a level of your own making, its molecules where you put them ([yaw, pitch, distance] each)
    rxCustom: (lv) => { if (!REACTOR) return null; LEVEL = lv; st = RX.start(lv, 1); card = null; menu = null; map = null; firstInput = true; RX.setCover(COVER); return st.pieces.length; },
    rxPut: (id) => RX.put(id), rxAgent: (name) => RX.agent(name), rxPlanSteps: () => RX.planSteps(),
    reactor: () => REACTOR && { molecules: RX.molecules(), agents: RX.agentsAt(), chances: st.chances, made: st.made, zones: st.pieces.map((p) => p.zone), busy: RX.busy() },
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
      const yaw = yaw0 + oy, pitch = Math.max(-1.5, Math.min(1.5, pitch0 + op));
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
