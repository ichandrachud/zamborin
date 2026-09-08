/* Lift — THE GATE.
 *
 * Row 1 is a KILL TEST, not a tuning run. Lift scheduling is a famous problem
 * and simple rules are known to be strong; if a planner cannot beat
 * nearest-call-first by a quarter on tips while taking fewer than two thirds
 * of its quits, then choosing who waits is not a decision, the game is a
 * dexterity toy with a queue drawn on it, and the brief says kill rather than
 * tune. This file exists to answer that with a number before more is built.
 *
 * WHAT IS HELD CONSTANT. Every policy drives the car the same way: the
 * optimal trapezoid between two floors, from model.js, which is the car the
 * player is actually fighting. So the only thing being compared is WHICH FLOOR
 * IS SERVED NEXT. How well anyone stops is row 2's question and it is not
 * confounded into row 1.
 *
 * PAIRED SEEDS. All four policies face the identical arrival stream for a
 * given shift index, because spawns are drawn from a seeded generator that
 * never reads the car. An unpaired comparison at these sample sizes would be
 * mostly noise.
 *
 * CALIBRATION FIRST. A two-floor building with one person at a time offers
 * every policy exactly one candidate floor, so all four MUST tie exactly. If
 * they do not, the harness is measuring itself and nothing below it means
 * anything.
 *
 * Run: node lift/tune-gate.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('./model.js');
const T = M.TUNE;

const CAPACITY = T.capacity;
const QUIT_PENALTY_REF = { v: 40 };   // the planner's own weight, sweepable in the headroom run
const SHIFTS = 300;
let PAT_SCALE = 1;                // sweepable: scales every patience clock
/* Two rules the brief specifies but M1 does not have. Off by default, because
   row 1 is meant to run on M1's numbers; switched on in the last section to
   ask what the schedule would be worth WITH them. */
let GROUP_P = 0;                  // chance an arrival is a group of two or three
const expressFactor = (p) => (p.type === 'express'
  ? Math.pow(0.5, p.stopsRidden) * (p.stopsRidden === 0 ? 1.5 : 1) : 1);

/* ---------- the shift ---------- */

const spawnEveryFor = (n) => T.spawnEveryS[0] + (T.spawnEveryS[1] - T.spawnEveryS[0]) * (Math.min(9, Math.max(1, n)) - 1) / 8;

/* Types arrive by shift, as the escalation in the brief. Express is an M4 rule
   (each stop on the way halves the tip) and is left out: row 1 asks whether
   the schedule has a decision at all, on M1's numbers. */
function mixFor(n) {
  if (n <= 2) return [['regular', 1]];
  if (n <= 5) return [['regular', 0.75], ['hurried', 0.25]];
  return [['regular', 0.50], ['hurried', 0.20], ['vip', 0.14], ['kid', 0.16]];
}
const multFor = (type) => (type === 'vip' ? T.vipMult : 1);

function pickType(mix, r) {
  let acc = 0;
  for (const [name, p] of mix) { acc += p; if (r <= acc) return name; }
  return mix[mix.length - 1][0];
}

function newShift(shiftN, seed, opts) {
  const o = opts || {};
  return {
    floors: o.floors || T.floors,
    t: 0, car: 1, tips: 0, quits: 0, delivered: 0, stops: 0,
    waiting: [], aboard: [], nextId: 1,
    rng: M.makeRng(seed),
    spawnEvery: o.spawnEvery != null ? o.spawnEvery : spawnEveryFor(shiftN),
    mix: o.mix || mixFor(shiftN),
    nextSpawn: 1.5,
    soloOnly: !!o.soloOnly,        // calibration: never more than one person alive
    shiftS: o.shiftS || T.shiftS,
  };
}

