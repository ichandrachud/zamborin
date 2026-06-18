/* ============================================================
   Ludo · a Zamborin Game

   PHASE 1 deliverable — static board + tokens-in-bases.
   No play logic, no dice, no input wiring yet. The next phases
   add dice/movement, rules, AI, turn UI, HUD, and audio.

   Board model — 15×15 grid of cells.
   ┌──────┬───┬──────┐
   │ R    │ T │  Y   │   R = Red base   (top-left)
   │  6×6 │arm│ 6×6  │   Y = Yellow base (top-right)
   ├──────┼───┼──────┤   G = Green base  (bottom-right)
   │  L   │ C │  R   │   B = Blue base   (bottom-left)
   │  arm │3×3│ arm  │   C = central home
   ├──────┼───┼──────┤   arms = 3-wide path corridors
   │ B    │ B │  G   │
   │  6×6 │arm│ 6×6  │
   └──────┴───┴──────┘

   The perimeter ring has exactly 52 cells. Each player starts on
   a designated entry square, travels 50 cells around the ring,
   then turns into a 6-cell home column ending in the centre.
   ============================================================ */
(() => {
  'use strict';

  // ---------- MODE ----------
  const MODE = (matchMedia('(pointer: coarse)').matches || window.innerWidth < 768)
    ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);

  // Square canvas in both modes — Ludo is symmetric, no separate desktop/mobile layout.
  function computeSize() {
    if (MODE === 'mobile') {
      const reserved = 30;  // tiny breathing room — chrome.css auto-focus mode takes over below 1100px
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

  // ---------- PALETTE — Dark Portal + Zamborin cyan grid + player colors ----------
  const C = {
    bg:           '#0E1726',
    boardBorder:  '#1bbced',   // Zamborin brand cyan — the thick "blue" lines of a classic Ludo board
    cellFace:     '#F4F8FF',   // off-white cells, slight blue tint so they read against the dark navy
    cellLine:     '#1bbced',
    text:         '#FFFFFF',
    textDim:      '#C5CFE0',
    textMute:     '#8E9CB5',
    accent:       '#D8523F',
    safeMark:     '#1bbced',   // safe-square star icon
  };

  // Four player colors — drawn from Untangle's tested-AA-against-white palette.
  const PLAYERS = {
    red:    { fill: '#E84855', glow: '#FF6B5C', name: 'Red',    homeIdx: 0 },
    yellow: { fill: '#FFD23F', glow: '#FFE38A', name: 'Yellow', homeIdx: 1 },
    green:  { fill: '#5DD39E', glow: '#8AECB7', name: 'Green',  homeIdx: 2 },
    blue:   { fill: '#3D5AFE', glow: '#7185FF', name: 'Blue',   homeIdx: 3 },
  };
  const PLAYER_ORDER = ['red', 'yellow', 'green', 'blue'];

  // ---------- BOARD GEOMETRY ----------
  // 15×15 grid with cells of side `cell`. The board occupies the centre of the
  // canvas with equal padding on all sides.
  const N = 15;
  const PAD = 30;
  const cell = Math.floor((S - PAD * 2) / N);
  const BOARD_W = cell * N;
  const BX = (S - BOARD_W) / 2;
  const BY = (S - BOARD_W) / 2;

  // Cell rect helper. col/row in [0, 14].
  function cellRect(col, row) {
    return { x: BX + col * cell, y: BY + row * cell, w: cell, h: cell };
  }

  // Base squares — each is 6×6 cells in one corner.
  // The four "token slots" inside each base sit at the corners of a 2×2 cluster
  // centred in the base. The slot positions are in CELL coordinates (not grid).
  const BASES = {
    red:    { col: 0, row: 0, color: 'red'    },
    yellow: { col: 9, row: 0, color: 'yellow' },
    green:  { col: 9, row: 9, color: 'green'  },
    blue:   { col: 0, row: 9, color: 'blue'   },
  };

  // Inside each 6×6 base, slot centres at offsets (1.5, 1.5), (4.5, 1.5),
  // (1.5, 4.5), (4.5, 4.5) — gives four pleasingly symmetric circles.
  const BASE_SLOT_OFFSETS = [
    { col: 1.5, row: 1.5 }, { col: 4.5, row: 1.5 },
    { col: 1.5, row: 4.5 }, { col: 4.5, row: 4.5 },
  ];
  function baseSlot(player, slotIdx) {
    const b = BASES[player];
    const off = BASE_SLOT_OFFSETS[slotIdx];
    return {
      x: BX + (b.col + off.col) * cell,
      y: BY + (b.row + off.row) * cell,
    };
  }

  // Perimeter ring — 52 cells in canonical traversal order.
  // PATH[0] is Red's start; PATH[13] is Yellow's start; PATH[26] is Green's;
  // PATH[39] is Blue's. Each player adds (homeIdx * 13) to the canonical index
  // to get their absolute board position.
  //
  // Coordinates here are (col, row). Counter-clockwise from Red's start makes
  // each player's loop direction match the classic Ludo flow.
  const PATH = [
    // Red start at left-arm row, just past base wall
    [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
    // Up the left side of the top arm
    [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
    // Across the top of the top arm
    [7, 0], [8, 0],
    // Down the right side of the top arm
    [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
    // Across to the right (top of right arm)
    [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
    // Down the right edge
    [14, 7], [14, 8],
    // Back across (bottom of right arm)
    [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
    // Down the right side of the bottom arm
    [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
    // Across the bottom of the bottom arm
    [7, 14], [6, 14],
    // Up the left side of the bottom arm
    [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
    // Across to the left (bottom of left arm)
    [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
    // Up the left edge
    [0, 7],
  ];
  // PATH.length === 52 (verified at runtime below)

  const PATH_LEN = PATH.length;
  // Player start indices in PATH (counter-clockwise, every 13 cells).
  const START_INDEX = { red: 0, yellow: 13, green: 26, blue: 39 };
  // Safe squares: every player's start + the "star" square one quarter further
  // along (8, 21, 34, 47) — these are the cells that show a safe-mark glyph.
  const SAFE_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

  // Home columns — 6 cells leading from each player's home-entry square into the
  // centre. Coordinates are (col, row). HOME_COL[player][0] is the first cell
  // INSIDE the column (after diverting off the perimeter); HOME_COL[player][5]
  // is the cell just before the centre rosette.
  const HOME_COL = {
    red:    [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
    yellow: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
    green:  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
    blue:   [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  };
  // The centre rosette cell (where all four home columns terminate).
  const CENTRE = [7, 7];

  // ---------- TOKEN STATE ----------
  // 16 tokens — 4 per player, all start in their base slots.
  // status: 'base' | 'board' | 'home' | 'finished'
  //   base    → token is in its starting cluster
  //   board   → token is on the perimeter ring at boardIdx (0..PATH_LEN-1)
  //   home    → token is in the home column at homeIdx (0..5)
  //   finished → token has reached the centre (out of play)
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

  // ---------- DRAWING HELPERS ----------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  // Draw a single perimeter / home-column cell as a white tile with a thick
  // cyan border, matching the classic Ludo style.
  function drawCell(col, row, fill, borderW) {
    const r = cellRect(col, row);
    ctx.fillStyle = fill || C.cellFace;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = C.boardBorder;
    ctx.lineWidth = borderW || 3;
    ctx.strokeRect(r.x + (ctx.lineWidth/2), r.y + (ctx.lineWidth/2), r.w - ctx.lineWidth, r.h - ctx.lineWidth);
  }

  // Star glyph drawn on safe squares (5-point star, geometric).
  function drawSafeStar(col, row) {
    const r = cellRect(col, row);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const outer = r.w * 0.28;
    const inner = outer * 0.45;
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? outer : inner;
      const ang = -Math.PI / 2 + i * Math.PI / 5;
      const x = cx + Math.cos(ang) * rad;
      const y = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = C.safeMark;
    ctx.globalAlpha = 0.40;
    ctx.fill();
    ctx.restore();
  }

  function drawBoardFrame() {
    // Outer board background — dark navy is already there from body bg, but we
    // draw a slightly-warmer board area so the board reads as a distinct surface.
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, S, S);
  }

  function drawBases() {
    // Each base is a 6×6 block filled with player color and a 4-slot cluster of
    // white token wells in the centre.
    for (const player of PLAYER_ORDER) {
      const b = BASES[player];
      const fill = PLAYERS[player].fill;

      // Outer base square.
      const baseX = BX + b.col * cell;
      const baseY = BY + b.row * cell;
      const baseS = 6 * cell;
      ctx.fillStyle = fill;
      ctx.fillRect(baseX, baseY, baseS, baseS);
      ctx.strokeStyle = C.boardBorder;
      ctx.lineWidth = 4;
      ctx.strokeRect(baseX + 2, baseY + 2, baseS - 4, baseS - 4);

      // Inner white circle pad — gives the four token wells a clean platform.
      // Sized to enclose the four slots with comfortable margin.
      const padX = baseX + 1.5 * cell;
      const padY = baseY + 1.5 * cell;
      const padS = 3 * cell;
      ctx.fillStyle = '#FFFFFF';
      roundRect(padX, padY, padS, padS, cell * 0.4);
      ctx.fill();

      // Four token wells (the destination circles where idle tokens sit).
      for (let i = 0; i < 4; i++) {
        const pos = baseSlot(player, i);
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, cell * 0.38, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, cell * 0.30, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawPath() {
    // Perimeter cells.
    for (let i = 0; i < PATH_LEN; i++) {
      const [col, row] = PATH[i];
      // Colour the start cells with their player's tint so each player's launch
      // square is obvious at a glance.
      let fill = C.cellFace;
      for (const p of PLAYER_ORDER) {
        if (START_INDEX[p] === i) { fill = PLAYERS[p].fill; break; }
      }
      drawCell(col, row, fill, 3);
      if (SAFE_INDICES.has(i) && fill === C.cellFace) drawSafeStar(col, row);
    }
    // Home columns — each tinted with the player's colour so the corridor reads
    // as theirs.
    for (const player of PLAYER_ORDER) {
      const tint = PLAYERS[player].fill;
      const col = HOME_COL[player];
      for (let k = 0; k < col.length; k++) {
        const [c, r] = col[k];
        drawCell(c, r, tint, 3);
      }
    }
    // Centre rosette — split into 4 triangles, one per player, meeting at the
    // exact centre. This is the destination cell every token must reach.
    drawCentreRosette();
  }

  function drawCentreRosette() {
    const [cc, cr] = CENTRE;
    const rect = cellRect(cc, cr);
    // Expand the rosette to occupy the full 3×3 centre block.
    const x = rect.x - cell;
    const y = rect.y - cell;
    const w = cell * 3;
    const h = cell * 3;
    const cx = x + w / 2;
    const cy = y + h / 2;

    // Background fill (white) and frame.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.boardBorder;
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);

    // Four triangles meeting at the centre, ordered to match player home-column
    // entry directions: red from left, yellow from top, green from right,
    // blue from bottom.
    const triangles = [
      { color: PLAYERS.red.fill,    pts: [[x, y],         [x, y + h],     [cx, cy]] }, // left
      { color: PLAYERS.yellow.fill, pts: [[x, y],         [x + w, y],     [cx, cy]] }, // top
      { color: PLAYERS.green.fill,  pts: [[x + w, y],     [x + w, y + h], [cx, cy]] }, // right
      { color: PLAYERS.blue.fill,   pts: [[x, y + h],     [x + w, y + h], [cx, cy]] }, // bottom
    ];
    for (const t of triangles) {
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.moveTo(t.pts[0][0], t.pts[0][1]);
      ctx.lineTo(t.pts[1][0], t.pts[1][1]);
      ctx.lineTo(t.pts[2][0], t.pts[2][1]);
      ctx.closePath();
      ctx.fill();
    }
    // Subtle outer ring around the rosette so it pops against the bg.
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  }

  function drawTokens() {
    // For Phase 1 every token sits in its base slot. Future phases will branch
    // on token.status to draw on-board / in-home-column / finished tokens.
    for (const t of tokens) {
      if (t.status !== 'base') continue;
      const pos = baseSlot(t.player, t.slotIdx);
      drawTokenAt(pos.x, pos.y, t.player);
    }
  }

  function drawTokenAt(x, y, player) {
    const p = PLAYERS[player];
    const r = cell * 0.32;
    // Body
    ctx.save();
    ctx.shadowColor = p.glow;
    ctx.shadowBlur  = 6;
    ctx.fillStyle = p.fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Specular highlight — small white-ish disc near top-left, gives a tactile
    // 3D look without going skeuomorphic.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(x - r * 0.30, y - r * 0.30, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    // Thin dark outline keeps the disc from blending into pale wells.
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.20)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ---------- LOOP ----------
  function loop() {
    drawBoardFrame();
    drawBases();
    drawPath();
    drawTokens();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------- DEBUG SANITY CHECK ----------
  // Surface a clear error in the console if the perimeter ring doesn't have
  // exactly 52 cells — easy mistake when hand-listing the path.
  if (PATH_LEN !== 52) {
    console.error('Ludo path geometry broken: PATH has', PATH_LEN, 'cells (expected 52).');
  }
})();
