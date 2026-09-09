/* Lift — THE FIRE GATE.
 *
 * The owner's reframe, 2026-09-08: the hotel is on fire, smoke is filling the
 * floors from the fire upward, and the level is over when everyone is out or
 * gone. One building is one level; buildings grow from three floors to ten.
 *
 * WHY THIS IS A DIFFERENT QUESTION FROM tune-gate.mjs. Patience was twelve
 * private clocks: serving one person never moved anyone else's, so the choice
 * of next floor was worth the 1.6s of travel it saved and nothing else, which
 * is what row 1 measured and failed on. Smoke is ONE clock, it SPREADS, and it
 * spreads upward - away from the exit. Going low first can make the top
 * unrecoverable. That is a decision with a floor's worth of consequence in it
 * rather than a second's, and this file exists to find out whether that is
 * true or merely plausible.
 *
 * THE GATE IS JUNCTION'S, NOT ROW 1'S. This is a level game now, so the house
 * rule for levels applies: a level is CERTIFIED when a planner can save
 * everyone AND every greedy rule loses somebody. Winnable but not obvious. The
 * number that matters is the YIELD - what share of generated buildings are
 * certifiable - because that is what decides whether there is a game here or a
 * generator that mostly makes rubbish.
 *
 * SIX GREEDY RULES, NOT ONE. Last time a weak planner nearly got blamed for a
 * real result; the mirror of that mistake is a weak greedy making a dull game
 * look clever. So the greedy set includes both dump-when-full and dump-at-once
 * variants of the obvious rules, and the level only certifies if ALL of them
 * lose someone.
 *
 * Run: node lift/tune-fire.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('./model.js');
const T = M.TUNE;

/* ---------- constants of the fire ---------- */
const CAP = 4;
const DOOR = T.doorS, BOARD = T.boardS;
const TOL = 12;          // seconds of full smoke a person survives
const INGRESS = 0.55;    // how fast an open door loads the car with smoke
const DECAY = 0.10;      // how fast the car clears once the doors shut
const DT = 0.2;          // real sim step
const RDT = 0.25;        // rollout step inside the planner

/* ---------- a building ---------- */
function makeLevel(rng, cfg) {
  const N = cfg.floors;
  const fire = 2 + Math.floor(rng() * Math.max(1, N - 2));   // never the lobby
  const people = [];
  for (let i = 0; i < cfg.people; i++) {
    people.push({ id: i, floor: 2 + Math.floor(rng() * (N - 1)), exp: 0 });
  }
  return { N, fire, people, rate: cfg.rate, spread: cfg.spread };
}

function newState(L) {
  return {
    L, t: 0, car: 1, carSmoke: 0,
    s: new Float64Array(L.N + 1),
    waiting: L.people.map(p => ({ ...p })),
    aboard: [], saved: 0, lost: 0,
  };
}
function clone(S) {
  return {
    L: S.L, t: S.t, car: S.car, carSmoke: S.carSmoke,
    s: Float64Array.from(S.s),
    waiting: S.waiting.map(p => ({ ...p })),
    aboard: S.aboard.map(p => ({ ...p })),
    saved: S.saved, lost: S.lost,
  };
}

/* Smoke rises. The fire floor makes it; every floor above takes it from the
   floor below. Floors below the fire stay clear, which is why the exit is
   still an exit and why the people furthest from it are the ones in trouble. */
function stepWorld(S, dt, doorFloor) {
  const L = S.L, s = S.s;
  s[L.fire] = Math.min(1, s[L.fire] + L.rate * dt);
  for (let f = L.fire + 1; f <= L.N; f++) {
    s[f] = Math.min(1, s[f] + L.spread * Math.max(0, s[f - 1] - s[f]) * dt);
  }
  if (doorFloor) S.carSmoke = Math.min(1, S.carSmoke + s[doorFloor] * dt * INGRESS);
  else S.carSmoke = Math.max(0, S.carSmoke - DECAY * dt);

  for (let i = S.waiting.length - 1; i >= 0; i--) {
    const p = S.waiting[i];
    p.exp += s[p.floor] * dt / TOL;
    if (p.exp >= 1) { S.waiting.splice(i, 1); S.lost++; }
  }
  for (let i = S.aboard.length - 1; i >= 0; i--) {
    const p = S.aboard[i];
    p.exp += S.carSmoke * dt / TOL;
    if (p.exp >= 1) { S.aboard.splice(i, 1); S.lost++; }
  }
  S.t += dt;
}
function advance(S, secs, doorFloor, dt) {
  let left = secs;
  while (left > 1e-9) { const d = Math.min(dt, left); stepWorld(S, d, doorFloor); left -= d; }
}

