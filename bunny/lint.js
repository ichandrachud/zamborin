/* BUNNY — the level critic.

   The original levels were designed by hand, in 2016, with none of this. A
   designer placed the bricks and then found out whether the level was any good
   by playing it, over and over, and by guessing.

   This is the part worth automating. Not making levels — a person composes
   those far better, which is exactly what the screenshots show — but answering,
   instantly, what a person has just composed:

     is it solvable at all, and in how few slides
     can a player who never plans just walk it
     is the predator a live threat or is it scenery
     can the very first move throw the level away

   Run:  node bunny/lint.js
*/
const M = require('./model.js');
const L = require('./levels.js');

// Four ways to play without thinking. A level that any of them beats is a level
// that asks nothing.
const PLAYERS = {
  grow: (b, ms) => ms.reduce((best, m) =>
    M.region(M.apply(b, m), b.rabbit).size > best.s
      ? { m, s: M.region(M.apply(b, m), b.rabbit).size } : best, { m: ms[0], s: -1 }).m,
  first: (b, ms) => ms[0],
  last: (b, ms) => ms[ms.length - 1],
  safe: (b, ms) => {
    const live = ms.filter(m => M.status(M.apply(b, m)) !== 'dead');
    const pool = live.length ? live : ms;
    return pool.reduce((best, m) =>
      M.region(M.apply(b, m), b.rabbit).size > best.s
        ? { m, s: M.region(M.apply(b, m), b.rabbit).size } : best, { m: pool[0], s: -1 }).m;
  },
};

function walks(b, how, budget) {
  let cur = b;
  for (let n = 0; n < budget; n++) {
    const st = M.status(cur);
    if (st === 'won') return true;
    if (st === 'dead') return false;
    const ms = M.moves(cur);
    if (!ms.length) return false;
    cur = M.apply(cur, PLAYERS[how](cur, ms));
  }
  return M.status(cur) === 'won';
}

// Of the moves available right now, how many throw the level away entirely:
// either they kill the rabbit, or they leave a board that can no longer be won.
function ruinousShare(b, par) {
  const ms = M.moves(b);
  if (!ms.length) return 1;
  let bad = 0;
  for (const m of ms) {
    const after = M.apply(b, m);
    if (M.status(after) === 'dead') { bad++; continue; }
    if (M.solve(after, 20000, par + 3).moves == null) bad++;
  }
  return bad / ms.length;
}

function report(level) {
  const line = (s) => console.log('    ' + s);
  let b;
  try { b = L.parse(level); }
  catch (e) { console.log(`  ${level.name}\n    BROKEN  ${e.message}\n`); return false; }

  const start = M.status(b);
  if (start !== 'open') {
    console.log(`  ${level.name}\n    BROKEN  starts already "${start}"\n`);
    return false;
  }

  const s = M.solve(b, 200000, 14);
  console.log(`  ${level.name}   (${level.theme}, ${b.W}x${b.H}, ${b.bricks.length} bricks, ${b.foxes.length} fox${b.foxes.length === 1 ? '' : 'es'})`);
  if (s.moves == null) { line('BROKEN  no solution within 14 slides'); console.log(''); return false; }

  // how much of the way through does the fox stay dangerous?
  let cur = b, liveTurns = 0;
  for (const m of s.path) { if (M.fatalShare(cur) > 0) liveTurns++; cur = M.apply(cur, m); }

  const beaten = Object.keys(PLAYERS).filter(h => walks(b, h, s.moves + 3));
  const fatal = M.fatalShare(b);
  const ruin = ruinousShare(b, s.moves);

  line(`par ${s.moves} slides, ${M.moves(b).length} legal moves to start, ${s.states} states searched`);
  line(`slides that kill right now : ${(fatal * 100).toFixed(0)}%`);
  line(`first moves that throw it   : ${(ruin * 100).toFixed(0)}%`);
  line(`fox live for                : ${liveTurns} of ${s.path.length} turns`);
  line(beaten.length ? `WALKED BY               : ${beaten.join(', ')}` : `beaten by no unplanned player`);

  const notes = [];
  if (!b.foxes.length) notes.push('no predator — fine for a teaching level, not for a real one');
  // A fox that cannot actually reach you still does work: the player does not
  // know that without tracing the whole region, so it costs them a thought
  // either way. This is an observation, not a failure.
  else if (fatal === 0) notes.push('the fox cannot reach you here — a mental threat only, which is fine');
  else if (liveTurns < s.path.length * 0.4) notes.push('the fox stops mattering early');
  if (beaten.length) notes.push('a player who never plans wins this');
  if (s.moves < 2 && !level.teaching) notes.push('too shallow to be a level');
  notes.forEach(n => line('note: ' + n));
  console.log('');
  // A teaching level is allowed to be one slide deep and allowed to be walked
  // by the one strategy it exists to teach.
  if (level.teaching) return s.moves >= 1;
  return !beaten.length && s.moves >= 2;
}

console.log('BUNNY — level critic\n');
let good = 0;
for (const lv of L.LEVELS) if (report(lv)) good++;
console.log(`  ${good} of ${L.LEVELS.length} levels hold up`);
