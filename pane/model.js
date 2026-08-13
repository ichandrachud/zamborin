/* PANE — the model, headless, so the gate is a number and not a feeling.

   Rain on a window. Drops sit on the glass. Tap one and it swells; swell it far
   enough and it touches a neighbour, and touching drops merge instantly, which
   may put the bigger drop in touch with something further away. Get one heavy
   enough and it breaks loose and RUNS: straight down its column, taking
   everything below it off the glass and leaving a wet track. Drops beside that
   track need less weight to break loose than drops on dry glass, so a run can
   set off the drop next to it, which sets off the one next to that.

   THE QUESTION THIS FILE EXISTS TO ANSWER. Merge games are usually not games.
   If every move reduces a count and no move ever undoes progress, then any
   sensible order wins and there is nothing to think about — that is what sank
   Filament on paper and what the greedy test caught in Socket twice. Pane is
   only different if the RUN makes it different: a run removes along a path, so
   clearing the glass is a covering problem, and covering problems are the ones
   where taking the biggest bite each turn provably falls short.

   So the gate is not "does it work", it is:
     1. does greedy — always take the tap that clears the most — actually fail?
     2. does the order of taps matter, or only the set?
     3. is there one answer per board, or dozens?

   Nothing here draws anything. If the numbers say no, nothing gets drawn.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PANE_MODEL = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

// ---- constants ----
// Guesses, and the first set of them measured badly: at RUN 10 / WET_RUN 5 a
// drop born at mass 1-4 could never be carried along by a wet track, so the
// sideways cascade fired in 0% of easy solutions. The whole reason to build
// this game is that cascade, so these are swept rather than chosen. See
// pane/sweep.js.
const CFG = {
  RUN: 10,        // mass at which a drop breaks loose on dry glass
  WET_RUN: 5,     // ... and on glass another drop has already wet
  SWELL: 1,       // what one tap adds
  R1: 6, R2: 12,  // masses at which reach steps up to 2 and to 3
  WANDER: true,   // does a run seek out drops, or fall straight down its column?
  SWATHE: 0,      // how wide the running drop sweeps, in cells either side
};
function configure(o) { Object.assign(CFG, o); return CFG; }

// Mass is roughly area, so reach goes as its square root. Capped, because a
// drop whose reach crosses the whole pane merges the board in one tap and
// there is no puzzle left.
function reach(m) { return m >= CFG.R2 ? 3 : (m >= CFG.R1 ? 2 : 1); }

// ---- boards ----
// A board is { W, H, mass } with mass a flat array, 0 meaning bare glass.
const idx = (b, c, r) => r * b.W + c;
const clone = (b) => ({ W: b.W, H: b.H, mass: b.mass.slice() });
const drops = (b) => { const o = []; for (let i = 0; i < b.mass.length; i++) if (b.mass[i] > 0) o.push(i); return o; };
const totalMass = (b) => b.mass.reduce((a, m) => a + m, 0);
const clear = (b) => !b.mass.some(m => m > 0);
const key = (b) => b.mass.join(',');

// ---- the three rules ----

// Touching drops merge. Grow the drop at i by swallowing everything inside its
// reach, then re-check, because the bigger drop reaches further. This is the
// first of the two cascades.
function merge(b, i) {
  let changed = true, swallowed = 0;
  while (changed) {
    changed = false;
    const rad = reach(b.mass[i]);
    const c = i % b.W, r = (i / b.W) | 0;
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (!dr && !dc) continue;
        const cc = c + dc, rr = r + dr;
        if (cc < 0 || cc >= b.W || rr < 0 || rr >= b.H) continue;
        const j = rr * b.W + cc;
        if (b.mass[j] > 0) { b.mass[i] += b.mass[j]; b.mass[j] = 0; changed = true; swallowed++; }
      }
    }
  }
  return swallowed;
}

// A run WANDERS. The first version sent it straight down its own column, and
// measured, that made the two cascades fight over the same drops: a tap merges
// before it runs, so the drop swallowed 4.19 neighbours on the way to being
// heavy enough, leaving 0.80 standing beside the track and setting off 0.26.
// The merge ate its own cascade.
//
// Letting the run wander separates them. The merge stays local, a couple of
// cells; the run reaches the whole height of the pane and is pulled sideways
// toward whatever is below it, so it collects drops the merge never touched.
// It is also what rain actually does, and it gives the player something to
// read: the path is fixed by where the drops are, so you can see where a run
// will go before you set it off.
function run(b, start) {
  const stack = [start], done = new Set(), track = new Set();
  let runs = 0;
  while (stack.length) {
    const i = stack.pop();
    if (done.has(i) || b.mass[i] <= 0) continue;
    done.add(i); runs++;

    const path = [];
    let c = i % b.W, r = (i / b.W) | 0;
    b.mass[i] = 0; path.push(i); track.add(i);
    while (r < b.H - 1) {
      if (!CFG.WANDER) { r++; const j = r * b.W + c; b.mass[j] = 0; path.push(j); track.add(j); continue; }
      // pulled toward the heaviest drop on the row below. Ties go straight on,
      // then left, which the stable sort gives us from the order below.
      const opts = [];
      for (const dc of [0, -1, 1]) {
        const cc = c + dc;
        if (cc >= 0 && cc < b.W) opts.push({ cc, m: b.mass[(r + 1) * b.W + cc] });
      }
      opts.sort((a, z) => z.m - a.m);
      c = opts[0].cc; r++;
      const j = r * b.W + c;
      b.mass[j] = 0; path.push(j); track.add(j);
    }

    // A running drop is wide, not a hairline. Everything within SWATHE cells
    // either side of the path goes with it. This is the lever on the gate that
    // failed: at SWATHE 0 the merge removed 4.18 drops per run and the path
    // only 1.5, so the window was being cleared by drops eating each other
    // rather than by anything running down the glass.
    if (CFG.SWATHE > 0) {
      for (const j of path) {
        const jc = j % b.W, jr = (j / b.W) | 0;
        for (let d = 1; d <= CFG.SWATHE; d++) {
          for (const dc of [-d, d]) {
            const cc = jc + dc;
            if (cc < 0 || cc >= b.W) continue;
            const k = jr * b.W + cc;
            b.mass[k] = 0; track.add(k);
          }
        }
      }
    }

    // drops alongside the track break loose at the lower threshold
    for (const j of path) {
      const jc = j % b.W, jr = (j / b.W) | 0;
      for (const dc of [-1, 1]) {
        const cc = jc + dc;
        if (cc < 0 || cc >= b.W) continue;
        const k = jr * b.W + cc;
        if (b.mass[k] >= CFG.WET_RUN && !done.has(k)) stack.push(k);
      }
    }
  }
  return { runs, track };
}

// One tap. Returns a NEW board, or null if the tap was not on a drop.
function tap(board, i) {
  if (!(board.mass[i] > 0)) return null;
  const b = clone(board);
  b.mass[i] += CFG.SWELL;
  const swallowed = merge(b, i);
  let ran = 0, track = null;
  if (b.mass[i] >= CFG.RUN) { const r = run(b, i); ran = r.runs; track = r.track; }
  return { board: b, swallowed, ran, track };
}

// ---- solving ----
// Iterative deepening, because par is small and the branching factor is the
// number of drops. A transposition set per depth keeps it honest: many
// different tap orders land on the same glass.
function solve(board, maxDepth = 7, wantAll = false) {
  let nodes = 0, deadEnds = 0;
  for (let depth = 1; depth <= maxDepth; depth++) {
    const seen = new Set();
    const found = [];
    const walk = (b, path) => {
      if (clear(b)) { found.push(path.slice()); return !wantAll; }
      if (path.length === depth) { deadEnds++; return false; }
      const k = key(b) + '@' + (depth - path.length);
      if (seen.has(k)) return false;
      seen.add(k);
      for (const i of drops(b)) {
        nodes++;
        const t = tap(b, i);
        if (!t) continue;
        path.push(i);
        const stop = walk(t.board, path);
        path.pop();
        if (stop) return true;
      }
      return false;
    };
    walk(board, []);
    if (found.length) return { par: depth, solutions: found, nodes, deadEnds };
  }
  return { par: null, solutions: [], nodes, deadEnds };
}

// ---- the greedy test ----
// The whole question in one function: does a player who never plans still win?
//
// The first version of this scored taps by the mass they cleared, and reported
// that greedy lost on every single board — which was the test failing, not the
// design succeeding. Merging CONSERVES mass, it only consolidates it, so all
// but the handful of taps that trigger a run score exactly zero and the
// "greedy" player was really tapping at random. A player is only greedy if the
// heuristic can tell the moves apart, so there are four here and a board only
// counts as demanding if it defeats all of them.
const HEURISTICS = {
  // clear glass if you can, otherwise build the heaviest drop you can
  clear:   (b, t, i) => (totalMass(b) - totalMass(t.board)) * 1e6 + t.board.mass[i],
  // tap whatever is closest to breaking loose
  biggest: (b, t, i) => b.mass[i],
  // tap whatever swallows the most neighbours
  merges:  (b, t) => t.swallowed,
  // work top-down, since a run only takes what is below it
  highest: (b, t, i) => -((i / b.W) | 0),
};

function greedy(board, budget, how = 'clear') {
  const score = HEURISTICS[how];
  let b = clone(board), taps = 0;
  while (!clear(b) && taps < budget) {
    let best = null, bestScore = -Infinity;
    for (const i of drops(b)) {
      const t = tap(b, i);
      if (!t) continue;
      const s = score(b, t, i);
      if (s > bestScore) { bestScore = s; best = t.board; }
    }
    if (!best) break;
    b = best; taps++;
  }
  return { won: clear(b), taps, left: totalMass(b) };
}

// Beaten by none of them, or beaten by at least one?
function anyGreedyWins(board, budget) {
  for (const how of Object.keys(HEURISTICS)) if (greedy(board, budget, how).won) return how;
  return null;
}

// ---- generation ----
// Scatter drops, then ask the solver whether it is a board at all. Rejecting on
// par keeps the search honest: a board solvable in one tap is a picture, not a
// puzzle.
function generate(level, rnd = Math.random, opts = {}) {
  const W = opts.W || Math.min(7, 5 + Math.floor((level - 1) / 12));
  const H = opts.H || Math.min(9, 6 + Math.floor((level - 1) / 10));
  const wantPar = Math.max(2, Math.min(6, 2 + Math.floor((level - 1) / 6)));
  // Drops at rest never touch, so the most that fit is the checkerboard count.
  // Asking for more than that rejects every attempt and generates nothing,
  // which is exactly what levels past 40 were doing.
  const roomFor = Math.ceil(W / 2) * Math.ceil(H / 2);
  const nDrops = Math.min(roomFor - 1, 8 + Math.floor(level / 3) + ((rnd() * 3) | 0));

  for (let attempt = 0; attempt < 400; attempt++) {
    const b = { W, H, mass: new Array(W * H).fill(0) };
    // Drops are never adjacent at rest: touching drops would already have
    // merged. That spacing is what forces a tap to swell before it can chain.
    const cells = [];
    for (let i = 0; i < W * H; i++) cells.push(i);
    for (let i = cells.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [cells[i], cells[j]] = [cells[j], cells[i]]; }
    let placed = 0;
    for (const i of cells) {
      if (placed >= nDrops) break;
      const c = i % W, r = (i / W) | 0;
      let touching = false;
      for (let dr = -1; dr <= 1 && !touching; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const cc = c + dc, rr = r + dr;
          if (cc < 0 || cc >= W || rr < 0 || rr >= H) continue;
          if (b.mass[rr * W + cc] > 0) { touching = true; break; }
        }
      if (touching) continue;
      b.mass[i] = 1 + ((rnd() * 4) | 0);
      placed++;
    }
    if (placed < Math.max(6, nDrops - 3)) continue;

    const s = solve(b, wantPar + 1);
    if (s.par == null || s.par < 2) continue;
    if (s.par > wantPar + 1) continue;
    return { ...b, level, par: s.par, solutions: s.solutions.length, nodes: s.nodes, deadEnds: s.deadEnds };
  }
  return null;
}

return { CFG, configure, reach, idx, clone, drops, totalMass, clear, key,
         merge, run, tap, solve, greedy, anyGreedyWins, HEURISTICS, generate };
}));
