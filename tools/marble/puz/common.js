// Shared by the layout generators: a seeded random, and a square's map drawn from cells and inner walls.
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
// cells[r][c]: a character ('.' floor); walls: { h: Set('c,k') south edges of row k, v: Set('c,r') west edges of column c }.
// Border: '-' and '|' everywhere but the way in (bottom, column entry) and the way out (top, column exit: exitCh).
function drawMap(cols, rows, cells, walls, entry, exit, exitCh = '=', voidRows = new Set()) {
  const L = [];
  for (let i = 0; i < 2 * rows + 1; i++) L.push(Array(2 * cols + 1).fill(' '));
  for (let i = 0; i < 2 * rows + 1; i += 2) for (let j = 0; j < 2 * cols + 1; j += 2) L[i][j] = '+';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) L[2 * (rows - 1 - r) + 1][2 * c + 1] = cells[r][c];
  for (let c = 0; c < cols; c++) { L[0][2 * c + 1] = c === exit ? exitCh : '-'; L[2 * rows][2 * c + 1] = c === entry ? ' ' : '-'; }
  for (let r = 0; r < rows; r++) if (!voidRows.has(r)) { L[2 * (rows - 1 - r) + 1][0] = '|'; L[2 * (rows - 1 - r) + 1][2 * cols] = '|'; }
  for (const e of walls.h || []) { const [c, k] = e.split(',').map(Number); L[2 * (rows - k)][2 * c + 1] = '-'; }
  for (const e of walls.v || []) { const [c, r] = e.split(',').map(Number); L[2 * (rows - 1 - r) + 1][2 * c] = '|'; }
  return L.map((l) => l.join(''));
}
// A map read back: wall(c, r, d) and ch(c, r).
function readMap(map) {
  const rows = (map.length - 1) / 2, cols = (map[0].length - 1) / 2;
  const hE = (k, c) => map[2 * (rows - k)][2 * c + 1], vE = (r, c) => map[2 * (rows - 1 - r) + 1][2 * c];
  return { rows, cols, ch: (c, r) => map[2 * (rows - 1 - r) + 1][2 * c + 1],
           wall: (c, r, d) => (d === 'n' ? hE(r + 1, c) : d === 's' ? hE(r, c) : d === 'e' ? vE(r, c + 1) : vE(r, c)) !== ' ' };
}
const DIRS = [['n', 0, 1], ['s', 0, -1], ['e', 1, 0], ['w', -1, 0]];
// Cells reachable from `from` without entering a blocked cell (the target may be blocked: it is where you are going).
function reachSet(M, from, blocked) {
  const k = (c, r) => c + ',' + r, seen = new Set([k(...from)]), q = [from];
  while (q.length) {
    const [c, r] = q.pop();
    for (const [d, dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nc >= M.cols || nr < 0 || nr >= M.rows || M.wall(c, r, d) || seen.has(k(nc, nr)) || M.ch(nc, nr) === '#') continue;
      seen.add(k(nc, nr)); if (!blocked(nc, nr)) q.push([nc, nr]);
    }
  }
  return seen;
}
module.exports = { seeded, drawMap, readMap, reachSet, DIRS };
