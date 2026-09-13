/* ============================================================
   Lessons in Chemistry · the rules

   Headless: no canvas, no clock, no randomness. play.js draws what this file
   decides and tests.mjs checks it in Node, so every rule lives here once.

   The whole game in five lines:
     an atom has hands, and the number of hands IS the element;
     a placed atom clasps every neighbour that has a free hand, in the order
       top, right, bottom, left, until its own hands run out;
     a group with no free hand is finished;
     finished and on the list, it leaves the dish; finished and not on the
       list, it is waste and stays;
     bonds never change once made, so the dish only ever moves forward.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChemModel = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ---------- ELEMENTS ----------
   Real valences, so a teacher sees something honest. The player needs none of
   it: the hands carry the rule. */
const ELEMENTS = {
  H: { name: 'hydrogen', hands: 1 },
  O: { name: 'oxygen',   hands: 2 },
  N: { name: 'nitrogen', hands: 3 },
  C: { name: 'carbon',   hands: 4 },
};
const ORDER = ['H', 'O', 'N', 'C'];
const MAX_BOND = 3;

/* Neighbours are ALWAYS considered in this order. It decides which friend a
   one-handed atom takes when two are offered, and the ghost draws the result
   before release, so the order is something the player sees rather than a
   hidden tie-break. */
const DIRS = [
  { dc: 0, dr: -1 },   // 0 top
  { dc: 1, dr: 0 },    // 1 right
  { dc: 0, dr: 1 },    // 2 bottom
  { dc: -1, dr: 0 },   // 3 left
];
const OPP = [2, 3, 0, 1];

function countEls(els) {
  const out = {};
  for (const el of els) out[el] = (out[el] || 0) + 1;
  return out;
}

/* ---------- MOLECULES ----------
   Written compactly: the atoms as a string of element letters, then the bonds
   by atom index, '-' single, '=' double, '#' triple. tests.mjs checks that
   every atom's bonds add up to its hands, so a typo here cannot ship. */