function spawn(S) {
  if (S.soloOnly && (S.waiting.length + S.aboard.length) > 0) return;
  const f = 1 + Math.floor(S.rng() * S.floors);
  let d = 1 + Math.floor(S.rng() * (S.floors - 1));
  if (d >= f) d++;
  const type = pickType(S.mix, S.rng());
  S.waiting.push({ id: S.nextId++, floor: f, dest: d, type, pat: 1, born: S.t, dead: false, stopsRidden: 0 });
  /* A group arrives together at ONE floor, which is the only thing that makes
     a four-seat car's capacity bind. One at a time it never does. */
  if (GROUP_P > 0 && S.rng() < GROUP_P) {
    const extra = 1 + (S.rng() < 0.4 ? 1 : 0);
    for (let k = 0; k < extra; k++) {
      let d2 = 1 + Math.floor(S.rng() * (S.floors - 1));
      if (d2 >= f) d2++;
      S.waiting.push({ id: S.nextId++, floor: f, dest: d2, type: pickType(S.mix, S.rng()), pat: 1, born: S.t, dead: false, stopsRidden: 0 });
    }
  }
}

/* Advance the world by dt: spawns, patience, quits. Returns false when the
   shift is over. Patience is stepped rather than solved because a spawn inside
   the interval has to start at full and a quit has to be counted at the moment
   it happens, not at the end of a stop. */
const STEP = 0.05;
function advance(S, secs) {
  let left = secs;
  while (left > 1e-9) {
    if (S.t >= S.shiftS || S.quits >= T.quitsToEnd) return false;
    const dt = Math.min(STEP, left);
    S.t += dt; left -= dt;
    while (S.nextSpawn <= S.t) { spawn(S); S.nextSpawn += S.spawnEvery; }
    for (const p of S.waiting) p.pat -= dt / (T.drain[p.type] * PAT_SCALE);
    for (const p of S.aboard) if (!p.dead) p.pat -= dt / (T.boardedDrain * PAT_SCALE);
    for (let i = S.waiting.length - 1; i >= 0; i--) {
      if (S.waiting[i].pat <= 0) { S.quits++; S.waiting.splice(i, 1); }
    }
    /* Someone already aboard who runs out gets off at the next stop and walks.
       They are counted at once and they keep the seat until then, which is the
       punishment. */
    for (const p of S.aboard) if (!p.dead && p.pat <= 0) { p.dead = true; S.quits++; }
  }
  return !(S.t >= S.shiftS || S.quits >= T.quitsToEnd);
}

/* One stop, exactly. Every policy uses this, so the cost of a stop is the
   same for all of them. */
function serve(S, floor) {
  if (!advance(S, M.travelTime(Math.abs(floor - S.car), T))) return false;
  S.car = floor; S.stops++;
  if (!advance(S, T.doorS)) return false;

  const out = S.aboard.filter(p => p.dead || p.dest === floor);
  for (const p of out) {
    if (p.dead) continue;
    S.tips += M.tipFor(p.pat, multFor(p.type), T) * expressFactor(p) + T.smoothBonus;
    S.delivered++;
  }
  // every stop that was not theirs has already cost an express rider half
  for (const p of S.aboard) if (p.dest !== floor) p.stopsRidden++;
  S.aboard = S.aboard.filter(p => !(p.dead || p.dest === floor));
  if (out.length && !advance(S, T.boardS * out.length)) return false;

  const here = S.waiting.filter(p => p.floor === floor).sort((a, b) => a.pat - b.pat);
  const take = here.slice(0, Math.max(0, CAPACITY - S.aboard.length));
  if (take.length) {
    const ids = new Set(take.map(p => p.id));
    S.waiting = S.waiting.filter(p => !ids.has(p.id));
    for (const p of take) S.aboard.push(p);
    S.tips += T.smoothBonus;                    // the stop itself was landed clean
    if (!advance(S, T.boardS * take.length)) return false;
  }
  return advance(S, T.doorS);
}

const candidates = (S) => {
  const set = new Set();
  for (const p of S.waiting) set.add(p.floor);
  for (const p of S.aboard) set.add(p.dest);
  return [...set].sort((a, b) => a - b);
};

/* ---------- the four policies ---------- */

const nearest = (S) => {
  const c = candidates(S);
  if (!c.length) return null;
  return c.reduce((best, f) => Math.abs(f - S.car) < Math.abs(best - S.car) ? f : best, c[0]);
};

const fifo = (S) => {
  let best = null, bestT = Infinity;
  for (const p of S.waiting) if (p.born < bestT) { bestT = p.born; best = p.floor; }
  for (const p of S.aboard) if (p.born < bestT) { bestT = p.born; best = p.dest; }
  return best;
};

