/* ============================================================
   Junction · the level generator
   ============================================================

   Run it:  node junction/generate.mjs [count]

   Every level it emits has been MEASURED against the three rules this game
   turned out to need, none of which can be judged by looking at a board:

     GREEDY MUST LOSE. Route each engine its own shortest way, ignoring the
       other, and try every switch setting. If that wins, the level never made
       anybody think about two trains at once. Every hand-authored level in the
       game fails here.

     THE BUDGET IS THE MEASURED MINIMUM. Not the cost of the solution its
       author happened to write down — the ordering board shipped five rails
       too many that way. It is found by walking the budget UP from cheap until
       something first wins, which is also what makes this affordable: a tight
       budget prunes the route search hard, so the run that finds the answer is
       the fast one.

     EXACTLY ONE SET OF RAILS. Counted at that minimum, over every route
       combination and every switch setting. Rails, not switch settings: a
       junction keeps whichever branch was laid first, so the same physical
       setting is labelled differently depending on build order, and only the
       track is a real answer.

   The board family is fixed and the deadlock is built in: an EVEN rank count
   puts the wall dead centre, so the two engines are the same distance from the
   single gap, arrive together and lock. Winning means spending rails on a
   route that doubles back for no reason but to arrive late. What varies is the
   shape, where the sheds sit, and where the obstacles are — and the obstacles
   are what drive the answer count down to one.
*/
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('./model.js');
const { certify } = await import('./unique.mjs');
const { gate } = await import('./gate.mjs');
const { N, E, S, W } = M;

const h32 = (a, b) => {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0; x = Math.imul(x, 1274126177) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
};
const pick = (seed, k, arr) => arr[h32(seed, k) % arr.length];

/* TURNING A BOARD ON ITS SIDE. Rows become columns and the four sides rotate
   with them — north is left once the board is laid down, south is right. It is
   an isomorphism, so a level's certification survives it exactly: the same
   routes, the same budget, the same single answer.

   This is NOT how the two ladders are made different. Each ladder is generated
   from its own range of seeds, so the desktop boards are different puzzles
   rather than the phone's turned sideways — the orientation only decides which
   way a family of boards is BUILT. */
const TURN = { 0: 3, 1: 2, 2: 1, 3: 0 };            // N->W, E->S, S->E, W->N
export function transposeSpec(sp) {
  return {
    ...sp, R: sp.C, C: sp.R,
    rocks: sp.rocks.map(([r, c]) => [c, r]),
    portals: sp.portals.map((p) => ({ ...p, at: [p.at[1], p.at[0]], face: TURN[p.face] })),
    depots: sp.depots.map((d) => ({ ...d, at: [d.at[1], d.at[0]], face: TURN[d.face] })),
    solution: (sp.solution || []).map((g) => [g[1], g[0], TURN[g[2]], TURN[g[3]]]),
  };
}
export function specOf(lvl) {
  const rocks = [];
  for (let i = 0; i < lvl.size; i++) if (lvl.kind[i] === M.ROCK) rocks.push([Math.floor(i / lvl.C), i % lvl.C]);
  return { n: lvl.n, tier: lvl.tier, R: lvl.R, C: lvl.C, rocks,
    portals: lvl.portals.map((p) => ({ at: [p.r, p.c], face: p.face, queue: p.queue.slice() })),
    depots: lvl.depots.map((d) => ({ at: [d.r, d.c], face: d.face, colour: d.colour })),
    budget: lvl.budget, par: lvl.par, solution: (lvl.solution || []).map((g) => g.slice()) };
}
export function candidate(seed) {
  const R = pick(seed, 1, [10, 12, 14]);
  const C = pick(seed, 2, [7, 9]);
  const w = Math.floor(R / 2);
  const g = 2 + (h32(seed, 3) % (C - 4));            // the one gap
  const shed = C - 2;
  const tealCol = 1 + (h32(seed, 4) % Math.max(1, g - 1));
  const rocks = [];
  for (let c = 0; c < C; c++) if (c !== g) rocks.push([w, c]);
  const nRocks = 1 + (h32(seed, 5) % 4);
  const taken = new Set([`0,${g}`, `${R - 1},${tealCol}`, `0,${shed}`, `${R - 1},${shed}`]);
  for (let k = 0; k < nRocks; k++) {
    const r = 1 + (h32(seed, 10 + k * 2) % (R - 2));
    const c = h32(seed, 11 + k * 2) % C;
    if (r === w || taken.has(`${r},${c}`)) continue;
    taken.add(`${r},${c}`); rocks.push([r, c]);
  }
  return M.buildLevel({
    n: 100 + seed, tier: 0, R, C, rocks,
    portals: [{ at: [0, g], face: S, queue: [0] },
              { at: [R - 1, tealCol], face: N, queue: [2] }],
    depots: [{ at: [0, shed], face: S, colour: 2 },
             { at: [R - 1, shed], face: N, colour: 0 }],
    budget: 999, par: 0, solution: [],
  });
}
const rebudget = (lvl, budget) => M.buildLevel({
  n: lvl.n, tier: lvl.tier, R: lvl.R, C: lvl.C,
  rocks: (() => { const out = [];
    for (let i = 0; i < lvl.size; i++) if (lvl.kind[i] === M.ROCK) out.push([Math.floor(i / lvl.C), i % lvl.C]);
    return out; })(),
  portals: lvl.portals.map((p) => ({ at: [p.r, p.c], face: p.face, queue: p.queue })),
  depots: lvl.depots.map((d) => ({ at: [d.r, d.c], face: d.face, colour: d.colour })),
  budget, par: budget, solution: lvl.solution,
});

