
// A pilot for the space obstacles' try-out courses, in fast mode (the game's own update, a step at a time).
//   __sp.run(kind, { careless, delays }) -> { won, clock, falls, log }
// careful: round each black hole's rim; wait at each clamp until it has just opened, then go.
// careless: straight down the middle of every black hole; at a clamp, wait a random time, then go regardless.
window.__sp = (() => {
  const H = window.__marble;
  const steer = (s, tx, tz, v) => {
    const dx = tx - s.ball[0], dz = tz - s.ball[2], d = Math.hypot(dx, dz) || 1e-6, sp = Math.min(v, d * 2.2);
    let ix = (dx / d * sp - s.v[0]) * 0.7, iz = (dz / d * sp - s.v[2]) * 0.7; const m = Math.hypot(ix, iz);
    if (m > 1) { ix /= m; iz /= m; }
    return [ix, iz, d];
  };
  function plan(opts, r) {
    const C = H.course(), S = H.space(), steps = [];
    const obs = [...S.holes.map((h) => ({ k: 'hole', ...h })), ...S.clamps.map((c) => ({ k: 'clamp', ...c })), ...S.ions.map((m) => ({ k: 'ion', ...m })),
                 ...S.droids.map((d) => ({ k: 'droids', ...d, z: d.z + d.L / 2 })), ...S.erupts.map((e) => ({ k: 'erupt', ...e, z: e.z + e.L / 2 }))].sort((a, b) => b.z - a.z);
    for (const o of obs) {
      if (o.k === 'hole') {
        const R0 = o.reach;
        steps.push({ go: [o.x, o.z + R0 + 0.6], v: 4, r: 0.5 });
        if (opts.careless) steps.push({ go: [o.x, o.z - R0 - 0.8], v: 4, r: 0.5 });
        else for (const [ax, az] of [[-0.62, 0.62], [-0.8, 0], [-0.62, -0.62]]) steps.push({ go: [o.x + ax * R0, o.z + az * R0], v: 3.6, r: 0.6 });
        steps.push({ go: [o.x, o.z - R0 - 0.8], v: 4, r: 0.5 });
      } else if (o.k === 'clamp') {
        steps.push({ go: [o.x, o.z + 0.65 + 1.0], v: 3, r: 0.25, stop: true });
        steps.push({ wait: o, kind: 'clamp', careless: opts.careless, delay: opts.careless ? r() * 3 : 0 });
        steps.push({ go: [o.x, o.z - 0.65 - 1.0], v: 6, r: 0.4 });
      } else if (o.k === 'ion' && o.always) {                // ride the magnet's fling across the gap, then on along the lane beside
        const x2 = o.x + o.side * 5.2;
        steps.push({ go: [o.x, o.z], v: 3, r: 0.3 }, { flung: true }, { go: [x2, o.z - 2], v: 3, r: 0.8 }, { go: [x2, o.z - 12], v: 5, r: 0.8 });
      } else if (o.k === 'ion') {
        steps.push({ go: [o.x, o.z + 0.8 + 1.3], v: 3, r: 0.25, stop: true });
        steps.push({ wait: o, kind: 'ion', careless: opts.careless, delay: opts.careless ? r() * 3 : 0 });
        steps.push({ go: [o.x, o.z - 1.7], v: 6, r: 0.4 });
      } else if (o.k === 'droids') {
        steps.push({ go: [o.x, o.z + 0.5], v: 3, r: 0.4 }, { droids: o, careless: opts.careless });
      } else {
        steps.push({ go: [o.x, o.z + 0.3], v: 2.5, r: 0.4 }, { erupt: o, careless: opts.careless });
      }
    }
    steps.push({ go: [C.goal[0], C.goal[2]], v: 5, r: 0.3 });
    let zNow = 99;
    for (const st of steps) { st.z = st.go ? st.go[1] : st.wait ? st.wait.z : st.droids ? st.droids.z : st.erupt ? st.erupt.z : zNow; zNow = st.z; }
    return steps;
  }
  // One decision a step: the stick for this moment, and whether the run is over.
  function pilot(kind, opts) {
    const r = ((seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647))(opts.seed || 7);
    H.reach(kind); H.quiet();
    const steps = plan(opts, r), log = [];
    let i = 0, falls = 0, waited = 0, st0 = null;
    const fn = (dt) => {
      const s = H.state();
      if (s.phase === 'goal' || s.phase === 'win') return { done: { kind, won: true, clock: s.clock, falls: s.falls, log } };
      if (s.falls !== falls) {
        falls = s.falls; log.push({ fall: falls, step: i, at: s.ball.map((v) => +v.toFixed(2)) });
        let j = 0; while (j < steps.length - 1 && steps[j].z > s.spawn[2] - 0.3) j++;
        if (steps[j].wait || steps[j].flung) j = Math.max(0, j - 1);
        i = j; waited = 0; st0 = null;
      }
      if (s.phase !== 'play') return { ix: 0, iz: 0 };
      const st = steps[Math.min(i, steps.length - 1)];
      if (st.wait) {
        const Sp = H.space();
        waited += dt;
        let ok;
        if (st.kind === 'clamp') { const c = Sp.clamps.find((q) => Math.abs(q.z - st.wait.z) < 0.01); ok = c.f === 1 && c.left > 0.8; }
        else { const m = Sp.ions.find((q) => Math.abs(q.z - st.wait.z) < 0.01); ok = !m.on && m.offLeft > 0.9; }
        if (st.careless ? waited > st.delay : ok) { i++; waited = 0; }
        const [ix, iz] = steer(s, s.ball[0], s.ball[2], 0);
        return { ix, iz };
      }
      if (st.flung) {                                    // on the magnet: wait to be held and thrown; steer for the lane once in the air
        const Sp = H.space();
        if (!Sp.held && !s.grounded) i++;
        return { ix: 0, iz: 0 };
      }
      if (st.droids) {                                   // through the droids, one at a time: wait until the next is well to one side, then dash past it on the other
        const D = H.space().droids.find((q) => Math.abs(q.z + q.L / 2 - st.droids.z) < 0.01), end = D.z - D.L / 2 - 0.6;
        if (s.ball[2] < end) { i++; return { ix: 0, iz: 0 }; }
        if (st.careless) { const [ix, iz] = steer(s, D.x, s.ball[2] - 2.5, 4); return { ix, iz }; }
        const next = D.bots.filter((b) => b[1] < s.ball[2] + 0.9).sort((a, b) => b[1] - a[1])[0];
        if (!next) { const [ix, iz] = steer(s, D.x, end - 1, 4); return { ix, iz }; }
        const side = next[0] > D.x ? 1 : -1, passX = D.x - side * (D.w / 2 - 0.45);   // the slalom: round each droid on the other half, briskly
        const [ix, iz] = steer(s, passX, s.ball[2] - 1.1, 4.2); return { ix, iz };
      }
      if (st.erupt) {                                    // under the volcano: on down the middle, but out of any ring about to be hit
        const E = H.space().erupts.find((q) => Math.abs(q.z + q.L / 2 - st.erupt.z) < 0.01), end = E.z - E.L / 2 - 0.6;
        if (s.ball[2] < end) { i++; return { ix: 0, iz: 0 }; }
        let tx = E.x, tz = s.ball[2] - 2, v = 2.6;
        if (!st.careless) {
          const hot = E.warn.filter((w) => w[2] < 1.0 && Math.hypot(w[0] - s.ball[0], w[1] - (s.ball[2] - 0.4)) < 1.0 + 0.42 + 0.7);
          if (hot.length) { const w = hot[0]; tx = s.ball[0] + (s.ball[0] >= w[0] ? 1 : -1) * 1.2; tz = s.ball[2] + (s.ball[2] > w[1] ? 0.8 : -0.8); v = 4; }
          tx = Math.max(E.x - E.w / 2 + 0.5, Math.min(E.x + E.w / 2 - 0.5, tx));
        }
        const [ix, iz] = steer(s, tx, tz, v);
        return { ix, iz };
      }
      const [ix, iz, d] = steer(s, st.go[0], st.go[1], st.v);
      if (d < st.r && (!st.stop || Math.hypot(s.v[0], s.v[2]) < 0.4)) i++;
      return { ix, iz };
    };
    fn.log = log; fn.steps = steps; fn.at = () => i;
    return fn;
  }
  function run(kind, opts = {}) {                        // fast: the clock held, the game stepped by hand
    H.hold(true);
    const p = pilot(kind, opts);
    for (let tick = 0; tick < 60 * 240; tick++) { const o = p(1 / 60); if (o.done) { H.hold(false); return o.done; } H.drive(o.ix, o.iz, 1); }
    H.hold(false); const s = H.state(); return { kind, won: false, falls: s.falls, ball: s.ball, log: p.log };
  }
  function show(kind, opts = {}) {                       // for a clip: the same, a step each screen frame
    H.hold(true);
    const p = pilot(kind, opts);
    const tick = () => { const o = p(1 / 60); if (o.done) { H.hold(false); return; } H.drive(o.ix, o.iz, 1); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    return 'showing';
  }
  function trace(kind, opts = {}) {
    H.hold(true);
    const p = pilot(kind, opts), out = [];
    for (let tick = 0; tick < 60 * 120; tick++) {
      const s = H.state(), Sp = H.space();
      if (tick % 4 === 0) { const bots = Sp.droids.flatMap((D) => D.bots).filter((b) => Math.abs(b[1] - s.ball[2]) < 2.5); out.push([tick, s.ball[0].toFixed(2), s.ball[2].toFixed(2), s.v[0].toFixed(1), s.v[2].toFixed(1), p.at(), JSON.stringify(bots)]); if (out.length > 60) out.shift(); }
      if (s.falls > 0) break;
      const o = p(1 / 60); if (o.done) break; H.drive(o.ix, o.iz, 1);
    }
    H.hold(false); return out.slice(-30);
  }
  return { run, show, plan, trace };
})();
'space pilot ready';
