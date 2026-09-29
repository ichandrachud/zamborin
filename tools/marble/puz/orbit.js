// SATELLITES INTO ORBIT: the search. A map as the game reads it (plazaGrid): rows of cells, edges between.
// 's' a satellite, 'o' a dock, 'x' an asteroid (a fixed block), '.' floor. Walls '-' '|'; the way out a gap or '='.
// A push: the marble on the far side of a satellite, rolling into it, sends it gliding until the next cell is
// off the square, behind a wall, or taken. It stops; on a dock it docks and never moves again.
function parse(map, entry, exit) {
  const rows = (map.length - 1) / 2, cols = (map[0].length - 1) / 2;
  const hEdge = (k, c) => map[2 * (rows - k)][2 * c + 1], vEdge = (r, c) => map[2 * (rows - 1 - r) + 1][2 * c];
  const cell = (c, r) => map[2 * (rows - 1 - r) + 1][2 * c + 1];
  const wall = (c, r, d) => { const e = d === 'n' ? hEdge(r + 1, c) : d === 's' ? hEdge(r, c) : d === 'e' ? vEdge(r, c + 1) : vEdge(r, c); return e !== ' '; };
  const sats = [], docks = [], rocks = new Set();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const ch = cell(c, r); if (ch === 's') sats.push(c + r * cols); if (ch === 'o') docks.push(c + r * cols); if (ch === 'x') rocks.add(c + r * cols); if (ch === 'S') { sats.push(c + r * cols); docks.push(c + r * cols); } }
  return { rows, cols, wall, sats, docks, rocks, entry, exit };
}
const D = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }, OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
function reach(G, occ, from) {                      // the cells the marble can get to
  const seen = new Set([from]), q = [from];
  while (q.length) {
    const i = q.pop(), c = i % G.cols, r = (i / G.cols) | 0;
    for (const [d, [dc, dr]] of Object.entries(D)) {
      const nc = c + dc, nr = r + dr; if (nc < 0 || nc >= G.cols || nr < 0 || nr >= G.rows || G.wall(c, r, d)) continue;
      const j = nc + nr * G.cols; if (seen.has(j) || occ.has(j) || G.rocks.has(j)) continue;
      seen.add(j); q.push(j);
    }
  }
  return seen;
}
function slide(G, occ, i, d) {
  let c = i % G.cols, r = (i / G.cols) | 0, n = 0; const [dc, dr] = D[d];
  for (;;) { const nc = c + dc, nr = r + dr; if (nc < 0 || nc >= G.cols || nr < 0 || nr >= G.rows || G.wall(c, r, d)) break; const j = nc + nr * G.cols; if (occ.has(j) || G.rocks.has(j)) break; c = nc; r = nr; n++; }
  return n ? c + r * G.cols : -1;
}
// state: sorted satellite cells (docked ones marked +1000), and the marble's region (its smallest reachable cell)
function solve(G, limit = 200000) {
  const docks = new Set(G.docks), start = G.entry;
  const key = (sats, m) => sats.join(',') + '|' + m;
  const norm = (sats) => sats.map((s) => (s >= 1000 ? s : docks.has(s) ? s + 1000 : s)).sort((a, b) => a - b);
  const s0 = norm(G.sats.slice());
  const occOf = (sats) => new Set(sats.map((s) => s % 1000));
  const reg0 = reach(G, occOf(s0), start), m0 = Math.min(...reg0);
  const seen = new Map([[key(s0, m0), null]]), q = [[s0, reg0, m0]]; let head = 0, win = null, n = 0;
  const exitCell = G.exit + (G.rows - 1) * G.cols;
  while (head < q.length && n < limit) {
    const [sats, reg, m] = q[head++]; n++;
    if (sats.every((s) => s >= 1000) && reg.has(exitCell)) { win = key(sats, m); break; }
    const occ = occOf(sats);
    sats.forEach((s, k) => {
      if (s >= 1000) return;
      const c = s % G.cols, r = (s / G.cols) | 0;
      for (const d of Object.keys(D)) {
        const [dc, dr] = D[d], bc = c - dc, br = r - dr;              // where the marble must be
        if (bc < 0 || bc >= G.cols || br < 0 || br >= G.rows || G.wall(c, r, OPP[d])) continue;
        if (!reg.has(bc + br * G.cols)) continue;
        const t = slide(G, occ, s, d); if (t < 0) continue;
        const ns = norm(sats.map((x, kk) => (kk === k ? t : x)));
        const nr = reach(G, occOf(ns), s);                            // the marble ends where the satellite was
        const nm = Math.min(...nr), kk = key(ns, nm);
        if (seen.has(kk)) continue;
        seen.set(kk, { from: key(sats, m), push: [s, d, t] }); q.push([ns, nr, nm]);
      }
    });
  }
  if (!win) return { solved: false, states: seen.size };
  const path = []; for (let k = win; seen.get(k); k = seen.get(k).from) path.unshift(seen.get(k).push);
  // dead ends: states from which no win is reachable (search the whole graph backwards from wins)
  return { solved: true, pushes: path.length, path: path.map(([s, d, t]) => `${s % G.cols},${(s / G.cols) | 0}${d}>${t % G.cols},${(t / G.cols) | 0}`), states: seen.size };
}
// every reachable state, and how many of them can no longer be won (traps)
function traps(G) {
  const docks = new Set(G.docks), start = G.entry, exitCell = G.exit + (G.rows - 1) * G.cols;
  const norm = (sats) => sats.map((s) => (s >= 1000 ? s : docks.has(s) ? s + 1000 : s)).sort((a, b) => a - b);
  const occOf = (sats) => new Set(sats.map((s) => s % 1000));
  const s0 = norm(G.sats.slice()), r0 = reach(G, occOf(s0), start);
  const K = (s, m) => s.join(',') + '|' + m, nodes = new Map(), q = [[s0, r0]];
  nodes.set(K(s0, Math.min(...r0)), { next: [], win: false });
  for (let h = 0; h < q.length && h < 300000; h++) {
    const [sats, reg] = q[h], k0 = K(sats, Math.min(...reg)), N = nodes.get(k0);
    if (sats.every((s) => s >= 1000) && reg.has(exitCell)) N.win = true;
    const occ = occOf(sats);
    sats.forEach((s, k) => {
      if (s >= 1000) return;
      const c = s % G.cols, r = (s / G.cols) | 0;
      for (const d of Object.keys(D)) {
        const [dc, dr] = D[d], bc = c - dc, br = r - dr;
        if (bc < 0 || bc >= G.cols || br < 0 || br >= G.rows || G.wall(c, r, OPP[d]) || !reg.has(bc + br * G.cols)) continue;
        const t = slide(G, occ, s, d); if (t < 0) continue;
        const ns = norm(sats.map((x, kk) => (kk === k ? t : x))), nr = reach(G, occOf(ns), s), kk = K(ns, Math.min(...nr));
        N.next.push(kk);
        if (!nodes.has(kk)) { nodes.set(kk, { next: [], win: false }); q.push([ns, nr]); }
      }
    });
  }
  // backwards: which can still win
  let changed = true; const can = new Set([...nodes].filter(([, v]) => v.win).map(([k]) => k));
  while (changed) { changed = false; for (const [k, v] of nodes) if (!can.has(k) && v.next.some((n) => can.has(n))) { can.add(k); changed = true; } }
  return { states: nodes.size, dead: nodes.size - can.size };
}
module.exports = { parse, solve, traps };
if (require.main === module) {
  const L = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
  for (const [id, T] of Object.entries(L)) { const G = parse(T.map, T.entry, T.exit); console.log(id, JSON.stringify(solve(G)), JSON.stringify(traps(G))); }
}
// A player pushing at random: how often they get every satellite docked (within 30 pushes), and how many first pushes are already lost.
function randomPlay(G, trials = 2000, seed = 3) {
  const rnd = ((s) => () => ((s = (s * 16807) % 2147483647) / 2147483647))(seed);
  const docks = new Set(G.docks), D2 = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }, OPP2 = { n: 's', s: 'n', e: 'w', w: 'e' };
  const norm = (sats) => sats.map((s) => (s >= 1000 ? s : docks.has(s) ? s + 1000 : s)).sort((a, b) => a - b);
  const occOf = (sats) => new Set(sats.map((s) => s % 1000));
  const moves = (sats, reg) => { const out = [], occ = occOf(sats); sats.forEach((s, k) => { if (s >= 1000) return; const c = s % G.cols, r = (s / G.cols) | 0;
    for (const d of Object.keys(D2)) { const [dc, dr] = D2[d], bc = c - dc, br = r - dr; if (bc < 0 || bc >= G.cols || br < 0 || br >= G.rows || G.wall(c, r, OPP2[d]) || !reg.has(bc + br * G.cols)) continue;
      const t = slide(G, occ, s, d); if (t >= 0) out.push([k, t, s]); } }); return out; };
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    let sats = norm(G.sats.slice()), reg = reach(G, occOf(sats), G.entry);
    for (let n = 0; n < 30; n++) {
      if (sats.every((s) => s >= 1000)) { wins++; break; }
      const mv = moves(sats, reg); if (!mv.length) break;
      const [k, t, s] = mv[Math.floor(rnd() * mv.length)];
      sats = norm(sats.map((x, kk) => (kk === k ? t : x))); reg = reach(G, occOf(sats), s);
    }
  }
  return +(wins / trials).toFixed(3);
}
module.exports.randomPlay = randomPlay;
