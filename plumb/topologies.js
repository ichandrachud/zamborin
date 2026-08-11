/* PLUMB — the shapes of mobile the game knows how to build.

   REFERENCE is the brief's own topology, written in the general form. It is
   here so the general system can be proved against the brief's hand-derived
   equations and both golden cases — if those ever disagree, the general system
   is wrong.

   DEEP is the portrait phone shape. It is NOT the reference shrunk: measured,
   shrinking drops blind-search failure from 85% to 51%, which means half of all
   levels become solvable by twiddling and the puzzle stops being a puzzle. It
   is narrow and deep instead — shorter arms, but MORE of them, so difficulty
   comes back through free-hook count, which the brief names as the primary
   dial. Portrait has the height to spend and not the width. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PLUMB_TOPOLOGIES = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REFERENCE = {
    name: 'reference',
    root: 'R',
    arms: {
      // r1 hangs arm L left of the pivot, r2 hangs arm B right of it. That
      // convention is what makes the space 8,304,660, the brief's own figure.
      R: { H: 6, hooks: [{ id: 'r1', lo: -6, hi: -1, carries: { arm: 'L' } },
                         { id: 'r2', lo: 1, hi: 6, carries: { arm: 'B' } }] },
      L: { H: 6, hooks: [{ id: 'l1', carries: { weight: 'wL' } },
                         { id: 'l2', carries: { bridge: 'X', end: 0 } }] },
      B: { H: 6, hooks: [{ id: 'b1', carries: { bridge: 'X', end: 1 } },
                         { id: 'b2', carries: { weight: 'wB' } }] },
    },
    bridges: {
      X: { H: 7, weights: [{ at: 'p1', w: 'wx1' }, { at: 'p2', w: 'wx2' }], ties: ['t1', 't2'] },
    },
  };

  // Five arms plus a bridge, every arm short. The bridge still spans two
  // different branches — that two-point suspension is the whole reason any of
  // this is a puzzle — but it now hangs from arms at different depths.
  const DEEP = {
    name: 'deep',
    root: 'R',
    arms: {
      R: { H: 3, hooks: [{ id: 'r1', lo: -3, hi: -1, carries: { arm: 'L' } },
                         { id: 'r2', lo: 1, hi: 3, carries: { arm: 'B' } }] },
      L: { H: 3, hooks: [{ id: 'l1', carries: { weight: 'wL' } },
                         { id: 'l2', carries: { arm: 'C' } }] },
      B: { H: 3, hooks: [{ id: 'b1', carries: { arm: 'D' } },
                         { id: 'b2', carries: { weight: 'wB' } }] },
      C: { H: 3, hooks: [{ id: 'c1', carries: { weight: 'wC' } },
                         { id: 'c2', carries: { bridge: 'X', end: 0 } }] },
      D: { H: 3, hooks: [{ id: 'd1', carries: { bridge: 'X', end: 1 } },
                         { id: 'd2', carries: { weight: 'wD' } }] },
    },
    bridges: {
      X: { H: 4, weights: [{ at: 'p1', w: 'wx1' }, { at: 'p2', w: 'wx2' }], ties: ['t1', 't2'] },
    },
  };

  return { REFERENCE, DEEP };
}));
