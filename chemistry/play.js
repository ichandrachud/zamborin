/* ============================================================
   Lessons in Chemistry · A Zamborin Game · M1, the grey box

   The rules are in model.js and the levels in levels.js. This file is the
   loop: layout, input, the drawing of the dish and its atoms, the flask row,
   the tray, the HUD and the cards.

   THE LINE THIS FILE EXISTS TO KEEP: every bond is drawn before it forms.
   While an atom hovers over a cell, the dish is drawn from model.preview(),
   which is the same placement run on a copy. Release calls model.place() on
   the same cell. Nothing here decides a bond.
   ============================================================ */
(() => {
  'use strict';

  const M = window.ChemModel, LV = window.ChemLevels;
  const TAU = Math.PI * 2;
  const params = new URLSearchParams(location.search);

  /* ---------- MODE ----------
     A browser can report a 0-wide viewport on the first frame; zero means "not
     measured yet", so it must not count as narrow. A narrow frame lying on
     its side with a mouse is an embed, not a phone (Karrots learned that at
     480x360). ?mode=desktop / ?mode=mobile forces a layout, because the
     in-app preview reports a coarse pointer whatever window it is in. */
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
     A lab at night: quiet and precise. Priya plays muted, so nothing here may
     carry information the picture does not. */
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zam.chemistry.sfx', gain: 3 }) : null;
  const PITCH = { H: 1175, O: 988, N: 784, C: 587, Cl: 880, Na: 698, Ca: 523, Fe: 440 };   // lighter atoms ring higher
  const SND = {
    on:     () => !!(sfx && sfx.isOn()),
    ready:  () => { if (sfx) sfx.ensureAudio(); },
    toggle: () => { if (sfx) { sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.play('click'); } },
    set:    () => { if (sfx) sfx.play('drop'); },
    clasp:  (el, n) => {
      if (!sfx) return;
      for (let i = 0; i < Math.min(4, n); i++) {
        setTimeout(() => { sfx.woodClack(PITCH[el] * 0.5, 0.06, 0.12); sfx.tone(PITCH[el], 0.09, 0.03, 'triangle'); }, i * 55);
      }
    },
    waste:  () => { if (sfx) sfx.play('thump'); },
    lift:   () => { if (sfx) sfx.play('success'); },
    palm:   () => { if (sfx) sfx.tone(196, 0.16, 0.05, 'sine'); },
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
     dish are game art (brief §10), and none of that palette touches chrome. */
  const TOK = {
    bg: '#0E1726', card: '#131F36', panel: '#1A2A45',          // --bg, --bg-card, --bg-panel
    accent: '#C24A39', sun: '#FFD23F', green: '#5DD39E',       // --accent, --accent-2, --green
    ink72: 'rgba(255,255,255,0.72)', ink82: 'rgba(255,255,255,0.82)',
    ink90: 'rgba(255,255,255,0.90)', ink92: 'rgba(255,255,255,0.92)', white: '#FFFFFF',
    tint03: 'rgba(255,255,255,0.03)', tint10: 'rgba(255,255,255,0.10)',
    tint12: 'rgba(255,255,255,0.12)', tint30: 'rgba(255,255,255,0.30)',
    scrim: 'rgba(10,16,28,0.82)',
  };
  const ART = {
    H: { hi: '#F2F5FA', lo: '#98A4B8', arm: '#D9E0EA' },
    O: { hi: '#F47A66', lo: '#8A2A1E', arm: '#F5A896' },
    N: { hi: '#7A9EF2', lo: '#22408F', arm: '#A9C0F6' },
    // Carbon lifted from the brief's #626A79 -> #181C24: that measured 2.08:1 on
    // the glass as painted (mean of the body), under the 3:1 the brief sets.
    C: { hi: '#838C9D', lo: '#343B48', arm: '#9FA8B8' },
    // The four the owner's iron chloride needed. Chlorine is CPK green pushed
    // toward lime so it never reads as the mint of a useful palm; calcium is
    // bone rather than CPK green so it cannot be mistaken for chlorine.
    Cl: { hi: '#C9EE8F', lo: '#4E8A24', arm: '#D5F2AE' },
    Na: { hi: '#C7A6F6', lo: '#57339C', arm: '#DACAF8' },
    Ca: { hi: '#F4E6C6', lo: '#A3875A', arm: '#F6ECD6' },
    Fe: { hi: '#E7AB7B', lo: '#7A4524', arm: '#F0C8A6' },
    knot: '#FFF6DC',
    palmGreen: '#5DD39E', palmAmber: '#F0B23C', palmOpen: '#FFFFFF',
    glassTop: '#0C1424', glassBot: '#0A1120', dot: 'rgba(255,255,255,0.055)',
    veil: 'rgba(14,23,38,0.55)', wasteKnot: '#7A8290', wasteArm: '#5A6272',
  };

  /* ---------- TUNING ----------
     The brief's §5 starting constants where it names one. */
  const TUNE = {
    reachMs: 140, snapMs: 80, settlePx: 2, settleMs: 180,
    liftMs: 600, riseCells: 1.5, dimMs: 300, wasteChipMs: 2000, palmTurnMs: 200,
    cardDelayMs: 900, touchLift: 0.9,        // cells the dragged atom rides above a finger
    /* Thermal motion. Every free radical wobbles about its cell, lighter atoms
       more (amplitude falls as mass^-1/4), and every few seconds one lone
       radical drifts to a neighbouring cell, lighter ones more often (chance
       falls as mass^-1/2, as thermal speed does). Slow on purpose: the owner
       asked for motion you notice without it getting in the way of thinking. */
    wobble: 0.07, hopEveryMs: 3600, hopMs: 1600,
    reachStretch: 1.3,                       // how far a radical's hand stretches toward an atom it wants
  };
  const DRIFT = params.get('drift') !== '0';
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => REDUCED.matches || params.get('motion') === 'reduce';

  /* A clock a test can stop, so a still frame of any moment of any animation
     can be drawn on purpose rather than caught by luck. */
  let frozen = null;
  const clock = () => (frozen !== null ? frozen : performance.now());

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, k) {
    const A = hexRgb(a), B = hexRgb(b);
    return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',') + ')';
  }
  function rr(x, y, w, h, r) { UI.roundRectPath(ctx, x, y, w, h, r); }

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
  let hover = null;        // { cell, t0, stamp, pv }  the ghost
  let drag = null;         // { id, x, y, touch }
  let press = null;        // { id, cell }
  let pointer = null;      // { x, y, type }
  let card = null;         // { kind, el, why, showAt, sounded }
  let clasp = null;        // { ids, keys, t0 }
  let lifts = [];          // { key, atoms, t0, cx, cy }
  let wasteFx = [];        // { ids, t0, cx, cy, bottom }
  const palmSeen = new Map();   // atom id -> { state, t }
  let lastGhost = null, lastPlaced = null;
  let hops = [];           // { id, from, to, t0 }  radicals sliding to a new cell
  let nextHopAt = 0, hopCount = 0;

  function loadLevel(i) {
    li = ((i % LEVELS.length) + LEVELS.length) % LEVELS.length;
    level = LEVELS[li];
    st = M.createState(level);
    hover = null; drag = null; press = null; card = null; clasp = null;
    lifts = []; wasteFx = []; palmSeen.clear(); hops = []; nextHopAt = 0;
    notePalms(-1e9);
    layout();
    writeSave();
    T().levelStart && T().levelStart(li + 1);
  }
  function restart() {
    T().levelRestart && T().levelRestart(li + 1);
    loadLevel(li);
  }

  /* ---------- LAYOUT ----------
     Desktop 760x600: controls left and the read-out right in the top band, the
     flask row under it, the 8x6 dish on the left and the tray as a column on
     the right, so the side space carries something real.
     Mobile, measured: the read-out top right, the flask row, the 5x6 dish, the
     tray panel, and the control row at thumb height. */
  const SIDE_PAD = 30;
  const topBand = () => (MODE === 'mobile' ? 64 : 56);
  const botBand = () => (MODE === 'mobile' ? 96 : 20);
  const G = { cols: 5, rows: 6, cell: 50, rim: 12, x: 0, y: 0, w: 0, h: 0, ox: 0, oy: 0 };
  let flaskArea = { x: 0, y: 0, w: 0, h: 0 }, tray = { x: 0, y: 0, w: 0, h: 0 }, handBox = { x: 0, y: 0, w: 0, h: 0 };
  let ctrl = [], readoutMinX = SIDE_PAD, ctaBox = null;

  function layout() {
    if (!level || !LW) return;
    G.cols = level.dish[0]; G.rows = level.dish[1];
    layoutControls();
    if (MODE === 'mobile') layoutMobile(); else layoutDesktop();
    G.ox = G.x + G.rim; G.oy = G.y + G.rim;
    hover = null;
  }
  function layoutMobile() {
    const top = topBand(), bot = botBand(), pad = 14;
    let flaskH = 80, trayH = 96, gapMin = 12;
    G.rim = 12;
    const cellFor = () => Math.floor(Math.min(
      (LW - pad * 2 - G.rim * 2) / G.cols,
      (LH - top - flaskH - trayH - bot - gapMin * 3 - G.rim * 2) / G.rows));
    let cell = cellFor();
    // Short phones give up chrome height before the dish gives up cell size.
    if (cell < 46) { flaskH = 70; trayH = 84; gapMin = 8; cell = cellFor(); }
    G.cell = Math.max(24, Math.min(84, cell));
    G.w = G.cols * G.cell + G.rim * 2; G.h = G.rows * G.cell + G.rim * 2;
    const gap = Math.max(gapMin, Math.floor((LH - top - flaskH - G.h - trayH - bot) / 3));
    flaskArea = { x: 16, y: top - 4, w: LW - 32, h: flaskH };
    G.x = Math.round((LW - G.w) / 2);
    G.y = Math.round(top + flaskH + gap);
    const tw = Math.min(LW - (pad + 4) * 2, Math.max(G.w, 340));
    tray = { x: Math.round((LW - tw) / 2), y: G.y + G.h + gap, w: tw, h: trayH };
    handBox = { x: tray.x, y: tray.y - 6, w: Math.min(124, tray.w * 0.36), h: tray.h + 12 };
  }
  function layoutDesktop() {
    const top = topBand();
    flaskArea = { x: SIDE_PAD, y: top + 2, w: LW - SIDE_PAD * 2, h: 76 };
    G.rim = 12;
    const colW = 124, gap = 22;
    const fieldTop = flaskArea.y + flaskArea.h + 6, fieldBot = LH - botBand();
    G.cell = Math.floor(Math.min(
      (LW - SIDE_PAD * 2 - colW - gap - G.rim * 2) / G.cols,
      (fieldBot - fieldTop - G.rim * 2) / G.rows));
    G.w = G.cols * G.cell + G.rim * 2; G.h = G.rows * G.cell + G.rim * 2;
    G.x = SIDE_PAD;
    G.y = Math.round(fieldTop + (fieldBot - fieldTop - G.h) / 2);
    tray = { x: G.x + G.w + gap, y: G.y, w: LW - SIDE_PAD - (G.x + G.w + gap), h: G.h };
    handBox = { x: tray.x - 10, y: tray.y, w: tray.w + 20, h: 124 };
  }
  /* Order is fixed: sound, Undo, Restart, Hint, Rules. M1 has no Undo (the
     brief: none, restart is free), no Hint (rewarded, M5) and no Rules card
     (M4), so they are absent; nothing moves to fill their places. */
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

  const cellCentre = (cell) => ({ x: G.ox + (M.colOf(st, cell) + 0.5) * G.cell,
                                  y: G.oy + (M.rowOf(st, cell) + 0.5) * G.cell });
  function cellAt(x, y) {
    const c = Math.floor((x - G.ox) / G.cell), r = Math.floor((y - G.oy) / G.cell);
    if (c < 0 || r < 0 || c >= G.cols || r >= G.rows) return -1;
    return c + r * G.cols;
  }
  /* Every atom is drawn from one set of proportions of the distance between
     two bonded centres, on the dish, in the flask row and in the tray. */
  function geomFor(span) {
    return { span, R: span * 0.28, armW: Math.max(2, span * 0.068), freeLen: span * 0.45,
             palmR: Math.max(3, span * 0.072), knotR: Math.max(2, span * 0.058), off: span * 0.1 };
  }

  /* ---------- HANDS ----------
     Free hands spread evenly round what the atom already holds: one hand
     points up, two point up and down, three make a Y, four a cross. A bond
     takes one direction whatever its order. */
  const DIR_ANGLE = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  function freeAngles(dirs, f) {
    if (f <= 0) return [];
    if (!dirs.length) return Array.from({ length: f }, (_, i) => -Math.PI / 2 + TAU * i / f);
    const angs = [...new Set(dirs)].map((d) => (DIR_ANGLE[d] + TAU) % TAU).sort((a, b) => a - b);
    if (angs.length === 1) return Array.from({ length: f }, (_, i) => angs[0] + TAU * (i + 1) / (f + 1));
    const gaps = angs.map((a, i) => ({ start: a, size: (i + 1 < angs.length ? angs[i + 1] : angs[0] + TAU) - a, n: 0 }));
    for (let k = 0; k < f; k++) {
      let best = gaps[0];
      for (const g of gaps) if (g.size / (g.n + 1) > best.size / (best.n + 1)) best = g;
      best.n++;
    }
    const out = [];
    for (const g of gaps) for (let j = 1; j <= g.n; j++) out.push(g.start + g.size * j / (g.n + 1));
    return out;
  }
  const offsets = (order, off) => (order === 1 ? [0] : order === 2 ? [-off, off] : [-off * 1.25, 0, off * 1.25]);

  /* ---------- THE MARBLE ----------
     Lit from the upper left like the Portal wash, a broad specular, a darker
     base, and a soft shadow on the glass. No outline: the edge is value.
     Rendered once per element and size into a sprite, because a full 8x6 dish
     is 48 of them and the target is a 2019 Chromebook. */
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
    sp.addColorStop(0, 'rgba(255,255,255,0.62)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sp; g.beginPath(); g.arc(spx, spy, R * 0.44, 0, TAU); g.fill();
    spr = { c, half };
    if (sprites.size > 160) sprites.clear();
    sprites.set(key, spr);
    return spr;
  }

  /* Draw a set of atoms: arms, then bodies, then the veil on waste, then
     knots, then palms, so a knot is never under a body and a palm never under
     an arm. Each item: { x, y, el, alpha, bonds: [{ dir, order, key, ext,
     alpha, knotAlpha, knotScale }], freeAng, palm, palmK, wasteK }. */
  function drawAtoms(items, g) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = g.armW;
    for (const a of items) {
      const al = a.alpha == null ? 1 : a.alpha;
      const armCol = a.wasteK ? mix(ART[a.el].arm, ART.wasteArm, a.wasteK) : ART[a.el].arm;
      ctx.strokeStyle = armCol;
      for (const b of a.bonds) {
        const ux = M.DIRS[b.dir].dc, uy = M.DIRS[b.dir].dr, px = -uy, py = ux;
        const len = (g.span / 2) * (b.ext == null ? 1 : b.ext);
        ctx.globalAlpha = al * (b.alpha == null ? 1 : b.alpha);
        for (const o of offsets(b.order, g.off)) {
          ctx.beginPath();
          ctx.moveTo(a.x + ux * g.R * 0.6 + px * o, a.y + uy * g.R * 0.6 + py * o);
          ctx.lineTo(a.x + ux * len + px * o, a.y + uy * len + py * o);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = al;
      (a.freeAng || []).forEach((ang, hi) => {
        const len = g.freeLen * (a.stretch && a.stretch.i === hi ? a.stretch.k : 1);
        ctx.beginPath();
        ctx.moveTo(a.x + Math.cos(ang) * g.R * 0.6, a.y + Math.sin(ang) * g.R * 0.6);
        ctx.lineTo(a.x + Math.cos(ang) * len, a.y + Math.sin(ang) * len);
        ctx.stroke();
      });
    }
    for (const a of items) {
      const spr = bodySprite(a.el, g.R);
      ctx.globalAlpha = a.alpha == null ? 1 : a.alpha;
      ctx.drawImage(spr.c, a.x - spr.half, a.y - spr.half, spr.half * 2, spr.half * 2);
      if (a.wasteK) {
        ctx.globalAlpha = (a.alpha == null ? 1 : a.alpha) * a.wasteK;
        ctx.fillStyle = ART.veil;
        ctx.beginPath(); ctx.arc(a.x, a.y, g.R + 0.5, 0, TAU); ctx.fill();
      }
    }
    const drawn = new Set();
    for (const a of items) {
      const al = a.alpha == null ? 1 : a.alpha;
      for (const b of a.bonds) {
        if (b.key) { if (drawn.has(b.key)) continue; drawn.add(b.key); }
        if ((b.ext == null ? 1 : b.ext) < 0.97) continue;
        const ux = M.DIRS[b.dir].dc, uy = M.DIRS[b.dir].dr, px = -uy, py = ux;
        const mx = a.x + ux * g.span / 2, my = a.y + uy * g.span / 2;
        const kr = g.knotR * (b.knotScale || 1);
        for (const o of offsets(b.order, g.off)) {
          const kx = mx + px * o, ky = my + py * o;
          const ka = al * (b.knotAlpha == null ? 1 : b.knotAlpha);
          if (a.wasteK) {
            ctx.globalAlpha = ka; ctx.fillStyle = mix(ART.knot, ART.wasteKnot, a.wasteK);
            ctx.beginPath(); ctx.arc(kx, ky, kr, 0, TAU); ctx.fill();
            continue;
          }
          feather(kx, ky, kr, kr * 2.6, '255,246,220', 0.55 * ka);   // the warmest point on the board
          ctx.globalAlpha = ka; ctx.fillStyle = ART.knot;
          ctx.beginPath(); ctx.arc(kx, ky, kr, 0, TAU); ctx.fill();
        }
      }
    }
    for (const a of items) {
      if (!a.freeAng || !a.freeAng.length || !a.palm) continue;
      a.freeAng.forEach((ang, hi) => {
        const len = g.freeLen * (a.stretch && a.stretch.i === hi ? a.stretch.k : 1);
        drawPalm(a.x + Math.cos(ang) * len, a.y + Math.sin(ang) * len, g.palmR,
                 a.palm, a.palmK, a.alpha == null ? 1 : a.alpha);
      });
    }
    ctx.restore();
  }

  /* A glow is a thin bright core with a tight feather, never a flat disc: a
     disc at low alpha reads as a ring round the thing it lights. */
  function feather(x, y, r0, r1, rgb, a) {
    if (a <= 0) return;
    const g = ctx.createRadialGradient(x, y, r0 * 0.6, x, y, r1);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.globalAlpha = 1; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r1, 0, TAU); ctx.fill();
  }

  /* THE PALM. Green and open while the fragment can still become something on
     the list; amber with a bar across it when it cannot. The bar is the
     channel that does not depend on seeing colour. White on the tray, before
     the dish has decided anything. */
  function drawPalm(x, y, r, state, k, al) {
    if (state === 'open') {
      ctx.globalAlpha = al; ctx.fillStyle = ART.palmOpen;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      return;
    }
    const amber = state === 'amber' ? (k == null ? 1 : k) : 0;
    if (amber < 1) feather(x, y, r, r * 2.4, '93,211,158', 0.5 * al * (1 - amber));
    ctx.globalAlpha = al;
    ctx.fillStyle = amber ? mix(ART.palmGreen, ART.palmAmber, amber) : ART.palmGreen;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (amber > 0) {
      ctx.globalAlpha = al * amber;
      ctx.strokeStyle = ART.glassBot; ctx.lineWidth = Math.max(1.4, r * 0.48); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - r * 0.6, y + r * 0.6); ctx.lineTo(x + r * 0.6, y - r * 0.6); ctx.stroke();
    }
  }

  /* ---------- WHAT THE DISH SHOWS ---------- */
  const bondKey = (a, b) => Math.min(a, b) + '-' + Math.max(a, b);

  /* Palm turns are remembered per atom so green-to-amber can take its 200ms.
     An atom that lands already amber has no turn to animate (the ghost showed
     it amber before release), but it is still the moment its fragment lost
     its future, so it gets the tone and, under reduced motion, the word. */
  function notePalms(now) {
    let turned = false;
    for (const [id, state] of Object.entries(st.analysis.palm)) {
      const prev = palmSeen.get(+id);
      if (!prev) {
        palmSeen.set(+id, { state, t: now, born: true });
        if (state === 'amber' && now > -1e9) turned = true;
      } else if (prev.state !== state) {
        palmSeen.set(+id, { state, t: now, born: false });
        if (state === 'amber') turned = true;
      }
    }
    return turned;
  }
  function palmK(id, now) {
    const p = palmSeen.get(id);
    if (!p || p.state !== 'amber' || p.born) return 1;
    return reduced() ? 1 : clamp01((now - p.t) / TUNE.palmTurnMs);
  }
  function wasteK(id, now) {
    const w = wasteFx.find((f) => f.ids.includes(id));
    if (!w || reduced()) return 1;
    return clamp01((now - w.t0) / TUNE.dimMs);
  }

  /* Where thermal motion has an atom right now. A bonded group moves as one
     body, so arms and knots stay true; a group that grabs the ghost holds
     still while it reaches. Waste has lost its heat. */
  function motionOffsets(s, now, o) {
    const out = new Map();
    const done = new Set();
    for (const a of s.atoms) {
      if (a.status !== 'live' || done.has(a.id)) continue;
      const ids = M.groupOf(s, a.id);
      ids.forEach((i) => done.add(i));
      let x = 0, y = 0;
      const still = o.preview && ids.some((i) => i === o.ghostId || (o.partners && o.partners.has(i)));
      if (!reduced() && !still && ids.some((i) => s.atoms[i].free > 0)) {
        const mass = ids.reduce((m, i) => m + M.ELEMENTS[s.atoms[i].el].mass, 0);
        const amp = G.cell * TUNE.wobble * Math.pow(mass, -0.25);
        const t = now / 1000, ph = ids[0] * 1.7 + 0.3;
        x = amp * (0.62 * Math.sin(t * 0.83 + ph) + 0.38 * Math.sin(t * 1.37 + ph * 2.3));
        y = amp * (0.62 * Math.sin(t * 0.71 + ph * 1.9) + 0.38 * Math.sin(t * 1.21 + ph * 0.7));
      }
      for (const i of ids) {
        let hx = x, hy = y;
        const h = hops.find((q) => q.id === i);
        if (h && !reduced()) {
          const k = 1 - easeInOut(clamp01((now - h.t0) / TUNE.hopMs));
          const f = cellCentre(h.from), to = cellCentre(h.to);
          hx += (f.x - to.x) * k; hy += (f.y - to.y) * k;
        }
        out.set(i, { x: hx, y: hy });
      }
    }
    return out;
  }

  function dishItems(s, now, o) {
    const items = [];
    const moved = motionOffsets(s, now, o);
    const ghostNear = o.preview ? new Set([0, 1, 2, 3].map((d) => M.neighbourCell(s, s.atoms[o.ghostId].cell, d))) : null;
    for (const a of s.atoms) {
      if (a.status === 'gone') continue;
      const p = cellCentre(a.cell);
      const m = moved.get(a.id) || { x: 0, y: 0 };
      let dy = 0;
      if (!o.preview && clasp && clasp.ids.has(a.id) && !reduced()) {
        const t = now - clasp.t0;
        if (t >= 0 && t < TUNE.settleMs) dy = TUNE.settlePx * Math.sin(Math.PI * t / TUNE.settleMs);
      }
      const item = { id: a.id, el: a.el, x: p.x + m.x, y: p.y + m.y + dy, alpha: a.id === o.ghostId ? 0.55 : 1, bonds: [],
                     freeAng: freeAngles(a.bonds.map((b) => b.dir), a.free) };
      /* A radical beside the atom being aimed that does NOT get it still wants
         it: one hand swings toward the ghost and stretches. That is the pounce
         the player is steering between. */
      if (o.preview && a.id !== o.ghostId && a.free > 0 && a.status === 'live' && ghostNear.has(a.cell) && item.freeAng.length) {
        const gp = cellCentre(s.atoms[o.ghostId].cell);
        const want = Math.atan2(gp.y - p.y, gp.x - p.x);
        let near = 0;
        item.freeAng.forEach((ang, i) => {
          const dd = (x) => Math.abs(Math.atan2(Math.sin(x - want), Math.cos(x - want)));
          if (dd(ang) < dd(item.freeAng[near])) near = i;
        });
        item.freeAng[near] = want;
        item.stretch = { i: near, k: reduced() ? 1 : 1 + (TUNE.reachStretch - 1) * o.reach };
      }
      for (const b of a.bonds) {
        const key = bondKey(a.id, b.to);
        const bond = { dir: b.dir, order: b.order, key };
        if (o.preview && o.newKeys.has(key)) {
          bond.ext = o.reach; bond.alpha = 0.85; bond.knotAlpha = 0.55;          // the promise, faint
        } else if (!o.preview && clasp && clasp.keys.has(key)) {
          const t = now - clasp.t0;
          bond.ext = reduced() || t >= TUNE.snapMs ? 1 : 0.82 + 0.18 * easeOut(clamp01(t / TUNE.snapMs));
          bond.knotScale = reduced() ? 1 : 1 + 0.8 * clamp01(1 - t / 260);    // the knot lights
        }
        item.bonds.push(bond);
      }
      if (a.status === 'waste') item.wasteK = wasteK(a.id, now);
      else if (a.free > 0) {
        item.palm = o.palm[a.id] || 'green';
        item.palmK = o.preview ? 1 : palmK(a.id, now);
      }
      items.push(item);
    }
    return items;
  }

  /* ---------- DRAWING ---------- */
  function drawWash() {
    const bg = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
    bg.addColorStop(0, TOK.panel); bg.addColorStop(0.6, TOK.card); bg.addColorStop(1, TOK.bg);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);
  }

  /* The dish: dark glass in a vessel whose rim catches the light along its
     top. A lit band, never a stroke. */
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
    ctx.fillStyle = ART.dot;
    for (let rI = 0; rI < G.rows; rI++) for (let cI = 0; cI < G.cols; cI++) {
      ctx.beginPath();
      ctx.arc(G.ox + (cI + 0.5) * G.cell, G.oy + (rI + 0.5) * G.cell, Math.max(1.5, G.cell * 0.028), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawGhostRing(cell) {
    const p = cellCentre(cell), R = geomFor(G.cell).R;
    ctx.save();
    ctx.strokeStyle = TOK.green; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.arc(p.x, p.y, R + 7, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  /* A chip at the point of action: HUD, so exempt from the 16px copy rule,
     but 15px and never below 11. */
  function drawChip(text, cx, cy, tone, al) {
    ctx.save();
    ctx.globalAlpha = al == null ? 1 : al;
    ctx.font = '700 15px Inter, sans-serif';
    const w = Math.round(ctx.measureText(text).width + 28), h = 30;
    const x = Math.round(Math.max(G.x + 6, Math.min(G.x + G.w - 6 - w, cx - w / 2)));
    const y = Math.round(cy - h / 2);
    ctx.fillStyle = TOK.card; rr(x, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = tone === 'green' ? TOK.green : tone === 'amber' ? TOK.sun : TOK.ink82;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
    ctx.restore();
    return { x, y, w, h };
  }
  /* A chip goes above its group or below it, whichever covers fewer atoms: on
     a crowded dish "above" is often somebody else. */
  function chipY(box, s) {
    const above = box.top - G.cell * 0.78, below = box.bottom + G.cell * 0.78;
    const covered = (y) => {
      if (y - 15 < G.y + 2 || y + 15 > G.y + G.h - 2) return 99;
      let n = 0;
      for (const a of s.atoms) {
        if (a.status === 'gone') continue;
        const c = cellCentre(a.cell);
        if (Math.abs(c.y - y) < G.cell * 0.45 && Math.abs(c.x - box.cx) < G.cell * 1.3) n++;
      }
      return n;
    };
    return covered(below) < covered(above) ? below : above;
  }
  function groupBox(cells) {
    const pts = cells.map(cellCentre);
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { cx: (Math.min(...xs) + Math.max(...xs)) / 2, top: Math.min(...ys), bottom: Math.max(...ys) };
  }
  /* The ghost's chip says what release makes: the name when it is on the
     list, "wasted" when it is not. Above the group, or below it when the
     group sits on the top row. */
  function drawPreviewChip(pv) {
    const costs = pv.analysis.lost > st.analysis.lost;
    if (!pv.done && !costs) return;
    const ids = pv.done ? pv.done.ids : [pv.ev.id];
    const box = groupBox(ids.map((i) => pv.view.atoms[i].cell));
    const y = chipY(box, pv.view);
    if (pv.done && pv.done.kind === 'required') drawChip('makes ' + M.MOLECULES[pv.done.key].short, box.cx, y, 'green');
    else if (costs) drawChip('loses a molecule', box.cx, y, 'amber');
    else drawChip('wasted', box.cx, y, 'grey');
  }
  function drawWasteChips(now) {
    for (const w of wasteFx) {
      const t = now - w.t0;
      if (t < 0 || t > TUNE.wasteChipMs) continue;
      const al = t < 150 ? t / 150 : t > TUNE.wasteChipMs - 250 ? (TUNE.wasteChipMs - t) / 250 : 1;
      const y = chipY(w, st);
      drawChip(w.lost ? 'lost a molecule' : 'wasted', w.cx, y, w.lost ? 'amber' : 'grey', al);
    }
    if (reduced()) {
      for (const [id, p] of palmSeen) {
        if (p.state !== 'amber' || clock() - p.t > 1000 || !st.atoms[id] || st.atoms[id].free === 0) continue;
        const c = cellCentre(st.atoms[id].cell);
        drawChip('no future', c.x, c.y - G.cell * 0.78, 'grey');
        break;
      }
    }
  }

  /* ---------- THE LIFT ----------
     A required molecule rises a cell and a half with its name, then flies into
     its flask. The eye goes to the flask row only because the molecule flies
     there. */
  function startLift(done, now) {
    const atoms = done.atoms.map((a) => Object.assign({}, a, cellCentre(a.cell)));
    const xs = atoms.map((a) => a.x), ys = atoms.map((a) => a.y);
    lifts.push({ key: done.key, atoms, t0: now,
                 cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2,
                 top: Math.min(...ys) });
  }
  const inFlight = (key, now) => lifts.filter((L) => L.key === key && now - L.t0 < TUNE.liftMs).length;
  function drawLifts(now) {
    for (const L of lifts) {
      const t = (now - L.t0) / TUNE.liftMs;
      if (t < 0 || t >= 1) continue;
      const dest = flaskSlot(L.key);
      let cx = L.cx, cy = L.cy, sc = 1, al = 1;
      const rise = TUNE.riseCells * G.cell;
      if (reduced()) al = 1 - t;
      else if (t < 0.45) cy = L.cy - rise * easeOut(t / 0.45);
      else {
        const u = easeInOut((t - 0.45) / 0.55);
        cx = L.cx + (dest.x - L.cx) * u;
        cy = (L.cy - rise) + (dest.y - (L.cy - rise)) * u;
        sc = 1 + (dest.span / G.cell - 1) * u;
        al = 1 - 0.75 * u;
      }
      // The glow is each atom's own tight feather, not a wash behind the group.
      const gR = geomFor(G.cell * sc).R;
      ctx.save();
      for (const a of L.atoms) feather(cx + (a.x - L.cx) * sc, cy + (a.y - L.cy) * sc, gR, gR * 1.9, '255,246,220', 0.34 * al);
      ctx.restore();
      const items = L.atoms.map((a) => ({
        el: a.el, x: cx + (a.x - L.cx) * sc, y: cy + (a.y - L.cy) * sc, alpha: al,
        bonds: a.bonds.map((b) => ({ dir: b.dir, order: b.order, key: bondKey(a.id, b.to) })), freeAng: [],
      }));
      drawAtoms(items, geomFor(G.cell * sc));
      if (t < 0.5 && !reduced()) {
        drawChip(M.MOLECULES[L.key].short, cx, cy - (L.cy - L.top) - G.cell * 0.78, 'green', t > 0.4 ? (0.5 - t) * 10 : 1);
      }
    }
  }

  /* ---------- THE FLASK ROW ----------
     The list, read once: each molecule drawn in its own atoms, its name, and
     how many are made. It changes only when a molecule arrives. */
  function flaskSlots() {
    const n = st.targets.length, out = [];
    if (MODE === 'mobile') {
      const colW = flaskArea.w / n;
      const span = 17;
      // icons centred in the room above the label, so a three-row methane clears it on a short phone too
      const labelY = flaskArea.y + flaskArea.h - 12, iconY = flaskArea.y + (flaskArea.h - 24) / 2;
      st.targets.forEach((t, i) => {
        const cx = flaskArea.x + colW * (i + 0.5);
        out.push({ key: t.key, n: t.n, x: cx, y: iconY, span, labelX: cx, labelY, align: 'center', maxW: colW - 8 });
      });
    } else {
      const span = 19, gapItems = 40, labelGap = 14;
      ctx.save(); ctx.font = '700 15px Inter, sans-serif';
      let total = 0;
      const parts = st.targets.map((t) => {
        const lay = M.layoutMolecule(t.key), iw = (lay.w - 1) * span + span * 0.6;
        const lw = ctx.measureText(M.MOLECULES[t.key].short + '  ' + t.n + ' / ' + t.n).width;
        total += iw + labelGap + lw;
        return { t, iw, lw };
      });
      ctx.restore();
      total += gapItems * (n - 1);
      let x = flaskArea.x + Math.max(0, (flaskArea.w - total) / 2);
      const y = flaskArea.y + 46;
      parts.forEach((p) => {
        out.push({ key: p.t.key, n: p.t.n, x: x + p.iw / 2, y, span, labelX: x + p.iw + labelGap, labelY: y, align: 'left', maxW: p.lw + 8 });
        x += p.iw + labelGap + p.lw + gapItems;
      });
    }
    return out;
  }
  function flaskSlot(key) {
    const s = flaskSlots().find((f) => f.key === key);
    return s || { x: LW / 2, y: 0, span: 17 };
  }
  function drawFlaskRow(now) {
    const slots = flaskSlots();
    ctx.save();
    ctx.fillStyle = TOK.ink72; ctx.font = '700 13px Inter, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1.5px';
    if (MODE === 'mobile') ctx.fillText('MAKE', SIDE_PAD, topBand() / 2);
    else {
      // over the first molecule, so the word belongs to the row it names
      const f0 = slots[0], lay0 = M.layoutMolecule(f0.key);
      ctx.fillText('MAKE', Math.round(f0.x - ((lay0.w - 1) * f0.span) / 2 - f0.span * 0.3), flaskArea.y + 12);
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.restore();

    for (const f of slots) {
      const lay = M.layoutMolecule(f.key);
      const made = (st.made[f.key] || 0) - inFlight(f.key, now);
      const full = made >= f.n;
      const x0 = f.x - ((lay.w - 1) * f.span) / 2, y0 = f.y - ((lay.h - 1) * f.span) / 2;
      const items = lay.atoms.map((a, i) => ({
        el: a.el, x: x0 + a.x * f.span, y: y0 + a.y * f.span,
        bonds: lay.bonds.filter((b) => b.a === i || b.b === i).map((b) => {
          const o = lay.atoms[b.a === i ? b.b : b.a];
          const dx = o.x - a.x, dy = o.y - a.y;
          return { dir: dy < 0 ? 0 : dx > 0 ? 1 : dy > 0 ? 2 : 3, order: b.order, key: b.a + '-' + b.b };
        }),
        freeAng: [],
      }));
      drawAtoms(items, geomFor(f.span));
      if (full) {
        const tx = x0 + (lay.w - 1) * f.span + f.span * 0.55, ty = y0 - f.span * 0.35;
        ctx.save();
        ctx.strokeStyle = TOK.green; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(tx - 5, ty); ctx.lineTo(tx - 1.5, ty + 3.5); ctx.lineTo(tx + 6, ty - 5); ctx.stroke();
        ctx.restore();
      }
      const text = M.MOLECULES[f.key].short + '  ' + Math.max(0, made) + ' / ' + f.n;
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

  /* ---------- THE TRAY ---------- */
  function trayAtom(el, x, y, R, al) {
    drawAtoms([{ el, x, y, alpha: al, bonds: [], freeAng: freeAngles([], M.ELEMENTS[el].hands), palm: 'open' }],
              geomFor(R / 0.28));
  }
  function label(text, x, y, align) {
    ctx.save();
    ctx.fillStyle = TOK.ink72; ctx.font = '700 12px Inter, sans-serif';
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1.2px';
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  function drawTray() {
    const el = st.supply[st.next];
    const next = st.supply.slice(st.next + 1, st.next + 4);
    const left = st.supply.length - st.next;
    const used = st.grid.filter((v) => v >= 0).length;
    const handAlpha = drag ? 0 : hover ? 0.35 : 1;
    if (MODE === 'mobile') {
      ctx.save();
      ctx.fillStyle = TOK.tint03; rr(tray.x, tray.y, tray.w, tray.h, 22); ctx.fill();
      ctx.strokeStyle = TOK.tint10; ctx.lineWidth = 1; rr(tray.x + 0.5, tray.y + 0.5, tray.w - 1, tray.h - 1, 22); ctx.stroke();
      ctx.restore();
      /* An atom's hands reach 1.54 of its radius, so the atoms sit low enough
         that an upward hand clears the label and a downward one the panel. */
      const midY = tray.y + tray.h * 0.62;
      if (el) label('IN HAND', tray.x + 20, tray.y + 17);
      const handR = Math.min(18, tray.h * 0.19);
      if (el) trayAtom(el, tray.x + 56, midY, handR, handAlpha);
      const nx0 = tray.x + 118;
      if (next.length) label('NEXT', nx0 - 10, tray.y + 17);
      /* The next three are always shown. On a narrow tray the WORDS give way
         ("6 left", "2 / 30"), never an atom and never the type size. */
      ctx.save(); ctx.font = '600 15px Inter, sans-serif';
      const lost = st.analysis.lost;
      const long = [left + (left === 1 ? ' atom left' : ' atoms left'), lost + ' lost', 'space ' + used + ' / ' + st.grid.length];
      const short = [left + ' left', lost + ' lost', used + ' / ' + st.grid.length];
      const widthOf = (ls) => Math.max(...ls.map((s) => ctx.measureText(s).width));
      const rx = tray.x + tray.w - 18;
      const fits = (ls) => (rx - widthOf(ls) - 10 - nx0) / 3 >= 26;
      const lines = fits(long) ? long : short;
      const room = rx - widthOf(lines) - 10 - nx0;
      ctx.restore();
      const step = Math.max(24, Math.min(40, room / 3));
      next.forEach((e, i) => trayAtom(e, nx0 + 10 + i * step, midY, 10, 1));
      ctx.save();
      ctx.font = '600 15px Inter, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = TOK.ink72; ctx.fillText(lines[0], rx, tray.y + tray.h * 0.27);
      ctx.fillStyle = lost ? TOK.sun : TOK.ink72; ctx.fillText(lines[1], rx, tray.y + tray.h * 0.52);
      ctx.fillStyle = TOK.ink72; ctx.fillText(lines[2], rx, tray.y + tray.h * 0.77);
      ctx.restore();
    } else {
      const cx = tray.x + tray.w / 2;
      if (el) label('IN HAND', tray.x, tray.y + 12);
      if (el) trayAtom(el, cx, tray.y + 70, 24, handAlpha);
      if (next.length) label('NEXT', tray.x, tray.y + 138);
      next.forEach((e, i) => trayAtom(e, cx, tray.y + 180 + i * 56, 14, 1));
      ctx.save();
      ctx.font = '600 16px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = st.analysis.lost ? TOK.sun : TOK.ink72;
      ctx.fillText(st.analysis.lost + (st.analysis.lost === 1 ? ' molecule lost' : ' molecules lost'), tray.x, tray.y + tray.h - 40);
      ctx.fillStyle = TOK.ink72;
      ctx.fillText('space ' + used + ' / ' + st.grid.length, tray.x, tray.y + tray.h - 12);
      ctx.restore();
    }
  }
  function drawDragAtom() {
    if (!drag || hover) return;
    const el = st.supply[st.next];
    if (!el) return;
    const y = drag.touch ? drag.y - TUNE.touchLift * G.cell : drag.y;
    drawAtoms([{ el, x: drag.x, y, bonds: [], freeAng: freeAngles([], M.ELEMENTS[el].hands), palm: 'open' }], geomFor(G.cell));
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
    /* The read-out keeps its 16px and gives up WORDS on a narrow frame. The
       shared hs scale bottoms out at 0.66, which is 11px on a phone. */
    const n = li + 1, les = level.lesson, left = st.supply.length - st.next;
    const tries = MODE === 'desktop'
      ? ['Level ' + n + '   ·   Lesson ' + les + '   ·   ' + left + (left === 1 ? ' atom left' : ' atoms left'),
         'Level ' + n + '  ·  Lesson ' + les + '  ·  ' + left + ' left', 'Level ' + n + '  ·  ' + left + ' left']
      : ['Level ' + n + '   ·   Lesson ' + les, 'Level ' + n + '  ·  Lesson ' + les, 'Level ' + n];
    ctx.save();
    ctx.font = '600 16px Inter, sans-serif';
    const minX = MODE === 'desktop' ? readoutMinX : SIDE_PAD + 70;     // clear of MAKE on a phone
    const room = LW - SIDE_PAD - minX;
    const text = tries.find((s) => ctx.measureText(s).width <= room) || tries[tries.length - 1];
    ctx.fillStyle = TOK.ink72; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(text, LW - SIDE_PAD, topBand() / 2);
    ctx.restore();
  }

  /* ---------- CARDS ----------
     The fail card names the shortage and restarts in one tap with the same
     supply. It waits long enough for the clasp, the dulling and the palms to
     be seen, because the stake is the dish, not the card. */
  function cardCopy() {
    if (card.kind === 'win') {
      return { title: 'Flasks full', sub: LV.LESSONS[level.lesson].sentence,
               cta: li + 1 < LEVELS.length ? 'NEXT LEVEL' : 'PLAY AGAIN' };
    }
    if (card.noRoom) return { title: 'No room left', sub: 'An atom is waiting and every cell is full.', cta: 'TRY AGAIN' };
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

  /* ---------- THE MOVE ---------- */
  const playable = () => !card && !st.result && st.next < st.supply.length;
  function dragCell() {
    return cellAt(drag.x, drag.touch ? drag.y - TUNE.touchLift * G.cell : drag.y);
  }
  function hoverCell() {
    if (!playable()) return -1;
    if (drag) return dragCell();
    // A mouse over an empty cell previews a click. A finger has no hover, so a
    // phone previews only while dragging.
    if (MODE === 'desktop' && pointer && pointer.type === 'mouse') return cellAt(pointer.x, pointer.y);
    return -1;
  }
  function refreshHover() {
    const cell = hoverCell();
    if (cell < 0 || !M.canPlace(st, cell)) { hover = null; return; }
    if (hover && hover.cell === cell && hover.stamp === st.version) return;
    hover = { cell, t0: clock(), stamp: st.version, pv: M.preview(st, cell) };
  }

  function doPlace(cell) {
    const lostBefore = st.analysis.lost;
    const pv = M.preview(st, cell);
    const ev = M.place(st, cell);
    if (!ev) return null;
    const now = clock();
    lastGhost = pv && pv.ev.bonds; lastPlaced = ev.bonds;
    const partners = ev.bonds.map((b) => b.to);
    clasp = { ids: new Set([ev.id].concat(partners)), keys: new Set(partners.map((p) => bondKey(ev.id, p))), t0: now };
    const orders = ev.bonds.reduce((n, b) => n + b.order, 0);
    if (orders) SND.clasp(ev.el, orders); else SND.set();
    const lostNow = st.analysis.lost > lostBefore;
    if (ev.done && ev.done.kind === 'required') {
      startLift(ev.done, now);
      setTimeout(SND.lift, 120);
    } else if (ev.done) {
      const box = groupBox(ev.done.ids.map((i) => st.atoms[i].cell));
      wasteFx.push({ ids: ev.done.ids, t0: now, cx: box.cx, top: box.top, bottom: box.bottom, lost: lostNow });
      setTimeout(SND.waste, 60);
    } else if (lostNow) {
      const box = groupBox([ev.cell]);
      wasteFx.push({ ids: [], t0: now, cx: box.cx, top: box.top, bottom: box.bottom, lost: true });
    }
    if (notePalms(now) || lostNow) setTimeout(SND.palm, 90);
    if (st.result) {
      const r = st.result;
      card = { kind: r.kind, made: r.made, total: r.total, noRoom: !!r.noRoom,
               showAt: now + (r.kind === 'win' ? TUNE.liftMs + 350 : TUNE.cardDelayMs), sounded: false };
      if (r.kind === 'win') T().levelComplete && T().levelComplete(li + 1, st.placements);
    }
    hover = null;
    refreshHover();
    return ev;
  }
  function onCTA() {
    if (!card) return;
    if (card.kind === 'win') loadLevel(li + 1);
    else restart();
  }

  /* ---------- INPUT ----------
     Buttons compare stable ids between press and release, never objects
     (Crucible's dead buttons). */
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
    const now = clock();
    // Once the card is up, its CTA is the only thing that answers. Before it
    // shows, the controls still work; the dish is closed by playable().
    if (card && now >= card.showAt) { if (inBox(p, ctaBox)) press = { id: 'cta' }; return; }
    const b = ctrl.find((c) => inBox(p, tapBox(c)));
    if (b) { press = { id: b.id }; return; }
    if (!playable()) return;
    if (inBox(p, handBox)) {
      drag = { id: e.pointerId, x: p.x, y: p.y, touch: e.pointerType !== 'mouse' };
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* not every browser lets a canvas capture */ }
      refreshHover();
      return;
    }
    if (e.pointerType === 'mouse') {
      const cell = cellAt(p.x, p.y);
      if (cell >= 0 && M.canPlace(st, cell)) press = { id: 'cell', cell };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = toLogical(e);
    pointer = { x: p.x, y: p.y, type: e.pointerType };
    if (drag && e.pointerId === drag.id) { drag.x = p.x; drag.y = p.y; }
    refreshHover();
  });
  canvas.addEventListener('pointerup', (e) => {
    const p = toLogical(e);
    pointer = { x: p.x, y: p.y, type: e.pointerType };
    if (drag && e.pointerId === drag.id) {
      drag.x = p.x; drag.y = p.y;
      const cell = dragCell();
      drag = null;
      if (cell >= 0 && M.canPlace(st, cell)) doPlace(cell);
      refreshHover();
      return;
    }
    const pr = press;
    press = null;
    if (!pr) return;
    if (pr.id === 'cta') { if (inBox(p, ctaBox)) onCTA(); return; }
    if (pr.id === 'cell') { if (cellAt(p.x, p.y) === pr.cell) doPlace(pr.cell); return; }
    const b = ctrl.find((c) => c.id === pr.id);
    if (!b || !inBox(p, tapBox(b))) return;
    if (b.id === 'sound') SND.toggle();
    else if (b.id === 'restart') restart();
  });
  canvas.addEventListener('pointercancel', () => { drag = null; press = null; refreshHover(); });
  canvas.addEventListener('pointerleave', () => { if (!drag) { pointer = null; refreshHover(); } });

  /* ---------- RENDER ---------- */
  function render(now) {
    if (!st || !LW) return;
    ctx.clearRect(0, 0, LW, LH);
    drawWash();
    drawDish();
    const pv = hover && hover.pv;
    const s = pv ? pv.view : st;
    const reach = !pv || reduced() ? 1 : 0.5 + 0.5 * easeOut(clamp01((now - hover.t0) / TUNE.reachMs));
    const newKeys = pv ? new Set(pv.ev.bonds.map((b) => bondKey(pv.ev.id, b.to))) : null;
    const partners = pv ? new Set(pv.ev.bonds.map((b) => b.to)) : null;
    drawAtoms(dishItems(s, now, { preview: !!pv, palm: pv ? pv.analysis.palm : st.analysis.palm,
                                   ghostId: pv ? pv.ev.id : -1, newKeys, reach, partners }), geomFor(G.cell));
    if (pv) { drawGhostRing(pv.ev.cell); drawPreviewChip(pv); }
    drawLifts(now);
    drawWasteChips(now);
    drawFlaskRow(now);
    drawTray();
    drawDragAtom();
    drawHUD();
    drawCard(now);
  }
  /* ---------- DRIFT ----------
     Never while the clock is frozen (tests draw still frames), never under a
     card, and never in or beside the cell being aimed at: the model refuses
     those cells, so the ghost cannot change under the player's finger. */
  function blockedCells() {
    const b = new Set();
    if (hover) {
      b.add(hover.cell);
      for (let d = 0; d < 4; d++) { const n = M.neighbourCell(st, hover.cell, d); if (n >= 0) b.add(n); }
    }
    return b;
  }
  function doHop(now, rnd) {
    const blocked = blockedCells(), cands = [];
    let wsum = 0;
    for (const a of st.atoms) {
      if (hops.some((h) => h.id === a.id && now - h.t0 < TUNE.hopMs)) continue;
      const to = M.hopTargets(st, a.id, blocked);
      if (!to.length) continue;
      const w = 1 / Math.sqrt(M.ELEMENTS[a.el].mass);
      cands.push({ a, to, w }); wsum += w;
    }
    if (!cands.length) return false;
    let x = rnd() * wsum, pick = cands[cands.length - 1];
    for (const c of cands) { x -= c.w; if (x <= 0) { pick = c; break; } }
    const from = pick.a.cell, cell = pick.to[Math.floor(rnd() * pick.to.length)];
    if (!M.hop(st, pick.a.id, cell, blocked)) return false;
    hops = hops.filter((h) => h.id !== pick.a.id && now - h.t0 < TUNE.hopMs);
    hops.push({ id: pick.a.id, from, to: cell, t0: now });
    hopCount++;
    if (hover) hover = { cell: hover.cell, t0: hover.t0, stamp: st.version, pv: M.preview(st, hover.cell) };
    return true;
  }
  function stepDrift(now) {
    if (!DRIFT || frozen !== null || card || st.result) return;
    if (!nextHopAt) { nextHopAt = now + TUNE.hopEveryMs; return; }
    if (now < nextHopAt) return;
    nextHopAt = now + TUNE.hopEveryMs * (0.6 + Math.random() * 0.8);
    doHop(now, Math.random);
  }

  function frame() {
    const now = clock();
    stepDrift(now);
    render(now);
    requestAnimationFrame(frame);
  }

  /* ---------- DEBUG HANDLE ----------
     For tests: state, geometry in logical canvas coordinates so a test can
     PRESS things, and a frozen clock so any moment can be drawn. */
  window.__chem = {
    get state() {
      return {
        mode: MODE, LW, LH, level: li + 1, lesson: level.lesson, cell: G.cell,
        next: st.next, supply: st.supply.length, inHand: st.supply[st.next] || null,
        placements: st.placements, made: Object.assign({}, st.made), wasted: st.wasted,
        lost: st.analysis.lost, best: st.analysis.best, version: st.version, hops: hopCount, drift: DRIFT,
        cells: st.atoms.filter((a) => a.status === 'live').map((a) => ({ id: a.id, el: a.el, c: M.colOf(st, a.cell), r: M.rowOf(st, a.cell), free: a.free })),
        result: st.result, card: card ? card.kind : null, cardShown: !!ctaBox,
        palm: Object.assign({}, st.analysis.palm), hover: hover ? hover.cell : -1, dragging: !!drag,
        ghostBonds: hover && hover.pv ? hover.pv.ev.bonds : null,
        lastGhost, lastPlaced, reduced: reduced(),
      };
    },
    geom() {
      render(clock());
      const cells = [];
      for (let i = 0; i < G.cols * G.rows; i++) { const c = cellCentre(i); cells.push({ i, x: c.x, y: c.y }); }
      return { mode: MODE, LW, LH, dish: { x: G.x, y: G.y, w: G.w, h: G.h, cell: G.cell, cols: G.cols, rows: G.rows },
               cells, hand: handBox, tray, flask: flaskArea, flaskSlots: flaskSlots(), ctrl: ctrl.map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h })),
               cta: ctaBox };
    },
    goto(n) { loadLevel(n - 1); render(clock()); return this.state; },
    place(c, r) { doPlace(M.cellOf(st, c, r)); render(clock()); return this.state; },
    solve() { for (const [c, r] of level.solution) doPlace(M.cellOf(st, c, r)); render(clock()); return this.state; },
    hoverAt(c, r) {
      const cell = M.cellOf(st, c, r);
      hover = M.canPlace(st, cell) ? { cell, t0: clock() - 1000, stamp: st.version, pv: M.preview(st, cell) } : null;
      render(clock()); return this.state;
    },
    freeze(msAfterNow) { frozen = performance.now() + (msAfterNow || 0); render(frozen); return frozen; },
    advance(ms) { if (frozen === null) frozen = performance.now(); frozen += ms; render(frozen); return frozen; },
    thaw() { frozen = null; },
    // One drift now, chosen by a seeded draw, so a test can watch motion without waiting.
    hopNow(seed) { let x = seed || 1; const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647); const ok = doHop(clock(), rnd); render(clock()); return ok; },
    render() { render(clock()); },
  };

  /* ---------- BOOT ----------
     Every re-fit hook is part of the pattern (Tailwind collapsed into a strip
     without them). Timers as well as events, because rAF is throttled to
     nothing in some embedded browsers. */
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
