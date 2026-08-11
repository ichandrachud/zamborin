/* PLUMB — geometry and composition, for any topology.

   §4.3's rules are stated for the reference shape in absolute notch counts
   ("at least 3 notches apart", "within 3 notches"). Applied unchanged to the
   short-armed phone topology they are proportionally brutal, so they scale
   with arm size here. Everything is still evaluated at EVERY solution, not
   just the first — procedural generation makes valid mobiles, not beautiful
   ones, and validity says nothing about whether it looks like a Calder. */
(function (root, factory) {
  const api = factory(typeof require === 'function' ? require('./topology.js') : root.PLUMB_TOPO);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PLUMB_COMPOSE = api;
}(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';

  // Vertical placement: EVERY arm gets its own row, in depth-first pre-order.
  //
  // The obvious scheme — parent depth plus a per-sibling stagger — collides. A
  // staggered sibling can land on the same row as a deeper branch of the other
  // subtree: measured on a phone, arms B and C came out 7px apart vertically,
  // so their hooks were unpickable. Pre-order gives distinct rows by
  // construction AND keeps every parent above its children, since pre-order
  // always visits a parent before its descendants.
  function depths(topo) {
    const d = {};
    let row = 0;
    (function walk(a) {
      d[a] = row++;
      for (const h of topo.arms[a].hooks)
        if (h.carries.arm !== undefined) walk(h.carries.arm);
    })(topo.root);
    const bd = {};
    for (const [name] of Object.entries(topo.bridges || {})) {
      let deepest = 0;
      for (const [armName, A] of Object.entries(topo.arms))
        for (const h of A.hooks)
          if (h.carries.bridge === name) deepest = Math.max(deepest, d[armName]);
      bd[name] = deepest + 1;
    }
    return { arms: d, bridges: bd };
  }

  // Horizontal extent of the whole mobile, in notches, at a given solution.
  function geometry(topo, params, cfg) {
    const e = T.evaluate(topo, params, cfg);
    if (!e) return null;
    const spans = [];
    for (const [name, A] of Object.entries(topo.arms)) spans.push([e.x[name] - A.H, e.x[name] + A.H]);
    for (const [name, B] of Object.entries(topo.bridges || {})) {
      const c = e.bridge[name].centre;
      spans.push([c - B.H, c + B.H]);
    }
    const lo = Math.min(...spans.map(s => s[0])), hi = Math.max(...spans.map(s => s[1]));
    // where every weight ends up, for the "not too close together" rules
    const weights = [];
    const val = (k) => (typeof k === 'string' ? (cfg[k] !== undefined ? cfg[k] : params[k]) : k);
    for (const [armName, A] of Object.entries(topo.arms))
      for (const h of A.hooks)
        if (h.carries.weight !== undefined)
          weights.push({ x: e.x[armName] + val(h.id), w: val(h.carries.weight), tree: true });
    for (const [name, B] of Object.entries(topo.bridges || {}))
      for (const w of B.weights)
        weights.push({ x: e.bridge[name].centre + val(w.at), w: val(w.w), tree: false });
    return { ...e, lo, hi, centre: (lo + hi) / 2, extent: hi - lo, weights, depths: depths(topo) };
  }

  function composedOne(topo, params, cfg) {
    const g = geometry(topo, params, cfg);
    if (!g) return 'strings would push';
    const H = Math.max(...Object.values(topo.arms).map(a => a.H));
    const k = H / 6;                                  // scale the brief's numbers to the board
    const S = (n) => Math.max(1, Math.round(n * k));
    const val = (k2) => (typeof k2 === 'string' ? (cfg[k2] !== undefined ? cfg[k2] : params[k2]) : k2);

    // a bridge must sit under the arms it hangs from, not swing out past them
    for (const [name, B] of Object.entries(topo.bridges || {})) {
      const c = g.bridge[name].centre;
      let alo = Infinity, ahi = -Infinity;
      for (const [armName, A] of Object.entries(topo.arms))
        for (const h of A.hooks)
          if (h.carries.bridge === name) { alo = Math.min(alo, g.x[armName] - A.H); ahi = Math.max(ahi, g.x[armName] + A.H); }
      if (c - B.H < alo - S(2) || c + B.H > ahi + S(2)) return 'bridge outside arms';
      // A tie sharing a notch with a weight used to be rejected here. It is a
      // COSMETIC clash — two marks on one notch — and the renderer solves it by
      // lifting the tie hook clear. Rejecting it cost 17x the yield on the
      // phone topology (10,000 samples per level, versus 588 without it), which
      // is the difference between a level pack and none.
      const ws = B.weights.map(w => val(w.at));
      for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++)
        if (Math.abs(ws[i] - ws[j]) < S(4)) return 'bridge weights too close';
      // A bridge's ties are draggable hooks too, and this rule originally only
      // walked topo.arms — so ties could sit one notch apart and land 19px
      // from each other on a phone. Same 2-notch floor as any other pair.
      const ts = B.ties.map(t => val(t)).sort((x, y) => x - y);
      for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] < 2) return 'ties crowded';
    }
    if (Math.abs(g.centre) > S(3)) return 'off centre';
    if (topo.maxExtent && g.extent > topo.maxExtent) return 'too wide for the screen';

    // tree weights must be readable as separate objects
    const tw = g.weights.filter(w => w.tree).map(w => w.x).sort((a, b) => a - b);
    for (let i = 1; i < tw.length; i++) if (tw[i] - tw[i - 1] < S(3)) return 'weights too close';

    for (const [name, A] of Object.entries(topo.arms)) {
      // NOT scaled: two hooks are two touch targets, and a fingertip does not
      // shrink with the board. On the short-armed phone topology S(2) is 1
      // notch, which measured 21px apart on a 375px screen — well under the
      // 44px floor. Two notches is the hard minimum everywhere.
      const hooks = A.hooks.map(h => val(h.id)).sort((a, b) => a - b);
      for (let i = 1; i < hooks.length; i++) if (hooks[i] - hooks[i - 1] < 2) return 'hooks crowded';
      // a sub-arm crammed against its parent's pivot has nowhere to swing
      for (const h of A.hooks)
        if (h.carries.arm !== undefined && Math.abs(val(h.id)) < S(2)) return 'sub-arm against the pivot';
    }
    return null;
  }
  const composed = (topo, params, sols) => sols.every(s => composedOne(topo, params, s) === null);

  function score(topo, params, cfg) {
    const g = geometry(topo, params, cfg);
    if (!g) return Infinity;
    const H = Math.max(...Object.values(topo.arms).map(a => a.H));
    const want = 3.6 * H;                             // the extent that looks right for this board
    const tw = g.weights.filter(w => w.tree).map(w => w.x);
    const spread = tw.length > 1 ? Math.max(...tw) - Math.min(...tw) : 0;
    return 3 * Math.abs(g.centre) + Math.abs(g.extent - want) + 0.4 * Math.abs(spread - 2.3 * H);
  }

  return { depths, geometry, composedOne, composed, score };
}));
