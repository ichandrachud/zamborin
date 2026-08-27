/* ============================================================
   BALLAST · Milestone 1 check
   ------------------------------------------------------------
   Does the thing actually play? Runs the SHIPPING rules headless
   and asks four questions:
     1. do merges and cascades happen at all
     2. does the tilt move, and does it ever kill anyone
     3. do runs end, and how long do they last
     4. is a whole run reproducible from its seed
   Run: node ballast/tune-play.mjs
   ============================================================ */
import { readFileSync } from 'fs';
const here = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8');
(0, eval)(here('phys.js'));
(0, eval)(here('rules.js'));
const { Run, TUNE, TIER_R } = globalThis.BallastRules;
const { makeRng } = globalThis.BallastPhys;

const FRAME = 1 / 60;
const TIER_NAME = ['EMBER', 'COAL', 'FLAME', 'BRASS', 'AMBER', 'GOLD', 'STAR'];

/* Bots. Neither is the gate's merge-greedy or balance-aware bot; these
   only have to prove the machine turns over. */
const BOTS = {
  /* Drops wherever, which is the floor: whatever this scores, skill has
     to beat it or there is no game here. */
  random(run, rng) { return (rng() * 2 - 1) * run.world.halfW; },

  /* Aims at the nearest resting piece of the same tier. Crude, ignores
     balance completely, and is the shape of the gate's Bot M. */
  matcher(run, rng) {
    const w = run.world, o = {}, t = run.nextTier;
    let bestX = null, bestY = -Infinity;
    for (const b of w.bodies) {
      if (b.tier !== t) continue;
      w.toLocal(b.x, b.y, o);
      if (o.y > bestY) { bestY = o.y; bestX = o.x + (rng() < 0.5 ? -1 : 1) * (TIER_R[t] * 1.1); }
    }
    return bestX == null ? (rng() * 2 - 1) * w.halfW * 0.7 : bestX;
  },

  /* The shape of the gate's Bot B: same merge candidates, but among
     them take the one that leaves the centre of mass nearest the
     middle. This is the comparison that means anything. Matcher
     against random measures nothing, because matcher is deliberately
     blind to balance and random drops average out to level. */
  balanced(run, rng) {
    const w = run.world, o = {}, t = run.nextTier;
    const R = TIER_R[t], mass = w.P.DENSITY * R * R;
    const com = w.com.x, M = w.com.mass;
    // What matters is the COMBINED centre of mass against the base edge,
    // so the vessel's own mass belongs in the denominator. Leaving it out
    // makes the bot chase a number the vessel does not care about.
    const mv = w.P.TILT_MODEL === 'pedestal' ? w.P.VESSEL_MASS : 0;
    const after = (x) => Math.abs((com * M + x * mass) / (M + mass + mv));
    const merges = [];
    for (const b of w.bodies) {
      if (b.tier !== t) continue;
      w.toLocal(b.x, b.y, o);
      merges.push(o.x - R * 1.1, o.x + R * 1.1);
    }
    const pool = merges.length ? merges
      : Array.from({ length: 9 }, (_, i) => (-1 + i / 4) * w.halfW * 0.85);
    let best = null, bestV = Infinity;
    for (const c of pool) {
      const x = run.clampAim(c, t), v = after(x);
      if (v < bestV) { bestV = v; best = x; }
    }
    void rng;
    return best == null ? 0 : best;
  }
};

function play(seed, bot, cap = 240) {
  const run = new Run(seed);
  const rng = makeRng(seed ^ 0x9E3779B9);
  let thMin = 0, thMax = 0, waited = 0, deepLean = 0, frames = 0;
  while (!run.over && run.dropped < cap && run.time < 400) {
    if (run.canDrop()) run.drop(BOTS[bot](run, rng));
    run.advance(FRAME);
    frames++;
    const th = run.world.theta;
    if (th < thMin) thMin = th; if (th > thMax) thMax = th;
    if (Math.abs(th) > run.world.P.THETA_MAX * 0.62) deepLean++;
    if (!run.canDrop()) waited++;
  }
  return {
    seed, score: run.score, drops: run.dropped, merges: run.merges,
    biggest: run.biggest, bodies: run.world.bodies.length,
    over: run.over, cause: run.cause, time: +run.time.toFixed(1),
    thMin: +(thMin * 180 / Math.PI).toFixed(1),
    thMax: +(thMax * 180 / Math.PI).toFixed(1),
    deepLeanPct: Math.round(100 * deepLean / Math.max(1, frames)),
    everReached: run.everReached
  };
}

