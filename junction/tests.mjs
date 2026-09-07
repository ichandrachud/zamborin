/* Junction — model tests. `node junction/tests.mjs` from the repo root.

   These are the claims the brief makes that a person cannot check by looking:
   that the level is completable, that a wrong route RUNS rather than being
   refused, that a wrong-colour train parks, that the same track twice gives
   the same run, and that the junction asymmetry the design rests on is really
   in the code. Each one is checked against a case that is known to go the
   OTHER way as well, because a test that only ever sees pass has not been
   shown to be able to fail. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('./model.js');

const { N, E, S, W } = M;
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '   ' + detail : '')); }
};
const head = (s) => console.log('\n' + s);

// ---------- the level itself ----------
head('level 1');
const L = M.authored(1);
const problems = M.validate(L);
ok('validates', problems.length === 0, problems.join('; '));
ok('is 7x7', L.R === 7 && L.C === 7);
ok('two portals, two depots', L.portals.length === 2 && L.depots.length === 2);

// ---------- the reference solution ----------
head('the reference solution');
const solved = M.layout(L, L.solution);
ok('costs par', M.sleepers(solved) === L.par, 'sleepers ' + M.sleepers(solved) + ' par ' + L.par);
ok('is inside the budget', M.sleepers(solved) <= L.budget,
   M.sleepers(solved) + ' of ' + L.budget);

const J1 = 1 * 7 + 3, J2 = 3 * 7 + 3;
ok('builds a junction at J1', M.isJunction(solved[J1]));
ok('builds a junction at J2', M.isJunction(solved[J2]));
ok('builds only those two junctions',
   solved.filter((c) => M.isJunction(c)).length === 2);

/* The switch has to MATTER, and the only honest way to show that is to run the
   same track both ways round and get different answers. If both settings won,
   the junction would be decoration. */
head('the switch is load bearing');
const asDrawn = M.runToEnd(L, solved);
ok('as drawn, the yard does not solve itself', !asDrawn.won);
const flipped = M.cloneTrack(solved);
M.toggleSwitch(flipped, J1);
const afterFlip = M.runToEnd(L, flipped);
ok('one flip at J1 wins it', afterFlip.won);
ok('that flip is the only one needed',
   M.isJunction(flipped[J2]) && flipped[J2].sw === solved[J2].sw);

// ---------- the asymmetry the design rests on ----------
head('a junction merges one way and splits the other');
const j = { segs: [[N, E], [N, S]], sw: 0 };     // trunk N, branches E and S
ok('trunk is the shared side', M.trunkOf(j) === N);
ok('from the trunk, the switch decides (sw 0)', M.exitSide(j, N) === E);
j.sw = 1;
ok('from the trunk, the switch decides (sw 1)', M.exitSide(j, N) === S);
ok('from a branch, always the trunk, whatever the switch', M.exitSide(j, E) === N);
ok('from the other branch, the same', M.exitSide(j, S) === N);
j.sw = 0;
ok('from a branch, still the trunk with the switch back', M.exitSide(j, S) === N);

// ---------- a wrong route runs ----------
head('a wrong route RUNS');
/* Coral is sent down teal's line instead of to its own shed. Nothing refuses
   it. It should reach the end of the rail and stop there, with the run
   completing rather than hanging. */
const wrong = M.cloneTrack(solved);
M.toggleSwitch(wrong, J2);
const wrongRun = M.runToEnd(L, wrong);
ok('the run completes', wrongRun.settled);
ok('it does not win', !wrongRun.won);
ok('nothing vanished', wrongRun.trains.length === 2);
ok('no train is left mid-move',
   wrongRun.trains.every((t) => t.state !== 'moving' && t.state !== 'parking'));

/* THE ACCEPTANCE CRITERION, section 12: a wrong-colour train parks and the run
   completes. Built as its own board so the claim is unambiguous — one engine,
   two sheds, the switch pointed at the shed that is not its colour. */
head('a wrong-colour train parks, and the run completes');
const wrongDepot = M.buildLevel({
  n: 99, R: 7, C: 7, rocks: [],
  portals: [{ at: [3, 0], face: E, queue: [0] }],
  depots: [{ at: [0, 3], face: S, colour: 0 }, { at: [6, 3], face: N, colour: 0 }],
  budget: 40,
});
// A trunk east along row 3 to a junction at (3,3) that can feed north or south.
const wdTrack = M.layout(wrongDepot, [
  [3, 1, W, E], [3, 2, W, E],
  [3, 3, W, N], [3, 3, W, S],          // junction: trunk W, branches N and S
  [2, 3, S, N], [1, 3, S, N],           // up to the north shed
  [4, 3, N, S], [5, 3, N, S],           // down to the south shed
]);
ok('the board builds a junction', M.isJunction(wdTrack[3 * 7 + 3]));
const north = M.runToEnd(wrongDepot, wdTrack);
ok('with the switch as drawn it parks north',
   north.settled && north.trains[0].state === 'parked' && north.trains[0].cell === 0 * 7 + 3);
