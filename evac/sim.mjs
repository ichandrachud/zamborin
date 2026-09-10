/* Evac — the headless building, and the policies that argue about it.
 *
 * THE CANONICAL MODEL. The level builder certifies against this and the
 * harnesses sweep against this, and both take the smoke, the exposure and the
 * car from model.js, which is the same file the game loads. A certificate that
 * came from a second copy of the rules would be a certificate about a
 * different game.
 *
 * The one thing that is deliberately NOT the game: the driver. Here the car
 * takes the optimal trapezoid between two floors and always stops level. So a
 * certificate says "a good driver could clear this building", never "any
 * driver could". The player's own stops are the skill on top, and the smoke
 * that comes in through a door they had to open twice is what charges them
 * for it.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('./model.js');
export const T = M.TUNE, F = M.FIRE;
export const CAP = T.capacity;

const DT = 0.2;          // the certifier's step
const RDT = 0.25;        // the planner's rollout step

export function newState(L) {
  /* Slot within the floor decides where somebody is standing, and the smoke
     front reaches the far end of the corridor first. Same rule as the game. */
  const seen = {}, seenSlot = [];
  const stands = L.people.map(f => { seen[f] = (seen[f] || 0) + 1; seenSlot.push(seen[f] - 1); return M.standAt(seen[f] - 1); });
  return {
    L, t: 0, car: 1, carSmoke: 0,
    s: new Float64Array(L.floors + 1),
    waiting: L.people.map((f, i) => ({ id: i, floor: f, exp: 0, stand: stands[i], goal: M.queueAt(seenSlot[i]) })),
    aboard: [], out: 0, lost: 0, stops: 0,
  };
}
export function clone(S) {
  return {
    L: S.L, t: S.t, car: S.car, carSmoke: S.carSmoke,
    s: Float64Array.from(S.s),
    waiting: S.waiting.map(p => ({ ...p })),
    aboard: S.aboard.map(p => ({ ...p })),
    out: S.out, lost: S.lost, stops: S.stops,
  };
}

/* Advance the world. Someone overcome stops where they are: they are removed
   from play and counted, and nothing is drawn over them. */
function stepWorld(S, dt, doorFloor) {
  const L = S.L;
  M.stepSmoke(S.s, L.floors, L.fire, L.rate, dt, F);
  S.carSmoke = M.carSmokeStep(S.carSmoke, doorFloor ? S.s[doorFloor] : 0, dt, !!doorFloor, F);
  for (let i = S.waiting.length - 1; i >= 0; i--) {
    const p = S.waiting[i];
    /* They walk to the elevator, the same as they do on screen. A certificate from
       a sim where everybody stands still would be a certificate about a game
       nobody plays. */
    p.stand = M.walkStep(p.stand, p.goal, p.exp, dt);
    p.exp += M.exposureStep(p.stand, S.s[p.floor], dt, F);
    if (p.exp >= 1) { S.waiting.splice(i, 1); S.lost++; }
  }
  for (let i = S.aboard.length - 1; i >= 0; i--) {
    const p = S.aboard[i];
    p.exp += M.carExposureStep(S.carSmoke, dt, F);
    if (p.exp >= 1) { S.aboard.splice(i, 1); S.lost++; }
  }
  S.t += dt;
}
function advance(S, secs, doorFloor, dt) {
  let left = secs;
  while (left > 1e-9) { const d = Math.min(dt, left); stepWorld(S, d, doorFloor); left -= d; }
}

/* One stop: drive there, doors, load or unload, doors. Floor 1 is the way out. */
/* A MISSED STOP COSTS TIME, NOT SMOKE. Landing between floors opens no doors,
   so nothing gets in; what it costs is the overshoot, the sag and the nudge
   back. Measured off M1's own physics at about 1.5s a miss. `S.miss` is the
   share of stops a driver fluffs, and it is how the DRIVING is charged against
   the fire, where door ingress is how the SCHEDULE is. */
