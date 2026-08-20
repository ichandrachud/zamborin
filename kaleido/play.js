/* ============================================================
   Kaleido · a Zamborin Game — milestone 2 (engine, generator, ramp)

   Fill the missing pieces so a figure holds under every required
   rotation at once. You edit one wedge; the rest of the mandala is its
   rotated copy and updates live.

   Circle board under C6, all three depth levers wired and driven by the
   ramp: the SEAM RULE (a piece may not touch its own kind), LOCKED
   GIVENS across orbits, and SHAPE CYCLING (a rotation also advances the
   shape, petal -> diamond -> trefoil).

   The seam rule LEADS the ramp, and that order came from a measurement
   rather than a preference. Givens and cycling produce exactly zero
   deductions at any level, because a given's constraint mentions one
   wedge cell and nothing else, so the network is entirely unary and the
   orbits never interact. The seam rule is the only member that couples
   them. Measured across 24 generated levels: 0 deductions without it,
   3 with it. Do not demote it.

   The square D4 renderer is milestone 3, the monetized page is 4.

   Architecture note, because it is the whole point of the build: the
   symmetry lives in orbitOf() / permT() and knows nothing about pixels.
   The renderer knows nothing about the group. Swapping in D4 on a square
   grid replaces the geometry either side of that line and nothing in
   between.
   ============================================================ */
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const A0 = -Math.PI / 2;          // sector 0 starts at 12 o'clock

  // ---------- MODE + CANVAS ----------
  // A browser can report a 0-wide viewport on the first frame. The usual
  // `innerWidth < 768` then reads as a phone, MODE is locked for the session,
  // and a desktop player is left on the phone board for good. Zero means
  // "not measured yet", so it must not count as narrow.
  const MODE = (matchMedia('(pointer: coarse)').matches ||
                (window.innerWidth > 0 && window.innerWidth < 768))
    ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);

  let LW = 760, LH = 600;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  function setCanvasVars() {
    if (MODE === 'mobile') { LW = window.innerWidth; LH = window.innerHeight; }
    else { LW = 760; LH = 600; }     // the one site-wide desktop frame
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
      // measured px. The shared CSS min(100vw, calc(100dvh…)) under-sizes on
      // iOS Safari with viewport-fit=cover and collapses the canvas to a strip.
      gameWrap.style.width = window.innerWidth + 'px';
      gameWrap.style.height = window.innerHeight + 'px';
      return;
    }
    const active = document.body.classList.contains('focus-mode');
    if (!active) { gameWrap.style.width = ''; gameWrap.style.height = ''; return; }
    const vw = window.innerWidth, vh = window.innerHeight, aspect = LW / LH;
    let cw = vw, ch = Math.round(vw / aspect);
    if (ch > vh) { ch = vh; cw = Math.round(vh * aspect); }
    gameWrap.style.width = cw + 'px'; gameWrap.style.height = ch + 'px';
  }

  // ---------- THE GROUP ----------
  // n is the fold; a group element is a rotation index k in 0..n-1.
  //
  // Six on a desktop, THREE on a phone, and the reason is depth rather than
  // looks. The radial thickness of a ring is what the touch budget binds, so a
  // phone gets three rings whatever else changes, and at six-fold that leaves a
  // six-cell wedge which measured a ceiling of 2 deductions against the
  // desktop's 7. Lowering the fold leaves every cell exactly the same physical
  // size (SEC is unchanged) and doubles the wedge to twelve, because the wedge
  // is SEC/n. Same board, same targets, twice the puzzle. A three-fold mandala
  // is a trefoil rose rather than a six-petal one, which is no less pretty.
  //
  // The cycle length must divide the fold or a full turn would not return a
  // shape to itself. 3 divides both 3 and 6, so the cycling lever is unaffected.
  const N_FOLD = MODE === 'mobile' ? 3 : 6;

  // Rings and their sector counts. 6*(r+1) keeps every ring a multiple of the
  // fold (so no cell is ever fixed by a non-identity rotation, which would
  // demand its token be a fixed point of the permutation) and keeps the arc
  // width roughly constant as the radius grows.
  // Deliberately 6*(r+1) regardless of the fold: this fixes the physical cell
  // size, and the fold then decides only how much of the ring is editable.
  const SEC = (r) => 6 * (r + 1);
  const DOMSEC = (r) => SEC(r) / N_FOLD;      // sectors of ring r inside the wedge

  // Ring count is decided by the TOUCH BUDGET, not by taste: a cell must stay
  // at least MIN_RING px thick in the radial direction, which is the tight
  // dimension. On a phone that permits 3 rings, on desktop 5. Depth on mobile
  // comes from the givens and the cycling, never from more cells.
  const MIN_RING = MODE === 'mobile' ? 44 : 32;
  const HOLE = 0.17;                          // centre boss, as a fraction of boardR

  let RINGS = 5, OFF = [], NCELL = 0, DOFF = [], NDOM = 0;
  function buildBoard(rings) {
    RINGS = rings;
    OFF = []; DOFF = [];
    let n = 0, d = 0;
    for (let r = 0; r < RINGS; r++) { OFF[r] = n; n += SEC(r); DOFF[r] = d; d += DOMSEC(r); }
    NCELL = n; NDOM = d;
    buildSeams();
  }
  const ringOf = (i) => { let r = RINGS - 1; while (r > 0 && i < OFF[r]) r--; return r; };
  const cellRS = (i) => { const r = ringOf(i); return { r, s: i - OFF[r] }; };
  const cellIdx = (r, s) => OFF[r] + ((s % SEC(r)) + SEC(r)) % SEC(r);
  const domIdx  = (r, s) => DOFF[r] + s;
  const domRS   = (d) => { let r = RINGS - 1; while (r > 0 && d < DOFF[r]) r--; return { r, s: d - DOFF[r] }; };

  // The one function the whole game is built on: which wedge cell does this
  // cell belong to, and how many rotations away is it.
  function domainOf(i) {
    const { r, s } = cellRS(i);
    const step = DOMSEC(r);
    return { d: domIdx(r, (s % step)), k: Math.floor(s / step) };
  }
  // ...and its inverse: the cells a wedge cell paints, in rotation order.
  function orbitOf(d) {
    const { r, s } = domRS(d);
    const step = DOMSEC(r), out = [];
    for (let k = 0; k < N_FOLD; k++) out.push(cellIdx(r, s + k * step));
    return out;
  }

  // ---------- SEAM / ADJACENCY (lever 2) ----------
  // EXPERIMENT. Two cells touch if their angular intervals meet, either side by
  // side in a ring or across a ring boundary. All integer arithmetic on sector
  // counts, so the rule is a fact about the board and not about the rendering.
  //
  // This is the only lever that can couple orbits. A given constrains one wedge
  // cell and nothing else; an adjacency constrains a PAIR, and when the two
  // cells sit in different orbits that pair is a real edge between two wedge
  // variables. Same-orbit adjacencies are skipped: they are a property of the
  // geometry rather than a choice the player makes, and on the innermost ring
  // (six sectors, one wedge cell, every cell its own neighbour) they would make
  // the ring unsatisfiable outright whenever cycling is off.
  // The rule comes in two halves, and they do very different things.
  //   ANGULAR  side by side within a ring. Couples wedge cells to each other,
  //            and forbids a ring from favouring one shape, which is exactly
  //            what the banding is. This half is the one that costs the look.
  //   RADIAL   across a ring boundary. Couples the rings, which are otherwise
  //            completely independent, and leaves banding untouched.
  let seamMode = 'off';                 // 'off' | 'radial' | 'full'
  let CONS = [], CONS_AT = [], CONS_ANG = [], CONS_RAD = [];
  // The full-cell version of the same thing, kept rather than thrown away,
  // because the RENDERER needs it: a broken rule has to be shown on the board
  // at the exact edge where it is broken, and that edge is a real place with
  // real geometry. Each entry carries enough to draw it.
  let ADJ_ANG = [], ADJ_RAD = [], ADJ = [];
  function buildSeams() {
    ADJ_ANG = []; ADJ_RAD = [];
    for (let r = 0; r < RINGS; r++) {
      const S = SEC(r), w = TAU / S;
      for (let s = 0; s < S; s++) {
        // the shared edge is the radial came between s and s+1
        ADJ_ANG.push({ a: OFF[r] + s, b: OFF[r] + ((s + 1) % S), kind: 'ang', r, ang: A0 + ((s + 1) % S) * w });
      }
      if (r + 1 >= RINGS) continue;
      const S2 = SEC(r + 1);
      for (let s = 0; s < S; s++) for (let t = 0; t < S2; t++) {
        if (!(s * S2 < (t + 1) * S && t * S < (s + 1) * S2)) continue;
        // the shared edge is the stretch of ring boundary the two both touch
        const lo = Math.max(s / S, t / S2), hi = Math.min((s + 1) / S, (t + 1) / S2);
        ADJ_RAD.push({ a: OFF[r] + s, b: OFF[r + 1] + t, kind: 'rad', r,
                       a0: A0 + lo * TAU, a1: A0 + hi * TAU });
      }
    }
    CONS_ANG = reduceToWedge(ADJ_ANG.map((e) => [e.a, e.b]));
    CONS_RAD = reduceToWedge(ADJ_RAD.map((e) => [e.a, e.b]));
    // The renderer has to use EXACTLY the exclusion the rule uses. Two cells in
    // the same orbit are copies of one another, so with cycling off they always
    // hold the same shape: that is the geometry, not a mistake by the player.
    // The innermost ring is entirely one orbit, so leaving these in drew six
    // error marks around the middle of every correct solution.
    const sameOrbit = (e) => domainOf(e.a).d === domainOf(e.b).d;
    ADJ_ANG = ADJ_ANG.filter((e) => !sameOrbit(e));
    ADJ_RAD = ADJ_RAD.filter((e) => !sameOrbit(e));
    applySeamMode();
  }
  function applySeamMode() {
    CONS = seamMode === 'off' ? []
         : seamMode === 'radial' ? CONS_RAD
         : CONS_ANG.concat(CONS_RAD);
    ADJ  = seamMode === 'off' ? []
         : seamMode === 'radial' ? ADJ_RAD
         : ADJ_ANG.concat(ADJ_RAD);
    CONS_AT = Array.from({ length: NDOM }, () => []);
    for (const c of CONS) { CONS_AT[c[0]].push(c); CONS_AT[c[2]].push(c); }
  }
  function reduceToWedge(pairs) {
    // Dedupe on the ROTATION DIFFERENCE, not on the two rotations. Rotating an
    // adjacent pair gives another adjacent pair, and because permT only ever
    // adds k, the resulting constraint is the same one written differently.
    // Keying on both k values counted every constraint six times over, which
    // is harmless for checking and a hairball to look at or to reason about.
    const seen = new Set(), out = [];
    for (const [a, b] of pairs) {
      const A = domainOf(a), B = domainOf(b);
      if (A.d === B.d) continue;
      const lo = A.d < B.d ? A : B, hi = A.d < B.d ? B : A;
      const key = lo.d + ':' + hi.d + ':' + (((hi.k - lo.k) % N_FOLD) + N_FOLD) % N_FOLD;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([lo.d, lo.k, hi.d, hi.k]);
    }
    return out;
  }
  // Does token t at wedge cell d sit well with everything already assigned?
  function seamOK(assign, d, t) {
    for (const [a, ka, b, kb] of CONS_AT[d]) {
      const other = a === d ? b : a, km = a === d ? ka : kb, ko = a === d ? kb : ka;
      if (assign[other] < 0) continue;
      if (permT(t, km) === permT(assign[other], ko)) return false;
    }
    return true;
  }
  function seamBreaks() {
    if (seamMode === 'off') return 0;
    let n = 0;
    for (const [a, ka, b, kb] of CONS) {
      if (dom[a] < 0 || dom[b] < 0) continue;
      if (permT(dom[a], ka) === permT(dom[b], kb)) n++;
    }
    return n;
  }

  // ---------- TOKENS ----------
  // Identity is the SHAPE. Colour is redundant with shape, which is what makes
  // the shape-only mode free and keeps a colourblind player fully in the game.
  const T_PETAL = 0, T_DIAMOND = 1, T_TREFOIL = 2, T_DOT = 3, NTOK = 4;
  // How many of the four are in play this level. Cycling walks the first three,
  // so it needs at least three or a rotation would land on a shape that is not
  // in the palette.
  let NSHAPE = 4;
  const TOK_NAME = ['Petal', 'Diamond', 'Trefoil', 'Dot'];
  const PLAIN = '#C9D6EA';                  // --kal-plain

  // LOCKED 2026-08-19, by the user, after seeing it both ways.
  //
  // Hue belongs to the WEDGE, one per sixth of a turn, and never to the token.
  // Bound to the token it looked fine right up until cycling was switched on,
  // at which point the colours scrambled and the six-fold symmetry stopped
  // being visible at all, putting the novelty hook and the whole look in direct
  // opposition. Bound to the wedge, the colour repeats every sixth of a turn
  // whatever the tokens are doing: the structure stays legible, the cycling
  // still bites, and SHAPE remains the only carrier of identity, which is what
  // makes the shape-only mode cost a colourblind player nothing.
  //
  // Mirrors --kal-w1..w6 in shared/tokens.css. Canvas cannot read CSS
  // variables, so the values are restated here.
  const WEDGE_COL = ['#E4634F', '#F2A03C', '#FFD23F', '#5DD39E', '#63C4E8', '#B79CE8'];

  // Tried and rejected: tinting each token to a different tone of the wedge
  // hue. It reads as leaded glass in theory and as washed-out pastel in fact,
  // and it costs the saturation that makes the figure sing. Shape already
  // carries the token, so the tone was buying nothing.
  //
  // Kept instead: a gentle lift toward the centre, because the light is behind
  // the middle of the window. Lighten only, never darken. Swept 2026-08-19 over
  // all three beds: every hue clears 3:1, floor is coral on the wedge bed at
  // 3.97:1. That is the headroom, and darkening any hue spends it.
  function glyphColour(k, r) {
    if (shapeOnly) return PLAIN;
    const lift = RINGS > 1 ? 0.13 * (1 - r / (RINGS - 1)) : 0;
    // Spread across the wheel rather than taking the first n. At three-fold,
    // WEDGE_COL[k] alone would give three warm hues and no cool ones.
    const hue = WEDGE_COL[Math.round(k * WEDGE_COL.length / N_FOLD) % WEDGE_COL.length];
    return lighten(hue, lift);
  }

  // The cycling lever. A rotation by k also advances the token by k, over the
  // 3-cycle petal -> diamond -> trefoil. Dot is the fixed point. 3 divides the
  // fold 6, so six rotations return every token to itself, which is the
  // consistency condition the group demands.
  const CYC = 3;
  function permT(t, k) {
    if (t < 0 || !cycleOn || t >= CYC) return t;
    return (t + (k % CYC) + CYC) % CYC;
  }

  // ---------- THE RAMP ----------
  // Difficulty is the number of interacting constraints, never speed.
  //
  // The order was set by measurement, not by taste. Givens and cycling produce
  // exactly zero deductions on their own at any level, because a given's
  // constraint mentions one wedge cell and nothing else. The seam rule is the
  // only member that couples cells, so it arrives at level 2 rather than late
  // in the ramp. Everything after it is a dial on a puzzle that already works.
  //
  //   rings   board size, and the hard cap is the touch budget, not this table
  //   shapes  how many of the four are in play
  //   seam    'off' | 'radial' | 'full'
  //   cycle   the rotation also advances the shape
  //   blanks  how many gaps are left in the window. This IS the difficulty.
  //
  // The seam rule is on from level 1, because it is the only thing that makes a
  // gap deducible: with it off, nothing determines an empty cell and the player
  // is asked to guess. Three shapes stops being satisfiable past three rings,
  // measured, so the fourth shape arrives before the fourth ring does.
  const RAMP = [
    { lvl: 1, rings: 3, shapes: 3, seam: 'full', cycle: false, blanks: 2 },
    { lvl: 2, rings: 3, shapes: 3, seam: 'full', cycle: false, blanks: 3 },
    { lvl: 3, rings: 3, shapes: 4, seam: 'full', cycle: false, blanks: 4 },
    { lvl: 4, rings: 4, shapes: 4, seam: 'full', cycle: false, blanks: 5 },
    { lvl: 5, rings: 5, shapes: 4, seam: 'full', cycle: false, blanks: 6 },
    { lvl: 6, rings: 5, shapes: 4, seam: 'full', cycle: true,  blanks: 6 },
  ];
  function rampFor(lvl) {
    if (lvl <= RAMP.length) return RAMP[lvl - 1];
    // Past the table the board is already at the touch-budget ceiling, so the
    // one thing that climbs is how much of the wedge has to be reasoned out.
    //
    // And it climbs to SEVEN, not higher. Measured over levels 5 to 60 on the
    // fifteen-cell wedge: median 6, ninetieth percentile 7, never once above 7.
    // A target above that is a target the generator cannot fill, so it would
    // silently hand back the best it found and the ramp would read as a lie.
    // Same shape as Stained: the board size is a real but COARSE dial, and it
    // is capped by the touch budget rather than by ambition.
    return { lvl, rings: 5, shapes: 4, seam: 'full', cycle: true,
             blanks: 6 + Math.floor((lvl - RAMP.length + 1) / 2) };
  }

  // ---------- STATE ----------
  // A GIVEN is a wedge cell that arrives already filled, and it shows in every
  // one of its copies, so the board opens as a partly finished window with gaps
  // in it. It used to be a single lone cell in one other wedge, which asked the
  // player to find a shape somewhere else on the disc, mentally rotate it, and
  // copy it in. That is a different and much harder game than the one the board
  // appears to be, and it is what made the whole thing unreadable.
  let dom = [], solved = [], givenDom = new Set();
  let level = 1, sel = T_PETAL, cycleOn = true, shapeOnly = false;
  let phase = 'menu', history = [], uiButtons = [], hitCells = [];
  let placeT = [], wonT = -1e9, animEnd = 0, raf = 0, fb = 0, lastMeasure = null;
  let refuseCell = -1, refuseT = -1e9, hintCell = -1, hintT = -1e9;

  const LS = 'zamborin-kaleido.save';
  function save() {
    try {
      localStorage.setItem(LS, JSON.stringify({ level, shapeOnly, dom }));
    } catch (e) {}
  }
  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(LS) || 'null');
      if (v && v.level >= 1 && v.level <= 999) return v;
    } catch (e) {}
    return null;
  }

  // ---------- LEVEL GENERATION (scramble-from-solved) ----------
  // Build a valid full figure first, so a solution provably exists. Lock a few
  // of its cells as givens, deliberately at k != 0 so the answer is never just
  // sitting in the wedge, then clear the wedge.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // The measurement that decides whether this is a puzzle. Two passes over the
  // wedge, mirroring how a player actually reasons:
  //
  //   LOOKUP    a cell the givens alone pin to one shape. Read the given,
  //             un-cycle it, done. One step, no thinking.
  //   DEDUCTION a cell that only collapses to one shape AFTER propagating what
  //             the neighbours must be. This is the thing that does not exist
  //             without the seam rule, at any level.
  //
  // The binary rule is an inequality, so propagation prunes exactly when a
  // neighbour is already pinned, which is what makes the inference honest
  // rather than an artefact of the solver. Used by the generation gate, so it
  // has to live here rather than in the debug hook.
  // ---------- READING A POSED PUZZLE ----------
  // One place that works out what a posing actually asks of the player, used by
  // the generator and by the read-out alike, so the two can never disagree.
  //
  //   LOOKUP     the givens alone pin the cell. Read it off, un-cycle it, done.
  //   DEDUCTION  it only settles after propagating what the neighbours must be.
  //   UNDECIDED  nothing determines it. Any shape fits.
  //
  // UNDECIDED must always be zero in a shipped level. It was not, and that is
  // what made the game unreadable: a blank with no right answer looks exactly
  // like a blank with one, so a player hunting for the clue hunts forever. The
  // generator below now poses only fully determined puzzles.
  function unaryDomains(sol, given) {
    const D = [];
    for (let d = 0; d < NDOM; d++) D.push(given.has(d) ? [sol[d]] : Array.from({ length: NSHAPE }, (_, t) => t));
    return D;
  }
  // Arc consistency over the seam rule. The rule is an inequality, so it prunes
  // exactly when a neighbour is already pinned, which is what makes the
  // inference one a player could actually make rather than solver cleverness.
  function acPropagate(D) {
    if (!CONS.length) return true;
    let changed = true, guard = 0;
    while (changed && guard++ < 300) {
      changed = false;
      for (const [a, ka, b, kb] of CONS) {
        for (const [x, kx, y, ky] of [[a, ka, b, kb], [b, kb, a, ka]]) {
          const keep = D[x].filter((t) => D[y].some((u) => permT(t, kx) !== permT(u, ky)));
          if (keep.length === D[x].length) continue;
          if (!keep.length) return false;
          D[x] = keep; changed = true;
        }
      }
    }
    return true;
  }
  function analyse(sol, given) {
    const D = unaryDomains(sol, given).map((o) => o.slice());
    if (!acPropagate(D)) return null;
    const settled = D.filter((o) => o.length === 1).length;
    // Every blank is now a real deduction: nothing is handed over by reading a
    // shape off somewhere else, so "lookups" no longer exists as a category.
    return { NDOM, given: given.size, blanks: NDOM - given.size,
             deductions: NDOM - given.size - (NDOM - settled),
             undecided: NDOM - settled, determined: settled === NDOM, D };
  }
  function measureLevel() {
    const m = analyse(solved, givenDom);
    return m ? { level, seam: seamMode, cycling: cycleOn, contradiction: false,
                 NDOM, given: m.given, blanks: m.blanks, deductions: m.deductions,
                 undecided: m.undecided, determined: m.determined }
             : { level, seam: seamMode, cycling: cycleOn, contradiction: true,
                 NDOM, given: 0, blanks: NDOM, deductions: 0, undecided: NDOM, determined: false };
  }

  function genLevel(lvl, asMenu) {
    level = lvl;
    const cfg = rampFor(lvl);

    // The touch budget outranks the ramp. Board size is chosen here, once, so
    // nothing downstream can re-enter this function while it is running.
    measureBoard();
    const rings = Math.max(2, Math.min(cfg.rings, budgetRings()));
    cycleOn = cfg.cycle;
    if (rings !== RINGS) buildBoard(rings);

    // Scramble-from-solved, with a quality gate, and a relaxation ladder under
    // it. Some combinations of shape count and rule simply admit no legal
    // figure at all, and when that happened the generator used to return
    // nothing and leave the PREVIOUS level's board in place: a board of the
    // wrong size, showing givens that belonged to a different puzzle and could
    // not be satisfied. A level must always end up with a figure of its own,
    // so the ladder gives up shapes and then rule strength until one exists.
    const ladder = [
      { shapes: cfg.shapes, seam: cfg.seam },
      { shapes: NTOK,       seam: cfg.seam },
      { shapes: NTOK,       seam: 'radial' },
      { shapes: NTOK,       seam: 'off' },
    ];
    let best = null, bestScore = -Infinity, bestM = null;
    for (const step of ladder) {
      NSHAPE = Math.max(cfg.cycle ? 3 : 2, Math.min(NTOK, step.shapes));
      seamMode = step.seam;
      applySeamMode();
      let sawAny = false;
      // Given COUNT is no longer a dial the generator picks from. It is derived:
      // add until the puzzle is fully determined, then strip back to the level's
      // deduction target. All that varies here is the seed.
      for (let attempt = 0; attempt < 12; attempt++) {
        const cand = poseLevel(lvl, attempt, cfg);
        if (!cand) continue;
        sawAny = true;
        const m = scoreOf(cand);
        if (!m) continue;
        // Closest to the level's gap count. Overshooting is as wrong as falling
        // short: one piece removed can unlock several more, so the ramp has to
        // aim at the number rather than climb past it.
        const score = -Math.abs(m.blanks - cfg.blanks) * 100;
        if (score > bestScore) { bestScore = score; best = cand; bestM = m; }
      }
      if (sawAny && best) break;                // this rung works; keep its settings
    }
    if (sel >= NSHAPE) sel = 0;
    // The last rung has the seam rule off, where ADD pins every cell and a
    // determined posing always exists, so best is never null in practice. The
    // guard is here because a null would blank the board rather than fail loudly.
    if (!best) { NSHAPE = NTOK; seamMode = 'full'; applySeamMode(); best = poseLevel(lvl, 99, cfg); bestM = best && scoreOf(best); }
    lastMeasure = bestM;
    solved = best.solved; givenDom = best.given;

    dom = new Array(NDOM).fill(-1);
    placeT = new Array(NDOM).fill(-1e9);
    history = []; phase = asMenu ? 'menu' : 'play'; wonT = -1e9; animEnd = 0;
    refuseCell = -1; hintCell = -1;
    save(); layoutRings(); ensureAnim(performance.now());
    T().levelStart(level);
  }

  // Build one candidate: a full legal figure first, then pin some of it.
  // Build one candidate posing. Two phases, the Sudoku shape:
  //
  //   ADD     start from nothing and pin cells until propagation settles EVERY
  //           blank to a single shape. The puzzle is now fully determined and
  //           reachable by reasoning alone, never by guessing.
  //   STRIP   then take givens back off, one at a time, keeping only removals
  //           that leave it fully determined. Each one turns a cell the player
  //           could read off into one they have to work out. Stop at the
  //           level's target, which is how the ramp gets its difficulty.
  // Reveal the whole window, then take pieces OUT one at a time, keeping only
  // removals that leave every remaining gap deducible. The board therefore
  // always opens as a partly finished figure whose gaps each have exactly one
  // answer, which is the game the board looks like.
  function poseLevel(lvl, attempt, cfg) {
    const rng = mulberry32((lvl * 2654435761 + attempt * 40503) >>> 0);

    let sol = [];
    for (let r = 0; r < RINGS; r++) {
      const dominant = (rng() * NSHAPE) | 0;
      for (let d = 0; d < DOMSEC(r); d++) {
        sol[domIdx(r, d)] = rng() < 0.55 ? dominant : (rng() * NSHAPE) | 0;
      }
    }
    if (seamMode !== 'off') {
      const found = solveSeams(rng);
      if (!found) return null;
      sol = found;
    }

    const given = new Set();
    for (let d = 0; d < NDOM; d++) given.add(d);
    const order = Array.from({ length: NDOM }, (_, d) => d);
    for (let i = order.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = order[i]; order[i] = order[j]; order[j] = t; }
    for (const d of order) {
      if (NDOM - given.size >= cfg.blanks) break;
      given.delete(d);
      const m = analyse(sol, given);
      if (!m || !m.determined) given.add(d);      // that gap could not be worked out
    }
    if (given.size === NDOM) return null;          // nothing to do is not a level
    return { solved: sol, given };
  }

  // The gate. Measured on the candidate, not asserted about it.
  function scoreOf(cand) {
    const m = analyse(cand.solved, cand.given);
    if (!m) return null;
    // Every gap must have exactly one right answer. This is the whole point.
    if (!m.determined) return null;
    if (m.blanks < 1) return null;
    return m;
  }
  // Randomised backtracking over the wedge. Returns null if the board admits no
  // legal figure at all, which is the signal that the rule is too tight for
  // this geometry rather than that this seed was unlucky.
  function solveSeams(rng) {
    const assign = new Array(NDOM).fill(-1);
    // hardest variables first: most constrained, fewest ways to go wrong late
    const order = Array.from({ length: NDOM }, (_, d) => d)
      .sort((x, y) => CONS_AT[y].length - CONS_AT[x].length);
    let steps = 0;
    const rec = (i) => {
      if (i === order.length) return true;
      if (++steps > 200000) return false;
      const d = order[i];
      const ts = [];
      for (let t = 0; t < NSHAPE; t++) ts.push(t);
      for (let j = ts.length - 1; j > 0; j--) { const k = (rng() * (j + 1)) | 0; const t = ts[j]; ts[j] = ts[k]; ts[k] = t; }
      // Prefer a shape this ring is already using. "Adjacent pieces differ"
      // forbids RUNS of one shape, but it permits an ALTERNATION, and a ring
      // that alternates between two shapes reads as a rhythm rather than as
      // noise. Left to a plain random choice the solver spends all four shapes
      // on every ring and the figure looks scattered; nudged like this it
      // settles into two or three, which is what tracery actually does. Pure
      // value ordering, so it changes which solution is found and never
      // whether one exists.
      const ring = domRS(d).r;
      const used = new Set();
      for (let e = 0; e < NDOM; e++) if (assign[e] >= 0 && domRS(e).r === ring) used.add(assign[e]);
      ts.sort((x, y) => (used.has(y) ? 1 : 0) - (used.has(x) ? 1 : 0));
      for (const t of ts) {
        if (!seamOK(assign, d, t)) continue;
        assign[d] = t;
        if (rec(i + 1)) return true;
        assign[d] = -1;
      }
      return false;
    };
    return rec(0) ? assign : null;
  }

  // Given TOKENS are derived from the solved figure under the CURRENT cycling
  // setting, so flipping the toggle re-poses the same skeleton as a different
  // puzzle rather than producing a contradiction.
  const isGivenDom = (d) => givenDom.has(d);
  const tokAt = (i) => {
    const { d, k } = domainOf(i);
    const base = givenDom.has(d) ? solved[d] : dom[d];
    return permT(base, k);
  };
  const isLocked = (i) => givenDom.has(domainOf(i).d);
  // A given can never be wrong, so the only way to break anything now is to sit
  // two of the same shape against each other. One rule, one failure, one mark.
  function conflicts() { return seamBreaks(); }
  const blanks = () => { let n = 0; for (let d = 0; d < NDOM; d++) if (!givenDom.has(d)) n++; return n; };
  function placed() { let n = 0; for (let d = 0; d < NDOM; d++) if (!givenDom.has(d) && dom[d] >= 0) n++; return n; }
  function solvedNow() { return placed() === blanks() && conflicts() === 0; }

  // ---------- LAYOUT ----------
  let bcx = 0, bcy = 0, boardR = 200, ringR = [];
  const topBand = () => MODE === 'mobile' ? 60 : 56;
  // Palette row only. The prototype's dial row is gone now that cycling and the
  // seam rule are driven by the ramp, which hands the board its radius back.
  const botBand = () => MODE === 'mobile' ? 148 : 92;
  const SIDE_PAD = MODE === 'mobile' ? 12 : 30;

  // Three separate jobs, kept apart because they used to be one function that
  // could re-enter genLevel from inside itself.
  function measureBoard() {
    const availW = Math.max(60, LW - SIDE_PAD * 2);
    const availH = Math.max(60, LH - topBand() - botBand());
    boardR = Math.max(40, Math.min(availW, availH) / 2);
    bcx = Math.round(LW / 2);
    bcy = Math.round(topBand() + availH / 2);
  }
  // The touch budget is a ceiling on the board, and it outranks the ramp. A
  // phone fits three rings; asking for five would put cells under 44px and no
  // amount of level design rescues a target a thumb cannot hit.
  function budgetRings() {
    let rings = 5;
    while (rings > 2 && (boardR * (1 - HOLE)) / rings < MIN_RING) rings--;
    return rings;
  }
  function layoutRings() {
    ringR = [];
    // A mild power curve thins the outer rings the way real tracery does, and
    // holds the cell aspect near 1.35 across every ring.
    for (let i = 0; i <= RINGS; i++) {
      ringR[i] = boardR * (HOLE + (1 - HOLE) * Math.pow(i / RINGS, 0.88));
    }
  }
  function layout() { measureBoard(); layoutRings(); }


  // ---------- HIT TEST (polar, then straight into the wedge) ----------
  function hitCell(x, y) {
    const dx = x - bcx, dy = y - bcy;
    const rad = Math.hypot(dx, dy);
    if (rad < ringR[0] || rad > ringR[RINGS]) return -1;
    let r = RINGS - 1;
    for (let i = 0; i < RINGS; i++) if (rad < ringR[i + 1]) { r = i; break; }
    let a = Math.atan2(dy, dx) - A0;
    a = ((a % TAU) + TAU) % TAU;
    const s = Math.min(SEC(r) - 1, Math.floor(a / (TAU / SEC(r))));
    return OFF[r] + s;
  }

  // ---------- ACTIONS ----------
  // Tap ANY cell, not only the wedge. The engine works out what the wedge must
  // hold for the token you picked to land where you pointed, which is both the
  // intuitive reading and a much larger effective touch target.
  function place(i, now) {
    if (phase !== 'play') return;
    // A set piece has to REFUSE, not just decline. Silence reads as a dead tap
    // and the player concludes the game is broken rather than that the piece
    // is fixed.
    if (isLocked(i)) { refuseCell = i; refuseT = now; snd.blocked(); animEnd = Math.max(animEnd, now + 340); ensureAnim(now); return; }
    const { d, k } = domainOf(i);
    const want = permT(sel, -k);
    const prev = dom[d];
    const next = (prev === want) ? -1 : want;      // tap again to clear
    history.push([d, prev]); if (history.length > 400) history.shift();
    dom[d] = next; placeT[d] = now;
    next < 0 ? snd.clear() : snd.place();
    after(now);
  }
  function after(now) {
    save();
    animEnd = now + 420;
    if (solvedNow() && phase === 'play') {
      phase = 'won'; wonT = now; animEnd = now + 1500;
      T().levelComplete(level, history.length); snd.win();
    }
    ensureAnim(now);
  }
  function undo() {
    if (phase !== 'play' || !history.length) return;
    const [d, prev] = history.pop();
    dom[d] = prev; placeT[d] = performance.now();
    snd.undo(); after(performance.now());
  }
  // Fill one blank the player could have worked out. Prefers a cell the givens
  // pin outright, so the hint demonstrates the easiest available move rather
  // than handing over the cleverest one.
  function hint() {
    if (phase !== 'play') return;
    // Fill the gap that is EASIEST to justify right now: the one whose
    // neighbours already rule out the most, so the hint shows the move the
    // player was closest to making rather than the cleverest one available.
    const known = new Set(givenDom);
    for (let d = 0; d < NDOM; d++) if (dom[d] >= 0) known.add(d);
    const live = solved.map((v, d) => (known.has(d) ? v : -1));
    let pick = -1, bestLeft = 99;
    for (let d = 0; d < NDOM; d++) {
      if (known.has(d)) continue;
      let left = 0;
      for (let t = 0; t < NSHAPE; t++) {
        let ok = true;
        for (const [a, ka, b, kb] of CONS_AT[d]) {
          const o = a === d ? b : a, km = a === d ? ka : kb, ko = a === d ? kb : ka;
          if (live[o] < 0) continue;
          if (permT(t, km) === permT(live[o], ko)) { ok = false; break; }
        }
        if (ok) left++;
      }
      if (left < bestLeft) { bestLeft = left; pick = d; }
    }
    if (pick < 0) return;
    T().hintUsed(level);
    const now = performance.now();
    history.push([pick, dom[pick]]);
    dom[pick] = solved[pick];
    placeT[pick] = now;
    hintCell = pick; hintT = now;
    snd.place();
    animEnd = Math.max(animEnd, now + 900);
    after(now);
  }

  function restart() {
    T().levelRestart(level);
    dom = new Array(NDOM).fill(-1); history = []; phase = 'play';
    placeT = new Array(NDOM).fill(-1e9); wonT = -1e9;
    save(); render(performance.now());
  }

  // The repulsion pulses, so while any rule is broken the loop has to keep
  // running rather than settling after the placement animation.
  const needsAnim = (t) => t < animEnd || (seamBad.length > 0 && !REDUCED) || phase === 'menu';
  function ensureAnim(now) {
    render(now);
    if (!raf) { raf = 1; requestAnimationFrame(tick); }
    clearTimeout(fb);
    fb = setTimeout(() => {
      if (needsAnim(performance.now())) { if (!raf) { raf = 1; requestAnimationFrame(tick); } return; }
      raf = 0; render(performance.now());
    }, (animEnd - now) + 140);
  }
  function tick(t) { render(t); if (needsAnim(t)) requestAnimationFrame(tick); else raf = 0; }

  // ---------- SOUND ----------
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zamborin-kaleido.sound' }) : null;
  const snd = {
    on: () => !!(sfx && sfx.isOn()),
    ready() { if (sfx) sfx.ensureAudio(); },
    toggle() { if (!sfx) return; sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.tone(880, 0.05, 0.03, 'sine'); },
    place() { if (sfx) { sfx.tone(523.25, 0.06, 0.030, 'sine'); sfx.tone(1046.5, 0.05, 0.012, 'sine'); } },
    clear() { if (sfx) sfx.tone(392, 0.05, 0.020, 'sine'); },
    undo() { if (sfx) sfx.tone(330, 0.05, 0.018, 'sine'); },
    blocked() { if (sfx) sfx.tone(196, 0.05, 0.012, 'sine'); },
    // one soft chime, per the brief: the resolve is the reward
    win() { if (sfx) { sfx.tone(659.25, 0.9, 0.045, 'sine'); sfx.tone(987.77, 0.9, 0.022, 'sine'); sfx.tone(1318.5, 1.1, 0.012, 'sine'); } },
  };

  // ---------- ANALYTICS ----------
  const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){}, levelRestart(){}, hintUsed(){} };
  const T = () => (window.ZAM_TRACK || NOOP);

  // ---------- INPUT ----------
  function onTap(e) {
    e.preventDefault();
    snd.ready();
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX ?? e.changedTouches?.[0]?.clientX);
    const py = (e.clientY ?? e.changedTouches?.[0]?.clientY);
    const x = (px - rect.left) * (LW / rect.width);
    const y = (py - rect.top) * (LH / rect.height);   // LH, not LW. They differ on mobile.
    for (const b of uiButtons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.act(); return; }
    if (phase === 'menu') { phase = 'play'; T().gameStart(); render(performance.now()); return; }
    if (phase === 'won') { genLevel(level + 1, false); return; }
    const i = hitCell(x, y);
    if (i >= 0) place(i, performance.now());
  }
  canvas.addEventListener('pointerup', onTap);
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'z') undo();
    if (k === 'r') restart();
    if (k === 'h') hint();
    if (k >= '1' && k <= '4') { sel = +k - 1; render(performance.now()); }
  });

  // ---------- GLYPHS ----------
  // Four silhouettes, each unmistakable at a glance in a unit box. No strokes:
  // edges come from value, per the studio rule.
  function glyphPath(t) {
    ctx.beginPath();
    if (t === T_PETAL) {
      ctx.moveTo(0, -1);
      ctx.bezierCurveTo(0.62, -0.52, 0.62, 0.52, 0, 1);
      ctx.bezierCurveTo(-0.62, 0.52, -0.62, -0.52, 0, -1);
    } else if (t === T_DIAMOND) {
      ctx.moveTo(0, -1); ctx.lineTo(0.86, 0); ctx.lineTo(0, 1); ctx.lineTo(-0.86, 0);
    } else if (t === T_TREFOIL) {
      const R = 0.5, D = 0.5;
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + i * TAU / 3;
        ctx.moveTo(Math.cos(a) * D + R, Math.sin(a) * D);
        ctx.arc(Math.cos(a) * D, Math.sin(a) * D, R, 0, TAU);
      }
    } else {
      ctx.moveTo(0.88, 0); ctx.arc(0, 0, 0.88, 0, TAU);
    }
    ctx.closePath();
  }
  function drawGlyph(t, x, y, sx, sy, angle, alpha, col) {
    col = col || PLAIN;
    const mean = (sx + sy) / 2;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle); ctx.scale(sx, sy);
    ctx.globalAlpha = alpha;
    // Thin bright core with a tight feather. Never a wide wash.
    ctx.shadowColor = col; ctx.shadowBlur = 6 / mean;
    const g = ctx.createRadialGradient(-0.22, -0.30, 0.05, 0, 0, 1.25);
    g.addColorStop(0, lighten(col, 0.42));
    g.addColorStop(0.45, col);
    g.addColorStop(1, darken(col, 0.30));
    ctx.fillStyle = g;
    glyphPath(t); ctx.fill();
    ctx.shadowBlur = 0;
    // Glass: one soft highlight lens, no outline.
    ctx.globalAlpha = alpha * 0.30;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.ellipse(-0.20, -0.34, 0.26, 0.15, -0.5, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  // These return HEX, not rgb(), because their own output is fed back in:
  // glyphColour() tints a wedge hue, then drawGlyph() lightens and darkens that
  // result again for the glass gradient. Returning rgb() made the second pass
  // parse NaN out of the string and take down the whole render.
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  const hx = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  function lighten(c, f) { const [r, g, b] = hex(c); return hx(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f); }
  function darken(c, f) { const [r, g, b] = hex(c); return hx(r * (1 - f), g * (1 - f), b * (1 - f)); }

  // ---------- RENDER ----------
  const LEAD = 3;                              // px of dark came between cells
  function cellPath(r, s, grow) {
    const r0 = ringR[r] + LEAD * 0.5, r1 = ringR[r + 1] - LEAD * 0.5;
    if (r1 <= r0) return false;
    const w = TAU / SEC(r);
    const base = A0 + s * w;
    const d0 = (LEAD * 0.5) / Math.max(1, r0), d1 = (LEAD * 0.5) / Math.max(1, r1);
    const a0 = base, a1 = base + w;
    if (a1 - d0 <= a0 + d0) return false;
    const g = grow || 0;
    ctx.beginPath();
    ctx.arc(bcx, bcy, r0 - g, a0 + d0, a1 - d0, false);
    ctx.arc(bcx, bcy, r1 + g, a1 - d1, a0 + d1, true);
    ctx.closePath();
    return true;
  }
  function cellCentre(r, s) {
    const rm = (ringR[r] + ringR[r + 1]) / 2;
    const am = A0 + (s + 0.5) * (TAU / SEC(r));
    return { x: bcx + rm * Math.cos(am), y: bcy + rm * Math.sin(am), a: am, rm };
  }
  // Glass is cut to fit the stone, so a piece fills its cell in BOTH directions
  // rather than being inscribed in the smaller one. Sizing by min() was what
  // made the figure read as confetti scattered on a board. The aspect is capped
  // so an outer cell stretches a petal without flattening it.
  const FILL = 0.50, MAX_ASPECT = 1.55;
  function cellSize(r) {
    const th = Math.max(6, ringR[r + 1] - ringR[r] - LEAD);
    const rm = (ringR[r] + ringR[r + 1]) / 2;
    const arc = Math.max(6, TAU * rm / SEC(r) - LEAD);
    let sy = th * FILL, sx = arc * FILL;
    if (sx > sy * MAX_ASPECT) sx = sy * MAX_ASPECT;
    if (sy > sx * MAX_ASPECT) sy = sx * MAX_ASPECT;
    return { sx, sy };
  }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  function render(now) {
    ctx.clearRect(0, 0, LW, LH);
    uiButtons = [];

    // ground
    const bg = ctx.createRadialGradient(LW * 0.5, bcy, 0, LW * 0.5, bcy, Math.max(LW, LH) * 0.85);
    bg.addColorStop(0, '#16233C'); bg.addColorStop(0.55, '#131F36'); bg.addColorStop(1, '#0E1726');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);

    drawBacklight(now);
    drawStone();
    drawFigure(now);
    drawBoss(now);
    drawHUD();
    // During the win the figure IS the reward, so nothing overlays it. The top
    // band hands its space to the banner instead of the read-out and pills.
    if (phase === 'play') { drawPalette(); drawControls(); }
    if (phase === 'won') drawPalette();
    if (phase === 'won') winBloom(now);
    if (phase === 'menu') menuOverlay(now);
  }

  // The one luminous element. Soft central backlight, brightening as the
  // figure fills, so progress is felt before it is counted.
  function drawBacklight(now) {
    const fill = NDOM ? placed() / NDOM : 0;
    const w = phase === 'won' ? Math.min(1, (now - wonT) / 900) : 0;
    const a = 0.07 + fill * 0.06 + w * 0.14;
    const g = ctx.createRadialGradient(bcx, bcy, 0, bcx, bcy, boardR * (1.18 + w * 0.12));
    g.addColorStop(0, 'rgba(176,224,230,' + (a * 1.6).toFixed(3) + ')');
    g.addColorStop(0.45, 'rgba(150,200,235,' + (a * 0.7).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(150,200,235,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bcx, bcy, boardR * 1.3, 0, TAU); ctx.fill();
  }

  // The stone the glass is set into. Without it the cell beds were LIGHTER
  // than their surround, which inverts the read: glass has to sit in shadow to
  // look lit.
  function drawStone() {
    ctx.fillStyle = 'rgba(6,11,21,0.62)';
    ctx.beginPath(); ctx.arc(bcx, bcy, ringR[RINGS] + LEAD, 0, TAU); ctx.fill();
  }

  // Which seams are broken right now, and which way each offending piece is
  // shoved. Two pieces of the same kind REPEL: they lean away from the came
  // between them and it lights up hot. That is the whole rule, taught by the
  // material, so the sentence on the rules card is a reminder rather than
  // something you have to have memorised. Before this the clash was counted in
  // the read-out and drawn nowhere at all, which told the player they were
  // wrong and refused to say where.
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seamBad = [], nudge = [];
  function edgeMid(e) {
    if (e.kind === 'ang') {
      const rm = (ringR[e.r] + ringR[e.r + 1]) / 2;
      return { x: bcx + rm * Math.cos(e.ang), y: bcy + rm * Math.sin(e.ang) };
    }
    const am = (e.a0 + e.a1) / 2, rr = ringR[e.r + 1];
    return { x: bcx + rr * Math.cos(am), y: bcy + rr * Math.sin(am) };
  }
  function computeSeamBad(now) {
    seamBad = [];
    nudge = [];
    if (!ADJ.length) return;
    const amp = REDUCED ? 2.4 : 2.0 + 1.6 * (0.5 + 0.5 * Math.sin(now / 190));
    for (const e of ADJ) {
      const ta = tokAt(e.a), tb = tokAt(e.b);
      if (ta < 0 || tb < 0 || ta !== tb) continue;
      seamBad.push(e);
      const m = edgeMid(e);
      for (const i of [e.a, e.b]) {
        const { r, s } = cellRS(i), c = cellCentre(r, s);
        let dx = c.x - m.x, dy = c.y - m.y;
        const len = Math.hypot(dx, dy) || 1;
        dx = dx / len * amp; dy = dy / len * amp;
        const cur = nudge[i] || [0, 0];
        nudge[i] = [cur[0] + dx, cur[1] + dy];
      }
    }
  }
  // The hot came. Drawn over the leading, at the exact edge that is in trouble.
  function drawSeamBreaks() {
    if (!seamBad.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(216,82,63,0.95)';
    for (const e of seamBad) {
      ctx.shadowBlur = 9;
      ctx.strokeStyle = '#FFE3D6';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      if (e.kind === 'ang') {
        const pad = LEAD;
        ctx.moveTo(bcx + (ringR[e.r] + pad) * Math.cos(e.ang), bcy + (ringR[e.r] + pad) * Math.sin(e.ang));
        ctx.lineTo(bcx + (ringR[e.r + 1] - pad) * Math.cos(e.ang), bcy + (ringR[e.r + 1] - pad) * Math.sin(e.ang));
      } else {
        const rr = ringR[e.r + 1], pad = LEAD / Math.max(1, rr);
        ctx.arc(bcx, bcy, rr, e.a0 + pad, e.a1 - pad);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFigure(now) {
    hitCells = [];
    computeSeamBad(now);
    const w = phase === 'won' ? Math.min(1, (now - wonT) / 700) : 0;
    for (let r = 0; r < RINGS; r++) {
      const step = DOMSEC(r);
      for (let s = 0; s < SEC(r); s++) {
        const i = OFF[r] + s;
        const inWedge = s < step;
        const lock = isLocked(i), bad = false;
        const t = tokAt(i);

        if (!cellPath(r, s, 0)) continue;
        // Beds carry state by VALUE alone: empty, wedge, locked, conflicting.
        // Three separated values, and the ceiling on the light ones is set by
        // AA, not by taste: a bed brighter than about 0.155 white drops the
        // coral glyph under 3:1. So "already set" goes DARKER instead of
        // brighter, which reads as recessed into the stone and raises the
        // glyph contrast rather than eating it.
        let bed = 'rgba(255,255,255,0.045)';           // empty stone
        if (inWedge) bed = 'rgba(255,255,255,0.120)';  // the wedge you edit
        if (lock) bed = 'rgba(0,0,0,0.34)';            // already set, cannot move
        if (bad) bed = 'rgba(216,82,63,0.34)';         // your wedge disagrees
        ctx.fillStyle = bed; ctx.fill();

        if (t >= 0) {
          const cc = cellCentre(r, s);
          let { x, y } = cc; const a = cc.a;
          // the hint: a ring of light closes onto the cell it just filled, so
          // the player sees WHERE the answer came from rather than noticing a
          // shape appeared somewhere
          if (domainOf(i).d === hintCell) {
            const hp = (now - hintT) / 900;
            if (hp >= 0 && hp < 1) {
              const sz0 = cellSize(r);
              ctx.save();
              ctx.globalAlpha = (1 - hp) * 0.85;
              ctx.strokeStyle = '#FFF3D6';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(cc.x, cc.y, Math.max(sz0.sx, sz0.sy) * (1 + 1.6 * (1 - ease(hp))), 0, TAU);
              ctx.stroke();
              ctx.restore();
            }
          }
          // the refusal: a short shake along the ring, then it settles
          const rf = (now - refuseT) / 340;
          if (i === refuseCell && rf >= 0 && rf < 1) {
            const k = Math.sin(rf * Math.PI * 5) * (1 - rf) * 5;
            x += Math.cos(a + Math.PI / 2) * k;
            y += Math.sin(a + Math.PI / 2) * k;
          }
          const { d } = domainOf(i);
          // the placement ripples outward from the wedge into its copies
          const delay = lock ? 0 : (Math.floor(s / step) * 45);
          const p = lock ? 1 : Math.min(1, Math.max(0, (now - placeT[d] - delay) / 260));
          if (p <= 0) continue;
          const grow = (0.72 + 0.28 * ease(p)) * (1 + w * 0.05);
          const sz = cellSize(r);
          const nu = nudge[i] || [0, 0];
          drawGlyph(t, x + nu[0], y + nu[1], sz.sx * grow, sz.sy * grow, a + Math.PI / 2,
                    bad ? 0.45 : ease(p), glyphColour(domainOf(i).k, r));
        }
      }
    }
    // the leading, drawn last so it sits over every edge as one continuous net
    ctx.strokeStyle = 'rgba(10,17,32,0.55)';
    ctx.lineWidth = 1;
    for (let r = 1; r < RINGS; r++) { ctx.beginPath(); ctx.arc(bcx, bcy, ringR[r], 0, TAU); ctx.stroke(); }
    drawWedgeMark();
    drawSeamBreaks();
  }

  // The wedge has to be unmistakable, and it cannot be done with a brighter
  // bed: AA caps that at roughly 0.155 white before the coral glyph fails.
  // Light IN the leading is the way. Two radial cames and a capping arc read
  // as a slice marked out on the window, which is exactly what it is.
  function drawWedgeMark() {
    const r0 = ringR[0], r1 = ringR[RINGS];
    const w = TAU / N_FOLD;                    // one fold, whatever the fold is
    ctx.strokeStyle = 'rgba(214,228,247,0.52)';
    ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (const a of [A0, A0 + w]) {
      ctx.beginPath();
      ctx.moveTo(bcx + r0 * Math.cos(a), bcy + r0 * Math.sin(a));
      ctx.lineTo(bcx + r1 * Math.cos(a), bcy + r1 * Math.sin(a));
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(214,228,247,0.30)';
    ctx.beginPath(); ctx.arc(bcx, bcy, r1, A0, A0 + w); ctx.stroke();
  }

  function drawBoss(now) {
    const w = phase === 'won' ? Math.min(1, (now - wonT) / 900) : 0;
    const R = ringR[0] - LEAD * 0.5;
    const g = ctx.createRadialGradient(bcx, bcy - R * 0.25, R * 0.1, bcx, bcy, R);
    g.addColorStop(0, 'rgba(240,250,255,' + (0.90 + w * 0.10).toFixed(2) + ')');
    g.addColorStop(0.5, 'rgba(176,224,230,0.55)');
    g.addColorStop(1, 'rgba(120,170,205,0.16)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bcx, bcy, R, 0, TAU); ctx.fill();
  }

  function drawHUD() {
    if (phase === 'won') return;
    const hs = Math.max(0.7, Math.min(1, LW / 620));
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '600 ' + Math.round(16 * hs) + 'px Inter, sans-serif';
    // "2 clashes" told the player a number and not a problem. Name the thing
    // that is wrong, in the same words the rules card used.
    // No count. The wedge-level number (34) and the number of marks the player
    // can actually see on the board (186, once symmetry has copied each break
    // six times) are both true and neither is reconcilable with the other, so
    // a figure here is worse than none. The board says WHERE; this says WHAT.
    // One phrase, not both. Two of them ran the read-out left across the control
    // row, and the board is already saying WHERE every one of them is, so the
    // words only need to name the kind of problem the player is looking at.
    const state = seamBreaks() ? 'shapes touching'
                : placed() + '/' + blanks() + ' gaps filled';
    ctx.fillText('Level ' + level + '   ·   ' + state, LW - SIDE_PAD, Math.round(topBand() / 2));
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  // The token palette. Four large targets, comfortably over the 56px the touch
  // budget asks for, sitting where a thumb already is on a phone.
  function drawPalette() {
    const n = NSHAPE, sz = MODE === 'mobile' ? 58 : 54, gap = MODE === 'mobile' ? 14 : 16;
    const totw = n * sz + (n - 1) * gap;
    let x = Math.round(LW / 2 - totw / 2);
    const cy = MODE === 'mobile' ? LH - 62 : LH - 48;
    for (let t = 0; t < n; t++) {
      const on = sel === t;
      const bx = x, by = Math.round(cy - sz / 2);
      ctx.fillStyle = on ? 'rgba(255,255,255,0.155)' : 'rgba(255,255,255,0.055)';
      ZUI.roundRectPath(ctx, bx, by, sz, sz, 15); ctx.fill();
      if (on) { ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.62)'; ZUI.roundRectPath(ctx, bx, by, sz, sz, 15); ctx.stroke(); }
      // Neutral on purpose. Hue belongs to the wedge, so a coloured swatch would
      // promise a colour the piece will not have once it lands.
      drawGlyph(t, bx + sz / 2, by + sz / 2, sz * 0.32, sz * 0.32, 0, on ? 1 : 0.62, PLAIN);
      uiButtons.push({ x: bx, y: by, w: sz, h: sz, act: ((k) => () => { sel = k; snd.place(); render(performance.now()); })(t) });
      x += sz + gap;
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

  function drawControls() {
    const P = ZUI.PILL, gap = P.gap;
    const game = [
      { label: 'Undo', act: undo },
      { label: 'Hint', act: hint },
      { label: 'Restart', act: restart },
      { label: 'Rules', act: () => { phase = 'menu'; ensureAnim(performance.now()); } },
    ];
    const row = (items, cy, leftAlign, withSound) => {
      const ws = items.map((it) => ZUI.pillWidth(ctx, it.label));
      let totw = ws.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
      if (withSound) totw += P.iconW + gap;
      let x = leftAlign ? SIDE_PAD : Math.round(LW / 2 - totw / 2);
      if (withSound) {
        const hit = ZUI.drawPill(ctx, '', x + P.iconW / 2, cy, { w: P.iconW });
        speakerIcon(x + P.iconW / 2, cy, snd.on());
        uiButtons.push({ ...hit, act: () => { snd.ready(); snd.toggle(); render(performance.now()); } });
        x += P.iconW + gap;
      }
      items.forEach((it, i) => {
        const dim = (it.label === 'Undo' && !history.length) || it.label === 'Cycle off';
        uiButtons.push({ ...ZUI.drawPill(ctx, it.label, x + ws[i] / 2, cy, { w: ws[i], dim }), act: it.act });
        x += ws[i] + gap;
      });
    };
    if (MODE !== 'mobile') { row(game, Math.round(topBand() / 2), true, true); return; }
    // On a phone the controls stay at the bottom, in thumb reach, and PACK into
    // as many rows as they need. Five pills do not fit 375px on one line, and a
    // row that runs off the screen loses whichever control fell off the end.
    const avail = LW - SIDE_PAD * 2;
    const rows = [[]];
    let used = P.iconW + gap;                     // the sound pill leads row one
    for (const it of game) {
      const w = ZUI.pillWidth(ctx, it.label) + gap;
      if (used + w > avail && rows[rows.length - 1].length) { rows.push([]); used = 0; }
      rows[rows.length - 1].push(it); used += w;
    }
    const base = LH - 118 - (rows.length - 1) * (P.h + 10);
    rows.forEach((items, i) => row(items, base + i * (P.h + 10), false, i === 0));
  }

  function winBloom(now) {
    const t = Math.min(1, Math.max(0, (now - wonT) / 900));
    // a single ring travelling outward through the leading, then it settles
    const rr = boardR * (0.2 + 1.05 * ease(t));
    ctx.globalAlpha = (1 - t) * 0.5;
    ctx.strokeStyle = '#DFF3FF'; ctx.lineWidth = 3 * (1 - t) + 1;
    ctx.beginPath(); ctx.arc(bcx, bcy, rr, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
    const a = Math.min(1, Math.max(0, (now - wonT - 700) / 500));
    if (a <= 0) return;
    ctx.globalAlpha = a;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5DD39E'; ctx.font = '800 ' + (MODE === 'mobile' ? 28 : 32) + 'px Inter, sans-serif';
    ctx.fillText('IN SYMMETRY', LW / 2, Math.round(topBand() * 0.42));
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = '500 15px Inter, sans-serif';
    ctx.fillText('tap for the next figure', LW / 2, Math.round(topBand() * 0.42) + 24);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  // Height wrapText WOULD produce. Uses whatever font is currently set, so the
  // caller must set it first, exactly as wrapText does.
  function measureWrapped(text, maxW, lh) {
    const words = text.split(' ');
    let line = '', h = 0;
    for (const w of words) {
      const tt = line ? line + ' ' + w : w;
      if (ctx.measureText(tt).width > maxW && line) { h += lh; line = w; } else line = tt;
    }
    if (line) h += lh;
    return h;
  }
  function wrapText(text, x, y, maxW, lh, align) {
    const words = text.split(' '); let line = '';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'top';
    for (const w of words) {
      const tt = line ? line + ' ' + w : w;
      if (ctx.measureText(tt).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = tt;
    }
    if (line) { ctx.fillText(line, x, y); y += lh; }
    return y;
  }
  // The rules card is the game's only teaching surface, so it describes THIS
  // level and not the game in the abstract. A card that mentions the shape
  // cycling on level 2, five turns of the wheel on a phone that has two, or a
  // touching rule that is not switched on yet, teaches the wrong game.
  function rulesFor() {
    const copies = N_FOLD - 1;
    const out = [
      'The window is nearly finished. A few pieces are missing, and every gap is inside the lit wedge.',
      // The rule, stated as the thing you use rather than as a restriction.
      'No two of the same shape may touch. That is what tells you which piece each gap wants.',
      'Pick a shape and tap a gap. It fills the other ' + (copies === 2 ? 'two' : 'five')
        + ' wedges at the same time, because they are copies of yours.',
      'Every gap has exactly one right answer. You never have to guess.',
    ];
    if (cycleOn) {
      out.push('One twist from here on: each turn of the wheel also advances the shape, so a copy is not always the same piece.');
    }
    return out;
  }
  // A LOOPING DEMO of the core loop, because "you edit one wedge and the rest
  // are its copies" is not guessable from a still board, and Stained already
  // taught this studio that a rules card which only describes an unguessable
  // goal does not land. Six seconds, no controls: a piece lands in the lit
  // wedge, its copies bloom outward one by one, it holds, it clears, it repeats.
  const DEMO_RINGS = 2, DEMO_SEQ = [0, 2, 1];
  function drawDemo(cx, cy, R, now) {
    const t = REDUCED ? 2200 : (now % 4200);
    const rr = [];
    for (let i = 0; i <= DEMO_RINGS; i++) rr[i] = R * (0.22 + 0.78 * i / DEMO_RINGS);
    const fold = 6, secOf = (i) => 6 * (i + 1);

    // the stone, so the demo reads as the same object as the board
    ctx.fillStyle = 'rgba(6,11,21,0.55)';
    ctx.beginPath(); ctx.arc(cx, cy, rr[DEMO_RINGS] + 2, 0, TAU); ctx.fill();

    for (let r = 0; r < DEMO_RINGS; r++) {
      const S = secOf(r), w = TAU / S, step = S / fold;
      const r0 = rr[r] + 1, r1 = rr[r + 1] - 1;
      const th = r1 - r0, rm = (r0 + r1) / 2;
      let sy = th * 0.42, sx = (TAU * rm / S) * 0.42;
      if (sx > sy * 1.5) sx = sy * 1.5;
      if (sy > sx * 1.5) sy = sx * 1.5;
      for (let sc = 0; sc < S; sc++) {
        const a0 = A0 + sc * w, k = Math.floor(sc / step);
        const inWedge = sc < step;
        const d0 = 1 / Math.max(1, r0), d1 = 1 / Math.max(1, r1);
        ctx.beginPath();
        ctx.arc(cx, cy, r0, a0 + d0, a0 + w - d0, false);
        ctx.arc(cx, cy, r1, a0 + w - d1, a0 + d1, true);
        ctx.closePath();
        ctx.fillStyle = inWedge ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.05)';
        ctx.fill();

        // the wedge fills in sequence; each copy follows its own rotation
        const idx = DEMO_SEQ.indexOf(sc % step);
        const born = 420 + idx * 520 + (inWedge ? 0 : 210 + k * 120);
        const p = Math.max(0, Math.min(1, (t - born) / 300));
        const gone = Math.max(0, Math.min(1, (t - 3500) / 400));
        if (p <= 0 || gone >= 1 || idx < 0) continue;
        const tok = DEMO_SEQ[idx] % 3;
        const am = a0 + w / 2;
        const hue = WEDGE_COL[Math.round(k * WEDGE_COL.length / fold) % WEDGE_COL.length];
        drawGlyph(tok, cx + rm * Math.cos(am), cy + rm * Math.sin(am),
                  sx * (0.7 + 0.3 * ease(p)), sy * (0.7 + 0.3 * ease(p)),
                  am + Math.PI / 2, ease(p) * (1 - gone), hue);
      }
    }
    // the lit wedge, same mark the board uses
    const w6 = TAU / fold;
    ctx.strokeStyle = 'rgba(214,228,247,0.55)'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    for (const a of [A0, A0 + w6]) {
      ctx.beginPath();
      ctx.moveTo(cx + rr[0] * Math.cos(a), cy + rr[0] * Math.sin(a));
      ctx.lineTo(cx + rr[DEMO_RINGS] * Math.cos(a), cy + rr[DEMO_RINGS] * Math.sin(a));
      ctx.stroke();
    }
    // the tapping finger, an outline ring rather than any glyph
    // The guard is on t, not on the derived index. Deriving the index with a
    // Math.max clamp let the first 300ms of every loop through with a NEGATIVE
    // bump, which made the ring radius negative, and a throw inside render does
    // not just skip a frame: it kills the animation loop for good.
    if (!REDUCED && t >= 300 && t < 300 + DEMO_SEQ.length * 520) {
      const idx = Math.floor((t - 300) / 520);
      if (idx >= 0 && idx < DEMO_SEQ.length) {
        const sc = DEMO_SEQ[idx], r = sc < 1 ? 0 : 1;
        const S = secOf(r), w = TAU / S;
        const rm = (rr[r] + rr[r + 1]) / 2, am = A0 + (sc % (S / fold)) * w + w / 2;
        const bump = Math.max(0, Math.min(1, ((t - 300) % 520) / 520));
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * (1 - bump)).toFixed(2) + ')';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(cx + rm * Math.cos(am), cy + rm * Math.sin(am), 5 + bump * 13, 0, TAU);
        ctx.stroke();
      }
    }
  }

  function menuOverlay(now) {
    ctx.fillStyle = 'rgba(10,16,28,0.88)'; ctx.fillRect(0, 0, LW, LH);
    const rules = rulesFor();
    const cx = LW / 2;
    const pw = Math.min(LW - 48, 470);
    // Measure the copy before drawing the card, so the card fits the rules
    // rather than the rules being cropped by a hardcoded height.
    ctx.font = '500 15px Inter, sans-serif';
    let bodyH = 0;
    for (const r of rules) bodyH += measureWrapped(r, pw - 96, 20) + 12;
    ctx.font = '600 16px Inter, sans-serif';
    const leadH = measureWrapped('Complete the figure so it holds under every turn of the wheel.', pw - 70, 23);
    const demoR = Math.min(74, Math.max(52, (LH - 380) / 2 + 52));
    const demoH = demoR * 2 + 18;
    const ph = Math.min(LH - 30, 30 + 40 + leadH + 12 + demoH + bodyH + 26 + ZUI.CTA.h + 26);
    const px = (LW - pw) / 2, py = (LH - ph) / 2;
    ctx.fillStyle = '#16233a'; ZUI.roundRectPath(ctx, px, py, pw, ph, 22); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ZUI.roundRectPath(ctx, px, py, pw, ph, 22); ctx.stroke();
    let y = py + 30;
    ctx.fillStyle = '#fff'; ctx.font = '800 34px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('KALEIDO', cx, y); y += 40;
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = '600 16px Inter, sans-serif';
    y = wrapText('Complete the figure so it holds under every turn of the wheel.', cx, y, pw - 70, 23); y += 12;
    drawDemo(cx, y + demoR, demoR, now); y += demoH;
    const rx = px + 30;
    const step = Math.max(1, Math.floor(WEDGE_COL.length / Math.max(1, rules.length)));
    for (let i = 0; i < rules.length; i++) {
      ctx.fillStyle = WEDGE_COL[(i * step) % WEDGE_COL.length];
      ctx.beginPath(); ctx.arc(rx + 11, y + 11, 11, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0E1726'; ctx.font = '800 13px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), rx + 11, y + 12);
      ctx.fillStyle = 'rgba(255,255,255,0.90)'; ctx.font = '500 15px Inter, sans-serif';
      y = wrapText(rules[i], rx + 32, y, pw - 96, 20, 'left') + 12;
    }
    const label = placed() > 0 ? 'RESUME' : 'PLAY';
    const b = ZUI.drawCTA(ctx, label, cx, py + ph - 26 - ZUI.CTA.h / 2, '#5DD39E');
    uiButtons.push({ ...b, act: () => { phase = 'play'; T().gameStart(); render(performance.now()); } });
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  const ZUI = window.ZAM_UI;

  // ---------- DEBUG ----------
  window.__kaleido = {
    get state() { return { level, RINGS, NCELL, NDOM, placed: placed(), clashes: conflicts(), phase, cycleOn, shapeOnly, seam: seamMode }; },
    solve() { dom = solved.slice(); placeT = placeT.map(() => performance.now()); after(performance.now()); return this.state; },
    next() { genLevel(level + 1, false); }, goto(n) { genLevel(n, false); },
    // Same-shape touches side by side within a ring, as a share of all such
    // touches. This IS the banding, expressed as a number.
    banding() {
      let same = 0, tot = 0;
      for (let r = 0; r < RINGS; r++) for (let s = 0; s < SEC(r); s++) {
        const a = OFF[r] + s, b = OFF[r] + ((s + 1) % SEC(r));
        const ta = tokAt(a), tb = tokAt(b);
        if (ta < 0 || tb < 0) continue;
        tot++; if (ta === tb) same++;
      }
      return { same, tot, pct: tot ? Math.round(100 * same / tot) : 0 };
    },
    // Distinct shapes used per ring, averaged. Low means the ring settles into
    // a rhythm; four means it used everything and looks scattered.
    palettePerRing() {
      let tot = 0;
      for (let r = 0; r < RINGS; r++) {
        const u = new Set();
        for (let s = 0; s < SEC(r); s++) { const t = tokAt(OFF[r] + s); if (t >= 0) u.add(t); }
        tot += u.size;
      }
      return Math.round(100 * tot / RINGS) / 100;
    },
    // set a wedge cell directly, for testing states that are fiddly to tap into
    set(d, t) { dom[d] = t; placeT[d] = performance.now(); after(performance.now()); return this.state; },
    seamBreaks() { return seamBad.length; },
    measure() { return measureLevel(); },
    posed() { return lastMeasure; },
    seam(m) { seamMode = (m === 'radial' || m === 'full') ? m : 'off'; applySeamMode(); genLevel(level, false); return this.measure(); },
    // How much of the wedge is actually DECIDED. A cell is pinned when at least
    // one of the four tokens would clash with a given, free when all four are
    // allowed. This is the measurement that answers "is it a puzzle or is it
    // colouring", and it is the number the difficulty ramp has to move.
    stats() {
      const keep = dom.slice();
      let pinned = 0, forced = 0;
      for (let d = 0; d < NDOM; d++) {
        let ok = 0;
        for (let t = 0; t < NSHAPE; t++) { dom[d] = t; if (conflicts() === 0) ok++; }
        dom[d] = keep[d];
        if (ok < NSHAPE) pinned++;
        if (ok === 1) forced++;
      }
      dom = keep;
      return { level, NDOM, pinned, forced, free: NDOM - pinned,
               solutions: Math.pow(NSHAPE, NDOM - pinned),
               pinnedPct: Math.round(100 * pinned / NDOM) };
    },
    shapes(v) { shapeOnly = v !== false; save(); render(performance.now()); return shapeOnly; },
  };

  // ---------- BOOT ----------
  function onResize() {
    if (MODE === 'mobile') setCanvasVars();
    fitFullscreen(); resizeCanvas(); measureBoard();
    // A resize can change what the touch budget allows, and ring count is a
    // board change rather than a layout one, so the level has to be re-posed.
    const want = Math.max(2, Math.min(rampFor(level).rings, budgetRings()));
    if (want !== RINGS) { const keep = phase; genLevel(level, false); phase = keep; }
    else { layoutRings(); }
    render(performance.now());
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', () => ensureAnim(performance.now()));

  T().init('kaleido');
  setCanvasVars(); resizeCanvas(); fitFullscreen(); resizeCanvas();
  buildBoard(3);
  measureBoard();
  const saved = load();
  if (saved) shapeOnly = !!saved.shapeOnly;   // cycling is the ramp's call now, not a saved one
  genLevel(saved ? saved.level : 1, true);
  if (saved && Array.isArray(saved.dom) && saved.dom.length === NDOM) { dom = saved.dom.slice(); render(performance.now()); }
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
})();
