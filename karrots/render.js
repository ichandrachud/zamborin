/* ============================================================
   Zamborin · Karrots · drawing the board

   THE INVERSION. In the 2014 game the tiles were the ground and the holes were
   painted on top of them. Here it is the other way round: a tile is a lit slab
   sitting ABOVE the tray, and a hole is an ABSENCE - the page ground showing
   through, with the tray's own thickness casting a shadow into it. Depth is
   the whole read, and it is how a stranger knows in one second which things
   move.

   Nothing on the board is outlined. Every edge here is an extruded face, a
   light band or a cast shadow, per DESIGN-SYSTEM.md §6.

   Chrome colours come from tokens and are named in comments, because canvas
   cannot read a CSS variable and this is the one place they get restated. The
   tiles, the holes and the fox's edge are GAME ART and carry the palette from
   the art board.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KarrotsRender = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- tokens, restated ---------- */
  var GROUND = '#0E1726',   // --bg        the page, and therefore the hole
      SURFACE = '#131F36',  // --bg-card
      RAISED = '#1A2A45',   // --bg-panel  Raised. NOT #1B2A47; see the known drift
      SCRIM = '#0A101C',
      CORAL = '#FF6B5C',    // --accent-text   the fox's reach
      GREEN = '#5DD39E',    // --green         a safe slide
      SUN = '#FFD23F',      // --accent-2      par
      INK72 = 'rgba(255,255,255,0.72)',
      INK92 = 'rgba(255,255,255,0.92)';

  /* ---------- the worlds ----------
     Per world the tiles recolour and nothing else does. Measured against the
     hole, which is the ground the board is actually read on. */
  var WORLDS = {
    woods:  { lit: '#7FBF57', mid: '#5E9440', dark: '#436E2C', name: 'THE WOODS' },
    arctic: { lit: '#8FD8F2', mid: '#5FBEE3', dark: '#3B8FB4', name: 'ARCTIC SALAD' },
    ocean:  { lit: '#5FB0E4', mid: '#3288C2', dark: '#1F608C', name: 'OCEAN WORLD' },
    road:   { lit: '#F2CE3C', mid: '#D4A81F', dark: '#8F7112', name: 'THE ROAD' },
  };

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else {
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
  }

  /* ---------- the board ----------
     A RED PLATE with the holes cut through it to the page. The slats and the
     cast sit on the red; a hole is the canvas itself, painted flat and square
     so it reads as absence rather than as a dark piece. The earlier version
     drew each hole as a rounded, inset, shadowed object, which made it look
     like a tile that happened to be dark - the exact opposite of the read. */
  /* Game art, not chrome, so it carries its own colour. Lifted from #B0212C
     on 2026-09-07: against the hole the darker red measured 2.65:1, under the
     3:1 bar for a graphical object, and this reads at 3.2:1 on the painted
     pixel while still being the 2014 brick red. */
  var PLATE = '#C8323C';
  var PLATE_LIP = '#9B1F28';

  function drawTray(ctx, geo) {
    var pad = Math.round(geo.cell * 0.14);
    var x = geo.ox - pad, y = geo.oy - pad;
    var w = geo.cols * geo.cell + pad * 2, h = geo.rows * geo.cell + pad * 2;
    var r = Math.round(geo.cell * 0.13);
    ctx.fillStyle = PLATE_LIP;
    rr(ctx, x, y + Math.max(2, geo.cell * 0.03), w, h, r); ctx.fill();
    ctx.fillStyle = PLATE;
    rr(ctx, x, y, w, h, r); ctx.fill();
  }

  /* A hole is the page. Flat, square-cornered, no inset and no shadow. */
  function drawHole(ctx, geo, i) {
    var p = geo.at(i), c = geo.cell;
    ctx.fillStyle = GROUND;
    ctx.fillRect(p.x, p.y, c, c);
  }

  /* An immovable brick: the same footprint, no studs, and it does not sit
     above the plate the way a slat does. */
  function drawBrick(ctx, geo, i) {
    var p = geo.at(i), c = geo.cell, r = Math.round(c * 0.10);
    /* PALE stone. A wall has to be told apart from a hole, which is the
       dangerous confusion - mistake one for the other and you misread where
       she can walk - and the dark grey managed only 2.19:1 against it. This
       reads at about 6:1.
         Against the green slat no colour can do it: the slat sits mid-range,
       so anything 3:1 lighter than it is nearly white and anything 3:1 darker
       is nearly the hole. §7 of the design system covers exactly this - where
       lightness cannot carry a distinction on its own it needs a second
       channel - and the second channel here is the studs. Every slat has
       them in a two-by-two grid; a wall has none, and never will. */
    ctx.fillStyle = '#9AA0AD';
    rr(ctx, p.x + 2, p.y + 2, c - 4, c - 4, r); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    rr(ctx, p.x + 2, p.y + c * 0.62, c - 4, c * 0.38 - 2, r); ctx.fill();
  }

  /* ---------- a slat ----------
     Drawn to match the 2014 export: ONE FLAT RECTANGLE and four studs per
     cell in a two-by-two grid, each stud a lit disc over a darker disc offset
     down and right. No gradient, no light band, no cast shadow — the file the
     owner supplied has none of them and they were making the board look like
     moulded plastic instead of a painted slat.

     Corner radius is 0.133 of a cell, thirty per cent down from the 0.19 the
     first pass used. */
  var TILE_R = 0.133;
  function drawTile(ctx, geo, a, b, world, opts) {
    opts = opts || {};
    var c = geo.cell, pa = geo.at(a), pb = geo.at(b);
    var x = Math.min(pa.x, pb.x) + (opts.dx || 0), y = Math.min(pa.y, pb.y) + (opts.dy || 0);
    var w = Math.abs(pb.x - pa.x) + c, h = Math.abs(pb.y - pa.y) + c;
    var inset = Math.max(1, c * 0.03), r = Math.round(c * TILE_R);
    x += inset; y += inset; w -= inset * 2; h -= inset * 2;

    ctx.fillStyle = world.mid;
    rr(ctx, x, y, w, h, r); ctx.fill();

    // studs: two across the short side, two per cell along the long one, at a
    // quarter-cell inset and a half-cell pitch, exactly as the file has them
    /* Half-cell pitch, quarter-cell inset: FOUR studs per cell in a two-by-two
       grid, which is what the supplied file has. Subtracting one from the
       count was leaving three studs in a line down a two-cell slat. */
    var sr = c * 0.134, off = Math.max(1, c * 0.015);
    var nx = Math.max(1, Math.round(w / (c / 2))), ny = Math.max(1, Math.round(h / (c / 2)));
    for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) {
      var sx = x + w * (i + 0.5) / nx, sy = y + h * (j + 0.5) / ny;
      ctx.globalAlpha = 0.6; ctx.fillStyle = world.dark;
      ctx.beginPath(); ctx.arc(sx + off, sy + off, sr, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = world.lit;
      ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    }
    return { x: x, y: y, w: w, h: h };
  }

  /* ---------- the ring under the finger ----------
     Inherited from Crimp. Solid green means this slide is safe; dashed coral
     means it opens his path. Solid versus dashed is a SHAPE channel, so the
     warning does not depend on telling green from red. Both carry a dark
     casing so they read on a bright tile and on the dark floor alike. */
  function drawRing(ctx, box, safe) {
    var r = Math.round(Math.min(box.w, box.h) * 0.22);
    ctx.save();
    ctx.lineWidth = 6; ctx.strokeStyle = SCRIM;              // casing
    ctx.setLineDash([]);
    rr(ctx, box.x - 2, box.y - 2, box.w + 4, box.h + 4, r + 2); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = safe ? GREEN : CORAL;
    if (!safe) ctx.setLineDash([9, 7]);
    rr(ctx, box.x - 2, box.y - 2, box.w + 4, box.h + 4, r + 2); ctx.stroke();
    ctx.restore();
  }

  /* A hole the bunny could hop into. Deliberately quiet: a dot, not a ring.
     The affordance has to be findable without turning the board into a map of
     everywhere she is allowed to stand. */
  function drawHopDot(ctx, geo, i, alpha) {
    var p = geo.at(i), c = geo.cell;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(255,255,255,0.40)';
    ctx.beginPath(); ctx.arc(p.x + c / 2, p.y + c / 2, Math.max(2.5, c * 0.055), 0, Math.PI * 2);
    ctx.fill(); ctx.restore();
  }

  return {
    GROUND: GROUND, SURFACE: SURFACE, RAISED: RAISED, SCRIM: SCRIM,
    PLATE: PLATE, PLATE_LIP: PLATE_LIP, TILE_R: TILE_R,
    CORAL: CORAL, GREEN: GREEN, SUN: SUN, INK72: INK72, INK92: INK92,
    WORLDS: WORLDS, rr: rr,
    drawTray: drawTray, drawHole: drawHole, drawBrick: drawBrick, drawTile: drawTile,
    drawRing: drawRing, drawHopDot: drawHopDot
  };
});
