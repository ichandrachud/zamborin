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
      GREEN = '#5DD39E',    // --green         palette, unused since the ring went
      SUN = '#FFD23F',      // --accent-2      par
      INK72 = 'rgba(255,255,255,0.72)',
      INK92 = 'rgba(255,255,255,0.92)';

  /* ---------- the worlds ----------
     Per world the tiles recolour and nothing else does. Measured against the
     hole, which is the ground the board is actually read on. */
  /* THE HOLE IS A WORLD COLOUR, AND IT IS CHOSEN AGAINST THE CAST.

     First attempt got this wrong by measuring one thing. I picked each hole
     for TILE contrast and never checked the ENEMY against it - and the penguin
     is 45% black, the police car 28%, the shark 68%. On a near-black hole they
     have no silhouette at all. The owner's own 2014 screens light those three
     worlds for exactly that reason.

     Taking the 2014 grounds literally does not work either: the arctic tiles
     measure 1.29:1 against the arctic water and the ocean tiles 1.12:1 against
     the sea, and the police car measures 1.91:1 against its own asphalt. With
     the brief's tile palette NO single ground clears 3:1 for both the tile and
     a black enemy - swept, and the best available was 2.74, 2.73 and 1.89.

     So the tiles were lifted instead: a mid ground a black body reads on, and
     tiles above it. Everything that sits in a hole is measured against it -
     the tile beside it, the enemy, the bunny, the blocker:

       world    hole      tile  enemy  bunny  blocker
       woods    #0C1F12   4.74   5.05  17.21     2.80   (the fox is orange)
       arctic   #197499   3.15   3.10   5.25     5.25
       road     #6D6D6D   3.20   3.26   5.17     5.17   (the cone's white band)
       ocean    #007CB2   3.01   3.08   4.64     4.64

     The carrot is the one thing under the floor, at 2.3 to 2.6 on the three
     light worlds. It is orange on blue and grey, so it is carried by hue
     rather than value, and it is a goal marker rather than a hazard - but it
     is under, and it is the next thing to fix. */
  var WORLDS = {
    woods:  { lit: '#7FBF57', mid: '#5E9440', dark: '#436E2C', hole: '#0C1F12',
              name: 'THE WOODS',    predator: 'fox',     block: 'brick'   },
    arctic: { lit: '#C8E8F5', mid: '#8FD2EB', dark: '#25A4D5', hole: '#197499',
              name: 'ARCTIC SALAD', predator: 'penguin', block: 'iceberg' },
    road:   { lit: '#F5E7BD', mid: '#E9C965', dark: '#BE971C', hole: '#6D6D6D',
              name: 'THE ROAD',     predator: 'cop',     block: 'cone'    },
    ocean:  { lit: '#E1EFF7', mid: '#B3D5EB', dark: '#60A6D6', hole: '#007CB2',
              name: 'OCEAN WORLD',  predator: 'shark',   block: 'iceberg' },
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
  /* THERE IS NO PLATE. It was red, and red only ever appeared as a frame round
     the board and as hairlines between the slats - which is to say it read as
     a BORDER, and the owner does not want borders on this board. The ground
     under the slats is the page itself now, the same as a hole, so what is
     left on screen is slats and holes and nothing drawn around them. */
  var PLATE = GROUND;

  function drawTray(ctx, geo, world) {
    var pad = Math.round(geo.cell * 0.14);
    ctx.fillStyle = (world && world.hole) || PLATE;
    ctx.fillRect(geo.ox - pad, geo.oy - pad,
                 geo.cols * geo.cell + pad * 2, geo.rows * geo.cell + pad * 2);
  }

  /* A hole is the page. Flat, square-cornered, no inset and no shadow. */
  function drawHole(ctx, geo, i, world) {
    var p = geo.at(i), c = geo.cell;
    ctx.fillStyle = (world && world.hole) || GROUND;
    ctx.fillRect(p.x, p.y, c, c);
  }

  /* An immovable brick: the same footprint, no studs, and it does not sit
     above the plate the way a slat does. */
  /* The immovable block, and in the woods it is the brick wall - the owner's
     own 2014 drawing. `art` is the loaded sprite; without it the same thing is
     drawn from its two colours, so the board never shows a gap where a wall
     should be. Red brick works here only because the ground stopped being red. */
  /* THE SAME CORNERS AS A SLAT. The brick was drawn square and full-bleed
     while every slat beside it was inset and rounded, so the one immovable
     thing on the board was also the only thing with hard corners - it read as
     a different material rather than as a piece that will not move. Same
     inset, same radius, and the art is clipped to it. */
  function drawBrick(ctx, geo, i, art) {
    var p = geo.at(i), c = geo.cell, k;
    var inset = Math.max(1, c * 0.03), r = Math.round(c * TILE_R);
    var x = p.x + inset, y = p.y + inset, w = c - inset * 2, h = c - inset * 2;
    ctx.save();
    rr(ctx, x, y, w, h, r); ctx.clip();
    if (art && art.naturalWidth) { ctx.drawImage(art, x, y, w, h); ctx.restore(); return; }
    ctx.fillStyle = '#BE1E2D';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#FFD194'; ctx.lineWidth = Math.max(1, c * 0.04);
    for (k = 1; k < 4; k++) {
      ctx.beginPath(); ctx.moveTo(x, y + h * k / 4);
      ctx.lineTo(x + w, y + h * k / 4); ctx.stroke();
    }
    ctx.restore();
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

  return {
    GROUND: GROUND, SURFACE: SURFACE, RAISED: RAISED, SCRIM: SCRIM,
    PLATE: PLATE, TILE_R: TILE_R,
    CORAL: CORAL, GREEN: GREEN, SUN: SUN, INK72: INK72, INK92: INK92,
    WORLDS: WORLDS, rr: rr,
    drawTray: drawTray, drawHole: drawHole, drawBrick: drawBrick, drawTile: drawTile
  };
});
