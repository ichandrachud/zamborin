/* TAILWIND — level the fleet.

   "No plane is strictly best" is a measurable claim, and the first fleet failed
   it badly: the best plane flew 3.8x the worst, which makes the pick screen a
   ranking rather than a choice. Weight and lift are each plane's identity and
   are chosen by hand. Drag is not chosen — it is the balancing screw, solved
   here by bisection so that every plane's own best launch lands near a common
   target. What differs between planes is then how you get there, which is the
   draw: best pull runs 0.19 on Zephyr to 0.97 on Cyclone.

   Two model-level fixes had to land before this could converge at all, and both
   are recorded in model.js: a catapult stores energy rather than speed, so a
   heavy plane leaves the arm slower; and wing area scales with mass, so wing
   loading is a fleet constant instead of varying 4.8x. Without them weight was
   a free win worth more than the entire drag slider, and no setting of drag
   could level anything.

   Run:  node tailwind/balance.js [target-metres]
   Then paste the printed table into model.js and re-run measure.js.
*/
const M = require('./model.js');

// weight / lift / tough are the identity; drag is what this file solves for.
const IDENT = {
  Lacerta: { weight: 0.25, lift: 0.85, tough: 0.30, aspect: 2.35 },
  Sirocco: { weight: 0.70, lift: 0.35, tough: 0.65, aspect: 1.74 },
  Tempest: { weight: 0.90, lift: 0.55, tough: 0.90, aspect: 2.16 },
  Tsunami: { weight: 0.60, lift: 0.75, tough: 0.55, aspect: 1.72 },
  Vesper:  { weight: 0.45, lift: 0.50, tough: 0.45, aspect: 1.90 },
  Zephyr:  { weight: 0.80, lift: 0.30, tough: 0.80, aspect: 2.43 },
};

const bestOf = (st) => M.best(M.build(st), 26);
const TARGET = Number(process.argv[2] || 210);

console.log('TAILWIND — what each plane can reach, drag 0 (clean) to 1 (draggy)\n');
console.log('plane      at drag 0   at drag 1');
for (const [n, id] of Object.entries(IDENT)) {
  const d0 = bestOf({ ...id, drag: 0 }).dist, d1 = bestOf({ ...id, drag: 1 }).dist;
  const flag = (d0 < TARGET) ? '   <- cannot reach the target even clean' : '';
  console.log(`${n.padEnd(9)}${d0.toFixed(0).padStart(7)} m ${d1.toFixed(0).padStart(11)} m${flag}`);
}

console.log(`\nsolving drag for a ${TARGET} m target\n`);
const out = {};
for (const [n, id] of Object.entries(IDENT)) {
  let lo = 0, hi = 1, drag = 0.5;
  for (let i = 0; i < 16; i++) {
    drag = (lo + hi) / 2;
    if (bestOf({ ...id, drag }).dist > TARGET) lo = drag; else hi = drag;
  }
  drag = Math.round(drag * 100) / 100;
  const b = bestOf({ ...id, drag });
  out[n] = { ...id, drag };
  console.log(`${n.padEnd(9)} drag ${drag.toFixed(2)}  ->  ${b.dist.toFixed(0).padStart(4)} m  at ${b.angle.toFixed(1).padStart(5)}° / pull ${b.pull.toFixed(2)}`);
}

const dists = Object.entries(out).map(([n, s]) => bestOf(s).dist);
const pulls = Object.entries(out).map(([n, s]) => bestOf(s).pull);
console.log(`\nfleet spread ${Math.min(...dists).toFixed(0)}-${Math.max(...dists).toFixed(0)} m ` +
  `(${(100 * (1 - Math.min(...dists) / Math.max(...dists))).toFixed(0)}% apart), ` +
  `best pull ${Math.min(...pulls).toFixed(2)}-${Math.max(...pulls).toFixed(2)}`);

console.log('\nconst PLANES = {');
for (const [n, s] of Object.entries(out))
  console.log(`  ${(n + ':').padEnd(9)}{ weight: ${s.weight.toFixed(2)}, lift: ${s.lift.toFixed(2)}, drag: ${s.drag.toFixed(2)}, tough: ${s.tough.toFixed(2)}, aspect: ${s.aspect} },`);
console.log('};');
