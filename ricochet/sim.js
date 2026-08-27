/* ============================================================
   Ricochet · the simulation, and nothing else
   ============================================================

   This file has no DOM in it and never will. It runs unchanged in the browser
   (as window.RICOCHET_SIM) and in Node (as a CommonJS module), because the
   gate in the build brief needs bots to play thousands of turns headlessly and
   a simulation that only exists inside a render loop cannot be measured.

   THE SIM RUNS IN ONE FIXED UNIT SPACE, ALWAYS.

   Desktop draws the board at 42 logical px per cell and mobile at whatever the
   measured viewport allows, but both feed the SAME numbers to this file: cell
   50, ball radius 5, speed 900. The renderer scales. This is the design
   system's "do not let the game play differently between the two modes" taken
   literally: there is only one game, and the two layouts are two windows onto
   it.

   FIXED TIMESTEP, NOT FRAME TIME. Every advance is TUNE.simDt. A browser at
   144Hz, a browser at 30Hz and a headless bot all produce byte-identical runs
   from the same seed, which is what makes the gate, the daily challenge and
   reproducing an owner's bug report possible at all.

   Coordinates: x = 0 at the left wall, y = 0 at the ceiling, y grows DOWNWARD
   (canvas convention). The danger line is at y = rows * cell, and the launcher
   sits on it.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RICOCHET_SIM = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ---------- TUNE ----------
   One object, so a sweep can drive every constant from outside. Nothing below
   this line reads a magic number. */
const TUNE = {
  /* BOARD WIDTH IS NOW PER-MODE, and that makes desktop a genuinely different
     game from mobile — a wider wall, more cells per row, a ball stream that has
     to cover more ground. It is not a layout difference and it must not be
     treated as one: the two need separate gate runs and separate high scores.
     A 7x12 board is aspect 0.58 and the desktop frame's usable area is 1.42, so
     no cell size fills it; 17 columns is what 700px of width holds at the 41px
     cell that 12 rows of runway allow. */
  cols: 7,
  colsMobile: 7,
  colsDesktop: 17,
  // Every density below is quoted for a 7-wide board and scaled from it, so a
  // wider board is proportionally as full rather than accidentally empty.
  refCols: 7,

  cell: 50, ballR: 5, ballSpeed: 900,
  fireGap: 0.070,           // seconds between balls in a stream
  startBalls: 1,
  minAngleDeg: 12,
  hpVariance: 3,
  // How fast block HP climbs with the level. 1.0 is the brief's hp = level.
  // It is here because it is the other half of the only race in the game:
  // damage per turn is set by the ball count, which grows on pickups, and a
  // row's cost is set by this. The gate cannot ask whether that race is fair
  // without being able to drive both sides of it.
  hpPerLevel: 1.0,
  rowFillMin: 2, rowFillMax: 5,
  mirrorBase: 0.05, mirrorPerLevel: 0.012, mirrorCap: 0.55, mirrorMaxPerRow: 2,
  // Whether a mirror crossing the line ends the run, as brief §3.6 says it
  // does. Here as a switch because the gate needs to be able to ask what the
  // game measures WITHOUT it, and that turned out to be the whole answer.
  // true is the shipped behaviour.
  mirrorEndsRun: true,
  // Mirror HP as a multiple of what a block at the same level costs. 0 is the
  // shipped behaviour, indestructible. Above 0 a mirror still deflects exactly
  // as before, and every deflection also takes one off it.
  // 6 measured c1 2.56 with only 1 competent run in 30 surviving past level 70.
  // The boundary is between 6 and 8: at 8 the wall out-runs everyone and c1
  // falls back to 1.89.
  mirrorHpMult: 6,

  /* ROCKS. A cell that reflects like a block and takes no damage.
     THE GATE'S ONE LESSON, WRITTEN DOWN WHERE IT CANNOT BE MISSED: a piece that
     is indestructible AND descends AND ends the run turns run length into a
     single random draw. Mirrors had all three and 200 of 200 runs died exactly
     `rows` levels after the first one spawned. A rock may safely have any TWO
     of those three. rockEndsRun defaults to false for exactly that reason, and
     turning it on while rocks are indestructible reproduces the original bug. */
  // Rocks earn their place as TEXTURE, not difficulty: a second obstacle that
  // bounces you square where a mirror turns you ninety degrees. Measured, they
  // buy no difficulty that mirror HP does not buy more cleanly. Harmless at the
  // line, so there is no second death rule to teach.
  rockChance: 0.3,
  rockEndsRun: false,
  rockHpMult: 0,            // 0 = indestructible
  pickupChance: 0.55,
  /* Long turns are the genre's named frustration and the brief's 8s-then-3x
     ramp was not enough for the tail. Measured over 1257 turns across both
     boards, the seconds a player actually WATCHES:
       after 8s at 3x   median 7.3   p90 11.1   max 13.7   (the brief's value)
       after 5s at 4x   median 5.6   p90  8.0   max 10.0   (this)
       after 4s at 5x   median 4.7   p90  6.6   max  8.2   (a blur)
     Neither constant is read by the simulation, so this changes nothing about
     outcomes, scores or seeds. Only the waiting. */
  fastForwardAfter: 5.0, fastForwardScale: 4.0, turnHardStop: 25.0,

  /* --- three constants the brief does not name, and why they exist --- */

  // ROWS OF RUNWAY. The brief gives 12 on mobile and 15 on desktop, and also
  // says the game must play identically in both. Those cannot both hold: rows
  // of runway is the single largest difficulty dial in the genre. The design
  // system overrides the brief where they disagree, so runway is one number
  // for both modes and the desktop layout is built around it.
  rows: 12,

  // ANTI-STALL FLOOR on |vy| after any contact, as a fraction of speed. A ball
  // that leaves a bounce travelling within a degree of horizontal will rattle
  // wall to wall until the hard stop, and the brief itself names long turns as
  // the genre's main frustration. 0.12 is about 7 degrees: shallow ceiling
  // rakes still work, they just decay instead of running forever.
  minVyFrac: 0.12,

  // MIRROR SLAB HALF-THICKNESS. The mirror collides as a line segment down the
  // cell diagonal, not as a whole cell, so the ball visibly strikes the slab
  // that is drawn. With ball radius 5 the contact band is 12 either side of the
  // line, well inside the 35 available from the diagonal to a corner.
  mirrorThick: 7,

  simDt: 1 / 240,           // 3.75 px of travel per step at full speed
};

