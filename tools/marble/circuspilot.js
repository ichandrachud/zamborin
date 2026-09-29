// A pilot for the circus obstacles' try-out courses, in fast mode (the game's own update, a step at a time).
//   __cp.run(kind, { careless, seed }) -> { kind, won, clock, falls, log }
// careful: through each ring of fire at its middle as it arrives; across the juggler's row at a spot whose ball has just
// gone up; at the knife wheel, wait so a hole is at the bottom as the marble reaches it; into the cannon so it fires
// with its aim on the net; past the ball thrower, changing pace after each throw so its ball lands clear.
// careless: straight down the middle at a steady pace, and into the cannon whenever it gets there.
window.__cp = (() => {
  const H = window.__marble, R = 0.42;
  const steer = (s, tx, tz, v) => {
    const dx = tx - s.ball[0], dz = tz - s.ball[2], d = Math.hypot(dx, dz) || 1e-6, sp = Math.min(v, d * 2.2);
    let ix = (dx / d * sp - s.v[0]) * 0.7, iz = (dz / d * sp - s.v[2]) * 0.7; const m = Math.hypot(ix, iz);
    if (m > 1) { ix /= m; iz /= m; }
    return [ix, iz, d];
  };
  const TAU = Math.PI * 2;
  function plan(opts, r, range) {
    const C = H.course(), S = H.circ(), steps = [];
    let obs = [...S.rings.map((q, i) => ({ k: 'ring', i, ...q })), ...S.juggles.map((q, i) => ({ k: 'jug', i, ...q })), ...S.wheels.map((q, i) => ({ k: 'wheel', i, ...q })),
                 ...S.cannons.map((q, i) => ({ k: 'cannon', i, ...q })), ...S.throwers.map((q, i) => ({ k: 'thrower', i, ...q, z: q.z + q.L / 2 })),
                 ...S.swings.map((q) => ({ k: 'swing', ...q, x: q.px, z: q.z + q.gap / 2 })), ...S.wires.map((q) => ({ k: 'wire', ...q, z: q.z + q.len / 2 })),
                 ...S.teeters.map((q) => ({ k: 'teeter', ...q, x: q.px, z: q.z + 4 })), ...S.wods.map((q) => ({ k: 'wod', ...q, x: q.px, z: q.z + 1.2 })),
                 ...S.ferrises.map((q) => ({ k: 'ferris', ...q, x: q.px, z: q.z + q.g })),
                 ...S.chases.map((q) => ({ k: 'chase', ...q, x: q.px })), ...S.mirrors.map((q) => ({ k: 'mirror', ...q })), ...S.coasters.map((q) => ({ k: 'coaster', ...q, x: q.px }))].sort((a, b) => b.z - a.z);
    if (range) obs = obs.filter((o) => o.z <= range[0] + 3.5 && o.z >= range[1] - 0.5);   // (a level: just the obstacles of one stretch)
    for (const o of obs) {
      if (opts.careless) steps.push({ go: [o.x ?? o.px, o.z + (o.k === 'thrower' ? 1.5 : 3.2)], v: 3, r: 0.3, stop: true }, { pause: r() * 3.5 });   // careless: arrives at any moment
      if (o.k === 'ring') steps.push({ ring: o, careless: opts.careless });
      else if (o.k === 'jug') steps.push({ go: [o.px, o.z + 2.4], v: 3, r: 0.3, stop: !opts.careless, xo: !!opts.careless }, { jug: o, careless: opts.careless });
      else if (o.k === 'wheel') steps.push({ go: [o.x, o.z + 2.2], v: 3, r: 0.25, stop: !opts.careless }, { wheel: o, careless: opts.careless });
      else if (o.k === 'cannon') steps.push({ go: [o.x, o.z + 2.6], v: 3, r: 0.25, stop: !opts.careless }, { cannon: o, careless: opts.careless }, { flown: true });
      else if (o.k === 'thrower') steps.push({ throw: o, careless: opts.careless });
      else if (o.k === 'swing') steps.push({ go: [o.px, o.z + 1.0], v: 3, r: 0.25, stop: !opts.careless }, { swing: o, careless: opts.careless });
      else if (o.k === 'wire') steps.push({ go: [o.px, o.z + 1.2], v: 2.5, r: 0.25, stop: !opts.careless }, { wire: o, careless: opts.careless });
      else if (o.k === 'teeter') steps.push({ go: [o.px, o.nearZ + 1.6], v: 2.5, r: 0.3, stop: !opts.careless }, { teeter: o, careless: opts.careless });   // (to a stop before the plank first: a level's run-up can be short)
      else if (o.k === 'wod') steps.push({ go: [o.px, o.z + 0.4], v: 2.5, r: 0.2, stop: !opts.careless }, { wod: o, careless: opts.careless });
      else if (o.k === 'chase') steps.push({ chase: o, careless: opts.careless });
      else if (o.k === 'mirror') {                             // through each partition's gap, clear of the trapdoor in front of it
        const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2;
        if (opts.careless) steps.push({ go: [o.x, o.z - o.d - 1], v: 3, r: 0.4, stuck: 12 });
        else for (let k = 0; k < o.parts; k++) { const zc = o.z - 4.2 * (k + 0.75), side = k % 2 ? 1 : -1, gx = side < 0 ? x1 - 0.62 : x0 + 0.62;
          steps.push({ go: [gx, zc + 0.9], v: 2.2, r: 0.3 }, { go: [gx, zc - 0.9], v: 2.2, r: 0.3 }); }
        steps.push({ go: [o.x, o.z - o.d - 0.5], v: 2.5, r: 0.4 });
      }
      else if (o.k === 'coaster') steps.push({ go: [o.px, o.z + 1.2], v: 2.5, r: 0.25, stop: !opts.careless }, { coaster: o, careless: opts.careless });
      else if (o.k === 'ferris') steps.push({ go: [o.px, o.z + o.e + 0.3], v: 2.5, r: 0.2, stop: !opts.careless }, { ferris: o, careless: opts.careless });
    }
    if (!range) steps.push({ go: [C.goal[0], C.goal[2]], v: 5, r: 0.3 });
    let zNow = 99;
    for (const st of steps) { const o = st.ring || st.jug || st.wheel || st.cannon || st.throw || st.swing || st.wire || st.teeter || st.wod || st.ferris || st.chase || st.coaster; st.z = st.go ? st.go[1] : o ? o.z + 2.6 : zNow; zNow = st.z; }
    return steps;
  }
  function pilot(kind, opts) {
    const rnd = ((seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647))(opts.seed || 7);
    H.reach(kind); H.quiet();
    return exec(plan(opts, rnd), kind, opts);
  }
  function exec(steps, kind, opts) {
    const log = [];
    let i = 0, falls = 0, waited = 0;
    const fn = (dt) => {
      const s = H.state();
      if (opts.seg && i >= steps.length) return { ix: 0, iz: 0, segDone: true };
      if (s.phase === 'goal' || s.phase === 'win') return { done: { kind, won: true, clock: s.clock, falls: s.falls, log } };
      if (s.falls !== falls) {
        falls = s.falls; log.push({ fall: falls, step: i, at: s.ball.map((v) => +v.toFixed(2)) });
        let j = 0; while (j < steps.length - 1 && steps[j].z > s.spawn[2] - 0.3) j++;
        i = j; waited = 0;
      }
      if (s.phase !== 'play') return { ix: 0, iz: 0 };
      const st = steps[Math.min(i, steps.length - 1)], S = H.circ(), sp = Math.hypot(s.v[0], s.v[2]);
      if (st.pause !== undefined) { waited += dt; if (waited > st.pause) { i++; waited = 0; } const [ix, iz] = steer(s, s.ball[0], s.ball[2], 0); return { ix, iz }; }
      if (st.flown) { if (!S.held && s.ball[2] < st.z - 4 && s.grounded) i++; return { ix: 0, iz: 0 }; }
      if (st.ring) {                                     // through the ring's middle: steer for where it will be as we reach it
        const F = S.rings.find((q) => Math.abs(q.z - st.ring.z) < 0.01);
        if (s.ball[2] < F.z - 1.2) { i++; return { ix: 0, iz: 0 }; }
        const v = 3.6, tArr = Math.max(0, (s.ball[2] - F.z) / Math.max(1, sp));
        let x = F.cx;
        if (!st.careless && F.slide) { const tt = H.simT() + tArr; x = F.cx + F.slide * Math.sin(TAU * tt / F.period + F.phase); }
        if (st.careless) x = F.cx;
        const [ix, iz] = steer(s, x, F.z - 2, v); return { ix, iz };
      }
      if (st.jug) {                                      // to a spot, stop before it; go the moment its ball has gone back up with the next far off
        const J = S.juggles.find((q) => Math.abs(q.z - st.jug.z) < 0.01);
        if (s.ball[2] < J.z - 1.3) { i++; return { ix: 0, iz: 0 }; }
        if (st.careless) { const [ix, iz] = steer(s, s.ball[0], J.z - 2, 4); return { ix, iz }; }
        const m = 2 * J.n - 2, dtS = J.period / m, t = H.simT(), order = Array.from({ length: m }, (_, k) => (k < J.n ? k : 2 * J.n - 2 - k));
        const times = (si) => { const out = []; const k0 = Math.floor((t - J.phase) / dtS); for (let k = k0 - 2 * m; k < k0 + 2 * m; k++) if (order[((k % m) + m) % m] === si) out.push(J.phase + k * dtS - t); return out; };
        if (st.si === undefined) {                         // the spot with the longest quiet between its balls, nearest the middle to break ties
          const gaps = J.spots.map((x, si) => { const T = times(si).filter((q) => q > 0).sort((a, b) => a - b); return { si, x, gap: T.length > 1 ? T[1] - T[0] : 9 }; });
          const best = gaps.sort((a, b) => b.gap - a.gap || Math.abs(a.x - st.jug.px) - Math.abs(b.x - st.jug.px))[0]; st.si = best.si; st.x = best.x;
        }
        if (!st.going) {
          const d = Math.hypot(s.ball[0] - st.x, s.ball[2] - (J.z + 2.2));
          if (d > 0.25 || sp > 0.4) { const onRow = s.ball[2] < J.z + 2.7; const [ix, iz] = steer(s, onRow ? st.x : st.jug.px, J.z + 2.2, 2.5); return { ix, iz }; }   // onto the row's own wide rail, then across to the spot
          const T = times(st.si), last = Math.max(...T.filter((q) => q <= 0)), next = Math.min(...T.filter((q) => q > 0));
          if (last > -0.3 && next > 0.9) st.going = true;
          const [ix, iz] = steer(s, st.x, J.z + 2.2, 0); return { ix, iz };
        }
        const [ix, iz] = steer(s, st.x, J.z - 2, 5); return { ix, iz };
      }
      if (st.wheel) {                                    // go when a hole will be at the bottom as the marble reaches the wheel
        const W = S.wheels.find((q) => Math.abs(q.z - st.wheel.z) < 0.01);
        if (s.ball[2] < W.z - 1) { i++; return { ix: 0, iz: 0 }; }
        if (st.careless || st.going) { st.going = true; const [ix, iz] = steer(s, W.x, W.z - 2, 4.5); return { ix, iz }; }
        const tArr = 0.72;                                // from standing 2.2 m out to the wheel's face, pushing hard (measured)
        const angAt = W.ang + W.spin * tArr, holeNear = Math.min(...Array.from({ length: W.holes }, (_, h) => { let d = ((h * TAU / W.holes + angAt + Math.PI / 2) % TAU + TAU) % TAU; if (d > Math.PI) d -= TAU; return Math.abs(d); }));
        if (holeNear < 0.06) st.going = true;
        const [ix, iz] = steer(s, W.x, W.z + 2.2, 0); return { ix, iz };
      }
      if (st.cannon) {                                   // in so that it fires with the aim on the net's middle
        const K = S.cannons.find((q) => Math.abs(q.z - st.cannon.z) < 0.01);
        if (S.held || s.ball[2] < K.z - 1) { i++; return { ix: 0, iz: 0 }; }
        if (st.careless || st.going) { st.going = true; const [ix, iz] = steer(s, K.x, K.z - 1, 4); return { ix, iz }; }
        const tFire = 0.62 + 0.22, yawAt = K.swing * Math.sin(TAU * (H.simT() + tFire) / K.period + K.phase), yawRate = K.swing * TAU / K.period * Math.cos(TAU * (H.simT() + tFire) / K.period + K.phase);
        if (Math.abs(yawAt) < 0.05 && Math.abs(yawRate) > 0) st.going = true;
        const [ix, iz] = steer(s, K.x, K.z + 2.6, 0); return { ix, iz };
      }
      if (st.swing) {                                    // on when the seat has just come to the near edge, off when it is at the far one
        const T = S.swings.find((q) => Math.abs(q.z + q.gap / 2 - st.swing.z) < 0.01), near = T.z + T.gap / 2, far = T.z - T.gap / 2;
        if (s.ball[2] < far - 1.2 && s.grounded) { i++; return { ix: 0, iz: 0 }; }
        const u = (((H.simT() + T.phase) % T.period) + T.period) % T.period;
        if (st.careless) { const [ix, iz] = steer(s, st.swing.px, far - 3, 3.5); return { ix, iz }; }
        if (!st.on) {
          if (u < 0.35 && Math.abs(T.a - T.amax) < 0.02) st.on = true;
          if (!st.on) { const [ix, iz] = steer(s, st.swing.px, near + 1.0, 0); return { ix, iz }; }
        }
        if (!st.off) {                                    // ride: stay in the seat's middle until it holds at the far edge
          if (Math.abs(T.a + T.amax) < 0.02 && s.ball[2] < T.z) st.off = true;
          const [ix, iz] = steer(s, st.swing.px, T.seat[2], 2.5); return { ix, iz };
        }
        const [ix, iz] = steer(s, st.swing.px, far - 2.5, 3); return { ix, iz };
      }
      if (st.wire) {                                     // along the wire's middle, where it will be a moment on
        const W = S.wires.find((q) => Math.abs(q.z + q.len / 2 - st.wire.z) < 0.01), end = W.z - W.len / 2 - 1.2;
        if (s.ball[2] < end) { i++; return { ix: 0, iz: 0 }; }
        const lead = 0.25, x = W.px + (st.careless ? 0 : (W.sway ? W.sway * Math.sin(2 * Math.PI * (H.simT() + lead) / W.period) : 0));
        const [ix, iz] = steer(s, x, s.ball[2] - 1.5, st.careless ? 3.5 : 2.2); return { ix, iz };
      }
      if (st.teeter) {                                   // onto the yellow spot, stop, and wait to be thrown up to the rail above
        const T = S.teeters.find((q) => Math.abs(q.z + 4 - st.teeter.z) < 0.01);
        if (s.ball[1] > T.y + T.up - 0.2 && s.grounded) { i++; return { ix: 0, iz: 0 }; }
        if (!s.grounded) return { ix: 0, iz: 0 };
        if (st.careless) { const [ix, iz] = steer(s, st.teeter.px, T.farZ - 3, 4); return { ix, iz }; }
        if (!st.on) {                                     // wait at the rail's end while the plank is over or coming back, or he is about to land
          if (Math.hypot(s.ball[2] - (T.nearZ + 0.7), s.ball[0] - T.px) < 0.3 && sp < 0.4 && Math.abs(T.a - T.tilt) < 0.005 && T.toLand > 1.5 && T.toLand < T.period - 1.8) st.on = true;   // (down a while: not the very frame he lands)   // only once waiting at the rail's end
          if (!st.on) { const [ix, iz] = steer(s, st.teeter.px, T.nearZ + 0.7, 2); return { ix, iz }; }
        }
        const [ix, iz] = steer(s, st.teeter.px, T.nearZ - 0.75, 3); return { ix, iz };
      }
      if (st.wod) {                                      // wait at the rail's end for a cage to come to the bottom, then in
        const Wd = S.wods.find((q) => Math.abs(q.z + 1.2 - st.wod.z) < 0.01);
        if (S.held) { st.inside = true; return { ix: 0, iz: 0 }; }
        if (st.inside) { i++; return { ix: 0, iz: 0 }; }
        if (st.careless || st.going) { st.going = true; const [ix, iz] = steer(s, st.wod.px, Wd.z - 0.2, 2.6); return { ix, iz }; }
        const tArr = 0.55, a = ((Wd.ang + Wd.spin * tArr) % Math.PI + Math.PI) % Math.PI;   // a cage is at the bottom when the angle is a whole number of turns of pi
        if (a < 0.08 || a > Math.PI - 0.02) st.going = true;
        const [ix, iz] = steer(s, st.wod.px, Wd.z + 1.6, 0); return { ix, iz };
      }
      if (st.ferris) {                                   // from the rail's very end onto a car just past it, still level; off as one comes level beyond
        const Fw = S.ferrises.find((q) => Math.abs(q.z + q.g - st.ferris.z) < 0.01), nearEnd = Fw.z + Fw.g + Fw.e, far = Fw.z - Fw.g - Fw.e;
        if (s.ball[2] < far - 1.2 && s.grounded && s.ball[1] > Fw.y) { i++; return { ix: 0, iz: 0 }; }
        if (st.careless && !st.on) { const [ix, iz] = steer(s, st.ferris.px, far - 3, 3); if (s.ball[2] < nearEnd - 0.3) st.on = true; return { ix, iz }; }
        const floorY = (c) => c[1] + 0.1;
        if (!st.on) {
          const car = (k, t) => { const a = -Fw.spin * t + Fw.phase + k * 2 * Math.PI / Fw.n; return [Fw.z + Fw.Rf * Math.cos(a), Fw.yc + Fw.Rf * Math.sin(a) - Fw.hang]; };
          const T = H.simT() + 0.3;                         // where each car will be as we get there
          for (let k = 0; k < Fw.n; k++) { const [cz, fy] = car(k, T); if (cz > nearEnd - 1.25 && cz < nearEnd - 0.75 && fy > Fw.y - 0.3 && fy < Fw.y + 0.02 && cz < Fw.z + Fw.g + 1) st.on = true; }
          if (!st.on) { const [ix, iz] = steer(s, st.ferris.px, nearEnd + 0.3, 0); return { ix, iz }; }
          st.onT = 0;
        }
        if (st.onT !== undefined && st.onT < 0.45 && s.ball[2] > nearEnd - 1.6) { st.onT += dt; const [ix, iz] = steer(s, st.ferris.px, s.ball[2] - 3, 3); return { ix, iz }; }   // across the join
        const mine = Fw.cars.slice().sort((a, b) => Math.hypot(a[2] - s.ball[2], a[1] - s.ball[1]) - Math.hypot(b[2] - s.ball[2], b[1] - s.ball[1]))[0];
        if (!st.off && mine[2] < Fw.z && Math.abs(mine[2] - (far + Fw.e)) < 0.35 && floorY(mine) > Fw.y - 0.06) st.off = true;
        if (!st.off) {                                    // sit still in the car (it carries us); nudge toward its middle, relative to it
          const want = Math.max(-1.2, Math.min(1.2, (mine[2] - s.ball[2]) * 1.5));
          let ix = (Fw.px - s.ball[0]) * 0.8 - s.v[0] * 0.7, iz = (want - s.v[2]) * 0.7; const m = Math.hypot(ix, iz); if (m > 1) { ix /= m; iz /= m; }
          return { ix, iz };
        }
        const [ix, iz] = steer(s, st.ferris.px, far - 2.5, 4.5); return { ix, iz };
      }
      if (st.chase) {                                    // flat out down the middle, round the pins on the side away from each
        const Ch = S.chases.find((q) => Math.abs(q.z - st.chase.z) < 0.01), end = Ch.z - Ch.d - 1.5;
        if (s.ball[2] < end) { i++; return { ix: 0, iz: 0 }; }
        if (st.careless) { const [ix, iz] = steer(s, st.chase.px, end - 2, 3.6); return { ix, iz }; }
        let tx = Ch.px; if (Ch.pins) for (let k = 0; k < Ch.pins; k++) { const pz = Ch.z - Ch.d * (k + 1) / (Ch.pins + 1), off = k % 2 ? 0.75 : -0.75; if (pz < s.ball[2] + 0.5 && pz > s.ball[2] - 3.5) { tx = Ch.px - off; break; } }
        const [ix, iz] = steer(s, tx, s.ball[2] - 4, 8); return { ix, iz };
      }
      if (st.coaster) {                                  // wait at the station for a car with time left, roll in, ride
        const Co = S.coasters.find((q) => Math.abs(q.z - st.coaster.z) < 0.01);
        if (S.held) { st.inside = true; return { ix: 0, iz: 0 }; }
        if (st.inside) { i++; return { ix: 0, iz: 0 }; }
        if (st.careless || st.going) { st.going = true; const [ix, iz] = steer(s, st.coaster.px, Co.z - 1, 2.5); return { ix, iz }; }
        if (Co.wait && Co.left > 1.2) st.going = true;
        const [ix, iz] = steer(s, st.coaster.px, Co.z + 1.2, 0); return { ix, iz };
      }
      if (st.throw) {                                    // on through, but out of the way of each ball once it is thrown
        const T = S.throwers.find((q) => Math.abs(q.z + q.L / 2 - st.throw.z) < 0.01), end = T.z - T.L / 2 - 0.8;
        if (s.ball[2] < end) { i++; return { ix: 0, iz: 0 }; }
        let v = 3.4, tx = T.px, tz = s.ball[2] - 3;
        if (!st.careless) {
          const live = T.balls.filter((b) => b[2] < T.flight - 0.05);
          for (const b of live) {                        // where will the marble be when it lands, at this pace? if near, change pace
            const left = T.flight - b[2], here = s.ball[2] - v * left;
            if (Math.abs(here - b[1]) < 1.7) { const ahead = b[1] < s.ball[2] - 0.2; v = ahead ? 0 : 6; tz = ahead ? s.ball[2] + 1 : s.ball[2] - 3; }
          }
          tx = T.px + (live.length ? (live[0][0] > T.px ? -0.8 : 0.8) : 0);
        }
        const [ix, iz] = steer(s, tx, tz, v); return { ix, iz };
      }
      if (st.stuck) { st.tt = (st.tt || 0) + dt; if (st.tt > st.stuck) return { done: { kind, won: false, stuck: true, falls: s.falls, log } }; }
      const [ix, iz, d] = steer(s, st.xo ? s.ball[0] : st.go[0], st.go[1], st.v);
      if (d < st.r && (!st.stop || sp < 0.4)) i++;
      return { ix, iz };
    };
    fn.log = log; fn.steps = steps;
    return fn;
  }
  function trace(kind, opts = {}) {                       // the last moments before the first fall
    H.hold(true);
    const p = pilot(kind, opts), out = [];
    for (let tick = 0; tick < 60 * 120; tick++) {
      const s = H.state(), C = H.circ(); const near = (C.ferrises[0] ? C.ferrises[0].cars.map((c) => [c[1], c[2]]).sort((a, b) => Math.abs(a[1] - s.ball[2]) - Math.abs(b[1] - s.ball[2]))[0] : null); out.push([tick, ...s.ball.map((v) => +v.toFixed(2)), +s.v[1].toFixed(2), +s.v[2].toFixed(2), s.grounded ? 'g' : 'a', near, C.teeters[0] ? +C.teeters[0].toLand.toFixed(2) : null]);
      if (s.falls > 0) break;
      const o = p(1 / 60); if (o.done) break; H.drive(o.ix, o.iz, 1);
    }
    H.hold(false); return out.slice(-36).filter((_, i) => i % 2 === 0);
  }
  function run(kind, opts = {}) {
    H.hold(true);
    const p = pilot(kind, opts);
    for (let tick = 0; tick < 60 * 180; tick++) { const o = p(1 / 60); if (o.done) { H.hold(false); return o.done; } H.drive(o.ix, o.iz, 1); }
    H.hold(false); const s = H.state(); return { kind, won: false, falls: s.falls, ball: s.ball.map((v) => +v.toFixed(2)), log: p.log };
  }
  function show(kind, opts = {}) {
    H.hold(true);
    const p = pilot(kind, opts);
    const tick = () => { const o = p(1 / 60); if (o.done) { H.hold(false); return; } H.drive(o.ix, o.iz, 1); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    return 'showing';
  }
  // For the level autopilot (pilot.js): one stretch of a level that circLay laid (its rails and its obstacle, tagged
  // czSeg), played the careful way; done once the marble is on the stretch's last rail, past its far end.
  function control(seg) {
    const zs = seg.filter((p) => p.t === 'flat'), top = Math.max(...zs.map((p) => p.z + p.d / 2)), bot = Math.min(...zs.map((p) => p.z - p.d / 2));   // by its rails (a chase's z is where it starts)
    const last = zs.slice().sort((a, b) => a.z - b.z)[0];
    const steps = plan({}, () => 0.5, [top, bot]);
    steps.push({ go: [last.x, bot + 0.9], v: 3.5, r: 0.6, z: bot + 0.9 });
    const fn = exec(steps, 'seg', { seg: true });
    return (s, dt) => { const o = fn(dt); return { ix: o.ix || 0, iz: o.iz || 0, done: !!o.segDone || (s.ball[2] < bot + 1.3 && s.grounded && s.ball[1] > (last.y || 0) - 0.2) }; };
  }
  return { run, show, plan, trace, control };
})();
'circus pilot ready';
