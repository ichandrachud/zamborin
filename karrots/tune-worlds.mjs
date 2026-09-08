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

/* The bands are what the honest pool can actually supply, not a wish. Of 1,047
   boards forged on 10x7, 123 survived the wandering test: 25 at par 4 and two
   above 20. So the ceiling is 24 and the mass is low, and the bands are cut to
   fit that shape - each starting above the last one's floor and ending above
   its ceiling, so finishing a world lands you somewhere already harder than
   where that world began. */
const BANDS = {
  woods:  [4, 8],
  arctic: [6, 11],
  road:   [8, 15],
  ocean:  [11, 24],
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

/* ALLOCATE DEEPEST WORLD FIRST. Picking in play order let the woods and the
   road take the scarce deep boards on their way past, and the ocean - which
   needs them most - was left choosing between par 5 boards and nothing. There
   are 25 honest boards at par 4 and two above 20; the deep end is the resource
   to ration, so the world with the highest band chooses first and the ids are
   assigned afterwards in play order. */
const worlds = {}; let missing = 0;
for (const w of [...ORDER].reverse()) {
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
  worlds[w] = picked.map((o, i) => ({ n: i + 1, rows: o.rows, note: note(o) }));
  worlds[w].pars = picked.map(o => o.par);
}
let id = 0;
for (const w of ORDER) for (const lv of (worlds[w] || [])) lv.id = ++id;
if (missing) console.error(`\n${missing} slots could not be filled from this pool`);
for (const w of ORDER) {
  const pars = worlds[w].pars;
  console.log(`${w.padEnd(7)} ${worlds[w].length} levels, par ${pars[0]} to ${pars[pars.length - 1]}`);
  console.log(`        ${pars.join(', ')}`);
  delete worlds[w].pars;
}
writeFileSync(OUT, JSON.stringify(worlds, null, 1) + '\n');
console.log(`\nwritten to ${OUT}`);
