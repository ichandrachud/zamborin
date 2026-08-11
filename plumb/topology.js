/* ============================================================
   PLUMB · general topology

   The brief formulates ONE shape — root, two sub-arms, one bridge — as four
   hand-derived equations. That is enough for desktop and nothing else: it
   cannot express §5's second bridge, and it cannot express the deep-and-narrow
   tree a portrait phone needs. Measured: shrinking the reference topology to
   fit a phone drops blind-search failure from 85% to 51%, so a small board is
   not the same game. Depth is the answer, and depth needs this.

   THE GENERAL SYSTEM. Two rules, applied to any mobile:

     BALANCE, once per singly-suspended arm
       sum over its hooks of (load * offset) = 0
       where load is the total weight hanging from that hook.

     SPAN, once per bridge
       x(far anchor) - x(near anchor) = t2 - t1
       which is what keeps both of a bridge's strings vertical.

   A bridge is an arm hung from TWO hooks on two different arms. Its own force
   and moment balance are not free constraints — they are what SOLVE for the
   two string tensions, which then appear as loads on the arms above:
       D = t1 - t2,  N1 = Mx - Wx*t2,  N2 = Wx*t1 - Mx,  T1 = N1/D, T2 = N2/D

   For the reference topology this yields exactly the brief's E1, E2, E3, E4 —
   three balance equations and one span — which verify.js proves against both
   golden cases.

   EXACT ARITHMETIC. The brief says use integers and never floats, because a
   tolerance produces almost-solved levels. With one bridge you can multiply
   through by D and stay integer. With several bridges there are several Ds, so
   instead every load is an exact RATIONAL, reduced. "Solved" is still a hard
   boolean with no tolerance anywhere.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PLUMB_TOPO = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- exact rationals ----------
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; };
  function rat(n, d) {
    if (d === undefined) d = 1;
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d);
    return { n: n / g, d: d / g };
  }
  const rAdd = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
  const rMul = (a, b) => rat(a.n * b.n, a.d * b.d);
  const rInt = (k) => ({ n: k, d: 1 });
  const rZero = (a) => a.n === 0;
  const rPos = (a) => a.n > 0;

  // ---------- topology description ----------
  // arms:    { name: { H, hooks: [ {id, carries} , ... ] } }
  //          carries is one of  {weight:'wL'} | {arm:'L'} | {bridge:'X', end:0|1}
  // bridges: { name: { H, weights: [{at:'p1', w:'wx1'}, ...], ties:['t1','t2'] } }
  // Hook offsets and tie positions come from the CONFIG; weights and riveted
  // positions come from PARAMS. Everything is an integer notch index.

  function armsBelow(topo, armName, seen) {
    seen = seen || new Set();
    seen.add(armName);
    for (const h of topo.arms[armName].hooks)
      if (h.carries.arm) armsBelow(topo, h.carries.arm, seen);
    return seen;
  }

  // Evaluate a whole mobile. Returns null when a bridge's strings would push
  // rather than pull, which is physically impossible and must be rejected
  // before anything else is computed.
  function evaluate(topo, params, cfg) {
    const val = (k) => (typeof k === 'string' ? (cfg[k] !== undefined ? cfg[k] : params[k]) : k);

    // --- bridges first: their tensions become loads on the arms above them
    const bridge = {};
    for (const [name, B] of Object.entries(topo.bridges || {})) {
      const t1 = val(B.ties[0]), t2 = val(B.ties[1]);
      if (!(t1 < t2)) return null;
      let Wx = 0, Mx = 0;
      for (const w of B.weights) { const m = val(w.w), at = val(w.at); Wx += m; Mx += m * at; }
      // strings pull, never push
      if (!(Wx * t1 < Mx && Mx < Wx * t2)) return null;
      const D = t1 - t2;
      bridge[name] = { t1, t2, D, Wx, Mx, T: [rat(Mx - Wx * t2, D), rat(Wx * t1 - Mx, D)] };
    }

    // --- load hanging from each hook, and each arm's total, bottom-up
    const armTotal = {};
    function totalOf(armName) {
      if (armTotal[armName]) return armTotal[armName];
      let sum = rInt(0);
      for (const h of topo.arms[armName].hooks) sum = rAdd(sum, loadAt(h));
      armTotal[armName] = sum;
      return sum;
    }
    function loadAt(h) {
      if (h.carries.weight !== undefined) return rInt(val(h.carries.weight));
      if (h.carries.arm !== undefined) return totalOf(h.carries.arm);
      return bridge[h.carries.bridge].T[h.carries.end];
    }

    // --- BALANCE, one residual per singly-suspended arm
    const residuals = [];
    for (const [name, A] of Object.entries(topo.arms)) {
      let m = rInt(0);
      for (const h of A.hooks) m = rAdd(m, rMul(loadAt(h), rInt(val(h.id))));
      residuals.push({ kind: 'balance', arm: name, r: m });
    }

    // --- absolute horizontal position of every arm, walking down from the root
    const x = { [topo.root]: 0 };
    (function place(armName) {
      for (const h of topo.arms[armName].hooks) {
        if (h.carries.arm === undefined) continue;
        x[h.carries.arm] = x[armName] + val(h.id);
        place(h.carries.arm);
      }
    })(topo.root);

    // --- SPAN, one residual per bridge
    const anchors = {};
    for (const [armName, A] of Object.entries(topo.arms))
      for (const h of A.hooks)
        if (h.carries.bridge !== undefined)
          (anchors[h.carries.bridge] = anchors[h.carries.bridge] || [])[h.carries.end] = x[armName] + val(h.id);

    for (const [name, B] of Object.entries(topo.bridges || {})) {
      const a = anchors[name];
      if (!a || a[0] === undefined || a[1] === undefined) return null;
      const b = bridge[name];
      residuals.push({ kind: 'span', bridge: name, r: rInt((a[1] - a[0]) - (b.t2 - b.t1)) });
      // a bridge's own centre, for geometry and for rendering
      b.centre = a[0] - b.t1;
    }

    return { residuals, bridge, x, armTotal, anchors };
  }

  const isSolved = (topo, params, cfg) => {
    const e = evaluate(topo, params, cfg);
    return !!e && e.residuals.every(d => rZero(d.r));
  };

  // ---------- which values are free, and over what range ----------
  function freeVars(topo, params) {
    const out = [];
    for (const [name, A] of Object.entries(topo.arms))
      for (const h of A.hooks)
        if (params[h.id] === undefined)
          // A hook may declare its own range. The reference topology hangs arm
          // L to the left of the root pivot and arm B to the right, and that
          // convention is load-bearing: it is what makes the search space
          // 8,304,660, the figure the brief quotes.
          out.push({ id: h.id, lo: h.lo !== undefined ? h.lo : -A.H,
                     hi: h.hi !== undefined ? h.hi : A.H, arm: name });
    for (const B of Object.values(topo.bridges || {}))
      for (const t of B.ties)
        if (params[t] === undefined) out.push({ id: t, lo: -B.H, hi: B.H, tie: true });
    return out;
  }

  // ---------- solver ----------
  // Bridge ties FIRST, because fixing them determines every tension and so
  // every load in the mobile. Then arms BOTTOM-UP, because once an arm's
  // descendants are placed its own balance is a single equation in its own two
  // hooks — so it can be checked the instant that arm is complete, instead of
  // at the leaves of a blind search. That is the brief's structural insight
  // (§3.3) generalised to any number of arms.
  function loads(topo, params, cfg) {
    const val = (k) => (typeof k === 'string' ? (cfg[k] !== undefined ? cfg[k] : params[k]) : k);
    const tension = {};
    for (const [name, B] of Object.entries(topo.bridges || {})) {
      const t1 = val(B.ties[0]), t2 = val(B.ties[1]);
      if (t1 === undefined || t2 === undefined || !(t1 < t2)) return null;
      let Wx = 0, Mx = 0;
      for (const w of B.weights) { const m = val(w.w), at = val(w.at); Wx += m; Mx += m * at; }
      if (!(Wx * t1 < Mx && Mx < Wx * t2)) return null;
      const D = t1 - t2;
      tension[name] = [rat(Mx - Wx * t2, D), rat(Wx * t1 - Mx, D)];
    }
    const memo = {};
    const totalOf = (a) => {
      if (memo[a]) return memo[a];
      let sum = rInt(0);
      for (const h of topo.arms[a].hooks) sum = rAdd(sum, loadAt(h));
      return (memo[a] = sum);
    };
    const loadAt = (h) => {
      if (h.carries.weight !== undefined) return rInt(val(h.carries.weight));
      if (h.carries.arm !== undefined) return totalOf(h.carries.arm);
      return tension[h.carries.bridge][h.carries.end];
    };
    return { val, loadAt, totalOf };
  }

  function solve(topo, params, opts) {
    opts = opts || {};
    const limit = opts.limit || 64;
    const out = [];
    let examined = 0;

    const tieVars = [];
    for (const B of Object.values(topo.bridges || {}))
      for (const t of B.ties) if (params[t] === undefined) tieVars.push({ id: t, lo: -B.H, hi: B.H });

    // children before parents
    const order = [];
    (function post(a) {
      for (const h of topo.arms[a].hooks) if (h.carries.arm !== undefined) post(h.carries.arm);
      order.push(a);
    })(topo.root);

    const stages = order.map((a) => ({
      arm: a,
      vars: topo.arms[a].hooks.filter(h => params[h.id] === undefined).map(h => ({
        id: h.id,
        lo: h.lo !== undefined ? h.lo : -topo.arms[a].H,
        hi: h.hi !== undefined ? h.hi : topo.arms[a].H,
      })),
    }));

    const cfg = {};
    const get = (id) => (cfg[id] !== undefined ? cfg[id] : params[id]);

    // 4.2: no arm may carry two hooks in the same notch. Checked here AND on
    // acceptance — checking only during descent lets a duplicate created by the
    // last variable assigned slip straight through to the answer.
    function distinctOK(a) {
      const seen = new Set();
      for (const h of topo.arms[a].hooks) {
        const v = get(h.id);
        if (v === undefined) continue;
        if (seen.has(v)) return false;
        seen.add(v);
      }
      return true;
    }
    function allDistinct() { return Object.keys(topo.arms).every(distinctOK); }

    function armBalances(a, L) {
      let m = rInt(0);
      for (const h of topo.arms[a].hooks) m = rAdd(m, rMul(L.loadAt(h), rInt(get(h.id))));
      return rZero(m);
    }

    function stage(si) {
      if (out.length >= limit) return;
      if (si === stages.length) {
        examined++;
        if (allDistinct() && isSolved(topo, params, cfg)) out.push({ ...cfg });
        return;
      }
      const { arm, vars } = stages[si];
      (function assign(vi) {
        if (out.length >= limit) return;
        if (vi === vars.length) {
          if (!distinctOK(arm)) return;
          const L = loads(topo, params, cfg);
          if (!L) return;
          if (!armBalances(arm, L)) return;      // this arm is final — it must balance NOW
          stage(si + 1);
          return;
        }
        const v = vars[vi];
        for (let n = v.lo; n <= v.hi; n++) { cfg[v.id] = n; assign(vi + 1); }
        delete cfg[v.id];
      })(0);
    }

    // ties are shared by the whole mobile, so they are chosen before any arm
    (function ties(i) {
      if (out.length >= limit) return;
      if (i === tieVars.length) { stage(0); return; }
      const v = tieVars[i];
      for (let n = v.lo; n <= v.hi; n++) { cfg[v.id] = n; ties(i + 1); }
      delete cfg[v.id];
    })(0);

    return { solutions: out, examined };
  }

  // Counts ORDERED hook choices but UNORDERED tie pairs, since t1 < t2 always.
  // Doing it the other way over-counts by 2x per bridge and stops the reference
  // topology reproducing the brief's 8,304,660.
  function searchSpace(topo, params) {
    let n = 1;
    for (const v of freeVars(topo, params)) if (!v.tie) n *= (v.hi - v.lo + 1);
    for (const B of Object.values(topo.bridges || {})) {
      const free = B.ties.filter(t => params[t] === undefined).length;
      const m = 2 * B.H + 1;
      if (free === 2) n *= m * (m - 1) / 2;
      else if (free === 1) n *= m;
    }
    return n;
  }

  return { rat, rAdd, rMul, rInt, rZero, rPos, evaluate, isSolved, solve, freeVars, searchSpace, armsBelow };
}));
