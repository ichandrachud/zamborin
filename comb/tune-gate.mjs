#!/usr/bin/env node
/* ============================================================
   Comb · THE GATE  (build brief §6)
   ============================================================

   Does a level need planning, or does a mindless scan-order placement fill it?

   Three bots on the same generated levels, no renderer attached:

     Bot G  greedy    first piece in tray order that fits anywhere, first
                      fitting position in scan order, never backtrack.
                      Exactly the brief.
     Bot P  planner   backtracking exact cover, tray window ignored.
                      Must be 100% or the generator is broken.

   And a third that is NOT IN THE BRIEF, labelled everywhere it appears:

     Bot L  no-strand greedy   Bot G plus one look: never take a placement
                               that leaves an island too small for any piece.
     Bot C  most-constrained    always fills the tightest hole first, which is
                                what a person actually does. Reports the share
                                of placements that were FORCED — one option
                                only — and what the rest cost in pick-ups.

   The reason Bot L is here. Bot G measures whether MINDLESS play wins. It
   does not measure whether the game is hard, because the single most obvious
   human heuristic — do not leave a hole nothing fits — is not in it. If Bot G
   fails everywhere and Bot L sails through, the levels punish only a bot, the
   gate passes, and the game ships trivial. A pass and a false pass are
   indistinguishable without this row.

   Before any of that, three self-checks run, because a failing check here has
   been the check six times in one week:
     - polyhex counts against the known sequence 1, 3, 11, 44, 186, 814
     - the axial neighbour vectors against the brief's literal odd-row table
     - the constructive replay of every level, which is the actual proof of
       solvability that no search can give

   Usage
     node comb/tune-gate.mjs
     node comb/tune-gate.mjs --extra=200 --tiers=14
     node comb/tune-gate.mjs --show=3          print a board from tier 3
     node comb/tune-gate.mjs --catalogue       print the catalogue and stop
*/
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const G = require('./gen.js');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
/* 200 is a floor, not a taste. Adjacent rungs late in the ladder sit about six
   points apart, and resolving six points on a proportion near 0.2 needs a few
   hundred samples: at 100 the monotonicity criterion flipped between runs on
   noise alone, reporting a curve bug that was not there. The check below now
   says so rather than failing silently, but the default is set where the
   answer is stable. */
const EXTRA  = parseInt(args.extra, 10) || 200;
const NTIERS = parseInt(args.tiers, 10) || G.TIERS.length;

const pc = n => (n * 100).toFixed(1) + '%';
const pad = (s, n) => String(s).padStart(n);

/* ============================================================
   Self-checks
   ============================================================ */
function selfChecks() {
  const fails = [];

  // 1. The enumerator. Fixed polyhexes up to translation: 1, 3, 11, 44, 186, 814.
  const KNOWN = [null, 1, 3, 11, 44, 186, 814];
  const bySize = G.enumeratePolyhexes(6);
  const counts = [];
  for (let n = 1; n <= 6; n++) {
    counts.push(bySize[n].length);
    if (bySize[n].length !== KNOWN[n]) {
      fails.push(`polyhex count n=${n}: got ${bySize[n].length}, known ${KNOWN[n]}`);
    }
  }
  console.log(`  enumerator      n=1..6 -> ${counts.join(', ')}   (known 1, 3, 11, 44, 186, 814)`);

  // 2. The odd-row table. The game works in axial; the brief specifies offset.
  //    Every hex bug is an off-by-one here, so assert they agree on every cell
  //    of the region rather than trusting the derivation.
  let checked = 0, mismatch = 0;
  for (let r = 0; r < G.TUNE.rows; r++) {
    for (let c = 0; c < G.TUNE.cols; c++) {
      const [q, ar] = G.axialFromOffset(c, r);
      const fromAxial = G.AX_DIRS
        .map(d => G.offsetFromAxial(q + d[0], ar + d[1]).join(','))
        .sort();
      const fromBrief = G.neighborsOffset(c, r).map(p => p.join(',')).sort();
      checked++;
      if (fromAxial.join(' | ') !== fromBrief.join(' | ')) {
        mismatch++;
        if (mismatch === 1) {
          fails.push(`neighbour tables disagree at offset (${c},${r}): axial ${fromAxial} vs brief ${fromBrief}`);
        }
      }
    }
  }
  console.log(`  neighbours      ${checked} cells, ${mismatch} disagreements between axial and the brief's odd-row table`);

  // 3. Round trip.
  let rt = 0;
  for (let r = -4; r < 20; r++) for (let c = -4; c < 12; c++) {
    const [q, ar] = G.axialFromOffset(c, r);
    const [c2, r2] = G.offsetFromAxial(q, ar);
    if (c2 !== c || r2 !== r) rt++;
  }
  if (rt) fails.push(`offset<->axial round trip failed on ${rt} cells`);
  console.log(`  round trip      384 cells, ${rt} failures`);

  return fails;
}

