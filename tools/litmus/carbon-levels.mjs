// The Carbon Chamber's 40 levels for Litmus in 3D, from /chemistry/'s own
// (levels.js `organic`, the desktop set: it floats more molecules, and in 3D
// there is room all round), changed only where the owner decided
// (2026-10-03, iCloud Zamborin/Game Briefs/3D-IDEAS/LITMUS_CARBON_AGENTS.md):
//   - an alcohol turns into its acid with the OXIDISER (acidified potassium
//     dichromate): the oxygen comes from the agent, so the levels' oxygen
//     molecules go;
//   - level 9 uses hydrobromic acid (ethanol and hydrochloric acid are too slow
//     in a lab): bromoethane, warmed.
// Every level shows the chamber's four agents: Nickel, Acid, Heat, Oxidiser.
// Then, as the Reactor's (owner, 2026-10-03: "a lot of molecules floating"),
// honest decoys: real molecules that give no shorter way, need no other agent,
// and meet nothing the level can hold in a way real chemistry would and the
// game would not (tools/litmus/honesty.mjs).
// usage: node tools/litmus/carbon-levels.mjs [--write]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { honesty } from './honesty.mjs';
const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url).pathname;
global.self = global; global.window = global;
global.ChemModel = require(root + 'chemistry/model.js');
global.ChemLab = require(root + 'chemistry/lab.js');
const LV = require(root + 'chemistry/levels.js');
const C = require(root + 'litmus/reactor-chem.js');
C.setChapter('carbon');
const AGENTS = ['nickel', 'acid', 'heat', 'oxidiser'];
const { realButMissing } = honesty(C);
const S = C.SPECIES, tags = (k) => (S[k] && S[k].tags) || [];
/* What the four agents would really do here that the game does not have (the rest they do, the game has: the
   Oxidiser's other jobs are in reactor-chem.js). In the Carbon Chamber Heat is a lab's: warming, or heating under
   reflux (LITMUS_CARBON_AGENTS.md). Two things it would still do that the game has no molecule for: an ammonium salt of
   a carboxylic acid, heated, loses water to an amide; ammonia and a haloalkane, heated, give an amine. Ammonia and an
   ester make an amide even as they meet. Kept out of every level. */
const kind = (k) => S[k] && S[k].carbon && S[k].carbon.kind;
function carbonMissing(have) {
  const h = [...have];
  if (h.some((k) => tags(k).includes('ammonium') && tags(k).includes('weak-acid-salt'))) return 'an ammonium carboxylate, heated';
  if (have.has('ammonia') && h.some((k) => ['haloalkane', 'dihalo', 'ester'].includes(kind(k)))) return 'ammonia with a haloalkane or an ester';
  return null;
}

/* The molecules a decoy is chosen from: the Carbon Lab's own bench, and the Reactor's common ones. Each is checked per
   level; most organic ones react with something the level holds, and are left out there. */
const DECOYS = ['water', 'hydrogen', 'carbon-dioxide', 'nitrogen', 'sodium-chloride', 'potassium-chloride', 'sodium-sulphate',
  'potassium-sulphate', 'magnesium-sulphate', 'calcium-chloride', 'sodium-nitrate', 'potassium-nitrate', 'sodium-carbonate',
  'calcium-carbonate', 'ethane', 'propane', 'methane', 'ethene', 'propene', 'methanol', 'ethanol', 'propanol', 'ethanoic-acid',
  'methanoic-acid', 'propanoic-acid', 'sodium-ethanoate', 'sodium-methanoate', 'sodium-propanoate', 'potassium-ethanoate',
  'ethyl-ethanoate', 'methyl-ethanoate', 'chloroethane', 'bromoethane', 'chloromethane', 'sodium-bromide', 'potassium-bromide',
  'copper', 'zinc', 'magnesium-oxide', 'copper-oxide', 'zinc-oxide', 'sodium-hydrogencarbonate'];

/* Molecules the 2D game floats as extras that would make a level dishonest here, where the Oxidiser and Heat are
   always on hand (each checked by this script; none is on the level's own way):
     9, 25, 33: sodium hydroxide, which bromine (there, or made by the Oxidiser from hydrobromic acid) would react
                with as they meet, into bromate(V): three bromine and six hydroxide, more than a sphere holds;
     12:        sodium hydroxide: with the bromopropane it makes sodium bromide, which the Oxidiser turns to bromine
                beside the potassium hydroxide the level needs;
     37:        hydrobromic acid, for the same reason, with the sodium hydroxide the level needs as a trap;
     22:        ethanol and propanol: their esters meet ammonia into an amide, and propanoic acid would make an
                ammonium salt that heat turns into an amide, molecules the game does not have. */
const DROP = { 9: ['sodium-hydroxide'], 12: ['sodium-hydroxide'], 22: ['ethanol', 'propanol'], 25: ['sodium-hydroxide'], 33: ['sodium-hydroxide'], 37: ['hydrobromic-acid'] };
const counts = (list) => list.reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {});
// a goal the level cannot make one more of than it wants flies to it as it is made, and is never held
const goneOf = (sp, targets) => new Set(targets.filter(([k, c]) => !C.bestPlan(counts(sp), { [k]: c + 1 }, AGENTS).plan).map(([k]) => k));
const involves = (r, k) => r && r.in.some(([x]) => x === k);
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pairsMissing(hold) {
  for (let x = 0; x < hold.length; x++) for (let y = x; y < hold.length; y++) if (realButMissing(hold[x], hold[y])) return `${hold[x]} and ${hold[y]}`;
  return null;
}

