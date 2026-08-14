/* MOBILE — the right gate for a game that is not a puzzle.

   The earlier harness handed every simulated player exact integer weights, and
   then reported the game was trivial. That was the harness being wrong, not the
   game: the entire design withholds those numbers. Shapes are irregular so that
   area has to be judged by eye, and a piece 20% heavier is only about 9% wider.

   So this asks the question that actually decides a craft game:

     does CARE succeed where CARELESSNESS fails?

   Three people, all of whom see what a real player sees — which way each rod
   droops, and roughly how big each shape is:

     careless   grabs whatever looks about right, hangs it, moves on. Barely
                looks at the result.
     careful    estimates, hangs, watches it settle, and adjusts the worst rod,
                patiently, many times.
     precise    a person with an unrealistically good eye, as an upper bound.

   The difference between them IS the game. If careless succeeds, there is no
   craft in it. If careful fails, it is not satisfying, it is a chore.

   Run:  node mobile/craft.js
*/
const M = require('./model.js');

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pct = (n, d) => d ? (100 * n / d).toFixed(0) + '%' : 'n/a';
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const med = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

// An eye, not a scale. Judging area is roughly logarithmic and roughly 10% off
// for an attentive person, worse for a careless one.
function eye(trueArea, noise, rnd) {
  const g = (rnd() + rnd() + rnd() + rnd() - 2) * 0.7;     // rough normal
  return trueArea * Math.exp(g * noise);
}

const weightsOf = (b, assign) => {
  const at = {};
  b.hooks.forEach((h, i) => { at[h] = assign[i] == null ? 0 : b.shapes[assign[i]]; });
  return at;
};
const solved = (b, assign) =>
  assign.every(x => x != null) && M.totalError(b.tree, weightsOf(b, assign)) === 0;

/* A person plays like this: they look at each rod, see which way it hangs, and
   form a belief about what each hook needs. They cannot compute it, but the
   droop tells them "this side wants less" and they reach for a piece that looks
   that much lighter. `noise` is how badly they judge area; `patience` is how
   many adjustments they are willing to make before giving up. */
function play(b, { noise, patience, rnd }) {
  const n = b.hooks.length;
  // what they believe each shape weighs
  const seen = b.shapes.map(w => eye(w, noise, rnd));

  // first pass: hang things in a plausible order, big pieces on short arms
  let assign = new Array(n).fill(null);
  const armOf = {};
  (function walk(node, depth) {
    if (M.isHook(node)) { armOf[node.id] = depth; return; }
    walk(node.left, depth * (node.L || 1));
    walk(node.right, depth * (node.R || 1));
  })(b.tree, 1);
  const hookOrder = b.hooks.map((h, i) => i).sort((a, c) => armOf[b.hooks[a]] - armOf[b.hooks[c]]);
  const shapeOrder = seen.map((w, i) => i).sort((a, c) => seen[c] - seen[a]);
  hookOrder.forEach((hi, k) => { if (shapeOrder[k] != null) assign[hi] = shapeOrder[k]; });

  let attempts = 0;
  for (let step = 0; step < patience; step++) {
    if (solved(b, assign)) return { won: true, attempts };
    const at = weightsOf(b, assign);
    const errs = M.errors(b.tree, at);
    // the rod that visibly hangs worst
    const worst = errs.reduce((a, e) => {
      const scale = Math.max(1, e.wl + e.wr);
      return Math.abs(e.err) / scale > Math.abs(a.err) / Math.max(1, a.wl + a.wr) ? e : a;
    }, errs[0]);
    if (!worst || worst.err === 0) return { won: solved(b, assign), attempts };

    // which hooks hang under the heavy side, and under the light side
    const under = (node, out = []) => { M.isHook(node) ? out.push(node.id) : (under(node.left, out), under(node.right, out)); return out; };
    const heavy = worst.err > 0 ? under(worst.node.left) : under(worst.node.right);
    const light = worst.err > 0 ? under(worst.node.right) : under(worst.node.left);

    // try to swap something on the heavy side for something they believe is
    // lighter, or something on the light side for something heavier
    let best = null, bestBelief = Infinity;
    for (const side of [{ ids: heavy, want: -1 }, { ids: light, want: +1 }]) {
      for (const id of side.ids) {
        const hi = b.hooks.indexOf(id);
        const cur = assign[hi];
        for (let i = 0; i < b.shapes.length; i++) {
          if (assign.includes(i)) continue;
          if (side.want < 0 && !(seen[i] < seen[cur])) continue;
          if (side.want > 0 && !(seen[i] > seen[cur])) continue;
          // how wrong they BELIEVE the result will be
          const t = assign.slice(); t[hi] = i;
          const bat = {}; b.hooks.forEach((h, k) => { bat[h] = t[k] == null ? 0 : seen[t[k]]; });
          const belief = M.totalError(b.tree, bat);
          if (belief < bestBelief) { bestBelief = belief; best = t; }
        }
      }
    }
    if (!best) {
      // nothing looks like an improvement; try any exchange they cannot rule out
      const a = (rnd() * n) | 0, c = (rnd() * n) | 0;
      if (a === c) return { won: false, attempts, stuck: true };
      best = assign.slice(); [best[a], best[c]] = [best[c], best[a]];
    }
    assign = best; attempts++;
  }
  return { won: solved(b, assign), attempts };
}

const PEOPLE = {
  careless: { noise: 0.22, patience: 6 },
  careful:  { noise: 0.11, patience: 60 },
  precise:  { noise: 0.03, patience: 60 },
};

console.log('MOBILE — does care succeed where carelessness fails?\n');
console.log('  hooks | careless | careful | precise | adjustments a careful player makes');
console.log('  ' + '-'.repeat(74));

M.configure({ SLACK: 0, COLLIDE: false });
for (const [lo, hi, label] of [[4, 12, 'small'], [16, 28, 'medium'], [32, 48, 'large']]) {
  const rnd = mulberry(2024 + lo);
  const boards = [];
  for (let n = 0; n < 60 && boards.length < 40; n++) {
    const b = M.generate(lo + (n % Math.max(1, hi - lo)), rnd);
    if (b) boards.push(b);
  }
  if (!boards.length) continue;
  const wins = { careless: 0, careful: 0, precise: 0 };
  const effort = [];
  for (const b of boards) {
    for (const who in PEOPLE) {
      // three goes each, because a person retries
      let won = false, tries = [];
      for (let g = 0; g < 3 && !won; g++) {
        const r = play(b, { ...PEOPLE[who], rnd });
        won = r.won; tries.push(r.attempts);
      }
      if (won) wins[who]++;
      if (who === 'careful' && won) effort.push(tries.reduce((a, x) => a + x, 0));
    }
  }
  const h = med(boards.map(b => b.hooks.length));
  console.log('  ' + String(h).padStart(5) + (pct(wins.careless, boards.length)).padStart(11)
    + (pct(wins.careful, boards.length)).padStart(10) + (pct(wins.precise, boards.length)).padStart(10)
    + ('median ' + med(effort)).padStart(24));
}

console.log('\nREAD IT LIKE THIS');
console.log('  careless high            -> no craft in it, anyone succeeds');
console.log('  careful low              -> not satisfying, just fiddly');
console.log('  careful >> careless      -> the game rewards attention, which is the point');
