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

  const M = window.SOCKET_MODEL_2D;
  const COLS = 2;
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
    // One desktop frame across the whole site: 760x600. Eight different sizes
    // had grown up across thirteen games, which reads as carelessness. This is
    // Untangle's, and it is sized so the game plus a 300px sidebar ad fits the
    // page without either being squashed.
    else { LW = 760; LH = 600; }
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
  // A real wall board comes in gangs of two, and measured, the second column is
  // not just more room — it is a second axis of blocking. Search effort roughly
  // triples and dead ends quadruple against the one-column version, because a
  // fat body can now steal the socket BESIDE it as well as the ones above and
  // below.
  // The bands are generous on a phone, where the frame is 800-odd tall and 92px
  // of header costs a ninth of it. In the 760x600 desktop frame the same 92 + 96
  // is nearly a THIRD of the height, and every pixel of it comes straight off
  // the socket pitch. The title ends at y=58 and the buttons start at LH-77, so
  // the desktop numbers below are what the content actually occupies.
  const TOP_BAND = MODE === 'mobile' ? 92 : 76;
  const BOT_BAND = MODE === 'mobile' ? 96 : 88;
  let stripX = 0, plateW = 120, stripY = 120, pitch = 54, inset = 9, looseX = 300, botBand = 96;
  // Horizontal spacing is three separate numbers, not one. The plate runs off
  // the left edge of the screen on purpose, so an even margin inside the plate
  // does NOT read as even to the eye: the bleed eats the left one. padL carries
  // the bleed so that what is actually VISIBLE either side of the gangs matches,
  // and the gap down the middle is the narrower of the two.
  let padL = 12, padR = 12, gapX = 8, bleed = 12;
  function layout() {
    if (!board) return;
    const R = board.R;
    botBand = BOT_BAND;
    const availH = Math.max(120, LH - TOP_BAND - botBand);
    // the plate may take a little under half the width; the rest is floor
    // The plate is exactly pitch * (R + 0.32) tall, because inset is 0.16 of
    // pitch at the top and again at the bottom. Solving for that directly costs
    // nothing; the old flat -60 reserve was six pixels of pitch thrown away on
    // a short frame, which is 12% of the socket size on desktop.
    const byH = Math.floor((availH - 16) / (R + 0.32));
    const byW = Math.floor((LW * 0.46) / 2.6);
    pitch = Math.max(30, Math.min(78, Math.min(byH, byW)));
    inset = Math.round(pitch * 0.16);             // top and bottom only
    bleed = Math.round(pitch * 0.22);             // runs off the wall's edge
    gapX = Math.round(pitch * 0.11);              // between the two gangs
    padR = Math.round(pitch * 0.22);              // plate edge to gang, right
    padL = padR + bleed;                          // ... and left, absorbing the bleed
    plateW = padL + COLS * pitch + gapX + padR;
    const plateH = R * pitch + 2 * inset;
    stripY = Math.round(TOP_BAND + (availH - plateH) / 2);
    stripX = -bleed;
    looseX = Math.round(LW - (LW < 520 ? 112 : 146));
  }
  const cellCX = (c) => stripX + padL + pitch * (c + 0.5) + gapX * c;
  const cellCY = (r) => stripY + inset + pitch * (r + 0.5);
  const cellRC = (i) => ({ r: (i / COLS) | 0, c: i % COLS });
  const plateRight = () => stripX + plateW;

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
  const heldOrient = () => (held < 0 ? 0 : (place[held] ? place[held].oi : (board.plugs[held]._oi | 0)));
  // Every way the held plug could sit, in the order the model lists them.
  const optionsFor = (i) => M.placements(board.plugs[i], board.R);
  function freeFor(i, pl) {
    for (let k = 0; k < place.length; k++) {
      if (k === i || !place[k]) continue;
      for (const c of pl.cells) if (place[k].cells.indexOf(c) >= 0) return false;
    }
    return true;
  }
  // The placement this plug would take if dropped on cell `at`, in its current
  // orientation. Null when it cannot sit there at all.
  function placementAt(i, at, oi) {
    const opts = optionsFor(i);
    const orients = board.plugs[i].flips.length + 1;
    for (const pl of opts) {
      const thisOi = pl.flipped ? 1 : 0;
      if (thisOi !== (oi % orients ? 1 : 0)) continue;
      if (pl.pin !== at) continue;
      return pl;
    }
    return null;
  }
  const reaches = (i, pin) => {
    const r = board.reach[board.plugs[i].id];
    return !r || Math.abs(((pin / COLS) | 0) - r.at) <= r.slack;
  };
  const earthOk = (i, pin) => board.plugs[i].pins !== 3 || board.earthed.has(pin);
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
    drawPlate();
    for (let i = 0; i < board.plugs.length; i++) if (place[i]) drawSeated(i, now);
    // Cables last, so they lie ACROSS the board the way a real lead does when
    // its plug is in the far gang. Drawn underneath, a plug in the left column
    // looked unconnected.
    for (let i = 0; i < board.plugs.length; i++) if (place[i]) drawCable(i, now);
    drawLoosePlugs(now);
    drawHUD();
    if (phase === 'play') drawControls();
    if (phase === 'won') drawWin();
    if (phase === 'menu') drawRules();
  }

  function drawReachBand() {
    if (held < 0) return;
    const r = board.reach[board.plugs[held].id]; if (!r) return;
    const a = Math.max(0, r.at - r.slack), b = Math.min(board.R - 1, r.at + r.slack);
    const y0 = cellCY(a) - pitch / 2 - inset / 2, y1 = cellCY(b) + pitch / 2 + inset / 2;
    ctx.fillStyle = 'rgba(61,220,132,0.10)';
    RR(stripX - 8, y0, LW - stripX + 8, y1 - y0, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(61,220,132,0.32)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
    RR(stripX - 8, y0, LW - stripX + 8, y1 - y0, 12); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(61,220,132,0.85)'; ctx.font = '700 10px Inter, sans-serif';
    ctx.textAlign = 'right'; ctx.fillText('THIS LEAD REACHES HERE', LW - 14, y0 + 7);
    ctx.textAlign = 'left';
  }

  function drawPlate() {
    const R = board.R, plateH = R * pitch + 2 * inset;
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.filter = 'blur(12px)';
    RR(stripX - 20, stripY + 9, plateW + 26, plateH, [0, 16, 16, 0]); ctx.fill();
    ctx.filter = 'none'; ctx.restore();
    const sg = ctx.createLinearGradient(stripX, 0, stripX + plateW, 0);
    sg.addColorStop(0, CASE_HI); sg.addColorStop(0.18, CASE); sg.addColorStop(0.82, CASE_LO); sg.addColorStop(1, CASE_EDGE);
    ctx.fillStyle = sg; RR(stripX - 20, stripY, plateW + 20, plateH, [0, 16, 16, 0]); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(stripX - 20, stripY + 1); ctx.lineTo(stripX + plateW - 14, stripY + 1); ctx.stroke();
    const screw = (cx, cy) => {
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.arc(cx, cy, 3.4, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(cx - 2.2, cy); ctx.lineTo(cx + 2.2, cy); ctx.stroke();
    };
    const midX = (cellCX(0) + cellCX(COLS - 1)) / 2;   // down the gap, as on a real board
    screw(midX, stripY + inset * 0.55);
    screw(midX, stripY + plateH - inset * 0.55);
    for (let r = 0; r < R; r++) for (let c = 0; c < COLS; c++) drawSocket(r * COLS + c);
  }

  function drawSocket(i) {
    const { r, c } = cellRC(i);
    const cx = cellCX(c), cy = cellCY(r), s = Math.min(46, pitch * 0.8);
    let usable = false, inReach = false, wantsEarth = false;
    if (held >= 0) {
      const pl = placementAt(held, i, heldOrient());
      usable = !!pl && freeFor(held, pl) && earthOk(held, i);
      inReach = reaches(held, i);
      wantsEarth = board.plugs[held].pins === 3 && !board.earthed.has(i);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; RR(cx - s / 2 - 2, cy - s / 2 - 2, s + 4, s + 4, 10); ctx.fill();
    const rg = ctx.createLinearGradient(0, cy - s / 2, 0, cy + s / 2);
    if (usable && inReach) { rg.addColorStop(0, '#d8f5e3'); rg.addColorStop(1, '#a8e6c2'); }
    else if (usable) { rg.addColorStop(0, '#f6e6c2'); rg.addColorStop(1, '#e5cf9c'); }
    else { rg.addColorStop(0, CASE); rg.addColorStop(1, CASE_LO); }
    ctx.fillStyle = rg; RR(cx - s / 2, cy - s / 2, s, s, 8); ctx.fill();
    ctx.strokeStyle = (wantsEarth && held >= 0) ? 'rgba(229,88,74,0.5)' : 'rgba(0,0,0,0.22)';
    ctx.lineWidth = (wantsEarth && held >= 0) ? 2 : 1; ctx.stroke();
    contactFace(cx, cy, s / 46, board.earthed.has(i) ? 3 : 2, true);
    if (usable) uiButtons.push({ x: cx - pitch * 0.5, y: cy - pitch * 0.5, w: pitch, h: pitch, act: () => putDown(i) });
  }

  function bodyBox(p, pl, slide) {
    const rc0 = cellRC(pl.cells[0]);
    return {
      // the body overhangs its cell by 0.3 of the gap either side, so two plugs
      // in neighbouring gangs still show daylight between them
      x: cellCX(rc0.c) - pitch / 2 - gapX * 0.3 + (slide || 0),
      y: cellCY(rc0.r) - pitch / 2 - inset * 0.35,
      w: p.w * pitch + (p.w - 1) * gapX + gapX * 0.6,
      h: p.h * pitch + inset * 0.7,
    };
  }

  function drawSeated(i, now) {
    const p = board.plugs[i], pl = place[i], col = PLUGS[i % PLUGS.length];
    const t = Math.min(1, (now - (seatT[i] || -1e9)) / SEAT_MS);
    const slide = (1 - (1 - Math.pow(1 - t, 3))) * 40;
    const B = bodyBox(p, pl, slide);
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.filter = 'blur(6px)';
    plugPath(p.kind, B.x + 3, B.y + 7, B.w, B.h, pl.flipped); ctx.fill(); ctx.filter = 'none'; ctx.restore();
    const g = ctx.createLinearGradient(B.x, B.y, B.x + B.w * 0.4, B.y + B.h);
    g.addColorStop(0, mix(col.c, '#ffffff', 0.30)); g.addColorStop(0.45, col.c);
    g.addColorStop(1, mix(col.c, col.d, 0.45));
    plugPath(p.kind, B.x, B.y, B.w, B.h, pl.flipped);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.30)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.34)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(B.x + 3, B.y + 1.2); ctx.lineTo(B.x + B.w, B.y + 1.2); ctx.stroke();
    const ribs = p.kind === 'brick' ? 3 : (p.kind === 'bar' ? 2 : 0);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
    for (let k = 1; k <= ribs; k++) {
      const ry = B.y + (B.h * k) / (ribs + 1);
      ctx.beginPath(); ctx.moveTo(B.x + B.w * 0.22, ry); ctx.lineTo(B.x + B.w * 0.88, ry); ctx.stroke();
    }
    ctx.restore();
    const pc = cellRC(pl.pin);
    contactFace(cellCX(pc.c) + slide, cellCY(pc.r), Math.min(46, pitch * 0.8) / 46 * 0.86, p.pins, false);
    const lab = KIND_LABEL[p.kind];
    if (lab && B.h > 46) {
      ctx.save(); ctx.translate(B.x + B.w * 0.5, B.y + B.h - 12);
      ctx.fillStyle = 'rgba(255,255,255,0.38)'; ctx.font = '700 9px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.fillText(lab, 0, 0); ctx.restore(); ctx.textAlign = 'left';
    }
    if (held === i) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2.5;
      plugPath(p.kind, B.x - 2, B.y - 2, B.w + 4, B.h + 4, pl.flipped); ctx.stroke();
    }
    uiButtons.push({ x: B.x, y: B.y, w: B.w, h: B.h, act: () => pickUp(i) });
  }

  function drawCable(i, now) {
    const p = board.plugs[i], pl = place[i], col = PLUGS[i % PLUGS.length];
    const ok = reaches(i, pl.pin);
    const pc = cellRC(pl.pin);
    const x0 = plateRight() + 2, cy = cellCY(pc.r);
    const ay = cellCY(board.reach[p.id].at), ax = LW + 24;
    const sag = ok ? 26 : 2;
    ctx.lineCap = 'round';
    const draw = (w, c) => { ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x0, cy);
      ctx.bezierCurveTo(x0 + 30, cy + sag, ax - 70, ay + sag, ax, ay); ctx.stroke(); };
    ctx.fillStyle = mix(col.c, '#000000', 0.34); RR(x0 - 11, cy - 8, 17, 16, 6); ctx.fill();
    draw(8, 'rgba(0,0,0,0.42)');
    draw(6, ok ? mix(col.c, '#000000', 0.26) : BAD);
    draw(2, ok ? mix(col.c, '#ffffff', 0.22) : mix(BAD, '#ffffff', 0.32));
    if (!ok) {
      ctx.fillStyle = BAD; ctx.font = '700 10px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('WON’T REACH', Math.min(LW - 56, (x0 + ax) / 2), (cy + ay) / 2 - 14);
      ctx.textAlign = 'left';
    } else {
      const lt = Math.min(1, (now - litT[i]) / LIGHT_MS);
      const pulse = 1 + Math.sin(Math.min(1, lt) * Math.PI) * 1.5;
      ctx.fillStyle = 'rgba(255,209,102,' + (0.08 + 0.20 * (1 - lt)) + ')';
      ctx.beginPath(); ctx.arc(LW - 24, ay, 15 * pulse, 0, 7); ctx.fill();
      ctx.fillStyle = LIVE; ctx.beginPath(); ctx.arc(LW - 24, ay, 4.5, 0, 7); ctx.fill();
    }
  }

  let looseLayout = [];
  function computeLooseLayout() {
    const waiting = [];
    for (let i = 0; i < board.plugs.length; i++) if (!place[i]) waiting.push(i);
    waiting.sort((a, b) => board.reach[board.plugs[a].id].at - board.reach[board.plugs[b].id].at);
    // Each waiting plug sits at the height of the row it reaches, so the lead
    // runs straight across and you can read its target without moving it. It
    // only slides down when the plug above is already there.
    const top = TOP_BAND + 6, bottom = LH - botBand - 8;
    const avail = Math.max(80, bottom - top);
    const build = (k) => {
      const out = [];
      let prevBottom = -1e9;
      for (const i of waiting) {
        const p = board.plugs[i];
        const h = p.h * pitch * 0.78 * k, w = p.w * pitch * 0.78 * k;
        let y = cellCY(board.reach[p.id].at) - h / 2;
        if (y < prevBottom + 10 * k) y = prevBottom + 10 * k;
        prevBottom = y + h;
        out.push({ i, y, h, w });
      }
      return out;
    };
    const spanOf = (a) => a.length ? a[a.length - 1].y + a[a.length - 1].h - a[0].y : 0;

    let lay = build(1);
    // Eight plugs at full size are taller than a 600px frame can hold. The old
    // code slid the whole column up until the bottom fitted, which pushed the
    // top plugs clean off the canvas — and since a plug's hit box comes from
    // where it was drawn, those plugs could not be picked up at all. Shrink the
    // tray to fit instead: every plug stays reachable, and because they all
    // shrink together their relative footprints stay honest.
    for (let n = 0, k = 1; n < 6; n++) {
      const s = spanOf(lay);
      if (s <= avail) break;
      k = Math.max(0.4, k * (avail / s) * 0.98);
      lay = build(k);
    }
    if (lay.length) {
      const over = lay[lay.length - 1].y + lay[lay.length - 1].h - bottom;
      if (over > 0) lay.forEach(o => { o.y -= over; });
      const under = top - lay[0].y;
      if (under > 0) lay.forEach(o => { o.y += under; });
    }
    looseLayout = lay;
  }

  // A waiting plug is drawn at its TRUE footprint, so what it will cost is
  // visible before a turn is spent finding out.
  function drawLoosePlugs(now) {
    computeLooseLayout();
    for (const { i, y, h, w } of looseLayout) {
      const p = board.plugs[i], col = PLUGS[i % PLUGS.length];
      const lx = looseX - w * 0.5, cy = y + h / 2;
      const ay = cellCY(board.reach[p.id].at);
      ctx.save(); ctx.globalAlpha = held === i ? 1 : 0.94; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.42)'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(lx + w, cy + 2);
      ctx.bezierCurveTo(lx + w + 44, cy + 12, LW - 44, ay + 8, LW + 24, ay + 2); ctx.stroke();
      ctx.strokeStyle = mix(col.c, '#000000', 0.28); ctx.lineWidth = 5.5;
      ctx.beginPath(); ctx.moveTo(lx + w, cy);
      ctx.bezierCurveTo(lx + w + 44, cy + 10, LW - 44, ay + 6, LW + 24, ay); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.36)'; ctx.filter = 'blur(7px)';
      ctx.beginPath(); ctx.ellipse(lx + w * 0.5, y + h + 5, w * 0.55, 7, 0, 0, 7); ctx.fill();
      ctx.filter = 'none';
      const g = ctx.createLinearGradient(lx, y, lx + w * 0.4, y + h);
      g.addColorStop(0, mix(col.c, '#ffffff', 0.3)); g.addColorStop(0.45, col.c);
      g.addColorStop(1, mix(col.c, col.d, 0.45));
      plugPath(p.kind, lx, y, w, h, !!p._oi); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.32)'; ctx.lineWidth = 1; ctx.stroke();
      const pin = p._oi && p.flips.length ? p.flips[0] : p.pin;
      contactFace(lx + w * (pin[1] + 0.5) / p.w, y + h * (pin[0] + 0.5) / p.h,
                  Math.min(46, pitch * 0.8) / 46 * 0.78, p.pins, false);
      if (p.cells > 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '700 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.w + '×' + p.h, lx + w * 0.5, y + h - 11);
        ctx.textAlign = 'left';
      }
      if (held === i) {
        ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 2.5;
        plugPath(p.kind, lx - 3, y - 3, w + 6, h + 6, !!p._oi); ctx.stroke();
      }
      ctx.restore();
      uiButtons.push({ x: lx - 8, y: y - 8, w: w + 16, h: h + 16, act: () => tapTray(i) });
    }
  }


  // a detail and a marking in the middle is a statement.
  function contactFace(cx, cy, u, n, dark) {
    // Rotated a quarter turn anticlockwise. On a real socket the line through
    // the two blades is perpendicular to the cable hanging out of the plug; our
    // leads run sideways off the wall, so the blades have to stack rather than
    // sit side by side, and the earth swings round with them.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 2);
    cx = 0; cy = 0;
    const blade = (bx, by, w, h, r) => {
      ctx.fillStyle = dark ? '#0a0d14' : 'rgba(22,25,32,0.82)';
      RR(bx, by, w, h, r); ctx.fill();
      if (!dark) { ctx.fillStyle = 'rgba(255,255,255,0.30)'; RR(bx, by + h - 1.2, w, 1.2, 0.6); ctx.fill(); }
    };
    const by = n === 3 ? cy - 15 * u : cy - 9 * u;
    blade(cx - 11 * u, by, 5.5 * u, 15 * u, 2.2);
    blade(cx + 5.5 * u, by, 5.5 * u, 15 * u, 2.2);
    if (n === 3) blade(cx - 3.5 * u, cy + 5 * u, 7 * u, 10 * u, 3.5);
    ctx.restore();
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
    const msg = held >= 0 ? 'Now tap a socket, or tap it again to turn it round.'
      : (place.every(Boolean) ? 'Something is not reaching. Move it nearer its lead.'
                              : 'Tap a plug on the floor to pick it up.');
    ctx.fillText(msg, LW / 2, LH - 28);
    ctx.textAlign = 'left';
  }

  function drawWin() {
    ctx.fillStyle = 'rgba(8,13,24,0.86)'; ctx.fillRect(0, 0, LW, LH);
    ctx.textAlign = 'center';
    ctx.fillStyle = GOOD; ctx.font = '800 34px Inter, sans-serif';
    ctx.fillText('EVERYTHING IS ON', LW / 2, LH / 2 - 60);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '600 16px Inter, sans-serif';
    ctx.fillText(board.plugs.length + ' plugs, ' + (board.R * COLS) + ' sockets, ' + moves + ' moves', LW / 2, LH / 2 - 20);
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
                   'Three-pin plugs need a socket with an earth. Only some of them have one.',
                   'Some plugs turn round, which swaps the side their body covers.'];
    ctx.font = '500 14px Inter, sans-serif';
    let h = 34 + 46 + 16;
    rules.forEach(() => { h += 3 * 20 + 12; });
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
    if (place[held]) {
      // Turning a seated plug means finding the same footprint with the other
      // pin cell. If that arrangement is not legal, the turn simply does not
      // happen — better than silently dropping it out of the wall.
      const want = place[held].flipped ? 0 : 1;
      const alt = optionsFor(held).find(pl =>
        (pl.flipped ? 1 : 0) === want &&
        pl.cells.length === place[held].cells.length &&
        pl.cells.every(c => place[held].cells.indexOf(c) >= 0));
      if (alt && freeFor(held, alt) && earthOk(held, alt.pin)) {
        place[held] = alt; moves++;
        if (reaches(held, alt.pin)) snd.live(reachingCount()); else snd.strain();
      }
    } else {
      p._oi = p._oi ? 0 : 1;
      snd.lift();
    }
    render();
  }
  function pickUp(i) {
    if (held === i) { flipHeld(); checkWin(); return; }
    held = i; snd.pull(); render();
  }
  function putDown(at) {
    if (held < 0) return;
    const pl = placementAt(held, at, heldOrient());
    if (!pl || !freeFor(held, pl) || !earthOk(held, at)) return;
    const wasLive = place[held] && reaches(held, place[held].pin);
    place[held] = pl;
    seatT[held] = performance.now();
    snd.seat();
    if (reaches(held, at)) { if (!wasLive) litT[held] = performance.now(); snd.live(reachingCount()); }
    else snd.strain();
    moves++; held = -1;
    checkWin(); kick();
  }
  function checkWin() {
    if (phase === 'play' && solved()) { phase = 'won'; wonT = performance.now(); snd.win(); kick(); }
  }
  function doSolve() {
    board.plugs.forEach((p, i) => { place[i] = board.solution[i]; seatT[i] = performance.now(); litT[i] = performance.now(); });
    held = -1; checkWin(); kick();
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
    get state() { return { level, R: board.R, cols: COLS, cells: board.R * COLS, plugs: board.plugs.length, placed: placedCount(), reaching: reachingCount(), moves, phase, solutions: board.solutions, slack: board.slack }; },
    get board() { return board; },
    get placement() { return place.map(p => p && { ...p }); },
    get held() { return held; },
    pick(i) { held = i; render(); return held; },
    goto(n) { startLevel(n); }, solve: doSolve,
    put(i, at, oi) { const pl = placementAt(i, at, oi | 0); if (!pl) return 'illegal'; place[i] = pl; seatT[i] = performance.now(); litT[i] = performance.now(); checkWin(); kick(); return this.state; },
    canPlace: (i, at, oi) => { const pl = placementAt(i, at, oi | 0); return !!pl && freeFor(i, pl) && earthOk(i, at); },
    reaches: (i, pin) => reaches(i, pin),
    get buttons() { render(); return uiButtons.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h })); },
    get geom() { return { LW, LH, stripX, plateW, stripY, pitch, inset, padL, padR, gapX, bleed, looseX, R: board.R, COLS, TOP_BAND, botBand }; },
    // Where the waiting plugs actually ended up. Reading this beats measuring
    // pixels: the leads cross the empty floor, so any reference column you pick
    // for a background is itself painted on some frames.
    get loose() { render(); return looseLayout.map(o => ({ i: o.i, y: Math.round(o.y), h: Math.round(o.h), w: Math.round(o.w), x: Math.round(looseX - o.w / 2) })); },
    socketBox(c) { const s = Math.min(46, pitch * 0.8); return { l: cellCX(c) - s / 2, r: cellCX(c) + s / 2 }; },
  };

  // ---------- boot ----------
  setCanvasVars(); resizeCanvas(); fitFullscreen(); resizeCanvas();
  startLevel(loadLevel());
  setTimeout(onResize, 0); setTimeout(onResize, 300);
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
})();
