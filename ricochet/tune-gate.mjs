#!/usr/bin/env node
/* ============================================================
   Ricochet · THE GATE  (build brief §6)
   ============================================================

   Does the aim angle carry a real decision, or is the run the same however
   well it is played?

   Two bots, the same seeds, the pure simulation with no renderer attached:

     Bot R  random   a uniform angle in [12, 168] every turn
     Bot G  greedy   sample 60 angles across the legal range, simulate each
                     turn fully, take the one that destroys the most HP,
                     ties to the shallower angle

   Both are exactly as the brief specifies. A THIRD bot is run alongside them
   and is NOT in the brief; it is labelled everywhere it appears and it exists
   to answer a question the brief's own pair cannot:

     Bot S  survival-greedy   same 60 samples, but chooses the angle that
                              leaves the wall furthest from the line, ties to
                              HP destroyed

   The reason: criterion 1 divides two SURVIVAL medians, while Bot G maximises
   DAMAGE. Those are not the same objective. If the mechanic is fine and only
   the metric is pointed at the wrong bot, Bot S separates from Bot R and Bot G
   does not. If Bot S is flat too, the mechanic genuinely has no survival
   decision in it. Without Bot S a failure cannot be told apart from a
   mis-specified gate, and the fix for those two is completely different.

   Usage
     node ricochet/tune-gate.mjs
     node ricochet/tune-gate.mjs --seeds=300 --samples=60
     node ricochet/tune-gate.mjs --sweep=rows:8,9,10,11,12 --seeds=120
     node ricochet/tune-gate.mjs --set=rows=9,mirrorPerLevel=0.05
*/
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('./sim.js');
const T = S.TUNE;
const DEG = S.DEG;

/* ---------- args ---------- */
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const SEEDS   = parseInt(args.seeds, 10) || 300;
const SAMPLES = parseInt(args.samples, 10) || 60;
const LEVEL_CAP = parseInt(args.cap, 10) || 400;

