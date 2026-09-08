/* ============================================================
   Junction · the model. No DOM, no canvas, no timers, no Math.random.
   ============================================================

   This file is the rules. play.js is the renderer and the hands, and holds
   none of them. The split is the Comb pattern and it exists for one reason:
   the gate in the brief has to play thousands of levels headlessly, and it
   cannot do that through a canvas.

   THE ONE THING TO UNDERSTAND BEFORE CHANGING ANYTHING HERE

   A three-way junction is a MERGE in one direction and a SPLIT in the other.
   Sides {trunk, a, b}: a train arriving on the trunk leaves by whichever
   branch the switch has selected; a train arriving on EITHER branch leaves by
   the trunk, whatever the switch says, because that is a trailing move and the
   wheels take it. Nothing is ever refused.

   That asymmetry is the whole game, and it is not obvious. Switches never
   change during a run, so the route out of a portal is a pure function of the
   track: every train from one portal, with the same colour of luck, ends in
   the same depot. Two trains can therefore only be separated if they reach a
   junction from DIFFERENT sides, which in practice means they run through the
   shared track in OPPOSITE directions, at different times. That is where the
   sharing comes from, and it is why the meeting rule is a constraint rather
   than a nuisance: two engines nose to nose in the same corridor is the price
   of a corridor used twice.

   A wrong route RUNS. Nothing here returns "illegal". A train that meets a
   dead end stops at it; a train that reaches the wrong depot parks in it. The
   only refusals in this file are in DRAWING (a four-way crossing is not a
   piece the game owns) and they are refusals to lay track, never to run.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JUNCTION_MODEL = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

// ---------- DIRECTIONS ----------
const N = 0, E = 1, S = 2, W = 3;
const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];
const opp = (s) => (s + 2) & 3;

// ---------- CELL KINDS ----------
const EMPTY = 0, ROCK = 1, PORTAL = 2, DEPOT = 3;

/* ---------- STARTING CONSTANTS ----------
   From the brief, section 3. dt is fixed and the speed is in cells per second,
   so a cell always takes 1/trainSpeed seconds whether it is a straight or a
   curve. The curve is the shorter path, so an engine reads as slowing into a
   bend, which is both free and correct. */
const TUNE = {
  cellPx: 44,
  gridByTier: [7, 7, 8, 8, 9, 9, 10, 10, 11],
  trainSpeed: 2.2,
  spawnGapCells: 2,
  trainsByTier: [1, 2, 2, 3, 3, 3, 4, 4, 5],
  budgetSlack: [8, 6, 5, 4, 3, 3, 2, 2, 2],
  colours: ['coral', 'amber', 'teal', 'violet'],
  dt: 1 / 120,
};

// ---------- TRACK ----------
/* A cell's track is a list of SEGMENTS, each an unordered pair of sides.
   One segment is a straight or a curve. Two segments that share exactly one
   side are a three-way junction, and `sw` says which of the two the trunk
   currently feeds. Two segments that share nothing would be a four-way
   crossing, which the brief excludes, so canAddSegment never allows it. */
const newTrack = (size) => new Array(size).fill(null);
const cloneTrack = (t) => t.map((c) => (c ? { segs: c.segs.map((s) => s.slice()), sw: c.sw } : null));

function sleepers(track) {
  let n = 0;
  for (const c of track) if (c) n += c.segs.length;
  return n;
}
function segIndex(c, a, b) {
  if (!c) return -1;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  for (let k = 0; k < c.segs.length; k++) if (c.segs[k][0] === lo && c.segs[k][1] === hi) return k;
  return -1;
}
const isJunction = (c) => !!c && c.segs.length === 2;
const hasSide = (c, s) => !!c && c.segs.some((g) => g[0] === s || g[1] === s);
const otherEnd = (g, s) => (g[0] === s ? g[1] : g[1] === s ? g[0] : -1);

// The side both segments of a junction share. -1 for anything that is not one.
function trunkOf(c) {
  if (!isJunction(c)) return -1;
  const [p, q] = c.segs;
  for (const s of p) if (q[0] === s || q[1] === s) return s;
  return -1;
}
// The branch a junction currently feeds, and the one it does not.
function activeBranch(c) {
  const t = trunkOf(c);
  return t < 0 ? -1 : otherEnd(c.segs[c.sw], t);
}
function idleBranch(c) {
  const t = trunkOf(c);
  return t < 0 ? -1 : otherEnd(c.segs[c.sw ^ 1], t);
}

/* Where a train leaves a cell it entered on side `inSide`. -1 means there is
   no rail under it going that way: a dead end, which stops a train rather than
   refusing it. */
function exitSide(c, inSide) {
  if (!c) return -1;
  if (c.segs.length === 1) return otherEnd(c.segs[0], inSide);
  const t = trunkOf(c);
  if (t < 0) return -1;
  if (inSide === t) return otherEnd(c.segs[c.sw], t);     // facing point: the switch decides
  for (const g of c.segs) if (otherEnd(g, inSide) === t) return t;   // trailing point: always the trunk
  return -1;
}

function canAddSegment(c, a, b) {
  if (a < 0 || b < 0 || a === b) return false;
  if (!c) return true;
  if (segIndex(c, a, b) >= 0) return true;            // retracing is free and expected
  if (c.segs.length >= 2) return false;               // one junction per cell, no more
  const g = c.segs[0];
  let shared = 0;
  if (g[0] === a || g[1] === a) shared++;
  if (g[0] === b || g[1] === b) shared++;
  return shared === 1;                                 // exactly one shared side = three-way
}

/* Returns true if this actually added a sleeper. A new junction keeps sw at 0,
   which means the segment that was ALREADY THERE stays live and the one just
   drawn does not. That is deliberate: the switch has to be a decision the
   player makes, and a junction that silently adopted the newest branch would
   never ask for one. */
function addSegment(track, i, a, b) {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const c = track[i];
  if (!c) { track[i] = { segs: [[lo, hi]], sw: 0 }; return true; }
  if (segIndex(c, a, b) >= 0) return false;
  c.segs.push([lo, hi]);
  return true;
}
const toggleSwitch = (track, i) => { if (isJunction(track[i])) track[i].sw ^= 1; };
const eraseCell = (track, i) => { track[i] = null; };

