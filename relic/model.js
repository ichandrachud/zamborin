/* ============================================================
   RELIC · the model
   ------------------------------------------------------------
   Headless. No DOM, no canvas, no timing, no colour decisions
   about chrome. play.js draws what this returns and (milestone 2)
   tune-gate.mjs measures it, so the gate cannot end up measuring
   a different game from the one that ships. Ballast's phys/rules
   split is the precedent.

   THE ONE IDEA IN THIS FILE
   -------------------------
   The brief's §3.2 cutter recursively half-plane-splits the
   bounding box, which produces pieces of DIFFERENT shapes. That
   fights §0 ("the game must accept a wrong placement") and §2.2
   ("shape must be uninformative") on three fronts at once:

     - a piece of a given shape only fits some slots, so geometry
       starts telling you where it goes;
     - "seats if it fits" then needs a shape tolerance, and a
       tolerance is a correctness oracle with a soft edge;
     - a piece that does not exactly fill its hole leaves slivers
       of the near-black slot showing, which is a second oracle.

   So the cut here is a LATTICE whose cells are all exactly
   congruent AND exactly 4-fold rotationally symmetric. Seams are
   wavy rather than straight, so the tiling does not read as a
   grid, but every piece fits every slot in all four rotations,
   exactly, with no tolerance and no residue.

   Why that is true, since it is the load-bearing claim:

     cell (i,j) spans [i*cs,(i+1)*cs] x [j*cs,(j+1)*cs] and the
     seams are  y = j*cs + g(x)  and  x = i*cs - g(y),  where g is
     any sum of sines with period cs. Then g(0) = g(cs) = 0, so
     corners land on the lattice; g(cs-t) = -g(t), so a quarter
     turn about the cell centre maps bottom->right->top->left
     onto themselves. Sampling every edge at the same parameters
     makes a 90 degree turn a CYCLIC SHIFT of the vertex list by
     one edge's worth of points, which is exact rather than
     nearly exact. `selfTest()` at the bottom asserts it.

   Shape therefore carries zero bits. The only thing that can
   tell you where a piece goes is the colour sequence across its
   edge, which is the mechanic the brief exists to protect.
   ============================================================ */
