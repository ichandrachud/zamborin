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

  /* A WARM, LIT HOTEL CORRIDOR. The building used to be dark navy, which was
     wrong twice over: it did not look like a hotel, and it gave dark smoke
     nothing to obscure, so the smoke read as a slightly darker dark. A lit
     corridor fixes both - smoke works by BLOCKING LIGHT, and there is finally
     some light for it to block. Reference register only; nothing is traced. */
  const SHELL_TOP = '#3A2438', SHELL_BOT = '#2A1A2C';    // the shell behind it all
  const CEIL_HI = '#F7C877', CEIL_LO = '#E9A751';
  const CORNICE = '#C4703A';
  const WALL_HI = '#F2AC42', WALL_LO = '#DD8F2F';
  const WAINSCOT = '#D2812B', CHAIR_RAIL = '#B8642C';
  const SKIRT_C = '#A8492F';
  const FLOOR_HI = '#6E5070', FLOOR_LO = '#4B3552';
  const DOOR_DARK = '#2B2331', DOOR_PANEL = '#372B3E', DOOR_EDGE = '#1D1723';
  const ARCH = '#F8C97E';
  const HANDLE = '#E8B44C';
  const PLAQUE = '#241C28', PLAQUE_INK = '#F4E9D6';
  const SCONCE = '#FFE6B4';
  const FRAME_C = '#7A4A3A', FRAME_MAT = '#F6E8D8', FRAME_ART = '#C9685F';
  const PLANT_C = '#4E8A54', POT_C = '#EDE6DC';
  const LAMP = '#FFD98A';
  const CARPET = '#8E3A34';
  const SHAFT = '#0B1020', CABLE = 'rgba(255,255,255,0.08)';
  const CAR_HI = '#FFD98A', CAR_MID = '#E8B44C', CAR_LO = '#C9861E';
  const CAR_BEVEL = 'rgba(255,255,255,0.35)';
  const CAR_IN = '#FFE8B0', HEAD_WARM = '#FFF4E6';
  /* DARK CLOTHES, LIGHT HEAD AND HANDS. On a lit wall a figure has to be dark
     to read; inside dark smoke it has to be light. No single value does both -
     against a wall at 0.48 you need at most 0.13, against smoke at 0.10 you
     need at least 0.40 - so the figure carries BOTH. Dark clothing separates
     it from the corridor, a light head and hands separate it from the smoke,
     and that is also just what a person looks like. */
  const BODY_HI = '#4A4258', BODY_LO = '#2F2A3D';        // clothing
  const HEAD = '#F0D8BE', SKIN_HI = '#FFE9D2';           // head and hands
  /* DARK SMOKE, like Empyrean's, with a lit top surface. Pale smoke is what
     forced a dark halo behind every person - a light figure had nothing to sit
     against once a corridor filled. A dark mass fixes that at the source, it
     is what smoke over a fire actually looks like, and it reads because it
     SWALLOWS the corridor: the lamps, the doors and the runner disappear
     behind it as it comes. The top of the layer catches the ceiling lamps, so
     the leading edge still has a bright rim to read the clock off. */
  const SMOKE = '78,74,88';
  const SMOKE_LIT = '186,182,196';
  const SMOKE_LIT_WARM = '224,190,150';
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
  let puffs = [], runners = [], tNow = 0, endT = 0, won = false;
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
    departed = false; stopsMade = 0; puffs = []; runners = []; tNow = 0; endT = 0; won = false;
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
    for (const r of runners) r.t += dt;
    runners = runners.filter(r => r.t < r.dur);
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
        aboard.forEach((p, i) => {
          out++;
          const right = geo.rightW > 0 && (i % 2 === 1);
          runners.push({ floor: 1, kind: 'out', seed: p.id + 1, t: 0, dur: 0.85,
            x0: right ? geo.shaftX + geo.shaftW + 4 : geo.shaftX - 4,
            x1: right ? geo.rightX + geo.rightW * 0.86 : geo.leftX + geo.corW * 0.14 });
        });
        if (aboard.length && sfx) sfx.play('pop');
        aboard = [];
      } else {
        const here = waiting.filter(p => p.floor === serveFloor).sort((a, b) => b.exp - a.exp);
        const take = here.slice(0, T.capacity - aboard.length);
        if (take.length) {
          const ids = new Set(take.map(p => p.id));
          for (const p of take) {
            const q = personXY(p);
            runners.push({ floor: serveFloor, kind: 'in', seed: p.id + 1, t: 0, dur: T.boardS,
              x0: q.x, x1: q.face > 0 ? geo.shaftX - 3 : geo.shaftX + geo.shaftW + 3 });
            aboard.push(p);
          }
          waiting = waiting.filter(p => !ids.has(p.id));
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
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(geo.x - 10, geo.y - 12, geo.w + 20, 4);     // the roof line
  }

  /* THE CORRIDOR IS BAKED. It is a warm lit hallway with a ceiling, a cornice,
     a chair rail, a skirting, guest doors recessed in their architraves with
     numbered plaques over them, wall sconces, pictures and a runner - and none
     of it ever changes during a level. Drawing that lot per floor per frame
     would be absurd, so each corridor is rendered once into its own canvas and
     blitted. The whole static hotel costs one drawImage a floor.

     Rebuilt when the layout changes or a level starts, because which doors are
     omitted depends on where that level's guests are standing. */
  let bakeKey = '', baked = {};
  function corridorKey() {
    return [geo.corW, geo.rightW, geo.floorPx, floors(), levelIndex].join('|');
  }
  function bakeCorridors() {
    baked = {};
    const F = floors();
    for (let f = 1; f <= F; f++) {
      baked['L' + f] = bakeCorridor(geo.corW, geo.floorPx, f, 'left');
      if (geo.rightW > 0) baked['R' + f] = bakeCorridor(geo.rightW, geo.floorPx, f, 'right');
    }
    bakeKey = corridorKey();
  }

  function bakeCorridor(w, h, f, side) {
    const c = document.createElement('canvas');
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
    const b = c.getContext('2d');
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    const right = side === 'right';
    // mirror the right-hand corridor so both run "outward from the lift"
    if (right) { b.translate(w, 0); b.scale(-1, 1); }
    paintCorridor(b, w, h, f, f === 1);
    return c;
  }

  /* Everything is drawn in a corridor that runs left-to-right with the LIFT AT
     THE RIGHT-HAND END, and the right-hand corridor is mirrored on the way
     out. One piece of drawing code, both sides. */
  function paintCorridor(b, w, h, f, isLobby) {
    const ceilH = Math.max(4, h * 0.10);
    const railY = h * 0.60;
    const skirtH = Math.max(3, h * 0.075);
    const floorH = Math.max(3, h * 0.055);
    const wallBot = h - skirtH - floorH;
    const tone = (f % 2) ? 0 : -4;                       // a touch of variation per floor

    const shade = (hex, d) => {
      const n = parseInt(hex.slice(1), 16);
      const cl = v => Math.max(0, Math.min(255, v + d));
      return 'rgb(' + cl(n >> 16) + ',' + cl((n >> 8) & 255) + ',' + cl(n & 255) + ')';
    };

    // ceiling
    const cg = b.createLinearGradient(0, 0, 0, ceilH);
    cg.addColorStop(0, shade(CEIL_HI, tone)); cg.addColorStop(1, shade(CEIL_LO, tone));
    b.fillStyle = cg; b.fillRect(0, 0, w, ceilH);
    b.fillStyle = CORNICE; b.fillRect(0, ceilH, w, Math.max(2, h * 0.022));

    // wall
    const wg = b.createLinearGradient(0, ceilH, 0, wallBot);
    wg.addColorStop(0, shade(WALL_HI, tone)); wg.addColorStop(1, shade(WALL_LO, tone));
    b.fillStyle = wg; b.fillRect(0, ceilH, w, wallBot - ceilH);
    // lower wall below the chair rail is a shade deeper
    b.fillStyle = shade(WAINSCOT, tone); b.fillRect(0, railY, w, wallBot - railY);
    b.fillStyle = CHAIR_RAIL; b.fillRect(0, railY - Math.max(1.5, h * 0.014), w, Math.max(2, h * 0.020));

    // skirting and the floor beyond it
    b.fillStyle = SKIRT_C; b.fillRect(0, wallBot, w, skirtH);
    const fg = b.createLinearGradient(0, wallBot + skirtH, 0, h);
    fg.addColorStop(0, FLOOR_HI); fg.addColorStop(1, FLOOR_LO);
    b.fillStyle = fg; b.fillRect(0, wallBot + skirtH, w, h - wallBot - skirtH);

    if (isLobby) { paintLobby(b, w, h, ceilH, wallBot, skirtH); }
    else { paintDoors(b, w, h, ceilH, railY, wallBot, f); }

    // the runner, leading away toward the lift
    const rin = Math.round(w * 0.04), rh = Math.max(3, floorH * 0.72);
    b.fillStyle = CARPET;
    b.fillRect(rin, wallBot + skirtH + (floorH - rh) / 2, w - rin * 2, rh);

    // ceiling lights, and the pool each one throws down the wall
    const bays = Math.max(2, Math.round(w / (h * 1.05)));
    for (let i = 0; i < bays; i++) {
      const lx = w * ((i + 0.5) / bays);
      const g2 = b.createRadialGradient(lx, ceilH, 2, lx, ceilH, h * 0.95);
      g2.addColorStop(0, 'rgba(255,231,176,0.34)');
      g2.addColorStop(0.45, 'rgba(255,225,160,0.11)');
      g2.addColorStop(1, 'rgba(255,220,150,0)');
      b.fillStyle = g2; b.fillRect(0, 0, w, h);
      b.fillStyle = LAMP;
      const lw = Math.max(8, h * 0.15);
      b.fillRect(lx - lw / 2, Math.max(1, ceilH * 0.35), lw, Math.max(2, h * 0.030));
    }
  }

  /* Guest doors: recessed into a lighter architrave, a numbered plaque over
     each one and a brass handle. Doors are omitted where somebody is standing,
     both because a figure in a doorway looks wrong and because a pale door
     behind a figure costs it its contrast. */
  function paintDoors(b, w, h, ceilH, railY, wallBot, f) {
    const doorH = (wallBot - ceilH) * 0.86, doorW = doorH * 0.52;
    const lobby = Math.max(doorW * 1.4, w * 0.18);
    const runX = 6, runW = w - lobby - 6;
    const n = Math.max(1, Math.min(4, Math.floor(runW / (doorW * 2.3))));
    const gap = runW / n;
    const stands = (standsBy[f] || []).map(s => personXInCorridor(s.stand, w));
    const keepOut = doorW * 0.5 + geo.floorPx * 0.52 * 0.24;

    for (let i = 0; i < n; i++) {
      const cx = runX + gap * (i + 0.5);
      if (stands.some(px2 => Math.abs(px2 - cx) < keepOut)) continue;
      const dx = Math.round(cx - doorW / 2), dy = Math.round(wallBot - doorH);
      const aw = Math.max(3, doorW * 0.10);
      // architrave, then the recess it sits in
      b.fillStyle = ARCH;
      b.fillRect(dx - aw, dy - aw, doorW + aw * 2, doorH + aw);
      b.fillStyle = 'rgba(90,45,20,0.30)';
      b.fillRect(dx - aw * 0.4, dy - aw * 0.4, doorW + aw * 0.8, doorH + aw * 0.4);
      // the door
      const dg = b.createLinearGradient(dx, dy, dx + doorW, dy);
      dg.addColorStop(0, DOOR_EDGE); dg.addColorStop(0.35, DOOR_DARK); dg.addColorStop(1, DOOR_EDGE);
      b.fillStyle = dg; b.fillRect(dx, dy, doorW, doorH);
      // an inset panel, as a value step
      b.fillStyle = DOOR_PANEL;
      b.fillRect(dx + doorW * 0.16, dy + doorH * 0.14, doorW * 0.68, doorH * 0.52);
      // brass handle on the lift side
      b.fillStyle = HANDLE;
      b.beginPath();
      b.arc(dx + doorW * 0.84, dy + doorH * 0.58, Math.max(1.4, doorW * 0.065), 0, Math.PI * 2);
      b.fill();
      // the numbered plaque above it, and the little light over that
      const ph2 = Math.max(6, doorH * 0.13), pw2 = doorW + aw * 2;
      const py2 = dy - aw - ph2 - Math.max(2, h * 0.02);
      if (py2 > ceilH + 2) {
        b.fillStyle = PLAQUE;
        b.fillRect(dx - aw, py2, pw2, ph2);
        if (ph2 >= 9) drawUnflipped(b, String(f * 100 + n - i), dx - aw + pw2 / 2, py2 + ph2 * 0.55,
          '700 ' + Math.round(ph2 * 0.70) + 'px Inter, sans-serif', PLAQUE_INK);
        const gl = b.createRadialGradient(dx - aw + pw2 / 2, py2, 1, dx - aw + pw2 / 2, py2, pw2 * 0.7);
        gl.addColorStop(0, 'rgba(255,180,90,0.40)'); gl.addColorStop(1, 'rgba(255,180,90,0)');
        b.fillStyle = gl; b.fillRect(dx - aw * 2, py2 - ph2, pw2 + aw * 4, ph2 * 2.2);
      }
      // a wall sconce and a picture in the gap after the door
      if (gap > doorW * 1.9) {
        const sx = cx + gap * 0.5;
        if (sx < w - lobby * 0.5) paintSconce(b, sx, ceilH + (railY - ceilH) * 0.55, h);
        if (h > 56 && i % 2 === 0 && sx < w - lobby * 0.5) paintPicture(b, sx, ceilH + (railY - ceilH) * 0.30, h);
      }
    }
  }

  /* Draw a string the right way round inside a canvas that may be mirrored. */
  function drawUnflipped(b, text, x, y, font, fill) {
    const m = b.getTransform();
    b.save();
    if (m.a < 0) { b.translate(x, y); b.scale(-1, 1); b.translate(-x, -y); }
    b.fillStyle = fill; b.font = font;
    b.textAlign = 'center'; b.textBaseline = 'middle';
    b.fillText(text, x, y);
    b.restore();
    b.textAlign = 'left'; b.textBaseline = 'top';
  }

  function paintSconce(b, x, y, h) {
    const sw = Math.max(4, h * 0.055), sh = Math.max(7, h * 0.10);
    const g2 = b.createRadialGradient(x, y, 1, x, y, h * 0.42);
    g2.addColorStop(0, 'rgba(255,206,120,0.42)'); g2.addColorStop(1, 'rgba(255,206,120,0)');
    b.fillStyle = g2; b.fillRect(x - h * 0.45, y - h * 0.45, h * 0.9, h * 0.9);
    b.fillStyle = '#8C3F2E'; b.fillRect(x - sw * 0.62, y - sh * 0.5, sw * 1.24, sh);
    b.fillStyle = SCONCE; b.fillRect(x - sw * 0.42, y - sh * 0.36, sw * 0.84, sh * 0.72);
  }

  function paintPicture(b, x, y, h) {
    const fw = Math.max(9, h * 0.15), fh = fw * 1.15;
    b.fillStyle = FRAME_C; b.fillRect(x - fw / 2, y - fh / 2, fw, fh);
    b.fillStyle = FRAME_MAT;
    b.fillRect(x - fw / 2 + fw * 0.13, y - fh / 2 + fh * 0.11, fw * 0.74, fh * 0.78);
    b.fillStyle = FRAME_ART;
    b.fillRect(x - fw / 2 + fw * 0.24, y - fh / 2 + fh * 0.22, fw * 0.52, fh * 0.56);
  }

  /* The lobby is what they are trying to reach, so it does not look like the
     floors above it: no guest doors, a wide way out to the street, and the one
     cool light in a warm building. */
  function paintLobby(b, w, h, ceilH, wallBot, skirtH) {
    const dw = Math.max(24, w * 0.24), dh = (wallBot - ceilH) * 0.90;
    const dx = 10, dy = wallBot - dh;
    b.fillStyle = ARCH; b.fillRect(dx - 4, dy - 4, dw + 8, dh + 4);
    const g2 = b.createLinearGradient(dx, dy, dx, dy + dh);
    g2.addColorStop(0, 'rgba(150,232,206,0.55)'); g2.addColorStop(1, 'rgba(120,200,180,0.28)');
    b.fillStyle = g2; b.fillRect(dx, dy, dw, dh);
    const glow = b.createRadialGradient(dx + dw / 2, dy + dh * 0.6, 2, dx + dw / 2, dy + dh * 0.6, dh * 1.2);
    glow.addColorStop(0, 'rgba(150,232,206,0.20)'); glow.addColorStop(1, 'rgba(150,232,206,0)');
    b.fillStyle = glow; b.fillRect(0, 0, w, h);
    /* Text does not get mirrored with the corridor. The right-hand hallway is
       painted flipped so one piece of code draws both, and the exit sign came
       out reading TUO. */
    if (dh > 26) drawUnflipped(b, 'OUT', dx + dw / 2, dy + dh * 0.42,
      '700 ' + Math.max(8, Math.round(dh * 0.15)) + 'px Inter, sans-serif', '#123A31');
    // a plant by the wall, because a lobby has one
    const px2 = dx + dw + Math.max(10, w * 0.10), pot = Math.max(6, h * 0.11);
    b.fillStyle = POT_C;
    b.fillRect(px2 - pot * 0.42, wallBot + skirtH - pot, pot * 0.84, pot);
    b.strokeStyle = PLANT_C; b.lineWidth = Math.max(1.4, pot * 0.13); b.lineCap = 'round';
    for (let k = -2; k <= 2; k++) {
      b.beginPath();
      b.moveTo(px2, wallBot + skirtH - pot);
      b.quadraticCurveTo(px2 + k * pot * 0.30, wallBot + skirtH - pot * 1.7,
                         px2 + k * pot * 0.52, wallBot + skirtH - pot * 2.1);
      b.stroke();
    }
  }

  /* Where a person stands, in a corridor's own coordinates with the lift at
     the right-hand end. The baked art and the live figures have to agree, so
     both go through this. */
  const personXInCorridor = (stand, w) => {
    const m = geo.floorPx * 0.14;
    return m + (w - m * 2) * stand;
  };

  function drawCorridor(x, w, side, now) {
    void now;
    if (w <= 0) return;
    if (bakeKey !== corridorKey()) bakeCorridors();
    const F = floors();
    ctx.save();
    ctx.beginPath(); rr(geo.x - 6, geo.y - 8, geo.w + 12, geo.h + 8, 8); ctx.clip();
    for (let f = 1; f <= F; f++) {
      const img = baked[(side === 'left' ? 'L' : 'R') + f];
      if (img) ctx.drawImage(img, x, roomTop(f), w, geo.floorPx);
    }
    ctx.restore();
  }


  const SPR = 64;
  let SPRITES = null;
  function makeSprite(rgb) {
    const c = document.createElement('canvas');
    c.width = c.height = SPR;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(SPR / 2, SPR / 2, 0, SPR / 2, SPR / 2, SPR / 2);
    rg.addColorStop(0, 'rgba(' + rgb + ',1)');
    rg.addColorStop(0.42, 'rgba(' + rgb + ',0.55)');
    rg.addColorStop(0.75, 'rgba(' + rgb + ',0.16)');
    rg.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, SPR, SPR);
    return c;
  }
  function sprites() {
    if (!SPRITES) SPRITES = {
      body: makeSprite(SMOKE), bodyWarm: makeSprite('92,72,66'),
      lit: makeSprite(SMOKE_LIT), litWarm: makeSprite(SMOKE_LIT_WARM),
    };
    return SPRITES;
  }

  /* Smoke banks against the ceiling and the layer comes DOWN, so the cloud
     fills that band rather than the whole floor. It is also a second thing the
     player can read without being told. */
  const layerFrac = (front) => 0.20 + 0.80 * Math.min(1, front * 1.7);

  const CLUSTERS = 9, PER_CLUSTER = 11;
  function smokeCloud(x, w, top, h, front, fromLeft, aScale, now, seed, warm) {
    const reach = w * front;
    if (reach < 2) return;
    const S = sprites();
    const body = warm > 0.5 ? S.bodyWarm : S.body;
    const litImg = warm > 0.5 ? S.litWarm : S.lit;
    const dir = fromLeft ? 1 : -1;
    const far = fromLeft ? x : x + w;
    const t = REDUCED ? 0 : now / 1000;
    const lb = h * layerFrac(front);
    const nc = Math.max(2, Math.round(CLUSTERS * Math.min(1, 0.35 + front)));

    for (let c = 0; c < nc; c++) {
      const c1 = hash01(seed * 31.7 + c * 7.71);
      const c2 = hash01(seed * 17.3 + c * 3.31);
      const c3 = hash01(seed * 53.9 + c * 11.13);
      // clusters sit along the corridor, thicker back toward the stairwell
      /* Clusters crowd toward the SOURCE. The stairwell at the far end is
         where the smoke is coming from, so that end should be almost solid and
         the leading edge should be wisps. Evenly spaced clusters gave an even
         corridor, which is not what a corridor filling from one end looks
         like. */
      const u = Math.pow((c + 0.10 + 0.80 * c1) / nc, 1.35);
      const drift = REDUCED ? 0 : Math.sin(t * 0.40 + c1 * 6.283) * h * 0.08;
      const cx2 = far + dir * (reach * u + drift);
      const cy = top + h * 0.03 + (lb - h * 0.06) * (0.12 + 0.76 * c2)
               + (REDUCED ? 0 : Math.sin(t * 0.27 + c2 * 6.283) * h * 0.05);
      const spread = h * (0.22 + 0.20 * c3);
      /* Ragged and thin at the leading edge, dense behind it. The raggedness
         IS the edge - nothing else draws one. */
      const edge = Math.min(1, (1 - u) * 1.7);
      const clusterA = aScale * (0.72 + 0.28 * c2) * (0.10 + 0.90 * Math.pow(edge, 1.3));
      if (clusterA < 0.02) continue;

      for (let k = 0; k < PER_CLUSTER; k++) {
        const j = c * 17 + k * 5;
        const p1 = hash01(seed * 7.1 + j * 29.7);
        const p2 = hash01(seed * 23.3 + j * 17.1);
        const p3 = hash01(seed * 41.9 + j * 13.7);
        /* POWER LAW: p^2.4 puts most of the circles at the small end and lets
           a couple be big, which is the size spread real smoke has and the
           thing a uniform range cannot fake. */
        const rad = h * (0.05 + 0.62 * Math.pow(p1, 2.4));
        const ang = p2 * 6.283 + (REDUCED ? 0 : t * 0.18 * (p3 > 0.5 ? 1 : -1));
        const dist = spread * Math.pow(p3, 0.7);
        const px2 = cx2 + Math.cos(ang) * dist;
        const py = cy + Math.sin(ang) * dist * 0.62;
        /* DARK SMOKE READS BY HIDING THINGS, so it has to actually be
           opaque. At a tenth of this it was a dark corridor with a slightly
           darker corridor in it. */
        /* Dense enough at the source to HIDE the corridor. Dark smoke that
           does not obscure the doors, the lamps and the runner just reads as a
           slightly darker corridor - it has to actually take the room away. */
        const a = clusterA * (0.44 + 0.42 * p2);
        if (a < 0.004) continue;
        ctx.globalAlpha = a;
        ctx.drawImage(body, px2 - rad, py - rad, rad * 2, rad * 2);
        /* The ceiling lamps light the top surface of the layer, so circles up
           there get a pale pass over them. That is the bright rim on a dark
           mass, and it is what keeps the front readable now the smoke is not
           itself pale. */
        /* ONLY THE TOP SURFACE. Big lit circles reaching a  low as 45% of the
           layer washed the whole corridor to a mid grey, and a figure standing
           in it measured 2.4:1 against a 3:1 bar - which is what the dark halo
           behind every person used to be compensating for. Lighting only the
           top of the layer is also what actually happens: the lamps are above
           it, not inside it. */
        const depth = (py - top) / Math.max(1, lb);
        if (depth < 0.26) {
          ctx.globalAlpha = a * (0.95 - depth * 2.4);
          ctx.drawImage(litImg, px2 - rad * 0.7, py - rad * 0.95, rad * 1.4, rad * 1.2);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ONE PASS EACH, not the same layer twice. The volume goes BEHIND the people
     so a filling corridor dims what is in it, and a thinner pass goes in FRONT
     so smoke drifts across them. */
  function smokeLayer(aScale, now) {
    const F = floors();
    ctx.save();
    ctx.beginPath(); rr(geo.x - 6, geo.y - 8, geo.w + 12, geo.h + 8, 8); ctx.clip();
    for (let f = 1; f <= F; f++) {
      const front = smoke[f];
      if (front < 0.005) continue;
      const top = roomTop(f), h = geo.floorPx;
      const warm = Math.abs(f - level.fire) === 0 ? 1 : 0;
      ctx.save();
      ctx.beginPath(); ctx.rect(geo.leftX, top, geo.corW, h); ctx.clip();
      smokeCloud(geo.leftX, geo.corW, top, h, front, true, aScale, now, f * 1.7, warm);
      ctx.restore();
      if (geo.rightW > 0) {
        ctx.save();
        ctx.beginPath(); ctx.rect(geo.rightX, top, geo.rightW, h); ctx.clip();
        smokeCloud(geo.rightX, geo.rightW, top, h, front, false, aScale, now, f * 1.7 + 99, warm);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function drawSmoke(now) {
    /* THIN in front of them. The mass belongs behind: you see people through
       the near air, and a dense pass drawn over them took a light figure from
       3.3:1 down to 2.1:1 against a 3:1 bar. */
    smokeLayer(0.16, now);                                   // a thin veil, in front of them
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
     right-hand one at the same depth - same clock, different side. Both this
     and the baked doors go through personXInCorridor, so the art and the
     people always agree about where somebody is. */
  function personXY(p) {
    const base = slabY(p.floor) - 3 - geo.floorPx * 0.055;   // they stand on the runner
    const onRight = geo.rightW > 0 && (p.slot % 2 === 1);
    if (onRight) return { x: geo.rightX + geo.rightW - personXInCorridor(p.stand, geo.rightW), y: base, face: -1 };
    return { x: geo.leftX + personXInCorridor(p.stand, geo.corW), y: base, face: 1 };
  }

  function drawPeople(now) {
    smokeLayer(1.00, performance.now());                     // the volume, behind them
    const h = geo.floorPx * 0.52;
    const tt = now / 1000, edgePad = geo.floorPx * 0.16;
    for (const p of waiting) {
      const q = personXY(p);
      /* PACING. Nobody waiting for a lift in a fire stands still. Some walk a
         few steps back and forth, some hold their ground; whoever is starting
         to struggle stops and crouches instead. The walk is SMALL and centred
         on where they stand, because where they stand is their clock and every
         level is certified against it - so this moves the picture, never the
         model. */
      const paces = hash01(p.id * 3.7 + 1) > 0.40 && p.exp < 0.55 && !REDUCED;
      let px2 = q.x, face = q.face, gait = -1;
      if (paces) {
        const sp = 0.26 + 0.20 * hash01(p.id * 5.1 + 2);
        const ph = (tt * sp + hash01(p.id * 9.3 + 3)) % 1;
        px2 = q.x + (1 - Math.abs(2 * ph - 1) - 0.5) * 2 * geo.corW * 0.038;
        const lo = (q.face > 0 ? geo.leftX : geo.rightX) + edgePad;
        const hi = (q.face > 0 ? geo.leftX + geo.corW : geo.rightX + geo.rightW) - edgePad;
        px2 = Math.max(lo, Math.min(hi, px2));
        face = ph < 0.5 ? 1 : -1;
        gait = (tt * sp * 4.6 + hash01(p.id * 2.7)) % 1;
      }
      const m = drawPerson(px2, q.y, h, p.exp, p.id + 1, now, face, gait);
      drawBreath(m.hx, m.headTop, m.h, p.exp, now);
      /* WHERE IT ACTUALLY DREW. A contrast sweep that guesses these from the
         nominal height samples empty air, because a figure shrinks by up to a
         quarter as they duck and every person has their own height. Three
         separate false readings came out of guessing before this existed. */
      p.mark = { x: px2, side: q.face, h: m.h, headY: m.hy, bodyY: m.bodyY, armY: m.armY };
    }
    drawRunners(now);
  }

  /* They RUN for the doors when the car lands, and out of the lobby when it
     gets them there. The model has already moved them; this is the second of
     boarding time drawn rather than skipped. */
  function drawRunners(now) {
    const h = geo.floorPx * 0.52;
    for (const r of runners) {
      const k = Math.min(1, r.t / r.dur);
      const x = r.x0 + (r.x1 - r.x0) * (r.kind === 'out' ? ease(k) : k);
      const dir = r.x1 >= r.x0 ? 1 : -1;
      const gait = REDUCED ? -1 : (now / 1000 * 3.4 + r.seed * 0.37) % 1;
      ctx.globalAlpha = r.kind === 'out' ? 1 - Math.max(0, (k - 0.65) / 0.35) : 1;
      drawPerson(x, slabY(r.floor) - 3, h, 0, r.seed, now, dir, gait);
      ctx.globalAlpha = 1;
    }
  }

  /* A PERSON, NOT A CAPSULE. Head, neck, shoulders, a tapered torso, two arms
     and two legs, at roughly one-to-six head-to-height - stylised, because at
     27 pixels a true one-to-seven-and-a-half head is two pixels across, but
     built on real proportions rather than a rectangle with a circle on it.

     Everything is a filled form lit from above: the torso is a path with a
     vertical gradient, the limbs are round-capped strokes of that same
     gradient. No outline anywhere and no face, per the brief.

     Posture is the second channel on exposure, and it is the honest one: as
     the smoke takes hold they shrink down, a hand comes up to the mouth, and
     the knees bend. Colour alone never carries it. */
  const hash01 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  function drawPerson(cx, baseY, h0, exp, seed, now, face, gait) {
    const rnd = (k) => hash01(seed * 7.3 + k * 19.7);
    const duck = ease(Math.max(0, (exp - 0.26) / 0.62));
    const h = h0 * (0.93 + 0.15 * rnd(1)) * (1 - 0.26 * duck);
    const f = face || 1;
    const t = REDUCED ? 0 : now / 1000;
    const walking = gait != null && gait >= 0 && !REDUCED;
    const g2 = walking ? gait * 6.283 : 0;
    const swing = walking ? Math.sin(g2) : 0;              // legs fore/aft
    const bob = walking ? Math.abs(Math.sin(g2)) * h * 0.014 : 0;
    const sway = REDUCED ? 0 : Math.sin(t * 1.05 + rnd(2) * 6.283) * h * 0.011;
    const breath = REDUCED ? 0 : Math.sin(t * 1.9 + rnd(3) * 6.283) * h * 0.006;

    const Y = (u) => baseY - h * u;
    const headR = h * 0.100;
    const lean = f * h * 0.055 * duck + sway;
    const shoulderY = Y(0.80) + breath + bob, hipY = Y(0.47) + bob;
    const shW = h * 0.118, hipW = h * 0.082;
    const stance = h * (0.030 + 0.030 * rnd(4));

    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath(); ctx.ellipse(cx + lean * 0.3, baseY + 1, h * 0.13, h * 0.026, 0, 0, Math.PI * 2); ctx.fill();

    const g = ctx.createLinearGradient(0, Y(1.02), 0, baseY);
    g.addColorStop(0, BODY_HI); g.addColorStop(1, BODY_LO);
    ctx.fillStyle = g; ctx.strokeStyle = g;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // legs, behind the torso
    ctx.lineWidth = Math.max(2.2, h * 0.078);
    for (const s of [-1, 1]) {
      const step = walking ? swing * s * f : 0;            // one leg forward, one back
      const hipX = cx + lean * 0.4 + s * hipW * 0.52;
      const kneeX = cx + s * (hipW * 0.55 + stance * 0.5) + f * h * 0.045 * duck + step * h * 0.13;
      const kneeY = Y(0.25) + h * 0.03 * duck + bob;
      const footX = cx + s * (hipW * 0.5 + stance) + step * h * 0.24;
      const lift = walking ? Math.max(0, step) * h * 0.05 : 0;
      ctx.beginPath();
      ctx.moveTo(hipX, hipY); ctx.lineTo(kneeX, kneeY); ctx.lineTo(footX, baseY - h * 0.012 - lift);
      ctx.stroke();
    }

    // torso: shoulders wider than the waist, and it leans as they duck
    ctx.beginPath();
    ctx.moveTo(cx + lean - shW, shoulderY + h * 0.045);
    ctx.quadraticCurveTo(cx + lean - shW * 1.04, shoulderY - h * 0.035, cx + lean - shW * 0.42, shoulderY - h * 0.050);
    ctx.lineTo(cx + lean + shW * 0.42, shoulderY - h * 0.050);
    ctx.quadraticCurveTo(cx + lean + shW * 1.04, shoulderY - h * 0.035, cx + lean + shW, shoulderY + h * 0.045);
    ctx.lineTo(cx + hipW, hipY);
    ctx.quadraticCurveTo(cx + lean * 0.4, hipY + h * 0.035, cx - hipW, hipY);
    ctx.closePath(); ctx.fill();

    // neck
    ctx.lineWidth = Math.max(2, h * 0.068);
    ctx.beginPath();
    ctx.moveTo(cx + lean * 0.8, shoulderY - h * 0.02);
    ctx.lineTo(cx + lean * 0.9, Y(0.840) + breath);
    ctx.stroke();

    // arms. The one on the side they are facing comes up to the mouth as the
    // smoke takes hold; the other stays down.
    ctx.lineWidth = Math.max(2, h * 0.064);
    const hands = [];
    for (const s of [-1, 1]) {
      const shoulderX = cx + lean + s * shW * 1.00;
      const cover = (s === f) ? duck : duck * 0.25;
      const elbowX = shoulderX + s * h * (0.078 + 0.024 * rnd(5)) - s * h * 0.09 * cover;
      const elbowY = Y(0.60) + h * 0.02 * cover + bob - (walking ? swing * s * f * h * 0.05 : 0);
      const handX = shoulderX + s * h * 0.058 + (cover > 0.02 ? (cx + lean - shoulderX) * cover * 0.95 : 0);
      const handY = Y(0.45) * (1 - cover) + (Y(0.845) + breath) * cover + bob - (walking ? swing * s * f * h * 0.09 : 0);
      ctx.beginPath();
      ctx.moveTo(shoulderX, shoulderY); ctx.lineTo(elbowX, elbowY); ctx.lineTo(handX, handY);
      ctx.stroke();
      hands.push([handX, handY]);
    }
    /* Hands are skin, not sleeve. Small, but with the head they are the light
       part of the figure, and the light part is what separates it from dark
       smoke the way the dark clothing separates it from a lit wall. */
    ctx.fillStyle = HEAD;
    for (const [hxx, hyy] of hands) {
      ctx.beginPath(); ctx.arc(hxx, hyy, Math.max(1.3, h * 0.030), 0, Math.PI * 2); ctx.fill();
    }

    // head, lit from above like everything else
    const hx = cx + lean * 1.15, hy = headCYOf(baseY, h, duck) + breath + bob;
    const hg = ctx.createRadialGradient(hx - headR * 0.35, hy - headR * 0.5, headR * 0.1, hx, hy, headR * 1.25);
    hg.addColorStop(0, SKIN_HI); hg.addColorStop(1, HEAD);
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(hx, hy, headR, 0, Math.PI * 2); ctx.fill();

    return { headTop: hy - headR, hx, h, hy, bodyY: (shoulderY + hipY) / 2, armY: Y(0.62) };
  }
  const headCYOf = (baseY, h, duck) => baseY - h * (0.905 - 0.02 * duck);

  /* The breath arc: how long they have, above their head. A DARK track under
     it, because a coral arc on grey smoke measured 1.06:1. */
  function drawBreath(cx, topY, h, exp, now) {
    const left = Math.max(0, 1 - exp);
    const r = Math.max(6, h * 0.26), ay = topY - r * 0.55;
    const lw = Math.max(2, h * 0.055);
    ctx.lineCap = 'round';
    ctx.lineWidth = lw + 3;
    ctx.strokeStyle = 'rgba(11,16,32,0.78)';
    ctx.beginPath(); ctx.arc(cx, ay, r, Math.PI * 1.13, Math.PI * 1.87); ctx.stroke();
    ctx.lineWidth = lw;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath(); ctx.arc(cx, ay, r, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.strokeStyle = left > 0.55 ? BREATH_OK : left > 0.28 ? BREATH_MID : BREATH_LOW;
    const a0 = Math.PI * 1.15, a1 = a0 + Math.PI * 0.70 * left;
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
      ctx.fillStyle = (r % 2) ? WALL_HI : WALL_LO;
      ctx.fillRect(x, y + r * fh, corW, fh);
      ctx.fillStyle = CEIL_HI; ctx.fillRect(x, y + r * fh, corW, Math.max(2, fh * 0.10));
      ctx.fillStyle = SKIRT_C; ctx.fillRect(x, y + (r + 1) * fh - 3, corW, 3);
      ctx.fillStyle = DOOR_DARK;
      ctx.fillRect(x + 8 + r * 3, y + (r + 1) * fh - 3 - fh * 0.52, fh * 0.26, fh * 0.52);
    }
    ctx.fillStyle = 'rgba(150,232,206,0.45)';
    rr(x + 6, y + h - 3 - fh * 0.6, 18, fh * 0.6, 2); ctx.fill();
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
    get renderMs() { return renderMs; },
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
  let last = 0, acc = 0, renderMs = 0;
  const DT = 1 / 120;
  function frame(now) {
    if (!last) last = now;
    const raw = Math.min(0.25, (now - last) / 1000); last = now;
    if (!document.hidden && !rulesOpen) {
      acc += raw;
      let guard = 0;
      while (acc >= DT && guard++ < 60) { step(DT); acc -= DT; }
    } else acc = 0;
    /* The target device is a school Chromebook, and a frame interval only ever
       says "it kept up with vsync". What matters is how long the drawing takes,
       because that is the headroom. Two clock reads a frame is free. */
    const t0 = performance.now();
    render(now);
    renderMs = renderMs * 0.9 + (performance.now() - t0) * 0.1;
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
