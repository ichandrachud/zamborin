/* ============================================================
   SOCKET · a Zamborin Game

   A power strip, a pile of awkward plugs, and every device wanting to be on.
   A plug takes ONE socket but its body covers its neighbours, so a fat brick
   costs you three. And every device sits somewhere along the strip with only
   so much cable, so where a plug goes is not free.

   THE CABLE IS THE PUZZLE. Measured before any of this was drawn: with the
   bodies alone a board has a median of 192 solutions, because bodies that tile
   a line can be permuted freely. Cable reach collapses that to a median of 4.
   The model and that measurement live in model.js / measure.js.

   Geometry is enforced and reach is not. You cannot overlap two plugs, because
   that is physically impossible and the game should not pretend otherwise. You
   CAN plug something in too far from its device, and the cable then pulls taut
   and red. That is the difference between unfinished and wrong, which is the
   thing the old Fold lacked.
   ============================================================ */
(() => {
  'use strict';

  const M = window.SOCKET_MODEL;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let LW = 390, LH = 844;

  const BG_TOP = '#1B2A47', BG_MID = '#131F36', BG_BOT = '#0B1220';
  const CASE_HI = '#fbf9f4', CASE = '#efece4', CASE_LO = '#d9d4c8', CASE_EDGE = '#bdb7a8';
  const LIVE = '#FFD166', GOOD = '#3DDC84', WARN = '#E8B54D', BAD = '#E5584A';
  const PLUGS = [
    { c: '#c9463a', d: '#4a120c' }, { c: '#c98a2f', d: '#4a3008' },
    { c: '#2f9a54', d: '#0d3a1e' }, { c: '#2f86c8', d: '#0b2c46' },
    { c: '#7b46c0', d: '#2a1046' }, { c: '#c4437f', d: '#46102c' },
    { c: '#3aa892', d: '#0c3a32' }, { c: '#b8823f', d: '#3d2708' },
  ];
  const KIND_LABEL = { slim: '', wide: '', brick: 'BRICK', angle: '', bar: 'ADAPTER' };

  // ---------- sound ----------
  // Socket is the most physical game on the shelf, so the palette is physical:
  // a plastic seat, a contact click, a bell per device coming live, and a flat
  // thunk when a plug goes somewhere its cable cannot follow.
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zamborin-socket.sound' }) : null;
  const snd = {
    on: () => !!(sfx && sfx.isOn()),
    ready() { if (sfx) sfx.ensureAudio(); },
    toggle() { if (!sfx) return; sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.tone(880, 0.05, 0.03, 'sine'); },
    lift() { if (sfx) sfx.tone(520, 0.035, 0.016, 'sine'); },
    seat() { if (sfx) { sfx.noise(0.06, 2200, 1.6, 0.030); sfx.tone(150, 0.09, 0.032, 'sine'); } },
    live(n) {
      if (!sfx) return;
      const step = Math.min(11, Math.max(0, n - 1));
      sfx.tone(587.33 * Math.pow(2, step / 12), 0.20, 0.040, 'triangle');
      sfx.tone(587.33 * Math.pow(2, step / 12) * 2, 0.10, 0.012, 'sine');
    },
    strain() { if (sfx) { sfx.tone(104, 0.16, 0.030, 'sine'); sfx.noise(0.05, 400, 0.8, 0.014); } },
    win() { if (sfx) sfx.arpeggio(587.33, 0.10, 2); },
    pull() { if (sfx) sfx.noise(0.07, 900, 1.0, 0.022); },
  };

  // ---------- MODE + CANVAS (Bloom's block) ----------
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
  let board = null, place = [], held = -1, level = 1, moves = 0, phase = 'play';
  let uiButtons = [], wonT = -1e9, raf = 0, animEnd = 0;
  // Timestamps, not booleans: a plug seats over SEAT_MS and a device lights over
  // LIGHT_MS, and both need to be able to run at once.
  const SEAT_MS = 260, LIGHT_MS = 520;
  let seatT = [], litT = [];
  const heldFlip = () => (held < 0 ? false : (place[held] ? place[held].flipped : !!board.plugs[held]._flip));
  const LS = 'zamborin-socket.level';
  const saveLevel = () => { try { localStorage.setItem(LS, String(level)); } catch (e) {} };
  const loadLevel = () => { try { const v = parseInt(localStorage.getItem(LS), 10); return (v >= 1 && v <= 999) ? v : 1; } catch (e) { return 1; } };

  // ---------- layout ----------
  const TOP_BAND = 92;
  let stripX = 60, stripW = 82, stripY = 120, pitch = 54, devX = 300, trayY = 600, botBand = 168;
  function layout() {
    if (!board) return;
    const N = board.N;
    botBand = 172;
    const availH = Math.max(120, LH - TOP_BAND - botBand);
    pitch = Math.max(30, Math.min(58, Math.floor((availH - 24) / N)));
    stripW = Math.round(Math.min(104, Math.max(66, pitch * 1.8)));
    const stripH = pitch * N + 22;
    stripY = Math.round(TOP_BAND + (availH - stripH) / 2);
    const pad = LW < 520 ? 12 : 26;
    stripX = pad + 4;
    devX = LW - pad - 50;
    trayY = LH - botBand + 8;
  }
  const sockCY = (i) => stripY + 11 + pitch * (i + 0.5);
  const sockCX = () => stripX + stripW * 0.62;

  // ---------- helpers ----------
  const RR = (a, b, c, d, r) => { ctx.beginPath(); ctx.roundRect(a, b, c, d, r); };
  const mix = (h1, h2, t) => {
    const P = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    const A = P(h1), B = P(h2);
    return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')';
  };
  // moulded plastic, lit from upper-left
  function shell(bx, by, bw, bh, r, col, dark, alpha) {
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.filter = 'blur(5px)';
    RR(bx + 3, by + 6, bw, bh, r); ctx.fill(); ctx.filter = 'none';
    const g = ctx.createLinearGradient(bx, by, bx + bw * 0.4, by + bh);
    g.addColorStop(0, mix(col, '#ffffff', 0.3)); g.addColorStop(0.45, col); g.addColorStop(1, mix(col, dark, 0.45));
    ctx.fillStyle = g; RR(bx, by, bw, bh, r); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(bx + r, by + 0.8); ctx.lineTo(bx + bw - r, by + 0.8); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.moveTo(bx + r, by + bh - 0.8); ctx.lineTo(bx + bw - r, by + bh - 0.8); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bx + bw * 0.5, by + 3); ctx.lineTo(bx + bw * 0.5, by + bh - 3); ctx.stroke();
    ctx.restore();
  }

  // ---------- level ----------
  function startLevel(n) {
    level = Math.max(1, n); saveLevel();
    board = M.generate(level) || M.generate(1);
    place = board.plugs.map(() => null);
    seatT = board.plugs.map(() => -1e9); litT = board.plugs.map(() => -1e9);
    held = -1; moves = 0; phase = 'play'; wonT = -1e9;
    layout(); render();
  }
  const bodyOf = (i, pin, flipped) => {
    const p = board.plugs[i];
    const pinAt = flipped ? p.span - 1 - p.pinAt : p.pinAt;
    const from = pin - pinAt;
    return { from, to: from + p.span - 1 };
  };
  function fits(i, pin, flipped) {
    const b = bodyOf(i, pin, flipped);
    if (b.from < 0 || b.to > board.N - 1) return false;
    for (let k = 0; k < place.length; k++) {
      if (k === i || !place[k]) continue;
      const o = bodyOf(k, place[k].pin, place[k].flipped);
      if (b.from <= o.to && o.from <= b.to) return false;
    }
    return true;
  }
  const reaches = (i, pin) => {
    const r = board.reach[board.plugs[i].id];
    return !r || Math.abs(pin - r.at) <= r.slack;
  };
  const placedCount = () => place.filter(Boolean).length;
  const reachingCount = () => place.reduce((n, p, i) => n + (p && reaches(i, p.pin) ? 1 : 0), 0);
  const solved = () => place.every((p, i) => p && reaches(i, p.pin));

  // ---------- render ----------
  function render(now) {
    if (!board) return;
    now = now === undefined ? performance.now() : now;
    ctx.clearRect(0, 0, LW, LH);
    const g = ctx.createLinearGradient(0, 0, 0, LH);
    g.addColorStop(0, BG_TOP); g.addColorStop(0.55, BG_MID); g.addColorStop(1, BG_BOT);
    ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
    uiButtons = [];

    drawReachBand();
    drawStrip();
    drawWaitingCables();
    for (let i = 0; i < board.plugs.length; i++) if (place[i]) drawPlacedPlug(i, now);
    drawTray();
    drawHUD();
    if (phase === 'play') drawControls();
    if (phase === 'won') drawWin();
    if (phase === 'menu') drawRules();
  }

  // When a plug is in hand, show the stretch of strip its cable can actually
  // cover. This is the rule being taught by showing it rather than saying it.
  function drawReachBand() {
    if (held < 0) return;
    const r = board.reach[board.plugs[held].id]; if (!r) return;
    const a = Math.max(0, r.at - r.slack), b = Math.min(board.N - 1, r.at + r.slack);
    const y0 = sockCY(a) - pitch / 2, y1 = sockCY(b) + pitch / 2;
    ctx.fillStyle = 'rgba(61,220,132,0.10)';
    RR(stripX - 8, y0, devX - stripX + 46, y1 - y0, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(61,220,132,0.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
    RR(stripX - 8, y0, devX - stripX + 46, y1 - y0, 12); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(61,220,132,0.85)'; ctx.font = '700 10px Inter, sans-serif';
    ctx.textAlign = 'right'; ctx.fillText('THIS CABLE REACHES HERE', devX + 44, y0 + 7);
    ctx.textAlign = 'left';
  }

  function drawStrip() {
    const N = board.N, sH = pitch * N + 22;
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.filter = 'blur(12px)';
    RR(stripX + 5, stripY + 10, stripW, sH, 16); ctx.fill(); ctx.filter = 'none'; ctx.restore();
    const sg = ctx.createLinearGradient(stripX, 0, stripX + stripW, 0);
    sg.addColorStop(0, CASE_HI); sg.addColorStop(0.22, CASE); sg.addColorStop(0.8, CASE_LO); sg.addColorStop(1, CASE_EDGE);
    ctx.fillStyle = sg; RR(stripX, stripY, stripW, sH, 16); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(stripX + 12, stripY + 1); ctx.lineTo(stripX + stripW - 12, stripY + 1); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.09)'; RR(stripX + 8, stripY + 10, stripW - 16, sH - 20, 11); ctx.fill();
    // screws
    const screw = (cx, cy) => {
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.arc(cx, cy, 3.4, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(cx - 2.2, cy); ctx.lineTo(cx + 2.2, cy); ctx.stroke();
    };
    screw(stripX + 6, stripY + 11); screw(stripX + 6, stripY + sH - 11);
    // mains lead
    ctx.strokeStyle = CASE; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(stripX + stripW / 2, stripY + sH);
    ctx.bezierCurveTo(stripX + stripW / 2, stripY + sH + 18, stripX - 14, stripY + sH + 18, stripX - 18, stripY + sH + 34);
    ctx.stroke();

    for (let i = 0; i < N; i++) drawSocket(i);
  }

  function drawSocket(i) {
    const cx = sockCX(), cy = sockCY(i), s = Math.min(40, pitch * 0.76);
    const usable = held >= 0 ? fits(held, i, heldFlip()) : false;
    const inReach = held >= 0 ? reaches(held, i) : false;

    ctx.fillStyle = 'rgba(0,0,0,0.15)'; RR(cx - s / 2 - 2, cy - s / 2 - 2, s + 4, s + 4, 10); ctx.fill();
    const rg = ctx.createLinearGradient(0, cy - s / 2, 0, cy + s / 2);
    if (held >= 0 && usable && inReach) { rg.addColorStop(0, '#d8f5e3'); rg.addColorStop(1, '#a8e6c2'); }
    else if (held >= 0 && usable) { rg.addColorStop(0, '#f6e6c2'); rg.addColorStop(1, '#e5cf9c'); }
    else { rg.addColorStop(0, CASE); rg.addColorStop(1, CASE_LO); }
    ctx.fillStyle = rg; RR(cx - s / 2, cy - s / 2, s, s, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1; ctx.stroke();

    // Blades side by side with the EARTH BELOW them. It was above, which is
    // upside down for a moulded strip and read as wrong even at a glance.
    const hole = (hx, hy, hw, hh, r) => {
      ctx.fillStyle = '#0a0d14'; RR(hx, hy, hw, hh, r); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(hx, hy + hh + 0.6); ctx.lineTo(hx + hw, hy + hh + 0.6); ctx.stroke();
    };
    const u = s / 42;
    hole(cx - 11 * u, cy - 15 * u, 5.5 * u, 15 * u, 2.2);
    hole(cx + 5.5 * u, cy - 15 * u, 5.5 * u, 15 * u, 2.2);
    hole(cx - 3.5 * u, cy + 5 * u, 7 * u, 10 * u, 3.5);
    if (held >= 0 && usable) {
      uiButtons.push({ x: cx - pitch * 0.6, y: cy - pitch / 2, w: pitch * 1.2, h: pitch, act: () => putDown(i) });
    }
  }

  // The cable comes in from off screen and always did — the device is under the
  // desk, behind the telly, wherever. Drawing a little coloured block at the end
  // of it made the plug look like it was powering a matching brick, which is not
  // a thing that exists. So the cable simply leaves the frame at the row its
  // slack is measured from, and that row is the only thing marking the device.
  const anchorY = (i) => sockCY(board.reach[board.plugs[i].id].at);
  const anchorX = () => LW + 24;

  // Waiting plugs still have cables draped across the desk. Drawn faint, they
  // say where each one will have to end up before you have even picked it up.
  function drawWaitingCables() {
    board.plugs.forEach((p, i) => {
      if (place[i]) return;
      const col = PLUGS[i % PLUGS.length], ay = anchorY(i);
      ctx.save(); ctx.globalAlpha = held === i ? 0.85 : 0.28;
      ctx.lineCap = 'round';
      ctx.strokeStyle = mix(col.c, '#000000', 0.2); ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(LW + 8, ay);
      ctx.bezierCurveTo(LW - 70, ay, LW - 96, ay + 20, LW - 120, ay + 26); ctx.stroke();
      // a loose coil where it is waiting
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(LW - 128, ay + 30, 9, -0.4, 4.4); ctx.stroke();
      ctx.restore();
    });
  }

  // How far each kind stands proud of the strip. A brick is bulky, a slim
  // two-pin is barely there — the silhouette should say which is which before
  // you have counted a single socket.
  const DEPTH = { slim: 0.62, wide: 0.80, angle: 0.74, bar: 0.58, brick: 1.0 };

  // The outline of each kind, in a box (0,0)-(w,h) with the strip on the left.
  function plugPath(kind, x0, y0, w, h, flipped) {
    const r = Math.min(11, h * 0.24);
    ctx.beginPath();
    if (kind === 'brick') {
      // a wall wart: shoulders in at the socket end, bulges out behind
      ctx.moveTo(x0, y0 + r);
      ctx.lineTo(x0, y0 + h - r);
      ctx.quadraticCurveTo(x0, y0 + h, x0 + r, y0 + h);
      ctx.lineTo(x0 + w * 0.42, y0 + h);
      ctx.quadraticCurveTo(x0 + w, y0 + h, x0 + w, y0 + h * 0.72);
      ctx.lineTo(x0 + w, y0 + h * 0.28);
      ctx.quadraticCurveTo(x0 + w, y0, x0 + w * 0.42, y0);
      ctx.lineTo(x0 + r, y0);
      ctx.quadraticCurveTo(x0, y0, x0, y0 + r);
    } else if (kind === 'angle') {
      // right-angle: the body turns and the lead leaves along the strip
      const k = flipped ? 1 : 0;
      const yTurn = k ? y0 + h * 0.42 : y0 + h * 0.58;
      ctx.moveTo(x0, y0 + r); ctx.lineTo(x0, y0 + h - r);
      ctx.quadraticCurveTo(x0, y0 + h, x0 + r, y0 + h);
      ctx.lineTo(x0 + w * 0.55, y0 + h);
      ctx.quadraticCurveTo(x0 + w * 0.78, y0 + h, x0 + w * 0.78, y0 + h - r);
      ctx.lineTo(x0 + w * 0.78, yTurn + r);
      ctx.quadraticCurveTo(x0 + w * 0.78, yTurn, x0 + w, yTurn);
      ctx.lineTo(x0 + w, yTurn - h * 0.2);
      ctx.quadraticCurveTo(x0 + w * 0.6, yTurn - h * 0.2, x0 + w * 0.6, y0 + r);
      ctx.quadraticCurveTo(x0 + w * 0.6, y0, x0 + w * 0.42, y0);
      ctx.lineTo(x0 + r, y0);
      ctx.quadraticCurveTo(x0, y0, x0, y0 + r);
    } else if (kind === 'bar') {
      // a long slim adapter block
      ctx.roundRect(x0, y0, w, h, [r * 0.5, r, r, r * 0.5]);
    } else if (kind === 'wide') {
      // squared at the pin end, tapered at the other, so a flip is visible
      const t = flipped ? 1 : 0;
      ctx.moveTo(x0, y0 + r); ctx.lineTo(x0, y0 + h - r);
      ctx.quadraticCurveTo(x0, y0 + h, x0 + r, y0 + h);
      ctx.lineTo(x0 + w - (t ? w * 0.22 : r), y0 + h);
      ctx.quadraticCurveTo(x0 + w, y0 + h, x0 + w, y0 + h - (t ? h * 0.26 : r));
      ctx.lineTo(x0 + w, y0 + (t ? r : h * 0.26));
      ctx.quadraticCurveTo(x0 + w, y0, x0 + w - (t ? r : w * 0.22), y0);
      ctx.lineTo(x0 + r, y0);
      ctx.quadraticCurveTo(x0, y0, x0, y0 + r);
    } else {
      ctx.roundRect(x0, y0, w, h, r * 0.8);
    }
    ctx.closePath();
  }

  function drawPlacedPlug(i, now) {
    const p = board.plugs[i], pl = place[i], col = PLUGS[i % PLUGS.length];
    const b = bodyOf(i, pl.pin, pl.flipped);
    const top = sockCY(b.from) - pitch / 2 + 3, bot = sockCY(b.to) + pitch / 2 - 3;
    const ok = reaches(i, pl.pin);
    const t = Math.min(1, (now - (seatT[i] || -1e9)) / SEAT_MS);
    const slide = (1 - (1 - Math.pow(1 - t, 3))) * 46;

    const pw = (stripW - 10) * (DEPTH[p.kind] || 0.8);
    const px = stripX + 5 + slide, h = bot - top;

    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.filter = 'blur(6px)';
    plugPath(p.kind, px + 3, top + 7, pw, h, pl.flipped); ctx.fill(); ctx.filter = 'none'; ctx.restore();

    const g = ctx.createLinearGradient(px, top, px + pw * 0.4, bot);
    g.addColorStop(0, mix(col.c, '#ffffff', 0.30)); g.addColorStop(0.45, col.c);
    g.addColorStop(1, mix(col.c, col.d, 0.45));
    plugPath(p.kind, px, top, pw, h, pl.flipped);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.30)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(px + 3, top + 1.2); ctx.lineTo(px + pw, top + 1.2); ctx.stroke();
    // moulding ribs, more of them on the bulky kinds
    const ribs = p.kind === 'brick' ? 3 : (p.kind === 'bar' ? 2 : 0);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
    for (let k = 1; k <= ribs; k++) {
      const ry = top + (h * k) / (ribs + 1);
      ctx.beginPath(); ctx.moveTo(px + pw * 0.25, ry); ctx.lineTo(px + pw * 0.9, ry); ctx.stroke();
    }
    ctx.restore();

    // the seam where it meets the socket face
    ctx.strokeStyle = 'rgba(0,0,0,0.26)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px + 2, top + 3); ctx.lineTo(px + 2, bot - 3); ctx.stroke();

    // collar on the live pin row, so you can see which socket it draws from
    const cy = sockCY(pl.pin);
    ctx.fillStyle = mix(col.c, '#000000', 0.36); RR(px + pw - 8, cy - 9, 14, 18, 6); ctx.fill();
    ctx.fillStyle = mix(col.c, '#ffffff', 0.12); RR(px + pw - 8, cy - 9, 14, 5, 3); ctx.fill();

    // the cable, out of the frame at the row its slack is measured from
    const ay = anchorY(i), ax = anchorX();
    const x0 = px + pw + 5;
    const sag = ok ? 26 : 2;
    ctx.lineCap = 'round';
    const draw = (w, c) => { ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x0, cy);
      ctx.bezierCurveTo(x0 + 30, cy + sag, ax - 70, ay + sag, ax, ay); ctx.stroke(); };
    draw(8, 'rgba(0,0,0,0.42)');
    draw(6, ok ? mix(col.c, '#000000', 0.26) : BAD);
    draw(2, ok ? mix(col.c, '#ffffff', 0.22) : mix(BAD, '#ffffff', 0.32));
    if (!ok) {
      ctx.fillStyle = BAD; ctx.font = '700 10px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('WON\u2019T REACH', Math.min(LW - 54, (x0 + ax) / 2), (cy + ay) / 2 - 14);
      ctx.textAlign = 'left';
    } else {
      // a lamp on the frame edge: the device you cannot see is on
      const lt = Math.min(1, (now - litT[i]) / LIGHT_MS);
      const pulse = 1 + Math.sin(Math.min(1, lt) * Math.PI) * 1.5;
      ctx.fillStyle = 'rgba(255,209,102,' + (0.08 + 0.20 * (1 - lt)) + ')';
      ctx.beginPath(); ctx.arc(LW - 24, ay, 15 * pulse, 0, 7); ctx.fill();
      ctx.fillStyle = LIVE; ctx.beginPath(); ctx.arc(LW - 24, ay, 4.5, 0, 7); ctx.fill();
    }
    const lab = KIND_LABEL[p.kind];
    if (lab && h > 44) {
      ctx.save(); ctx.translate(px + pw * 0.44, (top + bot) / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.40)'; ctx.font = '700 9px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lab, 0, 0); ctx.restore();
      ctx.textBaseline = 'top';
    }
    if (held === i) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2.5;
      plugPath(p.kind, px - 2, top - 2, pw + 4, h + 4, pl.flipped); ctx.stroke();
    }
    uiButtons.push({ x: px, y: top, w: pw, h, act: () => pickUp(i) });
  }

  function drawTray() {
    const h = 82;
    ctx.fillStyle = 'rgba(255,255,255,0.045)'; RR(12, trayY, LW - 24, h, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.42)'; ctx.font = '700 10px Inter, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(held >= 0 ? 'NOW TAP A SOCKET' : 'STILL TO PLUG IN', 26, trayY + 10);
    let x = 26;
    board.plugs.forEach((p, i) => {
      if (place[i]) return;
      const col = PLUGS[i % PLUGS.length];
      const w = 24 + p.span * 12, hh = 44, y = trayY + 26;
      ctx.save(); ctx.globalAlpha = held === i ? 1 : 0.92;
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.filter = 'blur(4px)';
      plugPath(p.kind, x + 2, y + 5, w, hh, !!p._flip); ctx.fill(); ctx.filter = 'none'; ctx.restore();
      const tg = ctx.createLinearGradient(x, y, x + w * 0.4, y + hh);
      tg.addColorStop(0, mix(col.c, '#ffffff', 0.3)); tg.addColorStop(0.45, col.c);
      tg.addColorStop(1, mix(col.c, col.d, 0.45));
      plugPath(p.kind, x, y, w, hh, !!p._flip); ctx.fillStyle = tg; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
      if (held === i) {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2.5;
        RR(x - 3, y - 3, w + 6, hh + 6, 11); ctx.stroke();
      }
      uiButtons.push({ x: x - 4, y: y - 6, w: w + 8, h: hh + 12, act: () => tapTray(i) });
      x += w + 12;
    });
  }

  function drawHUD() {
    const hs = Math.max(0.7, Math.min(1, LW / 430));
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff'; ctx.font = '800 ' + Math.round(26 * hs) + 'px Inter, sans-serif';
    ctx.fillText('SOCKET', 22, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.font = '600 ' + Math.round(14 * hs) + 'px Inter, sans-serif';
    ctx.fillText('Level ' + level + '   ·   ' + reachingCount() + '/' + board.plugs.length + ' on   ·   ' + moves + (moves === 1 ? ' move' : ' moves'), 22, 50);
  }

  function pill(label, cx, cy, dim, act) {
    ctx.font = '700 13px Inter, sans-serif';
    const w = Math.round(ctx.measureText(label).width + 28), h = 36;
    const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; RR(x, y, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.24)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = dim ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx, y + h / 2 + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (!dim) uiButtons.push({ x, y, w, h, act });
    return w;
  }
  function drawControls() {
    const cy = LH - 62, gap = 10;
    ctx.font = '700 13px Inter, sans-serif';
    const labels = [['Unplug all', () => startLevel(level)], ['Rules', () => { phase = 'menu'; render(); }], ['Next', () => startLevel(level + 1)]];
    let tot = 40 + gap; labels.forEach(([l]) => tot += Math.round(ctx.measureText(l).width + 28) + gap); tot -= gap;
    let x = Math.round(LW / 2 - tot / 2);
    // speaker
    const sx = x, sy = Math.round(cy - 18);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; RR(sx, sy, 40, 36, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.24)'; ctx.lineWidth = 1.5; ctx.stroke();
    const on = snd.on(), scx = sx + 20;
    ctx.fillStyle = on ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.moveTo(scx - 7, cy - 3); ctx.lineTo(scx - 3, cy - 3); ctx.lineTo(scx + 2, cy - 8);
    ctx.lineTo(scx + 2, cy + 8); ctx.lineTo(scx - 3, cy + 3); ctx.lineTo(scx - 7, cy + 3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.5;
    if (on) { ctx.beginPath(); ctx.arc(scx + 4, cy, 5, -0.9, 0.9); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(scx + 5, cy - 4); ctx.lineTo(scx + 11, cy + 4); ctx.moveTo(scx + 11, cy - 4); ctx.lineTo(scx + 5, cy + 4); ctx.stroke(); }
    uiButtons.push({ x: sx, y: sy, w: 40, h: 36, act: () => { snd.ready(); snd.toggle(); render(); } });
    x += 40 + gap;
    labels.forEach(([l, a]) => { const w = pill(l, x + Math.round(ctx.measureText(l).width + 28) / 2, cy, false, a); x += w + gap; });
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '500 12px Inter, sans-serif';
    ctx.fillText('A fat plug takes one socket and covers its neighbours.', LW / 2, LH - 28);
    ctx.textAlign = 'left';
  }

  function drawWin() {
    ctx.fillStyle = 'rgba(8,13,24,0.86)'; ctx.fillRect(0, 0, LW, LH);
    ctx.textAlign = 'center';
    ctx.fillStyle = GOOD; ctx.font = '800 34px Inter, sans-serif';
    ctx.fillText('EVERYTHING IS ON', LW / 2, LH / 2 - 60);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '600 16px Inter, sans-serif';
    ctx.fillText(board.plugs.length + ' plugs, ' + board.N + ' sockets, ' + moves + ' moves', LW / 2, LH / 2 - 20);
    const bw = 190, bh = 46, bx = LW / 2 - bw / 2, by = LH / 2 + 16;
    ctx.fillStyle = GOOD; RR(bx, by, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = '#0B1220'; ctx.font = '800 15px Inter, sans-serif';
    ctx.textBaseline = 'middle'; ctx.fillText('NEXT STRIP', LW / 2, by + bh / 2 + 1);
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    uiButtons.push({ x: bx, y: by, w: bw, h: bh, act: () => startLevel(level + 1) });
  }

  function kick() {
    animEnd = performance.now() + Math.max(SEAT_MS, LIGHT_MS) + 80;
    if (!raf) { raf = 1; requestAnimationFrame(tick); }
  }
  function tick(t) {
    render(t);
    if (t < animEnd) requestAnimationFrame(tick); else raf = 0;
  }

  function wrapText(text, x, y, maxW, lh) {
    const words = text.split(' '); let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; }
      else line = t;
    }
    if (line) { ctx.fillText(line, x, y); y += lh; }
    return y;
  }
  function drawRules() {
    ctx.fillStyle = 'rgba(8,13,24,0.90)'; ctx.fillRect(0, 0, LW, LH);
    const pw = Math.min(LW - 44, 400), px = (LW - pw) / 2;
    const rules = ['A plug uses one socket but its body covers the neighbours. A fat one costs you three.',
                   'Every cable comes in from off screen and only stretches so far. Pick a plug up and the strip shows where it can go.',
                   'Some plugs turn round, which swaps the side their body covers.'];
    ctx.font = '500 14px Inter, sans-serif';
    let h = 34 + 46 + 16;
    rules.forEach(() => { h += 3 * 20 + 14; });
    h += 16 + 48 + 30;
    const py = Math.max(16, (LH - h) / 2);
    ctx.fillStyle = '#16233a'; RR(px, py, pw, h, 20); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();
    let y = py + 30;
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '800 30px Inter, sans-serif';
    ctx.fillText('SOCKET', LW / 2, y); y += 44;
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '600 15px Inter, sans-serif';
    ctx.fillText('Get everything plugged in at once.', LW / 2, y); y += 30;
    ctx.textAlign = 'left'; ctx.font = '500 14px Inter, sans-serif';
    rules.forEach((r, i) => {
      ctx.fillStyle = '#3a9bde'; ctx.beginPath(); ctx.arc(px + 32, y + 8, 11, 0, 7); ctx.fill();
      ctx.fillStyle = '#0B1220'; ctx.font = '800 12px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.fillText(String(i + 1), px + 32, y + 4);
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.86)'; ctx.font = '500 14px Inter, sans-serif';
      y = wrapText(r, px + 52, y, pw - 84, 20) + 12;
    });
    y += 6;
    const bw = 170, bh = 44, bx = LW / 2 - bw / 2;
    ctx.fillStyle = GOOD; RR(bx, y, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = '#0B1220'; ctx.font = '800 15px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('PLAY', LW / 2, y + bh / 2 + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    uiButtons.push({ x: bx, y, w: bw, h: bh, act: () => { phase = 'play'; render(); } });
  }

  // ---------- interaction ----------
  function tapTray(i) {
    if (held === i) { flipHeld(); return; }
    held = i; snd.lift(); render();
  }
  function flipHeld() {
    const p = board.plugs[held];
    if (!p.flippable) return;
    if (place[held]) { place[held].flipped = !place[held].flipped; moves++; }
    else { p._flip = !p._flip; }
    render();
  }
  function pickUp(i) {
    if (held === i) { flipHeld(); checkWin(); return; }
    held = i; snd.pull(); render();
  }
  function putDown(i) {
    if (held < 0) return;
    const p = board.plugs[held];
    const flipped = place[held] ? place[held].flipped : !!p._flip;
    if (!fits(held, i, flipped)) return;
    const wasLive = place[held] && reaches(held, place[held].pin);
    place[held] = { pin: i, flipped };
    seatT[held] = performance.now();
    snd.seat();
    if (reaches(held, i)) { if (!wasLive) litT[held] = performance.now(); snd.live(reachingCount()); }
    else snd.strain();
    moves++; held = -1;
    checkWin(); kick();
  }
  function checkWin() {
    if (phase === 'play' && solved()) { phase = 'won'; wonT = performance.now(); snd.win(); kick(); }
  }
  function doSolve() {
    board.plugs.forEach((p, i) => { place[i] = { pin: board.solution[i].pin, flipped: board.solution[i].flipped }; });
    held = -1; checkWin(); render();
  }

  canvas.addEventListener('pointerdown', (e) => {
    snd.ready();                      // browsers only allow audio after a gesture
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (LW / r.width), y = (e.clientY - r.top) * (LH / r.height);
    for (let k = uiButtons.length - 1; k >= 0; k--) {
      const b = uiButtons[k];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { e.preventDefault(); b.act(); return; }
    }
    if (held >= 0) { held = -1; render(); }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'n') startLevel(level + 1);
    if (e.key === 'r') startLevel(level);
    if (e.key === 's') doSolve();
  });

  // ---------- debug ----------
  window.__socket = {
    get state() { return { level, N: board.N, plugs: board.plugs.length, placed: placedCount(), reaching: reachingCount(), moves, phase, solutions: board.solutions, slack: board.slack }; },
    get board() { return board; },
    get placement() { return place.map(p => p && { ...p }); },
    goto(n) { startLevel(n); }, solve: doSolve,
    put(i, pin, flipped) { place[i] = { pin, flipped: !!flipped }; checkWin(); render(); return this.state; },
    fits: (i, pin, f) => fits(i, pin, f),
    reaches: (i, pin) => reaches(i, pin),
    get buttons() { render(); return uiButtons.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h })); },
    get geom() { return { LW, LH, stripX, stripW, stripY, pitch, devX, sockCX: sockCX() }; },
  };

  // ---------- boot ----------
  setCanvasVars(); resizeCanvas(); fitFullscreen(); resizeCanvas();
  startLevel(loadLevel());
  setTimeout(onResize, 0); setTimeout(onResize, 300);
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
})();
