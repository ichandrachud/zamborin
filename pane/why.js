/* PANE — why won't the cascade fire?

   Hypothesis: the two cascades compete for the same drops. A tap MERGES first
   and RUNS second, so by the time the drop is heavy enough to break loose it
   has already swallowed everything near it — including the very neighbours the
   run was supposed to set off. The merge eats its own cascade.

   If that is right, the fix is a design change and not a constant.

   Run:  node pane/why.js
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
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;

M.configure({ RUN: 10, WET_RUN: 2, SWELL: 1, R1: 6, R2: 12 });
const rnd = mulberry(4);

let taps = 0, ranAtAll = 0;
const swallowedBefore = [], besideTrack = [], chainedIn = [], colsRun = [];

for (let lvl of [3, 6, 9, 12, 15, 18, 21, 24]) {
  for (let n = 0; n < 10; n++) {
    const b = M.generate(lvl, rnd);
    if (!b) continue;
    // try EVERY tap on the opening board and every tap one ply deep
    const states = [b];
    for (const i of M.drops(b)) { const t = M.tap(b, i); if (t) states.push(t.board); }
    for (const s of states) {
      for (const i of M.drops(s)) {
        const t = M.tap(s, i);
        if (!t) continue;
        taps++;
        if (!t.ran) continue;
        ranAtAll++;
        colsRun.push(t.ran);
        swallowedBefore.push(t.swallowed);

        // how many drops were sitting beside the track that the run swept,
        // measured on the board as it was BEFORE the tap
        const c = i % s.W, r0 = (i / s.W) | 0;
        let beside = 0, eligible = 0;
        for (let r = r0; r < s.H; r++) {
          for (const dc of [-1, 1]) {
            const cc = c + dc;
            if (cc < 0 || cc >= s.W) continue;
            const m = s.mass[r * s.W + cc];
            if (m > 0) { beside++; if (m >= M.CFG.WET_RUN) eligible++; }
          }
        }
        besideTrack.push(beside);
        chainedIn.push(t.ran - 1);
      }
    }
  }
}

console.log('PANE — why the cascade does not fire\n');
console.log(`  taps examined                              : ${taps}`);
console.log(`  taps that triggered a run                  : ${ranAtAll}  (${(100 * ranAtAll / taps).toFixed(1)}%)`);
console.log(`  drops swallowed by the merge BEFORE the run: ${mean(swallowedBefore).toFixed(2)} on average`);
console.log(`  drops still standing beside the track      : ${mean(besideTrack).toFixed(2)} on average`);
console.log(`  drops the run actually set off             : ${mean(chainedIn).toFixed(2)} on average`);
console.log(`  columns that ran, on average               : ${mean(colsRun).toFixed(2)}`);
console.log('');
console.log('  If "swallowed" is large and "beside" is near zero, the merge ate the cascade.');
console.log('  If "beside" is healthy but "set off" is near zero, the threshold is wrong.');
