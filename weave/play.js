/* ============================================================
   Weave · a Zamborin Game (engine pass)

   Coloured endpoints come in pairs. Drag from one to lay a thread of
   silk to its twin. Threads MAY cross each other, which is the whole
   point: Flow forbids crossings, Untangle forbids crossings, and Weave
   invites them and then constrains them.

   THE RULE: cloth only holds together if every thread alternates over,
   under, over, under at its successive crossings, exactly like a real
   woven strand. A thread that passes over twice running is snagged.

   THE MODEL: alternation means a thread's whole over/under sequence is
   fixed by ONE bit, f(T), which is just "does it start over or under".
   At a crossing shared by A and B one must be over and the other under,
   which ties their bits together:

       f(A) XOR f(B) = 1 XOR (index of the crossing along A)
                         XOR (index of the crossing along B)   (mod 2)

   So the whole cloth is a parity graph over threads, and it weaves iff
   that graph has no odd cycle. Union-find with parity settles it in
   almost linear time, and the edge that closes an odd cycle is exactly
   the crossing to show the player as snagged.
   ============================================================ */
(() => {
  'use strict';

  let LW = 760, LH = 600;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const UI = window.ZAM_UI;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const BG_TOP = '#1B2A47', BG_MID = '#131F36', BG_BOT = '#0E1726';
  const ACCENT = '#6B46E0';

  // ---------- directions ----------
  const N = 0, E = 1, S = 2, W = 3;
  const DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1];
  const axisOf = (d) => (d & 1) ? 0 : 1;      // 0 = horizontal, 1 = vertical

  // ---------- silk palette ----------
  // Distinct in hue AND in luminance, so threads stay tellable apart when they
  // cross and when someone is colour blind.
  const SILK = [
    { c: '#FF4757', hi: '#FF8E97', name: 'crimson' },
    { c: '#39E77B', hi: '#8CF5B6', name: 'jade' },
    { c: '#4C8DFF', hi: '#8FB8FF', name: 'lapis' },
    { c: '#FFD93D', hi: '#FFE98A', name: 'saffron' },
    { c: '#FF6BD6', hi: '#FFA8E2', name: 'fuchsia' },
    { c: '#4EE8E0', hi: '#9BF6F1', name: 'aqua' },
    { c: '#FF9F43', hi: '#FFC58A', name: 'amber' },
    { c: '#B08CFF', hi: '#D3BEFF', name: 'iris' },
  ];

  // ---------- MODE + CANVAS ----------
  const FORCED = (location.search.match(/[?&]mode=(desktop|mobile)/) || [])[1];
  const MODE = FORCED || ((matchMedia('(pointer: coarse)').matches || window.innerWidth < 768) ? 'mobile' : 'desktop');
  document.body.classList.add('mode-' + MODE);
  function setCanvasVars() {
    if (MODE === 'mobile') { LW = window.innerWidth; LH = window.innerHeight; }
    else { LW = 760; LH = 600; }
    document.body.style.setProperty('--canvas-w', LW + 'px');
    document.body.style.setProperty('--canvas-h', LH + 'px');
  }
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const bW = Math.round((rect.width || LW) * dpr), bH = Math.round((rect.height || LH) * dpr);
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
  let R = 6, C = 8, cell = 70, ox = 0, oy = 0;
  let threads = [];            // { a, b, path: [cellIdx] | null, colour }
  let crossings = [];          // { cell, tA, iA, tB, iB, overT, snagged, inLoop }
  let snagCount = 0, weaveOK = true, snagLoop = null;
  let level = 1, moves = 0, phase = 'menu';   // menu | play | won
  let drag = null;             // { t, path:[...] }
  let buttons = [];            // { cell, tid } — a button is SEWN ON, so its
                               // thread has to pass through it. A positive
                               // constraint: it pulls a thread across the board
                               // and into other threads, rather than just
                               // taking a route away the way a wall would.
  let uiButtons = [], snagButtons = [], animEnd = 0, wonT = -1e9, bgGrad = null;
  let history = [];
  const LS_TAUGHT = 'zamborin-weave.snag-taught';
  let snagTaught = (() => { try { return localStorage.getItem(LS_TAUGHT) === '1'; } catch (e) { return false; } })();

  const LS = 'zamborin-weave.level';
  const saveLevel = () => { try { localStorage.setItem(LS, String(level)); } catch (e) {} };
  const loadLevel = () => { try { const v = parseInt(localStorage.getItem(LS), 10); return (v >= 1 && v <= 999) ? v : 1; } catch (e) { return 1; } };

  const idx = (r, c) => r * C + c;
  const rowOf = (i) => (i / C) | 0, colOf = (i) => i % C;
  function step(i, d) {
    const r = rowOf(i) + DR[d], c = colOf(i) + DC[d];
    if (r < 0 || r >= R || c < 0 || c >= C) return -1;
    return r * C + c;
  }
  const adjacent = (i, j) => {
    const dr = Math.abs(rowOf(i) - rowOf(j)), dc = Math.abs(colOf(i) - colOf(j));
    return dr + dc === 1;
  };

  // ---------- layout ----------
  const SIDE_PAD = MODE === 'mobile' ? 18 : 30;
  const topBand = () => MODE === 'mobile' ? 64 : 56;
  const botBand = () => MODE === 'mobile' ? 96 : 40;

  function gridDims(lvl) {
    if (MODE === 'mobile') {
      // SEVEN columns, not six. At six the level-1 answer already committed
      // half the board, and a player who has not yet worked out that threads
      // must cross has nowhere to reroute to. Room to be wrong is what an
      // early level is for.
      const cols = 7;
      const cw = (LW - SIDE_PAD * 2) / cols;
      let rows = Math.floor((LH - topBand() - botBand()) / cw);
      return [Math.max(7, Math.min(rows, 11)), cols];
    }
    // The play area is 700x504, a ratio of 1.39, so the grid keeps roughly that
    // ratio as it grows or the board stops filling the frame.
    // Grid grows to level 21 rather than stopping at 13. At 10x13 the cell is
    // 50px and the board still uses 85% of the frame width.
    // Starts at 6x8, not 5x7. Desktop level 1 was TIGHTER than mobile's — 35
    // cells against 60 — for the same three threads.
    const rows = 6 + Math.min(Math.floor((lvl - 1) / 3), 4);      // 6 -> 10 by level 13
    return [rows, rows + (rows <= 6 ? 2 : 3)];
  }
  function layout() {
    const availW = Math.max(60, LW - SIDE_PAD * 2);
    const availH = Math.max(60, LH - topBand() - botBand());
    cell = Math.max(8, Math.floor(Math.min(availW / C, availH / R)));
    ox = Math.round((LW - C * cell) / 2);
    oy = Math.round(topBand() + (availH - R * cell) / 2);
    bgGrad = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
    bgGrad.addColorStop(0, BG_TOP); bgGrad.addColorStop(0.6, BG_MID); bgGrad.addColorStop(1, BG_BOT);
  }
  const ccx = (c) => ox + (c + 0.5) * cell;
  const ccy = (r) => oy + (r + 0.5) * cell;

  // ---------- cell occupancy ----------
  // A cell can carry ONE horizontal pass and ONE vertical pass, and that is what
  // a crossing is. Anything that turns in a cell, or ends there, takes the whole
  // cell: you cannot weave through a corner.
  function buildOccupancy(list) {
    const n = R * C;
    const occ = { h: new Array(n).fill(-1), v: new Array(n).fill(-1), solid: new Array(n).fill(-1),
                  hi: new Array(n).fill(-1), vi: new Array(n).fill(-1) };
    for (const t of list) {
      if (!t.path || t.path.length < 2) continue;
      const p = t.path;
      occ.solid[p[0]] = t.id; occ.solid[p[p.length - 1]] = t.id;
      for (let k = 1; k < p.length - 1; k++) {
        const prev = p[k - 1], cur = p[k], next = p[k + 1];
        const straight = (rowOf(prev) === rowOf(next)) || (colOf(prev) === colOf(next));
        if (!straight) { occ.solid[cur] = t.id; continue; }
        if (rowOf(prev) === rowOf(next)) { occ.h[cur] = t.id; occ.hi[cur] = k; }
        else { occ.v[cur] = t.id; occ.vi[cur] = k; }
      }
    }
    return occ;
  }

  // Can thread `tid` occupy `c` arriving from `from` and leaving toward `to`?
  // `to` may be -1 when we do not know the next step yet (mid-drag).
  function cellFree(occ, c, tid, fromDir, toDir) {
    if (occ.solid[c] >= 0 && occ.solid[c] !== tid) return false;
    if (toDir < 0) return occ.solid[c] < 0 || occ.solid[c] === tid;
    const turning = axisOf(fromDir) !== axisOf(toDir);
    if (turning) return occ.h[c] < 0 && occ.v[c] < 0 && occ.solid[c] < 0;
    const ax = axisOf(fromDir);
    return ax === 0 ? (occ.h[c] < 0 || occ.h[c] === tid) : (occ.v[c] < 0 || occ.v[c] === tid);
  }

  // ---------- the weave ----------
  // Union-find with PARITY. find() returns [root, parityToRoot].
  function makeDSU(n) {
    const par = Array.from({ length: n }, (_, i) => i), rel = new Array(n).fill(0);
    function find(x) {
      if (par[x] === x) return [x, 0];
      const [r, p] = find(par[x]);
      par[x] = r; rel[x] ^= p;
      return [r, rel[x]];
    }
    function union(a, b, k) {          // want parity(a) XOR parity(b) === k
      const [ra, pa] = find(a), [rb, pb] = find(b);
      if (ra === rb) return (pa ^ pb) === k;    // false means an odd cycle
      par[ra] = rb; rel[ra] = pa ^ pb ^ k;
      return true;
    }
    return { find, union };
  }

  // Walk the accepted crossings from one end of the failing crossing back to the
  // other. That route plus the failing crossing is the loop of threads that
  // cannot agree, and it is what the player is actually shown and told about.
  function traceLoop(accepted, bad) {
    const adj = new Map();
    for (const x of accepted) {
      if (!adj.has(x.tA)) adj.set(x.tA, []);
      if (!adj.has(x.tB)) adj.set(x.tB, []);
      adj.get(x.tA).push([x.tB, x]); adj.get(x.tB).push([x.tA, x]);
    }
    const prev = new Map([[bad.tA, null]]), q = [bad.tA];
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      if (cur === bad.tB) break;
      for (const [nx, x] of (adj.get(cur) || [])) {
        if (prev.has(nx)) continue;
        prev.set(nx, [cur, x]); q.push(nx);
      }
    }
    if (!prev.has(bad.tB)) return { threads: [bad.tA, bad.tB], crossings: [bad] };
    const cs = [bad], th = new Set([bad.tA, bad.tB]);
    let node = bad.tB;
    while (prev.get(node)) { const [p, x] = prev.get(node); cs.push(x); th.add(p); node = p; }
    return { threads: [...th], crossings: cs };
  }

  // The sentence the player is given. Built from the real conflict, because
  // "there is a snag" is not a move and "crimson meets lapis twice, and only
  // jade passes between them" is.
  function snagSentence() {
    if (!snagLoop) return '';
    const name = (i) => SILK[threads[i].colour].name;
    const th = snagLoop.threads;
    if (th.length === 2) {
      const [a, b] = th;
      const between = snagLoop.crossings.length;
      return name(a) + ' and ' + name(b) + ' meet ' + (between === 2 ? 'twice' : between + ' times') +
             ', and an odd number of threads slip between them. One more crossing, or one fewer, settles it.';
    }
    const list = th.map(name);
    const last = list.pop();
    return list.join(', ') + ' and ' + last + ' form a ring that cannot agree. Somewhere round it, one thread has to pass over where it is passing under.';
  }

  function computeWeave() {
    const occ = buildOccupancy(threads);
    crossings = [];
    for (let i = 0; i < R * C; i++) {
      if (occ.h[i] >= 0 && occ.v[i] >= 0 && occ.h[i] !== occ.v[i]) {
        crossings.push({ cell: i, tA: occ.h[i], iA: occ.hi[i], tB: occ.v[i], iB: occ.vi[i], overT: -1, snagged: false, inLoop: false });
      }
    }
    // Order each thread's crossings ALONG the thread, because the alternation is
    // in path order, not in grid order.
    const along = threads.map(() => []);
    for (const x of crossings) { along[x.tA].push([x.iA, x]); along[x.tB].push([x.iB, x]); }
    for (const list of along) list.sort((p, q) => p[0] - q[0]);
    const seq = new Map();                       // crossing -> {A: n, B: n}
    along.forEach((list, tid) => list.forEach(([, x], n) => {
      const e = seq.get(x) || {}; e[x.tA === tid && x.iA !== undefined && x.tB !== tid ? 'A' : (x.tB === tid ? 'B' : 'A')] = n;
      seq.set(x, e);
    }));

    const dsu = makeDSU(threads.length);
    snagCount = 0; weaveOK = true;
    snagLoop = null;
    const accepted = [];                          // edges already in the forest
    for (const x of crossings) {
      const e = seq.get(x) || { A: 0, B: 0 };
      const k = 1 ^ ((e.A | 0) & 1) ^ ((e.B | 0) & 1);
      if (dsu.union(x.tA, x.tB, k)) { accepted.push(x); continue; }
      // A snag is a property of a LOOP, not of a place. Reddening the one
      // crossing that happened to close the cycle points at an arbitrary spot,
      // and the real culprit is often two threads away. So recover the whole
      // loop: the route through already-accepted crossings from A back to B,
      // plus this crossing, is exactly the ring that cannot agree.
      x.snagged = true; snagCount++; weaveOK = false;
      if (!snagLoop) snagLoop = traceLoop(accepted, x);
    }
    if (snagLoop) for (const c of snagLoop.crossings) c.inLoop = true;
    // Settle who is on top. parity(T) is the thread's f bit; its n-th crossing
    // is over when f XOR n is 0.
    for (const x of crossings) {
      if (x.snagged) continue;
      const e = seq.get(x) || { A: 0, B: 0 };
      const [, pa] = dsu.find(x.tA);
      x.overT = ((pa ^ ((e.A | 0) & 1)) === 0) ? x.tA : x.tB;
    }
    return weaveOK;
  }

  const connected = () => threads.filter((t) => t.path && t.path.length >= 2).length;
  const allConnected = () => threads.every((t) => t.path && t.path.length >= 2);

  // WOVEN IN. A thread that goes over everything it meets is lying on top of the
  // cloth and would slide off; one that goes under everything is trapped beneath
  // it. To be woven, a thread has to pass over something AND under something.
  //
  // This is the rule that makes the game a game. Permitting crossings is not a
  // constraint, it is the removal of one, which is why every routing used to
  // weave. Requiring them gives every thread degree 2 or more in the crossing
  // graph, and a graph with minimum degree 2 must contain a cycle — and a cycle
  // is the only place the over/under alternation can ever contradict itself.
  // How many crossings a thread must have to count as woven in. Two is the
  // minimum that means anything (over something and under something). Deeper in,
  // asking for three tightens the whole cloth WITHOUT adding more threads or
  // more colours, which is what stops the late game being the early game on a
  // bigger board. Thread count deliberately stays capped at eight: eight silks
  // is already the limit of telling colours apart at a glance.
  // Asking for THREE crossings per thread was tried and backed out: this
  // generator cannot build cloth that dense, so level 20 took 1.4 SECONDS and
  // still came out with half the threads dropped. It needs a better generator
  // before it can be a difficulty dial. Two it is.
  const minCross = () => 2;
  function crossingsOf(tid) {
    let n = 0;
    for (const x of crossings) if (x.tA === tid || x.tB === tid) n++;
    return n;
  }
  // The one place the "what do I do next" line is written. The HUD draws it and
  // the debug handle reads it, so a test can never check a stale copy of it.
  //
  // NAME THE ACTION, NOT THE SYMPTOM. This used to read "lying on top, not
  // woven in. Each thread needs to pass over one thread and under another."
  // Every word of that is true and none of it is useful, because OVER AND UNDER
  // IS NOT THE PLAYER'S TO SET — the game works the alternation out itself.
  // Being told to make a thread pass under something, with no control over
  // which thread is under, is being told to fix the one thing you cannot touch.
  // What the player actually does is REROUTE, so say that, and say how far off
  // the thread is.
  function hintText(loose, mctx, maxW) {
    let msg;
    if (loose && loose.length) {
      // Kept short enough to survive at 760 wide. The long version overflowed
      // and fell back to a terse form that dropped the instruction, which is
      // the one part that has to be there. The HUD already counts how many are
      // loose, so this line does not repeat it.
      const worst = loose.map((i) => ({ i, n: crossingsOf(i) })).sort((a, b) => a.n - b.n)[0];
      const name = SILK[threads[worst.i].colour].name;
      const short = minCross() - worst.n;
      msg = worst.n === 0
        ? name + ' crosses nothing. Route it over another thread.'
        : name + ' crosses only one. Route it over ' + (short === 1 ? 'one' : short) + ' more.';
    } else {
      msg = 'A button is still unsewn. Each thread must pass through its own.';
    }
    if (mctx && maxW && mctx.measureText(msg).width > maxW) {
      if (!loose || !loose.length) return 'A button is still unsewn.';
      const worst = loose.map((i) => ({ i, n: crossingsOf(i) })).sort((a, b) => a.n - b.n)[0];
      return SILK[threads[worst.i].colour].name + ' needs to cross ' + (minCross() - worst.n) + ' more';
    }
    return msg;
  }

  function looseThreads() {
    const out = [];
    for (const t of threads) {
      if (!t.path || t.path.length < 2) continue;
      if (crossingsOf(t.id) < minCross()) out.push(t.id);
    }
    return out;
  }
  const allWovenIn = () => looseThreads().length === 0;

  function openButtons() {                    // buttons not yet sewn through
    return buttons.filter((b) => {
      const t = threads[b.tid];
      return !(t && t.path && t.path.includes(b.cell));
    });
  }
  const allSewn = () => openButtons().length === 0;
  function cellsUsed() {
    const occ = buildOccupancy(threads);
    let n = 0;
    for (let i = 0; i < R * C; i++) if (occ.solid[i] >= 0 || occ.h[i] >= 0 || occ.v[i] >= 0) n++;
    return n;
  }
  const isSolved = () => allConnected() && weaveOK && allWovenIn() && allSewn();

  // ---------- generation ----------
  const rnd = (n) => (Math.random() * n) | 0;
  const pick = (a) => a[rnd(a.length)];
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // Lay a thread as a random self-avoiding walk that is allowed to pass straight
  // through a cell another thread already passes through on the other axis.
  function carveThread(tid, occ, minLen, maxLen) {
    const starts = shuffle(Array.from({ length: R * C }, (_, i) => i))
      .filter((i) => occ.solid[i] < 0 && occ.h[i] < 0 && occ.v[i] < 0);
    for (const s of starts) {
      const path = [s];
      const localH = new Set(), localV = new Set(), localSolid = new Set([s]);
      let cur = s, fromDir = -1;
      const target = minLen + rnd(maxLen - minLen + 1);
      while (path.length < target) {
        const opts = shuffle([0, 1, 2, 3]).filter((d) => {
          const nx = step(cur, d);
          if (nx < 0 || localSolid.has(nx)) return false;
          if (occ.solid[nx] >= 0) return false;
          // stepping INTO nx is fine; what matters is whether cur can hold the
          // turn or pass we are about to make in it
          if (fromDir >= 0) {
            const turning = axisOf(fromDir) !== axisOf(d);
            if (turning) {
              if (occ.h[cur] >= 0 || occ.v[cur] >= 0) return false;
              if (localH.has(cur) || localV.has(cur)) return false;
            } else if (axisOf(d) === 0) {
              if (occ.h[cur] >= 0 || localH.has(cur)) return false;
            } else {
              if (occ.v[cur] >= 0 || localV.has(cur)) return false;
            }
          }
          return true;
        });
        if (!opts.length) break;
        // Hunt for crossings. Carrying straight on through a cell that already
        // has traffic on the other axis IS a crossing, so those moves are taken
        // first. Without this bias the walks politely avoid each other and the
        // cloth comes out as a set of separate threads lying side by side.
        const crossers = opts.filter((d) => {
          if (fromDir < 0 || axisOf(fromDir) !== axisOf(d)) return false;
          return axisOf(d) === 0 ? occ.v[cur] >= 0 : occ.h[cur] >= 0;
        });
        const d = (crossers.length && Math.random() < 0.92) ? crossers[0] : opts[0];
        if (fromDir >= 0) {
          const turning = axisOf(fromDir) !== axisOf(d);
          if (turning) localSolid.add(cur);
          else if (axisOf(d) === 0) localH.add(cur); else localV.add(cur);
        }
        cur = step(cur, d); path.push(cur); localSolid.add(cur); fromDir = d;
      }
      if (path.length >= minLen) return path;
    }
    return null;
  }

  function tryBuild(lvl, dropThreads) {
    buttons = [];
    // Threads grow SLOWER than the board. When they grew every other level they
    // hit the cap of eight at level 11 while the grid was still 8x11, and that
    // pinch point failed to build 40% of the time.
    const want = Math.max(3, Math.min(3 + Math.floor((lvl - 1) / 3), SILK.length) - (dropThreads || 0));
    const list = [];
    let occ = buildOccupancy(list);
    const maxLen = Math.max(5, Math.floor((R + C) * 0.9));
    for (let k = 0; k < want; k++) {
      const t = { id: k, colour: k, a: -1, b: -1, path: null };
      const p = carveThread(k, occ, 4, maxLen);
      if (!p) break;
      t.path = p; t.a = p[0]; t.b = p[p.length - 1];
      list.push(t);
      occ = buildOccupancy(list);
    }
    if (list.length < 3) return false;
    threads = list;
    computeWeave();

    // Threads laid early have nothing to cross yet, so they often come out
    // lying loose on the cloth. Rather than throw the whole board away, pull out
    // just the loose ones and lay them again against everything else that is now
    // there for them to cross. A few passes settles almost every board.
    for (let pass = 0; pass < 10 && !allWovenIn(); pass++) {
      const loose = looseThreads();
      let changed = false;
      for (const tid of loose) {
        const t = threads[tid], kept = t.path;
        t.path = null;
        const o = buildOccupancy(threads.filter((x) => x.id !== tid));
        const p = carveThread(tid, o, 5, Math.max(7, Math.floor((R + C) * 1.15)));
        if (p) { t.path = p; t.a = p[0]; t.b = p[p.length - 1];changed = true; }
        else t.path = kept;
        computeWeave();
      }
      if (!changed) break;
    }
    if (!computeWeave()) return false;          // the generated cloth must weave
    if (!allWovenIn()) return false;            // and every thread must be woven IN
    solution = threads.map((t) => t.path.slice());

    // Buttons go ON the recorded answer's own path, which is what keeps every
    // board solvable by construction: the answer already sews them. Never on an
    // endpoint or a crossing, where the mark would be ambiguous.
    // Exactly ONE button per thread. Several buttons on one colour piles the
    // whole constraint onto a single thread and leaves the rest free; one each
    // spreads the work and keeps the board readable.
    buttons = [];
    const crossCells = new Set(crossings.map((x) => x.cell));
    const taken = new Set();
    for (const th of threads) {
      const spots = [];
      for (let k = 1; k < th.path.length - 1; k++) {
        if (!crossCells.has(th.path[k]) && !taken.has(th.path[k])) spots.push(th.path[k]);
      }
      if (!spots.length) continue;
      const cellPick = pick(spots);
      taken.add(cellPick);
      buttons.push({ cell: cellPick, tid: th.id });
    }

    return true;
  }

  let solution = [];
  function genLevel(lvl, asMenu) {
    level = Math.max(1, lvl); saveLevel();
    const [gr, gc] = gridDims(level);
    R = gr; C = gc;
    let built = false;
    // Every retry below is also bounded by wall clock. Without this a stubborn
    // board walked the whole ladder and froze the level change for over a
    // second, which reads as the game hanging.
    const t0 = performance.now(), BUDGET = 140;
    const spent = () => performance.now() - t0 > BUDGET;
    // Try hard at the level's OWN size first.
    for (let a = 0; a < 300 && !built && !spent(); a++) built = tryBuild(level);
    // Then relax the THREAD COUNT, not the board. The old fallback dropped
    // straight to level-1 dimensions, so a player on level 75 could be handed a
    // 5x7 three-thread board still labelled level 75. It fired on 24% of level
    // 10s and 40% of level 12s.
    for (let drop = 1; drop <= 4 && !built && !spent(); drop++) {
      for (let a = 0; a < 120 && !built && !spent(); a++) built = tryBuild(level, drop);
    }
    // Shrinking the board is a genuine last resort, one step at a time.
    for (let sh = 1; sh <= 4 && !built; sh++) {
      R = Math.max(5, gr - sh); C = Math.max(7, gc - sh);
      for (let a = 0; a < 140 && !built; a++) built = tryBuild(level, 2);
    }
    // serve the endpoints only
    for (const t of threads) t.path = null;
    computeWeave();
    moves = 0; history = []; drag = null;
    phase = asMenu ? 'menu' : 'play'; animEnd = 0; wonT = -1e9;
    layout(); draw(performance.now());
  }
  function restart() {
    for (const t of threads) t.path = null;
    moves = 0; history = []; drag = null; phase = 'play';
    computeWeave(); draw(performance.now());
  }

  // HINT: lay ONE thread exactly where the answer puts it.
  //
  // A player who cannot see why a thread is loose has no way forward except
  // dragging it about and hoping, and the measurements say a lazy routing
  // satisfies the weave 0% of the time even at level one. So there has to be a
  // way to be shown, once, what a woven thread actually looks like.
  //
  // It picks the thread that is most in the way: one not laid at all first,
  // then a loose one, then anything sitting somewhere other than the answer.
  // Threads already correct are never chosen, so repeated taps make progress
  // instead of cycling.
  let hintT = -1e9, hintTid = -1;
  function hintThread() {
    if (phase !== 'play') return;
    const wrong = (t) => !t.path || !solution[t.id] ||
      t.path.length !== solution[t.id].length ||
      t.path.some((c, i) => c !== solution[t.id][i]);
    const loose = new Set(looseThreads());
    const pool = threads.filter(wrong);
    if (!pool.length) return;                       // everything already right
    const pick2 = pool.find((t) => !t.path) || pool.find((t) => loose.has(t.id)) || pool[0];
    if (!solution[pick2.id]) return;

    history.push(threads.map((x) => (x.path ? x.path.slice() : null)));
    if (history.length > 60) history.shift();
    pick2.path = solution[pick2.id].slice();

    // The answer's route may run through cells another thread is using, and a
    // half-overlapping pair reads as a bug. So drop any thread the hinted one
    // now collides with, rather than leaving an impossible board.
    //
    // buildOccupancy cannot answer this: it OVERWRITES on conflict rather than
    // reporting one, so a clash there looks like a clean board. Claims have to
    // be compared directly, and the only pair that may share a cell is one
    // horizontal pass with one vertical pass — that is what a crossing is.
    //
    // A thread ALREADY sitting on its answer is never cleared. The answer is
    // internally consistent by construction, so two hinted threads cannot
    // really conflict; a naive claim check says otherwise on some boards and
    // that made repeated hints knock each other out and stall at three of four.
    const onAnswer = (t) => t.path && solution[t.id] &&
      t.path.length === solution[t.id].length && t.path.every((c, i) => c === solution[t.id][i]);
    const claimsOf = (t) => {
      const m = new Map();
      if (!t.path || t.path.length < 2) return m;
      const p = t.path;
      m.set(p[0], 'solid'); m.set(p[p.length - 1], 'solid');
      for (let k = 1; k < p.length - 1; k++) {
        const prev = p[k - 1], cur = p[k], next = p[k + 1];
        if (rowOf(prev) === rowOf(next)) m.set(cur, 'h');
        else if (colOf(prev) === colOf(next)) m.set(cur, 'v');
        else m.set(cur, 'solid');
      }
      return m;
    };
    const hintClaims = claimsOf(pick2);
    for (const other of threads) {
      if (other.id === pick2.id || !other.path || onAnswer(other)) continue;
      let clash = false;
      for (const [c, kind] of claimsOf(other)) {
        const mine = hintClaims.get(c);
        if (mine === undefined) continue;
        if ((mine === 'h' && kind === 'v') || (mine === 'v' && kind === 'h')) continue;
        clash = true; break;
      }
      if (clash) other.path = null;
    }
    hintT = performance.now(); hintTid = pick2.id;
    moves++; computeWeave();
    animEnd = Math.max(animEnd, hintT + 1400);
    draw(hintT);
  }

  // ---------- drawing threads ----------
  function threadAtEndpoint(c) {
    for (const t of threads) if (t.a === c || t.b === c) return t;
    return null;
  }
  function beginDrag(c) {
    const t = threadAtEndpoint(c);
    if (!t) return false;
    history.push(threads.map((x) => (x.path ? x.path.slice() : null)));
    if (history.length > 60) history.shift();
    t.path = null;                       // redrawing clears the old run
    computeWeave();
    drag = { t, path: [c], from: -1 };
    return true;
  }
  function extendDrag(c) {
    if (!drag) return;
    const p = drag.path, last = p[p.length - 1];
    if (c === last) return;
    // stepping back retracts
    if (p.length >= 2 && c === p[p.length - 2]) { p.pop(); return; }
    if (!adjacent(last, c)) return;
    if (p.includes(c)) return;                          // no self-overlap
    if (p.length > R * C) return;                       // hard cap
    const other = threads.filter((x) => x !== drag.t);
    const occ = buildOccupancy(other);
    const d = dirBetween(last, c);
    // can `last` hold this pass or turn?
    if (p.length >= 2) {
      const fd = dirBetween(p[p.length - 2], last);
      if (!cellFree(occ, last, drag.t.id, fd, d)) return;
      const selfH = new Set(), selfV = new Set(), selfSolid = new Set();
      for (let k = 1; k < p.length - 1; k++) {
        const a = dirBetween(p[k - 1], p[k]), b = dirBetween(p[k], p[k + 1]);
        if (axisOf(a) !== axisOf(b)) selfSolid.add(p[k]);
        else if (axisOf(b) === 0) selfH.add(p[k]); else selfV.add(p[k]);
      }
      if (selfSolid.has(last) || (axisOf(fd) === axisOf(d) && (axisOf(d) === 0 ? selfH : selfV).has(last))) return;
    }
    // is `c` enterable at all?
    if (occ.solid[c] >= 0) {
      const t2 = threadAtEndpoint(c);
      if (!(t2 && t2 === drag.t)) return;               // only our own far end
    }
    p.push(c);
  }
  function dirBetween(a, b) {
    if (rowOf(b) === rowOf(a) - 1) return N;
    if (colOf(b) === colOf(a) + 1) return E;
    if (rowOf(b) === rowOf(a) + 1) return S;
    return W;
  }
  function endDrag() {
    if (!drag) return;
    const t = drag.t, p = drag.path;
    const far = (p[0] === t.a) ? t.b : t.a;
    if (p.length >= 2 && p[p.length - 1] === far) {
      t.path = p.slice(); moves++;
    }
    drag = null;
    const hadSnag = snagCount > 0;
    computeWeave();
    if (isSolved()) { phase = 'won'; wonT = performance.now(); animEnd = wonT + 1600; return; }
    // Teach the rule ONCE, the first time the cloth actually refuses, with the
    // real conflict named. After this the loop highlight and the line under the
    // board carry it, and tapping a snag brings the explanation back. A modal on
    // every snag would interrupt the core loop, because snagging IS the puzzle.
    if (snagCount > 0 && !hadSnag && !snagTaught) {
      snagTaught = true;
      try { localStorage.setItem(LS_TAUGHT, '1'); } catch (e) {}
      phase = 'snag';
    }
  }
  function undo() {
    if (!history.length || phase !== 'play') return;
    const snap = history.pop();
    threads.forEach((t, i) => { t.path = snap[i] ? snap[i].slice() : null; });
    moves++; computeWeave(); draw(performance.now());
  }

  // ---------- input ----------
  function canvasXY(e) {
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX ?? e.changedTouches?.[0]?.clientX);
    const py = (e.clientY ?? e.changedTouches?.[0]?.clientY);
    // Each axis scaled by its OWN dimension.
    return [(px - rect.left) * (LW / rect.width), (py - rect.top) * (LH / rect.height)];
  }
  function cellAt(x, y) {
    const c = Math.floor((x - ox) / cell), r = Math.floor((y - oy) / cell);
    if (r < 0 || r >= R || c < 0 || c >= C) return -1;
    return idx(r, c);
  }
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const [x, y] = canvasXY(e);
    for (const b of uiButtons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.act(); return; }
    if (phase === 'menu') { phase = 'play'; return; }
    if (phase === 'snag') { phase = 'play'; return; }
    if (phase === 'won') { genLevel(level + 1); return; }
    // tapping a snagged crossing brings the explanation back on demand
    for (const b of snagButtons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { phase = 'snag'; return; }
    const c = cellAt(x, y);
    if (c >= 0) { beginDrag(c); canvas.setPointerCapture?.(e.pointerId); }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    // If no button is held any more, the pointerup was lost — released off the
    // canvas, or swallowed by the window. Without this the drag stays live and,
    // because pointerdown took a pointer CAPTURE, every later mouse move keeps
    // drawing: threads lay themselves across the board with nobody touching it.
    if (e.buttons === 0) { endDrag(); return; }
    const [x, y] = canvasXY(e);
    const c = cellAt(x, y);
    if (c >= 0) extendDrag(c);
  });
  canvas.addEventListener('pointerup', (e) => {
    canvas.releasePointerCapture?.(e.pointerId);
    endDrag();
  });
  // and a belt-and-braces release: a pointerup anywhere ends the drag
  window.addEventListener('pointerup', () => { if (drag) endDrag(); });
  window.addEventListener('blur', () => { if (drag) { drag = null; computeWeave(); } });
  canvas.addEventListener('pointercancel', () => { drag = null; computeWeave(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'z' || e.key === 'Z') undo();
    if (e.key === 'r' || e.key === 'R') restart();
    if (e.key === 'n' || e.key === 'N') genLevel(level + 1);
  });

  // ---------- render (engine pass: legible, not yet dressed) ----------
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function roundRect(x, y, w, h, r) {
    if (!(w > 0) || !(h > 0)) { ctx.beginPath(); return; }
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function draw(now) {
    if (LW < 40 || LH < 40) return;
    if (!bgGrad) layout();
    ctx.clearRect(0, 0, LW, LH);
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, LW, LH);
    uiButtons = [];

    const pad = Math.max(2, cell * 0.045), rr = cell * 0.16;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const x = ox + c * cell + pad, y = oy + r * cell + pad, s = cell - pad * 2;
      ctx.fillStyle = 'rgba(255,255,255,0.028)'; roundRect(x, y, s, s, rr); ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.beginPath(); ctx.moveTo(x + rr, y + 0.5); ctx.lineTo(x + s - rr, y + 0.5); ctx.stroke();
    }

    snagButtons = [];
    const overAt = new Map();
    for (const x of crossings) if (!x.snagged) overAt.set(x.cell, x.overT);

    const looseSet = new Set(looseThreads());
    for (const t of threads) if (t.path) strandPath(t, overAt, false, looseSet.has(t.id));
    if (drag && drag.path.length > 1) strandPath({ ...drag.t, path: drag.path }, overAt, true, false);

    // A hinted thread is lit along its whole length for a moment. Laying a
    // thread somewhere the player did not put it, with no cue, reads as the
    // board rearranging itself; the flash says THIS is the one that moved.
    const hp = (now - hintT) / 1400;
    if (hp >= 0 && hp < 1 && hintTid >= 0) {
      const t = threads[hintTid];
      if (t && t.path && t.path.length > 1) {
        const fade = Math.sin(Math.min(1, hp) * Math.PI);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.42 * fade;
        ctx.strokeStyle = SILK[t.colour].c;
        ctx.lineWidth = Math.max(6, cell * 0.42);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        t.path.forEach((c, i) => { const X = ccx(colOf(c)), Y = ccy(rowOf(c));
          i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
        ctx.stroke();
        ctx.restore();
      }
    }

    // The whole arguing ring is lit, not just the crossing that happened to
    // close it. The one that closed it burns hottest so there is somewhere to
    // start looking, but the player can see the entire loop at fault.
    for (const x of crossings) {
      if (!x.snagged && !x.inLoop) continue;
      const cx = ccx(colOf(x.cell)), cy = ccy(rowOf(x.cell));
      const hot = x.snagged ? 1 : 0.55;
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cell * 0.58);
      g.addColorStop(0, 'rgba(255,71,87,' + (0.50 * hot) + ')');
      g.addColorStop(0.45, 'rgba(255,71,87,' + (0.20 * hot) + ')');
      g.addColorStop(1, 'rgba(255,71,87,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, cell * 0.58, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      snagButtons.push({ x: cx - cell * 0.4, y: cy - cell * 0.4, w: cell * 0.8, h: cell * 0.8 });
    }

    for (const b of buttons) drawButton(b);
    for (const t of threads) { knot(t.a, t.colour); knot(t.b, t.colour); }

    drawHUD();
    if (phase === 'play') { drawControls(); snagLine(); }
    if (phase === 'menu') menuOverlay();
    if (phase === 'snag') snagOverlay();
    if (phase === 'won') winOverlay(now);
  }

  // ---------- silk ----------
  // A thread is not a polyline. Four things separate the two, and the first
  // matters more than the rest put together:
  //
  //  1. It ROUNDS ITS CORNERS. Real thread cannot turn a right angle; it bends
  //     through an arc. Mitred corners are what read as wire.
  //  2. It is a cylinder, not a stroke: dark on one flank, bright on the other,
  //     lit from a fixed direction so the whole board agrees.
  //  3. It is SPUN, so a fine twist runs along its length.
  //  4. It has a soft edge rather than a hard one.
  //
  // Built as a list of point runs, broken wherever the thread passes under, so
  // the over/under read survives the rounding.
  const LIGHT = { x: -0.42, y: -0.58 };          // upper left, same for every thread

  function threadRuns(t, overAt) {
    const p = t.path, runs = [];
    let cur = [];
    for (let k = 0; k < p.length; k++) {
      const c = p[k];
      const under = overAt.has(c) && overAt.get(c) !== t.id;
      if (!under) { cur.push(c); continue; }
      // passing beneath: stop short of the cell, skip it, resume past it
      if (k > 0) cur.push(-(c + 1));             // negative marks "stop short here"
      if (cur.length) runs.push(cur);
      cur = [];
      if (k < p.length - 1) cur.push(-(c + 1));  // resume marker
    }
    if (cur.length) runs.push(cur);
    return runs;
  }

  // Turn a run of cells into a rounded path. `gap` shortens the two ends where
  // the thread dives under a neighbour.
  function tracePath(run, radius) {
    const pt = [];
    for (let k = 0; k < run.length; k++) {
      const v = run[k], neg = v < 0, c = neg ? -v - 1 : v;
      pt.push({ x: ccx(colOf(c)), y: ccy(rowOf(c)), stub: neg });
    }
    if (pt.length < 2) return null;
    // pull stub ends back toward their neighbour so a gap opens at the crossing
    const gap = cell * 0.34;
    if (pt[0].stub) {
      const d = Math.hypot(pt[1].x - pt[0].x, pt[1].y - pt[0].y) || 1;
      pt[0].x += (pt[1].x - pt[0].x) / d * gap; pt[0].y += (pt[1].y - pt[0].y) / d * gap;
    }
    const n = pt.length - 1;
    if (pt[n].stub) {
      const d = Math.hypot(pt[n - 1].x - pt[n].x, pt[n - 1].y - pt[n].y) || 1;
      pt[n].x += (pt[n - 1].x - pt[n].x) / d * gap; pt[n].y += (pt[n - 1].y - pt[n].y) / d * gap;
    }
    const path = new Path2D();
    path.moveTo(pt[0].x, pt[0].y);
    for (let k = 1; k < pt.length - 1; k++) {
      // arcTo gives the bend; the radius is clamped so short runs still work
      const r = Math.min(radius, Math.hypot(pt[k].x - pt[k - 1].x, pt[k].y - pt[k - 1].y) / 2,
                                 Math.hypot(pt[k + 1].x - pt[k].x, pt[k + 1].y - pt[k].y) / 2);
      path.arcTo(pt[k].x, pt[k].y, pt[k + 1].x, pt[k + 1].y, r);
    }
    path.lineTo(pt[pt.length - 1].x, pt[pt.length - 1].y);
    return { path, pt };
  }

  // Sample a run of cells into a dense polyline with ROUNDED corners, carrying
  // arc length and a normal at every point. Everything the braid needs.
  function centreline(run) {
    const pts = [];
    for (const v of run) {
      const neg = v < 0, c = neg ? -v - 1 : v;
      pts.push({ x: ccx(colOf(c)), y: ccy(rowOf(c)), stub: neg });
    }
    if (pts.length < 2) return null;
    const gap = cell * 0.36, n = pts.length - 1;
    if (pts[0].stub) {
      const d = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      pts[0].x += (pts[1].x - pts[0].x) / d * gap; pts[0].y += (pts[1].y - pts[0].y) / d * gap;
    }
    if (pts[n].stub) {
      const d = Math.hypot(pts[n - 1].x - pts[n].x, pts[n - 1].y - pts[n].y) || 1;
      pts[n].x += (pts[n - 1].x - pts[n].x) / d * gap; pts[n].y += (pts[n - 1].y - pts[n].y) / d * gap;
    }
    const raw = [{ x: pts[0].x, y: pts[0].y }];
    const R0 = cell * 0.40;
    for (let k = 1; k < pts.length - 1; k++) {
      const p0 = pts[k - 1], p1 = pts[k], p2 = pts[k + 1];
      const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1, l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
      const d1 = { x: (p1.x - p0.x) / l1, y: (p1.y - p0.y) / l1 };
      const d2 = { x: (p2.x - p1.x) / l2, y: (p2.y - p1.y) / l2 };
      if (Math.abs(d1.x * d2.y - d1.y * d2.x) < 1e-6) { raw.push({ x: p1.x, y: p1.y }); continue; }
      const r = Math.min(R0, l1 / 2, l2 / 2);
      const a = { x: p1.x - d1.x * r, y: p1.y - d1.y * r };
      const b = { x: p1.x + d2.x * r, y: p1.y + d2.y * r };
      const cxr = a.x + d2.x * r, cyr = a.y + d2.y * r;
      const a0 = Math.atan2(a.y - cyr, a.x - cxr), a1 = Math.atan2(b.y - cyr, b.x - cxr);
      let da = a1 - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      raw.push(a);
      for (let i = 1; i <= 6; i++) {
        const ang = a0 + da * i / 6;
        raw.push({ x: cxr + Math.cos(ang) * r, y: cyr + Math.sin(ang) * r });
      }
    }
    raw.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });

    // resample evenly, so the braid pitch is constant along the whole thread
    const stepLen = Math.max(2.2, cell * 0.045), out = [];
    let carry = 0, s = 0;
    for (let k = 0; k < raw.length - 1; k++) {
      const ax = raw[k].x, ay = raw[k].y;
      const L = Math.hypot(raw[k + 1].x - ax, raw[k + 1].y - ay);
      if (L < 1e-6) continue;
      const ux = (raw[k + 1].x - ax) / L, uy = (raw[k + 1].y - ay) / L;
      for (let d = carry; d < L; d += stepLen) {
        out.push({ x: ax + ux * d, y: ay + uy * d, nx: -uy, ny: ux, s: s + d });
      }
      carry = (carry - L) % stepLen; if (carry < 0) carry += stepLen;
      s += L;
    }
    const last = raw[raw.length - 1];
    out.push({ x: last.x, y: last.y, nx: out.length ? out[out.length - 1].nx : 0, ny: out.length ? out[out.length - 1].ny : 1, s });
    return out.length >= 2 ? out : null;
  }

  // FOUR strands of adjacent shades, plaited. Each strand swings side to side
  // along the thread, and its DEPTH swings a quarter turn out of phase, so it
  // rises in front of its neighbours and sinks behind them the way a real plait
  // does. Runs are split at every sign change of depth, and all the sunken parts
  // are laid down before any of the raised ones, which is what makes the strands
  // actually pass through each other rather than merely overlap.
  const STRANDS = 4;
  const SHADE = [1.16, 0.86, 1.02, 0.72];      // adjacent shades of the one colour

  function strandPath(t, overAt, ghost, loose) {
    const silk = SILK[t.colour];
    // A LOOSE thread is lying on the surface, not sewn into it. It says so by
    // floating: its shadow falls further away, the way an object further off the
    // cloth casts one, and the silk is drained because it is catching none of
    // the light the woven threads are trapped in. This is the whole rule of the
    // game, so it has to be legible from the material and not from a message.
    const base = loose ? drain(silk.c, 0.50) : silk.c;
    const lift = loose ? 3.1 : 1;
    const total = Math.max(3, cell * 0.225);    // width of the whole cord, 75% of the first pass
    const sw = total / 2.7;                     // one strand
    const amp = (total - sw) / 2;
    const pitch = Math.max(16, cell * 0.92);
    const a0 = ghost ? 0.5 : 1;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    for (const run of threadRuns(t, overAt)) {
      const cl = centreline(run);
      if (!cl) continue;

      const back = [], front = [];
      for (let i = 0; i < STRANDS; i++) {
        const ph = (i / STRANDS) * Math.PI * 2;
        let cur = null, curSign = 0;
        for (const q of cl) {
          const th = (q.s / pitch) * Math.PI * 2 + ph;
          const off = Math.sin(th) * amp, dep = Math.cos(th);
          const pt = { x: q.x + q.nx * off, y: q.y + q.ny * off };
          const sg = dep >= 0 ? 1 : -1;
          if (!cur || sg !== curSign) {
            if (cur && cur.pts.length > 1) (curSign > 0 ? front : back).push(cur);
            cur = { pts: cur ? [cur.pts[cur.pts.length - 1]] : [], shade: SHADE[i] };
            curSign = sg;
          }
          cur.pts.push(pt);
        }
        if (cur && cur.pts.length > 1) (curSign > 0 ? front : back).push(cur);
      }

      const strokeRun = (r, colour, width, alpha) => {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = colour; ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(r.pts[0].x, r.pts[0].y);
        for (let i = 1; i < r.pts.length; i++) ctx.lineTo(r.pts[i].x, r.pts[i].y);
        ctx.stroke();
      };

      // the cord's own shadow on the cloth
      ctx.save(); ctx.translate(total * 0.10 * lift, total * 0.14 * lift);
      for (const r of back.concat(front)) strokeRun(r, 'rgba(3,7,14,0.5)', sw * (loose ? 1.35 : 1.15), a0 * (loose ? 0.4 : 0.5));
      ctx.restore();

      for (const r of back) strokeRun(r, shade(base, r.shade * 0.62), sw, a0);
      // each raised strand drops a small shadow onto whatever it passes over
      ctx.save(); ctx.translate(sw * 0.22, sw * 0.28);
      for (const r of front) strokeRun(r, 'rgba(3,7,14,0.55)', sw * 1.02, a0 * 0.55);
      ctx.restore();
      for (const r of front) strokeRun(r, shade(base, r.shade), sw, a0);
      ctx.globalAlpha = 1;
    }
  }
  // (clip helper kept trivial: the dashes already ride the stroke itself)
  function thickenForClip(p) { return p; }

  // Drain a colour toward its own brightness. A loose thread is the same silk,
  // just not sewn in, so it should look tired rather than recoloured.
  const drain = (hex, amt) => {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = Math.round(r + (l - r) * amt); g = Math.round(g + (l - g) * amt); b = Math.round(b + (l - b) * amt);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  };
  const shade = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
    const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
    const b = Math.min(255, Math.round((n & 255) * f));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  };
  // A button, with its four holes. Sewn buttons sit calm; an unsewn one keeps a
  // soft ring around it so the eye finds the work still to do.
  function drawButton(b) {
    const t = threads[b.tid], silk = SILK[t.colour];
    const x = ccx(colOf(b.cell)), y = ccy(rowOf(b.cell)), r = cell * 0.30;
    const sewn = !!(t.path && t.path.includes(b.cell));
    if (!sewn) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, r * 0.7, x, y, r * 2.0);
      g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.0, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = 'rgba(4,8,16,0.45)';
    ctx.beginPath(); ctx.arc(x, y + r * 0.14, r, 0, 7); ctx.fill();
    // Exactly the thread's colour, so the eye pairs button to thread instantly.
    // Shading it darker made buttons read as their own separate family of piece.
    ctx.fillStyle = silk.c;
    ctx.globalAlpha = sewn ? 1 : 0.62;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(1, cell * 0.016);
    ctx.strokeStyle = sewn ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.30)';
    ctx.beginPath(); ctx.arc(x, y, r * 0.80, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(6,12,22,0.85)';
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath(); ctx.arc(x + dx * r * 0.32, y + dy * r * 0.32, r * 0.135, 0, 7); ctx.fill();
    }
  }

  // A dressmaker's PIN. The head was already a coloured sphere, so this is a
  // small change for a large gain in language: the fiction becomes "the thread
  // is pinned at both ends and you stitch between them". Kept restrained on
  // purpose — a fine shaft, a short one, angled away from the light so it reads
  // as pushed into the cloth rather than lying on it.
  function knot(c, colour) {
    const silk = SILK[colour];
    const x = ccx(colOf(c)), y = ccy(rowOf(c));
    const r = cell * 0.155;                       // head
    const len = cell * 0.30;                      // shaft
    const ang = Math.PI * 0.28;                   // down and to the right
    const sx = Math.cos(ang), sy = Math.sin(ang);

    // the shaft, tapering, with its own small shadow on the cloth
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(3,7,14,0.42)';
    ctx.lineWidth = Math.max(1.6, cell * 0.036);
    ctx.beginPath();
    ctx.moveTo(x + sx * r * 0.5 + 1.2, y + sy * r * 0.5 + 1.6);
    ctx.lineTo(x + sx * len + 1.2, y + sy * len + 1.6);
    ctx.stroke();
    const steel = ctx.createLinearGradient(x, y - r * 0.4, x + sx * len, y + sy * len);
    steel.addColorStop(0, '#E8EEF8'); steel.addColorStop(0.45, '#AEBACB'); steel.addColorStop(1, '#69768A');
    ctx.strokeStyle = steel;
    ctx.lineWidth = Math.max(1.2, cell * 0.026);
    ctx.beginPath();
    ctx.moveTo(x + sx * r * 0.5, y + sy * r * 0.5);
    ctx.lineTo(x + sx * len, y + sy * len);
    ctx.stroke();

    // the glass head
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.3);
    g.addColorStop(0, silk.c + '66'); g.addColorStop(1, silk.c + '00');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.3, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = 'rgba(3,7,14,0.40)';
    ctx.beginPath(); ctx.arc(x + r * 0.14, y + r * 0.20, r, 0, 7); ctx.fill();
    const bead = ctx.createRadialGradient(x - r * 0.34, y - r * 0.38, r * 0.08, x, y, r * 1.12);
    bead.addColorStop(0, silk.hi); bead.addColorStop(0.45, silk.c); bead.addColorStop(1, shade(silk.c, 0.55));
    ctx.fillStyle = bead; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.ellipse(x - r * 0.33, y - r * 0.40, r * 0.26, r * 0.17, -0.5, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    const PX = SIDE_PAD, y = Math.round(topBand() / 2);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = '600 16px Inter, sans-serif';
    let x = LW - PX;
    if (snagCount > 0) {
      ctx.fillStyle = 'rgba(255,130,140,0.95)';
      const s = snagCount + (snagCount === 1 ? ' snag' : ' snags');
      ctx.fillText(s, x, y); x -= ctx.measureText(s).width + 16;
    }
    const nLoose = looseThreads().length, nOpen = openButtons().length;
    if (nLoose > 0) {
      ctx.fillStyle = 'rgba(255,206,120,0.95)';
      const s = nLoose + ' loose';
      ctx.fillText(s, x, y); x -= ctx.measureText(s).width + 16;
    }
    if (nOpen > 0) {
      ctx.fillStyle = 'rgba(255,206,120,0.95)';
      const s = nOpen + (nOpen === 1 ? ' button' : ' buttons');
      ctx.fillText(s, x, y); x -= ctx.measureText(s).width + 16;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillText('Level ' + level + '   ·   ' + connected() + '/' + threads.length + ' threads', x, y);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }
  // One plain line under the board naming who is arguing. Not a modal: this has
  // to be readable without stopping play, because the player will be looking at
  // a snag most of the time they are thinking.
  function snagLine() {
    const loose = looseThreads(), open = openButtons();
    if (!snagCount && (loose.length || open.length)) {
      const y2 = oy + R * cell + 14;
      const limit = (MODE === 'mobile' ? LH - 94 - 6 : LH - 8) - 16;
      if (y2 > limit) return;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.font = '500 16px Inter, sans-serif';
      ctx.fillStyle = 'rgba(255,206,120,0.92)';
      let msg = hintText(loose, ctx, LW - SIDE_PAD * 2);
      ctx.fillText(msg, LW / 2, y2);
      ctx.textAlign = 'left';
      return;
    }
    if (!snagCount || !snagLoop) return;
    const y = oy + R * cell + 14;
    const limit = (MODE === 'mobile' ? LH - 94 - 6 : LH - 8) - 16;
    if (y > limit) return;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = '500 16px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,150,158,0.92)';
    const name = (i) => SILK[threads[i].colour].name;
    const th = snagLoop.threads;
    const msg = th.length === 2
      ? name(th[0]) + ' and ' + name(th[1]) + ' cannot agree. Tap a snag to see why.'
      : th.map(name).join(', ') + ' form a ring that cannot agree. Tap a snag to see why.';
    let s = msg;
    if (ctx.measureText(s).width > LW - SIDE_PAD * 2) s = 'These threads cannot agree. Tap a snag to see why.';
    ctx.fillText(s, LW / 2, y);
    ctx.textAlign = 'left';
  }

  function snagOverlay() {
    ctx.fillStyle = 'rgba(9,15,26,0.92)'; ctx.fillRect(0, 0, LW, LH);
    const pw = Math.max(260, Math.min(LW - 44, 500));
    const body = snagSentence();
    let mh = 30 + 42;
    ctx.font = '600 17px Inter, sans-serif';
    mh = wrapText('The cloth will not hold here.', 0, mh, pw - 70, 24, 'center', true) + 12;
    ctx.font = '500 16px Inter, sans-serif';
    mh = wrapText(body, 0, mh, pw - 68, 23, 'left', true) + 14;
    mh = wrapText('A thread has to go over, under, over, under. Where the loop is lit in red, that order breaks.', 0, mh, pw - 68, 23, 'left', true);
    const ph = Math.min(LH - 28, mh + 24 + UI.CTA.h + 32);
    const px = Math.round((LW - pw) / 2), py = Math.round((LH - ph) / 2);
    ctx.fillStyle = '#16233A'; roundRect(px, py, pw, ph, 24); ctx.fill();
    const g = ctx.createLinearGradient(px + 40, 0, px + pw - 40, 0);
    g.addColorStop(0, 'rgba(255,71,87,0)'); g.addColorStop(0.5, '#FF4757'); g.addColorStop(1, 'rgba(255,71,87,0)');
    ctx.fillStyle = g; ctx.fillRect(px + 40, py + 1, pw - 80, 2);
    const cx = LW / 2; let y = py + 30;
    ctx.fillStyle = '#fff'; ctx.font = '800 30px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('SNAGGED', cx, y); y += 42;
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = '600 17px Inter, sans-serif';
    y = wrapText('The cloth will not hold here.', cx, y, pw - 70, 24) + 12;
    ctx.fillStyle = 'rgba(255,190,195,0.95)'; ctx.font = '500 16px Inter, sans-serif';
    y = wrapText(body, px + 34, y, pw - 68, 23, 'left') + 14;
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    y = wrapText('A thread has to go over, under, over, under. Where the loop is lit in red, that order breaks.', px + 34, y, pw - 68, 23, 'left');
    uiButtons.push({ ...UI.drawCTA(ctx, 'GOT IT', cx, py + ph - 32 - UI.CTA.h / 2, ACCENT), act: () => { phase = 'play'; } });
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  function drawControls() {
    const gap = UI.PILL.gap;
    const wU = UI.pillWidth(ctx, 'Undo'), wR = UI.pillWidth(ctx, 'Restart'),
          wN = UI.pillWidth(ctx, 'Hint'), wH = UI.pillWidth(ctx, 'Rules');
    const total = wU + wR + wN + wH + gap * 3;
    const cy = MODE === 'mobile' ? LH - 74 : Math.round(topBand() / 2);
    let x = MODE === 'mobile' ? Math.round(LW / 2 - total / 2) : SIDE_PAD;
    uiButtons.push({ ...UI.drawPill(ctx, 'Undo', x + wU / 2, cy, { w: wU, dim: !history.length }), act: undo }); x += wU + gap;
    // Dimmed once every thread already matches the answer, so a tap that would
    // do nothing looks like it would do nothing.
    const nothingLeft = threads.every((t) => t.path && solution[t.id] &&
      t.path.length === solution[t.id].length && t.path.every((c, i) => c === solution[t.id][i]));
    uiButtons.push({ ...UI.drawPill(ctx, 'Hint', x + wN / 2, cy, { w: wN, dim: nothingLeft }), act: hintThread }); x += wN + gap;
    uiButtons.push({ ...UI.drawPill(ctx, 'Restart', x + wR / 2, cy, { w: wR }), act: restart }); x += wR + gap;
    uiButtons.push({ ...UI.drawPill(ctx, 'Rules', x + wH / 2, cy, { w: wH }), act: () => { phase = 'menu'; } });
  }
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
  const MENU_SUB = 'Join every pair, and sew every thread into the cloth.';
  // STATE THE RULE THE PLAYER CAN ACT ON.
  //
  // Rule 3 used to be "it has to pass over another thread somewhere, and under
  // another somewhere". True, but the player does not choose over and under —
  // the game works that out. What they choose is the ROUTE, so the rule has to
  // be given in terms of routing: cross two other threads. The over and under
  // then follows on its own, which is what rule 3 now says.
  // FIVE rules, TWO LINES EACH, is the ceiling on a 600px frame. The card
  // measures its contents but its height is clamped to the viewport, so a rule
  // that runs long is not clipped, it is drawn UNDER the PLAY button. Measure
  // before adding one.
  const MENU_RULES = [
    'Drag from a pin to lay its thread across to its twin. Drag again to lay it differently.',
    'Threads are allowed to cross. Other puzzles forbid it, this one needs it.',
    'Every thread must cross at least TWO others. Take the long way round if you have to.',
    'Cross two and it ends up over one and under the other, and that is what sews it in.',
    'Each thread must also pass through its own button.',
  ];
  function menuOverlay() {
    ctx.fillStyle = 'rgba(9,15,26,0.92)'; ctx.fillRect(0, 0, LW, LH);
    const pw = Math.max(260, Math.min(LW - 44, 486));
    let mh = 32 + 50;
    ctx.font = '600 17px Inter, sans-serif';
    mh = wrapText(MENU_SUB, 0, mh, pw - 70, 24, 'center', true) + 16;
    ctx.font = '500 16px Inter, sans-serif';
    for (const r of MENU_RULES) mh = wrapText(r, 0, mh, pw - 96, 22, 'left', true) + 12;
    const ph = Math.min(LH - 28, mh + 22 + UI.CTA.h + 34);
    const px = Math.round((LW - pw) / 2), py = Math.round((LH - ph) / 2);
    ctx.fillStyle = '#16233A'; roundRect(px, py, pw, ph, 24); ctx.fill();
    const g = ctx.createLinearGradient(px + 40, 0, px + pw - 40, 0);
    g.addColorStop(0, 'rgba(255,71,87,0)'); g.addColorStop(0.25, '#FF4757');
    g.addColorStop(0.5, '#FFD93D'); g.addColorStop(0.75, '#4C8DFF'); g.addColorStop(1, 'rgba(76,141,255,0)');
    ctx.fillStyle = g; ctx.fillRect(px + 40, py + 1, pw - 80, 2);
    const cx = LW / 2; let y = py + 32;
    ctx.fillStyle = '#fff'; ctx.font = '800 38px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('WEAVE', cx, y); y += 50;
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = '600 17px Inter, sans-serif';
    y = wrapText(MENU_SUB, cx, y, pw - 70, 24); y += 16;
    const rx = px + 30;
    for (let i = 0; i < MENU_RULES.length; i++) {
      ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.arc(rx + 11, y + 11, 12, 0, 7); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.font = '800 14px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), rx + 11, y + 12);
      ctx.fillStyle = 'rgba(255,255,255,0.90)'; ctx.font = '500 16px Inter, sans-serif';
      y = wrapText(MENU_RULES[i], rx + 34, y, pw - 96, 22, 'left') + 12;
    }
    uiButtons.push({ ...UI.drawCTA(ctx, moves > 0 ? 'RESUME' : 'PLAY', cx, py + ph - 34 - UI.CTA.h / 2, ACCENT), act: () => { phase = 'play'; } });
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }
  function winOverlay(now) {
    const t = Math.max(0, Math.min(1, (now - (wonT + 260)) / 420));
    if (t <= 0) return;
    ctx.globalAlpha = t;
    ctx.fillStyle = 'rgba(10,16,28,0.86)'; ctx.fillRect(0, 0, LW, LH);
    const cx = LW / 2, cy = LH / 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#FFFFFF'; ctx.font = '800 ' + (MODE === 'mobile' ? 38 : 50) + 'px Inter, sans-serif';
    ctx.fillText('PULLED TAUT', cx, cy - 34);
    ctx.fillStyle = 'rgba(255,255,255,0.86)'; ctx.font = '600 20px Inter, sans-serif';
    ctx.fillText('the cloth holds, with ' + crossings.length + ' crossings', cx, cy + 22);
    ctx.textBaseline = 'top';
    uiButtons.push({ ...UI.drawCTA(ctx, 'NEXT LEVEL', cx, cy + 76, ACCENT), act: () => genLevel(level + 1) });
    ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  }

  let lastDraw = 0;
  function frame(t) {
    if (t < animEnd || t - lastDraw >= (REDUCED ? 250 : 28)) { lastDraw = t; draw(t); }
    requestAnimationFrame(frame);
  }

  // ---------- debug handle ----------
  window.__weave = {
    get state() {
      return { level, R, C, mode: MODE, phase, moves, threads: threads.length,
               connected: connected(), crossings: crossings.length, snags: snagCount,
               weaveOK, solved: isSolved(), cellsUsed: cellsUsed(), cells: R * C };
    },
    get geom() {
      return { LW, LH, cell, ox, oy, R, C, boardW: C * cell, boardH: R * cell,
               widthUsed: +(C * cell / LW * 100).toFixed(1) };
    },
    get buttons() { return uiButtons.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })); },
    board() {
      const occ = buildOccupancy(threads), out = [];
      // endpoints of threads that are not drawn yet still have to show, or the
      // map cannot be read back; and a crossing has to name BOTH its threads or
      // its route is unrecoverable.
      const ends = new Map();
      for (const t of threads) { ends.set(t.a, t.id); ends.set(t.b, t.id); }
      for (let r = 0; r < R; r++) {
        const row = [];
        for (let c = 0; c < C; c++) {
          const i = idx(r, c);
          if (occ.h[i] >= 0 && occ.v[i] >= 0) row.push(occ.h[i] + 'x' + occ.v[i]);
          else if (occ.solid[i] >= 0) row.push(ends.has(i) ? '[' + occ.solid[i] + ']' : ' ' + occ.solid[i] + ' ');
          else if (ends.has(i)) row.push('(' + ends.get(i) + ')');
          else if (occ.h[i] >= 0) row.push(' ' + occ.h[i] + '-');
          else if (occ.v[i] >= 0) row.push(' ' + occ.v[i] + '|');
          else row.push(' . ');
        }
        out.push(row.join(' '));
      }
      return out.join('\n') + '\n(N) endpoint not yet joined   [N] endpoint joined   N- N| thread passing   AxB crossing, A over B decided by the weave';
    },
    // the actual routes, which the ASCII can only approximate
    paths() {
      return threads.map((t) => ({
        thread: t.id, colour: SILK[t.colour].name,
        from: [rowOf(t.a), colOf(t.a)], to: [rowOf(t.b), colOf(t.b)],
        button: (buttons.find((b) => b.tid === t.id) || {}).cell !== undefined
          ? [rowOf(buttons.find((b) => b.tid === t.id).cell), colOf(buttons.find((b) => b.tid === t.id).cell)] : null,
        route: t.path ? t.path.map((c) => [rowOf(c), colOf(c)]) : null,
        answer: solution[t.id] ? solution[t.id].map((c) => [rowOf(c), colOf(c)]) : null,
      }));
    },
    solve() {
      threads.forEach((t, i) => { t.path = solution[i] ? solution[i].slice() : null; });
      computeWeave();
      if (isSolved()) { phase = 'won'; wonT = performance.now() - 300; animEnd = performance.now() + 1200; }
      return this.state;
    },
    // lay the recorded answer but stay in play, so the cloth can be looked at
    // without the win overlay sitting on top of it
    preview() {
      threads.forEach((t, i) => { t.path = solution[i] ? solution[i].slice() : null; });
      computeWeave(); phase = 'play'; draw(performance.now());
      return this.state;
    },
    // The exact line the player is shown under the board. Feedback is the thing
    // that failed here, so it has to be checkable rather than eyeballed.
    hint() {
      const loose = looseThreads();
      return { loose: loose.map((i) => SILK[threads[i].colour].name),
               crossingsPerThread: threads.map((t, i) => t.path && t.path.length >= 2 ? crossingsOf(i) : null),
               need: minCross(),
               text: hintText(loose, null, 0) };
    },
    goto(n) { genLevel(n); return this.state; },
    next() { genLevel(level + 1); return this.state; },
    // HOW MUCH WORK IS A FIRST ATTEMPT?
    //
    // The gate says a lazy routing almost never solves. That is necessary but it
    // does not say whether the game is a pleasure or a grind: being wrong once
    // and seeing the fix is a puzzle, being wrong six times with no idea which
    // thread to touch is a chore. So: lay a lazy routing the way a newcomer
    // would, then repair it one thread at a time, and count the repairs.
    fixes(levels, per) {
      const routeFor = (tid, occ, wantButton) => {
        // several candidates, keep the one that crosses most and sews its button
        let best = null, bestScore = -1e9;
        const btn = (buttons.find((b) => b.tid === tid) || {}).cell;
        for (let a = 0; a < 12; a++) {
          const th = threads[tid], target = th.b;
          const key = (c, d) => c * 4 + (d < 0 ? 0 : d);
          const prev = new Map(), q = [];
          for (const d of shuffle([0, 1, 2, 3])) {
            const nx = step(th.a, d);
            if (nx < 0 || (occ.solid[nx] >= 0 && nx !== target)) continue;
            prev.set(key(nx, d), null); q.push([nx, d]);
          }
          let head = 0, goal = null;
          while (head < q.length) {
            const [cur, fd] = q[head++];
            if (cur === target) { goal = [cur, fd]; break; }
            for (const d of shuffle([0, 1, 2, 3])) {
              if (d === ((fd + 2) & 3)) continue;
              if (!cellFree(occ, cur, tid, fd, d)) continue;
              const nx = step(cur, d);
              if (nx < 0 || (occ.solid[nx] >= 0 && nx !== target)) continue;
              const k = key(nx, d);
              if (prev.has(k)) continue;
              prev.set(k, [cur, fd]); q.push([nx, d]);
            }
          }
          if (!goal) continue;
          const path = []; let node = goal;
          while (node) { path.push(node[0]); node = prev.get(key(node[0], node[1])); }
          path.push(th.a); path.reverse();
          if (new Set(path).size !== path.length) continue;
          let x = 0;
          for (let k = 1; k < path.length - 1; k++) {
            const p1 = dirBetween(path[k - 1], path[k]), p2 = dirBetween(path[k], path[k + 1]);
            if (axisOf(p1) !== axisOf(p2)) continue;
            if (axisOf(p2) === 0 ? occ.v[path[k]] >= 0 : occ.h[path[k]] >= 0) x++;
          }
          const sews = (btn === undefined || path.includes(btn)) ? 1 : 0;
          const score = (wantButton ? sews * 100 : 0) + x * 10 - path.length * 0.1;
          if (score > bestScore) { bestScore = score; best = path; }
        }
        return best;
      };
      const keep = level, rows = [];
      for (let L = 1; L <= (levels || 10); L++) {
        const hist = {}; let solvedRuns = 0, gaveUp = 0, n = per || 40, sum = 0;
        for (let k = 0; k < n; k++) {
          genLevel(L, true);
          // the newcomer's first pass: shortest sensible route, weave-blind
          let ok = true;
          for (const tid of shuffle(threads.map((x) => x.id))) {
            const occ = buildOccupancy(threads.filter((x) => x.id !== tid));
            const p = routeFor(tid, occ, false);
            if (!p) { ok = false; break; } threads[tid].path = p;
          }
          if (!ok) continue;
          computeWeave();
          // now repair, one thread at a time, always the most obviously wrong one
          let repairs = 0;
          while (repairs < 12 && !isSolved()) {
            const bad = looseThreads().concat(openButtons().map((b) => b.tid));
            if (!bad.length) break;
            const tid = bad[0];
            const occ = buildOccupancy(threads.filter((x) => x.id !== tid));
            const p = routeFor(tid, occ, true);
            repairs++;
            if (p) threads[tid].path = p;
            computeWeave();
          }
          if (isSolved()) { solvedRuns++; sum += repairs; hist[repairs] = (hist[repairs] || 0) + 1; }
          else gaveUp++;
        }
        rows.push({ level: L, solvedRuns, gaveUp,
                    avgRepairs: solvedRuns ? +(sum / solvedRuns).toFixed(1) : null,
                    spread: hist });
      }
      genLevel(keep, true);
      return rows;
    },
    // THE SAMPLER THAT ACTUALLY WORKS.
    //
    // Routing from scratch almost never lands on a woven-in board, so that gave
    // 29 samples out of 620 and settled nothing. This instead starts from a known
    // good cloth and reroutes ONE thread at a time, which is what a player does
    // when they are nearly there and adjusting. Every routing kept is connected
    // and fully woven in. The only question asked of it is whether the over/under
    // still resolves.
    perturbGate(levels, per) {
      const altRoute = (tid, occ) => {
        const th = threads[tid], target = th.b;
        const key = (c, d) => c * 4 + (d < 0 ? 0 : d);
        const prev = new Map(), q = [];
        for (const d of shuffle([0, 1, 2, 3])) {
          const nx = step(th.a, d);
          if (nx < 0) continue;
          if (occ.solid[nx] >= 0 && nx !== target) continue;
          prev.set(key(nx, d), null); q.push([nx, d]);
        }
        let head = 0, goal = null;
        while (head < q.length) {
          const [cur, fd] = q[head++];
          if (cur === target) { goal = [cur, fd]; break; }
          for (const d of shuffle([0, 1, 2, 3])) {
            if (d === ((fd + 2) & 3)) continue;
            if (!cellFree(occ, cur, tid, fd, d)) continue;
            const nx = step(cur, d);
            if (nx < 0) continue;
            if (occ.solid[nx] >= 0 && nx !== target) continue;
            const k = key(nx, d);
            if (prev.has(k)) continue;
            prev.set(k, [cur, fd]); q.push([nx, d]);
          }
        }
        if (!goal) return null;
        const path = []; let node = goal;
        while (node) { path.push(node[0]); node = prev.get(key(node[0], node[1])); }
        path.push(th.a); path.reverse();
        return new Set(path).size === path.length ? path : null;
      };
      const keep = level, rows = [];
      for (let L = 1; L <= (levels || 8); L++) {
        let samples = 0, snagged = 0, n = per || 60;
        for (let k = 0; k < n; k++) {
          genLevel(L, true);
          threads.forEach((th, i) => { th.path = solution[i] ? solution[i].slice() : null; });
          computeWeave();
          const base = threads.map((th) => th.path.slice());
          for (let rep = 0; rep < 14; rep++) {
            threads.forEach((th, i) => { th.path = base[i].slice(); });
            const tid = rnd(threads.length);
            threads[tid].path = null;
            const occ = buildOccupancy(threads.filter((x) => x.id !== tid));
            const p = altRoute(tid, occ);
            if (!p) { threads[tid].path = base[tid].slice(); continue; }
            threads[tid].path = p;
            computeWeave();
            if (!allConnected() || !allWovenIn()) continue;
            samples++;
            if (!weaveOK) snagged++;
          }
        }
        rows.push({ level: L, wovenInRoutings: samples, snagged,
                    snaggedPct: samples ? +(snagged / samples * 100).toFixed(1) : null });
      }
      genLevel(keep, true);
      return rows;
    },
    // THE SECOND GATE, and the one that settles what this game is.
    //
    // The first gate routed weave-BLIND, and those routings came out sparse: one
    // crossing or so, which cannot close a loop, so alternation could not fail
    // and its 100% meant nothing. This routes like a player who is TRYING to
    // satisfy woven-in — hunting crossings — and then asks, of the routings that
    // actually qualify, how often the cloth still refuses.
    //
    // If alternation never fails here either, the over/under is presentation
    // rather than mechanism, and the rules screen has to stop claiming otherwise.
    denseGate(levels, per) {
      const routeDense = (tid, occ) => {
        // several randomised routes, keep whichever crosses the most
        let best = null, bestX = -1;
        for (let attempt = 0; attempt < 10; attempt++) {
          const th = threads[tid], target = th.b;
          const key = (c, d) => c * 4 + (d < 0 ? 0 : d);
          const prev = new Map(), q = [];
          for (const d of shuffle([0, 1, 2, 3])) {
            const nx = step(th.a, d);
            if (nx < 0) continue;
            if (occ.solid[nx] >= 0 && nx !== target) continue;
            prev.set(key(nx, d), null); q.push([nx, d]);
          }
          let head = 0, goal = null;
          while (head < q.length) {
            const [cur, fd] = q[head++];
            if (cur === target) { goal = [cur, fd]; break; }
            for (const d of shuffle([0, 1, 2, 3])) {
              if (d === ((fd + 2) & 3)) continue;
              if (!cellFree(occ, cur, tid, fd, d)) continue;
              const nx = step(cur, d);
              if (nx < 0) continue;
              if (occ.solid[nx] >= 0 && nx !== target) continue;
              const k = key(nx, d);
              if (prev.has(k)) continue;
              prev.set(k, [cur, fd]); q.push([nx, d]);
            }
          }
          if (!goal) continue;
          const path = []; let node = goal;
          while (node) { path.push(node[0]); node = prev.get(key(node[0], node[1])); }
          path.push(th.a); path.reverse();
          if (new Set(path).size !== path.length) continue;
          let x = 0;
          for (let k = 1; k < path.length - 1; k++) {
            const a = dirBetween(path[k - 1], path[k]), b = dirBetween(path[k], path[k + 1]);
            if (axisOf(a) !== axisOf(b)) continue;
            if (axisOf(b) === 0 ? occ.v[path[k]] >= 0 : occ.h[path[k]] >= 0) x++;
          }
          if (x > bestX) { bestX = x; best = path; }
        }
        return best;
      };
      const keep = level, rows = [];
      for (let L = 1; L <= (levels || 10); L++) {
        let qualified = 0, snagged = 0, tried = 0, n = per || 200;
        for (let k = 0; k < n; k++) {
          genLevel(L, true);
          for (const th of threads) th.path = null;
          let ok = true;
          for (const tid of shuffle(threads.map((x) => x.id))) {
            const occ = buildOccupancy(threads.filter((x) => x.id !== tid));
            const p = routeDense(tid, occ);
            if (!p) { ok = false; break; }
            threads[tid].path = p;
          }
          if (!ok) continue;
          tried++;
          computeWeave();
          if (!allConnected() || !allWovenIn()) continue;
          qualified++;
          if (!weaveOK) snagged++;
        }
        rows.push({ level: L, routed: tried, qualifiedAsWovenIn: qualified,
                    ofThose_snaggedPct: qualified ? Math.round(snagged / qualified * 100) : null,
                    snagged });
      }
      genLevel(keep, true);
      return rows;
    },
    // THE GATE. Weave's whole claim is that inviting crossings and then
    // constraining them with the alternation rule makes a new puzzle. That claim
    // is false if simply connecting the pairs, the way you would in Flow, almost
    // always happens to weave. So: route every pair with a router that knows
    // NOTHING about weaving, and count how often the cloth comes out consistent
    // anyway.
    //
    // A HIGH number is the bad result. It would mean the rule is decoration.
    gate(levels, per) {
      // Breadth first over (cell, arrival direction), which is the state that
      // actually decides what a cell can hold. The earlier depth-first version
      // gave up on most boards, so its numbers were measured on a handful of
      // lucky runs and were not worth anything.
      const routeOne = (tid, occ) => {
        const t = threads[tid], target = t.b;
        const key = (c, d) => c * 4 + (d < 0 ? 0 : d);
        const prev = new Map(), q = [];
        for (const d of shuffle([0, 1, 2, 3])) {
          const nx = step(t.a, d);
          if (nx < 0) continue;
          if (occ.solid[nx] >= 0 && nx !== target) continue;
          prev.set(key(nx, d), null); q.push([nx, d]);
        }
        let head = 0, goal = null;
        while (head < q.length) {
          const [cur, fd] = q[head++];
          if (cur === target) { goal = [cur, fd]; break; }
          for (const d of shuffle([0, 1, 2, 3])) {
            if (d === ((fd + 2) & 3)) continue;               // no doubling back
            if (!cellFree(occ, cur, tid, fd, d)) continue;
            const nx = step(cur, d);
            if (nx < 0) continue;
            if (occ.solid[nx] >= 0 && nx !== target) continue;
            const k = key(nx, d);
            if (prev.has(k)) continue;
            prev.set(k, [cur, fd]); q.push([nx, d]);
          }
        }
        if (!goal) return null;
        const path = []; let node = goal;
        while (node) { path.push(node[0]); node = prev.get(key(node[0], node[1])); }
        path.push(t.a); path.reverse();
        // reject any path that revisits a cell, which BFS over (cell,dir) can do
        return new Set(path).size === path.length ? path : null;
      };
      const routeRandom = () => {
        for (const t of threads) t.path = null;
        for (const tid of shuffle(threads.map((t) => t.id))) {
          const occ = buildOccupancy(threads.filter((x) => x.id !== tid));
          const p = routeOne(tid, occ);
          if (!p) return null;
          threads[tid].path = p;
        }
        return true;
      };
      const keep = level, rows = [];
      for (let L = 1; L <= (levels || 10); L++) {
        let solvedAnyway = 0, alternationOK = 0, wovenOK = 0, sewnOK = 0, routed = 0, n = per || 30, crossSum = 0, looseSum = 0;
        for (let k = 0; k < n; k++) {
          genLevel(L, true);
          if (!routeRandom()) continue;
          routed++;
          computeWeave();
          crossSum += crossings.length;
          const loose = looseThreads().length;
          looseSum += loose;
          const sewn = allSewn();
          if (sewn) sewnOK++;
          if (weaveOK) alternationOK++;
          if (loose === 0) wovenOK++;
          if (weaveOK && loose === 0 && sewn && allConnected()) solvedAnyway++;
        }
        const pc = (v) => routed ? Math.round(v / routed * 100) : null;
        rows.push({ level: L, routed,
                    solvedAnywayPct: pc(solvedAnyway),      // the gate number
                    alternationHeldPct: pc(alternationOK),  // the old, weak rule alone
                    allWovenInPct: pc(wovenOK),             // the new rule alone
                    buttonsSewnPct: pc(sewnOK),             // the waypoint rule alone
                    avgCrossings: routed ? +(crossSum / routed).toFixed(1) : 0,
                    avgLooseThreads: routed ? +(looseSum / routed).toFixed(1) : 0 });
      }
      genLevel(keep, true);
      return rows;
    },
    audit(levels, per) {
      const keep = level, bad = [];
      let cross = 0, thr = 0, cnt = 0, fill = 0;
      for (let L = 1; L <= (levels || 12); L++) for (let k = 0; k < (per || 20); k++) {
        genLevel(L, true);
        const before = this.state;
        if (before.threads < 3) bad.push({ level: L, why: 'fewer than three threads' });
        if (before.connected !== 0) bad.push({ level: L, why: 'served with threads already drawn' });
        this.solve();
        const s = this.state;
        if (!s.solved) bad.push({ level: L, why: 'the recorded answer does not solve' });
        cross += s.crossings; thr += s.threads; fill += s.cellsUsed / s.cells; cnt++;
      }
      genLevel(keep, true);
      return { boards: cnt, failures: bad.length, examples: bad.slice(0, 6),
               avgCrossings: +(cross / cnt).toFixed(2), avgThreads: +(thr / cnt).toFixed(2),
               avgGridFill: +(fill / cnt * 100).toFixed(1) + '%' };
    },
  };

  // ---------- boot ----------
  setCanvasVars(); resizeCanvas(); fitFullscreen(); resizeCanvas();
  genLevel(loadLevel(), true);
  requestAnimationFrame(frame);
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
})();