/* One stop: drive there, doors, load or unload, doors. The car is the one from
   model.js, so the harness is arguing with the car the player is fighting. */
function doStop(S, f, dt) {
  advance(S, M.travelTime(Math.abs(f - S.car), T), 0, dt);
  S.car = f;
  advance(S, DOOR, f, dt);
  if (f === 1) {
    const n = S.aboard.length;
    S.saved += n; S.aboard = [];
    if (n) advance(S, BOARD * n, f, dt);
  } else {
    const here = S.waiting.filter(p => p.floor === f).sort((a, b) => b.exp - a.exp);
    const take = here.slice(0, CAP - S.aboard.length);
    if (take.length) {
      const ids = new Set(take.map(p => p.id));
      S.waiting = S.waiting.filter(p => !ids.has(p.id));
      for (const p of take) S.aboard.push(p);
      advance(S, BOARD * take.length, f, dt);
    }
  }
  advance(S, DOOR, f, dt);
}

const done = (S) => S.waiting.length === 0 && S.aboard.length === 0;
function pickupFloors(S) {
  const set = new Set();
  for (const p of S.waiting) if (S.aboard.length < CAP) set.add(p.floor);
  return [...set];
}
function stops(S) {
  const c = pickupFloors(S);
  if (S.aboard.length > 0) c.push(1);
  return c.length ? c : (S.aboard.length ? [1] : []);
}

/* ---------- the greedy rules ---------- */
const byNearest = (S, fs) => fs.reduce((b, f) => Math.abs(f - S.car) < Math.abs(b - S.car) ? f : b, fs[0]);
const byTop = (S, fs) => fs.reduce((b, f) => f > b ? f : b, fs[0]);
const byPeople = (S, fs) => {
  const n = f => S.waiting.filter(p => p.floor === f).length;
  return fs.reduce((b, f) => n(f) > n(b) ? f : b, fs[0]);
};
const byWorst = (S, fs) => {
  const worst = f => Math.max(...S.waiting.filter(p => p.floor === f).map(p => p.exp));
  return fs.reduce((b, f) => worst(f) > worst(b) ? f : b, fs[0]);
};
/* `full` dumps only with a full car; `any` runs everyone straight down. Both
   are things a person actually does, and the level has to beat both. */
const greedy = (pick, full) => (S) => {
  const ps = pickupFloors(S);
  if (!ps.length) return S.aboard.length ? 1 : null;
  if (S.aboard.length >= CAP) return 1;
  if (!full && S.aboard.length > 0) return 1;
  return pick(S, ps);
};
/* A PLAN A PERSON COULD ACTUALLY EXECUTE. This is the fairness test, not a
   greedy rule: start at the top floor that still has people, then work
   downward picking up whoever is on the way until the car is full, then run to
   the lobby. It is one sentence, a player can hold it in their head, and it is
   what anyone sensible does in a burning building where smoke rises.

   If this captures most of what the beam search gets, the plan is DERIVABLE by
   looking and the level is fair. If only the search can win, the level is
   asking the player to be a search, which is the "derivable BEFORE tested"
   gate failing. */