const DEG = Math.PI / 180;

/* ---------- PRNG ----------
   xorshift32. Every draw in this file comes from here; there is no
   Math.random() in the game logic, because the gate, the daily challenge and
   bug reproduction all need a run to be replayable from its seed alone. */
function makeRng(seed) {
  const o = { s: (seed >>> 0) || 0x9E3779B9 };   // xorshift cannot start at 0
  o.u32 = function () {
    let x = o.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;  x >>>= 0;
    o.s = x; return x;
  };
  o.float = function () { return o.u32() / 4294967296; };
  o.int = function (a, b) { return a + Math.floor(o.float() * (b - a + 1)); };  // inclusive
  o.bit = function () { return o.u32() & 1; };
  return o;
}

/* ---------- geometry ---------- */
const fieldW = () => TUNE.cols * TUNE.cell;
const floorY = () => TUNE.rows * TUNE.cell;
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

/* ---------- board ---------- */

/* How many cells a fresh row fills, weighted toward the middle of the range.

   This used to hardcode 2/3/4/5 at 0.20/0.30/0.30/0.20 and ignore
   TUNE.rowFillMin and TUNE.rowFillMax completely. Both constants were declared
   and never read, so a sweep over row density silently swept nothing and
   reported that density does not matter. The brief puts every constant in TUNE
   "so a sweep can drive them"; a constant that is declared but dead is worse
   than one that is missing, because the sweep still produces numbers.

   The integer weights below come out as 2,3,3,2 across the default range 2..5,
   which is exactly the old distribution and consumes exactly one draw, so every
   board from every seed is unchanged. */
function fillWeights(min, max) {
  const n = max - min + 1;
  const w = [];
  for (let i = 0; i < n; i++) w.push(Math.abs(i - (n - 1) / 2) <= 0.5 ? 3 : 2);
  return w;
}
const colScale = () => TUNE.cols / TUNE.refCols;

