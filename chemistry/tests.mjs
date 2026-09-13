/* Lessons in Chemistry · model and level tests.   node chemistry/tests.mjs

   What this proves: the rules do what the brief says, the ghost's preview is
   the placement, and every M1 level can be finished with zero waste on its
   own dish. What it does NOT prove: that any level is interesting. That is
   the gate, and the gate is M2. */
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
const sameCounts = (a, b) => M.ORDER.every((el) => (a[el] || 0) === (b[el] || 0));
const at = (s, c, r) => M.cellOf(s, c, r);

/* ---------- the molecule table ---------- */
for (const m of Object.values(M.MOLECULES)) {
  ok(m.els.every((el, i) => m.adj[i].reduce((n, [, o]) => n + o, 0) === M.ELEMENTS[el].hands),
     'valences balance: ' + m.key);
  const lay = M.layoutMolecule(m.key);
  ok(!!lay, 'lays out without a collision: ' + m.key);
  if (lay) {
    ok(new Set(lay.atoms.map((a) => a.x + ',' + a.y)).size === lay.atoms.length, 'one atom per grid point: ' + m.key);
    ok(lay.bonds.every((b) => Math.abs(lay.atoms[b.a].x - lay.atoms[b.b].x) + Math.abs(lay.atoms[b.a].y - lay.atoms[b.b].y) === 1),
       'bonded atoms are neighbours: ' + m.key);
  }
}
const keys = Object.keys(M.MOLECULES);
for (const a of keys) for (const b of keys) {
  ok(M.isomorphic(M.MOLECULES[a], M.MOLECULES[b]) === (a === b), 'isomorphic only to itself: ' + a + ' vs ' + b);
}

/* ---------- matching ---------- */
const waterShuffled = { els: ['H', 'O', 'H'], adj: [[[1, 1]], [[0, 1], [2, 1]], [[1, 1]]], count: { H: 2, O: 1 } };
ok(M.isomorphic(waterShuffled, M.MOLECULES.water), 'water matches whatever order its atoms are listed in');
const OH = { els: ['O', 'H'], adj: [[[1, 1]], [[0, 1]]], count: { O: 1, H: 1 } };
const OO1 = { els: ['O', 'O'], adj: [[[1, 1]], [[0, 1]]], count: { O: 2 } };
const OO2 = { els: ['O', 'O'], adj: [[[1, 2]], [[0, 2]]], count: { O: 2 } };
ok(M.embeds(OH, M.MOLECULES.water), 'O-H sits inside water');
ok(M.embeds(OO1, M.MOLECULES['hydrogen-peroxide']), 'O-O single sits inside peroxide');
ok(!M.embeds(OO2, M.MOLECULES['hydrogen-peroxide']), 'O=O does not: a bond order never changes');
ok(!M.embeds(OO1, M.MOLECULES['oxygen-gas']), 'O-O single does not sit inside oxygen gas');
ok(!M.embeds(OH, M.MOLECULES.methane), 'O-H does not sit inside methane');

/* ---------- clasping ---------- */
{
  // an oxygen offered free hydrogens above, right and below takes top, then right
  const s = M.createState({ dish: [3, 3], targets: [['water', 1]], supply: ['O'],
    pre: [{ el: 'H', c: 1, r: 0 }, { el: 'H', c: 2, r: 1 }, { el: 'H', c: 1, r: 2 }] });
  const ev = M.place(s, at(s, 1, 1));
  eq(ev.bonds.map((b) => b.dir), [0, 1], 'placement order is top, right, bottom, left');
  eq(s.atoms[s.grid[at(s, 1, 2)]].free, 1, 'the hydrogen below keeps its hand');
  eq(ev.done && ev.done.key, 'water', 'and the two it took make water');
}
{
  const s = M.createState({ dish: [2, 1], targets: [['water', 1]], supply: ['O', 'H', 'H'],
    pre: [{ el: 'O', c: 0, r: 0 }] });
  const ev = M.place(s, at(s, 1, 0));
  eq(ev.bonds, [{ to: 0, order: 2, dir: 3 }], 'two bare oxygens clasp with both hands');
  eq(ev.done && ev.done.kind, 'waste', 'oxygen gas nobody asked for is waste');
  eq([s.wasted, s.wastedAtoms], [1, 2], 'waste is counted');
  ok(s.grid[0] === 0 && s.grid[1] === 1, 'waste stays on the dish');
  eq(s.result, { kind: 'shortage', el: 'O' }, 'and both oxygens are gone from the arithmetic');
}
{
  const s = M.createState({ dish: [4, 3], targets: [['ethane', 1]], supply: ['C', 'C', 'H', 'H', 'H', 'H', 'H', 'H'] });
  M.place(s, at(s, 1, 1));
  ok(!s.result, 'a bare carbon with ethane owed is fine');
  const ev = M.place(s, at(s, 2, 1));
  eq(ev.bonds[0].order, 3, 'two bare carbons grab each other three times');
  eq(s.result, { kind: 'shortage', el: 'C' }, 'and ethane can never come of it: not enough carbon');
}
{
  // a hydrogen offered a lone hydrogen on its right and an oxygen on its left
  const s = M.createState({ dish: [3, 1], targets: [['water', 1]], supply: ['H'],
    pre: [{ el: 'O', c: 0, r: 0 }, { el: 'H', c: 2, r: 0 }] });
  const pv = M.preview(s, 1);
  eq(pv.ev.bonds.map((b) => b.dir), [1], 'the ghost shows the hydrogen taking the right-hand friend');
  eq(pv.done && pv.done.kind, 'waste', 'and shows that it makes waste');
  ok(!s.atoms.some((a) => a.status === 'waste') && s.grid[1] === -1, 'a preview changes nothing');
}