// ---------- LEVELS ----------
/* ============================================================
   PADDING A LEVEL OUT TO THE BOARD IT IS SHOWN ON
   ============================================================

   A level is authored as a square-ish CORE — the sheds, the walls, the budget
   and the reference solution. A frame is not square: the 760x600 desktop field
   is 1.40 wide, a phone's is 0.52, and no single grid fills both. A 7x7 core
   covers 60% of the desktop field and 48% of the phone's, and the best any
   fixed shape manages on BOTH is about 53%, measured. The rest was green with
   nothing on it, and green with nothing on it reads as a promise the game does
   not keep.

   So the CORE is the puzzle and the BOARD is whatever the frame can hold. The
   renderer asks for as many extra ranks and files as fit at the cell size the
   core already chose, and every one of them is ordinary playable ground.

   TWO THINGS MAKE THIS SAFE.

   Nothing inside the core moves relative to anything else, so every route in
   it keeps its length: the budget and par are the same numbers on a phone and
   on a desktop, and the reference solution still solves it.

   AND A WALL THAT REACHED THE EDGE STILL REACHES IT. This is the whole risk.
   Level 1 is a wall across row 2 with one gap, and the difficulty IS that gap;
   pad three columns onto the side and leave the wall where it was and both
   engines simply drive around the end of it. So a rock standing on a core edge
   is extended out to the new edge, in that direction, and the gap stays the
   only way through.

   What padding DOES change is elbow room: routes that may not cross have more
   space to avoid each other in. That is a real difficulty effect and it is why
   the generator's gate has to run on the most generous padding any supported
   frame produces, never on the bare core.
*/
function padLevel(level, padT, padR, padB, padL) {
  if (!(padT | padR | padB | padL)) return level;
  const C2 = level.C + padL + padR;
  const rocks = [], seen = new Set();
  const put = (r, c) => { const k = r * C2 + c; if (!seen.has(k)) { seen.add(k); rocks.push([r, c]); } };
  const rock = (r, c) => level.kind[r * level.C + c] === ROCK;
  /* A WALL, not merely a rock that happens to sit on the edge. Level 1 has a
     lineside clump in its top-left corner as well as a wall across row 2, and
     extending both turned the clump into a bracket of trees the author never
     drew. A row is a wall only if it is blocked at BOTH ends — which is
     exactly the shape whose gap the puzzle is about. */
  const rowWall = (r) => rock(r, 0) && rock(r, level.C - 1);
  const colWall = (c) => rock(0, c) && rock(level.R - 1, c);
  for (let r = 0; r < level.R; r++) for (let c = 0; c < level.C; c++) {
    if (!rock(r, c)) continue;
    put(r + padT, c + padL);
    if (c === 0 && rowWall(r)) for (let k = 0; k < padL; k++) put(r + padT, k);
    if (c === level.C - 1 && rowWall(r)) for (let k = 0; k < padR; k++) put(r + padT, C2 - 1 - k);
    if (r === 0 && colWall(c)) for (let k = 0; k < padT; k++) put(k, c + padL);
    if (r === level.R - 1 && colWall(c)) for (let k = 0; k < padB; k++) put(level.R + padT + k, c + padL);
  }
  const move = (o) => ({ ...o, at: [o.r + padT, o.c + padL] });
  return buildLevel({
    n: level.n, tier: level.tier, R: level.R + padT + padB, C: C2, rocks,
    portals: level.portals.map((p) => ({ at: [p.r + padT, p.c + padL], face: p.face, queue: p.queue })),
    depots: level.depots.map((d) => ({ at: [d.r + padT, d.c + padL], face: d.face, colour: d.colour })),
    budget: level.budget, par: level.par,
    solution: level.solution
      ? level.solution.map((g) => [g[0] + padT, g[1] + padL, g[2], g[3]])
      : null,
    core: { R: level.R, C: level.C, padT, padR, padB, padL },
  });
}

/* ============================================================
   LEVEL 1, BUILT TO THE SHAPE OF THE BOARD IT IS SHOWN ON
   ============================================================

   The fleet does not put one grid on both breakpoints. Bloom says why in its
   own margin — "a square is bounded by the HEIGHT, so no amount of reclaimed
   chrome widens it; the extra space just becomes bigger margins" — and it,
   Sluice, Prism and Comb all pick their dimensions per device: a tall narrow
   grid on a phone, a grid wider than it is tall on the 760x600 frame.

   Junction was padding a 7x7 core instead, which fills the FIELD with cells
   but leaves the PUZZLE a small square in the middle of them. The owner's word
   for that was lazy and it is the right word: the space became playable
   without becoming play.

   So the level is a shape, not a fixture. The structure is fixed — two engines
   that start on one side, two sheds on the other, and a wall across the middle
   with a single gap both of them must pass through in opposite directions —
   and the geometry stretches to whatever board it is asked for. Par is counted
   from the reference solution rather than guessed, so it is right at every
   size. */
function spec1(R, C, gapCol, rake) {
  const east = C - 2;                                   // the sheds' column
  /* THE GAP IS THE THIRD COLUMN, and the number is measured rather than
     chosen. Swept against every shape the layout asks for: at g=2 the level
     cannot be solved at all, at g>=4 coral is so far ahead that the two of
     them never contend and the run finishes with nobody waiting. Only g=3
     keeps what the authored 7x7 had — exactly one meeting, and exactly one of
     the four switch settings that wins. */
  const g = gapCol == null ? 3 : gapCol;
  const w = Math.floor(R / 2);                          // the wall row
  const rocks = [];
  for (let c = 0; c < C; c++) if (c !== g) rocks.push([w, c]);
  rocks.push([0, 0], [R - 1, g]);                       // lineside, off every route

  /* THE TWO ENGINES MUST NOT REACH THE GAP ON THE SAME TICK. The first version
     of this was mirror-symmetric — both sheds in column 1, both approaches the
     same Manhattan distance — so the two of them arrived at the shared spine
     together, from opposite ends, and deadlocked at every shape it was asked
     for. The authored 7x7 works because coral gets there two cells ahead.

     So coral's shed sits directly ABOVE the gap and takes the short way down,
     while teal starts in the far corner and has to cross the board first. The
     lead that buys is R - 2w + g - 2, which with an odd number of rows is
     g - 1, and the spine is three cells — hence the gap column sits as far
     east as it can, and gridDims only ever asks for an odd count of rows. */
  const seg = [];
  const runR = (r, c0, c1, a, b) => { for (let c = c0; c <= c1; c++) seg.push([r, c, a, b]); };
  const runC = (c, r0, r1, a, b) => { for (let r = r0; r <= r1; r++) seg.push([r, c, a, b]); };
  // coral: straight down onto the gap, out east below it, then down to its shed
  runC(g, 1, w - 1, N, S);
  seg.push([w, g, N, S]);
  seg.push([w + 1, g, N, E]);
  runR(w + 1, g + 1, east - 1, W, E);
  seg.push([w + 1, east, W, S]);
  runC(east, w + 2, R - 2, N, S);
  // teal: up the far side, east under the wall, up through the gap, out east above it
  runC(1, w + 2, R - 2, N, S);
  seg.push([w + 1, 1, S, E]);
  runR(w + 1, 2, g - 1, W, E);
  seg.push([w + 1, g, W, N]);
  seg.push([w - 1, g, S, E]);
  runR(w - 1, g + 1, east - 1, W, E);
  seg.push([w - 1, east, W, N]);
  runC(east, 1, w - 2, N, S);

  return {
    n: 1, tier: 0, R, C, rocks,
    portals: [{ at: [0, g], face: S, queue: [0], rake: [(rake && rake[0]) || 0] },
              { at: [R - 1, 1], face: N, queue: [2], rake: [(rake && rake[1]) || 0] }],
    depots: [{ at: [0, east], face: S, colour: 2 },         // teal's shed
             { at: [R - 1, east], face: N, colour: 0 }],    // coral's shed
    budget: seg.length + Math.max(5, Math.round(seg.length * 0.30)),
    par: seg.length,
    solution: seg,
  };
}
function level1(R, C, gapCol, rake) { return buildLevel({ ...spec1(R, C, gapCol, rake), shapeable: true }); }

