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

/* ---------- every level: starts clean, and can be won ---------- */
// Build every target by bonding its centre to each leaf: dish atoms first, then the panel.
function buildAll(level) {
  const s = M.createState(level);
  const used = new Set();
  const pick = (el) => {
    const a = s.atoms.find((q) => q.el === el && q.status === 'live' && q.committed && !used.has(q.id) && q.bonds.length === 0);
    if (a) { used.add(a.id); return a.id; }
    const id = M.take(s, el);
    if (id >= 0) used.add(id);
    return id;
  };
  const log = [];
  for (const [key, n] of level.targets) {
    for (let k = 0; k < n; k++) {
      const T = M.MOLECULES[key];
      const centre = T.adj.reduce((best, l, i) => (l.length > T.adj[best].length ? i : best), 0);
      const ids = T.els.map(() => -1);
      ids[centre] = pick(T.els[centre]);
      // walk out from the centre so each new atom bonds to one already placed
      const q = [centre], seen = new Set([centre]);
      while (q.length) {
        const u = q.shift();
        for (const [v] of T.adj[u]) {
          if (seen.has(v)) continue;
          seen.add(v); q.push(v);
          ids[v] = pick(T.els[v]);
          const ev = M.bond(s, ids[u], ids[v]);
          log.push(ev ? (ev.lost ? 'LOST' : 'ok') : 'NO BOND');
        }
      }
    }
  }
  return { s, log };
}
for (const set of ['mobile', 'desktop']) {
  eq(L[set].length, 7, set + ': seven levels');
  L[set].forEach((lv, i) => {
    const name = set + ' level ' + (i + 1);
    const s = M.createState(lv);
    eq([s.analysis.lost, s.result], [0, null], name + ': nothing lost before the first move');
    ok(lv.dish.length >= 1 && Object.keys(lv.avail).length >= 1, name + ': something in the dish and something in the panel');
    ok(typeof lv.note === 'string' && lv.note.length > 0, name + ': a line for the win card');
    const { s: done, log } = buildAll(lv);
    ok(log.every((x) => x === 'ok'), name + ': built in order, nothing lost on the way ' + JSON.stringify(log));
    eq(done.result, { kind: 'win' }, name + ': every molecule made');
  });
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
   'phone and desktop levels 2 to 7 are different levels');
ok(L.desktop.slice(2).every((lv) => lv.dish.some((el) => {
  const s = M.createState(lv);
  return s.atoms.some((a) => a.el === el && s.analysis.palm[a.id] === 'amber');
})), 'from level 3 every desktop dish has a radical that is only trouble');

console.log((fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
