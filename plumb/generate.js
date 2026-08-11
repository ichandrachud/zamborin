/* PLUMB — level generation for any topology. Run with:
     node plumb/generate.js [topology] [count]
     node plumb/generate.js reference 24
     node plumb/generate.js deep 24

   Rejection sampling on the general solver, with validity (§4.2) and
   composition (§4.3) applied at EVERY solution, survivors ranked by
   composition score and the best kept. Every shipped level is then re-verified
   from scratch — a generator that acts as its own check is not a check.

   Writes plumb/levels-<topology>.js. Nothing is recomputed at runtime. */
const fs = require('fs');
const path = require('path');
const T = require('./topology.js');
const C = require('./compose.js');
const TOPOS = require('./topologies.js');

const RI = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// Stated so the yield is reproducible. The brief omits this, which is why its
// 4.0% figure cannot be checked by anyone building from it.
const SAMPLERS = {
  reference: {
    text: 'wL,wB,wx1,wx2 ~ U[1,9]; p1 ~ U[-7,-4]; p2 ~ U[4,7]; b1 ~ U[-6,6]',
    fn: () => ({ wL: RI(1, 9), wB: RI(1, 9), wx1: RI(1, 9), wx2: RI(1, 9),
                 p1: RI(-7, -4), p2: RI(4, 7), b1: RI(-6, 6) }),
  },
  deep: {
    text: 'wL,wB,wC,wD,wx1,wx2 ~ U[1,6]; p1 ~ U[-4,-2]; p2 ~ U[2,4]',
    fn: () => ({ wL: RI(1, 6), wB: RI(1, 6), wC: RI(1, 6), wD: RI(1, 6),
                 wx1: RI(1, 6), wx2: RI(1, 6), p1: RI(-4, -2), p2: RI(2, 4) }),
  },
};

// A start must be drawable (strings still pull), must not already be solved,
// and wants the root arm visibly off level — that tilt is the signal the player
// steers by (§3.4), so a start with no tilt hides the way in.
function pickStart(topo, params, sols) {
  const vars = T.freeVars(topo, params);
  const solKeys = new Set(sols.map(s => vars.map(v => s[v.id]).join(',')));
  let best = null, bestTilt = -1;
  for (let attempt = 0; attempt < 6000; attempt++) {
    const s = {};
    for (const v of vars) s[v.id] = RI(v.lo, v.hi);
    if (solKeys.has(vars.map(v => s[v.id]).join(','))) continue;
    // The START has to obey the same rules as a solution. Without this a level
    // could open with two hooks stacked in one notch — a state the solver
    // forbids and the player cannot even grab, since both hooks draw at the
    // same point.
    let crowded = false;
    const groups = [...Object.values(topo.arms).map(A => A.hooks.map(h => h.id)),
                    ...Object.values(topo.bridges || {}).map(B => B.ties)];
    for (const ids of groups) {
      const at = ids.map(id => (s[id] !== undefined ? s[id] : params[id])).sort((x, y) => x - y);
      for (let i = 1; i < at.length; i++) if (at[i] - at[i - 1] < 2) { crowded = true; break; }
      if (crowded) break;
    }
    if (crowded) continue;
    const e = T.evaluate(topo, params, s);
    if (!e) continue;
    if (e.residuals.every(d => d.r.n === 0)) continue;         // already solved
    if (C.composedOne(topo, params, s) === 'strings would push') continue;
    const rootR = e.residuals.find(d => d.kind === 'balance' && d.arm === topo.root);
    const tilt = rootR ? Math.abs(rootR.r.n / rootR.r.d) : 0;
    if (tilt > bestTilt) { bestTilt = tilt; best = { ...s }; }
  }
  return best;
}

