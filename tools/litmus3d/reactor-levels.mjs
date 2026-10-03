// The Reactor's 60 levels for Litmus in 3D: written here, checked here, and
// written out to litmus3d/reactor-levels.js.
//
// Owner, 2026-10-03: four agent orbs a level (the right one or ones, and
// decoys from all nine), and HALF AND HALF: about half the steps need an
// agent, half go as the molecules meet.
//
// For every level the check finds a shortest way to make the goals with the
// level's own agents (litmus3d/reactor-chem.js's search), and says:
//   - the steps, each with its agent or "meet";
//   - that no goal is in the space already;
//   - HONEST DECOYS: an agent shown but not needed must do nothing real to
//     anything the level can hold (the rules below, from the research), so a
//     bounce is the truth;
//   - HONEST PAIRS: no two molecules the level can hold may react in real life
//     unless the game has that reaction (lab.js leaves out pairs that need two
//     of one molecule, like magnesium with hydrochloric acid).
// usage: node tools/litmus3d/reactor-levels.mjs [--write]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url).pathname;
global.self = global;
global.ChemLab = require(root + 'chemistry/lab.js');
const C = require(root + 'litmus3d/reactor-chem.js');

/* ---------- THE LEVELS ----------
   targets | the molecules floating round you. `name*n` is n of them. Agents
   are filled in: the ones the shortest way needs, then honest decoys. */
const LEVELS = [
  // 1-10: one reaction each; the agents met one at a time, between reactions that need none
  ['sodium-chloride', 'hydrochloric-acid sodium-hydroxide'],
  ['calcium-oxide', 'calcium-carbonate'],
  ['carbon-dioxide', 'sodium-hydrogencarbonate hydrochloric-acid'],
  ['oxygen', 'water*2'],
  ['copper', 'copper-sulphate zinc'],
  ['hydrochloric-acid*2', 'hydrogen chlorine'],
  ['calcium-carbonate', 'calcium-chloride sodium-carbonate'],
  ['water*2', 'hydrogen*2 oxygen'],
  ['calcium-hydroxide', 'calcium-oxide water'],
  ['ammonia*2', 'nitrogen hydrogen*3'],
  // 11-20: one reaction, with something else floating that does not belong; the rest of the agents
  ['copper-oxide', 'copper-carbonate sodium-chloride'],
  ['oxygen', 'hydrogen-peroxide*2 sodium-chloride'],
  ['ammonium-nitrate', 'ammonia nitric-acid water'],
  ['sulphur-trioxide*2', 'sulphur-dioxide*2 oxygen nitrogen'],
  ['carbon-monoxide', 'methane water nitrogen'],
  ['copper', 'copper-oxide hydrogen nitrogen'],
  ['chlorine', 'copper-chloride water'],
  ['silver*2', 'silver-bromide*2 water'],
  ['nitrogen', 'carbon-monoxide*2 nitrogen-monoxide*2'],
  ['magnesium-sulphate', 'magnesium sulphuric-acid sodium-chloride'],
  // 21-35: two reactions, the second using what the first made
  ['calcium-hydroxide', 'calcium-carbonate water'],
  ['calcium-carbonate', 'calcium-oxide water carbon-dioxide'],
  ['sodium-chloride', 'methane chlorine sodium-hydroxide'],
  ['hydrochloric-acid*2', 'sodium-chloride*2 water*2'],
  ['copper', 'copper-carbonate magnesium'],
  ['sulphuric-acid', 'sulphur-dioxide*2 oxygen water'],
  ['ammonium-nitrate', 'nitrogen hydrogen*3 nitric-acid'],
  ['hydrobromic-acid*2', 'silver-bromide*2 hydrogen'],
  ['calcium-oxide', 'calcium-chloride sodium-carbonate'],
  ['ammonium-nitrate', 'ammonium-chloride nitric-acid'],
  ['carbon-dioxide*2', 'nitrogen oxygen carbon-monoxide*2'],
  ['hydrochloric-acid*2', 'copper-chloride hydrogen'],
  ['copper', 'water*2 copper-oxide'],
  ['silver-bromide', 'silver-nitrate sodium-bromide water'],
  ['magnesium-sulphate', 'sulphur-trioxide water magnesium'],
  // 36-60: two and three reactions, some with two goals; more that go as they meet
  ['sodium-sulphate', 'sulphuric-acid sodium-hydroxide*2'],
  ['calcium-chloride', 'hydrochloric-acid*2 calcium-hydroxide'],
  ['carbon-dioxide', 'hydrochloric-acid*2 sodium-carbonate'],
  ['copper', 'copper-carbonate sulphuric-acid zinc'],
  ['ammonia', 'calcium-oxide water ammonium-chloride'],
  ['calcium-chloride-nitrate', 'hydrochloric-acid calcium-hydroxide nitric-acid'],
  ['sodium-chloride*2', 'sodium-chloride*2 water*2'],
  ['ammonium-nitrate*2', 'methane water nitrogen nitric-acid*2'],
  ['hydrobromic-acid*2', 'silver-nitrate*2 sodium-bromide*2 hydrogen'],
  ['ammonium-nitrate sodium-chloride', 'ammonium-chloride nitric-acid sodium-hydroxide'],
  ['chlorine', 'hydrochloric-acid*2 copper-carbonate'],
  ['sulphuric-acid*2', 'sulphur-dioxide*2 oxygen water*2'],
  ['potassium-chloride*2', 'hydrochloric-acid*2 potassium-carbonate'],
  ['calcium-hydroxide', 'sodium-carbonate calcium-chloride water'],
  ['sodium-chlorate-i', 'sodium-chloride*2 water*2'],
  ['iron*2 calcium-carbonate', 'iron-oxide carbon-monoxide*3 calcium-hydroxide'],
  ['copper magnesium-sulphate', 'magnesium copper-oxide sulphuric-acid'],
  ['copper', 'sodium-carbonate copper-sulphate hydrogen'],
  ['zinc', 'zinc-carbonate sulphuric-acid magnesium'],
  ['oxygen*2', 'water*2 hydrogen-peroxide*2'],
  ['sodium-hydrogencarbonate', 'calcium-carbonate sodium-hydroxide'],
  ['ammonium-chloride*2', 'nitrogen hydrogen*4 chlorine'],
  ['sodium-nitrate*2', 'nitric-acid*2 sodium-carbonate'],
  ['calcium-carbonate', 'calcium-carbonate water'],
  ['ammonium-nitrate copper', 'nitrogen hydrogen*4 nitric-acid copper-oxide'],
];

