/* PANE — the gate.

   Three questions, in the order that matters. If question 1 comes back "greedy
   always wins", nothing else is worth asking and nothing gets drawn.

     1. Does a player who never plans still win? (the greedy test)
     2. Does the ORDER of taps matter, or only the set? (permutation test)
     3. How many answers does a board have?

   Run:  node pane/measure.js
*/
const M = require('./model.js');

// deterministic RNG so a rerun means the same boards
function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const med = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const pct = (n, d) => d ? (100 * n / d).toFixed(0) + '%' : 'n/a';

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

function playSet(board, order) {
  let b = M.clone(board);
  for (const i of order) {
    const t = M.tap(b, i);
    if (!t) return false;            // tapped bare glass; this order is invalid
    b = t.board;
    if (M.clear(b)) return true;
  }
  return M.clear(b);
}

function band(lo, hi, count) {
  const rnd = mulberry(1000 + lo);
  const boards = [];
  for (let n = 0; n < count; n++) {
    const lvl = lo + ((n * 7) % Math.max(1, hi - lo + 1));
    const b = M.generate(lvl, rnd);
    if (b) boards.push(b);
  }
  if (!boards.length) return null;

  let greedyWinsAtPar = 0, greedyWinsPlus1 = 0, greedyNever = 0;
  const pars = [], sols = [], nodes = [], dead = [], orderKept = [];
  const perHeuristic = {};
  for (const h of Object.keys(M.HEURISTICS)) perHeuristic[h] = 0;

  for (const b of boards) {
    // a board only counts as demanding if it beats EVERY unplanned strategy
    if (M.anyGreedyWins(b, b.par)) greedyWinsAtPar++;
    if (M.anyGreedyWins(b, b.par + 1)) greedyWinsPlus1++;
    if (!M.anyGreedyWins(b, b.par + 4)) greedyNever++;
    for (const h of Object.keys(M.HEURISTICS)) if (M.greedy(b, b.par + 1, h).won) perHeuristic[h]++;

    // Every distinct par-length answer, not just the first. Generation stops at
    // the first one it finds, so reading its count reported "1 answer per
    // board" on every board regardless of the truth.
    const all = M.solve(b, b.par, true);
    pars.push(b.par); sols.push(all.solutions.length); nodes.push(b.nodes); dead.push(b.deadEnds);

    // does the ORDER matter? take one answer and shuffle it.
    if (all.solutions.length) {
      const one = all.solutions[0];
      if (one.length >= 2 && one.length <= 6) {
        const perms = permutations(one);
        const good = perms.filter(p => playSet(b, p)).length;
        orderKept.push(good / perms.length);
      }
    }
  }

  return {
    n: boards.length, perHeuristic,
    greedyAtPar: greedyWinsAtPar, greedyPlus1: greedyWinsPlus1, greedyNever,
    par: med(pars), sols: med(sols), nodes: med(nodes), dead: med(dead),
    orderFree: orderKept.length ? med(orderKept) : NaN, orderN: orderKept.length,
  };
}

console.log('PANE — is it a puzzle?\n');
console.log('  RUN', M.RUN, ' WET_RUN', M.WET_RUN, ' SWELL', M.SWELL, '\n');

const bands = [[1, 10], [11, 24], [25, 40], [41, 60]];
for (const [lo, hi] of bands) {
  const r = band(lo, hi, 40);
  if (!r) { console.log(`levels ${lo}-${hi}: no boards generated\n`); continue; }
  console.log(`levels ${lo}-${hi}   (${r.n} boards)`);
  console.log(`   SOME unplanned strategy wins inside par: ${r.greedyAtPar} / ${r.n}  ${pct(r.greedyAtPar, r.n)}`);
  console.log(`   ... given one spare tap                : ${r.greedyPlus1} / ${r.n}  ${pct(r.greedyPlus1, r.n)}`);
  console.log(`   ... beaten even with four spare taps   : ${r.greedyNever} / ${r.n}  ${pct(r.greedyNever, r.n)}`);
  console.log(`   each on its own (par+1): ` + Object.entries(r.perHeuristic).map(([h, v]) => `${h} ${pct(v, r.n)}`).join(', '));
  console.log(`   par (median taps to clear)             : ${r.par}`);
  console.log(`   answers per board (median)             : ${r.sols}`);
  console.log(`   share of tap ORDERS that still win     : ${isNaN(r.orderFree) ? 'n/a' : (r.orderFree * 100).toFixed(0) + '%'}  (${r.orderN} boards)`);
  console.log(`   search: nodes ${r.nodes}, dead ends ${r.dead}`);
  console.log('');
}

console.log('READ IT LIKE THIS');
console.log('  greedy wins inside par, high      -> not a puzzle, no thought required');
console.log('  share of tap orders that win, 100 -> order is irrelevant, it is pure covering');
console.log('  answers per board, high           -> too loose to have a right answer');
