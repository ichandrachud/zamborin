// THE CIRCUS'S ROUTE PUZZLES, the ladders: 22 of the ticket turnstiles and 22 of the house of mirrors, easy to hard.
//   node gencircroute.js [seed]   writes lad-tickets.json and lad-mirrors.json
const { seeded, drawMap } = require('./common.js');
const fs = require('fs');
const DIRS = [['n', 0, 1], ['s', 0, -1], ['e', 1, 0], ['w', -1, 0]];
// Edges by name, as the game names them: 'H c,k' the south edge of row k in column c, 'V c,r' the west edge of column c.
const edgeOf = (c, r, d) => (d === 'n' ? 'H' + c + ',' + (r + 1) : d === 's' ? 'H' + c + ',' + r : d === 'e' ? 'V' + (c + 1) + ',' + r : 'V' + c + ',' + r);
function render(cols, rows, E, cells, entry, exit) {       // E: edge name -> '-', '|', a digit, 'g' (inner edges only; the border is drawn)
  const walls = { h: new Set(), v: new Set() };
  const L = drawMap(cols, rows, cells, walls, entry, exit, E['H' + exit + ',' + rows] || '=').map((l) => [...l]);
  for (const [k, ch] of Object.entries(E)) {
    const [a, b] = k.slice(1).split(',').map(Number);
    if (k[0] === 'H') { if (b === 0 || b === rows) continue; L[2 * (rows - b)][2 * a + 1] = ch === 'wall' ? '-' : ch; }
    else { if (a === 0 || a === cols) continue; L[2 * (rows - 1 - b) + 1][2 * a] = ch === 'wall' ? '|' : ch; }
  }
  return L.map((l) => l.join(''));
}

