/* WIRE — the model, headless, gated before anything is drawn.

   Birds on a telephone wire. Some are already asleep and will not move for
   anybody; they cut the wire into spans. You are handed birds one at a time and
   you choose a span. The birds in that span budge along to make room. Land them
   all. Push one off the end and you have lost.

   WHAT THE FIRST VERSION GOT WRONG, AND HOW IT WAS FOUND. Version one had birds
   take exactly their own width, so a span only cared how much wire was spoken
   for and the game was plain bin packing. Measured, best-fit — one textbook
   rule, no lookahead — won 75-100% of boards, only 0-15% of boards defeated
   every unplanned strategy, and the share of opening moves that could actually
   lose you the level was 0%. Nothing you did early could hurt you.

   The diagnosis was sharper than the number. Socket is hard because a plug's
   body COVERS sockets it does not use: a piece denies space it is not sitting
   on, so options collide. A bird taking exactly its own width wastes nothing,
   and packing without waste is arithmetic, not a puzzle.

   So birds got the thing real birds have: personal space. A bird will huddle
   against its own kind and will not sit closer than a gap to a stranger. Now a
   mixed span costs wire that nobody is standing on, and the budge — birds
   shuffling after every drop so families end up together — is what you are
   watching that cost being paid.

   That also keeps the state small. Since birds budge freely, a span always
   settles into its cheapest arrangement, which is one block per species. So a
   span is fully described by the wire its birds occupy and which species are in
   it, and no ordering has to be searched.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WIRE_MODEL = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const CFG = {
  GAP: 1,        // wire left empty between two birds of different kinds
  SPECIES: 4,    // how many kinds of bird exist
  SPANS: null,   // override the span count, for sweeping
  BIRDS: null,   // override the bird count, for sweeping
};
function configure(o) { Object.assign(CFG, o); return CFG; }

// A board is { spans: [capacity...], queue: [{w, sp}...] }.
// Play state is one entry per span: wire used by bodies, and a bitmask of the
// species present. Cost = bodies + a gap for every join between blocks.
const fresh = (b) => b.spans.map(() => ({ used: 0, kinds: 0, n: 0 }));
const bits = (m) => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };
const cost = (st) => st.n === 0 ? 0 : st.used + CFG.GAP * (bits(st.kinds) - 1);

function after(st, bird) {
  return { used: st.used + bird.w, kinds: st.kinds | (1 << bird.sp), n: st.n + 1 };
}
const fits = (b, state, s, bird) => cost(after(state[s], bird)) <= b.spans[s];

function place(state, s, bird) {
  const out = state.map(x => ({ used: x.used, kinds: x.kinds, n: x.n }));
  out[s] = after(out[s], bird);
  return out;
}

const won = (b, k) => k >= b.queue.length;
const keyOf = (state, k) => k + '|' + state.map(x => x.used + ':' + x.kinds).join(',');

function moves(b, state, k) {
  const bird = b.queue[k], out = [];
  for (let s = 0; s < b.spans.length; s++) if (fits(b, state, s, bird)) out.push(s);
  return out;
}

// ---- solving ----
function solve(b, wantAll = false, limit = 20000) {
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
    for (const s of ms) {
      nodes++;
      path.push(s);
      const stop = walk(place(state, s, b.queue[k]), k + 1, path);
      path.pop();
      if (stop) return true;
    }
    return false;
  })(fresh(b), 0, []);
  return { solvable: found.length > 0, solutions: found, nodes, deadEnds };
}

// ---- the greedy test ----
// Five ways to play without thinking, including the two that know about the
// new rule. A board only counts as demanding if it defeats all of them.
const room = (b, state, s) => b.spans[s] - cost(state[s]);
const HEURISTICS = {
  first:    (b, st, ms) => ms[0],
  best:     (b, st, ms) => ms.reduce((a, s) => room(b, st, s) < room(b, st, a) ? s : a, ms[0]),
  worst:    (b, st, ms) => ms.reduce((a, s) => room(b, st, s) > room(b, st, a) ? s : a, ms[0]),
  emptiest: (b, st, ms) => ms.reduce((a, s) => cost(st[s]) < cost(st[a]) ? s : a, ms[0]),
  // the one a person plays: sit next to your own kind, and if you cannot,
  // take the roomiest span
  friends:  (b, st, ms, bird) => {
    const kin = ms.filter(s => st[s].kinds & (1 << bird.sp));
    const pool = kin.length ? kin : ms;
    return pool.reduce((a, s) => room(b, st, s) > room(b, st, a) ? s : a, pool[0]);
  },
};

function greedy(b, how) {
  const pick = HEURISTICS[how];
  let state = fresh(b);
  for (let k = 0; k < b.queue.length; k++) {
    const ms = moves(b, state, k);
    if (!ms.length) return { won: false, landed: k };
    state = place(state, pick(b, state, ms, b.queue[k]), b.queue[k]);
  }
  return { won: true, landed: b.queue.length };
}

function anyGreedyWins(b) {
  for (const how of Object.keys(HEURISTICS)) if (greedy(b, how).won) return how;
  return null;
}

// ---- generation ----
// Deal birds into spans, settle each span, and read off the capacity it needs.
// Then shuffle the queue, because the order birds arrive in is the one thing
// the player cannot control and is where the difficulty should live.
function generate(level, rnd = Math.random) {
  const nSpans = CFG.SPANS || Math.min(6, 2 + Math.floor((level - 1) / 7));
  const nBirds = CFG.BIRDS || Math.min(14, 4 + Math.floor((level - 1) / 3));
  const kinds = Math.min(CFG.SPECIES, 2 + Math.floor((level - 1) / 10));
  const slack = Math.max(0, 3 - Math.floor((level - 1) / 9));

  for (let attempt = 0; attempt < 700; attempt++) {
    const bins = Array.from({ length: nSpans }, () => []);
    const queue = [];
    for (let i = 0; i < nBirds; i++) {
      const bird = { w: 1 + ((rnd() * 3) | 0), sp: (rnd() * kinds) | 0 };
      bins[(rnd() * nSpans) | 0].push(bird);
      queue.push(bird);
    }
    if (bins.some(x => !x.length)) continue;

    const spans = bins.map(list => {
      let st = { used: 0, kinds: 0, n: 0 };
      for (const bird of list) st = after(st, bird);
      return cost(st);
    });
    for (let i = 0; i < slack; i++) spans[(rnd() * nSpans) | 0] += 1;

    for (let i = queue.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [queue[i], queue[j]] = [queue[j], queue[i]]; }

    const b = { spans, queue, level, slack, kinds };
    const s = solve(b, true, 400);
    if (!s.solvable) continue;
    if (!s.deadEnds) continue;      // a board that never punishes is not a board
    b.solutions = s.solutions.length; b.nodes = s.nodes; b.deadEnds = s.deadEnds;
    return b;
  }
  return null;
}

return { CFG, configure, fresh, cost, after, fits, place, won, moves, room,
         solve, greedy, anyGreedyWins, HEURISTICS, generate };
}));