/* Walk the budget up until something first wins. The first hit is the true
   minimum by construction, and every run before it is cheap because the budget
   filter throws most route pairs away before they are ever simulated. */
export function assess(lvl, opts) {
  const slack = (opts && opts.slack) || 2;
  /* START THE WALK NEAR THE ANSWER. Beginning at a flat 12 meant every big
     board paid for a dozen useless certifications first, and a certification
     at a budget far above the minimum is the expensive kind — the budget
     filter is what makes this fast, so a loose budget removes the speed.
     The floor is the sum of the straight-line distances less what sharing
     could plausibly save; nothing can win below that. */
  const straight = lvl.portals.reduce((sum, p) => {
    const home = lvl.depots.find((d) => d.colour === p.queue[0]);
    const a = M.neighbour(lvl, p.i, p.face), b = M.neighbour(lvl, home.i, home.face);
    if (a < 0 || b < 0) return sum;
    const [ar, ac] = [Math.floor(a / lvl.C), a % lvl.C];
    const [br, bc] = [Math.floor(b / lvl.C), b % lvl.C];
    return sum + Math.abs(ar - br) + Math.abs(ac - bc) + 2;
  }, 0);
  const lo = (opts && opts.from) || Math.max(6, straight - 6);
  const hi = (opts && opts.to) || straight + 8;
  const deadline = Date.now() + ((opts && opts.msBudget) || 20000);
  for (let b = lo; b <= hi; b++) {
    if (Date.now() > deadline) return null;      // a slow candidate is not worth waiting for
    const at = rebudget(lvl, b);
    let r; try { r = certify(at, slack); } catch (e) { return null; }
    if (!r.distinctWinningLayouts) continue;
    const level = rebudget(lvl, r.trueMinimumCost);
    const g = gate(level, 'candidate');
    return {
      level, budget: r.trueMinimumCost,
      railLayouts: r.railLayoutsAtTrueMinimum,
      decoys: r.combinationsWithinBudget - r.distinctWinningLayouts,
      greedyWins: !!g.greedy.wins, greedyCost: g.greedy.cost,
      solution: r.cheapestSolution,
    };
  }
  return null;
}

/* A generated level as a SPEC, ready to be written into levels.js. The
   solution is carried because the game uses it for the debug lay-out and the
   tests use it to prove the level is completable without a solver. */
