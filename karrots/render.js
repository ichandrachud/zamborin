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

  /* ---------- the tray ----------
     One surface with the board's holes cut through it. Drawn as a rounded
     panel a step above Ground so that a hole, which IS Ground, reads as a hole
     rather than as a dark tile. */
  function drawTray(ctx, geo) {
    var pad = Math.round(geo.cell * 0.16);
    var x = geo.ox - pad, y = geo.oy - pad;
    var w = geo.cols * geo.cell + pad * 2, h = geo.rows * geo.cell + pad * 2;
    var g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, RAISED); g.addColorStop(1, SURFACE);
    ctx.fillStyle = g; rr(ctx, x, y, w, h, Math.round(geo.cell * 0.22)); ctx.fill();
    // A light band along the top edge, not a stroke: the tray is lit from up
    // and slightly left like everything else.
    ctx.save();
    rr(ctx, x, y, w, h, Math.round(geo.cell * 0.22)); ctx.clip();
    var lb = ctx.createLinearGradient(x, y, x, y + Math.max(2, geo.cell * 0.08));
    lb.addColorStop(0, 'rgba(255,255,255,0.10)'); lb.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lb; ctx.fillRect(x, y, w, Math.max(2, geo.cell * 0.08));
    ctx.restore();
  }

  /* ---------- a hole ----------
     Ground, plus the tray's thickness falling into it from the top left. The
     inset is what makes it read as depth rather than as a dark square. */
  function drawHole(ctx, geo, i) {
    var p = geo.at(i), c = geo.cell, r = Math.round(c * 0.18);
    var inset = Math.max(1.5, c * 0.055);
    ctx.fillStyle = GROUND;
    rr(ctx, p.x, p.y, c, c, r); ctx.fill();
    ctx.save();
    rr(ctx, p.x, p.y, c, c, r); ctx.clip();
    var sh = ctx.createLinearGradient(p.x, p.y, p.x + c * 0.55, p.y + c * 0.55);
    sh.addColorStop(0, 'rgba(0,0,0,0.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh; ctx.fillRect(p.x, p.y, c, c);
    // and a thin catch of light on the far lip, which is what a real recess does
    var li = ctx.createLinearGradient(p.x + c, p.y + c, p.x + c - inset * 2, p.y + c - inset * 2);
    li.addColorStop(0, 'rgba(255,255,255,0.07)'); li.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = li; ctx.fillRect(p.x, p.y, c, c);
    ctx.restore();
  }

  /* ---------- an immovable brick ----------
     Same footprint as a tile and unmistakably not one: no studs, a colder
     colour, and it sits flush with the tray instead of above it. */
  function drawBrick(ctx, geo, i) {
    var p = geo.at(i), c = geo.cell, r = Math.round(c * 0.14);
    var g = ctx.createLinearGradient(p.x, p.y, p.x + c, p.y + c);
    g.addColorStop(0, '#6A4A46'); g.addColorStop(1, '#3E2A28');
    ctx.fillStyle = g;
    rr(ctx, p.x + 2, p.y + 2, c - 4, c - 4, r); ctx.fill();
  }

  /* ---------- a tile ----------
     One slab across both of its cells, so a domino reads as one object and not
     as two squares that happen to touch. `dx`/`dy` are the live drag offset in
     pixels; `lift` raises it while it is held. */
  function drawTile(ctx, geo, a, b, world, opts) {
    opts = opts || {};
    var c = geo.cell, pa = geo.at(a), pb = geo.at(b);
    var x = Math.min(pa.x, pb.x) + (opts.dx || 0), y = Math.min(pa.y, pb.y) + (opts.dy || 0);
    var w = Math.abs(pb.x - pa.x) + c, h = Math.abs(pb.y - pa.y) + c;
    var inset = Math.max(1.5, c * 0.035), r = Math.round(c * 0.19);
    var lift = opts.lift || 0;
    x += inset; y += inset - lift; w -= inset * 2; h -= inset * 2;

    // cast shadow onto the tray, deeper while the tile is held
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,' + (0.34 + lift * 0.02) + ')';
    ctx.filter = 'blur(' + Math.max(2, c * 0.06 + lift) + 'px)';
    rr(ctx, x + c * 0.05, y + c * 0.09 + lift, w, h, r); ctx.fill();
    ctx.restore();

    // the slab: lit from up and slightly left
    var g = ctx.createLinearGradient(x, y, x + w * 0.65, y + h);
    g.addColorStop(0, world.lit); g.addColorStop(0.55, world.mid); g.addColorStop(1, world.dark);
    ctx.fillStyle = g; rr(ctx, x, y, w, h, r); ctx.fill();

    // the top face's light band, and the bottom's turn into shadow
    ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
    var band = ctx.createLinearGradient(x, y, x, y + h * 0.30);
    band.addColorStop(0, 'rgba(255,255,255,0.22)'); band.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = band; ctx.fillRect(x, y, w, h * 0.30);
    var foot = ctx.createLinearGradient(x, y + h, x, y + h * 0.72);
    foot.addColorStop(0, 'rgba(0,0,0,0.28)'); foot.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = foot; ctx.fillRect(x, y + h * 0.72, w, h * 0.28);
    ctx.restore();

    // studs, one per cell: the toy brick, and a second read on which way a
    // domino lies without drawing a line down the middle of it
    var n = (w > h) ? 2 : 1, m = (w > h) ? 1 : 2, sr = c * 0.135;
    for (var i = 0; i < n; i++) for (var j = 0; j < m; j++) {
      var sx = x + w * (i + 0.5) / n, sy = y + h * (j + 0.5) / m;
      var sg = ctx.createLinearGradient(sx - sr, sy - sr, sx + sr, sy + sr);
      sg.addColorStop(0, world.lit); sg.addColorStop(1, world.dark);
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.beginPath(); ctx.arc(sx, sy + sr * 0.14, sr * 0.72, 0, Math.PI * 2); ctx.fill();
      var hg = ctx.createLinearGradient(sx - sr, sy - sr, sx, sy);
      hg.addColorStop(0, 'rgba(255,255,255,0.30)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(sx, sy, sr * 0.72, 0, Math.PI * 2); ctx.fill();
    }
    return { x: x, y: y, w: w, h: h };
  }

  /* ---------- the fox's reach ----------
     THE ONLY THING ON SCREEN THAT SAYS WHAT THE RULE IS DOING, so it is drawn
     as a bright EDGE and not as a tint. The first treatment washed his holes
     dark red and measured 2.12:1 against the floor, which cannot carry a rule.
     A coral edge measures 7.04:1 and is a SHAPE, so it survives colour
     blindness as well.

     `reveal` runs 0..1 and the edge grows outward from him rather than fading
     in everywhere at once: a corridor that just opened should look like it was
     REACHED. Segments are ordered by how far their cell is from the fox, which
     is the same order he would walk them in. */
  function foxEdgeSegments(model, st, geo) {
    var region = model.foxRegion(st), N = model.N, segs = [], i, k, p, d, ni;
    // hop distance from the fox, only inside his own region
    var dist = new Int16Array(N); dist.fill(-1); dist[st.fox] = 0;
    var q = [st.fox], head = 0;
    while (head < q.length) {
      i = q[head++]; p = model.rc(i);
      for (k = 0; k < 4; k++) {
        d = model.DIRS[k];
        if (!model.inside(p.r + d.dy, p.c + d.dx)) continue;
        ni = model.idx(p.r + d.dy, p.c + d.dx);
        if (!region[ni] || dist[ni] >= 0) continue;
        dist[ni] = dist[i] + 1; q.push(ni);
      }
    }
    var maxD = 0;
    for (i = 0; i < N; i++) if (region[i] && dist[i] > maxD) maxD = dist[i];

    for (i = 0; i < N; i++) {
      if (!region[i]) continue;
      p = model.rc(i);
      var c = geo.cell, at = geo.at(i);
      for (k = 0; k < 4; k++) {
        d = model.DIRS[k];
        var rr2 = p.r + d.dy, cc = p.c + d.dx;
        var outside = !model.inside(rr2, cc) || !region[model.idx(rr2, cc)];
        if (!outside) continue;
        var s;
        if (d.n === 'up')    s = [at.x, at.y, at.x + c, at.y];
        else if (d.n === 'down')  s = [at.x, at.y + c, at.x + c, at.y + c];
        else if (d.n === 'left')  s = [at.x, at.y, at.x, at.y + c];
        else                      s = [at.x + c, at.y, at.x + c, at.y + c];
        segs.push({ s: s, t: maxD ? dist[i] / maxD : 0 });
      }
    }
    return segs;
  }

  function drawFoxEdge(ctx, segs, reveal) {
    if (!segs.length) return;
    var w = 3;
    // the soft outward falloff first, then the crisp core on top
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = CORAL; ctx.globalAlpha = 0.30;
    ctx.lineWidth = w * 3.5; ctx.filter = 'blur(3px)';
    strokeSegs(ctx, segs, reveal);
    ctx.restore();
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineWidth = w; ctx.strokeStyle = CORAL;
    strokeSegs(ctx, segs, reveal);
    ctx.restore();
  }
  function strokeSegs(ctx, segs, reveal) {
    ctx.beginPath();
    for (var i = 0; i < segs.length; i++) {
      // a segment is in once the sweep has reached its distance from him
      if (reveal < 1 && segs[i].t > reveal * 1.15) continue;
      ctx.moveTo(segs[i].s[0], segs[i].s[1]); ctx.lineTo(segs[i].s[2], segs[i].s[3]);
    }
    ctx.stroke();
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
    CORAL: CORAL, GREEN: GREEN, SUN: SUN, INK72: INK72, INK92: INK92,
    WORLDS: WORLDS, rr: rr,
    drawTray: drawTray, drawHole: drawHole, drawBrick: drawBrick, drawTile: drawTile,
    foxEdgeSegments: foxEdgeSegments, drawFoxEdge: drawFoxEdge,
    drawRing: drawRing, drawHopDot: drawHopDot
  };
});