const wdFlip = M.cloneTrack(wdTrack);
M.toggleSwitch(wdFlip, 3 * 7 + 3);
const south = M.runToEnd(wrongDepot, wdFlip);
ok('flipped, it parks south instead',
   south.settled && south.trains[0].state === 'parked' && south.trains[0].cell === 6 * 7 + 3);

// Now make the SOUTH shed the wrong colour for this engine and prove it still
// parks there, cheerfully, and that the run ends.
const wrongColour = M.buildLevel({
  n: 98, R: 7, C: 7, rocks: [],
  portals: [{ at: [3, 0], face: E, queue: [0] }, { at: [3, 6], face: W, queue: [2] }],
  depots: [{ at: [0, 3], face: S, colour: 0 }, { at: [6, 3], face: N, colour: 2 }],
  budget: 40,
});
const wcTrack = M.layout(wrongColour, [
  [3, 1, W, E], [3, 2, W, E], [3, 3, W, S], [3, 3, W, N],
  [4, 3, N, S], [5, 3, N, S], [2, 3, S, N], [1, 3, S, N],
]);
const wc = M.runToEnd(wrongColour, wcTrack);
const coral = wc.trains[0];
ok('the coral engine parks', coral.state === 'parked');
ok('it parks in the TEAL shed', wrongColour.colour[coral.cell] === 2 && coral.colour === 0);
ok('and the run completes anyway', wc.settled);
ok('and it is not a win', !wc.won);

// ---------- the meeting rule ----------
head('two trains meet and wait');
ok('level 1 as solved makes them meet', afterFlip.meetings >= 1,
   'meetings ' + afterFlip.meetings);
ok('and they still both get home', afterFlip.won);
/* Head on, with nowhere to go: the calm deadlock the brief asks for. A single
   corridor, two engines entering it from opposite ends at the same moment. */
const headOn = M.buildLevel({
  n: 97, R: 7, C: 7, rocks: [],
  portals: [{ at: [3, 0], face: E, queue: [0] }, { at: [3, 6], face: W, queue: [2] }],
  depots: [{ at: [0, 3], face: S, colour: 0 }, { at: [6, 3], face: N, colour: 2 }],
  budget: 40,
});
const hoTrack = M.layout(headOn, [
  [3, 1, W, E], [3, 2, W, E], [3, 3, W, E], [3, 4, W, E], [3, 5, W, E],
]);
const ho = M.runToEnd(headOn, hoTrack);
ok('the run settles rather than hanging', ho.settled);
ok('both engines are still on the board',
   ho.trains.every((t) => t.state === 'waiting' || t.state === 'stopped'));
ok('nobody won', !ho.won);
ok('nothing crashed, they are nose to nose',
   Math.abs(ho.trains[0].cell - ho.trains[1].cell) === 1);

// ---------- determinism ----------
head('determinism');
const a = M.runToEnd(L, M.cloneTrack(flipped));
const b = M.runToEnd(L, M.cloneTrack(flipped));
const shape = (r) => JSON.stringify({
  steps: r.steps, won: r.won, meetings: r.meetings,
  t: r.trains.map((x) => [x.cell, x.state, Math.round(x.prog * 1e6), Math.round(x.parkedAt * 1e6)]),
});
ok('same track, same run, exactly', shape(a) === shape(b));
ok('and it is not a trivial match', a.steps > 100 && a.trains.length === 2);

// ---------- drawing ----------
head('drawing');
const t0 = M.newTrack(L.size);
const straight = M.validateStroke(L, t0, [0 * 7 + 1, 1 * 7 + 1, 1 * 7 + 2]);
ok('a stroke out of the tunnel mouth is legal', straight.ok, straight.why);
ok('and costs one sleeper per cell', straight.cost === 2, 'cost ' + straight.cost);
const sideways = M.validateStroke(L, t0, [1 * 7 + 1, 1 * 7 + 2, 2 * 7 + 2]);
ok('a stroke into a rock is refused', !sideways.ok && sideways.why === 'rock', sideways.why);
const backwards = M.validateStroke(L, t0, [0 * 7 + 1, 0 * 7 + 2]);
ok('a stroke out of a tunnel SIDE is refused', !backwards.ok, backwards.why);

