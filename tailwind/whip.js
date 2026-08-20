/* TAILWIND — does a TIMED RELEASE give the game a mastery curve?

   The complaint, and it is correct: as shipped this is a catapult with a
   right answer. The peak is genuinely sharp — 1% of the input space lands
   within 10% of best — but a DRAG HAS NO TIME PRESSURE. You can take five
   seconds lining the band up, check its stretch, and let go exactly on the
   number you learned last time. Once you know the answer there is no execution
   risk left at all, so the difficulty is all front-loaded into figuring it out
   and none of it survives into the hundredth attempt.

   Yeti Sports does the opposite. The penguin is falling whether you are ready
   or not, the bat takes a fixed time to come round, and the payoff peaks at one
   instant you cannot sit on. You learn the theory in a minute and spend two
   hundred goes chasing the execution. That is a mastery curve, and it is what
   an one-more-go game runs on.

   THE STRUCTURE TO COPY is not "a timing bar". It is: something moves on its
   own schedule, and the reward peaks sharply at a moment you have to meet.

   Here that is the whip. The trunk is bent back and let go; it sweeps forward
   through its own arc carrying the aeroplane in the sling, and the player
   chooses when to let the sling open:

     - early in the sweep the trunk still leans back, so the launch is STEEP
       but the tip is barely moving, so it is SLOW
     - at the upright the tip is at maximum speed, so the launch is FAST but
       FLAT
     - past the upright it is slowing again and aiming into the ground

   So angle and speed are not two dials any more. They are one instant, and
   they trade against each other across it. Wind still decides which trade you
   want that go, which keeps everything already built.

   And this is what rescues BEND, which failed on its own (see model.js: best
   bend hit the ceiling on 6/6 planes and 72/72 settings). A harder bend swings
   the trunk FASTER, so the same human timing error costs more angle and more
   speed. Bend buys distance and spends precision. That is the accelerating
   cost the bend experiment could not find, and it cannot be tuned away because
   it comes from the player rather than from a constant.

   THE GATE IS DIFFERENT FROM EVERY GATE BEFORE IT. Best-case distance is the
   wrong number: of course releasing perfectly at full bend is best. What
   matters is EXPECTED distance under a timing error you cannot get rid of. If
   the expected best bend sits in the interior, the player is choosing how much
   risk to take for how much reward, calibrated to their own hands — which is
   exactly the Pingu loop.

   Run:  node tailwind/whip.js
*/
const M = require('./model.js');

// ---- whip kinematics ------------------------------------------------------
// Trunk lean phi, measured from upright, positive = bent back away from the
// launch. Let go and it swings forward: phi(u) = phi0*cos(pi*u) for u in [0,1],
// u being the fraction of the forward sweep. The tip carries the aeroplane, and
// the tip's velocity is tangential, so the LAUNCH ANGLE IS THE LEAN ITSELF and
// the launch speed is the tip speed, biggest as it passes upright.
const W = {
  PHI_MAX: 62 * Math.PI / 180,  // lean at full bend, radians
  R: 8.0,                       // metres from trunk base to the sling
  OMEGA: 4.2,                   // rad/s, how fast the trunk springs back
  JITTER_MS: 40,                // human release error, one sigma
};

const sweepTime = () => Math.PI / W.OMEGA;      // seconds for the whole sweep

function launchOf(bend, u, pull, m) {
  const phi0 = W.PHI_MAX * bend;
  const phi = phi0 * Math.cos(Math.PI * u);
  const vFork = W.R * phi0 * W.OMEGA * Math.sin(Math.PI * u);
  // the band still adds its own energy, along the same direction
  const E = M.CFG.E_MIN + (M.CFG.E_MAX - M.CFG.E_MIN) * Math.max(0, Math.min(1, pull));
  const vBand = Math.sqrt(2 * E / m);
  // the arc already travelled is extra stroke, so the whip is gentler per joule
  const stroke = M.CFG.STROKE + W.R * Math.abs(phi0 - phi);
  return { angleDeg: phi * 180 / Math.PI, v0: vFork + vBand, stroke };
}

