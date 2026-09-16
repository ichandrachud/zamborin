/* Lessons in Chemistry · rule tests.   node chemistry/tests.mjs

   What this proves: the rules do what the game says. Two free hands that meet
   hold each other with every hand they both have; a finished target is
   collected and anything else finished is waste; a lost molecule is counted
   the moment it becomes true and play goes on; the level passes only when
   every molecule is made; and every level can be won from where it starts.
   What it does NOT prove: that any level is fun. Only playing it does that.
   Motion, dragging and drawing are play.js, tested in input-tests.mjs. */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const M = require('./model.js');
const L = require('./levels.js');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) pass++;
  else { fail++; console.log('FAIL  ' + name); }
}
function eq(a, b, name) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  ok(A === B, name + (A === B ? '' : '\n      got      ' + A + '\n      expected ' + B));
}
const idOf = (s, el, k) => s.atoms.filter((a) => a.el === el && a.status === 'live')[k || 0].id;

/* ---------- the molecule table ---------- */
for (const m of Object.values(M.MOLECULES)) {
  ok(m.els.every((el) => !!M.ELEMENTS[el]), 'known elements: ' + m.key);
  ok(m.els.every((el, i) => m.adj[i].reduce((n, [, o]) => n + o, 0) === M.ELEMENTS[el].hands), 'valences balance: ' + m.key);
  const bonds = m.adj.reduce((n, l) => n + l.length, 0) / 2;
  eq(bonds, m.els.length - 1, 'a tree, no rings: ' + m.key);
  const lay = M.layoutMolecule(m.key);
  ok(!!lay && new Set(lay.atoms.map((a) => a.x + ',' + a.y)).size === lay.atoms.length, 'lays out as a diagram: ' + m.key);
}
const keys = Object.keys(M.MOLECULES);
for (const a of keys) for (const b of keys) {
  ok(M.isomorphic(M.MOLECULES[a], M.MOLECULES[b]) === (a === b), 'isomorphic only to itself: ' + a + ' vs ' + b);
}
eq(M.MOLECULES['iron-chloride'].els, ['Fe', 'Cl', 'Cl', 'Cl'], 'two-letter symbols parse');

/* ---------- matching, including pieces still apart ---------- */
{
  const OH = { els: ['O', 'H'], adj: [[[1, 1]], [[0, 1]]], count: { O: 1, H: 1 } };
  const OO2 = { els: ['O', 'O'], adj: [[[1, 2]], [[0, 2]]], count: { O: 2 } };
  ok(M.embeds(OH, M.MOLECULES.water), 'O-H sits inside water');
  ok(!M.embeds(OO2, M.MOLECULES['hydrogen-peroxide']), 'O=O does not sit inside peroxide: a bond never changes');
  const twoApart = { els: ['Fe', 'Cl'], adj: [[], []], count: { Fe: 1, Cl: 1 }, part: [0, 1] };
  const twoTogetherUnbonded = { els: ['Fe', 'Cl'], adj: [[], []], count: { Fe: 1, Cl: 1 } };
  ok(M.embeds(twoApart, M.MOLECULES['iron-chloride']), 'an iron and a chlorine still apart can become iron chloride');
  ok(!M.embeds(twoTogetherUnbonded, M.MOLECULES['iron-chloride']), 'but as one piece with no bond they cannot');
}

/* ---------- a bond ---------- */
{
  const s = M.createState({ targets: [['water', 1]], avail: { H: 2 }, dish: ['O', 'O'] });
  const ev = M.bond(s, 0, 1);
  eq([ev.order, ev.done.kind], [2, 'waste'], 'two bare oxygens hold each other with both hands: oxygen gas, waste');
  eq(s.atoms.map((a) => a.status), ['waste', 'waste'], 'waste stays in the dish');
  eq(s.result, { kind: 'fail', made: 0, total: 1, lost: 1 }, 'with no oxygen left, the water is lost and the level fails');
  ok(M.bond(s, 0, 1) === null, 'finished atoms grab nothing');
}
{
  const s = M.createState({ targets: [['ethane', 1]], avail: { H: 6 }, dish: ['C', 'C'] });
  eq(M.bond(s, 0, 1).order, 3, 'two bare carbons grab each other three times');
}
{
  const s = M.createState({ targets: [['water', 1]], avail: { H: 2 }, dish: ['O'] });
  const h1 = M.take(s, 'H'), h2 = M.take(s, 'H');
  M.bond(s, 0, h1);
  ok(M.bond(s, h1, 0) === null && !M.canBond(s, 0, h1), 'two atoms already in one molecule never grab again');
  const ev = M.bond(s, h2, 0);
  eq([ev.done.kind, ev.done.key, s.result], ['required', 'water', { kind: 'win' }], 'finished and on the list: collected, and the level is won');
  eq(s.atoms.map((a) => a.status), ['gone', 'gone', 'gone'], 'a collected molecule leaves the dish');
}

