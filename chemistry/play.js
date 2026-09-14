/* ============================================================
   Lessons in Chemistry · A Zamborin Game

   The owner's sketch, 2026-09-14. The dish is open space: free radicals
   drift in it slowly, turning as they go, and every free hand is charged.
   Bring two free hands within reach and they grab each other. The player
   drags atoms in from the Available panel, or moves anything already in the
   dish, and has to steer what they carry past everything it must not meet.

   model.js decides what a bond makes. This file moves the atoms, finds the
   hands that meet, and draws it all.

   Two rules keep it fair, both the owner's:
     nothing reacts on its own: charged radicals keep their distance from
       each other, and only what the player carries can grab;
     what the player carries grabs anything its hands pass near, all along
       the drag, not only where it is let go.
   ============================================================ */
(() => {
  'use strict';

  const M = window.ChemModel, LV = window.ChemLevels;
  const TAU = Math.PI * 2;
  const params = new URLSearchParams(location.search);

  /* ---------- MODE ----------
     A browser can report a 0-wide viewport on the first frame; zero means "not
     measured yet". A narrow frame lying on its side with a mouse is an embed,
     not a phone. ?mode=desktop / ?mode=mobile forces a layout. */
  const FORCED = /^(desktop|mobile)$/.test(params.get('mode') || '') ? params.get('mode') : null;
  const PORTRAITISH = window.innerHeight >= window.innerWidth;
  const MODE = FORCED || ((matchMedia('(pointer: coarse)').matches ||
                (window.innerWidth > 0 && window.innerWidth < 768 && PORTRAITISH)) ? 'mobile' : 'desktop');
  document.body.classList.add('mode-' + MODE);

  /* ---------- CANVAS ---------- */
  let LW, LH, backing = 1;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const gameWrap = canvas.parentElement;

  function setCanvasVars() {
    if (MODE === 'mobile') { LW = window.innerWidth; LH = window.innerHeight; }
    else { LW = 760; LH = 600; }
    document.body.style.setProperty('--canvas-w', LW + 'px');
    document.body.style.setProperty('--canvas-h', LH + 'px');
  }
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const dW = rect.width || LW, dH = rect.height || LH;
    const bW = Math.round(dW * dpr), bH = Math.round(dH * dpr);
    if (canvas.width !== bW) canvas.width = bW;
    if (canvas.height !== bH) canvas.height = bH;
    backing = Math.min(bW / LW, bH / LH);
    ctx.setTransform(backing, 0, 0, backing, 0, 0);
  }
  function fitFullscreen() {
    if (MODE === 'mobile') {
      gameWrap.style.width = window.innerWidth + 'px';
      gameWrap.style.height = window.innerHeight + 'px';
      return;
    }
    const active = document.body.classList.contains('focus-mode');
    if (!active) { gameWrap.style.width = ''; gameWrap.style.height = ''; return; }
    const vw = window.innerWidth, vh = window.innerHeight, aspect = LW / LH;
    let cw = vw, ch = Math.round(vw / aspect);
    if (ch > vh) { ch = vh; cw = Math.round(vh * aspect); }
    gameWrap.style.width = cw + 'px'; gameWrap.style.height = ch + 'px';
  }
  function onResize() {
    if (MODE === 'mobile') setCanvasVars();
    fitFullscreen(); resizeCanvas(); layout(); render(clock());
  }

  /* ---------- AUDIO ----------
     A lab at night: quiet and precise. Nothing here may carry information the
     picture does not. */
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zam.chemistry.sfx', gain: 3 }) : null;
  const PITCH = { H: 1175, O: 988, N: 784, C: 587, F: 1047, Cl: 880, Na: 698, Mg: 659, Ca: 523, Al: 622, Fe: 440 };
  const SND = {
    on:     () => !!(sfx && sfx.isOn()),
    ready:  () => { if (sfx) sfx.ensureAudio(); },
    toggle: () => { if (sfx) { sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.play('click'); } },
    pick:   () => { if (sfx) sfx.play('tick'); },
    set:    () => { if (sfx) sfx.play('drop'); },
    clasp:  (el, n) => {
      if (!sfx) return;
      for (let i = 0; i < Math.min(3, n); i++) {
        setTimeout(() => { sfx.woodClack(PITCH[el] * 0.5, 0.06, 0.12); sfx.tone(PITCH[el], 0.09, 0.03, 'triangle'); }, i * 55);
      }
    },
    waste:  () => { if (sfx) sfx.play('thump'); },
    lift:   () => { if (sfx) sfx.play('success'); },
    lost:   () => { if (sfx) sfx.tone(196, 0.16, 0.05, 'sine'); },
    win:    () => { if (sfx) sfx.play('win'); },
    fail:   () => { if (sfx) sfx.play('fail'); },
  };

  const UI = window.ZAM_UI;
  const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){}, levelRestart(){}, hintUsed(){} };
  const T = () => (window.ZAM_TRACK || NOOP);
  T().init('chemistry');

  /* ---------- COLOUR ----------
     Chrome takes tokens only; canvas cannot read CSS variables, so they are
     restated here with their names. The atoms, hands, knots, palms and the
     dish are game art, and none of that palette touches chrome. */
  const TOK = {
    bg: '#0E1726', card: '#131F36', panel: '#1A2A45',          // --bg, --bg-card, --bg-panel
    accent: '#C24A39', sun: '#FFD23F', green: '#5DD39E',       // --accent, --accent-2, --green
    ink72: 'rgba(255,255,255,0.72)', ink82: 'rgba(255,255,255,0.82)',
    ink90: 'rgba(255,255,255,0.90)', ink92: 'rgba(255,255,255,0.92)', white: '#FFFFFF',
    tint03: 'rgba(255,255,255,0.03)', tint10: 'rgba(255,255,255,0.10)',
    tint12: 'rgba(255,255,255,0.12)', tint30: 'rgba(255,255,255,0.30)',
    scrim: 'rgba(10,16,28,0.82)',
  };
  /* Each element: the lit and shaded ends of the marble, the colour of its
     arms, and the ink its symbol is written in. The symbol is what tells two
     similar marbles apart, so colour never has to. */
  const ART = {
    H:  { hi: '#F2F5FA', lo: '#98A4B8', arm: '#D9E0EA', ink: '#1E2A3C' },
    O:  { hi: '#F47A66', lo: '#8A2A1E', arm: '#F5A896', ink: '#FFFFFF' },
    N:  { hi: '#7A9EF2', lo: '#22408F', arm: '#A9C0F6', ink: '#FFFFFF' },
    C:  { hi: '#838C9D', lo: '#343B48', arm: '#9FA8B8', ink: '#FFFFFF' },
    F:  { hi: '#C6F1F2', lo: '#3C8F95', arm: '#D3F4F4', ink: '#10363A' },
    Cl: { hi: '#C9EE8F', lo: '#4E8A24', arm: '#D5F2AE', ink: '#17330B' },
    Na: { hi: '#C7A6F6', lo: '#57339C', arm: '#DACAF8', ink: '#FFFFFF' },
    Mg: { hi: '#F2D27C', lo: '#8C6A1C', arm: '#F5DFA3', ink: '#3A2A06' },
    Ca: { hi: '#F4E6C6', lo: '#A3875A', arm: '#F6ECD6', ink: '#3A2C12' },
    Al: { hi: '#C3C8DD', lo: '#555C7A', arm: '#D2D6E6', ink: '#1E2233' },
    Fe: { hi: '#E7AB7B', lo: '#7A4524', arm: '#F0C8A6', ink: '#FFFFFF' },
    knot: '#FFF6DC',
    palmGreen: '#5DD39E', palmAmber: '#F0B23C', palmOpen: '#FFFFFF',
    glassTop: '#0C1424', glassBot: '#0A1120',
    veil: 'rgba(14,23,38,0.55)', wasteKnot: '#7A8290', wasteArm: '#5A6272',
  };

  /* ---------- TUNING ----------
     Distances are in atom radii, so the dish plays the same at any size. */
  const TUNE = {
    bond: 2.8,        // between two bonded centres
    hand: 1.55,       // a free hand's reach from its atom's centre
    capture: 3.3,     // centres this close and two free hands grab
    warn: 5.4,        // centres this close and the hands start reaching
    keep: 6.2,        // charged radicals drift no closer to each other than this
    collide: 2.3, spread: 1.62, wall: 1.8,
    /* Thermal motion: a hydrogen wanders at about this many radii a second,
       heavier atoms slower by mass^-0.3, and turns about this many radians a
       second. Slow on purpose: the owner wants motion you notice without it
       getting in the way of thinking. */
    drift: 0.42, spin: 0.5, driftTau: 3,
    touchLift: 2.3,   // radii a panel atom rides above a finger
    grabPx: 24,       // never a smaller hit radius than this
    worldW: { desktop: 28, mobile: 19 }, maxScale: 22,
    liftMs: 900, dimMs: 300, chipMs: 2000, flashMs: 380, cardWinMs: 1300, cardFailMs: 1500,
  };
  const STEP = 1 / 60;
  const DRIFT = params.get('drift') !== '0';
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => REDUCED.matches || params.get('motion') === 'reduce';

  /* A clock a test can stop, so any moment can be drawn on purpose. While it
     is frozen the dish only moves when a test advances it. */
  let frozen = null;
  const clock = () => (frozen !== null ? frozen : performance.now());

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, k) {
    const A = hexRgb(a), B = hexRgb(b);
    return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',') + ')';
  }
  function rr(x, y, w, h, r) { UI.roundRectPath(ctx, x, y, w, h, r); }
  function mulberry(a) {
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rng = Math.random;
  function gauss() { const u = 1 - rng(), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }
  function lerpAng(a, b, k) { return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k; }

  /* ---------- LEVELS AND SAVE ---------- */
  const LEVELS = LV[MODE];
  const SAVE_KEY = 'zam.chemistry.save';
  function readSave() {
    try { const v = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return v && typeof v === 'object' ? v : {}; }
    catch (_) { return {}; }
  }
  function writeSave() {
    try { const v = readSave(); v[MODE] = li; localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch (_) {}
  }

  let li = 0, level = null, st = null;
  const P = new Map();      // atom id -> { x, y, th, vx, vy, w }, in radii from the dish's top left
  let drag = null;          // { id, pid, touch, fromPanel, ox, oy, tx, ty, cx, cy }
  let press = null, pointer = null, card = null;
  let lifts = [], wasteFx = [], flashes = [];
  const claspAt = new Map(), palmSeen = new Map(), previews = new Map();
  let stepAcc = 0, lastFrame = 0, lastEvent = null, reactions = 0;

  function loadLevel(i) {
    li = ((i % LEVELS.length) + LEVELS.length) % LEVELS.length;
    level = LEVELS[li];
    st = M.createState(level);
    drag = null; press = null; card = null;
    lifts = []; wasteFx = []; flashes = [];
    claspAt.clear(); palmSeen.clear(); previews.clear(); P.clear();
    lastEvent = null; reactions = 0;
    const seed = parseInt(params.get('seed'), 10);
    rng = Number.isInteger(seed) ? mulberry(seed * 977 + li) : Math.random;
    layout();
    const pts = scatter(st.atoms.length, level.seed);
    const turn = mulberry(level.seed * 31 + 7);
    st.atoms.forEach((a, k) => P.set(a.id, { x: pts[k].x, y: pts[k].y, th: turn() * TAU, vx: 0, vy: 0, w: 0 }));
    notePalms(-1e9);
    writeSave();
    T().levelStart && T().levelStart(li + 1);
  }
  function restart() {
    T().levelRestart && T().levelRestart(li + 1);
    loadLevel(li);
  }
  // The level's radicals, spread out so no two start within reach of each other.
  function scatter(n, seed) {
    const r = mulberry(seed * 7919 + 13);
    const m = TUNE.wall + 0.8, pts = [];
    let minD = TUNE.keep * 1.1;
    for (let k = 0; k < n; k++) {
      let got = null;
      for (let tries = 0; !got && tries < 1500; tries++) {
        if (tries && tries % 300 === 0) minD *= 0.88;
        const x = m + r() * Math.max(0.1, G.WW - 2 * m), y = m + r() * Math.max(0.1, G.WH - 2 * m);
        if (pts.every((q) => Math.hypot(q.x - x, q.y - y) >= minD)) got = { x, y };
      }
      pts.push(got || { x: G.WW / 2, y: G.WH / 2 });
    }
    return pts;
  }

  /* ---------- LAYOUT ----------
     Desktop 760x600, from the sketch: controls left and the read-out right in
     the top band, the targets under it, the dish on the left and the
     Available panel as a column on the right.
     Mobile, measured: the targets at the top, the dish, the Available panel
     as a strip, and the controls at thumb height. */
  const SIDE_PAD = 30;
  const topBand = () => (MODE === 'mobile' ? 64 : 56);
  const botBand = () => (MODE === 'mobile' ? 96 : 20);
  const G = { x: 0, y: 0, w: 0, h: 0, S: 18, WW: 28, WH: 23 };   // dish in px; S px per radius; world in radii
  let flaskArea = { x: 0, y: 0, w: 0, h: 0 }, panel = { x: 0, y: 0, w: 0, h: 0 };
  let slots = [], ctrl = [], readoutMinX = SIDE_PAD, ctaBox = null;

  function layout() {
    if (!level || !LW) return;
    layoutControls();
    const oldW = G.WW, oldH = G.WH;
    if (MODE === 'mobile') layoutMobile(); else layoutDesktop();
    // A resize reshapes the world: carry every atom to the same place in it.
    if (P.size && (Math.abs(oldW - G.WW) > 1e-6 || Math.abs(oldH - G.WH) > 1e-6)) {
      for (const p of P.values()) { p.x *= G.WW / oldW; p.y *= G.WH / oldH; }
    }
    layoutSlots();
  }
  function layoutDesktop() {
    const top = topBand();
    flaskArea = { x: SIDE_PAD, y: top + 2, w: LW - SIDE_PAD * 2, h: 74 };
    const colW = 150, gap = 18;
    const y0 = flaskArea.y + flaskArea.h + 8, y1 = LH - botBand();
    G.x = SIDE_PAD; G.y = y0; G.w = LW - SIDE_PAD * 2 - colW - gap; G.h = y1 - y0;
    panel = { x: G.x + G.w + gap, y: G.y, w: colW, h: G.h };
    G.S = Math.min(TUNE.maxScale, G.w / TUNE.worldW.desktop);
    G.WW = G.w / G.S; G.WH = G.h / G.S;
  }
  function layoutMobile() {
    const top = topBand(), bot = botBand(), short = LH < 700;
    const flaskH = short ? 66 : 80, panelH = short ? 78 : 90, gap = short ? 8 : 12;
    flaskArea = { x: 16, y: top - 4, w: LW - 32, h: flaskH };
    G.x = 14; G.w = LW - 28; G.y = top + flaskH + gap;
    panel = { x: 14, w: LW - 28, h: panelH, y: LH - bot - panelH - 4 };
    G.h = Math.max(120, panel.y - gap - G.y);
    G.S = Math.min(TUNE.maxScale, G.w / TUNE.worldW.mobile);
    G.WW = G.w / G.S; G.WH = G.h / G.S;
  }
  function layoutSlots() {
    const els = Object.keys(level.avail);
    slots = [];
    if (MODE === 'mobile') {
      const w = panel.w / Math.max(1, els.length);
      els.forEach((el, i) => slots.push({ el, x: panel.x + i * w, y: panel.y, w, h: panel.h }));
    } else {
      const top = panel.y + 30, h = 76;
      els.forEach((el, i) => slots.push({ el, x: panel.x, y: top + i * h, w: panel.w, h: h - 6 }));
    }
  }
  /* Order is fixed: sound, Undo, Restart, Hint, Rules. No Undo (bonds are for
     good), no Hint yet, no Rules card yet; nothing moves to fill their places. */
  function layoutControls() {
    const items = [{ id: 'sound', icon: true }, { id: 'restart', label: 'Restart' }];
    ctx.save();
    let total = 0;
    items.forEach((it) => { it.w = it.icon ? UI.PILL.iconW : UI.pillWidth(ctx, it.label); total += it.w; });
    ctx.restore();
    total += UI.PILL.gap * (items.length - 1);
    const cy = MODE === 'mobile' ? LH - 74 : topBand() / 2;
    let x = MODE === 'mobile' ? Math.round((LW - total) / 2) : SIDE_PAD;
    ctrl = items.map((it) => {
      const b = { id: it.id, label: it.label, icon: it.icon, x, y: Math.round(cy - UI.PILL.h / 2),
                  w: it.w, h: UI.PILL.h, cx: x + it.w / 2, cy };
      x += it.w + UI.PILL.gap;
      return b;
    });
    readoutMinX = MODE === 'desktop' ? x + 16 : SIDE_PAD;
  }

  const toPx = (p) => ({ x: G.x + p.x * G.S, y: G.y + p.y * G.S });
  const toWorld = (p) => ({ x: (p.x - G.x) / G.S, y: (p.y - G.y) / G.S });
  const insideAt = (x, y) => x > 0.4 && y > 0.4 && x < G.WW - 0.4 && y < G.WH - 0.4;
  const inDish = (a) => !!a && (a.status === 'live' || a.status === 'waste') && P.has(a.id);

  /* ---------- THE DISH IN MOTION ----------
     Position-based: every atom wanders on its own slow random walk, then
     constraints put the world right. Bonds hold their length, a molecule
     spreads its arms, atoms do not overlap, charged radicals keep their
     distance, and the walls hold everything in. */
  function heldAtom() { return drag ? st.atoms[drag.id] : null; }
  function heldIsLoose() {       // a panel atom still over the panel, outside the dish
    const a = heldAtom();
    return !!a && !a.committed && !insideAt(drag.cx, drag.cy);
  }

  function simStep(dt) {
    const atoms = [];
    for (const a of st.atoms) {
      if (!inDish(a)) continue;
      if (drag && a.id === drag.id && heldIsLoose()) continue;
      atoms.push(a);
    }
    const mol = new Map();
    for (const a of atoms) {
      if (mol.has(a.id)) continue;
      const g = M.groupOf(st, a.id);
      g.forEach((i) => mol.set(i, g[0]));
    }
    const heldMol = drag ? (mol.has(drag.id) ? mol.get(drag.id) : -2) : -1;
    const moving = DRIFT && !reduced() && dt > 0;
    for (const a of atoms) {
      if (!moving) break;
      const p = P.get(a.id);
      const m = M.ELEMENTS[a.el].mass, calm = a.status === 'waste' ? 0.45 : 1;
      const vm = TUNE.drift * calm / Math.pow(m, 0.3), wm = TUNE.spin * calm / Math.pow(m, 0.3);
      const k = Math.sqrt(2 * dt / TUNE.driftTau);
      p.vx += -p.vx * dt / TUNE.driftTau + gauss() * vm * k;
      p.vy += -p.vy * dt / TUNE.driftTau + gauss() * vm * k;
      p.w += -p.w * dt / TUNE.driftTau + gauss() * wm * k;
      p.th += p.w * dt;
      if (mol.get(a.id) !== heldMol) { p.x += p.vx * dt; p.y += p.vy * dt; }
    }
    if (drag && P.has(drag.id)) { const p = P.get(drag.id); p.x = drag.cx; p.y = drag.cy; }
    for (let it = 0; it < 4; it++) relax(atoms, mol, heldMol);
  }

  function relax(atoms, mol, heldMol) {
    const held = drag ? drag.id : -1;
    const wOf = (a) => (a.id === held ? 0 : 1 / Math.sqrt(M.ELEMENTS[a.el].mass));
    const shove = (a, b, pa, pb, dx, dy, d, min, stiff) => {
      const wa = wOf(a), wb = wOf(b);
      if (wa + wb === 0) return;
      const c = (min - d) * stiff / (wa + wb), ux = dx / d, uy = dy / d;
      pa.x -= ux * c * wa; pa.y -= uy * c * wa;
      pb.x += ux * c * wb; pb.y += uy * c * wb;
    };
    for (const a of atoms) {
      for (const b of a.bonds) {
        if (b.to < a.id || !P.has(b.to)) continue;
        const B = st.atoms[b.to], pa = P.get(a.id), pb = P.get(B.id);
        const dx = pb.x - pa.x, dy = pb.y - pa.y, d = Math.hypot(dx, dy) || 1e-6;
        const wa = wOf(a), wb = wOf(B);
        if (wa + wb === 0) continue;
        const c = (d - TUNE.bond) * 0.6 / (wa + wb);
        pa.x += dx / d * c * wa; pa.y += dy / d * c * wa;
        pb.x -= dx / d * c * wb; pb.y -= dy / d * c * wb;
      }
    }
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i], pa = P.get(a.id);
      for (let j = i + 1; j < atoms.length; j++) {
        const b = atoms[j];
        if (a.bonds.some((q) => q.to === b.id)) continue;
        const pb = P.get(b.id);
        let dx = pb.x - pa.x, dy = pb.y - pa.y, d = Math.hypot(dx, dy);
        if (d < 1e-4) { dx = 0.01; dy = 0.005; d = Math.hypot(dx, dy); }
        const same = mol.get(a.id) === mol.get(b.id);
        if (same) {
          const min = TUNE.bond * TUNE.spread;
          if (d < min) shove(a, b, pa, pb, dx, dy, d, min, 0.2);
          continue;
        }
        if (d < TUNE.collide) shove(a, b, pa, pb, dx, dy, d, TUNE.collide, 0.5);
        if (d < TUNE.keep && a.status === 'live' && b.status === 'live' && a.free > 0 && b.free > 0 &&
            mol.get(a.id) !== heldMol && mol.get(b.id) !== heldMol) {
          shove(a, b, pa, pb, dx, dy, d, TUNE.keep, 0.025);
        }
      }
    }
    for (const a of atoms) {
      const p = P.get(a.id), m = TUNE.wall;
      if (p.x < m) p.x = m; else if (p.x > G.WW - m) p.x = G.WW - m;
      if (p.y < m) p.y = m; else if (p.y > G.WH - m) p.y = G.WH - m;
    }
  }

  /* Move the held atom toward where the pointer wants it in steps of under
     half a radius, and look for grabs at every step, so a fast drag cannot
     jump past a radical it went straight through. */
  function stepWorld(dt) {
    if (!drag) { simStep(dt); return; }
    const p = P.get(drag.id);
    const sx = p.x, sy = p.y, tx = drag.tx, ty = drag.ty;
    const n = Math.max(1, Math.ceil(Math.hypot(tx - sx, ty - sy) / 0.45));
    for (let i = 1; i <= n; i++) {
      drag.cx = sx + (tx - sx) * i / n;
      drag.cy = sy + (ty - sy) * i / n;
      simStep(i === n ? dt : 0);
      react();
      if (!drag) return;
    }
  }

  /* ---------- HANDS THAT MEET ---------- */
  function findCapture() {
    if (!drag || heldIsLoose()) return null;
    const heldIds = M.groupOf(st, drag.id), held = new Set(heldIds);
    let best = null;
    for (const ai of heldIds) {
      const a = st.atoms[ai];
      if (a.status !== 'live' || a.free === 0 || !P.has(ai)) continue;
      const pa = P.get(ai);
      for (const b of st.atoms) {
        if (b.status !== 'live' || b.free === 0 || held.has(b.id) || !P.has(b.id)) continue;
        const pb = P.get(b.id), d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        if (d < TUNE.capture && (!best || d < best.d)) best = { a: ai, b: b.id, d };
      }
    }
    return best;
  }
  function react() {
    for (let guard = 0; guard < 8 && drag; guard++) {
      const c = findCapture();
      if (!c) return;
      bondAtoms(c.a, c.b);
    }
  }
  function bondAtoms(a, b) {
    const pa = P.get(a), pb = P.get(b);
    if (!pa || !pb) return null;
    const now = clock();
    const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    const ev = M.bond(st, a, b);
    if (!ev) return null;
    reactions++;
    lastEvent = ev;
    previews.clear();
    flashes.push({ x: mid.x, y: mid.y, t0: now });
    claspAt.set(Math.min(a, b) + '-' + Math.max(a, b), now);
    SND.clasp(st.atoms[b].el, ev.order);
    if (ev.done && ev.done.kind === 'required') {
      if (drag && ev.done.ids.includes(drag.id)) drag = null;
      startLift(ev.done.key, ev.done.ids, now);
      setTimeout(SND.lift, 120);
    } else if (ev.done) {
      wasteFx.push({ ids: ev.done.ids, t0: now, lost: ev.lost });
      setTimeout(SND.waste, 60);
    } else if (ev.lost) {
      wasteFx.push({ ids: M.groupOf(st, a), t0: now, lost: true, chipOnly: true });
    }
    notePalms(now);
    if (ev.lost) setTimeout(SND.lost, 90);
    if (st.result) endLevel(now);
    return ev;
  }
  function endLevel(now) {
    if (drag) finishDrag();
    const r = st.result;
    card = { kind: r.kind, made: r.made, total: r.total, sounded: false,
             showAt: now + (r.kind === 'win' ? TUNE.cardWinMs : TUNE.cardFailMs) };
    if (r.kind === 'win') T().levelComplete && T().levelComplete(li + 1, reactions);
  }
  function previewOf(a, b) {
    const key = a + ':' + b + ':' + st.version;
    if (!previews.has(key)) {
      if (previews.size > 300) previews.clear();
      previews.set(key, M.preview(st, a, b));
    }
    return previews.get(key);
  }
  // Every pair of free hands, one carried and one in the dish, close enough to reach.
  function threatPairs() {
    if (!drag || card || heldIsLoose()) return [];
    const heldIds = M.groupOf(st, drag.id), held = new Set(heldIds), out = [];
    for (const ai of heldIds) {
      const a = st.atoms[ai];
      if (a.status !== 'live' || !a.free || !P.has(ai)) continue;
      const pa = P.get(ai);
      for (const b of st.atoms) {
        if (b.status !== 'live' || !b.free || held.has(b.id) || !P.has(b.id)) continue;
        const pb = P.get(b.id), d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        if (d >= TUNE.warn) continue;
        const pv = previewOf(ai, b.id);
        out.push({ a: ai, b: b.id, d, k: clamp01((TUNE.warn - d) / (TUNE.warn - TUNE.capture)),
                   bad: !pv || pv.lost, pv });
      }
    }
    return out.sort((x, y) => x.d - y.d);
  }

  /* ---------- DRAG ---------- */
  function atomAt(p) {
    let best = null;
    const r = Math.max(TUNE.grabPx, G.S * 1.5);
    for (const a of st.atoms) {
      if (!inDish(a)) continue;
      const c = toPx(P.get(a.id)), d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d <= r && (!best || d < best.d)) best = { id: a.id, d };
    }
    return best ? best.id : null;
  }
  function startDrag(id, p, touch, pid, fromPanel) {
    const w = toWorld(p), q = P.get(id);
    drag = { id, pid, touch, fromPanel,
             ox: fromPanel ? 0 : q.x - w.x, oy: fromPanel ? (touch ? -TUNE.touchLift : 0) : q.y - w.y,
             tx: q.x, ty: q.y, cx: q.x, cy: q.y };
    if (pid != null && pid >= 0) { try { canvas.setPointerCapture(pid); } catch (_) { /* not every browser lets a canvas capture */ } }
    setTargetWorld(w.x + drag.ox, w.y + drag.oy);
  }
  function setTargetWorld(x, y) {
    const a = heldAtom();
    if (!a) return;
    if (a.committed || insideAt(x, y)) {
      x = Math.max(TUNE.wall, Math.min(G.WW - TUNE.wall, x));
      y = Math.max(TUNE.wall, Math.min(G.WH - TUNE.wall, y));
    }
    drag.tx = x; drag.ty = y;
  }
  function setTarget(p) { const w = toWorld(p); setTargetWorld(w.x + drag.ox, w.y + drag.oy); }
  /* Let go. A panel atom that never touched anything goes back to the panel if
     it is let go outside the dish, and into the dish if inside. */
  function finishDrag() {
    if (!drag) return;
    const a = heldAtom();
    if (a && a.status === 'live' && !a.committed) {
      if (!insideAt(drag.cx, drag.cy)) { M.putBack(st, a.id); P.delete(a.id); }
      else { M.commit(st, a.id); SND.set(); }
    }
    drag = null;
    previews.clear();
    notePalms(clock());
  }

  /* ---------- DRAWING ---------- */
  function drawWash() {
    const bg = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
    bg.addColorStop(0, TOK.panel); bg.addColorStop(0.6, TOK.card); bg.addColorStop(1, TOK.bg);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);
  }
  // The dish: dark glass in a vessel whose rim catches the light along its top.
  function drawDish() {
    const r = 24;
    ctx.save();
    const rim = ctx.createLinearGradient(0, G.y, 0, G.y + G.h);
    rim.addColorStop(0, 'rgba(255,255,255,0.09)'); rim.addColorStop(0.18, 'rgba(255,255,255,0.05)');
    rim.addColorStop(1, 'rgba(255,255,255,0.04)');
    ctx.fillStyle = rim; rr(G.x, G.y, G.w, G.h, r); ctx.fill();
    const ix = G.x + 7, iy = G.y + 7, iw = G.w - 14, ih = G.h - 14;
    const glass = ctx.createLinearGradient(0, iy, 0, iy + ih);
    glass.addColorStop(0, ART.glassTop); glass.addColorStop(1, ART.glassBot);
    ctx.fillStyle = glass; rr(ix, iy, iw, ih, r - 7); ctx.fill();
    const lit = ctx.createLinearGradient(0, iy, 0, iy + 22);
    lit.addColorStop(0, 'rgba(255,255,255,0.06)'); lit.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lit; rr(ix, iy, iw, ih, r - 7); ctx.fill();
    ctx.restore();
  }

  /* The marble, lit from the upper left, a broad specular and a darker base on
     a soft shadow. No outline: the edge is value. Rendered once per element
     and size into a sprite. */
  const sprites = new Map();
  function bodySprite(el, R) {
    const s = Math.max(1, Math.min(4, backing));
    const key = el + ':' + R.toFixed(2) + ':' + s.toFixed(2);
    let spr = sprites.get(key);
    if (spr) return spr;
    const pad = Math.ceil(R * 0.95), half = R + pad;
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(half * 2 * s);
    const g = c.getContext('2d');
    g.scale(s, s);
    const a = ART[el];
    const shx = half + R * 0.12, shy = half + R * 0.62;
    const sh = g.createRadialGradient(shx, shy, 0, shx, shy, R * 1.15);
    sh.addColorStop(0, 'rgba(0,0,0,0.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.beginPath(); g.ellipse(shx, shy, R * 1.15, R * 0.6, 0, 0, TAU); g.fill();
    const body = g.createRadialGradient(half - R * 0.38, half - R * 0.42, R * 0.06, half - R * 0.1, half - R * 0.1, R * 1.18);
    body.addColorStop(0, a.hi); body.addColorStop(1, a.lo);
    g.fillStyle = body; g.beginPath(); g.arc(half, half, R, 0, TAU); g.fill();
    const spx = half - R * 0.36, spy = half - R * 0.44;
    const sp = g.createRadialGradient(spx, spy, 0, spx, spy, R * 0.44);
    sp.addColorStop(0, 'rgba(255,255,255,0.55)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sp; g.beginPath(); g.arc(spx, spy, R * 0.44, 0, TAU); g.fill();
    spr = { c, half };
    if (sprites.size > 200) sprites.clear();
    sprites.set(key, spr);
    return spr;
  }
  /* A glow is a thin bright core with a tight feather, never a flat disc. */
  function feather(x, y, r0, r1, rgb, a) {
    if (a <= 0) return;
    const g = ctx.createRadialGradient(x, y, r0 * 0.6, x, y, r1);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.globalAlpha = 1; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r1, 0, TAU); ctx.fill();
  }
  /* THE PALM. Green and open while the piece is still wanted by something on
     the list; amber with a bar across it when it is no use to anything. The
     bar is the channel that does not depend on seeing colour. White on an
     atom not yet in the dish. */
  function drawPalm(x, y, r, state, k, al) {
    if (state === 'open') {
      ctx.globalAlpha = al; ctx.fillStyle = ART.palmOpen;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      return;
    }
    const amber = state === 'amber' ? (k == null ? 1 : k) : 0;
    if (amber < 1) feather(x, y, r, r * 2.4, '93,211,158', 0.45 * al * (1 - amber));
    ctx.globalAlpha = al;
    ctx.fillStyle = amber ? mix(ART.palmGreen, ART.palmAmber, amber) : ART.palmGreen;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (amber > 0) {
      ctx.globalAlpha = al * amber;
      ctx.strokeStyle = ART.glassBot; ctx.lineWidth = Math.max(1.4, r * 0.48); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - r * 0.6, y + r * 0.6); ctx.lineTo(x + r * 0.6, y - r * 0.6); ctx.stroke();
    }
  }
  const offsets = (order, off) => (order === 1 ? [0] : order === 2 ? [-off, off] : [-off * 1.25, 0, off * 1.25]);

  /* Draw a set of atoms of radius R px: arms, then bodies and symbols, then the
     veil on waste, then knots, then palms, so a knot is never under a body and
     a palm never under an arm. Each item: { x, y, el, alpha, label,
     bonds: [{ ang, half, order, key, knot }], free: [{ ang, len, glow }],
     palm, palmK, wasteK }. */
  function drawAtoms(items, R) {
    const armW = Math.max(2, R * 0.24), palmR = Math.max(2.5, R * 0.26), knotR = Math.max(1.8, R * 0.2), off = R * 0.34;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = armW;
    for (const a of items) {
      const al = a.alpha == null ? 1 : a.alpha;
      ctx.globalAlpha = al;
      ctx.strokeStyle = a.wasteK ? mix(ART[a.el].arm, ART.wasteArm, a.wasteK) : ART[a.el].arm;
      for (const b of a.bonds) {
        const ux = Math.cos(b.ang), uy = Math.sin(b.ang), nx = -uy, ny = ux;
        for (const o of offsets(b.order, off)) {
          ctx.beginPath();
          ctx.moveTo(a.x + ux * R * 0.6 + nx * o, a.y + uy * R * 0.6 + ny * o);
          ctx.lineTo(a.x + ux * b.half + nx * o, a.y + uy * b.half + ny * o);
          ctx.stroke();
        }
      }
      for (const h of a.free || []) {
        ctx.beginPath();
        ctx.moveTo(a.x + Math.cos(h.ang) * R * 0.6, a.y + Math.sin(h.ang) * R * 0.6);
        ctx.lineTo(a.x + Math.cos(h.ang) * h.len, a.y + Math.sin(h.ang) * h.len);
        ctx.stroke();
      }
    }
    for (const a of items) {
      const al = a.alpha == null ? 1 : a.alpha;
      const spr = bodySprite(a.el, R);
      ctx.globalAlpha = al;
      ctx.drawImage(spr.c, a.x - spr.half, a.y - spr.half, spr.half * 2, spr.half * 2);
      if (a.label !== false && R >= 9) {
        ctx.fillStyle = ART[a.el].ink;
        ctx.font = '800 ' + Math.round(R * (a.el.length > 1 ? 0.8 : 0.95)) + 'px Inter, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(a.el, a.x, a.y + R * 0.05);
      }
      if (a.wasteK) {
        ctx.globalAlpha = al * a.wasteK;
        ctx.fillStyle = ART.veil;
        ctx.beginPath(); ctx.arc(a.x, a.y, R + 0.5, 0, TAU); ctx.fill();
      }
    }
    const drawn = new Set();
    for (const a of items) {
      const al = a.alpha == null ? 1 : a.alpha;
      for (const b of a.bonds) {
        if (drawn.has(b.key)) continue;
        drawn.add(b.key);
        const ux = Math.cos(b.ang), uy = Math.sin(b.ang), nx = -uy, ny = ux;
        const mx = a.x + ux * b.half, my = a.y + uy * b.half, kr = knotR * (b.knot || 1);
        for (const o of offsets(b.order, off)) {
          const kx = mx + nx * o, ky = my + ny * o;
          if (a.wasteK) {
            ctx.globalAlpha = al; ctx.fillStyle = mix(ART.knot, ART.wasteKnot, a.wasteK);
            ctx.beginPath(); ctx.arc(kx, ky, kr, 0, TAU); ctx.fill();
            continue;
          }
          feather(kx, ky, kr, kr * 2.6, '255,246,220', 0.55 * al);
          ctx.globalAlpha = al; ctx.fillStyle = ART.knot;
          ctx.beginPath(); ctx.arc(kx, ky, kr, 0, TAU); ctx.fill();
        }
      }
    }
    for (const a of items) {
      if (!a.free || !a.free.length || !a.palm) continue;
      const al = a.alpha == null ? 1 : a.alpha;
      for (const h of a.free) {
        const x = a.x + Math.cos(h.ang) * h.len, y = a.y + Math.sin(h.ang) * h.len;
        if (h.glow) feather(x, y, palmR, palmR * 3.4, h.glow.rgb, h.glow.a * al);
        drawPalm(x, y, palmR, h.glow ? (h.glow.bad ? 'amber' : 'green') : a.palm, h.glow ? 1 : a.palmK, al);
      }
    }
    ctx.restore();
  }

  // Free hands spread into the widest gaps between what an atom already holds.
  function freeAnglesAround(angs, f) {
    if (f <= 0) return [];
    const sorted = angs.map((x) => ((x % TAU) + TAU) % TAU).sort((a, b) => a - b);
    if (sorted.length === 1) return Array.from({ length: f }, (_, i) => sorted[0] + TAU * (i + 1) / (f + 1));
    const gaps = sorted.map((s, i) => ({ start: s, size: (i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + TAU) - s, n: 0 }));
    for (let k = 0; k < f; k++) {
      let best = gaps[0];
      for (const g of gaps) if (g.size / (g.n + 1) > best.size / (best.n + 1)) best = g;
      best.n++;
    }
    const out = [];
    for (const g of gaps) for (let j = 1; j <= g.n; j++) out.push(g.start + g.size * j / (g.n + 1));
    return out;
  }
  const evenAngles = (th, f) => Array.from({ length: f }, (_, i) => th + TAU * i / f);

  /* Palm turns are remembered per atom so green-to-amber takes its 200ms. */
  function notePalms(now) {
    for (const [id, state] of Object.entries(st.analysis.palm)) {
      const prev = palmSeen.get(+id);
      if (!prev) palmSeen.set(+id, { state, t: now, born: true });
      else if (prev.state !== state) palmSeen.set(+id, { state, t: now, born: false });
    }
  }
  function palmK(id, now) {
    const p = palmSeen.get(id);
    if (!p || p.state !== 'amber' || p.born) return 1;
    return reduced() ? 1 : clamp01((now - p.t) / 200);
  }
  function wasteK(id, now) {
    const w = wasteFx.find((f) => !f.chipOnly && f.ids.includes(id));
    if (!w || reduced()) return 1;
    return clamp01((now - w.t0) / TUNE.dimMs);
  }

  function atomItems(now, threats) {
    const items = [];
    for (const a of st.atoms) {
      if (!inDish(a)) continue;
      const p = P.get(a.id), c = toPx(p);
      const item = { id: a.id, el: a.el, x: c.x, y: c.y, bonds: [], free: [] };
      const nb = [];
      for (const b of a.bonds) {
        const q = P.get(b.to);
        if (!q) continue;
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        nb.push(ang);
        const key = Math.min(a.id, b.to) + '-' + Math.max(a.id, b.to), t0 = claspAt.get(key);
        item.bonds.push({ ang, half: Math.hypot(q.x - p.x, q.y - p.y) * G.S / 2, order: b.order, key,
                          knot: t0 == null || reduced() ? 1 : 1 + 0.9 * clamp01(1 - (now - t0) / 260) });
      }
      if (a.free > 0) {
        const angs = nb.length ? freeAnglesAround(nb, a.free) : evenAngles(p.th, a.free);
        item.free = angs.map((ang) => ({ ang, len: G.S * TUNE.hand }));
        /* A charged hand with a partner in reach swings round to it and
           stretches, more the closer it gets. Amber if that grab would lose a
           molecule, green if not. */
        const used = new Set();
        for (const t of threats) {
          if (t.a !== a.id && t.b !== a.id) continue;
          if (used.size >= item.free.length) break;
          const o = P.get(t.a === a.id ? t.b : t.a);
          const want = Math.atan2(o.y - p.y, o.x - p.x);
          let pick = -1, bd = 9;
          item.free.forEach((h, i) => {
            if (used.has(i)) return;
            const dd = Math.abs(Math.atan2(Math.sin(h.ang - want), Math.cos(h.ang - want)));
            if (dd < bd) { bd = dd; pick = i; }
          });
          if (pick < 0) continue;
          used.add(pick);
          const h = item.free[pick];
          h.ang = lerpAng(h.ang, want, clamp01(t.k * 3));
          const reach = Math.max(TUNE.hand, (t.d / 2) * 0.97);
          const quiver = reduced() ? 1 : 1 + 0.05 * Math.sin(now / 70 + a.id * 1.3) * t.k;
          h.len = G.S * (TUNE.hand + (reach - TUNE.hand) * t.k) * quiver;
          h.glow = { rgb: t.bad ? '240,178,60' : '93,211,158', a: 0.2 + 0.5 * t.k, bad: t.bad };
        }
      }
      if (a.status === 'waste') item.wasteK = wasteK(a.id, now);
      else if (a.free > 0) {
        item.palm = a.committed ? (st.analysis.palm[a.id] || 'green') : 'open';
        item.palmK = palmK(a.id, now);
      }
      items.push(item);
    }
    return items;
  }

  /* A chip at the point of action: HUD, so exempt from the 16px copy rule,
     but 15px and never below 11. Kept inside the dish. */
  function drawChip(text, cx, cy, tone, al) {
    ctx.save();
    ctx.globalAlpha = al == null ? 1 : al;
    ctx.font = '700 15px Inter, sans-serif';
    const w = Math.round(ctx.measureText(text).width + 28), h = 30;
    const x = Math.round(Math.max(G.x + 6, Math.min(G.x + G.w - 6 - w, cx - w / 2)));
    const y = Math.round(Math.max(G.y + 6, Math.min(G.y + G.h - 6 - h, cy - h / 2)));
    ctx.fillStyle = TOK.card; rr(x, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = tone === 'green' ? TOK.green : tone === 'amber' ? TOK.sun : TOK.ink82;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
    ctx.restore();
  }
  function groupPx(ids) {
    const pts = ids.map((i) => P.get(i)).filter(Boolean).map(toPx);
    if (!pts.length) return null;
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    return { cx: (Math.min(...xs) + Math.max(...xs)) / 2, top: Math.min(...ys), bottom: Math.max(...ys) };
  }
  function drawWasteChips(now) {
    wasteFx = wasteFx.filter((w) => now - w.t0 < TUNE.chipMs + 50);
    for (const w of wasteFx) {
      const t = now - w.t0, box = groupPx(w.ids);
      if (!box || t > TUNE.chipMs) continue;
      const al = t < 150 ? t / 150 : t > TUNE.chipMs - 250 ? (TUNE.chipMs - t) / 250 : 1;
      const below = box.bottom + G.S * 2.4;
      const y = below + 15 > G.y + G.h - 6 ? box.top - G.S * 2.4 : below;
      drawChip(w.lost ? 'lost a molecule' : 'wasted', box.cx, y, w.lost ? 'amber' : 'grey', al);
    }
  }
  // Said once, at the closest reach, when it is nearly a grab.
  function drawThreatChip(threats) {
    const t = threats[0];
    if (!t || t.k < 0.72) return;
    const q = P.get(t.b);
    if (!q) return;
    const c = toPx(q);
    let text = null, tone = 'grey';
    if (t.bad) { text = 'loses a molecule'; tone = 'amber'; }
    else if (t.pv && t.pv.done && t.pv.done.kind === 'required') { text = 'makes ' + M.MOLECULES[t.pv.done.key].formula; tone = 'green'; }
    if (!text) return;
    const above = c.y - G.S * 2.6;
    drawChip(text, c.x, above - 15 < G.y + 6 ? c.y + G.S * 2.6 : above, tone, 1);
  }
  function drawFlashes(now) {
    flashes = flashes.filter((f) => now - f.t0 < TUNE.flashMs);
    ctx.save();
    for (const f of flashes) {
      const t = clamp01((now - f.t0) / TUNE.flashMs), c = toPx(f);
      feather(c.x, c.y, G.S * 0.3, G.S * (0.8 + 1.6 * easeOut(t)), '255,246,220', 0.7 * (1 - t));
    }
    ctx.restore();
  }

  /* ---------- THE LIFT ----------
     A finished target rises a little with its name, then flies to its place in
     the target row. */
  function startLift(key, ids, now) {
    const atoms = ids.filter((i) => P.has(i)).map((i) => {
      const c = toPx(P.get(i));
      return { id: i, el: st.atoms[i].el, x: c.x, y: c.y, bonds: st.atoms[i].bonds.map((b) => ({ to: b.to, order: b.order })) };
    });
    ids.forEach((i) => P.delete(i));
    if (!atoms.length) return;
    const xs = atoms.map((a) => a.x), ys = atoms.map((a) => a.y);
    lifts.push({ key, atoms, t0: now, cx: (Math.min(...xs) + Math.max(...xs)) / 2,
                 cy: (Math.min(...ys) + Math.max(...ys)) / 2, top: Math.min(...ys) });
  }
  const inFlight = (key, now) => lifts.filter((L) => L.key === key && now - L.t0 < TUNE.liftMs).length;
  function drawLifts(now) {
    lifts = lifts.filter((L) => now - L.t0 < TUNE.liftMs);
    for (const L of lifts) {
      const t = (now - L.t0) / TUNE.liftMs;
      const dest = flaskSlot(L.key);
      const endR = dest.span * 0.3;
      let cx = L.cx, cy = L.cy, sc = 1, al = 1;
      const rise = G.S * 2.4;
      if (reduced()) al = 1 - t;
      else if (t < 0.4) cy = L.cy - rise * easeOut(t / 0.4);
      else {
        const u = easeInOut((t - 0.4) / 0.6);
        cx = L.cx + (dest.x - L.cx) * u;
        cy = (L.cy - rise) + (dest.y - (L.cy - rise)) * u;
        sc = 1 + (endR / G.S - 1) * u;
        al = 1 - 0.7 * u;
      }
      const byId = new Map(L.atoms.map((a) => [a.id, a]));
      const items = L.atoms.map((a) => ({
        el: a.el, x: cx + (a.x - L.cx) * sc, y: cy + (a.y - L.cy) * sc, alpha: al, free: [],
        bonds: a.bonds.filter((b) => byId.has(b.to)).map((b) => {
          const o = byId.get(b.to);
          return { ang: Math.atan2(o.y - a.y, o.x - a.x), half: Math.hypot(o.x - a.x, o.y - a.y) * sc / 2,
                   order: b.order, key: Math.min(a.id, b.to) + '-' + Math.max(a.id, b.to) };
        }),
      }));
      ctx.save();
      for (const it of items) feather(it.x, it.y, G.S * sc, G.S * sc * 1.9, '255,246,220', 0.3 * al);
      ctx.restore();
      drawAtoms(items, G.S * sc);
      if (t < 0.5 && !reduced()) {
        const m = M.MOLECULES[L.key];
        drawChip(cap(m.name), cx, cy - (L.cy - L.top) - G.S * 2.4, 'green', t > 0.4 ? (0.5 - t) * 10 : 1);
      }
    }
  }

  /* ---------- THE TARGET ROW ----------
     The list, read once: each molecule drawn in its own atoms, its name and
     formula, and how many are made. */
  function flaskSlots() {
    const n = st.targets.length, out = [];
    ctx.save();
    ctx.font = '700 15px Inter, sans-serif';
    const nameOf = (t, long) => {
      const m = M.MOLECULES[t.key];
      return long ? cap(m.name) + ' (' + m.formula + ')' : m.formula;
    };
    if (MODE === 'mobile') {
      const colW = flaskArea.w / n, span = 17;
      const labelY = flaskArea.y + flaskArea.h - 12, iconY = flaskArea.y + (flaskArea.h - 24) / 2;
      st.targets.forEach((t, i) => {
        const cx = flaskArea.x + colW * (i + 0.5);
        out.push({ key: t.key, n: t.n, x: cx, y: iconY, span, labelX: cx, labelY, align: 'center', maxW: colW - 8, name: nameOf(t, false) });
      });
    } else {
      const span = 19, gapItems = 30, labelGap = 12;
      const measure = (long) => {
        let total = 0;
        const parts = st.targets.map((t) => {
          const lay = M.layoutMolecule(t.key), iw = (lay.w - 1) * span + span * 0.8;
          const name = nameOf(t, long), lw = ctx.measureText(name + '  ' + t.n + ' / ' + t.n).width;
          total += iw + labelGap + lw;
          return { t, iw, lw, name };
        });
        return { parts, total: total + gapItems * (n - 1) };
      };
      let m = measure(true);
      if (m.total > flaskArea.w) m = measure(false);
      let x = flaskArea.x + Math.max(0, (flaskArea.w - m.total) / 2);
      const y = flaskArea.y + 44;
      m.parts.forEach((p) => {
        out.push({ key: p.t.key, n: p.t.n, x: x + p.iw / 2, y, span, labelX: x + p.iw + labelGap, labelY: y,
                   align: 'left', maxW: p.lw + 10, name: p.name });
        x += p.iw + labelGap + p.lw + gapItems;
      });
    }
    ctx.restore();
    return out;
  }
  function flaskSlot(key) {
    return flaskSlots().find((f) => f.key === key) || { x: LW / 2, y: 0, span: 17 };
  }
  function iconItems(key, cx, cy, span) {
    const lay = M.layoutMolecule(key);
    const x0 = cx - ((lay.w - 1) * span) / 2, y0 = cy - ((lay.h - 1) * span) / 2;
    return lay.atoms.map((a, i) => ({
      el: a.el, x: x0 + a.x * span, y: y0 + a.y * span, free: [], label: false,
      bonds: lay.bonds.filter((b) => b.a === i || b.b === i).map((b) => {
        const o = lay.atoms[b.a === i ? b.b : b.a];
        return { ang: Math.atan2(o.y - a.y, o.x - a.x), half: span / 2, order: b.order, key: b.a + '-' + b.b };
      }),
    }));
  }
  function label(text, x, y, align, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = TOK.ink72; ctx.font = '700 12px Inter, sans-serif';
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1.2px';
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  function drawFlaskRow(now) {
    const slotsF = flaskSlots();
    if (MODE === 'mobile') label('MAKE', SIDE_PAD, topBand() / 2);
    else if (slotsF[0]) {
      const f0 = slotsF[0], lay0 = M.layoutMolecule(f0.key);
      label('MAKE', Math.round(f0.x - ((lay0.w - 1) * f0.span) / 2 - f0.span * 0.4), flaskArea.y + 12);
    }
    for (const f of slotsF) {
      const lay = M.layoutMolecule(f.key);
      const made = Math.max(0, (st.made[f.key] || 0) - inFlight(f.key, now));
      const full = made >= f.n;
      drawAtoms(iconItems(f.key, f.x, f.y, f.span), f.span * 0.3);
      if (full) {
        const x0 = f.x - ((lay.w - 1) * f.span) / 2, y0 = f.y - ((lay.h - 1) * f.span) / 2;
        const tx = x0 + (lay.w - 1) * f.span + f.span * 0.55, ty = y0 - f.span * 0.35;
        ctx.save();
        ctx.strokeStyle = TOK.green; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(tx - 5, ty); ctx.lineTo(tx - 1.5, ty + 3.5); ctx.lineTo(tx + 6, ty - 5); ctx.stroke();
        ctx.restore();
      }
      const text = f.name + '  ' + made + ' / ' + f.n;
      ctx.save();
      let size = 15;
      ctx.font = '700 ' + size + 'px Inter, sans-serif';
      while (size > 11 && ctx.measureText(text).width > f.maxW) { size -= 1; ctx.font = '700 ' + size + 'px Inter, sans-serif'; }
      ctx.fillStyle = full ? TOK.green : TOK.ink82;
      ctx.textAlign = f.align; ctx.textBaseline = 'middle';
      ctx.fillText(text, f.labelX, f.labelY);
      ctx.restore();
    }
  }

  /* ---------- THE AVAILABLE PANEL ----------
     From the sketch: each atom the player can add, its name, its valency and
     how many are left. Drag one out to use it. */
  function panelAtom(el, x, y, R, al) {
    const f = M.ELEMENTS[el].hands;
    drawAtoms([{ el, x, y, alpha: al, bonds: [], palm: 'open',
                 free: evenAngles(-Math.PI / 2, f).map((ang) => ({ ang, len: R * TUNE.hand })) }], R);
  }
  function drawPanel() {
    if (MODE === 'mobile') {
      ctx.save();
      ctx.fillStyle = TOK.tint03; rr(panel.x, panel.y, panel.w, panel.h, 20); ctx.fill();
      ctx.strokeStyle = TOK.tint10; ctx.lineWidth = 1; rr(panel.x + 0.5, panel.y + 0.5, panel.w - 1, panel.h - 1, 20); ctx.stroke();
      ctx.restore();
      label('AVAILABLE', panel.x + 16, panel.y + 14);
      for (const s of slots) {
        const n = st.avail[s.el] || 0, al = n > 0 ? 1 : 0.35;
        const cx = s.x + s.w / 2, cy = s.y + s.h * 0.5 + 2;
        panelAtom(s.el, cx - 13, cy, 11.5, al);
        ctx.save();
        ctx.globalAlpha = al;
        ctx.font = '800 16px Inter, sans-serif'; ctx.fillStyle = TOK.white; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText('×' + n, cx + 6, cy);
        ctx.font = '600 12px Inter, sans-serif'; ctx.fillStyle = TOK.ink72; ctx.textAlign = 'center';
        ctx.fillText(cap(M.ELEMENTS[s.el].name), cx, s.y + s.h - 12);
        ctx.restore();
      }
    } else {
      label('AVAILABLE', panel.x, panel.y + 12);
      for (const s of slots) {
        const n = st.avail[s.el] || 0, al = n > 0 ? 1 : 0.35;
        const R = 12.5, cx = s.x + 21, cy = s.y + s.h / 2;
        panelAtom(s.el, cx, cy, R, al);
        ctx.save();
        ctx.globalAlpha = al;
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.font = '700 15px Inter, sans-serif'; ctx.fillStyle = TOK.ink90;
        ctx.fillText(cap(M.ELEMENTS[s.el].name), s.x + 46, cy - 9);
        ctx.font = '600 13px Inter, sans-serif'; ctx.fillStyle = TOK.ink72;
        ctx.fillText('valency ' + M.ELEMENTS[s.el].hands, s.x + 46, cy + 10);
        ctx.font = '800 17px Inter, sans-serif'; ctx.fillStyle = TOK.white; ctx.textAlign = 'right';
        ctx.fillText('×' + n, s.x + s.w, cy + 10);
        ctx.restore();
      }
    }
  }

  /* ---------- HUD ---------- */
  function drawSoundPill(b) {
    UI.drawPill(ctx, '', b.cx, b.cy, { w: b.w });
    const on = SND.on(), x = b.cx - 6, y = b.cy;
    ctx.save();
    ctx.strokeStyle = on ? TOK.ink92 : TOK.tint30;
    ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 4, y - 3); ctx.lineTo(x - 1, y - 3);
    ctx.lineTo(x + 3, y - 7); ctx.lineTo(x + 3, y + 7); ctx.lineTo(x - 1, y + 3);
    ctx.lineTo(x - 4, y + 3); ctx.closePath(); ctx.fill();
    if (on) {
      ctx.beginPath(); ctx.arc(x + 5, y, 5, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 5, y, 9, -0.8, 0.8); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(x + 7, y - 5); ctx.lineTo(x + 15, y + 5);
      ctx.moveTo(x + 15, y - 5); ctx.lineTo(x + 7, y + 5); ctx.stroke();
    }
    ctx.restore();
  }
  function drawHUD() {
    for (const b of ctrl) {
      if (b.icon) drawSoundPill(b);
      else UI.drawPill(ctx, b.label, b.cx, b.cy, { w: b.w });
    }
    const lost = st.analysis.lost, y = topBand() / 2, rx = LW - SIDE_PAD;
    const main = 'Level ' + (li + 1);
    ctx.save();
    ctx.font = '600 16px Inter, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    ctx.fillStyle = TOK.ink72; ctx.fillText(main, rx, y);
    if (lost) {
      const minX = MODE === 'desktop' ? readoutMinX : SIDE_PAD + 70;
      const w = ctx.measureText(main).width;
      const tries = [lost + (lost === 1 ? ' molecule lost' : ' molecules lost') + '   ·   ', lost + ' lost  ·  '];
      const text = tries.find((s) => rx - w - ctx.measureText(s).width >= minX) || tries[1];
      ctx.fillStyle = TOK.sun; ctx.fillText(text, rx - w, y);
    }
    ctx.restore();
  }

  /* ---------- CARDS ---------- */
  function cardCopy() {
    if (card.kind === 'win') {
      return { title: 'Flasks full', sub: level.note || '', cta: li + 1 < LEVELS.length ? 'NEXT LEVEL' : 'PLAY AGAIN' };
    }
    return { title: card.made ? card.made + ' of ' + card.total + ' made' : 'Nothing made',
             sub: 'Every molecule on the list has to be made.', cta: 'TRY AGAIN' };
  }
  function wrapLines(text, maxW) {
    const words = text.split(' '), lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }
  function drawCard(now) {
    ctaBox = null;
    if (!card || now < card.showAt) return;
    if (!card.sounded) { card.sounded = true; (card.kind === 'win' ? SND.win : SND.fail)(); }
    const copy = cardCopy();
    ctx.save();
    ctx.fillStyle = TOK.scrim; ctx.fillRect(0, 0, LW, LH);
    const pw = Math.min(LW - 56, 470);
    ctx.font = '600 17px Inter, sans-serif';
    const subLines = wrapLines(copy.sub, pw - 60).slice(0, 3);
    const ph = Math.min(LH - 20, 130 + subLines.length * 24 + 92);
    const px = Math.round((LW - pw) / 2), py = Math.max(10, Math.round((LH - ph) / 2));
    ctx.fillStyle = TOK.card; rr(px, py, pw, ph, 22); ctx.fill();
    ctx.strokeStyle = TOK.tint12; ctx.lineWidth = 1; rr(px + 0.5, py + 0.5, pw - 1, ph - 1, 22); ctx.stroke();
    let size = 34;
    ctx.font = '800 ' + size + 'px Inter, sans-serif';
    while (size > 22 && ctx.measureText(copy.title).width > pw - 48) { size -= 1; ctx.font = '800 ' + size + 'px Inter, sans-serif'; }
    ctx.fillStyle = TOK.white; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(copy.title, px + pw / 2, py + 62);
    ctx.font = '600 17px Inter, sans-serif'; ctx.fillStyle = TOK.ink82;
    subLines.forEach((s, i) => ctx.fillText(s, px + pw / 2, py + 112 + i * 24));
    ctx.restore();
    ctaBox = UI.drawCTA(ctx, copy.cta, px + pw / 2, py + ph - 57, TOK.accent);
  }
  function onCTA() {
    if (!card) return;
    if (card.kind === 'win') loadLevel(li + 1);
    else restart();
  }

  /* ---------- INPUT ----------
     Buttons compare stable ids between press and release, never objects. */
  const playable = () => !card && !st.result;
  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (LW / r.width), y: (e.clientY - r.top) * (LH / r.height) };
  }
  const inBox = (p, b) => b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  const tapBox = (b) => { const h = Math.max(44, b.h); return { x: b.x, y: Math.round(b.y + b.h / 2 - h / 2), w: b.w, h }; };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    SND.ready();
    const p = toLogical(e);
    pointer = { x: p.x, y: p.y, type: e.pointerType };
    press = null;
    if (card && clock() >= card.showAt) { if (inBox(p, ctaBox)) press = { id: 'cta' }; return; }
    const b = ctrl.find((c) => inBox(p, tapBox(c)));
    if (b) { press = { id: b.id }; return; }
    if (!playable() || drag) return;
    const touch = e.pointerType !== 'mouse';
    const hit = atomAt(p);
    if (hit !== null) { startDrag(hit, p, touch, e.pointerId, false); canvas.style.cursor = 'grabbing'; return; }
    const slot = slots.find((s) => inBox(p, s));
    if (slot && (st.avail[slot.el] || 0) > 0) {
      const id = M.take(st, slot.el);
      if (id < 0) return;
      const w = toWorld(p);
      P.set(id, { x: w.x, y: w.y + (touch ? -TUNE.touchLift : 0), th: -Math.PI / 2, vx: 0, vy: 0, w: 0 });
      startDrag(id, p, touch, e.pointerId, true);
      canvas.style.cursor = 'grabbing';
      SND.pick();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = toLogical(e);
    pointer = { x: p.x, y: p.y, type: e.pointerType };
    if (drag && e.pointerId === drag.pid) { setTarget(p); return; }
    if (e.pointerType === 'mouse' && st && !card) {
      const over = atomAt(p) !== null || slots.some((s) => inBox(p, s) && (st.avail[s.el] || 0) > 0);
      canvas.style.cursor = over ? 'grab' : 'default';
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    const p = toLogical(e);
    if (drag && e.pointerId === drag.pid) {
      setTarget(p);
      stepWorld(0);          // carry it the last of the way, grabs included
      finishDrag();
      canvas.style.cursor = 'default';
      return;
    }
    const pr = press;
    press = null;
    if (!pr) return;
    if (pr.id === 'cta') { if (inBox(p, ctaBox)) onCTA(); return; }
    const b = ctrl.find((c) => c.id === pr.id);
    if (!b || !inBox(p, tapBox(b))) return;
    if (b.id === 'sound') SND.toggle();
    else if (b.id === 'restart') restart();
  });
  canvas.addEventListener('pointercancel', () => { if (drag) finishDrag(); press = null; });

  /* ---------- RENDER ---------- */
  function render(now) {
    if (!st || !LW) return;
    ctx.clearRect(0, 0, LW, LH);
    drawWash();
    drawDish();
    const held = drag ? new Set(M.groupOf(st, drag.id)) : null;
    const threats = threatPairs();
    const items = atomItems(now, threats);
    drawAtoms(items.filter((it) => !held || !held.has(it.id)), G.S);
    drawFlashes(now);
    drawWasteChips(now);
    drawFlaskRow(now);
    drawPanel();
    drawLifts(now);
    if (held) drawAtoms(items.filter((it) => held.has(it.id)), G.S);
    drawThreatChip(threats);
    drawHUD();
    drawCard(now);
  }
  function frame(t) {
    if (frozen === null && st) {
      const dt = lastFrame ? Math.min(0.1, (t - lastFrame) / 1000) : 0;
      lastFrame = t;
      if (!(card && clock() >= card.showAt)) {
        stepAcc += dt;
        let n = 0;
        while (stepAcc >= STEP && n < 6) { stepWorld(STEP); stepAcc -= STEP; n++; }
        if (n === 6) stepAcc = 0;
      }
    }
    render(clock());
    requestAnimationFrame(frame);
  }

  /* ---------- DEBUG HANDLE ----------
     For tests and still frames. World units are atom radii from the dish's
     top left; `carry` drags an atom (or a fresh one from the panel, by
     element) in a straight line, grabs and all. */
  window.__chem = {
    get state() {
      return {
        mode: MODE, LW, LH, level: li + 1, S: +G.S.toFixed(3), world: [+G.WW.toFixed(2), +G.WH.toFixed(2)],
        made: Object.assign({}, st.made), wasted: st.wasted, lost: st.analysis.lost, best: st.analysis.best,
        result: st.result, card: card ? card.kind : null, cardShown: !!ctaBox, avail: Object.assign({}, st.avail),
        dragging: drag ? drag.id : -1, reactions, version: st.version, drift: DRIFT, reduced: reduced(),
        palm: Object.assign({}, st.analysis.palm), lastEvent,
        atoms: st.atoms.filter(inDish).map((a) => {
          const p = P.get(a.id);
          return { id: a.id, el: a.el, status: a.status, free: a.free, committed: a.committed,
                   x: +p.x.toFixed(2), y: +p.y.toFixed(2), mol: M.groupOf(st, a.id)[0] };
        }),
      };
    },
    geom() {
      render(clock());
      const atoms = {};
      for (const a of st.atoms) if (inDish(a)) atoms[a.id] = toPx(P.get(a.id));
      return { mode: MODE, LW, LH, dish: { x: G.x, y: G.y, w: G.w, h: G.h, S: G.S, WW: G.WW, WH: G.WH },
               slots: slots.map((s) => ({ el: s.el, x: s.x, y: s.y, w: s.w, h: s.h })), atoms, flaskSlots: flaskSlots(),
               ctrl: ctrl.map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h })), panel, flask: flaskArea, cta: ctaBox };
    },
    toPage(x, y) { return toPx({ x, y }); },
    goto(n) { loadLevel(n - 1); render(clock()); return this.state; },
    restart() { restart(); render(clock()); return this.state; },
    freeze(ms) { frozen = performance.now() + (ms || 0); render(frozen); return frozen; },
    advance(ms) {
      if (frozen === null) frozen = performance.now();
      const n = Math.round((ms || 0) / (STEP * 1000));
      for (let i = 0; i < n; i++) { frozen += STEP * 1000; if (!(card && frozen >= card.showAt)) stepWorld(STEP); }
      render(frozen);
      return this.state;
    },
    thaw() { frozen = null; lastFrame = 0; },
    move(id, x, y) { const p = P.get(id); if (p) { p.x = x; p.y = y; } render(clock()); return this.state; },
    carry(what, x, y, opts) {
      const o = opts || {};
      if (card || st.result) return this.state;
      let id = what;
      if (typeof what === 'string') {
        const s0 = slots.find((q) => q.el === what);
        if (!s0) return this.state;
        id = M.take(st, what);
        if (id < 0) return this.state;
        const w = toWorld({ x: s0.x + s0.w / 2, y: s0.y + s0.h / 2 });
        P.set(id, { x: w.x, y: w.y, th: -Math.PI / 2, vx: 0, vy: 0, w: 0 });
        drag = { id, pid: -1, touch: false, fromPanel: true, ox: 0, oy: 0, tx: w.x, ty: w.y, cx: w.x, cy: w.y };
      } else {
        const q = P.get(id);
        if (!q) return this.state;
        drag = { id, pid: -1, touch: false, fromPanel: false, ox: 0, oy: 0, tx: q.x, ty: q.y, cx: q.x, cy: q.y };
      }
      const sx = drag.cx, sy = drag.cy, n = o.steps || 40;
      for (let i = 1; i <= n && drag; i++) {
        setTargetWorld(sx + (x - sx) * i / n, sy + (y - sy) * i / n);
        stepWorld(STEP);
        if (frozen !== null) frozen += STEP * 1000;
      }
      if (drag && !o.hold) finishDrag();
      render(clock());
      return this.state;
    },
    drop() { if (drag) finishDrag(); render(clock()); return this.state; },
    bondNow(a, b) { const ev = bondAtoms(a, b); render(clock()); return ev; },
    render() { render(clock()); },
  };

  /* ---------- BOOT ----------
     Every re-fit hook is part of the pattern. Timers as well as events, because
     rAF is throttled to nothing in some embedded browsers. */
  setCanvasVars(); resizeCanvas(); fitFullscreen(); resizeCanvas();
  const jump = parseInt(params.get('level'), 10);
  const saved = readSave()[MODE];
  loadLevel(jump >= 1 && jump <= LEVELS.length ? jump - 1 : (Number.isInteger(saved) ? saved : 0));
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', onResize);
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  requestAnimationFrame(frame);
})();
