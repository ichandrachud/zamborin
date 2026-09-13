/* ============================================================
   Lessons in Chemistry · M1 levels, written by hand

   Seven per layout, lessons 1 and 2, as the brief's grey box asks. Two sets,
   because the phone dish is 5 x 6 and the desktop dish is 8 x 6, and one
   board reflowed into the other frame is one game in two frames (house rule).

   Each level carries `solution`: the cell for every atom in supply order,
   placed with zero waste. tests.mjs replays every one through the model. It is
   proof the level can be finished, NOT a measurement of how hard it is. The
   generator, the certifier and the bots are M2, after the owner's still frame.

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
  2: { name: 'Nothing is wasted', sentence: 'Atoms are never lost or made. Use every one.' },
};

const mobile = [
  { // 1 · the first clasp. An oxygen is already there, reaching.
    lesson: 1, dish: [5, 6],
    targets: [['water', 1]],
    pre: [{ el: 'O', c: 2, r: 2 }],
    supply: ['H', 'H'],
    solution: [[1, 2], [3, 2]],
  },
  { // 2 · two hydrogens are a molecule too
    lesson: 1, dish: [5, 6],
    targets: [['hydrogen-gas', 1], ['water', 1]],
    supply: ['H', 'H', 'O', 'H', 'H'],
    solution: [[1, 1], [2, 1], [2, 3], [1, 3], [3, 3]],
  },
  { // 3 · three hands
    lesson: 1, dish: [5, 6],
    targets: [['ammonia', 1], ['water', 1]],
    supply: ['N', 'H', 'H', 'H', 'O', 'H', 'H'],
    solution: [[1, 2], [1, 1], [0, 2], [1, 3], [3, 2], [3, 1], [3, 3]],
  },
  { // 4 · four hands
    lesson: 1, dish: [5, 6],
    targets: [['methane', 1], ['water', 1]],
    supply: ['C', 'H', 'H', 'H', 'H', 'O', 'H', 'H'],
    solution: [[2, 2], [2, 1], [3, 2], [2, 3], [1, 2], [2, 2], [2, 1], [2, 3]],
  },
  { // 5 · the nitrogen arrives while the water is half made: keep them apart
    lesson: 1, dish: [5, 6],
    targets: [['water', 2], ['ammonia', 1]],
    supply: ['O', 'H', 'N', 'H', 'H', 'H', 'H', 'O', 'H', 'H'],
    solution: [[1, 1], [0, 1], [3, 1], [1, 2], [3, 2], [4, 1], [3, 0], [1, 1], [1, 0], [1, 2]],
  },
  { // 6 · three oxygens first, and no two may touch
    lesson: 2, dish: [5, 6],
    targets: [['water', 3]],
    supply: ['O', 'O', 'O', 'H', 'H', 'H', 'H', 'H', 'H'],
    solution: [[1, 1], [3, 1], [2, 3], [1, 0], [0, 1], [3, 0], [4, 1], [2, 2], [2, 4]],
  },
  { // 7 · dress an oxygen before another one reaches it
    lesson: 2, dish: [5, 6],
    targets: [['hydrogen-peroxide', 1], ['water', 1]],
    supply: ['O', 'O', 'H', 'H', 'O', 'H', 'H'],
    solution: [[1, 1], [3, 3], [0, 1], [3, 4], [2, 1], [2, 0], [3, 2]],
  },
];

const desktop = [
  { // 1 · the first clasp
    lesson: 1, dish: [8, 6],
    targets: [['water', 1]],
    pre: [{ el: 'O', c: 3, r: 2 }],
    supply: ['H', 'H'],
    solution: [[2, 2], [4, 2]],
  },
  { // 2 · two hydrogens are a molecule too
    lesson: 1, dish: [8, 6],
    targets: [['hydrogen-gas', 1], ['water', 2]],
    supply: ['H', 'H', 'O', 'H', 'H', 'O', 'H', 'H'],
    solution: [[1, 1], [2, 1], [2, 3], [1, 3], [3, 3], [5, 2], [5, 1], [5, 3]],
  },
  { // 3 · three hands
    lesson: 1, dish: [8, 6],
    targets: [['ammonia', 1], ['water', 2]],
    supply: ['N', 'H', 'H', 'H', 'O', 'H', 'H', 'O', 'H', 'H'],
    solution: [[2, 2], [2, 1], [1, 2], [2, 3], [5, 2], [5, 1], [5, 3], [2, 2], [2, 1], [2, 3]],
  },
  { // 4 · four hands
    lesson: 1, dish: [8, 6],
    targets: [['methane', 1], ['water', 1], ['hydrogen-gas', 1]],
    supply: ['C', 'H', 'H', 'H', 'H', 'O', 'H', 'H', 'H', 'H'],
    solution: [[2, 2], [2, 1], [3, 2], [2, 3], [1, 2], [5, 2], [5, 1], [5, 3], [1, 4], [2, 4]],
  },
  { // 5 · a nitrogen and a carbon arrive while the water is half made
    lesson: 1, dish: [8, 6],
    targets: [['water', 2], ['ammonia', 1], ['methane', 1]],
    supply: ['O', 'H', 'N', 'C', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'O', 'H', 'H'],
    solution: [[1, 1], [0, 1], [4, 1], [4, 4], [1, 2], [4, 0], [5, 1], [3, 1],
               [4, 3], [5, 4], [4, 5], [3, 4], [2, 2], [2, 1], [2, 3]],
  },
  { // 6 · a lone hydrogen waits in a corner while two oxygens arrive
    lesson: 2, dish: [8, 6],
    targets: [['water', 2], ['hydrogen-gas', 1]],
    supply: ['H', 'O', 'O', 'H', 'H', 'H', 'H', 'H'],
    solution: [[0, 0], [3, 1], [6, 3], [1, 0], [3, 0], [3, 2], [6, 2], [6, 4]],
  },
  { // 7 · dress the oxygens before the last one arrives
    lesson: 2, dish: [8, 6],
    targets: [['hydrogen-peroxide', 1], ['water', 2]],
    supply: ['O', 'O', 'H', 'O', 'H', 'H', 'O', 'H', 'H', 'H'],
    solution: [[1, 1], [5, 1], [0, 1], [2, 4], [5, 0], [2, 5], [2, 1], [2, 0], [5, 2], [2, 3]],
  },
];

return { LESSONS, mobile, desktop };
}));