/* ---------- the panel ---------- */
{
  const s = M.createState({ targets: [['salt', 1]], avail: { Cl: 1 }, dish: ['Na'] });
  const cl = M.take(s, 'Cl');
  eq([s.avail.Cl, s.analysis.lost], [0, 0], 'taking from the panel spends nothing yet');
  ok(M.take(s, 'Cl') === -1, 'an empty slot gives nothing');
  ok(M.putBack(s, cl) && s.avail.Cl === 1, 'a panel atom that touched nothing goes back');
  const cl2 = M.take(s, 'Cl');
  ok(M.commit(s, cl2) && !M.putBack(s, cl2), 'let go in the dish, it is the dish\'s');
  eq(s.analysis.lost, 0, 'and still counts toward the salt');
}

/* ---------- THE OWNER'S EXAMPLE ---------- */
{
  const s = M.createState({ targets: [['iron-chloride', 1]], avail: { Cl: 3 }, dish: ['Fe', 'H'] });
  eq(s.analysis.palm, { 0: 'green', 1: 'amber' }, 'the iron is wanted, the hydrogen is only trouble');
  const cl = M.take(s, 'Cl');
  const bad = M.preview(s, cl, 1), good = M.preview(s, cl, 0);
  eq([bad.done.kind, bad.lost], ['waste', true], 'a chlorine meeting the hydrogen would make HCl and lose the iron chloride');
  eq([good.done, good.lost], [null, false], 'meeting the iron would lose nothing');
  eq(s.analysis.lost, 0, 'a preview changes nothing');
  M.bond(s, cl, 1);
  eq([s.wasted, s.analysis.lost, s.result && s.result.kind], [1, 1, 'fail'], 'and when it happens, it does');
}

/* ---------- a lost molecule does not end the level; the end does ---------- */
{
  const s = M.createState({ targets: [['salt', 2]], avail: { Cl: 2 }, dish: ['Na', 'H', 'Na'] });
  M.bond(s, M.take(s, 'Cl'), idOf(s, 'H'));
  eq([s.analysis.lost, s.result], [1, null], 'one salt lost, but the other can still be made, so play goes on');
  M.bond(s, M.take(s, 'Cl'), idOf(s, 'Na'));
  eq(s.made.salt, 1, 'the second salt is made');
  eq(s.result, { kind: 'fail', made: 1, total: 2, lost: 1 }, 'every molecule must be made: 1 of 2 fails');
}

/* ---------- pieces in the dish can join each other ---------- */
{
  const s = M.createState({ targets: [['water', 1]], avail: {}, dish: ['H', 'O', 'H'] });
  eq([s.analysis.lost, s.analysis.best], [0, 1], 'three radicals in the dish, nothing in the panel: water is still makeable');
  M.bond(s, 0, 1);
  eq(s.analysis.palm, { 1: 'green', 2: 'green' }, 'O-H and the last hydrogen are both still wanted');
  const ev = M.bond(s, 2, 1);
  eq([ev.done.key, s.result], ['water', { kind: 'win' }], 'dragged together, they make it');
}
{
  const s = M.createState({ targets: [['iron-chloride', 3]], avail: { Cl: 3 }, dish: ['Fe', 'Fe', 'Fe'] });
  eq([s.analysis.best, s.analysis.lost], [1, 2], 'three irons and three chlorines: only one iron chloride can be made');
}
{
  // a piece nothing wants makes its palms amber
  const s = M.createState({ targets: [['magnesium-oxide', 1]], avail: { Cl: 1 }, dish: ['Mg', 'O'] });
  M.bond(s, M.take(s, 'Cl'), 0);
  eq([s.analysis.palm[0], s.analysis.lost, s.result && s.result.kind], ['amber', 1, 'fail'], 'Mg-Cl can never be magnesium oxide');
}