const sweepDown = (S) => {
  const ps = pickupFloors(S);
  if (!ps.length) return S.aboard.length ? 1 : null;
  if (S.aboard.length >= CAP) return 1;
  if (S.aboard.length === 0) return byTop(S, ps);
  const below = ps.filter(f => f < S.car);
  return below.length ? byTop(S, below) : 1;
};
const sweepUp = (S) => {
  const ps = pickupFloors(S);
  if (!ps.length) return S.aboard.length ? 1 : null;
  if (S.aboard.length >= CAP) return 1;
  const above = ps.filter(f => f > S.car);
  return above.length ? above.reduce((a, f) => f < a ? f : a, above[0]) : byTop(S, ps);
};
const GREEDY = {
  nearestFull: greedy(byNearest, true), nearestAny: greedy(byNearest, false),
  topFull: greedy(byTop, true), topAny: greedy(byTop, false),
  worstFull: greedy(byWorst, true), peopleFull: greedy(byPeople, true),
};
const HUMAN = { sweepDown, sweepUp };

/* ---------- the planner ---------- */
/* THE HORIZON MUST NOT BIAS THE PLAN. The first version scored `saved*1000`
   and gave everyone still alive a value under 1, so inside a three-stop
   horizon a branch that ran one person straight down beat a branch that
   collected three and had not dumped them yet. That made the planner
   dump-happy and it lost to one-line rules, which is not a thing a beam
   search should ever do. A person in the car is nearly out; a person on a
   landing is alive but at risk. Score them that way and the horizon stops
   deciding the plan. */
const evalState = (S) => {
  let v = S.saved * 1000;
  for (const p of S.aboard) v += 900 - 100 * p.exp;
  for (const p of S.waiting) v += 500 * (1 - p.exp);
  return v;
};
function planner(depth, beam) {
  return function (S) {
    const c = stops(S);
    if (!c.length) return null;
    if (c.length === 1) return c[0];
    let best = c[0], bestScore = -Infinity;
    for (const f1 of c) {
      const s1 = clone(S); doStop(s1, f1, RDT);
      let states = [s1];
      for (let d = 1; d < depth; d++) {
        const nxt = [];
        for (const st of states) {
          const cs = stops(st);
          if (!cs.length) { nxt.push(st); continue; }
          for (const f2 of cs) { const c2 = clone(st); doStop(c2, f2, RDT); nxt.push(c2); }
        }
        nxt.sort((a, b) => evalState(b) - evalState(a));
        states = nxt.slice(0, beam);
      }
      const sc = states.reduce((m, st) => Math.max(m, evalState(st)), -Infinity);
      if (sc > bestScore) { bestScore = sc; best = f1; }
    }
    return best;
  };
}

/* ---------- running a level ---------- */
function run(L, policy) {
  const S = newState(L);
  for (let guard = 0; guard < 400 && !done(S); guard++) {
    const f = policy(S);
    if (f == null) break;
    doStop(S, f, DT);
  }
  return { saved: S.saved, lost: S.lost + S.waiting.length + S.aboard.length, t: S.t };
}

/* ---------- the sweep ---------- */
const PLAN = planner(5, 6);
const f2 = (x) => x.toFixed(2);
const pc = (x) => (x * 100).toFixed(0) + '%';

function cell(cfg, n) {
  const keys = Object.keys(GREEDY);
  let winnable = 0, allLose = 0, certStrict = 0, certBest = 0;
  let planSaved = 0, bestOfSix = 0, total = 0;
  const perRule = {}; for (const k of keys) perRule[k] = { saved: 0, loses: 0 };
  for (let i = 0; i < n; i++) {
    const L = makeLevel(M.makeRng(7000 + i * 31 + cfg.floors * 977 + Math.round(cfg.rate * 1000)), cfg);
    const K = cfg.people;
    const p = run(L, PLAN);
    let best = -1;
    for (const k of keys) {
      const r = run(L, GREEDY[k]);
      perRule[k].saved += r.saved;
      if (r.saved < K) perRule[k].loses++;
      best = Math.max(best, r.saved);
    }
    total += K; planSaved += p.saved; bestOfSix += best;
    const win = p.saved === K;
    if (win) winnable++;
    if (best < K) allLose++;
    if (win && best < K) certStrict++;
    /* The rule a player actually settles on is ONE rule, so the honest
       certification asks whether the best SINGLE rule fails here. */
    if (win && perRuleBestKey && run(L, GREEDY[perRuleBestKey]).saved < K) certBest++;
  }
  const out = { winnable: winnable / n, allLose: allLose / n, certStrict: certStrict / n,
                certBest: certBest / n, planRate: planSaved / total, bestOfSixRate: bestOfSix / total, perRule: {} };
  for (const k of keys) out.perRule[k] = { rate: perRule[k].saved / total, loses: perRule[k].loses / n };
  return out;
}
let perRuleBestKey = null;

