/* ============================================================
   Litmus · the rules

   Headless: no canvas, no clock, no motion. play.js moves the atoms around
   the dish and asks this file what happens when two free hands meet.

   The game in six lines, from the owner's sketch (2026-09-14):
     an atom has hands, and the number of hands IS the element;
     every free hand is charged: two that come within reach grab each other,
       and the two atoms hold with every hand they both have spare (up to 3);
     a molecule with no free hand is finished;
     finished and on the list, it is collected; finished and not on the list,
       it is waste, and those atoms are used up;
     the atoms are what floats in the dish plus a set number in the panel;
     every molecule on the list must be made, or the level fails.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChemModel = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ---------- ELEMENTS ----------
   Real valences, so a teacher sees something honest. Mass only sets how
   lively an atom is in the dish: light atoms jitter, heavy ones barely move.
   Iron is iron as it is in iron(III) chloride. */
const ELEMENTS = {
  H:  { name: 'hydrogen',  hands: 1, mass: 1 },
  O:  { name: 'oxygen',    hands: 2, mass: 16 },
  N:  { name: 'nitrogen',  hands: 3, mass: 14 },
  C:  { name: 'carbon',    hands: 4, mass: 12 },
  F:  { name: 'fluorine',  hands: 1, mass: 19 },
  Cl: { name: 'chlorine',  hands: 1, mass: 35 },
  Na: { name: 'sodium',    hands: 1, mass: 23 },
  K:  { name: 'potassium', hands: 1, mass: 39 },
  Mg: { name: 'magnesium', hands: 2, mass: 24 },
  Ca: { name: 'calcium',   hands: 2, mass: 40 },
  Al: { name: 'aluminium', hands: 3, mass: 27 },
  Fe: { name: 'iron',      hands: 3, mass: 56 },
  Zn: { name: 'zinc',      hands: 2, mass: 65 },
  Cu: { name: 'copper',    hands: 2, mass: 64 },
};
const ORDER = Object.keys(ELEMENTS);
const MAX_BOND = 3;

function countEls(els) {
  const out = {};
  for (const el of els) out[el] = (out[el] || 0) + 1;
  return out;
}

/* ---------- MOLECULES ----------
   The atoms as element symbols run together, then the bonds by atom index,
   '-' single, '=' double, '#' triple. tests.mjs checks every atom's bonds add
   up to its hands, so a typo here cannot ship. Every one is a tree: two atoms
   that are already in one molecule never grab each other again. */