/* ---------- every level: starts clean, and can be won ----------
   A player's moves that never cost a molecule, depth first: a panel atom onto
   a dish atom, one dish atom onto another, or a panel atom set down alone.
   Only atoms of the list's elements are touched. Where the order of building
   matters, a fixed order would fail; this finds one that works. */
function solve(level, limit = 20000) {
  const want = new Set(level.targets.flatMap(([k]) => M.MOLECULES[k].els));
  let nodes = 0;
  function go(s) {
    if (s.result) return s.result.kind === 'win' ? [] : null;
    if (++nodes > limit) return null;
    const live = s.atoms.filter((a) => a.status === 'live' && a.committed && a.free > 0 && want.has(a.el));
    const moves = [];
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) moves.push(['dish', live[i].id, live[j].id]);
    for (const el of Object.keys(s.avail)) if (s.avail[el] > 0) for (const b of live) moves.push(['panel', el, b.id]);
    for (const el of Object.keys(s.avail)) if (s.avail[el] > 0) moves.push(['drop', el]);
    for (const mv of moves) {
      const t = M.clone(s);
      let lost;
      if (mv[0] === 'dish') { const ev = M.bond(t, mv[1], mv[2]); if (!ev) continue; lost = ev.lost; }
      else if (mv[0] === 'panel') { const ev = M.bond(t, M.take(t, mv[1]), mv[2]); if (!ev) continue; lost = ev.lost; }
      else { M.commit(t, M.take(t, mv[1])); lost = t.analysis.lost > s.analysis.lost; }
      if (lost) continue;
      const rest = go(t);
      if (rest) return [mv].concat(rest);
    }
    return null;
  }
  const s0 = M.createState(level);
  return go(s0) ? { won: true, nodes } : { won: false, nodes };
}
for (const set of ['mobile', 'desktop']) {
  eq(L[set].length, 100, set + ': a hundred levels');
  L[set].forEach((lv, i) => {
    const name = set + ' level ' + (i + 1);
    const s = M.createState(lv);
    eq([s.analysis.lost, s.result], [0, null], name + ': nothing lost before the first move');
    ok(lv.dish.length >= 1 && Object.keys(lv.avail).length >= 1, name + ': something in the dish and something in the panel');
    ok(typeof lv.note === 'string' && lv.note.length > 0, name + ': a line for the win card');
    const uses = new Set(lv.targets.flatMap(([k]) => M.MOLECULES[k].els));
    const panelAtoms = Object.values(lv.avail).reduce((n, v) => n + v, 0);
    const listAtoms = lv.targets.reduce((n, [k, c]) => n + M.MOLECULES[k].els.length * c, 0);
    eq(panelAtoms + lv.needs.length, listAtoms, name + ': the panel and the dish hold exactly the atoms the list takes');
    ok(lv.hazards.concat(L.crowdOf(lv)).every((el) => !uses.has(el)), name + ': no hazard or crowd radical is of an element the list uses');
    const r = solve(lv);
    ok(r.won, name + ': can be won without losing a molecule (' + r.nodes + ' positions searched)');
  });
}
/* ---------- the order lessons: the bare meeting the note warns about really loses ---------- */
{
  // [level, first element, second element, loses?]: both atoms taken from the dish as the level starts
  const lessons = [[9, 'O', 'O', true], [14, 'O', 'O', true], [15, 'Ca', 'O', true], [20, 'N', 'N', true], [21, 'N', 'N', true],
                   [29, 'C', 'O', true], [30, 'C', 'C', false], [31, 'C', 'C', true], [32, 'C', 'C', true], [33, 'C', 'O', true],
                   [34, 'C', 'C', true], [36, 'N', 'C', true]];
  for (const set of ['mobile', 'desktop']) {
    for (const [n, a, b, loses] of lessons) {
      const s = M.createState(L[set][n - 1]);
      const A = s.atoms.find((q) => q.el === a), B = s.atoms.find((q) => q.el === b && q.id !== A.id);
      const ev = M.bond(s, A.id, B.id);
      eq(!!(ev && ev.lost), loses, set + ' level ' + n + ': bare ' + a + ' meeting bare ' + b + (loses ? ' loses a molecule' : ' is the right move'));
    }
    // and where the lesson is a hydrogen in the wrong place
    const hno2 = M.createState(L[set][22]);
    const N = hno2.atoms.find((q) => q.el === 'N');
    eq(M.bond(hno2, M.take(hno2, 'H'), N.id).lost, true, set + ' level 23: a hydrogen on the nitrogen of nitrous acid loses it');
  }
}
/* ---------- the crowd: many radicals, and the one you need is the only one of its kind ---------- */
const count = (list, el) => list.filter((x) => x === el).length;
for (const set of ['mobile', 'desktop']) {
  L[set].forEach((lv, i) => {
    const name = set + ' level ' + (i + 1);
    eq(lv.dish.length, lv.needs.length + lv.hazards.length + lv.crowd[0], name + ': the dish is needs, hazards and the crowd');
    ok(L.crowdOf(lv).every((el) => !lv.needs.includes(el)), name + ': the crowd never holds a needed element');
    ok([...new Set(lv.needs)].every((el) => count(lv.dish, el) === count(lv.needs, el)), name + ': every needed radical is the only one of its kind');
    eq(L.withoutCrowd(lv).dish, lv.needs.concat(lv.hazards), name + ': ?crowd=0 leaves needs and hazards');
    for (const n of [0, Math.floor(lv.crowd[0] / 2), lv.crowd[0]]) {
      const thin = L.withCrowd(lv, n), st = M.createState(thin);
      eq([thin.dish.length, st.analysis.lost], [lv.needs.length + lv.hazards.length + n, 0], name + ': thinned to ' + n + ', still nothing lost');
    }
  });
}
ok(L.mobile.slice(2).every((lv) => lv.dish.length >= 9), 'from level 3 a phone dish holds at least 9 radicals');
ok(L.desktop.slice(2).every((lv) => lv.dish.length >= 13), 'from level 3 a desktop dish holds at least 13 radicals');