const lowestPatience = (S) => {
  let best = null, bestP = Infinity;
  for (const p of S.waiting) if (p.pat < bestP) { bestP = p.pat; best = p.floor; }
  for (const p of S.aboard) if (!p.dead && p.pat < bestP) { bestP = p.pat; best = p.dest; }
  return best;
};

/* Two-stop lookahead, maximising tips minus a quit penalty. The rollout is
   analytic - how long the stop takes, who is delivered, who runs out during it
   - rather than a second copy of the stepper. A planner is a heuristic, not an
   oracle, and giving it a perfect forward model would be measuring a solver
   rather than a player who plans. */
function rollout(state, floor) {
  const t = M.travelTime(Math.abs(floor - state.car), T);
  const out = state.aboard.filter(p => p.dest === floor);
  const here = state.waiting.filter(p => p.floor === floor).sort((a, b) => a.pat - b.pat);
  const take = here.slice(0, Math.max(0, CAPACITY - state.aboard.length + out.length));
  const elapsed = t + T.doorS * 2 + T.boardS * (out.length + take.length);

  let tips = 0, quits = 0;
  for (const p of out) {
    const pat = p.pat - (t + T.doorS) / (T.boardedDrain * PAT_SCALE);
    if (pat <= 0) quits++; else tips += M.tipFor(pat, multFor(p.type), T) * expressFactor(p) + T.smoothBonus;
  }
  if (take.length) tips += T.smoothBonus;
  const takeIds = new Set(take.map(p => p.id));
  const outIds = new Set(out.map(p => p.id));

  const waiting = [];
  for (const p of state.waiting) {
    if (takeIds.has(p.id)) continue;
    const pat = p.pat - elapsed / (T.drain[p.type] * PAT_SCALE);
    if (pat <= 0) quits++; else waiting.push({ ...p, pat });
  }
  const aboard = [];
  for (const p of state.aboard) {
    if (outIds.has(p.id)) continue;
    const pat = p.pat - elapsed / (T.boardedDrain * PAT_SCALE);
    if (pat <= 0) quits++; else aboard.push({ ...p, pat, stopsRidden: p.stopsRidden + 1 });
  }
  for (const p of take) {
    const pat = p.pat - elapsed / (T.drain[p.type] * PAT_SCALE);
    if (pat > 0) aboard.push({ ...p, pat });
  }
  return { next: { car: floor, waiting, aboard }, score: tips - QUIT_PENALTY_REF.v * quits };
}

function planner(S) {
  const c = candidates(S);
  if (!c.length) return null;
  let best = c[0], bestScore = -Infinity;
  for (const f1 of c) {
    const a = rollout(S, f1);
    let second = 0;
    const c2 = [...new Set([...a.next.waiting.map(p => p.floor), ...a.next.aboard.map(p => p.dest)])];
    for (const f2 of c2) {
      const b = rollout(a.next, f2);
      if (b.score > second) second = b.score;
    }
    const score = a.score + second;
    if (score > bestScore) { bestScore = score; best = f1; }
  }
  return best;
}

const POLICIES = { nearest, fifo, lowestPatience, planner };

/* ---------- running ---------- */

function runShift(policy, shiftN, seed, opts) {
  const S = newShift(shiftN, seed, opts);
  for (let guard = 0; guard < 4000; guard++) {
    if (S.t >= S.shiftS || S.quits >= T.quitsToEnd) break;
    const target = policy(S);
    if (target == null || target === S.car) {
      if (target === S.car && candidates(S).length) { if (!serve(S, target)) break; continue; }
      if (!advance(S, 0.25)) break;
      continue;
    }
    if (!serve(S, target)) break;
  }
  return { tips: S.tips, quits: S.quits, delivered: S.delivered, stops: S.stops, t: S.t };
}

function runSet(name, shiftN, opts) {
  const acc = {};
  for (const k of Object.keys(POLICIES)) acc[k] = { tips: 0, quits: 0, delivered: 0 };
  for (let i = 0; i < SHIFTS; i++) {
    for (const k of Object.keys(POLICIES)) {
      const r = runShift(POLICIES[k], shiftN, 1000 + i, opts);
      acc[k].tips += r.tips; acc[k].quits += r.quits; acc[k].delivered += r.delivered;
    }
  }
  for (const k of Object.keys(acc)) {
    acc[k].tips /= SHIFTS; acc[k].quits /= SHIFTS; acc[k].delivered /= SHIFTS;
  }
  acc.name = name;
  return acc;
}

