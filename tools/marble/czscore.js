// A circus course's difficulty (levels 151-200), as score.js does the machine's: each hazard by how hard it is to pass
// (a circus act by how far up its ladder it is), the narrow rail, the rail between rings, and length. The puzzles are
// the same for every seed of a level. __czpick() picks, for each level, the seed (of forty) whose score climbs steadily.
window.__czscore = (C, n) => {
  const at = { fring: 151, juggle: 154, kwheel: 157, trapeze: 161, wire: 164, cannon: 167, thrower: 171, mirror: 174, chase: 177, ferris: 181, teeter: 184, wod: 187, coaster: 191 };
  const base = { fring: 3, juggle: 3.5, kwheel: 4, trapeze: 3.5, wire: 3.5, cannon: 3, thrower: 4, mirror: 3.5, chase: 4, ferris: 4, teeter: 3, wod: 3, coaster: 2.5 };
  const W = { cross: 2.5, scan: 3.5, holo: 2, ferry: 1.5, train: 2, wind: 2, mag: 1.5, round: 1.5, loop: 1.5, lock: 1, crack: 2, block: 1, posts: 1.5, switch: 1, tube: 0.5, boost: 0.3, jump: 1, ramp: 0.5 };
  let h = 0, narrow = 0, len = 0;
  for (const p of C.pieces) {
    if (p.t in at) h += base[p.t] + 2 * Math.max(0, Math.min(1, (n - at[p.t]) / (200 - at[p.t])));
    else if (W[p.t]) h += W[p.t];
    if (p.t === 'flat' && !p.cell && !p.bay && p.czSeg === undefined) { len += p.d; if (p.w < 1.6) narrow += p.d; }
  }
  const zs = C.gates.map((g) => g[2]).sort((a, b) => b - a); let gap = 0; for (let i = 1; i < zs.length; i++) gap = Math.max(gap, zs[i - 1] - zs[i]);
  return +(h + narrow * 0.08 + gap * 0.04 + C.length * 0.012).toFixed(2);
};
window.__czpick = (N = 40) => {
  const S = {}; for (let n = 151; n <= 200; n++) S[n] = Array.from({ length: N }, (_, v) => __czscore(__marble.variantOf(n, v), n));
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1], lo = med(S[151]), hi = med(S[200]), out = {}, got = {};
  let prev = -1;
  for (let n = 151; n <= 200; n++) {
    const want = lo + (hi - lo) * (n - 151) / 49;
    let best = -1; for (let v = 0; v < N; v++) if (S[n][v] > prev && (best < 0 || Math.abs(S[n][v] - want) < Math.abs(S[n][best] - want))) best = v;
    if (best < 0) best = S[n].indexOf(Math.max(...S[n]));
    out[n] = best; got[n] = S[n][best]; prev = S[n][best];
  }
  return { variant: out, score: got };
};
'circus score ready';
// The best path through all fifty at once: as near the straight climb as can be, a dip below the level before costing
// three times as much as being off the line.
window.__czpick2 = (N = 40) => {
  const S = {}; for (let n = 151; n <= 200; n++) S[n] = Array.from({ length: N }, (_, v) => __czscore(__marble.variantOf(n, v), n));
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1], lo = med(S[151]) * 0.9, hi = med(S[200]);
  let cost = S[151].map((s) => Math.abs(s - lo)), back = {};
  for (let n = 152; n <= 200; n++) {
    const want = lo + (hi - lo) * (n - 151) / 49, nc = [], nb = [];
    for (let v = 0; v < N; v++) {
      let best = Infinity, arg = 0;
      for (let u = 0; u < N; u++) { const c = cost[u] + 12 * Math.max(0, S[n - 1][u] - S[n][v]) + 0.5 * Math.max(0, S[n][v] - S[n - 1][u] - 2.5); if (c < best) { best = c; arg = u; } }
      nc.push(best + Math.abs(S[n][v] - want)); nb.push(arg);
    }
    cost = nc; back[n] = nb;
  }
  const out = {}, got = {}; let v = cost.indexOf(Math.min(...cost));
  for (let n = 200; n >= 151; n--) { out[n] = v; got[n] = S[n][v]; if (n > 151) v = back[n][v]; }
  return { variant: out, score: got };
};
