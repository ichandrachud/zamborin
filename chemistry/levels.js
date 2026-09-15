/* ============================================================
   Lessons in Chemistry · levels

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
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChemLevels = api;
}(typeof self !== 'undefined' ? self : this, function () {
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

const mobile = [
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

const desktop = [
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

/* ---------- CHAPTER 2: REACTIONS ----------
   The dish holds whole molecules; the tube reacts two at a time (lab.js).
   `dish` is what floats at the start. `solution` is one way through, as
   [where, molecule] steps, where is 'tube', 'dish' or 'beaker' and the
   molecule is taken from the tray first, then the dish; tests.mjs plays it.
   Desktop dishes carry a decoy or two more than phones. */
const R = (targets, dish, seed, note, solution, clue) => ({ targets, dish, seed, note, solution, clue });
const lab = {
  mobile: [
    R([['sodium-chloride', 1]], ['hydrochloric-acid', 'sodium-hydroxide', 'water'], 31,
      'An acid and a base make a salt and water.',
      [['tube', 'hydrochloric-acid'], ['tube', 'sodium-hydroxide'], ['beaker', 'sodium-chloride']]),
    R([['calcium-sulphate', 1]], ['sulphuric-acid', 'hydrochloric-acid', 'calcium-hydroxide', 'water', 'sodium-chloride'], 32,
      'Sulphuric acid and calcium hydroxide make calcium sulphate, and two waters.',
      [['tube', 'sulphuric-acid'], ['tube', 'calcium-hydroxide'], ['beaker', 'calcium-sulphate']]),
    R([['calcium-chloride', 1]], ['hydrochloric-acid', 'hydrochloric-acid', 'calcium-hydroxide', 'sulphuric-acid', 'water'], 33,
      'An acid takes one hydroxide at a time. The basic salt in between is half done.',
      [['tube', 'hydrochloric-acid'], ['tube', 'calcium-hydroxide'], ['tube', 'calcium-hydroxychloride'], ['tube', 'hydrochloric-acid'], ['beaker', 'calcium-chloride']]),
    R([['sodium-sulphate', 1]], ['sulphuric-acid', 'sodium-hydroxide', 'sodium-hydroxide', 'hydrochloric-acid', 'water'], 34,
      'Sulphuric acid has two hydrogens to give, so it takes two sodium hydroxides.',
      [['tube', 'sulphuric-acid'], ['tube', 'sodium-hydroxide'], ['tube', 'sodium-hydrogen-sulphate'], ['tube', 'sodium-hydroxide'], ['beaker', 'sodium-sulphate']]),
    R([['calcium-sulphate', 1], ['sodium-chloride', 1]], ['sulphuric-acid', 'calcium-hydroxychloride', 'sodium-hydroxide', 'water', 'sodium-nitrate'], 35,
      'The acid you need can come out of the first reaction.',
      [['tube', 'sulphuric-acid'], ['tube', 'calcium-hydroxychloride'], ['beaker', 'calcium-sulphate'], ['tube', 'hydrochloric-acid'], ['tube', 'sodium-hydroxide'], ['beaker', 'sodium-chloride']]),
    R([['ammonium-nitrate', 1]], ['ammonium-chloride', 'sodium-hydroxide', 'nitric-acid', 'hydrochloric-acid', 'water'], 36,
      'Sodium hydroxide drives ammonia out of its salt. Catch the gas before the next reaction pours it away.',
      [['tube', 'ammonium-chloride'], ['tube', 'sodium-hydroxide'], ['dish', 'ammonia'], ['tube', 'ammonia'], ['tube', 'nitric-acid'], ['beaker', 'ammonium-nitrate']]),
    R([['calcium-hydroxide', 1], ['sodium-chloride', 1]], ['calcium-oxide', 'hydrochloric-acid', 'sodium-hydroxide', 'sodium-nitrate'], 37,
      'Quicklime and water make slaked lime. The water came from the first reaction.',
      [['tube', 'hydrochloric-acid'], ['tube', 'sodium-hydroxide'], ['beaker', 'sodium-chloride'], ['dish', 'water'], ['tube', 'calcium-oxide'], ['tube', 'water'], ['beaker', 'calcium-hydroxide']]),
  ],
  desktop: [
    R([['sodium-chloride', 1]], ['hydrochloric-acid', 'sodium-hydroxide', 'water', 'nitric-acid'], 41,
      'An acid and a base make a salt and water.',
      [['tube', 'hydrochloric-acid'], ['tube', 'sodium-hydroxide'], ['beaker', 'sodium-chloride']]),
    R([['calcium-sulphate', 1]], ['sulphuric-acid', 'hydrochloric-acid', 'nitric-acid', 'calcium-hydroxide', 'water', 'sodium-chloride', 'sodium-nitrate'], 42,
      'Sulphuric acid and calcium hydroxide make calcium sulphate, and two waters.',
      [['tube', 'sulphuric-acid'], ['tube', 'calcium-hydroxide'], ['beaker', 'calcium-sulphate']]),
    R([['calcium-chloride', 1]], ['hydrochloric-acid', 'hydrochloric-acid', 'calcium-hydroxide', 'sulphuric-acid', 'nitric-acid', 'water', 'sodium-chloride'], 43,
      'An acid takes one hydroxide at a time. The basic salt in between is half done.',
      [['tube', 'hydrochloric-acid'], ['tube', 'calcium-hydroxide'], ['tube', 'calcium-hydroxychloride'], ['tube', 'hydrochloric-acid'], ['beaker', 'calcium-chloride']]),
    R([['sodium-sulphate', 1]], ['sulphuric-acid', 'sodium-hydroxide', 'sodium-hydroxide', 'hydrochloric-acid', 'nitric-acid', 'water', 'sodium-chloride'], 44,
      'Sulphuric acid has two hydrogens to give, so it takes two sodium hydroxides.',
      [['tube', 'sulphuric-acid'], ['tube', 'sodium-hydroxide'], ['tube', 'sodium-hydrogen-sulphate'], ['tube', 'sodium-hydroxide'], ['beaker', 'sodium-sulphate']]),
    R([['calcium-sulphate', 1], ['sodium-chloride', 1]], ['sulphuric-acid', 'calcium-hydroxychloride', 'sodium-hydroxide', 'water', 'sodium-nitrate', 'nitric-acid', 'calcium-chloride'], 45,
      'The acid you need can come out of the first reaction.',
      [['tube', 'sulphuric-acid'], ['tube', 'calcium-hydroxychloride'], ['beaker', 'calcium-sulphate'], ['tube', 'hydrochloric-acid'], ['tube', 'sodium-hydroxide'], ['beaker', 'sodium-chloride']]),
    R([['ammonium-nitrate', 1]], ['ammonium-chloride', 'sodium-hydroxide', 'nitric-acid', 'hydrochloric-acid', 'water', 'sodium-chloride', 'sodium-nitrate'], 46,
      'Sodium hydroxide drives ammonia out of its salt. Catch the gas before the next reaction pours it away.',
      [['tube', 'ammonium-chloride'], ['tube', 'sodium-hydroxide'], ['dish', 'ammonia'], ['tube', 'ammonia'], ['tube', 'nitric-acid'], ['beaker', 'ammonium-nitrate']]),
    R([['calcium-hydroxide', 1], ['sodium-chloride', 1]], ['calcium-oxide', 'hydrochloric-acid', 'sodium-hydroxide', 'sodium-nitrate', 'nitric-acid', 'calcium-chloride'], 47,
      'Quicklime and water make slaked lime. The water came from the first reaction.',
      [['tube', 'hydrochloric-acid'], ['tube', 'sodium-hydroxide'], ['beaker', 'sodium-chloride'], ['dish', 'water'], ['tube', 'calcium-oxide'], ['tube', 'water'], ['beaker', 'calcium-hydroxide']]),
  ],
};