export const MISS_COST = 1.5;
export function doStop(S, f, dt) {
  dt = dt || DT;
  advance(S, M.travelTime(Math.abs(f - S.car), T), 0, dt);
  if (S.miss && S.missRng && S.missRng() < S.miss) advance(S, MISS_COST, 0, dt);
  S.car = f; S.stops++;
  advance(S, T.doorS, f, dt);
  if (f === 1) {
    const n = S.aboard.length;
    S.out += n; S.aboard = [];
    if (n) advance(S, T.boardS * n, f, dt);
  } else {
    const here = S.waiting.filter(p => p.floor === f).sort((a, b) => b.exp - a.exp);
    const take = here.slice(0, CAP - S.aboard.length);
    if (take.length) {
      const ids = new Set(take.map(p => p.id));
      S.waiting = S.waiting.filter(p => !ids.has(p.id));
      for (const p of take) S.aboard.push(p);
      advance(S, T.boardS * take.length, f, dt);
    }
  }
  advance(S, T.doorS, f, dt);
}

export const done = (S) => S.waiting.length === 0 && S.aboard.length === 0;
export function pickupFloors(S) {
  const set = new Set();
  if (S.aboard.length < CAP) for (const p of S.waiting) set.add(p.floor);
  return [...set];
}
export function stops(S) {
  const c = pickupFloors(S);
  if (S.aboard.length > 0) c.push(1);
  return c.length ? c : (S.aboard.length ? [1] : []);
}

/* ---------- the rules a player might settle on ---------- */
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
const greedy = (pick, full) => (S) => {
  const ps = pickupFloors(S);
  if (!ps.length) return S.aboard.length ? 1 : null;
  if (S.aboard.length >= CAP) return 1;
  if (!full && S.aboard.length > 0) return 1;
  return pick(S, ps);
};
/* Start at the top and work down filling the car: the plan a person would say
   out loud. Measured WORSE than "go where it is worst", which is the finding
   that triage beats routing. */
const sweepDown = (S) => {
  const ps = pickupFloors(S);
  if (!ps.length) return S.aboard.length ? 1 : null;
  if (S.aboard.length >= CAP) return 1;
  if (S.aboard.length === 0) return byTop(S, ps);
  const below = ps.filter(f => f < S.car);
  return below.length ? byTop(S, below) : 1;
};
export const RULES = {
  nearestFull: greedy(byNearest, true), nearestAny: greedy(byNearest, false),
  topFull: greedy(byTop, true), topAny: greedy(byTop, false),
  worstFull: greedy(byWorst, true), peopleFull: greedy(byPeople, true),
  sweepDown,
};

/* Flailing. A level that a random bot can clear is not a level. */
export const randomBot = (rng) => (S) => {
  const c = stops(S);
  return c.length ? c[Math.floor(rng() * c.length)] : null;
};

/* ---------- the planner ---------- */
/* THE HORIZON MUST NOT BIAS THE PLAN. Scoring `out*1000` and giving everyone
   still alive a value under 1 made a three-stop horizon prefer running one
   person straight down over collecting three, and the beam then lost to
   one-line rules, which a beam should never do. A person in the car is nearly
   out; a person on a landing is alive but at risk. Score them that way. */
export const evalState = (S) => {
  let v = S.out * 1000;
  for (const p of S.aboard) v += 900 - 100 * p.exp;
  for (const p of S.waiting) v += 500 * (1 - p.exp);
  return v;
};
export function planner(depth, beam) {
  return function (S) {
    const c = stops(S);
    if (c.length <= 1) return c[0] == null ? null : c[0];
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

export function run(L, policy, opts) {
  const S = newState(L);
  if (opts && opts.miss) { S.miss = opts.miss; S.missRng = M.makeRng(opts.seed || 4242); }
  for (let guard = 0; guard < 400 && !done(S); guard++) {
    const f = policy(S);
    if (f == null) break;
    doStop(S, f, DT);
  }
  return { out: S.out, lost: S.lost + S.waiting.length + S.aboard.length, t: S.t, stops: S.stops };
}
