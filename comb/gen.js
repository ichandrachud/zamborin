/* ============================================================
   Comb · the lattice, the catalogue, the generator, the bots
   ============================================================

   No DOM in this file and there never will be. It runs unchanged in the
   browser (as window.COMB_GEN) and in Node (as a CommonJS module), because
   the gate in the build brief needs bots to play thousands of levels
   headlessly and a generator that only exists inside a render loop cannot be
   measured.

   THE ONE HEX DECISION, STATED ONCE.

   The board is addressed in OFFSET coordinates — 7 columns by 13 rows, odd
   rows shifted right — because that is what the brief specifies and what the
   renderer wants. Everything else in this file works in AXIAL coordinates,
   and the reason is the whole reason hex code goes wrong:

     In offset coordinates, translating a shape by one row CHANGES its
     relative cell offsets. In axial coordinates it does not.

   Pieces do not rotate in v1, so a placement is a pure translation, so the
   pieces must live in the space where translation is uniform. Convert at the
   boundary, never in the middle. `neighborsOffset` below is the brief's
   literal odd-row table and exists so the gate can assert the two agree; the
   game itself never calls it.

   DETERMINISM. Nothing here calls Math.random. Every level is a pure
   function of (seed, tier), which is what makes the daily, the gate and
   reproducing an owner's bug report possible at all.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.COMB_GEN = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ---------- TUNE ----------
   One object, so a sweep can drive every constant from outside. Nothing below
   this line reads a magic number. */
const TUNE = {
  R: 25, cols: 7, rows: 13,
  pieceMin: 3, pieceMax: 6,
  traySize: 3,
  starPar: 0, starPlus: 2,

  /* How many shapes of each size the catalogue keeps. 20 total, per brief
     3.2. Sweepable: the variety dial has more room with a bigger catalogue. */
  cat3: 5, cat4: 6, cat5: 5, cat6: 4,

  /* Rotation, the brief's reserve difficulty dial (3.2), held OFF for v1.
     1 = the shipped game, where a piece has one orientation. 6 = every piece
     may be turned. It is a flag rather than a fork so both are measured
     through the same code and the gated v1 numbers cannot drift. */
  rotations: 1,

  /* Generator budgets. A blob that cannot be tiled is thrown away and
     regrown, so both numbers are attempts-before-giving-up, not quality
     dials. */
  tileNodes: 40000,
  blobTries: 60,
};

/* ---------- RNG ----------
   xorshift32. Same generator as ricochet/sim.js so two games do not carry two
   answers to "what is a seeded random number". */
