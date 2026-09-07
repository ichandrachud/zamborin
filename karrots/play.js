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
  const MODE = (matchMedia('(pointer: coarse)').matches ||
                (window.innerWidth > 0 && window.innerWidth < 768))
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
    carrot2Mult: 1.35,
    dragStart: 5,          // px ALONG the slat's axis before it starts to follow
    commitFrac: 0.42,      // share of a cell the tile must cross to land
  };

  /* ---------- SPRITES ----------
     Rasterised once by the browser from the stripped SVGs in art/. Nothing
     waits on them: the board draws without a cast and repaints as they land. */
  const ART = {};
  const ART_NAMES = ['bunny-idle', 'bunny-down-1', 'bunny-down-2', 'bunny-down-3',
    'bunny-up-1', 'bunny-up-2', 'bunny-up-3', 'bunny-side-1', 'bunny-side-2',
    'bunny-side-3', 'fox-still', 'fox-walk-1', 'fox-walk-2', 'carrot', 'brick'];
  ART_NAMES.forEach(n => {
    const im = new Image();
    im.onload = () => { ART[n] = im; };
    im.src = './art/' + n + '.svg?v=4';
  });
  const HOP_FRAMES = {
    up:    ['bunny-up-1', 'bunny-up-2', 'bunny-up-3'],
    down:  ['bunny-down-1', 'bunny-down-2', 'bunny-down-3'],
    left:  ['bunny-side-1', 'bunny-side-2', 'bunny-side-3'],
    right: ['bunny-side-1', 'bunny-side-2', 'bunny-side-3'],
  };

  /* Draw a sprite to fit a box, keeping its aspect and standing it on the
     floor of the cell rather than centring it, which is what makes a character
     look like it is IN the hole rather than floating over it. */
  function sprite(name, cx, footY, h, flip) {
    const im = ART[name]; if (!im || !im.naturalWidth) return false;
    const w = h * (im.naturalWidth / im.naturalHeight);
    ctx.save();
    if (flip) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }
    ctx.drawImage(im, cx - w / 2, footY - h, w, h);
    ctx.restore();
    return true;
  }

  /* ---------- GAME STATE ---------- */
  const SAVE_KEY = 'zam.karrots.save';
  let levelIndex = 0;
  let st = null;                 // the live board
  let start = null;              // the level as it began, for Restart
  let par = 0;
  let moves = 0;
  let history = [];              // {state, moves} before each move, for Undo
  let best = {};                 // levelId -> {moves, carrots}
  let phase = 'play';            // play | caught | won
  let anim = null;               // the one animation in flight
  let drag = null;
  let threat = null;              // he is on his way; the board is still live
  let flinch = null;              // who just refused to be squashed, and when
  let foxGone = null;             // the beat where he is cornered and leaves
  /* Honoured, not decorated around: the edge redraws without the sweep, the
     catch is a cut and a hold, and a tile lands instead of easing. §10. */
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
  let rulesOpen = false, rulesScroll = 0;
  const dbg = { downs: 0, captureFailed: 0, moves: 0, ups: 0, committed: 0, refused: 0 };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
      if (typeof raw.level === 'number') levelIndex = Math.min(Math.max(0, raw.level), LEVELS.length - 1);
      if (raw.best && typeof raw.best === 'object') best = raw.best;
    } catch (e) { /* a blocked or full store is not a reason to fail to start */ }
  }
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ level: levelIndex, best }));
    } catch (e) { /* see load() */ }
  }

  function loadLevel(i) {
    levelIndex = Math.min(Math.max(0, i), LEVELS.length - 1);
    const lv = LEVELS[levelIndex];
    start = M.parse(lv.rows, lv.id, lv.carrotAt ? { carrotAt: lv.carrotAt } : undefined);
    st = M.clone(start);
    par = lv.par; moves = 0; history = []; phase = 'play'; anim = null; drag = null; threat = null; foxGone = null;
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

  /* THE PHONE PLAYS THE SAME BOARD TURNED A QUARTER TURN. The model is always
     nine wide and six tall, which is the shape of the 760x600 desktop frame.
     A portrait phone gets the transpose - six wide, nine tall - so the SAME
     level, the same par and the same solution work in both, because a
     transposed sliding puzzle is the same puzzle. Turning it is cheaper than
     keeping two level sets, and far cheaper than being wrong about one. */
  const TURNED = (MODE === 'mobile');
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
  const DIR_FROM_SCREEN = TURNED ? [3, 2, 1, 0] : [0, 1, 2, 3];
  let ctrl = [];

  function layout() {
    const availW = Math.max(60, LW - SIDE_PAD * 2);
    const availH = Math.max(60, LH - topBand() - botBand());
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

  function commit(mv, opts) {
    opts = opts || {};
    history.push({ state: M.clone(st), moves });
    const next = M.apply(st, mv);
    moves++;
    st = next;

    /* HE DOES NOT TAKE HER THE INSTANT THE GAP OPENS. He sets off, and the
       walk takes a couple of seconds, and until he arrives the board is still
       live: undo it, or slide something else, and the path closes and he goes
       home. A slat pushed the wrong way by mistake should be a moment of
       fright and a chance to fix it, not a loss with no answer to it.
       The fail state is intact - stop watching and he still takes her - and
       the escape is not free either, because undo costs a move. */
    if (M.caught(st)) {
      SND.fox();
      threat = { t0: performance.now(), path: foxPathToBunny() };
      return;
    }
    if (threat) threat = null;                  // that slide closed the path
    // Cornered: a slat has taken the last hole he had and he is out for good.
    if (M.buried(st) && !foxGone) { foxGone = { t0: performance.now(), cell: st.fox }; SND.fox(); }
    if (!M.buried(st)) foxGone = null;          // an undo can put him back
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
      const id = LEVELS[levelIndex].id;
      if (!best[id] || moves < best[id].moves) best[id] = { moves, carrots: c };
      save();
      SND.crunch(); setTimeout(SND.win, 220);
      T().levelComplete && T().levelComplete(levelIndex + 1, moves);
    }
  }

  /* The 4-connected walk between two holes, so both the catch and her run to
     the carrot are journeys the player can follow rather than teleports. */
  function pathThroughHoles(from, to) {
    const prev = new Int16Array(M.N).fill(-1);
    const q = [from]; prev[from] = from;
    while (q.length) {
      const i = q.shift();
      if (i === to) break;
      for (const ni of M.NB4[i]) {
        if (prev[ni] >= 0 || st.grid[ni] !== M.HOLE) continue;
        prev[ni] = i; q.push(ni);
      }
    }
    const path = []; let cur = to;
    while (cur !== from && prev[cur] >= 0) { path.unshift(cur); cur = prev[cur]; }
    path.unshift(from);
    return path;
  }

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
        if (prev[ni] >= 0 || st.grid[ni] !== M.HOLE) continue;
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
    if (!M.buried(st)) foxGone = null;
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

  canvas.addEventListener('pointerdown', (e) => {
    SND.ready();
    const p = toLogical(e);
    dbg.lastDown = { x: Math.round(p.x), y: Math.round(p.y), why: 'reached' };
    if (rulesOpen) { dbg.lastDown.why = 'rules card open'; rulesPointerDown(p, e); return; }
    for (const b of ctrl) if (inBox(p, b)) { dbg.lastDown.why = 'control ' + b.id; press(b.id); return; }
    if (phase === 'won') { dbg.lastDown.why = 'win card'; if (inBox(p, winCTA)) nextLevel(); return; }
    /* A snap or a snapback lasts 90ms, and a press arriving inside it used to
       be dropped on the floor - so a quick second try after a refused drag did
       nothing at all. Finish the little animation instead and take the press. */
    if (anim && (anim.kind === 'snap' || anim.kind === 'snapback')) {
      const a = anim; anim = null;
      if (a.kind === 'snap') commit(a.mv);
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
    drag = { tile: t, x0: p.x, y0: p.y, dx: 0, dy: 0, dir: -1, screenDir: -1,
             axisIsX: (t.horiz !== TURNED), moved: false };
    dbg.downs++;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { dbg.captureFailed++; }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = toLogical(e);
    if (!drag) return;
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
      drag.dir = DIR_FROM_SCREEN[screenDir];
      drag.legal = M.slideMoves(st).some(m => m.a === drag.tile.a && m.dir === drag.dir);
      drag.preview = drag.legal
        ? M.apply(st, { type: 'slide', a: drag.tile.a, b: drag.tile.b, dir: drag.dir })
        : null;
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
    }
    const sd = M.DIRS[screenDir];
    // one cell of travel, and no rubber band past it: a slide is exactly one
    const limit = drag.legal ? geo.cell : geo.cell * 0.12;   // blocked: gives a little and stops
    const t = Math.min(limit, Math.abs(along));
    drag.dx = sd.dx * t; drag.dy = sd.dy * t;
  });

  function endDrag() {
    if (!drag) return;
    const d = M.DIRS[drag.screenDir] || { dx: 0, dy: 0 };   // screen space: this is the drawing
    const along = Math.abs(drag.dx || drag.dy);
    const mv = { type: 'slide', a: drag.tile.a, b: drag.tile.b, dir: drag.dir };
    dbg.lastEnd = { legal: !!drag.legal, along: Math.round(along), need: Math.round(geo.cell * TUNE.commitFrac),
                    dir: drag.dir, screenDir: drag.screenDir, moved: drag.moved };
    if (drag.legal && along >= geo.cell * TUNE.commitFrac) {
      dbg.committed++;
      // snap the last few pixels home, then the move lands
      anim = { kind: 'snap', t0: performance.now(), mv,
               from: { dx: drag.dx, dy: drag.dy }, to: { dx: d.dx * geo.cell, dy: d.dy * geo.cell },
               tile: drag.tile };
    } else if (along > 0) {
      anim = { kind: 'snapback', t0: performance.now(),
               from: { dx: drag.dx, dy: drag.dy }, to: { dx: 0, dy: 0 }, tile: drag.tile };
    }
    drag = null;
  }
  canvas.addEventListener('pointerup', (e) => { e.preventDefault(); dbg.ups++; if (drag) endDrag(); });
  canvas.addEventListener('pointercancel', () => { drag = null; });
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
    if (e.key === 'Escape' && rulesOpen) { rulesOpen = false; return; }
    if (e.key.toLowerCase() === 'u') undo();
    if (e.key.toLowerCase() === 'r') restart();
    if (phase === 'won' && (e.key === 'Enter' || e.key === ' ')) nextLevel();
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

  function snapPaceHome(now) {
    for (const who of ['bunny', 'fox']) {
      const home = who === 'bunny' ? st.bunny : st.fox;
      pace[who] = { at: home, from: home, to: home, t0: now, ms: WANDER.step, path: [], idx: 0 };
    }
  }

  /* The cell of `cell`'s pocket that is furthest from it, and the walk there. */
  function patrolTo(cell) {
    const prev = new Int16Array(M.N).fill(-1), dist = new Int16Array(M.N).fill(-1);
    const q = [cell]; prev[cell] = cell; dist[cell] = 0;
    let far = cell;
    while (q.length) {
      const i = q.shift();
      if (dist[i] > dist[far]) far = i;
      for (const ni of M.NB4[i]) {
        if (prev[ni] >= 0 || st.grid[ni] !== M.HOLE || ni === st.carrot) continue;
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

  function stepPace(now) {
    if (!st || REDUCED.matches) return;
    for (const who of ['bunny', 'fox']) {
      if (who === 'fox' && M.buried(st)) continue;      // he is not there any more
      const anchor = who === 'bunny' ? st.bunny : st.fox;
      let w = pace[who];
      if (!w) w = pace[who] = { at: anchor, from: anchor, to: anchor, t0: now,
                                ms: WANDER.step, path: [], idx: 0 };
      // A slat can land on the square they had walked to. Put them back on the
      // cell the model has them in and start again from there.
      if (st.grid[w.to] !== M.HOLE || st.grid[w.from] !== M.HOLE) {
        Object.assign(w, { at: anchor, from: anchor, to: anchor, t0: now, path: [], idx: 0 });
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
      if (w.idx < w.path.length) {                    // keep walking the line
        w.from = w.at; w.to = w.path[w.idx++]; w.t0 = now; continue;
      }
      const path = patrolTo(w.at);                    // reached the end: turn round
      if (!path.length) { w.t0 = now; continue; }
      w.path = path; w.idx = 0;
      w.from = w.at; w.to = w.path[w.idx++]; w.t0 = now;
    }
  }

  /* A short recoil for whoever just refused to be squashed: back away from the
     slat, then settle. 380ms, and it never moves them off their own square. */
  const FLINCH_MS = 380;
  function flinchOffset(cell, now) {
    if (!flinch || flinch.cell !== cell) return null;
    const k = (now - flinch.t0) / FLINCH_MS;
    if (k >= 1) { flinch = null; return null; }
    const kick = Math.sin(k * Math.PI) * geo.cell * 0.16;
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
    const k = Math.max(0, Math.min(1, (now - w.t0) / (w.ms || WANDER.step)));
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
        if (a.kind === 'snap') commit(a.mv);
        else SND.refused();
      }
    } else if (anim.kind === 'run') {
      const per = 150;                                   // ms per square, quick
      if (el >= anim.path.length * per) {
        anim = null; phase = 'won';
        const c = carrotsFor(moves);
        const id = LEVELS[levelIndex].id;
        if (!best[id] || moves < best[id].moves) best[id] = { moves, carrots: c };
        save();
        SND.crunch(); setTimeout(SND.win, 220);
        T().levelComplete && T().levelComplete(levelIndex + 1, moves);
      }
    } else if (anim.kind === 'catch') {
      const total = REDUCED.matches ? TUNE.holdMs
                                    : TUNE.lungeMs + TUNE.holdMs + TUNE.rewindMs;
      if (el >= total) {
        // The fatal slide rewinds and he goes back where he was. The move
        // counter KEEPS the wasted move: restart is free, this is not.
        const h = history[history.length - 1];
        if (h) { st = h.state; history.pop(); }
        phase = 'play'; anim = null;
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

    const world = RD.WORLDS.woods;
    RD.drawTray(ctx, geo);

    // holes and bricks first: they are the floor everything else sits on
    for (let i = 0; i < M.N; i++) {
      if (st.grid[i] === M.HOLE) RD.drawHole(ctx, geo, i);
      else if (st.grid[i] === M.BRICK) RD.drawBrick(ctx, geo, i, ART['brick']);
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
    }
    if (held) {
      let dx = 0, dy = 0, lift = 0;
      if (drag) { dx = drag.dx; dy = drag.dy; lift = geo.cell * 0.05; }
      else if (anim && anim.k !== undefined) {
        dx = anim.from.dx + (anim.to.dx - anim.from.dx) * anim.k;
        dy = anim.from.dy + (anim.to.dy - anim.from.dy) * anim.k;
        lift = geo.cell * 0.05 * (1 - anim.k);
      }
      heldBox = RD.drawTile(ctx, geo, held.a, held.b, world, { dx, dy, lift });
    }

    // what this slide would do, while it is still in the hand
    if (drag && drag.moved && heldBox) {
      const safe = drag.legal && drag.preview && !M.caught(drag.preview);
      RD.drawRing(ctx, heldBox, safe);
    }

    drawFox(now);
    drawBunny(now);

    drawHUD();
    ctrl.forEach(b => {
      if (b.icon) drawSoundPill(b);
      else UI.drawPill(ctx, b.label, b.cx, b.cy, { w: b.w, dim: b.id === 'undo' && !history.length });
    });

    if (phase === 'won') drawWinCard();
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

  function drawBunny(now) {
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
    const drew = sprite(frame, w.x + c / 2, w.y + c * 0.90, c * 0.76, flip);
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
    sprite(frame, x + c / 2, y + c * 0.90, c * 0.76, Math.abs(dx) > Math.abs(dy) && dx < 0);
  }

  /* Cornered, and leaving. A short shrink and fade on the square that took
     him, then nothing: the board simply has no fox on it. */
  const GONE_MS = 460;
  function drawFox(now) {
    if (M.buried(st)) {
      if (!foxGone) return;                             // already gone, long since
      const k = (now - foxGone.t0) / GONE_MS;
      if (k >= 1) return;
      const p = geo.at(foxGone.cell), c = geo.cell;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      const sc = 1 - k * 0.45;
      ctx.translate(p.x + c / 2, p.y + c * 0.9);
      ctx.scale(sc, sc);
      ctx.translate(-(p.x + c / 2), -(p.y + c * 0.9));
      sprite('fox-still', p.x + c / 2, p.y + c * 0.9, c * 0.8, false);
      ctx.restore();
      return;
    }
    drawFoxLive(now);
  }

  function drawFoxLive(now) {
    const c = geo.cell;
    let x, y, frame = 'fox-still', flip = false;
    if (threat || (anim && anim.kind === 'catch')) {
      const t0 = threat ? threat.t0 : anim.t0;
      const span = threat ? TUNE.graceMs : TUNE.lungeMs;
      const path = threat ? threat.path : anim.path;
      const el = now - t0;
      // Reduced motion: he is simply THERE, beside her, and the board holds.
      const k = REDUCED.matches ? 1 : Math.max(0, Math.min(1, el / span));
      const f = k * (path.length - 1);
      const i0 = Math.floor(f), i1 = Math.min(path.length - 1, i0 + 1), tt = f - i0;
      const a = geo.at(path[i0]), b = geo.at(path[i1]);
      x = a.x + (b.x - a.x) * tt; y = a.y + (b.y - a.y) * tt;
      frame = (Math.floor(el / 150) % 2) ? 'fox-walk-1' : 'fox-walk-2';
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
      if (w.moving) frame = (Math.floor(w.k * 2) % 2) ? 'fox-walk-2' : 'fox-walk-1';
    }
    const fl2 = flinchOffset(st.fox, now);
    if (fl2) { ctx.save(); ctx.translate(0, -fl2.d); }
    const drewFox = sprite(frame, x + c / 2, y + c * 0.90, c * 0.80, flip);
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
      ctx.fillText(RD.WORLDS.woods.name + '  ·  LEVEL ' + lv.id, LW - SIDE_PAD, 24);
      drawPips(LW - SIDE_PAD, 46, true);
    } else {
      ctx.textAlign = 'right';
      ctx.fillStyle = RD.INK72; ctx.font = '600 ' + Math.round(16 * hs) + 'px Inter, sans-serif';
      const line = RD.WORLDS.woods.name + '   ·   LEVEL ' + lv.id +
                   '   ·   MOVES ' + moves + '   ·   PAR ' + par;
      let f = 16;
      while (f > 11 && ctx.measureText(line).width > LW - SIDE_PAD - readoutMinX) {
        f -= 1; ctx.font = '600 ' + f + 'px Inter, sans-serif';
      }
      ctx.fillText(line, LW - SIDE_PAD, topBand() / 2);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  /* Three pips that say what finishing RIGHT NOW would be worth. The stake is
     a live number, not something revealed after the fact. */
  function drawPips(rightX, y, rightAligned) {
    const have = carrotsFor(moves), r = 5, gap = 15;
    for (let k = 0; k < 3; k++) {
      const x = rightAligned ? rightX - (2 - k) * gap : rightX + k * gap;
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

  /* The desktop side column carries the world's page as a live carrot ledger.
     It shows only what the player has already done, so it is a record and not
     an advantage. */
  /* ---------- the win card ---------- */
  let winCTA = null;
  function drawWinCard() {
    const pw = Math.min(LW - 56, 470), ph = Math.min(LH - 20, 300);
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
    drawPips(px + pw / 2 - 15, py + 132, false);
    winCTA = UI.drawCTA(ctx, levelIndex + 1 < LEVELS.length ? 'NEXT LEVEL' : 'PLAY AGAIN',
                        px + pw / 2, py + ph - 60, '#C24A39');   // --accent
    ctx.textBaseline = 'top';
  }

  /* ---------- the rules card ----------
     The standard box: three zones, header and footer fixed, only the body
     scrolls, and the type never shrinks. It carries a LOOPING DEMO because the
     rule cannot be guessed from a still picture: a tile slides, his edge grows
     to touch her hole, and he crosses. */
  const RULES = [
    'Drag a brick along its own length, one square into a hole. A brick lying flat goes left and right; a standing one goes up and down.',
    'Tap a hole beside the bunny to hop her. Reach the carrot.',
    'Watch where the fox paces. Those are the holes he can already reach.',
    'Open a gap that joins his holes to hers and he comes through it.',
  ];
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
    ctx.fillText('Open a path. Just not for him.', b.px + 43, b.py + 34 + 54);

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
    RULES.forEach((line, i) => {
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
      try { s0 = M.parse(lv.rows, lv.id, lv.carrotAt ? { carrotAt: lv.carrotAt } : undefined); }
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
      RD.drawTile(ctx, g, tl.a, tl.b, RD.WORLDS.woods);
    }
    if (!slid) {
      const d = M.DIRS[demo.mv.dir];
      RD.drawTile(ctx, g, demo.mv.a, demo.mv.b, RD.WORLDS.woods,
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
    sprite(t > 0.56 && t < 0.84 ? 'fox-walk-1' : 'fox-still', fp.x + cell / 2, fp.y + cell * 0.9, cell * 0.76);
    ctx.restore();
  }

  function rulesPointerDown(p, e) {
    if (inBox(p, rulesCTA)) { rulesOpen = false; return; }
    const b = rulesBox();
    if (p.x < b.px || p.x > b.px + b.pw || p.y < b.py || p.y > b.py + b.ph) { rulesOpen = false; return; }
    void e;
  }
  canvas.addEventListener('wheel', (e) => {
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
