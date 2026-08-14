/* ============================================================
   MOBILE · a Zamborin Game

   A Calder mobile, hanging from a hook. Rods pivot at fixed points, and from
   each end hangs another rod or an empty string. Below is a tray of shapes.
   The area of a shape is its weight. Hang them so the whole thing sits level.

   THIS IS NOT A PUZZLE AND IS NOT TRYING TO BE. It was nearly abandoned for
   failing a deduction gate — a solver with exact weights walks it downhill
   every time. But the design withholds those weights: the shapes are irregular,
   and a piece 20% heavier is only about 9% wider. Measured against people
   instead of solvers, at seven hooks a careful player succeeds 75% of the time
   and a careless one 40%, and an unrealistically good eye adds nothing over an
   ordinary attentive one. The skill is patience, not acuity. See
   mobile/craft.js.

   WHICH IS WHY THE SETTLING IS SLOW. It is not friction to make guessing
   expensive. Watching a mobile find its level IS the game. Everything sways
   together, because every rod carries whatever hangs beneath it.
   ============================================================ */
(() => {
  'use strict';

  const M = window.MOBILE_MODEL;
  const PACK = window.MOBILE_PACK || [];
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let LW = 390, LH = 844;

  // Every value here is read off mobile/references/mobile.svg rather than
  // chosen. The wires are a hairline grey, not black, and there is a hierarchy
  // of joints: a big soft one where the whole thing hangs, a firm black one at
  // each rod's pivot, and a small grey one at each rod end.
  const INK = '#231F20';
  const WIRE = '#939393', WIRE_W = 0.9;      // hairline, at any size
  const PIVOT = '#231F20', JOINT = '#414042', TOP_PIVOT = '#565656';
  const SHAPES = window.MOBILE_SHAPES || [];
  // The forms arrive as silhouettes, so colour is the game's to give. These are
  // the fills from the reference file plus the orange and black Calder reached
  // for constantly.
  const PALETTE = ['#E4E41F', '#E41F1F', '#546AE7', '#8FD7F1', '#952478',
                   '#5DCF37', '#FFA200', '#F6134C', '#231F20', '#414042'];
  const TRAY_BG = '#FFFFFF', NEXT_RED = '#FF0000';

  // ---------- sound ----------
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zamborin-mobile.sound' }) : null;
  const snd = {
    on: () => !!(sfx && sfx.isOn()),
    ready() { if (sfx) sfx.ensureAudio(); },
    toggle() { if (!sfx) return; sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.tone(880, 0.05, 0.03, 'sine'); },
    lift() { if (sfx) sfx.tone(660, 0.04, 0.012, 'sine'); },
    hang() { if (sfx) { sfx.tone(392, 0.09, 0.020, 'sine'); sfx.noise(0.03, 2400, 1.4, 0.007); } },
    drop() { if (sfx) sfx.tone(294, 0.07, 0.016, 'sine'); },
    settle() { if (sfx) sfx.tone(523.25, 0.14, 0.018, 'sine'); },
    win() { if (sfx) sfx.arpeggio(392, 0.13, 3); },
  };

  // ---------- MODE + CANVAS ----------
  const MODE = (matchMedia('(pointer: coarse)').matches || window.innerWidth < 768) ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);
  function setCanvasVars() {
    if (MODE === 'mobile') { LW = window.innerWidth || 390; LH = window.innerHeight || 844; }
    // A narrower card than the rest of the shelf uses, on purpose. These
    // sculptures are taller than they are wide, so on the usual 470x760 they go
    // height-bound and fill barely half the width, leaving the sides bare.
    // 400x760 is close to a phone's proportions and they fill it.
    else { LW = 400; LH = 760; }
    document.body.style.setProperty('--canvas-w', LW + 'px');
    document.body.style.setProperty('--canvas-h', LH + 'px');
  }
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const r = canvas.getBoundingClientRect();
    const bW = Math.round((r.width || LW) * dpr), bH = Math.round((r.height || LH) * dpr);
    if (canvas.width !== bW) canvas.width = bW;
    if (canvas.height !== bH) canvas.height = bH;
    const s = Math.min(bW / LW, bH / LH);
    ctx.setTransform(s, 0, 0, s, 0, 0);
  }
  const wrap = canvas.parentElement;
  function fitFullscreen() {
    if (MODE === 'mobile') { wrap.style.width = window.innerWidth + 'px'; wrap.style.height = window.innerHeight + 'px'; return; }
    const on = document.body.classList.contains('focus-mode');
    if (!on) { wrap.style.width = ''; wrap.style.height = ''; return; }
    const vw = window.innerWidth, vh = window.innerHeight, a = LW / LH;
    let cw = vw, ch = Math.round(vw / a);
    if (ch > vh) { ch = vh; cw = Math.round(vh * a); }
    wrap.style.width = cw + 'px'; wrap.style.height = ch + 'px';
  }
  function onResize() { if (MODE === 'mobile') setCanvasVars(); fitFullscreen(); resizeCanvas(); layout(); }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', onResize);

  // ---------- state ----------
  let board = null, level = 1, phase = 'play', uiButtons = [], raf = 0;
  let on = {};                 // hook id -> shape index
  let held = null;             // { i, x, y, from }
  let rods = {};               // rod id -> { a, w }  angle and angular velocity
  let unit = 24, anchorX = 195, anchorY = 90, trayY = 700;
  let settledAt = -1e9, wasSettled = false, lastT = 0;
  const LS = 'zamborin-mobile.level';
  const saveLevel = () => { try { localStorage.setItem(LS, String(level)); } catch (e) {} };
  const loadLevel = () => { try { const v = parseInt(localStorage.getItem(LS), 10); return (v >= 1 && v <= 999) ? v : 1; } catch (e) { return 1; } };

  // ---------- shapes ----------
  // Lifted from the Illustrator reference, normalised to unit area. Scaling by
  // sqrt(weight) means the drawn area IS the weight, exactly, which is the only
  // rule the game has. They are deliberate forms with flat tops and swelling
  // bottoms, not noise: a wobble generated from harmonics looked hand-drawn in
  // the wrong sense.
  // The weights are arbitrary numbers — only their RATIOS mean anything — so
  // the scale is set per level from the heaviest piece, and the shapes then
  // sit at the same proportion to the sculpture whatever the numbers happen to
  // be. Measured off the reference: the biggest shape is about a seventh of the
  // top rod's span, which is much bolder than a fixed constant was giving.
  let AREA_K = 0.085;
  function setShapeScale() {
    const heaviest = Math.max(...board.shapes);
    // In the mockups the biggest shape is about half the span of the rod it
    // hangs from, never as wide as one. 2.6 was letting a heavy piece rival its
    // own rod, which reads as clumsy.
    AREA_K = (2.05 * 2.05) / Math.max(1, heaviest);
  }
  // Each piece on a board gets its own form and colour, fixed for that level, so
  // a sculpture never repeats a silhouette if it can help it.
  let formOf = [], tintOf = [];
  function dealLooks() {
    const n = board.shapes.length;
    let seed = (board.level * 2654435761) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const forms = SHAPES.map((_, i) => i), tints = PALETTE.map((_, i) => i);
    for (const arr of [forms, tints])
      for (let i = arr.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [arr[i], arr[j]] = [arr[j], arr[i]]; }
    formOf = []; tintOf = [];
    for (let i = 0; i < n; i++) { formOf.push(forms[i % forms.length]); tintOf.push(tints[i % tints.length]); }
  }
  const shapeOf = (i) => SHAPES[formOf[i] != null ? formOf[i] : i % Math.max(1, SHAPES.length)];
  const tint = (i) => PALETTE[tintOf[i] != null ? tintOf[i] : i % PALETTE.length];
  const shapeK = (i, w) => Math.sqrt(w * AREA_K) * unit;
  // how far the centroid sits below the point the string meets
  function shapeDrop(i, w) { const sh = shapeOf(i); return sh ? -sh.top * shapeK(i, w) : 0; }
  function shapeR(i, w) { const sh = shapeOf(i); return sh ? Math.abs(sh.top) * shapeK(i, w) : shapeK(i, w); }

  function shapePath(i, w, cx, cy) {
    const sh = shapeOf(i);
    if (!sh) return null;
    const k = shapeK(i, w);
    ctx.beginPath();
    for (let n = 0; n < sh.pts.length; n++) {
      const x = cx + sh.pts[n][0] * k, y = cy + sh.pts[n][1] * k;
      n ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    return sh;
  }
  // Draw a shape hanging from (hx, hy): its topmost point meets the string, and
  // the string carries on into it and stops, which is what the reference does.
  function drawHanging(i, w, hx, hy, alpha) {
    const sh = shapeOf(i);
    if (!sh) return;
    const cy = hy + shapeDrop(i, w);
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    shapePath(i, w, hx, cy);
    ctx.fillStyle = tint(i); ctx.fill();
    ctx.strokeStyle = WIRE; ctx.lineWidth = WIRE_W;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx, cy); ctx.stroke();
    ctx.restore();
  }

  // ---------- geometry ----------
  const weightAt = (id) => (on[id] != null ? board.shapes[on[id]] : 0);
  function totalUnder(node) {
    if (node.hook) return weightAt(node.id);
    return totalUnder(node.left) + totalUnder(node.right);
  }
  // Where everything is, given the current rod angles. Strings hang vertically
  // whatever the rod above is doing, which is what strings do.
  function place(node, x, y, out) {
    if (node.hook) { out.hooks[node.id] = { x, y }; return out; }
    const a = (rods[node.id] || { a: 0 }).a;
    const lx = x - node.L * unit * Math.cos(a), ly = y - node.L * unit * Math.sin(a);
    const rx = x + node.R * unit * Math.cos(a), ry = y + node.R * unit * Math.sin(a);
    out.rods.push({ node, x, y, lx, ly, rx, ry, a });
    place(node.left, lx, ly + node.dropL * unit, out);
    place(node.right, rx, ry + node.dropR * unit, out);
    return out;
  }
  const scene = () => place(board.tree, anchorX, anchorY, { hooks: {}, rods: [] });

  // The sculpture's true bounds at a given unit, at rest, including the shapes
  // hanging off it. Everything about fitting it on screen comes from this.
  function bounds(u) {
    const save = unit; unit = u;
    const zero = {}; forEachRod(board.tree, (n) => zero[n.id] = { a: 0, w: 0 });
    const keep = rods; rods = zero;
    const sc = place(board.tree, 0, 0, { hooks: {}, rods: [] });
    rods = keep;
    const biggest = Math.max(...board.shapes);
    const xs = [], ys = [0];
    for (const r of sc.rods) { xs.push(r.lx, r.rx); ys.push(r.y); }
    for (const id in sc.hooks) {
      const rr = shapeR(0, biggest);
      xs.push(sc.hooks[id].x - rr, sc.hooks[id].x + rr);
      ys.push(sc.hooks[id].y + rr * 2.2);
    }
    unit = save;
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    return { w: x1 - x0, h: Math.max(...ys), midx: (x0 + x1) / 2 };
  }

  function layout() {
    if (!board) return;
    // Everything here is a fraction of the mockups, which are 393x852:
    // the tray is a white panel filling the bottom 156 of 852, and the
    // sculpture has the whole of the rest.
    // In the mockups the hanging wire runs from the top edge down to about 95
    // of 852 before the first rod. Starting the sculpture at 24 put its top rod
    // hard against the edge with no wire to hang from.
    const TRAY_F = 156 / 852, TOP_F = 95 / 852;
    trayY = Math.round(LH * (1 - TRAY_F));
    const top = Math.round(LH * TOP_F);
    const availW = LW - 20;
    const availH = (phase === 'won' ? LH * 0.88 : trayY - 14) - top;

    unit = 6;
    for (let u = 40; u >= 6; u--) {
      const b = bounds(u);
      if (b.w <= availW && b.h <= availH) { unit = u; break; }
    }
    const at = bounds(unit);
    anchorX = Math.round(LW / 2 - at.midx);
    anchorY = Math.round(top + Math.max(0, (availH - at.h) * 0.34));
  }

  function forEachRod(node, fn) { if (node.hook) return; fn(node); forEachRod(node.left, fn); forEachRod(node.right, fn); }

  // ---------- physics ----------
  // A rod hangs level when the torques match. Off balance it leans, by an
  // amount that saturates so a wildly wrong rod does not spin. It springs
  // toward that lean and is damped, so hanging a shape sets the whole thing
  // swaying and it takes a few seconds to say what it thinks.
  const MAX_LEAN = 0.30, K = 9, C = 2.2;
  function step(dt) {
    forEachRod(board.tree, (node) => {
      const r = rods[node.id] || (rods[node.id] = { a: 0, w: 0 });
      const wl = totalUnder(node.left), wr = totalUnder(node.right);
      const err = wl * node.L - wr * node.R;
      const scale = Math.max(1, (wl * node.L + wr * node.R) * 0.5);
      const target = -MAX_LEAN * Math.tanh(err / scale);   // left heavy leans left down
      r.w += (-K * (r.a - target) - C * r.w) * dt;
      r.a += r.w * dt;
    });
  }
  const stillMoving = () => Object.values(rods).some(r => Math.abs(r.w) > 0.0015);
  const allHung = () => board.hooks.every(h => on[h] != null);
  function levelNow() {
    const at = {}; board.hooks.forEach(h => at[h] = weightAt(h));
    return allHung() && M.totalError(board.tree, at) === 0;
  }

  // ---------- render ----------
  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
    if (board && phase !== 'menu') step(dt);
    render(t);
    // the moment it stops swaying AND it is right
    const settled = !stillMoving();
    if (settled && !wasSettled && levelNow() && phase === 'play') {
      phase = 'won'; settledAt = t; snd.win(); layout();
    }
    wasSettled = settled;
    raf = requestAnimationFrame(frame);
  }

  function render(t) {
    uiButtons = [];
    // The mockups carry no title, no counter and no buttons. The sculpture is
    // the whole interface, and the only thing that ever appears is one red pill
    // when the level is done.
    const g2 = ctx.createLinearGradient(LW, 0, LW / 2, LH);
    g2.addColorStop(0, '#EAEAEA'); g2.addColorStop(1, '#FFFFFF');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, LW, LH);

    const s = scene();
    if (phase !== 'won') drawTray();
    drawSculpture(s);
    if (held) drawHeld();
    if (phase === 'won') drawNext();
  }

  function drawSculpture(s) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = WIRE; ctx.lineWidth = WIRE_W;

    // the wire it all hangs from
    ctx.beginPath(); ctx.moveTo(anchorX, 6); ctx.lineTo(anchorX, anchorY); ctx.stroke();

    // Measured off the mockups: the dots are 2, 3, 4, 5 and 6 pixels ACROSS on
    // a 393-wide frame, and they do not grow with the sculpture. Scaling them by
    // the unit made them twice the size and cost most of the delicacy.
    const F = LW / 393;
    const rEnd = 1.4 * F, rPivot = 2.2 * F, rTop = 3.0 * F;
    for (const r of s.rods) {
      // A rod is a long shallow arc, bowed upward. In the reference the bow is
      // about a tenth of the span, which is what keeps it from reading as a
      // bent stick.
      const span = Math.hypot(r.rx - r.lx, r.ry - r.ly);
      const mx = (r.lx + r.rx) / 2, my = (r.ly + r.ry) / 2;
      ctx.strokeStyle = WIRE; ctx.lineWidth = WIRE_W;
      ctx.beginPath();
      ctx.moveTo(r.lx, r.ly);
      ctx.quadraticCurveTo(mx, my - span * 0.11, r.rx, r.ry);
      ctx.stroke();
      // the strings down to whatever hangs from each end
      ctx.beginPath();
      ctx.moveTo(r.lx, r.ly); ctx.lineTo(r.lx, r.ly + r.node.dropL * unit);
      ctx.moveTo(r.rx, r.ry); ctx.lineTo(r.rx, r.ry + r.node.dropR * unit);
      ctx.stroke();
      // small grey joints at the ends, a firm black pivot in the middle
      ctx.fillStyle = JOINT;
      ctx.beginPath(); ctx.arc(r.lx, r.ly, rEnd, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(r.rx, r.ry, rEnd, 0, 7); ctx.fill();
      ctx.fillStyle = PIVOT;
      ctx.beginPath(); ctx.arc(r.x, r.y, rPivot, 0, 7); ctx.fill();
    }
    // the one it all hangs from is bigger and softer
    if (s.rods.length) {
      ctx.fillStyle = TOP_PIVOT;
      ctx.beginPath(); ctx.arc(s.rods[0].x, s.rods[0].y, rTop, 0, 7); ctx.fill();
    }

    for (const id of board.hooks) {
      const p = s.hooks[id];
      if (on[id] == null) {
        ctx.strokeStyle = 'rgba(147,147,147,0.85)'; ctx.lineWidth = WIRE_W;
        ctx.beginPath(); ctx.arc(p.x, p.y + unit * 0.34, 4.2 * F, 0, 7); ctx.stroke();
        uiButtons.push({ x: p.x - unit, y: p.y - unit * 0.3, w: unit * 2, h: unit * 2, hook: id });
      } else {
        const i = on[id], w = board.shapes[i];
        drawHanging(i, w, p.x, p.y);
        const rr = shapeR(i, w);
        uiButtons.push({ x: p.x - rr, y: p.y, w: rr * 2, h: rr * 2.2, hook: id, take: i });
      }
    }
  }

  // A white shelf across the bottom, with the spare pieces tumbled onto it
  // rather than lined up. Evenly spaced they looked like a specimen drawer;
  // the mockups have them jostling, which is what a box of parts looks like.
  let trayAt = {};
  function packTray() {
    trayAt = {};
    const spare = board.shapes.map((w, i) => i).filter(i => !Object.values(on).includes(i));
    if (!spare.length) return;
    const pad = 10, top = trayY + 10, bot = LH - 12;
    let seed = ((board.level + 1) * 40503) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

    // seed them across the shelf, biggest first
    const order = spare.slice().sort((a, b) => board.shapes[b] - board.shapes[a]);
    const items = order.map((i, k) => ({
      i, r: shapeR(i, board.shapes[i]),
      x: pad + ((k + 0.5) / order.length) * (LW - pad * 2) + (rnd() - 0.5) * 30,
      y: top + (bot - top) * (0.28 + 0.44 * rnd()),
    }));

    // then push them apart. Random placement alone left the middle of the shelf
    // in a heap while the ends sat empty; a few relaxation passes spread them
    // out while keeping the jumbled look the mockups have.
    for (let pass = 0; pass < 60; pass++) {
      for (let a = 0; a < items.length; a++) {
        for (let b = a + 1; b < items.length; b++) {
          const p1 = items[a], p2 = items[b];
          const need = (p1.r + p2.r) * 0.92;
          let dx = p2.x - p1.x, dy = p2.y - p1.y;
          let d = Math.hypot(dx, dy) || 0.01;
          if (d >= need) continue;
          const push = (need - d) / 2 / d;
          dx *= push; dy *= push;
          p1.x -= dx; p1.y -= dy; p2.x += dx; p2.y += dy;
        }
      }
      for (const p of items) {
        p.x = Math.max(pad + p.r, Math.min(LW - pad - p.r, p.x));
        p.y = Math.max(top + p.r * 0.7, Math.min(bot - p.r * 0.7, p.y));
      }
    }
    // Clamp once more at the end. The relaxation runs after the clamp inside the
    // loop, so the last push could still nudge a piece over the edge of the
    // shelf, and one in forty did.
    for (const p of items) {
      p.x = Math.max(p.r * 0.55, Math.min(LW - p.r * 0.55, p.x));
      p.y = Math.max(trayY + p.r * 0.55, Math.min(LH - p.r * 0.55, p.y));
      trayAt[p.i] = p;
    }
  }

  function drawTray() {
    ctx.fillStyle = TRAY_BG;
    ctx.fillRect(0, trayY, LW, LH - trayY);
    for (const key in trayAt) {
      const i = +key;
      if (held && held.i === i) continue;
      if (on[board.hooks.find(h => on[h] === i)] != null) continue;
      const p = trayAt[i];
      const sh = shapePath(i, board.shapes[i], p.x, p.y);
      if (sh) { ctx.fillStyle = tint(i); ctx.fill(); }
      uiButtons.push({ x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2, tray: i });
    }
  }

  function drawHeld() {
    const sh = shapePath(held.i, board.shapes[held.i], held.x, held.y);
    if (!sh) return;
    ctx.save(); ctx.globalAlpha = 0.92; ctx.fillStyle = tint(held.i); ctx.fill(); ctx.restore();
  }

  function drawHUD() {
    const hs = Math.max(0.72, Math.min(1, LW / 430));
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = INK; ctx.font = '800 ' + Math.round(22 * hs) + 'px Inter, sans-serif';
    ctx.fillText('MOBILE ' + level, 20, 18);
    const hung = board.hooks.filter(h => on[h] != null).length;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(26,26,30,0.9)'; ctx.font = '600 ' + Math.round(13 * hs) + 'px Inter, sans-serif';
    ctx.fillText(hung + ' of ' + board.hooks.length + ' hung', LW - 20, 24);
    ctx.textAlign = 'left';
  }

  function pill(label, px, py, dim, act) {
    ctx.font = '700 13px Inter, sans-serif';
    const w = Math.round(ctx.measureText(label).width + 26), h = 34;
    const x = Math.round(px), y = Math.round(py - h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = 'rgba(26,26,30,0.3)'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.fillStyle = dim ? 'rgba(26,26,30,0.34)' : INK;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (!dim) uiButtons.push({ x, y, w, h, act });
    return w;
  }
  function drawControls() {
    const y = LH - 29, gap = 8;
    ctx.font = '700 13px Inter, sans-serif';
    const items = [['Clear', () => { on = {}; phase = 'play'; }, !Object.keys(on).length],
                   ['Rules', () => { phase = 'menu'; }, false],
                   ['Next', () => start(level + 1), false]];
    let total = 36 + gap;
    items.forEach(([l]) => total += Math.round(ctx.measureText(l).width + 26) + gap);
    total -= gap;
    let x = Math.round(LW / 2 - total / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.roundRect(x, y - 17, 36, 34, 17); ctx.fill();
    ctx.strokeStyle = 'rgba(26,26,30,0.3)'; ctx.lineWidth = 1.3; ctx.stroke();
    const sOn = snd.on(), sx = x + 18;
    ctx.fillStyle = sOn ? INK : 'rgba(26,26,30,0.34)';
    ctx.beginPath(); ctx.moveTo(sx - 7, y - 3); ctx.lineTo(sx - 3, y - 3); ctx.lineTo(sx + 2, y - 8);
    ctx.lineTo(sx + 2, y + 8); ctx.lineTo(sx - 3, y + 3); ctx.lineTo(sx - 7, y + 3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.4;
    if (sOn) { ctx.beginPath(); ctx.arc(sx + 4, y, 5, -0.9, 0.9); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(sx + 5, y - 4); ctx.lineTo(sx + 11, y + 4); ctx.moveTo(sx + 11, y - 4); ctx.lineTo(sx + 5, y + 4); ctx.stroke(); }
    uiButtons.push({ x, y: y - 17, w: 36, h: 34, act: () => { snd.ready(); snd.toggle(); } });
    x += 36 + gap;
    items.forEach(([l, a, dim]) => { x += pill(l, x, y, dim, a) + gap; });
  }

  // There was a rules panel here. The mockups have no text anywhere on the
  // screen and the game does not need any: a tray of shapes, empty rings on
  // strings, and something that tips when you get it wrong explains itself.
  // The written instructions live on the page below the canvas.

  // 89 x 30, radius 15, #FF0000, sitting at 788 of 852. No label above it: the
  // sculpture hanging straight is the message.
  function drawNext() {
    const w = Math.round(LW * (89 / 393)), h = Math.round(LH * (30 / 852));
    const x = Math.round((LW - w) / 2), y = Math.round(LH * (788 / 852));
    ctx.fillStyle = NEXT_RED;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 ' + Math.round(h * 0.42) + 'px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('NEXT', x + w / 2, y + h / 2 + 0.5);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    uiButtons.push({ x: x - 12, y: y - 12, w: w + 24, h: h + 24, act: () => start(level + 1) });
  }

  // ---------- interaction ----------
  function start(n) {
    level = Math.max(1, Math.min(PACK.length, n)); saveLevel();
    board = PACK[level - 1];
    on = {}; held = null; rods = {}; phase = 'play'; wasSettled = false;
    setShapeScale(); dealLooks();
    forEachRod(board.tree, (nd) => rods[nd.id] = { a: 0, w: 0 });
    layout(); packTray();
  }
  function nudge() { for (const id in rods) rods[id].w += (Math.random() - 0.5) * 1.2; }

  function pick(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (LW / r.width), y: (e.clientY - r.top) * (LH / r.height) };
  }
  canvas.addEventListener('pointerdown', (e) => {
    snd.ready();
    const { x, y } = pick(e);
    for (let i = uiButtons.length - 1; i >= 0; i--) {
      const b = uiButtons[i];
      if (!(x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)) continue;
      if (b.act) { e.preventDefault(); b.act(); return; }
      if (phase !== 'play') return;
      if (b.tray != null) { held = { i: b.tray, x, y, from: null }; snd.lift(); e.preventDefault(); return; }
      if (b.take != null) { held = { i: b.take, x, y, from: b.hook }; delete on[b.hook]; snd.lift(); packTray(); nudge(); e.preventDefault(); return; }
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!held) return;
    const p = pick(e); held.x = p.x; held.y = p.y;
  });
  function release() {
    if (!held) return;
    // nearest empty string, if the shape was let go near one
    let best = null, bestD = Infinity;
    const s = scene();
    for (const id of board.hooks) {
      if (on[id] != null) continue;
      const p = s.hooks[id];
      const d = Math.hypot(p.x - held.x, p.y + unit * 0.6 - held.y);
      if (d < bestD) { bestD = d; best = id; }
    }
    if (best && bestD < unit * 2.6) { on[best] = held.i; snd.hang(); }
    else if (held.from != null) snd.drop();
    held = null; packTray(); nudge();
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'n') start(level + 1);
    if (e.key === 'r') start(level);
  });

  // ---------- debug ----------
  window.__mobile = {
    get state() {
      const at = {}; board.hooks.forEach(h => at[h] = weightAt(h));
      return { level, hooks: board.hooks.length, shapes: board.shapes.length,
               hung: board.hooks.filter(h => on[h] != null).length,
               error: M.totalError(board.tree, at), level_: levelNow(), phase,
               moving: stillMoving(), need: board.need, tray: board.shapes };
    },
    get geom() { return { LW, LH, unit, anchorX, anchorY, trayY, mode: MODE, bounds: bounds(unit) }; },
    get angles() { return Object.fromEntries(Object.entries(rods).map(([k, v]) => [k, +v.a.toFixed(3)])); },
    hang(hookIdx, shapeIdx) { on[board.hooks[hookIdx]] = shapeIdx; nudge(); },
    solveNow() {
      const pool = board.shapes.map((w, i) => ({ w, i }));
      board.hooks.forEach((h, k) => {
        const want = board.need[k];
        const f = pool.findIndex(p => p.w === want);
        if (f >= 0) { on[h] = pool[f].i; pool.splice(f, 1); }
      });
      nudge();
      return __mobile.state;
    },
    settle(ms) { for (let t = 0; t < ms; t += 16) step(0.016); return __mobile.angles; },
    // the win flips inside the animation loop, which a hidden tab throttles to
    // nothing, so this is how the finished state gets looked at
    forceWin() { for (let t = 0; t < 15000; t += 16) step(0.016); phase = 'won'; layout(); render(0); return phase; },
    goto: (n) => start(n), levels: PACK.length,
    get buttons() { render(0); return uiButtons.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h, hook: b.hook, tray: b.tray })); },
  };

  // ---------- boot ----------
  setCanvasVars(); resizeCanvas(); fitFullscreen(); resizeCanvas();
  start(loadLevel());
  raf = requestAnimationFrame(frame);
  setTimeout(onResize, 0); setTimeout(onResize, 300);
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
})();
