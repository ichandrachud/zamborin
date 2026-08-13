/* BUNNY — does the model do what was described?

   Hand-built boards with answers known by eye, checked before anything is
   generated or measured. Every one of these is a rule from the description,
   turned into a case that would fail loudly if I had misread it.

   Run:  node bunny/check.js
*/
const M = require('./model.js');

let pass = 0, fail = 0;
function is(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `   got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
}

// Helper: build from an ASCII picture.
//   .  open baseplate      #  fixed obstacle (wall / iceberg / cone)
//   R  rabbit   C  carrot  F  fox
//   a-z  a brick; same letter = same brick.   *  suffix marks the bomb brick
function parse(rows, bombOn) {
  const H = rows.length, W = rows[0].length;
  const b = { W, H, bricks: [], fixed: new Set(), rabbit: -1, carrot: -1, foxes: [] };
  const byLetter = new Map();
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    const i = r * W + c;
    if (ch === '#') b.fixed.add(i);
    else if (ch === 'R') b.rabbit = i;
    else if (ch === 'C') b.carrot = i;
    else if (ch === 'F') b.foxes.push(i);
    else if (ch !== '.') {
      if (!byLetter.has(ch)) byLetter.set(ch, { id: ch, cells: [], bomb: ch === bombOn });
      byLetter.get(ch).cells.push(i);
    }
  }));
  b.bricks = [...byLetter.values()];
  return b;
}

console.log('BUNNY — model checks\n');

// 1. The rabbit boxed in by four bricks, with room outside for one to move.
// Two earlier versions of this test failed and both times the model was right:
// I left a row open above or below the barrier and the rabbit simply walked
// around, which is exactly what a corridor rule should let it do. Worth knowing
// that a single brick plugging a one-wide gap can never open it — slid along
// the corridor it stays in the way, slid across it blocks the approach instead.
{
  const b = parse([
    '......',
    '.aa...',
    '.bRc..',
    '.dd...',
    '......',
    '.....C',
  ]);
  is('boxed in to start', M.status(b), 'open');
  is('rabbit can reach nowhere', M.region(b, b.rabbit).size, 1);
  const s = M.solve(b);
  is('one slide lets it out', s.moves, 1);
}

// 2. The corridor does NOT have to be straight. A dog-leg counts.
{
  const b = parse([
    'R#...',
    '.#.#.',
    '...#C',
  ]);
  is('an L-shaped route around fixed walls is a corridor', M.status(b), 'won');
}

// 3. A fox already in the rabbit's region means dead, whatever else is true.
{
  const b = parse([
    'R.F.C',
    '.....',
  ]);
  is('fox sharing the region kills', M.status(b), 'dead');
}

// 4. A fox sealed off is harmless, and the carrot is still reachable.
{
  const b = parse([
    'R.C',
    'aaa',
    '.F.',
  ]);
  is('sealed fox is harmless', M.status(b), 'won');
}

// 5. Opening the way to the carrot AND to the fox is death, not victory.
{
  const b = parse([
    'F.a.C',
    '..b..',
    'R....',
  ]);
  const opened = M.apply(b, M.moves(b).find(m => b.bricks[m.ki].id === 'b' && m.dr === 1));
  is('death beats victory when one move does both', M.status(opened), 'dead');
}

// 6. A brick may not slide onto anything standing in the open.
{
  const b = parse([
    '.a.',
    '.R.',
    '.C.',
  ]);
  const down = M.moves(b).filter(m => m.dr === 1);
  is('a brick will not crush the rabbit', down.length, 0);
}

// 7. The bomb brick is destroyed by being moved, and its cells become open.
{
  const b = parse([
    'R....',
    '.aa..',
    '....C',
  ], 'a');
  const before = M.solidSet(b).size;
  const after = M.solidSet(M.apply(b, M.moves(b)[0])).size;
  is('moving the bomb brick removes it entirely', before - after, 2);
}

// 8. A board with no way through is reported as unsolvable, not as a win.
{
  const b = parse([
    'R#C',
    '.#.',
    '.#.',
  ]);
  is('walled off permanently', M.solve(b).moves, null);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
