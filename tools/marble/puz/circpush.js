// THE CIRCUS'S PUSH PUZZLES: the search. A map as the game reads it (plazaGrid): rows of cells, edges between; row 0 at
// the bottom (the way in, column entry), the way out at the top (column exit). A push: the marble on the far side of a
// piece, rolling into it, moves it one cell, if that cell is floor and free. Fixed pieces ('x' a drum, '^' the scales'
// post, the clown car) stop pieces and the marble alike.
//   clowncar  'k' clowns; the car 'N' 'S' 'E' 'W', its back door facing that way: a clown pushed in through the door
//             is in the car and gone; any other side of the car is a wall. Every clown in the car
//   pyramid   'a' acrobats, 'o' spots ('A' an acrobat on a spot at the start): an acrobat on every spot
//   scales    '1'-'9' weights of so many kilos, 'l' the left pan's cells, 'r' the right's, '^' the post between;
//             sp.anvil: kilos already on a pan ('l5'). The pans level: the same kilos on each, and some on them
// Solved when the goal holds and the marble can roll to the way out.
const DIR = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }, OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
function parse(map, kind, sp = {}, entry = 2, exit = 2) {
  const rows = (map.length - 1) / 2, cols = (map[0].length - 1) / 2;
  const hE = (k, c) => map[2 * (rows - k)][2 * c + 1], vE = (r, c) => map[2 * (rows - 1 - r) + 1][2 * c];
  const ch = (c, r) => map[2 * (rows - 1 - r) + 1][2 * c + 1];
  const wall = (c, r, d) => (d === 'n' ? hE(r + 1, c) : d === 's' ? hE(r, c) : d === 'e' ? vE(r, c + 1) : vE(r, c)) !== ' ';
  const G = { kind, rows, cols, wall, fixed: new Set(), pieces: [], spots: new Set(), panL: new Set(), panR: new Set(), car: null, offL: 0, offR: 0, entry, exit };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = ch(c, r), i = r * cols + c;
    if (x === 'x' || x === '^' || x === '#') G.fixed.add(i);
    if (kind === 'clowncar') { if (x === 'k') G.pieces.push({ i, v: 1 }); if ('NSEW'.includes(x)) { G.car = { i, door: x.toLowerCase() }; G.fixed.add(i); } }
    if (kind === 'pyramid') { if (x === 'a' || x === 'A') G.pieces.push({ i, v: 1 }); if (x === 'o' || x === 'A') G.spots.add(i); }
    if (kind === 'scales') { if (/[1-9]/.test(x)) G.pieces.push({ i, v: +x }); if (x === 'l') G.panL.add(i); if (x === 'r') G.panR.add(i); }
  }
  if (sp.anvil) { const kg = +sp.anvil.slice(1); if (sp.anvil[0] === 'l') G.offL = kg; else G.offR = kg; }
  return G;
}
const step = (G, i, d) => {                              // the cell next door that way, or -1 (off the square, or a wall between)
  const c = i % G.cols, r = (i / G.cols) | 0, [dc, dr] = DIR[d], nc = c + dc, nr = r + dr;
  if (nc < 0 || nc >= G.cols || nr < 0 || nr >= G.rows || G.wall(c, r, d)) return -1;
  return nr * G.cols + nc;
};
function reach(G, occ, from) {                           // the cells the marble can roll to
  const seen = new Set([from]), q = [from];
  while (q.length) { const i = q.pop(); for (const d in DIR) { const j = step(G, i, d); if (j < 0 || seen.has(j) || occ.has(j) || G.fixed.has(j)) continue; seen.add(j); q.push(j); } }
  return seen;
}
// A state: each piece's cell (-1: in the car), pieces of equal weight sorted among themselves; and the marble's region.
const canon = (G, P) => { const out = P.slice(); const byV = {}; G.pieces.forEach((p, k) => (byV[p.v] = byV[p.v] || []).push(k));
  for (const ks of Object.values(byV)) { const s = ks.map((k) => out[k]).sort((a, b) => a - b); ks.forEach((k, j) => { out[k] = s[j]; }); } return out; };
