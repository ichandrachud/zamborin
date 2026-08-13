/* Does a second column make Socket harder, or only bigger?

   Run: node socket/compare.js

   Same two questions asked of both models. Does greedy play — take the plugs in
   any order, always use the first legal spot — get trapped? And how much search
   does finding an answer actually take?
*/
'use strict';
const A = require('./model.js');       // one column
const B = require('./model2d.js');     // two columns

function optionsFor(M, board, place, i, is2D) {
  const p = board.plugs[i], out = [];
  const pls = is2D ? M.placements(p, board.R) : M.placements(p, board.N);
  for (const pl of pls) {
    if (!M.legal(board, p, pl)) continue;
    let clash = false;
    for (let k = 0; k < place.length && !clash; k++) {
      if (k === i || !place[k]) continue;
      if (is2D) { for (const c of pl.cells) if (place[k].cells.includes(c)) { clash = true; break; } }
      else if (pl.from <= place[k].to && place[k].from <= pl.to) clash = true;
    }
    if (!clash) out.push(pl);
  }
  return out;
}

function greedyWorks(M, board, order, is2D) {
  const place = new Array(board.plugs.length).fill(null);
  for (const i of order) {
    const o = optionsFor(M, board, place, i, is2D);
    if (!o.length) return false;
    place[i] = o[0];
  }
  return true;
}

function effort(M, board, is2D) {
  const place = new Array(board.plugs.length).fill(null);
  let nodes = 0, dead = 0;
  (function go(k) {
    if (k === board.plugs.length) return true;
    const opts = optionsFor(M, board, place, k, is2D);
    if (!opts.length) { dead++; return false; }
    for (const pl of opts) {
      nodes++; place[k] = pl;
      if (go(k + 1)) return true;
      place[k] = null; dead++;
    }
    return false;
  })(0);
  return { nodes, dead };
}

const shuffle = (a) => a.slice().sort(() => Math.random() - 0.5);

function run(label, M, is2D) {
  console.log('\n' + label);
  for (const [lo, hi] of [[1, 10], [11, 20], [21, 30], [31, 45]]) {
    let boards = 0, needsPlanning = 0, cells = 0, plugs = 0;
    const N = [], D = [];
    for (let lvl = lo; lvl <= hi; lvl++) {
      for (let rep = 0; rep < 6; rep++) {
        const b = M.generate(lvl);
        if (!b) continue;
        boards++;
        cells += is2D ? b.R * 2 : b.N;
        plugs += b.plugs.length;
        const idx = b.plugs.map((_, i) => i);
        const orders = Array.from({ length: 60 }, () => shuffle(idx));
        if (orders.some(o => !greedyWorks(M, b, o, is2D))) needsPlanning++;
        const e = effort(M, b, is2D);
        N.push(e.nodes); D.push(e.dead);
      }
    }
    N.sort((a, b2) => a - b2); D.sort((a, b2) => a - b2);
    console.log('  levels ' + String(lo + '-' + hi).padEnd(6) +
      ' sockets ' + (cells / boards).toFixed(1).padStart(4) +
      '  plugs ' + (plugs / boards).toFixed(1).padStart(4) +
      '  needs planning ' + String(needsPlanning + '/' + boards).padStart(6) +
      '  nodes ' + String(N[N.length >> 1]).padStart(3) +
      '  dead ends ' + String(D[D.length >> 1]).padStart(3));
  }
}

run('ONE COLUMN (shipped)', A, false);
run('TWO COLUMNS (proposed)', B, true);
console.log('');