console.log('LIFT — THE FIRE GATE.  Is getting everyone out a DECISION, or is the obvious rule already right?\n');
console.log('  car from model.js: one floor 0.83s, six floors 2.43s, a stop costs 1.2s of doors');
console.log('  smoke: TOL ' + TOL + 's at full density, door ingress ' + INGRESS + ', car clears at ' + DECAY + '/s');
console.log('  planner: beam search, depth 5, width 6\n');

const CFGS = [];
for (const floors of [4, 6, 7, 8, 10]) for (const people of [6, 9, 12]) for (const rate of [0.03, 0.05, 0.08])
  CFGS.push({ floors, people, rate, spread: 0.35 });
const N = 80;

/* Pass one: which single greedy rule is strongest overall? A player settles on
   one, so that is the one a level has to beat. */
const tally = {}; for (const k of Object.keys(GREEDY)) tally[k] = 0;
for (const cfg of CFGS) {
  const r = cell(cfg, 25);
  for (const k of Object.keys(GREEDY)) tally[k] += r.perRule[k].rate;
}
perRuleBestKey = Object.keys(GREEDY).reduce((a, k) => tally[k] > tally[a] ? k : a, Object.keys(GREEDY)[0]);
console.log('  the six rules, mean share of people saved across the whole space:');
for (const k of Object.keys(GREEDY).sort((a, b) => tally[b] - tally[a]))
  console.log('    ' + k.padEnd(13) + pc(tally[k] / CFGS.length) + (k === perRuleBestKey ? '   <- the rule a player would settle on' : ''));

console.log('\n  floors people  rate   winnable  ' + perRuleBestKey.padEnd(12) + ' allSixLose   CERTIFIED   planner  bestOf6');
const rows = [];
for (const cfg of CFGS) {
  const r = cell(cfg, N);
  rows.push({ ...cfg, ...r });
  console.log('  ' + String(cfg.floors).padStart(6) + String(cfg.people).padStart(7) + f2(cfg.rate).padStart(6) +
    pc(r.winnable).padStart(11) + pc(r.perRule[perRuleBestKey].loses).padStart(12) + '     ' +
    pc(r.allLose).padStart(8) + pc(r.certBest).padStart(12) +
    pc(r.planRate).padStart(10) + pc(r.bestOfSixRate).padStart(9));
}
const good = rows.filter(r => r.certBest >= 0.25);
console.log('\n  cells where 25%+ of buildings are CERTIFIABLE (planner saves all, the best single rule does not): ' + good.length + ' of ' + rows.length);
if (good.length) {
  const b = good.reduce((a, r) => r.certBest > a.certBest ? r : a, good[0]);
  console.log('  best: ' + b.floors + ' floors, ' + b.people + ' people, rate ' + f2(b.rate) +
    ' -> ' + pc(b.certBest) + ' certifiable (winnable ' + pc(b.winnable) + ')');
}
const beatsGreedy = rows.filter(r => r.planRate > r.bestOfSixRate + 0.01).length;
console.log('  cells where the planner beats the best-of-six oracle by >1 point: ' + beatsGreedy + ' of ' + rows.length +
  '   (a planner losing to a one-line rule means the planner, not the game)');

/* ---------------------------------------------------------------------------
   THE FAIRNESS TEST — is the planner's win DERIVABLE, or does the level need a
   search to beat it?
 *
 * A level that only a depth-5 beam can clear is not a fair level, it is a
 * level asking the player to be the beam. So put a plan a person could hold in
 * their head - sweep from the top down, fill, run to the lobby - against both
 * the beam and the best one-line rule, on the cells that certified.
 * ------------------------------------------------------------------------- */
