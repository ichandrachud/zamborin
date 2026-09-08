/* ============================================================
   Lift · A Zamborin Game — M1

   THE CAR IS HEAVY. Drag it in the shaft and it lags behind your hand; let go
   and it keeps going, braking over most of a floor from full speed. Land it
   level with a landing and the doors slide, warm light floods the landing, and
   whoever is standing there gets in. Land it between floors and it bumps, sags
   two pixels and sits there with the doors shut until you nudge it.

   M1 is the building, the car, the stop, the doors, the light, one person at a
   time, and tips. There are no patience rings, no quits and no shift yet: they
   are M2, and until they exist this build cannot be lost. That is the
   milestone, not the design.

   The rules and the numbers live in model.js, which the headless gate also
   loads, so the harness is arguing with the same car the player is.
   ============================================================ */
(() => {
  'use strict';

  const M = window.LiftModel;
  const F = M.TUNE;

  /* ---------- MODE ----------
     A browser can report a 0-wide viewport on the first frame. The obvious
     `innerWidth < 768` then reads as a phone, MODE is locked for the session,
     and a desktop player is left on the phone layout for good. Zero means "not
     measured yet", so it must not count as narrow. And a narrow frame is not a
     phone if it is lying down: the width test on its own handed the mobile
     chrome to a 480x360 embed, whose bands then ate 160 of its 360 pixels. */
  const PORTRAITISH = window.innerHeight >= window.innerWidth;
  const MODE = (matchMedia('(pointer: coarse)').matches ||
                (window.innerWidth > 0 && window.innerWidth < 768 && PORTRAITISH))
    ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);

  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    fitFullscreen(); resizeCanvas(); layout(); render(performance.now());
  }

  /* ---------- AUDIO ---------- */
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zam.lift.sfx' }) : null;

  /* ---------- BUTTONS ---------- */
  const UI = window.ZAM_UI;

  /* ---------- ANALYTICS ---------- */
  const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){}, levelRestart(){}, hintUsed(){}, track(){} };
  const T = () => (window.ZAM_TRACK || NOOP);
  T().init('lift');
  /* A stop every three to five seconds is a lot of events for a quota the
     whole fleet shares. The detail is only wanted from the start of a session
     anyway, which is where the stranger test lives. */
  const STOP_EVENT_CAP = 40;

  /* ---------- COLOUR ----------
     Chrome takes tokens (shared/tokens.css) and nothing else. The hotel is
     game art and carries its own palette, from the brief section 10. Canvas
     cannot read CSS variables, so this is the one place they are restated. */
  const GROUND = '#0E1726';                    // --bg
  const SURFACE = '#131F36';                   // --bg-card
  const RAISED = '#1A2A45';                    // --bg-panel
  const INK72 = 'rgba(255,255,255,0.72)';
  const CORAL = '#C24A39';                     // --accent

  const SHELL_TOP = '#1C2233', SHELL_BOT = '#12172A';
  const ROOM_A = '#1E2640', ROOM_B = '#1A2138';
  const SLAB = 'rgba(255,255,255,0.06)';
  const LAMP = '#FFD98A';
  const CARPET = '#7A3A3A';
  const SHAFT = '#0B1020', CABLE = 'rgba(255,255,255,0.08)';
  const LOCKED = 'rgba(200,215,240,0.25)';
  const CAR_HI = '#FFD98A', CAR_MID = '#E8B44C', CAR_LO = '#C9861E';
  const CAR_BEVEL = 'rgba(255,255,255,0.35)';
  const CAR_IN = '#FFE8B0', HEAD_WARM = '#FFF4E6';
  const CALL_LIT = '#FFD24C', CALL_UNLIT = 'rgba(255,255,255,0.12)';
  const BODY_HI = '#8FA6C8', BODY_LO = '#4E6488', HEAD = '#C9D6F0';
  /* Floor numerals and the destination chip. Both are sampled in the contrast
     sweep: the numeral against the darker of the two room fills, the chip
     numeral against the chip. */
  const FLOOR_NUM = 'rgba(201,214,240,0.62)';
  const CHIP_FILL = '#FFE8B0', CHIP_INK = '#1A2138';

  /* ---------- LAYOUT ----------
     One top band, both modes: controls sit left in it on desktop, in a bottom
     row on a phone, and the read-out sits right in it either way.

     The hotel is cut open. On the desktop frame the rooms take both outsides
     and the two shafts run down the middle, which is what fills a 760x600
     landscape frame with something real rather than two gutters. A phone has
     no room for the far side, so it gets rooms, the working shaft right of
     centre - so a thumb on the cable never covers the landing it is serving -
     and the promise of the second shaft at the edge. */
  const SIDE_PAD = 30;
  const topBand = () => (MODE === 'mobile' ? 64 : 56);
  const botBand = () => (MODE === 'mobile' ? 96 : 20);
  const buildPad = () => (MODE === 'mobile' ? 12 : SIDE_PAD);
  /* A phone reserves a lane under the building for one line of status. In M1
     that is the late hint; at M2 it is where the decision cue pill goes. The
     desktop frame has no spare height for it - 7 floors at 74 leaves 6px - so
     there the hint goes in the gap the top band already has between the
     control row and the read-out. */
  /* A short frame does not get the lane. At 480x360, the smallest frame the
     embed supports, a 64px band, a 96px control row and a 26px lane leave 174
     pixels for seven floors and the building ran 11px past both bands. */
  const statusLane = () => (MODE === 'mobile' && LH >= 560 ? 26 : 0);

  const geo = {
    floorPx: 74, shaftW: 64, carW: 54, carH: 62,
    x: 0, y: 0, w: 0, h: 0,
    land1X: 0, land1W: 0, shaft1X: 0, shaft2X: 0, shaft2W: 0, land2X: 0, land2W: 0,
  };
  let ctrl = [], readoutMinX = SIDE_PAD;

  function layout() {
    const availW = Math.max(80, LW - buildPad() * 2);
    const availH = Math.max(80, LH - topBand() - botBand() - statusLane());
    const maxFloor = MODE === 'mobile' ? 84 : 76;
    /* No minimum that the frame cannot pay for. A 28px floor was held even
       where seven of them did not fit, and the building simply overflowed. */
    geo.floorPx = Math.max(16, Math.min(maxFloor, Math.floor(availH / F.floors)));
    geo.shaftW = Math.max(18, Math.min(84, Math.round(geo.floorPx * 0.86)));
    geo.h = geo.floorPx * F.floors;
    geo.shaft2W = geo.shaftW;
    /* A room is a room, not a letterbox. Given the whole width a small frame
       drew 404x28 landings, fourteen times as wide as they were tall, so the
       landing is capped against the floor height and the building comes out
       narrower than the frame rather than stretched across it. */
    const shafts = geo.shaftW + geo.shaft2W;
    const landCap = geo.floorPx * 6;
    if (MODE === 'mobile') {
      geo.land1W = Math.max(40, Math.min(availW - shafts, landCap));
      geo.land2W = 0;
      geo.w = geo.land1W + shafts;
      geo.x = Math.round((LW - geo.w) / 2);
      geo.land1X = geo.x;
      geo.shaft1X = geo.x + geo.land1W;
      geo.shaft2X = geo.shaft1X + geo.shaftW;
      geo.land2X = 0;
    } else {
      const each = Math.max(40, Math.min(Math.floor((availW - shafts) / 2), landCap));
      geo.land1W = each; geo.land2W = each;
      geo.w = each * 2 + shafts;
      geo.x = Math.round((LW - geo.w) / 2);
      geo.land1X = geo.x;
      geo.shaft1X = geo.x + geo.land1W;
      geo.shaft2X = geo.shaft1X + geo.shaftW;
      geo.land2X = geo.shaft2X + geo.shaft2W;
    }
    geo.y = Math.round(topBand() + (availH - geo.h) / 2);
    geo.carW = Math.max(18, Math.round(geo.shaftW - 10));
    geo.carH = Math.max(20, Math.round(geo.floorPx - 12));
    layoutControls();
  }

  /* The slab of floor f: the surface the car's floor lines up with, and the
     surface people stand on. Floor 1 is the lobby, at the bottom. */
  const slabY = (f) => geo.y + (F.floors - f + 1) * geo.floorPx;
  const roomTop = (f) => slabY(f) - geo.floorPx;

  /* Order is fixed: sound, Undo, Restart, Hint, Rules. M1 has no undo and no
     hint, so they are simply absent and the others do not move to fill in. */
  function layoutControls() {
    const items = [{ id: 'sound', icon: true }, { id: 'restart', label: 'Restart' }, { id: 'rules', label: 'Rules' }];
    ctx.save();
    let total = 0;
    items.forEach(it => { it.w = it.icon ? UI.PILL.iconW : UI.pillWidth(ctx, it.label); total += it.w; });
    total += UI.PILL.gap * (items.length - 1);
    ctx.restore();
    const cy = MODE === 'mobile' ? LH - 74 : topBand() / 2;
    let x = MODE === 'mobile' ? Math.round((LW - total) / 2) : SIDE_PAD;
    ctrl = items.map(it => {
      const box = { id: it.id, label: it.label, icon: it.icon, x, y: Math.round(cy - UI.PILL.h / 2), w: it.w, h: UI.PILL.h, cx: x + it.w / 2, cy };
      x += it.w + UI.PILL.gap;
      return box;
    });
    /* The control row and the read-out lay out from opposite ends of the same
       band and nothing else checks whether they meet. Desktop is the only mode
       where they share it, so measure there and give the read-out what is left. */
    readoutMinX = MODE === 'desktop' ? x + 16 : SIDE_PAD;
  }

  /* ---------- STATE ---------- */
  const car = { y: 1, v: 0 };
  let phase = 'drive';            // 'drive' | 'serve'
  let serveT = 0, serveFloor = 1, serveDrop = false, serveBoard = false, didDrop = false, didBoard = false;
  let doorOpen = 0;               // 0 shut, 1 wide
  let settleT = 0, settleDir = 1; // the two-frame overshoot on a level stop
  let sag = 0, bumpT = 0;         // the unlevel stop, and how long it has sat
  let departed = false;           // has the car actually gone anywhere since the last stop
  let smoothArmed = true, armY = 1;
  let waiting = null;             // { floor, dest }  — one person at a time in M1
  let rider = null;               // { dest }
  let tips = 0, busStops = 0, smoothStops = 0, stopEvents = 0;
  let spawnAt = 0, tNow = 0;      // seconds of play, not wall clock
  let flies = [];                 // the tips flying to the counter
  let firstLevelAt = 0;           // when the player first landed one, for the late hint
  let handlePulse = 0;
  let rng = M.makeRng(1);
  let rulesOpen = false, rulesScroll = 0;

  function reset() {
    car.y = 1; car.v = 0;
    phase = 'drive'; doorOpen = 0; settleT = 0; sag = 0; bumpT = 0; departed = false;
    smoothArmed = true; armY = 1;
    rider = null; tips = 0; busStops = 0; smoothStops = 0;
    flies = []; tNow = 0; firstLevelAt = 0; handlePulse = 0;
    rng = M.makeRng(1);
    /* The first screen, exactly as the brief describes it: the car in the
       lobby and one person on the third floor who wants the lobby. Two stops,
       both short, and the first doors-open inside a few seconds. */
    waiting = { floor: 3, dest: 1 };
    spawnAt = 0;
  }

  function spawn() {
    const here = Math.round(car.y);
    let f = 1 + Math.floor(rng() * F.floors);
    /* Never on the floor the car is already at. A person who appears under the
       open doors is a delivery with no drive in it, and the drive is the game. */
    if (f === here) f = 1 + ((f) % F.floors);
    let d = 1 + Math.floor(rng() * (F.floors - 1));
    if (d >= f) d++;
    waiting = { floor: f, dest: d };
  }

  /* ---------- INPUT ---------- */
  let dragging = false, dragV = 0, dragLastY = 0, dragLastT = 0;
  let keyDir = 0;

  function toLocal(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (LW / rect.width),
      y: (e.clientY - rect.top) * (LH / rect.height),
    };
  }
  function hitCtrl(x, y) {
    return ctrl.find(c => x >= c.x - 6 && x <= c.x + c.w + 6 && y >= c.y - 8 && y <= c.y + c.h + 8) || null;
  }
  /* The whole shaft is the handle, not just the car. There is nothing else in
     the shaft, grabbing the cable is the same gesture as grabbing the car, and
     a thumb does not have to find a 60px box first. */
  function inGrab(x, y) {
    const pad = MODE === 'mobile' ? 26 : 18;
    return x >= geo.shaft1X - pad && x <= geo.shaft1X + geo.shaftW + pad &&
           y >= geo.y - 12 && y <= geo.y + geo.h + 12;
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (sfx) sfx.ensureAudio();
    const p = toLocal(e);
    if (rulesOpen) { onRulesPointer(p, e); return; }
    const c = hitCtrl(p.x, p.y);
    if (c) { onCtrl(c.id); return; }
    if (phase === 'serve') return;            // never steer with the doors open
    if (!inGrab(p.x, p.y)) return;
    /* Seed the target with the speed the car already has. A long trip needs
       more than one thumb-length of screen, so it is taken in two or three
       gestures; starting each one from a target of zero braked the car at
       aMax, which is HARDER than letting go, and made re-grabbing cost speed.
       Lifting your thumb to take a fresh grip should cost nothing. */
    dragging = true; dragV = car.v; dragLastY = p.y; dragLastT = performance.now();
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = toLocal(e);
    const now = performance.now();
    const dt = Math.max(0.008, (now - dragLastT) / 1000);
    /* THE HAND'S VELOCITY IS THE TARGET. Screen y grows downward and floors
       grow upward, hence the sign. Smoothed, because a raw pointer delta is
       noisy enough to make the car buzz. */
    const raw = -(p.y - dragLastY) / geo.floorPx / dt;
    dragV = dragV * 0.55 + raw * 0.45;
    dragLastY = p.y; dragLastT = now;
  });
  function endDrag() { dragging = false; dragV = 0; }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w') { keyDir = 1; e.preventDefault(); }
    else if (e.key === 'ArrowDown' || e.key === 's') { keyDir = -1; e.preventDefault(); }
    else if (e.key === 'Escape' && rulesOpen) { rulesOpen = false; }
    else return;
    if (sfx) sfx.ensureAudio();
  });
  window.addEventListener('keyup', (e) => {
    if ((e.key === 'ArrowUp' || e.key === 'w') && keyDir === 1) keyDir = 0;
    if ((e.key === 'ArrowDown' || e.key === 's') && keyDir === -1) keyDir = 0;
  });

  function onCtrl(id) {
    if (id === 'sound') { if (sfx) sfx.setOn(!sfx.isOn()); return; }
    if (id === 'restart') { reset(); T().levelRestart(1); return; }
    if (id === 'rules') { rulesOpen = !rulesOpen; rulesScroll = 0; return; }
  }

  /* ---------- THE CAR ---------- */
  function step(dt) {
    tNow += dt;
    stepFlies(dt);
    if (settleT > 0) settleT = Math.max(0, settleT - dt / 0.16);
    if (bumpT > 0) bumpT = Math.max(0, bumpT - dt / 0.20);
    if (handlePulse > 0) handlePulse = Math.max(0, handlePulse - dt / 1.4);

    if (phase === 'serve') { stepServe(dt); return; }

    if (waiting === null && rider === null && spawnAt > 0 && tNow >= spawnAt) { spawn(); spawnAt = 0; }

    let input;
    if (dragging) {
      /* A finger that has stopped moving is asking for a stop, not for the
         speed it last had. */
      const age = Math.max(0, (performance.now() - dragLastT) / 1000 - 0.06);
      input = { mode: 'drag', targetV: dragV * Math.exp(-age * 12) };
    } else if (keyDir) {
      input = { mode: 'key', dir: keyDir };
    } else {
      input = { mode: 'free' };
    }

    const before = car.v;
    const r = M.stepCar(car, dt, input, F);
    if (Math.abs(car.v) > 0.02) departed = true;
    if (!smoothArmed && Math.abs(car.y - armY) >= 0.75) smoothArmed = true;

    if (departed && !dragging && !keyDir && Math.abs(car.v) < 1e-6) onStopped(before, r === 'end');
  }

  function onStopped(releaseV, hitEnd) {
    departed = false;
    const level = M.isLevel(car.y, F.levelTol);
    if (stopEvents < STOP_EVENT_CAP) {
      stopEvents++;
      T().track('stop', { level: level ? 1 : 0, off: Math.round(Math.abs(car.y - Math.round(car.y)) * 100) / 100, speed: Math.round(Math.abs(releaseV) * 100) / 100 });
    }
    if (level) {
      car.y = Math.round(car.y);
      if (!REDUCED) { settleT = 1; settleDir = releaseV >= 0 ? 1 : -1; }
      sag = 0;
      if (!firstLevelAt) firstLevelAt = tNow;
      startServe(car.y);
    } else {
      sag = 2; bumpT = 1;
      smoothArmed = false; armY = car.y;
      if (sfx) sfx.play('drop');
      if (hitEnd) { /* the shaft ends are never level-tolerant by accident: 1 and floors ARE floors */ }
    }
  }

  function startServe(floor) {
    phase = 'serve'; serveT = 0; serveFloor = floor;
    serveDrop = !!(rider && rider.dest === floor);
    serveBoard = !!(waiting && waiting.floor === floor && !serveDropBlocks());
    didDrop = false; didBoard = false;
    if (sfx) sfx.play('ping');
  }
  function serveDropBlocks() { return rider && rider.dest !== serveFloor; }

  function serveTimes() {
    const acts = (serveDrop ? 1 : 0) + (serveBoard ? 1 : 0);
    const open = F.doorS;
    const act = F.boardS * Math.max(1, acts);
    return { open, act, close: F.doorS, total: open + act + F.doorS };
  }

  function stepServe(dt) {
    serveT += dt;
    const t = serveTimes();
    /* Reduced motion snaps the doors to their end state. It must not skip the
       time they take: the door is a RULE - it is what a stop costs - and only
       the animation is optional. */
    if (REDUCED) doorOpen = serveT < t.open ? 0 : (serveT < t.open + t.act ? 1 : 0);
    else if (serveT < t.open) doorOpen = ease(serveT / t.open);
    else if (serveT < t.open + t.act) doorOpen = 1;
    else doorOpen = 1 - ease(Math.min(1, (serveT - t.open - t.act) / t.close));

    if (!didDrop && serveDrop && serveT >= t.open) {
      didDrop = true;
      pay(rider, 'drop');
      rider = null;
      spawnAt = tNow + 1.0;
    }
    if (!didBoard && serveBoard && serveT >= t.open + (serveDrop ? F.boardS : 0)) {
      didBoard = true;
      rider = { dest: waiting.dest };
      waiting = null;
      creditStop();
      if (sfx) sfx.play('step');
    }
    if (serveT >= t.total) {
      phase = 'drive'; doorOpen = 0;
    }
  }

  /* A stop that did business counts toward the smooth-stop rate, and pays the
     craft bonus if the car got there first time. A stop at an empty landing
     opens its doors and spills its light - that is the reward beat and it is
     free - but it pays nothing, or parking on an empty floor would be an
     income. */
  function creditStop() {
    busStops++;
    if (smoothArmed) {
      smoothStops++;
      tips += F.smoothBonus;
      addFly('+' + F.smoothBonus, 0.35, true);
    }
  }
  function pay(who, kind) {
    void kind;
    const amount = Math.round(M.tipFor(1, 1, F));      // no patience in M1: everyone pays full
    tips += amount;
    addFly('+' + amount, 0, false);
    creditStop();
    if (sfx) sfx.play('pop');
    T().track('delivery', { dest: who ? who.dest : 0 });
  }

  function addFly(txt, delay, small) {
    const sx = geo.shaft1X + geo.shaftW / 2;
    const sy = slabY(serveFloor) - geo.floorPx * 0.6;
    flies.push({ txt, x: sx, y: sy, t: -delay, small: !!small });
  }
  function stepFlies(dt) {
    for (const f of flies) f.t += dt / 0.9;
    flies = flies.filter(f => f.t < 1);
  }

  const ease = (t) => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);

  /* ---------- RENDER ---------- */
  function rr(x, y, w, h, r) { UI.roundRectPath(ctx, x, y, w, h, r); }

  function render(now) {
    ctx.clearRect(0, 0, LW, LH);
    /* The Portal wash. Centre at 32% of width on the top edge, radius 1.1x
       width. Every game in the fleet, same three stops. */
    const bg = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
    bg.addColorStop(0, RAISED); bg.addColorStop(0.6, SURFACE); bg.addColorStop(1, GROUND);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);

    drawShell();
    drawRooms(geo.land1X, geo.land1W, true);
    if (geo.land2W > 0) drawRooms(geo.land2X, geo.land2W, false);
    drawSpill();
    drawWaiting(now);
    drawShafts();
    drawCar(now);
    drawFlies();
    drawHud(now);
    if (rulesOpen) drawRulesCard(now);
  }

  function drawShell() {
    const g = ctx.createLinearGradient(0, geo.y, 0, geo.y + geo.h);
    g.addColorStop(0, SHELL_TOP); g.addColorStop(1, SHELL_BOT);
    ctx.fillStyle = g; rr(geo.x, geo.y, geo.w, geo.h, 12); ctx.fill();
  }

  /* `served` marks the half of the hotel this lift actually reaches. The far
     side is drawn the same way and is simply empty: it is the second shaft's
     half of the building, and it is the promise. */
  function drawRooms(x, w, served) {
    if (w <= 0) return;
    ctx.save();
    ctx.beginPath(); rr(geo.x, geo.y, geo.w, geo.h, 12); ctx.clip();
    for (let f = 1; f <= F.floors; f++) {
      const top = roomTop(f), base = slabY(f);
      ctx.fillStyle = (f % 2) ? ROOM_A : ROOM_B;
      ctx.fillRect(x, top, w, geo.floorPx);

      /* One lamp, over the spot people stand on, and the light it pools below
         it. The pool is a soft radial and not a shape: a gradient with a
         boundary you can see reads as a tent pitched in the room, which is
         what the first version looked like. The room falls to dark at its
         edges and there is no stroke anywhere - floors are value steps. */
      const lx = Math.round(x + w * (served ? 0.72 : 0.28));
      ctx.save();
      ctx.beginPath(); ctx.rect(x, top, w, geo.floorPx); ctx.clip();
      const pool = ctx.createRadialGradient(lx, top + 4, 2, lx, top + 4, geo.floorPx * 1.5);
      pool.addColorStop(0, 'rgba(255,214,120,0.20)');
      pool.addColorStop(0.42, 'rgba(255,214,120,0.065)');
      pool.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = pool; ctx.fillRect(x, top, w, geo.floorPx);
      ctx.restore();
      const lampW = Math.max(9, Math.round(geo.floorPx * 0.13));
      ctx.fillStyle = LAMP;
      rr(lx - lampW / 2, top + 2, lampW, 3, 1.5); ctx.fill();

      /* The runner, then the slab. It is the rug that LEADS TO THE LIFT, so it
         covers the part of the landing nearest the shaft and no more. Drawn
         across the full width it came out as fourteen saturated red rules at a
         74px pitch, which is a cut-line on every floor and exactly what the
         house rule against outlines is about. */
      const ch = Math.max(4, Math.round(geo.floorPx * 0.075));
      const cW = Math.round(w * 0.40);
      const cX = served ? x + w - Math.round(w * 0.07) - cW : x + Math.round(w * 0.07);
      const cg = ctx.createLinearGradient(0, base - 2 - ch, 0, base - 2);
      cg.addColorStop(0, 'rgba(122,58,58,0.18)'); cg.addColorStop(1, 'rgba(122,58,58,0.70)');
      ctx.fillStyle = cg;
      rr(cX, base - 2 - ch, cW, ch, 2); ctx.fill();
      ctx.fillStyle = SLAB;
      ctx.fillRect(x, base - 2, w, 2);

      // floor numeral, on the outside edge
      ctx.fillStyle = FLOOR_NUM;
      ctx.font = '700 ' + Math.max(12, Math.round(geo.floorPx * 0.24)) + 'px Inter, sans-serif';
      ctx.textAlign = served ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      const nx = served ? x + Math.round(w * 0.07) : x + w - Math.round(w * 0.07);
      ctx.fillText(String(f), nx, base - geo.floorPx * 0.5);
      // the call button, on the shaft side of the landing
      if (served) {
        const bx = x + w - Math.max(12, w * 0.055), by = base - geo.floorPx * 0.5;
        const lit = !!(waiting && waiting.floor === f);
        if (lit) {
          const gl = ctx.createRadialGradient(bx, by, 0, bx, by, 11);
          gl.addColorStop(0, 'rgba(255,210,76,0.55)'); gl.addColorStop(1, 'rgba(255,210,76,0)');
          ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(bx, by, 11, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = lit ? CALL_LIT : CALL_UNLIT;
        ctx.beginPath(); ctx.arc(bx, by, Math.max(3, geo.floorPx * 0.055), 0, Math.PI * 2); ctx.fill();
      }
    }
    /* The far wing has no lift yet, so it is unlit. This is the promise
       drawn as a value step rather than a caption. */
    if (!served) { ctx.fillStyle = 'rgba(11,16,32,0.30)'; ctx.fillRect(x, geo.y, w, geo.h); }
    ctx.restore();
  }

  /* The reward for a level stop is light. The fan leaves the shaft and lands
     on the landing; an unlevel stop never opens the doors, so it never gets
     one. */
  function drawSpill() {
    if (doorOpen <= 0.01) return;
    const base = slabY(serveFloor);
    const top = base - geo.floorPx;
    const reach = Math.max(30, geo.land1W * 0.6) * doorOpen;
    const x0 = geo.shaft1X;
    const g = ctx.createLinearGradient(x0, 0, x0 - reach, 0);
    g.addColorStop(0, 'rgba(255,214,120,' + (0.35 * doorOpen).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,214,120,0)');
    /* Clipped to the room it is lighting. The fan widens as it leaves the
       doorway, and unclipped it washed over the slab into the floor below,
       which is a solid concrete floor. */
    ctx.save();
    ctx.beginPath(); ctx.rect(geo.land1X, top - 4, geo.land1W, geo.floorPx + 2); ctx.clip();
    ctx.beginPath();
    ctx.moveTo(x0, top + geo.floorPx * 0.18);
    ctx.lineTo(x0 - reach, top - geo.floorPx * 0.10);
    ctx.lineTo(x0 - reach, base + geo.floorPx * 0.16);
    ctx.lineTo(x0, base);
    ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
  }

  function drawWaiting(now) {
    if (!waiting) return;
    const base = slabY(waiting.floor);
    const cx = geo.land1X + geo.land1W * 0.72;
    drawFigure(cx, base - 4, geo.floorPx * 0.52);
    drawChip(cx, base - 4 - geo.floorPx * 0.52 - Math.max(11, geo.floorPx * 0.17), waiting.dest, now);
  }

  /* No faces, and no outline. A torso with SHOULDERS and a flat base: drawn as
     a capsule it came out the same width as the head and the pair read as two
     stacked circles rather than a person. */
  function drawFigure(cx, baseY, h) {
    const headR = h * 0.19, bodyW = h * 0.42, bodyH = h - headR * 2 - h * 0.04;
    // a soft shadow under them: the lamp is above, so they stand on the carpet
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.ellipse(cx, baseY + 1, bodyW * 0.66, h * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createLinearGradient(0, baseY - bodyH, 0, baseY);
    g.addColorStop(0, BODY_HI); g.addColorStop(1, BODY_LO);
    ctx.fillStyle = g;
    const bw = bodyW, bt = baseY - bodyH, sh = bw * 0.36;
    ctx.beginPath();
    ctx.moveTo(cx - bw / 2, baseY);
    ctx.lineTo(cx - bw / 2, bt + sh);
    ctx.quadraticCurveTo(cx - bw / 2, bt, cx - bw / 2 + sh, bt);
    ctx.lineTo(cx + bw / 2 - sh, bt);
    ctx.quadraticCurveTo(cx + bw / 2, bt, cx + bw / 2, bt + sh);
    ctx.lineTo(cx + bw / 2, baseY);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = HEAD;
    ctx.beginPath(); ctx.arc(cx, bt - headR * 0.82, headR, 0, Math.PI * 2); ctx.fill();
  }

  /* The floor they want, as a numeral in a warm chip. The same chip stacks
     above the car once they are aboard, so the plan the player is carrying is
     drawn on the car itself rather than remembered. */
  function drawChip(cx, cy, n, now) {
    void now;
    const r = Math.max(10, geo.floorPx * 0.155);
    ctx.fillStyle = CHIP_FILL;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = CHIP_INK;
    ctx.font = '800 ' + Math.round(r * 1.25) + 'px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), cx, cy + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  function drawShafts() {
    ctx.fillStyle = SHAFT;
    ctx.fillRect(geo.shaft1X, geo.y, geo.shaftW, geo.h);
    // the cables the car hangs from, blurring into two smears at speed
    const carTop = carBaseY() - geo.carH;
    const speed = Math.min(1, Math.abs(car.v) / F.vMax);
    const smear = REDUCED ? 0 : speed * 3;
    for (const f of [0.32, 0.68]) {
      const cx = geo.shaft1X + geo.shaftW * f;
      ctx.fillStyle = CABLE;
      ctx.fillRect(cx - 1, geo.y, 2, Math.max(0, carTop - geo.y));
      if (smear > 0.2) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(cx - 1 - smear, geo.y, 2, Math.max(0, carTop - geo.y));
        ctx.fillRect(cx - 1 + smear, geo.y, 2, Math.max(0, carTop - geo.y));
      }
    }
    // the second shaft: unbuilt, dashed, and labelled. It is the promise.
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = LOCKED; ctx.lineWidth = 1.5;
    rr(geo.shaft2X + 3, geo.y + 6, geo.shaft2W - 6, geo.h - 12, 8); ctx.stroke();
    ctx.setLineDash([]);
    ctx.translate(geo.shaft2X + geo.shaft2W / 2, geo.y + geo.h / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = 'rgba(200,215,240,0.46)';
    ctx.font = '700 ' + Math.max(11, Math.round(geo.shaftW * 0.19)) + 'px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('2nd LIFT', 0, 0);
    ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  function carBaseY() {
    const settle = settleT > 0 ? Math.sin(settleT * Math.PI) * 4 * settleDir : 0;
    return geo.y + (F.floors - car.y + 1) * geo.floorPx + sag + settle;
  }

  function drawCar(now) {
    const w = geo.carW, h = geo.carH;
    const x = Math.round(geo.shaft1X + (geo.shaftW - w) / 2);
    const yb = carBaseY(), y = Math.round(yb - h);
    const speed = Math.min(1, Math.abs(car.v) / F.vMax);

    // the window light streaks behind the car at speed
    if (!REDUCED && speed > 0.25) {
      ctx.globalAlpha = 0.20 * speed;
      ctx.fillStyle = CAR_MID;
      rr(x, y + (car.v > 0 ? 4 : -4), w, h, 6); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // brass body, edges made of value: a gradient and a bevel band, no stroke
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, CAR_HI); g.addColorStop(0.45, CAR_MID); g.addColorStop(1, CAR_LO);
    ctx.fillStyle = g; rr(x, y, w, h, 6); ctx.fill();
    ctx.fillStyle = CAR_BEVEL; ctx.fillRect(x + 4, y + 2, w - 8, 2);

    // the doorway: warm interior, and two brass leaves that slide off it
    const ix = x + 6, iy = y + 8, iw = w - 12, ih = h - 14;
    ctx.save();
    ctx.beginPath(); rr(ix, iy, iw, ih, 3); ctx.clip();
    ctx.fillStyle = CAR_IN; ctx.fillRect(ix, iy, iw, ih);
    if (rider) {
      ctx.fillStyle = HEAD_WARM;
      ctx.beginPath(); ctx.arc(ix + iw * 0.5, iy + ih * 0.34, Math.max(3, ih * 0.16), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(201,134,30,0.35)';
      rr(ix + iw * 0.5 - iw * 0.18, iy + ih * 0.52, iw * 0.36, ih * 0.4, iw * 0.1); ctx.fill();
    }
    /* The leaves are the same brass as the body, stepped down in VALUE rather
       than given a colour of their own. Drawn at the body's own gradient the
       car read as one solid slab with a hairline down it, and a shut door has
       to be visibly a door or an unlevel stop looks like nothing happened. */
    const leaf = (iw / 2) * (1 - doorOpen);
    const dg = ctx.createLinearGradient(ix, iy, ix, iy + ih);
    dg.addColorStop(0, CAR_MID); dg.addColorStop(1, CAR_LO);
    ctx.fillStyle = dg;
    ctx.fillRect(ix, iy, leaf, ih);
    ctx.fillRect(ix + iw - leaf, iy, leaf, ih);
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.fillRect(ix, iy, leaf, ih);
    ctx.fillRect(ix + iw - leaf, iy, leaf, ih);
    if (leaf > 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fillRect(ix + leaf - 1, iy, 1.5, ih);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(ix + iw - leaf, iy, 1, ih);
    }
    ctx.restore();

    // the plan the player is carrying, stacked above the car
    if (rider) drawChip(x + w / 2, y - Math.max(12, geo.floorPx * 0.18), rider.dest, now);

    // the handle. It is drawn at rest, always, and pulses once at the start:
    // an affordance that only exists mid-gesture leaves an inert screen.
    const ha = 0.34 + (handlePulse > 0 ? Math.sin(handlePulse * Math.PI) * 0.55 : 0);
    const hy = y - Math.max(9, geo.floorPx * 0.13) - (rider ? Math.max(22, geo.floorPx * 0.34) : 0);
    ctx.strokeStyle = 'rgba(255,232,176,' + ha.toFixed(3) + ')';
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const s = Math.max(4, geo.floorPx * 0.07), mx = x + w / 2;
    ctx.beginPath();
    ctx.moveTo(mx - s, hy + s * 0.4); ctx.lineTo(mx, hy - s * 0.5); ctx.lineTo(mx + s, hy + s * 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx - s, hy + s * 1.5); ctx.lineTo(mx, hy + s * 2.4); ctx.lineTo(mx + s, hy + s * 1.5);
    ctx.stroke();
  }

  function drawFlies() {
    const tx = LW - SIDE_PAD - 26, ty = topBand() / 2;
    for (const f of flies) {
      if (f.t < 0) continue;
      const t = ease(f.t);
      /* Reduced motion counts up at the counter instead of flying. */
      const x = REDUCED ? tx : f.x + (tx - f.x) * t;
      const y = REDUCED ? ty : f.y - 18 * (1 - t) + (ty - (f.y - 18)) * t * t;
      ctx.globalAlpha = f.t > 0.75 ? (1 - f.t) * 4 : 1;
      ctx.fillStyle = CHIP_FILL;
      ctx.font = '800 ' + (f.small ? 14 : 18) + 'px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(f.txt, x, y);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  /* ---------- CHROME ---------- */
  function drawHud(now) {
    void now;
    for (const c of ctrl) {
      if (c.icon) { UI.drawPill(ctx, '', c.cx, c.cy, { w: UI.PILL.iconW }); drawSpeaker(c.cx, c.cy, !sfx || sfx.isOn()); }
      else UI.drawPill(ctx, c.label, c.cx, c.cy);
    }

    const rate = busStops ? Math.round((smoothStops / busStops) * 100) : 0;
    const line = 'TIPS ' + tips + '   ·   SMOOTH ' + rate + '%';
    const hs = Math.max(0.66, Math.min(1, LW / 620));
    let fs = Math.round(16 * hs);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = INK72;
    ctx.font = '600 ' + fs + 'px Inter, sans-serif';
    while (fs > 11 && ctx.measureText(line).width > (LW - SIDE_PAD) - readoutMinX) {
      fs -= 1; ctx.font = '600 ' + fs + 'px Inter, sans-serif';
    }
    const readoutLeft = (LW - SIDE_PAD) - ctx.measureText(line).width;
    ctx.fillText(line, LW - SIDE_PAD, topBand() / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    drawLateHint(readoutLeft);
  }

  /* Zero instructions is the first-screen test, so this is not on the first
     screen. It appears only if twelve seconds have gone by without a single
     level stop, which is the case the pulsing handle failed to reach. */
  function drawLateHint(readoutLeft) {
    if (firstLevelAt || tNow < 12) return;
    const txt = 'drag the car up or down · let go to stop';
    ctx.font = '600 14px Inter, sans-serif';
    const tw = ctx.measureText(txt).width;
    ctx.fillStyle = 'rgba(255,255,255,0.44)';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    if (MODE === 'mobile') {
      ctx.fillText(txt, LW / 2, geo.y + geo.h + statusLane() / 2 + 3);
    } else {
      /* The band already has a control row at one end and the read-out at the
         other, and nothing else checks whether a third thing fits between
         them. Measure the gap that is actually left and say nothing if the
         line will not clear both by 14px. */
      const left = readoutMinX, right = readoutLeft - 14;
      if (right - left >= tw + 14) ctx.fillText(txt, (left + right) / 2, topBand() / 2);
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  function drawSpeaker(cx, cy, on) {
    ctx.save();
    ctx.strokeStyle = UI.PILL.text; ctx.fillStyle = UI.PILL.text;
    ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - 3); ctx.lineTo(cx - 3, cy - 3); ctx.lineTo(cx + 1, cy - 7);
    ctx.lineTo(cx + 1, cy + 7); ctx.lineTo(cx - 3, cy + 3); ctx.lineTo(cx - 7, cy + 3);
    ctx.closePath(); ctx.fill();
    if (on) {
      ctx.beginPath(); ctx.arc(cx + 3, cy, 4, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 3, cy, 7, -0.9, 0.9); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(cx + 4, cy - 4); ctx.lineTo(cx + 9, cy + 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 9, cy - 4); ctx.lineTo(cx + 4, cy + 4); ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- RULES CARD ---------- */
  const RULES = [
    'Drag the car in the shaft, or hold the up and down keys. It is heavy: it lags behind your hand, and it keeps going when you let go.',
    'Let go early. From full speed the brake needs almost a whole floor.',
    'Level with a landing and the doors open and the light spills out. Between floors it bumps, sags and sits there until you nudge it.',
    'The number over someone is the floor they want. Carry them there for the tip, and a stop you land first time pays a little more.',
  ];
  let rulesGeom = null, rulesCTA = null;
  function rulesBox() {
    const pw = Math.min(LW - 56, 470), ph = Math.min(LH - 20, 420);
    const px = Math.round((LW - pw) / 2), py = Math.max(10, Math.round((LH - ph) / 2));
    return { px, py, pw, ph, header: 154, footer: 98, body: ph - 154 - 98 };
  }
  function drawRulesCard(now) {
    const b = rulesBox();
    ctx.fillStyle = 'rgba(10,16,28,0.88)'; ctx.fillRect(0, 0, LW, LH);
    ctx.fillStyle = SURFACE; rr(b.px, b.py, b.pw, b.ph, 22); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    rr(b.px, b.py, b.pw, b.ph, 22); ctx.stroke();

    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#FFFFFF'; ctx.font = '800 40px Inter, sans-serif';
    ctx.fillText('Lift', b.px + 43, b.py + 34);
    ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = '600 17px Inter, sans-serif';
    ctx.fillText('Drag the car. Let go to stop.', b.px + 43, b.py + 34 + 54);

    const bodyY = b.py + b.header, bodyH = b.body;
    ctx.save();
    ctx.beginPath(); ctx.rect(b.px, bodyY, b.pw, bodyH); ctx.clip();
    let y = bodyY - rulesScroll;
    const demoH = 92;
    drawDemo(b.px + 43, y, b.pw - 86, demoH, now);
    y += demoH + 18;
    RULES.forEach((line, i) => {
      ctx.beginPath(); ctx.arc(b.px + 43, y + 11, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#FF6B5C'; ctx.fill();                    // --accent-text
      ctx.fillStyle = GROUND; ctx.font = '800 14px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.fillText(String(i + 1), b.px + 43, y + 4);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.90)'; ctx.font = '500 16px Inter, sans-serif';
      y = wrap(line, b.px + 66, y, b.pw - 100, 22) + 13;
    });
    rulesGeom = { contentH: (y + rulesScroll) - bodyY, viewportH: bodyH, bodyY };
    ctx.restore();

    const max = Math.max(0, rulesGeom.contentH - bodyH);
    if (rulesScroll > 1) fade(b.px, bodyY, b.pw, 20, true);
    if (rulesScroll < max - 1) fade(b.px, bodyY + bodyH - 20, b.pw, 20, false);

    rulesCTA = UI.drawCTA(ctx, 'GOT IT', b.px + b.pw / 2, b.py + b.ph - 32 - 25, CORAL);
  }
  function fade(x, y, w, h, top) {
    const g = ctx.createLinearGradient(x, top ? y : y + h, x, top ? y + h : y);
    g.addColorStop(0, SURFACE); g.addColorStop(1, 'rgba(19,31,54,0)');
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

  /* The eight-second wordless loop. It is the whole verb in one shot, in the
     order a player meets it: someone appears wanting a floor, the car comes up
     too fast and lands between floors, sags, gets nudged level, and only then
     do the doors open and the light land on the landing. */
  function drawDemo(x, y, w, h, now) {
    const t = ((now / 1000) % 8);
    const rows = 3, fh = h / rows;
    const shaftW = Math.round(w * 0.17);
    const landW = w - shaftW;
    const sx = x + landW;
    ctx.save();
    ctx.beginPath(); rr(x, y, w, h, 6); ctx.clip();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, SHELL_TOP); g.addColorStop(1, SHELL_BOT);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    for (let r = 0; r < rows; r++) {
      ctx.fillStyle = (r % 2) ? ROOM_A : ROOM_B;
      ctx.fillRect(x, y + r * fh, landW, fh);
      ctx.fillStyle = SLAB; ctx.fillRect(x, y + (r + 1) * fh - 2, landW, 2);
      ctx.fillStyle = CARPET; ctx.fillRect(x + 8, y + (r + 1) * fh - 5, landW - 16, 3);
    }
    ctx.fillStyle = SHAFT; ctx.fillRect(sx, y, shaftW, h);

    // the scripted drive, in demo floor units where 0 is the top row
    let cf, open = 0, boarded = false, personIn = true;
    if (t < 1.0) { cf = 2; }
    else if (t < 2.6) { cf = 2 - 2.42 * ease((t - 1.0) / 1.6); }           // overshoots past 0
    else if (t < 3.4) { cf = -0.42; }                                       // sat between floors
    else if (t < 4.2) { cf = -0.42 + 0.42 * ease((t - 3.4) / 0.8); }        // nudged level
    else if (t < 5.2) { cf = 0; open = ease((t - 4.2) / 1.0); }
    else if (t < 6.2) { cf = 0; open = 1; personIn = t < 5.6; boarded = t >= 5.6; }
    else if (t < 7.0) { cf = 0; open = 1 - ease((t - 6.2) / 0.8); boarded = true; }
    else { cf = 2 * ease((t - 7.0) / 1.0); boarded = true; }

    const carH = fh - 8, carW = shaftW - 6;
    const cyBase = y + (cf + 1) * fh + (t >= 2.6 && t < 3.4 ? 2 : 0);

    // light on the landing, only once the doors are open
    if (open > 0.02) {
      const reach = landW * 0.5 * open;
      const lg = ctx.createLinearGradient(sx, 0, sx - reach, 0);
      lg.addColorStop(0, 'rgba(255,214,120,' + (0.35 * open).toFixed(3) + ')');
      lg.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(sx, y + 2); ctx.lineTo(sx - reach, y - 2);
      ctx.lineTo(sx - reach, y + fh + 4); ctx.lineTo(sx, y + fh);
      ctx.closePath(); ctx.fill();
    }
    // the person on the top landing, and the floor they want
    if (personIn) {
      const px = x + landW * 0.62, pb = y + fh - 5;
      drawFigureAt(px, pb, fh * 0.5);
      const r = 8;
      ctx.fillStyle = CHIP_FILL; ctx.beginPath(); ctx.arc(px, pb - fh * 0.5 - 9, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = CHIP_INK; ctx.font = '800 10px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('1', px, pb - fh * 0.5 - 8);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }
    // the car
    const cxx = sx + (shaftW - carW) / 2, cyy = cyBase - carH;
    ctx.fillStyle = CABLE; ctx.fillRect(sx + shaftW * 0.5 - 1, y, 2, Math.max(0, cyy - y));
    const cg = ctx.createLinearGradient(0, cyy, 0, cyy + carH);
    cg.addColorStop(0, CAR_HI); cg.addColorStop(0.45, CAR_MID); cg.addColorStop(1, CAR_LO);
    ctx.fillStyle = cg; rr(cxx, cyy, carW, carH, 4); ctx.fill();
    ctx.fillStyle = CAR_BEVEL; ctx.fillRect(cxx + 2, cyy + 1, carW - 4, 1.5);
    const ix = cxx + 3, iy = cyy + 4, iw = carW - 6, ih = carH - 7;
    ctx.save();
    ctx.beginPath(); rr(ix, iy, iw, ih, 2); ctx.clip();
    ctx.fillStyle = CAR_IN; ctx.fillRect(ix, iy, iw, ih);
    if (boarded) { ctx.fillStyle = HEAD_WARM; ctx.beginPath(); ctx.arc(ix + iw / 2, iy + ih * 0.4, ih * 0.2, 0, Math.PI * 2); ctx.fill(); }
    const leaf = (iw / 2) * (1 - open);
    ctx.fillStyle = CAR_LO;
    ctx.fillRect(ix, iy, leaf, ih); ctx.fillRect(ix + iw - leaf, iy, leaf, ih);
    ctx.restore();
    ctx.restore();
  }
  function drawFigureAt(cx, baseY, h) {
    const headR = h * 0.20, bodyW = h * 0.44, bodyH = h - headR * 2 - h * 0.06;
    const g = ctx.createLinearGradient(0, baseY - bodyH, 0, baseY);
    g.addColorStop(0, BODY_HI); g.addColorStop(1, BODY_LO);
    ctx.fillStyle = g; rr(cx - bodyW / 2, baseY - bodyH, bodyW, bodyH, bodyW * 0.42); ctx.fill();
    ctx.fillStyle = HEAD; ctx.beginPath(); ctx.arc(cx, baseY - bodyH - headR * 0.85, headR, 0, Math.PI * 2); ctx.fill();
  }

  function onRulesPointer(p, e) {
    void e;
    if (rulesCTA && p.x >= rulesCTA.x && p.x <= rulesCTA.x + rulesCTA.w &&
        p.y >= rulesCTA.y && p.y <= rulesCTA.y + rulesCTA.h) { rulesOpen = false; return; }
    const b = rulesBox();
    if (p.x < b.px || p.x > b.px + b.pw || p.y < b.py || p.y > b.py + b.ph) rulesOpen = false;
  }
  canvas.addEventListener('wheel', (e) => {
    if (!rulesOpen || !rulesGeom) return;
    e.preventDefault();
    const max = Math.max(0, rulesGeom.contentH - rulesGeom.viewportH);
    rulesScroll = Math.max(0, Math.min(max, rulesScroll + e.deltaY));
  }, { passive: false });

  /* ---------- DETECTORS ----------
     A card is not fixed until something can measure it, and neither is a
     building. Both of these report numbers a sweep can fail on. */
  window.rulesFit = function () {
    const was = rulesOpen; rulesOpen = true;
    drawRulesCard(performance.now());
    rulesOpen = was;
    const b = rulesBox();
    const contentH = rulesGeom ? rulesGeom.contentH : 0;
    return {
      fits: (b.header + b.body + b.footer === b.ph) && b.py >= 0 && b.py + b.ph <= LH,
      cardH: b.ph, frameH: LH, viewportH: b.body, contentH,
      scrollMax: Math.max(0, contentH - b.body),
      overlapPx: Math.max(0, (b.py + b.ph) - LH),
    };
  };
  /* The building must sit inside the band-free area at every viewport, and the
     lowest control must not be under it. */
  window.layoutFit = function () {
    const ctrlTop = ctrl.length ? Math.min.apply(null, ctrl.map(c => c.y)) : LH;
    const top = topBand(), bot = LH - botBand();
    return {
      mode: MODE, LW, LH, floorPx: geo.floorPx, shaftW: geo.shaftW,
      land1W: geo.land1W, land2W: geo.land2W,
      buildTop: geo.y, buildBottom: geo.y + geo.h,
      overTop: Math.max(0, top - geo.y),
      overBottom: Math.max(0, (geo.y + geo.h) - (bot - statusLane())),
      ctrlOverlap: MODE === 'mobile' ? Math.max(0, (geo.y + geo.h) - ctrlTop) : 0,
      fits: geo.y >= top && (geo.y + geo.h) <= (bot - statusLane()) &&
            geo.land1W > 40 && geo.shaftW >= 26,
    };
  };
  window.lift = {
    get car() { return car; }, get tips() { return tips; }, get phase() { return phase; },
    get waiting() { return waiting; }, get rider() { return rider; },
    get smooth() { return busStops ? smoothStops / busStops : 0; },
    get busStops() { return busStops; },
    geo, F, reset,
    /* Drive the car headlessly, for verification: hold a direction for `secs`,
       then let go and let it brake to rest. */
    drive(dir, secs) {
      const dt = 1 / 120;
      for (let t = 0; t < secs; t += dt) { keyDir = dir; step(dt); }
      keyDir = 0;
      for (let i = 0; i < 2400 && (Math.abs(car.v) > 1e-6 || phase === 'serve'); i++) step(dt);
      return { y: car.y, tips, phase };
    },
  };

  /* ---------- BOOT ---------- */
  let last = 0, acc = 0;
  const DT = 1 / 120;                      // fixed step, so a shift replays
  function frame(now) {
    if (!last) last = now;
    const raw = Math.min(0.25, (now - last) / 1000); last = now;
    if (!document.hidden) {
      acc += raw;
      let guard = 0;
      while (acc >= DT && guard++ < 60) { step(DT); acc -= DT; }
    } else { acc = 0; }
    render(now);
    requestAnimationFrame(frame);
  }

  reset();
  setCanvasVars();
  resizeCanvas();
  fitFullscreen();
  resizeCanvas();
  layout();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', () => { handlePulse = 1; render(performance.now()); });
  window.addEventListener('load', onResize);
  window.visualViewport && window.visualViewport.addEventListener('resize', onResize);
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  T().gameStart();
  requestAnimationFrame(frame);
})();
