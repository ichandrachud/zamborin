#!/usr/bin/env node
/* ============================================================
   Comb · does ROTATION widen the band?  (build brief 3.2, 6)
   ============================================================

   The gated v1 measured a hard ceiling: past about 26 cells nothing solves a
   level except an exhaustive search, so all 100 levels sit at 9 to 17 cells
   and 3 to 4 pieces. The brief holds ROTATION in reserve as the fourth
   difficulty dial precisely for this. Six orientations per piece buys options
   without spending cells, which is the constraint that actually binds.

   The question is NOT "does rotation make it harder". More options per piece
   could as easily make it easier. The question is whether a bigger board stays
   DERIVABLE with rotation on:

     Bot G low     mindless play still fails
     Bot C high    most-constrained-cell reasoning still finishes
     pickups low   and finishes without grinding
     forced high   because one piece still closes the tightest hole

   Rotation is worth building only where all four hold at a cell count v1
   cannot reach. Run: node comb/rotation-probe.mjs
*/
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const G = require('./gen.js');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const N = parseInt(args.n, 10) || 120;

const pc = n => (n * 100).toFixed(0).padStart(4) + '%';
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const med = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : NaN; };

function measure(cells, pool, rots) {
  // Everything but `rotations` is held identical between the two arms, and the
  // seeds are the same seeds, so the only thing that changes is the dial.
  const tune = Object.assign({}, G.TUNE, { rotations: rots, tileNodes: 120000 });
  const irr = cells <= 12 ? 0.10 : Math.min(0.85, 0.10 + (cells - 12) * 0.05);
  const vb = pool <= 3 ? -0.80 : Math.min(1, -0.30 + pool * 0.09);
  const tiers = [{ cells, pool, sizes: [3, 6], varietyBias: vb, irregularity: irr }];
  let made = 0, g = 0, l = 0, cS = 0, capped = 0;
  const par = [], fs = [], pk = [], ms = [];
  for (let i = 0; i < N; i++) {
    const t0 = process.hrtime.bigint();
    const lv = G.makeLevel(1300000 + i, 0, { tiers, tune });
    const t1 = process.hrtime.bigint();
    if (!lv) continue;
    made++; par.push(lv.par); ms.push(Number(t1 - t0) / 1e6);
    if (G.botGreedy(lv, tune).solved) g++;
    if (G.botLookahead(lv, tune).solved) l++;
    const c = G.botConstrained(lv, { tune, cap: 800 });
    if (c.capped) capped++;
    else if (c.solved) { cS++; pk.push(c.pickups); if (isFinite(c.forcedShare)) fs.push(c.forcedShare); }
  }
  const n = made || 1;
  return { made, g: g / n, l: l / n, c: cS / n, par: mean(par), fs: mean(fs),
           pk: med(pk), capped, ms: mean(ms), maxMs: made ? Math.max(...ms) : 0 };
}

console.log('\nCOMB · ROTATION PROBE');
console.log('='.repeat(100));

// Sanity: a symmetric shape must reach fewer than six orientations, or the
// rotation itself is wrong.
const oriCounts = G.CATALOGUE.map(s => G.orientationsOf(s.cells, 6).length);
console.log(`\n  orientations per catalogue piece: ${oriCounts.join(' ')}`);
console.log(`  (all six would mean the dedupe is broken; a bar has 3, a triangle 2)`);
// A rotation applied six times must return the shape to itself.
let rtBad = 0;
for (const s of G.CATALOGUE) {
  let c = G.canon(s.cells);
  for (let i = 0; i < 6; i++) c = G.canon(G.rotate60(c));
  if (G.shapeKey(c) !== G.shapeKey(G.canon(s.cells))) rtBad++;
}
console.log(`  six turns return to start: ${rtBad === 0 ? 'yes, all 20' : 'NO on ' + rtBad + ' — the rotation is wrong'}\n`);
if (rtBad) process.exit(1);