const f1 = (x) => x.toFixed(1);
const f2 = (x) => x.toFixed(2);

console.log('LIFT — THE GATE, row 1 (KILL ROW).  ' + SHIFTS + ' paired shifts per rate.\n');

/* Acceptance criterion from the brief, section 16: a level stop must be
   reachable from any speed inside one floor of braking. */
const sd = M.stopDistance(T.vMax, T.b);
console.log('  car:  aMax ' + T.aMax + '  vMax ' + T.vMax + '  b ' + T.b +
            '   stop distance from vMax = ' + f2(sd) + ' floors  ' + (sd <= 1 ? 'OK' : 'FAIL (> 1 floor)'));
console.log('  one floor takes ' + f2(M.travelTime(1, T)) + 's, six floors ' + f2(M.travelTime(6, T)) + 's, a stop costs ' +
            f2(T.doorS * 2 + T.boardS) + 's of doors\n');

/* ---------- calibration ---------- */
console.log('CALIBRATION — two floors, one person at a time. All four must tie exactly.');
const cal = runSet('cal', 5, { floors: 2, soloOnly: true, spawnEvery: 6 });
let tied = true;
const base = cal.nearest;
for (const k of Object.keys(POLICIES)) {
  const a = cal[k];
  if (Math.abs(a.tips - base.tips) > 1e-6 || Math.abs(a.quits - base.quits) > 1e-9) tied = false;
  console.log('  ' + k.padEnd(16) + 'tips ' + f2(a.tips).padStart(8) + '   quits ' + f2(a.quits));
}
console.log('  => ' + (tied ? 'TIED. The harness is measuring the schedule.' :
                              'NOT TIED. The harness is measuring itself; every number below is void.') + '\n');

/* ---------- row 1 ---------- */
console.log('ROW 1 — is the schedule a decision?');
console.log('  pass: planner tips >= 1.25x nearest AND planner quits <= 0.60x nearest, at EVERY rate\n');
console.log('  shift  every   ' + ['nearest', 'fifo', 'lowestPat', 'planner'].map(s => s.padStart(9)).join('') + '     tips x   quits x   verdict');

let allPass = tied;
for (const shiftN of [3, 5, 7, 9]) {
  const r = runSet('s' + shiftN, shiftN);
  const tipRatio = r.planner.tips / r.nearest.tips;
  const quitRatio = r.nearest.quits > 0 ? r.planner.quits / r.nearest.quits : (r.planner.quits > 0 ? Infinity : 1);
  const pass = tipRatio >= 1.25 && quitRatio <= 0.60;
  if (!pass) allPass = false;
  console.log('  ' + String(shiftN).padStart(5) + '  ' + f1(spawnEveryFor(shiftN)).padStart(5) + 's  ' +
    [r.nearest, r.fifo, r.lowestPatience, r.planner].map(a => f1(a.tips).padStart(9)).join('') +
    '   ' + f2(tipRatio).padStart(6) + '   ' + f2(quitRatio).padStart(6) + '   ' + (pass ? 'pass' : 'FAIL'));
  console.log('  ' + ' '.repeat(12) + [r.nearest, r.fifo, r.lowestPatience, r.planner].map(a => ('q' + f2(a.quits)).padStart(9)).join('') +
    '        quits per shift');
}

console.log('\n  VERDICT: ' + (allPass
  ? 'ROW 1 PASSES. The schedule carries a decision worth making.'
  : 'ROW 1 FAILS. The brief says kill, not tune.'));

/* ---------------------------------------------------------------------------
   THE LOAD SWEEP, and why it is here.
 *
 * Row 1 above fails, and it fails with the signature of a broken check rather
 * than a dead game: at shifts 3, 5 and 7 all four policies return the SAME
 * tips to a tenth and ZERO quits. Nobody can walk, so there is nothing for a
 * schedule to be right or wrong about, and the four policies are being asked
 * to differ on a building that is never busy. The brief's own Load row calls
 * that regime out - "0 means no pressure" - so row 1 was being run outside the
 * spec it belongs to.
 *
 * At the one rate that does produce quits, shift 9, the planner is already
 * ahead on both axes. So the question is not whether the mechanism exists but
 * whether it is worth anything across the load axis rather than at one
 * setting. This sweeps the spawn interval from slack to unplayable and reports
 * row 1's two ratios at every step, alongside the Load row's own band.
 * ------------------------------------------------------------------------- */

