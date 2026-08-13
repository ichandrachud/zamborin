/* WIRE — the gate.

   Same question as Socket and Pane, asked before anything is drawn:

     does a player who never plans still win?

   Four unplanned strategies, and a board only counts as demanding if it beats
   every one. Plus the two supporting numbers: how many ways a board can be
   solved, and how often a wrong choice actually costs you the level.

   Run:  node wire/measure.js
*/
const M = require('./model.js');

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const med = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const pct = (n, d) => d ? (100 * n / d).toFixed(0) + '%' : 'n/a';

function band(lo, hi, want) {
  const rnd = mulberry(31 + lo);
  const boards = [];
  for (let n = 0; n < want; n++) {
    const b = M.generate(lo + ((n * 3) % Math.max(1, hi - lo + 1)), rnd);
    if (b) boards.push(b);
  }
  if (!boards.length) return null;

  let demanding = 0;
  const per = {}; for (const h of Object.keys(M.HEURISTICS)) per[h] = 0;
  const sols = [], dead = [], nodes = [], birds = [], spans = [], ruinous = [];

  for (const b of boards) {
    if (!M.anyGreedyWins(b)) demanding++;
    for (const h of Object.keys(M.HEURISTICS)) if (M.greedy(b, h).won) per[h]++;
    sols.push(b.solutions); dead.push(b.deadEnds); nodes.push(b.nodes);
    birds.push(b.queue.length); spans.push(b.spans.length);

    // how punishing is the FIRST choice? of the legal spans for bird one, how
    // many of them lead to a board that can still be finished?
    const ms = M.moves(b, M.fresh(b), 0);
    let safe = 0;
    for (const s of ms) {
      const st = M.place(M.fresh(b), s, b.queue[0]);
      const sub = { ...b, queue: b.queue.slice(1) };
      const r = (function walk(state, k) {
        if (k >= sub.queue.length) return true;
        for (const s2 of M.moves(sub, state, k)) if (walk(M.place(state, s2, sub.queue[k]), k + 1)) return true;
        return false;
      })(st, 0);
      if (r) safe++;
    }
    ruinous.push(ms.length ? 1 - safe / ms.length : 0);
  }

  return {
    n: boards.length, demanding, per,
    sols: med(sols), dead: med(dead), nodes: med(nodes),
    birds: med(birds), spans: med(spans), ruinous: mean(ruinous),
  };
}

console.log('WIRE — is it a puzzle?  (birds keep their distance from strangers)\n');
for (const [lo, hi] of [[1, 10], [11, 24], [25, 40], [41, 60]]) {
  const r = band(lo, hi, 60);
  if (!r) { console.log(`levels ${lo}-${hi}: no boards generated\n`); continue; }
  console.log(`levels ${lo}-${hi}   (${r.n} boards, ${r.birds} birds across ${r.spans} spans)`);
  console.log(`   beats EVERY unplanned strategy : ${r.demanding} / ${r.n}  ${pct(r.demanding, r.n)}`);
  console.log(`   each on its own                : ` + Object.entries(r.per).map(([h, v]) => `${h} ${pct(v, r.n)}`).join(', '));
  console.log(`   share of opening moves that lose the level : ${(r.ruinous * 100).toFixed(0)}%`);
  console.log(`   ways to solve (median)         : ${r.sols}`);
  console.log(`   search: nodes ${r.nodes}, dead ends ${r.dead}`);
  console.log('');
}
console.log('READ IT LIKE THIS');
console.log('  beats every unplanned strategy, low -> not a puzzle, the birds sort themselves');
console.log('  opening moves that lose, 0%         -> nothing you do early can hurt you');