/* ---------- stats ---------- */
const asc = a => a.slice().sort((x, y) => x - y);
const pct = (a, p) => { const b = asc(a); const i = (b.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? b[lo] : b[lo] + (b[hi] - b[lo]) * (i - lo); };
const med  = a => pct(a, 0.5);
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const iqr  = a => pct(a, 0.75) - pct(a, 0.25);
const f2 = n => (Math.round(n * 100) / 100).toFixed(2);

/* ---------- the legal angle fan ---------- */
function fan(n) {
  const lo = T.minAngleDeg * DEG, hi = Math.PI - lo;
  return Array.from({ length: n }, (_, i) => lo + (hi - lo) * i / (n - 1));
}
// "Shallower" is further from vertical, so the tie-break prefers the larger
// deviation from 90 degrees.
const shallowness = a => Math.abs(a - Math.PI / 2);

/* One candidate turn, on a throwaway copy. Nothing here touches the real
   board's PRNG, so a bot that samples 60 angles and a bot that samples none
   see exactly the same sequence of rows from the same seed. That is what makes
   the two bots comparable at all. */
function probe(state, angle) {
  const s = S.cloneState(state);
  const turn = S.startTurn(s, angle);
  S.runToEnd(s, turn);
  return { hp: turn.hpDestroyed, pickups: turn.pickups, safety: S.turnsToLine(s), t: turn.t };
}

const BOTS = {
  R: (state, rng) => (T.minAngleDeg + rng.float() * (180 - 2 * T.minAngleDeg)) * DEG,
  G: (state) => {
    let bestA = Math.PI / 2, bestHp = -1, bestSh = -1;
    for (const a of fan(SAMPLES)) {
      const r = probe(state, a);
      const sh = shallowness(a);
      if (r.hp > bestHp || (r.hp === bestHp && sh > bestSh)) { bestHp = r.hp; bestSh = sh; bestA = a; }
    }
    return bestA;
  },
  // NOT IN THE BRIEF. See the header.
  S: (state) => {
    let bestA = Math.PI / 2, bestSafe = -1, bestHp = -1;
    for (const a of fan(SAMPLES)) {
      const r = probe(state, a);
      if (r.safety > bestSafe || (r.safety === bestSafe && r.hp > bestHp)) {
        bestSafe = r.safety; bestHp = r.hp; bestA = a;
      }
    }
    return bestA;
  },
};

function play(seed, botKey) {
  const st = S.newState(seed);
  const rng = S.makeRng((seed ^ 0xA5A5A5) >>> 0);
  const pick = BOTS[botKey];
  const perLevel = [];          // [{level, hp}] so the gap can be split by band
  const turnT = [];
  let capped = false;
  while (!st.over) {
    if (st.level > LEVEL_CAP) { capped = true; break; }
    const lvl = st.level;
    const a = pick(st, rng);
    const turn = S.startTurn(st, a);
    S.runToEnd(st, turn);
    perLevel.push({ level: lvl, hp: turn.hpDestroyed });
    turnT.push(turn.t);
    S.resolveTurn(st, turn);
  }
  return { level: st.level, score: st.score, balls: st.balls, perLevel, turnT, capped };
}

/* ---------- one full evaluation at the current TUNE ---------- */
function evaluate(seeds, bots = ['R', 'G', 'S']) {
  const out = {};
  for (const k of bots) {
    const runs = [];
    for (let s = 1; s <= seeds; s++) runs.push(play(s, k));
    out[k] = runs;
  }
  return out;
}

// Mean HP destroyed per turn inside a level band, for the gap-growth criterion.
function bandHp(runs, lo, hi) {
  const v = [];
  for (const r of runs) for (const p of r.perLevel) if (p.level >= lo && p.level <= hi) v.push(p.hp);
  return { n: v.length, mean: mean(v) };
}

function criteria(res) {
  const lv = k => res[k].map(r => r.level);
  const sc = k => res[k].map(r => r.score);
  const G = lv('G'), R = lv('R');

  const c1 = med(G) / med(R);
  const early = res.G.filter(r => r.level < 8).length / res.G.length;
  const c3 = iqr(G) / med(G);

  const early_G = bandHp(res.G, 1, 15), early_R = bandHp(res.R, 1, 15);
  const late_G  = bandHp(res.G, 30, Infinity), late_R = bandHp(res.R, 30, Infinity);
  const gapEarly = early_R.mean ? early_G.mean / early_R.mean : null;
  const gapLate  = late_R.mean  ? late_G.mean  / late_R.mean  : null;

  return {
    c1: { name: 'median(G.level) / median(R.level)', value: c1, pass: c1 >= 2.0, want: '>= 2.0',
          detail: `G median ${med(G)}, R median ${med(R)}` },
    c2: { name: 'skill gap wider at level 30+ than 1-15', early: gapEarly, late: gapLate,
          nEarly: early_G.n, nLate: late_G.n,
          pass: (gapEarly !== null && gapLate !== null) ? gapLate > gapEarly : null,
          want: 'wider at 30+',
          detail: gapLate === null
            ? `NOT EVALUABLE: no run of either bot reached level 30 (G samples at 30+: ${late_G.n}, R: ${late_R.n})`
            : `1-15 ratio ${f2(gapEarly)}, 30+ ratio ${f2(gapLate)}` },
    c3: { name: 'IQR(G.level) / median(G.level)', value: c3, pass: c3 <= 0.6, want: '<= 0.6',
          detail: `IQR ${f2(iqr(G))}, median ${med(G)}` },
    c4: { name: 'share of G runs ending before level 8', value: early, pass: early <= 0.05, want: '<= 5%',
          detail: `${res.G.filter(r => r.level < 8).length} of ${res.G.length}` },
    extra: {
      scoreRatio: med(sc('G')) / med(sc('R')),
      medG: med(G), medR: med(R), medS: med(lv('S')),
      survivalRatio_S_over_R: med(lv('S')) / med(R),
      cappedRuns: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.filter(r => r.capped).length])),
    },
  };
}

function report(res, label) {
  const c = criteria(res);
  console.log(`\n=== ${label} ===`);
  for (const k of ['c1', 'c2', 'c3', 'c4']) {
    const x = c[k];
    const mark = x.pass === true ? 'PASS' : x.pass === false ? 'FAIL' : 'N/A ';
    const val = x.value !== undefined ? f2(x.value) : '';
    console.log(`  [${mark}] ${x.name.padEnd(42)} ${val.padStart(6)}  want ${x.want}`);
    console.log(`         ${x.detail}`);
  }
  console.log(`  --- context ---`);
  console.log(`  median level   R ${c.extra.medR}   G ${c.extra.medG}   S ${c.extra.medS}   (S is NOT in the brief)`);
  console.log(`  score ratio    median(G.score)/median(R.score) = ${f2(c.extra.scoreRatio)}`);
  console.log(`  Bot S vs R     median(S.level)/median(R.level) = ${f2(c.extra.survivalRatio_S_over_R)}`);
  const capped = Object.entries(c.extra.cappedRuns).filter(([, n]) => n > 0);
  console.log(`  runs hitting the level-${LEVEL_CAP} cap: ${capped.length ? capped.map(([k, n]) => k + '=' + n).join(' ') : 'none'}`);
  return c;
}