console.log('\n\nLOAD SWEEP — row 1 measured across the whole load axis, shift-9 type mix.');
console.log('  Load row band: planner quits 0.6 to 1.6 per shift.  Row 1: tips x >= 1.25, quits x <= 0.60.\n');
console.log('  every   nearest  planner    tips x   quits x   nearQ   planQ   load   row1');
let anyBoth = false;
const rows = [];
for (const every of [8, 7, 6, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.75, 1.5, 1.25, 1]) {
  const r = runSet('L', 9, { spawnEvery: every });
  const tipRatio = r.planner.tips / r.nearest.tips;
  const quitRatio = r.nearest.quits > 0 ? r.planner.quits / r.nearest.quits : NaN;
  const inBand = r.planner.quits >= 0.6 && r.planner.quits <= 1.6;
  const row1 = tipRatio >= 1.25 && (quitRatio <= 0.60);
  if (inBand && row1) anyBoth = true;
  rows.push({ every, tipRatio, quitRatio, inBand, row1 });
  console.log('  ' + f1(every).padStart(5) + 's  ' + f1(r.nearest.tips).padStart(8) + ' ' + f1(r.planner.tips).padStart(8) +
    '   ' + f2(tipRatio).padStart(7) + '   ' + (isNaN(quitRatio) ? '    -  ' : f2(quitRatio).padStart(7)) +
    '   ' + f2(r.nearest.quits).padStart(5) + '   ' + f2(r.planner.quits).padStart(5) +
    '   ' + (inBand ? ' in ' : '  . ') + '   ' + (row1 ? 'pass' : ' .  '));
}
const bestTip = rows.reduce((a, b) => b.tipRatio > a.tipRatio ? b : a, rows[0]);
console.log('\n  best tips ratio anywhere on the axis: ' + f2(bestTip.tipRatio) + 'x at every=' + f1(bestTip.every) + 's');
console.log('  a rate where the Load band AND row 1 both hold: ' + (anyBoth ? 'YES' : 'NONE'));

/* ---------------------------------------------------------------------------
   THE SECOND AXIS — patience, not arrival rate.
 *
 * The load sweep says the planner's advantage only appears once the shift is
 * already unwinnable, which is a structural finding rather than a bad number:
 * with seven floors and a car that crosses the whole building in 2.43s, the
 * WORST possible choice of next floor costs about two seconds, while a regular
 * passenger is willing to wait twenty-five. A decision with two seconds of
 * leverage against a twenty-five second clock cannot be worth 25% of a shift's
 * tips however many people are queued - piling more of them on only ends the
 * shift sooner, which is what the first sweep measured.
 *
 * So the axis that should matter is the CLOCK, not the crowd. This crosses
 * arrival rate with a scale on every patience clock and reports the cells
 * where the Load row's band holds, which is the only regime where row 1 means
 * anything.
 * ------------------------------------------------------------------------- */