/* ============================================================
   THE ORDERING BOARD — a demo of a different kind of difficulty
   ============================================================

   Built to answer one question: is "who goes first, and what does that cost in
   track" the game we want? Every level before this is solved by routing each
   engine its own shortest way, so the trains never have to be thought about
   together. This one cannot be.

   The wall sits DEAD CENTRE — an even rank count — so both engines are the
   same distance from the single gap. They arrive on the same tick from
   opposite ends, meet inside the three-cell spine, and lock. No switch setting
   fixes it; the switches are not the problem.

   The cure is to make one route LONGER so the other clears first, and the only
   way to lengthen a route on a rectangle is to DOUBLE BACK — every monotone
   path from A to B is exactly the same length, which is why three earlier
   attempts at a "detour" cost nothing at all. Doubling back on the two rows
   below the approach costs 2d + 2 sleepers and buys the same delay.

   MEASURED at five board sizes: the cheapest layout locks and the smallest
   detour — two extra sleepers — wins, every time. The budget is set to exactly
   that, so there is no slack to waste and the player has to find the cheap
   delay rather than any delay.

   The detour rows need room: R must be at least w + 5. */
function orderSpec(R, C, detour) {
  const g = 3, w = Math.floor(R / 2), east = C - 2;
  const d = detour == null ? 1 : detour;
  const rocks = [];
  for (let c = 0; c < C; c++) if (c !== g) rocks.push([w, c]);
  const side = (a, b) => (b[0] === a[0] - 1 ? N : b[0] === a[0] + 1 ? S
                        : b[1] === a[1] + 1 ? E : b[1] === a[1] - 1 ? W : -1);
  const walk = (pts) => { const out = [pts[0].slice()];
    for (let k = 1; k < pts.length; k++) {
      let [r, c] = out[out.length - 1]; const [tr, tc] = pts[k];
      while (r !== tr) { r += Math.sign(tr - r); out.push([r, c]); }
      while (c !== tc) { c += Math.sign(tc - c); out.push([r, c]); }
    } return out; };
  const segsOf = (pts) => { const cs = walk(pts), out = [];
    for (let k = 1; k < cs.length - 1; k++) {
      const a = side(cs[k], cs[k - 1]), b = side(cs[k], cs[k + 1]);
      if (a < 0 || b < 0 || a === b) return null;
      out.push([cs[k][0], cs[k][1], a, b]);
    } return out; };
  const coral = segsOf([[0, g], [w + 1, g], [w + 1, east], [R - 1, east]]);
  const teal = segsOf(d > 0
    ? [[R - 1, 1], [w + 3, 1], [w + 3, 1 + d], [w + 2, 1 + d], [w + 2, 1],
       [w + 1, 1], [w + 1, g], [w - 1, g], [w - 1, east], [0, east]]
    : [[R - 1, 1], [w + 1, 1], [w + 1, g], [w - 1, g], [w - 1, east], [0, east]]);
  if (!coral || !teal) return null;
  return { n: 92, tier: 7, R, C, rocks,
    portals: [{ at: [0, g], face: S, queue: [0] },
              { at: [R - 1, 1], face: N, queue: [2] }],
    depots: [{ at: [0, east], face: S, colour: 2 },
             { at: [R - 1, east], face: N, colour: 0 }],
    budget: 0, par: 0, solution: coral.concat(teal) };
}
function orderLevel(R, C, detour) {
  const spec = orderSpec(R, C, detour);
  if (!spec) return null;
  // par is COUNTED from the solution, and the budget is exactly par: the
  // cheapest delay that works is the only one you can afford.
  const cost = sleepers(layout(buildLevel({ ...spec, budget: 999 }), spec.solution));
  return buildLevel({ ...spec, budget: cost, par: cost });
}

/* ============================================================
   THE TIGHT BOARD — one rail layout, and exactly the rails to build it
   ============================================================

   The owner's design rule, made real and then CERTIFIED rather than asserted:
   exactly one solution, and exactly the number of rails to do it.

   It is the ordering board at 12x7 with one extra obstacle, and every number
   in it was measured by unique.mjs rather than authored.

     THE BUDGET IS THE MEASURED MINIMUM. Enumerating every route each engine
       could take, every combination of them and every switch setting gives 22
       as the cheapest cost anything wins at. The ordering board shipped a par
       of 27 that its author counted off his own solution — five rails too
       many. Par cannot be written down; it has to be searched for.

     ONE OBSTACLE DID THE WORK. At 22 the bare board has six winning rail
       layouts. A single rock at row 7, column 4 takes that to ONE. Tightening
       the budget alone never gets there: at the true minimum of the 10x7 board
       there were still 52 answers.

     AND THE CHEAPEST ROUTES LOSE. With both engines on their shortest paths
       nothing wins at any price — they meet head-on in the gap. The player has
       to spend two of the twenty-two rails on a route that doubles back,
       purely to arrive late.

   One honest caveat. Two of the sixteen switch settings win on that single
   layout, so the RAILS are unique and the switching is not quite. Which
   settings those are depends on the order the track was built in, because a
   junction keeps whichever branch was laid first; the reachable states are the
   same either way, so this is a labelling artefact and not a second answer. */