/* THE PICKUP RATE IS DERIVED, NOT SET.
   `pickupChance` states the expected pickups per row on the 7-wide reference
   board. A board k times wider needs k times as many, or each ball is covering
   proportionally less wall with the same stream. Rolls stop at the first miss,
   so the per-roll probability that yields the target is solved rather than
   guessed.

   This is not a fudge factor. Sweeping 17 columns empirically found 0.75 best;
   solving for proportionality gives 0.76. The measured optimum IS the point
   where pickups scale with width, which is why this is expressed as the rule
   rather than as the number it happens to produce. */
let pickCache = null;
const pickupRolls = () => Math.max(1, Math.round(colScale()));
function pickupP() {
  const k = colScale(), n = pickupRolls(), c = TUNE.pickupChance;
  if (pickCache && pickCache.k === k && pickCache.c === c) return pickCache.p;
  const target = Math.min(n * 0.999, c * k);
  let lo = 0, hi = 1;
  for (let i = 0; i < 48; i++) {
    const m = (lo + hi) / 2;
    let sum = 0, t = 1;
    for (let j = 0; j < n; j++) { t *= m; sum += t; }
    if (sum < target) lo = m; else hi = m;
  }
  const p = (lo + hi) / 2;
  pickCache = { k: k, c: c, p: p };
  return p;
}

function fillCount(rng) {
  const k = colScale();
  const min = Math.max(0, Math.min(TUNE.cols, Math.round(TUNE.rowFillMin * k)));
  const max = Math.max(min, Math.min(TUNE.cols, Math.round(TUNE.rowFillMax * k)));
  const w = fillWeights(min, max);
  let total = 0;
  for (let i = 0; i < w.length; i++) total += w[i];
  let r = rng.float() * total;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return min + i; }
  return max;
}

