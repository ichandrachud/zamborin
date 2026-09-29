// SATELLITES, a ladder: one satellite, then two, then three; more pushes, fewer ways to get it right.
const { parse, solve, traps, randomPlay } = require('./orbit.js');
const { seeded } = require('./common.js');
function make(r, cols, rows, nS, nRock, nStub) {
  const entry = 2, exit = 2, L = [];
  for (let i = 0; i < 2 * rows + 1; i++) L.push(Array(2 * cols + 1).fill(' '));
  for (let i = 0; i < 2 * rows + 1; i += 2) for (let j = 0; j < 2 * cols + 1; j += 2) L[i][j] = '+';
  for (let r0 = 0; r0 < rows; r0++) for (let c = 0; c < cols; c++) L[2 * r0 + 1][2 * c + 1] = '.';
  for (let c = 0; c < cols; c++) { L[0][2 * c + 1] = c === exit ? '=' : '-'; L[2 * rows][2 * c + 1] = c === entry ? ' ' : '-'; }
  for (let r0 = 0; r0 < rows; r0++) { L[2 * r0 + 1][0] = '|'; L[2 * r0 + 1][2 * cols] = '|'; }
  const free = []; for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) if (!(rr <= 1 && c === entry) && !(rr === rows - 1 && c === exit)) free.push([c, rr]);
  const take = () => free.splice(Math.floor(r() * free.length), 1)[0], put = ([c, rr], ch) => { L[2 * (rows - 1 - rr) + 1][2 * c + 1] = ch; };
  for (let i = 0; i < nS; i++) { put(take(), 's'); put(take(), 'o'); }
  for (let i = 0; i < nRock; i++) put(take(), 'x');
  for (let i = 0; i < nStub; i++) {
    if (r() < 0.5) { const k = 1 + Math.floor(r() * (rows - 1)), c = Math.floor(r() * cols); L[2 * (rows - k)][2 * c + 1] = '-'; }
    else { const rr = Math.floor(r() * rows), c = 1 + Math.floor(r() * (cols - 1)); L[2 * (rows - 1 - rr) + 1][2 * c] = '|'; }
  }
  return L.map((l) => l.join(''));
}
if (require.main === module) {
  const r = seeded(Number(process.argv[2] || 7)), plan = [];
  // [satellites, rows, rocks, stubs, pushes lo-hi, how many]
  for (const [nS, rows, rock, stub, lo, hi, n] of [[1, 4, 1, 1, 2, 2, 3], [1, 5, 1, 2, 3, 4, 3], [2, 5, 1, 1, 3, 4, 4], [2, 5, 1, 2, 5, 6, 4], [2, 6, 2, 2, 6, 7, 4], [3, 6, 1, 2, 5, 6, 4], [3, 6, 1, 2, 7, 8, 4], [3, 6, 2, 3, 8, 10, 4]]) {
    const found = [];
    for (let t = 0; t < 20000 && found.length < n; t++) {
      const map = make(r, 5, rows, nS, rock, stub), G = parse(map, 2, 2), S = solve(G, 80000);
      if (!S.solved || S.pushes < lo || S.pushes > hi) continue;
      const rp = randomPlay(G, 400); if (rp > (nS === 1 ? 0.35 : 0.08)) continue;
      found.push({ sats: nS, pushes: S.pushes, rnd: rp, path: S.path, map });
    }
    if (found.length < n) console.error('short', nS, lo, hi, found.length);
    found.sort((a, b) => a.pushes - b.pushes || b.rnd - a.rnd); plan.push(...found);
  }
  plan.forEach((o, i) => { o.rank = i; });
  require('fs').writeFileSync('lad-orbit.json', JSON.stringify(plan, null, 1));
  for (const o of plan) console.log(o.rank, 'sats', o.sats, 'pushes', o.pushes, 'random', o.rnd);
}