/* The four-way is excluded, and this is the check that keeps it excluded. Lay
   a straight, then try to cross it at a right angle in the same cell. */
const crossed = M.newTrack(L.size);
M.addSegment(crossed, 4 * 7 + 3, N, S);
const across = M.validateStroke(L, crossed, [4 * 7 + 2, 4 * 7 + 3, 4 * 7 + 4]);
ok('a four-way crossing is refused', !across.ok && across.why === 'would cross', across.why);
const into = M.validateStroke(L, crossed, [5 * 7 + 3, 4 * 7 + 3, 4 * 7 + 4]);
ok('but a three-way junction over the same cell is fine', into.ok, into.why);
const j2 = into.track[4 * 7 + 3];
ok('and it really is a junction', M.isJunction(j2));
ok('with the shared side as its trunk', M.trunkOf(j2) === N || M.trunkOf(j2) === S);

const full = into.track;
const third = M.validateStroke(L, full, [4 * 7 + 2, 4 * 7 + 3, 3 * 7 + 3]);
ok('a third segment in one cell is refused', !third.ok, third.why);

/* AN OPEN END ATTACHES TO WHAT IT IS TOUCHING. Both ends of a stroke used to
   carry straight on, which laid a stub into the grass beside every shed door
   and every rail end the player was drawing out of. Each case below is paired
   with the control that must still go the other way, because the rule is only
   worth anything if it leaves a line drawn past a doorway alone. */
head('a stroke attaches to what it touches');
const tA = M.newTrack(L.size);
const outOfShed = M.validateStroke(L, tA, [1 * 7 + 1, 1 * 7 + 2]);
const firstPiece = outOfShed.adds[0];
ok('drawn away from a tunnel, the first cell still turns into its mouth',
   outOfShed.ok && firstPiece.i === 1 * 7 + 1 && firstPiece.a === N && firstPiece.b === E,
   JSON.stringify(firstPiece));
const inTheOpen = M.validateStroke(L, tA, [4 * 7 + 1, 4 * 7 + 2]);
ok('and in the open it is still a straight', inTheOpen.adds[0].a === W,
   JSON.stringify(inTheOpen.adds[0]));

const intoShed = M.validateStroke(L, tA, [1 * 7 + 3, 1 * 7 + 4, 1 * 7 + 5]);
const lastPiece = intoShed.adds[intoShed.adds.length - 1];
ok('a stroke that stops beside a shed door curves into it',
   intoShed.ok && lastPiece.i === 1 * 7 + 5 && lastPiece.a === W && lastPiece.b === N,
   JSON.stringify(lastPiece));
const stopsShort = M.validateStroke(L, tA, [1 * 7 + 2, 1 * 7 + 3, 1 * 7 + 4]);
const shortLast = stopsShort.adds[stopsShort.adds.length - 1];
ok('one cell short of the door it carries straight on', shortLast.b === E,
   JSON.stringify(shortLast));

// starting ON a rail, at right angles to it: the anchor used to lay nothing at
// all, so the new line began one cell away, joined to nothing.
const tB = M.newTrack(L.size);
M.addSegment(tB, 4 * 7 + 3, N, S);
const offTheEnd = M.validateStroke(L, tB, [4 * 7 + 3, 4 * 7 + 4]);
ok('a line drawn off an existing rail joins it', offTheEnd.ok &&
   M.isJunction(offTheEnd.track[4 * 7 + 3]), offTheEnd.why);
ok('and the join is a junction on the rail it left', offTheEnd.adds.some(
   (d) => d.i === 4 * 7 + 3 && (d.a === N || d.a === S) && d.b === E),
   JSON.stringify(offTheEnd.adds));
ok('and it costs the sleeper it laid there', offTheEnd.cost === 2,
   'cost ' + offTheEnd.cost);

head('the budget');
const tight = M.buildLevel({
  n: 96, R: 7, C: 7, rocks: [],
  portals: [{ at: [3, 0], face: E, queue: [0] }],
  depots: [{ at: [3, 6], face: W, colour: 0 }],
  budget: 3,
});
const t3 = M.newTrack(tight.size);
const three = M.validateStroke(tight, t3, [3 * 7 + 0, 3 * 7 + 1, 3 * 7 + 2, 3 * 7 + 3]);
ok('a stroke inside the budget is allowed', three.ok, three.why);
const four = M.validateStroke(tight, t3, [3 * 7 + 0, 3 * 7 + 1, 3 * 7 + 2, 3 * 7 + 3, 3 * 7 + 4]);
ok('a stroke past the budget is refused', !four.ok && four.why === 'over budget', four.why);

