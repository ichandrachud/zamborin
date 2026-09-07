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
    foxEdgeMs: 400, lungeMs: 460, holdMs: 420, rewindMs: 300,
    carrot2Mult: 1.35,
    dragStart: 6,          // px before a drag picks a direction
    commitFrac: 0.42,      // share of a cell the tile must cross to land
  };

  /* ---------- SPRITES ----------
     Rasterised once by the browser from the stripped SVGs in art/. Nothing
     waits on them: the board draws without a cast and repaints as they land. */
  const ART = {};
  const ART_NAMES = ['bunny-idle', 'bunny-down-1', 'bunny-down-2', 'bunny-down-3',
    'bunny-up-1', 'bunny-up-2', 'bunny-up-3', 'bunny-side-1', 'bunny-side-2',
    'bunny-side-3', 'fox-still', 'fox-walk-1', 'fox-walk-2', 'carrot'];
  ART_NAMES.forEach(n => {
    const im = new Image();
    im.onload = () => { ART[n] = im; };
    im.src = './art/' + n + '.svg?v=1';
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
  let edge = { segs: [], t: 1 }; // the fox's reach and its sweep
  let hoverHops = 0;             // fade on the hop dots
  let rulesOpen = false, rulesScroll = 0;

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
    par = lv.par; moves = 0; history = []; phase = 'play'; anim = null; drag = null;
    rebuildEdge(1);
    T().levelStart && T().levelStart(levelIndex + 1);
    save();
  }

  function rebuildEdge(t) {
    edge = { segs: RD.foxEdgeSegments(M, st, geo), t: t === undefined ? 0 : t };
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
  const COL_W = 196;                       // the desktop ledger
  const geo = {
    cols: M.C, rows: M.R, cell: 40, ox: 0, oy: 0,
    at(i) { const p = M.rc(i); return { x: this.ox + p.c * this.cell, y: this.oy + p.r * this.cell }; },
    cellAt(x, y) {
      const c = Math.floor((x - this.ox) / this.cell), r = Math.floor((y - this.oy) / this.cell);
      return (r < 0 || c < 0 || r >= this.rows || c >= this.cols) ? -1 : M.idx(r, c);
    },
  };
  let ctrl = [];        // control row hit boxes
  let colRect = null;   // desktop ledger

  function layout() {
    const gap = 24;
    const availW = Math.max(60, LW - SIDE_PAD * 2 - (MODE === 'desktop' ? COL_W + gap : 0));
    const availH = Math.max(60, LH - topBand() - botBand());
    geo.cell = Math.max(8, Math.floor(Math.min(availW / geo.cols, availH / geo.rows)));
    const boardW = geo.cols * geo.cell, boardH = geo.rows * geo.cell;
    geo.ox = MODE === 'desktop'
      ? SIDE_PAD + Math.round((availW - boardW) / 2)
      : Math.round((LW - boardW) / 2);
    geo.oy = Math.round(topBand() + (availH - boardH) / 2);
    colRect = MODE === 'desktop'
      ? { x: SIDE_PAD + availW + gap, y: geo.oy, w: COL_W, h: boardH } : null;
    if (st) rebuildEdge(edge.t);
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

    if (M.caught(st)) {
      // He runs the path and takes her. The board showed it: the two regions
      // this move joined were both on screen before the tile landed.
      phase = 'caught';
      SND.fox();
      rebuildEdge(0);
      const path = foxPathToBunny();
      anim = { kind: 'catch', t0: performance.now(), path, mv };
      T().levelRestart && T().levelRestart(levelIndex + 1);
      return;
    }
    rebuildEdge(0);
    if (mv.type === 'hop') SND.hop(); else if (!opts.silent) SND.snap();

    if (M.won(st)) {
      phase = 'won';
      const c = carrotsFor(moves);
      const id = LEVELS[levelIndex].id;
      if (!best[id] || moves < best[id].moves) best[id] = { moves, carrots: c };
      save();
      SND.crunch(); setTimeout(SND.win, 220);
      T().levelComplete && T().levelComplete(levelIndex + 1, moves);
    }
  }

  /* The 4-connected walk he actually takes, so the catch is a journey the
     player can follow rather than a teleport. */
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
    const h = history.pop();
    st = h.state;
    // AN UNDO COSTS A MOVE. House rule from Untangle: a scored counter that
    // does not charge for undo is not counting anything.
    moves = h.moves + 1;
    rebuildEdge(0);
    SND.undo();
  }
  function restart() {
    if (anim && anim.kind === 'catch') return;
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
    if (rulesOpen) { rulesPointerDown(p, e); return; }
    for (const b of ctrl) if (inBox(p, b)) { press(b.id); return; }
    if (phase === 'won') { if (inBox(p, winCTA)) nextLevel(); return; }
    if (phase !== 'play' || anim) return;

    const i = geo.cellAt(p.x, p.y);
    if (i < 0) return;

    // A hole next to her is a hop. Everything else that is a tile is a drag.
    if (st.grid[i] === M.HOLE && M.hopMoves(st).some(m => m.to === i)) {
      commit(M.hopMoves(st).find(m => m.to === i));
      return;
    }
    const t = M.tileAt(st.grid, i);
    if (!t) return;
    canvas.setPointerCapture?.(e.pointerId);
    drag = { tile: t, x0: p.x, y0: p.y, dx: 0, dy: 0, dir: -1, moved: false };
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = toLogical(e);
    if (!drag) {
      // fade the hop dots up when the pointer is anywhere near her
      const b = geo.at(st ? st.bunny : 0);
      const near = st && Math.hypot(p.x - (b.x + geo.cell / 2), p.y - (b.y + geo.cell / 2)) < geo.cell * 2.2;
      hoverHops = near ? 1 : 0;
      return;
    }
    const rawX = p.x - drag.x0, rawY = p.y - drag.y0;
    if (drag.dir < 0) {
      if (Math.hypot(rawX, rawY) < TUNE.dragStart) return;
      // The direction is chosen once, by the dominant axis, and then held. A
      // domino can go four ways, so letting the axis flip mid-drag turns one
      // gesture into a scrub through three different moves.
      drag.dir = Math.abs(rawX) > Math.abs(rawY) ? (rawX > 0 ? 1 : 3) : (rawY > 0 ? 2 : 0);
      drag.legal = M.slideMoves(st).some(m => m.a === drag.tile.a && m.dir === drag.dir);
      if (drag.legal) drag.preview = M.apply(st, { type: 'slide', a: drag.tile.a, b: drag.tile.b, dir: drag.dir });
      else SND.refused();
      drag.moved = true;
    }
    const d = M.DIRS[drag.dir];
    // one cell of travel, and no rubber band past it: a slide is exactly one
    const along = (d.dx ? rawX * d.dx : rawY * d.dy);
    const limit = drag.legal ? geo.cell : geo.cell * 0.12;    // an illegal slide gives a little and stops
    const t = Math.max(0, Math.min(limit, along));
    drag.dx = d.dx * t; drag.dy = d.dy * t;
  });

  function endDrag() {
    if (!drag) return;
    const d = M.DIRS[drag.dir] || { dx: 0, dy: 0 };
    const along = Math.abs(drag.dx || drag.dy);
    const mv = { type: 'slide', a: drag.tile.a, b: drag.tile.b, dir: drag.dir };
    if (drag.legal && along >= geo.cell * TUNE.commitFrac) {
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
  canvas.addEventListener('pointerup', (e) => { e.preventDefault(); if (drag) endDrag(); });
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

  /* ---------- ANIMATION ---------- */
  function stepAnim(now) {
    if (edge.t < 1) edge.t = Math.min(1, edge.t + 16 / TUNE.foxEdgeMs);
    if (!anim) return;
    const el = now - anim.t0;
    if (anim.kind === 'snap' || anim.kind === 'snapback') {
      const k = Math.min(1, el / TUNE.snapMs);
      anim.k = k * k * (3 - 2 * k);
      if (k >= 1) {
        const a = anim; anim = null;
        if (a.kind === 'snap') commit(a.mv);
        else SND.refused();
      }
    } else if (anim.kind === 'catch') {
      const total = TUNE.lungeMs + TUNE.holdMs + TUNE.rewindMs;
      if (el >= total) {
        // The fatal slide rewinds and he goes back where he was. The move
        // counter KEEPS the wasted move: restart is free, this is not.
        const h = history[history.length - 1];
        if (h) { st = h.state; history.pop(); }
        phase = 'play'; anim = null; rebuildEdge(0);
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
      else if (st.grid[i] === M.BRICK) RD.drawBrick(ctx, geo, i);
    }

    RD.drawFoxEdge(ctx, edge.segs, edge.t);

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

    // If a brick is sitting ON the carrot, say so. §4.2 lets a tile pass over
    // the goal square, and level 1 opens with the carrot underneath one, which
    // without this is a level with no visible goal at all.
    if (st.grid[st.carrot] !== M.HOLE) drawCoveredCarrot();

    // what this slide would do, while it is still in the hand
    if (drag && drag.moved && heldBox) {
      const safe = drag.legal && drag.preview && !M.caught(drag.preview);
      RD.drawRing(ctx, heldBox, safe);
    }

    // where she can go
    if (phase === 'play' && !drag && hoverHops > 0)
      M.hopMoves(st).forEach(m => RD.drawHopDot(ctx, geo, m.to, 0.55 * hoverHops));

    drawFox(now);
    drawBunny(now);

    drawHUD();
    if (MODE === 'desktop') drawLedger();
    ctrl.forEach(b => {
      if (b.icon) drawSoundPill(b);
      else UI.drawPill(ctx, b.label, b.cx, b.cy, { w: b.w, dim: b.id === 'undo' && !history.length });
    });

    if (phase === 'won') drawWinCard();
    if (rulesOpen) drawRulesCard(now);
  }

  function drawCarrot() {
    const p = geo.at(st.carrot), c = geo.cell;
    if (!sprite('carrot', p.x + c / 2, p.y + c * 0.86, c * 0.66)) {
      ctx.fillStyle = '#F5A11E';
      ctx.beginPath(); ctx.moveTo(p.x + c / 2, p.y + c * 0.86);
      ctx.lineTo(p.x + c * 0.32, p.y + c * 0.30); ctx.lineTo(p.x + c * 0.68, p.y + c * 0.30);
      ctx.closePath(); ctx.fill();
    }
  }

  /* Seen through the brick: a recess under it and the carrot itself at half
     weight. Not a marker printed on the tile - the tile is a game piece and
     nothing gets drawn on top of one - but the thing itself, where it is. */
  function drawCoveredCarrot() {
    const p = geo.at(st.carrot), c = geo.cell;
    ctx.save();
    ctx.globalAlpha = 0.30; ctx.fillStyle = '#000000';
    ctx.filter = 'blur(' + Math.max(3, c * 0.09) + 'px)';
    ctx.beginPath();
    ctx.ellipse(p.x + c / 2, p.y + c * 0.60, c * 0.30, c * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.52;
    if (!sprite('carrot', p.x + c / 2, p.y + c * 0.84, c * 0.60)) {
      ctx.fillStyle = '#F5A11E';
      ctx.beginPath(); ctx.moveTo(p.x + c / 2, p.y + c * 0.84);
      ctx.lineTo(p.x + c * 0.34, p.y + c * 0.32); ctx.lineTo(p.x + c * 0.66, p.y + c * 0.32);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawBunny(now) {
    const c = geo.cell;
    let i = st.bunny, ox = 0, oy = 0, frame = 'bunny-idle', flip = false;
    if (anim && anim.kind === 'catch') { /* she stays put and he comes to her */ }
    const p = geo.at(i);
    if (!sprite(frame, p.x + c / 2 + ox, p.y + c * 0.88 + oy, c * 0.74, flip)) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(p.x + c / 2, p.y + c * 0.58, c * 0.26, 0, Math.PI * 2); ctx.fill();
    }
    void now;
  }

  function drawFox(now) {
    const c = geo.cell;
    let x, y, frame = 'fox-still', flip = false;
    if (anim && anim.kind === 'catch') {
      const el = now - anim.t0;
      const k = Math.max(0, Math.min(1, el / TUNE.lungeMs));
      const path = anim.path, f = k * (path.length - 1);
      const i0 = Math.floor(f), i1 = Math.min(path.length - 1, i0 + 1), t = f - i0;
      const a = geo.at(path[i0]), b = geo.at(path[i1]);
      x = a.x + (b.x - a.x) * t; y = a.y + (b.y - a.y) * t;
      frame = (Math.floor(el / 110) % 2) ? 'fox-walk-1' : 'fox-walk-2';
      flip = b.x < a.x;
    } else {
      const p = geo.at(st.fox); x = p.x; y = p.y;
    }
    if (!sprite(frame, x + c / 2, y + c * 0.88, c * 0.78, flip)) {
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
  function drawLedger() {
    if (!colRect) return;
    const { x, y, w } = colRect;
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillStyle = RD.INK72; ctx.font = '700 13px Inter, sans-serif';
    const earned = LEVELS.reduce((n, lv) => n + (best[lv.id] ? best[lv.id].carrots : 0), 0);
    ctx.fillText('THE WOODS', x, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = RD.SUN;
    ctx.fillText(earned + ' / ' + LEVELS.length * 3, x + w, y);
    ctx.textAlign = 'left';

    const cols = 2, cw = Math.floor((w - 10) / cols), ch = 54;
    LEVELS.forEach((lv, k) => {
      const bx = x + (k % cols) * (cw + 10), by = y + 26 + Math.floor(k / cols) * (ch + 8);
      const cur = k === levelIndex;
      ctx.fillStyle = cur ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)';
      RD.rr(ctx, bx, by, cw, ch, 10); ctx.fill();
      if (cur) {
        ctx.strokeStyle = 'rgba(255,255,255,0.40)'; ctx.lineWidth = 1.5;
        RD.rr(ctx, bx, by, cw, ch, 10); ctx.stroke();
      }
      ctx.fillStyle = RD.INK92; ctx.font = '700 15px Inter, sans-serif';
      ctx.fillText(String(lv.id), bx + 12, by + 9);
      ctx.fillStyle = RD.INK72; ctx.font = '600 12px Inter, sans-serif';
      ctx.fillText('par ' + lv.par, bx + 12, by + 30);
      const b = best[lv.id], have = b ? b.carrots : 0;
      for (let i2 = 0; i2 < 3; i2++) {
        ctx.beginPath(); ctx.arc(bx + cw - 14 - (2 - i2) * 12, by + 18, 4, 0, Math.PI * 2);
        if (i2 < have) { ctx.fillStyle = RD.SUN; ctx.fill(); }
        else { ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 1.2; ctx.stroke(); }
      }
      if (b) {
        ctx.fillStyle = RD.INK72; ctx.font = '600 12px Inter, sans-serif';
        ctx.textAlign = 'right'; ctx.fillText('best ' + b.moves, bx + cw - 10, by + 30); ctx.textAlign = 'left';
      }
    });
  }

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
    'Drag a brick one square into a hole. It leaves a hole behind it.',
    'Tap a hole beside the bunny to hop her. Reach the carrot.',
    'The coral edge is everywhere the fox can already reach.',
    'Open a gap that touches that edge and he comes through it.',
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
    const demoH = 152;
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
    /* His edge is ALWAYS on screen, before the slide as well as after it. §4.3
       is explicit that it is never toggled off, and a demo that hides it half
       the time teaches the opposite of the rule. What changes at the slide is
       that the edge SWEEPS outward into the corridor that just opened. */
    RD.drawFoxEdge(ctx, RD.foxEdgeSegments(M, state, g),
                   slid ? Math.min(1, (t - 0.24) / 0.12) : 1);
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
                     get level() { return levelIndex; }, geo, load: loadLevel, M, commit };

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
