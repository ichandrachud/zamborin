/* Lessons in Chemistry · model and level tests.   node chemistry/tests.mjs

   What this proves: the rules do what the game says, the ghost's preview is
   the placement, a lost molecule is counted the moment it becomes true, drift
   never makes a bond, and every level can be won on its own dish. What it
   does NOT prove: that any level is fun. Only playing it does that. */
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
const pre = (el, c, r) => ({ el, c, r });

/* ---------- the molecule table ---------- */
for (const m of Object.values(M.MOLECULES)) {
  ok(m.els.every((el) => !!M.ELEMENTS[el]), 'known elements: ' + m.key);
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
eq(M.MOLECULES['iron-chloride'].els, ['Fe', 'Cl', 'Cl', 'Cl'], 'two-letter symbols parse');

/* ---------- matching ---------- */
const OH = { els: ['O', 'H'], adj: [[[1, 1]], [[0, 1]]], count: { O: 1, H: 1 } };
const OO2 = { els: ['O', 'O'], adj: [[[1, 2]], [[0, 2]]], count: { O: 2 } };
ok(M.embeds(OH, M.MOLECULES.water), 'O-H sits inside water');
ok(!M.embeds(OO2, M.MOLECULES['hydrogen-peroxide']), 'O=O does not sit inside peroxide: a bond order never changes');

/* ---------- clasping ---------- */
{
  const s = M.createState({ dish: [3, 3], targets: [['water', 1]], supply: ['O'],
    pre: [pre('H', 1, 0), pre('H', 2, 1), pre('H', 1, 2)] });
  const ev = M.place(s, at(s, 1, 1));
  eq(ev.bonds.map((b) => b.dir), [0, 1], 'placement order is top, right, bottom, left');
  eq(ev.done && ev.done.key, 'water', 'and the two it took make water');
}
{
  // THE OWNER'S EXAMPLE: a chlorine landing between a hydrogen (above) and an iron (left)
  const s = M.createState({ dish: [3, 3], targets: [['iron-chloride', 1]], supply: ['Cl', 'Cl', 'Cl'],
    pre: [pre('H', 1, 0), pre('Fe', 0, 1)] });
  ok(!s.result && s.analysis.lost === 0, 'iron and three chlorines: nothing lost yet');
  eq(s.analysis.palm, { 0: 'amber', 1: 'green' }, 'the hydrogen is amber (no use), the iron green');
  const pv = M.preview(s, at(s, 1, 1));
  eq(pv.ev.bonds.map((b) => b.to), [0], 'the ghost shows the hydrogen grabbing the chlorine');
  eq([pv.done && pv.done.kind, pv.analysis.lost], ['waste', 1], 'and that it loses the iron chloride');
  const ev = M.place(s, at(s, 1, 1));
  eq(ev.done.kind, 'waste', 'hydrogen chloride is waste here');
  eq(s.analysis.lost, 1, 'the iron chloride is lost');
  eq(s.result, { kind: 'fail', made: 0, total: 1, lost: 1, noRoom: false }, 'nothing else can be made: the level fails');
}

/* ---------- a lost molecule does not end the level; the end does ---------- */
{
  const lv = { dish: [7, 3], targets: [['salt', 2]], supply: ['Cl', 'Cl'],
    pre: [pre('Na', 1, 1), pre('H', 3, 0), pre('Na', 5, 1)] };
  const s = M.createState(lv);
  M.place(s, at(s, 3, 1));            // beside the hydrogen above it: HCl
  eq(s.analysis.lost, 1, 'one salt lost');
  eq(s.result, null, 'but the other salt can still be made, so play goes on');
  M.place(s, at(s, 6, 1));            // beside the second sodium
  eq(s.made.salt, 1, 'the second salt is made');
  eq(s.result, { kind: 'fail', made: 1, total: 2, lost: 1, noRoom: false }, 'every molecule must be made: 1 of 2 fails');
}

/* ---------- two fragments CAN share a molecule when a placed atom grabs both ---------- */
{
  const s = M.createState({ dish: [3, 1], targets: [['water', 1]], supply: ['O'],
    pre: [pre('H', 0, 0), pre('H', 2, 0)] });
  eq([s.analysis.lost, s.result], [0, null], 'two hydrogen radicals and an oxygen to come: water is still makeable');
  eq(s.analysis.palm, { 0: 'green', 1: 'green' }, 'both hydrogens green');
  const ev = M.place(s, at(s, 1, 0));
  eq([ev.done && ev.done.key, s.result && s.result.kind], ['water', 'win'], 'the oxygen dropped between them makes it');
}
{
  // but two atoms already down can never hold each other
  const s = M.createState({ dish: [3, 1], targets: [['salt', 1]], supply: ['H'],
    pre: [pre('Na', 0, 0), pre('Cl', 2, 0)] });
  eq([s.analysis.best, s.analysis.over], [0, true], 'a sodium and a chlorine already down cannot become salt');
}

/* ---------- palms and space ---------- */
{
  const s = M.createState({ dish: [4, 1], targets: [['water', 2]], supply: ['O', 'H', 'H', 'H'],
    pre: [pre('H', 0, 0), pre('O', 1, 0)] });
  M.place(s, at(s, 2, 0));
  const f = s.analysis.fragments[0];
  ok(!f.green && f.why === 'shape', 'H-O-O is amber when only water is owed');
  eq(s.result && s.result.kind, 'fail', 'and no water can be made from what is left');
}
{
  const s = M.createState({ dish: [3, 1], targets: [['water', 1]], supply: ['H', 'H', 'H', 'H', 'H'],
    pre: [pre('O', 0, 0)] });
  M.place(s, 2);
  eq(M.place(s, 1).done.kind, 'waste', 'H-H between the oxygen and the wall is waste');
  const o = s.analysis.fragments.find((fr) => fr.ids.includes(0));
  ok(o && !o.green && o.why === 'space', 'the oxygen is amber: waste and the wall surround it');
  eq(s.result && s.result.kind, 'fail', 'nothing can be made: fail');
}
{
  // three irons, three chlorines: only one iron chloride can be made, and any iron could be it
  const s = M.createState({ dish: [7, 3], targets: [['iron-chloride', 3]], supply: ['Cl', 'Cl', 'Cl'],
    pre: [pre('Fe', 1, 1), pre('Fe', 3, 0), pre('Fe', 5, 1)] });
  eq([s.analysis.best, s.analysis.lost], [1, 2], 'three owed, one makeable, two lost from the start');
  ok(Object.values(s.analysis.palm).every((p) => p === 'green'), 'every iron is still a candidate');
}

/* ---------- no room ---------- */
{
  const s = M.createState({ dish: [2, 1], targets: [['water', 1]], supply: ['O', 'H', 'H'],
    pre: [pre('H', 0, 0)] });
  M.place(s, 1);    // O beside the hydrogen: O-H, one hand left, dish full
  eq(s.result, { kind: 'fail', made: 0, total: 1, lost: 1, noRoom: true }, 'an atom waiting and no empty cell ends the level');
}

/* ---------- drift ---------- */
{
  const lv = { dish: [5, 5], targets: [['iron-chloride', 1]], supply: ['Cl', 'Cl', 'Cl'],
    pre: [pre('Fe', 2, 2), pre('H', 0, 0), pre('Na', 4, 4)] };
  const s = M.createState(lv);
  // every legal drift, from every state reachable by drifting at random, keeps the rule
  let x = 7;
  const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  let hops = 0, broke = false, bonded = false;
  for (let i = 0; i < 400; i++) {
    const movers = s.atoms.filter((a) => M.hopTargets(s, a.id).length);
    if (!movers.length) break;
    const a = movers[Math.floor(rnd() * movers.length)];
    const to = M.hopTargets(s, a.id);
    const bondsBefore = s.atoms.reduce((n, q) => n + q.bonds.length, 0);
    ok(M.hop(s, a.id, to[Math.floor(rnd() * to.length)]), 'a listed drift is accepted');
    hops++;
    if (s.atoms.reduce((n, q) => n + q.bonds.length, 0) !== bondsBefore) bonded = true;
    for (const q of s.atoms) {
      if (q.free === 0) continue;
      for (let d = 0; d < 4; d++) {
        const n = M.neighbourCell(s, q.cell, d);
        if (n >= 0 && s.grid[n] >= 0 && s.atoms[s.grid[n]].free > 0) broke = true;
      }
    }
  }
  ok(hops > 50, 'radicals drift (' + hops + ' drifts)');
  ok(!broke, 'no drift ever puts two free hands side by side');
  ok(!bonded, 'no drift ever makes a bond');
  eq(s.analysis.lost, 0, 'drifting loses nothing');
  const iron = s.atoms.find((a) => a.el === 'Fe');
  eq(M.hopTargets(s, iron.id).length > 0, true, 'a lone iron drifts too (slowly, in play)');
  // bonded atoms stay put, and blocked cells are never left or entered
  M.place(s, [0, 1, 2, 3].map((d) => M.neighbourCell(s, iron.cell, d)).find((n) => n >= 0 && s.grid[n] < 0 &&
    [0, 1, 2, 3].every((e) => { const m = M.neighbourCell(s, n, e); return m < 0 || m === iron.cell || s.grid[m] < 0 || s.atoms[s.grid[m]].free === 0; })));
  eq(M.hopTargets(s, iron.id), [], 'an iron holding a chlorine no longer drifts');
  const h = s.atoms.find((a) => a.el === 'H');
  const blocked = new Set([h.cell]);
  eq(M.hopTargets(s, h.id, blocked), [], 'a radical in a blocked cell stays');
  const dest = M.hopTargets(s, h.id);
  if (dest.length) ok(!M.hopTargets(s, h.id, new Set(dest)).length, 'blocked cells are never entered');
}

/* ---------- every level, through preview and place ---------- */
function replay(level, name) {
  const s = M.createState(level);
  let early = null;
  ok(!s.atoms.some((a) => a.bonds.length), name + ': nothing starts bonded');
  ok(!s.atoms.some((a) => a.free > 0 && [0, 1, 2, 3].some((d) => {
    const n = M.neighbourCell(s, a.cell, d); return n >= 0 && s.grid[n] >= 0 && s.atoms[s.grid[n]].free > 0; })),
     name + ': no two radicals start side by side');
  eq(s.analysis.lost, 0, name + ': nothing is lost at the start');
  level.solution.forEach(([c, r], i) => {
    const cell = at(s, c, r);
    const pv = M.preview(s, cell);
    const ev = M.place(s, cell);
    const step = name + ' step ' + (i + 1) + ': ';
    if (!pv || !ev) { ok(false, step + 'legal cell'); return; }
    eq(pv.ev.bonds, ev.bonds, step + 'ghost bonds equal placed bonds');
    eq(pv.done ? pv.done.kind : null, ev.done ? ev.done.kind : null, step + 'ghost outcome equals placed outcome');
    eq(pv.result, ev.result, step + 'ghost result equals placed result');
    eq(pv.analysis.lost, s.analysis.lost, step + 'ghost lost count equals the count after release');
    eq(s.analysis.lost, 0, step + 'nothing lost');
    if (ev.result && i < level.solution.length - 1 && !early) early = { step: i + 1, result: ev.result };
  });
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
    replay(lv, name);
  });
}
ok(L.mobile.slice(1).every((lv, i) => JSON.stringify([lv.pre, lv.supply, lv.targets]) !== JSON.stringify([L.desktop[i + 1].pre, L.desktop[i + 1].supply, L.desktop[i + 1].targets])),
   'mobile and desktop levels 2 to 7 are different levels, not one set reflowed');
ok(L.mobile.slice(2).every((lv) => (lv.pre || []).length >= 3), 'from level 3 the phone dish starts crowded');

console.log((fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
