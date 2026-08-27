/* ============================================================
   BALLAST · Milestone 0 harness
   ------------------------------------------------------------
   The solver on its own, before any game is built on it.
   Answers four questions and nothing else:
     1. does a full pile settle inside 3 seconds
     2. is it actually still afterwards, or only nearly still
     3. is the same seed the same run, exactly
     4. what does a frame cost, and what is left at 4x slower
   Run: node ballast/tune-m0.mjs
   ============================================================ */
import { readFileSync } from 'fs';
import { performance } from 'perf_hooks';

const src = readFileSync(new URL('./phys.js', import.meta.url), 'utf8');
(0, eval)(src);
const { World, makeBody, makeRng, resetIds, TIER_R, PHYS } = globalThis.BallastPhys;

const DT = PHYS.DT;
const FRAME = 1 / 60;

/* A run: fill the vessel with `n` mixed-tier pieces, dropped one
   every `gap` seconds. gap is deliberately shorter than the
   game's 350ms minimum so this is a stress case, not a best one. */
function makeWorld(opts = {}) {
  resetIds();
  const w = new World({
    pivotX: 195, pivotY: 172,
    interiorW: 300, interiorH: opts.tall ? 700 : 410, rimY: 158,
    phys: opts.phys || {}
  });
  if (opts.lockTheta) { w.stepTilt = function () { this.computeCom(); }; }
  return w;
}

/* Height of the pile's top surface, in vessel-local y. Smaller is
   higher, because local y runs downward from the pivot. */
function pileTop(w) {
  // Only bodies already INSIDE the vessel count. A piece still falling
  // toward the rim sits above it by definition, and including it reads
  // as a full vessel after the very first drop.
  let top = w.floorY, o = {};
  for (const b of w.bodies) {
    w.toLocal(b.x, b.y, o);
    // Below the rim AND not still falling. A piece is admitted the
    // instant its centre crosses the rim plane, which it does at
    // 300px/s with the whole vessel still to fall through; counting
    // it reads as a full vessel after two drops.
    if (o.y < w.rimY) continue;
    if (b.vx * b.vx + b.vy * b.vy > 2500) continue;
    if (o.y - b.r < top) top = o.y - b.r;
  }
  return top;
}

/* Fill until the body count is reached OR the pile comes within
   `headroom` px of the rim, whichever happens first.

   The stop matters. 55 tier-0-3 circles do NOT fit in a 300x410
   vessel: randomly dropped polydisperse discs pack at about 0.63,
   not the 0.8 an optimal packing would give, so 55 of them want a
   pile 429px deep. They heap over the rim, where there is no wall,
   and roll out. Filling to the cap regardless was measuring the
   spill condition and calling it solver jitter. */
function fill(w, seed, n, gap, tiers = [0, 1, 2, 3], headroom = -1e9) {
  const rng = makeRng(seed);
  let t = 0, dropped = 0, nextDrop = 0;
  const maxT = 60;
  while (dropped < n && t < maxT) {
    if (t >= nextDrop) {
      if (pileTop(w) < w.rimY + headroom) break;
      const tier = tiers[Math.floor(rng() * tiers.length)];
      const lx = (rng() * 2 - 1) * (w.halfW - TIER_R[tier] - 2);
      const p = {};
      w.toWorld(lx, w.rimY - 30, p);
      if (w.add(makeBody(p.x, p.y, tier))) dropped++;
      nextDrop = t + gap;
    }
    w.step(FRAME);
    t += FRAME;
  }
  return { t, dropped };
}

/* Anything whose centre has left the interior has spilled. In the
   game that ends the run; here it just has to be counted, so that
   a spill is never read as jitter. */
function escapees(w) {
  const o = {};
  let n = 0;
  for (const b of w.bodies) {
    w.toLocal(b.x, b.y, o);
    if (o.y < w.rimY - b.r * 0.5 || Math.abs(o.x) > w.halfW + b.r * 0.5) n++;
  }
  return n;
}

/* Two different questions, kept apart.

   `still` is when the player stops seeing motion: the fastest body
   is under the sleep threshold and stays there. That is the number
   the 3-second requirement is about.

   `asleep` is when the solver has stopped working, which is `still`
   plus the mandatory SLEEP_TIME the sleep rule has to wait out
   before it may act. Reporting the second as if it were the first
   charges the pile half a second of bookkeeping as if it were
   half a second of wobble. */
function runUntilSettled(w, limit = 12) {
  let t = 0, still = Infinity;
  while (t < limit) {
    w.step(FRAME); t += FRAME;
    if (w.maxSpeed() < w.P.SLEEP_V) { if (still === Infinity) still = t; }
    else still = Infinity;
    if (w.awakeCount() === 0 && w.maxSpeed() < 1e-9) return { still, asleep: t };
  }
  return { still, asleep: Infinity };
}