/* ============================================================
   The catalogue, drawn
   ============================================================ */
function showCatalogue() {
  console.log(`\nCATALOGUE  ${G.CATALOGUE.length} pieces\n`);
  for (let size = G.TUNE.pieceMin; size <= G.TUNE.pieceMax; size++) {
    const of = G.CATALOGUE.filter(s => s.size === size);
    console.log(`  size ${size} — ${of.length} shapes`);
    // Draw them side by side, four to a row.
    for (let i = 0; i < of.length; i += 4) {
      const group = of.slice(i, i + 4);
      const blocks = group.map(s => G.asciiShape(s).split('\n'));
      const h = Math.max(...blocks.map(b => b.length));
      for (let line = 0; line < h; line++) {
        console.log('    ' + blocks.map(b => (b[line] || '').padEnd(16)).join(' '));
      }
      console.log('    ' + group.map(s => `#${s.id} box ${s.w}x${s.h}`.padEnd(16)).join(' '));
      console.log('');
    }
  }
}

/* ============================================================
   One tier's worth of levels
   ============================================================ */
function runTier(tierIdx, seeds) {
  const r = {
    tier: tierIdx, made: 0, failedGen: 0,
    g: 0, l: 0, p: 0, c: 0, constructive: 0, budgetHit: 0,
    par: [], cells: [], distinct: [], genMs: [], forced: [], pickups: [],
  };
  for (const seed of seeds) {
    const t0 = process.hrtime.bigint();
    // A shipped seed IS a level number, and shipped levels come off the ladder
    // so the gate measures what the player is handed.
    const lv = (seed <= 100 && G.tierOf(seed) === tierIdx)
      ? G.shippedLevel(seed) : G.makeLevel(seed, tierIdx);
    const t1 = process.hrtime.bigint();
    if (!lv) { r.failedGen++; continue; }
    r.made++;
    r.genMs.push(Number(t1 - t0) / 1e6);
    r.par.push(lv.par);
    r.cells.push(lv.n);
    r.distinct.push(lv.distinctShapes / lv.par);

    if (G.verifyConstructive(lv).ok) r.constructive++;
    if (G.botGreedy(lv).solved) r.g++;
    if (G.botLookahead(lv).solved) r.l++;
    const c = G.botConstrained(lv, { cap: 600 });
    if (c.solved) { r.c++; r.pickups.push(c.pickups); if (isFinite(c.forcedShare)) r.forced.push(c.forcedShare); }
    const p = G.botPlanner(lv);
    if (p.solved) r.p++;
    if (p.budgetHit) r.budgetHit++;
  }
  return r;
}

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const maxOf = a => (a.length ? Math.max(...a) : 0);

/* ============================================================
   Run
   ============================================================ */
console.log('\nCOMB · GATE');
console.log('='.repeat(96));
console.log('\nSELF-CHECKS');
const fails = selfChecks();
if (fails.length) {
  console.log('\n  FAILED:');
  for (const f of fails) console.log('    ' + f);
  console.log('\n  A broken lattice makes every number below meaningless. Stopping.\n');
  process.exit(1);
}
console.log('  all clear\n');

if (args.catalogue) { showCatalogue(); process.exit(0); }

// Determinism: the same seed twice, byte for byte.
{
  const a = G.makeLevel(7, 4), b = G.makeLevel(7, 4);
  const sig = lv => lv.board.join(',') + '#' + lv.queue.map(p => p.shape + '@' + p.t.join(':')).join(',');
  console.log(`DETERMINISM     same seed twice: ${sig(a) === sig(b) ? 'identical' : 'DIFFERENT — generation is not seeded'}`);
}

const tiers = [];
for (let t = 0; t < NTIERS; t++) {
  // The 100 shipped levels use the first ten rungs, ten seeds each; every rung
  // additionally gets EXTRA fresh seeds so a tier's number is not ten samples.
  const shipped = t < 10 ? Array.from({ length: 10 }, (_, i) => t * 10 + i + 1) : [];
  const extra = Array.from({ length: EXTRA }, (_, i) => 100000 + t * 1000 + i);
  tiers.push(runTier(t, shipped.concat(extra)));
}

