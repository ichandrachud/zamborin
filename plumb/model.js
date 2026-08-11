/* ============================================================
   PLUMB · model, solver and generator

   A hanging mobile. Arms carry weights; some arms carry other arms. One piece,
   the BRIDGE, hangs from two strings tied to two different branches, and that
   two-point suspension is the entire reason this is a puzzle — a plain tree
   factors into independent local equations and falls to one bottom-up pass.

   INTEGERS ONLY. Every equation here is integer after multiplying through by D.
   "Solved" is a hard boolean with no tolerance, which is what makes the resolve
   snap instead of fade. Floats would produce almost-solved levels.

   Loads in Node (for the generator and its tests) and in the browser (for the
   game), from the one file, so the levels the game ships are produced by
   exactly the code that verified them.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PLUMB = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Reference sizes from the brief. H is the half-span in notches, so an arm
  // with H = 6 has notches -6 … +6, thirteen of them.
  const REF = { HR: 6, HL: 6, HB: 6, HX: 7 };

  // ---------- 2.2 tensions ----------
  // Strings pull, never push, so both tensions must be strictly positive. That
  // reduces to Wx*t1 < Mx < Wx*t2. Check it before evaluating anything else —
  // it is the cheapest rejection available and it kills most of the space.
  function bridgeOf(p) {
    const Wx = p.wx1 + p.wx2;
    const Mx = p.wx1 * p.p1 + p.wx2 * p.p2;
    return { Wx, Mx };
  }
  function tensionOK(Wx, Mx, t1, t2) {
    return Wx * t1 < Mx && Mx < Wx * t2;
  }
  function tensions(Wx, Mx, t1, t2) {
    const D = t1 - t2;                       // always negative, since t1 < t2
    return { D, N1: Mx - Wx * t2, N2: Wx * t1 - Mx };
  }

  // ---------- 2.3 the four equations ----------
  // Multiplied through by D so everything stays integer.
  const E1 = (p, s, D, N1) => p.wL * s.l1 * D + N1 * s.l2;               // arm L
  const E2 = (p, s, D, N2) => N2 * p.b1 + p.wB * s.b2 * D;               // arm B
  const E3 = (p, s, D, N1, N2) =>
    (p.wL * D + N1) * s.r1 + (N2 + p.wB * D) * s.r2;                     // root
  const E4 = (p, s) => (s.r2 + p.b1) - (s.r1 + s.l2) - (s.t2 - s.t1);    // span

  function residuals(p, s) {
    const { Wx, Mx } = bridgeOf(p);
    if (!(s.t1 < s.t2) || !tensionOK(Wx, Mx, s.t1, s.t2)) return null;
    const { D, N1, N2 } = tensions(Wx, Mx, s.t1, s.t2);
    return { D, N1, N2, e1: E1(p, s, D, N1), e2: E2(p, s, D, N2), e3: E3(p, s, D, N1, N2), e4: E4(p, s) };
  }
  function isSolved(p, s) {
    const r = residuals(p, s);
    return !!r && r.e1 === 0 && r.e2 === 0 && r.e3 === 0 && r.e4 === 0;
  }

  // ---------- hook ranges ----------
  // r1 hangs arm L to the left of the root pivot, r2 hangs arm B to the right.
  // That convention is what makes the search space 6*6*13*13*13*105 =
  // 8,304,660, which is the figure the brief quotes — so it is load-bearing,
  // not decoration.
  function ranges(H) {
    return {
      r1: [-H.HR, -1], r2: [1, H.HR],
      l1: [-H.LL ?? -H.HL, H.HL], l2: [-H.HL, H.HL],
      b2: [-H.HB, H.HB], t: [-H.HX, H.HX],
    };
  }
  function searchSpaceSize(H) {
    const tPairs = (2 * H.HX + 1) * (2 * H.HX) / 2;
    return H.HR * H.HR * (2 * H.HL + 1) * (2 * H.HL + 1) * (2 * H.HB + 1) * tPairs;
  }

  // ---------- exhaustive solver ----------
  // Slow and obviously correct. Used to VERIFY the structural generator rather
  // than to generate — if the two ever disagree, the fast one is wrong.
  function solveExhaustive(p, H) {
    H = H || REF;
    const { Wx, Mx } = bridgeOf(p);
    const out = [];
    let examined = 0;
    for (let t1 = -H.HX; t1 <= H.HX; t1++) for (let t2 = t1 + 1; t2 <= H.HX; t2++) {
      if (!tensionOK(Wx, Mx, t1, t2)) continue;
      const { D, N1, N2 } = tensions(Wx, Mx, t1, t2);
      for (let r1 = -H.HR; r1 <= -1; r1++) for (let r2 = 1; r2 <= H.HR; r2++)
        for (let l1 = -H.HL; l1 <= H.HL; l1++) for (let l2 = -H.HL; l2 <= H.HL; l2++)
          for (let b2 = -H.HB; b2 <= H.HB; b2++) {
            examined++;
            const s = { r1, r2, l1, l2, b2, t1, t2 };
            if (l1 === l2 || b2 === p.b1) continue;      // 4.2 no two hooks in one notch
            if (E1(p, s, D, N1) !== 0) continue;
            if (E2(p, s, D, N2) !== 0) continue;
            if (E3(p, s, D, N1, N2) !== 0) continue;
            if (E4(p, s) !== 0) continue;
            out.push(s);
          }
    }
    return { solutions: out, examined };
  }

  // ---------- 4.1 structural solver, used AS the generator ----------
  // Set the bridge ties first and everything else follows: b2 is forced
  // outright, then E3 and E1 each pin a ratio with only a handful of integer
  // pairs in range. This is the same insight the game has to teach without
  // saying it, which is a good sign it is the real structure of the problem.
  function solveStructural(p, H) {
    H = H || REF;
    const { Wx, Mx } = bridgeOf(p);
    const out = [];
    let examined = 0;
    for (let t1 = -H.HX; t1 <= H.HX; t1++) for (let t2 = t1 + 1; t2 <= H.HX; t2++) {
      if (!tensionOK(Wx, Mx, t1, t2)) continue;
      const { D, N1, N2 } = tensions(Wx, Mx, t1, t2);

      // b2 is forced by E2. Reject unless it lands exactly on a notch.
      const num = -N2 * p.b1, den = p.wB * D;
      if (den === 0 || num % den !== 0) continue;
      const b2 = num / den;
      if (b2 < -H.HB || b2 > H.HB || b2 === p.b1) continue;

      // E3 pins the ratio r1 : r2 — few enough in range to walk directly.
      for (let r1 = -H.HR; r1 <= -1; r1++) for (let r2 = 1; r2 <= H.HR; r2++) {
        examined++;
        if (E3(p, { r1, r2 }, D, N1, N2) !== 0) continue;
        // E1 pins l1 : l2.
        for (let l1 = -H.HL; l1 <= H.HL; l1++) for (let l2 = -H.HL; l2 <= H.HL; l2++) {
          examined++;
          if (l1 === l2) continue;
          if (E1(p, { l1, l2 }, D, N1) !== 0) continue;
          const s = { r1, r2, l1, l2, b2, t1, t2 };
          if (E4(p, s) !== 0) continue;
          out.push(s);
        }
      }
    }
    return { solutions: out, examined };
  }

  // ---------- geometry ----------
  // Horizontal notch coordinates with the root pivot at 0. Confirmed against
  // the brief's own Case A figures (extent -12 … +11, centre -0.5).
  function geometry(p, s, H) {
    H = H || REF;
    const bridgeC = s.r1 + s.l2 - s.t1;         // E4 guarantees the far tie agrees
    const arms = {
      root: { x: 0, lo: -H.HR, hi: H.HR },
      L: { x: s.r1, lo: s.r1 - H.HL, hi: s.r1 + H.HL },
      B: { x: s.r2, lo: s.r2 - H.HB, hi: s.r2 + H.HB },
      X: { x: bridgeC, lo: bridgeC - H.HX, hi: bridgeC + H.HX },
    };
    const lo = Math.min(arms.root.lo, arms.L.lo, arms.B.lo, arms.X.lo);
    const hi = Math.max(arms.root.hi, arms.L.hi, arms.B.hi, arms.X.hi);
    return {
      bridgeC, arms, lo, hi, centre: (lo + hi) / 2, extent: hi - lo,
      weights: {
        wL: s.r1 + s.l1, wB: s.r2 + s.b2,
        wx1: bridgeC + p.p1, wx2: bridgeC + p.p2,
      },
      anchors: { a1: s.r1 + s.l2, a2: s.r2 + p.b1 },
      armsLo: Math.min(arms.L.lo, arms.B.lo), armsHi: Math.max(arms.L.hi, arms.B.hi),
    };
  }

  // ---------- 4.3 composition ----------
  // Procedural generation produces valid mobiles, not beautiful ones. Every
  // rule here is evaluated at EVERY solution, not just the first.
  function composedOne(p, s, H) {
    const g = geometry(p, s, H);
    if (g.arms.X.lo < g.armsLo - 2 || g.arms.X.hi > g.armsHi + 2) return 'bridge outside arms';
    if (Math.abs(g.centre) > 3) return 'off centre';
    if (Math.abs(g.weights.wL - g.weights.wB) < 3) return 'upper weights too close';
    if (Math.abs(p.p1 - p.p2) < 4) return 'bridge weights too close';
    if (Math.abs(s.l1 - s.l2) < 2 || Math.abs(p.b1 - s.b2) < 2 ||
        Math.abs(s.r1 - s.r2) < 2 || Math.abs(s.t1 - s.t2) < 2) return 'hooks crowded';
    if (Math.abs(s.r1) < 2 || s.r2 < 2) return 'sub-arm against the pivot';
    if (s.t1 === p.p1 || s.t1 === p.p2 || s.t2 === p.p1 || s.t2 === p.p2) return 'tie on a weight';
    return null;
  }
  const composed = (p, sols, H) => sols.every(s => composedOne(p, s, H) === null);

  function compositionScore(p, s, H) {
    const g = geometry(p, s, H);
    const gap = Math.abs(g.weights.wL - g.weights.wB);
    return 3 * Math.abs(g.centre) + Math.abs(g.extent - 22) + 0.4 * Math.abs(gap - 14);
  }

  // ---------- 4.2 validity ----------
  function validity(p, sols) {
    if (sols.length < 1) return 'unsolvable';
    if (sols.length > 3) return 'too many solutions';
    return null;
  }

  return {
    REF, bridgeOf, tensionOK, tensions,
    E1, E2, E3, E4, residuals, isSolved,
    solveExhaustive, solveStructural,
    geometry, composedOne, composed, compositionScore, validity,
    ranges, searchSpaceSize,
  };
}));
