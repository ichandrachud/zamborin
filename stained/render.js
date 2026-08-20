/* ============================================================
   Zamborin · Stained · glass rendering

   Two rules govern everything here.

   1. THE CAME FOLLOWS COLOUR REGIONS, NOT THE GRID. Drawing a line at every
      cell boundary is what made this read as a spreadsheet. Real leaded glass
      has lead around each region of colour and nothing inside it, so two
      neighbouring cells of the same colour are ONE pane of glass with no line
      between them. A faint hairline stays on the interior joins so a finger
      can still judge cell positions while dragging, but it sits far below the
      came in weight.

   2. THE WINDOW IS TRANSMITTED, THE CHROME IS FROSTED. Frosting diffuses and
      desaturates, and the colour of every cell IS the puzzle — the palette was
      tuned to a worst pair of 34 dE and that must not be given back. So the
      glass treatment (soft translucency, blur, bloom) is applied to the tray,
      the pane under the finger and the surrounding chrome, while the window
      itself stays saturated light coming through coloured filters.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StainedRender = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TAU = Math.PI * 2;

  /* Deterministic per-cell noise. Seeded from the cell index so the grain sits
     still instead of shimmering every time the composite is recomputed. */
  function hash(a, b, salt) {
    var h = (a * 374761393 + b * 668265263 + (salt || 0) * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function hex(h) {
    var s = h.replace('#', '');
    return [parseInt(s.substr(0,2),16), parseInt(s.substr(2,2),16), parseInt(s.substr(4,2),16)];
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(a, b, t) {
    var A = hex(a), B = hex(b);
    return 'rgb(' + Math.round(A[0]+(B[0]-A[0])*t) + ',' +
                    Math.round(A[1]+(B[1]-A[1])*t) + ',' +
                    Math.round(A[2]+(B[2]-A[2])*t) + ')';
  }

  /* NO DARK LEAD. The window is backlit, so a joint between two pieces of
     glass is where light LEAKS THROUGH, not where it is blocked. Edges are
     therefore made of light: a thin bright warm core with a tight feather,
     per the house glow rule, plus a drop shadow under the whole window so it
     sits above the page rather than being printed on it.

     A stroked dark border also reads cartoonish and flattens the material,
     which is the reason the house forbids outlines on pieces in the first
     place. Value and light do the separating instead. */
  var JOINT = [255, 244, 222];

  /* The lightbox behind the window. Clear glass has to read as LIT rather than
     as empty background, and that only works if there is visibly a source. */
  function backlight(ctx, x, y, w, h, bloom) {
    var cx = x + w / 2, cy = y + h / 2;
    var r = Math.hypot(w, h) * 0.62;
    var g = ctx.createRadialGradient(cx, cy - h * 0.08, r * 0.06, cx, cy, r);
    g.addColorStop(0, 'rgba(255,246,226,' + (0.16 + 0.26 * bloom) + ')');
    g.addColorStop(0.45, 'rgba(255,238,206,' + (0.07 + 0.18 * bloom) + ')');
    g.addColorStop(1, 'rgba(255,232,196,0)');
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, w + r * 2, h + r * 2);
    ctx.restore();
  }

  /* MILK GLASS. One flat fill, nothing else.

     Everything that used to be here — a diagonal thickness gradient, seeded
     grain streaks, a per-cell glow on the clear cells — was trying to make
     each cell look like a separate object, and the result read as crumpled
     foil or tile. Opal glass on a lightbox is the opposite: even, diffuse,
     no visible structure at all. The luminosity belongs to the LAMP behind the
     whole panel, not to each cell, so it is applied once across the window
     after every cell is down (see panelGlow). */
  function glassCell(ctx, x, y, s, colour) {
    ctx.fillStyle = colour;
    ctx.fillRect(x, y, s, s);
  }

  /* The lamp, seen through the sheet: a single soft rise toward the middle and
     a gentle falloff at the edges. One gradient over the whole panel is what
     makes it read as one lit surface rather than a mosaic of lit squares. */
  function panelGlow(ctx, gx, gy, W, bloom, grid, size, cell) {
    var b = bloom || 0;
    var g = ctx.createRadialGradient(gx + W * 0.5, gy + W * 0.44, W * 0.04,
                                     gx + W * 0.5, gy + W * 0.5, W * 0.78);
    g.addColorStop(0, 'rgba(255,250,236,' + (0.30 + 0.30 * b) + ')');
    g.addColorStop(0.55, 'rgba(255,246,226,' + (0.14 + 0.18 * b) + ')');
    g.addColorStop(1, 'rgba(255,242,218,0)');

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    /* CLEAR CELLS ONLY. Painted over the whole panel this is what washed the
       colours out; confined to the milk glass it is just the lamp showing
       through the parts that are not filtered. */
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        if (grid[r * size + c] !== 0) continue;
        ctx.fillRect(gx + c * cell, gy + r * cell, cell, cell);
      }
    }
    ctx.restore();
  }

  /* A joint between two colours: light coming through the seam. Thin bright
     core, tight feather, nothing wide or hazy. */
  function joint(ctx, x0, y0, x1, y1, w, strength) {
    var k = strength === undefined ? 1 : strength;
    /* THIN CORE, TIGHT FEATHER. The first version drew the feather at 2.6x the
       joint width additively, so on a 46px cell the glow from all four sides
       met in the middle and flooded it: cyan rendered #78DEEE against an
       intended #3FB6CE, and every colour lost a third of its saturation. That
       is the wide wash the house glow rule exists to forbid. */
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(JOINT, 0.035 * k);
    ctx.lineWidth = w * 1.35;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = rgba(JOINT, 0.10 * k);
    ctx.lineWidth = w * 0.62;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(JOINT, 0.80 * k);
    ctx.lineWidth = Math.max(1, w * 0.30);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.restore();
  }

  /* The whole window. `grid` is the composite, `size` the side in cells. */
  function window_(ctx, grid, size, gx, gy, cell, palette, bloom) {
    var W = cell * size;
    backlight(ctx, gx, gy, W, W, bloom || 0);

    // the whole window sits above the page and drops a shadow onto it
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = cell * 0.9;
    ctx.shadowOffsetY = cell * 0.30;
    ctx.fillStyle = '#000';
    ctx.fillRect(gx, gy, W, W);
    ctx.restore();

    /* SHARP SILHOUETTES. Coloured glass held against a lamp has a hard edge
       and keeps its hue: the light behind it does not spill round it and does
       not wash it out.

       Two things used to break that. Every colour boundary carried an additive
       glow whose feather straddled the edge, softening the very thing that
       should be crisp. And the lamp gradient was laid additively over the WHOLE
       panel, lifting every colour toward white — measured, purple drifted 7.9
       dE and red 6.2 from their intended values.

       So: cells are flat and abut sharply, and the lamp is applied ONLY where
       the glass is clear. The milk glass glows; the colours stay colours. */
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        glassCell(ctx, gx + c * cell, gy + r * cell, cell, palette[grid[r * size + c]]);
      }
    }
    panelGlow(ctx, gx, gy, W, bloom, grid, size, cell);

    /* A hairline on the interior joins so a dragging finger can still read the
       grid. Dark and thin rather than a glow, because a glow is what blurred
       the edges. It stops at colour boundaries, which need no help. */
    ctx.save();
    ctx.strokeStyle = 'rgba(24,18,12,0.10)';
    ctx.lineWidth = 1;
    for (var i = 1; i < size; i++) {
      ctx.beginPath(); ctx.moveTo(gx + i*cell, gy); ctx.lineTo(gx + i*cell, gy + W); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx, gy + i*cell); ctx.lineTo(gx + W, gy + i*cell); ctx.stroke();
    }
    ctx.restore();

    // the halo survives only as a hint, and only when the window is resolving
    if (bloom) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(JOINT, 0.10 * bloom);
      ctx.lineWidth = cell * 0.22;
      ctx.filter = 'blur(' + (cell * 0.14) + 'px)';
      ctx.strokeRect(gx, gy, W, W);
      ctx.filter = 'none';
      ctx.restore();
    }

    if (bloom) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var b = ctx.createRadialGradient(gx + W / 2, gy + W / 2, W * 0.12,
                                       gx + W / 2, gy + W / 2, W * 0.85);
      b.addColorStop(0, 'rgba(255,244,214,' + (0.22 * bloom) + ')');
      b.addColorStop(1, 'rgba(255,244,214,0)');
      ctx.fillStyle = b;
      ctx.fillRect(gx - W, gy - W, W * 3, W * 3);
      ctx.restore();
    }
  }

  /* A pane as a loose chip of glass: in the tray, or under the finger. */
  /* A loose pane of glass on the bench.

     NO OUTLINE. The edge is made of value: light along the top, shade at the
     foot, and a drop shadow underneath. The old version stroked the silhouette
     segment by segment in `lighter` mode with round caps, so every corner and
     every junction between cells stacked two or three round caps into a bright
     blob. Those blobs read as handles or nodes, as if they were something to
     grab, which is exactly what a decorative mark must never do.

     The fill is also ONE path rather than a rect per cell. Filling cell by cell
     with a shadow enabled made each cell cast a shadow across its own
     neighbours, which drew dark seams inside a pane that should be a single
     sheet. */
  function chipPath(ctx, cells, x, y, cell) {
    ctx.beginPath();
    cells.forEach(function (c) { ctx.rect(x + c[1]*cell, y + c[0]*cell, cell, cell); });
  }

  function chip(ctx, cells, x, y, cell, colour, alpha, shadow) {
    var minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
    cells.forEach(function (c) {
      if (c[0] < minR) minR = c[0];
      if (c[1] < minC) minC = c[1];
      if (c[0] > maxR) maxR = c[0];
      if (c[1] > maxC) maxC = c[1];
    });
    var bx = x + minC * cell, by = y + minR * cell;
    var bw = (maxC - minC + 1) * cell, bh = (maxR - minR + 1) * cell;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = cell * 0.5;
      ctx.shadowOffsetY = cell * 0.18;
    }
    ctx.fillStyle = colour;
    chipPath(ctx, cells, x, y, cell);
    ctx.fill();
    ctx.restore();

    // form: top-lit sheet, shaded towards its foot
    ctx.save();
    ctx.globalAlpha = alpha;
    chipPath(ctx, cells, x, y, cell);
    ctx.clip();
    var g = ctx.createLinearGradient(0, by, 0, by + bh);
    g.addColorStop(0,    'rgba(255,252,244,0.28)');
    g.addColorStop(0.45, 'rgba(255,252,244,0.05)');
    g.addColorStop(1,    'rgba(6,4,10,0.24)');
    ctx.fillStyle = g;
    ctx.fillRect(bx, by, bw, bh);
    ctx.restore();
  }
  function line(ctx, a, b, c, d) { ctx.beginPath(); ctx.moveTo(a,b); ctx.lineTo(c,d); ctx.stroke(); }

  /* ---------- THE UNLIT WINDOW ----------
     Glass laid out on a dark bench, before it is held up to the light.

     You can see WHERE every pane is and WHAT COLOUR it is, and you can see
     where panes lie on top of one another, because more layers means less
     light gets through. What you cannot see is the colour that the stack
     PRODUCES — that only arrives when the window is lit.

     This is the whole point of the mode. With the blend showing continuously
     you can place something, read off exactly how many cells are wrong, and
     walk up the gradient without ever planning; a hill-climber solves 93% of
     levels that way. Unlit, the only way to know what a crossing makes is to
     work it out. */
  function unlit(ctx, size, gx, gy, cell, placed, palette, rotate) {
    var W = cell * size, i, r, c;

    // the bench: cold, unlit, with the window's outline just visible
    ctx.save();
    ctx.fillStyle = '#0B1018';
    ctx.fillRect(gx, gy, W, W);
    ctx.strokeStyle = 'rgba(150,175,210,0.16)';
    ctx.lineWidth = 1;
    for (i = 1; i < size; i++) {
      ctx.beginPath(); ctx.moveTo(gx + i*cell, gy); ctx.lineTo(gx + i*cell, gy + W); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx, gy + i*cell); ctx.lineTo(gx + W, gy + i*cell); ctx.stroke();
    }
    ctx.restore();

    // depth of stack per cell: more glass, less light through
    var depth = new Uint8Array(size * size);
    placed.forEach(function (p) {
      rotate(p.shape, p.rot).forEach(function (q) {
        var rr = p.r + q[0], cc = p.c + q[1];
        if (rr >= 0 && cc >= 0 && rr < size && cc < size) depth[rr * size + cc]++;
      });
    });
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) {
      var d = depth[r * size + c];
      if (!d) continue;
      ctx.fillStyle = 'rgba(196,214,240,' + Math.min(0.34, 0.10 + d * 0.09) + ')';
      ctx.fillRect(gx + c*cell, gy + r*cell, cell, cell);
    }

    /* Each pane's own edge, in its own colour. The silhouette says which glass
       is where; crossing silhouettes say where it stacks. */
    placed.forEach(function (p) {
      var cells = rotate(p.shape, p.rot);
      var has = {};
      cells.forEach(function (q) { has[q[0] + ',' + q[1]] = true; });
      ctx.save();
      ctx.strokeStyle = palette[p.colour];
      ctx.lineWidth = Math.max(2, cell * 0.11);
      ctx.lineCap = 'round';
      ctx.shadowColor = palette[p.colour];
      ctx.shadowBlur = cell * 0.30;
      cells.forEach(function (q) {
        var x = gx + (p.c + q[1]) * cell, y = gy + (p.r + q[0]) * cell;
        if (!has[(q[0]-1) + ',' + q[1]]) seg(ctx, x, y, x+cell, y);
        if (!has[(q[0]+1) + ',' + q[1]]) seg(ctx, x, y+cell, x+cell, y+cell);
        if (!has[q[0] + ',' + (q[1]-1)]) seg(ctx, x, y, x, y+cell);
        if (!has[q[0] + ',' + (q[1]+1)]) seg(ctx, x+cell, y, x+cell, y+cell);
      });
      ctx.restore();
    });

    /* No frame stroke. A thick cold rule round the glass was the last thing
       drawing a box on the board, and the housing already ends where the glass
       ends — the boundary does not need saying twice. */
  }
  function seg(ctx,a,b,c,d){ ctx.beginPath(); ctx.moveTo(a,b); ctx.lineTo(c,d); ctx.stroke(); }

  /* ---------- THE LIGHTBOX ----------
     One clean panel, not a milled machine. A rounded slab; the glass sits
     flush in the upper part; a dark sill runs along the bottom carrying a
     single pill toggle. Restraint is the point — the window is the thing to
     look at, and the housing should be quiet enough to disappear.

     The toggle RELEASES ITSELF: hold it and the lamp is on, let go and it
     stays on for a moment before falling back. That keeps the light a
     deliberate act (a switch you can leave on restores the continuous blend
     the dark bench exists to remove) without making you keep a finger pinned
     to it while you think. */
  /* THE HOUSING IS GONE. There is no slab, no bezel and no sill band.

     A rounded grey rectangle with a control tucked into its foot reads as a
     tablet, and no amount of restyling that rectangle fixes it: the silhouette
     IS the tablet. So the window is now an unframed sheet of glass sitting on
     the page, and the switch sits below it on the same background rather than
     being set into a housing.

     What used to define the panel's edge was the frame around it. That job now
     goes to value: a soft drop shadow under the sheet when it is dark, and the
     light it throws when it is lit. `bezel` is kept in the signature because
     the layout still uses it as breathing room, but nothing is drawn with it.

     It also disposes of a bug rather than fixing it: the frame's right edge was
     being lost at some widths, and an edge that does not exist cannot go
     missing. */
  function lightbox(ctx, gx, gy, W, bezel, sill, lit, knob) {
    var k = knob === undefined ? (lit ? 1 : 0) : knob;   // 0 off .. 1 on

    /* The sheet's own shadow, so it sits ON the page rather than being cut out
       of it. Drawn under the glass, which the caller paints next. */
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = Math.max(10, W * 0.05);
    ctx.shadowOffsetY = Math.max(4, W * 0.018);
    ctx.fillStyle = '#0B1018';
    ctx.fillRect(gx, gy, W, W);
    ctx.restore();

    /* the switch, standing on the page below the glass */
    var pw = Math.max(32, sill * 1.05), ph = Math.max(17, sill * 0.50);
    var px = gx + W / 2 - pw / 2, py = gy + W + (sill - ph) / 2;

    ctx.save();
    ctx.fillStyle = lerpCol('#5A6069', '#F2E45C', k);
    roundRect(ctx, px, py, pw, ph, ph / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1;
    roundRect(ctx, px + 0.5, py + 0.5, pw - 1, ph - 1, ph / 2);
    ctx.stroke();
    ctx.restore();

    var kr = ph / 2 - 3;
    var kx = px + kr + 3 + (pw - (kr + 3) * 2) * k;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
    ctx.fillStyle = k > 0.5 ? '#23262C' : '#D8DCE4';
    ctx.beginPath(); ctx.arc(kx, py + ph / 2, kr, 0, TAU); ctx.fill();
    ctx.restore();

    if (k > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var gl = ctx.createRadialGradient(px + pw / 2, py + ph / 2, ph * 0.3,
                                        px + pw / 2, py + ph / 2, pw * 0.9);
      gl.addColorStop(0, 'rgba(242,228,92,' + (0.13 * k) + ')');
      gl.addColorStop(1, 'rgba(242,228,92,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(px - pw, py - ph * 2, pw * 3, ph * 5);
      ctx.restore();
    }

    return { bx: px + pw / 2, by: py + ph / 2, bw: pw, bh: ph, br: Math.max(pw, ph) / 2 };
  }

  function lerpCol(a, b, t) {
    var A = hex(a), B = hex(b);
    return 'rgb(' + Math.round(A[0]+(B[0]-A[0])*t) + ',' +
                    Math.round(A[1]+(B[1]-A[1])*t) + ',' +
                    Math.round(A[2]+(B[2]-A[2])*t) + ')';
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return { window: window_, unlit: unlit, lightbox: lightbox, chip: chip,
           backlight: backlight, glassCell: glassCell, panelGlow: panelGlow,
           roundRect: roundRect, hash: hash, mix: mix };
});