function tightLevel() {
  const S_ = 2, N_ = 0, E_ = 1, W_ = 3;
  const sol = [
    [1,3,N_,S_],[2,3,N_,S_],[3,3,N_,S_],[4,3,N_,S_],[5,3,N_,S_],[6,3,N_,S_],
    [7,3,N_,S_],[8,3,N_,S_],[9,3,N_,S_],[10,3,N_,E_],[10,4,W_,E_],[10,5,W_,S_],
    [10,1,S_,E_],[10,2,W_,E_],[10,3,W_,N_],[9,3,S_,N_],[8,3,S_,W_],[8,2,E_,N_],
    [7,2,S_,E_],[7,3,W_,N_],[6,3,S_,N_],[5,3,S_,N_],[4,3,S_,N_],[3,3,S_,N_],
    [2,3,S_,N_],[1,3,S_,E_],[1,4,W_,E_],[1,5,W_,N_],
  ];
  return buildLevel({
    n: 94, tier: 9, R: 12, C: 7,
    rocks: [[6,0],[6,1],[6,2],[6,4],[6,5],[6,6],[7,4]],
    portals: [{ at: [0, 3], face: S, queue: [0] },
              { at: [11, 1], face: N, queue: [2] }],
    depots: [{ at: [0, 5], face: S, colour: 2 },
             { at: [11, 5], face: N, colour: 0 }],
    budget: 22, par: 22, solution: sol,
  });
}

function buildLevel(spec) {
  const R = spec.R, C = spec.C, size = R * C;
  const kind = new Array(size).fill(EMPTY);
  const face = new Array(size).fill(-1);
  const colour = new Array(size).fill(-1);
  const at = (rc) => rc[0] * C + rc[1];
  for (const rc of spec.rocks || []) kind[at(rc)] = ROCK;
  const portals = (spec.portals || []).map((p) => {
    const i = at(p.at); kind[i] = PORTAL; face[i] = p.face;
    /* HOW MANY CARRIAGES EACH ENGINE DRAGS, one per queued train, defaulting
       to none. A rake is not decoration: a train is as many cells long as it
       has vehicles, so a three-car train holds four cells of track and takes
       four cells' worth of time to clear a corridor somebody else wants. */
    return { i, r: p.at[0], c: p.at[1], face: p.face, queue: p.queue.slice(),
             rake: (p.rake || []).slice() };
  });
  const depots = (spec.depots || []).map((d) => {
    const i = at(d.at); kind[i] = DEPOT; face[i] = d.face; colour[i] = d.colour;
    return { i, r: d.at[0], c: d.at[1], face: d.face, colour: d.colour };
  });
  return {
    n: spec.n, tier: spec.tier || 0, R, C, size, kind, face, colour,
    portals, depots, budget: spec.budget, par: spec.par || 0,
    solution: spec.solution || null,
    // where the authored puzzle sits inside this board, when it was padded
    core: spec.core || { R, C, padT: 0, padR: 0, padB: 0, padL: 0 },
    /* WHICH BOARD FAMILY THIS CAME FROM — corridor, twoGap, crossing or swap.
       Carried so the ladder can be checked for the thing that actually makes a
       puzzle game dull, which is not difficulty but sameness: thirty boards of
       one family is one puzzle thirty times. The tests assert on it. */
    family: spec.family || null,
    /* CAN THIS LEVEL BE REBUILT AT ANOTHER SHAPE? Only the parametric one can.
       The renderer used to decide that by asking whether the level was
       NUMBER 1, which was true of the parametric tutorial and then became true
       of the first generated level as well — so a certified board was quietly
       replaced by a different puzzle the moment it was laid out. */
    shapeable: !!spec.shapeable,
  };
}

/* Every level must satisfy these or it is not shippable. Run from the tests,
   not from the page: a level that fails here is a level that was authored
   wrong, and the right place to find that out is a red test. */
function validate(level) {
  const bad = [];
  /* THE EDGE IS THE CORE'S EDGE, not the board's. A shed belongs at the rim of
     the authored puzzle so its mouth opens into the yard; once the board is
     padded out to fill a frame it stands inboard, with playable ground behind
     it, and that is the padding working rather than a broken level. What still
     has to hold either way is the line below: its door must face a real cell. */
  const k = level.core || { R: level.R, C: level.C, padT: 0, padL: 0 };
  const t = k.padT || 0, l = k.padL || 0;
  const onEdge = (r, c) => r === t || c === l || r === t + k.R - 1 || c === l + k.C - 1;
  for (const p of level.portals) {
    if (!onEdge(p.r, p.c)) bad.push('portal ' + p.i + ' is not on an edge');
    const nr = p.r + DR[p.face], nc = p.c + DC[p.face];
    if (nr < 0 || nc < 0 || nr >= level.R || nc >= level.C) bad.push('portal ' + p.i + ' faces off the board');
    if (!p.queue.length) bad.push('portal ' + p.i + ' has no trains');
  }
  for (const d of level.depots) {
    if (!onEdge(d.r, d.c)) bad.push('depot ' + d.i + ' is not on an edge');
    const nr = d.r + DR[d.face], nc = d.c + DC[d.face];
    if (nr < 0 || nc < 0 || nr >= level.R || nc >= level.C) bad.push('depot ' + d.i + ' faces off the board');
  }
  // Every colour that runs must have somewhere to run to, and every arch must
  // have something to light it, or "all arches lit" is a promise the level
  // cannot keep.
  const running = new Set();
  for (const p of level.portals) for (const col of p.queue) running.add(col);
  const homes = new Set(level.depots.map((d) => d.colour));
  for (const col of running) if (!homes.has(col)) bad.push('colour ' + col + ' has no depot');
  for (const col of homes) if (!running.has(col)) bad.push('depot colour ' + col + ' has no train');
  return bad;
}

/* ---------- LEVEL 1 ----------
   Hand authored, and the shape is the argument the brief makes in section 0,
   drawn out on a 7x7 so it can be checked by eye.

     row 0    .   P1   .    .    .   Dt   .
     row 1    .    .   .   J1    .    .   .
     row 2    #    #   #   gap   #    #   #
     row 3    .    .   .   J2    .    .   .
     row 4    .    .   .    .    .    .   .
     row 5    .    .   .    .    .    .   .
     row 6    .   P2   .    .    .   Dc   .

   A rock wall with one gap in it. Coral starts top left and finishes bottom
   right; teal starts bottom left and finishes top right; both have to pass
   through the same three cells, in OPPOSITE directions. Sharing is forced by
   the wall rather than by the budget, which is the honest way to teach it.

   Both junctions are real. At J1 the teal engine arrives on the trunk and
   leaves by whichever branch is set, so the player has to flip it; the coral
   engine arrives on a branch and is not affected either way, which is the
   asymmetry the whole game rests on, shown once, on the first board. Draw the
   routes in the other order and it is J2 that needs the flip instead. Either
   way it is exactly one tap, and the tap is the lesson.

   The timing is not decoration. Coral reaches the gap first and teal has to
   idle one cell short of it for about half a second before following through.
   The meeting rule therefore gets taught on level 1, by a wait that costs
   nothing. */
