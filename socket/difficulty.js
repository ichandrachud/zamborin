/* SOCKET — is there any thinking in these boards?

   Run: node socket/difficulty.js

   Solution counts say how many answers exist. They do NOT say whether finding
   one takes any thought. A board where every plug has exactly one legal socket
   has one solution AND requires nothing of the player.

   So measure the thing that actually matters: does solving need BACKTRACKING?
   A naive player picks a plug, drops it in the first place it is allowed, and
   moves on. If that always works, the puzzle is a formality.
*/
'use strict';
const M = require('./model.js');

// Every socket this plug is allowed to use given what is already down.
function options(board, place, i) {
  const p = board.plugs[i], out = [];
  for (const pl of M.placements(p, board.N)) {
    if (!M.legal(board, p, pl)) continue;
    let clash = false;
    for (let k = 0; k < place.length; k++) {
      if (k === i || !place[k]) continue;
      if (pl.from <= place[k].to && place[k].from <= pl.to) { clash = true; break; }
    }
    if (!clash) out.push(pl);
  }
  return out;
}

// A player who never backtracks: takes plugs in a given order and always uses
// the first legal socket. Returns true if that happens to work.
function greedy(board, order) {
  const place = new Array(board.plugs.length).fill(null);
  for (const i of order) {
    const o = options(board, place, i);
    if (!o.length) return false;
    place[i] = o[0];
  }
  return true;
}

const perm = (a) => a.length <= 1 ? [a] :
  a.flatMap((x, i) => perm([...a.slice(0, i), ...a.slice(i + 1)]).map(r => [x, ...r]));

const rows = [];
for (const band of [[1, 5], [6, 10], [11, 15], [16, 20], [21, 30], [31, 45]]) {
  let boards = 0, greedyAlwaysWorks = 0, greedyEverFails = 0;
  const firstChoice = [], forced = [];
  for (let lvl = band[0]; lvl <= band[1]; lvl++) {
    for (let rep = 0; rep < 6; rep++) {
      const b = M.generate(lvl);
      if (!b) continue;
      boards++;
      const empty = new Array(b.plugs.length).fill(null);
      // how much choice does the opening offer?
      const opts = b.plugs.map((_, i) => options(b, empty, i).length);
      firstChoice.push(opts.reduce((x, y) => x + y, 0) / opts.length);
      forced.push(opts.filter(o => o === 1).length);
      // try every order a player might take the plugs in (capped)
      const idx = b.plugs.map((_, i) => i);
      const orders = idx.length <= 6 ? perm(idx) : Array.from({ length: 200 }, () =>
        idx.slice().sort(() => Math.random() - 0.5));
      const wins = orders.filter(o => greedy(b, o)).length;
      if (wins === orders.length) greedyAlwaysWorks++;
      if (wins < orders.length) greedyEverFails++;
    }
  }
  const avg = (a) => +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
  rows.push({
    levels: band[0] + '-' + band[1],
    boards,
    neverNeedsThought: greedyAlwaysWorks + ' / ' + boards,
    canTrapAGreedyPlayer: greedyEverFails + ' / ' + boards,
    avgSocketsPerPlugAtStart: avg(firstChoice),
    avgPlugsWithOnlyOneOption: avg(forced),
  });
}

console.log('\nSOCKET — does solving require backtracking?\n');
for (const r of rows) {
  console.log('levels ' + r.levels + '   (' + r.boards + ' boards)');
  console.log('   greedy always works, no thought needed : ' + r.neverNeedsThought);
  console.log('   greedy can get stuck, planning required: ' + r.canTrapAGreedyPlayer);
  console.log('   sockets available per plug at the start: ' + r.avgSocketsPerPlugAtStart);
  console.log('   plugs with exactly one legal socket    : ' + r.avgPlugsWithOnlyOneOption + '\n');
}
