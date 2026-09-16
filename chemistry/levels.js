/* ============================================================
   Litmus · levels

   From the owner's sketch, 2026-09-14: an open dish with free radicals
   floating in it, targets listed at the top, and a set number of atoms in
   the Available panel. Some radicals are what a target needs (iron for iron
   chloride); the rest are waiting to grab whatever comes near.

   And from the owner's play, the same day: "increase the density of the free
   floating radicals so that the player really has to search for the one
   they need." So a level is three lists:
     needs     the radicals the list cannot be made without;
     hazards   hand-picked trouble, the lesson of the level (a hydrogen that
               takes the chlorine meant for the iron);
     crowd     how many more to scatter, drawn in turn from a pool that never
               holds a needed element, so the one you need is still the only
               one of its kind.
   `dish` is all of it, shuffled by `seed`. play.js may thin the crowd on a
   short phone, where the dish has less room; ?crowd=0 drops it for tests.

   `avail` is the panel. Every level has exactly the atoms its targets need;
   tests.mjs checks nothing is lost before the first move.
   ============================================================ */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChemLevels = api;
}(typeof self !== 'undefined' ? self : this, function (root) {
'use strict';

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(list, r) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/* The crowd, in the order it is thinned: a shuffled pool, dealt round and
   round, so no one element swamps the dish. */
function crowdOf(lv) {
  const r = mulberry(lv.seed * 104729 + 17);
  const pool = shuffle(lv.crowd[1], r), out = [];
  for (let i = 0; i < lv.crowd[0]; i++) out.push(pool[i % pool.length]);
  return out;
}
// The dish with the first `n` of the crowd (all of it if n is omitted).
function dishFor(lv, n) {
  const crowd = crowdOf(lv).slice(0, n == null ? lv.crowd[0] : n);
  return shuffle(lv.needs.concat(lv.hazards, crowd), mulberry(lv.seed * 7717 + 3));
}
function level(targets, avail, needs, hazards, crowd, seed, note) {
  const lv = { targets, avail, needs, hazards, crowd, seed, note };
  lv.dish = dishFor(lv);
  return lv;
}
// The level as it was before the crowd: needs and hazards only, in that order.
function withoutCrowd(lv) {
  return Object.assign({}, lv, { crowd: [0, lv.crowd[1]], dish: lv.needs.concat(lv.hazards) });
}
// The level with its crowd thinned to `n`.
function withCrowd(lv, n) {
  const k = Math.max(0, Math.min(lv.crowd[0], n));
  return Object.assign({}, lv, { dish: dishFor(lv, k) });
}

const firstMobile = [
  level([['water', 1]], { H: 2 }, ['O'], [], [2, ['Na', 'Mg']], 11,
    'Every atom has hands, and every hand wants a friend.'),
  level([['water', 1]], { H: 2 }, ['O'], ['Na'], [5, ['Cl', 'Mg', 'F']], 12,
    'A free hand grabs the first hand it touches.'),
  level([['iron-chloride', 1]], { Cl: 3 }, ['Fe'], ['H', 'H'], [6, ['H', 'Na', 'Mg', 'F', 'Al']], 13,
    'A hydrogen will take a chlorine before the iron gets it.'),
  level([['iron-chloride', 1], ['water', 1]], { Cl: 3, H: 1 }, ['Fe', 'O', 'H'], ['Na'], [6, ['Na', 'Mg', 'F', 'Al']], 14,
    'Use a hydrogen before a chlorine finds it.'),
  level([['calcium-chloride', 1], ['salt', 1]], { Cl: 2 }, ['Ca', 'Na', 'Cl'], ['H'], [7, ['H', 'Mg', 'F', 'Al']], 15,
    'Two chlorines that touch become chlorine gas.'),
  level([['magnesium-oxide', 1], ['salt', 2]], { Cl: 1, Na: 1 }, ['Mg', 'O', 'Na', 'Cl'], ['H'], [6, ['H', 'F', 'Ca', 'Al']], 16,
    'Oxygen holds magnesium with both hands.'),
  level([['iron-chloride', 1], ['calcium-chloride', 1], ['water', 1]], { Cl: 4 }, ['Fe', 'Ca', 'O', 'H', 'H', 'Cl'], ['Na'],
    [5, ['Na', 'Mg', 'F', 'Al']], 17,
    'Every atom you were given has a place. Find it before something else does.'),
];

const firstDesktop = [
  level([['water', 1]], { H: 2 }, ['O'], [], [3, ['Na', 'Mg', 'Cl']], 21,
    'Every atom has hands, and every hand wants a friend.'),
  level([['water', 2]], { H: 4 }, ['O', 'O'], ['Na'], [7, ['Cl', 'Mg', 'F', 'Ca']], 22,
    'Two oxygens that touch hold each other with both hands, and nobody asked for oxygen gas.'),
  level([['iron-chloride', 1]], { Cl: 3 }, ['Fe'], ['H', 'H', 'Na'], [9, ['H', 'Na', 'Mg', 'F', 'Al']], 23,
    'A hydrogen will take a chlorine before the iron gets it.'),
  level([['iron-chloride', 1], ['water', 1]], { Cl: 3, H: 1 }, ['Fe', 'O', 'H'], ['Na', 'Ca'], [10, ['Na', 'Mg', 'F', 'Al', 'Ca']], 24,
    'Use a hydrogen before a chlorine finds it.'),
  level([['calcium-chloride', 1], ['salt', 2]], { Cl: 3, Na: 1 }, ['Ca', 'Na', 'Cl'], ['H', 'H'], [11, ['H', 'Mg', 'F', 'Al', 'Fe']], 25,
    'Two chlorines that touch become chlorine gas.'),
  level([['magnesium-oxide', 1], ['salt', 2]], { Cl: 1, Na: 1 }, ['Mg', 'O', 'Na', 'Cl'], ['H', 'Fe'], [11, ['H', 'Fe', 'F', 'Ca', 'Al']], 26,
    'Oxygen holds magnesium with both hands.'),
  level([['iron-chloride', 1], ['calcium-chloride', 1], ['water', 1]], { Cl: 4 }, ['Fe', 'Ca', 'O', 'H', 'H', 'Cl'], ['Na', 'Mg'],
    [10, ['Na', 'Mg', 'F', 'Al']], 27,
    'Every atom you were given has a place. Find it before something else does.'),
];

/* ---------- THE LADDER: FIFTY LEVELS ----------
   Owner, 2026-09-14: "after about 50 levels of making molecules, could we
   start doing reactions?" Each rung is written once, for both breakpoints:
   the molecules to make, what the Available panel holds, and the trouble.
   The dish needs whatever the list takes that the panel does not give; the
   crowd is dealt from elements the list never uses, so a radical of a
   target's element is always one the list needs; and the dish fills up
   along the ladder, 9 radicals to 13 on a phone and 13 to 18 on a desktop,
   where one more hazard joins in. The seven levels the owner played keep
   their places and exactly their dishes.

   The lessons climb by hands: one-handed pairs, then two hands, then three,
   then carbon's four. From level 14 the order you build in matters: two
   atoms that meet hold on with every hand they both have free, so two bare
   oxygens make oxygen gas, and hydrogen peroxide needs a hydrogen on each
   oxygen first. tests.mjs plays every rung to a win without losing a
   molecule, and checks each order lesson really does punish the bare meeting. */
const Model = typeof module === 'object' && module.exports ? require('./model.js') : root.ChemModel;
const VARIETY = ['Na', 'Mg', 'F', 'Al', 'Ca', 'Cl', 'H', 'Fe', 'K', 'Zn', 'Cu', 'N', 'O', 'C'];
function needsOf(targets, avail) {
  const left = Object.assign({}, avail), needs = [];
  for (const [key, n] of targets) {
    for (let k = 0; k < n; k++) for (const el of Model.MOLECULES[key].els) { if (left[el] > 0) left[el] -= 1; else needs.push(el); }
  }
  return needs;
}
function rung(i, targets, avail, hazards, note) {
  const used = new Set(targets.flatMap(([key]) => Model.MOLECULES[key].els));
  const needs = needsOf(targets, avail), spare = VARIETY.filter((el) => !used.has(el) && !hazards.includes(el));
  const pool = spare.slice(1, 1 + Math.min(5, 2 + Math.floor(i / 8)));
  const phoneCrowd = Math.max(2, 9 + Math.floor((i * 4) / 49) - needs.length - hazards.length);
  const deskHazards = hazards.concat(spare[0]);
  const deskCrowd = Math.max(3, 13 + Math.floor((i * 5) / 49) - needs.length - deskHazards.length);
  return [level(targets, avail, needs, hazards, [phoneCrowd, pool], 100 + i, note),
          level(targets, avail, needs, deskHazards, [deskCrowd, pool], 300 + i, note)];
}
const RUNGS = [
  /* 1 */ null,
  /* 2 */ null,
  [[['salt', 1]], { Na: 1 }, ['H'], 'Sodium and chlorine have one hand each. One handshake makes salt.'],
  [[['hydrogen-chloride', 2]], { H: 2 }, ['Na'], 'Two chlorines, and each one wants a hydrogen of its own.'],
  [[['water', 1], ['salt', 1]], { H: 2, Na: 1 }, [], 'Hydrogen belongs with oxygen and sodium with chlorine. Mix them up and a molecule is lost.'],
  [[['magnesium-oxide', 1]], { Mg: 1 }, ['H'], 'Magnesium and oxygen have two hands each, and hold on with both.'],
  [[['magnesium-chloride', 1]], { Cl: 2 }, ['H', 'Na'], 'Magnesium has two hands, and a chlorine goes in each.'],
  [[['hydrogen-fluoride', 1], ['salt', 1]], { H: 1, Na: 1 }, [], 'Fluorine and chlorine both have one hand. Read the letters first.'],
  [[['water', 2]], { H: 4 }, ['Na'], 'Two oxygens that touch hold each other with both hands, and nobody asked for oxygen gas.'],
  /* 10 */ null,
  /* 11 */ null,
  [[['calcium-oxide', 1], ['water', 1]], { Ca: 1, H: 2 }, ['Na'], 'Calcium wants an oxygen with both hands free: the one without hydrogens.'],
  [[['sodium-hydroxide', 1]], { Na: 1, H: 1 }, ['Cl'], 'Oxygen has two hands: one for the sodium, one for the hydrogen.'],
  [[['hydrogen-peroxide', 1]], { H: 2 }, ['Na'], 'A hydrogen on each oxygen before they meet, or they grab each other with both hands.'],
  [[['calcium-hydroxide', 1]], { H: 2 }, ['Na'], 'A hydrogen on each oxygen first, or calcium takes one oxygen with both hands.'],
  [[['ammonia', 1]], { H: 3 }, ['Cl'], 'Nitrogen has three hands, and wants a hydrogen in each.'],
  /* 17 */ null,
  /* 18 */ null,
  [[['aluminium-chloride', 1], ['hydrogen-chloride', 1]], { Cl: 4 }, ['Na'], 'Aluminium takes three chlorines. The fourth is for the hydrogen.'],
  [[['ammonia', 2]], { H: 6 }, ['Cl'], 'Two nitrogens that meet hold on with all three hands.'],
  [[['hydrazine', 1]], { H: 4 }, ['Cl'], 'Two hydrogens on each nitrogen first. Then the nitrogens shake just one hand.'],
  /* 22 */ null,
  [[['nitrous-acid', 1]], { H: 1 }, ['Na'], 'The hydrogen goes on an oxygen, never on the nitrogen.'],
  [[['magnesium-chloride', 1], ['calcium-oxide', 1]], { Cl: 2, O: 1 }, ['H'], 'Two metals with two hands each. One wants chlorines, the other wants the oxygen.'],
  [[['sodium-hydroxide', 1], ['hydrogen-chloride', 1]], { H: 2 }, ['F'], 'One hydrogen for the oxygen, one for the chlorine. Keep the sodium off the chlorine.'],
  [[['methane', 1]], { H: 4 }, ['Cl'], 'Carbon has four hands, more than anyone else here.'],
  [[['carbon-dioxide', 1]], { O: 2 }, ['H'], 'Carbon holds each oxygen with two hands.'],
  [[['formaldehyde', 1]], { H: 2, O: 1 }, ['Na'], 'Carbon holds the oxygen with two hands, and a hydrogen with each of the others.'],
  [[['methanol', 1]], { H: 4 }, ['Na'], 'Bare carbon and bare oxygen grab each other with two hands. Hydrogens first.'],
  [[['ethyne', 1]], { H: 2 }, ['Cl'], 'Two bare carbons grab each other with three hands, which is just what this one needs.'],
  [[['ethylene', 1]], { H: 4 }, ['Cl'], 'Two hydrogens on each carbon first, and the carbons meet with two hands.'],
  [[['ethane', 1]], { H: 6 }, ['Na'], 'Three hydrogens on a carbon leave it one hand. Two of those make a single bond.'],
  [[['ethanol', 1]], { H: 6 }, ['Na'], 'Carbon, carbon, oxygen, in a row. Fill hands with hydrogen before atoms meet.'],
  [[['dimethyl-ether', 1]], { H: 6 }, ['Na'], 'The same atoms as ethanol in another order: the oxygen sits between the carbons.'],
  [[['carbon-dioxide', 1], ['water', 1]], { O: 2, H: 2 }, ['Na'], 'The oxygen in the dish is for the water. The two you carry are for the carbon.'],
  [[['urea', 1]], { H: 4 }, ['Cl'], 'Two hydrogens on each nitrogen first. Carbon holds the oxygen with two hands.'],
  [[['calcium-hydroxide', 1], ['magnesium-chloride', 1]], { H: 2, Cl: 2 }, ['Na'], 'Hydrogens on the oxygens and chlorines on the magnesium, before calcium finds either.'],
  [[['aluminium-chloride', 1], ['sodium-hydroxide', 1]], { Cl: 3, H: 1 }, ['F'], 'Three chlorines for the aluminium. The oxygen takes the sodium and the hydrogen.'],
  [[['ammonia', 1], ['hydrogen-chloride', 1], ['water', 1]], { H: 6 }, ['Na'], 'Six hydrogens: three for the nitrogen, one for the chlorine, two for the oxygen.'],
  [[['iron-chloride', 1], ['ammonia', 1]], { Cl: 3, H: 3 }, ['Na'], 'Iron and nitrogen both have three hands. Chlorines for one, hydrogens for the other.'],
  [[['methanol', 1], ['carbon-dioxide', 1]], { H: 4, O: 2 }, ['Na'], 'One carbon takes two oxygens with both hands. The other takes one, holding a hydrogen.'],
  [[['ethanol', 1], ['water', 1]], { H: 8 }, ['Na'], 'Six hydrogens for the ethanol, two for the water. Keep the oxygens apart.'],
  [[['ethylene', 1], ['hydrogen-chloride', 2]], { H: 6 }, ['Na'], 'Two hydrogens on each carbon, and one for each chlorine.'],
  [[['methane', 1], ['ammonia', 1], ['water', 1]], { H: 9 }, ['Na'], 'Four hands on carbon, three on nitrogen, two on oxygen: nine hydrogens.'],
  [[['hydrogen-peroxide', 1], ['ethyne', 1]], { H: 4 }, ['Na'], 'Hydrogens on the oxygens before they meet. The carbons may meet bare.'],
  [[['ethane', 1], ['carbon-dioxide', 1]], { H: 6, O: 2 }, ['Na'], 'Hydrogens on two of the carbons, and both oxygens on the third.'],
  [[['urea', 1], ['water', 1]], { H: 6 }, ['Na'], 'One oxygen is for the carbon, the other for two hydrogens. Do not mix them up.'],
  [[['dimethyl-ether', 1], ['hydrazine', 1]], { H: 10 }, ['Cl'], 'Two hydrogens on each nitrogen before they meet, and three on each carbon.'],
  [[['ethanol', 1], ['ammonia', 1], ['salt', 1]], { H: 9, Na: 1 }, ['F'], 'Salt, ammonia and ethanol: every hand in the dish has somewhere to go.'],
  [[['ethylene', 1], ['calcium-hydroxide', 1], ['hydrogen-chloride', 1]], { H: 7 }, ['Na'], 'Carbons, calcium and a chlorine, all waiting for hydrogen.'],
  // ---- the second fifty ----
  [[['potassium-chloride', 1]], { K: 1 }, ['H'], 'Potassium has one hand, the same as sodium.'],
  [[['potassium-oxide', 1]], { K: 2 }, ['H'], 'Oxygen has two hands and potassium only one, so it takes two of them.'],
  [[['zinc-oxide', 1]], { Zn: 1 }, ['H'], 'Zinc holds the oxygen with both hands, the way magnesium does.'],
  [[['copper-chloride', 1]], { Cl: 2 }, ['H', 'Na'], 'Copper has two hands, and a chlorine goes in each.'],
  [[['potassium-hydroxide', 1]], { K: 1, H: 1 }, ['Cl'], 'One hand of the oxygen for the potassium, the other for the hydrogen.'],
  [[['zinc-hydroxide', 1]], { H: 2 }, ['Na'], 'A hydrogen on each oxygen first, or the zinc takes one of them with both hands.'],
  [[['magnesium-hydroxide', 1]], { H: 2 }, ['K'], 'The same again, and magnesium is just as greedy as zinc.'],
  [[['calcium-fluoride', 1], ['potassium-chloride', 1]], { K: 1 }, ['H'], 'Two metals, two halogens. Read which is which.'],
  [[['aluminium-fluoride', 1]], { F: 3 }, ['Na'], 'Aluminium has three hands, and fluorine one each.'],
  [[['aluminium-oxide', 1]], { Al: 2 }, ['H'], 'Two aluminiums and three oxygens: six hands on each side of it.'],
  [[['iron-oxide', 1]], { Fe: 2 }, ['H'], 'Iron has three hands too, and two of them share three oxygens.'],
  [[['aluminium-hydroxide', 1]], { H: 3 }, ['Na'], 'A hydrogen on each oxygen before the aluminium can reach them.'],
  [[['iron-hydroxide', 1]], { H: 3 }, ['K'], 'The same three hands, and the same trap waiting in the oxygens.'],
  [[['sodium-oxide', 1], ['water', 1]], { Na: 2, H: 2 }, ['Cl'], 'One oxygen takes two sodiums, the other takes two hydrogens.'],
  [[['potassium-oxide', 1], ['salt', 1]], { K: 2, Na: 1 }, ['H'], 'Both metals have one hand. Only one of them is asked for the oxygen.'],
  [[['chloromethane', 1]], { H: 3 }, ['Na'], 'Three hydrogens and one chlorine, and carbon has a hand for each.'],
  [[['dichloromethane', 1]], { H: 2, Cl: 2 }, ['Na'], 'Two of each this time. Count the hands before you start.'],
  [[['chloroform', 1]], { Cl: 3 }, ['Na'], 'Three chlorines and one hydrogen: the same four hands, shared out differently.'],
  [[['carbon-tetrachloride', 1]], { Cl: 4 }, ['H'], 'Every one of carbon\u2019s four hands takes a chlorine.'],
  [[['tetrafluoromethane', 1]], { F: 4 }, ['H', 'Na'], 'Fluorine has one hand, like chlorine, and there is room for four.'],
  [[['hydrogen-cyanide', 1]], { H: 1 }, ['Na'], 'Carbon and nitrogen hold each other with three hands. That leaves carbon one.'],
  [[['methanoic-acid', 1]], { H: 2 }, ['Na'], 'One oxygen takes two of the carbon\u2019s hands, the other takes one and a hydrogen.'],
  [[['ethanoic-acid', 1]], { H: 4 }, ['Na'], 'Three hydrogens on one carbon. The other carbon holds both oxygens and the last hydrogen.'],
  [[['carbonic-acid', 1]], { H: 2 }, ['Na'], 'Three oxygens on one carbon: one held with two hands, two with one each.'],
  [[['acetaldehyde', 1]], { H: 4 }, ['Na'], 'One carbon takes three hydrogens, the other takes the oxygen with two hands and one hydrogen.'],
  [[['propanone', 1]], { H: 6 }, ['Na'], 'Three hydrogens on each end. The middle carbon holds the oxygen with both spare hands.'],
  [[['propane', 1]], { H: 8 }, ['Na'], 'Three carbons in a row, and eight hydrogens for what is left over.'],
  [[['propene', 1]], { H: 6 }, ['Na'], 'The same three carbons, but two of them hold each other with two hands.'],
  [[['propyne', 1]], { H: 4 }, ['Cl'], 'Two carbons hold each other with three hands. Fill the rest before they meet.'],
  [[['methylamine', 1]], { H: 5 }, ['Cl'], 'Three hydrogens for the carbon, two for the nitrogen, and they take the last hand each.'],
  [[['propane', 1], ['water', 1]], { H: 10 }, ['Na'], 'Eight hydrogens for the chain and two for the oxygen.'],
  [[['ethanoic-acid', 1], ['water', 1]], { H: 6 }, ['Na'], 'Three oxygens between them. Two go on the acid, one takes two hydrogens.'],
  [[['methylamine', 1], ['ammonia', 1]], { H: 8 }, ['Na'], 'Two nitrogens: one takes a carbon, the other takes hydrogens only.'],
  [[['chloromethane', 1], ['hydrogen-chloride', 1]], { H: 4 }, ['Na'], 'Two chlorines: one for a carbon, one for a hydrogen of its own.'],
  [[['propanone', 1], ['water', 1]], { H: 8 }, ['Na'], 'Two oxygens. The one with two hydrogens must not go near the carbons.'],
  [[['zinc-hydroxide', 1], ['potassium-chloride', 1]], { H: 2, K: 1 }, [], 'Hydrogens on the oxygens first, and keep the potassium off them.'],
  [[['aluminium-oxide', 1], ['water', 1]], { Al: 2, H: 2 }, ['Na'], 'Four oxygens: three for the aluminiums, one for the hydrogens.'],
  [[['iron-oxide', 1], ['salt', 1]], { Fe: 2, Na: 1 }, ['H'], 'Three oxygens for the two irons, and the sodium wants the chlorine.'],
  [[['carbonic-acid', 1], ['carbon-dioxide', 1]], { H: 2 }, ['Na'], 'Five oxygens and two carbons. Only one carbon gets the hydrogens\u2019 oxygens.'],
  [[['methanoic-acid', 1], ['methane', 1]], { H: 6 }, ['Na'], 'Two carbons: one takes both oxygens, the other takes four hydrogens.'],
  [[['propene', 1], ['hydrogen-chloride', 1]], { H: 7 }, ['Na'], 'Six hydrogens for the chain, one for the chlorine.'],
  [[['hydrogen-cyanide', 1], ['ammonia', 1]], { H: 4 }, ['Na'], 'Two nitrogens. One takes a carbon with three hands, the other takes three hydrogens.'],
  [[['acetaldehyde', 1], ['water', 1]], { H: 6 }, ['K'], 'Two oxygens, and only one of them belongs on a carbon.'],
  [[['ethanoic-acid', 1], ['salt', 1]], { H: 4, Na: 1 }, ['F'], 'The sodium wants the chlorine, not an oxygen. Keep them apart.'],
  [[['aluminium-hydroxide', 1], ['potassium-chloride', 1]], { H: 3, K: 1 }, [], 'Three oxygens for the aluminium, each with a hydrogen on it first.'],
  [[['propane', 1], ['carbon-dioxide', 1]], { H: 8, O: 2 }, ['Na'], 'Four carbons: three make the chain, the last takes both oxygens.'],
  [[['methylamine', 1], ['water', 1], ['salt', 1]], { H: 7, Na: 1 }, ['F'], 'Every hand in the dish has somewhere to go, and only one order works.'],
  [[['propanone', 1], ['methanol', 1]], { H: 10 }, ['Na'], 'Four carbons and two oxygens: one oxygen is held with two hands, one with one.'],
  [[['ethanoic-acid', 1], ['ammonia', 1], ['water', 1]], { H: 9 }, ['Na'], 'Nine hydrogens, three oxygens and a nitrogen. Work out where each hydrogen belongs.'],
  [[['propene', 1], ['zinc-hydroxide', 1], ['hydrogen-chloride', 1]], { H: 9 }, ['Na'], 'Carbons, zinc and a chlorine, all waiting for hydrogen. The last level of molecules.'],
];
const KEPT = { 0: 0, 1: 1, 9: 5, 10: 4, 16: 2, 17: 3, 21: 6 };      // rung index -> index in the first seven
const mobile = [], desktop = [];
RUNGS.forEach((row, i) => {
  const [m, d] = row ? rung(i, ...row) : [firstMobile[KEPT[i]], firstDesktop[KEPT[i]]];
  mobile.push(m); desktop.push(d);
});

/* ---------- CHAPTER 2: REACTIONS ----------
   The dish holds whole molecules; the tube reacts two at a time (lab.js).
   `dish` is what floats at the start. `solution` is one way through, as
   [where, molecule] steps, where is 'tube', 'dish' or 'beaker' and the
   molecule is taken from the tray first, then the dish; tests.mjs plays it.
   Desktop dishes carry a decoy or two more than phones. */
const R = (targets, dish, seed, note, solution, clue) => ({ targets, dish, seed, note, solution, clue });
/* ---------- chapter 2: the Chem Lab ----------
   Sixty benches, in the order the chemistry builds up: an acid meeting a
   base, then one hydrogen at a time, metal oxides, ammonia, carbonates
   fizzing, metals pushing each other out, and solids dropping out of clear
   water.

   A lesson is written once: what it teaches, what to make, and the
   reactions that make it. The dish and the worked solution are read off the
   route, so a level cannot drift from its own answer, and the last two
   lists are the decoys — the phone gets a few, the desktop more, which is
   what makes the two breakpoints two different benches. tests.mjs plays
   every solution through and checks nothing is lost on the way. */
const LESSONS = [
  // ---- an acid and a base ----
  ['An acid and a base make a salt and water.', ['sodium-chloride'],
    [['hydrochloric-acid', 'sodium-hydroxide']], ['water'], ['nitric-acid']],
  ['Every acid has its own salt. Nitric acid makes a nitrate.', ['potassium-nitrate'],
    [['nitric-acid', 'potassium-hydroxide']], ['water', 'sodium-chloride'], ['hydrochloric-acid']],
  ['Hydrobromic acid makes a bromide, the same way.', ['sodium-bromide'],
    [['hydrobromic-acid', 'sodium-hydroxide']], ['water', 'potassium-nitrate'], ['nitric-acid', 'sodium-chloride']],
  ['Sulphuric acid and calcium hydroxide make calcium sulphate, and two waters.', ['calcium-sulphate'],
    [['sulphuric-acid', 'calcium-hydroxide']], ['hydrochloric-acid', 'water'], ['sodium-chloride', 'nitric-acid']],
  // ---- one hydrogen at a time ----
  ['Sulphuric acid has two hydrogens to give, so it takes two sodium hydroxides.', ['sodium-sulphate'],
    [['sulphuric-acid', 'sodium-hydroxide'], ['sodium-hydrogen-sulphate', 'sodium-hydroxide']], ['water'], ['hydrochloric-acid', 'sodium-chloride']],
  ['An acid takes one hydroxide at a time. The basic salt in between is half done.', ['calcium-chloride'],
    [['hydrochloric-acid', 'calcium-hydroxide'], ['calcium-hydroxychloride', 'hydrochloric-acid']], ['sulphuric-acid', 'water'], ['nitric-acid', 'sodium-chloride']],
  ['Two different acids, one at each hydroxide, leave a salt of both.', ['calcium-chloride-nitrate'],
    [['hydrochloric-acid', 'calcium-hydroxide'], ['calcium-hydroxychloride', 'nitric-acid']], ['water'], ['sulphuric-acid', 'sodium-chloride']],
  ['Potassium hydroxide takes the same two steps as sodium.', ['potassium-sulphate'],
    [['sulphuric-acid', 'potassium-hydroxide'], ['potassium-hydrogen-sulphate', 'potassium-hydroxide']], ['water', 'sodium-chloride'], ['hydrochloric-acid', 'potassium-nitrate']],
  // ---- metal oxides ----
  ['A metal oxide is a base too: it takes the acid’s hydrogens as water.', ['copper-sulphate'],
    [['copper-oxide', 'sulphuric-acid']], ['water', 'sodium-chloride'], ['hydrochloric-acid', 'nitric-acid']],
  ['Zinc oxide takes one hydrogen, then the other.', ['zinc-chloride'],
    [['zinc-oxide', 'hydrochloric-acid'], ['zinc-hydroxychloride', 'hydrochloric-acid']], ['water'], ['sulphuric-acid', 'sodium-chloride']],
  ['Magnesium oxide and nitric acid, one hydrogen at a time.', ['magnesium-nitrate'],
    [['magnesium-oxide', 'nitric-acid'], ['magnesium-hydroxynitrate', 'nitric-acid']], ['water', 'sodium-chloride'], ['hydrochloric-acid', 'potassium-nitrate']],
  ['Quicklime and water make slaked lime, and it gets hot as it does.', ['calcium-hydroxide'],
    [['calcium-oxide', 'water']], ['sodium-chloride'], ['hydrochloric-acid', 'sodium-nitrate']],
  ['The water you need can come out of a reaction you have already run.', ['calcium-hydroxide', 'sodium-chloride'],
    [['hydrochloric-acid', 'sodium-hydroxide'], ['calcium-oxide', 'water']], ['sodium-nitrate'], ['nitric-acid', 'potassium-nitrate']],
  // ---- ammonia ----
  ['Ammonia is a base with no hydroxide at all, so it makes no water.', ['ammonium-chloride'],
    [['ammonia', 'hydrochloric-acid']], ['water', 'sodium-chloride'], ['nitric-acid']],
  ['A strong base drives ammonia back out of its salt.', ['ammonia'],
    [['ammonium-chloride', 'sodium-hydroxide']], ['water'], ['hydrochloric-acid', 'sodium-chloride']],
  ['Drive the ammonia out, then give it to a different acid.', ['ammonium-nitrate'],
    [['ammonium-chloride', 'sodium-hydroxide'], ['ammonia', 'nitric-acid']], ['water'], ['hydrochloric-acid', 'sodium-chloride']],
  ['Quicklime will drive ammonia out as well as any hydroxide.', ['ammonia'],
    [['ammonium-nitrate', 'calcium-oxide']], ['water', 'sodium-chloride'], ['hydrochloric-acid', 'sodium-nitrate']],
  // ---- carbonates ----
  ['Washing soda takes one hydrogen and becomes baking soda.', ['sodium-hydrogencarbonate'],
    [['sodium-carbonate', 'hydrochloric-acid']], ['water'], ['nitric-acid', 'sodium-chloride']],
  ['One more hydrogen and the carbon dioxide comes off: that is the fizz.', ['carbon-dioxide'],
    [['sodium-hydrogencarbonate', 'hydrochloric-acid']], ['water', 'sodium-chloride'], ['nitric-acid']],
  ['Two steps from washing soda to the fizz.', ['carbon-dioxide', 'sodium-chloride'],
    [['sodium-carbonate', 'hydrochloric-acid'], ['sodium-hydrogencarbonate', 'hydrochloric-acid']], ['water'], ['nitric-acid', 'potassium-nitrate']],
  ['Sulphuric acid has two hydrogens, so limestone fizzes in one go.', ['carbon-dioxide', 'calcium-sulphate'],
    [['calcium-carbonate', 'sulphuric-acid']], ['water'], ['hydrochloric-acid', 'sodium-chloride']],
  ['An alkali takes baking soda back to washing soda.', ['sodium-carbonate'],
    [['sodium-hydrogencarbonate', 'sodium-hydroxide']], ['water', 'sodium-chloride'], ['hydrochloric-acid']],
  // ---- metals ----
  ['A metal pushes the acid’s hydrogen out, and it bubbles away.', ['hydrogen'],
    [['magnesium', 'sulphuric-acid']], ['water'], ['sodium-chloride', 'sodium-sulphate']],
  ['Zinc does it too, a little more slowly.', ['zinc-sulphate'],
    [['zinc', 'sulphuric-acid']], ['water', 'sodium-chloride'], ['sodium-sulphate', 'potassium-nitrate']],
  ['A livelier metal takes the salt and leaves the quieter one behind.', ['copper'],
    [['zinc', 'copper-sulphate']], ['water', 'sodium-chloride'], ['zinc-sulphate', 'potassium-nitrate']],
  ['Magnesium is livelier than zinc, so it pushes zinc out as well.', ['zinc'],
    [['magnesium', 'zinc-chloride']], ['water', 'sodium-chloride'], ['magnesium-chloride', 'potassium-nitrate']],
  ['Make the salt first, then push the metal out of it.', ['copper'],
    [['copper-oxide', 'sulphuric-acid'], ['copper-sulphate', 'magnesium']], ['water'], ['sodium-chloride', 'magnesium-sulphate']],
  // ---- solids that fall out ----
  ['Swap the partners of two salts, and chalk falls out of the water.', ['calcium-carbonate'],
    [['sodium-carbonate', 'calcium-chloride']], ['water', 'sodium-chloride'], ['potassium-nitrate', 'sodium-nitrate']],
  ['Any carbonate and any of these metals: the carbonate is the one that will not dissolve.', ['magnesium-carbonate'],
    [['potassium-carbonate', 'magnesium-bromide']], ['water', 'potassium-bromide'], ['sodium-chloride', 'potassium-nitrate']],
  ['A hydroxide will fall out too, if the metal holds it tightly enough.', ['zinc-hydroxychloride'],
    [['sodium-hydroxide', 'zinc-chloride']], ['water', 'sodium-chloride'], ['potassium-nitrate', 'sodium-nitrate']],
  ['Calcium sulphate is the plaster on a wall: it will not stay in water either.', ['calcium-sulphate'],
    [['sodium-sulphate', 'calcium-chloride']], ['water', 'sodium-chloride'], ['potassium-nitrate', 'sodium-nitrate']],
  ['Make the carbonate first, then drop it out as chalk.', ['calcium-carbonate'],
    [['sodium-hydrogencarbonate', 'sodium-hydroxide'], ['sodium-carbonate', 'calcium-chloride']], ['water'], ['sodium-chloride', 'potassium-nitrate']],
  // ---- copper, and the colours of it ----
  ['Copper carbonate is the green on an old roof. It will not dissolve.', ['copper-carbonate'],
    [['copper-sulphate', 'sodium-carbonate']], ['water', 'sodium-sulphate'], ['sodium-chloride', 'potassium-nitrate']],
  ['Acid takes the green carbonate back to a blue salt, fizzing as it goes.', ['copper-chloride', 'carbon-dioxide'],
    [['copper-carbonate', 'hydrochloric-acid'], ['copper-chloride-hydrogencarbonate', 'hydrochloric-acid']], ['water'], ['sodium-chloride', 'nitric-acid']],
  ['Make the green carbonate, then push the copper out of what is left.', ['copper-carbonate', 'copper'],
    [['copper-sulphate', 'sodium-carbonate'], ['copper-sulphate', 'zinc']], ['water'], ['sodium-chloride', 'zinc-sulphate']],
  // ---- three steps ----
  ['Three steps: slake the lime, then take both hydroxides off it.', ['calcium-chloride'],
    [['calcium-oxide', 'water'], ['calcium-hydroxide', 'hydrochloric-acid'], ['calcium-hydroxychloride', 'hydrochloric-acid']], [], ['sulphuric-acid', 'sodium-chloride']],
  ['Slake the lime with water you make yourself.', ['calcium-hydroxide', 'potassium-nitrate'],
    [['nitric-acid', 'potassium-hydroxide'], ['calcium-oxide', 'water']], ['sodium-chloride'], ['hydrochloric-acid', 'sodium-nitrate']],
  ['The acid for the second reaction comes out of the first.', ['calcium-sulphate', 'sodium-chloride'],
    [['sulphuric-acid', 'calcium-hydroxychloride'], ['hydrochloric-acid', 'sodium-hydroxide']], ['water'], ['sodium-nitrate', 'nitric-acid']],
  ['Drop the chalk out, then fizz it with the acid you set free.', ['calcium-carbonate', 'carbon-dioxide'],
    [['sodium-carbonate', 'calcium-chloride'], ['sodium-hydrogencarbonate', 'hydrochloric-acid']],
    ['sodium-hydrogencarbonate', 'hydrochloric-acid'], ['water', 'sodium-chloride']],
  // ---- baking soda, both ways ----
  ['Baking soda from washing soda, and the salt beside it.', ['sodium-hydrogencarbonate', 'sodium-chloride'],
    [['sodium-carbonate', 'hydrochloric-acid']], ['water'], ['nitric-acid', 'potassium-nitrate']],
  ['Potassium keeps up with sodium all the way to the fizz.', ['carbon-dioxide', 'potassium-chloride'],
    [['potassium-carbonate', 'hydrochloric-acid'], ['potassium-hydrogencarbonate', 'hydrochloric-acid']], ['water'], ['nitric-acid', 'sodium-chloride']],
  ['An ammonium salt fizzes as well, and gives up its ammonia after.', ['carbon-dioxide', 'ammonia'],
    [['ammonium-hydrogencarbonate', 'hydrochloric-acid'], ['ammonium-chloride', 'sodium-hydroxide']],
    ['ammonium-chloride', 'sodium-hydroxide'], ['water', 'sodium-chloride']],
  ['Turn baking soda back into washing soda, then drop it out as chalk.', ['calcium-carbonate', 'sodium-chloride'],
    [['sodium-hydrogencarbonate', 'sodium-hydroxide'], ['sodium-carbonate', 'calcium-chloride']], ['water'], ['nitric-acid', 'potassium-nitrate']],
  // ---- the reactivity order ----
  ['Copper sits below hydrogen, so no acid will push it out. Use a livelier metal.', ['copper', 'magnesium-sulphate'],
    [['magnesium', 'copper-sulphate']], ['water', 'sulphuric-acid'], ['sodium-chloride', 'potassium-nitrate']],
  ['Zinc pushes copper out but cannot touch magnesium.', ['copper', 'zinc-bromide'],
    [['zinc', 'copper-bromide']], ['water', 'magnesium-bromide'], ['sodium-chloride', 'potassium-nitrate']],
  ['Make the zinc salt with acid, then take the zinc back off it with magnesium.', ['hydrogen', 'magnesium-sulphate'],
    [['zinc', 'sulphuric-acid'], ['zinc-sulphate', 'magnesium']], ['water'], ['sodium-chloride', 'potassium-nitrate']],
  ['Dissolve the zinc carbonate in acid first: the metal is locked up in a solid.', ['zinc', 'carbon-dioxide'],
    [['zinc-carbonate', 'sulphuric-acid'], ['zinc-sulphate', 'magnesium']], ['water'], ['sodium-chloride', 'potassium-nitrate']],
  // ---- two targets, two routes ----
  ['Two salts to make, and only one of each acid.', ['sodium-chloride', 'potassium-nitrate'],
    [['hydrochloric-acid', 'sodium-hydroxide'], ['nitric-acid', 'potassium-hydroxide']], ['water'], ['sodium-nitrate', 'potassium-chloride']],
  ['Both salts of sulphuric acid: stop at the first for one, go on for the other.', ['sodium-hydrogen-sulphate', 'sodium-sulphate'],
    [['sulphuric-acid', 'sodium-hydroxide'], ['sulphuric-acid', 'sodium-hydroxide'], ['sodium-hydrogen-sulphate', 'sodium-hydroxide']],
    ['water'], ['hydrochloric-acid', 'sodium-chloride']],
  ['Two salts of calcium: one half done, one with a different acid on each side.', ['calcium-hydroxynitrate', 'calcium-chloride-nitrate'],
    [['nitric-acid', 'calcium-hydroxide'], ['hydrochloric-acid', 'calcium-hydroxide'], ['calcium-hydroxychloride', 'nitric-acid']],
    ['water'], ['sulphuric-acid', 'sodium-chloride']],
  ['A solid and a gas from the same bench.', ['calcium-carbonate', 'carbon-dioxide'],
    [['sodium-carbonate', 'calcium-chloride'], ['sodium-hydrogencarbonate', 'nitric-acid']],
    ['sodium-hydrogencarbonate', 'nitric-acid'], ['water', 'sodium-chloride']],
  // ---- work out what the bench can spare ----
  ['The hydroxide you need is what the first reaction leaves behind.', ['calcium-sulphate', 'sodium-chloride'],
    [['sodium-hydrogen-sulphate', 'calcium-hydroxide'], ['sodium-hydroxide', 'hydrochloric-acid']], ['water'], ['nitric-acid', 'sodium-nitrate']],
  ['Quicklime takes the ammonia out, and the water it makes slakes the next one.', ['ammonia', 'calcium-hydroxide'],
    [['ammonium-chloride', 'sodium-hydroxide'], ['calcium-oxide', 'water']], ['sodium-chloride'], ['hydrochloric-acid', 'sodium-nitrate']],
  ['Set the nitric acid free from its salt, then fizz the soda with it.', ['calcium-sulphate', 'carbon-dioxide'],
    [['sulphuric-acid', 'calcium-hydroxynitrate'], ['nitric-acid', 'sodium-hydrogencarbonate']], ['water'], ['sodium-chloride', 'potassium-nitrate']],
  ['Everything here is wanted twice. Spend it in the right order.', ['zinc-chloride', 'carbon-dioxide'],
    [['zinc-oxide', 'hydrochloric-acid'], ['zinc-hydroxychloride', 'hydrochloric-acid'], ['sodium-hydrogencarbonate', 'hydrochloric-acid']],
    ['water'], ['sodium-chloride', 'nitric-acid']],
  // ---- the long ones ----
  ['Four reactions, and the bench gives you nothing spare.', ['calcium-chloride', 'sodium-sulphate'],
    [['calcium-oxide', 'water'], ['calcium-hydroxide', 'hydrochloric-acid'], ['calcium-hydroxychloride', 'hydrochloric-acid'],
     ['sulphuric-acid', 'sodium-hydroxide'], ['sodium-hydrogen-sulphate', 'sodium-hydroxide']], [], ['sodium-chloride', 'nitric-acid']],
  ['From quicklime to chalk, the long way round.', ['calcium-carbonate'],
    [['calcium-oxide', 'water'], ['calcium-hydroxide', 'hydrochloric-acid'], ['calcium-hydroxychloride', 'hydrochloric-acid'],
     ['calcium-chloride', 'sodium-carbonate']], ['water'], ['sodium-chloride', 'nitric-acid']],
  ['Copper, twice over: out of its carbonate and out of its sulphate.', ['copper', 'carbon-dioxide'],
    [['copper-carbonate', 'sulphuric-acid'], ['copper-sulphate', 'zinc']], ['water'], ['sodium-chloride', 'zinc-sulphate']],
  ['Make the washing soda, drop the chalk, and keep the fizz for last.', ['calcium-carbonate', 'carbon-dioxide', 'sodium-chloride'],
    [['sodium-hydrogencarbonate', 'sodium-hydroxide'], ['sodium-carbonate', 'calcium-chloride'], ['sodium-hydrogencarbonate', 'hydrochloric-acid']],
    ['sodium-hydrogencarbonate'], ['water', 'nitric-acid']],
  ['Everything you have learned, in one bench.', ['copper', 'calcium-carbonate', 'ammonia'],
    [['copper-sulphate', 'magnesium'], ['sodium-carbonate', 'calcium-chloride'], ['ammonium-chloride', 'sodium-hydroxide']],
    ['water'], ['sodium-chloride', 'potassium-nitrate']],
];

/* Read a lesson: which molecules the dish must start with, and the moves
   that win. Anything the next reaction would pour off the tray is put back
   in the dish first, and anything on the list is handed over as it appears. */
const chem = () => root.ChemLab || (typeof require === 'function' ? require('./lab.js') : null);
function bench(note, targets, route, decoys, seed, clue) {
  const dish = [], moves = [], owed = {};
  for (const t of targets) owed[t] = (owed[t] || 0) + 1;
  let tray = [];
  const stock = {};
  const wantedLater = (i, k) => owed[k] > 0 || route.slice(i).some(([a, b]) => a === k || b === k);
  route.forEach(([a, b], i) => {
    const keep = [];
    for (const k of tray) {
      if ((k === a || k === b) && !keep.includes(k)) { keep.push(k); continue; }
      if (wantedLater(i, k)) { moves.push(['dish', k]); stock[k] = (stock[k] || 0) + 1; }
    }
    tray = keep;
    for (const k of [a, b]) {
      const t = tray.indexOf(k);
      if (t >= 0) tray.splice(t, 1);
      else if (stock[k]) stock[k]--;
      else dish.push(k);
      moves.push(['tube', k]);
    }
    tray = chem().reactionFor(a, b).products.slice();
    for (let j = 0; j < tray.length; j++) {
      const k = tray[j];
      if (owed[k] > 0) { moves.push(['beaker', k]); owed[k]--; tray.splice(j--, 1); }
    }
  });
  return R(targets.map((k) => [k, 1]), [...dish, ...decoys], seed, note, moves, clue);
}
let ladder = null;
function rungs() {
  if (!ladder) {
    ladder = { mobile: [], desktop: [] };
    LESSONS.forEach(([note, targets, route, phone, more], i) => {
      ladder.mobile.push(bench(note, targets, route, phone, 31 + i));
      ladder.desktop.push(bench(note, targets, route, [...phone, ...(more || [])], 201 + i));
    });
  }
  return ladder;
}
const lab = { get mobile() { return rungs().mobile; }, get desktop() { return rungs().desktop; } };

/* ---------- chapter 3: the Carbon Lab ----------
   Forty benches of organic chemistry, each opening on a clue card that says
   the rule and never the answer. They are written the same way the Chem Lab's
   are — what it teaches, what to make, and the reactions that make it — with
   the clue as the second line. */
const CARBON = [
  // ---- the double bond opens ----
  ['The double bond in ethene opens up and takes a hydrogen on each carbon.',
    'The two sticks between the carbons are a double bond. It can open up and take on a small molecule, half on each carbon.',
    ['ethane'], [['ethene', 'hydrogen']], ['water'], ['propane']],
  ['Orange bromine turns colourless when it meets a double bond. That is how chemists test for one.',
    'A double bond opens up and takes on a small molecule, half on each carbon. Count the atoms in what you need.',
    ['dibromoethane'], [['ethene', 'bromine']], ['water', 'carbon-dioxide'], ['hydrogen']],
  ['Ethene and steam make ethanol. Most of the alcohol industry uses is made this way.',
    'A double bond takes on a small molecule, half on each carbon. Count the atoms: which one gives C₂H₅OH?',
    ['ethanol'], [['ethene', 'water']], ['hydrogen', 'hydrochloric-acid'], ['bromine']],
  ['Hydrogen chloride adds on too: the hydrogen to one carbon, the chlorine to the other.',
    'A double bond takes on a small molecule, half on each carbon. Which of these is made of two halves?',
    ['chloroethane'], [['ethene', 'hydrochloric-acid']], ['water', 'hydrogen'], ['bromine', 'ethane']],
  ['Propene does everything ethene does, with one more carbon along for the ride.',
    'The chain is longer but the double bond is the same, and it opens the same way.',
    ['propane'], [['propene', 'hydrogen']], ['water', 'ethene'], ['bromine', 'ethane']],
  ['A longer chain, the same orange test.',
    'A double bond opens and takes a bromine onto each carbon. Count the carbons in what you need.',
    ['dibromopropane'], [['propene', 'bromine']], ['water', 'ethene'], ['hydrogen', 'dibromoethane']],
  // ---- alcohols ----
  ['Oxygen turns ethanol into ethanoic acid. That is why an open bottle of wine turns to vinegar.',
    'Oxygen turns an alcohol (ends in OH) into an acid (ends in COOH).',
    ['ethanoic-acid'], [['ethanol', 'oxygen']], ['water', 'hydrochloric-acid'], ['ethene', 'hydrogen']],
  ['Methanol is the simplest alcohol of all, and oxygen treats it just the same.',
    'Oxygen turns an alcohol into the acid with the same number of carbons.',
    ['methanoic-acid'], [['methanol', 'oxygen']], ['water', 'ethanol'], ['hydrochloric-acid', 'ethanoic-acid']],
  ['Hydrogen chloride swaps an alcohol’s OH for a chlorine, and the OH leaves as water.',
    'The OH on the end of an alcohol can be swapped for something else. What is left over has to go somewhere.',
    ['chloroethane'], [['ethanol', 'hydrochloric-acid']], ['water', 'oxygen'], ['ethene', 'hydrogen']],
  ['Hydrogen bromide does the same swap, and leaves a bromine on the end instead.',
    'The OH on the end of an alcohol can be swapped for whatever halogen is offered.',
    ['bromopropane'], [['propanol', 'hydrobromic-acid']], ['water', 'ethanol'], ['hydrochloric-acid', 'oxygen']],
  ['Alkali puts the OH back, and takes the halogen away as a salt.',
    'Alkali (ends in OH) will swap a halogen on the end of a chain back for an OH.',
    ['ethanol'], [['chloroethane', 'sodium-hydroxide']], ['water'], ['hydrochloric-acid', 'sodium-chloride']],
  ['The same swap, whichever halogen is on the end and whichever alkali is offered.',
    'Alkali swaps the halogen on the end of a chain for an OH, and takes the halogen away as a salt.',
    ['propanol', 'potassium-bromide'], [['bromopropane', 'potassium-hydroxide']], ['water'], ['ethanol', 'sodium-hydroxide']],
  // ---- esters ----
  ['An alcohol and an acid make an ester, and esters smell of fruit. This one smells of pear drops.',
    'An alcohol (ends in OH) and an acid (ends in COOH) join into an ester, and give off water.',
    ['ethyl-ethanoate'], [['ethanol', 'ethanoic-acid']], ['sodium-hydroxide', 'water'], ['methanol', 'oxygen']],
  ['The ester takes its first name from the alcohol and its last from the acid.',
    'An alcohol and an acid join into an ester. Which alcohol and which acid would make this one?',
    ['methyl-ethanoate'], [['methanol', 'ethanoic-acid']], ['water', 'ethanol'], ['methanoic-acid', 'oxygen']],
  ['Swap them round and you get a different ester with the same atoms in it.',
    'The alcohol gives the ester its first name, the acid gives it the last. Read the name carefully.',
    ['ethyl-methanoate'], [['ethanol', 'methanoic-acid']], ['water', 'methanol'], ['ethanoic-acid', 'oxygen']],
  ['Water splits an ester back into the alcohol and the acid it was made from.',
    'What water and an ester do is the opposite of what an alcohol and an acid do.',
    ['ethanol', 'ethanoic-acid'], [['ethyl-ethanoate', 'water']], ['oxygen'], ['methanol', 'propanol']],
  ['Alkali splits an ester too, but keeps the acid as its salt. Soap is made this way.',
    'Alkali (ends in OH) splits an ester into the alcohol and a salt of the acid (ends in COONa).',
    ['ethanol', 'sodium-ethanoate'], [['ethyl-ethanoate', 'sodium-hydroxide']], ['water'], ['hydrochloric-acid', 'oxygen']],
  ['Potassium alkali makes the potassium salt. Soft soap is the potassium kind.',
    'Alkali splits an ester into the alcohol and the salt of the acid. Whose salt depends on the alkali.',
    ['propanol', 'potassium-ethanoate'], [['propyl-ethanoate', 'potassium-hydroxide']], ['water'], ['sodium-hydroxide', 'ethanol']],
  // ---- the acid group is still an acid ----
  ['Ethanoic acid is an acid like any other: alkali turns it into a salt and water.',
    'An acid (ends in COOH) and a base make a salt and water, the same as any acid does.',
    ['sodium-ethanoate'], [['ethanoic-acid', 'sodium-hydroxide']], ['water'], ['ethanol', 'hydrochloric-acid']],
  ['Vinegar and baking soda: the fizz is carbon dioxide leaving the soda.',
    'An acid takes the fixed carbon dioxide out of a hydrogencarbonate, and it bubbles off.',
    ['carbon-dioxide', 'sodium-ethanoate'], [['ethanoic-acid', 'sodium-hydrogencarbonate']], ['water'], ['ethanol', 'sodium-hydroxide']],
  ['A stronger acid takes the salt back, and the weak acid is free again.',
    'A strong acid hands its hydrogen over, and the salt (ends in COONa) turns back into its own acid.',
    ['ethanoic-acid'], [['sodium-ethanoate', 'hydrochloric-acid']], ['water'], ['sodium-hydroxide', 'ethanol']],
  ['Ammonia has no hydroxide at all, so this one makes no water.',
    'Ammonia is a base. An acid hands its hydrogen to it, and there is nothing left over.',
    ['ammonium-ethanoate'], [['ethanoic-acid', 'ammonia']], ['water', 'ethanol'], ['sodium-hydroxide', 'propanol']],
  ['Quicklime takes both of the acid’s hydrogens, one for each of its own.',
    'Lime is a base with two hydroxides to give. One acid can only reach one of them.',
    ['calcium-hydroxyethanoate'], [['ethanoic-acid', 'calcium-hydroxide']], ['water'], ['sodium-hydroxide', 'ethanol']],
  // ---- two steps ----
  ['Make the alcohol first, then let oxygen have it.',
    'A double bond takes on a small molecule. Oxygen turns an alcohol into an acid.',
    ['ethanoic-acid'], [['ethene', 'water'], ['ethanol', 'oxygen']], [], ['hydrogen', 'hydrochloric-acid']],
  ['Two reactions to make what the third one needs. Chemists call that a synthesis.',
    'Make an alcohol and an acid (ends in COOH) first, then join them. A strong acid turns a salt (ends in COONa) back into its acid.',
    ['ethyl-ethanoate'], [['ethene', 'water'], ['sodium-ethanoate', 'hydrochloric-acid'], ['ethanol', 'ethanoic-acid']],
    ['hydrogen'], ['bromine', 'sodium-hydroxide']],
  ['From ethene all the way to the smell of pear drops.',
    'A double bond takes on water. Oxygen turns an alcohol into an acid. An alcohol and an acid make an ester.',
    ['ethyl-ethanoate'], [['ethene', 'water'], ['ethanol', 'oxygen'], ['ethanol', 'ethanoic-acid']],
    ['ethene', 'water'], ['hydrogen', 'bromine']],
  ['Make the ester, then let alkali take it apart: what comes back is the salt, not the acid.',
    'An alcohol and an acid make an ester. Alkali splits an ester into the alcohol and a salt of the acid.',
    ['sodium-propanoate'], [['propanol', 'propanoic-acid'], ['propyl-propanoate', 'sodium-hydroxide']],
    ['water'], ['ethanol', 'oxygen']],
  ['Swap the halogen for an OH, then let oxygen finish the job.',
    'Alkali puts an OH back on the end of a chain. Oxygen turns an alcohol into an acid.',
    ['propanoic-acid'], [['chloropropane', 'sodium-hydroxide'], ['propanol', 'oxygen']], ['water'], ['ethanol', 'hydrochloric-acid']],
  ['Make the acid, then make its salt fizz.',
    'Oxygen turns an alcohol into an acid. An acid takes the carbon dioxide out of a hydrogencarbonate.',
    ['carbon-dioxide'], [['methanol', 'oxygen'], ['methanoic-acid', 'sodium-hydrogencarbonate']], ['water'], ['ethanol', 'sodium-hydroxide']],
  ['Split the ester, then put one half to work.',
    'Water splits an ester into an alcohol and an acid. Oxygen turns an alcohol into an acid.',
    ['ethanoic-acid', 'methanoic-acid'], [['methyl-ethanoate', 'water'], ['methanol', 'oxygen']], ['water'], ['propanol', 'oxygen']],
  ['Two alcohols on the bench and only one acid: only one of the esters can be made.',
    'An alcohol and an acid join into an ester. Read which alcohol the one you need was made from.',
    ['methyl-ethanoate'], [['methanol', 'ethanoic-acid']], ['ethanol', 'water'], ['oxygen', 'propanol']],
  ['Two chains, two esters, and only one of each alcohol.',
    'The alcohol gives the ester its first name, the acid its last.',
    ['methyl-ethanoate', 'ethyl-methanoate'], [['methanol', 'ethanoic-acid'], ['ethanol', 'methanoic-acid']],
    ['water'], ['propanol', 'oxygen']],
  // ---- three steps and more ----
  ['Everything the double bond can do, in one bench.',
    'A double bond takes on a small molecule, half on each carbon. Alkali swaps a halogen for an OH.',
    ['propanol', 'dibromopropane'], [['propene', 'hydrobromic-acid'], ['bromopropane', 'sodium-hydroxide'], ['propene', 'bromine']],
    ['water'], ['hydrogen', 'ethene']],
  ['Make the alcohol, make the acid, then join them: the long way to an ester.',
    'A double bond takes on water. Oxygen turns an alcohol into an acid. An alcohol and an acid join into an ester.',
    ['propyl-propanoate'], [['propene', 'water'], ['propanol', 'oxygen'], ['propene', 'water'], ['propanol', 'propanoic-acid']],
    ['oxygen'], ['hydrogen', 'ethene']],
  ['One alcohol, two different acids, and the esters they make.',
    'An alcohol and an acid join into an ester and give off water. Oxygen makes an acid out of an alcohol.',
    ['ethyl-ethanoate', 'ethyl-methanoate'], [['ethanol', 'ethanoic-acid'], ['methanol', 'oxygen'], ['ethanol', 'methanoic-acid']],
    ['ethanol'], ['water', 'oxygen']],
  ['The acid you need is locked up in a salt.',
    'A strong acid turns a salt (ends in COONa) back into its own acid. An alcohol and an acid make an ester.',
    ['propyl-ethanoate'], [['sodium-ethanoate', 'hydrochloric-acid'], ['propanol', 'ethanoic-acid']], ['water'], ['ethanol', 'oxygen']],
  ['Take the ester apart with alkali and put the pieces back together differently.',
    'Alkali splits an ester into an alcohol and a salt. A strong acid frees the acid from the salt.',
    ['methyl-ethanoate'], [['ethyl-ethanoate', 'sodium-hydroxide'], ['sodium-ethanoate', 'hydrochloric-acid'], ['methanol', 'ethanoic-acid']],
    ['propanol'], ['oxygen', 'hydrobromic-acid']],
  ['Two chains at once, and nothing to spare.',
    'Oxygen turns an alcohol into an acid. An alcohol and an acid join into an ester.',
    ['propyl-methanoate', 'water'], [['methanol', 'oxygen'], ['propanol', 'methanoic-acid']], [], ['ethanol', 'oxygen']],
  ['Start at the double bond and finish at the fizz.',
    'A double bond takes on water. Oxygen makes an acid. An acid takes the carbon dioxide out of a hydrogencarbonate.',
    ['carbon-dioxide', 'sodium-ethanoate'], [['ethene', 'water'], ['ethanol', 'oxygen'], ['ethanoic-acid', 'sodium-hydrogencarbonate']],
    [], ['hydrogen', 'bromine']],
  ['Everything you have learned, in one bench.',
    'A double bond takes on a small molecule. Oxygen makes an acid out of an alcohol. An alcohol and an acid make an ester.',
    ['ethyl-ethanoate', 'dibromoethane'], [['ethene', 'water'], ['ethanol', 'oxygen'], ['ethene', 'water'], ['ethanol', 'ethanoic-acid'], ['ethene', 'bromine']],
    [], ['hydrogen', 'hydrochloric-acid']],
];

/* A bench needs a wrong pair that costs you the win, or there is nothing to
   get wrong. Where a lesson's own molecules cannot make one, one more decoy
   can: the first of each pair goes on the phone's bench, the second on the
   desktop's, because the desktop's extra molecules sometimes give a way back.
   tests.mjs checks every bench has its wrong pair. */
const CARBON_TRAPS = [
  [null, null],
  [null, null],
  [null, null],
  [null, null],
  [null, null],
  [null, null],
  [null, 'methanol'],
  [null, null],
  [null, 'sodium-hydroxide'],
  [null, null],
  ['hydrochloric-acid', null],
  ['sodium-hydroxide', null],
  [null, null],
  ['sodium-hydroxide', null],
  ['sodium-hydroxide', null],
  ['sodium-hydroxide', 'sodium-hydroxide'],
  ['potassium-hydroxide', null],
  ['sodium-hydroxide', null],
  ['potassium-hydroxide', null],
  ['sodium-hydroxide', null],
  ['sodium-hydroxide', null],
  ['sodium-hydroxide', null],
  ['sodium-hydroxide', null],
  ['hydrochloric-acid', null],
  [null, null],
  ['methanol', 'methanol'],
  ['potassium-hydroxide', 'hydrochloric-acid'],
  ['hydrochloric-acid', null],
  ['sodium-hydroxide', null],
  ['sodium-hydroxide', 'sodium-hydroxide'],
  ['sodium-hydroxide', null],
  ['sodium-hydroxide', null],
  ['chlorine', null],
  ['hydrochloric-acid', null],
  [null, 'hydrochloric-acid'],
  [null, null],
  ['ethene', null],
  [null, null],
  ['sodium-hydroxide', null],
  ['hydrochloric-acid', null],
];

let carbonLadder = null;
function carbonRungs() {
  if (!carbonLadder) {
    carbonLadder = { mobile: [], desktop: [] };
    CARBON.forEach(([note, clue, targets, route, phone, more], i) => {
      const trap = CARBON_TRAPS[i] || [];
      carbonLadder.mobile.push(bench(note, targets, route, [...phone, ...(trap[0] ? [trap[0]] : [])], 91 + i, clue));
      carbonLadder.desktop.push(bench(note, targets, route, [...phone, ...(more || []), ...(trap[1] ? [trap[1]] : [])], 251 + i, clue));
    });
  }
  return carbonLadder;
}
const organic = { get mobile() { return carbonRungs().mobile; }, get desktop() { return carbonRungs().desktop; } };

return { mobile, desktop, withoutCrowd, withCrowd, crowdOf, lab, organic };
}));