function mol(key, name, short, atoms, bonds) {
  const els = atoms.split('');
  const adj = els.map(() => []);
  for (const b of bonds.split(' ')) {
    const m = b.match(/^(\d+)([-=#])(\d+)$/);
    const i = +m[1], j = +m[3], k = m[2] === '-' ? 1 : m[2] === '=' ? 2 : 3;
    adj[i].push([j, k]); adj[j].push([i, k]);
  }
  return { key, name, short, els, adj, count: countEls(els) };
}
const MOLECULES = {};
[
  mol('hydrogen-gas',      'hydrogen gas',      'HYDROGEN',       'HH',        '0-1'),
  mol('water',             'water',             'WATER',          'OHH',       '0-1 0-2'),
  mol('ammonia',           'ammonia',           'AMMONIA',        'NHHH',      '0-1 0-2 0-3'),
  mol('methane',           'methane',           'METHANE',        'CHHHH',     '0-1 0-2 0-3 0-4'),
  mol('hydrogen-peroxide', 'hydrogen peroxide', 'PEROXIDE',       'OOHH',      '0-1 0-2 1-3'),
  mol('oxygen-gas',        'oxygen gas',        'OXYGEN',         'OO',        '0=1'),
  mol('carbon-dioxide',    'carbon dioxide',    'CARBON DIOXIDE', 'COO',       '0=1 0=2'),
  mol('formaldehyde',      'formaldehyde',      'FORMALDEHYDE',   'COHH',      '0=1 0-2 0-3'),
  mol('hydrazine',         'hydrazine',         'HYDRAZINE',      'NNHHHH',    '0-1 0-2 0-3 1-4 1-5'),
  mol('methanol',          'methanol',          'METHANOL',       'COHHHH',    '0-1 0-2 0-3 0-4 1-5'),
  mol('ethane',            'ethane',            'ETHANE',         'CCHHHHHH',  '0-1 0-2 0-3 0-4 1-5 1-6 1-7'),
  mol('ethylene',          'ethylene',          'ETHYLENE',       'CCHHHH',    '0=1 0-2 0-3 1-4 1-5'),
  mol('nitrogen-gas',      'nitrogen gas',      'NITROGEN',       'NN',        '0#1'),
  mol('ethanol',           'ethanol',           'ETHANOL',        'CCOHHHHHH', '0-1 1-2 0-3 0-4 0-5 1-6 1-7 2-8'),
  mol('dimethyl-ether',    'dimethyl ether',    'ETHER',          'CCOHHHHHH', '0-2 1-2 0-3 0-4 0-5 1-6 1-7 1-8'),
  mol('ethyne',            'ethyne',            'ETHYNE',         'CCHH',      '0#1 0-2 1-3'),
  mol('urea',              'urea',              'UREA',           'CONNHHHH',  '0=1 0-2 0-3 2-4 2-5 3-6 3-7'),
].forEach((m) => { MOLECULES[m.key] = m; });

/* ---------- MATCHING ----------
   Does fragment F sit inside molecule T exactly as it already is? Same
   elements, every pair of F's atoms bonded at the same order in T, and every
   UNbonded pair unbonded in T. Bonds never change once made, so a wrong order
   or an extra bond between two atoms already on the dish can never be undone,
   and an embedding that allowed one would paint a dead fragment green.

   Brute force with pruning. The biggest molecule here has nine atoms. */
function bondIn(g, i, j) {
  for (const [k, o] of g.adj[i]) if (k === j) return o;
  return 0;
}
function bfsOrder(g) {
  const n = g.els.length, seen = new Array(n).fill(false), out = [];
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue;
    seen[s] = true; out.push(s);
    for (let q = out.length - 1; q < out.length; q++) {
      for (const [k] of g.adj[out[q]]) if (!seen[k]) { seen[k] = true; out.push(k); }
    }
  }
  return out;
}
function embeds(F, T) {
  const n = F.els.length, m = T.els.length;
  if (n > m) return false;
  for (const el of ORDER) if ((F.count[el] || 0) > (T.count[el] || 0)) return false;
  const order = bfsOrder(F);
  const map = new Array(n).fill(-1), used = new Array(m).fill(false);
  function go(idx) {
    if (idx === n) return true;
    const u = order[idx];
    for (let t = 0; t < m; t++) {
      if (used[t] || T.els[t] !== F.els[u]) continue;
      let ok = true;
      for (let p = 0; p < idx && ok; p++) {
        const v = order[p];
        if (bondIn(F, u, v) !== bondIn(T, t, map[v])) ok = false;
      }
      if (!ok) continue;
      map[u] = t; used[t] = true;
      if (go(idx + 1)) return true;
      map[u] = -1; used[t] = false;
    }
    return false;
  }
  return go(0);
}
// Same size and an exact embedding is a bijection that keeps every bond.
function isomorphic(A, B) { return A.els.length === B.els.length && embeds(A, B); }

/* ---------- THE DISH ---------- */
const cellOf = (s, c, r) => c + r * s.cols;
const colOf = (s, cell) => cell % s.cols;
const rowOf = (s, cell) => (cell / s.cols) | 0;
function neighbourCell(s, cell, d) {
  const c = colOf(s, cell) + DIRS[d].dc, r = rowOf(s, cell) + DIRS[d].dr;
  if (c < 0 || r < 0 || c >= s.cols || r >= s.rows) return -1;
  return cellOf(s, c, r);
}

function createState(level) {
  const s = {
    cols: level.dish[0], rows: level.dish[1],
    grid: new Array(level.dish[0] * level.dish[1]).fill(-1),
    atoms: [],
    supply: level.supply.slice(),
    next: 0,
    targets: level.targets.map((t) => ({ key: t[0], n: t[1] })),
    made: {},
    wasted: 0,
    wastedAtoms: 0,
    placements: 0,
    result: null,
    analysis: null,
  };
  // Pre-placed atoms go through the same rule as every other atom.
  for (const p of (level.pre || [])) {
    const ev = placeAtom(s, p.el, cellOf(s, p.c, p.r));
    resolve(s, classify(s, ev.id));
  }
  s.analysis = analyse(s);
  return s;
}

function clone(s) {
  return {
    cols: s.cols, rows: s.rows,
    grid: s.grid.slice(),
    atoms: s.atoms.map((a) => ({ id: a.id, el: a.el, cell: a.cell, free: a.free, status: a.status,
                                 bonds: a.bonds.map((b) => ({ to: b.to, order: b.order, dir: b.dir })) })),
    supply: s.supply,          // never mutated
    next: s.next,
    targets: s.targets,        // never mutated
    made: Object.assign({}, s.made),
    wasted: s.wasted, wastedAtoms: s.wastedAtoms, placements: s.placements,
    result: s.result, analysis: null,
  };
}

/* Put an atom down and clasp. Returns the bonds it formed, in the order formed. */
function placeAtom(s, el, cell) {
  const id = s.atoms.length;
  const atom = { id, el, cell, free: ELEMENTS[el].hands, bonds: [], status: 'live' };
  s.atoms.push(atom);
  s.grid[cell] = id;
  const formed = [];
  for (let d = 0; d < 4 && atom.free > 0; d++) {
    const nc = neighbourCell(s, cell, d);
    if (nc < 0) continue;
    const nid = s.grid[nc];
    if (nid < 0) continue;
    const nb = s.atoms[nid];
    if (nb.free === 0) continue;          // finished and wasted atoms hold nothing
    const k = Math.min(atom.free, nb.free, MAX_BOND);
    atom.free -= k; nb.free -= k;
    atom.bonds.push({ to: nid, order: k, dir: d });
    nb.bonds.push({ to: id, order: k, dir: OPP[d] });
    formed.push({ to: nid, order: k, dir: d });
  }
  return { id, el, cell, bonds: formed };
}

function groupOf(s, id) {
  const seen = new Set([id]), q = [id];
  for (let i = 0; i < q.length; i++) {
    for (const b of s.atoms[q[i]].bonds) if (!seen.has(b.to)) { seen.add(b.to); q.push(b.to); }
  }
  return q.sort((a, b) => a - b);
}
function graphOf(s, ids) {
  const at = new Map(ids.map((id, i) => [id, i]));
  const els = ids.map((id) => s.atoms[id].el);
  const adj = ids.map((id) => s.atoms[id].bonds.map((b) => [at.get(b.to), b.order]));
  return { els, adj, count: countEls(els) };
}

/* A group just changed. Is it finished, and if so is it wanted? */
function classify(s, id) {
  const ids = groupOf(s, id);
  if (ids.some((i) => s.atoms[i].free > 0)) return null;
  const g = graphOf(s, ids);
  for (const t of s.targets) {
    if ((s.made[t.key] || 0) >= t.n) continue;
    if (isomorphic(g, MOLECULES[t.key])) return { kind: 'required', key: t.key, ids };
  }
  return { kind: 'waste', ids };
}
function resolve(s, done) {
  if (!done) return;
  if (done.kind === 'required') {
    s.made[done.key] = (s.made[done.key] || 0) + 1;
    for (const i of done.ids) { s.grid[s.atoms[i].cell] = -1; s.atoms[i].status = 'gone'; }
  } else {
    s.wasted += 1; s.wastedAtoms += done.ids.length;
    for (const i of done.ids) s.atoms[i].status = 'waste';
  }
}

/* ---------- WHAT THE DISH CAN STILL BECOME ----------
   Run after every placement. Three answers come out of it:

   PALMS. A fragment is green while it sits inside some molecule still to be
   made and the atoms still to come can finish that molecule; amber otherwise.
   On top of the brief's two tests there is a third, about SPACE: a hand whose
   every neighbour is a wall, waste, its own fragment or an amber fragment can
   never be reached by anything, because none of those will ever leave. A
   fragment with such a hand is dead however well the numbers look, and a
   green palm on it would be the picture lying.

   SHORTAGE. Two fragments on the dish can never join each other: bonds only
   form with the atom being placed. So each molecule still to make is built
   from AT MOST ONE fragment plus new atoms. The level is over when no
   assignment of green fragments to the molecules still owed leaves the supply
   enough of every element. The element named is the one furthest short in
   the closest assignment. This is count arithmetic, so a level that only the
   ORDER of the supply has doomed is caught later, at the first placement that
   makes the counts fail too.

   NO ROOM. An atom is waiting and every cell is full. */
function covers(supply, need, have) {
  for (const el of ORDER) if ((need[el] || 0) - (have[el] || 0) > (supply[el] || 0)) return false;
  return true;
}
function analyse(s) {
  const remaining = [];
  for (const t of s.targets) {
    const r = t.n - (s.made[t.key] || 0);
    if (r > 0) remaining.push([t.key, r]);
  }
  const supply = countEls(s.supply.slice(s.next));

  const fragments = [], fragOf = new Map();
  for (const a of s.atoms) {
    if (a.status !== 'live' || fragOf.has(a.id)) continue;
    const ids = groupOf(s, a.id);
    const g = graphOf(s, ids);
    const keys = remaining.filter(([k]) => embeds(g, MOLECULES[k])).map(([k]) => k);
    const fed = keys.filter((k) => covers(supply, MOLECULES[k].count, g.count));
    const f = { ids, count: g.count, keys, green: fed.length > 0,
                why: fed.length ? null : (keys.length ? 'supply' : 'shape') };
    ids.forEach((i) => fragOf.set(i, fragments.length));
    fragments.push(f);
  }

  for (let changed = true; changed;) {
    changed = false;
    fragments.forEach((f, fi) => {
      if (!f.green) return;
      for (const i of f.ids) {
        const a = s.atoms[i];
        if (a.free === 0) continue;
        let open = 0;
        for (let d = 0; d < 4; d++) {
          const nc = neighbourCell(s, a.cell, d);
          if (nc < 0) continue;
          const nid = s.grid[nc];
          if (nid < 0) { open++; continue; }
          const ofi = fragOf.get(nid);
          if (ofi !== undefined && ofi !== fi && fragments[ofi].green) open++;
        }
        if (open * MAX_BOND < a.free) { f.green = false; f.why = 'space'; changed = true; return; }
      }
    });
  }

  const won = remaining.length === 0;
  let shortage = null, stuck = false;
  if (!won) {
    shortage = shortageOf(remaining, supply, fragments.filter((f) => f.green));
    // Belt and braces: with nothing left to place, the count check above
    // always fires, but a level must never be left open with an empty tray.
    if (!shortage && s.next >= s.supply.length) stuck = true;
  }
  const noRoom = !won && !shortage && !stuck && s.next < s.supply.length && !s.grid.some((v) => v < 0);

  /* Once the level cannot be won, no fragment on the dish can still become
     something on the list, whatever each would manage alone. Green palms on a
     lost dish would say "still fine" for the second before the card. */
  const lost = !!(shortage || stuck || noRoom);
  const palm = {};
  fragments.forEach((f) => f.ids.forEach((i) => {
    if (s.atoms[i].free > 0) palm[i] = f.green && !lost ? 'green' : 'amber';
  }));
  return { remaining, supply, fragments, palm, won, shortage, stuck, noRoom };
}

function shortageOf(remaining, supply, greens) {
  const slots = {}, cur = {};
  for (const el of ORDER) cur[el] = 0;
  for (const [k, r] of remaining) {
    slots[k] = r;
    for (const el of ORDER) cur[el] += r * (MOLECULES[k].count[el] || 0);
  }
  let best = null;
  /* The element named is the one furthest short; on a tie, the one with the
     largest share of its need missing. A carbon walled in with three
     hydrogens still to come is one carbon short and one hydrogen short, and
     "not enough carbon" is the true story: the carbon is the atom that died. */
  const score = () => {
    let tot = 0, worst = null, w = 0, wf = 0;
    for (const el of ORDER) {
      const d = Math.max(0, cur[el] - (supply[el] || 0));
      tot += d;
      const frac = d ? d / cur[el] : 0;
      if (d > w || (d === w && d > 0 && frac > wf)) { w = d; wf = frac; worst = el; }
    }
    return { tot, worst };
  };
  (function go(i) {
    if (best && best.tot === 0) return;
    if (i === greens.length) { const sc = score(); if (!best || sc.tot < best.tot) best = sc; return; }
    go(i + 1);
    const f = greens[i];
    for (const k of f.keys) {
      if (!(slots[k] > 0)) continue;
      slots[k]--; for (const el of ORDER) cur[el] -= (f.count[el] || 0);
      go(i + 1);
      slots[k]++; for (const el of ORDER) cur[el] += (f.count[el] || 0);
    }
  })(0);
  return best.tot === 0 ? null : best.worst;
}

function resultOf(an) {
  if (an.won) return { kind: 'win' };
  if (an.shortage) return { kind: 'shortage', el: an.shortage };
  if (an.stuck) return { kind: 'shortage', el: null };
  if (an.noRoom) return { kind: 'noroom' };
  return null;
}

/* ---------- THE TWO WAYS IN ----------
   place() is the move. preview() is the same move on a copy, stopped before
   the finished group leaves, so the ghost can draw exactly what release will
   do. They share every line that decides anything; that is the guarantee the
   ghost cannot lie. */
function canPlace(s, cell) {
  return !s.result && s.next < s.supply.length && cell >= 0 && cell < s.grid.length && s.grid[cell] === -1;
}
function place(s, cell) {
  if (!canPlace(s, cell)) return null;
  const ev = placeAtom(s, s.supply[s.next], cell);
  s.next += 1; s.placements += 1;
  const done = classify(s, ev.id);
  ev.done = done && {
    kind: done.kind, key: done.key || null, ids: done.ids,
    // what left the dish, for the lift animation: taken before it goes
    atoms: done.ids.map((i) => ({ id: i, el: s.atoms[i].el, cell: s.atoms[i].cell,
                                  bonds: s.atoms[i].bonds.map((b) => ({ to: b.to, order: b.order, dir: b.dir })) })),
  };
  resolve(s, done);
  s.analysis = analyse(s);
  s.result = resultOf(s.analysis);
  ev.result = s.result;
  return ev;
}
function preview(s, cell) {
  if (!canPlace(s, cell)) return null;
  const view = clone(s);
  const ev = placeAtom(view, view.supply[view.next], cell);
  view.next += 1;
  const done = classify(view, ev.id);
  const after = clone(view);
  resolve(after, done);
  const analysis = analyse(after);
  return { view, ev, done, analysis, result: resultOf(analysis) };
}

/* ---------- A MOLECULE AS IT COULD SIT ON THE DISH ----------
   For the flask row: grid positions by breadth-first walk from the busiest
   atom, a chain carrying straight on where it can. Every molecule in the
   table lays out without a collision (tests.mjs). */
const layoutCache = {};
function layoutMolecule(key) {
  if (layoutCache[key]) return layoutCache[key];
  const T = MOLECULES[key], n = T.els.length;
  let root = 0;
  for (let i = 1; i < n; i++) if (T.adj[i].length > T.adj[root].length) root = i;
  const pos = new Array(n).fill(null), from = new Array(n).fill(-1);
  const taken = new Set(['0,0']);
  pos[root] = { x: 0, y: 0 };
  const q = [root];
  // right, left, down, up for the root; afterwards straight on, then turns
  const vec = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let qi = 0; qi < q.length; qi++) {
    const u = q[qi];
    let prefs = vec;
    if (from[u] >= 0) {
      const dx = pos[u].x - pos[from[u]].x, dy = pos[u].y - pos[from[u]].y;
      prefs = [[dx, dy], [dy, dx], [-dy, -dx], [-dx, -dy]];
    }
    for (const [v] of T.adj[u]) {
      if (pos[v]) continue;
      const pick = prefs.find(([px, py]) => !taken.has((pos[u].x + px) + ',' + (pos[u].y + py)));
      if (!pick) return null;
      pos[v] = { x: pos[u].x + pick[0], y: pos[u].y + pick[1] };
      taken.add(pos[v].x + ',' + pos[v].y);
      from[v] = u; q.push(v);
    }
  }
  const xs = pos.map((p) => p.x), ys = pos.map((p) => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const out = {
    atoms: pos.map((p, i) => ({ el: T.els[i], x: p.x - minX, y: p.y - minY })),
    bonds: [],
    w: Math.max(...xs) - minX + 1, h: Math.max(...ys) - minY + 1,
  };
  T.adj.forEach((list, i) => list.forEach(([j, o]) => { if (i < j) out.bonds.push({ a: i, b: j, order: o }); }));
  return (layoutCache[key] = out);
}

return {
  ELEMENTS, ORDER, MAX_BOND, DIRS, OPP, MOLECULES,
  countEls, embeds, isomorphic,
  createState, clone, place, preview, canPlace, analyse, groupOf, graphOf,
  cellOf, colOf, rowOf, neighbourCell, layoutMolecule,
};
}));
