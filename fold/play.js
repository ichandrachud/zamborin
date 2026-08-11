/* ============================================================
   Fold · a Zamborin Game
   Tap a crease line; the smaller flap flips over the crease and its
   contents reflect + stack. Land every coloured dot on its ring.

   The footprint is tracked as {x0,y0,W,H} inside a fixed, centred
   "original sheet" frame, so the base never jumps — the flap simply
   flips onto it (smooth animation, clean layer shadows).

   Layout is responsive: the logical canvas matches the mode-driven
   size (desktop card / full-screen mobile portrait), and the square
   board is centred inside it with the HUD in the margins.
   ============================================================ */
(() => {
  'use strict';

  // ---------- MODE + CANVAS ----------
  const MODE = (matchMedia('(pointer: coarse)').matches || window.innerWidth < 768)
    ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  let CW = 560, CH = 640;                       // logical canvas size (px)
  function setCanvasVars() {
    if (MODE === 'mobile') { CW = window.innerWidth; CH = window.innerHeight; }
    else { CW = 560; CH = 640; }
    document.body.style.setProperty('--canvas-w', CW + 'px');
    document.body.style.setProperty('--canvas-h', CH + 'px');
    canvas.setAttribute('width', String(CW));
    canvas.setAttribute('height', String(CH));
  }
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const dW = rect.width || CW, dH = rect.height || CH;
    const bW = Math.round(dW * dpr), bH = Math.round(dH * dpr);
    if (canvas.width !== bW) canvas.width = bW;
    if (canvas.height !== bH) canvas.height = bH;
    const scale = Math.min(bW / CW, bH / CH);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  // Size the game-wrap from measured pixels. On mobile we set it explicitly to
  // innerWidth × innerHeight instead of trusting the shared CSS min(100vw,
  // calc(100dvh…)) — iOS Safari (and some emulators) under-size that because
  // 100dvh ≠ innerHeight, which was collapsing the canvas to a narrow strip.
  const gameWrap = canvas.parentElement;
  function fitFullscreen() {
    if (MODE === 'mobile') {
      gameWrap.style.width = window.innerWidth + 'px';
      gameWrap.style.height = window.innerHeight + 'px';
      return;
    }
    const active = document.body.classList.contains('focus-mode');
    if (!active) { gameWrap.style.width = ''; gameWrap.style.height = ''; }
    else {
      const vw = window.innerWidth, vh = window.innerHeight, aspect = CW / CH;
      let cw = vw, ch = Math.round(vw / aspect);
      if (ch > vh) { ch = vh; cw = Math.round(vh * aspect); }
      gameWrap.style.width = cw + 'px'; gameWrap.style.height = ch + 'px';
    }
  }
  function onResize() {
    if (MODE === 'mobile') setCanvasVars();
    fitFullscreen(); resizeCanvas(); computeLayout(); render();
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));

  // ---------- CONSTANTS ----------
  const BG_TOP = '#1B2A47', BG_MID = '#131F36', BG_BOT = '#0E1726';   // Zamborin dark-blue
  const PAPER = '#F3EEE3', PAPER_EDGE = '#cdc4b0';
  const CREASE = 'rgba(60,66,80,0.28)', CREASE_HI = 'rgba(255,255,255,0.55)';
  const PANEL = '#1b2330', PANEL_LINE = 'rgba(255,255,255,0.12)', GO = '#3DDC84';
  const COLORS = ['#ED3B34', '#2BB3E8', '#F2B705', '#3DDC84', '#EE6C1E', '#B06CF0'];
  const FOLD_MS = 300;
  const LS_KEY = 'zamborin-fold.level';

  // ---------- STATE ----------
  let CELL = 80, origW = 4, origH = 4;          // fixed frame (cells)
  let x0, y0, W, H, grid;                        // footprint within the frame
  let pairs, layers;                            // pairs to match, folds done (shadow depth)
  let level = 1, moves = 0, phase = 'play';     // phase: menu | play | won
  let history = [], hint = null, anim = null;
  let boardOX = 0, boardOY = 0, FSCALE = 1, RAD = 12;
  let uiButtons = [];
  const fs = (px) => Math.round(px * FSCALE);

  // ---------- LAYOUT ----------
  function computeLayout() {
    const topBand = Math.round(88 * Math.min(1.15, Math.max(0.9, CH / 640)));
    const botBand = Math.round(92 * Math.min(1.15, Math.max(0.9, CH / 640)));
    const availW = CW - 24;
    const availH = CH - topBand - botBand;
    const cells = Math.max(origW, origH, 1);
    CELL = Math.max(16, Math.floor(Math.min(availW, availH) / cells));
    boardOX = Math.round((CW - origW * CELL) / 2);
    boardOY = Math.round(topBand + (availH - origH * CELL) / 2);
    FSCALE = Math.max(0.8, Math.min(1.7, Math.min(CW, CH) / 520));
    RAD = Math.max(6, Math.min(14, CELL * 0.16));
  }
  function frameOX() { return boardOX; }
  function frameOY() { return boardOY; }
  function cellCX(c, ax0) { return frameOX() + ((ax0 ?? x0) + c + 0.5) * CELL; }
  function cellCY(r, ay0) { return frameOY() + ((ay0 ?? y0) + r + 0.5) * CELL; }

  // ---------- FOLD MATH (local grid reindex) ----------
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
      for (const m of grid[r][c]) ng[r2][c2].push(m);
    }
    if (f.side === 'L') x0 += f.k;
    if (f.side === 'T') y0 += f.k;
    W = nw; H = nh; grid = ng; layers++;
  }

  function snapshot() { return { x0, y0, W, H, moves, layers, grid: grid.map(row => row.map(cell => cell.slice())) }; }
  function restore(s) { x0 = s.x0; y0 = s.y0; W = s.W; H = s.H; moves = s.moves; layers = s.layers; grid = s.grid.map(row => row.map(cell => cell.slice())); phase = 'play'; anim = null; }

  function matchedCount() {
    const dot = {}, ring = {};
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++)
      for (const m of grid[r][c]) (m.kind === 'dot' ? dot : ring)[m.pair] = r + ',' + c;
    let n = 0; for (let p = 0; p < pairs; p++) if (dot[p] !== undefined && dot[p] === ring[p]) n++;
    return n;
  }

  // ---------- GENERATION (gentle difficulty curve) ----------
  function genLevel(lvl) {
    const band = Math.floor((lvl - 1) / 4);              // grows one notch every 4 levels
    const baseSize = 4 + Math.min(band, 3);              // 4 → 7
    const nFolds = 2 + Math.min(Math.floor((lvl - 1) / 4), 4);   // 2 → 6
    const wantPairs = 2 + Math.min(Math.floor((lvl - 1) / 5), 3); // 2 → 5

    for (let attempt = 0; attempt < 300; attempt++) {
      const w0 = baseSize + (Math.random() < 0.4 ? 1 : 0);
      const h0 = baseSize + (Math.random() < 0.4 ? 1 : 0);
      let cw = w0, ch = h0;
      const pos = [];
      for (let r = 0; r < h0; r++) for (let c = 0; c < w0; c++) pos.push({ r0: r, c0: c, r, c });
      for (let s = 0; s < nFolds; s++) {
        const opts = []; if (cw >= 2) opts.push('V'); if (ch >= 2) opts.push('H');
        if (!opts.length) break;
        const axis = opts[(Math.random() * opts.length) | 0];
        const k = axis === 'V' ? 1 + ((Math.random() * (cw - 1)) | 0) : 1 + ((Math.random() * (ch - 1)) | 0);
        const f = foldAt(axis, k, cw, ch);
        for (const p of pos) { const [r2, c2] = applyFold(f, p.r, p.c); p.r = r2; p.c = c2; }
        [cw, ch] = foldDims(f, cw, ch);
      }
      const groups = {};
      for (const p of pos) (groups[p.r + ',' + p.c] ||= []).push(p);
      const usable = Object.values(groups).filter(g => g.length >= 2);
      if (usable.length < 2) continue;
      shuffle(usable);
      const chosen = usable.slice(0, Math.min(wantPairs, usable.length));

      origW = w0; origH = h0;
      x0 = 0; y0 = 0; W = w0; H = h0; layers = 0; pairs = chosen.length;
      grid = Array.from({ length: h0 }, () => Array.from({ length: w0 }, () => []));
      chosen.forEach((g, i) => {
        shuffle(g); const color = COLORS[i % COLORS.length];
        grid[g[0].r0][g[0].c0].push({ pair: i, kind: 'dot', color });
        grid[g[1].r0][g[1].c0].push({ pair: i, kind: 'ring', color });
      });
      // verify solvable by replaying the (re-derived) generating folds
      const save = snapshot();
      let ok = replaySolves();
      restore(save);
      if (ok && matchedCount() < pairs) return;          // needs folding, and it's solvable
    }
    // fallback trivial level
    origW = origH = 4; x0 = y0 = 0; W = H = 4; layers = 0; pairs = 1;
    grid = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => []));
    grid[1][0].push({ pair: 0, kind: 'dot', color: COLORS[0] });
    grid[1][3].push({ pair: 0, kind: 'ring', color: COLORS[0] });
    hint = [foldAt('V', 2, 4, 4)];
  }
  // Re-derive a solving sequence: greedily fold toward matches until solved or stuck.
  function replaySolves() {
    const seq = [];
    for (let guard = 0; guard < 12; guard++) {
      if (matchedCount() === pairs) { hint = seq.slice(); return true; }
      let best = null, bestScore = -1;
      const creases = [];
      for (let k = 1; k < W; k++) creases.push(foldAt('V', k, W, H));
      for (let k = 1; k < H; k++) creases.push(foldAt('H', k, W, H));
      for (const f of creases) {
        const save = snapshot(); doFold(f); const sc = matchedCount(); restore(save);
        if (sc > bestScore) { bestScore = sc; best = f; }
      }
      if (!best) break;
      seq.push(best); doFold(best);
    }
    const won = matchedCount() === pairs; if (won) hint = seq.slice(); return won;
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]]; } }

  // ---------- PROGRESS ----------
  function saveLevel() { try { localStorage.setItem(LS_KEY, String(level)); } catch (e) {} }
  function loadLevel() { try { const v = parseInt(localStorage.getItem(LS_KEY), 10); return (v >= 1 && v <= 999) ? v : 1; } catch (e) { return 1; } }

  function startLevel(lvl, asMenu) {
    level = lvl; moves = 0; history = []; anim = null;
    genLevel(lvl);                 // note: genLevel runs a solvability replay that calls restore()
    phase = asMenu ? 'menu' : 'play';   // so the phase must be set AFTER generation
    seedSound();                        // genLevel folds speculatively; start from the real board
    saveLevel(); computeLayout(); render();
  }

  // ---------- INPUT ----------
  function evtXY(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX ?? e.touches?.[0]?.clientX ?? e.changedTouches?.[0]?.clientX);
    const cy = (e.clientY ?? e.touches?.[0]?.clientY ?? e.changedTouches?.[0]?.clientY);
    return { x: (cx - rect.left) * (CW / rect.width), y: (cy - rect.top) * (CH / rect.height) };
  }
  function onTap(e) {
    e.preventDefault();
    snd.ready();                      // browsers only allow audio after a gesture
    const { x, y } = evtXY(e);
    for (const b of uiButtons) { if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.act(); return; } }
    if (anim) return;
    if (phase === 'menu') { phase = 'play'; render(); return; }
    if (phase === 'won') { startLevel(level + 1); return; }
    const lc = (x - frameOX()) / CELL - x0, lr = (y - frameOY()) / CELL - y0;   // local cell space
    if (lc < -0.4 || lc > W + 0.4 || lr < -0.4 || lr > H + 0.4) return;
    const kV = Math.round(lc), kH = Math.round(lr);
    const dV = (kV >= 1 && kV <= W - 1) ? Math.abs(lc - kV) : 9;
    const dH = (kH >= 1 && kH <= H - 1) ? Math.abs(lr - kH) : 9;
    if (Math.min(dV, dH) > 0.42) return;
    const f = dV <= dH ? foldAt('V', kV, W, H) : foldAt('H', kH, W, H);
    startFold(f);
  }
  canvas.addEventListener('pointerup', onTap);
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'z' || e.key === 'Z') && !anim && history.length && phase === 'play') { restore(history.pop()); render(); }
    if ((e.key === 'r' || e.key === 'R') && !anim) startLevel(level);
    if (e.key === 'Escape' && phase === 'menu') { phase = 'play'; render(); }
  });

  // ---------- SOUND ----------
  // Synthesis lives in shared/sfx.js. Fold's palette is paper: a filtered noise
  // crease as the flap goes over, a soft ping per pair that lands on its ring,
  // rising as the sheet resolves, and a chord when the last one matches.
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zamborin-fold.sound' }) : null;
  const snd = {
    on: () => !!(sfx && sfx.isOn()),
    ready() { if (sfx) sfx.ensureAudio(); },
    toggle() { if (!sfx) return; sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.tone(880, 0.05, 0.03, 'sine'); },
    crease() { if (sfx) { sfx.noise(0.13, 1100, 0.7, 0.045); sfx.tone(210, 0.07, 0.016, 'sine'); } },
    match(n) {
      if (!sfx) return;
      const step = Math.min(11, Math.max(0, n - 1));
      sfx.tone(659.25 * Math.pow(2, step / 12), 0.17, 0.040, 'triangle');
      sfx.tone(659.25 * Math.pow(2, step / 12) * 2, 0.09, 0.012, 'sine');
    },
    win() { if (sfx) sfx.arpeggio(659.25, 0.10, 2); },
    unfold() { if (sfx) sfx.noise(0.10, 700, 0.7, 0.030); },
  };
  // genLevel folds speculatively while searching for a solvable sheet, so the
  // counter is seeded there and sound only fires from real player folds.
  let lastMatched = 0;
  function seedSound() { lastMatched = matchedCount(); }
  function announceMatches() {
    const m = matchedCount();
    if (m > lastMatched) for (let i = lastMatched + 1; i <= m; i++) snd.match(i);
    lastMatched = m;
  }

  // ---------- FOLD + ANIMATION ----------
  function startFold(f) {
    const pre = snapshot();
    history.push(pre);
    snd.crease();
    doFold(f); moves++;
    announceMatches();
    if (matchedCount() === pairs) { phase = 'won'; snd.win(); }
    anim = { t0: performance.now(), f, pre };
    requestAnimationFrame(animLoop);
    setTimeout(() => { if (anim && anim.f === f) { anim = null; render(); } }, FOLD_MS + 80);
  }
  function animLoop(now) {
    if (!anim) return;
    if (now - anim.t0 >= FOLD_MS) { anim = null; render(); return; }
    render(); requestAnimationFrame(animLoop);
  }

  // ---------- RENDER PRIMITIVES ----------
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawMarker(m, cx, cy, matched) {
    if (matched) {
      ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.27, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, CELL * 0.045); ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.35, 0, 7); ctx.stroke();
    } else if (m.kind === 'dot') {
      ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.22, 0, 7); ctx.fill();
    } else {
      ctx.strokeStyle = m.color; ctx.lineWidth = Math.max(3, CELL * 0.065); ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.26, 0, 7); ctx.stroke();
    }
  }
  function paperBlock(px, py, pw, ph, depth) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 9;
    ctx.fillStyle = PAPER; roundRect(px, py, pw, ph, RAD); ctx.fill();
    ctx.restore();
    const d = Math.min(depth, 6);
    if (d > 0) {
      ctx.save(); roundRect(px, py, pw, ph, RAD); ctx.clip();
      const t = 5 + 4 * d, a = (0.05 + 0.03 * d).toFixed(3);
      let gr = ctx.createLinearGradient(px + pw - t, 0, px + pw, 0);
      gr.addColorStop(0, 'rgba(120,110,88,0)'); gr.addColorStop(1, 'rgba(120,110,88,' + a + ')');
      ctx.fillStyle = gr; ctx.fillRect(px + pw - t, py, t, ph);
      gr = ctx.createLinearGradient(0, py + ph - t, 0, py + ph);
      gr.addColorStop(0, 'rgba(120,110,88,0)'); gr.addColorStop(1, 'rgba(120,110,88,' + a + ')');
      ctx.fillStyle = gr; ctx.fillRect(px, py + ph - t, pw, t);
      ctx.restore();
    }
    ctx.strokeStyle = PAPER_EDGE; ctx.lineWidth = 2; roundRect(px, py, pw, ph, RAD); ctx.stroke();
  }
  function creaseLines(px, py, cols, rows) {
    const inset = Math.round(CELL * 0.12);
    for (let c = 1; c < cols; c++) embossLine(px + c * CELL, py + inset, px + c * CELL, py + rows * CELL - inset);
    for (let r = 1; r < rows; r++) embossLine(px + inset, py + r * CELL, px + cols * CELL - inset, py + r * CELL);
  }
  function embossLine(x1, y1, x2, y2) {
    ctx.setLineDash([7, 8]); ctx.lineWidth = 2;
    ctx.strokeStyle = CREASE_HI; ctx.beginPath(); ctx.moveTo(x1 + 1, y1 + 1); ctx.lineTo(x2 + 1, y2 + 1); ctx.stroke();
    ctx.strokeStyle = CREASE; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.setLineDash([]);
  }

  // ---------- RENDER ----------
  function render() {
    uiButtons = [];
    ctx.clearRect(0, 0, CW, CH);
    const bg = ctx.createRadialGradient(CW * 0.32, 0, 0, CW * 0.32, 0, Math.max(CW, CH) * 1.1);
    bg.addColorStop(0, BG_TOP); bg.addColorStop(0.6, BG_MID); bg.addColorStop(1, BG_BOT);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, CW, CH);
    if (anim) drawAnimating(anim.p != null ? anim.p : Math.min(1, (performance.now() - anim.t0) / FOLD_MS));
    else drawStatic();
    drawHUD();
    if (phase !== 'menu') drawControls();
    if (phase === 'won') winOverlay();
    if (phase === 'menu') menuOverlay();
  }

  function drawStatic() {
    const px = frameOX() + x0 * CELL, py = frameOY() + y0 * CELL;
    paperBlock(px, py, W * CELL, H * CELL, layers);
    creaseLines(px, py, W, H);
    const dotCell = {}, ringCell = {};
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) for (const m of grid[r][c]) (m.kind === 'dot' ? dotCell : ringCell)[m.pair] = r + ',' + c;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const cell = grid[r][c]; if (!cell.length) continue;
      const cx = cellCX(c), cy = cellCY(r);
      const seen = new Set(); let i = 0;
      for (const m of cell) {
        const key = m.pair + m.kind; if (seen.has(key)) continue; seen.add(key);
        const matched = dotCell[m.pair] === ringCell[m.pair] && dotCell[m.pair] === r + ',' + c;
        if (matched && m.kind !== 'dot') continue;
        const off = Math.min(cell.length - 1, 2) * (CELL * 0.045);
        drawMarker(m, cx + ((i % 2) - 0.5) * off, cy + ((i >> 1) - 0.5) * off, matched); i++;
      }
    }
  }

  function drawCellMarkers(cell, cx, cy) {
    if (!cell || !cell.length) return;
    const seen = new Set(); let i = 0;
    for (const m of cell) {
      const key = m.pair + m.kind; if (seen.has(key)) continue; seen.add(key);
      const off = Math.min(cell.length - 1, 2) * (CELL * 0.045);
      drawMarker(m, cx + ((i % 2) - 0.5) * off, cy + ((i >> 1) - 0.5) * off, false); i++;
    }
  }
  // The flap (paper + its dots) is drawn INSIDE the fold transform, so everything
  // foreshortens together: a dot becomes an ellipse as the paper goes edge-on.
  function drawAnimating(p) {
    const pre = anim.pre, f = anim.f;
    const g = pre.grid, pw = pre.W, ph = pre.H, ax = pre.x0, ay = pre.y0;
    const th = p * Math.PI, cs = Math.cos(th), sn = Math.sin(th);
    const OX = frameOX(), OY = frameOY(), k = f.k, isV = f.axis === 'V';
    const inFlap = (r, c) => isV ? (f.side === 'R' ? c >= k : c < k) : (f.side === 'B' ? r >= k : r < k);

    let bc0, bc1, br0, br1;
    if (isV) { br0 = 0; br1 = ph - 1; if (f.side === 'R') { bc0 = 0; bc1 = k - 1; } else { bc0 = k; bc1 = pw - 1; } }
    else { bc0 = 0; bc1 = pw - 1; if (f.side === 'B') { br0 = 0; br1 = k - 1; } else { br0 = k; br1 = ph - 1; } }
    paperBlock(OX + (ax + bc0) * CELL, OY + (ay + br0) * CELL, (bc1 - bc0 + 1) * CELL, (br1 - br0 + 1) * CELL, pre.layers);
    for (let r = br0; r <= br1; r++) for (let c = bc0; c <= bc1; c++)
      drawCellMarkers(g[r][c], OX + (ax + c + 0.5) * CELL, OY + (ay + r + 0.5) * CELL);

    const xc = OX + (ax + k) * CELL, yc = OY + (ay + k) * CELL;
    const flapLen = (isV ? (f.side === 'R' ? pw - k : k) : (f.side === 'B' ? ph - k : k)) * CELL;
    const crossExt = (isV ? ph : pw) * CELL;

    const reach = Math.min(flapLen, CELL * 1.4) * sn;
    ctx.fillStyle = 'rgba(20,18,12,' + (sn * 0.16).toFixed(3) + ')';
    if (isV) ctx.fillRect(f.side === 'R' ? xc - reach : xc, OY + ay * CELL, reach, crossExt);
    else ctx.fillRect(OX + ax * CELL, f.side === 'B' ? yc - reach : yc, crossExt, reach);

    ctx.save();
    if (isV) { ctx.translate(xc, OY + ay * CELL); if (f.side === 'L') ctx.scale(-1, 1); ctx.scale(cs, 1); }
    else { ctx.translate(OX + ax * CELL, yc); if (f.side === 'T') ctx.scale(1, -1); ctx.scale(1, cs); }
    ctx.fillStyle = PAPER;
    if (isV) ctx.fillRect(0, 0, flapLen, crossExt); else ctx.fillRect(0, 0, crossExt, flapLen);
    ctx.strokeStyle = PAPER_EDGE; ctx.lineWidth = 2 / Math.max(0.15, Math.abs(cs));
    ctx.strokeRect(0.5, 0.5, isV ? flapLen : crossExt, isV ? crossExt : flapLen);
    for (let r = 0; r < ph; r++) for (let c = 0; c < pw; c++) {
      if (!inFlap(r, c) || !g[r][c].length) continue;
      let u, v;
      if (isV) { u = (f.side === 'R' ? (c - k) : (k - 1 - c)) + 0.5; v = r + 0.5; drawCellMarkers(g[r][c], u * CELL, v * CELL); }
      else { v = c + 0.5; u = (f.side === 'B' ? (r - k) : (k - 1 - r)) + 0.5; drawCellMarkers(g[r][c], v * CELL, u * CELL); }
    }
    ctx.fillStyle = 'rgba(24,20,12,' + (sn * 0.34).toFixed(3) + ')';
    if (isV) ctx.fillRect(0, 0, flapLen, crossExt); else ctx.fillRect(0, 0, crossExt, flapLen);
    ctx.strokeStyle = 'rgba(255,255,255,' + (sn * 0.5).toFixed(3) + ')'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (isV) { ctx.moveTo(0, 0); ctx.lineTo(0, crossExt); } else { ctx.moveTo(0, 0); ctx.lineTo(crossExt, 0); }
    ctx.stroke();
    ctx.restore();
  }

  // ---------- HUD + BUTTONS ----------
  function drawHUD() {
    const P = Math.round(18 * FSCALE);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff'; ctx.font = '800 ' + fs(26) + 'px Inter, sans-serif';
    ctx.fillText('FOLD', P, fs(16));
    ctx.font = '600 ' + fs(14) + 'px Inter, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillText('Level ' + level + '   ·   ' + matchedCount() + ' / ' + pairs + ' matched   ·   ' + moves + (moves === 1 ? ' fold' : ' folds'), P, fs(16) + fs(30));
    if (phase === 'play' && moves === 0) {
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '500 ' + fs(14) + 'px Inter, sans-serif';
      ctx.fillText('Tap a crease line to fold the smaller flap over', CW / 2, boardOY + origH * CELL + fs(16));
    }
  }
  // Flat outlined speaker drawn on canvas — no emoji glyphs anywhere.
  function soundPill(cx, cy, w) {
    const h = fs(38), x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.26)'; roundRect(x, y, w, h, h / 2); ctx.stroke();
    const on = snd.on(), s = fs(8);
    ctx.strokeStyle = on ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.4)';
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
    uiButtons.push({ x, y, w, h, act: () => { snd.ready(); snd.toggle(); render(); } });
  }
  function pill(label, cx, cy, opts) {
    const font = opts.font || ('700 ' + fs(14) + 'px Inter, sans-serif');
    ctx.font = font;
    const padX = opts.padX != null ? opts.padX : fs(18);
    const w = opts.w != null ? opts.w : Math.round(ctx.measureText(label).width + padX * 2);
    const h = opts.h != null ? opts.h : fs(38);
    const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    ctx.fillStyle = opts.fill || 'rgba(255,255,255,0.08)';
    roundRect(x, y, w, h, h / 2); ctx.fill();
    if (opts.stroke !== null) { ctx.lineWidth = 1.5; ctx.strokeStyle = opts.stroke || 'rgba(255,255,255,0.26)'; roundRect(x, y, w, h, h / 2); ctx.stroke(); }
    ctx.fillStyle = opts.text || 'rgba(255,255,255,0.92)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font; ctx.fillText(label, cx, y + h / 2 + 1);
    if (opts.act) uiButtons.push({ x, y, w, h, act: opts.act });
    return w;
  }
  function drawControls() {
    const cy = CH - Math.round(44 * FSCALE);
    const gap = fs(12);
    ctx.font = '700 ' + fs(14) + 'px Inter, sans-serif';
    const wU = Math.round(ctx.measureText('Undo').width + fs(18) * 2);
    const wR = Math.round(ctx.measureText('Restart').width + fs(18) * 2);
    const wH = Math.round(ctx.measureText('Rules').width + fs(18) * 2);
    const wS = Math.round(fs(44));
    const total = wS + wU + wR + wH + gap * 3;
    let x = Math.round(CW / 2 - total / 2);
    soundPill(x + wS / 2, cy, wS);
    x += wS + gap;
    const dim = !history.length || anim;
    pill('Undo', x + wU / 2, cy, { w: wU, text: dim ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.92)', act: () => { if (!anim && history.length && phase !== 'won') { snd.unfold(); restore(history.pop()); seedSound(); render(); } } });
    x += wU + gap;
    pill('Restart', x + wR / 2, cy, { w: wR, act: () => { if (!anim) startLevel(level); } });
    x += wR + gap;
    pill('Rules', x + wH / 2, cy, { w: wH, act: () => { if (!anim) { phase = 'menu'; render(); } } });
  }

  // ---------- OVERLAYS ----------
  function wrapText(text, cx, y, maxW, lh, xLeft) {
    const words = text.split(' '); let line = '';
    const left = xLeft != null;
    ctx.textAlign = left ? 'left' : 'center'; ctx.textBaseline = 'top';
    const drawX = left ? xLeft : cx;
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, drawX, y); y += lh; line = w; }
      else line = t;
    }
    if (line) { ctx.fillText(line, drawX, y); y += lh; }
    return y;
  }
  function menuOverlay() {
    ctx.fillStyle = 'rgba(10,14,20,0.86)'; ctx.fillRect(0, 0, CW, CH);
    const pw = Math.min(CW - 28, Math.round(440 * FSCALE));
    const ph = Math.min(CH - 36, Math.round(452 * FSCALE));
    const px = Math.round((CW - pw) / 2), py = Math.round((CH - ph) / 2);
    ctx.fillStyle = PANEL; roundRect(px, py, pw, ph, fs(20)); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = PANEL_LINE; roundRect(px, py, pw, ph, fs(20)); ctx.stroke();

    const cx = CW / 2; let y = py + fs(30);
    ctx.fillStyle = '#fff'; ctx.font = '800 ' + fs(34) + 'px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('FOLD', cx, y); y += fs(46);
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = '600 ' + fs(15) + 'px Inter, sans-serif';
    y = wrapText('Fold the paper so every dot lands on its matching ring.', cx, y, pw - fs(52), fs(21));
    y += fs(16);

    const rules = [
      'Tap a crease line to fold the smaller flap over the rest.',
      'Everything on that flap flips and stacks onto the paper below.',
      'Match every coloured dot to its ring to solve the level.',
    ];
    const rx = px + fs(28);
    for (let i = 0; i < rules.length; i++) {
      ctx.fillStyle = GO; ctx.beginPath(); ctx.arc(rx + fs(10), y + fs(10), fs(11), 0, 7); ctx.fill();
      ctx.fillStyle = '#0E1726'; ctx.font = '800 ' + fs(13) + 'px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), rx + fs(10), y + fs(11));
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '500 ' + fs(14) + 'px Inter, sans-serif';
      const ny = wrapText(rules[i], 0, y, pw - fs(90), fs(19), rx + fs(30));
      y = Math.max(ny, y + fs(22)) + fs(12);
    }
    const label = (moves > 0 && phase === 'menu') ? 'RESUME' : 'PLAY';
    pill(label, cx, py + ph - fs(34), { w: Math.round(pw * 0.52), h: fs(46), fill: GO, stroke: null, text: '#0E1726', font: '800 ' + fs(17) + 'px Inter, sans-serif', act: () => { phase = 'play'; render(); } });
  }
  function winOverlay() {
    ctx.fillStyle = 'rgba(10,14,20,0.80)'; ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = GO; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = '800 ' + fs(58) + 'px Inter, sans-serif';
    ctx.fillText('SOLVED', CW / 2, CH / 2 - fs(24));
    ctx.fillStyle = '#fff'; ctx.font = '500 ' + fs(20) + 'px Inter, sans-serif';
    ctx.fillText('in ' + moves + (moves === 1 ? ' fold' : ' folds'), CW / 2, CH / 2 + fs(14));
    pill('Next level', CW / 2, CH / 2 + fs(64), { w: Math.round(Math.min(CW - 80, fs(220))), h: fs(48), fill: GO, stroke: null, text: '#0E1726', font: '800 ' + fs(17) + 'px Inter, sans-serif', act: () => startLevel(level + 1) });
  }

  // ---------- DEBUG ----------
  window.__fold = {
    get state() { return { level, x0, y0, W, H, pairs, moves, phase, matched: matchedCount(), anim: !!anim }; },
    solve() { if (!hint) return 'no hint'; for (const f of hint) { history.push(snapshot()); doFold(f); moves++; } if (matchedCount() === pairs) phase = 'won'; anim = null; render(); return matchedCount() + '/' + pairs; },
    fold(axis, k) { startFold(foldAt(axis, k, W, H)); anim = null; render(); return matchedCount() + '/' + pairs; },
    next() { startLevel(level + 1); },
    goto(n) { startLevel(n); },
    previewFold(axis, k, p) { anim = { pre: snapshot(), f: foldAt(axis, k, W, H), p }; render(); return 'frozen at p=' + p; },
  };

  // ---------- BOOT ----------
  window.addEventListener('splash-done', () => { computeLayout(); render(); });
  setCanvasVars();
  resizeCanvas();
  fitFullscreen();
  resizeCanvas();
  startLevel(loadLevel(), true);
})();
