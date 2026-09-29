// Marble autopilot, second version. It reads a course's pieces (in the order
// the marble meets them) and plays it the way a careful player would: slow for
// turns, wait at a moving pad until it has just arrived, ride it, roll off when
// it stops; wait at a hologram bridge until it has just lit, then cross fast.
// Two ways to drive:
//   fast(n)  holds the game's clock and steps it with a given stick, through the
//            same update() a frame runs (quick, for tuning forty courses)
//   live(n)  steers through REAL pointer events on the HUD canvas, in real time,
//            the path a thumb takes (the proof)
window.__pilot = (() => {
  const H = window.__marble;
  const ferryStop = (p, t) => {             // at which end a moving pad waits now, and for how much longer
    const u = ((t / p.period + p.phase / (2 * Math.PI)) % 1 + 1) % 1, a = p.dwell / p.period;
    if (u < a) return { end: 1, left: (a - u) * p.period };
    if (u >= 0.5 && u < 0.5 + a) return { end: -1, left: (0.5 + a - u) * p.period };
    return { end: 0, left: 0 };
  };
  const F0 = (p) => ({ t: 'flat', x: p.x, z: p.z + (p.d || 0) / 2 + 1, w: p.w, d: 0.01, y: p.y });
  const x0Of = (p, lx) => (p ? p.x : lx);
  // Number each moving pad, bridge and crossing as the game does: in the order of the pieces.
  function annotate(P) {
    if (P._ann) return; P._ann = true;
    let fi = 0, hi = 0, ci = 0, wi = 0, fl = 0;
    for (const p of P) {
      if (p.t === 'wind') p._wi = wi++;
      if (p.t === 'flames') p._fli = fl++;
      if (p.t === 'ferry' || p.t === 'train') p._fi = fi++;
      else if (p.t === 'holo') p._hi = hi++;
      else if (p.t === 'cross') p._ci = ci++;
    }
  }
  const SPACE_T = ['hole', 'clamp', 'ion', 'droids', 'erupt'];
  function route(C, opts = {}) {
    const P = C.pieces, steps = [], skip = (p) => !!opts.skipPuzzle || (!!opts.skipId && p.id === opts.skipId);   // skipId: that puzzle only
    annotate(P);
    let lx = C.start[0];
    const go = (x, z, v, r, why) => steps.push({ k: 'go', x, z, v: opts.slippery && !opts.cityPace ? Math.min(v, 2.6) : v, r, why });
    for (let i = 1; i < P.length; i++) {
      const p = P[i];
      const near = p.t === 'ramp' ? p.z0 : p.z + p.d / 2, far = p.t === 'ramp' ? p.z1 : p.z - p.d / 2;
      if (p.t === 'planks') {                            // a plank crossing: hop lane to lane when the landing is sure
        steps.push({ k: 'planks', why: 'planks', p: opts.carelessHop || skip(p) ? { ...p, _careless: true } : p });
        lx = p.x;
        continue;
      }
      if (p.t === 'portal') {                            // through the portal: on until it has carried the marble over
        steps.push({ k: 'push', why: 'portal', dx: 0, dz: -1, x: p.x, z: p.z, until: (t, s) => s.ball[2] < p.to[2] + 0.5 });
        continue;
      }
      if (p.t === 'plaza' && p.sp) {                     // a space puzzle (levels 101-150): the puzzle pilot's own controller
        steps.push({ k: 'sppuz', why: 'space ' + p.id, p, z: +(p.z0 + 1.5).toFixed(2) });
        lx = +(p.x0 + (p.exit + 0.5) * 2.2).toFixed(2);
        continue;
      }
      if (SPACE_T.includes(p.t)) {                        // the machine's obstacles, nearest first (an ion field lists its far magnet first): the space pilot's careful way
        let k = i; while (k + 1 < P.length && SPACE_T.includes(P[k + 1].t)) k++;
        for (const q of P.slice(i, k + 1).sort((a, b) => b.z - a.z)) {
          steps.push({ k: 'spob', why: q.t, p: q, z: +(q.z + (q.d || 0) / 2 + 1.5).toFixed(2) });
          if (q.t === 'ion' && q.always) lx = +(q.x + q.side * 5.2).toFixed(2);
        }
        i = k; continue;
      }
      if (p.t === 'flat' && P.some((q) => SPACE_T.includes(q.t) && Math.abs(q.x - p.x) < 0.5 && Math.abs(q.z - p.z) <= p.d / 2 + 0.01)) continue;   // the rail under one: its controller crosses it
      if (p.t === 'plaza' && p.riddle) {                 // a riddle: over the tile that belongs (careless: straight up the middle)
        const CELL = 2.2, X = (c) => +(p.x0 + (c + 0.5) * CELL).toFixed(2), Zr = (r) => +(p.z0 - (r + 0.5) * CELL).toFixed(2);
        let ac = p.entry, ar = 2;
        for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) { const ch = p.map[2 * (p.rows - 1 - r) + 1][2 * c + 1], L = p.legend[ch]; if (L && L.choice === p.riddle.answer) { ac = c; ar = r; } }
        if (skip(p)) ac = p.entry;
        go(X(p.entry), Zr(ar - 1), 3, 0.35, 'riddle'); go(X(ac), Zr(ar - 1), 3, 0.35, 'riddle');
        go(X(ac), Zr(ar), 2.5, 0.35, 'riddle'); go(X(ac), Zr(ar + 1), 2.5, 0.35, 'riddle');
        go(X(p.exit), Zr(p.rows - 1), 3, 0.35, 'riddle'); go(X(p.exit), +(p.z0 - p.d - 0.8).toFixed(2), 3, 0.5, 'riddle');
        lx = X(p.exit);
        continue;
      }
      if (p.t === 'plaza' && p.water) {                  // the boat: to the right valves (round the wrong ones), onto the boat, over
        steps.push({ k: 'water', why: 'boat', p, careless: skip(p) });
        lx = +(p.x0 + (p.exit + 0.5) * 2.2).toFixed(2);
        continue;
      }
      if (p.t === 'plaza' && p.tune) {                   // a tune: hear it, then roll to its drums in order, round the others
        steps.push({ k: 'tune', why: 'tune', p, careless: skip(p) });
        lx = +(p.x0 + (p.exit + 0.5) * 2.2).toFixed(2);
        continue;
      }
      if (p.t === 'plaza' && p.twin) {                   // a twin: the pushes that bring you to the way out and it to its pad
        steps.push({ k: 'ice', why: 'twin', p, twin: true, careless: skip(p) ? 'north' : false });
        lx = +(p.x0 + (p.exit + 0.5) * 2.2).toFixed(2);
        continue;
      }
      if (p.t === 'plaza' && p.cover) {                  // a square of tiles: the one route through every tile, a push to a tile
        steps.push({ k: 'ice', why: 'tiles', p, cover: true, careless: skip(p) ? 'north' : false });
        lx = +(p.x0 + (p.exit + 0.5) * 2.2).toFixed(2);
        continue;
      }
      if (p.t === 'plaza' && p.ice) {                    // an ice maze: slide by slide, the search's way out from wherever it rests
        steps.push({ k: 'ice', why: 'ice maze', p, careless: skip(p) ? 'north' : opts.randomIce ? 'random' : false });
        lx = +(p.x0 + (p.exit + 0.5) * 2.2).toFixed(2);
        continue;
      }
      if (p.t === 'plaza') {                             // a puzzle square: the search's way through, cell by cell
        if (skip(p)) go(p.x0 + (p.exit + 0.5) * 2.2, p.z0 - p.d - 0.8, 3, 0.5, 'square (skipped)');
        else steps.push({ k: 'plaza', why: 'square', p, x: p.x0 + (p.entry + 0.5) * 2.2, z: +(p.z0 + 0.6).toFixed(2), v: opts.race ? 4.2 : 3 });
        lx = +(p.x0 + (p.exit + 0.5) * 2.2).toFixed(2);
        continue;
      }
      if (p.t === 'reset' || p.bay || p.t === 'curtain' || p.t === 'lock' || p.spoke || p.detour !== undefined || p.t === 'posts' || p.t === 'shards' || p.t === 'block' || (p.t === 'flat' && p.gauntlet)) continue;
      if (p.t === 'flat' && p.crack) {                   // a crystal bridge: straight over at a steady pace, never stopping
        let k = i; while (k + 1 < P.length && P[k + 1].t === 'flat' && P[k + 1].crack) k++;
        const last = P[k];
        if (opts.stopOnCrack) steps.push({ k: 'hold', why: 'stopped on a crack', x: lx, z: +(p.z).toFixed(2), until: () => false });
        else steps.push({ k: 'go', why: 'crystal bridge', x: lx, z: +(last.z - last.d / 2 - 1.4).toFixed(2), v: 3.6, r: 0.8, pass: true });
        i = k; continue;
      }
      if (p.branch) {                                     // a fork: take one way through, skip the other
        const all = []; let k = i;
        while (k < P.length && P[k].branch) all.push(P[k++]);
        const want = opts.fork || 'long';
        const mine = all.filter((q) => q.branch === want);
        go(mine[0].x, mine[0].z + (mine[0].d || 0) / 2 - 0.4, 3, 0.5, 'fork');
        const sub = [F0(mine[0])].concat(mine.map((q) => ({ ...q, branch: undefined }))); sub._ann = true;
        const inner = route({ pieces: sub, start: [mine[0].x, 0, 0] }, opts);
        for (const st of inner) steps.push(st);
        const last = mine[mine.length - 1];
        go(last.x, last.z - last.d / 2 - 0.6, 3, 0.5, 'fork end');   // straight off the end of the branch, not across its edge
        lx = x0Of(P[k], lx);
        i = k - 1;
        continue;
      }
      if (p.t === 'worm') {                               // into a wormhole: its world's course, then out of the twin
        if (p.dir === 'in') {
          go(p.x, p.z - 1.2, 4, 0.5, 'wormhole');
          if (opts.pocketDelay) {                        // for a check: wait at the canyon's start this long first
            let t0 = null;
            steps.push({ k: 'hold', why: 'canyon delay', pocket: true, x: p.pocket.start[0], z: p.pocket.start[2] - 1.5,
                         until: (t) => { if (t0 === null) t0 = t; if (t - t0 > opts.pocketDelay) { t0 = null; return true; } return false; } });
          }
          const inner = route({ pieces: p.pocket.pieces, start: p.pocket.start }, { ...opts, slippery: true });
          for (const st of inner) steps.push({ ...st, pocket: true });
        } else if (p.dir === 'exit') go(p.x, p.z - 1.2, 3, 0.5, 'way out');
        continue;
      }
      if (p.t === 'flat' && p.lane) {                     // a fork: take the lane whose colour opens the wall ahead
        const wall = P.slice(i).find((q) => q.t === 'lock');
        const want = opts.wrongLane ? 3 - wall.col : wall.col;
        if (p.lane !== want) continue;
        go(p.x, near - 0.4, 3, 0.45, 'fork'); go(p.x, far + 0.9, 3.5, 0.6, 'lane');
        continue;
      }
      if (p.t === 'flat') {
        if (Math.abs(p.x - lx) > 0.3) {
          const nx = +(2 * p.x - lx).toFixed(2), v = p.d < 2 ? 2.2 : 3;
          go(lx, p.z, v, 0.3, 'turn'); go(nx, p.z, v, 0.3, 'turn'); lx = nx;
        } else if (P[i + 1] && P[i + 1].t === 'loop') {  // full speed at a loop, no easing off
          const zz = far + 0.2;
          steps.push({ k: 'push', why: 'into the loop', dx: 0, dz: -1, x: lx, z: zz, until: (t, s) => s.ball[2] < zz });
        }
        else go(lx, far + 0.9, p.w < 2 ? 3.4 : 4.5, 0.7, i === P.length - 1 ? 'finish' : 'run');
      } else if (p.t === 'ramp') go(lx, far + 0.8, 4.2, 0.7, 'ramp');
      else if (p.t === 'ferry') {
        const j = p._fi;
        if (p.axis === 'x') {
          const plus = +(p.x + p.amp).toFixed(2), minus = +(p.x - p.amp).toFixed(2);
          const nearEnd = Math.abs(plus - lx) < Math.abs(minus - lx) ? 1 : -1;
          steps.push({ k: 'hold', why: 'slide', x: lx, z: near + 0.55, fi: j,
                       until: (t) => { const s = ferryStop(p, t); return s.end === nearEnd && s.left > 0.75; } });
          steps.push({ k: 'ride', why: 'slide', fi: j, z: p.z,
                       until: (t, s, F) => ferryStop(p, t).end === -nearEnd && Math.abs(s.ball[0] - F[j][0]) < 0.5 && Math.abs(s.ball[2] - F[j][2]) < 0.6 });
          lx = nearEnd === 1 ? minus : plus;
        } else {
          steps.push({ k: 'hold', why: 'shuttle', x: lx, z: p.z + p.amp + p.d / 2 + 0.55, fi: j,
                       until: (t) => { const s = ferryStop(p, t); return s.end === 1 && s.left > 0.75; } });
          steps.push({ k: 'ride', why: 'shuttle', fi: j, z: p.z,
                       until: (t, s, F) => ferryStop(p, t).end === -1 && Math.abs(s.ball[0] - F[j][0]) < 0.5 && Math.abs(s.ball[2] - F[j][2]) < 0.6 });
        }
      } else if (p.t === 'holo') {
        const j = p._hi;
        steps.push({ k: 'hold', why: 'bridge', x: lx, z: near + 0.55, until: (t, s, F, HO) => HO[j].lit && HO[j].t < 0.25 });
        go(lx, far - 1.0, 8, 0.8, 'bridge');
      } else if (p.t === 'train') {                       // board when it has just come in, ride near its front, off at the next station
        const j = p._fi, front = -(p.d / 2 - 2.5);
        steps.push({ k: 'hold', why: 'train', x: lx, z: p.z + p.amp + p.d / 2 + 0.55, fi: j,
                     until: (t) => { const s = ferryStop(p, t); return s.end === 1 && s.left > 2.2; } });
        steps.push({ k: 'ride', why: 'train', fi: j, z: p.z, dz: front, v: 5,
                     until: (t, s, F) => { const q = ferryStop(p, t); return q.end === -1 && q.left > 1.6 && Math.abs(s.ball[2] - (F[j][2] + front)) < 1.2; } });
      } else if (p.t === 'cross') {                       // wait at the line for green, then go
        const j = p._ci;
        steps.push({ k: 'hold', why: 'cross', x: lx, z: near + 0.55, until: (t, s, F, HO, CR) => CR[j].green && CR[j].greenFor < 0.25 });
        if (p.fire) steps.push({ k: 'go', why: 'cross', x: lx, z: +(far - 0.9).toFixed(2), v: 3.4, r: 0.7, pass: true });   // on the slippery road: a steady run over
        else go(lx, far - 0.9, 5.5, 0.7, 'cross');
      } else if (p.t === 'boost' && P[i + 2] && P[i + 2].t === 'loop') {
        const zz = far;
        steps.push({ k: 'push', why: 'boost', dx: 0, dz: -1, x: lx, z: zz, until: (t, s) => s.ball[2] < zz });
      } else if (p.t === 'boost') go(lx, far + 0.3, 8, 1, 'boost');
      else if (p.t === 'loop') {                          // straight in at full speed; the loop carries it round
        const out = +(p.x + p.shift).toFixed(2);
        steps.push({ k: 'push', why: 'loop', dx: 0, dz: -1, x: p.x, z: p.z,
                     until: (t, s) => Math.abs(s.ball[0] - out) < 0.6 && s.ball[2] < p.z - 0.6 && s.ball[1] < p.y + 0.7 });
        lx = out;
      }
      else if (p.t === 'mag' || p.t === 'wind') {       // lean against the pull or the gust (see steer)
        if (p.t === 'wind' && opts.meetGust) {            // for a clip: wait at the gap until a gust is on its way
          const j = p._wi;
          steps.push({ k: 'hold', why: 'wind wait', x: lx, z: near + 0.6, until: () => { const w = H.winds()[j]; return w && w.k === 0 && w.show > 0.08; } });
        }
        go(lx, far + 0.9, p.t === 'wind' && opts.meetGust ? 3 : 4.2, 0.7, p.t);
      }
      else if (p.t === 'gauntlet') {                     // from gap to gap, straight through each
        if (opts.ignoreBlocks) go(p.x, p.z - p.d / 2 - 0.6, 4.2, 0.7, 'blocks (careless)');
        else for (const [px, pz] of p.path) go(px, pz, 2.6, 0.35, 'weave');
        lx = p.x;
      }
      else if (p.t === 'flames') {                       // wait back from the first line until its flame has just died, then through at a steady pace
        const j = p._fli;
        if (!opts.ignoreFire) steps.push({ k: 'hold', why: 'fire', x: lx, z: +(near + 1.2).toFixed(2), until: () => { const L = H.flames()[j].lines[0]; return !L.active && L.offFor < 0.12; } });
        else if (opts.fireDelay) { let t0 = null; steps.push({ k: 'hold', why: 'fire delay', x: lx, z: +(near + 1.2).toFixed(2), until: (t) => { if (t0 === null) t0 = t; if (t - t0 > opts.fireDelay) { t0 = null; return true; } return false; } }); }
        steps.push({ k: 'go', why: opts.ignoreFire ? 'fire (careless)' : 'through the fire', x: lx, z: +(far - 1).toFixed(2), v: 3.2, r: 0.8, pass: true });
      }
      else if (p.t === 'scan') {                         // wait at the threshold, then down a lane the bar will not touch
        if (opts.ignoreScan) go(lx, far + 0.9, 4.5, 0.7, 'scan (careless)');
        else steps.push({ k: 'scan', why: 'scanner', p, x: lx, z: near + 0.7 });
      }
      else if (p.t === 'switch') {                       // down the side road, over the button, and back to the junction
        if (!opts.ignoreSwitch) { go(p.x, p.z, 3.4, 0.4, 'switch'); go(p.jx, p.jz, 3.4, 0.5, 'back from the switch'); }
      }
      else if (p.t === 'tube') {                         // roll into the mouth; the tube does the rest
        go(lx, p.z + 1.6, 4.5, 0.6, 'tube');
        steps.push({ k: 'push', why: 'into the tube', dx: 0, dz: -1, x: lx, z: p.z, until: (t, s) => s.tube });
        steps.push({ k: 'wait', why: 'tube ride', x: lx, z: p.z - p.gap, until: (t, s) => !s.tube });
      }
      else if (p.t === 'round') {                        // onto the ring, round with it, and off at the road that leads on
        const rm = (p.ri + p.ro) / 2, ang = { W: Math.PI, N: 1.5 * Math.PI, E: 2 * Math.PI }[p.lead];
        const ux = { W: -1, N: 0, E: 1 }[p.lead], uz = p.lead === 'N' ? -1 : 0;
        go(p.x, p.z + p.ro + 0.5, 2.6, 0.5, 'roundabout');
        steps.push({ k: 'orbit', why: 'roundabout', cx: p.x, cz: p.z, rm, to: ang - (opts.noLead ? 0 : 0.5), x: p.x, z: p.z + p.ro });
        if (opts.noLead) steps.push({ k: 'push', why: 'roundabout out', dx: ux, dz: uz, x: p.x, z: p.z, until: (t, s) => Math.hypot(s.ball[0] - p.x, s.ball[2] - p.z) > p.ro + 1 });
        else go(p.x + ux * (p.ro + 1.1), p.z + uz * (p.ro + 1.1), 2.6, 0.45, 'roundabout out');
        if (p.lead !== 'N') { const nx = +(p.x + ux * (p.ro + 1.5 + p.ew / 2)).toFixed(2); go(nx, p.z, 2.4, 0.4, 'corner'); lx = nx; }
      }
      else if (p.t === 'jump') {                          // keep on at speed through the air, to a point on the landing
        const land = P[i + 1], landNear = land.z + land.d / 2;
        go(lx, landNear - 1.5, 8, 1.2, 'jump');
      }
    }
    if (opts.startDelay && !opts.slippery && !P._sub) steps.unshift({ k: 'wait', why: 'start delay', x: C.start[0], z: C.start[2], until: (t) => t > opts.startDelay });
    if (opts.race && !opts.slippery) {                  // a quick, clean run, for the star times
      const PASS = new Set(['run', 'ramp', 'mag', 'wind', 'bridge', 'cross', 'finish', 'boost', 'scan (careless)']);
      const mine = steps.filter((st) => st.k === 'go' && !st.raced && !st.pocket);
      for (const st of mine) {
        st.raced = true;
        if (PASS.has(st.why)) { st.v = Math.min(opts.race, st.v * 1.7); st.pass = true; st.r = Math.max(st.r, 1); }
        else st.v *= 1.2;
      }
      // Carry speed only into another straight; brake into anything else.
      for (let k = 0; k < steps.length; k++) if (steps[k].pass && !(steps[k + 1] && steps[k + 1].pass)) steps[k].pass = false;
    }
    return steps;
  }
  // A sideways push (a maglev strip, a gust) is met by leaning against it, as
  // a player does once they see the marble pushed: LEAN.delay seconds late.
  const LEAN = { on: true, delay: 0, hist: [] };
  function leanPush(s) {
    const t = H.simT();
    LEAN.hist.push([t, s.push || 0]);
    while (LEAN.hist.length > 2 && LEAN.hist[1][0] <= t - LEAN.delay) LEAN.hist.shift();
    return LEAN.on ? LEAN.hist[0][1] : 0;
  }
  function steer(s, tx, tz, vmax, pass) {
    const [x, , z] = s.ball, [vx, , vz] = s.v;
    const dx = tx - x, dz = tz - z, dist = Math.hypot(dx, dz);
    const sp = pass ? vmax : Math.min(vmax, dist * 2.2);
    const dvx = dist > 1e-3 ? dx / dist * sp : 0, dvz = dist > 1e-3 ? dz / dist * sp : 0;
    const [cvx, cvz] = (!LEAN.noCarry && s.carry) || [0, 0], [fx, fz] = (!LEAN.noCarry && s.cf) || [0, 0];   // on a roundabout: its carry and its outward push
    let ix = (dvx - vx - cvx) * 0.5 - leanPush(s) / 18 - fx / 18, iz = (dvz - vz - cvz) * 0.5 - fz / 18;
    const m = Math.hypot(ix, iz); if (m > 1) { ix /= m; iz /= m; }
    return [ix, iz, dist];
  }
  // After a fall the marble is back at the last green ring: carry on from there.
  function resumeAt(C, s, steps) {
    // Back where the marble comes home: a ring, the far side of a wormhole, or the start of a wormhole's world.
    const sz = s.spawn[2];
    const i = steps.findIndex((st) => !!st.pocket === !!s.pocket && st.z < sz - 0.05);
    return i < 0 ? 0 : i;
  }
  // Through a wormhole the marble changes world at once: carry on from that world's part of the plan.
  function crossWorlds(steps, i, nowPocket) {
    for (let k = i; k < steps.length; k++) if (!!steps[k].pocket === nowPocket) return k;
    return i;
  }
  // One tick of play: the stick to hold, and whether this step is done.
  // Where a scanner's bar i stands at time t (as the game has it), and a plan:
  // the earliest start, and the lane, that the bars will not touch on the way
  // through, rolling from rest at the threshold at v.
  const scanX = (P, t, i) => P.x + (i ? -1 : 1) * (P.w / 2 + 0.45) * Math.cos(2 * Math.PI * (t + P.phase) / P.period);
  function scanPlan(P, t0) {
    for (const v of [5.5, 6.5, 7.5]) { const pl = scanPlanAt(P, t0, v); if (!pl.none) return pl; }
    return { lane: P.x, ts: t0 + 0.9, v: 6.5, none: true };
  }
  function scanPlanAt(P, t0, v) {
    const a = 18, tAcc = v / a, dAcc = v * v / (2 * a), lead = 0.7, R = 0.42, bars = P.bars || 1;
    const lanes = bars === 2 ? [P.x, P.x - (P.w / 2 - 0.55), P.x + (P.w / 2 - 0.55)] : [P.x - (P.w / 2 - 0.55), P.x + (P.w / 2 - 0.55), P.x];
    const pos = (u) => (u < tAcc ? 0.5 * a * u * u : dAcc + (u - tAcc) * v);
    const out = tAcc + Math.max(0, lead + P.d + R + 0.3 - dAcc) / v;
    for (let ts = t0 + 0.9; ts < t0 + 0.9 + 2 * P.period; ts += 0.05) {
      for (const lane of lanes) {
        let ok = true;
        for (let u = 0; u <= out && ok; u += 0.02) {
          const dz = pos(u);
          if (dz < lead - R - 0.1 || dz > lead + P.d + R + 0.1) continue;
          for (let i = 0; i < bars; i++) if (Math.abs(scanX(P, ts + u, i) - lane) < R + 0.25) { ok = false; break; }
        }
        if (ok) return { lane: +lane.toFixed(2), ts, v };
      }
    }
    return { lane: P.x, ts: t0 + 0.9, v, none: true };
  }
  // A square's way through, from how it stands now: the cells to roll to, in order.
  function plazaPlan(p) {
    const CELL = 2.2, S = new __pz.Square({ id: p.id, map: p.map, legend: p.legend, entry: p.entry, exit: p.exit });
    const all = H.plaza(), now = all.find((q) => Math.abs(q.x0 - p.x0) < 0.01 && Math.abs(q.z0 - p.z0) < 0.01) || all[0], s0 = S.start();   // this square's state, of several
    s0.held = now.held;
    s0.ped = S.peds.map((k) => now.stands.find((q) => q.c + ',' + q.r === k).n);
    s0.kg = S.kgates.map((k) => (now.gates.find((g) => g.ek === k).state !== 'shut' ? 1 : 0));
    s0.sg = S.sgates.map((k) => (now.gates.find((g) => g.ek === k).state === 'open' ? 1 : 0));
    s0.W = now.crates.filter((W) => !W.sunk).map((W) => W.c + ',' + W.r).sort().join(';');
    s0.F = now.crates.filter((W) => W.sunk).map((W) => W.c + ',' + W.r).sort().join(';');   // gaps filled so far
    s0.tiles = S.tiles.map((k) => now.tiles.find((q) => q.c + ',' + q.r === k).mask);
    s0.charged = now.charged ? 1 : 0;
    s0.mir = S.mirrors.map((k) => now.mirrors.find((q) => q.c + ',' + q.r === k).m);
    const b = H.state().ball, c = Math.floor((b[0] - p.x0) / CELL), r = Math.floor((p.z0 - b[2]) / CELL);
    if (c >= 0 && c < p.cols && r >= 0 && r < p.rows) s0.pos = [c, r];
    const sol = S.solve(300000, s0);
    if (!sol.path) return null;
    const pts = sol.path.map((q) => [p.x0 + (q.pos[0] + 0.5) * CELL, p.z0 - (q.pos[1] + 0.5) * CELL]);
    if (!(c >= 0 && c < p.cols && r >= 0 && r < p.rows)) pts.unshift([p.x0 + (p.entry + 0.5) * CELL, p.z0 + 0.4]);
    pts.push([p.x0 + (p.exit + 0.5) * CELL, p.z0 - p.d - 1.2]);
    return { pts, cells: sol.path.map((q) => q.pos.join(',')) };
  }
  // The ice maze's rules (as the game plays them): from (c, r) at rest, where a slide the way (dc, dr) ends.
  function iceSlide(p, c, r, dc, dr) {
    const rows = p.rows, cols = p.cols, M = p.map, cell = (cc, rr) => M[2 * (rows - 1 - rr) + 1][2 * cc + 1];
    const hW = (cc, k) => M[2 * (rows - k)][2 * cc + 1] !== ' ', vW = (cc, rr) => M[2 * (rows - 1 - rr) + 1][2 * cc] !== ' ';
    let moved = false;
    for (let g = 0; g < 99; g++) {
      const nc = c + dc, nr = r + dr;
      if (dr === 1 && r === rows - 1) return c === p.exit ? 'EXIT' : moved ? c + ',' + r : null;
      if (dr === -1 && r === 0) return c === p.entry ? 'OUT' : moved ? c + ',' + r : null;
      if ((dc === 1 && c === cols - 1) || (dc === -1 && c === 0)) return moved ? c + ',' + r : null;
      if (r >= 0 && ((dr === 1 && hW(c, r + 1)) || (dr === -1 && hW(c, r)) || (dc === 1 && vW(c + 1, r)) || (dc === -1 && vW(c, r)))) return moved ? c + ',' + r : null;
      const ch = cell(nc, nr);
      if (ch === 'o') return moved ? c + ',' + r : null;
      c = nc; r = nr; moved = true;
      if (ch === '#') return 'FALL';
      if (ch === 's') return c + ',' + r;
    }
    return null;
  }
  function icePlan(p, c0, r0) {                       // the shortest run of slides out, from here
    const D = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] }, start = c0 + ',' + r0, prev = new Map([[start, null]]), q = [start];
    while (q.length) {
      const k = q.shift(), [c, r] = k.split(',').map(Number);
      for (const [d, [dc, dr]] of Object.entries(D)) {
        const to = iceSlide(p, c, r, dc, dr);
        if (!to || to === 'FALL' || to === 'OUT') continue;
        if (to === 'EXIT') { const path = [d]; for (let x = k; prev.get(x); x = prev.get(x)[0]) path.unshift(prev.get(x)[1]); return path; }
        if (!prev.has(to)) { prev.set(to, [k, d]); q.push(to); }
      }
    }
    return null;
  }
  const ICE_STICK = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
  // The twin: from (you, it) now, the shortest run of pushes to you at the way out and it on its pad (then north, out).
  function twinPlan(p, yc, yr, tc, tr, pad) {
    const rows = p.rows, cols = p.cols, M = p.map, D = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] }, MIR = { N: 'N', S: 'S', E: 'W', W: 'E' };
    const can = (c, r, d) => {
      const [dc, dr] = D[d], nc = c + dc, nr = r + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) return false;
      const e = d === 'N' ? M[2 * (rows - r - 1)][2 * c + 1] : d === 'S' ? M[2 * (rows - r)][2 * c + 1] : d === 'E' ? M[2 * (rows - 1 - r) + 1][2 * c + 2] : M[2 * (rows - 1 - r) + 1][2 * c];
      return e === ' ';
    };
    const s0 = [yc, yr, tc, tr], key = (x) => x.join(','), prev = new Map([[key(s0), null]]), q = [s0];
    for (let h = 0; h < q.length; h++) {
      const x = q[h];
      if (x[0] === p.exit && x[1] === rows - 1 && x[2] === pad[0] && x[3] === pad[1]) {
        const path = []; for (let k = key(x); prev.get(k); k = prev.get(k)[0]) path.unshift(prev.get(k)[1]);
        return [...path, 'N'];
      }
      for (const d of 'NSEW') {
        if ((d === 'S' && x[0] === p.entry && x[1] === 0) || (d === 'N' && x[0] === p.exit && x[1] === rows - 1)) continue;   // out through a gap: not a move
        const a = can(x[0], x[1], d), b = can(x[2], x[3], MIR[d]);
        if (!a && !b) continue;
        const t = [a ? x[0] + D[d][0] : x[0], a ? x[1] + D[d][1] : x[1], b ? x[2] + D[MIR[d]][0] : x[2], b ? x[3] + D[MIR[d]][1] : x[3]];
        if (!prev.has(key(t))) { prev.set(key(t), [key(x), d]); q.push(t); }
      }
    }
    return null;
  }
  // Every tile once, from the tile in to the tile out: the pushes, in order (then one more north, over the bridge).
  function coverPlan(p) {
    const rows = p.rows, cols = p.cols, M = p.map, ok = (c, r) => c >= 0 && c < cols && r >= 0 && r < rows && M[2 * (rows - 1 - r) + 1][2 * c + 1] !== '#';
    const wall = (c, r, d) => (d === 'N' ? M[2 * (rows - r - 1)][2 * c + 1] : d === 'S' ? M[2 * (rows - r)][2 * c + 1] : d === 'E' ? M[2 * (rows - 1 - r) + 1][2 * c + 2] : M[2 * (rows - 1 - r) + 1][2 * c]) !== ' ';
    const D = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] };
    let n = 0; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (ok(c, r)) n++;
    const seen = new Set([p.entry + ',0']), path = [], cells = [p.entry + ',0'];
    const go = (c, r) => {
      if (seen.size === n) return c === p.exit && r === rows - 1;
      if (c === p.exit && r === rows - 1) return false;
      for (const [d, [dc, dr]] of Object.entries(D)) {
        const nc = c + dc, nr = r + dr, k = nc + ',' + nr;
        if (!ok(nc, nr) || seen.has(k) || wall(c, r, d)) continue;
        seen.add(k); path.push(d); cells.push(k);
        if (go(nc, nr)) return true;
        seen.delete(k); path.pop(); cells.pop();
      }
      return false;
    };
    return go(p.entry, 0) ? { dirs: [...path, 'N'], cells } : null;   // dirs[k]: the push from cells[k]
  }
  // The cells from (c, r) to (tc, tr) in a square, round every drum but the one it is going to (and through no wall).
  function tunePath(p, c0, r0, tc, tr) {
    const rows = p.rows, cols = p.cols, M = p.map, drum = (c, r) => /[a-f]/.test(M[2 * (rows - 1 - r) + 1][2 * c + 1]);
    const wall = (c, r, d) => (d === 'N' ? M[2 * (rows - r - 1)][2 * c + 1] : d === 'S' ? M[2 * (rows - r)][2 * c + 1] : d === 'E' ? M[2 * (rows - 1 - r) + 1][2 * c + 2] : M[2 * (rows - 1 - r) + 1][2 * c]) !== ' ';
    const D = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] }, start = c0 + ',' + r0, prev = new Map([[start, null]]), q = [[c0, r0]];
    while (q.length) {
      const [c, r] = q.shift();
      if (c === tc && r === tr) { const out = []; for (let k = c + ',' + r; k; k = prev.get(k)) out.unshift(k.split(',').map(Number)); return out; }
      for (const [d, [dc, dr]] of Object.entries(D)) {
        const nc = c + dc, nr = r + dr, k = nc + ',' + nr;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows || prev.has(k) || wall(c, r, d)) continue;
        if (drum(nc, nr) && !(nc === tc && nr === tr)) continue;
        prev.set(k, c + ',' + r); q.push([nc, nr]);
      }
    }
    return null;
  }
  // The boat: which tanks make the line (one set), and the cells from here that open them all and no other, to the way out.
  function waterPlan(p, c0, r0, opened, setOnly) {
    const rows = p.rows, cols = p.cols, M = p.map, ch = (c, r) => M[2 * (rows - 1 - r) + 1][2 * c + 1];
    const T = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (/[1-9]/.test(ch(c, r))) T.push({ c, r, v: +ch(c, r) });
    let set = -1; for (let m = 1; m < 1 << T.length; m++) { let sum = 0; T.forEach((q, i) => { if (m >> i & 1) sum += q.v; }); if (sum === p.water) set = m; }
    if (setOnly) return set;
    const valve = new Map(T.map((q, i) => [q.c + ',' + (q.r - 1), i]));
    const wall = (c, r, d) => (d === 'N' ? M[2 * (rows - r - 1)][2 * c + 1] : d === 'S' ? M[2 * (rows - r)][2 * c + 1] : d === 'E' ? M[2 * (rows - 1 - r) + 1][2 * c + 2] : M[2 * (rows - 1 - r) + 1][2 * c]) !== ' ';
    const D = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] };
    let m0 = 0; T.forEach((q, i) => { if (opened.some((o) => o.c === q.c && o.r === q.r && o.open)) m0 |= 1 << i; });
    const s0 = [c0, r0, m0], key = (x) => x.join(','), prev = new Map([[key(s0), null]]), q = [s0];
    for (let h = 0; h < q.length; h++) {
      const x = q[h];
      if (x[0] === p.exit && x[1] === rows - 1 && x[2] === set) { const out = []; for (let k = key(x); k; k = prev.get(k)) out.unshift(k.split(',').slice(0, 2).map(Number)); return out; }
      for (const [d, [dc, dr]] of Object.entries(D)) {
        const nc = x[0] + dc, nr = x[1] + dr;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows || wall(x[0], x[1], d) || /[1-9]/.test(ch(nc, nr))) continue;
        const vi = valve.get(nc + ',' + nr), m = vi === undefined ? x[2] : x[2] | (1 << vi);
        if ((m & ~set) !== 0) continue;
        const t = [nc, nr, m];
        if (!prev.has(key(t))) { prev.set(key(t), key(x)); q.push(t); }
      }
    }
    return null;
  }
  // A plank's middle and how far it has sunk at time t (the game's own rule), and the hop's airtime.
  const CROSS_W = 16, HOP_T = 0.42, LANE = 2.4;
  function plankAt(Z, L, j, t) {
    const C = CROSS_W + L.len, u = (((L.v * t + j * C / L.n + L.phase) % C) + C) % C, xr = L.dir > 0 ? -C / 2 + u : C / 2 - u;
    const out = Math.max(0, Math.abs(xr) + L.len / 2 - CROSS_W / 2);
    return { x: Z.cx + xr, sink: Math.min(1, out / (L.len * 0.6)) };
  }
  function decide(st, s, F, HO, t, CR) {
    if (st.k === 'sppuz') { if (!st.ctl) st.ctl = window.__pp.control(st.p, {}); const o = st.ctl(s, 1 / 60); if (o.done) st.R = o.R; return [o.ix, o.iz, !!o.done]; }
    if (st.k === 'spob') { if (!st.ctl) st.ctl = window.__spc.control(st.p); const o = st.ctl(s, 1 / 60); return [o.ix, o.iz, !!o.done]; }
    if (st.k === 'planks') {
      const p = st.p, nz = p.z + p.d / 2, Z = H.planks().find((q) => Math.abs(q.nearZ - nz) < 0.02), now = H.simT(), b = s.ball;
      if (!Z) return [0, 0, false];
      if (b[2] < Z.farZ - 0.8) return [0, 0, true];                          // over
      if (!s.grounded) return [0, 0, false];                                 // in the air
      const k = b[2] > Z.nearZ ? -1 : Math.min(3, Math.floor((Z.nearZ - b[2]) / LANE));
      if (k === -1 && !st.ready) {                                           // to the ledge, just short of the first lane, and still
        const [ix, iz, d] = steer(s, Z.cx, Z.nearZ + 0.75, 2.2);
        if (d < 0.25 && Math.hypot(s.v[0], s.v[2]) < 0.3) st.ready = true;
        return [ix, iz, false];
      }
      // riding a plank: keep to its middle
      let vx = 0, hold = [0, 0];
      if (k >= 0 && s.plank) {
        const L = Z.lanes[k]; vx = L.v * L.dir;
        let best = null; for (let j = 0; j < L.n; j++) { const A = plankAt(Z, L, j, now); if (!best || Math.abs(A.x - b[0]) < Math.abs(best.x - b[0])) best = A; }
        const dx = best.x - b[0]; hold = [Math.max(-1, Math.min(1, dx * 0.8 - s.v[0] * 0.3)), Math.max(-1, Math.min(1, (L.z - b[2]) * 0.8 - s.v[2] * 0.3))];
      }
      if (st.cool && now < st.cool) return [...hold, false];
      const xl = b[0] + vx * HOP_T;
      let go = false;
      if (k + 1 >= 4 || st.p._careless) go = true;                          // the far side does not move (careless: hop the moment it can)
      else {
        const L = Z.lanes[k + 1];
        for (let j = 0; j < L.n; j++) {
          const A = plankAt(Z, L, j, now + HOP_T), A2 = plankAt(Z, L, j, now + HOP_T + 1.2);
          if (Math.abs(A.x - xl) < L.len / 2 - 0.6 && A.sink < 0.02 && A2.sink < 0.02) go = true;
        }
      }
      if (go) { st.cool = now + HOP_T + 0.25; return [...hold, false, true]; }   // tap
      return [...hold, false];
    }
    if (st.k === 'water') {
      const p = st.p, CELL = 2.2, X = (c) => p.x0 + (c + 0.5) * CELL, Z = (r) => p.z0 - (r + 0.5) * CELL;
      const now = H.plaza().find((q) => Math.abs(q.x0 - p.x0) < 0.01 && Math.abs(q.z0 - p.z0) < 0.01), Wt = now && now.water;
      const top = p.z0 - p.d, c = Math.floor((s.ball[0] - p.x0) / CELL), r = Math.floor((p.z0 - s.ball[2]) / CELL), inside = c >= 0 && c < p.cols && r >= 0 && r < p.rows;
      if (!Wt) return [0, 0, false];
      if (Wt.state === 'across' && s.ball[2] < top - 3) { const [ix, iz] = steer(s, X(p.exit), top - 9.5, 3); return [ix, iz, s.ball[2] < top - 8.6]; }   // off the boat, onto the far road
      if (Wt.state === 'sailing' || (Wt.state === 'across' && s.ball[2] < top)) { const [ix, iz] = steer(s, X(p.exit), s.ball[2], 1); return [ix, iz, false]; }   // aboard: sit still
      if (Wt.state === 'docked' && (!inside || (c === p.exit && r === p.rows - 1) || !st.plan)) { const [ix, iz] = steer(s, X(p.exit), top - 1.3, 2.2); return [ix, iz, false]; }   // onto the boat
      if (!st.careless && Wt.state !== 'docked') {       // a wrong tank poured (a slip over its valve): out to the pad by the road in, which empties it all
        const set = waterPlan(p, p.entry, 0, [], true), wrong = Wt.tanks.some((q, i) => q.open && !(set >> i & 1));
        if (wrong || st.toPad) {
          const pad = st.pad || (st.pad = H.course().pieces.filter((q) => q.t === 'reset' && q.z > p.z0 && q.z < p.z0 + 12).sort((a, b) => a.z - b.z)[0]);
          if (!st.toPad) st.toPad = { k: 0 };
          if (!wrong && !Wt.tanks.some((q) => q.open)) { st.toPad = null; st.plan = null; }   // emptied: in again
          else {
            const way = [[X(p.entry), Z(0)], [X(p.entry), p.z0 + 1.6], [pad.x, pad.z]], [tx, tz] = way[Math.min(st.toPad.k, 2)];
            const [ix, iz, d] = steer(s, tx, tz, 2.2);
            if (d < 0.35 && st.toPad.k < 2) st.toPad.k++;
            return [ix, iz, false];
          }
        }
      }
      if (st.careless) { const [ix, iz] = steer(s, X(p.exit), top - 3, 4); return [ix, iz, false]; }   // straight at the bar, no valves on purpose
      if (!inside) { const [ix, iz] = steer(s, X(p.entry), Z(0), 3); return [ix, iz, false]; }
      if (!st.plan || st.planFor !== Wt.want) { st.plan = waterPlan(p, c, r, Wt.tanks) || [[p.exit, p.rows - 1]]; st.i = 0; st.planFor = Wt.want; }
      const [pc, pr] = st.plan[Math.min(st.i, st.plan.length - 1)];
      const [ix, iz, d] = steer(s, X(pc), Z(pr), 2.0);
      if (d < 0.25 && st.i < st.plan.length - 1) st.i++;
      return [ix, iz, false];
    }
    if (st.k === 'tune') {
      const p = st.p, CELL = 2.2, X = (c) => p.x0 + (c + 0.5) * CELL, Z = (r) => p.z0 - (r + 0.5) * CELL;
      const now = H.plaza().find((q) => Math.abs(q.x0 - p.x0) < 0.01 && Math.abs(q.z0 - p.z0) < 0.01), T = now && now.tune;
      const c = Math.floor((s.ball[0] - p.x0) / CELL), r = Math.floor((p.z0 - s.ball[2]) / CELL), inside = c >= 0 && c < p.cols && r >= 0 && r < p.rows;
      if (T && T.done) {                                // played: out through the gap at the top, onto the ledge
        const [ix, iz, d] = steer(s, X(p.exit), p.z0 - p.d - 0.6, 3.5);
        return [ix, iz, s.ball[2] < p.z0 - p.d - 0.3];
      }
      if (st.careless && T && !T.done && (inside || s.ball[2] < p.z0)) { const [ix, iz] = steer(s, X(p.exit), p.z0 - p.d - 14, 8, true); return [ix, iz, false]; }
      if (!inside || !T || !T.heard || T.playing) {     // in, to the middle of the first row, and listen
        const [ix, iz] = steer(s, X(p.entry), Z(0), 2.5);
        return [ix, iz, false];
      }
      if (st.careless) { const [ix, iz] = steer(s, X(p.exit), p.z0 - p.d - 14, 8, true); return [ix, iz, false]; }   // straight over at full speed, not listening: at the gap as if to jump it
      const want = T.seq[T.at], cells = [];
      for (let rr = 0; rr < p.rows; rr++) for (let cc = 0; cc < p.cols; cc++) if (p.legend[p.map[2 * (p.rows - 1 - rr) + 1][2 * cc + 1]] && p.legend[p.map[2 * (p.rows - 1 - rr) + 1][2 * cc + 1]].tone === want) cells.push([cc, rr]);
      const [tc, tr] = cells[0];
      const key = T.at + ':' + tc + ',' + tr;
      if (st.for !== key) { st.for = key; st.path = tunePath(p, c, r, tc, tr) || [[tc, tr]]; st.i = 0; }
      const [pc, pr] = st.path[Math.min(st.i, st.path.length - 1)];
      const [ix, iz, d] = steer(s, X(pc), Z(pr), 2.6);
      if (d < 0.3 && st.i < st.path.length - 1) st.i++;
      return [ix, iz, false];
    }
    if (st.k === 'ice') {
      const p = st.p, I = s.ice;
      if (!I || Math.abs(I.x0 - p.x0) > 0.01 || Math.abs(I.z0 - p.z0) > 0.01) {
        if (st.entered && s.ball[2] < p.z0 - p.d - 0.3) return [0, 0, true];      // out of the far gap
        const [ix, iz] = steer(s, p.x0 + (p.entry + 0.5) * 2.2, p.z0 - 1, 3);    // onto the ice through the near gap
        return [ix, iz, false];
      }
      st.entered = true;
      if (I.moving) { st.rest = 0; return [0, 0, false]; }
      if (!st.rest) { st.rest = 1; return [0, 0, false]; }                       // let go first: the next push counts
      let d;
      if (st.careless) d = st.careless === 'north' ? 'N' : 'NEWS'[Math.floor(Math.random() * 4)];
      else if (st.twin) {                               // from where both stand: the next push of the shortest way
        const Tw = (H.plaza().find((q) => Math.abs(q.x0 - p.x0) < 0.01 && Math.abs(q.z0 - p.z0) < 0.01) || {}).twin;
        if (!Tw || Tw.moving) { st.rest = 0; return [0, 0, false]; }
        const plan = Tw.done ? ['N'] : twinPlan(p, I.c, I.r, Tw.c, Tw.r, Tw.pad);
        if (!plan) return [0, 0, false];
        d = plan[0];
      }
      else if (st.cover) {                              // the push from the tile it is on (a push that did not take is made again)
        if (!st.plan) st.plan = coverPlan(p);
        if (!st.plan) return [0, 0, false];
        const k = st.plan.cells.indexOf(I.c + ',' + I.r);
        if (k < 0) return [0, 0, false];
        d = st.plan.dirs[k];
      } else { const plan = icePlan(p, I.c, I.r); if (!plan) return [0, 0, false]; d = plan[0]; }
      st.rest = 0;
      return [...ICE_STICK[d], false];
    }
    if (st.k === 'plaza') {
      if (!st.plan) { st.plan = plazaPlan(st.p); st.i = 0; if (!st.plan) return [0, 0, false]; }
      const pts = st.plan.pts, [tx, tz] = pts[st.i];
      const [ix, iz, d] = steer(s, tx, tz, st.v);
      if (d < 0.32 && st.i < pts.length - 1) st.i++;
      return [ix, iz, st.i === pts.length - 1 && d < 0.6];
    }
    if (st.k === 'scan') {
      const P = st.p, now = H.simT();
      if (!st.arrived) {                                // to the middle of the threshold first
        const [ix, iz, d] = steer(s, P.x, st.z, 2.5);
        if (d < 0.45 && Math.hypot(s.v[0], s.v[2]) < 1) st.arrived = true;
        return [ix, iz, false];
      }
      if (st.plan && now > st.plan.ts + 3) { st.plan = null; st.arrived = false; return [0, 0, false]; }   // a zap, and back at the ring: plan afresh
      if (!st.plan) st.plan = scanPlan(P, now);
      const pl = st.plan;
      if (now < pl.ts) { const [ix, iz] = steer(s, pl.lane, st.z, 2); return [ix, iz, false]; }
      const [ix, iz] = steer(s, pl.lane, P.z - P.d / 2 - 6, pl.v, true);   // at speed right through: easing off near the far edge let a bar catch it there
      return [ix, iz, s.ball[2] < P.z - P.d / 2 - 0.6];
    }
    if (st.k === 'orbit') {                             // round the ring's middle, just ahead of where the marble is
      const phi = Math.atan2(s.ball[2] - st.cz, s.ball[0] - st.cx);
      if (st.last === undefined) { st.last = phi; st.acc = Math.PI / 2 + ((phi - Math.PI / 2 + 3 * Math.PI) % (2 * Math.PI) - Math.PI); }
      let dp = phi - st.last; if (dp > Math.PI) dp -= 2 * Math.PI; if (dp < -Math.PI) dp += 2 * Math.PI;
      st.acc += dp; st.last = phi;
      const a = phi + 0.6, [ix, iz] = steer(s, st.cx + st.rm * Math.cos(a), st.cz + st.rm * Math.sin(a), 2.4);
      return [ix, iz, st.acc >= st.to];
    }
    if (st.k === 'hold') { const [ix, iz] = steer(s, st.x, st.z, 2); return [ix, iz, st.until(t, s, F, HO, CR)]; }
    if (st.k === 'push') return [st.dx, st.dz, st.until(t, s, F, HO, CR)];
    if (st.k === 'wait') return [0, 0, st.until(t, s, F, HO, CR)];
    if (st.k === 'ride') { const f = F[st.fi]; const [ix, iz] = steer(s, f[0], f[2] + (st.dz || 0), st.v || 3); return [ix, iz, st.until(t, s, F, HO, CR)]; }
    const [ix, iz, d] = steer(s, st.x, st.z, st.v, st.pass);
    return [ix, iz, d < st.r];
  }
  // opts.careless: never wait at a moving pad or a bridge (a null test: it
  // should fall). opts.stop(step, state): leave the game running at that moment.
  function fast(n, limit = 420, opts = {}) {
    LEAN.on = !opts.ignorePush; LEAN.delay = opts.lean || 0; LEAN.hist = []; LEAN.noCarry = !!opts.noCarry;
    H.hold(true); H.reach(n);
    const C = H.course(), steps = route(C, opts), t0 = H.simT(), log = [];
    let i = 0, falls = 0, maxStep = 0, inPocket = false;
    for (let tick = 0; tick < limit * 60; tick++) {
      const s = H.state();
      if (s.pocket !== inPocket) { inPocket = s.pocket; i = crossWorlds(steps, i, inPocket); }
      if (s.phase === 'goal' || s.phase === 'win') { H.hold(false); return { n, won: true, t: +(H.simT() - t0).toFixed(1), clock: s.clock, falls: s.falls, log }; }
      if (s.falls !== falls) {
        falls = s.falls;
        const st = steps[Math.min(i, steps.length - 1)];
        log.push({ fall: falls, step: i, why: st.why, ball: s.ball.map((v) => +v.toFixed(2)), t: +(H.simT() - t0).toFixed(1) });
        i = resumeAt(C, s, steps); steps[i].last = undefined; steps[i].plan = undefined; steps[i].arrived = false; steps[i].ctl = undefined;
      }
      if (s.phase !== 'play') { H.drive(0, 0, 1); continue; }
      const st = steps[Math.min(i, steps.length - 1)];
      if (opts.stop && opts.stop(st, s, i)) { H.hold(false); return { n, stopped: true, step: i, why: st.why, ball: s.ball }; }
      let [ix, iz, done, tap] = decide(st, s, H.ferries(), H.holos(), H.simT(), H.crossings());
      if (tap) H.tap();
      if (opts.ignorePush && (st.why === 'mag' || st.why === 'wind')) ix = 0;   // straight on, as if nothing pushed
      if (opts.careless && st.k !== 'go') {             // straight on, as if nothing moved or blinked
        const next = steps.slice(i).find((q) => q.k === 'go');
        [ix, iz] = steer(s, s.ball[0], (next ? next.z : s.ball[2] - 5), 4.5);
        done = st.k === 'hold' ? true : Math.abs(s.ball[2] - st.z) > 2;
      }
      if (done && i < steps.length - 1) { i++; steps[i].last = undefined; steps[i].plan = undefined; steps[i].arrived = false; steps[i].ctl = undefined; }
      maxStep = Math.max(maxStep, i);
      H.drive(ix, iz, 1);
    }
    const s = H.state();
    H.hold(false);
    return { n, won: false, step: i, maxStep, of: steps.length, why: steps[i] && steps[i].why, ball: s.ball, falls: s.falls, log };
  }
  // The proof: real pointer events, real time.
  const hud = document.getElementById('game'), JR = 52;
  let down = false, ox = 0, oy = 0;
  const client = (lx, ly) => { const r = hud.getBoundingClientRect(), s = H.state(); return [r.left + lx * r.width / s.LW, r.top + ly * r.height / s.LH]; };
  const ptr = (type, lx, ly) => { const [cx, cy] = client(lx, ly); hud.dispatchEvent(new PointerEvent(type, { pointerId: 9, clientX: cx, clientY: cy, bubbles: true, isPrimary: true, pointerType: 'touch' })); };
  function stick(ix, iz) {
    const s = H.state();
    if (!down) { ox = s.LW * 0.5; oy = s.LH * 0.72; ptr('pointerdown', ox, oy); down = true; }
    const m = Math.hypot(ix, iz), mm = Math.min(1, m);
    const d = mm > 0.02 ? (0.1 + mm * 0.9) * JR * 0.999 : 0;
    ptr('pointermove', ox + (m ? ix / m : 0) * d, oy + (m ? iz / m : 0) * d);
  }
  function release() { if (down) { ptr('pointerup', ox, oy); down = false; } }
  function live(n, limit = 420, lean = 0.25, opts = {}) {
    LEAN.on = true; LEAN.delay = lean; LEAN.hist = []; LEAN.noCarry = false;
    H.hold(false); H.reach(n);
    const C = H.course(), steps = route(C, opts), log = [];
    let i0 = 0;
    if (opts.from) {                                    // for a clip: start here, part way along
      H.place(opts.from[0], opts.from[1], opts.from[2]); H.quiet();
      i0 = Math.max(0, steps.findIndex((st) => !st.pocket && st.z < opts.from[2] - 0.05));
    }
    return new Promise((resolve) => {
      let i = i0, falls = 0, inPocket = false; const t0 = performance.now(), s0 = H.simT();
      const timer = setInterval(() => {
        const s = H.state(), t = (performance.now() - t0) / 1000;
        if (s.pocket !== inPocket) { inPocket = s.pocket; i = crossWorlds(steps, i, inPocket); }
        if (s.falls !== falls) {
          falls = s.falls;
          log.push({ fall: falls, step: i, why: steps[Math.min(i, steps.length - 1)].why, ball: s.ball.map((v) => +v.toFixed(2)) });
          i = resumeAt(C, s, steps); steps[i].last = undefined; steps[i].plan = undefined; steps[i].arrived = false; steps[i].ctl = undefined;
        }
        if (s.phase === 'goal' || s.phase === 'win') { release(); clearInterval(timer); resolve({ n, won: true, real: +t.toFixed(1), sim: +(H.simT() - s0).toFixed(1), clock: s.clock, falls: s.falls, fps: +(1000 / s.frameMs).toFixed(0), log }); return; }
        if (t > limit) { release(); clearInterval(timer); resolve({ n, won: false, step: i, of: steps.length, why: steps[i] && steps[i].why, ball: s.ball, falls: s.falls, log }); return; }
        if (s.phase !== 'play') { stick(0, 0); return; }
        const st = steps[Math.min(i, steps.length - 1)];
        const [ix, iz, done, tap] = decide(st, s, H.ferries(), H.holos(), H.simT(), H.crossings());
        if (done && i < steps.length - 1) { i++; steps[i].last = undefined; steps[i].plan = undefined; steps[i].arrived = false; steps[i].ctl = undefined; }
        if (tap) { release(); const [cx, cy] = [H.state().LW * 0.5, H.state().LH * 0.72]; ptr('pointerdown', cx, cy); ptr('pointerup', cx, cy); return; }   // a real tap
        stick(ix, iz);
      }, 16);
    });
  }
  return { route, fast, live, coverPlan };
})();
'pilot ready';
