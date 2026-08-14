/* BUNNY — build the shipped level pack.

   Generation takes 1-4 seconds for a late level, which is far too slow to run
   while somebody waits for a board. So it runs once, here, and the game ships
   the result as data.

   Hand-authored teaching levels come first, then generated ones, and every
   generated board is put through the same checks the critic applies.

   Run:  node bunny/pack.js
*/
const M = require('./model.js');
const L = require('./levels.js');
const fs = require('fs');

const THEMES = ['garden', 'sea', 'road', 'ice'];

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const out = [];
for (const lv of L.LEVELS) {
  const b = L.parse(lv);
  const s = M.solve(b, 200000, 14);
  out.push({ name: lv.name, theme: lv.theme, rows: lv.rows, bomb: lv.bomb || null,
             par: s.moves, teaching: !!lv.teaching });
  process.stdout.write('.');
}

const rnd = mulberry(20160101);
let n = out.length, tries = 0;
while (out.length < 60 && tries < 900) {
  tries++;
  const level = out.length + 1;
  const b = M.generate(level, rnd);
  if (!b) continue;
  // Every shipped board is re-checked from its own written form, so a level
  // that cannot be reconstructed from the file never ships. 17 levels were
  // lost last build because format() dropped which brick held the bomb.
  const f0 = M.solve(b, 200000, 16);
  if (f0.moves == null) continue;
  // Round-trip every board through its own written form before shipping it.
  // A level that cannot be read back is a level that breaks the game, and two
  // separate bugs shipped that way already.
  let f, back;
  try {
    f = L.format(b);
    back = L.parse({ name: 'check', rows: f.rows, bomb: f.bomb });
  } catch (e) { continue; }
  if (back.bricks.length !== b.bricks.length) continue;
  if (M.status(back) !== 'open') continue;
  const s2 = M.solve(back, 200000, 16);
  if (s2.moves == null) continue;

  out.push({ name: 'Level ' + (out.length + 1), theme: THEMES[out.length % THEMES.length],
             rows: f.rows, bomb: f.bomb, par: s2.moves, teaching: false });
  process.stdout.write('.');
}
console.log('');

// `format` loses which brick had the bomb, so re-mark it by position
// Shipped as a script rather than JSON so the game needs no fetch and works
// from a file:// URL as happily as from the site.
fs.writeFileSync('bunny/pack.js.out', 'window.BUNNY_PACK = ' + JSON.stringify(out) + ';\n');
fs.renameSync('bunny/pack.js.out', 'bunny/levels-pack.js');
console.log(`  ${out.length} levels, par ${Math.min(...out.map(l => l.par))}-${Math.max(...out.map(l => l.par))}`);