// ---- TICKETS ----
// The search: which turnstiles to pay for. Tickets are free to pick up, so the marble always has every ticket it can
// reach; a state is just the set of turnstiles paid for.
function ticketsSolve(T) {
  const { cols, rows, E, tickets, turns, exitId } = T;
  const region = (paid) => {
    const seen = new Set(['2,0']), q = [[2, 0]];
    while (q.length) { const [c, r] = q.pop(); for (const [d, dc, dr] of DIRS) { const nc = c + dc, nr = r + dr; if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const e = E[edgeOf(c, r, d)]; if (e === 'wall' || (e && !(paid >> turns.findIndex((t) => t.e === edgeOf(c, r, d)) & 1))) continue;
      const k = nc + ',' + nr; if (!seen.has(k)) { seen.add(k); q.push([nc, nr]); } } }
    return seen;
  };
  const held = (paid, reg) => tickets.filter((t) => reg.has(t)).length - turns.reduce((s, t, i) => s + (paid >> i & 1 ? t.p : 0), 0);
  const moves = (paid) => { const reg = region(paid), h = held(paid, reg); return turns.map((t, i) => (!(paid >> i & 1) && t.p <= h && (reg.has(t.a) !== reg.has(t.b) || (i === exitId && reg.has(t.a))) ? i : -1)).filter((i) => i >= 0).map((i) => ({ i, reg, h })); };
  const seen = new Map([[0, 0]]), q = [0]; let best = null, wins = 0;
  for (let h = 0; h < q.length; h++) {
    const s = q[h];
    if (s >> exitId & 1) { wins++; if (best === null) best = s; continue; }
    for (const { i } of moves(s)) { const s2 = s | (1 << i); if (!seen.has(s2)) { seen.set(s2, seen.get(s) + 1); q.push(s2); } }
  }
  const rand = (runs, rnd, pick) => { let w = 0; for (let n = 0; n < runs; n++) { let s = 0; for (let k = 0; k < 12; k++) { if (s >> exitId & 1) { w++; break; } const m = moves(s); if (!m.length) break; s |= 1 << pick(m, rnd).i; } } return w / runs; };
  let rs = 5; const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  const random = rand(300, rnd, (m, r) => m[Math.floor(r() * m.length)]);
  const cheap = rand(1, rnd, (m) => m.slice().sort((a, b) => turns[a.i].p - turns[b.i].p)[0]);
  const opens = best === null ? 0 : [...Array(turns.length).keys()].filter((i) => best >> i & 1).length;
  return { solved: best !== null, opens, wins, states: seen.size, random, cheap, paid: best === null ? [] : turns.filter((t, i) => best >> i & 1).map((t) => t.e) };
}
function makeTickets(r, rows, nTickets) {
  const cols = 5, E = {}, exit = Math.floor(r() * cols);
  const bands = []; for (let y = 0; y < rows;) { const h = y === 0 ? 1 + (r() < 0.5 ? 1 : 0) : 1 + (r() < 0.45 ? 1 : 0); bands.push([y, Math.min(rows, y + h)]); y += h; }
  for (const [y0] of bands) if (y0 > 0) for (let c = 0; c < cols; c++) E['H' + c + ',' + y0] = 'wall';
  for (const [y0, y1] of bands) { const n = r() < 0.25 ? 0 : r() < 0.7 ? 1 : 2, cuts = new Set(); while (cuts.size < n) cuts.add(1 + Math.floor(r() * (cols - 1))); for (const c of cuts) for (let y = y0; y < y1; y++) E['V' + c + ',' + y] = 'wall'; }
  // the rooms, and a doorway between each pair of rooms that touch (a turnstile, now and then just a gap)
  const room = {}; let n = 0;
  for (let y = 0; y < rows; y++) for (let c = 0; c < cols; c++) { if (room[c + ',' + y] !== undefined) continue; const q = [[c, y]]; room[c + ',' + y] = n;
    while (q.length) { const [a, b] = q.pop(); for (const [d, dc, dr] of DIRS) { const na = a + dc, nb = b + dr; if (na < 0 || na >= cols || nb < 0 || nb >= rows || E[edgeOf(a, b, d)] === 'wall' || room[na + ',' + nb] !== undefined) continue; room[na + ',' + nb] = n; q.push([na, nb]); } } n++; }
  const pairs = {};
  for (const [k, v] of Object.entries(E)) { if (v !== 'wall') continue; const [a, b] = k.slice(1).split(',').map(Number); const [p, q2] = k[0] === 'H' ? [a + ',' + (b - 1), a + ',' + b] : [(a - 1) + ',' + b, a + ',' + b]; if (room[p] === room[q2]) continue; const key = [room[p], room[q2]].sort().join('-'); (pairs[key] = pairs[key] || []).push([k, p, q2]); }
  const turns = [];
  for (const list of Object.values(pairs)) { if (r() < 0.12) continue; const [k, a, b] = list[Math.floor(r() * list.length)]; if (r() < 0.15) { delete E[k]; continue; } const p = 1 + Math.floor(r() * 3); E[k] = String(p); turns.push({ e: k, a, b, p }); }
  const ep = 1 + Math.floor(r() * 2), ek = 'H' + exit + ',' + rows; E[ek] = String(ep); turns.push({ e: ek, a: exit + ',' + (rows - 1), b: 'out', p: ep });
  const cells = Array.from({ length: rows }, () => Array(cols).fill('.')), tickets = [];
  for (let t = 0; t < 200 && tickets.length < nTickets; t++) { const c = Math.floor(r() * cols), y = Math.floor(r() * rows); if ((c === 2 && y === 0) || cells[y][c] !== '.') continue; cells[y][c] = 't'; tickets.push(c + ',' + y); }
  return { cols, rows, E, tickets, turns, exitId: turns.length - 1, exit, cells };
}
function ticketsLadder(r) {
  const out = [];
  // [rows, tickets, how many, fewest turnstiles to pay, random at most, cheapest-first must fail]
  for (const [rows, nt, count, minOpen, rmax, cheapFail] of [[4, 3, 3, 2, 0.75, false], [5, 4, 3, 2, 0.5, false], [5, 5, 4, 3, 0.35, true], [6, 5, 4, 3, 0.25, true], [6, 6, 4, 3, 0.15, true], [7, 7, 4, 4, 0.1, true]]) {
    const found = [];
    for (let t = 0; t < 60000 && found.length < count; t++) {
      const T = makeTickets(r, rows, nt), S = ticketsSolve(T);
      if (!S.solved || S.opens < minOpen || S.random > rmax || (cheapFail && S.cheap > 0) || S.wins > 6 || T.turns.length < minOpen + 1) continue;
      const map = render(T.cols, T.rows, T.E, T.cells, 2, T.exit);
      if (found.some((o) => o.map.join() === map.join())) continue;
      found.push({ map, exit: T.exit, opens: S.opens, random: +S.random.toFixed(3), wins: S.wins, turns: T.turns.length, tickets: nt, paid: S.paid });
    }
    if (found.length < count) console.error('short tickets', rows, nt, found.length);
    found.sort((a, b) => a.opens - b.opens || b.random - a.random); out.push(...found);
  }
  return out;
}