function shuffle(rng, a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* A row is 7 slots of null | block | mirror | pickup.
   Blocks are placed first, mirrors take what is left, the pickup takes what is
   left after that. A row that comes out full simply has no pickup. */
function makeRow(rng, level) {
  const row = new Array(TUNE.cols).fill(null);
  const slots = shuffle(rng, Array.from({ length: TUNE.cols }, (_, i) => i));
  let k = 0;

  const n = fillCount(rng);
  for (let i = 0; i < n; i++) {
    const sign = rng.bit() ? 1 : -1;
    const base = Math.max(1, Math.round(level * TUNE.hpPerLevel));
    const hp = Math.max(1, base + sign * rng.int(0, TUNE.hpVariance));
    row[slots[k++]] = { t: 'b', hp: hp, hp0: hp };
  }

  // One roll per mirror, capped, and the second roll only happens if the first
  // landed: a row is either plain, mirrored, or heavily mirrored.
  const p = Math.min(TUNE.mirrorCap, TUNE.mirrorBase + level * TUNE.mirrorPerLevel);
  const maxMirrors = Math.max(1, Math.round(TUNE.mirrorMaxPerRow * colScale()));
  for (let m = 0; m < maxMirrors && k < TUNE.cols; m++) {
    if (rng.float() >= p) break;
    const mhp = TUNE.mirrorHpMult > 0
      ? Math.max(1, Math.round(level * TUNE.hpPerLevel * TUNE.mirrorHpMult)) : 0;
    row[slots[k++]] = { t: 'm', d: rng.bit() ? 1 : -1, hp: mhp, hp0: mhp };  // 1 = '/', -1 = '\'
  }

  // Guarded so that at rockChance 0 no draw is taken and every board from every
  // seed is byte-identical to before rocks existed.
  if (TUNE.rockChance > 0) {
    const nRocks = Math.max(1, Math.round(colScale()));
    for (let i = 0; i < nRocks && k < TUNE.cols; i++) {
      if (rng.float() >= TUNE.rockChance) break;
      const rhp = TUNE.rockHpMult > 0
        ? Math.max(1, Math.round(level * TUNE.hpPerLevel * TUNE.rockHpMult)) : 0;
      row[slots[k++]] = { t: 'r', hp: rhp, hp0: rhp };
    }
  }

  // Ball growth is the one thing that MUST keep pace with board width, and it
  // is the only dial that does: a bigger starting stream is a one-off, while
  // the pickup rate compounds over a forty turn run. Measured at 17 columns,
  // startBalls moved c1 from 1.69 to at best 2.00, and the pickup rate moved
  // it to 2.62.
  const nPick = pickupRolls();
  const pp = pickupP();
  for (let i = 0; i < nPick && k < TUNE.cols; i++) {
    if (rng.float() >= pp) break;
    row[slots[k++]] = { t: 'p' };
  }
  return row;
}

function newState(seed) {
  const rng = makeRng(seed);
  const s = {
    seed: seed >>> 0, rng: rng,
    level: 1, score: 0, balls: TUNE.startBalls, shots: 0,
    rows: [], launchX: fieldW() / 2, over: false,
  };
  s.rows.push(makeRow(rng, 1));      // something to shoot at on turn one
  return s;
}

function cloneState(s) {
  const rng = makeRng(1); rng.s = s.rng.s;
  return {
    seed: s.seed, rng: rng,
    level: s.level, score: s.score, balls: s.balls, shots: s.shots,
    rows: s.rows.map(r => r.map(c => (c ? Object.assign({}, c) : null))),
    launchX: s.launchX, over: s.over,
  };
}

/* ---------- collision ----------
   Blocks: axis-aligned, resolved on the shallower penetration axis, exactly as
   the brief specifies. The ball is treated as a square of its diameter for the
   overlap test, which is what "shallower penetration axis" means and is the
   standard for this genre; a circle test at a shared corner picks a diagonal
   normal that reads as a bug to a player. */
function hitBlock(b, r, c) {
  const C = TUNE.cell, R = TUNE.ballR;
  const cx = c * C + C / 2, cy = r * C + C / 2;
  const px = (R + C / 2) - Math.abs(b.x - cx);
  const py = (R + C / 2) - Math.abs(b.y - cy);
  if (px <= 0 || py <= 0) return null;
  return { kind: 'b', r: r, c: c, cx: cx, cy: cy, px: px, py: py, pen: Math.min(px, py) };
}

/* Mirrors: circle against the cell diagonal as a capsule. */
function hitMirror(b, r, c, d) {
  const C = TUNE.cell, R = TUNE.ballR, T = TUNE.mirrorThick;
  const x0 = c * C, y0 = r * C, x1 = x0 + C, y1 = y0 + C;
  const ax = x0, ay = d > 0 ? y1 : y0;
  const bx = x1, by = d > 0 ? y0 : y1;
  const dx = bx - ax, dy = by - ay;
  let t = ((b.x - ax) * dx + (b.y - ay) * dy) / (dx * dx + dy * dy);
  t = clamp(t, 0, 1);
  const qx = ax + dx * t, qy = ay + dy * t;
  const ox = b.x - qx, oy = b.y - qy;
  const dist = Math.sqrt(ox * ox + oy * oy);
  const rad = R + T;
  if (dist >= rad) return null;
  return { kind: 'm', r: r, c: c, d: d, ox: ox, oy: oy, dist: dist, pen: rad - dist };
}

/* A contact never leaves the ball inside the thing it hit, and never reverses a
   ball that is already travelling away from it. Both of those produce the same
   symptom — a ball that jitters in place and eats a block's whole HP bar in one
   frame — and both are cheap to rule out here. */
function reflectBlock(b, h) {
  let touched = false;
  if (h.px < h.py) {
    b.x += (b.x < h.cx ? -h.px : h.px);
    if ((b.x < h.cx && b.vx > 0) || (b.x > h.cx && b.vx < 0)) { b.vx = -b.vx; touched = true; }
  } else {
    b.y += (b.y < h.cy ? -h.py : h.py);
    if ((b.y < h.cy && b.vy > 0) || (b.y > h.cy && b.vy < 0)) { b.vy = -b.vy; touched = true; }
  }
  return touched;
}

function reflectMirror(b, h) {
  let nx, ny;
  if (h.dist > 1e-6) { nx = h.ox / h.dist; ny = h.oy / h.dist; }
  else { nx = 0; ny = -1; }
  b.x += nx * h.pen; b.y += ny * h.pen;
  if (b.vx * nx + b.vy * ny >= 0) return false;      // already leaving
  const vx = b.vx, vy = b.vy;
  if (h.d > 0) { b.vx = -vy; b.vy = -vx; }           // '/'  : (vx,vy) -> (-vy,-vx)
  else         { b.vx =  vy; b.vy =  vx; }           // '\'  : (vx,vy) -> ( vy, vx)
  return true;
}

function antiStall(b) {
  const S = TUNE.ballSpeed, minVy = S * TUNE.minVyFrac;
  if (Math.abs(b.vy) < minVy) {
    b.vy = (b.vy >= 0 ? 1 : -1) * minVy;             // vy exactly 0 falls, and lands
    const rem = S * S - b.vy * b.vy;
    b.vx = (b.vx >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, rem));
  }
  const sp = Math.hypot(b.vx, b.vy) || 1;
  b.vx = b.vx / sp * S; b.vy = b.vy / sp * S;
}