function flyWhip(p, bend, u, pull, wind = 0) {
  const L = launchOf(bend, u, pull, p.m);
  if (L.angleDeg <= 0) return 0;               // aimed into the ground
  return M.fly(p, L.angleDeg, pull, { wind, v0: L.v0, stroke: L.stroke }).dist;
}

// ---- the numbers ----------------------------------------------------------
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
// gaussian timing error, in units of u
function jitterU(rnd, ms) {
  const g = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  return g * (ms / 1000) / sweepTime();
}

// best release and draw for a given bend, and what it is actually worth once
// the release cannot be placed exactly
function evaluate(plane, bend, ms, wind = 0, samples = 400) {
  const p = M.build(plane);
  let best = { d: -1 };
  for (let i = 0; i <= 60; i++) {
    const u = i / 60;
    for (let j = 0; j <= 12; j++) {
      const pull = j / 12;
      const d = flyWhip(p, bend, u, pull, wind);
      if (d > best.d) best = { d, u, pull };
    }
  }
  if (best.d <= 0) return { best: 0, expected: 0, u: 0, pull: 0 };
  const rnd = mulberry(20260820);
  const got = [];
  for (let s = 0; s < samples; s++) {
    const u = Math.max(0, Math.min(1, best.u + jitterU(rnd, ms)));
    got.push(flyWhip(p, bend, u, best.pull, wind));
  }
  return { best: best.d, expected: mean(got), u: best.u, pull: best.pull };
}

console.log('TAILWIND — a TIMED RELEASE off the whip\n');
console.log(`  sweep takes ${(sweepTime() * 1000).toFixed(0)} ms end to end; ` +
  `human release error taken as ${W.JITTER_MS} ms, one sigma\n`);

console.log('IS THERE A PRECISION PREMIUM?  Lacerta, still air');
console.log('  bend   best   expected   cost of being human   best release');
let rows = [];
for (const b of [0.2, 0.4, 0.6, 0.8, 1.0]) {
  const r = evaluate('Lacerta', b, W.JITTER_MS);
  rows.push({ b, ...r });
  console.log(`  ${f2(b)}   ${f0(r.best).padStart(4)} m  ${f0(r.expected).padStart(6)} m` +
    `        ${pct(1 - r.expected / r.best).padStart(4)}          u = ${f2(r.u)} / pull ${f2(r.pull)}`);
}
const bestBest = rows.reduce((a, r) => (r.best > a.best ? r : a));
const bestExp = rows.reduce((a, r) => (r.expected > a.expected ? r : a));
console.log(`\n  best-case wants bend ${f2(bestBest.b)}   |   EXPECTED wants bend ${f2(bestExp.b)}`);
console.log(bestExp.b > 0.2 && bestExp.b < 1.0
  ? '  -> INTERIOR. Bend is a risk/reward dial the player sets to their own hands.'
  : '  -> on a wall. The timing cost is not biting; bend is still a tax.');

console.log('\nHOW SHARP IS THE PEAK?  distance against release timing, bend 0.8');
{
  const p = M.build('Lacerta');
  const r = evaluate('Lacerta', 0.8, W.JITTER_MS);
  const T = sweepTime() * 1000;
  for (const dms of [0, 15, 30, 50, 80, 120]) {
    const du = (dms / 1000) / sweepTime();
    const lo = flyWhip(p, 0.8, Math.max(0, r.u - du), r.pull);
    const hi = flyWhip(p, 0.8, Math.min(1, r.u + du), r.pull);
    console.log(`   ${String(dms).padStart(3)} ms early / late   ${f0(lo).padStart(4)} m / ${f0(hi).padStart(4)} m` +
      `   (${pct(lo / r.best)} / ${pct(hi / r.best)} of a perfect release)`);
  }
  console.log(`   full sweep is ${T.toFixed(0)} ms`);
}

