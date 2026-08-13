/* ============================================================
   WIRE · a Zamborin Game

   Birds come in one at a time and you choose which wire they land on. The
   birds already there budge along to make room. Land them all.

   THE FEUD IS THE PUZZLE. Measured before any of this was drawn, and the
   measurement is the whole reason the game exists in this shape. With birds
   that simply take up room, best-fit — one textbook rule, no thinking — wins
   69-92% of boards, and nothing you do early can hurt you. Give some kinds of
   bird a neighbour they refuse to sit beside and that collapses: best-fit
   drops to 6%, 72% of boards defeat every unplanned strategy, and half your
   opening moves can lose the level. model2.js and measure2.js hold the work.

   Birds only ever land on the END of a wire. That is not a simplification, it
   is a measurement: searching end-slots only, every board is still solvable,
   0% need a bird squeezed into the middle. So the whole game is which wire,
   which side, which is one tap.

   The queue is fully visible on purpose. The difficulty is meant to be in
   reading what is coming, not in being surprised by it.
   ============================================================ */
(() => {
  'use strict';

  const M = window.WIRE_MODEL_2;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let LW = 390, LH = 844;

  // The splash is a bright daytime sky, so the game is too — a dark board
  // behind that photograph would land like a different game. Everything drawn
  // on top is therefore dark ON light, which is the opposite of the rest of the
  // shelf and has to be checked rather than assumed.
  const SKY_TOP = '#7FB6E4', SKY_MID = '#A9D2EE', SKY_LOW = '#D6E7F2', SKY_BOT = '#F3E3CE';
  // Solved, not guessed. On the dark boards of every other game a 0.62 ink is
  // comfortable; against this sky it measures 3.3:1 and fails AA. 0.82 is the
  // first value that clears 4.5:1 against the TOP of the gradient, which is the
  // lightest thing any label sits on, and it clears 7:1 lower down.
  const INK = '#12253E', INK_DIM = 'rgba(18,37,62,0.82)', INK_FAINT = 'rgba(18,37,62,0.42)';
  const WIRE_COL = '#6E6656', POLE = '#6B5B48', POLE_DK = '#4E4132';
  const GOOD = '#1C7A47', BAD = '#B3372B';

  // Four kinds, told apart by silhouette first and colour second, because
  // colour alone is not something everyone can use.
  const KINDS = [
    { name: 'starling', body: '#1B2432', belly: null,      tail: 1.00, plump: 0.86, crest: 0 },
    { name: 'sparrow',  body: '#5A4230', belly: '#A98D6B', tail: 0.55, plump: 1.00, crest: 0 },
    { name: 'magpie',   body: '#14171E', belly: '#EDF1F5', tail: 1.35, plump: 0.72, crest: 0 },
    { name: 'finch',    body: '#4A5A2E', belly: null,      tail: 0.70, plump: 0.94, crest: 1 },
  ];

  // ---------- sound ----------
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zamborin-wire.sound' }) : null;
  const snd = {
    on: () => !!(sfx && sfx.isOn()),
    ready() { if (sfx) sfx.ensureAudio(); },
    toggle() { if (!sfx) return; sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.tone(880, 0.05, 0.03, 'sine'); },
    land(n) {
      if (!sfx) return;
      const step = Math.min(11, Math.max(0, n % 12));
      sfx.tone(659.25 * Math.pow(2, step / 12), 0.13, 0.030, 'triangle');
      sfx.noise(0.04, 3000, 1.4, 0.012);
    },
    budge() { if (sfx) sfx.noise(0.05, 1600, 1.1, 0.014); },
    refuse() { if (sfx) { sfx.tone(150, 0.14, 0.030, 'square'); sfx.noise(0.05, 500, 0.9, 0.014); } },
    undo() { if (sfx) sfx.tone(392, 0.08, 0.022, 'sine'); },
    stuck() { if (sfx) { sfx.tone(180, 0.30, 0.034, 'sawtooth'); sfx.tone(120, 0.34, 0.028, 'sine'); } },
    win() { if (sfx) sfx.arpeggio(659.25, 0.10, 2); },
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
  let board = null, state = [], k = 0, level = 1, moves = 0, phase = 'play';
  let history = [], uiButtons = [], raf = 0, animEnd = 0;
  // Every bird carries the moment it landed and where it sat before, so a drop
  // and the budge it causes can play at the same time.
  let landT = new Map(), lastX = new Map(), budgeT = 0;
  const LAND_MS = 300, BUDGE_MS = 340;
  const LS = 'zamborin-wire.level';
  const saveLevel = () => { try { localStorage.setItem(LS, String(level)); } catch (e) {} };
  const loadLevel = () => { try { const v = parseInt(localStorage.getItem(LS), 10); return (v >= 1 && v <= 999) ? v : 1; } catch (e) { return 1; } };

  // ---------- layout ----------
  // Reserving a token strip for the controls and hoping is how three earlier
  // games ended up with buttons three pixels from the board. The bottom band is
  // a real number and the wires get what is left.
  const BOT_BAND = 96;
  const QUEUE_STEP = 30, QUEUE_ROW_H = 34;
  const perRow = () => Math.max(4, Math.floor((LW - 44) / QUEUE_STEP));
  let topBand = 150, rowH = 90, unit = 22, wireLeft = 40, wireMaxW = 300;
  function layout() {
    if (!board) return;
    const n = board.spans.length;
    const queueRows = Math.max(1, Math.ceil(board.queue.length / perRow()));
    topBand = 92 + queueRows * QUEUE_ROW_H + (board.feuds.size ? 62 : 0);
    const avail = Math.max(120, LH - topBand - BOT_BAND);
    rowH = Math.min(150, Math.floor(avail / n));
    wireLeft = LW < 420 ? 34 : 44;
    wireMaxW = LW - wireLeft * 2;
    // Every wire is drawn to its true capacity, so how much room is left is
    // something you can see rather than count. The cap is set by the BIRDS, not
    // the wires: a bird is w * unit across, so a unit that makes a short wire
    // fill the screen makes a three-wide bird wider than a thumb.
    const widest = Math.max(...board.spans);
    unit = Math.max(12, Math.min(34, Math.floor(wireMaxW / Math.max(1, widest))));
    // whatever height is left over goes above and below the stack, not under it
    stackTop = topBand + Math.max(0, Math.floor((avail - rowH * n) / 2));
  }
  let stackTop = 150;
  const spanW = (s) => board.spans[s] * unit;
  // Short wires are genuinely short, so centring them reads as a row of
  // telephone lines rather than a left-aligned bar chart.
  const spanX = (s) => Math.round((LW - spanW(s)) / 2);
  const spanY = (s) => Math.round(stackTop + rowH * s + rowH * 0.62);

  // ---------- helpers ----------
  const RR = (a, b, c, d, r) => { ctx.beginPath(); ctx.roundRect(a, b, c, d, r); };
  const used = (s) => M.cost(state[s]);
  const done = () => k >= board.queue.length;
  const nextBird = () => (done() ? null : board.queue[k]);

  // Only the ends. Measured: no board ever needs a bird squeezed into a middle,
  // so offering middles would add taps without adding puzzle.
  function endMoves() {
    if (done()) return [];
    const bird = board.queue[k], out = [];
    for (let s = 0; s < state.length; s++) {
      const l = state[s];
      for (const p of (l.length ? [0, l.length] : [0])) {
        if (M.canInsert(board, l, p, bird, board.spans[s])) out.push({ s, p });
      }
    }
    return out;
  }
  const canLand = (s, side) => {
    const l = state[s], p = side === 'L' ? 0 : l.length;
    return !done() && M.canInsert(board, l, p, board.queue[k], board.spans[s]);
  };

  // Where each bird sits along its wire. Birds pack in order and whatever wire
  // is spare is shared out evenly around them, so a crowded wire looks crowded
  // and adding one shuffles everybody. That shuffle is the whole pleasure.
  function positions(s) {
    const l = state[s], cap = board.spans[s];
    const bodies = l.reduce((a, b) => a + b.w, 0);
    const slack = Math.max(0, cap - bodies);
    const gaps = l.length + 1;
    const each = slack / gaps;
    const out = [];
    let x = each;
    for (const b of l) { out.push(x + b.w / 2); x += b.w + each; }
    return out;
  }

  // ---------- birds ----------
  // Silhouettes first: tail length, how plump, and whether it has a crest all
  // differ before any colour is involved.
  function drawBird(cx, baseY, w, sp, alpha, ghost, unitPx) {
    const u = unitPx == null ? unit : unitPx;
    const kind = KINDS[sp % KINDS.length];
    // Width is how much wire the bird takes, so it has to scale with w. Height
    // must NOT: three times as wide and three times as tall is nine times the
    // bird, which is a goose. A wide one reads as a fat pigeon instead.
    const bw = w * u * 0.90;
    const bh = u * (0.92 + 0.26 * w) * kind.plump;
    const cy = baseY - bh * 0.62;                 // body sits ABOVE the wire, on its feet
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    const body = ghost ? 'rgba(18,37,62,0.22)' : kind.body;

    // Tail first, so the body overlaps its root. It sweeps back and down past
    // the wire, which is what a perched bird's tail actually does.
    // Scaled by the UNIT, never by the bird's own height: tied to bh it
    // compounded with width, and a three-wide magpie hung 40px below its wire
    // and crossed the one underneath.
    const tl = u * 0.80 * kind.tail;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(cx - bw * 0.28, cy - bh * 0.10);
    ctx.quadraticCurveTo(cx - bw * 0.40 - tl * 0.35, cy + bh * 0.28, cx - bw * 0.34 - tl * 0.62, cy + bh * 0.34 + tl * 0.72);
    ctx.quadraticCurveTo(cx - bw * 0.16 - tl * 0.30, cy + bh * 0.30 + tl * 0.40, cx - bw * 0.06, cy + bh * 0.26);
    ctx.closePath(); ctx.fill();

    // legs
    ctx.strokeStyle = ghost ? INK_FAINT : '#4A3524';
    ctx.lineWidth = Math.max(1, u * 0.055);
    ctx.beginPath();
    ctx.moveTo(cx - bw * 0.06, cy + bh * 0.30); ctx.lineTo(cx - bw * 0.05, baseY);
    ctx.moveTo(cx + bw * 0.12, cy + bh * 0.30); ctx.lineTo(cx + bw * 0.13, baseY);
    ctx.stroke();

    // body
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(cx, cy, bw * 0.42, bh * 0.42, 0, 0, 7); ctx.fill();

    // pale belly, where the kind has one
    if (kind.belly && !ghost) {
      ctx.save();
      ctx.beginPath(); ctx.ellipse(cx, cy, bw * 0.42, bh * 0.42, 0, 0, 7); ctx.clip();
      ctx.fillStyle = kind.belly;
      ctx.beginPath(); ctx.ellipse(cx + bw * 0.12, cy + bh * 0.20, bw * 0.30, bh * 0.26, 0, 0, 7); ctx.fill();
      ctx.restore();
      ctx.fillStyle = body;
    }

    // head, clearly up and forward of the body
    const hr = bh * 0.27, hx = cx + bw * 0.26, hy = cy - bh * 0.46;
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, 7); ctx.fill();
    // the neck, so head and body are one animal
    ctx.beginPath();
    ctx.moveTo(hx - hr * 0.95, hy + hr * 0.20);
    ctx.quadraticCurveTo(cx - bw * 0.02, cy - bh * 0.30, cx + bw * 0.06, cy - bh * 0.05);
    ctx.lineTo(hx + hr * 0.70, hy + hr * 0.55);
    ctx.closePath(); ctx.fill();
    if (kind.crest) {
      ctx.beginPath();
      ctx.moveTo(hx - hr * 0.55, hy - hr * 0.72);
      ctx.quadraticCurveTo(hx - hr * 0.15, hy - hr * 2.0, hx + hr * 0.62, hy - hr * 0.80);
      ctx.closePath(); ctx.fill();
    }
    // beak
    ctx.beginPath();
    ctx.moveTo(hx + hr * 0.70, hy - hr * 0.22);
    ctx.lineTo(hx + hr * 1.95, hy + hr * 0.10);
    ctx.lineTo(hx + hr * 0.70, hy + hr * 0.42);
    ctx.closePath();
    ctx.fillStyle = ghost ? 'rgba(18,37,62,0.22)' : '#D08B33'; ctx.fill();
    // eye
    if (!ghost && hr > 2.4) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(hx + hr * 0.28, hy - hr * 0.12, Math.max(0.8, hr * 0.20), 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- render ----------
  function render(now) {
    now = now || performance.now();
    uiButtons = [];
    drawSky();
    drawWires(now);
    drawQueue();
    drawFeuds();
    drawHUD();
    drawControls();
    if (phase === 'menu') drawRules();
    if (phase === 'won') drawWin();
    if (phase === 'stuck') drawStuck();
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, LH);
    g.addColorStop(0, SKY_TOP); g.addColorStop(0.42, SKY_MID);
    g.addColorStop(0.76, SKY_LOW); g.addColorStop(1, SKY_BOT);
    ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
    // a couple of soft cirrus bands, drawn low so they never sit behind text
    ctx.save();
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(LW * 0.72, LH * 0.80, LW * 0.42, 16, -0.04, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.34;
    ctx.beginPath(); ctx.ellipse(LW * 0.26, LH * 0.90, LW * 0.36, 12, 0.03, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawWires(now) {
    for (let s = 0; s < board.spans.length; s++) {
      const x0 = spanX(s), y = spanY(s), w = spanW(s);
      const sag = Math.min(12, w * 0.035);

      // poles at each end
      drawPole(x0 - 8, y);
      drawPole(x0 + w + 8, y);

      // the wire itself, with a little sag
      ctx.strokeStyle = WIRE_COL; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0 - 8, y);
      ctx.quadraticCurveTo(x0 + w / 2, y + sag * 2, x0 + w + 8, y);
      ctx.stroke();

      // where this bird could land
      if (phase === 'play' && !done()) {
        for (const side of ['L', 'R']) {
          const ok = canLand(s, side);
          const half = w / 2;
          const hx = side === 'L' ? x0 : x0 + half;
          const hy = y - rowH * 0.52, hh = rowH * 0.72;
          if (ok) {
            const bandH = 26, by = y - bandH - 2;
            ctx.fillStyle = 'rgba(28,122,71,0.12)';
            RR(hx + 2, by, half - 4, bandH + 8, 8); ctx.fill();
            ctx.strokeStyle = 'rgba(28,122,71,0.40)'; ctx.lineWidth = 1.3;
            ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
            // a small mark at the exact end the bird will take
            const mx = side === 'L' ? x0 + 7 : x0 + w - 7;
            ctx.fillStyle = 'rgba(28,122,71,0.75)';
            ctx.beginPath(); ctx.arc(mx, y, 3.4, 0, 7); ctx.fill();
            // the tap target stays generous even though the paint is not
            uiButtons.push({ x: hx, y: y - rowH * 0.5, w: half, h: rowH * 0.7, act: () => land(s, side) });
          }
        }
      }

      // the birds
      const pos = positions(s);
      state[s].forEach((b, i) => {
        const target = x0 + pos[i] * unit;
        let bx = target, a = 1;
        const t0 = landT.get(b);
        if (t0 != null) {
          const t = Math.min(1, (now - t0) / LAND_MS);
          if (t < 1) a = t;                                  // fading in as it settles
        }
        const from = lastX.get(b);
        if (from != null && from !== target) {
          const t1 = Math.min(1, (now - (budgeT || 0)) / BUDGE_MS);
          const e = 1 - Math.pow(1 - t1, 3);
          bx = from + (target - from) * e;
          if (t1 >= 1) lastX.set(b, target);
        } else if (from == null) lastX.set(b, target);
        const wireYAt = y + Math.sin(((bx - x0) / Math.max(1, w)) * Math.PI) * sag;
        drawBird(bx, wireYAt, b.w, b.sp, a, false);
      });

      // how much wire is left, in plain words, under the span
      const left = board.spans[s] - used(s);
      // On a chip, because tails sweep back and down across exactly this spot
      // and a bare label disappears under a magpie.
      const txt = left === 0 ? 'full' : left + ' left';
      ctx.font = '600 11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const tw = ctx.measureText(txt).width, ly = y + Math.min(16, rowH * 0.16);
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      RR(x0 + w / 2 - tw / 2 - 6, ly - 2, tw + 12, 16, 8); ctx.fill();
      ctx.fillStyle = left === 0 ? '#8E2A20' : INK_DIM;
      ctx.fillText(txt, x0 + w / 2, ly);
      ctx.textAlign = 'left';
    }
  }

  function drawPole(x, y) {
    // Short stubs. Tied to rowH they grew with the row and started competing
    // with the birds for attention, which is backwards.
    const h = Math.min(46, rowH * 0.30);
    ctx.fillStyle = POLE; ctx.fillRect(x - 3, y - 4, 6, h);
    ctx.fillStyle = POLE_DK; ctx.fillRect(x + 1, y - 4, 2, h);
    ctx.fillStyle = POLE; RR(x - 7, y - 8, 14, 5, 2); ctx.fill();
  }

  function drawQueue() {
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = INK_DIM; ctx.font = '700 11px Inter, sans-serif';
    ctx.fillText('STILL TO LAND', 22, 78);
    const startY = 96, step = QUEUE_ROW_H;
    for (let i = k; i < board.queue.length; i++) {
      const j = i - k;
      const bx = 26 + (j % perRow()) * QUEUE_STEP, by = startY + Math.floor(j / perRow()) * step;
      if (i === k) {
        ctx.fillStyle = 'rgba(18,37,62,0.10)';
        RR(bx - 13, by - 4, 27, 30, 8); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.stroke();
      }
      const b = board.queue[i];
      drawBird(bx, by + 24, b.w, b.sp, i === k ? 1 : 0.45, false, 7);
    }
  }

  function drawFeuds() {
    if (!board.feuds.size) return;
    const y = 96 + Math.max(1, Math.ceil((board.queue.length - k) / perRow())) * QUEUE_ROW_H + 4;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = INK_DIM; ctx.font = '700 11px Inter, sans-serif';
    ctx.fillText('WILL NOT PERCH TOGETHER', 22, y);

    // Each pair gets its own chip. Without one, five feuds in a row read as ten
    // loose birds and you cannot tell which two are the pair.
    const feuds = [...board.feuds];
    const gap = 5;
    const chipW = Math.min(58, Math.floor((LW - 44 - gap * (feuds.length - 1)) / feuds.length));
    const bird = Math.max(8, Math.min(13, chipW * 0.24));
    let x = 22;
    for (const key of feuds) {
      const [a, b] = key.split(':').map(Number);
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      RR(x, y + 15, chipW, 30, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(18,37,62,0.16)'; ctx.lineWidth = 1; ctx.stroke();
      const cy = y + 41;
      drawBird(x + chipW * 0.26, cy, 1, a, 1, false, bird);
      drawBird(x + chipW * 0.74, cy, 1, b, 1, false, bird);
      ctx.strokeStyle = BAD; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + chipW * 0.5 - 4, y + 38); ctx.lineTo(x + chipW * 0.5 + 4, y + 24);
      ctx.stroke();
      x += chipW + gap;
    }
  }

  function drawHUD() {
    const hs = Math.max(0.72, Math.min(1, LW / 430));
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = INK; ctx.font = '800 ' + Math.round(26 * hs) + 'px Inter, sans-serif';
    ctx.fillText('WIRE', 22, 20);
    ctx.fillStyle = INK_DIM; ctx.font = '600 ' + Math.round(14 * hs) + 'px Inter, sans-serif';
    ctx.fillText('Level ' + level + '   ·   ' + k + '/' + board.queue.length + ' landed   ·   '
      + moves + (moves === 1 ? ' move' : ' moves'), 22, 50);
  }

  function pill(label, cx, cy, dim, act) {
    ctx.font = '700 13px Inter, sans-serif';
    const w = Math.round(ctx.measureText(label).width + 28), h = 36;
    const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; RR(x, y, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = 'rgba(18,37,62,0.30)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = dim ? INK_FAINT : INK;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx, y + h / 2 + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (!dim) uiButtons.push({ x, y, w, h, act });
    return w;
  }

  function drawControls() {
    const cy = LH - 62, gap = 10;
    ctx.font = '700 13px Inter, sans-serif';
    const labels = [
      ['Undo', () => undo(), !history.length],
      ['Restart', () => startLevel(level), false],
      ['Rules', () => { phase = 'menu'; render(); }, false],
      ['Next', () => startLevel(level + 1), false],
    ];
    let tot = 40 + gap;
    labels.forEach(([l]) => tot += Math.round(ctx.measureText(l).width + 28) + gap);
    tot -= gap;
    let x = Math.round(LW / 2 - tot / 2);
    const sx = x, sy = Math.round(cy - 18);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; RR(sx, sy, 40, 36, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(18,37,62,0.30)'; ctx.lineWidth = 1.5; ctx.stroke();
    const on = snd.on(), scx = sx + 20;
    ctx.fillStyle = on ? INK : INK_FAINT;
    ctx.beginPath(); ctx.moveTo(scx - 7, cy - 3); ctx.lineTo(scx - 3, cy - 3); ctx.lineTo(scx + 2, cy - 8);
    ctx.lineTo(scx + 2, cy + 8); ctx.lineTo(scx - 3, cy + 3); ctx.lineTo(scx - 7, cy + 3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.5;
    if (on) { ctx.beginPath(); ctx.arc(scx + 4, cy, 5, -0.9, 0.9); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(scx + 5, cy - 4); ctx.lineTo(scx + 11, cy + 4); ctx.moveTo(scx + 11, cy - 4); ctx.lineTo(scx + 5, cy + 4); ctx.stroke(); }
    uiButtons.push({ x: sx, y: sy, w: 40, h: 36, act: () => { snd.ready(); snd.toggle(); render(); } });
    x += 40 + gap;
    labels.forEach(([l, a, dim]) => { const w = pill(l, x + Math.round(ctx.measureText(l).width + 28) / 2, cy, dim, a); x += w + gap; });

    ctx.textAlign = 'center'; ctx.fillStyle = INK_DIM; ctx.font = '500 12px Inter, sans-serif';
    const msg = done() ? 'Every bird is on a wire.'
      : (endMoves().length ? 'Tap the end of a wire to land the next bird.'
                           : 'Nowhere left for this one. Undo, or start again.');
    ctx.fillText(msg, LW / 2, LH - 28);
    ctx.textAlign = 'left';
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

  function panel(title, sub, lines, btnLabel, btnAct, titleCol) {
    ctx.fillStyle = 'rgba(10,22,38,0.55)'; ctx.fillRect(0, 0, LW, LH);
    const pw = Math.min(LW - 44, 400), px = (LW - pw) / 2;
    ctx.font = '500 14px Inter, sans-serif';
    let h = 34 + 46 + 16;
    lines.forEach(() => { h += 3 * 20 + 12; });
    h += 16 + 48 + 30;
    const py = Math.max(16, (LH - h) / 2);
    ctx.fillStyle = '#FBFAF6'; RR(px, py, pw, h, 20); ctx.fill();
    ctx.strokeStyle = 'rgba(18,37,62,0.18)'; ctx.lineWidth = 1; ctx.stroke();
    let y = py + 30;
    ctx.textAlign = 'center'; ctx.fillStyle = titleCol || INK; ctx.font = '800 30px Inter, sans-serif';
    ctx.fillText(title, LW / 2, y); y += 44;
    ctx.fillStyle = INK_DIM; ctx.font = '600 15px Inter, sans-serif';
    ctx.fillText(sub, LW / 2, y); y += 30;
    ctx.textAlign = 'left'; ctx.font = '500 14px Inter, sans-serif';
    lines.forEach((r, i) => {
      ctx.fillStyle = '#2F6DA8'; ctx.beginPath(); ctx.arc(px + 32, y + 8, 11, 0, 7); ctx.fill();
      ctx.fillStyle = '#FBFAF6'; ctx.font = '800 12px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.fillText(String(i + 1), px + 32, y + 4);
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(18,37,62,0.86)'; ctx.font = '500 14px Inter, sans-serif';
      y = wrapText(r, px + 52, y, pw - 84, 20) + 12;
    });
    y += 6;
    const bw = 170, bh = 44, bx = LW / 2 - bw / 2;
    ctx.fillStyle = GOOD; RR(bx, y, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = '#FBFAF6'; ctx.font = '800 15px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(btnLabel, LW / 2, y + bh / 2 + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    uiButtons.push({ x: bx, y, w: bw, h: bh, act: btnAct });
  }

  function drawRules() {
    panel('WIRE', 'Land every bird.', [
      'Birds arrive one at a time. Tap either end of a wire and the next one lands there.',
      'The birds already on that wire budge along to make room. A wire only holds so much.',
      'Some kinds will not perch beside each other. They are shown at the top of the screen.',
      'Everything you are going to be handed is visible, so the order is something you can plan around.',
    ], 'PLAY', () => { phase = 'play'; render(); });
  }
  function drawWin() {
    panel('ALL LANDED', board.queue.length + ' birds, ' + board.spans.length + ' wires, ' + moves + ' moves', [
      'Every bird found a perch and nobody had to sit next to somebody they cannot stand.',
    ], 'NEXT WIRE', () => startLevel(level + 1), GOOD);
  }
  function drawStuck() {
    panel('NOWHERE TO LAND', 'This bird has no perch left.', [
      'Somewhere earlier a wire filled up, or a bird ended up next to the only neighbour this one could have sat beside.',
      'Undo takes back one bird at a time, as far as you like.',
    ], 'UNDO', () => { phase = 'play'; undo(); }, BAD);
  }

  function kick() {
    animEnd = performance.now() + Math.max(LAND_MS, BUDGE_MS) + 80;
    if (!raf) { raf = 1; requestAnimationFrame(tick); }
  }
  function tick(t) { render(t); if (t < animEnd) requestAnimationFrame(tick); else raf = 0; }

  // ---------- interaction ----------
  function snapshot() {
    return { state: state.map(l => l.slice()), k, moves };
  }
  function land(s, side) {
    if (phase !== 'play' || done()) return;
    const bird = board.queue[k];
    const p = side === 'L' ? 0 : state[s].length;
    if (!M.canInsert(board, state[s], p, bird, board.spans[s])) { snd.refuse(); return; }
    history.push(snapshot());
    // remember where everyone was, so the budge animates from there
    budgeT = performance.now();
    for (let i = 0; i < state.length; i++) {
      const pos = positions(i);
      state[i].forEach((b, j) => lastX.set(b, spanX(i) + pos[j] * unit));
    }
    state[s].splice(p, 0, bird);
    landT.set(bird, performance.now());
    k++; moves++;
    snd.land(k);
    if (state[s].length > 1) snd.budge();
    if (done()) { phase = 'won'; snd.win(); }
    else if (!endMoves().length) { phase = 'stuck'; snd.stuck(); }
    kick();
  }
  function undo() {
    if (!history.length) return;
    const h = history.pop();
    state = h.state; k = h.k; moves = h.moves;
    phase = 'play';
    lastX = new Map();
    snd.undo(); kick();
  }
  function startLevel(n) {
    level = Math.max(1, n); saveLevel();
    let b = null;
    for (let t = 0; t < 6 && !b; t++) b = M.generate(level);
    if (!b) { level = 1; b = M.generate(1); }
    board = b;
    state = M.fresh(board);
    k = 0; moves = 0; phase = 'play'; history = [];
    landT = new Map(); lastX = new Map();
    layout(); kick(); render();
  }

  canvas.addEventListener('pointerdown', (e) => {
    snd.ready();
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (LW / r.width), y = (e.clientY - r.top) * (LH / r.height);
    for (let i = uiButtons.length - 1; i >= 0; i--) {
      const b = uiButtons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { e.preventDefault(); b.act(); return; }
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'n') startLevel(level + 1);
    if (e.key === 'r') startLevel(level);
    if (e.key === 'z') undo();
  });

  // ---------- debug ----------
  window.__wire = {
    get state() {
      return { level, spans: board.spans.slice(), used: state.map((_, i) => used(i)), k, queue: board.queue.length,
               moves, phase, feuds: [...board.feuds], solutions: board.solutions };
    },
    get board() { return board; },
    get wires() { return state.map(l => l.map(b => b.sp + '.' + b.w)); },
    get moves() { return endMoves(); },
    land, undo, goto: (n) => startLevel(n),
    get buttons() { render(); return uiButtons.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h })); },
    get geom() { return { LW, LH, topBand, stackTop, rowH, unit, wireLeft, BOT_BAND }; },
    get lowest() {
      const n = board.spans.length, y = spanY(n - 1);
      return { wireY: y, poleBottom: y - 4 + Math.min(46, rowH * 0.30),
               labelBottom: y + Math.min(16, rowH * 0.16) + 12, controlsTop: LH - 80 };
    },
    solveNow() {
      const sol = M.solve(board).solutions[0];
      if (!sol) return 'unsolvable';
      for (let i = k; i < board.queue.length; i++) {
        const m = sol[i];
        land(m.s, m.p === 0 ? 'L' : 'R');
      }
      return phase;
    },
  };

  // ---------- boot ----------
  setCanvasVars(); resizeCanvas(); fitFullscreen(); resizeCanvas();
  startLevel(loadLevel());
  setTimeout(onResize, 0); setTimeout(onResize, 300);
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
})();