(function (root) {
  'use strict';

  /* ---------- RNG ----------
     mulberry32. Same seed, same level, exactly — acceptance
     criterion 4. */
  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rint = (rng, n) => Math.floor(rng() * n) % n;
  const rrange = (rng, a, b) => a + rng() * (b - a);

  /* ---------- POLYGON HELPERS ---------- */
  function bez(p0, c1, c2, p1, t) {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0],
            a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1]];
  }

  /* spec is anchor-then-two-controls triples, closing back to the
     first anchor: [P0,C1,C2, P1,C3,C4, P2,C5,C6, ...]. */
  function pathPoly(spec, per) {
    const n = per || 26;
    const out = [];
    const segs = spec.length / 3;
    for (let s = 0; s < segs; s++) {
      const p0 = spec[s * 3], c1 = spec[s * 3 + 1], c2 = spec[s * 3 + 2];
      const p1 = spec[(s * 3 + 3) % spec.length];
      for (let i = 0; i < n; i++) out.push(bez(p0, c1, c2, p1, i / n));
    }
    return out;
  }

  function mirrorPoly(poly, axisX) {
    const out = new Array(poly.length);
    for (let i = 0; i < poly.length; i++) out[i] = [2 * axisX - poly[i][0], poly[i][1]];
    return out;
  }

  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  function polyBounds(poly) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of poly) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
    }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }

  function polyCentroid(poly) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
      a += f; cx += (poly[j][0] + poly[i][0]) * f; cy += (poly[j][1] + poly[i][1]) * f;
    }
    a *= 0.5;
    if (Math.abs(a) < 1e-9) { const b = polyBounds(poly); return [b.x0 + b.w / 2, b.y0 + b.h / 2]; }
    return [cx / (6 * a), cy / (6 * a)];
  }

  /* ---------- THE FIGURE CATALOGUE ----------
     Milestone 1 authors ONE. The catalogue (~100) is milestone 3,
     and it is the long pole of the project, not this file.

     Figure space is a fixed 1000 x 1180 box. Wings are authored on
     the right and mirrored, so the figure is symmetric to the pixel
     and a cut that crosses the midline reads honestly. */
  const FIG_W = 1000, FIG_H = 1180, MID = 500;

  function bodyPoly() {
    /* A spindle from the head down to the tail. It is in the
       silhouette so no cut can open a hole down the middle, and it
       is ALSO drawn as the overlay, which is what hides the point
       where four cuts converge. */
    const top = 250, bot = 1032, N = 44;
    const hw = (t) => 9 + 27 * Math.exp(-Math.pow((t - 0.17) / 0.42, 2));
    const left = [], right = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, y = top + t * (bot - top), w = hw(t);
      right.push([MID + w, y]); left.push([MID - w, y]);
    }
    return right.concat(left.reverse());
  }

  const MOTH = (() => {
    const upperR = pathPoly([
      [516, 300], [612, 72], [834, 50],
      [938, 172], [986, 266], [972, 404],
      [898, 500], [798, 578], [640, 596],
      [524, 584], [508, 506], [508, 384],
    ], 24);
    const lowerR = pathPoly([
      [522, 604], [664, 610], [766, 666],
      [786, 764], [806, 884], [704, 972],
      [594, 984], [550, 988], [526, 944],
      [518, 864], [514, 764], [516, 662],
    ], 24);
    const body = bodyPoly();
    return {
      slug: 'moth',
      name: 'Moth',
      parts: [upperR, mirrorPoly(upperR, MID), lowerR, mirrorPoly(lowerR, MID), body],
      body: body,
      /* Drawn over the top of every piece. Figure coordinates. */
      overlay: {
        headY: 262, headR: 34,
        antenna: [[MID + 16, 268], [MID + 74, 190], [MID + 140, 128], [MID + 178, 96]],
        segments: 13, segTop: 300, segBot: 1010,
      },
    };
  })();

  const FIGURES = { moth: MOTH };

  function inFigure(fig, x, y) {
    for (let i = 0; i < fig.parts.length; i++) if (pointInPoly(x, y, fig.parts[i])) return true;
    return false;
  }

  /* ---------- THE BAND FIELD ----------
     Ribbons across the WHOLE bounding box, in figure coordinates.
     A piece carries whatever part of the field falls inside it, so
     a correctly placed piece continues its neighbours and a wrongly
     placed one jogs.

     s(x,y) is the band coordinate. It is explicit in y, which is
     what lets the renderer trace a boundary as a polyline instead
     of marching pixels:

       s = (y - yc) cos0 + (x - xc) sin0 + w(x)
       y = yc + (s - (x - xc) sin0 - w(x)) / cos0

     w(x) is two sine harmonics. The CURVATURE is what makes a
     sideways misplacement visible: with straight horizontal bands
     every cell in a row carries the same stripes and a piece could
     sit anywhere along it. Curvature is difficulty dial 1 in the
     brief wearing different clothes. */

  /* Game art, not chrome. Every colour band is separated from its
     neighbours by a dark one, so the sequence alternates light and
     dark at maximum lightness contrast: that is the second channel
     a deuteranope reads, and it is structural rather than bolted on
     (brief section 7, design system section 7). */
  /* MEASURED, not chosen. tune-colour.mjs sweeps candidates through a
     null-tested Vienot deuteranopia and protanopia simulation and reports the
     CLOSEST pair, which is what a palette is actually worth. Two constraints
     bind at once:

       - every colour must clear 3:1 against the ink separator it always sits
         next to, which puts a floor on how dark a band may be and therefore
         caps the lightness spread;
       - the six must stay apart under both dichromacies.

     The sixth colour is the one that satisfies the first without making the
     second any worse: with `teal` in, the worst pair is still green/rust at a
     distance of 115, exactly as it is for the five-colour set. Nine other
     candidates were measured and every one of them was worse or failed the
     ink floor. Run `node relic/tune-colour.mjs` before changing any of it.

     These are the brief's colours in spirit rather than to the digit. The
     brief named --brand #B0E0E6, but the design system reserves --brand for
     the wordmark and only the wordmark, and #FFD23F/#C24A39 measured too close
     to their neighbours once every band had to clear the separator. */
  /* #241E30, darkened from #2B2438 after measuring the PAINTED pixel rather
     than the source hex. The whole-figure light spreads every band over a
     range, and at the unlucky end of it the ink/teal pair measured 2.93:1
     against a 3:1 bar for graphical objects. Lightening the teal instead was
     measured and rejected: it closes the gap to violet under deuteranopia,
     which trades one accessibility number for a worse one. */
  const INK = '#241E30';            // the dark separator ribbon
  const HUES = [
    { id: 'chalk',  hex: '#D8EEF3' },   // relL 0.822
    { id: 'sun',    hex: '#F5C63C' },   //      0.601
    { id: 'green',  hex: '#3DAE7C' },   //      0.327
    { id: 'violet', hex: '#9B7FE8' },   //      0.280
    { id: 'rust',   hex: '#D9573F' },   //      0.219
    { id: 'teal',   hex: '#1A7FA0' },   //      0.164
  ];

  function makeBandField(rng, opts) {
    const o = opts || {};
    /* Curvature is a two-sided constraint and both sides are real.

       TOO LITTLE and every cell in a row carries the same stripes, so a piece
       could sit anywhere along it and a sideways misplacement is invisible:
       the rule stops carrying the game. TOO MUCH and the ribbons stop reading
       as bands flowing through a figure and become diagonal stripes; the first
       build ran to a 40 degree maximum slope and looked like bunting.

       These constants hold the typical maximum slope near 19 degrees and the
       band shift across one cell near half a colour band, which is plainly
       visible. `bandShiftPerCell` in the level stats reports the real number
       for the level that was actually built. */
    /* A tilt FLOOR as well as a ceiling. With theta near zero the only thing
       moving the field sideways is the curvature, and where the curvature
       happens to be flat a piece slid one cell along its row looks correct.
       A guaranteed tilt puts a floor under the shift everywhere; the
       harmonics on top of it are what stop a DIAGONAL slip from cancelling
       the tilt exactly. */
    const theta = (rng() < 0.5 ? -1 : 1) * rrange(rng, 0.055, 0.115);
    const cos = Math.cos(theta), sin = Math.sin(theta);
    const xc = FIG_W / 2, yc = FIG_H / 2;
    const a1 = rrange(rng, 30, 48) * (o.curve == null ? 1 : o.curve);
    const a2 = rrange(rng, 9, 17) * (o.curve == null ? 1 : o.curve);
    const k1 = rrange(rng, 1.1, 1.7) * Math.PI / FIG_W;
    const k2 = rrange(rng, 2.6, 3.4) * Math.PI / FIG_W;
    const p1 = rng() * Math.PI * 2, p2 = rng() * Math.PI * 2;

    const w = (x) => a1 * Math.sin(k1 * (x - xc) + p1) + a2 * Math.sin(k2 * (x - xc) + p2);
    const sAt = (x, y) => (y - yc) * cos + (x - xc) * sin + w(x);
    const yOf = (s, x) => yc + (s - (x - xc) * sin - w(x)) / cos;

    // s across the whole box, with room for the wave.
    let s0 = Infinity, s1 = -Infinity;
    for (const c of [[0, 0], [FIG_W, 0], [0, FIG_H], [FIG_W, FIG_H]]) {
      const s = sAt(c[0], c[1]);
      if (s < s0) s0 = s; if (s > s1) s1 = s;
    }
    const amp = a1 + a2 + 12;
    s0 -= amp; s1 += amp;

    /* Walk from s0 to s1 laying colour, ink, colour, ink. Widths
       vary so the ribbons are not a rule-ruled page. Adjacent hues
       never repeat. */
    /* Hues come off a SHUFFLED CYCLE, not an independent draw with a
       no-adjacent-repeat guard. The guard was not enough: it let a hue come
       back one band later, and a real level came out with teal four times and
       chalk four times out of thirteen, no green at all, and two tray pieces
       that were near-duplicates of each other. A cycle guarantees that any six
       consecutive colour bands are six different colours, so no piece can
       carry the same sequence as another by accident. The join between cycles
       is checked so a hue cannot straddle it. */
    const bounds = [s0];
    const bands = [];
    let bag = [], prev = -1, cur = s0;
    const nextHue = () => {
      if (!bag.length) {
        bag = HUES.map((_, i) => i);
        for (let i = bag.length - 1; i > 0; i--) {
          const k = rint(rng, i + 1); const t = bag[i]; bag[i] = bag[k]; bag[k] = t;
        }
        if (bag[0] === prev && bag.length > 1) { bag[0] = bag[1]; bag[1] = prev; }
      }
      prev = bag.shift();
      return prev;
    };
    let guard = 0;
    while (cur < s1 && guard++ < 96) {
      const h = nextHue();
      /* Band width against CELL width is the real ratio, because what a piece
         is worth is how many band boundaries cross it. At 96 to 168 against a
         238 cell most pieces carried a single boundary and the edges said
         almost nothing. These widths put two or three boundaries across a
         typical piece. */
      cur += rrange(rng, 68, 116) * (o.wide || 1);
      bounds.push(cur); bands.push({ hue: HUES[h].id, hex: HUES[h].hex, ink: false });
      cur += rrange(rng, 19, 31) * (o.wide || 1);
      bounds.push(cur); bands.push({ hue: 'ink', hex: INK, ink: true });
    }

    const bandAt = (x, y) => {
      const s = sAt(x, y);
      // bounds is sorted; a linear scan over ~20 is cheaper than a
      // binary search that has to be right.
      for (let i = 1; i < bounds.length; i++) if (s < bounds[i]) return i - 1;
      return bands.length - 1;
    };

    return {
      theta, cos, sin, xc, yc, a1, a2, k1, k2, p1, p2,
      bounds, bands, sAt, yOf, bandAt,
      count: bands.length,
      colourCount: bands.filter(b => !b.ink).length,
    };
  }

  /* ---------- THE CUT ----------
     g(t) is the seam wave. Any sum of sines with period cs keeps
     both properties the lattice depends on (see the header), so
     three harmonics are free: the seams look hand-broken and the
     pieces stay exactly congruent. */
  function makeWave(rng, cs) {
    /* Amplitudes are a LOOK decision, and the first pass got it wrong in a way
       worth writing down: at 0.055 to 0.095 of a cell on the fundamental the
       cells came out as four-pointed stars and the figure read as a jigsaw
       with tabs, which is precisely the thing this game is not. A break in a
       solid object wanders by a few per cent of its length, not by a sixth.
       Total deviation here stays under about 9 per cent of a cell. */
    const h = [
      rrange(rng, 0.030, 0.055) * cs * (rng() < 0.5 ? -1 : 1),
      rrange(rng, 0.010, 0.022) * cs * (rng() < 0.5 ? -1 : 1),
      rrange(rng, 0.004, 0.010) * cs * (rng() < 0.5 ? -1 : 1),
    ];
    const k = 2 * Math.PI / cs;
    return (t) => h[0] * Math.sin(k * t) + h[1] * Math.sin(2 * k * t) + h[2] * Math.sin(3 * k * t);
  }

  const EDGE_STEPS = 14;      // samples per cell edge; 4-fold shift is by this

  /* The cell polygon in figure coordinates. Vertex 0 is the cell's
     bottom-left lattice corner and the list runs bottom, right,
     top, left, EDGE_STEPS points each. */
  function cellPoly(i, j, cs, ox, oy, g) {
    const x0 = ox + i * cs, y0 = oy + j * cs, N = EDGE_STEPS;
    const P = [];
    for (let t = 0; t < N; t++) { const s = t * cs / N; P.push([x0 + s, y0 + g(s)]); }
    for (let t = 0; t < N; t++) { const s = t * cs / N; P.push([x0 + cs - g(s), y0 + s]); }
    for (let t = 0; t < N; t++) { const s = t * cs / N; P.push([x0 + cs - s, y0 + cs - g(s)]); }
    for (let t = 0; t < N; t++) { const s = t * cs / N; P.push([x0 + g(s), y0 + cs - s]); }
    return P;
  }

  /* A quarter turn is a cyclic shift of the vertex list by one
     edge's worth of points, exactly. The turn is by +r*90 degrees
     under the matrix [[cos,-sin],[sin,cos]], which with figure y
     running DOWN the screen is r quarter turns clockwise. */
  function rotatedPoly(poly, r) {
    const n = poly.length, k = (((r % 4) + 4) % 4) * EDGE_STEPS;
    if (!k) return poly;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = poly[(i + k) % n];
    return out;
  }

  /* How far the field slides sideways over one cell, and how steep it ever
     gets. Both are measured across the figure rather than assumed from the
     constants, because the two harmonics can reinforce or cancel. */
  function bandShift(field, cs) {
    let worst = 0, total = 0, n = 0;
    for (let x = 0; x + cs <= FIG_W; x += cs / 4) {
      const d = Math.abs(field.sAt(x + cs, 0) - field.sAt(x, 0));
      total += d; n++; if (d > worst) worst = d;
    }
    return n ? total / n : 0;
  }
  function maxSlope(field) {
    let m = 0;
    for (let x = 0; x <= FIG_W; x += 8) {
      const d = Math.abs(field.yOf(0, x + 1) - field.yOf(0, x));
      if (d > m) m = d;
    }
    return Math.atan(m) * 180 / Math.PI;
  }

  /* ---------- LEVEL ---------- */
  const TUNE = {
    CELLS_ACROSS: 4.2,     // figure widths; sets the piece size
    SHOW_MIN: 0.012,       // below this a cell shows nothing; above it the cell
                           // exists so that the silhouette is fully tiled and
                           // no sliver of backing plate shows through
    LIFT_MIN: 0.72,        // only well-covered cells go to the tray. This is an
                           // INFORMATION floor, not a geometric one: a piece
                           // showing a fifth of its bands cannot be checked
    LIFT_BANDS: 3,         // a piece inside one band says nothing; demand a
                           // readable sequence
    SAMPLE: 15,            // coverage grid per cell, 15 x 15
    /* A level is not merely required to have ONE answer, it is required to
       have one that is visibly the answer. A wrong placement agreeing on 97
       per cent of the samples the player can see is unique on paper and a
       guess in the hand. This is the fraction of visible edge samples the
       best WRONG placement is allowed to get right. */
    MAX_AGREE: 0.88,
  };

  function makeLevel(opts) {
    const o = opts || {};
    const seed = (o.seed == null ? 1 : o.seed) >>> 0;
    const rng = makeRng(seed);
    const fig = FIGURES[o.figure || 'moth'];
    const lift = o.lift == null ? 4 : o.lift;
    const adjacentOk = !!o.adjacentOk;

    const cs = FIG_W / (o.cellsAcross || TUNE.CELLS_ACROSS);
    const g = makeWave(rng, cs);

    /* Offset the lattice so the figure is not centred on it. Whole cells of
       empty background at the edges are wasted slots. */
    const ox = -cs * rng(), oy = -cs * rng();
    const i0 = Math.floor((0 - ox) / cs) - 1, i1 = Math.ceil((FIG_W - ox) / cs) + 1;
    const j0 = Math.floor((0 - oy) / cs) - 1, j1 = Math.ceil((FIG_H - oy) / cs) + 1;

    /* The cut and the coverage do not depend on the band field, so they are
       measured ONCE and the visible sample points kept. A field re-roll below
       then costs a re-bucket of those points rather than a fresh scan. */
    const S = TUNE.SAMPLE;
    const cells = [];
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const poly = cellPoly(i, j, cs, ox, oy, g);
        const b = polyBounds(poly);
        let inCell = 0;
        const pts = [];
        for (let sy = 0; sy < S; sy++) {
          for (let sx = 0; sx < S; sx++) {
            const x = b.x0 + (sx + 0.5) * b.w / S, y = b.y0 + (sy + 0.5) * b.h / S;
            if (!pointInPoly(x, y, poly)) continue;
            inCell++;
            if (inFigure(fig, x, y)) pts.push([x, y]);
          }
        }
        const cover = inCell ? pts.length / inCell : 0;
        if (cover < TUNE.SHOW_MIN) continue;
        cells.push({
          id: cells.length, i, j, poly, pts,
          cx: ox + (i + 0.5) * cs, cy: oy + (j + 0.5) * cs,
          cover, bands: 0,
        });
      }
    }
    const byId = new Map(cells.map(c => [c.i + ',' + c.j, c]));

    const base = {
      seed, figure: fig, field: null, cells, cs, ox, oy, wave: g, byId,
      W: FIG_W, H: FIG_H, holes: [], pieces: [],
    };

    /* CHOOSE, THEN VERIFY, THEN CHOOSE AGAIN, THEN CHANGE THE FIELD.

       The construction argument says a piece belongs where it came from, and
       it does. What it does not say is that no OTHER piece also fits. About
       one level in twenty comes out with a straight swap between two
       neighbours whose band content happens to be locally identical, and on
       that level the player is being asked to guess. A level is also no good
       if its best wrong answer is only barely wrong: unique on paper and a
       coin toss in the hand.

       So: redraw the lift set, and when the pool is too small for that to
       find anything new, redraw the BAND FIELD, which is the brief's own
       remedy in section 4 step 5. Everything is kept and the best is used, so
       an exhausted search degrades to the least bad level rather than to
       whatever the last attempt happened to be.

       That "keep the best" is not decoration. The first version of this loop
       kept the last attempt, and 14 levels in 200 shipped with an outright
       ambiguity while the loop reported it had tried. */
    let best = null, fieldRolls = 0, totalAttempts = 0;
    for (fieldRolls = 1; fieldRolls <= 5; fieldRolls++) {
      const field = makeBandField(rng, o.field);
      base.field = field;
      for (const c of cells) {
        const seen = new Set();
        for (const pt of c.pts) seen.add(field.bandAt(pt[0], pt[1]));
        c.bands = seen.size;
      }
      const pool = cells.filter(c => c.cover >= TUNE.LIFT_MIN && c.bands >= TUNE.LIFT_BANDS);
      if (!pool.length) continue;

      for (let a = 0; a < 8; a++) {
        totalAttempts++;
        const shuffled = pool.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
          const k = rint(rng, i + 1); const t = shuffled[i]; shuffled[i] = shuffled[k]; shuffled[k] = t;
        }
        const chosen = [];
        const touching = (c) => chosen.some(d => Math.abs(d.i - c.i) + Math.abs(d.j - c.j) === 1);
        for (const pass of [0, 1]) {
          for (const c of shuffled) {
            if (chosen.length >= lift) break;
            if (chosen.includes(c)) continue;
            /* Pass 0 keeps holes apart, so every hole has four placed
               neighbours and the opening move is always forced. Pass 1 is the
               fallback when the figure is too small for that. */
            if (pass === 0 && !adjacentOk && touching(c)) continue;
            chosen.push(c);
          }
        }
        for (const c of cells) c.hole = false;
        for (const c of chosen) c.hole = true;
        const holes = chosen.map(c => c.id);
        const pieces = chosen.map((c, n) => ({
          id: n,
          home: c.id,             // the slot it belongs in, at rot 0
          rot: 1 + rint(rng, 3),  // "turned the wrong way round" — never already right
          at: null,               // slot it currently occupies, or null for the tray
        }));
        base.holes = holes; base.pieces = pieces;
        const v = checkUnique(base);
        const score = v.unique ? v.worstAgreement : 2;
        if (!best || score < best.score) {
          best = { score, field, holes, pieces, verdict: v, pool: pool.length,
                   bands: cells.map(c => c.bands),
                   rolls: fieldRolls, attempt: totalAttempts };
        }
        if (v.unique && v.worstAgreement <= TUNE.MAX_AGREE) { a = 99; fieldRolls = 99; }
      }
    }

    // Restore the winner: the loop left the LAST attempt in place, not the best.
    base.field = best.field;
    base.holes = best.holes;
    base.pieces = best.pieces.map(p => ({ id: p.id, home: p.home, rot: p.rot, at: null }));
    for (let i = 0; i < cells.length; i++) { cells[i].bands = best.bands[i]; cells[i].hole = false; }
    for (const h of base.holes) cells[h].hole = true;

    const v = best.verdict;
    base.stats = {
      cells: cells.length,
      pieces: cells.filter(c => c.cover >= 0.12).length,
      /* How far the band pattern moves across one cell, in s-units, against a
         colour band roughly 130 wide. This is the number that decides whether
         a sideways misplacement is VISIBLE. */
      bandShiftPerCell: Math.round(bandShift(best.field, cs)),
      maxSlopeDeg: Math.round(maxSlope(best.field) * 10) / 10,
      liftable: best.pool,
      lifted: base.holes.length,
      adjacentHoles: base.holes.filter(h => base.holes.some(k => k !== h &&
        Math.abs(cells[k].i - cells[h].i) + Math.abs(cells[k].j - cells[h].j) === 1)).length / 2,
      bands: best.field.count, colours: best.field.colourCount,
      attempts: best.attempt, fieldRolls: best.rolls,
      unique: v.unique,
      clear: v.unique && v.worstAgreement <= TUNE.MAX_AGREE,
      worstAgreement: v.worstAgreement,
    };
    return base;
  }

  /* ---------- READING AN EDGE ----------
     The constraint the whole game rests on, and what milestone 2's
     Solver A will propagate over. Given a placement (piece p, slot
     s, rotation r) the content is the field sampled at the point
     the piece came FROM, so an edge reads as a colour sequence.

     `edgeSeq` walks one side of a slot and returns the band ids the
     content shows there. Two neighbours agree when the sequences
     read along the shared seam are equal. */
  function contentPoint(level, slotCell, srcCell, r, x, y) {
    // Undo slot placement: local offset from the slot centre...
    const dx = x - slotCell.cx, dy = y - slotCell.cy;
    // ...turn it back by r quarter turns...
    let ux = dx, uy = dy;
    for (let n = 0; n < ((r % 4) + 4) % 4; n++) { const t = ux; ux = uy; uy = -t; }
    // ...and read the field where the piece actually came from.
    return [srcCell.cx + ux, srcCell.cy + uy];
  }

  function edgeSeq(level, slotCell, srcCell, r, side, n) {
    const N = n || 9, P = slotCell.poly, E = EDGE_STEPS;
    const out = [];
    for (let k = 0; k < N; k++) {
      const t = (k + 0.5) / N * E;
      const a = P[(side * E + Math.floor(t)) % P.length];
      const b = P[(side * E + Math.floor(t) + 1) % P.length];
      const f = t - Math.floor(t);
      const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
      // step a hair inside the piece so the sample is not on the seam
      const nx = slotCell.cx - x, ny = slotCell.cy - y;
      const L = Math.hypot(nx, ny) || 1;
      const p = contentPoint(level, slotCell, srcCell, r, x + nx / L * 3, y + ny / L * 3);
      out.push(level.field.bandAt(p[0], p[1]));
    }
    return out;
  }

  /* ---------- IS THE LEVEL FAIR ----------
     The construction argument says a piece belongs where it came from. That is
     a hypothesis, not a proof, and this repo has been burned by exactly that
     before: Prism's pruned solver reported unique solutions and the strict one
     found second answers.

     So this is exhaustive rather than clever. For every hole, every piece and
     every one of the four turns, read the band sequence the content would show
     just inside each of the four edges, against what the piece that BELONGS
     there would show. A wrong placement that agrees on every visible sample is
     one a player cannot tell from the right answer, and a level containing one
     is unfair however elegant the theory is.

     Samples outside the silhouette are dropped: the player cannot see them, so
     they cannot carry the rule. An edge with no visible samples at all counts
     as no evidence, which is the strict reading. */
  function checkUnique(level, samples) {
    const N = samples || 9;
    const amb = [];
    let worst = 0;
    for (const hid of level.holes) {
      const H = level.cells[hid];
      // which samples on which sides are actually visible
      const vis = [];
      for (let side = 0; side < 4; side++) {
        const P = H.poly, E = EDGE_STEPS, keep = [];
        for (let k = 0; k < N; k++) {
          const t = (k + 0.5) / N * E;
          const a = P[(side * E + Math.floor(t)) % P.length];
          const b = P[(side * E + Math.floor(t) + 1) % P.length];
          const f = t - Math.floor(t);
          const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
          const nx = H.cx - x, ny = H.cy - y, L = Math.hypot(nx, ny) || 1;
          keep.push(inFigure(level.figure, x + nx / L * 3, y + ny / L * 3));
        }
        vis.push(keep);
      }
      const truth = [0, 1, 2, 3].map(side => edgeSeq(level, H, H, 0, side, N));
      for (const p of level.pieces) {
        const src = level.cells[p.home];
        for (let r = 0; r < 4; r++) {
          if (p.home === hid && r === 0) continue;         // the right answer
          let same = 0, seen = 0;
          for (let side = 0; side < 4; side++) {
            const got = edgeSeq(level, H, src, r, side, N);
            for (let k = 0; k < N; k++) {
              if (!vis[side][k]) continue;
              seen++; if (got[k] === truth[side][k]) same++;
            }
          }
          const agree = seen ? same / seen : 1;
          if (agree > worst) worst = agree;
          if (agree >= 0.999) amb.push({ hole: hid, piece: p.id, rot: r, seen: seen });
        }
      }
    }
    return { unique: amb.length === 0, worstAgreement: +worst.toFixed(3), ambiguous: amb };
  }

  /* ---------- SELF TEST ----------
     The congruence claim is load-bearing, so it is asserted rather
     than believed. Returns { ok, ... }; play.js runs it once behind
     the debug handle and tune-gate.mjs runs it before anything else. */
  function selfTest() {
    const rng = makeRng(7);
    const cs = 240, g = makeWave(rng, cs);
    const A = cellPoly(3, 5, cs, -11, 7, g);
    const B = cellPoly(9, 2, cs, -11, 7, g);
    const ca = polyCentroid(A), cb = polyCentroid(B);

    // 1. every cell is the same shape, by translation
    let congruent = 0;
    for (let i = 0; i < A.length; i++) {
      const dx = (A[i][0] - ca[0]) - (B[i][0] - cb[0]);
      const dy = (A[i][1] - ca[1]) - (B[i][1] - cb[1]);
      congruent = Math.max(congruent, Math.hypot(dx, dy));
    }

    // 2. a quarter turn about the centre lands on the cell itself
    let fourfold = 0;
    for (let r = 1; r < 4; r++) {
      const R = rotatedPoly(A, r);
      const a = r * Math.PI / 2, cosA = Math.cos(a), sinA = Math.sin(a);
      for (let i = 0; i < A.length; i++) {
        const dx = A[i][0] - ca[0], dy = A[i][1] - ca[1];
        const rx = ca[0] + dx * cosA - dy * sinA, ry = ca[1] + dx * sinA + dy * cosA;
        fourfold = Math.max(fourfold, Math.hypot(rx - R[i][0], ry - R[i][1]));
      }
    }

    // 3. same seed, same level
    const l1 = makeLevel({ seed: 42 }), l2 = makeLevel({ seed: 42 });
    const same = JSON.stringify(l1.pieces) === JSON.stringify(l2.pieces) &&
                 l1.cells.length === l2.cells.length &&
                 Math.abs(l1.cells[0].poly[3][0] - l2.cells[0].poly[3][0]) < 1e-12;

    return {
      ok: congruent < 1e-9 && fourfold < 1e-9 && same,
      congruentMaxPx: congruent, fourfoldMaxPx: fourfold, deterministic: same,
    };
  }

  const API = {
    makeRng, makeLevel, makeBandField, makeWave, cellPoly, rotatedPoly,
    pointInPoly, polyBounds, polyCentroid, pathPoly, inFigure,
    edgeSeq, contentPoint, selfTest, checkUnique,
    FIGURES, HUES, INK, TUNE, EDGE_STEPS, FIG_W, FIG_H,
  };
  root.RelicModel = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
