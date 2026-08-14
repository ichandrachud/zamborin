/* MOBILE — a Calder balancing puzzle, headless.

   A tree of rods. Each rod hangs from a fixed pivot with a fixed length either
   side, and from each end hangs either another rod or an empty hook. You have a
   tray of shapes; the area of a shape is its weight. Drag a shape onto a hook to
   hang it, double click to take it off. Balance the whole sculpture.

   A rod balances when   weight(left) x length(left) = weight(right) x length(right)
   and the weight hanging from an end is everything below it. The pivots never
   move, so every rod is a fixed ratio the player has to hit with the pieces they
   are given.

   WHY THIS ONE IS WORTH MEASURING, AND WHAT COULD KILL IT.

   It passes the legibility rule by construction: area is weight, so the pieces
   carry the rule in their material, and an unbalanced rod DROOPS on its heavy
   side, which is the sculpture drawing its own error, continuously — the same
   trick as the animals pacing in Bunny.

   That is also the danger. If the tilt tells you which way you are wrong, a
   player might never think at all: hang anything, look at the droop, swap for
   something lighter, repeat. This file exists to find out whether that works,
   because if it does the game is a slot machine with good manners.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MOBILE_MODEL = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; };

// A node is either { hook: true, id } or { L, R, left, right }.
const isHook = (n) => !!n.hook;

function hooks(node, out = []) {
  if (isHook(node)) out.push(node);
  else { hooks(node.left, out); hooks(node.right, out); }
  return out;
}

// What hangs below a node, given an assignment of weights to hook ids.
function weightOf(node, at) {
  if (isHook(node)) return at[node.id] || 0;
  return weightOf(node.left, at) + weightOf(node.right, at);
}

// Every rod's torque error. Zero everywhere means the sculpture hangs level.
function errors(node, at, out = []) {
  if (isHook(node)) return out;
  const wl = weightOf(node.left, at), wr = weightOf(node.right, at);
  out.push({ node, err: wl * node.L - wr * node.R, wl, wr });
  errors(node.left, at, out);
  errors(node.right, at, out);
  return out;
}
const totalError = (node, at) => errors(node, at).reduce((s, e) => s + Math.abs(e.err), 0);
const balanced = (node, at) => hooks(node).every(h => at[h.id] != null) && totalError(node, at) === 0;

// How far a rod visibly droops, which is the only feedback the player gets.
// Normalised so a rod that is twice as wrong as another looks twice as wrong.
function tilts(node, at) {
  return errors(node, at).map(e => {
    const scale = Math.max(1, Math.abs(e.wl * node.L) + Math.abs(e.wr * node.R));
    return { err: e.err, tilt: Math.max(-1, Math.min(1, e.err / scale)) };
  });
}

// ---- what the sculpture demands ----
// Bottom up: at each rod, the two sides must be in the inverse ratio of their
// lengths, so the minimal whole-number weights are forced. Returns the minimal
// total weight of a subtree and fills `need` with the weight each hook wants.
function demand(node, need, mult = 1) {
  if (isHook(node)) { need[node.id] = mult; return mult; }
  const a = demand(node.left, need, 1);
  const b = demand(node.right, need, 1);
  // want  wa * L = wb * R, with wa a multiple of a and wb a multiple of b
  const x = a * node.L, y = b * node.R;
  const g = gcd(x, y);
  const ka = y / g, kb = x / g;
  scale(node.left, need, ka * mult);
  scale(node.right, need, kb * mult);
  return (a * ka + b * kb) * mult;
}
function scale(node, need, k) {
  if (isHook(node)) { need[node.id] *= k; return; }
  scale(node.left, need, k); scale(node.right, need, k);
}

// ---- solving ----
// The balance conditions are linear and a tree with n hooks has n-1 rods, so
// they pin the weights down to a single direction: EVERY way of balancing a
// given sculpture is a scalar multiple of one weight vector. So there is
// nothing to search. `demand` gives the smallest whole-number vector and the
// only question left is which multiples of it the tray can actually supply.
//
// The first version of this enumerated assignments of shapes to hooks, which
// for ten hooks and fourteen shapes is about 3.6 billion of them.
function solutionScales(node, shapes, maxK = 8) {
  const need = {};
  demand(node, need);
  const hs = hooks(node);
  let g = 0;
  for (const h of hs) g = gcd(g, need[h.id]);
  if (g > 1) for (const h of hs) need[h.id] /= g;

  const out = [];
  for (let k = 1; k <= maxK; k++) {
    const pool = shapes.slice();
    let ok = true;
    for (const h of hs) {
      const i = pool.indexOf(need[h.id] * k);
      if (i < 0) { ok = false; break; }
      pool.splice(i, 1);
    }
    if (ok) out.push(k);
  }
  return { scales: out, need };
}

// The assignments themselves, for a board small enough to want them.
function solutions(node, shapes, limit = 200) {
  const { scales, need } = solutionScales(node, shapes);
  const hs = hooks(node);
  const found = [];
  for (const k of scales) {
    const at = {};
    for (const h of hs) at[h.id] = need[h.id] * k;
    found.push(at);
    if (found.length >= limit) break;
  }
  return found;
}

// ---- generation ----
function buildTree(depth, rnd, ids = { n: 0 }) {
  if (depth <= 0 || (depth < 3 && rnd() < 0.28)) return { hook: true, id: 'h' + (ids.n++) };
  const lens = [1, 2, 3, 4, 5];
  let L = lens[(rnd() * lens.length) | 0], R = lens[(rnd() * lens.length) | 0];
  return { L, R, left: buildTree(depth - 1, rnd, ids), right: buildTree(depth - 1, rnd, ids) };
}

function generate(level, rnd = Math.random, opts = {}) {
  const depth = opts.depth || Math.min(4, 2 + Math.floor((level - 1) / 12));
  const spare = opts.spare != null ? opts.spare : Math.min(4, Math.floor((level - 1) / 6));
  for (let attempt = 0; attempt < 400; attempt++) {
    const tree = buildTree(depth, rnd);
    const hs = hooks(tree);
    if (hs.length < 3 || hs.length > 10) continue;
    const need = {};
    const total = demand(tree, need);
    const want = hs.map(h => need[h.id]);
    // keep the weights in a range a person could plausibly compare by eye
    if (Math.max(...want) > 60 || Math.max(...want) / Math.min(...want) > 12) continue;

    // the pieces you are given: exactly what is needed, plus decoys that are
    // close enough in size to be tempting
    const shapes = want.slice();
    for (let n = 0; n < spare; n++) {
      const base = want[(rnd() * want.length) | 0];
      const jitter = 1 + ((rnd() * 3) | 0) * (rnd() < 0.5 ? -1 : 1);
      shapes.push(Math.max(1, base + jitter));
    }
    for (let i = shapes.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [shapes[i], shapes[j]] = [shapes[j], shapes[i]]; }

    const { scales } = solutionScales(tree, shapes);
    if (!scales.length) continue;
    return { tree, shapes, hooks: hs.map(h => h.id), need, total, level,
             solutions: scales.length, depth, spare };
  }
  return null;
}

return { isHook, hooks, weightOf, errors, totalError, balanced, tilts,
         demand, solutions, solutionScales, buildTree, generate, gcd };
}));
