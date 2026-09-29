// WORMHOLES, a ladder. Templates of islands; items placed at random so that on every island the cells you may roll over
// (floor and exits) are one piece and every scoop and flag touches it; the fewest scoops to the island with the way out
// rises; there is no state you cannot get out of (a fall into space puts you back at the start, flags as they were);
// taking the first scoop on each island, flags alone, never gets there.
const { seeded } = require('./common.js');
const { parse } = require('./scoops.js');
const TEMPLATES = {
  A: { rows: 4, isl: [[[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1]], [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3]]], voidRows: [2], walls: [] },
  B: { rows: 6, isl: [[[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], [[0, 2], [1, 2], [0, 3], [1, 3]], [[3, 2], [4, 2], [3, 3], [4, 3]], [[0, 5], [1, 5], [2, 5], [3, 5], [4, 5]]],
       voidRows: [1, 4], voidCells: [[2, 2], [2, 3]], walls: ['2,2', '2,3', '3,2', '3,3'] },
  C: { rows: 6, isl: [[[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], [[0, 2], [1, 2], [0, 3], [1, 3]], [[2, 2], [2, 3]], [[3, 2], [4, 2], [3, 3], [4, 3]], [[0, 5], [1, 5], [2, 5], [3, 5], [4, 5]]],
       voidRows: [1, 4], voidCells: [], walls: ['2,2', '2,3', '3,2', '3,3'] },
};
function draw(Tm, items) {
  const rows = Tm.rows, cols = 5, L = [];
  for (let i = 0; i < 2 * rows + 1; i++) L.push(Array(2 * cols + 1).fill(' '));
  for (let i = 0; i < 2 * rows + 1; i += 2) for (let j = 0; j < 2 * cols + 1; j += 2) L[i][j] = '+';
  const cell = (c, r, ch) => { L[2 * (rows - 1 - r) + 1][2 * c + 1] = ch; };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cell(c, r, Tm.voidRows.includes(r) ? '#' : '.');
  for (const [c, r] of Tm.voidCells || []) cell(c, r, '#');
  for (let c = 0; c < cols; c++) { L[0][2 * c + 1] = c === 2 ? ' ' : '-'; L[2 * rows][2 * c + 1] = c === 2 ? ' ' : '-'; }
  for (let r = 0; r < rows; r++) if (!Tm.voidRows.includes(r)) { L[2 * (rows - 1 - r) + 1][0] = '|'; L[2 * (rows - 1 - r) + 1][2 * cols] = '|'; }
  for (const w of Tm.walls) { const [c, r] = w.split(',').map(Number); L[2 * (rows - 1 - r) + 1][2 * c] = '|'; }
  for (const [c, r, ch] of items) cell(c, r, ch);
  return L.map((l) => l.join(''));
}
function make(r, name, nCol) {
  const Tm = TEMPLATES[name], isl = Tm.isl, X = isl.length - 1, items = [], used = new Set(['2,0', '2,' + (Tm.rows - 1)]);
  const spot = (k) => { const free = isl[k].filter(([c, rr]) => !used.has(c + ',' + rr)); if (!free.length) return null; const p = free[Math.floor(r() * free.length)]; used.add(p.join(',')); return p; };
  for (let col = 0; col < nCol; col++) {
    // two exits: one on the island with the way out for at least one colour, the other elsewhere
    const a = col === 0 ? X : 1 + Math.floor(r() * (X - 1 || 1)), b = (() => { let k; do k = Math.floor(r() * X); while (k === a && X > 1); return k; })();
    const litA = r() < 0.15 && a !== X;
    const pa = spot(a), pb = spot(b); if (!pa || !pb) return null;
    items.push([...pa, litA ? 'ABC'[col] : 'DEF'[col]], [...pb, litA ? 'DEF'[col] : 'ABC'[col]]);
    const pf = spot(Math.floor(r() * X)); if (!pf) return null; items.push([...pf, 'fgh'[col]]);
  }
  for (let k = 0; k < X; k++) { const p = spot(k); if (!p) return null; items.push([...p, 'abc'[Math.floor(r() * nCol)]]); }   // a scoop on every island but the last
  for (let e = 0; e < Math.floor(r() * 2); e++) { const k = Math.floor(r() * X), p = spot(k); if (p) items.push([...p, 'abc'[Math.floor(r() * nCol)]]); }
  return { name, map: draw(Tm, items), Tm };
}
function roomy(T) {                                       // on each island the floor you may roll over is one piece, and every trigger touches it
  const trig = new Set(), rows = T.Tm.rows;
  const ch = (c, r) => T.map[2 * (rows - 1 - r) + 1][2 * c + 1];
  for (const I of T.Tm.isl) {
    const cellsIn = new Set(I.map((p) => p.join(','))), free = I.filter(([c, r]) => !/[abcfgh]/.test(ch(c, r)));
    if (!free.length) return false;
    const seen = new Set([free[0].join(',')]), q = [free[0]];
    while (q.length) { const [c, r] = q.pop(); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (c + dc) + ',' + (r + dr); if (!cellsIn.has(k) || seen.has(k) || /[abcfgh]/.test(ch(c + dc, r + dr))) continue;
      if (T.Tm.walls.includes(Math.max(c, c + dc) + ',' + r) && dc) continue; seen.add(k); q.push([c + dc, r + dr]); } }
    if (seen.size !== free.length) return false;
    for (const [c, r] of I) if (/[abcfgh]/.test(ch(c, r)) && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => seen.has((c + dc) + ',' + (r + dr)) && !(dc && T.Tm.walls.includes(Math.max(c, c + dc) + ',' + r)))) return false;
  }
  return true;
}
function analyse(G) {                                     // shortest (scoops, flags thrown) WITHOUT falling; that every state can still win (a fall allowed); careless
  const K = (i, l) => i + ':' + l.join('');
  const moves = (i, lit) => {                               // the scoop moves from here: [state, flags thrown]
    const out = [], fl = [...new Set(G.I[i].flags)];
    for (let m = 0; m < 1 << fl.length; m++) {
      const l2 = lit.slice(); let nf = 0; fl.forEach((col, b) => { if (m >> b & 1) { l2[col] ^= 1; nf++; } });
      for (const col of new Set(G.I[i].scoops)) { const to = G.exits[col][l2[col]]; if (to !== undefined) out.push([[to, l2], nf]); }
    }
    return out;
  };
  // 1. the answer, by scoops alone
  const dist = new Map([[K(G.start, G.lit0), [0, 0]]]), Q = [[G.start, G.lit0]];
  let best = null;
  for (let h = 0; h < Q.length; h++) {
    const [i, lit] = Q[h], [d0, f0] = dist.get(K(i, lit));
    if (i === G.goal) { if (!best || d0 < best[0] || (d0 === best[0] && f0 < best[1])) best = [d0, f0]; continue; }
    for (const [s2, nf] of moves(i, lit)) { const k = K(...s2); if (!dist.has(k)) { dist.set(k, [d0 + 1, f0 + nf]); Q.push(s2); } }
  }
  if (!best) return null;
  // 2. nothing you cannot get out of: every state reachable (falls allowed) can still reach the goal by scoops (falls allowed)
  const all = new Map([[K(G.start, G.lit0), [G.start, G.lit0]]]), Q2 = [[G.start, G.lit0]], edges = new Map();
  for (let h = 0; h < Q2.length; h++) {
    const [i, lit] = Q2[h], nx = moves(i, lit).map(([s2]) => s2); if (i !== G.start) nx.push([G.start, lit]);
    edges.set(K(i, lit), nx.map((s2) => K(...s2)));
    for (const s2 of nx) { const k = K(...s2); if (!all.has(k)) { all.set(k, s2); Q2.push(s2); } }
  }
  const can = new Set([...all.keys()].filter((k) => +k.split(':')[0] === G.goal)); let ch = true;
  while (ch) { ch = false; for (const [k, n] of edges) if (!can.has(k) && n.some((x) => can.has(x))) { can.add(k); ch = true; } }
  let i = G.start, lit = G.lit0.slice(), careless = false;
  for (let n = 0; n < 12; n++) { if (i === G.goal) { careless = true; break; } const s = G.I[i].scoops[0]; if (s === undefined) break; i = G.exits[s][lit[s]]; }
  return { scoops: best[0], flags: best[1], stuck: all.size - can.size, states: all.size, careless };
}
if (require.main === module) {
  const r = seeded(Number(process.argv[2] || 11)), out = [];
  for (const [name, nCol, lo, hi, n] of [['A', 1, 1, 1, 3], ['B', 1, 2, 2, 3], ['B', 2, 2, 3, 6], ['B', 2, 3, 4, 4], ['C', 2, 3, 4, 4], ['B', 3, 3, 5, 4], ['C', 3, 4, 4, 3], ['C', 3, 5, 6, 3]]) {
    const found = [], seenMaps = new Set();
    for (let t = 0; t < 400000 && found.length < n; t++) {
      const T = make(r, name, nCol); if (!T || !roomy(T)) continue;
      const G = parse(T.map, 2, 2); if (G.goal === undefined || G.start === undefined) continue;
      const A = analyse(G); if (!A || A.careless || A.stuck || A.scoops < lo || A.scoops > hi || A.flags < 1) continue;
      const key = T.map.join(''); if (seenMaps.has(key)) continue; seenMaps.add(key);
      found.push({ template: name, colours: nCol, ...A, map: T.map });
    }
    if (found.length < n) console.error('short', name, nCol, lo, hi, found.length);
    found.sort((a, b) => a.scoops - b.scoops || a.flags - b.flags); out.push(...found);
  }
  out.forEach((o, i) => { o.rank = i; });
  require('fs').writeFileSync('lad-holes.json', JSON.stringify(out, null, 1));
  for (const o of out) console.log(o.rank, o.template, 'colours', o.colours, 'scoops', o.scoops, 'flags', o.flags, 'states', o.states);
  console.log(out[out.length - 1].map.join('\n'));
}
