/* SOCKET — the two-column model.

   A real wall board is not a line of sockets, it is gangs of two. That changes
   the puzzle from packing a strip to packing a grid, and it changes what a fat
   plug costs: a brick on a duplex outlet does not just cover the socket above
   it, it can cover the one BESIDE it too.

   Written alongside the one-dimensional model rather than replacing it, so the
   two can be measured against each other before anything is drawn. The finding
   this is testing: Socket does not get harder by being constrained — every rule
   tried made it easier — it gets harder by having more pieces whose options
   collide. A second column should do exactly that.

   Cells are indexed r * COLS + c. A plug occupies a w x h rectangle of cells
   and draws power from ONE of them.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SOCKET_MODEL_2D = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const COLS = 2;

// w,h in cells; pin is which cell of the footprint is live, as [row, col].
// `flips` lists the alternative pin cells — turning a plug round moves which
// neighbour its body swallows without moving the body.
function makePlug(id, kind, w, h, pin, flips, pins) {
  return { id, kind, w, h, pin, flips: flips || [], pins: pins || 2,
           cells: w * h, flippable: (flips || []).length > 0 };
}

const CATALOGUE = {
  // a bare two-pin, costs exactly what it uses
  slim:   (id) => makePlug(id, 'slim',   1, 1, [0, 0], [],               2),
  // the classic duplex blocker: covers the socket above or below it
  tall:   (id) => makePlug(id, 'tall',   1, 2, [0, 0], [[1, 0]],         3),
  // a fat body that spreads sideways into the next gang
  across: (id) => makePlug(id, 'across', 2, 1, [0, 0], [[0, 1]],         3),
  // wall wart, pin in the middle, eats the socket above AND below
  brick:  (id) => makePlug(id, 'brick',  1, 3, [1, 0], [],               2),
  // a long adapter hanging off one end
  bar:    (id) => makePlug(id, 'bar',    1, 3, [0, 0], [[2, 0]],         3),
  // the monster: a whole gang of four to itself
  block:  (id) => makePlug(id, 'block',  2, 2, [0, 0], [[1, 1]],         3),
};

// Every way this plug could sit. Returns { r, c, pin, cells, flipped } where
// r,c is the footprint's top-left and pin is the live CELL INDEX.
function placements(plug, R) {
  const out = [];
  const pins = [plug.pin, ...plug.flips];
  for (let r = 0; r + plug.h <= R; r++) {
    for (let c = 0; c + plug.w <= COLS; c++) {
      const cells = [];
      for (let dr = 0; dr < plug.h; dr++)
        for (let dc = 0; dc < plug.w; dc++) cells.push((r + dr) * COLS + (c + dc));
      pins.forEach((pn, oi) => {
        out.push({ r, c, cells, flipped: oi > 0,
                   pin: (r + pn[0]) * COLS + (c + pn[1]) });
      });
    }
  }
  return out;
}

// A lead comes in at a ROW and stretches so many rows. Which column a plug ends
// up in costs nothing — the cable does not care about an inch sideways, and
// making it care would be a rule the player cannot see.
function legal(board, plug, pl) {
  if (plug.pins === 3 && board.earthed && !board.earthed.has(pl.pin)) return false;
  const r = board.reach && board.reach[plug.id];
  if (r && Math.abs(((pl.pin / COLS) | 0) - r.at) > r.slack) return false;
  return true;
}

function search(board, limit, wantAll) {
  const { R, plugs } = board;
  const occupied = new Array(R * COLS).fill(false);
  const chosen = new Array(plugs.length).fill(null);
  const order = plugs.map((_, i) => i).sort((a, b) => plugs[b].cells - plugs[a].cells);
  let found = 0, first = null;
  (function place(k) {
    if (found >= limit) return true;
    if (k === order.length) {
      found++;
      if (!first) first = chosen.slice();
      return !wantAll;
    }
    const idx = order[k], plug = plugs[idx];
    for (const pl of placements(plug, R)) {
      if (!legal(board, plug, pl)) continue;
      let clash = false;
      for (const cell of pl.cells) if (occupied[cell]) { clash = true; break; }
      if (clash) continue;
      for (const cell of pl.cells) occupied[cell] = true;
      chosen[idx] = pl;
      if (place(k + 1)) return true;
      for (const cell of pl.cells) occupied[cell] = false;
      chosen[idx] = null;
    }
    return false;
  })(0);
  return { count: found, solution: first };
}

const solve = (board) => search(board, 1, false).solution;
const countSolutions = (board, limit = 200000) => search(board, limit, true).count;

function generate(level, rnd = Math.random) {
  // rows grow, and the board is always two wide
  const R = Math.min(7, 3 + Math.floor((level - 1) / 4));
  const total = R * COLS;
  const kinds = Object.keys(CATALOGUE);
  const tight = Math.min(0.8, Math.max(0, (level - 6) * 0.055));
  const wantPlugs = Math.max(3, Math.min(total - 1, 3 + Math.floor((level - 1) / 3) + ((rnd() * 2) | 0)));

  for (let attempt = 0; attempt < 900; attempt++) {
    const plugs = []; let used = 0, id = 0;
    while (used < total) {
      const room = total - used;
      const left = wantPlugs - plugs.length;
      const target = left > 0 ? Math.max(1, Math.round(room / left)) : 1;
      const opts = kinds.filter(k => {
        const p = CATALOGUE[k](0);
        return p.cells <= room && p.h <= R;
      });
      if (!opts.length) break;
      const weighted = opts.flatMap(k => {
        const c = CATALOGUE[k](0).cells;
        const w = c === target ? 4 : (Math.abs(c - target) === 1 ? 2 : 1);
        return Array(w).fill(k);
      });
      const p = CATALOGUE[weighted[(rnd() * weighted.length) | 0]](id++);
      plugs.push(p); used += p.cells;
    }
    if (used !== total || plugs.length < 3) continue;

    const sol = solve({ R, plugs });
    if (!sol) continue;
    const reach = {};
    plugs.forEach((p, i) => {
      const rr = rnd();
      const sl = level <= 3 ? 2 : (rr < tight ? 1 : 2);
      reach[p.id] = { at: (sol[i].pin / COLS) | 0, slack: sl };
    });
    const earthed = new Set();
    plugs.forEach((p, i) => { if (p.pins === 3) earthed.add(sol[i].pin); });
    const spares = Math.max(0, Math.round(total * Math.max(0.06, 0.34 - level * 0.012)));
    for (let k = 0; k < spares; k++) earthed.add((rnd() * total) | 0);

    const b = { R, COLS, plugs, reach, earthed };
    const n = countSolutions(b, 400);
    if (n < 1 || n > 6) continue;
    return { ...b, solution: sol, solutions: n, level,
             earthedList: [...earthed].sort((a, c) => a - c) };
  }
  return null;
}

return { COLS, CATALOGUE, makePlug, placements, legal, solve, countSolutions, generate };
}));
