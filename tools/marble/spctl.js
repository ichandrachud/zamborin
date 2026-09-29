// Per-obstacle controllers for the level autopilot (pilot.js): one of the machine's obstacles, found on the course by
// where it is, played the careful way the space pilot plays it (spacepilot.js), a step at a time.
//   __spc.control(piece) -> (state, dt) => { ix, iz, done }
window.__spc = (() => {
  const H = window.__marble;
  const steer = (s, tx, tz, v) => {
    const dx = tx - s.ball[0], dz = tz - s.ball[2], d = Math.hypot(dx, dz) || 1e-6, sp = Math.min(v, d * 2.2);
    let ix = (dx / d * sp - s.v[0]) * 0.7, iz = (dz / d * sp - s.v[2]) * 0.7; const m = Math.hypot(ix, iz);
    if (m > 1) { ix /= m; iz /= m; }
    return [ix, iz, d];
  };
  const steerPass = (s, tx, tz, v, keep) => {              // full speed until the last `keep` metres
    const dx = tx - s.ball[0], dz = tz - s.ball[2], d = Math.hypot(dx, dz) || 1e-6, sp = d > keep ? v : Math.min(v, d * 2.2);
    let ix = (dx / d * sp - s.v[0]) * 0.7, iz = (dz / d * sp - s.v[2]) * 0.7; const m = Math.hypot(ix, iz);
    if (m > 1) { ix /= m; iz /= m; }
    return [ix, iz, d];
  };
  function stepsFor(o) {
    const steps = [];
    if (o.k === 'hole') {
      const R0 = o.reach;
      steps.push({ go: [o.x, o.z + R0 + 0.6], v: 4, r: 0.5 });
      for (const [ax, az] of [[-0.62, 0.62], [-0.8, 0], [-0.62, -0.62]]) steps.push({ go: [o.x + ax * R0, o.z + az * R0], v: 3.6, r: 0.6 });
      steps.push({ go: [o.x, o.z - R0 - 0.8], v: 4, r: 0.5 });
    } else if (o.k === 'clamp') {
      steps.push({ go: [o.x, o.z + 0.65 + 1.0], v: 3, r: 0.25, stop: true }, { wait: o, kind: 'clamp' }, { go: [o.x, o.z - 0.65 - 1.0], v: 6, r: 0.4 });
    } else if (o.k === 'ion' && o.always) {
      const x2 = o.x + o.side * 5.2;
      steps.push({ go: [o.x, o.z], v: 3, r: 0.3 }, { flung: true }, { go: [x2, o.z - 2], v: 3, r: 0.8 }, { go: [x2, o.z - 12], v: 5, r: 0.8 });
    } else if (o.k === 'ion') {
      steps.push({ go: [o.x, o.z + 0.8 + 1.3], v: 3, r: 0.25, stop: true }, { wait: o, kind: 'ion' }, { go: [o.x, o.z - 3.2], v: 6, r: 0.6, pass: 1.5 });
    } else if (o.k === 'droids') steps.push({ go: [o.x, o.z + 0.5], v: 3, r: 0.4 }, { droids: o });
    else steps.push({ go: [o.x, o.z + 0.3], v: 2.5, r: 0.4 }, { erupt: o });
    return steps;
  }
  function control(p) {
    const S = H.space(), near = (L) => L.slice().sort((a, b) => Math.abs(a.z - p.z) + Math.abs(a.x - p.x) - Math.abs(b.z - p.z) - Math.abs(b.x - p.x))[0];
    let o;
    if (p.t === 'hole') o = { k: 'hole', ...near(S.holes) };
    else if (p.t === 'clamp') o = { k: 'clamp', ...near(S.clamps) };
    else if (p.t === 'ion') o = { k: 'ion', ...near(S.ions) };
    else if (p.t === 'droids') { const d = near(S.droids.map((q) => ({ ...q }))); o = { k: 'droids', ...d, z: d.z + d.L / 2 }; }
    else { const e = near(S.erupts.map((q) => ({ ...q }))); o = { k: 'erupt', ...e, z: e.z + e.L / 2 }; }
    const steps = stepsFor(o); let i = 0, waited = 0;
    const fn = (s, dt) => {
      if (i >= steps.length) return { ix: 0, iz: 0, done: true };
      const st = steps[i];
      if (st.wait) {
        const Sp = H.space(); waited += dt;
        let ok;
        if (st.kind === 'clamp') { const c = Sp.clamps.find((q) => Math.abs(q.z - st.wait.z) < 0.01); ok = c.f === 1 && c.left > 0.8; }
        else { const m = Sp.ions.find((q) => Math.abs(q.z - st.wait.z) < 0.01); ok = !m.on && m.offLeft > 1.5; }   // just after it goes dark
        if (ok) { i++; waited = 0; }
        const [ix, iz] = steer(s, s.ball[0], s.ball[2], 0); return { ix, iz };
      }
      if (st.flung) { if (!H.space().held && !s.grounded) i++; return { ix: 0, iz: 0 }; }
      if (st.droids) {
        const D = H.space().droids.find((q) => Math.abs(q.z + q.L / 2 - st.droids.z) < 0.01), end = D.z - D.L / 2 - 0.6;
        if (s.ball[2] < end) { i++; return { ix: 0, iz: 0 }; }
        if (s.ball[2] < end + 1.6) { const [ix, iz] = steer(s, D.x, end - 1.5, 3); return { ix, iz }; }   // out along the middle
        const next = D.bots.filter((b) => b[1] < s.ball[2] + 0.9).sort((a, b) => b[1] - a[1])[0];
        if (!next) { const [ix, iz] = steer(s, D.x, end - 1, 4); return { ix, iz }; }
        const side = next[0] > D.x ? 1 : -1, passX = D.x - side * (D.w / 2 - 0.45);
        const [ix, iz] = steer(s, passX, s.ball[2] - 1.1, 4.2); return { ix, iz };
      }
      if (st.erupt) {
        const E = H.space().erupts.find((q) => Math.abs(q.z + q.L / 2 - st.erupt.z) < 0.01), end = E.z - E.L / 2 - 0.6;
        if (s.ball[2] < end) { i++; return { ix: 0, iz: 0 }; }
        // On down the middle, unless a ring due soon covers where the marble will be when it lands: then to the nearest spot
        // that every ring due soon leaves clear, quickly. Over the last few metres, the middle (the rail may narrow after).
        const soon = E.warn.filter((w) => w[2] > 0 && w[2] < 1.3), HIT = 1.0 + 0.21;
        const clear = (x, z, m) => soon.every((w) => Math.hypot(w[0] - x, w[1] - z) > HIT + m);
        const danger = soon.some((w) => Math.hypot(w[0] - (s.ball[0] + s.v[0] * w[2] * 0.6), w[1] - (s.ball[2] + s.v[2] * w[2] * 0.6)) < HIT + 0.5 || Math.hypot(w[0] - s.ball[0], w[1] - s.ball[2]) < HIT + 0.35);
        let tx = s.ball[2] < end + 3 ? E.x : s.ball[0] + (E.x - s.ball[0]) * 0.3, tz = s.ball[2] - 2, v = 2.6;
        if (danger) {
          let best = null;
          for (let dx = -1.8; dx <= 1.81; dx += 0.3) for (let dz = -1.8; dz <= 1.81; dz += 0.3) {
            const x = Math.max(E.x - E.w / 2 + 0.45, Math.min(E.x + E.w / 2 - 0.45, s.ball[0] + dx)), z = s.ball[2] + dz;
            if (!clear(x, z, 0.6)) continue;
            const d = Math.hypot(x - s.ball[0], z - s.ball[2]) + (dz > 0 ? 0.3 * dz : 0);
            if (!best || d < best.d) best = { x, z, d };
          }
          if (best) { tx = best.x; tz = best.z; v = 5; }
        } else if (soon.length && !clear(tx, tz, 0.5)) { tx = s.ball[0]; tz = s.ball[2]; v = 2; }   // the way ahead is about to be hit: wait here
        const [ix, iz] = steer(s, tx, tz, v); return { ix, iz };
      }
      const [ix, iz, d] = st.pass ? steerPass(s, st.go[0], st.go[1], st.v, st.pass) : steer(s, st.go[0], st.go[1], st.v);
      if (d < st.r && (!st.stop || Math.hypot(s.v[0], s.v[2]) < 0.4)) i++;
      return { ix, iz };
    };
    fn.o = o;
    return fn;
  }
  return { control };
})();
'space controls ready';