/* ---------- WHAT AN AGENT COULD REALLY DO ----------
   For honest decoys: true if this agent would set something off among these
   molecules in real life (whether or not the game has that reaction). */
const S = C.SPECIES, tags = (k) => (S[k] && S[k].tags) || [];
const any = (have, ...ks) => ks.some((k) => have.has(k));
const anyTag = (have, ...ts) => [...have].some((k) => ts.some((t) => tags(k).includes(t)));
const fuel = (h) => any(h, 'hydrogen', 'methane', 'carbon-monoxide');
const COULD = {
  heat: (h) => anyTag(h, 'ammonium', 'hydrogencarbonate') ||
    [...h].some((k) => tags(k).includes('carbonate') && !['sodium-carbonate', 'potassium-carbonate'].includes(k)) ||
    any(h, 'hydrogen-peroxide', 'copper-hydroxide', 'zinc-hydroxide', 'magnesium-hydroxide', 'sodium-nitrate', 'potassium-nitrate', 'calcium-nitrate', 'magnesium-nitrate', 'copper-nitrate', 'zinc-nitrate') ||
    (fuel(h) && any(h, 'oxygen')) || (any(h, 'nitrogen') && any(h, 'oxygen')) ||
    (any(h, 'copper-oxide') && any(h, 'hydrogen', 'carbon-monoxide', 'magnesium', 'zinc')) ||
    (any(h, 'iron-oxide') && any(h, 'carbon-monoxide')) || (any(h, 'magnesium', 'zinc', 'iron', 'copper') && any(h, 'oxygen', 'chlorine')) ||
    anyTag(h, 'oxide') && anyTag(h, 'acid') || any(h, 'silver-nitrate'),
  electricity: (h) => [...h].some((k) => tags(k).some((t) => ['salt', 'acid', 'base', 'strong-base'].includes(t))),
  light: (h) => (any(h, 'chlorine', 'bromine') && any(h, 'hydrogen', 'methane')) || any(h, 'silver-bromide', 'silver-chloride', 'silver-nitrate', 'hydrogen-peroxide', 'nitric-acid'),
  spark: (h) => (fuel(h) && any(h, 'oxygen', 'chlorine', 'bromine')) || (any(h, 'nitrogen') && any(h, 'oxygen')),
  platinum: (h) => any(h, 'hydrogen-peroxide') || (any(h, 'hydrogen', 'methane', 'carbon-monoxide', 'ammonia', 'sulphur-dioxide') && any(h, 'oxygen')) || (any(h, 'carbon-monoxide') && any(h, 'nitrogen-monoxide')),
  iron: (h) => (any(h, 'nitrogen') && any(h, 'hydrogen')) || any(h, 'hydrogen-peroxide'),
  nickel: (h) => any(h, 'methane') && any(h, 'water'),
  vanadium: (h) => any(h, 'sulphur-dioxide') && any(h, 'oxygen'),
  manganese: (h) => any(h, 'hydrogen-peroxide'),
};
/* Pairs that react in real life but that the game does not have: never in a
   level together. lab.js takes molecules two at a time, so a metal with a
   one-hydrogen acid, an alkali with carbon dioxide, and the like are left out. */
