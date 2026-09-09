/* ============================================================
   Lift · A Zamborin Game

   A hotel is on fire. Smoke rises from the fire floor and fills the corridors
   above it, and the way out is the lobby at the bottom. You are the lift.

   Drag the car in the shaft and it lags behind your hand, because it is heavy;
   let go and it keeps going, braking over most of a floor from full speed.
   Land it level with a corridor and the doors slide and people get in. Land it
   between floors and they stay shut until you nudge it, and every second of
   that is a second of smoke.

   THE TWO THINGS THAT MAKE IT A DECISION, both measured before they were built
   (see tune-fire.mjs and the findings beside the brief):

   1. Smoke is ONE clock and it SPREADS. A floor gets worse whether you go
      there or not, and worse because of what is below it, so serving the wrong
      floor costs a floor rather than a second. Reacting one stop at a time
      clears 35% of buildings; planning a whole trip ahead clears 87%.
   2. Smoke comes into the car through the OPEN DOOR. Every stop costs, so the
      number of stops is a real budget. Turn that off and the game is 100%
      winnable, 8% certifiable, and simply reacting clears 81% of it.

   Levels are generated and certified in build-levels.mjs: a planner that
   thinks one trip ahead clears every one of them, and from level 4 on the
   obvious rules do not.
   ============================================================ */
(() => {
  'use strict';

  const M = window.LiftModel;
  const T = M.TUNE, FIRE = M.FIRE;
  const LEVELS = (window.LiftLevels || { LEVELS: [] }).LEVELS;

  /* ---------- MODE ----------
     A browser can report a 0-wide viewport on the first frame; zero must not
     count as narrow or a desktop player is locked to the phone layout for the
     session. And a narrow frame is not a phone if it is lying down - the width
     test alone handed the mobile chrome to a 480x360 embed. */
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

  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zam.lift.sfx' }) : null;
  const UI = window.ZAM_UI;
  const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){}, levelRestart(){}, hintUsed(){}, track(){} };
  const TR = () => (window.ZAM_TRACK || NOOP);
  TR().init('lift');

  /* ---------- COLOUR ----------
     Chrome takes tokens (shared/tokens.css). The hotel is game art and carries
     its own palette. Canvas cannot read CSS variables, so this is the one place
     they are restated. */
  const GROUND = '#0E1726', SURFACE = '#131F36', RAISED = '#1A2A45';
  const INK72 = 'rgba(255,255,255,0.72)', CORAL = '#C24A39';

  const SHELL_TOP = '#1C2233', SHELL_BOT = '#12172A';
  const WALL_A = '#232B45', WALL_B = '#1E2540';        // alternating corridor walls
  const CEIL = 'rgba(255,255,255,0.10)';
  const SKIRT = 'rgba(255,255,255,0.07)';
  const DOOR_FILL = '#525A6D', DOOR_HI = '#626B80', DOOR_LO = '#3C4356';
  const LAMP = '#FFD98A';
  const CARPET = '#7A3A3A';
  const SHAFT = '#0B1020', CABLE = 'rgba(255,255,255,0.08)';
  const CAR_HI = '#FFD98A', CAR_MID = '#E8B44C', CAR_LO = '#C9861E';
  const CAR_BEVEL = 'rgba(255,255,255,0.35)';
  const CAR_IN = '#FFE8B0', HEAD_WARM = '#FFF4E6';
  /* BODY_LO was #4E6488, a mid-tone, which measured low against a dark wall AND
   against light smoke - there was no ground it read on. Lifted so the figure
   is a light shape that always sits on the dark halo behind it. */
