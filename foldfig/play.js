/* ============================================================
   FOLD · FIGURES — prototype

   The shipped Fold asks you to land a dot on a ring. This asks you to
   reassemble a picture: the figure is sliced into tiles, the tiles are
   scattered across the sheet, and folding brings them back together.

   WHY THIS GIVES FOLD A FAILURE STANDARD. In the shipped game you cannot be
   wrong, only unfinished — a dot is either on its ring or it is not, and undo
   always rescues you. Here a wrong fold is visible: the picture assembles
   crooked, or mirrored, or a tile lands on top of another. You can see you
   have broken it, which is the thing a puzzle needs in order to feel like it
   has stakes.

   THE MIRROR IS THE WHOLE TRICK. Folding paper reflects it, so a tile that has
   been folded an odd number of times arrives back-to-front. The generator
   stores each fragment PRE-mirrored by exactly the parity its journey will
   apply, so the correct fold sequence cancels it out. On the flat sheet the
   fragments therefore look wrong on purpose, and snapping them the right way
   round is most of the satisfaction.

   Fold maths (applyFold / foldDims / foldAt) is lifted from fold/play.js so
   the two games stay in agreement about what a fold is.
   ============================================================ */
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let CW = 560, CH = 720;

  const isMobile = () => matchMedia('(pointer: coarse)').matches ||
    (window.innerWidth > 0 && window.innerWidth < 768);

  // ---------- palette ----------
  const BG = '#0E1726', PAPER = '#F3EEE3', PAPER_EDGE = '#cdc4b0';
  const CREASE = 'rgba(60,66,80,0.30)';
  const INK = '#1F3A5F';                 // figure ink on paper
  const GOOD = '#3DDC84', WARN = '#E8B54D';

  const FIGURES = window.FOLD_FIGURES || [];
  const FIG_PX = 600;                    // offscreen resolution for the figure

  // ---------- state ----------
  let CELL = 70, origW = 6, origH = 6;
  let x0, y0, W, H, grid;
  let gw = 3, gh = 3;                    // figure tile grid (always square)
  let figIdx = 0, figCanvas = null;
  let tilesTotal = 0;
  let level = 1, moves = 0, phase = 'play';
  let history = [], solution = [], hintsUsed = 0;
  let boardOX = 0, boardOY = 0, FSCALE = 1;
  let uiButtons = [];
  const fs = (px) => Math.round(px * FSCALE);

  // ---------- fold maths (same rules as fold/play.js) ----------
  function applyFold(f, r, c) {
    if (f.axis === 'V') {
      if (f.side === 'R') { if (c >= f.k) c = 2 * f.k - 1 - c; }
      else { if (c < f.k) c = f.k - 1 - c; else c = c - f.k; }
    } else {
      if (f.side === 'B') { if (r >= f.k) r = 2 * f.k - 1 - r; }
      else { if (r < f.k) r = f.k - 1 - r; else r = r - f.k; }
    }
    return [r, c];
  }
  // Does this cell sit on the flap that actually flips? Only those cells get
  // mirrored — the ones that merely shift keep their handedness.
  function foldFlips(f, r, c) {
    if (f.axis === 'V') return f.side === 'R' ? c >= f.k : c < f.k;
    return f.side === 'B' ? r >= f.k : r < f.k;
  }
  function foldDims(f, w, h) {
    if (f.axis === 'V') return [f.side === 'R' ? f.k : w - f.k, h];
    return [w, f.side === 'B' ? f.k : h - f.k];
  }
  function foldAt(axis, k, w, h) {
    if (axis === 'V') return { axis, k, side: (w - k <= k) ? 'R' : 'L' };
    return { axis, k, side: (h - k <= k) ? 'B' : 'T' };
  }
  function doFold(f) {
    const [nw, nh] = foldDims(f, W, H);
    const ng = Array.from({ length: nh }, () => Array.from({ length: nw }, () => []));
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (!grid[r][c].length) continue;
      const [r2, c2] = applyFold(f, r, c);
      if (r2 < 0 || r2 >= nh || c2 < 0 || c2 >= nw) continue;
      const flips = foldFlips(f, r, c);
      for (const m of grid[r][c]) {
        ng[r2][c2].push(flips
          ? { tr: m.tr, tc: m.tc, fx: f.axis === 'V' ? m.fx ^ 1 : m.fx, fy: f.axis === 'H' ? m.fy ^ 1 : m.fy }
          : m);
      }
    }
    if (f.side === 'L') x0 += f.k;
    if (f.side === 'T') y0 += f.k;
    W = nw; H = nh; grid = ng;
  }

  function snapshot() { return { x0, y0, W, H, moves, grid: grid.map(row => row.map(cell => cell.map(m => ({ ...m })))) }; }
  function restore(s) { x0 = s.x0; y0 = s.y0; W = s.W; H = s.H; moves = s.moves; grid = s.grid.map(row => row.map(cell => cell.map(m => ({ ...m })))); phase = 'play'; }

  // A tile is home when it is in its own cell AND the right way round. Mirrored
  // tiles are deliberately NOT counted — a back-to-front piece of a picture is
  // wrong, and saying so is what makes the mirror mechanic legible.
  function placedCount() {
    if (W !== gw || H !== gh) return 0;
    let n = 0;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++)
      for (const m of grid[r][c]) if (m.tr === r && m.tc === c && !m.fx && !m.fy) n++;
    return n;
  }
  const solved = () => placedCount() === tilesTotal;

  // ---------- figure raster ----------
  // Drawn once per level into an offscreen canvas. Tiles are then blitted from
  // it, which keeps the per-frame cost to a handful of drawImage calls and lets
  // us measure ink coverage by sampling instead of guessing.
  function rasterFigure(i) {
    const cv = document.createElement('canvas');
    cv.width = FIG_PX; cv.height = FIG_PX;
    const g = cv.getContext('2d');
    g.save(); g.scale(FIG_PX, FIG_PX);
    g.lineJoin = 'round';
    FIGURES[i].draw(g, INK);
    g.restore();
    return cv;
  }
  // Which tiles actually carry ink? A blank slice of the picture is not worth
  // scattering — there would be nothing to see and nothing to place.
  function inkedTiles(cv, cols, rows) {
    const g = cv.getContext('2d'), out = [];
    const tw = Math.floor(FIG_PX / cols), th = Math.floor(FIG_PX / rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const d = g.getImageData(c * tw, r * th, tw, th).data;
      let ink = 0;
      for (let p = 3; p < d.length; p += 4 * 7) if (d[p] > 40) ink++;
      const frac = ink / (d.length / (4 * 7));
      if (frac > 0.06) out.push({ r, c, frac });      // 6% of the tile inked
    }
    return out;
  }

  // ---------- generation ----------
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]]; } };

  function curve(lvl) {
    // Figure grid grows 3x3 -> 4x4; folds grow 2 -> 5.
    const g = lvl <= 6 ? 3 : 4;
    const folds = Math.min(5, 2 + Math.floor((lvl - 1) / 2));
    return { g, folds };
  }

  const MAX_SIDE = 10;                     // keep cells big enough to tap

  // Build the level by UNFOLDING from the finished picture, which guarantees a
  // solution exists instead of hoping a random sequence happens to have one.
  //
  // Unfolding along V: the sheet grows from cw to cw + m, where the flap m must
  // be no larger than the base (the game only ever folds the SMALLER flap).
  // Two placements, and foldAt picks the side for us from the dimensions:
  //   base on the left  -> the undoing fold is k = cw  (side R)
  //   base on the right -> the undoing fold is k = m   (side L, when m < cw)
  // Using a random m rather than always halving is what stops the answer from
  // being "fold it in half, repeatedly" every single time.
  function buildFolds(g, folds) {
    let cw = g, ch = g;
    const unfolds = [];
    for (let i = 0; i < folds; i++) {
      const canV = cw < MAX_SIDE, canH = ch < MAX_SIDE;
      if (!canV && !canH) break;
      // grow the smaller side, so the sheet stays roughly square
      let axis;
      if (canV && canH) axis = cw < ch ? 'V' : (ch < cw ? 'H' : (Math.random() < 0.5 ? 'V' : 'H'));
      else axis = canV ? 'V' : 'H';
      const base = axis === 'V' ? cw : ch;
      const room = Math.min(base, MAX_SIDE - base);
      if (room < 1) break;
      const m = 1 + ((Math.random() * room) | 0);
      const baseLeft = m === base ? true : Math.random() < 0.5;
      const k = baseLeft ? base : m;
      if (axis === 'V') cw += m; else ch += m;
      unfolds.push({ axis, k });
    }
    return { w0: cw, h0: ch, seq: unfolds.slice().reverse() };
  }

  function genLevel(lvl) {
    const { g, folds } = curve(lvl);
    for (let attempt = 0; attempt < 400; attempt++) {
      const { w0, h0, seq } = buildFolds(g, folds);
      if (seq.length < 2) continue;

      // Forward-simulate that sequence, tracking where every original cell
      // lands and how many times it got flipped on the way.
      const pos = [];
      for (let r = 0; r < h0; r++) for (let c = 0; c < w0; c++) pos.push({ r0: r, c0: c, r, c, fx: 0, fy: 0 });
      let sw = w0, sh = h0, bad = false;
      for (const s of seq) {
        if (s.k < 1 || s.k >= (s.axis === 'V' ? sw : sh)) { bad = true; break; }
        const f = foldAt(s.axis, s.k, sw, sh);
        for (const p of pos) {
          const flips = foldFlips(f, p.r, p.c);
          const [r2, c2] = applyFold(f, p.r, p.c);
          p.r = r2; p.c = c2;
          if (flips) { if (s.axis === 'V') p.fx ^= 1; else p.fy ^= 1; }
        }
        [sw, sh] = foldDims(f, sw, sh);
      }
      if (bad || sw !== g || sh !== g) continue;

      // Pick the figure and find its inked tiles.
      const fi = (Math.random() * FIGURES.length) | 0;
      const raster = rasterFigure(fi);
      const tiles = inkedTiles(raster, g, g);
      if (tiles.length < Math.round(g * g * 0.45)) continue;   // too sparse to read

      const groups = {};
      for (const p of pos) (groups[p.r + ',' + p.c] ||= []).push(p);

      // Scatter: each inked tile is stored on ONE original cell of its group,
      // pre-mirrored so the fold sequence cancels the flip. Prefer an origin
      // that is not already sitting in the answer, or the level solves itself.
      const g2 = Array.from({ length: h0 }, () => Array.from({ length: w0 }, () => []));
      let placedAtHome = 0;
      for (const t of tiles) {
        const cand = groups[t.r + ',' + t.c] || [];
        if (!cand.length) { placedAtHome = -1; break; }
        const moved = cand.filter(p => p.r0 !== t.r || p.c0 !== t.c || p.fx || p.fy);
        const pick = (moved.length ? moved : cand)[(Math.random() * (moved.length ? moved.length : cand.length)) | 0];
        g2[pick.r0][pick.c0].push({ tr: t.r, tc: t.c, fx: pick.fx, fy: pick.fy });
        if (pick.r0 === t.r && pick.c0 === t.c && !pick.fx && !pick.fy) placedAtHome++;
      }
      if (placedAtHome < 0) continue;
      if (placedAtHome === tiles.length) continue;             // nothing to do

      origW = w0; origH = h0; x0 = 0; y0 = 0; W = w0; H = h0;
      gw = gh = g; figIdx = fi; figCanvas = raster; tilesTotal = tiles.length;
      grid = g2;

      // Prove it: replay the recorded sequence and require a genuine win.
      const save = snapshot();
      for (const s of seq) doFold(foldAt(s.axis, s.k, W, H));
      const ok = solved();
      restore(save);
      if (!ok) continue;
      solution = seq.slice();
      return true;
    }
    return false;
  }

  // ---------- layout ----------
  function setCanvasVars() {
    if (isMobile()) { CW = window.innerWidth || 390; CH = window.innerHeight || 740; }
    else { CW = 560; CH = 720; }
    document.body.style.setProperty('--canvas-w', CW + 'px');
    document.body.style.setProperty('--canvas-h', CH + 'px');
  }
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const r = canvas.getBoundingClientRect();
    const bW = Math.round((r.width || CW) * dpr), bH = Math.round((r.height || CH) * dpr);
    if (canvas.width !== bW) canvas.width = bW;
    if (canvas.height !== bH) canvas.height = bH;
    const s = Math.min(bW / CW, bH / CH);
    ctx.setTransform(s, 0, 0, s, 0, 0);
  }
  function computeLayout() {
    const topBand = Math.round(150 * Math.min(1.15, Math.max(0.9, CH / 720)));
    // Deep enough to hold the control row AND the win banner below the board.
    // At 120 the banner had nowhere to go but on top of the HUD, where it ran
    // straight through the target thumbnail.
    const botBand = Math.round(168 * Math.min(1.15, Math.max(0.9, CH / 720)));
    const availW = Math.max(60, CW - 28);
    const availH = Math.max(60, CH - topBand - botBand);
    const cells = Math.max(origW, origH, 1);
    CELL = Math.max(12, Math.floor(Math.min(availW, availH) / cells));
    boardOX = Math.round((CW - origW * CELL) / 2);
    boardOY = Math.round(topBand + (availH - origH * CELL) / 2);
    FSCALE = Math.max(0.8, Math.min(1.6, Math.min(CW, CH) / 560));
  }
  const cellX = (c) => boardOX + (x0 + c) * CELL;
  const cellY = (r) => boardOY + (y0 + r) * CELL;

  // ---------- drawing ----------
  function drawTile(m, X, Y, size) {
    if (!figCanvas) return;
    const sw = FIG_PX / gw, sh = FIG_PX / gh;
    ctx.save();
    ctx.beginPath(); ctx.rect(X, Y, size, size); ctx.clip();
    if (m.fx || m.fy) {
      ctx.translate(X + size / 2, Y + size / 2);
      ctx.scale(m.fx ? -1 : 1, m.fy ? -1 : 1);
      ctx.translate(-(X + size / 2), -(Y + size / 2));
    }
    ctx.drawImage(figCanvas, m.tc * sw, m.tr * sh, sw, sh, X, Y, size, size);
    ctx.restore();
  }

  function drawBoard() {
    // sheet
    ctx.fillStyle = PAPER;
    ctx.fillRect(cellX(0), cellY(0), W * CELL, H * CELL);
    // creases
    ctx.strokeStyle = CREASE; ctx.lineWidth = 1;
    for (let c = 1; c < W; c++) {
      ctx.beginPath(); ctx.moveTo(cellX(c), cellY(0)); ctx.lineTo(cellX(c), cellY(0) + H * CELL); ctx.stroke();
    }
    for (let r = 1; r < H; r++) {
      ctx.beginPath(); ctx.moveTo(cellX(0), cellY(r)); ctx.lineTo(cellX(0) + W * CELL, cellY(r)); ctx.stroke();
    }
    // tiles
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const stack = grid[r][c];
      if (!stack.length) continue;
      const X = cellX(c), Y = cellY(r);
      for (const m of stack) drawTile(m, X, Y, CELL);
      // A cell holding more than one tile can never be right — say so, rather
      // than letting the player wonder why the picture looks muddy.
      if (stack.length > 1) {
        ctx.strokeStyle = 'rgba(214,64,52,0.95)'; ctx.lineWidth = 2.5;
        ctx.strokeRect(X + 2, Y + 2, CELL - 4, CELL - 4);
      } else if (W === gw && H === gh) {
        const m = stack[0], home = m.tr === r && m.tc === c;
        if (home && (m.fx || m.fy)) {                       // right cell, wrong way round
          ctx.strokeStyle = 'rgba(232,181,77,0.95)'; ctx.lineWidth = 2.5;
          ctx.strokeRect(X + 2, Y + 2, CELL - 4, CELL - 4);
        }
      }
    }
    ctx.strokeStyle = PAPER_EDGE; ctx.lineWidth = 2;
    ctx.strokeRect(cellX(0), cellY(0), W * CELL, H * CELL);
  }

  function drawTarget(cx, cy, box) {
    if (!figCanvas) return;
    ctx.save();
    ctx.globalAlpha = 0.20;
    ctx.drawImage(figCanvas, 0, 0, FIG_PX, FIG_PX, cx - box / 2, cy - box / 2, box, box);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1;
    ctx.strokeRect(cx - box / 2, cy - box / 2, box, box);
  }

  function pill(label, cx, cy, id, dim, act) {
    ctx.font = '700 ' + fs(14) + 'px Inter, sans-serif';
    const w = Math.round(ctx.measureText(label).width + fs(34)), h = fs(38);
    const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.42)'; roundRect(x, y, w, h, h / 2); ctx.stroke();
    ctx.fillStyle = dim ? 'rgba(255,255,255,0.58)' : 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, y + h / 2 + 1);
    ctx.textBaseline = 'top';
    if (!dim) uiButtons.push({ x, y, w, h, id, act });
    return w;
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function render() {
    uiButtons = [];
    ctx.setTransform(1, 0, 0, 1, 0, 0); resizeCanvas();
    ctx.fillStyle = BG; ctx.fillRect(0, 0, CW, CH);

    const placed = placedCount();
    const pct = tilesTotal ? Math.round(100 * placed / tilesTotal) : 0;

    // HUD
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff'; ctx.font = '800 ' + fs(26) + 'px Inter, sans-serif';
    ctx.fillText('FOLD', fs(20), fs(16));
    ctx.font = '600 ' + fs(14) + 'px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillText('Level ' + level + '   ·   ' + moves + (moves === 1 ? ' fold' : ' folds'), fs(20), fs(16) + fs(30));

    // target + progress
    const box = fs(78);
    drawTarget(CW - fs(20) - box / 2, fs(16) + box / 2, box);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.86)'; ctx.font = '700 ' + fs(13) + 'px Inter, sans-serif';
    ctx.fillText('MAKE THE ' + FIGURES[figIdx].name.toUpperCase(), CW - fs(20), fs(16) + box + fs(8));
    ctx.fillStyle = pct === 100 ? GOOD : (pct > 0 ? WARN : 'rgba(255,255,255,0.6)');
    ctx.font = '800 ' + fs(15) + 'px Inter, sans-serif';
    ctx.fillText(placed + ' / ' + tilesTotal + ' pieces in place', CW - fs(20), fs(16) + box + fs(26));

    drawBoard();

    // controls
    ctx.textAlign = 'center';
    const cy = CH - fs(70), gap = fs(9);
    const row = [
      ['Undo', 'undo', !history.length, undo],
      ['Restart', 'restart', false, () => startLevel(level)],
      ['Hint', 'hint', false, hint],
      ['New', 'new', false, () => startLevel(level + 1)],
    ];
    ctx.font = '700 ' + fs(14) + 'px Inter, sans-serif';
    let total = 0;
    for (const [t] of row) total += Math.round(ctx.measureText(t).width + fs(34)) + gap;
    total -= gap;
    let x = Math.round(CW / 2 - total / 2);
    for (const [t, id, dim, act] of row) {
      ctx.font = '700 ' + fs(14) + 'px Inter, sans-serif';
      const w = pill(t, x + Math.round(ctx.measureText(t).width + fs(34)) / 2, cy, id, dim, act);
      x += w + gap;
    }

    // Say what is wrong, in words. A puzzle you can lose has to tell you that
    // you have lost, or "no way to win from here" just reads as "still going".
    let status = 'Tap a crease to fold the smaller flap over.', tone = 'rgba(255,255,255,0.82)';
    if (phase === 'won') {
      status = 'Tap for the next figure';
    } else {
      let flipped = 0, stacked = 0;
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        const st = grid[r][c];
        if (st.length > 1) stacked++;
        for (const m of st) if (m.tr === r && m.tc === c && (m.fx || m.fy)) flipped++;
      }
      if (W < gw || H < gh) {
        status = 'Folded too far — the sheet is now smaller than the figure. Undo, or restart.';
        tone = '#F08A7E';
      } else if (stacked) {
        status = stacked + (stacked === 1 ? ' cell has' : ' cells have') + ' two pieces stacked — undo and fold elsewhere.';
        tone = '#F08A7E';
      } else if (flipped) {
        status = flipped + (flipped === 1 ? ' piece is' : ' pieces are') + ' in the right cell but mirrored.';
        tone = WARN;
      }
    }
    ctx.fillStyle = tone; ctx.font = '500 ' + fs(14) + 'px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(status, CW / 2, CH - fs(34));

    if (phase === 'won') {
      // Below the board, in the band the layout reserves for it — never over the
      // HUD, and never over the picture the player just finished assembling.
      const boardBot = boardOY + origH * CELL;
      const rowTop = cy - fs(19);
      ctx.fillStyle = GOOD; ctx.font = '800 ' + fs(26) + 'px Inter, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(FIGURES[figIdx].name.toUpperCase() + ' COMPLETE', CW / 2, boardBot + (rowTop - boardBot) / 2);
      ctx.textBaseline = 'top';
    }
    ctx.textAlign = 'left';
  }

  // ---------- actions ----------
  function undo() { if (history.length) { restore(history.pop()); render(); } }
  function hint() {
    // Replays the recorded solution from the current position if the player is
    // still on it; otherwise says so rather than folding them somewhere wrong.
    if (moves >= solution.length) return;
    const f = foldAt(solution[moves].axis, solution[moves].k, W, H);
    if (solution[moves].k >= (f.axis === 'V' ? W : H)) return;
    history.push(snapshot()); doFold(f); moves++; hintsUsed++;
    if (solved()) phase = 'won';
    render();
  }
  function startLevel(lvl) {
    level = Math.max(1, lvl);
    moves = 0; history = []; hintsUsed = 0; phase = 'play';
    if (!genLevel(level)) { level = 1; genLevel(1); }
    computeLayout(); render();
  }

  // ---------- input ----------
  function toLocal(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (CW / r.width), y: (e.clientY - r.top) * (CH / r.height) };
  }
  // Which crease did they tap? Nearest grid line within half a cell.
  function creaseAt(x, y) {
    const bx = cellX(0), by = cellY(0), bw = W * CELL, bh = H * CELL;
    if (x < bx - CELL * 0.4 || x > bx + bw + CELL * 0.4) return null;
    if (y < by - CELL * 0.4 || y > by + bh + CELL * 0.4) return null;
    let best = null, bestD = CELL * 0.42;
    for (let c = 1; c < W; c++) {
      const d = Math.abs(x - (bx + c * CELL));
      if (d < bestD && y >= by && y <= by + bh) { bestD = d; best = { axis: 'V', k: c }; }
    }
    for (let r = 1; r < H; r++) {
      const d = Math.abs(y - (by + r * CELL));
      if (d < bestD && x >= bx && x <= bx + bw) { bestD = d; best = { axis: 'H', k: r }; }
    }
    return best;
  }
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const { x, y } = toLocal(e);
    for (const b of uiButtons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.act(); return; }
    if (phase === 'won') { startLevel(level + 1); return; }
    const cr = creaseAt(x, y);
    if (!cr) return;
    history.push(snapshot());
    doFold(foldAt(cr.axis, cr.k, W, H));
    moves++;
    if (solved()) phase = 'won';
    render();
  });

  function onResize() { setCanvasVars(); resizeCanvas(); computeLayout(); render(); }
  window.addEventListener('resize', onResize);
  window.addEventListener('splash-done', onResize);

  // ---------- debug surface ----------
  window.__foldfig = {
    get state() {
      return {
        level, moves, phase, sheet: origW + 'x' + origH, footprint: W + 'x' + H,
        figure: FIGURES[figIdx] && FIGURES[figIdx].name, grid: gw + 'x' + gh,
        tilesTotal, placed: placedCount(), solutionLen: solution.length, solved: solved(),
      };
    },
    // What the board is actually showing: how many tiles are home, how many are
    // in the right cell but mirrored, and how many cells hold more than one
    // tile. This is the "you can see you broke it" signal, so it has to be
    // measurable rather than asserted.
    get cells() {
      let home = 0, flipped = 0, wrongCell = 0, collisions = 0, marks = 0;
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        const st = grid[r][c];
        if (st.length > 1) collisions++;
        for (const m of st) {
          marks++;
          const right = m.tr === r && m.tc === c;
          if (right && !m.fx && !m.fy) home++;
          else if (right) flipped++;
          else wrongCell++;
        }
      }
      return { footprint: W + 'x' + H, target: gw + 'x' + gh, marks, home, flipped, wrongCell, collisions };
    },
    // How many fragments are currently drawn mirrored. On a fresh sheet this is
    // the visible evidence of the mirror mechanic; if it were near zero the
    // pre-flipping would be doing nothing the player can see.
    get parity() {
      let mirrored = 0, marks = 0;
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) for (const m of grid[r][c]) {
        marks++; if (m.fx || m.fy) mirrored++;
      }
      return { marks, mirrored, pct: marks ? Math.round(100 * mirrored / marks) : 0 };
    },
    get buttons() { render(); return uiButtons.map(b => ({ id: b.id, cx: b.x + b.w / 2, cy: b.y + b.h / 2 })); },
    press(id) { render(); const b = uiButtons.find(z => z.id === id); if (!b) return 'no button ' + id; b.act(); return this.state; },
    goto(n) { startLevel(n); return this.state; },
    // Play the recorded solution straight through.
    solve() { let g = 0; while (moves < solution.length && g++ < 20) hint(); return this.state; },
    fold(axis, k) { history.push(snapshot()); doFold(foldAt(axis, k, W, H)); moves++; if (solved()) phase = 'won'; render(); return this.state; },
    figures: FIGURES.map(f => f.name),
    render,
  };

  // ---------- boot ----------
  setCanvasVars(); resizeCanvas();
  if (!FIGURES.length) {
    ctx.fillStyle = BG; ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = '#fff'; ctx.font = '600 16px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('figures.js did not load', CW / 2, CH / 2);
  } else {
    startLevel(1);
  }
})();
