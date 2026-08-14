/* MOBILE — the decisive experiment.

   Two facts, each of which sinks the game on its own:

     With the pivots fixed, the balance equations leave exactly ONE weight
     vector, so there is nothing to choose and the tilt walks you to it.

     Adding "pieces must not foul each other" does not help, because a single
     answer can only be permitted or forbidden. It never becomes a choice. The
     unique answer usually collides, so boards just become unsolvable.

   THE SYNTHESIS THIS FILE TESTS. Let the player nudge each pivot a little AND
   forbid fouling. Now:

     - pivot freedom turns the one answer into a SPACE of answers (n-1 equations
       against 2n-1 unknowns)
     - fouling carves that space down, and it is a constraint the tilt says
       nothing about
     - and the two interact: nudging a pivot to fix a rod physically MOVES the
       sub-mobile hanging from it, which can push it into its neighbour

   So the question is whether a player following the droop still wins, or
   whether they have to reason about where things end up.

   Run:  node mobile/experiment.js
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

// What the player would slide each pivot to, to take out as much of that rod's
// error as the slack allows. This is what a person does without thinking, and
// it is also what physically happens to the sculpture.
function shiftsFor(tree, at) {
  const shift = {};
  (function walk(node) {
    if (M.isHook(node)) return;
    const wl = M.weightOf(node.left, at), wr = M.weightOf(node.right, at);
    if (wl + wr > 0) {
      const want = (wr * node.R - wl * node.L) / (wl + wr);
      shift[node.id] = Math.max(-M.CFG.SLACK, Math.min(M.CFG.SLACK, want));
    }
    walk(node.left); walk(node.right);
  })(tree);
  return shift;
}

const weightsOf = (b, assign) => {
  const at = {};
  b.hooks.forEach((h, i) => { at[h] = assign[i] == null ? 0 : b.shapes[assign[i]]; });
  return at;
};

function isLegal(b, assign) {
  if (assign.some(x => x == null)) return false;
  const at = weightsOf(b, assign);
  if (M.totalError(b.tree, at) !== 0) return false;
  if (!M.CFG.COLLIDE) return true;
  return M.collisions(b.tree, at, shiftsFor(b.tree, at)) === 0;
}

// Every arrangement, for boards small enough to afford it.
function allLegal(b, cap = 400) {
  const n = b.hooks.length, out = [];
  const used = new Array(b.shapes.length).fill(false), cur = new Array(n).fill(null);
  (function place(k) {
    if (out.length >= cap) return true;
    if (k === n) { if (isLegal(b, cur)) out.push(cur.slice()); return false; }
    const seen = new Set();
    for (let i = 0; i < b.shapes.length; i++) {
      if (used[i] || seen.has(b.shapes[i])) continue;
      seen.add(b.shapes[i]);
      used[i] = true; cur[k] = i;
      if (place(k + 1)) return true;
      used[i] = false; cur[k] = null;
    }
    return false;
  })(0);
  return out;
}

// The thoughtless player, given every scrap of feedback: total tilt, plus a
// penalty for fouling, which they can also see.
function score(b, assign) {
  const empty = assign.filter(x => x == null).length;
  const at = weightsOf(b, assign);
  const err = M.totalError(b.tree, at);
  const foul = M.CFG.COLLIDE ? M.collisions(b.tree, at, shiftsFor(b.tree, at)) : 0;
  return empty * 1e6 + foul * 1e3 + err;
}
function climb(b, start, budget = 200) {
  let cur = start.slice();
  for (let n = 0; n < budget; n++) {
    if (isLegal(b, cur)) return { won: true, n };
    let best = null, bestS = score(b, cur);
    for (let k = 0; k < cur.length; k++) {
      for (let i = 0; i < b.shapes.length; i++) {
        if (cur.includes(i) && cur[k] !== i) continue;
        if (cur[k] === i) continue;
        const t = cur.slice(); t[k] = i;
        const s = score(b, t);
        if (s < bestS) { bestS = s; best = t; }
      }
      for (let j = k + 1; j < cur.length; j++) {
        const t = cur.slice(); [t[k], t[j]] = [t[j], t[k]];
        const s = score(b, t);
        if (s < bestS) { bestS = s; best = t; }
      }
    }
    if (!best) return { won: isLegal(b, cur), n, stuck: true };
    cur = best;
  }
  return { won: isLegal(b, cur), n: budget };
}

function trial(slack, collide, boards = 40) {
  M.configure({ SLACK: slack, COLLIDE: collide });
  const rnd = mulberry(77);
  let made = 0, solvable = 0, demanding = 0, stuck = 0;
  const legalCounts = [];
  for (let n = 0; n < boards * 6 && made < boards; n++) {
    const b = M.generate(8 + (n % 20), rnd, { depth: 3, spare: 2 });
    if (!b || b.hooks.length < 4 || b.hooks.length > 6) continue;
    made++;
    const legals = allLegal(b);
    if (!legals.length) continue;             // no answer at all: not a board
    solvable++;
    legalCounts.push(legals.length);
    // three starts, so a player who restarts is represented too
    const starts = [
      b.hooks.map((_, i) => i),
      b.hooks.map((_, i) => b.shapes.length - 1 - i),
      b.hooks.map((_, i) => (i * 3) % b.shapes.length),
    ];
    const results = starts.map(s => climb(b, s));
    if (!results.some(r => r.won)) demanding++;
    if (results.every(r => r.stuck)) stuck++;
  }
  return { made, solvable, demanding, stuck, legals: mean(legalCounts) };
}

console.log('MOBILE — does pivot freedom plus fouling make a puzzle?\n');
console.log('  slack  foul | boards  solvable | answers | BEATS THE DROOP-FOLLOWER');
console.log('  ' + '-'.repeat(70));
for (const collide of [false, true])
  for (const slack of [0, 0.2, 0.4]) {
    const r = trial(slack, collide);
    console.log('  ' + String(slack).padStart(5) + String(collide ? 'yes' : 'no').padStart(6)
      + ' |' + String(r.made).padStart(7) + String(r.solvable).padStart(10)
      + ' |' + (isNaN(r.legals) ? '   -' : r.legals.toFixed(1).padStart(8))
      + ' |' + (pct(r.demanding, r.solvable)).padStart(12));
  }
console.log('\nREAD IT LIKE THIS');
console.log('  solvable collapses -> fouling just forbids the one answer, no game');
console.log('  answers > 1 and beats-the-follower high -> a real space to search');
