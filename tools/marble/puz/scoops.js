// WORMHOLES: the search. Islands of floor with void between. On an island: roll over any of its flags (each flips
// which exit of its colour is lit), and into any of its scoops: out of the lit exit of that colour, wherever it is.
// legend: a b c scoops (colour 0 1 2); A B C lit exits; D E F dark exits (colour 0 1 2); f g h flags; '#' void.
function parse(map, entry, exit) {
  const rows = (map.length - 1) / 2, cols = (map[0].length - 1) / 2;
  const cell = (c, r) => map[2 * (rows - 1 - r) + 1][2 * c + 1];
  const hE = (k, c) => map[2 * (rows - k)][2 * c + 1], vE = (r, c) => map[2 * (rows - 1 - r) + 1][2 * c];
  const wall = (c, r, d) => (d === 'n' ? hE(r + 1, c) : d === 's' ? hE(r, c) : d === 'e' ? vE(r, c + 1) : vE(r, c)) !== ' ';
  const isl = Array(rows * cols).fill(-1); let n = 0;
  for (let i = 0; i < rows * cols; i++) {
    if (isl[i] >= 0 || cell(i % cols, (i / cols) | 0) === '#') continue;
    const q = [i]; isl[i] = n;
    while (q.length) { const j = q.pop(), c = j % cols, r = (j / cols) | 0;
      for (const [d, dc, dr] of [['n', 0, 1], ['s', 0, -1], ['e', 1, 0], ['w', -1, 0]]) { const nc = c + dc, nr = r + dr;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows || wall(c, r, d)) continue; const k = nc + nr * cols;
        if (isl[k] >= 0 || cell(nc, nr) === '#') continue; isl[k] = n; q.push(k); } }
    n++;
  }
  const I = Array.from({ length: n }, () => ({ scoops: [], flags: [], exits: [] })), exits = [[], [], []], lit0 = [0, 0, 0];
  for (let i = 0; i < rows * cols; i++) { const ch = cell(i % cols, (i / cols) | 0), k = isl[i]; if (k < 0) continue;
    if ('abc'.includes(ch)) I[k].scoops.push('abc'.indexOf(ch));
    if ('fgh'.includes(ch)) I[k].flags.push('fgh'.indexOf(ch));
    if ('ABCDEF'.includes(ch)) { const col = 'ABCDEF'.indexOf(ch) % 3; exits[col].push(k); if ('ABC'.includes(ch)) lit0[col] = exits[col].length - 1; } }
  return { n, I, exits, lit0, start: isl[entry], goal: isl[exit + (rows - 1) * cols] };
}
function solve(G) {
  // state: island, lit index per colour (0/1). On an island, any subset of its flag colours may be flipped (each flip is its own roll-over).
  const K = (i, l) => i + ':' + l.join(''), seen = new Map([[K(G.start, G.lit0), null]]), q = [[G.start, G.lit0]];
  let win = null;
  for (let h = 0; h < q.length; h++) {
    const [i, lit] = q[h];
    if (i === G.goal) { win = K(i, lit); break; }
    const fl = [...new Set(G.I[i].flags)], subsets = 1 << fl.length;
    for (let m = 0; m < subsets; m++) {
      const l2 = lit.slice(); const flipped = []; fl.forEach((col, b) => { if (m >> b & 1) { l2[col] ^= 1; flipped.push('fgh'[col]); } });
      for (const col of new Set(G.I[i].scoops)) {
        const to = G.exits[col][l2[col]]; if (to === undefined) continue;
        const k = K(to, l2); if (seen.has(k)) continue;
        seen.set(k, { from: K(i, lit), how: flipped.join('') + 'abc'[col] }); q.push([to, l2]);
      }
    }
  }
  if (!win) return { solved: false, states: seen.size };
  const path = []; for (let k = win; seen.get(k); k = seen.get(k).from) path.unshift(seen.get(k).how);
  return { solved: true, scoops: path.length, path: path.join(' '), states: seen.size };
}
// careless: on each island, straight into the nearest scoop (the first listed), flags left alone
function careless(G) { let i = G.start, lit = G.lit0.slice(); for (let n = 0; n < 12; n++) { if (i === G.goal) return true; const s = G.I[i].scoops[0]; if (s === undefined) return false; i = G.exits[s][lit[s]]; } return i === G.goal; }
module.exports = { parse, solve, careless };
if (require.main === module) {
  const L = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
  for (const [id, T] of Object.entries(L)) { const G = parse(T.map, T.entry, T.exit); console.log(id, 'islands', G.n, JSON.stringify(solve(G)), 'careless wins:', careless(G)); }
}