function snapshot(w) { return w.bodies.map(b => ({ id: b.id, x: b.x, y: b.y })); }
function maxDrift(w, snap) {
  let m = 0;
  const by = new Map(snap.map(s => [s.id, s]));
  for (const b of w.bodies) {
    const s = by.get(b.id); if (!s) continue;
    const d = Math.hypot(b.x - s.x, b.y - s.y);
    if (d > m) m = d;
  }
  return m;
}

/* ---------- 1 + 2 : settle and jitter ---------- */
function settleAndJitter(label, lockTheta, opts = {}) {
  const rows = [];
  const nBodies = opts.n || 55;
  const headroom = opts.headroom != null ? opts.headroom : -1e9;
  const tiers = opts.tiers || [0, 1, 2, 3];
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const w = makeWorld({ lockTheta, tall: opts.tall });
    const f = fill(w, seed, nBodies, 0.12, tiers, headroom);
    const st = runUntilSettled(w);
    const settle = st.still, asleepAt = st.asleep;
    // 60 further seconds, split so that settling and jitter are not
    // conflated. Early drift while a fresh pile compacts is fine. Drift in
    // the LAST 20 seconds is jitter, and that is the number that matters.
    let peakSpeed = 0, sleptFrames = 0;
    const winFrames = Math.round(20 / FRAME);
    const snapAll = snapshot(w);
    let snapLate = null, driftLate = 0;
    for (let win = 0; win < 3; win++) {
      if (win === 2) snapLate = snapshot(w);
      for (let i = 0; i < winFrames; i++) {
        w.step(FRAME);
        const sp = w.maxSpeed(); if (sp > peakSpeed) peakSpeed = sp;
        if (w.awakeCount() === 0) sleptFrames++;
      }
    }
    driftLate = maxDrift(w, snapLate);
    rows.push({ seed, bodies: w.bodies.length, dropped: f.dropped, settle, asleepAt,
                drift: maxDrift(w, snapAll), driftLate, peakSpeed, esc: escapees(w),
                toppled: !!w.toppled,
                sleptPct: 100 * sleptFrames / (winFrames * 3) });
  }
  console.log(`\n--- ${label} ---`);
  console.log('seed  bodies  still(s)  asleep(s)  drift/60s   drift/last20s  peakSpeed(px/s)  fullyAsleep%  spilled');
  for (const r of rows) {
    console.log(
      String(r.seed).padEnd(6) +
      String(r.bodies).padEnd(8) +
      (r.settle === Infinity ? 'NEVER' : r.settle.toFixed(2)).padEnd(10) +
      (r.asleepAt === Infinity ? 'NEVER' : r.asleepAt.toFixed(2)).padEnd(11) +
      r.drift.toFixed(3).padEnd(12) +
      r.driftLate.toFixed(4).padEnd(15) +
      r.peakSpeed.toFixed(3).padEnd(17) +
      (r.sleptPct.toFixed(0) + '%').padEnd(14) +
      (r.toppled ? 'TOPPLED' : String(r.esc))
    );
  }
  /* A bowl that has gone over is not expected to settle, hold still, or
     sleep: its contents are in free fall. Every metric here has to be
     taken over the runs that stayed upright, or the harness reports the
     mechanic working as the solver failing. */
  const clean = rows.filter(r => r.esc === 0 && !r.toppled);
  const worstSettle = Math.max(...(clean.length ? clean : rows).map(r => r.settle));
  const worstDrift = Math.max(...(clean.length ? clean : rows).map(r => r.driftLate));
  const worstSpeed = Math.max(...(clean.length ? clean : rows).map(r => r.peakSpeed));
  const meanSlept = (clean.length ? clean : rows).reduce((a, r) => a + r.sleptPct, 0) / (clean.length || rows.length);
  const meanBodies = rows.reduce((a, r) => a + r.bodies, 0) / rows.length;
  const topples = rows.filter(r => r.toppled).length;
  console.log(`WORST (of the ${clean.length}/${rows.length} runs still upright; ${topples} toppled, which is the game working)  still ${worstSettle.toFixed(2)}s (pass <3)   jitter ${worstDrift.toFixed(4)}px in the last 20s (pass ~0)   peak ${worstSpeed.toFixed(3)}px/s   asleep ${meanSlept.toFixed(0)}% of frames   mean load ${meanBodies.toFixed(1)} bodies`);
  return { worstSettle, worstDrift, worstSpeed, meanSlept, meanBodies, spilled: rows.length - clean.length };
}

/* ---------- 3 : determinism ---------- */
function determinism() {
  console.log('\n--- determinism: same seed, twice, hashed every second ---');
  let ok = true;
  for (const seed of [11, 12, 13]) {
    const hashes = [[], []];
    for (let pass = 0; pass < 2; pass++) {
      const w = makeWorld({});
      fill(w, seed, 55, 0.12);
      for (let s = 0; s < 8; s++) {
        for (let i = 0; i < 60; i++) w.step(FRAME);
        hashes[pass].push(w.hash());
      }
    }
    const same = hashes[0].every((h, i) => h === hashes[1][i]);
    if (!same) ok = false;
    console.log(`seed ${seed}: ${same ? 'IDENTICAL' : 'DIVERGED'}  ${hashes[0].map(h => h.toString(16).padStart(8, '0')).join(' ')}`);
  }
  console.log(ok ? 'PASS: every seed reproduced exactly.' : 'FAIL: runs diverged.');
  return ok;
}

