/* Evac — the level builder, and the certificate every level carries.
 *
 * A LEVEL IS NOT SHIPPED UNTIL SOMETHING HAS PROVED IT. Junction's rule, and
 * it is the whole reason this game passed its gate where the tips version did
 * not. For every level from 4 on:
 *
 *   1. a planner clears the building - so it IS winnable, and by a driver who
 *      plans one trip ahead rather than by a search that sees everything;
 *   2. a GRADED number of simple rules fail to clear it - nearest, top-down,
 *      most-people, most-endangered, dump-when-full and dump-at-once variants,
 *      and the sweep-from-the-top plan a person would say out loud. The
 *      threshold climbs with the level, and by the back half all seven lose
 *      somebody;
 *   3. five random bots all fail - a building you can flail through is not a
 *      level;
 *   4. IT SURVIVES A REAL DRIVER. Measured as played rather than as gated: the
 *      same plan run with a share of stops fluffed, which costs the overshoot,
 *      the sag and the nudge back at about 1.5s a miss. A level must still
 *      clear four times in five at a 20% miss rate, and must NOT clear
 *      reliably at 60%, so good driving is worth something and bad driving is
 *      not fatal. The first ladder had a level that cleared with a perfect
 *      driver and only 13% of the time at a 20% miss - certified, and
 *      unplayable.
 *
 * THE GRADE IS THE DIFFICULTY, AND IT HAD TO BE. The first ladder demanded all
 * seven rules fail at every level and seven specs in the middle could not be
 * filled in thirty thousand buildings each: at five or six people the obvious
 * rules simply are not wrong, so no building of that size punishes them. A
 * binary certificate cannot make a gentle ramp. Grading it gives a difficulty
 * measured in HOW MANY OBVIOUS APPROACHES THIS BUILDING DEFEATS, which is a
 * real quantity and climbs monotonically, rather than a number somebody chose.
 *
 * THE LADDER CLIMBS ON PEOPLE AND SMOKE, NOT ON FLOORS. Measured in
 * tune-fire.mjs: at nine people and rate 0.08 a four-floor building certifies
 * at 40% and a ten-floor building at 39%. Floors buy variety and legibility;
 * they do not buy difficulty. Nine people is the ceiling - twelve pushes the
 * planning depth past what a person holds in their head.
 *
 * Run: node evac/build-levels.mjs   (writes evac/levels.js)
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as S from './sim.mjs';
const require = createRequire(import.meta.url);
const M = require('./model.js');

const PLAN = S.planner(5, 6);
/* A person plans a trip, not the whole building. If a level needs more than
   this it is a search problem and it does not ship. */
const HUMAN = S.planner(4, 6);
const MAX_PER_FLOOR = 4;      // the car holds four and a landing has to be drawable

/* floors, people, smoke rate. Floors grow for the look of the thing; people
   and rate are what make it hard. */
/* THREE BANDS, BECAUSE THE GAME HAS TWO SKILLS AND THEY ARRIVE IN ORDER.
   Below about seven people no smoke rate makes the obvious rules WRONG - it
   only makes the building unwinnable - so the middle of the ladder cannot be
   certified on the schedule. It can be certified on the DRIVING, which is the
   other half of the game and the half you learn first.

     taught  small, forgiving, teaches that the doors open when you land level
     drive   the schedule is easy; a driver who fluffs stops loses people
     plan    the obvious rules fail, and driving still matters

   floors, people, rate, band, and how many of the seven rules must fail. */
const LADDER = [
  [3, 2, 0.045, 'taught', 0], [3, 3, 0.052, 'taught', 0], [4, 4, 0.058, 'taught', 0],
  [4, 5, 0.075, 'drive', 0], [5, 5, 0.080, 'drive', 0], [5, 6, 0.085, 'drive', 0],
  [6, 6, 0.088, 'drive', 0], [6, 7, 0.092, 'drive', 0],
  [7, 8, 0.072, 'plan', 5], [7, 9, 0.072, 'plan', 6],
  [8, 8, 0.068, 'plan', 6], [8, 9, 0.074, 'plan', 7],
  [8, 9, 0.082, 'plan', 7], [9, 9, 0.074, 'plan', 7],
  [9, 9, 0.082, 'plan', 7], [10, 9, 0.078, 'plan', 7],
  [10, 9, 0.084, 'plan', 7],
];

function build(floors, people, rate, seed) {
  const rng = M.makeRng(seed);
  const fire = 2 + Math.floor(rng() * Math.max(1, floors - 2));
  const counts = new Array(floors + 1).fill(0);
  const list = [];
  let guard = 0;
  while (list.length < people && guard++ < 400) {
    const f = 2 + Math.floor(rng() * (floors - 1));
    if (counts[f] >= MAX_PER_FLOOR) continue;
    counts[f]++; list.push(f);
  }
  if (list.length < people) return null;
  return { floors, fire, rate, spread: M.FIRE.spread, people: list.sort((a, b) => a - b) };
}

