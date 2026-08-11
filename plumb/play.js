/* ============================================================
   PLUMB · static renderer (build order §9 step 3)

   One level looking right before anything becomes draggable. No interaction
   here on purpose — if the aesthetic is not there, everything built on top of
   it is wasted.

   THE ARMS ARE ARCS, not straight rods. Straight wire reads as an engineering
   drawing no matter how thin it is; the bow is most of what makes a Calder
   look drawn rather than plotted. It costs the mechanic nothing because every
   pivot sits at its arm's centre: a symmetric arc is a rigid body, so rotating
   the arm by θ rotates the tip-to-tip chord by exactly θ, and the eye reads
   level off that chord — which is where it is already looking, because that is
   where the loads hang.

   COLOUR is measured against the house ground #0A1A2F. Calder's own palette
   does not survive here: navy is 1.77:1 and black 1.04:1, so both vanish. The
   neutral family below replaces them and keeps the brief's channel discipline
   — colour means ROLE, size means WEIGHT, and neither does the other's job.
   ============================================================ */
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let CW = 940, CH = 660;

  const isMobile = () => matchMedia('(pointer: coarse)').matches ||
    (window.innerWidth > 0 && window.innerWidth < 768);

  // ---------- palette (all measured on #0A1A2F) ----------
  const GROUND = '#0A1A2F';
  const WIRE = '#A8813F';            // brass, 4.89:1 — separates by hue as well
  const WIRE_FINE = '#8E6C34';       //           as by lightness, unlike a blue wire
  const CEIL = '#6F5A30';
  // Tree weights: a neutral family, recessive, differentiated by silhouette.
  const TREE = ['#EFE9DC', '#DCC9A4', '#B2A899', '#8B93A0'];   // 14.5 / 10.8 / 7.5 / 5.6 : 1
  const BRIDGE_W = '#E85C3F';        // vermilion, 5.02:1 — the one saturated accent
  const HAIRLINE = 'rgba(10,26,47,0.55)';
  const HOOK_FREE = '#EAF2FA', HOOK_RIVET = '#7FA3CC', NOTCH = '#5C7EA6';

  const L = window.PLUMB_LEVELS || [];
  let li = 0, lvl = null, cfg = null;
  let NU = 26;                        // pixels per notch
  let showNotches = false;

  // ---------- geometry in notch units ----------
  const DROP_ROOT = 4.4;              // root arm down to the nearer sub-arm
  const STAGGER = 2.6;                // the two sub-arms hang at different depths
  const DROP_SUB = 5.6;               // lower sub-arm down to the bridge
  const HANG = 2.0;                   // arm down to a weight's centre
  const SAG = 0.55;                   // how far an arm's tips fall below its centre
  const MAXTILT = 0.20;               // radians, about 11.5 degrees

  const params = (l) => ({ ...l.weights, ...l.riveted });

  // Shape radius from weight, expressed in notch units so the shapes scale with
  // the sculpture rather than drifting small when the mobile gets wide. The
  // brief's 5*w^0.75 in raw pixels bottoms out at 10px across, which reads as a
  // bead threaded on a wire — and "do not let the wire compete with the shapes"
  // is §8's dead end. Here the smallest is still 0.62 of a notch in radius.
  const radiusOf = (w) => NU * (0.40 + 0.22 * Math.pow(w, 0.75));

  // Tilt is proportional to how far an arm is from balance, capped so a wildly
  // wrong board still looks like a mobile rather than a collapsed one.
  function tilts(l, s) {
    const p = params(l);
    const r = window.PLUMB.residuals(p, s);
    if (!r) return { root: 0, L: 0, B: 0, X: 0 };
    const scale = (v, k) => Math.max(-MAXTILT, Math.min(MAXTILT, v / k));
    return {
      root: scale(r.e3, 90), L: scale(r.e1, 45), B: scale(r.e2, 45),
      // The bridge hangs from two strings; when the span is wrong they splay
      // rather than the bridge tilting, so E4 drives the strings, not the arm.
      X: 0, splay: r.e4,
    };
  }

  // ---------- silhouettes ----------
  // Leaf, crescent, kidney, disc — hand-cut shapes, never geometric primitives.
  function shapePath(kind, x, y, r, rot) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot || 0);
    ctx.beginPath();
    if (kind === 0) {                                    // leaf
      ctx.moveTo(0, -r * 1.25);
      ctx.bezierCurveTo(r * 0.95, -r * 0.35, r * 0.72, r * 0.85, 0, r * 1.12);
      ctx.bezierCurveTo(-r * 0.72, r * 0.85, -r * 0.95, -r * 0.35, 0, -r * 1.25);
    } else if (kind === 1) {                             // crescent
      ctx.arc(0, 0, r, Math.PI * 0.78, Math.PI * 2.22, false);
      ctx.bezierCurveTo(r * 0.30, r * 0.55, r * 0.30, -r * 0.55, Math.cos(Math.PI * 0.78) * r, Math.sin(Math.PI * 0.78) * r);
    } else if (kind === 2) {                             // kidney
      ctx.moveTo(-r * 0.95, -r * 0.15);
      ctx.bezierCurveTo(-r * 1.05, -r * 1.05, r * 1.05, -r * 1.05, r * 0.95, -r * 0.10);
      ctx.bezierCurveTo(r * 0.88, r * 0.85, r * 0.15, r * 0.55, 0, r * 0.42);
      ctx.bezierCurveTo(-r * 0.15, r * 0.55, -r * 0.88, r * 0.85, -r * 0.95, -r * 0.15);
    } else {                                             // disc
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    }
    ctx.closePath();
    ctx.restore();
  }
  function drawShape(kind, col, x, y, r, rot) {
    shapePath(kind, x, y, r, rot);
    ctx.fillStyle = col; ctx.fill();
    // A fine dark hairline. On this ground it keeps the pale neutrals from
    // dissolving into each other where two shapes overlap.
    ctx.strokeStyle = HAIRLINE; ctx.lineWidth = Math.max(0.8, r * 0.045); ctx.stroke();
  }

  // ---------- an arm, drawn as a symmetric arc ----------
  // Returns the two tip points so whatever hangs off the arm can be placed on
  // the curve rather than on an imaginary straight line.
  function armPoints(cx, cy, halfSpan, tilt) {
    const sag = SAG * NU;
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const u = -1 + (2 * i) / 24;                       // -1 … +1 across the arm
      const lx = u * halfSpan, ly = sag * (u * u);       // parabola: centre high, tips low
      pts.push([cx + lx * Math.cos(tilt) - ly * Math.sin(tilt),
                cy + lx * Math.sin(tilt) + ly * Math.cos(tilt)]);
    }
    return pts;
  }
  // Where on that arc does notch n sit?
  function notchPoint(cx, cy, halfSpanNotches, tilt, n) {
    const u = n / halfSpanNotches;
    const lx = u * halfSpanNotches * NU, ly = SAG * NU * (u * u);
    return [cx + lx * Math.cos(tilt) - ly * Math.sin(tilt),
            cy + lx * Math.sin(tilt) + ly * Math.cos(tilt)];
  }
  function strokeArm(pts, w) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = WIRE; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke();
  }
  function drawString(x1, y1, x2, y2, doubled) {
    ctx.strokeStyle = WIRE_FINE; ctx.lineWidth = 1.25; ctx.lineCap = 'round';
    if (!doubled) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      return;
    }
    // The bridge announces itself with a doubled hairline pair — two thin
    // parallel lines rather than one thick one. Stays wire-like while being
    // unmistakably not an ordinary string.
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * 1.6, ny = dx / len * 1.6;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x1 + nx * s, y1 + ny * s); ctx.lineTo(x2 + nx * s, y2 + ny * s);
      ctx.stroke();
    }
  }
  function drawHook(x, y, riveted) {
    if (riveted) {
      ctx.beginPath(); ctx.arc(x, y, 2.4 * (NU / 26), 0, Math.PI * 2);
      ctx.fillStyle = HOOK_RIVET; ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(x, y, 3.4 * (NU / 26), 0, Math.PI * 2);
      ctx.strokeStyle = HOOK_FREE; ctx.lineWidth = 1.6; ctx.stroke();
    }
  }

  // ---------- layout ----------
  function layout() {
    const p = params(lvl);
    const g = window.PLUMB.geometry(p, cfg);
    const spanN = Math.max(18, g.hi - g.lo + 4);
    const depthN = DROP_ROOT + STAGGER + DROP_SUB + HANG + 6.5;
    const availW = CW - 48, availH = CH - 150;
    NU = Math.max(8, Math.min(availW / spanN, availH / depthN));
    const cx = CW / 2 - ((g.lo + g.hi) / 2) * NU;
    const topY = 96 + (availH - depthN * NU) / 2;
    return { p, g, cx, topY };
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const r = canvas.getBoundingClientRect();
    const bW = Math.round((r.width || CW) * dpr), bH = Math.round((r.height || CH) * dpr);
    if (canvas.width !== bW) canvas.width = bW;
    if (canvas.height !== bH) canvas.height = bH;
    const sc = Math.min(bW / CW, bH / CH);
    ctx.setTransform(sc, 0, 0, sc, 0, 0);

    ctx.fillStyle = GROUND; ctx.fillRect(0, 0, CW, CH);
    if (!lvl) return;

    const { p, cx, topY } = layout();
    const t = tilts(lvl, cfg);
    const solved = window.PLUMB.isSolved(p, cfg);

    const rootY = topY + 1.2 * NU;
    // Ceiling bar. A functional horizontal, and the only true horizontal on
    // screen — the eye needs something to judge the root arm's tilt against.
    ctx.strokeStyle = CEIL; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 9.5 * NU, topY - 3.0 * NU); ctx.lineTo(cx + 9.5 * NU, topY - 3.0 * NU);
    ctx.stroke();
    drawString(cx, topY - 3.0 * NU, cx, rootY);

    // --- root arm
    const rootPts = armPoints(cx, rootY, lvl.notches.R * NU, t.root);
    strokeArm(rootPts, 1.9 * (NU / 26) * 1.4);
    const pR1 = notchPoint(cx, rootY, lvl.notches.R, t.root, cfg.r1);
    const pR2 = notchPoint(cx, rootY, lvl.notches.R, t.root, cfg.r2);

    // --- sub-arms L and B
    // The longer-reaching arm goes lower, so the two never fight for the same
    // band of the composition.
    const lDeeper = lvl.notches.L >= lvl.notches.B;
    const subYL = rootY + (DROP_ROOT + (lDeeper ? STAGGER : 0)) * NU;
    const subYB = rootY + (DROP_ROOT + (lDeeper ? 0 : STAGGER)) * NU;
    const lx = cx + cfg.r1 * NU, bx = cx + cfg.r2 * NU;
    drawString(pR1[0], pR1[1], lx, subYL);
    drawString(pR2[0], pR2[1], bx, subYB);

    const lPts = armPoints(lx, subYL, lvl.notches.L * NU, t.L);
    const bPts = armPoints(bx, subYB, lvl.notches.B * NU, t.B);
    strokeArm(lPts, 1.9 * (NU / 26) * 1.15);
    strokeArm(bPts, 1.9 * (NU / 26) * 1.15);

    const pL1 = notchPoint(lx, subYL, lvl.notches.L, t.L, cfg.l1);     // weight wL
    const pL2 = notchPoint(lx, subYL, lvl.notches.L, t.L, cfg.l2);     // bridge anchor 1
    const pB1 = notchPoint(bx, subYB, lvl.notches.B, t.B, p.b1);       // bridge anchor 2
    const pB2 = notchPoint(bx, subYB, lvl.notches.B, t.B, cfg.b2);     // weight wB

    // --- bridge, hanging from two strings, clear of BOTH sub-arms
    const bridgeY = Math.max(subYL, subYB) + DROP_SUB * NU;
    const bcx = cx + (cfg.r1 + cfg.l2 - cfg.t1) * NU;
    const pX1 = notchPoint(bcx, bridgeY, lvl.notches.X, 0, cfg.t1);
    const pX2 = notchPoint(bcx, bridgeY, lvl.notches.X, 0, cfg.t2);
    drawString(pL2[0], pL2[1], pX1[0], pX1[1], true);
    drawString(pB1[0], pB1[1], pX2[0], pX2[1], true);

    const xPts = armPoints(bcx, bridgeY, lvl.notches.X * NU, 0);
    strokeArm(xPts, 1.9 * (NU / 26) * 1.15);

    // --- weights, each hanging below its arm on a short drop
    const hang = (from, kind, col, w) => {
      const r = radiusOf(w);
      const y = from[1] + HANG * NU;
      drawString(from[0], from[1], from[0], y - r * 0.72);
      drawShape(kind, col, from[0], y + r * 0.18, r, 0);
    };
    hang(pL1, 0, TREE[0], p.wL);
    hang(pB2, 2, TREE[1], p.wB);
    const pXw1 = notchPoint(bcx, bridgeY, lvl.notches.X, 0, p.p1);
    const pXw2 = notchPoint(bcx, bridgeY, lvl.notches.X, 0, p.p2);
    hang(pXw1, 0, BRIDGE_W, p.wx1);
    hang(pXw2, 3, BRIDGE_W, p.wx2);

    // --- hooks last, so they sit on top of the wire
    drawHook(pR1[0], pR1[1], false); drawHook(pR2[0], pR2[1], false);
    drawHook(pL1[0], pL1[1], false); drawHook(pL2[0], pL2[1], false);
    drawHook(pB1[0], pB1[1], true);  drawHook(pB2[0], pB2[1], false);
    drawHook(pX1[0], pX1[1], false); drawHook(pX2[0], pX2[1], false);

    // --- HUD, kept clear of the sculpture
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff'; ctx.font = '800 26px Inter, sans-serif';
    ctx.fillText('PLUMB', 26, 22);
    ctx.font = '600 14px Inter, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillText('Level ' + (li + 1) + ' of ' + L.length + '   ·   ' +
      lvl.solutions.length + (lvl.solutions.length === 1 ? ' solution' : ' solutions'), 26, 54);
    ctx.textAlign = 'right';
    ctx.fillStyle = solved ? '#8FE3AE' : 'rgba(255,255,255,0.55)';
    ctx.font = '700 13px Inter, sans-serif';
    ctx.fillText(solved ? 'LEVEL · PLUMB' : 'static preview', CW - 26, 26);
    ctx.textAlign = 'left';
  }

  // ---------- boot ----------
  function setLevel(i, useSolution) {
    li = ((i % L.length) + L.length) % L.length;
    lvl = L[li];
    cfg = useSolution ? { ...lvl.solutions[0] } : { ...lvl.start };
    render();
  }
  function setCanvasVars() {
    if (isMobile()) { CW = window.innerWidth || 390; CH = window.innerHeight || 740; }
    else { CW = 940; CH = 660; }
    document.body.style.setProperty('--canvas-w', CW + 'px');
    document.body.style.setProperty('--canvas-h', CH + 'px');
  }
  window.addEventListener('resize', () => { setCanvasVars(); render(); });

  window.__plumb = {
    get state() {
      return {
        level: li + 1, of: L.length, solutions: lvl && lvl.solutions.length,
        solved: lvl ? window.PLUMB.isSolved(params(lvl), cfg) : null,
        cfg, NU: +NU.toFixed(1),
      };
    },
    show: (i, solved) => { setLevel(i, solved !== false); return window.__plumb.state; },
    solution: (i) => setLevel(i, true),
    start: (i) => setLevel(i, false),
    render,
  };

  setCanvasVars();
  if (!L.length) {
    ctx.fillStyle = GROUND; ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = '#fff'; ctx.font = '600 16px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('no baked levels — run node plumb/generate.js', CW / 2, CH / 2);
  } else {
    setLevel(0, true);
  }
})();
