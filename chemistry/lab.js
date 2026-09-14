/* ============================================================
   Lessons in Chemistry · chapter 2, reactions: the rules

   Headless, like model.js: no canvas, no motion. play.js moves the molecules
   and asks this file what the test tube does.

   From the owner, 2026-09-14: the dish holds whole molecules (sulphuric acid,
   hydrochloric acid, calcium hydroxide, water...). Put two in the test tube;
   the right pair gives the molecule you need. Only the tube reacts. Amounts
   matter, one step at a time: one hydrochloric acid turns calcium hydroxide
   into a basic salt, a second finishes it as calcium chloride. What a
   reaction makes lands on a tray: the molecule you need goes to the beaker,
   a byproduct a later step needs goes back to the dish, and whatever is left
   on the tray is poured away at the next reaction.

   Every reaction here is a real one, written as its equation. tests.mjs
   checks that any two molecules a level can put side by side which would
   react in real life (an acid and a base, an ammonium salt and a strong
   base, lime and water) have their reaction in the table, so the tube never
   says "no reaction" to a pair that would.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChemLab = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ---------- MOLECULES ----------
   Each is drawn, not built: atoms at 2D positions in bond lengths (y down),
   then bonds by atom index, '-' single, '=' double. Ionic pairs sit side by
   side with no stick between them. `tags` say what it can do, for the
   honesty check. */
