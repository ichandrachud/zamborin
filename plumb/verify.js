/* PLUMB — verification harness. Run with: node plumb/verify.js

   Section 9 step 1 says verify against both golden cases before writing
   anything else, and step 2 says report the yield you measure. This does both,
   and it also cross-checks the fast structural generator against the slow
   exhaustive one — if those two ever disagree, the fast one is wrong. */
const P = require('./model.js');
const H = P.REF;

let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`);
};
const key = s => [s.r1, s.r2, s.l1, s.l2, s.b2, s.t1, s.t2].join(',');

// ---------------------------------------------------------------- golden cases
const GOLDEN = {
  'Case A': {
    p: { wL: 5, wB: 9, wx1: 3, p1: -6, wx2: 5, p2: 7, b1: -6 },
    sol: { r1: -6, r2: 5, l1: -2, l2: 2, b2: 2, t1: 1, t2: 4 },
    says: { Wx: 8, Mx: 17, D: -3, N1: -15, N2: -9, T1: 5, T2: 3, lo: -12, hi: 11, centre: -0.5 },
  },
  'Case B': {
    p: { wL: 4, wB: 6, wx1: 6, p1: -7, wx2: 5, p2: 7, b1: -3 },
    sol: { r1: -4, r2: 3, l1: 5, l2: -4, b2: 3, t1: -5, t2: 3 },
    says: { Wx: 11, Mx: -7, D: -8, N1: -40, N2: -48, T1: 5, T2: 6 },
  },
};

console.log('\n=== 1. GOLDEN CASES (brief §2.5) ===\n');
for (const [name, g] of Object.entries(GOLDEN)) {
  console.log(name);
  const { Wx, Mx } = P.bridgeOf(g.p);
  check('Wx, Mx match the brief', Wx === g.says.Wx && Mx === g.says.Mx, `got Wx ${Wx}, Mx ${Mx}`);

  const r = P.residuals(g.p, g.sol);
  check('tension condition holds', !!r);
  check('D, N1, N2 match', r.D === g.says.D && r.N1 === g.says.N1 && r.N2 === g.says.N2,
    `got D ${r.D}, N1 ${r.N1}, N2 ${r.N2}`);
  check('T1, T2 match', r.N1 / r.D === g.says.T1 && r.N2 / r.D === g.says.T2,
    `got T1 ${r.N1 / r.D}, T2 ${r.N2 / r.D}`);
  check('all four equations are exactly zero', r.e1 === 0 && r.e2 === 0 && r.e3 === 0 && r.e4 === 0,
    `E1 ${r.e1}  E2 ${r.e2}  E3 ${r.e3}  E4 ${r.e4}`);

  const ex = P.solveExhaustive(g.p);
  check('exhaustive enumeration returns exactly one solution', ex.solutions.length === 1,
    `got ${ex.solutions.length}`);
  check("that solution is the brief's", ex.solutions.some(s => key(s) === key(g.sol)));

  const st = P.solveStructural(g.p);
  const same = st.solutions.length === ex.solutions.length &&
    st.solutions.every(s => ex.solutions.some(e => key(e) === key(s)));
  check('structural generator agrees with exhaustive', same,
    `structural ${st.solutions.length} vs exhaustive ${ex.solutions.length}`);
  check('structural examines far fewer candidates', st.examined < ex.examined / 100,
    `${st.examined.toLocaleString()} vs ${ex.examined.toLocaleString()}  (${Math.round(ex.examined / st.examined).toLocaleString()}x fewer)`);

  if (g.says.lo !== undefined) {
    const geo = P.geometry(g.p, g.sol);
    check('geometry matches the brief’s stated extent',
      geo.lo === g.says.lo && geo.hi === g.says.hi && geo.centre === g.says.centre,
      `got ${geo.lo} … ${geo.hi}, centre ${geo.centre}`);
  }
  console.log('');
}

console.log(`search space: ${P.searchSpaceSize(H).toLocaleString()}   (brief quotes 8,304,660)`);
check('search space matches the brief', P.searchSpaceSize(H) === 8304660);

// ------------------------------------------------- structural == exhaustive
console.log('\n=== 2. STRUCTURAL vs EXHAUSTIVE, over random parameter sets ===\n');
const RI = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
// The brief never states its sampling distribution, which is why its 4.0%
// cannot be reproduced. Stating ours here so this number can be checked.
const SAMPLING = 'wL,wB,wx1,wx2 ~ U[1,9];  p1 ~ U[-7,-4];  p2 ~ U[4,7];  b1 ~ U[-6,6]';
const sample = () => ({
  wL: RI(1, 9), wB: RI(1, 9), wx1: RI(1, 9), wx2: RI(1, 9),
  p1: RI(-H.HX, -4), p2: RI(4, H.HX), b1: RI(-H.HB, H.HB),
});

let mismatches = 0, agreeN = 120, exTime = 0, stTime = 0, exSeen = 0, stSeen = 0;
for (let i = 0; i < agreeN; i++) {
  const p = sample();
  let t = process.hrtime.bigint();
  const ex = P.solveExhaustive(p);
  exTime += Number(process.hrtime.bigint() - t) / 1e6;
  t = process.hrtime.bigint();
  const st = P.solveStructural(p);
  stTime += Number(process.hrtime.bigint() - t) / 1e6;
  exSeen += ex.examined; stSeen += st.examined;
  const a = ex.solutions.map(key).sort().join('|');
  const b = st.solutions.map(key).sort().join('|');
  if (a !== b) { mismatches++; if (mismatches <= 3) console.log('  MISMATCH on', JSON.stringify(p)); }
}
check(`identical solution sets on all ${agreeN} random parameter sets`, mismatches === 0,
  `${mismatches} mismatch(es)`);
console.log(`  exhaustive ${(exTime / agreeN).toFixed(1)} ms/instance, ${Math.round(exSeen / agreeN).toLocaleString()} examined`);
console.log(`  structural ${(stTime / agreeN).toFixed(2)} ms/instance, ${Math.round(stSeen / agreeN).toLocaleString()} examined`);
console.log(`  speedup ${Math.round(exTime / stTime).toLocaleString()}x by time, ${Math.round(exSeen / stSeen).toLocaleString()}x by candidates examined`);

// ------------------------------------------------------------------- yield
console.log('\n=== 3. YIELD (brief §3.1 claims 17.2% usable, 4.0% well-composed) ===\n');
console.log(`  sampling: ${SAMPLING}\n`);
const N = 3000;
let usable = 0, wellComposed = 0;
const rejectedBy = {};
for (let i = 0; i < N; i++) {
  const p = sample();
  const sols = P.solveStructural(p).solutions;
  if (P.validity(p, sols) !== null) continue;
  usable++;
  const reasons = new Set();
  for (const s of sols) { const r = P.composedOne(p, s); if (r) reasons.add(r); }
  if (reasons.size === 0) wellComposed++;
  else for (const r of reasons) rejectedBy[r] = (rejectedBy[r] || 0) + 1;
}
console.log(`  ${N} sampled parameter sets`);
console.log(`  usable (1-3 exact solutions)   ${usable}  = ${(100 * usable / N).toFixed(1)}%   (brief: 17.2%)`);
console.log(`  usable AND well-composed       ${wellComposed}  = ${(100 * wellComposed / N).toFixed(1)}%   (brief: 4.0%)`);
console.log(`  -> about ${Math.round(N / Math.max(1, wellComposed))} sampled instances per shipped level (brief expects ~25)\n`);
console.log('  composition rejections, by reason:');
for (const [r, c] of Object.entries(rejectedBy).sort((a, b) => b[1] - a[1]))
  console.log(`     ${r.padEnd(28)} ${c}`);

console.log('\n' + (failures ? `${failures} CHECK(S) FAILED` : 'all checks passed') + '\n');
process.exit(failures ? 1 : 0);