console.log('\n\nSECOND AXIS — patience scale x arrival rate, shift-9 mix. Cells in the Load band only.');
console.log('  patience scale 1.00 = the brief (regular walks after 25s). 0.30 = walks after 7.5s.\n');
console.log('   pat   every    nearest   planner    tips x   quits x   planQ   row1');
let best = null;
for (const scale of [1.0, 0.8, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2]) {
  PAT_SCALE = scale;
  for (const every of [7, 6, 5, 4.5, 4, 3.5, 3, 2.5, 2]) {
    const r = runSet('X', 9, { spawnEvery: every });
    if (!(r.planner.quits >= 0.6 && r.planner.quits <= 1.6)) continue;   // outside the Load band
    const tipRatio = r.planner.tips / r.nearest.tips;
    const quitRatio = r.nearest.quits > 0 ? r.planner.quits / r.nearest.quits : NaN;
    const row1 = tipRatio >= 1.25 && quitRatio <= 0.60;
    if (!best || tipRatio > best.tipRatio) best = { scale, every, tipRatio, quitRatio, row1 };
    console.log('  ' + f2(scale).padStart(5) + '  ' + f1(every).padStart(5) + 's  ' +
      f1(r.nearest.tips).padStart(9) + ' ' + f1(r.planner.tips).padStart(9) +
      '   ' + f2(tipRatio).padStart(7) + '   ' + (isNaN(quitRatio) ? '   -   ' : f2(quitRatio).padStart(7)) +
      '   ' + f2(r.planner.quits).padStart(5) + '   ' + (row1 ? 'PASS' : ' .  '));
  }
}
PAT_SCALE = 1;
console.log('\n  best cell inside the Load band: ' + (best
  ? 'pat ' + f2(best.scale) + ' every ' + f1(best.every) + 's -> tips ' + f2(best.tipRatio) + 'x, quits ' + f2(best.quitRatio) + 'x  ' + (best.row1 ? '(ROW 1 PASSES)' : '(row 1 still fails)')
  : 'none - no cell anywhere produced a playable quit rate'));

/* ---------------------------------------------------------------------------
   PLANNER HEADROOM — is the planner the weak link, or is the problem real?
 *
 * "Nearest-first was not beaten" is worthless if the thing that failed to beat
 * it was a bad planner. A failing check is usually the check. So: sweep the
 * planner's own quit penalty, and put a much stronger search than the brief
 * asks for - a beam over four stops rather than a two-stop lookahead - against
 * the same shifts. If the strong search cannot reach 1.25x either, the ceiling
 * is the building's and not the planner's, and no player could find what is
 * not there.
 * ------------------------------------------------------------------------- */

function deepPlanner(depth, beam) {
  return function (S) {
    const c = candidates(S);
    if (!c.length) return null;
    let bestFirst = c[0], bestScore = -Infinity;
    for (const f1 of c) {
      const a = rollout(S, f1);
      let states = [{ score: a.score, st: a.next }];
      for (let d = 1; d < depth; d++) {
        const nxt = [];
        for (const s of states) {
          const cs = [...new Set([...s.st.waiting.map(p => p.floor), ...s.st.aboard.map(p => p.dest)])];
          if (!cs.length) { nxt.push(s); continue; }
          for (const f of cs) { const b = rollout(s.st, f); nxt.push({ score: s.score + b.score, st: b.next }); }
        }
        nxt.sort((x, y) => y.score - x.score);
        states = nxt.slice(0, beam);
      }
      const sc = states.length ? states[0].score : a.score;
      if (sc > bestScore) { bestScore = sc; bestFirst = f1; }
    }
    return bestFirst;
  };
}

function headroom(label, scale, every) {
  PAT_SCALE = scale;
  const opts = { spawnEvery: every };
  const acc = (pol) => {
    let tips = 0, quits = 0;
    for (let i = 0; i < 120; i++) { const r = runShift(pol, 9, 1000 + i, opts); tips += r.tips; quits += r.quits; }
    return { tips: tips / 120, quits: quits / 120 };
  };
  const near = acc(nearest);
  const out = [];
  for (const qp of [10, 25, 40, 60, 100]) {
    QUIT_PENALTY_REF.v = qp;
    const p2 = acc(planner);
    out.push({ qp, kind: '2-stop', ...p2 });
  }
  QUIT_PENALTY_REF.v = 40;
  const deep = acc(deepPlanner(4, 8));
  out.push({ qp: 40, kind: '4-deep', ...deep });
  console.log('\n  ' + label + '  (nearest: tips ' + f1(near.tips) + ', quits ' + f2(near.quits) + ')');
  for (const o of out) {
    const tr = o.tips / near.tips, qr = near.quits > 0 ? o.quits / near.quits : NaN;
    console.log('    ' + o.kind + ' qp=' + String(o.qp).padStart(3) + '   tips ' + f1(o.tips).padStart(7) +
      '   ' + f2(tr).padStart(5) + 'x   quits ' + f2(o.quits).padStart(5) +
      '   ' + (isNaN(qr) ? '  -  ' : f2(qr).padStart(5) + 'x') +
      '   ' + (tr >= 1.25 && qr <= 0.60 ? 'PASS' : ' .'));
  }
  PAT_SCALE = 1;
}

