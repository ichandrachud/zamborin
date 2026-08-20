/* TAILWIND — VARIANT B of the timed release. Aim stays a choice.

   Variant A (whip.js) took the launch ANGLE from the release instant. That
   collapsed the game: angle and speed became one degree of freedom, so the
   player could no longer choose a steep launch on a calm day, and the numbers
   showed it — best release sat at u = 0.35 for every wind from -12 to +3, and
   the best draw pinned at 0.33 regardless. It bought a timing skill by deleting
   the judgement.

   So aim the fork first, by drag, untimed: wind still decides that exactly as
   it does now. Then the trunk sweeps, and the release instant sets only HOW
   MUCH OF THE WHIP'S SPEED you take, peaking as it passes upright.

   Why that is a skill and not "tap at the top": more speed is NOT better. Past
   what the airframe stands the wing strains and permanently loses lift and
   gains drag — which is why Lacerta's best draw today is 0.51 and not 1.0. So
   there is a speed you WANT and it is not the maximum, the target is an instant
   with punishment on both sides, and the prediction is:

     once the whip can already deliver the speed you want, more bend adds
     nothing to the best case and only makes the same millisecond of error
     move the speed further. So expected distance should PEAK at the bend
     that just reaches it — an interior optimum that comes from the material
     rather than from a constant chosen to produce one.

   The other half of the trade is that whip speed is CHEAP and band speed is
   DEAR: the whip accelerates over the whole arc it has already travelled, so it
   is far less load per joule than the four-metre band stroke. The whip lets you
   carry speed the band could not give you without straining the wing — but only
   if you can time it.

   Run:  node tailwind/whip2.js
*/
const M = require('./model.js');

const W = {
  PHI_MAX: 62 * Math.PI / 180,
  R: 8.0,
  OMEGA: 4.2,
  JITTER_MS: 40,
};
const sweepTime = () => Math.PI / W.OMEGA;

const f0 = (n) => n.toFixed(0), f2 = (n) => n.toFixed(2);
const pct = (n) => (100 * n).toFixed(0) + '%';
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rnd) {
  return Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
}

function fly(p, bend, u, pull, ang, wind) {
  const phi0 = W.PHI_MAX * bend;
  const vFork = W.R * phi0 * W.OMEGA * Math.sin(Math.PI * u);
  const E = M.CFG.E_MIN + (M.CFG.E_MAX - M.CFG.E_MIN) * pull;
  const vBand = Math.sqrt(2 * E / p.m);
  const stroke = M.CFG.STROKE + W.R * phi0 * (1 - Math.cos(Math.PI * u));
  return M.fly(p, ang, pull, { wind, v0: vFork + vBand, stroke }).dist;
}

// coarse grid, then a local refine — the full grid is far too slow
function optimum(p, bend, wind) {
  const A0 = M.CFG.ANG_MIN, A1 = M.CFG.ANG_MAX;
  let b = { d: -1 };
  for (let i = 0; i <= 12; i++) {
    const ang = A0 + (A1 - A0) * (i / 12);
    for (let j = 0; j <= 20; j++) {
      const u = j / 20;
      for (let k = 0; k <= 4; k++) {
        const d = fly(p, bend, u, k / 4, ang, wind);
        if (d > b.d) b = { d, ang, u, pull: k / 4 };
      }
    }
  }
  const dA = (A1 - A0) / 12, dU = 1 / 20, dP = 1 / 4;
  for (let i = -2; i <= 2; i++) {
    const ang = Math.max(A0, Math.min(A1, b.ang + i * dA / 2));
    for (let j = -4; j <= 4; j++) {
      const u = Math.max(0, Math.min(1, b.u + j * dU / 4));
      for (let k = -2; k <= 2; k++) {
        const pull = Math.max(0, Math.min(1, b.pull + k * dP / 2));
        const d = fly(p, bend, u, pull, ang, wind);
        if (d > b.d) b = { d, ang, u, pull };
      }
    }
  }
  return b;
}