function realButMissing(a, b) {
  // the game has it: not missing
  if (C.reactionIn([a, b], null) || C.REACTIONS.some((r) => !r.agent && r.in.some(([k]) => k === a) && r.in.some(([k]) => k === b))) return false;
  const pair = (p, q) => (p(a) && q(b)) || (p(b) && q(a));
  const is = (...ks) => (k) => ks.includes(k);
  const t = (x) => (k) => tags(k).includes(x);
  return pair(is('magnesium', 'zinc', 'iron'), t('acid')) ||
    pair(t('strong-base'), is('carbon-dioxide', 'sulphur-dioxide', 'sulphur-trioxide', 'chlorine')) ||
    pair(t('strong-base'), (k) => /^(copper|zinc|magnesium|iron)-/.test(k) && tags(k).includes('salt')) ||
    pair(is('nitrogen-monoxide'), is('oxygen')) || pair(is('sulphur-dioxide'), is('water')) ||
    pair(is('silver-nitrate'), (k) => !/^silver/.test(k) && (tags(k).includes('chloride') || /bromide/.test(k))) ||
    pair(is('nitrogen-dioxide'), is('water')) ||
    pair(is('sulphur-trioxide'), t('base'));
}

/* ---------- THE CHECK ---------- */
const ALL = Object.keys(C.AGENTS);
const parse = (s) => s.split(/\s+/).filter(Boolean).flatMap((w) => { const [k, n] = w.split('*'); return Array(+(n || 1)).fill(k); });
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const out = [], problems = [];
let agentSteps = 0, meetSteps = 0;
const used = {};
LEVELS.forEach(([tg, sp], i) => {
  const n = i + 1, space = parse(sp), targets = Object.entries(parse(tg).reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {}));
  const missing = [...space, ...targets.map(([k]) => k)].filter((k) => !S[k]);
  if (missing.length) { problems.push(`${n}: no molecule ${missing.join(', ')}`); return; }
  // the shortest way with every agent available says which agents the level needs
  const counts = space.reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {}), owed = Object.fromEntries(targets);
  const p = C.bestPlan(counts, owed, ALL);
  if (!p.plan) { problems.push(`${n}: cannot be made`); return; }
  const need = [...new Set(p.plan.filter((r) => r.agent).map((r) => r.agent))];
  // decoys: agents that would really do nothing to anything this level can hold
  const have = C.closure(space, need);
  // a decoy must not set off anything the game has either
  const modelled = (a) => C.levelReactions([...have], [a]).some((r) => r.agent === a || r.also.includes(a));
  const safe = ALL.filter((a) => !need.includes(a) && !COULD[a](have) && !modelled(a));
  const R = mulberry(n * 7919);
  const pool = safe.slice().sort((a, b) => ((used[a] || 0) - (used[b] || 0)) || (R() - 0.5));
  const agents = need.concat(pool.slice(0, 4 - need.length));
  if (agents.length < 4) problems.push(`${n}: only ${agents.length} honest agents (${agents.join(', ')})`);
  agents.forEach((a) => { used[a] = (used[a] || 0) + 1; });
  // with the level's own four, the same goals must still be makeable, and the plan is the one shown
  const q = C.bestPlan(counts, owed, agents);
  if (!q.plan) problems.push(`${n}: cannot be made with ${agents.join(', ')}`);
  const steps = (q.plan || []).map((r) => r.agent || 'meet');
  steps.forEach((x) => (x === 'meet' ? meetSteps++ : agentSteps++));
  // honest pairs, among everything the level can hold
  const hold = [...C.closure(space, agents)];
  for (let a = 0; a < hold.length; a++) for (let b = a; b < hold.length; b++) {
    if (realButMissing(hold[a], hold[b])) problems.push(`${n}: ${hold[a]} and ${hold[b]} react in real life, not in the game`);
  }
  out.push({ n, targets, space, agents, steps, plan: (q.plan || []).map((r) => r.id) });
});

for (const L of out) console.log(String(L.n).padStart(2), L.steps.join(' > ').padEnd(30), '|', L.targets.map(([k, c]) => k + (c > 1 ? '×' + c : '')).join(', ').padEnd(26), '|', L.agents.join(', '));
console.log(`\n${out.length} levels; steps: ${agentSteps} with an agent, ${meetSteps} as they meet`);
console.log('agents shown:', JSON.stringify(used));
for (const p of problems) console.log('PROBLEM', p);

if (process.argv.includes('--write') && !problems.length) {
  const body = out.map((L) => `  { targets: ${JSON.stringify(L.targets)}, space: ${JSON.stringify(L.space)}, agents: ${JSON.stringify(L.agents)}, seed: ${L.n * 37 + 11} },`).join('\n');
  writeFileSync(root + 'litmus3d/reactor-levels.js', `/* Litmus in 3D · the Reactor's levels. Written by tools/litmus3d/reactor-levels.mjs:
   edit the list there and run it with --write. Each level: the goals, the
   molecules floating round you, the four agent orbs (the needed ones first). */
window.REACTOR_LEVELS = [
${body}
];
`);
  console.log('wrote litmus3d/reactor-levels.js');
}
