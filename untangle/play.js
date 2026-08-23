/* ============================================================
   Untangle · a Zamborin Game

   Drag the dots so no two edges cross. Each press-drag-release that
   actually moves a vertex counts as 1 move. Par = number of vertices
   the level generator perturbed when scrambling the planar layout.

   Endless level progression: tiers ramp from TUTORIAL (5 dots) up to
   MASTER (12 dots) and then keep generating progressively harder
   MASTER-tier puzzles forever. Highest level is saved locally.
   ============================================================ */
(() => {
  'use strict';

  // ---------- MODE DETECTION ----------
  const MODE = (matchMedia('(pointer: coarse)').matches || window.innerWidth < 768)
    ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);

  // Buttons come from shared/ui.js at ITS sizes. A button is chrome, not
  // content: the Undo pill here is the same physical size as the Undo pill in
  // Prism. Untangle loaded the module and then drew its own, which is how the
  // drift the module was written to end starts again.
  const UI = window.ZAM_UI;

  // The band under the playfield that holds the control row. It used to be a
  // 36px strip of hint text, which is one line of instruction the rules card
  // has already given, and 36 is shorter than a house pill anyway.
  const CTRL_BAND = 56;


  // A viewport reading cannot be taken on trust. innerWidth/innerHeight can be
  // 0 or a stale pre-layout value while this script first runs, and some
  // in-app browsers report a layout height far taller than the screen. That
  // matters because chrome.css derives the wrap's WIDTH from
  // --canvas-w / --canvas-h: feed it a height twice the screen and it returns a
  // wrap a fraction of the screen wide, and the game is drawn into a narrow
  // strip. Cross-check against the visual viewport and the document element and
  // take the smallest sane value. (Tailwind, 2026-08-19.)
  // True when the reading below found NOTHING measurable, so the layout that
  // follows was built on a guess. See the blind-boot recovery further down.
  let viewportWasBlind = false;
  function safeViewport() {
    const vv = window.visualViewport;
    const w = [window.innerWidth, vv && vv.width, document.documentElement.clientWidth]
      .filter((v) => typeof v === 'number' && v > 120);
    const h = [window.innerHeight, vv && vv.height, document.documentElement.clientHeight]
      .filter((v) => typeof v === 'number' && v > 120);
    // A frame that is display:none or zero-sized reports 0 for every one of
    // those, the filter empties, and Math.min() of an EMPTY list is Infinity.
    // That went into the logical canvas size and left the drawing transform at
    // scale 0: a canvas of exactly the right size that paints nothing, and goes
    // on painting nothing after the frame is shown. Measured on 2026-08-21 in a
    // hidden iframe revealed at 700x390, which is an ordinary way for a partner
    // site to place a game (a closed accordion, an inactive tab panel).
    if (!w.length || !h.length) { viewportWasBlind = true; return { w: 390, h: 700 }; }
    return { w: Math.round(Math.min(...w)), h: Math.round(Math.min(...h)) };
  }
  function buildMobileCFG() {
    const _vp = safeViewport();
    const vw = _vp.w;
    const vh = _vp.h;
    const HUD_H        = 70;
    const GRID_TOP_GAP = 8;
    const SIDE_PAD     = 12;
    // These reserves are fixed pixel bands. On a short viewport — a small phone
    // held in landscape — they add up to more than the screen and PLAY_H came
    // out NEGATIVE, which piled every dot on top of the HUD and made a negative
    // radius on line ~329. Buy the playfield back out of the optional bands,
    // banner first; every draw path already handles BANNER_H === 0, because
    // that is how the desktop config runs.
    const MIN_PLAY = 110;                 // measured: 114 still plays comfortably
    let BANNER_H = 50, HINT_AREA = CTRL_BAND, BOTTOM_PAD = 22;
    const playFor = () => vh - HUD_H - GRID_TOP_GAP - HINT_AREA - BANNER_H - BOTTOM_PAD;
    if (playFor() < MIN_PLAY) BANNER_H = 0;
    if (playFor() < MIN_PLAY) { HINT_AREA = 0; BOTTOM_PAD = 10; }
    document.body.style.setProperty('--canvas-w', vw + 'px');
    document.body.style.setProperty('--canvas-h', vh + 'px');
    return {
      W: vw, H: vh, HUD_H,
      PLAY_X: SIDE_PAD,
      PLAY_Y: HUD_H + GRID_TOP_GAP,
      PLAY_W: Math.max(80, vw - SIDE_PAD * 2),
      PLAY_H: Math.max(80, playFor()),
      VERTEX_R: 14,
      VERTEX_HIT: 28,
      BANNER_W: BANNER_H > 0 ? 320 : 0, BANNER_H,
      BANNER_Y: BANNER_H > 0 ? vh - BANNER_H - BOTTOM_PAD : vh,
    };
  }
  const CFG = MODE === 'mobile' ? buildMobileCFG() : (() => {
    const W = 760, H = 600, HUD_H = 70;
    document.body.style.setProperty('--canvas-w', W + 'px');
    document.body.style.setProperty('--canvas-h', H + 'px');
    return {
      W, H, HUD_H,
      PLAY_X: 44,
      PLAY_Y: HUD_H + 8,
      PLAY_W: W - 88,
      PLAY_H: H - HUD_H - 8 - CTRL_BAND - 8,
      VERTEX_R: 12,
      VERTEX_HIT: 22,
      BANNER_W: 0, BANNER_H: 0,
      BANNER_Y: H,
    };
  })();

  if (MODE === 'mobile') {
    let wasPortrait = window.innerHeight > window.innerWidth;
    window.addEventListener('resize', () => {
      const nowPortrait = window.innerHeight > window.innerWidth;
      if (wasPortrait !== nowPortrait) { wasPortrait = nowPortrait; location.reload(); }
    });
  }

  // Recovery from a blind boot. The layout above was baked from a viewport that
  // could not be read, and every size downstream of CFG is fixed at load, so a
  // reload is the only way to correct it.
  //
  // Nothing event-driven can be trusted to tell us the frame became real.
  // Measured on 2026-08-21: an iframe going from display:none at 0x0 to visible
  // at 700x390 fires ZERO resize events on its own window even though
  // innerWidth goes 0 -> 700, and a ResizeObserver on the document element
  // fired in one of six trials. A display:none document has no layout box and
  // no animation frames, so a short poll is the only reliable signal. It is
  // installed ONLY on a boot that already failed, stops the moment it works,
  // and gives up after a minute so nothing is left running.
  if (viewportWasBlind) {
    let recovered = false;
    const stopAt = 240;                 // 240 x 250ms = 60s
    let ticks = 0;
    const recoverFromBlindBoot = () => {
      if (recovered) return;
      if (window.innerWidth <= 120 || window.innerHeight <= 120) {
        if (++ticks < stopAt) return;
        clearInterval(poll);
        return;
      }
      recovered = true;
      clearInterval(poll);
      location.reload();
    };
    const poll = setInterval(recoverFromBlindBoot, 250);
    window.addEventListener('resize', recoverFromBlindBoot);
    if (window.ResizeObserver) {
      new ResizeObserver(recoverFromBlindBoot).observe(document.documentElement);
    }
  }

  // ---------- CANVAS + SHARP-DPR ----------
  const canvas = document.getElementById('game');
  const ctx    = canvas.getContext('2d');
  const W = CFG.W, H = CFG.H;
  canvas.setAttribute('width', String(W));
  canvas.setAttribute('height', String(H));
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const displayW = rect.width  || W;
    const displayH = rect.height || H;
    const backingW = Math.round(displayW * dpr);
    const backingH = Math.round(displayH * dpr);
    if (canvas.width !== backingW)  canvas.width  = backingW;
    if (canvas.height !== backingH) canvas.height = backingH;
    const scale = Math.min(backingW / W, backingH / H);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // ---------- ROBUST FULL-SCREEN FIT (any browser / OS) ----------
  // Desktop focus-mode sizing in shared chrome.css uses 100dvh / 100vw aspect
  // math, which some browsers (notably Firefox) evaluate against the wrong
  // viewport — over-scaling the canvas so the bottom vertices fall off-screen.
  // Override the game-wrap with a pixel size from JS-measured innerWidth/
  // innerHeight (reliable everywhere): the largest W:H-aspect rect that fits
  // the viewport, centred. Mobile auto-focus is left to the CSS as-is.
  const gameWrap = canvas.parentElement;
  function fitFullscreen() {
    // Re-publish the vars the CSS sizes the wrap from. CFG's logical W/H are
    // baked at load, so if that first reading was wrong these stayed wrong and
    // the CSS kept computing a strip from them for the whole session.
    if (MODE === 'mobile') {
      const vp = safeViewport();
      document.body.style.setProperty('--canvas-w', vp.w + 'px');
      document.body.style.setProperty('--canvas-h', vp.h + 'px');
    }
    const active = MODE === 'desktop' && document.body.classList.contains('focus-mode');
    if (!active) {
      gameWrap.style.width = '';
      gameWrap.style.height = '';
    } else {
      const vw = window.innerWidth, vh = window.innerHeight, aspect = W / H;
      let cw = vw, ch = Math.round(vw / aspect);
      if (ch > vh) { ch = vh; cw = Math.round(vh * aspect); }
      gameWrap.style.width  = cw + 'px';
      gameWrap.style.height = ch + 'px';
    }
    resizeCanvas();
  }
  window.addEventListener('resize', fitFullscreen);
  // Re-fit on everything a handset actually changes size on. Dispatching the
  // existing resize event reuses every handler already registered above rather
  // than restating their order here. Timers, not rAF: rAF is throttled to
  // nothing in some embedded browsers.
  (() => {
    const refit = () => window.dispatchEvent(new Event('resize'));
    setTimeout(refit, 0);
    setTimeout(refit, 300);
    window.addEventListener('load', refit);
    window.addEventListener('splash-done', refit);
    window.addEventListener('orientationchange', () => setTimeout(refit, 100));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);
  })();

  fitFullscreen();

  // ---------- GEOMETRY ----------
  const HUD_H     = CFG.HUD_H;
  const PLAY_X    = CFG.PLAY_X;
  const PLAY_Y    = CFG.PLAY_Y;
  const PLAY_W    = CFG.PLAY_W;
  const PLAY_H    = CFG.PLAY_H;
  const PLAY_CX   = PLAY_X + PLAY_W / 2;
  const PLAY_CY   = PLAY_Y + PLAY_H / 2;
  const VERTEX_R  = CFG.VERTEX_R;
  const VERTEX_HIT = CFG.VERTEX_HIT;
  const MARGIN    = VERTEX_R + 8;
  const BANNER_W  = CFG.BANNER_W;
  const BANNER_H  = CFG.BANNER_H;
  const BANNER_X  = Math.floor((W - BANNER_W) / 2);
  const BANNER_Y  = CFG.BANNER_Y;

  // ---------- PALETTE — Dark Portal ----------
  const C = {
    bg:         '#131F36',
    playfield:  '#1A2A45',
    text:       '#FFFFFF',
    textDim:    '#C5CFE0',
    textMute:   '#8E9CB5',
    // Two accents, because one value cannot serve both uses. accent is a FILL
    // under white type, so it has to be dark enough (white on it, 4.85:1).
    // accentHi is the accent AS TEXT on the dark page, so it has to be light
    // enough (5.88:1 on bg). Swapping them fails both.
    accent:     '#C24A39',
    accentHi:   '#FF6B5C',
    aligned:    '#5DD39E',
    panel:      '#1A2A45',
    panel2:     '#22355A',
    line:       'rgba(255, 255, 255, 0.08)',
    edgeOK:     '#7E94B5',
    edgeCross:  '#FF6B5C',
    vertexDrag: '#FFD23F',
    crossDot:   '#FFD23F',
    overlay:    'rgba(14, 23, 38, 0.92)',
  };

  // U6: three of these sat under the 3:1 bar for a graphical object against the
  // playfield, #C2185B at 2.45, #7E57C2 at 2.76 and #3D5AFE at 2.80. Dot colour
  // carries no meaning in this game, so it was legibility rather than information
  // loss, but a dot you cannot see is a dot you cannot grab. Each was lifted along
  // its own hue to 3.30, matching the comfort of #00897B, which was already the
  // lowest passing one. All twelve now clear the bar and the tightest pair among
  // them is dE 14.9, so nothing became confusable in the process.
  const VERTEX_PALETTE = [
    '#E84855', '#506AFE', '#FFD23F', '#00897B',
    '#D85B0E', '#8A67C8', '#5DD39E', '#CE477C',
    '#4ECDC4', '#F4A261', '#B084CC', '#FF6B9D',
  ];

  // ---------- SEEDED PRNG ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  let rng = Math.random;

  // ---------- LEVEL CURVE ----------
  // Each level is a fixed (N, edges, perturbPct, name). Past level 38 the
  // tier stays MASTER but the seed advances, so the puzzles keep changing.
  function tierForLevel(level) {
    if (level <= 2)  return { name: 'TUTORIAL', N: 5,  edges: 7,  perturbPct: 0.45 };
    if (level <= 4)  return { name: 'BASIC',    N: 6,  edges: 9,  perturbPct: 0.55 };
    if (level <= 7)  return { name: 'EASY',     N: 7,  edges: 11, perturbPct: 0.60 };
    if (level <= 11) return { name: 'MEDIUM',   N: 8,  edges: 13, perturbPct: 0.65 };
    if (level <= 16) return { name: 'HARD',     N: 9,  edges: 15, perturbPct: 0.70 };
    if (level <= 22) return { name: 'HARDER',   N: 10, edges: 17, perturbPct: 0.75 };
    if (level <= 30) return { name: 'EXPERT',   N: 11, edges: 19, perturbPct: 0.80 };
    return                  { name: 'MASTER',   N: 12, edges: 21, perturbPct: 0.85 };
  }

  function levelSeedString(level) {
    return 'zamborin-untangle-level-' + level;
  }

  // The TUTORIAL tier is 5 dots with only 2 of them moved, which frequently
  // perturbs into a board that has ZERO crossings — a puzzle already solved.
  // Counted across three play areas: old levels 1 and 2 each came out solved on
  // at least one common screen size (and both did on a 320px phone), while
  // every level from 3 upward has real crossings everywhere. So the curve now
  // starts at what used to be level 3; the player still sees "Level 1".
  // Declared here, above `runTier`, which reads it at load.
  const LEVEL_OFFSET = 2;
  const genLevelFor = (level) => level + LEVEL_OFFSET;

  // ---------- GRAPH GENERATION ----------
  function chordsCrossOnCircle(a, b, c, d) {
    if (a > b) { const t = a; a = b; b = t; }
    if (c > d) { const t = c; c = d; d = t; }
    if (a === c || a === d || b === c || b === d) return false;
    const cIn = c > a && c < b;
    const dIn = d > a && d < b;
    return cIn !== dIn;
  }
  function generateGraphTopology(N, targetEdges) {
    const edges = [];
    const seen  = new Set();
    const key   = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
    function addEdge(a, b) {
      const k = key(a, b);
      if (seen.has(k)) return false;
      seen.add(k);
      edges.push([Math.min(a, b), Math.max(a, b)]);
      return true;
    }
    for (let i = 0; i < N; i++) addEdge(i, (i + 1) % N);
    let attempts = 0;
    while (edges.length < targetEdges && attempts < targetEdges * 30) {
      attempts++;
      const a = Math.floor(rng() * N);
      const b = Math.floor(rng() * N);
      if (a === b || seen.has(key(a, b))) continue;
      let crosses = false;
      for (const [c, d] of edges) if (chordsCrossOnCircle(a, b, c, d)) { crosses = true; break; }
      if (!crosses) addEdge(a, b);
    }
    return edges;
  }

  // ---------- LINE-SEGMENT INTERSECTION ----------
  function ccw(ax, ay, bx, by, cx, cy) {
    return (cy - ay) * (bx - ax) - (by - ay) * (cx - ax);
  }
  function segmentsCross(p1, p2, p3, p4) {
    if (p1 === p3 || p1 === p4 || p2 === p3 || p2 === p4) return false;
    const d1 = ccw(p3.x, p3.y, p4.x, p4.y, p1.x, p1.y);
    const d2 = ccw(p3.x, p3.y, p4.x, p4.y, p2.x, p2.y);
    const d3 = ccw(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    const d4 = ccw(p1.x, p1.y, p2.x, p2.y, p4.x, p4.y);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
           ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }
  function segIntersectionPoint(p1, p2, p3, p4) {
    const x1=p1.x, y1=p1.y, x2=p2.x, y2=p2.y, x3=p3.x, y3=p3.y, x4=p4.x, y4=p4.y;
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (denom === 0) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  }

  // ---------- AUDIO ----------
  // Lazy-init on first user gesture (browser autoplay policy).
  let audioCtx = null;
  let soundOn = localStorage.getItem('zamborin-untangle.sound') !== '0';
  function ensureAudio() {
    if (audioCtx) return;
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (_) { audioCtx = null; }
  }
  function setSound(on) {
    soundOn = on;
    try { localStorage.setItem('zamborin-untangle.sound', on ? '1' : '0'); } catch (_) {}
  }
  function tone(freq, dur, gain, type) {
    if (!soundOn || !audioCtx) return;
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  function sfxPickup()  { tone(680, 0.06, 0.035, 'sine'); }
  function sfxDrop()    { tone(420, 0.08, 0.04,  'sine'); }
  function sfxResolve() { tone(900, 0.09, 0.045, 'triangle'); }
  function sfxStart()   { tone(523, 0.10, 0.05,  'triangle'); setTimeout(() => tone(784, 0.12, 0.05, 'triangle'), 80); }
  function sfxWin() {
    tone(523, 0.13, 0.06, 'triangle');
    setTimeout(() => tone(659, 0.13, 0.06, 'triangle'),  90);
    setTimeout(() => tone(784, 0.13, 0.06, 'triangle'), 180);
    setTimeout(() => tone(1047, 0.22, 0.07,'triangle'), 280);
  }

  // ---------- STATE ----------
  let scene = 'instructions';   // 'instructions' | 'playing' | 'won'
  let awaitingStart = true;
  let edges = [];
  let pos   = [];
  let N = 9;
  let par = 0;
  let moves = 0;

  let runLevel = parseInt(localStorage.getItem('zamborin-untangle.level') || '1', 10);
  if (!Number.isFinite(runLevel) || runLevel < 1) runLevel = 1;
  let runTier = tierForLevel(genLevelFor(runLevel));

  let highestLevel = parseInt(localStorage.getItem('zamborin-untangle.highest') || '1', 10);
  if (!Number.isFinite(highestLevel) || highestLevel < 1) highestLevel = 1;

  let truePositions = [];   // the planar layout every level is scrambled FROM
  let history   = [];       // one entry per counted drag: where that dot was
  let uiButtons = [];       // rebuilt every frame by drawControls()
  let dragIdx   = -1;
  let dragOrigin = null;
  let dragMovedFar = false;
  let crossingsAtPress = 0;

  function bestKey(level) { return 'zamborin-untangle.best.L' + level; }
  function getBest(level) {
    const v = parseInt(localStorage.getItem(bestKey(level)) || '0', 10);
    return v > 0 ? v : null;
  }
  let bestThisLevel = getBest(runLevel);

  const START_BTN = { x: 0, y: 0, w: 0, h: 0 };
  const SHARE_BTN = { x: 0, y: 0, w: 0, h: 0 };
  const NEXT_BTN  = { x: 0, y: 0, w: 0, h: 0 };
  function inRect(r, lx, ly) { return r.w > 0 && lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h; }

  // ---------- INIT ----------
  // ---------- analytics ----------
  // Fire and forget. T() returns a no-op stub when the shared module is absent
  // or blocked, so tracking can never throw into the game loop.
  const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){}, levelRestart(){}, hintUsed(){} };
  const T = () => (window.ZAM_TRACK || NOOP);
  T().init('untangle');

  function initLevel(level, isRestart) {
    runLevel = level;
    runTier  = tierForLevel(genLevelFor(level));
    rng = mulberry32(hashSeed(levelSeedString(genLevelFor(level))));
    N = runTier.N;
    edges = generateGraphTopology(N, runTier.edges);

    const radius = Math.min(PLAY_W, PLAY_H) / 2 - MARGIN;
    const truePos = [];
    truePositions = truePos;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * 2 * Math.PI - Math.PI / 2;
      truePos.push({ x: PLAY_CX + Math.cos(a) * radius, y: PLAY_CY + Math.sin(a) * radius });
    }

    const perturbCount = Math.max(2, Math.round(N * runTier.perturbPct));
    const order = [];
    for (let i = 0; i < N; i++) order.push(i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    const toMove = new Set(order.slice(0, perturbCount));
    pos = truePos.map(p => ({ x: p.x, y: p.y }));
    for (const i of toMove) {
      pos[i] = {
        x: PLAY_X + MARGIN + rng() * (PLAY_W - MARGIN * 2),
        y: PLAY_Y + MARGIN + rng() * (PLAY_H - MARGIN * 2),
      };
    }
    par = perturbCount;
    moves = 0;
    history = [];
    scene = 'playing';
    if (!isRestart) T().gameStart();
    dragIdx = -1;
    bestThisLevel = getBest(runLevel);
    try { localStorage.setItem('zamborin-untangle.level', String(runLevel)); } catch (_) {}
    T().levelStart(runLevel);
  }

  // ---------- CROSSING DETECTION ----------
  function detectCrossings() {
    const edgeCrossing = new Array(edges.length).fill(false);
    const crossPoints  = [];
    for (let i = 0; i < edges.length; i++) {
      const [a, b] = edges[i];
      const p1 = pos[a], p2 = pos[b];
      for (let j = i + 1; j < edges.length; j++) {
        const [c, d] = edges[j];
        if (a === c || a === d || b === c || b === d) continue;
        const p3 = pos[c], p4 = pos[d];
        if (segmentsCross(p1, p2, p3, p4)) {
          edgeCrossing[i] = true;
          edgeCrossing[j] = true;
          const pt = segIntersectionPoint(p1, p2, p3, p4);
          if (pt) crossPoints.push(pt);
        }
      }
    }
    return { crossings: crossPoints.length, edgeCrossing, crossPoints };
  }

  // ---------- INPUT ----------
  function logical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      lx: ((clientX - rect.left) / rect.width)  * W,
      ly: ((clientY - rect.top)  / rect.height) * H,
    };
  }
  function vertexAt(lx, ly) {
    let best = -1, bestDist = VERTEX_HIT * VERTEX_HIT;
    for (let i = 0; i < N; i++) {
      const dx = lx - pos[i].x, dy = ly - pos[i].y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestDist) { bestDist = d2; best = i; }
    }
    return best;
  }
  function clampToPlayfield(p) {
    p.x = Math.max(PLAY_X + MARGIN, Math.min(PLAY_X + PLAY_W - MARGIN, p.x));
    p.y = Math.max(PLAY_Y + MARGIN, Math.min(PLAY_Y + PLAY_H - MARGIN, p.y));
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ensureAudio();
    const { lx, ly } = logical(e.clientX, e.clientY);

    // The control row is live in every scene, so it is tested before anything
    // else. Its hit boxes are whatever drawControls() last drew.
    for (const b of uiButtons) {
      if (inRect(b, lx, ly)) { b.act(); return; }
    }

    if (awaitingStart) {
      if (inRect(START_BTN, lx, ly)) {
        awaitingStart = false;
        sfxStart();
        initLevel(runLevel);
      }
      return;
    }
    if (scene === 'won') {
      if (inRect(NEXT_BTN, lx, ly))  { initLevel(runLevel + 1); return; }
      if (SHARE_BTN.w > 0 && inRect(SHARE_BTN, lx, ly)) { copyShareString(); return; }
      return;
    }
    if (scene !== 'playing') return;
    const idx = vertexAt(lx, ly);
    if (idx === -1) return;
    dragIdx = idx;
    dragOrigin = { x: pos[idx].x, y: pos[idx].y };
    dragMovedFar = false;
    crossingsAtPress = detectCrossings().crossings;
    sfxPickup();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragIdx === -1) return;
    e.preventDefault();
    const { lx, ly } = logical(e.clientX, e.clientY);
    pos[dragIdx].x = lx;
    pos[dragIdx].y = ly;
    clampToPlayfield(pos[dragIdx]);
    const dx = pos[dragIdx].x - dragOrigin.x;
    const dy = pos[dragIdx].y - dragOrigin.y;
    if (dx * dx + dy * dy > 4 * 4) dragMovedFar = true;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (dragIdx === -1) return;
    e.preventDefault();
    if (dragMovedFar) {
      history.push({ i: dragIdx, x: dragOrigin.x, y: dragOrigin.y });
      moves++;
      const after = detectCrossings().crossings;
      if (after === 0) {
        sfxWin();
        onWin();
      } else if (after < crossingsAtPress) {
        sfxResolve();
      } else {
        sfxDrop();
      }
    }
    dragIdx = -1; dragOrigin = null; dragMovedFar = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointercancel', () => {
    dragIdx = -1; dragOrigin = null; dragMovedFar = false;
  });

  window.addEventListener('keydown', (e) => {
    if (!awaitingStart && scene === 'playing' && (e.key === 'z' || e.key === 'Z')) { undo(); return; }
    if (!awaitingStart && scene === 'playing' && (e.key === 'r' || e.key === 'R')) { restart(); return; }
    if (e.key === 'm' || e.key === 'M') {
      ensureAudio();
      setSound(!soundOn);
      if (soundOn) tone(660, 0.06, 0.04, 'sine');
      return;
    }
    if (awaitingStart && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); ensureAudio(); awaitingStart = false; sfxStart(); initLevel(runLevel); return;
    }
    if (scene === 'won' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); initLevel(runLevel + 1);
    }
  });

  // An undo COSTS a move, which is the rule Prism, Sluice, Bloom and Orbit all
  // settled on for a game with a scored counter. It is also the honest price:
  // dragging the dot back by hand costs a move too, so undo buys exactness, not
  // a discount. A clean run is what Restart is for.
  function undo() {
    if (scene !== 'playing' || !history.length) return;
    const h = history.pop();
    pos[h.i].x = h.x; pos[h.i].y = h.y;
    moves++;
    sfxDrop();
  }
  function restart() {
    if (awaitingStart || scene === 'won') return;
    T().levelRestart(runLevel);
    initLevel(runLevel, true);
    sfxStart();
  }

  function onWin() {
    scene = 'won';
    T().levelComplete(runLevel, moves);
    if (bestThisLevel == null || moves < bestThisLevel) {
      bestThisLevel = moves;
      try { localStorage.setItem(bestKey(runLevel), String(moves)); } catch (_) {}
    }
    if (runLevel + 1 > highestLevel) {
      highestLevel = runLevel + 1;
      try { localStorage.setItem('zamborin-untangle.highest', String(highestLevel)); } catch (_) {}
    }
    try { localStorage.setItem('zamborin-untangle.level', String(runLevel + 1)); } catch (_) {}
  }

  // ---------- DRAWING ----------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  // The house speaker glyph, drawn INTO a pill rather than into a box of its
  // own. Identical to Prism's, deliberately.
  function speakerIcon(cx, cy, on) {
    const s = 8;
    ctx.save();
    ctx.strokeStyle = on ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.40)';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.8, cy - s * 0.3); ctx.lineTo(cx - s * 0.35, cy - s * 0.3);
    ctx.lineTo(cx + s * 0.15, cy - s * 0.75); ctx.lineTo(cx + s * 0.15, cy + s * 0.75);
    ctx.lineTo(cx - s * 0.35, cy + s * 0.3); ctx.lineTo(cx - s * 0.8, cy + s * 0.3);
    ctx.closePath(); ctx.fill();
    if (on) {
      ctx.beginPath(); ctx.arc(cx + s * 0.35, cy, s * 0.42, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + s * 0.35, cy, s * 0.78, -0.85, 0.85); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(cx + s * 0.42, cy - s * 0.42); ctx.lineTo(cx + s * 1.0, cy + s * 0.42);
      ctx.moveTo(cx + s * 1.0, cy - s * 0.42); ctx.lineTo(cx + s * 0.42, cy + s * 0.42); ctx.stroke();
    }
    ctx.restore();
  }

  // The control band sits under the playfield during play, which on a phone is
  // also where a thumb is; that is why Prism keeps its row at the bottom rather
  // than in the top band.
  //
  // On the instructions screen there IS no playfield, so the row drops to the
  // bottom of the frame and hands the whole height back to the card. Measured:
  // on a 320px-tall frame, a small phone turned sideways, that is the
  // difference between the card fitting and clipping by 10px.
  function ctrlCY(forMenu) {
    /* `forMenu` exists because rulesFit() has to answer "what would the card
       look like when it is shown", and the card is only ever shown while
       awaitingStart. Reading it after goto() otherwise measures a control row
       in its PLAY position against a card that is not on screen, which reports
       failures that cannot happen. Found doing exactly that on 2026-08-22. */
    if (forMenu || awaitingStart) {
      const adsOn = document.body.classList.contains('ads-on');
      const bot = (BANNER_H > 0 && adsOn) ? BANNER_Y - 8 : H - 8;
      return Math.round(bot - UI.PILL.h / 2);
    }
    return Math.round(PLAY_Y + PLAY_H + 8 + UI.PILL.h / 2);
  }
  function ctrlTop(forMenu) { return ctrlCY(forMenu) - UI.PILL.h / 2; }

  // Sizes come from shared/ui.js. Rebuilt every frame, because the hit boxes
  // ARE what was drawn: there is no second list to keep in step.
  function drawControls() {
    uiButtons = [];
    const playing = !awaitingStart && scene === 'playing';
    const gap = UI.PILL.gap, wS = UI.PILL.iconW;
    const wU = UI.pillWidth(ctx, 'Undo'), wR = UI.pillWidth(ctx, 'Restart');
    const total = playing ? wS + gap + wU + gap + wR : wS;
    const cy = ctrlCY();
    let x = Math.round(W / 2 - total / 2);

    const s = UI.drawPill(ctx, '', x + wS / 2, cy, { w: wS });
    speakerIcon(x + wS / 2, cy, soundOn);
    uiButtons.push(Object.assign({}, s, { act: () => {
      ensureAudio(); setSound(!soundOn);
      if (soundOn) tone(660, 0.06, 0.04, 'sine');
    } }));
    if (!playing) return;
    x += wS + gap;
    uiButtons.push(Object.assign({}, UI.drawPill(ctx, 'Undo', x + wU / 2, cy, { w: wU, dim: !history.length }), { act: undo }));
    x += wU + gap;
    uiButtons.push(Object.assign({}, UI.drawPill(ctx, 'Restart', x + wR / 2, cy, { w: wR, dim: !moves }), { act: restart }));
  }

  function drawHUD() {
    // LEFT: MOVES
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = C.textMute;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('MOVES', PLAY_X, 18);
    ctx.font = '800 24px Inter, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(moves), PLAY_X, 42);

    // CENTER: LEVEL + tier name
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = C.textMute;
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL', W / 2, 18);
    ctx.font = '800 24px Inter, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(runLevel), W / 2, 42);
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = C.accentHi;
    ctx.fillText(runTier.name, W / 2, 60);

    // RIGHT: PAR
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = C.textMute;
    ctx.textAlign = 'right';
    ctx.fillText('PAR', PLAY_X + PLAY_W, 18);
    ctx.font = '800 24px Inter, sans-serif';
    ctx.fillStyle = moves > par ? C.accentHi : C.text;
    ctx.fillText(String(par), PLAY_X + PLAY_W, 42);
  }

  function drawPlayfield() {
    ctx.fillStyle = C.playfield;
    roundRect(PLAY_X - 6, PLAY_Y - 6, PLAY_W + 12, PLAY_H + 12, 14);
    ctx.fill();
  }

  function drawEdges(now, crossInfo) {
    const pulse = 0.55 + 0.45 * Math.sin(now / 280);
    for (let i = 0; i < edges.length; i++) {
      const [a, b] = edges[i];
      const p1 = pos[a], p2 = pos[b];
      const crossing = crossInfo.edgeCrossing[i];
      if (crossing) {
        ctx.save();
        ctx.shadowColor = C.accentHi;
        ctx.shadowBlur = 8 + 6 * pulse;
        ctx.strokeStyle = C.edgeCross;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        ctx.restore();
      } else {
        ctx.save();
        ctx.shadowColor = 'rgba(101, 119, 255, 0.35)';
        ctx.shadowBlur = 4;
        ctx.strokeStyle = C.edgeOK;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawCrossDots(crossInfo) {
    for (const pt of crossInfo.crossPoints) {
      ctx.fillStyle = C.crossDot;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawVertices(now) {
    const pulse = 0.6 + 0.4 * Math.sin(now / 320);
    for (let i = 0; i < N; i++) {
      const p = pos[i];
      const isDrag = i === dragIdx;
      const baseColor = VERTEX_PALETTE[i % VERTEX_PALETTE.length];
      ctx.save();
      ctx.shadowColor = isDrag ? C.vertexDrag : baseColor;
      ctx.shadowBlur = isDrag ? (10 + 6 * pulse) : 8;
      ctx.fillStyle = isDrag ? C.vertexDrag : baseColor;
      ctx.beginPath(); ctx.arc(p.x, p.y, VERTEX_R, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = isDrag ? '#FFEAB4' : 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath(); ctx.arc(p.x - VERTEX_R * 0.25, p.y - VERTEX_R * 0.25, VERTEX_R * 0.35, 0, Math.PI * 2); ctx.fill();
    }
  }

  // The dashed box is a PLACEHOLDER for an ad that is not running. The site's
  // switch for that is `body.ads-on`, which every HTML ad slot already respects
  // and which nothing currently sets; this canvas box was the one place that
  // ignored it, so a phone player saw an empty "AD" rectangle under the board.
  // The band stays reserved either way, so turning ads on is still a visual
  // no-op rather than a re-layout.
  function drawBannerAd() {
    if (BANNER_H === 0) return;
    if (!document.body.classList.contains('ads-on')) return;
    ctx.fillStyle = C.panel;
    roundRect(BANNER_X, BANNER_Y, BANNER_W, BANNER_H, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    roundRect(BANNER_X + 0.5, BANNER_Y + 0.5, BANNER_W - 1, BANNER_H - 1, 8);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = C.textMute;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('AD · 320 × 50', BANNER_X + BANNER_W / 2, BANNER_Y + BANNER_H / 2);
  }

  // ---------- INSTRUCTIONS ----------
  // Layout is computed in ONE place so the fit detector below reports the same
  // numbers the draw code uses. Six other games shipped a card whose geometry
  // lived only inside the draw call, and the overlap they all carried went
  // unseen for months because nothing could measure it.
  const RULES = [
    'Drag any dot to move it.',
    'Edges that cross another edge pulse red.',
    'Goal: remove every crossing.',
    'Each level adds more dots and edges.',
  ];
  // How far a string reaches ABOVE its own centre, at the size given. Ascent is
  // linear in font size for one face, so measuring once at full size is enough
  // to know the extent at any scale.
  function ascentAbove(px, weight, str) {
    const f = ctx.font, b = ctx.textBaseline;
    ctx.font = weight + ' ' + px + 'px Inter, sans-serif';
    ctx.textBaseline = 'middle';
    const a = ctx.measureText(str).actualBoundingBoxAscent || px * 0.36;
    ctx.font = f; ctx.textBaseline = b;
    return a;
  }

  // The card is a stack of fixed offsets either side of the frame's centre, so
  // on a SHORT frame it runs off the TOP rather than overlapping itself: at a
  // 360px-tall frame, a phone held sideways or a 480x360 embed, the measured
  // overhang was 35px, which takes the whole "HOW TO PLAY" line and the top of
  // the title with it. Nothing here was clamped, so nothing detected it.
  //
  // Two stages, in the order Kaleido and Stained settled on: shrink the copy
  // first, and once shrinking further would take it under the legibility floor,
  // DROP the decorative eyebrow outright rather than keep it too small to read.
  // The button never scales: it is a house size and a touch target.
  const SHRINK_BEFORE_DROP = 0.85;   // below this, lose the eyebrow instead
  const SCALE_FLOOR        = 0.72;   // never smaller, whatever the frame
  function ctaLabel() { return runLevel > 1 ? 'CONTINUE' : 'START'; }
  function instructionsLayout() {
    const midX    = W / 2;
    // The card owns the space ABOVE the control band, not the whole frame: the
    // speaker pill is drawn in that band on this screen too.
    const playBot = ctrlTop(true) - 8;
    const midY    = playBot / 2;
    const btnW = UI.ctaWidth(ctx, ctaLabel());
    const btnH = UI.CTA.h;
    const titleSize0 = MODE === 'mobile' ? 32 : 36;

    // Natural extents at full size, as distances from the centre.
    const topWithEyebrow = 170 + ascentAbove(11, '700', 'HOW TO PLAY');
    const topTitleOnly   = 130 + ascentAbove(titleSize0, '800', 'Untangle');
    // One pixel of real clearance, not a knife-edge: solving for exactly zero
    // leaves the top on the frame edge, where floating point decides whether it
    // is on or off and a half-pixel of antialiasing is clipped either way.
    const PAD = 1;
    const fitFor = (topNat) => Math.min(1, (midY - PAD) / topNat, (midY - btnH - PAD) / 78);

    let showEyebrow = true;
    let s = fitFor(topWithEyebrow);
    if (s < SHRINK_BEFORE_DROP) { showEyebrow = false; s = fitFor(topTitleOnly); }
    s = Math.max(SCALE_FLOOR, Math.min(1, s));

    const lineH    = 26 * s;
    const rulesTop = midY - 60 * s;
    const resumeY  = rulesTop + RULES.length * lineH + 12 * s;
    return {
      midX, playBot, midY, lineH, rulesTop, resumeY,
      scale: s,
      showEyebrow,
      eyebrowY: midY - 170 * s,
      titleY:   midY - 130 * s,
      titleSize: Math.round(titleSize0 * s),
      ruleSize:  Math.round(16 * s),
      labelSize: Math.max(9, Math.round(11 * s)),
      btnW, btnH,
      btnY: resumeY + 22 * s,
      btnX: midX - btnW / 2,
    };
  }
  function drawInstructions() {
    const L = instructionsLayout();
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, L.playBot);

    const midX = L.midX;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (L.showEyebrow) {
      ctx.font = '700 ' + L.labelSize + 'px Inter, sans-serif';
      ctx.fillStyle = C.accentHi;
      ctx.fillText('HOW TO PLAY', midX, L.eyebrowY);
    }

    ctx.font = '800 ' + L.titleSize + 'px Inter, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText('Untangle', midX, L.titleY);

    ctx.font = '500 ' + L.ruleSize + 'px Inter, sans-serif';
    ctx.fillStyle = C.textDim;
    for (let i = 0; i < RULES.length; i++) ctx.fillText(RULES[i], midX, L.rulesTop + i * L.lineH);

    // Show resume / new label
    ctx.font = '700 ' + L.labelSize + 'px Inter, sans-serif';
    ctx.fillStyle = C.textMute;
    if (runLevel > 1) {
      ctx.fillText('RESUMING AT LEVEL ' + runLevel + ' · ' + runTier.name, midX, L.resumeY);
    } else {
      ctx.fillText('STARTING AT LEVEL 1 · ' + tierForLevel(genLevelFor(1)).name, midX, L.resumeY);
    }

    const box = UI.drawCTA(ctx, ctaLabel(), midX, L.btnY + L.btnH / 2, C.accent);
    START_BTN.x = box.x; START_BTN.y = box.y; START_BTN.w = box.w; START_BTN.h = box.h;
  }

  // ---------- WIN ----------
  function px(base, s) { return Math.max(8, Math.round(base * s)); }

  // Same discipline as the rules card, for the same reason: this card is a
  // stack of fixed offsets around the middle of the PLAYFIELD PANEL, and the
  // panel is only PLAY_H tall. Measured before scaling, it needed PLAY_H >= 380
  // and so spilled out of the frosted panel on any frame under about 578px
  // tall, which is a small phone in portrait as well as every phone in
  // landscape. It stayed readable, spilling onto a background of nearly the
  // same colour, but it collided with the HUD above and the control row below.
  //
  // Buttons never scale. Where scaling alone cannot make room, the SHARE pill
  // is dropped rather than the card being squeezed further.
  const WIN_DROP_SHARE_BELOW = 0.80;
  const WIN_SCALE_FLOOR      = 0.72;
  function winLayout() {
    const topNat = 158;                   // eyebrow centre 150 up, plus its ascent
    // Below the CTA: 64*s to the button, then fixed button heights, then the
    // scaled gaps around them.
    const solveIn = (half) => {
      const fitWith    = Math.min(1, (half - 8) / topNat, (half - 8 - UI.CTA.h - UI.PILL.h) / (64 + 12 + 22));
      const fitWithout = Math.min(1, (half - 8) / topNat, (half - 8 - UI.CTA.h) / (64 + 22));
      let showShare = true;
      let s = fitWith;
      if (s < WIN_DROP_SHARE_BELOW) { showShare = false; s = fitWithout; }
      return { s, showShare, fits: s >= WIN_SCALE_FLOOR };
    };

    // Preferred: inside the frosted playfield panel, so the untangled board is
    // still visible around the result.
    const panelHalf = PLAY_H / 2 + 6;
    const inPanel = solveIn(panelHalf);
    if (inPanel.fits) return build(PLAY_Y + PLAY_H / 2, panelHalf, inPanel, false);

    // THE CASE THE PANEL CANNOT COVER. On a phone held sideways the playfield is
    // a couple of hundred pixels tall and the two BUTTONS alone are 90 of it, so
    // no scale saves this: the card ran out of the panel at both ends and the
    // text landed on the HUD above and the control row below. Take the whole
    // frame instead, which is what Stained, Tessera and Kaleido all do when
    // their container is too small. Measured before this: overflowing on every
    // frame under 430px tall, by up to 51px.
    const frameHalf = H / 2 - 4;
    const inFrame = solveIn(frameHalf);
    return build(H / 2, frameHalf, inFrame, true);

    function build(midY, half, r, fullFrame) {
      const s = Math.max(WIN_SCALE_FLOOR, Math.min(1, r.s));
      const ctaY   = midY + 64 * s;
      const shareY = ctaY + UI.CTA.h + 12 * s;
      const hintY  = r.showShare ? shareY + UI.PILL.h + 22 * s : ctaY + UI.CTA.h + 22 * s;
      return { midY, half, scale: s, showShare: r.showShare, ctaY, shareY, hintY, fullFrame };
    }
  }

  function drawWon(now) {
    const LW_ = winLayout();
    ctx.fillStyle = C.overlay;
    if (LW_.fullFrame) {
      // No panel to sit in, so the scrim takes the frame and has to be opaque
      // enough to carry the copy on its own.
      ctx.fillStyle = 'rgba(14, 23, 38, 0.96)';
      ctx.fillRect(0, 0, W, H);
    } else {
      roundRect(PLAY_X - 6, PLAY_Y - 6, PLAY_W + 12, PLAY_H + 12, 14);
      ctx.fill();
    }

    const L = LW_;
    const midX = W / 2, midY = L.midY, s = L.scale;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = '700 ' + px(14, s) + 'px Inter, sans-serif';
    ctx.fillStyle = C.aligned;
    ctx.fillText('LEVEL ' + runLevel + ' UNTANGLED', midX, midY - 150 * s);

    ctx.font = '800 ' + px(56, s) + 'px Inter, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(moves), midX, midY - 88 * s);
    ctx.font = '500 ' + px(11, s) + 'px Inter, sans-serif';
    ctx.fillStyle = C.textDim;
    ctx.fillText('YOUR MOVES', midX, midY - 52 * s);

    ctx.font = '500 ' + px(24, s) + 'px Inter, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(par), midX, midY - 16 * s);
    ctx.font = '500 ' + px(11, s) + 'px Inter, sans-serif';
    ctx.fillStyle = C.textDim;
    ctx.fillText('PAR', midX, midY + 2 * s);

    let verdict, color;
    if (moves < par)        { verdict = 'UNDER PAR · BRILLIANT'; color = C.aligned; }
    else if (moves === par) { verdict = 'AT PAR'; color = C.aligned; }
    else if (moves <= par+2){ verdict = '+' + (moves - par) + ' OVER PAR · GREAT'; color = C.text; }
    else                    { verdict = '+' + (moves - par) + ' OVER PAR'; color = C.textDim; }
    ctx.font = '700 ' + px(13, s) + 'px Inter, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(verdict, midX, midY + 32 * s);

    // PRIMARY: NEXT LEVEL. Sizes from shared/ui.js, like every other primary
    // action on the site, and NOT scaled: a button is a touch target. Restart
    // is deliberately absent here, the level being finished.
    const nb = UI.drawCTA(ctx, 'NEXT LEVEL', midX, L.ctaY + UI.CTA.h / 2, C.accent);
    NEXT_BTN.x = nb.x; NEXT_BTN.y = nb.y; NEXT_BTN.w = nb.w; NEXT_BTN.h = nb.h;

    // SECONDARY: SHARE, as a control pill rather than a second loud button, and
    // dropped outright on a frame too short to hold both.
    if (L.showShare) {
      const sb = UI.drawPill(ctx, 'SHARE RESULT', midX, L.shareY + UI.PILL.h / 2);
      SHARE_BTN.x = sb.x; SHARE_BTN.y = sb.y; SHARE_BTN.w = sb.w; SHARE_BTN.h = sb.h;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    } else {
      SHARE_BTN.w = 0;
    }

    const pulse = 0.55 + 0.45 * Math.sin(now / 350);
    ctx.globalAlpha = pulse;
    ctx.font = '700 ' + px(11, s) + 'px Inter, sans-serif';
    ctx.fillStyle = C.textMute;
    ctx.fillText('PRESS ENTER FOR NEXT LEVEL', midX, L.hintY);
    ctx.globalAlpha = 1;
  }

  // ---------- SHARE ----------
  function homeURL() { return window.location.origin + window.location.pathname; }
  function buildSharePayload() {
    let verdict;
    if (moves < par)        verdict = 'under par by ' + (par - moves);
    else if (moves === par) verdict = 'at par';
    else                    verdict = '+' + (moves - par) + ' over par';
    const text = 'I untangled Level ' + runLevel + ' · ' + runTier.name + '\n'
               + moves + ' moves (par ' + par + ') · ' + verdict + '\n'
               + 'Untangle, a Zamborin Game';
    return { title: 'Untangle', text, url: homeURL() };
  }
  function copyShareString() {
    const payload = buildSharePayload();
    const flat = payload.text + '\n' + payload.url;
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = flat; ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (_) {}
    };
    if (navigator.share && (!navigator.canShare || navigator.canShare(payload))) {
      navigator.share(payload).catch((err) => {
        if (err && err.name === 'AbortError') return;
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(flat);
        else fallback();
      });
    } else if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(flat);
    } else fallback();
  }

  // ---------- LOOP ----------
  function loop(now) {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    if (awaitingStart) {
      drawInstructions();
      drawControls();
      drawBannerAd();
      requestAnimationFrame(loop);
      return;
    }

    drawHUD();
    drawPlayfield();
    const crossInfo = detectCrossings();
    drawEdges(now, crossInfo);
    drawCrossDots(crossInfo);
    drawVertices(now);
    drawControls();
    drawBannerAd();

    if (scene === 'won') drawWon(now);

    requestAnimationFrame(loop);
  }

  // ---------- DEBUG HANDLE ----------
  // Reporting for the QC pass, and the same shape the other games carry. The
  // important one is rulesFit(): the instructions card is laid out as fixed
  // offsets either side of the frame's centre, so on a short frame it runs off
  // the top rather than overlapping itself, and nothing else can see that.
  window.__untangle = {
    get mode()  { return MODE; },
    get level() { return runLevel; },
    get par()   { return par; },
    get moves() { return moves; },
    get scene() { return awaitingStart ? 'instructions' : scene; },
    frame() { return { W: W, H: H, playBot: instructionsLayout().playBot }; },
    crossings() { return detectCrossings().crossings; },
    rulesFit() {
      const L = instructionsLayout();
      const eyeTop = L.showEyebrow
        ? L.eyebrowY - ascentAbove(L.labelSize, '700', 'HOW TO PLAY')
        : Infinity;
      const titleTop = L.titleY - ascentAbove(L.titleSize, '800', 'Untangle');
      const top = Math.min(eyeTop, titleTop);
      const bottom = L.btnY + L.btnH;
      return {
        W: W, H: H, mode: MODE, playBot: L.playBot,
        scale: Math.round(L.scale * 1000) / 1000,
        eyebrow: L.showEyebrow,
        ruleSize: L.ruleSize,
        top: Math.round(top), bottom: Math.round(bottom),
        overTop:    Math.round(Math.max(0, -top)),
        overBottom: Math.round(Math.max(0, bottom - L.playBot)),
        fits: top >= 0 && bottom <= L.playBot,
      };
    },
    get moveHistory() { return history.length; },
    goto(n) {
      awaitingStart = false;
      initLevel(n);
      return { level: runLevel, par: par, crossings: detectCrossings().crossings };
    },
    undo() { const before = moves; undo(); return { moves: moves, changed: moves !== before, left: history.length }; },
    restart() { restart(); return { moves: moves, crossings: detectCrossings().crossings, history: history.length }; },
    // The dots, in logical canvas coordinates, so a test can drive a real drag
    // through the pointer handlers rather than reaching into the state.
    dots() { return pos.map(function (p) { return { x: p.x, y: p.y }; }); },
    // The control row's real hit boxes, so a sweep can assert they are on the
    // canvas and big enough to hit rather than merely that they were drawn.
    // Runs the draw, because the boxes ARE what was drawn; in a hidden document
    // the animation loop never fires and there would be nothing to report.
    controls() {
      drawControls();
      return uiButtons.map(function (b) {
        return { x: b.x, y: b.y, w: b.w, h: b.h,
                 onCanvas: b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H };
      });
    },
    // The win card's vertical extent against the playfield panel it is drawn
    // inside, at whatever scale winLayout() settled on.
    winFit() {
      const L = winLayout();
      const top = L.midY - 150 * L.scale - 8 * L.scale;
      const bottom = L.hintY + 8 * L.scale;
      const panelTop = L.fullFrame ? 0 : PLAY_Y - 6;
      const panelBot = L.fullFrame ? H : PLAY_Y + PLAY_H + 6;
      return { scale: Math.round(L.scale * 1000) / 1000, share: L.showShare,
               fullFrame: L.fullFrame,
               top: Math.round(top), bottom: Math.round(bottom),
               overTop: Math.round(Math.max(0, panelTop - top)),
               overBottom: Math.round(Math.max(0, bottom - panelBot)),
               fits: top >= panelTop && bottom <= panelBot };
    },
    // Every level is a scramble of a crossing-free circular layout, so putting
    // the dots back on that circle is the witness that a solution exists.
    solve() {
      if (!truePositions.length) return null;
      pos = truePositions.map(function (p) { return { x: p.x, y: p.y }; });
      return detectCrossings().crossings;
    },
  };

  // ---------- START ----------
  function bootToInstructions() {
    awaitingStart = true;
    requestAnimationFrame(loop);
  }
  if (document.getElementById('splash')) {
    window.addEventListener('splash-done', bootToInstructions, { once: true });
  } else {
    bootToInstructions();
  }
})();
