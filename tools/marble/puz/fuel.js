// REFUEL AND LAUNCH: each cell +1/3 (the tank holds 1), it leaks `leak` a second, and the pad fires at `line` or more.
// So three cells, the last three before the pad, must be taken and the pad reached inside (1 - line) / leak seconds.
// Walk the grid (4 ways, 2.2 m a cell) at `v` m/s; best route vs a greedy one (nearest lit cell, then the pad).
function parse(map) {
  const rows = (map.length - 1) / 2, cols = (map[0].length - 1) / 2;
  const cell = (c, r) => map[2 * (rows - 1 - r) + 1][2 * c + 1];
  const hE = (k, c) => map[2 * (rows - k)][2 * c + 1], vE = (r, c) => map[2 * (rows - 1 - r) + 1][2 * c];
  const wall = (c, r, d) => (d === 'n' ? hE(r + 1, c) : d === 's' ? hE(r, c) : d === 'e' ? vE(r, c + 1) : vE(r, c)) !== ' ';
  const cells = [], pad = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { if (cell(c, r) === 'o') cells.push([c, r]); if (cell(c, r) === 'L') pad.push(c, r); }
  const dist = (a, b) => { const seen = new Map([[a.join(), 0]]), q = [a]; while (q.length) { const [c, r] = q.shift(), d0 = seen.get(c + ',' + r); if (c === b[0] && r === b[1]) return d0;
    for (const [d, dc, dr] of [['n', 0, 1], ['s', 0, -1], ['e', 1, 0], ['w', -1, 0]]) { const nc = c + dc, nr = r + dr, k = nc + ',' + nr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows || wall(c, r, d) || seen.has(k)) continue; if (cell(nc, nr) === 'o' && !(nc === b[0] && nr === b[1])) continue;   // round the other cells
      seen.set(k, d0 + 1); q.push([nc, nr]); } } return 99; };
  return { rows, cols, cells, pad, dist };
}
function evaluate(map, entry, leak, line, v = 3.2) {
  const G = parse(map), win = (1 - line) / leak, T = (a, b) => G.dist(a, b) * 2.2 / v + 0.25;   // + a little for each turn in
  let best = null;
  for (const i of G.cells) for (const j of G.cells) for (const k of G.cells) {
    if (i === j || j === k || i === k) continue;
    const t = T(i, j) + T(j, k) + T(k, G.pad);
    if (!best || t < best.t) best = { t: +t.toFixed(2), route: [i, j, k].map((p) => p.join(',')).join(' > ') };
  }
  // greedy: from the entry, the nearest cell, then the nearest untaken, three times, then the pad
  let at = [entry, 0], taken = [], times = [];
  for (let n = 0; n < 3; n++) { const nx = G.cells.filter((p) => !taken.includes(p)).sort((a, b) => G.dist(at, a) - G.dist(at, b))[0]; times.push(T(at, nx)); taken.push(nx); at = nx; }
  const gt = times[1] + times[2] + T(at, G.pad);
  return { window: +win.toFixed(2), best, bestMargin: +(win - best.t).toFixed(2), greedy: { t: +gt.toFixed(2), route: taken.map((p) => p.join(',')).join(' > '), makes: gt <= win } };
}
module.exports = { evaluate };
if (require.main === module) {
  const L = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
  for (const [id, T] of Object.entries(L)) console.log(id, JSON.stringify(evaluate(T.map, T.entry, T.leak, T.line)));
}
