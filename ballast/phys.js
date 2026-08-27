/* ============================================================
   BALLAST · physics solver
   ------------------------------------------------------------
   Circle-only rigid body solver for a pile of merging pieces
   inside a vessel that hangs from a pivot and rotates.

   Loaded as a plain script in the browser (sets BallastPhys on
   the global) and eval'd by the Node harnesses. No DOM, no
   Math.random, no timers: everything here is a pure function of
   the state plus the seeded PRNG passed in.
   ============================================================ */
(function (root) {
  'use strict';

  /* ---------- Tunables. Every constant lives here so the gate
     can sweep them. Do not scatter these. ---------- */
  const PHYS = {
    DT: 1 / 120,          // fixed timestep. Never step by frame delta.
    MAX_SUBSTEPS: 8,      // then drop the remainder
    GRAVITY: 2400,        // px/s^2, world coords

    VEL_ITERS: 8,         // sequential impulse passes
    POS_ITERS: 4,         // position-correction passes
    BAUMGARTE: 0.2,
    SLOP: 0.5,            // px of allowed overlap
    MAX_BIAS_V: 240,      // px/s. BAUMGARTE/DT is 24, so a 20px overlap would
                          // otherwise ask for 468px/s of separation: a launch.

    RESTITUTION: 0.05,    // heavy glass, not superballs
    FRICTION: 0.4,
    DENSITY: 0.002,       // mass = DENSITY * r^2 (2D: area, not volume)

    SLEEP_V: 0.4,         // px/s
    SLEEP_TIME: 0.5,      // s below SLEEP_V before sleeping
    SLEEP_OMEGA: 0.002,   // the vessel must be this close to stationary before
                          // the pile may sleep. A pile asleep in a still-turning
                          // vessel is frozen in WORLD space while the walls sweep
                          // through it; it wakes deeply penetrated and is fired
                          // out at hundreds of px/s.
    WAKE_SWEEP: 0.25,     // and it wakes once the rim has since travelled this
                          // fraction of SLOP. An angle threshold cannot do this
                          // job: the same tiny rate is harmless for a moment and
                          // ruinous held for a minute.
    REST_SWEEP: 0.5,      // the tilt spring stops integrating once the pile is
                          // asleep and the rim is within this fraction of SLOP
                          // of its target. See stepTilt: without it the pair
                          // sits in a limit cycle.

    MERGE_V: 90,          // relative speed below which two of a tier fuse
    MERGE_KICK: 90,       // outward nudge given to the neighbours of a merge
    BODY_CAP: 55,
    MAX_R: 60,
    CELL: 120,            // uniform grid cell = 2 * MAX_R

    WARM_START: true,

    /* ---- the vessel's balance ----
       'pedestal' stands the vessel ON a base. While the combined centre
       of mass sits over that base it is solid; once the com crosses an
       edge the gravity torque REVERSES and leaning tips more weight
       further out, which leans it more. That runaway is the whole
       point: a threshold you can see coming and cannot come back from.

       'hang' is the original brief: a pivot ABOVE the contents, which
       is a pendulum, which is stable by construction. It cannot fall
       over however badly you load it, so balance can never be more
       than a nuisance. Kept only so the two can be measured against
       each other. */
    TILT_MODEL: 'pedestal',
    /* The bowl has a shallow curved underside of radius BASE_R and rests
       on a DOME of radius GROUND_R. A body rocking on a convex surface
       behaves like one on flat ground with

           Reff = BASE_R * GROUND_R / (BASE_R + GROUND_R)

       which is why the ground is domed rather than flat: it lets the
       bowl's own underside be far flatter for the same feel, and the
       bowl's bottom is only as thick as its underside is deep. Flat
       ground (GROUND_R infinite) gives Reff = BASE_R and a bottom 88px
       thick; this pairing gives the same Reff with 28px.

       BASE_R must stay LARGER than GROUND_R, or the bowl is more curved
       than the hill and touches it at two points instead of rocking. */
    BASE_R: 600,
    GROUND_R: 228,        /* Reff comes out at 165. Swept over 26 seeds: careless
                             play topples 27% of runs and leans to 25 degrees,
                             careful play topples 0% and sits at 8. Wider domes
                             stop the bowl ever going over (309 gives 0%), tighter
                             ones make it a coin flip (200 gives 65%/15%). */
    SUPPORT_HW: 22,       // half-width of the STOPS. THE dial: wide is forgiving,
                          // narrow is a knife edge, and somewhere between is a game.
                          // PROVISIONAL, from a 14-seed sweep: careless play goes
                          // over 43% of the time here and careful play 0%. Medians
                          // of a heavy-tailed score are far too noisy at 14 seeds to
                          // CHOOSE a value; that is the 300-seed gate's job.
    PEDESTAL_Y: 596,      // local y of the summit of the dome. Sits just under the
                          // bowl's floor now: the dome falls away on both sides,
                          // so the corners get their clearance from the GROUND
                          // curving down rather than from a tall thick foot.
    VESSEL_MASS: 12,      // the empty vessel's own mass, in orb-mass units
    VESSEL_COM_Y: 545,    // and where it sits: LOW, like a real pot. This is what
                          // makes an empty vessel stable and a full one twitchy,
                          // with no difficulty curve needing to be authored.
    VESSEL_RG: 150,       // radius of gyration about its own centre
    TILT_DAMP: 4.0,       // a rocking pot settles; it does not ring
    TOPPLE_ANGLE: 0.62,   // 35 deg. Past here it is going over.
    LAYOUT_THETA: 0.13,   /* The working range the frame is SIZED for, and it is
                             a direct trade against how big the vessel can be
                             drawn: reserving swing room for 0.20 rad costs the
                             resting vessel 20% of its width. Careful play stays
                             under 0.14, so the frame is sized for that and a
                             hard lean is allowed to overflow. A full topple
                             overflows a lot, and is allowed to: the run has
                             ended and the card is about to cover it. */

    K_TILT: 0.003,        // 'hang' model only: rad per px of com.x offset
    THETA_MAX: 0.18,      // rad (10.3 deg). NOT a free number: a vessel hanging
                          // 158 above its rim and 410 deep sweeps its bottom
                          // corner to +-(150cos+568sin), so 0.38 rad would need
                          // a band 700 units wide to swing in and force the
                          // vessel down to half size on a phone. The layout
                          // derives itself from this, so the gate may move it,
                          // but moving it up costs vessel size directly.
    OMEGA: 6,             // spring rate toward thetaTarget
    ZETA: 1               // critically damped. Undamped is unreadable.
  };

  const TIER_R = [14, 18, 23, 29, 37, 47, 60];

  /* ---------- Seeded PRNG (mulberry32). No Math.random anywhere
     in game logic: the gate, the daily seed and bug repro all
     depend on a run being reproducible from its seed. ---------- */
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- Bodies ---------- */
  let NEXT_ID = 1;
  function makeBody(x, y, tier, r) {
    const rad = r != null ? r : TIER_R[tier];
    const m = PHYS.DENSITY * rad * rad;
    return {
      id: NEXT_ID++,
      x, y, vx: 0, vy: 0,
      r: rad, tier: tier,
      m: m, invM: 1 / m,
      sleeping: false, sleepT: 0,
      resting: false,      // bearing on the vessel; see computeCom
      alive: true
    };
  }

  /* ============================================================
     World
     ============================================================ */
  function World(opts) {
    opts = opts || {};
    this.P = Object.assign({}, PHYS, opts.phys || {});
    this.bodies = [];
    this.acc = 0;

    // Vessel. Local origin is the PIVOT; the interior hangs below it.
    // Rotation is about the pivot, so local coords are the natural
    // frame for both the walls and the centre-of-mass read-out.
    this.pivotX = opts.pivotX || 0;
    this.pivotY = opts.pivotY || 0;
    this.halfW = (opts.interiorW || 300) / 2;
    this.rimY = opts.rimY != null ? opts.rimY : 158;      // local y of the top rim
    this.floorY = this.rimY + (opts.interiorH || 410);    // local y of the floor

    this.theta = 0;
    this.thetaDot = 0;
    this.thetaTarget = 0;
    this.thetaSleepRef = 0;   // theta as of the last time anything slept
    this.allAsleep = false;
    this.atRest = false;
    this.edge = 0;            // which base edge it is currently rocking about
    this.toppled = false;
    /* The read-out that actually matters now: where the combined centre
       of mass sits relative to the edge it would go over. margin is how
       much room is left, in px, and it is what the gauge should show. */
    this.balance = { cx: 0, cy: 0, mass: 0, h: 0, hOverR: 0, eq: 0, stable: true, frac: 0 };
    this.com = { x: 0, y: 0, mass: 0 };

    // Walls as local segments. Circle-vs-segment clamps to the
    // endpoints, which gives the rounded corners for free.
    this.walls = [
      { ax: -this.halfW, ay: this.rimY,  bx: -this.halfW, by: this.floorY, nx:  1, ny: 0 }, // left
      { ax:  this.halfW, ay: this.rimY,  bx:  this.halfW, by: this.floorY, nx: -1, ny: 0 }, // right
      { ax: -this.halfW, ay: this.floorY, bx: this.halfW, by: this.floorY, nx: 0, ny: -1 }  // floor
    ];

    this.grid = new Map();
    this.pairs = [];
    this.contacts = [];
    this.cache = new Map();   // warm-start impulse cache
    this.epoch = 0;
    this.stats = { pairChecks: 0, contacts: 0, substeps: 0, awake: 0 };
  }

  World.prototype.add = function (b) {
    if (this.bodies.length >= this.P.BODY_CAP) return null;
    this.bodies.push(b);
    this.allAsleep = false; this.atRest = false;
    return b;
  };

  World.prototype.remove = function (b) {
    b.alive = false;
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
  };

  /* Wake everything within r of a world point. Needed whenever a
     body is removed: the pile above it is asleep and would
     otherwise hang in the air where its support used to be. */
  World.prototype.wakeArea = function (wx, wy, r) {
    const r2 = r * r;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (!b.sleeping) continue;
      const dx = b.x - wx, dy = b.y - wy, rr = r + b.r;
      if (dx * dx + dy * dy < Math.max(r2, rr * rr)) { b.sleeping = false; b.sleepT = 0; }
    }
  };

  World.prototype.wakeAll = function () {
    for (let i = 0; i < this.bodies.length; i++) { this.bodies[i].sleeping = false; this.bodies[i].sleepT = 0; }
    this.thetaSleepRef = this.theta;
  };

  /* ---------- frame transforms ---------- */
  /* Offset that turns "rotate about the local origin" into "rotate about
     the base edge (edge, PEDESTAL_Y)". At theta 0 it is zero whichever
     edge is selected, so the vessel does not jump as it rocks across. */
  /* Effective rocking radius: the bowl's own curvature combined with the
     ground's. This is the number the torque uses; BASE_R and GROUND_R are
     only how it is built. */
  World.prototype.effR = function () {
    const P = this.P;
    return (P.GROUND_R > 0) ? (P.BASE_R * P.GROUND_R) / (P.BASE_R + P.GROUND_R) : P.BASE_R;
  };

  World.prototype.anchorOffset = function (c, s, out) {
    const P = this.P;
    if (P.TILT_MODEL !== 'pedestal') { out.x = 0; out.y = 0; return out; }
    /* Rolling one curve on another. The bowl's centre of curvature stays
       BASE_R + GROUND_R from the dome's centre, and rolling without slip
       carries it round by phi = BASE_R * theta / (BASE_R + GROUND_R). On
       flat ground this reduces to sliding the centre by BASE_R * theta. */
    const R1 = P.BASE_R, R2 = P.GROUND_R, PY = P.PEDESTAL_Y;
    const phi = R1 * this.theta / (R1 + R2);
    out.x = (R1 + R2) * Math.sin(phi) + (PY - R1) * s;
    out.y = PY + R2 - (R1 + R2) * Math.cos(phi) - (PY - R1) * c;
    return out;
  };
  const _ao = { x: 0, y: 0 };
  World.prototype.toLocal = function (wx, wy, out) {
    const c = Math.cos(this.theta), s = Math.sin(this.theta);
    this.anchorOffset(c, s, _ao);
    const dx = wx - this.pivotX - _ao.x, dy = wy - this.pivotY - _ao.y;
    out.x = dx * c + dy * s;      // R(-theta)
    out.y = -dx * s + dy * c;
    return out;
  };
  World.prototype.toWorld = function (lx, ly, out) {
    const c = Math.cos(this.theta), s = Math.sin(this.theta);
    this.anchorOffset(c, s, _ao);
    out.x = this.pivotX + lx * c - ly * s + _ao.x;
    out.y = this.pivotY + lx * s + ly * c + _ao.y;
    return out;
  };

  /* Centre of mass of the RESTING contents, in vessel-local coords.
     This drives the tilt and it is what the gate's balance bot reads.

     Resting is the whole point and not a detail: a piece in free
     flight is touching nothing and puts no load on the vessel, so
     counting it tips the vessel before the piece has landed. Counting
     every body made the vessel lurch the instant a piece left the
     player's hand, which reads as the vessel reacting to the future.
     A body is bearing on the vessel if it is in a contact, or asleep,
     which is contact that has stopped needing solving. */
  const _tmp = { x: 0, y: 0 };
  World.prototype.computeCom = function () {
    let mx = 0, my = 0, mt = 0;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (!b.sleeping && !b.resting) continue;
      this.toLocal(b.x, b.y, _tmp);
      mx += _tmp.x * b.m; my += _tmp.y * b.m; mt += b.m;
    }
    if (mt > 0) { this.com.x = mx / mt; this.com.y = my / mt; }
    else { this.com.x = 0; this.com.y = 0; }
    this.com.mass = mt;
    return this.com;
  };

  /* ---------- broad phase: uniform grid ---------- */
  World.prototype.buildPairs = function () {
    const cell = this.P.CELL, g = this.grid;
    g.clear();
    const bs = this.bodies;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      const cx0 = Math.floor((b.x - b.r) / cell), cx1 = Math.floor((b.x + b.r) / cell);
      const cy0 = Math.floor((b.y - b.r) / cell), cy1 = Math.floor((b.y + b.r) / cell);
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const k = (cx + 4096) * 8192 + (cy + 4096);
          let arr = g.get(k);
          if (!arr) { arr = []; g.set(k, arr); }
          arr.push(i);
        }
      }
    }
    const pairs = this.pairs; pairs.length = 0;
    const seen = new Set();
    let checks = 0;
    g.forEach(function (arr) {
      for (let a = 0; a < arr.length; a++) {
        for (let b = a + 1; b < arr.length; b++) {
          const i = arr[a], j = arr[b];
          const lo = i < j ? i : j, hi = i < j ? j : i;
          const k = lo * 4096 + hi;
          if (seen.has(k)) continue;
          seen.add(k);
          checks++;
          pairs.push(lo, hi);
        }
      }
    });
    this.stats.pairChecks = checks;
    return pairs;
  };

  /* ---------- islands ----------
     Sleeping is per ISLAND, never per body, and this is not a
     refinement: it is the only version that works.

     Per-body sleeping fails twice over. Wake-on-contact-with-an-
     awake-body means the first body to nod off is woken the same
     substep by a neighbour still drifting at 0.4px/s, so a pile
     never sleeps at all. Treating a sleeper as infinite mass
     instead over-constrains its awake neighbours: a body wedged
     between a sleeping neighbour and the floor is squeezed by two
     constraints that cannot both be satisfied and neither can
     move, so its accumulated impulse ratchets up every substep
     without bound. Measured jn of 1561 where gravity asks for 33.
     The pile reads as perfectly still, then explodes.

     So: bodies that touch are one island, an island with any awake
     member is entirely awake, and an island sleeps only when every
     member has been under the threshold together. A sleeping
     island is skipped whole rather than standing in as geometry. */
  World.prototype.buildIslands = function () {
    const bs = this.bodies, n = bs.length;
    let root = this._root;
    if (!root || root.length < n) { root = this._root = new Int32Array(Math.max(64, n * 2)); }
    for (let i = 0; i < n; i++) { root[i] = i; bs[i]._idx = i; }

    function find(i) { while (root[i] !== i) { root[i] = root[root[i]]; i = root[i]; } return i; }
    function union(a, b) { a = find(a); b = find(b); if (a !== b) root[a > b ? a : b] = a > b ? b : a; }

    // Proximity, not the solver contact list: a sleeping pair still
    // has to be in the same island or the group can never wake as one.
    const pairs = this.buildPairs();
    for (let p = 0; p < pairs.length; p += 2) {
      const A = bs[pairs[p]], B = bs[pairs[p + 1]];
      const dx = B.x - A.x, dy = B.y - A.y, rr = A.r + B.r + 1;
      if (dx * dx + dy * dy < rr * rr) union(pairs[p], pairs[p + 1]);
    }

    const groups = this._groups || (this._groups = new Map());
    groups.clear();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      let g = groups.get(r);
      if (!g) { g = []; groups.set(r, g); }
      g.push(bs[i]);
    }

    // An island with any awake member is awake all through. This is
    // the whole wake path: a dropped piece lands, joins the island it
    // touches, and the island it landed on is awake by definition.
    groups.forEach(function (g) {
      let anyAwake = false;
      for (let i = 0; i < g.length; i++) if (!g[i].sleeping) { anyAwake = true; break; }
      if (!anyAwake) return;
      for (let i = 0; i < g.length; i++) {
        if (g[i].sleeping) { g[i].sleeping = false; g[i].sleepT = 0; }
      }
    });
    return groups;
  };

  /* Island sleep bookkeeping, run after integration. An island
     accrues time only while EVERY member is under the threshold;
     one member above it zeroes the whole group. */
  World.prototype.updateSleep = function (dt) {
    const P = this.P;
    const vesselStill = Math.abs(this.thetaDot) < P.SLEEP_OMEGA;
    const self = this;
    this._groups.forEach(function (g) {
      let maxSp = 0;
      for (let i = 0; i < g.length; i++) {
        const b = g[i];
        if (b.sleeping) continue;
        const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (sp > maxSp) maxSp = sp;
      }
      if (maxSp >= P.SLEEP_V) {
        for (let i = 0; i < g.length; i++) g[i].sleepT = 0;
        return;
      }
      let minT = Infinity;
      for (let i = 0; i < g.length; i++) {
        const b = g[i];
        if (b.sleeping) continue;
        b.sleepT += dt;
        if (b.sleepT < minT) minT = b.sleepT;
      }
      if (minT >= P.SLEEP_TIME && vesselStill) {
        for (let i = 0; i < g.length; i++) {
          const b = g[i];
          b.sleeping = true; b.vx = 0; b.vy = 0;
        }
        self.thetaSleepRef = self.theta;
      }
    });
    let all = true;
    for (let i = 0; i < this.bodies.length; i++) if (!this.bodies[i].sleeping) { all = false; break; }
    this.allAsleep = all;
  };

  /* ---------- narrow phase ----------
     Awake bodies only. Everything in this list has finite mass on
     both sides, so there is no effective-mass bookkeeping and no
     way for a warm-started impulse to be replayed against a mass
     it was not solved for. */
  const _lp = { x: 0, y: 0 };
  World.prototype.buildContacts = function () {
    const cs = this.contacts; cs.length = 0;
    const bs = this.bodies, P = this.P;
    for (let i = 0; i < bs.length; i++) bs[i].resting = false;

    const pairs = this.pairs;      // already built this substep by buildIslands
    for (let p = 0; p < pairs.length; p += 2) {
      const A = bs[pairs[p]], B = bs[pairs[p + 1]];
      if (A.sleeping || B.sleeping) continue;
      const dx = B.x - A.x, dy = B.y - A.y;
      const rr = A.r + B.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      A.resting = true; B.resting = true;
      cs.push({
        a: A, b: B, wall: -1,
        nx: dx / d, ny: dy / d, pen: rr - d,
        jn: 0, jt: 0,
        key: A.id * 8192 + B.id
      });
    }

    // body vs rotating wall
    const c = Math.cos(this.theta), s = Math.sin(this.theta);
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.sleeping) continue;      // asleep means not integrating, so it cannot sink
      this.toLocal(b.x, b.y, _lp);
      for (let w = 0; w < this.walls.length; w++) {
        const W = this.walls[w];
        const ex = W.bx - W.ax, ey = W.by - W.ay;
        const len2 = ex * ex + ey * ey;
        let t = ((_lp.x - W.ax) * ex + (_lp.y - W.ay) * ey) / len2;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const qx = W.ax + ex * t, qy = W.ay + ey * t;
        let dx = _lp.x - qx, dy = _lp.y - qy;
        let d = Math.sqrt(dx * dx + dy * dy);
        let nlx, nly;
        if (d < 1e-6) { nlx = W.nx; nly = W.ny; d = 0; }
        else { nlx = dx / d; nly = dy / d; }
        // Keep the normal pointing into the interior. A body that has
        // tunnelled past the plane still gets pushed back in rather
        // than being helped out.
        if (nlx * W.nx + nly * W.ny < 0) { nlx = -nlx; nly = -nly; d = -d; }
        const pen = b.r - d;
        if (pen <= 0) continue;
        b.resting = true;
        cs.push({
          a: b, b: null, wall: w,
          nx: nlx * c - nly * s, ny: nlx * s + nly * c,
          pen: pen,
          qlx: qx, qly: qy,
          jn: 0, jt: 0,
          key: 4194304 + b.id * 8 + w
        });
      }
    }

    // Stable order. A physics sim is only deterministic if the
    // iteration order is, and the grid emits pairs in cell order.
    cs.sort(function (p, q) { return p.key - q.key; });
    this.stats.contacts = cs.length;

    if (P.WARM_START) {
      const cache = this.cache;
      for (let i = 0; i < cs.length; i++) {
        const prev = cache.get(cs[i].key);
        if (prev) { cs[i].jn = prev.jn; cs[i].jt = prev.jt; }
      }
    }
    return cs;
  };

  /* Velocity of the moving wall at a world point, from the vessel's
     angular rate about the pivot. The wall is kinematic (infinite
     mass) but it is NOT static, and treating it as static is what
     makes a tilting vessel feel mushy. */
  World.prototype.wallPointVel = function (wx, wy, out) {
    const dx = wx - this.pivotX, dy = wy - this.pivotY;
    out.x = -this.thetaDot * dy;
    out.y = this.thetaDot * dx;
    return out;
  };

  const _wv = { x: 0, y: 0 }, _qw = { x: 0, y: 0 };

  /* Sign convention, stated once because getting it wrong is silent:
     the normal always points from A to B, relative velocity is always
     vB - vA, so approaching means vn < 0. A receives -j*n and B
     receives +j*n. For a wall contact the WALL is A (invM 0, but it
     does move: it is kinematic, not static) and the BODY is B, so the
     body receives +j*n. Reversing either half zeroes every impulse
     against the max(0, ...) clamp, and the pile then free-falls with
     only position correction holding it up. */
  World.prototype.solveVelocities = function () {
    const cs = this.contacts, P = this.P;

    if (P.WARM_START) {
      for (let i = 0; i < cs.length; i++) {
        const ct = cs[i];
        const ix = ct.nx * ct.jn - ct.ny * ct.jt;
        const iy = ct.ny * ct.jn + ct.nx * ct.jt;
        if (ct.b) {
          ct.a.vx -= ix * ct.a.invM; ct.a.vy -= iy * ct.a.invM;
          ct.b.vx += ix * ct.b.invM; ct.b.vy += iy * ct.b.invM;
        } else {
          ct.a.vx += ix * ct.a.invM; ct.a.vy += iy * ct.a.invM;
        }
      }
    }

    for (let it = 0; it < P.VEL_ITERS; it++) {
      for (let i = 0; i < cs.length; i++) {
        const ct = cs[i];
        const A = ct.a, B = ct.b;

        let rvx, rvy, invSum, wvx = 0, wvy = 0;
        if (B) {
          rvx = B.vx - A.vx; rvy = B.vy - A.vy;
          invSum = A.invM + B.invM;
        } else {
          this.toWorld(ct.qlx, ct.qly, _qw);
          this.wallPointVel(_qw.x, _qw.y, _wv);
          wvx = _wv.x; wvy = _wv.y;
          rvx = A.vx - wvx; rvy = A.vy - wvy;   // body is B, wall is A
          invSum = A.invM;
        }
        if (invSum === 0) continue;

        const vn = rvx * ct.nx + rvy * ct.ny;
        // Baumgarte bias pushes OUT of penetration, so it is positive
        // and capped. Restitution only applies above a speed floor:
        // applying it to resting contacts is a classic jitter source.
        let bias = (P.BAUMGARTE / P.DT) * Math.max(0, ct.pen - P.SLOP);
        if (bias > P.MAX_BIAS_V) bias = P.MAX_BIAS_V;
        const rest = vn < -60 ? P.RESTITUTION * vn : 0;
        let dJn = -(vn - bias + rest) / invSum;

        const oldJn = ct.jn;
        ct.jn = Math.max(0, oldJn + dJn);
        dJn = ct.jn - oldJn;

        let ix = ct.nx * dJn, iy = ct.ny * dJn;
        if (B) {
          A.vx -= ix * A.invM; A.vy -= iy * A.invM;
          B.vx += ix * B.invM; B.vy += iy * B.invM;
        } else {
          A.vx += ix * A.invM; A.vy += iy * A.invM;
        }

        // friction, Coulomb-clamped against the accumulated normal
        const tx = -ct.ny, ty = ct.nx;
        if (B) { rvx = B.vx - A.vx; rvy = B.vy - A.vy; }
        else   { rvx = A.vx - wvx;  rvy = A.vy - wvy;  }
        const vt = rvx * tx + rvy * ty;
        let dJt = -vt / invSum;
        const maxJt = P.FRICTION * ct.jn;
        const oldJt = ct.jt;
        ct.jt = Math.max(-maxJt, Math.min(maxJt, oldJt + dJt));
        dJt = ct.jt - oldJt;

        ix = tx * dJt; iy = ty * dJt;
        if (B) {
          A.vx -= ix * A.invM; A.vy -= iy * A.invM;
          B.vx += ix * B.invM; B.vy += iy * B.invM;
        } else {
          A.vx += ix * A.invM; A.vy += iy * A.invM;
        }
      }
    }

    if (P.WARM_START) {
      const cache = this.cache;
      const ep = ++this.epoch;
      for (let i = 0; i < cs.length; i++) {
        const ct = cs[i];
        let e = cache.get(ct.key);
        if (e) { e.jn = ct.jn; e.jt = ct.jt; e.ep = ep; }
        else cache.set(ct.key, { jn: ct.jn, jt: ct.jt, ep: ep });
      }
      // Prune on a slow cycle rather than every substep: a pile that
      // sleeps for a minute must still wake with its impulses intact,
      // and the map is only a few hundred entries.
      if ((ep & 255) === 0) {
        cache.forEach(function (v, k) { if (ep - v.ep > 3600) cache.delete(k); });
      }
    }
  };

  /* Positional projection. Velocity-only resolution leaves a visible
     sag in a deep stack; this is what takes the pile from "settled"
     to "still". */
  World.prototype.solvePositions = function () {
    const cs = this.contacts, P = this.P;
    for (let it = 0; it < P.POS_ITERS; it++) {
      for (let i = 0; i < cs.length; i++) {
        const ct = cs[i], A = ct.a, B = ct.b;
        let pen;
        if (B) {
          const dx = B.x - A.x, dy = B.y - A.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          pen = (A.r + B.r) - d;
          if (pen <= P.SLOP) continue;
          const nx = dx / d, ny = dy / d;
          const corr = P.BAUMGARTE * (pen - P.SLOP) / (A.invM + B.invM);
          A.x -= nx * corr * A.invM; A.y -= ny * corr * A.invM;
          B.x += nx * corr * B.invM; B.y += ny * corr * B.invM;
        } else {
          this.toLocal(A.x, A.y, _lp);
          const W = this.walls[ct.wall];
          const ex = W.bx - W.ax, ey = W.by - W.ay;
          const len2 = ex * ex + ey * ey;
          let t = ((_lp.x - W.ax) * ex + (_lp.y - W.ay) * ey) / len2;
          if (t < 0) t = 0; else if (t > 1) t = 1;
          const qx = W.ax + ex * t, qy = W.ay + ey * t;
          let dx = _lp.x - qx, dy = _lp.y - qy;
          let d = Math.sqrt(dx * dx + dy * dy);
          let nlx, nly;
          if (d < 1e-6) { nlx = W.nx; nly = W.ny; d = 0; }
          else { nlx = dx / d; nly = dy / d; }
          if (nlx * W.nx + nly * W.ny < 0) { nlx = -nlx; nly = -nly; d = -d; }
          pen = A.r - d;
          if (pen <= P.SLOP) continue;
          const c = Math.cos(this.theta), s = Math.sin(this.theta);
          const nx = nlx * c - nly * s, ny = nlx * s + nly * c;
          const corr = P.BAUMGARTE * (pen - P.SLOP);
          A.x += nx * corr; A.y += ny * corr;
        }
      }
    }
  };

  /* ---------- the tilt ----------
     Two models, measured against each other.

     PEDESTAL. The vessel stands on a base of half-width SUPPORT_HW.
     Gravity acts on the combined centre of mass of the vessel and its
     resting contents. Torque is taken about whichever base edge it is
     rocking on:

         tau = (horizontal distance, IN WORLD SPACE, from edge to com) * M * g

     While the com is inside the base that distance is negative and the
     torque restores. Once it crosses the edge the sign flips, and now
     the further it leans the LONGER the lever gets, because leaning
     swings the com out over the edge. That is the runaway, and it is
     the whole reason to stand the thing up rather than hang it.

     It also gives a difficulty curve nobody has to author. An empty
     vessel has its own mass low and centred, so it is immovable. As the
     pile grows the combined com climbs, and a higher com goes over its
     base at a smaller angle: tan(theta_crit) = (a - cx) / height. The
     game gets more dangerous as it fills, out of the material.

     HANG is the original brief: a pivot ABOVE the contents. That is a
     pendulum. It is stable by construction and cannot fall over however
     badly it is loaded, so balance can only ever be a nuisance. Kept
     for comparison, not for shipping. */
  World.prototype.stepTilt = function (dt) {
    const P = this.P;
    this.computeCom();

    if (P.TILT_MODEL !== 'pedestal') {
      const target = Math.max(-P.THETA_MAX, Math.min(P.THETA_MAX, P.K_TILT * this.com.x));
      this.thetaTarget = target;
      if (this.allAsleep && Math.abs(target - this.theta) * this.floorY < P.REST_SWEEP * P.SLOP) {
        this.thetaDot = 0; this.atRest = true; return;
      }
      this.atRest = false;
      const a = P.OMEGA * P.OMEGA * (target - this.theta) - 2 * P.ZETA * P.OMEGA * this.thetaDot;
      this.thetaDot += a * dt;
      this.theta += this.thetaDot * dt;
      this.afterTilt(P);
      return;
    }

    // Combined centre of mass: the vessel's own, which is heavy and low,
    // plus whatever is resting in it.
    const mc = this.com.mass, mv = P.VESSEL_MASS, M = mc + mv;
    const cx = (this.com.x * mc) / M;                       // vessel's own com.x is 0
    const cy = (this.com.y * mc + P.VESSEL_COM_Y * mv) / M;
    const a = P.SUPPORT_HW;
    /* What the gauge has to read, and it is NOT cx against some base
       width: the rocker has no base width. While the com sits below the
       centre of curvature (h < R) the bowl has a stable equilibrium lean
       and CANNOT go over however lopsided it is. It just leans further
       and holds, which is exactly what a needle in a red zone on a bowl
       that is sitting still looks like.

       The honest single number is the lean it is HEADED for:

           tan(theta_eq) = cx / (R - h)

       Small when the pile is low and centred. It blows up as h nears R,
       because that is the bowl losing its ability to right itself. Past
       h = R there is no equilibrium at all and it is running away. So
       the needle shows where this load is taking it, not just where it
       has got to, and it warns before the lean has developed. */
    const h = P.PEDESTAL_Y - cy;
    const denom = this.effR() - h;
    let eq;
    if (denom > 1) eq = Math.atan(cx / denom);
    else eq = (cx !== 0 ? Math.sign(cx) : (this.theta !== 0 ? Math.sign(this.theta) : 1)) * Math.PI / 2;
    this.balance.cx = cx; this.balance.cy = cy; this.balance.mass = M;
    this.balance.h = h;
    this.balance.hOverR = h / this.effR();
    this.balance.eq = eq;
    this.balance.stable = denom > 1;
    this.balance.frac = eq / P.TOPPLE_ANGLE;      // 1.0 = the angle it goes over at
    void a;

    /* The bowl is PINNED at the centre of its yoke and rests on two stops
       at +-SUPPORT_HW. That pin is not decoration: a bowl merely balanced
       on a narrow support pivots about the support's EDGE and has nothing
       holding it there, so at any real tilt it would slide off rather than
       turn. Pinning it means it can only ever rotate, about the pin, and
       the stops still give the flat dead zone.

       Flat, with the weight over the stops, is genuinely at rest: the
       stops can supply the reaction and nothing happens. */
    this.edge = 0;                                // the rocker rolls; no edge

    const c = Math.cos(this.theta), s = Math.sin(this.theta);
    // (h - R) rather than h: R is what turns a runaway into a wobble while
    // the pile is low, and it stops being enough once the pile is high.
    const dx = cx, dy = cy - P.PEDESTAL_Y + this.effR();
    /* Lever from the pin, in world space. The h*sin(theta) term is the
       whole character of the thing: once it has lifted off a stop, the
       tilt ITSELF carries the weight further out, so recovery needs the
       com far enough the other way to beat it, and that demand grows
       until no drop can meet it. */
    const rx = dx * c - dy * s;
    const I = M * (P.VESSEL_RG * P.VESSEL_RG + dx * dx + dy * dy);
    const acc = (rx * M * P.GRAVITY) / I - P.TILT_DAMP * this.thetaDot;

    /* Settled: the torque is balanced and the bowl has stopped moving, so
       it is at rest at whatever lean its load has given it.

       This must NOT wait for the contents to be asleep. A rocker
       approaches its equilibrium lean asymptotically, so thetaDot stays
       small but never reaches zero; that endless creep sweeps the rim
       past WAKE_SWEEP, which wakes the pile, which keeps allAsleep false,
       which stops the bowl freezing. The pair deadlock in a slow wobble
       and nothing ever settles. Balanced torque IS the equilibrium, so
       freeze on that and let the pile sleep underneath it. */
    if (Math.abs(this.thetaDot) < P.SLEEP_OMEGA && Math.abs(acc) < 0.05) {
      this.thetaDot = 0; this.atRest = true; this.thetaTarget = this.theta;
      return;
    }
    this.thetaDot += acc * dt;
    this.theta += this.thetaDot * dt;
    if (Math.abs(this.theta) > P.TOPPLE_ANGLE) this.toppled = true;
    this.thetaTarget = this.theta;
    this.atRest = false;
    this.afterTilt(P);
  };

  /* Whatever moved the walls, the contents have to be told. Waking is on
     how far the RIM has swept since the pile went down, not on the rate
     it swept at: the same tiny rate is harmless for a moment and ruinous
     held for a minute. */
  World.prototype.afterTilt = function (P) {
    const lever = P.TILT_MODEL === 'pedestal' ? (P.PEDESTAL_Y - this.rimY) : this.floorY;
    if (Math.abs(this.theta - this.thetaSleepRef) * lever > P.WAKE_SWEEP * P.SLOP) {
      this.wakeAll();
      this.thetaSleepRef = this.theta;
    }
  };

  /* ---------- one fixed substep ---------- */
  World.prototype.substep = function () {
    const P = this.P, dt = P.DT, bs = this.bodies;

    this.stepTilt(dt);
    this.buildIslands();

    let awake = 0;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.sleeping) continue;
      awake++;
      b.vy += P.GRAVITY * dt;
    }
    this.stats.awake = awake;

    this.buildContacts();
    this.solveVelocities();

    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.sleeping) continue;      // sleeping bodies do not integrate
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    this.solvePositions();
    this.updateSleep(dt);
    this.stats.substeps++;
  };

  /* ---------- frame entry point ----------
     Accumulator, capped. Never step by the frame delta: a tab that
     stalls for 400ms would otherwise integrate one 400ms step and
     fire every piece through a wall. */
  World.prototype.step = function (frameDt) {
    const P = this.P;
    this.acc += Math.min(frameDt, 0.25);
    let n = 0;
    while (this.acc >= P.DT && n < P.MAX_SUBSTEPS) { this.substep(); this.acc -= P.DT; n++; }
    if (n >= P.MAX_SUBSTEPS) this.acc = 0;   // drop the remainder
    return n;
  };

  /* ---------- merges ----------
     Called once per FRAME, never per substep: "one per pair per
     frame" is what makes a cascade read as a sequence of events
     rather than one instantaneous collapse, and it is the whole
     feel of the mechanic.

     Largest tier first, so a cascade resolves downward the way a
     player expects to watch it. Ties break on a stable id key, so
     a seed still reproduces exactly. Returns the events for the
     caller to score and sound. */
  World.prototype.resolveMerges = function () {
    const P = this.P, bs = this.bodies, pairs = this.pairs, out = [];
    if (!pairs || !pairs.length) return out;

    const cands = [];
    for (let p = 0; p < pairs.length; p += 2) {
      const A = bs[pairs[p]], B = bs[pairs[p + 1]];
      if (!A || !B || A.tier !== B.tier) continue;
      const dx = B.x - A.x, dy = B.y - A.y, rr = (A.r + B.r) * 1.02;
      if (dx * dx + dy * dy > rr * rr) continue;
      const rvx = B.vx - A.vx, rvy = B.vy - A.vy;
      if (rvx * rvx + rvy * rvy > P.MERGE_V * P.MERGE_V) continue;
      cands.push({ A: A, B: B, tier: A.tier, key: A.id * 8192 + B.id });
    }
    if (!cands.length) return out;
    cands.sort(function (a, b) { return (b.tier - a.tier) || (a.key - b.key); });

    const used = {};
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i], A = c.A, B = c.B;
      if (used[A.id] || used[B.id]) continue;
      used[A.id] = 1; used[B.id] = 1;
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      const top = TIER_R.length - 1;

      if (c.tier >= top) {
        // The pressure valve. Two at the top of the ladder cancel, so a
        // good run cannot fill the vessel with pieces that have nowhere
        // left to go.
        this.remove(A); this.remove(B);
        this.wakeArea(mx, my, TIER_R[top] * 2.5);
        this.kick(mx, my, TIER_R[top] * 2.5, P.MERGE_KICK * 1.6);
        out.push({ type: 'clear', tier: top, x: mx, y: my });
      } else {
        const nb = makeBody(mx, my, c.tier + 1);
        const mt = A.m + B.m;
        nb.vx = (A.vx * A.m + B.vx * B.m) / mt;   // momentum carries through,
        nb.vy = (A.vy * A.m + B.vy * B.m) / mt;   // or a merge kills the fall dead
        this.remove(A); this.remove(B);
        this.add(nb);
        this.wakeArea(mx, my, nb.r * 2.5);
        this.kick(mx, my, nb.r * 2.2, P.MERGE_KICK, nb);
        out.push({ type: 'merge', tier: c.tier + 1, x: mx, y: my, body: nb });
      }
    }
    return out;
  };

  /* A soft outward shove, falling off with distance. Two pieces
     becoming one bigger piece leaves the neighbours overlapping it;
     without this the position solver untangles them silently and a
     merge has no weight to it. */
  World.prototype.kick = function (wx, wy, radius, strength, except) {
    for (let i = 0; i < this.bodies.length; i++) {
      const o = this.bodies[i];
      if (o === except) continue;
      const dx = o.x - wx, dy = o.y - wy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > radius || d < 1e-6) continue;
      const f = strength * (1 - d / radius);
      o.sleeping = false; o.sleepT = 0;
      o.vx += (dx / d) * f; o.vy += (dy / d) * f;
    }
    this.allAsleep = false; this.atRest = false;
  };

  /* Total kinetic energy of the pile: the jitter read-out. A
     settled pile must sit at zero, not at "small". */
  World.prototype.kineticEnergy = function () {
    let e = 0;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      e += 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy);
    }
    return e;
  };
  World.prototype.maxSpeed = function () {
    let m = 0;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      const s = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (s > m) m = s;
    }
    return m;
  };
  World.prototype.awakeCount = function () {
    let n = 0;
    for (let i = 0; i < this.bodies.length; i++) if (!this.bodies[i].sleeping) n++;
    return n;
  };
  /* Cheap order-sensitive fingerprint, for the determinism check. */
  World.prototype.hash = function () {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      const v = [b.id, Math.round(b.x * 4096), Math.round(b.y * 4096), b.tier];
      for (let k = 0; k < v.length; k++) {
        h ^= (v[k] | 0); h = Math.imul(h, 16777619) >>> 0;
      }
    }
    h ^= Math.round(this.theta * 1e6) | 0; h = Math.imul(h, 16777619) >>> 0;
    return h >>> 0;
  };

  const API = { PHYS: PHYS, TIER_R: TIER_R, World: World, makeBody: makeBody, makeRng: makeRng,
                resetIds: function () { NEXT_ID = 1; } };
  root.BallastPhys = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
