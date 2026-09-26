/* ============================================================
   Kaleido · a Zamborin Game — milestone 2 (engine, generator, ramp)

   Fill the missing pieces so a figure holds under every required
   rotation at once. You edit one wedge; the rest of the mandala is its
   rotated copy and updates live.

   Circle board, and the difficulty comes from two things driven by the
   ramp: the SEAM RULE (no two panes of the same colour may touch) and how
   much of the window is missing. The brief's third lever, colour cycling,
   was built and then CUT: see setFold() for the measurement.

   The seam rule LEADS the ramp, and that order came from a measurement
   rather than a preference. Givens and cycling produce exactly zero
   deductions at any level, because a given's constraint mentions one
   wedge cell and nothing else, so the network is entirely unary and the
   orbits never interact. The seam rule is the only member that couples
   them. Measured across 24 generated levels: 0 deductions without it,
   3 with it. Do not demote it.

   The square D4 renderer is milestone 3, the monetized page is 4.

   Architecture note, because it is the whole point of the build: the
   symmetry lives in orbitOf() and knows nothing about pixels.
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
  // Canvas device pixels per logical unit. The glass tiles are rasterised at
  // this scale, so a change to it has to throw them away. Declared HERE rather
  // than beside the window code because resizeCanvas() touches both at boot
  // and a `let` further down the file would still be in its temporal dead zone.
  let PIXEL_SCALE = 1;
  const glassTiles = new Map();
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
    if (Math.abs(scale - PIXEL_SCALE) > 0.001) { PIXEL_SCALE = scale; glassTiles.clear(); }
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
  // The fold is a DIFFICULTY DIAL, not a constant. The wedge is SEC/n cells, so
  // halving the fold doubles the number of independent cells on the same board
  // at the same physical cell size. Six is the prettiest and the easiest; three
  // and two are progressively more puzzle on identical geometry.
  let N_FOLD = MODE === 'mobile' ? 3 : 6;
  function setFold(n) { N_FOLD = n; }

  // CUT 2026-08-20: the colour-cycling twist, where a copy came back a different
  // colour as it went round the wheel. It was the brief's novelty hook and it is
  // gone, on two findings that agree.
  //
  // It needed explaining, and a player will not go looking for an explanation.
  // The user hit it cold on level 75 and read it as a bug, which is the right
  // reading of a rule you cannot see.
  //
  // And it bought NOTHING. Probed across every dial combination, the hardest
  // board reachable with the twist measured 51 and without it 51. Several
  // boards came out harder without it: five rings at three-fold with three
  // colours went 45 with the twist to 51 without.
  //
  // A copy is now simply a copy. Do not reintroduce this without a measurement
  // showing it pays for the explanation it costs.

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
  // comes from the rule and the number of gaps, never from more cells.
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
  // the ring unsatisfiable outright.
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
    // the same orbit are copies of one another, so they always hold the same
    // colour: that is the geometry, not a mistake by the player.
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
    for (const c of CONS) { CONS_AT[c[0]].push(c); CONS_AT[c[1]].push(c); }
  }
  function reduceToWedge(pairs) {
    // Dedupe on the ROTATION DIFFERENCE, not on the two rotations. Rotating an
    // adjacent pair gives another adjacent pair, and the constraint it carries
    // is the same one written differently.
    const seen = new Set(), out = [];
    for (const [a, b] of pairs) {
      const A = domainOf(a), B = domainOf(b);
      if (A.d === B.d) continue;
      const lo = A.d < B.d ? A : B, hi = A.d < B.d ? B : A;
      // One constraint per PAIR of wedge cells. With no permutation in play the
      // rotation a pair happens to touch at makes no difference to what the
      // constraint says, so keying on it just stored the same rule many times.
      const key = lo.d + ':' + hi.d;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([lo.d, hi.d]);
    }
    return out;
  }
  // Does token t at wedge cell d sit well with everything already assigned?
  function seamOK(assign, d, t) {
    for (const [a, b] of CONS_AT[d]) {
      const other = a === d ? b : a;
      if (assign[other] < 0) continue;
      if (t === assign[other]) return false;
    }
    return true;
  }
  function seamBreaks() {
    if (seamMode === 'off') return 0;
    let n = 0;
    for (const [a, b] of CONS) {
      if (dom[a] < 0 || dom[b] < 0) continue;
      if (dom[a] === dom[b]) n++;
    }
    return n;
  }

  // ---------- THE FOUR GLASSES ----------
  // A piece is identified by its COLOUR, and each also carries a jewel whose
  // SHAPE says the same thing (see THE WINDOW). The colourblind mode takes the
  // colour out and leaves the jewels. Same board, same puzzle, no colour needed.
  const NTOK = 4;
  // How many of the four are in play this level. The ramp moves it between 3
  // and 4: fewer colours propagate harder so more can be hidden, more colours
  // make longer chains, and the two are not the same dial.
  let NSHAPE = 4;


  // Colour carries the PIECE, not the wedge. User's call 2026-08-20 after seeing
  // both: a filled pane can only tell you something if its colour is about the
  // piece, so the rotating rainbow went when the panes came in.
  // ---------- THE ZAMBORIN PALETTE ----------
  // Canvas cannot read CSS variables, so shared/tokens.css is mirrored here and
  // NOTHING in this file invents a colour. Every value below is a token, and the
  // token name is the comment. If a colour is wanted that is not here, it goes
  // into tokens.css first.
  const Z = {
    bg:       '#0E1726',   // --bg
    bgCard:   '#131F36',   // --bg-card
    bgPanel:  '#1A2A45',   // --bg-panel
    line:     '#1F2D4A',   // --line
    text:     '#FFFFFF',   // --text
    textDim:  '#C5CFE0',   // --text-dim
    textMute: '#8E9CB5',   // --text-mute
    accent:   '#D8523F',   // --accent    coral
    accent2:  '#FFD23F',   // --accent-2  sunshine
    green:    '#5DD39E',   // --green
    brand:    '#B0E0E6',   // --brand     powder blue
  };

  // The four Zamborin accents, which number the rules on the rules card. That
  // card is chrome, so it takes tokens; the glass itself is game art and has
  // its own palette (GLASS, in THE WINDOW).
  const PANE_COL = [Z.accent, Z.accent2, Z.green, Z.brand];

  // ---------- THE RAMP ----------
  // A HUNDRED levels, and difficulty is a measured target rather than a table of
  // gap counts. Two numbers describe a posed level:
  //
  //   gaps   how much work it is
  //   depth  how many rounds of propagation it takes, which is the length of the
  //          longest chain of reasoning the player has to follow
  //
  // and hardness = gaps + 3 * (depth - 1) combines them. The generator is handed
  // a target and hides panes until it reaches it.
  //
  // The dials, in the order the ramp spends them:
  //
  //   RINGS  3 to 5, capped by the touch budget, never by this table
  //   FOLD   6, then 3, then 2. This is the big one and it was sitting unused.
  //          The wedge is SEC/fold, so halving the fold DOUBLES the number of
  //          independent cells on exactly the same board at exactly the same
  //          cell size: 15 cells at six-fold, 30 at three, 45 at two.
  //   COLOURS 4 or 3. Fewer colours propagate harder, so more can be hidden;
  //          more colours make longer chains. Both are useful and they are not
  //          the same dial.
  //
  // Every max below is MEASURED on a desktop board, not guessed. A phone caps at
  // three rings, so it reaches a lower ceiling on the same ramp; that is the
  // touch budget's doing and there is no way around it.
  // The stage list is built at RUNTIME, because the ring cap is a property of the
  // device and not of the design. A phone is held to three rings by the touch
  // budget, so a stage written as "five rings, three-fold" silently becomes a
  // three-ring board there. The first version of this table carried difficulty
  // ceilings measured on a desktop, the ramp kept choosing stages the phone
  // could not deliver, and the curve on a phone came out as noise.
  //
  // A stage's ceiling is estimated from the wedge it actually ends up with:
  // roughly 1.2 gaps-worth per cell at three colours and 1.05 at four, which is
  // what the probe measured across the whole space.
  function stageList() {
    const cap = Math.min(5, budgetRings());
    const seen = new Set(), out = [];
    // Every rung the ramp can stand on, as (rings, fold, colours). Sorted by
    // reachable hardness further down, so the ramp always picks the SIMPLEST
    // board that can carry the level's target.
    const combos = [
      [3, 6, 3], [4, 6, 3], [5, 6, 4], [3, 3, 3], [4, 3, 3],
      [4, 3, 4], [5, 3, 3], [4, 2, 4], [5, 3, 4], [5, 2, 4], [5, 2, 3],
    ];
    for (const [r0, fold, shapes] of combos) {
      const rings = Math.min(r0, cap);
      const key = rings + ':' + fold + ':' + shapes;
      if (seen.has(key)) continue;                 // the cap collapsed it onto another
      seen.add(key);
      const wedge = (6 / fold) * rings * (rings + 1) / 2;
      out.push({ rings, fold, shapes, max: Math.round(wedge * (shapes === 3 ? 1.2 : 1.05)) });
    }
    out.sort((x, y) => x.max - y.max);
    return out;
  }
  let STAGES = null;
  const stages = () => (STAGES = STAGES || stageList());

  // Gentle at the start, because the first dozen levels are where a player
  // decides whether they understand the game, and topping out at whatever this
  // device can actually reach rather than at a number from another machine.
  function targetHardness(lvl) {
    const top = stages()[stages().length - 1].max;
    const t = Math.min(1, Math.max(0, (lvl - 1) / 99));
    return Math.max(3, Math.round(4 + (top - 4) * Math.pow(t, 1.25)));
  }
  function rampFor(lvl) {
    const want = targetHardness(lvl);
    // The SIMPLEST board that can carry the target. Holding the fold high and
    // the ring count low for as long as they will stretch keeps the figure at
    // its prettiest for as long as the difficulty allows.
    const list = stages();
    const st = list.find((c) => c.max >= want) || list[list.length - 1];
    return { lvl, rings: st.rings, fold: st.fold, shapes: st.shapes,
             seam: 'full', hardness: want };
  }

  // ---------- STATE ----------
  // A GIVEN is a wedge cell that arrives already filled, and it shows in every
  // one of its copies, so the board opens as a partly finished window with gaps
  // in it. It used to be a single lone cell in one other wedge, which asked the
  // player to find a shape somewhere else on the disc, mentally rotate it, and
  // copy it in. That is a different and much harder game than the one the board
  // appears to be, and it is what made the whole thing unreadable.
  let dom = [], solved = [], givenDom = new Set();
  let level = 1, sel = 0, shapeOnly = false;
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
  // Returns the number of ROUNDS propagation needed, which is the length of the
  // longest chain of reasoning the player has to follow. Gaps measure how much
  // work a level is; rounds measure how deep it is, and the two together are
  // what a difficulty curve has to climb. Zero means nothing propagated at all.
  function acPropagate(D) {
    if (!CONS.length) return 0;
    let changed = true, rounds = 0;
    while (changed && rounds < 300) {
      changed = false;
      for (const [a, b] of CONS) {
        for (const [x, y] of [[a, b], [b, a]]) {
          const keep = D[x].filter((t) => D[y].some((u) => t !== u));
          if (keep.length === D[x].length) continue;
          if (!keep.length) return -1;
          D[x] = keep; changed = true;
        }
      }
      if (changed) rounds++;
    }
    return rounds;
  }
  function analyse(sol, given) {
    const D = unaryDomains(sol, given).map((o) => o.slice());
    const rounds = acPropagate(D);
    if (rounds < 0) return null;
    const settled = D.filter((o) => o.length === 1).length;
    // Every blank is now a real deduction: nothing is handed over by reading a
    // shape off somewhere else, so "lookups" no longer exists as a category.
    const blanks = NDOM - given.size;
    return { NDOM, given: given.size, blanks,
             deductions: blanks - (NDOM - settled), depth: rounds,
             undecided: NDOM - settled, determined: settled === NDOM, D,
             // What the ramp climbs: how much work, weighted by how deep it goes.
             hardness: blanks + 3 * Math.max(0, rounds - 1) };
  }
  function measureLevel() {
    const m = analyse(solved, givenDom);
    return m ? { level, seam: seamMode, contradiction: false,
                 NDOM, given: m.given, blanks: m.blanks, deductions: m.deductions,
                 depth: m.depth, hardness: m.hardness,
                 undecided: m.undecided, determined: m.determined }
             : { level, seam: seamMode, contradiction: true,
                 NDOM, given: 0, blanks: NDOM, deductions: 0, undecided: NDOM, determined: false };
  }

  let lastSaid = '';
  function genLevel(lvl, asMenu, override) {
    level = lvl;
    const cfg = override || rampFor(lvl);

    // The touch budget outranks the ramp. Board size is chosen here, once, so
    // nothing downstream can re-enter this function while it is running.
    measureBoard();
    const rings = Math.max(2, Math.min(cfg.rings, budgetRings()));
    const fold = cfg.fold || 6;
    // The wedge is SEC/fold, so the board must be rebuilt when EITHER moves.
    const foldChanged = fold !== N_FOLD;
    setFold(fold);
    if (rings !== RINGS || foldChanged) buildBoard(rings);

    // Scramble-from-solved, with a quality gate and a fallback under it.
    //
    // Some dial combinations admit no legal figure at all, and when generation
    // came up empty the code used to leave the PREVIOUS level's board in place:
    // wrong size, wrong givens, unsolvable. The fallback below always ends with
    // a real figure, and it walks back through DIALS rather than through the
    // seam rule, because turning the rule off cannot possibly help: with no rule
    // nothing propagates, so no gap is ever deducible and every posing is
    // rejected. A rung that can never succeed is not a fallback, and having one
    // is exactly what made this throw on a phone at two-fold.
    const search = (want) => {
      let bst = null, bstScore = -Infinity, bstM = null;
      for (const shapes of [want.shapes, NTOK]) {
        NSHAPE = Math.max(2, Math.min(NTOK, shapes));
        seamMode = 'full';
        applySeamMode();
        for (let attempt = 0; attempt < 12; attempt++) {
          const cand = poseLevel(lvl, attempt, want);
          if (!cand) continue;
          const m = scoreOf(cand);
          if (!m) continue;
          // Closest to the target hardness. Overshooting is as wrong as falling
          // short, because the curve has to climb rather than lurch.
          const score = -Math.abs(m.hardness - want.hardness) * 100;
          if (score > bstScore) { bstScore = score; bst = cand; bstM = m; }
          // Close enough is done. Chasing a perfect hit across all twelve seeds
          // cost 250ms on the biggest boards, a visible hitch on level change.
          if (Math.abs(m.hardness - want.hardness) <= 1) break;
        }
        if (bst) break;
      }
      return bst ? { best: bst, m: bstM } : null;
    };

    // Simpler and simpler until something works. Raising the fold shrinks the
    // wedge, which is the surest way to make a board satisfiable again, and the
    // last entry is level one's own dials, which are known to work.
    const attempts = [cfg];
    if (fold === 2) attempts.push({ ...cfg, fold: 3 });
    if (fold < 6) attempts.push({ ...cfg, fold: 6 });
    if (rings > 3) attempts.push({ ...cfg, fold: 6, rings: 3 });
    attempts.push({ rings: 3, fold: 6, shapes: 3, seam: 'full', hardness: 4 });

    let best = null, bestM = null;
    for (const want of attempts) {
      const wf = want.fold || 6, wr = Math.max(2, Math.min(want.rings || rings, budgetRings()));
      if (wf !== N_FOLD || wr !== RINGS) {
        setFold(wf);
        buildBoard(wr);
      }
      const got = search(want);
      if (got) { best = got.best; bestM = got.m; break; }
    }
    if (sel >= NSHAPE) sel = 0;
    lastMeasure = bestM;
    solved = best.solved; givenDom = best.given;

    dom = new Array(NDOM).fill(-1);
    placeT = new Array(NDOM).fill(-1e9);
    history = []; phase = asMenu ? 'menu' : 'play'; wonT = -1e9; animEnd = 0;
    refuseCell = -1; hintCell = -1;
    save(); layoutRings(); animEnd = performance.now() + 400; ensureAnim(performance.now());
    T().levelStart(level);
    // A new board is a state change too, and the one a screen reader most needs:
    // without it the first thing ever announced is the result of a move.
    lastSaid = ''; announce();
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
    // Carry the current analysis forward instead of recomputing it at the top of
    // every iteration. The loop was measuring the same posing twice per removal,
    // which on a 45-cell wedge is most of the level's generation time.
    let cur = analyse(sol, given);
    for (const d of order) {
      if (cur && cur.hardness >= cfg.hardness) break;
      given.delete(d);
      const m = analyse(sol, given);
      if (!m || !m.determined) given.add(d);      // that gap could not be worked out
      else cur = m;
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

  // What is showing in a cell: the answer if that wedge cell was given, the
  // player's own placement otherwise. A cell and all of its copies read the
  // same, which is what makes the figure symmetric by construction.
  const tokAt = (i) => {
    const d = domainOf(i).d;
    return givenDom.has(d) ? solved[d] : dom[d];
  };
  const isLocked = (i) => givenDom.has(domainOf(i).d);
  // A given can never be wrong, so the only way to break anything now is to sit
  // two of the same shape against each other. One rule, one failure, one mark.
  function conflicts() { return seamBreaks(); }
  const blanks = () => { let n = 0; for (let d = 0; d < NDOM; d++) if (!givenDom.has(d)) n++; return n; };
  function placed() { let n = 0; for (let d = 0; d < NDOM; d++) if (!givenDom.has(d) && dom[d] >= 0) n++; return n; }
  function solvedNow() { return placed() === blanks() && conflicts() === 0; }

  // ---------- LAYOUT ----------
  // boardR is the glass the player taps. frameR is the whole window, and the
  // difference between them is its frame: a stone ring and, where there is
  // room, a border of leaves (see measureBoard).
  let bcx = 0, bcy = 0, boardR = 200, ringR = [], frameR = 216, border = 16;
  // THE FLEET'S BANDS (DESIGN-SYSTEM 2.1, 4.2 and 4.3; owner, 2026-09-16).
  // Every control is in the top band: round icons across a phone, labelled
  // pills at the desktop's left with Hint at the band's right end. The read-out
  // sits at the bottom left, and on a phone the sound switch stands bare at the
  // other end of that band.
  const topBand = () => MODE === 'mobile' ? 64 : 56;
  const botBand = () => MODE === 'mobile' ? 52 : 40;
  const SIDE_PAD = MODE === 'mobile' ? 16 : 30;
  const SW = MODE === 'mobile' ? 58 : 54, SW_GAP = MODE === 'mobile' ? 14 : 16;
  // Minimum air between the wheel and anything you can press. Without it the
  // control row sat 8px off the rim and read as touching it.
  const CLEAR = 15;
  // The phone's colours, in a row just above the bottom band, where the thumb is.
  const paletteCY = () => LH - botBand() - 8 - SW / 2;

  // The site's full-screen exit button hangs over the top band's right end
  // from 1152 wide up, and whatever sits at that end stops 12 short of it
  // (DESIGN-SYSTEM 4.2). Measured from the page each time the layout runs, as
  // Comb's is, so a change to chrome.css cannot bring the collision back.
  let exitBox = null;
  function exitButtonBox() {
    const el = document.getElementById('focus-toggle');
    if (!el || !document.body.classList.contains('focus-mode')) return null;
    const b = el.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    if (!b.width || !c.width) return null;
    const k = LW / c.width;
    const box = { x: (b.left - c.left) * k, y: (b.top - c.top) * k, w: b.width * k, h: b.height * k };
    return box.y < topBand() && box.y + box.h > 0 && box.x < LW ? box : null;
  }
  const bandRight = () => (exitBox ? Math.min(LW - SIDE_PAD, exitBox.x - 12) : LW - SIDE_PAD);

  // The frame's width. At least a stone rim, at most a full border of leaves,
  // and in between it takes whatever radius the rings do not need: the touch
  // budget outranks the ornament. A 360-wide phone keeps its third ring with a
  // rim of 4, where a fixed border would have cost it the ring.
  const BORDER_MIN = 4, BORDER_MAX = MODE === 'mobile' ? 24 : 30;

  // Three separate jobs, kept apart because they used to be one function that
  // could re-enter genLevel from inside itself.
  // The wheel's box, stated as four edges rather than derived from bands, so the
  // clearances are guaranteed instead of hoped for.
  //
  // DESKTOP puts the colours in a column down the right. The frame is 760x600,
  // so the wheel is limited by HEIGHT, and a row of swatches under it would
  // cost radius that the column beside it does not.
  //
  // PHONE keeps them in a row underneath, because there the wheel is limited by
  // WIDTH and a column would take the one dimension it cannot spare.
  function measureBoard() {
    exitBox = MODE === 'mobile' ? null : exitButtonBox();
    const controlsBottom = Math.round(topBand() / 2) + ZUI.PILL.h / 2;
    let left = SIDE_PAD, right = LW - SIDE_PAD, top, bottom;
    if (MODE === 'mobile') {
      top = topBand();
      bottom = paletteCY() - SW / 2 - CLEAR;          // clear of the colours
    } else {
      top = controlsBottom + CLEAR;                   // clear of the control row
      bottom = LH - botBand();                        // clear of the read-out
      right = LW - SIDE_PAD - SW - CLEAR;             // clear of the palette column
    }
    frameR = Math.max(40, Math.min((right - left) / 2, (bottom - top) / 2));
    bcx = Math.round((left + right) / 2);
    bcy = Math.round((top + bottom) / 2);
    // Size the rings first with the thinnest frame, then give the frame the
    // slack. Five is the most rings the ramp ever asks for.
    boardR = frameR - BORDER_MIN;
    const most = Math.min(5, budgetRings());
    const need = MIN_RING / (thinnestRing(most) / boardR) + 0.5;
    border = Math.max(BORDER_MIN, Math.min(BORDER_MAX, frameR - need));
    boardR = frameR - border;
  }
  // The touch budget is a ceiling on the board, and it outranks the ramp. A
  // phone fits three rings; asking for five would put cells under 44px and no
  // amount of level design rescues a target a thumb cannot hit.
  // Measures the THINNEST ring, not the average one. Ring thickness is not
  // uniform: the power curve in layoutRings() squeezes the outer rings, so the
  // average was letting through a count whose outermost ring was under the touch
  // minimum. At boardR 256 it said six rings were fine when the outer one comes
  // out at 31.6px against a 32px floor.
  // The outer rings are squeezed by a power curve because it looks like real
  // tracery. That is a cosmetic choice, and on a phone it is one the touch
  // budget cannot afford: at three rings it took the outer one to 42.3px against
  // a 44px floor, which cost the phone a whole ring. Equal thickness there.
  const RING_CURVE = MODE === 'mobile' ? 1 : 0.88;
  function thinnestRing(rings) {
    return boardR * (1 - HOLE) * (1 - Math.pow((rings - 1) / rings, RING_CURVE));
  }
  function budgetRings() {
    let rings = 6;
    while (rings > 2 && thinnestRing(rings) < MIN_RING) rings--;
    return rings;
  }
  function layoutRings() {
    ringR = [];
    // A mild power curve thins the outer rings the way real tracery does, and
    // holds the cell aspect near 1.35 across every ring.
    for (let i = 0; i <= RINGS; i++) {
      ringR[i] = boardR * (HOLE + (1 - HOLE) * Math.pow(i / RINGS, RING_CURVE));
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
    const want = sel;
    const prev = dom[d];
    const next = (prev === want) ? -1 : want;      // tap again to clear
    history.push([d, prev]); if (history.length > 400) history.shift();
    dom[d] = next; placeT[d] = now;
    next < 0 ? snd.clear() : snd.place();
    after(now);
  }
  // K3. The canvas carries an aria-label, but a label names the game once and then
  // never changes, so a screen reader was told nothing at all as the board filled.
  // Every board change already funnels through after(), so one announcement here
  // covers placing, clearing, undo and hint without narrating the animation.
  function announce() {
    const el = document.getElementById('live');
    if (!el) return;
    const p = placed(), b = blanks(), c = conflicts();
    const msg = phase === 'won'
      ? 'Window ' + level + ' complete.'
      : p + ' of ' + b + ' panes placed' + (c ? ', ' + c + (c === 1 ? ' clash' : ' clashes') : '') + '.';
    if (msg === lastSaid) return;       // repeating a string is not re-announced
    lastSaid = msg;
    el.textContent = msg;
  }
  function after(now) {
    save();
    animEnd = now + 420;
    if (solvedNow() && phase === 'play') {
      phase = 'won'; wonT = now; animEnd = now + 1500;
      T().levelComplete(level, history.length); snd.win();
    }
    ensureAnim(now);
    announce();
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
        for (const [a, b] of CONS_AT[d]) {
          const o = a === d ? b : a;
          if (live[o] < 0) continue;
          if (t === live[o]) { ok = false; break; }
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
  const needsAnim = (t) => t < animEnd || phase === 'menu' || winSpinning(t) ||
    (!REDUCED && (seamBad.length > 0 || (phase === 'play' && placed() < blanks())));
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
  // LEVELS. The whole bed used to sit at roughly 43% of the shared library's
  // own numbers: placing a pane was 0.030 against `drop`'s 0.070, which is the
  // level sfx.js uses for `click` and `tick`, its UI chrome. The win was 0.045
  // against 0.08 to 0.10, but it is a SUSTAINED chime at 900ms where a
  // placement is a 60ms blip, so the win registered and nothing else did. The
  // owner reported the game as having no sound but the level-complete one, and
  // it had six. Everything below is lifted toward the house numbers without
  // reaching them, because "games to help you unwind" is a real reason to sit
  // under standard. 43% is not restraint though, it is inaudible.
  //
  // THE COPIES. Placing one pane lands it in N_FOLD wedges on a 45ms stagger,
  // and that whole cascade made ONE blip. Each copy gets its own tick now, on
  // the SAME constant the draw ripples with, so sight and sound cannot drift
  // apart: six notes at six-fold, two at two-fold.
  //
  // Same PITCH for every copy, deliberately. They ARE copies. A rising figure
  // would say they were different from one another, which is the opposite of
  // what the game is about. Only the gain falls, like light going round.
  const COPY_MS = 45;            // shared with drawGlass's ripple, moved together or not at all
  const COPY_FALLOFF = 0.72;     // 0.62 buried the last two copies at six-fold
  const PLACE_GAIN = 0.055;      // house `drop` is 0.070
  const snd = {
    on: () => !!(sfx && sfx.isOn()),
    ready() { if (sfx) sfx.ensureAudio(); },
    toggle() { if (!sfx) return; sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.tone(880, 0.05, 0.05, 'sine'); },
    // the pane you touched, then its copies going round the wheel. tone() bails
    // on its own when muted, so a cascade cut off mid-flight needs no guard.
    place() {
      if (!sfx) return;
      sfx.tone(523.25, 0.06, PLACE_GAIN, 'sine');
      sfx.tone(1046.5, 0.05, PLACE_GAIN * 0.38, 'sine');
      let g = PLACE_GAIN;
      for (let k = 1; k < N_FOLD; k++) {
        g *= COPY_FALLOFF;
        const gain = g;
        setTimeout(() => sfx.tone(523.25, 0.06, gain, 'sine'), k * COPY_MS);
      }
    },
    // Choosing a colour is not placing one. The palette fired the IDENTICAL
    // sound as a placement, which quietly taught that picking and placing were
    // the same act. Higher, shorter, quieter: an intention, not an outcome.
    pick() { if (sfx) sfx.tone(880, 0.035, 0.026, 'sine'); },
    clear() { if (sfx) sfx.tone(392, 0.05, 0.036, 'sine'); },
    undo() { if (sfx) sfx.tone(330, 0.05, 0.032, 'sine'); },
    blocked() { if (sfx) sfx.tone(196, 0.05, 0.022, 'sine'); },
    // one soft chime, per the brief: the resolve is the reward
    win() { if (sfx) { sfx.tone(659.25, 0.9, 0.070, 'sine'); sfx.tone(987.77, 0.9, 0.034, 'sine'); sfx.tone(1318.5, 1.1, 0.018, 'sine'); } },
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
    if (k === 's') { shapeOnly = !shapeOnly; save(); render(performance.now()); }
    if (k >= '1' && k <= '4') { sel = +k - 1; render(performance.now()); }
  });

  // ---------- THE WINDOW ----------
  // A MANDALA ROSE WINDOW (owner, 2026-09-26). The flat panes read as juvenile
  // and the marks cut into them as dingbats. The owner asked for the whole
  // figure to be a mandala, intricate from the very first level, in the
  // backlit stained glass of the rose-window mock-up.
  //
  // So every ring carries its own ornament in the lead: petals, a zigzag band,
  // arches, leaves and scallops. Each ornament meets its neighbours at the
  // cell's edges, so it runs unbroken right round the ring. The tracery is
  // there whether a cell is lit or not, which is what makes the window
  // intricate before a single piece is placed. A placed piece lights its cell
  // in that piece's glass, brightest where the light comes through the middle,
  // with a jewel at its heart whose SHAPE also tells the pieces apart.
  //
  // Every cell of a ring is a turn of every other, so each ring's cell is
  // painted ONCE per state into a tile and blitted turned into place. The
  // leading, the rosette and the frame do not change during play and are
  // baked once per layout, so a frame is a few hundred blits and no paths.

  // Returns HEX, not rgb(), because its output is fed back in as a colour.
  // Returning rgb() once made a second pass parse NaN out of the string and
  // take down the whole render.
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  const hx = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  function lighten(c, f) { const [r, g, b] = hex(c); return hx(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f); }
  function darken(c, f) { const [r, g, b] = hex(c); return hx(r * (1 - f), g * (1 - f), b * (1 - f)); }

  // THE GLASS. Game art, so it carries its own palette (DESIGN-SYSTEM 1.5):
  // ruby, amber, emerald and sapphire. Each has a ground (the cell behind the
  // ornament), a main (the ornament), an accent (its inner detail) and a gem.
  const LEAD_INK = '#120F16';
  const GLASS = [
    { ground: '#8E1426', main: '#D8283A', accent: '#F26A3A', gem: '#FFD84A' },   // ruby
    { ground: '#A8620E', main: '#F4B82C', accent: '#FFE36A', gem: '#D8283A' },   // amber
    { ground: '#0E5A30', main: '#22A24E', accent: '#8BDB5A', gem: '#FFE36A' },   // emerald
    { ground: '#12307A', main: '#2A62C8', accent: '#48B8EE', gem: '#FFFFFF' },   // sapphire
  ];
  // Unlit glass, and the unlit cells of the wedge, which are yours to fill.
  // Those breathe between WEDGE and WEDGE_HI (see drawGlass).
  const DARK  = { ground: '#15111E', main: '#282036', accent: '#342A46', bead: '#3A3050' };
  const WEDGE = { ground: '#2A2238', main: '#3C3150', accent: '#4A3D60', bead: '#5A4E72' };
  const WEDGE_HI = { ground: lighten(WEDGE.ground, 0.12), main: lighten(WEDGE.main, 0.12),
                     accent: lighten(WEDGE.accent, 0.12), bead: lighten(WEDGE.bead, 0.12) };
  // Colourblind mode: one clear glass for every piece, with the jewel cut dark
  // and large into it, so the shape carries everything the colour did.
  // Its beads stay pale, so the only dark marks in a lit cell are the jewel's.
  const CLEAR_GLASS = { ground: '#3E4658', main: '#7E889C', accent: '#AEB8CA', gem: LEAD_INK, bead: '#DDE3EE' };
  const GOLD = '#E8C77A';                      // the beads along the lead
  const WARM = 'rgba(255,214,150,';            // the light round the window and along the wedge
  const STONE = '#6E655C', STONE_LIT = '#9A9084';

  // THE ORNAMENTS, in a cell's own terms: u runs across the cell (0 to 1,
  // clockwise) and v from its inner edge (0) to its outer edge (1). Each is a
  // list of regions filled in order, lead veins, beads, and the spot where the
  // jewel sits. `small` marks the ornaments whose jewel sits in a narrow place.
  function quadPts(p0, c, p1, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      out.push([(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0],
                (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]]);
    }
    return out;
  }
  function ovalPts(cu, cv, ru, rv, n, from, to) {
    const out = [];
    from = from || 0; to = to == null ? TAU : to;
    for (let i = 0; i <= n; i++) { const a = from + (to - from) * i / n; out.push([cu + Math.cos(a) * ru, cv + Math.sin(a) * rv]); }
    return out;
  }
  const CELL_BOX = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const ORN = {
    petal: { regions: [
        ['ground', CELL_BOX],
        ['main', [...quadPts([0.08, 0.02], [0.0, 0.62], [0.5, 0.97], 14), ...quadPts([0.5, 0.97], [1.0, 0.62], [0.92, 0.02], 14)]],
        ['accent', [...quadPts([0.27, 0.06], [0.2, 0.52], [0.5, 0.78], 12), ...quadPts([0.5, 0.78], [0.8, 0.52], [0.73, 0.06], 12)]],
        ['accent', ovalPts(0, 0.84, 0.09, 0.1, 16, -Math.PI / 2, Math.PI / 2)],
        ['accent', ovalPts(1, 0.84, 0.09, 0.1, 16, Math.PI / 2, Math.PI * 1.5)],
      ], veins: [[[0.5, 0.06], [0.5, 0.2], [0.5, 0.22]], [[0.5, 0.52], [0.5, 0.66], [0.5, 0.76]]],
      beads: [[0.2, 0.2], [0.8, 0.2], [0.14, 0.42], [0.86, 0.42]], gem: [0.5, 0.36] },
    zigzag: { regions: [
        ['ground', CELL_BOX],
        ['main', [[0, 0.88], [0.5, 0.46], [1, 0.88], [1, 0.60], [0.5, 0.18], [0, 0.60]]],
        ['accent', [[0.5, 0.62], [0.62, 0.78], [0.5, 0.94], [0.38, 0.78]]],
        ['accent', [[0, 0.08], [0.1, 0.24], [0, 0.40]]],
        ['accent', [[1, 0.08], [0.9, 0.24], [1, 0.40]]],
      ], veins: [[[0, 0.74], [0.25, 0.53], [0.5, 0.32]], [[0.5, 0.32], [0.75, 0.53], [1, 0.74]]],
      beads: [[0.25, 0.9], [0.75, 0.9], [0.5, 0.06], [0.3, 0.2], [0.7, 0.2]], gem: [0.5, 0.78], small: true },
    arch: { regions: [
        ['ground', CELL_BOX],
        ['main', [...quadPts([0.06, 0.03], [0.04, 0.6], [0.5, 0.95], 14), ...quadPts([0.5, 0.95], [0.96, 0.6], [0.94, 0.03], 14)]],
        ['accent', [...quadPts([0.5, 0.74], [0.26, 0.52], [0.3, 0.34], 10), ...ovalPts(0.5, 0.34, 0.2, 0.2, 18, Math.PI, 0).slice(1),
                    ...quadPts([0.7, 0.34], [0.74, 0.52], [0.5, 0.74], 10).slice(1)]],
        ['accent', ovalPts(0, 0.8, 0.08, 0.1, 14, -Math.PI / 2, Math.PI / 2)],
        ['accent', ovalPts(1, 0.8, 0.08, 0.1, 14, Math.PI / 2, Math.PI * 1.5)],
        ['accent', ovalPts(0.5, 0.86, 0.05, 0.05, 12)],
      ], beads: [[0.18, 0.12], [0.82, 0.12], [0.5, 0.08]], gem: [0.5, 0.36] },
    leaves: { regions: [
        ['ground', CELL_BOX],
        ['main', [...quadPts([0.16, 0.04], [0.06, 0.6], [0.44, 0.94], 12), ...quadPts([0.44, 0.94], [0.38, 0.4], [0.16, 0.04], 12)]],
        ['main', [...quadPts([0.56, 0.04], [0.46, 0.6], [0.84, 0.94], 12), ...quadPts([0.84, 0.94], [0.78, 0.4], [0.56, 0.04], 12)]],
        ['accent', [[0.44, 1], [0.56, 1], [0.5, 0.8]]],
        ['accent', [[0.96, 1], [1, 1], [1, 0.84]]], ['accent', [[0, 1], [0.04, 1], [0, 0.84]]],
      ], veins: [[[0.16, 0.04], [0.3, 0.5], [0.44, 0.94]], [[0.56, 0.04], [0.7, 0.5], [0.84, 0.94]],
                 [[0.24, 0.3], [0.22, 0.42], [0.17, 0.5]], [[0.3, 0.52], [0.28, 0.64], [0.23, 0.72]],
                 [[0.64, 0.3], [0.62, 0.42], [0.57, 0.5]], [[0.7, 0.52], [0.68, 0.64], [0.63, 0.72]]],
      beads: [[0.5, 0.62], [0.06, 0.2], [0.94, 0.2]], gem: [0.5, 0.3], small: true },
    scallop: { regions: [
        ['ground', CELL_BOX],
        ['accent', [[0, 0], [1, 0], [1, 0.14], [0, 0.14]]],
        ['main', ovalPts(0.5, 1, 0.46, 0.5, 24, Math.PI, TAU)],
        ['accent', ovalPts(0.2, 0.34, 0.07, 0.09, 14)], ['accent', ovalPts(0.8, 0.34, 0.07, 0.09, 14)],
      ], beads: [[0.5, 0.3], [0.12, 0.7], [0.88, 0.7]], gem: [0.5, 0.74], small: true },
  };
  // Ring by ring from the middle out, for each size of board.
  const RING_ORN = { 2: ['petal', 'leaves'], 3: ['petal', 'zigzag', 'leaves'],
                     4: ['petal', 'zigzag', 'arch', 'leaves'],
                     5: ['petal', 'zigzag', 'arch', 'leaves', 'scallop'] };
  const ornName = (r) => (RING_ORN[RINGS] || RING_ORN[5])[r] || 'petal';
  // Line weights follow the size of the window. The mock-up was drawn on one
  // 268 across; the floor keeps the lead a real line on a small phone.
  const lineScale = (R) => Math.max(0.72, Math.min(1.1, R / 268));

  // The jewel at a lit cell's heart. Its SHAPE tells the pieces apart, colour
  // or no colour: a lozenge, a star, a leaning drop and a quatrefoil. Pointed
  // outward, so it turns with the wheel like everything else in the figure.
  function jewel(g, x, y, sz, ang, t, col) {
    g.save();
    g.translate(x, y); g.rotate(ang + Math.PI / 2); g.scale(sz, sz);
    g.fillStyle = col; g.strokeStyle = LEAD_INK; g.lineWidth = 0.12; g.lineJoin = 'round';
    g.beginPath();
    if (t === 0) { g.moveTo(0, -1); g.lineTo(0.55, 0); g.lineTo(0, 1); g.lineTo(-0.55, 0); }
    else if (t === 1) {
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.42 : 1; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    } else if (t === 2) {
      g.moveTo(0.15, -1); g.bezierCurveTo(0.95, -0.1, 0.65, 0.9, 0, 0.9); g.bezierCurveTo(-0.65, 0.9, -0.75, 0.05, 0.15, -1);
    } else {
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        g.moveTo(Math.cos(a) * 0.5 + 0.48, Math.sin(a) * 0.5); g.arc(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.48, 0, TAU);
      }
    }
    g.closePath(); g.fill(); g.stroke();
    g.restore();
  }

  // Which glass a tile is painted in: 'dark', 'wedge', 'wedgeHi', 'lit0' to
  // 'lit3', or 'plain0' to 'plain3' for the colourblind mode.
  function glassState(key) {
    if (key === 'dark') return { pal: DARK };
    if (key === 'wedge') return { pal: WEDGE };
    if (key === 'wedgeHi') return { pal: WEDGE_HI };
    const tok = +key.slice(-1), plain = key[0] === 'p';
    return { pal: plain ? CLEAR_GLASS : GLASS[tok], lit: true, tok, plain };
  }
  const litKey = (t) => (shapeOnly ? 'plain' : 'lit') + t;

  const FINE_MIN = 20;                         // px on a cell's short side
  // One cell, painted about the centre (0, 0) between radii r0 and r1 and
  // angles a0 and a1: the ground, the ornament, its veins and beads, and the
  // jewel if the cell is lit. `s` is the line scale.
  function paintCell(g, r0, r1, a0, a1, O, st, s) {
    const map = (u, v) => { const a = a0 + u * (a1 - a0), rr = r0 + v * (r1 - r0); return [Math.cos(a) * rr, Math.sin(a) * rr]; };
    const trace = (pts) => {
      g.beginPath();
      pts.forEach(([u, v], i) => { const [x, y] = map(u, v); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    };
    const sector = () => { g.beginPath(); g.arc(0, 0, r1, a0, a1); g.arc(0, 0, r0, a1, a0, true); g.closePath(); };
    const am = (a0 + a1) / 2, rm = (r0 + r1) / 2, mx = Math.cos(am) * rm, my = Math.sin(am) * rm;
    const span = Math.max(r1 - r0, rm * (a1 - a0)), short = Math.min(r1 - r0, rm * (a1 - a0));
    const pal = st.pal;
    g.save();
    sector(); g.clip();
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (const [cls, pts] of O.regions) {
      if (cls === 'ground') sector(); else { trace(pts); g.closePath(); }   // the ground follows the arcs
      let col = pal[cls];
      // Backlit: each piece of glass is brightest where the light comes
      // through the middle of its cell.
      if (st.lit) {
        const gg = g.createRadialGradient(mx, my, 1, mx, my, span * 0.8);
        gg.addColorStop(0, lighten(col, cls === 'ground' ? 0.30 : 0.42));
        gg.addColorStop(0.7, col);
        gg.addColorStop(1, darken(col, 0.18));
        col = gg;
      }
      g.fillStyle = col; g.fill();
      g.strokeStyle = LEAD_INK; g.lineWidth = Math.max(1, 1.7 * s); g.stroke();
    }
    // Veins and beads only where a cell is big enough to show them. On the
    // rules card's little window they were noise, and the demo has to read at
    // a glance.
    const fine = short >= FINE_MIN;
    g.strokeStyle = LEAD_INK; g.lineWidth = Math.max(0.8, 1.1 * s);
    for (const vn of fine ? O.veins || [] : []) { trace(quadPts(vn[0], vn[1], vn[2], 12)); g.stroke(); }
    const br = Math.max(1.4, short * 0.045);
    for (const [bu, bv] of fine ? O.beads || [] : []) {
      const [bx, by] = map(bu, bv);
      g.beginPath(); g.arc(bx, by, br, 0, TAU);
      g.fillStyle = st.lit && !st.plain ? pal.gem : pal.bead; g.fill();
      g.lineWidth = Math.max(0.7, 0.9 * s); g.stroke();
    }
    if (st.lit) {
      const [gx, gy] = map(O.gem[0], O.gem[1]);
      const room = Math.min(r1 - r0, (r0 + (r1 - r0) * O.gem[1]) * (a1 - a0));
      const k = st.plain ? (O.small ? 0.26 : 0.3) : (O.small ? 0.16 : 0.2);
      jewel(g, gx, gy, room * k, am, st.tok, pal.gem);
    }
    g.restore();
  }

  // One ring's first cell, painted once per state and kept. Keyed on its
  // geometry, so the rules card's little window shares the cache with the
  // board; resizeCanvas() empties it when the pixel scale moves.
  function glassTile(r0, r1, sec, orn, state, s) {
    const key = r0.toFixed(2) + '|' + r1.toFixed(2) + '|' + sec + '|' + orn + '|' + state + '|' + s.toFixed(3);
    let t = glassTiles.get(key);
    if (t) return t;
    const a0 = A0, a1 = A0 + TAU / sec;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k <= 12; k++) {
      const a = a0 + (a1 - a0) * k / 12;
      for (const rr of [r0, r1]) {
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    x0 = Math.floor(x0) - 2; y0 = Math.floor(y0) - 2; x1 = Math.ceil(x1) + 2; y1 = Math.ceil(y1) + 2;
    // At least twice the logical size, so a tile turned into place is sampled
    // from more pixels than it lands on and the tracery stays sharp on a 1x
    // screen.
    const K = Math.max(2, PIXEL_SCALE);
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((x1 - x0) * K); cv.height = Math.ceil((y1 - y0) * K);
    const g = cv.getContext('2d');
    g.setTransform(K, 0, 0, K, -x0 * K, -y0 * K);
    paintCell(g, r0, r1, a0, a1, ORN[orn], glassState(state), s);
    if (glassTiles.size > 400) glassTiles.clear();
    t = { cv, x: x0, y: y0, w: cv.width / K, h: cv.height / K };
    glassTiles.set(key, t);
    return t;
  }
  // A tile turned about (cx, cy) into sector `rot`.
  function blitTile(t, cx, cy, rot, alpha) {
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(rot);
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(t.cv, t.x, t.y, t.w, t.h);
    ctx.restore();
  }

  // THE ROSETTE at the middle: twelve petals, a star and a sapphire boss.
  function paintRosette(g, hr, s) {
    for (let i = 0; i < 12; i++) {
      const a = A0 + i * TAU / 12, w = TAU / 24;
      g.beginPath();
      g.moveTo(Math.cos(a - w) * hr * 0.45, Math.sin(a - w) * hr * 0.45);
      g.quadraticCurveTo(Math.cos(a - w) * hr * 1.02, Math.sin(a - w) * hr * 1.02, Math.cos(a) * hr, Math.sin(a) * hr);
      g.quadraticCurveTo(Math.cos(a + w) * hr * 1.02, Math.sin(a + w) * hr * 1.02, Math.cos(a + w) * hr * 0.45, Math.sin(a + w) * hr * 0.45);
      g.closePath();
      g.fillStyle = i % 2 ? GLASS[1].main : GLASS[0].main; g.fill();
      g.strokeStyle = LEAD_INK; g.lineWidth = Math.max(1, 1.4 * s); g.stroke();
    }
    g.beginPath();
    for (let i = 0; i < 24; i++) { const a = A0 + i * TAU / 24, r = i % 2 ? hr * 0.3 : hr * 0.48; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath();
    g.fillStyle = GLASS[1].accent; g.fill(); g.lineWidth = Math.max(1, 1.2 * s); g.stroke();
    g.beginPath(); g.arc(0, 0, hr * 0.2, 0, TAU);
    g.fillStyle = GLASS[3].main; g.fill(); g.stroke();
  }

  // THE NET, which turns with the figure: the heavy lead between the cells, a
  // beaded band on every ring's edge, and the rosette. Drawn about (0, 0).
  function paintNet(g, rr, secOf, s) {
    const n = rr.length - 1;
    g.save();
    g.strokeStyle = LEAD_INK; g.lineCap = 'round';
    g.lineWidth = Math.max(1.6, 3.2 * s);
    for (let r = 0; r < n; r++) {
      const S = secOf(r);
      g.beginPath();
      for (let k = 0; k < S; k++) {
        const a = A0 + k * TAU / S;
        g.moveTo(Math.cos(a) * rr[r], Math.sin(a) * rr[r]);
        g.lineTo(Math.cos(a) * rr[r + 1], Math.sin(a) * rr[r + 1]);
      }
      g.stroke();
    }
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.arc(0, 0, rr[i], 0, TAU);
      g.lineWidth = Math.max(2, 5 * s); g.strokeStyle = LEAD_INK; g.stroke();
      // A multiple of six, so a turn of one fold step lands every bead on a
      // bead. None where they would sit closer than 6px, which is only ever the
      // rules card's little window.
      if (9 * s < 6) continue;
      const m = 6 * Math.max(1, Math.round(TAU * rr[i] / (9 * s) / 6)), br = Math.max(0.8, 1.25 * s);
      g.fillStyle = GOLD; g.beginPath();
      for (let k = 0; k < m; k++) {
        const a = k * TAU / m, x = Math.cos(a) * rr[i], y = Math.sin(a) * rr[i];
        g.moveTo(x + br, y); g.arc(x, y, br, 0, TAU);
      }
      g.fill();
    }
    g.restore();
    paintRosette(g, rr[0] - 3 * s, s);
  }
  // THE WEDGE YOU FILL, outlined in warm light over the lead: its two radial
  // edges and its outer arc. Its own layer, because it fades as the win begins:
  // the wedge's work is done, and without it a turn of one fold step lands the
  // figure exactly on itself. `K` is device pixels per unit, because a
  // shadow's blur ignores the transform.
  function paintWedge(g, rr, fold, s, K) {
    const n = rr.length - 1, w0 = A0, w1 = A0 + TAU / fold;
    g.save();
    g.strokeStyle = WARM + '0.85)'; g.lineWidth = Math.max(1.2, 1.6 * s); g.lineCap = 'round';
    g.shadowColor = 'rgba(255,200,120,0.9)'; g.shadowBlur = 8 * s * K;
    g.beginPath();
    g.moveTo(Math.cos(w0) * rr[0], Math.sin(w0) * rr[0]);
    g.lineTo(Math.cos(w0) * rr[n], Math.sin(w0) * rr[n]);
    g.arc(0, 0, rr[n], w0, w1);
    g.lineTo(Math.cos(w1) * rr[0], Math.sin(w1) * rr[0]);
    g.stroke();
    g.restore();
  }

  // THE FRAME, which never turns: the stone the window is set in and, where
  // measureBoard() left room for it, a mandala's border of leaves.
  function paintFrame(g, s) {
    const disc = (r, col) => { g.fillStyle = col; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); };
    const stone = Math.max(3, Math.min(11, border * 0.36));
    disc(frameR, STONE);
    disc(frameR - stone * 0.35, STONE_LIT);
    disc(frameR - stone, LEAD_INK);
    const base = boardR + 2 * s, tip = frameR - stone - 3 * s;
    if (tip - base >= 5) {
      const n = SEC(RINGS - 1) * 2, mid = (base + tip) / 2;
      const p = (ang, r) => [Math.cos(ang) * r, Math.sin(ang) * r];
      for (let i = 0; i < n; i++) {
        const a = A0 + (i + 0.5) * TAU / n, w = TAU / n * 0.62;
        g.beginPath(); g.moveTo(...p(a - w, base));
        g.quadraticCurveTo(...p(a - w * 0.9, mid), ...p(a, tip));
        g.quadraticCurveTo(...p(a + w * 0.9, mid), ...p(a + w, base));
        g.closePath();
        g.fillStyle = i % 2 ? GLASS[3].main : GLASS[2].main; g.fill();
        g.strokeStyle = LEAD_INK; g.lineWidth = Math.max(1, 1.6 * s); g.stroke();
        g.beginPath(); g.moveTo(...p(a, base + 2 * s)); g.lineTo(...p(a, tip - 5 * s));
        g.strokeStyle = 'rgba(18,15,22,0.7)'; g.lineWidth = Math.max(0.8, s); g.stroke();
      }
    }
    disc(boardR + 1.5 * s, LEAD_INK);
  }

  // The three bakes, redone only when the layout, the board or the pixel
  // scale moves. Each is a square about the window's centre.
  let frameBake = null, netBake = null, wedgeBake = null, bakeKey = '';
  function bakeCanvas() {
    const K = PIXEL_SCALE, half = Math.ceil(frameR + 4);
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.ceil(half * 2 * K);
    const g = cv.getContext('2d');
    g.setTransform(K, 0, 0, K, cv.width / 2, cv.height / 2);
    return { cv, g, half };
  }
  function ensureBakes() {
    const key = [frameR.toFixed(2), boardR.toFixed(2), RINGS, N_FOLD, PIXEL_SCALE.toFixed(3)].join('|');
    if (key === bakeKey && frameBake && netBake && wedgeBake) return;
    bakeKey = key;
    const s = lineScale(frameR);
    frameBake = bakeCanvas(); paintFrame(frameBake.g, s);
    netBake = bakeCanvas(); paintNet(netBake.g, ringR, SEC, s);
    wedgeBake = bakeCanvas(); paintWedge(wedgeBake.g, ringR, N_FOLD, s, PIXEL_SCALE);
  }
  const drawBake = (b) => ctx.drawImage(b.cv, -b.half, -b.half, b.half * 2, b.half * 2);

  // ---------- THE SOLVED WHEEL TURNS ----------
  // Orbit does this in one line: the solved mandala drifts at 0.09 rad/s from
  // 300ms after the win. Kaleido can mean more by it. This wheel has EXACT
  // N-fold rotational symmetry and its copies literally are rotations, so a
  // turn of one fold step lands the figure back on itself. That is the game's
  // whole idea stated in motion rather than decorated: your wedge is every
  // wedge. The tracery and the jewels are what make it legible, because a
  // wheel of flat colour just looks like colours sliding around.
  //
  // The step duration grows with the fold but not in proportion to it. A fold
  // step is 60 degrees at six-fold and a 180 degree half turn at two-fold, and
  // holding the duration constant made the late levels whip round; scaling it
  // linearly made them crawl. The square root splits the difference.
  //
  // LOCKED to 'both' by the owner on 2026-08-24 after comparing all four: the
  // wheel lands its fold step, then drifts on from where it landed. The mode
  // was briefly switchable from the URL so the four could be compared by
  // clicking, and that parameter is gone. This file deliberately dropped its
  // ?level= shortcut before launch and the same reasoning applies: a URL
  // knob on a shipped game is a knob a player can find.
  //
  // The cost of 'both', stated plainly because it is real: a drift never ends,
  // so needsAnim holds the loop open and the win screen redraws until the
  // player taps. 'step' is the only mode that lets the frame go quiet. That
  // was weighed and the landing plus the drift won.
  const WIN_SPIN_DELAY = 300;          // matches Orbit
  const WIN_DRIFT = 0.09;              // rad/s, matches Orbit exactly
  const WIN_STEP_BASE = 1400;          // ms for a six-fold step
  // Still a `let` so __kaleido.spin() can drive it in testing. Nothing on the
  // shipped path writes to it.
  let WIN_SPIN = 'both';               // 'off' | 'drift' | 'step' | 'both'
  const winStepMs = () => WIN_STEP_BASE * Math.sqrt((TAU / N_FOLD) / (TAU / 6));
  // Is the wheel still moving? needsAnim asks, because a drift never ends and
  // the loop has to be held open, while a step has to let it close again.
  const winSpinning = (t) => !REDUCED && phase === 'won' && WIN_SPIN !== 'off' &&
    (WIN_SPIN !== 'step' || t < wonT + WIN_SPIN_DELAY + winStepMs());
  function winSpin(now) {
    if (REDUCED || phase !== 'won' || WIN_SPIN === 'off') return 0;
    const t = now - wonT - WIN_SPIN_DELAY;
    if (t <= 0) return 0;
    if (WIN_SPIN === 'drift') return t / 1000 * WIN_DRIFT;
    const step = TAU / N_FOLD, ms = winStepMs();
    const landed = step * ease(Math.min(1, t / ms));
    if (WIN_SPIN === 'step') return landed;
    return landed + Math.max(0, t - ms) / 1000 * WIN_DRIFT;   // 'both'
  }

  // ---------- RENDER ----------
  function cellCentre(r, s) {
    const rm = (ringR[r] + ringR[r + 1]) / 2;
    const am = A0 + (s + 0.5) * (TAU / SEC(r));
    return { x: bcx + rm * Math.cos(am), y: bcy + rm * Math.sin(am), a: am, rm };
  }
  // The cell's SHORT side in px, which decides how big anything drawn over it
  // can be.
  function cellShort(r) {
    const th = Math.max(6, ringR[r + 1] - ringR[r]);
    const rm = (ringR[r] + ringR[r + 1]) / 2;
    const arc = Math.max(6, TAU * rm / SEC(r));
    return Math.min(th, arc);
  }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  function render(now) {
    ctx.clearRect(0, 0, LW, LH);
    uiButtons = [];
    ensureBakes();
    drawBackdrop();
    // The frame never turns. Only the FIGURE does: the glass, its lead and the
    // rosette. The light, the HUD, the palette and the win banner stay put, or
    // the whole frame swims.
    ctx.save(); ctx.translate(bcx, bcy); drawBake(frameBake); ctx.restore();
    drawGlass(now, winSpin(now));
    drawBloom(now);
    drawSeamBreaks();
    drawHint(now);
    drawHUD();
    // During the win the figure IS the reward, so nothing overlays it. The top
    // band hands its space to the banner instead of the controls.
    if (phase === 'play') { drawPalette(); drawControls(); }
    if (phase === 'won') drawPalette();
    if (phase === 'won') winBloom(now);
    if (phase === 'menu') menuOverlay(now);
  }

  // The wall the window is set in, and the warm light spilling round it.
  function drawBackdrop() {
    const bg = ctx.createRadialGradient(bcx, bcy, frameR * 0.22, bcx, bcy, frameR * 2);
    bg.addColorStop(0, '#3A3044'); bg.addColorStop(1, '#120E17');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);
    const gl = ctx.createRadialGradient(bcx, bcy, frameR * 0.76, bcx, bcy, frameR * 1.38);
    gl.addColorStop(0, WARM + '0.24)'); gl.addColorStop(1, WARM + '0)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, LW, LH);
  }

  // The light through the whole window. It brightens as the figure fills, so
  // progress is felt before it is counted, and again when the figure is whole.
  function drawBloom(now) {
    const fill = NDOM ? placed() / NDOM : 0;
    const w = phase === 'won' ? Math.min(1, (now - wonT) / 900) : 0;
    const a = 0.13 + fill * 0.05 + w * 0.14;
    const bl = ctx.createRadialGradient(bcx, bcy, 0, bcx, bcy, boardR);
    bl.addColorStop(0, 'rgba(255,240,210,' + a.toFixed(3) + ')');
    bl.addColorStop(0.6, 'rgba(255,240,210,' + (a * 0.25).toFixed(3) + ')');
    bl.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = bl; ctx.beginPath(); ctx.arc(bcx, bcy, boardR, 0, TAU); ctx.fill();
    ctx.restore();
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
  // The hot came, over the lead at the exact edge that is in trouble. The lead
  // thickens there and runs hot along its middle: the light stops coming
  // through where the rule is broken, and the break glows.
  function drawSeamBreaks() {
    if (!seamBad.length) return;
    const s = lineScale(frameR);
    const path = (e) => {
      ctx.beginPath();
      if (e.kind === 'ang') {
        const pad = 2 * s;
        ctx.moveTo(bcx + (ringR[e.r] + pad) * Math.cos(e.ang), bcy + (ringR[e.r] + pad) * Math.sin(e.ang));
        ctx.lineTo(bcx + (ringR[e.r + 1] - pad) * Math.cos(e.ang), bcy + (ringR[e.r + 1] - pad) * Math.sin(e.ang));
      } else {
        const rr = ringR[e.r + 1], pad = 2 * s / Math.max(1, rr);
        ctx.arc(bcx, bcy, rr, e.a0 + pad, e.a1 - pad);
      }
    };
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = LEAD_INK; ctx.lineWidth = Math.max(3.5, 6.5 * s);
    for (const e of seamBad) { path(e); ctx.stroke(); }
    ctx.shadowColor = 'rgba(255,107,92,0.95)'; ctx.shadowBlur = 12 * PIXEL_SCALE;
    ctx.strokeStyle = '#FF6B5C'; ctx.lineWidth = Math.max(1.8, 2.8 * s);   // --accent-text
    for (const e of seamBad) { path(e); ctx.stroke(); }
    ctx.restore();
  }

  // The glass, cell by cell, then the net over it, all turned by `spin`.
  function drawGlass(now, spin) {
    hitCells = [];
    computeSeamBad(now);
    const s = lineScale(frameR);
    // The unlit cells in the LIT WEDGE breathe. Marking the wedge with a
    // heavier came was what made the line weights look wrong, and marking it
    // with a stronger glow alone turned out to be invisible at real size. Light
    // that MOVES is unmissable, costs no contrast, and is the honest cue here:
    // those are the cells waiting for glass. Reduced motion gets the bright end
    // of the same range, held still.
    const breathe = REDUCED ? 1 : 0.5 + 0.5 * Math.sin(now / 620);
    for (let r = 0; r < RINGS; r++) {
      const S = SEC(r), w = TAU / S, step = DOMSEC(r), r0 = ringR[r], r1 = ringR[r + 1], orn = ornName(r);
      for (let sc = 0; sc < S; sc++) {
        const i = OFF[r] + sc, t = tokAt(i), inWedge = sc < step, rot = spin + sc * w;
        let al = 0;
        if (t >= 0) {
          const { d } = domainOf(i), lock = isLocked(i);
          // the placement ripples outward from the wedge into its copies
          const delay = lock ? 0 : (Math.floor(sc / step) * COPY_MS);
          const p = lock ? 1 : Math.min(1, Math.max(0, (now - placeT[d] - delay) / 260));
          al = ease(p);
          // A pane in a broken pair pulses, since a pane cannot lean away from
          // its neighbour the way a small shape could. The hot came between
          // them says where; this says which two.
          if (nudge[i]) al *= REDUCED ? 0.62 : 0.55 + 0.25 * (0.5 + 0.5 * Math.sin(now / 190));
          // the refusal: a fixed pane flashes back when you try to change it
          const rf = (now - refuseT) / 340;
          if (i === refuseCell && rf >= 0 && rf < 1) al *= 1 - 0.45 * Math.abs(Math.sin(rf * Math.PI * 2.5)) * (1 - rf);
        }
        // The unlit glass is always under it, so a pane fading in or pulsing
        // shows the tracery through it rather than a hole.
        if (al < 1) {
          blitTile(glassTile(r0, r1, S, orn, inWedge ? 'wedge' : 'dark', s), bcx, bcy, rot, 1);
          if (inWedge && t < 0) blitTile(glassTile(r0, r1, S, orn, 'wedgeHi', s), bcx, bcy, rot, breathe);
        }
        if (al > 0) blitTile(glassTile(r0, r1, S, orn, litKey(t), s), bcx, bcy, rot, al);
      }
    }
    ctx.save(); ctx.translate(bcx, bcy); if (spin) ctx.rotate(spin);
    drawBake(netBake);
    const wa = phase === 'won' ? (REDUCED ? 0 : Math.max(0, 1 - (now - wonT) / 500)) : 1;
    if (wa > 0) { ctx.globalAlpha = wa; drawBake(wedgeBake); }
    ctx.restore();
  }

  // The hint: a ring of light closes onto the pane it just filled, and onto
  // each copy as the ripple reaches it.
  function drawHint(now) {
    if (hintCell < 0 || hintCell >= NDOM) return;
    const hp = (now - hintT) / 900;
    if (hp < 0 || hp >= 1) return;
    ctx.save();
    ctx.globalAlpha = (1 - hp) * 0.9;
    ctx.strokeStyle = Z.accent2; ctx.lineWidth = 2;
    for (const i of orbitOf(hintCell)) {
      const { r, s } = cellRS(i);
      if (now - hintT < domainOf(i).k * COPY_MS) continue;
      const cc = cellCentre(r, s);
      ctx.beginPath();
      ctx.arc(cc.x, cc.y, cellShort(r) * 0.52 * (1 + 1.8 * (1 - ease(hp))), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  // THE READ-OUT, at the bottom left (DESIGN-SYSTEM 4.3): one line, Ink 72,
  // 600 16px. A line that will not fit takes a shorter form, never a smaller
  // size, so a 320-wide phone gets fewer words.
  //
  // No count of clashes. The wedge-level number (34) and the number of marks
  // the player can actually see on the board (186, once symmetry has copied
  // each break six times) are both true and neither is reconcilable with the
  // other, so a figure here is worse than none. The board says WHERE; this
  // says WHAT, in the same words the rules card uses.
  const READ_SEP = '   ·   ';
  function readoutForms() {
    const lv = 'LEVEL ' + level;
    if (seamBreaks()) {
      const what = shapeOnly ? 'SHAPES TOUCHING' : 'COLOURS TOUCHING';
      return [lv + READ_SEP + what, what];
    }
    const pb = placed() + '/' + blanks();
    return [lv + READ_SEP + pb + ' GAPS FILLED', lv + READ_SEP + pb + ' FILLED', lv + READ_SEP + pb, pb];
  }
  function drawHUD() {
    // Not behind the rules card, and not over the win.
    if (phase === 'won' || phase === 'menu') return;
    const right = MODE === 'mobile' ? soundBox().x - 8 : LW - SIDE_PAD;
    ctx.font = '600 16px Inter, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.72)';                       // Ink 72
    const forms = readoutForms();
    const line = forms.find((f) => SIDE_PAD + ctx.measureText(f).width <= right) || forms[forms.length - 1];
    ctx.fillText(line, SIDE_PAD, Math.round(LH - botBand() / 2));
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  // The token palette. Four large targets, comfortably over the 56px the touch
  // budget asks for, sitting where a thumb already is on a phone.
  function drawPalette() {
    const n = NSHAPE, sz = SW, gap = SW_GAP;
    const total = n * sz + (n - 1) * gap;
    const vertical = MODE !== 'mobile';
    // Column down the right beside the wheel, or a row beneath it on a phone.
    let x = vertical ? LW - SIDE_PAD - sz : Math.round(LW / 2 - total / 2);
    let y = vertical ? Math.round(bcy - total / 2) : Math.round(paletteCY() - sz / 2);
    for (let t = 0; t < n; t++) {
      const on = sel === t;
      const bx = Math.round(x), by = Math.round(y);
      ctx.fillStyle = on ? 'rgba(255,255,255,0.155)' : 'rgba(255,255,255,0.055)';
      ZUI.roundRectPath(ctx, bx, by, sz, sz, 15); ctx.fill();
      if (on) { ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.62)'; ZUI.roundRectPath(ctx, bx, by, sz, sz, 15); ctx.stroke(); }
      // Each swatch is a piece of the glass itself, lit, with its jewel, so the
      // palette is the legend for both channels at once. Full strength, always:
      // fading the unselected ones turned three of the four muddy, and the
      // palette advertised colours the board does not use. Selection is the
      // surrounding pill.
      const G = shapeOnly ? CLEAR_GLASS : GLASS[t], m = 8, gw = sz - m * 2;
      const gcx = bx + sz / 2, gcy = by + sz / 2;
      const gg = ctx.createRadialGradient(gcx, gcy, 2, gcx, gcy, gw * 0.7);
      gg.addColorStop(0, lighten(G.main, 0.3)); gg.addColorStop(1, G.main);
      ZUI.roundRectPath(ctx, bx + m, by + m, gw, gw, 7);
      ctx.fillStyle = gg; ctx.fill();
      ctx.strokeStyle = LEAD_INK; ctx.lineWidth = 2; ctx.stroke();
      jewel(ctx, gcx, gcy, shapeOnly ? 13 : 11, -Math.PI / 2, t, G.gem);
      uiButtons.push({ x: bx, y: by, w: sz, h: sz, act: ((k) => () => { sel = k; snd.pick(); render(performance.now()); })(t) });
      if (vertical) y += sz + gap; else x += sz + gap;
    }
  }

  // The phone's sound switch, bare at the bottom right: its drawing ends 16
  // from the edge and its touch target is still 44 x 44.
  function soundBox() {
    const cy = LH - botBand() / 2, cx = LW - SIDE_PAD - 11;
    return { cx, cy, x: Math.round(Math.min(LW - 44, cx - 20)), y: Math.round(Math.min(LH - 44, cy - 22)), w: 44, h: 44 };
  }
  // The controls, in the fleet's places (DESIGN-SYSTEM 4.2). A phone has
  // round icons across the top in the fleet's order, Undo, Restart, Hint and
  // Rules, with the gaps sharing out the width. A desktop has the sound icon,
  // Undo, Restart and Rules as pills from the left, and Hint at the band's
  // right end, 12 short of the full-screen exit button when that is showing.
  // A dimmed Undo still takes the tap; undo() itself refuses an empty history.
  function drawControls() {
    const ACTS = { undo, hint, restart, rules: () => { phase = 'menu'; ensureAnim(performance.now()); } };
    const dimOf = (id) => id === 'undo' && !history.length;
    const toggleSound = () => { snd.ready(); snd.toggle(); render(performance.now()); };
    if (MODE === 'mobile') {
      const row = ['undo', 'restart', 'hint', 'rules'], D = ZUI.PILL.iconW, cy = topBand() / 2;
      const gap = Math.max(4, Math.min(28, (LW - SIDE_PAD * 2 - row.length * D) / (row.length - 1)));
      row.forEach((id, i) => {
        const cx = SIDE_PAD + D / 2 + i * (D + gap);
        const hit = ZUI.drawRound(ctx, cx, cy);
        ZUI.drawIcon(ctx, id, cx, cy, { dim: dimOf(id) });
        uiButtons.push({ ...hit, act: ACTS[id] });
      });
      const sb = soundBox();
      ZUI.drawIcon(ctx, 'sound', sb.cx, sb.cy, { on: snd.on() });
      uiButtons.push({ x: sb.x, y: sb.y, w: sb.w, h: sb.h, act: toggleSound });
      return;
    }
    const P = ZUI.PILL, cy = Math.round(topBand() / 2);
    let x = SIDE_PAD;
    const sHit = ZUI.drawPill(ctx, '', x + P.iconW / 2, cy, { w: P.iconW });
    ZUI.drawIcon(ctx, 'sound', x + P.iconW / 2, cy, { on: snd.on() });
    uiButtons.push({ ...sHit, act: toggleSound });
    x += P.iconW + P.gap;
    for (const [id, label] of [['undo', 'Undo'], ['restart', 'Restart'], ['rules', 'Rules']]) {
      const w = ZUI.pillWidth(ctx, label);
      uiButtons.push({ ...ZUI.drawPill(ctx, label, x + w / 2, cy, { w, dim: dimOf(id) }), act: ACTS[id] });
      x += w + P.gap;
    }
    const hw = ZUI.pillWidth(ctx, 'Hint');
    uiButtons.push({ ...ZUI.drawPill(ctx, 'Hint', bandRight() - hw / 2, cy, { w: hw }), act: hint });
  }

  function winBloom(now) {
    const t = Math.min(1, Math.max(0, (now - wonT) / 900));
    // a single ring of warm light travelling outward through the leading
    const rr = boardR * (0.2 + 1.05 * ease(t));
    ctx.globalAlpha = (1 - t) * 0.6;
    ctx.strokeStyle = WARM + '1)'; ctx.lineWidth = 3 * (1 - t) + 1;
    ctx.beginPath(); ctx.arc(bcx, bcy, rr, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
    const a = Math.min(1, Math.max(0, (now - wonT - 700) / 500));
    if (a <= 0) return;
    const L = winBannerLayout();
    ctx.globalAlpha = a;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let x = L.x0;
    ctx.font = L.titleFont;
    ctx.fillStyle = Z.green;   ctx.fillText(WIN_TITLE, x, L.cy); x += L.wTitle;
    ctx.font = L.subFont;
    ctx.fillStyle = Z.textDim; ctx.fillText(WIN_SEP + WIN_SUB, x, L.cy);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  // The win banner. ONE line, and placed in the gap between the top of the
  // frame and the RIM OF THE WHEEL rather than inside the top band, because the
  // gap the eye reads is the one to the glass and not the one to an invisible
  // band boundary.
  //
  // It was two lines, 32px over 15px, both hung off topBand() * 0.42. That
  // block is about 48px tall in a strip that is 63, so it had roughly seven
  // pixels of air above it and eight between the second line and the mandala.
  // One line at 20px is 20 tall in the same strip, which leaves real room on
  // both sides.
  //
  // The top pad is CLAMPED rather than simply centred. Centring is right on a
  // desktop, where the strip is barely taller than the line, but a phone gives
  // a strip over twice as tall and the banner floated in the middle of it,
  // detached from the chrome it replaces. Clamped, it sits near the top on a
  // phone and centred on a desktop, and the clearance to the glass is never in
  // question either way.
  const WIN_TITLE = 'IN SYMMETRY';
  const WIN_SUB = 'tap for the next figure';
  const WIN_SEP = '   ·   ';
  const WIN_TITLE_PX = 20, WIN_SUB_PX = 16;      // no copy on this site goes below 16
  const WIN_PAD_MIN = 12, WIN_PAD_MAX = 30, WIN_FLOOR = 0.62;
  function winBannerLayout() {
    // SIDE_PAD alone is not enough room here. It was 18 on a phone, which let
    // the line run 341px across a 390px frame and read as wall to wall even
    // though it technically fitted. Cap the line at 84% of the frame as well,
    // so the air at the sides is proportional to the frame rather than a
    // constant borrowed from the board's own margin.
    const avail = Math.min(LW - SIDE_PAD * 2, LW * 0.84);
    const rim = bcy - frameR;                    // the top of the window's stone
    let k = 1, m = winBannerWidths(k);
    while (k > WIN_FLOOR && m.total > avail) { k = Math.max(WIN_FLOOR, k - 0.03); m = winBannerWidths(k); }
    const lineH = WIN_TITLE_PX * k;
    const half = lineH / 2;
    // Split the strip EVENLY, capped at WIN_PAD_MAX. There is deliberately no
    // lower clamp: forcing a minimum on the top pad is what pushed the bottom
    // one negative, so on a strip too short for both the banner drew through
    // the glass rather than sitting tight against it. Swept across 9150 frames
    // the only failures were height 332 and below, all of them under the 480x360
    // minimum /embed/ documents, and this makes even those symmetric.
    const pad = Math.min(WIN_PAD_MAX, Math.max(0, (rim - lineH) / 2));
    return { k, lineH, rim, avail, pad,
             cy: pad + half, x0: (LW - m.total) / 2,
             wTitle: m.wTitle, total: m.total,
             titleFont: '800 ' + (WIN_TITLE_PX * k).toFixed(2) + 'px Inter, sans-serif',
             subFont: '500 ' + (WIN_SUB_PX * k).toFixed(2) + 'px Inter, sans-serif' };
  }
  function winBannerWidths(k) {
    ctx.font = '800 ' + (WIN_TITLE_PX * k).toFixed(2) + 'px Inter, sans-serif';
    const wTitle = ctx.measureText(WIN_TITLE).width;
    ctx.font = '500 ' + (WIN_SUB_PX * k).toFixed(2) + 'px Inter, sans-serif';
    const wRest = ctx.measureText(WIN_SEP + WIN_SUB).width;
    return { wTitle, wRest, total: wTitle + wRest };
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
  // level and not the game in the abstract. It said "five wedges" on a phone
  // that has two, which teaches the wrong game. The wording also follows the
  // colourblind switch, because in that mode the pieces really are shapes.
  function rulesFor() {
    const copies = N_FOLD - 1;
    const thing = shapeOnly ? 'shape' : 'colour';
    const out = [
      'Panes are missing from the window, and every gap is inside the lit wedge.',
      // The rule, stated as the thing you USE rather than as a restriction.
      'No two panes of the same ' + thing + ' may touch. That is what tells you which glass each gap wants.',
      'Pick a ' + thing + ' and tap a gap. It fills the other ' + (copies === 2 ? 'two' : 'five')
        + ' wedges at the same time, because they are copies of yours.',
      'Every gap has exactly one right answer. You never have to guess.',
    ];
    return out;
  }
  // A LOOPING DEMO of the core loop, because "you edit one wedge and the rest
  // are its copies" is not guessable from a still board, and Stained already
  // taught this studio that a rules card which only describes an unguessable
  // goal does not land. Six seconds, no controls: a piece lands in the lit
  // wedge, its copies bloom outward one by one, it holds, it clears, it repeats.
  // The demo's own little figure. It has to OBEY the rule printed underneath it:
  // the first version put red on the inner ring and alternated red and yellow on
  // the outer one, so red touched red radially, directly under a line saying no
  // two of the same colour may touch. A demo that breaks the rule it is
  // illustrating teaches the wrong thing.
  //
  // Inner ring is one colour, outer alternates two others, so nothing touches
  // its own kind. The inner ring's cells all match each other, which is the same
  // exemption the real board makes: they are copies, not neighbours.
  const DEMO_RINGS = 2, DEMO_SEQ = [0, 2, 1];
  const demoTok = (ring, sc) => (ring === 0 ? 2 : (sc % 2 === 0 ? 0 : 1));
  function drawDemo(cx, cy, R, now) {
    const t = REDUCED ? 2200 : (now % 4200);
    const rr = [];
    for (let i = 0; i <= DEMO_RINGS; i++) rr[i] = R * (0.22 + 0.78 * i / DEMO_RINGS);
    const fold = 6, secOf = (i) => 6 * (i + 1);
    // Finer lead than the board's, because the whole window is a fifth of the
    // size and the same weights would drown its cells.
    const s = Math.max(0.45, R / 150);

    // the stone, so the demo reads as the same object as the board
    const disc = (r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill(); };
    disc(rr[DEMO_RINGS] + 5, STONE); disc(rr[DEMO_RINGS] + 3.5, STONE_LIT); disc(rr[DEMO_RINGS] + 2, LEAD_INK);

    for (let r = 0; r < DEMO_RINGS; r++) {
      const S = secOf(r), w = TAU / S, step = S / fold, orn = RING_ORN[DEMO_RINGS][r];
      for (let sc = 0; sc < S; sc++) {
        const k = Math.floor(sc / step), inWedge = sc < step;
        blitTile(glassTile(rr[r], rr[r + 1], S, orn, inWedge ? 'wedge' : 'dark', s), cx, cy, sc * w, 1);
        // the wedge fills in sequence; each copy follows one rotation behind
        const idx = DEMO_SEQ.indexOf(sc % step);
        const born = 420 + idx * 520 + (inWedge ? 0 : 210 + k * 120);
        const p = Math.max(0, Math.min(1, (t - born) / 300));
        const gone = Math.max(0, Math.min(1, (t - 3500) / 400));
        if (p <= 0 || gone >= 1 || idx < 0) continue;
        blitTile(glassTile(rr[r], rr[r + 1], S, orn, litKey(demoTok(r, sc)), s), cx, cy, sc * w, ease(p) * (1 - gone));
      }
    }
    // the lead, the lit wedge and the rosette, the same net the board uses
    ctx.save(); ctx.translate(cx, cy);
    paintNet(ctx, rr, secOf, s); paintWedge(ctx, rr, fold, s, PIXEL_SCALE);
    ctx.restore();
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

  const MENU_LEAD = 'Complete the figure so it holds under every turn of the wheel.';

  /* The card's sizing, lifted out of the draw so something other than the draw
     can ask about it. Kaleido was the FIRST game whose rules card was fixed, on
     2026-08-20, and it is the only one of the six that never got a detector: the
     write-up claimed all six had one and it was wrong. Everything below is a
     verbatim move of what menuOverlay already computed. */
  const MENU_FLOOR = 0.72;
  function menuLayout() {
    const rules = rulesFor();
    /* padTop and padBot are the CARD's internal padding, so they go to almost
       nothing once there is no card. */
    const metricsFor = (pw, padT, padB, bodyW, leadW) => (s) => {
      const m = { s,
        padTop: padT * s, padBot: padB * s, titleAdv: 38 * s,
        titleF: 34 * s, leadF: 16 * s, leadStep: 23 * s,
        bodyF: 15 * s, bodyStep: 20 * s, ruleGap: 12 * s,
        dotR: 11 * s, dotF: 13 * s, afterLead: 10 * s, afterBody: 20 * s };
      ctx.font = '500 ' + m.bodyF.toFixed(2) + 'px Inter, sans-serif';
      m.bodyH = 0;
      for (const r of rules) m.bodyH += measureWrapped(r, bodyW, m.bodyStep) + m.ruleGap;
      ctx.font = '600 ' + m.leadF.toFixed(2) + 'px Inter, sans-serif';
      m.leadH = measureWrapped(MENU_LEAD, leadW, m.leadStep);
      m.chrome = m.padTop + m.titleAdv + m.leadH + m.afterLead + m.bodyH + m.afterBody
               + ZUI.PILL.h + 12 + ZUI.CTA.h + m.padBot;
      return m;
    };
    /* Shrink the demo, then the copy, exactly as before. Returned so the same
       ladder can be walked twice, once per container. */
    const settle = (pw, maxH, padT, padB, wantDemo, inset, dotGutter) => {
      const bodyW = pw - inset * 2 - dotGutter, leadW = pw - inset * 2 - 10;
      const metrics = metricsFor(pw, padT, padB, bodyW, leadW);
      let M = metrics(1);
      let demoR = wantDemo ? (MODE === 'mobile' ? 74 : 66) : 0;
      while (demoR > 0 && M.chrome + demoR * 2 + 14 > maxH) demoR = demoR > 30 ? demoR - 4 : 0;
      let ts = 1;
      while (ts > MENU_FLOOR && M.chrome > maxH) { ts = Math.max(MENU_FLOOR, ts - 0.04); M = metrics(ts); }
      const demoH = demoR > 0 ? demoR * 2 + 14 : 0;
      return { M, ts, demoR, demoH, needed: M.chrome + demoH, maxH, pw, bodyW, leadW, inset, dotGutter };
    };

    // Preferred: a card, centred, with the window visible around it.
    const cardPw = Math.min(LW - 48, 470);
    const card = settle(cardPw, LH - 20, 26, 22, true, 30, 36);

    /* THE CASE THE CARD CANNOT COVER — 2026-08-21. With the demo gone and the
       type at its floor the copy is STILL taller than the card is allowed to be
       on a short frame, and the card clamps while the text keeps flowing, so the
       two buttons hanging off its bottom edge draw through the last rule.
       Measured: 12px short at the 480x360 embed, 37px on a phone held sideways.
       Nothing could see it for two days because Kaleido had no detector.
       So: stop drawing a card. The frame itself has the room, and dropping the
       card returns its 20px margin AND its internal padding, about 55px, plus a
       wider text column that wraps to fewer lines. Stained's endBlock() has
       always done this and Tessera got it the same night. */
    if (card.needed <= card.maxH + 0.5) {
      const ph = Math.min(card.maxH, card.needed);
      return { rules, fullFrame: false, pw: cardPw, M: card.M, ts: card.ts,
               demoR: card.demoR, demoH: card.demoH, needed: card.needed,
               maxH: card.maxH, ph, px: (LW - cardPw) / 2, py: (LH - ph) / 2,
               bodyW: card.bodyW, leadW: card.leadW, inset: card.inset, dotGutter: card.dotGutter };
    }
    const framePw = Math.min(LW - 16, 560);
    const frame = settle(framePw, LH - 8, 10, 12, false, 14, 30);
    const ph = Math.min(LH - 8, frame.needed);
    return { rules, fullFrame: true, pw: framePw, M: frame.M, ts: frame.ts,
             demoR: 0, demoH: 0, needed: frame.needed, maxH: LH - 8, ph,
             px: (LW - framePw) / 2, py: Math.max(4, (LH - ph) / 2),
             bodyW: frame.bodyW, leadW: frame.leadW, inset: frame.inset, dotGutter: frame.dotGutter };
  }

  function menuOverlay(now) {
    const L = menuLayout();
    // Without a card behind it the copy sits straight on the game, so the scrim
    // has to carry the legibility the card panel used to.
    ctx.fillStyle = L.fullFrame ? 'rgba(14, 23, 38, 0.96)' : 'rgba(14, 23, 38, 0.88)';
    ctx.fillRect(0, 0, LW, LH);   // --bg
    const rules = L.rules;
    const cx = LW / 2;
    const pw = L.pw;
    const LEAD = MENU_LEAD;
    // The sizing itself now lives in menuLayout(), so rulesFit() can ask the
    // same question the draw answers. The reasoning it encodes, unchanged:
    // measure the copy first so the card fits the rules rather than the rules
    // being cropped; scale only VERTICAL geometry, so a smaller face wraps to
    // fewer lines; never scale the two buttons, which are house sizes and touch
    // targets; shrink the demo before the copy and drop it rather than keep it
    // too small to read; and once the demo is gone, shrink the copy to a 0.72
    // floor, below which a clipped rule is the better failure.
    const M = L.M, ts = L.ts, demoR = L.demoR, demoH = L.demoH;
    const maxH = L.maxH, ph = L.ph, px = L.px, py = L.py;
    if (!L.fullFrame) {
      ctx.fillStyle = Z.bgCard; ZUI.roundRectPath(ctx, px, py, pw, ph, 22); ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ZUI.roundRectPath(ctx, px, py, pw, ph, 22); ctx.stroke();
    }
    let y = py + M.padTop;
    ctx.fillStyle = Z.text; ctx.font = '800 ' + M.titleF.toFixed(2) + 'px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('KALEIDO', cx, y); y += M.titleAdv;
    ctx.fillStyle = Z.textDim; ctx.font = '600 ' + M.leadF.toFixed(2) + 'px Inter, sans-serif';
    y = wrapText(LEAD, cx, y, L.leadW, M.leadStep); y += M.afterLead;
    if (demoR > 0) drawDemo(cx, y + demoR, demoR, now);
    y += demoH;
    const rx = px + L.inset;
    const step = Math.max(1, Math.floor(PANE_COL.length / Math.max(1, rules.length)));
    for (let i = 0; i < rules.length; i++) {
      ctx.fillStyle = PANE_COL[(i * step) % PANE_COL.length];
      ctx.beginPath(); ctx.arc(rx + 11, y + M.dotR, M.dotR, 0, TAU); ctx.fill();
      ctx.fillStyle = Z.bg; ctx.font = '800 ' + M.dotF.toFixed(2) + 'px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), rx + 11, y + M.dotR + 1);
      ctx.fillStyle = Z.textDim; ctx.font = '500 ' + M.bodyF.toFixed(2) + 'px Inter, sans-serif';
      y = wrapText(rules[i], rx + L.dotGutter - 4, y, L.bodyW, M.bodyStep, 'left') + M.ruleGap;
    }
    // The colourblind switch, and it needs to be HERE rather than nowhere. The
    // mode was built, the FAQ on the page promises it, and the only ways to
    // reach it were a hidden keyboard shortcut and the console, which is to say
    // no way at all on a phone. It lives on the rules card because that is the
    // surface a player already opens to find out how the game works, and
    // because the play controls have no room left on a narrow screen.
    const swLabel = 'Colourblind mode';
    const swW = ZUI.pillWidth(ctx, swLabel);
    const sw = ZUI.drawPill(ctx, swLabel, cx, py + ph - 22 - ZUI.CTA.h - 12 - ZUI.PILL.h / 2,
                            { w: swW, dim: !shapeOnly });
    if (shapeOnly) {
      ctx.save();
      ctx.strokeStyle = Z.green; ctx.lineWidth = 2;
      ZUI.roundRectPath(ctx, sw.x, sw.y, sw.w, sw.h, sw.h / 2); ctx.stroke();
      ctx.restore();
    }
    uiButtons.push({ ...sw, act: () => {
      shapeOnly = !shapeOnly; save(); ensureAnim(performance.now());
    } });

    const label = placed() > 0 ? 'RESUME' : 'PLAY';
    const b = ZUI.drawCTA(ctx, label, cx, py + ph - 22 - ZUI.CTA.h / 2, Z.green);
    uiButtons.push({ ...b, act: () => { phase = 'play'; T().gameStart(); render(performance.now()); } });
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  const ZUI = window.ZAM_UI;

  // ---------- DEBUG ----------
  // ---------- DEBUG ----------
  // Kept deliberately small. Everything here earns its place by being something
  // a future session will actually need: navigate the ramp, prove a level is
  // solvable, read the difficulty measure, retune the ramp, and check nothing
  // overlaps. The experiment scaffolding that grew alongside the design work
  // (banding, palettePerRing, stats, posed, seam, seamBreaks, perm) is gone
  // with the experiments.
  window.__kaleido = {
    get state() {
      return { level, RINGS, NCELL, NDOM, wedgeFold: N_FOLD, shapes: NSHAPE,
               placed: placed(), blanks: blanks(), clashes: conflicts(),
               phase, shapeOnly };
    },
    goto(n) { genLevel(n, false); return this.state; },
    next() { genLevel(level + 1, false); return this.state; },
    // Fill the whole wedge with the answer. Proves a level is completable.
    solve() { dom = solved.slice(); placeT = placeT.map(() => performance.now()); after(performance.now()); return this.state; },
    // Set one wedge cell, for reproducing a board state by hand. REFUSES a
    // given, exactly as place() does at the tap.
    //
    // It used to write straight into dom[]. A given's colour is read back from
    // solved[] and not from dom[] (see tokAt), so a probe that set one produced
    // a board whose DRAWN colours and whose CLASH COUNT disagreed: the wheel
    // carried the dark clash arcs while the read-out said nothing was touching.
    // That cost an afternoon on 2026-08-24 and the game was right the whole
    // time. A debug handle that can reach a state the game cannot is a source
    // of false findings, not a shortcut.
    set(d, t) {
      if (d < 0 || d >= NDOM) return { refused: true, reason: 'no wedge cell ' + d };
      if (givenDom.has(d)) return { refused: true, reason: 'cell ' + d + ' is a given', ...this.state };
      dom[d] = t; placeT[d] = performance.now(); after(performance.now()); return this.state;
    },
    // Which wedge cells are fixed clues and which are the player's to fill.
    // Exposed because a probe that does not know cannot avoid the trap above.
    givens() {
      const given = [], open = [];
      for (let d = 0; d < NDOM; d++) (givenDom.has(d) ? given : open).push(d);
      return { NDOM, given, open, answer: open.map((d) => solved[d]) };
    },
    // Does the rules card actually fit? Kaleido was the first game whose card
    // was fixed and the only one of the six that never got a way to ask. The
    // number that matters is not whether the card had to be clamped but the gap
    // between where the copy ENDS and where the switch pill BEGINS: the two
    // buttons hang off the card's bottom edge, so a negative gap is the button
    // drawn through the last rule.
    rulesFit() {
      const L = menuLayout(), M = L.M;
      const copyBottom = L.py + M.padTop + M.titleAdv + M.leadH + M.afterLead + L.demoH + M.bodyH;
      const pillTop = L.py + L.ph - 22 - ZUI.CTA.h - 12 - ZUI.PILL.h;
      const ctaBottom = L.py + L.ph - 22;
      return {
        LW: LW, LH: LH, mode: MODE,
        fullFrame: L.fullFrame,
        scale: Math.round(L.ts * 100) / 100,
        demoRadius: L.demoR,
        cardHeight: Math.round(L.ph),
        neededHeight: Math.round(L.needed),
        clampedBy: Math.round(Math.max(0, L.needed - L.ph)),
        gapCopyToButton: Math.round(pillTop - copyBottom),
        cardTop: Math.round(L.py),
        cardBottom: Math.round(L.py + L.ph),
        ctaOnCanvas: ctaBottom <= LH && L.py >= 0,
        fits: pillTop - copyBottom >= 0 && L.needed <= L.ph + 0.5 && L.py >= 0,
      };
    },
    // What the window is doing right now, ring by ring: which ornament, how
    // big a cell's short side is, how wide its jewel comes out, and how the
    // frame split the radius with the glass.
    look() {
      const rings = [];
      for (let r = 0; r < RINGS; r++) {
        const O = ORN[ornName(r)], r0 = ringR[r], r1 = ringR[r + 1], w = TAU / SEC(r);
        const room = Math.min(r1 - r0, (r0 + (r1 - r0) * O.gem[1]) * w);
        rings.push({ ring: r, ornament: ornName(r), sectors: SEC(r),
                     thickness: Math.round((r1 - r0) * 10) / 10,
                     shortSide: Math.round(cellShort(r) * 10) / 10,
                     jewel: Math.round(room * (shapeOnly ? (O.small ? 0.26 : 0.3) : (O.small ? 0.16 : 0.2)) * 20) / 10 });
      }
      return { LW, LH, mode: MODE, frameR: Math.round(frameR * 10) / 10, boardR: Math.round(boardR * 10) / 10,
               border: Math.round(border * 10) / 10, lineScale: Math.round(lineScale(frameR) * 1000) / 1000,
               rings: RINGS, fold: N_FOLD, shapeOnly, tilesCached: glassTiles.size, perRing: rings };
    },
    // Cost of one FULL render, averaged over n frames. The window is painted
    // cell by cell into tiles, and the whole argument for the tile cache is
    // that a blit is cheaper than the dozens of paths each cell is made of.
    // This is how that gets checked rather than asserted. Drives render()
    // directly with a synthetic clock so the number is draw cost and not vsync.
    frameTime(n) {
      n = n || 120;
      const t0 = performance.now();
      for (let i = 0; i < n; i++) render(t0 + i * 16.7);
      const dt = (performance.now() - t0) / n;
      return { frames: n, msPerFrame: Math.round(dt * 1000) / 1000,
               level, rings: RINGS, cells: NCELL, phase };
    },
    // The win banner's clearances, because "decent padding" is a number or it
    // is an opinion. topPad is frame edge to the top of the line, bottomGap is
    // the bottom of the line to the rim of the wheel, and overflows says the
    // line is wider than the frame allows even at the shrink floor.
    winBanner() {
      const L = winBannerLayout();
      const top = L.cy - L.lineH / 2, bottom = L.cy + L.lineH / 2;
      return { LW, LH, mode: MODE, scale: Math.round(L.k * 100) / 100,
               lineHeight: Math.round(L.lineH * 10) / 10,
               oneLine: true,
               topPad: Math.round(top * 10) / 10,
               bottomGap: Math.round((L.rim - bottom) * 10) / 10,
               rim: Math.round(L.rim * 10) / 10,
               lineWidth: Math.round(L.total), available: Math.round(L.avail),
               leftMargin: Math.round(L.x0),
               overflows: L.total > L.avail + 0.5,
               clearsTop: top >= WIN_PAD_MIN - 0.5,
               clearsGlass: L.rim - bottom >= WIN_PAD_MIN - 0.5 };
    },
    // What the solved wheel is doing. `landsOnItself` is the claim worth
    // checking: a turn of one fold step maps the figure onto itself, which is
    // the only reason the step variant means anything.
    spin(mode) {
      if (mode && ['off', 'drift', 'step', 'both'].includes(mode)) {
        WIN_SPIN = mode; ensureAnim(performance.now());
      }
      const step = TAU / N_FOLD;
      return { mode: WIN_SPIN, fold: N_FOLD, phase,
               stepDegrees: Math.round(step * 180 / Math.PI),
               stepMs: Math.round(winStepMs()),
               driftRadPerSec: WIN_DRIFT, delayMs: WIN_SPIN_DELAY,
               reducedMotion: REDUCED,
               angleNow: Math.round(winSpin(performance.now()) * 1000) / 1000,
               stillMoving: winSpinning(performance.now()),
               landsOnItself: Math.abs((step * N_FOLD) - TAU) < 1e-9 };
    },
    // gaps, depth and hardness for the level on screen. The number the ramp aims at.
    measure() { return measureLevel(); },
    // What a given set of dials can reach. Asks for an unreachable target so the
    // poser strips as far as it can; that is the ceiling for those dials.
    probe(rings, fold, shapes) {
      genLevel(1, false, { rings, fold, shapes, seam: 'full', hardness: 9999 });
      const m = measureLevel();
      return { rings, fold, shapes, wedge: NDOM,
               top: { gaps: m.blanks, depth: m.depth, hardness: m.hardness, ok: m.determined } };
    },
    // The board's box and every hit target, for checking nothing collides and
    // that the touch budget is being honoured.
    geometry() {
      return { bcx, bcy, boardR, frameR, border, minRing: MIN_RING,
               ringThickness: [3, 4, 5, 6].map((n) => Math.round(thinnestRing(n) * 10) / 10),
               ringsAllowed: budgetRings(),
               buttons: uiButtons.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })) };
    },
  };

  // ---------- BOOT ----------
  function onResize() {
    if (MODE === 'mobile') setCanvasVars();
    fitFullscreen(); resizeCanvas(); measureBoard();
    STAGES = null;                      // the ring cap can move with the viewport
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
  if (saved) shapeOnly = !!saved.shapeOnly;
  // No ?level= shortcut. It existed to test a hundred-level ramp without playing
  // ninety-nine of them, and it is gone for launch: a player should not be able
  // to skip, and a shared link landing someone on level 90 as their first
  // experience of the game is the worst introduction it could give.
  // window.__kaleido.goto(n) still does the job from the console for testing.
  genLevel(saved ? saved.level : 1, true);
  if (saved && Array.isArray(saved.dom) && saved.dom.length === NDOM) { dom = saved.dom.slice(); render(performance.now()); }
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
})();