console.log('\nDOES A STEADIER HAND PAY?  Lacerta, expected distance by timing error');
console.log('  jitter    best bend   expected');
for (const ms of [10, 25, 40, 70, 120]) {
  let b = { e: -1 };
  for (const bd of [0.2, 0.4, 0.6, 0.8, 1.0]) {
    const r = evaluate('Lacerta', bd, ms);
    if (r.expected > b.e) b = { e: r.expected, bd };
  }
  console.log(`  ${String(ms).padStart(3)} ms      ${f2(b.bd)}        ${f0(b.e).padStart(4)} m`);
}

console.log('\nDOES THE WIND STILL CHANGE THE ANSWER?  Lacerta, best bend and release');
console.log('  wind    best bend   release   expected');
for (const w of [-12, -6, 0, 3]) {
  let b = { e: -1 };
  for (const bd of [0.2, 0.4, 0.6, 0.8, 1.0]) {
    const r = evaluate('Lacerta', bd, W.JITTER_MS, w);
    if (r.expected > b.e) b = { e: r.expected, bd, u: r.u };
  }
  console.log(`  ${String(w).padStart(3)}     ${f2(b.bd)}        u ${f2(b.u)}     ${f0(b.e).padStart(4)} m`);
}

console.log(`
READ IT LIKE THIS
  expected best bend INTERIOR  -> the player chooses how much precision to
                                  gamble for how much distance. That is the
                                  Pingu loop and it is what was missing.
  a steep fall-off either side -> there is something to get better AT, which a
                                  drag you can take five seconds over does not
                                  have at any peak sharpness.
  steadier hand -> more bend   -> the skill ceiling is real: improving lets you
                                  spend the improvement on more risk.
  wind still moves it          -> the judgement already built survives, rather
                                  than being replaced by reflex.`);

// ===========================================================================
// VARIANT B — AIM STAYS A CHOICE, TIMING ONLY BUYS SPEED
//
// Variant A above collapsed the game. Taking the launch angle from the release
// instant means angle and speed are one degree of freedom, so the player can no
// longer choose a steep launch on a calm day: best release sat at u = 0.35 for
// every wind from -12 to +3, and the best draw pinned at 0.33 regardless. It
// added a timing skill by DELETING the judgement, which is not the trade asked
// for.
//
// So: aim the fork first, by drag, untimed — wind still decides that, exactly
// as now. The whip then sweeps, and the release instant sets only HOW MUCH OF
// ITS SPEED you take, peaking as it passes upright.
//
// The reason that is a skill rather than "tap at the top" is already in the
// game: more launch speed is NOT better. Past what the airframe takes, the wing
// strains and permanently loses lift and gains drag, which is why the best draw
// today is 0.51 on Lacerta and not 1.0. So there is a SPEED YOU WANT, and it is
// not the maximum — which makes the target a precise instant with punishment on
// both sides, and makes a harder bend genuinely riskier because the same
// millisecond of error moves the speed further.
// ===========================================================================
function launchB(bend, u, pull, m, angleDeg) {
  const phi0 = W.PHI_MAX * bend;
  const vFork = W.R * phi0 * W.OMEGA * Math.sin(Math.PI * u);
  const E = M.CFG.E_MIN + (M.CFG.E_MAX - M.CFG.E_MIN) * Math.max(0, Math.min(1, pull));
  const vBand = Math.sqrt(2 * E / m);
  const stroke = M.CFG.STROKE + W.R * phi0 * (1 - Math.cos(Math.PI * u));
  return { angleDeg, v0: vFork + vBand, stroke };
}
const flyB = (p, bend, u, pull, ang, wind = 0) => {
  const L = launchB(bend, u, pull, p.m, ang);
  return M.fly(p, ang, pull, { wind, v0: L.v0, stroke: L.stroke }).dist;
};

