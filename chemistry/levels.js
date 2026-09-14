/* ============================================================
   Lessons in Chemistry · levels

   From the owner's sketch, 2026-09-14: an open dish with free radicals
   floating in it, targets listed at the top, and a set number of atoms in
   the Available panel. Some radicals are what a target needs (iron for iron
   chloride); the rest are waiting to grab whatever comes near (a hydrogen
   that meets a chlorine makes hydrogen chloride, and the iron chloride that
   chlorine was for is lost).

   `dish` is what floats in the dish at the start, scattered by `seed`.
   `avail` is the panel. Every level has exactly the atoms its targets need,
   plus the radicals that get in the way; tests.mjs checks nothing is lost
   before the first move. Phone and desktop get their own sets: the desktop
   dish is bigger and carries more trouble.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChemLevels = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const mobile = [
  { targets: [['water', 1]], avail: { H: 2 }, dish: ['O'], seed: 11,
    note: 'Every atom has hands, and every hand wants a friend.' },
  { targets: [['water', 1]], avail: { H: 2 }, dish: ['O', 'Na'], seed: 12,
    note: 'A free hand grabs the first hand it touches.' },
  { targets: [['iron-chloride', 1]], avail: { Cl: 3 }, dish: ['Fe', 'H', 'H'], seed: 13,
    note: 'A hydrogen will take a chlorine before the iron gets it.' },
  { targets: [['iron-chloride', 1], ['water', 1]], avail: { Cl: 3, H: 1 }, dish: ['Fe', 'O', 'H', 'Na'], seed: 14,
    note: 'Use a hydrogen before a chlorine finds it.' },
  { targets: [['calcium-chloride', 1], ['salt', 1]], avail: { Cl: 2 }, dish: ['Ca', 'Na', 'Cl', 'H'], seed: 15,
    note: 'Two chlorines that touch become chlorine gas.' },
  { targets: [['magnesium-oxide', 1], ['salt', 2]], avail: { Cl: 1, Na: 1 }, dish: ['Mg', 'O', 'Na', 'Cl', 'H'], seed: 16,
    note: 'Oxygen holds magnesium with both hands.' },
  { targets: [['iron-chloride', 1], ['calcium-chloride', 1], ['water', 1]], avail: { Cl: 4 },
    dish: ['Fe', 'Ca', 'O', 'H', 'H', 'Na', 'Cl'], seed: 17,
    note: 'Every atom you were given has a place. Find it before something else does.' },
];

const desktop = [
  { targets: [['water', 1]], avail: { H: 2 }, dish: ['O'], seed: 21,
    note: 'Every atom has hands, and every hand wants a friend.' },
  { targets: [['water', 2]], avail: { H: 4 }, dish: ['O', 'O', 'Na'], seed: 22,
    note: 'Two oxygens that touch hold each other with both hands, and nobody asked for oxygen gas.' },
  { targets: [['iron-chloride', 1]], avail: { Cl: 3 }, dish: ['Fe', 'H', 'H', 'Na'], seed: 23,
    note: 'A hydrogen will take a chlorine before the iron gets it.' },
  { targets: [['iron-chloride', 1], ['water', 1]], avail: { Cl: 3, H: 1 }, dish: ['Fe', 'O', 'H', 'Na', 'Ca'], seed: 24,
    note: 'Use a hydrogen before a chlorine finds it.' },
  { targets: [['calcium-chloride', 1], ['salt', 2]], avail: { Cl: 3, Na: 1 }, dish: ['Ca', 'Na', 'Cl', 'H', 'H'], seed: 25,
    note: 'Two chlorines that touch become chlorine gas.' },
  { targets: [['magnesium-oxide', 1], ['salt', 2]], avail: { Cl: 1, Na: 1 }, dish: ['Mg', 'O', 'Na', 'Cl', 'H', 'Fe'], seed: 26,
    note: 'Oxygen holds magnesium with both hands.' },
  { targets: [['iron-chloride', 1], ['calcium-chloride', 1], ['water', 1]], avail: { Cl: 4 },
    dish: ['Fe', 'Ca', 'O', 'H', 'H', 'Na', 'Cl', 'Mg'], seed: 27,
    note: 'Every atom you were given has a place. Find it before something else does.' },
];

return { mobile, desktop };
}));