const LEVEL_SPECS = [{
  n: 1, tier: 0, R: 7, C: 7,
  // The wall, plus two lineside clumps that no route wants: a board that is
  // one straight line of obstacles reads as one straight line of obstacles
  // however carefully it is drawn.
  rocks: [[2, 0], [2, 1], [2, 2], [2, 4], [2, 5], [2, 6], [0, 0], [6, 3]],
  portals: [
    { at: [0, 1], face: S, queue: [0] },   // coral, southbound out of the tunnel
    { at: [6, 1], face: N, queue: [2] },   // teal, northbound
  ],
  depots: [
    { at: [0, 5], face: S, colour: 2 },    // teal's shed, top right
    { at: [6, 5], face: N, colour: 0 },    // coral's shed, bottom right
  ],
  budget: 25,
  par: 17,
  /* The reference solution, as [row, col, sideA, sideB] segments. It is here
     so a test can prove the level is completable without a solver, and so the
     debug handle can lay it out in one call. */
  solution: [
    [1, 1, N, E], [1, 2, W, E], [1, 3, W, S],          // coral, tunnel to the gap
    [2, 3, N, S],                                       // the gap itself, shared
    [3, 3, N, E], [3, 4, W, S], [4, 4, N, S], [5, 4, N, E], [5, 5, W, S],
    [5, 1, S, E], [5, 2, W, E], [5, 3, W, N],          // teal, tunnel to the gap
    [4, 3, S, N],
    [3, 3, S, N],                                       // makes J2
    [1, 3, S, E],                                       // makes J1
    [1, 4, W, E], [1, 5, W, N],
  ],
}];

/* ---------- LEVEL 33, THE FIRST BOARD OF TIER 5 ----------
   Numbered 33 rather than 5 because the 72 are nine tiers of eight, so level 5
   is still tier 1: a 7x7 with one engine and no junction at all. This is what
   a tier 5 board looks like — 9x9, three engines, three colours — and the tier
   introduces crossing ORDERS, which is to say spacing.

     row 0     .    Pc    .    .    .    .    .    Dt   .
     row 1     .     .    .    .    .    .    .     .   .
     row 2     .     .    .    .    .    .    .     .   .
     row 3     #     #    #    #   gap   #    #     #   #
     row 4     .     .    .    .    .    .    .     .   .
     row 5     .     .    .    .    .    .    .     .   .
     row 6     .     .    .    .    .    .    .     .   Dc
     row 7     .     .    .    .    .    .    .     .   Da
     row 8     .    Pt   Pa    .    .    .    .     .   .

   One wall, one gap, and the same argument as level 1 carried further: coral
   runs north to south through the gap and teal south to north, so the four
   cells of the corridor are used in both directions and the two junctions at
   its ends are the only places the routes can part company. Amber never
   touches it. It does not have to: it competes for the sleeper budget and for
   the south band, and a third colour that shares nothing is a fair thing for a
   board to contain.

   The timing is the tier. The straight run from the teal tunnel reaches the
   corridor while coral is still inside it, and the two of them lock nose to
   nose and stay there. The reference solution takes teal the long way round by
   the left edge, which is three cells more track and buys the one thing that
   cannot be bought any other way: coral gets out first. Teal still waits about
   half a second at the last shared cell, which is the rule being taught rather
   than a fault.
*/
LEVEL_SPECS.push({
  n: 33, tier: 4, R: 9, C: 9,
  rocks: [[3, 0], [3, 1], [3, 2], [3, 3], [3, 5], [3, 6], [3, 7], [3, 8],
          // A spur off the wall, a thicket hanging from it, and two clumps
          // standing on their own: three different shapes of obstacle, none of
          // them on a route.
          [2, 1], [4, 7], [5, 7], [1, 5], [6, 2]],
  portals: [
    { at: [0, 1], face: S, queue: [0] },   // coral, out of the north tunnel
    { at: [8, 1], face: N, queue: [2] },   // teal, out of the south tunnel
    { at: [8, 2], face: N, queue: [1] },   // amber, and it stays in the south
  ],
  depots: [
    { at: [0, 7], face: S, colour: 2 },    // teal's shed, north east
    { at: [6, 8], face: W, colour: 0 },    // coral's shed, east
    { at: [7, 8], face: W, colour: 1 },    // amber's shed, east
  ],
  budget: 34,
  par: 31,
  solution: [
    // coral: north tunnel, east along row 1, down the corridor, out east
    [1, 1, N, E], [1, 2, W, E], [1, 3, W, E], [1, 4, W, S],
    [2, 4, N, S], [3, 4, N, S], [4, 4, N, S], [5, 4, N, S],
    [6, 4, N, E], [6, 5, W, E], [6, 6, W, E], [6, 7, W, E],
    // teal: the long way round by the left edge, which is what lets coral out
    [7, 1, S, W], [7, 0, E, N], [6, 0, S, N], [5, 0, S, E],
    [5, 1, W, E], [5, 2, W, E], [5, 3, W, E],
    [5, 4, W, N],                                  // junction, south end
    [4, 4, S, N], [3, 4, S, N],                    // the corridor, retraced
    [2, 4, S, E],                                  // junction, north end
    [2, 5, W, E], [2, 6, W, E], [2, 7, W, N], [1, 7, S, N],
    // amber: along the south, sharing nothing and paying for its own rails
    [7, 2, S, E], [7, 3, W, E], [7, 4, W, E], [7, 5, W, E], [7, 6, W, E], [7, 7, W, E],
  ],
});

const LEVELS = LEVEL_SPECS.map(buildLevel);

/* ---------- THE LADDER ----------
   The levels a player actually walks through come from levels.js, which is
   written by generate.mjs and never by hand: every board in it has been
   measured to defeat greedy routing, to carry the cheapest budget anything
   wins at, and to have exactly one set of rails that achieves it.

   The two hand-authored levels stay where they are. They are what the tests
   and the demos are written against, and level 1 is still the parametric one
   that reshapes to the breakpoint — but neither is on the ladder, because
   neither passes the gate. */
const GENERATED = (function () {
  if (typeof module === 'object' && module.exports) {
    try { return require('./levels.js'); } catch (_) { return { portrait: [], landscape: [] }; }
  }
  return (typeof self !== 'undefined' && self.JUNCTION_LEVELS) || { portrait: [], landscape: [] };
}());
/* TWO LADDERS, ONE PER BREAKPOINT. A phone and a 760x600 frame get different
   boards — generated from different seeds and certified separately — rather
   than one set of levels squeezed into whichever frame turned up. The renderer
   picks the ladder once, at boot, from the same MODE that picks the layout. */
