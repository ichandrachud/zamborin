/* ============================================================
   PLUMB · renderer and interaction (brief §9 steps 3-4)

   Drives ANY topology through the general system, so the portrait phone shape
   and the desktop one share this file rather than needing a second renderer.

   ARMS ARE ARCS. Straight wire reads as an engineering drawing however thin it
   is. The bow costs the mechanic nothing because every pivot sits at its arm's
   centre: a symmetric arc is a rigid body, so rotating the arm by θ rotates the
   tip-to-tip chord by exactly θ, and the eye reads level off that chord.

   MOTION IN EXACTLY TWO PLACES (§6.5): the settle after a move, and the win.
   No idle sway — a real mobile drifts, and drift would make "level" impossible
   to judge, which is the one thing the player has to judge. And the resolve IS
   the settle: a mobile reaching balance swings less and less until it hangs
   still. Nothing is added on top of that. No flash, no particles, no sting.
   ============================================================ */
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const T = window.PLUMB_TOPO, C = window.PLUMB_COMPOSE, TOPOS = window.PLUMB_TOPOLOGIES;
  let CW = 940, CH = 660;

  const isMobile = () => matchMedia('(pointer: coarse)').matches ||
    (window.innerWidth > 0 && window.innerWidth < 768);
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- palette, every value measured on the house ground ----------
  const GROUND = '#0A1A2F';
  const WIRE = '#A8813F';          // brass 4.89:1 — separates by hue as well as
  const WIRE_FINE = '#8E6C34';     // lightness, which a blue wire cannot do here
  const CEIL = '#6F5A30';
  const TREE = ['#EFE9DC', '#DCC9A4', '#B2A899', '#8B93A0'];  // 14.5 / 10.8 / 7.5 / 5.6
  const BRIDGE_W = '#E85C3F';      // vermilion 5.02:1 — the one saturated accent
  const HAIRLINE = 'rgba(10,26,47,0.55)';
  const HOOK_FREE = '#EAF2FA', HOOK_RIVET = '#7FA3CC', NOTCH = '#5C7EA6';
  const HOOK_HELD = '#FFFFFF';
  // Gauge palette, measured on the ground: track 3.28:1 as a graphical object,
  // amber 9.28:1, green 11.46:1, labels 12.84:1.
  const TRACK = '#626C7A', OFF = '#E8B54D', MET = '#8FE3AE';
  const LABEL = 'rgba(255,255,255,0.86)', TUTOR = '#C9D4E2';

  // ---------- state ----------
  let topoName = 'reference', topo = null, pack = [];
  let li = 0, lvl = null, cfg = null, params = null;
  let NU = 26, boardTop = 0, boardCX = 0;
  let moves = 0, phase = 'play', history = [];
  let drag = null;                 // { id, arm, from, to }
  let touchedArm = null;           // whose notches are showing
  let anim = null, raf = 0;
  let uiButtons = [];

  const DROP = 3.0;                // vertical gap per row, in notches
  const HANG = 2.0;                // arm down to a weight's centre
  const SAG = 0.55;                // how far an arm's tips fall below its centre
  const MAXTILT = 0.20;            // radians, about 11.5 degrees
  const SETTLE_MS = 900;

  const radiusOf = (w) => NU * (0.40 + 0.22 * Math.pow(w, 0.75));
  const val = (k) => (typeof k === 'string' ? (cfg[k] !== undefined ? cfg[k] : params[k]) : k);

  // ---------- what the mobile currently looks like ----------
  // Tilt per arm from its own balance residual, and the bridge centre placed at
  // the midpoint of its two constraints so a wrong span splays BOTH strings
  // symmetrically rather than hanging one straight and bending the other.
  function evalNow(c) {
    const e = T.evaluate(topo, params, c || cfg);
    if (!e) return null;
    const tilt = {}, splay = {};
    for (const d of e.residuals) {
      if (d.kind === 'balance') {
        const v = d.r.n / d.r.d;
        const scale = 26 * Math.max(1, topo.arms[d.arm].H);
        let a = Math.max(-MAXTILT, Math.min(MAXTILT, v / scale));
        // The settle: swing from where the arm WAS toward where it now rests,
        // ringing and damping. When the move solves the mobile every target is
        // zero, so this damps to still — and that is the whole resolve.
        if (anim && anim.prev && anim.prev[d.arm] !== undefined) {
          const k = Math.min(1, (performance.now() - anim.t0) / SETTLE_MS);
          const ring = Math.exp(-4.2 * k) * Math.cos(11 * k);
          a = a + (anim.prev[d.arm] - a) * ring;
        }
        tilt[d.arm] = a;
      } else splay[d.bridge] = d.r.n;
    }
    const bcentre = {};
    for (const [name, B] of Object.entries(topo.bridges || {})) {
      const a = e.anchors[name];
      const c1 = a[0] - val(B.ties[0]), c2 = a[1] - val(B.ties[1]);
      bcentre[name] = (c1 + c2) / 2;
    }
    return { ...e, tilt, splay, bcentre };
  }
  const solvedNow = () => T.isSolved(topo, params, cfg);

  // Which specific arms are level, and how far each bridge string is out of
  // plumb. Read off the residuals rather than the drawn tilt, because the tilt
  // rings during the settle and would make a solved arm look wrong mid-swing.
  function verdicts() {
    const e = T.evaluate(topo, params, cfg);
    const level = {}, span = {};
    if (!e) return { level, span };
    for (const d of e.residuals) {
      if (d.kind === 'balance') level[d.arm] = d.r.n === 0;
      else span[d.bridge] = d.r.n;
    }
    return { level, span };
  }

  // Which specific arms are level, and how far each bridge string is out of
  // plumb. Read off the residuals rather than the drawn tilt, because the tilt
  // rings during the settle and would make a solved arm look wrong mid-swing.
  function verdicts() {
    const e = T.evaluate(topo, params, cfg);
    const level = {}, span = {};
    if (!e) return { level, span };
    for (const d of e.residuals) {
      if (d.kind === 'balance') level[d.arm] = d.r.n === 0;
      else span[d.bridge] = d.r.n;
    }
    return { level, span };
  }

  // How far off each of the two conditions is. Measured against the LEVEL'S OWN
  // START, so the bar begins full and empties as you close in — an absolute
  // scale would mean nothing to a player who cannot see the units.
  function gauges() {
    const sum = (e) => {
      let lev = 0, plumb = 0;
      if (!e) return { lev: Infinity, plumb: Infinity };
      for (const d of e.residuals) {
        const v = Math.abs(d.r.n / d.r.d);
        if (d.kind === 'balance') lev += v; else plumb += v;
      }
      return { lev, plumb };
    };
    const now = sum(T.evaluate(topo, params, cfg));
    const at0 = sum(T.evaluate(topo, params, lvl.start));
    const frac = (n, s0) => (n === 0 ? 0 : (s0 > 0 ? Math.min(1, n / s0) : 1));
    return [
      { key: 'LEVEL', help: 'every arm hanging flat', v: now.lev, f: frac(now.lev, at0.lev) },
      { key: 'PLUMB', help: 'every string hanging straight down', v: now.plumb, f: frac(now.plumb, at0.plumb) },
    ];
  }

  // ---------- layout ----------
  function layout() {
    const e = evalNow();
    if (!e) return null;
    const D = C.depths(topo);
    const spans = [];
    for (const [n, A] of Object.entries(topo.arms)) spans.push(e.x[n] - A.H, e.x[n] + A.H);
    for (const [n, B] of Object.entries(topo.bridges || {})) spans.push(e.bcentre[n] - B.H, e.bcentre[n] + B.H);
    const lo = Math.min(...spans), hi = Math.max(...spans);
    const maxDepth = Math.max(...Object.values(D.arms), ...Object.values(D.bridges));

    const spanN = Math.max(10, hi - lo + 3);
    const depthN = maxDepth * DROP + HANG + 4.5;
    const availW = CW - 36, availH = CH - (isMobile() ? 262 : 240);
    NU = Math.max(7, Math.min(availW / spanN, availH / depthN));
    boardCX = CW / 2 - ((lo + hi) / 2) * NU;
    boardTop = (isMobile() ? 132 : 118) + Math.max(0, (availH - depthN * NU) / 2);
    return { e, D, lo, hi };
  }
  const armY = (D, name) => boardTop + (D.arms[name] + 0.6) * DROP * NU;
  const bridgeY = (D, name) => boardTop + (D.bridges[name] + 0.6) * DROP * NU;

  // A point on an arm's arc. The arc is symmetric about the pivot, so it turns
  // rigidly with the arm and the notch positions stay faithful.
  function onArm(cx, cy, H, tilt, n) {
    const u = n / H, lx = u * H * NU, ly = SAG * NU * (u * u);
    return [cx + lx * Math.cos(tilt) - ly * Math.sin(tilt),
            cy + lx * Math.sin(tilt) + ly * Math.cos(tilt)];
  }

  // ---------- drawing ----------
  function shapePath(kind, x, y, r) {
    ctx.save(); ctx.translate(x, y); ctx.beginPath();
    if (kind === 0) {
      ctx.moveTo(0, -r * 1.25);
      ctx.bezierCurveTo(r * 0.95, -r * 0.35, r * 0.72, r * 0.85, 0, r * 1.12);
      ctx.bezierCurveTo(-r * 0.72, r * 0.85, -r * 0.95, -r * 0.35, 0, -r * 1.25);
    } else if (kind === 1) {
      ctx.arc(0, 0, r, Math.PI * 0.78, Math.PI * 2.22, false);
      ctx.bezierCurveTo(r * 0.30, r * 0.55, r * 0.30, -r * 0.55,
        Math.cos(Math.PI * 0.78) * r, Math.sin(Math.PI * 0.78) * r);
    } else if (kind === 2) {
      ctx.moveTo(-r * 0.95, -r * 0.15);
      ctx.bezierCurveTo(-r * 1.05, -r * 1.05, r * 1.05, -r * 1.05, r * 0.95, -r * 0.10);
      ctx.bezierCurveTo(r * 0.88, r * 0.85, r * 0.15, r * 0.55, 0, r * 0.42);
      ctx.bezierCurveTo(-r * 0.15, r * 0.55, -r * 0.88, r * 0.85, -r * 0.95, -r * 0.15);
    } else ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.closePath(); ctx.restore();
  }
  function drawShape(kind, col, x, y, r) {
    shapePath(kind, x, y, r);
    ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = HAIRLINE; ctx.lineWidth = Math.max(0.8, r * 0.045); ctx.stroke();
  }
  function drawArm(cx, cy, H, tilt, w) {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const p = onArm(cx, cy, H, tilt, -H + (2 * H * i) / 24);
      i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
    }
    ctx.strokeStyle = WIRE; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke();
  }
  function drawString(a, b, doubled) {
    ctx.strokeStyle = WIRE_FINE; ctx.lineWidth = 1.25; ctx.lineCap = 'round';
    if (!doubled) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); return; }
    // A bridge's strings are a doubled hairline pair — wire-like, but
    // unmistakably not an ordinary string. In an early prototype the bridge
    // read as just another arm, which is fatal in a game where that piece is
    // the entire reason there is a puzzle.
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * 1.7, ny = dx / len * 1.7;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(a[0] + nx * s, a[1] + ny * s); ctx.lineTo(b[0] + nx * s, b[1] + ny * s);
      ctx.stroke();
    }
  }
  function drawNotches(cx, cy, H, tilt, alpha) {
    if (alpha <= 0.01) return;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.strokeStyle = NOTCH; ctx.lineWidth = 1.4;
    for (let n = -H; n <= H; n++) {
      const p = onArm(cx, cy, H, tilt, n);
      ctx.beginPath();
      ctx.moveTo(p[0], p[1] - 2.5); ctx.lineTo(p[0], p[1] + 2.5);
      ctx.stroke();
    }
    ctx.restore();
  }
  // A movable hook has to LOOK movable at a glance. The old pair — a thin open
  // ring against a solid dot — differed too little, so the one thing you can
  // interact with did not announce itself.
  function drawHook(x, y, kind) {
    if (kind === 'rivet') {
      // Riveted: small, dim, deliberately recessive. Still 3:1 on the ground.
      ctx.beginPath(); ctx.arc(x, y, Math.max(2, NU * 0.075), 0, Math.PI * 2);
      ctx.fillStyle = HOOK_RIVET; ctx.fill();
      return;
    }
    const r = Math.max(4.5, NU * 0.185);
    const held = kind === 'held';
    // a dark seat first, so the ring reads against wire and shapes alike
    ctx.beginPath(); ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,26,47,0.85)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = held ? HOOK_HELD : HOOK_FREE;
    ctx.lineWidth = held ? 3 : 2.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, Math.max(1.4, r * 0.30), 0, Math.PI * 2);
    ctx.fillStyle = held ? HOOK_HELD : HOOK_FREE; ctx.fill();
  }

  // A spirit level on each beam. The bubble rides to the HIGH side, as a real
  // one does, so a tilted arm says which way it is tilted and by how much —
  // which a single gauge for the whole mobile could never do.
  function drawVial(cx, cy, tilt, level) {
    const w = Math.max(18, NU * 1.25), h = Math.max(7, NU * 0.32);
    const up = Math.max(9, NU * 0.62);
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(tilt); ctx.translate(0, -up);
    ctx.fillStyle = 'rgba(10,26,47,0.9)';
    roundRect(-w / 2, -h / 2, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = TRACK; ctx.lineWidth = 1.2;
    roundRect(-w / 2, -h / 2, w, h, h / 2); ctx.stroke();
    // the two centre marks a real vial has
    ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 1;
    for (const sx of [-h * 0.55, h * 0.55]) {
      ctx.beginPath(); ctx.moveTo(sx, -h / 2); ctx.lineTo(sx, h / 2); ctx.stroke();
    }
    const br = h * 0.34;
    const range = w / 2 - br - 1.5;
    const off = Math.max(-1, Math.min(1, -tilt / MAXTILT)) * range;
    ctx.beginPath(); ctx.arc(off, 0, br, 0, Math.PI * 2);
    ctx.fillStyle = level ? MET : OFF; ctx.fill();
    ctx.restore();
  }

  // A plumb line beside each bridge string: a dotted TRUE vertical dropped from
  // the anchor. The string is plumb when it lies along it, and the gap between
  // them at the bottom is exactly the error.
  function drawPlumbLine(ax, ay, by, off) {
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = off === 0 ? 'rgba(143,227,174,0.55)' : OFF;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax, by); ctx.stroke();
    ctx.setLineDash([]);
    if (off !== 0) {
      // a tick at the foot showing how far out of plumb it is
      ctx.strokeStyle = OFF; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(ax, by); ctx.lineTo(ax + off, by); ctx.stroke();
    }
    ctx.restore();
  }

  // Where every hook sits on screen right now. One place computes this, so
  // hit-testing and drawing can never disagree about where a hook is.
  function hookPoints(lay) {
    const { e, D } = lay, out = [];
    for (const [name, A] of Object.entries(topo.arms)) {
      const cx = boardCX + e.x[name] * NU, cy = armY(D, name), tl = e.tilt[name] || 0;
      for (const h of A.hooks) {
        const free = params[h.id] === undefined;
        const p = onArm(cx, cy, A.H, tl, val(h.id));
        out.push({ id: h.id, arm: name, H: A.H, cx, cy, tilt: tl, x: p[0], y: p[1], free, carries: h.carries });
      }
    }
    for (const [name, B] of Object.entries(topo.bridges || {})) {
      const cx = boardCX + e.bcentre[name] * NU, cy = bridgeY(D, name);
      for (const t of B.ties) {
        const free = params[t] === undefined;
        const p = onArm(cx, cy, B.H, 0, val(t));
        // A tie and a weight may legitimately share a notch. Lift the tie clear
        // so they read as two marks rather than one — the generator no longer
        // throws such levels away, because doing so cost 17x the yield.
        const clash = B.weights.some(w => val(w.at) === val(t));
        out.push({ id: t, arm: name, H: B.H, cx, cy, tilt: 0,
                   x: p[0], y: p[1] - (clash ? Math.max(5, NU * 0.30) : 0),
                   free, tie: true, bridge: name });
      }
    }
    return out;
  }

  function render() {
    uiButtons = [];
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

    const lay = layout();
    if (!lay) return;
    const { e, D } = lay;
    const hooks = hookPoints(lay);
    const solved = solvedNow();

    // Ceiling bar: a functional horizontal, and deliberately the only one on
    // screen. The player judges the root arm's tilt against it, so a second
    // strong horizontal would compete and §3.4's median-rank-4 result depends
    // on that read staying easy.
    const rootY = armY(D, topo.root), rootX = boardCX + e.x[topo.root] * NU;
    ctx.strokeStyle = CEIL; ctx.lineWidth = 2;
    const bar = Math.max(6, topo.arms[topo.root].H * 1.5) * NU;
    ctx.beginPath();
    ctx.moveTo(rootX - bar / 2, boardTop - NU * 1.1); ctx.lineTo(rootX + bar / 2, boardTop - NU * 1.1);
    ctx.stroke();
    drawString([rootX, boardTop - NU * 1.1], [rootX, rootY]);

    // strings from each hook down to whatever hangs off it
    for (const h of hooks) {
      if (h.tie) continue;
      if (h.carries.arm !== undefined) {
        const ch = h.carries.arm;
        drawString([h.x, h.y], [boardCX + e.x[ch] * NU, armY(D, ch)]);
      } else if (h.carries.bridge !== undefined) {
        const B = topo.bridges[h.carries.bridge];
        const bx = boardCX + e.bcentre[h.carries.bridge] * NU;
        const tp = onArm(bx, bridgeY(D, h.carries.bridge), B.H, 0, val(B.ties[h.carries.end]));
        drawPlumbLine(h.x, h.y, tp[1], Math.round(tp[0] - h.x));
        drawString([h.x, h.y], tp, true);
      }
    }

    // arms, then bridges
    const notchAlpha = (name) => {
      if (li < 2) return 0.55;                     // discoverable on the first two levels
      return touchedArm === name ? 0.75 : 0;
    };
    const V = verdicts();
    for (const [name, A] of Object.entries(topo.arms)) {
      const cx = boardCX + e.x[name] * NU, cy = armY(D, name);
      drawNotches(cx, cy, A.H, e.tilt[name] || 0, notchAlpha(name));
      drawArm(cx, cy, A.H, e.tilt[name] || 0, Math.max(1.4, NU * 0.075));
      drawVial(cx, cy, e.tilt[name] || 0, !!V.level[name]);
    }
    for (const [name, B] of Object.entries(topo.bridges || {})) {
      const cx = boardCX + e.bcentre[name] * NU, cy = bridgeY(D, name);
      drawNotches(cx, cy, B.H, 0, notchAlpha(name));
      drawArm(cx, cy, B.H, 0, Math.max(1.4, NU * 0.075));
      drawVial(cx, cy, 0, !!V.level[name]);
    }

    // weights, each on a short drop below its arm
    let treeIdx = 0;
    const hang = (from, kind, col, w) => {
      const rr = radiusOf(w), y = from[1] + HANG * NU;
      drawString(from, [from[0], y - rr * 0.72]);
      drawShape(kind, col, from[0], y + rr * 0.18, rr);
    };
    for (const h of hooks) {
      if (h.tie || h.carries.weight === undefined) continue;
      hang([h.x, h.y], treeIdx % 4, TREE[treeIdx % TREE.length], val(h.carries.weight));
      treeIdx++;
    }
    for (const [name, B] of Object.entries(topo.bridges || {})) {
      const cx = boardCX + e.bcentre[name] * NU, cy = bridgeY(D, name);
      B.weights.forEach((w, i) => hang(onArm(cx, cy, B.H, 0, val(w.at)), i === 0 ? 0 : 3, BRIDGE_W, val(w.w)));
    }

    // hooks last, on top of the wire
    for (const h of hooks)
      drawHook(h.x, h.y, drag && drag.id === h.id ? 'held' : (h.free ? 'free' : 'rivet'));

    drawHUD(solved);
  }

  function drawHUD(solved) {
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff'; ctx.font = '800 26px Inter, sans-serif';
    ctx.fillText('PLUMB', 26, 22);

    // No aggregate gauge here any more. Every beam carries its own spirit
    // level and every bridge string its own plumb line, which says WHICH one is
    // off — a single bar for the whole mobile never could.
    ctx.font = '600 14px Inter, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillText('Level ' + (li + 1) + '   ·   ' + moves + (moves === 1 ? ' move' : ' moves'), 26, 54);
    // The win reads in the HUD, never over the mobile. These compositions are
    // quiet and a badge landing on a shape stops the thing looking like one.
    if (solved) {
      ctx.fillStyle = MET; ctx.font = '800 14px Inter, sans-serif';
      ctx.fillText('IN BALANCE', 26, 78);
    }
    // The brief wants both conditions learned wordlessly. On first contact a
    // real player asked outright what the goal was, so the opening levels say
    // it plainly and then stop.
    const TUTORIAL = [
      'Drag the bright rings. Centre every bubble to get each arm hanging flat.',
      'Also: every string must hang straight down. Watch the dotted plumb lines.',
      'The red piece hangs from two branches — it decides what each side carries.',
    ];
    if (li < TUTORIAL.length && !solved) {
      ctx.textAlign = 'center'; ctx.fillStyle = TUTOR;
      ctx.font = '500 ' + (isMobile() ? 15 : 16) + 'px Inter, sans-serif';
      ctx.fillText(TUTORIAL[li], CW / 2, CH - 86);
      ctx.textAlign = 'left';
    }

    // Controls sit outside the sculpture. These compositions are quiet; a badge
    // floating over the mobile would stop it looking like one.
    ctx.textAlign = 'center';
    const cy = CH - 42, gap = 10;
    const row = [['Undo', 'undo', !history.length, undo],
                 ['Restart', 'restart', false, () => start(li)]];
    if (phase === 'won') row.push(['Next mobile', 'next', false, () => start(li + 1)]);
    ctx.font = '700 14px Inter, sans-serif';
    let total = 0;
    for (const [t] of row) total += Math.round(ctx.measureText(t).width + 34) + gap;
    total -= gap;
    let x = Math.round(CW / 2 - total / 2);
    for (const [t, id, dim, act] of row) {
      const w = Math.round(ctx.measureText(t).width + 34), h = 36;
      const bx = x, by = Math.round(cy - h / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; roundRect(bx, by, w, h, h / 2); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.42)'; roundRect(bx, by, w, h, h / 2); ctx.stroke();
      ctx.fillStyle = dim ? 'rgba(255,255,255,0.58)' : 'rgba(255,255,255,0.92)';
      ctx.textBaseline = 'middle'; ctx.fillText(t, bx + w / 2, by + h / 2 + 1); ctx.textBaseline = 'top';
      if (!dim) uiButtons.push({ x: bx, y: by, w, h, id, act });
      x += w + gap;
    }
    // The win says nothing about HOW it was won. Level and plumb are both
    // visual conditions and the brief is explicit that neither is ever stated.
    ctx.textAlign = 'left';
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- the settle ----------
  // A damped swing toward the new rest position. When the move solves the
  // mobile the target tilts are all zero, so the settle simply damps to still —
  // which IS the resolve. Nothing extra is layered on top of it.
  function startSettle(prev) {
    if (REDUCED) { render(); return; }
    anim = { t0: performance.now(), prev: prev || null };
    if (!raf) raf = requestAnimationFrame(tick);
  }
  // The tilts as they stand right now, before a move is committed.
  function tiltsNow() {
    const save = anim; anim = null;
    const e = evalNow();
    anim = save;
    return e ? { ...e.tilt } : null;
  }
  function tick(now) {
    raf = 0;
    if (anim) {
      const k = (now - anim.t0) / SETTLE_MS;
      if (k >= 1) anim = null;
    }
    render();
    if (anim) raf = requestAnimationFrame(tick);
  }
  // ---------- input ----------
  function toLocal(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * (CW / r.width), y: (ev.clientY - r.top) * (CH / r.height) };
  }
  function pickHook(x, y) {
    const lay = layout(); if (!lay) return null;
    let best = null, bestD = Math.max(26, NU * 1.1);
    for (const h of hookPoints(lay)) {
      if (!h.free) continue;
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bestD) { bestD = d; best = h; }
    }
    return best;
  }
  // Project the pointer onto the arm's own axis to get a notch index.
  function notchUnder(h, x, y) {
    const dx = x - h.cx, dy = y - h.cy;
    const along = dx * Math.cos(h.tilt) + dy * Math.sin(h.tilt);
    return Math.max(-h.H, Math.min(h.H, Math.round(along / NU)));
  }

  canvas.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    const { x, y } = toLocal(ev);
    for (const b of uiButtons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.act(); return; }
    if (phase === 'won') return;
    const h = pickHook(x, y);
    if (!h) return;
    drag = { id: h.id, arm: h.arm, from: val(h.id) };
    touchedArm = h.arm;
    canvas.setPointerCapture(ev.pointerId);
    render();
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const { x, y } = toLocal(ev);
    const lay = layout(); if (!lay) return;
    const h = hookPoints(lay).find(z => z.id === drag.id);
    if (!h) return;
    const n = notchUnder(h, x, y);
    if (n !== cfg[drag.id]) {
      const prev = cfg[drag.id];
      cfg[drag.id] = n;
      // A move that makes the strings push is not physical; refuse it rather
      // than drawing a mobile that cannot exist.
      if (!T.evaluate(topo, params, cfg)) cfg[drag.id] = prev;
      render();
    }
  });
  function endDrag() {
    if (!drag) return;
    const moved = cfg[drag.id] !== drag.from;
    const was = moved ? (cfg[drag.id] = cfg[drag.id], swingFrom(drag)) : null;
    if (moved) {
      history.push({ id: drag.id, from: drag.from });
      moves++;
      if (solvedNow() && phase === 'play') phase = 'won';
    }
    drag = null; touchedArm = null;
    startSettle(was);
  }
  // The tilts the mobile held at the old hook position — the pose it swings FROM.
  function swingFrom(d) {
    const now = cfg[d.id];
    cfg[d.id] = d.from;
    const t = tiltsNow();
    cfg[d.id] = now;
    return t;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', () => {
    if (drag) { cfg[drag.id] = drag.from; drag = null; touchedArm = null; render(); }
  });

  function undo() {
    if (!history.length || phase === 'won') return;
    const h = history.pop();
    const was = tiltsNow();
    cfg[h.id] = h.from; moves++;
    startSettle(was);
  }

  // ---------- boot ----------
  function start(n) {
    pack = (window.PLUMB_PACKS || {})[topoName] || [];
    if (!pack.length) return;
    li = ((n % pack.length) + pack.length) % pack.length;
    lvl = pack[li];
    params = { ...lvl.params };
    cfg = { ...lvl.start };
    moves = 0; history = []; phase = 'play'; drag = null; touchedArm = null; anim = null;
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
      return { topology: topoName, level: li + 1, of: pack.length, moves, phase,
               solved: lvl ? solvedNow() : null, cfg: { ...cfg } };
    },
    get hooks() { const l = layout(); return l ? hookPoints(l).map(h => ({ id: h.id, arm: h.arm, free: h.free, x: Math.round(h.x), y: Math.round(h.y), at: val(h.id) })) : []; },
    get buttons() { render(); return uiButtons.map(b => ({ id: b.id, cx: b.x + b.w / 2, cy: b.y + b.h / 2 })); },
    press(id) { render(); const b = uiButtons.find(z => z.id === id); if (!b) return 'no button ' + id; b.act(); return this.state; },
    move(id, n) { cfg[id] = n; if (solvedNow() && phase === 'play') phase = 'won'; render(); return this.state; },
    apply(s) { cfg = { ...s }; if (solvedNow() && phase === 'play') phase = 'won'; render(); return this.state; },
    solve() { return this.apply(lvl.solutions[0]); },
    goto(n) { start(n - 1); return this.state; },
    use(name) { topoName = name; topo = TOPOS[name.toUpperCase()]; start(0); return this.state; },
    render,
  };

  setCanvasVars();
  topoName = isMobile() ? 'deep' : 'reference';
  topo = TOPOS[topoName.toUpperCase()];
  if (!((window.PLUMB_PACKS || {})[topoName] || []).length) {
    ctx.fillStyle = GROUND; ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = '#fff'; ctx.font = '600 16px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('no baked levels — run node plumb/generate.js ' + topoName, CW / 2, CH / 2);
  } else start(0);
})();