// ---------- the tier 5 board ----------
head('level 33, the first board of tier 5');
const L5 = M.authored(33);
ok('addressed by number, not position', L5.n === 33);
const p5 = M.validate(L5);
ok('validates', p5.length === 0, p5.join('; '));
ok('is 9x9, the tier 5 grid', L5.R === 9 && L5.C === 9 && M.TUNE.gridByTier[L5.tier] === 9);
ok('carries three engines, the tier 5 count',
   L5.portals.reduce((a, p) => a + p.queue.length, 0) === M.TUNE.trainsByTier[L5.tier]);
ok('three colours, each with a shed', new Set(L5.depots.map((d) => d.colour)).size === 3);

const s5 = M.layout(L5, L5.solution);
ok('the solution costs par', M.sleepers(s5) === L5.par,
   'sleepers ' + M.sleepers(s5) + ' par ' + L5.par);
ok('it is inside the budget', M.sleepers(s5) <= L5.budget);
ok('the slack matches the tier', L5.budget - L5.par === M.TUNE.budgetSlack[L5.tier],
   'slack ' + (L5.budget - L5.par));
const J5a = 2 * 9 + 4, J5b = 5 * 9 + 4;
ok('two junctions, at the ends of the corridor',
   s5.filter((c) => M.isJunction(c)).length === 2 && M.isJunction(s5[J5a]) && M.isJunction(s5[J5b]));

/* One flip solves it, and the OTHER setting must not, or the junction is
   decoration. Both arms are run rather than just the winning one. */
const run5a = M.runToEnd(L5, s5);
ok('as drawn it does not solve itself', !run5a.won);
const s5b = M.cloneTrack(s5);
M.toggleSwitch(s5b, J5a);
const run5b = M.runToEnd(L5, s5b);
ok('one flip at the north junction wins it', run5b.won);
ok('all three engines are home',
   run5b.trains.length === 3 && run5b.trains.every((t) => L5.colour[t.cell] === t.colour));
ok('and somebody had to wait for the corridor', run5b.meetings >= 1,
   'meetings ' + run5b.meetings);

/* THE TIER: spacing. Teal takes the long way round the left edge, and the
   three cells that costs are what let coral out of the corridor first. Take
   the detour away for the direct run and the two of them lock nose to nose,
   which is the lesson the board is built to teach. */
const direct = M.layout(L5, L5.solution.filter(
  ([r, c]) => !((r === 7 && c === 0) || (r === 6 && c === 0) || (r === 5 && c === 0) || (r === 7 && c === 1))
).concat([[7, 1, S, N], [6, 1, S, N], [5, 1, S, E]]));
M.toggleSwitch(direct, J5a);
const runDirect = M.runToEnd(L5, direct);
ok('the short way costs less track', M.sleepers(direct) < M.sleepers(s5b),
   M.sleepers(direct) + ' vs ' + M.sleepers(s5b));
ok('and it deadlocks instead of winning', !runDirect.won);
ok('nose to nose rather than hanging',
   runDirect.settled && runDirect.trains.filter((t) => t.state === 'waiting').length >= 1);


/* ---------- PADDING A LEVEL OUT TO THE BOARD ----------
   The core is the puzzle; the board is whatever the frame can hold. These
   tests exist because the padding could quietly destroy the level in one
   specific way — leave the wall where it was and both engines drive round the
   end of it — so the wall extension has a control that proves it is doing the
   work rather than just being present. */
head('a padded level is the same puzzle');
const wallRow = (lvl) => {
  for (let r = 0; r < lvl.R; r++) {
    let rocks = 0;
    for (let c = 0; c < lvl.C; c++) if (lvl.kind[r * lvl.C + c] === M.ROCK) rocks++;
    if (rocks >= lvl.C - 1) return r;
  }
  return -1;
};
const winsAtPar = (lvl) => {
  const t = M.layout(lvl, lvl.solution);
  M.toggleSwitch(t, (lvl.core.padT + 1) * lvl.C + (lvl.core.padL + 3));
  return { won: M.runToEnd(lvl, t).won, sleepers: M.sleepers(t) };
};
const PADS = [[2, 3, 1, 2], [0, 4, 0, 0], [5, 0, 0, 0], [0, 0, 3, 3], [6, 6, 6, 6]];
let padWins = true, padPar = true, padValid = true;
for (const p of PADS) {
  const P = M.padLevel(L, ...p);
  const w = winsAtPar(P);
  if (!w.won) padWins = false;
  if (w.sleepers !== L.par) padPar = false;
  if (M.validate(P).length) padValid = false;
}
ok('the reference solution still wins on every padding', padWins);
ok('and still costs exactly par', padPar, 'par ' + L.par);
ok('a padded level validates', padValid);
ok('budget and par do not move', PADS.every((p) => {
  const P = M.padLevel(L, ...p);
  return P.budget === L.budget && P.par === L.par;
}));

