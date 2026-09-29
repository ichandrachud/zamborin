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
  function plan(opts, r) {
    const C = H.course(), S = H.circ(), steps = [];
    const obs = [...S.rings.map((q, i) => ({ k: 'ring', i, ...q })), ...S.juggles.map((q, i) => ({ k: 'jug', i, ...q })), ...S.wheels.map((q, i) => ({ k: 'wheel', i, ...q })),
                 ...S.cannons.map((q, i) => ({ k: 'cannon', i, ...q })), ...S.throwers.map((q, i) => ({ k: 'thrower', i, ...q, z: q.z + q.L / 2 }))].sort((a, b) => b.z - a.z);
    for (const o of obs) {
      if (opts.careless) steps.push({ go: [o.x || 0, o.z + (o.k === 'thrower' ? 1.5 : 3.2)], v: 3, r: 0.3, stop: true }, { pause: r() * 3.5 });   // careless: arrives at any moment
      if (o.k === 'ring') steps.push({ ring: o, careless: opts.careless });
      else if (o.k === 'jug') steps.push({ go: [0, o.z + 2.4], v: 3, r: 0.3, stop: !opts.careless, xo: !!opts.careless }, { jug: o, careless: opts.careless });
      else if (o.k === 'wheel') steps.push({ go: [o.x, o.z + 2.2], v: 3, r: 0.25, stop: !opts.careless }, { wheel: o, careless: opts.careless });
      else if (o.k === 'cannon') steps.push({ go: [o.x, o.z + 2.6], v: 3, r: 0.25, stop: !opts.careless }, { cannon: o, careless: opts.careless }, { flown: true });
      else steps.push({ throw: o, careless: opts.careless });
    }
    steps.push({ go: [C.goal[0], C.goal[2]], v: 5, r: 0.3 });
    let zNow = 99;
    for (const st of steps) { const o = st.ring || st.jug || st.wheel || st.cannon || st.throw; st.z = st.go ? st.go[1] : o ? o.z + 2.6 : zNow; zNow = st.z; }
    return steps;
  }
  function pilot(kind, opts) {
    const rnd = ((seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647))(opts.seed || 7);
    H.reach(kind); H.quiet();
    const steps = plan(opts, rnd), log = [];
    let i = 0, falls = 0, waited = 0;
    const fn = (dt) => {
      const s = H.state();
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
          const best = gaps.sort((a, b) => b.gap - a.gap || Math.abs(a.x) - Math.abs(b.x))[0]; st.si = best.si; st.x = best.x;
        }
        if (!st.going) {
          const d = Math.hypot(s.ball[0] - st.x, s.ball[2] - (J.z + 2.2));
          if (d > 0.25 || sp > 0.4) { const onRow = s.ball[2] < J.z + 2.7; const [ix, iz] = steer(s, onRow ? st.x : 0, J.z + 2.2, 2.5); return { ix, iz }; }   // onto the row's own wide rail, then across to the spot
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
      if (st.throw) {                                    // on through, but out of the way of each ball once it is thrown
        const T = S.throwers.find((q) => Math.abs(q.z + q.L / 2 - st.throw.z) < 0.01), end = T.z - T.L / 2 - 0.8;
        if (s.ball[2] < end) { i++; return { ix: 0, iz: 0 }; }
        let v = 3.4, tx = 0, tz = s.ball[2] - 3;
        if (!st.careless) {
          const live = T.balls.filter((b) => b[2] < T.flight - 0.05);
          for (const b of live) {                        // where will the marble be when it lands, at this pace? if near, change pace
            const left = T.flight - b[2], here = s.ball[2] - v * left;
            if (Math.abs(here - b[1]) < 1.7) { const ahead = b[1] < s.ball[2] - 0.2; v = ahead ? 0 : 6; tz = ahead ? s.ball[2] + 1 : s.ball[2] - 3; }
          }
          tx = live.length ? (live[0][0] > 0 ? -0.8 : 0.8) : 0;
        }
        const [ix, iz] = steer(s, tx, tz, v); return { ix, iz };
      }
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
      const s = H.state(); out.push([tick, ...s.ball.map((v) => +v.toFixed(2)), +s.v[0].toFixed(2), +s.v[2].toFixed(2), s.phase]);
      if (s.falls > 0) break;
      const o = p(1 / 60); if (o.done) break; H.drive(o.ix, o.iz, 1);
    }
    H.hold(false); return out.slice(-40).filter((_, i) => i % 3 === 0);
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
  return { run, show, plan, trace };
})();
'circus pilot ready';