function expected(p, o, bend, ms, wind, n = 250) {
  const rnd = mulberry(20260821);
  const out = [];
  for (let s = 0; s < n; s++) {
    const u = Math.max(0, Math.min(1, o.u + gauss(rnd) * (ms / 1000) / sweepTime()));
    out.push(fly(p, bend, u, o.pull, o.ang, wind));
  }
  return mean(out);
}

const BENDS = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
const p = M.build('Lacerta');

console.log('TAILWIND — timed release, VARIANT B (aim still chosen)\n');
console.log(`  sweep ${(sweepTime() * 1000).toFixed(0)} ms end to end; release error ${W.JITTER_MS} ms, one sigma\n`);

console.log('IS THE EXPECTED BEST BEND INTERIOR?  Lacerta, still air');
console.log('  bend    best   expected   cost of being human   aim / release / draw');
const rows = [];
for (const bd of BENDS) {
  const o = optimum(p, bd, 0);
  const e = expected(p, o, bd, W.JITTER_MS, 0);
  rows.push({ bd, best: o.d, e, o });
  console.log(`  ${f2(bd)}   ${f0(o.d).padStart(5)} m ${f0(e).padStart(7)} m` +
    `        ${pct(1 - e / o.d).padStart(4)}          ${o.ang.toFixed(0)}° / u ${f2(o.u)} / ${f2(o.pull)}`);
}
const bb = rows.reduce((a, r) => (r.best > a.best ? r : a));
const be = rows.reduce((a, r) => (r.e > a.e ? r : a));
console.log(`\n  best-case wants bend ${f2(bb.bd)}   |   EXPECTED wants bend ${f2(be.bd)}`);
console.log(be.bd > 0 && be.bd < 1
  ? '  -> INTERIOR. The player picks how much precision to gamble for distance.'
  : '  -> on a wall.');

console.log('\nDOES THE WIND STILL MOVE THE AIM?');
console.log('  wind    aim   bend   release   expected');
for (const w of [-12, -6, 0, 3]) {
  let b = { e: -1 };
  for (const bd of BENDS) {
    const o = optimum(p, bd, w);
    const e = expected(p, o, bd, W.JITTER_MS, w);
    if (e > b.e) b = { e, bd, o };
  }
  console.log(`  ${String(w).padStart(3)}    ${b.o.ang.toFixed(0).padStart(3)}°  ${f2(b.bd)}    u ${f2(b.o.u)}    ${f0(b.e).padStart(5)} m`);
}

console.log('\nHOW SHARP IS THE PEAK?  at the expected-best bend');
{
  const o = be.o, bd = be.bd;
  for (const dms of [0, 15, 30, 50, 80]) {
    const du = (dms / 1000) / sweepTime();
    const lo = fly(p, bd, Math.max(0, o.u - du), o.pull, o.ang, 0);
    const hi = fly(p, bd, Math.min(1, o.u + du), o.pull, o.ang, 0);
    console.log(`   ${String(dms).padStart(3)} ms early / late   ${f0(lo).padStart(5)} m / ${f0(hi).padStart(5)} m   (${pct(lo / o.d)} / ${pct(hi / o.d)})`);
  }
}

console.log('\nDOES A STEADIER HAND PAY?');
console.log('  jitter   best bend   expected');
for (const ms of [10, 25, 40, 70, 120]) {
  let b = { e: -1 };
  for (const bd of BENDS) {
    const o = optimum(p, bd, 0);
    const e = expected(p, o, bd, ms, 0);
    if (e > b.e) b = { e, bd };
  }
  console.log(`  ${String(ms).padStart(3)} ms      ${f2(b.bd)}       ${f0(b.e).padStart(5)} m`);
}

console.log('\nDO THE PLANES STILL DIFFER?  expected-best bend per aeroplane');
for (const name of Object.keys(M.PLANES)) {
  const q = M.build(name);
  let b = { e: -1 };
  for (const bd of BENDS) {
    const o = optimum(q, bd, 0);
    const e = expected(q, o, bd, W.JITTER_MS, 0);
    if (e > b.e) b = { e, bd, o };
  }
  console.log(`  ${name.padEnd(9)} bend ${f2(b.bd)}   aim ${b.o.ang.toFixed(0).padStart(3)}°   draw ${f2(b.o.pull)}   ${f0(b.e).padStart(5)} m`);
}
