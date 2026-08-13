/* PANE — straight run against wandering run.

   "Did a run set off another run" turned out to be the wrong question. A
   wandering run seeks out drops and CLEARS them, so it scores zero on chaining
   while taking more glass than a straight run that chained twice. What the
   pitch actually promises is that one tap takes a lot of the window, and that
   is what this measures.

   Both gates, both run styles, same boards, same constants.

   Run:  node pane/compare.js
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

const BASE = { RUN: 10, WET_RUN: 5, SWELL: 1, R1: 6, R2: 12 };

function trial(wander, swathe) {
  M.configure({ ...BASE, WANDER: wander, SWATHE: swathe });
  const rnd = mulberry(2024);
  let made = 0, demanding = 0;
  const pars = [], bite = [], pathLen = [], tapsThatTake = [], sols = [];

  for (const lvl of [3, 9, 15, 21, 27, 33]) {
    for (let n = 0; n < 9; n++) {
      const b = M.generate(lvl, rnd);
      if (!b) continue;
      made++; pars.push(b.par);
      if (!M.anyGreedyWins(b, b.par + 1)) demanding++;

      const all = M.solve(b, b.par, true);
      sols.push(all.solutions.length);
      const sol = all.solutions[0];
      if (!sol) continue;

      // Denominator is the WHOLE window, not what happens to be left. Measured
      // against the remainder, the last tap always scores 100% and the metric
      // says nothing.
      const startDrops = M.drops(b).length;
      let cur = M.clone(b), best = 0, took = 0;
      for (const i of sol) {
        const beforeN = M.drops(cur).length;
        const t = M.tap(cur, i);
        if (!t) break;
        const goneToRun = t.ran ? beforeN - M.drops(t.board).length - t.swallowed : 0;
        const share = Math.max(0, goneToRun) / startDrops;
        if (share > 0.01) took++;
        if (share > best) best = share;
        if (t.track) pathLen.push(t.track.size);
        cur = t.board;
      }
      bite.push(best);
      tapsThatTake.push(took / sol.length);
    }
  }
  return {
    made, puzzle: made ? demanding / made : 0, par: med(pars), sols: med(sols),
    bite: med(bite), pathLen: mean(pathLen), takes: mean(tapsThatTake),
  };
}

console.log('PANE — how wide should a run sweep?\n');
console.log('  swathe | boards  par  answers | PUZZLE  biggest tap  clearing taps  cells swept');
console.log('  ' + '-'.repeat(76));
const runs = [];
for (const sw of [0, 1, 2]) {
  const r = trial(true, sw);
  runs.push({ sw, r });
  const pass = (r.puzzle >= 0.7 && r.bite >= 0.4) ? '  <=' : '';
  console.log(`  ${String(sw).padStart(6)} |${String(r.made).padStart(7)}${String(r.par).padStart(5)}${String(r.sols).padStart(9)} |`
    + `${(r.puzzle * 100).toFixed(0).padStart(6)}%${(r.bite * 100).toFixed(0).padStart(12)}%`
    + `${(r.takes * 100).toFixed(0).padStart(14)}%${r.pathLen.toFixed(1).padStart(12)}${pass}`);
}
console.log('\nGATES   puzzle want >70%, spectacle (biggest tap) want >40%');
const win = runs.filter(x => x.r.puzzle >= 0.7 && x.r.bite >= 0.4);
console.log(win.length ? `  clears both: swathe ${win.map(x => x.sw).join(', ')}` : '  nothing clears both.');
