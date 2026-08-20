/* TAILWIND — the flight model, headless, gated before anything is drawn.

   A catapult flings a paper-thin aircraft. It flies, it comes down, it skids,
   it stops. You read the distance and you go again. Yeti Sports, with a wing.

   THE ONE THING THIS MODEL HAS TO GET RIGHT. A craft game earns its "one more
   go" from a response surface you can learn by feel: push the input a little,
   the result moves a little, and in a direction you could have predicted. Both
   inputs therefore have to be two-sided, with the best value somewhere in the
   middle rather than jammed against the end of its range.

   THE FIRST VERSION HAD NEITHER, AND THE MEASUREMENT IS WHY THIS FILE LOOKS
   LIKE IT DOES. Version one was a clean point-mass glider: trimmed wing, lift
   and drag going as v², nose weathercocking toward the flight path through a
   first-order lag. Swept, its response surface was a smooth ramp into the
   corner — best distance at the minimum angle and maximum pull, every time.
   Both inputs pinned to the wall, the whole game solved in five launches.

   That was not a tuning miss. Sweeping wing loading, launch speed and launch
   height showed the two failures trade against each other along one axis, the
   ratio of maximum launch speed to the plane's trim speed. Near 1.0 the plane
   is too heavy to zoom, flight is near enough ballistic, and the best angle
   goes properly interior around 20° — but pull stays pinned at maximum. Above
   about 2.4 the excess lift finally loops the plane hard enough to punish
   over-pull — but the wing now zoom-climbs so efficiently that aiming upward is
   strictly wasted and the best angle collapses to the floor of the range. There
   is no value in between that gives both, and there cannot be: for a rigid
   glider, angle of attack in a steady pull-up works out independent of speed,
   so more launch energy is monotonically more distance and flat always wins.
   The model was not lying. It was saying this is not yet a game.

   A SECOND ATTEMPT, ALSO MEASURED, ALSO WRONG, recorded because it is the
   obvious idea and someone will have it again. A slingshot arm sweeps through
   an arc, so at release its rotation goes into the airframe as a nose-up pitch
   rate; over-draw it and the plane leaves the launcher spinning. Injecting that
   as θ̇ = QK·pull·(M_REF/m) is real, and it is the kind of term that ought to
   punish a hard launch. It does not. Short-period stiffness goes as airspeed,
   so a fast plane is a pitch-stiff plane: traced, the kick from a full draw was
   arrested in 0.07 s and peak angle of attack on a flat maximum launch reached
   only 16°. Raising QK until it mattered did not move the optimum off the wall,
   it just made every launch worse — best distance fell 124 m to 41 m with the
   corner still winning. A disturbance that the plane damps out faster the
   harder you throw it cannot be the penalty for throwing hard.

   WHAT ACTUALLY WORKS is that a wing is not rigid. Load factor goes as
   (v/vtrim)², so the pull-up after a fast launch is a high-g manoeuvre, and
   past some load the tips twist, wash lift out and cost drag. Two things fall
   out of that one term, which is why it is the whole fix:

     it caps the draw — beyond the wing's limit more launch speed buys flex
     rather than height, so the best pull sits inside the range instead of on
     the stop, and sets a different top for every plane, which is where the
     fleet's character lives. NOTE: after the feel pass the best pull moved back
     up against the stop for most of the fleet. That is a live regression, not a
     settled design; balance.js reports it; and

     it taxes the zoom-climb, because a flat launch converts speed to height by
     pulling a hard arc and pays flex for every metre of it while a steep launch
     gains the same height ballistically at one g for free.

   WHERE THIS FILE ACTUALLY STANDS. The numbers quoted in the two sections above
   were measured on the earlier point-mass integrator and are kept because the
   REASONING still holds; the specific figures do not. The airborne step is now
   the flight-path model described at fly(), and Aurora reads: about 590 m, apex
   50 m, descending at 9.1:1 against a wing good for 8.6:1, no stall anywhere in
   the angle range, touching down at about 1 m/s of sink and rolling to a level
   stop.

   THE COST, PLAINLY: the craft gate has not been re-run since the feel work. By
   the last measurement by-feel had fallen from 96% to 77% and the fleet no
   longer balances. Re-run balance.js and measure.js before the other seven
   planes go in. The angle is also still not a decision — it has merely swapped
   walls, since height now buys glide and the best launch sits at ANG_MAX rather
   than ANG_MIN.

   SYMMETRY AND GLIDE ARE THE SAME DIAL, and they pull opposite ways. The
   descent runs LD x apex and the climb about 1/tan(climb angle) x apex, so

       descent / climb  =  LD * tan(climb angle)

   A curve symmetric about its peak therefore needs the launch angle to equal
   the glide angle — 6.6° at LD 8.6 — and any steeper launch necessarily has a
   long tail. Measured: 1.8 at a 10° launch, 2.4 at 20°, 4.8 at 45°. Lowering
   LD tightens the tail and costs glide; that is the whole trade.

   THE ANGLE IS STILL NOT A DECISION, and that is the honest state of this file.
   The flex tax is real but too small to overturn the zoom: measured across the
   balanced fleet the best angle is 3.0-3.1° on all eight planes, the floor of
   the range, and Aurora's angle slice falls monotonically 210, 197, 183, 168,
   154 m as you aim up. It is not a tuning miss either — the corner survived a
   192-combination sweep of wing loading, launch speed, height and drag, and the
   only settings that ever moved it were the chaotic ones this file now damps
   out. On flat ground, with a wing, flat is simply correct. Angle needs a
   reason to exist that the aerodynamics cannot supply, which means terrain: a
   launch lip, a rise, something to clear. Until then treat it as a constant
   rather than an input, and do not read the naive-player gap as evidence the
   angle matters — the naive player is wrong about pull as well.

   The load penalty rises smoothly rather than snapping at a threshold, so the
   surface keeps a ridge you can climb by feel instead of a cliff you fall off.
   That mattered more than expected: cliffs turned out to track weight exactly,
   through the pitch damping ratio, which was defined from weight. By-feel
   distance ran 98/95/94/94% for the four heaviest planes and 72/70/50/44% for
   the four lightest, with adjacent-cell jumps up to 59% of range. Damping is a
   configuration property rather than a mass one, so ζ is now a constant, and
   the worst by-feel across the fleet went from 44% to 94%.

   The plane's attitude θ is a state in its own right rather than a lag on the
   flight path, so the real short period is here:

       θ̈ = -ωn²·(θ - γ - αtrim) - 2ζωn·θ̇ ,  ωn ∝ v

   Stiffness rising with airspeed is what makes a plane arriving slow at the top
   of a badly aimed arc unable to drop its nose onto the path down, so it
   tumbles. Stall is a Cl collapse into a flat-plate drag term, so tumbling
   bleeds energy properly — an earlier gentle post-stall model let a plane stall
   at the top of every launch and still fly the full distance.

   STATS ARE FOUR SLIDERS, 0..1, and each is a real trade. Heavy launches slower
   from the same draw but carries momentum and reaches its flex limit later, so
   it wants the catapult wound right back. Light leaves the arm fast and has to
   be launched gently or it flexes the whole way. Lift buys glide ratio. Tough
   sets both the load the wing holds and how much of a bounce survives — the
   pick screen should say strength, not just bounce, because this stat now
   governs the launch as well as the landing. Drag is the balancing screw and is
   solved rather than chosen; see the fleet table.

   TREE BEND — A SECOND LAUNCH VARIABLE — WAS MEASURED AND REJECTED, 2026-08-20.
   The proposal: bend the trunk back with one tap, draw the band with a second.
   It is in the model behind opts.bend, which defaults to 0 and reproduces this
   game exactly; bend.js is the harness. The result:

     BEST BEND SAT AT THE MAXIMUM FOR ALL SIX PLANES, AND FOR ALL 72 SETTINGS
     OF THE FOUR CONSTANTS SWEPT. Not one gave an interior optimum.

   So it is not a decision, it is a tax: you would wind it to the stop every
   launch and get on with the real input. Exactly what the launch angle was
   before wind, and the reason to reject it is the same.

   The interesting part is WHY, because the first guess was wrong. The guess was
   that the whip's cost — it releases you rotated off your aim — would be
   absorbed by the launch angle, the angle being free to re-aim. It is not:
   pinning the aim at the no-bend optimum still gives best bend 1.00. The actual
   reason is that a whip's benefit is not the energy it adds. Energy alone is a
   LOSS of 156 m, because reaching a higher speed over the same four-metre
   stroke raises the launch load and strains the wing. The whole win, +302 m, is
   that the fork travels with the aeroplane and spreads that acceleration over a
   longer stroke: LESS LOAD PER JOULE. That is unconditional. Against it the
   tilt is worth -3 m and the lost release height -13 m, and no setting in the
   sweep brought them within reach of each other.

   Which leaves the mechanic bimodal rather than tunable: with the stroke
   benefit bend is always maximum, without it bend is always zero, and there is
   no interior anywhere between. Forcing one would mean inventing a
   super-linear cost to bolt on, and a coupling that does not come from the
   material is book-keeping rather than insight.

   Deterministic: same plane, same angle, same pull, same distance, forever. No
   Math.random anywhere below the generation of nothing at all.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TAILWIND_MODEL = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const CFG = {
  G: 9.81,
  RHO: 1.225,
  DT: 0.002,          // integration step, seconds
  MAX_T: 90,          // give up after this many seconds of flight
  // The fork pivot, and the aeroplane's own centre sitting in the band a little
  // above it. Keeping these apart is what lets the renderer draw the sprite
  // about its centre everywhere: in the sling the band cradles the fuselage, on
  // the ground the undercarriage carries it, and GEAR_H is that ride height.
  PIVOT_H: 8.0,       // fork pivot height, metres — a post, not a stump
  LAUNCH_H: 8.35,     // = PIVOT_H + how far the centre sits above the band
  PLANE_LEN: 5.72,    // metres nose to tail; the renderer draws to this
  GEAR_H: 1.58,       // fallback ride height when a plane has no aspect
  E_MIN: 588,         // joules stored in the catapult at pull 0
  E_MAX: 2600,        // and at pull 1
  ANG_MIN: 6,         // launch angle range, degrees
  ANG_MAX: 89,
  A_STALL: 14,        // degrees of angle of attack before Cl collapses
  STOP_V: 0.55,       // below this ground speed the plane has stopped
  // An aeroplane gliding in at 14:1 arrives at barely 2 m/s of sink and simply
  // rolls on. Only a genuinely steep arrival should bounce, so this threshold
  // sits well above a normal approach — at 1.2 every landing ended in a thud.
  BOUNCE_MIN_VY: 6.0, // slower vertical arrivals settle onto the wheels
  FLEX_CL: 6.00,      // how much lift the wing washes out once past its limit
  FLEX_CD: 1.60,      // and how much drag the flexing costs
  TAU_PATH: 0.85,     // seconds for the path to settle onto its target
  PUSH_G: 0.05,       // how hard it will push; a wing pulls, it does not shove
  STROKE: 4.0,        // metres of catapult stroke; sets the launch load
  // Tree-bend, the candidate second variable. Swept by bend.js; all four are 0
  // in effect until a launch passes a non-zero bend.
  E_BEND: 1200,       // joules the trunk adds at full bend
  BEND_STROKE: 0.60,  // how much longer the whip makes the stroke, fraction
  BEND_TILT: 14,      // degrees steeper than aimed, at full bend
  BEND_DROP: 2.4,     // metres of release height given up, at full bend
  WING_LOAD: 19,      // kg/m², fleet-wide. This is the "metal, not paper" dial.
  ROLL_MU: 0.62,      // wheel/grass rolling resistance during the run-out
};
function configure(o) { Object.assign(CFG, o); return CFG; }

const D2R = Math.PI / 180;

// ---- the fleet ----------------------------------------------------------
// weight / lift / drag / tough, each 0..1, exactly as the pick screen shows
// them. No plane wins every launch; check with `node tailwind/measure.js`.
//
// weight and lift are each plane's identity and were chosen by hand. drag is
// not a free choice — it is solved, by bisection, so that every plane's own
// best launch reaches roughly the same distance, which is what "no plane is
// strictly best" actually requires. Left unsolved the fleet was a ranking
// rather than a choice: the best plane flew 3.8x the worst. What differs is
// how you get there, and the number that carries that is the draw — best pull
// runs 0.19 on Zephyr to 0.96 on Cyclone. Re-solve with `node tailwind/balance.js`
// if weight or lift ever move.
const PLANES = {
  // weight / lift / drag / tough, 0..1, exactly as the pick screen shows them,
  // plus the sprite's own aspect so the aeroplane stands on its wheels whatever
  // shape it is. weight, lift and tough are chosen to match what each aircraft
  // LOOKS like — a picker is only honest if the slim one really does glide and
  // the boxy one really is a brick. drag is not chosen: balance.js solves it so
  // that every aeroplane can reach roughly the same distance by a different
  // launch, which is what makes this a choice rather than a ranking.
  Lacerta: { weight: 0.25, lift: 0.85, drag: 0.51, tough: 0.30, aspect: 2.35 },
  Sirocco: { weight: 0.70, lift: 0.35, drag: 0.15, tough: 0.65, aspect: 1.74 },
  Tempest: { weight: 0.90, lift: 0.55, drag: 0.19, tough: 0.90, aspect: 2.16 },
  Tsunami: { weight: 0.60, lift: 0.75, drag: 0.30, tough: 0.55, aspect: 1.72 },
  Vesper:  { weight: 0.45, lift: 0.50, drag: 0.28, tough: 0.45, aspect: 1.90 },
  Zephyr:  { weight: 0.80, lift: 0.30, drag: 0.13, tough: 0.80, aspect: 2.43 },
};


// Sliders to physics. Everything here is monotone in its slider so the bars on
// the pick screen never lie about which way a stat pushes.
function build(name) {
  if (name && typeof name === 'object' && name.m) return name;   // already built
  const s = typeof name === 'string' ? PLANES[name] : name;
  if (!s) throw new Error('unknown plane: ' + name);
  const m = 0.55 + 2.10 * s.weight;           // kg
  return {
    name: typeof name === 'string' ? name : 'custom',
    stats: s,
    m,
    // Wing area follows mass, so wing loading is a fleet constant. With a fixed
    // area instead, loading varied 4.8x and the light planes sat permanently
    // past their flex limit — Zephyr pulled 12 g at its own best launch and
    // could not reach half the distance of the heavy planes at any stat
    // setting. Constant loading makes load factor depend on the lift slider
    // rather than on mass, which is what leaves the fleet levellable.
    //
    // The VALUE of that constant is what makes this read as an aircraft. At the
    // first setting it worked out to 8 kg/m², which is hang-glider territory,
    // and the flight showed it: the thing floated, bobbed and dropped steeply
    // like paper. Metal aeroplanes sit near WING_LOAD, and the same launch then
    // penetrates instead of floating.
    S:       m / CFG.WING_LOAD,               // m², wing area
    // Kept deliberately narrow. A wide lift range sets trim speed over a 2.6x
    // spread, and since load factor goes as v²·Cl the high-lift planes then sit
    // permanently in flex — at lift 0.9 the best launch was pull 0.10, i.e. the
    // plane wanted the catapult barely drawn at all. Lift earns its keep
    // through glide ratio, not through trim speed.
    clAlpha: 3.00 + 2.00 * s.lift,            // per radian
    aTrim:   (3.4 + 1.4 * s.lift) * D2R,      // trim angle of attack
    // Glide ratio is what draws the trajectory. The long shallow tail — climb
    // early, then ride it down for most of the run — is just a high L/D, and
    // the first version's L/D of 6.4 is why the arc peaked late and fell away
    // steeply instead. These give roughly 11-15 depending on the drag slider.
    cd0:     0.0196 + 0.0850 * s.drag,        // parasitic drag; wide, so
                                              // balance.js has room to level a
                                              // sailplane against a brick
    kInd:    0.042 + 0.020 * (1 - s.lift),    // induced drag factor
    nMax:    1.40 + 2.70 * s.tough,           // load factor the wing holds cleanly
    // where its centre sits when the wheels are down, from the sprite's shape
    gearH:   0.46 * (CFG.PLANE_LEN / (s.aspect || 2.0)),
    // The g it takes cleanly, set so that "tough" reads directly as how far the
    // catapult can be drawn before the airframe complains: 0.35 of the draw at
    // the fragile end, 0.90 at the strong end. Quoting it as a load rather than
    // as a pull keeps it honest — the same draw is a gentler launch for a heavy
    // aeroplane, so mass earns its place here too.
    nLaunch: (CFG.E_MIN + (CFG.E_MAX - CFG.E_MIN) * (0.35 + 0.55 * s.tough))
             / (m * CFG.STROKE * CFG.G),
    rest:    0.05 + 0.17 * s.tough,           // restitution on ground contact
    mu:      0.92 - 0.46 * s.tough,           // wheel/ground friction
    get clTrim() { return this.clAlpha * this.aTrim; },
    get LD() {                                 // glide ratio at the trim point
      const cl = this.clTrim;
      return cl / (this.cd0 + this.kInd * cl * cl);
    },
    get glideAngle() { return -Math.atan(1 / this.LD); },
    get clMax() { return this.clAlpha * CFG.A_STALL * Math.PI / 180; },
    // the slowest it can fly and still hold itself up
    get vStall() {
      return Math.sqrt(2 * this.m * CFG.G / (CFG.RHO * this.S * this.clMax));
    },
    get vTrim() {                             // speed at which lift equals weight
      const cl = this.clAlpha * this.aTrim;
      return Math.sqrt(this.m * CFG.G / (0.5 * CFG.RHO * this.S * cl));
    },
  };
}

// ---- aerodynamics -------------------------------------------------------
// Attached flow below the stall angle, a flat plate held sideways well above
// it, blended across the 18° in between. The flat-plate branch is the whole
// point: a departed wing is not a slightly worse wing, it is a barn door, and
// the first version's gentle post-stall drag let a plane stall at the top of
// every launch and still go the full distance.
function coeffs(p, alpha) {
  const aS = CFG.A_STALL * D2R;
  const mag = Math.abs(alpha), sgn = Math.sign(alpha) || 1;

  const clAtt = p.clAlpha * alpha;
  const cdAtt = p.cd0 + p.kInd * clAtt * clAtt;
  if (mag <= aS) return { cl: clAtt, cd: cdAtt };

  const blend = Math.min(1, (mag - aS) / (18 * D2R));
  const clPlate = 0.92 * Math.sin(2 * alpha);
  const cdPlate = 0.10 + 1.90 * Math.sin(alpha) * Math.sin(alpha);
  const clPeak = sgn * p.clAlpha * aS;
  return {
    cl: clPeak * (1 - blend) + clPlate * blend,
    cd: cdAtt * (1 - blend) + cdPlate * blend,
  };
}

const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// ---- one launch ---------------------------------------------------------
// angleDeg and pull (0..1) are the two inputs. Returns the distance in metres
// plus the trace, which the renderer replays and the harness ignores.
function fly(plane, angleDeg, pull, opts = {}) {
  const p = typeof plane === 'object' && plane.m ? plane : build(plane);
  const wantTrace = !!opts.trace;
  // Steady wind along the run, metres per second, positive downwind. Everything
  // aerodynamic below works on AIRSPEED and only the bookkeeping is in ground
  // terms, which is the whole point: a headwind buys the wing lift it has not
  // paid for in ground speed, and takes the distance back over the time aloft.
  const wind = opts.wind || 0;

  // A drawn catapult stores energy, not speed, so the same draw launches a
  // heavy plane slower. Without this the fleet cannot be balanced at all: at a
  // fixed launch speed a heavier plane carries more kinetic energy against the
  // same drag force, so weight was a free win worth more than the entire drag
  // slider — measured, Zephyr topped out at 96 m with drag at zero while
  // Cyclone still made 220 m with drag at maximum.
  // SECOND LAUNCH VARIABLE, off by default (bend 0 reproduces the shipped game
  // exactly). Bending the trunk back and letting it whip forward is a compound
  // catapult: the fork travels through its own arc while the aeroplane is still
  // in the sling, so it adds stored energy AND spreads the acceleration over a
  // longer stroke, which is less load per joule. Both of those are pure gain,
  // so on their own bend would simply be a tax you always pay in full.
  // What makes it a choice is that the fork does not hold still: it is rotating
  // through that arc at the moment the band lets go, so the launch leaves
  // steeper than aimed by an amount set by the bend, and from lower down, the
  // trunk having tipped forward out from under it. Deterministic, not a
  // lottery — you can learn it — but it means a hard bend aims for you.
  const bend = Math.max(0, Math.min(1, opts.bend || 0));
  const E = CFG.E_MIN + (CFG.E_MAX - CFG.E_MIN) * Math.max(0, Math.min(1, pull))
            + CFG.E_BEND * bend;
  // opts.v0 / opts.stroke let an experiment drive the launch directly instead of
  // through pull and bend — whip.js needs that, because a timed release sets the
  // speed and the arc length from the swing rather than from a drawn band. Both
  // default to the normal derivation, so nothing changes unless they are passed.
  const v0 = opts.v0 != null ? opts.v0 : Math.sqrt(2 * E / p.m);
  const stroke = opts.stroke != null ? opts.stroke
               : CFG.STROKE * (1 + CFG.BEND_STROKE * bend);
  const a0 = (angleDeg + CFG.BEND_TILT * bend) * D2R;
  // what the wing actually feels leaving the arm, which is not what the
  // catapult imparted once there is air moving
  const v0air = Math.hypot(v0 * Math.cos(a0) - (opts.wind || 0), v0 * Math.sin(a0));

  // WHAT MAKES THE PICK SCREEN A CHOICE. Getting to v0 over a stroke of four
  // metres is an acceleration, and an acceleration is a load: v0²/2s, tens of g
  // at a full draw. Every airframe has a figure it takes cleanly and past that
  // the wing is strained — it loses lift slope and gains drag, so the glide it
  // was bought for is spent. Which caps the draw at a DIFFERENT place for each
  // aeroplane, because the load falls with mass (a heavy one leaves the arm
  // slower from the same energy) and the limit rises with how it is built.
  // Without this every plane in the fleet wanted the identical launch, 43° and
  // pull 0.96, and picking one was picking a number rather than a way to fly.
  const nLaunch = (v0 * v0) / (2 * stroke * CFG.G);
  const strain = Math.max(0, Math.min(1.2, (nLaunch - p.nLaunch) / p.nLaunch));
  const clA = p.clAlpha / (1 + 1.5 * strain);
  const cd0 = p.cd0 * (1 + 2.5 * strain);
  const clTrim = clA * p.aTrim;
  const LD = clTrim / (cd0 + p.kInd * clTrim * clTrim);
  const glideAngle = -Math.atan(1 / LD);
  const vTrim = Math.sqrt(p.m * CFG.G / (0.5 * CFG.RHO * p.S * clTrim));

  let x = 0, y = CFG.LAUNCH_H - CFG.BEND_DROP * bend;
  let vx = v0 * Math.cos(a0), vy = v0 * Math.sin(a0);
  let theta = a0;                              // nose still pointing where aimed
  let t = 0, grounded = false, bounces = 0, apex = y, stalled = false, flex = 0;
  let departed = false, depTime = 0;   // below stall speed, and for how long
  let apexX = 0, touchdown = 0;   // where the arc tops out, and where it lands
  const trace = wantTrace ? [{ x, y, th: theta, t }] : null;

  const dt = CFG.DT, g = CFG.G;
  const steps = Math.ceil(CFG.MAX_T / dt);

  for (let i = 0; i < steps; i++) {
    const ax = vx - wind;                      // airspeed vector
    const v = Math.hypot(ax, vy);

    if (!grounded) {
      // AN AEROPLANE FLIES A PATH; IT IS NOT A THROWN STONE WITH A WING BOLTED
      // ON. The previous step integrated the flight path from whatever lift the
      // trim angle happened to produce, and traced, that is exactly what it
      // looked like: launched at 45° the path angle stayed at 45-53° for the
      // whole climb, the aeroplane arrived at the top at 0.24 of trim speed,
      // stalled at 36° of incidence and came down at -56°, steeper than it had
      // gone up. The wing contributed drag and nothing else.
      //
      // A trimmed aircraft instead holds a SPEED, and its path follows from
      // that. While it still has the speed the catapult gave it, it flies the
      // angle it was launched at; as that surplus bleeds away the path eases
      // over until, at trim speed, it is descending down its own glide slope of
      // atan(1/LD). One expression covers the whole flight and there is no
      // separate 'climbing' and 'gliding' case:
      //
      //    gamma_target = glideAngle + (launchAngle - glideAngle) * surplus
      //
      // The aerodynamics are still doing the work — the lift needed to hold
      // that path is worked out, the wing is asked for it, and if it cannot
      // deliver it (past the stall, or past its flex limit) it does not get it
      // and the path suffers. That is why over-drawing still hurts.
      const gam = Math.atan2(vy, ax);
      const vSafe = Math.max(v, 0.8);
      const qbar = 0.5 * CFG.RHO * p.S * v * v;

      const surplus = Math.max(0, Math.min(1, (v - vTrim) / Math.max(0.5, v0air - vTrim)));
      const gTarget = glideAngle + (a0 - glideAngle) * surplus;
      const rateMax = (p.nMax - 1) * g / vSafe;      // what the wing can pull
      let rate = wrap(gTarget - gam) / CFG.TAU_PATH;
      rate = Math.max(-rateMax, Math.min(rateMax, rate));

      // lift that path needs, then ask the wing for it
      let cl = (p.m * (vSafe * rate + g * Math.cos(gam))) / Math.max(1e-6, qbar);
      const clMax = clA * CFG.A_STALL * D2R;
      let sep = 0;

      // THE LIMIT IS A LOAD FACTOR, NOT A LIFT COEFFICIENT. This is what made a
      // near-vertical launch look best. Capping the coefficient sounds like the
      // same thing, but a small negative coefficient at 45 m/s is a bunt of
      // 1.37 g, so the model could still haul the nose over: fired at 89° the
      // path fell to 70° in 1.4 seconds, where gravity alone turns it at two
      // tenths of a degree per second. The steep launch was being quietly
      // converted into a shallow one that kept all its speed, and of course that
      // won. An aeroplane pushes barely — PUSH_G of negative — and pulls only
      // what the airframe takes. Held to that, a launch aimed at the sky goes to
      // the sky and comes back down near where it left.
      const nReq = (qbar * cl) / (p.m * g);
      const nClamped = Math.max(-CFG.PUSH_G, Math.min(p.nMax, nReq));
      cl = (nClamped * p.m * g) / Math.max(1e-6, qbar);
      // Asking for more lift than the wing has does NOT separate the flow — it
      // just gets the maximum, which is the edge of the stall, not past it.
      // Treating the shortfall as separation added a drag penalty that grew with
      // the demand, and in a dive that locked: it wanted to pull out, could not,
      // so it was 'stalled' with enormous drag, so it never gained the speed to
      // pull out. Terminal velocity came out at 16 m/s against a 17.6 stall and
      // the aeroplane fell from apex to ground at a constant −73°.
      if (cl > clMax) { cl = clMax; stalled = true; }

      // AND BELOW STALL SPEED IT IS NOT FLYING AT ALL. Over the top of a steep
      // zoom the airspeed fell to 0.63 of trim — well under the stall — and the
      // aeroplane went on steering as though nothing had happened. It should
      // depart: the wing gives up, the drag goes to that of a flat plate, and it
      // falls until it has flying speed again. This is the cost of throwing it
      // straight up, and without it there was no reason not to.
      // A DEPARTURE HAS TO BE RECOVERABLE. The first attempt bled so much energy
      // that terminal velocity in the resulting dive was BELOW the speed needed
      // to fly again, so anything that departed stayed departed and fell at a
      // constant 16 m/s from apex to ground. That is a deep stall, not a stall,
      // and it is what turned the angle response into a cliff: 828 m at 60° and
      // 114 m at 70°. It should cost height and dignity, then fly again.
      if (v < p.vStall) {
        departed = true;
      } else if (departed && v > 1.05 * p.vStall && gam < 0) {
        departed = false;                            // flying again, nose down
      }
      if (departed) {
        depTime += dt;
        cl = Math.min(cl, 0.35 * clMax);             // barely any lift
        sep = Math.max(sep, 0.35);                   // and a lot of drag
      }
      // IN-FLIGHT FLEX IS CURRENTLY UNREACHABLE, and that is not a bug. Launch
      // strain caps the draw before any flyable launch can pull more than nMax
      // in the air: swept over 20,664 launches — six planes, every angle, every
      // draw, four winds — this branch fired exactly zero times. It is kept as
      // a guard, because raising E_MAX or STROKE would make it live again, and
      // FLEX_CD is applied here so that the guard is whole rather than half a
      // model. Wiring it in changed nothing measurable, which is the point.
      let flexCd = 0;
      const n = Math.abs(qbar * cl) / (p.m * g);
      if (n > p.nMax) {                              // and the tips twist under load
        const f = Math.min(1.5, (n - p.nMax) / p.nMax);
        flex = Math.max(flex, f);
        cl /= 1 + CFG.FLEX_CL * f;
        flexCd = CFG.FLEX_CD * f * f;
      }

      const cd = cd0 + p.kInd * cl * cl + 1.10 * sep * sep + flexCd;
      const L = qbar * cl, D = qbar * cd;

      const dv = (-D / p.m - g * Math.sin(gam)) * dt;
      const dgam = ((L / p.m - g * Math.cos(gam)) / vSafe) * dt;

      const nv = Math.max(0.05, v + dv);
      const ng = gam + dgam;
      vx = nv * Math.cos(ng) + wind;
      vy = nv * Math.sin(ng);

      // attitude is simply path plus incidence; the aeroplane points where it
      // is going, tilted by however much wing it is currently using
      theta = ng + cl / clA;
    } else {
      // It comes down on its undercarriage and rolls. Rolling resistance is a
      // constant deceleration; the airframe's own drag is quadratic and does
      // most of the work early, which is what makes the run-out ease off rather
      // than stop dead. Together they give a visible roll of roughly a tenth of
      // the flight — the plane arriving nearly level is what earns it.
      const va = vx - wind;                      // airspeed along the ground run
      const qbar = 0.5 * CFG.RHO * p.S * va * va;
      const fr = CFG.ROLL_MU * p.mu * g + Math.sign(va || 1) * (qbar * (cd0 + 0.34)) / p.m;
      vx = Math.max(0, vx - fr * dt);
      vy = 0;
      // Once the wheels are down the aeroplane settles level and stays there,
      // rather than freezing at whatever attitude it happened to touch down in.
      theta += (0 - theta) * Math.min(1, dt / 0.45);
    }

    x += vx * dt;
    y += vy * dt;
    t += dt;
    if (y > apex) { apex = y; apexX = x; }
    if (grounded && !touchdown) touchdown = x;

    if (y <= p.gearH) {
      y = p.gearH;
      if (!grounded && vy < -CFG.BOUNCE_MIN_VY) {
        vy = -vy * p.rest;
        vx *= 0.72 + 0.16 * p.stats.tough;      // a bounce costs you ground speed
        bounces++;
        if (vy < CFG.BOUNCE_MIN_VY) { vy = 0; grounded = true; }
      } else {
        vy = 0;
        grounded = true;
      }
    }

    if (wantTrace && (i % 6 === 0)) trace.push({ x, y, th: theta, t });
    if (grounded && vx < CFG.STOP_V) break;
  }

  if (wantTrace) trace.push({ x, y, th: theta, t });
  // apexAt is the shape number: the fraction of the run spent climbing. A late
  // apex is the steep-up-steep-down arc of a thrown brick; an early one is a
  // climb followed by a long glide, which is the shape this game wants.
  return { dist: x, t, apex, apexX, bounces, stalled, flex, strain, depTime, trace,
           apexAt: x > 0 ? apexX / x : 0,
           roll: touchdown ? (x - touchdown) / x : 0 };
}

// ---- the input space ----------------------------------------------------
const angleAt = (u) => CFG.ANG_MIN + (CFG.ANG_MAX - CFG.ANG_MIN) * u;

// Best angle/pull for a plane: coarse grid, then two refinement passes. The
// harness uses this as the informed player; nothing in the game does.
function best(plane, coarse = 40) {
  const p = build(plane);
  let lo = [CFG.ANG_MIN, 0], hi = [CFG.ANG_MAX, 1], out = { dist: -1 };
  let n = coarse;
  for (let pass = 0; pass < 3; pass++) {
    let bestA = lo[0], bestP = lo[1];
    for (let i = 0; i <= n; i++) {
      const a = lo[0] + (hi[0] - lo[0]) * (i / n);
      for (let j = 0; j <= n; j++) {
        const pu = lo[1] + (hi[1] - lo[1]) * (j / n);
        const r = fly(p, a, pu);
        if (r.dist > out.dist) { out = r; bestA = a; bestP = pu; }
      }
    }
    out.angle = bestA; out.pull = bestP;
    const da = (hi[0] - lo[0]) / n, dp = (hi[1] - lo[1]) / n;
    lo = [Math.max(CFG.ANG_MIN, bestA - da), Math.max(0, bestP - dp)];
    hi = [Math.min(CFG.ANG_MAX, bestA + da), Math.min(1, bestP + dp)];
    n = 12;
  }
  return out;
}

return { CFG, configure, PLANES, build, fly, best, coeffs, angleAt, D2R };
}));
