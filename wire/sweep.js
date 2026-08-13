/* WIRE — sweep the three dials that control conflict.
   Birds per span, how much wire a stranger costs, and how many kinds there are.
   Run:  node wire/sweep.js
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
function trial(cfg) {
  M.configure(cfg);
  const rnd = mulberry(77);
  let made = 0, demanding = 0, bestOnly = 0;
  for (const lvl of [20, 30, 40, 50]) {
    for (let n = 0; n < 12; n++) {
      const b = M.generate(lvl, rnd);
      if (!b) continue;
      made++;
      if (!M.anyGreedyWins(b)) demanding++;
      if (M.greedy(b, 'best').won) bestOnly++;
    }
  }
  return { made, puzzle: made ? demanding / made : 0, best: made ? bestOnly / made : 0 };
}
console.log('WIRE — sweeping conflict\n');
console.log('  spans birds  gap kinds | made | beats all  best-fit alone');
console.log('  ' + '-'.repeat(58));
const rows = [];
for (const SPANS of [2, 3, 4])
  for (const GAP of [1, 2, 3])
    for (const SPECIES of [3, 5]) {
      const r = trial({ SPANS, BIRDS: 12, GAP, SPECIES });
      rows.push({ SPANS, GAP, SPECIES, r });
      const flag = r.puzzle >= 0.7 ? '  <=' : '';
      console.log(`  ${String(SPANS).padStart(5)}${String(12).padStart(6)}${String(GAP).padStart(5)}${String(SPECIES).padStart(6)} |`
        + `${String(r.made).padStart(5)} |${(r.puzzle * 100).toFixed(0).padStart(10)}%${(r.best * 100).toFixed(0).padStart(15)}%${flag}`);
    }
const best = rows.filter(x => x.r.made >= 20).sort((a, z) => z.r.puzzle - a.r.puzzle)[0];
console.log(`\n  best setting: ${best.SPANS} spans, gap ${best.GAP}, ${best.SPECIES} kinds -> ${(best.r.puzzle * 100).toFixed(0)}% beat every unplanned strategy`);
