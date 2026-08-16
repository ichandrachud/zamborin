/* ============================================================
   Prism · a Zamborin Game

   A source fires a white beam. A PRISM splits white into its three
   primaries: red carries straight on, green leaves to the left, blue
   to the right. GEMS each want one colour. MIRRORS are the only thing
   the player touches: tap one to flip it between / and \, which turns
   any beam that hits it by 90 degrees.

   From level 5 the twist arrives: two beams routed into the same gem
   ADD, so red and green together make yellow. That couples two routes
   to each other and is where the real thinking is.

   Every board is BUILT SOLVED and then scrambled. The generator walks
   the white beam to the prism, then walks each coloured beam out to
   its gem, dropping a mirror at every corner and recording the
   orientation that makes the turn. Scrambling only flips those
   recorded mirrors, so the recorded solution is still a solution, and
   it is re-simulated and checked before the board is ever served.
   ============================================================ */
(() => {
  'use strict';

  let LW = 760, LH = 600;                 // logical canvas size, set per mode
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const UI = window.ZAM_UI;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const BG_TOP = '#1B2A47', BG_MID = '#131F36', BG_BOT = '#0E1726';
  const ACCENT = '#6B46E0';               // CTA fill; white label on it is 5.9:1
  const FLIP_MS = 190, BLOOM_MS = 460;

  // ---------- directions ----------
  // Clockwise, so left and right of travel are just -1 and +1.
  const N = 0, E = 1, S = 2, W = 3;
  const DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1];
  const OPP   = (d) => (d + 2) & 3;
  const LEFT  = (d) => (d + 3) & 3;
  const RIGHT = (d) => (d + 1) & 3;
  const axisOf = (d) => (d & 1) ? 1 : 2;   // 1 = horizontal, 2 = vertical

  // Mirror orientations. Written as arithmetic because both happen to be exact:
  //   /  sends N<->E and S<->W, which is d ^ 1
  //   \  sends N<->W and S<->E, which is 3 - d
  const SLASH = 0, BACK = 1;
  const reflect = (d, o) => (o === SLASH ? (d ^ 1) : (3 - d));
  const mirrorFor = (din, dout) => (((din ^ 1) === dout) ? SLASH : BACK);

  // ---------- colour ----------
  // Colours are bit masks so beams sharing a segment can simply be OR'd, which
  // is what additive light actually does.
  const R_ = 1, G_ = 2, B_ = 4, WHITE = 7;
  const COL = {
    1: '#FF4757', 2: '#39E77B', 4: '#4C8DFF',
    3: '#FFD93D', 5: '#FF6BD6', 6: '#4EE8E0', 7: '#F2FAFF',
  };
  // The bright inner core of a beam. These stay close to their own hue on
  // purpose: near-white highlights over an additive core made every beam read
  // white down the middle, and telling the colours apart IS the game.
  const COL_HI = {
    1: '#FF8E97', 2: '#8CF5B6', 4: '#8FB8FF',
    3: '#FFE98A', 5: '#FFA8E2', 6: '#9BF6F1', 7: '#FFFFFF',
  };
  const CNAME = { 0: 'nothing', 1: 'Red', 2: 'Green', 4: 'Blue', 3: 'Yellow', 5: 'Magenta', 6: 'Cyan', 7: 'White' };
  // Same colours as channels, so glows can be built as gradients that fall off
  // to fully transparent. A flat arc at low alpha leaves a visible hard disc.
  const RGB = {
    1: [255, 71, 87], 2: [57, 231, 123], 4: [76, 141, 255],
    3: [255, 217, 61], 5: [255, 107, 214], 6: [78, 232, 224], 7: [242, 250, 255],
  };
  const rgba = (m, a) => { const c = RGB[m] || [255, 255, 255]; return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  const shade = (m, f) => {
    const c = RGB[m] || [255, 255, 255];
    return 'rgb(' + Math.min(255, Math.round(c[0] * f)) + ',' + Math.min(255, Math.round(c[1] * f)) + ',' + Math.min(255, Math.round(c[2] * f)) + ')';
  };
  // Each gem's outline is irregular but DERIVED FROM ITS CELL, so it is cut the
  // same way on every frame and does not shimmer as the board redraws.
  const gemShapes = {};
  function gemShape(i) {
    if (gemShapes[i]) return gemShapes[i];
    let s = (Math.imul(i, 2654435761) + 374761393) >>> 0;
    const rnd01 = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const n = 7, pts = [];
    for (let a = 0; a < n; a++) {
      const th = -Math.PI / 2 + (a / n) * Math.PI * 2 + (rnd01() - 0.5) * 0.42;
      const r = 0.80 + rnd01() * 0.28;
      pts.push([Math.cos(th) * r, Math.sin(th) * r]);
    }
    gemShapes[i] = pts;
    return pts;
  }
  function glow(cx, cy, r0, r1, m, a) {
    const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
    g.addColorStop(0, rgba(m, a)); g.addColorStop(0.45, rgba(m, a * 0.38)); g.addColorStop(1, rgba(m, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r1, 0, 7); ctx.fill();
  }
  const primsOf = (m) => [R_, G_, B_].filter((p) => m & p);

  // ---------- tiles ----------
  const T_EMPTY = 0, T_SOURCE = 1, T_MIRROR = 2, T_PRISM = 3, T_GEM = 4;

  // ---------- MODE + CANVAS ----------
  // ?mode=desktop / ?mode=mobile forces a layout. The in-app preview reports a
  // coarse pointer whatever window it is in, so without this the desktop frame
  // cannot be measured at all except by editing the source and putting it back.
  const FORCED = (location.search.match(/[?&]mode=(desktop|mobile)/) || [])[1];
  const MODE = FORCED || ((matchMedia('(pointer: coarse)').matches || window.innerWidth < 768) ? 'mobile' : 'desktop');
  document.body.classList.add('mode-' + MODE);
  function setCanvasVars() {
    // Mobile sizes from measured JS pixels. The shared CSS uses 100dvh, and on
    // iOS Safari with viewport-fit=cover that is NOT innerHeight, which
    // collapses the canvas to a strip.
    if (MODE === 'mobile') { LW = window.innerWidth; LH = window.innerHeight; }
    else { LW = 760; LH = 600; }          // the one desktop frame, site-wide
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
      gameWrap.style.width = window.innerWidth + 'px';
      gameWrap.style.height = window.innerHeight + 'px';
      return;
    }
    if (!document.body.classList.contains('focus-mode')) {
      gameWrap.style.width = ''; gameWrap.style.height = ''; return;
    }
    const vw = window.innerWidth, vh = window.innerHeight, aspect = LW / LH;
    let cw = vw, ch = Math.round(vw / aspect);
    if (ch > vh) { ch = vh; cw = Math.round(vh * aspect); }
    gameWrap.style.width = cw + 'px'; gameWrap.style.height = ch + 'px';
  }
  function onResize() {
    if (MODE === 'mobile') setCanvasVars();
    fitFullscreen(); resizeCanvas(); layout(); draw(performance.now());
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', onResize);

  // ---------- state ----------
  let R = 6, C = 8, cell = 80, ox = 0, oy = 0;
  let tile = [], orient = [], solOrient = [], isDecoy = [];
  let gemNeed = [], gemGot = [], seg = [], segD = [], maxD = 1;
  let blocked = [], axis = [];             // generator scratch
  let srcCell = 0, srcDir = E, prismCell = -1, prismDir = E;
  let level = 1, moves = 0, par = 0, phase = 'menu';   // menu | play | won
  let flipT = [], bloomT = [], startOrient = [], history = [];
  let uiButtons = [], animEnd = 0, wonT = -1e9, hoverCell = -1, pressCell = -1;
  let bgGrad = null;

  const LS = 'zamborin-prism.level';
  const saveLevel = () => { try { localStorage.setItem(LS, String(level)); } catch (e) {} };
  const loadLevel = () => { try { const v = parseInt(localStorage.getItem(LS), 10); return (v >= 1 && v <= 999) ? v : 1; } catch (e) { return 1; } };

  const idx = (r, c) => r * C + c;
  const rowOf = (i) => (i / C) | 0, colOf = (i) => i % C;
  function stepCell(i, d) {
    const r = rowOf(i) + DR[d], c = colOf(i) + DC[d];
    if (r < 0 || r >= R || c < 0 || c >= C) return -1;
    return r * C + c;
  }

  // ---------- layout ----------
  // No game name on the canvas: the tab, the page heading and the card the
  // player tapped all say it, and on canvas it costs a whole row. The controls
  // take that row instead, with the level read-out opposite them.
  const SIDE_PAD = MODE === 'mobile' ? 18 : 30;
  const topBand = () => MODE === 'mobile' ? 64 : 56;
  // Desktop keeps 40 below the board so the opening hint has a line of its own.
  // At 26 the board bottom sat 9px above the text.
  const botBand = () => MODE === 'mobile' ? 96 : 40;

  function gridDims(lvl) {
    if (MODE === 'mobile') {
      const cols = 6;                                   // portrait on a phone
      const cw = (LW - SIDE_PAD * 2) / cols;
      let rows = Math.floor((LH - topBand() - botBand()) / cw);
      // Capped at 10. The cell size on a phone is set by the WIDTH, so an
      // eleventh row does not make the board any bigger, it only eats the strip
      // the opening hint lives in.
      rows = Math.max(7, Math.min(rows, 10));
      return [rows, cols];
    }
    // 760x600 is landscape, so a SQUARE grid is bounded by the height and every
    // bit of chrome you reclaim just widens the margins. Two columns wider than
    // tall fills the frame, and is more board at the same cell size.
    const rows = 6 + Math.min(Math.floor((lvl - 1) / 5), 3);   // 6 -> 9
    // The play area is 700 x 504, a ratio of 1.39, so the GRID has to be about
    // 1.4 times wider than tall to fill it. A flat "+2 columns" only holds at
    // six rows: by nine rows it had drifted to 1.22 and the board was using
    // 81% of the width instead of 88%.
    return [rows, rows + (rows <= 6 ? 2 : 3)];                  // 8, 10, 11, 12
  }
  function layout() {
    const availW = Math.max(60, LW - SIDE_PAD * 2);
    const availH = Math.max(60, LH - topBand() - botBand());
    cell = Math.max(8, Math.floor(Math.min(availW / C, availH / R)));
    ox = Math.round((LW - C * cell) / 2);
    oy = Math.round(topBand() + (availH - R * cell) / 2);
    bgGrad = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
    bgGrad.addColorStop(0, BG_TOP); bgGrad.addColorStop(0.6, BG_MID); bgGrad.addColorStop(1, BG_BOT);
    // A thin core with a TIGHT bright glow, not a wide dim wash. The wash read
    // as fog; the light should look like a drawn line that is glowing.
    beamCore = Math.max(1.4, cell * 0.028);
    featherW = beamCore / 2 + Math.max(4, cell * 0.070);
    featherCache = {};
  }
  const ccx = (c) => ox + (c + 0.5) * cell;
  const ccy = (r) => oy + (r + 0.5) * cell;

  // ---------- beam simulation ----------
  // A beam state is (cell, direction of travel, colour mask). `seg` records, for
  // every cell and each of its four sides, the colour running along the half
  // segment between that side and the cell centre. Two beams sharing a half
  // segment OR together, which is exactly how mixing should read, while beams
  // crossing at right angles use different sides and stay separate.
  // `segD` records how far along the path each half segment is, in half cells,
  // which is what the light travelling outward from the source is drawn from.
  function simulate(now) {
    const n = R * C;
    seg = new Array(n * 4).fill(0);
    segD = new Array(n * 4).fill(0);
    const was = gemGot.slice();
    gemGot = new Array(n).fill(0);
    maxD = 1;
    if (tile[srcCell] !== T_SOURCE) return;

    const mark = (i, d, m, k) => {
      const s = i * 4 + d;
      if (!seg[s] || k < segD[s]) segD[s] = k;
      seg[s] |= m;
      if (k > maxD) maxD = k;
    };

    const seen = new Set();
    const queue = [];                      // FIFO, so segD comes out monotonic
    let head = 0;
    mark(srcCell, srcDir, WHITE, 0);
    const first = stepCell(srcCell, srcDir);
    if (first >= 0) queue.push([first, srcDir, WHITE, 1]);

    let guard = 0;
    while (head < queue.length && guard++ < 12000) {
      const [i, d, m, k] = queue[head++];
      const key = ((i << 2) | d) * 8 + m;
      if (seen.has(key)) continue;
      seen.add(key);

      mark(i, OPP(d), m, k);               // the half segment the beam came in on
      const t = tile[i];
      if (t === T_GEM) { gemGot[i] |= m; continue; }
      if (t === T_SOURCE) continue;

      let outs;
      if (t === T_MIRROR) outs = [[reflect(d, orient[i]), m]];
      else if (t === T_PRISM) {
        // The prism is an ORIENTED piece. Its flat base faces one way and its
        // apex points the opposite way, and light only works on it if it
        // arrives square on that flat face, which is `prismDir`.
        //
        // Entering the base at normal incidence, the beam does not bend at all.
        // It bends on the way OUT, at the two slanted faces, and that is where
        // the colours come apart: red deviates least and carries straight on
        // through the apex, green and blue deviate away to either side.
        //
        // Light that strikes a slanted face instead is scattered and lost. That
        // is the whole reason the prism is a piece rather than scenery: the
        // white beam has to be steered so it approaches from the right side.
        if (d !== prismDir) outs = [];
        else if (m === WHITE) outs = [[d, R_], [LEFT(d), G_], [RIGHT(d), B_]];
        else outs = [[d, m]];           // already dispersed, nothing left to split
      } else outs = [[d, m]];

      for (const [nd, nm] of outs) {
        mark(i, nd, nm, k + 1);
        const j = stepCell(i, nd);
        if (j >= 0) queue.push([j, nd, nm, k + 2]);
      }
    }
    // Rising edge, so a gem only re-blooms when it goes from wrong to right.
    const t0 = now || performance.now();
    for (let i = 0; i < n; i++) {
      if (tile[i] !== T_GEM) continue;
      const ok = gemGot[i] === gemNeed[i], wasOk = was[i] === gemNeed[i];
      if (ok && !wasOk) bloomT[i] = t0;
    }
  }
  function gemCount() {
    let lit = 0, total = 0;
    for (let i = 0; i < R * C; i++) if (tile[i] === T_GEM) { total++; if (gemGot[i] === gemNeed[i]) lit++; }
    return [lit, total];
  }
  function isSolved() { const [a, b] = gemCount(); return b > 0 && a === b; }

  // ---------- generation ----------
  const rnd = (n) => (Math.random() * n) | 0;
  const pick = (a) => a[rnd(a.length)];
  const canPass = (i, d) => !blocked[i] && !(axis[i] & axisOf(d));
  const canHold = (i) => !blocked[i] && axis[i] === 0;

  // Walk a beam out from `fromCell` heading `dir`, taking `turns` corners and
  // dropping a mirror at each one. Returns where it ended and which way it was
  // going, or null if it ran out of room. Every cell it uses is marked, so no
  // later path can drop a piece on top of a live beam or run along the same axis.
  function carve(fromCell, dir, turns, maxRun) {
    let cur = fromCell, d = dir;
    for (let leg = 0; leg <= turns; leg++) {
      const opts = [];
      let ci = cur;
      for (let L = 1; L <= maxRun; L++) {
        ci = stepCell(ci, d);
        if (ci < 0 || blocked[ci]) break;
        if (axis[ci] === 0) opts.push(L);          // nothing here, safe to land
        if (axis[ci] & axisOf(d)) break;           // another beam already runs this way
      }
      if (!opts.length) return null;
      const roomy = opts.filter((L) => L >= 2);
      const L = pick(roomy.length ? roomy : opts);

      let land = cur;
      for (let s = 1; s <= L; s++) {
        land = stepCell(land, d);
        if (s < L) axis[land] |= axisOf(d);
      }
      blocked[land] = true; axis[land] = 3;

      if (leg === turns) return { end: land, dir: d };

      const cands = [LEFT(d), RIGHT(d)].filter((nd) => {
        const j = stepCell(land, nd);
        return j >= 0 && !blocked[j] && !(axis[j] & axisOf(nd));
      });
      if (!cands.length) return null;
      const nd = pick(cands);
      tile[land] = T_MIRROR; orient[land] = mirrorFor(d, nd);
      cur = land; d = nd;
    }
    return null;
  }

  // Route a beam from `fromCell` heading `dir` so that it ARRIVES at `target`.
  // Breadth first over (cell, direction), where staying straight costs nothing
  // and a corner costs a mirror. Used to make two beams converge on one gem,
  // which is what a secondary colour needs.
  function route(fromCell, dir, target, maxTurns) {
    const first = stepCell(fromCell, dir);
    if (first < 0) return false;
    const prev = new Map(), q = [];
    const k0 = (first << 2) | dir;
    prev.set(k0, -1); q.push([first, dir, 0]);
    let head = 0, goal = -1;
    while (head < q.length) {
      const [i, d, turns] = q[head++];
      if (i === target) { goal = (i << 2) | d; break; }
      if (canPass(i, d)) {
        const j = stepCell(i, d);
        if (j >= 0) { const k = (j << 2) | d; if (!prev.has(k)) { prev.set(k, (i << 2) | d); q.push([j, d, turns]); } }
      }
      if (turns < maxTurns && canHold(i)) {
        for (const nd of [LEFT(d), RIGHT(d)]) {
          const j = stepCell(i, nd);
          if (j < 0) continue;
          const k = (j << 2) | nd;
          if (prev.has(k)) continue;
          prev.set(k, (i << 2) | d); q.push([j, nd, turns + 1]);
        }
      }
    }
    if (goal < 0) return false;

    const chain = [];
    for (let k = goal; k !== -1; k = prev.get(k)) chain.push(k);
    chain.reverse();

    // The search cannot see its own footprint, so check the finished path
    // against itself before committing any of it.
    const useAxis = new Map(), usePiece = new Set();
    for (let t = 0; t < chain.length - 1; t++) {
      const ci = chain[t] >> 2, di = chain[t] & 3, dn = chain[t + 1] & 3;
      if (usePiece.has(ci)) return false;
      if (dn === di) {
        const a = axisOf(di), had = useAxis.get(ci) || 0;
        if (had & a) return false;
        useAxis.set(ci, had | a);
      } else {
        if (useAxis.has(ci)) return false;
        usePiece.add(ci);
      }
    }
    if (useAxis.has(target) || usePiece.has(target)) return false;

    for (let t = 0; t < chain.length - 1; t++) {
      const ci = chain[t] >> 2, di = chain[t] & 3, dn = chain[t + 1] & 3;
      if (dn === di) axis[ci] |= axisOf(di);
      else { blocked[ci] = true; axis[ci] = 3; tile[ci] = T_MIRROR; orient[ci] = mirrorFor(di, dn); }
    }
    return true;
  }

  function levelPlan(lvl) {
    // Mixing is the twist, and from level 5 it becomes the normal board. Every
    // fourth level goes back to three separate primaries, which is a breather
    // and stops the whole back half being one shape of puzzle.
    // Every knob used to cap out by level 13, which meant level 15 and level 60
    // were the same board. These keep climbing to about level 20. Past that it
    // plateaus again and it will want a new piece (walls, filters) rather than
    // more of the same.
    return {
      mix: lvl >= 5 && (lvl % 4 !== 0),
      whiteTurns: Math.min(1 + Math.floor((lvl - 1) / 6), 4),
      armTurns: () => (lvl <= 2 ? 1
                     : lvl <= 8 ? pick([1, 1, 2])
                     : lvl <= 16 ? pick([1, 2, 2])
                     : pick([2, 2, 3])),
      decoys: Math.min(Math.floor(lvl / 3), 6),
    };
  }

  function tryBuild(lvl) {
    const n = R * C;
    tile = new Array(n).fill(T_EMPTY);
    orient = new Array(n).fill(SLASH);
    isDecoy = new Array(n).fill(false);
    gemNeed = new Array(n).fill(0);
    blocked = new Array(n).fill(false);
    axis = new Array(n).fill(0);
    prismCell = -1;

    // Source on an edge pointing inwards, off the corners so a turn has room.
    const side = rnd(4);
    let r, c;
    if (side === 0)      { c = 0;     r = 1 + rnd(Math.max(1, R - 2)); srcDir = E; }
    else if (side === 1) { c = C - 1; r = 1 + rnd(Math.max(1, R - 2)); srcDir = W; }
    else if (side === 2) { r = 0;     c = 1 + rnd(Math.max(1, C - 2)); srcDir = S; }
    else                 { r = R - 1; c = 1 + rnd(Math.max(1, C - 2)); srcDir = N; }
    srcCell = idx(r, c);
    tile[srcCell] = T_SOURCE; blocked[srcCell] = true; axis[srcCell] = 3;

    const plan = levelPlan(lvl);
    const maxRun = Math.max(3, Math.floor(Math.min(R, C) * 0.75));

    const w = carve(srcCell, srcDir, plan.whiteTurns, maxRun);
    if (!w) return false;
    prismCell = w.end;
    const dIn = w.dir;
    tile[prismCell] = T_PRISM;
    // The prism faces the beam that built it: its flat base meets the white
    // beam square on, and its apex points the way red carries on.
    prismDir = dIn;

    // Red straight on, green off the left, blue off the right.
    const arms = [[R_, dIn], [G_, LEFT(dIn)], [B_, RIGHT(dIn)]];

    if (!plan.mix) {
      for (const [colour, outDir] of arms) {
        const a = carve(prismCell, outDir, plan.armTurns(), maxRun);
        if (!a) return false;
        tile[a.end] = T_GEM; gemNeed[a.end] = colour;
      }
    } else {
      // Two arms are made to land on the SAME gem, so it needs their sum. The
      // third goes to a gem of its own, which keeps a primary on the board to
      // read the mix against.
      const order = [0, 1, 2];
      for (let i = order.length - 1; i > 0; i--) { const j = rnd(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
      const [pa, pb, pc] = order;
      const a = carve(prismCell, arms[pa][1], plan.armTurns(), maxRun);
      if (!a) return false;
      const meet = a.end;
      if (!route(prismCell, arms[pb][1], meet, 3)) return false;
      tile[meet] = T_GEM; gemNeed[meet] = arms[pa][0] | arms[pb][0];
      const cc = carve(prismCell, arms[pc][1], plan.armTurns(), maxRun);
      if (!cc) return false;
      tile[cc.end] = T_GEM; gemNeed[cc.end] = arms[pc][0];
    }

    // Decoys: mirrors on cells no solution beam ever touches, so they cannot
    // break the answer, but a wrong route may well run into one.
    const free = [];
    for (let i = 0; i < n; i++) if (canHold(i)) free.push(i);
    for (let i = free.length - 1; i > 0; i--) { const j = rnd(i + 1); [free[i], free[j]] = [free[j], free[i]]; }
    for (let k = 0; k < Math.min(plan.decoys, free.length); k++) {
      const i = free[k];
      tile[i] = T_MIRROR; orient[i] = rnd(2); isDecoy[i] = true;
      blocked[i] = true; axis[i] = 3;
    }

    // Everything above says it works. Prove it before serving it.
    solOrient = orient.slice();
    gemGot = new Array(n).fill(0);
    simulate(0);
    return isSolved();
  }

  function scramble() {
    const mirrors = [];
    for (let i = 0; i < R * C; i++) if (tile[i] === T_MIRROR && !isDecoy[i]) mirrors.push(i);
    if (!mirrors.length) { par = 0; return; }
    for (let attempt = 0; attempt < 40; attempt++) {
      const half = Math.floor(mirrors.length / 2);
      const k = Math.max(1, Math.min(mirrors.length, half + rnd(mirrors.length - half + 1)));
      const bag = mirrors.slice();
      for (let i = bag.length - 1; i > 0; i--) { const j = rnd(i + 1); [bag[i], bag[j]] = [bag[j], bag[i]]; }
      for (const i of mirrors) orient[i] = solOrient[i];
      for (let i = 0; i < k; i++) orient[bag[i]] ^= 1;
      simulate(0);
      if (!isSolved()) break;                 // a scramble that solves itself is no puzzle
    }
    par = mirrors.reduce((s, i) => s + (orient[i] !== solOrient[i] ? 1 : 0), 0);
  }

  // How much of the board the finished light actually occupies. A board where
  // every beam huddles in one corner is a worse puzzle AND a worse picture, and
  // the first attempt that merely works is often exactly that board.
  function coverage() {
    let cells = 0, r0 = R, r1 = -1, c0 = C, c1 = -1;
    for (let i = 0; i < R * C; i++) {
      if (!(seg[i * 4] || seg[i * 4 + 1] || seg[i * 4 + 2] || seg[i * 4 + 3])) continue;
      cells++;
      const r = rowOf(i), c = colOf(i);
      if (r < r0) r0 = r; if (r > r1) r1 = r;
      if (c < c0) c0 = c; if (c > c1) c1 = c;
    }
    if (r1 < 0) return 0;
    const spread = ((r1 - r0 + 1) / R) * ((c1 - c0 + 1) / C);
    return cells + spread * R * C * 0.6;
  }
  function snapshot() {
    return { tile: tile.slice(), orient: orient.slice(), solOrient: solOrient.slice(),
             gemNeed: gemNeed.slice(), isDecoy: isDecoy.slice(), srcCell, srcDir, prismCell, prismDir };
  }
  function restore(s) {
    tile = s.tile.slice(); orient = s.orient.slice(); solOrient = s.solOrient.slice();
    gemNeed = s.gemNeed.slice(); isDecoy = s.isDecoy.slice();
    srcCell = s.srcCell; srcDir = s.srcDir; prismCell = s.prismCell; prismDir = s.prismDir;
  }

  function genLevel(lvl, asMenu) {
    level = Math.max(1, lvl); saveLevel();
    const [gr, gc] = gridDims(level);
    R = gr; C = gc;
    // Build a batch and keep the best-composed one, rather than the first that
    // happens to work.
    let best = null, bestScore = -1;
    for (let a = 0; a < 70; a++) {
      if (!tryBuild(level)) continue;
      const sc = coverage();
      if (sc > bestScore) { bestScore = sc; best = snapshot(); }
    }
    if (!best) {                               // never leave the player a blank board
      const dims = gridDims(1); R = dims[0]; C = dims[1];
      for (let a = 0; a < 400 && !best; a++) if (tryBuild(1)) best = snapshot();
    }
    if (best) { restore(best); gemGot = new Array(R * C).fill(0); simulate(0); }
    scramble();
    const n = R * C;
    flipT = new Array(n).fill(-1e9); bloomT = new Array(n).fill(-1e9);
    gemGot = new Array(n).fill(0);
    startOrient = orient.slice(); history = [];
    moves = 0; phase = asMenu ? 'menu' : 'play'; animEnd = 0; wonT = -1e9;
    hoverCell = -1; pressCell = -1;
    simulate(0); seedSound(); layout(); draw(performance.now());
  }
  function restart() {
    orient = startOrient.slice(); moves = 0; phase = 'play'; history = [];
    flipT = flipT.map(() => -1e9); bloomT = bloomT.map(() => -1e9);
    gemGot = new Array(R * C).fill(0);
    simulate(0); seedSound(); draw(performance.now());
  }

  // ---------- sound ----------
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zamborin-prism.sound' }) : null;
  const snd = {
    on: () => !!(sfx && sfx.isOn()),
    ready() { if (sfx) sfx.ensureAudio(); },
    toggle() { if (!sfx) return; sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.tone(880, 0.05, 0.03, 'sine'); },
    flip() { if (sfx) { sfx.tone(560, 0.028, 0.020, 'triangle'); sfx.noise(0.05, 2600, 1.4, 0.012); } },
    gem(k) {
      if (!sfx) return;
      const st = Math.min(11, Math.max(0, k - 1));
      const f = 659.25 * Math.pow(2, st / 12);
      sfx.tone(f, 0.24, 0.040, 'sine'); sfx.tone(f * 2, 0.11, 0.012, 'sine');
    },
    win() { if (sfx) sfx.arpeggio(659.25, 0.10, 2); },
    undo() { if (sfx) sfx.tone(320, 0.05, 0.018, 'sine'); },
  };
  let lastLit = 0;
  function seedSound() { lastLit = gemCount()[0]; }
  function announce() {
    if (phase === 'menu') { seedSound(); return; }
    const lit = gemCount()[0];
    if (lit > lastLit) for (let k = lastLit + 1; k <= lit; k++) snd.gem(k);
    lastLit = lit;
  }

  // ---------- input ----------
  function flip(i, now) {
    if (tile[i] !== T_MIRROR || phase !== 'play') return;
    history.push(i); if (history.length > 500) history.shift();
    orient[i] ^= 1; flipT[i] = now; moves++;
    snd.flip();
    simulate(now); announce();
    animEnd = Math.max(now + FLIP_MS, now + BLOOM_MS) + 60;
    if (isSolved()) { phase = 'won'; wonT = now; snd.win(); animEnd = now + BLOOM_MS + 1400; }
  }
  function undo() {
    if (!history.length || phase !== 'play') return;
    const i = history.pop(), now = performance.now();
    orient[i] ^= 1; flipT[i] = now; moves++;
    snd.undo(); simulate(now); announce();
    animEnd = now + Math.max(FLIP_MS, BLOOM_MS) + 60;
  }

  function canvasXY(e) {
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX ?? e.changedTouches?.[0]?.clientX);
    const py = (e.clientY ?? e.changedTouches?.[0]?.clientY);
    // Each axis scaled by its OWN dimension. Using LW for the y scale is a real
    // bug that lands taps on the wrong row on a phone.
    return [(px - rect.left) * (LW / rect.width), (py - rect.top) * (LH / rect.height)];
  }
  function cellAt(x, y) {
    const c = Math.floor((x - ox) / cell), r = Math.floor((y - oy) / cell);
    if (r < 0 || r >= R || c < 0 || c >= C) return -1;
    return idx(r, c);
  }
  function onTap(e) {
    e.preventDefault();
    snd.ready();
    const [x, y] = canvasXY(e);
    pressCell = -1;
    for (const b of uiButtons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.act(); return; }
    if (phase === 'menu') { phase = 'play'; return; }
    if (phase === 'won') { genLevel(level + 1); return; }
    const i = cellAt(x, y);
    if (i >= 0) flip(i, performance.now());
  }
  canvas.addEventListener('pointerup', onTap);
  canvas.addEventListener('pointerdown', (e) => {
    const [x, y] = canvasXY(e);
    const i = cellAt(x, y);
    pressCell = (phase === 'play' && i >= 0 && tile[i] === T_MIRROR) ? i : -1;
  });
  canvas.addEventListener('pointercancel', () => { pressCell = -1; });
  canvas.addEventListener('pointerleave', () => { hoverCell = -1; pressCell = -1; });
  if (MODE === 'desktop') {
    canvas.addEventListener('pointermove', (e) => {
      const [x, y] = canvasXY(e);
      const i = cellAt(x, y);
      hoverCell = (phase === 'play' && i >= 0 && tile[i] === T_MIRROR) ? i : -1;
      canvas.style.cursor = hoverCell >= 0 ? 'pointer' : 'default';
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'z' || e.key === 'Z') undo();
    if (e.key === 'r' || e.key === 'R') restart();
    if (e.key === 'n' || e.key === 'N') genLevel(level + 1);
  });

  // ============================================================
   /* RENDER
      Light is drawn additively. Every glow layer is composited with
      'lighter', so where two beams cross the canvas genuinely brightens
      the way light does, and a red and a green beam sharing a segment
      come out yellow without anyone being told to make it so. */
  // ============================================================
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
  // Defensive on purpose. A browser can report a 0-wide viewport for the first
  // frame, which drove the menu card to a negative width and threw
  // IndexSizeError out of arcTo before anything was drawn at all.
  function roundRect(x, y, w, h, r) {
    if (!(w > 0) || !(h > 0)) { ctx.beginPath(); return; }
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function draw(now) {
    if (LW < 40 || LH < 40) return;       // pre-layout frame; onResize will call back
    if (!bgGrad) layout();
    ctx.clearRect(0, 0, LW, LH);
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, LW, LH);
    uiButtons = [];

    drawPlots();
    drawBeams(now);
    for (let i = 0; i < R * C; i++) drawPiece(i, now);
    drawHUD();
    if (phase === 'play') drawControls();
    if (phase === 'won') winOverlay(now);
    if (phase === 'menu') menuOverlay();
  }

  // Faint etched slots. A hairline of light along the top edge of each is what
  // stops the board reading as a flat sheet of boxes.
  function drawPlots() {
    const pad = Math.max(2, cell * 0.045), rr = cell * 0.16;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const x = ox + c * cell + pad, y = oy + r * cell + pad, s = cell - pad * 2;
      ctx.fillStyle = 'rgba(255,255,255,0.028)'; roundRect(x, y, s, s, rr); ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.beginPath();
      ctx.moveTo(x + rr, y + 0.5); ctx.lineTo(x + s - rr, y + 0.5);
      ctx.stroke();
    }
  }

  // Merge the two half segments on each axis of a cell into ONE stroke, and cap
  // them flat. Stroking each half separately with a round cap put a bead of
  // light at every cell centre and every cell boundary, and additive blending
  // then doubled each bead: the beam read as a dotted line instead of a beam.
  // Flat caps meet exactly at the cell edge, so a straight run comes out as one
  // continuous bar, and every place a run does stop short is under a piece.
  function beamRuns() {
    const runs = [], h = cell * 0.5;
    for (let i = 0; i < R * C; i++) {
      const cx = ccx(colOf(i)), cy = ccy(rowOf(i));
      const mW = seg[i * 4 + W], mE = seg[i * 4 + E], mN = seg[i * 4 + N], mS = seg[i * 4 + S];
      if (mW && mW === mE) runs.push([cx - h, cy, cx + h, cy, mW, Math.min(segD[i * 4 + W], segD[i * 4 + E])]);
      else {
        if (mW) runs.push([cx - h, cy, cx, cy, mW, segD[i * 4 + W]]);
        if (mE) runs.push([cx, cy, cx + h, cy, mE, segD[i * 4 + E]]);
      }
      if (mN && mN === mS) runs.push([cx, cy - h, cx, cy + h, mN, Math.min(segD[i * 4 + N], segD[i * 4 + S])]);
      else {
        if (mN) runs.push([cx, cy - h, cx, cy, mN, segD[i * 4 + N]]);
        if (mS) runs.push([cx, cy, cx, cy + h, mS, segD[i * 4 + S]]);
      }
    }
    return runs;
  }

  // The halo across a beam is a GRADIENT, not a stack of strokes. Stacked
  // strokes each have a hard edge, so however many you pile up the beam still
  // ends in a visible step. One gradient running across the beam, transparent
  // at both rims and solid down the middle, feathers properly.
  // Built once per colour in local coordinates and reused: the canvas transforms
  // a gradient with the context, so one horizontal gradient serves every run by
  // translating, and serves the vertical ones by rotating a quarter turn.
  let featherCache = {}, featherW = 0, beamCore = 2;
  function feather(m) {
    if (featherCache[m]) return featherCache[m];
    const W = featherW;
    const c = RGB[m] || [255, 255, 255];
    const g = ctx.createLinearGradient(0, -W, 0, W);
    const stops = [
      [0, 0], [0.18, 0.05], [0.30, 0.16], [0.39, 0.38], [0.45, 0.70],
      [0.50, 1], [0.55, 0.70], [0.61, 0.38], [0.70, 0.16], [0.82, 0.05], [1, 0],
    ];
    for (const [p, a] of stops) g.addColorStop(p, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')');
    featherCache[m] = g;
    return g;
  }

  function drawBeams(now) {
    if (!maxD) return;
    const runs = beamRuns();
    if (!runs.length) return;
    // A soft swell of brightness travels outward from the source, so the board
    // shows the DIRECTION light moves rather than only where it lies.
    const PL = 3.2, span = maxD + PL * 2;
    const head = REDUCED ? -1e9 : ((now / 1000) * 11) % span - PL;
    const W = featherW;

    ctx.globalCompositeOperation = 'lighter';

    // 1. the feathered halo
    for (const [x0, y0, x1, y1, m, d] of runs) {
      const horiz = y0 === y1;
      const len = horiz ? (x1 - x0) : (y1 - y0);
      const boost = Math.max(0, 1 - Math.abs(d - head) / PL);
      const hot = m === WHITE ? 1.25 : 1;
      ctx.save();
      ctx.translate((x0 + x1) / 2, (y0 + y1) / 2);
      if (!horiz) ctx.rotate(Math.PI / 2);
      ctx.globalAlpha = Math.min(1, 0.78 * hot * (1 + boost * 0.5));
      ctx.fillStyle = feather(m);
      ctx.fillRect(-Math.abs(len) / 2, -W, Math.abs(len), W * 2);
      ctx.restore();
    }

    // 2. The core, painted SOURCE-OVER in the beam's full-strength colour.
    // Additively, a pale tint laid on top of an already-bright glow just climbs
    // to white: red core (255,142,151) over a lit red halo came out near white,
    // which is why the three primaries all looked the same. Painting the core
    // normally sets the hue exactly, and the additive halo around it does the
    // glowing. Telling the colours apart IS the game, so the hue wins here.
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'butt';
    ctx.lineWidth = beamCore;
    ctx.globalAlpha = 1;
    for (const [x0, y0, x1, y1, m, d] of runs) {
      ctx.strokeStyle = COL[m];
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.lineCap = 'round';
  }

  function drawPiece(i, now) {
    const t = tile[i];
    if (t === T_EMPTY) return;
    const cx = ccx(colOf(i)), cy = ccy(rowOf(i));
    if (t === T_SOURCE) drawSource(cx, cy, now);
    else if (t === T_MIRROR) drawMirror(i, cx, cy, now);
    else if (t === T_PRISM) drawPrism(cx, cy);
    else if (t === T_GEM) drawGem(i, cx, cy, now);
  }

  // A directional lamp, not a glowing dot: a body with a flared reflector head
  // and a bright aperture at the mouth, all pointing the way it fires. Drawn in
  // its own frame with +x as the emitting direction.
  const AIM = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];   // N, E, S, W
  function drawSource(cx, cy, now) {
    const u = cell;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(AIM[srcDir]);

    // the spill of light thrown forward out of the mouth
    ctx.globalCompositeOperation = 'lighter';
    const spill = ctx.createLinearGradient(u * 0.19, 0, u * 0.66, 0);
    spill.addColorStop(0, 'rgba(226,240,255,0.30)');
    spill.addColorStop(0.45, 'rgba(226,240,255,0.09)');
    spill.addColorStop(1, 'rgba(226,240,255,0)');
    ctx.fillStyle = spill;
    ctx.beginPath();
    ctx.moveTo(u * 0.19, -u * 0.215); ctx.lineTo(u * 0.66, -u * 0.34);
    ctx.lineTo(u * 0.66, u * 0.34); ctx.lineTo(u * 0.19, u * 0.215);
    ctx.closePath(); ctx.fill();
    glow(u * 0.17, 0, 0, u * 0.42, WHITE, 0.34 + (REDUCED ? 0 : 0.06 * Math.sin(now / 620)));
    ctx.globalCompositeOperation = 'source-over';

    // housing: rounded back, straight body, reflector flaring to the mouth
    const hb = u * 0.145, hf = u * 0.215, back = -u * 0.09;
    ctx.beginPath();
    ctx.moveTo(back, -hb);
    ctx.lineTo(u * 0.035, -hb);
    ctx.lineTo(u * 0.175, -hf);
    ctx.lineTo(u * 0.175, hf);
    ctx.lineTo(u * 0.035, hb);
    ctx.lineTo(back, hb);
    ctx.arc(back, 0, hb, Math.PI / 2, -Math.PI / 2, false);
    ctx.closePath();
    const body = ctx.createLinearGradient(0, -hf, 0, hf);
    body.addColorStop(0, '#7286A6'); body.addColorStop(0.35, '#3D4E6B');
    body.addColorStop(0.75, '#223047'); body.addColorStop(1, '#151E2E');
    ctx.fillStyle = body; ctx.fill();
    // No outline. The housing is read from its own gradient, the same way the
    // mirror and the gems now are.
    // two cooling ribs, which is what makes it read as a lamp and not a funnel
    ctx.lineWidth = Math.max(1, u * 0.013); ctx.strokeStyle = 'rgba(150,170,200,0.30)';
    for (const x of [-u * 0.035, u * 0.005]) {
      ctx.beginPath(); ctx.moveTo(x, -hb * 0.82); ctx.lineTo(x, hb * 0.82); ctx.stroke();
    }

    // the aperture at the mouth
    ctx.fillStyle = '#FFFFFF';
    roundRect(u * 0.148, -hf * 0.92, u * 0.052, hf * 1.84, u * 0.026); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    roundRect(u * 0.132, -hf * 0.72, u * 0.084, hf * 1.44, u * 0.03); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  function drawMirror(i, cx, cy, now) {
    const target = orient[i] === SLASH ? -Math.PI / 4 : Math.PI / 4;
    const sign = orient[i] === SLASH ? 1 : -1;
    const p = (now - flipT[i]) / FLIP_MS;
    const spinning = p >= 0 && p < 1;
    const a = spinning ? target + sign * (Math.PI / 2) * (1 - ease(p)) : target;

    const lift = (hoverCell === i ? 1 : 0) + (pressCell === i ? -0.5 : 0);
    const len = cell * (0.74 + lift * 0.03), th = Math.max(4, cell * 0.155);
    const surf = 0;                       // the reflective line, down the middle

    // Which FACE the light is on. A mirror only carries light on one side at a
    // time, so the glow has to know which. Rotating each lit port into the
    // bar's own frame and taking the sign of its y gives it: negative is the
    // glass face, positive the silvered back.
    const cA = Math.cos(target), sA = Math.sin(target);
    let glassMask = 0, backMask = 0;
    for (let d = 0; d < 4; d++) {
      const m = seg[i * 4 + d];
      if (!m) continue;
      if (-DC[d] * sA + DR[d] * cA < 0) glassMask |= m; else backMask |= m;
    }
    // A dome of light standing ON the surface, not a disc centred on the cell.
    // Clipped to the half-plane the light is actually on and squashed wide, the
    // way a bloom off a flat surface actually looks.
    const dome = (mask, side) => {
      if (!mask) return;
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(target);
      ctx.beginPath();
      const big = cell * 2.5;
      ctx.rect(-big, side < 0 ? -big + surf : surf, big * 2, big);
      ctx.clip();
      ctx.translate(0, surf); ctx.scale(1, 0.62);
      ctx.globalCompositeOperation = 'lighter';
      // Tight. At nearly a full cell across, a white dome spread into a grey
      // haze that made the board look smudged rather than lit.
      const R = cell * 0.60;
      const c = RGB[mask] || [255, 255, 255];
      const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g2.addColorStop(0, 'rgba(' + c + ',0.42)');
      g2.addColorStop(0.22, 'rgba(' + c + ',0.26)');
      g2.addColorStop(0.50, 'rgba(' + c + ',0.11)');
      g2.addColorStop(0.75, 'rgba(' + c + ',0.035)');
      g2.addColorStop(1, 'rgba(' + c + ',0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
      ctx.restore();
    };
    dome(glassMask, -1); dome(backMask, 1);

    // The silvered back of a mirror cannot reflect anything, so the piece turns
    // its GLASS face to whichever side the light is actually on. A mirror
    // carries N-W light on one face and E-S light on the other, never both at
    // once, so there is always a right way round.
    const flipY = backMask && !glassMask ? -1 : 1;

    // NO OUTLINES anywhere on this piece. Every edge is where one gradient stops
    // and the board begins. A stroked border round a small bar is what was
    // making it read as a cartoon rather than an object.
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.scale(1, flipY);

    // the pivot first, so the bar sits over its top half
    const pr = th * 0.36;
    const pv = ctx.createLinearGradient(0, th / 2 - pr, 0, th / 2 + pr);
    pv.addColorStop(0, '#8E99AB'); pv.addColorStop(0.5, '#69738A'); pv.addColorStop(1, '#4A5468');
    ctx.fillStyle = pv;
    ctx.beginPath(); ctx.arc(0, th / 2 + pr * 0.35, pr, 0, 7); ctx.fill();

    // a soft seat under the bar, so it lifts off the board without an outline
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = 'rgba(2,5,11,0.9)';
    roundRect(-len / 2, -th / 2 + th * 0.30, len, th, th / 2); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.save();
    roundRect(-len / 2, -th / 2, len, th, th / 2); ctx.clip();
    // Front: glass. Clear enough to see the board through, but not so clear the
    // piece stops reading. It is the only thing on the board the player can
    // touch, so it has to hold its own against the light around it.
    const gl = ctx.createLinearGradient(0, -th / 2, 0, surf);
    gl.addColorStop(0, 'rgba(242,249,255,0.80)');
    gl.addColorStop(0.16, 'rgba(196,216,240,0.40)');
    gl.addColorStop(0.62, 'rgba(172,196,224,0.30)');
    gl.addColorStop(1, 'rgba(226,240,255,0.55)');
    ctx.fillStyle = gl; ctx.fillRect(-len / 2, -th / 2, len, surf + th / 2);
    // Back: the silvered backing. Brightest just under the surface, rolling
    // through mid grey to a lit lower lip, all gradient, no edges.
    const mt = ctx.createLinearGradient(0, surf, 0, th / 2);
    mt.addColorStop(0, '#FBFDFF'); mt.addColorStop(0.16, '#D8E1ED');
    mt.addColorStop(0.52, '#9DA9BB'); mt.addColorStop(0.84, '#C6D0DC');
    mt.addColorStop(1, '#94A0B1');
    ctx.fillStyle = mt; ctx.fillRect(-len / 2, surf, len, th / 2 - surf);
    ctx.restore();

    // the mirrored surface: one crisp bright line, the brightest thing here
    ctx.lineCap = 'butt';
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.30; ctx.strokeStyle = '#CFE8FF';
    ctx.lineWidth = Math.max(2, th * 0.34);
    ctx.beginPath(); ctx.moveTo(-len / 2 + th * 0.24, surf); ctx.lineTo(len / 2 - th * 0.24, surf); ctx.stroke();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(1.2, th * 0.10);
    ctx.beginPath(); ctx.moveTo(-len / 2 + th * 0.20, surf); ctx.lineTo(len / 2 - th * 0.20, surf); ctx.stroke();
    ctx.lineCap = 'round';
    ctx.restore();

    if (hoverCell === i && !spinning) {
      ctx.globalCompositeOperation = 'lighter';
      glow(cx, cy, 0, cell * 0.48, WHITE, 0.13);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (spinning) {                       // a brief flash of the turn
      ctx.globalCompositeOperation = 'lighter';
      glow(cx, cy, 0, cell * 0.46, WHITE, 0.34 * (1 - p));
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // Glass: a soft body, one bright rim, and the spectrum showing through the
  // inside. It is drawn upright as a symbol; the split it performs is measured
  // from the direction of the beam, not from the triangle.
  // Drawn in its own frame: apex up, flat base at the bottom, then rotated so
  // the apex points along prismDir. The base therefore always squarely faces
  // the beam the prism is waiting for, which is the whole point of it.
  function drawPrism(cx, cy) {
    const s = cell * 0.94, h = s * 0.866;   // the title piece; give it the cell
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(prismDir * Math.PI / 2);    // N=0, E=1, S=2, W=3
    const ax = 0, ay = -h * 0.60;
    const bx = s / 2, by = h * 0.40;
    const dx = -s / 2, dy = h * 0.40;
    const tri = () => { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(dx, dy); ctx.closePath(); };
    cx = 0; cy = 0;

    // No white halo behind it any more: against a near-black body that read as
    // a bright ring around the triangle and fought the edge glow. The edge does
    // the emitting now.

    // Dark Side of the Moon: a near-black body, and an edge of pale cyan light
    // that feathers INWARD off the three sides. Slightly translucent rather than
    // pure black, so a beam crossing the cell still glimmers inside the glass
    // the way it does on the sleeve.
    // GLASS, not a black cut-out. The body is TRANSLUCENT: fill alpha 0.24 of a
    // pale blue over the board lands on rgb(69,84,112), which is the interior
    // tone in the reference, and it lets the plot underneath and any beam
    // crossing the cell read faintly THROUGH the piece, which is the whole point
    // of it being glass.
    tri();
    const body = ctx.createLinearGradient(0, ay, 0, by);
    body.addColorStop(0, 'rgba(210,228,250,0.27)');
    body.addColorStop(0.42, 'rgba(172,192,224,0.17)');
    body.addColorStop(0.80, 'rgba(190,210,240,0.21)');
    body.addColorStop(1, 'rgba(222,238,255,0.30)');
    ctx.fillStyle = body; ctx.fill();

    // a little volume: the middle of a thick piece of glass reads darker than
    // its edges, which is what stops it looking like flat coloured paper
    ctx.save(); tri(); ctx.clip();
    const depth = ctx.createRadialGradient(0, h * 0.04, s * 0.04, 0, h * 0.04, s * 0.50);
    depth.addColorStop(0, 'rgba(6,14,28,0.38)');
    depth.addColorStop(0.55, 'rgba(6,14,28,0.16)');
    depth.addColorStop(1, 'rgba(6,14,28,0)');
    ctx.fillStyle = depth;
    ctx.beginPath(); ctx.arc(0, h * 0.04, s * 0.50, 0, 7); ctx.fill();
    ctx.restore();

    // the spectrum living inside the glass. It is the title piece of the game
    // and the one object that makes colour, so it carries a whisper of it.
    ctx.save(); tri(); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    const fan = ctx.createLinearGradient(-s * 0.20, h * 0.34, s * 0.16, -h * 0.30);
    fan.addColorStop(0.00, 'rgba(255,71,87,0)');
    fan.addColorStop(0.16, 'rgba(255,71,87,0.17)');
    fan.addColorStop(0.34, 'rgba(255,217,61,0.11)');
    fan.addColorStop(0.52, 'rgba(57,231,123,0.13)');
    fan.addColorStop(0.72, 'rgba(78,232,224,0.12)');
    fan.addColorStop(0.88, 'rgba(76,141,255,0.16)');
    fan.addColorStop(1.00, 'rgba(76,141,255,0)');
    ctx.fillStyle = fan;
    ctx.beginPath();
    ctx.moveTo(-s * 0.30, h * 0.40); ctx.lineTo(s * 0.10, -h * 0.36);
    ctx.lineTo(s * 0.30, -h * 0.20); ctx.lineTo(-s * 0.06, h * 0.40);
    ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    ctx.save(); tri(); ctx.clip();
    ctx.lineJoin = 'round';
    // Each stroke is centred on an edge and half of it is clipped away, so the
    // widest lands deepest inside and the tightest sits right on the edge.
    // They are composited ADDITIVELY: with normal painting each narrower stroke
    // simply covered the wider one underneath, so only the last survived and the
    // result was a thick flat outline instead of a glow ramping inward.
    ctx.globalCompositeOperation = 'lighter';
    // The BEVEL: a polished glass edge catching the light, feathering inward.
    //
    // THE CONSTRAINT THAT STILL MATTERS: an equilateral triangle of side s has
    // an inradius of s/(2*sqrt(3)) = 0.289s. Each stroke here is centred on an
    // edge and clipped, so it reaches `wf * s` inward. Anything past 0.289 means
    // all three bevels meet in the middle and flood the body. Nothing goes past
    // 0.145, half the inradius.
    //
    // Many closely spaced steps, not a few: one narrow bright band on its own
    // reads as a drawn outline rather than an edge catching light.
    const rim = [
      [0.145, 0.045, '#6E86A8'], [0.118, 0.052, '#7A92B4'], [0.095, 0.062, '#879FC0'],
      [0.076, 0.074, '#95ADCC'], [0.060, 0.090, '#A4BAD8'], [0.047, 0.110, '#B3C8E2'],
      [0.036, 0.135, '#C2D5EC'], [0.027, 0.170, '#D0E0F3'], [0.020, 0.210, '#DCEAF8'],
      [0.014, 0.265, '#E6F1FB'], [0.0095, 0.330, '#EEF6FD'], [0.006, 0.410, '#F5FAFE'],
      [0.0035, 0.520, '#FFFFFF'],
    ];
    for (const [wf, a, col] of rim) {
      ctx.lineWidth = Math.max(0.6, s * wf) * 2;   // doubled: the clip keeps half
      ctx.globalAlpha = a; ctx.strokeStyle = col;
      tri(); ctx.stroke();
    }
    // The ENTRY FACE reads by glowing a little harder than the other two. Same
    // width discipline: nothing here crosses the centre either.
    ctx.lineCap = 'butt';
    for (const [wf, a] of [[0.090, 0.050], [0.058, 0.062], [0.034, 0.080], [0.018, 0.110], [0.008, 0.170]]) {
      ctx.lineWidth = Math.max(0.6, s * wf) * 2;
      ctx.globalAlpha = a; ctx.strokeStyle = '#EAF4FF';
      ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(bx, by); ctx.stroke();
    }
    ctx.lineCap = 'round';
    // the three corners catch a little more, the way a cut edge does
    for (const [vx, vy] of [[ax, ay], [bx, by], [dx, dy]]) {
      glow(vx, vy, 0, s * 0.17, WHITE, 0.30);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // Nothing at all outside the shape. No contour, and no outward bloom either:
    // a glow sitting outside the silhouette is still a ring round the triangle,
    // and on the sleeve there is none. The edge is simply where the inward glow
    // reaches the boundary and stops.
    ctx.restore();
  }

  // The gem's RIM is split into one arc per primary it needs, drawn in that
  // primary's own colour. A yellow gem is therefore visibly half red and half
  // green: it states the recipe, teaches the mixing, and stays readable without
  // relying on colour vision alone.
  function drawGem(i, cx, cy, now) {
    const need = gemNeed[i], ok = gemGot[i] === need;
    const got = gemGot[i];
    const rr = cell * 0.30;
    const p = ok ? Math.min(1, (now - bloomT[i]) / BLOOM_MS) : 0;
    const e = ease(Math.max(0.001, p));
    const pulse = REDUCED ? 1 : (1 + 0.05 * Math.sin(now / 700 + i));

    if (ok) {
      // A lit gem BLAZES. The recipe ring is gone by this point, so nothing is
      // competing with it, and the bloom is layered wide-and-soft under
      // tight-and-hot so it feathers all the way out instead of ending on an
      // edge.
      ctx.globalCompositeOperation = 'lighter';
      glow(cx, cy, 0, rr * (3.4 + 1.1 * e), need, 0.30 * e * pulse);
      glow(cx, cy, 0, rr * (2.1 + 0.9 * e), need, 0.34 * e * pulse);
      glow(cx, cy, 0, rr * (1.15 + 0.5 * e), WHITE, 0.30 * e * pulse);
      if (p < 1) {                        // one ring opening outwards, then gone
        ctx.globalAlpha = 0.55 * (1 - p); ctx.strokeStyle = COL_HI[need] || '#fff';
        ctx.lineWidth = Math.max(2, cell * 0.05);
        ctx.beginPath(); ctx.arc(cx, cy, rr * (1 + 1.9 * e), 0, 7); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    // An irregular cut stone. Every facet is a triangle from the centre out to
    // one edge, shaded by how squarely it faces a fixed light in the upper left,
    // which is the thing that makes a cut stone read as cut rather than as a
    // flat tile with lines on it.
    // A cut stone: a flat table in the middle with a crown of facets round it,
    // each shaded by how squarely it faces a fixed light. Nothing is stroked.
    // A real gem shows its cut through VALUE, and the drawn cut-lines and girdle
    // that used to be here are exactly what made it look like a cartoon.
    //
    // There is no coloured ring any more either. An unlit gem is simply a dark
    // stone OF ITS OWN COLOUR, which says what it wants without a diagram round
    // it, and when its light arrives the same stone blazes.
    const pts = gemShape(i);
    const k = rr * 1.00 * (ok ? (0.94 + 0.10 * easeOutBack(Math.min(1, p))) : 1);
    const Vo = pts.map(([x, y]) => [cx + x * k, cy + y * k]);
    const Vi = pts.map(([x, y]) => [cx + x * k * 0.48, cy + y * k * 0.44]);
    const poly = (V) => { ctx.beginPath(); V.forEach(([x, y], n) => n ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); };
    const LIGHT = -2.25;                   // upper left

    poly(Vo); ctx.fillStyle = shade(need, ok ? 0.45 : 0.26); ctx.fill();

    for (let n = 0; n < Vo.length; n++) {
      const m2 = (n + 1) % Vo.length;
      const ang = Math.atan2((pts[n][1] + pts[m2][1]) / 2, (pts[n][0] + pts[m2][0]) / 2);
      const d = Math.cos(ang - LIGHT);
      const f = ok ? (0.42 + 0.98 * Math.max(0, d) + 0.14 * (1 - Math.abs(d)))
                   : (0.20 + 0.42 * Math.max(0, d) + 0.08 * (1 - Math.abs(d)));
      ctx.beginPath();
      ctx.moveTo(Vi[n][0], Vi[n][1]); ctx.lineTo(Vo[n][0], Vo[n][1]);
      ctx.lineTo(Vo[m2][0], Vo[m2][1]); ctx.lineTo(Vi[m2][0], Vi[m2][1]);
      ctx.closePath();
      ctx.fillStyle = shade(need, f); ctx.fill();
    }
    // The table is the bright part of an unlit stone: it is the flat top facet
    // and it catches whatever ambient light there is. It is also what carries
    // the gem's contrast against the board. Red and blue go dark fastest, and
    // at a dimmer table they measured 2.66:1 and 2.77:1 against a 3:1 floor.
    poly(Vi); ctx.fillStyle = shade(need, ok ? 1.30 : 0.84); ctx.fill();

    // what it is actually receiving, when that is not what it wants
    if (!ok && got) {
      ctx.globalCompositeOperation = 'lighter';
      poly(Vo); ctx.globalAlpha = 0.20; ctx.fillStyle = COL[got]; ctx.fill();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // the chip of light off the crown, which is what sells it as cut glass
    ctx.globalCompositeOperation = 'lighter';
    glow(cx + Math.cos(LIGHT) * k * 0.46, cy + Math.sin(LIGHT) * k * 0.46, 0,
         k * (ok ? 0.52 : 0.36), WHITE, ok ? 0.60 : 0.20);
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- HUD ----------
  function drawHUD() {
    // 16px flat, not scaled down on narrow screens. The shared shrink factor
    // used elsewhere bottoms out at 0.66, which put this read-out at 11px and
    // the hint at 10px on a phone. The whole run measures under 280px at 16, so
    // there was nothing to gain by shrinking it.
    const PX = SIDE_PAD;
    const [lit, total] = gemCount();
    const y = Math.round(topBand() / 2);
    const turns = moves + (moves === 1 ? ' turn' : ' turns');

    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = '600 16px Inter, sans-serif';

    // Shorten the wording rather than the type. On a 320px phone the full
    // read-out plus par measures 313px against 284px of room, and being right
    // aligned it would have run off the LEFT edge. Take the first form that
    // fits; the type stays at 16px in every one of them.
    const parW = par > 0 ? ctx.measureText('par ' + par).width + 16 : 0;
    const avail = LW - PX * 2 - parW;
    const heads = [
      'Level ' + level + '   ·   ' + lit + '/' + total + ' lit   ·   ' + turns,
      'Level ' + level + ' · ' + lit + '/' + total + ' lit · ' + turns,
      'L' + level + ' · ' + lit + '/' + total + ' · ' + turns,
      'L' + level + ' · ' + lit + '/' + total + ' · ' + moves,
    ];
    const head = heads.find((h) => ctx.measureText(h).width <= avail) || heads[heads.length - 1];

    let x = LW - PX;
    if (par > 0) {
      ctx.fillStyle = moves <= par ? 'rgba(168,235,173,0.95)' : 'rgba(255,255,255,0.68)';
      const t = 'par ' + par;
      ctx.fillText(t, x, y);
      x -= ctx.measureText(t).width + 16;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillText(head, x, y);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    if (phase === 'play' && moves === 0) {
      ctx.textAlign = 'center';
      ctx.font = '500 16px Inter, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      const msg = level >= 5 ? 'Two beams arriving together add up.' : 'Tap a mirror to flip it.';
      // Sits just under the board. If a screen is short enough that it would
      // reach the control row or the bottom edge, it is dropped rather than
      // drawn on top of something.
      const hy = oy + R * cell + 12;
      const limit = (MODE === 'mobile' ? LH - 94 - 6 : LH - 8) - 15;
      if (hy <= limit) ctx.fillText(msg, LW / 2, hy);
      ctx.textAlign = 'left';
    }
  }

  function speakerIcon(cx, cy, on) {
    const s = 8;
    ctx.strokeStyle = on ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.40)';
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

  // Sizes come from shared/ui.js. A button is chrome, not content: it is the
  // same physical size here as in every other game on the site.
  function drawControls() {
    const gap = UI.PILL.gap, wS = UI.PILL.iconW;
    const wU = UI.pillWidth(ctx, 'Undo'), wR = UI.pillWidth(ctx, 'Restart'), wH = UI.pillWidth(ctx, 'Rules');
    const total = wS + wU + wR + wH + gap * 3;
    // On a phone the controls stay at the BOTTOM. The top of a tall screen is
    // the one place a control should not be if a thumb has to reach it.
    const cy = MODE === 'mobile' ? LH - 74 : Math.round(topBand() / 2);
    let x = MODE === 'mobile' ? Math.round(LW / 2 - total / 2) : SIDE_PAD;

    const b = UI.drawPill(ctx, '', x + wS / 2, cy, { w: wS });
    speakerIcon(x + wS / 2, cy, snd.on());
    uiButtons.push({ ...b, act: () => { snd.ready(); snd.toggle(); } });
    x += wS + gap;
    uiButtons.push({ ...UI.drawPill(ctx, 'Undo', x + wU / 2, cy, { w: wU, dim: !history.length }), act: undo }); x += wU + gap;
    uiButtons.push({ ...UI.drawPill(ctx, 'Restart', x + wR / 2, cy, { w: wR }), act: restart }); x += wR + gap;
    uiButtons.push({ ...UI.drawPill(ctx, 'Rules', x + wH / 2, cy, { w: wH }), act: () => { phase = 'menu'; } });
  }

  // `measure` runs the identical wrap without drawing, so the rules card can be
  // laid out to its own content. A fixed card height is fine at 486 wide and
  // overflows the moment a narrow phone wraps the same sentence one line longer.
  function wrapText(text, x, y, maxW, lh, align, measure) {
    const words = text.split(' '); let line = '';
    if (!measure) { ctx.textAlign = align || 'center'; ctx.textBaseline = 'top'; }
    for (const w of words) {
      const tt = line ? line + ' ' + w : w;
      if (ctx.measureText(tt).width > maxW && line) { if (!measure) ctx.fillText(line, x, y); y += lh; line = w; }
      else line = tt;
    }
    if (line) { if (!measure) ctx.fillText(line, x, y); y += lh; }
    return y;
  }

  function winOverlay(now) {
    const t = Math.max(0, Math.min(1, (now - (wonT + BLOOM_MS + 260)) / 420));
    if (t <= 0) return;
    ctx.globalAlpha = t;
    ctx.fillStyle = 'rgba(10,16,28,0.86)'; ctx.fillRect(0, 0, LW, LH);

    const cx = LW / 2, cy = LH / 2;
    // a spectrum rule under the title, which is the whole game in one mark
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 ' + (MODE === 'mobile' ? 38 : 50) + 'px Inter, sans-serif';
    ctx.fillText('FULL SPECTRUM', cx, cy - 34);
    const rw = Math.min(LW - 80, 320);
    const g = ctx.createLinearGradient(cx - rw / 2, 0, cx + rw / 2, 0);
    g.addColorStop(0, '#FF4757'); g.addColorStop(0.5, '#39E77B'); g.addColorStop(1, '#4C8DFF');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g; roundRect(cx - rw / 2, cy - 18, rw, 4, 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = 'rgba(255,255,255,0.86)'; ctx.font = '600 20px Inter, sans-serif';
    ctx.fillText('every gem lit in ' + moves + (moves === 1 ? ' turn' : ' turns') + (par ? ', par ' + par : ''), cx, cy + 22);
    ctx.textBaseline = 'top';
    uiButtons.push({ ...UI.drawCTA(ctx, 'NEXT LEVEL', cx, cy + 76, ACCENT), act: () => genLevel(level + 1) });
    ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  }

  const MENU_SUB = 'Route the light so every gem gets its colour.';
  const MENU_RULES = [
    'Tap a mirror to flip it. It turns any beam that hits it by 90 degrees.',
    'The prism only works on light that arrives square on its flat face. Light striking a slanted side is scattered and lost.',
    'Through it, red carries straight on past the apex, green bends away to the left and blue to the right.',
    'Every gem is cut from the colour it wants, and sits dark until it gets it. Two beams arriving together add up: red and green make a yellow gem light.',
  ];

  function menuOverlay() {
    ctx.fillStyle = 'rgba(9,15,26,0.92)'; ctx.fillRect(0, 0, LW, LH);
    const pw = Math.max(260, Math.min(LW - 44, 486));

    // Measure first, then size the card to what is actually in it.
    let mh = 32 + 50;
    ctx.font = '600 17px Inter, sans-serif';
    mh = wrapText(MENU_SUB, 0, mh, pw - 70, 24, 'center', true) + 16;
    ctx.font = '500 16px Inter, sans-serif';
    for (const r of MENU_RULES) mh = wrapText(r, 0, mh, pw - 96, 22, 'left', true) + 12;
    const ph = Math.min(LH - 28, mh + 22 + UI.CTA.h + 34);
    const px = Math.round((LW - pw) / 2), py = Math.round((LH - ph) / 2);
    ctx.fillStyle = '#16233A'; roundRect(px, py, pw, ph, 24); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; roundRect(px, py, pw, ph, 24); ctx.stroke();
    // spectrum hairline across the top of the card
    const g = ctx.createLinearGradient(px + 40, 0, px + pw - 40, 0);
    g.addColorStop(0, 'rgba(255,71,87,0)'); g.addColorStop(0.22, '#FF4757');
    g.addColorStop(0.5, '#39E77B'); g.addColorStop(0.78, '#4C8DFF'); g.addColorStop(1, 'rgba(76,141,255,0)');
    ctx.fillStyle = g; ctx.fillRect(px + 40, py + 1, pw - 80, 2);

    const cx = LW / 2; let y = py + 32;
    ctx.fillStyle = '#fff'; ctx.font = '800 38px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('PRISM', cx, y); y += 50;
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = '600 17px Inter, sans-serif';
    y = wrapText(MENU_SUB, cx, y, pw - 70, 24); y += 16;

    const rules = MENU_RULES;
    const rx = px + 30;
    for (let i = 0; i < rules.length; i++) {
      ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.arc(rx + 11, y + 11, 12, 0, 7); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.font = '800 14px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), rx + 11, y + 12);
      ctx.fillStyle = 'rgba(255,255,255,0.90)'; ctx.font = '500 16px Inter, sans-serif';
      y = wrapText(rules[i], rx + 34, y, pw - 96, 22, 'left') + 12;
    }
    const label = moves > 0 ? 'RESUME' : 'PLAY';
    uiButtons.push({ ...UI.drawCTA(ctx, label, cx, py + ph - 34 - UI.CTA.h / 2, ACCENT), act: () => { phase = 'play'; } });
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  // ---------- frame loop ----------
  // Light should breathe, so the loop runs continuously rather than only on
  // input. Idle frames are throttled; a flip or a bloom runs at full rate.
  let lastDraw = 0;
  function frame(t) {
    const busy = t < animEnd;
    if (busy || t - lastDraw >= (REDUCED ? 250 : 28)) { lastDraw = t; draw(t); }
    requestAnimationFrame(frame);
  }

  // ---------- debug handle ----------
  // Screenshots lie about scale and the in-app preview pauses rAF, so every
  // check on this site is made through numbers. This is that handle.
  const GLYPH = { 1: 'r', 2: 'g', 4: 'b', 3: 'y', 5: 'm', 6: 'c', 7: 'w' };
  const api = {
    get state() {
      const [lit, total] = gemCount();
      let mirrors = 0, decoys = 0, off = 0;
      for (let i = 0; i < R * C; i++) if (tile[i] === T_MIRROR) {
        mirrors++; if (isDecoy[i]) decoys++; else if (orient[i] !== solOrient[i]) off++;
      }
      const DN = ['N', 'E', 'S', 'W'];
      return { level, R, C, mode: MODE, phase, moves, par, gemsLit: lit, gems: total, mirrors, decoys, offSolution: off,
               solved: isSolved(), srcDir: DN[srcDir], prismDir: DN[prismDir],
               prism: { r: rowOf(prismCell), c: colOf(prismCell) } };
    },
    get geom() {
      return { LW, LH, cell, ox, oy, R, C, boardW: C * cell, boardH: R * cell,
               widthUsed: +(C * cell / LW * 100).toFixed(1), heightUsed: +(R * cell / LH * 100).toFixed(1),
               topGap: oy, botGap: LH - (oy + R * cell) };
    },
    get buttons() { return uiButtons.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })); },
    // ASCII map. S source, / \ mirror, P prism, letter = gem wanting that colour
    // (upper case once lit), + a cell with light in it, . empty.
    board() {
      const out = [];
      for (let r = 0; r < R; r++) {
        let s = '';
        for (let c = 0; c < C; c++) {
          const i = idx(r, c);
          if (tile[i] === T_SOURCE) s += 'S';
          else if (tile[i] === T_MIRROR) s += (orient[i] === SLASH ? '/' : '\\');
          else if (tile[i] === T_PRISM) s += 'P';
          else if (tile[i] === T_GEM) { const g = GLYPH[gemNeed[i]] || '?'; s += (gemGot[i] === gemNeed[i]) ? g.toUpperCase() : g; }
          else s += (seg[i * 4] || seg[i * 4 + 1] || seg[i * 4 + 2] || seg[i * 4 + 3]) ? '+' : '.';
          s += ' ';
        }
        out.push(s.trimEnd());
      }
      return out.join('\n');
    },
    solutionBoard() {
      const keep = orient.slice(); orient = solOrient.slice(); simulate(0);
      const s = this.board() + '\nsolved: ' + isSolved();
      orient = keep; simulate(0);
      return s;
    },
    gems() {
      const out = [];
      for (let i = 0; i < R * C; i++) if (tile[i] === T_GEM) {
        out.push({ r: rowOf(i), c: colOf(i), need: CNAME[gemNeed[i]], got: CNAME[gemGot[i]] || CNAME[0], ok: gemGot[i] === gemNeed[i] });
      }
      return out;
    },
    solve() { orient = solOrient.slice(); simulate(0); if (isSolved()) { phase = 'won'; wonT = performance.now() - BLOOM_MS - 260; animEnd = performance.now() + 900; } return this.state; },
    flip(r, c) { flip(idx(r, c), performance.now()); return this.state; },
    goto(n) { genLevel(n); return this.state; },
    next() { genLevel(level + 1); return this.state; },
    // Fires a white beam into the prism from each of the four sides in turn and
    // reports what comes out. Proves the piece is genuinely oriented: only the
    // flat face does anything, and it splits into exactly the three primaries.
    physics() {
      const DN = ['N', 'E', 'S', 'W'], out = [];
      const keepTile = tile.slice(), keepSrc = srcCell, keepDir = srcDir;
      for (let d = 0; d < 4; d++) {
        // stand a source one cell back from the prism, aiming at it
        const from = stepCell(prismCell, OPP(d));
        if (from < 0) { out.push({ from: DN[OPP(d)], travelling: DN[d], result: 'no room to test' }); continue; }
        tile = keepTile.slice();
        tile[from] = T_SOURCE; srcCell = from; srcDir = d;
        simulate(0);
        const exits = [];
        for (let e = 0; e < 4; e++) {
          const m = seg[prismCell * 4 + e];
          if (m && e !== OPP(d)) exits.push(DN[e] + ':' + CNAME[m]);
        }
        out.push({ travelling: DN[d], hits: d === prismDir ? 'the flat face' : 'a slanted face',
                   exits: exits.length ? exits.join('  ') : 'nothing, the light is lost' });
      }
      tile = keepTile; srcCell = keepSrc; srcDir = keepDir; simulate(0);
      return { prismFaces: DN[prismDir], tests: out };
    },
    // THE GATE. A light puzzle draws every beam, so the risk is not that it is
    // unreadable, it is that it plays itself: if flipping whatever looks most
    // promising keeps working, there is no puzzle here, only fiddling.
    //
    // `greedy` is a fair, strong hill climber. It tries every mirror, scores the
    // board by how close the gems are to their colour, and takes the best flip,
    // breaking ties at random. It stops when nothing improves. `random` just
    // flips blindly. Both get three times par to work with.
    // A LOW greedy number is the good result.
    gate(levels, per) {
      const bits = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
      const heur = () => {
        let s = 0;
        for (let i = 0; i < R * C; i++) {
          if (tile[i] !== T_GEM) continue;
          const need = gemNeed[i], got = gemGot[i];
          if (got === need) { s += 100; continue; }
          s += 12 * bits(got & need) - 6 * bits(got & ~need);
        }
        return s;
      };
      const keep = level, rows = [];
      for (let L = 1; L <= (levels || 12); L++) {
        let g = 0, rr = 0, n = per || 40;
        for (let k = 0; k < n; k++) {
          genLevel(L, true);
          const start = orient.slice(), budget = Math.max(6, par * 3);
          const mirrors = [];
          for (let i = 0; i < R * C; i++) if (tile[i] === T_MIRROR) mirrors.push(i);

          for (let m = 0; m < budget && !isSolved(); m++) {
            simulate(0);
            const cur = heur();
            let bestS = -Infinity, ties = [];
            for (const i of mirrors) {
              orient[i] ^= 1; simulate(0);
              const s = heur();
              orient[i] ^= 1;
              if (s > bestS) { bestS = s; ties = [i]; } else if (s === bestS) ties.push(i);
            }
            simulate(0);
            if (bestS <= cur) break;                 // plateau, the climber is stuck
            orient[pick(ties)] ^= 1; simulate(0);
          }
          if (isSolved()) g++;

          orient = start.slice(); simulate(0);
          for (let m = 0; m < budget && mirrors.length && !isSolved(); m++) {
            orient[pick(mirrors)] ^= 1; simulate(0);
          }
          if (isSolved()) rr++;
          orient = start.slice(); simulate(0);
        }
        rows.push({ level: L, greedyPct: Math.round(g / n * 100), randomPct: Math.round(rr / n * 100) });
      }
      genLevel(keep, true);
      return rows;
    },
    // Generator health check. Builds many boards and reports anything that is
    // not solvable from its own recorded answer, or that arrives already solved.
    audit(levels, per) {
      const keep = level, bad = [];
      let mirrors = 0, pars = 0, gems = 0, count = 0, mixed = 0;
      for (let L = 1; L <= (levels || 14); L++) for (let k = 0; k < (per || 25); k++) {
        genLevel(L, true);
        const st = this.state;
        if (!st.gems) bad.push({ level: L, why: 'no gems' });
        if (st.solved) bad.push({ level: L, why: 'starts solved' });
        if (!st.offSolution) bad.push({ level: L, why: 'nothing to fix' });
        const o = orient.slice(); orient = solOrient.slice(); simulate(0);
        if (!isSolved()) bad.push({ level: L, why: 'recorded answer does not light every gem' });
        orient = o; simulate(0);
        for (let i = 0; i < R * C; i++) if (tile[i] === T_GEM && primsOf(gemNeed[i]).length > 1) { mixed++; break; }
        mirrors += st.mirrors; pars += st.par; gems += st.gems; count++;
      }
      genLevel(keep, true);
      return { boards: count, failures: bad.length, examples: bad.slice(0, 6),
               avgMirrors: +(mirrors / count).toFixed(2), avgPar: +(pars / count).toFixed(2),
               avgGems: +(gems / count).toFixed(2), boardsWithAMixedGem: mixed };
    },
  };
  window.__prism = api;

  // ---------- boot ----------
  setCanvasVars(); resizeCanvas(); fitFullscreen(); resizeCanvas();
  genLevel(loadLevel(), true);
  // The render loop starts at BOOT, not on splash-done. Gating it on that event
  // is how Zood ended up fading its splash onto a blank card.
  requestAnimationFrame(frame);
  // Re-measure after boot: innerWidth/innerHeight can read 0 or a stale
  // pre-layout value while this script first runs. Timers, not rAF, because rAF
  // is throttled to nothing in some embedded browsers.
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
})();
