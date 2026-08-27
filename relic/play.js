/* ============================================================
   RELIC · A Zamborin Game
   ------------------------------------------------------------
   A figure is cut into pieces and scattered. Colour bands run
   through the whole figure, so every cut edge carries a sequence
   of colours: put the pieces back so the bands run unbroken.

   THE RULE THIS FILE MUST NOT BREAK
   --------------------------------
   A piece seats wherever it is dropped, right or wrong. Nothing
   here validates a placement, nothing flashes green, nothing
   refuses. The bands are the only feedback there is. Anything
   that answers "is this piece correct?" turns the game into an
   oracle and the puzzle collapses into dragging pieces until one
   sticks. See RELIC_BUILD_BRIEF section 0.

   Geometry, the cut and the field live in model.js so that the
   milestone-2 gate measures the same game that ships.
   ============================================================ */
(() => {
  'use strict';

  const M = window.RelicModel;

  // ---------- MODE ----------
  // A browser can report a 0-wide viewport on the first frame. The obvious
  // `innerWidth < 768` then reads as a phone, MODE is locked for the session,
  // and a desktop player is left on the phone layout for good.
  const MODE = (matchMedia('(pointer: coarse)').matches ||
                (window.innerWidth > 0 && window.innerWidth < 768))
    ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);

  // ---------- CANVAS ----------
  let LW, LH;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const gameWrap = canvas.parentElement;

  function setCanvasVars() {
    if (MODE === 'mobile') { LW = window.innerWidth; LH = window.innerHeight; }
    else { LW = 760; LH = 600; }          // the ONE site-wide desktop frame
    document.body.style.setProperty('--canvas-w', LW + 'px');
    document.body.style.setProperty('--canvas-h', LH + 'px');
  }
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const dW = rect.width || LW, dH = rect.height || LH;
    const bW = Math.round(dW * dpr), bH = Math.round(dH * dpr);
    if (canvas.width !== bW) canvas.width = bW;
    if (canvas.height !== bH) canvas.height = bH;
    const scale = Math.min(bW / LW, bH / LH);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  function fitFullscreen() {
    if (MODE === 'mobile') {
      gameWrap.style.width = window.innerWidth + 'px';
      gameWrap.style.height = window.innerHeight + 'px';
      return;
    }
    const active = document.body.classList.contains('focus-mode');
    if (!active) { gameWrap.style.width = ''; gameWrap.style.height = ''; return; }
    const vw = window.innerWidth, vh = window.innerHeight, aspect = LW / LH;
    let cw = vw, ch = Math.round(vw / aspect);
    if (ch > vh) { ch = vh; cw = Math.round(vh * aspect); }
    gameWrap.style.width = cw + 'px'; gameWrap.style.height = ch + 'px';
  }
  function onResize() {
    if (MODE === 'mobile') setCanvasVars();
    fitFullscreen(); resizeCanvas(); layout();
  }

  // ---------- TOKENS ----------
  // Canvas cannot read CSS variables, so shared/tokens.css is restated here
  // and nowhere else. Chrome takes these and only these.
  const TOK = {
    bg:        '#0E1726',                    // --bg
    bgCard:    '#131F36',                    // --bg-card
    bgPanel:   '#1A2A45',                    // --bg-panel
    line:      '#1F2D4A',                    // --line
    lineSoft:  'rgba(255,255,255,0.10)',     // --line-soft
    text:      '#FFFFFF',                    // --text
    textDim:   '#C5CFE0',                    // --text-dim
    textMute:  '#8E9CB5',                    // --text-mute
    accent:     '#C24A39',                   // --accent, a fill under white type
    accentText: '#FF6B5C',                   // --accent-text, coral AS a mark
    ink72:     'rgba(255,255,255,0.72)',
    ink82:     'rgba(255,255,255,0.82)',
    ink90:     'rgba(255,255,255,0.90)',
    tint03:    'rgba(255,255,255,0.03)',
    tint12:    'rgba(255,255,255,0.12)',
    scrim:     'rgba(10,16,28,0.88)',
    scrimWin:  'rgba(10,16,28,0.82)',
  };

  /* GAME ART, not chrome. The figure is allowed its own palette; the page
     frame, cards, buttons and type are not. */
  const ART = {
    /* An empty slot. Near-black, but the flat contrast against the ink
       separator is only 1.35:1 and that was never going to be enough on its
       own: the first build drew both and they read as the same thing. A gap
       is told from a dark band by DEPTH — an inner shadow all round and a lip
       catching the light at the top — which is the same "edges are made of
       value" rule the pieces follow. See drawHole. */
    slot:     '#05070D',
    bodyLit:  '#4A4658',
    bodyDim:  '#262232',
    seam:     'rgba(4,6,12,0.62)',
  };

  // ---------- AUDIO ----------
  // The fleet is mixed about 4x too quiet at peak -11.7 dBFS, so the opt-in
  // master gain is set rather than left at 1. No sound on a wrong placement:
  // a distinct wrong-sound is a correctness oracle delivered through the
  // speakers and would undo the rule at the top of this file.
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zam.relic.sfx', gain: 3.4 }) : null;

  // ---------- BUTTONS ----------
  const UI = window.ZAM_UI;

  // ---------- ANALYTICS ----------
  const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){},
                 levelRestart(){}, hintUsed(){}, track(){} };
  const TR = () => (window.ZAM_TRACK || NOOP);
  TR().init('relic');

  // ---------- STATE ----------
  const STORE = 'zam.relic.level';
  let level = null;
  let levelNo = 1;
  let phase = 'play';                 // 'play' | 'won'
  let card = null;                    // null | 'rules' | 'win'
  let cardScroll = 0;
  let history = [];
  let moves = 0, rotations = 0, misplaced = 0;
  let winAt = 0;
  let drag = null;                    // { piece, x, y, from, moved }
  let hoverSlot = null;
  let bandPolys = [];                 // the field, as fillable polygons
  const L = { hit: {} };

  function loadLevel(n, opts) {
    levelNo = n;
    level = M.makeLevel({ seed: 1000 + n * 7919, lift: (opts && opts.lift) || 4 });
    for (const p of level.pieces) { p.rot0 = p.rot; p.at = null; }
    phase = 'play'; history = []; moves = 0; rotations = 0; misplaced = 0;
    drag = null; hoverSlot = null; winAt = 0;
    buildBandPolys();
    try { localStorage.setItem(STORE, String(n)); } catch (e) {}
    TR().levelStart(n);
  }

  /* The band field as polygons, built once per level. Each boundary is
     explicit in y, so a ribbon is just its top curve and its bottom curve
     reversed. Generous x margin: a rotated piece samples the field from
     outside the figure's own box. */
  function buildBandPolys() {
    const f = level.field, W = level.W;
    const x0 = -W * 0.45, x1 = W * 1.45, N = 56;
    bandPolys = [];
    for (let i = 0; i < f.bands.length; i++) {
      const top = [], bot = [];
      for (let k = 0; k <= N; k++) {
        const x = x0 + (x1 - x0) * k / N;
        top.push([x, f.yOf(f.bounds[i], x)]);
        bot.push([x, f.yOf(f.bounds[i + 1], x)]);
      }
      bandPolys.push({ hex: f.bands[i].hex, poly: top.concat(bot.reverse()) });
    }
  }

  // ---------- LAYOUT ----------
  const SIDE_PAD = 30;
  const topBand = () => (MODE === 'mobile' ? 64 : 56);
  const botBand = () => (MODE === 'mobile' ? 96 : 20);

  function layout() {
    L.sidePad = SIDE_PAD;
    L.ctrlCy = MODE === 'mobile' ? LH - 74 : topBand() / 2;
    L.hit = {};

    if (MODE === 'mobile' && LW > LH * 1.15) {
      /* A MOBILE FRAME THAT IS LANDSCAPE. MODE goes mobile below 768px of
         WIDTH, so a phone turned sideways and a publisher's short iframe both
         land here with a portrait layout in a landscape box. At the 480 x 360
         floor that /embed/ supports, the portrait arrangement left the figure
         60px tall and drew a moth at 5 per cent scale under a tray twice its
         size, which is not a small frame problem, it is the wrong layout.

         So the tray goes to the side, as it does on desktop, and the controls
         stay at the bottom because that rule is locked for every phone. */
      const ctrlTop = L.ctrlCy - UI.PILL.h / 2;
      const top = topBand() * 0.55;
      const h = Math.max(60, ctrlTop - 16 - top);
      const trayW = Math.round(Math.max(88, Math.min(150, LW * 0.26)));
      L.tray = { x: LW - 12 - trayW, w: trayW, y: top, h: h, vertical: true };
      L.figArea = { x: 10, y: top, w: Math.max(60, L.tray.x - 20), h: h };
    } else if (MODE === 'mobile') {
      /* Portrait: the figure fills the middle, the tray is a strip above the
         thumb row, and the controls stay at the bottom. */
      const ctrlTop = L.ctrlCy - UI.PILL.h / 2;
      const top = topBand() + 6;
      const trayW = LW - 24, gap = 10;
      const n = Math.max(1, level.pieces.filter(p => p.at == null &&
                                                    p !== (drag && drag.piece)).length);
      /* Size the tray to its CONTENTS, and never to more than a third of the
         space between the bands. The first version grew the tray into the
         vertical slack a width-bound figure leaves behind, which sounded
         generous and bought nothing: four fragments across a 366 wide tray are
         79 across whatever the height is, so all that grew was empty box. The
         slack is unavoidable, because figure and tray are both width-bound on
         a phone; what it can do is sit as symmetrical margin around the figure
         instead of inside an oversized panel. */
      const avail = Math.max(80, ctrlTop - 18 - top);
      const budget = Math.max(58, avail * 0.34);
      const thumb = Math.max(40, Math.min(112, (trayW - (n + 1) * gap) / n, budget - 30));
      const trayH = Math.round(thumb + 30);
      L.tray = { x: 12, w: trayW, y: ctrlTop - 18 - trayH, h: trayH, vertical: false };
      L.figArea = { x: 10, y: top, w: LW - 20, h: Math.max(60, L.tray.y - 14 - top) };
    } else {
      /* 760 x 600 landscape, designed as landscape. The side space carries the
         tray, and the tray pieces are BIG: the whole rule is reading a colour
         sequence along an edge, so a piece too small to read its bands makes
         the game unplayable rather than merely fiddly. */
      const trayW = 196;
      L.tray = { x: LW - SIDE_PAD - trayW, w: trayW,
                 y: topBand() + 6, h: LH - botBand() - (topBand() + 6),
                 vertical: true };
      L.figArea = { x: SIDE_PAD, y: topBand() + 4,
                    w: L.tray.x - 22 - SIDE_PAD, h: LH - botBand() - (topBand() + 4) };
    }

    // The figure, fitted to its area and centred in it.
    const s = Math.min(L.figArea.w / level.W, L.figArea.h / level.H);
    L.fig = {
      s: s,
      x: L.figArea.x + (L.figArea.w - level.W * s) / 2,
      y: L.figArea.y + (L.figArea.h - level.H * s) / 2,
    };
    layoutTray();
  }

  function layoutTray() {
    const t = L.tray, gap = 10;
    const inTray = level.pieces.filter(p => p.at == null && p !== (drag && drag.piece));
    t.slots = [];
    const n = Math.max(1, inTray.length);
    let cols, rows, thumb;
    if (t.vertical) {
      /* Pick the column count that makes the fragments BIGGEST, rather than
         assuming one column. In a short landscape frame the column is tall
         enough for four in a row but not tall enough for four stacked, and
         hard-coding one column cost 6px of fragment at the 480 x 360 embed
         floor, which is where legibility is already tightest. */
      cols = 1; thumb = 0;
      for (let c = 1; c <= Math.min(3, n); c++) {
        const r = Math.ceil(n / c);
        const tSize = Math.min((t.w - (c + 1) * gap) / c, (t.h - (r + 1) * gap) / r);
        if (tSize > thumb) { thumb = tSize; cols = c; }
      }
      rows = Math.ceil(n / cols);
      thumb = Math.max(38, Math.min(158, thumb));
    } else {
      cols = n; rows = 1;
      thumb = Math.min((t.w - (cols + 1) * gap) / cols, t.h - 20);
      thumb = Math.max(42, Math.min(112, thumb));
    }
    const gx = (t.w - (cols * thumb + (cols - 1) * gap)) / 2;
    const gy = (t.h - (rows * thumb + (rows - 1) * gap)) / 2;
    for (let k = 0; k < inTray.length; k++) {
      const c = k % cols, r = Math.floor(k / cols);
      t.slots.push({
        piece: inTray[k],
        cx: t.x + gx + c * (thumb + gap) + thumb / 2,
        cy: t.y + gy + r * (thumb + gap) + thumb / 2,
        size: thumb,
      });
    }
    t.thumb = thumb;
  }

  // ---------- FIGURE <-> SCREEN ----------
  const fx = (x) => L.fig.x + x * L.fig.s;
  const fy = (y) => L.fig.y + y * L.fig.s;
  const toFigure = (sx, sy) => [(sx - L.fig.x) / L.fig.s, (sy - L.fig.y) / L.fig.s];

  function pathPolyScreen(poly) {
    ctx.beginPath();
    ctx.moveTo(fx(poly[0][0]), fy(poly[0][1]));
    for (let i = 1; i < poly.length; i++) ctx.lineTo(fx(poly[i][0]), fy(poly[i][1]));
    ctx.closePath();
  }
  function pathPolyRaw(poly) {
    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.closePath();
  }
  function pathFigure() {
    const parts = level.figure.parts;
    ctx.beginPath();
    for (const poly of parts) {
      ctx.moveTo(fx(poly[0][0]), fy(poly[0][1]));
      for (let i = 1; i < poly.length; i++) ctx.lineTo(fx(poly[i][0]), fy(poly[i][1]));
      ctx.closePath();
    }
  }

  /* Draw the band field as it would look if the piece that came from `src`
     were laid down centred at (tx, ty) on screen, scaled by k and turned r
     quarter turns. The clip is `src.poly` under the SAME transform, which
     lands exactly on the destination cell because every cell in the lattice
     is congruent and four-fold symmetric. That exactness is the whole reason
     model.js cuts the way it does. */
  function drawPieceContent(src, tx, ty, k, r, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.translate(tx, ty);
    ctx.rotate(r * Math.PI / 2);
    ctx.scale(k, k);
    ctx.translate(-src.cx, -src.cy);
    pathPolyRaw(src.poly);
    ctx.clip();
    for (const b of bandPolys) { ctx.fillStyle = b.hex; pathPolyRaw(b.poly); ctx.fill(); }
    ctx.restore();
  }

  // ---------- RENDER ----------
  function pieceInSlot(cellId) {
    for (const p of level.pieces) if (p.at === cellId) return p;
    return null;
  }

  function render(now) {
    ctx.clearRect(0, 0, LW, LH);

    // The Portal wash. Same three stops, same centre, in every game.
    const bg = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
    bg.addColorStop(0, TOK.bgPanel);
    bg.addColorStop(0.6, TOK.bgCard);
    bg.addColorStop(1, TOK.bg);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);

    drawFigure(now);
    drawTray();
    drawControls();
    drawReadout();
    if (drag) drawDragged();
    if (card) drawCard(card, now);
  }

  function drawFigure(now) {
    const won = phase === 'won';
    const wt = won ? Math.min(1, (now - winAt) / 900) : 0;
    /* The brighten PEAKS and then settles rather than holding. Held at full it
       left the finished figure milky for as long as the card was up, and the
       reward for finishing is meant to be seeing the figure as itself. */
    const glow = won ? (wt < 1 ? wt : Math.max(0.32, 1 - ((now - winAt) / 900 - 1) * 0.9)) : 0;

    // The figure sits on the page rather than floating over it: a soft dark
    // pool under it, which is value rather than another colour.
    ctx.save();
    const b = M.polyBounds(level.figure.parts[4]);
    const gcx = fx(level.W / 2), gcy = fy(b.y1) - 6 * L.fig.s;
    const gr = Math.max(60, level.W * 0.46 * L.fig.s);
    const pool = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, gr);
    pool.addColorStop(0, 'rgba(0,0,0,0.30)');
    pool.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pool;
    ctx.beginPath(); ctx.ellipse(gcx, gcy, gr, gr * 0.30, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    pathFigure();
    ctx.clip();

    // Everything the figure has not got yet reads as a hole in it.
    ctx.fillStyle = ART.slot; ctx.fillRect(0, 0, LW, LH);

    // Content, cell by cell.
    for (const c of level.cells) {
      let src = c, r = 0;
      if (c.hole) {
        const p = pieceInSlot(c.id);
        if (!p) continue;
        src = level.cells[p.home]; r = p.rot;
      }
      ctx.save();
      pathPolyScreen(c.poly);
      ctx.clip();
      drawPieceContent(src, fx(c.cx), fy(c.cy), L.fig.s, r);
      ctx.restore();
    }

    // Seams. A crack in a broken object, made of shadow rather than a drawn
    // border: two passes, wide and soft under narrow and dark.
    ctx.lineJoin = 'round';
    for (const c of level.cells) {
      pathPolyScreen(c.poly);
      ctx.strokeStyle = 'rgba(4,6,12,0.30)'; ctx.lineWidth = 3.0; ctx.stroke();
      ctx.strokeStyle = ART.seam; ctx.lineWidth = 1.6; ctx.stroke();
    }

    // One light across the WHOLE figure, from up and slightly left, so it
    // reads as a single solid object. Never per piece: per-piece shading
    // would outline the pieces in value and hand the player a shape hint.
    const fb = { x: fx(0), y: fy(0), w: level.W * L.fig.s, h: level.H * L.fig.s };
    const lg = ctx.createLinearGradient(fb.x, fb.y, fb.x + fb.w, fb.y + fb.h);
    /* 0.09 and 0.18, down from 0.13 and 0.22. The light has to make the figure
       read as one solid object, but every unit of it spreads each band's
       painted value across the figure, and the adjacent-band contrast is
       measured on the PAINTED pixel. This is the amount that still models the
       form and leaves the tightest pair clear of the 3:1 bar. */
    lg.addColorStop(0, 'rgba(255,255,255,0.09)');
    lg.addColorStop(0.42, 'rgba(255,255,255,0.00)');
    lg.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = lg; ctx.fillRect(fb.x, fb.y, fb.w, fb.h);

    /* The holes, LAST, so the light does not lift them. A gap is a gap in
       every part of the figure, including the lit corner. */
    for (const c of level.cells) if (c.hole && !pieceInSlot(c.id)) drawHole(c);

    // An empty slot the finger is over. This is a TARGET, not a verdict: it
    // says "this is the hole you are about to drop into", and it says exactly
    // the same thing whether the piece belongs there or not.
    if (drag && hoverSlot != null) {
      const c = level.cells[hoverSlot];
      pathPolyScreen(c.poly);
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.26)'; ctx.lineWidth = 1.6; ctx.stroke();
    }

    // The light-up. The figure brightens and a soft bloom crosses it.
    if (won) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.16 * glow).toFixed(3) + ')';
      ctx.fillRect(fb.x, fb.y, fb.w, fb.h);
      const sweep = -0.4 + 1.8 * Math.min(1, (now - winAt) / 1200);
      const sx = fb.x + fb.w * sweep;
      const bl = ctx.createLinearGradient(sx - fb.w * 0.30, fb.y, sx + fb.w * 0.30, fb.y + fb.h);
      bl.addColorStop(0, 'rgba(255,255,255,0)');
      bl.addColorStop(0.5, 'rgba(255,255,255,0.28)');
      bl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bl; ctx.fillRect(fb.x, fb.y, fb.w, fb.h);
    }
    ctx.restore();

    // A hairline of light along the figure's edge: an edge made of value, so
    // the silhouette does not dissolve into the page.
    ctx.save();
    pathFigure();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.10 + 0.14 * wt).toFixed(3) + ')';
    ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();

    drawOverlay(wt);
  }

  /* A hole in the figure, made of depth rather than of a darker colour.
     Clipped to its own cell, so each stroke shows only its inner half: that
     is an inner shadow drawn with the plainest thing canvas has. */
  function drawHole(c) {
    const u = Math.max(0.55, level.cs * L.fig.s / 105);
    ctx.save();
    pathPolyScreen(c.poly);
    ctx.clip();
    pathPolyScreen(c.poly);
    ctx.fillStyle = ART.slot; ctx.fill();
    ctx.lineJoin = 'round';
    for (const ring of [[17, 0.10], [12, 0.13], [8, 0.17], [4.5, 0.22], [2, 0.34]]) {
      pathPolyScreen(c.poly);
      ctx.lineWidth = ring[0] * 2 * u;
      ctx.strokeStyle = 'rgba(0,0,0,' + ring[1] + ')';
      ctx.stroke();
    }
    // The far wall of the pit catches the light, which comes from up and
    // slightly left like everything else on this page.
    ctx.save();
    ctx.translate(-0.6 * u, 2.2 * u);
    pathPolyScreen(c.poly);
    ctx.lineWidth = 2.4 * u; ctx.strokeStyle = 'rgba(255,255,255,0.075)'; ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  /* The body, drawn over every piece. It ties the figure together and it
     usefully hides the point where four cuts converge. */
  function drawOverlay(wt) {
    const o = level.figure.overlay, s = L.fig.s;
    ctx.save();

    // Antennae first, so the head sits on top of their roots.
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, 2.4 * s);
    ctx.strokeStyle = 'rgba(198,204,220,0.72)';
    for (const sign of [1, -1]) {
      ctx.beginPath();
      const a = o.antenna;
      ctx.moveTo(fx(level.W / 2 + sign * (a[0][0] - level.W / 2)), fy(a[0][1]));
      ctx.bezierCurveTo(
        fx(level.W / 2 + sign * (a[1][0] - level.W / 2)), fy(a[1][1]),
        fx(level.W / 2 + sign * (a[2][0] - level.W / 2)), fy(a[2][1]),
        fx(level.W / 2 + sign * (a[3][0] - level.W / 2)), fy(a[3][1]));
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(fx(level.W / 2 + sign * (a[3][0] - level.W / 2)), fy(a[3][1]),
              Math.max(1.5, 4.6 * s), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(236,240,250,0.92)'; ctx.fill();
    }

    // The spindle, lit from up and slightly left like everything else.
    ctx.save();
    pathPolyScreen(level.figure.body);
    ctx.clip();
    const bb = M.polyBounds(level.figure.body);
    const g = ctx.createLinearGradient(fx(bb.x0), fy(bb.y0), fx(bb.x1), fy(bb.y1));
    g.addColorStop(0, ART.bodyLit);
    g.addColorStop(1, ART.bodyDim);
    ctx.fillStyle = g;
    ctx.fillRect(fx(bb.x0) - 4, fy(bb.y0) - 4, (bb.w) * s + 8, (bb.h) * s + 8);

    // Segment shading: bands of value across the body, no drawn lines.
    for (let i = 1; i < o.segments; i++) {
      const y = o.segTop + (o.segBot - o.segTop) * i / o.segments;
      const sg = ctx.createLinearGradient(0, fy(y - 9), 0, fy(y + 9));
      sg.addColorStop(0, 'rgba(0,0,0,0)');
      sg.addColorStop(0.5, 'rgba(0,0,0,0.34)');
      sg.addColorStop(1, 'rgba(255,255,255,0.07)');
      ctx.fillStyle = sg;
      ctx.fillRect(fx(bb.x0) - 4, fy(y - 9), bb.w * s + 8, 18 * s + 2);
    }
    // A light band down the upper left of the body.
    const hl = ctx.createLinearGradient(fx(bb.x0), 0, fx(bb.x0 + bb.w * 0.7), 0);
    hl.addColorStop(0, 'rgba(255,255,255,' + (0.16 + 0.16 * wt).toFixed(3) + ')');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(fx(bb.x0) - 4, fy(bb.y0) - 4, bb.w * s + 8, bb.h * s + 8);
    ctx.restore();

    // The head.
    ctx.beginPath();
    ctx.arc(fx(level.W / 2), fy(o.headY), o.headR * s, 0, Math.PI * 2);
    const hg = ctx.createRadialGradient(
      fx(level.W / 2) - o.headR * s * 0.4, fy(o.headY) - o.headR * s * 0.4, 0,
      fx(level.W / 2), fy(o.headY), o.headR * s * 1.2);
    hg.addColorStop(0, ART.bodyLit);
    hg.addColorStop(1, ART.bodyDim);
    ctx.fillStyle = hg; ctx.fill();
    ctx.restore();
  }

  // ---------- TRAY ----------
  function drawTray() {
    const t = L.tray;
    ctx.save();
    UI.roundRectPath(ctx, t.x, t.y, t.w, t.h, 16);
    ctx.fillStyle = TOK.tint03; ctx.fill();
    ctx.strokeStyle = TOK.lineSoft; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();

    if (!t.slots.length) {
      ctx.fillStyle = TOK.textMute;
      ctx.font = '600 16px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(phase === 'won' ? 'Complete' : 'Tray empty', t.x + t.w / 2, t.y + t.h / 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      return;
    }

    for (const s of t.slots) {
      const src = level.cells[s.piece.home];
      const k = s.size / (level.cs * 1.20);
      ctx.save();
      // a shadow under the fragment, so it reads as a loose object
      ctx.save();
      ctx.translate(0, Math.max(1.2, s.size * 0.028));
      ctx.globalAlpha = 0.30;
      ctx.filter = 'blur(4px)';
      ctx.translate(s.cx, s.cy); ctx.rotate(s.piece.rot * Math.PI / 2); ctx.scale(k, k);
      ctx.translate(-src.cx, -src.cy);
      pathPolyRaw(src.poly);
      ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fill();
      ctx.restore();

      drawPieceContent(src, s.cx, s.cy, k, s.piece.rot);

      // The same one-directional light the figure gets, so a tray piece looks
      // like the same material rather than a sticker.
      ctx.save();
      ctx.translate(s.cx, s.cy); ctx.rotate(s.piece.rot * Math.PI / 2); ctx.scale(k, k);
      ctx.translate(-src.cx, -src.cy);
      pathPolyRaw(src.poly); ctx.clip();
      ctx.restore();
      ctx.save();
      pathTrayPiece(s, k, src); ctx.clip();
      const lg = ctx.createLinearGradient(s.cx - s.size / 2, s.cy - s.size / 2,
                                          s.cx + s.size / 2, s.cy + s.size / 2);
      lg.addColorStop(0, 'rgba(255,255,255,0.09)');
      lg.addColorStop(0.42, 'rgba(255,255,255,0.00)');
      lg.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = lg;
      ctx.fillRect(s.cx - s.size, s.cy - s.size, s.size * 2, s.size * 2);
      ctx.restore();
      ctx.restore();
      s.path = null;
    }
  }

  function pathTrayPiece(s, k, src) {
    ctx.save();
    ctx.translate(s.cx, s.cy); ctx.rotate(s.piece.rot * Math.PI / 2); ctx.scale(k, k);
    ctx.translate(-src.cx, -src.cy);
    pathPolyRaw(src.poly);
    ctx.restore();
  }

  function drawDragged() {
    const src = level.cells[drag.piece.home];
    ctx.save();
    ctx.translate(0, 8); ctx.globalAlpha = 0.5; ctx.filter = 'blur(5px)';
    ctx.translate(drag.x, drag.y); ctx.rotate(drag.piece.rot * Math.PI / 2);
    ctx.scale(L.fig.s, L.fig.s); ctx.translate(-src.cx, -src.cy);
    pathPolyRaw(src.poly); ctx.fillStyle = 'rgba(0,0,0,0.95)'; ctx.fill();
    ctx.restore();
    drawPieceContent(src, drag.x, drag.y, L.fig.s, drag.piece.rot, 0.97);
  }

  // ---------- HUD ----------
  function speaker(cx, cy, on) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = TOK.ink90; ctx.fillStyle = TOK.ink90;
    ctx.lineWidth = 1.7; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-7, -3.4); ctx.lineTo(-3.2, -3.4); ctx.lineTo(1.4, -7.6);
    ctx.lineTo(1.4, 7.6); ctx.lineTo(-3.2, 3.4); ctx.lineTo(-7, 3.4);
    ctx.closePath(); ctx.fill();
    if (on) {
      ctx.beginPath(); ctx.arc(2.6, 0, 4.2, -0.85, 0.85); ctx.stroke();
      ctx.beginPath(); ctx.arc(2.6, 0, 7.2, -0.8, 0.8); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(4.6, -4.2); ctx.lineTo(9.6, 4.2);
      ctx.moveTo(9.6, -4.2); ctx.lineTo(4.6, 4.2); ctx.stroke();
    }
    ctx.restore();
  }

  /* A quarter-turn arrow, for the narrow-frame UNDO. The head is placed from
     the arc's own tangent rather than by eye, so it stays on the line. */
  function undoIcon(cx, cy, dim) {
    const a0 = Math.PI * 1.12, a1 = Math.PI * 0.72, r = 7;
    ctx.save();
    ctx.translate(cx, cy + 0.5);
    ctx.strokeStyle = dim ? UI.PILL.textDim : TOK.ink90;
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.arc(0, 0, r, a0, a1, false); ctx.stroke();
    const px = Math.cos(a0) * r, py = Math.sin(a0) * r;
    const dx = Math.sin(a0), dy = -Math.cos(a0);          // backwards along the arc
    const nx = -dy, ny = dx;
    ctx.beginPath();
    ctx.moveTo(px + dx * 4.2, py + dy * 4.2);
    ctx.lineTo(px - dx * 1.6 + nx * 3.4, py - dy * 1.6 + ny * 3.4);
    ctx.lineTo(px - dx * 1.6 - nx * 3.4, py - dy * 1.6 - ny * 3.4);
    ctx.closePath(); ctx.fillStyle = dim ? UI.PILL.textDim : TOK.ink90; ctx.fill();
    ctx.restore();
  }
  function rulesIcon(cx, cy) {
    ctx.save();
    ctx.fillStyle = TOK.ink90;
    ctx.font = '700 18px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', cx, cy + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  /* Order is fixed site-wide: sound, Undo, Restart, Hint, Rules. Relic has no
     hint by design, so it is omitted rather than reordered.

     NARROW FRAMES. With all three labels the row measures 331 and needs 347 of
     frame, measured across a 6552-size sweep. iPhone SE and a lot of budget
     Androids report 320, and the Galaxy Fold's cover screen 280, so below the
     boundary the row simply ran off the side. Buttons are chrome and are never
     SCALED, but an icon pill is a shape the shared system already provides at
     its own house size, so the ladder gives up the gap, then the RULES label,
     then the UNDO label, and never a pixel of button. `hudFit().rung` reports
     which rung a frame landed on. */
  function controlRow(rung) {
    const row = [
      { id: 'mute',    w: UI.PILL.iconW, icon: 'speaker' },
      { id: 'undo',    label: 'UNDO' },
      { id: 'restart', label: 'RESTART' },
      { id: 'rules',   label: 'RULES' },
    ];
    if (rung >= 2) { row[3] = { id: 'rules', w: UI.PILL.iconW, icon: 'rules' }; }
    if (rung >= 3) { row[1] = { id: 'undo',  w: UI.PILL.iconW, icon: 'undo' }; }
    for (const b of row) if (!b.icon) b.w = UI.pillWidth(ctx, b.label);
    return row;
  }
  const rowWidth = (row, gap) =>
    row.reduce((a, b) => a + b.w, 0) + gap * (row.length - 1);

  function drawControls() {
    const margin = 12;
    let rung = 0, gap = UI.PILL.gap, row = controlRow(0);
    if (MODE === 'mobile') {
      const budget = LW - margin * 2;
      if (rowWidth(row, gap) > budget) { rung = 1; gap = 6; }
      if (rowWidth(row, gap) > budget) { rung = 2; row = controlRow(2); }
      if (rowWidth(row, gap) > budget) { rung = 3; row = controlRow(3); }
    }
    const total = rowWidth(row, gap);
    let x = MODE === 'mobile' ? Math.max(margin, (LW - total) / 2) : L.sidePad;
    const cy = L.ctrlCy;
    const dimUndo = history.length === 0;
    for (const b of row) {
      const dim = b.id === 'undo' && dimUndo;
      const box = UI.drawPill(ctx, b.icon ? '' : b.label, x + b.w / 2, cy, { w: b.w, dim });
      if (b.icon === 'speaker') speaker(x + b.w / 2, cy, sfx ? sfx.isOn() : true);
      else if (b.icon === 'undo') undoIcon(x + b.w / 2, cy, dim);
      else if (b.icon === 'rules') rulesIcon(x + b.w / 2, cy);
      L.hit[b.id] = box;
      x += b.w + gap;
    }
    L.controlsRight = x - gap;
    L.rowWidth = total;
    L.rowRung = rung;
  }

  /* One right-aligned line on the band centre line, all figures in it,
     separated by the house three-space-dot-three-space. It shrinks into
     whatever the control row has left, with a floor. */
  function drawReadout() {
    const left = level.pieces.filter(p => p.at == null).length;
    const txt = 'Level ' + levelNo + '   ·   ' + (left === 0 ? 'all placed'
                 : left + (left === 1 ? ' piece left' : ' pieces left'));
    const rx = LW - L.sidePad;
    const room = MODE === 'mobile' ? LW - L.sidePad * 2
                                   : rx - (L.controlsRight || 0) - 16;
    let hs = Math.max(0.66, Math.min(1, LW / 620));
    ctx.font = '600 ' + Math.round(16 * hs) + 'px Inter, sans-serif';
    let guard = 0;
    while (ctx.measureText(txt).width > room && hs > 0.66 && guard++ < 12) {
      hs -= 0.03;
      ctx.font = '600 ' + Math.round(16 * hs) + 'px Inter, sans-serif';
    }
    ctx.fillStyle = TOK.ink72;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, rx, MODE === 'mobile' ? topBand() / 2 : L.ctrlCy);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    L.readoutLeft = rx - ctx.measureText(txt).width;
    L.readoutW = ctx.measureText(txt).width;
  }

  // ---------- CARDS ----------
  const RULES = [
    'Colour bands run right through the figure, so every broken edge carries a sequence of colours.',
    'Drag a fragment into a gap. It will sit in any gap, right or wrong. Nothing will tell you which.',
    'Tap a fragment to turn it. Where a piece belongs, its bands carry straight on into its neighbours.',
    'Undo and Restart are free. Nothing is timed and nothing can be lost.',
  ];

  function wrapText(text, maxW, size) {
    ctx.font = '500 ' + size + 'px Inter, sans-serif';
    const out = []; let line = '';
    for (const w of text.split(' ')) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; }
      else line = t;
    }
    if (line) out.push(line);
    return out;
  }

  /* The standard box: 470 wide max with a 28 side margin, 420 tall, three
     zones, and only the middle scrolls. The type never shrinks and the CTA
     never moves; both are house sizes. */
  function cardLayout(kind) {
    const pw = Math.min(LW - 56, 470);
    const ph = Math.min(LH - 20, 420);
    const px = Math.round((LW - pw) / 2);
    const py = Math.max(10, Math.round((LH - ph) / 2));
    const HEADER = 154, FOOTER = 98;
    const viewTop = py + HEADER;
    const viewH = Math.max(40, ph - HEADER - FOOTER);

    const items = [];
    if (kind === 'rules') {
      // The demo. "The colours have to run through" is not guessable from a
      // still image, in the same way Stained's overlap goal was not.
      items.push({ t: 'demo', h: 110 });
      for (const r of RULES) {
        const lines = wrapText(r, pw - 100, 16);
        items.push({ t: 'rule', lines, h: lines.length * 22 + 13 });
      }
    } else {
      items.push({ t: 'won', h: 96 });
    }
    let contentH = 0; for (const it of items) contentH += it.h;
    contentH = Math.max(0, contentH - 13);

    return {
      kind, px, py, pw, ph, HEADER, FOOTER, viewTop, viewH, items, contentH,
      scrollMax: Math.max(0, contentH - viewH),
      ctaCy: py + ph - FOOTER + 16 + UI.CTA.h / 2,
      title: kind === 'rules' ? 'RELIC' : 'COMPLETE',
      subtitle: kind === 'rules'
        ? 'Put the fragments back so the bands run unbroken.'
        : 'The bands run straight through. Nothing is out of place.',
    };
  }

  function drawCard(kind, now) {
    const c = cardLayout(kind);
    cardScroll = Math.max(0, Math.min(cardScroll, c.scrollMax));
    L.cardBody = { x: c.px, y: c.viewTop, w: c.pw, h: c.viewH, max: c.scrollMax };

    ctx.save();
    ctx.fillStyle = kind === 'win' ? TOK.scrimWin : TOK.scrim;
    ctx.fillRect(0, 0, LW, LH);

    UI.roundRectPath(ctx, c.px, c.py, c.pw, c.ph, 22);
    ctx.fillStyle = TOK.bgCard; ctx.fill();
    ctx.strokeStyle = TOK.tint12; ctx.lineWidth = 1;
    UI.roundRectPath(ctx, c.px + 0.5, c.py + 0.5, c.pw - 1, c.ph - 1, 22);
    ctx.stroke();

    // Header: fixed.
    ctx.fillStyle = TOK.text;
    ctx.font = '800 40px Inter, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(c.title, c.px + 34, c.py + 34 + 34);
    ctx.fillStyle = TOK.ink82;
    ctx.font = '600 17px Inter, sans-serif';
    const sub = wrapText(c.subtitle, c.pw - 68, 17).slice(0, 2);
    ctx.font = '600 17px Inter, sans-serif';
    for (let i = 0; i < sub.length; i++)
      ctx.fillText(sub[i], c.px + 34, c.py + 34 + 54 + 17 + i * 24);

    // Body: the only zone that scrolls.
    ctx.save();
    ctx.beginPath(); ctx.rect(c.px, c.viewTop, c.pw, c.viewH); ctx.clip();
    let yy = c.viewTop - cardScroll;
    let n = 0;
    for (const it of c.items) {
      if (yy + it.h > c.viewTop - 60 && yy < c.viewTop + c.viewH + 60) {
        if (it.t === 'demo') drawDemo(c.px + 34, yy, c.pw - 68, it.h - 14, now);
        else if (it.t === 'won') {
          ctx.textAlign = 'center';
          ctx.fillStyle = TOK.ink90;
          ctx.font = '500 16px Inter, sans-serif';
          ctx.fillText('Level ' + levelNo, c.px + c.pw / 2, yy + 26);
          ctx.font = '800 34px Inter, sans-serif'; ctx.fillStyle = TOK.text;
          ctx.fillText(level.figure.name, c.px + c.pw / 2, yy + 66);
          ctx.textAlign = 'left';
        } else {
          n++;
          ctx.beginPath();
          ctx.arc(c.px + 43, yy + 11, 12, 0, Math.PI * 2);
          ctx.fillStyle = TOK.accentText; ctx.fill();
          ctx.fillStyle = TOK.bg;
          ctx.font = '800 14px Inter, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(n), c.px + 43, yy + 12);
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = TOK.ink90;
          ctx.font = '500 16px Inter, sans-serif';
          for (let i = 0; i < it.lines.length; i++)
            ctx.fillText(it.lines[i], c.px + 66, yy + 17 + i * 22);
        }
      }
      yy += it.h;
    }
    ctx.restore();

    // A 20px fade marks an edge that has more beyond it. No scrollbar.
    if (cardScroll > 1) fadeEdge(c, true);
    if (cardScroll < c.scrollMax - 1) fadeEdge(c, false);

    L.hit[kind === 'win' ? 'next' : 'close'] =
      UI.drawCTA(ctx, kind === 'win' ? 'NEXT' : 'GOT IT', c.px + c.pw / 2, c.ctaCy, TOK.accent);
    ctx.restore();
    return c;
  }

  function fadeEdge(c, top) {
    const y = top ? c.viewTop : c.viewTop + c.viewH - 20;
    const g = ctx.createLinearGradient(0, y, 0, y + 20);
    g.addColorStop(top ? 0 : 1, TOK.bgCard);
    g.addColorStop(top ? 1 : 0, 'rgba(19,31,54,0)');
    ctx.fillStyle = g; ctx.fillRect(c.px + 1, y, c.pw - 2, 20);
  }

  /* THE DEMO. One fragment drops into a gap the wrong way round, the bands
     jog, it turns, and the bands run straight. Two cells of a real lattice
     and a real band field, so the card cannot drift from the game. */
  const DEMO = (() => {
    const rng = M.makeRng(24601);
    const cs = M.FIG_W / 4.2;
    const g = M.makeWave(rng, cs);
    const field = M.makeBandField(M.makeRng(90210), { curve: 1.15 });
    const cells = [];
    for (let i = 1; i <= 2; i++) {
      cells.push({ poly: M.cellPoly(i, 2, cs, 0, 0, g),
                   cx: (i + 0.5) * cs, cy: 2.5 * cs });
    }
    const polys = [];
    for (let i = 0; i < field.bands.length; i++) {
      const top = [], bot = [];
      for (let k = 0; k <= 24; k++) {
        const x = -M.FIG_W * 0.2 + M.FIG_W * 1.4 * k / 24;
        top.push([x, field.yOf(field.bounds[i], x)]);
        bot.push([x, field.yOf(field.bounds[i + 1], x)]);
      }
      polys.push({ hex: field.bands[i].hex, poly: top.concat(bot.reverse()) });
    }
    return { cs, cells, polys };
  })();

  function drawDemo(x, y, w, h, now) {
    const cycle = 4200, t = ((now || 0) % cycle) / cycle;
    // 0.00-0.40 wrong and jogging, 0.40-0.52 the turn, 0.52-1.00 straight
    const rot = t < 0.40 ? 1 : (t < 0.52 ? 1 - (t - 0.40) / 0.12 : 0);

    ctx.save();
    UI.roundRectPath(ctx, x, y, w, h, 12);
    ctx.fillStyle = 'rgba(10,16,28,0.55)'; ctx.fill();
    ctx.clip();

    // The caption gets its own strip. It sat on top of the art in the first
    // build, which made both of them harder to read than either alone.
    const capH = 20, artH = h - capH;
    const k = Math.min(w / (DEMO.cs * 2.35), artH / (DEMO.cs * 1.06));
    const mid = { x: x + w / 2, y: y + artH / 2 };
    const A = DEMO.cells[0], B = DEMO.cells[1];
    const half = (B.cx - A.cx) * k / 2;

    const paint = (cell, tx, ty, r) => {
      ctx.save();
      ctx.translate(tx, ty); ctx.rotate(r * Math.PI / 2); ctx.scale(k, k);
      ctx.translate(-cell.cx, -cell.cy);
      pathPolyRaw(cell.poly); ctx.clip();
      for (const b of DEMO.polys) { ctx.fillStyle = b.hex; pathPolyRaw(b.poly); ctx.fill(); }
      ctx.restore();
      ctx.save();
      ctx.translate(tx, ty); ctx.scale(k, k); ctx.translate(-cell.cx, -cell.cy);
      pathPolyRaw(cell.poly);
      ctx.restore();
      ctx.strokeStyle = 'rgba(4,6,12,0.55)'; ctx.lineWidth = 1.4; ctx.stroke();
    };
    paint(A, mid.x - half, mid.y, 0);
    paint(B, mid.x + half, mid.y, rot);

    // A caption that carries the same information as the motion, because a
    // paused tab, reduced motion or a screenshot all show one frame.
    ctx.fillStyle = rot > 0.02 ? TOK.accentText : '#5DD39E';   // --green
    ctx.font = '700 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(rot > 0.02 ? 'BANDS JOG. WRONG WAY ROUND.' : 'BANDS RUN STRAIGHT. IT BELONGS.',
                 x + w / 2, y + h - 7);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // ---------- ACTIONS ----------
  function place(piece, cellId) {
    const from = piece.at;
    history.push({ t: 'place', p: piece.id, from, to: cellId, rot: piece.rot });
    piece.at = cellId;
    moves++;
    /* WRONG HOLE only. A piece dropped in the right hole but not yet turned
       is not a misplacement, and counting it as one made every solved level
       report four of them. This event exists to find levels that are unfairly
       ambiguous, so it has to mean what it says. */
    if (piece.home !== cellId) {
      misplaced++;
      TR().track('piece_misplaced', { level: levelNo });
    }
    if (sfx) sfx.play('glass');
    layoutTray();
    checkWin();
  }

  function lift(piece) {
    history.push({ t: 'lift', p: piece.id, from: piece.at, rot: piece.rot });
    piece.at = null;
    if (sfx) sfx.play('click');
    layoutTray();
  }

  function rotate(piece) {
    history.push({ t: 'rot', p: piece.id, prev: piece.rot });
    piece.rot = (piece.rot + 1) % 4;
    rotations++;
    if (sfx) sfx.play('turn');
    if (piece.at != null) checkWin();
  }

  /* Undo is FREE. There is no move economy in this game, so nothing needs to
     cost anything. Untangle charges a move for an undo, but only because
     Untangle has a scored counter to charge it against. */
  function undo() {
    if (!history.length) return;
    const h = history.pop();
    const p = level.pieces[h.p];
    if (h.t === 'place') { p.at = h.from; p.rot = h.rot; }
    else if (h.t === 'lift') { p.at = h.from; p.rot = h.rot; }
    else { p.rot = h.prev; }
    if (phase === 'won') { phase = 'play'; card = null; }
    if (sfx) sfx.play('click');
    layoutTray();
  }

  function restart() {
    for (const p of level.pieces) { p.at = null; p.rot = p.rot0; }
    history = []; moves = 0; rotations = 0; misplaced = 0;
    phase = 'play'; card = null; drag = null;
    TR().levelRestart(levelNo);
    layoutTray();
  }

  function checkWin() {
    if (phase === 'won') return;
    for (const p of level.pieces) if (p.at !== p.home || p.rot % 4 !== 0) return;
    phase = 'won';
    winAt = performance.now();
    if (sfx) sfx.play('win');
    TR().levelComplete(levelNo, moves);
    TR().track('rotations_used', { level: levelNo, n: Math.min(999, rotations) });
    setTimeout(() => { if (phase === 'won') { card = 'win'; cardScroll = 0; } }, 1250);
  }

  // ---------- INPUT ----------
  function xy(e) {
    const r = canvas.getBoundingClientRect();
    return [ (e.clientX - r.left) * (LW / r.width),
             (e.clientY - r.top)  * (LH / r.height) ];
  }
  const inBox = (b, x, y) => b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

  function trayHit(x, y) {
    for (const s of L.tray.slots || []) {
      const h = s.size / 2;
      if (x >= s.cx - h && x <= s.cx + h && y >= s.cy - h && y <= s.cy + h) return s.piece;
    }
    return null;
  }

  function slotHit(x, y) {
    const [gx, gy] = toFigure(x, y);
    let best = null, bestD = Infinity;
    for (const c of level.cells) {
      if (!c.hole) continue;
      const d = Math.hypot(gx - c.cx, gy - c.cy);
      if (M.pointInPoly(gx, gy, c.poly)) return c;
      if (d < bestD) { bestD = d; best = c; }
    }
    // generous targeting, not a correctness test: the nearest gap wins if the
    // finger is anywhere near it
    return (best && bestD < level.cs * 0.62) ? best : null;
  }

  function placedHit(x, y) {
    const [gx, gy] = toFigure(x, y);
    for (const c of level.cells) {
      if (!c.hole) continue;
      const p = pieceInSlot(c.id);
      if (p && M.pointInPoly(gx, gy, c.poly)) return p;
    }
    return null;
  }

  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (sfx) sfx.ensureAudio();
    const [x, y] = xy(e);
    // Capture keeps a drag alive when the finger leaves the canvas. It throws
    // on an id the browser does not consider active, which is not a reason to
    // lose the gesture.
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ }

    if (card) { down = { card: true, x, y, y0: y, scroll: cardScroll }; return; }

    for (const id of ['mute', 'undo', 'restart', 'rules']) {
      if (inBox(L.hit[id], x, y)) { down = { btn: id, x, y }; return; }
    }
    if (phase === 'won') { down = null; return; }

    const tp = trayHit(x, y);
    if (tp) { down = { piece: tp, x, y, x0: x, y0: y, moved: false, from: null }; return; }
    const pp = placedHit(x, y);
    if (pp) { down = { piece: pp, x, y, x0: x, y0: y, moved: false, from: pp.at }; return; }
    down = null;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!down) return;
    const [x, y] = xy(e);
    if (down.card) {
      cardScroll = down.scroll - (y - down.y0);
      if (L.cardBody) cardScroll = Math.max(0, Math.min(cardScroll, L.cardBody.max));
      return;
    }
    if (!down.piece) return;
    if (!down.moved && Math.hypot(x - down.x0, y - down.y0) > 7) {
      down.moved = true;
      if (down.from != null) { lift(down.piece); down.lifted = true; }
      drag = { piece: down.piece, x, y, from: down.from };
      layoutTray();
    }
    if (drag) {
      drag.x = x; drag.y = y;
      const s = slotHit(x, y);
      hoverSlot = s ? s.id : null;
    }
  });

  function endPointer(e) {
    if (!down) return;
    const [x, y] = xy(e);
    const d = down; down = null;

    if (d.card) {
      const key = card === 'win' ? 'next' : 'close';
      if (Math.abs(y - d.y0) < 8 && inBox(L.hit[key], x, y)) {
        if (card === 'win') { card = null; loadLevel(levelNo + 1); layout(); }
        else card = null;
      }
      return;
    }
    if (d.btn) {
      if (!inBox(L.hit[d.btn], x, y)) return;
      if (d.btn === 'mute') { if (sfx) { sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.play('click'); } }
      else if (d.btn === 'undo') undo();
      else if (d.btn === 'restart') restart();
      else if (d.btn === 'rules') { card = 'rules'; cardScroll = 0; }
      return;
    }
    if (!d.piece) return;

    if (!d.moved) { rotate(d.piece); return; }        // a tap turns it

    const s = slotHit(x, y);
    drag = null; hoverSlot = null;
    if (s && !pieceInSlot(s.id)) place(d.piece, s.id);
    else if (d.lifted) { /* it goes back to the tray, which it already has */ }
    layoutTray();
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', () => { down = null; drag = null; hoverSlot = null; layoutTray(); });
  canvas.addEventListener('wheel', (e) => {
    if (!card) return;
    e.preventDefault();
    cardScroll += e.deltaY;
    if (L.cardBody) cardScroll = Math.max(0, Math.min(cardScroll, L.cardBody.max));
  }, { passive: false });

  // ---------- LOOP ----------
  function frame(now) { render(now); requestAnimationFrame(frame); }

  // ---------- DEBUG HANDLE ----------
  /* A card is not fixed until something can measure it. rulesFit reports the
     three zones and whether they sum to the card, and it reports only about
     the phase it names. */
  window.__relic = {
    get level() { return level; },
    get L() { return L; },
    model: M,
    selfTest: () => M.selfTest(),
    /* Draw one frame ON DEMAND. A hidden preview pane throttles rAF to
       nothing, so a pixel read-back off this canvas comes back transparent
       black and every contrast check "fails" identically. Forcing the same
       render() the loop calls makes the read-back measure what is actually
       painted rather than what the pane happens to have got round to. */
    repaint: (t) => { render(t == null ? performance.now() : t); return true; },
    setCard: (k) => { card = k; cardScroll = 0; render(performance.now()); return card; },
    load: (n) => { loadLevel(n); layout(); },
    rulesFit(kind) {
      const k = kind || 'rules';
      const c = cardLayout(k);
      const sum = c.HEADER + c.viewH + c.FOOTER;
      const ctaBottom = c.ctaCy + UI.CTA.h / 2;
      return {
        phase: k,
        fits: Math.abs(sum - c.ph) < 1.5 && c.px >= 0 && c.py >= 0 &&
              c.px + c.pw <= LW + 0.5 && c.py + c.ph <= LH + 0.5 &&
              ctaBottom <= c.py + c.ph - 20 &&
              c.viewTop + c.viewH <= c.ctaCy - UI.CTA.h / 2,
        cardH: c.ph, cardW: c.pw, frameH: LH, frameW: LW,
        headerH: c.HEADER, viewportH: c.viewH, footerH: c.FOOTER,
        contentH: c.contentH, scrollMax: c.scrollMax,
        gapCopyToCta: Math.round(c.ctaCy - UI.CTA.h / 2 - (c.viewTop + c.viewH)),
        overlapPx: Math.max(0, Math.round((c.viewTop + c.viewH) - (c.ctaCy - UI.CTA.h / 2))),
        ctaBottomToCardBottom: Math.round(c.py + c.ph - ctaBottom),
      };
    },
    /* Sweep the layout without resizing anything. LW/LH are the only inputs
       layout() has, so driving them directly runs the REAL layout code at any
       size, thousands of sizes a second. It is not a model of the layout, it
       is the layout.

       MODE is fixed for the session, so a mobile sweep has to run in a mobile
       frame and a desktop one in a desktop frame. `checkMeasure` below proves
       this agrees with a genuinely resized iframe rather than assuming it. */
    measure(w, h) {
      const oldW = LW, oldH = LH;
      LW = w; LH = h;
      layout();
      const r = {
        W: w, H: h, mode: MODE,
        figX: Math.round(L.figArea.x), figY: Math.round(L.figArea.y),
        figW: Math.round(L.figArea.w), figH: Math.round(L.figArea.h),
        figScale: +L.fig.s.toFixed(4),
        trayX: Math.round(L.tray.x), trayY: Math.round(L.tray.y),
        trayW: Math.round(L.tray.w), trayH: Math.round(L.tray.h),
        thumb: Math.round(L.tray.thumb), ctrlCy: Math.round(L.ctrlCy),
        rules: this.rulesFit('rules'), win: this.rulesFit('win'),
      };
      // The control row and read-out are measured during a draw, so run one.
      render(performance.now());
      Object.assign(r, {
        rowW: L.rowWidth, rung: L.rowRung, controlsRight: Math.round(L.controlsRight || 0),
        readoutLeft: Math.round(L.readoutLeft || 0),
      });
      LW = oldW; LH = oldH; layout();
      return r;
    },
    hudFit() {
      return {
        mode: MODE, LW, LH,
        rowWidth: L.rowWidth, rung: L.rowRung, controlsRight: L.controlsRight,
        readoutLeft: L.readoutLeft, readoutW: L.readoutW,
        rowFitsFrame: L.rowWidth <= LW - 24,
        collides: MODE === 'desktop' && L.readoutLeft < L.controlsRight + 16,
      };
    },
    /* The claim the whole design rests on: a piece seats wherever it is
       dropped. Proven by DOING it, not by reading the code, because that is
       how Ballast's dead buttons got through a full QC pass. */
    wrongPlacementSeats() {
      const p = level.pieces.find(q => q.at == null);
      const wrong = level.holes.find(h => h !== p.home);
      if (p == null || wrong == null) return { ok: false, why: 'no free piece or no other hole' };
      const before = p.at;
      place(p, wrong);
      const seated = p.at === wrong;
      const stillPlaying = phase === 'play';
      undo();
      return { ok: seated && stillPlaying, seated, stillPlaying, restored: p.at === before };
    },
    state: () => ({
      level: levelNo, phase, moves, rotations, misplaced,
      inTray: level.pieces.filter(p => p.at == null).length,
      stats: level.stats,
    }),
  };

  // ---------- BOOT ----------
  try { levelNo = Math.max(1, parseInt(localStorage.getItem(STORE) || '1', 10) || 1); } catch (e) {}
  loadLevel(levelNo);
  setCanvasVars();
  resizeCanvas();
  fitFullscreen();
  resizeCanvas();
  layout();
  TR().gameStart();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', () => onResize());
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);   // iOS URL-bar collapse
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  requestAnimationFrame(frame);
})();
