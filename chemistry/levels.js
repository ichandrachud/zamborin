/* ============================================================
   Lessons in Chemistry · levels, written by hand

   The owner, 2026-09-13, after playing the first seven: "there is only one
   possible answer on the board and there is not too much penalty for where you
   place the atom". So the dish now starts crowded with free radicals: the
   atoms a molecule needs (iron for iron chloride) and ones waiting to pounce
   on whatever lands beside them (hydrogen, sodium, calcium). A chlorine that
   lands beside a hydrogen makes hydrogen chloride, and the iron chloride it
   was meant for is lost.

   Two sets, because the phone dish is 5 x 6 and the desktop dish is 8 x 6.

   `pre` is what is on the dish at the start. No two atoms with free hands may
   start side by side (they would clasp at once); tests.mjs checks it.
   `solution` is a cell for every atom in supply order that makes every
   molecule, with the radicals held still. tests.mjs replays it. It proves a
   level can be won; it says nothing about how hard it is.

   Coordinates are [column, row] from the top left.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChemLevels = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const LESSONS = {
  1: { name: 'Hands', sentence: 'Every atom has hands, and every hand wants a friend.' },
  2: { name: 'Free radicals', sentence: 'A free hand grabs the first hand it touches, right or wrong.' },
};

const at = (el, c, r) => ({ el, c, r });

const mobile = [
  { // 1 · the first clasp: an oxygen is already there, reaching
    lesson: 1, dish: [5, 6],
    targets: [['water', 1]],
    pre: [at('O', 2, 2)],
    supply: ['H', 'H'],
    solution: [[1, 2], [3, 2]],
  },
  { // 2 · a sodium waits above and to the right of the oxygen
    lesson: 1, dish: [5, 6],
    targets: [['water', 1]],
    pre: [at('O', 1, 2), at('Na', 2, 1), at('Na', 3, 4)],
    supply: ['H', 'H'],
    solution: [[0, 2], [1, 3]],
  },
  { // 3 · iron wants three chlorines; the hydrogen will take one if it can
    lesson: 2, dish: [5, 6],
    targets: [['iron-chloride', 1]],
    pre: [at('Fe', 2, 2), at('H', 3, 3), at('Na', 0, 4), at('H', 4, 0)],
    supply: ['Cl', 'Cl', 'Cl'],
    solution: [[2, 1], [1, 2], [2, 3]],
  },
  { // 4 · only two safe sides: spend the spare hydrogen on the sodium
    lesson: 2, dish: [5, 6],
    targets: [['iron-chloride', 1]],
    pre: [at('Fe', 2, 2), at('H', 3, 3), at('Na', 1, 1)],
    supply: ['Cl', 'Cl', 'H', 'Cl'],
    solution: [[2, 1], [2, 3], [0, 1], [1, 2]],
  },
  { // 5 · salt: now the irons are the ones that pounce
    lesson: 2, dish: [5, 6],
    targets: [['salt', 2]],
    pre: [at('Na', 1, 1), at('Na', 3, 4), at('Fe', 2, 2), at('Fe', 4, 2), at('H', 0, 4)],
    supply: ['Cl', 'H', 'Cl'],
    solution: [[0, 1], [0, 5], [2, 4]],
  },
  { // 6 · iron chloride and salt, one hydrogen in the way
    lesson: 2, dish: [5, 6],
    targets: [['iron-chloride', 1], ['salt', 1]],
    pre: [at('Fe', 1, 2), at('Na', 3, 4), at('H', 2, 1)],
    supply: ['Cl', 'Cl', 'H', 'Cl', 'Cl'],
    solution: [[0, 2], [1, 3], [3, 1], [2, 2], [3, 3]],
  },
  { // 7 · three molecules, one hydrogen between them all
    lesson: 2, dish: [5, 6],
    targets: [['iron-chloride', 1], ['calcium-chloride', 1], ['salt', 1]],
    pre: [at('Fe', 1, 1), at('Ca', 3, 3), at('Na', 0, 4), at('H', 2, 2)],
    supply: ['Cl', 'Cl', 'Cl', 'H', 'Cl', 'Cl', 'Cl'],
    solution: [[1, 0], [0, 1], [1, 2], [2, 1], [3, 2], [3, 4], [1, 4]],
  },
];

const desktop = [
  { // 1 · the first clasp
    lesson: 1, dish: [8, 6],
    targets: [['water', 1]],
    pre: [at('O', 3, 2)],
    supply: ['H', 'H'],
    solution: [[2, 2], [4, 2]],
  },
  { // 2 · two waters, and a sodium beside each oxygen
    lesson: 1, dish: [8, 6],
    targets: [['water', 2]],
    pre: [at('O', 1, 2), at('O', 5, 3), at('Na', 2, 1), at('Na', 6, 2)],
    supply: ['H', 'H', 'H', 'H'],
    solution: [[0, 2], [1, 3], [5, 4], [4, 3]],
  },
  { // 3 · iron wants three chlorines; the hydrogen will take one if it can
    lesson: 2, dish: [8, 6],
    targets: [['iron-chloride', 1]],
    pre: [at('Fe', 3, 2), at('H', 4, 3), at('Na', 6, 1), at('H', 1, 4)],
    supply: ['Cl', 'Cl', 'Cl'],
    solution: [[3, 1], [2, 2], [3, 3]],
  },
  { // 4 · two irons, two safe sides each, and two spare hydrogens to spend
    lesson: 2, dish: [8, 6],
    targets: [['iron-chloride', 2]],
    pre: [at('Fe', 2, 2), at('Fe', 5, 3), at('H', 3, 3), at('Na', 1, 1), at('Na', 6, 2)],
    supply: ['Cl', 'Cl', 'H', 'Cl', 'Cl', 'H', 'Cl', 'Cl'],
    solution: [[2, 1], [2, 3], [0, 1], [1, 2], [5, 4], [7, 2], [4, 3], [5, 2]],
  },
  { // 5 · salt three times: the irons pounce now
    lesson: 2, dish: [8, 6],
    targets: [['salt', 3]],
    pre: [at('Na', 1, 1), at('Na', 4, 4), at('Na', 6, 1), at('Fe', 2, 2), at('Fe', 5, 3), at('H', 3, 0)],
    supply: ['Cl', 'Cl', 'H', 'Cl'],
    solution: [[1, 2], [4, 5], [4, 0], [6, 2]],
  },
  { // 6 · iron chloride, calcium chloride and salt, with two hydrogens loose
    lesson: 2, dish: [8, 6],
    targets: [['iron-chloride', 1], ['calcium-chloride', 1], ['salt', 1]],
    pre: [at('Fe', 1, 1), at('Ca', 4, 3), at('Na', 6, 1), at('H', 2, 2), at('H', 5, 2)],
    supply: ['Cl', 'Cl', 'H', 'Cl', 'Cl', 'Cl', 'Cl'],
    solution: [[1, 0], [0, 1], [3, 2], [1, 2], [4, 4], [3, 3], [6, 2]],
  },
  { // 7 · two irons and a salt, a calcium in the corner
    lesson: 2, dish: [8, 6],
    targets: [['iron-chloride', 2], ['salt', 1]],
    pre: [at('Fe', 1, 2), at('Fe', 5, 2), at('Na', 3, 4), at('H', 2, 1), at('H', 6, 3), at('Ca', 4, 0)],
    supply: ['Cl', 'Cl', 'H', 'Cl', 'Cl', 'Cl', 'Cl', 'Cl'],
    solution: [[0, 2], [1, 3], [2, 0], [1, 1], [5, 1], [5, 3], [4, 2], [3, 3]],
  },
];

return { LESSONS, mobile, desktop };
}));
