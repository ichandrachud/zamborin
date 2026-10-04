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
// Checks, as the Reactor's: each level can be made with them; no two molecules
// a level can hold react in real life without the game having that reaction.
// usage: node tools/litmus3d/carbon-levels.mjs [--write]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url).pathname;
global.self = global; global.window = global;
global.ChemModel = require(root + 'chemistry/model.js');
global.ChemLab = require(root + 'chemistry/lab.js');
const LV = require(root + 'chemistry/levels.js');
const C = require(root + 'litmus3d/reactor-chem.js');
C.setChapter('carbon');
const AGENTS = ['nickel', 'acid', 'heat', 'oxidiser'];

const out = [], problems = [];
let agentSteps = 0, meetSteps = 0;
const use = {};
LV.organic.desktop.forEach((L0, i) => {
  const n = i + 1;
  let targets = L0.targets.map(([k, c]) => [k, c]), space = L0.dish.filter((k) => k !== 'oxygen');
  if (n === 9) {
    space = space.map((k) => (k === 'hydrochloric-acid' ? 'hydrobromic-acid' : k));
    targets = targets.map(([k, c]) => [k === 'chloroethane' ? 'bromoethane' : k, c]);
  }
  const missing = [...space, ...targets.map(([k]) => k)].filter((k) => !C.SPECIES[k]);
  if (missing.length) { problems.push(`${n}: no molecule ${missing.join(', ')}`); return; }
  const counts = space.reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {}), owed = Object.fromEntries(targets);
  const p = C.bestPlan(counts, owed, AGENTS);
  if (!p.plan) { problems.push(`${n}: cannot be made (${targets.map(([k]) => k).join(', ')} from ${space.join(', ')})`); return; }
  const steps = p.plan.map((r) => r.agent || 'meet');
  steps.forEach((x) => { x === 'meet' ? meetSteps++ : agentSteps++; use[x] = (use[x] || 0) + 1; });
  out.push({ n, targets, space, agents: AGENTS, steps, seed: L0.seed });
});
for (const L of out) console.log(String(L.n).padStart(2), L.steps.join(' > ').padEnd(34), '|', L.targets.map(([k, c]) => k + (c > 1 ? '×' + c : '')).join(', '));
console.log(`\n${out.length} levels; steps: ${agentSteps} with an agent, ${meetSteps} as they meet; by agent ${JSON.stringify(use)}`);
for (const p of problems) console.log('PROBLEM', p);
if (process.argv.includes('--write') && !problems.length) {
  const body = out.map((L) => `  { targets: ${JSON.stringify(L.targets)}, space: ${JSON.stringify(L.space)}, agents: ${JSON.stringify(L.agents)}, seed: ${L.seed} },`).join('\n');
  writeFileSync(root + 'litmus3d/carbon-levels.js', `/* Litmus in 3D · the Carbon Chamber's levels. Written by tools/litmus3d/carbon-levels.mjs from
   /chemistry/levels.js (organic, desktop set), with the owner's two changes: the Oxidiser in place of oxygen
   molecules, and level 9 on hydrobromic acid. Each level: the goals, the molecules round you, the four agents. */
window.CARBON_LEVELS = [
${body}
];
`);
  console.log('wrote litmus3d/carbon-levels.js');
}