console.log(`\nTIER CURVE      ${EXTRA} extra seeds per tier, plus the 100 shipped levels on tiers 1-10`);
console.log('-'.repeat(96));
console.log('  tier  cells   par   genFail   Bot G     Bot L*    Bot C*   forced*  pickups*   Bot P  constructive   gen ms');
for (const r of tiers) {
  const n = r.made || 1;
  console.log(
    '  ' + pad(r.tier + 1, 4) +
    pad(Math.round(mean(r.cells)), 7) +
    pad(mean(r.par).toFixed(1), 6) +
    pad(r.failedGen, 10) +
    pad(pc(r.g / n), 8) +
    pad(pc(r.l / n), 10) +
    pad(pc(r.c / n), 9) +
    pad(pc(mean(r.forced)), 9) +
    pad(mean(r.pickups).toFixed(1), 10) +
    pad(pc(r.p / n), 8) +
    pad(pc(r.constructive / n), 14) +
    pad(mean(r.genMs).toFixed(1) + '/' + maxOf(r.genMs).toFixed(0), 11));
}
console.log('  * Bot L is not in the brief. See the header.');

/* ---------- pass criteria ---------- */
console.log('\nPASS CRITERIA');
console.log('-'.repeat(96));
const rate = r => r.g / (r.made || 1);
const t3plus = tiers.slice(2, 10);
const gT3 = t3plus.reduce((a, r) => a + r.g, 0) / Math.max(1, t3plus.reduce((a, r) => a + r.made, 0));
const gT1 = rate(tiers[0]);
const pAll = tiers.reduce((a, r) => a + r.p, 0) / Math.max(1, tiers.reduce((a, r) => a + r.made, 0));
const cAll = tiers.reduce((a, r) => a + r.constructive, 0) / Math.max(1, tiers.reduce((a, r) => a + r.made, 0));

/* A rise between two rungs only counts if it is bigger than the noise in the
   two samples that produced it. Without this the criterion answers a question
   about the SAMPLE and not about the curve, and it flips run to run. */
const seP = (p, n) => Math.sqrt(Math.max(1e-12, p * (1 - p) / Math.max(1, n)));
let mono = true;
const breaks = [], noisy = [];
let worstResolve = 0;
for (let i = 1; i < Math.min(10, tiers.length); i++) {
  const a = rate(tiers[i - 1]), b = rate(tiers[i]);
  const sd = Math.sqrt(seP(a, tiers[i - 1].made) ** 2 + seP(b, tiers[i].made) ** 2);
  worstResolve = Math.max(worstResolve, 2 * sd);
  if (b > a + 2 * sd) { mono = false; breaks.push(`${i}->${i + 1}`); }
  else if (b > a) noisy.push(`${i}->${i + 1}`);
}
const ceilIdx = tiers.findIndex(r => rate(r) < 0.15);

const row = (label, got, pass, note) =>
  console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label.padEnd(46) + String(got).padEnd(16) + (note || ''));

row('Bot G on tiers 3-10, target < 45%', pc(gT3), gT3 < 0.45, gT3 > 0.60 ? 'above 60%: levels are too loose' : '');
row('Bot P solves, target 100%', pc(pAll), pAll >= 0.9999, 'generator check');
row('constructive replay, target 100%', pc(cAll), cAll >= 0.9999, 'the real solvability proof');
row('Bot G at tier 1, target > 85%', pc(gT1), gT1 > 0.85, 'the tutorial must be gentle');
row('Bot G falls monotonically, tiers 1-10', mono ? 'yes' : 'no', mono,
  breaks.length ? 'rises at ' + breaks.join(', ') + ', beyond noise'
                : (noisy.length ? 'rises at ' + noisy.join(', ') + ' are inside the noise' : ''));
console.log(`        this run resolves a gap of ${(worstResolve * 100).toFixed(1)} points between adjacent rungs;`);
console.log(`        the tightest real gap in the ladder is about 6. Raise --extra if that is not comfortable.`);
row('a tier with Bot G < 15%, within 14', ceilIdx < 0 ? 'none' : 'tier ' + (ceilIdx + 1), ceilIdx >= 0 && ceilIdx < 14,
  ceilIdx < 0 ? 'the dials top out; rotation is the fourth dial' : '');

