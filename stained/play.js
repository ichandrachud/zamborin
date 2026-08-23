/* ============================================================
   Zamborin · Stained · prototype

   Deliberately plain. The brief's milestone 1 asks one question — is the
   overlap mechanic fun and legible — and leading, backlight glow, glass grain
   and the win bloom are milestone 4. Every cell is drawn as its flat composite
   colour, which is exactly what the multiply blend would resolve to, so the
   live-blend behaviour under the finger is real even though the finish is not.

   THE DRAGGED PANE IS INCLUDED IN THE COMPOSITE while it hovers over a legal
   position. That is the whole point of the game: you watch green arrive the
   instant yellow crosses blue. If the preview only updated on drop, the core
   satisfaction would happen after the decision instead of during it.
   ============================================================ */
(function () {
  'use strict';

  var S = window.StainedModel;
  var R = window.StainedRender;
  var LEVELS = window.STAINED_LEVELS || [];

  /* Where the player got to. A hundred levels with nothing remembered would
     mean starting at the first window every session, so the campaign needs
     this to be usable at all. Same shape as prism's: one integer, clamped,
     wrapped in try/catch because Safari private browsing throws on write. */
  var LS = 'zamborin-stained.level.v1';
  function saveLevel(i) { try { localStorage.setItem(LS, String(i + 1)); } catch (e) {} }
  function loadLevel() {
    try {
      var v = parseInt(localStorage.getItem(LS), 10);
      return (v >= 1 && v <= LEVELS.length) ? v - 1 : 0;
    } catch (e) { return 0; }
  }

  /* The artist's wheel. Chosen with CIE76 dE across all 28 pairs, not by eye,
     because contrast ratio does not predict confusability. Blue and purple are
     neighbours on this wheel and were the pinch at dE 25 on the first attempt;
     a cooler deeper blue and a more violet purple opened them up. Worst pair
     is now yellow/orange at dE 36, which beats the CMY palette this replaces
     (34). Brown sits at L* 29 so three stacked filters still read as very dark
     glass rather than as a hole. */
  var PALETTE = [
    '#F7F1E4', // 0 clear, lit glass
    '#C13A32', // 1 red
    '#F2CE45', // 2 yellow
    '#EE8C2A', // 3 orange   = red + yellow
    '#1E63C8', // 4 blue
    '#8E3EAE', // 5 purple   = red + blue
    '#2F9150', // 6 green    = yellow + blue
    '#5A3E2E'  // 7 brown    = all three
  ];
  // Two corals, from tokens.css. ACCENT is a FILL under white type and has to
  // be dark enough (4.85:1). ACCENT_MARK is coral used as a mark or outline on
  // the dark card and has to be light enough (5.88:1).
  /* S4. Stained shipped with no sound at all, the only game of fifteen with
     none until Needle turned out to be silent too. Glass wants brightness and a
     short ring rather than the wooden knocks the board games use, so it draws on
     `glass` and `turn` in shared/sfx.js. */
  var sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zamborin-stained.sound' }) : null;
  var snd = {
    on:     function () { return !!(sfx && sfx.isOn()); },
    ready:  function () { if (sfx) sfx.ensureAudio(); },
    toggle: function () { if (sfx) { sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.play('glass'); } },
    place:  function () { if (sfx) sfx.play('glass'); },
    turn:   function () { if (sfx) sfx.play('turn'); },
    lift:   function () { if (sfx) sfx.play('pop'); },
    light:  function () { if (sfx) sfx.play('click'); },
    undo:   function () { if (sfx) sfx.play('pop'); },
    win:    function () { if (sfx) sfx.play('win'); },
  };

  var ACCENT = '#C24A39';
  var ACCENT_MARK = '#FF6B5C';

  /* ---------- PRIMARY PIPS — prototype, 2026-08-20 ----------
     Stained asks you to read a colour and work out which primaries overlap to
     make it. Colour is therefore not decoration on this board, it IS the
     puzzle, so a player who cannot separate two of the seven is not playing a
     harder game, they are guessing.

     Measured on the lit palette: under protanopia red and brown sit 2.5 apart,
     and red is R alone where brown is all three. 55 of the 100 levels carry
     both at once and 94 carry some confusable pair.

     Kaleido's answer, a shape per piece, does not transplant: its four pieces
     are ATOMIC, while orange here is not a third colour but red and yellow on
     top of each other. So the mark has to compose the way the mechanic
     composes. Three slots, one per primary, filled when that primary is
     present: red is the first slot alone, orange the first two, brown all
     three. It does not name the colour, it shows the recipe.

     Ink is picked per glass for contrast, never a single colour over all of
     them: measured 4.7:1 at worst and 16.7:1 at best. */
  var PIP_DARK = '#16110C', PIP_LIGHT = '#FFF6E8';
  //              clear      red        yellow     orange
  var PIP_INK = [PIP_DARK, PIP_LIGHT, PIP_DARK, PIP_DARK,
  //              blue       purple     green     brown
                 PIP_LIGHT, PIP_LIGHT, PIP_DARK, PIP_LIGHT];
  var PIP_LS = 'zamborin-stained.pips.v1';
  var pips = (function () { try { return localStorage.getItem(PIP_LS) === '1'; } catch (e) { return false; } })();
  function savePips() { try { localStorage.setItem(PIP_LS, pips ? '1' : '0'); } catch (e) {} }

  /* CORNERS, NOT A ROW. A row of three slots was the first try and it does not
     work: with only one pip showing you cannot tell which slot it is in unless
     the empty slots are also drawn, and an empty slot faint enough to stay
     subordinate measures about 1.2:1, which is to say invisible. Drawn loud
     enough to read it competes with the real mark.

     A corner locates itself. Red top-left, yellow top-right, blue bottom-left,
     each drawn only when that primary is present, nothing drawn when it is
     not. One mark in the top-left is unambiguously red with no reference
     needed, and the bottom-right stays clear of the goal's unmatched dot. */
  var PIP_AT = [[0.19, 0.19], [0.81, 0.19], [0.19, 0.81]];   // R, Y, B

  /* A pane is a single colour, so it carries ONE mark rather than one per cell,
     on its top-left-most cell. Marking every cell of a six-cell pane says the
     same thing six times and turns the tray into confetti. */
  function pipChip(cells, x, y, cell, v) {
    if (!pips || !v) return;
    var br = cells[0][0], bc = cells[0][1];
    for (var i = 1; i < cells.length; i++) {
      if (cells[i][0] < br || (cells[i][0] === br && cells[i][1] < bc)) { br = cells[i][0]; bc = cells[i][1]; }
    }
    drawPips(x + bc * cell, y + br * cell, cell, v);
  }
  function drawPips(x, y, size, v) {
    if (!pips || !v) return;
    if (size < 11) return;                      // below this nothing reads
    var ink = PIP_INK[v] || PIP_DARK;
    var rad = Math.max(1.3, size * 0.082);
    ctx.save();
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.92;
    for (var b = 0; b < 3; b++) {
      if ((v & (1 << b)) === 0) continue;
      ctx.beginPath();
      ctx.arc(x + size * PIP_AT[b][0], y + size * PIP_AT[b][1], rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  var UI = window.ZAM_UI;
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');

  /* ---------- MODE + CANVAS, the house pattern ----------
     Taken from shared/new-game-template and prism rather than invented. The
     ?mode= override exists because the in-app preview always reports a coarse
     pointer, so the desktop frame cannot otherwise be measured. */
  var FORCED = (location.search.match(/[?&]mode=(desktop|mobile)/) || [])[1];
  var MODE = FORCED || ((matchMedia('(pointer: coarse)').matches || window.innerWidth < 768)
    ? 'mobile' : 'desktop');
  document.body.classList.add('mode-' + MODE);

  var LW = 760, LH = 600;

  /* A phone lies about its own size. innerHeight, visualViewport and
     clientHeight disagree while the browser toolbar is collapsing, and the
     shared CSS sizes the wrap from 100dvh, which is a fourth answer again. Take
     the SMALLEST of the three so the frame is never bigger than the space that
     actually exists. Same hardening as tailwind, untangle, tessera and fold. */
  function viewport() {
    var vv = window.visualViewport;
    var ws = [window.innerWidth, vv && vv.width, document.documentElement.clientWidth]
      .filter(function (v) { return typeof v === 'number' && v > 120; });
    var hs = [window.innerHeight, vv && vv.height, document.documentElement.clientHeight]
      .filter(function (v) { return typeof v === 'number' && v > 120; });
    return { w: Math.round(Math.min.apply(null, ws)), h: Math.round(Math.min.apply(null, hs)) };
  }

  function setCanvasVars() {
    /* Mobile sizes from measured JS pixels. The shared CSS uses 100dvh, and on
       iOS Safari with viewport-fit=cover that is NOT innerHeight, which
       collapses the canvas to a strip. */
    if (MODE === 'mobile') { var vp = viewport(); LW = vp.w; LH = vp.h; }
    else { LW = 760; LH = 600; }            // the one desktop frame, site-wide
    document.body.style.setProperty('--canvas-w', LW + 'px');
    document.body.style.setProperty('--canvas-h', LH + 'px');
  }
  function resizeCanvas() {
    var dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    /* Pin the canvas itself, not just its wrapper, so no CSS ratio gets a vote
       in how wide the frame is. */
    canvas.style.width = LW + 'px';
    canvas.style.height = LH + 'px';
    var rect = canvas.getBoundingClientRect();
    var dW = rect.width || LW, dH = rect.height || LH;
    /* If the box we were handed is not the shape we draw, our own numbers win.
       Fitting into a mismatched box is what pushes the sheet off one edge. */
    if (Math.abs((dW / dH) / (LW / LH) - 1) > 0.02) { dW = LW; dH = LH; }
    var bW = Math.round(dW * dpr), bH = Math.round(dH * dpr);
    if (canvas.width !== bW) canvas.width = bW;
    if (canvas.height !== bH) canvas.height = bH;
    var scale = Math.min(bW / LW, bH / LH);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  var gameWrap = canvas.parentElement;
  function fitFullscreen() {
    if (MODE === 'mobile') {
      gameWrap.style.width = LW + 'px';
      gameWrap.style.height = LH + 'px';
      return;
    }
    if (!document.body.classList.contains('focus-mode')) {
      gameWrap.style.width = ''; gameWrap.style.height = ''; return;
    }
    var vw = window.innerWidth, vh = window.innerHeight, aspect = LW / LH;
    var cw = vw, ch = Math.round(vw / aspect);
    if (ch > vh) { ch = vh; cw = Math.round(vh * aspect); }
    gameWrap.style.width = cw + 'px'; gameWrap.style.height = ch + 'px';
  }
  function onResize() {
    if (MODE === 'mobile') setCanvasVars();
    fitFullscreen(); resizeCanvas(); layout(); draw();
  }
  window.addEventListener('resize', onResize);
  /* draw() runs from a dozen places without re-measuring, so if the canvas box
     changes WITHOUT a window resize event - browser zoom, an ad slot landing,
     focus mode, a font settling - the transform goes stale and the new frame
     is painted at a different scale on top of the old one, which reads as two
     copies of the game overlapping. Observing the element itself closes that
     gap for every cause at once. Deliberately does NOT call fitFullscreen,
     which sets the wrapper size and would feed back into this. */
  if (window.ResizeObserver) {
    var lastBoxW = 0, lastBoxH = 0;
    new ResizeObserver(function () {
      var r = canvas.getBoundingClientRect();
      var w = Math.round(r.width), h = Math.round(r.height);
      if (!w || !h || (w === lastBoxW && h === lastBoxH)) return;
      lastBoxW = w; lastBoxH = h;
      resizeCanvas(); layout(); draw();
    }).observe(canvas);
  }
  window.addEventListener('orientationchange', function () { setTimeout(onResize, 100); });
  /* load and visualViewport are part of the pattern, not extras. A phone
     collapsing its toolbar changes innerHeight WITHOUT firing window.resize,
     so without these the wrap keeps a stale size and the sheet drifts off an
     edge. Stained shipped without them; tailwind has had all five since it was
     fixed for exactly this. */
  window.addEventListener('load', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  window.addEventListener('splash-done', function () {
    /* The rules card is already drawing behind the splash art, so without this
       the demo is 2.7 s into its 5.2 s loop when the art clears and the
       player's first sight of it is mid-slide. Restart it on the reveal so
       they always see frame one. */
    menuT0 = now();
    onResize();
  });

  var SIDE_PAD = MODE === 'mobile' ? 18 : 30;
  function topBand() { return MODE === 'mobile' ? 64 : 56; }
  function botBand() { return MODE === 'mobile' ? 136 : 16; }
  var uiButtons = [];
  /* 'menu' is the rules card, 'play' is the game. The card opens first: the
     rule that carries this game - the goal shows ONLY the overlaps - is not
     guessable, and a player dropped straight onto a board has no way to learn
     it except by failing. */
  var phase = 'menu';
  var menuT0 = 0, menuAnim = false, menuContentBottom = 0, menuCtaTop = 0;
  var demoClock = null;              // test hook: freeze the loop at a given ms

  var level = null, panes = [], history = [], idx = 0;
  var drag = null, showTarget = false, won = false;
  /* The window lighting up is the whole resolve, so it is animated rather than
     switched. Runs only while it is running: no permanent render loop. */
  var bloom = 0, blooming = false;
  /* The window is DARK while you work. Measured: with the blend showing
     continuously, a hill-climber solves 93% of levels by placing something,
     reading off how many cells are wrong and adjusting — never planning. The
     light is what turns that gradient off. */
  var lit = false, pressing = false;
  /* Latched once the LAST level has been solved and seen lit. Solving is a
     fact about the arrangement, but the player only learns it by lighting
     the window, so the end screen waits for the light the same way the
     bloom does. Once latched the light stays on: the finished window is
     the thing being celebrated, and letting it fall dark behind the
     scrim would end the game on a black rectangle. */
  var finished = false;
  /* The toggle releases itself: on while held, then a beat before it falls
     back. Long enough to take your finger off and look, short enough that the
     light stays a decision rather than a default. */
  var HOLD_AFTER_RELEASE = 1000;
  var offTimer = null, knob = 0, knobTo = 0, knobAnim = false;
  var view = { cell: 40, gx: 0, gy: 0, trayY: 0, trayCell: 26, cw: 0, ch: 0 };

  // ---------- analytics ----------
  // Same shape as the other thirteen games: a NOOP stand-in so a blocked or
  // absent tracker can never throw into the draw loop.
  var NOOP = { init: function () {}, gameStart: function () {}, levelStart: function () {},
               levelComplete: function () {}, levelRestart: function () {}, hintUsed: function () {} };
  function T() { return window.ZAM_TRACK || NOOP; }

  // ---------- level ----------
  function load(i) {
    level = LEVELS[i];
    if (!level) return;
    idx = i;
    panes = level.panes.map(function (p, k) {
      return { id: k, shape: p.shape, colour: p.colour, r: null, c: null, rot: 0 };
    });
    history = []; drag = null; won = false; showTarget = false; bloom = 0;
    finished = false;
    lit = false; knob = 0; knobTo = 0;
    if (offTimer) { clearTimeout(offTimer); offTimer = null; }
    saveLevel(i);
    T().levelStart(i + 1);          // 1-based, so it reads like the level pill
    layout(); draw(); chrome();
  }

  function snapshot() {
    return panes.map(function (p) { return { id:p.id, shape:p.shape, colour:p.colour, r:p.r, c:p.c, rot:p.rot }; });
  }
  function pushHistory() { history.push(snapshot()); if (history.length > 200) history.shift(); }

  function placed() { return panes.filter(function (p) { return p.r !== null; }); }

  function composite(extra) {
    var list = placed();
    if (extra) list = list.concat([extra]);
    return S.composite(level.size, list);
  }

  /* ---------- what the target shows, and therefore what wins ----------

     The target shows the OVERLAPS and the CLEAR GLASS. It hides which single
     filter fills each remaining cell, and that hidden information is what used
     to make this too easy: with the whole picture on show you could read each
     cell's colour straight off and place to it.

     Winning is judged on exactly what is shown. Hiding a cell and still
     requiring it to match would let a player satisfy every scrap of
     information they have and be told no, with no way to reason about why.

     Measured: hiding the clear glass as well makes a slightly easier puzzle
     AND destroys the picture — only 1% of arrangements satisfying the overlaps
     alone reproduce the window that generated them, against 82% when the clear
     glass is shown. So the clear glass stays visible; it is the composition. */
  function pop(v) { return (v & 1) + ((v >> 1) & 1) + ((v >> 2) & 1); }
  function isMix(v) { return pop(v) >= 2; }
  /* OVERLAPS ONLY. The clear glass and the single-filter cells are both
     hidden now: the target states where colours must MIX and what they must
     mix to, and nothing else. Everywhere else you may put anything, provided
     you do not mix there. */
  function isShown(v) { return isMix(v); }

  function cellOk(comp, t) {
    if (isMix(t)) return comp === t;
    return !isMix(comp);             // no overlap where none was asked for
  }

  function checkWin() {
    var comp = composite(null), t = level.target;
    var before = won;
    won = true;
    snd.win();
    for (var i = 0; i < t.length; i++) {
      if (!cellOk(comp[i], t[i])) { won = false; break; }
    }
    // solving is a fact about the arrangement, but you only LEARN it by
    // lighting the window, so the bloom waits for the light
    if (won && !before && lit) { startBloom(); T().levelComplete(idx + 1, history.length); }
    if (won && lit && idx === LEVELS.length - 1) finished = true;
    if (!won) { bloom = 0; }
    return won;
  }

  function startBloom() {
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    if (blooming) return;
    blooming = true;
    (function step() {
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      var k = Math.min(1, (now - t0) / 900);
      // rise fast, settle back to a held glow
      bloom = k < 0.35 ? (k / 0.35) : (1 - 0.45 * ((k - 0.35) / 0.65));
      draw();
      if (k < 1) requestAnimationFrame(step);
      else { blooming = false; bloom = 0.55; draw(); }
    })();
  }

  // ---------- layout ----------
  /* One fixed frame. The only thing that flexes is the cell, chosen as the
     largest that fits the target, the lightbox and the tray between the two
     chrome bands the house reserves. */
  var PAD = 15, THUMB_GAP = 14;

  function layout() {
    var n = level.size;
    for (var cell = 76; cell >= 16; cell -= 2) if (fits(cell, n)) break;
    apply(cell, n);
  }

  /* DESKTOP IS LANDSCAPE, so the window does not stack with everything else.
     The frame is 760x600 and the window is square: stacking target, window and
     tray vertically left the glass at 38px cells with half the width empty.
     The window takes the left, the target and the tray take a right-hand
     column. On a phone the frame is portrait and stacking is correct. */
  function measure(cell, n) {
    var gridPx = cell * n;
    var bezel = Math.max(3, cell * 0.045);   // breathing room only; nothing is drawn with it
    var sill = Math.max(26, cell * 0.80);
    var housingW = gridPx + bezel * 2;
    var housingH = gridPx + bezel * 2 + sill;
    var thumbCell = Math.max(7, Math.round(cell * 0.26));
    var thumbW = thumbCell * n;
    var top = topBand(), bot = botBand();

    if (MODE === 'desktop') {
      /* The note used to sit centred under the window, which reserved a band
         across the whole bottom of the frame for one line of text. Moved into
         the right column it costs nothing, and the window grows into the space
         it vacated: 408px to 444px at 6x6. */
      var colW = Math.max(200, Math.round(LW * 0.31));
      var leftW = LW - colW;
      var gx = Math.round((leftW - housingW) / 2 + bezel);
      var gy = Math.round(top + 8 + bezel);
      var colX = leftW + Math.round((colW - thumbW) / 2);
      return {
        cell: cell, trayCell: Math.max(12, Math.round(cell * 0.44)),
        thumbCell: thumbCell, thumbW: thumbW,
        bezel: bezel, sill: sill, housingW: housingW, housingH: housingH,
        gx: gx, gy: gy,
        tgx: colX, tgy: top + 8,
        trayX: leftW + PAD, trayW: colW - PAD * 2,
        trayY: top + 8 + thumbW + 22,
        colX: leftW, colW: colW,
        noteY: LH - 34, ctaY: LH - 92,
        cw: LW, ch: LH
      };
    }

    var gyM = top + thumbW + THUMB_GAP + bezel;
    return {
      cell: cell, trayCell: Math.max(12, Math.round(cell * 0.50)),
      thumbCell: thumbCell, thumbW: thumbW,
      bezel: bezel, sill: sill, housingW: housingW, housingH: housingH,
      gx: Math.round((LW - housingW) / 2 + bezel), gy: gyM,
      tgx: Math.round((LW - thumbW) / 2), tgy: top,
      trayX: PAD, trayW: LW - PAD * 2,
      trayY: gyM + gridPx + bezel + sill + 16,
      colX: 0, colW: LW,
      noteY: LH - 92, ctaY: LH - 100,
      cw: LW, ch: LH
    };
  }

  function fits(cell, n) {
    var m = measure(cell, n);
    var widthCap = MODE === 'desktop' ? m.colX : LW;
    if (m.housingW + PAD * 2 > widthCap) return false;
    if (m.gy - m.bezel < topBand()) return false;
    if (m.gy - m.bezel + m.housingH > LH - botBand()) return false;
    var saved = view; view = m;
    var bottom = layoutTray();
    view = saved;
    /* On desktop the tray lives in its own column and only has to clear the
       note. Not the CTA: the CTA appears when the level is won, and a won
       level has every pane on the window, so the tray is empty by then. */
    return bottom <= (MODE === 'desktop' ? m.noteY - 18 : LH - botBand());
  }

  function apply(cell, n) {
    var m = measure(cell, n);
    for (var k in m) view[k] = m[k];
    layoutTray();
  }

  /* Tray panes are laid out left to right, wrapping. Each keeps its own slot
     so picking one up and putting it back does not reshuffle the row. */
  function layoutTray() {
    var x = view.trayX, y = view.trayY, rowH = 0, tc = view.trayCell;
    var bottom = y;
    var right = view.trayX + view.trayW;
    panes.forEach(function (p) {
      var e = S.extent(S.rotate(p.shape, p.rot));
      var w = e.w * tc, h = e.h * tc;
      if (x + w > right && x > view.trayX) { x = view.trayX; y += rowH + 10; rowH = 0; }
      p.tx = x; p.ty = y; p.tw = w; p.th = h;
      x += w + 12;
      if (h > rowH) rowH = h;
      if (y + h > bottom) bottom = y + h;
    });
    return bottom;
  }

  // ---------- drawing ----------
  function cellRect(r, c) {
    return { x: view.gx + c * view.cell, y: view.gy + r * view.cell, s: view.cell };
  }

  function draw() {
    /* CLEAR, never fill. The card behind the canvas is .game-wrap's radial
       gradient from chrome.css; painting an opaque rectangle over it is what
       made the game look like a blue square dropped on the page. */
    ctx.clearRect(0, 0, LW, LH);
    uiButtons.length = 0;

    var grid = showTarget ? Uint8Array.from(level.target)
                          : composite(drag && drag.preview ? drag.preview : null);

    view.button = R.lightbox(ctx, view.gx, view.gy, view.cell * level.size,
                             view.bezel, view.sill, lit, knob);

    if (lit) {
      /* NO PIPS ON THE WINDOW, deliberately. The goal and the tray are where a
         colour has to be DECODED; the window is where it is looked at. The
         goal already marks every cell that does not match yet, so nothing here
         needs reading to play, and 28 marks on a median board is a lot to put
         on the one surface the palette and the came were tuned for. */
      R.window(ctx, grid, level.size, view.gx, view.gy, view.cell, PALETTE, bloom);
    } else {
      R.unlit(ctx, level.size, view.gx, view.gy, view.cell,
              placed().concat(drag && drag.preview ? [drag.preview] : []),
              PALETTE, S.rotate);
    }

    drawTarget();

    // tray: loose chips of glass waiting to be leaded in
    panes.forEach(function (p) {
      if (p.r !== null) return;
      if (drag && drag.pane === p) return;
      R.chip(ctx, S.rotate(p.shape, p.rot), p.tx, p.ty, view.trayCell, PALETTE[p.colour], 1, true);
      pipChip(S.rotate(p.shape, p.rot), p.tx, p.ty, view.trayCell, p.colour);
    });

    if (phase === 'menu') { menuOverlay(); return; }
    if (finished) { drawEnd(); return; }
    drawControls();
    drawNote();

    // the pane under the finger, held above the window and casting onto it
    if (drag) {
      var tc = drag.fromTray ? view.trayCell : view.cell;
      R.chip(ctx, S.rotate(drag.pane.shape, drag.pane.rot),
             drag.x - drag.offX, drag.y - drag.offY,
             drag.overGrid ? view.cell : tc,
             PALETTE[drag.pane.colour], drag.overGrid ? 0.42 : 0.9, true);
      if (!drag.overGrid) {
        pipChip(S.rotate(drag.pane.shape, drag.pane.rot),
                drag.x - drag.offX, drag.y - drag.offY, tc, drag.pane.colour);
      }
    }
  }

  /* The target, always visible, with the cells you have not matched yet left
     plain and the ones you have marked with a small tick of came. Showing the
     match state costs no difficulty — you still have to work out which panes
     make the colour — and it removes the tedium of hunting for the one cell
     that is wrong. */
  function drawTarget() {
    var tctx = ctx, n = level.size, tc = view.thumbCell;
    var cur = composite(drag && drag.preview ? drag.preview : null);
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        var i = r * n + c, x = view.tgx + c * tc, y = view.tgy + r * tc, t = level.target[i];
        if (isMix(t)) {
          tctx.fillStyle = PALETTE[t];
          tctx.fillRect(x, y, tc, tc);
          drawPips(x, y, tc, t);
          if (!cellOk(cur[i], t)) {
            tctx.fillStyle = 'rgba(18,14,10,0.34)';
            tctx.beginPath();
            tctx.arc(x + tc/2, y + tc/2, Math.max(1.2, tc*0.17), 0, Math.PI*2);
            tctx.fill();
          }
        } else {
          tctx.fillStyle = '#39414F';
          tctx.fillRect(x, y, tc, tc);
        }
      }
    }
    tctx.strokeStyle = 'rgba(20,16,12,0.55)';
    tctx.lineWidth = 1;
    for (var k = 0; k <= n; k++) {
      tctx.beginPath(); tctx.moveTo(view.tgx + k*tc, view.tgy); tctx.lineTo(view.tgx + k*tc, view.tgy + tc*n); tctx.stroke();
      tctx.beginPath(); tctx.moveTo(view.tgx, view.tgy + k*tc); tctx.lineTo(view.tgx + tc*n, view.tgy + k*tc); tctx.stroke();
    }
  }

  /* The canvas is scaled to fit its card, so client pixels are not logical
     pixels. Converted once, here. */
  function local(ev) {
    var b = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - b.left) * (LW / (b.width || LW)),
      y: (ev.clientY - b.top)  * (LH / (b.height || LH))
    };
  }

  function paneAtPoint(pt) {
    // placed panes first, last drawn wins
    for (var i = panes.length - 1; i >= 0; i--) {
      var p = panes[i];
      if (p.r === null) continue;
      var cells = S.rotate(p.shape, p.rot);
      for (var k = 0; k < cells.length; k++) {
        var q = cellRect(p.r + cells[k][0], p.c + cells[k][1]);
        if (pt.x >= q.x && pt.x < q.x + q.s && pt.y >= q.y && pt.y < q.y + q.s) return { pane: p, fromTray: false };
      }
    }
    for (var j = 0; j < panes.length; j++) {
      var t = panes[j];
      if (t.r !== null) continue;
      if (pt.x >= t.tx && pt.x < t.tx + t.tw && pt.y >= t.ty && pt.y < t.ty + t.th) {
        var cs = S.rotate(t.shape, t.rot);
        for (var m = 0; m < cs.length; m++) {
          var cx = t.tx + cs[m][1] * view.trayCell, cy = t.ty + cs[m][0] * view.trayCell;
          if (pt.x >= cx && pt.x < cx + view.trayCell && pt.y >= cy && pt.y < cy + view.trayCell) {
            return { pane: t, fromTray: true };
          }
        }
      }
    }
    return null;
  }

  /* HOLD TO LIGHT. Deliberate rather than continuous: you assemble in the
     dark and hold the window up when you want to know. Free and unlimited, so
     nothing about it is punishing — it only stops the blend being a gradient
     you can walk up without thinking. */
  function light(on) {
    if (offTimer) { clearTimeout(offTimer); offTimer = null; }
    if (lit !== on) {
      lit = on;
      snd.light();
      if (on) { checkWin(); if (won && !blooming) startBloom(); }
      animateKnob();
      chrome();
    }
    draw();
  }

  function releaseLight() {
    /* A solved window holds its light. Letting it fall was what made the glass
       glow with the switch off: the drawing used to fall back on `won`, so the
       two could disagree. Undoing out of a win releases it again. */
    if (finished || won) return;
    if (offTimer) clearTimeout(offTimer);
    offTimer = setTimeout(function () { offTimer = null; light(false); }, HOLD_AFTER_RELEASE);
  }

  /* The target is re-read every frame instead of captured at the start. It
     used to be captured, so a level change mid-slide let the finished
     animation write the OLD target back over the reset: the switch settled
     showing ON while the new level's window sat dark. 170ms is a narrow window
     but changing level is exactly the thing you do right after lighting one. */
  function animateKnob() {
    knobTo = lit ? 1 : 0;
    if (knobAnim) return;                   // the running loop picks up the new target
    knobAnim = true;
    var t0 = now(), from = knob, to = knobTo;
    (function step() {
      if (to !== knobTo) { from = knob; to = knobTo; t0 = now(); }
      var k = Math.min(1, (now() - t0) / 170);
      knob = from + (to - from) * (k * k * (3 - 2 * k));
      draw();
      if (k < 1) requestAnimationFrame(step);
      else { knob = to; knobAnim = false; draw(); }
    })();
  }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  function onButton(pt) {
    var b = view.button;
    if (!b) return false;
    var pad = 10;                       // generous: it is the one control here
    return Math.abs(pt.x - b.bx) <= b.bw / 2 + pad &&
           Math.abs(pt.y - b.by) <= b.bh / 2 + pad;
  }

  canvas.addEventListener('pointerdown', function (ev) {
    snd.ready();                       // autoplay policy: first user gesture
    var pt = local(ev);
    for (var u = uiButtons.length - 1; u >= 0; u--) {
      var ub = uiButtons[u];
      if (pt.x >= ub.x && pt.x <= ub.x + ub.w && pt.y >= ub.y && pt.y <= ub.y + ub.h) {
        ub.act(); draw(); ev.preventDefault(); return;
      }
    }
    if (phase === 'menu') { ev.preventDefault(); return; }  // only the card is live
    if (finished) { ev.preventDefault(); return; }   // only the end screen is live
    if (onButton(pt)) {
      canvas.setPointerCapture(ev.pointerId);
      pressing = true; light(true);
      ev.preventDefault();
      return;
    }
    var hit = paneAtPoint(pt);
    if (!hit) return;
    canvas.setPointerCapture(ev.pointerId);
    var p = hit.pane;
    var originX, originY, cell;
    if (hit.fromTray) { originX = p.tx; originY = p.ty; cell = view.trayCell; }
    else { var q = cellRect(p.r, p.c); originX = q.x; originY = q.y; cell = view.cell; }
    drag = {
      pane: p, fromTray: hit.fromTray,
      offX: pt.x - originX, offY: pt.y - originY,
      x: pt.x, y: pt.y, startX: pt.x, startY: pt.y,
      moved: false, overGrid: false, preview: null,
      wasR: p.r, wasC: p.c
    };
    if (!hit.fromTray) { pushHistory(); p.r = null; p.c = null; snd.lift(); }
    update(pt);
    ev.preventDefault();
  });

  canvas.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    var pt = local(ev);
    if (Math.abs(pt.x - drag.startX) > 5 || Math.abs(pt.y - drag.startY) > 5) drag.moved = true;
    update(pt);
    ev.preventDefault();
  });

  function update(pt) {
    drag.x = pt.x; drag.y = pt.y;
    // where would the pane's origin land, in grid cells?
    var ox = pt.x - drag.offX, oy = pt.y - drag.offY;
    var c = Math.round((ox - view.gx) / view.cell);
    var r = Math.round((oy - view.gy) / view.cell);
    var cells = S.cover(drag.pane.shape, drag.pane.rot, r, c, level.size);
    if (cells) {
      drag.overGrid = true;
      drag.dropR = r; drag.dropC = c;
      drag.preview = { shape: drag.pane.shape, colour: drag.pane.colour, r: r, c: c, rot: drag.pane.rot };
    } else {
      drag.overGrid = false; drag.preview = null;
    }
    draw();
  }

  function endDrag() {
    if (pressing) { pressing = false; releaseLight(); return; }
    if (!drag) return;
    var p = drag.pane;
    if (!drag.moved) {
      // a tap rotates, whether the pane is on the window or in the tray
      if (!drag.fromTray) { p.r = drag.wasR; p.c = drag.wasC; }
      else pushHistory();
      var next = (p.rot + 1) % 4;
      if (p.r !== null) {
        var ok = S.cover(p.shape, next, p.r, p.c, level.size);
        if (ok) { p.rot = next; snd.turn(); }
      } else { p.rot = next; snd.turn(); }
    } else if (drag.overGrid) {
      if (drag.fromTray) pushHistory();
      p.r = drag.dropR; p.c = drag.dropC;
      snd.place();
    } else {
      if (!drag.fromTray) { /* dragged off the window: it returns to the tray */ }
      if (!drag.fromTray) snd.lift();
      p.r = null; p.c = null;
    }
    drag = null;
    layout();                 // a pane back in the tray can change its height
    checkWin();
    draw(); chrome();
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // ---------- controls, drawn into the canvas ----------
  /* shared/ui.js, not HTML buttons: PILL for the control row and one CTA for
     the single primary action, at the sizes the house sets and never scaled
     per game. On a phone the row stays at the BOTTOM. */
  // Flat vector speaker, same shape the rest of the fleet draws.
  function speakerGlyph(cx, cy, on) {
    ctx.save();
    ctx.fillStyle = on ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.45)';
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - 3); ctx.lineTo(cx - 3, cy - 3); ctx.lineTo(cx + 1, cy - 7);
    ctx.lineTo(cx + 1, cy + 7); ctx.lineTo(cx - 3, cy + 3); ctx.lineTo(cx - 7, cy + 3);
    ctx.closePath(); ctx.fill();
    if (on) {
      ctx.beginPath(); ctx.arc(cx + 2, cy, 4.5, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 2, cy, 7.5, -0.9, 0.9); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx + 4, cy - 4); ctx.lineTo(cx + 10, cy + 4);
      ctx.moveTo(cx + 10, cy - 4); ctx.lineTo(cx + 4, cy + 4);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawControls() {
    var gap = UI.PILL.gap;
    var wU = UI.pillWidth(ctx, 'Undo'), wR = UI.pillWidth(ctx, 'Restart');
    var wH = UI.pillWidth(ctx, 'Rules');
    var wS = UI.PILL.iconW;
    var total = wS + wU + wR + wH + gap * 3;
    var cy = MODE === 'mobile' ? LH - 40 : Math.round(topBand() / 2);
    var x = MODE === 'mobile' ? Math.round(LW / 2 - total / 2) : SIDE_PAD;

    // Mute first, at PILL.iconW, the same place and size the rest of the fleet
    // puts it, so silence is found in one habit rather than fifteen.
    var sb = UI.drawPill(ctx, '', x + wS / 2, cy, { w: wS });
    speakerGlyph(x + wS / 2, cy, snd.on());
    uiButtons.push(Object.assign(sb, { act: function () { snd.ready(); snd.toggle(); } }));
    x += wS + gap;
    uiButtons.push(Object.assign(
      UI.drawPill(ctx, 'Undo', x + wU / 2, cy, { w: wU, dim: !history.length }),
      { act: undo }));
    x += wU + gap;
    uiButtons.push(Object.assign(
      UI.drawPill(ctx, 'Restart', x + wR / 2, cy, { w: wR }),
      { act: function () { T().levelRestart(idx + 1); load(idx); } }));
    x += wR + gap;
    uiButtons.push(Object.assign(
      UI.drawPill(ctx, 'Rules', x + wH / 2, cy, { w: wH }),
      { act: openMenu }));

    if (won && lit && idx < LEVELS.length - 1) {
      var cx = MODE === 'desktop' ? view.colX + view.colW / 2 : LW / 2;
      uiButtons.push(Object.assign(
        UI.drawCTA(ctx, 'Next', cx, view.ctaY, ACCENT),
        { act: function () { load(idx + 1); } }));
    }
  }

  /* ---------- the rules card ----------
     The house pattern from prism and wire: a card drawn into the canvas, a
     numbered list, one CTA, reopenable from the Rules pill.

     ONLY THREE RULES, where prism carries six. The demo above them does the
     work two bullets would have done badly - the mixing, and the fact that the
     goal hides everything except the overlaps - and prism's own comment warns
     that a card which outgrows the frame is not clipped, it is quietly drawn
     UNDER the button. Measure before adding a line here. */
  var MENU_SUB = 'Stack coloured glass so the light makes the right colours.';
  var MENU_RULES = [
    'Drag glass onto the window. Tap a placed pane to turn it.',
    'Flick the switch to light the window and see what you have made.',
    'Match every overlap the goal shows. The rest of the window is yours.'
  ];

  var DEMO_MS = 5200;
  /* One loop of the demo, in milliseconds. The last stage is the point of the
     whole thing: the same board redrawn as the GOAL sees it, everything gone
     except the overlap. */
  var DEMO_STAGES = [
    { at: 0,    say: 'two panes of coloured glass' },
    { at: 900,  say: 'slide them together' },
    { at: 2450, say: 'where they overlap, red and yellow make orange' },
    { at: 3500, say: 'the goal shows you the overlap and nothing else' }
  ];

  /* THE CARD'S TYPE SCALE — 2026-08-20. The card measured its copy, then
     clamped its own height with a Math.min and drew the copy anyway, so in any
     short frame the Resume button, which hangs off the card's BOTTOM edge, came
     up to meet text that was still flowing down. Measured 134px of overlap at
     812x375, which is a phone turned sideways, and 29px at 640x480.

     menuMetrics() now shrinks this until the content genuinely fits, so the
     Math.min below it never has anything left to truncate. Everything vertical
     in the card reads MS: the demo, the caption, the type and the steps. The
     CTA height is NOT scaled — house size, and a touch target. */
  var MS = 1, DS = 1;    // MS scales the copy, DS scales the demo, 0 drops it
  function demoCell() { return Math.round((MODE === 'mobile' ? 28 : 34) * MS * DS); }
  var CAP_LH = 21;
  function capLH() { return CAP_LH * MS; }
  /* The caption WRAPS, and the block is sized to the LONGEST caption of the
     four stages, not the current one. Sized to the current caption the layout
     would jump every time the stage changed; unwrapped, the longest line ran
     off the card and off the canvas on a phone. */
  function demoCapLines(pw) {
    var maxW = pw - 60, most = 1;
    ctx.save();
    ctx.font = '700 ' + (16 * MS).toFixed(2) + 'px Inter, sans-serif';
    for (var i = 0; i < DEMO_STAGES.length; i++) {
      var n = wrapText(DEMO_STAGES[i].say, 0, 0, maxW, capLH(), 'center', true) / capLH();
      if (n > most) most = n;
    }
    ctx.restore();
    return most;
  }
  function demoHeight(pw) {
    if (DS === 0) return 0;
    return demoCell() * 2 + 14 * MS + demoCapLines(pw) * capLH() + 18 * MS;
  }

  function demoSay(ms) {
    var s = DEMO_STAGES[0];
    for (var i = 0; i < DEMO_STAGES.length; i++) if (ms >= DEMO_STAGES[i].at) s = DEMO_STAGES[i];
    return s.say;
  }

  function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }

  /* The mini window. Panes are drawn as rectangles at FRACTIONAL positions and
     the overlap is their geometric intersection, so the orange appears
     progressively as they slide rather than snapping on at the end. That is
     the whole point: you watch the colour arrive. */
  function drawDemo(cx, top, ms, cardW) {
    var cols = 5, rows = 2;
    var cell = demoCell();
    var gw = cols * cell, gh = rows * cell;
    var gx = Math.round(cx - gw / 2), gy = Math.round(top);
    var goal = ms >= 3500;

    /* Both panes are on the grid from the first frame, at opposite ends, and
       slide to meet in the middle. They used to fly in from off-canvas, which
       left the opening caption describing an empty box. */
    var slideA = ease((ms - 900) / 1000);         // red, col 0 -> col 1
    var slideB = ease((ms - 1100) / 1000);        // yellow, col 3 -> col 2
    var rx = gx + (0 + 1 * slideA) * cell;
    var yx = gx + (3 - 1 * slideB) * cell;
    var paneW = 2 * cell;
    var ox = Math.max(rx, yx), ow = Math.min(rx + paneW, yx + paneW) - ox;

    ctx.save();
    ctx.beginPath(); ctx.rect(gx, gy, gw, gh); ctx.clip();

    if (goal) {
      // exactly how the real goal renders: shown cells in colour, the rest flat
      ctx.fillStyle = '#39414F';
      ctx.fillRect(gx, gy, gw, gh);
      if (ow > 0) { ctx.fillStyle = PALETTE[3]; ctx.fillRect(ox, gy, ow, gh); }
    } else {
      ctx.fillStyle = '#0D1220';
      ctx.fillRect(gx, gy, gw, gh);
      ctx.fillStyle = PALETTE[1]; ctx.fillRect(rx, gy, paneW, gh);
      ctx.fillStyle = PALETTE[2]; ctx.fillRect(yx, gy, paneW, gh);
      if (ow > 0) { ctx.fillStyle = PALETTE[3]; ctx.fillRect(ox, gy, ow, gh); }
    }
    ctx.restore();

    /* The demo is where the mode teaches its own legend. With pips on you watch
       one mark slide toward another and become two where they meet, which is
       the whole notation in one loop. Coverage is judged at the cell CENTRE so
       a mid-slide pane does not put a mark on a cell it barely touches. */
    if (pips) {
      for (var dc = 0; dc < cols; dc++) {
        var mid = gx + (dc + 0.5) * cell;
        var vv = (mid >= rx && mid < rx + paneW ? 1 : 0) | (mid >= yx && mid < yx + paneW ? 2 : 0);
        if (!vv) continue;
        if (goal && !isMix(vv)) continue;        // the goal shows overlaps only
        for (var dr = 0; dr < rows; dr++) drawPips(gx + dc * cell, gy + dr * cell, cell, vv);
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    for (var k = 0; k <= cols; k++) {
      ctx.beginPath(); ctx.moveTo(gx + k * cell + 0.5, gy); ctx.lineTo(gx + k * cell + 0.5, gy + gh); ctx.stroke();
    }
    for (var j = 0; j <= rows; j++) {
      ctx.beginPath(); ctx.moveTo(gx, gy + j * cell + 0.5); ctx.lineTo(gx + gw, gy + j * cell + 0.5); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1);

    ctx.fillStyle = goal ? '#FFFFFF' : 'rgba(255,255,255,0.78)';
    ctx.font = (goal ? '700 ' : '500 ') + (16 * MS).toFixed(2) + 'px Inter, sans-serif';
    wrapText(demoSay(ms), cx, gy + gh + 14 * MS, cardW - 60, capLH(), 'center');

    return demoHeight(cardW);
  }

  function menuMetricsAt(ts, ds) {
    MS = ts; DS = ds;
    var pw = Math.max(260, Math.min(LW - 44, 470));
    var demoH = demoHeight(pw);
    var h = 28 * ts + (MODE === 'mobile' ? 38 : 44) * ts;   // top pad + title
    ctx.font = '600 ' + (16 * ts).toFixed(2) + 'px Inter, sans-serif';
    h = wrapText(MENU_SUB, 0, h, pw - 70, 22 * ts, 'center', true) + 14 * ts;
    h += demoH;
    ctx.font = '500 ' + (16 * ts).toFixed(2) + 'px Inter, sans-serif';
    for (var i = 0; i < MENU_RULES.length; i++) {
      h = wrapText(MENU_RULES[i], 0, h, pw - 96, 22 * ts, 'left', true) + 12 * ts;
    }
    return { pw: pw, ph: h + 18 * ts + UI.PILL.h + 12 * ts + UI.CTA.h + 30 * ts, demoH: demoH, ts: ts };
  }

  /* Shrink until it fits rather than clamp and overflow. The floor is
     deliberate: under 0.72 the rules stop being readable and a clipped rule is
     the better failure, so it stops trying. Horizontal geometry is untouched,
     so a smaller face wraps to FEWER lines, which is the direction that helps. */
  function menuMetrics() {
    var maxH = LH - 24;
    /* The DEMO goes first, and only then the copy. Kaleido's order, and for
       the same reason: a smaller demo still shows one pane meeting another,
       while copy shrunk to nothing shows nothing. It is dropped outright
       rather than kept at a size where it cannot be read. The colourblind
       switch added a pill's worth of height here, which is what put the very
       short frames back over the line and made this two-stage search
       necessary rather than optional. */
    var ds = 1, m = menuMetricsAt(1, 1);
    while (ds > 0 && m.ph > maxH) { ds = ds > 0.55 ? ds - 0.08 : 0; m = menuMetricsAt(1, ds); }
    var ts = 1;
    while (ts > 0.72 && m.ph > maxH) { ts = Math.max(0.72, ts - 0.04); m = menuMetricsAt(ts, ds); }
    m.ph = Math.min(maxH, m.ph);
    MS = m.ts; DS = ds;
    m.ds = ds;
    return m;
  }

  function menuOverlay() {
    var m = menuMetrics();
    var px = Math.round((LW - m.pw) / 2), py = Math.round((LH - m.ph) / 2);

    ctx.fillStyle = 'rgba(9,15,26,0.92)';
    ctx.fillRect(0, 0, LW, LH);
    ctx.fillStyle = '#16233A';
    R.roundRect(ctx, px, py, m.pw, m.ph, 24); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    R.roundRect(ctx, px, py, m.pw, m.ph, 24); ctx.stroke();

    /* the wheel this game mixes on, as a hairline: red to orange to yellow to
       green to blue to purple, which is rule 2 without a sentence */
    var g = ctx.createLinearGradient(px + 40, 0, px + m.pw - 40, 0);
    g.addColorStop(0,    'rgba(193,58,50,0)');
    g.addColorStop(0.15, PALETTE[1]); g.addColorStop(0.32, PALETTE[3]);
    g.addColorStop(0.48, PALETTE[2]); g.addColorStop(0.64, PALETTE[6]);
    g.addColorStop(0.80, PALETTE[4]); g.addColorStop(0.92, PALETTE[5]);
    g.addColorStop(1,    'rgba(142,62,174,0)');
    ctx.fillStyle = g; ctx.fillRect(px + 40, py + 1, m.pw - 80, 2);

    var ts = m.ts;
    var cx = LW / 2, y = py + 28 * ts;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 ' + ((MODE === 'mobile' ? 30 : 36) * ts).toFixed(2) + 'px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('STAINED', cx, y);
    y += (MODE === 'mobile' ? 38 : 44) * ts;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.font = '600 ' + (16 * ts).toFixed(2) + 'px Inter, sans-serif';
    y = wrapText(MENU_SUB, cx, y, m.pw - 70, 22 * ts) + 14 * ts;

    if (m.ds > 0) {
      var ms = demoClock !== null ? demoClock : ((now() - menuT0) % DEMO_MS);
      y += drawDemo(cx, y, ms, m.pw);
    }

    var rx2 = px + 30, dotR = 11 * ts;
    for (var i = 0; i < MENU_RULES.length; i++) {
      ctx.fillStyle = ACCENT;
      ctx.beginPath(); ctx.arc(rx2 + 11, y + dotR, dotR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 ' + (13 * ts).toFixed(2) + 'px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), rx2 + 11, y + dotR + 1);
      ctx.fillStyle = 'rgba(255,255,255,0.90)';
      ctx.font = '500 ' + (16 * ts).toFixed(2) + 'px Inter, sans-serif';
      y = wrapText(MENU_RULES[i], rx2 + 34, y, m.pw - 96, 22 * ts, 'left') + 12 * ts;
    }

    /* Recorded so the fit can be ASSERTED, not eyeballed. A card that outgrows
       its own measurement is not clipped, it draws the last rules underneath
       the button, which looks like a layout choice rather than a bug. */
    menuContentBottom = y;

    /* The switch lives HERE, on the rules card, for the same reason Kaleido's
       does: it is the surface a player opens to find out how the game works,
       and the play controls have no room left on a narrow screen. A mode
       reachable only from a console is not reachable. */
    var swLabel = 'Colourblind mode';
    var swW = UI.pillWidth(ctx, swLabel);
    var sw = UI.drawPill(ctx, swLabel, cx,
                         py + m.ph - 30 * ts - UI.CTA.h - 12 * ts - UI.PILL.h / 2,
                         { w: swW, dim: !pips });
    if (pips) {
      ctx.save();
      ctx.strokeStyle = ACCENT_MARK; ctx.lineWidth = 2;
      R.roundRect(ctx, sw.x, sw.y, sw.w, sw.h, sw.h / 2); ctx.stroke();
      ctx.restore();
    }
    uiButtons.push(Object.assign(sw, { act: function () {
      pips = !pips; savePips(); draw();
    } }));

    menuCtaTop = sw.y;
    uiButtons.push(Object.assign(
      UI.drawCTA(ctx, (idx > 0 || history.length) ? 'Resume' : 'Play', cx,
                 py + m.ph - 30 * ts - UI.CTA.h / 2, ACCENT),
      { act: closeMenu }));
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  function wrapText(text, x, y, maxW, lh, align, measure) {
    var words = String(text).split(' '), line = '';
    if (!measure) { ctx.textAlign = align || 'center'; ctx.textBaseline = 'top'; }
    for (var i = 0; i < words.length; i++) {
      var tt = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(tt).width > maxW && line) {
        if (!measure) ctx.fillText(line, x, y);
        y += lh; line = words[i];
      } else line = tt;
    }
    if (line) { if (!measure) ctx.fillText(line, x, y); y += lh; }
    return y;
  }

  function openMenu() {
    phase = 'menu'; menuT0 = now();
    if (!menuAnim) {
      menuAnim = true;
      (function step() {
        if (phase !== 'menu') { menuAnim = false; return; }
        draw();
        requestAnimationFrame(step);
      })();
    }
    draw();
  }
  function closeMenu() { phase = 'play'; T().gameStart(); draw(); }

  /* ---------- the end screen ----------
     The scrim has the finished window punched out of it, so everything else
     dims and the thing the player just built stays at full brightness. A flat
     overlay hid it, which threw away the only reward the game has to give.

     The copy sits wherever the frame has room: the right-hand column on
     desktop, the empty tray space below the window on a phone. If a short
     phone leaves less than the block needs, it falls back to a plain centred
     overlay rather than running off the bottom. */
  function endBlock() {
    var need = 178;                                  // title + line + CTA + pill
    if (MODE === 'desktop') {
      /* Not the tray column: the space to the RIGHT OF THE WINDOW, which is
         wider than the column because the window is centred in the left half.
         236px could not hold the headline; this gives about 250. */
      var right = view.gx - view.bezel + view.housingW;
      return { cx: right + (LW - right) / 2, avail: LW - right - 24,
               cy: LH / 2, punch: true };
    }
    var below = LH - (view.gy - view.bezel + view.housingH);
    if (below >= need + 16) {
      return { cx: LW / 2, avail: LW - 32, cy: LH - below / 2, punch: true };
    }
    return { cx: LW / 2, avail: LW - 32, cy: LH / 2, punch: false };  // short phone: cover it all
  }

  function drawEnd() {
    var b = endBlock();

    /* Scrim alpha is set from the worst case that can sit under this text: the
       page gradient at #131F36. White type measures 15.9:1 on it at 0.78, so
       the copy holds with room to spare. */
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, LW, LH);
    if (b.punch) {
      /* Inlined, NOT R.roundRect: that helper opens with beginPath(), which
         discards the outer rectangle and inverts the whole effect. */
      var x = view.gx - view.bezel, y = view.gy - view.bezel;
      var w = view.housingW, h = view.housingH;
      var rr = Math.min(view.bezel * 1.15, 18);
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }
    ctx.fillStyle = 'rgba(14,23,38,0.78)';           // --bg, from tokens.css
    ctx.fill('evenodd');
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    /* Stepped down until it fits rather than trusted to fit: the first pass put
       a 30px headline in a 236px column and clipped it off the canvas. */
    var title = 'every window lit', ts = MODE === 'mobile' ? 28 : 32;
    while (ts > 18) {
      ctx.font = '800 ' + ts + 'px Inter, sans-serif';
      if (ctx.measureText(title).width <= b.avail) break;
      ts -= 2;
    }
    ctx.fillText(title, b.cx, b.cy - 66);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '500 17px Inter, sans-serif';
    ctx.fillText('that is all ' + LEVELS.length + ' of them', b.cx, b.cy - 36);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.restore();

    uiButtons.push(Object.assign(
      UI.drawCTA(ctx, 'Play again', b.cx, b.cy + 10, ACCENT),
      { act: function () { load(0); } }));
    uiButtons.push(Object.assign(
      UI.drawPill(ctx, 'Back to all games', b.cx, b.cy + 72,
                  { w: UI.pillWidth(ctx, 'Back to all games') }),
      { act: function () { location.href = '/'; } }));
  }

  function drawNote() {
    if (won && lit && idx < LEVELS.length - 1) return;    // the CTA speaks instead
    var left = panes.filter(function (p) { return p.r === null; }).length;
    var comp = composite(null), wrong = 0;
    for (var i = 0; i < level.target.length; i++) if (!cellOk(comp[i], level.target[i])) wrong++;
    var msg = won && lit ? 'the window is complete'
      : left ? (left + ' pane' + (left === 1 ? '' : 's') + ' still on the bench')
      : lit ? (wrong + ' overlap' + (wrong === 1 ? '' : 's') + ' still wrong')
      : 'flick the switch to see';
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '600 16px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    /* Centred on the column, but clamped inside the canvas: the column is
       236px and a long line overruns it. Copy is kept short as well; this is
       the belt so no future wording clips silently. */
    var half = ctx.measureText(msg).width / 2;
    var nx = MODE === 'desktop' ? view.colX + view.colW / 2 : LW / 2;
    nx = Math.min(Math.max(nx, half + 8), LW - half - 8);
    ctx.fillText(msg, nx, view.noteY);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.restore();
  }

  function undo() {
    if (!history.length) return;
    var prev = history.pop();
    panes.forEach(function (p, i) { p.r = prev[i].r; p.c = prev[i].c; p.rot = prev[i].rot; });
    snd.undo();
    layout(); checkWin(); draw();
  }
  function chrome() { /* everything is drawn into the canvas */ }


  setCanvasVars(); resizeCanvas(); fitFullscreen(); resizeCanvas();
  /* ?level=N (1-based) opens that level directly. Out-of-range falls back to
     the first rather than to a blank screen. */
  T().init('stained');
  var want = parseInt((location.search.match(/[?&]level=(\d+)/) || [])[1], 10);
  load(isFinite(want) && want >= 1 && want <= LEVELS.length ? want - 1 : loadLevel());
  openMenu();

  // debug handle
  window.__stained = {
    get level() { return level; },
    get panes() { return panes; },
    S: S,
    goto: load,
    place: function (i, r, c, rot) {
      var p = panes[i]; if (!p) return false;
      if (!S.cover(p.shape, rot || 0, r, c, level.size)) return false;
      pushHistory(); p.r = r; p.c = c; p.rot = rot || 0;
      layout(); checkWin(); draw(); chrome(); return true;
    },
    composite: function () { return Array.from(composite(null)); },
    ascii: function () { return S.ascii(composite(null), level.size); },
    targetAscii: function () { return S.ascii(Uint8Array.from(level.target), level.size); },
    get won() { return won; },
    get view() { return view; },
    get lit() { return lit; },
    get saved() { return loadLevel() + 1; },
    get phase() { return phase; },
    openMenu: openMenu, closeMenu: closeMenu,
    /* the in-app preview pauses rAF, so the demo is verified by freezing it at
       a given millisecond rather than by watching it run */
    demoAt: function (ms) { demoClock = ms; draw(); },
    demoLive: function () { demoClock = null; draw(); },
    menuFit: function () {
      var was = phase; phase = 'menu'; draw(); phase = was;
      var m = menuMetrics();
      return { cardH: m.ph, frameH: LH, clamped: m.ph >= LH - 24,
               contentBottom: Math.round(menuContentBottom),
               ctaTop: Math.round(menuCtaTop),
               textUnderButton: menuContentBottom > menuCtaTop,
               // Q1. Every other fit detector on the site exposes `fits`, and this
               // one did not, so a fleet sweep asserting on it read `undefined` as
               // a failure and reported this card broken at all four sizes when it
               // was fine. The number that matters here is textUnderButton; `fits`
               // is its inverse, added so one assertion works across all ten.
               fits: !(menuContentBottom > menuCtaTop) };
    }
  };
})();
