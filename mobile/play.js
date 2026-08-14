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
    else { LW = 470; LH = 760; }
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
    AREA_K = (2.6 * 2.6) / Math.max(1, heaviest);
  }
  const shapeOf = (i) => SHAPES[i % Math.max(1, SHAPES.length)];
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
    ctx.fillStyle = sh.colour; ctx.fill();
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
    const CONTROLS = 58;                 // the pill row
    const TRAY = 92;                     // the shelf of spare shapes
    const TOP = 62;                      // under the title
    trayY = LH - CONTROLS - TRAY;
    const availW = LW - 34, availH = trayY - TOP - 18;

    // Solve for the unit by trying them, because a shape's radius scales with
    // the unit too, so the bounds are not linear in it and dividing once gives
    // the wrong answer.
    unit = 9;
    for (let u = 34; u >= 9; u--) {
      const b = bounds(u);
      if (b.w <= availW && b.h <= availH) { unit = u; break; }
    }
    const at = bounds(unit);
    anchorX = Math.round(LW / 2 - at.midx);
    anchorY = Math.round(TOP + Math.max(6, (availH - at.h) / 2));
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
      phase = 'won'; settledAt = t; snd.win();
    }
    wasSettled = settled;
    raf = requestAnimationFrame(frame);
  }

  function render(t) {
    uiButtons = [];
    ctx.fillStyle = '#FCFCFB'; ctx.fillRect(0, 0, LW, LH);

    const s = scene();
    drawSculpture(s);
    drawTray();
    if (held) drawHeld();
    drawHUD();
    drawControls();
    if (phase === 'menu') drawRules();
    if (phase === 'won') drawWin();
  }

  function drawSculpture(s) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = WIRE; ctx.lineWidth = WIRE_W;

    // the wire it all hangs from
    ctx.beginPath(); ctx.moveTo(anchorX, 6); ctx.lineTo(anchorX, anchorY); ctx.stroke();

    const joint = Math.max(1.6, unit * 0.11);
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
      ctx.beginPath(); ctx.arc(r.lx, r.ly, joint, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(r.rx, r.ry, joint, 0, 7); ctx.fill();
      ctx.fillStyle = PIVOT;
      ctx.beginPath(); ctx.arc(r.x, r.y, joint * 2, 0, 7); ctx.fill();
    }
    // the one it all hangs from is bigger and softer
    if (s.rods.length) {
      ctx.fillStyle = TOP_PIVOT;
      ctx.beginPath(); ctx.arc(s.rods[0].x, s.rods[0].y, joint * 2.9, 0, 7); ctx.fill();
    }

    for (const id of board.hooks) {
      const p = s.hooks[id];
      if (on[id] == null) {
        ctx.strokeStyle = 'rgba(147,147,147,0.85)'; ctx.lineWidth = WIRE_W;
        ctx.beginPath(); ctx.arc(p.x, p.y + unit * 0.42, Math.max(3.5, unit * 0.24), 0, 7); ctx.stroke();
        uiButtons.push({ x: p.x - unit, y: p.y - unit * 0.3, w: unit * 2, h: unit * 2, hook: id });
      } else {
        const i = on[id], w = board.shapes[i];
        drawHanging(i, w, p.x, p.y);
        const rr = shapeR(i, w);
        uiButtons.push({ x: p.x - rr, y: p.y, w: rr * 2, h: rr * 2.2, hook: id, take: i });
      }
    }
  }

  function drawTray() {
    ctx.strokeStyle = 'rgba(26,26,30,0.14)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(18, trayY); ctx.lineTo(LW - 18, trayY); ctx.stroke();
    const spare = board.shapes.map((w, i) => i).filter(i => !Object.values(on).includes(i));
    if (!spare.length) return;
    const gapW = (LW - 44) / spare.length;
    spare.forEach((i, k) => {
      const w = board.shapes[i], R = shapeR(i, w);
      const cx = 22 + gapW * (k + 0.5), cy = trayY + 46;
      if (held && held.i === i) return;
      const sh = shapePath(i, w, cx, cy);
      if (sh) { ctx.fillStyle = sh.colour; ctx.fill(); }
      uiButtons.push({ x: cx - R, y: cy - R, w: R * 2, h: R * 2.2, tray: i });
    });
  }

  function drawHeld() {
    const sh = shapePath(held.i, board.shapes[held.i], held.x, held.y);
    if (!sh) return;
    ctx.save(); ctx.globalAlpha = 0.92; ctx.fillStyle = sh.colour; ctx.fill(); ctx.restore();
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

  function panel(title, sub, lines, btn, act) {
    ctx.fillStyle = 'rgba(250,249,245,0.94)'; ctx.fillRect(0, 0, LW, LH);
    const pw = Math.min(LW - 40, 380), px = (LW - pw) / 2;
    let y = Math.max(40, LH * 0.22);
    ctx.textAlign = 'center';
    ctx.fillStyle = INK; ctx.font = '800 30px Inter, sans-serif';
    ctx.fillText(title, LW / 2, y); y += 42;
    ctx.fillStyle = 'rgba(26,26,30,0.72)'; ctx.font = '600 15px Inter, sans-serif';
    ctx.fillText(sub, LW / 2, y); y += 32;
    ctx.textAlign = 'left'; ctx.font = '500 14px Inter, sans-serif';
    ctx.fillStyle = 'rgba(26,26,30,0.88)';
    for (const line of lines) {
      const words = line.split(' '); let ln = '';
      for (const w of words) {
        const tt = ln ? ln + ' ' + w : w;
        if (ctx.measureText(tt).width > pw - 20 && ln) { ctx.fillText(ln, px + 10, y); y += 20; ln = w; }
        else ln = tt;
      }
      if (ln) { ctx.fillText(ln, px + 10, y); y += 20; }
      y += 10;
    }
    const bw = 170, bh = 44, bx = LW / 2 - bw / 2;
    ctx.fillStyle = '#D8332A';
    ctx.beginPath(); ctx.roundRect(bx, y + 6, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '800 15px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(btn, LW / 2, y + 6 + bh / 2 + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    uiButtons.push({ x: bx, y: y + 6, w: bw, h: bh, act });
  }
  const drawRules = () => panel('MOBILE', 'Hang it so it sits level.', [
    'Drag a shape from the tray onto any empty string. Drag it off again to put it back.',
    'The bigger the shape, the heavier it is. There is no other clue, so trust your eye.',
    'A rod leans toward whichever side is heavier. Watch it swing and settle before you decide.',
    'It is level when nothing is leaning. There is exactly one right answer.',
  ], 'BEGIN', () => { phase = 'play'; });
  const drawWin = () => panel('LEVEL', 'It hangs true.',
    ['Every rod balanced, and nothing left over.'], 'NEXT', () => start(level + 1));

  // ---------- interaction ----------
  function start(n) {
    level = Math.max(1, Math.min(PACK.length, n)); saveLevel();
    board = PACK[level - 1];
    on = {}; held = null; rods = {}; phase = 'play'; wasSettled = false;
    setShapeScale();
    forEachRod(board.tree, (nd) => rods[nd.id] = { a: 0, w: 0 });
    layout();
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
      if (b.take != null) { held = { i: b.take, x, y, from: b.hook }; delete on[b.hook]; snd.lift(); nudge(); e.preventDefault(); return; }
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
    if (best && bestD < unit * 2.2) { on[best] = held.i; snd.hang(); }
    else if (held.from != null && bestD >= unit * 2.2) snd.drop();
    held = null; nudge();
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
    goto: (n) => start(n), levels: PACK.length,
    get buttons() { render(0); return uiButtons.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h, hook: b.hook, tray: b.tray })); },
  };

  // ---------- boot ----------
  setCanvasVars(); resizeCanvas(); fitFullscreen(); resizeCanvas();
  start(loadLevel());
  phase = 'menu';
  raf = requestAnimationFrame(frame);
  setTimeout(onResize, 0); setTimeout(onResize, 300);
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
})();
