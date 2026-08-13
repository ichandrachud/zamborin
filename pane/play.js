/* ============================================================
   PANE · a Zamborin Game

   Rain on a window. Tap a drop and it swells; swell it far enough and it
   touches a neighbour, and touching drops merge instantly, which may put the
   bigger drop in touch with something further away. Get one heavy enough and it
   breaks loose and RUNS, wandering down the glass and taking everything in its
   path with it, leaving a clear track through the fog.

   WHAT THE MEASUREMENT SAID, AND WHAT IT DID NOT. Pane passes the puzzle gate
   with room to spare: 87% of boards defeat every unplanned strategy, par is 5,
   and search effort grows from 139 to 418,000 nodes across sixty levels.
   model.js and measure.js hold that work.

   It failed a different gate. The pitch was that one tap could wipe half the
   glass; measured against the whole window, the biggest single tap takes 13%,
   and no setting fixes it. Drops at rest never touch, or they would already
   have merged, and that sparseness is exactly what makes any path-based sweep
   hit bare glass. Widening the run to three cells swept nearly triple the area
   and removed the SAME number of drops.

   So this is built to be what it is rather than what was pitched: a tight,
   quiet covering puzzle where the pleasure is a clean track torn through a
   fogged window, not a flood.
   ============================================================ */