const P1 = M.padLevel(L, 2, 3, 1, 2);
const wr = wallRow(P1);
let gaps = 0;
for (let c = 0; c < P1.C; c++) if (P1.kind[wr * P1.C + c] !== M.ROCK) gaps++;
ok('the wall still runs edge to edge, with one gap', gaps === 1, gaps + ' gaps');

/* THE CONTROL. Without the extension the wall would stop where the core
   stopped and the padding would open a way round its end — which is not a
   subtle loss of difficulty, it is the whole level. */
const unextended = M.buildLevel({
  n: 1, tier: 0, R: P1.R, C: P1.C,
  rocks: [[2, 0], [2, 1], [2, 2], [2, 4], [2, 5], [2, 6]].map(([r, c]) => [r + 2, c + 2]),
  portals: P1.portals.map((p) => ({ at: [p.r, p.c], face: p.face, queue: p.queue })),
  depots: P1.depots.map((d) => ({ at: [d.r, d.c], face: d.face, colour: d.colour })),
  budget: L.budget, par: L.par,
});
let openEnds = 0;
for (let c = 0; c < unextended.C; c++) if (unextended.kind[wr * unextended.C + c] !== M.ROCK) openEnds++;
ok('and without it the row would have five ways through, not one',
   openEnds === 6, openEnds + ' open cells');

/* A clump is not a wall. Level 1 keeps a lineside clump in its top-left
   corner; an earlier rule extended anything touching an edge and turned it
   into a bracket of trees the author never drew. */
const coreRocks = L.kind.filter((k) => k === M.ROCK).length;
const padRocks = P1.kind.filter((k) => k === M.ROCK).length;
ok('a corner clump is not extended into a wall', padRocks === coreRocks + 5,
   coreRocks + ' -> ' + padRocks);

/* ---------- LEVEL 1 AS A SHAPE ----------
   The fleet gives every breakpoint its own grid; Junction now builds level 1
   to whatever board the frame wants instead of padding one square onto both.
   These check the puzzle survives the stretch, and the last pair are the
   control for the rule that looks arbitrary and is not. */
head('level 1 is built to the shape of the board');
function shapeReport(R, C) {
  const lv = M.level1(R, C);
  const t = M.layout(lv, lv.solution);
  const js = [];
  for (let i = 0; i < lv.size; i++) if (M.isJunction(t[i])) js.push(i);
  let wins = 0, meets = -1;
  for (let m = 0; m < (1 << js.length); m++) {
    const c = M.cloneTrack(t);
    js.forEach((i, k) => { if (m & (1 << k)) M.toggleSwitch(c, i); });
    const r = M.runToEnd(lv, c);
    if (r.won) { wins++; if (meets < 0) meets = r.meetings; }
  }
  return { lv, bad: M.validate(lv), junctions: js.length, wins, meets,
           sleepers: M.sleepers(t) };
}
const SHAPES = [[5, 7], [7, 7], [9, 7], [11, 7], [13, 7], [15, 7],
                [7, 9], [7, 11], [7, 13], [9, 9], [9, 11], [11, 9]];
const reps = SHAPES.map(([R, C]) => [R + 'x' + C, shapeReport(R, C)]);
ok('every shape validates', reps.every(([, r]) => r.bad.length === 0),
   reps.filter(([, r]) => r.bad.length).map(([k]) => k).join(' '));
ok('every shape builds exactly two junctions', reps.every(([, r]) => r.junctions === 2));
ok('exactly one switch setting wins, at every shape',
   reps.every(([, r]) => r.wins === 1),
   reps.filter(([, r]) => r.wins !== 1).map(([k, r]) => k + '=' + r.wins).join(' '));
ok('and somebody still waits at the gap, at every shape',
   reps.every(([, r]) => r.meets === 1),
   reps.filter(([, r]) => r.meets !== 1).map(([k, r]) => k + '=' + r.meets).join(' '));
ok('par is the reference solution, counted not guessed',
   reps.every(([, r]) => r.sleepers === r.lv.par));
ok('a bigger board is more track, not more lawn',
   M.level1(13, 7).par > M.level1(7, 7).par && M.level1(7, 13).par > M.level1(7, 7).par,
   M.level1(7, 7).par + ' -> ' + M.level1(13, 7).par + ' / ' + M.level1(7, 13).par);

/* THE ODD-ROW RULE, AND WHY IT IS NOT TIDINESS. The wall sits at floor(R/2).
   With an even count the two engines are the same distance from the gap, reach
   it on the same tick from opposite ends, and lock. gridDims never asks for an
   even number of ranks; this is the arm that shows what would happen if it
   did. */
