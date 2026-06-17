/* ============================================================
   Untangle · a Zamborin Game

   Drag the dots so no two edges cross. Each press-drag-release that
   actually moves a vertex counts as 1 move. Par = number of vertices
   the daily generator perturbed when scrambling the planar layout.
   Same graph every day for everyone.

   Two-mode codebase (desktop / mobile dynamic) lifted from Tessera so
   future Zamborin Games share a single scaffold for splash, instructions,
   banner, focus mode, reduced-motion, mobile-fit and Dark Portal palette.
   ============================================================ */
(() => {
  'use strict';

  // ---------- MODE DETECTION ----------
  const MODE = (matchMedia('(pointer: coarse)').matches || window.innerWidth < 768)
    ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);

  // Per-mode canvas + playfield geometry.
  function buildMobileCFG() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const HUD_H        = 56;
    const BANNER_H     = 50;
    const BOTTOM_PAD   = 22;
    const HINT_AREA    = 36;
    const GRID_TOP_GAP = 8;
    const SIDE_PAD     = 12;
    document.body.style.setProperty('--canvas-w', vw + 'px');
    document.body.style.setProperty('--canvas-h', vh + 'px');
    return {
      W: vw, H: vh, HUD_H,
      PLAY_X: SIDE_PAD,
      PLAY_Y: HUD_H + GRID_TOP_GAP,
      PLAY_W: vw - SIDE_PAD * 2,
      PLAY_H: vh - HUD_H - GRID_TOP_GAP - HINT_AREA - BANNER_H - BOTTOM_PAD,
      VERTEX_R: 14,
      VERTEX_HIT: 28,
      BANNER_W: 320, BANNER_H,
      BANNER_Y: vh - BANNER_H - BOTTOM_PAD,
    };
  }
  const CFG = MODE === 'mobile' ? buildMobileCFG() : (() => {
    const W = 760, H = 570, HUD_H = 56;
    return {
      W, H, HUD_H,
      PLAY_X: 44,
      PLAY_Y: HUD_H + 8,
      PLAY_W: W - 88,
      PLAY_H: H - HUD_H - 8 - 36 - 8,  // HUD + gap + hint band + bottom padding
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

  // ---------- CANVAS + SHARP-DPR ----------
  const canvas = document.getElementById('game');
  const ctx    = canvas.getContext('2d');
  const W = CFG.W, H = CFG.H;
  canvas.setAttribute('width', String(W));
  canvas.setAttribute('height', String(H));
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const backingW = Math.round(W * dpr);
    const backingH = Math.round(H * dpr);
    if (canvas.width !== backingW)  canvas.width  = backingW;
    if (canvas.height !== backingH) canvas.height = backingH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

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
    accent:     '#D8523F',           // coral (AA-pass on white text)
    accentHi:   '#FF6B5C',
    aligned:    '#5DD39E',           // mint — win/clear
    panel:      '#1A2A45',
    panel2:     '#22355A',
    line:       'rgba(255, 255, 255, 0.08)',
    edgeOK:     '#7E94B5',           // calm gray-blue edge
    edgeCross:  '#FF6B5C',           // pulsing coral when this edge crosses another
    vertexDrag: '#FFD23F',           // sunshine yellow while held
    crossDot:   '#FFD23F',           // mark on intersection
    overlay:    'rgba(14, 23, 38, 0.92)',
  };

  // 12 candy colours for the vertices — each dot gets its own identity so the
  // graph reads as a constellation rather than a uniform field of blue. With
  // N capped at 12 (EXPERT tier) every dot is a distinct hue.
  // All bodies hold ≥4.5:1 against a white inner-highlight overlay.
  const VERTEX_PALETTE = [
    '#E84855', // cherry red
    '#3D5AFE', // royal blue
    '#FFD23F', // sunshine yellow
    '#00897B', // emerald
    '#D85B0E', // burnt orange
    '#7E57C2', // royal purple
    '#5DD39E', // mint
    '#C2185B', // magenta rose
    '#4ECDC4', // teal cyan
    '#F4A261', // amber
    '#B084CC', // lavender
    '#FF6B9D', // pink
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

  // ---------- DAILY CHALLENGE ----------
  // Shared Zamborin epoch — Day 1 = 2026-05-30 (same as Tessera).
  const EPOCH_Y = 2026, EPOCH_M = 5, EPOCH_D = 30;
  function todayString() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function realDayNumber() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const launch = new Date(EPOCH_Y, EPOCH_M - 1, EPOCH_D);
    return Math.max(1, Math.floor((today - launch) / 86400000) + 1);
  }
  function dayNumber() {
    try {
      const p = new URLSearchParams(window.location.search);
      const d = parseInt(p.get('day'), 10);
      if (!isNaN(d) && d >= 1) return d;
    } catch (_) {}
    return realDayNumber();
  }
  function dailySeedString() {
    return 'zamborin-untangle-day-' + dayNumber();
  }

  // ---------- DIFFICULTY ----------
  const TIERS = [
    { name: 'TUTORIAL', minDay: 1,  maxDay: 3,     N: 6,  edges: 8,  perturbPct: 0.50 },
    { name: 'EASY',     minDay: 4,  maxDay: 10,    N: 7,  edges: 11, perturbPct: 0.60 },
    { name: 'MEDIUM',   minDay: 11, maxDay: 21,    N: 9,  edges: 14, perturbPct: 0.70 },
    { name: 'HARD',     minDay: 22, maxDay: 35,    N: 10, edges: 17, perturbPct: 0.75 },
    { name: 'HARDER',   minDay: 36, maxDay: 50,    N: 11, edges: 19, perturbPct: 0.80 },
    { name: 'EXPERT',   minDay: 51, maxDay: 99999, N: 12, edges: 21, perturbPct: 0.85 },
  ];
  function tierForDay(d) {
    for (const t of TIERS) if (d >= t.minDay && d <= t.maxDay) return t;
    return TIERS[TIERS.length - 1];
  }

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
    for (let i = 0; i < N; i++) addEdge(i, (i + 1) % N);          // outer cycle
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

  // ---------- STATE ----------
  let scene = 'instructions';   // 'instructions' | 'playing' | 'won'
  let awaitingStart = true;
  let edges = [];
  let pos   = [];
  let N = 9;
  let par = 0;
  let moves = 0;
  let runDay = dayNumber();
  let runTier = tierForDay(runDay);

  let dragIdx   = -1;
  let dragOrigin = null;
  let dragMovedFar = false;

  function bestKey() { return 'zamborin-untangle.best.' + todayString(); }
  let dailyBest = parseInt(localStorage.getItem(bestKey()) || '0', 10) || null;

  const START_BTN = { x: 0, y: 0, w: 0, h: 0 };
  const SHARE_BTN = { x: 0, y: 0, w: 0, h: 0 };
  function inRect(r, lx, ly) { return r.w > 0 && lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h; }

  // ---------- INIT ----------
  function initGame() {
    rng = mulberry32(hashSeed(dailySeedString()));
    runDay = dayNumber();
    runTier = tierForDay(runDay);
    N = runTier.N;
    edges = generateGraphTopology(N, runTier.edges);

    const radius = Math.min(PLAY_W, PLAY_H) / 2 - MARGIN;
    const truePos = [];
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
    scene = 'playing';
    dragIdx = -1;
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
    const { lx, ly } = logical(e.clientX, e.clientY);

    if (awaitingStart) {
      if (inRect(START_BTN, lx, ly)) { awaitingStart = false; initGame(); }
      return;
    }
    if (scene === 'won') {
      if (inRect(SHARE_BTN, lx, ly)) { copyShareString(); return; }
      initGame();                                  // tap elsewhere to play again
      return;
    }
    if (scene !== 'playing') return;
    const idx = vertexAt(lx, ly);
    if (idx === -1) return;
    dragIdx = idx;
    dragOrigin = { x: pos[idx].x, y: pos[idx].y };
    dragMovedFar = false;
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
      moves++;
      if (detectCrossings().crossings === 0) onWin();
    }
    dragIdx = -1; dragOrigin = null; dragMovedFar = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointercancel', () => {
    dragIdx = -1; dragOrigin = null; dragMovedFar = false;
  });

  window.addEventListener('keydown', (e) => {
    if (awaitingStart && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); awaitingStart = false; initGame(); return;
    }
    if (scene === 'won' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); initGame();
    }
  });

  function onWin() {
    scene = 'won';
    if (dailyBest == null || moves < dailyBest) {
      dailyBest = moves;
      try { localStorage.setItem(bestKey(), String(moves)); } catch (_) {}
    }
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

  function drawHUD() {
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = C.textMute;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('MOVES', PLAY_X, 16);
    ctx.font = '800 24px Inter, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(moves), PLAY_X, 38);

    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = C.textMute;
    ctx.textAlign = 'center';
    ctx.fillText('PAR', W / 2, 16);
    ctx.font = '800 24px Inter, sans-serif';
    ctx.fillStyle = moves > par ? C.accent : C.text;
    ctx.fillText(String(par), W / 2, 38);

    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = C.textMute;
    ctx.textAlign = 'right';
    ctx.fillText('DAY', PLAY_X + PLAY_W, 16);
    ctx.font = '800 24px Inter, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(runDay), PLAY_X + PLAY_W, 38);
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
        // Crossing edge — pulse a coral glow + draw the line in coral
        ctx.save();
        ctx.shadowColor = C.accentHi;
        ctx.shadowBlur = 8 + 6 * pulse;
        ctx.strokeStyle = C.edgeCross;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        ctx.restore();
      } else {
        // Calm edge — subtle outer glow for depth
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
      // Outer glow — coloured halo so each dot's identity reads in peripheral vision.
      ctx.save();
      ctx.shadowColor = isDrag ? C.vertexDrag : baseColor;
      ctx.shadowBlur = isDrag ? (10 + 6 * pulse) : 8;
      ctx.fillStyle = isDrag ? C.vertexDrag : baseColor;
      ctx.beginPath(); ctx.arc(p.x, p.y, VERTEX_R, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // Inner specular highlight — white-ish, scaled by colour brightness so
      // light/dark vertex bodies both get a believable sheen.
      ctx.fillStyle = isDrag ? '#FFEAB4' : 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath(); ctx.arc(p.x - VERTEX_R * 0.25, p.y - VERTEX_R * 0.25, VERTEX_R * 0.35, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawHintRow() {
    const text = MODE === 'mobile'
      ? 'DRAG ANY DOT — REMOVE EVERY CROSSING'
      : 'CLICK AND DRAG ANY DOT — REMOVE EVERY EDGE CROSSING';
    const stripTop    = PLAY_Y + PLAY_H + 6;
    const stripBot    = BANNER_H > 0 ? BANNER_Y : H;
    const stripHeight = stripBot - stripTop;
    ctx.font = '500 11px Inter, sans-serif';
    ctx.fillStyle = C.textMute;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(text);
    const baselineY = stripTop + (stripHeight - (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent)) / 2 + m.actualBoundingBoxAscent;
    ctx.fillText(text, W / 2, baselineY);
  }

  function drawBannerAd() {
    if (BANNER_H === 0) return;
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
  function drawInstructions() {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, BANNER_H > 0 ? BANNER_Y - 8 : H);

    const midX = W / 2;
    const playBot = BANNER_H > 0 ? BANNER_Y - 8 : H;
    const midY = playBot / 2;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = C.accent;
    ctx.fillText('HOW TO PLAY', midX, midY - 160);

    ctx.font = '800 ' + (MODE === 'mobile' ? 32 : 36) + 'px Inter, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText('Untangle', midX, midY - 120);

    const rules = [
      'Drag any dot to move it.',
      'Edges that cross another edge pulse red.',
      'Goal: remove every crossing.',
      'Same puzzle for everyone today.',
    ];
    ctx.font = '500 14px Inter, sans-serif';
    ctx.fillStyle = C.textDim;
    const lineH = 24;
    const rulesTop = midY - 60;
    for (let i = 0; i < rules.length; i++) ctx.fillText(rules[i], midX, rulesTop + i * lineH);

    const btnW = MODE === 'mobile' ? 240 : 280;
    const btnH = MODE === 'mobile' ? 56 : 52;
    const btnY = rulesTop + rules.length * lineH + 28;
    const btnX = midX - btnW / 2;
    START_BTN.x = btnX; START_BTN.y = btnY; START_BTN.w = btnW; START_BTN.h = btnH;
    ctx.fillStyle = C.accent;
    roundRect(btnX, btnY, btnW, btnH, btnH / 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 14px Inter, sans-serif';
    ctx.fillText('START', midX, btnY + btnH / 2 + 1);
  }

  // ---------- WIN ----------
  function drawWon(now) {
    ctx.fillStyle = C.overlay;
    roundRect(PLAY_X - 6, PLAY_Y - 6, PLAY_W + 12, PLAY_H + 12, 14);
    ctx.fill();

    const midX = W / 2;
    const midY = PLAY_Y + PLAY_H / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = '700 14px Inter, sans-serif';
    ctx.fillStyle = C.aligned;
    ctx.fillText('UNTANGLED', midX, midY - 120);

    ctx.font = '800 56px Inter, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(moves), midX, midY - 60);
    ctx.font = '500 11px Inter, sans-serif';
    ctx.fillStyle = C.textDim;
    ctx.fillText('YOUR MOVES', midX, midY - 24);

    ctx.font = '500 24px Inter, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(par), midX, midY + 12);
    ctx.font = '500 11px Inter, sans-serif';
    ctx.fillStyle = C.textDim;
    ctx.fillText('PAR', midX, midY + 30);

    let verdict, color;
    if (moves < par)        { verdict = 'UNDER PAR · BRILLIANT'; color = C.aligned; }
    else if (moves === par) { verdict = 'AT PAR'; color = C.aligned; }
    else if (moves <= par+2){ verdict = '+' + (moves - par) + ' OVER PAR · GREAT'; color = C.text; }
    else                    { verdict = '+' + (moves - par) + ' OVER PAR'; color = C.textDim; }
    ctx.font = '700 13px Inter, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(verdict, midX, midY + 64);

    const btnW = 240, btnH = 48;
    const btnX = midX - btnW / 2;
    const shareY = midY + 96;
    SHARE_BTN.x = btnX; SHARE_BTN.y = shareY; SHARE_BTN.w = btnW; SHARE_BTN.h = btnH;
    ctx.fillStyle = C.accent;
    roundRect(btnX, shareY, btnW, btnH, btnH / 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 13px Inter, sans-serif';
    ctx.fillText('SHARE RESULT', midX, shareY + btnH / 2 + 1);

    const pulse = 0.55 + 0.45 * Math.sin(now / 350);
    ctx.globalAlpha = pulse;
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText('TAP ELSEWHERE TO TRY AGAIN', midX, shareY + btnH + 22);
    ctx.globalAlpha = 1;
  }

  // ---------- SHARE ----------
  function homeURL() { return window.location.origin + window.location.pathname; }
  function buildSharePayload() {
    let verdict;
    if (moves < par)        verdict = 'under par by ' + (par - moves);
    else if (moves === par) verdict = 'at par';
    else                    verdict = '+' + (moves - par) + ' over par';
    const text = 'I untangled Day ' + runDay + ' · ' + runTier.name + '\n'
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
    drawHintRow();
    drawBannerAd();

    if (scene === 'won') drawWon(now);

    requestAnimationFrame(loop);
  }

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
