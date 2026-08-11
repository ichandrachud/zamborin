/* PLUMB — level generation. Run with: node plumb/generate.js [count]

   Rejection sampling on top of the structural solver, with the validity and
   composition filters applied at EVERY solution. Survivors are ranked by the
   composition score and the best kept, because valid mobiles are frequently
   ugly and the score is what separates them.

   Writes plumb/levels.js. Nothing is recomputed at runtime — the game ships
   the exact levels this file verified. */
const fs = require('fs');
const path = require('path');
const P = require('./model.js');
const H = P.REF;

const RI = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// Stated so the yield is reproducible. The brief omits this, which is why its
// 4.0% cannot be checked by anyone building from it.
const SAMPLING = 'wL,wB,wx1,wx2 ~ U[1,9]; p1 ~ U[-7,-4]; p2 ~ U[4,7]; b1 ~ U[-6,6]';
const sample = () => ({
  wL: RI(1, 9), wB: RI(1, 9), wx1: RI(1, 9), wx2: RI(1, 9),
  p1: RI(-H.HX, -4), p2: RI(4, H.HX), b1: RI(-H.HB, H.HB),
});

// A start position must be drawable (strings still pull), must not already be
// solved, and should leave the root arm visibly tilted — that tilt is the
// signal the player steers by, so a start with no tilt hides the way in.
function pickStart(p, sols) {
  const solKeys = new Set(sols.map(s => [s.r1, s.r2, s.l1, s.l2, s.b2, s.t1, s.t2].join(',')));
  const { Wx, Mx } = P.bridgeOf(p);
  let best = null, bestTilt = -1;
  for (let attempt = 0; attempt < 4000; attempt++) {
    const t1 = RI(-H.HX, H.HX - 1), t2 = RI(t1 + 1, H.HX);
    if (!P.tensionOK(Wx, Mx, t1, t2)) continue;
    const s = {
      r1: RI(-H.HR, -1), r2: RI(1, H.HR),
      l1: RI(-H.HL, H.HL), l2: RI(-H.HL, H.HL),
      b2: RI(-H.HB, H.HB), t1, t2,
    };
    if (s.l1 === s.l2 || s.b2 === p.b1) continue;
    if (solKeys.has([s.r1, s.r2, s.l1, s.l2, s.b2, s.t1, s.t2].join(','))) continue;
    const r = P.residuals(p, s);
    if (!r) continue;
    if (r.e1 === 0 && r.e2 === 0 && r.e3 === 0 && r.e4 === 0) continue;   // already solved
    // How far from level is the root? |E3| stands in for the visible tilt.
    const tilt = Math.abs(r.e3);
    if (tilt > bestTilt) { bestTilt = tilt; best = s; }
  }
  return best;
}

function generate(count) {
  const levels = [];
  let sampled = 0, usable = 0, composedCount = 0;
  const pool = [];

  while (pool.length < count * 4 && sampled < count * 4000) {
    sampled++;
    const p = sample();
    const sols = P.solveStructural(p).solutions;
    if (P.validity(p, sols) !== null) continue;
    usable++;
    if (!P.composed(p, sols)) continue;
    composedCount++;
    const start = pickStart(p, sols);
    if (!start) continue;
    const score = Math.min(...sols.map(s => P.compositionScore(p, s)));
    pool.push({ p, sols, start, score });
  }

  pool.sort((a, b) => a.score - b.score);
  for (const c of pool.slice(0, count)) {
    levels.push({
      notches: { R: H.HR, L: H.HL, B: H.HB, X: H.HX },
      weights: { wL: c.p.wL, wB: c.p.wB, wx1: c.p.wx1, wx2: c.p.wx2 },
      riveted: { p1: c.p.p1, p2: c.p.p2, b1: c.p.b1 },
      free: ['r1', 'r2', 'l1', 'l2', 'b2', 't1', 't2'],
      start: c.start,
      solutions: c.sols,
      score: +c.score.toFixed(2),
    });
  }
  return { levels, sampled, usable, composedCount };
}

const count = parseInt(process.argv[2] || '24', 10);
const t0 = Date.now();
const { levels, sampled, usable, composedCount } = generate(count);
const ms = Date.now() - t0;

// Every shipped level is re-verified from scratch. A generator that also acts
// as its own check is not a check.
let bad = 0;
for (const [i, L] of levels.entries()) {
  const p = { ...L.weights, ...L.riveted };
  for (const s of L.solutions) if (!P.isSolved(p, s)) { console.log(`level ${i + 1}: stored solution does NOT solve`); bad++; }
  if (P.isSolved(p, L.start)) { console.log(`level ${i + 1}: start position is already solved`); bad++; }
  if (!P.composed(p, L.solutions)) { console.log(`level ${i + 1}: fails composition`); bad++; }
  const re = P.solveStructural(p).solutions;
  if (re.length !== L.solutions.length) { console.log(`level ${i + 1}: solution count drifted`); bad++; }
}

const out = `/* PLUMB — pre-baked levels. GENERATED, do not hand-edit.
   Sampling: ${SAMPLING}
   ${sampled} parameter sets sampled -> ${usable} usable (${(100 * usable / sampled).toFixed(1)}%)
   -> ${composedCount} well-composed (${(100 * composedCount / sampled).toFixed(1)}%) -> best ${levels.length} kept. */
window.PLUMB_LEVELS = ${JSON.stringify(levels, null, 1)};
`;
fs.writeFileSync(path.join(__dirname, 'levels.js'), out);

console.log(`\nsampling: ${SAMPLING}`);
console.log(`sampled ${sampled}  ->  usable ${usable} (${(100 * usable / sampled).toFixed(1)}%)  ->  well-composed ${composedCount} (${(100 * composedCount / sampled).toFixed(1)}%)`);
console.log(`kept the best ${levels.length} by composition score, in ${ms} ms`);
console.log(`re-verification of every shipped level: ${bad ? bad + ' PROBLEM(S)' : 'clean'}`);
console.log(`score range ${levels[0].score} (best) … ${levels[levels.length - 1].score} (worst kept)`);
console.log(`solutions per level: ${levels.map(l => l.solutions.length).join(', ')}`);
console.log(`wrote plumb/levels.js\n`);