const evens = [6, 8, 10, 12, 14].map((R) => shapeReport(R, 7));
ok('an even rank count cannot be won at all', evens.every((r) => r.wins === 0));
ok('and the odd one either side of it can',
   [5, 7, 9, 11, 13, 15].every((R) => shapeReport(R, 7).wins === 1));

/* ---------- CARRIAGES ---------- */
head('a train with carriages is longer, and goes all the way in');
const rakeRun = (R, C, n) => {
  const lv = M.level1(R, C, null, [n, n]);
  const t = M.layout(lv, lv.solution);
  const js = [];
  for (let i = 0; i < lv.size; i++) if (M.isJunction(t[i])) js.push(i);
  for (let m = 0; m < (1 << js.length); m++) {
    const c = M.cloneTrack(t);
    js.forEach((i, k) => { if (m & (1 << k)) M.toggleSwitch(c, i); });
    const r = M.runToEnd(lv, c);
    if (r.won) return r;
  }
  return null;
};
const RAKES = [[7, 11], [9, 7], [11, 7], [9, 9], [13, 7]];
ok('a rake still gets home, at every shape that fits it',
   RAKES.every(([R, C]) => [0, 1, 2, 3].every((n) => !!rakeRun(R, C, n))));
/* THE WHOLE TRAIN GOES IN. Parking used to stop when the engine reached the
   middle of the shed, which left the carriages standing out in the yard. The
   nose runs on one cell per vehicle, so prog ends at 0.5 + cars. */
ok('and every vehicle is inside the shed, not just the engine',
   RAKES.every(([R, C]) => [0, 1, 2, 3].every((n) => {
     const r = rakeRun(R, C, n);
     return r.trains.every((t) => Math.abs(t.prog - (0.5 + n)) < 0.01);
   })));
/* WHAT LENGTH ACTUALLY BUYS, and the first answer was wrong. Carriages
   appeared to jam a small board — 7x7 dying at four of them — but that was a
   PARKED train still holding the cells its trail ran through, blocking its own
   approach for good. Once a train pulls into the shed and lets go, no rake
   jams level 1 at all; it only costs time, about 0.9s a vehicle, which is one
   cell at 2.2 cells a second.

   Length is still real, and the honest demonstration is this: a board where
   the two engines never contend can be given a contention by lengthening the
   one that goes FIRST, because its tail is still in the corridor when the
   other arrives. Which train you lengthen matters, not just by how much —
   the same rake on the follower changes nothing. */
const meets = (g, rake) => {
  const lv = M.level1(9, 9, g, rake);
  const t = M.layout(lv, lv.solution);
  const js = [];
  for (let i = 0; i < lv.size; i++) if (M.isJunction(t[i])) js.push(i);
  for (let m = 0; m < (1 << js.length); m++) {
    const c = M.cloneTrack(t);
    js.forEach((i, k) => { if (m & (1 << k)) M.toggleSwitch(c, i); });
    const r = M.runToEnd(lv, c);
    if (r.won) return r.meetings;
  }
  return -1;
};
ok('with a wide gap the two engines never contend', meets(5, [0, 0]) === 0);
ok('a rake on the LEADER makes them contend', meets(5, [4, 0]) === 1);
ok('the same rake on the follower does not', meets(5, [0, 4]) === 0);
ok('no rake jams level 1 once a parked train lets go of its track',
   [0, 2, 4, 6, 8, 10].every((n) => !!rakeRun(7, 7, n)));
const clock = (n) => { const r = rakeRun(9, 9, n); return r ? r.time : -1; };
/* TWO cells a carriage, not one, and the factor of two is the mechanic. Both
   engines carry the rake here, so every vehicle added costs the follower a
   cell of WAITING while the leader clears the corridor, and then another cell
   of its own pulling into the shed. At 2.2 cells a second that is 0.91s. */
ok('length costs time instead — two cells a carriage when both are lengthened',
   clock(4) > clock(0) && Math.abs((clock(4) - clock(0)) / 4 - 2 / 2.2) < 0.1,
   ((clock(4) - clock(0)) / 4).toFixed(2) + 's per carriage');
const solo = (n) => { const lv = M.level1(9, 9, 3, [n, 0]);
  const t = M.layout(lv, lv.solution);
  const js = []; for (let i = 0; i < lv.size; i++) if (M.isJunction(t[i])) js.push(i);
  for (let m = 0; m < (1 << js.length); m++) { const c = M.cloneTrack(t);
    js.forEach((i, k) => { if (m & (1 << k)) M.toggleSwitch(c, i); });
    const r = M.runToEnd(lv, c); if (r.won) return r.time; }
  return -1; };