console.log(`Same seeds, same dials, ${N} levels a row. Only the rotations dial changes.\n`);
console.log('              |            NO ROTATION (v1)            |          ROTATION, six per piece');
console.log(' cells pool   | par  BotG  BotC forced   pk  gen ms    | par  BotG  BotC forced   pk  gen ms   made');
for (const [cells, pool] of [[16,4],[20,6],[24,9],[28,12],[32,14],[36,20],[42,20],[48,20]]) {
  const a = measure(cells, pool, 1);
  const b = measure(cells, pool, 6);
  const fmt = r => `${r.par.toFixed(1).padStart(4)} ${pc(r.g)} ${pc(r.c)}${pc(r.fs)} ${String(isFinite(r.pk)?r.pk:'-').padStart(4)} ${r.ms.toFixed(1).padStart(5)}/${r.maxMs.toFixed(0).padStart(3)}`;
  console.log(`${String(cells).padStart(6)}${String(pool).padStart(5)}   |${fmt(a)}   |${fmt(b)}  ${String(b.made).padStart(4)}`);
}
console.log('\nRead the ROTATION half alone. It earns its build only where BotG is low AND');
console.log('BotC stays high on few pick-ups, at a cell count the left half cannot reach.');

/* ---------- the middle ground ----------
   Six is not the only setting. Allowing TWO or THREE orientations gives a
   piece more homes without giving it every home, and the orientation count is
   already a parameter, so it costs nothing to ask. Worth asking because the
   six-orientation column above trades the thing that makes Comb a puzzle --
   the forced placement -- for the thing that makes it solvable at size.

   Note on `forced`: with six times the placements, fewer cells have exactly
   one option almost mechanically, so a fall in the forced share is partly an
   artefact of counting. PICK-UPS are not: they are the bot actually undoing
   work, and they are the honest column. */
console.log('\n\nHOW MANY ORIENTATIONS?');
console.log('-'.repeat(100));
console.log(' cells pool  rots |  par   BotG   BotL   BotC  forced   pickups   capped   gen ms');
for (const [cells, pool] of [[16, 6], [20, 9], [24, 12]]) {
  for (const rots of [1, 2, 3, 6]) {
    const r = measure(cells, pool, rots);
    console.log(
      `${String(cells).padStart(6)}${String(pool).padStart(5)}${String(rots).padStart(6)} |`
      + `${r.par.toFixed(1).padStart(5)} ${pc(r.g)} ${pc(r.l)} ${pc(r.c)}${pc(r.fs)}`
      + `${String(isFinite(r.pk) ? r.pk : '-').padStart(9)}${String(r.capped).padStart(9)}`
      + `${r.ms.toFixed(1).padStart(9)}/${r.maxMs.toFixed(0)}`);
  }
  console.log('');
}

/* ---------- the null test for the `forced` column ----------
   The claim being made is that rotation costs DERIVABILITY. The obvious way
   for that claim to be wrong is if `forced` just falls whenever there are more
   placements to choose from, whatever their source, in which case the column
   measures option count and not reasoning.

   So: hold rotation OFF and grow the POOL instead, which multiplies placements
   the other way. If forced holds up while placements rise, the fall under
   rotation is real and specific to rotation. If it falls the same way, the
   column is an artefact and the recommendation has to be withdrawn. */
console.log('\n\nNULL TEST — does `forced` fall whenever there are simply MORE placements?');
console.log('-'.repeat(100));
console.log('  Rotation OFF throughout. The pool grows instead, which also multiplies placements.');
console.log('\n cells pool  rots |  par   BotG   BotC  forced   pickups   placements/level');
for (const pool of [1, 2, 3, 6, 9, 14, 20]) {
  const r = measure(16, pool, 1);
  // How many legal placements does a fresh board actually offer?
  const tune = Object.assign({}, G.TUNE, { rotations: 1, tileNodes: 120000 });
  const tiers = [{ cells: 16, pool, sizes: [3, 6], varietyBias: pool <= 3 ? -0.8 : Math.min(1, -0.3 + pool * 0.09), irregularity: 0.3 }];
  let places = 0, k = 0;
  for (let i = 0; i < 30; i++) {
    const lv = G.makeLevel(1300000 + i, 0, { tiers, tune });
    if (!lv) continue;
    const occ = new Uint8Array(lv.n);
    let p = 0;
    for (const sid of new Set(lv.shapes)) p += G.legalPlacements(lv, sid, occ).length;
    places += p; k++;
  }
  console.log(
    `${String(16).padStart(6)}${String(pool).padStart(5)}${String(1).padStart(6)} |`
    + `${r.par.toFixed(1).padStart(5)} ${pc(r.g)} ${pc(r.c)}${pc(r.fs)}`
    + `${String(isFinite(r.pk) ? r.pk : '-').padStart(9)}${(places / Math.max(1, k)).toFixed(0).padStart(16)}`);
}
console.log('');
