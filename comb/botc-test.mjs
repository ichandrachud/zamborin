#!/usr/bin/env node
/* Bot C fails levels at any cap. Are those levels UNSOLVABLE, or is Bot C's
   tightest-hole rule simply incomplete under the sliding tray window?
   If constructive replay passes on the very levels Bot C fails, the level is
   solvable in plain tray order and Bot C is a STRATEGY, not a solver — and
   the "derivable band" it was used to define is too tight. */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const G = require('./gen.js');
const tune = { ...G.TUNE, pieceMin: 3, pieceMax: 4 };
let failC = 0, ofWhichSolvable = 0, ofWhichPlanner = 0;
for (const cells of [20, 24, 28]) {
  const tier = { cells, spread: 0, pool: 6, sizes: [3,4], varietyBias: 0.24, irregularity: 0.55 };
  for (let s = 1; s <= 40; s++) {
    const lv = G.makeLevel(s * 131 + cells, 0, { tiers: [tier], tune });
    if (!lv) continue;
    if (G.botConstrained(lv, { cap: 50000, tune }).solved) continue;
    failC++;
    if (G.verifyConstructive(lv).ok) ofWhichSolvable++;
    if (G.botPlanner(lv).solved) ofWhichPlanner++;
  }
}
console.log('  levels Bot C could not solve at cap 50000: ' + failC);
console.log('  ...of those, solvable by plain tray order:  ' + ofWhichSolvable);
console.log('  ...of those, solvable by the planner:       ' + ofWhichPlanner);
console.log(failC && ofWhichSolvable === failC
  ? '\n  CONFIRMED: every level Bot C "fails" is solvable by placing the queue\n  in order. Bot C measures a STRATEGY failing, not an unfair level.'
  : '\n  NOT confirmed — some are genuinely unsolvable; the band stands.');