function goal(G, P, reg) {
  if (!reg.has((G.rows - 1) * G.cols + G.exit)) return false;
  if (G.kind === 'clowncar') return P.every((i) => i < 0);
  if (G.kind === 'pyramid') return [...G.spots].every((s) => P.includes(s));
  let L = G.offL, R = G.offR, n = 0;
  P.forEach((i, k) => { if (G.panL.has(i)) { L += G.pieces[k].v; n++; } if (G.panR.has(i)) { R += G.pieces[k].v; n++; } });
  return n > 0 && L === R;
}
// Every push the marble could make now: [piece, direction, where it goes (-1 into the car)].
function pushes(G, P, reg) {
  const occ = new Set(P.filter((i) => i >= 0)), out = [];
  P.forEach((i, k) => {
    if (i < 0) return;
    for (const d in DIR) {
      const b = step(G, i, OPP[d]); if (b < 0 || !reg.has(b)) continue;
      const t = step(G, i, d); if (t < 0 || occ.has(t)) continue;
      if (G.car && t === G.car.i) { if (G.car.door === OPP[d]) out.push([k, d, -1]); continue; }   // in through the back door only
      if (G.fixed.has(t)) continue;
      out.push([k, d, t]);
    }
  });
  return out;
}
const key = (P, reg) => P.join(',') + '|' + Math.min(...reg);
function solve(G, limit = 400000) {
  const P0 = canon(G, G.pieces.map((p) => p.i)), occ0 = new Set(P0), reg0 = reach(G, occ0, G.entry);
  const seen = new Map([[key(P0, reg0), null]]), Q = [[P0, reg0]];
  for (let h = 0; h < Q.length && h < limit; h++) {
    const [P, reg] = Q[h];
    if (goal(G, P, reg)) { const path = []; let k = key(P, reg); while (seen.get(k)) { const s = seen.get(k); path.unshift(s.push); k = s.from; } return { solved: true, pushes: path.length, path, states: seen.size }; }
    for (const [k, d, t] of pushes(G, P, reg)) {
      const from = P[k], P2 = canon(G, P.map((x, j) => (j === k ? t : x))), reg2 = reach(G, new Set(P2.filter((i) => i >= 0)), from), kk = key(P2, reg2);
      if (seen.has(kk)) continue;
      seen.set(kk, { from: key(P, reg), push: [from, d] }); Q.push([P2, reg2]);
    }
  }
  return { solved: false, states: seen.size };
}
// The careless player: any push they can make, at random, until it is solved or `max` pushes have gone by.
function randomPlay(G, runs = 400, max = 24, seed = 11) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let won = 0;
  for (let n = 0; n < runs; n++) {
    let P = G.pieces.map((p) => p.i), reg = reach(G, new Set(P), G.entry);
    for (let m = 0; m <= max; m++) {
      if (goal(G, P, reg)) { won++; break; }
      if (m === max) break;
      const opts = pushes(G, P, reg); if (!opts.length) break;
      const [k, d, t] = opts[Math.floor(rnd() * opts.length)], from = P[k];
      P = P.map((x, j) => (j === k ? t : x)); reg = reach(G, new Set(P.filter((i) => i >= 0)), from);
    }
  }
  return won / runs;
}
// The scales' arithmetic alone: how many ways the weights level them (each pan holds as many as it has cells), and whether
// the obvious way (the heaviest that does not tip it past level, onto the lighter pan, again and again) finds one.
function scalesSums(G) {
  const w = G.pieces.map((p) => p.v), nL = G.panL.size, nR = G.panR.size;
  let ways = 0;
  const rec = (k, L, R, a, b, n) => { if (k === w.length) { if (n && L === R) ways++; return; } rec(k + 1, L, R, a, b, n); if (a < nL) rec(k + 1, L + w[k], R, a + 1, b, n + 1); if (b < nR) rec(k + 1, L, R + w[k], a, b + 1, n + 1); };
  rec(0, G.offL, G.offR, 0, 0, 0);
  let L = G.offL, R = G.offR, a = 0, b = 0; const left = w.slice().sort((x, y) => y - x);
  for (let g = 0; g < 8 && (L !== R || a + b === 0); g++) {
    const toL = L < R || (L === R && a <= b), diff = Math.abs(L - R), room = toL ? a < nL : b < nR;
    const pick = room ? left.findIndex((x) => x <= diff || (diff === 0)) : -1; if (pick < 0) break;
    const x = left.splice(pick, 1)[0]; if (toL) { L += x; a++; } else { R += x; b++; }
  }
  return { ways, greedy: L === R && a + b > 0 };
}
module.exports = { parse, solve, randomPlay, scalesSums, reach, pushes, goal, DIR, OPP };
