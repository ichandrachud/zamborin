/* PANE — find constants that pass all three gates at once.

   The first guess passed the puzzle gate and failed the spectacle gate: boards
   demanded real planning, and the sideways cascade fired in 0% of easy
   solutions. A correct puzzle nobody wants to watch is not why this game got
   picked over Wire.

   Three gates, and a setting has to clear all three:

     PUZZLE     no unplanned strategy wins        want high
     CASCADE    solutions where a run set off      want high
                another run
     FEEDBACK   taps that do nothing visible       want zero
                (no merge, no run, just a swell)

   Run:  node pane/sweep.js
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

function trial(cfg, levels, perLevel) {
  M.configure(cfg);
  const rnd = mulberry(99);
  let made = 0, tried = 0, demanding = 0;
  const chained = [], dead = [], bite = [], pars = [];

  for (const lvl of levels) {
    for (let n = 0; n < perLevel; n++) {
      tried++;
      const b = M.generate(lvl, rnd);
      if (!b) continue;
      made++;
      pars.push(b.par);
      if (!M.anyGreedyWins(b, b.par + 1)) demanding++;

      const sol = M.solve(b, b.par).solutions[0];
      if (!sol) continue;
      let cur = M.clone(b), sawChain = 0, deadTaps = 0, best = 0;
      for (const i of sol) {
        const before = M.totalMass(cur);
        const t = M.tap(cur, i);
        if (!t) break;
        const took = before ? (before - M.totalMass(t.board)) / before : 0;
        if (t.ran >= 2) sawChain = 1;
        if (!t.swallowed && !t.ran) deadTaps++;
        if (took > best) best = took;
        cur = t.board;
      }
      chained.push(sawChain); dead.push(deadTaps); bite.push(best);
    }
  }
  return {
    made, tried,
    puzzle: made ? demanding / made : 0,
    cascade: mean(chained),
    deadTaps: med(dead),
    bite: med(bite),
    par: med(pars),
  };
}

const levels = [3, 9, 15, 21];
const rows = [];
for (const SWELL of [1, 2, 3])
  for (const WET_RUN of [2, 3, 5])
    for (const R1 of [3, 4])
      rows.push({ cfg: { RUN: 10, WET_RUN, SWELL, R1, R2: 10 } });

console.log('PANE — sweeping the constants\n');
console.log('  swell  wet  R1 | made  par | PUZZLE  CASCADE  dead  bite');
console.log('  ' + '-'.repeat(62));

const scored = [];
for (const { cfg } of rows) {
  const r = trial(cfg, levels, 8);
  scored.push({ cfg, r });
  const flag = (r.puzzle >= 0.7 && r.cascade >= 0.4 && r.deadTaps === 0) ? '  <=' : '';
  console.log(`  ${String(cfg.SWELL).padStart(5)}${String(cfg.WET_RUN).padStart(5)}${String(cfg.R1).padStart(4)} |`
    + `${String(r.made).padStart(5)}${String(r.par).padStart(5)} |`
    + `${(r.puzzle * 100).toFixed(0).padStart(6)}%${(r.cascade * 100).toFixed(0).padStart(8)}%`
    + `${String(r.deadTaps).padStart(6)}${(r.bite * 100).toFixed(0).padStart(6)}%${flag}`);
}

console.log('\nBEST BY ALL THREE');
const ok = scored.filter(s => s.r.made >= 20 && s.r.deadTaps === 0)
  .sort((a, b) => (b.r.puzzle + b.r.cascade) - (a.r.puzzle + a.r.cascade));
for (const s of ok.slice(0, 3)) {
  console.log(`  swell ${s.cfg.SWELL}, wet_run ${s.cfg.WET_RUN}, R1 ${s.cfg.R1}  ->  `
    + `puzzle ${(s.r.puzzle * 100).toFixed(0)}%, cascade ${(s.r.cascade * 100).toFixed(0)}%, bite ${(s.r.bite * 100).toFixed(0)}%`);
}
if (!ok.length) console.log('  none. no setting clears all three.');