(() => {
  'use strict';

  const M = window.PANE_MODEL;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let LW = 390, LH = 844;

  const FRAME = '#8A9AA2', FRAME_DK = '#5E6C74', FRAME_HI = '#B9C6CC';
  const INK = '#0E1B16', INK_DIM = 'rgba(14,27,22,0.82)', INK_FAINT = 'rgba(14,27,22,0.45)';
  const GOOD = '#1C7A47', BAD = '#B3372B';

  // ---------- sound ----------
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zamborin-pane.sound' }) : null;
  const snd = {
    on: () => !!(sfx && sfx.isOn()),
    ready() { if (sfx) sfx.ensureAudio(); },
    toggle() { if (!sfx) return; sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.tone(880, 0.05, 0.03, 'sine'); },
    swell() { if (sfx) sfx.tone(720, 0.05, 0.014, 'sine'); },
    merge(n) {
      if (!sfx) return;
      const step = Math.min(9, n);
      sfx.tone(440 * Math.pow(2, step / 12), 0.09, 0.022, 'sine');
      sfx.noise(0.03, 2600, 1.6, 0.010);
    },
    run() { if (sfx) { sfx.noise(0.30, 1400, 0.9, 0.030); sfx.tone(180, 0.22, 0.020, 'sine'); } },
    undo() { if (sfx) sfx.tone(392, 0.08, 0.020, 'sine'); },
    fail() { if (sfx) { sfx.tone(170, 0.26, 0.030, 'sawtooth'); sfx.tone(115, 0.30, 0.024, 'sine'); } },
    win() { if (sfx) sfx.arpeggio(523.25, 0.10, 2); },
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
  function onResize() { if (MODE === 'mobile') setCanvasVars(); fitFullscreen(); resizeCanvas(); buildGarden(); layout(); render(); }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', onResize);

  // ---------- state ----------
  let board = null, level = 1, moves = 0, budget = 8, phase = 'play';
  let wet = new Set(), wetPaths = [], history = [], uiButtons = [], raf = 0, animEnd = 0;
  // wetPaths entries are { cells, t0 }: committed immediately, animated by t0.
  const RUN_MS = 460, SWELL_MS = 220;
  let swellT = new Map();
  const LS = 'zamborin-pane.level';
  const saveLevel = () => { try { localStorage.setItem(LS, String(level)); } catch (e) {} };
  const loadLevel = () => { try { const v = parseInt(localStorage.getItem(LS), 10); return (v >= 1 && v <= 999) ? v : 1; } catch (e) { return 1; } };

  // ---------- the garden behind the glass ----------
  // A real window needs something to look at, and every drop is a lens showing
  // it upside down. Drawn once to an offscreen canvas and heavily blurred, so
  // the lens work below is just a clipped drawImage.
  const garden = document.createElement('canvas');       // blurred, seen through mist
  const gardenSharp = document.createElement('canvas');  // what a clean track reveals
  const reveal = document.createElement('canvas');       // stroke mask for the tracks
  function buildGarden() {
    const w = Math.max(64, Math.round(LW)), h = Math.max(64, Math.round(LH));
    garden.width = w; garden.height = h;
    const g = garden.getContext('2d');
    const base = g.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#6FA35A'); base.addColorStop(0.42, '#5B9450');
    base.addColorStop(0.78, '#4E8748'); base.addColorStop(1, '#8A9A46');
    g.fillStyle = base; g.fillRect(0, 0, w, h);

    // Broad masses of foliage first. Placed on a fixed lattice so the view
    // behind the window never reshuffles between renders.
    const blobs = [
      [0.18, 0.12, 0.34, '#93C063'], [0.72, 0.09, 0.30, '#A8CE68'], [0.46, 0.26, 0.26, '#4F8A48'],
      [0.88, 0.32, 0.28, '#B6D46E'], [0.12, 0.44, 0.30, '#437C43'], [0.62, 0.48, 0.32, '#89BA5C'],
      [0.30, 0.64, 0.28, '#3C7440'], [0.80, 0.68, 0.30, '#79AC55'], [0.16, 0.84, 0.26, '#C4A85E'],
      [0.55, 0.88, 0.32, '#4A8446'],
    ];
    for (const [fx, fy, fr, col] of blobs) {
      const rg = g.createRadialGradient(fx * w, fy * h, 0, fx * w, fy * h, fr * w);
      rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(fx * w, fy * h, fr * w, 0, 7); g.fill();
    }

    // Then the bokeh. This is the part that matters: a drop is a lens, and a
    // lens over a flat wash shows a flat wash. The first version had a garden
    // with no bright points in it and every drop came out a plain dark disc.
    // Sunlight through leaves gives the highlights the lenses need.
    const spots = [
      [0.24, 0.18, 0.075, '#E4EE9E', 0.95], [0.66, 0.14, 0.055, '#F2F4B4', 0.85],
      [0.42, 0.34, 0.048, '#C8E07A', 0.80], [0.84, 0.24, 0.062, '#EDF0A2', 0.70],
      [0.10, 0.56, 0.052, '#B6D874', 0.75], [0.58, 0.60, 0.070, '#DCEC96', 0.90],
      [0.90, 0.54, 0.044, '#C0DE80', 0.65], [0.34, 0.78, 0.058, '#E8D888', 0.80],
      [0.74, 0.82, 0.050, '#CFE68A', 0.70], [0.20, 0.34, 0.038, '#F4F6C4', 0.60],
      [0.50, 0.08, 0.042, '#DCE892', 0.65], [0.06, 0.16, 0.046, '#C6DC7E', 0.55],
      [0.94, 0.72, 0.040, '#E0E894', 0.60], [0.44, 0.94, 0.052, '#D2E282', 0.60],
    ];
    for (const [fx, fy, fr, col, a] of spots) {
      const rg = g.createRadialGradient(fx * w, fy * h, 0, fx * w, fy * h, fr * w);
      rg.addColorStop(0, col); rg.addColorStop(0.55, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = a;
      g.fillStyle = rg; g.beginPath(); g.arc(fx * w, fy * h, fr * w, 0, 7); g.fill();
    }
    g.globalAlpha = 1;

    // Blurred, because everything past a wet window is out of focus, but only
    // enough to soften. At the first setting the bokeh smeared back into the
    // wash and the lenses went blank again.
    // Keep the crisp version. Water running down the glass wipes the mist away,
    // and what shows through has to be sharper than what surrounds it or the
    // track is invisible.
    gardenSharp.width = w; gardenSharp.height = h;
    gardenSharp.getContext('2d').drawImage(garden, 0, 0);
    reveal.width = w; reveal.height = h;

    const blurred = document.createElement('canvas');
    blurred.width = w; blurred.height = h;
    const bg2 = blurred.getContext('2d');
    bg2.filter = 'blur(' + Math.max(4, Math.round(w * 0.016)) + 'px)';
    bg2.drawImage(garden, 0, 0);
    bg2.filter = 'none';
    g.clearRect(0, 0, w, h);
    g.drawImage(blurred, 0, 0);
  }

  // ---------- layout ----------
  const TOP_BAND = 92, BOT_BAND = 96, SILL = 14;
  let cell = 40, gridX = 20, gridY = 120, gridW = 300, gridH = 400;
  function layout() {
    if (!board) return;
    const availW = LW - SILL * 2 - 12, availH = LH - TOP_BAND - BOT_BAND - SILL * 2;
    cell = Math.max(22, Math.min(72, Math.floor(Math.min(availW / board.W, availH / board.H))));
    gridW = cell * board.W; gridH = cell * board.H;
    gridX = Math.round((LW - gridW) / 2);
    gridY = Math.round(TOP_BAND + SILL + (availH - gridH) / 2);
  }
  const cellCX = (c) => gridX + cell * (c + 0.5);
  const cellCY = (r) => gridY + cell * (r + 0.5);
  const cellOf = (i) => ({ c: i % board.W, r: (i / board.W) | 0 });
  // Mass is area, so the radius goes as its square root, and a drop never quite
  // fills its cell or two neighbours would look joined when they are not.
  const radius = (m) => Math.min(cell * 0.46, cell * 0.17 * Math.sqrt(m) + cell * 0.12);

  // ---------- helpers ----------
  const RR = (a, b, c, d, r) => { ctx.beginPath(); ctx.roundRect(a, b, c, d, r); };
  const drops = () => M.drops(board);
  const cleared = () => M.clear(board);
  const left = () => budget - moves;

  // ---------- render ----------
  function render(now) {
    now = now || performance.now();
    uiButtons = [];
    // The window does not cover the canvas, so without this the HUD draws on
    // top of the previous frame's HUD and the text turns to mush.
    const bd = ctx.createLinearGradient(0, 0, 0, LH);
    bd.addColorStop(0, '#101E2E'); bd.addColorStop(1, '#0A1620');
    ctx.fillStyle = bd; ctx.fillRect(0, 0, LW, LH);
    drawGlass(now);
    drawFrame();
    drawDrops(now);
    drawHUD();
    drawControls();
    if (phase === 'menu') drawRules();
    if (phase === 'won') drawWin();
    if (phase === 'lost') drawLost();
  }

  // The glass: the garden, a fog over it, and the fog cut away wherever water
  // has run. That cut is the whole point of the game, so it is the one thing
  // drawn with real care.
  function drawGlass(now) {
    ctx.save();
    ctx.beginPath(); ctx.rect(gridX, gridY, gridW, gridH); ctx.clip();

    // misted glass: the blurred garden, then the mist over it
    ctx.drawImage(garden, 0, 0, LW, LH);
    ctx.fillStyle = 'rgba(226,235,231,0.72)';
    ctx.fillRect(gridX, gridY, gridW, gridH);

    // Every run that has happened, plus however much of one is still wiping in.
    // Drawn as a STROKE down the ordered path: the first version painted a
    // circle per cell and a run came out as a row of dots rather than a track.
    const strokes = wetPaths.map(p => [p.cells, Math.min(1, (now - p.t0) / RUN_MS)]);

    if (strokes.length) {
      const rc = reveal.getContext('2d');
      rc.setTransform(1, 0, 0, 1, 0, 0);
      rc.clearRect(0, 0, reveal.width, reveal.height);
      rc.lineCap = 'round'; rc.lineJoin = 'round';
      rc.strokeStyle = '#000';
      rc.lineWidth = cell * 0.66;
      for (const [path, t] of strokes) {
        const upto = Math.max(1, Math.ceil(t * path.length));
        rc.beginPath();
        for (let n = 0; n < upto; n++) {
          const { c, r } = cellOf(path[n]);
          if (n === 0) rc.moveTo(cellCX(c), cellCY(r)); else rc.lineTo(cellCX(c), cellCY(r));
        }
        if (upto === 1) { const { c, r } = cellOf(path[0]); rc.lineTo(cellCX(c) + 0.01, cellCY(r)); }
        rc.stroke();
      }
      // fill the stroke with the crisp view
      rc.globalCompositeOperation = 'source-in';
      rc.drawImage(gardenSharp, 0, 0);
      rc.globalCompositeOperation = 'source-over';
      ctx.drawImage(reveal, 0, 0, LW, LH);

      // still wet, so the track sits a shade deeper than dry clear glass
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = '#2E5C46';
      ctx.drawImage(reveal, 0, 0, LW, LH);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawFrame() {
    const x = gridX - SILL, y = gridY - SILL, w = gridW + SILL * 2, h = gridH + SILL * 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = FRAME_DK; ctx.lineWidth = SILL;
    ctx.strokeRect(x + SILL / 2, y + SILL / 2, w - SILL, h - SILL);
    ctx.strokeStyle = FRAME; ctx.lineWidth = SILL - 5;
    ctx.strokeRect(x + SILL / 2, y + SILL / 2, w - SILL, h - SILL);
    ctx.strokeStyle = FRAME_HI; ctx.lineWidth = 1.4;
    ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
    ctx.restore();
  }

  // A drop is a lens. Whatever is behind the window appears inside it
  // magnified and upside down, which is the thing that separates convincing
  // rain from grey circles.
  function drawDrop(cx, cy, r) {
    if (r < 1) return;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip();
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(Math.PI); ctx.scale(1.8, 1.8); ctx.translate(-cx, -cy);
    ctx.drawImage(garden, 0, 0, LW, LH);
    ctx.restore();
    // the drop is glass, so it lightens what it shows
    ctx.fillStyle = 'rgba(232,244,238,0.16)';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    ctx.restore();

    // rim: dark where the glass meets the pane, bright where the light is
    ctx.strokeStyle = 'rgba(12,28,22,0.34)'; ctx.lineWidth = Math.max(1, r * 0.10);
    ctx.beginPath(); ctx.arc(cx, cy, r - r * 0.05, 0.5, 3.0); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(0.8, r * 0.08);
    ctx.beginPath(); ctx.arc(cx, cy, r - r * 0.08, 3.4, 5.7); ctx.stroke();
    // specular
    ctx.fillStyle = 'rgba(255,255,255,0.80)';
    ctx.beginPath(); ctx.ellipse(cx - r * 0.34, cy - r * 0.36, r * 0.20, r * 0.14, -0.6, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(cx + r * 0.30, cy + r * 0.34, r * 0.10, 0, 7); ctx.fill();
  }

  function drawDrops(now) {
    ctx.save();
    ctx.beginPath(); ctx.rect(gridX, gridY, gridW, gridH); ctx.clip();
    for (const i of drops()) {
      const { c, r } = cellOf(i);
      let m = board.mass[i];
      const t0 = swellT.get(i);
      let rr = radius(m);
      if (t0 != null) {
        const t = Math.min(1, (now - t0) / SWELL_MS);
        rr = radius(m - M.CFG.SWELL) + (rr - radius(m - M.CFG.SWELL)) * (1 - Math.pow(1 - t, 3));
      }
      drawDrop(cellCX(c), cellCY(r), rr);
      if (phase === 'play') {
        uiButtons.push({ x: cellCX(c) - cell / 2, y: cellCY(r) - cell / 2, w: cell, h: cell, act: () => tapDrop(i) });
      }
    }
    ctx.restore();
  }

  function drawHUD() {
    const hs = Math.max(0.72, Math.min(1, LW / 430));
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff'; ctx.font = '800 ' + Math.round(26 * hs) + 'px Inter, sans-serif';
    ctx.fillText('PANE', 22, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.86)'; ctx.font = '600 ' + Math.round(14 * hs) + 'px Inter, sans-serif';
    ctx.fillText('Level ' + level + '   ·   ' + drops().length + ' left   ·   '
      + left() + (left() === 1 ? ' tap' : ' taps'), 22, 50);
  }

  function pill(label, cx, cy, dim, act) {
    ctx.font = '700 13px Inter, sans-serif';
    const w = Math.round(ctx.measureText(label).width + 28), h = 36;
    const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; RR(x, y, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = dim ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.94)';
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
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; RR(sx, sy, 40, 36, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 1.5; ctx.stroke();
    const on = snd.on(), scx = sx + 20;
    ctx.fillStyle = on ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.40)';
    ctx.beginPath(); ctx.moveTo(scx - 7, cy - 3); ctx.lineTo(scx - 3, cy - 3); ctx.lineTo(scx + 2, cy - 8);
    ctx.lineTo(scx + 2, cy + 8); ctx.lineTo(scx - 3, cy + 3); ctx.lineTo(scx - 7, cy + 3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.5;
    if (on) { ctx.beginPath(); ctx.arc(scx + 4, cy, 5, -0.9, 0.9); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(scx + 5, cy - 4); ctx.lineTo(scx + 11, cy + 4); ctx.moveTo(scx + 11, cy - 4); ctx.lineTo(scx + 5, cy + 4); ctx.stroke(); }
    uiButtons.push({ x: sx, y: sy, w: 40, h: 36, act: () => { snd.ready(); snd.toggle(); render(); } });
    x += 40 + gap;
    labels.forEach(([l, a, dim]) => { const w = pill(l, x + Math.round(ctx.measureText(l).width + 28) / 2, cy, dim, a); x += w + gap; });

    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.font = '500 12px Inter, sans-serif';
    ctx.fillText(cleared() ? 'The window is clear.' : 'Tap a drop to feed it. Heavy enough and it runs.', LW / 2, LH - 28);
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
    ctx.fillStyle = 'rgba(6,16,12,0.72)'; ctx.fillRect(0, 0, LW, LH);
    const pw = Math.min(LW - 44, 400), px = (LW - pw) / 2;
    ctx.font = '500 14px Inter, sans-serif';
    let h = 34 + 46 + 16;
    lines.forEach(() => { h += 3 * 20 + 12; });
    h += 16 + 48 + 30;
    const py = Math.max(16, (LH - h) / 2);
    ctx.fillStyle = '#14261E'; RR(px, py, pw, h, 20); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1; ctx.stroke();
    let y = py + 30;
    ctx.textAlign = 'center'; ctx.fillStyle = titleCol || '#fff'; ctx.font = '800 30px Inter, sans-serif';
    ctx.fillText(title, LW / 2, y); y += 44;
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = '600 15px Inter, sans-serif';
    ctx.fillText(sub, LW / 2, y); y += 30;
    ctx.textAlign = 'left'; ctx.font = '500 14px Inter, sans-serif';
    lines.forEach((r, i) => {
      ctx.fillStyle = '#4E9E6E'; ctx.beginPath(); ctx.arc(px + 32, y + 8, 11, 0, 7); ctx.fill();
      ctx.fillStyle = '#0B1A13'; ctx.font = '800 12px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.fillText(String(i + 1), px + 32, y + 4);
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.font = '500 14px Inter, sans-serif';
      y = wrapText(r, px + 52, y, pw - 84, 20) + 12;
    });
    y += 6;
    const bw = 170, bh = 44, bx = LW / 2 - bw / 2;
    ctx.fillStyle = GOOD; RR(bx, y, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '800 15px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(btnLabel, LW / 2, y + bh / 2 + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    uiButtons.push({ x: bx, y, w: bw, h: bh, act: btnAct });
  }

  function drawRules() {
    panel('PANE', 'Clear the window.', [
      'Tap a drop and it swells. Drops that touch merge at once, and a bigger drop reaches further, so one tap can join a whole cluster.',
      'Heavy enough and a drop breaks loose and runs, wandering down the glass, taking every drop it passes and leaving a clear track.',
      'You have a fixed number of taps. Clearing the glass inside them is the puzzle.',
      'Undo goes back as far as you like.',
    ], 'PLAY', () => { phase = 'play'; render(); });
  }
  function drawWin() {
    panel('CLEAR', 'Level ' + level + ' in ' + moves + (moves === 1 ? ' tap' : ' taps') + ', par ' + board.par,
      ['Every drop off the glass.'], 'NEXT WINDOW', () => startLevel(level + 1), '#7FD8A4');
  }
  function drawLost() {
    panel('OUT OF TAPS', drops().length + ' drops still on the glass', [
      'A tap that only swells a drop is not wasted, but a tap that swells one which was never going to run is.',
      'Undo goes back one tap at a time.',
    ], 'UNDO', () => { phase = 'play'; undo(); }, '#E8A0A0');
  }

  function kick() {
    animEnd = performance.now() + Math.max(RUN_MS, SWELL_MS) + 120;
    if (!raf) { raf = 1; requestAnimationFrame(tick); }
  }
  function tick(t) {
    render(t);
    if (t < animEnd) requestAnimationFrame(tick);
    else { raf = 0; render(); }
  }

  // ---------- interaction ----------
  function tapDrop(i) {
    if (phase !== 'play' || !(board.mass[i] > 0)) return;
    history.push({ mass: board.mass.slice(), wet: new Set(wet), wetPaths: wetPaths.slice(), moves });
    const before = M.drops(board).length;
    const t = M.tap(board, i);
    if (!t) return;
    board = t.board;
    moves++;
    swellT.set(i, performance.now());
    if (t.ran) {
      for (const path of (t.paths || [])) {
        wetPaths.push({ cells: path, t0: performance.now() });
        for (const c of path) wet.add(c);
      }
      snd.run();
    } else if (t.swallowed) snd.merge(before - M.drops(board).length);
    else snd.swell();

    if (cleared()) { phase = 'won'; snd.win(); }
    else if (left() <= 0) { phase = 'lost'; snd.fail(); }
    kick();
  }
  function undo() {
    if (!history.length) return;
    const h = history.pop();
    board = { W: board.W, H: board.H, mass: h.mass, par: board.par, level: board.level };
    wet = h.wet; wetPaths = h.wetPaths; moves = h.moves; phase = 'play';
    swellT = new Map();
    snd.undo(); kick();
  }
  function startLevel(n) {
    level = Math.max(1, n); saveLevel();
    let b = null;
    for (let t = 0; t < 5 && !b; t++) b = M.generate(level);
    if (!b) { level = 1; b = M.generate(1); }
    board = b;
    // Two spare taps over par. Measured, no unplanned strategy wins inside
    // par + 1 on 87% of boards, so this is generous without being free.
    budget = b.par + 2;
    moves = 0; phase = 'play'; wet = new Set(); wetPaths = []; history = []; swellT = new Map();
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
  window.__pane = {
    get state() { return { level, W: board.W, H: board.H, drops: M.drops(board).length,
                           mass: M.totalMass(board), moves, budget, par: board.par, phase, wet: wet.size }; },
    get board() { return board; },
    tap: tapDrop, undo, goto: (n) => startLevel(n),
    get geom() { return { LW, LH, cell, gridX, gridY, gridW, gridH, TOP_BAND, BOT_BAND, SILL }; },
    get buttons() { render(); return uiButtons.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h })); },
    solveNow() {
      const s = M.solve(board, board.par + 2);
      if (!s.par) return 'unsolvable';
      for (const i of s.solutions[0]) tapDrop(i);
      return phase;
    },
  };

  // ---------- boot ----------
  setCanvasVars(); resizeCanvas(); fitFullscreen(); resizeCanvas();
  buildGarden();
  startLevel(loadLevel());
  setTimeout(onResize, 0); setTimeout(onResize, 300);
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
})();
