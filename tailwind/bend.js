/* TAILWIND — does a SECOND launch variable earn its place?

   The proposal: bend the trunk back, then draw the band. Two inputs feeding one
   launch instead of one.

   The failure this has to clear first is the one the launch ANGLE already fell
   into once. On flat ground in still air the best aim was simply the steepest
   the catapult went, so the angle was not a decision, it was a tax — you dialled
   it to the ceiling every time and got on with the real input. A bend that only
   stores energy is that again in a new costume. So the question is not "is there
   another input", it is:

     IS THERE A BEND YOU WOULD CHOOSE NOT TO USE?

   And a second one, particular to two inputs that both feed launch energy:

     ARE THEY THE SAME KNOB TWICE?

   If only the total matters, the response surface has a diagonal RIDGE rather
   than a peak — every (pull, bend) pair on the line is equally good, the choice
   between them is arbitrary, and the second input has added book-keeping rather
   than a decision. That has a signature: within the near-optimal set, pull and
   bend are strongly anti-correlated and the set is long and thin.

   Run:  node tailwind/bend.js
         node tailwind/bend.js sweep      (search the four constants)
*/
const M = require('./model.js');

const A0 = M.CFG.ANG_MIN, A1 = M.CFG.ANG_MAX;
const f0 = (n) => n.toFixed(0);
const f1 = (n) => n.toFixed(1);
const f2 = (n) => n.toFixed(2);
const pct = (n) => (100 * n).toFixed(0) + '%';
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Best over all three inputs, and the whole near-optimal set with it.
function best3(plane, wind = 0, nA = 25, nP = 16, nB = 11) {
  const p = M.build(plane);
  let b = { dist: -1 };
  const cells = [];
  for (let i = 0; i < nA; i++) {
    const a = A0 + (A1 - A0) * (i / (nA - 1));
    for (let j = 0; j < nP; j++) {
      const pu = j / (nP - 1);
      for (let k = 0; k < nB; k++) {
        const bd = k / (nB - 1);
        const d = M.fly(p, a, pu, { wind, bend: bd }).dist;
        cells.push({ a, pu, bd, d });
        if (d > b.dist) b = { dist: d, angle: a, pull: pu, bend: bd };
      }
    }
  }
  return { best: b, cells };
}

// Is the peak a point, or a line along which the two energy inputs trade?
function ridgeTest(cells, best, tol = 0.99) {
  const near = cells.filter((c) => c.d >= tol * best.dist);
  const pu = near.map((c) => c.pu), bd = near.map((c) => c.bd);
  const mp = mean(pu), mb = mean(bd);
  const sp = Math.sqrt(mean(pu.map((v) => (v - mp) ** 2)));
  const sb = Math.sqrt(mean(bd.map((v) => (v - mb) ** 2)));
  let r = 0;
  if (sp > 1e-9 && sb > 1e-9) {
    r = mean(near.map((c, i) => (pu[i] - mp) * (bd[i] - mb))) / (sp * sb);
  }
  return {
    n: near.length, share: near.length / cells.length,
    spreadPull: Math.max(...pu) - Math.min(...pu),
    spreadBend: Math.max(...bd) - Math.min(...bd),
    corr: r,
  };
}

// Aiming at the optimum with a human-sized wobble on ALL THREE inputs.
function byFeel(plane, opt, wind = 0, samples = 1200) {
  const p = M.build(plane);
  const rnd = mulberry(4242);
  const out = [];
  for (let i = 0; i < samples; i++) {
    const a  = Math.max(A0, Math.min(A1, opt.angle + (rnd() * 2 - 1) * 5));
    const pu = Math.max(0, Math.min(1, opt.pull + (rnd() * 2 - 1) * 0.08));
    const bd = Math.max(0, Math.min(1, opt.bend + (rnd() * 2 - 1) * 0.10));
    out.push(M.fly(p, a, pu, { wind, bend: bd }).dist);
  }
  return mean(out);
}

const FLEET = Object.keys(M.PLANES);

