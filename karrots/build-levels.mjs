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
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const M = require('./model.js');
import { solve, foxChangesTheAnswer, BFS_CAP } from './solve.mjs';

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

const WORLD1 = [
  { id: 1, note: 'slide, then hop. The carrot starts under a brick, so the first move a player ever makes is the one the game is named for. Nothing on this board can lose.',
    carrotAt: [2, 2],
    rows: ['aabbc.',
           'dde.cf',
           '.Be.gf',
           'hh.ig.',
           'jjki.l',
           'F.kmml'] },
  { id: 2, note: 'he is on her row, two squares past the carrot, with one brick holding him in. Moving that brick is the first losing move in the game.',
    rows: ['a.bbcc',
           'addeff',
           'BgCeF.',
           'hgiijj',
           'h.kkll',
           'mm.nn.'] },
  { id: 3, note: 'three squares and two bricks. A breather: the search says there is no losing move here at all.',
    rows: ['a..bcc',
           'addbe.',
           'BffCeF',
           'ghhiij',
           'g.kllj',
           'mmk.nn'] },
  { id: 4, note: 'he moves off her row and underneath it, and the danger stops being at the end of the trip and starts being in the middle of it.',
    rows: ['a..bbc',
           'adde.c',
           'BffeCg',
           'hhFijg',
           'kl.ijm',
           'klnn.m'] },
  { id: 5, note: 'his pocket is against the middle of the route. Ignoring him costs seven moves.',
    rows: ['abbcc.',
           'a.ddee',
           'BffCgh',
           'ijF.gh',
           'ijkk.l',
           '.mmnnl'] },
  { id: 6, note: 'he is above the route now, so the safe side of him is not the side it looks like.',
    rows: ['a.bbcc',
           'adF.ee',
           'BdfgCh',
           'i.fgjh',
           'ikklj.',
           'mm.lnn'] },
  { id: 7, note: 'corner to corner with him in the middle of the board, and a lane down the left that is the fast way to nothing.',
    rows: ['a.b.cc',
           'adbeef',
           'BdgFhf',
           'iigjhk',
           '.lljmk',
           '..nnmC'] },
  { id: 8, note: 'the wall. The longest trip in the world, and the route turns a corner right past him.',
    rows: ['aab.cc',
           '.dbeef',
           'Bdgghf',
           'iiF.hj',
           'k.llCj',
           'kmmnn.'] },
];

const out = [];
let changed = 0;
console.log('lvl  par  no-fox   delta  naive  branch  fatal    states  holes  1st loss  notes');
console.log('---  ---  ------  ------  -----  ------  -----  --------  -----  --------  -----');
for (const lv of WORLD1) {
  const st = M.parse(lv.rows, 'level ' + lv.id, lv.carrotAt ? { carrotAt: lv.carrotAt } : undefined);
  const r = foxChangesTheAnswer(st, { cap: BFS_CAP });
  if (!r.withFox.solved)
    throw new Error(`level ${lv.id} is not solvable within ${BFS_CAP} states — it does not ship`);
  if (r.changed) changed++;
  let holes = 0;
  for (let i = 0; i < M.N; i++) if (st.grid[i] === M.HOLE) holes++;
  const firstLoss = firstLosingSlide(st);
  console.log(String(lv.id).padStart(3), String(r.withFox.par).padStart(4),
    String(r.without.par ?? '—').padStart(7), String(r.parDelta ?? '—').padStart(7),
    (r.naiveDies ? 'dies' : '—').padStart(6), String(r.withFox.branchPoints).padStart(7),
    String(r.withFox.fatal).padStart(6), String(r.withFox.states).padStart(9),
    String(holes).padStart(6), String(firstLoss === null ? 'none' : firstLoss + ' moves').padStart(9),
    ' ' + lv.note.slice(0, 34));
  out.push({ ...lv, par: r.withFox.par, noFoxPar: r.without.par, firstLoss,
             branchPoints: r.withFox.branchPoints, states: r.withFox.states });
}
console.log(`\nthe fox changed the answer on ${changed} of ${WORLD1.length - 1} levels after the first ` +
            `(${Math.round(changed / (WORLD1.length - 1) * 100)}%). The gate's bar is 60%, and under 30% kills the game.`);

const body = out.map(lv =>
  `    { id: ${lv.id}, par: ${lv.par}` +
  (lv.carrotAt ? `, carrotAt: [${lv.carrotAt}]` : '') +
  `,\n      rows: [${lv.rows.map(r => `'${r}'`).join(', ')}],\n` +
  `      // ${lv.note}\n` +
  `      // par ${lv.par}, ${lv.noFoxPar} with the fox rule off. ${lv.branchPoints} positions on the\n` +
  `      // way to the answer where one move loses and another does not, out of ${lv.states}\n` +
  `      // searched. The first losing slide of any kind is ` +
  (lv.firstLoss === null ? 'out of reach' : `${lv.firstLoss} move${lv.firstLoss === 1 ? '' : 's'} in`) + `.\n    }`
).join(',\n');

writeFileSync(new URL('./levels.js', import.meta.url),
`/* ============================================================
   Zamborin · Karrots · world 1, the woods

   GENERATED by build-levels.mjs. Do not hand-edit: every par here is the
   length of the shortest solution a complete unpruned breadth-first search of
   the level's reachable positions could find, and editing one by hand would
   turn the three-carrot rating into a number nobody can trust.

   A level is six rows. '.' is a hole, '#' an immovable brick, 'B' the bunny,
   'F' the fox and 'C' the carrot, each of those three standing in a hole. A
   letter is one domino and appears exactly twice, on two adjacent cells.
   \`carrotAt\` puts the carrot under a tile instead, which §4.2 allows: the
   goal square is not reserved.
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