function generate(topoName, count) {
  const topo = TOPOS[topoName.toUpperCase()];
  if (!topo) throw new Error('unknown topology: ' + topoName);
  const sampler = SAMPLERS[topoName];
  const pool = [];
  let sampled = 0, usable = 0, wellComposed = 0;
  const rejected = {};

  while (pool.length < count * 3 && sampled < count * 6000) {
    sampled++;
    const params = sampler.fn();
    const sols = T.solve(topo, params, { limit: 4 }).solutions;
    if (sols.length < 1 || sols.length > 3) continue;          // §4.2
    usable++;
    let bad = null;
    for (const s of sols) { const r = C.composedOne(topo, params, s); if (r) { bad = r; break; } }
    if (bad) { rejected[bad] = (rejected[bad] || 0) + 1; continue; }
    wellComposed++;
    const start = pickStart(topo, params, sols);
    if (!start) continue;
    pool.push({ params, sols, start, score: Math.min(...sols.map(s => C.score(topo, params, s))) });
  }

  pool.sort((a, b) => a.score - b.score);
  const levels = pool.slice(0, count).map(c => ({
    topology: topoName,
    params: c.params,
    start: c.start,
    solutions: c.sols,
    score: +c.score.toFixed(2),
  }));
  return { levels, sampled, usable, wellComposed, rejected, sampler, topo };
}

const topoName = (process.argv[2] || 'reference').toLowerCase();
const count = parseInt(process.argv[3] || '24', 10);
const t0 = Date.now();
const { levels, sampled, usable, wellComposed, rejected, sampler, topo } = generate(topoName, count);
const ms = Date.now() - t0;

// Re-verify every shipped level from scratch.
let bad = 0;
for (const [i, L] of levels.entries()) {
  for (const s of L.solutions)
    if (!T.isSolved(topo, L.params, s)) { console.log(`level ${i + 1}: a stored solution does NOT solve`); bad++; }
  if (T.isSolved(topo, L.params, L.start)) { console.log(`level ${i + 1}: start is already solved`); bad++; }
  if (!C.composed(topo, L.params, L.solutions)) { console.log(`level ${i + 1}: fails composition`); bad++; }
  const re = T.solve(topo, L.params, { limit: 4 }).solutions.length;
  if (re !== L.solutions.length) { console.log(`level ${i + 1}: solution count drifted ${L.solutions.length} -> ${re}`); bad++; }
}

const file = `levels-${topoName}.js`;
fs.writeFileSync(path.join(__dirname, file),
`/* PLUMB — pre-baked levels for the "${topoName}" topology. GENERATED, do not hand-edit.
   Sampling: ${sampler.text}
   ${sampled} parameter sets sampled -> ${usable} usable (${(100 * usable / sampled).toFixed(1)}%)
   -> ${wellComposed} well-composed (${(100 * wellComposed / sampled).toFixed(2)}%) -> best ${levels.length} kept. */
(window.PLUMB_PACKS = window.PLUMB_PACKS || {})['${topoName}'] = ${JSON.stringify(levels)};
`);

const extents = levels.map(L => C.geometry(topo, L.params, L.solutions[0]).extent).sort((a, b) => a - b);
console.log(`\ntopology "${topoName}"   sampling: ${sampler.text}`);
console.log(`sampled ${sampled} -> usable ${usable} (${(100 * usable / sampled).toFixed(1)}%) -> well-composed ${wellComposed} (${(100 * wellComposed / sampled).toFixed(2)}%)`);
console.log(`kept the best ${levels.length} by composition score in ${(ms / 1000).toFixed(1)}s`);
console.log(`re-verification of every shipped level: ${bad ? bad + ' PROBLEM(S)' : 'clean'}`);
console.log(`horizontal extent: min ${extents[0]}  median ${extents[extents.length >> 1]}  max ${extents[extents.length - 1]} notches`);
console.log(`solutions per level: ${levels.map(l => l.solutions.length).join(', ')}`);
console.log('composition rejections:', Object.entries(rejected).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || 'none');
console.log(`wrote plumb/${file}\n`);
