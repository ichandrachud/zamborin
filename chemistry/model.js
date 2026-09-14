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
     bonds never change once made, so the dish only ever moves forward;
     a lone radical may drift, but never to where it would touch a free hand.
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
  H:  { name: 'hydrogen', hands: 1, mass: 1 },
  O:  { name: 'oxygen',   hands: 2, mass: 16 },
  N:  { name: 'nitrogen', hands: 3, mass: 14 },
  C:  { name: 'carbon',   hands: 4, mass: 12 },
  Cl: { name: 'chlorine', hands: 1, mass: 35 },
  Na: { name: 'sodium',   hands: 1, mass: 23 },
  Ca: { name: 'calcium',  hands: 2, mass: 40 },
  Fe: { name: 'iron',     hands: 3, mass: 56 },    // iron as it is in iron(III) chloride
};
const ORDER = ['H', 'O', 'N', 'C', 'Cl', 'Na', 'Ca', 'Fe'];
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
  const els = atoms.match(/[A-Z][a-z]?/g);
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
  mol('hydrogen-chloride', 'hydrogen chloride', 'HCl',            'HCl',       '0-1'),
  mol('salt',              'sodium chloride',   'NaCl',           'NaCl',      '0-1'),
  mol('calcium-chloride',  'calcium chloride',  'CaCl\u2082',     'CaClCl',    '0-1 0-2'),
  mol('iron-chloride',     'iron chloride',     'FeCl\u2083',     'FeClClCl',  '0-1 0-2 0-3'),
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
    version: 0,
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
    wasted: s.wasted, wastedAtoms: s.wastedAtoms, placements: s.placements, version: s.version,
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
   Run after every placement.

   THE PLAN. How many of the molecules still owed can still be made? A molecule
   is built from new atoms plus any fragments already on the dish, and two
   fragments CAN end up in one molecule when a placed atom grabs both (an
   oxygen dropped between two hydrogens). What can never happen is a bond
   between two atoms that are already down, so a set of fragments fits a
   molecule only if they sit inside it with no bond between them. The best
   plan is the most molecules those rules and the atoms still to come allow.
   Every molecule short of all of them is LOST, and the flask row says so.

   This is counting, not a search of the dish, so it is generous: a molecule
   the supply ORDER has already doomed is caught a placement later.

   PALMS. Green while the fragment is part of some best plan; amber when it is
   the wrong shape for anything owed, walled in where nothing can reach it
   (the SPACE rule: waste, the edge and its own atoms never leave), or simply
   not needed by any best plan.

   OVER. The level ends when nothing more can be made, or an atom is waiting
   and every cell is full. It is won only if every molecule was made. */
