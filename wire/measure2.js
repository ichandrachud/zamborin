/* WIRE — the gate, second model.

   Same first question as always: does a player who never plans still win?
   Six unplanned strategies this time, three of which know about the feuds.

   Two extra questions belong to this design specifically:

     is POSITION actually used?      how often does a solution slot a bird
                                     BETWEEN two others rather than on an end
     is the feud rule biting?        how many landings are refused for peace
                                     rather than for room

   If position is never used the feuds are just a fancier capacity rule and the
   first model's verdict stands.

   Run:  node wire/measure2.js
*/
const M = require('./model2.js');

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

function stillSolvable(b, state, k) {
  return (function walk(st, i) {
    if (i >= b.queue.length) return true;
    for (const m of M.moves(b, st, i)) if (walk(M.insert(st, m.s, m.p, b.queue[i]), i + 1)) return true;
    return false;
  })(state, k);
}

function band(lo, hi, want) {
  const rnd = mulberry(53 + lo);
  const boards = [];
  for (let n = 0; n < want; n++) {
    const b = M.generate(lo + ((n * 3) % Math.max(1, hi - lo + 1)), rnd);
    if (b) boards.push(b);
  }
  if (!boards.length) return null;

  let demanding = 0;
  const per = {}; for (const h of Object.keys(M.HEURISTICS)) per[h] = 0;
  const sols = [], dead = [], nodes = [], ruinous = [], interior = [], peaceBlocked = [], birds = [], spans = [];

  for (const b of boards) {
    if (!M.anyGreedyWins(b)) demanding++;
    for (const h of Object.keys(M.HEURISTICS)) if (M.greedy(b, h).won) per[h]++;
    sols.push(b.solutions); dead.push(b.deadEnds); nodes.push(b.nodes);
    birds.push(b.queue.length); spans.push(b.spans.length);

    // how punishing is the opening? of the legal landings for bird one, how
    // many leave a board that can still be finished
    const ms = M.moves(b, M.fresh(b), 0);
    let safe = 0;
    for (const m of ms) if (stillSolvable(b, M.insert(M.fresh(b), m.s, m.p, b.queue[0]), 1)) safe++;
    ruinous.push(ms.length ? 1 - safe / ms.length : 0);

    // does a real solution ever squeeze a bird between two others?
    const sol = M.solve(b).solutions[0];
    if (sol) {
      let st = M.fresh(b), between = 0;
      for (let k = 0; k < sol.length; k++) {
        const { s, p } = sol[k];
        if (p > 0 && p < st[s].length) between++;
        st = M.insert(st, s, p, b.queue[k]);
      }
      interior.push(between / sol.length);
    }

    // of the landings that are refused, how many are refused for peace and not
    // for room
    let refusedPeace = 0, refusedAny = 0;
    let st = M.fresh(b);
    for (let k = 0; k < Math.min(4, b.queue.length); k++) {
      const bird = b.queue[k];
      for (let s = 0; s < b.spans.length; s++) {
        for (let p = 0; p <= st[s].length; p++) {
          const roomy = M.cost(st[s].slice(0, p).concat([bird], st[s].slice(p))) <= b.spans[s];
          const legal = M.canInsert(b, st[s], p, bird, b.spans[s]);
          if (!legal) { refusedAny++; if (roomy) refusedPeace++; }
        }
      }
      const m = M.moves(b, st, k)[0];
      if (!m) break;
      st = M.insert(st, m.s, m.p, bird);
    }
    peaceBlocked.push(refusedAny ? refusedPeace / refusedAny : 0);
  }

  return {
    n: boards.length, demanding, per,
    sols: med(sols), dead: med(dead), nodes: med(nodes),
    birds: med(birds), spans: med(spans),
    ruinous: mean(ruinous), interior: mean(interior), peace: mean(peaceBlocked),
  };
}

console.log('WIRE — second model: some birds will not sit together\n');
console.log(`  ${M.CFG.SPECIES} kinds, ${M.CFG.FEUDS} feuds, personal-space gap ${M.CFG.GAP}\n`);
for (const [lo, hi] of [[1, 10], [11, 24], [25, 40], [41, 60]]) {
  const r = band(lo, hi, 50);
  if (!r) { console.log(`levels ${lo}-${hi}: no boards generated\n`); continue; }
  console.log(`levels ${lo}-${hi}   (${r.n} boards, ${r.birds} birds across ${r.spans} spans)`);
  console.log(`   beats EVERY unplanned strategy  : ${r.demanding} / ${r.n}  ${pct(r.demanding, r.n)}`);
  console.log(`   each on its own                 : ` + Object.entries(r.per).map(([h, v]) => `${h} ${pct(v, r.n)}`).join(', '));
  console.log(`   opening moves that lose the level: ${(r.ruinous * 100).toFixed(0)}%`);
  console.log(`   landings squeezed BETWEEN birds  : ${(r.interior * 100).toFixed(0)}%`);
  console.log(`   refusals that are about peace    : ${(r.peace * 100).toFixed(0)}%`);
  console.log(`   ways to solve ${r.sols}, nodes ${r.nodes}, dead ends ${r.dead}`);
  console.log('');
}
console.log('READ IT LIKE THIS');
console.log('  beats every strategy, low   -> still not a puzzle');
console.log('  squeezed between, near 0    -> position is unused, feuds are just capacity');
console.log('  opening moves that lose, 0% -> nothing early can hurt you');