function sp(key, name, formula, atoms, bonds, tags) {
  const at = atoms.map(([el, x, y]) => ({ el, x, y }));
  const bs = bonds ? bonds.split(' ').map((b) => {
    const m = b.match(/^(\d+)([-=#])(\d+)$/);
    return { a: +m[1], b: +m[3], order: m[2] === '-' ? 1 : m[2] === '=' ? 2 : 3 };
  }) : [];
  const cx = at.reduce((n, a) => n + a.x, 0) / at.length, cy = at.reduce((n, a) => n + a.y, 0) / at.length;
  at.forEach((a) => { a.x -= cx; a.y -= cy; });
  const extent = Math.max(...at.map((a) => Math.hypot(a.x, a.y)));
  return { key, name, formula, atoms: at, bonds: bs, extent, tags: tags || [] };
}
const SPECIES = {};
[
  sp('water', 'water', 'H₂O', [['O', 0, -0.2], ['H', -0.8, 0.4], ['H', 0.8, 0.4]], '0-1 0-2', ['water']),
  sp('hydrochloric-acid', 'hydrochloric acid', 'HCl', [['H', -0.5, 0], ['Cl', 0.5, 0]], '0-1', ['acid', 'chloride']),
  sp('nitric-acid', 'nitric acid', 'HNO₃', [['N', 0, 0], ['O', 0, -1], ['O', 0.87, 0.5], ['O', -0.87, 0.5], ['H', -1.6, 0.1]], '0=1 0-2 0-3 3-4', ['acid']),
  sp('sulphuric-acid', 'sulphuric acid', 'H₂SO₄',
     [['S', 0, 0], ['O', 0, -1], ['O', 0, 1], ['O', -1, 0], ['O', 1, 0], ['H', -1.7, -0.55], ['H', 1.7, 0.55]], '0=1 0=2 0-3 0-4 3-5 4-6', ['acid']),
  sp('sodium-hydroxide', 'sodium hydroxide', 'NaOH', [['Na', -1, 0], ['O', 0, 0], ['H', 0.8, 0.6]], '0-1 1-2', ['base', 'strong-base']),
  sp('sodium-chloride', 'sodium chloride', 'NaCl', [['Na', -0.5, 0], ['Cl', 0.5, 0]], '0-1', ['salt', 'chloride']),
  sp('sodium-nitrate', 'sodium nitrate', 'NaNO₃', [['N', 0, 0], ['O', 0, -1], ['O', 0.87, 0.5], ['O', -0.87, 0.5], ['Na', -1.74, 1]], '0=1 0-2 0-3 3-4', ['salt']),
  sp('sodium-hydrogen-sulphate', 'sodium hydrogen sulphate', 'NaHSO₄',
     [['S', 0, 0], ['O', 0, -1], ['O', 0, 1], ['O', -1, 0], ['O', 1, 0], ['Na', -2, 0], ['H', 1.7, 0.55]], '0=1 0=2 0-3 0-4 3-5 4-6', ['acid', 'salt']),
  sp('sodium-sulphate', 'sodium sulphate', 'Na₂SO₄',
     [['S', 0, 0], ['O', 0, -1], ['O', 0, 1], ['O', -1, 0], ['O', 1, 0], ['Na', -2, 0], ['Na', 2, 0]], '0=1 0=2 0-3 0-4 3-5 4-6', ['salt']),
  sp('calcium-hydroxide', 'calcium hydroxide', 'Ca(OH)₂',
     [['H', -1.7, -0.55], ['O', -1, 0], ['Ca', 0, 0], ['O', 1, 0], ['H', 1.7, 0.55]], '0-1 1-2 2-3 3-4', ['base', 'strong-base']),
  sp('calcium-hydroxychloride', 'calcium hydroxychloride', 'Ca(OH)Cl',
     [['H', -1.7, -0.55], ['O', -1, 0], ['Ca', 0, 0], ['Cl', 1, 0]], '0-1 1-2 2-3', ['base', 'basic-salt', 'chloride']),
  sp('calcium-chloride', 'calcium chloride', 'CaCl₂', [['Cl', -1, 0], ['Ca', 0, 0], ['Cl', 1, 0]], '1-0 1-2', ['salt', 'chloride']),
  sp('calcium-sulphate', 'calcium sulphate', 'CaSO₄',
     [['S', 0, 0], ['O', 0, -1], ['O', 1, 0], ['O', 0, 1], ['O', -1, 0], ['Ca', -1, 1]], '0=1 0=2 0-3 0-4 3-5 4-5', ['salt']),
  sp('calcium-hydroxynitrate', 'calcium hydroxynitrate', 'Ca(OH)NO₃',
     [['H', -1.7, -0.55], ['O', -1, 0], ['Ca', 0, 0], ['O', 1, 0], ['N', 2, 0], ['O', 2, -1], ['O', 2.87, 0.5]], '0-1 1-2 2-3 3-4 4=5 4-6', ['base', 'basic-salt']),
  sp('calcium-nitrate', 'calcium nitrate', 'Ca(NO₃)₂',
     [['O', -2.87, 0.5], ['O', -2, -1], ['N', -2, 0], ['O', -1, 0], ['Ca', 0, 0], ['O', 1, 0], ['N', 2, 0], ['O', 2, -1], ['O', 2.87, 0.5]],
     '2-0 2=1 2-3 3-4 4-5 5-6 6=7 6-8', ['salt']),
  sp('calcium-chloride-nitrate', 'calcium chloride nitrate', 'CaCl(NO₃)',
     [['Cl', -1, 0], ['Ca', 0, 0], ['O', 1, 0], ['N', 2, 0], ['O', 2, -1], ['O', 2.87, 0.5]], '1-0 1-2 2-3 3=4 3-5', ['salt', 'chloride']),
  sp('calcium-oxide', 'calcium oxide', 'CaO', [['Ca', -0.5, 0], ['O', 0.5, 0]], '0=1', ['base', 'oxide']),
  sp('ammonia', 'ammonia', 'NH₃', [['N', 0, 0], ['H', 0, -1], ['H', 0.87, 0.5], ['H', -0.87, 0.5]], '0-1 0-2 0-3', ['base']),
  sp('ammonium-chloride', 'ammonium chloride', 'NH₄Cl',
     [['N', 0, 0], ['H', 0, -1], ['H', 1, 0], ['H', 0, 1], ['H', -1, 0], ['Cl', 2.2, 0]], '0-1 0-2 0-3 0-4', ['ammonium', 'salt', 'chloride']),
  sp('ammonium-nitrate', 'ammonium nitrate', 'NH₄NO₃',
     [['N', 0, 0], ['H', 0, -1], ['H', 1, 0], ['H', 0, 1], ['H', -1, 0], ['N', 3, 0], ['O', 3, -1], ['O', 3.87, 0.5], ['O', 2.13, 0.5]],
     '0-1 0-2 0-3 0-4 5=6 5-7 5-8', ['ammonium', 'salt']),
].forEach((s) => { SPECIES[s.key] = s; });

/* ---------- REACTIONS ----------
   Two molecules in, one to three out, in the order the tray shows them: the
   interesting product first, water last. */
const REACTIONS = [];
function rx(a, b, products, note) { REACTIONS.push({ a, b, products, note }); }
// an acid and a base make a salt and water
rx('hydrochloric-acid', 'sodium-hydroxide', ['sodium-chloride', 'water']);
rx('nitric-acid', 'sodium-hydroxide', ['sodium-nitrate', 'water']);
rx('sulphuric-acid', 'sodium-hydroxide', ['sodium-hydrogen-sulphate', 'water']);
rx('sodium-hydrogen-sulphate', 'sodium-hydroxide', ['sodium-sulphate', 'water']);
rx('hydrochloric-acid', 'calcium-hydroxide', ['calcium-hydroxychloride', 'water']);
rx('hydrochloric-acid', 'calcium-hydroxychloride', ['calcium-chloride', 'water']);
rx('sulphuric-acid', 'calcium-hydroxide', ['calcium-sulphate', 'water', 'water']);
rx('nitric-acid', 'calcium-hydroxide', ['calcium-hydroxynitrate', 'water']);
rx('nitric-acid', 'calcium-hydroxynitrate', ['calcium-nitrate', 'water']);
rx('nitric-acid', 'calcium-hydroxychloride', ['calcium-chloride-nitrate', 'water']);
rx('hydrochloric-acid', 'calcium-hydroxynitrate', ['calcium-chloride-nitrate', 'water']);
rx('sulphuric-acid', 'calcium-hydroxychloride', ['calcium-sulphate', 'hydrochloric-acid', 'water']);
rx('sulphuric-acid', 'calcium-hydroxynitrate', ['calcium-sulphate', 'nitric-acid', 'water']);
rx('sodium-hydrogen-sulphate', 'calcium-hydroxide', ['calcium-sulphate', 'sodium-hydroxide', 'water']);
rx('sodium-hydrogen-sulphate', 'calcium-hydroxychloride', ['calcium-sulphate', 'sodium-chloride', 'water']);
rx('sodium-hydrogen-sulphate', 'calcium-hydroxynitrate', ['calcium-sulphate', 'sodium-nitrate', 'water']);
// lime: calcium oxide takes an acid, or water
rx('hydrochloric-acid', 'calcium-oxide', ['calcium-hydroxychloride']);
rx('nitric-acid', 'calcium-oxide', ['calcium-hydroxynitrate']);
rx('sulphuric-acid', 'calcium-oxide', ['calcium-sulphate', 'water']);
rx('sodium-hydrogen-sulphate', 'calcium-oxide', ['calcium-sulphate', 'sodium-hydroxide']);
rx('calcium-oxide', 'water', ['calcium-hydroxide']);
// ammonia: a base with no hydroxide, and an ammonium salt gives it up to a strong base
rx('hydrochloric-acid', 'ammonia', ['ammonium-chloride']);
rx('nitric-acid', 'ammonia', ['ammonium-nitrate']);
rx('ammonium-chloride', 'sodium-hydroxide', ['sodium-chloride', 'water', 'ammonia']);
rx('ammonium-nitrate', 'sodium-hydroxide', ['sodium-nitrate', 'water', 'ammonia']);

function reactionFor(a, b) {
  return REACTIONS.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a)) || null;
}
/* Would these two react in real life? The honesty check: an acid with a
   base, an ammonium salt with a strong base or lime, and lime with water. */
function shouldReact(a, b) {
  const A = SPECIES[a].tags, B = SPECIES[b].tags, has = (t, x) => t.includes(x);
  const pair = (p, q) => (has(A, p) && has(B, q)) || (has(A, q) && has(B, p));
  return pair('acid', 'base') || pair('ammonium', 'strong-base') || pair('ammonium', 'oxide') || pair('oxide', 'water');
}

/* ---------- THE BENCH ----------
   Every molecule is a piece in one place: the dish, the tube (two at most),
   the tray (what the last reaction made), the beaker, or gone. */
const TUBE = 2;
function createLab(level) {
  const s = {
    pieces: [],
    targets: level.targets.map((t) => ({ key: t[0], n: t[1] })),
    made: {},
    version: 0,
    result: null,
    analysis: null,
  };
  for (const key of level.dish) s.pieces.push({ id: s.pieces.length, key, zone: 'dish' });
  refresh(s);
  return s;
}
const inZone = (s, zone) => s.pieces.filter((p) => p.zone === zone);
function refresh(s) {
  s.version += 1;
  s.analysis = analyse(s);
  s.result = s.analysis.won ? { kind: 'win' }
    : s.analysis.over ? { kind: 'fail', made: s.analysis.made, total: s.analysis.total, lost: s.analysis.lost } : null;
}

/* Into the tube. With two in, they react if they can. */
function toTube(s, id) {
  const p = s.pieces[id];
  if (!p || s.result || p.zone === 'gone' || p.zone === 'beaker' || p.zone === 'tube') return { ok: false, why: 'cannot' };
  const inTube = inZone(s, 'tube');
  if (inTube.length >= TUBE) return { ok: false, why: 'full' };
  const lostBefore = s.analysis.lost;
  p.zone = 'tube';
  const ev = { ok: true, reaction: null, used: [], products: [], poured: [] };
  if (inTube.length + 1 === TUBE) {
    const other = inTube[0], r = reactionFor(other.key, p.key);
    if (r) {
      ev.reaction = r;
      ev.used = [other.id, p.id];
      other.zone = 'gone'; p.zone = 'gone';
      ev.poured = inZone(s, 'tray').map((q) => q.id);
      ev.poured.forEach((qid) => { s.pieces[qid].zone = 'gone'; });
      r.products.forEach((key) => {
        const np = { id: s.pieces.length, key, zone: 'tray' };
        s.pieces.push(np);
        ev.products.push(np.id);
      });
    } else {
      ev.noReaction = true;
    }
  }
  refresh(s);
  ev.lost = s.analysis.lost > lostBefore;
  ev.result = s.result;
  return ev;
}
function toDish(s, id) {
  const p = s.pieces[id];
  if (!p || p.zone === 'gone' || p.zone === 'beaker') return false;
  p.zone = 'dish';
  refresh(s);
  return true;
}
// The beaker takes only what the list still wants.
function deliver(s, id) {
  const p = s.pieces[id];
  if (!p || s.result || p.zone === 'gone' || p.zone === 'beaker') return { ok: false, why: 'cannot' };
  const t = s.targets.find((q) => q.key === p.key);
  if (!t) return { ok: false, why: 'not-on-list' };
  if ((s.made[p.key] || 0) >= t.n) return { ok: false, why: 'enough' };
  p.zone = 'beaker';
  s.made[p.key] = (s.made[p.key] || 0) + 1;
  refresh(s);
  return { ok: true, result: s.result };
}

/* ---------- WHAT THE BENCH CAN STILL MAKE ----------
   A search over what is left, counting molecules by kind: react any pair the
   table allows, deliver anything the list wants, and find the most of the
   list that can still be made. Only molecules that can lead to something on
   the list are counted; the rest cannot help. It assumes the player saves
   every byproduct worth saving, so a molecule poured away is lost only once
   it has actually gone. */
function analyse(s) {
  let total = 0, made = 0;
  const owed = {};
  for (const t of s.targets) {
    const m = Math.min(t.n, s.made[t.key] || 0);
    total += t.n; made += m;
    if (t.n > m) owed[t.key] = t.n - m;
  }
  const counts = {};
  for (const p of s.pieces) if (p.zone === 'dish' || p.zone === 'tube' || p.zone === 'tray') counts[p.key] = (counts[p.key] || 0) + 1;
  const best = bestPlan(counts, owed);
  const left = total - made;
  return { total, made, best, lost: left - best, won: left === 0, over: left > 0 && best === 0 };
}
function relevantTo(keys) {
  const rel = new Set(keys);
  for (let grew = true; grew;) {
    grew = false;
    for (const r of REACTIONS) {
      if (r.products.some((k) => rel.has(k))) {
        for (const k of [r.a, r.b]) if (!rel.has(k)) { rel.add(k); grew = true; }
      }
    }
  }
  return rel;
}
function bestPlan(counts, owed) {
  const tkeys = Object.keys(owed);
  if (!tkeys.length) return 0;
  const rel = [...relevantTo(tkeys)];
  const idx = new Map(rel.map((k, i) => [k, i]));
  const c = rel.map((k) => counts[k] || 0);
  const o = tkeys.map((k) => owed[k]);
  const rxs = REACTIONS.filter((r) => idx.has(r.a) && idx.has(r.b)).map((r) => ({
    a: idx.get(r.a), b: idx.get(r.b), out: r.products.filter((k) => idx.has(k)).map((k) => idx.get(k)),
  }));
  const tIdx = tkeys.map((k) => idx.get(k));
  const memo = new Map();
  let budget = 200000;
  function go() {
    const key = c.join(',') + '|' + o.join(',');
    if (memo.has(key)) return memo.get(key);
    if (--budget < 0) return 0;
    let best = 0;
    for (let t = 0; t < tIdx.length; t++) {
      if (o[t] > 0 && c[tIdx[t]] > 0) {
        c[tIdx[t]]--; o[t]--;
        best = Math.max(best, 1 + go());
        c[tIdx[t]]++; o[t]++;
      }
    }
    for (const r of rxs) {
      if (r.a === r.b ? c[r.a] < 2 : (c[r.a] < 1 || c[r.b] < 1)) continue;
      c[r.a]--; c[r.b]--;
      r.out.forEach((k) => c[k]++);
      best = Math.max(best, go());
      r.out.forEach((k) => c[k]--);
      c[r.a]++; c[r.b]++;
    }
    memo.set(key, best);
    return best;
  }
  return go();
}

// Every molecule a level can ever hold: the dish, and everything any reaction among them makes.
function closure(dish) {
  const have = new Set(dish);
  for (let grew = true; grew;) {
    grew = false;
    for (const r of REACTIONS) {
      if (have.has(r.a) && have.has(r.b)) for (const k of r.products) if (!have.has(k)) { have.add(k); grew = true; }
    }
  }
  return have;
}

return { SPECIES, REACTIONS, TUBE, reactionFor, shouldReact, createLab, toTube, toDish, deliver, analyse, bestPlan, closure };
}));