const LADDERS = {
  portrait: (GENERATED.portrait || []).map(buildLevel),
  landscape: (GENERATED.landscape || []).map(buildLevel),
};
let LADDER = LADDERS.portrait.length ? LADDERS.portrait : LADDERS.landscape;
const useLadder = (kind) => {
  if (LADDERS[kind] && LADDERS[kind].length) LADDER = LADDERS[kind];
  return LADDER.length;
};
const ladderCount = () => LADDER.length;
const ladder = () => LADDER;
/* The hand-authored levels by number, bypassing the ladder. The tests and the
   demos are written against these, and getLevel now answers with the ladder
   first — so asking for "level 1" and meaning the authored one needs saying. */
const authored = (n) => LEVELS.find((l) => l.n === (n | 0)) || null;
const nextOnLadder = (n) => {
  let best = null;
  for (const l of LADDER) if (l.n > n && (best === null || l.n < best.n)) best = l;
  return best ? best.n : null;
};
const levelCount = () => LEVELS.length;
// Levels are addressed by their NUMBER, not their position, because the hand
// authored set is sparse: milestone 1 ships level 1 and one tier 5 board, and
// the tier a level belongs to is a fact about its number.
function getLevel(n) {
  const want = n | 0;
  // the ladder first: a generated level 1 is the one a player should meet
  for (const l of LADDER) if (l.n === want) return l;
  for (const l of LEVELS) if (l.n === want) return l;
  if (LADDER.length) {
    let best = LADDER[0];
    for (const l of LADDER) if (l.n <= want && l.n > best.n) best = l;
    return best;
  }
  let best = LEVELS[0];
  for (const l of LEVELS) if (l.n <= want && l.n > best.n) best = l;
  return best;
}

// ---------- DRAWING ----------
const rowOf = (level, i) => (i / level.C) | 0;
const colOf = (level, i) => i % level.C;

// The side of cell i that faces cell j, or -1 if they are not neighbours.
function sideBetween(level, i, j) {
  const r = rowOf(level, i), c = colOf(level, i);
  const r2 = rowOf(level, j), c2 = colOf(level, j);
  for (let s = 0; s < 4; s++) if (r + DR[s] === r2 && c + DC[s] === c2) return s;
  return -1;
}
function neighbour(level, i, s) {
  const r = rowOf(level, i) + DR[s], c = colOf(level, i) + DC[s];
  if (r < 0 || c < 0 || r >= level.R || c >= level.C) return -1;
  return r * level.C + c;
}

/* A stroke is the whole drag: a path of adjacent cells, optionally starting or
   ending on a portal or a depot mouth. It is validated WHOLE and re-validated
   from scratch every time the finger enters a new cell, because adding a cell
   changes the piece in the cell before it — a straight becomes a curve — and
   validating only the new end would miss a crossing the change just created.
   The paths are a few dozen cells long, so the cost of being obviously right
   here is nothing. */
/* WHICH SIDE AN OPEN END OF A STROKE USES.

   A stroke knows the side it leaves each cell by; at its two ends the other
   side is a guess, and the guess used to be "carry straight on". That is right
   in the middle of bare grass and wrong everywhere else, because the thing a
   player draws out of — a shed doorway, the end of a rail they laid a minute
   ago — is usually NOT in line with the direction they flick. Drawing east out
   of the cell below a shed whose door faces south laid a west-east straight
   with its back end dangling in the grass, a hand's width from the door and
   joined to nothing: the owner's "by default it doesn't attach to the existing
   rails".

   So an open end attaches to whatever it is touching. It only ever overrides
   the straight when the straight has NOTHING on its open side, so a line drawn
   past a stub is left alone, and it never invents a piece the cell could not
   hold — canAddSegment still has the last word. */
function openSide(level, trk, i, b) {
  const straight = opp(b);
  const here = trk[i];
  const touches = (s) => {
    // Track already in this cell: sharing one of its sides IS the junction the
    // player is asking for, and is the only legal piece anyway.
    if (here) return here.segs.some((g) => g[0] === s || g[1] === s);
    const nb = neighbour(level, i, s);
    if (nb < 0) return false;
    const k = level.kind[nb];
    // A portal or a shed is only ever open at its mouth.
    if (k === PORTAL || k === DEPOT) return level.face[nb] === opp(s);
    const c = trk[nb];
    // A neighbour touches this cell only where a rail actually ENDS on the
    // shared edge. A line running past outside has no side facing in.
    return !!c && c.segs.some((g) => g[0] === opp(s) || g[1] === opp(s));
  };
  if (touches(straight) && canAddSegment(here, straight, b)) return straight;
  for (const s of [N, E, S, W]) {
    if (s === b || s === straight) continue;
    if (touches(s) && canAddSegment(here, s, b)) return s;
  }
  return straight;                     // nothing to attach to: as it always was
}

function validateStroke(level, track, path) {
  const n = path.length;
  const fail = (why) => ({ ok: false, why, adds: [], cost: 0, track: null });
  if (n < 2) return fail('too short');
  for (let k = 0; k < n; k++) {
    const i = path[k];
    if (i < 0 || i >= level.size) return fail('off board');
    if (path.indexOf(i) !== k) return fail('crosses itself');
    if (level.kind[i] === ROCK) return fail('rock');
    if (level.kind[i] === PORTAL || level.kind[i] === DEPOT) {
      if (k !== 0 && k !== n - 1) return fail('through a portal');
      const nb = k === 0 ? path[1] : path[n - 2];
      if (sideBetween(level, i, nb) !== level.face[i]) return fail('not the mouth');
    }
    if (k > 0 && sideBetween(level, path[k - 1], i) < 0) return fail('not adjacent');
  }
  const scratch = cloneTrack(track);
  const adds = [];
  let cost = 0;
  for (let k = 0; k < n; k++) {
    const i = path[k];
    if (level.kind[i] !== EMPTY) continue;
    let a = k > 0 ? sideBetween(level, i, path[k - 1]) : -1;
    let b = k < n - 1 ? sideBetween(level, i, path[k + 1]) : -1;
    // Both ends unknown means a single cell, which is a tap, not a stroke.
    if (a < 0 && b < 0) return fail('no direction');
    if (a < 0) a = openSide(level, scratch, i, b);
    if (b < 0) b = openSide(level, scratch, i, a);
    /* The FIRST cell is an anchor, not a piece. Starting a drag on rail you
       have already laid is the ordinary way to carry a line on, and demanding
       that the anchor also accept a new piece refuses that drag before it has
       moved: a cell holding a north-south straight cannot also hold the
       east-west one that a rightward drag would put in it. So an anchor that
       cannot take the piece simply does not take it, and the stroke starts in
       the cell after. Every other cell in the stroke still stops it dead. */
    if (!canAddSegment(scratch[i], a, b)) {
      if (k === 0) continue;
      return fail('would cross');
    }
    if (addSegment(scratch, i, a, b)) cost++;
    adds.push({ i, a, b });
  }
  if (sleepers(track) + cost > level.budget) return fail('over budget');
  return { ok: true, why: '', adds, cost, track: scratch };
}

