/* BUNNY — the gate.

   The same question Socket, Pane and Wire were asked: does a player who never
   plans still win? Plus the one that only this game can be asked, because only
   this game has something that kills you:

     how often does a wrong move END the level, rather than waste a turn?

   Four ways to play without thinking. A board only counts as demanding if it
   defeats every one of them.

     grow     slide whatever most enlarges the rabbit's region
     toward   slide whatever brings the carrot's region nearest
     first    take the first legal move
     safe     take any move that does not kill you, preferring growth

   Run:  node bunny/measure.js
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

// how far apart the rabbit's region and the carrot's region are, in cells
function gapToCarrot(b) {
  const theirs = M.region(b, b.carrot);
  const rc = b.rabbit % b.W, rr = (b.rabbit / b.W) | 0;
  let best = Infinity;
  for (const j of theirs) {
    const d = Math.abs(rc - j % b.W) + Math.abs(rr - ((j / b.W) | 0));
    if (d < best) best = d;
  }
  return best === Infinity ? 99 : best;
}

const PLAYERS = {
  grow: (b, ms) => ms.reduce((best, m) => {
    const s = M.region(M.apply(b, m), b.rabbit).size;
    return s > best.s ? { m, s } : best;
  }, { m: ms[0], s: -1 }).m,
  toward: (b, ms) => ms.reduce((best, m) => {
    const g = gapToCarrot(M.apply(b, m));
    return g < best.g ? { m, g } : best;
  }, { m: ms[0], g: Infinity }).m,
  first: (b, ms) => ms[0],
  safe: (b, ms) => {
    const live = ms.filter(m => M.status(M.apply(b, m)) !== 'dead');
    const pool = live.length ? live : ms;
    return pool.reduce((best, m) => {
      const s = M.region(M.apply(b, m), b.rabbit).size;
      return s > best.s ? { m, s } : best;
    }, { m: pool[0], s: -1 }).m;
  },
};

function play(b, how, budget) {
  const pick = PLAYERS[how];
  let cur = b;
  for (let n = 0; n < budget; n++) {
    const st = M.status(cur);
    if (st === 'won') return { won: true, n };
    if (st === 'dead') return { won: false, n, died: true };
    const ms = M.moves(cur);
    if (!ms.length) return { won: false, n };
    cur = M.apply(cur, pick(cur, ms));
  }
  return { won: M.status(cur) === 'won', n: budget };
}

function band(lo, hi, want) {
  const rnd = mulberry(17 + lo);
  const boards = [];
  for (let n = 0; n < want; n++) {
    const b = M.generate(lo + ((n * 3) % Math.max(1, hi - lo + 1)), rnd);
    if (b) boards.push(b);
  }
  if (!boards.length) return null;

  let demanding = 0;
  const per = {}; for (const h of Object.keys(PLAYERS)) per[h] = 0;
  const pars = [], states = [], fatal = [], killedBy = [];

  for (const b of boards) {
    let anyWon = false;
    for (const h of Object.keys(PLAYERS)) {
      const r = play(b, h, b.par + 3);
      if (r.won) { per[h]++; anyWon = true; }
    }
    if (!anyWon) demanding++;
    pars.push(b.par); states.push(b.states);
    fatal.push(M.fatalShare(b));
    // does an unplanned player actually get eaten, or just wander?
    killedBy.push(Object.keys(PLAYERS).some(h => play(b, h, b.par + 3).died) ? 1 : 0);
  }

  return { n: boards.length, demanding, per, par: med(pars), states: med(states),
           fatal: mean(fatal), killed: mean(killedBy) };
}

console.log('BUNNY — is it a puzzle?\n');
for (const [lo, hi] of [[1, 10], [11, 25], [26, 40], [41, 60]]) {
  const r = band(lo, hi, 30);
  if (!r) { console.log(`levels ${lo}-${hi}: no boards generated\n`); continue; }
  console.log(`levels ${lo}-${hi}   (${r.n} boards)`);
  console.log(`   beats EVERY unplanned player  : ${r.demanding} / ${r.n}  ${pct(r.demanding, r.n)}`);
  console.log(`   each on its own               : ` + Object.entries(r.per).map(([h, v]) => `${h} ${pct(v, r.n)}`).join(', '));
  console.log(`   slides available that KILL    : ${(r.fatal * 100).toFixed(0)}%`);
  console.log(`   unplanned play gets eaten     : ${(r.killed * 100).toFixed(0)}% of boards`);
  console.log(`   par ${r.par} slides, search ${r.states} states`);
  console.log('');
}
console.log('READ IT LIKE THIS');
console.log('  beats every player, low   -> not a puzzle, sliding anything works');
console.log('  slides that kill, 0%      -> the predator is scenery');
