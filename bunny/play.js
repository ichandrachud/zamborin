/* ============================================================
   BUNNY · a Zamborin Game

   A reconstruction of a game the user built for iPhone in 2016, since lost.

   Slide the studded bricks. The rabbit walks whatever region of open baseplate
   it can reach, pacing back and forth; so does every predator. Join the
   rabbit's region to the carrot's and it eats. Join it to a predator's and it
   does not.

   THE PACING IS THE INTERFACE. It looks like idle animation and it is actually
   the whole HUD: the connectivity of the board, drawing itself, continuously.
   Nobody has to trace a corridor by eye or hold reachability in their head,
   because the animals walk it for them. That is why this game needs no legend
   and no tutorial, and it is the reason it got built ahead of two other games
   that measured well and read badly.

   Everything else follows from one flood fill. See model.js for the rules and
   lint.js for what makes a level worth shipping.
   ============================================================ */
(() => {
  'use strict';

  const M = window.BUNNY_MODEL;
  const PACK = window.BUNNY_PACK || [];
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let LW = 390, LH = 844;

  // Four worlds, exactly as the original had them: the brick colour, the bare
  // baseplate showing through, what the fixed obstacle is, and who hunts you.
  const THEMES = {
    garden: { brick: '#2FA24E', lo: '#1E7A38', plate: '#14582A', back1: '#8FD46A', back2: '#4FAE4C', fixed: 'wall',    hunter: 'fox' },
    sea:    { brick: '#2E7CC4', lo: '#1F5B96', plate: '#173F6B', back1: '#7FC0EC', back2: '#3F86C8', fixed: 'rock',    hunter: 'shark' },
    road:   { brick: '#E3C020', lo: '#B79612', plate: '#4A4A4A', back1: '#BFBFBF', back2: '#8A8A8A', fixed: 'cone',    hunter: 'car' },
    ice:    { brick: '#4FA8DC', lo: '#3782B4', plate: '#245C82', back1: '#BFE4F5', back2: '#77BEDF', fixed: 'iceberg', hunter: 'penguin' },
  };
  let TH = THEMES.garden;

  // ---------- sound ----------
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zamborin-bunny.sound' }) : null;
  const snd = {
    on: () => !!(sfx && sfx.isOn()),
    ready() { if (sfx) sfx.ensureAudio(); },
    toggle() { if (!sfx) return; sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.tone(880, 0.05, 0.03, 'sine'); },
    slide() { if (sfx) { sfx.noise(0.05, 1800, 1.2, 0.016); sfx.tone(220, 0.05, 0.014, 'square'); } },
    blocked() { if (sfx) sfx.tone(120, 0.07, 0.016, 'square'); },
    boom() { if (sfx) { sfx.noise(0.22, 700, 0.7, 0.040); sfx.tone(90, 0.24, 0.030, 'sine'); } },
    win() { if (sfx) sfx.arpeggio(523.25, 0.10, 2); },
    dead() { if (sfx) { sfx.tone(180, 0.30, 0.034, 'sawtooth'); sfx.tone(120, 0.36, 0.028, 'sine'); } },
    undo() { if (sfx) sfx.tone(392, 0.08, 0.020, 'sine'); },
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
  function onResize() { if (MODE === 'mobile') setCanvasVars(); fitFullscreen(); resizeCanvas(); layout(); render(); }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', onResize);

  // ---------- state ----------
  let board = null, level = 1, moves = 0, phase = 'play';
  let history = [], uiButtons = [], raf = 0;
  let patrols = [];                 // one per walking thing: { path, kind, tint }
  let drag = null, boomAt = -1e9;
  const LS = 'zamborin-bunny.level';
  const saveLevel = () => { try { localStorage.setItem(LS, String(level)); } catch (e) {} };
  const loadLevel = () => { try { const v = parseInt(localStorage.getItem(LS), 10); return (v >= 1 && v <= 999) ? v : 1; } catch (e) { return 1; } };

  // ---------- layout ----------
  const TOP_BAND = 84, BOT_BAND = 92;
  let cell = 48, gridX = 20, gridY = 110;
  function layout() {
    if (!board) return;
    const availW = LW - 28, availH = LH - TOP_BAND - BOT_BAND - 16;
    cell = Math.max(26, Math.floor(Math.min(availW / board.W, availH / board.H)));
    gridX = Math.round((LW - cell * board.W) / 2);
    gridY = Math.round(TOP_BAND + 8 + (availH - cell * board.H) / 2);
  }
  const cx = (c) => gridX + cell * (c + 0.5);
  const cy = (r) => gridY + cell * (r + 0.5);
  const colOf = (i) => i % board.W, rowOf = (i) => (i / board.W) | 0;

  // ---------- the patrols ----------
  // For each walking thing, the path from where it stands to the furthest cell
  // it can reach. Animating out and back traces the whole extent of its region,
  // which is the only reason anybody can read this board at a glance.
  function patrolFrom(start) {
    const solid = M.solidSet(board);
    if (solid.has(start)) return [start];
    const prev = new Map([[start, -1]]);
    const q = [start];
    let last = start;
    for (let h = 0; h < q.length; h++) {
      const i = q[h]; last = i;
      const c = colOf(i), r = rowOf(i);
      for (const [dc, dr] of M.DIRS) {
        const c2 = c + dc, r2 = r + dr;
        if (c2 < 0 || c2 >= board.W || r2 < 0 || r2 >= board.H) continue;
        const j = r2 * board.W + c2;
        if (solid.has(j) || prev.has(j)) continue;
        prev.set(j, i); q.push(j);
      }
    }
    const path = [];
    for (let i = last; i !== -1; i = prev.get(i)) path.push(i);
    path.reverse();
    return path;
  }
  function rebuildPatrols() {
    patrols = [{ path: patrolFrom(board.rabbit), kind: 'rabbit' }];
    for (const f of board.foxes) patrols.push({ path: patrolFrom(f), kind: TH.hunter });
  }
  // Where a walker is right now: out along its path, then back, forever, with a
  // pause at each end.
  //
  // This is deliberately slow. The pacing is not an idle animation, it is the
  // board telling you what is joined to what, and at the first speed it was
  // over before you had finished reading it. An animal that ambles and then
  // stops to look around gives you time to take in how far it got, which is the
  // entire point of it walking at all.
  const STEP = 900, DWELL = 700;         // ms per cell, ms paused at each end
  function walkerAt(p, now) {
    const n = p.path.length;
    if (n < 2) return { i: p.path[0], t: 0, facing: 1 };
    const span = n - 1, walk = span * STEP, cycle = 2 * walk + 2 * DWELL;
    const u = now % cycle;
    let s, facing;
    if (u < walk) { s = u / STEP; facing = 1; }
    else if (u < walk + DWELL) { s = span; facing = 1; }
    else if (u < 2 * walk + DWELL) { s = span - (u - walk - DWELL) / STEP; facing = -1; }
    else { s = 0; facing = -1; }
    const a = Math.min(span, Math.floor(s)), b = Math.min(span, a + 1);
    return { i: p.path[a], j: p.path[b], t: s - a, facing };
  }

  // ---------- render ----------
  function render(now) {
    now = now || performance.now();
    uiButtons = [];
    drawBack();
    drawPlate();
    drawBricks(now);
    drawWalkers(now);
    drawHUD();
    drawControls();
    if (phase === 'menu') drawRules();
    if (phase === 'won') drawWin();
    if (phase === 'dead') drawDead();
  }

  function drawBack() {
    const g = ctx.createLinearGradient(0, 0, LW, LH);
    g.addColorStop(0, TH.back1); g.addColorStop(1, TH.back2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
    ctx.globalAlpha = 0.12; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(LW * 0.18, LH * 0.16, LW * 0.42, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(LW * 0.88, LH * 0.74, LW * 0.36, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Bare baseplate. Everything alive stands on this, and it is deliberately the
  // darkest thing on screen so open space reads as open.
  function drawPlate() {
    ctx.fillStyle = TH.plate;
    ctx.fillRect(gridX, gridY, cell * board.W, cell * board.H);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(gridX - 1, gridY - 1, cell * board.W + 2, cell * board.H + 2);
  }

  function studs(x, y, w, h, col, lo) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.roundRect(x + 1, y + 1, w - 2, h - 2, Math.max(3, cell * 0.10)); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath(); ctx.roundRect(x + 1, y + h - Math.max(3, h * 0.10), w - 2, Math.max(3, h * 0.10), 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.roundRect(x + 2, y + 2, w - 4, Math.max(2, h * 0.07), 2); ctx.fill();
    // the studs, which are the entire reason anyone can tell this piece moves
    const rr = Math.max(2.5, cell * 0.13);
    for (let sy = y + cell * 0.5; sy < y + h; sy += cell)
      for (let sx = x + cell * 0.5; sx < x + w; sx += cell) {
        ctx.fillStyle = lo; ctx.beginPath(); ctx.arc(sx, sy + 1, rr, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.arc(sx, sy - 0.5, rr, 0, 7); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, sy, rr * 0.82, 0, 7); ctx.fill();
      }
  }

  function drawBricks(now) {
    for (const k of board.bricks) {
      const cs = k.cells.map(colOf), rs = k.cells.map(rowOf);
      const c0 = Math.min(...cs), r0 = Math.min(...rs);
      const w = (Math.max(...cs) - c0 + 1) * cell, h = (Math.max(...rs) - r0 + 1) * cell;
      let x = gridX + c0 * cell, y = gridY + r0 * cell;
      if (drag && drag.ki === board.bricks.indexOf(k)) { x += drag.ox; y += drag.oy; }
      studs(x, y, w, h, k.bomb ? '#3A3A42' : TH.brick, k.bomb ? '#22222A' : TH.lo);
      if (k.bomb) drawBomb(x + w / 2, y + h / 2);
    }
    // fixed objects: no studs, different material, and that is the only thing
    // telling you they will not budge
    for (const i of board.fixed) drawFixed(cx(colOf(i)), cy(rowOf(i)));
    // the carrot sits on bare plate like everything else alive
    drawCarrot(cx(colOf(board.carrot)), cy(rowOf(board.carrot)));
    if (now - boomAt < 420) drawBoom(now - boomAt);
  }

  function drawWalkers(now) {
    for (const p of patrols) {
      const w = walkerAt(p, now);
      const ax = cx(colOf(w.i)), ay = cy(rowOf(w.i));
      const bx = w.j == null ? ax : cx(colOf(w.j)), by = w.j == null ? ay : cy(rowOf(w.j));
      const e = w.t * w.t * (3 - 2 * w.t);
      const x = ax + (bx - ax) * e, y = ay + (by - ay) * e;
      const hop = Math.abs(Math.sin(e * Math.PI)) * cell * 0.10;
      if (p.kind === 'rabbit') drawRabbit(x, y - hop, bx >= ax ? 1 : -1);
      else drawHunter(x, y - hop * 0.4, bx >= ax ? 1 : -1, p.kind);
    }
  }

  // ---------- the cast ----------
  function drawRabbit(x, y, dir) {
    const s = cell * 0.40;
    ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(0, s * 0.92, s * 0.72, s * 0.18, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#F6F2F4';
    ctx.beginPath(); ctx.ellipse(-s * 0.10, s * 0.28, s * 0.66, s * 0.56, 0, 0, 7); ctx.fill();   // body
    ctx.beginPath(); ctx.ellipse(s * 0.62, s * 0.62, s * 0.24, s * 0.16, 0, 0, 7); ctx.fill();     // tail
    ctx.beginPath(); ctx.arc(s * 0.30, -s * 0.34, s * 0.44, 0, 7); ctx.fill();                     // head
    for (const dx of [-0.06, 0.30]) {                                                              // ears
      ctx.save(); ctx.translate(s * (0.24 + dx), -s * 0.72); ctx.rotate(dx * 1.1);
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.13, s * 0.42, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#EFC0CE';
      ctx.beginPath(); ctx.ellipse(0, s * 0.04, s * 0.06, s * 0.28, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#F6F2F4'; ctx.restore();
    }
    ctx.fillStyle = '#22202A';
    ctx.beginPath(); ctx.arc(s * 0.50, -s * 0.38, s * 0.10, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.16, -s * 0.38, s * 0.10, 0, 7); ctx.fill();
    ctx.fillStyle = '#E39AAE';
    ctx.beginPath(); ctx.arc(s * 0.36, -s * 0.16, s * 0.07, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawHunter(x, y, dir, kind) {
    const s = cell * 0.42;
    ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.beginPath(); ctx.ellipse(0, s * 0.90, s * 0.76, s * 0.18, 0, 0, 7); ctx.fill();
    const body = kind === 'fox' ? '#E4571F' : kind === 'shark' ? '#2C3340'
               : kind === 'car' ? '#3B3F46' : '#1D2027';
    ctx.fillStyle = body;
    if (kind === 'car') {
      ctx.beginPath(); ctx.roundRect(-s * 0.72, -s * 0.10, s * 1.44, s * 0.92, s * 0.16); ctx.fill();
      ctx.beginPath(); ctx.roundRect(-s * 0.46, -s * 0.62, s * 0.92, s * 0.60, s * 0.14); ctx.fill();
      ctx.fillStyle = '#C9D3DB';
      ctx.beginPath(); ctx.roundRect(-s * 0.36, -s * 0.52, s * 0.72, s * 0.38, s * 0.08); ctx.fill();
      ctx.fillStyle = '#F2D24B';
      ctx.beginPath(); ctx.arc(-s * 0.54, s * 0.30, s * 0.13, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.54, s * 0.30, s * 0.13, 0, 7); ctx.fill();
      ctx.restore(); return;
    }
    // animals: a body, a head, and a tail or fin that says which one
    ctx.beginPath(); ctx.ellipse(-s * 0.08, s * 0.26, s * 0.66, s * 0.48, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.42, -s * 0.14, s * 0.40, 0, 7); ctx.fill();
    if (kind === 'fox') {
      ctx.beginPath(); ctx.moveTo(s * 0.20, -s * 0.42); ctx.lineTo(s * 0.30, -s * 0.92); ctx.lineTo(s * 0.52, -s * 0.44); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s * 0.56, -s * 0.44); ctx.lineTo(s * 0.76, -s * 0.86); ctx.lineTo(s * 0.80, -s * 0.34); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-s * 0.74, s * 0.18, s * 0.34, s * 0.20, -0.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#F7F2EC';
      ctx.beginPath(); ctx.ellipse(-s * 0.94, s * 0.02, s * 0.16, s * 0.12, -0.5, 0, 7); ctx.fill();
    } else if (kind === 'shark') {
      ctx.beginPath(); ctx.moveTo(-s * 0.10, -s * 0.30); ctx.lineTo(s * 0.06, -s * 0.96); ctx.lineTo(s * 0.36, -s * 0.34); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * 0.62, s * 0.20); ctx.lineTo(-s * 1.02, -s * 0.16); ctx.lineTo(-s * 1.00, s * 0.62); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#F4F6F8';
      ctx.beginPath(); ctx.ellipse(s * 0.52, s * 0.04, s * 0.28, s * 0.10, 0.1, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = '#F7F7F5';
      ctx.beginPath(); ctx.ellipse(-s * 0.02, s * 0.32, s * 0.40, s * 0.36, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#F0A32A';
      ctx.beginPath(); ctx.moveTo(s * 0.68, -s * 0.10); ctx.lineTo(s * 1.02, s * 0.00); ctx.lineTo(s * 0.68, s * 0.10); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#FFF';
    ctx.beginPath(); ctx.arc(s * 0.52, -s * 0.22, s * 0.15, 0, 7); ctx.fill();
    ctx.fillStyle = '#15161C';
    ctx.beginPath(); ctx.arc(s * 0.56, -s * 0.22, s * 0.08, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawCarrot(x, y) {
    const s = cell * 0.36;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#E8821E';
    ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.55); ctx.lineTo(s * 0.5, -s * 0.2);
    ctx.lineTo(-s * 0.15, s * 0.95); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(1, s * 0.09);
    for (let n = 0; n < 3; n++) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.34 + n * s * 0.26, -s * 0.34 + n * s * 0.28);
      ctx.lineTo(-s * 0.14 + n * s * 0.26, -s * 0.14 + n * s * 0.24);
      ctx.stroke();
    }
    ctx.fillStyle = '#3FA23C';
    for (const a of [-0.9, -0.4, 0.1]) {
      ctx.save(); ctx.translate(-s * 0.36, -s * 0.62); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(0, -s * 0.28, s * 0.14, s * 0.34, 0, 0, 7); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawFixed(x, y) {
    const s = cell * 0.46;
    ctx.save(); ctx.translate(x, y);
    if (TH.fixed === 'wall') {
      ctx.fillStyle = '#B0342A';
      ctx.beginPath(); ctx.roundRect(-s, -s, s * 2, s * 2, 3); ctx.fill();
      ctx.strokeStyle = '#EBD9B8'; ctx.lineWidth = Math.max(1.4, s * 0.11);
      for (let n = -1; n <= 1; n++) { ctx.beginPath(); ctx.moveTo(-s, n * s * 0.66); ctx.lineTo(s, n * s * 0.66); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(0, -s * 0.66); ctx.lineTo(0, 0); ctx.moveTo(-s * 0.5, 0); ctx.lineTo(-s * 0.5, s * 0.66);
      ctx.moveTo(s * 0.5, 0); ctx.lineTo(s * 0.5, s * 0.66); ctx.stroke();
    } else if (TH.fixed === 'cone') {
      ctx.fillStyle = '#3A3A3A';
      ctx.beginPath(); ctx.roundRect(-s * 0.8, s * 0.6, s * 1.6, s * 0.32, 3); ctx.fill();
      ctx.fillStyle = '#EE6B1F';
      ctx.beginPath(); ctx.moveTo(0, -s * 0.9); ctx.lineTo(s * 0.62, s * 0.62); ctx.lineTo(-s * 0.62, s * 0.62); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#F7F3EE';
      ctx.beginPath(); ctx.moveTo(-s * 0.30, -s * 0.10); ctx.lineTo(s * 0.30, -s * 0.10); ctx.lineTo(s * 0.40, s * 0.16); ctx.lineTo(-s * 0.40, s * 0.16); ctx.closePath(); ctx.fill();
    } else if (TH.fixed === 'iceberg') {
      ctx.fillStyle = '#EAF6FD';
      ctx.beginPath(); ctx.moveTo(-s * 0.9, s * 0.8); ctx.lineTo(-s * 0.4, -s * 0.7); ctx.lineTo(s * 0.15, -s * 0.15);
      ctx.lineTo(s * 0.6, -s * 0.85); ctx.lineTo(s * 0.9, s * 0.8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#B9DDF0';
      ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.7); ctx.lineTo(s * 0.15, -s * 0.15); ctx.lineTo(-s * 0.1, s * 0.8); ctx.lineTo(-s * 0.9, s * 0.8); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = '#5A6472';
      ctx.beginPath(); ctx.moveTo(-s * 0.9, s * 0.8); ctx.lineTo(-s * 0.6, -s * 0.4); ctx.lineTo(0, -s * 0.85);
      ctx.lineTo(s * 0.7, -s * 0.3); ctx.lineTo(s * 0.9, s * 0.8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.beginPath(); ctx.moveTo(0, -s * 0.85); ctx.lineTo(s * 0.7, -s * 0.3); ctx.lineTo(s * 0.2, s * 0.1); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawBomb(x, y) {
    const s = cell * 0.30;
    ctx.fillStyle = '#141419';
    ctx.beginPath(); ctx.arc(x, y + s * 0.2, s, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.beginPath(); ctx.arc(x - s * 0.32, y - s * 0.10, s * 0.22, 0, 7); ctx.fill();
    ctx.strokeStyle = '#C89A3A'; ctx.lineWidth = Math.max(1.6, s * 0.20); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + s * 0.3, y - s * 0.7); ctx.quadraticCurveTo(x + s * 0.9, y - s * 1.2, x + s * 0.6, y - s * 1.5); ctx.stroke();
    ctx.fillStyle = '#F2B33A';
    ctx.beginPath(); ctx.arc(x + s * 0.58, y - s * 1.62, s * 0.20, 0, 7); ctx.fill();
  }

  function drawBoom(age) {
    const t = age / 420, s = cell * (0.5 + t * 1.5);
    ctx.save(); ctx.globalAlpha = 1 - t;
    ctx.fillStyle = '#FFD36A';
    ctx.beginPath(); ctx.arc(boomX, boomY, s, 0, 7); ctx.fill();
    ctx.fillStyle = '#F0862A'; ctx.globalAlpha = (1 - t) * 0.8;
    ctx.beginPath(); ctx.arc(boomX, boomY, s * 0.62, 0, 7); ctx.fill();
    ctx.restore();
  }
  let boomX = 0, boomY = 0;

  // ---------- chrome ----------
  function drawHUD() {
    const hs = Math.max(0.72, Math.min(1, LW / 430));
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#20202A'; ctx.font = '800 ' + Math.round(24 * hs) + 'px Inter, sans-serif';
    ctx.fillText('LEVEL ' + level, 22, 20);
    ctx.textAlign = 'right';
    ctx.fillText('MOVES ' + moves, LW - 22, 20);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(20,20,28,0.92)'; ctx.font = '600 ' + Math.round(13 * hs) + 'px Inter, sans-serif';
    const sub = (board.name && board.name !== 'Level ' + level) ? board.name : (board.theme || '');
    ctx.fillText(sub, 22, 20 + Math.round(28 * hs));
  }

  function pill(label, px, py, dim, act) {
    ctx.font = '700 13px Inter, sans-serif';
    const w = Math.round(ctx.measureText(label).width + 26), h = 34;
    const x = Math.round(px), y = Math.round(py - h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = 'rgba(20,20,28,0.28)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = dim ? 'rgba(20,20,28,0.34)' : '#1A1A22';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (!dim) uiButtons.push({ x, y, w, h, act });
    return w;
  }

  function drawControls() {
    const y = LH - 54, gap = 8;
    ctx.font = '700 13px Inter, sans-serif';
    const items = [['Undo', () => undo(), !history.length], ['Restart', () => start(level), false],
                   ['Rules', () => { phase = 'menu'; render(); }, false], ['Next', () => start(level + 1), false]];
    let total = 38 + gap;
    items.forEach(([l]) => total += Math.round(ctx.measureText(l).width + 26) + gap);
    total -= gap;
    let x = Math.round(LW / 2 - total / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.beginPath(); ctx.roundRect(x, y - 17, 38, 34, 17); ctx.fill();
    ctx.strokeStyle = 'rgba(20,20,28,0.28)'; ctx.lineWidth = 1.4; ctx.stroke();
    const on = snd.on(), sx = x + 19;
    ctx.fillStyle = on ? '#1A1A22' : 'rgba(20,20,28,0.34)';
    ctx.beginPath(); ctx.moveTo(sx - 7, y - 3); ctx.lineTo(sx - 3, y - 3); ctx.lineTo(sx + 2, y - 8);
    ctx.lineTo(sx + 2, y + 8); ctx.lineTo(sx - 3, y + 3); ctx.lineTo(sx - 7, y + 3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.5;
    if (on) { ctx.beginPath(); ctx.arc(sx + 4, y, 5, -0.9, 0.9); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(sx + 5, y - 4); ctx.lineTo(sx + 11, y + 4); ctx.moveTo(sx + 11, y - 4); ctx.lineTo(sx + 5, y + 4); ctx.stroke(); }
    uiButtons.push({ x, y: y - 17, w: 38, h: 34, act: () => { snd.ready(); snd.toggle(); render(); } });
    x += 38 + gap;
    items.forEach(([l, a, dim]) => { x += pill(l, x, y, dim, a) + gap; });
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(20,20,28,0.94)'; ctx.font = '600 12px Inter, sans-serif';
    ctx.fillText('Drag a brick to slide it.', LW / 2, LH - 26);
    ctx.textAlign = 'left';
  }

  function panel(title, sub, lines, btn, act, col) {
    ctx.fillStyle = 'rgba(12,16,14,0.62)'; ctx.fillRect(0, 0, LW, LH);
    const pw = Math.min(LW - 40, 380), px = (LW - pw) / 2;
    ctx.font = '500 14px Inter, sans-serif';
    let h = 30 + 42 + 14 + lines.length * 46 + 60;
    const py = Math.max(14, (LH - h) / 2);
    ctx.fillStyle = '#FCFAF5';
    ctx.beginPath(); ctx.roundRect(px, py, pw, h, 18); ctx.fill();
    let y = py + 28;
    ctx.textAlign = 'center';
    ctx.fillStyle = col || '#1A1A22'; ctx.font = '800 28px Inter, sans-serif';
    ctx.fillText(title, LW / 2, y); y += 40;
    ctx.fillStyle = 'rgba(26,26,34,0.7)'; ctx.font = '600 14px Inter, sans-serif';
    ctx.fillText(sub, LW / 2, y); y += 26;
    ctx.textAlign = 'left'; ctx.font = '500 14px Inter, sans-serif';
    ctx.fillStyle = 'rgba(26,26,34,0.86)';
    for (const t of lines) {
      const words = t.split(' '); let line = '';
      for (const w of words) {
        const tt = line ? line + ' ' + w : w;
        if (ctx.measureText(tt).width > pw - 52 && line) { ctx.fillText(line, px + 26, y); y += 19; line = w; }
        else line = tt;
      }
      if (line) { ctx.fillText(line, px + 26, y); y += 19; }
      y += 8;
    }
    const bw = 160, bh = 42, bx = LW / 2 - bw / 2;
    ctx.fillStyle = '#2E9E4A';
    ctx.beginPath(); ctx.roundRect(bx, y, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '800 15px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(btn, LW / 2, y + bh / 2 + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    uiButtons.push({ x: bx, y, w: bw, h: bh, act });
  }

  const drawRules = () => panel('BUNNY', 'Get the rabbit to the carrot.', [
    'Drag the studded bricks. Anything without studs is part of the scenery and will not move.',
    'Watch what walks. The rabbit and the hunters pace exactly as far as they can get, so you can see what is joined to what.',
    'Open a way to the carrot. Open a way to a hunter and the rabbit is caught.',
  ], 'PLAY', () => { phase = 'play'; render(); });

  const drawWin = () => panel('SAFE', 'Level ' + level + ' in ' + moves + (moves === 1 ? ' move' : ' moves'),
    ['The rabbit got there.'], 'NEXT LEVEL', () => start(level + 1), '#2E9E4A');

  const drawDead = () => panel('CAUGHT', 'You opened a way to the hunter',
    ['Undo takes back one slide at a time.'], 'UNDO', () => { phase = 'play'; undo(); }, '#C4392B');

  function tick(t) { render(t); raf = requestAnimationFrame(tick); }

  // ---------- interaction ----------
  function brickAt(x, y) {
    const c = Math.floor((x - gridX) / cell), r = Math.floor((y - gridY) / cell);
    if (c < 0 || c >= board.W || r < 0 || r >= board.H) return -1;
    const i = r * board.W + c;
    return board.bricks.findIndex(k => k.cells.includes(i));
  }
  function slide(ki, dc, dr) {
    const solid = M.solidSet(board);
    if (!M.canSlide(board, ki, dc, dr, solid)) { snd.blocked(); return false; }
    history.push(M.clone(board));
    const bomb = board.bricks[ki].bomb;
    if (bomb) {
      const cs = board.bricks[ki].cells;
      boomX = cx(colOf(cs[0])); boomY = cy(rowOf(cs[0])); boomAt = performance.now();
      snd.boom();
    } else snd.slide();
    board = M.apply(board, { ki, dc, dr });
    moves++;
    rebuildPatrols();
    const st = M.status(board);
    if (st === 'won') { phase = 'won'; snd.win(); }
    else if (st === 'dead') { phase = 'dead'; snd.dead(); }
    return true;
  }
  function undo() {
    if (!history.length) return;
    board = history.pop(); moves = Math.max(0, moves - 1); phase = 'play';
    rebuildPatrols(); snd.undo();
  }
  function start(n) {
    level = Math.max(1, Math.min(PACK.length, n)); saveLevel();
    const lv = PACK[level - 1];
    board = window.BUNNY_LEVELS.parse(lv);
    board.name = lv.name; board.theme = lv.theme;
    TH = THEMES[lv.theme] || THEMES.garden;
    document.body.style.setProperty('--theme-back', TH.back2);
    moves = 0; phase = 'play'; history = [];
    layout(); rebuildPatrols(); render();
  }

  canvas.addEventListener('pointerdown', (e) => {
    snd.ready();
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (LW / r.width), y = (e.clientY - r.top) * (LH / r.height);
    for (let i = uiButtons.length - 1; i >= 0; i--) {
      const b = uiButtons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { e.preventDefault(); b.act(); return; }
    }
    if (phase !== 'play') return;
    const ki = brickAt(x, y);
    if (ki < 0) return;
    e.preventDefault();
    drag = { ki, x0: x, y0: y, ox: 0, oy: 0 };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (LW / r.width), y = (e.clientY - r.top) * (LH / r.height);
    const dx = x - drag.x0, dy = y - drag.y0;
    // A drag past half a cell in the dominant direction commits one slide, then
    // re-anchors, so a long drag walks a brick several cells the way it should.
    if (Math.max(Math.abs(dx), Math.abs(dy)) > cell * 0.5) {
      const [c, rr] = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
      const ki = drag.ki;
      if (slide(ki, c, rr)) { drag.x0 += c * cell; drag.y0 += rr * cell; }
      else drag = null;
      if (drag) { drag.ox = 0; drag.oy = 0; }
      return;
    }
    drag.ox = Math.abs(dx) > Math.abs(dy) ? dx * 0.35 : 0;
    drag.oy = Math.abs(dy) >= Math.abs(dx) ? dy * 0.35 : 0;
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'n') start(level + 1);
    if (e.key === 'r') start(level);
    if (e.key === 'z') undo();
  });

  // ---------- debug ----------
  window.__bunny = {
    get state() { return { level, name: board.name, moves, phase, W: board.W, H: board.H,
                           bricks: board.bricks.length, foxes: board.foxes.length,
                           region: M.region(board, board.rabbit).size, par: PACK[level - 1].par }; },
    get board() { return board; },
    get patrols() { return patrols.map(p => ({ kind: p.kind, cells: p.path.length })); },
    // where each walker is at an arbitrary time, so the pacing can be checked
    // without relying on requestAnimationFrame (which a hidden tab throttles
    // to nothing, and which cost an hour on another game in this project)
    walkersAt(t) {
      return patrols.map(p => {
        const w = walkerAt(p, t);
        const ax = colOf(w.i), ay = rowOf(w.i);
        const bx = w.j == null ? ax : colOf(w.j), by = w.j == null ? ay : rowOf(w.j);
        return { kind: p.kind, cell: [+(ax + (bx - ax) * w.t).toFixed(2), +(ay + (by - ay) * w.t).toFixed(2)] };
      });
    },
    get geom() { return { LW, LH, cell, gridX, gridY, TOP_BAND, BOT_BAND, mode: MODE }; },
    get buttons() { render(); return uiButtons.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h })); },
    slide, undo, goto: (n) => start(n), levels: PACK.length,
    solveNow() {
      const s = M.solve(board, 200000, 16);
      if (s.moves == null) return 'unsolvable';
      for (const m of s.path) slide(m.ki, m.dc, m.dr);
      return phase;
    },
  };

  // ---------- boot ----------
  setCanvasVars(); resizeCanvas(); fitFullscreen(); resizeCanvas();
  start(loadLevel());
  raf = requestAnimationFrame(tick);
  setTimeout(onResize, 0); setTimeout(onResize, 300);
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
})();
