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
  const GOOD = '#3DDC84', WARN = '#E8B54D', GOLD = '#FFC65C';
  // Bright fills, and they are compliant because of the LINEWORK, not the fill.
  // Measured on the cream paper: sky blue is 2.08:1 and sunflower 1.40:1, so
  // none of these would pass on their own. Every shape is stroked in LINE,
  // which is 14.11:1 against the paper, and that outline is what identifies the
  // figure — the fill inside it is then free to be as loud as we like.
  // All twelve also clear 3:1 against LINE (weakest: blue at 3.35:1), so
  // internal detail drawn in the line colour stays visible on top of them.
  const LINE = '#241F1A';
  const INKS = ['#E5342B', '#F5811F', '#FFC21A', '#7DC242', '#2FA84F', '#00A99D',
    '#35B5EC', '#2C6FD1', '#9A4FD6', '#D6249B', '#FF5B8D', '#4FD1A5'];
  let ink = INKS[0];

  const FIGURES = window.FOLD_FIGURES || [];
  const FIG_PX = 600;                    // offscreen resolution for the figure

  // ---------- state ----------
  let CELL = 70, origW = 6, origH = 6;
  let x0, y0, W, H, grid;
  let gw = 3, gh = 3;                    // figure tile grid (always square)
  let figIdx = 0, figCanvas = null, lastFigureName = null;
  let tilesTotal = 0;
  let level = 1, moves = 0, phase = 'play';
  let history = [], solution = [], hintsUsed = 0;
  let boardOX = 0, boardOY = 0, FSCALE = 1;
  let uiButtons = [];
  const fs = (px) => Math.round(px * FSCALE);

  // ---------- scoring (same shape as Orbit) ----------
  // The mode changed completely, so the old dot-and-ring level number means
  // nothing here — carrying it over would drop a returning player straight onto
  // a 4x4 five-fold board with no idea the rules had changed. Fresh keys, fresh
  // start, and the old zamborin-fold.level is simply left alone.
  const SCORE_KEY = 'zamborin-fold.figures.score', LEVEL_KEY = 'zamborin-fold.figures.level';
  let score = { total: 0, cleared: 0, best: 0 };
  let award = null, wonT = -1e9, cardAt = Infinity, cardFB = 0, raf = 0;
  // A level banks its score ONCE. Without this you can undo off the scorecard,
  // re-solve the same board and be paid again, forever.
  let banked = false;
  let lastCard = null;              // measured card box, for the layout harness
  // Hold the finished picture on screen before the scorecard arrives. Assembling
  // it is the payoff; covering it up a beat later throws that away.
  const WIN_DELAY = 2200, CARD_FADE = 520;

  function loadScore() {
    try {
      const v = JSON.parse(localStorage.getItem(SCORE_KEY) || 'null');
      if (v && typeof v.total === 'number') score = { total: v.total | 0, cleared: v.cleared | 0, best: v.best | 0 };
    } catch (_) { }
  }
  function saveScore() { try { localStorage.setItem(SCORE_KEY, JSON.stringify(score)); } catch (_) { } }
  function saveLevel(n) { try { localStorage.setItem(LEVEL_KEY, String(n)); } catch (_) { } }
  function loadLevelNo() { try { const v = parseInt(localStorage.getItem(LEVEL_KEY), 10); return (v >= 1 && v <= 999) ? v : 1; } catch (_) { return 1; } }

  function scoreLevel() {
    const base = 120 + 30 * Math.min(level, 25);
    const par = solution.length;
    // Folds beyond par erode the bonus; a hint spends a fold, so hints cost you
    // here rather than needing a rule of their own.
    const eff = par > 0 ? Math.min(1, par / Math.max(moves, par)) : 1;
    const parBonus = Math.round(base * 0.75 * eff);
    // FLAT, not a percentage. Orbit's gear bonus was a percentage and that
    // re-inverted the curve at high levels — an easier level outscoring a
    // harder one. A flat figure bonus cannot do that.
    const sizeBonus = gw >= 4 ? 40 : 0;
    return { base, par, parBonus, sizeBonus, moves, levelScore: base + parBonus + sizeBonus };
  }

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

  // ---------- artwork ----------
  // Real artwork, when there is any, beats the code-drawn figures. ART is
  // whatever art/manifest.json lists; the vectors stay as the fallback so the
  // game still runs with an empty folder.
  let ART = [];                       // { name, src, img, ready, w, h }
  const usingArt = () => ART.length > 0;
  const figureCount = () => (usingArt() ? ART.length : FIGURES.length);
  const figureName = (i) => (usingArt() ? ART[i].name : FIGURES[i].name);

  async function loadArt() {
    let list = [], version = 1;
    try {
      const res = await fetch('./art/manifest.json?v=5', { cache: 'no-cache' });
      if (res.ok) {
        const j = await res.json();
        list = Array.isArray(j.figures) ? j.figures : [];
        version = j.version || 1;
      }
    } catch (_) { /* no manifest, no artwork, vectors it is */ }
    // Photographs are heavy — the set is over a megabyte — so the game must not
    // wait for all of it before the first board appears. Each image is added to
    // ART the moment it decodes, and loadArt resolves as soon as ENOUGH are
    // ready to generate from. The rest arrive behind the player's back and
    // simply widen the pool.
    // The library is 147 pictures and roughly 8.5MB. Pulling all of it on every
    // visit would be indefensible on a phone, and pointless: a session plays a
    // handful of boards. Take a random sample instead — the pool is different
    // each time you come back, which is better variety than a fixed set, at a
    // fraction of the bytes.
    const POOL = 24;
    if (list.length > POOL) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      list = list.slice(0, POOL);
    }
    const START_WITH = Math.min(4, list.length);
    let ready = 0;
    return await new Promise(resolve => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(ART.length); } };
      if (!list.length) return done();
      for (const entry of list) {
        // Versioned: the filenames are stable across art revisions, so without
        // this a browser keeps showing the previous cut.
        const src = './art/' + entry.file + '?v=' + version;
        const img = new Image();
        img.onload = () => {
          ART.push({ name: entry.name || entry.file.replace(/\.[^.]+$/, ''),
                     src, img, ready: true, w: img.naturalWidth, h: img.naturalHeight });
          if (++ready >= START_WITH) done();
        };
        // A missing or broken file must not take the whole game down with it.
        img.onerror = () => { if (++ready >= START_WITH) done(); };
        img.src = src;
      }
      // If the network stalls, fall back to the drawn figures rather than hang.
      setTimeout(done, 6000);
    });
  }

  // Artwork is centre-cropped to a square, because the tile grid is square and
  // a non-square source would otherwise stretch the picture.
  function artSquare(a) {
    const s = Math.min(a.w, a.h);
    return { sx: (a.w - s) / 2, sy: (a.h - s) / 2, s };
  }

  // ---------- figure raster ----------
  // Built once per level into an offscreen canvas, and used ONLY to measure
  // which tiles carry content. Painting comes from the vector paths or the
  // source image directly, both of which beat a fixed-size raster.
  function rasterFigure(i, col) {
    const cv = document.createElement('canvas');
    cv.width = FIG_PX; cv.height = FIG_PX;
    const g = cv.getContext('2d');
    if (usingArt()) {
      const a = ART[i], q = artSquare(a);
      g.drawImage(a.img, q.sx, q.sy, q.s, q.s, 0, 0, FIG_PX, FIG_PX);
    } else {
      g.save(); g.scale(FIG_PX, FIG_PX);
      window.FOLD_DRAW_FIGURE(g, FIGURES[i], col, LINE);
      g.restore();
    }
    return cv;
  }
  // Which tiles actually carry ink? A blank slice of the picture is not worth
  // scattering — there would be nothing to see and nothing to place.
  // Which tiles actually carry picture? This decides what becomes a scattered
  // piece, and getting it wrong is fatal rather than cosmetic: a blank tile
  // that becomes a piece is interchangeable with every other blank, so two of
  // them in each other's places look perfectly assembled while the game says
  // unsolved. The player is right and the game is wrong.
  //
  // Alpha alone cannot do it. It works for the drawn figures, whose blank areas
  // are transparent, but a photograph is opaque everywhere and its white
  // surround reads exactly like content.
  //
  // Nor can variance alone: a tile in the middle of a solid-filled figure has
  // almost no variation and is certainly content.
  //
  // So a tile is blank when it is EITHER mostly transparent, OR near-white and
  // flat — which is what an empty corner of a cut-out photograph looks like,
  // and what a solid ink fill never does.
  const BLANK_LUM = 232, BLANK_VAR = 250;
  function inkedTiles(cv, cols, rows) {
    const g = cv.getContext('2d'), out = [];
    const tw = Math.floor(FIG_PX / cols), th = Math.floor(FIG_PX / rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const d = g.getImageData(c * tw, r * th, tw, th).data;
      let ink = 0, n = 0, sum = 0, sum2 = 0;
      for (let p = 0; p < d.length; p += 4 * 7) {
        n++;
        const a = d[p + 3];
        if (a > 40) ink++;
        // transparent counts as paper, so a transparent tile reads as flat too
        const v = a > 40 ? (0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]) : 250;
        sum += v; sum2 += v * v;
      }
      const frac = ink / n, mean = sum / n;
      const variance = Math.max(0, sum2 / n - mean * mean);
      if (frac <= 0.06) continue;                               // nothing there
      if (mean > BLANK_LUM && variance < BLANK_VAR) continue;   // blank paper
      out.push({ r, c, frac, variance: Math.round(variance), sig: tileSig(cv, c * tw, r * th, tw, th) });
    }
    return out;
  }

  // A small greyscale thumbprint of a tile, for telling two pieces apart.
  const SIG_N = 8;
  function tileSig(cv, sx, sy, sw, sh) {
    const o = document.createElement('canvas');
    o.width = o.height = SIG_N;
    const g = o.getContext('2d');
    g.drawImage(cv, sx, sy, sw, sh, 0, 0, SIG_N, SIG_N);
    const d = g.getImageData(0, 0, SIG_N, SIG_N).data, out = [];
    for (let i = 0; i < d.length; i += 4)
      out.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    return out;
  }
  // Two pieces that LOOK the same can be swapped: the picture reads as finished
  // while the game says unsolved. Threshold tuning cannot fix this, because the
  // culprits are not blank tiles but genuinely similar CONTENT — several tiles
  // of a uniform fish belly really are identical. So it is a validity check:
  // a figure that cannot be cut into distinct pieces at this grid size is not
  // used at this grid size.
  const SIG_TOL = 9;
  function tilesDistinct(tiles) {
    for (let i = 0; i < tiles.length; i++)
      for (let j = i + 1; j < tiles.length; j++) {
        let diff = 0;
        for (let k = 0; k < SIG_N * SIG_N; k++) diff += Math.abs(tiles[i].sig[k] - tiles[j].sig[k]);
        if (diff / (SIG_N * SIG_N) < SIG_TOL) return false;
      }
    return true;
  }

  // ---------- generation ----------
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]]; } };

  function curve(lvl) {
    // 3x3 is the on-ramp and 4x4 is the game. It used to run to level 6, but
    // far fewer figures survive being cut into nine pieces than sixteen — a
    // 3x3 tile is a big slice, so more of them come out near-identical and get
    // rejected. Six levels drawn from that small pool repeated visibly. Three
    // levels is still a real introduction and reaches the full set sooner.
    const g = lvl <= 3 ? 3 : 4;
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
      // Not the figure the previous level used. With a small qualifying pool
      // the same subject came up back to back, which reads as a bug even when
      // the board is completely different.
      let fi = (Math.random() * figureCount()) | 0;
      if (figureCount() > 1 && figureName(fi) === lastFigureName) fi = (fi + 1) % figureCount();
      // Ink is chosen from the level number, not at random, so restarting a
      // level gives you back the same picture you were working on.
      const col = INKS[(lvl - 1) % INKS.length];
      const raster = rasterFigure(fi, col);
      const tiles = inkedTiles(raster, g, g);
      if (tiles.length < Math.max(4, Math.round(g * g * 0.40))) continue;  // too sparse to read
      if (!tilesDistinct(tiles)) continue;                     // ambiguous pieces

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
      gw = gh = g; figIdx = fi; figCanvas = raster; tilesTotal = tiles.length; ink = col;
      lastFigureName = figureName(fi);
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
  // The prototype ran on a bare page and never needed this, but the shipped
  // shell keys off it: shared/chrome.css hangs the splash artwork and the
  // mobile full-screen rules on body.mode-*, so without the class the splash
  // renders as a blank panel. Set once — the mode cannot change mid-session.
  document.body.classList.add('mode-' + (isMobile() ? 'mobile' : 'desktop'));
  const DESK = !isMobile();
  function setCanvasVars() {
    if (isMobile()) { CW = window.innerWidth || 390; CH = window.innerHeight || 740; }
    // One desktop frame across the whole site: 760x600. Eight different sizes
    // had grown up across thirteen games, which reads as carelessness. This is
    // Untangle's, and it is sized so the game plus a 300px sidebar ad fits the
    // page without either being squashed.
    else { CW = 760; CH = 600; }
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
  // Width the reference card and its piece count need down the right-hand side.
  // The sheet is squarish and the frame is landscape, so that column costs the
  // board nothing: height is what limits the cell either way.
  const CARD_COL = () => (DESK ? 132 : 0);
  function computeLayout() {
    // The name is off the playing screen, so the top band is just the control
    // row and the read-out. It was 135px of chrome in a 600px frame.
    const topBand = DESK ? 56 : Math.round(150 * Math.min(1.15, Math.max(0.9, CH / 720)));
    // Still deep enough to hold the win banner below the board — that card has
    // to land somewhere, and at 120 it used to run through the HUD.
    const botBand = DESK ? 96 : Math.round(168 * Math.min(1.15, Math.max(0.9, CH / 720)));
    const PAD = DESK ? 18 : 14;                 // breathing room around the sheet
    const availW = Math.max(60, CW - PAD * 2 - CARD_COL());
    const availH = Math.max(60, CH - topBand - botBand - PAD);
    // Fit each axis to its OWN extent. Dividing both by max(origW, origH) meant
    // a 6-wide by 4-tall sheet was sized as though it were 6 tall, so it never
    // used the height it had — and a small grid just sat in the middle of the
    // frame looking lost.
    CELL = Math.max(12, Math.floor(Math.min(availW / Math.max(1, origW),
                                            availH / Math.max(1, origH))));
    boardOX = Math.round(PAD + (availW - origW * CELL) / 2);
    boardOY = Math.round(topBand + PAD / 2 + (availH - origH * CELL) / 2);
    FSCALE = Math.max(0.8, Math.min(1.6, Math.min(CW, CH) / 560));
  }
  // While playing, the sheet stays put inside its original frame so folds read
  // as folds. On a win the finished picture is presented instead: centred and
  // pinned to the top of the board band, which both makes it the hero and
  // guarantees the scorecard has somewhere to sit below it. Left where the
  // folds happened to end, it could be low enough that the card had to cover it.
  const originX = () => phase === 'won' ? Math.round((CW - W * CELL) / 2) - x0 * CELL : boardOX;
  const originY = () => phase === 'won' ? boardOY - y0 * CELL : boardOY;
  const cellX = (c) => originX() + (x0 + c) * CELL;
  const cellY = (r) => originY() + (y0 + r) * CELL;

  // ---------- drawing ----------
  // Tiles are drawn as LIVE VECTOR, not blitted from the raster. The raster is
  // still built at generation time, but only to measure which tiles carry ink —
  // using it to paint would cap the artwork at 600px, which on a 4x4 grid is
  // 150px of source stretched across a retina tile. Re-running the paths costs
  // a handful of fills per frame and is resolution-independent at any zoom,
  // canvas size or device pixel ratio.
  function drawTile(m, X, Y, size) {
    ctx.save();
    ctx.beginPath(); ctx.rect(X, Y, size, size); ctx.clip();
    if (m.fx || m.fy) {
      ctx.translate(X + size / 2, Y + size / 2);
      ctx.scale(m.fx ? -1 : 1, m.fy ? -1 : 1);
      ctx.translate(-(X + size / 2), -(Y + size / 2));
    }
    if (usingArt()) {
      // Sliced straight out of the source image at its native resolution —
      // no intermediate raster, so the artwork is only ever downscaled.
      const a = ART[figIdx], q = artSquare(a);
      const t = q.s / gw;
      ctx.drawImage(a.img, q.sx + m.tc * t, q.sy + m.tr * t, t, t, X, Y, size, size);
    } else {
      // Live vector: lay the whole figure down at the size the tile grid
      // implies, positioned so this tile's slice lands inside the clip.
      ctx.translate(X - m.tc * size, Y - m.tr * size);
      ctx.scale(gw * size, gh * size);
      window.FOLD_DRAW_FIGURE(ctx, FIGURES[figIdx], ink, LINE);
    }
    ctx.restore();
  }

  function drawBoard() {
    // sheet — rounded corners, clipped so the creases and tiles stay inside it
    const sx = cellX(0), sy = cellY(0), sw = W * CELL, sh = H * CELL;
    const rad = Math.max(3, Math.min(CELL * 0.22, 18));
    ctx.save();
    ctx.fillStyle = PAPER;
    roundRect(sx, sy, sw, sh, rad); ctx.fill();
    roundRect(sx, sy, sw, sh, rad); ctx.clip();
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
    ctx.restore();
    ctx.strokeStyle = PAPER_EDGE; ctx.lineWidth = 2;
    roundRect(sx, sy, sw, sh, rad); ctx.stroke();
  }

  // The thing you are trying to make, shown properly — on its own scrap of the
  // same paper, at full strength. It was a 20% ghost before, which meant the
  // one reference the player needs was the faintest thing on screen.
  function drawTarget(cx, cy, box) {
    if (!usingArt() && !FIGURES[figIdx]) return;
    const x = Math.round(cx - box / 2), y = Math.round(cy - box / 2);
    const pad = Math.max(4, Math.round(box * 0.06));
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(x + 2, y + 3, box, box, fs(8)); ctx.fill();
    ctx.fillStyle = PAPER;
    roundRect(x, y, box, box, fs(8)); ctx.fill();
    const inner = box - pad * 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(x + pad, y + pad, inner, inner); ctx.clip();
    if (usingArt()) {
      const a = ART[figIdx], q = artSquare(a);
      ctx.drawImage(a.img, q.sx, q.sy, q.s, q.s, x + pad, y + pad, inner, inner);
    } else {
      ctx.translate(x + pad, y + pad); ctx.scale(inner, inner);
      window.FOLD_DRAW_FIGURE(ctx, FIGURES[figIdx], ink, LINE);
    }
    ctx.restore();
    ctx.strokeStyle = PAPER_EDGE; ctx.lineWidth = 1.5;
    roundRect(x, y, box, box, fs(8)); ctx.stroke();
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

    // HUD. The name is gone; the read-out sits opposite the controls, and the
    // reference card moves out of the top band into the margin beside the
    // sheet — space a squarish board leaves empty in a landscape frame anyway.
    const box = fs(96);
    const stat = 'Level ' + level + '   ·   ' + moves + (moves === 1 ? ' fold' : ' folds') +
                 '   ·   par ' + solution.length;

    if (DESK) {
      // Laid out from the right edge inwards so nothing can overlap.
      const cy = 28;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      let x = CW - 20;
      ctx.font = '800 ' + fs(18) + 'px Inter, sans-serif';
      ctx.fillStyle = GOLD;
      ctx.fillText(fmt(score.total), x, cy);
      x -= ctx.measureText(fmt(score.total)).width + 8;
      ctx.font = '700 ' + fs(10) + 'px Inter, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('SCORE', x, cy + 1);
      x -= ctx.measureText('SCORE').width + 18;
      ctx.font = '600 ' + fs(13) + 'px Inter, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.fillText(stat, x, cy);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';

      // the card, in the right-hand margin, level with the middle of the sheet
      const colCX = CW - CARD_COL() / 2 - 6;
      const midY = boardOY + (origH * CELL) / 2;
      drawTarget(colCX, midY - fs(14), box);
      ctx.textAlign = 'center';
      ctx.fillStyle = pct === 100 ? GOOD : (pct > 0 ? WARN : 'rgba(255,255,255,0.62)');
      ctx.font = '800 ' + fs(13) + 'px Inter, sans-serif';
      ctx.fillText(placed + ' / ' + tilesTotal + ' pieces', colCX, midY + box / 2 - fs(4));
      ctx.textAlign = 'left';
    } else {
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.font = '600 ' + fs(14) + 'px Inter, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      // Par is shown DURING play, not just on the scorecard — a target you only
      // learn about after the fact cannot change how you play.
      ctx.fillText(stat, fs(20), fs(16));
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '700 ' + fs(11) + 'px Inter, sans-serif';
      ctx.fillText('SCORE', fs(20), fs(16) + fs(26));
      ctx.fillStyle = GOLD; ctx.font = '800 ' + fs(22) + 'px Inter, sans-serif';
      ctx.fillText(fmt(score.total), fs(20), fs(16) + fs(40));
      drawTarget(CW - fs(20) - box / 2, fs(16) + box / 2, box);
      ctx.textAlign = 'right';
      ctx.fillStyle = pct === 100 ? GOOD : (pct > 0 ? WARN : 'rgba(255,255,255,0.62)');
      ctx.font = '800 ' + fs(14) + 'px Inter, sans-serif';
      ctx.fillText(placed + ' / ' + tilesTotal + ' pieces', CW - fs(20), fs(16) + box + fs(8));
    }

    drawBoard();

    // controls
    ctx.textAlign = 'center';
    // Top-left on desktop, in the row the title used to hold.
    const cy = DESK ? 28 : CH - fs(70), gap = fs(9);
    const row = [
      ['Undo', 'undo', !history.length || phase === 'won', undo],
      ['Restart', 'restart', phase === 'won', () => { T().levelRestart(level); startLevel(level); }],
      ['Hint', 'hint', phase === 'won', () => { T().hintUsed(level); hint(); }],
      ['New', 'new', false, () => startLevel(level + 1)],
    ];
    ctx.font = '700 ' + fs(14) + 'px Inter, sans-serif';
    let total = 0;
    for (const [t] of row) total += Math.round(ctx.measureText(t).width + fs(34)) + gap;
    total -= gap;
    let x = DESK ? 20 : Math.round(CW / 2 - total / 2);
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
      ctx.fillText(figureName(figIdx).toUpperCase() + ' COMPLETE', CW / 2, boardBot + (rowTop - boardBot) / 2);
      ctx.textBaseline = 'top';
      winOverlay(performance.now());
    }
    ctx.textAlign = 'left';
  }

  // ---------- scorecard ----------
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  function scoreRow(label, note, value, px, pw, y, ms, strong, draw) {
    if (draw) {
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ctx.fillStyle = strong ? '#fff' : 'rgba(255,255,255,0.72)';
      ctx.font = (strong ? '700 ' : '500 ') + Math.round((strong ? 17 : 16) * ms) + 'px Inter, sans-serif';
      ctx.fillText(label, px + 26, y);
      const lw = ctx.measureText(label).width;
      if (note) {
        ctx.fillStyle = 'rgba(255,255,255,0.48)'; ctx.font = '500 ' + Math.round(13 * ms) + 'px Inter, sans-serif';
        ctx.fillText(note, px + 26 + lw + 10, y);
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = strong ? GOLD : 'rgba(255,255,255,0.92)';
      ctx.font = '700 ' + Math.round((strong ? 19 : 16) * ms) + 'px Inter, sans-serif';
      ctx.fillText(value, px + pw - 26, y);
    }
    return y + Math.round((strong ? 32 : 27) * ms);
  }
  function winBody(px, py, pw, ms, draw) {
    const a = award || scoreLevel(), cx = CW / 2;
    let y = py + Math.round(32 * ms);
    if (draw) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = GOLD; ctx.font = '800 ' + Math.round(29 * ms) + 'px Inter, sans-serif';
      ctx.fillText(figureName(figIdx).toUpperCase() + ' MADE', cx, y);
    }
    y += Math.round(38 * ms);
    if (draw) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '600 ' + Math.round(15 * ms) + 'px Inter, sans-serif';
      ctx.fillText('Level ' + level + ' · every piece in place', cx, y);
    }
    y += Math.round(32 * ms);
    y = scoreRow('Level clear', '', '+' + fmt(a.base), px, pw, y, ms, false, draw);
    y = scoreRow('Par bonus', a.moves + ' folds · par ' + a.par, '+' + fmt(a.parBonus), px, pw, y, ms, false, draw);
    if (a.sizeBonus) y = scoreRow('Large figure', gw + '×' + gh, '+' + fmt(a.sizeBonus), px, pw, y, ms, false, draw);
    if (draw) {
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px + 26, y - 12 * ms); ctx.lineTo(px + pw - 26, y - 12 * ms); ctx.stroke();
    }
    y += Math.round(6 * ms);
    y = scoreRow('Level score', '', fmt(a.levelScore), px, pw, y, ms, true, draw);
    y += Math.round(8 * ms);
    y = scoreRow('Total score', score.cleared + (score.cleared === 1 ? ' figure' : ' figures') + ' made', fmt(score.total), px, pw, y, ms, true, draw);
    return y + Math.round(14 * ms);
  }
  function winOverlay(now) {
    const t = Math.max(0, Math.min(1, (now - cardAt) / CARD_FADE));
    if (t <= 0) return;
    ctx.save();
    ctx.globalAlpha = t;
    // Light scrim, not a blackout: the picture the player just assembled is the
    // whole reward, so it stays readable behind the card.
    ctx.fillStyle = 'rgba(10,16,28,0.58)'; ctx.fillRect(0, 0, CW, CH);
    const figBottom = cellY(0) + H * CELL;
    const room = CH - 10 - (figBottom + fs(14));
    // Size the card to the gap it actually has. On a small sheet the cells are
    // large, the assembled figure is tall, and a fixed-size card simply would
    // not fit underneath — so it shrinks rather than climbing over the picture.
    let ms = Math.max(0.78, Math.min(1, Math.min(CH / 760, CW / 430)));
    const pw = Math.min(CW - 34, 420);
    const measure = (m) => winBody(0, 0, pw, m, false) + Math.round(50 * m) + Math.round(24 * m);
    let ph = measure(ms);
    for (let i = 0; i < 8 && ph > room && ms > 0.62; i++) { ms = Math.max(0.62, ms - 0.05); ph = measure(ms); }
    const bh = Math.round(50 * ms);
    const px = (CW - pw) / 2;
    // Below the assembled figure, so the card never lands on the thing you just
    // made. Centring buried it.
    const py = Math.max(10, Math.min(figBottom + fs(14), CH - ph - 10));
    ctx.fillStyle = '#16233a'; roundRect(px, py, pw, ph, 22); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.13)'; roundRect(px, py, pw, ph, 22); ctx.stroke();
    const endY = winBody(px, py, pw, ms, true);
    const bw = Math.round(pw * 0.62), bx = px + (pw - bw) / 2;
    ctx.fillStyle = GOOD; roundRect(bx, endY, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = '#0B1520'; ctx.font = '800 ' + Math.round(15 * ms) + 'px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('NEXT FIGURE', bx + bw / 2, endY + bh / 2 + 1);
    ctx.textBaseline = 'top';
    ctx.restore();
    uiButtons.push({ x: bx, y: endY, w: bw, h: bh, id: 'next', act: () => startLevel(level + 1) });
    lastCard = { top: Math.round(py), bottom: Math.round(py + ph), figBottom: Math.round(figBottom) };
  }

  // The scorecard is drawn by an animation frame, so on a device that throttles
  // rAF the player could win and then sit there with no way forward. Timer too.
  function ensureWinAnim() {
    if (raf) return;
    const tick = () => {
      raf = 0;
      render();
      if (phase === 'won' && performance.now() < cardAt + CARD_FADE + 60) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  // ---------- sound ----------
  // Carried over from the dot-and-ring Fold rather than dropped: the prototype
  // never had any, and shipping the new mode silently would have been a
  // regression on a game that already made noise. Same palette — paper for a
  // crease, a bell rising per piece landing home, an arpeggio on solve.
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zamborin-fold.sound' }) : null;
  const snd = {
    on: () => !!(sfx && sfx.isOn()),
    ready() { if (sfx) sfx.ensureAudio(); },
    toggle() { if (!sfx) return; sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.tone(880, 0.05, 0.03, 'sine'); },
    crease() { if (sfx) { sfx.noise(0.13, 1100, 0.7, 0.045); sfx.tone(210, 0.07, 0.016, 'sine'); } },
    home(n) {
      if (!sfx) return;
      const step = Math.min(11, Math.max(0, n - 1));
      sfx.tone(659.25 * Math.pow(2, step / 12), 0.17, 0.040, 'triangle');
      sfx.tone(659.25 * Math.pow(2, step / 12) * 2, 0.09, 0.012, 'sine');
    },
    win() { if (sfx) sfx.arpeggio(659.25, 0.10, 2); },
    unfold() { if (sfx) sfx.noise(0.10, 700, 0.7, 0.030); },
  };
  // Rising-edge only, and seeded on every level change, so generation and undo
  // stay silent and a piece already home does not re-ring.
  let lastHome = 0;
  function seedSound() { lastHome = placedCount(); }
  function announcePlacement() {
    const p = placedCount();
    if (p > lastHome) for (let i = lastHome + 1; i <= p; i++) snd.home(i);
    lastHome = p;
  }

  function checkWin() {
    if (phase !== 'play' || !solved()) return;
    phase = 'won';
    T().levelComplete(level, moves);
    snd.win();
    if (banked) { wonT = performance.now(); cardAt = wonT + WIN_DELAY; ensureWinAnim(); return; }
    banked = true;
    wonT = performance.now();
    cardAt = wonT + WIN_DELAY;
    award = scoreLevel();
    score.total += award.levelScore;
    score.cleared += 1;
    score.best = Math.max(score.best, award.levelScore);
    saveScore();
    saveLevel(level + 1);       // reloading on the scorecard carries on rather than replaying a scored level
    clearTimeout(cardFB);
    cardFB = setTimeout(() => render(), WIN_DELAY + CARD_FADE + 40);
    ensureWinAnim();
  }

  // ---------- actions ----------
  function undo() { T().hintUsed(level); if (history.length) { restore(history.pop()); snd.unfold(); seedSound(); render(); } }
  function hint() {
    // Replays the recorded solution from the current position if the player is
    // still on it; otherwise says so rather than folding them somewhere wrong.
    if (moves >= solution.length) return;
    const f = foldAt(solution[moves].axis, solution[moves].k, W, H);
    if (solution[moves].k >= (f.axis === 'V' ? W : H)) return;
    history.push(snapshot()); doFold(f); moves++; hintsUsed++; snd.crease(); announcePlacement();
    checkWin();
    render();
  }
  // ---------- analytics ----------
  // Fire and forget. T() returns a no-op stub when the shared module is absent
  // or blocked, so tracking can never throw into the game loop.
  const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){}, levelRestart(){}, hintUsed(){} };
  const T = () => (window.ZAM_TRACK || NOOP);
  T().init('fold');

  function startLevel(lvl) {
    level = Math.max(1, lvl);
    moves = 0; history = []; hintsUsed = 0; phase = 'play';
    award = null; wonT = -1e9; cardAt = Infinity; banked = false; clearTimeout(cardFB);
    saveLevel(level);
    // If generation cannot find a board — most likely because every supplied
    // image is too sparse to slice, e.g. a small figure on a transparent
    // background — drop back to the built-in vectors rather than leaving the
    // player with no board at all.
    if (!genLevel(level)) {
      if (usingArt()) {
        const held = ART; ART = [];
        const ok = genLevel(level) || genLevel(1);
        if (!ok) { ART = held; genLevel(1); }
      } else if (!genLevel(1)) {
        level = 1; genLevel(1);
      }
    }
    computeLayout(); render();
    T().levelStart(level);
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
    snd.ready();                      // browsers only allow audio after a gesture
    e.preventDefault();
    const { x, y } = toLocal(e);
    for (const b of uiButtons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.act(); return; }
    if (phase === 'won') {
      const now = performance.now();
      // now - 1, not now: at exactly t = 0 the overlay draws nothing, so a
      // tap would produce one empty frame and, on a stalled rAF, stay empty.
      if (now < cardAt) { cardAt = now - 1; ensureWinAnim(); render(); }
      return;
    }
    const cr = creaseAt(x, y);
    if (!cr) return;
    history.push(snapshot());
    doFold(foldAt(cr.axis, cr.k, W, H));
    moves++;
    snd.crease();
    announcePlacement();
    checkWin();
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
        figure: figureName(figIdx), art: usingArt(), grid: gw + 'x' + gh,
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
    get score() { return { ...score, ink, award, wouldScore: scoreLevel() }; },
    get geom() { return { CW, CH, boardOY, figBottom: Math.round(cellY(0) + H * CELL), card: lastCard }; },
    get buttons() { render(); return uiButtons.map(b => ({ id: b.id, cx: b.x + b.w / 2, cy: b.y + b.h / 2 })); },
    press(id) { render(); const b = uiButtons.find(z => z.id === id); if (!b) return 'no button ' + id; b.act(); return this.state; },
    goto(n) { startLevel(n); return this.state; },
    // Play the recorded solution straight through.
    solve() { let g = 0; while (moves < solution.length && g++ < 20) hint(); return this.state; },
    fold(axis, k) { history.push(snapshot()); doFold(foldAt(axis, k, W, H)); moves++; checkWin(); render(); return this.state; },
    figures: FIGURES.map(f => f.name),
    render,
  };

  // ---------- boot ----------
  setCanvasVars(); resizeCanvas();
  // Artwork first: which library is in play decides what the generator picks
  // from, so the level cannot be built until we know.
  loadArt().then(n => {
    if (n) { computeLayout(); startLevel(level); }
  });
  if (!FIGURES.length) {
    ctx.fillStyle = BG; ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = '#fff'; ctx.font = '600 16px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('figures.js did not load', CW / 2, CH / 2);
  } else {
    loadScore();
    startLevel(loadLevelNo());
  }
})();
