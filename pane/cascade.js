/* PANE — does the glass actually wipe?

   The puzzle can measure well and still be a dull thing to look at. The pitch
   promises that one tap can clear half the window: a drop runs, wets the track,
   and the drops beside it break loose in turn. If runs never chain, the game is
   correct and lifeless.

   So: across real boards, how much does a single tap take?

   Run:  node pane/cascade.js
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
const mean = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length) : NaN;

const rnd = mulberry(7);
const bands = [[1, 10], [11, 24], [25, 40]];

console.log('PANE — how much does one tap take?\n');

for (const [lo, hi] of bands) {
  const bestRuns = [], bestShare = [], onPath = [], chained = [];
  let boards = 0;
  for (let n = 0; n < 30; n++) {
    const lvl = lo + ((n * 5) % Math.max(1, hi - lo + 1));
    const b = M.generate(lvl, rnd);
    if (!b) continue;
    boards++;

    // the loudest tap available anywhere on the opening board
    let mostRuns = 0, mostShare = 0;
    const before = M.totalMass(b);
    for (const i of M.drops(b)) {
      const t = M.tap(b, i);
      if (!t) continue;
      mostRuns = Math.max(mostRuns, t.ran);
      mostShare = Math.max(mostShare, (before - M.totalMass(t.board)) / before);
    }
    bestRuns.push(mostRuns); bestShare.push(mostShare);

    // and what actually happens when the board is played properly
    const sol = M.solve(b, b.par).solutions[0];
    if (sol) {
      let cur = M.clone(b), peak = 0, peakShare = 0;
      for (const i of sol) {
        const t = M.tap(cur, i);
        if (!t) break;
        const took = (M.totalMass(cur) - M.totalMass(t.board)) / before;
        peak = Math.max(peak, t.ran); peakShare = Math.max(peakShare, took);
        cur = t.board;
      }
      onPath.push(peakShare);
      chained.push(peak >= 2 ? 1 : 0);
    }
  }
  console.log(`levels ${lo}-${hi}   (${boards} boards)`);
  console.log(`   loudest tap available, columns that run : median ${med(bestRuns)}, mean ${mean(bestRuns).toFixed(1)}`);
  console.log(`   loudest tap available, share of glass   : ${(med(bestShare) * 100).toFixed(0)}%`);
  console.log(`   biggest tap ON THE SOLUTION path        : ${(med(onPath) * 100).toFixed(0)}% of the glass`);
  console.log(`   solutions containing a chained run      : ${(mean(chained) * 100).toFixed(0)}%`);
  console.log('');
}

console.log('READ IT LIKE THIS');
console.log('  columns that run, always 1   -> runs never chain, the cascade is a lie');
console.log('  share of glass, small        -> correct puzzle, dull to watch');
