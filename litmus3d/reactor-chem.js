/* ============================================================
   Litmus in 3D · the Reactor: the rules

   Headless, like /chemistry/lab.js, which it builds on and never changes
   (the live 2D game keeps its own bench). The 3D Reactor (owner, 2026-10-03):
   whole molecules float all round you; tap one and it glides into the
   reaction sphere. Some reactions go the moment their molecules meet; others
   need an AGENT, a catalyst or a condition the player picks from four orbs,
   with two chances a level. Real chemistry only: every agent reaction here is
   in iCloud `Zamborin/Game Briefs/3D-IDEAS/LITMUS_REACTOR_AGENTS.md`, row by
   row, with its sources.

   What a reaction makes: anything a goal wants flies to its goal orb; the
   rest WAITS above the sphere. A waiting molecule can be put back in, or taken
   out to keep; whatever still waits when the next reaction starts is lost.
   ============================================================ */
(function (root, factory) {
  const lab = root.ChemLab || (typeof require === 'function' ? require('../chemistry/lab.js') : null);
  const api = factory(lab);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReactorChem = api;
}(typeof self !== 'undefined' ? self : this, function (LAB) {
'use strict';

/* ---------- THE AGENTS ----------
   The nine the research found the reactions need (owner, 2026-10-03: four of
   them shown in a level, the right one or ones and the rest decoys). */
const AGENTS = {
  heat:        { name: 'Heat' },
  spark:       { name: 'Spark' },
  light:       { name: 'Light' },
  electricity: { name: 'Electricity' },
  platinum:    { name: 'Platinum', catalyst: true },
  iron:        { name: 'Iron', catalyst: true },
  nickel:      { name: 'Nickel', catalyst: true },
  vanadium:    { name: 'Vanadium(V) oxide', short: 'Vanadium oxide', catalyst: true },
  manganese:   { name: 'Manganese(IV) oxide', short: 'Manganese dioxide', catalyst: true },
  // the Carbon Chamber's own two (owner, 2026-10-03; iCloud 3D-IDEAS/LITMUS_CARBON_AGENTS.md)
  acid:        { name: 'Acid', catalyst: true },
  oxidiser:    { name: 'Oxidiser' },
};
/* THE CHAPTER. The Carbon Chamber plays on the same sphere with its four agents, Nickel, Acid, Heat and Oxidiser:
   lab.js's organic pairs take the agent a school lab gives them, an alcohol becomes its acid with the Oxidiser, and an
   alcohol and hydrochloric acid do not react (too slow in a lab). The Reactor is the default. */
let CHAPTER = 'reactor';
function setChapter(c) { CHAPTER = c === 'carbon' ? 'carbon' : 'reactor'; pairCache.clear(); }

/* ---------- THE MOLECULES ----------
   lab.js's, and the few the agent reactions add. Drawn as lab.js draws: atoms
   at 2D positions in bond lengths (y down), bonds '-' single, '=' double,
   '#' triple. */
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
const SPECIES = Object.assign({}, LAB.SPECIES);
[
  sp('nitrogen', 'nitrogen', 'N₂', [['N', -0.5, 0], ['N', 0.5, 0]], '0#1', ['gas']),
  sp('carbon-monoxide', 'carbon monoxide', 'CO', [['C', -0.5, 0], ['O', 0.5, 0]], '0#1', ['gas']),
  sp('nitrogen-monoxide', 'nitrogen monoxide', 'NO', [['N', -0.5, 0], ['O', 0.5, 0]], '0=1', ['gas']),
  sp('sulphur-dioxide', 'sulphur dioxide', 'SO₂', [['S', 0, -0.25], ['O', -0.87, 0.25], ['O', 0.87, 0.25]], '0=1 0=2', ['gas']),
  sp('sulphur-trioxide', 'sulphur trioxide', 'SO₃', [['S', 0, 0], ['O', 0, -1], ['O', -0.87, 0.5], ['O', 0.87, 0.5]], '0=1 0=2 0=3', []),
  sp('hydrogen-peroxide', 'hydrogen peroxide', 'H₂O₂', [['O', -0.5, 0], ['O', 0.5, 0], ['H', -0.95, 0.62], ['H', 0.95, -0.62]], '0-1 0-2 1-3', []),
  sp('iron-oxide', 'iron(III) oxide', 'Fe₂O₃', [['O', -2, 0], ['Fe', -1, 0], ['O', 0, 0], ['Fe', 1, 0], ['O', 2, 0]], '1=0 1-2 2-3 3=4', ['oxide']),
  sp('iron', 'iron', 'Fe', [['Fe', 0, 0]], '', ['metal']),
  sp('silver', 'silver', 'Ag', [['Ag', 0, 0]], '', ['metal']),
  sp('silver-chloride', 'silver chloride', 'AgCl', [['Ag', -0.5, 0], ['Cl', 0.5, 0]], '0-1', ['salt', 'insoluble']),
  sp('silver-bromide', 'silver bromide', 'AgBr', [['Ag', -0.5, 0], ['Br', 0.5, 0]], '0-1', ['salt', 'insoluble']),
  sp('silver-nitrate', 'silver nitrate', 'AgNO₃', [['N', 0, 0], ['O', -1, 0], ['O', 0.5, -0.87], ['O', 0.5, 0.87], ['Ag', -2, 0]], '0-1 0=2 0-3 1-4', ['salt']),
  sp('nitrogen-dioxide', 'nitrogen dioxide', 'NO₂', [['N', 0, -0.25], ['O', -0.87, 0.25], ['O', 0.87, 0.25]], '0=1 0-2', ['gas']),
  sp('sulphurous-acid', 'sulphurous acid', 'H₂SO₃', [['S', 0, 0], ['O', 0, -1], ['O', -1, 0], ['O', 1, 0], ['H', -1.7, 0.55], ['H', 1.7, 0.55]], '0=1 0-2 0-3 2-4 3-5', ['acid']),
  sp('sodium-chlorate-i', 'sodium chlorate(I)', 'NaClO', [['Na', -1, 0], ['O', 0, 0], ['Cl', 1, 0]], '0-1 1-2', ['salt']),
].forEach((s) => { SPECIES[s.key] = s; });

/* ---------- THE REACTIONS ----------
   Each: what goes in (a molecule and how many), what comes out (the
   interesting product first, water last), and the agent, or none. `also`:
   another agent that works in real life too, so the game takes it (Döbereiner's
   platinum lights hydrogen; a flame sets off hydrogen and chlorine). `row`: the
   research table's row. */
const R = [];
const ag = (id, ins, out, agent, also, row, extra) => R.push({ id, in: ins, out, agent, also: also || [], row, extra });
ag('haber', [['nitrogen', 1], ['hydrogen', 3]], ['ammonia', 'ammonia'], 'iron', [], 1);
ag('steam-reforming', [['methane', 1], ['water', 1]], ['carbon-monoxide', 'hydrogen', 'hydrogen', 'hydrogen'], 'nickel', [], 2);
ag('contact', [['sulphur-dioxide', 2], ['oxygen', 1]], ['sulphur-trioxide', 'sulphur-trioxide'], 'vanadium', ['platinum'], 3);
ag('peroxide', [['hydrogen-peroxide', 2]], ['oxygen', 'water', 'water'], 'manganese', ['platinum'], 4);
ag('converter', [['carbon-monoxide', 2], ['nitrogen-monoxide', 2]], ['nitrogen', 'carbon-dioxide', 'carbon-dioxide'], 'platinum', [], 6);
ag('limestone', [['calcium-carbonate', 1]], ['calcium-oxide', 'carbon-dioxide'], 'heat', [], 7);
ag('copper-carbonate', [['copper-carbonate', 1]], ['copper-oxide', 'carbon-dioxide'], 'heat', [], 8);
ag('zinc-carbonate', [['zinc-carbonate', 1]], ['zinc-oxide', 'carbon-dioxide'], 'heat', [], 9);
ag('magnesium-carbonate', [['magnesium-carbonate', 1]], ['magnesium-oxide', 'carbon-dioxide'], 'heat', [], 10);
ag('baking-soda', [['sodium-hydrogencarbonate', 2]], ['sodium-carbonate', 'carbon-dioxide', 'water'], 'heat', [], 11);
ag('sal-ammoniac', [['ammonium-chloride', 1]], ['ammonia', 'hydrochloric-acid'], 'heat', [], 12);
ag('copper-from-oxide', [['copper-oxide', 1], ['hydrogen', 1]], ['copper', 'water'], 'heat', [], 13);
ag('magnesium-and-copper-oxide', [['magnesium', 1], ['copper-oxide', 1]], ['copper', 'magnesium-oxide'], 'heat', [], 14);
ag('blast-furnace', [['iron-oxide', 1], ['carbon-monoxide', 3]], ['iron', 'iron', 'carbon-dioxide', 'carbon-dioxide', 'carbon-dioxide'], 'heat', [], 15);
ag('hydrogen-burns', [['hydrogen', 2], ['oxygen', 1]], ['water', 'water'], 'spark', ['platinum', 'heat'], 16);
ag('methane-burns', [['methane', 1], ['oxygen', 2]], ['carbon-dioxide', 'water', 'water'], 'spark', ['heat'], 17);
ag('lightning', [['nitrogen', 1], ['oxygen', 1]], ['nitrogen-monoxide', 'nitrogen-monoxide'], 'spark', ['heat'], 18);
ag('carbon-monoxide-burns', [['carbon-monoxide', 2], ['oxygen', 1]], ['carbon-dioxide', 'carbon-dioxide'], 'spark', ['heat', 'platinum'], 'link');
ag('hydrogen-bromide', [['hydrogen', 1], ['bromine', 1]], ['hydrobromic-acid', 'hydrobromic-acid'], 'spark', [], 19);
ag('hydrogen-chloride', [['hydrogen', 1], ['chlorine', 1]], ['hydrochloric-acid', 'hydrochloric-acid'], 'light', ['spark'], 20);
ag('silver-bromide-light', [['silver-bromide', 2]], ['silver', 'silver', 'bromine'], 'light', [], 21);
ag('silver-chloride-light', [['silver-chloride', 2]], ['silver', 'silver', 'chlorine'], 'light', [], 21);
ag('chlorination', [['methane', 1], ['chlorine', 1]], ['chloromethane', 'hydrochloric-acid'], 'light', [], 22);
ag('water-split', [['water', 2]], ['hydrogen', 'hydrogen', 'oxygen'], 'electricity', [], 23);
ag('brine', [['sodium-chloride', 2], ['water', 2]], ['sodium-hydroxide', 'sodium-hydroxide', 'chlorine', 'hydrogen'], 'electricity', [], 24);
ag('copper-chloride-split', [['copper-chloride', 1]], ['copper', 'chlorine'], 'electricity', [], 25);
// links the chains need that lab.js does not have: as they meet (research, "Links")
ag('limewater', [['calcium-hydroxide', 1], ['carbon-dioxide', 1]], ['calcium-carbonate', 'water'], null, [], 'link');
ag('sulphuric-acid-made', [['sulphur-trioxide', 1], ['water', 1]], ['sulphuric-acid'], null, [], 'link');
ag('silver-bromide-falls', [['silver-nitrate', 1], ['sodium-bromide', 1]], ['silver-bromide', 'sodium-nitrate'], null, [], 'link');
ag('silver-chloride-falls', [['silver-nitrate', 1], ['sodium-chloride', 1]], ['silver-chloride', 'sodium-nitrate'], null, [], 'link');
ag('nitrogen-dioxide', [['nitrogen-monoxide', 2], ['oxygen', 1]], ['nitrogen-dioxide', 'nitrogen-dioxide'], null, [], 'link');
/* Real meetings that would otherwise be missing where the level's molecules can meet, so a careless mix does what it
   really does (sources in LITMUS_REACTOR_AGENTS.md, "Links added for honesty"). */
ag('bleach', [['chlorine', 1], ['sodium-hydroxide', 2]], ['sodium-chlorate-i', 'sodium-chloride', 'water'], null, [], 'link');
ag('sulphurous-acid', [['sulphur-dioxide', 1], ['water', 1]], ['sulphurous-acid'], null, [], 'link');
ag('sulphur-trioxide-and-alkali', [['sulphur-trioxide', 1], ['sodium-hydroxide', 2]], ['sodium-sulphate', 'water'], null, [], 'link');
ag('carbon-dioxide-and-alkali', [['carbon-dioxide', 1], ['sodium-hydroxide', 1]], ['sodium-hydrogencarbonate'], null, [], 'link');
/* The Oxidiser (acidified potassium dichromate, warmed) turns an alcohol into its acid: the oxygen comes from the agent,
   written 2[O] (CH₃CH₂OH + 2[O] → CH₃COOH + H₂O), so the atoms balance with what the agent gives. */
[['methanol', 'methanoic-acid'], ['ethanol', 'ethanoic-acid'], ['propanol', 'propanoic-acid']].forEach(([alc, acid]) =>
  ag(alc + '-oxidised', [[alc, 1]], [acid, 'water'], 'oxidiser', [], 'carbon', { O: 2 }));
const RX = {}; R.forEach((r) => { RX[r.id] = r; });

/* lab.js's own pairs go as they meet, except the two kinds a school lab warms
   (research, "Warmed in a school lab"): a metal oxide with an acid, and an
   ammonium salt with a strong base. For those Heat is the honest agent. */
function warmed(a, b, r) {
  if (r.kind === 'oxide-and-acid' || r.kind === 'ammonia-off') return true;
  const t = (k) => SPECIES[k].tags;
  return (t(a).includes('ammonium') && t(b).includes('strong-base')) || (t(b).includes('ammonium') && t(a).includes('strong-base'));
}
/* The Carbon Chamber's agents for lab.js's organic pairs (LITMUS_CARBON_AGENTS.md): nickel for hydrogen onto a double
   bond; an acid catalyst for steam onto one, for making an ester and for splitting it with water; heat (under reflux,
   or warmed) for an alcohol with hydrobromic acid, a haloalkane or an ester with alkali. Bromine and the hydrogen halides
   add to an alkene as they meet. */
function organicAgent(a, b) {
  const kind = (k) => SPECIES[k].carbon && SPECIES[k].carbon.kind, t = (k, x) => SPECIES[k].tags.includes(x);
  const pair = (p, q) => (p(a) && q(b)) || (p(b) && q(a));
  const is = (key) => (k) => k === key, of = (kd) => (k) => kind(k) === kd, tag = (x) => (k) => t(k, x);
  if (pair(of('alkene'), is('hydrogen'))) return 'nickel';
  if (pair(of('alkene'), is('water'))) return 'acid';
  if (pair(of('alcohol'), tag('carboxylic-acid'))) return 'acid';
  if (pair(of('ester'), is('water'))) return 'acid';
  if (pair(of('ester'), tag('strong-base')) || pair(of('haloalkane'), tag('strong-base')) || pair(of('dihalo'), tag('strong-base'))) return 'heat';
  if (pair(of('alcohol'), tag('hydrogen-halide'))) return 'heat';
  return undefined;     // not organic: as the Reactor
}
const pairCache = new Map();
function pairReaction(a, b) {
  const k = a < b ? a + '+' + b : b + '+' + a;
  if (pairCache.has(k)) return pairCache.get(k);
  let out = null;
  if (LAB.SPECIES[a] && LAB.SPECIES[b]) {
    const r = LAB.reactionFor(a, b);
    const kind = (x) => SPECIES[x].carbon && SPECIES[x].carbon.kind;
    const alcoholWith = (x) => (kind(a) === 'alcohol' && b === x) || (kind(b) === 'alcohol' && a === x);
    // in the Carbon Chamber the Oxidiser does the oxidising, and hydrochloric acid is too slow with an alcohol
    const skip = CHAPTER === 'carbon' && (alcoholWith('oxygen') || alcoholWith('hydrochloric-acid'));
    if (r && !skip) {
      const org = CHAPTER === 'carbon' ? organicAgent(a, b) : undefined;
      const agent = org !== undefined ? org : (CHAPTER === 'carbon' && warmedCarbonFree(r) ? null : warmed(a, b, r) ? 'heat' : null);
      out = { id: 'lab:' + k, in: a === b ? [[a, 2]] : [[a, 1], [b, 1]], out: r.products.slice(), agent, also: [], row: 'lab', kind: r.kind };
    }
  }
  pairCache.set(k, out);
  return out;
}
// the carbon research found a carboxylic acid with quicklime, an alkali, a carbonate or ammonia needs no warming
function warmedCarbonFree(r) { return [r.a, r.b].some((k) => SPECIES[k].tags.includes('carboxylic-acid') || SPECIES[k].tags.includes('weak-acid-salt')); }

/* ---------- CHECKS ----------
   Every reaction must balance, atom for atom. */
function atomsOf(list) {
  const c = {};
  for (const [key, n] of list) for (const a of SPECIES[key].atoms) c[a.el] = (c[a.el] || 0) + n;
  return c;
}
function balanced(r) {
  const a = atomsOf(r.in), outs = {};
  for (const [el, n] of Object.entries(r.extra || {})) a[el] = (a[el] || 0) + n;     // what the agent itself gives
  for (const k of r.out) outs[k] = (outs[k] || 0) + 1;
  const b = atomsOf(Object.entries(outs));
  return Object.keys({ ...a, ...b }).every((el) => a[el] === b[el]);
}

/* ---------- WHAT REACTS ----------
   `contents`: the keys in the sphere, in the order they went in. With no
   agent, the first set of them that reacts as it meets; with an agent, the
   first set it sets off. Larger recipes are tried before smaller ones, so
   two hydrogen and an oxygen burn together rather than as a pair. */
function countsOf(keys) { const c = {}; for (const k of keys) c[k] = (c[k] || 0) + 1; return c; }
function fits(r, c) { return r.in.every(([k, n]) => (c[k] || 0) >= n); }
function works(r, agent) { return agent ? (r.agent === agent || r.also.includes(agent)) : !r.agent; }
function reactionIn(contents, agent) {
  const c = countsOf(contents);
  const many = R.filter((r) => works(r, agent) && fits(r, c)).sort((x, y) => size(y) - size(x));
  if (many.length) return many[0];
  for (let i = contents.length - 1; i >= 0; i--) for (let j = 0; j < contents.length; j++) {
    if (i === j) continue;
    const r = pairReaction(contents[i], contents[j]);
    if (r && works(r, agent) && fits(r, c)) return r;
  }
  return null;
}
const size = (r) => r.in.reduce((n, [, k]) => n + k, 0);

/* ---------- THE LEVEL IN PLAY ----------
   Every molecule is a piece in one place: the space round you, the sphere
   (four at most), waiting above it, in a goal, or gone. */
const SPHERE = 4, CHANCES = 2;
function createReactor(level) {
  const s = {
    pieces: [], targets: level.targets.map(([key, n]) => ({ key, n })), made: {},
    agents: level.agents.slice(), chances: CHANCES, tried: new Set(), version: 0, result: null, analysis: null,
  };
  for (const key of level.space) s.pieces.push({ id: s.pieces.length, key, zone: 'space' });
  refresh(s);
  return s;
}
const inZone = (s, zone) => s.pieces.filter((p) => p.zone === zone);
function refresh(s) {
  s.version += 1;
  s.analysis = analyse(s);
  s.result = s.analysis.won ? { kind: 'win' } : s.analysis.over ? { kind: 'fail', why: s.analysis.why } : null;
}
// what the sphere holds changed: an agent tried and wrong lights up again
function changed(s) { s.tried.clear(); }
function react(s, r, agent) {
  const ev = { reaction: r, agent, used: [], products: [], poured: [], collected: [] };
  const sphere = inZone(s, 'sphere');
  for (const [key, n] of r.in) {
    let k = n;
    for (const p of sphere) if (k > 0 && p.key === key && p.zone === 'sphere') { p.zone = 'gone'; ev.used.push(p.id); k--; }
  }
  ev.poured = inZone(s, 'waiting').map((p) => p.id);
  ev.poured.forEach((id) => { s.pieces[id].zone = 'gone'; });
  for (const key of r.out) {
    const p = { id: s.pieces.length, key, zone: 'waiting' };
    s.pieces.push(p); ev.products.push(p.id);
    const t = s.targets.find((q) => q.key === key);
    if (t && (s.made[key] || 0) < t.n) { p.zone = 'goal'; s.made[key] = (s.made[key] || 0) + 1; ev.collected.push(p.id); }
  }
  changed(s);
  return ev;
}
/* Into the sphere. What reacts as it meets goes at once. */
function toSphere(s, id) {
  const p = s.pieces[id];
  if (!p || s.result || (p.zone !== 'space' && p.zone !== 'waiting')) return { ok: false, why: 'cannot' };
  if (inZone(s, 'sphere').length >= SPHERE) return { ok: false, why: 'full' };
  p.zone = 'sphere'; changed(s);
  const r = reactionIn(inZone(s, 'sphere').map((q) => q.key), null);
  const ev = r ? react(s, r, null) : { reaction: null };
  refresh(s);
  return Object.assign({ ok: true, result: s.result }, ev);
}
// Out of the sphere, or down from waiting, into the space to keep.
function toSpace(s, id) {
  const p = s.pieces[id];
  if (!p || s.result || (p.zone !== 'sphere' && p.zone !== 'waiting')) return false;
  if (p.zone === 'sphere') changed(s);
  p.zone = 'space';
  refresh(s);
  return true;
}
/* An agent picked. It sets off what it can; if nothing, it bounces and spends
   a chance; with no chance left, the reaction is poured away and the level is
   lost (owner, 2026-10-03). */
function pickAgent(s, agent) {
  if (s.result || !s.agents.includes(agent)) return { ok: false, why: 'cannot' };
  const r = reactionIn(inZone(s, 'sphere').map((q) => q.key), agent);
  if (r) { const ev = react(s, r, agent); refresh(s); return Object.assign({ ok: true, result: s.result }, ev); }
  if (s.chances > 0) {
    s.chances -= 1; s.tried.add(agent);
    refresh(s);
    return { ok: true, bounce: true, chances: s.chances, result: s.result };
  }
  const poured = inZone(s, 'sphere').map((p) => p.id);
  poured.forEach((id) => { s.pieces[id].zone = 'gone'; });
  s.version += 1; s.analysis = analyse(s);
  s.result = { kind: 'fail', why: 'agent' };
  return { ok: true, bounce: true, poured, result: s.result };
}

/* ---------- WHAT CAN STILL BE MADE ----------
   A search over what is left, counting molecules by kind, with every reaction
   the level's agents allow: the most of the list that can still be made, if
   the player keeps every byproduct worth keeping. */
function levelReactions(keys, agents) {
  const have = closure(keys, agents), list = [];
  for (const r of R) if ((!r.agent || agents.includes(r.agent) || r.also.some((a) => agents.includes(a))) && r.in.every(([k]) => have.has(k))) list.push(r);
  const arr = [...have];
  for (let i = 0; i < arr.length; i++) for (let j = i; j < arr.length; j++) {
    const r = pairReaction(arr[i], arr[j]);
    if (r && (!r.agent || agents.includes(r.agent))) list.push(r);
  }
  return list;
}
function closure(keys, agents) {
  const have = new Set(keys);
  for (let grew = true; grew;) {
    grew = false;
    const arr = [...have];
    const add = (r) => { for (const k of r.out) if (!have.has(k)) { have.add(k); grew = true; } };
    for (const r of R) if ((!r.agent || agents.includes(r.agent) || r.also.some((a) => agents.includes(a))) && r.in.every(([k]) => have.has(k))) add(r);
    for (let i = 0; i < arr.length; i++) for (let j = i; j < arr.length; j++) {
      const r = pairReaction(arr[i], arr[j]);
      if (r && (!r.agent || agents.includes(r.agent))) add(r);
    }
  }
  return have;
}
function analyse(s) {
  let total = 0, made = 0;
  const owed = {};
  for (const t of s.targets) { const m = Math.min(t.n, s.made[t.key] || 0); total += t.n; made += m; if (t.n > m) owed[t.key] = t.n - m; }
  const counts = {};
  for (const p of s.pieces) if (p.zone === 'space' || p.zone === 'sphere' || p.zone === 'waiting') counts[p.key] = (counts[p.key] || 0) + 1;
  const left = total - made;
  const bp = left ? bestPlan(counts, owed, s.agents) : { best: 0 };
  // a search that ran out of room proves nothing: the level is lost only when the search finished and says so
  return { total, made, best: bp.best, won: left === 0, over: left > 0 && bp.best < left && !bp.exhausted, why: 'cannot' };
}
/* The search, also the level checker's: from these molecules, the most of what
   is owed that can be made, and one shortest way to make it all. */
function bestPlan(counts, owed, agents) {
  const tkeys = Object.keys(owed);
  /* Only what can lead to a goal counts: the goals, what a reaction making one of them takes, and so on back. A
     molecule that leads nowhere (a decoy) and a reaction that makes nothing wanted are left out of the search. */
  const all = levelReactions(Object.keys(counts), agents), rel = new Set(tkeys);
  for (let grew = true; grew;) { grew = false; for (const r of all) if (r.out.some((k) => rel.has(k))) for (const [k] of r.in) if (!rel.has(k)) { rel.add(k); grew = true; } }
  const rxs = all.filter((r) => r.out.some((k) => rel.has(k)));
  counts = Object.fromEntries(Object.entries(counts).filter(([k]) => rel.has(k)));
  const keys = [...new Set([...Object.keys(counts), ...rxs.flatMap((r) => [...r.in.map(([k]) => k), ...r.out]), ...tkeys])];
  const idx = new Map(keys.map((k, i) => [k, i]));
  const RR = rxs.map((r) => ({ r, in: r.in.map(([k, n]) => [idx.get(k), n]), out: r.out.map((k) => idx.get(k)) }));
  const tPos = new Map(tkeys.map((k, t) => [idx.get(k), t]));
  const start = keys.map((k) => counts[k] || 0), need = tkeys.map((k) => owed[k]);
  /* Breadth first. A goal counts only what a reaction makes (as in play: a
     product the list wants flies to its goal; one already floating does not
     count), so the first state owing nothing is a shortest plan. */
  const enc = (c, o) => c.join(',') + '|' + o.join(',');
  const c0 = start, o0 = need;
  const seen = new Map([[enc(c0, o0), null]]);
  const total = need.reduce((a, b) => a + b, 0);
  let frontier = [[c0, o0]], best = 0, plan = total ? null : [], budget = 60000;
  while (frontier.length && plan === null && budget > 0) {
    const next = [];
    for (const [c, o] of frontier) {
      for (const X of RR) {
        if (!X.in.every(([i, n]) => c[i] >= n)) continue;
        if (--budget <= 0) break;
        const sc = c.slice(), so = o.slice();
        for (const [i, n] of X.in) sc[i] -= n;
        for (const i of X.out) { const t = tPos.get(i); if (t != null && so[t] > 0) so[t]--; else sc[i] += 1; }
        const key = enc(sc, so);
        if (seen.has(key)) continue;
        seen.set(key, { from: enc(c, o), r: X.r });
        const got = total - so.reduce((a, b) => a + b, 0);
        if (got > best) best = got;
        if (got === total) { plan = trace(seen, key); break; }
        next.push([sc, so]);
      }
      if (plan) break;
    }
    frontier = next;
  }
  return { best, plan, exhausted: plan === null && budget <= 0 };
}
function trace(seen, key) {
  const steps = [];
  for (let k = key; seen.get(k); k = seen.get(k).from) steps.unshift(seen.get(k).r);
  return steps;
}

return { AGENTS, SPECIES, REACTIONS: R, RX, SPHERE, CHANCES, setChapter, chapter: () => CHAPTER, pairReaction, reactionIn, balanced, atomsOf,
  createReactor, toSphere, toSpace, pickAgent, analyse, bestPlan, closure, levelReactions };
}));
