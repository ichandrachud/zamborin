/* ============================================================
   Orbit · a Zamborin Game (prototype v1)

   Concentric rings of broken arc-track. Light leaves the hub at the
   centre and travels only along track that lines up. Spin each ring
   (drag it, or tap to nudge one step clockwise) until every bulb on
   the rim is lit — the paths resolve into a symmetric mandala.

   HOW A LEVEL IS BUILT
   The board is a polar grid: K rings × S sectors. A node sits at each
   (ring, sector); it can carry an arc to its neighbour round the ring,
   a half-spoke inward and a half-spoke outward. Two rings are joined
   where an outward half-spoke and an inward half-spoke sit at the same
   absolute angle — that is what rotating a ring changes.

   To guarantee the solved board is m-fold symmetric, a level is designed
   on only P = S/m sectors — one period — and then repeated m times round
   the circle. Within that period the light is routed outward layer by
   layer (see buildPattern), which yields a tree whose every leaf is a
   bulb. Finally the ring offsets are scrambled, which is why a solution
   always exists: offsets of all-zero is the board we just drew.
   ============================================================ */
(() => {
  'use strict';

  let LW = 620, LH = 700;              // logical canvas size (px) — set per mode at load
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const BG_TOP = '#1B2A47', BG_MID = '#131F36', BG_BOT = '#0E1726';
  // Dim track is #5a6b88 for 3.3:1 against the darkest background — AA for
  // graphical objects. Do not darken it back toward Bloom's pipe grey.
  const DIM = '#5a6b88', DIM_LINE = '#2b3750';
  const LIT = '#FFC65C', LIT_LINE = '#8a5c14', LIT_HALO = 'rgba(255,198,92,0.15)';
  const HUB_CORE = '#FFF1D0';
  const BULB_DUR = 420, SNAP = 16;      // bulb switch-on ms; ring snap stiffness
  const LINK = '#5FD3C0';              // geared-ring guide colour
  // A joint carries light only while its ring sits within this fraction of one
  // sector of exact alignment. Keying off the NEAREST sector instead (the old
  // behaviour) lit a ring that was visibly half a sector out of true.
  const ALIGN_TOL = 0.05;

  // ---------- MODE + CANVAS ----------
  // Mobile: the logical canvas IS the viewport (measured px — the shared CSS
  // min(100vw, calc(100dvh…)) under-sizes on iOS and yields a narrow strip).
  // ?mode=desktop / ?mode=mobile forces a layout for testing (touch-capable
  // browsers report a coarse pointer even on a big screen, so the desktop card
  // is otherwise hard to see).
  const forcedMode = new URLSearchParams(location.search).get('mode');
  const MODE = (forcedMode === 'desktop' || forcedMode === 'mobile') ? forcedMode
    : (matchMedia('(pointer: coarse)').matches || window.innerWidth < 768) ? 'mobile' : 'desktop';
  const HAS_HOVER = matchMedia('(hover: hover)').matches;
  document.body.classList.add('mode-' + MODE);
  function setCanvasVars() {
    if (MODE === 'mobile') { LW = window.innerWidth || 390; LH = window.innerHeight || 700; }
    else { LW = 620; LH = 700; }
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
    const active = document.body.classList.contains('focus-mode');
    // Hand sizing back to chrome.css (--canvas-w / --canvas-h) when not focused.
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
  let S = 12, M = 3, P = 4, K = 3, STEP = Math.PI * 2 / S;
  let arcs = [], sIn = [], sOut = [];   // per ring, length-S flags in RING-LOCAL index
  let hubSpk = [], bulbs = [];           // length-S flags in ABSOLUTE index (these never rotate)
  let off = [], visAng = [], targAng = [];
  let nodeLit = [], bulbLit = [], bulbT = [], alignOK = [];
  let linkOf = [], nLinks = 0;          // linkOf[k] = geared partner ring, or -1
  let specOverride = null;              // debug: forces a board shape
  let level = 1, moves = 0, phase = 'menu';   // phase: menu | play | won
  let history = [], initOff = [], uiButtons = [], hoverRing = -1, drag = null;
  let raf = 0, fb = 0, lastT = 0, wonT = -1e9;
  let par = 0, award = null;            // par turns for this board; last level's breakdown
  let score = { total: 0, cleared: 0, best: 0 };
  const LS = 'zamborin-orbit.level', LS_SCORE = 'zamborin-orbit.score';
  function saveLevel(n) { try { localStorage.setItem(LS, String(n === undefined ? level : n)); } catch (e) {} }
  function loadLevel() { try { const v = parseInt(localStorage.getItem(LS), 10); return (v >= 1 && v <= 999) ? v : 1; } catch (e) { return 1; } }
  function saveScore() { try { localStorage.setItem(LS_SCORE, JSON.stringify(score)); } catch (e) {} }
  function loadScore() {
    try {
      const v = JSON.parse(localStorage.getItem(LS_SCORE) || '{}');
      const n = (x) => (typeof x === 'number' && isFinite(x) && x >= 0) ? Math.floor(x) : 0;
      return { total: n(v.total), cleared: n(v.cleared), best: n(v.best) };
    } catch (e) { return { total: 0, cleared: 0, best: 0 }; }
  }
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // absolute ↔ ring-local sector index
  const abs = (k, s) => (s + off[k]) % S;
  const loc = (k, a) => ((a - off[k]) % S + S) % S;

  // ---------- geometry ----------
  const A0 = -Math.PI / 2;              // sector 0 sits at 12 o'clock
  let BOARD = 0, CX = 0, CY = 0, ctrlY = 0;
  let hubR = 0, bulbR = 0, track = 4;
  let ringR = [], jIn = [], jOut = [];  // jOut[k] === jIn[k+1]: where the two half-spokes meet
  const TOP_BAND = 100, BOT_BAND = 96;
  const SIDE_PAD = () => (MODE === 'mobile' ? 16 : 30);

  let topB = TOP_BAND, botB = BOT_BAND;
  function layout() {
    // The HUD bands shrink on short viewports (landscape phone, small window) so
    // the board keeps what room there is. The floors matter: a browser can report
    // a 0×0 viewport for the first frame, which otherwise gives a negative radius.
    const bs = Math.max(0.5, Math.min(1, LH / 700));
    topB = TOP_BAND * bs; botB = BOT_BAND * bs;
    const ctrlH = 60 * bs;
    const availW = Math.max(140, LW - SIDE_PAD() * 2);
    const availH = Math.max(140, LH - topB - botB);
    BOARD = Math.max(50, Math.floor(Math.min(availW, availH - ctrlH) / 2));
    const compH = BOARD * 2 + ctrlH;                    // board + the control row beneath it
    const top = topB + Math.max(0, (availH - compH) / 2);
    CX = LW / 2; CY = top + BOARD; ctrlY = top + BOARD * 2 + ctrlH * 0.63;

    hubR = BOARD * 0.10; bulbR = BOARD * 0.96;
    const inner = BOARD * 0.30, outer = BOARD * 0.86;
    ringR = [];
    for (let k = 0; k < K; k++) ringR[k] = K === 1 ? (inner + outer) / 2 : inner + (outer - inner) * k / (K - 1);
    jIn = []; jOut = [];
    for (let k = 0; k < K; k++) {
      jIn[k] = k === 0 ? (hubR + ringR[0]) / 2 : (ringR[k - 1] + ringR[k]) / 2;
      jOut[k] = k === K - 1 ? (ringR[K - 1] + bulbR) / 2 : (ringR[k] + ringR[k + 1]) / 2;
    }
    const gap = K > 1 ? ringR[1] - ringR[0] : BOARD * 0.3;
    track = Math.max(3, Math.min(BOARD * 0.034, gap * 0.30));
  }
  const angOf = (k, s) => A0 + s * STEP + visAng[k];    // a ring's node, in board space
  const angAbs = (a) => A0 + a * STEP;                  // hub spokes and bulbs: fixed
  // Which ring does this radius belong to? Bands run halfway to each neighbour;
  // the inner and outer bands are stretched so there is no dead zone to miss.
  function ringAt(rad) {
    if (rad < hubR * 1.05) return -1;
    for (let k = 0; k < K; k++) {
      const lo = k === 0 ? hubR * 1.05 : (ringR[k - 1] + ringR[k]) / 2;
      const hi = k === K - 1 ? BOARD * 1.4 : (ringR[k] + ringR[k + 1]) / 2;
      if (rad >= lo && rad < hi) return k;
    }
    return -1;
  }

  // ---------- light flood ----------
  // off[] is DERIVED from the rendered angle, so the logic can never claim a
  // joint the picture does not show. alignOK[] is the 95%-of-true test.
  function syncOffsets() {
    for (let k = 0; k < K; k++) {
      const t = visAng[k] / STEP, n = Math.round(t);
      off[k] = ((n % S) + S) % S;
      alignOK[k] = Math.abs(t - n) <= ALIGN_TOL;
    }
  }
  function inJoined(k, s) {
    if (!sIn[k][s] || !alignOK[k]) return false;
    const a = abs(k, s);
    return k > 0 ? (alignOK[k - 1] && !!sOut[k - 1][loc(k - 1, a)]) : !!hubSpk[a];
  }
  function outJoined(k, s) {
    if (!sOut[k][s] || !alignOK[k]) return false;
    const a = abs(k, s);
    return k + 1 < K ? (alignOK[k + 1] && !!sIn[k + 1][loc(k + 1, a)]) : !!bulbs[a];
  }

  function computeLit(now) {
    syncOffsets();
    const was = bulbLit.slice();
    nodeLit = Array.from({ length: K }, () => new Array(S).fill(false));
    bulbLit = new Array(S).fill(false);
    const q = [];
    for (let a = 0; a < S; a++) {                       // hub pushes light into ring 0
      if (!hubSpk[a] || !alignOK[0]) continue;
      const s = loc(0, a);
      if (sIn[0][s] && !nodeLit[0][s]) { nodeLit[0][s] = true; q.push(0, s); }
    }
    while (q.length) {
      const s = q.pop(), k = q.pop();
      const nx = (s + 1) % S, pv = (s - 1 + S) % S;
      // arcs belong to the ring, so they stay joined however it is turned
      if (arcs[k][s] && !nodeLit[k][nx]) { nodeLit[k][nx] = true; q.push(k, nx); }
      if (arcs[k][pv] && !nodeLit[k][pv]) { nodeLit[k][pv] = true; q.push(k, pv); }
      if (sOut[k][s]) {
        const a = abs(k, s);
        if (k + 1 < K) { const t = loc(k + 1, a); if (alignOK[k + 1] && sIn[k + 1][t] && !nodeLit[k + 1][t]) { nodeLit[k + 1][t] = true; q.push(k + 1, t); } }
        else if (bulbs[a]) bulbLit[a] = true;
      }
      if (sIn[k][s] && k > 0) {
        const a = abs(k, s), t = loc(k - 1, a);
        if (alignOK[k - 1] && sOut[k - 1][t] && !nodeLit[k - 1][t]) { nodeLit[k - 1][t] = true; q.push(k - 1, t); }
      }
    }
    const t = now || performance.now();
    for (let a = 0; a < S; a++) { if (bulbLit[a] && !was[a]) bulbT[a] = t; else if (!bulbLit[a]) bulbT[a] = -1e9; }
  }
  function bulbCount() { let n = 0, t = 0; for (let a = 0; a < S; a++) if (bulbs[a]) { t++; if (bulbLit[a]) n++; } return [n, t]; }

  // ---------- generation ----------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // DIFFICULTY RAMP — ordered by measurement, not by eye. The probe in
  // __orbit.greedySolvable() asks whether a board falls to the obvious tactic:
  // fix each ring in turn from the hub outward, always taking whichever
  // rotation lights the most. A board that survives that needs real planning.
  // Measured over 100 boards per level, the tactic succeeds:
  //   L1-2  100%      tutorial, it always works
  //   L3-5  ~76%      geared pairs arrive
  //   L6-8  ~30%      P jumps to 6, 8, 10
  //   L9-11 ~20-26%   gears off, five free rings at full size
  // Ordering WITHIN a tier is inside the ±5% noise of the probe, so the tiers
  // are the real ramp; the level order inside one is for variety.
  // S stops at 20: S=24 measured no harder (30% vs 27%) and is the densest,
  // least readable board on a phone, so it is cost without benefit.
  //
  // P (rotations per ring) turned out to be the real lever, NOT the number of
  // geared pairs: gearing fuses two rings into one control, so a second pair
  // costs a whole degree of freedom and measured EASIER than the board it
  // replaced. One pair is kept throughout as a twist that stops any ring being
  // settled in isolation; the ramp itself is driven by P and ring count.
  function levelSpec(lvl) {
    const T = [
      { S: 12, m: 4, K: 3, links: 0 },   //  1 · P=3  · learn the mechanic
      { S: 12, m: 3, K: 3, links: 0 },   //  2 · P=4
      { S: 12, m: 3, K: 4, links: 1 },   //  3 · P=4  · gears introduced
      { S: 16, m: 4, K: 5, links: 1 },   //  4 · P=4
      { S: 20, m: 4, K: 5, links: 1 },   //  5 · P=5
      { S: 18, m: 3, K: 5, links: 1 },   //  6 · P=6
      { S: 16, m: 2, K: 5, links: 1 },   //  7 · P=8
      { S: 20, m: 2, K: 5, links: 1 },   //  8 · P=10
      { S: 18, m: 3, K: 5, links: 0 },   //  9 · gears off — five free rings
      { S: 16, m: 2, K: 5, links: 0 },   // 10 · P=8
      { S: 20, m: 2, K: 5, links: 0 },   // 11 · P=10 · 100000 alignments
    ];
    if (lvl <= T.length) return T[lvl - 1];
    return [T[10], T[9], T[7]][lvl % 3];     // cycle the hardest, geared and not
  }

  // Gear up adjacent rings — neighbours read as meshed far better than distant
  // pairs. Each ring joins at most one pair.
  function buildLinks(want) {
    linkOf = new Array(K).fill(-1); nLinks = 0;
    const pairs = [];
    for (let k = 0; k + 1 < K; k++) pairs.push(k);
    for (let i = pairs.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[pairs[i], pairs[j]] = [pairs[j], pairs[i]]; }
    for (const k of pairs) {
      if (nLinks >= want) break;
      if (linkOf[k] >= 0 || linkOf[k + 1] >= 0) continue;
      linkOf[k] = k + 1; linkOf[k + 1] = k; nLinks++;
    }
  }
  // Independent controls: a free ring is one, a geared pair is one (turning
  // either member fixes the other), so the reachable space is P^dofs.
  function dofList() {
    const seen = new Array(K).fill(false), out = [];
    for (let k = 0; k < K; k++) {
      if (seen[k]) continue;
      seen[k] = true;
      const p = linkOf[k];
      if (p >= 0) { seen[p] = true; out.push([k, p]); } else out.push([k]);
    }
    return out;
  }

  // Residues spaced roughly evenly round the period, at a random rotation.
  function spread(n) {
    const start = (Math.random() * P) | 0, out = new Set();
    for (let i = 0; i < n; i++) out.add((start + Math.round(i * P / n)) % P);
    return [...out];
  }

  // One attempt at a solved, m-fold-symmetric board, routed layer by layer:
  // light leaves the hub at a few residues, each ring carries it round an
  // arc-run and hands it outward at one or two staggered residues, and whatever
  // leaves the last ring becomes a bulb. Runs within a ring are laid out so they
  // can never touch, so the result is a tree whose every leaf is already a bulb —
  // no dead-end track to prune, and every ring gets real angular structure.
  // Returns false if a board came out mostly radial, which is worth a retry.
  function buildPattern() {
    const nh = clamp(Math.floor(P / 3), 1, 2);          // hub spokes, per period
    const nbT = clamp(Math.round(P * 0.55), 2, P - 1);  // bulb target — never all P, or the
    arcs = Array.from({ length: K }, () => new Array(S).fill(0));   // rim would stop constraining
    sIn = Array.from({ length: K }, () => new Array(S).fill(0));
    sOut = Array.from({ length: K }, () => new Array(S).fill(0));
    hubSpk = new Array(S).fill(0); bulbs = new Array(S).fill(0);
    const lift = (arr, r) => { for (let s = ((r % P) + P) % P; s < S; s += P) arr[s] = 1; };

    let entries = spread(nh), ringsWithArc = 0;
    for (const r of entries) { lift(hubSpk, r); lift(sIn[0], r); }

    for (let k = 0; k < K; k++) {
      const dir = Math.random() < 0.5 ? 1 : -1;         // whole ring swirls one way
      const ord = entries.slice().sort((a, b) => a - b);
      const n = ord.length, runs = [];
      let hasArc = false;
      for (let i = 0; i < n; i++) {
        const e = ord[i];
        // A run may reach at most one residue short of the next entry along dir,
        // so two runs in the same ring never merge (which would close a loop).
        let gap = P;
        if (n > 1) {
          const nxt = dir === 1 ? ord[(i + 1) % n] : ord[(i - 1 + n) % n];
          gap = ((((dir === 1 ? nxt - e : e - nxt)) % P) + P) % P;
        }
        const maxLen = Math.max(0, gap - 1);
        let L = maxLen === 0 ? 0 : 1 + ((Math.random() * maxLen) | 0);
        if (maxLen > 1 && Math.random() < 0.28) L = 1;  // keep some runs short, for variety
        const cells = [e];
        for (let j = 1; j <= L; j++) cells.push((((e + dir * j) % P) + P) % P);
        // arcs[k][r] joins residue r to r+1, so a backward step is indexed by its far end
        for (let j = 0; j < L; j++) lift(arcs[k], dir === 1 ? cells[j] : cells[j + 1]);
        if (L > 0) hasArc = true;
        runs.push(cells);
      }
      if (hasArc) ringsWithArc++;

      // Every run must hand light onward or it dead-ends; the extra exits are
      // where the tree branches, enough of them to grow toward the bulb target.
      const capacity = runs.reduce((a, r) => a + r.length, 0);
      let desired = clamp(Math.round(nh + (nbT - nh) * (k + 1) / K), 1, P - 1);
      desired = Math.max(n, Math.min(desired, capacity, P - 1));
      // The far end of a run is ALWAYS an exit. Pick it anywhere else and the arc
      // beyond it leads nowhere — a lit stub hanging in space.
      const exits = runs.map(r => [r[r.length - 1]]);
      let guard = 60;
      while (exits.reduce((a, e) => a + e.length, 0) < desired && guard-- > 0) {
        const i = (Math.random() * runs.length) | 0;
        const free = runs[i].filter(c => !exits[i].includes(c));
        if (!free.length) continue;
        exits[i].push(free[(Math.random() * free.length) | 0]);
      }
      const flat = exits.flat();                        // runs are disjoint, so these are distinct
      if (k + 1 < K) for (const r of flat) { lift(sOut[k], r); lift(sIn[k + 1], r); }
      else for (const r of flat) { lift(sOut[k], r); lift(bulbs, r); }
      entries = flat;
    }
    return ringsWithArc >= Math.max(1, K - 1);
  }

  function genLevel(lvl, asMenu) {
    level = clamp(lvl, 1, 999); saveLevel();
    const spec = specOverride || levelSpec(level);
    S = spec.S; M = spec.m; K = spec.K; P = S / M; STEP = Math.PI * 2 / S;
    buildLinks(spec.links || 0);

    let ok = false;
    off = new Array(K).fill(0);            // sized for THIS level before anything reads it
    alignOK = new Array(K).fill(true);
    visAng = new Array(K).fill(0); targAng = new Array(K).fill(0);
    for (let attempt = 0; attempt < 30 && !ok; attempt++) {
      if (!buildPattern()) continue;
      visAng = new Array(K).fill(0);                   // every ring in true IS the solved board…
      computeLit();
      const [w, t] = bulbCount();
      ok = t > 0 && w === t;                           // …so verify that before trusting it
    }

    // Scramble by applying LEGAL moves to the solved board, one per independent
    // control. Setting ring offsets directly would strand geared levels in
    // states no sequence of moves can undo: turning a pair moves one member +d
    // and the other -d, so their sum is invariant and most offset combinations
    // are simply unreachable. Every control gets a rotation that is non-zero
    // mod P, so no ring starts already in true.
    const dofs = dofList();
    for (let attempt = 0; attempt < 20; attempt++) {
      off = new Array(K).fill(0);
      par = 0;
      for (const d of dofs) {
        const turn = P * ((Math.random() * M) | 0);                // whole periods: visual only, no-op logically
        const amt = turn + 1 + ((Math.random() * (P - 1)) | 0);
        // PAR: the cheapest way back. A turn costs one per sector moved, and a
        // drag runs either way, so undoing a scramble of `a` steps costs
        // min(a, P-a). Known exactly because we built the scramble ourselves.
        const a = ((amt % P) + P) % P;
        par += Math.min(a, P - a);
        off[d[0]] = ((off[d[0]] + amt) % S + S) % S;
        if (d.length > 1) off[d[1]] = ((off[d[1]] - amt) % S + S) % S;
      }
      visAng = off.map(o => o * STEP);
      computeLit();
      const [w, t] = bulbCount();
      if (w <= t * 0.5) break;                                     // leave most of the board dark to start
    }

    initOff = off.slice();
    visAng = off.map(o => o * STEP); targAng = visAng.slice();
    bulbT = new Array(S).fill(-1e9);
    moves = 0; history = []; wonT = -1e9; drag = null; hoverRing = -1;
    phase = asMenu ? 'menu' : 'play';
    layout(); computeLit(); render(performance.now());
  }
  function restart() {
    if (phase === 'won') return;          // the level is already scored — no replaying it
    off = initOff.slice(); visAng = off.map(o => o * STEP); targAng = visAng.slice();
    moves = 0; history = []; phase = 'play'; wonT = -1e9; bulbT = new Array(S).fill(-1e9);
    computeLit(); ensureAnim();
  }

  // ---------- rotation ----------
  // Only the TARGET angle moves here. off[] and the light follow the rendered
  // angle as it eases across, so the board lights up as the ring settles into
  // true rather than the instant a move is requested.
  function applyDelta(k, d, count) {
    if (!d) return;
    targAng[k] += d * STEP;
    const p = linkOf[k];
    if (p >= 0) targAng[p] -= d * STEP;            // meshed: the partner turns the other way
    if (count) { moves += Math.abs(d); history.push({ k, d }); if (history.length > 400) history.shift(); }
    ensureAnim();
  }
  // Deeper levels are worth more; the rest is how close to par you finished.
  // Base tracks LEVEL rather than board shape — the ramp is already ordered by
  // difficulty, and scoring off shape inverted (a geared level 8 outscored the
  // harder ungeared level 11, because the gear bonus beat the shape gap).
  // Capped at 25 so a long session cannot inflate away everything before it.
  // Beating par is possible when a board has an alternate alignment cheaper than
  // the one it was scrambled from — that stays a bonus, never a penalty.
  function scoreLevel() {
    const base = 120 + 30 * Math.min(level, 25);
    // FLAT, not a percentage. As a percentage it grew with base and eventually
    // exceeded the per-level step, so a geared level outscored the harder
    // ungeared one after it. 40 stays under the step (30 base + 22 par bonus).
    const gearBonus = nLinks > 0 ? 40 : 0;
    const eff = par > 0 ? Math.min(1, par / Math.max(moves, par)) : 1;
    const parBonus = Math.round(base * 0.75 * eff);
    return { base, parBonus, gearBonus, levelScore: base + parBonus + gearBonus, turns: moves, par };
  }
  function checkWin() {
    if (phase !== 'play') return;
    const [w, t] = bulbCount();
    if (w === t && t > 0) {
      phase = 'won'; wonT = performance.now();      // phase guard above means this banks exactly once
      award = scoreLevel();
      score.total += award.levelScore;
      score.cleared += 1;
      score.best = Math.max(score.best, award.levelScore);
      saveScore();
      // Bank the NEXT level straight away, so reloading on the scorecard carries
      // on rather than replaying a board that has already been scored.
      saveLevel(level + 1);
    }
  }
  function undo() {
    if (!history.length || phase !== 'play') return;
    const h = history.pop();
    targAng[h.k] -= h.d * STEP;
    const p = linkOf[h.k];
    if (p >= 0) targAng[p] += h.d * STEP;
    moves += Math.abs(h.d);
    ensureAnim();
  }

  // ---------- animation ----------
  function animating(now) {
    if (drag) return true;
    for (let k = 0; k < K; k++) if (Math.abs(targAng[k] - visAng[k]) > 1e-3) return true;
    if (phase === 'won') return true;
    for (let a = 0; a < S; a++) if (bulbLit[a] && now - bulbT[a] < BULB_DUR) return true;
    return false;
  }
  // Moves are carried by the rendered angle, so if rAF never fires the rings
  // would never actually turn. This timer finishes any pending move without it
  // — no animation, but the game still plays in a throttled webview.
  function settle() {
    let moved = false;
    for (let k = 0; k < K; k++) if (visAng[k] !== targAng[k]) { visAng[k] = targAng[k]; moved = true; }
    if (moved) { computeLit(); checkWin(); render(performance.now()); }
  }
  function ensureAnim() {
    if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(tick); }
    clearTimeout(fb); fb = setTimeout(settle, 500);
  }
  function tick(t) {
    clearTimeout(fb);
    const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
    const f = Math.min(1, dt * SNAP);
    for (let k = 0; k < K; k++) {
      const d = targAng[k] - visAng[k];
      visAng[k] = Math.abs(d) < 1e-4 ? targAng[k] : visAng[k] + d * f;
    }
    // Recompute every frame: the light is a function of where the rings ACTUALLY
    // are, so it drops out mid-turn and returns only as a ring settles into true.
    computeLit(t);
    checkWin();
    render(t);
    if (animating(t)) { raf = requestAnimationFrame(tick); fb = setTimeout(settle, 500); }
    else raf = 0;
  }

  // ---------- input ----------
  function toLogical(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX ?? e.changedTouches?.[0]?.clientX;
    const cy = e.clientY ?? e.changedTouches?.[0]?.clientY;
    return { x: (cx - rect.left) * (LW / rect.width), y: (cy - rect.top) * (LH / rect.height) };
  }
  const hitBtn = (x, y) => uiButtons.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  let pendingBtn = null;

  function onDown(e) {
    const { x, y } = toLogical(e);
    pendingBtn = hitBtn(x, y);
    if (pendingBtn || phase !== 'play') return;
    const dx = x - CX, dy = y - CY, k = ringAt(Math.hypot(dx, dy));
    if (k < 0) return;
    try { canvas.setPointerCapture?.(e.pointerId); } catch (err) { /* pointer already gone */ }
    const pk = linkOf[k];
    drag = { k, p: pk, prev: Math.atan2(dy, dx), start: visAng[k], startP: pk >= 0 ? visAng[pk] : 0, moved: false };
    hoverRing = k;
    ensureAnim();
  }
  function onMove(e) {
    const { x, y } = toLogical(e);
    if (!drag) {
      const k = phase === 'play' ? ringAt(Math.hypot(x - CX, y - CY)) : -1;
      if (k !== hoverRing) { hoverRing = k; render(performance.now()); }
      return;
    }
    let a = Math.atan2(y - CY, x - CX), d = a - drag.prev;
    while (d > Math.PI) d -= Math.PI * 2;               // unwrap across the ±π seam
    while (d < -Math.PI) d += Math.PI * 2;
    drag.prev = a;
    const k = drag.k, p = linkOf[k];
    visAng[k] += d; targAng[k] = visAng[k];
    if (p >= 0) { visAng[p] -= d; targAng[p] = visAng[p]; }   // drag one, watch its partner counter-turn
    if (Math.abs(visAng[k] - drag.start) > STEP * 0.28) drag.moved = true;
    // tick() also does this, but recompute here so a drag still gives feedback
    // if rAF is being throttled (embedded webviews, background tabs).
    const now = performance.now();
    computeLit(now); render(now);
  }
  // Ends a gesture. A ring is ALWAYS left on an exact sector — stranded between
  // two, nothing downstream can light and the board looks broken. `commit` is
  // false when the system stole the gesture (pointercancel), where the right
  // answer is to put the ring back where the player found it.
  function finishDrag(commit) {
    if (!drag) return;
    const { k, p, moved, start, startP } = drag;
    drag = null;
    if (moved && commit) {                             // snap every ring the gesture moved
      const steps = Math.round(visAng[k] / STEP);
      const d = steps - Math.round(start / STEP);
      targAng[k] = steps * STEP;
      if (p >= 0) targAng[p] = Math.round(visAng[p] / STEP) * STEP;
      if (d) { moves += Math.abs(d); history.push({ k, d }); }
    } else {
      visAng[k] = start; targAng[k] = start;           // rewind
      if (p >= 0) { visAng[p] = startP; targAng[p] = startP; }
      if (commit) applyDelta(k, 1, true);              // a tap: nudge one step clockwise
    }
    // Touch has no hover, so nothing would ever clear the highlight and the band
    // would sit there lit after the finger lifts.
    if (!HAS_HOVER) hoverRing = -1;
    ensureAnim();
  }
  function onUp(e) {
    const { x, y } = toLogical(e);
    if (pendingBtn) { const b = hitBtn(x, y); if (b === pendingBtn) b.act(); pendingBtn = null; return; }
    if (drag) { finishDrag(true); return; }
    if (phase === 'menu') { phase = 'play'; render(performance.now()); return; }
    // Once won, only the scorecard's own button moves on — a stray tap should
    // not skip past the breakdown.
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', () => { finishDrag(false); pendingBtn = null; });
  canvas.addEventListener('pointerleave', () => { if (hoverRing !== -1 && !drag) { hoverRing = -1; render(performance.now()); } });
  canvas.addEventListener('wheel', (e) => {            // desktop: rings behave like dials
    if (phase !== 'play') return;
    const { x, y } = toLogical(e);
    const k = ringAt(Math.hypot(x - CX, y - CY));
    if (k < 0) return;
    e.preventDefault();
    applyDelta(k, e.deltaY > 0 ? 1 : -1, true);
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'z' || e.key === 'Z') return undo();
    if (e.key === 'r' || e.key === 'R') return restart();
    if (phase !== 'play' || hoverRing < 0) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); applyDelta(hoverRing, 1, true); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); applyDelta(hoverRing, -1, true); }
  });

  // ---------- render ----------
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function easeBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function roundRect(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  const P2 = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
  function seg(r0, r1, a) { const c = Math.cos(a), s = Math.sin(a); ctx.moveTo(r0 * c, r0 * s); ctx.lineTo(r1 * c, r1 * s); }

  function render(now) {
    ctx.clearRect(0, 0, LW, LH);
    const bg = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
    bg.addColorStop(0, BG_TOP); bg.addColorStop(0.6, BG_MID); bg.addColorStop(1, BG_BOT);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);
    uiButtons = [];

    ctx.save();
    ctx.translate(CX, CY);
    if (phase === 'won') ctx.rotate(Math.max(0, (now - wonT - 300) / 1000) * 0.09);   // the solved mandala drifts
    drawGuides();
    drawTracks(false);
    drawTracks(true);
    drawHub(now);
    drawBulbs(now);
    ctx.restore();

    drawHUD(now);
    if (phase === 'play') drawControls();
    if (phase === 'won') winOverlay(now);
    if (phase === 'menu') menuOverlay();
  }

  function bandOf(k) {
    return [k === 0 ? hubR * 1.05 : (ringR[k - 1] + ringR[k]) / 2,
    k === K - 1 ? bulbR * 0.99 : (ringR[k] + ringR[k + 1]) / 2];
  }
  function drawGuides() {
    // Highlight the ring you are about to move — and its geared partner, so the
    // coupling is obvious before you commit to a turn.
    if (hoverRing >= 0 && phase === 'play') {
      const hi = [hoverRing];
      if (linkOf[hoverRing] >= 0) hi.push(linkOf[hoverRing]);
      // Drawn as a THICK STROKED CIRCLE, not an even-odd filled annulus. The
      // annulus used two arcs swept past 2π, and the overlap left a visible
      // wedge seam across the band.
      for (const k of hi) {
        const [lo, up] = bandOf(k);
        ctx.beginPath(); ctx.arc(0, 0, (lo + up) / 2, 0, Math.PI * 2);
        ctx.lineWidth = up - lo;
        ctx.strokeStyle = linkOf[k] >= 0 ? 'rgba(95,211,192,0.085)' : 'rgba(255,255,255,0.05)';
        ctx.stroke();
      }
    }
    ctx.lineWidth = 1;
    for (let k = 0; k < K; k++) {
      const geared = linkOf[k] >= 0;
      ctx.setLineDash(geared ? [5, 6] : []);            // dashed teal reads as "meshed"
      ctx.strokeStyle = geared ? 'rgba(95,211,192,0.55)' : 'rgba(255,255,255,0.055)';
      ctx.beginPath(); ctx.arc(0, 0, ringR[k], 0, 7); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // One pass builds a single path from every piece, so the whole board is two
  // strokes: base (all track) then lit (the live ones) painted over the top.
  function drawTracks(litOnly) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let k = 0; k < K; k++) {
      for (let s = 0; s < S; s++) {
        if (arcs[k][s] && (!litOnly || (nodeLit[k][s] && nodeLit[k][(s + 1) % S]))) {
          const a0 = angOf(k, s), r = ringR[k], p = P2(r, a0);
          ctx.moveTo(p[0], p[1]); ctx.arc(0, 0, r, a0, a0 + STEP, false);
        }
        if (sIn[k][s] && (!litOnly || (inJoined(k, s) && nodeLit[k][s]))) seg(jIn[k], ringR[k], angOf(k, s));
        if (sOut[k][s] && (!litOnly || (outJoined(k, s) && nodeLit[k][s]))) seg(ringR[k], jOut[k], angOf(k, s));
      }
    }
    for (let a = 0; a < S; a++) {
      const s0 = loc(0, a);
      if (hubSpk[a] && (!litOnly || (sIn[0][s0] && nodeLit[0][s0]))) seg(hubR, jIn[0], angAbs(a));
      if (bulbs[a] && (!litOnly || bulbLit[a])) seg(jOut[K - 1], bulbR, angAbs(a));
    }
    if (litOnly) {
      // 'lighter' ADDS the halo to the background. Painted normally, gold at low
      // alpha over near-black composites to brown and reads as a dirty outline.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = track * 3.4; ctx.strokeStyle = LIT_HALO; ctx.stroke();
      ctx.restore();
      // Same track+3 as the dim outline below, so no cold grey edge shows through.
      ctx.lineWidth = track + 3; ctx.strokeStyle = LIT_LINE; ctx.stroke();
      ctx.lineWidth = track; ctx.strokeStyle = LIT; ctx.stroke();
    } else {
      ctx.lineWidth = track + 3; ctx.strokeStyle = DIM_LINE; ctx.stroke();
      ctx.lineWidth = track; ctx.strokeStyle = DIM; ctx.stroke();
    }
  }

  function drawHub(now) {
    const [w, t] = bulbCount(), full = t > 0 && w === t;
    const pulse = full ? 1 + 0.05 * Math.sin((now - wonT) / 260) : 1;
    const gr = hubR * 2.8 * pulse;
    const g = ctx.createRadialGradient(0, 0, hubR * 0.5, 0, 0, gr);
    g.addColorStop(0, 'rgba(255,198,92,0.34)'); g.addColorStop(1, 'rgba(255,198,92,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';   // additive, or the wash goes olive-brown
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, gr, 0, 7); ctx.fill();
    ctx.restore();
    ctx.fillStyle = LIT; ctx.beginPath(); ctx.arc(0, 0, hubR * pulse, 0, 7); ctx.fill();
    ctx.fillStyle = HUB_CORE; ctx.beginPath(); ctx.arc(0, 0, hubR * 0.52 * pulse, 0, 7); ctx.fill();
  }

  // A bulb keeps its shape whether it is on or off — a physical globe and screw
  // cap. Only the LIGHT switches: the glass fills and a halo blooms outward.
  // (It used to open like a six-petal flower, which read as a bloom, not a lamp.)
  function drawBulbs(now) {
    const r = BOARD * 0.043, capL = r * 1.0, lw = Math.max(1.8, track * 0.62);
    for (let a = 0; a < S; a++) {
      if (!bulbs[a]) continue;
      const ang = angAbs(a), [x, y] = P2(bulbR, ang);
      const f = bulbLit[a] ? Math.min(1, Math.max(0.001, (now - bulbT[a]) / BULB_DUR)) : 0;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(ang);          // +x now points outward, away from the hub
      if (f > 0) {                                   // halo, added rather than blended
        const e = easeBack(f), hr = r * (1.4 + 2.1 * e);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, hr);
        g.addColorStop(0, 'rgba(255,209,130,' + (0.40 * e).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,198,92,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, hr, 0, 7); ctx.fill();
        ctx.restore();
      }
      // screw cap, tucked against the inner side where the spoke arrives
      ctx.fillStyle = f > 0 ? '#a9741d' : '#3d4c66';
      roundRect(-r * 0.72 - capL, -r * 0.46, capL, r * 0.92, r * 0.2); ctx.fill();
      // glass globe
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 7);
      if (f > 0) {
        ctx.fillStyle = LIT; ctx.fill();
        ctx.lineWidth = lw; ctx.strokeStyle = LIT_LINE; ctx.stroke();
        ctx.fillStyle = HUB_CORE;                    // white-hot filament core
        ctx.beginPath(); ctx.arc(0, 0, r * 0.46, 0, 7); ctx.fill();
      } else {
        ctx.lineWidth = lw; ctx.strokeStyle = DIM; ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ---------- HUD ----------
  function drawHUD(now) {
    const hs = Math.max(0.66, Math.min(1, LW / 620));
    const PX = Math.round(28 * hs);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff'; ctx.font = '800 ' + Math.round(30 * hs) + 'px Inter, sans-serif';
    ctx.fillText('ORBIT', PX, Math.round(topB * 0.22));
    const [w, t] = bulbCount();
    ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.font = '600 ' + Math.round(16 * hs) + 'px Inter, sans-serif';
    ctx.fillText('Level ' + level + '   ·   ' + w + '/' + t + ' lit   ·   ' + moves + (moves === 1 ? ' turn' : ' turns'), PX, Math.round(topB * 0.56));
    // Running total, opposite the title — the thing that carries across levels.
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '700 ' + Math.max(10, Math.round(12 * hs)) + 'px Inter, sans-serif';
    ctx.fillText('SCORE', LW - PX, Math.round(topB * 0.24));
    ctx.fillStyle = '#FFC65C'; ctx.font = '800 ' + Math.round(26 * hs) + 'px Inter, sans-serif';
    ctx.fillText(fmt(score.total), LW - PX, Math.round(topB * 0.44));
    ctx.textAlign = 'left';
    if (phase === 'play' && moves === 0) {   // below the control row — above it collides
      ctx.textAlign = 'center'; ctx.font = '500 ' + Math.round(15 * hs) + 'px Inter, sans-serif';
      if (nLinks > 0) {
        ctx.fillStyle = 'rgba(95,211,192,0.85)';
        ctx.fillText('Dashed rings are geared — they turn opposite ways.', LW / 2, ctrlY + 34);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.42)';
        ctx.fillText('Drag a ring to spin it. Tap to nudge it one step.', LW / 2, ctrlY + 34);
      }
    }
  }
  function pill(label, cx, cy, dim) {
    ctx.font = '700 15px Inter, sans-serif';
    const w = Math.round(ctx.measureText(label).width + 36), h = 40, x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.24)'; roundRect(x, y, w, h, h / 2); ctx.stroke();
    ctx.fillStyle = dim ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx, y + h / 2 + 1);
    return { x, y, w, h };
  }
  function drawControls() {
    const gap = 12;
    ctx.font = '700 15px Inter, sans-serif';
    const wU = Math.round(ctx.measureText('Undo').width + 36), wR = Math.round(ctx.measureText('Restart').width + 36), wH = Math.round(ctx.measureText('Rules').width + 36);
    let x = Math.round(LW / 2 - (wU + wR + wH + gap * 2) / 2);
    uiButtons.push({ ...pill('Undo', x + wU / 2, ctrlY, !history.length), act: undo }); x += wU + gap;
    uiButtons.push({ ...pill('Restart', x + wR / 2, ctrlY, false), act: restart }); x += wR + gap;
    uiButtons.push({ ...pill('Rules', x + wH / 2, ctrlY, false), act: () => { phase = 'menu'; render(performance.now()); } });
  }
  // Scorecard modal. Held back until the mandala has finished lighting so the
  // reveal the player earned is never cut short, and the scrim is left partly
  // transparent so the board still shows behind it.
  const WIN_DELAY = BULB_DUR + 620;
  function scoreRow(label, note, value, px, pw, y, ms, strong, draw) {
    if (draw) {
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillStyle = strong ? '#fff' : 'rgba(255,255,255,0.72)';
      ctx.font = (strong ? '700 ' : '500 ') + Math.round((strong ? 17 : 16) * ms) + 'px Inter, sans-serif';
      ctx.fillText(label, px + 28, y);
      const labelW = ctx.measureText(label).width;   // measure in the LABEL's font, before switching
      if (note) {
        ctx.fillStyle = 'rgba(255,255,255,0.42)'; ctx.font = '500 ' + Math.round(13 * ms) + 'px Inter, sans-serif';
        ctx.fillText(note, px + 28 + labelW + 10, y);
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = strong ? '#FFC65C' : 'rgba(255,255,255,0.92)';
      ctx.font = '700 ' + Math.round((strong ? 19 : 16) * ms) + 'px Inter, sans-serif';
      ctx.fillText(value, px + pw - 28, y);
    }
    return y + Math.round((strong ? 32 : 27) * ms);
  }
  function winBody(px, py, pw, ms, draw) {
    const a = award || scoreLevel(), cx = LW / 2;
    let y = py + Math.round(34 * ms);
    if (draw) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#FFC65C'; ctx.font = '800 ' + Math.round(31 * ms) + 'px Inter, sans-serif';
      ctx.fillText('IN ALIGNMENT', cx, y);
    }
    y += Math.round(40 * ms);
    if (draw) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '600 ' + Math.round(15 * ms) + 'px Inter, sans-serif';
      ctx.fillText('Level ' + level + ' · every bulb lit', cx, y);
    }
    y += Math.round(34 * ms);
    y = scoreRow('Level clear', '', '+' + fmt(a.base), px, pw, y, ms, false, draw);
    y = scoreRow('Par bonus', a.turns + ' turns · par ' + a.par, '+' + fmt(a.parBonus), px, pw, y, ms, false, draw);
    if (a.gearBonus) y = scoreRow('Geared rings', '', '+' + fmt(a.gearBonus), px, pw, y, ms, false, draw);
    if (draw) {
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px + 28, y - 12 * ms); ctx.lineTo(px + pw - 28, y - 12 * ms); ctx.stroke();
    }
    y += Math.round(6 * ms);
    y = scoreRow('Level score', '', fmt(a.levelScore), px, pw, y, ms, true, draw);
    y += Math.round(8 * ms);
    y = scoreRow('Total score', score.cleared + (score.cleared === 1 ? ' level' : ' levels') + ' cleared', fmt(score.total), px, pw, y, ms, true, draw);
    return y + Math.round(14 * ms);
  }
  function winOverlay(now) {
    const t = Math.max(0, Math.min(1, (now - (wonT + WIN_DELAY)) / 420));
    if (t <= 0) return;
    ctx.globalAlpha = t;
    ctx.fillStyle = 'rgba(10,16,28,0.74)'; ctx.fillRect(0, 0, LW, LH);
    const ms = Math.max(0.78, Math.min(1, Math.min(LH / 700, LW / 420)));
    const pw = Math.min(LW - 36, 430), bh = Math.round(50 * ms);
    const ph = winBody(0, 0, pw, ms, false) + bh + Math.round(26 * ms);
    // Sit the card BELOW centre where there is room, so the mandala the player
    // just finished still shows above it instead of being buried.
    const px = (LW - pw) / 2;
    const py = Math.max(10, Math.min((LH - ph) / 2 + BOARD * 0.5, LH - ph - 10));
    ctx.fillStyle = '#16233a'; roundRect(px, py, pw, ph, 22); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.13)'; roundRect(px, py, pw, ph, 22); ctx.stroke();
    const by = winBody(px, py, pw, ms, true);
    const label = 'NEXT LEVEL';
    ctx.font = '800 ' + Math.round(16 * ms) + 'px Inter, sans-serif';
    const bw = Math.round(Math.max(200, ctx.measureText(label).width + 90)), bx = LW / 2 - bw / 2;
    ctx.fillStyle = '#3DDC84'; roundRect(bx, by, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = '#0E1726'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, LW / 2, by + bh / 2 + 1);
    ctx.globalAlpha = 1;
    // Registered only once the card is actually on screen, so the tap that
    // finished the board cannot fall straight through onto this button.
    uiButtons.push({ x: bx, y: by, w: bw, h: bh, act: () => genLevel(level + 1) });
  }
  function wrapText(text, x, y, maxW, lh, align, measureOnly) {
    const words = text.split(' '); let line = '';
    if (!measureOnly) { ctx.textAlign = align || 'center'; ctx.textBaseline = 'top'; }
    for (const w of words) {
      const tt = line ? line + ' ' + w : w;
      if (ctx.measureText(tt).width > maxW && line) { if (!measureOnly) ctx.fillText(line, x, y); y += lh; line = w; }
      else line = tt;
    }
    if (line) { if (!measureOnly) ctx.fillText(line, x, y); y += lh; }
    return y;
  }

  const MENU_SUB = 'Spin the rings until light reaches every bulb.';
  // The gearing rule only appears once a level actually has geared rings, so
  // the first few boards are not explaining a mechanic that is not there yet.
  function menuRules() {
    const r = [
      'Drag a ring to spin it. A quick tap nudges it one step clockwise.',
      'Light only crosses where the track lines up exactly.',
      'Light every bulb on the rim and the paths resolve into a mandala.',
    ];
    if (nLinks > 0) r.splice(2, 0, 'Rings on a dashed teal circle are geared together: turn one and its partner turns the opposite way.');
    return r;
  }
  // Laid out twice: once to measure the wrapped text (draw = false) so the panel
  // can be sized to fit it, then again to paint. How many lines each rule takes
  // depends on the width, so a fixed panel height drops the button onto the text.
  function menuBody(pw, px, py, ms, draw) {
    const cx = LW / 2, rx = px + 30;
    let y = py + 32 * ms;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = '800 ' + Math.round(40 * ms) + 'px Inter, sans-serif';
    if (draw) { ctx.fillStyle = '#fff'; ctx.fillText('ORBIT', cx, y); }
    y += 52 * ms;
    ctx.font = '600 ' + Math.round(17 * ms) + 'px Inter, sans-serif';
    if (draw) ctx.fillStyle = 'rgba(255,255,255,0.82)';
    y = wrapText(MENU_SUB, cx, y, pw - 64, 24 * ms, 'center', !draw) + 16 * ms;
    const RULES = menuRules();
    for (let i = 0; i < RULES.length; i++) {
      if (draw) {
        ctx.fillStyle = '#FFC65C'; ctx.beginPath(); ctx.arc(rx + 11, y + 11, 11.5, 0, 7); ctx.fill();
        ctx.fillStyle = '#0E1726'; ctx.font = '800 14px Inter, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), rx + 11, y + 12);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
      }
      ctx.font = '500 ' + Math.round(16 * ms) + 'px Inter, sans-serif';
      y = wrapText(RULES[i], rx + 32, y, pw - 94, 22 * ms, 'left', !draw) + 12 * ms;
    }
    return y + 18 * ms;
  }
  function menuOverlay() {
    ctx.fillStyle = 'rgba(10,16,28,0.88)'; ctx.fillRect(0, 0, LW, LH);
    const ms = Math.max(0.78, Math.min(1, LH / 700));       // shrink on short screens
    const pw = Math.min(LW - 36, 470), bh = 50 * ms;
    const ph = menuBody(pw, 0, 0, ms, false) + bh + 24 * ms;
    const px = (LW - pw) / 2, py = Math.max(10, (LH - ph) / 2);
    ctx.fillStyle = '#16233a'; roundRect(px, py, pw, ph, 22); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; roundRect(px, py, pw, ph, 22); ctx.stroke();
    const by = menuBody(pw, px, py, ms, true);
    const label = moves > 0 ? 'RESUME' : 'PLAY';
    ctx.font = '800 ' + Math.round(17 * ms) + 'px Inter, sans-serif';
    const bw = Math.round(Math.max(200, ctx.measureText(label).width + 90)), bx = LW / 2 - bw / 2;
    ctx.fillStyle = '#3DDC84'; roundRect(bx, by, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = '#0E1726'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, LW / 2, by + bh / 2 + 1);
    uiButtons.push({ x: bx, y: by, w: bw, h: bh, act: () => { phase = 'play'; render(performance.now()); } });
  }

  // ---------- debug ----------
  window.__orbit = {
    get state() {
      const [w, t] = bulbCount();
      return {
        level, S, m: M, P, K, rings: off.slice(), moves, phase, lit: w, bulbsTotal: t, par, award,
        score: { total: score.total, cleared: score.cleared, best: score.best },
        litNodes: nodeLit.reduce((a, r) => a + r.reduce((x, v) => x + (v ? 1 : 0), 0), 0),
        hubSpokes: hubSpk.reduce((a, b) => a + b, 0), arcCount: arcs.map(r => r.reduce((a, b) => a + b, 0)),
      };
    },
    get geom() { return { MODE, LW, LH, BOARD, CX, CY, ctrlY, hubR, bulbR, ringR: ringR.slice() }; },
    get buttons() { return uiButtons.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h, cx: b.x + b.w / 2, cy: b.y + b.h / 2 })); },
    // Screen point (CSS px) on a given ring, for driving synthetic pointer events.
    at(k, frac) { const a = A0 + (frac || 0) * Math.PI * 2; return { x: CX + ringR[k] * Math.cos(a), y: CY + ringR[k] * Math.sin(a) }; },
    solve() {
      visAng = new Array(K).fill(0); targAng = visAng.slice();
      computeLit(); if (phase === 'play') checkWin(); render(performance.now()); return this.state;
    },
    // Applies the move AND settles it, so tests do not have to wait out the ease.
    spin(k, d) { applyDelta(k, d, true); visAng = targAng.slice(); computeLit(); checkWin(); render(performance.now()); return this.state; },
    next() { genLevel(level + 1); return this.state; },
    goto(n) { genLevel(n); return this.state; },
    get links() { return linkOf.slice(); },
    get aligned() { return alignOK.slice(); },
    setSpec(sp) { specOverride = sp; },        // force a shape, to measure a candidate ramp
    resetScore() { score = { total: 0, cleared: 0, best: 0 }; saveScore(); render(performance.now()); return score; },
    // Difficulty probe. Can the board be solved by fixing each ring in turn from
    // the hub outward, always taking whichever rotation lights the most? If yes,
    // the level is "just spin the wheel" — this is the number the ramp is tuned
    // against. Deliberately does no rendering so a sweep stays fast.
    greedySolvable() {
      const save = visAng.slice();
      const rot = (k, d) => { visAng[k] += d * STEP; const p = linkOf[k]; if (p >= 0) visAng[p] -= d * STEP; };
      for (let k = 0; k < K; k++) {
        let best = -1, bi = 0;
        for (let r = 0; r < P; r++) {
          computeLit();
          const n = nodeLit.reduce((a, row) => a + row.reduce((x, v) => x + (v ? 1 : 0), 0), 0);
          if (n > best) { best = n; bi = r; }
          rot(k, 1);                            // P steps returns the ring (and partner) to start
        }
        for (let q = 0; q < bi; q++) rot(k, 1);
      }
      computeLit();
      const [w, t] = bulbCount();
      const done = t > 0 && w === t;
      visAng = save; computeLit();
      return done;
    },
    // Enumerate every REACHABLE combination — one loop per independent control
    // rather than per ring, since a geared pair cannot be set independently.
    countSolutions() {
      const save = visAng.slice(), dofs = dofList();
      let n = 0;
      const walk = (i) => {
        if (i === dofs.length) { computeLit(); const [w, t] = bulbCount(); if (w === t) n++; return; }
        const d = dofs[i], a0 = visAng[d[0]], b0 = d.length > 1 ? visAng[d[1]] : 0;
        for (let r = 0; r < P; r++) {
          visAng[d[0]] = a0 + r * STEP;
          if (d.length > 1) visAng[d[1]] = b0 - r * STEP;
          walk(i + 1);
        }
        visAng[d[0]] = a0; if (d.length > 1) visAng[d[1]] = b0;
      };
      walk(0); visAng = save; computeLit(); return n;
    },
    // Sanity check for gearing: how many of the P^K raw offset combinations are
    // actually reachable through legal moves.
    reachableStates() { return Math.pow(P, dofList().length); },
  };

  // ---------- boot ----------
  score = loadScore();
  setCanvasVars();
  resizeCanvas();
  fitFullscreen();
  resizeCanvas();
  genLevel(loadLevel(), true);
  // Re-measure after boot: innerWidth/innerHeight can read 0, or a stale
  // pre-layout value, while this script first runs. Timers rather than rAF —
  // rAF is throttled to nothing in some embedded/preview browsers, which is
  // exactly where a stale size would otherwise stick.
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  window.addEventListener('load', onResize);
  // iOS fires this (and not always 'resize') when the URL bar collapses.
  window.visualViewport?.addEventListener('resize', onResize);
})();
