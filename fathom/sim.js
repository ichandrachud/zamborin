/* ============================================================
   FATHOM · the simulation
   ------------------------------------------------------------
   The model: an ocean with density layers, a submarine whose net
   buoyancy is displacement minus hull, ballast and cargo, and the
   rules of the brief, exhaustively. No DOM, no canvas, no timing.
   play.js draws this and tune-gate.mjs (Milestone 2) will measure
   it, and because they share it the gate cannot end up measuring
   a different game from the one that ships.

   Everything is reproducible from the seed: terrain, seams,
   currents. No Math.random() anywhere in here. Fixed timestep
   1/120 s behind an accumulator; same seed + same inputs is the
   same run, exactly.

   Units: metres, kilograms, seconds. y is depth, positive down.
   ============================================================ */
(function (root) {
'use strict';

/* Every number is a starting guess the Milestone-2 gate is expected to
   move — especially T, airPerKg and the ore table. Constants the brief
   names but does not number (buoyK, blowRate, thrustBattery, drag, hMax,
   current, VIEW_W, subR, bottom, surfaceY) are gathered here too, so the
   gate can sweep them from one place. */
const TUNE = {
  worldW: 330, vMax: 90, thrustAccel: 90,
  /* ballastMax was 300 in the brief, which is exactly DISPLACEMENT minus
     HULL_DRY: a full flood reached net zero, so an empty sub could hover
     but never sink, and the game could not start. 400 is the minimal
     coherent fix: full flood is net -100, enough to pass layer 1 (T 60)
     empty, while layers 2+ need cargo as diving weight. Flagged for the
     owner and for the Milestone-2 gate to sweep properly. */
  DISPLACEMENT: 1000, HULL_DRY: 700, ballastMax: 400,
  /* Owner feel-lock, 2026-08-28, from playing Milestone 1: the sub must
     answer the button NOW. floodRate 40 meant seven silent seconds before
     anything sank and read as "nothing is happening". The dive also starts
     just above neutral (startBallast) so the first press bites within half
     a second. airPerKg is unchanged — the economy is priced per kilogram
     blown, not per second held. */
  /* airPerKg 0.35 -> 0.12 and lifeSupport 0.5 -> 0.35, owner round 3: a new
     player holds BLOW (the most natural button in the game) and the old rate
     emptied the whole tank in 3.5 seconds — dead before understanding, every
     time. Motherload's fuel is a minutes-long clock with a loud FUEL LOW
     warning; ours now is too (the AIR LOW banner lives in play.js). The M2
     gate re-tunes the deep-climb economy on these numbers. */
  floodRate: 110, startBallast: 272, airPerKg: 0.12, lifeSupport: 0.35,
  LAYER_DEPTH: [120, 260, 420, 600],
  T: [60, 110, 170, 240],
  crushDepth: [180, 280, 400, 540, 700],
  ore: { nodule:   { kg: 20, val: 26 },
         sulphide: { kg: 12, val: 48 },
         crystal:  { kg: 5,  val: 95 } },
  /* Owner feel-lock, 2026-08-28: cargo is captured on TOUCH, not held for.
     The brief's 2.0 s station-keeping hold read as dead waiting in play.
     grabRadius is now a contact distance; grabTime is only the claw's
     animation beat. This retires station-keeping as a skill — the M2 gate
     judges care through routes and the climb economy instead. */
  seamLen: [4, 12], grabRadius: 10, grabTime: 0.15, scrapeSpeed: 55,
  noise: { drift: 0, grab: 1, thrust: 2, ping: 4, blow: 5 },
  hearThreshold: 3, hearRadius: 190, calmSeconds: 4.0, ramPips: 2,
  ventCycle: [22, 3, 8],
  plumePipsPer2s: 1, pingRadius: 150, pingNoise: 4,
  airMax:  [110, 150, 205, 275, 365],
  cargoMax:[120, 160, 210, 270, 340],
  battMax: [100, 140, 190, 250, 320],
  price: { air:  [0, 190, 540, 1450, 3700],
           hull: [0, 260, 700, 1850, 4600],
           cargo:[0, 170, 480, 1300, 3300],
           batt: [0, 150, 430, 1150, 2900],
           lamp: [0, 140, 400, 1100, 2800] },

  // -- Milestone-1 additions, same starting-guess status as the rest --
  buoyK: 0.32,          // m/s of vertical speed per kg of net buoyancy
  blowRate: 90,         // kg/s expelled while BLOW is held (feel-lock: fast)
  thrustBattery: 3.0,   // battery per second of full thrust
  drag: 0.9,            // 1/s, water pulls vx toward the local current
  hMax: 52,             // m/s cap on speed relative to the current
  current: [7, 5.5, 4, 2.5, 1.2],   // base drift by band (shallows, z1..z4)
  /* 120 -> 85, owner round 3: "too zoomed out — you see everything and
     nothing at all." Motherload shows ~10 chunky tiles across; at 85 the sub
     is a sixth of the screen and one ledge is an event, not a texture. */
  VIEW_W: 85,           // metres of world width the camera shows, both modes
  subR: 4.5,            // collision radius of the hull
  bottom: 700,          // the world ends here (crush depth arrives with hull)
  surfaceY: 3,          // above this the sub is "at the surface"
  surfaceRegen: 25,     // air and battery per second while surfaced
};

// ---------- SEEDED PRNG ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Deterministic per-lattice-point hash for the terrain noise.
function hash1(i, salt) {
  let h = (i * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;   // [-1, 1]
}
function smooth(t) { return t * t * (3 - 2 * t); }
// 1-D value noise, two octaves. t in metres, scale in metres per feature.
function vnoise(t, scale, salt) {
  const u = t / scale, i = Math.floor(u), f = smooth(u - i);
  const a = hash1(i, salt) * (1 - f) + hash1(i + 1, salt) * f;
  const u2 = t / (scale * 0.37) + 11.7, i2 = Math.floor(u2), f2 = smooth(u2 - i2);
  const b = hash1(i2, salt + 91) * (1 - f2) + hash1(i2 + 1, salt + 91) * f2;
  return a * 0.72 + b * 0.28;
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

// ---------- WORLD ----------
/* The shallows have a seabed at ~95 m with one gap in it: the trench
   mouth. Below, the world is a winding channel between two walls, with
   free-standing masses (seamounts, ledges) inside it. Solid space is:
   below the seabed and outside the channel, or inside a mass. */
function World(seed, tune) {
  this.seed = seed >>> 0;
  this.tune = tune;
  const rng = mulberry32(this.seed);
  const W = tune.worldW;

  this.trenchX = W * (0.32 + rng() * 0.36);   // where the mouth opens
  this.saltC = (rng() * 1e6) | 0;             // channel wander
  this.saltW = (rng() * 1e6) | 0;             // channel width wobble
  this.saltF = (rng() * 1e6) | 0;             // seabed relief

  // Currents: one horizontal drift per band, direction and strength seeded.
  this.current = tune.current.map((base, i) => {
    const dir = rng() < 0.5 ? -1 : 1;
    return dir * base * (0.7 + rng() * 0.6) * (i === 0 ? 1 : 1);
  });

  // Masses: rounded blobs inside the channel. Zones 1-2 carry the plateau
  // fields, zones 2-3 the wall ledges.
  this.masses = [];
  const bands = [[140, 250], [200, 330], [290, 400], [440, 560], [590, 660]];
  for (let b = 0; b < bands.length; b++) {
    const n = 2 + (rng() < 0.5 ? 0 : 1);
    for (let i = 0; i < n; i++) {
      const y = lerp(bands[b][0], bands[b][1], rng());
      const hw = this.halfW(y);
      const cx = this.centerX(y);
      const rx = clamp(14 + rng() * 30, 12, hw * 0.72);
      const ry = rx * (0.42 + rng() * 0.3);
      const x = cx + (rng() * 2 - 1) * (hw - rx * 0.6);
      this.masses.push({ x, y, rx, ry, ph: rng() * Math.PI * 2, amp: 0.10 + rng() * 0.12 });
    }
  }

  this.deposits = [];   // { x, y, type, kg, val, seam, idx, mined, glint }
  this.seams = [];      // { type, ids: [depositIdx] }
  this._makeSeams(rng);
}

World.prototype.centerX = function (y) {
  const t = clamp(y / 260, 0, 1);   // the channel straightens out of the mouth
  const wander = vnoise(y, 210, this.saltC) * 58 * t;
  return lerp(this.trenchX, this.tune.worldW * 0.5, t * 0.55) + wander;
};
World.prototype.halfW = function (y) {
  // Wide at the mouth, narrowing with depth, with bulges and pinches.
  const base = y < 120 ? lerp(46, 60, y / 120)
    : y < 260 ? lerp(60, 78, (y - 120) / 140)
    : y < 420 ? lerp(78, 58, (y - 260) / 160)
    : y < 600 ? lerp(58, 44, (y - 420) / 180)
    : lerp(44, 36, (y - 600) / 100);
  return clamp(base + vnoise(y, 130, this.saltW) * 20, 20, 110);
};
World.prototype.floorY = function (x) {
  return 95 + vnoise(x, 90, this.saltF) * 16;
};
World.prototype.inMass = function (x, y) {
  const ms = this.masses;
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    const dx = (x - m.x) / m.rx, dy = (y - m.y) / m.ry;
    const r2 = dx * dx + dy * dy;
    if (r2 > 1.44) continue;
    const th = Math.atan2(dy, dx);
    const edge = 1 + m.amp * Math.sin(th * 3 + m.ph);
    if (r2 < edge * edge) return true;
  }
  return false;
};
World.prototype.solid = function (x, y) {
  if (y <= 0) return false;
  if (x < 0 || x > this.tune.worldW) return true;
  if (this.inMass(x, y)) return true;
  if (y <= this.floorY(x)) return false;          // open water above the seabed
  const hw = this.halfW(y);
  return Math.abs(x - this.centerX(y)) > hw;      // outside the channel is rock
};
World.prototype.zone = function (y) {
  const L = this.tune.LAYER_DEPTH;
  for (let k = L.length - 1; k >= 0; k--) if (y >= L[k]) return k + 1;
  return 0;
};
World.prototype.currentAt = function (y) {
  return y < 2 ? 0 : this.current[this.zone(y)];
};
// The layer forming the ceiling of the band the sub is in, or -1.
World.prototype.ceiling = function (y) {
  const L = this.tune.LAYER_DEPTH;
  for (let k = L.length - 1; k >= 0; k--) if (y > L[k]) return k;
  return -1;
};

/* Deposit anchors sit ON terrain: channel walls, and the upward faces of
   masses. Seams are chains of 4-12 along the terrain, generated as a
   biased walk; chains get richer along their run (the last third carries
   the better type). */
World.prototype._anchors = function () {
  const out = [];
  for (let y = 128; y < this.tune.bottom - 12; y += 7) {
    const cx = this.centerX(y), hw = this.halfW(y);
    // Inward-only jitter so seams do not read as vertical bead-strings.
    const j1 = Math.abs(hash1(y | 0, 555)) * 3.5, j2 = Math.abs(hash1(y | 0, 777)) * 3.5;
    out.push({ x: cx - hw + 2 + j1, y, nx: 1, wall: true });
    out.push({ x: cx + hw - 2 - j2, y, nx: -1, wall: true });
  }
  for (const m of this.masses) {
    for (let a = 0; a < 20; a++) {
      const th = (a / 20) * Math.PI * 2;
      const edge = 1 + m.amp * Math.sin(th * 3 + m.ph);
      const x = m.x + Math.cos(th) * m.rx * edge;
      const y = m.y + Math.sin(th) * m.ry * edge;
      if (Math.sin(th) < -0.2 && !this.solid(x, y - 3)) {
        out.push({ x, y: y - 1.5, nx: 0, wall: false });
      }
    }
  }
  /* Deposits sit ON terrain with open water above them. An anchor under a
     mass overhang passes the wall test but hangs from a ceiling on screen;
     the free-above probe removes exactly those. */
  return out.filter(a => !this.solid(a.x, a.y) && !this.solid(a.x, a.y - 4) && !this.solid(a.x, a.y - 8));
};
const BETTER = { nodule: 'sulphide', sulphide: 'crystal', crystal: 'crystal' };
World.prototype._makeSeams = function (rng) {
  const anchors = this._anchors();
  const used = new Set();
  const plans = [
    // [type, yMin, yMax, count] — nodules zones 1-2, sulphides 2-3, crystals 3-4
    ['nodule', 130, 255, 3], ['nodule', 265, 410, 2],
    ['sulphide', 265, 415, 2], ['sulphide', 425, 590, 2],
    ['crystal', 430, 595, 2], ['crystal', 605, 685, 2],
  ];
  for (const [type, y0, y1, count] of plans) {
    for (let s = 0; s < count; s++) {
      const pool = anchors.filter((a, i) => !used.has(i) && a.y >= y0 && a.y <= y1);
      if (!pool.length) continue;
      let cur = pool[(rng() * pool.length) | 0];
      const len = TUNE.seamLen[0] + ((rng() * (TUNE.seamLen[1] - TUNE.seamLen[0] + 1)) | 0);
      const ids = [];
      let dirY = rng() < 0.65 ? 1 : -1;   // seams mostly run down their wall
      for (let n = 0; n < len; n++) {
        const ci = anchors.indexOf(cur);
        if (ci < 0 || used.has(ci)) break;
        used.add(ci);
        const richer = n >= Math.ceil(len * 2 / 3);
        const t = richer ? BETTER[type] : type;
        const ore = TUNE.ore[t];
        const idx = this.deposits.length;
        this.deposits.push({ x: cur.x, y: cur.y, type: t, kg: ore.kg, val: ore.val,
                             seam: this.seams.length, idx: n, mined: false, glint: n === 0 });
        ids.push(idx);
        // Walk: a nearby unused anchor, biased to continue along the wall.
        let best = null, bestScore = -1;
        for (let i = 0; i < anchors.length; i++) {
          if (used.has(i)) continue;
          const a = anchors[i];
          const dx = a.x - cur.x, dy = a.y - cur.y;
          const d = Math.hypot(dx, dy);
          if (d < 8 || d > 26) continue;
          const score = (dy * dirY > 0 ? 1.6 : 0.6) + rng() * 0.8 - d / 40;
          if (score > bestScore) { bestScore = score; best = a; }
        }
        if (!best) break;
        cur = best;
      }
      if (ids.length >= 2) this.seams.push({ type, ids });
      else for (const id of ids) this.deposits[id].mined = true;   // orphan, hide
    }
  }
};

// ---------- RUN ----------
const H = 1 / 120;   // the fixed timestep

function Run(seed, tuneOverride) {
  this.tune = tuneOverride || TUNE;
  this.world = new World(seed, this.tune);
  this.seed = seed >>> 0;
  const t = this.tune;
  // Upgrade tiers all start at 0; the shop arrives with Milestone 4.
  this.tier = { air: 0, cargo: 0, batt: 0 };
  this.x = this.world.trenchX;
  this.y = 1.5;
  this.vx = 0; this.vy = 0;
  this.facing = 1;
  this.ballast = t.startBallast;
  this.cargo = [];          // { type, kg, val }
  this.cargoKg = 0;
  this.air = t.airMax[0];
  this.batt = t.battMax[0];
  this.money = 0;
  this.bestDepth = 0;
  this.dives = 0;
  this.restingOn = -1;      // layer index the sub sits on, from above
  this.pressedUnder = -1;   // layer index the sub is pinned beneath
  this._contactK = -1;      // maintained layer contact, -1 for none
  this._contactSide = 0;    // -1 resting on top, +1 pinned beneath
  this.onGround = false;
  this.mode = 'dive';       // 'dive' | 'blackout'
  this.grabTarget = -1;
  this.grabProgress = 0;
  this.holdFull = false;
  this.discovered = [false, false, false, false];
  this.time = 0;
  this._acc = 0;
  this.events = [];
}

Run.prototype.airMax  = function () { return this.tune.airMax[this.tier.air]; };
Run.prototype.cargoMax= function () { return this.tune.cargoMax[this.tier.cargo]; };
Run.prototype.battMax = function () { return this.tune.battMax[this.tier.batt]; };
// Net buoyancy in kg. Positive is lift.
Run.prototype.net = function () {
  return this.tune.DISPLACEMENT - this.tune.HULL_DRY - this.ballast - this.cargoKg;
};
// The most lift the sub can ever make right now: everything blown.
Run.prototype.maxLift = function () {
  return this.tune.DISPLACEMENT - this.tune.HULL_DRY - this.cargoKg;
};
/* SEALED is informational: under a ceiling the sub cannot rise through at
   zero water ballast. Returns kg to drop, or 0 when not sealed. */
Run.prototype.sealedNeed = function () {
  const k = this.world.ceiling(this.y);
  if (k < 0) return 0;
  const short = this.tune.T[k] - this.maxLift();
  return short > 0 ? Math.ceil(short) : 0;
};

/* inputs: { ax: -1..1, flood: bool, blow: bool,
             floodKg: kg queued this frame, blowKg: kg queued this frame,
             jettison: bool (edge) } */
Run.prototype.step = function (inputs, dtReal) {
  this.events.length = 0;
  if (this.mode !== 'dive') return this.events;
  this._acc = Math.min(this._acc + dtReal, 0.25);
  if (inputs.floodKg) this._floodPool = (this._floodPool || 0) + inputs.floodKg;
  if (inputs.blowKg)  this._blowPool  = (this._blowPool  || 0) + inputs.blowKg;
  if (inputs.jettison) this.jettison();
  while (this._acc >= H) {
    this._acc -= H;
    this._tick(inputs);
  }
  return this.events;
};

Run.prototype._tick = function (inp) {
  const t = this.tune, w = this.world;
  this.time += H;
  const surfaced = this.y <= t.surfaceY;

  // --- ballast ---
  let flood = (inp.flood ? t.floodRate * H : 0);
  if (this._floodPool > 0) {
    const d = Math.min(this._floodPool, t.floodRate * 3 * H);
    flood += d; this._floodPool -= d;
  }
  if (flood > 0) {
    this.ballast = Math.min(t.ballastMax, this.ballast + flood);
    this._flooding = 2;           // frames of intake feedback for the renderer
  }
  if (this._flooding > 0) this._flooding--;

  let blow = (inp.blow ? t.blowRate * H : 0);
  if (this._blowPool > 0) {
    const d = Math.min(this._blowPool, t.blowRate * 3 * H);
    blow += d; this._blowPool -= d;
  }
  if (blow > 0) {
    blow = Math.min(blow, this.ballast, Math.max(0, this.air) / t.airPerKg);
    if (blow > 0) {
      this.ballast -= blow;
      this.air -= blow * t.airPerKg;
      this._blowing = 2;            // frames of bubble feedback for the renderer
    }
  }
  if (this._blowing > 0) this._blowing--;

  // --- air: one tank, two jobs ---
  if (surfaced) {
    this.air = Math.min(this.airMax(), this.air + t.surfaceRegen * H);
    this.batt = Math.min(this.battMax(), this.batt + t.surfaceRegen * H);
  } else {
    this.air -= t.lifeSupport * H;
    if (this.air <= 0) { this.air = 0; this._blackout(); return; }
  }

  // --- vertical: speed proportional to net buoyancy ---
  const net = this.net();
  const vyT = clamp(-net * t.buoyK, -t.vMax, t.vMax);
  this.vy += (vyT - this.vy) * Math.min(1, 6 * H);   // feel-lock: answer fast

  // --- horizontal: thrust against the current ---
  const ax = clamp(inp.ax || 0, -1, 1);
  if (ax !== 0 && this.batt > 0) {
    this.vx += ax * t.thrustAccel * H;
    this.batt = Math.max(0, this.batt - t.thrustBattery * Math.abs(ax) * H);
    this.facing = ax > 0 ? 1 : -1;
    this._thrusting = 2;
  }
  if (this._thrusting > 0) this._thrusting--;
  const cur = w.currentAt(this.y);
  this.vx += (cur - this.vx) * Math.min(1, t.drag * H);
  const rel = this.vx - cur;
  if (Math.abs(rel) > t.hMax) this.vx = cur + Math.sign(rel) * t.hMax;

  // --- integrate ---
  const py = this.y;
  this.x += this.vx * H;
  this.y += this.vy * H;

  // --- density layers: floors in both senses ---
  /* Contact is a maintained state, not a per-tick test, so the HUD flag
     cannot flicker while the sub creeps against a band. Side -1 is resting
     ON the layer from above; side +1 is pinned BENEATH it. Release happens
     when the threshold is beaten (the membrane test below then lets the
     crossing through and fires the event) or when buoyancy simply carries
     the sub away from the band. */
  const L = t.LAYER_DEPTH;
  let pinned = false;
  if (this._contactK >= 0) {
    const k = this._contactK, Ld = L[k], Tk = t.T[k];
    if (this._contactSide < 0) {
      if (net <= -Tk || net > 0) this._contactK = -1;
      else { this.y = Ld - 0.01; this.vy = 0; pinned = true; }
    } else {
      if (net >= Tk || net < 0) this._contactK = -1;
      else { this.y = Ld + 0.01; this.vy = 0; pinned = true; }
    }
  }
  if (!pinned) {
    for (let k = 0; k < L.length; k++) {
      const Ld = L[k], Tk = t.T[k];
      const a = py - Ld, b = this.y - Ld;
      if (a < 0 && b >= 0) {                    // arriving from above
        if (net <= -Tk) {
          if (!this.discovered[k]) { this.discovered[k] = true; this.events.push({ t: 'discover', k }); }
          this.events.push({ t: 'sink-through', k });
        } else {
          this.y = Ld - 0.01; this.vy = 0;
          this._contactK = k; this._contactSide = -1;
          if (!this.discovered[k]) { this.discovered[k] = true; this.events.push({ t: 'discover', k }); }
        }
        break;
      } else if (a > 0 && b <= 0) {             // arriving from below
        if (net >= Tk) {
          if (!this.discovered[k]) { this.discovered[k] = true; this.events.push({ t: 'discover', k }); }
          this.events.push({ t: 'rise-through', k });
        } else {
          this.y = Ld + 0.01; this.vy = 0;
          this._contactK = k; this._contactSide = 1;
        }
        break;
      }
    }
  }
  this.restingOn = (this._contactK >= 0 && this._contactSide < 0) ? this._contactK : -1;
  this.pressedUnder = (this._contactK >= 0 && this._contactSide > 0) ? this._contactK : -1;

  // --- terrain: push the hull out, kill the velocity into it ---
  const r = t.subR;
  this.onGround = false;
  for (let it = 0; it < 4; it++) {
    const b = w.solid(this.x, this.y + r), tp = w.solid(this.x, this.y - r);
    const lf = w.solid(this.x - r, this.y), rt = w.solid(this.x + r, this.y);
    if (!b && !tp && !lf && !rt) break;
    if (b)  { this.y -= 0.6; if (this.vy > 0) this.vy = 0; this.onGround = true; }
    if (tp) { this.y += 0.6; if (this.vy < 0) this.vy = 0; }
    if (lf) { this.x += 0.6; if (this.vx < 0) this.vx = cur > 0 ? cur * 0.3 : 0; }
    if (rt) { this.x -= 0.6; if (this.vx > 0) this.vx = cur < 0 ? cur * 0.3 : 0; }
  }
  this.x = clamp(this.x, r, t.worldW - r);
  if (this.y > t.bottom - r) { this.y = t.bottom - r; if (this.vy > 0) this.vy = 0; this.onGround = true; }
  if (this.y < 0.6) { this.y = 0.6; if (this.vy < 0) this.vy = 0; }

  if (this.y > this.bestDepth) this.bestDepth = this.y;

  // --- surfacing banks the haul ---
  if (this.y <= t.surfaceY && this.cargo.length) {
    let val = 0, kg = 0;
    for (const c of this.cargo) { val += c.val; kg += c.kg; }
    this.money += val;
    this.cargo = []; this.cargoKg = 0;
    this.dives++;
    this.events.push({ t: 'banked', val, kg });
  }

  // --- station-keeping grabs ---
  this._grab();
};

Run.prototype._grab = function () {
  const t = this.tune, w = this.world;
  let best = -1, bestD = t.grabRadius;
  for (let i = 0; i < w.deposits.length; i++) {
    const d = w.deposits[i];
    if (d.mined) continue;
    const dist = Math.hypot(d.x - this.x, d.y - this.y);
    if (dist < bestD) { bestD = dist; best = i; }
  }
  this.holdFull = false;
  if (best < 0) { this.grabTarget = -1; this.grabProgress = 0; return; }
  const dep = w.deposits[best];
  if (this.cargoKg + dep.kg > this.cargoMax()) {
    this.grabTarget = best; this.grabProgress = 0; this.holdFull = true;
    return;
  }
  if (best !== this.grabTarget) { this.grabTarget = best; this.grabProgress = 0; }
  this.grabProgress += H;
  if (this.grabProgress >= t.grabTime) {
    dep.mined = true;
    this.cargo.push({ type: dep.type, kg: dep.kg, val: dep.val });
    this.cargoKg += dep.kg;
    this.grabTarget = -1; this.grabProgress = 0;
    // The glint: mining one deposit lights the direction of the next —
    // never the length, never the value.
    const seam = w.seams[dep.seam];
    if (seam) {
      const at = seam.ids.indexOf(best);
      for (let j = at + 1; j < seam.ids.length; j++) {
        const nx = w.deposits[seam.ids[j]];
        if (!nx.mined) { nx.glint = true; break; }
      }
    }
    this.events.push({ t: 'grab', type: dep.type, kg: dep.kg, val: dep.val, x: dep.x, y: dep.y });
  }
};

/* JETTISON: the panic verb. Drops the heaviest item instantly, gone
   forever. Among equals, the most recent. Never fails, never queued. */
Run.prototype.jettison = function () {
  if (!this.cargo.length) return null;
  let pick = 0;
  for (let i = 1; i < this.cargo.length; i++) {
    if (this.cargo[i].kg >= this.cargo[pick].kg) pick = i;
  }
  const item = this.cargo.splice(pick, 1)[0];
  this.cargoKg -= item.kg;
  this.events.push({ t: 'jettison', type: item.type, kg: item.kg, x: this.x, y: this.y });
  return item;
};
// What JETTISON would drop next — the manifest highlights it.
Run.prototype.jettisonNext = function () {
  if (!this.cargo.length) return -1;
  let pick = 0;
  for (let i = 1; i < this.cargo.length; i++) {
    if (this.cargo[i].kg >= this.cargo[pick].kg) pick = i;
  }
  return pick;
};

/* Blackout ends the run gently: the sub is recovered, carried cargo is
   lost, banked money is untouched. A bad run must stay cheap to retry. */
Run.prototype._blackout = function () {
  this.mode = 'blackout';
  this.events.push({ t: 'blackout', depth: Math.round(this.y),
                     lostVal: this.cargo.reduce((s, c) => s + c.val, 0),
                     lostKg: this.cargoKg });
};
Run.prototype.revive = function () {
  const t = this.tune;
  this.mode = 'dive';
  this.x = this.world.trenchX; this.y = 1.5;
  this.vx = 0; this.vy = 0;
  this.ballast = t.startBallast;
  this.cargo = []; this.cargoKg = 0;
  this.air = this.airMax(); this.batt = this.battMax();
  this.restingOn = -1; this.pressedUnder = -1;
  this._contactK = -1; this._contactSide = 0;
  this._floodPool = 0; this._blowPool = 0;
  this.dives++;
};

const API = { TUNE, Run, World, H, mulberry32 };
root.FathomSim = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
