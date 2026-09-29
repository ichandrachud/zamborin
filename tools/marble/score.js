// A course's difficulty, from what is on it: each hazard by how hard it is to pass (the machine's own by how far up its
// ladder it is), the narrow rail, the rail between rings, and length. The puzzles are the same for every seed of a level.
window.__score = (C, n) => {
  const t = (k, at) => Math.max(0, Math.min(1, (n - at) / (150 - at)));
  const W = { hole: (p) => 3 + 2 * t('hole', 101), clamp: (p) => 3 + 2 * t('clamp', 104), ion: (p) => (p.always ? 4 : 2.5) + 2 * t('ion', 111), droids: (p) => 4 + 3 * t('droids', 121), erupt: (p) => 4 + 3 * t('erupt', 131),
              cross: 2.5, scan: 3.5, holo: 2, ferry: 1.5, train: 2, wind: 2, mag: 1.5, round: 1.5, loop: 1.5, lock: 1, crack: 2, block: 1, posts: 1.5, switch: 1, tube: 0.5, boost: 0.3, jump: 1, ramp: 0.5 };
  let h = 0, narrow = 0, len = 0;
  for (const p of C.pieces) {
    const w = W[p.t]; if (w) h += typeof w === 'function' ? w(p) : w;
    if (p.t === 'flat' && !p.cell && !p.bay) { len += p.d; if (p.w < 1.6) narrow += p.d; }
  }
  const zs = C.gates.map((g) => g[2]).sort((a, b) => b - a); let gap = 0; for (let i = 1; i < zs.length; i++) gap = Math.max(gap, zs[i - 1] - zs[i]);
  return +(h + narrow * 0.08 + gap * 0.04 + C.length * 0.012).toFixed(2);
};
'score ready';