/* ============================================================
   ONE PIECE OF THE ANSWER — the hint
   ============================================================

   The owner's rule: it shows ONE hint and does not finish the game. So this
   returns a single segment out of the level's own solution, laid as a real
   piece of track at the ordinary price of one sleeper — a sleeper the answer
   was always going to spend, so a hint costs nothing but the knowing.

   WHICH piece matters more than the fact of one. Handing over a cell on the
   straight run between a tunnel and its shed tells a player what they had
   already worked out. What they are stuck on is the doubling-back: the stretch
   that buys one engine its delay, which goes the wrong way on purpose and is
   the one part of the answer that staring at the sheds will never suggest.

   SO "OFF THE ROAD" IS MEASURED, NOT ESTIMATED. The first version scored a
   cell by Manhattan distance — tunnel to cell plus cell to shed, less tunnel
   to shed — and it was wrong two thirds of the time, because a detour that
   doubles back INSIDE the bounding box of the two scores zero by that measure.
   Only 10 of 30 boards hinted a cell that was actually surprising.

   What this does instead is breadth-first search, twice per engine: distances
   out from the tunnel mouth and back from the shed door, over open ground. A
   cell lies on SOME shortest road exactly when those two distances add up to
   the shortest distance itself. Anything the answer uses that no shortest road
   passes through is the detour, and that is what the button gives you.

   Segments already laid are skipped, so a second press moves on, and anything
   that will not fit the track or the budget is skipped too. Deterministic: the
   same board in the same state always hints the same cell.
*/
function roadDistances(level, from) {
  const d = new Array(level.size).fill(-1);
  if (from < 0) return d;
  d[from] = 0;
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const cur = q[h];
    for (const dir of [N, E, S, W]) {
      const nx = neighbour(level, cur, dir);
      if (nx < 0 || d[nx] >= 0 || level.kind[nx] !== EMPTY) continue;
      d[nx] = d[cur] + 1; q.push(nx);
    }
  }
  return d;
}
/* Every cell that lies on a shortest road between some tunnel and its own
   shed. These are the cells a player works out for themselves. */
function obviousCells(level) {
  const on = new Set();
  for (const p of level.portals) for (const colour of p.queue) {
    const home = level.depots.find((x) => x.colour === colour);
    if (!home) continue;
    const start = neighbour(level, p.i, p.face), goal = neighbour(level, home.i, home.face);
    if (start < 0 || goal < 0) continue;
    const dS = roadDistances(level, start), dG = roadDistances(level, goal);
    const best = dS[goal];
    if (best < 0) continue;
    for (let i = 0; i < level.size; i++)
      if (dS[i] >= 0 && dG[i] >= 0 && dS[i] + dG[i] === best) on.add(i);
  }
  return on;
}
function hintSegment(level, track) {
  if (!level.solution || !level.solution.length) return null;
  const obvious = obviousCells(level);
  const laid = sleepers(track);
  /* AND A TIE IS BROKEN BY DEPTH, which matters more than it sounds. On the
     crossing and the swap boards nothing is off the road — those answers have
     no detour in them at all, the question is which route goes round — so
     every candidate scores the same and the winner is decided by the tie. The
     solution is written tunnel-outward, so first-past-the-post handed over the
     cell against the tunnel mouth: the one piece of the answer nobody needs.
     Furthest from any tunnel is the piece deepest into the puzzle. */
  const depth = new Array(level.size).fill(0);
  for (let i = 0; i < level.size; i++) {
    let best = Infinity;
    for (const p of level.portals) {
      const d = Math.abs(Math.floor(i / level.C) - p.r) + Math.abs((i % level.C) - p.c);
      if (d < best) best = d;
    }
    depth[i] = best === Infinity ? 0 : best;
  }
  let pick = null, bestOff = -1, bestDepth = -1;
  for (const g of level.solution) {
    const [r, c, a, b] = g;
    const i = r * level.C + c;
    const cell = track[i];
    if (cell && cell.segs.some((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a))) continue;
    if (!canAddSegment(cell, a, b)) continue;
    if (laid + 1 > level.budget) continue;
    const off = obvious.has(i) ? 0 : 1;
    if (off > bestOff || (off === bestOff && depth[i] > bestDepth)) {
      bestOff = off; bestDepth = depth[i]; pick = g;
    }
  }
  return pick;
}

// ---------- THE RUN ----------
const RUN_DT = TUNE.dt;

function createRun(level, track) {
  const trains = [];
  level.portals.forEach((p, pi) => p.queue.forEach((colour, slot) => {
    trains.push({
      id: trains.length, colour, portal: pi, slot,
      // The first out of each tunnel is already rolling; the rest wait for the
      // spacing. A train inside its portal starts at the CENTRE of that cell,
      // so it has half a cell to travel before it is out in the yard.
      state: slot === 0 ? 'moving' : 'queued',
      cell: p.i, inSide: opp(p.face), outSide: p.face,
      prog: slot === 0 ? 0.5 : 0,
      cells: 0, parkedAt: -1, sinceState: 0,
      /* THE RAKE, AND THE TRAIL IT NEEDS. A train with carriages is longer
         than the cell its nose is in, so it has to remember the cells it came
         through — both to be drawn along them and to go on BLOCKING them.
         Only as many as the body can reach are kept. */
      cars: (p.rake && p.rake[slot]) || 0,
      trail: [{ cell: p.i, inSide: opp(p.face), outSide: p.face }],
    });
  }));
  return { time: 0, steps: 0, trains, settled: false, won: false, meetings: 0 };
}

const blocks = (t) => t.state === 'moving' || t.state === 'waiting' || t.state === 'stopped' ||
                     t.state === 'parking' || t.state === 'parked';

/* WHICH CELLS A TRAIN IS STANDING ON. With no carriages that is the one its
   nose is in, which is what this game meant by "cell" everywhere before rakes
   existed. With carriages it is the nose plus one cell per vehicle, taken from
   the trail — so a long train really does hold the corridor behind it, and two
   of them meeting is decided by their LENGTH rather than by their noses. */