console.log('\n\nPLANNER HEADROOM — the two cells where the shift is actually playable.');
headroom('pat 1.00, every 4.0s', 1.0, 4.0);
headroom('pat 0.50, every 5.0s', 0.5, 5.0);

/* ---------------------------------------------------------------------------
   WHAT WOULD GIVE THE CHOICE LEVERAGE?
 *
 * The measurement above is not "the schedule does nothing", it is "the
 * schedule is worth about two seconds and two seconds is not worth 25% of a
 * shift". Two rules the brief already specifies would change that arithmetic
 * and neither is in M1:
 *
 *   EXPRESS  each stop on the way to their floor halves their tip. This puts
 *            the cost of a stop into the TIPS column directly, which is the
 *            column row 1 measures and the column the building has no lever on.
 *   GROUPS   two or three people arriving at one landing. A four-seat car's
 *            capacity never binds on one arrival at a time, so the brief's
 *            "first wall at shift 3" does not exist in the sim.
 *
 * This is not tuning the gate to pass. It is asking which RULE the game is
 * missing, given that the two constants the gate nominates have been swept and
 * neither reaches the bar.
 * ------------------------------------------------------------------------- */

function variant(label, mix, groupP, scale, every) {
  PAT_SCALE = scale; GROUP_P = groupP;
  const opts = { spawnEvery: every, mix };
  const acc = (pol) => {
    let tips = 0, quits = 0;
    for (let i = 0; i < 200; i++) { const r = runShift(pol, 9, 1000 + i, opts); tips += r.tips; quits += r.quits; }
    return { tips: tips / 200, quits: quits / 200 };
  };
  const n = acc(nearest), p = acc(planner);
  const tr = p.tips / n.tips, qr = n.quits > 0 ? p.quits / n.quits : NaN;
  const playable = p.quits >= 0.6 && p.quits <= 1.6;
  console.log('  ' + label.padEnd(34) + 'tips ' + f1(n.tips).padStart(7) + ' -> ' + f1(p.tips).padStart(7) +
    '   ' + f2(tr).padStart(5) + 'x   quits ' + f2(n.quits) + ' -> ' + f2(p.quits) +
    '   ' + (isNaN(qr) ? ' -' : f2(qr) + 'x') + '   ' + (playable ? 'playable' : 'off-band ') +
    '  ' + (tr >= 1.25 && qr <= 0.60 && playable ? 'ROW 1 PASSES' : ''));
  PAT_SCALE = 1; GROUP_P = 0;
}

const MIX_NOEX = [['regular', 0.50], ['hurried', 0.20], ['vip', 0.14], ['kid', 0.16]];
const MIX_EX35 = [['regular', 0.35], ['hurried', 0.15], ['vip', 0.10], ['kid', 0.05], ['express', 0.35]];
const MIX_EX60 = [['regular', 0.20], ['hurried', 0.10], ['vip', 0.10], ['express', 0.60]];

console.log('\n\nWHAT WOULD GIVE THE CHOICE LEVERAGE (200 paired shifts each)\n');
console.log('  M1 rules, for reference:');
variant('  none (M1)  every 4.0s', MIX_NOEX, 0, 1.0, 4.0);
console.log('\n  adding groups:');
variant('  groups 35%  every 5.0s', MIX_NOEX, 0.35, 1.0, 5.0);
variant('  groups 60%  every 6.0s', MIX_NOEX, 0.60, 1.0, 6.0);
console.log('\n  adding express riders:');
variant('  express 35%  every 4.0s', MIX_EX35, 0, 1.0, 4.0);
variant('  express 60%  every 4.0s', MIX_EX60, 0, 1.0, 4.0);
console.log('\n  both:');
variant('  express 35% + groups 35%  6.0s', MIX_EX35, 0.35, 1.0, 6.0);
variant('  express 60% + groups 50%  6.0s', MIX_EX60, 0.50, 1.0, 6.0);
variant('  express 60% + groups 50%  5.0s', MIX_EX60, 0.50, 1.0, 5.0);

/* One cell that passes is not a result; a knife edge you have to sit on is the
   same as no result. This is the neighbourhood of the passing cell. */
