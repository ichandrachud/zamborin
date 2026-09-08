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
/* A SECOND FAMILY, AND THE REASON THERE HAS TO BE ONE.
   The board above is the only shape this game has ever shipped: a wall across
   the middle, one gap in it, one engine coming down and one coming up. Twelve
   levels were generated from it and twelve levels is the same puzzle twelve
   times — the rocks move, nothing else does.

   This family asks a different question with the same rules. One portal on the
   TOP and one on the LEFT, with the sheds on the bottom and the right, so the
   two routes have to cross in the middle of the yard — and a cell cannot hold
   a four-way, so they cannot. The reason to spend rails becomes SPACE rather
   than TIME: somebody has to go round, and the obstacles decide who can afford
   to.

   It also passes the hardest gate by construction rather than by luck. Greedy
   routes each engine its own shortest way; here those two shortest ways cross,
   the layout will not build, and greedy loses every time. In the corridor
   family that had to be found by searching seeds. */
export function crossing(seed) {
  /* WIDTH FIRST, THEN A HEIGHT GREATER THAN IT. Drawing R and C from two
     overlapping lists let this family emit 8x8 and 9x9 boards, and a square
     board fills neither breakpoint: a portrait ladder has to be taller than it
     is wide so a phone is full, and the landscape ladder is these boards
     turned on their side. The tests caught it; the lists were the bug. */
  const C = [7, 8][h32(seed, 2) % 2];
  const R = C + 1 + (h32(seed, 1) % 2);
  const aC = 2 + (h32(seed, 3) % (C - 4));       // coral in, along the top
  const aD = 2 + (h32(seed, 4) % (C - 4));       // coral's shed, along the bottom
  const bR = 2 + (h32(seed, 5) % (R - 4));       // teal in, down the left
  const bD = 2 + (h32(seed, 6) % (R - 4));       // teal's shed, down the right
  const taken = new Set([`0,${aC}`, `${R - 1},${aD}`, `${bR},0`, `${bD},${C - 1}`]);
  const rocks = [];
  /* Kept deliberately sparse. Obstacles are what make the go-round a choice
     rather than a stroll, but scattering them is the wrong tool for making an
     answer unique — see pin.mjs, which measured that and does it properly. */
  const nR = 5 + (h32(seed, 7) % 5);
  for (let k = 0; k < nR; k++) {
    const r = 1 + (h32(seed, 30 + k * 2) % (R - 2));
    const c = 1 + (h32(seed, 31 + k * 2) % (C - 2));
    if (taken.has(`${r},${c}`)) continue;
    taken.add(`${r},${c}`); rocks.push([r, c]);
  }
  return M.buildLevel({
    n: 800 + seed, tier: 0, R, C, rocks,
    portals: [{ at: [0, aC], face: S, queue: [0] },
              { at: [bR, 0], face: E, queue: [2] }],
    depots: [{ at: [R - 1, aD], face: N, colour: 0 },
             { at: [bD, C - 1], face: W, colour: 2 }],
    budget: 999, par: 0, solution: [],
  });
}

/* THE SCATTER, shared by every family below. A handful of loose obstacles in
   the open yard: not enough to be a maze, enough that the cheap route is not
   always available. Making an answer UNIQUE is not this function's job — see
   pin.mjs, which measured that scattering cannot do it. */
function scatter(seed, R, C, w, taken, n) {
  const rocks = [];
  for (let k = 0; k < n; k++) {
    const r = 1 + (h32(seed, 40 + k * 2) % (R - 2));
    const c = h32(seed, 41 + k * 2) % C;
    if (r === w || taken.has(`${r},${c}`)) continue;
    taken.add(`${r},${c}`); rocks.push([r, c]);
  }
  return rocks;
}

/* TWO GAPS IN THE WALL. The corridor family offers a conflict exactly one fix:
   buy the delay. Cut a second gap and there are two fixes competing — wait for
   the other engine at the near gap, or spend rails walking to the far one —
   and which is cheaper is a property of the board rather than a rule. That
   comparison is a decision the one-gap family cannot pose.

   It is also the cheapest family to certify: a fraction of a second a board,
   because two gaps in a wall still prune the route search hard. */