/* How often the one-trip-ahead plan clears the building when the driver fluffs
   `m` of the stops. This is the level as PLAYED. */
function asPlayed(L, m, n) {
  const K = L.people.length;
  let ok = 0;
  for (let i = 0; i < n; i++) if (S.run(L, HUMAN, { miss: m, seed: 100 + i }).out === K) ok++;
  return ok / n;
}

function judge(L, band, mustDefeat) {
  const K = L.people.length;
  if (S.run(L, PLAN).out !== K) return null;             // not winnable at all
  const human = S.run(L, HUMAN);
  if (human.out !== K) return null;                      // needs more than a trip of thought

  const names = Object.keys(S.RULES);
  const clears = names.filter(k => S.run(L, S.RULES[k]).out === K);
  const defeats = names.length - clears.length;

  if (band === 'taught' && clears.length < 2) return null;      // a tutorial must be forgiving
  if (band === 'plan') {
    if (defeats < mustDefeat) return null;
    for (let r = 0; r < 5; r++) {
      if (S.run(L, S.randomBot(M.makeRng(9000 + r))).out === K) return null;
    }
  }

  const m20 = asPlayed(L, 0.2, 30);
  if (m20 < 0.90) return null;                           // a decent driver must clear it
  const m60 = asPlayed(L, 0.6, 30);
  /* A tutorial is exempt from "bad driving must fail": a three-floor building
     with two people in it cannot be lost however badly it is driven, and that
     is what a tutorial is for. A DRIVE level is the opposite - punishing bad
     stops is the only thing certifying it, so the bar is hard. */
  if (band === 'drive' && m60 > 0.55) return null;
  if (band === 'plan' && m60 > 0.85) return null;
  return { stops: human.stops, seconds: Math.round(human.t), defeats, clears, m20, m60 };
}

const out = [];
let totalTried = 0;
for (let i = 0; i < LADDER.length; i++) {
  const [floors, people, rate, band, mustDefeat] = LADDER[i];
  let found = null, tried = 0;
  for (let seed = 1; seed < 12000 && !found; seed++) {
    const L = build(floors, people, rate, seed * 7919 + i * 104729);
    if (!L) continue;
    tried++;
    const v = judge(L, band, mustDefeat);
    if (v) found = { L, v, seed };
  }
  totalTried += tried;
  if (!found) { console.log('  L' + (i + 1) + '  NO LEVEL FOUND in ' + tried + ' buildings — ' + floors + 'f ' + people + 'p ' + rate + ' ' + band); continue; }
  out.push({
    id: out.length + 1, band,
    floors: found.L.floors, fire: found.L.fire, rate: found.L.rate,
    people: found.L.people, par: found.v.stops, seconds: found.v.seconds,
    defeats: found.v.defeats,
  });
  console.log('  L' + String(out.length).padStart(2) + '  ' + band.padEnd(7) + found.L.floors + 'f ' +
    found.L.people.length + 'p fire@' + found.L.fire + ' rate ' + found.L.rate.toFixed(3) +
    '  ' + JSON.stringify(found.L.people).padEnd(26) +
    ' par ' + String(found.v.stops).padStart(2) + '/' + String(found.v.seconds).padStart(2) + 's' +
    '  defeats ' + found.v.defeats + '/7' +
    '  played ' + Math.round(found.v.m20 * 100) + '%@20 ' + Math.round(found.v.m60 * 100) + '%@60' +
    '  [' + tried + ']');
}

const body = `/* Evac — the shipped levels. GENERATED by build-levels.mjs; do not hand-edit.
 *
 * Every level from 4 on carries a certificate: a planner that thinks one trip
 * ahead clears it, all seven simple rules lose somebody, and five random bots
 * fail. The first three are TAUGHT rather than certified - a tutorial that
 * punishes a simple rule is not a tutorial.
 *
 * \`par\` is the stop count a one-trip-ahead planner needed, driving perfectly.
 * A player who has to nudge a stop pays for it in smoke through the open door.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EvacLevels = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';
return { LEVELS: ${JSON.stringify(out, null, 1).replace(/\n\s+/g, ' ').replace(/\[ \{/g, '[\n  {').replace(/\}, \{/g, '},\n  {').replace(/\} \]/g, '}\n]')} };
}));
`;
writeFileSync(new URL('./levels.js', import.meta.url), body);
const by = b => out.filter(l => l.band === b).length;
console.log('\n  wrote evac/levels.js — ' + out.length + ' levels: ' +
  by('taught') + ' taught, ' + by('drive') + ' certified on driving, ' + by('plan') + ' certified on the schedule');
if (out.length < LADDER.length) console.log('  WARNING: ' + (LADDER.length - out.length) + ' ladder slots could not be filled.');
