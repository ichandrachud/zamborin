/* ============================================================
   FATHOM: THE DIG · the page
   ------------------------------------------------------------
   Draws sim.js and nothing else. Every rule lives in the sim so
   the Milestone-2 gate measures the game that ships.

   The chrome here is owner-locked and carried over from the
   open-water build verbatim: full-bleed world, floating
   instrument blocks, one-line DEPTH + bank read-out, DROP CARGO
   in plain words, the fleet card, AIR LOW, and the TOO HEAVY
   banner in SEALED's visual style. What changed below the
   chrome is the world: an ocean with a floor you dig into.

   Layout: two genuinely different ones. Desktop is the
   760 x 600 site frame; mobile is the measured viewport in JS,
   never CSS dvh.
   ============================================================ */
(() => {
  'use strict';

  // ---------- MODE ----------
  const MODE = (matchMedia('(pointer: coarse)').matches ||
                (window.innerWidth > 0 && window.innerWidth < 768))
    ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);

  // ---------- CANVAS ----------
  let LW, LH;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const gameWrap = canvas.parentElement;
  const FRAME_W = 760, FRAME_H = 600;   // the one site-wide desktop frame

  function setCanvasVars() {
    if (MODE === 'mobile') { LW = window.innerWidth; LH = window.innerHeight; }
    else { LW = FRAME_W; LH = FRAME_H; }
    document.body.style.setProperty('--canvas-w', LW + 'px');
    document.body.style.setProperty('--canvas-h', LH + 'px');
  }
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const bW = Math.round((rect.width || LW) * dpr);
    const bH = Math.round((rect.height || LH) * dpr);
    if (canvas.width !== bW) canvas.width = bW;
    if (canvas.height !== bH) canvas.height = bH;
    const s = Math.min(bW / LW, bH / LH);
    ctx.setTransform(s, 0, 0, s, 0, 0);
  }
  /* Full screen: the frame grows, the drawing scale does not. A scrolling
     world anchors metres-per-pixel to FRAME_W so more world is revealed
     rather than the same picture blown up. */
  function fitFullscreen() {
    if (!document.body.classList.contains('focus-mode')) return;
    if (MODE === 'mobile') { LW = window.innerWidth; LH = window.innerHeight; }
    else { LW = Math.max(FRAME_W, window.innerWidth); LH = Math.max(FRAME_H, window.innerHeight); }
    document.body.style.setProperty('--canvas-w', LW + 'px');
    document.body.style.setProperty('--canvas-h', LH + 'px');
  }
  function onResize() {
    setCanvasVars();
    fitFullscreen();
    if (MODE === 'mobile') { gameWrap.style.width = LW + 'px'; gameWrap.style.height = LH + 'px'; }
    resizeCanvas();
    layout();
  }

  // ---------- AUDIO ----------
  /* The fleet is mixed about 4x too quiet; 2.2 is this game's owner-locked
     master gain. The mix IS the noise meter, so held verbs must be smooth:
     one soft blub per quarter second, never a per-frame crackle. */
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zam.fathom.sfx', gain: 2.2 }) : null;

  // ---------- BUTTONS / ANALYTICS ----------
  const UI = window.ZAM_UI;
  const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){},
                 levelRestart(){}, hintUsed(){}, track(){} };
  const T = () => (window.ZAM_TRACK || NOOP);
  T().init('fathom');

  // ---------- TOKENS ----------
  const C_BG = '#0E1726';                       // --bg (Ground)
  const C_SURFACE = '#131F36';                  // --bg-card (Surface)
  const C_RAISED = '#1A2A45';                   // --bg-panel (Raised)
  const SCRIM = (a) => 'rgba(10,16,28,' + a + ')';
  const TINT = (a) => 'rgba(255,255,255,' + a + ')';
  const INK72 = TINT(0.72), INK82 = TINT(0.82), INK90 = TINT(0.90), INK92 = TINT(0.92);
  const C_ACCENT = '#C24A39';                   // --accent (fill under white type)
  const C_ACCENT_TEXT = '#FF6B5C';              // --accent-text (coral AS type/marks)
  const C_GREEN = '#5DD39E';
  const C_SUN = '#FFD23F';
  const C_BRAND = '#B0E0E6';

  // ---------- SIM ----------
  const SIM = window.FathomSim;
  const TUNE = SIM.TUNE;
  const TT = SIM.T;                             // cell states
  const TILE = TUNE.TILE;
  const qs = new URLSearchParams(location.search);

  /* ---------- SAVE, SCHEMA v2: the homestead ----------
     One ocean per save. The seed, every tile ever dug out of it, the bank
     and the fleet all persist; a closed tab costs the current dive's cargo
     and nothing else. Written on banking and on purchase, never on unload. */
  const SAVE_KEY = 'zam.fathom.save';
  function readSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (_) { return null; }
  }
  const saved = readSave();
  const seed = qs.has('seed') ? (parseInt(qs.get('seed'), 10) >>> 0)
             : (saved && (saved.v | 0) >= 2 && saved.seed != null) ? (saved.seed >>> 0)
             : ((Math.random() * 1e9) >>> 0);   // boot-time only; the run itself is seeded
  let run = new SIM.Run(seed);
  if (saved && !qs.has('seed')) run.loadWorldState(saved);

  // ---------- GAME SHELL STATE ----------
  let card = 'rules';            // 'rules' | 'fleet' | 'banked' | 'blackout' | 'breach' | null
  let cardData = null;
  let rulesScroll = 0;
  let started = false;           // first real input -> analytics game_start
  let scheme = 'A';              // mobile control scheme, owner picks by playing
  try { scheme = localStorage.getItem('zam.fathom.controls') === 'B' ? 'B' : 'A'; } catch (_) {}
  let diveT0 = performance.now();

  // ---------- THE FLEET ----------
  /* Nine submarines, all the owner's models. The stat pips map onto the
     TUNE tiers (pip - 1); SPEED becomes a thrust multiplier, LAMP stretches
     the light, and DRILL — new with the dig — sets the bite rate and opens
     hard rock at 3. The fleet ladder is the region progression. Prices are
     starting guesses for the Milestone-6 gate to re-price. */
  const FLEET = [
    { name: 'Minnow',     file: 'sub-1.png', lenM: 13.5, price: 0,
      st: { AIR: 1, CARGO: 1, BATT: 1, SPEED: 2, LAMP: 1, DRILL: 1 },
      blurb: 'Small, brave, and full of hope.' },
    { name: 'Lagoon',     file: 'sub-2.png', lenM: 14, price: 250,
      st: { AIR: 3, CARGO: 1, BATT: 2, SPEED: 1, LAMP: 2, DRILL: 1 },
      blurb: 'Twin tanks and no hurry. Breathes like a whale.' },
    { name: 'Bluefin',    file: 'sub-3.png', lenM: 14, price: 600,
      st: { AIR: 2, CARGO: 2, BATT: 2, SPEED: 3, LAMP: 1, DRILL: 2 },
      blurb: 'A porthole for every thought, and quick through a gallery.' },
    { name: 'Sunfish',    file: 'sub-4.png', lenM: 14.5, price: 1100,
      st: { AIR: 2, CARGO: 3, BATT: 2, SPEED: 2, LAMP: 2, DRILL: 2 },
      blurb: 'The friendly workhorse. Room for a little of everything.' },
    { name: 'Dredger',    file: 'sub-5.png', lenM: 15, price: 1800,
      st: { AIR: 2, CARGO: 5, BATT: 2, SPEED: 1, LAMP: 2, DRILL: 3 },
      blurb: 'A hold like a warehouse. Turns like one too.' },
    { name: 'Ember',      file: 'sub-6.png', lenM: 15, price: 2800,
      st: { AIR: 3, CARGO: 2, BATT: 5, SPEED: 3, LAMP: 1, DRILL: 3 },
      blurb: 'Runs hot. The drill never asks for a rest.' },
    { name: 'Sailfin',    file: 'sub-7.png', lenM: 15.5, price: 4200,
      st: { AIR: 3, CARGO: 3, BATT: 3, SPEED: 5, LAMP: 2, DRILL: 3 },
      blurb: 'Built to outrun its own bubbles.' },
    { name: 'Ghostlight', file: 'sub-8.png', lenM: 16, price: 6500,
      st: { AIR: 4, CARGO: 3, BATT: 4, SPEED: 3, LAMP: 5, DRILL: 4 },
      blurb: 'Sees everything. The deep has no secrets left.' },
    { name: 'Poseidon',   file: 'sub-9.png', lenM: 16.5, price: 10000,
      st: { AIR: 5, CARGO: 5, BATT: 5, SPEED: 4, LAMP: 4, DRILL: 5 },
      blurb: 'The one the trench tells stories about.' },
  ];
  const SUBIMGS = FLEET.map(f => {
    const im = new Image();
    im.onload = () => { im._ok = true; };
    im.src = './assets/' + f.file + '?v=1';
    return im;
  });
  let owned = [0], curSub = 0, fleetView = 0;
  if (saved) {
    owned = Array.isArray(saved.owned) && saved.owned.length
      ? saved.owned.filter(n => n >= 0 && n < FLEET.length) : [0];
    if (!owned.includes(0)) owned.unshift(0);
    curSub = owned.includes(saved.cur | 0) ? saved.cur | 0 : 0;
    run.money = Math.max(0, saved.m | 0);
  }
  function saveMeta() {
    try {
      const s = run.saveState();
      s.owned = owned; s.cur = curSub;
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    } catch (_) {}
  }
  function loadoutOf(i) {
    const st = FLEET[i].st;
    return { air: st.AIR - 1, cargo: st.CARGO - 1, batt: st.BATT - 1,
             thrustMul: 0.85 + st.SPEED * 0.13, lamp: st.LAMP, drill: st.DRILL };
  }
  function applyFleet() {
    run.applyLoadout(loadoutOf(curSub));
    run.air = run.airMax(); run.batt = run.battMax();
  }
  applyFleet();

  // ---------- SPRITES ----------
  /* The owner's clay models, one family per key, numbered from 1. Every
     draw falls back to painted clay until its image has loaded, so a slow
     connection sees the world, not holes. */
  const SPRITE_SETS = { nodule: 4, sulphide: 4, crystal: 4, plant: 5, fish: 5 };
  const IMG = {};
  for (const key of Object.keys(SPRITE_SETS)) {
    IMG[key] = [];
    for (let i = 1; i <= SPRITE_SETS[key]; i++) {
      const im = new Image();
      im.onload = () => { im._ok = true; };
      im.src = './assets/' + key + '-' + i + '.png?v=1';
      IMG[key].push(im);
    }
  }
  function pickSprite(key, salt) {
    const arr = IMG[key];
    if (!arr) return null;
    const im = arr[((salt % arr.length) + arr.length) % arr.length];
    return im && im._ok ? im : null;
  }

  /* ---------- THE CLAY ----------
     Tile colour is game art, not chrome, so it carries its own palette —
     but every region gets its own, because a place is not a column.

     Three stops per material, and which one a cell gets is decided by its
     NEIGHBOURS, not by the cell: `lit` is the band along a face the water
     touches, `mid` is clay one step in, `deep` is the mass behind. That is
     the design system's rule — an edge is made of value, never an outline
     — applied to a tiled world, and it is why the clay reads as one carved
     body with tunnels cut through it rather than as a wall of blobs.

     When the owner's tile art lands it replaces this table; the shape code
     below is unchanged. */
  const CLAY = [
    { // The Shelf — sage clay, sunlit-adjacent
      silt: ['#6E9A7E', '#3E5F4E', '#233A31'], rock: ['#5D8494', '#33525E', '#1B3038'],
      hard: ['#5D8494', '#33525E', '#1B3038'], lit: 'rgba(186,232,204,0.5)' },
    { // The Ribs — blue-grey rock and long galleries
      silt: ['#5F8288', '#35505A', '#1D3038'], rock: ['#4E7A93', '#2C4A5C', '#162B36'],
      hard: ['#55708C', '#2F4256', '#19232F'], lit: 'rgba(176,220,232,0.48)' },
    { // Blackreach — violet slate, dense and cold
      silt: ['#6B6F94', '#3B3F5C', '#212436'], rock: ['#5B5F8C', '#333654', '#1B1D2E'],
      hard: ['#7A7FB4', '#43476E', '#262842'], lit: 'rgba(196,196,244,0.46)' },
    { // The Foundry — warm charcoal, heat in the stone
      silt: ['#8A6E5E', '#4E3D34', '#2C221D'], rock: ['#7A5F55', '#443430', '#261C19'],
      hard: ['#9A7458', '#563F30', '#30231B'], lit: 'rgba(248,206,170,0.5)' },
  ];
  const CLAY_SEA = CLAY[0];
  const C_BED = ['#2A3446', '#141F2E', '#0A121D'];
  const C_MAGMA = ['#FFC073', '#FF8A3C', '#C0331B'];

  // ---------- LAYOUT ----------
  const SIDE_PAD = 30;
  const topBand = () => (MODE === 'mobile' ? 84 : 56);
  const botBand = () => (MODE === 'mobile' ? 96 : 20);
  const L = {};                  // everything measured, nothing implicit
  function layout() {
    L.top = topBand(); L.bot = botBand();
    if (MODE === 'desktop') {
      /* The world takes the whole frame below the top band; the instruments
         float on the water (owner round 5 — no side section, no gauge). */
      L.bot = 0;
      L.ocean = { x: 0, y: L.top, w: LW, h: LH - L.top };
      // ppm anchored to the 760 frame so full screen widens the view, not the art
      L.ppm = FRAME_W / TUNE.VIEW_W;
      L.jettison = { cx: LW / 2, cy: LH - 40 };
    } else {
      L.ocean = { x: 0, y: L.top, w: LW, h: LH - L.top - L.bot };
      L.ppm = LW / TUNE.VIEW_W;
      L.rowCy = LH - 74;                 // the band system's mobile control row
      L.jettison = { cx: LW / 2, cy: L.rowCy };
      // Scheme A: UP and DOWN thumb-stacked bottom-right, above the row
      L.blowBtn  = { cx: LW - SIDE_PAD - 22, cy: LH - L.bot - 118 };
      L.floodBtn = { cx: LW - SIDE_PAD - 22, cy: LH - L.bot - 62 };
    }
    L.viewWm = L.ocean.w / L.ppm;
    L.viewHm = L.ocean.h / L.ppm;
  }

  // ---------- CAMERA ----------
  const WORLD_W = TUNE.COLS * TILE, WORLD_H = TUNE.ROWS * TILE;
  const cam = { x: 0, y: -20 };
  function camTarget() {
    const vw = L.viewWm, vh = L.viewHm;
    let tx = run.x - vw / 2;
    let ty = run.y - vh * 0.44 + run.vy * 0.22;
    if (vw >= WORLD_W) tx = (WORLD_W - vw) / 2;
    else tx = Math.max(0, Math.min(WORLD_W - vw, tx));
    ty = Math.max(-26, Math.min(WORLD_H - vh, ty));
    return { tx, ty };
  }
  function updateCam(dt) {
    const { tx, ty } = camTarget();
    const a = 1 - Math.exp(-4 * dt);
    cam.x += (tx - cam.x) * a;
    cam.y += (ty - cam.y) * a;
  }
  const sx = (wx) => L.ocean.x + (wx - cam.x) * L.ppm;
  const sy = (wy) => L.ocean.y + (wy - cam.y) * L.ppm;

  // ---------- INPUT ----------
  const keys = {};
  const held = { floodBtn: null, blowBtn: null, thrustL: null, thrustR: null, joy: null };
  let joyVec = 0, joyVert = 0;   // the scheme-B drag: sideways thrust, up/down dive
  let wantJettison = false;

  function markStarted() {
    if (!started) { started = true; T().gameStart(); diveT0 = performance.now(); }
  }

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
    if (sfx) sfx.ensureAudio();
    if (card) {
      if (e.key === 'Escape') { card = null; return; }
      if (card === 'fleet') {
        if (k === 'arrowleft') { fleetView = Math.max(0, fleetView - 1); return; }
        if (k === 'arrowright') { fleetView = Math.min(FLEET.length - 1, fleetView + 1); return; }
      }
      if (e.key === 'Enter' || e.key === ' ') { cardCTA(); e.preventDefault(); }
      return;
    }
    keys[k] = true;
    if (k === 'j') { wantJettison = true; }
    if (['a', 'd', 's', 'w', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) markStarted();
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  function ptXY(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (LW / rect.width),
             y: (e.clientY - rect.top) * (LH / rect.height) };
  }
  const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  const nearBtn = (p, b, slop) => Math.abs(p.x - b.cx) <= 22 + slop && Math.abs(p.y - b.cy) <= 20 + slop;

  // Hit boxes the renderer fills in each frame.
  const hit = { pills: [], cta: null, schemeToggle: null, newOcean: null, rulesBody: null };
  let rulesDrag = null;

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (sfx) sfx.ensureAudio();
    const p = ptXY(e);
    if (card) {
      if (card === 'fleet') {
        if (hit.fleetPrev && inRect(p, hit.fleetPrev)) { fleetView = Math.max(0, fleetView - 1); if (sfx) sfx.play('tick'); return; }
        if (hit.fleetNext && inRect(p, hit.fleetNext)) { fleetView = Math.min(FLEET.length - 1, fleetView + 1); if (sfx) sfx.play('tick'); return; }
        if (hit.fleetClose && inRect(p, hit.fleetClose)) { card = null; return; }
      }
      if (hit.cta && inRect(p, hit.cta)) { cardCTA(); return; }
      if (hit.schemeToggle && inRect(p, hit.schemeToggle)) { toggleScheme(); return; }
      if (hit.newOcean && inRect(p, hit.newOcean)) { newOceanTapped(); return; }
      if (card === 'rules' && hit.rulesBody && inRect(p, hit.rulesBody)) {
        rulesDrag = { y: p.y, s: rulesScroll };
      }
      return;
    }
    // Chrome pills first.
    for (const pill of hit.pills) {
      if (inRect(p, pill.box)) {
        if (pill.id === 'jettison') { wantJettison = true; }   // instant verb
        else pill.tapped = e.pointerId;                        // act on release
        return;
      }
    }
    if (MODE === 'mobile' && scheme === 'A') {
      if (nearBtn(p, L.blowBtn, 14))  { held.blowBtn = e.pointerId;  markStarted(); return; }
      if (nearBtn(p, L.floodBtn, 14)) { held.floodBtn = e.pointerId; markStarted(); return; }
      if (p.y > L.top && p.y < LH - L.bot) {
        if (p.x < LW / 2) held.thrustL = e.pointerId; else held.thrustR = e.pointerId;
        markStarted();
      }
      return;
    }
    if (MODE === 'mobile' && scheme === 'B') {
      const d = Math.hypot(p.x - sx(run.x), p.y - sy(run.y));
      if (d < 95) { held.joy = e.pointerId; joyVec = 0; joyVert = 0; markStarted(); }
      return;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptXY(e);
    if (rulesDrag) { rulesScroll = rulesDrag.s - (p.y - rulesDrag.y); return; }
    if (held.joy === e.pointerId) {
      const dx = p.x - sx(run.x), dy = p.y - sy(run.y);
      joyVec = Math.abs(dx) < 12 ? 0 : Math.max(-1, Math.min(1, dx / 90));
      joyVert = dy > 26 ? 1 : dy < -26 ? -1 : 0;   // below the sub dives, above rises
    }
  });
  function endPointer(e) {
    const p = ptXY(e);
    rulesDrag = null;
    for (const pill of hit.pills) {
      if (pill.tapped === e.pointerId) {
        pill.tapped = null;
        if (inRect(p, pill.box)) pillAction(pill.id);
      }
    }
    if (held.floodBtn === e.pointerId) held.floodBtn = null;
    if (held.blowBtn === e.pointerId)  held.blowBtn = null;
    if (held.thrustL === e.pointerId)  held.thrustL = null;
    if (held.thrustR === e.pointerId)  held.thrustR = null;
    if (held.joy === e.pointerId)      { held.joy = null; joyVec = 0; joyVert = 0; }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (e) => {
    if (card === 'rules' && hit.rulesBody) { rulesScroll += e.deltaY * 0.6; e.preventDefault(); }
  }, { passive: false });

  function pillAction(id) {
    if (id === 'sound') { if (sfx) { sfx.setOn(!sfx.isOn()); sfx.play('click'); } }
    else if (id === 'rules') { card = 'rules'; rulesScroll = 0; }
    else if (id === 'fleet') { fleetView = curSub; card = 'fleet'; }
  }
  function toggleScheme() {
    scheme = scheme === 'A' ? 'B' : 'A';
    try { localStorage.setItem('zam.fathom.controls', scheme); } catch (_) {}
    if (sfx) sfx.play('click');
  }
  /* One ocean per save, and the current ocean is the default forever. NEW
     OCEAN is a deliberate act: it discards the mine you dug and keeps the
     bank and the fleet, which are yours, not the sea's.

     It asks twice. The homestead is the one thing in this game that cannot
     be re-earned in a dive, and it sits one stray tap from a pill on the
     card every player opens first. */
  let oceanArmed = false;
  function newOceanTapped() {
    if (!oceanArmed) { oceanArmed = true; if (sfx) sfx.play('tick'); return; }
    oceanArmed = false;
    newOcean();
  }
  function newOcean() {
    const money = run.money;
    run = new SIM.Run((Math.random() * 1e9) >>> 0);
    run.money = money;
    applyFleet();
    particles.length = 0; floats.length = 0; jetsam.length = 0; rings.length = 0;
    card = null; cam.y = -20; cam.x = run.x - L.viewWm / 2;
    saveMeta();
    if (sfx) sfx.play('start');
  }
  function cardCTA() {
    oceanArmed = false;
    if (card === 'rules') { card = null; }
    else if (card === 'banked' || card === 'blackout' || card === 'breach') {
      if (run.mode !== 'dive') run.revive();
      diveT0 = performance.now();
      card = null;
    } else if (card === 'fleet') {
      const i = fleetView, f = FLEET[i];
      if (owned.includes(i)) {
        curSub = i; applyFleet(); saveMeta(); card = null;
      } else if (run.money >= f.price) {
        run.money -= f.price;
        owned.push(i); curSub = i; applyFleet(); saveMeta(); card = null;
        T().track('purchase', { boat: f.name.toLowerCase(), price: f.price, drill: f.st.DRILL });
        if (sfx) sfx.play('unlock');
      } else {
        if (sfx) sfx.tone(170, 0.12, 0.03, 'sine');   // not yet affordable
        return;
      }
    }
    if (sfx) sfx.play('click');
  }

  // ---------- PARTICLES (visual only, deterministic per session) ----------
  const vr = SIM.mulberry32(777);
  const particles = [];   // bubbles: {x,y,vy,r,life}
  const floats = [];      // {text,x,y,life,color}
  const jetsam = [];      // {x,y,type,vy,life}
  const rings = [];       // {x,y,r,life}
  const silt = [];        // {x,y,r,life} — the cloud a broken tile leaves
  let shake = 0;

  function floatText(text, wx, wy, color) {
    floats.push({ text, x: wx, y: wy, life: 1.6, color: color || INK92 });
    if (floats.length > 14) floats.shift();
  }
  function spawnBubbles(n, wx, wy, spread, vyMin, vyMax) {
    for (let i = 0; i < n && particles.length < 150; i++) {
      particles.push({ x: wx + (vr() - 0.5) * spread, y: wy + (vr() - 0.5) * 2,
                       vy: -(vyMin + vr() * (vyMax - vyMin)), r: 0.5 + vr() * 1.1,
                       life: 1.1 + vr() * 1.3 });
    }
  }
  function spawnSilt(wx, wy) {
    for (let i = 0; i < 7 && silt.length < 90; i++) {
      silt.push({ x: wx + (vr() - 0.5) * TILE * 0.8, y: wy + (vr() - 0.5) * TILE * 0.8,
                  r: 1 + vr() * 2.4, life: 0.5 + vr() * 0.6, max: 1.1 });
    }
  }
  function stepParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.y += p.vy * dt; p.x += Math.sin(p.y * 0.4) * 2 * dt; p.life -= dt;
      // A bubble that reaches rock stops there rather than passing through it.
      if (p.life <= 0 || p.y < -4 || run.world.solidAt(p.x, p.y)) particles.splice(i, 1);
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      floats[i].y -= 5 * dt; floats[i].life -= dt;
      if (floats[i].life <= 0) floats.splice(i, 1);
    }
    for (let i = jetsam.length - 1; i >= 0; i--) {
      const j = jetsam[i];
      j.y += j.vy * dt; j.life -= dt;
      if (run.world.solidAt(j.x, j.y + 2)) j.vy = 0;
      if (j.life <= 0) jetsam.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i].r += 14 * dt; rings[i].life -= dt;
      if (rings[i].life <= 0) rings.splice(i, 1);
    }
    for (let i = silt.length - 1; i >= 0; i--) {
      const s = silt[i];
      s.y -= 3 * dt; s.r += 3 * dt; s.life -= dt;
      if (s.life <= 0) silt.splice(i, 1);
    }
    if (shake > 0) shake = Math.max(0, shake - dt);
  }

  // ---------- SIM DRIVE ----------
  let lastNow = performance.now();
  let holdFullWas = false, tooHardWas = false;
  let lastBlub = 0, lastGrind = 0;
  let airLowWas = false;

  function inputNow() {
    const axKeys = (keys['a'] || keys['arrowleft'] ? -1 : 0) + (keys['d'] || keys['arrowright'] ? 1 : 0);
    const axTouch = (held.thrustL != null ? -1 : 0) + (held.thrustR != null ? 1 : 0);
    return {
      ax: Math.max(-1, Math.min(1, axKeys + axTouch + joyVec)),
      down: !!(keys['s'] || keys['arrowdown'] || held.floodBtn != null || joyVert > 0),
      up:   !!(keys['w'] || keys['arrowup'] || held.blowBtn != null || joyVert < 0),
      jettison: wantJettison,
    };
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    if (!card) {
      const inp = inputNow();
      wantJettison = false;
      const events = run.step(inp, dt);
      for (const ev of events) handleEvent(ev);
      audioFeedback(now);
      updateCam(dt);
      stepParticles(dt);
    }
    render(now);
    requestAnimationFrame(tick);
  }

  function audioFeedback(now) {
    /* Blowing is the most-held verb in the game; its sound must be a calm
       low bubbling, never a crackle. One soft blub every quarter second. */
    if (run._blowing && sfx && now - lastBlub > 240) {
      lastBlub = now;
      sfx.tone(230 + vr() * 90, 0.09, 0.022, 'sine');
    }
    if (run._blowing) spawnBubbles(2, run.x, run.y - 3, 6, 8, 16);
    if (run._flooding && vr() < 0.35 && rings.length < 12) {
      rings.push({ x: run.x + (vr() - 0.5) * 4, y: run.y + 2.4, r: 1.2, life: 0.6 });
    }
    if (run._thrusting) spawnBubbles(1, run.x - run.facing * 6, run.y + 1, 2, 2, 5);
    /* Digging is a low crumbly grind, pitched by the material — one grain
       every 90 ms, not a per-frame noise burst. */
    if (run._digging && sfx && now - lastGrind > 90) {
      lastGrind = now;
      const t = run.digTarget ? run.world.at(run.digTarget.c, run.digTarget.r) : TT.ROCK;
      const base = t === TT.SILT ? 96 : t === TT.HARD ? 158 : 124;
      sfx.tone(base + vr() * 34, 0.055, 0.026, 'square');
    }
    if (run.holdFull && !holdFullWas && sfx) sfx.tone(170, 0.12, 0.03, 'sine');
    holdFullWas = run.holdFull;
    if (run.tooHard && !tooHardWas) {
      if (sfx) sfx.tone(140, 0.16, 0.03, 'sine');
      floatText('NEEDS A BIGGER DRILL', run.x, run.y - 9, C_ACCENT_TEXT);
    }
    tooHardWas = run.tooHard;
    // The Motherload lesson: warn loudly, long before the clock kills.
    const airLow = run.air < run.airMax() * 0.33 && run.y > TUNE.surfaceY;
    if (airLow && !airLowWas && sfx) {
      sfx.tone(660, 0.14, 0.035, 'sine');
      setTimeout(() => { if (sfx) sfx.tone(660, 0.14, 0.035, 'sine'); }, 220);
    }
    airLowWas = airLow;
  }

  function handleEvent(ev) {
    if (ev.t === 'ore') {
      const vpk = ev.val / ev.kg;
      if (sfx) sfx.tone(480 + 58 * vpk, 0.1, 0.06, 'triangle');
      floatText('+' + ev.kg + ' kg · $' + ev.val, ev.x, ev.y - 4, INK92);
      spawnSilt(ev.x, ev.y);
    } else if (ev.t === 'dug') {
      spawnSilt(ev.x, ev.y);
    } else if (ev.t === 'hold-full') {
      floatText('HOLD FULL', ev.x, ev.y - 4, C_ACCENT_TEXT);
    } else if (ev.t === 'gas') {
      shake = 0.55;
      spawnBubbles(26, ev.x, ev.y, TILE, 14, 34);
      floatText('GAS POCKET', ev.x, ev.y - 6, C_SUN);
      if (sfx) sfx.noise(0.4, 300, 0.8, 0.12);
      T().track('gas_burst', { depth: Math.round(run.y) });
    } else if (ev.t === 'region') {
      floatText(ev.name.toUpperCase(), run.x, run.y - 11, C_BRAND);
      if (sfx) sfx.play('ping');
      T().track('region_first', { region: ev.k, name: ev.name.toLowerCase().replace(/[^a-z]/g, '') });
    } else if (ev.t === 'hull') {
      shake = Math.max(shake, 0.3);
      if (sfx) sfx.noise(0.22, 180, 0.7, 0.07);
      floatText(ev.cause === 'magma' ? 'HEAT' : 'HULL', run.x, run.y - 8, C_ACCENT_TEXT);
    } else if (ev.t === 'banked') {
      cardData = { val: ev.val, kg: ev.kg, depth: ev.depth };
      card = 'banked';
      saveMeta();
      T().track('bank', { val: ev.val, kg: ev.kg, depth: ev.depth });
      T().track('dig_tiles', { n: run.digTiles });
      T().track('upgrade_state', { boat: FLEET[curSub].name.toLowerCase(), owned: owned.length,
                                   drill: FLEET[curSub].st.DRILL, money: Math.round(run.money) });
      endRun('banked');
      if (sfx) sfx.play('success');
    } else if (ev.t === 'blackout' || ev.t === 'breach') {
      cardData = ev;
      card = ev.t;
      saveMeta();                      // the world you dug is kept; the haul is not
      endRun(ev.t);
      // A soft descending hum. The run ends gently; so does its sound.
      if (sfx) {
        sfx.tone(220, 0.5, 0.04, 'sine');
        setTimeout(() => { if (sfx) sfx.tone(150, 0.8, 0.035, 'sine'); }, 380);
      }
    } else if (ev.t === 'jettison') {
      jetsam.push({ x: ev.x, y: ev.y + 4, type: ev.type, vy: 12, life: 6 });
      if (sfx) sfx.play('drop');
      floatText('-' + ev.kg + ' kg', ev.x, ev.y - 8, C_ACCENT_TEXT);
      T().track('drop_cargo', { kg: ev.kg, depth: Math.round(run.y) });
    }
  }

  let tooHeavySeen = false;
  function endRun(cause) {
    T().track('run_end', { depth: Math.round(run.bestDepth), money: Math.round(run.money),
                           cause, seconds: Math.round((performance.now() - diveT0) / 1000),
                           region: Math.max(0, run.regionAt(run.bestDepth)) });
    diveT0 = performance.now();
    tooHeavySeen = false;
  }

  /* ============================================================
     RENDER: THE WORLD
     ============================================================ */
  const WATER_STOPS = [[0, 26, 94, 134], [120, 15, 61, 95], [300, 8, 42, 68],
                       [560, 2, 10, 18], [9999, 2, 10, 18]];
  function waterColorAt(d) {
    for (let i = 1; i < WATER_STOPS.length; i++) {
      if (d <= WATER_STOPS[i][0]) {
        const A = WATER_STOPS[i - 1], B = WATER_STOPS[i];
        const t = Math.max(0, (d - A[0]) / (B[0] - A[0]));
        return 'rgb(' + [1, 2, 3].map(j => Math.round(A[j] + (B[j] - A[j]) * t)).join(',') + ')';
      }
    }
    return '#02080F';
  }
  // Deterministic per-cell hash: the clay's grain, stable as the camera moves.
  const hsh = (a, b) => {
    let h = Math.imul(a, 374761393) + Math.imul(b, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const clayOf = (reg) => (reg < 0 ? CLAY_SEA : CLAY[Math.min(3, reg)]);
  /* A rounded rect with a radius per corner. ZAM_UI's takes one radius,
     which is right for chrome and wrong for clay: a tile must round only
     where it meets water and square up where it meets its own kind. */
  function clayPath(x, y, w, h, tl, tr, br, bl) {
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr);
    ctx.lineTo(x + w, y + h - br);
    if (br) ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
    ctx.lineTo(x + bl, y + h);
    if (bl) ctx.arcTo(x, y + h, x, y + h - bl, bl);
    ctx.lineTo(x, y + tl);
    if (tl) ctx.arcTo(x, y, x + tl, y, tl);
    ctx.closePath();
  }

  let fogCan = null, fogCtx = null;

  function drawWorld(now) {
    const t = now / 1000;
    const o = L.ocean, ppm = L.ppm, W = run.world;

    // Water, coloured by the depth actually on screen.
    const g = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
    g.addColorStop(0, waterColorAt(Math.max(0, cam.y)));
    g.addColorStop(1, waterColorAt(cam.y + L.viewHm));
    ctx.fillStyle = g;
    ctx.fillRect(o.x, o.y, o.w, o.h);

    ctx.save();
    ctx.beginPath(); ctx.rect(o.x, o.y, o.w, o.h); ctx.clip();
    const shx = shake > 0 ? (vr() - 0.5) * 7 * shake : 0;
    const shy = shake > 0 ? (vr() - 0.5) * 7 * shake : 0;
    ctx.translate(shx, shy);

    // Sky and the waterline, when the surface is on screen.
    if (cam.y < 0) {
      const sg = ctx.createLinearGradient(0, o.y, 0, sy(0));
      sg.addColorStop(0, '#BFE3EC'); sg.addColorStop(1, '#7FB9CD');
      ctx.fillStyle = sg; ctx.fillRect(o.x, o.y, o.w, sy(0) - o.y);
      ctx.strokeStyle = TINT(0.55); ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let px = 0; px <= o.w; px += 8) {
        const yy = sy(0) + Math.sin(px * 0.06 + t * 1.8) * 2.2;
        px === 0 ? ctx.moveTo(o.x + px, yy) : ctx.lineTo(o.x + px, yy);
      }
      ctx.stroke();
    }
    // Sun shafts in the open sea.
    if (cam.y < 90) {
      for (let i = 0; i < 5; i++) {
        const wx0 = 14 + i * 66 + Math.sin(t * 0.1 + i * 2) * 10;
        const sg2 = ctx.createLinearGradient(0, sy(0), 0, sy(76));
        sg2.addColorStop(0, 'rgba(170,220,235,0.11)'); sg2.addColorStop(1, 'rgba(170,220,235,0)');
        ctx.fillStyle = sg2;
        ctx.beginPath();
        ctx.moveTo(sx(wx0), sy(0)); ctx.lineTo(sx(wx0 + 18), sy(0));
        ctx.lineTo(sx(wx0 + 40), sy(76)); ctx.lineTo(sx(wx0 + 20), sy(76));
        ctx.closePath(); ctx.fill();
      }
    }

    drawTiles(t);
    drawSub(t);
    drawTilesOverSub(t);
    drawBubbles();
    drawJetsam();
    drawRings();
    drawFog(t);
    drawFloats();
    ctx.restore();
  }

  /* The clay. Rounded and irregular, so the world reads as material and
     never as graph paper; edges made of value, never an outline. */
  function drawTiles(t) {
    const W = run.world, s = TILE * L.ppm;
    const c0 = Math.max(0, Math.floor(cam.x / TILE) - 1);
    const c1 = Math.min(TUNE.COLS - 1, Math.ceil((cam.x + L.viewWm) / TILE) + 1);
    const r0 = Math.max(0, Math.floor(cam.y / TILE) - 1);
    const r1 = Math.min(TUNE.ROWS - 1, Math.ceil((cam.y + L.viewHm) / TILE) + 1);

    // Pass 1: magma glow, under the clay, so heat bleeds through the rock.
    for (let rr = r0; rr <= r1; rr++) {
      for (let cc = c0; cc <= c1; cc++) {
        if (W.at(cc, rr) !== TT.MAGMA) continue;
        const px = sx(cc * TILE), py = sy(rr * TILE);
        const gl = ctx.createRadialGradient(px + s / 2, py + s / 2, 0, px + s / 2, py + s / 2, s * 1.9);
        gl.addColorStop(0, 'rgba(255,150,70,0.55)');
        gl.addColorStop(0.45, 'rgba(220,90,40,0.22)');
        gl.addColorStop(1, 'rgba(220,90,40,0)');
        ctx.fillStyle = gl;
        ctx.fillRect(px - s * 1.9, py - s * 1.9, s * 4.8, s * 4.8);
      }
    }

    for (let rr = r0; rr <= r1; rr++)
      for (let cc = c0; cc <= c1; cc++) drawTileAt(cc, rr, t);

    // The tile the drill is on: a bright ring, or a refusal in coral.
    if (run.digTarget) {
      const d = run.digTarget;
      ctx.strokeStyle = d.blocked ? C_ACCENT_TEXT : TINT(0.72);
      ctx.lineWidth = 2;
      ctx.beginPath();
      UI.roundRectPath(ctx, sx(d.c * TILE) + 1, sy(d.r * TILE) + 1, s - 2, s - 2, s * 0.18);
      ctx.stroke();
    }
    // Silt clouds from broken tiles.
    for (const sp of silt) {
      const a = Math.max(0, sp.life / sp.max) * 0.3;
      ctx.fillStyle = 'rgba(150,178,168,' + a.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(sx(sp.x), sy(sp.y), sp.r * L.ppm, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* The submarine is 13.5 to 16.5 m long and a tile is 8 m, so in the shaft
     it digs the hull overhangs into the walls on both sides. Drawing the
     rock back over that overhang is what makes it read as a machine buried
     in the seam it is cutting, rather than a sprite lying on top of stone.

     Not at full strength, though: at 1.0 the boat becomes a sliver in a
     slot, and nine hand-made submarines deserve to be seen. At 0.72 the
     clay closes over the nose and the hull still reads through it, lit from
     inside the seam. This is the one place the tile grid and the locked
     camera ratio disagree, and it is a compromise, not a solution. */
  const SUB_OCCLUDE = 0.72;
  function drawTilesOverSub(t) {
    const W = run.world, r = FLEET[curSub].lenM * 0.5;
    const c0 = Math.max(0, Math.floor((run.x - r) / TILE));
    const c1 = Math.min(TUNE.COLS - 1, Math.floor((run.x + r) / TILE));
    const r0 = Math.max(0, Math.floor((run.y - r * 0.5) / TILE));
    const r1 = Math.min(TUNE.ROWS - 1, Math.floor((run.y + r * 0.5) / TILE));
    ctx.globalAlpha = SUB_OCCLUDE;
    for (let rr = r0; rr <= r1; rr++)
      for (let cc = c0; cc <= c1; cc++)
        if (SIM.isSolidType(W.at(cc, rr))) drawTileAt(cc, rr, t);
    ctx.globalAlpha = 1;
  }

  function drawTileAt(cc, rr, t) {
    const W = run.world, s = TILE * L.ppm;
    {
      {
        const ty = W.at(cc, rr);
        if (ty === TT.WATER || ty === TT.AIR) return;
        const pal = clayOf(W.regionOf(rr));
        const px = sx(cc * TILE), py = sy(rr * TILE);
        const h1 = hsh(cc, rr);

        /* Which faces the water touches. The map's side walls and the world
           below the floor count as clay, so the mass squares off against
           them instead of rounding into open space that is not there. */
        const openU = !SIM.isSolidType(W.at(cc, rr - 1));
        const openD = !SIM.isSolidType(W.at(cc, rr + 1));
        const openL = !SIM.isSolidType(W.at(cc - 1, rr));
        const openR = !SIM.isSolidType(W.at(cc + 1, rr));
        const exposed = openU || openD || openL || openR;

        let stops;
        if (ty === TT.BED) stops = C_BED;
        else if (ty === TT.MAGMA) stops = C_MAGMA;
        else if (ty === TT.HARD) stops = pal.hard;
        else if (ty === TT.SILT || ty === TT.GAS) stops = pal.silt;
        else stops = pal.rock;

        /* The fill says how deep in the mass this cell sits. A ceiling gets
           the lit band falling into mid; a cell merely beside a tunnel gets
           mid; buried clay gets deep. Nothing is outlined. */
        if (openU) {
          const gg = ctx.createLinearGradient(0, py, 0, py + s * 0.85);
          gg.addColorStop(0, stops[0]); gg.addColorStop(0.34, stops[1]); gg.addColorStop(1, stops[2]);
          ctx.fillStyle = gg;
        } else if (exposed) {
          const gg = ctx.createLinearGradient(0, py, 0, py + s);
          gg.addColorStop(0, stops[1]); gg.addColorStop(1, stops[2]);
          ctx.fillStyle = gg;
        } else {
          ctx.fillStyle = stops[2];
        }
        /* Only a corner with water on BOTH of its faces rounds. Everything
           else squares up against its neighbour, so the clay is one carved
           body and a lone tile is a boulder. */
        const rad = s * (0.2 + h1 * 0.12);
        ctx.beginPath();
        clayPath(px - 0.4, py - 0.4, s + 0.8, s + 0.8,
                 (openU && openL) ? rad : 0, (openU && openR) ? rad : 0,
                 (openD && openR) ? rad : 0, (openD && openL) ? rad : 0);
        ctx.fill();

        /* The light band along a face the water touches. Value, not an
           outline: it sits inside the clay and stops at the rounded ends. */
        if (openU) {
          ctx.strokeStyle = ty === TT.MAGMA ? 'rgba(255,226,180,0.6)' : pal.lit;
          ctx.lineWidth = Math.max(1.6, s * 0.05);
          const inset = ctx.lineWidth * 0.55;
          ctx.beginPath();
          ctx.moveTo(px + (openL ? rad * 0.8 : 0), py + inset);
          ctx.lineTo(px + s - (openR ? rad * 0.8 : 0), py + inset);
          ctx.stroke();
        }
        // A softer echo down a side wall, so a shaft has two lit cheeks.
        if (openL || openR) {
          ctx.strokeStyle = ty === TT.MAGMA ? 'rgba(255,226,180,0.34)' : pal.lit;
          ctx.globalAlpha = 0.42;
          ctx.lineWidth = Math.max(1.2, s * 0.036);
          const ins = ctx.lineWidth * 0.55;
          ctx.beginPath();
          if (openL) { ctx.moveTo(px + ins, py + (openU ? rad * 0.8 : 0)); ctx.lineTo(px + ins, py + s - (openD ? rad * 0.8 : 0)); }
          if (openR) { ctx.moveTo(px + s - ins, py + (openU ? rad * 0.8 : 0)); ctx.lineTo(px + s - ins, py + s - (openD ? rad * 0.8 : 0)); }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        // The clay's grain: one speckle, deterministic per cell.
        if (h1 > 0.32 && ty !== TT.MAGMA) {
          ctx.fillStyle = h1 > 0.72 ? 'rgba(220,244,232,0.07)' : 'rgba(0,0,0,0.2)';
          ctx.beginPath();
          ctx.arc(px + s * (0.24 + hsh(cc + 3, rr) * 0.52),
                  py + s * (0.3 + hsh(cc, rr + 5) * 0.42), s * 0.062, 0, Math.PI * 2);
          ctx.fill();
        }
        // Magma churn: a slow bright core, never a wide wash.
        if (ty === TT.MAGMA) {
          const pulse = 0.55 + 0.45 * Math.sin(t * 1.6 + cc * 1.7 + rr);
          ctx.fillStyle = 'rgba(255,226,170,' + (0.16 + 0.2 * pulse).toFixed(3) + ')';
          ctx.beginPath();
          ctx.ellipse(px + s * 0.5, py + s * (0.42 + 0.1 * pulse), s * 0.26, s * 0.17, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // Ore, drawn on its tile, sized so the eye reads the shape.
        const oreKey = SIM.ORE_OF[ty];
        if (oreKey) {
          const im = pickSprite(oreKey, cc * 3 + rr);
          if (im) {
            const oh = s * 0.66, ow = oh * (im.width / im.height);
            ctx.drawImage(im, px + (s - ow) / 2, py + s - oh - s * 0.1, ow, oh);
          } else {
            ctx.fillStyle = oreKey === 'crystal' ? '#9FD8E8' : oreKey === 'sulphide' ? '#E0B24E' : '#C98A5A';
            ctx.beginPath();
            ctx.ellipse(px + s * 0.5, py + s * 0.55, s * 0.2, s * 0.16, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        /* Gas tells before it traps: seeping bubbles, always, on every gas
           tile. Fairness is a feature. */
        if (ty === TT.GAS) {
          for (let b = 0; b < 2; b++) {
            const bx = px + s * (0.32 + b * 0.36);
            const rise = ((t * 6 + b * 4.5 + cc * 2.3) % 9) / 9;
            const by = py + s * 0.2 - rise * s * 0.9;
            ctx.fillStyle = 'rgba(200,240,250,' + (0.42 * (1 - rise)).toFixed(3) + ')';
            ctx.beginPath(); ctx.arc(bx, by, Math.max(1, s * 0.045), 0, Math.PI * 2); ctx.fill();
          }
        }
        /* Cracks, as the tile gives: short fractures radiating from where
           the drill bites, lengthening with progress. A single zig-zag read
           as a lightning bolt drawn on the rock. */
        const p = run.progress.get(rr * TUNE.COLS + cc);
        if (p) {
          const need = TUNE.hardness[SIM.HARD_KEY[ty]] || 1;
          const frac = Math.min(1, p / need);
          const mx = px + s * 0.5, my = py + s * 0.5;
          ctx.lineCap = 'round';
          const fracture = () => {
            ctx.beginPath();
            for (let k = 0; k < 5; k++) {
              const a = (k / 5) * Math.PI * 2 + hsh(cc, rr + 7) * 6.28;
              const len = s * 0.42 * frac * (0.55 + hsh(cc + k, rr) * 0.7);
              const bend = (hsh(cc, rr + k) - 0.5) * 0.7;
              ctx.moveTo(mx, my);
              ctx.lineTo(mx + Math.cos(a) * len * 0.55, my + Math.sin(a) * len * 0.55);
              ctx.lineTo(mx + Math.cos(a + bend) * len, my + Math.sin(a + bend) * len);
            }
            ctx.stroke();
          };
          /* A fracture is a void with a lit lip: the dark core offset down
             and right of a highlight, because the light is up and left. */
          ctx.save();
          ctx.translate(-s * 0.012, -s * 0.012);
          ctx.strokeStyle = 'rgba(226,244,236,' + (0.1 + frac * 0.17).toFixed(2) + ')';
          ctx.lineWidth = Math.max(1, s * 0.03);
          fracture();
          ctx.restore();
          ctx.strokeStyle = 'rgba(8,13,22,' + (0.24 + frac * 0.34).toFixed(2) + ')';
          ctx.lineWidth = Math.max(1, s * 0.032);
          fracture();
          ctx.lineCap = 'butt';
        }
      }
    }
  }

  function drawSub(t) {
    const ppm = L.ppm;
    const px = sx(run.x), py = sy(run.y);
    const f = FLEET[curSub], im = SUBIMGS[curSub];
    const Wp = f.lenM * ppm;
    const aspect = (im && im._ok) ? im.height / im.width : 0.5;
    const Hp = Wp * aspect;
    const tilt = Math.max(-0.17, Math.min(0.17, run.vy * 0.005));

    ctx.save();
    ctx.translate(px, py);
    ctx.scale(run.facing, 1);
    ctx.rotate(tilt);
    /* The lamp's near glow: a thin bright core with a tight feather, per the
       design system. It was a wash at radius lampR/2 and alpha 0.22, and a
       wash sits on the clay AND the water equally — measured on the painted
       pixel, it collapsed the rock-against-tunnel edge from 5:1 to 1.3:1 in
       exactly the place you are drilling. The fog is what lights the world;
       this is only the bulb. */
    const lr = run.lampR() * ppm * 0.24;
    const lg = ctx.createRadialGradient(Wp * 0.4, 0, 0, Wp * 0.4, 0, lr);
    lg.addColorStop(0, 'rgba(224,246,255,0.3)');
    lg.addColorStop(0.34, 'rgba(224,246,255,0.07)');
    lg.addColorStop(1, 'rgba(224,246,255,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(Wp * 0.4, 0, lr, 0, Math.PI * 2); ctx.fill();
    if (im && im._ok) ctx.drawImage(im, -Wp / 2, -Hp / 2, Wp, Hp);
    else {
      ctx.fillStyle = '#F0C255';
      ctx.beginPath(); ctx.ellipse(0, 0, Wp * 0.45, Hp * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    }
    // Drill sparks while the clay is giving.
    if (run._digging) {
      ctx.fillStyle = 'rgba(255,220,140,' + (0.45 + vr() * 0.35).toFixed(2) + ')';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(Wp * 0.48 + vr() * 6, (vr() - 0.5) * Hp * 0.5, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* Past the lamp there is nothing but dark. The tunnels you carve are the
     only map there is, and the memory of the way back is the game. */
  function drawFog(t) {
    const o = L.ocean, ppm = L.ppm;
    const seabedY = TUNE.SEA_ROWS * TILE;
    if (cam.y + L.viewHm < seabedY - 26) return;
    const dpr = canvas.width / LW;
    if (!fogCan || fogCan.width !== canvas.width || fogCan.height !== canvas.height) {
      fogCan = document.createElement('canvas');
      fogCan.width = canvas.width; fogCan.height = canvas.height;
      fogCtx = fogCan.getContext('2d');
    }
    fogCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fogCtx.clearRect(0, 0, LW, LH);
    const fogTop = sy(seabedY);
    fogCtx.fillStyle = 'rgba(2,7,12,0.9)';
    fogCtx.fillRect(0, Math.max(o.y, fogTop), LW, LH);
    // Soften where the dark begins, so the seabed is a threshold, not a lid.
    const fg = fogCtx.createLinearGradient(0, fogTop - 34, 0, fogTop + 42);
    fg.addColorStop(0, 'rgba(2,7,12,0)'); fg.addColorStop(1, 'rgba(2,7,12,0.9)');
    fogCtx.fillStyle = fg;
    fogCtx.fillRect(0, fogTop - 34, LW, 76);

    fogCtx.globalCompositeOperation = 'destination-out';
    const px = sx(run.x), py = sy(run.y), lr = run.lampR() * ppm;
    const lamp = fogCtx.createRadialGradient(px, py, 0, px, py, lr);
    lamp.addColorStop(0, 'rgba(0,0,0,1)');
    lamp.addColorStop(0.52, 'rgba(0,0,0,0.88)');
    lamp.addColorStop(1, 'rgba(0,0,0,0)');
    fogCtx.fillStyle = lamp;
    fogCtx.beginPath(); fogCtx.arc(px, py, lr, 0, Math.PI * 2); fogCtx.fill();
    // Magma is the Foundry's own light: near it, the fog lifts.
    const W = run.world;
    const c0 = Math.max(0, Math.floor(cam.x / TILE) - 1);
    const c1 = Math.min(TUNE.COLS - 1, Math.ceil((cam.x + L.viewWm) / TILE) + 1);
    const r0 = Math.max(0, Math.floor(cam.y / TILE) - 1);
    const r1 = Math.min(TUNE.ROWS - 1, Math.ceil((cam.y + L.viewHm) / TILE) + 1);
    for (let rr = r0; rr <= r1; rr++) {
      for (let cc = c0; cc <= c1; cc++) {
        if (W.at(cc, rr) !== TT.MAGMA) continue;
        const mx = sx(cc * TILE + TILE / 2), my = sy(rr * TILE + TILE / 2);
        const mr = TILE * ppm * 2.1;
        const mg = fogCtx.createRadialGradient(mx, my, 0, mx, my, mr);
        mg.addColorStop(0, 'rgba(0,0,0,0.92)');
        mg.addColorStop(1, 'rgba(0,0,0,0)');
        fogCtx.fillStyle = mg;
        fogCtx.beginPath(); fogCtx.arc(mx, my, mr, 0, Math.PI * 2); fogCtx.fill();
      }
    }
    fogCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(fogCan, 0, 0, LW, LH);
  }

  function drawBubbles() {
    const ppm = L.ppm;
    ctx.fillStyle = 'rgba(210,240,250,0.45)';
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), Math.max(0.8, p.r * ppm * 0.35), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function drawRings() {
    const ppm = L.ppm;
    ctx.strokeStyle = 'rgba(200,230,245,0.22)'; ctx.lineWidth = 1.4;
    for (const r of rings) {
      ctx.globalAlpha = Math.max(0, r.life / 0.6) * 0.8;
      ctx.beginPath(); ctx.arc(sx(r.x), sy(r.y), r.r * ppm, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawJetsam() {
    const ppm = L.ppm;
    for (const j of jetsam) {
      const im = pickSprite(j.type, 1);
      const h = 2.6 * ppm;
      ctx.globalAlpha = Math.min(1, j.life / 1.6);
      if (im) ctx.drawImage(im, sx(j.x) - h * (im.width / im.height) / 2, sy(j.y) - h / 2,
                            h * (im.width / im.height), h);
      ctx.globalAlpha = 1;
    }
  }
  // Float text sits above the fog: a number you must read is never dimmed.
  function drawFloats() {
    ctx.font = '700 13px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of floats) {
      ctx.globalAlpha = Math.min(1, f.life / 0.6);
      ctx.fillStyle = SCRIM(0.5);
      const w = ctx.measureText(f.text).width + 14;
      ctx.beginPath(); UI.roundRectPath(ctx, sx(f.x) - w / 2, sy(f.y) - 10, w, 20, 10); ctx.fill();
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sx(f.x), sy(f.y) + 1);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  /* ============================================================
     RENDER: CHROME
     ============================================================ */
  function drawBar(x, y, w, h, frac, color) {
    ctx.fillStyle = TINT(0.10);
    ctx.beginPath(); UI.roundRectPath(ctx, x, y, w, h, h / 2); ctx.fill();
    if (frac > 0.005) {
      ctx.fillStyle = color;
      ctx.beginPath(); UI.roundRectPath(ctx, x, y, Math.max(h, w * Math.min(1, frac)), h, h / 2); ctx.fill();
    }
  }
  function drawPips(x, y, n, of, color) {
    for (let i = 0; i < of; i++) {
      ctx.fillStyle = i < n ? color : TINT(0.14);
      ctx.beginPath(); UI.roundRectPath(ctx, x + i * 11, y, 8, 7, 2.5); ctx.fill();
    }
  }
  const fmtMoney = (n) => '$ ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  /* A floating instrument: a small scrim block with labelled rows, drawn ON
     the water. A row is [label, frac, color, valueText] or, for the hull,
     [label, 'pips', color, n]. */
  function drawIndicators(x, y, w, rows) {
    const h = rows.length * 26 + 10;
    ctx.fillStyle = SCRIM(0.55);
    ctx.beginPath(); UI.roundRectPath(ctx, x, y, w, h, 12); ctx.fill();
    ctx.textBaseline = 'middle';
    for (let i = 0; i < rows.length; i++) {
      const ry = y + 18 + i * 26;
      ctx.fillStyle = INK72; ctx.font = '700 10px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(rows[i][0], x + 12, ry);
      if (rows[i][1] === 'pips') drawPips(x + 58, ry - 3.5, rows[i][3], TUNE.hullPips, rows[i][2]);
      else {
        drawBar(x + 58, ry - 3.5, w - 58 - 58, 7, rows[i][1], rows[i][2]);
        ctx.fillStyle = INK90; ctx.font = '600 11px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(rows[i][3], x + w - 12, ry);
      }
      ctx.textAlign = 'left';
    }
    ctx.textBaseline = 'top';
    return h;
  }

  /* TOO HEAVY: SEALED's heir, in the same visual language. The hold
     outweighs the hull's spare buoyancy, so at an empty tank the sub still
     cannot rise. Informational — DROP CARGO always works, always. */
  function drawTooHeavy(now) {
    const need = run.tooHeavyNeed();
    if (!need || card) return;
    if (!tooHeavySeen) { tooHeavySeen = true; T().track('too_heavy_event', { kg: need, depth: Math.round(run.y) }); }
    const o = L.ocean;
    const msg = 'TOO HEAVY · drop ' + need + ' kg to rise';
    ctx.font = '700 15px Inter, sans-serif';
    const tw = ctx.measureText(msg).width;
    const w = tw + 74, h = 40;
    const x = o.x + o.w / 2 - w / 2, y = o.y + (MODE === 'desktop' ? 84 : 26);
    const pulse = 0.75 + 0.25 * Math.sin(now / 300);
    ctx.fillStyle = SCRIM(0.85);
    ctx.beginPath(); UI.roundRectPath(ctx, x, y, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,107,92,' + pulse.toFixed(2) + ')';   // --accent-text
    ctx.lineWidth = 1.5;
    ctx.beginPath(); UI.roundRectPath(ctx, x, y, w, h, h / 2); ctx.stroke();
    // Blocked-rise glyph.
    ctx.strokeStyle = C_ACCENT_TEXT; ctx.lineWidth = 2.5;
    const ax = x + 26, ay = y + h / 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay + 7); ctx.lineTo(ax, ay - 4);
    ctx.moveTo(ax - 5, ay + 1); ctx.lineTo(ax, ay - 4); ctx.lineTo(ax + 5, ay + 1);
    ctx.moveTo(ax - 7, ay - 8); ctx.lineTo(ax + 7, ay - 8);
    ctx.stroke();
    ctx.fillStyle = INK92;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(msg, x + 44, y + h / 2 + 1);
    ctx.textBaseline = 'top';
  }

  /* Motherload's FUEL LOW, translated: a loud, unmissable warning long
     before the clock can kill. */
  function drawAirLow(now) {
    if (card) return;
    if (!(run.air < run.airMax() * 0.33 && run.y > TUNE.surfaceY)) return;
    const o = L.ocean;
    const msg = 'AIR LOW';
    ctx.font = '800 15px Inter, sans-serif';
    const tw = ctx.measureText(msg).width;
    const x = o.x + 14;
    const y = MODE === 'desktop' ? o.y + 108 : o.y + (run.tooHeavyNeed() > 0 ? 78 : 18);
    const pulse = 0.55 + 0.45 * Math.sin(now / 220);
    ctx.fillStyle = SCRIM(0.8);
    ctx.beginPath(); UI.roundRectPath(ctx, x, y, tw + 26, 32, 16); ctx.fill();
    ctx.globalAlpha = 0.55 + pulse * 0.45;
    ctx.fillStyle = C_ACCENT_TEXT;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(msg, x + 13, y + 17);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'top';
  }

  function pill(id, label, cx, cy, opts) {
    const box = UI.drawPill(ctx, label, cx, cy, opts);
    let entry = hit.pills.find(p => p.id === id);
    if (!entry) { entry = { id, tapped: null }; hit.pills.push(entry); }
    entry.box = box;
    return box;
  }
  function iconPill(id, cx, cy, draw) {
    const box = pill(id, '', cx, cy, { w: UI.PILL.iconW });
    draw(cx, cy);
    return box;
  }
  function speakerIcon(cx, cy, on) {
    ctx.strokeStyle = INK92; ctx.fillStyle = INK92; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 3); ctx.lineTo(cx - 4, cy - 3); ctx.lineTo(cx + 1, cy - 7);
    ctx.lineTo(cx + 1, cy + 7); ctx.lineTo(cx - 4, cy + 3); ctx.lineTo(cx - 8, cy + 3);
    ctx.closePath(); ctx.fill();
    if (on) {
      ctx.beginPath(); ctx.arc(cx + 4, cy, 4.5, -1, 1); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 4, cy, 7.5, -1, 1); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx + 4, cy - 4); ctx.lineTo(cx + 10, cy + 4);
      ctx.moveTo(cx + 10, cy - 4); ctx.lineTo(cx + 4, cy + 4);
      ctx.stroke();
    }
  }
  function questionIcon(cx, cy) {
    ctx.fillStyle = INK92;
    ctx.font = '700 15px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', cx, cy + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }
  function subGlyph(cx, cy) {
    ctx.fillStyle = INK92;
    ctx.beginPath(); ctx.ellipse(cx + 1, cy + 1, 8.5, 4.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, cy - 4.5, 3, 2.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy + 1); ctx.lineTo(cx - 12.5, cy - 3); ctx.lineTo(cx - 12.5, cy + 5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = C_BG;
    ctx.beginPath(); ctx.arc(cx + 4.5, cy + 0.6, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  function jettisonPill(cx, cy) {
    ctx.font = '700 ' + UI.PILL.font + 'px Inter, sans-serif';
    // Most people do not know what "jettison" means. The button says what it does.
    const label = 'DROP CARGO';
    const w = Math.round(ctx.measureText(label).width + UI.PILL.padX + 10);
    const box = pill('jettison', '', cx, cy, { w });
    const has = run.cargo.length > 0;
    const colr = has ? C_ACCENT_TEXT : UI.PILL.textDim;
    ctx.strokeStyle = colr; ctx.lineWidth = 2.2;
    const ax = cx - w / 2 + 18, ay = cy;
    ctx.beginPath();
    ctx.moveTo(ax, ay - 7); ctx.lineTo(ax, ay + 6);
    ctx.moveTo(ax - 5, ay + 1); ctx.lineTo(ax, ay + 7); ctx.lineTo(ax + 5, ay + 1);
    ctx.stroke();
    ctx.fillStyle = has ? INK92 : UI.PILL.textDim;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, cx + 6, cy + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    return box;
  }

  function drawChromeMobile(now) {
    // Top band: solid Ground; bank, depth and hull left, the gauges right.
    ctx.fillStyle = C_BG;
    ctx.fillRect(0, 0, LW, L.top);
    ctx.textBaseline = 'middle';
    ctx.font = '800 18px Inter, sans-serif';
    const mStr = fmtMoney(run.money);
    const mw = ctx.measureText(mStr).width;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(mStr, SIDE_PAD, 26);
    ctx.fillStyle = INK72; ctx.font = '600 14px Inter, sans-serif';
    ctx.fillText('·  ' + Math.round(run.y) + ' m', SIDE_PAD + mw + 10, 27);
    ctx.font = '700 10px Inter, sans-serif';
    ctx.fillText('HULL', SIDE_PAD, 54);
    drawPips(SIDE_PAD + 34, 50, Math.ceil(run.hull), TUNE.hullPips,
             run.hull <= 2 ? C_ACCENT_TEXT : C_BRAND);
    ctx.textBaseline = 'top';

    const zx = LW - SIDE_PAD - 170;
    const rows = [
      ['CARGO', run.cargoKg / run.cargoMax(), C_ACCENT_TEXT, Math.round(run.cargoKg) + '/' + run.cargoMax()],
      ['AIR', run.air / run.airMax(), run.air / run.airMax() < 0.25 ? C_ACCENT_TEXT : C_GREEN, Math.round(run.air) + ''],
      ['BATT', run.batt / run.battMax(), C_SUN, Math.round(run.batt) + ''],
    ];
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) {
      const ry = 16 + i * 24;
      ctx.fillStyle = INK72; ctx.font = '700 10px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(rows[i][0], zx, ry);
      drawBar(zx + 48, ry - 3, 84, 6, rows[i][1], rows[i][2]);
      ctx.fillStyle = INK90; ctx.font = '600 11px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(rows[i][3], LW - SIDE_PAD, ry);
      ctx.textAlign = 'left';
    }
    ctx.textBaseline = 'top';

    drawTooHeavy(now);

    // Bottom row on the band system's centre line: sound, rules, fleet, the verb.
    const cy = L.rowCy;
    iconPill('sound', SIDE_PAD + 22, cy, (cx, cyy) => speakerIcon(cx, cyy, sfx ? sfx.isOn() : true));
    iconPill('rules', SIDE_PAD + 22 + (UI.PILL.iconW + UI.PILL.gap), cy, questionIcon);
    const p3 = iconPill('fleet', SIDE_PAD + 22 + (UI.PILL.iconW + UI.PILL.gap) * 2, cy, subGlyph);
    ctx.font = '700 ' + UI.PILL.font + 'px Inter, sans-serif';
    const jw = Math.round(ctx.measureText('DROP CARGO').width + UI.PILL.padX + 10);
    const jcx = Math.max(LW / 2, p3.x + p3.w + UI.PILL.gap + jw / 2);
    jettisonPill(jcx, cy);

    // Scheme A: UP and DOWN, thumb-stacked. Chrome-sized, bigger hit slop.
    if (scheme === 'A') {
      const btn = (b, label, up, activeId) => {
        const active = activeId != null;
        ctx.fillStyle = active ? TINT(0.14) : UI.PILL.fill;
        ctx.beginPath(); UI.roundRectPath(ctx, b.cx - 22, b.cy - 20, 44, 40, 20); ctx.fill();
        ctx.strokeStyle = active ? TINT(0.7) : UI.PILL.border; ctx.lineWidth = UI.PILL.borderW;
        ctx.beginPath(); UI.roundRectPath(ctx, b.cx - 22, b.cy - 20, 44, 40, 20); ctx.stroke();
        ctx.strokeStyle = INK92; ctx.lineWidth = 2.4;
        ctx.beginPath();
        if (up) {
          ctx.moveTo(b.cx, b.cy + 6); ctx.lineTo(b.cx, b.cy - 6);
          ctx.moveTo(b.cx - 6, b.cy); ctx.lineTo(b.cx, b.cy - 7); ctx.lineTo(b.cx + 6, b.cy);
        } else {
          ctx.moveTo(b.cx, b.cy - 6); ctx.lineTo(b.cx, b.cy + 6);
          ctx.moveTo(b.cx - 6, b.cy); ctx.lineTo(b.cx, b.cy + 7); ctx.lineTo(b.cx + 6, b.cy);
        }
        ctx.stroke();
        ctx.fillStyle = INK72; ctx.font = '700 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, b.cx, b.cy + 24);
        ctx.textAlign = 'left';
      };
      btn(L.blowBtn, 'UP', true, held.blowBtn);
      btn(L.floodBtn, 'DOWN', false, held.floodBtn);
    }
  }

  function drawChromeDesktop(now) {
    // Top band: control row left, read-out right, on the same centre line.
    const cy = L.top / 2;
    let x = SIDE_PAD;
    const b1 = iconPill('sound', x + 22, cy, (cx, cyy) => speakerIcon(cx, cyy, sfx ? sfx.isOn() : true));
    x = b1.x + b1.w + UI.PILL.gap;
    const b2 = pill('fleet', 'Fleet', x + UI.pillWidth(ctx, 'Fleet') / 2, cy);
    x = b2.x + b2.w + UI.PILL.gap;
    const b3 = pill('rules', 'Rules', x + UI.pillWidth(ctx, 'Rules') / 2, cy);
    L.rowRight = b3.x + b3.w;
    // Read-out: depth and the bank in one right-aligned line, shrinking into
    // whatever room the control row has left it, with a floor.
    const ro = 'DEPTH ' + Math.round(run.y) + ' m   ·   ' + fmtMoney(run.money);
    ctx.font = '600 16px Inter, sans-serif';
    const roW = ctx.measureText(ro).width;
    const roomFor = LW - SIDE_PAD - (L.rowRight + 16);
    const hs = roW > roomFor ? Math.max(0.66, roomFor / roW) : 1;
    L.roFits = roW * hs <= roomFor + 0.5;
    ctx.save();
    ctx.translate(LW - SIDE_PAD, cy);
    ctx.scale(hs, hs);
    ctx.fillStyle = INK72; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(ro, 0, 1);
    ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    // Floating instruments on the water: air, battery and hull top-left,
    // cargo top-right. The rest of the frame is world.
    const o = L.ocean;
    drawIndicators(o.x + 14, o.y + 14, 216, [
      ['AIR', run.air / run.airMax(), run.air / run.airMax() < 0.25 ? C_ACCENT_TEXT : C_GREEN,
       Math.round(run.air) + ''],
      ['BATT', run.batt / run.battMax(), C_SUN, Math.round(run.batt) + ''],
      ['HULL', 'pips', run.hull <= 2 ? C_ACCENT_TEXT : C_BRAND, Math.ceil(run.hull)],
    ]);
    drawIndicators(o.x + o.w - 14 - 216, o.y + 14, 216, [
      ['CARGO', run.cargoKg / run.cargoMax(), C_ACCENT_TEXT,
       Math.round(run.cargoKg) + ' / ' + run.cargoMax() + ' kg'],
    ]);
    jettisonPill(L.jettison.cx, L.jettison.cy);
    drawTooHeavy(now);
  }

  /* ============================================================
     RENDER: CARDS
     The standard modal: 470 x 420 max, three zones, only the body
     scrolls, the type never shrinks and the CTA never moves.
     ============================================================ */
  function cardBox() {
    const pw = Math.min(LW - 56, 470);
    const ph = Math.min(LH - 20, 420);
    const px = Math.round((LW - pw) / 2);
    const py = Math.max(10, Math.round((LH - ph) / 2));
    return { pw, ph, px, py };
  }
  const HEAD_H = 154, FOOT_H = 98;

  function rulesCopy() {
    const move = MODE === 'desktop'
      ? 'S floods and sinks. W blows and lifts. Let go and the sub hovers where it is.'
      : scheme === 'A'
        ? 'DOWN floods and sinks. UP blows and lifts. Let go and the sub hovers where it is.'
        : 'Drag below the sub to sink, above it to rise. Let go and it hovers where it is.';
    const dig = MODE === 'desktop'
      ? 'Lean into rock and the drill eats it: S for the floor, A or D for a wall, W for the ceiling.'
      : scheme === 'A'
        ? 'Lean into rock and the drill eats it: DOWN for the floor, the left or right half for a wall.'
        : 'Drag the sub into rock and the drill eats it: down for the floor, sideways for a wall.';
    return [
      move,
      dig,
      'Ore goes straight into the hold, and ore is weight. Only light things rise.',
      'TOO HEAVY means the hold outweighs the hull. ' +
        (MODE === 'desktop' ? 'J' : 'DROP CARGO') + ' sheds the heaviest piece, always.',
      'Your lamp is the only map. The way home is the shaft you remember digging.',
      'Surface to bank, refill and repair. Run out of air and you lose the haul, never the bank or the mine.',
    ];
  }

  /* ---------- THE LOOPING DEMO ----------
     "Only light things rise" is not guessable from a still, so the card
     carries the whole loop in eight seconds and no words: dig down, drill
     ore, TOO HEAVY, drop, float home. */
  const DEMO_LOOP = 8.0;
  function drawDemo(bx, by, bw, bh, t) {
    const loop = t % DEMO_LOOP;
    const COLS_D = Math.max(7, Math.floor(bw / 30));
    const s = Math.min(bh / 4.2, bw / COLS_D);
    const gw = COLS_D * s;
    const ox = bx + (bw - gw) / 2, oy = by + (bh - s * 4.2) / 2;
    const mid = Math.floor(COLS_D / 2);

    ctx.save();
    ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
    // Water above, clay below: rows 0 (water) then 1..3 (clay).
    ctx.fillStyle = '#0B2233';
    ctx.fillRect(ox, oy, gw, s * 4.2);

    // How much of the shaft has been dug, by phase.
    const dugTo = loop < 0.55 ? 0 : loop < 1.25 ? 1 : loop < 2.1 ? 2 : 3;
    const oreTaken = loop >= 2.1;
    const dropped = loop >= 5.2;

    for (let r = 1; r <= 3; r++) {
      for (let c = 0; c < COLS_D; c++) {
        const isShaft = c === mid && r <= dugTo;
        if (isShaft) continue;
        const px = ox + c * s, py = oy + s + (r - 1) * s;
        const h1 = hsh(c, r + 40);
        const isOre = (c === mid && r === 3);
        const pal = CLAY[0];
        const col = isOre ? pal.rock : (r === 1 ? pal.silt : pal.rock);
        const gg = ctx.createLinearGradient(0, py, 0, py + s);
        gg.addColorStop(0, col[0]); gg.addColorStop(1, col[1]);
        ctx.fillStyle = gg;
        ctx.beginPath(); UI.roundRectPath(ctx, px - 0.4, py - 0.4, s + 0.8, s + 0.8, s * (0.15 + h1 * 0.1));
        ctx.fill();
        if (isOre && !oreTaken) {
          const im = pickSprite('nodule', 2);
          const oh = s * 0.66;
          if (im) ctx.drawImage(im, px + (s - oh * (im.width / im.height)) / 2, py + s - oh - s * 0.1,
                                oh * (im.width / im.height), oh);
          else { ctx.fillStyle = '#C98A5A'; ctx.beginPath(); ctx.arc(px + s / 2, py + s * 0.55, s * 0.2, 0, Math.PI * 2); ctx.fill(); }
        }
      }
    }
    // The surface line.
    ctx.strokeStyle = TINT(0.4); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ox, oy + s * 0.28); ctx.lineTo(ox + gw, oy + s * 0.28); ctx.stroke();

    // Where the sub is, by phase.
    let subR = 0.35;                                       // in rows below the top
    if (loop < 2.1) subR = 0.35 + (loop / 2.1) * 2.9;      // digging down
    else if (loop < 5.2) subR = 3.25 + Math.sin(loop * 5) * 0.06;   // straining, going nowhere
    else if (loop < 6.0) subR = 3.25;                      // the drop
    else subR = 3.25 - ((loop - 6.0) / 2.0) * 3.1;         // floating home
    const sxp = ox + mid * s + s / 2, syp = oy + s * 0.5 + subR * s;

    // The dropped chunk falls away.
    if (dropped && loop < 6.4) {
      const f = (loop - 5.2) / 1.2;
      const im = pickSprite('nodule', 2);
      const oh = s * 0.5;
      ctx.globalAlpha = Math.max(0, 1 - f);
      if (im) ctx.drawImage(im, sxp - oh * (im.width / im.height) / 2, syp + s * 0.3 + f * s * 0.8,
                            oh * (im.width / im.height), oh);
      ctx.globalAlpha = 1;
    }

    const im = SUBIMGS[curSub];
    const Wp = s * 1.5;
    const Hp = Wp * ((im && im._ok) ? im.height / im.width : 0.5);
    if (im && im._ok) ctx.drawImage(im, sxp - Wp / 2, syp - Hp / 2, Wp, Hp);
    else { ctx.fillStyle = '#F0C255'; ctx.beginPath(); ctx.ellipse(sxp, syp, Wp * 0.45, Hp * 0.4, 0, 0, Math.PI * 2); ctx.fill(); }

    // The cargo tag rides with the sub once the ore is aboard.
    if (oreTaken && !dropped) {
      ctx.font = '700 11px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lab = '+20 kg';
      const w = ctx.measureText(lab).width + 12;
      ctx.fillStyle = SCRIM(0.7);
      ctx.beginPath(); UI.roundRectPath(ctx, sxp - w / 2, syp - Hp / 2 - 17, w, 15, 7.5); ctx.fill();
      ctx.fillStyle = C_ACCENT_TEXT;
      ctx.fillText(lab, sxp, syp - Hp / 2 - 9);
    }
    // TOO HEAVY, exactly as the game says it.
    if (loop >= 2.6 && loop < 5.2) {
      ctx.font = '800 11px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lab = 'TOO HEAVY';
      const w = ctx.measureText(lab).width + 18;
      const bxx = ox + gw / 2 - w / 2, byy = by + 6;
      ctx.fillStyle = SCRIM(0.85);
      ctx.beginPath(); UI.roundRectPath(ctx, bxx, byy, w, 19, 9.5); ctx.fill();
      ctx.strokeStyle = 'rgba(255,107,92,' + (0.6 + 0.4 * Math.sin(loop * 7)).toFixed(2) + ')';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); UI.roundRectPath(ctx, bxx, byy, w, 19, 9.5); ctx.stroke();
      ctx.fillStyle = C_ACCENT_TEXT;
      ctx.fillText(lab, ox + gw / 2, byy + 10);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.restore();
  }

  /* The demo never exceeds the body it lives in, so at the 480 x 360 embed
     minimum it shrinks to fit rather than being clipped in half. The rules
     below it still scroll — that is the design, not a fault. */
  const DEMO_H = 100;
  let rulesContentH = 0, lastDemoH = DEMO_H;
  function drawRulesCard(now) {
    const { pw, ph, px, py } = cardBox();
    ctx.fillStyle = SCRIM(0.88); ctx.fillRect(0, 0, LW, LH);
    ctx.fillStyle = C_SURFACE;
    ctx.beginPath(); UI.roundRectPath(ctx, px, py, pw, ph, 22); ctx.fill();
    ctx.strokeStyle = TINT(0.12); ctx.lineWidth = 1;
    ctx.beginPath(); UI.roundRectPath(ctx, px, py, pw, ph, 22); ctx.stroke();
    const cx = px + pw / 2;
    // Header.
    ctx.fillStyle = '#FFFFFF'; ctx.font = '800 40px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('FATHOM', cx, py + 34 + 32);
    ctx.fillStyle = INK82; ctx.font = '600 17px Inter, sans-serif';
    ctx.fillText('Dig anywhere. Only light things rise.', cx, py + 34 + 70);
    // Body: clipped viewport, scrolls.
    const bodyY = py + HEAD_H;
    const bodyH = ph - HEAD_H - FOOT_H;
    hit.rulesBody = { x: px, y: bodyY, w: pw, h: bodyH };
    ctx.save();
    ctx.beginPath(); ctx.rect(px, bodyY, pw, bodyH); ctx.clip();
    const rules = rulesCopy();
    const wrapW = pw - 100;
    /* The demo yields a line of copy before it takes the rest. A body that
       is nothing but demo reads as a card with no rules in it; one visible
       line of rule 1 is what says "there is more below". */
    const demoH = Math.max(44, Math.min(DEMO_H, bodyH - 38));
    lastDemoH = demoH;
    ctx.font = '500 16px Inter, sans-serif';
    let contentH = demoH + 16;
    const rowsWrapped = rules.map(r => {
      const lines = wrapText(r, wrapW);
      contentH += lines.length * 22 + 13;
      return lines;
    });
    contentH -= 13;
    rulesContentH = contentH;
    const scrollMax = Math.max(0, contentH - bodyH);
    rulesScroll = Math.max(0, Math.min(scrollMax, rulesScroll));
    let ry = bodyY - rulesScroll + 2;
    // The demo rides at the top of the scroll region, as content.
    drawDemo(px + 24, ry, pw - 48, demoH, now / 1000);
    ry += demoH + 16;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (let i = 0; i < rules.length; i++) {
      const lines = rowsWrapped[i];
      ctx.fillStyle = C_ACCENT_TEXT;
      ctx.beginPath(); ctx.arc(px + 43, ry + 11, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C_BG; ctx.font = '800 14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), px + 43, ry + 12);
      ctx.textAlign = 'left';
      ctx.fillStyle = INK90; ctx.font = '500 16px Inter, sans-serif';
      for (let li = 0; li < lines.length; li++) ctx.fillText(lines[li], px + 66, ry + 11 + li * 22);
      ry += lines.length * 22 + 13;
    }
    ctx.restore();
    // Edge fades where there is more content. No scrollbar, no arrows.
    if (rulesScroll > 2) {
      const fg = ctx.createLinearGradient(0, bodyY, 0, bodyY + 20);
      fg.addColorStop(0, C_SURFACE); fg.addColorStop(1, 'rgba(19,31,54,0)');
      ctx.fillStyle = fg; ctx.fillRect(px + 2, bodyY, pw - 4, 20);
    }
    if (rulesScroll < scrollMax - 2) {
      const fg = ctx.createLinearGradient(0, bodyY + bodyH - 20, 0, bodyY + bodyH);
      fg.addColorStop(0, 'rgba(19,31,54,0)'); fg.addColorStop(1, C_SURFACE);
      ctx.fillStyle = fg; ctx.fillRect(px + 2, bodyY + bodyH - 20, pw - 4, 20);
    }
    // Footer.
    ctx.textAlign = 'center';
    hit.cta = UI.drawCTA(ctx, 'DIVE', cx, py + ph - FOOT_H + 16 + 25, C_ACCENT);
    /* Under the card: the scheme toggle (mobile) and a fresh ocean. In a
       short frame (the 480x360 embed minimum) there is no room below the
       card and they would sit on the CTA, so they hide instead. */
    ctx.textBaseline = 'middle';
    const underY = py + ph + 30;
    if (MODE === 'mobile' && LH - (py + ph) >= 58) {
      const lab = scheme === 'A' ? 'CONTROLS: BUTTONS' : 'CONTROLS: GESTURES';
      const oc = oceanArmed ? 'LOSE THIS MINE?' : 'NEW OCEAN';
      const w1 = UI.pillWidth(ctx, lab);
      const w2 = UI.pillWidth(ctx, oc);
      const total = w1 + UI.PILL.gap + w2;
      hit.schemeToggle = UI.drawPill(ctx, lab, LW / 2 - total / 2 + w1 / 2, underY);
      hit.newOcean = UI.drawPill(ctx, oc, LW / 2 + total / 2 - w2 / 2, underY);
    } else if (MODE === 'desktop' && LH - (py + ph) >= 58) {
      hit.schemeToggle = null;
      hit.newOcean = UI.drawPill(ctx, oceanArmed ? 'LOSE THIS MINE?' : 'NEW OCEAN', LW / 2, underY);
    } else {
      hit.schemeToggle = null; hit.newOcean = null;
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  function drawEndCard(title, subtitle, rows) {
    const { pw, ph, px, py } = cardBox();
    ctx.fillStyle = SCRIM(0.82); ctx.fillRect(0, 0, LW, LH);
    ctx.fillStyle = C_SURFACE;
    ctx.beginPath(); UI.roundRectPath(ctx, px, py, pw, ph, 22); ctx.fill();
    ctx.strokeStyle = TINT(0.12); ctx.lineWidth = 1;
    ctx.beginPath(); UI.roundRectPath(ctx, px, py, pw, ph, 22); ctx.stroke();
    const cx = px + pw / 2;
    ctx.fillStyle = '#FFFFFF'; ctx.font = '800 40px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, cx, py + 34 + 32);
    ctx.fillStyle = INK82; ctx.font = '600 17px Inter, sans-serif';
    ctx.fillText(subtitle, cx, py + 34 + 70);
    ctx.font = '500 16px Inter, sans-serif'; ctx.textBaseline = 'middle';
    let ry = py + HEAD_H + 18;
    for (const [k, v] of rows) {
      ctx.fillStyle = INK72; ctx.textAlign = 'left';
      ctx.fillText(k, px + 56, ry);
      ctx.fillStyle = INK90; ctx.textAlign = 'right';
      ctx.fillText(v, px + pw - 56, ry);
      ry += 30;
    }
    // The next thing to want: the cheapest boat you cannot afford yet.
    const next = FLEET.find((f, i) => !owned.includes(i) && f.price > run.money);
    if (next) {
      ctx.textAlign = 'center'; ctx.fillStyle = INK72; ctx.font = '500 15px Inter, sans-serif';
      ctx.fillText(next.name + ' · ' + fmtMoney(next.price - run.money) + ' to go', cx, ry + 6);
    }
    ctx.textAlign = 'center';
    hit.cta = UI.drawCTA(ctx, 'DIVE AGAIN', cx, py + ph - FOOT_H + 16 + 25, C_ACCENT);
    hit.schemeToggle = null; hit.newOcean = null;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  /* The fleet card: one boat at a time, Tailwind's stat-bar language, the
     model big enough to admire. CTA is contextual: DIVE for the boat you
     are in, SELECT for one you own, BUY for one you can afford. */
  function drawFleetCard() {
    const { pw, ph, px, py } = cardBox();
    ctx.fillStyle = SCRIM(0.88); ctx.fillRect(0, 0, LW, LH);
    ctx.fillStyle = C_SURFACE;
    ctx.beginPath(); UI.roundRectPath(ctx, px, py, pw, ph, 22); ctx.fill();
    ctx.strokeStyle = TINT(0.12); ctx.lineWidth = 1;
    ctx.beginPath(); UI.roundRectPath(ctx, px, py, pw, ph, 22); ctx.stroke();
    const f = FLEET[fleetView];
    const cx = px + pw / 2;
    const compact = ph < 400;
    hit.fleetClose = { x: px + pw - 48, y: py + 8, w: 40, h: 40 };
    ctx.strokeStyle = INK72; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + pw - 34, py + 22); ctx.lineTo(px + pw - 22, py + 34);
    ctx.moveTo(px + pw - 22, py + 22); ctx.lineTo(px + pw - 34, py + 34);
    ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#FFFFFF'; ctx.font = '800 26px Inter, sans-serif';
    ctx.fillText(f.name.toUpperCase(), cx, py + 44);
    ctx.font = '600 13px Inter, sans-serif';
    const isCur = fleetView === curSub, isOwned = owned.includes(fleetView);
    if (isCur) { ctx.fillStyle = C_GREEN; ctx.fillText('ABOARD', cx, py + 66); }
    else if (isOwned) { ctx.fillStyle = INK72; ctx.fillText('IN YOUR DOCK', cx, py + 66); }
    else {
      ctx.fillStyle = run.money >= f.price ? C_SUN : C_ACCENT_TEXT;
      ctx.fillText(fmtMoney(f.price), cx, py + 66);
    }
    let yTop = py + 78;
    if (!compact) {
      const im = SUBIMGS[fleetView];
      if (im && im._ok) {
        const maxW = pw - 130, maxH = 96;
        const s = Math.min(maxW / im.width, maxH / im.height);
        const iw = im.width * s, ih = im.height * s;
        if (!isOwned) ctx.globalAlpha = 0.55;   // not yours yet: behind glass
        ctx.drawImage(im, cx - iw / 2, yTop + (maxH - ih) / 2, iw, ih);
        ctx.globalAlpha = 1;
      }
      hit.fleetPrev = { x: px + 6, y: yTop, w: 48, h: 96 };
      hit.fleetNext = { x: px + pw - 54, y: yTop, w: 48, h: 96 };
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = fleetView > 0 ? INK92 : UI.PILL.textDim;
      ctx.beginPath();
      ctx.moveTo(px + 36, yTop + 34); ctx.lineTo(px + 24, yTop + 48); ctx.lineTo(px + 36, yTop + 62);
      ctx.stroke();
      ctx.strokeStyle = fleetView < FLEET.length - 1 ? INK92 : UI.PILL.textDim;
      ctx.beginPath();
      ctx.moveTo(px + pw - 36, yTop + 34); ctx.lineTo(px + pw - 24, yTop + 48); ctx.lineTo(px + pw - 36, yTop + 62);
      ctx.stroke();
      yTop += 104;
      for (let i = 0; i < FLEET.length; i++) {
        const dx = cx + (i - (FLEET.length - 1) / 2) * 16;
        ctx.fillStyle = i === fleetView ? '#FFFFFF' : owned.includes(i) ? C_GREEN : TINT(0.25);
        ctx.beginPath(); ctx.arc(dx, yTop, i === fleetView ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill();
      }
      yTop += 12;
    } else {
      hit.fleetPrev = { x: px + 6, y: py + 20, w: 48, h: 60 };
      hit.fleetNext = { x: px + pw - 54, y: py + 20, w: 48, h: 60 };
      ctx.lineWidth = 2.5; ctx.strokeStyle = INK92;
      ctx.beginPath(); ctx.moveTo(px + 34, py + 36); ctx.lineTo(px + 24, py + 48); ctx.lineTo(px + 34, py + 60); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + pw - 34, py + 36); ctx.lineTo(px + pw - 24, py + 48); ctx.lineTo(px + pw - 34, py + 60); ctx.stroke();
    }
    /* The chart: six stats now, two to a row. DRILL is the new bar, and it
       is the one that opens hard rock at 3 — the fleet ladder is the region
       progression, so it gets the accent the others do not. */
    const entries = [['AIR', f.st.AIR], ['CARGO', f.st.CARGO], ['BATT', f.st.BATT],
                     ['SPEED', f.st.SPEED], ['LAMP', f.st.LAMP], ['DRILL', f.st.DRILL]];
    const colW = (pw - 96 - 14) / 2;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    entries.forEach(([label, v], i) => {
      const bx = px + 48 + (i % 2) * (colW + 14);
      const by = yTop + 12 + Math.floor(i / 2) * 24;
      ctx.font = '700 10px Inter, sans-serif';
      ctx.fillStyle = INK72;
      ctx.fillText(label, bx, by);
      ctx.fillStyle = TINT(0.13);
      ctx.fillRect(bx, by + 4, colW, 5);
      ctx.fillStyle = label === 'DRILL' ? C_SUN : C_BRAND;
      ctx.fillRect(bx, by + 4, Math.max(3, colW * (v / 5)), 5);
    });
    yTop += 12 + 3 * 24;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '500 13px Inter, sans-serif';
    ctx.fillStyle = f.st.DRILL >= TUNE.hardNeedsDrill ? C_SUN : INK72;
    ctx.fillText(f.st.DRILL >= TUNE.hardNeedsDrill ? 'Cuts hard rock' : f.blurb, cx, yTop + 6);
    const label = isCur ? 'DIVE' : isOwned ? 'SELECT'
      : run.money >= f.price ? 'BUY · ' + fmtMoney(f.price)
      : 'NEED ' + fmtMoney(f.price - run.money) + ' MORE';
    hit.cta = UI.drawCTA(ctx, label, cx, py + ph - FOOT_H + 16 + 25, C_ACCENT);
    hit.schemeToggle = null; hit.newOcean = null;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  const wrapCache = new Map();
  function wrapText(text, width) {
    const key = text + '|' + width;
    if (wrapCache.has(key)) return wrapCache.get(key);
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const wd of words) {
      const probe = line ? line + ' ' + wd : wd;
      if (ctx.measureText(probe).width > width && line) { lines.push(line); line = wd; }
      else line = probe;
    }
    if (line) lines.push(line);
    wrapCache.set(key, lines);
    return lines;
  }

  // ---------- RENDER ----------
  function render(now) {
    ctx.clearRect(0, 0, LW, LH);
    // The Portal wash: the one canvas floor, centre 32% width on the top edge.
    const bg = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
    bg.addColorStop(0, C_RAISED); bg.addColorStop(0.6, C_SURFACE); bg.addColorStop(1, C_BG);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);

    drawWorld(now);
    if (MODE === 'mobile') drawChromeMobile(now); else drawChromeDesktop(now);
    drawAirLow(now);

    // Low-air vignette: the warning is ambient before it is terminal.
    if (!card && run.air < 25 && run.y > TUNE.surfaceY) {
      const a = (1 - run.air / 25) * 0.45;
      const vg = ctx.createRadialGradient(LW / 2, LH / 2, LH * 0.3, LW / 2, LH / 2, LH * 0.75);
      vg.addColorStop(0, 'rgba(10,4,4,0)'); vg.addColorStop(1, 'rgba(30,4,4,' + a.toFixed(2) + ')');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, LW, LH);
    }

    hit.cta = null;
    if (card === 'rules') drawRulesCard(now);
    else if (card === 'fleet') drawFleetCard();
    else if (card === 'banked' && cardData) {
      drawEndCard('HAUL BANKED', fmtMoney(cardData.val) + ' banked · ' + cardData.kg + ' kg',
        [['Deepest point', cardData.depth + ' m'],
         ['Tiles cut', String(run.digTiles)],
         ['Bank total', fmtMoney(run.money)]]);
    } else if (card === 'blackout' && cardData) {
      drawEndCard('BLACKOUT', 'The tank ran dry at ' + cardData.depth + ' m',
        [['Haul lost', fmtMoney(cardData.lostVal) + ' · ' + cardData.lostKg + ' kg'],
         ['Banked money', fmtMoney(run.money) + ' · safe'],
         ['Your mine', 'still there']]);
    } else if (card === 'breach' && cardData) {
      drawEndCard('HULL BREACH', 'The pressure found a way in at ' + cardData.depth + ' m',
        [['Haul lost', fmtMoney(cardData.lostVal) + ' · ' + cardData.lostKg + ' kg'],
         ['Banked money', fmtMoney(run.money) + ' · safe'],
         ['Your mine', 'still there']]);
    }
  }

  // ---------- DETECTORS ----------
  /* A card is not fixed until something can measure it. */
  function rulesFit() {
    const { pw, ph, px, py } = cardBox();
    const bodyH = ph - HEAD_H - FOOT_H;
    const contentH = rulesContentH || 0;
    return {
      fits: (HEAD_H + bodyH + FOOT_H === ph) && py >= 10 && px >= 0 && bodyH > 40,
      cardH: ph, cardW: pw, frameH: LH, frameW: LW,
      viewportH: bodyH, contentH,
      scrollMax: Math.max(0, contentH - bodyH),
      demoH: lastDemoH,
      demoWhole: lastDemoH <= bodyH,
      // Lines of rule 1 above the fold. Zero means the card looks empty of rules.
      firstRuleLines: Math.floor(Math.max(0, bodyH - lastDemoH - 16) / 22),
      overlapPx: Math.max(0, HEAD_H + FOOT_H + 40 - ph),
    };
  }
  function fit() {
    return {
      mode: MODE, LW, LH, ppm: L.ppm,
      ocean: L.ocean,
      viewWm: L.viewWm, viewHm: L.viewHm,
      tilesAcross: L.viewWm / TILE,
      rowRight: L.rowRight || 0,
      rowReadoutRoom: MODE === 'desktop' ? (LW - SIDE_PAD - ((L.rowRight || 0) + 16)) : null,
      readoutFits: L.roFits !== false,
    };
  }

  // ---------- HARNESS ----------
  if (qs.get('harness') === '1') {
    window.FATHOM = {
      get run() { return run; },
      TUNE, T: TT, seed, SIM,
      state: () => ({ x: run.x, y: run.y, vx: run.vx, vy: run.vy, net: run.net(),
                      ballast: run.ballast, cargoKg: run.cargoKg, air: run.air,
                      batt: run.batt, hull: run.hull, money: run.money, mode: run.mode,
                      onFloor: run.onFloor, onCeil: run.onCeil,
                      digTarget: run.digTarget, digFrac: run.digFrac,
                      digTiles: run.digTiles, tooHeavy: run.tooHeavyNeed(),
                      region: run.regionAt(run.y), card }),
      step: (frames, inp) => { for (let i = 0; i < frames; i++) run.step(inp || {}, 1 / 60); },
      teleport: (x, y) => { run.x = x; run.y = y; run.vx = 0; run.vy = 0; },
      setCargo: (kg) => { run.cargo = [{ type: 'nodule', kg, val: 0 }]; run.cargoKg = kg; },
      newRun: (s) => { run = new SIM.Run(s >>> 0); applyFleet(); },
      tileAt: (c, r) => run.world.at(c, r),
      openCard: (c) => { card = c; },
      closeCard: () => { card = null; },
      setScheme: (s) => { scheme = s; },
      setScroll: (v) => { rulesScroll = v; },
      get cam() { return cam; },
      fleet: { FLEET, get owned() { return owned; }, get cur() { return curSub; },
               setSub: (i) => { curSub = i; if (!owned.includes(i)) owned.push(i); applyFleet(); },
               setMoney: (m) => { run.money = m; } },
      rulesFit, fit,
      render: () => render(performance.now()),
      /* The preview pane reports visibilityState 'hidden' and never services
         requestAnimationFrame, so the harness drives frames itself: sim,
         camera and particles at 60 Hz, then one render. */
      drive: (seconds, inp) => {
        const n = Math.round(seconds * 60);
        for (let i = 0; i < n; i++) {
          const base = inp || {};
          const events = run.step({
            ax: Math.max(-1, Math.min(1, (base.ax || 0) + joyVec)),
            down: !!(base.down || joyVert > 0),
            up: !!(base.up || joyVert < 0),
            jettison: !!(base.jettison || wantJettison),
          }, 1 / 60);
          wantJettison = false;
          for (const ev of events) handleEvent(ev);
          updateCam(1 / 60);
          stepParticles(1 / 60);
        }
        render(performance.now());
      },
    };
  }

  // ---------- BOOT ----------
  setCanvasVars();
  resizeCanvas();
  fitFullscreen();
  resizeCanvas();
  layout();
  cam.x = run.x - (L.viewWm || 100) / 2;
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', () => render(performance.now()));
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  requestAnimationFrame(tick);
})();
