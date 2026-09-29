// THE CIRCUS'S WATCHING PUZZLES, the ladders: 22 of the shell game and 22 of the knife thrower, easy to hard.
//   node gencircwatch.js [seed]   writes lad-shells.json and lad-knives.json
const { seeded, drawMap } = require('./common.js');
const fs = require('fs');
const blank = (cols, rows) => Array.from({ length: rows }, () => Array(cols).fill('.'));
// THE SHELL GAME: the table across the middle, a pad in a bay in front of each cup, an aisle each side to the top row.
// Harder by more swaps, quicker hands, a fourth cup, two and three rounds, and two pairs swapped at once.
function shells(r) {
  const out = [];
  for (let i = 0; i < 22; i++) {
    const cups = i < 11 ? 3 : 4, cols = cups + 2, rows = 5, rounds = i < 4 ? 1 : i < 13 ? 2 : 3, t = i / 21;
    const swaps = [3, 4, 5, 6, 3, 4, 4, 5, 5, 6, 5, 6, 7, 4, 5, 5, 6, 6, 7, 8, 9, 10][i];
    const swapT = Math.round((0.95 - 0.55 * t) * 100) / 100, pairs = i >= 17 ? 1 : 0;
    const cells = blank(cols, rows), walls = { h: new Set(), v: new Set() };
    for (let c = 1; c <= cups; c++) { cells[3][c] = 't'; cells[2][c] = 'p'; }
    for (let c = 1; c <= cups + 1; c++) walls.v.add(c + ',2');           // each pad in its own bay, open only from below
    const exit = [0, cols - 1, 2][Math.floor(r() * 3)];
    out.push({ map: drawMap(cols, rows, cells, walls, 2, exit), exit, sp: { swaps, swapT, rounds, pairs, seed: 1 + Math.floor(r() * 9000) }, rank: i });
  }
  return out;
}
// THE KNIFE THROWER: a path of boards he does not hit, winding from the row past the way in to the way out; every other
// board is a target, but for a few dead ends off the path. The straight way (every shortest way, in fact) crosses a
// target. Harder by longer boards, more bends, more targets, quicker throws and less time to look.
function knives(r) {
  const out = [];
  for (let i = 0; i < 22; i++) {
    const rows = i < 5 ? 4 : i < 11 ? 5 : i < 17 ? 6 : 7, cols = 5, t = i / 21, minTurns = [1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 3, 4, 4, 5, 5, 5, 5, 6, 6, 7, 7][i], decoys = i < 4 ? 0 : i < 12 ? 1 : 2;
    let best = null;
    for (let tries = 0; tries < 4000 && !best; tries++) {
      const exit = Math.floor(r() * cols), start = Math.floor(r() * cols), path = [[start, 1]], on = new Set([start + ',1']);
      const adj = (c, rr) => [[c + 1, rr], [c - 1, rr], [c, rr + 1], [c, rr - 1]];
      let ok = false;
      for (let s = 0; s < 60; s++) {                     // a snake that never runs alongside itself
        const [c, rr] = path[path.length - 1];
        if (rr === rows - 1 && c === exit) { ok = true; break; }
        const nx = adj(c, rr).filter(([a, b]) => a >= 0 && a < cols && b >= 1 && b < rows && !on.has(a + ',' + b)
          && adj(a, b).filter(([x, y]) => on.has(x + ',' + y)).length === 1);
        if (!nx.length) break;
        const toward = nx.filter(([a, b]) => b > rr || (b === rr && Math.abs(a - exit) < Math.abs(c - exit)) || (b === rr && r() < 0.35));
        const pick = (toward.length && r() < 0.8 ? toward : nx)[Math.floor(r() * (toward.length && r() < 0.8 ? toward.length : nx.length))] || nx[0];
        path.push(pick); on.add(pick[0] + ',' + pick[1]);
      }
      if (!ok) continue;
      let turns = 0; for (let k = 2; k < path.length; k++) { const d1 = [path[k - 1][0] - path[k - 2][0], path[k - 1][1] - path[k - 2][1]], d2 = [path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]]; if (d1[0] !== d2[0] || d1[1] !== d2[1]) turns++; }
      if (turns < minTurns || turns > minTurns + 2) continue;
      const safe = new Set(on);
      for (let d = 0; d < decoys; d++) {                   // a dead end: a safe board off the path, touching it at one board only
        const cand = [];
        for (let rr = 1; rr < rows; rr++) for (let c = 0; c < cols; c++) {
          if (safe.has(c + ',' + rr)) continue;
          const n = adj(c, rr).filter(([x, y]) => safe.has(x + ',' + y) || y === 0).length;
          if (n === 1 && !(rr === 1 && adj(c, rr).some(([x, y]) => y > 0 && safe.has(x + ',' + y)))) cand.push([c, rr]);
        }
        if (cand.length) { const [c, rr] = cand[Math.floor(r() * cand.length)]; safe.add(c + ',' + rr); }
      }
      // the careless way: the shortest from the way in, over the boards as if none were targets, must cross a target
      const straight = [];
      for (let rr = 1; rr < rows; rr++) straight.push([2, rr]);
      for (let c = Math.min(2, exit); c <= Math.max(2, exit); c++) straight.push([c, rows - 1]);
      if (straight.every(([c, rr]) => safe.has(c + ',' + rr))) continue;
      const cells = blank(cols, rows);
      for (let rr = 1; rr < rows; rr++) for (let c = 0; c < cols; c++) if (!safe.has(c + ',' + rr)) cells[rr][c] = 'o';
      const targets = rows * cols - cols - safe.size;
      best = { map: drawMap(cols, rows, cells, { h: new Set(), v: new Set() }, 2, exit), exit, turns, targets, path: path.length,
               sp: { throwT: Math.round((0.42 - 0.22 * t) * 100) / 100, hold: Math.round((1.8 - 1.0 * t) * 10) / 10, side: r() < 0.5 ? 'e' : 'w', seed: 1 + Math.floor(r() * 9000) }, rank: i };
    }
    if (!best) { console.error('short knives', i); continue; }
    out.push(best);
  }
  return out;
}
if (require.main === module) {
  const r = seeded(Number(process.argv[2] || 7));
  const S = shells(r), K = knives(r);
  fs.writeFileSync('lad-shells.json', JSON.stringify(S, null, 1)); fs.writeFileSync('lad-knives.json', JSON.stringify(K, null, 1));
  console.log('shells', S.length, S.map((o) => o.sp.rounds + 'x' + o.sp.swaps + '@' + o.sp.swapT).join(' '));
  console.log('knives', K.length, K.map((o) => o.targets + 't/' + o.turns + 'b').join(' '));
  for (const i of [0, 10, 21]) console.log(K[i].map.join('\n'));
}
