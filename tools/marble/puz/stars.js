// Lights-out on a constellation: pressing a star flips it and every star joined to it by a line.
function solve(stars, lines, lit) {
  const n = stars.length, idx = Object.fromEntries(stars.map((s, i) => [s, i]));
  const nb = stars.map((_, i) => 1 << i);
  for (const [a, b] of lines.split(' ').map((p) => [...p])) { nb[idx[a]] |= 1 << idx[b]; nb[idx[b]] |= 1 << idx[a]; }
  const start = [...lit].reduce((m, s) => m | (1 << idx[s]), 0), all = (1 << n) - 1, sols = [];
  for (let S = 0; S < 1 << n; S++) {
    let m = start; for (let i = 0; i < n; i++) if (S >> i & 1) m ^= nb[i];
    if (m === all) sols.push(S);
  }
  const name = (S) => stars.filter((_, i) => S >> i & 1).join('');
  const pressAll = (() => { let m = start; for (let i = 0; i < n; i++) m ^= nb[i]; return m === all; })();
  const pressDark = (() => { let m = start; for (let i = 0; i < n; i++) if (!(start >> i & 1)) m ^= nb[i]; return m === all; })();
  // greedy: repeatedly press the dark star whose press lights the most (net), up to 12 presses
  let m = start, g = 0; for (; g < 12 && m !== all; g++) { let best = -1, bv = -99; for (let i = 0; i < n; i++) { const t = m ^ nb[i]; const v = popc(t) - popc(m); if (v > bv) { bv = v; best = i; } } m ^= nb[best]; }
  return { sols: sols.map(name), pressAll, pressDark, greedyWins: m === all, greedySteps: g };
}
function popc(x) { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; }
module.exports = solve;
if (require.main === module) {
  const cases = JSON.parse(process.argv[2]);
  for (const [nm, stars, lines, lit] of cases) console.log(nm, JSON.stringify(solve([...stars], lines, lit)));
}
