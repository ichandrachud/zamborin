/* ============================================================
   Bloom · a Zamborin Game (prototype v9 — irrigation / pipes)
   Water flows from a TAP through a grid of pipe tiles. Tap a pipe to
   rotate it 90°. Water lights connected pipes blue; a flower BLOOMS
   only when water reaches it. Rotate the pipes so water travels from
   the tap to EVERY flower.

   Each level is a random spanning tree (guaranteed connected), with
   leaves as flowers and one hub as the tap. Pipe tiles are then
   scrambled; the tap and flowers are fixed. A solution always exists.
   ============================================================ */
(() => {
  'use strict';

  let LW = 800, LH = 800;   // logical canvas size (px) — set per mode at load
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const BG_TOP = '#1B2A47', BG_MID = '#131F36', BG_BOT = '#0E1726';
  const PIPE_DRY = '#41516b', PIPE_DRY_LINE = '#2b384c';
  const PIPE_WET = '#3a9bde', PIPE_WET_LINE = '#2170a8';
  const TAP = '#eaf6ff';
  const ROT_MS = 150, BLOOM_DUR = 450;   // flower blossom (slowed 50%, from 300, so it can be savoured)

  // directions as bits
  const N = 1, E = 2, S = 4, W = 8;
  const DIR = [N, E, S, W];
  const DR = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 };
  const DC = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 };
  const OPP = { [N]: S, [E]: W, [S]: N, [W]: E };
  const ANG = { [N]: -Math.PI / 2, [E]: 0, [S]: Math.PI / 2, [W]: Math.PI };
  const rotCW = (m) => ((m << 1) & 15) | (m >> 3);
  const pop = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

  // ---------- tulip art (flowers), recoloured per hue ----------
  const STAGES = ['01', '02', '03', '04'];
  const FVB = [[378.45, 743.79], [483.73, 816.09], [490.64, 797.9], [672.11, 809.23]];
  const PALETTE = [
    { dark: '#e0503f', mid: '#ec6f5c', light: '#f2a191', inner: '#f7c3b8' },
    { dark: '#e79a2b', mid: '#f2b84d', light: '#ffd77e', inner: '#ffe6ad' },
    { dark: '#2fae5e', mid: '#55c47d', light: '#93dca8', inner: '#bfe9cc' },
    { dark: '#e058a0', mid: '#e079b0', light: '#e699c2', inner: '#f2c6de' },
    { dark: '#8a4fd0', mid: '#a877e6', light: '#c9b0f0', inner: '#ddccf7' },
  ];
  const flowerImgs = [];
  let flowersReady = 0, flowersTotal = PALETTE.length * 4;
  function recolor(t, c) {
    t = t.replace(/#e058a0/gi, c.dark).replace(/#e079b0/gi, c.mid).replace(/#e699c2/gi, c.light).replace(/#eac/gi, c.inner);
    // Inject explicit width/height from the viewBox so the browser rasterises the
    // SVG at its true aspect. Without this, Chrome gives some of these files a
    // wrong intrinsic size, and drawImage then distorts them (01.svg was showing
    // up open + squished instead of as a closed bud).
    const m = t.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    if (m) t = t.replace('<svg ', '<svg width="' + m[1] + '" height="' + m[2] + '" ');
    return t;
  }
  const SVGS = [
    "<svg id=\"Layer_1\" xmlns=\"http://www.w3.org/2000/svg\" version=\"1.1\" viewBox=\"0 0 378.45 743.79\"> <defs> <style> .st0 { fill: #17753d; } .st1 { fill: #e699c2; } .st2 { fill: #e058a0; } </style> </defs> <rect class=\"st0\" x=\"145.99\" y=\"546.11\" width=\"86.48\" height=\"197.67\" rx=\"37.06\" ry=\"37.06\"/> <g> <path class=\"st2\" d=\"M158.01,29.76L33.96,238.05c-59.22,99.43-38.99,236.73,45.18,306.69,46.89,38.97,103.73,48.82,155.11,32.7,160.84-69.09-27.36-544.77-30.35-561.18-1.02-5.58-4.12-10.21-7.84-13.92h-.01c-10.04-6.51-21.68-.03-38.03,27.42Z\"/> <path class=\"st1\" d=\"M220.44,29.76l124.06,208.29c59.22,99.43,38.99,236.73-45.18,306.69-46.89,38.97-103.73,48.82-155.11,32.7C-16.64,508.34,171.56,32.66,174.56,16.25c1.02-5.58,4.12-10.21,7.84-13.92h.01c10.04-6.51,21.68-.03,38.03,27.42Z\"/> </g> </svg>",
    "<svg id=\"Layer_1\" xmlns=\"http://www.w3.org/2000/svg\" version=\"1.1\" viewBox=\"0 0 483.73 816.09\"> <defs> <style> .st0 { fill: #17753d; } .st1 { fill: #e079b0; } .st2 { fill: #e058a0; } </style> </defs> <rect class=\"st0\" x=\"198.63\" y=\"618.41\" width=\"86.48\" height=\"197.67\" rx=\"37.06\" ry=\"37.06\"/> <g> <path class=\"st2\" d=\"M173.76,37.62L32.21,288.26c-67.57,119.65-25.36,271.41,94.28,338.98,66.65,37.64,143.27,41.22,209.74,16.31C542.2,544.62,239.03,34.43,233.22,16.37c-1.97-6.14-6.61-10.94-11.98-14.62h-.02c-14.07-5.99-28.8,2.82-47.46,35.86Z\"/> <path class=\"st1\" d=\"M309.97,37.62l141.56,250.64c67.57,119.65,25.36,271.41-94.28,338.98-66.65,37.64-143.27,41.22-209.74,16.31C-58.47,544.62,244.7,34.43,250.52,16.37c1.97-6.14,6.61-10.94,11.98-14.62h.02c14.07-5.99,28.8,2.82,47.46,35.86Z\"/> </g> </svg>",
    "<svg id=\"Layer_1\" xmlns=\"http://www.w3.org/2000/svg\" version=\"1.1\" viewBox=\"0 0 490.64 797.9\"> <defs> <style> .st0 { fill: #17753d; } .st1 { fill: #e699c2; } .st2 { fill: #e079b0; } .st3 { fill: #e058a0; } </style> </defs> <path class=\"st1\" d=\"M62.41,424.43C62.41,302.32,144.3,11.32,245.32,11.32s182.9,290.99,182.9,413.1-81.89,221.1-182.9,221.1-182.9-98.99-182.9-221.1Z\"/> <rect class=\"st0\" x=\"202.08\" y=\"600.22\" width=\"86.48\" height=\"197.67\" rx=\"37.06\" ry=\"37.06\"/> <g> <path class=\"st3\" d=\"M103.73,48.13L12.8,321.25c-43.4,130.37,27.1,271.24,157.48,314.64,72.63,24.18,148.51,13.01,208.98-24.17C562.47,475.16,167.17,32.5,158.01,15.89c-3.12-5.65-8.59-9.47-14.55-12.05h-.02c-14.95-3.18-27.73,8.29-39.71,44.29Z\"/> <path class=\"st2\" d=\"M375.38,43.65l99.77,270.01c47.62,128.89-18.25,271.98-147.14,319.61-71.8,26.53-148.01,17.84-209.65-17.35C-69.21,485.4,311.45,30.09,320.07,13.19c2.93-5.75,8.27-9.74,14.15-12.52h.02c14.84-3.67,27.98,7.38,41.13,42.98Z\"/> </g> </svg>",
    "<svg id=\"Layer_1\" xmlns=\"http://www.w3.org/2000/svg\" version=\"1.1\" viewBox=\"0 0 672.11 809.23\"> <defs> <style> .st0 { fill: #eac; } .st1 { fill: #17753d; } .st2 { fill: #e079b0; } .st3 { fill: #e058a0; } </style> </defs> <rect class=\"st1\" x=\"292.81\" y=\"611.55\" width=\"86.48\" height=\"197.67\" rx=\"37.06\" ry=\"37.06\"/> <path class=\"st0\" d=\"M146.62,427.86C146.62,301.39,231.43,0,336.06,0s189.44,301.39,189.44,427.86-84.81,228.99-189.44,228.99-189.44-102.52-189.44-228.99Z\"/> <g> <path class=\"st3\" d=\"M2.81,100.84l53.92,321.62c25.74,153.53,171.05,257.11,324.58,231.38,85.52-14.34,155.55-65.78,196.35-135.08C688.58,284.85,58.03,51.52,40.04,39.76c-6.12-4-13.62-4.92-20.96-4.34h-.02C2.4,40.18-4.29,58.44,2.81,100.84Z\"/> <path class=\"st2\" d=\"M669.3,100.84l-53.92,321.62c-25.74,153.53-171.05,257.11-324.58,231.38-85.52-14.34-155.55-65.78-196.35-135.08C-16.46,284.85,614.08,51.52,632.07,39.76c6.12-4,13.62-4.92,20.96-4.34h.02c16.65,4.76,23.35,23.02,16.24,65.42Z\"/> </g> </svg>"
  ];
  PALETTE.forEach((cs, ci) => { flowerImgs[ci] = []; SVGS.forEach((txt, si) => { const im = new Image(); im.onload = () => { flowersReady++; render(performance.now()); }; im.src = "data:image/svg+xml," + encodeURIComponent(recolor(txt, cs)); flowerImgs[ci][si] = im; }); });

  // ---------- MODE + CANVAS (responsive, à la Tessera) ----------
  // Mobile: the logical canvas IS the viewport (innerWidth × innerHeight); the
  // square board is centred inside it with the HUD in the top/bottom margins.
  // Desktop: a portrait card. layout() centres the board from LW/LH either way.
  const MODE = (matchMedia('(pointer: coarse)').matches || window.innerWidth < 768) ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);
  function setCanvasVars() {
    if (MODE === 'mobile') { LW = window.innerWidth; LH = window.innerHeight; }
    // One desktop frame across the whole site: 760x600. Eight different sizes
    // had grown up across thirteen games, which reads as carelessness. This is
    // Untangle's, and it is sized so the game plus a 300px sidebar ad fits the
    // page without either being squashed.
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
    const scale = Math.min(bW / LW, bH / LH);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  const gameWrap = canvas.parentElement;
  function fitFullscreen() {
    if (MODE === 'mobile') {
      // measured px, not the flawed CSS min(100vw, calc(100dvh…))
      gameWrap.style.width = window.innerWidth + 'px';
      gameWrap.style.height = window.innerHeight + 'px';
      return;
    }
    const active = document.body.classList.contains('focus-mode');
    if (!active) { gameWrap.style.width = ''; gameWrap.style.height = ''; }
    else {
      const vw = window.innerWidth, vh = window.innerHeight, aspect = LW / LH;
      let cw = vw, ch = Math.round(vw / aspect);
      if (ch > vh) { ch = vh; cw = Math.round(vh * aspect); }
      gameWrap.style.width = cw + 'px'; gameWrap.style.height = ch + 'px';
    }
  }
  function onResize() {
    if (MODE === 'mobile') setCanvasVars();
    fitFullscreen(); resizeCanvas(); layout(); render(performance.now());
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', () => render(performance.now()));

  // ---------- state ----------
  let R = 5, C = 5, cell = 120, ox = 0, oy = 0;
  // parallel arrays over cells
  let type = [], conn = [], sol = [], color = [], watered = [], spinT = [], bloomT = [];
  let source = 0, level = 1, moves = 0, phase = 'play';   // phase: menu | play | won
  let raf = 0, fb = 0, animEnd = 0, wonT = -1e9, initConn = [], history = [], uiButtons = [];
  const TYPE_PIPE = 0, TYPE_FLOWER = 1, TYPE_TAP = 2;
  const LS = 'zamborin-bloom.level';
  function saveLevel() { try { localStorage.setItem(LS, String(level)); } catch (e) {} }
  function loadLevel() { try { const v = parseInt(localStorage.getItem(LS), 10); return (v >= 1 && v <= 999) ? v : 1; } catch (e) { return 1; } }

  const idx = (r, c) => r * C + c;
  const rc = (i) => ({ r: (i / C) | 0, c: i % C });
  const TOP_BAND = 100, BOT_BAND = 96, SIDE_PAD = 30;
  // The game's name is not on the playing screen. It is on the tab, the page
  // heading and the card the player clicked to get here, and on canvas it was
  // costing a 44px row across every game for something nobody needs mid-puzzle.
  // The controls sit in that row now, with the level read-out opposite them,
  // and everything that row used to waste goes to the board.
  const topBand = () => MODE === 'mobile' ? 64 : 56;
  const botBand = () => MODE === 'mobile' ? BOT_BAND : 20;
  // The grid shape differs by device: a tall portrait grid on mobile (5 wide,
  // as many rows as fit the phone), a square-ish grid on desktop.
  function gridDims(lvl) {
    if (MODE === 'mobile') {
      const cols = 5;
      const cw = (LW - SIDE_PAD * 2) / cols;                 // width available per column
      let rows = Math.floor((LH - topBand() - botBand()) / cw);
      rows = Math.max(7, Math.min(rows, 10));
      return [rows, cols];
    }
    // Square grids were the real reason the board looked lost in the frame: in
    // 760x600 a square is bounded by the HEIGHT, so no amount of reclaimed
    // chrome widens it — the extra space just becomes bigger margins. A grid
    // two columns wider than it is tall fills the frame AND is more puzzle.
    const rows = 5 + Math.min(Math.floor((lvl - 1) / 3), 3);   // 5 → 8
    return [rows, rows + 2];                                    // 7 → 10 wide
  }
  function layout() {
    // The floors matter. A browser can report a 0×0 viewport for the first
    // frame, and any height under the two bands (196px) drives cell negative —
    // which then throws on the tile corner radius and leaves the board blank.
    const availW = Math.max(60, LW - SIDE_PAD * 2);
    const availH = Math.max(60, LH - topBand() - botBand());
    cell = Math.max(8, Math.floor(Math.min(availW / C, availH / R)));   // square cells that fit both axes
    ox = Math.round((LW - C * cell) / 2);
    oy = Math.round(topBand() + (availH - R * cell) / 2);
  }
  const ccx = (c) => ox + (c + 0.5) * cell;
  const ccy = (r) => oy + (r + 0.5) * cell;

  // ---------- water flood ----------
  function computeWater(now) {
    const was = watered.slice();
    watered = new Array(R * C).fill(false);
    const st = [source]; watered[source] = true;
    while (st.length) {
      const i = st.pop(), { r, c } = rc(i);
      for (const d of DIR) {
        if (!(conn[i] & d)) continue;
        const nr = r + DR[d], nc = c + DC[d];
        if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
        const j = idx(nr, nc);
        if (!watered[j] && (conn[j] & OPP[d])) { watered[j] = true; st.push(j); }
      }
    }
    // rising-edge bloom timing for flowers
    for (let i = 0; i < R * C; i++) if (type[i] === TYPE_FLOWER && watered[i] && !was[i]) bloomT[i] = now || performance.now();
  }
  function flowersWatered() { let n = 0, t = 0; for (let i = 0; i < R * C; i++) if (type[i] === TYPE_FLOWER) { t++; if (watered[i]) n++; } return [n, t]; }
  function wateredPipes() { let n = 0; for (let i = 0; i < R * C; i++) if (watered[i]) n++; return n; }

  // ---------- sound ----------
  // Synthesis lives in shared/sfx.js. Bloom's palette is water and plumbing: a
  // soft tok as a pipe turns, a low swell when the water actually gains ground,
  // and a bell per flower rising in pitch as the garden fills.
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zamborin-bloom.sound' }) : null;
  const snd = {
    on: () => !!(sfx && sfx.isOn()),
    ready() { if (sfx) sfx.ensureAudio(); },
    toggle() { if (!sfx) return; sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.tone(880, 0.05, 0.03, 'sine'); },
    turn() { if (sfx) sfx.tone(430, 0.032, 0.020, 'sine'); },
    flow() { if (sfx) { sfx.tone(190, 0.16, 0.030, 'sine'); sfx.noise(0.10, 620, 1.1, 0.030); } },
    flower(n) {
      if (!sfx) return;
      const step = Math.min(11, Math.max(0, n - 1));
      sfx.tone(587.33 * Math.pow(2, step / 12), 0.20, 0.042, 'triangle');
      sfx.tone(587.33 * Math.pow(2, step / 12) * 2, 0.10, 0.013, 'sine');
    },
    win() { if (sfx) sfx.arpeggio(587.33, 0.10, 2); },
    undo() { if (sfx) sfx.tone(330, 0.05, 0.018, 'sine'); },
  };
  // Fired only from player-facing paths. genLevel scrambles in a loop that calls
  // computeWater up to 12 times, and must stay silent.
  let lastFlowers = 0, lastPipes = 0;
  function seedSound() { lastFlowers = flowersWatered()[0]; lastPipes = wateredPipes(); }
  function announceWater() {
    if (phase === 'menu') { seedSound(); return; }
    const f = flowersWatered()[0], p = wateredPipes();
    if (p > lastPipes) snd.flow();
    if (f > lastFlowers) for (let i = lastFlowers + 1; i <= f; i++) snd.flower(i);
    lastFlowers = f; lastPipes = p;
  }

  // ---------- generation (random spanning tree) ----------
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]]; } }
  // ---------- analytics ----------
  // Fire and forget. T() returns a no-op stub when the shared module is absent
  // or blocked, so tracking can never throw into the game loop.
  const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){}, levelRestart(){}, hintUsed(){} };
  const T = () => (window.ZAM_TRACK || NOOP);
  T().init('bloom');

  function genLevel(lvl, asMenu) {
    level = lvl; saveLevel();
    const [gr, gc] = gridDims(lvl);
    R = gr; C = gc;
    const n = R * C;
    // union-find
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const edges = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      if (c + 1 < C) edges.push([idx(r, c), idx(r, c + 1), E, W]);
      if (r + 1 < R) edges.push([idx(r, c), idx(r + 1, c), S, N]);
    }
    shuffle(edges);
    const tree = new Array(n).fill(0);
    for (const [a, b, da, db] of edges) { const ra = find(a), rb = find(b); if (ra !== rb) { parent[ra] = rb; tree[a] |= da; tree[b] |= db; } }
    // degrees, pick tap = highest-degree hub
    let deg = tree.map(pop);
    source = 0; for (let i = 1; i < n; i++) if (deg[i] > deg[source]) source = i;
    type = new Array(n); color = new Array(n); sol = tree.slice(); conn = tree.slice();
    for (let i = 0; i < n; i++) {
      type[i] = i === source ? TYPE_TAP : (deg[i] === 1 ? TYPE_FLOWER : TYPE_PIPE);
      color[i] = (Math.random() * PALETTE.length) | 0;
    }
    // scramble pipe rotations (tap + flowers stay fixed)
    let tries = 0;
    do {
      for (let i = 0; i < n; i++) if (type[i] === TYPE_PIPE) { let k = (Math.random() * 4) | 0; while (k--) conn[i] = rotCW(conn[i]); }
      computeWater();
      tries++;
    } while (flowersWatered()[0] === flowersWatered()[1] && tries < 12);   // don't start already solved
    initConn = conn.slice();
    watered = new Array(n).fill(false); spinT = new Array(n).fill(-1e9); bloomT = new Array(n).fill(-1e9);
    moves = 0; phase = asMenu ? 'menu' : 'play'; history = []; animEnd = 0; wonT = -1e9;
    computeWater(); seedSound(); layout(); render(performance.now());
    T().levelStart(level);
  }
  function restart() { T().levelRestart(level); conn = initConn.slice(); moves = 0; phase = 'play'; history = []; spinT = spinT.map(() => -1e9); bloomT = bloomT.map(() => -1e9); computeWater(); seedSound(); render(performance.now()); }

  // ---------- input ----------
  function rotate(i, now) {
    if (type[i] !== TYPE_PIPE || phase !== 'play') return;
    history.push(i); if (history.length > 400) history.shift();
    conn[i] = rotCW(conn[i]); spinT[i] = now; moves++;
    snd.turn();
    computeWater(now);
    announceWater();
    const [w, t] = flowersWatered();
    animEnd = Math.max(now + ROT_MS + 40, now + BLOOM_DUR + 40);
    if (w === t) { phase = 'won'; wonT = now; T().levelComplete(level, moves); snd.win(); animEnd = Math.max(animEnd, now + BLOOM_DUR + 350 + 450 + 60); }
    ensureAnim(now);
  }
  function undo() {
    T().hintUsed(level);
    if (!history.length || phase !== 'play') return;
    const i = history.pop();
    conn[i] = rotCW(rotCW(rotCW(conn[i]))); moves++; spinT[i] = performance.now();
    snd.undo();
    computeWater(); announceWater(); render(performance.now());
  }
  function ensureAnim(now) { render(now); if (!raf) { raf = 1; requestAnimationFrame(tick); } clearTimeout(fb); fb = setTimeout(() => { raf = 0; render(performance.now()); }, (animEnd - now) + 120); }
  function tick(t) { render(t); if (t < animEnd) requestAnimationFrame(tick); else raf = 0; }

  function onTap(e) {
    e.preventDefault();
    snd.ready();                      // browsers only allow audio after a gesture
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX ?? e.changedTouches?.[0]?.clientX) - rect.left) * (LW / rect.width);
    const y = ((e.clientY ?? e.changedTouches?.[0]?.clientY) - rect.top) * (LH / rect.height);
    for (const b of uiButtons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.act(); return; }
    if (phase === 'menu') { phase = 'play'; render(performance.now()); return; }
    if (phase === 'won') { genLevel(level + 1); return; }
    const c = Math.floor((x - ox) / cell), r = Math.floor((y - oy) / cell);
    if (r < 0 || r >= R || c < 0 || c >= C) return;
    rotate(idx(r, c), performance.now());
  }
  canvas.addEventListener('pointerup', onTap);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'z' || e.key === 'Z') undo();
    if (e.key === 'r' || e.key === 'R') restart();
    if (e.key === 'n' || e.key === 'N') genLevel(++level);
  });

  // ---------- render ----------
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  function roundRect(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function render(now) {
    ctx.clearRect(0, 0, LW, LH);
    const bg = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
    bg.addColorStop(0, BG_TOP); bg.addColorStop(0.6, BG_MID); bg.addColorStop(1, BG_BOT);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);
    uiButtons = [];

    // faint tile plots
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      roundRect(ox + c * cell + 3, oy + r * cell + 3, cell - 6, cell - 6, cell * 0.14); ctx.fill();
    }
    for (let i = 0; i < R * C; i++) drawCell(i, now);
    drawHUD(now);
    if (phase === 'play') drawControls();
    if (phase === 'won') winOverlay(now);
    if (phase === 'menu') menuOverlay();
  }

  function drawCell(i, now) {
    const { r, c } = rc(i); const cx = ccx(c), cy = ccy(r);
    const on = watered[i];
    // spin animation: tile eases from -90° into place
    let a = 0; const sp = (now - spinT[i]) / ROT_MS;
    if (sp >= 0 && sp < 1) a = -Math.PI / 2 * (1 - ease(sp));

    if (type[i] === TYPE_FLOWER) {
      // fixed stub toward its one connector + upright tulip
      drawPipesStatic(conn[i], cx, cy, on);
      const prog = on ? Math.min(1, (now - bloomT[i]) / BLOOM_DUR) : 0;
      drawTulip(cx, cy, cell, on ? 3 * ease(Math.max(0.001, prog)) : 0, color[i]);
      return;
    }
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
    drawPipesLocal(conn[i], on);
    ctx.restore();
    if (type[i] === TYPE_TAP) drawTap(cx, cy, on);
  }

  // Build the pipe centreline as a path: straights are lines, elbows are
  // quarter-circle curves, tees/crosses are through-lines + stubs. No hub node.
  function pathPipe(mask) {
    const half = cell * 0.5;
    const pt = { [N]: [0, -half], [E]: [half, 0], [S]: [0, half], [W]: [-half, 0] };
    const dirs = DIR.filter(d => mask & d);
    if (dirs.length === 2 && OPP[dirs[0]] !== dirs[1]) {         // elbow → arc round the corner
      const a = dirs[0], b = dirs[1];
      const cxr = (DC[a] + DC[b]) * half, cyr = (DR[a] + DR[b]) * half;
      const A0 = Math.atan2(pt[a][1] - cyr, pt[a][0] - cxr);
      const A1 = Math.atan2(pt[b][1] - cyr, pt[b][0] - cxr);
      let d = A1 - A0; while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI;
      ctx.arc(cxr, cyr, half, A0, A1, d < 0);
      return;
    }
    if ((mask & E) && (mask & W)) { ctx.moveTo(-half, 0); ctx.lineTo(half, 0); }
    else { if (mask & E) { ctx.moveTo(0, 0); ctx.lineTo(half, 0); } if (mask & W) { ctx.moveTo(0, 0); ctx.lineTo(-half, 0); } }
    if ((mask & N) && (mask & S)) { ctx.moveTo(0, -half); ctx.lineTo(0, half); }
    else { if (mask & N) { ctx.moveTo(0, 0); ctx.lineTo(0, -half); } if (mask & S) { ctx.moveTo(0, 0); ctx.lineTo(0, half); } }
  }
  // Tube = flat fill with a thin 2–3px outline (simple, like the flowers).
  function drawPipesLocal(mask, on) {
    const tube = cell * 0.085, border = 2.5;
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    ctx.beginPath(); pathPipe(mask);
    ctx.lineWidth = tube + border * 2; ctx.strokeStyle = on ? PIPE_WET_LINE : PIPE_DRY_LINE; ctx.stroke();
    ctx.beginPath(); pathPipe(mask);
    ctx.lineWidth = tube; ctx.strokeStyle = on ? PIPE_WET : PIPE_DRY; ctx.stroke();
  }
  // flower stub drawn in absolute coords (no spin)
  function drawPipesStatic(mask, cx, cy, on) {
    ctx.save(); ctx.translate(cx, cy); drawPipesLocal(mask, on); ctx.restore();
  }
  function drawTap(cx, cy, on) {
    ctx.fillStyle = on ? '#2f86c8' : '#33435c';
    ctx.beginPath(); ctx.arc(cx, cy, cell * 0.2, 0, 7); ctx.fill();
    ctx.fillStyle = TAP; ctx.beginPath(); ctx.arc(cx, cy, cell * 0.135, 0, 7); ctx.fill();
    // droplet mark
    ctx.fillStyle = '#2f86c8';
    const s = cell * 0.08;
    ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.bezierCurveTo(cx + s * 0.9, cy - s * 0.05, cx + s * 0.7, cy + s, cx, cy + s); ctx.bezierCurveTo(cx - s * 0.7, cy + s, cx - s * 0.9, cy - s * 0.05, cx, cy - s); ctx.closePath(); ctx.fill();
  }
  function drawTulip(cx, cy, cs, sF, colorIdx) {
    const imgs = flowerImgs[colorIdx];
    if (flowersReady < flowersTotal || !imgs) { ctx.fillStyle = PALETTE[colorIdx].dark; ctx.beginPath(); ctx.arc(cx, cy, cs * 0.14, 0, 7); ctx.fill(); return; }
    const H = cs * 0.62, baseY = cy + H * 0.42;
    const lo = Math.max(0, Math.min(3, Math.floor(sF))), hi = Math.min(3, lo + 1), frac = sF - lo;
    const put = (k, al) => { const vb = FVB[k], s = H / vb[1], w = vb[0] * s; ctx.globalAlpha = al; ctx.drawImage(imgs[k], cx - w / 2, baseY - H, w, H); };
    put(lo, 1); if (frac > 0.02 && hi !== lo) put(hi, frac); ctx.globalAlpha = 1;
  }

  // ---------- HUD ----------
  function drawHUD(now) {
    const hs = Math.max(0.66, Math.min(1, LW / 620));   // shrink HUD text on narrow screens
    const P = Math.round(28 * hs);
    const [w, t] = flowersWatered();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.font = '600 ' + Math.round(16 * hs) + 'px Inter, sans-serif';
    ctx.fillText('Level ' + level + '   ·   ' + w + '/' + t + ' watered   ·   ' + moves + (moves === 1 ? ' turn' : ' turns'),
                 LW - SIDE_PAD, Math.round(topBand() / 2));
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }
  function pill(label, cx, cy, dim, fixedW) {
    ctx.font = '700 15px Inter, sans-serif';
    const w = fixedW || Math.round(ctx.measureText(label).width + 36), h = 40, x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.24)'; roundRect(x, y, w, h, h / 2); ctx.stroke();
    ctx.fillStyle = dim ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.92)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx, y + h / 2 + 1);
    return { x, y, w, h };
  }
  // Flat outlined speaker drawn on canvas — no emoji glyphs anywhere.
  function speakerIcon(cx, cy, on) {
    const s = 8;
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
  }
  function iconPill(cx, cy, on) {
    const w = 44, h = 40, x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.24)'; roundRect(x, y, w, h, h / 2); ctx.stroke();
    speakerIcon(cx, cy, on);
    return { x, y, w, h };
  }
  function drawControls() {
    const gap = 12, wS = 44;
    ctx.font = '700 15px Inter, sans-serif';
    const wU = Math.round(ctx.measureText('Undo').width + 36), wR = Math.round(ctx.measureText('Restart').width + 36), wH = Math.round(ctx.measureText('Rules').width + 36);
    const sound = () => { snd.ready(); snd.toggle(); render(performance.now()); };
    const rules = () => { phase = 'menu'; render(performance.now()); };

    // The controls take the row the title used to have: left aligned, opposite
    // the level read-out. On a phone they stay at the bottom, within reach of a
    // thumb — the top of a tall screen is the one place a control should not be.
    const cy = MODE === 'mobile' ? LH - 74 : Math.round(topBand() / 2);
    let x = MODE === 'mobile'
      ? Math.round(LW / 2 - (wS + wU + wR + wH + gap * 3) / 2)
      : SIDE_PAD;
    uiButtons.push({ ...iconPill(x + wS / 2, cy, snd.on()), act: sound }); x += wS + gap;
    uiButtons.push({ ...pill('Undo', x + wU / 2, cy, !history.length), act: undo }); x += wU + gap;
    uiButtons.push({ ...pill('Restart', x + wR / 2, cy, false), act: restart }); x += wR + gap;
    uiButtons.push({ ...pill('Rules', x + wH / 2, cy, false), act: rules });
  }
  function winOverlay(now) {
    // let the final blossom finish + a beat, then fade the banner in gently
    const t = Math.max(0, Math.min(1, (now - (wonT + BLOOM_DUR + 350)) / 450));
    if (t <= 0) return;
    ctx.globalAlpha = t;
    ctx.fillStyle = 'rgba(10,16,28,0.82)'; ctx.fillRect(0, 0, LW, LH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9fe6a4'; ctx.font = '800 56px Inter, sans-serif'; ctx.fillText('IN FULL BLOOM', LW / 2, LH / 2 - 30);
    ctx.fillStyle = '#FFD166'; ctx.font = '600 24px Inter, sans-serif'; ctx.fillText('every flower watered in ' + moves + (moves === 1 ? ' turn' : ' turns'), LW / 2, LH / 2 + 22);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '500 20px Inter, sans-serif'; ctx.fillText('tap for the next garden', LW / 2, LH / 2 + 62);
    ctx.globalAlpha = 1;
  }
  function wrapText(text, x, y, maxW, lh, align, measureOnly) {
    const words = text.split(' '); let line = '';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'top';
    for (const w of words) { const tt = line ? line + ' ' + w : w; if (ctx.measureText(tt).width > maxW && line) { if (!measureOnly) ctx.fillText(line, x, y); y += lh; line = w; } else line = tt; }
    if (line) { if (!measureOnly) ctx.fillText(line, x, y); y += lh; } return y;
  }
  const MENU_SUB = 'Bring water from the tap to every flower.';
  const MENU_RULES = ['Tap a pipe to rotate it.',
                      'Water flows from the tap through the pipes that line up.',
                      'A flower blooms only when the water reaches it. Open them all.'];
  let menuFitState = null;              // last card fit, read by the debug handle

  function menuOverlay() {
    ctx.fillStyle = 'rgba(10,16,28,0.88)'; ctx.fillRect(0, 0, LW, LH);
    const pw = Math.min(LW - 56, 470);
    /* THE HEIGHT WAS HARD-CODED AT 372 — 2026-08-20. It fitted, but only
       because these three rules happen to wrap the way they do at the widths
       anyone tried. Nothing measured it and nothing checked it against the
       screen, so a copy edit could have pushed the copy through the PLAY
       button with no warning, and at 480x360 the card was already 16px taller
       than the frame and losing its corners.
       Measured at a type scale now and shrunk until it fits, the same as
       sluice. Horizontal geometry is untouched, so a smaller face wraps to
       FEWER lines; the button is not scaled, being a house size and a touch
       target. */
    const measure = (ts) => {
      let h = 34 * ts + 54 * ts;
      ctx.font = '600 ' + (17 * ts).toFixed(2) + 'px Inter, sans-serif';
      h = wrapText(MENU_SUB, 0, h, pw - 70, 24 * ts, 'center', true) + 18 * ts;
      ctx.font = '500 ' + (15 * ts).toFixed(2) + 'px Inter, sans-serif';
      for (const r of MENU_RULES) h = wrapText(r, 0, h, pw - 100, 21 * ts, 'left', true) + 13 * ts;
      return h + 14 * ts + 50 + 32 * ts;   // clearance, PLAY button, bottom pad
    };
    const maxH = LH - 20;
    let ts = 1, ph = measure(1);
    while (ts > 0.72 && ph > maxH) { ts = Math.max(0.72, ts - 0.04); ph = measure(ts); }
    const px = (LW - pw) / 2, py = Math.max(10, (LH - ph) / 2);
    ctx.fillStyle = '#16233a'; roundRect(px, py, pw, ph, 22); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; roundRect(px, py, pw, ph, 22); ctx.stroke();
    const cx = LW / 2; let y = py + 34 * ts;
    ctx.fillStyle = '#fff';
    ctx.font = '800 ' + (40 * ts).toFixed(2) + 'px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('BLOOM', cx, y); y += 54 * ts;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = '600 ' + (17 * ts).toFixed(2) + 'px Inter, sans-serif';
    y = wrapText(MENU_SUB, cx, y, pw - 70, 24 * ts); y += 18 * ts;
    const rules = MENU_RULES;
    const rx = px + 32, dotR = 12 * ts;
    for (let i = 0; i < rules.length; i++) {
      ctx.fillStyle = '#3a9bde'; ctx.beginPath(); ctx.arc(rx + 11, y + dotR, dotR, 0, 7); ctx.fill();
      ctx.fillStyle = '#0E1726';
      ctx.font = '800 ' + (14 * ts).toFixed(2) + 'px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), rx + 11, y + dotR + 1);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '500 ' + (15 * ts).toFixed(2) + 'px Inter, sans-serif';
      y = wrapText(rules[i], rx + 34, y, pw - 100, 21 * ts, 'left') + 13 * ts;
    }
    const btnTop = py + ph - 32 * ts - 50;
    menuFitState = { ts: +ts.toFixed(2), cardH: Math.round(ph), frameH: LH,
                     contentBottom: Math.round(y), buttonTop: Math.round(btnTop),
                     cardOffScreenPx: Math.max(0, Math.round(py + ph - LH)),
                     overlapPx: Math.max(0, Math.round(y - btnTop)),
                     fits: y <= btnTop && py + ph <= LH };
    const label = moves > 0 ? 'RESUME' : 'PLAY';
    ctx.font = '800 17px Inter, sans-serif';
    const bw = Math.round(Math.max(210, ctx.measureText(label).width + 90)), bh = 50, bx = cx - bw / 2, by = py + ph - 32 * ts - bh / 2;
    ctx.fillStyle = '#3DDC84'; roundRect(bx, by, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = '#0E1726'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx, by + bh / 2 + 1);
    uiButtons.push({ x: bx, y: by, w: bw, h: bh, act: () => { phase = 'play'; T().gameStart(); render(performance.now()); } });
  }

  // ---------- debug ----------
  window.__bloom = {
    /* Draws the card and reports whether it actually fitted, so a copy edit
       that outgrows the frame shows up as a number rather than as a screenshot
       nobody takes. */
    menuFit() { const was = phase; phase = 'menu'; render(performance.now()); phase = was; return menuFitState; },
    get state() { const [w, t] = flowersWatered(); return { level, R, C, moves, phase, watered: w, flowers: t }; },
    solve() { for (let i = 0; i < R * C; i++) if (type[i] === TYPE_PIPE) { conn[i] = sol[i]; } computeWater(); const [w, t] = flowersWatered(); if (w === t) { phase = 'won'; wonT = performance.now() - BLOOM_DUR - 350; } render(performance.now()); return this.state; },
    next() { genLevel(level + 1); }, goto(n) { genLevel(n); },
  };

  // ---------- boot ----------
  setCanvasVars();
  resizeCanvas();
  fitFullscreen();
  resizeCanvas();
  genLevel(loadLevel(), true);
  // Re-measure after boot. innerWidth/innerHeight can read 0, or a stale
  // pre-layout value, while this script first runs. Timers rather than rAF —
  // rAF is throttled to nothing in some embedded browsers, which is exactly
  // where a stale size would otherwise stick.
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);   // iOS URL-bar collapse
})();