/* ---------- required molecules leave ---------- */
{
  const s = M.createState(L.mobile[0]);
  M.place(s, at(s, 1, 2));
  const ev = M.place(s, at(s, 3, 2));
  eq([ev.done.kind, ev.done.key], ['required', 'water'], 'water on the list is required, and named');
  ok([at(s, 1, 2), at(s, 2, 2), at(s, 3, 2)].every((c) => s.grid[c] === -1), 'its cells come back');
  eq(ev.done.atoms.length, 3, 'the event keeps what left, for the lift');
  eq(s.result, { kind: 'win' }, 'the flask is full: win');
}
{
  const s = M.createState({ dish: [6, 1], targets: [['water', 1], ['ammonia', 1]],
    supply: ['H', 'O', 'H', 'H', 'O', 'H', 'N', 'H', 'H', 'H'] });
  M.place(s, 0); M.place(s, 1);
  eq(M.place(s, 2).done.kind, 'required', 'the first water is required');
  M.place(s, 1); M.place(s, 2);
  eq(M.place(s, 3).done.kind, 'waste', 'a water past its count is waste');
}

/* ---------- palms, space and shortage ---------- */
{
  const s = M.createState(L.mobile[0]);
  eq(s.analysis.palm, { 0: 'green' }, 'the tutorial oxygen starts green');
}
{
  const s = M.createState({ dish: [4, 1], targets: [['water', 2]], supply: ['O', 'H', 'H', 'H'],
    pre: [{ el: 'H', c: 0, r: 0 }, { el: 'O', c: 1, r: 0 }] });
  M.place(s, at(s, 2, 0));
  const f = s.analysis.fragments[0];
  ok(!f.green && f.why === 'shape', 'H-O-O is amber when only water is owed');
  eq(s.analysis.palm[2], 'amber', 'on the new oxygen\'s palm too');
  eq(s.result, { kind: 'shortage', el: 'O' }, 'and the level says at once there is not enough oxygen');
}
{
  // a hand walled in by waste and the dish edge can never be reached
  const s = M.createState({ dish: [3, 1], targets: [['water', 1]], supply: ['H', 'H', 'H', 'H', 'H'],
    pre: [{ el: 'O', c: 0, r: 0 }] });
  M.place(s, 2);
  eq(M.place(s, 1).done.kind, 'waste', 'H-H between the oxygen and the wall is waste');
  const o = s.analysis.fragments.find((f) => f.ids.includes(0));
  ok(o && !o.green && o.why === 'space', 'the oxygen goes amber: waste and the wall surround it');
  eq(s.result, { kind: 'shortage', el: 'O' }, 'the level ends on oxygen, though hydrogen is left');
}
{
  const s = M.createState({ dish: [2, 1], targets: [['methane', 1]], supply: ['C', 'H', 'H', 'H', 'H'] });
  M.place(s, 0); M.place(s, 1);
  eq(s.result, { kind: 'shortage', el: 'C' }, 'a carbon with one neighbour and three hands owed: not enough carbon');
}
{
  const s = M.createState({ dish: [3, 1], targets: [['hydrogen-gas', 1]], supply: ['H', 'H'] });
  M.place(s, 0);
  ok(!s.result, 'one lone hydrogen is fine');
  M.place(s, 2);
  eq(s.result, { kind: 'shortage', el: 'H' }, 'two apart with nothing left: they can never hold each other');
}
{
  // desktop level 5: an oxygen-hydrogen, a nitrogen and a carbon, then two hydrogens wasted as H-H
  const lv = L.desktop[4];
  const s = M.createState(lv);
  [[1, 1], [0, 1], [4, 1], [4, 4]].forEach(([c, r]) => M.place(s, at(s, c, r)));
  ok(Object.values(s.analysis.palm).every((p) => p === 'green'), 'before the waste every palm is green');
  M.place(s, at(s, 7, 5));
  const ev = M.place(s, at(s, 7, 4));
  eq([ev.done.kind, s.result], ['waste', { kind: 'shortage', el: 'H' }], 'H-H wasted: not enough hydrogen');
  ok(s.analysis.fragments.every((f) => f.green), 'each fragment alone could still finish (the per-fragment test says green)');
  ok(Object.values(s.analysis.palm).every((p) => p === 'amber'), 'but the level is lost, so every palm shows amber');
}
{
  // two oxygens competing for one water: either can take both hydrogens, so nothing is over
  const s = M.createState({ dish: [5, 3], targets: [['water', 1]], supply: ['O', 'H', 'H'],
    pre: [{ el: 'O', c: 0, r: 1 }] });
  M.place(s, at(s, 4, 1));
  eq(s.analysis.fragments.map((f) => f.green), [true, true], 'two bare oxygens, one water owed: both still green');
  eq(s.result, null, 'and one fragment per molecule still covers it, so the level goes on');
}

