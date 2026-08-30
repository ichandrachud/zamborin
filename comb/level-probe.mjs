#!/usr/bin/env node
/* ============================================================
   Comb · PER-LEVEL PROBE
   ============================================================

   The gate measures TIERS, on the gate's own seeds, ten samples a rung. A
   player does not play a tier. They play level 1, then level 2, and what they
   feel is the sequence. Two things the gate cannot see by construction:

     - the PACE. tierOf decides how many levels sit on a rung. A ladder that
       falls beautifully per-rung still feels flat if each rung is ten levels
       long.
     - what a CARELESS player experiences on THIS level. Bot G is
       deterministic, so per shipped level it is a coin that has already been
       flipped: 1 or 0, no gradient.

   So this adds one bot the gate does not have:

     Bot R  random play   uniformly random legal (slot, placement) until stuck
                          or done, N times. The share that finishes is the
                          real "can you win this without thinking" number, and
                          unlike Bot G it is continuous on a single level.

   NULL TEST FIRST, because a check that fails everywhere is usually the
   check. Bot R must read ~100% on a board built to be untriggerable (a single
   piece), and it must fall as the ladder rises. If either is false the number
   below is decoration.
============================================================ */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const G = require('./gen.js');

const RUNS = Number(process.env.RUNS || 300);
const UPTO = Number(process.env.UPTO || 30);

/* Bot R — uniformly random legal play. */
function botRandom(level, rng, tune) {
  const t = tune || G.TUNE;
  const occ = new Uint8Array(level.n);
  const placedMask = new Uint8Array(level.queue.length);
  let placed = 0;
  for (;;) {
    const all = [];
    for (const qi of G.visibleSlots(level, placedMask, t.traySize)) {
      for (const p of G.legalPlacements(level, level.queue[qi].shape, occ)) all.push({ qi, p });
    }
    if (!all.length) return { solved: placed === level.queue.length, placed };
    const c = all[Math.floor(rng.float() * all.length)];
    for (const i of c.p.idx) occ[i] = 1;
    placedMask[c.qi] = 1; placed++;
    if (placed === level.queue.length) return { solved: true, placed };
  }
}

function randomRate(level, seed, runs) {
  const rng = G.makeRng(seed);
  let ok = 0;
  for (let i = 0; i < runs; i++) if (botRandom(level, rng).solved) ok++;
  return ok / runs;
}

const pc = x => (x * 100).toFixed(0).padStart(3) + '%';
const pad = (s, n) => String(s).padEnd(n);

/* ---------- null test ---------- */
console.log('NULL TEST — Bot R must read high where nothing can go wrong,');
console.log('and low where the gate says the ladder is hard.\n');
{
  // A level whose queue is one piece: random play cannot lose.
  const lv1 = G.shippedLevel(1);
  const one = { ...lv1, queue: lv1.queue.slice(0, 1), solution: lv1.solution.slice(0, 1) };
  // Rebuild a board of exactly that one piece's cells so it is a true tiling.
  const idx = new Set(lv1.solution[0].idx);
  const trivialOK = randomRate({ ...one, n: lv1.n }, 12345, 200);
  console.log('  one-piece queue (expect 100%):        ' + pc(trivialOK));
}
{
  const easy = randomRate(G.shippedLevel(1), 777, RUNS);
  const hardLv = G.shippedLevel(100);
  const hard = randomRate(hardLv, 777, RUNS);
  console.log('  shipped level 1   (expect highest):   ' + pc(easy));
  console.log('  shipped level 100 (expect far lower): ' + pc(hard));
  console.log('  ' + (hard < easy ? 'OK — the probe can tell them apart.'
                                  : 'BROKEN — probe reports no gradient; ignore everything below.'));
}

/* ---------- the ladder as played ---------- */
console.log('\nTHE LADDER AS PLAYED  (' + RUNS + ' random runs per level)\n');
console.log('  lvl  rung  cells  pieces  Bot R    Bot G   first-try  Bot C  pickups  forced');
let prevRung = -1;
for (let n = 1; n <= UPTO; n++) {
  const lv = G.shippedLevel(n);
  const rung = G.tierOf(n) + 1;
  if (rung !== prevRung && prevRung !== -1) console.log('  ' + '-'.repeat(66));
  prevRung = rung;
  const r = randomRate(lv, 9001 + n, RUNS);
  const g = G.botGreedy(lv).solved;
  const ft = G.botConstrained(lv, { cap: 0 }).solved;
  const c = G.botConstrained(lv, { cap: 4000 });
  console.log(
    '  ' + pad(n, 5) + pad(rung, 6) + pad(lv.n, 7) + pad(lv.queue.length, 8) +
    pad(pc(r), 9) + pad(g ? 'yes' : ' no', 8) + pad(ft ? 'yes' : ' no', 11) +
    pad(c.solved ? 'yes' : ' no', 7) + pad(c.pickups, 9) +
    (isFinite(c.forcedShare) ? pc(c.forcedShare) : '  -')
  );
}

/* ---------- the summary that matters ---------- */
const rows = [];
for (let n = 1; n <= UPTO; n++) {
  rows.push({ n, rung: G.tierOf(n) + 1, r: randomRate(G.shippedLevel(n), 9001 + n, RUNS) });
}
const first10 = rows.filter(x => x.n <= 10).map(x => x.r);
const first20 = rows.filter(x => x.n <= 20).map(x => x.r);
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
console.log('\n  mean Bot R over levels 1-10:  ' + pc(mean(first10)));
console.log('  mean Bot R over levels 1-20:  ' + pc(mean(first20)));
console.log('  rungs used by levels 1-20:    ' + [...new Set(rows.filter(x => x.n <= 20).map(x => x.rung))].join(', '));
