/* SOCKET — does this board shape contain a puzzle?

   Run: node socket/measure.js

   The worry, stated before building anything: if the plug bodies exactly tile
   the strip, then ANY ordering of them is a solution and the board has K!
   answers. That is a sorting exercise wearing a puzzle's clothes. This script
   builds boards under each candidate constraint and counts solutions exactly,
   so the design choice comes from the numbers.
*/
'use strict';
const { CATALOGUE, countSolutions, solve } = require('./model.js');

const RI = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (a) => a[(Math.random() * a.length) | 0];

// Build a plug set whose bodies sum to exactly N, so every socket is used and
// there is no slack to hide sloppy play.
function plugsFillingExactly(N) {
  const kinds = ['slim', 'wide', 'brick', 'angle', 'bar'];
  for (let attempt = 0; attempt < 400; attempt++) {
    const plugs = []; let total = 0, id = 0;
    while (total < N) {
      const room = N - total;
      const options = kinds.filter(k => CATALOGUE[k](0).span <= room);
      if (!options.length) break;
      const p = CATALOGUE[pick(options)](id++);
      plugs.push(p); total += p.span;
    }
    if (total === N && plugs.length >= 3) return plugs;
  }
  return null;
}

function board(N, plugs, opts = {}) { return { N, plugs, ...opts }; }

function stats(list) {
  const s = list.slice().sort((a, b) => a - b);
  return { min: s[0], p25: s[(s.length * 0.25) | 0], median: s[s.length >> 1],
           p75: s[(s.length * 0.75) | 0], max: s[s.length - 1] };
}

function trial(label, make, runs = 60) {
  const counts = [], unsolvable = [];
  for (let i = 0; i < runs; i++) {
    const b = make();
    if (!b) continue;
    const n = countSolutions(b, 200000);
    if (n === 0) { unsolvable.push(1); continue; }
    counts.push(n);
  }
  const uniqueish = counts.filter(c => c <= 4).length;
  return {
    constraint: label,
    boards: counts.length,
    unsolvable: unsolvable.length,
    solutionsPerBoard: stats(counts),
    boardsWith4OrFewerSolutions: uniqueish + ' / ' + counts.length,
  };
}

const N = 8;
const rows = [];

// 0 — nothing but the geometry
rows.push(trial('none (bodies tile the strip)', () => {
  const p = plugsFillingExactly(N); return p && board(N, p);
}));

// A — dead sockets: the pin needs a live socket, a body may bridge over one
rows.push(trial('A · two dead sockets', () => {
  const p = plugsFillingExactly(N); if (!p) return null;
  const dead = new Set(); while (dead.size < 2) dead.add(RI(0, N - 1));
  return board(N, p, { dead });
}));

// B — cable reach: each device sits somewhere and its cable only stretches so far
rows.push(trial('B · cable reach (slack 1)', () => {
  const p = plugsFillingExactly(N); if (!p) return null;
  const sol = solve(board(N, p));
  if (!sol) return null;
  const reach = {};
  p.forEach((pl, i) => { reach[pl.id] = { at: sol[i].pin, slack: 1 }; });
  return board(N, p, { reach });
}));

rows.push(trial('B · cable reach (slack 2)', () => {
  const p = plugsFillingExactly(N); if (!p) return null;
  const sol = solve(board(N, p));
  if (!sol) return null;
  const reach = {};
  p.forEach((pl, i) => { reach[pl.id] = { at: sol[i].pin, slack: 2 }; });
  return board(N, p, { reach });
}));

// C — switched bank: some devices must sit on the switched half
rows.push(trial('C · switched bank (half the plugs)', () => {
  const p = plugsFillingExactly(N); if (!p) return null;
  const needsSwitched = new Set(p.filter(() => Math.random() < 0.5).map(x => x.id));
  return board(N, p, { needsSwitched, switchedUpTo: Math.floor(N / 2) - 1 });
}));

console.log('\nSOCKET — solution counts per board, strip of ' + N + ' sockets\n');
for (const r of rows) {
  console.log(r.constraint);
  console.log('   boards ' + r.boards + '   unsolvable ' + r.unsolvable +
              '   tight (<=4 solutions) ' + r.boardsWith4OrFewerSolutions);
  const s = r.solutionsPerBoard;
  console.log('   solutions  min ' + s.min + '   p25 ' + s.p25 + '   median ' + s.median +
              '   p75 ' + s.p75 + '   max ' + s.max + '\n');
}
