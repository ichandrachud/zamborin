// THE AIRLOCK, a ladder: more keys, longer codes. Keys never side by side (a way round each), every key reachable
// without rolling over another, codes with no key twice running and every key used.
const { seeded, drawMap, readMap, reachSet } = require('./common.js');
function make(r, m, len, rows) {
  const cols = 5, entry = 2, exit = 2, keys = [];
  for (let tries = 0; keys.length < m && tries < 500; tries++) {
    const c = Math.floor(r() * cols), rr = 1 + Math.floor(r() * (rows - 2));
    if (keys.some(([a, b]) => Math.abs(a - c) + Math.abs(b - rr) < 2 || (Math.abs(a - c) <= 1 && Math.abs(b - rr) <= 1))) continue;
    keys.push([c, rr]);
  }
  if (keys.length < m) return null;
  keys.sort((a, b) => a[1] - b[1] || a[0] - b[0]);          // numbered like a keypad: bottom row first, left to right
  const cells = Array.from({ length: rows }, () => Array(cols).fill('.'));
  keys.forEach(([c, rr], i) => { cells[rr][c] = 'abcdef'[i]; });
  const map = drawMap(cols, rows, cells, {}, entry, exit), M = readMap(map), key = (c, rr) => /[a-f]/.test(M.ch(c, rr));
  const reach = reachSet(M, [entry, 0], key);
  if (keys.some(([c, rr]) => !reach.has(c + ',' + rr)) || !reach.has(exit + ',' + (rows - 1))) return null;
  let code;
  for (let tries = 0; tries < 200; tries++) {
    code = ''; let last = -1;
    for (let i = 0; i < len; i++) { let k; do k = Math.floor(r() * m); while (k === last); code += 'abcdef'[k]; last = k; }
    if (new Set(code).size === Math.min(m, len) && !/abc|bcd|cde|def|fed|edc|dcb|cba/.test(code)) break;
  }
  return { map, tune: code, entry, exit };
}
if (require.main === module) {
  const r = seeded(Number(process.argv[2] || 3)), out = [];
  for (let t = 0; t < 30; t++) {
    const u = t / 29, m = Math.min(6, 3 + Math.floor(u * 3.99)), len = Math.round(3 + 5 * u), rows = m <= 3 ? 4 : m <= 4 ? 5 : 6;
    let T = null; while (!T) T = make(r, m, len, rows);
    out.push({ rank: t, keys: m, len, ...T });
  }
  require('fs').writeFileSync('lad-air.json', JSON.stringify(out, null, 1));
  for (const o of out) console.log(o.rank, 'keys', o.keys, 'code', o.tune);
  console.log(out[29].map.join('\n'));
}