/* The single definition of what ends a run. Both the death check and the
   turns-to-the-line read-out go through it, because a read-out that disagrees
   with the death rule is worse than no read-out. */
function isLethal(cell) {
  if (!cell) return false;
  if (cell.t === 'b') return true;
  if (cell.t === 'm') return TUNE.mirrorEndsRun;
  if (cell.t === 'r') return TUNE.rockEndsRun;
  return false;
}

/* ---------- a turn ----------
   startTurn / stepTurn / resolveTurn. The renderer steps it a slice at a time
   so the player can watch; the bots call runToEnd and never draw anything. */

function legalAngle(a) {
  const lo = TUNE.minAngleDeg * DEG, hi = Math.PI - lo;
  return clamp(a, lo, hi);
}

function startTurn(state, angle, opts) {
  const a = legalAngle(angle);
  return {
    angle: a,
    launchX: state.launchX,
    count: state.balls,
    fired: 0,
    balls: [],
    t: 0,
    hpDestroyed: 0,
    pickups: 0,
    breaks: 0,
    firstLandedX: null,
    done: false,
    stopped: false,                      // true if the hard stop parked balls
    rec: !!(opts && opts.rec),           // record events for sound and particles
    events: [],
  };
}

function ev(turn, type, x, y, extra) {
  if (!turn.rec) return;
  turn.events.push(extra ? Object.assign({ type: type, x: x, y: y }, extra)
                         : { type: type, x: x, y: y });
}

function resolveCells(state, turn, b) {
  const C = TUNE.cell, R = TUNE.ballR;
  const c0 = Math.max(0, Math.floor((b.x - R) / C));
  const c1 = Math.min(TUNE.cols - 1, Math.floor((b.x + R) / C));
  const r0 = Math.max(0, Math.floor((b.y - R) / C));
  const r1 = Math.min(state.rows.length - 1, Math.floor((b.y + R) / C));
  let best = null;

  for (let r = r0; r <= r1; r++) {
    const row = state.rows[r];
    if (!row) continue;
    for (let c = c0; c <= c1; c++) {
      const cell = row[c];
      if (!cell) continue;

      if (cell.t === 'p') {
        // A pickup is not a collider. It is collected on touch and vanishes.
        const cx = c * C + C / 2, cy = r * C + C / 2;
        if (Math.hypot(b.x - cx, b.y - cy) < R + C * 0.28) {
          row[c] = null; turn.pickups++;
          ev(turn, 'pickup', cx, cy);
        }
        continue;
      }

      const h = cell.t === 'm' ? hitMirror(b, r, c, cell.d) : hitBlock(b, r, c);
      if (h) { h.t = cell.t; if (h && (!best || h.pen > best.pen)) best = h; }
    }
  }
  if (!best) return;

  // One contact per step per ball. Two cells can overlap the ball at a shared
  // corner; resolving both would take two HP off two blocks for one touch.
  const row = state.rows[best.r];
  const cell = row && row[best.c];
  if (!cell) return;

  if (best.kind === 'm') {
    if (!reflectMirror(b, best)) return;
    antiStall(b);
    // A breakable mirror still deflects on the contact that kills it. Losing
    // the deflection would make the last hit behave unlike every hit before it.
    if (cell.hp > 0) {
      cell.hp -= 1;
      turn.hpDestroyed += 1;
      if (cell.hp <= 0) { row[best.c] = null; turn.breaks += 1; ev(turn, 'break', best.cx, best.cy, { kind: 'm' }); return; }
    }
    ev(turn, 'mirror', b.x, b.y);
    return;
  }

  reflectBlock(b, best);
  antiStall(b);

  // A rock with no HP takes nothing and scores nothing. It is geometry.
  if (best.t === 'r' && cell.hp <= 0) { ev(turn, 'rock', b.x, b.y); return; }

  cell.hp -= 1;
  turn.hpDestroyed += 1;
  if (cell.hp <= 0) {
    row[best.c] = null;
    turn.breaks += 1;
    ev(turn, 'break', best.cx, best.cy, { hp0: cell.hp0, kind: best.t });
  } else {
    ev(turn, 'hit', b.x, b.y);
  }
}

