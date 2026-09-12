/* ============================================================
   Karrots · A Zamborin Game

   Slide the bricks to open a path for the bunny. The fox lives in the same
   holes you are opening, and the moment your gap touches his, he comes
   through it.

   The rules are in model.js and the board drawing is in render.js. This file
   is the loop: layout, input, animation, the HUD, the cards and the save.
   ============================================================ */
(() => {
  'use strict';

  const M = window.KarrotsModel, RD = window.KarrotsRender;
  const LEVELS = (window.KarrotsLevels || { LEVELS: [] }).LEVELS;

  /* ---------- MODE ----------
     A browser can report a 0-wide viewport on the first frame. The obvious
     `innerWidth < 768` then reads as a phone, MODE is locked for the session,
     and a desktop player is left on the phone layout for good. Zero means "not
     measured yet", so it must not count as narrow. */
  /* AND A NARROW FRAME IS NOT A PHONE IF IT IS LYING DOWN. The width test on
     its own gave the mobile chrome to a 480x360 embed, whose bands then ate
     160 of its 360 pixels. A real phone still answers here through the coarse
     pointer whichever way up it is; what changes is a short, wide frame with a
     mouse, which is what an embed is. */
  const PORTRAITISH = window.innerHeight >= window.innerWidth;
  const MODE = (matchMedia('(pointer: coarse)').matches ||
                (window.innerWidth > 0 && window.innerWidth < 768 && PORTRAITISH))
    ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);

  /* ---------- CANVAS ---------- */
  let LW, LH;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const gameWrap = canvas.parentElement;

  function setCanvasVars() {
    if (MODE === 'mobile') { LW = window.innerWidth; LH = window.innerHeight; }
    else { LW = 760; LH = 600; }
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

  /* ---------- AUDIO ----------
     Toy box, close miked, quiet. Muted must be SILENT, and the game has to be
     complete when it is: every piece of feedback here is also visual. */
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zam.karrots.sfx', gain: 3.4 }) : null;
  const SND = {
    on:      () => !!(sfx && sfx.isOn()),
    ready:   () => { if (sfx) sfx.ensureAudio(); },
    toggle:  () => { if (sfx) { sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.play('click'); } },
    snap:    () => { if (sfx) sfx.play('click'); },      // the stud click
    hop:     () => { if (sfx) sfx.play('step'); },
    refused: () => { if (sfx) sfx.play('thump'); },      // a low woody knock
    fox:     () => { if (sfx) sfx.play('capture'); },
    crunch:  () => { if (sfx) sfx.play('pop'); },
    win:     () => { if (sfx) sfx.play('win'); },
    undo:    () => { if (sfx) sfx.play('pop'); },
    explode: () => { if (sfx) sfx.play('explode'); },
  };

  const UI = window.ZAM_UI;
  const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){}, levelRestart(){}, hintUsed(){} };
  const T = () => (window.ZAM_TRACK || NOOP);
  T().init('karrots');

  /* ---------- TUNING ----------
     Starting points for the gate, not decisions. */
  const TUNE = {
    slideMs: 130, hopMs: 170, snapMs: 90,
    lungeMs: 460, holdMs: 420, rewindMs: 300,
    graceMs: 2400,         // his walk over, and the player's chance to undo it
    boomMs: 420,           // the blast, drawn over the squares it opened
    carrot2Mult: 1.35,
    dragStart: 5,          // px ALONG the slat's axis before it starts to follow
    commitFrac: 0.42,      // share of a cell a SLOW drag must cross to land
    /* A FLICK LANDS ON SPEED, NOT ON DISTANCE. Requiring 42% of a cell however
       fast the gesture was is what made this feel sticky: a quick flick of a
       fifth of a cell is unmistakably "send it", and the slat sprang back
       instead.

       The speed is in CELLS per ms, not pixels, because the cell is 77px on
       the desktop frame and 52px on a phone and a flick is the same gesture on
       both. Measured, a flick of about a quarter of a cell in 60ms runs at
       0.0030-0.0036 cells/ms and a deliberate drag at 0.0004-0.0005 - seven
       times apart, so the line sits well clear of both. */
    flickVel: 0.0018,      // cells per ms at release that count as a flick
    flickMin: 0.15,        // ...and the least of a cell the gesture must cross
    flickWin: 90,          // ms of gesture the speed is measured over
  };

  /* ---------- SPRITES ----------
     Rasterised once by the browser from the stripped SVGs in art/. Nothing
     waits on them: the board draws without a cast and repaints as they land. */
  const ART = {};
  /* Where the cast was painted this frame, for the overlap check. */
  const paintBox = { fox: null, bunny: null };
  const ART_NAMES = ['bunny-idle', 'bunny-down-1', 'bunny-down-2', 'bunny-down-3',
    'bunny-up-1', 'bunny-up-2', 'bunny-up-3', 'bunny-side-1', 'bunny-side-2',
    'bunny-side-3', 'fox-still', 'fox-walk-1', 'fox-walk-2', 'carrot', 'brick',
    'penguin-1', 'penguin-2', 'iceberg', 'cop', 'cone', 'shark', 'bomb'];
  ART_NAMES.forEach(n => {
    const im = new Image();
    im.onload = () => { ART[n] = im; };
    im.src = './art/' + n + '.svg?v=7';
  });
  /* HOW BIG EACH OF THEM IS DRAWN, and why it is not just a number.

     A sprite is fitted by HEIGHT, so its width follows its own aspect - and
     the fox's two walk frames are far wider than his standing one: stretched
     out mid-stride he came to 77.6px on a 77px cell and crossed 0.1px into the
     slat next door. Sub-pixel, but the rule is that the cast is never on a
     slat, and a rule with an exception is a rule nobody can check.

     So the height is capped by the WIDEST frame that character has: every
     frame of one animal is drawn at the same height (no pulsing between
     stride and stand) and none of them is wider than 0.94 of a cell. */
  /* EACH WORLD HAS ITS OWN PREDATOR, and they do not all walk. The fox has a
     stand and two strides; the penguin has two; the police car and the shark
     are one drawing each, so in those worlds the predator does not animate as
     it moves - it slides. Better than a stride that does not exist. */
  const PREDATOR = {
    fox:     { still: 'fox-still',  walk: ['fox-walk-1', 'fox-walk-2'] },
    penguin: { still: 'penguin-1',  walk: ['penguin-1', 'penguin-2'] },
    cop:     { still: 'cop',        walk: ['cop'] },
    shark:   { still: 'shark',      walk: ['shark'] },
  };
  const castOf = () => PREDATOR[worldOf(LEVELS[levelIndex]).predator] || PREDATOR.fox;

  const CAST_FRAMES = {
    fox:   ['fox-still', 'fox-walk-1', 'fox-walk-2'],
    penguin: ['penguin-1', 'penguin-2'],
    cop:   ['cop'],
    shark: ['shark'],
    bunny: ['bunny-idle', 'bunny-down-1', 'bunny-down-2', 'bunny-down-3',
            'bunny-up-1', 'bunny-up-2', 'bunny-up-3',
            'bunny-side-1', 'bunny-side-2', 'bunny-side-3'],
  };
  function castH(who, want) {
    let widest = 0;
    for (const n of CAST_FRAMES[who]) {
      const im = ART[n];
      if (im && im.naturalWidth) widest = Math.max(widest, im.naturalWidth / im.naturalHeight);
    }
    return widest ? Math.min(want, geo.cell * 0.94 / widest) : want;
  }

  const HOP_FRAMES = {
    up:    ['bunny-up-1', 'bunny-up-2', 'bunny-up-3'],
    down:  ['bunny-down-1', 'bunny-down-2', 'bunny-down-3'],
    left:  ['bunny-side-1', 'bunny-side-2', 'bunny-side-3'],
    right: ['bunny-side-1', 'bunny-side-2', 'bunny-side-3'],
  };

  /* Draw a sprite to fit a box, keeping its aspect and standing it on the
     floor of the cell rather than centring it, which is what makes a character
     look like it is IN the hole rather than floating over it. */
  /* Returns the box it painted, or null if the art has not landed yet. The box
     is what makes "nothing but a slat is ever drawn on a slat" a thing a test
     can ask about rather than a thing to squint at. The SVGs are cropped to
     their own ink by build-sprites.mjs, so the box IS the drawing. */
  function sprite(name, cx, footY, h, flip) {
    const im = ART[name]; if (!im || !im.naturalWidth) return null;
    const w = h * (im.naturalWidth / im.naturalHeight);
    ctx.save();
    if (flip) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }
    ctx.drawImage(im, cx - w / 2, footY - h, w, h);
    ctx.restore();
    return { x: cx - w / 2, y: footY - h, w: w, h: h };
  }

  /* ---------- GAME STATE ---------- */
  const SAVE_KEY = 'zam.karrots.save';

  /* A RECORD BELONGS TO A BOARD, NOT TO A POSITION IN THE LADDER. Records were
     keyed by level id, and every re-forge renumbers the ladder, so a player's
     carrots would silently land on boards they had never played. It cost
     nothing while the game was unreleased and became real the moment it
     shipped. The key is the board itself now: the same puzzle keeps its record
     wherever it ends up, a new puzzle simply has none, and the ladder can be
     re-cut as often as it likes.

     Cheap and stable rather than cryptographic - this only has to tell 96
     boards apart, and it has to give the same answer on every device. */
  function sigOf(lv) {
    const src = lv.rows.join('|') + '#' + (lv.bomb || '');
    let h = 5381;
    for (let i = 0; i < src.length; i++) h = (((h << 5) + h) ^ src.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  let levelIndex = 0;
  let st = null;                 // the live board
  let start = null;              // the level as it began, for Restart
  let par = 0;
  let moves = 0;
  let history = [];              // {state, moves} before each move, for Undo
  let best = {};                 // board signature -> {moves, carrots}
  let phase = 'play';            // play | caught | lost | won
  let anim = null;               // the one animation in flight
  let drag = null;
  let threat = null;              // he is on his way; the board is still live
  let flinch = null;              // who just refused to be squashed, and when
  /* Honoured, not decorated around: the edge redraws without the sweep, the
     catch is a cut and a hold, and a tile lands instead of easing. §10. */
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
  let rulesOpen = false, rulesScroll = 0;
  let boom = null;               // a bomb going off: decoration, it blocks nothing
  let levelsOpen = false, levelsWorld = 0, levelsScroll = 0, levelsHit = null;
  let wonPrev = null, wonBeat = false;   // the record before this run, and whether it fell
  const dbg = { downs: 0, captureFailed: 0, moves: 0, ups: 0, committed: 0, refused: 0 };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
      if (typeof raw.level === 'number') levelIndex = Math.min(Math.max(0, raw.level), LEVELS.length - 1);
      if (raw.best && typeof raw.best === 'object') best = raw.best;
      /* A save written before the key changed is keyed by level id, and those
         ids still name the boards they were earned on UNTIL the ladder moves,
         so this conversion is exact only while that is true. Run once, then
         stamped, so a later ladder cannot re-run it against the wrong boards. */
      if (raw.v !== 2) {
        const moved = {};
        LEVELS.forEach(lv => {
          const old = best[lv.id];
          if (old && typeof old === 'object') moved[sigOf(lv)] = old;
        });
        best = moved;
        save();
      }
    } catch (e) { /* a blocked or full store is not a reason to fail to start */ }
  }
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, level: levelIndex, best }));
    } catch (e) { /* see load() */ }
  }

  /* WHICH WORLD A LEVEL IS IN is a property of the level, not a constant. It
     was RD.WORLDS.woods in five places, which is fine for one world and wrong
     for four. */
  function worldOf(lv) { return (lv && RD.WORLDS[lv.world]) || RD.WORLDS.woods; }

  function loadLevel(i) {
    levelIndex = Math.min(Math.max(0, i), LEVELS.length - 1);
    const lv = LEVELS[levelIndex];
    start = M.parse(lv.rows, lv.id, lv.bomb ? { bombs: [lv.bomb] } : undefined);
    st = M.clone(start);
    par = lv.par; moves = 0; history = []; phase = 'play'; anim = null; drag = null; threat = null;
    wonPrev = null; wonBeat = false; boom = null;
    snapPaceHome(performance.now());   // drawn where the rules have them, from frame one
    T().levelStart && T().levelStart(levelIndex + 1);
    save();
  }

  /* ---------- GEOMETRY ----------
     One top band with the read-out in it, both modes. Controls sit left in
     that band on desktop and in a bottom row on a phone. The board is centred
     horizontally and vertically in the BAND-FREE area, never in the frame -
     except on desktop, where it holds the left and the ledger takes the right,
     because a 760x600 landscape frame with a square board in the middle of it
     is two empty gutters. */
  const SIDE_PAD = 30;
  const topBand = () => (MODE === 'mobile' ? 64 : 56);
  const botBand = () => (MODE === 'mobile' ? 96 : 20);

  /* A TALL FRAME PLAYS THE SAME BOARD TURNED A QUARTER TURN. The model is
     always ten wide and seven tall, the shape of the 760x600 desktop frame.
     A tall frame gets the transpose, seven wide and ten tall, so the SAME
     level, the same par and the same solution work in both, because a
     transposed sliding puzzle is the same puzzle. Turning it is cheaper than
     keeping two level sets, and far cheaper than being wrong about one. */
  /* WHICH WAY IT LIES IS A QUESTION ABOUT THE FRAME, NOT THE DEVICE. This was
     `MODE === 'mobile'`, which is a width test, so a 480x360 embed was called a
     phone and handed the portrait board: ten rows into what the bands left of
     360px came to a 20px cell, less than half the minimum target. Ask the frame
     instead, and take whichever way round makes the cell bigger. A phone still
     gets the transpose, because a phone is tall. */
  let TURNED = false;
  const orientFor = (availW, availH) =>
    Math.min(availW / M.R, availH / M.C) > Math.min(availW / M.C, availH / M.R);
  const geo = {
    get cols() { return TURNED ? M.R : M.C; },
    get rows() { return TURNED ? M.C : M.R; },
    cell: 40, ox: 0, oy: 0,
    at(i) {
      const p = M.rc(i);
      return TURNED ? { x: this.ox + p.r * this.cell, y: this.oy + p.c * this.cell }
                    : { x: this.ox + p.c * this.cell, y: this.oy + p.r * this.cell };
    },
    cellAt(x, y) {
      const gx = Math.floor((x - this.ox) / this.cell), gy = Math.floor((y - this.oy) / this.cell);
      if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) return -1;
      return TURNED ? M.idx(gx, gy) : M.idx(gy, gx);
    },
  };
  /* A drag is in screen directions and the model thinks in board ones. Turned,
     screen-up is board-left and screen-right is board-down. */
  const dirFromScreen = () => (TURNED ? [3, 2, 1, 0] : [0, 1, 2, 3]);
  let ctrl = [];

  /* THE BOARD'S OWN SIDE MARGIN, separate from the chrome's. SIDE_PAD is 30
     because that is where the HUD text sits; spending it on the board too cost
     the phone 5px of cell, and at ten rows turned sideways that is the
     difference between a 45px target and a 50px one. On a 360px Android the
     board was coming out at 42px, under the 44px minimum. Measured after:
     50px at 375, 48 at 360, 52 at 390, 58 on a Pro Max, 70 on the desktop
     frame. The one device this board cannot serve is a 320x568 SE, where ten
     rows into 408px of height is 40px whatever the side margin does - that is
     the price of the taller board and no margin recovers it. */
  const boardPad = () => (MODE === 'mobile' ? 10 : SIDE_PAD);

  function layout() {
    const availW = Math.max(60, LW - boardPad() * 2);
    const availH = Math.max(60, LH - topBand() - botBand());
    TURNED = orientFor(availW, availH);      // before geo.cols/rows are read off it
    geo.cell = Math.max(8, Math.floor(Math.min(availW / geo.cols, availH / geo.rows)));
    const boardW = geo.cols * geo.cell, boardH = geo.rows * geo.cell;
    geo.ox = Math.round((LW - boardW) / 2);
    geo.oy = Math.round(topBand() + (availH - boardH) / 2);
    layoutControls();
  }

  /* Order is fixed: sound, Undo, Restart, Hint, Rules. There is no Hint in M1,
     so it is simply absent; the others do not move to fill the space. */
  function layoutControls() {
    const items = [{ id: 'sound', icon: true }, { id: 'undo', label: 'Undo' },
                   { id: 'restart', label: 'Restart' }, { id: 'rules', label: 'Rules' }];
    ctx.save();
    let total = 0;
    items.forEach(it => {
      it.w = it.icon ? UI.PILL.iconW : UI.pillWidth(ctx, it.label);
      total += it.w;
    });
    total += UI.PILL.gap * (items.length - 1);
    ctx.restore();
    const cy = MODE === 'mobile' ? LH - 74 : topBand() / 2;
    let x = MODE === 'mobile' ? Math.round((LW - total) / 2) : SIDE_PAD;
    ctrl = items.map(it => {
      const box = { id: it.id, label: it.label, icon: it.icon,
                    x, y: Math.round(cy - UI.PILL.h / 2), w: it.w, h: UI.PILL.h, cx: x + it.w / 2, cy };
      x += it.w + UI.PILL.gap;
      return box;
    });
    // The control row and the read-out lay out from opposite ends of the same
    // band and nothing else checks whether they meet. Desktop is the only mode
    // where they share it, so measure there and give the read-out what is left.
    readoutMinX = MODE === 'desktop' ? x + 16 : SIDE_PAD;
  }
  let readoutMinX = SIDE_PAD;

  /* ---------- MOVES ---------- */
  function carrotsFor(m) { return m <= par ? 3 : m <= Math.ceil(par * TUNE.carrot2Mult) ? 2 : 1; }

  /* One gesture, several cells, one move charged per cell. The run was built
     to stop at a winning slide, so nothing here can land on a board she has
     already left. */
  function commitRun(mvs) {
    for (let i = 0; i < mvs.length; i++) {
      commit(mvs[i], { silent: i < mvs.length - 1 });
      if (phase !== 'play') break;
    }
  }

  function commit(mv, opts) {
    opts = opts || {};
    history.push({ state: M.clone(st), moves });
    /* Asked BEFORE the move, because afterwards the bomb is spent and there is
       nothing left to ask. A piece that simply stopped existing read as a
       glitch; it needs to go off. */
    const wasBomb = M.bombedTile(st, mv.a, mv.b);
    const next = M.apply(st, mv);
    const prev = st;
    moves++;
    st = next;
    if (wasBomb) {
      const cells = [mv.a, mv.b, M.NBD[mv.a][mv.dir], M.NBD[mv.b][mv.dir]]
        .filter((c, i, all) => c >= 0 && all.indexOf(c) === i);
      boom = { cells, t0: performance.now() };
      SND.explode();
    }
    if (st.bunny !== prev.bunny || st.fox !== prev.fox) snapPaceHome(performance.now());

    /* HE DOES NOT TAKE HER THE INSTANT THE GAP OPENS. He sets off, and the
       walk takes a couple of seconds, and until he arrives the board is still
       live: undo it, or slide something else, and the path closes and he goes
       home. A slat pushed the wrong way by mistake should be a moment of
       fright and a chance to fix it, not a loss with no answer to it.
       Stop watching and he DOES take her: the grace runs out, he arrives and
       the level is lost. That was written here long before it was true - the
       catch used to rewind the fatal slide and hand the board back, so the
       game could not be lost at all, and this comment said otherwise for
       days. Verified now rather than asserted. */
    if (M.caught(st)) {
      SND.fox();
      threat = { t0: performance.now(), path: foxPathToBunny() };
      return;
    }
    if (threat) threat = null;                  // that slide closed the path
    if (!opts.silent) SND.snap();
    notePockets(performance.now());

    if (M.won(st)) {
      /* THE PATH IS OPEN AND SHE TAKES IT. She is not walked square by square
         any more; the moment her pocket of holes contains the carrot she runs
         the whole way, and the win card waits for her to arrive. */
      phase = 'running';
      anim = { kind: 'run', t0: performance.now(), path: pathThroughHoles(st.bunny, st.carrot) };
      SND.hop();
      return;
    }
    if (false) {
      phase = 'won';
      const c = carrotsFor(moves);
      const id = sigOf(LEVELS[levelIndex]);
      if (!best[id] || moves < best[id].moves) best[id] = { moves, carrots: c };
      save();
      SND.crunch(); setTimeout(SND.win, 220);
      T().levelComplete && T().levelComplete(levelIndex + 1, moves);
    }
  }

  /* The 4-connected walk between two holes, so both the catch and her run to
     the carrot are journeys the player can follow rather than teleports. */
  /* `avoid` is a cell the walker may not use. The fox is given the carrot:
     nothing passes over it and only the bunny may share its square, so his
     run at her has to go round. */
  function pathThroughHoles(from, to, avoid) {
    const prev = new Int16Array(M.N).fill(-1);
    const q = [from]; prev[from] = from;
    while (q.length) {
      const i = q.shift();
      if (i === to) break;
      for (const ni of M.NB4[i]) {
        if (prev[ni] >= 0 || st.grid[ni] !== M.HOLE || ni === avoid) continue;
        prev[ni] = i; q.push(ni);
      }
    }
    const path = []; let cur = to;
    while (cur !== from && prev[cur] >= 0) { path.unshift(cur); cur = prev[cur]; }
    path.unshift(from);
    return path;
  }

  /* His run at her. It goes round the carrot: nothing passes over it, which
     is also why caught() no longer reaches through it. */
  function foxPathToBunny() {
    const prev = new Int16Array(M.N).fill(-1);
    const q = [st.fox]; prev[st.fox] = st.fox;
    while (q.length) {
      const i = q.shift();
      if (i === st.bunny) break;
      const p = M.rc(i);
      for (const d of M.DIRS) {
        if (!M.inside(p.r + d.dy, p.c + d.dx)) continue;
        const ni = M.idx(p.r + d.dy, p.c + d.dx);
        if (prev[ni] >= 0 || st.grid[ni] !== M.HOLE || ni === st.carrot) continue;
        prev[ni] = i; q.push(ni);
      }
    }
    const path = []; let cur = st.bunny;
    while (cur !== st.fox && prev[cur] >= 0) { path.unshift(cur); cur = prev[cur]; }
    path.unshift(st.fox);
    return path;
  }

  function undo() {
    if (phase !== 'play' || !history.length || anim) return;
    if (threat) threat = null;
    const h = history.pop();
    st = h.state;
    /* The board has jumped back a move and both of them with it. Put them
       where it says they are: an animal left mid-stride after a rewind is
       drawn on a square the rules no longer agree with. */
    snapPaceHome(performance.now());
    // AN UNDO COSTS A MOVE. House rule from Untangle: a scored counter that
    // does not charge for undo is not counting anything.
    moves = h.moves + 1;
    SND.undo();
  }
  function restart() {
    if (anim && anim.kind === 'catch') return;
    threat = null;
    loadLevel(levelIndex);
  }

  /* ---------- INPUT ---------- */
  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    const cx = e.clientX ?? e.changedTouches?.[0]?.clientX;
    const cy = e.clientY ?? e.changedTouches?.[0]?.clientY;
    return { x: (cx - r.left) * (LW / r.width), y: (cy - r.top) * (LH / r.height) };
  }
  const inBox = (p, b) => b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

  /* HOW FAR THIS SLAT CAN GO THIS WAY, as a list of the one-cell slides that
     make up the run. A slide is still one cell to the rules and one cell to
     the move counter - par is a count of one-cell slides and it has to stay
     that - but one gesture may spend several of them, which is how the
     original plays. Measured on the eight levels, 22.7% of legal slides have
     somewhere further to go, so a fifth of every move used to be drag, stop,
     drag again.

     The run ends where the game does: a slide that opens her path to the
     carrot is the last one, because she sets off the moment it lands. */
  function slideRun(st0, tile, dir) {
    const out = [];
    let s = st0, a = tile.a, b = tile.b;
    while (out.length < M.C) {
      const mv = M.slideMoves(s).find(m => m.a === a && m.b === b && m.dir === dir);
      if (!mv) break;
      out.push(mv);
      s = M.apply(s, mv);
      if (M.won(s)) break;
      a = M.NBD[a][dir]; b = M.NBD[b][dir];
    }
    return out;
  }

  canvas.addEventListener('pointerdown', (e) => {
    SND.ready();
    const p = toLogical(e);
    dbg.lastDown = { x: Math.round(p.x), y: Math.round(p.y), why: 'reached' };
    if (levelsOpen) { dbg.lastDown.why = 'level picker open'; levelsPointerDown(p); return; }
    if (rulesOpen) { dbg.lastDown.why = 'rules card open'; rulesPointerDown(p, e); return; }
    for (const b of ctrl) if (inBox(p, b)) { dbg.lastDown.why = 'control ' + b.id; press(b.id); return; }
    if (inBox(p, levelsHit)) { dbg.lastDown.why = 'read-out, opening the picker'; openLevels(); return; }
    if (phase === 'lost') {
      dbg.lastDown.why = 'lose card';
      if (inBox(p, loseCTA)) loadLevel(levelIndex);
      return;
    }
    if (phase === 'won') {
      dbg.lastDown.why = 'win card';
      if (inBox(p, winLevelsBtn)) { openLevels(); return; }
      if (inBox(p, winCTA)) nextLevel();
      return;
    }
    /* A snap or a snapback lasts 90ms, and a press arriving inside it used to
       be dropped on the floor - so a quick second try after a refused drag did
       nothing at all. Finish the little animation instead and take the press. */
    if (anim && (anim.kind === 'snap' || anim.kind === 'snapback')) {
      const a = anim; anim = null;
      if (a.kind === 'snap') commitRun(a.mvs);
    }
    if (phase !== 'play' || anim) { dbg.lastDown.why = 'phase ' + phase + (anim ? ' + anim ' + anim.kind : ''); return; }

    const i = geo.cellAt(p.x, p.y);
    dbg.lastDown.cell = i;
    if (i < 0) { dbg.lastDown.why = 'off the board'; return; }

    // She goes on her own now: there is nothing to tap. Only slats are dragged.
    const t = M.tileAt(st.grid, i);
    if (!t) { dbg.lastDown.why = 'not a slat (grid ' + st.grid[i] + ')'; return; }
    /* Start the drag FIRST and capture afterwards. setPointerCapture throws on
       a pointerId it does not know, and with the capture call first that took
       the whole gesture down with it - the tile simply would not move and
       nothing said why. Capture is a nicety; the drag is the point. */
    /* Home before anyone touches anything. Whichever cell an animal blocks, it
       is the cell it is drawn on the instant a slat is picked up. */
    snapPaceHome(performance.now());

    /* THE AXIS IS THE SLAT'S, NOT THE GESTURE'S. A slat slides along its own
       length and nowhere else, so there is nothing to infer: a flat one moves
       across the screen, a standing one up and down, and on a turned phone
       board those two swap over. Work it out here, once, from the tile. */
    /* ONE POINTER OWNS THE GESTURE. Neither move nor up checked the id, so a
       second finger anywhere on the board - a thumb resting, a palm - fed its
       own coordinates into the live drag and the slat jumped to it. */
    drag = { tile: t, id: e.pointerId, x0: p.x, y0: p.y, dx: 0, dy: 0, dir: -1,
             screenDir: -1, axisIsX: (t.horiz !== TURNED), moved: false };
    dbg.downs++;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { dbg.captureFailed++; }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = toLogical(e);
    if (!drag || e.pointerId !== drag.id) return;
    dbg.moves++;
    const rawX = p.x - drag.x0, rawY = p.y - drag.y0;

    /* Only the movement ALONG the slat's own axis counts. The previous version
       picked the axis from whichever way the first six pixels of the gesture
       happened to go, which on a thumb or a trackpad is noise: start a
       sideways drag with a little downward wobble and it locked to the
       vertical, which for a flat slat can never be legal, and the slat then
       refused to move for the whole of that gesture however far you dragged
       it. That is the "some tiles don't move" bug, and it was in the gesture
       and never in the rules. */
    const along = drag.axisIsX ? rawX : rawY;
    if (Math.abs(along) < TUNE.dragStart) { drag.dx = drag.dy = 0; return; }

    // Which of the two ways along that axis. It may change mid-gesture: drag
    // back the other way and the slat follows, which is how every game in this
    // family behaves.
    const screenDir = drag.axisIsX ? (along > 0 ? 1 : 3) : (along > 0 ? 2 : 0);
    if (screenDir !== drag.screenDir) {
      drag.screenDir = screenDir;
      drag.dir = dirFromScreen()[screenDir];
      drag.chain = slideRun(st, drag.tile, drag.dir);
      drag.legal = drag.chain.length > 0;
      if (!drag.legal) {
        SND.refused();
        /* SAY WHO IS REFUSING. A slat that will not move because it would seal
           an animal into its last hole looked exactly like a slat that will
           not move because there is another slat behind it, and on a muted
           school Chromebook the knock is not there either. Whoever is in the
           way flinches, so the answer is on screen and it names itself. */
        const na = M.NBD[drag.tile.a][drag.dir], nb = M.NBD[drag.tile.b][drag.dir];
        const filled = (na !== drag.tile.a && na !== drag.tile.b) ? na : nb;
        if (filled >= 0 && (filled === st.bunny || filled === st.fox) &&
            !M.NB4[filled].some(n2 => st.grid[n2] === M.HOLE)) {
          flinch = { cell: filled, t0: performance.now() };
        }
      }
      drag.moved = true;
      drag.trail = [];                         // a reversal is a fresh gesture
    }
    const sd = M.DIRS[screenDir];
    // as far as the slat can actually go, and no rubber band past it
    const limit = drag.legal ? geo.cell * drag.chain.length : geo.cell * 0.12;
    /* Take the dead zone off the travel. It used to be left on, so the instant
       the gesture passed 5px the slat jumped 5px to catch up - a small pop at
       the start of every single drag, and the first thing the hand feels. */
    drag.raw = Math.abs(along);
    const t = Math.min(limit, Math.max(0, drag.raw - TUNE.dragStart));
    drag.dx = sd.dx * t; drag.dy = sd.dy * t;

    /* How fast the SLAT is travelling, over the last `flickWin` of gesture.
       A running average was tried first and it lags: on a 60ms flick it read a
       third under the true speed, which put the desktop right on the line and
       left the phone - smaller cells, so fewer pixels for the same gesture -
       just under it. A window over the samples has no lag to correct for. */
    const ms = performance.now();
    drag.trail = drag.trail || [];
    drag.trail.push({ ms, t });
    while (drag.trail.length > 2 && ms - drag.trail[0].ms > TUNE.flickWin) drag.trail.shift();
    const a0 = drag.trail[0], dt = ms - a0.ms;
    drag.vel = dt > 0 ? (t - a0.t) / dt : 0;
  });

  function endDrag() {
    if (!drag) return;
    const d = M.DIRS[drag.screenDir] || { dx: 0, dy: 0 };   // screen space: this is the drawing
    const along = Math.abs(drag.dx || drag.dy);       // what the slat travelled
    /* The DECISION is on the gesture, not on the drawing. The dead zone is
       taken off the slat's travel so it does not pop at the start, and taking
       it off the committed distance as well quietly moved the line from 42% of
       a cell to 52% on a phone - the opposite of the complaint. */
    const raw = drag.raw || 0;
    const run = drag.chain ? drag.chain.length : 0;
    dbg.lastEnd = { legal: !!drag.legal, along: Math.round(along), raw: Math.round(raw), run: run,
                    need: Math.round(geo.cell * TUNE.commitFrac),
                    dir: drag.dir, screenDir: drag.screenDir, moved: drag.moved };
    const cellsPerMs = (drag.vel || 0) / geo.cell;
    const flick = cellsPerMs >= TUNE.flickVel && raw >= geo.cell * TUNE.flickMin;
    /* Every whole cell the gesture crossed is spent; the part-cell left at the
       end is spent on the same terms a single-cell drag ever was - 42% of it,
       or a flick. */
    const whole = Math.floor(raw / geo.cell);
    const rest = raw - whole * geo.cell;
    const cells = Math.max(0, Math.min(run,
      whole + ((rest >= geo.cell * TUNE.commitFrac || flick) ? 1 : 0)));
    dbg.lastEnd.vel = +cellsPerMs.toFixed(5); dbg.lastEnd.flick = flick; dbg.lastEnd.cells = cells;
    if (drag.legal && cells > 0) {
      dbg.committed++;
      // snap the last few pixels home, then the moves land
      anim = { kind: 'snap', t0: performance.now(), mvs: drag.chain.slice(0, cells),
               from: { dx: drag.dx, dy: drag.dy },
               to: { dx: d.dx * geo.cell * cells, dy: d.dy * geo.cell * cells },
               tile: drag.tile };
    } else if (along > 0) {
      anim = { kind: 'snapback', t0: performance.now(),
               from: { dx: drag.dx, dy: drag.dy }, to: { dx: 0, dy: 0 }, tile: drag.tile };
    }
    drag = null;
  }
  canvas.addEventListener('pointerup', (e) => {
    e.preventDefault(); dbg.ups++;
    if (drag && e.pointerId === drag.id) endDrag();
  });
  canvas.addEventListener('pointercancel', (e) => {
    if (drag && e.pointerId === drag.id) drag = null;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  function press(id) {
    if (id === 'sound') { SND.toggle(); return; }
    if (id === 'rules') { rulesOpen = !rulesOpen; rulesScroll = 0; return; }
    if (id === 'undo') { undo(); return; }
    if (id === 'restart') { restart(); return; }
  }
  function nextLevel() {
    if (levelIndex + 1 < LEVELS.length) loadLevel(levelIndex + 1);
    else loadLevel(0);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && levelsOpen) { levelsOpen = false; return; }
    if (e.key === 'Escape' && rulesOpen) { rulesOpen = false; return; }
    if (e.key.toLowerCase() === 'u') undo();
    if (e.key.toLowerCase() === 'r') restart();
    if (phase === 'won' && (e.key === 'Enter' || e.key === ' ')) nextLevel();
    if (phase === 'lost' && (e.key === 'Enter' || e.key === ' ')) loadLevel(levelIndex);
  });

  /* ---------- THEY PACE ----------
     Both of them walk back and forth across the blank cells they can reach,
     and stand still only when there is nowhere to go. It is entirely cosmetic
     - the board state never moves with them - but it does a job that used to
     belong to a drawn outline: the fox walking his territory is how you see
     how far his territory goes. That is a better answer than a coral line
     round it, because it is the animal itself telling you.

     She is kept off the carrot square while pacing. Wandering onto it would
     look exactly like winning. */
  /* Idle pacing is SLOW - an animal in a small pocket with nowhere to be. The
     quick pace is reserved for the moment a slide opens their pocket up, when
     there is somewhere new to go and they go and look at it.

     IT IS OUT AND BACK, NEVER A RANDOM WALK, and that is not a style choice.
     An animal BLOCKS the cell the model has it in - a slat cannot slide over
     the bunny or the fox - and 16.4% of every refused slide on these eight
     levels is refused for exactly that reason and nothing else. If they wander
     off and settle somewhere else, the player is looking at an empty hole and
     being told no by an animal that appears to be two cells away. So they step
     out and they come straight back, and they REST on the cell that blocks. */
  /* THEY PATROL, END TO END. The pacing used to step out to a neighbour and
     straight back, because an animal BLOCKED the square the model had it on
     and settling anywhere else meant refusing slides over holes that looked
     empty. They no longer block a square - an animal occupies a pocket and
     steps aside - so there is nothing to stay near, and the fox walking the
     full length of his corridor is the clearest statement the game makes
     about how far he can reach.

     A patrol is a path to the FURTHEST cell of the pocket, walked one square
     at a time; on arrival it picks the furthest cell from there, which on a
     corridor is the other end again. */
  /* `hold` is the pause at each END of a patrol, not between squares. It was
     1700 against a 620ms step, so he stood still for most of every cycle and
     read as not moving at all. */
  const WANDER = { hold: 700, step: 520, turn: 900,
                   fastHold: 200, fastStep: 240, fastMs: 2200 };
  const pace = { bunny: null, fox: null };
  const fastUntil = { bunny: 0, fox: 0 };
  const pocketSize = { bunny: -1, fox: -1 };

  function regionOf(cell) { return M.regionFrom(st, cell); }
  function sizeOf(cell) { const r = regionOf(cell); let n = 0;
    for (let i = 0; i < M.N; i++) if (r[i]) n++; return n; }

  /* A slide can land on the square an animal is standing in, and apply() then
     steps it into a neighbouring hole. That step is NOT animated: walking it
     would draw them on the slat that has just landed, for 240ms, and the rule
     is that nothing but a slat is ever drawn on a slat. By the time the slide
     lands they are already on the square that is theirs. */
  /* WHERE THEY STAND IS REAL. It was not, and that is what made the fox
     impossible to trap: he paced as decoration, the rules kept him on the
     square he started from, and the moment a slat was picked up he snapped
     back to it - so the hole you had lined a brick up against was empty and
     he was somewhere else. Three separate reports of "he can't be trapped"
     were all this one thing.

     So a step now MOVES him. The model cell is set the instant a step
     completes, and this function - called whenever a slat is picked up, or
     the board jumps - puts both of them on the square they are nearest and
     tells the rules that is where they are. Combined with the freeze, at
     every moment a slide can happen, the square you see somebody on is the
     square the slide is refused by. */
  function setAnimal(who, cell) {
    /* SPREAD, DO NOT RE-LIST. This rebuilt the state by naming its fields, so
       the day the state grew a `bombs` field the bomb was dropped every time an
       animal took a step - which is a step a second, so the bomb vanished
       before the player had finished looking at the board. Spreading carries
       whatever the state has, including the next field somebody adds. */
    st = { ...st, bunny: who === 'bunny' ? cell : st.bunny,
                  fox:   who === 'fox'   ? cell : st.fox };
  }

  function snapPaceHome(now) {
    for (const who of ['bunny', 'fox']) {
      const w = pace[who];
      let cell = who === 'bunny' ? st.bunny : st.fox;
      if (w && w.from !== w.to && st.grid[w.to] === M.HOLE && st.grid[w.from] === M.HOLE) {
        // mid-stride: finish the half of the step they are nearer to
        const k = Math.min(1, (now - w.t0) / (w.ms || WANDER.step));
        cell = k < 0.5 ? w.from : w.to;
        setAnimal(who, cell);
      }
      pace[who] = { at: cell, from: cell, to: cell, t0: now, ms: WANDER.step, path: [], idx: 0 };
    }
  }

  /* The cell of `cell`'s pocket that is furthest from it, and the walk there.
     Now that a step really moves them, the walk has to respect the same
     squares a slide does: never the carrot, and never each other. */
  function patrolTo(cell, other) {
    const prev = new Int16Array(M.N).fill(-1), dist = new Int16Array(M.N).fill(-1);
    const q = [cell]; prev[cell] = cell; dist[cell] = 0;
    let far = cell;
    while (q.length) {
      const i = q.shift();
      if (dist[i] > dist[far]) far = i;
      for (const ni of M.NB4[i]) {
        if (prev[ni] >= 0 || st.grid[ni] !== M.HOLE || ni === st.carrot || ni === other) continue;
        prev[ni] = i; dist[ni] = dist[i] + 1; q.push(ni);
      }
    }
    if (far === cell) return [];
    const path = []; let cur = far;
    while (cur !== cell) { path.unshift(cur); cur = prev[cur]; }
    return path;
  }

  /* Called after every slide: whoever's pocket just grew gets to hurry. */
  function notePockets(now) {
    for (const who of ['bunny', 'fox']) {
      const cell = who === 'bunny' ? st.bunny : st.fox;
      const n = sizeOf(cell);
      if (pocketSize[who] >= 0 && n > pocketSize[who]) fastUntil[who] = now + WANDER.fastMs;
      pocketSize[who] = n;
    }
  }

  /* NOBODY PACES WHILE A SLAT IS MOVING, and this is the whole of the "they
     walk over the slats" bug. The rules use the square the model has an animal
     on; pacing draws it somewhere else in the same pocket, and on these eight
     levels the fox can leave his own square in 78.2% of reachable positions
     and get as far as ten cells from it. So the player covers the hole he is
     STANDING IN, the model - which has him elsewhere - allows the slide, and
     he is drawn on top of the slat that just landed and then pops back out.
     Cornering him looked like a bug because it was one.

     While a slat is in hand or in flight the model has not moved yet, so the
     only safe place to draw them is the square the rules are about to use.
     They are put there the moment a slat is picked up (snapPaceHome) and they
     stay there until the slide has landed. What you see is what is refused. */
  function slatInPlay() {
    return !!drag || !!(anim && (anim.kind === 'snap' || anim.kind === 'snapback'));
  }

  function stepPace(now) {
    /* REDUCED MOTION MUST NOT STOP THE ANIMALS. This read `if (!st ||
       REDUCED.matches) return;`, which did not suppress an animation, it
       switched off a RULE: pacing moves the model, and where the hunter stands
       is what the player reads his reach from. With the setting on, nobody
       ever took a step and the only thing that moved on the whole board was
       the bunny's run to the carrot, which is a different code path and was
       never gated. So the game looked frozen and its central piece of free
       information was simply absent.

       Every other use of REDUCED in this file snaps a motion to its end rather
       than cancelling it, and that is what pacing does now: the step still
       happens on the same clock, it just arrives instead of gliding. */
    if (!st) return;
    if (slatInPlay()) return;
    /* Only while the level is live. Won, caught or running, somebody else is
       driving the drawing and a pacing animal walks about behind the card. */
    if (phase !== 'play') return;
    /* NOBODY STROLLS WHILE HE IS COMING. Once the threat is armed his drawn
       position comes from the threat path, and pacing went on moving his model
       position underneath it - so the two could step onto the same square and
       cancel the catch outright, which is the bug this line exists to stop.
       He hunts; she waits. */
    if (threat) return;
    for (const who of ['bunny', 'fox']) {
      const anchor = () => (who === 'bunny' ? st.bunny : st.fox);
      let w = pace[who];
      if (!w) w = pace[who] = { at: anchor(), from: anchor(), to: anchor(), t0: now,
                                ms: WANDER.step, path: [], idx: 0 };
      /* A slat can land on the square they had walked TO: put them back on the
         cell the model has them in and start again from there. Only `to` is
         tested. `from` under a slat is the step-aside - a slide has landed on
         the square they were standing in and they are walking out from under
         it - and testing that as well cancelled the step and popped them to
         the far end of it instead, which is the thing it was there to stop. */
      if (st.grid[w.to] !== M.HOLE) {
        const a = anchor();
        Object.assign(w, { at: a, from: a, to: a, t0: now, path: [], idx: 0 });
        continue;
      }
      const fast = now < fastUntil[who];
      const stepMs = fast ? WANDER.fastStep : WANDER.step;
      w.ms = stepMs;
      const midPatrol = w.idx < w.path.length;
      // no pause between squares of a walk; a beat at each end of it
      const pause = midPatrol ? 0 : (fast ? WANDER.fastHold : WANDER.hold);
      if (now - w.t0 < stepMs + pause) continue;

      w.at = w.to;
      setAnimal(who, w.to);            // the step is finished: he is really there
      if (w.idx < w.path.length) {                    // keep walking the line
        w.from = w.at; w.to = w.path[w.idx++]; w.t0 = now; continue;
      }
      const path = patrolTo(w.at, who === 'bunny' ? st.fox : st.bunny);
      if (!path.length) { w.t0 = now; continue; }
      w.path = path; w.idx = 0;
      w.from = w.at; w.to = w.path[w.idx++]; w.t0 = now;
    }
  }

  /* A short recoil for whoever just refused to be squashed: back away from the
     slat, then settle. 380ms, and it never moves them off their own square. */
  const FLINCH_MS = 380;
  /* 0.09 of a cell, and that number is not a taste. A sprite is drawn with its
     feet at 0.90 of the cell and fitted into a box 0.80 high, so its head is
     already at 0.10 - lift it further than that and it crosses into the cell
     above, which is usually the very slat that just refused to squash it. */
  function flinchOffset(cell, now) {
    if (!flinch || flinch.cell !== cell) return null;
    const k = (now - flinch.t0) / FLINCH_MS;
    if (k >= 1) { flinch = null; return null; }
    const kick = Math.sin(k * Math.PI) * geo.cell * 0.09;
    return { d: kick, k };
  }

  /* Where to draw one of them this frame, and which way it is facing. */
  function paceAt(who, now) {
    const anchor = who === 'bunny' ? st.bunny : st.fox;
    const w = pace[who];
    const c = geo.cell;
    if (!w || w.from === w.to) {
      const p = geo.at(w ? w.to : anchor);
      return { x: p.x, y: p.y, moving: false, flip: false };
    }
    const k = REDUCED.matches ? 1
      : Math.max(0, Math.min(1, (now - w.t0) / (w.ms || WANDER.step)));
    const a = geo.at(w.from), b = geo.at(w.to);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e,
             moving: k < 1, dx: b.x - a.x, dy: b.y - a.y, flip: b.x < a.x, k, cell: c };
  }

  /* ---------- ANIMATION ---------- */
  function stepAnim(now) {
    stepPace(now);

    /* The grace running out is the only thing that actually loses a level. */
    if (threat) {
      if (!M.caught(st)) { threat = null; }
      else if (now - threat.t0 >= TUNE.graceMs) {
        const t = threat; threat = null;
        phase = 'caught';
        anim = { kind: 'catch', t0: now, path: t.path };
        T().levelRestart && T().levelRestart(levelIndex + 1);
      }
    }
    if (!anim) return;
    const el = now - anim.t0;
    if (anim.kind === 'snap' || anim.kind === 'snapback') {
      const k = REDUCED.matches ? 1 : Math.min(1, el / TUNE.snapMs);
      anim.k = k * k * (3 - 2 * k);
      if (k >= 1) {
        const a = anim; anim = null;
        if (a.kind === 'snap') commitRun(a.mvs);
        else SND.refused();
      }
    } else if (anim.kind === 'run') {
      const per = 150;                                   // ms per square, quick
      if (el >= anim.path.length * per) {
        anim = null; phase = 'won';
        /* SHE STAYS ON THE CARROT. Her run is an animation and the model still
           had her on the square she set off from, so the moment the card came
           up she was drawn back there and carried on pacing behind it. The
           square she reached is hers now. */
        st = { ...st, bunny: st.carrot };
        snapPaceHome(now);
        const c = carrotsFor(moves);
        const id = sigOf(LEVELS[levelIndex]);
        /* What the card needs is the record BEFORE this run, because the whole
           point of a score you can go back for is being told you beat it. */
        wonPrev = best[id] ? { moves: best[id].moves, carrots: best[id].carrots } : null;
        wonBeat = !wonPrev || moves < wonPrev.moves;
        if (wonBeat) best[id] = { moves, carrots: c };
        save();
        SND.crunch(); setTimeout(SND.win, 220);
        T().levelComplete && T().levelComplete(levelIndex + 1, moves);
      }
    } else if (anim.kind === 'catch') {
      const total = REDUCED.matches ? TUNE.holdMs
                                    : TUNE.lungeMs + TUNE.holdMs + TUNE.rewindMs;
      if (el >= total) {
        /* HE TAKES HER, AND THAT IS THE END OF THE LEVEL. This used to rewind
           the fatal slide and hand the board back, so the fox could never
           actually win: the level was unloseable and the comment above the
           grace claimed the opposite. Par is the length of the shortest
           solution found by a search that counts positions where ONE MOVE
           LOSES AND ANOTHER DOES NOT, and that number means nothing if losing
           is impossible.

           The grace before this is untouched and is where the mercy lives: he
           takes a couple of seconds to arrive, and undoing or closing the path
           in that window still sends him home. */
        anim = null; phase = 'lost';
        SND.refused();
        T().levelRestart && T().levelRestart(levelIndex + 1);
      }
    }
  }

  /* ---------- RENDER ---------- */
  function render(now) {
    ctx.clearRect(0, 0, LW, LH);
    const bg = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
    bg.addColorStop(0, RD.RAISED); bg.addColorStop(0.6, RD.SURFACE); bg.addColorStop(1, RD.GROUND);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);
    if (!st) return;

    const world = worldOf(LEVELS[levelIndex]);
    RD.drawTray(ctx, geo, world);

    // holes and bricks first: they are the floor everything else sits on
    for (let i = 0; i < M.N; i++) {
      if (st.grid[i] === M.HOLE) RD.drawHole(ctx, geo, i, world);
      else if (st.grid[i] === M.BRICK) RD.drawBrick(ctx, geo, i, ART[world.block] || ART['brick']);
    }

    // the carrot sits in its hole, under whatever is over it
    drawCarrot();

    // tiles, with the one in hand drawn last so it is above its neighbours
    const held = drag ? drag.tile : (anim && anim.tile) || null;
    let heldBox = null;
    for (let i = 0; i < M.N; i++) {
      if (st.grid[i] !== M.HL && st.grid[i] !== M.VT) continue;
      const t = M.tileAt(st.grid, i);
      if (held && t.a === held.a && t.b === held.b) continue;
      RD.drawTile(ctx, geo, t.a, t.b, world);
      if (M.bombedTile(st, t.a, t.b)) drawBomb(t.a, t.b, 0, 0);
    }
    /* THE CAST IS CUT OUT OF THE SLAT IN HAND.

       No slide can land on either of them any more, so this is belt and
       braces - but the drag itself still crosses their square on the way to
       being refused, and that used to draw them sitting on top of the slat.
       Drawing them before the held tile fixed the ordering and not the whole
       of it, because the slat's corners are rounded and the fox showed through
       them: 14 orange pixels out of 5,183 in the overlap, measured. Clipping
       them out of the held tile's footprint makes it zero. */
    let hdx = 0, hdy = 0, hlift = 0;
    if (held) {
      if (drag) { hdx = drag.dx; hdy = drag.dy; hlift = geo.cell * 0.05; }
      else if (anim && anim.k !== undefined) {
        hdx = anim.from.dx + (anim.to.dx - anim.from.dx) * anim.k;
        hdy = anim.from.dy + (anim.to.dy - anim.from.dy) * anim.k;
        hlift = geo.cell * 0.05 * (1 - anim.k);
      }
      const hp = geo.at(held.a), c = geo.cell;
      const hw = held.horiz ? c * 2 : c, hh = held.horiz ? c : c * 2;
      /* A pixel proud on every side. Chrome antialiases a clip, so an exact
         rect left a one-pixel seam of him along the edge - 17 pixels of fox
         orange, blended 85% against the ground, which is how it was found. */
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, LW, LH);
      ctx.rect(hp.x + hdx - 1, hp.y + hdy - 1, hw + 2, hh + 2);
      ctx.clip('evenodd');
    }
    /* HE GOES OVER HER, AND SHE IS GONE. The catch fired correctly and read
       as nothing, because the draw order never changed: she was painted after
       him on every frame and was never removed, so he arrived, ended up BEHIND
       her, and a card appeared while the two of them stood there together for
       about seven hundred milliseconds.

       So during the catch the order flips and she fades out underneath him.
       Once the level is lost she is not drawn at all. No new art, which the
       cast could not have supplied anyway: the fox has a stand and two
       strides, and the cop and the shark have one frame each. */
    if (catching()) { drawBunny(now); drawFox(now); }
    else            { drawFox(now);   drawBunny(now); }
    if (held) ctx.restore();

    if (held) {
      heldBox = RD.drawTile(ctx, geo, held.a, held.b, world, { dx: hdx, dy: hdy, lift: hlift });
      if (M.bombedTile(st, held.a, held.b)) drawBomb(held.a, held.b, hdx, hdy - hlift);
      dbg.paint = { fox: paintBox.fox, bunny: paintBox.bunny, held: { a: held.a, b: held.b, dx: hdx, dy: hdy } };
    } else {
      dbg.paint = { fox: paintBox.fox, bunny: paintBox.bunny, held: null };
    }

    drawBoom(now);
    drawHUD();
    ctrl.forEach(b => {
      if (b.icon) drawSoundPill(b);
      else UI.drawPill(ctx, b.label, b.cx, b.cy, { w: b.w, dim: b.id === 'undo' && !history.length });
    });

    if (phase === 'won') drawWinCard();
    if (phase === 'lost') drawLoseCard();
    if (levelsOpen) drawLevelsCard();
    if (rulesOpen) drawRulesCard(now);
  }

  /* The carrot sits in its black cell and nothing is drawn under it. The
     earlier one was a crop out of a sprite sheet with a drop shadow baked in,
     scaled to a height that cut the leaves off; this one is the owner's redraw
     of 2026-09-07, fitted by its own aspect so the whole plant is inside the
     cell. */
  function drawCarrot() {
    const p = geo.at(st.carrot), c = geo.cell;
    sprite('carrot', p.x + c / 2, p.y + c * 0.90, c * 0.80);
  }

  /* The bomb rides the domino it is fixed to, centred across both squares so
     it reads as belonging to the piece rather than to a square. It travels
     with the slat in hand, because until the slat is let go nothing has
     happened yet: the move is the fuse. */
  function drawBomb(a, b, dx, dy) {
    const pa = geo.at(a), pb = geo.at(b), c = geo.cell;
    const cx = (pa.x + pb.x) / 2 + c / 2 + dx;
    const cy = (pa.y + pb.y) / 2 + c / 2 + dy;
    sprite('bomb', cx, cy + c * 0.30, c * 0.60);
  }

  /* THE BLAST. Squares of light that open fast and fade, with a ring running
     out past them. Drawn over the board and under the chrome, it holds nothing
     up and it is not part of the rules: by the time its first frame appears
     the domino is already gone from the model. */
  function drawBoom(now) {
    if (!boom) return;
    const t = (now - boom.t0) / TUNE.boomMs;
    if (t >= 1) { boom = null; return; }
    const c = geo.cell, ease = 1 - Math.pow(1 - t, 2);
    ctx.save();
    for (const cell of boom.cells) {
      const p = geo.at(cell), cx = p.x + c / 2, cy = p.y + c / 2;
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.fillStyle = t < 0.35 ? '#FFF3C4' : RD.SUN;
      ctx.beginPath(); ctx.arc(cx, cy, c * (0.18 + 0.34 * ease), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = (1 - t) * 0.55;
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(1, c * 0.05 * (1 - t));
      ctx.beginPath(); ctx.arc(cx, cy, c * (0.30 + 0.85 * ease), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  /* The losing card. Same shape as the win card, because they are the two
     ends of one sentence and a player should not have to re-learn the layout
     to read bad news. */
  let loseCTA = null;
  function drawLoseCard() {
    const pw = Math.min(LW - 56, 470), ph = Math.min(LH - 20, 300);
    const px = Math.round((LW - pw) / 2), py = Math.max(10, Math.round((LH - ph) / 2));
    ctx.fillStyle = 'rgba(10,16,28,0.82)'; ctx.fillRect(0, 0, LW, LH);
    ctx.fillStyle = RD.SURFACE; RD.rr(ctx, px, py, pw, ph, 22); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    RD.rr(ctx, px, py, pw, ph, 22); ctx.stroke();

    const who = HUNTER[worldOf(LEVELS[levelIndex]).predator] || 'fox';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#FFFFFF'; ctx.font = '800 34px Inter, sans-serif';
    ctx.fillText('He got her', px + pw / 2, py + 34);
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = '600 17px Inter, sans-serif';
    ctx.fillText('your holes joined hers to the ' + who, px + pw / 2, py + 84);
    ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.font = '600 14px Inter, sans-serif';
    ctx.fillText('Wall them in, or keep your gap away from theirs.', px + pw / 2, py + 118);

    loseCTA = UI.drawCTA(ctx, 'TRY AGAIN', px + pw / 2, py + ph - 60, '#C24A39');
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  /* True while he is taking her: the lunge, the hold, and afterwards. */
  function catching() {
    return phase === 'lost' || (anim && anim.kind === 'catch');
  }

  /* How solid she still is. Whole while he crosses the ground to her, gone by
     the end of the hold, so the moment she disappears is the moment he lands
     rather than an arbitrary beat. */
  function bunnyAlpha(now) {
    if (phase === 'lost') return 0;
    if (!anim || anim.kind !== 'catch') return 1;
    const el = now - anim.t0;
    if (el <= TUNE.lungeMs) return 1;
    const k = Math.min(1, (el - TUNE.lungeMs) / Math.max(1, TUNE.holdMs));
    return 1 - k;
  }

  function drawBunny(now) {
    const a = bunnyAlpha(now);
    if (a <= 0) { paintBox.bunny = null; return; }
    if (a < 1) {
      ctx.save(); ctx.globalAlpha = a;
      drawBunnyBody(now);
      ctx.restore();
      return;
    }
    drawBunnyBody(now);
  }

  function drawBunnyBody(now) {
    const c = geo.cell;
    if (anim && anim.kind === 'run') { drawRunningBunny(now); return; }
    const w = paceAt('bunny', now);
    let frame = 'bunny-idle', flip = false;
    if (w.moving) {
      const set = Math.abs(w.dx) > Math.abs(w.dy)
        ? (w.dx > 0 ? HOP_FRAMES.right : HOP_FRAMES.left)
        : (w.dy > 0 ? HOP_FRAMES.down : HOP_FRAMES.up);
      frame = set[Math.min(set.length - 1, Math.floor(w.k * set.length))];
      flip = Math.abs(w.dx) > Math.abs(w.dy) && w.dx < 0;
    }
    const fl = flinchOffset(st.bunny, now);
    if (fl) { ctx.save(); ctx.translate(0, -fl.d); }
    const drew = sprite(frame, w.x + c / 2, w.y + c * 0.90, castH('bunny', c * 0.76), flip);
    paintBox.bunny = drew;
    if (fl) ctx.restore();
    if (!drew) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(w.x + c / 2, w.y + c * 0.60, c * 0.26, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* Her run to the carrot: the same interpolation the fox's lunge uses. */
  function drawRunningBunny(now) {
    const c = geo.cell, per = 150, path = anim.path;
    const f = Math.min(path.length - 1, (now - anim.t0) / per);
    const i0 = Math.floor(f), i1 = Math.min(path.length - 1, i0 + 1), t = f - i0;
    const a = geo.at(path[i0]), b = geo.at(path[i1]);
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    const dx = b.x - a.x, dy = b.y - a.y;
    const set = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? HOP_FRAMES.right : HOP_FRAMES.left)
      : (dy > 0 ? HOP_FRAMES.down : HOP_FRAMES.up);
    const frame = set[Math.floor(now / 90) % set.length];
    paintBox.bunny = sprite(frame, x + c / 2, y + c * 0.90, castH('bunny', c * 0.76),
                            Math.abs(dx) > Math.abs(dy) && dx < 0);
  }

  /* He is always on the board. There was a spell where a slide could land on
     him and he shrank and faded away, and it was wrong twice over: it drew him
     on a slat, and it read as deleting him rather than trapping him. Trapping
     him is walling him in, and a walled-in fox is still standing there. */
  function drawFox(now) { drawFoxLive(now); }

  function drawFoxLive(now) {
    const c = geo.cell;
    const cast = castOf();
    let x, y, frame = cast.still, flip = false;
    if (threat || (anim && anim.kind === 'catch')) {
      const hunting = !!threat;
      const t0 = hunting ? threat.t0 : anim.t0;
      const span = hunting ? TUNE.graceMs : TUNE.lungeMs;
      const path = hunting ? threat.path : anim.path;
      const el = now - t0;
      // Reduced motion: he is simply THERE, beside her, and the board holds.
      const k = REDUCED.matches ? 1 : Math.max(0, Math.min(1, el / span));
      /* THE GRACE CLOSES THE DISTANCE, THE LUNGE IS THE LAST SQUARE. The lunge
         used to re-walk the path from its first cell, so he crossed the board,
         arrived, snapped back to where he set off and charged a second time.
         Now the two halves meet: the grace walks him to the square BESIDE her
         and stops there, and the pounce carries him from that square onto her,
         which is also why he must not be drawn under her while it happens. */
      const edge = Math.max(0, path.length - 2);
      const f = hunting ? k * edge : edge + k * ((path.length - 1) - edge);
      const i0 = Math.floor(f), i1 = Math.min(path.length - 1, i0 + 1), tt = f - i0;
      const a = geo.at(path[i0]), b = geo.at(path[i1]);
      x = a.x + (b.x - a.x) * tt; y = a.y + (b.y - a.y) * tt;
      frame = cast.walk[Math.floor(el / 150) % cast.walk.length];
      flip = b.x > a.x;
    } else {
      const w = paceAt('fox', now);
      x = w.x; y = w.y;
      /* THE FOX IS DRAWN FACING LEFT. In every one of the three supplied files
         his head is at the low-x end and his brush at the high-x end, so he
         must be mirrored to walk RIGHT - the opposite of what this did, which
         is why he appeared to moonwalk. */
      flip = w.moving ? w.dx > 0 : false;
      /* Alternate on the STEP's own clock, not the wall clock: two frames per
         square walked, so every step shows both legs whatever the step time. */
      if (w.moving) frame = cast.walk[Math.floor(w.k * cast.walk.length) % cast.walk.length];
    }
    const fl2 = flinchOffset(st.fox, now);
    if (fl2) { ctx.save(); ctx.translate(0, -fl2.d); }
    const drewFox = sprite(frame, x + c / 2, y + c * 0.90,
                           castH(worldOf(LEVELS[levelIndex]).predator || 'fox', c * 0.80), flip);
    paintBox.fox = drewFox;
    if (fl2) ctx.restore();
    if (!drewFox) {
      ctx.fillStyle = '#FF4713';
      ctx.beginPath(); ctx.arc(x + c / 2, y + c * 0.58, c * 0.26, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ---------- HUD ----------
     One top band. On a phone the move count is the big number on the left with
     par beside it and the read-out on the right; on desktop the controls have
     the left of the band, so every figure goes into the one read-out line. */
  function drawHUD() {
    const lv = LEVELS[levelIndex];
    const hs = Math.max(0.66, Math.min(1, LW / 620));
    ctx.textBaseline = 'middle';

    if (MODE === 'mobile') {
      ctx.textAlign = 'left';
      ctx.fillStyle = RD.INK92; ctx.font = '800 ' + Math.round(30 * hs) + 'px Inter, sans-serif';
      const mtxt = String(moves);
      ctx.fillText(mtxt, SIDE_PAD, 30);
      const mw = ctx.measureText(mtxt).width;
      ctx.fillStyle = RD.SUN; ctx.font = '700 ' + Math.round(15 * hs) + 'px Inter, sans-serif';
      ctx.fillText('par ' + par, SIDE_PAD + mw + 10, 32);

      ctx.textAlign = 'right';
      ctx.fillStyle = RD.INK72; ctx.font = '600 ' + Math.round(15 * hs) + 'px Inter, sans-serif';
      const rtxt = worldOf(lv).name + '  ·  LEVEL ' + (lv.n || lv.id);
      ctx.fillText(rtxt, LW - SIDE_PAD, 24);
      drawPips(LW - SIDE_PAD, 46, true);
      /* The read-out is the way back to the picker mid level. It already names
         where you are, and the control row has no width left for a fifth
         pill. The box is the text plus the pips under it, never under 44 tall. */
      const rw = Math.max(ctx.measureText(rtxt).width, 60);
      levelsHit = { x: LW - SIDE_PAD - rw, y: 12, w: rw, h: 46 };
    } else {
      ctx.textAlign = 'right';
      ctx.fillStyle = RD.INK72; ctx.font = '600 ' + Math.round(16 * hs) + 'px Inter, sans-serif';
      const line = worldOf(lv).name + '   ·   LEVEL ' + (lv.n || lv.id) +
                   '   ·   MOVES ' + moves + '   ·   PAR ' + par;
      let f = 16;
      while (f > 11 && ctx.measureText(line).width > LW - SIDE_PAD - readoutMinX) {
        f -= 1; ctx.font = '600 ' + f + 'px Inter, sans-serif';
      }
      ctx.fillText(line, LW - SIDE_PAD, topBand() / 2);
      const dw = Math.max(ctx.measureText(line).width, 60);
      levelsHit = { x: LW - SIDE_PAD - dw, y: topBand() / 2 - 22, w: dw, h: 44 };
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  /* Three pips that say what finishing RIGHT NOW would be worth. The stake is
     a live number, not something revealed after the fact. */
  /* The score is carrots, so the pips are carrots: the game's own sprite, not
     a dot in the carrot's colour. An unearned one is the same drawing held
     right back, which reads as "this is the slot you have not filled" instead
     of as a different object. Until the art lands the dot still stands in,
     because a sprite is fetched and the HUD is not going to wait for it. */
  function drawPips(rightX, y, rightAligned, count, rr, gg) {
    const have = (count === undefined) ? carrotsFor(moves) : count;
    const r = rr || 5, gap = gg || 15;
    const im = ART.carrot;
    for (let k = 0; k < 3; k++) {
      const x = rightAligned ? rightX - (2 - k) * gap : rightX + k * gap;
      if (im && im.naturalWidth) {
        const h = r * 3.2, w = h * (im.naturalWidth / im.naturalHeight);
        ctx.save();
        ctx.globalAlpha = k < have ? 1 : 0.20;
        ctx.drawImage(im, x - w / 2, y - h / 2, w, h);
        ctx.restore();
        continue;
      }
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      if (k < have) { ctx.fillStyle = RD.SUN; ctx.fill(); }
      else { ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
  }

  function drawSoundPill(b) {
    UI.drawPill(ctx, '', b.cx, b.cy, { w: b.w });
    const on = SND.on(), x = b.cx - 6, y = b.cy;
    ctx.save();
    ctx.strokeStyle = on ? RD.INK92 : 'rgba(255,255,255,0.30)';
    ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 4, y - 3); ctx.lineTo(x - 1, y - 3);
    ctx.lineTo(x + 3, y - 7); ctx.lineTo(x + 3, y + 7); ctx.lineTo(x - 1, y + 3);
    ctx.lineTo(x - 4, y + 3); ctx.closePath(); ctx.fill();
    if (on) {
      ctx.beginPath(); ctx.arc(x + 5, y, 5, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 5, y, 9, -0.8, 0.8); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(x + 7, y - 5); ctx.lineTo(x + 15, y + 5);
      ctx.moveTo(x + 15, y - 5); ctx.lineTo(x + 7, y + 5); ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- THE LEVEL PICKER ----------
     Three carrots only mean anything if you can see the ones you have and go
     back for the ones you missed. Before this, `best` was written on every win
     and read absolutely nowhere, and nothing could return you to a level once
     you had left it, so finishing on one carrot and finishing on three had the
     same consequence: NEXT LEVEL, and the number gone for good.

     A level is open once you have finished the one before it. Saves written
     before this screen existed carry only a level number and a best table, so
     anywhere the game has already sent you counts as open too, otherwise a
     player who was on level sixty would come back to find fifty nine locked. */
  const PAGES = (() => {
    const out = [];
    LEVELS.forEach((lv, i) => {
      let pg = out.find(o => o.world === lv.world);
      if (!pg) out.push(pg = { world: lv.world, name: worldOf(lv).name, at: [] });
      pg.at.push(i);
    });
    return out;
  })();

  function highestOpen() {
    let top = levelIndex;
    for (let i = 0; i < LEVELS.length; i++) if (best[sigOf(LEVELS[i])]) top = Math.max(top, i + 1);
    return Math.min(top, LEVELS.length - 1);
  }
  const isOpen = i => i <= highestOpen();
  const carrotsAt = i => { const b = best[sigOf(LEVELS[i])]; return b ? b.carrots : 0; };

  function openLevels() {
    levelsOpen = true; levelsScroll = 0;
    const here = PAGES.findIndex(pg => pg.at.indexOf(levelIndex) >= 0);
    levelsWorld = here < 0 ? 0 : here;
  }

  /* A padlock, drawn rather than typed: the design system forbids emoji icons
     and this is the one glyph the picker needs. */
  function drawLock(x, y, s) {
    ctx.strokeStyle = 'rgba(255,255,255,0.34)';
    ctx.lineWidth = Math.max(1.5, s * 0.11);
    ctx.beginPath();
    ctx.arc(x, y - s * 0.30, s * 0.30, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    RD.rr(ctx, x - s * 0.46, y - s * 0.06, s * 0.92, s * 0.72, s * 0.16);
    ctx.fill();
  }

  let levelTiles = [], levelsPrev = null, levelsNext = null, levelsCTA = null, levelsGeom = null;

  function levelsBox() {
    const pw = Math.min(LW - 40, 470), ph = Math.min(LH - 20, 560);
    return { px: Math.round((LW - pw) / 2), py: Math.max(10, Math.round((LH - ph) / 2)),
             pw, ph, header: 104, footer: 76, body: ph - 104 - 76 };
  }

  function drawLevelsCard() {
    const b = levelsBox(), pg = PAGES[levelsWorld];
    ctx.fillStyle = 'rgba(10,16,28,0.88)'; ctx.fillRect(0, 0, LW, LH);
    ctx.fillStyle = RD.SURFACE; RD.rr(ctx, b.px, b.py, b.pw, b.ph, 22); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    RD.rr(ctx, b.px, b.py, b.pw, b.ph, 22); ctx.stroke();

    // header: the world, and an arrow either side of it
    ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF'; ctx.font = '800 20px Inter, sans-serif';
    ctx.fillText(pg.name, b.px + b.pw / 2, b.py + 30);

    const got = pg.at.reduce((n, i) => n + carrotsAt(i), 0);
    ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.font = '600 14px Inter, sans-serif';
    ctx.fillText(got + ' of ' + (pg.at.length * 3) + ' carrots', b.px + b.pw / 2, b.py + 60);

    const ay = b.py + 38, ar = 17;
    const arrow = (cx, dir, live) => {
      ctx.fillStyle = live ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)';
      ctx.beginPath(); ctx.arc(cx, ay, ar, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = live ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(cx + dir * 3, ay - 6); ctx.lineTo(cx - dir * 3, ay); ctx.lineTo(cx + dir * 3, ay + 6);
      ctx.stroke();
      return { x: cx - 22, y: ay - 22, w: 44, h: 44 };   // 44px, the tap floor
    };
    levelsPrev = arrow(b.px + 36, 1, levelsWorld > 0);
    levelsNext = arrow(b.px + b.pw - 36, -1, levelsWorld < PAGES.length - 1);

    // the grid, clipped and scrollable so it survives a short screen
    const bodyY = b.py + b.header, bodyH = b.body;
    ctx.save(); ctx.beginPath(); ctx.rect(b.px, bodyY, b.pw, bodyH); ctx.clip();

    const cols = 4, gap = 10, padX = 22;
    const tw = Math.floor((b.pw - padX * 2 - gap * (cols - 1)) / cols);
    const th = Math.round(tw * 0.86);
    levelTiles = [];
    pg.at.forEach((idx, k) => {
      const cx = b.px + padX + (k % cols) * (tw + gap);
      const cy = bodyY + 6 - levelsScroll + Math.floor(k / cols) * (th + gap);
      const open = isOpen(idx), here = idx === levelIndex;
      levelTiles.push({ x: cx, y: cy, w: tw, h: th, idx, open });
      if (cy > bodyY + bodyH || cy + th < bodyY) return;   // off screen, skip the paint

      ctx.fillStyle = open ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.035)';
      RD.rr(ctx, cx, cy, tw, th, 10); ctx.fill();
      if (here) {
        ctx.strokeStyle = RD.CORAL; ctx.lineWidth = 2;
        RD.rr(ctx, cx + 1, cy + 1, tw - 2, th - 2, 9); ctx.stroke();
      }
      if (!open) { drawLock(cx + tw / 2, cy + th / 2, tw * 0.28); return; }

      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#FFFFFF'; ctx.font = '800 19px Inter, sans-serif';
      ctx.fillText(String(LEVELS[idx].n || idx + 1), cx + tw / 2, cy + th * 0.20);
      /* Big enough to READ as a carrot. At a 11px pitch three of them came out
         as slashes: the sprite is 0.63 as wide as it is tall, so a small one is
         mostly its green top. The tile has the room. */
      drawPips(cx + tw / 2 - 16, cy + th * 0.66, false, carrotsAt(idx), 5.5, 16);
    });
    const rows = Math.ceil(pg.at.length / cols);
    levelsGeom = { contentH: rows * (th + gap) + 12, viewportH: bodyH, bodyY };
    ctx.restore();

    // the same fades the rules card uses, so "there is more" reads the same way
    const max = Math.max(0, levelsGeom.contentH - bodyH);
    if (levelsScroll > 2) {
      const g = ctx.createLinearGradient(0, bodyY, 0, bodyY + 22);
      g.addColorStop(0, RD.SURFACE); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(b.px + 1, bodyY, b.pw - 2, 22);
    }
    if (levelsScroll < max - 2) {
      const g = ctx.createLinearGradient(0, bodyY + bodyH - 22, 0, bodyY + bodyH);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, RD.SURFACE);
      ctx.fillStyle = g; ctx.fillRect(b.px + 1, bodyY + bodyH - 22, b.pw - 2, 22);
    }

    levelsCTA = UI.drawCTA(ctx, 'CLOSE', b.px + b.pw / 2, b.py + b.ph - 46, '#C24A39');
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  function levelsPointerDown(p) {
    if (inBox(p, levelsCTA)) { levelsOpen = false; return; }
    if (inBox(p, levelsPrev) && levelsWorld > 0) { levelsWorld--; levelsScroll = 0; return; }
    if (inBox(p, levelsNext) && levelsWorld < PAGES.length - 1) { levelsWorld++; levelsScroll = 0; return; }
    const b = levelsBox(), bodyY = b.py + b.header;
    if (p.y > bodyY && p.y < bodyY + b.body) {
      for (const t of levelTiles) {
        if (p.x < t.x || p.x > t.x + t.w || p.y < t.y || p.y > t.y + t.h) continue;
        if (!t.open) return;                       // a locked tile is inert, not a close
        levelsOpen = false; loadLevel(t.idx); save(); return;
      }
    }
    if (p.x < b.px || p.x > b.px + b.pw || p.y < b.py || p.y > b.py + b.ph) levelsOpen = false;
  }

  /* ---------- the win card ---------- */
  let winCTA = null, winLevelsBtn = null;
  function drawWinCard() {
    const pw = Math.min(LW - 56, 470), ph = Math.min(LH - 20, 360);
    const px = Math.round((LW - pw) / 2), py = Math.max(10, Math.round((LH - ph) / 2));
    ctx.fillStyle = 'rgba(10,16,28,0.82)'; ctx.fillRect(0, 0, LW, LH);
    ctx.fillStyle = RD.SURFACE; RD.rr(ctx, px, py, pw, ph, 22); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    RD.rr(ctx, px, py, pw, ph, 22); ctx.stroke();

    const c = carrotsFor(moves);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#FFFFFF'; ctx.font = '800 34px Inter, sans-serif';
    ctx.fillText(c === 3 ? 'Perfect' : 'She made it', px + pw / 2, py + 34);
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = '600 17px Inter, sans-serif';
    ctx.fillText(moves + (moves === 1 ? ' move' : ' moves') + '   ·   par ' + par, px + pw / 2, py + 84);
    ctx.textAlign = 'left';
    drawPips(px + pw / 2 - 15, py + 128, false);

    /* Say what the run was worth AGAINST THE RECORD. A score you can go back
       for is worthless unless the game tells you when you beat it, and the old
       card said the same thing whether you had just taken three carrots off a
       level you had one on or repeated your worst run. */
    ctx.textAlign = 'center';
    let note = '', tone = 'rgba(255,255,255,0.62)';
    if (wonBeat && wonPrev) { note = 'New best, was ' + wonPrev.moves; tone = RD.SUN; }
    else if (wonBeat)       { note = c === 3 ? 'Par matched' : 'Par is ' + par; }
    else if (wonPrev)       { note = 'Your best is ' + wonPrev.moves +
                                     (wonPrev.carrots === 3 ? '' : ', par is ' + par); }
    if (note) {
      ctx.fillStyle = tone; ctx.font = '600 14px Inter, sans-serif';
      ctx.fillText(note, px + pw / 2, py + 168);
    }

    winCTA = UI.drawCTA(ctx, levelIndex + 1 < LEVELS.length ? 'NEXT LEVEL' : 'PLAY AGAIN',
                        px + pw / 2, py + ph - 116, '#C24A39');   // --accent

    /* The way back to the picker. It cannot go in the control row: at 375 that
       row already measures 315 of 375, and a fifth pill needs 408. */
    ctx.save();
    const lw = UI.pillWidth(ctx, 'Levels'), lcy = py + ph - 52;
    UI.drawPill(ctx, 'Levels', px + pw / 2, lcy, { w: lw });
    ctx.restore();
    winLevelsBtn = { x: px + pw / 2 - lw / 2, y: lcy - UI.PILL.h / 2, w: lw, h: UI.PILL.h };

    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  /* ---------- the rules card ----------
     The standard box: three zones, header and footer fixed, only the body
     scrolls, and the type never shrinks. It carries a LOOPING DEMO because the
     rule cannot be guessed from a still picture: a tile slides, his edge grows
     to touch her hole, and he crosses. */
  /* The second line used to say "tap a hole beside the bunny to hop her",
     which stopped being true the day she started going on her own, and the
     card went on saying it for several rounds. */
  /* THE CARD NAMES THIS WORLD'S HUNTER. It said "the fox" in all four, which
     is a plain untruth in three of them: the player has a shark on screen and
     is being told to watch a fox. Same reason the second line was rewritten -
     copy outlives the mechanic it describes, and nothing tests prose. */
  const HUNTER = { fox: 'fox', penguin: 'penguin', cop: 'police car', shark: 'shark' };
  const rulesNow = () => {
    const who = HUNTER[worldOf(LEVELS[levelIndex]).predator] || 'fox';
    return [
      'Drag a brick along its own length. It goes as far as the holes let it, and every square it travels costs a move.',
      'The bunny goes on her own: the moment a line of holes joins her to the carrot, she runs it.',
      'Watch where the ' + who + ' paces. Those are the holes they can already reach, and no brick will ever squash them.',
      'Join their holes to hers and they come through. Wall them in instead and they can do nothing.',
      'One brick on every board carries a bomb. Move it and it is destroyed, leaving a bigger gap than a slide would.',
    ];
  };
  let rulesGeom = null;
  function rulesBox() {
    const pw = Math.min(LW - 56, 470), ph = Math.min(LH - 20, 420);
    const px = Math.round((LW - pw) / 2), py = Math.max(10, Math.round((LH - ph) / 2));
    return { px, py, pw, ph, header: 154, footer: 98, body: ph - 154 - 98 };
  }
  function drawRulesCard(now) {
    const b = rulesBox();
    ctx.fillStyle = 'rgba(10,16,28,0.88)'; ctx.fillRect(0, 0, LW, LH);
    ctx.fillStyle = RD.SURFACE; RD.rr(ctx, b.px, b.py, b.pw, b.ph, 22); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    RD.rr(ctx, b.px, b.py, b.pw, b.ph, 22); ctx.stroke();

    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#FFFFFF'; ctx.font = '800 40px Inter, sans-serif';
    ctx.fillText('Karrots', b.px + 43, b.py + 34);
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = '600 17px Inter, sans-serif';
    ctx.fillText('Open a path. Just not for them.', b.px + 43, b.py + 34 + 54);

    // body, clipped and scrolling
    const bodyY = b.py + b.header, bodyH = b.body;
    ctx.save();
    ctx.beginPath(); ctx.rect(b.px, bodyY, b.pw, bodyH); ctx.clip();
    let y = bodyY - rulesScroll;
    // 96, not 152. The body of the standard card is 168 tall, so a taller demo
    // pushed every numbered rule below the fold and the card opened showing a
    // picture and a button. At 96 the first rule is on screen and the fade
    // says there is more, which is what the scrolling body is for.
    const demoH = 96;
    drawDemo(b.px + 43, y, b.pw - 86, demoH, now);
    y += demoH + 18;
    rulesNow().forEach((line, i) => {
      ctx.beginPath(); ctx.arc(b.px + 43, y + 11, 12, 0, Math.PI * 2);
      ctx.fillStyle = RD.CORAL; ctx.fill();
      ctx.fillStyle = RD.GROUND; ctx.font = '800 14px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.fillText(String(i + 1), b.px + 43, y + 4);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.90)'; ctx.font = '500 16px Inter, sans-serif';
      y = wrap(line, b.px + 66, y, b.pw - 100, 22) + 13;
    });
    rulesGeom = { contentH: (y + rulesScroll) - bodyY, viewportH: bodyH, bodyY };
    ctx.restore();

    // fades marking that there is more above or below
    const max = Math.max(0, rulesGeom.contentH - bodyH);
    if (rulesScroll > 1) fade(b.px, bodyY, b.pw, 20, true);
    if (rulesScroll < max - 1) fade(b.px, bodyY + bodyH - 20, b.pw, 20, false);

    rulesCTA = UI.drawCTA(ctx, 'GOT IT', b.px + b.pw / 2, b.py + b.ph - 32 - 25, '#C24A39');
  }
  let rulesCTA = null;
  function fade(x, y, w, h, top) {
    const g = ctx.createLinearGradient(x, top ? y : y + h, x, top ? y + h : y);
    g.addColorStop(0, RD.SURFACE); g.addColorStop(1, 'rgba(19,31,54,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  }
  function wrap(text, x, y, maxW, lh) {
    const words = text.split(' '); let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; }
      else line = t;
    }
    if (line) { ctx.fillText(line, x, y); y += lh; }
    return y;
  }

  /* The eight-second wordless loop, and it is a REAL BOARD.
     The first version was a hand-drawn four-by-four illustration, and every
     attempt to make it show the rule honestly ran into the same wall: a domino
     that slides one square leaves exactly as much room as it takes, so nothing
     connects unless the tile moves out of the corridor sideways. Rather than
     draw a board that could not exist, this plays a real level: it asks the
     model for a slide that actually loses, makes it, and shows what happens.
     A window of the board is drawn rather than all of it, because the card
     body is 168 tall and a whole 6x6 at that size is a postage stamp. */
  let demo = null;

  /* The nearest position, in moves from the start, at which some slide loses.
     Positions that are already lost are never walked through. */
  function nearestLosingPosition(start, budget) {
    const seen = new Set([M.key(start)]);
    let frontier = [start];
    for (let depth = 0; depth < 12 && frontier.length; depth++) {
      const next = [];
      for (const s0 of frontier) {
        const slides = M.slideMoves(s0);
        for (const mv of slides) {
          const ns = M.apply(s0, mv);
          if (M.caught(ns)) return { state: s0, mv, depth };
        }
        if (seen.size > budget) continue;
        for (const mv of M.moves(s0)) {
          const ns = M.apply(s0, mv);
          if (M.caught(ns)) continue;
          const k = M.key(ns);
          if (seen.has(k)) continue;
          seen.add(k); next.push(ns);
        }
      }
      frontier = next;
    }
    return null;
  }

  function buildDemo() {
    if (!LEVELS.length) return null;
    /* Every level has a losing slide somewhere. The one worth SHOWING is the
       one that arrives soonest and fits in the smallest window, because a
       four-by-three crop of a board reads and a six-by-six at this size does
       not. Candidates are collected and the tightest is used. */
    const cands = [];
    for (const lv of LEVELS) {
      let s0;
      try { s0 = M.parse(lv.rows, lv.id, lv.bomb ? { bombs: [lv.bomb] } : undefined); }
      catch (e) { continue; }
      /* No level can be lost on the first move - that is deliberate - so the
         position to show is a few moves in. A short breadth-first walk finds
         the nearest one that HAS a losing slide, which is also the most
         ordinary-looking one: it is the board after a couple of sensible
         moves, not a contrivance. */
      const found = nearestLosingPosition(s0, 5000);
      if (!found) continue;
      s0 = found.state;
      const fatal = found.mv;
      const after = M.apply(s0, fatal);
      // The window: everything the beat touches, padded, then squared off to
      // at least 4 x 3 so it does not read as a sliver.
      const region = M.foxRegion(after);
      const cells = [s0.bunny, s0.fox, fatal.a, fatal.b];
      for (let i = 0; i < M.N; i++) if (region[i]) cells.push(i);
      let r0 = 9, r1 = -1, c0 = 9, c1 = -1;
      cells.forEach(i => { const p = M.rc(i);
        r0 = Math.min(r0, p.r); r1 = Math.max(r1, p.r);
        c0 = Math.min(c0, p.c); c1 = Math.max(c1, p.c); });
      r0 = Math.max(0, r0 - 1); c0 = Math.max(0, c0 - 1);
      r1 = Math.min(M.R - 1, r1 + 1); c1 = Math.min(M.C - 1, c1 + 1);
      while (c1 - c0 < 3) { if (c0 > 0) c0--; else if (c1 < M.C - 1) c1++; else break; }
      while (r1 - r0 < 2) { if (r1 < M.R - 1) r1++; else if (r0 > 0) r0--; else break; }
      // If she or he has fallen outside, the window is the wrong window.
      const inWin = i => { const p = M.rc(i);
        return p.r >= r0 && p.r <= r1 && p.c >= c0 && p.c <= c1; };
      if (!inWin(s0.bunny) || !inWin(s0.fox)) continue;
      // The walk he takes once the gap is open.
      const prev = new Int16Array(M.N).fill(-1); prev[after.fox] = after.fox;
      const q = [after.fox];
      while (q.length) { const i = q.shift(); if (i === after.bunny) break;
        for (const ni of M.NB4[i]) {
          if (prev[ni] >= 0 || after.grid[ni] !== M.HOLE) continue;
          prev[ni] = i; q.push(ni); } }
      const walk = []; let cur = after.bunny;
      while (cur !== after.fox && prev[cur] >= 0) { walk.unshift(cur); cur = prev[cur]; }
      walk.unshift(after.fox);
      cands.push({ before: s0, after, mv: fatal, r0, r1, c0, c1, walk,
                   depth: found.depth, area: (r1 - r0 + 1) * (c1 - c0 + 1) });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => (a.area - b.area) || (a.depth - b.depth));
    return cands[0];
  }

  const DEMO_MS = 8000;
  function drawDemo(x, y, w, h, now) {
    if (demo === null) demo = buildDemo() || false;
    if (!demo) return;
    const cols = demo.c1 - demo.c0 + 1, rows = demo.r1 - demo.r0 + 1;
    const cell = Math.max(10, Math.floor(Math.min(w / cols, h / rows)));
    const g = {
      cols: M.C, rows: M.R, cell,
      ox: x + Math.round((w - cols * cell) / 2) - demo.c0 * cell,
      oy: y - demo.r0 * cell,
      at(i) { const p = M.rc(i); return { x: this.ox + p.c * cell, y: this.oy + p.r * cell }; },
    };
    const t = (now % DEMO_MS) / DEMO_MS;
    // beats: 0.00 rest · 0.22 the slide · 0.38 the edge reaches her · 0.56 he
    // crosses · 0.84 hold · reset
    const slid = t > 0.22;
    const state = slid ? demo.after : demo.before;
    const k = Math.max(0, Math.min(1, (t - 0.16) / 0.06));

    ctx.save();
    ctx.beginPath();
    ctx.rect(x + Math.round((w - cols * cell) / 2) - 3, y - 3, cols * cell + 6, rows * cell + 6);
    ctx.clip();

    // the window's own tray, so the crop reads as a piece of a board
    ctx.fillStyle = RD.SURFACE;
    RD.rr(ctx, g.ox + demo.c0 * cell - 3, g.oy + demo.r0 * cell - 3,
          cols * cell + 6, rows * cell + 6, 10); ctx.fill();

    for (let r = demo.r0; r <= demo.r1; r++) for (let c = demo.c0; c <= demo.c1; c++) {
      const i = M.idx(r, c);
      if (state.grid[i] === M.HOLE) RD.drawHole(ctx, g, i);
      else if (state.grid[i] === M.BRICK) RD.drawBrick(ctx, g, i);
    }
    // Once it has slid, `state` IS the position afterwards and every tile is
    // already where it belongs. Before that, the moving one is held out and
    // drawn last, part way along, the way it looks under a finger.
    for (let r = demo.r0; r <= demo.r1; r++) for (let c = demo.c0; c <= demo.c1; c++) {
      const i = M.idx(r, c);
      if (state.grid[i] !== M.HL && state.grid[i] !== M.VT) continue;
      const tl = M.tileAt(state.grid, i);
      if (!slid && tl.a === demo.mv.a && tl.b === demo.mv.b) continue;
      RD.drawTile(ctx, g, tl.a, tl.b, worldOf(LEVELS[levelIndex]));
    }
    if (!slid) {
      const d = M.DIRS[demo.mv.dir];
      RD.drawTile(ctx, g, demo.mv.a, demo.mv.b, worldOf(LEVELS[levelIndex]),
                  { dx: d.dx * cell * k, dy: d.dy * cell * k, lift: k > 0 ? cell * 0.05 : 0 });
    }

    // her, and him coming across
    const bp = g.at(state.bunny);
    if (t < 0.84) sprite('bunny-idle', bp.x + cell / 2, bp.y + cell * 0.9, cell * 0.72);
    let fi = state.fox;
    if (t > 0.56) {
      const f = Math.min(1, (t - 0.56) / 0.28) * (demo.walk.length - 1);
      fi = demo.walk[Math.min(demo.walk.length - 1, Math.round(f))];
    }
    const fp = g.at(fi);
    const rc = castOf();
    sprite(t > 0.56 && t < 0.84 ? rc.walk[0] : rc.still, fp.x + cell / 2, fp.y + cell * 0.9, cell * 0.76);
    ctx.restore();
  }

  function rulesPointerDown(p, e) {
    if (inBox(p, rulesCTA)) { rulesOpen = false; return; }
    const b = rulesBox();
    if (p.x < b.px || p.x > b.px + b.pw || p.y < b.py || p.y > b.py + b.ph) { rulesOpen = false; return; }
    void e;
  }
  canvas.addEventListener('wheel', (e) => {
    if (levelsOpen && levelsGeom) {
      e.preventDefault();
      const lmax = Math.max(0, levelsGeom.contentH - levelsGeom.viewportH);
      levelsScroll = Math.max(0, Math.min(lmax, levelsScroll + e.deltaY));
      return;
    }
    if (!rulesOpen || !rulesGeom) return;
    e.preventDefault();
    const max = Math.max(0, rulesGeom.contentH - rulesGeom.viewportH);
    rulesScroll = Math.max(0, Math.min(max, rulesScroll + e.deltaY));
  }, { passive: false });

  /* IT IS NOT DONE UNTIL SOMETHING CAN MEASURE IT. Three cards in three days
     were believed fixed and were not; each was caught by a detector on its
     first run. Test at 480x360, the smallest frame /embed/ supports, where the
     card is 340 tall and the body is 88, so it WILL scroll. */
  window.rulesFit = function () {
    const wasOpen = rulesOpen; rulesOpen = true;
    drawRulesCard(performance.now());
    rulesOpen = wasOpen;
    const b = rulesBox();
    const contentH = rulesGeom ? rulesGeom.contentH : 0;
    return {
      fits: (b.header + b.body + b.footer === b.ph) && b.py >= 0 && b.py + b.ph <= LH,
      cardH: b.ph, frameH: LH, viewportH: b.body, contentH,
      scrollMax: Math.max(0, contentH - b.body),
      overlapPx: Math.max(0, (b.py + b.ph) - LH),
    };
  };
  window.karrots = { get st() { return st; }, get moves() { return moves; },
                     get par() { return par; }, get phase() { return phase; },
                     get level() { return levelIndex; }, get pace() { return pace; }, get threat() { return threat; }, get flinch() { return flinch; }, dbg,
                     geo, load: loadLevel, M, commit };

  /* ---------- BOOT ---------- */
  function frame(now) {
    stepAnim(now);
    render(now);
    requestAnimationFrame(frame);
  }
  load();
  setCanvasVars(); resizeCanvas(); fitFullscreen(); resizeCanvas();
  layout();
  if (LEVELS.length) loadLevel(levelIndex);
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', onResize);
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  requestAnimationFrame(frame);
})();
