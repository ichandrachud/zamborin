/* ============================================================
   Junction · pinning a board down to one answer
   ============================================================

   The owner's rule is one solution and exactly the rails to build it. Most
   boards do not start that way: they certify with a handful of layouts all
   winning at the same cost, and the generator used to throw them away.

   Scattering more rocks does not fix that, and it was worth measuring why.
   At low density nothing changes — the extra obstacles land where no route
   wanted to go. At high density the yard is walled off and the board stops
   having any answer at all: sweeping the crossing family at 8, 11 and 14
   rocks certified nothing at any of the three, and most boards failed in
   under three milliseconds, which is the shape of "no route exists" rather
   than "too many".

   The fix is aimed rather than dense, and it is the anecdote in the notes
   written as an algorithm. What is wrong with the board is specific: several
   layouts win at the same cost. So enumerate them, keep one, and drop a rock
   on the cell that the most RIVALS need and the keeper does not. Re-measure
   afterwards, because a new obstacle can move the minimum — the rock is only
   kept if the board still certifies.

   WHAT IT BOUGHT, measured both ways:

     the corridor family   4 of 12 seeds usable -> 7 of 12, one rock each
     the crossing family   0 of 6 usable -> 4 of 6, one to four rocks
     cost                  seconds, against the ~131s a level took before

   THE TRADE, and it is real. Pinning removes wrong answers along with rival
   right ones, so a board gets easier as it gets unique: one crossing board
   went from 5,021 decoys to 195 over four rocks. The corridor family barely
   notices (69,794 decoys survives pinning intact) because it has far more
   room to be wrong in. Read the decoy count after pinning, never before.
*/
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('./model.js');
const { N, E, S, W } = M;

/* WHY assess AND specOf ARRIVE AS ARGUMENTS instead of being imported. This
   file needs two functions from generate.mjs, and generate.mjs needs pin()
   from this one. Importing both ways at load time deadlocks whenever
   generate.mjs is the program being RUN: its own top-level code is what calls
   harvest, so it is still evaluating when this file asks for it, and the two
   wait on each other forever. Node then drains its event loop and exits 0
   with no error at all, which is a genuinely horrible thing to debug — it
   printed one line and stopped. The caller hands the two functions over
   instead, and there is no cycle to deadlock. */

const rc = (l, i) => [Math.floor(i / l.C), i % l.C];
const straightLine = (l, a, b) => {
  const [ar, ac] = rc(l, a), [br, bc] = rc(l, b);
  return Math.abs(ar - br) + Math.abs(ac - bc);
};
function allRoutes(l, from, to, maxLen) {
  const out = [], seen = new Set([from]), path = [from];
  (function dfs(cur, len) {
    if (cur === to) { out.push(path.slice()); return; }
    if (len + straightLine(l, cur, to) > maxLen) return;   // admissible
    for (const d of [N, E, S, W]) {
      const nx = M.neighbour(l, cur, d);
      if (nx < 0 || seen.has(nx)) continue;
      if (nx !== to && l.kind[nx] !== M.EMPTY) continue;
      seen.add(nx); path.push(nx); dfs(nx, len + 1); path.pop(); seen.delete(nx);
    }
  })(from, 0);
  return out;
}
const segmentsOf = (l, cells) => {
  const out = [];
  for (let k = 1; k < cells.length - 1; k++) {
    const i = cells[k];
    const a = M.sideBetween(l, i, cells[k - 1]), b = M.sideBetween(l, i, cells[k + 1]);
    if (a < 0 || b < 0 || a === b) return null;
    out.push([Math.floor(i / l.C), i % l.C, a, b]);
  }
  return out;
};

/* Every winning layout that costs exactly the level's budget, with the set of
   cells it puts rail in — the cells are the part an obstacle can take away. */