console.log('\nNOT A PASS CRITERION, BUT THE ONE THAT DECIDES WHETHER THIS IS A GAME');
const lT3 = t3plus.reduce((a, r) => a + r.l, 0) / Math.max(1, t3plus.reduce((a, r) => a + r.made, 0));
const lLast = tiers.length ? tiers[Math.min(9, tiers.length - 1)] : null;
console.log(`  Bot L on tiers 3-10:  ${pc(lT3)}     Bot L at tier ${Math.min(10, tiers.length)}: ${pc(lLast.l / (lLast.made || 1))}`);
console.log('  If Bot L is near 100% while Bot G is low, the levels punish only a bot and the');
console.log('  gate has passed on a technicality. One look ahead is not planning.');
const cT = tiers.slice(0, 10);
const cRate = cT.reduce((a, r) => a + r.c, 0) / Math.max(1, cT.reduce((a, r) => a + r.made, 0));
const fShare = mean(cT.flatMap(r => r.forced));
const pkMean = mean(cT.flatMap(r => r.pickups));
console.log(`\n  Bot C over tiers 1-10: solves ${pc(cRate)}, ${pc(fShare)} of its placements FORCED, ${pkMean.toFixed(2)} pick-ups.`);
console.log('  This is the row that says whether Comb is a puzzle. Greedy has to fail and');
console.log('  reasoning has to win. If Bot C also collapses, the level is not hard, it is');
console.log('  a search, and no amount of tiering fixes that.');

/* ---------- VARIETY, and why it is a pass criterion now ----------
   The owner played levels 1 to 9 and said they were the same level. They very
   nearly were: tier 1 had four distinct outlines and ONE piece set across its
   ten levels. Everything above passed while that was true, because every row
   asks how HARD a level is and none asked whether two levels differ.

   A tier ships ten levels. If it cannot produce ten different ones, it is one
   level shown ten times, and no difficulty curve saves that. */
console.log('\n\nVARIETY — can a tier produce ten different levels?');
console.log('-'.repeat(96));
console.log('  tier   outlines   piece sets   distinct levels   worst repeat');
let varietyFails = [], worstRun = 1, ladderDupes = 0;
{
  let prevSig = null;
  for (let t = 0; t < Math.min(10, NTIERS); t++) {
    const o = new Set(), sh = new Set(), c = new Set();
    let run = 1, best = 1;
    for (let n = t * 10 + 1; n <= t * 10 + 10; n++) {
      const lv = G.shippedLevel(n);
      if (!lv) { varietyFails.push(`level ${n} does not generate`); prevSig = null; continue; }
      const sig = G.levelSig(lv);
      const half = sig.split('#');
      o.add(half[0]); sh.add(half[1]); c.add(sig);
      if (sig === prevSig) { ladderDupes++; run++; if (run > best) best = run; } else run = 1;
      prevSig = sig;
    }
    if (best > worstRun) worstRun = best;
    const bad = c.size < 7;
    if (bad) varietyFails.push(`tier ${t + 1} makes only ${c.size} different levels out of 10`);
    console.log('  ' + pad(t + 1, 4) + pad(o.size + '/10', 11) + pad(sh.size + '/10', 13) +
                pad(c.size + '/10', 18) + pad(best > 1 ? best + ' in a row' : 'none', 15) +
                (bad ? '   <- too few' : ''));
  }
}
row('every tier makes 7+ different levels of 10', varietyFails.length ? varietyFails.length + ' short' : 'yes',
    varietyFails.length === 0, varietyFails[0] || '');
row('no level repeats the one before it', ladderDupes === 0 ? 'none' : ladderDupes + ' pairs',
    ladderDupes === 0, 'the ladder de-duplicates consecutive levels');

if (args.show !== undefined) {
  const t = parseInt(args.show, 10) || 0;
  const lv = G.makeLevel(424242, t);
  console.log(`\nSAMPLE  tier ${t + 1}, ${lv.n} cells, par ${lv.par}, ${lv.distinctShapes} distinct shapes\n`);
  console.log('  outline');
  console.log(G.asciiBoard(lv).split('\n').map(s => '    ' + s).join('\n'));
  console.log('\n  solution');
  console.log(G.asciiBoard(lv, G.fillsOf(lv)).split('\n').map(s => '    ' + s).join('\n'));
}
console.log('');