export function twoGap(seed) {
  const R = [10, 12][h32(seed, 1) % 2];
  const C = [7, 9][h32(seed, 2) % 2];
  const w = Math.floor(R / 2);
  const g1 = 1 + (h32(seed, 3) % 2);
  const g2 = C - 2 - (h32(seed, 4) % 2);
  const pc = 1 + (h32(seed, 5) % (C - 2));
  const pt = 1 + (h32(seed, 6) % (C - 2));
  const sc = 1 + (h32(seed, 7) % (C - 2));
  const st = 1 + (h32(seed, 8) % (C - 2));
  const rocks = [];
  for (let c = 0; c < C; c++) if (c !== g1 && c !== g2) rocks.push([w, c]);
  const taken = new Set([`0,${pc}`, `${R - 1},${pt}`, `${R - 1},${sc}`, `0,${st}`]);
  rocks.push(...scatter(seed, R, C, w, taken, 1 + (h32(seed, 9) % 3)));
  return M.buildLevel({ n: 900 + seed, tier: 0, R, C, rocks,
    portals: [{ at: [0, pc], face: S, queue: [0] }, { at: [R - 1, pt], face: N, queue: [2] }],
    depots: [{ at: [R - 1, sc], face: N, colour: 0 }, { at: [0, st], face: S, colour: 2 }],
    budget: 999, par: 0, solution: [] });
}

/* THE SWAP. Both engines come in off the SAME edge and run the same way, and
   their sheds are on the far side the other way round, so the two routes have
   to change places on the way down.

   They cannot cross — a cell holds no four-way — and they cannot merge either,
   which is the junction law doing something useful for once: same direction
   plus different destinations is precisely the case it forbids, and a merge
   would hand one engine to the wrong shed. So somebody goes round an end, and
   the wall decides what that costs. Greedy draws two straight lines that
   cross, so it loses by construction.

   The dearest family to certify (tens of seconds a board) and the one with the
   steadiest decoy counts, which makes it the right place to end a ladder. */
export function swap(seed) {
  // Width first, then a greater height — see the note in crossing().
  const C = [8, 9][h32(seed, 2) % 2];
  const R = C + 1 + (h32(seed, 1) % 2);
  const w = Math.floor(R / 2);
  const g1 = 1 + (h32(seed, 3) % 2);
  const g2 = C - 2 - (h32(seed, 4) % 2);
  const a = 1 + (h32(seed, 5) % 2);              // coral in, left of the top
  const b = C - 2 - (h32(seed, 6) % 2);          // teal in, right of the top
  const sA = C - 2 - (h32(seed, 7) % 2);         // coral's shed, on the RIGHT
  const sB = 1 + (h32(seed, 8) % 2);             // teal's shed, on the LEFT
  const rocks = [];
  for (let c = 0; c < C; c++) if (c !== g1 && c !== g2) rocks.push([w, c]);
  const taken = new Set([`0,${a}`, `0,${b}`, `${R - 1},${sA}`, `${R - 1},${sB}`]);
  rocks.push(...scatter(seed, R, C, w, taken, 1 + (h32(seed, 9) % 3)));
  return M.buildLevel({ n: 950 + seed, tier: 0, R, C, rocks,
    portals: [{ at: [0, a], face: S, queue: [0] }, { at: [0, b], face: S, queue: [2] }],
    depots: [{ at: [R - 1, sA], face: N, colour: 0 }, { at: [R - 1, sB], face: N, colour: 2 }],
    budget: 999, par: 0, solution: [] });
}

/* THE FOUR FAMILIES, in the order a player should meet them. Each asks a
   different question with the same rules:

     corridor  who goes through first?
     twoGap    wait, or walk to the other gap?
     crossing  who goes round?
     swap      how do they change places?
*/
export const FAMILIES = [
  { key: 'corridor', build: candidate },
  { key: 'twoGap', build: twoGap },
  { key: 'crossing', build: crossing },
  { key: 'swap', build: swap },
];

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