ok(L.mobile.slice(1).every((lv, i) => JSON.stringify([lv.dish, lv.avail, lv.targets]) !== JSON.stringify([L.desktop[i + 1].dish, L.desktop[i + 1].avail, L.desktop[i + 1].targets])),
   'phone and desktop levels 2 to 100 are different levels');
ok(L.mobile.every((lv, i) => i < 2 || lv.dish.length >= 9 + Math.floor((i * 4) / 49) - 1), 'the phone dish fills up along the ladder');
ok(L.mobile.slice(90).every((lv) => lv.dish.length >= 14) && L.desktop.slice(90).every((lv) => lv.dish.length >= 19), 'the last ten levels are the most crowded');
ok(L.desktop.slice(2).every((lv) => lv.dish.some((el) => {
  const s = M.createState(lv);
  return s.atoms.some((a) => a.el === el && s.analysis.palm[a.id] === 'amber');
})), 'from level 3 every desktop dish has a radical that is only trouble');

/* ================= CHAPTER 2: REACTIONS ================= */
const X = require('./lab.js');
const atomsOf = (key) => X.SPECIES[key].atoms.reduce((c, a) => { c[a.el] = (c[a.el] || 0) + 1; return c; }, {});
const addUp = (list) => list.reduce((c, key) => { for (const [el, n] of Object.entries(atomsOf(key))) c[el] = (c[el] || 0) + n; return c; }, {});
const sameAtoms = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
for (const r of X.REACTIONS) {
  ok(!!X.SPECIES[r.a] && !!X.SPECIES[r.b] && r.products.every((k) => !!X.SPECIES[k]), 'known molecules: ' + r.a + ' + ' + r.b);
  ok(sameAtoms(addUp([r.a, r.b]), addUp(r.products)), 'balances, atom for atom: ' + r.a + ' + ' + r.b + ' -> ' + r.products.join(' + '));
  ok(X.reactionFor(r.b, r.a) === r, 'order in the tube does not matter: ' + r.a + ' + ' + r.b);
}
ok(new Set(X.REACTIONS.map((r) => [r.a, r.b].sort().join('+'))).size === X.REACTIONS.length, 'one reaction per pair');
for (const sp of Object.values(X.SPECIES)) {
  ok(sp.bonds.every((b) => b.a < sp.atoms.length && b.b < sp.atoms.length), 'drawing bonds point at real atoms: ' + sp.key);
}
{
  const s = X.createLab({ targets: [['calcium-chloride', 1]], dish: ['hydrochloric-acid', 'hydrochloric-acid', 'calcium-hydroxide', 'water'] });
  const [h1, h2, ca, w] = [0, 1, 2, 3];
  eq(X.toTube(s, w).reaction, null, 'one molecule in the tube: nothing happens');
  const nr = X.toTube(s, h1);
  eq([nr.ok, !!nr.noReaction, nr.reaction], [true, true, null], 'water and hydrochloric acid: no reaction, both stay');
  eq(X.toTube(s, h2).why, 'full', 'the tube holds two');
  X.toDish(s, w); X.toDish(s, h1);
  X.toTube(s, h1);
  const ev = X.toTube(s, ca);
  eq(ev.reaction.products, ['calcium-hydroxychloride', 'water'], 'one hydrochloric acid turns calcium hydroxide into the basic salt');
  eq(s.pieces.filter((p) => p.zone === 'tray').map((p) => p.key), ['calcium-hydroxychloride', 'water'], 'the products wait on the tray');
  eq(X.deliver(s, ev.products[1]).why, 'not-on-list', 'the beaker refuses water, which is not on the list');
  X.toTube(s, ev.products[0]);
  const ev2 = X.toTube(s, h2);
  eq(ev2.reaction.products, ['calcium-chloride', 'water'], 'a second hydrochloric acid finishes it');
  eq(ev2.poured.length, 1, 'the water left on the tray is poured away at the next reaction');
  eq(X.deliver(s, ev2.products[0]).ok, true, 'calcium chloride goes into the beaker');
  eq(s.result, { kind: 'win' }, 'and the level is won');
}
{
  // a wrong pair uses up what the list needed
  const s = X.createLab({ targets: [['calcium-hydroxide', 1], ['sodium-chloride', 1]], dish: ['calcium-oxide', 'hydrochloric-acid', 'sodium-hydroxide'] });
  eq([s.analysis.best, s.analysis.lost], [2, 0], 'quicklime, hydrochloric acid and sodium hydroxide can make both');
  X.toTube(s, 0);
  const ev = X.toTube(s, 1);
  eq([ev.lost, s.analysis.lost, s.result && s.result.kind], [true, 2, 'fail'], 'quicklime with the acid: no water and no salt can ever come, both lost');
}
{
  // a byproduct poured away is lost once it is gone, not before
  // (nitric acid and ammonia make ammonium nitrate and no water of their own)
  const s = X.createLab({ targets: [['calcium-hydroxide', 1], ['sodium-chloride', 1]], dish: ['hydrochloric-acid', 'sodium-hydroxide', 'calcium-oxide', 'nitric-acid', 'ammonia'] });
  X.toTube(s, 0); const ev = X.toTube(s, 1);
  X.deliver(s, ev.products[0]);
  eq(s.analysis.lost, 0, 'the water still on the tray still counts');
  X.toTube(s, 3); const pour = X.toTube(s, 4);
  eq([pour.poured.length, s.analysis.lost], [1, 1], 'react something else and the water is poured away: slaked lime lost');
}
ok(X.REACTIONS.every((r) => X.shouldReact(r.a, r.b)), 'every reaction in the table is a kind the honesty check knows');
for (const r of X.REACTIONS) {
  const e = X.explain(r.a, r.b);
  ok(e && e.title && e.words && e.words.length < 130, 'the reaction card can explain ' + r.a + ' + ' + r.b + (e ? ': ' + e.title : ''));
}
{
  // an ester and water give back the alcohol and the acid, so the search can go round in a circle
  const s = X.createLab({ targets: [['ethyl-ethanoate', 2]], dish: ['ethanol', 'ethanoic-acid', 'water'] });
  eq([s.analysis.best, s.analysis.lost], [1, 1], 'a reaction that undoes another: the search still ends, one ester from one alcohol');
  const back = X.createLab({ targets: [['ethanol', 1]], dish: ['ethyl-ethanoate', 'water'] });
  eq(back.analysis.best, 1, 'and it counts the way back: water splits the ester into ethanol');
  X.toTube(back, 0);
  eq(X.toTube(back, 1).reaction.products, ['ethanol', 'ethanoic-acid'], 'ethyl ethanoate and water in the tube give ethanol and ethanoic acid');
}