const EMPTY_G = { els: [], adj: [], count: {} };
function joinGraphs(A, B) {
  const off = A.els.length, count = Object.assign({}, A.count);
  for (const [el, n] of Object.entries(B.count)) count[el] = (count[el] || 0) + n;
  return { els: A.els.concat(B.els), adj: A.adj.concat(B.adj.map((l) => l.map(([j, o]) => [j + off, o]))), count };
}
function analyse(s) {
  const remaining = [];
  let total = 0, made = 0;
  for (const t of s.targets) {
    const m = Math.min(t.n, s.made[t.key] || 0);
    total += t.n; made += m;
    if (t.n > m) remaining.push([t.key, t.n - m]);
  }
  const owed = total - made;
  const supply = countEls(s.supply.slice(s.next));

  const fragments = [], fragOf = new Map();
  for (const a of s.atoms) {
    if (a.status !== 'live' || fragOf.has(a.id)) continue;
    const ids = groupOf(s, a.id);
    const g = graphOf(s, ids);
    const keys = remaining.filter(([k]) => embeds(g, MOLECULES[k])).map(([k]) => k);
    const f = { ids, g, count: g.count, keys, green: keys.length > 0, why: keys.length ? null : 'shape', type: -1 };
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

  const usable = fragments.filter((f) => f.green);
  const pl = plan(remaining, supply, usable);
  usable.forEach((f) => { if (!pl.useful.has(f.type)) { f.green = false; f.why = 'supply'; } });

  const won = owed === 0;
  const noRoom = !won && s.next < s.supply.length && !s.grid.some((v) => v < 0);
  const over = !won && (pl.best === 0 || noRoom);
  const palm = {};
  fragments.forEach((f) => f.ids.forEach((i) => {
    if (s.atoms[i].free > 0) palm[i] = f.green && !over ? 'green' : 'amber';
  }));
  return { remaining, supply, fragments, palm, won, over, noRoom,
           total, made, best: pl.best, lost: owed - pl.best };
}

function plan(remaining, supply, frags) {
  const keys = remaining.map(([k]) => k);
  const rOf = Object.fromEntries(remaining);
  if (!keys.length) return { best: 0, useful: new Set() };

  // Fragments that are the same shape are interchangeable: count them by type.
  const types = [];
  frags.forEach((f) => {
    let ti = types.findIndex((t) => isomorphic(t.g, f.g));
    if (ti < 0) { ti = types.length; types.push({ g: f.g, n: 0, keys: new Set(f.keys) }); }
    types[ti].n++;
    f.type = ti;
  });

  /* Every way a molecule could take in fragments: how many of each type, and
     what the supply must add. Adding a copy that does not fit means no bigger
     set with it fits either, so the walk stops there. */
  const tpl = {};
  for (const k of keys) {
    const T = MOLECULES[k], list = [], use = types.map(() => 0);
    (function go(ti, union) {
      if (ti === types.length) {
        const need = {};
        for (const el of ORDER) need[el] = (T.count[el] || 0) - (union.count[el] || 0);
        list.push({ use: use.slice(), need, size: union.els.length });
        return;
      }
      go(ti + 1, union);
      const t = types[ti];
      if (!t.keys.has(k)) return;
      let u = union;
      for (let c = 1; c <= t.n; c++) {
        u = joinGraphs(u, t.g);
        if (u.els.length > T.els.length || !embeds(u, T)) break;
        use[ti] = c;
        go(ti + 1, u);
      }
      use[ti] = 0;
    })(0, EMPTY_G);
    list.sort((a, b) => b.size - a.size);      // fragment-heavy first: they find the best plan sooner
    tpl[k] = list;
  }

  const avail = types.map((t) => t.n);
  const ceiling = keys.reduce((n, k) => n + rOf[k], 0);
  const best = maxPlan(keys, rOf, tpl, avail, supply, -1, ceiling);
  const useful = new Set();
  if (best > 0) types.forEach((t, ti) => { if (maxPlan(keys, rOf, tpl, avail, supply, ti, best) >= best) useful.add(ti); });
  return { best: Math.max(0, best), useful };
}

// The most molecules a plan can make, optionally with at least one fragment of type `must`.
function maxPlan(keys, rOf, tpl, avail, supply, must, stopAt) {
  const use = avail.map(() => 0), left = {};
  for (const el of ORDER) left[el] = supply[el] || 0;
  const after = [];
  for (let i = keys.length - 1, acc = 0; i >= 0; i--) { after[i] = acc; acc += rOf[keys[i]]; }
  const memo = new Map();
  let best = -1;
  function rec(ki, j, placed, count) {
    if (best >= stopAt) return;
    const k = keys[ki];
    if (count + (rOf[k] - placed) + after[ki] <= best) return;
    const memoKey = ki + '|' + j + '|' + placed + '|' + count + '|' + use.join(',') + '|' + ORDER.map((el) => left[el]).join(',');
    if (memo.has(memoKey)) return;
    memo.set(memoKey, true);
    const list = tpl[k];
    if (placed < rOf[k]) {
      for (let t = j; t < list.length; t++) {
        const tp = list[t];
        let ok = true;
        for (let x = 0; x < avail.length && ok; x++) if (use[x] + tp.use[x] > avail[x]) ok = false;
        for (const el of ORDER) if (ok && tp.need[el] > left[el]) ok = false;
        if (!ok) continue;
        for (let x = 0; x < avail.length; x++) use[x] += tp.use[x];
        for (const el of ORDER) left[el] -= tp.need[el];
        rec(ki, t, placed + 1, count + 1);
        for (let x = 0; x < avail.length; x++) use[x] -= tp.use[x];
        for (const el of ORDER) left[el] += tp.need[el];
        if (best >= stopAt) return;
      }
    }
    if (ki + 1 < keys.length) rec(ki + 1, 0, 0, count);
    else if (must < 0 || use[must] > 0) best = Math.max(best, count);
  }
  rec(0, 0, 0, 0);
  return best;
}

function resultOf(an) {
  if (an.won) return { kind: 'win' };
  if (an.over) return { kind: 'fail', made: an.made, total: an.total, lost: an.lost, noRoom: an.noRoom };
  return null;
}

/* ---------- THERMAL MOTION ----------
   A lone radical (one atom, a free hand, no bonds) can drift to a neighbouring
   empty cell. It never drifts to where its hand would touch another free
   hand, so drifting never makes a bond: every bond on the dish is still one
   the player placed. `blocked` is the cells a drift must neither leave nor
   enter, which play.js fills with the cell being aimed at and its
   neighbours, so the preview never changes under the player's finger. */
function hopTargets(s, id, blocked) {
  const a = s.atoms[id];
  if (!a || s.result || a.status !== 'live' || a.bonds.length || a.free === 0) return [];
  if (blocked && blocked.has(a.cell)) return [];
  const out = [];
  for (let d = 0; d < 4; d++) {
    const nc = neighbourCell(s, a.cell, d);
    if (nc < 0 || s.grid[nc] !== -1 || (blocked && blocked.has(nc))) continue;
    let touches = false;
    for (let e = 0; e < 4 && !touches; e++) {
      const mc = neighbourCell(s, nc, e);
      if (mc < 0 || mc === a.cell) continue;
      const mid = s.grid[mc];
      if (mid >= 0 && s.atoms[mid].free > 0) touches = true;
    }
    if (!touches) out.push(nc);
  }
  return out;
}
function hop(s, id, cell, blocked) {
  if (!hopTargets(s, id, blocked).includes(cell)) return false;
  const a = s.atoms[id];
  s.grid[a.cell] = -1; a.cell = cell; s.grid[cell] = id;
  s.version += 1;
  s.analysis = analyse(s);
  return true;
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
  s.next += 1; s.placements += 1; s.version += 1;
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
  createState, clone, place, preview, canPlace, analyse, groupOf, graphOf, hopTargets, hop,
  cellOf, colOf, rowOf, neighbourCell, layoutMolecule,
};
}));
