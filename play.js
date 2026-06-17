/* ============================================================
   TESSERA Words · Desktop · 12-col × 8-row grid
   Falling-letter mechanic. Land tiles into columns; whenever a
   horizontal or vertical run of 3+ letters forms an English
   word, it clears and tiles above fall in.
   All rendering is canvas-drawn vector — no images.
   ============================================================ */
(() => {
  'use strict';

  // ---------- CANVAS + SHARP-DPR ----------
  const canvas = document.getElementById('game');
  const ctx    = canvas.getContext('2d');
  const W = 760;             // logical width
  const H = 570;             // logical height
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

  // ---------- GRID ----------
  // Layout budget for a 760×570 canvas:
  //   HUD:     56 px (top)
  //   gap:      8 px
  //   GRID:   448 px (8 rows × 56)
  //   gap:     14 px
  //   hint:    16 px text band
  //   pad:     28 px bottom breathing room
  //   ===========================
  //           570 px total
  //   sides:  (760 − 672) / 2 = 44 px each — well over the 10 px minimum
  const COLS = 12;
  const ROWS = 8;
  const CELL = 56;
  const GRID_W = COLS * CELL;   // 672
  const GRID_H = ROWS * CELL;   // 448
  const HUD_H = 56;
  const GRID_X = (W - GRID_W) / 2;   // 44 px side padding
  const GRID_Y = HUD_H + 8;          // 64 — 8 px breathing room above grid

  // grid[r][c] = { letter, color } or null
  let grid = [];
  function emptyGrid() {
    const g = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) row.push(null);
      g.push(row);
    }
    return g;
  }

  // ---------- LETTER BAG (weighted Scrabble-ish frequencies) ----------
  const LETTER_DIST = {
    A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2,
    I: 9, J: 1, K: 1, L: 4, M: 2, N: 6, O: 8, P: 2,
    Q: 1, R: 6, S: 4, T: 6, U: 4, V: 2, W: 2, X: 1,
    Y: 2, Z: 1,
  };
  let bag = [];
  function refillBag() {
    bag = [];
    for (const [l, n] of Object.entries(LETTER_DIST)) {
      for (let i = 0; i < n; i++) bag.push(l);
    }
    // Fisher-Yates
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  function drawLetter() {
    if (bag.length === 0) refillBag();
    return bag.pop();
  }

  // ---------- WORD LIST (TWL06 Scrabble, 3-7 letters) ----------
  // 51 852 words bundled in ./words.txt — one word per line, uppercase.
  // Loaded asynchronously at startup; no words match until it arrives, which
  // is harmless because the first tile takes seconds to fall.
  const VALID_WORDS = new Set();
  let dictLoaded = false;
  fetch('./words.txt')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(text => {
      for (const line of text.split('\n')) {
        const w = line.trim();
        if (w) VALID_WORDS.add(w);
      }
      dictLoaded = true;
    })
    .catch(err => console.error('TESSERA Words: dictionary load failed', err));


  // ---------- PALETTE — DARK PORTAL ----------
  // Canvas world matches the page chrome (see play.css). The dark background lets
  // bright candy-colored tiles pop. All text-on-tile combos meet ≥4.5:1 contrast.
  const C = {
    bg:         '#131F36',          // matches gradient mid-stop on .game-wrap
    playfield:  '#1A2A45',          // slightly lighter playfield card
    cellEmpty:  '#1F3052',          // empty grid cell
    cellEmpty2: '#22355A',          // alt checker cell (subtle)
    cellLine:   'rgba(255, 255, 255, 0.06)',
    tileFace:   '#FFFFFF',          // letter glyphs sit on dark tile bodies
    accent:     '#FF6B5C',          // coral
    accentHi:   '#FFA08C',
    text:       '#FFFFFF',
    textDim:    '#C5CFE0',
    textMute:   '#8E9CB5',
    aligned:    '#5DD39E',          // mint — win/clear
    panel:      '#1A2A45',
    panel2:     '#22355A',
    flashGood:  '#FFD23F',          // sunshine yellow on clears
    line:       'rgba(255, 255, 255, 0.08)',
  };

  // Six candy palettes — body, then highlight strip — rotates per level.
  // Each pair: dark-enough body for white text, lighter highlight on top.
  const TILE_PALETTES = [
    ['#E84855', '#FF6B7A'],   // cherry red
    ['#F07F2A', '#FF9E5E'],   // burnt orange
    ['#3D5AFE', '#6577FF'],   // royal blue
    ['#00897B', '#26A69A'],   // emerald
    ['#7E57C2', '#9575CD'],   // royal purple
    ['#C2185B', '#E91E63'],   // magenta rose
  ];
  let levelIdx = 0;
  function tileColor() { return TILE_PALETTES[levelIdx % TILE_PALETTES.length]; }

  // ---------- ACTIVE FALLING TILE ----------
  let active = null;        // { letter, col, y, vy } y in pixels (top of tile)
  let nextLetter = null;
  let dropping = false;
  const FALL_SPEED = 90;    // base px/sec drift (when 0 letters have dropped)
  const FAST_DROP  = 720;   // px/sec when player presses down/space
  // Progressive speed-up — every dropped letter adds a touch of pressure.
  //   0 letters → 90 px/sec  (gentle warm-up)
  //   50       → 215         (noticeable squeeze)
  //   150+     → 360 cap     (nearly unsurvivable)
  const SPEED_PER_LETTER = 2.5;
  const SPEED_CAP = 360;
  function currentFallSpeed() {
    return Math.min(SPEED_CAP, FALL_SPEED + lettersDropped * SPEED_PER_LETTER);
  }

  // ---------- GAME STATE ----------
  let score = 0;
  let wordsFound = 0;
  let lettersDropped = 0;
  let gameOver = false;
  let lastFrame = 0;
  let clearFlashes = [];    // { cells: [{r,c}], startAt }

  // ---------- INIT ----------
  function initGame() {
    grid = emptyGrid();
    refillBag();
    score = 0;
    wordsFound = 0;
    lettersDropped = 0;
    gameOver = false;
    levelIdx = 0;
    clearFlashes = [];
    nextLetter = drawLetter();
    spawnTile();
    lastFrame = performance.now();
    requestAnimationFrame(loop);
  }

  function spawnTile() {
    const col = Math.floor(COLS / 2);
    const letter = nextLetter || drawLetter();
    nextLetter = drawLetter();
    // Spawn just inside the grid top so the tile never overlaps the HUD area above.
    active = { letter, col, y: GRID_Y - 2, vy: currentFallSpeed() };
    // If the spawn column is already full, game over.
    if (grid[0][col] !== null) {
      gameOver = true;
    }
  }

  // Get the lowest empty row in this column.
  function lowestEmpty(col) {
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[r][col] === null) return r;
    }
    return -1;
  }

  // Lock the active tile into place and run word detection.
  function lockTile() {
    if (!active) return;
    const col = active.col;
    const row = lowestEmpty(col);
    if (row === -1) {
      // Column overflow — game over.
      gameOver = true;
      active = null;
      return;
    }
    const [body, top] = tileColor();
    grid[row][col] = { letter: active.letter, body, top };
    lettersDropped++;
    if (lettersDropped % 10 === 0) levelIdx++;
    active = null;
    detectAndClearWords();
    if (!gameOver) spawnTile();
  }

  // Sweep grid for horizontal and vertical word matches (3-6 letters).
  // Greedy left-to-right / top-to-bottom; longest match at each starting cell.
  function detectAndClearWords() {
    const toClear = new Set();
    // horizontals
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        for (let len = 7; len >= 3; len--) {
          if (c + len > COLS) continue;
          let w = '';
          let ok = true;
          for (let k = 0; k < len; k++) {
            const cell = grid[r][c + k];
            if (!cell) { ok = false; break; }
            w += cell.letter;
          }
          if (!ok) continue;
          if (VALID_WORDS.has(w)) {
            for (let k = 0; k < len; k++) toClear.add(r + ',' + (c + k));
            score += len * len * 10;       // longer = exponentially better
            wordsFound++;
            break; // longest match at this start, move on
          }
        }
      }
    }
    // verticals
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        for (let len = 7; len >= 3; len--) {
          if (r + len > ROWS) continue;
          let w = '';
          let ok = true;
          for (let k = 0; k < len; k++) {
            const cell = grid[r + k][c];
            if (!cell) { ok = false; break; }
            w += cell.letter;
          }
          if (!ok) continue;
          if (VALID_WORDS.has(w)) {
            for (let k = 0; k < len; k++) toClear.add((r + k) + ',' + c);
            score += len * len * 10;
            wordsFound++;
            break;
          }
        }
      }
    }
    if (toClear.size === 0) return;
    const cells = [];
    for (const key of toClear) {
      const [r, c] = key.split(',').map(Number);
      cells.push({ r, c });
    }
    clearFlashes.push({ cells, startAt: performance.now() });
    // Remove tiles and apply gravity
    for (const { r, c } of cells) grid[r][c] = null;
    applyGravity();
  }

  function applyGravity() {
    for (let c = 0; c < COLS; c++) {
      const stack = [];
      for (let r = ROWS - 1; r >= 0; r--) {
        if (grid[r][c]) stack.push(grid[r][c]);
      }
      for (let r = ROWS - 1; r >= 0; r--) {
        grid[r][c] = stack[ROWS - 1 - r] || null;
      }
    }
  }

  // ---------- INPUT ----------
  let keys = { ArrowLeft: false, ArrowRight: false, ArrowDown: false };
  let leftHeld = 0, rightHeld = 0;
  const HORIZ_REPEAT_MS = 110;

  window.addEventListener('keydown', (e) => {
    if (gameOver && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      initGame();
      return;
    }
    if (!active) return;
    if (e.key === 'ArrowLeft')  { if (active.col > 0) active.col--; keys.ArrowLeft = true; e.preventDefault(); }
    else if (e.key === 'ArrowRight') { if (active.col < COLS - 1) active.col++; keys.ArrowRight = true; e.preventDefault(); }
    else if (e.key === 'ArrowDown' || e.key === ' ') {
      active.vy = FAST_DROP;
      keys.ArrowDown = true;
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key in keys) keys[e.key] = false;
    if (e.key === 'ArrowDown' || e.key === ' ') {
      if (active) active.vy = currentFallSpeed();
    }
  });

  // Mouse / pointer: click a column to slide & drop into it.
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (gameOver) { initGame(); return; }
    if (!active) return;
    const rect = canvas.getBoundingClientRect();
    const lx = ((e.clientX - rect.left) / rect.width) * W;
    const ly = ((e.clientY - rect.top)  / rect.height) * H;
    // If click is inside grid, choose column. Otherwise just fast-drop.
    if (ly > GRID_Y - CELL && ly < GRID_Y + GRID_H + 40) {
      const col = Math.max(0, Math.min(COLS - 1, Math.floor((lx - GRID_X) / CELL)));
      active.col = col;
      active.vy = FAST_DROP;
    }
  });

  // ---------- RENDERING ----------
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
    // SCORE column — left-aligned to the GRID's left edge
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = C.textMute;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('SCORE', GRID_X, 16);
    ctx.font = '800 24px Inter, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(score), GRID_X, 38);

    // WORDS — centred on the canvas (also centre of the grid)
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = C.textMute;
    ctx.textAlign = 'center';
    ctx.fillText('WORDS', W / 2, 16);
    ctx.font = '800 24px Inter, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(wordsFound), W / 2, 38);

    // NEXT column — right-aligned to the GRID's right edge
    const RIGHT_EDGE = GRID_X + GRID_W;
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = C.textMute;
    ctx.textAlign = 'right';
    ctx.fillText('NEXT', RIGHT_EDGE, 16);
    if (nextLetter) {
      // Tile sits in the value-row alongside SCORE/WORDS numerics.
      //   Label baseline middle: y=16 (text spans ~10–22)
      //   Tile spans 26–50, so ≥4 px clear of the label above and the playfield below
      //   (playfield card starts at GRID_Y - 10 = 54).
      const sz = 24;
      const previewX = RIGHT_EDGE - sz, previewY = 26;
      const [body, top] = tileColor();
      drawTileAt(previewX, previewY, sz, nextLetter, body, top, 1);
    }
  }

  function drawPlayfield() {
    // Soft outer card
    ctx.fillStyle = C.playfield;
    roundRect(GRID_X - 10, GRID_Y - 10, GRID_W + 20, GRID_H + 20, 14);
    ctx.fill();

    // Column hover guide (under active tile)
    if (active && !gameOver) {
      const gx = GRID_X + active.col * CELL;
      ctx.fillStyle = C.accent;
      ctx.globalAlpha = 0.08;
      ctx.fillRect(gx, GRID_Y, CELL, GRID_H);
      ctx.globalAlpha = 1;
    }

    // Empty cells (subtle checker)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c]) continue;
        const x = GRID_X + c * CELL + 2;
        const y = GRID_Y + r * CELL + 2;
        ctx.fillStyle = (r + c) % 2 === 0 ? C.cellEmpty : C.cellEmpty2;
        roundRect(x, y, CELL - 4, CELL - 4, 6);
        ctx.fill();
      }
    }

    // Subtle border
    ctx.strokeStyle = C.cellLine;
    ctx.lineWidth = 1;
    roundRect(GRID_X - 0.5, GRID_Y - 0.5, GRID_W + 1, GRID_H + 1, 8);
    ctx.stroke();
  }

  function drawTileAt(x, y, sz, letter, body, top, opacity) {
    ctx.save();
    ctx.globalAlpha = opacity != null ? opacity : 1;
    // Body
    ctx.fillStyle = body;
    roundRect(x, y, sz, sz, 7);
    ctx.fill();
    // Highlight strip (top quarter)
    ctx.fillStyle = top;
    roundRect(x + 3, y + 3, sz - 6, sz * 0.36, 5);
    ctx.fill();
    // Letter
    ctx.fillStyle = C.tileFace;
    ctx.font = '800 ' + Math.floor(sz * 0.6) + 'px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x + sz / 2, y + sz / 2 + 2);
    ctx.restore();
  }

  function drawPlacedTiles() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = grid[r][c];
        if (!t) continue;
        const x = GRID_X + c * CELL + 2;
        const y = GRID_Y + r * CELL + 2;
        drawTileAt(x, y, CELL - 4, t.letter, t.body, t.top, 1);
      }
    }
  }

  function drawActiveTile() {
    if (!active || gameOver) return;
    const x = GRID_X + active.col * CELL + 2;
    const y = active.y + 2;
    const [body, top] = tileColor();
    // Drop shadow guide at landing row
    const landRow = lowestEmpty(active.col);
    if (landRow !== -1) {
      const ly = GRID_Y + landRow * CELL + 2;
      ctx.fillStyle = C.accent;
      ctx.globalAlpha = 0.2;
      roundRect(x, ly, CELL - 4, CELL - 4, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawTileAt(x, y, CELL - 4, active.letter, body, top, 1);
  }

  function drawClearFlashes(now) {
    for (let i = clearFlashes.length - 1; i >= 0; i--) {
      const f = clearFlashes[i];
      const t = (now - f.startAt) / 420;
      if (t >= 1) { clearFlashes.splice(i, 1); continue; }
      const alpha = 1 - t;
      ctx.fillStyle = C.flashGood;
      ctx.globalAlpha = alpha * 0.65;
      for (const { r, c } of f.cells) {
        const x = GRID_X + c * CELL + 2;
        const y = GRID_Y + r * CELL + 2;
        const sz = (CELL - 4) * (1 + t * 0.3);
        const ox = (sz - (CELL - 4)) / 2;
        roundRect(x - ox, y - ox, sz, sz, 8);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawHintRow() {
    // Vertically centred in the space between the bottom of the grid (GRID_Y+GRID_H)
    // and the bottom of the canvas (H).
    const y = GRID_Y + GRID_H + (H - (GRID_Y + GRID_H)) / 2;
    ctx.font = '500 11px Inter, sans-serif';
    ctx.fillStyle = C.textMute;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('← →  MOVE   ·   ↓ / SPACE  FAST DROP   ·   CLICK A COLUMN TO DROP', W / 2, y);
  }

  function drawGameOver() {
    // Dark-tinted overlay so verdict text reads cleanly over any board state.
    ctx.fillStyle = 'rgba(14, 23, 38, 0.92)';
    roundRect(GRID_X - 10, GRID_Y - 10, GRID_W + 20, GRID_H + 20, 14);
    ctx.fill();

    const midX = W / 2;
    const midY = GRID_Y + GRID_H / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = '700 12px Inter, sans-serif';
    ctx.fillStyle = C.accent;
    ctx.fillText('STACK FILLED', midX, midY - 80);

    ctx.font = '800 56px Inter, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(score), midX, midY - 24);
    ctx.font = '500 12px Inter, sans-serif';
    ctx.fillStyle = C.textDim;
    ctx.fillText('FINAL SCORE', midX, midY + 8);

    ctx.font = '700 14px Inter, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(wordsFound + ' WORDS · ' + lettersDropped + ' LETTERS', midX, midY + 36);

    // Pill button — generous internal padding (≥36 px each side, 14 px top/bottom)
    const btnW = 280, btnH = 52;
    const bx = midX - btnW / 2;
    const by = midY + 60;
    ctx.fillStyle = C.accent;
    roundRect(bx, by, btnW, btnH, btnH / 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 13px Inter, sans-serif';
    ctx.fillText('PLAY AGAIN  ·  PRESS ENTER', midX, by + btnH / 2 + 1);
  }

  // ---------- LOOP ----------
  function loop(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    // Background
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    drawHUD();
    drawPlayfield();
    drawPlacedTiles();
    drawClearFlashes(now);

    // Advance active tile
    if (active && !gameOver) {
      active.y += active.vy * dt;
      // Auto-snap when reached landing row
      const landRow = lowestEmpty(active.col);
      const landY = landRow === -1 ? GRID_Y + GRID_H : GRID_Y + landRow * CELL;
      if (active.y >= landY) {
        active.y = landY;
        lockTile();
      }
    }
    drawActiveTile();
    drawHintRow();

    if (gameOver) drawGameOver();

    requestAnimationFrame(loop);
  }

  // ---------- START ----------
  // Wait for the splash overlay to finish before starting the game, so the
  // first tile doesn't drop while the splash is still visible. The splash
  // dispatches `splash-done` when it removes itself (see index.html). If no
  // splash is on the page, start immediately.
  if (document.getElementById('splash')) {
    window.addEventListener('splash-done', initGame, { once: true });
  } else {
    initGame();
  }
})();
