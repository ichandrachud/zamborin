/* ============================================================
   Zamborin · Lift · the car, the fire, and the numbers they run on

   THE CAR IS THE VERB AND THE FIRE IS THE CLOCK. The car has weight, it lags
   behind the hand, and it keeps going when you let go. Stop it level with a
   landing and the doors open. Stop it between floors and they do not. Smoke
   rises from the fire floor, and it comes into the car through the open door,
   which is what makes a stop you had to nudge cost something rather than
   nothing.

   This file is shared by the game (a script tag, window.LiftModel), by the
   level builder and by the harnesses (createRequire). That is the house rule:
   a gate must measure the SHIPPED game. The smoke that decides whether a level
   is certifiable has to be the same smoke the player is racing, or the
   certificate is about a different game.

   Units. `y` is a FLOOR NUMBER and it is continuous; 1 is the lobby and the
   way out. `v` is floors per second, positive upward. Smoke density is 0 to 1.
   Nothing here knows about pixels.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LiftModel = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* The car. Measured through the input path in M1: at or below vMax the hand
   and the car stay coupled with about a floor of slack; above it the hand runs
   away, which is the lag doing its job. */
const TUNE = {
  aMax: 6.0,          // floors/s^2, the hand's pull and the keys' push
  vMax: 3.2,          // floors/s
  b: 5.5,             // floors/s^2, the brake once you let go
  levelTol: 0.08,     // floors; about 6px at a 74px floor
  doorS: 0.6,
  boardS: 0.4,
  capacity: 4,
};

/* The fire. Every one of these was swept against the rules that ship, and
   re-swept after the smoke became a front rather than a haze - the first set
   of numbers were measured on a model that no longer exists, which is exactly
   how a harness ends up certifying a different game.

   `ingress` is what makes a stop cost something, and it is why the number of
   stops is a budget rather than free. Across the three hardest ladder cells:
   at 0 the door costs nothing, reacting one stop at a time clears 93% of
   buildings and planning is worth 7 points; at 0.40 it is worth 30; at 0.55,
   38; at 0.70, 41. Then it FLATTENS - 0.85 and 1.00 are both 42 points and
   1.00 costs a point of winnable for it. 0.70 is the knee, and the settings
   past it are the ones we refuse. */
const FIRE = {
  tol: 12,            // seconds at full density before someone is overcome
  ingress: 0.70,      // how fast an open door loads the car
  decay: 0.10,        // how fast the car clears once the doors shut
  spread: 0.35,       // how fast smoke climbs from one floor to the next
  /* AND IT WORKS DOWNWARD, SLOWLY. With the fire in the middle of the building
     every floor below it was clear for ever, so once the upper corridors were
     resolved the rest of the level had no clock in it at all and you ferried
     the safe ones down at your leisure. A quarter of the upward rate puts a
     soft deadline under the endgame without making the way out unusable: the
     lobby never fills, because a lobby you cannot walk out of is not a level,
     it is a trap. */
  spreadDown: 0.09,
  warnAt: 0.72,       // exposure at which a person is visibly in trouble
};

/* ---------- the car ---------- */

/* Stop distance from a release at speed v. At vMax this is 0.93 floors, which
   is the whole skill: from full speed you have to let go a floor early. */
function stopDistance(v, b) { return (v * v) / (2 * (b == null ? TUNE.b : b)); }

function isLevel(y, tol) { return Math.abs(y - Math.round(y)) <= (tol == null ? TUNE.levelTol : tol); }

/* One step of the car. `input` is one of:
     { mode: 'drag', targetV }  the hand. THE HAND'S VELOCITY IS THE TARGET,
                                not its position, so the car trails it like a
                                rope rather than sticking to it like a sprite.
     { mode: 'key', dir }       -1, 0 or +1. Holding accelerates.
     { mode: 'free' }           let go. Brake at b.
   Returns 'end' at the top or bottom of the shaft, 'rest' when the brake
   finished the job, else null. The caller decides whether that rest was level. */
function stepCar(car, dt, input, floors, T) {
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
  if (car.y >= floors) { car.y = floors; if (car.v > 0) { car.v = 0; return 'end'; } }
  if (car.v === 0 && mode !== 'drag' && mode !== 'key') return 'rest';
  return null;
}

/* How long an OPTIMAL drive of `d` floors takes, starting and ending at rest.
   Accelerate at aMax, brake at b, cap at vMax: the standard trapezoid, and it
   collapses to a triangle on a short hop. The level builder drives this way,
   so a certificate says "a good driver could do this", not "any driver". */
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