/* ---------- every level, through preview and place ---------- */
function replay(level, name) {
  const s = M.createState(level);
  let wasteFree = true, early = null;
  level.solution.forEach(([c, r], i) => {
    const cell = at(s, c, r);
    const pv = M.preview(s, cell);
    const ev = M.place(s, cell);
    if (!pv || !ev) { wasteFree = false; if (!early) early = { step: i + 1, result: 'illegal cell' }; return; }
    const step = name + ' step ' + (i + 1) + ': ';
    eq(pv.ev.bonds, ev.bonds, step + 'ghost bonds equal placed bonds');
    eq(pv.done ? pv.done.kind : null, ev.done ? ev.done.kind : null, step + 'ghost outcome equals placed outcome');
    eq(pv.result, ev.result, step + 'ghost result equals placed result');
    eq(pv.analysis.palm, s.analysis.palm, step + 'ghost palms equal the palms after release');
    if (ev.result && i < level.solution.length - 1 && !early) early = { step: i + 1, result: ev.result };
    if (ev.done && ev.done.kind === 'waste') wasteFree = false;
  });
  ok(wasteFree, name + ': zero waste');
  ok(!early, name + ': nothing ends the level early ' + JSON.stringify(early));
  eq(s.result, { kind: 'win' }, name + ': the solution wins');
  eq(s.next, level.supply.length, name + ': every atom is placed');
}
for (const [set, dish] of [['mobile', [5, 6]], ['desktop', [8, 6]]]) {
  eq(L[set].length, 7, set + ': seven levels');
  L[set].forEach((lv, i) => {
    const name = set + ' level ' + (i + 1);
    eq(lv.dish, dish, name + ': its own dish size');
    eq(lv.solution.length, lv.supply.length, name + ': a cell for every atom');
    ok(!!L.LESSONS[lv.lesson], name + ': a known lesson');
    const need = {};
    lv.targets.forEach(([k, n]) => { for (const [el, c] of Object.entries(M.MOLECULES[k].count)) need[el] = (need[el] || 0) + n * c; });
    ok(sameCounts(M.countEls(lv.supply.concat((lv.pre || []).map((p) => p.el))), need), name + ': exact supply');
    replay(lv, name);
  });
}
ok(L.mobile.slice(1).every((lv, i) => JSON.stringify([lv.supply, lv.targets]) !== JSON.stringify([L.desktop[i + 1].supply, L.desktop[i + 1].targets])),
   'mobile and desktop levels 2 to 7 are different levels, not one set reflowed');

/* ---------- the known late call, written down so nobody mistakes it for a bug ---------- */
{
  // mobile 7 made the wrong way: water finished before the second oxygen is dressed
  const s = M.createState(L.mobile[6]);
  M.place(s, at(s, 1, 1)); M.place(s, at(s, 3, 3)); M.place(s, at(s, 0, 1));
  eq(M.place(s, at(s, 1, 2)).done.key, 'water', 'wrong line: water made early, and the level is already lost');
  ok(!s.result, 'wrong line: the counts still add up, so nothing is declared yet');
  eq(M.place(s, at(s, 0, 4)).result, { kind: 'shortage', el: 'O' }, 'wrong line: declared one placement later, naming oxygen');
}

console.log((fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