/* The engine works the equations out from the ions, so a test that asks the
   engine what it thinks could not fail. These are written out of a school
   chemistry book instead: pairs that must react, pairs that must be left
   alone, and what a few of them must make. */
const MUST = [
  ['hydrochloric-acid', 'sodium-hydroxide', ['sodium-chloride', 'water']],
  ['nitric-acid', 'potassium-hydroxide', ['potassium-nitrate', 'water']],
  ['sulphuric-acid', 'calcium-carbonate', ['calcium-sulphate', 'water', 'carbon-dioxide']],
  ['hydrochloric-acid', 'sodium-hydrogencarbonate', ['sodium-chloride', 'water', 'carbon-dioxide']],
  ['hydrochloric-acid', 'sodium-carbonate', ['sodium-chloride', 'sodium-hydrogencarbonate']],
  ['sulphuric-acid', 'copper-oxide', ['copper-sulphate', 'water']],
  ['sulphuric-acid', 'magnesium', ['magnesium-sulphate', 'hydrogen']],
  ['sulphuric-acid', 'zinc', ['zinc-sulphate', 'hydrogen']],
  ['zinc', 'copper-sulphate', ['zinc-sulphate', 'copper']],
  ['magnesium', 'zinc-chloride', ['magnesium-chloride', 'zinc']],
  ['sodium-carbonate', 'calcium-chloride', ['calcium-carbonate', 'sodium-chloride', 'sodium-chloride']],
  ['potassium-carbonate', 'magnesium-bromide', ['magnesium-carbonate', 'potassium-bromide', 'potassium-bromide']],
  ['calcium-oxide', 'water', ['calcium-hydroxide']],
  ['ammonium-chloride', 'sodium-hydroxide', ['sodium-chloride', 'water', 'ammonia']],
  ['ammonia', 'nitric-acid', ['ammonium-nitrate']],
  ['sodium-hydroxide', 'sodium-hydrogencarbonate', ['sodium-carbonate', 'water']],
  ['sodium-hydroxide', 'zinc-chloride', null],
  ['sodium-sulphate', 'calcium-chloride', null],
  ['magnesium-oxide', 'hydrochloric-acid', null],
];
const NEVER = [
  ['copper', 'sulphuric-acid', 'copper sits below hydrogen, so no acid pushes it out'],
  ['copper', 'zinc-sulphate', 'copper cannot push zinc out, only the other way round'],
  ['zinc', 'magnesium-chloride', 'zinc cannot push magnesium out'],
  ['sodium-chloride', 'potassium-nitrate', 'nothing made is a solid or a gas'],
  ['sodium-chloride', 'water', 'salt water is still salt and water'],
  ['sodium-hydroxide', 'water', 'an alkali in water stays an alkali'],
  ['zinc-oxide', 'water', 'only quicklime slakes'],
  ['copper-oxide', 'water', 'only quicklime slakes'],
  ['ammonium-chloride', 'sodium-hydrogencarbonate', 'ammonium is not acid enough to shift hydrogencarbonate'],
  ['sodium-carbonate', 'sodium-hydrogencarbonate', 'they are two steps of the same thing'],
  ['sodium-sulphate', 'sodium-chloride', 'two salts that both dissolve, and no swap to make'],
  ['calcium-chloride', 'magnesium-bromide', 'every pairing dissolves'],
  ['ammonia', 'ammonium-chloride', 'ammonia cannot take a hydrogen from ammonium'],
  ['magnesium', 'water', 'cold water does not touch it'],
];
for (const [a, b, products] of MUST) {
  const r = X.reactionFor(a, b);
  ok(!!r, 'a school book says these react: ' + a + ' + ' + b);
  ok(X.shouldReact(a, b), 'and the honesty check agrees: ' + a + ' + ' + b);
  if (r && products) eq(r.products.slice().sort(), products.slice().sort(), a + ' + ' + b + ' makes what it should');
}
for (const [a, b, why] of NEVER) {
  ok(!X.reactionFor(a, b), 'nothing happens: ' + a + ' + ' + b + ' — ' + why);
  ok(!X.shouldReact(a, b), 'and the honesty check does not claim it: ' + a + ' + ' + b);
}
/* Every formula must read back as the molecule that is drawn: Ca(OH)₂ is one
   calcium, two oxygens, two hydrogens, and so is the picture. */
{
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  // Read a written formula into its atoms: element letters, bracketed groups, subscripts.
  const readFormula = (f) => {
    let i = 0;
    const number = () => { let n = ''; while (i < f.length && SUB.includes(f[i])) n += SUB.indexOf(f[i++]); return n ? +n : 1; };
    const run = (stop) => {
      const count = {};
      while (i < f.length && f[i] !== stop) {
        let part;
        if (f[i] === '(') { i++; part = run(')'); i++; } else {
          let el = f[i++];
          while (i < f.length && f[i] >= 'a' && f[i] <= 'z') el += f[i++];
          part = { [el]: 1 };
        }
        const k = number();
        for (const [el, n] of Object.entries(part)) count[el] = (count[el] || 0) + n * k;
      }
      return count;
    };
    return run(null);
  };
  const tally = (c) => Object.entries(c).sort().map(([el, n]) => el + n).join(' ');
  let checked = 0;
  for (const s of Object.values(X.SPECIES)) {
    const drawn = s.atoms.reduce((c, a) => { c[a.el] = (c[a.el] || 0) + 1; return c; }, {});
    eq(tally(readFormula(s.formula)), tally(drawn), 'the formula matches the picture: ' + s.key + ' ' + s.formula);
    checked++;
  }
  ok(checked > 100, 'every molecule on the bench had its formula read back (' + checked + ')');
}