/* LEVEL ONE TEACHES, AND IS THE ONE LEVEL THAT IS NOT CERTIFIED.
   Every other board in the ladder is measured to defeat greedy routing and to
   have exactly one answer at exactly its price. A first level that did the
   same would be a test before a lesson: the player has not yet seen track go
   down, a switch thrown, or two engines meet.

   So level 1 is the parametric teaching board, and the two ways it differs are
   deliberate rather than missed. GREEDY WINS IT — the shortest route for each
   engine works, so the obvious thing a player tries succeeds, and what they
   learn is the vocabulary: draw, throw, dispatch. AND ITS BUDGET HAS SLACK,
   six or seven sleepers of it, so a wasteful first attempt still gets home.
   The board is built so the two engines meet exactly once and one of them
   waits, which is the idea every later level charges rails for.

   Measured at the shape used here, 11 rows by 7: par 23, budget 30, greedy
   wins. The tests assert all of that, so that nobody later "fixes" level 1
   into a puzzle. */
export function tutorialSpec(R, C) {
  const lvl = M.level1(R, C);
  const rocks = [];
  for (let i = 0; i < lvl.size; i++) if (lvl.kind[i] === M.ROCK) rocks.push([Math.floor(i / C), i % C]);
  return {
    n: 1, tier: 0, R, C, rocks,
    portals: lvl.portals.map((p) => ({ at: [p.r, p.c], face: p.face, queue: p.queue.slice() })),
    depots: lvl.depots.map((d) => ({ at: [d.r, d.c], face: d.face, colour: d.colour })),
    budget: lvl.budget, par: lvl.par,
    solution: lvl.solution.map((g) => g.slice()),
    seed: null, family: 'tutorial', decoys: null, greedyCost: null,
  };
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
    seed: entry.seed, family: entry.family, decoys: entry.decoys, greedyCost: entry.greedyCost,
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

export async function harvest(want, seedFrom, label, opts) {
  /* THE FAMILY IS A PARAMETER NOW. One board shape generated twelve times is
     twelve levels of the same puzzle, which is the honest reason the ladder
     went flat — the mechanic was never the problem. */
  const family = (opts && opts.family) || candidate;
  /* Imported at call time, and handed the two functions it needs rather than
     letting it import them back — see the note in pin.mjs about the cycle
     that exits 0 with no error. */
  const { pin } = await import('./pin.mjs');
  const found = [];
  /* A WALL CLOCK, because a family with a poor yield can otherwise run for
     hours: a swap board that fails to certify costs twenty to forty seconds
     to find that out, and the seed range is four thousand wide. Better a
     short ladder that reports the shortfall than a run nobody is watching. */
  const until = Date.now() + ((opts && opts.minutes) || 12) * 60000;
  let seed = seedFrom, tried = 0;
  while (found.length < want && seed < seedFrom + 4000 && Date.now() < until) {
    const lvl = family(seed);
    seed++;
    if (M.validate(lvl).length) continue;
    tried++;
    /* A board with several answers used to be thrown away. Now it is pinned:
       rocks are placed on the cells the rival answers need, one at a time,
       until one answer is left. It roughly doubled the yield of the corridor
       family and it is the only thing that makes the crossing family usable
       at all. */
    const res = pin(lvl, { slack: 2, assess, specOf });
    if (!res.ok) continue;
    found.push({ seed: seed - 1, family: label, rocksAdded: res.rocksAdded, ...res.r });
    console.log('  [' + label + '] seed ' + String(seed - 1).padStart(5) + '  ' +
      res.r.level.R + 'x' + res.r.level.C + '  budget ' + String(res.r.budget).padStart(2) +
      '  decoys ' + String(res.r.decoys).padStart(6) +
      '  pinned with ' + res.rocksAdded + ' rock(s)');
  }
  return { found, tried };
}

/* THE LADDER, ASSEMBLED. Difficulty alone is the wrong order to put thirty
   levels in: a player who meets the same board shape thirty times in a row is
   bored by the tenth however carefully it ramps, which is exactly what the
   first ladder did. So the run goes through all four families, easier half
   first, and then through all four again with the harder half — a NEW QUESTION
   every four levels or so, and a second, sharper go at each of them once all
   four are known.

   Within a family, decoys order the boards. Across families the number does
   not compare: a big corridor board has tens of thousands of ways to be wrong
   and a small crossing board has a few hundred, and that is board size talking
   rather than difficulty. Sorting the whole ladder by decoys would have buried
   three of the four families at the end. */
export function assemble(byFamily, quotas) {
  /* EACH FAMILY IS OVER-HARVESTED AND THEN TRIMMED FROM BOTH ENDS. Taking the
     first eight boards that certified and splitting them down the middle made
     an opening that was not easy — portrait level 1 came out with a thousand
     wrong-but-affordable layouts in it. Harvesting thirteen and keeping the
     four EASIEST for the first pass and the four HARDEST for the second gives
     a gentler start and a steeper climb from the same amount of searching.
     The boards in the middle are thrown away, which is the point. */
  const out1 = [], out2 = [];
  FAMILIES.forEach((f, i) => {
    const pool = (byFamily[f.key] || []).slice().sort((a, b) => a.decoys - b.decoys);
    const q = quotas[i], k1 = Math.ceil(q / 2), k2 = Math.min(q - k1, Math.max(0, pool.length - k1));
    out1.push(...pool.slice(0, k1));
    out2.push(...pool.slice(pool.length - k2));
  });
  return out1.concat(out2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const total = parseInt(process.argv[2], 10) || 30;
  const t0 = Date.now();
  /* TWO LADDERS, FROM TWO SEED RANGES. A phone and a 760x600 frame are not the
     same game with different margins — they get different boards, generated
     and certified separately. The landscape family is built upright and then
     turned on its side, which is an isomorphism and preserves the
     certification; what makes the two ladders DIFFERENT is that they never
     draw from the same seeds. */
  const want = total - 1;                        // level 1 is the tutorial
  const quotas = FAMILIES.map((_, i) => Math.floor(want / FAMILIES.length) +
    (i < want % FAMILIES.length ? 1 : 0));
  const SPARE = 5;                               // harvested and then trimmed
  async function ladderOf(base, tag) {
    const byFamily = {};
    for (let i = 0; i < FAMILIES.length; i++) {
      const f = FAMILIES[i];
      console.log(`\n[${tag}] ${f.key} — keeping ${quotas[i]}, harvesting up to ${quotas[i] + SPARE}`);
      const h = await harvest(quotas[i] + SPARE, base + i * 100000, f.key,
        { family: f.build, minutes: 16 });
      byFamily[f.key] = h.found;
      console.log(`  ${f.key}: ${h.found.length} found from ${h.tried} seeds` +
        (h.found.length < quotas[i] ? '  <-- SHORT' : ''));
    }
    return assemble(byFamily, quotas);
  }
  const port = await ladderOf(1, 'portrait');
  const land = await ladderOf(20000, 'landscape');
  // The teaching board, built upright and turned over for the wide frame like
  // every other landscape level. Odd rows: spec1 needs them, and says why.
  const portrait = [tutorialSpec(11, 7)].concat(port.map((e, i) => toSpec(e, i + 2)));
  const landscape = [transposeSpec(tutorialSpec(11, 7))]
    .concat(land.map((e, i) => transposeSpec(toSpec(e, i + 2))));
  const fs = await import('node:fs');
  fs.writeFileSync(new URL('./levels.js', import.meta.url), emit({ portrait, landscape }));
  console.log('\nportrait ' + portrait.length + ', landscape ' + landscape.length +
    ', in ' + ((Date.now() - t0) / 60000).toFixed(1) + ' min');
  console.log('portrait families :', portrait.map((s) => s.family).join(' '));
  console.log('portrait decoys   :', portrait.map((s) => s.decoys === null ? '-' : s.decoys).join(' '));
}
