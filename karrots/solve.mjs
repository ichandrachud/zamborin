/* Karrots — the solver that produces par.
 *
 * AN UNPRUNED BREADTH-FIRST SEARCH. No heuristics, no pruning, no A*. The
 * number it returns is the true optimum or it is nothing, because par is what
 * the three-carrot rating is measured against, and a par that is merely a good
 * solution turns carrot-chasing into a grind against a number nobody can
 * reach. The house rule is on record from the uniqueness work: a construction
 * argument is a hypothesis, a full search is a fact.
 *
 * A state is the grid plus the bunny. Nothing else moves. States where the
 * fox's hole-component contains the bunny are LOSSES: they are counted, so the
 * generator can be told how sharp a level is, and never expanded.
 *
 * `fox: false` switches the rule off and solves the same board as an ordinary
 * sliding puzzle. That is gate row 2 - the row that decides whether this ships
 * at all - and it is also the calibration run: with no fox in the level at all
 * the two solves must agree exactly, or the harness is measuring itself.
 *
 * Run: node karrots/solve.mjs            (solves every level in levels.js)
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('./model.js');

export const BFS_CAP = 400000;

/** Breadth-first over reachable positions. Returns the optimum, the move list
 *  that reaches it, and what the search saw on the way. */
export function solve(start, opts = {}) {
  const useFox = opts.fox !== false;
  const cap = opts.cap ?? BFS_CAP;
  // Keeping a parent for every position so a move list can be walked back
  // costs about as much memory as the search itself, and most callers only
  // want the number. `path: false` swaps the Map for a Set and the search runs
  // in roughly half the heap - which is the difference between finishing and
  // a 4 GB out-of-memory, found the hard way.
  const wantPath = opts.path !== false;

  const startKey = M.key(start);
  const prev = wantPath ? new Map([[startKey, null]]) : null;
  const seenSet = wantPath ? null : new Set([startKey]);
  const has = k => wantPath ? prev.has(k) : seenSet.has(k);
  let frontier = [start], depth = 0, seen = 1, fatal = 0, branchPoints = 0;

  if (M.won(start)) return { par: 0, path: [], states: 1, fatal: 0, branchPoints: 0, capped: false, solved: true };

  while (frontier.length) {
    const next = [];
    for (const st of frontier) {
      const here = M.key(st);
      let fatalHere = 0, safeHere = 0;
      for (const mv of M.moves(st)) {
        const ns = M.apply(st, mv);
        // Key BEFORE the fox check. Only positions he cannot reach are ever
        // stored, so a hit here is already known to be safe - and most
        // generated positions are repeats, which is a flood fill saved each
        // time. Checking caught() first made duplicates pay for it too.
        const k = M.key(ns);
        if (has(k)) { safeHere++; continue; }
        if (useFox && M.caught(ns)) { fatal++; fatalHere++; continue; }
        safeHere++;
        if (wantPath) prev.set(k, { key: here, mv }); else seenSet.add(k);
        seen++;
        if (M.won(ns)) {
          let path = null;
          if (wantPath) {                       // walk the parent chain back
            path = [mv];
            let cur = here;
            while (prev.get(cur)) { path.unshift(prev.get(cur).mv); cur = prev.get(cur).key; }
          }
          return { par: depth + 1, path, states: seen, fatal, branchPoints, capped: false, solved: true };
        }
        if (seen > cap) return { par: null, path: null, states: seen, fatal, branchPoints, capped: true, solved: false };
        next.push(ns);
      }
      // A position where at least one move loses and at least one does not is
      // a place the player has to think. Gate row 3 counts these.
      if (fatalHere > 0 && safeHere > 0) branchPoints++;
    }
    frontier = next; depth++;
  }
  return { par: null, path: null, states: seen, fatal, branchPoints, capped: false, solved: false };
}

/** Gate row 2, per level: does the fox change the answer?
 *
 * Two things are worth knowing and they are not the same thing.
 *
 * `parDelta` is the strict one. Solve the board with the rule and without it.
 * If par is the same, then a solution of that length exists that never lets
 * him near her, and the fox has not changed the optimum - he has only changed
 * which of several equally short routes you may take.
 *
 * `naiveDies` is the one the player feels. Take the optimal line you would
 * find if you ignored him entirely, replay it under the real rule, and see
 * whether it gets her killed. A level where the obvious answer is fatal plays
 * as though the fox matters even when par is untouched.
 *
 * Comparing the two BFS move lists directly - the first thing this did - was
 * worthless: among many optimal lines the search returns an arbitrary one, so
 * two identical boards could disagree for no reason at all.
 */