function stepBall(state, turn, b, dt) {
  const R = TUNE.ballR, W = fieldW(), FY = floorY();
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  if (b.x < R)          { b.x = R;     b.vx =  Math.abs(b.vx); ev(turn, 'wall', b.x, b.y); }
  else if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx); ev(turn, 'wall', b.x, b.y); }
  if (b.y < R)          { b.y = R;     b.vy =  Math.abs(b.vy); ev(turn, 'wall', b.x, b.y); }

  resolveCells(state, turn, b);

  if (b.y >= FY - R && b.vy > 0) {
    b.y = FY - R; b.vx = 0; b.vy = 0; b.live = false;
    if (turn.firstLandedX === null) turn.firstLandedX = b.x;
    ev(turn, 'land', b.x, b.y);
  }
}

function stepTurn(state, turn, dt) {
  if (turn.done) return;
  turn.t += dt;

  while (turn.fired < turn.count && turn.t >= turn.fired * TUNE.fireGap) {
    turn.balls.push({
      x: turn.launchX, y: floorY() - TUNE.ballR,
      vx: Math.cos(turn.angle) * TUNE.ballSpeed,
      vy: -Math.sin(turn.angle) * TUNE.ballSpeed,
      live: true, i: turn.fired,
    });
    turn.fired++;
  }

  for (let i = 0; i < turn.balls.length; i++) {
    const b = turn.balls[i];
    if (b.live) stepBall(state, turn, b, dt);
  }

  // The hard stop is a RULE, not a presentation choice, so it lives here and
  // the bots see it too. Anything still in flight is parked where it is.
  if (turn.t >= TUNE.turnHardStop) {
    for (let i = 0; i < turn.balls.length; i++) {
      const b = turn.balls[i];
      if (!b.live) continue;
      b.live = false; b.vx = 0; b.vy = 0;
      b.y = floorY() - TUNE.ballR;
      b.x = clamp(b.x, TUNE.ballR, fieldW() - TUNE.ballR);
      if (turn.firstLandedX === null) turn.firstLandedX = b.x;
    }
    turn.fired = turn.count;
    turn.stopped = true;
    turn.done = true;
    return;
  }

  if (turn.fired >= turn.count) {
    let any = false;
    for (let i = 0; i < turn.balls.length; i++) if (turn.balls[i].live) { any = true; break; }
    if (!any) turn.done = true;
  }
}

function runToEnd(state, turn) {
  const dt = TUNE.simDt;
  let guard = Math.ceil(TUNE.turnHardStop / dt) + 64;
  while (!turn.done && guard-- > 0) stepTurn(state, turn, dt);
  turn.done = true;
  return turn;
}

/* The field descends by one row and a fresh row arrives at the top; unshifting
   IS the descent. A row pushed past the bottom slot ends the run, but only if
   it still holds a block or a mirror. An uncollected pickup falls out
   harmlessly, because it never occupied space you could not clear. */
function descend(state) {
  state.rows.unshift(makeRow(state.rng, state.level));
  if (state.rows.length > TUNE.rows) {
    const pushed = state.rows.pop();
    for (let i = 0; i < pushed.length; i++) {
      const c = pushed[i];
      if (!c) continue;
      if (isLethal(c)) { state.over = true; break; }
    }
  }
}

function resolveTurn(state, turn) {
  state.score += turn.hpDestroyed;
  state.balls += turn.pickups;
  state.shots += 1;
  if (turn.firstLandedX !== null) {
    state.launchX = clamp(turn.firstLandedX, TUNE.ballR, fieldW() - TUNE.ballR);
  }
  descend(state);
  state.level += 1;
  return state;
}

