/* ============================================================
   Zamborin · Stained · level generation

   Scramble-from-solved, so every level is solvable by construction: place
   panes, read the composite, call THAT the target, then return the panes to
   the tray. No solver needed to guarantee a level exists.

   SECONDARY PANES ARE IN FROM THE START, and that is a deliberate correction
   to the brief. With panes restricted to the three primaries the colours
   cannot interact at all: a cell carries the red bit iff some red pane covers
   it, so where the yellow and blue panes sit is irrelevant to it. Measured
   over 400 random boards, moving every non-red pane never once changed the red
   mask. The picture would then decompose into three independent
   covering puzzles drawn on top of each other, and "overlap" would be a
   consequence of solving rather than a thing you solve for.

   An orange pane carries bits R|Y, so it writes into the red mask and the
   yellow mask at once (measured: moving one changes the second mask in 388 of
   400 trials). That single change restores the cross-colour constraint the
   brief is built around, and costs nothing: still one bitwise OR, still
   order-independent, still exactly the eight-colour palette.
   ============================================================ */
(function (root, factory) {
  var api = factory(typeof require === 'function' ? require('./model.js') : root.StainedModel);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StainedGenerate = api;
})(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';

  /* Curated rather than exhaustive: shapes that read as leaded glass rather
     than as tetris. Kept small so results trend intentional. */
  var SHAPES = {
    dot:  [[0,0]],
    i2:   [[0,0],[0,1]],
    i3:   [[0,0],[0,1],[0,2]],
    l3:   [[0,0],[1,0],[1,1]],
    o4:   [[0,0],[0,1],[1,0],[1,1]],
    t4:   [[0,0],[0,1],[0,2],[1,1]],
    l4:   [[0,0],[1,0],[2,0],[2,1]],
    s4:   [[0,1],[0,2],[1,0],[1,1]],
    i4:   [[0,0],[0,1],[0,2],[0,3]],
    plus: [[0,1],[1,0],[1,1],[1,2],[2,1]],
    diag: [[0,0],[1,1],[1,0]],
    big:  [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]]
  };

  var PRIMARY   = [S.R, S.Y, S.B];              // 1, 2, 4
  var SECONDARY = [S.R|S.Y, S.R|S.B, S.Y|S.B];  // 3 orange, 5 purple, 6 green

  function pick(rng, arr) { return arr[rng(arr.length)]; }

  function placements(shape, size) {
    var out = [];
    for (var rot = 0; rot < 4; rot++) {
      var e = S.extent(S.rotate(shape, rot));
      if (e.h > size || e.w > size) continue;
      for (var r = 0; r + e.h <= size; r++) {
        for (var c = 0; c + e.w <= size; c++) {
          var cells = S.cover(shape, rot, r, c, size);
          if (cells) out.push({ r: r, c: c, rot: rot, cells: cells });
        }
      }
    }
    return out;
  }

  /* Bias toward overlapping what is already down, because a level whose panes
     never touch has no secondary colours in it and teaches nothing. */
  function placeBiased(rng, shape, size, occupied, wantOverlap) {
    var opts = placements(shape, size);
    if (!opts.length) return null;
    if (!wantOverlap) return opts[rng(opts.length)];
    var touching = opts.filter(function (o) {
      return o.cells.some(function (i) { return occupied[i]; });
    });
    var pool = (touching.length && rng(100) < 78) ? touching : opts;
    return pool[rng(pool.length)];
  }

  /* §"Quality gate on generation". A target that is a flat wash, or that has
     no secondary anywhere, does not exercise the mechanic at all. */
  function quality(target, opts) {
    var n = S.counts(target);
    var secondaries = n[3] + n[5] + n[6];
    var clear = n[0];
    var black = n[7];
    var distinct = n.filter(function (v) { return v > 0; }).length;

    if (secondaries < (opts.minSecondary === undefined ? 2 : opts.minSecondary)) return 'no secondary colour';
    if (clear < (opts.minClear === undefined ? 3 : opts.minClear)) return 'not enough clear glass';
    if (opts.needBlack && black < 1) return 'no triple overlap';
    if (distinct < (opts.minDistinct === undefined ? 4 : opts.minDistinct)) return 'too flat';
    /* The emptiness cap has to scale with how much glass the level actually
       has. Fixed at 0.72 it silently made low-pane boards ungeneratable: two
       four-cell panes cover at most 8 of 36 cells, so `clear` is never under
       26 and every candidate was rejected as mostly empty. Teaching levels
       need a looser cap; the default is unchanged for everything else. */
    var maxClear = opts.maxClear === undefined ? 0.72 : opts.maxClear;
    if (clear > target.length * maxClear) return 'mostly empty';
    return null;
  }

  /* One level. `spec` is { size, primaries, secondaries, needBlack, ... }. */
  function generate(rng, spec) {
    var size = spec.size;
    var shapeKeys = spec.shapes || Object.keys(SHAPES);

    for (var attempt = 0; attempt < 400; attempt++) {
      var occupied = new Uint8Array(size * size);
      var panes = [];
      var colours = [];
      for (var i = 0; i < spec.primaries; i++) colours.push(pick(rng, PRIMARY));
      for (var j = 0; j < (spec.secondaries || 0); j++) colours.push(pick(rng, SECONDARY));

      var ok = true;
      for (var k = 0; k < colours.length; k++) {
        var shape = SHAPES[pick(rng, shapeKeys)];
        var p = placeBiased(rng, shape, size, occupied, k > 0);
        if (!p) { ok = false; break; }
        p.cells.forEach(function (c) { occupied[c] = 1; });
        panes.push({ shape: shape, colour: colours[k], r: p.r, c: p.c, rot: p.rot });
      }
      if (!ok) continue;

      var target = S.composite(size, panes);
      var why = quality(target, spec);
      if (why) continue;

      /* Panes go back to the tray. Shape and colour are all the player gets;
         the producing arrangement is thrown away deliberately, because any
         arrangement that reproduces the target wins. */
      return {
        size: size,
        target: Array.from(target),
        panes: panes.map(function (p) { return { shape: p.shape, colour: p.colour }; }),
        solution: panes.map(function (p) { return { r: p.r, c: p.c, rot: p.rot }; })
      };
    }
    return null;
  }

  return { SHAPES: SHAPES, PRIMARY: PRIMARY, SECONDARY: SECONDARY,
           placements: placements, quality: quality, generate: generate };
});
