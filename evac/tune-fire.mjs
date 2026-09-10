/* Evac — the fire design, measured against the SHIPPED rules.
 *
 * This used to carry its own copy of the smoke model. Then the model changed
 * twice - the smoke became a front that comes along the corridor rather than a
 * haze over it, and it learned to work downward as well as up - and a harness
 * with its own copy would have gone on reporting confident numbers about a
 * game that no longer existed. It imports sim.mjs now, which imports model.js,
 * which is the file the browser loads. One set of rules.
 *
 * Three questions, in the order they decide anything:
 *
 *   YIELD     what share of buildings are certifiable - a planner clears them
 *             and the best single one-line rule does not. If this is near zero
 *             there is no generator and no game.
 *   DEPTH     how far ahead you must think. If it saturates at a trip's worth
 *             of stops the plan is human-scale; if it keeps climbing, the
 *             level is asking the player to be a beam search.
 *   INGRESS   whether smoke through the open door is load-bearing, or a story.
 *
 * Run: node evac/tune-fire.mjs
 */
import { createRequire } from 'node:module';
import * as S from './sim.mjs';
const require = createRequire(import.meta.url);
const M = require('./model.js');

const PLAN = S.planner(5, 6);
const HUMAN = S.planner(4, 6);
const MAX_PER_FLOOR = 4;
const f2 = (x) => x.toFixed(2);
const pc = (x) => (100 * x).toFixed(0) + '%';

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
  return list.length < people ? null : { floors, fire, rate, people: list.sort((a, b) => a - b) };
}

const RULE_NAMES = Object.keys(S.RULES);
function cell(floors, people, rate, n) {
  let winnable = 0, certifiable = 0, ruleClears = 0;
  for (let i = 0; i < n; i++) {
    const L = build(floors, people, rate, 7000 + i * 31 + floors * 977 + Math.round(rate * 1000));
    if (!L) continue;
    const K = people;
    const win = S.run(L, PLAN).out === K;
    const best = Math.max.apply(null, RULE_NAMES.map(k => S.run(L, S.RULES[k]).out));
    if (win) winnable++;
    if (best === K) ruleClears++;
    if (win && best < K) certifiable++;
  }
  return { winnable: winnable / n, certifiable: certifiable / n, ruleClears: ruleClears / n };
}

console.log('EVAC — the fire design, against the rules that ship.\n');
console.log('  car:  one floor ' + f2(M.travelTime(1)) + 's, six floors ' + f2(M.travelTime(6)) +
            's, stop distance from vMax ' + f2(M.stopDistance(M.TUNE.vMax)) + ' floors' +
            (M.stopDistance(M.TUNE.vMax) <= 1 ? '  OK' : '  FAIL'));
console.log('  fire: tol ' + M.FIRE.tol + 's, ingress ' + M.FIRE.ingress + ', spread up ' +
            M.FIRE.spread + ' / down ' + M.FIRE.spreadDown + ', engulf window ' + f2(1 - M.standAt(0)));
console.log('  people stand at ' + [0, 1, 2, 3].map(s => f2(M.standAt(s))).join(', ') + ' along the corridor\n');

console.log('YIELD — certifiable means a planner clears it and no simple rule does.\n');
console.log('  floors people  rate    winnable   a rule clears it   CERTIFIABLE');
const N = 60;
let best = null;
for (const floors of [4, 6, 7, 8, 10]) {
  for (const people of [5, 7, 9]) {
    for (const rate of [0.05, 0.07, 0.09]) {
      const r = cell(floors, people, rate, N);
      if (!best || r.certifiable > best.c) best = { floors, people, rate, c: r.certifiable };
      console.log('  ' + String(floors).padStart(6) + String(people).padStart(7) + f2(rate).padStart(6) +
        pc(r.winnable).padStart(12) + pc(r.ruleClears).padStart(19) + pc(r.certifiable).padStart(14));
    }
  }
}
console.log('\n  best: ' + best.floors + ' floors, ' + best.people + ' people, rate ' + f2(best.rate) +
            ' -> ' + pc(best.c) + ' certifiable');
console.log('  NOTE: at five people almost nothing certifies at any rate. That is the game\'s');
console.log('  minimum interesting size, and it is why the ladder\'s middle is certified on');
console.log('  DRIVING instead of on the schedule.\n');

console.log('DEPTH — how far ahead you must think (share of buildings fully cleared).\n');
console.log('  floors people  rate     d1     d2     d3     d4     d5     d7');
for (const [floors, people, rate] of [[7, 9, 0.072], [8, 9, 0.074], [10, 9, 0.084], [6, 7, 0.092]]) {
  const depths = [1, 2, 3, 4, 5, 7], hit = depths.map(() => 0), n = 60;
  for (let i = 0; i < n; i++) {
    const L = build(floors, people, rate, 7000 + i * 31 + floors * 977 + Math.round(rate * 1000));
    if (!L) continue;
    depths.forEach((d, j) => { if (S.run(L, S.planner(d, 6)).out === people) hit[j]++; });
  }
  console.log('  ' + String(floors).padStart(6) + String(people).padStart(7) + f2(rate).padStart(6) +
    hit.map(v => pc(v / n).padStart(7)).join(''));
}
console.log('\n  A jump that flattens by four or five stops is one trip of planning, which is');
console.log('  what a person does. Still climbing at seven would be a search, not a game.\n');

console.log('INGRESS — is smoke through the open door load-bearing?\n');
console.log('  ingress   winnable   CERTIFIABLE   react only   plan a trip   planning is worth');
const wasIngress = M.FIRE.ingress;
for (const ing of [0, 0.25, 0.55, 1.0]) {
  M.FIRE.ingress = ing;
  let win = 0, cert = 0, d1 = 0, d4 = 0;
  const n = 60, floors = 7, people = 9, rate = 0.072;
  for (let i = 0; i < n; i++) {
    const L = build(floors, people, rate, 7000 + i * 31 + floors * 977 + Math.round(rate * 1000));
    if (!L) continue;
    const p = S.run(L, PLAN).out === people;
    const bestRule = Math.max.apply(null, RULE_NAMES.map(k => S.run(L, S.RULES[k]).out)) === people;
    if (p) win++;
    if (p && !bestRule) cert++;
    if (S.run(L, S.planner(1, 6)).out === people) d1++;
    if (S.run(L, HUMAN).out === people) d4++;
  }
  console.log('  ' + f2(ing).padStart(7) + pc(win / n).padStart(11) + pc(cert / n).padStart(14) +
    pc(d1 / n).padStart(13) + pc(d4 / n).padStart(14) + ((100 * (d4 - d1) / n).toFixed(0) + ' points').padStart(19));
}
M.FIRE.ingress = wasIngress;
console.log('\n  At zero the door costs nothing, so the number of stops is free and reacting is');
console.log('  most of the game. It should peak inside the sweep rather than at the end: a');
console.log('  setting we would refuse is what says the value was chosen and not just maxed.');
