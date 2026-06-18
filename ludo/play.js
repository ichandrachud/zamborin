/* ============================================================
   Ludo · a Zamborin Game

   PHASE 1 — board (from /ludo/ludo-board.svg) + 16 static tokens in
   their bases. No play logic yet. Future phases add dice/movement,
   rules, AI, turn UI, HUD, audio.

   The board image is the source of truth for geometry. PATH, home
   columns, base slots, and the centre cell are all expressed in
   the SVG's native 970×970 viewBox and converted to canvas pixels
   via svg() at draw time.
   ============================================================ */
(() => {
  'use strict';

  // ---------- MODE ----------
  const MODE = (matchMedia('(pointer: coarse)').matches || window.innerWidth < 768)
    ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);

  // Square canvas in both modes — Ludo board is symmetric.
  function computeSize() {
    if (MODE === 'mobile') {
      const reserved = 30;
      return Math.min(window.innerHeight - reserved, window.innerWidth - reserved);
    }
    return 760;
  }
  const S = computeSize();
  document.body.style.setProperty('--canvas-w', S + 'px');
  document.body.style.setProperty('--canvas-h', S + 'px');

  // ---------- CANVAS ----------
  const canvas = document.getElementById('game');
  const ctx    = canvas.getContext('2d');
  canvas.setAttribute('width',  String(S));
  canvas.setAttribute('height', String(S));
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const display = rect.width || S;
    const backing = Math.round(display * dpr);
    if (canvas.width  !== backing) canvas.width  = backing;
    if (canvas.height !== backing) canvas.height = backing;
    const scale = backing / S;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  if (MODE === 'mobile') {
    let wasPortrait = window.innerHeight > window.innerWidth;
    window.addEventListener('resize', () => {
      const nowPortrait = window.innerHeight > window.innerWidth;
      if (wasPortrait !== nowPortrait) { wasPortrait = nowPortrait; location.reload(); }
    });
  }

  // ---------- BOARD IMAGE ----------
  // The board SVG lives next to play.js. It's drawn once per frame via
  // drawImage(); everything else (tokens, highlights) renders on top.
  const boardImg = new Image();
  let boardReady = false;
  boardImg.onload = () => { boardReady = true; };
  boardImg.src = './ludo-board.svg';

  // ---------- SVG → CANVAS COORDINATE MAPPING ----------
  // The SVG's native viewBox is 970×970. svg(x, y) returns the equivalent
  // pixel position on our `S × S` canvas.
  const SVG_VB = 970;
  function svg(x, y) {
    const k = S / SVG_VB;
    return { x: x * k, y: y * k };
  }
  // Token disc radius derived from SVG cell size (54.66 → ~22 SVG units → scale).
  function tokenR() {
    return (S / SVG_VB) * 22;
  }

  // ---------- PALETTE — match SVG colors exactly so tokens read correctly ----------
  const PLAYERS = {
    red:    { fill: '#ed1c24', glow: '#FF6B5C', name: 'Red'    },
    yellow: { fill: '#fff200', glow: '#FFE38A', name: 'Yellow' },
    green:  { fill: '#39b54a', glow: '#8AECB7', name: 'Green'  },
    blue:   { fill: '#00aeef', glow: '#7DD8FF', name: 'Blue'   },
  };
  const PLAYER_ORDER = ['red', 'yellow', 'green', 'blue'];

  // ---------- GEOMETRY (in SVG 970-viewBox coordinates) ----------
  // PATH is the 52-cell perimeter ring, ordered so that going FORWARD by N
  // entries moves a token N squares in the canonical direction.
  // Start cells (per-player): green=PATH[0], yellow=PATH[13], blue=PATH[26],
  // red=PATH[39]. Each player's HOME ENTRY on the perimeter is PATH[(start+50) % 52];
  // their 51st step diverts off the ring into HOME_COL[player][0].
  const PATH = [
    // Section 1 — left arm top row, going right toward centre
    [106.33, 422.03], [169.22, 422.03], [232.11, 422.03], [295.00, 422.03], [357.89, 422.03],
    // Section 2 — top arm left col, going up
    [422.12, 357.89], [422.12, 295.00], [422.12, 232.11], [422.12, 169.22], [422.12, 106.33], [422.12, 43.44],
    // Section 3 — top arm top row, going right
    [485.08, 43.44], [548.05, 43.44],
    // Section 4 — top arm right col, going down toward centre
    [548.05, 106.33], [548.05, 169.22], [548.05, 232.11], [548.05, 295.00], [548.05, 357.89],
    // Section 5 — right arm top row, going right (away from centre)
    [612.11, 422.03], [675.00, 422.03], [737.89, 422.03], [800.78, 422.03], [863.66, 422.03], [926.55, 422.03],
    // Section 6 — right arm right edge, going down
    [926.55, 485.01], [926.55, 547.97],
    // Section 7 — right arm bottom row, going left toward centre
    [863.66, 547.97], [800.78, 547.97], [737.89, 547.97], [675.00, 547.97], [612.11, 547.97],
    // Section 8 — bottom arm right col, going down (away from centre)
    [548.05, 612.11], [548.05, 675.00], [548.05, 737.89], [548.05, 800.78], [548.05, 863.66], [548.05, 926.55],
    // Section 9 — bottom arm bottom row, going left
    [485.08, 926.55], [422.12, 926.55],
    // Section 10 — bottom arm left col, going up toward centre
    [422.12, 863.66], [422.12, 800.78], [422.12, 737.89], [422.12, 675.00], [422.12, 612.11],
    // Section 11 — left arm bottom row, going left (away from centre)
    [357.89, 547.97], [295.00, 547.97], [232.11, 547.97], [169.22, 547.97], [106.33, 547.97], [43.44, 547.97],
    // Section 12 — left arm left edge, going up
    [43.44, 485.01], [43.44, 422.03],
  ];

  const START_INDEX = { green: 0, yellow: 13, blue: 26, red: 39 };
  // Star squares: every player's start + the +9 star one quarter further along.
  const SAFE_INDICES = new Set([0, 9, 13, 22, 26, 35, 39, 48]);

  // Home column — 5 cells leading from each player's perimeter entry to the
  // centre rosette. HOME_COL[player][0] is the cell entered immediately after
  // leaving the perimeter; HOME_COL[player][4] is the last cell before centre.
  const HOME_COL = {
    green:  [[106.33, 485.01], [169.22, 485.01], [232.11, 485.01], [295.00, 485.01], [357.89, 485.01]],
    yellow: [[485.08, 106.33], [485.08, 169.22], [485.08, 232.11], [485.08, 295.00], [485.08, 357.89]],
    blue:   [[863.66, 485.01], [800.78, 485.01], [737.89, 485.01], [675.00, 485.01], [612.11, 485.01]],
    red:    [[485.08, 863.66], [485.08, 800.78], [485.08, 737.89], [485.08, 675.00], [485.08, 612.11]],
  };
  // The centre rosette — every token's final destination.
  const CENTRE = [485.01, 485.01];

  // Base slot centres — exact circle positions from ludo-board.svg.
  const BASE_SLOTS = {
    green:  [[130.87, 131.82], [269.56, 131.82], [130.87, 269.65], [269.56, 269.65]],
    yellow: [[699.04, 131.80], [837.74, 131.80], [699.04, 269.64], [837.74, 269.64]],
    blue:   [[699.04, 699.94], [837.74, 699.94], [699.04, 837.77], [837.74, 837.77]],
    red:    [[130.87, 699.95], [269.56, 699.95], [130.87, 837.79], [269.56, 837.79]],
  };

  // ---------- TOKEN STATE ----------
  // status: 'base' | 'board' | 'home' | 'finished'
  function freshTokens() {
    const tokens = [];
    for (const player of PLAYER_ORDER) {
      for (let i = 0; i < 4; i++) {
        tokens.push({ player, slotIdx: i, status: 'base', boardIdx: -1, homeIdx: -1 });
      }
    }
    return tokens;
  }
  const tokens = freshTokens();

  // ---------- TOKEN RENDERER ----------
  function drawTokenAt(svgX, svgY, player) {
    const pos = svg(svgX, svgY);
    const p = PLAYERS[player];
    const r = tokenR();
    ctx.save();
    ctx.shadowColor = p.glow;
    ctx.shadowBlur  = 6;
    ctx.fillStyle = p.fill;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Specular highlight — slight tactile lift without leaning skeuomorphic.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(pos.x - r * 0.30, pos.y - r * 0.30, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    // Thin dark outline keeps light-coloured tokens (yellow especially)
    // separated from the bright board cells underneath.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  function tokenAnchor(t) {
    if (t.status === 'base') {
      const slot = BASE_SLOTS[t.player][t.slotIdx];
      return { x: slot[0], y: slot[1] };
    }
    if (t.status === 'board') {
      const cell = PATH[t.boardIdx];
      return { x: cell[0], y: cell[1] };
    }
    if (t.status === 'home') {
      const cell = HOME_COL[t.player][t.homeIdx];
      return { x: cell[0], y: cell[1] };
    }
    // finished
    return { x: CENTRE[0], y: CENTRE[1] };
  }

  function drawTokens() {
    for (const t of tokens) {
      const anchor = tokenAnchor(t);
      drawTokenAt(anchor.x, anchor.y, t.player);
    }
  }

  // ---------- LOOP ----------
  function loop() {
    // Dark fallback background — shows during the brief image-loading window.
    ctx.fillStyle = '#0E1726';
    ctx.fillRect(0, 0, S, S);

    if (boardReady) {
      ctx.drawImage(boardImg, 0, 0, S, S);
      drawTokens();
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Sanity check at runtime — paths and home columns must total exactly the
  // standard Ludo distance from start to centre (50 + 5 + 1 = 56 steps).
  if (PATH.length !== 52) {
    console.error('Ludo geometry: PATH length is', PATH.length, '(expected 52).');
  }
})();
