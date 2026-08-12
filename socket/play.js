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
  let uiButtons = [], wonT = -1e9, raf = 0;
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
    stripW = Math.round(Math.min(84, Math.max(56, pitch * 1.45)));
    const stripH = pitch * N + 22;
    stripY = Math.round(TOP_BAND + (availH - stripH) / 2);
    const pad = LW < 520 ? 12 : 26;
    stripX = pad + 4;
    devX = LW - pad - 54;
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
  function render() {
    if (!board) return;
    ctx.clearRect(0, 0, LW, LH);
    const g = ctx.createLinearGradient(0, 0, 0, LH);
    g.addColorStop(0, BG_TOP); g.addColorStop(0.55, BG_MID); g.addColorStop(1, BG_BOT);
    ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
    uiButtons = [];

    drawReachBand();
    drawStrip();
    drawDevices();
    for (let i = 0; i < board.plugs.length; i++) if (place[i]) drawPlacedPlug(i);
    drawTray();
    drawHUD();
    if (phase === 'play') drawControls();
    if (phase === 'won') drawWin();
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
    let covered = false;
    for (let k = 0; k < place.length; k++) {
      if (!place[k]) continue;
      const b = bodyOf(k, place[k].pin, place[k].flipped);
      if (i >= b.from && i <= b.to && place[k].pin !== i) covered = true;
    }
    const usable = held >= 0 ? fits(held, i, place[held] ? place[held].flipped : false) : false;
    const inReach = held >= 0 ? reaches(held, i) : false;

    ctx.fillStyle = 'rgba(0,0,0,0.15)'; RR(cx - s / 2 - 2, cy - s / 2 - 2, s + 4, s + 4, 10); ctx.fill();
    const rg = ctx.createLinearGradient(0, cy - s / 2, 0, cy + s / 2);
    if (held >= 0 && usable && inReach) { rg.addColorStop(0, '#d8f5e3'); rg.addColorStop(1, '#a8e6c2'); }
    else if (held >= 0 && usable) { rg.addColorStop(0, '#f6e6c2'); rg.addColorStop(1, '#e5cf9c'); }
    else if (covered) { rg.addColorStop(0, '#a49c8c'); rg.addColorStop(1, '#8d8676'); }
    else { rg.addColorStop(0, CASE); rg.addColorStop(1, CASE_LO); }
    ctx.fillStyle = rg; RR(cx - s / 2, cy - s / 2, s, s, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1; ctx.stroke();

    if (covered) return;
    const hole = (hx, hy, hw, hh) => {
      ctx.fillStyle = '#0a0d14'; RR(hx, hy, hw, hh, 2.2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(hx, hy + hh + 0.6); ctx.lineTo(hx + hw, hy + hh + 0.6); ctx.stroke();
    };
    const u = s / 42;
    hole(cx - 11 * u, cy - 4 * u, 5.5 * u, 15 * u);
    hole(cx + 5.5 * u, cy - 4 * u, 5.5 * u, 15 * u);
    hole(cx - 3 * u, cy - 16 * u, 6 * u, 11 * u);
    if (held >= 0 && usable) {
      uiButtons.push({ x: cx - pitch * 0.6, y: cy - pitch / 2, w: pitch * 1.2, h: pitch, act: () => putDown(i) });
    }
  }

  // Devices sit where their cable says they sit. The cable is the constraint,
  // so it is drawn as an object rather than implied.
  function drawDevices() {
    board.plugs.forEach((p, i) => {
      const r = board.reach[p.id]; if (!r) return;
      const col = PLUGS[i % PLUGS.length];
      const cy = sockCY(r.at), w = 44, h = Math.min(38, pitch * 0.7);
      const dim = place[i] ? 1 : (held === i ? 1 : 0.42);
      if (held === i) {
        ctx.fillStyle = 'rgba(61,220,132,0.18)';
        RR(devX - 7, cy - h / 2 - 7, w + 14, h + 14, 12); ctx.fill();
      }
      shell(devX, cy - h / 2, w, h, 8, col.c, col.d, dim);
      if (held === i) {
        ctx.strokeStyle = GOOD; ctx.lineWidth = 2;
        RR(devX - 5, cy - h / 2 - 5, w + 10, h + 10, 11); ctx.stroke();
      }
      ctx.save(); ctx.globalAlpha = dim;
      ctx.fillStyle = place[i] && reaches(i, place[i].pin) ? LIVE : 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.arc(devX + w - 10, cy - h / 2 + 9, 3.2, 0, 7); ctx.fill();
      ctx.restore();
    });
  }

  function drawPlacedPlug(i) {
    const p = board.plugs[i], pl = place[i], col = PLUGS[i % PLUGS.length];
    const b = bodyOf(i, pl.pin, pl.flipped);
    const top = sockCY(b.from) - pitch / 2 + 4, bot = sockCY(b.to) + pitch / 2 - 4;
    const px = stripX + stripW - 10, pw = Math.min(78, LW * 0.2);
    const ok = reaches(i, pl.pin);
    // shadow onto the strip face
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.filter = 'blur(4px)';
    RR(px - 12, top + 3, 18, bot - top, 5); ctx.fill(); ctx.filter = 'none'; ctx.restore();
    shell(px, top, pw, bot - top, 10, col.c, col.d);
    const cy = sockCY(pl.pin);
    // strain relief
    ctx.fillStyle = mix(col.c, '#000000', 0.3); RR(px + pw - 4, cy - 6, 13, 12, 5); ctx.fill();
    // the cable, to its device
    const r = board.reach[p.id], dy = sockCY(r.at);
    const x0 = px + pw + 8, x1 = devX;
    ctx.lineCap = 'round';
    const sag = ok ? 22 : 2;
    const draw = (w, c) => {
      ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x0, cy);
      ctx.bezierCurveTo(x0 + 22, cy + sag, x1 - 22, dy + sag, x1, dy); ctx.stroke();
    };
    draw(8, 'rgba(0,0,0,0.4)');
    draw(6, ok ? mix(col.c, '#000000', 0.28) : BAD);
    if (!ok) {
      ctx.fillStyle = BAD; ctx.font = '700 10px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('WON’T REACH', (x0 + x1) / 2, (cy + dy) / 2 - 12);
    }
    const lab = KIND_LABEL[p.kind];
    if (lab && bot - top > 34) {
      ctx.save(); ctx.translate(px + pw * 0.45, (top + bot) / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '700 9px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lab, 0, 0); ctx.restore();
      ctx.textBaseline = 'top';
    }
    if (held === i) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2.5;
      RR(px - 3, top - 3, pw + 6, bot - top + 6, 12); ctx.stroke();
    }
    uiButtons.push({ x: px, y: top, w: pw, h: bot - top, act: () => pickUp(i) });
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
      const w = 22 + p.span * 13, hh = 44, y = trayY + 26;
      shell(x, y, w, hh, 8, col.c, col.d, held === i ? 1 : 0.92);
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
    const labels = [['Unplug all', () => startLevel(level)], ['Solve', doSolve], ['Next', () => startLevel(level + 1)]];
    let tot = 0; labels.forEach(([l]) => tot += Math.round(ctx.measureText(l).width + 28) + gap); tot -= gap;
    let x = Math.round(LW / 2 - tot / 2);
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

  // ---------- interaction ----------
  function tapTray(i) {
    if (held === i) { flipHeld(); return; }
    held = i; render();
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
    held = i; render();
  }
  function putDown(i) {
    if (held < 0) return;
    const p = board.plugs[held];
    const flipped = place[held] ? place[held].flipped : !!p._flip;
    if (!fits(held, i, flipped)) return;
    place[held] = { pin: i, flipped };
    moves++; held = -1;
    checkWin(); render();
  }
  function checkWin() {
    if (phase === 'play' && solved()) { phase = 'won'; wonT = performance.now(); }
  }
  function doSolve() {
    board.plugs.forEach((p, i) => { place[i] = { pin: board.solution[i].pin, flipped: board.solution[i].flipped }; });
    held = -1; checkWin(); render();
  }

  canvas.addEventListener('pointerdown', (e) => {
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
