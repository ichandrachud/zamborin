/* ============================================================
   Junction · how many ways are there to win?
   ============================================================

   Run it:  node junction/unique.mjs

   THE OWNER'S RULE: exactly one solution, and exactly the rails to build it.
   That is only a rule if something can check it, and checking it is the whole
   of this file.

   WHAT IT FOUND, and it is not comfortable. The ordering board at 10x7 was
   authored with a par of 23 and a budget of 23. Enumerated exhaustively, it
   has 3,523 distinct winning layouts — and the cheapest of them costs 20, so
   the authored par was three rails too generous and the "exact number of
   rails" was not exact at all.

     cost 20 · 52 winners        cost 22 · 675
     cost 21 · 153               cost 23 · 2,643

   Two things follow for the generator. PAR MUST BE MEASURED, not authored: it
   is the cheapest cost anything wins at, which only a search can tell you. And
   even at that true minimum there were 52 answers, so a board reaches ONE
   solution by constraining routes — obstacles, tighter geometry, more traffic
   — and never by tightening the budget alone.

   THE PRUNE IS ADMISSIBLE AND THAT IS THE POINT. A partial route is abandoned
   only when the length it has spent plus the straight-line distance still to
   go already exceeds the bound, which cannot discard a route that would have
   fitted. Prism shipped levels called unique because a solver pruned on a
   guess; the strict search then found second answers. A uniqueness claim is
   worth exactly as much as the search behind it.

   COST. Exhaustive means exhaustive: 10x7 takes about a minute at slack 6,
   12x9 does not finish. Certification is a property of SMALL boards, which is
   itself a design constraint worth knowing before 72 levels are generated.
*/
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('./model.js');
const { N, E, S, W } = M;

const rc = (lvl, i) => [Math.floor(i / lvl.C), i % lvl.C];
const straightLine = (lvl, a, b) => {
  const [ar, ac] = rc(lvl, a), [br, bc] = rc(lvl, b);
  return Math.abs(ar - br) + Math.abs(ac - bc);
};
function allRoutes(lvl, from, to, maxLen) {
  const out = [], seen = new Set([from]), path = [from];
  (function dfs(cur, len) {
    if (cur === to) { out.push(path.slice()); return; }
    if (len + straightLine(lvl, cur, to) > maxLen) return;   // admissible
    for (const d of [N, E, S, W]) {
      const nx = M.neighbour(lvl, cur, d);
      if (nx < 0 || seen.has(nx)) continue;
      if (nx !== to && lvl.kind[nx] !== M.EMPTY) continue;
      seen.add(nx); path.push(nx); dfs(nx, len + 1); path.pop(); seen.delete(nx);
    }
  })(from, 0);
  return out;
}
const segmentsOf = (lvl, cells) => {
  const out = [];
  for (let k = 1; k < cells.length - 1; k++) {
    const i = cells[k];
    const a = M.sideBetween(lvl, i, cells[k - 1]), b = M.sideBetween(lvl, i, cells[k + 1]);
    if (a < 0 || b < 0 || a === b) return null;
    out.push([Math.floor(i / lvl.C), i % lvl.C, a, b]);
  }
  return out;
};
export function certify(lvl, slack) {
  const wanted = [];
  for (const p of lvl.portals) for (const colour of p.queue) wanted.push({ p, colour });
  const legs = wanted.map((wt) => {
    const home = lvl.depots.find((d) => d.colour === wt.colour);
    const start = M.neighbour(lvl, wt.p.i, wt.p.face);
    const mouth = M.neighbour(lvl, home.i, home.face);
    return allRoutes(lvl, start, mouth, straightLine(lvl, start, mouth) + slack)
      .map((c) => segmentsOf(lvl, [wt.p.i, ...c, home.i])).filter(Boolean);
  });
  const winners = new Map();
  let laid = 0;
  const walk = (k, acc) => {
    if (k === legs.length) {
      let t; try { t = M.layout(lvl, [].concat(...acc)); } catch (e) { return; }
      const cost = M.sleepers(t);
      if (cost > lvl.budget) return;
      laid++;
      const js = [];
      for (let i = 0; i < lvl.size; i++) if (M.isJunction(t[i])) js.push(i);
      if (js.length > 16) return;
      for (let m = 0; m < (1 << js.length); m++) {
        const c = M.cloneTrack(t);
        js.forEach((i, n) => { if (m & (1 << n)) M.toggleSwitch(c, i); });
        if (!M.runToEnd(lvl, c).won) continue;
        /* TWO KEYS, and the difference matters. `rails` is the track alone;
           `key` adds the switch settings. A junction keeps whichever branch
           was laid first, so the same physical setting is labelled differently
           depending on build order — which makes the switch count
           order-sensitive and the RAIL count the honest measure of "one
           solution". */
        const rails = c.map((x, i) => x
          ? i + '[' + x.segs.map((g) => g.slice().sort().join('')).sort().join('|') + ']' : '')
          .filter(Boolean).join(' ');
        const key = rails + ' SW' + c.map((x) => (x ? x.sw : '')).join('');
        if (!winners.has(key)) winners.set(key, { cost, rails, segs: [].concat(...acc) });
      }
      return;
    }
    for (const o of legs[k]) walk(k + 1, acc.concat([o]));
  };
  walk(0, []);
  const byCost = {}, railsByCost = {};
  for (const v of winners.values()) {
    byCost[v.cost] = (byCost[v.cost] || 0) + 1;
    (railsByCost[v.cost] = railsByCost[v.cost] || new Set()).add(v.rails);
  }
  const costs = Object.keys(byCost).map(Number).sort((a, b) => a - b);
  return {
    routeOptions: legs.map((l) => l.length), combinationsWithinBudget: laid,
    distinctWinningLayouts: winners.size, byCost,
    distinctRailLayouts: new Set([...winners.values()].map((v) => v.rails)).size,

    trueMinimumCost: costs[0] ?? null,
    railLayoutsAtTrueMinimum: costs.length ? railsByCost[costs[0]].size : 0,
    /* One layout that achieves the true minimum, so a level can ADOPT the
       cheapest real answer as its solution instead of shipping whichever one
       its author happened to think of. */
    cheapestSolution: costs.length
      ? [...winners.values()].find((v) => v.cost === costs[0]).segs : null,
    answersAtTrueMinimum: costs.length ? byCost[costs[0]] : 0,
    parIsExact: costs.length ? costs[0] === lvl.budget : false,
    // "one solution" means one set of RAILS; see the note on switch labelling
    unique: costs.length ? railsByCost[costs[0]].size === 1 : false,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const lvl = M.orderLevel(10, 7);
  console.log('the ordering board at 10x7 — authored par ' + lvl.par + ', budget ' + lvl.budget);
  const r = certify(lvl, 6);
  console.log(JSON.stringify(r, null, 2));
  console.log(r.unique ? '\nUNIQUE.' :
    '\nNOT unique: ' + r.distinctWinningLayouts + ' winning layouts, cheapest at ' +
    r.trueMinimumCost + ' where there are already ' + r.answersAtTrueMinimum + '.\n');
}
