/* TAILWIND — look at the response surface.

   measure.js says whether the game is a game. This says WHY, which is what you
   need while tuning. It prints distance over the whole angle/pull space as a
   height map, so a peak on the boundary — "always flattest, always hardest",
   the failure the first tuning pass had — is visible at a glance instead of
   inferred from one number.

   Run:  node tailwind/sweep.js [Plane]
*/
const M = require('./model.js');

const name = process.argv[2] || 'Aurora';
const p = M.build(name);
const A0 = M.CFG.ANG_MIN, A1 = M.CFG.ANG_MAX;
const ROWS = 22, COLS = 30;
const RAMP = ' .:-=+*#%@';

const grid = [];
for (let i = 0; i < ROWS; i++) {
  const a = A1 - (A1 - A0) * (i / (ROWS - 1));      // steep at the top
  grid.push({ a, row: Array.from({ length: COLS }, (_, j) => M.fly(p, a, j / (COLS - 1))) });
}
const flat = grid.flatMap(r => r.row.map(x => x.dist));
const hi = Math.max(...flat), lo = Math.min(...flat);

console.log(`TAILWIND — ${name}: distance over the input space   (${RAMP} = ${lo.toFixed(0)}..${hi.toFixed(0)} m)\n`);
console.log('        pull 0' + ' '.repeat(COLS - 12) + 'pull 1');
for (const { a, row } of grid) {
  const bars = row.map(r => RAMP[Math.min(RAMP.length - 1, Math.floor((r.dist - lo) / (hi - lo) * RAMP.length))]).join('');
  const best = Math.max(...row.map(r => r.dist));
  console.log(`  ${a.toFixed(0).padStart(3)}°  ${bars}   ${best.toFixed(0).padStart(4)} m`);
}

const b = M.best(p);
console.log(`\n  best ${b.dist.toFixed(0)} m at ${b.angle.toFixed(1)}° / pull ${b.pull.toFixed(2)}`);
console.log(`  apex ${b.apex.toFixed(0)} m, airborne ${b.t.toFixed(1)} s, ${b.bounces} bounces, stalled: ${b.stalled}`);

// walk the optimum's neighbourhood so a boundary peak cannot hide
console.log('\n  slice through the optimum');
console.log('   angle : ' + [-16, -12, -8, -4, 0, 4, 8, 12, 16].map(d => {
  const a = Math.max(A0, Math.min(A1, b.angle + d));
  return `${a.toFixed(0)}°=${M.fly(p, a, b.pull).dist.toFixed(0)}`;
}).join('  '));
console.log('   pull  : ' + [-0.32, -0.24, -0.16, -0.08, 0, 0.08, 0.16, 0.24, 0.32].map(d => {
  const pu = Math.max(0, Math.min(1, b.pull + d));
  return `${pu.toFixed(2)}=${M.fly(p, b.angle, pu).dist.toFixed(0)}`;
}).join('  '));