export function winnersAtBudget(lvl, slack) {
  const wanted = [];
  for (const p of lvl.portals) for (const colour of p.queue) wanted.push({ p, colour });
  const legs = wanted.map((wt) => {
    const home = lvl.depots.find((d) => d.colour === wt.colour);
    const start = M.neighbour(lvl, wt.p.i, wt.p.face);
    const mouth = M.neighbour(lvl, home.i, home.face);
    return allRoutes(lvl, start, mouth, straightLine(lvl, start, mouth) + slack)
      .map((c) => segmentsOf(lvl, [wt.p.i, ...c, home.i])).filter(Boolean);
  });
  const seen = new Map();
  const walk = (k, acc) => {
    if (k === legs.length) {
      let t; try { t = M.layout(lvl, [].concat(...acc)); } catch (e) { return; }
      if (M.sleepers(t) !== lvl.budget) return;
      const js = [];
      for (let i = 0; i < lvl.size; i++) if (M.isJunction(t[i])) js.push(i);
      if (js.length > 16) return;
      for (let m = 0; m < (1 << js.length); m++) {
        const c = M.cloneTrack(t);
        js.forEach((i, n) => { if (m & (1 << n)) M.toggleSwitch(c, i); });
        if (!M.runToEnd(lvl, c).won) continue;
        const cells = [];
        for (let i = 0; i < lvl.size; i++) if (c[i] && lvl.kind[i] === M.EMPTY) cells.push(i);
        const rails = c.map((x, i) => x
          ? i + '[' + x.segs.map((g) => g.slice().sort().join('')).sort().join('|') + ']' : '')
          .filter(Boolean).join(' ');
        if (!seen.has(rails)) seen.set(rails, new Set(cells));
      }
      return;
    }
    for (const o of legs[k]) walk(k + 1, acc.concat([o]));
  };
  walk(0, []);
  return [...seen.values()];
}

export function pin(lvl, opts) {
  const { assess, specOf } = opts;
  const slack = (opts && opts.slack) || 2;
  const maxRocks = (opts && opts.maxRocks) || 8;
  const ms = (opts && opts.msBudget) || 25000;
  const log = [];
  let r = assess(lvl, { slack, msBudget: ms });
  if (!r) return { ok: false, why: 'does not certify at all', log };
  for (let step = 0; step < maxRocks; step++) {
    log.push(`budget ${r.budget}  rails ${r.railLayouts}  decoys ${r.decoys}` +
      `  greedy ${r.greedyWins ? 'WINS' : 'loses'}`);
    /* Greedy can START losing and END winning: taking options away is how a
       board becomes unique, and it is also how the straight route becomes the
       only route. So the gate is re-run every step, not just at the end. */
    if (r.greedyWins) return { ok: false, why: 'greedy wins', log, r };
    if (r.railLayouts === 1) return { ok: true, level: r.level, r, log, rocksAdded: step };
    const at = r.level;
    const winners = winnersAtBudget(at, slack);
    if (winners.length < 2) return { ok: false, why: 'cannot see the rivals', log, r };
    const keeper = winners[0];
    const tally = new Map();
    for (let k = 1; k < winners.length; k++)
      for (const i of winners[k]) if (!keeper.has(i)) tally.set(i, (tally.get(i) || 0) + 1);
    /* Two layouts can fill exactly the same CELLS and still be different
       track — one holds a north-south straight where the other holds a
       junction, say. No obstacle can separate those, because an obstacle only
       takes cells away. The board is rejected rather than pinned. */
    if (!tally.size) return { ok: false, why: 'rivals use the same cells, differently', log, r };
    let best = -1, bestN = 0;
    for (const [i, n] of tally) if (n > bestN) { bestN = n; best = i; }
    const sp = specOf(at);
    sp.rocks.push(rc(at, best)); sp.budget = 999;
    const nr = assess(M.buildLevel(sp), { slack, msBudget: ms });
    if (!nr) return { ok: false, why: 'the rock broke it', log, r };
    log[log.length - 1] += `  -> rock at ${rc(at, best)} kills ${bestN} of ${winners.length - 1}`;
    r = nr;
  }
  return { ok: false, why: 'ran out of rocks', log, r };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Safe here: run directly, this file is the entry and generate.mjs does not
  // reach back for pin() until something calls harvest.
  const { candidate, assess, specOf } = await import('./generate.mjs');
  let ok = 0;
  const seeds = Number(process.argv[2] || 8);
  for (let s = 1; s <= seeds; s++) {
    const t0 = Date.now();
    const res = pin(candidate(s), { slack: 2, assess, specOf });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(res.ok
      ? `seed ${s}: PINNED with ${res.rocksAdded} rock(s) — budget ${res.r.budget}, decoys ${res.r.decoys} (${secs}s)`
      : `seed ${s}: ${res.why} (${secs}s)`);
    if (res.ok) ok++;
  }
  console.log(`\npinned ${ok} of ${seeds}`);
}