const BODY_HI = '#9DB2D2', BODY_LO = '#6E86AE', HEAD = '#C9D6F0';
  const SMOKE = '214,220,232';
  const FLAME = '255,150,60';
  const EXIT_GLOW = '#8FE3C8';
  const FLOOR_NUM = 'rgba(226,234,250,0.96)';
  const BREATH_OK = '#5DD39E', BREATH_MID = '#F0B23C', BREATH_LOW = '#F05A46';

  /* ---------- LAYOUT ---------- */
  const SIDE_PAD = 30;
  const topBand = () => (MODE === 'mobile' ? 64 : 56);
  const botBand = () => (MODE === 'mobile' ? 96 : 20);
  const buildPad = () => (MODE === 'mobile' ? 12 : SIDE_PAD);
  const statusLane = () => (MODE === 'mobile' && LH >= 560 ? 26 : 0);

  const geo = {
    floorPx: 74, shaftW: 64, carW: 54, carH: 62,
    x: 0, y: 0, w: 0, h: 0, corW: 0, leftX: 0, shaftX: 0, rightX: 0, rightW: 0,
  };
  let ctrl = [], readoutMinX = SIDE_PAD;

  function floors() { return level ? level.floors : 7; }

  function layout() {
    const availW = Math.max(80, LW - buildPad() * 2);
    const availH = Math.max(80, LH - topBand() - botBand() - statusLane());
    const F = floors();
    /* The floor height is set by a five-floor building at minimum, so a small
       hotel is SHORT rather than stretched: you see its roof and the street,
       and the building grows into the frame as the levels do. */
    const maxFloor = MODE === 'mobile' ? 120 : 104;
    geo.floorPx = Math.max(30, Math.min(maxFloor, Math.floor(availH / Math.max(4, F))));
    geo.shaftW = Math.max(30, Math.min(84, Math.round(geo.floorPx * 0.80)));
    geo.h = geo.floorPx * F;
    geo.y = Math.round(topBand() + (availH - geo.h) / 2);

    /* A corridor is a corridor, not a letterbox: capped against the floor
       height so a wide frame does not draw a 400x40 room. */
    const corCap = geo.floorPx * 5;
    if (MODE === 'mobile') {
      geo.corW = Math.max(60, Math.min(availW - geo.shaftW, corCap));
      geo.rightW = 0;
      geo.w = geo.corW + geo.shaftW;
      geo.x = Math.round((LW - geo.w) / 2);
      geo.leftX = geo.x; geo.shaftX = geo.x + geo.corW; geo.rightX = 0;
    } else {
      geo.corW = Math.max(60, Math.min(Math.floor((availW - geo.shaftW) / 2), corCap));
      geo.rightW = geo.corW;
      geo.w = geo.corW * 2 + geo.shaftW;
      geo.x = Math.round((LW - geo.w) / 2);
      geo.leftX = geo.x; geo.shaftX = geo.x + geo.corW; geo.rightX = geo.shaftX + geo.shaftW;
    }
    geo.carW = Math.max(18, Math.round(geo.shaftW - 10));
    geo.carH = Math.max(20, Math.round(geo.floorPx - 12));
    layoutControls();
  }
  const slabY = (f) => geo.y + (floors() - f + 1) * geo.floorPx;
  const roomTop = (f) => slabY(f) - geo.floorPx;

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
      const box = { id: it.id, label: it.label, icon: it.icon, x, y: Math.round(cy - UI.PILL.h / 2),
                    w: it.w, h: UI.PILL.h, cx: x + it.w / 2, cy };
      x += it.w + UI.PILL.gap;
      return box;
    });
    readoutMinX = MODE === 'desktop' ? x + 16 : SIDE_PAD;
  }

  /* ---------- STATE ---------- */
  const SAVE = 'zam.lift.save';
  let levelIndex = 0, level = null;
  const car = { y: 1, v: 0 };
  let smoke = null, carSmoke = 0;
  let waiting = [], aboard = [], out = 0, lost = 0, lostFloors = [], standsBy = {};
  let phase = 'play';                  // 'play' | 'serve' | 'over'
  let serveT = 0, serveFloor = 1, doorOpen = 0, didWork = false;
  let settleT = 0, settleDir = 1, sag = 0;
  let departed = false, stopsMade = 0;
  let puffs = [], tNow = 0, endT = 0, won = false;
  let rulesOpen = false, rulesScroll = 0, handlePulse = 0;

  function loadSave() {
    try { const s = JSON.parse(localStorage.getItem(SAVE) || '{}'); return Math.max(0, Math.min(LEVELS.length - 1, s.level | 0)); }
    catch (e) { return 0; }
  }
  function putSave() { try { localStorage.setItem(SAVE, JSON.stringify({ level: levelIndex })); } catch (e) {} }

  function startLevel(i) {
    levelIndex = Math.max(0, Math.min(LEVELS.length - 1, i));
    level = LEVELS[levelIndex];
    car.y = 1; car.v = 0;
    smoke = new Float64Array(level.floors + 1);
    carSmoke = 0;
    /* Where somebody stands comes from their slot and NOTHING ELSE, so a
       building plays the same on a phone as in the desktop frame even though
       the desktop draws the queue across two corridors. The smoke reaches the
       far end of a corridor first, so the deepest person is on the shortest
       clock and you can see that without being told. */
    const perFloor = {};
    waiting = level.people.map((f, i2) => {
      perFloor[f] = (perFloor[f] || 0) + 1;
      const slot = perFloor[f] - 1;
      return { id: i2, floor: f, exp: 0, slot, stand: M.standAt(slot), fade: 0 };
    });
    /* Where the doors may NOT go. Somebody standing in front of a guest door
       had a pale grey ground behind them and measured 2.52:1 against a 3:1
       bar, and it also looked like they were standing in a doorway. Computed
       from the LEVEL rather than from who is still waiting, so a door does not
       pop into existence when somebody gets in the lift. */
    standsBy = {};
    const seen = {};
    for (const f of level.people) {
      const slot = (seen[f] = (seen[f] || 0) + 1) - 1;
      (standsBy[f] || (standsBy[f] = [])).push({ stand: M.standAt(slot), right: slot % 2 === 1 });
    }
    aboard = []; out = 0; lost = 0; lostFloors = [];
    phase = 'play'; doorOpen = 0; serveT = 0; sag = 0; settleT = 0;
    departed = false; stopsMade = 0; puffs = []; tNow = 0; endT = 0; won = false;
    handlePulse = 1;
    layout();
    TR().levelStart(levelIndex + 1);
  }

  const totalPeople = () => (level ? level.people.length : 0);

  /* ---------- INPUT ---------- */
  let dragging = false, dragV = 0, dragLastY = 0, dragLastT = 0, keyDir = 0;

  function toLocal(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (LW / r.width), y: (e.clientY - r.top) * (LH / r.height) };
  }
  const hitCtrl = (x, y) => ctrl.find(c => x >= c.x - 6 && x <= c.x + c.w + 6 && y >= c.y - 8 && y <= c.y + c.h + 8) || null;
  /* The whole shaft is the handle. There is nothing else in it, grabbing the
     cable is the same gesture as grabbing the car, and a thumb does not have to
     find a 60px box first. */
  function inGrab(x, y) {
    const pad = MODE === 'mobile' ? 26 : 18;
    return x >= geo.shaftX - pad && x <= geo.shaftX + geo.shaftW + pad &&
           y >= geo.y - 12 && y <= geo.y + geo.h + 12;
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (sfx) sfx.ensureAudio();
    const p = toLocal(e);
    if (rulesOpen) { onRulesPointer(p); return; }
    const c = hitCtrl(p.x, p.y);
    if (c) { onCtrl(c.id); return; }
    if (phase === 'over') { onEndPointer(p); return; }
    if (phase === 'serve') return;                       // never steer with the doors open
    if (!inGrab(p.x, p.y)) return;
    /* Seed the target with the speed the car already has. A tall building needs
       more than one thumb-length, so a trip is taken in two or three gestures;
       starting each from zero braked at aMax, HARDER than letting go, and made
       re-gripping cost speed. */
    dragging = true; dragV = car.v; dragLastY = p.y; dragLastT = performance.now();
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = toLocal(e), now = performance.now();
    const dt = Math.max(0.008, (now - dragLastT) / 1000);
    // THE HAND'S VELOCITY IS THE TARGET. Screen y grows down, floors grow up.
    const raw = -(p.y - dragLastY) / geo.floorPx / dt;
    dragV = dragV * 0.55 + raw * 0.45;
    dragLastY = p.y; dragLastT = now;
  });
  const endDrag = () => { dragging = false; dragV = 0; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w') { keyDir = 1; e.preventDefault(); }
    else if (e.key === 'ArrowDown' || e.key === 's') { keyDir = -1; e.preventDefault(); }
    else if (e.key === 'Escape' && rulesOpen) { rulesOpen = false; }
    else if (e.key === 'Enter' && phase === 'over') { advanceFromCard(); }
    else return;
    if (sfx) sfx.ensureAudio();
  });
  window.addEventListener('keyup', (e) => {
    if ((e.key === 'ArrowUp' || e.key === 'w') && keyDir === 1) keyDir = 0;
    if ((e.key === 'ArrowDown' || e.key === 's') && keyDir === -1) keyDir = 0;
  });

  function onCtrl(id) {
    if (id === 'sound') { if (sfx) sfx.setOn(!sfx.isOn()); return; }
    if (id === 'restart') { TR().levelRestart(levelIndex + 1); startLevel(levelIndex); return; }
    if (id === 'rules') { rulesOpen = !rulesOpen; rulesScroll = 0; return; }
  }
  function advanceFromCard() {
    if (won && levelIndex < LEVELS.length - 1) { levelIndex++; putSave(); startLevel(levelIndex); }
    else startLevel(levelIndex);
  }

  /* ---------- THE WORLD ---------- */
  function step(dt) {
    tNow += dt;
    if (settleT > 0) settleT = Math.max(0, settleT - dt / 0.16);
    if (handlePulse > 0) handlePulse = Math.max(0, handlePulse - dt / 1.4);
    for (const p of puffs) p.t += dt / 1.1;
    puffs = puffs.filter(p => p.t < 1);
    if (phase === 'over') { endT += dt; return; }

    M.stepSmoke(smoke, level.floors, level.fire, level.rate, dt, FIRE);
    carSmoke = M.carSmokeStep(carSmoke, doorOpen > 0.02 ? smoke[serveFloor] : 0, dt, doorOpen > 0.02, FIRE);

    for (let i = waiting.length - 1; i >= 0; i--) {
      const p = waiting[i];
      p.exp += M.exposureStep(p.stand, smoke[p.floor], dt, FIRE);
      if (p.exp >= 1) { overcome(p, p.floor); waiting.splice(i, 1); }
    }
    for (let i = aboard.length - 1; i >= 0; i--) {
      const p = aboard[i];
      p.exp += M.carExposureStep(carSmoke, dt, FIRE);  // nowhere to stand away from it
      if (p.exp >= 1) { overcome(p, Math.round(car.y)); aboard.splice(i, 1); }
    }

    if (phase === 'serve') { stepServe(dt); }
    else { stepDrive(dt); }

    if (waiting.length === 0 && aboard.length === 0 && phase !== 'serve') finish();
  }

  /* Nobody dies on screen and nothing is drawn over a person: the smoke closes
     over them and they are left behind. The card names their floor, because
     the floor you did not get back to is the thing worth remembering. */
  function overcome(p, floor) {
    lost++; lostFloors.push(floor);
    puffs.push({ t: 0, floor, side: p.slot % 2, slot: p.slot, kind: 'lost' });
    if (sfx) sfx.play('error');
  }
  function finish() {
    if (phase === 'over') return;
    phase = 'over'; endT = 0; won = lost === 0;
    if (won) { if (sfx) sfx.play('success'); TR().levelComplete(levelIndex + 1, stopsMade); }
    else if (sfx) sfx.play('fail');
    TR().track('level_end', { level: levelIndex + 1, out, lost, stops: stopsMade, seconds: Math.round(tNow) });
  }

  function stepDrive(dt) {
    let input;
    if (dragging) {
      const age = Math.max(0, (performance.now() - dragLastT) / 1000 - 0.06);
      input = { mode: 'drag', targetV: dragV * Math.exp(-age * 12) };
    } else if (keyDir) input = { mode: 'key', dir: keyDir };
    else input = { mode: 'free' };

    const before = car.v;
    M.stepCar(car, dt, input, level.floors, T);
    if (Math.abs(car.v) > 0.02) departed = true;
    if (departed && !dragging && !keyDir && Math.abs(car.v) < 1e-6) onStopped(before);
  }

  function onStopped(releaseV) {
    departed = false;
    const level_ = M.isLevel(car.y, T.levelTol);
    TR().track('stop', { level: level_ ? 1 : 0, off: Math.round(Math.abs(car.y - Math.round(car.y)) * 100) / 100 });
    if (level_) {
      car.y = Math.round(car.y);
      if (!REDUCED) { settleT = 1; settleDir = releaseV >= 0 ? 1 : -1; }
      sag = 0;
      startServe(car.y);
    } else {
      /* A missed stop opens no doors, so no smoke gets in. What it costs is the
         overshoot, the sag and the nudge back, and under a fire that is the
         only currency there is. */
      sag = 2;
      if (sfx) sfx.play('drop');
    }
  }

  function startServe(f) {
    phase = 'serve'; serveT = 0; serveFloor = f; didWork = false; stopsMade++;
    if (sfx) sfx.play('ping');
  }
  function serveTimes() {
    const n = f => (f === 1 ? aboard.length : Math.min(T.capacity - aboard.length, waiting.filter(p => p.floor === f).length));
    const acts = Math.max(1, n(serveFloor));
    return { open: T.doorS, act: T.boardS * acts, close: T.doorS, total: T.doorS * 2 + T.boardS * acts };
  }
  function stepServe(dt) {
    serveT += dt;
    const t = serveTimes();
    /* Reduced motion snaps the doors to their end state. It must not skip the
       time they take: the door is a RULE - it is what a stop costs, in smoke -
       and only the animation is optional. */
    if (REDUCED) doorOpen = serveT < t.open ? 0 : (serveT < t.open + t.act ? 1 : 0);
    else if (serveT < t.open) doorOpen = ease(serveT / t.open);
    else if (serveT < t.open + t.act) doorOpen = 1;
    else doorOpen = 1 - ease(Math.min(1, (serveT - t.open - t.act) / t.close));

    if (!didWork && serveT >= t.open) {
      didWork = true;
      if (serveFloor === 1) {
        for (const p of aboard) { out++; puffs.push({ t: 0, floor: 1, side: 0, slot: p.slot, kind: 'out' }); }
        if (aboard.length && sfx) sfx.play('pop');
        aboard = [];
      } else {
        const here = waiting.filter(p => p.floor === serveFloor).sort((a, b) => b.exp - a.exp);
        const take = here.slice(0, T.capacity - aboard.length);
        if (take.length) {
          const ids = new Set(take.map(p => p.id));
          waiting = waiting.filter(p => !ids.has(p.id));
          for (const p of take) aboard.push(p);
          if (sfx) sfx.play('step');
        }
      }
    }
    if (serveT >= t.total) { phase = 'play'; doorOpen = 0; }
  }

  const ease = (t) => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);

  /* ---------- RENDER ---------- */
  const rr = (x, y, w, h, r) => UI.roundRectPath(ctx, x, y, w, h, r);

  function render(now) {
    ctx.clearRect(0, 0, LW, LH);
    const bg = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
    bg.addColorStop(0, RAISED); bg.addColorStop(0.6, SURFACE); bg.addColorStop(1, GROUND);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);
    if (!level) return;

    drawShell();
    drawCorridor(geo.leftX, geo.corW, 'left', now);
    if (geo.rightW > 0) drawCorridor(geo.rightX, geo.rightW, 'right', now);
    drawSpill();
    drawPeople(now);
    drawSmoke(now);
    drawShaft();
    drawCar(now);
    drawPuffs();
    drawHud();
    if (phase === 'over') drawEndCard();
    if (rulesOpen) drawRulesCard(now);
  }

  function drawShell() {
    const g = ctx.createLinearGradient(0, geo.y, 0, geo.y + geo.h);
    g.addColorStop(0, SHELL_TOP); g.addColorStop(1, SHELL_BOT);
    ctx.fillStyle = g; rr(geo.x - 6, geo.y - 8, geo.w + 12, geo.h + 8, 8); ctx.fill();
    // the roof, so a short hotel reads as a short hotel and not a cropped one
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(geo.x - 10, geo.y - 12, geo.w + 20, 4);
  }

  /* A HOTEL CORRIDOR, not a box: a ceiling with lamps in it, guest room doors
     down one wall, a runner on the floor, and the lift lobby left clear where
     the shaft is. */
  function drawCorridor(x, w, side, now) {
    const F = floors();
    ctx.save();
    ctx.beginPath(); rr(geo.x - 6, geo.y - 8, geo.w + 12, geo.h + 8, 8); ctx.clip();
    for (let f = 1; f <= F; f++) {
      const top = roomTop(f), base = slabY(f), h = geo.floorPx;
      ctx.fillStyle = (f % 2) ? WALL_A : WALL_B;
      ctx.fillRect(x, top, w, h);

      const ceilH = Math.max(3, h * 0.055);
      ctx.fillStyle = CEIL; ctx.fillRect(x, top, w, ceilH);

      if (f === 1) { drawLobby(x, w, top, base, side); }
      else { drawDoors(x, w, top, base, side, f); }

      // ceiling lamps, and the light they pool down the corridor
      const bays = Math.max(2, Math.round(w / (h * 0.95)));
      for (let i = 0; i < bays; i++) {
        const lx = x + w * ((i + 0.5) / bays);
        const g = ctx.createRadialGradient(lx, top + ceilH, 2, lx, top + ceilH, h * 1.15);
        g.addColorStop(0, 'rgba(255,214,120,0.20)');
        g.addColorStop(0.4, 'rgba(255,214,120,0.07)');
        g.addColorStop(1, 'rgba(255,214,120,0)');
        ctx.save();
        ctx.beginPath(); ctx.rect(x, top, w, h); ctx.clip();
        ctx.fillStyle = g; ctx.fillRect(x, top, w, h);
        ctx.restore();
        ctx.fillStyle = LAMP;
        rr(lx - Math.max(5, h * 0.07), top + ceilH * 0.6, Math.max(10, h * 0.14), Math.max(2, h * 0.035), 1.5); ctx.fill();
      }

      // the runner, then the slab as a band of value rather than a stroke
      const ch = Math.max(4, Math.round(h * 0.06));
      const cg = ctx.createLinearGradient(0, base - 3 - ch, 0, base - 3);
      cg.addColorStop(0, 'rgba(122,58,58,0.18)'); cg.addColorStop(1, 'rgba(122,58,58,0.68)');
      ctx.fillStyle = cg;
      const cin = Math.round(w * 0.06);
      rr(x + cin, base - 3 - ch, w - cin * 2, ch, 2); ctx.fill();
      ctx.fillStyle = SKIRT; ctx.fillRect(x, base - 3, w, 3);

    }
    ctx.restore();
    void now;
  }

  function drawDoors(x, w, top, base, side, f) {
    const h = base - top;
    const doorH = Math.max(16, h * 0.56), doorW = Math.max(11, doorH * 0.56);
    const lobby = Math.max(doorW * 1.3, w * 0.20);          // clear space by the lift
    const runX = side === 'left' ? x + 6 : x + lobby;
    const runW = w - lobby - 6;
    /* Spaced at two and a half door widths. At 1.85 a wide corridor fitted six
       of them and the wall of pale rectangles became the brightest thing in
       the building, which is supposed to be the car. */
    const n = Math.max(1, Math.min(4, Math.floor(runW / (doorW * 2.5))));
    const gap = runW / n;
    const onRight = side === 'right';
    const clear = (standsBy[f] || []).filter(s => (!!s.right && geo.rightW > 0) === onRight)
      .map(s => personX(s.stand, onRight));
    const keepOut = doorW * 0.5 + geo.floorPx * 0.52 * 0.24;
    for (let i = 0; i < n; i++) {
      const cx0 = runX + gap * (i + 0.5);
      if (clear.some(px2 => Math.abs(px2 - cx0) < keepOut)) continue;   // somebody is standing here
      const dx = Math.round(cx0 - doorW / 2);
      const dy = Math.round(base - 3 - doorH);
      const g = ctx.createLinearGradient(dx, dy, dx + doorW, dy);
      g.addColorStop(0, DOOR_HI); g.addColorStop(0.55, DOOR_FILL); g.addColorStop(1, DOOR_LO);
      ctx.fillStyle = g;
      rr(dx, dy, doorW, doorH, 2); ctx.fill();
      // frame as a value step, never a stroke
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(dx - 1, dy, 1, doorH);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(dx + doorW, dy, 1, doorH);
      // handle, and a number plate on the door
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.beginPath(); ctx.arc(dx + doorW * (side === 'left' ? 0.82 : 0.18), dy + doorH * 0.55, Math.max(1.2, doorW * 0.055), 0, Math.PI * 2); ctx.fill();
      if (doorH > 30) {
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        rr(dx + doorW * 0.28, dy + doorH * 0.14, doorW * 0.44, Math.max(3, doorH * 0.075), 1); ctx.fill();
      }
    }
  }

  /* The lobby is where they are trying to get to, so it does not look like the
     floors above it: no guest doors, a wide doorway to the street, and it is
     the one cool light in a warm building. */
  function drawLobby(x, w, top, base, side) {
    const h = base - top;
    const dw = Math.max(26, w * 0.26), dh = h * 0.62;
    const dx = Math.round(side === 'left' ? x + 10 : x + w - 10 - dw);
    const dy = Math.round(base - 3 - dh);
    const g = ctx.createLinearGradient(dx, dy, dx, dy + dh);
    g.addColorStop(0, 'rgba(143,227,200,0.24)'); g.addColorStop(1, 'rgba(143,227,200,0.08)');
    ctx.fillStyle = g; rr(dx, dy, dw, dh, 3); ctx.fill();
    const glow = ctx.createRadialGradient(dx + dw / 2, dy + dh, 2, dx + dw / 2, dy + dh, dh * 1.2);
    glow.addColorStop(0, 'rgba(143,227,200,0.13)'); glow.addColorStop(1, 'rgba(143,227,200,0)');
    ctx.fillStyle = glow; ctx.fillRect(x, top, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '700 ' + Math.max(9, Math.round(h * 0.14)) + 'px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (dh > 28) ctx.fillText('OUT', dx + dw / 2, dy + dh * 0.45);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  /* THE SMOKE IS A FRONT, NOT A HAZE. It comes along the corridor from the
     stairwell at the far end toward the lift, so how far the grey has got is
     how long the people in that corridor have, and it is read off the picture
     rather than off a number. Drawn in two passes with the people between
     them: enough over them to say the corridor is filling, never enough to
     hide who is still in it. */
  function smokeBand(x, w, top, h, front, fromLeft, a, now) {
    if (front < 0.005) return;
    const reach = w * front;
    const far = fromLeft ? x : x + w;                     // the wall it came from
    const lead = fromLeft ? x + reach : x + w - reach;    // where it has got to
    const dir = fromLeft ? 1 : -1;
    const roll = Math.max(8, w * 0.10);
    ctx.save();
    ctx.beginPath(); ctx.rect(Math.min(far, lead), top, reach, h); ctx.clip();

    /* The body is thin: you have to be able to see who is still in there. */
    const g = ctx.createLinearGradient(far, 0, lead, 0);
    g.addColorStop(0, 'rgba(' + SMOKE + ',' + (a * 0.50).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + SMOKE + ',' + (a * 0.32).toFixed(3) + ')');
    ctx.fillStyle = g; ctx.fillRect(Math.min(far, lead), top, reach, h);

    /* It hangs from the ceiling, mildly. */
    const v = ctx.createLinearGradient(0, top, 0, top + h);
    v.addColorStop(0, 'rgba(' + SMOKE + ',' + (a * 0.22).toFixed(3) + ')');
    v.addColorStop(0.7, 'rgba(' + SMOKE + ',0)');
    ctx.fillStyle = v; ctx.fillRect(Math.min(far, lead), top, reach, h);

    /* THE LEADING EDGE IS THE CLOCK, so it is the brightest part of it: a real
       smoke front rolls and thickens where it is advancing, and it means the
       player can read exactly how far it has come rather than squinting at a
       gradient. */
    const e = ctx.createLinearGradient(lead - dir * roll, 0, lead, 0);
    e.addColorStop(0, 'rgba(' + SMOKE + ',0)');
    e.addColorStop(1, 'rgba(' + SMOKE + ',' + (a * 0.55).toFixed(3) + ')');
    ctx.fillStyle = e;
    ctx.fillRect(Math.min(lead, lead - dir * roll), top, roll, h);

    if (!REDUCED) {
      const t2 = now / 1000;
      for (let k = 0; k < 3; k++) {
        const cy2 = top + h * (0.16 + 0.3 * k) + Math.sin(t2 * 0.8 + k * 2.1 + top * 0.03) * h * 0.06;
        const cx2 = lead - dir * roll * (0.25 + 0.35 * k) + Math.sin(t2 * 0.5 + k) * roll * 0.2;
        const rg = ctx.createRadialGradient(cx2, cy2, 1, cx2, cy2, roll * 1.1);
        rg.addColorStop(0, 'rgba(' + SMOKE + ',' + (a * 0.34).toFixed(3) + ')');
        rg.addColorStop(1, 'rgba(' + SMOKE + ',0)');
        ctx.fillStyle = rg; ctx.fillRect(Math.min(far, lead), top, reach, h);
      }
    }
    ctx.restore();
  }
  function smokeLayer(alphaScale, now) {
    const F = floors();
    ctx.save();
    ctx.beginPath(); rr(geo.x - 6, geo.y - 8, geo.w + 12, geo.h + 8, 8); ctx.clip();
    for (let f = 1; f <= F; f++) {
      const front = smoke[f];
      if (front < 0.005) continue;
      const top = roomTop(f), h = geo.floorPx;
      const a = 0.78 * alphaScale;
      smokeBand(geo.leftX, geo.corW, top, h, front, true, a, now);
      if (geo.rightW > 0) smokeBand(geo.rightX, geo.rightW, top, h, front, false, a, now);
    }
    ctx.restore();
  }
  function drawSmoke(now) {
    smokeLayer(0.12, now);                                   // a thin veil over everyone
    drawFire(now);
    drawFloorNumbers();
  }
  /* Which floor is which has to be readable in a corridor you cannot see
     across, so the numerals go ON TOP of the smoke. Under it they measured
     2.27:1 against a 4.5 bar. */
  function drawFloorNumbers() {
    const F = floors();
    ctx.font = '700 ' + Math.max(12, Math.round(geo.floorPx * 0.22)) + 'px Inter, sans-serif';
    ctx.textBaseline = 'middle';
    const pw = Math.max(15, geo.floorPx * 0.26), ph = Math.max(12, geo.floorPx * 0.22);
    for (let f = 1; f <= F; f++) {
      const top = roomTop(f), y = top + geo.floorPx * 0.17;
      /* A floor sign, because a light numeral on light smoke measured 2.88:1.
         The plate gives it a ground of its own on any floor in any state. */
      const plate = (px2, align) => {
        ctx.fillStyle = 'rgba(11,16,32,0.74)';
        rr(px2 - (align === 'left' ? 3 : pw - 3), y - ph / 2, pw, ph, 3); ctx.fill();
        ctx.fillStyle = FLOOR_NUM; ctx.textAlign = 'center';
        ctx.fillText(String(f), px2 - (align === 'left' ? 3 : pw - 3) + pw / 2, y);
      };
      plate(geo.leftX + 9, 'left');
      if (geo.rightW > 0) plate(geo.rightX + geo.rightW - 9, 'right');
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }
  function drawFire(now) {
    const f = level.fire, top = roomTop(f), h = geo.floorPx;
    const d = smoke[f];
    if (d < 0.02) return;
    const flick = REDUCED ? 0.85 : 0.78 + 0.22 * Math.sin(now / 90) * Math.sin(now / 37);
    const fx = geo.leftX + 4, fw = Math.max(18, geo.corW * 0.16);
    ctx.save();
    ctx.beginPath(); rr(geo.x - 6, geo.y - 8, geo.w + 12, geo.h + 8, 8); ctx.clip();
    const g = ctx.createLinearGradient(fx, 0, fx + fw * 2.4, 0);
    g.addColorStop(0, 'rgba(' + FLAME + ',' + (0.42 * d * flick).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(' + FLAME + ',0)');
    ctx.fillStyle = g; ctx.fillRect(fx - 4, top, fw * 2.4, h);
    if (geo.rightW > 0) {
      const gx = geo.rightX + geo.rightW - 4;
      const g2 = ctx.createLinearGradient(gx, 0, gx - fw * 2.4, 0);
      g2.addColorStop(0, 'rgba(' + FLAME + ',' + (0.42 * d * flick).toFixed(3) + ')');
      g2.addColorStop(1, 'rgba(' + FLAME + ',0)');
      ctx.fillStyle = g2; ctx.fillRect(gx - fw * 2.4 + 4, top, fw * 2.4, h);
    }
    ctx.restore();
  }

  /* `stand` is 1 at the lift doors and 0 at the far wall. The desktop frame
     lays the queue across both corridors, so odd slots are mirrored into the
     right-hand one at the same depth - same clock, different side. */
  function personXY(p) {
    const base = slabY(p.floor) - 3;
    /* Inset by half a figure. The person standing deepest is at 0.04 of the
       corridor, and drawn straight off that fraction half of them hung outside
       the building. The inset is about 2.5% of the corridor, so where the
       smoke front appears to reach them is unchanged to the eye. */
    const m = geo.floorPx * 0.14;
    const onRight = geo.rightW > 0 && (p.slot % 2 === 1);
    if (onRight) return { x: geo.rightX + m + (geo.rightW - m * 2) * (1 - p.stand), y: base, face: -1 };
    return { x: geo.leftX + m + (geo.corW - m * 2) * p.stand, y: base, face: 1 };
  }
  const personX = (stand, right) => (right
    ? geo.rightX + geo.floorPx * 0.14 + (geo.rightW - geo.floorPx * 0.28) * (1 - stand)
    : geo.leftX + geo.floorPx * 0.14 + (geo.corW - geo.floorPx * 0.28) * stand);

  function drawPeople(now) {
    smokeLayer(0.72, now);                                   // the bulk of it, behind the people
    for (const p of waiting) {
      const q = personXY(p);
      /* A SOFT DARK HALO, NOT AN OUTLINE. Measured on the painted pixel: in a
         full corridor a figure came out at 1.13:1 against the wall behind it,
         because the smoke lifts the person and the wall to the same grey. The
         fix is a value edge that arrives WITH the smoke - the corridor darkens
         right around somebody standing in it - so a clear corridor keeps clean
         figures and a smoky one still tells you who is in there. */
      const haze = Math.max(0, Math.min(1, (smoke[p.floor] - p.stand + 0.10) / 0.34));
      const h = geo.floorPx * 0.52;
      {
        /* It HOLDS at full darkness across the figure and only then falls
           away. A plain radial put its mid-falloff right where the body is, so
           the ground beside somebody was only half darkened and the body still
           measured 1.96:1. */
        /* A TALL SOFT SHADOW, not a disc. Held at full darkness across the
           whole figure it measured 5.38:1 against a 3:1 bar and looked like a
           spotlight; there is headroom to spend on making it a shape that
           belongs in the picture. Elliptical, because a person is taller than
           they are wide, and with a long tail so it has no edge. Peak and hold
           are the two dials: 0.90/0.62 measured 5.38:1 and looked like a
           spotlight, 0.70/0.34 looked right and fell to 2.48 against a 3:1
           bar. These are the numbers that do both. */
        /* ALWAYS ON, not only in smoke. Once people stood down the corridor
           rather than by the doors they ended up in front of the guest doors,
           and a figure against a pale door measured 1.57:1 with nothing behind
           it. A contact shadow is what illustration uses for exactly this, and
           it deepens as the smoke arrives. */
        const a = (0.48 + 0.50 * haze).toFixed(3);
        ctx.save();
        ctx.translate(q.x, q.y - h * 0.48);
        ctx.scale(1, 1.34);
        const g = ctx.createRadialGradient(0, 0, h * 0.08, 0, 0, h * 0.92);
        g.addColorStop(0, 'rgba(11,16,32,' + a + ')');
        g.addColorStop(0.56, 'rgba(11,16,32,' + a + ')');
        g.addColorStop(1, 'rgba(11,16,32,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-h * 1.1, -h * 1.1, h * 2.2, h * 2.2);
        ctx.restore();
      }
      drawFigure(q.x, q.y, h, p.exp, now);
    }
  }

  /* No faces, no outline, and nothing drawn over anybody. Exposure is a breath
     arc that empties AND a figure that crouches lower: two channels, so it is
     never colour alone. */
  function drawFigure(cx, baseY, h, exp, now) {
    const crouch = 1 - 0.22 * ease(Math.max(0, (exp - 0.35) / 0.65));
    h = h * crouch;
    const headR = h * 0.19, bodyW = h * 0.42, bodyH = h - headR * 2 - h * 0.04;
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.ellipse(cx, baseY + 1, bodyW * 0.66, h * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createLinearGradient(0, baseY - bodyH, 0, baseY);
    g.addColorStop(0, BODY_HI); g.addColorStop(1, BODY_LO);
    ctx.fillStyle = g;
    const bt = baseY - bodyH, sh = bodyW * 0.36;
    ctx.beginPath();
    ctx.moveTo(cx - bodyW / 2, baseY);
    ctx.lineTo(cx - bodyW / 2, bt + sh);
    ctx.quadraticCurveTo(cx - bodyW / 2, bt, cx - bodyW / 2 + sh, bt);
    ctx.lineTo(cx + bodyW / 2 - sh, bt);
    ctx.quadraticCurveTo(cx + bodyW / 2, bt, cx + bodyW / 2, bt + sh);
    ctx.lineTo(cx + bodyW / 2, baseY);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = HEAD;
    ctx.beginPath(); ctx.arc(cx, bt - headR * 0.82, headR, 0, Math.PI * 2); ctx.fill();

    // the breath arc: how long they have, above their head
    const left = Math.max(0, 1 - exp);
    const r = Math.max(7, h * 0.30), ay = bt - headR * 2.2;
    /* A DARK track, not a light one. The arc is the only thing telling you how
       long somebody has, and a coral arc on grey smoke measured 1.06:1. On a
       dark track it reads on any ground the corridor can be in. */
    const lw = Math.max(2, h * 0.055);
    ctx.lineCap = 'round';
    ctx.lineWidth = lw + 3;
    ctx.strokeStyle = 'rgba(11,16,32,0.78)';
    ctx.beginPath(); ctx.arc(cx, ay, r, Math.PI * 1.13, Math.PI * 1.87); ctx.stroke();
    ctx.lineWidth = lw;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath(); ctx.arc(cx, ay, r, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.strokeStyle = left > 0.55 ? BREATH_OK : left > 0.28 ? BREATH_MID : BREATH_LOW;
    const a0 = Math.PI * 1.15, a1 = a0 + (Math.PI * 0.70) * left;
    if (left > 0.001) { ctx.beginPath(); ctx.arc(cx, ay, r, a0, a1); ctx.stroke(); }
    if (exp > FIRE.warnAt && !REDUCED) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 130);
      ctx.strokeStyle = 'rgba(240,90,70,' + (0.35 * pulse).toFixed(3) + ')';
      ctx.lineWidth = Math.max(3, h * 0.09);
      ctx.beginPath(); ctx.arc(cx, ay, r, a0, a1 + 0.001); ctx.stroke();
    }
  }

  function drawSpill() {
    if (doorOpen <= 0.01) return;
    const base = slabY(serveFloor), top = base - geo.floorPx;
    const sides = [{ x0: geo.shaftX, dir: -1, w: geo.corW, cx: geo.leftX }];
    if (geo.rightW > 0) sides.push({ x0: geo.shaftX + geo.shaftW, dir: 1, w: geo.rightW, cx: geo.rightX });
    for (const s of sides) {
      const reach = Math.max(24, s.w * 0.55) * doorOpen;
      const g = ctx.createLinearGradient(s.x0, 0, s.x0 + s.dir * reach, 0);
      g.addColorStop(0, 'rgba(255,214,120,' + (0.35 * doorOpen).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.save();
      ctx.beginPath(); ctx.rect(s.cx, top - 4, s.w, geo.floorPx + 2); ctx.clip();
      ctx.beginPath();
      ctx.moveTo(s.x0, top + geo.floorPx * 0.18);
      ctx.lineTo(s.x0 + s.dir * reach, top - geo.floorPx * 0.10);
      ctx.lineTo(s.x0 + s.dir * reach, base + geo.floorPx * 0.16);
      ctx.lineTo(s.x0, base);
      ctx.closePath();
      ctx.fillStyle = g; ctx.fill();
      ctx.restore();
    }
  }

  function drawShaft() {
    ctx.fillStyle = SHAFT;
    ctx.fillRect(geo.shaftX, geo.y, geo.shaftW, geo.h);
    const carTop = carBaseY() - geo.carH;
    const speed = Math.min(1, Math.abs(car.v) / T.vMax);
    const smear = REDUCED ? 0 : speed * 3;
    for (const f of [0.32, 0.68]) {
      const cx = geo.shaftX + geo.shaftW * f;
      ctx.fillStyle = CABLE;
      ctx.fillRect(cx - 1, geo.y, 2, Math.max(0, carTop - geo.y));
      if (smear > 0.2) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(cx - 1 - smear, geo.y, 2, Math.max(0, carTop - geo.y));
        ctx.fillRect(cx - 1 + smear, geo.y, 2, Math.max(0, carTop - geo.y));
      }
    }
  }

  function carBaseY() {
    const settle = settleT > 0 ? Math.sin(settleT * Math.PI) * 4 * settleDir : 0;
    return geo.y + (floors() - car.y + 1) * geo.floorPx + sag + settle;
  }

  function drawCar(now) {
    const w = geo.carW, h = geo.carH;
    const x = Math.round(geo.shaftX + (geo.shaftW - w) / 2);
    const yb = carBaseY(), y = Math.round(yb - h);
    const speed = Math.min(1, Math.abs(car.v) / T.vMax);
    if (!REDUCED && speed > 0.25) {
      ctx.globalAlpha = 0.20 * speed; ctx.fillStyle = CAR_MID;
      rr(x, y + (car.v > 0 ? 4 : -4), w, h, 6); ctx.fill();
      ctx.globalAlpha = 1;
    }
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, CAR_HI); g.addColorStop(0.45, CAR_MID); g.addColorStop(1, CAR_LO);
    ctx.fillStyle = g; rr(x, y, w, h, 6); ctx.fill();
    ctx.fillStyle = CAR_BEVEL; ctx.fillRect(x + 4, y + 2, w - 8, 2);

    const ix = x + 6, iy = y + 8, iw = w - 12, ih = h - 14;
    ctx.save();
    ctx.beginPath(); rr(ix, iy, iw, ih, 3); ctx.clip();
    ctx.fillStyle = CAR_IN; ctx.fillRect(ix, iy, iw, ih);
    // the riders, and the air they are breathing
    if (aboard.length) {
      const n = aboard.length;
      for (let i = 0; i < n; i++) {
        const hx = ix + iw * ((i + 0.5) / n);
        ctx.fillStyle = HEAD_WARM;
        ctx.beginPath(); ctx.arc(hx, iy + ih * 0.40, Math.max(2.5, ih * 0.15), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(201,134,30,0.35)';
        rr(hx - iw * 0.09, iy + ih * 0.56, iw * 0.18, ih * 0.34, iw * 0.05); ctx.fill();
      }
    }
    if (carSmoke > 0.02) {
      ctx.fillStyle = 'rgba(' + SMOKE + ',' + Math.min(0.62, carSmoke * 0.7).toFixed(3) + ')';
      ctx.fillRect(ix, iy, iw, ih);
    }
    const leaf = (iw / 2) * (1 - doorOpen);
    const dg = ctx.createLinearGradient(ix, iy, ix, iy + ih);
    dg.addColorStop(0, CAR_MID); dg.addColorStop(1, CAR_LO);
    ctx.fillStyle = dg;
    ctx.fillRect(ix, iy, leaf, ih); ctx.fillRect(ix + iw - leaf, iy, leaf, ih);
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.fillRect(ix, iy, leaf, ih); ctx.fillRect(ix + iw - leaf, iy, leaf, ih);
    if (leaf > 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(ix + leaf - 1, iy, 1.5, ih);
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(ix + iw - leaf, iy, 1, ih);
    }
    ctx.restore();

    // the handle: drawn at rest always, pulsing once at the start of a level.
    const ha = 0.34 + (handlePulse > 0 ? Math.sin(handlePulse * Math.PI) * 0.55 : 0);
    const hy = y - Math.max(9, geo.floorPx * 0.13);
    ctx.strokeStyle = 'rgba(255,232,176,' + ha.toFixed(3) + ')';
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const s = Math.max(4, geo.floorPx * 0.07), mx = x + w / 2;
    ctx.beginPath();
    ctx.moveTo(mx - s, hy + s * 0.4); ctx.lineTo(mx, hy - s * 0.5); ctx.lineTo(mx + s, hy + s * 0.4); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx - s, hy + s * 1.5); ctx.lineTo(mx, hy + s * 2.4); ctx.lineTo(mx + s, hy + s * 1.5); ctx.stroke();
    void now;
  }

  function drawPuffs() {
    for (const p of puffs) {
      const t = ease(p.t);
      const base = slabY(p.floor) - 3;
      const x = p.kind === 'out'
        ? geo.leftX + geo.corW * 0.25
        : (geo.rightW > 0 && p.side ? geo.rightX + geo.rightW * 0.35 : geo.leftX + geo.corW * 0.65);
      const y = base - geo.floorPx * (0.3 + 0.35 * t);
      ctx.globalAlpha = (1 - t) * 0.55;
      ctx.fillStyle = p.kind === 'out' ? 'rgba(143,227,200,0.9)' : 'rgba(200,200,210,0.85)';
      ctx.beginPath(); ctx.arc(x, y, Math.max(4, geo.floorPx * 0.10) * (0.6 + t), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- CHROME ---------- */
  function drawHud() {
    for (const c of ctrl) {
      if (c.icon) { UI.drawPill(ctx, '', c.cx, c.cy, { w: UI.PILL.iconW }); drawSpeaker(c.cx, c.cy, !sfx || sfx.isOn()); }
      else UI.drawPill(ctx, c.label, c.cx, c.cy);
    }
    const inside = waiting.length + aboard.length;
    /* Both halves of the comparison, and the damage when there is any: a count
       that only goes up tells you nothing about whether you are still winning. */
    const line = 'LEVEL ' + (levelIndex + 1) + '   ·   OUT ' + out + ' / ' + totalPeople() +
                 '   ·   ' + inside + ' INSIDE' + (lost ? '   ·   ' + lost + ' BEHIND' : '');
    const hs = Math.max(0.66, Math.min(1, LW / 620));
    let fs = Math.round(16 * hs);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = INK72; ctx.font = '600 ' + fs + 'px Inter, sans-serif';
    while (fs > 11 && ctx.measureText(line).width > (LW - SIDE_PAD) - readoutMinX) {
      fs -= 1; ctx.font = '600 ' + fs + 'px Inter, sans-serif';
    }
    ctx.fillText(line, LW - SIDE_PAD, topBand() / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    if (MODE === 'mobile' && statusLane() > 0 && levelIndex < 3 && tNow < 14) {
      ctx.fillStyle = 'rgba(255,255,255,0.44)';
      ctx.font = '600 14px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('drag the car · let go to stop · take them to the lobby', LW / 2, geo.y + geo.h + statusLane() / 2 + 4);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }
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

  /* ---------- THE CARD AT THE END ----------
     Nobody dies and nothing is drawn over a person. When you do not get
     everybody out the card says how many you did and NAMES THE FLOOR that was
     still waiting, because that is the thing worth remembering and it is what
     brings you back. */
  let endCTA = null;
  function endBox() {
    const pw = Math.min(LW - 56, 430), ph = Math.min(LH - 20, 300);
    return { px: Math.round((LW - pw) / 2), py: Math.max(10, Math.round((LH - ph) / 2)), pw, ph };
  }
  function drawEndCard() {
    const b = endBox();
    ctx.fillStyle = 'rgba(10,16,28,0.82)'; ctx.fillRect(0, 0, LW, LH);
    ctx.fillStyle = SURFACE; rr(b.px, b.py, b.pw, b.ph, 22); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    rr(b.px, b.py, b.pw, b.ph, 22); ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#FFFFFF'; ctx.font = '800 34px Inter, sans-serif';
    ctx.fillText(won ? 'EVERYONE OUT' : out + ' OF ' + totalPeople() + ' OUT', b.px + b.pw / 2, b.py + 34);

    ctx.font = '600 17px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    let sub;
    if (won) sub = 'Level ' + (levelIndex + 1) + ' · ' + stopsMade + ' stops, par ' + level.par;
    else {
      const uniq = [...new Set(lostFloors)].sort((a, b2) => b2 - a);
      sub = uniq.length === 1 ? 'Floor ' + uniq[0] + ' was still waiting.'
          : 'Floors ' + uniq.slice(0, 3).join(', ') + ' were still waiting.';
    }
    ctx.fillText(sub, b.px + b.pw / 2, b.py + 84);

    ctx.font = '500 16px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.fillText(won ? (levelIndex < LEVELS.length - 1 ? 'The brigade takes it from here.' : 'That is every building. Well driven.')
                     : 'The brigade reached them after you.',
                 b.px + b.pw / 2, b.py + 118);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    const label = won ? (levelIndex < LEVELS.length - 1 ? 'NEXT BUILDING' : 'PLAY AGAIN') : 'TRY AGAIN';
    endCTA = UI.drawCTA(ctx, label, b.px + b.pw / 2, b.py + b.ph - 40 - 25, CORAL);
  }
  function onEndPointer(p) {
    if (endCTA && p.x >= endCTA.x && p.x <= endCTA.x + endCTA.w && p.y >= endCTA.y && p.y <= endCTA.y + endCTA.h) advanceFromCard();
  }

  /* ---------- RULES ---------- */
  const RULES_TEXT = [
    'The hotel is on fire. Smoke rises from the burning floor and fills the corridors above it. The way out is the lobby.',
    'Drag the car in the shaft, or hold the up and down keys. It is heavy: it lags behind your hand and keeps going when you let go.',
    'Land it level with a corridor and the doors open. Between floors they stay shut until you nudge it, and that costs you seconds you need.',
    'The arc over someone is the air they have left. Four fit in the car. Every door you open lets smoke in, so a stop you did not need costs everyone aboard.',
  ];
  let rulesGeom = null, rulesCTA = null;
  function rulesBox() {
    const pw = Math.min(LW - 56, 470), ph = Math.min(LH - 20, 420);
    return { px: Math.round((LW - pw) / 2), py: Math.max(10, Math.round((LH - ph) / 2)),
             pw, ph, header: 154, footer: 98, body: ph - 154 - 98 };
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
    ctx.fillText('Get everybody out before the smoke does.', b.px + 43, b.py + 34 + 54);

    const bodyY = b.py + b.header, bodyH = b.body;
    ctx.save();
    ctx.beginPath(); ctx.rect(b.px, bodyY, b.pw, bodyH); ctx.clip();
    let y = bodyY - rulesScroll;
    const demoH = 92;
    drawDemo(b.px + 43, y, b.pw - 86, demoH, now);
    y += demoH + 18;
    RULES_TEXT.forEach((line, i) => {
      ctx.beginPath(); ctx.arc(b.px + 43, y + 11, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#FF6B5C'; ctx.fill();                 // --accent-text
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

  /* The eight-second wordless loop: a corridor filling with smoke, the car
     coming up too fast and landing between floors, the nudge, the doors, and
     the ride down to the lobby. The whole verb, in the order you meet it. */
  function drawDemo(x, y, w, h, now) {
    const t = (now / 1000) % 8;
    const rows = 3, fh = h / rows;
    const shaftW = Math.round(w * 0.16), corW = w - shaftW, sx = x + corW;
    ctx.save();
    ctx.beginPath(); rr(x, y, w, h, 6); ctx.clip();
    for (let r = 0; r < rows; r++) {
      ctx.fillStyle = (r % 2) ? WALL_A : WALL_B;
      ctx.fillRect(x, y + r * fh, corW, fh);
      ctx.fillStyle = CEIL; ctx.fillRect(x, y + r * fh, corW, 2);
      ctx.fillStyle = SKIRT; ctx.fillRect(x, y + (r + 1) * fh - 2, corW, 2);
      ctx.fillStyle = 'rgba(142,151,171,0.85)';
      rr(x + 8 + r * 3, y + (r + 1) * fh - 2 - fh * 0.5, fh * 0.28, fh * 0.5, 1); ctx.fill();
    }
    ctx.fillStyle = 'rgba(143,227,200,0.22)';
    rr(x + corW - 26, y + h - 2 - fh * 0.55, 18, fh * 0.55, 2); ctx.fill();
    ctx.fillStyle = SHAFT; ctx.fillRect(sx, y, shaftW, h);
    // smoke building in the top corridor
    const dens = Math.min(1, t / 5);
    const sg = ctx.createLinearGradient(0, y, 0, y + fh);
    sg.addColorStop(0, 'rgba(' + SMOKE + ',' + (0.55 * dens).toFixed(3) + ')');
    sg.addColorStop(1, 'rgba(' + SMOKE + ',' + (0.10 * dens).toFixed(3) + ')');
    ctx.fillStyle = sg; ctx.fillRect(x, y, corW, fh);

    let cf, open = 0, aboardN = 0, personIn = true;
    if (t < 1.0) cf = 2;
    else if (t < 2.5) cf = 2 - 2.4 * ease((t - 1.0) / 1.5);
    else if (t < 3.2) cf = -0.4;
    else if (t < 3.9) cf = -0.4 + 0.4 * ease((t - 3.2) / 0.7);
    else if (t < 4.7) { cf = 0; open = ease((t - 3.9) / 0.8); }
    else if (t < 5.5) { cf = 0; open = 1; personIn = t < 5.1; aboardN = t >= 5.1 ? 1 : 0; }
    else if (t < 6.1) { cf = 0; open = 1 - ease((t - 5.5) / 0.6); aboardN = 1; }
    else if (t < 7.4) { cf = 2 * ease((t - 6.1) / 1.3); aboardN = 1; }
    else { cf = 2; open = ease((t - 7.4) / 0.6); aboardN = 0; }

    if (open > 0.02) {
      const reach = corW * 0.45 * open, ty = y + (cf + 0) * fh;
      const lg = ctx.createLinearGradient(sx, 0, sx - reach, 0);
      lg.addColorStop(0, 'rgba(255,214,120,' + (0.35 * open).toFixed(3) + ')');
      lg.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = lg; ctx.fillRect(sx - reach, ty, reach, fh);
    }
    if (personIn) {
      const px2 = x + corW * 0.72, pb = y + fh - 3;
      drawTinyFigure(px2, pb, fh * 0.46);
    }
    const carH = fh - 6, carW = shaftW - 5;
    const cxx = sx + (shaftW - carW) / 2, cyy = y + (cf + 1) * fh + (t >= 2.5 && t < 3.2 ? 2 : 0) - carH;
    ctx.fillStyle = CABLE; ctx.fillRect(sx + shaftW * 0.5 - 1, y, 2, Math.max(0, cyy - y));
    const cg = ctx.createLinearGradient(0, cyy, 0, cyy + carH);
    cg.addColorStop(0, CAR_HI); cg.addColorStop(0.45, CAR_MID); cg.addColorStop(1, CAR_LO);
    ctx.fillStyle = cg; rr(cxx, cyy, carW, carH, 4); ctx.fill();
    const ix = cxx + 3, iy = cyy + 4, iw = carW - 6, ih = carH - 7;
    ctx.save();
    ctx.beginPath(); rr(ix, iy, iw, ih, 2); ctx.clip();
    ctx.fillStyle = CAR_IN; ctx.fillRect(ix, iy, iw, ih);
    if (aboardN) { ctx.fillStyle = HEAD_WARM; ctx.beginPath(); ctx.arc(ix + iw / 2, iy + ih * 0.4, ih * 0.2, 0, Math.PI * 2); ctx.fill(); }
    const leaf = (iw / 2) * (1 - open);
    ctx.fillStyle = CAR_LO;
    ctx.fillRect(ix, iy, leaf, ih); ctx.fillRect(ix + iw - leaf, iy, leaf, ih);
    ctx.restore();
    ctx.restore();
  }
  function drawTinyFigure(cx, baseY, h) {
    const headR = h * 0.2, bw = h * 0.42, bh = h - headR * 2;
    const g = ctx.createLinearGradient(0, baseY - bh, 0, baseY);
    g.addColorStop(0, BODY_HI); g.addColorStop(1, BODY_LO);
    ctx.fillStyle = g; rr(cx - bw / 2, baseY - bh, bw, bh, bw * 0.3); ctx.fill();
    ctx.fillStyle = HEAD; ctx.beginPath(); ctx.arc(cx, baseY - bh - headR * 0.8, headR, 0, Math.PI * 2); ctx.fill();
  }

  function onRulesPointer(p) {
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

  /* ---------- DETECTORS ---------- */
  window.rulesFit = function () {
    const was = rulesOpen; rulesOpen = true;
    drawRulesCard(performance.now());
    rulesOpen = was;
    const b = rulesBox();
    const contentH = rulesGeom ? rulesGeom.contentH : 0;
    return { fits: (b.header + b.body + b.footer === b.ph) && b.py >= 0 && b.py + b.ph <= LH,
             cardH: b.ph, frameH: LH, viewportH: b.body, contentH,
             scrollMax: Math.max(0, contentH - b.body), overlapPx: Math.max(0, (b.py + b.ph) - LH) };
  };
  window.layoutFit = function () {
    const ctrlTop = ctrl.length ? Math.min.apply(null, ctrl.map(c => c.y)) : LH;
    const top = topBand(), bot = LH - botBand();
    return {
      mode: MODE, LW, LH, floors: floors(), floorPx: geo.floorPx, shaftW: geo.shaftW, corW: geo.corW,
      buildTop: geo.y, buildBottom: geo.y + geo.h,
      overTop: Math.max(0, top - geo.y),
      overBottom: Math.max(0, (geo.y + geo.h) - (bot - statusLane())),
      ctrlOverlap: MODE === 'mobile' ? Math.max(0, (geo.y + geo.h) - ctrlTop) : 0,
      fits: geo.y >= top && (geo.y + geo.h) <= (bot - statusLane()) && geo.corW > 40 && geo.shaftW >= 30,
    };
  };
  window.endFit = function () {
    const b = endBox();
    return { fits: b.py >= 0 && b.py + b.ph <= LH, cardH: b.ph, frameH: LH,
             overlapPx: Math.max(0, (b.py + b.ph) - LH) };
  };
  window.lift = {
    get car() { return car; }, get phase() { return phase; }, get out() { return out; },
    get lost() { return lost; }, get waiting() { return waiting; }, get aboard() { return aboard; },
    get smoke() { return Array.from(smoke || []); }, get carSmoke() { return carSmoke; },
    get level() { return level; }, get levelIndex() { return levelIndex; },
    geo, LEVELS, start: startLevel,
    /* Drive headlessly, for verification: hold a direction, then let go and let
       it brake to rest and serve. */
    drive(dir, secs) {
      const dt = 1 / 120;
      for (let t = 0; t < secs; t += dt) { keyDir = dir; step(dt); }
      keyDir = 0;
      for (let i = 0; i < 2400 && (Math.abs(car.v) > 1e-6 || phase === 'serve'); i++) step(dt);
      return { y: car.y, out, lost, phase };
    },
  };

  /* ---------- BOOT ---------- */
  let last = 0, acc = 0;
  const DT = 1 / 120;
  function frame(now) {
    if (!last) last = now;
    const raw = Math.min(0.25, (now - last) / 1000); last = now;
    if (!document.hidden && !rulesOpen) {
      acc += raw;
      let guard = 0;
      while (acc >= DT && guard++ < 60) { step(DT); acc -= DT; }
    } else acc = 0;
    render(now);
    requestAnimationFrame(frame);
  }

  startLevel(loadSave());
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
  TR().gameStart();
  requestAnimationFrame(frame);
})();