console.log('\n\nFAIRNESS — can a plan a person could execute get what the search gets?\n');
console.log('  floors people  rate    worstFull   sweepUp  sweepDown   planner     sweepDown clears all');
for (const cfg of [{ floors: 7, people: 9, rate: 0.08 }, { floors: 7, people: 12, rate: 0.05 },
                   { floors: 8, people: 9, rate: 0.08 }, { floors: 10, people: 12, rate: 0.05 },
                   { floors: 6, people: 9, rate: 0.08 }, { floors: 10, people: 9, rate: 0.08 },
                   { floors: 8, people: 12, rate: 0.05 }, { floors: 4, people: 9, rate: 0.08 }]) {
  cfg.spread = 0.35;
  const n = 150; let tot = 0, wf = 0, su = 0, sd = 0, pl = 0, sdAll = 0, plAll = 0;
  for (let i = 0; i < n; i++) {
    const L = makeLevel(M.makeRng(7000 + i * 31 + cfg.floors * 977 + Math.round(cfg.rate * 1000)), cfg);
    tot += cfg.people;
    wf += run(L, GREEDY.worstFull).saved;
    su += run(L, HUMAN.sweepUp).saved;
    const d = run(L, HUMAN.sweepDown).saved; sd += d; if (d === cfg.people) sdAll++;
    const p = run(L, PLAN).saved; pl += p; if (p === cfg.people) plAll++;
  }
  console.log('  ' + String(cfg.floors).padStart(6) + String(cfg.people).padStart(7) + f2(cfg.rate).padStart(6) +
    pc(wf / tot).padStart(12) + pc(su / tot).padStart(10) + pc(sd / tot).padStart(11) + pc(pl / tot).padStart(10) +
    '        ' + pc(sdAll / n) + ' vs planner ' + pc(plAll / n));
}

/* ---------------------------------------------------------------------------
   HOW FAR AHEAD DO YOU HAVE TO THINK?
 *
 * sweepDown is a REACTIVE RULE and a player is not one. A person looks at the
 * building, sees where everybody is, and plans a trip: "top three first, then
 * the middle pair, then the bottom two." That is a shallow lookahead, not a
 * rule. So the honest fairness test is the DEPTH CURVE.
 *
 * If it saturates by two or three stops, the plan is derivable by a person who
 * thinks one trip ahead, which is the difficulty we want. If it keeps climbing
 * to five, the level is asking the player to be a beam search and it is not a
 * fair level however good the numbers look.
 * ------------------------------------------------------------------------- */
console.log('\n\nDEPTH CURVE — how far ahead you must think to clear a building.\n');
console.log('  A stop is one floor served, so depth 3 is roughly "plan the rest of this trip",');
console.log('  depth 5 is "plan this trip and the next".\n');
console.log('  floors people  rate    d1     d2     d3     d4     d5     d7      (share of buildings fully cleared)');
for (const cfg of [{ floors: 7, people: 9, rate: 0.08 }, { floors: 8, people: 9, rate: 0.08 },
                   { floors: 7, people: 12, rate: 0.05 }, { floors: 10, people: 12, rate: 0.05 },
                   { floors: 6, people: 9, rate: 0.08 }]) {
  cfg.spread = 0.35;
  const n = 120, depths = [1, 2, 3, 4, 5, 7];
  const all = depths.map(() => 0);
  for (let i = 0; i < n; i++) {
    const L = makeLevel(M.makeRng(7000 + i * 31 + cfg.floors * 977 + Math.round(cfg.rate * 1000)), cfg);
    depths.forEach((d, j) => { if (run(L, planner(d, 6)).saved === cfg.people) all[j]++; });
  }
  console.log('  ' + String(cfg.floors).padStart(6) + String(cfg.people).padStart(7) + f2(cfg.rate).padStart(6) +
    all.map(v => pc(v / n).padStart(7)).join(''));
}
