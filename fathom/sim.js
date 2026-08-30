/* ============================================================
   FATHOM: THE DIG · the simulation
   ------------------------------------------------------------
   A drowned trench of clay, tiled. The sub digs by leaning into
   a wall; the tile cracks, gives, and floods. Ore drills into
   the hold. Everything heavy makes the sub heavier, and the
   only way up is to be light.

   No DOM, no canvas, no timing. play.js draws this and
   tune-gate.mjs (Milestone 2) will measure it, and because they
   share this file the gate cannot end up measuring a different
   game from the one that ships.

   Everything is reproducible from the seed: strata, caverns,
   veins, gas, landmark placement. No Math.random() in here.
   Fixed timestep 1/120 s behind an accumulator; same seed +
   same input history is the same run, exactly. The world
   mutates as you dig, so determinism is over (seed + inputs).

   Units: metres, kilograms, seconds. y is depth, positive down.
   ============================================================ */
(function (root) {
'use strict';

/* ------------------------------------------------------------
   TUNE — one object, the whole game's numbers.

   Values marked LOCKED are owner feel-locks from five play
   rounds of the open-water build plus the dig prototype. A gate
   may not move them without a new owner playtest. Everything
   unmarked is a starting guess the Milestone-2 gate is expected
   to move.
   ------------------------------------------------------------ */
const TUNE = {
  // ---- world ----
  TILE: 8, COLS: 40, ROWS: 110, SEA_ROWS: 9,
  regionRows: [9, 34, 62, 88],
  BED_ROWS: 2,                  // undiggable floor, bottom of the grid

  // ---- the law — LOCKED (five owner play-rounds) ----
  DISPLACEMENT: 1000, HULL_DRY: 700, ballastMax: 400,
  buoyK: 0.32, vMax: 90, vyResponse: 14,
  floodRate: 260, blowRate: 260, trimRate: 260,
  airPerKg: 0.04, lifeSupport: 0.35, surfaceRegen: 25,
  thrustAccel: 90, hMax: 52, drag: 1.3, subR: 4.2, thrustBattery: 3.0,

  // ---- camera — LOCKED (owner: "the perfect ratio") ----
  VIEW_W: 55,

  /* colR is NOT one of the locked constants and is not a change to
     one. The locked set was measured in open water, where nothing
     collided; it contains no tile-collision radius because that
     world had no tiles. subR 4.2 draws and feels the hull. Used as
     a collider against 8 m tiles it makes the sub 8.4 m across —
     wider than the 8 m shaft it digs — and the sub jitters between
     its own walls, which no open-water play round could have felt.
     3.3 gives 6.6 m in an 8 m shaft: 1.4 m of play, no jitter. */
  colR: 3.3,
  surfaceY: 3,                  // above this the sub is "at the surface"

  // ---- digging ----
  hardness: { silt: 0.7, rock: 1.7, hard: 3.2, nodule: 1.0, sulphide: 1.3,
              crystal: 1.5, gas: 0.5 },
  drillMul: [0.8, 1.0, 1.25, 1.55, 1.9], hardNeedsDrill: 3,
  digBatt: 2.2,
  digReach: 0.6,                // metres past the hull a held direction reaches

  // ---- ore ----
  ore: { nodule:   { kg: 20, val: 26 },
         sulphide: { kg: 12, val: 48 },
         crystal:  { kg: 5,  val: 95 } },
  veinLen: [3, 7],
  oreDensity: { shelf: 0.055, ribs: 0.038, blackreach: 0.028, foundry: 0.02 },
  veinShare: 0.55,              // of that density, the part that arrives in veins
  gasDensity: 0.013,
  cavernsPerRegion: [6, 11, 8, 5],

  // ---- gas & air architecture (M4 uses the rest of these) ----
  fluidHz: 8, airRefill: 6, gasBurstVy: -46, gasBurstS: 1.15,
  gasUnitsPerPocket: 3,

  // ---- relics (M3) ----
  relicVals: { idol: 400, strongbox: 700, megacrystal: 1200, heart: 2000 },
  relicFall: 30, relicNoise: 4, bellsPerRegion: [0, 1, 2, 2],

  // ---- hull & magma ----
  hullPips: 5, magmaPipsPer2s: 1, scrapeSpeed: 55, magmaMeltS: 20,
  magmaDensity: 0.055,          // of Foundry cells, before veining

  // ---- noise & the Tenant (M5) ----
  noise: { hover: 0, thrust: 2, dig: 3, relicLand: 4, blow: 5, gasBurst: 5 },
  tenant: { hearThreshold: 3, hearRadius: 150, calmSeconds: 4.0, ramPips: 2,
            minNetworkCells: 60, homeRow: 34 },

  // ---- lamp — LOCKED shape (prototype-felt): fog radius in metres ----
  lampR: function (LAMP) { return 13 + LAMP * 4.5; },

  // ---- fleet tiers ----
  airMax:   [110, 150, 205, 275, 365],
  cargoMax: [120, 160, 210, 270, 340],
  battMax:  [100, 140, 190, 250, 320],
};

/* Region handles. The owner may rename these; nothing keys off the
   strings except copy. */
const REGIONS = [
  { key: 'shelf',      name: 'The Shelf' },
  { key: 'ribs',       name: 'The Ribs' },
  { key: 'blackreach', name: 'Blackreach' },
  { key: 'foundry',    name: 'The Foundry' },
];

// ---------- CELL STATES ----------
const T_WATER = 0, T_SILT = 1, T_ROCK = 2, T_HARD = 3,
      T_NOD = 4, T_SUL = 5, T_CRY = 6,
      T_GAS = 7, T_MAGMA = 8, T_BED = 9, T_AIR = 10;
const T = { WATER: T_WATER, SILT: T_SILT, ROCK: T_ROCK, HARD: T_HARD,
            NOD: T_NOD, SUL: T_SUL, CRY: T_CRY, GAS: T_GAS,
            MAGMA: T_MAGMA, BED: T_BED, AIR: T_AIR };

const ORE_OF = {};
ORE_OF[T_NOD] = 'nodule'; ORE_OF[T_SUL] = 'sulphide'; ORE_OF[T_CRY] = 'crystal';
const HARD_KEY = {};
HARD_KEY[T_SILT] = 'silt'; HARD_KEY[T_ROCK] = 'rock'; HARD_KEY[T_HARD] = 'hard';
HARD_KEY[T_NOD] = 'nodule'; HARD_KEY[T_SUL] = 'sulphide';
HARD_KEY[T_CRY] = 'crystal'; HARD_KEY[T_GAS] = 'gas';

// A cell you can stand on / dig into. AIR (M4) is passable like water.
const isSolidType = (t) => t !== T_WATER && t !== T_AIR;
// A cell nothing can ever remove.
const isFixedType = (t) => t === T_BED || t === T_MAGMA;

/* ------------------------------------------------------------
   LANDMARK STAMPS — a plain data structure an artist can edit.

   One string per row. Characters:
     .  leave whatever the generator made
     ~  water (carve it out)
     S  silt        #  rock        H  hard rock
     n  nodule      s  sulphide    c  crystal
     g  gas pocket  M  magma       B  bedrock

   No stamp uses bedrock for a wall a player could end up behind:
   hard rock is the heaviest thing a structure is allowed to be,
   so a sub that can reach a place can always dig out of it.
   ------------------------------------------------------------ */
const STAMP_CHARS = { '~': T_WATER, 'S': T_SILT, '#': T_ROCK, 'H': T_HARD,
                      'n': T_NOD, 's': T_SUL, 'c': T_CRY, 'g': T_GAS,
                      'M': T_MAGMA, 'B': T_BED };

const LANDMARKS = [
  { region: 0, key: 'nursery', name: 'The Nursery', rows: [
    '..############..',
    '.##~~~~~~~~~~##.',
    '##~~n~~~~~~n~~##',
    '#~~~~~~gg~~~~~~#',
    '#~~n~~~~~~~~n~~#',
    '##~~~~~n~~~~~~##',
    '.##~~~~~~~~~~##.',
    '..############..',
  ] },
  { region: 1, key: 'ribcage', name: 'The Ribcage', rows: [
    '~~~~~~~~~~~~~~~~~~',
    '~HH~~~~~~~~~~~~HH~',
    '~~HH~~~~~~~~~~HH~~',
    '~~~HH~~~~~~~~HH~~~',
    '~~~~HH~~~s~~HH~~~~',
    '~~~~~HH~~~~HH~~~~~',
    '~~~~~~HH~~HH~~~~~~',
    '~~~~~~~HHHH~~~~~~~',
    '~~~~~~~~~~~~~~~~~~',
  ] },
  { region: 2, key: 'hall', name: 'The Drowned Hall', rows: [
    'HHHHHHHHHHHHHHHH',
    'H~~~~~~~~~~~~~~H',
    'H~HH~~~HH~~~HH~H',
    'H~HH~c~HH~~~HH~H',
    'H~HH~~~HH~c~HH~H',
    'H~~~~~~~~~~~~~~H',
    'H~~~~~~~~~~~~~~H',
    'HHHHHH~~~~HHHHHH',
  ] },
  { region: 3, key: 'vent', name: 'The Great Vent', rows: [
    '~~~~HH~~~~~~HH~~~~',
    '~~~HH~~~~~~~~HH~~~',
    '~~HH~~~MM~~~~~HH~~',
    '~~H~~~MMMM~~c~~H~~',
    '~~H~~~MMMM~~~~~H~~',
    '~~HH~~~MM~~c~~HH~~',
    '~~~HH~~~~~~~~HH~~~',
    '~~~~HHH~~~~HHH~~~~',
  ] },
];

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
// Deterministic per-lattice-point hash, for the seabed's undulation.
function hash1(i, salt) {
  let h = (i * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;   // [-1, 1]
}
function smooth(t) { return t * t * (3 - 2 * t); }
function vnoise(t, scale, salt) {
  const u = t / scale, i = Math.floor(u), f = smooth(u - i);
  return hash1(i, salt) * (1 - f) + hash1(i + 1, salt) * f;
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/* ============================================================
   THE WORLD
   ============================================================ */
function World(seed, tuneOverride) {
  const t = Object.assign({}, TUNE, tuneOverride || {});
  this.tune = t;
  this.seed = seed >>> 0;
  this.COLS = t.COLS; this.ROWS = t.ROWS; this.TILE = t.TILE;
  this.widthM = t.COLS * t.TILE;
  this.depthM = t.ROWS * t.TILE;
  this.grid = new Uint8Array(t.COLS * t.ROWS);      // 0 = WATER
  this.landmarks = [];                              // {key, name, c, r, w, h}
  this.startX = Math.round(t.COLS / 2) * t.TILE;    // the dive starts mid-map
  this._generate();
  /* The pristine grid, kept so a save can be replayed as
     "the world, then everything you dug out of it". */
  this.pristine = this.grid.slice();
}

World.prototype.regionOf = function (r) {
  const rr = this.tune.regionRows;
  if (r < rr[0]) return -1;                          // open sea
  for (let i = rr.length - 1; i >= 0; i--) if (r >= rr[i]) return i;
  return 0;
};
World.prototype.at = function (c, r) {
  if (c < 0 || c >= this.COLS) return T_BED;         // the map's side walls
  if (r < 0) return T_WATER;
  if (r >= this.ROWS) return T_BED;
  return this.grid[r * this.COLS + c];
};
World.prototype.set = function (c, r, v) {
  if (c < 0 || c >= this.COLS || r < 0 || r >= this.ROWS) return;
  this.grid[r * this.COLS + c] = v;
};
// Metres in, "is there rock here" out.
World.prototype.solidAt = function (x, y) {
  return isSolidType(this.at(Math.floor(x / this.TILE), Math.floor(y / this.TILE)));
};
World.prototype.seabedRow = function (c) {
  return this._bedTop ? this._bedTop[clamp(c, 0, this.COLS - 1)] : this.tune.SEA_ROWS;
};

World.prototype._generate = function () {
  const t = this.tune, rng = mulberry32(this.seed);
  const COLS = this.COLS, ROWS = this.ROWS, SEA = t.SEA_ROWS;
  const g = this.grid;
  const lastRock = ROWS - t.BED_ROWS - 1;

  /* 1. The seabed's top edge undulates a few tiles, so the Shelf reads
        as ground rather than as a ruled line. */
  const bedTop = new Int16Array(COLS);
  for (let c = 0; c < COLS; c++) {
    bedTop[c] = SEA + Math.round(vnoise(c, 7.5, 3) * 2.2 + vnoise(c, 2.6, 17) * 0.9);
    bedTop[c] = clamp(bedTop[c], SEA - 2, SEA + 3);
  }
  this._bedTop = bedTop;

  /* 2. Strata. Each region has a material mix; the mix slides across the
        region so the boundary is a gradient, not a seam. */
  const MIX = [
    { silt: 0.86, rock: 0.14, hard: 0.00 },   // The Shelf
    { silt: 0.34, rock: 0.66, hard: 0.00 },   // The Ribs
    { silt: 0.06, rock: 0.70, hard: 0.24 },   // Blackreach
    { silt: 0.02, rock: 0.52, hard: 0.46 },   // The Foundry
  ];
  for (let r = SEA - 2; r <= lastRock; r++) {
    const reg = Math.max(0, this.regionOf(r));
    const rr = t.regionRows;
    const regTop = rr[reg];
    const regBot = reg + 1 < rr.length ? rr[reg + 1] : lastRock + 1;
    const f = clamp((r - regTop) / Math.max(1, regBot - regTop), 0, 1);
    const A = MIX[reg], B = MIX[Math.min(MIX.length - 1, reg + 1)];
    const silt = A.silt + (B.silt - A.silt) * f * 0.6;
    const hard = A.hard + (B.hard - A.hard) * f * 0.6;
    /* Hard rock never forms in the first two rows of a region: the
       boundary you arrive through is always diggable. */
    const hardHere = (r - regTop) < 2 ? 0 : hard;
    for (let c = 0; c < COLS; c++) {
      if (r < bedTop[c]) continue;                   // still open water above
      const q = rng();
      g[r * COLS + c] = q < silt ? T_SILT : (q < silt + (1 - silt - hardHere) ? T_ROCK : T_HARD);
    }
  }

  /* 3. Natural caverns — pockets of trapped water, denser in The Ribs.
        Each one below The Shelf gets a soft chimney (§forced deaths):
        a column of silt reaching up out of it, so a sub that falls in
        can always dig its way out even without the drill for hard rock. */
  const caverns = [];
  for (let reg = 0; reg < 4; reg++) {
    const rr = t.regionRows;
    const top = rr[reg] + 2;
    const bot = (reg + 1 < rr.length ? rr[reg + 1] : lastRock) - 2;
    const n = t.cavernsPerRegion[reg];
    for (let i = 0; i < n; i++) {
      const cc = 2.5 + rng() * (COLS - 5);
      const cr = top + rng() * Math.max(1, bot - top);
      const rw = 1.3 + rng() * 2.8, rh = 0.9 + rng() * 1.9;
      for (let r = Math.max(SEA, Math.floor(cr - rh)); r <= Math.min(lastRock, Math.ceil(cr + rh)); r++) {
        for (let c = Math.max(0, Math.floor(cc - rw)); c <= Math.min(COLS - 1, Math.ceil(cc + rw)); c++) {
          const dx = (c - cc) / rw, dy = (r - cr) / rh;
          if (dx * dx + dy * dy < 1) g[r * COLS + c] = T_WATER;
        }
      }
      caverns.push({ c: Math.round(cc), r: Math.floor(cr - rh), reg });
    }
  }
  for (const cv of caverns) {
    if (cv.reg === 0) continue;                      // the Shelf has no hard rock
    for (let r = cv.r; r > cv.r - 14 && r >= SEA; r--) {
      const v = g[r * COLS + cv.c];
      if (v === T_HARD || v === T_ROCK) g[r * COLS + cv.c] = T_SILT;
    }
  }

  /* 4. Magma, in the Foundry only. Short vertical veins: a wall of heat
        you route around, and the region's one light source. */
  {
    const top = t.regionRows[3] + 1;
    const nVeins = Math.round((lastRock - top) * COLS * t.magmaDensity / 5);
    for (let i = 0; i < nVeins; i++) {
      let c = 1 + Math.floor(rng() * (COLS - 2));
      let r = top + Math.floor(rng() * Math.max(1, lastRock - top));
      const len = 2 + Math.floor(rng() * 4);
      for (let k = 0; k < len; k++) {
        if (r > lastRock || r < top) break;
        if (g[r * COLS + c] !== T_WATER) g[r * COLS + c] = T_MAGMA;
        r += rng() < 0.75 ? 1 : 0;
        c += rng() < 0.3 ? (rng() < 0.5 ? -1 : 1) : 0;
        c = clamp(c, 1, COLS - 2);
      }
    }
  }

  /* 5. Ore: seeded scatter plus veins. A vein glimpsed at the lamp's
        edge is the pull deeper, so most of the value walks. */
  const ORE_BY_REGION = [
    [[T_NOD, 1.0]],
    [[T_NOD, 0.55], [T_SUL, 0.45]],
    [[T_SUL, 0.45], [T_CRY, 0.55]],
    [[T_SUL, 0.2], [T_CRY, 0.8]],
  ];
  const DENSITY = [t.oreDensity.shelf, t.oreDensity.ribs,
                   t.oreDensity.blackreach, t.oreDensity.foundry];
  const pickOre = (reg, q) => {
    const table = ORE_BY_REGION[reg];
    let acc = 0;
    for (const [type, w] of table) { acc += w; if (q <= acc) return type; }
    return table[table.length - 1][0];
  };
  for (let reg = 0; reg < 4; reg++) {
    const rr = t.regionRows;
    const top = rr[reg];
    const bot = (reg + 1 < rr.length ? rr[reg + 1] : lastRock + 1) - 1;
    const cells = (bot - top + 1) * COLS;
    const budget = cells * DENSITY[reg];
    // scatter
    const singles = Math.round(budget * (1 - t.veinShare));
    for (let i = 0; i < singles; i++) {
      const c = Math.floor(rng() * COLS), r = top + Math.floor(rng() * (bot - top + 1));
      const v = g[r * COLS + c];
      if (v === T_SILT || v === T_ROCK || v === T_HARD) g[r * COLS + c] = pickOre(reg, rng());
    }
    // veins: a seeded walk, 3 to 7 tiles
    const avgLen = (t.veinLen[0] + t.veinLen[1]) / 2;
    const nVeins = Math.round(budget * t.veinShare / avgLen);
    for (let i = 0; i < nVeins; i++) {
      let c = Math.floor(rng() * COLS), r = top + Math.floor(rng() * (bot - top + 1));
      const type = pickOre(reg, rng());
      const len = t.veinLen[0] + Math.floor(rng() * (t.veinLen[1] - t.veinLen[0] + 1));
      for (let k = 0; k < len; k++) {
        const v = g[r * COLS + c];
        if (v === T_SILT || v === T_ROCK || v === T_HARD) g[r * COLS + c] = type;
        const d = rng();
        if (d < 0.34) c += 1; else if (d < 0.68) c -= 1;
        r += rng() < 0.62 ? 1 : (rng() < 0.5 ? -1 : 0);
        c = clamp(c, 0, COLS - 1); r = clamp(r, top, bot);
      }
    }
  }

  /* 6. Gas pockets. Tell before trap: these seep visible bubbles, always. */
  for (let r = SEA + 3; r <= lastRock; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = g[r * COLS + c];
      if ((v === T_SILT || v === T_ROCK) && rng() < t.gasDensity) g[r * COLS + c] = T_GAS;
    }
  }

  /* 7. Landmarks: one authored stamp per region, placed by seeded choice,
        kept clear of the centre column so the dive never starts on one. */
  for (const lm of LANDMARKS) {
    const h = lm.rows.length, w = lm.rows[0].length;
    const rr = t.regionRows;
    const top = rr[lm.region] + 2;
    const bot = (lm.region + 1 < rr.length ? rr[lm.region + 1] : lastRock) - h - 1;
    if (bot <= top) continue;
    let c0 = 1 + Math.floor(rng() * Math.max(1, COLS - w - 2));
    const mid = Math.round(COLS / 2);
    if (c0 < mid && c0 + w > mid) c0 = (c0 + w / 2 < mid) ? Math.max(1, mid - w - 1) : Math.min(COLS - w - 1, mid + 2);
    const r0 = top + Math.floor(rng() * (bot - top));
    for (let rr2 = 0; rr2 < h; rr2++) {
      const line = lm.rows[rr2];
      for (let cc = 0; cc < w; cc++) {
        const ch = line[cc];
        if (ch === '.' || ch === undefined) continue;
        const v = STAMP_CHARS[ch];
        if (v === undefined) continue;
        this.set(c0 + cc, r0 + rr2, v);
      }
    }
    this.landmarks.push({ key: lm.key, name: lm.name, region: lm.region,
                          c: c0, r: r0, w, h });
  }

  /* 8. Bedrock: the floor of the world. The side walls are handled by
        at(), so no column of the grid is wasted on them. */
  for (let r = ROWS - t.BED_ROWS; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) g[r * COLS + c] = T_BED;

  /* 9. The open sea above the seabed is water, always — nothing above
        bedTop survives the passes above. */
  for (let r = 0; r < SEA - 2; r++)
    for (let c = 0; c < COLS; c++) g[r * COLS + c] = T_WATER;
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < bedTop[c]; r++) g[r * COLS + c] = T_WATER;
};

/* The dug diff, as a bitset: one bit per cell that was solid in the
   pristine world and is water now. 4400 cells is 550 bytes, ~740
   characters of base64 — a homestead of any age fits in a save. */
World.prototype.diff = function () {
  const n = this.grid.length;
  const bytes = new Uint8Array((n + 7) >> 3);
  for (let i = 0; i < n; i++) {
    if (this.pristine[i] !== T_WATER && this.grid[i] === T_WATER) bytes[i >> 3] |= (1 << (i & 7));
  }
  return b64FromBytes(bytes);
};
World.prototype.applyDiff = function (str) {
  if (!str) return 0;
  const bytes = bytesFromB64(str);
  if (!bytes) return 0;
  let n = 0;
  for (let i = 0; i < this.grid.length; i++) {
    if ((bytes[i >> 3] >> (i & 7)) & 1) {
      if (this.grid[i] !== T_WATER && !isFixedType(this.grid[i])) { this.grid[i] = T_WATER; n++; }
    }
  }
  return n;
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64FromBytes(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] || 0, c = bytes[i + 2] || 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  return out;
}
function bytesFromB64(str) {
  const map = {};
  for (let i = 0; i < B64.length; i++) map[B64[i]] = i;
  const clean = String(str).replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array((clean.length >> 2) * 3);
  let p = 0;
  for (let i = 0; i + 3 < clean.length; i += 4) {
    const n = (map[clean[i]] << 18) | (map[clean[i + 1]] << 12) |
              (map[clean[i + 2]] << 6) | map[clean[i + 3]];
    bytes[p++] = (n >> 16) & 255; bytes[p++] = (n >> 8) & 255; bytes[p++] = n & 255;
  }
  return bytes;
}

/* ============================================================
   THE RUN
   ============================================================ */
function Run(seed, tuneOverride) {
  const t = Object.assign({}, TUNE, tuneOverride || {});
  this.tune = t;
  this.seed = seed >>> 0;
  this.world = new World(this.seed, tuneOverride);
  this.rng = mulberry32(this.seed ^ 0x9E3779B9);

  // loadout tiers (0-based), set by applyLoadout
  this.tier = { air: 0, cargo: 0, batt: 0 };
  this.thrustMul = 1.11;                 // 0.85 + SPEED(2) * 0.13
  this.lamp = 1; this.drill = 1;

  this.money = 0;
  this.dives = 0;
  this.bestDepth = 0;
  this.digTiles = 0;                     // per run, for analytics
  this.mode = 'dive';                    // 'dive' | 'blackout' | 'breach'
  this.events = [];
  this._acc = 0;
  this.time = 0;
  this.progress = new Map();             // half-cracked tiles: key -> seconds done
  this.regionsSeen = [false, false, false, false];

  this._reset();
}

Run.prototype._reset = function () {
  const t = this.tune;
  this.x = this.world.startX; this.y = 1.5;
  this.vx = 0; this.vy = 0;
  this.ballast = t.DISPLACEMENT - t.HULL_DRY;    // neutral trim, hovering
  this.cargo = []; this.cargoKg = 0;
  this.air = this.airMax(); this.batt = this.battMax();
  this.hull = t.hullPips;
  this.facing = 1;
  this.gasBoost = 0;
  this.noise = 0;
  this.digTarget = null; this.digFrac = 0;
  this.holdFull = false; this.tooHard = false;
  this.onFloor = false; this.onCeil = false;
  this._blowing = false; this._flooding = false; this._thrusting = false;
  this._digging = false;
  this.digTiles = 0;
};

Run.prototype.applyLoadout = function (lo) {
  this.tier.air = clamp(lo.air | 0, 0, 4);
  this.tier.cargo = clamp(lo.cargo | 0, 0, 4);
  this.tier.batt = clamp(lo.batt | 0, 0, 4);
  this.thrustMul = lo.thrustMul || 1;
  this.lamp = lo.lamp || 1;
  this.drill = lo.drill || 1;
  this.air = Math.min(this.air, this.airMax());
  this.batt = Math.min(this.batt, this.battMax());
};
Run.prototype.airMax = function () { return this.tune.airMax[this.tier.air]; };
Run.prototype.cargoMax = function () { return this.tune.cargoMax[this.tier.cargo]; };
Run.prototype.battMax = function () { return this.tune.battMax[this.tier.batt]; };
Run.prototype.lampR = function () { return this.tune.lampR(this.lamp); };
Run.prototype.net = function () {
  const t = this.tune;
  return t.DISPLACEMENT - t.HULL_DRY - this.ballast - this.cargoKg;
};
Run.prototype.regionAt = function (y) {
  return this.world.regionOf(Math.floor(y / this.tune.TILE));
};

/* TOO HEAVY, SEALED's heir: at ballast zero the sub still cannot rise,
   because the hold outweighs the hull's spare buoyancy. Reported in
   kilograms, live. Informational — DROP CARGO always works.

   The brief writes the trigger as cargoKg > DISPLACEMENT - HULL_DRY.
   It is >= here: at exact equality net is zero, which hovers, and a sub
   that hovers forever has not risen. */
Run.prototype.tooHeavyNeed = function () {
  const t = this.tune;
  const spare = t.DISPLACEMENT - t.HULL_DRY;
  if (this.cargoKg < spare) return 0;
  return Math.max(1, Math.ceil(this.cargoKg - spare));
};

Run.prototype.step = function (inp, dt) {
  this.events.length = 0;
  this._acc += Math.min(0.05, dt || 0);
  const h = 1 / 120;
  let guard = 0;
  while (this._acc >= h && guard++ < 32) { this._acc -= h; this._fixed(inp || {}, h); }
  return this.events;
};

Run.prototype._fixed = function (inp, h) {
  const t = this.tune, W = this.world;
  this.time += h;
  const down = !!inp.down;
  const up = !down && !!inp.up;
  const ax = clamp(inp.ax || 0, -1, 1);

  // ---------- BALLAST: the law, verbatim ----------
  this._flooding = false; this._blowing = false;
  if (down) {
    this.ballast = Math.min(t.ballastMax, this.ballast + t.floodRate * h);
    this._flooding = true;
  } else if (up) {
    const blow = Math.min(t.blowRate * h, this.ballast, Math.max(0, this.air) / t.airPerKg);
    if (blow > 0) { this.ballast -= blow; this.air -= blow * t.airPerKg; this._blowing = true; }
  } else {
    /* Release trims to a dead hover, free — it is only moving water, and
       it can never produce ascent. Measured drift 0.00 m over 5 s. */
    const target = clamp(t.DISPLACEMENT - t.HULL_DRY - this.cargoKg, 0, t.ballastMax);
    const d = clamp(target - this.ballast, -t.trimRate * h, t.trimRate * h);
    this.ballast += d;
  }

  // ---------- AIR, BATTERY, THE SURFACE ----------
  const surfaced = this.y <= t.surfaceY;
  if (surfaced) {
    this.air = Math.min(this.airMax(), this.air + t.surfaceRegen * h);
    this.batt = Math.min(this.battMax(), this.batt + t.surfaceRegen * h);
    if (this.hull < t.hullPips) this.hull = t.hullPips;    // repairs are free up here
    if (this.cargo.length) {
      let val = 0, kg = 0;
      for (const c of this.cargo) { val += c.val; kg += c.kg; }
      this.money += val;
      this.cargo = []; this.cargoKg = 0;
      this.events.push({ t: 'banked', val, kg, depth: Math.round(this.bestDepth) });
    }
  } else {
    this.air -= t.lifeSupport * h;
    if (this.air <= 0) { this.air = 0; this._end('blackout'); return; }
  }

  // ---------- VERTICAL: buoyancy alone ----------
  let vyT = clamp(-this.net() * t.buoyK, -t.vMax, t.vMax);
  this.vy += (vyT - this.vy) * Math.min(1, t.vyResponse * h);
  if (this.gasBoost > 0) { this.vy = t.gasBurstVy; this.gasBoost -= h; }

  // ---------- HORIZONTAL: thrust on battery ----------
  this._thrusting = false;
  if (ax !== 0 && this.batt > 0) {
    this.vx += ax * t.thrustAccel * this.thrustMul * h;
    this.batt = Math.max(0, this.batt - t.thrustBattery * h);
    this.facing = ax > 0 ? 1 : -1;
    this._thrusting = true;
  }
  this.vx -= this.vx * Math.min(1, t.drag * h);
  const hCap = t.hMax * this.thrustMul;
  this.vx = clamp(this.vx, -hCap, hCap);

  // ---------- INTEGRATE AND COLLIDE, ONE AXIS AT A TIME ----------
  /* The impact speed that counts is the one on the axis that hit. Measured
     as total speed, a sub travelling sideways at full thrust took hull
     damage for brushing a floor it was barely descending onto. */
  const r = t.colR, TILE = t.TILE;
  let impact = 0;
  this.x += this.vx * h;
  if (W.solidAt(this.x + r, this.y)) {
    this.x = Math.floor((this.x + r) / TILE) * TILE - r - 0.01;
    if (this.vx > 0) { impact = Math.max(impact, this.vx); this.vx = 0; }
  }
  if (W.solidAt(this.x - r, this.y)) {
    this.x = Math.ceil((this.x - r) / TILE) * TILE + r + 0.01;
    if (this.vx < 0) { impact = Math.max(impact, -this.vx); this.vx = 0; }
  }
  this.onFloor = false; this.onCeil = false;
  this.y += this.vy * h;
  if (W.solidAt(this.x, this.y + r)) {
    this.y = Math.floor((this.y + r) / TILE) * TILE - r - 0.01;
    if (this.vy > 0) { impact = Math.max(impact, this.vy); this.vy = 0; }
    this.onFloor = true;
  }
  if (W.solidAt(this.x, this.y - r)) {
    this.y = Math.ceil((this.y - r) / TILE) * TILE + r + 0.01;
    if (this.vy < 0) { impact = Math.max(impact, -this.vy); this.vy = 0; }
    this.onCeil = true;
  }
  this.x = clamp(this.x, r + 0.01, W.widthM - r - 0.01);
  if (this.y < 0.6) { this.y = 0.6; if (this.vy < 0) this.vy = 0; }
  /* A loaded sub floods to a terminal 57 m/s and a full hold takes it past
     70, so a long fall in the dark costs a pip. That is learnable and it is
     the whole reason to let go of DOWN: release trims to a hover and the
     fall stops. Five pips, repaired free on every surfacing. */
  if (impact > t.scrapeSpeed) this._hurt(1, 'scrape');

  if (this.y > this.bestDepth) this.bestDepth = this.y;
  const reg = this.regionAt(this.y);
  if (reg >= 0 && !this.regionsSeen[reg]) {
    this.regionsSeen[reg] = true;
    this.events.push({ t: 'region', k: reg, name: REGIONS[reg].name });
  }

  // ---------- DIGGING ----------
  /* Hold a direction into a solid tile and the drill eats it. Digging up
     needs you floating against the ceiling, which needs lift, which is
     the law gatekeeping upward digging by itself. No second button. */
  this._digging = false;
  this.tooHard = false;
  let dc = -1, dr = -1;
  const reach = t.digReach;
  if (down && this.onFloor) { dc = Math.floor(this.x / TILE); dr = Math.floor((this.y + r + reach) / TILE); }
  else if (up && this.onCeil) { dc = Math.floor(this.x / TILE); dr = Math.floor((this.y - r - reach) / TILE); }
  else if (ax > 0 && W.solidAt(this.x + r + reach, this.y)) { dc = Math.floor((this.x + r + reach) / TILE); dr = Math.floor(this.y / TILE); }
  else if (ax < 0 && W.solidAt(this.x - r - reach, this.y)) { dc = Math.floor((this.x - r - reach) / TILE); dr = Math.floor(this.y / TILE); }

  this.digTarget = null; this.digFrac = 0;
  if (dc >= 0) {
    const type = W.at(dc, dr);
    if (isSolidType(type) && !isFixedType(type)) {
      if (type === T_HARD && this.drill < t.hardNeedsDrill) {
        this.tooHard = true;
        this.digTarget = { c: dc, r: dr, blocked: true };
      } else if (this.batt > 0) {
        const key = dr * W.COLS + dc;
        const need = t.hardness[HARD_KEY[type]] || 1;
        const rate = (0.9 + 0.4 * this.thrustMul) * t.drillMul[clamp(this.drill - 1, 0, 4)];
        const p = (this.progress.get(key) || 0) + h * rate;
        this.batt = Math.max(0, this.batt - t.digBatt * h);
        this._digging = true;
        this.digTarget = { c: dc, r: dr, blocked: false };
        this.digFrac = Math.min(1, p / need);
        if (p >= need) {
          this.progress.delete(key);
          W.set(dc, dr, T_WATER);
          this.digTiles++;
          this._broke(type, dc, dr);
        } else {
          this.progress.set(key, p);
        }
      }
    }
  }

  // ---------- DROP CARGO ----------
  if (inp.jettison && this.cargo.length) {
    let pick = 0;
    for (let i = 1; i < this.cargo.length; i++) if (this.cargo[i].kg >= this.cargo[pick].kg) pick = i;
    const item = this.cargo.splice(pick, 1)[0];
    this.cargoKg = Math.max(0, this.cargoKg - item.kg);
    this.events.push({ t: 'jettison', kg: item.kg, type: item.type, x: this.x, y: this.y });
  }

  // ---------- MAGMA ----------
  /* One pip per two seconds of adjacency. Magma glows through a tile of
     neighbouring rock, so the warning always arrives before the burn. */
  const mc = Math.floor(this.x / TILE), mr = Math.floor(this.y / TILE);
  if (W.at(mc + 1, mr) === T_MAGMA || W.at(mc - 1, mr) === T_MAGMA ||
      W.at(mc, mr + 1) === T_MAGMA || W.at(mc, mr - 1) === T_MAGMA) {
    this._hurt(t.magmaPipsPer2s * h / 2, 'magma');
  }

  // ---------- NOISE (the meter is the mix; the Tenant arrives at M5) ----------
  const N = t.noise;
  this.noise = this._blowing ? N.blow : this._digging ? N.dig
             : this._thrusting ? N.thrust : N.hover;

  this.holdFull = false;
};

Run.prototype._broke = function (type, c, r) {
  const t = this.tune, TILE = t.TILE;
  const wx = c * TILE + TILE / 2, wy = r * TILE + TILE / 2;
  const oreKey = ORE_OF[type];
  if (oreKey) {
    const o = t.ore[oreKey];
    if (this.cargoKg + o.kg <= this.cargoMax()) {
      this.cargo.push({ type: oreKey, kg: o.kg, val: o.val });
      this.cargoKg += o.kg;
      this.events.push({ t: 'ore', type: oreKey, kg: o.kg, val: o.val, x: wx, y: wy });
    } else {
      this.holdFull = true;
      this.events.push({ t: 'hold-full', x: wx, y: wy });
    }
  } else if (type === T_GAS) {
    /* Sometimes a disaster, sometimes a free elevator. The gas itself
       does not vanish — at M4 it becomes the rising units that build
       air rooms. Here it is the shove and the noise. */
    this.gasBoost = t.gasBurstS;
    this.noise = t.noise.gasBurst;
    this.events.push({ t: 'gas', x: wx, y: wy });
  } else {
    this.events.push({ t: 'dug', type, x: wx, y: wy });
  }
};

Run.prototype._hurt = function (pips, cause) {
  if (this.mode !== 'dive') return;
  const was = Math.ceil(this.hull);
  this.hull = Math.max(0, this.hull - pips);
  if (Math.ceil(this.hull) < was) this.events.push({ t: 'hull', pips: Math.ceil(this.hull), cause });
  if (this.hull <= 0) this._end('breach');
};

/* Both endings are the same and both are gentle: carried cargo is lost,
   the bank and the world are untouched. A bad run must stay cheap to
   retry, and nothing the world does may ever be a forced loss. */
Run.prototype._end = function (mode) {
  this.mode = mode;
  this.events.push({ t: mode, depth: Math.round(this.y),
                     lostVal: this.cargo.reduce((s, c) => s + c.val, 0),
                     lostKg: Math.round(this.cargoKg) });
};

Run.prototype.revive = function () {
  this.mode = 'dive';
  this._reset();
  this.dives++;
};

/* ---------- SAVE, SCHEMA v2: the homestead ----------
   The bank, the fleet, the ocean's seed and every tile you have ever
   dug out of it. Written on banking and on purchase, never on unload. */
Run.prototype.saveState = function () {
  return {
    v: 2,
    m: Math.round(this.money),
    seed: this.world.seed,
    dug: this.world.diff(),
    best: Math.round(this.bestDepth),
    seen: this.regionsSeen.map(b => b ? 1 : 0),
  };
};
Run.prototype.loadWorldState = function (s) {
  if (!s || (s.v | 0) < 2) return false;
  const n = this.world.applyDiff(s.dug);
  this.bestDepth = Math.max(0, s.best | 0);
  if (Array.isArray(s.seen)) this.regionsSeen = s.seen.map(v => !!v);
  return n >= 0;
};

const API = { TUNE, T, REGIONS, LANDMARKS, Run, World, mulberry32,
              isSolidType, isFixedType, ORE_OF, HARD_KEY };
root.FathomSim = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
