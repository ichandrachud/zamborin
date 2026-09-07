/* ============================================================
   Junction · the difficulty gate
   ============================================================

   Run it:  node junction/gate.mjs

   THIS EXISTS BECAUSE THE OWNER SOLVED TIER 5 ON THE FIRST TRY. The reason
   turned out to be measurable and blunt, and no amount of looking at the board
   would have shown it: on every level in the game, laying each engine its own
   SHORTEST route while ignoring every other engine, and then trying the switch
   settings, wins. The trains never have to be thought about together. That is
   a maze, not a puzzle.

   So this reports three numbers for a level, and the first is the gate:

     GREEDY WINS. Route each train alone, shortest way. If that gets everybody
       home, the level asks nothing. Every level currently in the game fails
       here, including the tier-5 board.

     THE SWITCH SEARCH. Junctions, and how many of the 2^junctions settings
       win. Two junctions is four settings and a player will simply try all
       four — which is exactly what "one try" looked like. A decision you can
       exhaust is not a decision.

     THE SLACK. Budget minus par. This is the only dial currently doing any
       work, and it cannot do it alone: tier 5 has three sleepers spare, and
       the greedy layout comes in UNDER par at 30 against 31, so the budget
       never bites.

   AND ONE LAW ANY GENERATOR HAS TO OBEY, found by building four harder boards
   and watching every one of them fail. A junction MERGES one way and SPLITS
   the other, and switches do not move during a run — so two engines running
   the same track in the SAME direction meet every junction on it from the same
   side, and the switch sends them both the same way.

     TRAINS THAT SHARE TRACK IN ONE DIRECTION MUST SHARE A DESTINATION.

   Measured, with its control, in tests.mjs. Two engines down one shared trunk
   toward two sheds: zero of two settings win and the best case is one of them
   home. The same sharing run in OPPOSITE directions — which is level 1 — wins
   in one setting of four, at 7x7 and at 11x11 alike.

   The consequence is worth stating plainly, because it was the plan: MORE
   JUNCTIONS CANNOT BY ITSELF MAKE THIS GAME HARDER. A junction on a one-way
   trunk separates nothing, so adding them adds settings to try without adding
   a decision. The only thing that separates two trains is running the same
   track in opposite directions at different times, which makes ORDER the one
   real source of difficulty here — and order is bought with route length,
   which the budget prices.

   WHAT IT DELIBERATELY DOES NOT CLAIM. It does not say a level is solvable, or
   what the cheapest winning layout costs. Finding that needs a real search
   over layouts, and three quick ones written while investigating this were all
   too narrow to trust: shortest-route-per-gap misses answers that share track,
   and route-one-then-keep-clear cannot even start, because sharing track is
   the whole mechanic. A gate that reported "unsolvable" from any of those
   would have been confidently wrong. That solver is M2's job and this file
   should grow a fourth number when it exists.
*/
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('./model.js');
const { N, E, S, W } = M;

function shortest(lvl, from, to, banned) {
  const prev = new Map([[from, -1]]), q = [from];
  while (q.length) {
    const cur = q.shift();
    if (cur === to) break;
    for (const d of [N, E, S, W]) {
      const nx = M.neighbour(lvl, cur, d);
      if (nx < 0 || prev.has(nx) || (banned && banned.has(nx))) continue;
      if (nx !== to && lvl.kind[nx] !== M.EMPTY) continue;
      prev.set(nx, cur); q.push(nx);
    }
  }
  if (!prev.has(to)) return null;
  const path = []; let c = to;
  while (c >= 0) { path.unshift(c); c = prev.get(c); }
  return path;
}
function segmentsOf(lvl, cells) {
  const out = [];
  for (let k = 1; k < cells.length - 1; k++) {
    const i = cells[k];
    const a = M.sideBetween(lvl, i, cells[k - 1]);
    const b = M.sideBetween(lvl, i, cells[k + 1]);
    if (a < 0 || b < 0 || a === b) return null;
    out.push([Math.floor(i / lvl.C), i % lvl.C, a, b]);
  }
  return out;
}
function anySettingWins(lvl, track) {
  const js = [];
  for (let i = 0; i < lvl.size; i++) if (M.isJunction(track[i])) js.push(i);
  if (js.length > 20) return { junctions: js.length, tooMany: true };
  let winning = 0;
  for (let m = 0; m < (1 << js.length); m++) {
    const c = M.cloneTrack(track);
    js.forEach((i, k) => { if (m & (1 << k)) M.toggleSwitch(c, i); });
    if (M.runToEnd(lvl, c).won) winning++;
  }
  return { junctions: js.length, settings: 1 << js.length, winning };
}

export function gate(lvl, label) {
  const wanted = [];
  for (const p of lvl.portals) for (const colour of p.queue) wanted.push({ p, colour });
  const routes = wanted.map((w) => {
    const home = lvl.depots.find((d) => d.colour === w.colour);
    const start = M.neighbour(lvl, w.p.i, w.p.face);
    const mouth = M.neighbour(lvl, home.i, home.face);
    if (start < 0 || mouth < 0) return null;
    const cells = shortest(lvl, start, mouth);
    return cells && segmentsOf(lvl, [w.p.i, ...cells, home.i]);
  });
  let greedy = { ok: false, why: 'no route' };
  if (routes.every(Boolean)) {
    try {
      const t = M.layout(lvl, [].concat(...routes));
      greedy = { ok: true, cost: M.sleepers(t), ...anySettingWins(lvl, t) };
      greedy.wins = greedy.winning > 0;
    } catch (e) { greedy = { ok: false, why: 'illegal layout: ' + e.message }; }
  }
  const authored = lvl.solution && lvl.solution.length
    ? (() => { const t = M.layout(lvl, lvl.solution);
               return { cost: M.sleepers(t), ...anySettingWins(lvl, t) }; })()
    : null;
  return {
    label, board: lvl.R + 'x' + lvl.C, trains: wanted.length,
    colours: new Set(wanted.map((w) => w.colour)).size,
    par: lvl.par, budget: lvl.budget, slack: lvl.budget - lvl.par,
    greedy, authored,
    verdict: greedy.wins ? 'TRIVIAL — greedy routing wins' : 'greedy does not win',
  };
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const rows = [
    gate(M.getLevel(1), 'level 1, authored 7x7'),
    gate(M.level1(7, 11), 'level 1 at 7x11, a phone'),
    gate(M.level1(9, 7), 'level 1 at 9x7, the desktop frame'),
    gate(M.getLevel(33), 'level 33, tier 5'),
  ];
  const pad = (s, n) => String(s).padEnd(n);
  console.log('\n' + pad('level', 30) + pad('board', 8) + pad('trains', 8) +
              pad('slack', 7) + pad('junc', 6) + pad('wins/settings', 15) + 'verdict');
  for (const r of rows) {
    const a = r.authored || {};
    console.log(pad(r.label, 30) + pad(r.board, 8) + pad(r.trains + '/' + r.colours + 'c', 8) +
                pad(r.slack, 7) + pad(a.junctions, 6) +
                pad((a.winning || 0) + '/' + (a.settings || 0), 15) + r.verdict);
  }
  console.log('\ngreedy cost against par:');
  for (const r of rows) {
    console.log('  ' + pad(r.label, 30) +
      'greedy ' + pad(r.greedy.cost, 5) + ' par ' + pad(r.par, 5) +
      (r.greedy.cost <= r.par ? '  (greedy is CHEAPER than the authored answer)' : ''));
  }
  const bad = rows.filter((r) => r.greedy.wins).length;
  console.log('\n' + bad + ' of ' + rows.length + ' levels are solved by greedy routing.\n');
}
