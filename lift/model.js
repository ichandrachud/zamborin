/* ============================================================
   Zamborin · Lift · the car, and the numbers it runs on

   THE CAR IS THE GAME. Every other rule in this file exists to serve one
   sentence from the brief: momentum must make the stop a skill. The car has
   weight, it lags behind the hand, and it keeps going when you let go. Stop it
   level with a floor and the doors open. Stop it between floors and they do
   not.

   This file is shared by the game (a script tag, window.LiftModel) and by
   tune-gate.mjs (createRequire). That is deliberate and it is the house rule:
   a gate must measure the SHIPPED game, so the harness's idea of how long the
   car takes to get anywhere comes from the same constants the player is
   fighting, not from a second copy that can drift.

   Units: y is a FLOOR NUMBER and it is continuous. 1 is the lobby, `floors` is
   the top. v is floors per second, positive upward. Nothing here knows about
   pixels.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LiftModel = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* Starting constants, from the brief. THESE ARE NOT TUNED YET. The gate
   (tune-gate.mjs) is what earns them, and row 1 is a kill test, not a tuning
   run: if the planner cannot beat nearest-call-first the answer is to stop
   building, not to move a number. */
const TUNE = {
  floors: 7,
  aMax: 6.0,          // floors/s^2, the hand's pull and the keys' push
  vMax: 3.2,          // floors/s
  b: 5.5,             // floors/s^2, the brake once you let go
  levelTol: 0.08,     // floors; about 6px at a 74px floor
  doorS: 0.6,
  boardS: 0.4,
  capacity: 4,
  base: 10,
  smoothBonus: 3,
  vipMult: 3,
  drain: { regular: 25, hurried: 15, vip: 12, kid: 40, express: 25 },
  boardedDrain: 40,
  fidgetAt: 0.3,
  quitsToEnd: 3,
  shiftS: 150,
  spawnEveryS: [9, 4],   // shift 1 -> shift 9
};

/* Stop distance from a release at speed v. At vMax this is 0.93 floors, which
   is the whole skill: from full speed you have to let go a floor early. It is
   also the acceptance criterion - a level stop must be reachable from any
   speed inside one floor of braking - so it is written down once, here. */
function stopDistance(v, b) { return (v * v) / (2 * (b == null ? TUNE.b : b)); }

function isLevel(y, tol) { return Math.abs(y - Math.round(y)) <= (tol == null ? TUNE.levelTol : tol); }

/* One step of the car.

   `input` is one of:
     { mode: 'drag', targetV }  the hand. THE HAND'S VELOCITY IS THE TARGET,
                                not its position, so the car trails it like a
                                rope rather than sticking to it like a sprite.
     { mode: 'key', dir }       -1, 0 or +1. Holding accelerates.
     { mode: 'free' }           let go. Brake at b.

   Returns the reason it stopped moving this step, or null: 'end' at the top or
   bottom of the shaft, 'rest' when the brake finished the job. The caller
   decides whether that rest was level. */
function stepCar(car, dt, input, T) {
  T = T || TUNE;
  const mode = input && input.mode;
  if (mode === 'drag') {
    const target = Math.max(-T.vMax, Math.min(T.vMax, input.targetV || 0));
    const dv = target - car.v;
    const step = T.aMax * dt;
    car.v += Math.abs(dv) <= step ? dv : Math.sign(dv) * step;
  } else if (mode === 'key' && input.dir) {
    car.v += input.dir * T.aMax * dt;
    car.v = Math.max(-T.vMax, Math.min(T.vMax, car.v));
  } else {
    const step = T.b * dt;
    car.v = Math.abs(car.v) <= step ? 0 : car.v - Math.sign(car.v) * step;
  }

  car.y += car.v * dt;

  if (car.y <= 1) { car.y = 1; if (car.v < 0) { car.v = 0; return 'end'; } }
  if (car.y >= T.floors) { car.y = T.floors; if (car.v > 0) { car.v = 0; return 'end'; } }
  if (car.v === 0 && mode !== 'drag' && mode !== 'key') return 'rest';
  return null;
}

/* How long an OPTIMAL drive of `d` floors takes, starting and ending at rest.
   Accelerate at aMax, brake at b, cap at vMax: the standard trapezoid, and it
   collapses to a triangle on a short hop. The harness drives this way for
   every policy so that row 1 isolates the SCHEDULE - who to serve next - from
   how well anyone stops. */
function travelTime(d, T) {
  T = T || TUNE;
  d = Math.abs(d);
  if (d === 0) return 0;
  const peak = Math.sqrt((2 * d * T.aMax * T.b) / (T.aMax + T.b));
  if (peak <= T.vMax) return peak / T.aMax + peak / T.b;
  const dAcc = (T.vMax * T.vMax) / (2 * T.aMax);
  const dDec = (T.vMax * T.vMax) / (2 * T.b);
  return T.vMax / T.aMax + T.vMax / T.b + (d - dAcc - dDec) / T.vMax;
}

/* A delivery pays for the person's remaining patience, so leaving someone to
   sweat is not free even when they do not walk. */
function tipFor(patienceLeft, mult, T) {
  T = T || TUNE;
  return T.base * (0.5 + 0.5 * Math.max(0, Math.min(1, patienceLeft))) * (mult || 1);
}

/* mulberry32. Seeded, so a shift replays. */
function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

return { TUNE, stepCar, isLevel, stopDistance, travelTime, tipFor, makeRng };
}));