/* One turn, start to finish, on a throwaway copy. This is what the greedy bot
   in the gate calls sixty times per turn, so it allocates nothing it does not
   need and records no events. */
function tryAngle(state, angle) {
  const s = cloneState(state);
  const turn = startTurn(s, angle);
  runToEnd(s, turn);
  return { hp: turn.hpDestroyed, breaks: turn.breaks, pickups: turn.pickups, t: turn.t };
}

/* ---------- the aim line ----------
   The segment to the first contact, then ONE reflected segment, then stop. Not
   the full path: showing where the ball actually ends up removes the read that
   makes the aim a decision at all. */
function previewPath(state, angle) {
  const R = TUNE.ballR, W = fieldW(), FY = floorY(), dt = TUNE.simDt;
  const a = legalAngle(angle);
  const b = {
    x: state.launchX, y: FY - R,
    vx: Math.cos(a) * TUNE.ballSpeed, vy: -Math.sin(a) * TUNE.ballSpeed,
  };
  const pts = [{ x: b.x, y: b.y }];
  let contacts = 0, guard = Math.ceil(3.0 / dt);

  while (contacts < 2 && guard-- > 0) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    let touched = false;

    if (b.x < R)          { b.x = R;     b.vx =  Math.abs(b.vx); touched = true; }
    else if (b.x > W - R) { b.x = W - R; b.vx = -Math.abs(b.vx); touched = true; }
    if (b.y < R)          { b.y = R;     b.vy =  Math.abs(b.vy); touched = true; }

    if (!touched) {
      const C = TUNE.cell;
      const c0 = Math.max(0, Math.floor((b.x - R) / C));
      const c1 = Math.min(TUNE.cols - 1, Math.floor((b.x + R) / C));
      const r0 = Math.max(0, Math.floor((b.y - R) / C));
      const r1 = Math.min(state.rows.length - 1, Math.floor((b.y + R) / C));
      let best = null;
      for (let r = r0; r <= r1; r++) {
        const row = state.rows[r]; if (!row) continue;
        for (let c = c0; c <= c1; c++) {
          const cell = row[c];
          if (!cell || cell.t === 'p') continue;
          const h = cell.t === 'm' ? hitMirror(b, r, c, cell.d) : hitBlock(b, r, c);
          if (h && (!best || h.pen > best.pen)) best = h;
        }
      }
      if (best) {
        touched = best.kind === 'm' ? reflectMirror(b, best) : reflectBlock(b, best);
        if (touched) antiStall(b);
        else touched = true;               // grazed: still the end of a segment
      }
    }

    if (touched) { pts.push({ x: b.x, y: b.y }); contacts++; }
    if (b.y >= FY - R && b.vy > 0) { pts.push({ x: b.x, y: b.y }); break; }
  }
  if (pts.length < 2) pts.push({ x: b.x, y: b.y });
  return pts;
}

/* How many more descents before the lowest blocker is pushed past the line, if
   the player clears nothing between now and then. A row at index r is popped
   after (rows - r) descents, so the lowest occupied row decides it.

   This is derived entirely from what is already on screen, so showing it hands
   the player no information the board was not already telling them. It just
   spares them counting rows under pressure, which is exactly the sum nobody
   does correctly while deciding where to aim. */
function turnsToLine(state) {
  for (let r = state.rows.length - 1; r >= 0; r--) {
    const row = state.rows[r];
    if (!row) continue;
    for (let c = 0; c < TUNE.cols; c++) {
      const cell = row[c];
      if (!cell) continue;
      if (isLethal(cell)) return TUNE.rows - r;
    }
  }
  return TUNE.rows;
}

/* ---------- HP bands ----------
   By band, never by exact value: the player reads "how hard is this side of the
   board", not an arithmetic. Band index only; the colours are the renderer's. */
function band(hp) {
  if (hp <= 12) return 0;
  if (hp <= 23) return 1;
  if (hp <= 35) return 2;
  return 3;
}

return {
  TUNE, DEG,
  makeRng, makeRow, newState, cloneState,
  fieldW, floorY, clamp, legalAngle, colScale, pickupP,
  startTurn, stepTurn, runToEnd, resolveTurn, tryAngle, turnsToLine, isLethal,
  previewPath, descend, band,
};
}));
