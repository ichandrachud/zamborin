/* PLUMB — proof that the general system agrees with the brief.

   The general formulation is only worth having if it reproduces the brief's
   four hand-derived equations exactly. This checks that against both golden
   cases and against the specific solver on random parameter sets, and only
   then measures whether the deep phone topology is still a real puzzle. */
const T = require('./topology.js');
const P = require('./model.js');
const { REFERENCE, DEEP } = require('./topologies.js');

let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`);
};
const key = (s, ids) => ids.map(k => s[k]).join(',');
const REF_IDS = ['r1','r2','l1','l2','b2','t1','t2'];

console.log('\n=== 1. GENERAL SYSTEM vs THE BRIEF (§2.5 golden cases) ===\n');
const GOLDEN = {
  'Case A': { p: { wL:5, wB:9, wx1:3, p1:-6, wx2:5, p2:7, b1:-6 },
              sol: { r1:-6, r2:5, l1:-2, l2:2, b2:2, t1:1, t2:4 } },
  'Case B': { p: { wL:4, wB:6, wx1:6, p1:-7, wx2:5, p2:7, b1:-3 },
              sol: { r1:-4, r2:3, l1:5, l2:-4, b2:3, t1:-5, t2:3 } },
};
for (const [name, g] of Object.entries(GOLDEN)) {
  console.log(name);
  check("the brief's solution solves under the general system", T.isSolved(REFERENCE, g.p, g.sol));
  const e = T.evaluate(REFERENCE, g.p, g.sol);
  check('it produces exactly 4 residuals (3 balance + 1 span)',
    e.residuals.length === 4 &&
    e.residuals.filter(r => r.kind === 'balance').length === 3 &&
    e.residuals.filter(r => r.kind === 'span').length === 1,
    e.residuals.map(r => r.kind + ':' + r.r.n).join('  '));
  const gen = T.solve(REFERENCE, g.p).solutions;
  check('general solver finds exactly one solution', gen.length === 1, `got ${gen.length}`);
  check('and it is the brief\'s', gen.some(s => key(s, REF_IDS) === key(g.sol, REF_IDS)));
  console.log('');
}

console.log('=== 2. GENERAL vs SPECIFIC SOLVER, random parameter sets ===\n');
const RI = (a,b) => a + Math.floor(Math.random()*(b-a+1));
let mismatch = 0, n = 60;
for (let i = 0; i < n; i++) {
  const p = { wL:RI(1,9), wB:RI(1,9), wx1:RI(1,9), wx2:RI(1,9), p1:RI(-7,-4), p2:RI(4,7), b1:RI(-6,6) };
  const a = P.solveStructural(p).solutions.map(s => key(s, REF_IDS)).sort().join('|');
  const b = T.solve(REFERENCE, p, { limit: 999 }).solutions.map(s => key(s, REF_IDS)).sort().join('|');
  if (a !== b) { mismatch++; if (mismatch <= 2) console.log('  MISMATCH', JSON.stringify(p), '\n    specific:', a, '\n    general :', b); }
}
check(`identical solution sets on all ${n} random parameter sets`, mismatch === 0, `${mismatch} mismatch(es)`);

console.log('\n=== 3. IS THE DEEP PHONE TOPOLOGY STILL A PUZZLE? ===\n');
function violation(topo, p, s) {
  const e = T.evaluate(topo, p, s);
  if (!e) return Infinity;
  return e.residuals.reduce((a, d) =>
    a + Math.abs(d.r.n / d.r.d) * (d.kind === 'span' ? 40 : 1), 0);
}
function climbs(topo, p, vars, restarts = 20) {
  for (let r = 0; r < restarts; r++) {
    const s = {};
    for (const v of vars) s[v.id] = RI(v.lo, v.hi);
    let cur = violation(topo, p, s);
    for (let step = 0; step < 200; step++) {
      if (cur === 0) return true;
      let best = null, bestV = cur;
      for (const v of vars) for (let val = v.lo; val <= v.hi; val++) {
        if (s[v.id] === val) continue;
        const t2 = { ...s, [v.id]: val };
        const nv = violation(topo, p, t2);
        if (nv < bestV) { bestV = nv; best = t2; }
      }
      if (!best) break;
      Object.assign(s, best); cur = bestV;
    }
    if (cur === 0) return true;
  }
  return false;
}

const cases = [
  ['reference (desktop)', REFERENCE,
    () => ({ wL:RI(1,9), wB:RI(1,9), wx1:RI(1,9), wx2:RI(1,9), p1:RI(-7,-4), p2:RI(4,7), b1:RI(-6,6) })],
  ['deep (phone portrait)', DEEP,
    () => ({ wL:RI(1,6), wB:RI(1,6), wC:RI(1,6), wD:RI(1,6), wx1:RI(1,6), wx2:RI(1,6), p1:RI(-4,-2), p2:RI(2,4) })],
];
console.log('  topology                free hooks   space        usable   blind search FAILS on');
for (const [name, topo, sample] of cases) {
  const vars = T.freeVars(topo, sample());
  let tested = 0, usable = 0, failed = 0, tries = 0;
  while (tested < 60 && tries < 4000) {
    tries++;
    const p = sample();
    const sols = T.solve(topo, p, { limit: 4 }).solutions;
    if (sols.length < 1 || sols.length > 3) continue;
    usable++; tested++;
    if (!climbs(topo, p, T.freeVars(topo, p))) failed++;
  }
  const space = T.searchSpace(topo, sample());
  console.log(`  ${name.padEnd(22)} ${String(vars.length).padStart(6)}  ${String(space.toLocaleString()).padStart(12)}  ${String((100*usable/tries).toFixed(1)+'%').padStart(7)}   ${(100*failed/tested).toFixed(1)}%`);
}

console.log('\n' + (failures ? `${failures} CHECK(S) FAILED` : 'all checks passed') + '\n');
process.exit(failures ? 1 : 0);
