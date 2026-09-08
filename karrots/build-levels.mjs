/* Karrots — world 1, and the search that proves it.
 *
 * These eight boards are hand-made. What is hand-made is the SHAPE: where the
 * holes are, where the three of them stand, and therefore what each level is
 * about. The domino lettering and the choice between tilings came off
 * tune-author.mjs, and every number below comes out of the real unpruned
 * breadth-first search in solve.mjs, run here at the full cap.
 *
 * PAR IS NOT A GUESS AND IS NOT A GOOD SOLUTION SOMEONE FOUND. It is the
 * length of the shortest solution a complete search of the reachable
 * positions could find, which is the only kind of number a three-carrot
 * rating can honestly be measured against. A board whose search exceeds the
 * cap is not shipped with an estimate; it is not shipped.
 *
 * Run: node --max-old-space-size=8192 karrots/build-levels.mjs
 * Writes karrots/levels.js.
 */
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const M = require('./model.js');
import { solve, foxChangesTheAnswer, BFS_CAP, parWhileTheyWander } from './solve.mjs';

/* How many moves in the FIRST position appears from which some slide loses.
 *
 * This is not the same as the `fatal` count the solver reports, and confusing
 * the two nearly shipped a false claim. The solver stops the moment it reaches
 * the carrot, so on a par-2 level it has only ever looked two moves deep, and
 * "fatal 0" there means "no losing move on the way to the answer" - NOT "this
 * board cannot be lost". Level 1 reports fatal 0 and can be lost five moves in
 * by a player who wanders. */
function firstLosingSlide(start, budget = 20000) {
  const seen = new Set([M.key(start)]);
  let frontier = [start];
  for (let depth = 0; depth < 14 && frontier.length; depth++) {
    const next = [];
    for (const s0 of frontier) {
      for (const mv of M.slideMoves(s0)) if (M.caught(M.apply(s0, mv))) return depth;
      if (seen.size > budget) continue;
      for (const mv of M.moves(s0)) {
        const ns = M.apply(s0, mv);
        if (M.caught(ns)) continue;
        const k = M.key(ns);
        if (seen.has(k)) continue;
        seen.add(k); next.push(ns);
      }
    }
    frontier = next;
  }
  return null;
}

/* World 1, forged by tune-forge.mjs and copied here so the shipped file is a
 * plain list a person can read and edit. Every one is solvable BY
 * CONSTRUCTION - each was built by walking backwards from the position where
 * the bunny is already on her carrot - and every par below is then measured
 * again from scratch by the unpruned search in this file. */
/* FOUR WORLDS NOW, in one file keyed by world. Each entry is a board plus the
   note that says what it is about; everything numeric below is measured here
   and never carried in from the forge. */
const WORLDS = JSON.parse(readFileSync(new URL('./worlds.json', import.meta.url), 'utf8'));
const ORDER = ['woods', 'arctic', 'road', 'ocean'];
const ALL = [];
for (const w of ORDER) for (const lv of (WORLDS[w] || [])) ALL.push({ ...lv, world: w });

/* PAR HAS TO SURVIVE THE ANIMALS WANDERING, and the search that proves it is
 * in solve.mjs beside the ordinary one - the forge filter needs the same
 * answer and two copies of this rule would drift. A level whose two pars
 * disagree leans on somebody standing in a doorway, and does not ship. */

/* What this board's par is with the bomb taken off. Solved once per level and
   remembered, because the ship gate and the note both want it. */
const _bare = new Map();
function bareParFor(lv) {
  const k = lv.rows.join('|');
  if (!_bare.has(k)) _bare.set(k, solve(M.parse(lv.rows, 'bare ' + lv.id), { cap: BFS_CAP, path: false }).par);
  return _bare.get(k);
}

