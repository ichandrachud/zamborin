/* Karrots — turning a forged pool into a world's ladder.
 *
 * The forge produces boards that are solvable by construction and reports the
 * par it measures with the animals PINNED to their starting squares. That is
 * not the number the player plays against: a pace step moves them, so the
 * player can wait for either to be standing somewhere else, and a board whose
 * two pars disagree can be beaten under its own advertised par. On the ladder
 * this replaced, six of eight could be.
 *
 * So every candidate is put through parWhileTheyWander (solve.mjs) twice -
 * with the predator rule and without it - and a board only survives if
 *
 *   · the wandering par equals the pinned par   (nobody is standing in a
 *     doorway holding the difficulty up), and
 *   · the wandering par beats the no-predator par   (he still matters).
 *
 * Run: node --max-old-space-size=8192 karrots/tune-ladder.mjs <pool.json> [out.json]
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const M = require('./model.js');
import { parWhileTheyWander } from './solve.mjs';

const IN = process.argv[2];
const OUT = process.argv[3] || '/tmp/karrots-honest.json';
if (!IN) { console.error('usage: tune-ladder.mjs <pool.json> [out.json]'); process.exit(1); }

const pool = JSON.parse(readFileSync(IN, 'utf8'));
const kept = [];
let t0 = Date.now(), dropped = { unsolved: 0, doorway: 0, foxIdle: 0 };
pool.forEach((o, n) => {
  const st = M.parse(o.rows, 'pool#' + n);
  const wander = parWhileTheyWander(st);
  if (wander === null) { dropped.unsolved++; return; }
  if (wander !== o.par) { dropped.doorway++; return; }
  const noFox = parWhileTheyWander(st, { fox: false });
  if (noFox === null || wander <= noFox) { dropped.foxIdle++; return; }
  kept.push({ ...o, par: wander, noFoxPar: noFox, foxDelta: wander - noFox });
  if (kept.length % 25 === 0) process.stderr.write(`  ${kept.length} kept of ${n + 1} seen\n`);
});
writeFileSync(OUT, JSON.stringify(kept));
const by = {}; kept.forEach(o => by[o.par] = (by[o.par] || 0) + 1);
console.log(`${pool.length} boards in, ${kept.length} survive  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
console.log(`  dropped: ${dropped.unsolved} unsolved in cap, ${dropped.doorway} lean on a doorway, ${dropped.foxIdle} do not need him`);
console.log('  honest par spread: ' + JSON.stringify(by));
console.log('  written to ' + OUT);
