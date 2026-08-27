/* ============================================================
   BALLAST · the rules
   ------------------------------------------------------------
   The model: a run, its score, and what a drop does. No DOM, no
   canvas, no timing. play.js draws this and tune-gate.mjs measures
   it, and because they share it the gate cannot end up measuring a
   different game from the one that ships.
   ============================================================ */
(function (root) {
  'use strict';
  const P = root.BallastPhys;
  const { World, makeBody, makeRng, resetIds, TIER_R } = P;

  const TUNE = {
    DROP_COOLDOWN: 0.35,        // s, the brief's 350ms floor
    SPAWN_ABOVE_RIM: 46,        // local px above the rim that a piece starts
    NEXT_WEIGHTS: [0.45, 0.35, 0.20],   // tiers 0, 1, 2
    SCORE_PER_TIER: 10,         // merging into tier t scores t*t*THIS
    CLEAR_BONUS: 5000,          // the double top-tier cancel
    GRACE: 1.0,                 // s a new piece has to get inside before the
                                // spill test may judge it
    /* Where the drop point lives. 'local' swings with the vessel, which
       the brief specified for a bowl hanging from a pivot. 'world' is a
       fixed overhead rail: the claw does not tilt with the pot, so when
       the pot leans, the same rail position lands somewhere else inside
       it. That difference IS the calculation the player is being asked
       to make, and it only exists in world space. */
    AIM_SPACE: 'local',   /* MEASURED, 30 seeds. A fixed overhead rail was the
                             obvious home for a claw, but it costs on both gate
                             metrics: local 1.54x B/M and IQR/med 0.40, rail
                             0.85x-1.56x and IQR 0.51-0.95, depending on whether
                             the player compensates for the lean. Keeping the
                             release point on the vessel leaves the tilt drift
                             where it already was, and that drift is the
                             calculation; the guide line was what removed it. */
    INTERIOR_W: 300,
    INTERIOR_H: 410,
    RIM_Y: 158
  };

  function pickTier(rng) {
    const r = rng(), w = TUNE.NEXT_WEIGHTS;
    return r < w[0] ? 0 : (r < w[0] + w[1] ? 1 : 2);
  }

  function Run(seed, phys) {
    resetIds();
    this.seed = seed >>> 0;
    this.rng = makeRng(this.seed);
    this.world = new World({
      pivotX: 0, pivotY: 0,
      interiorW: TUNE.INTERIOR_W, interiorH: TUNE.INTERIOR_H, rimY: TUNE.RIM_Y,
      phys: phys || {}
    });
    this.score = 0;
    this.biggest = -1;
    this.everReached = 0;
    this.nextTier = pickTier(this.rng);
    this.dropped = 0;
    this.merges = 0;
    this.cooldown = 0;
    this.time = 0;
    this.over = false;
    this.cause = '';
    this.events = [];
  }

  Run.prototype.canDrop = function () { return !this.over && this.cooldown <= 0; };

  /* The aim is clamped so a piece can never be spawned intersecting a
     wall, which would otherwise be resolved as a launch. */
  Run.prototype.clampAim = function (lx, tier) {
    const t = tier == null ? this.nextTier : tier;
    const m = TUNE.AIM_SPACE === 'world' ? this.railHalf(t) : this.world.halfW - TIER_R[t] - 3;
    return Math.max(-m, Math.min(m, lx));
  };

  /* The rail spans the vessel's own width plus a little, in world x. */
  Run.prototype.railHalf = function (tier) {
    return this.world.halfW + 16 - TIER_R[tier];
  };
  Run.prototype.spawnPoint = function (ax, tier) {
    const w = this.world;
    if (TUNE.AIM_SPACE === 'world') {
      const m = this.railHalf(tier);
      const x = Math.max(-m, Math.min(m, ax));
      // The claw hangs above everything, at a fixed height in the world.
      return { x: x, y: w.rimY - TUNE.SPAWN_ABOVE_RIM - TIER_R[tier] };
    }
    const p = {};
    w.toWorld(this.clampAim(ax, tier), w.rimY - TUNE.SPAWN_ABOVE_RIM - TIER_R[tier], p);
    return p;
  };
  /* Given a place you want it to LAND, where does the claw go? Straight
     down from the claw, so it is that point's world x. In local aim this
     is the identity; in world aim it is the tilt compensation, and doing
     it in your head is the skill. */
  Run.prototype.aimForLocal = function (lx, tier) {
    if (TUNE.AIM_SPACE !== 'world') return this.clampAim(lx, tier);
    const p = {};
    this.world.toWorld(lx, this.world.floorY, p);
    const m = this.railHalf(tier);
    return Math.max(-m, Math.min(m, p.x));
  };

  Run.prototype.drop = function (aimLocalX) {
    if (!this.canDrop()) return null;
    const tier = this.nextTier;
    const p = this.spawnPoint(aimLocalX, tier);
    const b = makeBody(p.x, p.y, tier);
    if (!this.world.add(b)) return null;   // body cap: a backstop, not normal play
    b.age = 0; b.entered = false;
    this.cooldown = TUNE.DROP_COOLDOWN;
    this.note(tier);          // the small tiers are part of the set too
    this.dropped++;
    this.nextTier = pickTier(this.rng);
    return b;
  };

  Run.prototype.note = function (t) {
    if (t > this.biggest) this.biggest = t;
    this.everReached |= (1 << t);
  };

  /* Overflow at the top and spill over the low rim are deliberately the
     same event: above the rim there is no wall, so a pile heaped over it
     rolls off on its own and the rule count stays down. */
  const _o = {};
  Run.prototype.checkSpill = function () {
    const w = this.world;
    // Going over is its own ending, and it happens before the contents
    // have finished leaving.
    if (w.toppled) return 'topple';
    for (let i = 0; i < w.bodies.length; i++) {
      const b = w.bodies[i];
      w.toLocal(b.x, b.y, _o);
      if (!b.entered && _o.y > w.rimY + b.r * 0.3) b.entered = true;
      if ((b.age || 0) < TUNE.GRACE) continue;
      if (_o.y < w.rimY - b.r * 0.4) return 'spill';
      if (Math.abs(_o.x) > w.halfW + b.r * 1.5) return 'spill';
      if (_o.y > w.floorY + b.r * 1.5) return 'spill';
    }
    return null;
  };

  Run.prototype.advance = function (dt) {
    this.events.length = 0;
    if (this.over) return this.events;
    this.time += dt;
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);

    const bs = this.world.bodies;
    for (let i = 0; i < bs.length; i++) bs[i].age = (bs[i].age || 0) + dt;
    this.world.step(dt);

    const evs = this.world.resolveMerges();
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i];
      if (ev.type === 'clear') {
        this.score += TUNE.CLEAR_BONUS;
      } else {
        this.score += ev.tier * ev.tier * TUNE.SCORE_PER_TIER;
        this.note(ev.tier);
        ev.body.age = TUNE.GRACE * 0.5;
        ev.body.entered = true;
      }
      this.merges++;
      this.events.push(ev);
    }
    for (let i = 0; i < bs.length; i++) if (bs[i].tier > this.biggest) this.note(bs[i].tier);

    const cause = this.checkSpill();
    if (cause) { this.over = true; this.cause = cause; }
    return this.events;
  };

  /* Centre of mass in vessel-local x: what the balance bot reads and
     what the tilt is computed from. Positive is right of centre. */
  Run.prototype.comX = function () { return this.world.com.x; };

  const API = { TUNE: TUNE, Run: Run, pickTier: pickTier, TIER_R: TIER_R };
  root.BallastRules = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