/* ---------- main ---------- */
const t0 = Date.now();
if (args.set) {
  for (const kv of String(args.set).split(',')) {
    const [k, v] = kv.split('=');
    if (!(k in T)) { console.error('unknown TUNE key: ' + k); process.exit(1); }
    T[k] = parseFloat(v);
  }
  console.log('TUNE overrides: ' + args.set);
}

if (args.sweep) {
  // "Report the boundary, not a sample."
  const [key, list] = String(args.sweep).split(':');
  if (!(key in T)) { console.error('unknown TUNE key: ' + key); process.exit(1); }
  const values = list.split(',').map(parseFloat);
  const base = T[key];
  console.log(`SWEEP ${key} over ${values.join(', ')}  (${SEEDS} seeds per point, ${SAMPLES} angle samples)`);
  console.log(`${key.padEnd(16)} ${'c1'.padStart(6)} ${'medR'.padStart(5)} ${'medG'.padStart(5)} ${'medS'.padStart(5)} ${'S/R'.padStart(6)} ${'c3'.padStart(6)} ${'c4'.padStart(6)} ${'score'.padStart(6)}`);
  for (const v of values) {
    T[key] = v;
    const res = evaluate(SEEDS);
    const c = criteria(res);
    console.log(`${String(v).padEnd(16)} ${f2(c.c1.value).padStart(6)} ${String(c.extra.medR).padStart(5)} ${String(c.extra.medG).padStart(5)} ${String(c.extra.medS).padStart(5)} ${f2(c.extra.survivalRatio_S_over_R).padStart(6)} ${f2(c.c3.value).padStart(6)} ${(100 * c.c4.value).toFixed(1).padStart(5)}% ${f2(c.extra.scoreRatio).padStart(6)}`);
  }
  T[key] = base;
} else {
  console.log(`GATE · ${SEEDS} seeds, ${SAMPLES} angle samples, level cap ${LEVEL_CAP}`);
  console.log(`TUNE rows=${T.rows} cols=${T.cols} startBalls=${T.startBalls} hpVar=${T.hpVariance} ` +
              `mirror=${T.mirrorBase}+${T.mirrorPerLevel}/lvl cap${T.mirrorCap} pickup=${T.pickupChance}`);
  const res = evaluate(SEEDS);
  report(res, `AT THE SHIPPED CONSTANTS`);

  const allT = res.G.flatMap(r => r.turnT);
  console.log(`\n  turn length (simulated seconds): median ${f2(med(allT))}  p90 ${f2(pct(allT, 0.9))}  max ${f2(Math.max(...allT))}`);
  console.log(`  over ${T.fastForwardAfter}s: ${(100 * allT.filter(x => x > T.fastForwardAfter).length / allT.length).toFixed(1)}%   ` +
              `at the ${T.turnHardStop}s hard stop: ${(100 * allT.filter(x => x >= T.turnHardStop).length / allT.length).toFixed(2)}%`);
  const maxHp = res.G.map(r => r.level + T.hpVariance);
  console.log(`  HP band exposure for Bot G: orange (24+) reached by ${(100 * maxHp.filter(h => h >= 24).length / maxHp.length).toFixed(1)}%, ` +
              `coral (36+) by ${(100 * maxHp.filter(h => h >= 36).length / maxHp.length).toFixed(1)}%`);
}

console.log(`\nWHAT THIS GATE DID NOT COVER`);
console.log(`  - Human play. Both bots re-decide from scratch every turn and neither`);
console.log(`    aims where the FIRST ball will land, which is the drift rule a person`);
console.log(`    learns within a few runs. A real player is somewhere above Bot G.`);
console.log(`  - Multi-turn planning. Bot G is one-turn greedy by specification.`);
console.log(`  - Angle resolution. ${SAMPLES} samples over 156 degrees is one every`);
console.log(`    ${f2(156 / (SAMPLES - 1))} degrees; a finer fan would find better shots and widen`);
console.log(`    every ratio here. These numbers are a floor, not a ceiling.`);
console.log(`  - Pickup routing. Neither bot values a +1 token except as a tie-break.`);
console.log(`  - The level cap is ${LEVEL_CAP}; any run reaching it is counted as ending there.`);
console.log(`\nelapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