export function toSpec(entry, n) {
  const lvl = entry.level, rocks = [];
  for (let i = 0; i < lvl.size; i++) if (lvl.kind[i] === M.ROCK) rocks.push([Math.floor(i / lvl.C), i % lvl.C]);
  return {
    n, tier: Math.min(9, Math.floor((n - 1) / 8)), R: lvl.R, C: lvl.C, rocks,
    portals: lvl.portals.map((p) => ({ at: [p.r, p.c], face: p.face, queue: p.queue.slice() })),
    depots: lvl.depots.map((d) => ({ at: [d.r, d.c], face: d.face, colour: d.colour })),
    budget: entry.budget, par: entry.budget,
    solution: entry.solution.map((g) => g.slice()),
    seed: entry.seed, decoys: entry.decoys, greedyCost: entry.greedyCost,
  };
}
export function emit(ladders) {
  const one = (arr) => arr.map((sp) => '    ' + JSON.stringify(sp)).join(',\n');
  return `/* ============================================================
   Junction · the generated levels
   ============================================================

   WRITTEN BY generate.mjs. Do not hand-edit: every number here was measured,
   and editing one by eye breaks the guarantee the file exists to carry.

   Each level passed three checks before it was allowed in. Greedy routing —
   each engine its own shortest way, ignoring the other — does not win it. The
   budget is the cheapest cost anything wins at, found by search rather than
   counted off an author's own answer. And exactly ONE set of rails achieves
   that cost, over every route combination and every switch setting.

   \`decoys\` is how many layouts fit inside the budget and lose. It is the
   closest thing to a difficulty number this game has: the more ways there are
   to spend the rails and be wrong, the harder the board.

   TWO LADDERS, because a phone and a 760x600 frame are not the same game with
   different margins. They are generated from different seeds, so these are
   different puzzles and not one set of boards turned sideways.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JUNCTION_LEVELS = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';
return {
  portrait: [
${one(ladders.portrait)}
  ],
  landscape: [
${one(ladders.landscape)}
  ],
};
}));
`;
}

export function harvest(want, seedFrom, label) {
  const found = [];
  let seed = seedFrom, tried = 0;
  while (found.length < want && seed < seedFrom + 4000) {
    const lvl = candidate(seed);
    seed++;
    if (M.validate(lvl).length) continue;
    tried++;
    const a = assess(lvl);
    if (!a || a.greedyWins || a.railLayouts !== 1) continue;
    found.push({ seed: seed - 1, ...a });
    console.log('  [' + label + '] seed ' + String(seed - 1).padStart(5) + '  ' +
      a.level.R + 'x' + a.level.C + '  budget ' + String(a.budget).padStart(2) +
      '  decoys ' + a.decoys);
  }
  return { found, tried };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const want = parseInt(process.argv[2], 10) || 6;
  const t0 = Date.now();
  /* TWO LADDERS, FROM TWO SEED RANGES. A phone and a 760x600 frame are not the
     same game with different margins — they get different boards, generated
     and certified separately. The landscape family is built upright and then
     turned on its side, which is an isomorphism and preserves the
     certification; what makes the two ladders DIFFERENT is that they never
     draw from the same seeds. */
  const port = harvest(want, 1, 'portrait');
  const land = harvest(want, 20000, 'landscape');
  const portrait = port.found.sort((x, y) => x.decoys - y.decoys).map((e, i) => toSpec(e, i + 1));
  const landscape = land.found.sort((x, y) => x.decoys - y.decoys)
    .map((e, i) => transposeSpec(toSpec(e, i + 1)));
  const fs = await import('node:fs');
  fs.writeFileSync(new URL('./levels.js', import.meta.url), emit({ portrait, landscape }));
  console.log('\nportrait ' + portrait.length + ' levels, landscape ' + landscape.length +
    ' levels, in ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
  console.log('portrait shapes :', portrait.map((s) => s.C + 'x' + s.R).join(' '));
  console.log('landscape shapes:', landscape.map((s) => s.C + 'x' + s.R).join(' '));
}