// ---- THE HOUSE OF MIRRORS ----
function makeMaze(r, rows, loops, glass) {
  const cols = 5, E = {}, exit = Math.floor(r() * cols);
  for (let y = 0; y < rows; y++) for (let c = 0; c < cols; c++) { if (c > 0) E['V' + c + ',' + y] = 'wall'; if (y > 0) E['H' + c + ',' + y] = 'wall'; }
  const seen = new Set(['2,0']), stack = [[2, 0]];            // a maze grown from the way in: one way between any two boards
  while (stack.length) {
    const [c, y] = stack[stack.length - 1], nx = DIRS.map(([d, dc, dr]) => [d, c + dc, y + dr]).filter(([, a, b]) => a >= 0 && a < cols && b >= 0 && b < rows && !seen.has(a + ',' + b));
    if (!nx.length) { stack.pop(); continue; }
    const [d, a, b] = nx[Math.floor(r() * nx.length)]; delete E[edgeOf(c, y, d)]; seen.add(a + ',' + b); stack.push([a, b]);
  }
  const inner = Object.keys(E);
  for (let k = 0; k < loops; k++) delete E[inner.splice(Math.floor(r() * inner.length), 1)[0]];   // a few loops, so following one wall is not always the way
  const walls = Object.keys(E);
  for (let k = 0; k < glass && walls.length; k++) E[walls.splice(Math.floor(r() * walls.length), 1)[0]] = 'g';   // some walls are glass: they look open
  return { cols, rows, E, exit };
}
function mazeWalk(M, pick, r, limit = 400) {              // cells rolled through from the way in to the way out, choosing by pick
  const open = (c, y, d) => { const e = M.E[edgeOf(c, y, d)]; return !e; };
  let at = [2, 0], n = 0; const visits = {};
  while (n < limit) {
    if (at[0] === M.exit && at[1] === M.rows - 1) return n;
    const nx = DIRS.filter(([d, dc, dr]) => { const a = at[0] + dc, b = at[1] + dr; return a >= 0 && a < M.cols && b >= 0 && b < M.rows && open(at[0], at[1], d); }).map(([, dc, dr]) => [at[0] + dc, at[1] + dr]);
    const k = at + ''; visits[k] = (visits[k] || 0) + 1;
    at = pick(nx, visits, r); n++;
  }
  return limit;
}
function mirrorsLadder(r) {
  const out = [];
  // [rows, loops, glass panes, how many]
  for (const [rows, loops, glass, count] of [[4, 1, 1, 3], [5, 1, 2, 3], [5, 2, 3, 4], [6, 2, 3, 4], [6, 3, 4, 4], [7, 3, 5, 4]]) {
    const found = [];
    for (let t = 0; t < 4000 && found.length < count; t++) {
      const M = makeMaze(r, rows, loops, glass);
      // the careful: a new board where there is one (nearest the way out first), else back the least-used way; the careless: at random
      const careful = [0, 1, 2].map(() => mazeWalk(M, (nx, v, rr) => nx.slice().sort((a, b) => ((v[a + ''] || 0) - (v[b + ''] || 0)) || (Math.abs(a[0] - M.exit) + (M.rows - 1 - a[1])) - (Math.abs(b[0] - M.exit) + (M.rows - 1 - b[1])) || rr() - 0.5)[0], r));
      const careless = Array.from({ length: 40 }, () => mazeWalk(M, (nx, v, rr) => nx[Math.floor(rr() * nx.length)], r, 2000)).sort((a, b) => a - b)[20];
      const cf = Math.max(...careful);
      if (cf > 12 + 5 * rows || careless < 2.2 * cf || careless < 30) continue;
      const map = render(M.cols, M.rows, M.E, Array.from({ length: rows }, () => Array(5).fill('.')), 2, M.exit);
      found.push({ map, exit: M.exit, careful: cf, careless });
    }
    if (found.length < count) console.error('short mirrors', rows, found.length);
    out.push(...found);
  }
  return out.sort((a, b) => a.careful - b.careful);
}
if (require.main === module) {
  const r = seeded(Number(process.argv[2] || 7));
  const T = ticketsLadder(r), M = mirrorsLadder(r);
  fs.writeFileSync('lad-tickets.json', JSON.stringify(T, null, 1)); fs.writeFileSync('lad-mirrors.json', JSON.stringify(M, null, 1));
  console.log('tickets', T.length, T.map((o) => o.opens + '/' + o.random + '/' + o.wins).join(' '));
  console.log('mirrors', M.length, M.map((o) => o.careful + '/' + o.careless).join(' '));
  for (const o of [T[0], T[T.length - 1], M[0], M[M.length - 1]]) if (o) console.log(o.map.join('\n'), o.paid || '');
}
