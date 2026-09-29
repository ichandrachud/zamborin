// THE CIRCUS'S PUSH PUZZLES, the ladders: 22 layouts each of the clown car, the acrobat pyramid and the balance scales,
// easy to hard, every one solved by the search (circpush.js) and passed over if random pushing gets there too often.
//   node gencircpush.js [kind] [seed]   writes lad-<kind>.json
const { parse, solve, randomPlay, scalesSums } = require('./circpush.js');
const { seeded, drawMap } = require('./common.js');
const DIRS = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] };
function blank(cols, rows) { return Array.from({ length: rows }, () => Array(cols).fill('.')); }
function stubs(r, cols, rows, n, walls, keep) {        // short inner walls, never across the way in or out
  for (let k = 0; k < n; k++) {
    if (r() < 0.5) { const kk = 1 + Math.floor(r() * (rows - 1)), c = Math.floor(r() * cols); if (!(kk === 1 && c === 2) && !(kk === rows - 1 && c === keep)) walls.h.add(c + ',' + kk); }
    else { const rr = Math.floor(r() * rows), c = 1 + Math.floor(r() * (cols - 1)); walls.v.add(c + ',' + rr); }
  }
}
function free(cells, cols, rows, exit, r) {            // a floor cell, not the way in (or the cell past it) and not the way out
  for (let t = 0; t < 200; t++) {
    const c = Math.floor(r() * cols), rr = Math.floor(r() * rows);
    if (cells[rr][c] !== '.' || (c === 2 && rr <= 1) || (c === exit && rr === rows - 1)) continue;
    return [c, rr];
  }
  return null;
}
function makeCar(r, rows, nK, nX, nS) {
  const cols = 5, exit = 1 + Math.floor(r() * 3), cells = blank(cols, rows), walls = { h: new Set(), v: new Set() };
  const [cc, cr] = free(cells, cols, rows, exit, r);
  const doors = Object.entries(DIRS).filter(([, [dc, dr]]) => { const a = cc + 2 * dc, b = cr + 2 * dr; return a >= 0 && a < cols && b >= 0 && b < rows; });
  if (!doors.length) return null;
  const door = doors[Math.floor(r() * doors.length)][0]; cells[cr][cc] = door.toUpperCase();
  for (let i = 0; i < nK; i++) { const p = free(cells, cols, rows, exit, r); if (!p) return null; cells[p[1]][p[0]] = 'k'; }
  for (let i = 0; i < nX; i++) { const p = free(cells, cols, rows, exit, r); if (!p) return null; cells[p[1]][p[0]] = 'x'; }
  stubs(r, cols, rows, nS, walls, exit);
  return { map: drawMap(cols, rows, cells, walls, 2, exit), exit };
}
function makePyr(r, rows, nA, nX, nS) {
  const cols = 5, exit = 1 + Math.floor(r() * 3), cells = blank(cols, rows), walls = { h: new Set(), v: new Set() };
  const spots = [free(cells, cols, rows, exit, r)];     // the spots together, where the pyramid will stand
  for (let t = 0; spots.length < nA && t < 60; t++) {
    const [c, rr] = spots[Math.floor(r() * spots.length)], [dc, dr] = Object.values(DIRS)[Math.floor(r() * 4)], nc = c + dc, nr = rr + dr;
    if (nc < 0 || nc >= cols || nr < 1 || nr >= rows || (nc === 2 && nr <= 1) || (nc === exit && nr === rows - 1) || spots.some(([a, b]) => a === nc && b === nr)) continue;
    spots.push([nc, nr]);
  }
  if (spots.length < nA) return null;
  for (const [c, rr] of spots) cells[rr][c] = 'o';
  for (let i = 0; i < nA; i++) { const p = free(cells, cols, rows, exit, r); if (!p) return null; cells[p[1]][p[0]] = 'a'; }
  for (let i = 0; i < nX; i++) { const p = free(cells, cols, rows, exit, r); if (!p) return null; cells[p[1]][p[0]] = 'x'; }
  stubs(r, cols, rows, nS, walls, exit);
  return { map: drawMap(cols, rows, cells, walls, 2, exit), exit };
}
function makeScales(r, rows, nW, anvil, nS) {
  const cols = 5, exit = 1 + Math.floor(r() * 3), cells = blank(cols, rows), walls = { h: new Set(), v: new Set() };
  const pr = 2 + Math.floor(r() * (rows - 3));          // the pans' row: never the first two, never the last
  cells[pr] = ['l', 'l', '^', 'r', 'r'];
  for (let i = 0; i < nW; i++) { const p = free(cells, cols, rows, exit, r); if (!p) return null; cells[p[1]][p[0]] = String(1 + Math.floor(r() * 6)); }
  stubs(r, cols, rows, nS, walls, exit);
  const side = r() < 0.5 ? 'l' : 'r';
  return { map: drawMap(cols, rows, cells, walls, 2, exit), exit, sp: anvil ? { anvil: side + anvil } : {} };
}
const TIERS = {
  // [rows, pieces, drums, stubs, pushes lo-hi, random at most, how many]
  clowncar: [[4, 1, 0, 0, 2, 3, 0.6, 3], [5, 1, 1, 1, 4, 6, 0.3, 3], [5, 2, 1, 1, 5, 7, 0.12, 4], [5, 2, 1, 2, 8, 11, 0.06, 4], [6, 3, 1, 2, 9, 13, 0.03, 4], [6, 3, 2, 3, 13, 20, 0.02, 4]],
  pyramid: [[4, 1, 0, 0, 2, 3, 0.6, 3], [5, 2, 0, 0, 3, 5, 0.3, 3], [5, 2, 1, 1, 6, 8, 0.1, 4], [5, 3, 0, 1, 7, 10, 0.05, 4], [6, 3, 1, 2, 11, 15, 0.03, 4], [6, 4, 1, 2, 12, 20, 0.02, 4]],
  // scales: [rows, weights, anvil kilos (0: none), stubs, pushes lo-hi, random at most, how many, ways at most, the obvious way fails]
  scales: [[4, 2, 3, 0, 2, 4, 0.6, 3, 9, false], [5, 3, 4, 0, 3, 6, 0.3, 3, 2, false], [5, 3, 5, 1, 5, 8, 0.1, 4, 2, true], [5, 4, 6, 1, 7, 11, 0.06, 4, 2, true],
           [6, 5, 7, 2, 9, 14, 0.03, 4, 1, true], [6, 5, 8, 2, 12, 18, 0.02, 4, 1, true]],
};
function ladder(kind, seed) {
  const r = seeded(seed), plan = [];
  for (const T of TIERS[kind]) {
    const [rows, n, a, s, lo, hi, rmax, count, ways, needFail] = T, found = [];
    for (let t = 0; t < 40000 && found.length < count; t++) {
      const L = kind === 'clowncar' ? makeCar(r, rows, n, a, s) : kind === 'pyramid' ? makePyr(r, rows, n, a, s) : makeScales(r, rows, n, a, s);
      if (!L || found.some((o) => o.map.join() === L.map.join())) continue;
      const G = parse(L.map, kind, L.sp || {}, 2, L.exit);
      if (kind === 'scales') { const S = scalesSums(G); if (!S.ways || S.ways > ways || (needFail && S.greedy)) continue; L.ways = S.ways; L.greedy = S.greedy; }
      const S = solve(G, 300000);
      if (!S.solved || S.pushes < lo || S.pushes > hi) continue;
      const rnd = randomPlay(G, 300, Math.max(12, 3 * S.pushes)); if (rnd > rmax) continue;
      found.push({ ...L, pushes: S.pushes, rnd: +rnd.toFixed(3), states: S.states, path: S.path });
    }
    if (found.length < count) console.error('short', kind, T.join(' '), found.length);
    found.sort((x, y) => x.pushes - y.pushes || y.rnd - x.rnd); plan.push(...found);
  }
  plan.forEach((o, i) => { o.rank = i; });
  return plan;
}
if (require.main === module) {
  const kinds = process.argv[2] ? [process.argv[2]] : Object.keys(TIERS), seed = Number(process.argv[3] || 7);
  for (const kind of kinds) {
    const plan = ladder(kind, seed);
    require('fs').writeFileSync('lad-' + kind + '.json', JSON.stringify(plan, null, 1));
    console.log(kind, plan.length, plan.map((o) => o.pushes + '/' + o.rnd).join(' '));
  }
}
module.exports = { ladder };