ok('and the control: lengthen only one and it is about one cell',
   Math.abs((solo(4) - solo(0)) / 4 - 1 / 2.2) < 0.12,
   ((solo(4) - solo(0)) / 4).toFixed(2) + 's per carriage');

/* ---------- THE LAW THAT BOUNDS EVERY LEVEL ----------
   Found while trying to build a harder board and failing four times. A
   junction MERGES one way and SPLITS the other: a train arriving from the
   trunk is sent wherever the switch points, and a train arriving from a branch
   always goes to the trunk. Switches do not move during a run.

   So two trains that run the same piece of track in the SAME direction both
   arrive at every junction on it from the same side, and the switch sends them
   both the same way. They cannot end up in different sheds — not with more
   junctions, not with a bigger board, not with any setting.

   TRAINS THAT SHARE TRACK IN ONE DIRECTION MUST SHARE A DESTINATION.

   Which is why "add more junctions" cannot by itself make Junction harder: a
   junction on a one-way trunk separates nothing. The only thing that separates
   two trains is using the same track in OPPOSITE directions at different
   times, and that is a question of ORDER — which is where the difficulty has
   to come from. */
head('trains sharing track one way must share a destination');
const tryEverySetting = (lv, sol) => {
  const t = M.layout(lv, sol);
  const js = [];
  for (let i = 0; i < lv.size; i++) if (M.isJunction(t[i])) js.push(i);
  let wins = 0, bestHome = 0;
  for (let m = 0; m < (1 << js.length); m++) {
    const c = M.cloneTrack(t);
    js.forEach((i, k) => { if (m & (1 << k)) M.toggleSwitch(c, i); });
    const r = M.runToEnd(lv, c);
    bestHome = Math.max(bestHome, r.trains.filter(
      (x) => x.state === 'parked' && lv.colour[x.cell] === x.colour).length);
    if (r.won) wins++;
  }
  return { junctions: js.length, settings: 1 << js.length, wins, bestHome };
};
const sg = (r, c, a, b) => [r, c, a, b];
const oneWay = M.buildLevel({
  n: 1, tier: 0, R: 5, C: 7, rocks: [],
  portals: [{ at: [0, 0], face: S, queue: [0] }, { at: [4, 0], face: N, queue: [1] }],
  depots: [{ at: [0, 6], face: S, colour: 0 }, { at: [4, 6], face: N, colour: 1 }],
  budget: 99, par: 0,
});
const oneWaySol = [sg(1, 0, N, S), sg(2, 0, N, E), sg(3, 0, S, N),
                   sg(2, 1, W, E), sg(2, 2, W, E), sg(2, 3, W, E), sg(2, 4, W, E),
                   sg(2, 5, W, N), sg(2, 5, W, S), sg(1, 5, S, E), sg(3, 5, N, E),
                   sg(1, 6, W, N), sg(3, 6, W, S)];
const oneWayResult = tryEverySetting(oneWay, oneWaySol);
ok('two engines down one shared trunk cannot reach two sheds',
   oneWayResult.wins === 0, JSON.stringify(oneWayResult));
ok('and the best any setting manages is one of the two home',
   oneWayResult.bestHome === 1, 'best ' + oneWayResult.bestHome);

/* THE CONTROL, and without it the test above only proves the board is broken.
   Level 1 shares a spine too — three cells of it — but the two engines run it
   in OPPOSITE directions, so each meets the junctions from a different side.
   One setting of four gets both home. */
const bothWays = tryEverySetting(L, L.solution);
ok('the SAME sharing in opposite directions does reach two sheds',
   bothWays.wins === 1 && bothWays.bestHome === 2, JSON.stringify(bothWays));
ok('and it is the structure, not the size — the same holds at 11x11',
   (() => { const big = M.level1(11, 11); const r = tryEverySetting(big, big.solution);
            return r.wins === 1 && r.bestHome === 2; })());

/* ---------- TWO LADDERS, ONE PER BREAKPOINT ----------
   The house rule, stated by the owner and now enforced here: a phone and a
   760x600 frame get DIFFERENT GAMES, not one set of boards shoved into
   whichever frame turned up with decoration filling the gap. These tests exist
   because the first ladder shipped portrait-only and left the desktop frame
   two-thirds empty grass. */
head('the two breakpoints get different boards');
const port = M.LADDERS.portrait, land = M.LADDERS.landscape;
ok('there is a portrait ladder', port.length > 0, port.length + ' levels');
ok('there is a landscape ladder', land.length > 0, land.length + ' levels');
ok('portrait boards are taller than they are wide',
   port.every((l) => l.R > l.C), port.map((l) => l.C + 'x' + l.R).join(' '));