console.log('\n\nNEIGHBOURHOOD OF THE PASSING CELL — is it a region or an edge?\n');
console.log('  express  groups   every    tips x   quits x   planQ   verdict');
let passes = 0, cells = 0;
for (const [exN, mix] of [[45, [['regular', 0.28], ['hurried', 0.15], ['vip', 0.12], ['express', 0.45]]],
                          [60, MIX_EX60],
                          [75, [['regular', 0.13], ['hurried', 0.07], ['vip', 0.05], ['express', 0.75]]]]) {
  for (const gp of [0.35, 0.50, 0.65]) {
    for (const every of [5.5, 6.0, 6.5, 7.0]) {
      PAT_SCALE = 1; GROUP_P = gp;
      const opts = { spawnEvery: every, mix };
      const acc = (pol) => {
        let tips = 0, quits = 0;
        for (let i = 0; i < 150; i++) { const r = runShift(pol, 9, 1000 + i, opts); tips += r.tips; quits += r.quits; }
        return { tips: tips / 150, quits: quits / 150 };
      };
      const n = acc(nearest), p = acc(planner);
      const tr = p.tips / n.tips, qr = n.quits > 0 ? p.quits / n.quits : NaN;
      const playable = p.quits >= 0.6 && p.quits <= 1.6;
      const pass = tr >= 1.25 && qr <= 0.60 && playable;
      cells++; if (pass) passes++;
      console.log('  ' + String(exN).padStart(6) + '%  ' + String(Math.round(gp * 100)).padStart(5) + '%  ' +
        f1(every).padStart(5) + 's   ' + f2(tr).padStart(6) + '   ' + (isNaN(qr) ? '   -  ' : f2(qr).padStart(6)) +
        '   ' + f2(p.quits).padStart(5) + '   ' + (pass ? 'PASS' : (playable ? ' .' : 'off-band')));
    }
  }
}
GROUP_P = 0;
console.log('\n  ' + passes + ' of ' + cells + ' cells pass row 1 on a playable shift.');
console.log('  ' + (passes >= 4 ? 'A REGION, not an edge.' : passes > 0 ? 'Too few: this is an edge, not a region.' : 'None.'));

/* Across the neighbourhood the express SHARE barely moves the ratios (45, 60
   and 75 per cent give the same numbers to two decimals at a fixed group
   rate), which says groups are carrying it. Attribution matters for the build
   order: groups are an M2 change to spawning, express is an M4 passenger type. */
console.log('\n\nATTRIBUTION — groups alone, express alone, both. 150 paired shifts.\n');
console.log('  rules                        every    tips x   quits x   planQ   verdict');
for (const [label, mix, gp, every] of [
  ['neither (M1)',                MIX_NOEX, 0.00, 5.5],
  ['express 60% only',            MIX_EX60, 0.00, 5.5],
  ['groups 50% only',             MIX_NOEX, 0.50, 6.0],
  ['groups 50% only',             MIX_NOEX, 0.50, 6.5],
  ['groups 50% only',             MIX_NOEX, 0.50, 7.0],
  ['groups 50% + express 60%',    MIX_EX60, 0.50, 6.0],
  ['groups 50% + express 60%',    MIX_EX60, 0.50, 6.5],
]) {
  PAT_SCALE = 1; GROUP_P = gp;
  const opts = { spawnEvery: every, mix };
  const acc = (pol) => { let tips = 0, quits = 0; for (let i = 0; i < 150; i++) { const r = runShift(pol, 9, 1000 + i, opts); tips += r.tips; quits += r.quits; } return { tips: tips / 150, quits: quits / 150 }; };
  const n = acc(nearest), p = acc(planner);
  const tr = p.tips / n.tips, qr = n.quits > 0 ? p.quits / n.quits : NaN;
  const playable = p.quits >= 0.6 && p.quits <= 1.6;
  console.log('  ' + label.padEnd(28) + f1(every).padStart(5) + 's   ' + f2(tr).padStart(6) + '   ' +
    (isNaN(qr) ? '   -  ' : f2(qr).padStart(6)) + '   ' + f2(p.quits).padStart(5) + '   ' +
    (tr >= 1.25 && qr <= 0.60 && playable ? 'PASS' : (playable ? ' .' : 'off-band')));
}
GROUP_P = 0;