/* ---------- 4 : cost ---------- */
function cost() {
  console.log('\n--- frame cost at a full pile (solver only, no render) ---');
  const w = makeWorld({});
  fill(w, 21, 55, 0.12);
  // Worst realistic case is a full, MOVING pile, so wake it every
  // frame. A sleeping pile costs almost nothing and would flatter
  // the number.
  const N = 3000;
  // warm the JIT
  for (let i = 0; i < 600; i++) { w.wakeAll(); w.step(FRAME); }
  const samples = [];
  for (let i = 0; i < N; i++) {
    w.wakeAll();
    const t0 = performance.now();
    w.step(FRAME);
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const p50 = samples[Math.floor(N * 0.5)];
  const p99 = samples[Math.floor(N * 0.99)];
  const max = samples[N - 1];
  console.log(`bodies ${w.bodies.length}  contacts ~${w.stats.contacts}  pairChecks ${w.stats.pairChecks}  substeps/frame 2`);
  console.log(`mean ${mean.toFixed(3)}ms   p50 ${p50.toFixed(3)}ms   p99 ${p99.toFixed(3)}ms   max ${max.toFixed(3)}ms`);
  console.log(`budget at 60fps = 16.67ms.  At 4x slower CPU this frame costs p99 ${(p99 * 4).toFixed(2)}ms  -> ${p99 * 4 < 16.67 ? 'PASS' : 'FAIL'}`);
  return { mean, p50, p99, max };
}

/* ---------- broad phase: is the grid actually earning its place ---------- */
function broadphase() {
  console.log('\n--- broad phase: grid pairs vs n-squared ---');
  const w = makeWorld({});
  fill(w, 33, 55, 0.12);
  w.wakeAll(); w.step(FRAME);
  const n = w.bodies.length;
  console.log(`grid emits ${w.stats.pairChecks} candidate pairs/substep; n-squared would be ${n * (n - 1) / 2}`);
}

console.log('BALLAST — Milestone 0. Solver alone, no game.');
console.log(`PHYS: dt 1/${Math.round(1 / PHYS.DT)}  velIters ${PHYS.VEL_ITERS}  posIters ${PHYS.POS_ITERS}  baumgarte ${PHYS.BAUMGARTE}  slop ${PHYS.SLOP}  rest ${PHYS.RESTITUTION}  fric ${PHYS.FRICTION}  warmStart ${PHYS.WARM_START}`);
// The brief's stress case: 55 bodies, the body cap, in a static box
// deep enough that 55 genuinely fit. This is the solver's ceiling.
const a = settleAndJitter('A · STATIC BOX, 55 bodies at the cap (box deepened to 700 so they fit)', true, { tall: true });
// The state the game actually reaches: a tilting vessel filled to
// within 40px of the rim, which is where a real run lives.
const b = settleAndJitter('B · ROTATING VESSEL at playable fill (stop 40px below the rim)', false, { headroom: 40 });
// And with the big tiers present, which is a different packing problem.
const bigMix = settleAndJitter('C · ROTATING VESSEL, mixed tiers 0-6 (a late-run pile)', false, { headroom: 40, tiers: [0, 1, 2, 4, 5, 6] });
const det = determinism();
const c = cost();
broadphase();

console.log('\n================ MILESTONE 0 VERDICT ================');
const checks = [
  ['A still < 3s, 55 at cap',    a.worstSettle < 3,  `${a.worstSettle.toFixed(2)}s`],
  ['A no jitter over 20s',       a.worstDrift < 0.5, `${a.worstDrift.toFixed(4)}px`],
  ['A pile sleeps',              a.meanSlept > 50,   `${a.meanSlept.toFixed(0)}% of frames`],
  ['B still < 3s, tilting',      b.worstSettle < 3,  `${b.worstSettle.toFixed(2)}s`],
  ['B no jitter over 20s',       b.worstDrift < 0.5, `${b.worstDrift.toFixed(4)}px`],
  ['B pile sleeps',              b.meanSlept > 50,   `${b.meanSlept.toFixed(0)}% of frames`],
  ['C no jitter, big tiers',     bigMix.worstDrift < 0.5, `${bigMix.worstDrift.toFixed(4)}px`],
  ['C pile sleeps, big tiers',   bigMix.meanSlept > 50,   `${bigMix.meanSlept.toFixed(0)}% of frames`],
  ['deterministic',              det,                det ? 'exact' : 'diverged'],
  ['60fps at 4x throttle',       c.p99 * 4 < 16.67,  `${(c.p99 * 4).toFixed(2)}ms of 16.67`]
];
for (const [name, pass, val] of checks) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(30)} ${val}`);
console.log(checks.every(c => c[1]) ? '\nALL PASS.' : '\nSOMETHING FAILED — stop and tell the owner.');