ok('landscape boards are wider than they are tall',
   land.every((l) => l.C > l.R), land.map((l) => l.C + 'x' + l.R).join(' '));
/* AND THEY ARE NOT THE SAME PUZZLES TURNED SIDEWAYS. Each ladder is generated
   from its own range of seeds; turning a board is an isomorphism, so if the
   landscape set were just the portrait set rotated, every budget would match. */
const sameBudgets = port.length === land.length &&
  port.every((l, i) => land[i] && l.budget === land[i].budget &&
                       l.R === land[i].C && l.C === land[i].R);
ok('and they are different puzzles, not one set rotated', !sameBudgets,
   'portrait ' + port.map((l) => l.budget).join(',') +
   ' vs landscape ' + land.map((l) => l.budget).join(','));

/* ---------- THE LADDER IS NOT ONE PUZZLE REPEATED ----------
   The first ladder was twelve levels generated from a single hard-coded board
   shape: one wall, one gap, two engines, with the rocks moved about. It ramped
   perfectly well and it was still the same puzzle twelve times, which is what
   makes a puzzle game dull — sameness rather than difficulty. Six rule changes
   were measured looking for depth and all six were dead ends; the answer was
   more board FAMILIES. These tests are what stops that being quietly undone. */
head('the ladder changes the question, not just the numbers');
const FAM = ['corridor', 'twoGap', 'crossing', 'swap'];
for (const [name, set] of [['portrait', port], ['landscape', land]]) {
  ok(name + ': every level says which family it is from',
     set.every((l) => FAM.includes(l.family)),
     set.map((l) => l.family || '?').join(' '));
  const used = new Set(set.map((l) => l.family));
  ok(name + ': all four families are used', used.size === FAM.length,
     [...used].join(' '));
  // The longest stretch of one family. Blocks are deliberate — a player needs
  // more than one board to learn a shape — but a long block is the old ladder.
  let run = 1, worst = 1;
  for (let i = 1; i < set.length; i++) {
    run = set[i].family === set[i - 1].family ? run + 1 : 1;
    if (run > worst) worst = run;
  }
  ok(name + ': no family runs longer than five levels', worst <= 5, 'longest run ' + worst);
  // And the player meets most of the game early rather than at the end.
  const early = new Set(set.slice(0, 12).map((l) => l.family));
  ok(name + ': at least three families inside the first twelve levels',
     early.size >= 3, [...early].join(' '));
}

/* ---------- EVERY SHIPPED LEVEL IS WINNABLE, THROUGH THE GAME'S OWN MODEL ----
   The certifier said so, but the certifier is a separate program with its own
   copy of the reasoning, and levels.js is written by a generator that nobody
   reads. This lays each level's recorded solution on a fresh track and runs it
   through the model the game actually plays on.

   THE SWITCHES ARE PART OF THE ANSWER, which the first version of this test
   got wrong and every level duly "failed". Laying the rails is not winning:
   a junction keeps whichever branch went down first, so the solution has to be
   run under a switch setting as well, and on level 1 exactly one of sixteen
   settings wins. The count is reported rather than asserted at one, because a
   junction the trains never split at can be set either way and still win. */
head('every generated level can actually be won');
for (const [name, set] of [['portrait', port], ['landscape', land]]) {
  const broken = [], mispriced = [];
  for (const lvl of set) {
    if (!lvl.solution || !lvl.solution.length) { broken.push(lvl.n + ' has no solution'); continue; }
    let track;
    try { track = M.layout(lvl, lvl.solution); } catch (e) { broken.push(lvl.n + ' will not lay: ' + e.message); continue; }
    if (M.sleepers(track) !== lvl.budget)
      mispriced.push(lvl.n + ' costs ' + M.sleepers(track) + ' at budget ' + lvl.budget);
    const js = [];
    for (let i = 0; i < lvl.size; i++) if (M.isJunction(track[i])) js.push(i);
    let wins = 0;
    for (let m = 0; m < (1 << js.length); m++) {
      const c = M.cloneTrack(track);
      js.forEach((i, k) => { if (m & (1 << k)) M.toggleSwitch(c, i); });
      if (M.runToEnd(lvl, c).won) wins++;
    }
    if (!wins) broken.push(lvl.n + ' wins under no switch setting');
  }
  ok(name + ": every level's own solution wins it", broken.length === 0, broken.join('; '));
  ok(name + ': and costs exactly the budget', mispriced.length === 0, mispriced.join('; '));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