/* ---------- the fire ---------- */

/* Smoke rises, and it also ADVANCES DOWN THE CORRIDOR. `s[f]` is how far the
   smoke has come along floor f's corridor, from the stairwell at the far end
   toward the lift in the middle: 0 is a clear corridor, 1 is one you cannot
   see across. The fire floor makes smoke and every floor above takes it from
   the floor below, so the people furthest from the way out are in trouble
   first. Floors below the fire stay clear, which is why the lobby is a lobby.

   Making the front a POSITION rather than a haze is what lets a player read
   the time left off the picture: how far the grey has come along a corridor is
   how long the people in it have. It also gives everyone in that corridor
   their own clock, because the smoke reaches the far end of it first. */
function stepSmoke(s, floors, fireFloor, rate, dt, F) {
  F = F || FIRE;
  s[fireFloor] = Math.min(1, s[fireFloor] + rate * dt);
  for (let f = fireFloor + 1; f <= floors; f++) {
    s[f] = Math.min(1, s[f] + F.spread * Math.max(0, s[f - 1] - s[f]) * dt);
  }
  for (let f = fireFloor - 1; f >= 2; f--) {
    s[f] = Math.min(1, s[f] + F.spreadDown * Math.max(0, s[f + 1] - s[f]) * dt);
  }
}

/* Where a person stands in the corridor, by their place in the queue for the
   lift. 1 is right by the doors and 0 is the far wall by the stairs. A
   function of the SLOT and nothing else, so a building plays the same on a
   phone as in the desktop frame even though the desktop draws the queue across
   two corridors.

   THESE TWO NUMBERS ARE THE GRACE PERIOD AND THEY WERE SWEPT. At 0.88/0.15
   everybody huddled by the doors, so the smoke had to cross almost the whole
   corridor before anyone was at risk: 0% of buildings were certifiable and
   simply reacting one stop at a time cleared 93% of them, which is the
   scheduling decision gone. The sweep is monotone - 0.88/0.15 is worth 7
   points of planning, 0.72/0.20 is worth 28, 0.64/0.20 is worth 52, and
   0.56/0.18 is worth 55 but drops winnable to 90%. 0.64/0.20 is the interior
   choice: 98% winnable, 28% certifiable, and planning worth 52 points. */
const STAND_FIRST = 0.64, STAND_STEP = 0.20;
function standAt(slot) { return STAND_FIRST - STAND_STEP * slot; }

/* What a second costs a person, given how far the smoke has come along their
   corridor. Nothing happens until the front reaches them; then it takes hold
   over the next fifth of the corridor. Exposure runs 0 to 1 and at 1 they are
   overcome: they stop where they are and the level goes on without them.
   Nobody dies on screen and nothing is drawn over a person. */
/* The window is exactly the distance from the person standing closest to the
   doors to the end of the corridor, so that person reaches full exposure just
   as the corridor fills. Any wider and somebody at the lift end could never be
   more than partly exposed in a corridor you cannot see across, which is not a
   thing smoke does. */
const ENGULF_WINDOW = 1 - STAND_FIRST;
function engulf(stand, front) {
  return Math.max(0, Math.min(1, (front - stand) / ENGULF_WINDOW));
}
function exposureStep(stand, front, dt, F) {
  return engulf(stand, front) * dt / ((F || FIRE).tol);
}

/* In the car there is nowhere to stand away from it, and what it costs is
   LINEAR in the load rather than a threshold - which is how the door-ingress
   sweep was measured, so it is how it stays. */
function carExposureStep(load, dt, F) { return load * dt / ((F || FIRE).tol); }

/* The car fills while its doors are open on a smoky landing and clears slowly
   once they are shut. This is the coupling between the stop and the schedule:
   a stop you had to nudge means the doors were open twice. */
function carSmokeStep(load, doorDensity, dt, doorsOpen, F) {
  F = F || FIRE;
  return doorsOpen
    ? Math.min(1, load + doorDensity * dt * F.ingress)
    : Math.max(0, load - F.decay * dt);
}

/* mulberry32. Seeded, so a building replays exactly. */
function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

return { TUNE, FIRE, stepCar, isLevel, stopDistance, travelTime,
         stepSmoke, standAt, engulf, exposureStep, carExposureStep, carSmokeStep, makeRng };
}));
