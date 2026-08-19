/* TAILWIND — the gate.

   It is a craft game, not a puzzle, so the question is not "does greedy win",
   it is:

     does understanding beat flailing?

   Three players, same plane, same physics:

     random   — angle and pull uniform over the whole range
     naive    — mid angle, maximum pull, the thing everybody does first
     informed — searches the angle/pull space for that plane's optimum

   Random landing near informed means there is nothing to learn. Informed
   sitting on a needle means there is something to learn and no way to learn it.
   So the harness also reports how wide the good region is, whether the surface
   is smooth enough to climb by feel, and how much of the distance is a bounce
   rather than a decision.

   Run:  node tailwind/measure.js
*/
const M = require('./model.js');

// A fixed stream, so two runs of this file print the same numbers.
function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const quant = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const f0 = (n) => n.toFixed(0);
const f1 = (n) => n.toFixed(1);
const pct = (n) => (100 * n).toFixed(0) + '%';

const A0 = M.CFG.ANG_MIN, A1 = M.CFG.ANG_MAX;

// The whole input space on a grid, reused by several of the numbers below.
function surface(plane, n = 60) {
  const p = M.build(plane);
  const g = [];
  for (let i = 0; i <= n; i++) {
    const row = [];
    const a = A0 + (A1 - A0) * (i / n);
    for (let j = 0; j <= n; j++) row.push(M.fly(p, a, j / n).dist);
    g.push(row);
  }
  return g;
}

function players(plane, samples = 4000) {
  const p = M.build(plane);
  const rnd = mulberry(1009);
  const rs = [];
  for (let i = 0; i < samples; i++) rs.push(M.fly(p, A0 + (A1 - A0) * rnd(), rnd()).dist);
  const naive = M.fly(p, (A0 + A1) / 2, 1).dist;
  const inf = M.best(p);
  return { rs, naive, inf };
}

// Someone who has played twenty times and has the shape of it: aiming at the
// optimum with a human-sized wobble. If this player is far off informed, the
// peak is a needle and the game is a lottery dressed as a skill.
function byFeel(plane, opt, samples = 1500, dA = 5, dP = 0.08) {
  const p = M.build(plane);
  const rnd = mulberry(7717);
  const out = [];
  for (let i = 0; i < samples; i++) {
    const a = Math.max(A0, Math.min(A1, opt.angle + (rnd() * 2 - 1) * dA));
    const pu = Math.max(0, Math.min(1, opt.pull + (rnd() * 2 - 1) * dP));
    out.push(M.fly(p, a, pu).dist);
  }
  return out;
}

// Can you climb it by feel? Adjacent cells that differ wildly mean nudging the
// input teaches you nothing, and the game reads as luck even though it is not.
function roughness(g) {
  const flat = g.flat();
  const range = Math.max(...flat) - Math.min(...flat);
  const jumps = [];
  for (let i = 0; i < g.length; i++)
    for (let j = 0; j < g[i].length; j++) {
      if (i + 1 < g.length) jumps.push(Math.abs(g[i + 1][j] - g[i][j]) / range);
      if (j + 1 < g[i].length) jumps.push(Math.abs(g[i][j + 1] - g[i][j]) / range);
    }
  return { med: quant(jumps, 0.5), p99: quant(jumps, 0.99), max: Math.max(...jumps) };
}

// How much of the result is the bounce and not the flight.
function bounceShare(plane, n = 24) {
  const p = M.build(plane);
  const dead = M.build({ ...p.stats });
  dead.rest = 0;
  const share = [], counts = [];
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++) {
      const a = A0 + (A1 - A0) * (i / n), pu = j / n;
      const full = M.fly(p, a, pu), flat = M.fly(dead, a, pu);
      if (full.dist > 5) share.push((full.dist - flat.dist) / full.dist);
      counts.push(full.bounces);
    }
  return { share: mean(share), bounces: mean(counts) };
}

function histogram(vals, bins = 12) {
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const h = new Array(bins).fill(0);
  for (const v of vals) h[Math.min(bins - 1, Math.floor((v - lo) / (hi - lo) * bins))]++;
  const top = Math.max(...h);
  return h.map((c, i) => {
    const a = lo + (hi - lo) * i / bins;
    return `   ${f0(a).padStart(4)} m  ${'#'.repeat(Math.round(28 * c / top)).padEnd(28)} ${pct(c / vals.length)}`;
  }).join('\n');
}

// ---- report --------------------------------------------------------------
const only = process.argv[2];
const fleet = only ? [only] : Object.keys(M.PLANES);

console.log('TAILWIND — does understanding beat flailing?\n');

