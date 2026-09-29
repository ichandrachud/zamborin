// REFUEL AND LAUNCH, a ladder. The pad in the middle of the top row; cells about the floor; inner walls. A route's cost:
// cells rolled, half a cell for each turn, 0.6 for each cell taken (it slows you). The best three before the pad against
// the greedy three (the nearest each time, from the way in): the gap between them is the puzzle. The leak is then set
// from the best route (measured in the game afterwards and corrected).
const { seeded, drawMap, readMap, DIRS } = require('./common.js');
function path(M, a, b, block) {
  const k = (c, r) => c + ',' + r, prev = new Map([[k(...a), null]]), q = [a];
  while (q.length) { const [c, r] = q.shift(); if (c === b[0] && r === b[1]) { const out = []; for (let x = k(c, r); x; x = prev.get(x)) out.unshift(x.split(',').map(Number)); return out; }
    for (const [d, dc, dr] of DIRS) { const nc = c + dc, nr = r + dr, kk = k(nc, nr); if (nc < 0 || nc >= M.cols || nr < 0 || nr >= M.rows || M.wall(c, r, d) || prev.has(kk)) continue;
      if (!(nc === b[0] && nr === b[1]) && block(nc, nr)) continue; prev.set(kk, k(c, r)); q.push([nc, nr]); } }
  return null;
}
function cost(M, a, b, block) {
  const p = path(M, a, b, block) || path(M, a, b, () => false); if (!p) return 99;
  let t = 0; for (let i = 2; i < p.length; i++) if ((p[i][0] - p[i - 1][0]) !== (p[i - 1][0] - p[i - 2][0])) t++;
  return p.length - 1 + 0.5 * t + 0.6;
}
function analyse(map) {
  const M = readMap(map), cells = [], pad = [2, M.rows - 1];
  for (let r = 0; r < M.rows; r++) for (let c = 0; c < M.cols; c++) if (M.ch(c, r) === 'o') cells.push([c, r]);
  const isCell = (c, r) => M.ch(c, r) === 'o' || (c === pad[0] && r === pad[1]);
  let best = null;
  for (const a of cells) for (const b of cells) for (const c of cells) {
    if (a === b || b === c || a === c) continue;
    const t = cost(M, a, b, isCell) + cost(M, b, c, isCell) + cost(M, c, pad, (x, y) => M.ch(x, y) === 'o');
    if (!best || t < best.t) best = { t, route: [a, b, c] };
  }
  let at = [2, 0]; const pick = [];
  for (let n = 0; n < 3; n++) { const nx = cells.filter((u) => !pick.includes(u)).sort((u, v) => cost(M, at, u, isCell) - cost(M, at, v, isCell))[0]; pick.push(nx); at = nx; }
  const greedy = cost(M, pick[0], pick[1], isCell) + cost(M, pick[1], pick[2], isCell) + cost(M, pick[2], pad, (x, y) => M.ch(x, y) === 'o');
  // the look of it: the three cells nearest the pad as the crow flies, taken farthest first
  const near = cells.slice().sort((u, v) => Math.hypot(u[0] - pad[0], u[1] - pad[1]) - Math.hypot(v[0] - pad[0], v[1] - pad[1])).slice(0, 3).reverse();
  const look = cost(M, near[0], near[1], isCell) + cost(M, near[1], near[2], isCell) + cost(M, near[2], pad, (x, y) => M.ch(x, y) === 'o');
  const farthest = Math.max(...best.route.map(([c, r]) => Math.max(Math.abs(c - pad[0]), Math.abs(r - pad[1]))));
  return { best: +best.t.toFixed(1), route: best.route.map((p) => p.join(',')).join('>'), greedy: +greedy.toFixed(1), groute: pick.map((p) => p.join(',')).join('>'),
           look: +look.toFixed(1), lroute: near.map((p) => p.join(',')).join('>'), farthest };
}
function make(r, rows, nCells, nStub) {
  const cols = 5, cells = Array.from({ length: rows }, () => Array(cols).fill('.')), walls = { h: new Set(), v: new Set() };
  cells[rows - 1][2] = 'L';
  const free = []; for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) if (!(rr === 0 && c === 2) && !(rr === rows - 1 && c === 2) && !(rr === rows - 2 && c === 2)) free.push([c, rr]);
  for (let i = 0; i < nCells; i++) { const [c, rr] = free.splice(Math.floor(r() * free.length), 1)[0]; cells[rr][c] = 'o'; }
  for (let i = 0; i < nStub; i++) {
    if (r() < 0.5) walls.h.add(Math.floor(r() * cols) + ',' + (1 + Math.floor(r() * (rows - 1))));
    else walls.v.add((1 + Math.floor(r() * (cols - 1))) + ',' + Math.floor(r() * rows));
  }
  walls.h.delete('2,' + (rows - 1));                       // the pad is always reached from below
  const map = drawMap(cols, rows, cells, walls, 2, 2, ' ');
  // every cell and the pad reachable
  const M = readMap(map), seen = new Set(['2,0']), q = [[2, 0]];
  while (q.length) { const [c, rr] = q.pop(); for (const [d, dc, dr] of DIRS) { const nc = c + dc, nr = rr + dr; if (nc < 0 || nc >= cols || nr < 0 || nr >= rows || M.wall(c, rr, d) || seen.has(nc + ',' + nr)) continue; seen.add(nc + ',' + nr); q.push([nc, nr]); } }
  if (seen.size !== cols * rows) return null;
  return map;
}
if (require.main === module) {
  const r = seeded(Number(process.argv[2] || 13)), out = [];
  for (let t = 0; t < 30; t++) {
    const u = t / 29, rows = u < 0.2 ? 4 : u < 0.55 ? 5 : 6, nCells = 5 + Math.round(3 * u), nStub = Math.round(1 + 6 * u);
    const arrive = 0.95 - 0.05 * u;
    let best = null;
    for (let k = 0; k < 6000; k++) {
      const map = make(r, rows, nCells, nStub); if (!map) continue;
      const A = analyse(map), g = (A.greedy + 1.6) / (A.best + 1.6), l = (A.look + 1.6) / (A.best + 1.6);
      if (u < 0.15) { if (g > 1.3) continue; best = { map, ...A, g: +g.toFixed(2), l: +l.toFixed(2) }; break; }
      if (g < 1.9 || A.best > 8 + 5 * u) continue;                         // the way-in cells must fail
      if (u >= 0.45 && (l < 1.6 || A.farthest < 2)) continue;              // and, later, so must the cells that look nearest, and the answer reaches out
      const score = Math.min(g, 3) + Math.min(l, 3) + A.best * 0.15 + r() * 0.5;
      if (!best || score > best.score) best = { map, ...A, g: +g.toFixed(2), l: +l.toFixed(2), score };
    }
    if (!best) { console.error('none', t); continue; }
    best.leak = +(((1 - arrive) / (0.4 * (best.best + 1.6)))).toFixed(3); best.rank = t; best.arrive = arrive;
    out.push(best);
  }
  require('fs').writeFileSync('lad-fuel.json', JSON.stringify(out, null, 1));
  for (const o of out) console.log(o.rank, 'best', o.best, o.route, '| greedy x' + o.g, o.groute, '| look x' + o.l, o.lroute, '| reach', o.farthest, 'leak', o.leak);
  console.log(out[29].map.join('\n'));
}