export function foxChangesTheAnswer(start, opts = {}) {
  // Only the no-fox line is walked move by move, so only that solve keeps one.
  const withFox = solve(start, { fox: true, cap: opts.cap, path: opts.path !== false ? true : false });
  const without = solve(start, { fox: false, cap: opts.cap });

  let naiveDies = false, diedAt = -1;
  if (without.solved) {
    let st = start;
    for (let i = 0; i < without.path.length; i++) {
      st = M.apply(st, without.path[i]);
      if (M.caught(st)) { naiveDies = true; diedAt = i + 1; break; }
    }
  }
  const parDelta = (withFox.solved && without.solved) ? withFox.par - without.par : null;
  return { withFox, without, parDelta, naiveDies, diedAt,
           changed: (parDelta !== null && parDelta > 0) || naiveDies };
}

const sig = mv => mv.type === 'hop' ? `hop ${M.rc(mv.to).r},${M.rc(mv.to).c}`
                                    : `slide ${M.rc(mv.a).r},${M.rc(mv.a).c} ${M.DIRS[mv.dir].n}`;

/* PAR ONCE THE ANIMALS REALLY WANDER.
 *
 * A pace step moves the model, so the player can wait for either of them to be
 * standing somewhere else before making a move, and a par measured with them
 * pinned to one square is only an upper bound. On the ladder this replaced it
 * was a wild one: six of eight levels could be beaten and one advertised at
 * par 12 fell in a single slide, because the difficulty was somebody standing
 * in a doorway rather than the puzzle.
 *
 * So the state carries each animal's POCKET - named by its lowest cell, so two
 * boards differing only in where inside a pocket somebody stands are one state
 * - and expansion tries every placement.
 *
 * This lives here rather than in build-levels.mjs because the forge filter
 * needs the same answer, and two copies of a rule like this drift.
 */
export function cellsOf(st, cell) {
  const r = M.regionFrom(st, cell), out = [];
  for (let i = 0; i < M.N; i++) if (r[i]) out.push(i);
  return out;
}
/* The bombs still on the board belong in the key as much as the dominoes do:
   two positions that differ only by a bomb nobody has spent yet are not the
   same problem, and collapsing them would let the search reach a win it has
   not actually paid for. M.key carries them for the ordinary search; this one
   builds its own key out of POCKETS, so it has to carry them too. */
export const wanderKey = st => String.fromCharCode.apply(null, st.grid) +
  String.fromCharCode(cellsOf(st, st.bunny)[0]) + String.fromCharCode(cellsOf(st, st.fox)[0]) +
  (st.bombs && st.bombs.length ? '!' + st.bombs.join(',') : '');

export function parWhileTheyWander(st0, opts = {}) {
  const useFox = opts.fox !== false;
  const cap = opts.cap ?? 400000;
  if (M.won(st0)) return 0;
  const seen = new Set([wanderKey(st0)]);
  let frontier = [st0];
  for (let d = 1; d <= (opts.maxDepth ?? 40); d++) {
    const next = [];
    for (const s of frontier) {
      for (const f of cellsOf(s, s.fox)) for (const b of cellsOf(s, s.bunny)) {
        if (f === b) continue;
        /* CARRY THE BOMBS. Rebuilding the state to try a placement dropped
           them, so every position in this search looked unbombed, apply()
           moved bombed dominoes like any other, and the answer came back as
           the par of the board WITHOUT its bomb. It rejected all 48 levels it
           was asked about, always with exactly the unbombed par, which is what
           gave it away: a filter that rejects everything is not a strict
           filter, it is a broken one. */
        const placed = { ...s, bunny: b, fox: f };
        for (const mv of M.slideMoves(placed)) {
          const ns = M.apply(placed, mv);
          if (useFox && M.caught(ns)) continue;
          const k = wanderKey(ns);
          if (seen.has(k)) continue;
          seen.add(k);
          if (M.won(ns)) return d;
          next.push(ns);
        }
      }
    }
    frontier = next;
    if (!frontier.length || seen.size > cap) break;
  }
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { LEVELS } = require('./levels.js');
  console.log('lvl  par  no-fox  changed  states   fatal  branch  optimal line');
  console.log('---  ---  ------  -------  -------  -----  ------  ------------');
  let changedCount = 0;
  for (const lv of LEVELS) {
    const st = M.parse(lv.rows, lv.id);
    const r = foxChangesTheAnswer(st);
    if (r.changed) changedCount++;
    console.log(
      String(lv.id).padStart(3),
      String(r.withFox.par ?? '—').padStart(4),
      String(r.without.par ?? '—').padStart(7),
      (r.changed ? (r.parDelta > 0 ? '+' + r.parDelta : 'naive dies') : 'NO ').padStart(10),
      String(r.withFox.states).padStart(8),
      String(r.withFox.fatal).padStart(6),
      String(r.withFox.branchPoints).padStart(7),
      ' ' + (r.withFox.path || []).map(sig).join(' · '));
  }
  console.log(`\nthe fox changed the answer on ${changedCount} of ${LEVELS.length} levels`);
}
