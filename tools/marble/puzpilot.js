
// A pilot for the space puzzles' try-out courses: it reads each square as the game has it (__marble.spz()) and
// plays it through the stick, a cell at a time, the way a careful player would; or carelessly (a null test).
//   __pp.run(kind, { careless, seed }) -> { won, clock, falls, squares: [{ id, solved, t, note }] }
//   __pp.show(kind, opts): the same, a step each screen frame (for a clip)
window.__pp = (() => {
  const H = window.__marble, CELL = 2.2;
  const steer = (s, tx, tz, v, pass) => {
    const dx = tx - s.ball[0], dz = tz - s.ball[2], d = Math.hypot(dx, dz) || 1e-6, sp = pass ? v : Math.min(v, d * 2.4);
    let ix = (dx / d * sp - s.v[0]) * 0.7, iz = (dz / d * sp - s.v[2]) * 0.7; const m = Math.hypot(ix, iz);
    if (m > 1) { ix /= m; iz /= m; }
    return [ix, iz, d];
  };
  const G = (q) => {                                     // the square's walls, as its map draws them
    const rows = q.rows, M = q.map, hE = (k, c) => M[2 * (rows - k)][2 * c + 1], vE = (r, c) => M[2 * (rows - 1 - r) + 1][2 * c];
    return { wall: (c, r, d) => (d === 'n' ? hE(r + 1, c) : d === 's' ? hE(r, c) : d === 'e' ? vE(r, c + 1) : vE(r, c)) !== ' ',
             ch: (c, r) => M[2 * (rows - 1 - r) + 1][2 * c + 1],
             X: (c) => q.x0 + (c + 0.5) * CELL, Z: (r) => q.z0 - (r + 0.5) * CELL };
  };
  const DIRS = [['n', 0, 1], ['s', 0, -1], ['e', 1, 0], ['w', -1, 0]];
  function bfs(q, g, from, to, block) {                 // cells from here to there, round the blocked ones
    const k = (c, r) => c + ',' + r, prev = new Map([[k(...from), null]]), Q = [from];
    while (Q.length) {
      const [c, r] = Q.shift();
      if (c === to[0] && r === to[1]) { const out = []; for (let x = k(c, r); x; x = prev.get(x)) out.unshift(x.split(',').map(Number)); return out; }
      for (const [d, dc, dr] of DIRS) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nc >= q.cols || nr < 0 || nr >= q.rows || g.wall(c, r, d) || prev.has(k(nc, nr)) || g.ch(nc, nr) === '#') continue;
        if (!(nc === to[0] && nr === to[1]) && block(nc, nr)) continue;
        prev.set(k(nc, nr), k(c, r)); Q.push([nc, nr]);
      }
    }
    return null;
  }
  const cellOf = (q, s) => [Math.floor((s.ball[0] - q.x0) / CELL), Math.floor((q.z0 - s.ball[2]) / CELL)];
  const inside = (q, c) => c[0] >= 0 && c[0] < q.cols && c[1] >= 0 && c[1] < q.rows;
  // Toward a cell: along the path, the next cell's middle (the last one's middle exactly).
  function toward(q, g, s, target, block, v = 2.8, loose) {
    const at = cellOf(q, s), p = bfs(q, g, at, target, block) || (loose ? bfs(q, g, at, target, () => false) : null);
    if (!p) return null;
    let k = Math.min(1, p.length - 1);                   // down a straight run to its far end, slowing only for the turn (or the target) there
    if (k) { const dc = p[1][0] - p[0][0], dr = p[1][1] - p[0][1]; while (k + 1 < p.length && p[k + 1][0] - p[k][0] === dc && p[k + 1][1] - p[k][1] === dr) k++; }
    const nx = p[k], [ix, iz, d] = steer(s, g.X(nx[0]), g.Z(nx[1]), v);
    return { ix, iz, d, left: p.length - 1 };
  }
  // ---- the searches ----
  function starsPlan(q) {                                // which stars to roll over: lights-out, over GF(2), by trying every set (at most 2^8)
    const n = q.stars.length, idx = Object.fromEntries(q.stars.map((s, i) => [s.id, i])), nb = q.stars.map((s, i) => s.nb.reduce((m, t) => m | (1 << idx[t]), 1 << i));
    const start = q.stars.reduce((m, s, i) => m | (s.lit ? 1 << i : 0), 0), all = (1 << n) - 1;
    let best = null;
    for (let S = 0; S < 1 << n; S++) { let m = start; for (let i = 0; i < n; i++) if (S >> i & 1) m ^= nb[i]; if (m === all && (best === null || pop(S) < pop(best))) best = S; }
    return best === null ? [] : q.stars.filter((_, i) => best >> i & 1);
  }
  const pop = (x) => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };
  function holesPlan(q) {                                // the fewest scoops to the island with the way out: [flags to throw here, scoop colour]
    const isl = q.isl, here = (c, r) => isl[r * q.cols + c], goal = here(q.exit, q.rows - 1);
    const byIsl = {}; for (const it of q.items) { const k = here(it.c, it.r); (byIsl[k] = byIsl[k] || []).push(it); }
    const outIsl = q.outs.map((L) => L.map(([c, r]) => here(c, r)));
    return (from, lit0) => {
      const K = (i, l) => i + ':' + l.join(''), seen = new Map([[K(from, lit0), null]]), Q = [[from, lit0]];
      for (let h = 0; h < Q.length; h++) {
        const [i, lit] = Q[h];
        if (i === goal) { let k = K(i, lit), step = null; while (seen.get(k)) { step = seen.get(k); k = step.from; } return step ? step.act : null; }
        const its = byIsl[i] || [], fl = [...new Set(its.filter((t) => t.t === 'flag').map((t) => t.col))];
        for (let m = 0; m < 1 << fl.length; m++) {
          const l2 = lit.slice(), flips = []; fl.forEach((col, b) => { if (m >> b & 1) { l2[col] ^= 1; flips.push(col); } });
          for (const col of new Set(its.filter((t) => t.t === 'scoop').map((t) => t.col))) {
            const to = outIsl[col][l2[col]]; if (to === undefined) continue;
            const k = K(to, l2); if (seen.has(k)) continue;
            seen.set(k, { from: K(i, lit), act: { flips, col } }); Q.push([to, l2]);
          }
        }
      }
      return null;
    };
  }
  function orbitPlan(q, g, marble) {                     // the fewest pushes: [satellite cell, direction] first
    const cols = q.cols, rows = q.rows, docks = new Set(q.docks.map((d) => d.r * cols + d.c)), astro = new Set(q.astro);
    const D = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }, OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
    const reach = (occ, from) => { const seen = new Set([from]), Q = [from]; while (Q.length) { const i = Q.pop(), c = i % cols, r = (i / cols) | 0;
      for (const [d, [dc, dr]] of Object.entries(D)) { const nc = c + dc, nr = r + dr; if (nc < 0 || nc >= cols || nr < 0 || nr >= rows || g.wall(c, r, d)) continue;
        const j = nr * cols + nc; if (seen.has(j) || occ.has(j) || astro.has(j)) continue; seen.add(j); Q.push(j); } } return seen; };
    const slide = (occ, i, d) => { let c = i % cols, r = (i / cols) | 0, n = 0; const [dc, dr] = D[d];
      for (;;) { const nc = c + dc, nr = r + dr; if (nc < 0 || nc >= cols || nr < 0 || nr >= rows || g.wall(c, r, d)) break; const j = nr * cols + nc; if (occ.has(j) || astro.has(j)) break; c = nc; r = nr; n++; }
      return n ? r * cols + c : -1; };
    const norm = (L) => L.map((s) => (s >= 1000 ? s : docks.has(s) ? s + 1000 : s)).sort((a, b) => a - b), occOf = (L) => new Set(L.map((s) => s % 1000));
    const s0 = norm(q.sats.map((s) => s.r * cols + s.c + (s.docked ? 1000 : 0))), r0 = reach(occOf(s0), marble), K = (L, reg) => L.join(',') + '|' + Math.min(...reg);
    const seen = new Map([[K(s0, r0), null]]), Q = [[s0, r0]];
    for (let h = 0; h < Q.length && h < 200000; h++) {
      const [L, reg] = Q[h];
      if (L.every((s) => s >= 1000)) { let k = K(L, reg), st = null; while (seen.get(k)) { st = seen.get(k); k = st.from; } return st ? st.push : 'done'; }
      const occ = occOf(L);
      L.forEach((s, j) => {
        if (s >= 1000) return;
        const c = s % cols, r = (s / cols) | 0;
        for (const d of Object.keys(D)) {
          const [dc, dr] = D[d], bc = c - dc, br = r - dr;
          if (bc < 0 || bc >= cols || br < 0 || br >= rows || g.wall(c, r, OPP[d]) || !reg.has(br * cols + bc)) continue;
          const t = slide(occ, s, d); if (t < 0) continue;
          const L2 = norm(L.map((x, jj) => (jj === j ? t : x))), reg2 = reach(occOf(L2), s), k = K(L2, reg2);
          if (seen.has(k)) continue;
          seen.set(k, { from: K(L, reg), push: [c, r, d, bc, br] }); Q.push([L2, reg2]);
        }
      });
    }
    return null;
  }
  // The circus's push puzzles (the clown car, the pyramid, the scales): the fewest pushes, by the same search as
  // tools/marble/puz/circpush.js, from the pieces where they are now. [piece's cell, direction, the cell behind] first.
  function czPlan(q, g, marble, exitOnly) {
    const cols = q.cols, rows = q.rows, fixed = new Set(q.fixed.map(([c, r]) => r * cols + c)), car = q.car ? { i: q.car.r * cols + q.car.c, door: q.car.door } : null;
    const D = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] }, OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
    const live = q.pieces.map((p, k) => ({ k, v: p.v, i: p.gone ? -1 : p.r * cols + p.c }));
    const spots = q.spots ? q.spots.map(([c, r]) => r * cols + c) : [], panL = new Set((q.panL || []).map(([c, r]) => r * cols + c)), panR = new Set((q.panR || []).map(([c, r]) => r * cols + c));
    const step = (i, d) => { const c = i % cols, r = (i / cols) | 0, [dc, dr] = D[d], nc = c + dc, nr = r + dr; return nc < 0 || nc >= cols || nr < 0 || nr >= rows || g.wall(c, r, d) ? -1 : nr * cols + nc; };
    const reach = (occ, from) => { const seen = new Set([from]), Q = [from]; while (Q.length) { const i = Q.pop(); for (const d in D) { const j = step(i, d); if (j < 0 || seen.has(j) || occ.has(j) || fixed.has(j)) continue; seen.add(j); Q.push(j); } } return seen; };
    const exitCell = (rows - 1) * cols + q.exit;
    const goal = (P, reg) => {
      if (!reg.has(exitCell)) return false;
      if (exitOnly) return true;                          // solved already: only the way out to clear
      if (q.kind === 'clowncar') return P.every((i) => i < 0);
      if (q.kind === 'pyramid') return spots.every((s) => P.includes(s));
      let L = q.offL, R = q.offR, n = 0; P.forEach((i, k) => { if (panL.has(i)) { L += live[k].v; n++; } if (panR.has(i)) { R += live[k].v; n++; } }); return n > 0 && L === R;
    };
    const canon = (P) => { const out = P.slice(), byV = {}; live.forEach((p, k) => (byV[p.v] = byV[p.v] || []).push(k)); for (const ks of Object.values(byV)) { const s2 = ks.map((k) => out[k]).sort((a, b) => a - b); ks.forEach((k, j) => { out[k] = s2[j]; }); } return out; };
    const K = (P, reg) => P.join(',') + '|' + Math.min(...reg);
    const P0 = canon(live.map((p) => p.i)), r0 = reach(new Set(P0.filter((i) => i >= 0)), marble), seen = new Map([[K(P0, r0), null]]), Q = [[P0, r0]];
    for (let h = 0; h < Q.length && h < 300000; h++) {
      const [P, reg] = Q[h];
      if (goal(P, reg)) { let k = K(P, reg), st = null; while (seen.get(k)) { st = seen.get(k); k = st.from; } return st ? st.push : 'done'; }
      const occ = new Set(P.filter((i) => i >= 0));
      P.forEach((i, k) => {
        if (i < 0) return;
        for (const d in D) {
          const b = step(i, OPP[d]); if (b < 0 || !reg.has(b)) continue;
          let t = step(i, d); if (t < 0 || occ.has(t)) continue;
          if (car && t === car.i) { if (car.door !== OPP[d]) continue; t = -1; } else if (fixed.has(t)) continue;
          const P2 = canon(P.map((x, j) => (j === k ? t : x))), reg2 = reach(new Set(P2.filter((x) => x >= 0)), i), kk = K(P2, reg2);
          if (seen.has(kk)) continue;
          seen.set(kk, { from: K(P, reg), push: [i % cols, (i / cols) | 0, d, b % cols, (b / cols) | 0] }); Q.push([P2, reg2]);
        }
      });
    }
    return null;
  }
  // One tick inside a square: the stick, or { fail } (a careless run that has given up).
  function inner(q, g, s, st, at, outZ, dt, opts, R, rnd) {
    const out = (v = 3) => {                           // to the way out, then through it
      if ((at[0] === q.exit && at[1] === q.rows - 1) || at[1] >= q.rows) { const [ix, iz] = steer(s, g.X(q.exit), outZ - 2, v, true); return { ix, iz }; }   // (or through it already)
      const w = toward(q, g, s, [q.exit, q.rows - 1], st.block || (() => false), v); return w ? { ix: w.ix, iz: w.iz } : { ix: 0, iz: 0 };
    };
    if (q.kind === 'stars') {
      const star = (c, r) => q.stars.some((t) => t.c === c && t.r === r);
      st.block = star;
      if (q.done) return out();
      let want;
      if (opts.careless) {                             // every star once, nearest first, then the door
        st.seen = st.seen || new Set();
        const here = q.stars.find((t) => t.c === at[0] && t.r === at[1]); if (here) st.seen.add(here.id);
        want = q.stars.filter((t) => !st.seen.has(t.id));
        if (!want.length) return out();
      } else want = starsPlan(q);
      const near = want.map((t) => ({ t, p: bfs(q, g, at, [t.c, t.r], star) })).filter((o) => o.p).sort((a, b) => a.p.length - b.p.length)[0];
      if (!near) return { ix: 0, iz: 0 };
      const w = toward(q, g, s, [near.t.c, near.t.r], star, 2.8); return { ix: w.ix, iz: w.iz };
    }
    if (q.kind === 'airlock') {
      const key = (c, r) => q.keys.some((k) => k.c === c && k.r === r);
      st.block = key;
      if (q.done) return out();
      if (!q.heard || q.playing || q.wrong) { const [ix, iz] = steer(s, g.X(q.entry), g.Z(0), 2); return { ix, iz }; }   // listen
      let tone;
      if (opts.careless) { st.n = st.n || 0; const here = q.keys.find((k) => k.c === at[0] && k.r === at[1]); if (here && here.tone === st.n % q.keys.length) st.n++; tone = st.n % q.keys.length; }   // 1, 2, 3 ... in turn
      else tone = q.seq[q.at];
      const k = q.keys.find((u) => u.tone === tone), w = toward(q, g, s, [k.c, k.r], key, 2.6);
      return w ? { ix: w.ix, iz: w.iz } : { ix: 0, iz: 0 };
    }
    if (q.kind === 'fuel') {
      const pad = q.pad, fuelAt = (c, r) => q.cells.some((u) => u.c === c && u.r === r);
      if (st.flying || s.ball[2] < outZ) { st.flying = true; return { ix: 0, iz: 0 }; }   // launched: nothing to do but land
      if (!st.plan) {                                   // three cells, then the pad: the quickest from the first cell on (careless: the nearest each time)
        const ready = q.cells.filter((u) => u.ready), dist = (a, b) => {   // cells to roll, and a half for every turn (the marble slows for them)
          const p = bfs(q, g, a, b, (c, r) => fuelAt(c, r) || (c === pad[0] && r === pad[1])) || bfs(q, g, a, b, () => false); if (!p) return 99;
          let turns = 0; for (let i = 2; i < p.length; i++) if ((p[i][0] - p[i - 1][0]) !== (p[i - 1][0] - p[i - 2][0])) turns++;
          return p.length - 1 + 0.5 * turns + 0.6; };
        if (opts.careless && !st.careful) {
          let from = at; const pick = [];
          for (let n = 0; n < 3; n++) { const nx = ready.filter((u) => !pick.includes(u)).sort((a, b) => dist(from, [a.c, a.r]) - dist(from, [b.c, b.r]))[0]; pick.push(nx); from = [nx.c, nx.r]; }
          st.plan = pick;
        } else {
          let best = null;
          for (const a of ready) for (const b of ready) for (const c of ready) {
            if (a === b || b === c || a === c) continue;
            const t = dist([a.c, a.r], [b.c, b.r]) + dist([b.c, b.r], [c.c, c.r]) + dist([c.c, c.r], pad);
            if (!best || t < best.t) best = { t, p: [a, b, c] };
          }
          st.plan = best.p;
        }
        if (opts.plans && opts.plans[j] && !st.careful) st.plan = opts.plans[j].map(([c, r]) => ready.find((u) => u.c === c && u.r === r));
        st.i = 0; R.note += ' plan ' + st.plan.map((u) => u.c + ',' + u.r).join('>');
      }
      const block = (c, r) => (fuelAt(c, r) && !st.plan.slice(0, st.i).some((u) => u.c === c && u.r === r)) || (c === pad[0] && r === pad[1]);
      if (st.i < 3) {
        const u = st.plan[st.i], live = q.cells.find((v) => v.c === u.c && v.r === u.r);
        if (!live.ready) { st.i++; return { ix: 0, iz: 0 }; }
        const w = toward(q, g, s, [u.c, u.r], block, 3.2, true); return w ? { ix: w.ix, iz: w.iz } : { ix: 0, iz: 0 };
      }
      if (q.launched > (st.l0 || 0)) { st.flying = true; return { ix: 0, iz: 0 }; }
      if (at[0] === pad[0] && at[1] === pad[1] && Math.hypot(s.ball[0] - g.X(pad[0]), s.ball[2] - g.Z(pad[1])) < 0.45) {   // on the pad and not thrown: under the line, try again
        if (!st.buzzed) { st.buzzed = true; R.note += ' short ' + q.tank; R.short = true; st.careful = true; }
        st.plan = null; st.buzzed = false; const keep = st.careful; st.careful = keep;
      }
      if (st.l0 === undefined) st.l0 = q.launched;
      if (!st.tankAt && Math.abs(at[0] - pad[0]) + Math.abs(at[1] - pad[1]) === 1) { st.tankAt = true; R.note += ' tank ' + q.tank; }
      const w = toward(q, g, s, pad, (c, r) => fuelAt(c, r), 3.2, true); return w ? { ix: w.ix, iz: w.iz } : { ix: 0, iz: 0 };
    }
    if (q.kind === 'wormholes') {
      if (q.flying) { st.act = null; return { ix: 0, iz: 0 }; }
      if (!inside(q, at) && s.ball[2] < q.z0 - q.rows * CELL + 0.3) { const [ix, iz] = steer(s, g.X(q.exit), outZ - 2, 3, true); return { ix, iz }; }   // through the gap: on out
      const isl = q.isl[at[1] * q.cols + at[0]], goal = q.isl[(q.rows - 1) * q.cols + q.exit], item = (c, r) => q.items.some((u) => u.c === c && u.r === r && u.t !== 'out');
      st.block = item;
      if (isl === goal) return out();
      if (!s.grounded) return { ix: 0, iz: 0 };
      if (!st.act || st.isl !== isl) {
        st.isl = isl; st.scoops = (st.scoops || 0) + 1;
        if (opts.careless) { st.act = { flips: [], col: q.items.find((u) => u.t === 'scoop' && q.isl[u.r * q.cols + u.c] === isl).col }; if (st.scoops > 8) return { fail: true }; }
        else { st.act = holesPlan(q)(isl, q.lit); R.note += ' ' + (st.act ? st.act.flips.map((c) => 'fgh'[c]).join('') + 'abc'[st.act.col] : '?'); }
        st.lit0 = q.lit.slice(); st.fi = 0;
        if (!st.act) return { ix: 0, iz: 0 };
      }
      const flips = st.act.flips;
      while (st.fi < flips.length && q.lit[flips[st.fi]] !== st.lit0[flips[st.fi]]) st.fi++;   // thrown
      const mine = (t, col) => q.items.find((u) => u.t === t && u.col === col && q.isl[u.r * q.cols + u.c] === isl);
      const tgt = st.fi < flips.length ? mine('flag', flips[st.fi]) : mine('scoop', st.act.col);
      const w = toward(q, g, s, [tgt.c, tgt.r], item, 2.6); return w ? { ix: w.ix, iz: w.iz } : { ix: 0, iz: 0 };
    }
    if (q.kind === 'orbit') {
      const occ = (c, r) => q.sats.some((u) => u.c === c && u.r === r) || q.astro.includes(r * q.cols + c);
      st.block = occ;
      if (q.done) return out();
      const moving = q.sats.find((u) => u.moving);
      if (moving || st.brake > 0) {                     // a push under way: ease off, back into the cell behind
        st.brake = moving ? 0.35 : st.brake - dt;
        const [ix, iz] = steer(s, st.bx !== undefined ? g.X(st.bx) : s.ball[0], st.bz !== undefined ? g.Z(st.bz) : s.ball[2], 1.5); st.push = null; return { ix, iz };
      }
      if (!st.push) {
        if (opts.careless) {                            // any push the marble can make, at random, twelve at most
          st.n = (st.n || 0) + 1; if (st.n > 12) return { fail: true };
          const opts2 = [];
          for (const u of q.sats) if (!u.docked) for (const [d, dc, dr] of DIRS) { const bc = u.c - dc, br = u.r - dr; if (bc >= 0 && bc < q.cols && br >= 0 && br < q.rows && !occ(bc, br) && !g.wall(u.c, u.r, { n: 's', s: 'n', e: 'w', w: 'e' }[d]) && bfs(q, g, at, [bc, br], occ)) opts2.push([u.c, u.r, d, bc, br]); }
          st.push = opts2[Math.floor(rnd() * opts2.length)];
        } else { st.push = orbitPlan(q, g, at[1] * q.cols + at[0]); if (st.push && st.push !== 'done') R.note += ' ' + st.push[0] + ',' + st.push[1] + st.push[2]; }
        if (!st.push || st.push === 'done') { st.push = null; return { ix: 0, iz: 0 }; }
        st.bx = st.push[3]; st.bz = st.push[4]; st.ram = false;
      }
      const [c, r, d, bc, br] = st.push;
      if (!st.ram) {                                    // to the cell behind it, and stop there
        if (at[0] !== bc || at[1] !== br) { const w = toward(q, g, s, [bc, br], occ, 2.6); return w ? { ix: w.ix, iz: w.iz } : { ix: 0, iz: 0 }; }
        const [ix, iz, dd] = steer(s, g.X(bc), g.Z(br), 1.5);
        if (dd < 0.25 && Math.hypot(s.v[0], s.v[2]) < 0.4) st.ram = true;
        return { ix, iz };
      }
      const [ix, iz] = steer(s, g.X(c), g.Z(r), 3.2, true); return { ix, iz };   // and roll into it
    }
    if (q.kind === 'clowncar' || q.kind === 'pyramid' || q.kind === 'scales') {
      const fixedAt = (c, r) => q.fixed.some(([a, b]) => a === c && b === r), occ = (c, r) => q.pieces.some((u) => !u.gone && u.c === c && u.r === r) || fixedAt(c, r);
      st.block = occ;
      const clear = q.done && (at[1] >= q.rows || bfs(q, g, at, [q.exit, q.rows - 1], occ));
      if (clear) return out();
      const moving = q.pieces.find((u) => u.moving);
      if (moving || st.brake > 0) {                     // a push under way: ease off, back into the cell behind
        st.brake = moving ? 0.3 : st.brake - dt;
        const [ix, iz] = steer(s, st.bx !== undefined ? g.X(st.bx) : s.ball[0], st.bz !== undefined ? g.Z(st.bz) : s.ball[2], 1.5); st.push = null; return { ix, iz };
      }
      if (!st.push) {
        if (opts.careless) {                            // any push the marble can make, at random, twelve at most
          st.n = (st.n || 0) + 1; if (st.n > 12) return { fail: true };
          const opts2 = [];
          for (const u of q.pieces) if (!u.gone) for (const [d, dc, dr] of DIRS) { const bc = u.c - dc, br = u.r - dr, tc = u.c + dc, tr = u.r + dr;
            if (bc >= 0 && bc < q.cols && br >= 0 && br < q.rows && !occ(bc, br) && !g.wall(u.c, u.r, { n: 's', s: 'n', e: 'w', w: 'e' }[d]) && tc >= 0 && tc < q.cols && tr >= 0 && tr < q.rows && !g.wall(u.c, u.r, d)
                && (!occ(tc, tr) || (q.car && q.car.c === tc && q.car.r === tr)) && bfs(q, g, at, [bc, br], occ)) opts2.push([u.c, u.r, d, bc, br]); }
          st.push = opts2[Math.floor(rnd() * opts2.length)];
        } else { st.push = czPlan(q, g, at[1] * q.cols + at[0], q.done); if (st.push && st.push !== 'done') R.note += ' ' + st.push[0] + ',' + st.push[1] + st.push[2]; }
        if (!st.push || st.push === 'done') { st.push = null; return { ix: 0, iz: 0 }; }
        st.bx = st.push[3]; st.bz = st.push[4]; st.ram = false;
      }
      const [c, r, d, bc, br] = st.push;
      if (!st.ram) {                                    // to the cell behind it, and stop there
        if (at[0] !== bc || at[1] !== br) { const w = toward(q, g, s, [bc, br], occ, 2.6); return w ? { ix: w.ix, iz: w.iz } : { ix: 0, iz: 0 }; }
        const [ix, iz, dd] = steer(s, g.X(bc), g.Z(br), 1.5);
        if (dd < 0.25 && Math.hypot(s.v[0], s.v[2]) < 0.4) st.ram = true;
        return { ix, iz };
      }
      const [ix, iz] = steer(s, g.X(c), g.Z(r), 3.2, true); return { ix, iz };   // and roll into it
    }
    if (q.kind === 'shells') {                           // wait below the pads; when they light, the pad of the cup with the star
      const padAt = (c, r) => q.pads.some(([a, b]) => a === c && b === r), tableAt = (c, r) => q.slots.some(([a, b]) => a === c && b === r);
      st.block = (c, r) => padAt(c, r) || tableAt(c, r);
      if (q.done) return out();
      const wr = q.pads[0][1] - 1, fresh = q.phase === 'pick' && st.last !== 'pick';
      st.last = q.phase;
      if (q.phase !== 'pick') { const w = toward(q, g, s, [q.entry, wr], st.block, 2.4); return w ? { ix: w.ix, iz: w.iz } : { ix: 0, iz: 0 }; }
      if (fresh) {                                      // (careless: any cup, four goes at most)
        if (opts.careless) { st.tries = (st.tries || 0) + 1; if (st.tries > 4) return { fail: true }; st.slot = Math.floor(rnd() * q.slots.length); } else st.slot = q.prizeSlot;
      }
      const [pc, pr] = q.pads.find(([c]) => c === q.slots[st.slot][0]);
      if (at[1] < pr && at[0] !== pc) { const w = toward(q, g, s, [pc, wr], st.block, 2.6); return w ? { ix: w.ix, iz: w.iz } : { ix: 0, iz: 0 }; }
      const [ix, iz] = steer(s, g.X(pc), g.Z(pr), 2.2); return { ix, iz };   // up into its bay, onto the middle of it
    }
    if (q.kind === 'knives') {                           // wait on the way in while he throws; then across on the boards he missed
      const hit = (c, r) => q.targets.some(([a, b]) => a === c && b === r);
      if (q.phase !== 'cross' && !q.done) { const [ix, iz] = steer(s, g.X(q.entry), g.Z(0), 2); return { ix, iz }; }
      if (opts.careless) { st.falls0 = st.falls0 === undefined ? H.state().falls : st.falls0; st.block = () => false; }
      else st.block = hit;
      return out(2.6);
    }
    return { ix: 0, iz: 0 };
  }
  // ---- the pilot ----
  function pilot(kind, opts) {
    const rnd = ((seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647))(opts.seed || 7);
    H.reach(kind); H.quiet();
    const C = H.course(), squares = H.spz().sort((a, b) => b.z0 - a.z0), report = squares.map((q) => ({ kind: q.kind, solved: false, t: 0, note: '' }));
    let j = 0, falls = 0, st = { phase: 'approach' }, prevX = C.start[0], t0 = null;
    if (opts.only !== undefined) {                       // just the one square (for a clip): set down on the road in to it
      j = opts.only; const q = squares[j], x = q.x0 + (q.entry + 0.5) * CELL; prevX = x; H.place(x, q.y + 0.43, q.z0 + 3.5);
    }
    const fn = (dt) => {
      const s = H.state();
      if (s.phase === 'goal' || s.phase === 'win') return { done: { kind, won: true, clock: s.clock, falls: s.falls, squares: report } };
      if (s.falls !== falls) { falls = s.falls; st = { phase: 'approach' }; if (report[j]) report[j].note += ' fall'; }
      if (s.phase !== 'play') return { ix: 0, iz: 0 };
      if (opts.only !== undefined && j > opts.only) return { done: { kind, won: true, clock: s.clock, falls: s.falls, squares: report.slice(opts.only, opts.only + 1) } };
      if (j >= squares.length) { const [ix, iz] = steer(s, s.ball[2] > C.goal[2] + 4 ? prevX : C.goal[0], C.goal[2] - 0.5, 4); return { ix, iz }; }
      const q = H.spz().sort((a, b) => b.z0 - a.z0)[j], g = G(q), ex = g.X(q.entry), outZ = q.z0 - q.rows * CELL, at = cellOf(q, s);
      const R = report[j];
      if (t0 === null) t0 = s.clock;
      const finish = (note) => { R.t = +(s.clock - t0).toFixed(1); R.note += note || ''; prevX = g.X(q.exit); j++; t0 = null; st = { phase: 'approach' }; };
      if (s.clock - t0 > (opts.limit || 90)) { R.note += ' timeout'; return { done: { kind, won: false, clock: s.clock, falls: s.falls, squares: report } }; }
      // Out through the far side: that square is behind us.
      if (q.kind === 'fuel' && s.ball[2] < outZ - q.gap - 0.5 && s.grounded) { R.solved = true; finish(); return { ix: 0, iz: 0 }; }
      if (q.kind !== 'fuel' && s.ball[2] < outZ - 0.8) { R.solved = q.done; finish(); return { ix: 0, iz: 0 }; }
      if (st.phase === 'approach') {                    // down the road to the way in, and in
        if (s.ball[2] > q.z0 + 3.2) { const [ix, iz] = steer(s, prevX, q.z0 + 2.7, 4); return { ix, iz }; }
        if (Math.abs(s.ball[0] - ex) > 0.4 && s.ball[2] > q.z0 + 0.6) { const [ix, iz] = steer(s, ex, q.z0 + 2.7, 2.5); return { ix, iz }; }
        const [ix, iz] = steer(s, ex, g.Z(0), 3);
        if (inside(q, at)) st = { phase: 'in' };
        return { ix, iz };
      }
      const o = inner(q, g, s, st, at, outZ, dt, opts, R, rnd);
      if (o.fail) return { done: { kind, won: false, clock: s.clock, falls: s.falls, squares: report } };
      return o;
    };
    fn.report = report;
    return fn;
  }
  function control(p, opts = {}) {
    const rnd = ((seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647))(opts.seed || 7), R = { note: '' };
    let st = { phase: 'approach' };
    return (s, dt) => {
      const q = H.spz().find((u) => Math.abs(u.x0 - p.x0) < 0.01 && Math.abs(u.z0 - p.z0) < 0.01), g = G(q), ex = g.X(q.entry), outZ = q.z0 - q.rows * CELL, at = cellOf(q, s);
      if (q.kind === 'fuel' && s.ball[2] < outZ - q.gap - 0.5 && s.grounded) return { ix: 0, iz: 0, done: true, R };
      if (q.kind !== 'fuel' && s.ball[2] < outZ - 0.8) return { ix: 0, iz: 0, done: true, R };
      if (st.phase === 'approach') {
        if (Math.abs(s.ball[0] - ex) > 0.4 && s.ball[2] > q.z0 + 0.6) { const [ix, iz] = steer(s, ex, Math.min(s.ball[2], q.z0 + 1.2), 2.5); return { ix, iz }; }
        const [ix, iz] = steer(s, ex, g.Z(0), 3);
        if (inside(q, at)) st = { phase: 'in' };
        return { ix, iz };
      }
      const o = inner(q, g, s, st, at, outZ, dt, opts, R, rnd);
      return o.fail ? { ix: 0, iz: 0, fail: true, R } : o;
    };
  }
  function run(kind, opts = {}) {
    H.hold(true);
    const p = pilot(kind, opts);
    for (let tick = 0; tick < 60 * 400; tick++) { const o = p(1 / 60); if (o.done) { H.hold(false); return o.done; } H.drive(o.ix, o.iz, 1); }
    H.hold(false); const s = H.state(); return { kind, won: false, falls: s.falls, squares: p.report, ball: s.ball };
  }
  function show(kind, opts = {}) {
    H.hold(true);
    const p = pilot(kind, opts);
    let last = performance.now(), owed = 0;               // as many sixtieths as have really passed (at most six a frame), so the clip runs at the game's own speed
    const tick = () => {
      const now = performance.now(); owed = Math.min(owed + (now - last) / 1000, 0.1); last = now;
      while (owed >= 1 / 60) { owed -= 1 / 60; const o = p(1 / 60); if (o.done) { H.hold(false); window.__ppDone = o.done; return; } H.drive(o.ix, o.iz, 1); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return 'showing';
  }
  return { run, show, control, pilot };
})();
'puzzle pilot ready';