// ---- the constants sweep --------------------------------------------------
if (process.argv[2] === 'sweep') {
  console.log('SWEEPING THE FOUR BEND CONSTANTS for a both-interior optimum\n');
  console.log('  interior = the best bend is neither 0 (never worth it) nor 1 (always max)\n');
  const E   = [600, 1200, 2000];
  const TIL = [0, 8, 14, 22];
  const DRP = [0, 2.4, 4.5];
  const STR = [0.25, 0.60];
  const keep = M.CFG.E_BEND, keepT = M.CFG.BEND_TILT,
        keepD = M.CFG.BEND_DROP, keepS = M.CFG.BEND_STROKE;
  const hits = [];
  let tried = 0;
  for (const e of E) for (const t of TIL) for (const d of DRP) for (const st of STR) {
    M.CFG.E_BEND = e; M.CFG.BEND_TILT = t; M.CFG.BEND_DROP = d; M.CFG.BEND_STROKE = st;
    tried++;
    // two planes at opposite ends of the strength range is enough to reject
    const rows = ['Lacerta', 'Tempest'].map((n) => best3(n, 0, 15, 10, 9).best);
    const interior = rows.every((r) => r.bend > 0.001 && r.bend < 0.999);
    if (interior) hits.push({ e, t, d, st, bends: rows.map((r) => r.bend) });
  }
  M.CFG.E_BEND = keep; M.CFG.BEND_TILT = keepT;
  M.CFG.BEND_DROP = keepD; M.CFG.BEND_STROKE = keepS;
  console.log(`  ${tried} settings tried, ${hits.length} gave an interior bend on BOTH planes\n`);
  for (const h of hits) {
    console.log(`   E_BEND ${String(h.e).padStart(4)}  TILT ${String(h.t).padStart(2)}°  ` +
      `DROP ${f1(h.d)} m  STROKE +${pct(h.st)}   ->  bend ${h.bends.map(f2).join(' / ')}`);
  }
  if (!hits.length) {
    console.log('   NONE. Bend is monotonic under every setting tried: it is a tax,');
    console.log('   not a decision, and it should not be built.');
  }
  process.exit(0);
}

// ---- the report -----------------------------------------------------------
console.log('TAILWIND — is TREE BEND a second decision, or the same knob twice?\n');
console.log(`  E_BEND ${M.CFG.E_BEND} J   TILT ${M.CFG.BEND_TILT}°   ` +
  `DROP ${M.CFG.BEND_DROP} m   STROKE +${pct(M.CFG.BEND_STROKE)}\n`);

const opts = {};
for (const name of FLEET) {
  const { best, cells } = best3(name);
  const one = M.best(M.build(name));               // today's game, bend fixed at 0
  const R = ridgeTest(cells, best);
  const feel = byFeel(name, best);
  opts[name] = best;
  const wall = best.bend < 0.001 ? '  <- WALL, never worth bending'
            : best.bend > 0.999 ? '  <- WALL, always bend to the stop'
            : '';
  console.log(`${name}`);
  console.log(`   best      ${f0(best.dist).padStart(5)} m   at ${f1(best.angle)}° / pull ${f2(best.pull)} / bend ${f2(best.bend)}${wall}`);
  console.log(`   no bend   ${f0(one.dist).padStart(5)} m   at ${f1(one.angle)}° / pull ${f2(one.pull)}   (${pct(one.dist / best.dist)} of it)`);
  console.log(`   by feel   ${f0(feel).padStart(5)} m   ${pct(feel / best.dist)} of best   (wobbling all three)`);
  console.log(`   near-optimal set: ${pct(R.share)} of inputs, pull spans ${f2(R.spreadPull)}, bend spans ${f2(R.spreadBend)}, corr ${R.corr.toFixed(2)}`);
  console.log('');
}

const bends = FLEET.map((n) => opts[n].bend);
const walls = bends.filter((b) => b < 0.001 || b > 0.999).length;
console.log(`SPREAD OF BEST BEND: ${f2(Math.min(...bends))} – ${f2(Math.max(...bends))}` +
  `   (${walls} of ${FLEET.length} sat on a wall)`);

// Does bend change the best AIM? If it does, the two inputs are coupled and the
// second one is buying a decision rather than a number.
console.log('\nDOES BEND MOVE THE BEST AIM?  Lacerta, best angle at each bend\n');
const p = M.build('Lacerta');
for (const bd of [0, 0.25, 0.5, 0.75, 1]) {
  let b = { d: -1 };
  for (let i = 0; i < 40; i++) {
    const a = A0 + (A1 - A0) * (i / 39);
    for (let j = 0; j <= 20; j++) {
      const d = M.fly(p, a, j / 20, { bend: bd }).dist;
      if (d > b.d) b = { d, a, pu: j / 20 };
    }
  }
  console.log(`   bend ${f2(bd)}  ->  best ${f1(b.a).padStart(5)}° / pull ${f2(b.pu)}   ${f0(b.d).padStart(4)} m`);
}

console.log(`
READ IT LIKE THIS
  best bend on a wall (0 or 1)     -> not a decision. Always-1 is a tax you pay
                                      every launch; always-0 means it is dead
                                      weight. Either way, do not build it.
  near-optimal corr near -1        -> a RIDGE: pull and bend are the same knob
   and a wide span in both            twice and the choice between them is
                                      arbitrary book-keeping.
  best aim unchanged by bend       -> the two inputs do not talk to each other,
                                      so the second one is a multiplier, not a
                                      decision.
  by feel well under best          -> three wobbling inputs have made the peak a
                                      needle; the player cannot hold it.`);