function occupies(t, i) {
  if (t.cell === i) return true;
  if (!t.cars) return false;
  /* A TRAIN PULLING INTO ITS SHED LETS GO OF THE TRACK BEHIND IT. Its body is
     only as long as the part still outside, so the cell its last wagon has
     just left is free for somebody else the moment it leaves — which is what
     lets a second train follow one home down a shared approach. Parked, it
     holds nothing but the shed. */
  const outside = t.state === 'parked' ? 0
    : t.state === 'parking' ? Math.ceil(Math.max(0, t.cars - Math.max(0, t.prog - 0.5)))
    : t.cars;
  const n = t.trail.length;
  for (let k = 1; k <= outside && k < n; k++) if (t.trail[n - 1 - k].cell === i) return true;
  return false;
}

/* Move one train across the boundary it has reached. Every branch here is a
   thing that HAPPENS, not a thing that is refused. */
function advance(level, track, run, t) {
  const out = t.outSide;
  if (out < 0) return 'stopped';
  const ni = neighbour(level, t.cell, out);
  if (ni < 0) return 'stopped';
  const kd = level.kind[ni];
  if (kd === ROCK || kd === PORTAL) return 'stopped';
  if (kd === DEPOT) {
    if (level.face[ni] !== opp(out)) return 'stopped';   // arriving at the back of the shed
    t.cell = ni; t.inSide = level.face[ni]; t.outSide = -1;
    t.prog = Math.max(0, t.prog - 1); t.cells++; t.state = 'parking';
    t.trail.push({ cell: ni, inSide: level.face[ni], outSide: -1 });
    if (t.trail.length > t.cars + 3) t.trail.shift();
    return 'parking';
  }
  const inSide = opp(out);
  const ex = exitSide(track[ni], inSide);
  if (ex < 0) return 'stopped';
  for (const o of run.trains) {
    if (o.id !== t.id && blocks(o) && occupies(o, ni)) return 'blocked';
  }
  t.cell = ni; t.inSide = inSide; t.outSide = ex; t.prog -= 1; t.cells++;
  t.trail.push({ cell: ni, inSide, outSide: ex });
  if (t.trail.length > t.cars + 3) t.trail.shift();
  return 'moved';
}

function stepRun(level, track, run, dt) {
  if (run.settled) return run;
  const step = dt == null ? RUN_DT : dt;
  run.time += step; run.steps++;
  const v = TUNE.trainSpeed;

  // Spacing. A queued engine leaves when the one in front of it is two cells
  // out and the tunnel mouth itself is clear.
  for (const t of run.trains) {
    if (t.state !== 'queued') continue;
    const p = level.portals[t.portal];
    let prev = null;
    for (const o of run.trains) if (o.portal === t.portal && o.slot === t.slot - 1) prev = o;
    if (!prev || prev.cells < TUNE.spawnGapCells) continue;
    let clear = true;
    for (const o of run.trains) if (o.id !== t.id && blocks(o) && occupies(o, p.i)) clear = false;
    if (clear) { t.state = 'moving'; t.prog = 0.5; }
  }

  for (const t of run.trains) {
    if (t.state === 'parked' || t.state === 'stopped' || t.state === 'queued') continue;
    if (t.state === 'parking') {
      /* THE WHOLE TRAIN GOES IN, not just the nose. Parking used to stop the
         moment the engine reached the middle of the shed, which left every
         carriage standing out in the yard behind it — a three-car train parked
         with two-thirds of itself on the running line. The nose carries on for
         one cell per vehicle, which is exactly the length of the train, so the
         last wagon is through the door as it finishes. */
      const deep = 0.5 + (t.cars || 0);
      t.prog += v * step;
      if (t.prog >= deep) { t.prog = deep; t.state = 'parked'; t.parkedAt = run.time; }
      continue;
    }
    if (t.state === 'moving') t.prog += v * step;
    // A waiting train sits at prog 1 with its nose on the boundary and tries
    // again every step. The guard is a belt: at 2.2 cells/s and a 1/120 step
    // no train can cross two boundaries in one step, so it should never spin.
    let guard = 0;
    while (t.prog >= 1 && guard++ < 4) {
      const was = t.state;
      const r = advance(level, track, run, t);
      if (r === 'blocked') {
        if (was === 'moving') run.meetings++;
        t.state = 'waiting'; t.prog = 1; break;
      }
      if (r === 'stopped') { t.state = 'stopped'; t.prog = 1; break; }
      if (r === 'parking') break;
      t.state = 'moving';
    }
  }

  /* Nothing moving and nothing parking means nothing will ever move again: the
     only thing that can free a waiting train is a moving one leaving the cell
     in front of it, and a queued train only leaves when the one ahead has
     covered ground. So this is a settled yard, not a hopeful guess at one. */
  let live = false;
  for (const t of run.trains) if (t.state === 'moving' || t.state === 'parking') live = true;
  run.settled = !live;
  if (run.settled) run.won = isWon(level, run);
  return run;
}

function isWon(level, run) {
  for (const t of run.trains) {
    if (t.state !== 'parked') return false;
    if (level.colour[t.cell] !== t.colour) return false;
  }
  return true;
}

// Run to completion without a clock. The gate and the tests use this.
function runToEnd(level, track, maxSteps) {
  const run = createRun(level, track);
  const cap = maxSteps || 20000;
  while (!run.settled && run.steps < cap) stepRun(level, track, run, RUN_DT);
  return run;
}

// Lay a solution literal out on a fresh track. Used by tests and by the
// debug handle, so what they prove is what the level actually ships with.
function layout(level, segs) {
  const track = newTrack(level.size);
  for (const [r, c, a, b] of segs) addSegment(track, r * level.C + c, a, b);
  return track;
}

return {
  N, E, S, W, DR, DC, opp, EMPTY, ROCK, PORTAL, DEPOT, TUNE, RUN_DT,
  newTrack, cloneTrack, sleepers, segIndex, isJunction, hasSide, trunkOf,
  activeBranch, idleBranch, exitSide, canAddSegment, addSegment, toggleSwitch,
  eraseCell, buildLevel, padLevel, level1, orderLevel, tightLevel, validate, LEVELS, LEVEL_SPECS, LADDERS, ladder, ladderCount, authored, useLadder, nextOnLadder, levelCount, getLevel,
  rowOf, colOf, sideBetween, neighbour, validateStroke, hintSegment, obviousCells,
  createRun, stepRun, isWon, runToEnd, layout, advance,
};
}));
