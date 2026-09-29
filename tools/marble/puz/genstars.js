// THE CONSTELLATION, a ladder of layouts: stars on the floor, lines between them, a few lit to start. Rolling onto a star
// flips it and its neighbours; every layout has exactly one set of stars to roll over, which is neither "all of them"
// nor "the dark ones", and every star can be reached without rolling over another.
const { seeded, drawMap, readMap, reachSet } = require('./common.js');
const solveStars = require('./stars.js');
function segDist(px, pz, ax, az, bx, bz) { const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz))); return Math.hypot(px - ax - t * vx, pz - az - t * vz); }
function cross(a, b, c, d) { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; }
function make(r, cols, rows, k, extra, nLit, entry, exit) {
  const free = []; for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) if (!(rr === 0 && c === entry) && !(rr === rows - 1 && c === exit) && !(rr === 1 && c === entry)) free.push([c, rr]);
  const stars = [];
  for (let tries = 0; stars.length < k && tries < 400; tries++) {
    const p = free[Math.floor(r() * free.length)];
    if (stars.some((s) => Math.abs(s[0] - p[0]) + Math.abs(s[1] - p[1]) < 2 || (Math.abs(s[0] - p[0]) <= 1 && Math.abs(s[1] - p[1]) <= 1 && r() < 0.5))) continue;
    stars.push(p);
  }
  if (stars.length < k) return null;
  // Lines: a random tree over short links, then a few more; none crossing, none passing under a third star.
  const cand = [];
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) { const d = Math.hypot(stars[i][0] - stars[j][0], stars[i][1] - stars[j][1]); if (d <= 3.2) cand.push([i, j, d + r() * 1.2]); }
  cand.sort((a, b) => a[2] - b[2]);
  const ok = (i, j, E) => !stars.some((s, m) => m !== i && m !== j && segDist(s[0], s[1], ...stars[i], ...stars[j]) < 0.75) &&
                          !E.some(([a, b]) => a !== i && a !== j && b !== i && b !== j && cross(stars[i], stars[j], stars[a], stars[b]));
  const par = stars.map((_, i) => i), find = (x) => (par[x] === x ? x : (par[x] = find(par[x]))), E = [];
  for (const [i, j] of cand) if (find(i) !== find(j) && ok(i, j, E)) { par[find(i)] = find(j); E.push([i, j]); }
  if (E.length !== k - 1) return null;
  for (const [i, j] of cand) if (extra > 0 && !E.some(([a, b]) => (a === i && b === j)) && ok(i, j, E) && r() < 0.6) { E.push([i, j]); extra--; }
  const ids = 'abcdefghij', lit = new Set(); while (lit.size < nLit) lit.add(Math.floor(r() * k));
  const cells = Array.from({ length: rows }, () => Array(cols).fill('.'));
  stars.forEach(([c, rr], i) => { cells[rr][c] = lit.has(i) ? ids[i].toUpperCase() : ids[i]; });
  const map = drawMap(cols, rows, cells, {}, entry, exit);
  const lines = E.map(([i, j]) => ids[i] + ids[j]).join(' ');
  return { map, lines, k, stars };
}
function check(T) {
  const ids = 'abcdefghij'.slice(0, T.k), lit = ids.split('').filter((ch, i) => T.map.join('').includes(ch.toUpperCase()));
  const S = solveStars(ids.split(''), T.lines, lit.join(''));
  if (S.sols.length !== 1 || S.pressAll || S.pressDark || !S.sols[0]) return null;
  // every star reachable without crossing another, and the way out reachable: the free floor is one piece
  const M = readMap(T.map), star = (c, rr) => /[a-jA-J]/.test(M.ch(c, rr));
  const reach = reachSet(M, [T.entry, 0], star);
  for (const [c, rr] of T.stars) if (!reach.has(c + ',' + rr)) return null;
  if (!reach.has(T.exit + ',' + (M.rows - 1))) return null;
  return { presses: S.sols[0].length, sol: S.sols[0] };
}
if (require.main === module) {
  const out = []; const r = seeded(Number(process.argv[2] || 5));
  for (let t = 0; t < 30; t++) {                          // rank 0..29: more stars, more lines that loop, more lit
    const u = t / 29, k = Math.round(4 + 5 * u), rows = k <= 5 ? 4 : k <= 7 ? 5 : 6, extra = Math.round(u * 3), nLit = u < 0.1 ? 0 : 1 + Math.round(r() * 1.5 * u);
    const want = [2 + Math.round(2.5 * u), 3 + Math.round(3.5 * u)];
    let best = null;
    for (let tries = 0; tries < 3000 && !best; tries++) {
      const T = make(r, 5, rows, k, extra, nLit, 2, [1, 2, 3][Math.floor(r() * 3)]); if (!T) continue;
      T.entry = 2; T.exit = parseInt(T.map[0].indexOf('=') / 2);
      const C = check(T); if (!C || C.presses < want[0] || C.presses > want[1]) continue;
      best = { ...T, ...C };
    }
    if (!best) { console.error('none for rank', t); continue; }
    out.push({ rank: t, k: best.k, presses: best.presses, sol: best.sol, lines: best.lines, entry: best.entry, exit: best.exit, map: best.map });
  }
  require('fs').writeFileSync('lad-stars.json', JSON.stringify(out, null, 1));
  for (const o of out) console.log(o.rank, 'stars', o.k, 'presses', o.presses, o.sol, '|', o.lines);
  console.log(out[29].map.join('\n'));
}
module.exports = { make, check };
