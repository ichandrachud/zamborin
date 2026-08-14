/* BUNNY — the level format.

   The original levels were designed by hand in 2016, and looking at them that
   is obvious: the carrot tucked behind the car, the penguin parked beside its
   iceberg. Nothing random composes like that. So this game does not want a
   generator, it wants a format a person can type and a critic that answers back.

   A level is a picture:

     .   open baseplate, where everything alive stands
     #   a fixed object: masonry wall, iceberg, traffic cone. Never moves.
     R   the rabbit          C   the carrot         F   a predator
     a-z a sliding brick. The same letter is the same brick, so `aa` is one
         2x1 piece and two separate `a` and `b` are two 1x1 pieces.

   `bomb` names the brick that carries the bomb: slide it and it is destroyed
   rather than moved, turning an obstacle into open cells.

   Two things learned the hard way while writing these, both worth knowing
   before designing more:

     A corridor is any connected route, not a straight line. Leave one row open
     above a barrier and the rabbit simply walks around it.

     A door slid PERPENDICULAR to its wall lands directly in front of the
     opening it just vacated, so it connects nothing. This is the single thing
     that broke every level here on the first three attempts.

     THE DOOR AND ALCOVE. To make a wall openable, the wall row holds the door
     AND a recess beside it, with the far side of the recess blocked so it is a
     dead end rather than a second hole. The door then slides SIDEWAYS along the
     wall into the recess and the corridor opens:

         ......      upper pocket
         ##aa..      wall: door `aa`, alcove at the right
         ....##      the alcove's far side, blocked
         ......      lower pocket

     Slide `aa` right and the two cells it leaves become the way through.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BUNNY_LEVELS = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

function parse(level) {
  const rows = level.rows, H = rows.length, W = rows[0].length;
  const b = { W, H, bricks: [], fixed: new Set(), rabbit: -1, carrot: -1, foxes: [] };
  const byLetter = new Map();
  rows.forEach((row, r) => {
    if (row.length !== W) throw new Error(`level "${level.name}": row ${r} is ${row.length} wide, expected ${W}`);
    [...row].forEach((ch, c) => {
      const i = r * W + c;
      if (ch === '.') return;
      if (ch === '#') b.fixed.add(i);
      else if (ch === 'R') b.rabbit = i;
      else if (ch === 'C') b.carrot = i;
      else if (ch === 'F') b.foxes.push(i);
      else {
        if (!byLetter.has(ch)) byLetter.set(ch, { id: ch, cells: [], bomb: ch === level.bomb });
        byLetter.get(ch).cells.push(i);
      }
    });
  });
  b.bricks = [...byLetter.values()];
  if (b.rabbit < 0) throw new Error(`level "${level.name}": no rabbit`);
  if (b.carrot < 0) throw new Error(`level "${level.name}": no carrot`);
  // a brick must be a rectangle, or it is not a LEGO brick
  for (const k of b.bricks) {
    const cs = k.cells.map(i => i % W), rs = k.cells.map(i => (i / W) | 0);
    const w = Math.max(...cs) - Math.min(...cs) + 1, h = Math.max(...rs) - Math.min(...rs) + 1;
    if (w * h !== k.cells.length) throw new Error(`level "${level.name}": brick ${k.id} is not a rectangle`);
  }
  if (level.bomb && !b.bricks.some(k => k.bomb)) throw new Error(`level "${level.name}": no brick "${level.bomb}" to bomb`);
  return b;
}

// Returns { rows, bomb } — the bomb letter has to come back out or the level
// cannot be reconstructed. Returning rows alone silently dropped it on 55
// generated levels.
// Every symbol that is not reserved for the plate, a fixed object, or one of
// the cast. Wrapping at 26 letters gave two different bricks the same symbol on
// any board with 27+ pieces, and parse then merged them into one L-shaped
// "brick" and threw. A 7x8 board of single cells needs about fifty.
const SYMBOLS = ('abcdefghijklmnopqrstuvwxyz' + '0123456789' +
                 'ABDEGHIJKLMNOPQSTUVWXYZ').split('');   // no R, C or F

function format(b) {
  if (b.bricks.length > SYMBOLS.length) throw new Error('too many bricks to write down');
  const out = [];
  const letterOf = new Map();
  let bomb = null;
  b.bricks.forEach((k, n) => {
    const ch = SYMBOLS[n];
    if (k.bomb) bomb = ch;
    k.cells.forEach(c => letterOf.set(c, ch));
  });
  for (let r = 0; r < b.H; r++) {
    let line = '';
    for (let c = 0; c < b.W; c++) {
      const i = r * b.W + c;
      line += i === b.rabbit ? 'R' : i === b.carrot ? 'C' : b.foxes.includes(i) ? 'F'
            : b.fixed.has(i) ? '#' : letterOf.get(i) || '.';
    }
    out.push(line);
  }
  return { rows: out, bomb };
}

// A starter set, authored by hand and then put through bunny/lint.js, which is
// the workflow this format exists to support.
const LEVELS = [
  // TEACHING. No predator, one slide. Just: bricks move.
  { name: 'Boxed in', theme: 'garden', teaching: true, rows: [
    '......',
    '.aa...',
    '.bRc..',
    '.dd...',
    '......',
    '.....C',
  ] },

  // TEACHING. Fox above, carrot below, a door in each wall. Slide a door
  // sideways into its alcove and that wall opens. One of them feeds you and
  // one of them feeds the fox.
  { name: 'One of these kills you', theme: 'garden', teaching: true, rows: [
    'F.....',
    '......',
    '##aa..',
    '....##',
    '..R...',
    '......',
    '..bb##',
    '##....',
    '....C.',
  ] },

  // Two walls to open, and the fox behind a third the whole time.
  { name: 'Two doors', theme: 'sea', rows: [
    'F.....',
    '##aa..',
    '....##',
    '..R...',
    '..bb##',
    '##....',
    '......',
    '..cc##',
    '##....',
    '....C.',
  ] },

  // The bomb, shown rather than explained. This door has no alcove, so sliding
  // it can never open the wall. Destroying it can.
  { name: 'Blast it', theme: 'ice', bomb: 'c', rows: [
    'F.....',
    '##aa..',
    '....##',
    '..R...',
    '##c###',
    '....C.',
  ] },

  { name: 'Two foxes', theme: 'road', rows: [
    'F.....',
    '##aa..',
    '....##',
    '..R...',
    '..bb##',
    '##....',
    'F....C',
  ] },
];

return { parse, format, LEVELS };
}));