const out = [], problems = [];
let agentSteps = 0, meetSteps = 0;
const use = {};
LV.organic.desktop.forEach((L0, i) => {
  const n = i + 1;
  let targets = L0.targets.map(([k, c]) => [k, c]), space = L0.dish.filter((k) => k !== 'oxygen');
  for (const k of DROP[n] || []) { const i = space.indexOf(k); if (i < 0) problems.push(`${n}: nothing to drop: ${k}`); else space.splice(i, 1); }
  if (n === 9) {
    space = space.map((k) => (k === 'hydrochloric-acid' ? 'hydrobromic-acid' : k));
    targets = targets.map(([k, c]) => [k === 'chloroethane' ? 'bromoethane' : k, c]);
  }
  const missing = [...space, ...targets.map(([k]) => k)].filter((k) => !S[k]);
  if (missing.length) { problems.push(`${n}: no molecule ${missing.join(', ')}`); return; }
  const owed = Object.fromEntries(targets);
  const p = C.bestPlan(counts(space), owed, AGENTS);
  if (!p.plan) { problems.push(`${n}: cannot be made (${targets.map(([k]) => k).join(', ')} from ${space.join(', ')})`); return; }
  const shortest = p.plan.length, need = new Set(p.plan.filter((r) => r.agent).map((r) => r.agent));
  const steps = p.plan.map((r) => r.agent || 'meet');
  steps.forEach((x) => { x === 'meet' ? meetSteps++ : agentSteps++; use[x] = (use[x] || 0) + 1; });
  // the level itself must be honest before any decoy
  const hold0 = C.closure(space, AGENTS, goneOf(space, targets)), bad0 = pairsMissing([...hold0]) || carbonMissing(hold0);
  if (bad0) problems.push(`${n}: ${bad0} (in the level as it is)`);
  /* decoys: no shorter way, no other agent needed, nothing real the game lacks; the first five levels' decoys react
     with nothing at all, so no first tap is a trap */
  const want = n <= 5 ? 24 : 32, decoys = [];
  const tryWith = (extra) => {
    const sp2 = space.concat(extra), p2 = C.bestPlan(counts(sp2), owed, AGENTS);
    if (!p2.plan || p2.plan.length < shortest) return false;
    if (p2.plan.some((r) => r.agent && !need.has(r.agent))) return false;
    const hold2 = C.closure(sp2, AGENTS, goneOf(sp2, targets));
    if (pairsMissing([...hold2]) || carbonMissing(hold2)) return false;
    if (n <= 5) {
      const k = extra[extra.length - 1];
      if ([...hold2].some((h) => [null, ...AGENTS].some((a) => involves(C.reactionIn([k, h], a), k))) || AGENTS.some((a) => involves(C.reactionIn([k], a), k))) return false;
    }
    return true;
  };
  if (!bad0) {
    const RD = mulberry(n * 104729 + 29), dpool = DECOYS.slice().sort(() => RD() - 0.5);
    for (const k of dpool) {
      if (decoys.length >= want) break;
      if (targets.some(([t]) => t === k) || [...space, ...decoys].filter((x) => x === k).length >= 3) continue;
      if (tryWith(decoys.concat(k))) decoys.push(k);
    }
    for (const k of dpool.concat(dpool, dpool)) {
      if (decoys.length >= want) break;
      if (!decoys.includes(k) || [...space, ...decoys].filter((x) => x === k).length >= 3) continue;
      if (tryWith(decoys.concat(k))) decoys.push(k);
    }
  }
  // the first three put what they need in front of you, to learn on; after that all is shuffled
  let floatOrder = space.concat(decoys);
  if (n > 3) { const RS = mulberry(n * 31337 + 5); floatOrder = floatOrder.map((k) => [RS(), k]).sort((a, b) => a[0] - b[0]).map(([, k]) => k); }
  out.push({ n, targets, space: floatOrder, agents: AGENTS, steps, decoys: decoys.length, seed: L0.seed });
});
for (const L of out) console.log(String(L.n).padStart(2), L.steps.join(' > ').padEnd(36), '|', L.targets.map(([k, c]) => k + (c > 1 ? '×' + c : '')).join(', ').padEnd(34), '|', String(L.space.length).padStart(2), 'floating', `(${L.decoys} decoys)`);
console.log(`\n${out.length} levels; steps: ${agentSteps} with an agent, ${meetSteps} as they meet; by agent ${JSON.stringify(use)}`);
for (const p of problems) console.log('PROBLEM', p);
if (process.argv.includes('--write') && !problems.length) {
  const body = out.map((L) => `  { targets: ${JSON.stringify(L.targets)}, space: ${JSON.stringify(L.space)}, agents: ${JSON.stringify(L.agents)}, seed: ${L.seed} },`).join('\n');
  writeFileSync(root + 'litmus/carbon-levels.js', `/* Litmus in 3D · the Carbon Chamber's levels. Written by tools/litmus/carbon-levels.mjs from
   /chemistry/levels.js (organic, desktop set), with the owner's two changes (the Oxidiser in place of oxygen
   molecules, and level 9 on hydrobromic acid) and honest decoys. Each level: the goals, the molecules round you,
   the four agents. */
window.CARBON_LEVELS = [
${body}
];
`);
  console.log('wrote litmus/carbon-levels.js');
}