function makeRng(seed) {
  const o = { s: (seed >>> 0) || 0x9E3779B9 };
  o.u32 = function () {
    let x = o.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;  x >>>= 0;
    o.s = x; return x;
  };
  o.float = function () { return o.u32() / 4294967296; };
  o.int = function (a, b) { return a + Math.floor(o.float() * (b - a + 1)); };
  o.shuffle = function (arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(o.float() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  return o;
}

/* ---------- coordinates ----------
   Keys pack an axial pair into one integer so sets and maps stay cheap.
   q lives in [-16, 47] and r in [-16, 47] after the +16 bias, which covers
   the 7x13 region (q from -6 to 6, r from 0 to 12) many times over. */
const KEY_BIAS = 16;
const key = (q, r) => (((q + KEY_BIAS) << 6) | (r + KEY_BIAS));
const keyQ = k => (k >> 6) - KEY_BIAS;
const keyR = k => (k & 63) - KEY_BIAS;

/* odd-r offset, odd rows shifted right. */
function axialFromOffset(col, row) {
  return [col - ((row - (row & 1)) >> 1), row];
}
function offsetFromAxial(q, r) {
  return [q + ((r - (r & 1)) >> 1), r];
}

/* In axial the six neighbours are the same six vectors on every row. That is
   the entire point of using it. */
const AX_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

/* The brief's odd-row table, verbatim, in offset coordinates. The game never
   calls this. The gate asserts it agrees with AX_DIRS, because "every hex bug
   in every codebase is an off-by-one in the odd-row offset" and an assertion
   is cheaper than the bug. */
function neighborsOffset(c, r) {
  return (r & 1)
    ? [[c - 1, r], [c + 1, r], [c, r - 1], [c + 1, r - 1], [c, r + 1], [c + 1, r + 1]]
    : [[c - 1, r], [c + 1, r], [c - 1, r - 1], [c, r - 1], [c - 1, r + 1], [c, r + 1]];
}

/* Reading order, for "the first fitting position in scan order". Offset
   row-major: top row first, left to right, which is how a player reads the
   board. */
function scanRank(q, r) {
  const o = offsetFromAxial(q, r);
  return o[1] * 64 + o[0] + 32;
}

/* ---------- polyhex enumeration ----------
   Canonical form under TRANSLATION ONLY, because v1 has no rotation: sort the
   cells in scan order and slide the first one to the origin. Two shapes are
   the same piece exactly when their canonical forms match.

   Growth is complete: every polyhex of size n has at least one cell whose
   removal leaves the rest connected (any leaf of a spanning tree), so adding
   one neighbour to every polyhex of size n-1 reaches all of them. The gate
   checks the counts against the known sequence 1, 3, 11, 44, 186, 814. */
function canon(cells) {
  const s = cells.slice().sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
  const dq = s[0][0], dr = s[0][1];
  return s.map(c => [c[0] - dq, c[1] - dr]);
}
const shapeKey = cells => cells.map(c => c[0] + ':' + c[1]).join('|');

function enumeratePolyhexes(maxN) {
  const bySize = [null, [[[0, 0]]]];
  for (let n = 2; n <= maxN; n++) {
    const seen = new Map();
    for (const shape of bySize[n - 1]) {
      const have = new Set(shape.map(c => key(c[0], c[1])));
      for (const c of shape) {
        for (const d of AX_DIRS) {
          const nq = c[0] + d[0], nr = c[1] + d[1];
          if (have.has(key(nq, nr))) continue;
          const cand = canon(shape.concat([[nq, nr]]));
          const k = shapeKey(cand);
          if (!seen.has(k)) seen.set(k, cand);
        }
      }
    }
    bySize[n] = Array.from(seen.values());
  }
  return bySize;
}

/* ---------- rotation ----------
   In cube coordinates a 60 degree turn is a coordinate shuffle, and in axial
   that is (q, r) -> (-r, q + r). Six turns return the shape to itself, and a
   symmetric shape reaches fewer than six distinct orientations, so the list is
   deduped by canonical form rather than assumed to be six long. */
function rotate60(cells) {
  return cells.map(c => [-c[1], c[0] + c[1]]);
}
function orientationsOf(cells, limit) {
  const n = limit || 6;
  const out = [], seen = new Set();
  let cur = canon(cells);
  for (let i = 0; i < 6 && out.length < n; i++) {
    const k = shapeKey(cur);
    if (!seen.has(k)) { seen.add(k); out.push(cur); }
    cur = canon(rotate60(cur));
  }
  return out;
}

/* ---------- the catalogue ----------
   Deterministic, so the art and the generator agree without a hand-typed
   table drifting from the code.

   Ranked by ADJACENCY first — how many touching pairs the shape contains —
   which selects compact honeycomb clusters over spidery chains, then by the
   area of its bounding box ON SCREEN (offset space, not axial: axial bounding
   boxes are sheared and do not describe what the piece looks like). */
function shapeStats(cells) {
  const have = new Set(cells.map(c => key(c[0], c[1])));
  let adj = 0;
  for (const c of cells) {
    for (const d of AX_DIRS) if (have.has(key(c[0] + d[0], c[1] + d[1]))) adj++;
  }
  let minC = 99, maxC = -99, minR = 99, maxR = -99;
  for (const c of cells) {
    const o = offsetFromAxial(c[0], c[1]);
    if (o[0] < minC) minC = o[0];
    if (o[0] > maxC) maxC = o[0];
    if (o[1] < minR) minR = o[1];
    if (o[1] > maxR) maxR = o[1];
  }
  return {
    adj: adj / 2,
    box: (maxC - minC + 1) * (maxR - minR + 1),
    w: maxC - minC + 1, h: maxR - minR + 1,
  };
}

function buildCatalogue(tune) {
  const t = tune || TUNE;
  const all = enumeratePolyhexes(t.pieceMax);
  const want = { 3: t.cat3, 4: t.cat4, 5: t.cat5, 6: t.cat6 };
  const out = [];
  for (let n = t.pieceMin; n <= t.pieceMax; n++) {
    const ranked = all[n].map(cells => ({ cells, st: shapeStats(cells), k: shapeKey(cells) }));
    ranked.sort((a, b) =>
      (b.st.adj - a.st.adj) || (a.st.box - b.st.box) || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
    for (const r of ranked.slice(0, want[n] || 0)) {
      out.push({
        id: out.length, size: n, cells: r.cells,
        w: r.st.w, h: r.st.h, adj: r.st.adj,
      });
    }
  }
  return out;
}
const CATALOGUE = buildCatalogue(TUNE);

/* ---------- board outlines ----------
   Grow a connected blob inside the cols x rows region. `irregularity` weakens
   how strongly growth prefers a frontier cell that already has neighbours
   inside: 0 is a tight rounded mass, 1 is loose and notched.

   IT NEVER GOES NEGATIVE, and that is a measured decision, not caution. The
   first version blended toward PREFERRING isolated cells at high settings, so
   at 0.5 the two halves cancelled, growth became pure jitter, and the outline
   came out a dendrite — a tree of one-cell-wide arms. Nothing 3 cells or
   larger tiles a dendrite, so every level from tier 6 up failed to generate,
   100% of the time. Irregularity means a notched edge, not a tree. */
function regionKeys(tune) {
  const t = tune || TUNE;
  const out = [];
  for (let r = 0; r < t.rows; r++) {
    for (let c = 0; c < t.cols; c++) {
      const a = axialFromOffset(c, r);
      out.push(key(a[0], a[1]));
    }
  }
  return out;
}

function growBlob(rng, cells, irregularity, tune) {
  const t = tune || TUNE;
  const region = new Set(regionKeys(t));
  // Seed near the middle so the outline sits in the frame rather than hugging
  // an edge, which reads as a cropped board rather than a designed one.
  const sr = Math.floor(t.rows / 2) + rng.int(-2, 2);
  const sc = Math.floor(t.cols / 2) + rng.int(-1, 1);
  const seed = axialFromOffset(
    Math.max(0, Math.min(t.cols - 1, sc)),
    Math.max(0, Math.min(t.rows - 1, sr)));
  const inside = new Set([key(seed[0], seed[1])]);
  const frontier = new Set();
  const pushFrontier = k => {
    const q = keyQ(k), r = keyR(k);
    for (const d of AX_DIRS) {
      const nk = key(q + d[0], r + d[1]);
      if (region.has(nk) && !inside.has(nk)) frontier.add(nk);
    }
  };
  pushFrontier(key(seed[0], seed[1]));

  while (inside.size < cells && frontier.size) {
    let best = -1, bestScore = -Infinity;
    for (const fk of frontier) {
      const q = keyQ(fk), r = keyR(fk);
      let fill = 0;
      for (const d of AX_DIRS) if (inside.has(key(q + d[0], r + d[1]))) fill++;
      const score = fill * 3.0 + rng.float() * (0.6 + 9.0 * irregularity);
      if (score > bestScore) { bestScore = score; best = fk; }
    }
    frontier.delete(best);
    inside.add(best);
    pushFrontier(best);
  }
  return inside.size === cells ? Array.from(inside) : null;
}

/* ---------- placements ----------
   A level's board never changes, so every legal translation of every shape is
   computed once at generation time. At play time a placement is legal exactly
   when none of its cells is occupied, which is a loop over at most six bytes. */
function buildPlacements(boardKeys, catalogue, tune) {
  const index = new Map();
  boardKeys.forEach((k, i) => index.set(k, i));
  const byShape = catalogue.map(() => []);
  const rots = (tune || TUNE).rotations || 1;
  for (const shape of catalogue) {
    const oris = orientationsOf(shape.cells, rots);
    for (let o = 0; o < oris.length; o++) {
      const cells = oris[o];
      const seenT = new Set();
      for (const bk of boardKeys) {
        const bq = keyQ(bk), br = keyR(bk);
        for (const anchor of cells) {
          const tq = bq - anchor[0], tr = br - anchor[1];
          const tk = key(tq, tr);
          if (seenT.has(tk)) continue;
          seenT.add(tk);
          const idx = [];
          let ok = true;
          for (const c of cells) {
            const i = index.get(key(c[0] + tq, c[1] + tr));
            if (i === undefined) { ok = false; break; }
            idx.push(i);
          }
          if (!ok) continue;
          idx.sort((a, b) => a - b);
          byShape[shape.id].push({ shape: shape.id, rot: o, t: [tq, tr], idx, rank: idx[0] });
        }
      }
    }
    /* Scan order, so "the first fitting position" means the same thing to the
       greedy bot, the hint and the renderer. Orientation breaks the tie, and
       greedy is as mindless about which way round a piece goes as it is about
       where it goes, which is the point. */
    byShape[shape.id].sort((a, b) => (a.rank - b.rank) || ((a.rot || 0) - (b.rot || 0)));
  }
  return { index, byShape };
}

/* Board cells are stored in scan order, so index 0 is the top-left cell and
   "the first empty cell" is just the first zero in the occupancy array. */
function sortedBoard(boardKeys) {
  return boardKeys.slice().sort((a, b) =>
    scanRank(keyQ(a), keyR(a)) - scanRank(keyQ(b), keyR(b)));
}

/* ---------- the prune that makes everything else fast ----------
   No piece is smaller than pieceMin, so the moment an island of empty cells
   is smaller than that, the branch is dead. Cheap, sound, and it is also
   exactly the mistake a human sees instantly, which is why Bot L below is
   built out of it. */
function makeAdjacency(boardKeys) {
  const index = new Map();
  boardKeys.forEach((k, i) => index.set(k, i));
  return boardKeys.map(k => {
    const q = keyQ(k), r = keyR(k), out = [];
    for (const d of AX_DIRS) {
      const i = index.get(key(q + d[0], r + d[1]));
      if (i !== undefined) out.push(i);
    }
    return out;
  });
}

function smallestIsland(occ, adjacency, minSize) {
  const n = occ.length;
  const seen = new Uint8Array(n);
  const stack = [];
  let worst = Infinity;
  for (let i = 0; i < n; i++) {
    if (occ[i] || seen[i]) continue;
    let size = 0;
    seen[i] = 1; stack.length = 0; stack.push(i);
    while (stack.length) {
      const c = stack.pop(); size++;
      for (const nb of adjacency[c]) if (!occ[nb] && !seen[nb]) { seen[nb] = 1; stack.push(nb); }
    }
    if (size < worst) worst = size;
    if (worst < minSize) return worst;
  }
  return worst === Infinity ? Infinity : worst;
}

/* ---------- the tiler ----------
   Randomised exact cover. Always branch on the first empty cell in scan
   order: it must be covered by something, so trying every placement that
   covers it is complete and never explores an ordering twice.

   varietyBias in [-1, 1] is difficulty dial 1. Positive prefers a shape the
   solution has not used yet, so the pieces come out all different and a wrong
   choice is unforgiving. Negative prefers a shape already used, so the tray
   holds interchangeable pieces that forgive it. */
function tileBoard(board, catalogue, rng, opts) {
  const t = opts.tune || TUNE;
  const allowed = opts.allowed || catalogue.map(s => s.id);
  const pl = buildPlacements(board, catalogue, t);
  const adjacency = makeAdjacency(board);
  const n = board.length;
  const occ = new Uint8Array(n);
  const used = new Uint8Array(catalogue.length);
  const chosen = [];
  const bias = opts.varietyBias || 0;
  let nodes = 0;
  const budget = opts.nodes || t.tileNodes;

  // Placements grouped by the cell they cover, so branching on a cell is a
  // lookup rather than a scan of every translation on the board.
  const covering = board.map(() => []);
  for (const sid of allowed) {
    for (const p of pl.byShape[sid]) for (const i of p.idx) covering[i].push(p);
  }

  function firstEmpty() {
    for (let i = 0; i < n; i++) if (!occ[i]) return i;
    return -1;
  }

  function rec(placed) {
    if (++nodes > budget) return false;
    const cell = firstEmpty();
    if (cell < 0) return true;

    const cands = [];
    for (const p of covering[cell]) {
      let ok = true;
      for (const i of p.idx) if (occ[i]) { ok = false; break; }
      if (ok) cands.push(p);
    }
    if (!cands.length) return false;

    // Score once, sort once. The jitter is what makes two seeds on the same
    // board produce different tilings.
    const scored = cands.map(p => ({
      p, s: rng.float() + bias * (used[p.shape] ? -1 : 1),
    }));
    scored.sort((a, b) => b.s - a.s);

    for (const { p } of scored) {
      for (const i of p.idx) occ[i] = 1;
      used[p.shape]++;
      chosen.push(p);
      if (smallestIsland(occ, adjacency, t.pieceMin) >= t.pieceMin && rec(placed + 1)) return true;
      chosen.pop();
      used[p.shape]--;
      for (const i of p.idx) occ[i] = 0;
      if (nodes > budget) return false;
    }
    return false;
  }

  return rec(0) ? { pieces: chosen.slice(), nodes, placements: pl, adjacency } : null;
}

/* ---------- the shape pool ----------
   Difficulty dial 1 is shape variety, and a BIAS alone cannot deliver it at
   the easy end: a 12-cell level holds three pieces, so "prefer a shape you
   have already used" has almost nothing to work with and the pieces come out
   86% distinct however hard the bias pushes. The dial that works is the POOL
   the tiler may draw from. Two shapes and the tray is full of
   interchangeable pieces that forgive a wrong choice; twenty and every piece
   has one home.

   The pool always contains a smallest-size shape. Without one, a region whose
   remainder is 3 cells has nothing to close it and the level cannot generate. */
function drawPool(rng, catalogue, allowed, poolSize, tune) {
  const t = tune || TUNE;
  if (!poolSize || poolSize >= allowed.length) return allowed.slice();
  const smallest = allowed.filter(id => catalogue[id].size === t.pieceMin);
  const rest = rng.shuffle(allowed.filter(id => catalogue[id].size !== t.pieceMin));
  const pool = [];
  if (smallest.length) pool.push(smallest[rng.int(0, smallest.length - 1)]);
  for (const id of rest) { if (pool.length >= poolSize) break; pool.push(id); }
  for (const id of rng.shuffle(smallest.slice())) { if (pool.length >= poolSize) break; if (!pool.includes(id)) pool.push(id); }
  return pool;
}

/* ---------- tiers ----------
   Three dials in the brief's order of strength: shape variety, piece count
   (through cell count), board irregularity. Fourteen rungs because the gate
   asks whether a sub-15% greedy tier exists WITHIN fourteen, and a table that
   stops at ten cannot answer that question. Levels 1-100 use the first ten.

   THE CELL COUNTS ARE MEASURED, NOT CHOSEN. The brief's board region is 7x13
   and the obvious reading is that a late level fills most of it. It cannot.
   Past about 26 cells nothing solves these levels except an exhaustive
   search: greedy is at 0% by 31 cells, and so is most-constrained-cell
   reasoning, which is the strategy a person actually uses. The band where
   mindless play fails AND reasoning wins with no rewinding at all is roughly
   12 to 26 cells, so that is where all fourteen rungs sit. A wider board is
   not a harder level, it is a longer search. */
const TIERS = [
  /* THE OPENING IS NOT A TUTORIAL ANY MORE. The brief asked for greedy above
     85% at tier 1 on the grounds that "the opening must be gentle", and that
     is what produced nine near-identical levels nobody had to think about.
     The owner played it and called it a wasted turn, which is the right call
     for a game whose whole job is to hook someone in the first thirty seconds.

     The new shape of level 1, and of every level: greedy near 50%, so a
     player who does not look fails about half the time, and Bot C at ~100% on
     half a pick-up, so a player who DOES look wins first go. Two thirds of
     placements are forced. That is the "oh, I see it" the game is for.

     Every rung was selected on four numbers at once — greedy, Bot C, pick-ups
     and how many of its ten levels differ — rather than on difficulty alone,
     which is how the first ladder ended up shipping one level ten times. Every
     tier here makes ten distinct levels out of ten.

     The order is the GATE's measurement, not the selection grid's prediction.
     Two rungs came out the wrong way round when measured on the gate's own
     seeds and were swapped; a ladder ordered by what a different sample said
     is not ordered. */
  { cells: 12, spread: 0, pool:  6, sizes: [3, 6], varietyBias:  0.24, irregularity: 0.75 },
  { cells: 12, spread: 2, pool:  3, sizes: [3, 6], varietyBias: -0.30, irregularity: 0.75 },
  { cells: 13, spread: 1, pool:  3, sizes: [3, 6], varietyBias: -0.30, irregularity: 0.75 },
  { cells: 14, spread: 0, pool:  9, sizes: [3, 6], varietyBias:  0.51, irregularity: 0.75 },
  { cells: 13, spread: 0, pool:  6, sizes: [3, 6], varietyBias:  0.24, irregularity: 0.55 },
  { cells: 15, spread: 0, pool:  6, sizes: [3, 6], varietyBias:  0.24, irregularity: 0.35 },
  { cells: 15, spread: 2, pool:  6, sizes: [3, 6], varietyBias:  0.24, irregularity: 0.35 },
  { cells: 16, spread: 1, pool:  6, sizes: [3, 6], varietyBias:  0.24, irregularity: 0.75 },
  /* The last two are where the derivable band runs out: below about 22% greedy
     nothing keeps Bot C above 90% on under 1.6 pick-ups, so these two ask for
     a little grinding. They are the rungs that reach the brief's sub-15%. */
  { cells: 17, spread: 0, pool:  6, sizes: [3, 5], varietyBias:  0.24, irregularity: 0.35 },
  { cells: 17, spread: 0, pool:  9, sizes: [3, 6], varietyBias:  0.51, irregularity: 0.35 },
  /* Rungs 11-14 are NOT used by levels 1-100 and exist only to answer the
     gate's question about reaching sub-15% within fourteen. */
  { cells: 18, spread: 0, pool: 14, sizes: [3, 6], varietyBias:  0.96, irregularity: 0.40 },
  { cells: 20, spread: 0, pool:  9, sizes: [3, 6], varietyBias:  0.51, irregularity: 0.50 },
  { cells: 22, spread: 0, pool: 14, sizes: [3, 6], varietyBias:  0.96, irregularity: 0.60 },
  { cells: 26, spread: 0, pool: 20, sizes: [3, 6], varietyBias:  1.00, irregularity: 0.80 },
];
// Levels 1-100 across the first ten rungs, ten levels each.
const tierOf = level => Math.min(TIERS.length - 1, Math.floor((level - 1) / 10));

/* ---------- a level ----------
   Deconstruction, never construction: tile first, then take the tiling apart.
   The tiling IS the solution and its length IS par. */
function makeLevel(seed, tierIdx, opts) {
  const o = opts || {};
  const t = o.tune || TUNE;
  const cat = o.catalogue || CATALOGUE;
  const tier = (o.tiers || TIERS)[Math.max(0, Math.min((o.tiers || TIERS).length - 1, tierIdx))];
  const rng = makeRng((seed * 2654435761) ^ (tierIdx * 40503) ^ 0x5bf03635);

  /* SPREAD: the cell count varies level to level inside a tier, taken off the
     seed so consecutive levels get different sizes and the whole thing stays a
     pure function of (seed, tier).

     It was built, measured, removed and brought back, and the reason is worth
     keeping. While the brief's "the opening must be gentle" stood, spread cost
     more gentleness than it bought variety: a bigger board is a harder board,
     and every setting dropped tier 1 under the 85% bar. The owner then decided
     an opening nobody has to think about is a wasted turn, which is a
     different goal, and under THAT goal a varying board size is the most
     visible difference between two levels and the cheapest thing on the menu. */
  const spread = tier.spread || 0;
  const cells = spread
    ? tier.cells + (((seed % (spread * 2 + 1)) + spread * 2 + 1) % (spread * 2 + 1)) - spread
    : tier.cells;
  const allowed = cat.filter(s => s.size >= tier.sizes[0] && s.size <= tier.sizes[1]).map(s => s.id);

  for (let attempt = 0; attempt < t.blobTries; attempt++) {
    const blob = growBlob(rng, cells, tier.irregularity, t);
    if (!blob) continue;
    const board = sortedBoard(blob);
    // A two-shape pool cannot tile about half of all outlines, so a tier that
    // wants one would otherwise leave holes in the level list — level 7 simply
    // would not exist. Widen the pool as attempts fail rather than returning
    // null: the tier keeps the pool it asked for on most seeds and every seed
    // still yields a level.
    const relax = Math.floor(attempt / 12);
    const pool = drawPool(rng, cat, allowed, tier.pool ? tier.pool + relax : 0, t);
    const tiled = tileBoard(board, cat, rng, {
      allowed: pool, varietyBias: tier.varietyBias, tune: t, nodes: t.tileNodes,
    });
    if (!tiled) continue;

    // The tray is a queue. Shuffling it is what makes the order a decision
    // rather than a recital of the solution.
    const order = rng.shuffle(tiled.pieces.map((_, i) => i));
    const queue = order.map(i => tiled.pieces[i]);

    /* Asked to avoid a signature, try another outline rather than hand back a
       level the player has just finished. On the last attempt take it anyway:
       a repeated level is a blemish, a missing one is a hole in the ladder. */
    if (o.avoid && o.avoid.length && attempt < t.blobTries - 1) {
      const outline = shapeKey(canon(board.map(k => [keyQ(k), keyR(k)])));
      const sig = outline + '#' + queue.map(p => p.shape).sort((a, b) => a - b).join(',');
      if (o.avoid.indexOf(sig) >= 0) continue;
    }

    return {
      seed, tier: tierIdx, attempt, pool,
      board,                       // cell keys, scan order
      n: board.length,
      solution: tiled.pieces,      // placements, in tiling order
      queue,                       // the same placements, in tray order
      par: tiled.pieces.length,
      shapes: queue.map(p => p.shape),
      distinctShapes: new Set(queue.map(p => p.shape)).size,
      placements: tiled.placements,
      adjacency: tiled.adjacency,
      catalogue: cat,
      tune: t,
    };
  }
  return null;
}

/* What makes one level look like another to a PLAYER: the shape of the board
   and which pieces it hands you. Not where it sits in the region, so the
   outline is canonicalised, and not the order of the tray, so the pieces are
   sorted. */
function levelSig(lv) {
  // '#' separates the two halves because shapeKey already uses ':' and '|',
  // so splitting a signature on '|' returns one CELL of the outline rather
  // than the outline. The gate's variety row did exactly that and reported
  // one distinct outline per tier while also reporting ten distinct levels.
  const outline = shapeKey(canon(lv.board.map(k => [keyQ(k), keyR(k)])));
  return outline + '#' + lv.shapes.slice().sort((a, b) => a - b).join(',');
}

/* The hundred as a player meets them, which is the only sequence that matters.

   A level is regenerated if it comes out identical to THE ONE BEFORE IT AS THE
   PLAYER ACTUALLY GETS IT. The first attempt at this compared each level to
   the raw generator's answer for n-1 rather than to the corrected level, so
   fixing the clash between 11 and 12 simply moved it to 12 and 13. A chain has
   to be built as a chain.

   Built forward and cached, so playing in order costs one generation a level
   and jumping to level 95 from the map costs ninety-five once. */
const _ladder = [null];
let _built = 0;
function shippedLevel(n) {
  n = Math.max(1, n | 0);
  while (_built < n) {
    const k = _built + 1;
    const prev = _ladder[k - 1] ? levelSig(_ladder[k - 1]) : null;
    const opt = prev ? { avoid: [prev] } : undefined;
    let lv = makeLevel(k, tierOf(k), opt);
    /* Sixty outlines in a row can refuse to tile, which happens to about one
       level in a hundred. Nudging the seed still names one fixed level for
       that number, it is just not the first outline the seed produced. The
       ladder must never have a hole in it. */
    for (let bump = 1; !lv && bump <= 24; bump++) lv = makeLevel(k + bump * 7919, tierOf(k), opt);
    _ladder[k] = lv;
    _built = k;
  }
  return _ladder[n];
}

/* ---------- the tray ----------
   Slots hold the first `traySize` unplaced pieces in queue order. That is not
   an approximation: you only ever remove from a slot and refill it from the
   head of the queue, so the set of slot contents is always exactly that. */
function visibleSlots(level, placedMask, traySize) {
  const out = [];
  for (let i = 0; i < level.queue.length && out.length < traySize; i++) {
    if (!placedMask[i]) out.push(i);
  }
  return out;
}

function legalPlacements(level, shapeId, occ) {
  const out = [];
  for (const p of level.placements.byShape[shapeId]) {
    let ok = true;
    for (const i of p.idx) if (occ[i]) { ok = false; break; }
    if (ok) out.push(p);
  }
  return out;
}

/* ---------- Bot G — greedy, exactly as the brief specifies ----------
   First piece in tray order that fits anywhere, first fitting position in
   scan order, never backtrack. It fails when nothing in the tray fits. It
   cannot fail any other way: the queue's sizes sum to the board, so placing
   every piece necessarily fills it. */
function botGreedy(level, tune) {
  const t = tune || level.tune || TUNE;
  const occ = new Uint8Array(level.n);
  const placedMask = new Uint8Array(level.queue.length);
  let placed = 0;
  while (placed < level.queue.length) {
    const slots = visibleSlots(level, placedMask, t.traySize);
    let did = false;
    for (const qi of slots) {
      const legal = legalPlacements(level, level.queue[qi].shape, occ);
      if (!legal.length) continue;
      for (const i of legal[0].idx) occ[i] = 1;
      placedMask[qi] = 1; placed++; did = true;
      break;
    }
    if (!did) return { solved: false, placed, stuckAt: placed };
  }
  return { solved: true, placed };
}

/* ---------- Bot L — greedy that will not strand a hole ----------
   NOT IN THE BRIEF, and labelled everywhere it appears.

   Bot G is a fair test of mindless play, but a human is not mindless in this
   one specific way: nobody leaves a single empty cell with no piece small
   enough to fill it. Bot L is Bot G plus that one look, so it takes the first
   placement in scan order that does not leave an island smaller than the
   smallest piece.

   The reason it has to be here: if Bot G fails often and Bot L sails through,
   the difficulty the gate measures is not difficulty a player will ever feel.
   Without it, a pass and a false pass look identical. */
function botLookahead(level, tune) {
  const t = tune || level.tune || TUNE;
  const occ = new Uint8Array(level.n);
  const placedMask = new Uint8Array(level.queue.length);
  let placed = 0;
  while (placed < level.queue.length) {
    const slots = visibleSlots(level, placedMask, t.traySize);
    let chosen = null, chosenQi = -1;
    // Prefer a safe placement from the earliest slot; fall back to any
    // placement at all, because refusing to move is a loss either way.
    let fallback = null, fallbackQi = -1;
    for (const qi of slots) {
      const legal = legalPlacements(level, level.queue[qi].shape, occ);
      if (!legal.length) continue;
      if (fallback === null) { fallback = legal[0]; fallbackQi = qi; }
      for (const p of legal) {
        for (const i of p.idx) occ[i] = 1;
        const worst = smallestIsland(occ, level.adjacency, t.pieceMin);
        for (const i of p.idx) occ[i] = 0;
        if (worst >= t.pieceMin) { chosen = p; chosenQi = qi; break; }
      }
      if (chosen) break;
    }
    if (!chosen) { chosen = fallback; chosenQi = fallbackQi; }
    if (!chosen) return { solved: false, placed };
    for (const i of chosen.idx) occ[i] = 1;
    placedMask[chosenQi] = 1; placed++;
  }
  return { solved: true, placed };
}

/* ---------- Bot B — how much rewinding ----------
   NOT IN THE BRIEF, and labelled everywhere it appears.

   Getting stuck is not losing in this game: §3.4 has no lose condition and a
   seated piece can be picked back up. So "does greedy finish" answers whether
   the level needs planning, but it does not answer what the level COSTS, and
   it saturates — past about twenty cells every greedy bot is at zero and
   every tier looks the same.

   Bot B plays the sensible move first (no stranded island, then scan order)
   and picks the last piece back up when it dead-ends, which is exactly what a
   player does. What it reports is the number of PICK-UPS, and that keeps
   rising long after greedy has floored. Moves = par + pickups, which is also
   the number the star thresholds are cut from. */
function botRewind(level, opts) {
  const o = opts || {};
  const t = o.tune || level.tune || TUNE;
  const cap = o.cap || 4000;
  const occ = new Uint8Array(level.n);
  const placedMask = new Uint8Array(level.queue.length);
  const stack = [];
  let pickups = 0, placed = 0;

  const orderedFor = qi => {
    const legal = legalPlacements(level, level.queue[qi].shape, occ);
    const safe = [], risky = [];
    for (const p of legal) {
      for (const i of p.idx) occ[i] = 1;
      const worst = smallestIsland(occ, level.adjacency, t.pieceMin);
      for (const i of p.idx) occ[i] = 0;
      (worst >= t.pieceMin ? safe : risky).push(p);
    }
    return safe.concat(risky);
  };

  // Options at a step: every (slot, placement) pair, slots in tray order.
  const optionsHere = () => {
    const out = [];
    for (const qi of visibleSlots(level, placedMask, t.traySize)) {
      for (const p of orderedFor(qi)) out.push({ qi, p });
    }
    return out;
  };

  let frame = { opts: optionsHere(), i: 0 };
  stack.push(frame);
  while (stack.length) {
    if (pickups > cap) return { solved: false, pickups, capped: true };
    const top = stack[stack.length - 1];
    if (top.i >= top.opts.length) {
      stack.pop();
      if (!stack.length) return { solved: false, pickups, capped: false };
      const prev = stack[stack.length - 1];
      const chosen = prev.opts[prev.i - 1];
      for (const i of chosen.p.idx) occ[i] = 0;
      placedMask[chosen.qi] = 0; placed--; pickups++;
      continue;
    }
    const choice = top.opts[top.i++];
    for (const i of choice.p.idx) occ[i] = 1;
    placedMask[choice.qi] = 1; placed++;
    if (placed === level.queue.length) return { solved: true, pickups, moves: placed + pickups };
    stack.push({ opts: optionsHere(), i: 0 });
  }
  return { solved: false, pickups, capped: false };
}

/* ---------- Bot C — is the next piece DERIVABLE? ----------
   NOT IN THE BRIEF, and labelled everywhere it appears.

   Bot B counts what blind rewinding costs, which overstates a human: nobody
   plays an exact-fill puzzle by chronological backtracking. What a person
   actually does is look for the tightest hole — the notch that only one piece
   can close — and place that. If that reasoning carries a level, the level is
   a puzzle. If it does not, the level is a search dressed as a puzzle, and
   the repo's own bar is "derivable BEFORE tested".

   So Bot C branches on the MOST CONSTRAINED empty cell: the one that the
   fewest legal placements can cover. It reports three things:

     forced   the share of placements where that cell had exactly ONE option.
              This is the derivable share. It is the number that matters.
     guessed  the share where it had to choose among several.
     pickups  what the guesses cost when they were wrong.

   A cell with zero options is a dead-end HINT and not a proof, because the
   tray hides pieces that could still cover it, so it is used for ordering
   only and never to prune. */
function botConstrained(level, opts) {
  const o = opts || {};
  const t = o.tune || level.tune || TUNE;
  const cap = o.cap || 4000;
  const occ = new Uint8Array(level.n);
  const placedMask = new Uint8Array(level.queue.length);
  let pickups = 0, placed = 0, forced = 0, guessed = 0;

  function optionsHere() {
    // Every (slot, placement) pair the tray allows right now.
    const all = [];
    for (const qi of visibleSlots(level, placedMask, t.traySize)) {
      for (const p of legalPlacements(level, level.queue[qi].shape, occ)) all.push({ qi, p });
    }
    if (!all.length) return { list: [], forcedHere: false };

    // Which empty cell is covered by the fewest of them?
    const count = new Int32Array(level.n);
    for (const c of all) for (const i of c.p.idx) count[i]++;
    let bestCell = -1, bestN = Infinity;
    for (let i = 0; i < level.n; i++) {
      if (occ[i] || count[i] === 0) continue;
      if (count[i] < bestN) { bestN = count[i]; bestCell = i; }
    }
    if (bestCell < 0) return { list: all, forcedHere: false };

    const list = all.filter(c => c.p.idx.indexOf(bestCell) >= 0);
    // Safe first inside the tightest cell, so a guess is at least a sane one.
    const safe = [], risky = [];
    for (const c of list) {
      for (const i of c.p.idx) occ[i] = 1;
      const worst = smallestIsland(occ, level.adjacency, t.pieceMin);
      for (const i of c.p.idx) occ[i] = 0;
      (worst >= t.pieceMin ? safe : risky).push(c);
    }
    return { list: safe.concat(risky), forcedHere: list.length === 1 };
  }

  const stack = [];
  let here = optionsHere();
  stack.push({ opts: here.list, i: 0, forcedHere: here.forcedHere });
  while (stack.length) {
    if (pickups > cap) return { solved: false, pickups, forced, guessed, capped: true };
    const top = stack[stack.length - 1];
    if (top.i >= top.opts.length) {
      stack.pop();
      if (!stack.length) return { solved: false, pickups, forced, guessed, capped: false };
      const prev = stack[stack.length - 1];
      const chosen = prev.opts[prev.i - 1];
      for (const i of chosen.p.idx) occ[i] = 0;
      placedMask[chosen.qi] = 0; placed--; pickups++;
      if (prev.forcedHere) forced--; else guessed--;
      continue;
    }
    const choice = top.opts[top.i++];
    if (top.forcedHere) forced++; else guessed++;
    for (const i of choice.p.idx) occ[i] = 1;
    placedMask[choice.qi] = 1; placed++;
    if (placed === level.queue.length) {
      return { solved: true, pickups, forced, guessed, moves: placed + pickups,
               forcedShare: forced / Math.max(1, forced + guessed) };
    }
    here = optionsHere();
    stack.push({ opts: here.list, i: 0, forcedHere: here.forcedHere });
  }
  return { solved: false, pickups, forced, guessed, capped: false };
}

/* ---------- Bot P — the planner ----------
   Backtracking exact cover over the whole multiset of queue pieces, ignoring
   the tray window, which is the brief's specification. Branch on the first
   empty cell; a piece of each shape still in the queue may cover it.

   100% is the only acceptable answer and it is not a difficulty signal. If
   this drops below 100 the generator is broken. */
function botPlanner(level, budget) {
  const n = level.n;
  const occ = new Uint8Array(n);
  const remaining = new Map();
  for (const p of level.queue) remaining.set(p.shape, (remaining.get(p.shape) || 0) + 1);
  const cap = budget || 400000;
  let nodes = 0;

  const covering = level.board.map(() => []);
  for (const [sid] of remaining) {
    for (const p of level.placements.byShape[sid]) for (const i of p.idx) covering[i].push(p);
  }

  function firstEmpty() { for (let i = 0; i < n; i++) if (!occ[i]) return i; return -1; }

  function rec() {
    if (++nodes > cap) return false;
    const cell = firstEmpty();
    if (cell < 0) return true;
    for (const p of covering[cell]) {
      if (!remaining.get(p.shape)) continue;
      let ok = true;
      for (const i of p.idx) if (occ[i]) { ok = false; break; }
      if (!ok) continue;
      for (const i of p.idx) occ[i] = 1;
      remaining.set(p.shape, remaining.get(p.shape) - 1);
      if (smallestIsland(occ, level.adjacency, level.tune.pieceMin) >= level.tune.pieceMin && rec()) return true;
      remaining.set(p.shape, remaining.get(p.shape) + 1);
      for (const i of p.idx) occ[i] = 0;
      if (nodes > cap) return false;
    }
    return false;
  }
  const solved = rec();
  return { solved, nodes, budgetHit: nodes > cap };
}

/* ---------- the constructive check ----------
   The proof that a level is solvable is not a search, it is the tiling it was
   built from. Replaying the queue in order at its own solution positions must
   be legal at every step, and the head of the queue is always visible, so
   this is a solution a player could actually reach through the tray.

   A search that times out and a level that is unsolvable look the same from
   outside. This tells them apart. */
function verifyConstructive(level, tune) {
  const t = tune || level.tune || TUNE;
  const occ = new Uint8Array(level.n);
  const placedMask = new Uint8Array(level.queue.length);
  for (let step = 0; step < level.queue.length; step++) {
    const slots = visibleSlots(level, placedMask, t.traySize);
    const qi = slots[0];
    if (qi === undefined) return { ok: false, step, why: 'tray empty' };
    const p = level.queue[qi];
    for (const i of p.idx) if (occ[i]) return { ok: false, step, why: 'overlap' };
    for (const i of p.idx) occ[i] = 1;
    placedMask[qi] = 1;
  }
  for (let i = 0; i < level.n; i++) if (!occ[i]) return { ok: false, why: 'unfilled' };
  return { ok: true };
}

/* ---------- ascii, for the gate ----------
   A number that says a board is awkward is not the same as looking at it. */
function asciiBoard(level, fills) {
  const t = level.tune || TUNE;
  const at = new Map();
  level.board.forEach((k, i) => at.set(k, i));
  const glyph = '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lines = [];
  for (let r = 0; r < t.rows; r++) {
    let s = (r & 1) ? '  ' : '';
    let any = false;
    for (let c = 0; c < t.cols; c++) {
      const a = axialFromOffset(c, r);
      const i = at.get(key(a[0], a[1]));
      if (i === undefined) { s += '  . '; continue; }
      any = true;
      const f = fills ? fills[i] : -1;
      s += ' ' + (f >= 0 ? glyph[f % glyph.length] : '#') + '  ';
    }
    if (any || lines.length) lines.push(s.replace(/\s+$/, ''));
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join('\n');
}

function asciiShape(shape) {
  let minC = 99, maxC = -99, minR = 99, maxR = -99;
  const at = new Set();
  for (const c of shape.cells) {
    const o = offsetFromAxial(c[0], c[1]);
    at.add(o[0] + ':' + o[1]);
    if (o[0] < minC) minC = o[0];
    if (o[0] > maxC) maxC = o[0];
    if (o[1] < minR) minR = o[1];
    if (o[1] > maxR) maxR = o[1];
  }
  const lines = [];
  for (let r = minR; r <= maxR; r++) {
    let s = (r & 1) ? '  ' : '';
    for (let c = minC; c <= maxC; c++) s += at.has(c + ':' + r) ? ' # ' : '   ';
    lines.push(s.replace(/\s+$/, ''));
  }
  return lines.join('\n');
}

/* Which piece covers which cell, for asciiBoard and for the renderer. */
function fillsOf(level, pieces) {
  const fills = new Int16Array(level.n).fill(-1);
  (pieces || level.solution).forEach((p, n) => { for (const i of p.idx) fills[i] = n; });
  return fills;
}

return {
  TUNE, TIERS, CATALOGUE,
  makeRng,
  key, keyQ, keyR, axialFromOffset, offsetFromAxial, AX_DIRS, neighborsOffset, scanRank,
  enumeratePolyhexes, canon, shapeKey, shapeStats, buildCatalogue,
  rotate60, orientationsOf,
  regionKeys, growBlob, drawPool, sortedBoard, buildPlacements, makeAdjacency, smallestIsland,
  tileBoard, tierOf, makeLevel, levelSig, shippedLevel,
  visibleSlots, legalPlacements,
  botGreedy, botLookahead, botRewind, botConstrained, botPlanner, verifyConstructive,
  asciiBoard, asciiShape, fillsOf,
};
}));
