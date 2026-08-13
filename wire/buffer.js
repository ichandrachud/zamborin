/* WIRE — is squeezing between two birds ever NECESSARY?

   measure2.js said solutions put a bird between two others 0-2% of the time,
   which would mean position is unused and the feuds are only a fancier capacity
   rule. But that number is suspect: solve() enumerates slot 0 first and returns
   the first solution it finds, so it is biased toward ends by construction —
   the same class of harness bug that flattered Pane three times.

   The honest test is not "does the first solution use the middle", it is "can
   the board be solved WITHOUT the middle". So: solve each board twice, once
   with every slot available and once with only the two ends of each span, and
   count how many boards need the middle.

   This also sweeps the two dials that control conflict, because 46% is the best
   the gate has seen and the gate wants 70%.

   Run:  node wire/buffer.js
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

// solvable using only the ends of each span
function solvableEndsOnly(b) {
  const seen = new Set();
  return (function walk(state, k) {
    if (k >= b.queue.length) return true;
    const key = k + '|' + state.map(l => l.map(x => x.sp + '.' + x.w).join('-')).join('/');
    if (seen.has(key)) return false;
    seen.add(key);
    for (const m of M.moves(b, state, k)) {
      if (m.p !== 0 && m.p !== state[m.s].length) continue;
      if (walk(M.insert(state, m.s, m.p, b.queue[k]), k + 1)) return true;
    }
    return false;
  })(M.fresh(b), 0);
}

function trial(cfg, levels, per) {
  M.configure(cfg);
  const rnd = mulberry(11);
  let made = 0, demanding = 0, needsMiddle = 0, bestWins = 0;
  const ruin = [];
  for (const lvl of levels) {
    for (let n = 0; n < per; n++) {
      const b = M.generate(lvl, rnd);
      if (!b) continue;
      made++;
      if (!M.anyGreedyWins(b)) demanding++;
      if (M.greedy(b, 'best').won) bestWins++;
      if (!solvableEndsOnly(b)) needsMiddle++;
      const ms = M.moves(b, M.fresh(b), 0);
      let safe = 0;
      for (const m of ms) {
        const ok = (function walk(st, k) {
          if (k >= b.queue.length) return true;
          for (const m2 of M.moves(b, st, k)) if (walk(M.insert(st, m2.s, m2.p, b.queue[k]), k + 1)) return true;
          return false;
        })(M.insert(M.fresh(b), m.s, m.p, b.queue[0]), 1);
        if (ok) safe++;
      }
      ruin.push(ms.length ? 1 - safe / ms.length : 0);
    }
  }
  return {
    made,
    puzzle: made ? demanding / made : 0,
    middle: made ? needsMiddle / made : 0,
    best: made ? bestWins / made : 0,
    ruin: ruin.length ? ruin.reduce((a, x) => a + x, 0) / ruin.length : 0,
  };
}

console.log('WIRE — does the middle of the wire matter, and can the gate be reached?\n');
console.log('  kinds feuds spans | made | BEATS ALL  needs middle  best-fit  opening risk');
console.log('  ' + '-'.repeat(74));

const rows = [];
for (const SPECIES of [4, 5])
  for (const FEUDS of [2, 3, 4, 5])
    for (const SPANS of [3, 4]) {
      if (FEUDS > (SPECIES * (SPECIES - 1)) / 2) continue;
      const r = trial({ SPECIES, FEUDS, SPANS, BIRDS: 10, GAP: 0 }, [20, 32, 44, 56], 10);
      rows.push({ SPECIES, FEUDS, SPANS, r });
      const flag = r.puzzle >= 0.7 ? '  <=' : '';
      console.log(`  ${String(SPECIES).padStart(5)}${String(FEUDS).padStart(6)}${String(SPANS).padStart(6)} |`
        + `${String(r.made).padStart(5)} |${(r.puzzle * 100).toFixed(0).padStart(10)}%`
        + `${(r.middle * 100).toFixed(0).padStart(13)}%${(r.best * 100).toFixed(0).padStart(10)}%`
        + `${(r.ruin * 100).toFixed(0).padStart(13)}%${flag}`);
    }

const ok = rows.filter(x => x.r.made >= 25).sort((a, z) => z.r.puzzle - a.r.puzzle);
console.log('\nBEST THREE');
for (const x of ok.slice(0, 3)) {
  console.log(`  ${x.SPECIES} kinds, ${x.FEUDS} feuds, ${x.SPANS} spans -> `
    + `beats all ${(x.r.puzzle * 100).toFixed(0)}%, needs the middle ${(x.r.middle * 100).toFixed(0)}%, `
    + `opening risk ${(x.r.ruin * 100).toFixed(0)}%`);
}