const out = [];
let changed = 0;
console.log('lvl  par  no-fox   delta  naive  branch  fatal    states  holes  1st loss  notes');
console.log('---  ---  ------  ------  -----  ------  -----  --------  -----  --------  -----');
let lastWorld = null;
for (const lv of ALL) {
  if (lv.world !== lastWorld) { lastWorld = lv.world; console.log(`--- ${lv.world} ---`); }
  const st = M.parse(lv.rows, 'level ' + lv.id, lv.bomb ? { bombs: [lv.bomb] } : undefined);
  const r = foxChangesTheAnswer(st, { cap: BFS_CAP });
  if (!r.withFox.solved)
    throw new Error(`level ${lv.id} is not solvable within ${BFS_CAP} states — it does not ship`);
  const wander = parWhileTheyWander(st);
  if (wander === null)
    throw new Error(`level ${lv.id}: the wandering search did not finish — it does not ship`);
  if (wander !== r.withFox.par)
    throw new Error(`level ${lv.id}: par is ${r.withFox.par} pinned but ${wander} once they wander. ` +
      `The level leans on somebody standing in a doorway — it does not ship`);
  /* THE BOMB HAS TO EARN ITS PLACE, the same gate the predator passes. A
     bomb that does not change the answer is scenery, and measured over 248
     placements four in five dominoes are exactly that. Proved here rather
     than trusted: solve the same board with the bomb taken off and require a
     different number. */
  if (lv.bomb) {
    const barePar = bareParFor(lv);
    if (barePar === r.withFox.par)
      throw new Error(`level ${lv.id}: the bomb on '${lv.bomb}' changes nothing, ` +
        `par is ${barePar} with it and without it — it does not ship`);
  }
  const wanderNoFox = parWhileTheyWander(st, { fox: false });
  /* Judged on the numbers the player actually plays against, not the pinned
     ones: level 5 is par 8 against a no-fox 8 pinned but 5 once they wander,
     and the pinned comparison called that "the fox does not matter". */
  if (wanderNoFox !== null && wander > wanderNoFox) changed++;
  let holes = 0;
  for (let i = 0; i < M.N; i++) if (st.grid[i] === M.HOLE) holes++;
  const firstLoss = firstLosingSlide(st);
  console.log(String(lv.id).padStart(3), String(r.withFox.par).padStart(4),
    String(wanderNoFox ?? '—').padStart(7), String(wander - wanderNoFox).padStart(7),
    (r.naiveDies ? 'dies' : '—').padStart(6), String(r.withFox.branchPoints).padStart(7),
    String(r.withFox.fatal).padStart(6), String(r.withFox.states).padStart(9),
    String(holes).padStart(6), String(firstLoss === null ? 'none' : firstLoss + ' moves').padStart(9),
    ' ' + (lv.note || (lv.bomb ? 'bomb ' + lv.bomb : '')).slice(0, 34));
  /* The note is written here rather than carried in worlds.json, because
     everything worth saying about a level is a number this run just measured. */
  const note = lv.note || (lv.bomb
    ? `par ${r.withFox.par} with the bomb on '${lv.bomb}' and ${bareParFor(lv)} without it; ` +
      `${wanderNoFox} without the predator.`
    : '');
  out.push({ ...lv, note, par: r.withFox.par, noFoxPar: wanderNoFox, firstLoss,
             branchPoints: r.withFox.branchPoints, states: r.withFox.states });
}
/* Every level counts now. The "- 1" here dated from the version where level 1
   was a two-move teacher with no fox in play, and it printed 8 of 7 = 114%. */
console.log(`\nthe predator changed the answer on ${changed} of ${ALL.length} levels ` +
            `(${Math.round(changed / ALL.length * 100)}%). The gate's bar is 60%, and under 30% kills the game.`);
for (const w of ORDER) {
  const rows = out.filter(o => o.world === w);
  if (rows.length) console.log(`  ${w.padEnd(7)} ${String(rows.length).padStart(2)} levels, par ` +
    `${rows[0].par} to ${rows[rows.length - 1].par}`);
}

const body = out.map(lv =>
  `    { id: ${lv.id}, n: ${lv.n}, world: '${lv.world}', par: ${lv.par}` +
  (lv.bomb ? `, bomb: '${lv.bomb}'` : '') +
  `,\n      rows: [${lv.rows.map(r => `'${r}'`).join(', ')}],\n` +
  (lv.note ? `      // ${lv.note}\n` : '') +
  `      // par ${lv.par}, ${lv.noFoxPar} with the fox rule off. ${lv.branchPoints} positions on the\n` +
  `      // way to the answer where one move loses and another does not, out of ${lv.states}\n` +
  `      // searched. The first losing slide of any kind is ` +
  (lv.firstLoss === null ? 'out of reach' : `${lv.firstLoss} move${lv.firstLoss === 1 ? '' : 's'} in`) + `.\n    }`
).join(',\n');

writeFileSync(new URL('./levels.js', import.meta.url),
`/* ============================================================
   Zamborin · Karrots · ninety six levels, four worlds

   GENERATED by build-levels.mjs. Do not hand-edit: every par here is the
   length of the shortest solution a complete unpruned breadth-first search of
   the level's reachable positions could find, and it is proved a second time
   over states keyed by each animal's POCKET, because they pace while the
   player thinks. Editing one by hand would turn the three-carrot rating into
   a number nobody can trust.

   A level is seven rows of ten. '.' is a hole, '#' an immovable block, 'B'
   the bunny, 'F' the world's predator and 'C' the carrot, each of those three
   standing in a hole. A letter is one domino and appears exactly twice, on
   two adjacent cells; the alphabet excludes 'B', 'C' and 'F' so a domino can
   never be read as an animal.

   THE GOAL SQUARE IS RESERVED. This header used to describe a \`carrotAt\`
   option that put the carrot under a tile, and that rule was reversed on
   2026-09-07: nothing slides over the carrot and only the bunny may stand on
   it. model.js now throws on \`carrotAt\`, so the note was an instruction to
   write a level that cannot load.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KarrotsLevels = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var LEVELS = [
${body}
  ];
  return { LEVELS: LEVELS, WORLD: 'woods' };
});
`);
console.log('\nwrote karrots/levels.js');