for (const [chapter, sets, count] of [['reactions', L.lab, 60], ['organic', L.organic, 40]]) for (const set of ['mobile', 'desktop']) {
  eq(sets[set].length, count, chapter + ', ' + set + ': ' + count + ' levels');
  sets[set].forEach((lv, i) => {
    const name = chapter + ', ' + set + ' level ' + (i + 1);
    const s = X.createLab(lv);
    eq([s.analysis.lost, s.result], [0, null], name + ': nothing lost before the first move');
    const cl = [...X.closure(lv.dish)];
    const missing = [];
    for (let a = 0; a < cl.length; a++) for (let b = a; b < cl.length; b++) {
      if (X.shouldReact(cl[a], cl[b]) && !X.reactionFor(cl[a], cl[b])) missing.push(cl[a] + ' + ' + cl[b]);
    }
    ok(!missing.length, name + ': every pair that would react in real life has its reaction ' + JSON.stringify(missing));
    ok(lv.targets.every(([k]) => !lv.dish.includes(k)), name + ': nothing on the list is already in the dish');
    const log = [];
    for (const [where, key] of lv.solution) {
      const piece = s.pieces.find((p) => p.key === key && p.zone === 'tray') || s.pieces.find((p) => p.key === key && p.zone === 'dish');
      if (!piece) { log.push('no ' + key); break; }
      const ev = where === 'tube' ? X.toTube(s, piece.id) : where === 'beaker' ? X.deliver(s, piece.id) : { ok: X.toDish(s, piece.id) };
      if (!ev.ok) { log.push(where + ' refused ' + key); break; }
      if (ev.lost) log.push('lost at ' + key);
    }
    ok(!log.length, name + ': the solution plays through ' + JSON.stringify(log));
    eq(s.result, { kind: 'win' }, name + ': and wins');
    if (chapter !== 'organic') return;
    // a wrong pair that costs a molecule: without one there is nothing to get wrong
    const traps = [];
    for (let a = 0; a < lv.dish.length; a++) for (let b = a + 1; b < lv.dish.length; b++) {
      const t = X.createLab(lv);
      X.toTube(t, a);
      if (X.toTube(t, b).lost) traps.push(lv.dish[a] + ' + ' + lv.dish[b]);
    }
    ok(traps.length > 0, name + ': the dish has a wrong pair that loses the molecule');
  });
}
ok(L.lab.mobile.every((lv, i) => lv.dish.length < L.lab.desktop[i].dish.length), 'every desktop reaction level carries more decoys than its phone twin');
ok(L.organic.mobile.every((lv, i) => lv.dish.length < L.organic.desktop[i].dish.length), 'every desktop organic level carries more decoys than its phone twin');

console.log((fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