function mol(key, name, formula, atoms, bonds) {
  const els = atoms.match(/[A-Z][a-z]?/g);
  const adj = els.map(() => []);
  for (const b of bonds.split(' ')) {
    const m = b.match(/^(\d+)([-=#])(\d+)$/);
    const i = +m[1], j = +m[3], k = m[2] === '-' ? 1 : m[2] === '=' ? 2 : 3;
    adj[i].push([j, k]); adj[j].push([i, k]);
  }
  return { key, name, formula, els, adj, count: countEls(els) };
}
const MOLECULES = {};
[
  mol('hydrogen-gas',       'hydrogen gas',       'H₂',           'HH',        '0-1'),
  mol('water',              'water',              'H₂O',          'OHH',       '0-1 0-2'),
  mol('ammonia',            'ammonia',            'NH₃',          'NHHH',      '0-1 0-2 0-3'),
  mol('methane',            'methane',            'CH₄',          'CHHHH',     '0-1 0-2 0-3 0-4'),
  mol('hydrogen-peroxide',  'hydrogen peroxide',  'H₂O₂',    'OOHH',      '0-1 0-2 1-3'),
  mol('oxygen-gas',         'oxygen gas',         'O₂',           'OO',        '0=1'),
  mol('nitrogen-gas',       'nitrogen gas',       'N₂',           'NN',        '0#1'),
  mol('carbon-dioxide',     'carbon dioxide',     'CO₂',          'COO',       '0=1 0=2'),
  mol('formaldehyde',       'formaldehyde',       'CH₂O',         'COHH',      '0=1 0-2 0-3'),
  mol('hydrazine',          'hydrazine',          'N₂H₄',    'NNHHHH',    '0-1 0-2 0-3 1-4 1-5'),
  mol('methanol',           'methanol',           'CH₃OH',        'COHHHH',    '0-1 0-2 0-3 0-4 1-5'),
  mol('ethane',             'ethane',             'C₂H₆',    'CCHHHHHH',  '0-1 0-2 0-3 0-4 1-5 1-6 1-7'),
  mol('ethylene',           'ethylene',           'C₂H₄',    'CCHHHH',    '0=1 0-2 0-3 1-4 1-5'),
  mol('ethanol',            'ethanol',            'C₂H₅OH',  'CCOHHHHHH', '0-1 1-2 0-3 0-4 0-5 1-6 1-7 2-8'),
  mol('dimethyl-ether',     'dimethyl ether',     'CH₃OCH₃', 'CCOHHHHHH', '0-2 1-2 0-3 0-4 0-5 1-6 1-7 1-8'),
  mol('ethyne',             'ethyne',             'C₂H₂',    'CCHH',      '0#1 0-2 1-3'),
  mol('urea',               'urea',               'CO(NH₂)₂', 'CONNHHHH', '0=1 0-2 0-3 2-4 2-5 3-6 3-7'),
  mol('nitrous-acid',       'nitrous acid',       'HNO₂',         'NOOH',      '0=1 0-2 2-3'),
  mol('chlorine-gas',       'chlorine gas',       'Cl₂',          'ClCl',      '0-1'),
  mol('fluorine-gas',       'fluorine gas',       'F₂',           'FF',        '0-1'),
  mol('hydrogen-chloride',  'hydrogen chloride',  'HCl',               'HCl',       '0-1'),
  mol('hydrogen-fluoride',  'hydrogen fluoride',  'HF',                'HF',        '0-1'),
  mol('salt',               'sodium chloride',    'NaCl',              'NaCl',      '0-1'),
  mol('sodium-fluoride',    'sodium fluoride',    'NaF',               'NaF',       '0-1'),
  mol('sodium-hydroxide',   'sodium hydroxide',   'NaOH',              'NaOH',      '0-1 1-2'),
  mol('magnesium-oxide',    'magnesium oxide',    'MgO',               'MgO',       '0=1'),
  mol('magnesium-chloride', 'magnesium chloride', 'MgCl₂',        'MgClCl',    '0-1 0-2'),
  mol('calcium-oxide',      'calcium oxide',      'CaO',               'CaO',       '0=1'),
  mol('calcium-chloride',   'calcium chloride',   'CaCl₂',        'CaClCl',    '0-1 0-2'),
  mol('calcium-hydroxide',  'calcium hydroxide',  'Ca(OH)₂',      'CaOOHH',    '0-1 0-2 1-3 2-4'),
  mol('aluminium-chloride', 'aluminium chloride', 'AlCl₃',        'AlClClCl',  '0-1 0-2 0-3'),
  mol('potassium-chloride', 'potassium chloride', 'KCl',          'KCl',       '0-1'),
  mol('potassium-fluoride', 'potassium fluoride', 'KF',           'KF',        '0-1'),
  mol('potassium-oxide',    'potassium oxide',    'K₂O',          'KKO',       '0-2 1-2'),
  mol('potassium-hydroxide', 'potassium hydroxide', 'KOH',        'KOH',       '0-1 1-2'),
  mol('sodium-oxide',       'sodium oxide',       'Na₂O',         'NaNaO',     '0-2 1-2'),
  mol('zinc-oxide',         'zinc oxide',         'ZnO',          'ZnO',       '0=1'),
  mol('zinc-chloride',      'zinc chloride',      'ZnCl₂',        'ZnClCl',    '0-1 0-2'),
  mol('zinc-hydroxide',     'zinc hydroxide',     'Zn(OH)₂',      'ZnOOHH',    '0-1 0-2 1-3 2-4'),
  mol('copper-oxide',       'copper oxide',       'CuO',          'CuO',       '0=1'),
  mol('copper-chloride',    'copper chloride',    'CuCl₂',        'CuClCl',    '0-1 0-2'),
  mol('magnesium-hydroxide', 'magnesium hydroxide', 'Mg(OH)₂',    'MgOOHH',    '0-1 0-2 1-3 2-4'),
  mol('magnesium-fluoride', 'magnesium fluoride', 'MgF₂',         'MgFF',      '0-1 0-2'),
  mol('calcium-fluoride',   'calcium fluoride',   'CaF₂',         'CaFF',      '0-1 0-2'),
  mol('aluminium-oxide',    'aluminium oxide',    'Al₂O₃',        'AlAlOOO',   '0=2 0-4 1=3 1-4'),
  mol('aluminium-fluoride', 'aluminium fluoride', 'AlF₃',         'AlFFF',     '0-1 0-2 0-3'),
  mol('aluminium-hydroxide', 'aluminium hydroxide', 'Al(OH)₃',    'AlOOOHHH',  '0-1 0-2 0-3 1-4 2-5 3-6'),
  mol('iron-oxide',         'iron oxide',         'Fe₂O₃',        'FeFeOOO',   '0=2 0-4 1=3 1-4'),
  mol('iron-hydroxide',     'iron hydroxide',     'Fe(OH)₃',      'FeOOOHHH',  '0-1 0-2 0-3 1-4 2-5 3-6'),
  mol('chloromethane',      'chloromethane',      'CH₃Cl',        'CClHHH',    '0-1 0-2 0-3 0-4'),
  mol('dichloromethane',    'dichloromethane',    'CH₂Cl₂',       'CClClHH',   '0-1 0-2 0-3 0-4'),
  mol('chloroform',         'chloroform',         'CHCl₃',        'CClClClH',  '0-1 0-2 0-3 0-4'),
  mol('carbon-tetrachloride', 'carbon tetrachloride', 'CCl₄',     'CClClClCl', '0-1 0-2 0-3 0-4'),
  mol('tetrafluoromethane', 'tetrafluoromethane', 'CF₄',          'CFFFF',     '0-1 0-2 0-3 0-4'),
  mol('hydrogen-cyanide',   'hydrogen cyanide',   'HCN',          'CNH',       '0#1 0-2'),
  mol('methanoic-acid',     'methanoic acid',     'HCOOH',        'COOHH',     '0=1 0-2 0-3 2-4'),
  mol('ethanoic-acid',      'ethanoic acid',      'CH₃COOH',      'CCOOHHHH',  '0-1 1=2 1-3 0-4 0-5 0-6 3-7'),
  mol('carbonic-acid',      'carbonic acid',      'H₂CO₃',        'COOOHH',    '0=1 0-2 0-3 2-4 3-5'),
  mol('propane',            'propane',            'C₃H₈',         'CCCHHHHHHHH', '0-1 1-2 0-3 0-4 0-5 1-6 1-7 2-8 2-9 2-10'),
  mol('propene',            'propene',            'C₃H₆',         'CCCHHHHHH', '0=1 1-2 0-3 0-4 1-5 2-6 2-7 2-8'),
  mol('propyne',            'propyne',            'C₃H₄',         'CCCHHHH',   '0#1 1-2 0-3 2-4 2-5 2-6'),
  mol('methylamine',        'methylamine',        'CH₃NH₂',       'CNHHHHH',   '0-1 0-2 0-3 0-4 1-5 1-6'),
  mol('acetaldehyde',       'acetaldehyde',       'CH₃CHO',       'CCOHHHH',   '0-1 1=2 0-3 0-4 0-5 1-6'),
  mol('propanone',          'propanone',          'CH₃COCH₃',     'CCCOHHHHHH', '0-1 1-2 1=3 0-4 0-5 0-6 2-7 2-8 2-9'),
  mol('iron-chloride',      'iron chloride',      'FeCl₃',        'FeClClCl',  '0-1 0-2 0-3'),
].forEach((m) => { MOLECULES[m.key] = m; });

/* ---------- MATCHING ----------
   Does graph F sit inside molecule T as it already is? Same elements, and
   every pair of F's atoms bonded at the same order in T, including pairs that
   are NOT bonded: a bond never changes once made.

   F may be several pieces still apart (F.part says which piece each atom is
   in). Two pieces can still be dragged together, so between pieces T may
   have a bond or not; only inside a piece must the bonds already match. */
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
  const part = F.part, order = bfsOrder(F);
  const map = new Array(n).fill(-1), used = new Array(m).fill(false);
  function go(idx) {
    if (idx === n) return true;
    const u = order[idx];
    for (let t = 0; t < m; t++) {
      if (used[t] || T.els[t] !== F.els[u]) continue;
      let ok = true;
      for (let p = 0; p < idx && ok; p++) {
        const v = order[p];
        if (part && part[u] !== part[v]) continue;
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
// Same size and a whole-graph embedding is a bijection that keeps every bond.
function isomorphic(A, B) { return A.els.length === B.els.length && embeds(A, B); }

/* ---------- THE DISH ---------- */
function createState(level) {
  const s = {
    atoms: [],
    avail: Object.assign({}, level.avail || {}),
    targets: level.targets.map((t) => ({ key: t[0], n: t[1] })),
    made: {},
    wasted: 0,
    version: 0,
    result: null,
    analysis: null,
  };
  for (const el of level.dish || []) addAtom(s, el, true);
  refresh(s);
  return s;
}
function clone(s) {
  return {
    atoms: s.atoms.map((a) => Object.assign({}, a, { bonds: a.bonds.map((b) => ({ to: b.to, order: b.order })) })),
    avail: Object.assign({}, s.avail), targets: s.targets, made: Object.assign({}, s.made),
    wasted: s.wasted, version: s.version, result: s.result, analysis: s.analysis,
  };
}
function addAtom(s, el, committed) {
  const id = s.atoms.length;
  s.atoms.push({ id, el, free: ELEMENTS[el].hands, bonds: [], status: 'live', committed: !!committed, fromPanel: !committed });
  return id;
}

/* An atom picked up from the panel is still the panel's until it grabs
   something or is let go inside the dish: carried back out, it returns. */
function take(s, el) {
  if (s.result || !(s.avail[el] > 0)) return -1;
  s.avail[el] -= 1;
  const id = addAtom(s, el, false);
  s.version += 1;
  refresh(s);
  return id;
}
function putBack(s, id) {
  const a = s.atoms[id];
  if (!a || a.committed || a.status !== 'live' || a.bonds.length) return false;
  a.status = 'gone';
  s.avail[a.el] = (s.avail[a.el] || 0) + 1;
  s.version += 1;
  refresh(s);
  return true;
}
function commit(s, id) {
  const a = s.atoms[id];
  if (!a || a.committed || a.status !== 'live') return false;
  a.committed = true;
  s.version += 1;
  refresh(s);
  return true;
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

function canBond(s, a, b) {
  const A = s.atoms[a], B = s.atoms[b];
  if (!A || !B || a === b || s.result) return false;
  if (A.status !== 'live' || B.status !== 'live' || A.free === 0 || B.free === 0) return false;
  return !groupOf(s, a).includes(b);
}

/* Two free hands met. Returns what it made. */
function bond(s, a, b) {
  if (!canBond(s, a, b)) return null;
  const A = s.atoms[a], B = s.atoms[b];
  const lostBefore = s.analysis ? s.analysis.lost : 0;
  const k = Math.min(A.free, B.free, MAX_BOND);
  A.free -= k; B.free -= k;
  A.bonds.push({ to: b, order: k });
  B.bonds.push({ to: a, order: k });
  A.committed = true; B.committed = true;
  const done = classify(s, a);
  resolve(s, done);
  s.version += 1;
  refresh(s);
  return {
    a, b, order: k,
    done: done && { kind: done.kind, key: done.key || null, ids: done.ids },
    lost: s.analysis.lost > lostBefore,
    result: s.result,
  };
}
// What a bond WOULD make, without making it.
function preview(s, a, b) {
  if (!canBond(s, a, b)) return null;
  return bond(clone(s), a, b);
}

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
    for (const i of done.ids) s.atoms[i].status = 'gone';
  } else {
    s.wasted += 1;
    for (const i of done.ids) s.atoms[i].status = 'waste';
  }
}
function refresh(s) {
  s.analysis = analyse(s);
  s.result = resultOf(s.analysis);
}

/* ---------- WHAT THE DISH CAN STILL BECOME ----------
   After every change: how many of the molecules still owed can still be
   made? A molecule is built from panel atoms plus any pieces already in the
   dish, and several pieces can go into one molecule, since the player can
   drag any piece into any other. The best plan is the most molecules the
   atoms allow. Every molecule short of all of them is LOST.

   This is counting, not a search of the dish, so it is generous: it does not
   know that two bare atoms grab each other with every hand, so a piece that
   the ORDER of assembly has doomed is caught when it finishes as waste.

   PALMS. Green while the piece is part of some best plan, amber when it is
   no use to anything still owed: a radical that can only get in the way.
   The level is over when nothing more can be made. It is won only if every
   molecule was made. */
const EMPTY_G = { els: [], adj: [], count: {}, part: [], nparts: 0 };
function joinGraphs(A, B) {
  const off = A.els.length, count = Object.assign({}, A.count);
  for (const [el, n] of Object.entries(B.count)) count[el] = (count[el] || 0) + n;
  return {
    els: A.els.concat(B.els),
    adj: A.adj.concat(B.adj.map((l) => l.map(([j, o]) => [j + off, o]))),
    count,
    part: A.part.concat(B.els.map(() => A.nparts)),
    nparts: A.nparts + 1,
  };
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
  const supply = Object.assign({}, s.avail);

  const fragments = [], seen = new Set();
  for (const a of s.atoms) {
    if (a.status !== 'live' || seen.has(a.id)) continue;
    if (!a.committed) { supply[a.el] = (supply[a.el] || 0) + 1; seen.add(a.id); continue; }
    const ids = groupOf(s, a.id);
    ids.forEach((i) => seen.add(i));
    const g = graphOf(s, ids);
    const keys = remaining.filter(([k]) => embeds(g, MOLECULES[k])).map(([k]) => k);
    fragments.push({ ids, g, count: g.count, keys, green: keys.length > 0, type: -1 });
  }

  const usable = fragments.filter((f) => f.green);
  const pl = plan(remaining, supply, usable);
  usable.forEach((f) => { if (!pl.useful.has(f.type)) f.green = false; });

  const won = owed === 0;
  const over = !won && pl.best === 0;
  const palm = {};
  fragments.forEach((f) => f.ids.forEach((i) => {
    if (s.atoms[i].free > 0) palm[i] = f.green && !over ? 'green' : 'amber';
  }));
  return { remaining, supply, fragments, palm, won, over, total, made, best: pl.best, lost: owed - pl.best };
}

function plan(remaining, supply, frags) {
  const keys = remaining.map(([k]) => k);
  const rOf = Object.fromEntries(remaining);
  if (!keys.length) return { best: 0, useful: new Set() };

  // Pieces that are the same shape are interchangeable: count them by type.
  const types = [];
  frags.forEach((f) => {
    let ti = types.findIndex((t) => isomorphic(t.g, f.g));
    if (ti < 0) { ti = types.length; types.push({ g: f.g, n: 0, keys: new Set(f.keys) }); }
    types[ti].n++;
    f.type = ti;
  });

  /* Every way a molecule could take in pieces: how many of each type, and what
     the panel must add. A copy that does not fit means no bigger set with it
     fits either, so the walk stops there. */
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
    list.sort((a, b) => b.size - a.size);
    tpl[k] = list;
  }

  const avail = types.map((t) => t.n);
  const ceiling = keys.reduce((n, k) => n + rOf[k], 0);
  const best = maxPlan(keys, rOf, tpl, avail, supply, -1, ceiling);
  const useful = new Set();
  if (best > 0) types.forEach((t, ti) => { if (maxPlan(keys, rOf, tpl, avail, supply, ti, best) >= best) useful.add(ti); });
  return { best: Math.max(0, best), useful };
}

// The most molecules a plan can make, optionally with at least one piece of type `must`.
function maxPlan(keys, rOf, tpl, avail, supply, must, stopAt) {
  const use = avail.map(() => 0), left = {};
  for (const el of ORDER) left[el] = supply[el] || 0;
  const after = [];
  for (let i = keys.length - 1, acc = 0; i >= 0; i--) { after[i] = acc; acc += rOf[keys[i]]; }
  const memo = new Set();
  let best = -1;
  function rec(ki, j, placed, count) {
    if (best >= stopAt) return;
    const k = keys[ki];
    if (count + (rOf[k] - placed) + after[ki] <= best) return;
    const memoKey = ki + '|' + j + '|' + placed + '|' + count + '|' + use.join(',') + '|' + ORDER.map((el) => left[el]).join(',');
    if (memo.has(memoKey)) return;
    memo.add(memoKey);
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
  if (an.over) return { kind: 'fail', made: an.made, total: an.total, lost: an.lost };
  return null;
}

/* ---------- A MOLECULE AS A LITTLE DIAGRAM ----------
   For the target row: grid positions by breadth-first walk from the busiest
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
  ELEMENTS, ORDER, MAX_BOND, MOLECULES,
  countEls, embeds, isomorphic,
  createState, clone, take, putBack, commit, canBond, bond, preview,
  groupOf, graphOf, analyse, layoutMolecule,
};
}));