const opts = {};
for (const name of fleet) {
  const { rs, naive, inf } = players(name);
  const feel = byFeel(name, inf);
  const g = surface(name);
  const flat = g.flat();
  const good90 = flat.filter(d => d >= 0.90 * inf.dist).length / flat.length;
  const good95 = flat.filter(d => d >= 0.95 * inf.dist).length / flat.length;
  const R = roughness(g);
  const B = bounceShare(name);
  opts[name] = inf;

  console.log(`${name}  (weight ${M.PLANES[name].weight}, lift ${M.PLANES[name].lift}, drag ${M.PLANES[name].drag}, tough ${M.PLANES[name].tough})`);
  console.log(`   informed   ${f0(inf.dist).padStart(5)} m   at ${f1(inf.angle)}° / pull ${inf.pull.toFixed(2)}   apex ${f0(inf.apex)} m, ${inf.bounces} bounces`);
  console.log(`   by feel    ${f0(mean(feel)).padStart(5)} m   ${pct(mean(feel) / inf.dist)} of informed   (aiming at it, ±5° / ±0.08)`);
  console.log(`   naive      ${f0(naive).padStart(5)} m   ${pct(naive / inf.dist)} of informed   (mid angle, max pull)`);
  console.log(`   random     ${f0(mean(rs)).padStart(5)} m   ${pct(mean(rs) / inf.dist)} of informed   (best of 4000: ${pct(Math.max(...rs) / inf.dist)})`);
  console.log(`   good region: ${pct(good90)} of inputs within 10% of best, ${pct(good95)} within 5%`);
  console.log(`   surface: adjacent-cell jump median ${pct(R.med)}, p99 ${pct(R.p99)}, worst ${pct(R.max)} of range`);
  console.log(`   bounce contributes ${pct(B.share)} of distance, ${f1(B.bounces)} bounces per launch`);
  console.log('');
}

if (fleet.length > 1) {
  console.log('DO THE PLANES ACTUALLY DIFFER?  each plane flown at every plane\'s optimum');
  console.log('   rows = plane flown, cols = whose optimum was used, cell = % of that plane\'s own best\n');
  const names = fleet;
  console.log('            ' + names.map(n => n.slice(0, 4).padStart(6)).join(''));
  let ownWins = 0;
  for (const r of names) {
    const p = M.build(r);
    const row = names.map(c => M.fly(p, opts[c].angle, opts[c].pull).dist / opts[r].dist);
    const bestCol = row.indexOf(Math.max(...row));
    if (names[bestCol] === r) ownWins++;
    console.log(`   ${r.padEnd(9)}` + row.map(v => pct(v).padStart(6)).join(''));
  }
  console.log(`\n   planes whose own optimum is genuinely their best: ${ownWins} / ${names.length}`);
  const as = names.map(n => opts[n].angle), ps = names.map(n => opts[n].pull);
  console.log(`   optimum angle spread ${f1(Math.min(...as))}° – ${f1(Math.max(...as))}°, pull spread ${Math.min(...ps).toFixed(2)} – ${Math.max(...ps).toFixed(2)}`);
  console.log('');
}

// ---- does reading the wind pay? -------------------------------------------
// Wind exists to give the launch ANGLE a decision, which in still air it does
// not have: with nothing blowing the best aim is simply as steep as the
// catapult goes. So the test is not "is it windy", it is whether a player who
// reads the dial beats one who has learned a single good aim and always uses
// it. If the two are level, the dial is decoration.
if (!only) {
  const WINDS = [-15, -12, -9, -6, -3, 0, 3];
  console.log('DOES READING THE WIND PAY?');
  console.log('   informed  = best angle for TODAY\'s wind');
  console.log('   wind-blind = the angle that is best in still air, every time\n');
  console.log('   wind |' + fleet.map(n => n.slice(0, 4).padStart(7)).join('') + '   mean cost');
  const calmAngle = {};
  for (const n of fleet) {
    const p = M.build(n);
    let b = { dist: -1 };
    for (let a = M.CFG.ANG_MIN; a <= M.CFG.ANG_MAX; a += 2)
      for (let pu = 0.2; pu <= 1.001; pu += 0.05) {
        const r = M.fly(p, a, pu, { wind: 0 });
        if (r.dist > b.dist) b = { dist: r.dist, a, pu };
      }
    calmAngle[n] = b;
  }
  let worst = 1;
  for (const w of WINDS) {
    const row = fleet.map((n) => {
      const p = M.build(n);
      let inf = -1;
      for (let a = M.CFG.ANG_MIN; a <= M.CFG.ANG_MAX; a += 2)
        for (let pu = 0.2; pu <= 1.001; pu += 0.05)
          inf = Math.max(inf, M.fly(p, a, pu, { wind: w }).dist);
      const blind = M.fly(p, calmAngle[n].a, calmAngle[n].pu, { wind: w }).dist;
      return blind / inf;
    });
    const m = mean(row);
    worst = Math.min(worst, m);
    console.log(`${String(w).padStart(7)} |` + row.map(v => pct(v).padStart(7)).join('') +
      `   ${pct(m)}`);
  }
  console.log(`\n   worst day for the wind-blind player: ${pct(worst)} of what was there`);
  console.log('   under ~85% on the windy days -> the dial is worth reading\n');
}

const lead = fleet[0];
console.log(`DISTANCE SPREAD — ${lead}, 4000 random launches`);
console.log(histogram(players(lead).rs));

console.log(`
READ IT LIKE THIS
  random near 85%+ of informed   -> no skill in it, the catapult plays itself
  by feel well under informed    -> the optimum is a needle, frustrating
  good region under ~2%          -> needle;  over ~35% -> the peak is a plateau
  adjacent jump p99 over ~15%    -> cliffs, you cannot learn it by nudging
  bounce share over ~25%         -> the bounce is deciding it, damp restitution
  a bimodal spread               -> one lucky outcome dwarfing the skill
  an optimum spread of near zero -> that input is a constant, not a decision
                                    (the angle is currently this, on flat
                                     ground; see the header of model.js)`);