function table(label, bot) {
  console.log(`\n--- ${label} ---`);
  console.log('seed   score    drops  merges  biggest  tiltRange(deg)   deepLean%  ended   time(s)');
  const rows = [];
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const r = play(seed, bot);
    rows.push(r);
    console.log(
      String(r.seed).padEnd(7) +
      String(r.score).padEnd(9) +
      String(r.drops).padEnd(7) +
      String(r.merges).padEnd(8) +
      (r.biggest >= 0 ? TIER_NAME[r.biggest] : '-').padEnd(9) +
      (r.thMin + ' .. ' + r.thMax).padEnd(17) +
      (r.deepLeanPct + '%').padEnd(11) +
      (r.over ? (r.cause === 'topple' ? 'TOPPLE' : 'spill ') : 'CAP   ').padEnd(8) +
      r.time
    );
  }
  const med = (k) => { const a = rows.map(r => r[k]).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  console.log(`median score ${med('score')}   median drops ${med('drops')}   median merges ${med('merges')}` +
              `   toppled ${rows.filter(r => r.cause === 'topple').length}  spilled ${rows.filter(r => r.cause === 'spill').length}  ran to cap ${rows.filter(r => !r.over).length}`);
  return rows;
}

console.log('BALLAST — Milestone 1. The shipping rules, headless.');
const rnd = table('BOT: random drops', 'random');
const mat = table('BOT M: aims at a matching piece, blind to balance', 'matcher');
const bal = table('BOT B: same merges, but takes the balancing one', 'balanced');

console.log('\n--- determinism: a whole run, twice ---');
let detOK = true;
for (const seed of [21, 22, 23]) {
  const a = play(seed, 'matcher'), b = play(seed, 'matcher');
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (!same) detOK = false;
  console.log(`seed ${seed}: ${same ? 'IDENTICAL' : 'DIVERGED'}  score ${a.score} vs ${b.score}, drops ${a.drops} vs ${b.drops}`);
}

console.log('\n--- is the balance a real decision? (the gate\'s question, early) ---');
const med = (rows) => rows.map(r => r.score).sort((a, b) => a - b)[5];
const medR = med(rnd), medM = med(mat), medB = med(bal);
console.log(`median random ${medR}   median M ${medM}   median B ${medB}`);
console.log(`B/M ratio ${(medB / Math.max(1, medM)).toFixed(2)}x   (the brief asks for >= 1.35 at the real gate)`);

console.log('\n================ MILESTONE 1 VERDICT ================');
const all = rnd.concat(mat, bal);
const medMerges = bal.map(r => r.merges).sort((a, b) => a - b)[5];
const reached3 = all.filter(r => r.biggest >= 3).length;
const ended = all.filter(r => r.over).length;
const tilted = all.filter(r => Math.max(-r.thMin, r.thMax) > 4).length;
const checks = [
  ['merges fire',            medMerges > 0,              `median ${medMerges} merges per run`],
  ['cascades reach tier 3+', reached3 >= all.length / 2, `${reached3}/${all.length} runs`],
  ['the vessel tilts',       tilted >= all.length / 2,   `${tilted}/${all.length} runs past 4 deg`],
  ['runs end',               ended >= all.length * 0.8,  `${ended}/${all.length} ended by spill`],
  ['deterministic',          detOK,                      detOK ? 'exact' : 'diverged'],
  ['balance beats blind',    medB > medM,                `B/M ${(medB / Math.max(1, medM)).toFixed(2)}x`]
];
for (const [n, ok, v] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${n.padEnd(24)} ${v}`);
console.log(checks.every(c => c[1]) ? '\nPLAYABLE.' : '\nNOT YET.');
