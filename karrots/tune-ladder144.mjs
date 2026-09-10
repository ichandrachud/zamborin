/* Karrots — cut 144 levels out of the pool, four worlds of thirty six.
 *
 * THE FLOOR IS APPLIED AFTER THE BOMB, which is the bug this replaces. The
 * forge gated par before the bomb was placed and bombs mostly SHORTEN par, so
 * boards gated at par 4 shipped at par 2 and the whole woods collapsed to 2-4.
 * A player went through five levels in a minute.
 *
 * The owner's shape: a few par 4 boards to open, then it has to get
 * interesting rather than go through the motions. So par 4 is allowed but
 * RATIONED, and nothing below it ships at all.
 *
 * Deepest world picks first. The deep end is the scarce resource and picking
 * in play order lets the early worlds eat it, which starved the ocean the
 * first time this was cut.
 *
 * Run: node karrots/tune-ladder144.mjs   (after tune-bombs.mjs)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FLOOR      = Number(process.env.KFLOOR || 4);
const MAX_AT_MIN = Number(process.env.KMAXMIN || 5);   // how many par-4s may ship
const PER_WORLD  = 36;
const ORDER      = ['ocean', 'road', 'arctic', 'woods'];   // deepest first
const PLAY_ORDER = ['woods', 'arctic', 'road', 'ocean'];

const cands0 = JSON.parse(readFileSync('/tmp/cands144.json', 'utf8'));

/* THE SAME PAR, OVER AND OVER, IS THE THING BEING FIXED. The pool is
   lopsided - most boards land at par 4 to 10 and only 32 of 213 are deeper -
   so taking the lowest 36 per world gives a world that sits on one number.
   Cap how many levels may share a par and the ladder climbs instead. */
const CAP = Number(process.env.KCAP || 16);
const cands = [];
const usedAt = {};
for (const c of cands0.slice().sort((a, b) => a.par - b.par)) {
  if (c.par < FLOOR) continue;
  const cap = c.par === FLOOR ? MAX_AT_MIN : CAP;
  usedAt[c.par] = (usedAt[c.par] || 0) + 1;
  if (usedAt[c.par] > cap) continue;
  cands.push(c);
}
cands.sort((a, b) => a.par - b.par);

console.log(`pool: ${cands0.length} board+bomb pairs at par ${FLOOR}+`);
console.log(`      capped at ${CAP} per par (${MAX_AT_MIN} at the floor) -> ${cands.length} usable, need ${PER_WORLD * 4}`);
const usable = cands;
if (usable.length < PER_WORLD * 4) {
  console.log(`\nSHORT BY ${PER_WORLD * 4 - usable.length}. Forge more before cutting the ladder.`);
  const hist = {}; usable.forEach(c => hist[c.par] = (hist[c.par] || 0) + 1);
  console.log('what there is:', JSON.stringify(hist));
  process.exit(1);
}

let left = usable.slice();
const take = {};
for (const w of ORDER) {
  take[w] = (w === 'woods') ? left.slice(0, PER_WORLD) : left.slice(-PER_WORLD);
  const chosen = new Set(take[w]);
  left = left.filter(c => !chosen.has(c));
}

const out = {};
console.log('\nworld    n   par band      levels');
for (const w of PLAY_ORDER) {
  const ls = take[w].slice().sort((a, b) => a.par - b.par);
  const ps = ls.map(l => l.par);
  console.log(`  ${w.padEnd(7)} ${String(ls.length).padStart(2)}  ` +
    `${(ps[0] + ' to ' + ps[ps.length - 1]).padEnd(12)} ${ps.join(' ')}`);
  out[w] = ls.map((l, i) => ({ n: i + 1, rows: l.rows, bomb: l.bomb }));
}
writeFileSync('/tmp/worlds144.json', JSON.stringify(out, null, 1));
console.log('\nwritten to /tmp/worlds144.json');
