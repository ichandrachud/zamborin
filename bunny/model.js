/* BUNNY — a reconstruction of the user's lost iPhone game, headless.

   Working folder name only. The game is theirs and so is the naming.

   THE RULES, as described:

     Studded LEGO bricks slide one cell at a time into open space. Solid themed
     objects (a masonry wall, an iceberg, a traffic cone) never move. Bare
     baseplate is open space, and everything alive stands on it.

     The rabbit walks the whole region of open cells it can reach, pacing back
     and forth. So does every predator. That pacing is not decoration: it is the
     connectivity of the board, drawing itself, continuously.

     Reach the carrot: the carrot is in the rabbit's region.
     Die: a predator is in the rabbit's region.

     One flood fill decides both. Opening a path is the only verb, and it is
     simultaneously how you win and how you lose.

     A bomb sits on a brick. Slide that brick and it is destroyed rather than
     moved, turning an obstacle into open cells. That is the only resource.

   WHY THIS IS WORTH MEASURING. Two games built today passed a difficulty gate
   and were rejected as unreadable. This one is readable by construction — you
   can tell what moves from the studs, and the animals show you what is
   connected by walking it. The open question is the other half: is it hard?
   Sliding-block puzzles are PSPACE-complete in general, but that says nothing
   about whether a phone-sized board asks anything of anybody.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BUNNY_MODEL = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];   // up down left right

// A board is
//   { W, H,
//     bricks: [{ id, cells:[idx], bomb:bool }],   // slide one cell at a time
//     fixed:  Set(idx),                            // never move
//     rabbit: idx, carrot: idx, foxes: [idx] }
// Everything alive stands on open baseplate.

const clone = (b) => ({
  W: b.W, H: b.H,
  bricks: b.bricks.map(k => ({ id: k.id, cells: k.cells.slice(), bomb: k.bomb })),
  fixed: new Set(b.fixed),
  rabbit: b.rabbit, carrot: b.carrot, foxes: b.foxes.slice(),
});

// Which cells are solid. Entities do NOT block walking; they stand in the open.
function solidSet(b) {
  const s = new Set(b.fixed);
  for (const k of b.bricks) for (const c of k.cells) s.add(c);
  return s;
}

// The region the rabbit can walk: open cells joined edge to edge. This single
// function is the whole game.
function region(b, from, solid) {
  solid = solid || solidSet(b);
  const seen = new Set(), stack = [from];
  if (solid.has(from)) return seen;
  while (stack.length) {
    const i = stack.pop();
    if (seen.has(i)) continue;
    seen.add(i);
    const c = i % b.W, r = (i / b.W) | 0;
    for (const [dc, dr] of DIRS) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || cc >= b.W || rr < 0 || rr >= b.H) continue;
      const j = rr * b.W + cc;
      if (!solid.has(j) && !seen.has(j)) stack.push(j);
    }
  }
  return seen;
}


// ---- the hot path ----
// region() below returns a Set, which is the pleasant interface and far too
// slow to call inside generation: it is invoked once per candidate move of
// every rejected board. These do the same flood fill over typed arrays and are
// what generation and status actually use.
let _solid = null, _seen = null, _stack = null, _cap = 0;
function ensure(n) {
  if (_cap >= n) return;
  _cap = n; _solid = new Uint8Array(n); _seen = new Uint8Array(n); _stack = new Int32Array(n);
}
function solidMask(b) {
  const n = b.W * b.H;
  ensure(n);
  _solid.fill(0, 0, n);
  for (const c of b.fixed) _solid[c] = 1;
  for (const k of b.bricks) for (const c of k.cells) _solid[c] = 1;
  return _solid;
}
// Flood from `from`, marking _seen. Returns how many cells were reached.
function fill(b, from, solid) {
  const n = b.W * b.H, W = b.W;
  _seen.fill(0, 0, n);
  if (solid[from]) return 0;
  let top = 0, count = 0;
  _stack[top++] = from; _seen[from] = 1;
  while (top) {
    const i = _stack[--top]; count++;
    const c = i % W, r = (i / W) | 0;
    if (r > 0)        { const j = i - W; if (!solid[j] && !_seen[j]) { _seen[j] = 1; _stack[top++] = j; } }
    if (r < b.H - 1)  { const j = i + W; if (!solid[j] && !_seen[j]) { _seen[j] = 1; _stack[top++] = j; } }
    if (c > 0)        { const j = i - 1; if (!solid[j] && !_seen[j]) { _seen[j] = 1; _stack[top++] = j; } }
    if (c < W - 1)    { const j = i + 1; if (!solid[j] && !_seen[j]) { _seen[j] = 1; _stack[top++] = j; } }
  }
  return count;
}
function statusFast(b) {
  fill(b, b.rabbit, solidMask(b));
  for (const f of b.foxes) if (_seen[f]) return 'dead';
  return _seen[b.carrot] ? 'won' : 'open';
}

// Dead beats won: if opening the way to the carrot also lets a fox in, the
// rabbit does not get to eat first.
const status = (b) => statusFast(b);

// A brick may slide one cell if every cell it would newly cover is open and
// nothing is standing there. Bricks do not crush anybody.
function canSlide(b, ki, dc, dr, solid) {
  const k = b.bricks[ki];
  const own = new Set(k.cells);
  const standing = new Set([b.rabbit, b.carrot, ...b.foxes]);
  for (const cell of k.cells) {
    const c = cell % b.W + dc, r = ((cell / b.W) | 0) + dr;
    if (c < 0 || c >= b.W || r < 0 || r >= b.H) return false;
    const j = r * b.W + c;
    if (own.has(j)) continue;                  // sliding into itself is fine
    if (solid.has(j) || standing.has(j)) return false;
  }
  return true;
}

function moves(b) {
  const solid = solidSet(b), out = [];
  for (let ki = 0; ki < b.bricks.length; ki++)
    for (const [dc, dr] of DIRS)
      if (canSlide(b, ki, dc, dr, solid)) out.push({ ki, dc, dr });
  return out;
}

function apply(b, m) {
  const n = clone(b);
  const k = n.bricks[m.ki];
  // The bomb is the only resource on the board: move this brick and it is gone,
  // which is how a level gains open space rather than just rearranging it.
  if (k.bomb) n.bricks.splice(m.ki, 1);
  else k.cells = k.cells.map(cell => (((cell / b.W) | 0) + m.dr) * b.W + (cell % b.W + m.dc));
  return n;
}

// Bricks of the same shape are interchangeable, so key on the shape footprint
// rather than on which brick happens to be where.
function key(b) {
  return b.bricks.map(k => k.cells.slice().sort((x, y) => x - y).join('.') + (k.bomb ? 'B' : ''))
          .sort().join('/');
}

// ---- solving ----
// Breadth first, so the answer is the shortest one. Boards are small and an
// exact move count is what difficulty gets measured against.
function solve(b, maxStates = 200000, maxDepth = Infinity) {
  if (status(b) === 'won') return { moves: 0, path: [], states: 1, dead: 0 };
  const seen = new Set([key(b)]);
  let frontier = [{ b, path: [] }];
  let states = 1, dead = 0, depth = 0;
  while (frontier.length && states < maxStates && depth < maxDepth) {
    const next = [];
    depth++;
    for (const node of frontier) {
      for (const m of moves(node.b)) {
        const nb = apply(node.b, m);
        const k = key(nb);
        if (seen.has(k)) continue;
        seen.add(k); states++;
        const st = status(nb);
        if (st === 'dead') { dead++; continue; }         // a real losing move
        const path = node.path.concat([m]);
        if (st === 'won') return { moves: depth, path, states, dead };
        next.push({ b: nb, path });
      }
    }
    frontier = next;
  }
  return { moves: null, path: null, states, dead };
}

// How many of the moves available right now would kill the rabbit outright?
// This is the number that says whether the predator is doing any work.
function fatalShare(b) {
  const ms = moves(b);
  if (!ms.length) return 0;
  let fatal = 0;
  for (const m of ms) if (status(apply(b, m)) === 'dead') fatal++;
  return fatal / ms.length;
}


// ---- generation ----
// Tile the board with bricks, punch holes, then drop the rabbit, the carrot and
// the foxes into DIFFERENT regions so the board starts with everything sealed
// apart. Difficulty then comes from how the regions have to be joined.
const SHAPES = [[1,1],[2,1],[1,2],[2,2],[3,1],[1,3]];

function generate(level, rnd = Math.random, opts = {}) {
  const W = opts.W || Math.min(7, 5 + Math.floor((level - 1) / 20));
  const H = opts.H || Math.min(8, 6 + Math.floor((level - 1) / 15));
  const holes = opts.holes || Math.max(5, Math.round(W * H * 0.22));
  const nFoxes = opts.foxes != null ? opts.foxes : Math.min(2, 1 + Math.floor((level - 1) / 25));
  const nFixed = opts.fixed != null ? opts.fixed : Math.min(4, 1 + Math.floor((level - 1) / 12));
  // Par is capped at 7, not 9. Measured, par 6 boards already defeat every
  // unplanned player 92-100% of the time, so difficulty saturates well before
  // the depth that starves the generator. Chasing par 9 cost most of the yield
  // and bought nothing. Late difficulty comes from board size and a second fox.
  const wantMin = opts.minMoves || Math.min(7, 2 + Math.floor((level - 1) / 7));

  for (let attempt = 0; attempt < 600; attempt++) {
    const owner = new Array(W * H).fill(-1);
    const bricks = [];
    const order = [];
    for (let i = 0; i < W * H; i++) order.push(i);
    for (let i = order.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
    for (const i of order) {
      if (owner[i] >= 0) continue;
      const c0 = i % W, r0 = (i / W) | 0;
      const shuffled = SHAPES.slice().sort(() => rnd() - 0.5);
      let placed = false;
      for (const [sw, sh] of shuffled) {
        if (c0 + sw > W || r0 + sh > H) continue;
        const cells = [];
        let ok = true;
        for (let dr = 0; dr < sh && ok; dr++)
          for (let dc = 0; dc < sw; dc++) {
            const j = (r0 + dr) * W + (c0 + dc);
            if (owner[j] >= 0) { ok = false; break; }
            cells.push(j);
          }
        if (!ok) continue;
        const id = bricks.length;
        cells.forEach(j => owner[j] = id);
        bricks.push({ id, cells, bomb: false });
        placed = true; break;
      }
      if (!placed) { const id = bricks.length; owner[i] = id; bricks.push({ id, cells: [i], bomb: false }); }
    }

    // punch holes by deleting whole bricks, which is what makes open space
    // Prefer to remove SMALL bricks. Deleting big ones carves one wide-open
    // blob and the board comes back as a single region, which was the other
    // thing starving the generator; scattered single-cell holes fragment the
    // board into the several regions this game is entirely about.
    const dropped = new Set();
    let open = 0;
    const byId = bricks.slice()
      .map(k => ({ k, w: k.cells.length * 0.15 + rnd() * 1.6 }))
      .sort((a, z) => a.w - z.w)
      .map(x => x.k);
    for (const k of byId) {
      if (open >= holes) break;
      dropped.add(k.id); open += k.cells.length;
    }
    let kept = bricks.filter(k => !dropped.has(k.id));
    const openCells = [];
    for (let i = 0; i < W * H; i++) if (dropped.has(owner[i])) openCells.push(i);
    if (openCells.length < 5) continue;

    // a few immovable obstacles, taken from the open cells so they cut regions
    const fixed = new Set();
    for (let n = 0; n < nFixed && openCells.length > 6; n++) {
      const pick = (rnd() * openCells.length) | 0;
      fixed.add(openCells[pick]); openCells.splice(pick, 1);
    }

    // one brick gets the bomb
    if (kept.length) kept[(rnd() * kept.length) | 0].bomb = true;

    const b = { W, H, bricks: kept.map(k => ({ id: k.id, cells: k.cells.slice(), bomb: k.bomb })),
                fixed, rabbit: -1, carrot: -1, foxes: [] };

    // group the open cells into regions, and demand at least three of them so
    // rabbit, carrot and fox can start apart
    const solid = solidSet(b);
    const seen = new Set(), regions = [];
    for (const i of openCells) {
      if (seen.has(i) || solid.has(i)) continue;
      const reg = region(b, i, solid);
      reg.forEach(x => seen.add(x));
      regions.push([...reg]);
    }
    if (regions.length < 2 + nFoxes) continue;
    regions.sort((a, z) => z.length - a.length);
    const pickFrom = (reg) => reg[(rnd() * reg.length) | 0];

    // The rabbit goes in the roomiest region.
    b.rabbit = pickFrom(regions[0]);

    // Then the fox is PLACED where it is already dangerous, rather than dropped
    // at random and the board thrown away when it turns out not to be. Work out
    // which regions a single slide would join to the rabbit's, and put the fox
    // in one of those: now a wrong first move kills, by construction.
    //
    // Searching for this instead of building it was costing most of the yield —
    // late levels fell from 30 boards a band to 11.
    const mine = region(b, b.rabbit, solid);
    const oneSlideAway = new Set();
    for (const m of moves(b)) {
      const after = apply(b, m);
      fill(after, b.rabbit, solidMask(after));
      for (let ri = 0; ri < regions.length; ri++) {
        if (oneSlideAway.has(ri) || mine.has(regions[ri][0])) continue;
        for (const x of regions[ri]) if (_seen[x]) { oneSlideAway.add(ri); break; }
      }
    }
    // One hot region is enough. Demanding a SEPARATE one per fox was rejecting
    // 4,590 boards a run at level 60 and was the single biggest cause of the
    // generator drying up — two foxes can share a region perfectly well, they
    // are both still standing one slide from the rabbit.
    if (!oneSlideAway.size) continue;

    const hot = [...oneSlideAway];
    const taken = new Set();
    for (let n = 0; n < nFoxes; n++) {
      const reg = regions[hot[(rnd() * hot.length) | 0]];
      const free = reg.filter(x => !taken.has(x));
      if (!free.length) break;
      const cell = free[(rnd() * free.length) | 0];
      taken.add(cell); b.foxes.push(cell);
    }
    if (!b.foxes.length) continue;

    // The carrot goes somewhere that is NOT one slide away, or the level is over
    // before it starts.
    const cold = regions
      .map((reg, ri) => ri)
      .filter(ri => !oneSlideAway.has(ri) && !mine.has(regions[ri][0]));
    if (!cold.length) continue;
    b.carrot = pickFrom(regions[cold[(rnd() * cold.length) | 0]]);

    if (status(b) !== 'open') continue;

    // The fox has to be able to reach you or it is scenery. Measured on the
    // first generator, 0% of the slides available on a board were fatal across
    // every band, because the fox was sealed in a region nothing ever opened.
    // Demand at least one losing move on the board from the very first turn.
    if (fatalShare(b) <= 0) continue;

    const s = solve(b, 12000, wantMin + 3);
    if (s.moves == null || s.moves < wantMin) continue;

    // and demand the danger persists: somewhere along the shortest solution
    // there is still a slide that would kill, so it is a live threat the whole
    // way rather than a scare at the start
    let cur = b, live = 0;
    for (const m of s.path) { if (fatalShare(cur) > 0) live++; cur = apply(cur, m); }
    if (live < Math.max(2, Math.ceil(s.path.length * 0.4))) continue;

    return { ...b, level, par: s.moves, states: s.states, deadEnds: s.dead,
             fatalAtStart: fatalShare(b), liveTurns: live };
  }
  return null;
}

return { DIRS, SHAPES, clone, solidSet, solidMask, region, status, canSlide, moves, apply, key, solve, fatalShare, generate };
}));
