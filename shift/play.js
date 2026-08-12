/* ============================================================
   Shift · a Zamborin Game — a variant of Bloom, one verb changed.

   Bloom: tap a pipe to rotate it.
   Shift: DRAG A WHOLE ROW sideways. A tile's connectors are fixed
   forever at generation and never turn.

   THE BOARD IS TWO PARTS AND THEY MUST STAY SEPARATE. The interior
   grid slides. The tap and the flowers sit in a border ring and never
   move — the tiles travel underneath them. Orbit does the same thing
   in polar form: its bulbs are held in ABSOLUTE index while the arcs
   rotate in ring-local index. If the targets slid too, they would move
   every time the player acted and the board would be unreadable.

   Water, flowers, pipes, HUD, sound and persistence are Bloom's,
   reused as directly as the geometry allows.
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
  const SNAP_MS = 150, BLOOM_DUR = 450;  // flower blossom (slowed 50%, from 300, so it can be savoured)
  // Recompute the water whenever a dragged lane passes within this fraction of
  // a cell of true alignment, so the flood updates AS you drag rather than only
  // on release. Orbit uses the same tolerance to decide when a ring's joint
  // counts as connected.
  const ALIGN_TOL = 0.05;
  const AXIS_LOCK = 8;                   // px of travel before a drag commits to an axis

  // directions as bits
  const N = 1, E = 2, S = 4, W = 8;
  const DIR = [N, E, S, W];
  const DR = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 };
  const DC = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 };
  const OPP = { [N]: S, [E]: W, [S]: N, [W]: E };
  const ANG = { [N]: -Math.PI / 2, [E]: 0, [S]: Math.PI / 2, [W]: Math.PI };
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
    else { LW = 560; LH = 640; }
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
  // The interior grid is pipes and nothing else. Every tile can slide.
  let conn = [], sol = [], watered = [];
  // The border ring. Fixed for the whole level — these never move.
  //   { side: 'N'|'E'|'S'|'W', i }   N/S index a COLUMN, E/W index a ROW
  let tap = null, flowers = [];          // flowers: { side, i, color, bloomT, open }
  let level = 1, moves = 0, par = 0, phase = 'play';   // phase: menu | play | won
  let raf = 0, fb = 0, animEnd = 0, wonT = -1e9, initConn = [], history = [], uiButtons = [];
  // live drag: which row, how far, and whether it has committed to an axis yet
  let drag = null, snapAnim = null, hoverRow = -1;
  const LS = 'zamborin-shift.level';
  function saveLevel() { try { localStorage.setItem(LS, String(level)); } catch (e) {} }
  function loadLevel() { try { const v = parseInt(localStorage.getItem(LS), 10); return (v >= 1 && v <= 999) ? v : 1; } catch (e) { return 1; } }

  const idx = (r, c) => r * C + c;
  const rc = (i) => ({ r: (i / C) | 0, c: i % C });
  const TOP_BAND = 100, BOT_BAND = 96, SIDE_PAD = 30;
  // The grid shape differs by device: a tall portrait grid on mobile (5 wide,
  // as many rows as fit the phone), a square-ish grid on desktop.
  // A slide disturbs every tile in its lane, so the board has to stay small
  // enough to hold in your head — 7 is the cap in either direction. It is also
  // where a 44px touch target runs out: 7 columns on a 360px screen is 51px a
  // cell before the border ring, and the ring costs two more.
  function gridDims(lvl) {
    if (MODE === 'mobile') return [6, 5];                    // 5 wide, 6 tall
    const s = 5 + Math.min(Math.floor((lvl - 1) / 4), 2);    // 5 → 7, square
    return [s, s];
  }
  function layout() {
    // The floors matter. A browser can report a 0×0 viewport for the first
    // frame, and any height under the two bands (196px) drives cell negative —
    // which then throws on the tile corner radius and leaves the board blank.
    //
    // The +2 is the border ring: one cell of margin on every side, where the
    // tap and the flowers live. They are outside the sliding grid on purpose.
    const availW = Math.max(60, LW - SIDE_PAD * 2);
    const availH = Math.max(60, LH - TOP_BAND - BOT_BAND);
    cell = Math.max(8, Math.floor(Math.min(availW / (C + 2), availH / (R + 2))));
    ox = Math.round((LW - C * cell) / 2);
    oy = Math.round(TOP_BAND + (availH - (R + 2) * cell) / 2 + cell);
  }
  const ccx = (c) => ox + (c + 0.5) * cell;
  const ccy = (r) => oy + (r + 0.5) * cell;

  // ---------- border ring ----------
  // A border slot names the interior tile it touches, and the direction that
  // tile must have a connector in for water to cross the gap.
  function feeder(b) {
    if (b.side === 'N') return { i: idx(0, b.i), d: N };
    if (b.side === 'S') return { i: idx(R - 1, b.i), d: S };
    if (b.side === 'W') return { i: idx(b.i, 0), d: W };
    return { i: idx(b.i, C - 1), d: E };
  }
  function borderXY(b) {
    if (b.side === 'N') return [ccx(b.i), oy - cell * 0.5];
    if (b.side === 'S') return [ccx(b.i), oy + R * cell + cell * 0.5];
    if (b.side === 'W') return [ox - cell * 0.5, ccy(b.i)];
    return [ox + C * cell + cell * 0.5, ccy(b.i)];
  }

  // ---------- water flood ----------
  // Bloom's flood, verbatim, with one change: the seed. Bloom starts at a fixed
  // interior cell. Shift starts at whichever tile currently sits next to the
  // tap, and ONLY if that tile happens to have a connector facing it. If it
  // does not, nothing is watered at all — a legal and very legible state.
  function floodFrom(cn) {
    const wet = new Array(R * C).fill(false);
    const f = feeder(tap);
    if (!(cn[f.i] & f.d)) return wet;                 // nothing reaches the grid
    const st = [f.i]; wet[f.i] = true;
    while (st.length) {
      const i = st.pop(), { r, c } = rc(i);
      for (const d of DIR) {
        if (!(cn[i] & d)) continue;
        const nr = r + DR[d], nc = c + DC[d];
        if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
        const j = idx(nr, nc);
        if (!wet[j] && (cn[j] & OPP[d])) { wet[j] = true; st.push(j); }
      }
    }
    return wet;
  }
  // A flower opens when its feeder tile is wet AND that tile points out at it.
  function bloomState(cn, wet) {
    return flowers.map(fl => { const f = feeder(fl); return wet[f.i] && !!(cn[f.i] & f.d); });
  }
  function computeWater(now) {
    const was = flowers.map(f => f.open);
    watered = floodFrom(conn);
    const open = bloomState(conn, watered);
    for (let k = 0; k < flowers.length; k++) {
      flowers[k].open = open[k];
      // rising edge only, so re-watering an already-open flower does not
      // re-trigger its blossom
      if (open[k] && !was[k]) flowers[k].bloomT = now || performance.now();
    }
  }
  function flowersWatered() { return [flowers.filter(f => f.open).length, flowers.length]; }
  function wateredPipes() { let n = 0; for (let i = 0; i < R * C; i++) if (watered[i]) n++; return n; }

  // ---------- sound ----------
  // Synthesis lives in shared/sfx.js. Bloom's palette is water and plumbing: a
  // soft tok as a pipe turns, a low swell when the water actually gains ground,
  // and a bell per flower rising in pitch as the garden fills.
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zamborin-shift.sound' }) : null;
  const snd = {
    on: () => !!(sfx && sfx.isOn()),
    ready() { if (sfx) sfx.ensureAudio(); },
    toggle() { if (!sfx) return; sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.tone(880, 0.05, 0.03, 'sine'); },
    // Bloom's 430Hz tok said "a thing clicked into place". A slide has to say
    // "a thing moved", so it is a short filtered noise sweep instead.
    slide() { if (sfx) sfx.noise(0.09, 900, 1.4, 0.022); },
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
  // Fired only from player-facing paths. genLevel scrambles in a loop that
  // floods the board up to 12 times, and must stay silent.
  let lastFlowers = 0, lastPipes = 0;
  function seedSound() { lastFlowers = flowersWatered()[0]; lastPipes = wateredPipes(); }
  function announceWater() {
    if (phase === 'menu') { seedSound(); return; }
    const f = flowersWatered()[0], p = wateredPipes();
    if (p > lastPipes) snd.flow();
    if (f > lastFlowers) for (let i = lastFlowers + 1; i <= f; i++) snd.flower(i);
    lastFlowers = f; lastPipes = p;
  }

  // ---------- generation (random spanning tree, then slide-scramble) ----------
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]]; } }

  // Slide one row by k cells, wrapping. This is the only thing that ever
  // changes the board — a tile's connector mask is fixed at generation.
  function slideRow(cn, r, k) {
    k = ((k % C) + C) % C;
    if (!k) return;
    const row = [];
    for (let c = 0; c < C; c++) row.push(cn[idx(r, c)]);
    for (let c = 0; c < C; c++) cn[idx(r, (c + k) % C)] = row[c];
  }
  function slideCol(cn, c, k) {
    k = ((k % R) + R) % R;
    if (!k) return;
    const col = [];
    for (let r = 0; r < R; r++) col.push(cn[idx(r, c)]);
    for (let r = 0; r < R; r++) cn[idx((r + k) % R, c)] = col[r];
  }
  // One move, either axis. Rows and columns together make this a torus puzzle
  // rather than a set of independent lanes — the same reason a Rubik's cube is
  // hard is that the two axes interfere.
  const applyMove = (cn, m) => (m.axis === 'row' ? slideRow(cn, m.i, m.k) : slideCol(cn, m.i, m.k));
  function lanesOf() {
    const out = [];
    for (let r = 0; r < R; r++) for (let k = 1; k < C; k++) out.push({ axis: 'row', i: r, k });
    for (let c = 0; c < C; c++) for (let k = 1; k < R; k++) out.push({ axis: 'col', i: c, k });
    return out;
  }

  // How far out to prove uniqueness. Each extra ply multiplies the frontier by
  // the number of lanes, so this is where the cost lives; 3 already covers the
  // neighbourhood a player explores around a near-solution.
  const UNIQ_DEPTH = 3;
  // True when the ONLY arrangement within `depth` slides of `start` that waters
  // every flower is the intended one.
  function uniqueWithin(start, solKey, depth) {
    const lanes = lanesOf();
    const seen = new Set([start.join(',')]);
    let frontier = [start];
    for (let d = 1; d <= depth; d++) {
      const next = [];
      for (const cur of frontier) {
        for (const m of lanes) {
          const cn = cur.slice(); applyMove(cn, m);
          const key = cn.join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          const wet = floodFrom(cn);
          if (bloomState(cn, wet).every(Boolean) && key !== solKey) return false;   // a second answer
          next.push(cn);
        }
        if (seen.size > 60000) return true;    // gave up early; treat as good enough
      }
      frontier = next;
    }
    return true;
  }

  function curve(lvl) {
    const scrambles = Math.min(12, 3 + Math.floor((lvl - 1) * 0.8));   // 3 → 12
    const maxFlowers = Math.min(6, 4 + Math.floor((lvl - 1) / 5));     // 4 → 6
    return { scrambles, maxFlowers };
  }

  function genLevel(lvl, asMenu) {
    level = lvl; saveLevel();
    const [gr, gc] = gridDims(lvl);
    R = gr; C = gc;
    const n = R * C;
    const { scrambles, maxFlowers } = curve(lvl);

    // union-find spanning tree — Bloom's, verbatim. Guarantees every interior
    // cell is connected, which is what makes the solved board waterable.
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

    // Every border slot, paired with the tile it feeds.
    const slots = [];
    for (let c = 0; c < C; c++) { slots.push({ side: 'N', i: c }); slots.push({ side: 'S', i: c }); }
    for (let r = 0; r < R; r++) { slots.push({ side: 'W', i: r }); slots.push({ side: 'E', i: r }); }
    shuffle(slots);

    // TAP: any border slot. Its feeder tile gains the outward connector.
    tap = slots.pop();
    const tf = feeder(tap);
    tree[tf.i] |= tf.d;

    // FLOWERS: prefer slots fed by a tree LEAF, so the flower sits at the end of
    // a branch rather than mid-pipe — that is what makes a solved board read as
    // a plant watered at its tips. Fall back to any free slot if leaves run out.
    const deg = tree.map(pop);
    const used = new Set([tf.i]);
    const leafFirst = slots.filter(sl => { const f = feeder(sl); return deg[f.i] === 1 && !used.has(f.i); })
      .concat(slots.filter(sl => { const f = feeder(sl); return deg[f.i] !== 1 && !used.has(f.i); }));
    flowers = [];
    for (const sl of leafFirst) {
      if (flowers.length >= maxFlowers) break;
      const f = feeder(sl);
      if (used.has(f.i)) continue;                 // one border attachment per tile
      used.add(f.i);
      tree[f.i] |= f.d;
      flowers.push({ side: sl.side, i: sl.i, color: (Math.random() * PALETTE.length) | 0, bloomT: -1e9, open: false });
    }

    // This arrangement waters every flower: the tree connects every cell, and
    // each flower's feeder is part of it. Keep it as the answer.
    sol = tree.slice();

    // SCRAMBLE on both axes. The inverse of a slide is a slide on the same
    // lane, so the answer stays reachable with exactly the verbs the player
    // has — that argument does not care which axis, only that we never use a
    // move the player cannot undo.
    //
    // UNIQUENESS. A puzzle with several answers is a cheaper thing to solve, so
    // every level is checked: breadth-first from the scrambled board out to the
    // scramble depth, rejecting the level if any arrangement OTHER than the
    // intended one waters every flower. That is a bounded guarantee, not a
    // global one — the reachable space on two axes is far too large to
    // enumerate — but it is the radius a player actually searches.
    const solKey = sol.join(',');
    let tries = 0, ok = false;
    do {
      conn = sol.slice();
      const moves = [];
      for (let k = 0; k < scrambles; k++) {
        const lanes = lanesOf();
        const m = lanes[(Math.random() * lanes.length) | 0];
        applyMove(conn, m); moves.push(m);
      }
      tries++;
      watered = floodFrom(conn);
      if (bloomState(conn, watered).every(Boolean)) continue;      // started solved
      if (conn.join(',') === solKey) continue;                     // scramble undid itself
      ok = uniqueWithin(conn, solKey, Math.min(scrambles, UNIQ_DEPTH));
    } while (!ok && tries < 60);
    par = scrambles;

    initConn = conn.slice();
    moves = 0; phase = asMenu ? 'menu' : 'play'; history = []; animEnd = 0; wonT = -1e9;
    drag = null; snapAnim = null; hoverRow = -1;
    computeWater(); seedSound(); layout(); render(performance.now());
  }
  function restart() {
    conn = initConn.slice(); moves = 0; phase = 'play'; history = [];
    flowers.forEach(f => { f.bloomT = -1e9; f.open = false; });
    drag = null; snapAnim = null;
    computeWater(); seedSound(); render(performance.now());
  }

  // ---------- input: drag a row ----------
  function commitSlide(axis, i, k, now, silent) {
    if (!k) return;
    applyMove(conn, { axis, i, k });
    if (!silent) { history.push({ axis, i, k }); if (history.length > 400) history.shift(); moves++; snd.slide(); }
    computeWater(now);
    announceWater();
    const [w, t] = flowersWatered();
    animEnd = Math.max(now + SNAP_MS + 40, now + BLOOM_DUR + 40);
    if (w === t && phase === 'play') { phase = 'won'; wonT = now; snd.win(); animEnd = Math.max(animEnd, now + BLOOM_DUR + 350 + 450 + 60); }
    ensureAnim(now);
  }
  function undo() {
    if (!history.length || phase !== 'play') return;
    const h = history.pop();
    applyMove(conn, { axis: h.axis, i: h.i, k: -h.k }); moves++;
    snd.undo();
    computeWater(); announceWater(); render(performance.now());
  }
  function ensureAnim(now) { render(now); if (!raf) { raf = 1; requestAnimationFrame(tick); } clearTimeout(fb); fb = setTimeout(() => { raf = 0; render(performance.now()); }, (animEnd - now) + 120); }
  function tick(t) {
    if (snapAnim && t >= snapAnim.end) snapAnim = null;
    render(t);
    if (t < animEnd || snapAnim || drag) requestAnimationFrame(tick); else raf = 0;
  }

  function toLocal(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX ?? e.changedTouches?.[0]?.clientX) - rect.left) * (LW / rect.width),
      y: ((e.clientY ?? e.changedTouches?.[0]?.clientY) - rect.top) * (LH / rect.height),
    };
  }
  const rowAt = (y) => Math.floor((y - oy) / cell);
  const colAt = (x) => Math.floor((x - ox) / cell);

  function onDown(e) {
    snd.ready();                        // browsers only allow audio after a gesture
    const { x, y } = toLocal(e);
    for (const b of uiButtons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { e.preventDefault(); b.act(); return; }
    if (phase === 'menu') { phase = 'play'; render(performance.now()); return; }
    if (phase === 'won') { genLevel(level + 1); return; }
    // The snap is only the sub-cell remainder easing out — the move it belongs
    // to committed on release. Refusing a new drag while it runs swallowed any
    // second slide made within 150ms, which is well inside the speed someone
    // solving quickly actually moves at.
    snapAnim = null;
    const r = rowAt(y), c = colAt(x);
    if (r < 0 || r >= R || c < 0 || c >= C) return;
    e.preventDefault();
    drag = { r, c, x0: x, y0: y, dx: 0, dy: 0, axis: null, id: e.pointerId };
    canvas.setPointerCapture?.(e.pointerId);
    ensureAnim(performance.now());
  }
  function onMove(e) {
    // No hover highlight now that a cell belongs to two lanes at once: showing
    // both would say the wrong thing, and picking one would be a guess about
    // which way the player intends to drag.
    if (!drag) return;
    const { x, y } = toLocal(e);
    const dx = x - drag.x0, dy = y - drag.y0;
    // Whichever axis moved further first wins, and then holds for the rest of
    // the gesture. Re-deciding mid-drag makes a diagonal finger jitter between
    // two lanes, which feels broken even though it is doing what it was told.
    if (!drag.axis) {
      if (Math.abs(dx) > AXIS_LOCK && Math.abs(dx) >= Math.abs(dy)) drag.axis = 'row';
      else if (Math.abs(dy) > AXIS_LOCK) drag.axis = 'col';
      else return;
    }
    drag.dx = dx; drag.dy = dy;
    render(performance.now());
  }
  function endDrag(e, cancel) {
    if (!drag) return;
    const d = drag; drag = null;
    canvas.releasePointerCapture?.(d.id);
    if (!d.axis || cancel) { render(performance.now()); return; }
    const now = performance.now();
    const travel = d.axis === 'row' ? d.dx : d.dy;
    const k = Math.round(travel / cell);
    // COMMIT NOW, animate afterwards. The move must not depend on an animation
    // frame arriving: rAF is throttled to nothing in some embedded browsers,
    // and a version of this that committed inside tick() silently dropped every
    // slide there — the drag looked right and the board never changed.
    commitSlide(d.axis, d.axis === 'row' ? d.r : d.c, k, now);
    // What is left is the sub-cell remainder, easing back to zero. Purely
    // cosmetic; the board is already in its new state.
    const rest = travel - k * cell;
    if (Math.abs(rest) > 0.5) {
      snapAnim = { axis: d.axis, i: d.axis === 'row' ? d.r : d.c, from: rest, t0: now, end: now + SNAP_MS };
      animEnd = Math.max(animEnd, snapAnim.end + 40);
    }
    ensureAnim(now);
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', (e) => endDrag(e, false));
  canvas.addEventListener('pointercancel', (e) => endDrag(e, true));
  canvas.addEventListener('pointerleave', () => { if (!drag && hoverRow !== -1) { hoverRow = -1; render(performance.now()); } });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'z' || e.key === 'Z') undo();
    if (e.key === 'r' || e.key === 'R') restart();
    if (e.key === 'n' || e.key === 'N') genLevel(++level);
  });

  // ---------- render ----------
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  function roundRect(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // How far is a given row currently displaced, in pixels? Non-zero only for
  // the lane being dragged, or the one easing into its snap.
  // Pixel displacement of the tile at (r,c), as [dx, dy]. Only the lane being
  // dragged, or the one easing out its remainder, is ever non-zero.
  function tileOffset(r, c, now) {
    if (drag && drag.axis === 'row' && drag.r === r) return [drag.dx, 0];
    if (drag && drag.axis === 'col' && drag.c === c) return [0, drag.dy];
    if (snapAnim) {
      const hit = snapAnim.axis === 'row' ? snapAnim.i === r : snapAnim.i === c;
      if (hit) {
        const t = Math.max(0, Math.min(1, (now - snapAnim.t0) / SNAP_MS));
        const v = t >= 1 ? 0 : snapAnim.from * (1 - ease(t));
        return snapAnim.axis === 'row' ? [v, 0] : [0, v];
      }
    }
    return [0, 0];
  }
  // The board as it WOULD be if the live drag were committed right now. Used so
  // the water updates while the finger is still down — the player sees the
  // consequence of a slide before choosing it.
  function previewConn(now) {
    if (!drag || !drag.axis) return null;
    const off = (drag.axis === 'row' ? drag.dx : drag.dy) / cell;
    const k = Math.round(off);
    // only when the lane is genuinely near an aligned position
    if (Math.abs(off - k) > ALIGN_TOL || !k) return null;
    const cn = conn.slice();
    applyMove(cn, { axis: drag.axis, i: drag.axis === 'row' ? drag.r : drag.c, k });
    return cn;
  }

  function render(now) {
    ctx.clearRect(0, 0, LW, LH);
    const bg = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
    bg.addColorStop(0, BG_TOP); bg.addColorStop(0.6, BG_MID); bg.addColorStop(1, BG_BOT);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);
    uiButtons = [];

    // While dragging, everything is drawn from the previewed arrangement, so
    // pipes light up as the lane passes each aligned position.
    const pv = previewConn(now);
    const shownConn = pv || conn;
    const shownWet = pv ? floodFrom(pv) : watered;
    const shownOpen = pv ? bloomState(pv, shownWet) : flowers.map(f => f.open);

    // active lane band, behind everything
    if (drag && drag.axis) {
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      if (drag.axis === 'row') roundRect(ox - cell, oy + drag.r * cell + 2, C * cell + cell * 2, cell - 4, cell * 0.14);
      else roundRect(ox + drag.c * cell + 2, oy - cell, cell - 4, R * cell + cell * 2, cell * 0.14);
      ctx.fill();
    }

    // faint tile plots — these mark the fixed grid, not the tiles, so they do
    // NOT move with a lane
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      roundRect(ox + c * cell + 3, oy + r * cell + 3, cell - 6, cell - 6, cell * 0.14); ctx.fill();
    }

    drawLaneChevrons();

    // pipes, row by row, clipped to the grid so a sliding lane cannot spill
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, C * cell, R * cell); ctx.clip();
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const i = idx(r, c);
      const [dx, dy] = tileOffset(r, c, now);
      const bx = ccx(c) + dx, by = ccy(r) + dy;
      // Drawn again a full lane-length away on the moving axis. That is what
      // makes the wrap visible: the tile leaving one edge is entering at the
      // other in the same instant, instead of teleporting.
      const span = dx ? C * cell : R * cell;
      const copies = (dx || dy)
        ? [[bx, by], [bx - (dx ? span : 0), by - (dy ? span : 0)], [bx + (dx ? span : 0), by + (dy ? span : 0)]]
        : [[bx, by]];
      for (const [px, py] of copies) {
        if (px < ox - cell || px > ox + C * cell + cell) continue;
        if (py < oy - cell || py > oy + R * cell + cell) continue;
        ctx.save(); ctx.translate(px, py);
        drawPipesLocal(shownConn[i], shownWet[i]);
        ctx.restore();
      }
    }
    ctx.restore();

    drawBorderRing(now, shownConn, shownWet, shownOpen);
    drawHUD(now);
    if (phase === 'play') drawControls();
    if (phase === 'won') winOverlay(now);
    if (phase === 'menu') menuOverlay();
  }

  // Chevrons outside each lane, saying which way the board moves. On desktop
  // only the hovered lane shows them; on a phone there is no hover, so the
  // first two levels show them faintly on every lane and then stop.
  // Chevrons outside every lane, on both axes, saying the board moves both
  // ways. Faint until a lane is actually being dragged.
  function drawLaneChevrons() {
    if (phase !== 'play') return;
    const liveRow = drag && drag.axis === 'row' ? drag.r : -1;
    const liveCol = drag && drag.axis === 'col' ? drag.c : -1;
    const mark = (x, y, dx, dy, a) => {
      ctx.strokeStyle = 'rgba(255,255,255,' + a + ')';
      ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const s2 = cell * 0.13;
      ctx.beginPath();
      if (dx) { ctx.moveTo(x - s2 * dx, y - s2); ctx.lineTo(x + s2 * dx, y); ctx.lineTo(x - s2 * dx, y + s2); }
      else { ctx.moveTo(x - s2, y - s2 * dy); ctx.lineTo(x, y + s2 * dy); ctx.lineTo(x + s2, y - s2 * dy); }
      ctx.stroke();
    };
    for (let r = 0; r < R; r++) {
      const a = r === liveRow ? 0.35 : (level <= 2 ? 0.15 : 0.08);
      mark(ox - cell * 0.55, ccy(r), -1, 0, a);
      mark(ox + C * cell + cell * 0.55, ccy(r), 1, 0, a);
    }
    for (let c = 0; c < C; c++) {
      const a = c === liveCol ? 0.35 : (level <= 2 ? 0.15 : 0.08);
      mark(ccx(c), oy - cell * 0.55, 0, -1, a);
      mark(ccx(c), oy + R * cell + cell * 0.55, 0, 1, a);
    }
  }

  // The border ring: the tap and the flowers, at fixed positions, with a short
  // stub of pipe reaching in to the grid edge.
  function drawBorderRing(now, cn, wet, open) {
    const stub = (b, on) => {
      const [bx, by] = borderXY(b);
      const f = feeder(b);
      const { r, c } = rc(f.i);
      const gx = ccx(c), gy = ccy(r);
      ctx.lineCap = 'butt';
      for (const [wide, col] of [[true, on ? PIPE_WET_LINE : PIPE_DRY_LINE], [false, on ? PIPE_WET : PIPE_DRY]]) {
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(gx, gy);
        ctx.lineWidth = cell * 0.085 + (wide ? 5 : 0); ctx.strokeStyle = col; ctx.stroke();
      }
    };
    // tap
    const tf = feeder(tap);
    const tapOn = !!(cn[tf.i] & tf.d) && wet[tf.i];
    stub(tap, tapOn);
    const [tx, ty] = borderXY(tap);
    drawTap(tx, ty, tapOn);
    // flowers
    for (let k = 0; k < flowers.length; k++) {
      const fl = flowers[k];
      stub(fl, open[k]);
      const [fx, fy] = borderXY(fl);
      const prog = open[k] ? Math.min(1, (now - fl.bloomT) / BLOOM_DUR) : 0;
      drawTulip(fx, fy, cell, open[k] ? 3 * ease(Math.max(0.001, prog)) : 0, fl.color);
    }
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
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff'; ctx.font = '800 ' + Math.round(30 * hs) + 'px Inter, sans-serif'; ctx.fillText('SHIFT', P, Math.round(22 * hs));
    const [w, t] = flowersWatered();
    ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.font = '600 ' + Math.round(16 * hs) + 'px Inter, sans-serif';
    // No par. With two axes the puzzle is hard enough that solving it at all is
    // the reward, and a move target measured from the scramble length was
    // beaten trivially anyway — search finds shorter paths than the scrambler
    // took, so it was never a real number.
    ctx.fillText('Level ' + level + '   ·   ' + w + '/' + t + ' watered   ·   ' +
      moves + (moves === 1 ? ' move' : ' moves'), P, Math.round(56 * hs));
    if (phase === 'play' && moves === 0) {
      // BELOW the control row. At LH-118 this sat inside the board: the grid is
      // centred in the space between the bands and fills it, so its bottom edge
      // lands ~2px above the buttons and there is no gap above them to sit in.
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.42)'; ctx.font = '500 ' + Math.round(15 * hs) + 'px Inter, sans-serif';
      ctx.fillText('Drag any row or column to move the pipes.', LW / 2, LH - 46);
    }
  }
  function pill(label, cx, cy, dim) {
    ctx.font = '700 15px Inter, sans-serif';
    const w = Math.round(ctx.measureText(label).width + 36), h = 40, x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
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
    const cy = LH - 74, gap = 12, wS = 44;
    ctx.font = '700 15px Inter, sans-serif';
    const wU = Math.round(ctx.measureText('Undo').width + 36), wR = Math.round(ctx.measureText('Restart').width + 36), wH = Math.round(ctx.measureText('Rules').width + 36);
    let x = Math.round(LW / 2 - (wS + wU + wR + wH + gap * 3) / 2);
    uiButtons.push({ ...iconPill(x + wS / 2, cy, snd.on()), act: () => { snd.ready(); snd.toggle(); render(performance.now()); } }); x += wS + gap;
    uiButtons.push({ ...pill('Undo', x + wU / 2, cy, !history.length), act: undo }); x += wU + gap;
    uiButtons.push({ ...pill('Restart', x + wR / 2, cy, false), act: restart }); x += wR + gap;
    uiButtons.push({ ...pill('Rules', x + wH / 2, cy, false), act: () => { phase = 'menu'; render(performance.now()); } });
  }
  function winOverlay(now) {
    // let the final blossom finish + a beat, then fade the banner in gently
    const t = Math.max(0, Math.min(1, (now - (wonT + BLOOM_DUR + 350)) / 450));
    if (t <= 0) return;
    ctx.globalAlpha = t;
    ctx.fillStyle = 'rgba(10,16,28,0.82)'; ctx.fillRect(0, 0, LW, LH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9fe6a4'; ctx.font = '800 56px Inter, sans-serif'; ctx.fillText('ALL IN LINE', LW / 2, LH / 2 - 30);
    ctx.fillStyle = '#FFD166'; ctx.font = '600 24px Inter, sans-serif'; ctx.fillText('every flower watered in ' + moves + (moves === 1 ? ' move' : ' moves'), LW / 2, LH / 2 + 22);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '500 20px Inter, sans-serif'; ctx.fillText('tap for the next garden', LW / 2, LH / 2 + 62);
    ctx.globalAlpha = 1;
  }
  function wrapText(text, x, y, maxW, lh, align) {
    const words = text.split(' '); let line = '';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'top';
    for (const w of words) { const tt = line ? line + ' ' + w : w; if (ctx.measureText(tt).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = tt; }
    if (line) { ctx.fillText(line, x, y); y += lh; } return y;
  }
  function menuOverlay() {
    ctx.fillStyle = 'rgba(10,16,28,0.88)'; ctx.fillRect(0, 0, LW, LH);
    const pw = Math.min(LW - 56, 470), ph = 372, px = (LW - pw) / 2, py = (LH - ph) / 2;
    ctx.fillStyle = '#16233a'; roundRect(px, py, pw, ph, 22); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; roundRect(px, py, pw, ph, 22); ctx.stroke();
    const cx = LW / 2; let y = py + 34;
    ctx.fillStyle = '#fff'; ctx.font = '800 40px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('SHIFT', cx, y); y += 54;
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = '600 17px Inter, sans-serif';
    y = wrapText('Slide the pipes until water reaches every flower.', cx, y, pw - 70, 24); y += 18;
    const rules = ['Drag any row or column of pipes.', 'Water flows from the tap through the pipes that line up.', 'A flower blooms only when the water reaches it — open them all.'];
    const rx = px + 32;
    for (let i = 0; i < rules.length; i++) {
      ctx.fillStyle = '#3a9bde'; ctx.beginPath(); ctx.arc(rx + 11, y + 11, 12, 0, 7); ctx.fill();
      ctx.fillStyle = '#0E1726'; ctx.font = '800 14px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), rx + 11, y + 12);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '500 15px Inter, sans-serif';
      y = wrapText(rules[i], rx + 34, y, pw - 100, 21, 'left') + 13;
    }
    const label = moves > 0 ? 'RESUME' : 'PLAY';
    ctx.font = '800 17px Inter, sans-serif';
    const bw = Math.round(Math.max(210, ctx.measureText(label).width + 90)), bh = 50, bx = cx - bw / 2, by = py + ph - 32 - bh / 2;
    ctx.fillStyle = '#3DDC84'; roundRect(bx, by, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = '#0E1726'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx, by + bh / 2 + 1);
    uiButtons.push({ x: bx, y: by, w: bw, h: bh, act: () => { phase = 'play'; render(performance.now()); } });
  }

  // ---------- debug ----------
  window.__shift = {
    get state() { const [w, t] = flowersWatered(); return { level, R, C, moves, par, phase, watered: w, flowers: t, tap, dragging: !!drag }; },
    solve() { conn = sol.slice(); computeWater(); const [w, t] = flowersWatered(); if (w === t) { phase = 'won'; wonT = performance.now() - BLOOM_DUR - 350; } render(performance.now()); return this.state; },
    slide(axis, i, k) { commitSlide(axis, i, k, performance.now()); return this.state; },
    lanes() { return lanesOf(); },
    apply(cn, m) { const o = cn.slice(); applyMove(o, m); return o; },
    scramble() { return { conn: conn.slice(), sol: sol.slice() }; },
    // Enough to reason about a hypothetical board without committing to it:
    // which flowers a given arrangement would open. Used to answer whether
    // progress accumulates or a slide costs as much as it gains.
    shape() { return { R, C, tap, flowers: flowers.map(f => ({ side: f.side, i: f.i })) }; },
    openFor(cn) { const wet = floodFrom(cn); return bloomState(cn, wet); },
    wetFor(cn) { return floodFrom(cn).filter(Boolean).length; },
    next() { genLevel(level + 1); }, goto(n) { genLevel(n); },
    get buttons() { render(performance.now()); return uiButtons.map((b, i) => ({ i, x: b.x, y: b.y, w: b.w, h: b.h })); },
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