/* ---------- CHAPTER 3: ORGANIC ----------
   The same bench, carbon chemistry. One reaction a level at first, then a
   synthesis: two reactions to make what the third one needs. */
const organic = {
  mobile: [
    R([['ethane', 1]], ['ethene', 'hydrogen', 'water'], 51,
      'The double bond in ethene opens up and takes a hydrogen on each carbon.',
      [['tube', 'ethene'], ['tube', 'hydrogen'], ['beaker', 'ethane']],
      'The two sticks between the carbons are a double bond. It can open up and take on a small molecule, half on each carbon.'),
    R([['dibromoethane', 1]], ['ethene', 'bromine', 'water', 'carbon-dioxide'], 52,
      'Orange bromine turns colourless when it meets a double bond. That is how chemists test for one.',
      [['tube', 'ethene'], ['tube', 'bromine'], ['beaker', 'dibromoethane']],
      'A double bond opens up and takes on a small molecule, half on each carbon. Count the atoms in what you need.'),
    R([['ethanol', 1]], ['ethene', 'water', 'hydrogen', 'hydrochloric-acid'], 53,
      'Ethene and steam make ethanol. Most of the alcohol industry uses is made this way.',
      [['tube', 'ethene'], ['tube', 'water'], ['beaker', 'ethanol']],
      'A double bond takes on a small molecule, half on each carbon. Count the atoms: which one gives C₂H₅OH?'),
    R([['ethyl-ethanoate', 1]], ['ethanol', 'ethanoic-acid', 'sodium-hydroxide', 'water'], 54,
      'An alcohol and an acid make an ester, and esters smell of fruit. This one smells of pear drops.',
      [['tube', 'ethanol'], ['tube', 'ethanoic-acid'], ['beaker', 'ethyl-ethanoate']],
      'An alcohol (ends in OH) and an acid (ends in COOH) join into an ester, and give off water.'),
    R([['ethanoic-acid', 1]], ['ethanol', 'oxygen', 'water', 'hydrochloric-acid'], 55,
      'Oxygen turns ethanol into ethanoic acid. That is why an open bottle of wine turns to vinegar.',
      [['tube', 'ethanol'], ['tube', 'oxygen'], ['beaker', 'ethanoic-acid']],
      'Oxygen turns an alcohol (ends in OH) into an acid (ends in COOH).'),
    R([['ethyl-ethanoate', 1]], ['ethene', 'water', 'sodium-ethanoate', 'hydrochloric-acid', 'hydrogen'], 56,
      'Two reactions to make what the third one needs. Chemists call that a synthesis.',
      [['tube', 'ethene'], ['tube', 'water'], ['dish', 'ethanol'], ['tube', 'sodium-ethanoate'], ['tube', 'hydrochloric-acid'],
       ['dish', 'ethanoic-acid'], ['tube', 'ethanol'], ['tube', 'ethanoic-acid'], ['beaker', 'ethyl-ethanoate']],
      'Make an alcohol and an acid (ends in COOH) first, then join them. A strong acid turns a salt (ends in COONa) back into its acid.'),
  ],
  desktop: [
    R([['ethane', 1]], ['ethene', 'hydrogen', 'water', 'carbon-dioxide'], 61,
      'The double bond in ethene opens up and takes a hydrogen on each carbon.',
      [['tube', 'ethene'], ['tube', 'hydrogen'], ['beaker', 'ethane']],
      'The two sticks between the carbons are a double bond. It can open up and take on a small molecule, half on each carbon.'),
    R([['dibromoethane', 1]], ['ethene', 'bromine', 'water', 'carbon-dioxide', 'hydrogen'], 62,
      'Orange bromine turns colourless when it meets a double bond. That is how chemists test for one.',
      [['tube', 'ethene'], ['tube', 'bromine'], ['beaker', 'dibromoethane']],
      'A double bond opens up and takes on a small molecule, half on each carbon. Count the atoms in what you need.'),
    R([['ethanol', 1]], ['ethene', 'water', 'hydrogen', 'hydrochloric-acid', 'carbon-dioxide'], 63,
      'Ethene and steam make ethanol. Most of the alcohol industry uses is made this way.',
      [['tube', 'ethene'], ['tube', 'water'], ['beaker', 'ethanol']],
      'A double bond takes on a small molecule, half on each carbon. Count the atoms: which one gives C₂H₅OH?'),
    R([['ethyl-ethanoate', 1]], ['ethanol', 'ethanoic-acid', 'sodium-hydroxide', 'water', 'oxygen'], 64,
      'An alcohol and an acid make an ester, and esters smell of fruit. This one smells of pear drops.',
      [['tube', 'ethanol'], ['tube', 'ethanoic-acid'], ['beaker', 'ethyl-ethanoate']],
      'An alcohol (ends in OH) and an acid (ends in COOH) join into an ester, and give off water.'),
    R([['ethanoic-acid', 1]], ['ethanol', 'oxygen', 'water', 'carbon-dioxide', 'hydrochloric-acid'], 65,
      'Oxygen turns ethanol into ethanoic acid. That is why an open bottle of wine turns to vinegar.',
      [['tube', 'ethanol'], ['tube', 'oxygen'], ['beaker', 'ethanoic-acid']],
      'Oxygen turns an alcohol (ends in OH) into an acid (ends in COOH).'),
    R([['ethyl-ethanoate', 1]], ['ethene', 'water', 'sodium-ethanoate', 'hydrochloric-acid', 'hydrogen', 'sodium-hydroxide'], 66,
      'Two reactions to make what the third one needs. Chemists call that a synthesis.',
      [['tube', 'ethene'], ['tube', 'water'], ['dish', 'ethanol'], ['tube', 'sodium-ethanoate'], ['tube', 'hydrochloric-acid'],
       ['dish', 'ethanoic-acid'], ['tube', 'ethanol'], ['tube', 'ethanoic-acid'], ['beaker', 'ethyl-ethanoate']],
      'Make an alcohol and an acid (ends in COOH) first, then join them. A strong acid turns a salt (ends in COONa) back into its acid.'),
  ],
};

return { mobile, desktop, withoutCrowd, withCrowd, crowdOf, lab, organic };
}));
