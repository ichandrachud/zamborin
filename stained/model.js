/* ============================================================
   Zamborin · Stained · the colour and placement model

   THE ARTIST'S WHEEL, NOT THE PRINTER'S. Each pane is Red, Yellow or Blue,
   held as one bit:

       R = 1        Y = 2        B = 4

   A cell's colour is the OR of the bits of every pane covering it:

       0 clear   1 red     2 yellow   3 orange
       4 blue    5 purple  6 green    7 brown

   So red + yellow = orange, yellow + blue = green, blue + red = purple, and
   all three make a muddy brown. That is the mixing everyone was taught with
   paint. It is NOT what really happens when you stack glass filters, which is
   cyan/magenta/yellow, but a player's intuition is worth more here than the
   physics: almost nobody predicts that cyan over magenta gives blue, and
   almost everybody predicts that red over yellow gives orange.

   Mechanically nothing changes. It is still three bits OR'd, still order
   independent, still eight colours.

   OR rather than multiply because the bits ARE the pigments: a cell carries
   red if at least one red pane covers it, and a second red pane over the same
   cell changes nothing. That idempotence is the whole reason order does not
   matter.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StainedModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var R = 1, Y = 2, B = 4;
  var NAMES = ['clear','red','yellow','orange','blue','purple','green','brown'];
  var GLYPH = ['.','r','y','o','b','p','g','n'];

  /* ---------- shapes ----------
     A shape is a list of [row, col] offsets. Rotation is 90 degrees only, per
     the brief, and normalisation pins the shape to the origin so two shapes
     that differ only by translation compare equal. */
  function rotate(cells, times) {
    var out = cells.map(function (c) { return c.slice(); });
    for (var t = 0; t < ((times % 4) + 4) % 4; t++) {
      out = out.map(function (c) { return [c[1], -c[0]]; });
    }
    return normalise(out);
  }

  function normalise(cells) {
    var minR = Infinity, minC = Infinity;
    cells.forEach(function (c) { if (c[0] < minR) minR = c[0]; if (c[1] < minC) minC = c[1]; });
    return cells.map(function (c) { return [c[0] - minR, c[1] - minC]; })
                .sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
  }

  function extent(cells) {
    var h = 0, w = 0;
    cells.forEach(function (c) { if (c[0] + 1 > h) h = c[0] + 1; if (c[1] + 1 > w) w = c[1] + 1; });
    return { h: h, w: w };
  }

  /* Absolute cells a placed pane covers. Returns null if any cell falls off
     the window, so callers never have to bounds-check separately. */
  function cover(shape, rot, r0, c0, size) {
    var cells = rotate(shape, rot), out = [];
    for (var i = 0; i < cells.length; i++) {
      var r = r0 + cells[i][0], c = c0 + cells[i][1];
      if (r < 0 || c < 0 || r >= size || c >= size) return null;
      out.push(r * size + c);
    }
    return out;
  }

  /* ---------- the composite ----------
     A pure function of which panes cover what. `panes` are
     { shape, colour, r, c, rot }; a pane with r === null is still in the tray
     and contributes nothing. */
  function composite(size, panes) {
    var g = new Uint8Array(size * size);
    for (var p = 0; p < panes.length; p++) {
      var pn = panes[p];
      if (pn.r === null || pn.r === undefined) continue;
      var cells = cover(pn.shape, pn.rot, pn.r, pn.c, size);
      if (!cells) continue;
      for (var i = 0; i < cells.length; i++) g[cells[i]] |= pn.colour;
    }
    return g;
  }

  function equal(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /* ---------- reading a target ----------
     The mask of cells that must carry a given primary. A green cell (6 = Y|B)
     needs yellow AND blue, so it appears in both masks. Working that out from
     the picture is the player's real cognitive task. */
  function maskOf(grid, bit) {
    var m = new Uint8Array(grid.length);
    for (var i = 0; i < grid.length; i++) m[i] = (grid[i] & bit) ? 1 : 0;
    return m;
  }

  function ascii(grid, size) {
    var out = [];
    for (var r = 0; r < size; r++) {
      var row = '';
      for (var c = 0; c < size; c++) row += GLYPH[grid[r * size + c]];
      out.push(row);
    }
    return out.join('\n');
  }

  function counts(grid) {
    var n = [0,0,0,0,0,0,0,0];
    for (var i = 0; i < grid.length; i++) n[grid[i]]++;
    return n;
  }

  return {
    R: R, Y: Y, B: B, NAMES: NAMES, GLYPH: GLYPH,
    rotate: rotate, normalise: normalise, extent: extent, cover: cover,
    composite: composite, equal: equal, maskOf: maskOf,
    ascii: ascii, counts: counts
  };
});