function evalB(plane, bend, ms, wind = 0, samples = 400) {
  const p = M.build(plane);
  let best = { d: -1 };
  for (let ai = 0; ai <= 24; ai++) {
    const ang = M.CFG.ANG_MIN + (M.CFG.ANG_MAX - M.CFG.ANG_MIN) * (ai / 24);
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      for (let j = 0; j <= 8; j++) {
        const pull = j / 8;
        const d = flyB(p, bend, u, pull, ang, wind);
        if (d > best.d) best = { d, u, pull, ang };
      }
    }
  }
  const rnd = mulberry(20260821);
  const got = [];
  for (let s = 0; s < samples; s++) {
    const u = Math.max(0, Math.min(1, best.u + jitterU(rnd, ms)));
    got.push(flyB(p, bend, u, best.pull, best.ang, wind));
  }
  return { best: best.d, expected: mean(got), u: best.u, pull: best.pull, ang: best.ang };
}

console.log('\n\n=== VARIANT B — aim is still chosen; timing only buys speed ===\n');
console.log('IS THE EXPECTED BEST BEND INTERIOR?  Lacerta, still air');
console.log('  bend   best   expected   cost of being human   aim / release / draw');
let rb = [];
for (const b of [0.2, 0.4, 0.6, 0.8, 1.0]) {
  const r = evalB('Lacerta', b, W.JITTER_MS);
  rb.push({ b, ...r });
  console.log(`  ${f2(b)}   ${f0(r.best).padStart(4)} m  ${f0(r.expected).padStart(6)} m` +
    `        ${pct(1 - r.expected / r.best).padStart(4)}          ${r.ang.toFixed(0)}° / u ${f2(r.u)} / ${f2(r.pull)}`);
}
const bB = rb.reduce((a, r) => (r.best > a.best ? r : a));
const eB = rb.reduce((a, r) => (r.expected > a.expected ? r : a));
console.log(`\n  best-case wants bend ${f2(bB.b)}   |   EXPECTED wants bend ${f2(eB.b)}`);
console.log(eB.b > 0.2 && eB.b < 1.0
  ? '  -> INTERIOR. Bend is a risk dial the player sets to their own hands.'
  : '  -> still on a wall.');

console.log('\nDOES THE WIND STILL MOVE THE AIM?  Lacerta');
console.log('  wind    aim    bend   release   expected');
for (const w of [-12, -6, 0, 3]) {
  let b = { e: -1 };
  for (const bd of [0.2, 0.4, 0.6, 0.8, 1.0]) {
    const r = evalB('Lacerta', bd, W.JITTER_MS, w);
    if (r.expected > b.e) b = { e: r.expected, bd, u: r.u, ang: r.ang };
  }
  console.log(`  ${String(w).padStart(3)}    ${b.ang.toFixed(0).padStart(3)}°   ${f2(b.bd)}    u ${f2(b.u)}    ${f0(b.e).padStart(4)} m`);
}

console.log('\nHOW SHARP IS THE PEAK?  bend 0.6');
{
  const p = M.build('Lacerta');
  const r = evalB('Lacerta', 0.6, W.JITTER_MS);
  for (const dms of [0, 15, 30, 50, 80]) {
    const du = (dms / 1000) / sweepTime();
    const lo = flyB(p, 0.6, Math.max(0, r.u - du), r.pull, r.ang);
    const hi = flyB(p, 0.6, Math.min(1, r.u + du), r.pull, r.ang);
    console.log(`   ${String(dms).padStart(3)} ms early / late   ${f0(lo).padStart(4)} m / ${f0(hi).padStart(4)} m` +
      `   (${pct(lo / r.best)} / ${pct(hi / r.best)})`);
  }
}

console.log('\nDOES A STEADIER HAND PAY?');
console.log('  jitter   best bend   expected');
for (const ms of [10, 25, 40, 70, 120]) {
  let b = { e: -1 };
  for (const bd of [0.2, 0.4, 0.6, 0.8, 1.0]) {
    const r = evalB('Lacerta', bd, ms);
    if (r.expected > b.e) b = { e: r.expected, bd };
  }
  console.log(`  ${String(ms).padStart(3)} ms     ${f2(b.bd)}       ${f0(b.e).padStart(4)} m`);
}
