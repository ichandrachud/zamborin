/* WIRE — the second model: birds that will not sit next to each other.

   The first model failed its gate twice. Birds took exactly their own width, so
   a span cared only how much wire was spoken for, and best-fit walked 69-92% of
   boards. Giving birds personal space added real waste and moved it from 0% to
   13%. Eighteen swept settings never passed 10%.

   The floor under both failures was the same: where a bird sat inside a span
   carried no information. Birds budge freely, so a span was fully described by
   a number, the budge was decoration, and a wrong choice was almost never
   fatal.

   THIS MODEL PUTS POSITION BACK. Some kinds of bird will not perch beside
   others. Now a span is an ordered line, not a total, and three things change:

     - a placement can be illegal for reasons that have nothing to do with room
     - a third kind sitting BETWEEN two enemies is a resource, and buffering is
       a move you can plan
     - the shuffle after every drop is what rearranges who is next to whom,
       which is the thing the pitch always promised and the first model never
       delivered

   Whether any of that survives contact with a greedy player is what
   wire/measure2.js is for. Nothing here is drawn.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WIRE_MODEL_2 = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const CFG = {
  SPECIES: 4,      // how many kinds of bird
  FEUDS: null,     // pairs at war; null lets it grow with the level
  GAP: 0,          // personal space between unlike birds; 0 turns it off
  SPANS: null, BIRDS: null,   // overrides, for sweeping
};
function configure(o) { Object.assign(CFG, o); return CFG; }

const feudKey = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
const atWar = (b, x, y) => b.feuds.has(feudKey(x, y));

// A board is { spans: [capacity...], queue: [{w,sp}...], feuds: Set }.
// Play state is one ordered list of birds per span. The order is the point.
const fresh = (b) => b.spans.map(() => []);

function cost(list) {
  let c = 0;
  for (let i = 0; i < list.length; i++) {
    c += list[i].w;
    if (i > 0 && CFG.GAP && list[i].sp !== list[i - 1].sp) c += CFG.GAP;
  }
  return c;
}

// Insert bird into span `list` at slot p (0..list.length). Legal when it fits
// and lands next to nobody it is at war with.
function canInsert(b, list, p, bird, cap) {
  const left = p > 0 ? list[p - 1] : null;
  const right = p < list.length ? list[p] : null;
  if (left && atWar(b, left.sp, bird.sp)) return false;
  if (right && atWar(b, right.sp, bird.sp)) return false;
  const next = list.slice(0, p).concat([bird], list.slice(p));
  return cost(next) <= cap;
}

function insert(state, s, p, bird) {
  const out = state.map(l => l.slice());
  out[s].splice(p, 0, bird);
  return out;
}

// Every legal landing, as {s, p}.
function moves(b, state, k) {
  const bird = b.queue[k], out = [];
  for (let s = 0; s < state.length; s++)
    for (let p = 0; p <= state[s].length; p++)
      if (canInsert(b, state[s], p, bird, b.spans[s])) out.push({ s, p });
  return out;
}

const won = (b, k) => k >= b.queue.length;
// A wire has no preferred direction, so a span and its mirror are the same
// board. Folding them together keeps the search honest about repeats.
const spanKey = (l) => {
  const f = l.map(x => x.sp + '.' + x.w).join('-');
  const r = l.slice().reverse().map(x => x.sp + '.' + x.w).join('-');
  return f < r ? f : r;
};
const keyOf = (state, k) => k + '|' + state.map(spanKey).join('/');

// ---- solving ----
function solve(b, wantAll = false, limit = 400) {
  const seen = new Set();
  const found = [];
  let nodes = 0, deadEnds = 0;
  (function walk(state, k, path) {
    if (found.length >= limit) return true;
    if (won(b, k)) { found.push(path.slice()); return !wantAll; }
    const key = keyOf(state, k);
    if (seen.has(key)) return false;
    seen.add(key);
    const ms = moves(b, state, k);
    if (!ms.length) { deadEnds++; return false; }
    for (const m of ms) {
      nodes++;
      path.push(m);
      const stop = walk(insert(state, m.s, m.p, b.queue[k]), k + 1, path);
      path.pop();
      if (stop) return true;
    }
    return false;
  })(fresh(b), 0, []);
  return { solvable: found.length > 0, solutions: found, nodes, deadEnds };
}

// ---- the greedy test ----
// Six ways to play without thinking, including three that know about the feuds.
// A board only counts as demanding if it defeats every one of them.
const room = (b, state, s) => b.spans[s] - cost(state[s]);
const HEURISTICS = {
  first:    (b, st, ms) => ms[0],
  best:     (b, st, ms) => ms.reduce((a, m) => room(b, st, m.s) < room(b, st, a.s) ? m : a, ms[0]),
  worst:    (b, st, ms) => ms.reduce((a, m) => room(b, st, m.s) > room(b, st, a.s) ? m : a, ms[0]),
  // sit at the end of a line rather than squeezing into the middle
  edges:    (b, st, ms) => ms.find(m => m.p === 0 || m.p === st[m.s].length) || ms[0],
  // sit next to your own kind
  friends:  (b, st, ms, bird) => {
    const kin = ms.filter(m => {
      const l = st[m.s];
      return (m.p > 0 && l[m.p - 1].sp === bird.sp) || (m.p < l.length && l[m.p].sp === bird.sp);
    });
    return (kin.length ? kin : ms)[0];
  },
  // keep the line as mixed as possible, on the theory that buffers help later
  spread:   (b, st, ms) => ms.reduce((a, m) => st[m.s].length < st[a.s].length ? m : a, ms[0]),
};

function greedy(b, how) {
  const pick = HEURISTICS[how];
  let state = fresh(b);
  for (let k = 0; k < b.queue.length; k++) {
    const ms = moves(b, state, k);
    if (!ms.length) return { won: false, landed: k };
    const m = pick(b, state, ms, b.queue[k]);
    state = insert(state, m.s, m.p, b.queue[k]);
  }
  return { won: true, landed: b.queue.length };
}

function anyGreedyWins(b) {
  for (const how of Object.keys(HEURISTICS)) if (greedy(b, how).won) return how;
  return null;
}

// ---- generation ----
// Build a wire that is already settled and legal, read off what each span needs,
// then hand the birds over in a shuffled order. Same shape as Socket and Bloom:
// the answer exists by construction, and the only open question is how hard the
// arriving order makes it to find.
function generate(level, rnd = Math.random) {
  // Swept: 4 kinds over 4 spans beat 3 spans at every feud count, and the feud
  // count is the real difficulty dial — it took the gate from 20% to 75% while
  // best-fit fell from 53% to 5%. Board size barely mattered by comparison.
  const nSpans = CFG.SPANS || Math.min(4, 2 + Math.floor((level - 1) / 10));
  const nBirds = CFG.BIRDS || Math.min(11, 4 + Math.floor((level - 1) / 4));
  const kinds = Math.min(CFG.SPECIES, 3 + Math.floor((level - 1) / 14));
  const nFeuds = CFG.FEUDS || Math.min(5, 1 + Math.floor((level - 1) / 8));
  const slack = Math.max(0, 2 - Math.floor((level - 1) / 12));

  for (let attempt = 0; attempt < 800; attempt++) {
    // pick which kinds are at war
    const pairs = [];
    for (let a = 0; a < kinds; a++) for (let c = a + 1; c < kinds; c++) pairs.push([a, c]);
    for (let i = pairs.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [pairs[i], pairs[j]] = [pairs[j], pairs[i]]; }
    const feuds = new Set(pairs.slice(0, Math.min(nFeuds, pairs.length)).map(([a, c]) => feudKey(a, c)));
    const b0 = { feuds };

    // lay a legal wire out by hand
    const bins = Array.from({ length: nSpans }, () => []);
    const queue = [];
    let ok = true;
    for (let i = 0; i < nBirds; i++) {
      const bird = { w: 1 + ((rnd() * 3) | 0), sp: (rnd() * kinds) | 0 };
      // try spans and slots in a random order until one is peaceful
      const spots = [];
      for (let s = 0; s < nSpans; s++) for (let p = 0; p <= bins[s].length; p++) spots.push({ s, p });
      for (let j = spots.length - 1; j > 0; j--) { const t = (rnd() * (j + 1)) | 0; [spots[j], spots[t]] = [spots[t], spots[j]]; }
      const spot = spots.find(({ s, p }) => {
        const left = p > 0 ? bins[s][p - 1] : null, right = p < bins[s].length ? bins[s][p] : null;
        return !(left && atWar(b0, left.sp, bird.sp)) && !(right && atWar(b0, right.sp, bird.sp));
      });
      if (!spot) { ok = false; break; }
      bins[spot.s].splice(spot.p, 0, bird);
      queue.push(bird);
    }
    if (!ok || bins.some(x => !x.length)) continue;

    const spans = bins.map(cost);
    for (let i = 0; i < slack; i++) spans[(rnd() * nSpans) | 0] += 1;

    for (let i = queue.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [queue[i], queue[j]] = [queue[j], queue[i]]; }

    const b = { spans, queue, feuds, level, slack, kinds, nFeuds };
    const s = solve(b, true, 400);
    if (!s.solvable) continue;
    if (!s.deadEnds) continue;       // a board that never punishes is not a board
    b.solutions = s.solutions.length; b.nodes = s.nodes; b.deadEnds = s.deadEnds;
    return b;
  }
  return null;
}

return { CFG, configure, feudKey, atWar, fresh, cost, canInsert, insert, moves,
         won, solve, greedy, anyGreedyWins, HEURISTICS, room, generate };
}));
