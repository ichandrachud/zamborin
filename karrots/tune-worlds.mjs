/* Karrots — turning the honest pool into four worlds of levels.
 *
 * Input is the output of tune-ladder.mjs: boards whose par has been verified
 * to survive the animals wandering, and where the predator still changes the
 * answer. This picks the ladders.
 *
 * DIFFICULTY RISES WITHIN A WORLD AND ACROSS THE FOUR. Each world spans a
 * band, and each band starts above the last one's floor and ends above its
 * ceiling, so a player who finishes the woods meets an arctic level that is
 * already harder than where the woods began but not harder than where it
 * ended. Inside a band the pars are non-decreasing.
 *
 * Where two boards sit at the same par the tie goes to the one that punishes
 * the greedy route, then to the one the predator costs most, then to the one
 * with the most positions where one move loses and another does not.
 *
 * Run: node karrots/tune-worlds.mjs <honest.json> [out.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const IN = process.argv[2] || '/tmp/honest-big.json';
const OUT = process.argv[3] || new URL('./worlds.json', import.meta.url).pathname;
const PER_WORLD = Number(process.env.KPER || 24);

const BANDS = {
  woods:  [4, 12],
  arctic: [6, 16],
  road:   [8, 22],
  ocean:  [10, 30],
};
const ORDER = ['woods', 'arctic', 'road', 'ocean'];

const pool = JSON.parse(readFileSync(IN, 'utf8'));
const used = new Set();
const better = (a, b) =>
  (Number(b.naiveDies) - Number(a.naiveDies)) ||
  ((b.foxDelta || 0) - (a.foxDelta || 0)) ||
  ((b.branch || 0) - (a.branch || 0));

/** The nearest unused board at or above `par`, else the nearest below. */
function take(par) {
  let best = null;
  for (const o of pool) {
    if (used.has(o)) continue;
    const d = Math.abs(o.par - par) + (o.par < par ? 0.5 : 0);   // prefer at or above
    if (!best || d < best.d || (d === best.d && better(o, best.o) < 0)) best = { o, d };
  }
  if (!best) return null;
  used.add(best.o);
  return best.o;
}

const note = o => `par ${o.par} with him on the board and ${o.noFoxPar} without` +
  (o.naiveDies ? '; the short way round walks her straight into him.' : '.');

const worlds = {}; let id = 0, missing = 0;
for (const w of ORDER) {
  const [lo, hi] = BANDS[w];
  const targets = [];
  for (let i = 0; i < PER_WORLD; i++)
    targets.push(Math.round(lo + (hi - lo) * i / (PER_WORLD - 1)));
  const picked = [];
  for (const t of targets) {
    const o = take(t);
    if (!o) { missing++; continue; }
    picked.push(o);
  }
  picked.sort((a, b) => a.par - b.par || better(b, a));
  worlds[w] = picked.map((o, i) => ({ id: ++id, n: i + 1, rows: o.rows, note: note(o) }));
  const pars = picked.map(o => o.par);
  console.log(`${w.padEnd(7)} ${picked.length} levels, par ${pars[0]} to ${pars[pars.length - 1]}`);
  console.log(`        ${pars.join(', ')}`);
}
if (missing) console.error(`\n${missing} slots could not be filled from this pool`);
writeFileSync(OUT, JSON.stringify(worlds, null, 1) + '\n');
console.log(`\nwritten to ${OUT}`);
