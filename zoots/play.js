/* ============================================================
   Zoots · a Zamborin Game
   A Snood-style bubble shooter with square character tiles.
   Aim + fire Zoots (banking off the side walls); land 3+ of a
   kind connected to pop them; any Zoots left dangling drop too.
   Clear the board to win; lose if a Zoot crosses the danger line.

   Cannon: the loaded Zoot is the centre of a 5-slot tray. After
   each shot the next loaded Zoot is pulled alternately from the
   left neighbour, then the right, with fresh Zoots entering at the
   outer ends.
   ============================================================ */
(() => {
  'use strict';

  // ---------- MODE ----------
  const MODE = (matchMedia('(pointer: coarse)').matches || window.innerWidth < 768)
    ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);

  // ---------- CANVAS ----------
  let W, H;
  if (MODE === 'mobile') { W = window.innerWidth; H = window.innerHeight; }
  else { W = 760; H = 570; }
  document.body.style.setProperty('--canvas-w', W + 'px');
  document.body.style.setProperty('--canvas-h', H + 'px');

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  canvas.setAttribute('width',  String(W));
  canvas.setAttribute('height', String(H));
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const displayW = rect.width  || W;
    const displayH = rect.height || H;
    const backingW = Math.round(displayW * dpr);
    const backingH = Math.round(displayH * dpr);
    if (canvas.width  !== backingW) canvas.width  = backingW;
    if (canvas.height !== backingH) canvas.height = backingH;
    const scale = Math.min(backingW / W, backingH / H);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // ---------- ROBUST FULL-SCREEN FIT (any browser / OS) ----------
  // See project-fullscreen-sizing-pattern: desktop focus-mode sizes the
  // game-wrap from JS-measured innerWidth/innerHeight (not CSS dvh), so the
  // canvas can't clip or mis-scale across browsers. Mobile auto-focus is
  // left to the shared CSS.
  const gameWrap = canvas.parentElement;
  function fitFullscreen() {
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
  fitFullscreen();

  // ---------- AUDIO ----------
  const sfx = window.ZSFX.create({ storageKey: 'zamborin-zoots.sound' });
  function play(name) { try { sfx.play(name); } catch (e) {} }

  // ---------- PALETTE ----------
  const BG_TOP = '#322CA0', BG_BOT = '#1C1A57';
  const C = {
    text:    '#FFFFFF',
    textDim: '#C9CBF0',
    line:    'rgba(255,255,255,0.55)',
    aim:     'rgba(255,255,255,0.45)',
    accent:  '#FF36C5',
  };
  // Fallback colours per Zoot type (used until the sprite loads).
  const TYPE_COLORS = ['#F2C218', '#ED3B34', '#E89A1C', '#8A8D93', '#EE6C1E', '#2BB3E8'];
  const N_TYPES = 6;

  // ---------- SPRITES ----------
  const sprites = [];
  let spritesLoaded = 0;
  for (let i = 0; i < N_TYPES; i++) {
    const img = new Image();
    img.onload = () => { spritesLoaded++; };
    img.src = `./assets/${i + 1}.png`;
    sprites.push(img);
  }

  // ---------- LAYOUT ----------
  const MARGIN = 6;
  const playW = W - MARGIN * 2;
  const TILE_TARGET = MODE === 'mobile' ? 46 : 58;
  const COLS = Math.max(6, Math.round(playW / TILE_TARGET - 0.5));
  const TILE = playW / (COLS + 0.5);          // cell pitch; odd rows shift +TILE/2
  const ROW_H = TILE * 0.86;                   // offset-row vertical pitch
  const TOP = Math.round(TILE * 0.35) + 4;
  const BOTTOM = Math.max(96, Math.min(150, TILE * 2.0));
  const DANGER_Y = H - BOTTOM;
  const LAUNCH_X = W / 2;
  const LAUNCH_Y = DANGER_Y;                    // projectile origin (on the line)
  const TRAY_Y = H - BOTTOM * 0.42;             // tray + HUD baseline
  const MAX_ROWS = Math.max(6, Math.floor((DANGER_Y - TOP - TILE) / ROW_H));
  const PROJ_R = TILE * 0.42;
  const SPEED = TILE * 0.55;
  const MAX_AIM = 1.35;                         // ~77° from vertical

  function cellX(r, c) { return MARGIN + TILE / 2 + c * TILE + (r % 2) * (TILE / 2); }
  function cellY(r)    { return TOP + TILE / 2 + r * ROW_H; }

  // ---------- GRID ----------
  // grid[r][c] = type (0..5) or null.
  let grid = [];
  function newGrid() {
    grid = [];
    for (let r = 0; r < MAX_ROWS; r++) {
      grid.push(new Array(COLS).fill(null));
    }
  }
  function inBounds(r, c) { return r >= 0 && r < MAX_ROWS && c >= 0 && c < COLS; }
  function occupied(r, c) { return inBounds(r, c) && grid[r][c] !== null; }

  // Offset neighbours (odd rows shifted right by TILE/2).
  function neighbours(r, c) {
    const odd = r % 2;
    const list = [[r, c - 1], [r, c + 1]];
    if (odd) { list.push([r - 1, c], [r - 1, c + 1], [r + 1, c], [r + 1, c + 1]); }
    else     { list.push([r - 1, c - 1], [r - 1, c], [r + 1, c - 1], [r + 1, c]); }
    return list.filter(([rr, cc]) => inBounds(rr, cc));
  }

  function boardTypes() {
    const seen = new Set();
    for (let r = 0; r < MAX_ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (grid[r][c] !== null) seen.add(grid[r][c]);
    return [...seen];
  }
  function pickType() {
    const pool = boardTypes();
    if (pool.length === 0) return Math.floor(Math.random() * N_TYPES);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ---------- CANNON / TRAY ----------
  // tray = [L2, L1, LOADED, R1, R2]; loaded fires from the centre.
  let tray = [];
  let nextFromLeft = true;
  function fillTray() {
    tray = [pickType(), pickType(), pickType(), pickType(), pickType()];
    nextFromLeft = true;
  }
  function advanceTray() {
    if (nextFromLeft) { tray[2] = tray[1]; tray[1] = tray[0]; tray[0] = pickType(); }
    else              { tray[2] = tray[3]; tray[3] = tray[4]; tray[4] = pickType(); }
    nextFromLeft = !nextFromLeft;
  }

  // ---------- GAME STATE ----------
  let phase = 'ready';            // ready | playing | won | lost
  let score = 0;
  let aim = 0;                    // radians, 0 = straight up, + = right
  let proj = null;               // { x, y, vx, vy, type }
  let flashes = [];              // {x,y,t} pop effects
  const START_ROWS = 5;

  function zootsLeft() {
    let n = 0;
    for (let r = 0; r < MAX_ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (grid[r][c] !== null) n++;
    return n;
  }

  function initBoard() {
    newGrid();
    for (let r = 0; r < START_ROWS; r++)
      for (let c = 0; c < COLS; c++)
        grid[r][c] = Math.floor(Math.random() * N_TYPES);
    fillTray();
    score = 0;
    proj = null;
    flashes = [];
    aim = 0;
  }

  // ---------- MATCH + DROP ----------
  function sameCluster(r, c) {
    const type = grid[r][c];
    const out = [], seen = new Set([r + ',' + c]);
    const stack = [[r, c]];
    while (stack.length) {
      const [cr, cc] = stack.pop();
      out.push([cr, cc]);
      for (const [nr, nc] of neighbours(cr, cc)) {
        const k = nr + ',' + nc;
        if (!seen.has(k) && grid[nr][nc] === type) { seen.add(k); stack.push([nr, nc]); }
      }
    }
    return out;
  }

  function dropFloaters() {
    // Anything not reachable from row 0 falls.
    const anchored = new Set();
    const stack = [];
    for (let c = 0; c < COLS; c++) if (grid[0][c] !== null) { anchored.add('0,' + c); stack.push([0, c]); }
    while (stack.length) {
      const [cr, cc] = stack.pop();
      for (const [nr, nc] of neighbours(cr, cc)) {
        const k = nr + ',' + nc;
        if (!anchored.has(k) && grid[nr][nc] !== null) { anchored.add(k); stack.push([nr, nc]); }
      }
    }
    let dropped = 0;
    for (let r = 0; r < MAX_ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (grid[r][c] !== null && !anchored.has(r + ',' + c)) {
          flashes.push({ x: cellX(r, c), y: cellY(r), t: performance.now() });
          grid[r][c] = null; dropped++;
        }
    return dropped;
  }

  function resolveLanding(r, c) {
    const cluster = sameCluster(r, c);
    if (cluster.length >= 3) {
      for (const [rr, cc] of cluster) {
        flashes.push({ x: cellX(rr, cc), y: cellY(rr), t: performance.now() });
        grid[rr][cc] = null;
      }
      score += cluster.length * 10;
      const dropped = dropFloaters();
      if (dropped) score += dropped * 20;
      play('drop');
    } else {
      play('land');
    }
    if (zootsLeft() === 0) { phase = 'won'; play('win'); return; }
    // Lose if any Zoot now sits on/over the danger line.
    for (let rr = 0; rr < MAX_ROWS; rr++)
      for (let cc = 0; cc < COLS; cc++)
        if (grid[rr][cc] !== null && cellY(rr) + TILE / 2 >= DANGER_Y) { phase = 'lost'; play('fail'); return; }
    advanceTray();
  }

  // Find the empty cell nearest (x,y) that would attach (row 0 or has an
  // occupied neighbour). Falls back to nearest empty cell overall.
  function snapCell(x, y) {
    const r0 = Math.max(0, Math.min(MAX_ROWS - 1, Math.round((y - TOP - TILE / 2) / ROW_H)));
    let best = null, bestD = Infinity, bestAny = null, bestAnyD = Infinity;
    for (let r = Math.max(0, r0 - 2); r <= Math.min(MAX_ROWS - 1, r0 + 2); r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] !== null) continue;
        const dx = x - cellX(r, c), dy = y - cellY(r), d = dx * dx + dy * dy;
        if (d < bestAnyD) { bestAnyD = d; bestAny = [r, c]; }
        const attaches = r === 0 || neighbours(r, c).some(([nr, nc]) => grid[nr][nc] !== null);
        if (attaches && d < bestD) { bestD = d; best = [r, c]; }
      }
    }
    return best || bestAny;
  }

  function fire() {
    if (proj) return;
    proj = {
      x: LAUNCH_X, y: LAUNCH_Y,
      vx: Math.sin(aim) * SPEED, vy: -Math.cos(aim) * SPEED,
      type: tray[2],
    };
    play('click');
  }

  function stepProjectile() {
    if (!proj) return;
    const SUB = 5;
    for (let s = 0; s < SUB; s++) {
      proj.x += proj.vx / SUB;
      proj.y += proj.vy / SUB;
      // Wall bounce.
      if (proj.x < MARGIN + PROJ_R) { proj.x = MARGIN + PROJ_R; proj.vx = -proj.vx; }
      else if (proj.x > W - MARGIN - PROJ_R) { proj.x = W - MARGIN - PROJ_R; proj.vx = -proj.vx; }
      // Ceiling.
      if (proj.y - PROJ_R <= TOP) { land(); return; }
      // Collision with an existing Zoot.
      for (let r = 0; r < MAX_ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (grid[r][c] === null) continue;
          const dx = proj.x - cellX(r, c), dy = proj.y - cellY(r);
          if (dx * dx + dy * dy < (TILE * 0.82) * (TILE * 0.82)) { land(); return; }
        }
      }
    }
  }

  function land() {
    const cell = snapCell(proj.x, proj.y);
    const type = proj.type;
    proj = null;
    if (!cell) { advanceTray(); return; }
    const [r, c] = cell;
    grid[r][c] = type;
    resolveLanding(r, c);
  }

  // ---------- RENDER ----------
  function roundRect(x, y, w, h, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
  function drawZoot(cx, cy, type, size) {
    const img = sprites[type];
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
    } else {
      ctx.fillStyle = TYPE_COLORS[type];
      roundRect(cx - size / 2, cy - size / 2, size, size, size * 0.22);
      ctx.fill();
    }
  }

  function drawAim() {
    // Bouncing trajectory preview from the launcher.
    let x = LAUNCH_X, y = LAUNCH_Y;
    let vx = Math.sin(aim), vy = -Math.cos(aim);
    ctx.save();
    ctx.strokeStyle = C.aim;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    const STEP = TILE * 0.35;
    for (let i = 0; i < 220; i++) {
      x += vx * STEP; y += vy * STEP;
      if (x < MARGIN + PROJ_R) { x = MARGIN + PROJ_R; vx = -vx; }
      else if (x > W - MARGIN - PROJ_R) { x = W - MARGIN - PROJ_R; vx = -vx; }
      ctx.lineTo(x, y);
      if (y - PROJ_R <= TOP) break;
      let hit = false;
      for (let r = 0; r < MAX_ROWS && !hit; r++)
        for (let c = 0; c < COLS; c++) {
          if (grid[r][c] === null) continue;
          const dx = x - cellX(r, c), dy = y - cellY(r);
          if (dx * dx + dy * dy < (TILE * 0.82) * (TILE * 0.82)) { hit = true; break; }
        }
      if (hit) break;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawTray() {
    const slot = Math.min(TILE * 0.74, 40);
    const gap = slot * 0.34;
    const total = slot * 5 + gap * 4;
    let x = W / 2 - total / 2;
    const y = TRAY_Y;
    // Tray container.
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = 1.5;
    roundRect(x - 10, y - slot / 2 - 8, total + 20, slot + 16, 12);
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const cx = x + slot / 2 + i * (slot + gap);
      drawZoot(cx, y, tray[i], slot * 0.92);
      if (i === 2) {
        ctx.strokeStyle = C.text;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, y, slot * 0.78, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawHUD() {
    ctx.textBaseline = 'middle';
    // SCORE — bottom-left.
    ctx.textAlign = 'left';
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = C.textDim;
    ctx.fillText('SCORE', MARGIN + 8, TRAY_Y - 8);
    ctx.font = '800 20px Inter, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(score), MARGIN + 8, TRAY_Y + 14);
    // ZOOTS — bottom-right.
    ctx.textAlign = 'right';
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = C.textDim;
    ctx.fillText('ZOOTS', W - MARGIN - 8, TRAY_Y - 8);
    ctx.font = '800 20px Inter, sans-serif';
    ctx.fillStyle = C.text;
    ctx.fillText(String(zootsLeft()), W - MARGIN - 8, TRAY_Y + 14);
  }

  function drawFlashes(now) {
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      const t = (now - f.t) / 300;
      if (t >= 1) { flashes.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(f.x, f.y, TILE * 0.5 * (0.6 + t * 0.7), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawOverlay() {
    ctx.save();
    ctx.fillStyle = 'rgba(16, 18, 50, 0.82)';
    ctx.fillRect(0, 0, W, H);
    const midX = W / 2, midY = H * 0.42;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (phase === 'ready') {
      ctx.fillStyle = C.accent;
      ctx.font = '700 13px Inter, sans-serif';
      ctx.fillText('HOW TO PLAY', midX, midY - 96);
      ctx.fillStyle = C.text;
      ctx.font = '800 44px Inter, sans-serif';
      ctx.fillText('ZOOTS', midX, midY - 52);
      ctx.fillStyle = C.textDim;
      ctx.font = '500 15px Inter, sans-serif';
      const lines = [
        'Aim and fire Zoots at the cluster above.',
        'Bank off the side walls to reach tricky spots.',
        'Match 3 or more of a kind to pop them.',
        'Any Zoots left dangling drop too. Clear the board!',
      ];
      lines.forEach((l, i) => ctx.fillText(l, midX, midY + i * 24));
      drawButton('START', midX, midY + lines.length * 24 + 30);
    } else {
      const won = phase === 'won';
      ctx.fillStyle = won ? '#5DD39E' : C.accent;
      ctx.font = '700 13px Inter, sans-serif';
      ctx.fillText(won ? 'BOARD CLEARED' : 'A ZOOT CROSSED THE LINE', midX, midY - 60);
      ctx.fillStyle = C.text;
      ctx.font = '800 52px Inter, sans-serif';
      ctx.fillText(String(score), midX, midY - 12);
      ctx.fillStyle = C.textDim;
      ctx.font = '500 12px Inter, sans-serif';
      ctx.fillText('FINAL SCORE', midX, midY + 20);
      drawButton('PLAY AGAIN', midX, midY + 64);
    }
    ctx.restore();
  }
  function drawButton(label, cx, cy) {
    const w = 240, h = 52;
    ctx.fillStyle = C.accent;
    roundRect(cx - w / 2, cy - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 15px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 1);
  }

  function loop(now) {
    // Background.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, BG_TOP); g.addColorStop(1, BG_BOT);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Grid.
    for (let r = 0; r < MAX_ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (grid[r][c] !== null) drawZoot(cellX(r, c), cellY(r), grid[r][c], TILE * 0.9);

    drawFlashes(now);

    if (phase === 'playing') { stepProjectile(); }

    // Danger line.
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(MARGIN, DANGER_Y); ctx.lineTo(W - MARGIN, DANGER_Y); ctx.stroke();

    // Aim + projectile + launcher.
    if (phase === 'playing' && !proj) drawAim();
    if (proj) drawZoot(proj.x, proj.y, proj.type, TILE * 0.9);
    // Launcher nub (loaded Zoot peeking above the tray).
    drawZoot(LAUNCH_X, LAUNCH_Y - TILE * 0.1, tray[2], TILE * 0.62);

    drawTray();
    drawHUD();

    if (phase !== 'playing') drawOverlay();

    requestAnimationFrame(loop);
  }

  // ---------- INPUT ----------
  function getXY(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX != null ? e.clientX : (e.touches && e.touches[0].clientX)) - rect.left;
    const cy = (e.clientY != null ? e.clientY : (e.touches && e.touches[0].clientY)) - rect.top;
    return { x: cx * (W / rect.width), y: cy * (H / rect.height) };
  }
  function setAim(x, y) {
    const dx = x - LAUNCH_X, dy = y - LAUNCH_Y;
    let a = Math.atan2(dx, -dy);
    if (a > MAX_AIM) a = MAX_AIM;
    if (a < -MAX_AIM) a = -MAX_AIM;
    aim = a;
  }
  canvas.addEventListener('pointermove', (e) => {
    if (phase !== 'playing' || proj) return;
    const { x, y } = getXY(e);
    setAim(x, y);
  });
  canvas.addEventListener('pointerup', (e) => {
    sfx.ensureAudio();
    const { x, y } = getXY(e);
    if (phase === 'ready') { phase = 'playing'; play('start'); return; }
    if (phase === 'won' || phase === 'lost') { phase = 'ready'; initBoard(); return; }
    if (phase === 'playing' && !proj) { setAim(x, y); fire(); }
  });
  // Desktop: M toggles sound.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') { sfx.ensureAudio(); sfx.setOn(!sfx.isOn()); }
  });

  // ---------- START ----------
  initBoard();
  window.addEventListener('splash-done', () => requestAnimationFrame(loop), { once: true });
  if (!document.getElementById('splash')) requestAnimationFrame(loop);
})();
