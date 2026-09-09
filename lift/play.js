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

  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zam.lift.sfx', gain: 1.5 }) : null;
  const UI = window.ZAM_UI;

  /* ---------- THE SOUND OF A BUILDING ON FIRE ----------
     The voices live in sound.js so the bench can play each one alone; the
     first version of this was judged by looking at the code rather than by
     listening, which is not a way to judge a sound. What is left here is the
     wiring: what the game tells the sound about itself, once a frame. */
  const snd = window.LiftSound ? window.LiftSound.create(sfx) : null;

  function stepAmbience(dt) {
    if (!snd) return;
    let burn = 0;
    if (smoke && level) for (let f = 1; f <= level.floors; f++) burn += smoke[f];
    snd.ambience(dt, {
      live: phase !== 'over' && !document.hidden,
      burn: burn / Math.max(1, level ? level.floors * 0.7 : 1),
      speed: Math.abs(car.v) / T.vMax
    });
  }

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
  const SHELL_TOP = '#2E2036', SHELL_BOT = '#241A2A';    // the shell behind it all
  /* PALE CREAM WALLS, a saturated ceiling. The wall was a strong amber, which
     was the single worst decision in the building: everything looked orange,
     and firelight - which is orange - had nowhere to land. A cream wall gives
     the fire somewhere to read, gives dark smoke a huge range to work in, and
     is what the reference actually is. */
  const CEIL_HI = '#F3AE45', CEIL_LO = '#DE8B29';
  const CORNICE = '#B85C25';
  const WALL_HI = '#F7DDB2', WALL_LO = '#EDCB96';
  const WALL_SEAM = 'rgba(150,96,40,0.10)';
  const SKIRT_C = '#3A2C3E';
  const FLOOR_HI = '#9179AE', FLOOR_LO = '#6E5689', TILE_LINE = 'rgba(40,26,52,0.28)';
  const REVEAL = '#C0691F', REVEAL_TOP = '#EDA152', REVEAL_DEEP = '#8A4616';
  const DOOR_DARK = '#2A2838', DOOR_PANEL = '#332F44', DOOR_EDGE = '#1A1826';
  const HANDLE = '#F0A93C';
  const PLAQUE = '#1E1B26', PLAQUE_INK = '#FFFFFF';
  const SCONCE = '#FFF2CE', SCONCE_ARM = '#8A4A22';
  const FRAME_C = '#2E2A40', FRAME_MAT = '#F6D9B8', FRAME_ART = '#E07C3C';
  const PLANT_C = '#4E9A56', POT_C = '#F2EEE8';
  const LAMP = '#FFE3A6';
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
  /* Genuinely dark, not a dark-ish mid-tone. Partly-smoked wall sits at about
     0.20 relative luminance, which is right between a mid clothing value and a
     light head - so neither half cleared 3:1 and the figure fell to 2.4. Taking
     the clothing down to near-black puts it 3.6 against that wall while the
     light head keeps carrying it inside the smoke. It also matches the doors,
     which is what a person looks like in a lit corridor. */
  const BODY_HI = '#2E2838', BODY_LO = '#1A1622';        // clothing
  const HEAD = '#DCC0A2', SKIN_HI = '#F2DCC2';           // head and hands
  const HAIR = '#241C22';
  /* CLOTHES VARY BY HUE, NOT BY VALUE. People should look like different
     people, but a cream wall only lets a figure read if it stays dark, and the
     fire has to remain the most saturated thing in the building. So: deep
     muted colours, all within a narrow dark band, distinguishable from each
     other and never competing with the flame. */
  const OUTFITS = [
    ['#2C3A52', '#1B2536'],   // navy
    ['#3A2A38', '#241A24'],   // plum
    ['#233A34', '#152420'],   // forest
    ['#42302A', '#281C18'],   // rust
    ['#2E3348', '#1C2030'],   // slate blue
    ['#3E3524', '#251F14'],   // olive
    ['#3A2530', '#22161E'],   // burgundy
    ['#26363E', '#161F25'],   // teal
  ];
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
  /* ONE RUN, THREE STRIKES, NO LEVELS. The building does not get cleared and
     replaced; it keeps filling. Guests keep coming out of their rooms, the
     fire keeps growing, and the run ends when three of them are overcome. What
     climbs is the number of people and the speed of the smoke - which is the
     old arcade curve, and it is honest here because a fire really does get
     away from you.

     The certified levels in levels.js are no longer loaded. They are left on
     disk rather than deleted: the certifier and its numbers are the record of
     why the fire version was worth building at all. */
  const SAVE = 'zam.lift.save';
  /* FIVE STRIKES, AND THE RAMP HAPPENS IN WAVES YOU CAN SEE.

     The first version of this was invisible and the measurement said why: the
     ramp was tuned to reach full speed at about 125 seconds and a run lasted
     28, so a player only ever saw the first fifth of it - arrivals moved by
     15% and then it was over. Three strikes was most of that: it ends the run
     before any escalation can land.

     So five strikes, and the difficulty climbs in WAVES rather than drifting.
     A continuous drift is exactly the sort of change nobody notices; a step
     with a number on it is the old arcade convention because it works. Each
     wave brings more people and faster smoke, and the whole curve is spent
     inside a run rather than beyond the end of one. */
  const STRIKES = 5;
  const RUN = {
    floors: 8,
    startPeople: 4,
    waveS: 16,                                          // how long a wave lasts
    spawnFrom: 5.2, spawnStep: 0.42, spawnMin: 1.6,     // seconds between arrivals
    rateFrom: 0.028, rateStep: 0.0105, rateMax: 0.105,  // how fast the smoke moves
  };

  let level = null;                    // the building this run is in
  const car = { y: 1, v: 0 };
  let smoke = null, carSmoke = 0;
  let waiting = [], aboard = [], fallen = [], out = 0, lost = 0, lostFloors = [], standsBy = {};
  let phase = 'play';                  // 'play' | 'serve' | 'level' | 'over'
  let serveT = 0, serveFloor = 1, doorOpen = 0, didWork = false, didClose = false;
  let settleT = 0, settleDir = 1, sag = 0;
  let levelFrom = 1, levelTo = 1, levelT = 0, levelDir = 1;
  let departed = false, stopsMade = 0, nextId = 0, nextSpawn = 0;
  let puffs = [], runners = [], tNow = 0, endT = 0, best = 0;
  let wave = 1, waveFlash = 0;
  let rulesOpen = false, rulesScroll = 0, handlePulse = 0;
  let rng = M.makeRng(1);

  function loadBest() {
    try { return (JSON.parse(localStorage.getItem(SAVE) || '{}').best | 0) || 0; } catch (e) { return 0; }
  }
  function putBest() { try { localStorage.setItem(SAVE, JSON.stringify({ best })); } catch (e) {} }

  const waveNow = () => 1 + Math.floor(tNow / RUN.waveS);
  const spawnEvery = () => Math.max(RUN.spawnMin, RUN.spawnFrom - (waveNow() - 1) * RUN.spawnStep);
  const smokeRate = () => Math.min(RUN.rateMax, RUN.rateFrom + (waveNow() - 1) * RUN.rateStep);

  function startRun() {
    rng = M.makeRng((Date.now() & 0xffff) || 7);
    const F = RUN.floors;
    level = { floors: F, fire: 2 + Math.floor(rng() * Math.max(1, F - 2)) };
    car.y = 1; car.v = 0;
    smoke = new Float64Array(F + 1);
    carSmoke = 0;
    waiting = []; aboard = []; fallen = [];
    out = 0; lost = 0; lostFloors = [];
    phase = 'play'; doorOpen = 0; serveT = 0; sag = 0; settleT = 0;
    departed = false; stopsMade = 0; nextId = 0;
    puffs = []; runners = []; tNow = 0; endT = 0; wave = 1; waveFlash = 0;
    handlePulse = 1;
    best = loadBest();
    /* Doors keep clear of EVERY standing position, not just the occupied ones,
       because in a run people arrive where they like and a door cannot appear
       and disappear under them. */
    standsBy = {};
    for (let f = 2; f <= F; f++) {
      standsBy[f] = [0, 1, 2, 3].map(s => ({ stand: M.queueAt(s), right: s % 2 === 1 }));
    }
    for (let i = 0; i < RUN.startPeople; i++) spawnPerson();
    nextSpawn = spawnEvery();
    layout();
    TR().gameStart();
  }

  /* Somebody comes out of a room. They take a free standing slot, and by
     preference not one already lost to the smoke - emerging straight into a
     corridor you cannot see across is a death you could not have prevented. */
  function spawnPerson() {
    const F = level.floors;
    const free = [], ok = [];
    for (let f = 2; f <= F; f++) {
      const used = new Set(waiting.filter(p => p.floor === f).map(p => p.slot));
      for (const p of fallen) if (p.floor === f) used.add(p.slot);
      for (let s = 0; s < T.capacity; s++) {
        if (used.has(s)) continue;
        const cell = { f, s };
        free.push(cell);
        if (smoke[f] < M.standAt(s) + 0.10) ok.push(cell);
      }
    }
    const pool = ok.length ? ok : free;
    if (!pool.length) return;
    const c = pool[Math.floor(rng() * pool.length)];
    waiting.push({ id: nextId++, floor: c.f, slot: c.s, stand: M.standAt(c.s), goal: M.queueAt(c.s), exp: 0 });
  }

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
    if (phase === 'serve' || phase === 'level') return;  // never steer while it is landing
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
    if (id === 'restart') { startRun(); return; }
    if (id === 'rules') { rulesOpen = !rulesOpen; rulesScroll = 0; return; }
  }
  function advanceFromCard() {
    startRun();
  }

  /* ---------- THE WORLD ---------- */
  function step(dt) {
    tNow += dt;
    stepAmbience(dt);
    if (settleT > 0) settleT = Math.max(0, settleT - dt / 0.16);
    if (handlePulse > 0) handlePulse = Math.max(0, handlePulse - dt / 1.4);
    for (const p of puffs) p.t += dt / 1.1;
    puffs = puffs.filter(p => p.t < 1);
    for (const r of runners) r.t += dt;
    runners = runners.filter(r => r.t < r.dur);
    if (phase === 'over') { endT += dt; return; }

    M.stepSmoke(smoke, level.floors, level.fire, smokeRate(), dt, FIRE);
    if (waveNow() !== wave) {
      wave = waveNow(); waveFlash = 1;
      if (snd) snd.waveUp();
      TR().track('wave', { wave, out, lost });
    }
    if (waveFlash > 0) waveFlash = Math.max(0, waveFlash - dt / 2.2);
    nextSpawn -= dt;
    if (nextSpawn <= 0) { spawnPerson(); nextSpawn = spawnEvery(); }
    for (const r of fallen) r.t += dt;
    carSmoke = M.carSmokeStep(carSmoke, doorOpen > 0.02 ? smoke[serveFloor] : 0, dt, doorOpen > 0.02, FIRE);

    for (let i = waiting.length - 1; i >= 0; i--) {
      const p = waiting[i];
      p.stand = M.walkStep(p.stand, p.goal, p.exp, dt);
      p.exp += M.exposureStep(p.stand, smoke[p.floor], dt, FIRE);
      if (p.exp >= 1) { overcome(p, p.floor); waiting.splice(i, 1); }
    }
    for (let i = aboard.length - 1; i >= 0; i--) {
      const p = aboard[i];
      p.exp += M.carExposureStep(carSmoke, dt, FIRE);  // nowhere to stand away from it
      if (p.exp >= 1) { overcome(p, Math.round(car.y)); aboard.splice(i, 1); }
    }

    if (phase === 'serve') stepServe(dt);
    else if (phase === 'level') stepLevelling(dt);
    else stepDrive(dt);


  }

  /* Nobody dies on screen and nothing is drawn over a person: the smoke closes
     over them and they are left behind. The card names their floor, because
     the floor you did not get back to is the thing worth remembering. */
  /* THEY COLLAPSE WHERE THEY STAND. Removed from play - a person overcome
     cannot be carried out - but drawn for the rest of the run, because a
     corridor with somebody down in it is the only honest way to say you did
     not get there. Three of them ends the run. */
  function overcome(p, floor) {
    lost++; lostFloors.push(floor);
    const q = personXY(p);
    fallen.push({ floor, slot: p.slot, stand: p.stand, x: q.x, side: q.face, seed: p.id + 1, t: 0 });
    if (snd) snd.collapse();
    if (lost >= STRIKES) finish();
  }

  function finish() {
    if (phase === 'over') return;
    phase = 'over'; endT = 0;
    if (out > best) { best = out; putBest(); }
    if (snd) snd.runEnd();
    TR().track('run_end', { out, lost, stops: stopsMade, seconds: Math.round(tNow) });
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
    const off = Math.abs(car.y - Math.round(car.y));
    TR().track('stop', { level: off <= T.levelTol ? 1 : 0, off: Math.round(off * 100) / 100 });
    if (off <= T.snapZone) {
      /* Inside the levelling zone the car takes itself the rest of the way,
         the way a real one does. Outside it, that is a genuine miss: it bumps,
         it sags, and it costs the seconds it costs. */
      phase = 'level';
      levelFrom = car.y; levelTo = Math.round(car.y); levelT = 0;
      levelDir = releaseV >= 0 ? 1 : -1;
      sag = 0;
    } else {
      sag = 2;
      if (snd) snd.misland();
    }
  }

  function stepLevelling(dt) {
    levelT += dt;
    const k = Math.min(1, levelT / T.levelS);
    car.y = levelFrom + (levelTo - levelFrom) * ease(k);
    if (k >= 1) {
      car.y = levelTo;
      if (!REDUCED) { settleT = 1; settleDir = levelDir; }
      startServe(levelTo);
    }
  }

  function startServe(f) {
    phase = 'serve'; serveT = 0; serveFloor = f; didWork = false; didClose = false; stopsMade++;
    if (snd) { snd.bell(); snd.doors(false); }
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
        if (aboard.length && snd) snd.rescue(aboard.length);
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
          if (snd) snd.steps(take.length);
        }
      }
    }
    if (!didClose && serveT >= t.open + t.act) { didClose = true; if (snd) snd.doors(true); }
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
    fireGlow(now, false);                                    // under the smoke it makes
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
    return [geo.corW, geo.rightW, geo.floorPx, floors(), level ? level.fire : 0].join('|');
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

  /* Draw a string the right way round inside a canvas that may be mirrored.
     The right-hand hallway is painted flipped so one piece of code draws both,
     and without this the exit sign reads TUO. */
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

  /* Everything is drawn in a corridor that runs left-to-right with the LIFT AT
     THE RIGHT-HAND END, and the right-hand corridor is mirrored on the way
     out. One piece of drawing code, both sides. */
  function paintCorridor(b, w, h, f, isLobby) {
    const ceilH = Math.max(5, h * 0.115);
    const corn = Math.max(2, h * 0.026);
    const skirtH = Math.max(2, h * 0.030);
    const floorH = Math.max(5, h * 0.115);
    const wallTop = ceilH + corn;
    const wallBot = h - floorH - skirtH;

    // ceiling: the one saturated surface, as in the reference
    const cg = b.createLinearGradient(0, 0, 0, ceilH);
    cg.addColorStop(0, CEIL_HI); cg.addColorStop(1, CEIL_LO);
    b.fillStyle = cg; b.fillRect(0, 0, w, ceilH);
    b.fillStyle = CORNICE; b.fillRect(0, ceilH, w, corn);

    // wall: pale cream, with faint panel seams
    const wg = b.createLinearGradient(0, wallTop, 0, wallBot);
    wg.addColorStop(0, WALL_HI); wg.addColorStop(1, WALL_LO);
    b.fillStyle = wg; b.fillRect(0, wallTop, w, wallBot - wallTop);
    b.fillStyle = WALL_SEAM;
    for (let sx = h * 1.15; sx < w; sx += h * 1.15) b.fillRect(Math.round(sx), wallTop, 1, wallBot - wallTop);

    // skirting, then a tiled floor
    b.fillStyle = SKIRT_C; b.fillRect(0, wallBot, w, skirtH);
    const fg = b.createLinearGradient(0, wallBot + skirtH, 0, h);
    fg.addColorStop(0, FLOOR_HI); fg.addColorStop(1, FLOOR_LO);
    b.fillStyle = fg; b.fillRect(0, wallBot + skirtH, w, h - wallBot - skirtH);
    b.fillStyle = TILE_LINE;
    const tile = Math.max(10, h * 0.30);
    for (let tx = 0; tx < w + tile; tx += tile) {
      b.beginPath();
      b.moveTo(tx, h); b.lineTo(tx + tile * 0.34, wallBot + skirtH);
      b.lineWidth = 1; b.strokeStyle = TILE_LINE; b.stroke();
    }
    b.fillStyle = 'rgba(255,255,255,0.07)';
    b.fillRect(0, wallBot + skirtH, w, Math.max(1, floorH * 0.18));

    if (isLobby) paintLobby(b, w, h, wallTop, wallBot, skirtH);
    else paintDoors(b, w, h, wallTop, wallBot, f);

    // the runner along the floor, leading to the lift
    const rin = Math.round(w * 0.03), rh = Math.max(3, floorH * 0.50);
    b.fillStyle = CARPET;
    b.fillRect(rin, wallBot + skirtH + floorH * 0.30, w - rin * 2, rh);

    /* CEILING LIGHTS, back where they were. Set into the ceiling, each throwing
       a soft cone down the cream wall - which is most of why the corridor
       reads as lit at all. */
    const bays = Math.max(2, Math.round(w / (h * 0.95)));
    for (let i = 0; i < bays; i++) {
      const lx = w * ((i + 0.5) / bays);
      const g2 = b.createRadialGradient(lx, ceilH, 2, lx, ceilH, h * 1.0);
      g2.addColorStop(0, 'rgba(255,236,186,0.40)');
      g2.addColorStop(0.42, 'rgba(255,228,168,0.13)');
      g2.addColorStop(1, 'rgba(255,220,150,0)');
      b.fillStyle = g2; b.fillRect(0, 0, w, h);
      const lw = Math.max(10, h * 0.19), lh = Math.max(2, h * 0.035);
      b.fillStyle = LAMP;
      b.fillRect(lx - lw / 2, Math.max(1, ceilH * 0.42), lw, lh);
      b.fillStyle = 'rgba(255,255,255,0.55)';
      b.fillRect(lx - lw * 0.36, Math.max(1, ceilH * 0.42), lw * 0.72, Math.max(1, lh * 0.42));
    }
  }

  /* Guest doors, recessed into a deep reveal: the opening is a warm box whose
     top face catches the ceiling light and whose sides fall away dark, with a
     numbered plaque inside it and the door itself set back. That box is what
     makes the wall read as having depth rather than as stickers on a flat.
     Doors are omitted where somebody is standing. */
  function paintDoors(b, w, h, wallTop, wallBot, f) {
    const openH = (wallBot - wallTop) * 0.90;
    const doorW = openH * 0.46;
    const rev = Math.max(3, doorW * 0.13);
    const lobby = Math.max(doorW * 1.5, w * 0.16);
    const runX = 6, runW = w - lobby - 6;
    const n = Math.max(1, Math.min(3, Math.floor(runW / (doorW * 2.3))));
    const gap = runW / n;
    const stands = (standsBy[f] || []).map(s => personXInCorridor(s.stand, w));
    const keepOut = doorW * 0.55 + geo.floorPx * 0.52 * 0.24;

    for (let i = 0; i < n; i++) {
      const cx = runX + gap * (i + 0.5);
      if (stands.some(px2 => Math.abs(px2 - cx) < keepOut)) continue;
      const ox = Math.round(cx - doorW / 2 - rev), oy = Math.round(wallBot - openH);
      const ow = doorW + rev * 2;

      // the reveal: lit top face, dark sides
      b.fillStyle = REVEAL; b.fillRect(ox, oy, ow, openH);
      const tg = b.createLinearGradient(0, oy, 0, oy + rev * 2.2);
      tg.addColorStop(0, REVEAL_TOP); tg.addColorStop(1, REVEAL);
      b.fillStyle = tg; b.fillRect(ox, oy, ow, rev * 2.2);
      const sgL = b.createLinearGradient(ox, 0, ox + rev, 0);
      sgL.addColorStop(0, REVEAL_DEEP); sgL.addColorStop(1, REVEAL);
      b.fillStyle = sgL; b.fillRect(ox, oy + rev * 1.4, rev, openH - rev * 1.4);
      const sgR = b.createLinearGradient(ox + ow, 0, ox + ow - rev, 0);
      sgR.addColorStop(0, REVEAL_DEEP); sgR.addColorStop(1, REVEAL);
      b.fillStyle = sgR; b.fillRect(ox + ow - rev, oy + rev * 1.4, rev, openH - rev * 1.4);

      // the plaque, inside the reveal at the top
      const ph2 = Math.max(6, openH * 0.11);
      const py2 = oy + rev * 0.9;
      b.fillStyle = PLAQUE;
      b.fillRect(ox + rev * 0.7, py2, ow - rev * 1.4, ph2);
      if (ph2 >= 9) drawUnflipped(b, String(f * 100 + n - i), ox + ow / 2, py2 + ph2 * 0.55,
        '700 ' + Math.round(ph2 * 0.72) + 'px Inter, sans-serif', PLAQUE_INK);

      // the door, set back inside the reveal
      const dx = ox + rev, dy = py2 + ph2 + Math.max(1, rev * 0.5), dh2 = wallBot - dy;
      const dg = b.createLinearGradient(dx, 0, dx + doorW, 0);
      dg.addColorStop(0, DOOR_EDGE); dg.addColorStop(0.30, DOOR_DARK);
      dg.addColorStop(0.85, DOOR_DARK); dg.addColorStop(1, DOOR_EDGE);
      b.fillStyle = dg; b.fillRect(dx, dy, doorW, dh2);
      // the inset panel, drawn as a value step with a thin lighter edge
      const pi = doorW * 0.14;
      b.fillStyle = 'rgba(255,255,255,0.07)';
      b.fillRect(dx + pi, dy + dh2 * 0.10, doorW - pi * 2, dh2 * 0.74);
      b.fillStyle = DOOR_PANEL;
      b.fillRect(dx + pi + 1, dy + dh2 * 0.10 + 1, doorW - pi * 2 - 2, dh2 * 0.74 - 2);
      // brass knob
      b.fillStyle = HANDLE;
      b.beginPath();
      b.arc(dx + doorW * 0.14, dy + dh2 * 0.52, Math.max(1.5, doorW * 0.062), 0, Math.PI * 2);
      b.fill();

      // a framed picture on the wall in the gap after the door
      if (gap > doorW * 2.0 && h > 46) {
        const px3 = cx + gap * 0.5;
        if (px3 < w - lobby * 0.6) paintPicture(b, px3, wallTop + (wallBot - wallTop) * 0.36, h);
      }
    }
  }

  function paintPicture(b, x, y, h) {
    const fw = Math.max(11, h * 0.20), fh = fw * 1.02;
    b.fillStyle = 'rgba(90,50,20,0.18)';
    b.fillRect(x - fw / 2 + 2, y - fh / 2 + 3, fw, fh);
    b.fillStyle = FRAME_C; b.fillRect(x - fw / 2, y - fh / 2, fw, fh);
    b.fillStyle = FRAME_MAT;
    b.fillRect(x - fw / 2 + fw * 0.14, y - fh / 2 + fh * 0.13, fw * 0.72, fh * 0.74);
    b.fillStyle = FRAME_ART;
    b.fillRect(x - fw / 2 + fw * 0.27, y - fh / 2 + fh * 0.26, fw * 0.46, fh * 0.48);
  }

  /* A PROPER HOTEL LOBBY, not a corridor with an exit in it. It is the one
     place in the building nobody is trapped, it is what every trip is FOR, and
     it should look like somewhere you are relieved to reach: glazed doors to
     the street, a reception desk with a lamp on it, planting, and pictures.

     Night-blue glazing, because the way out sits at the same end of the
     corridor the fire comes from and two warm things there fought each other. */
  function paintLobby(b, w, h, wallTop, wallBot, skirtH) {
    const wallH = wallBot - wallTop;
    const floorY = wallBot + skirtH;

    /* THE WAY OUT: glazed doors onto the street at NIGHT. Painted pale they
       read as a grey slab in the wall. Looking out of a lit lobby after dark
       the glass is DARK, with the street lights beyond it and the room
       reflected in it - and a dark opening in a warm wall is unmistakably a
       way through, where a pale rectangle is just a panel. The lit sign over
       it is what says it is the way OUT. */
    const openH = wallH * 0.94, dw = Math.max(30, w * 0.24);
    const rev = Math.max(3, dw * 0.06);
    const ox = Math.max(6, w * 0.025), oy = wallBot - openH;
    b.fillStyle = REVEAL; b.fillRect(ox, oy, dw + rev * 2, openH);
    const tg = b.createLinearGradient(0, oy, 0, oy + rev * 2.4);
    tg.addColorStop(0, REVEAL_TOP); tg.addColorStop(1, REVEAL);
    b.fillStyle = tg; b.fillRect(ox, oy, dw + rev * 2, rev * 2.4);

    const gx = ox + rev, gy = oy + rev * 2.6, gh = wallBot - gy;
    const g2 = b.createLinearGradient(gx, gy, gx, wallBot);
    g2.addColorStop(0, '#141C33'); g2.addColorStop(0.55, '#1D2A4A'); g2.addColorStop(1, '#2A3A5E');
    b.fillStyle = g2; b.fillRect(gx, gy, dw, gh);
    // street lights out there, and the pavement catching them
    for (let k = 0; k < 3; k++) {
      const sx2 = gx + dw * (0.22 + 0.28 * k), sy2 = gy + gh * (0.30 + 0.10 * (k % 2));
      const sg = b.createRadialGradient(sx2, sy2, 0.5, sx2, sy2, gh * 0.42);
      sg.addColorStop(0, 'rgba(255,226,166,0.85)'); sg.addColorStop(1, 'rgba(255,210,140,0)');
      b.fillStyle = sg; b.fillRect(gx, gy, dw, gh);
    }
    b.fillStyle = 'rgba(190,214,255,0.16)';
    b.fillRect(gx, gy + gh * 0.80, dw, gh * 0.20);
    // mullions and the reflection of the lit room in the glass
    b.fillStyle = '#3A2C22';
    b.fillRect(gx + dw / 2 - Math.max(1, dw * 0.028), gy, Math.max(2, dw * 0.056), gh);
    b.fillStyle = 'rgba(255,232,190,0.12)';
    b.fillRect(gx + dw * 0.06, gy + gh * 0.10, dw * 0.16, gh * 0.62);

    // the lit sign over the doors
    const sgnH = Math.max(5, openH * 0.13), sgnW = dw * 0.66;
    const sgX = gx + (dw - sgnW) / 2, sgY = oy + rev * 0.7;
    b.fillStyle = '#14432F'; b.fillRect(sgX, sgY, sgnW, sgnH);
    b.fillStyle = '#5DD39E'; b.fillRect(sgX + 1, sgY + 1, sgnW - 2, sgnH - 2);
    if (sgnH >= 8) drawUnflipped(b, 'OUT', sgX + sgnW / 2, sgY + sgnH * 0.55,
      '800 ' + Math.round(sgnH * 0.74) + 'px Inter, sans-serif', '#0B2A1D');
    const sgl = b.createRadialGradient(sgX + sgnW / 2, sgY + sgnH, 1, sgX + sgnW / 2, sgY + sgnH, openH * 0.7);
    sgl.addColorStop(0, 'rgba(120,226,180,0.30)'); sgl.addColorStop(1, 'rgba(120,226,180,0)');
    b.fillStyle = sgl; b.fillRect(0, 0, w, h);

    // --- pictures on the wall behind the desk ---
    if (h > 46) {
      paintPicture(b, w * 0.52, wallTop + wallH * 0.26, h * 1.35);
      paintPicture(b, w * 0.68, wallTop + wallH * 0.28, h * 1.05);
    }

    // --- reception desk ---
    const dW = Math.max(34, w * 0.26), dX = w * 0.44, dH = Math.max(14, wallH * 0.46);
    const dY = wallBot - dH;
    b.fillStyle = 'rgba(60,30,15,0.20)';
    b.fillRect(dX + 3, floorY - 2, dW, Math.max(2, h * 0.03));
    const cg2 = b.createLinearGradient(0, dY, 0, wallBot);
    cg2.addColorStop(0, '#8A5A34'); cg2.addColorStop(1, '#5E3A20');
    b.fillStyle = cg2; b.fillRect(dX, dY, dW, dH);
    b.fillStyle = '#B9834E';                                  // the lit counter top
    b.fillRect(dX - Math.max(1, dW * 0.02), dY, dW + Math.max(2, dW * 0.04), Math.max(2, dH * 0.13));
    b.fillStyle = 'rgba(255,255,255,0.10)';
    b.fillRect(dX + dW * 0.08, dY + dH * 0.32, dW * 0.84, dH * 0.40);
    // a small lamp on the desk
    const lx = dX + dW * 0.16, ly = dY - Math.max(4, dH * 0.30);
    const lg2 = b.createRadialGradient(lx, ly, 1, lx, ly, Math.max(9, dH * 0.9));
    lg2.addColorStop(0, 'rgba(255,220,150,0.55)'); lg2.addColorStop(1, 'rgba(255,220,150,0)');
    b.fillStyle = lg2; b.fillRect(lx - dH, ly - dH, dH * 2, dH * 2);
    b.fillStyle = '#3A2C2A'; b.fillRect(lx - Math.max(0.7, dH * 0.03), ly, Math.max(1.4, dH * 0.06), dY - ly);
    b.fillStyle = '#FFE7B4';
    b.beginPath();
    b.moveTo(lx - Math.max(3, dH * 0.20), ly);
    b.lineTo(lx + Math.max(3, dH * 0.20), ly);
    b.lineTo(lx + Math.max(2, dH * 0.13), ly - Math.max(3, dH * 0.22));
    b.lineTo(lx - Math.max(2, dH * 0.13), ly - Math.max(3, dH * 0.22));
    b.closePath(); b.fill();

    // --- planting: a tall one by the doors, a smaller one by the lift ---
    paintPlant(b, ox + dw + rev * 2 + Math.max(10, w * 0.05), floorY, h * 0.34, 5);
    paintPlant(b, w * 0.86, floorY, h * 0.24, 4);

    // --- a rug in front of the desk ---
    const rx = dX - w * 0.02, rw2 = dW * 1.1;
    b.fillStyle = 'rgba(142,58,52,0.55)';
    b.fillRect(rx, floorY + (h - floorY) * 0.30, rw2, Math.max(2, (h - floorY) * 0.34));
  }

  function paintPlant(b, x, baseY, size, blades) {
    const pot = Math.max(6, size * 0.55);
    b.fillStyle = 'rgba(60,30,15,0.22)';
    b.beginPath(); b.ellipse(x, baseY, pot * 0.66, pot * 0.15, 0, 0, Math.PI * 2); b.fill();
    b.lineCap = 'round';
    for (let k = -(blades >> 1); k <= (blades >> 1); k++) {
      b.strokeStyle = k % 2 ? PLANT_C : '#3F7E48';
      b.lineWidth = Math.max(1.5, pot * 0.17);
      b.beginPath();
      b.moveTo(x, baseY - pot * 0.75);
      b.quadraticCurveTo(x + k * pot * 0.30, baseY - pot * 1.9,
                         x + k * pot * 0.52, baseY - pot * (2.5 - Math.abs(k) * 0.28));
      b.stroke();
    }
    b.fillStyle = POT_C;
    b.beginPath();
    b.moveTo(x - pot * 0.44, baseY - pot * 0.82);
    b.lineTo(x + pot * 0.44, baseY - pot * 0.82);
    b.lineTo(x + pot * 0.32, baseY);
    b.lineTo(x - pot * 0.32, baseY);
    b.closePath(); b.fill();
    b.fillStyle = 'rgba(0,0,0,0.10)';
    b.fillRect(x - pot * 0.44, baseY - pot * 0.82, pot * 0.88, Math.max(1, pot * 0.10));
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
      lit: makeSprite(SMOKE_LIT), litWarm: makeSprite('198,182,180'),
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
    fireGlow(now, true);                                     // the core, back through the smoke
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
      /* THE FLOOR SIGN IS THE BUILDING-LEVEL WARNING. Somebody about to go
         is no use to the player if it can only be seen by scanning eight
         corridors: the sign for that floor goes red and pulses, so the thing
         you have to decide about announces itself from anywhere on screen. */
      let crit = 0;
      for (const p of waiting) if (p.floor === f && p.exp > FIRE.warnAt) crit = Math.max(crit, p.exp);
      const pulse = crit ? (REDUCED ? 1 : 0.55 + 0.45 * Math.sin(performance.now() / 130)) : 0;
      const plate = (px2, align) => {
        ctx.fillStyle = crit ? 'rgba(' + Math.round(120 + 90 * pulse) + ',26,20,0.92)' : 'rgba(11,16,32,0.74)';
        rr(px2 - (align === 'left' ? 3 : pw - 3), y - ph / 2, pw, ph, 3); ctx.fill();
        ctx.fillStyle = crit ? '#FFEDE6' : FLOOR_NUM; ctx.textAlign = 'center';
        ctx.fillText(String(f), px2 - (align === 'left' ? 3 : pw - 3) + pw / 2, y);
        if (crit) {
          ctx.strokeStyle = 'rgba(255,90,70,' + (0.85 * pulse).toFixed(3) + ')';
          ctx.lineWidth = 1.6;
          rr(px2 - (align === 'left' ? 3 : pw - 3) - 1.5, y - ph / 2 - 1.5, pw + 3, ph + 3, 4); ctx.stroke();
        }
      };
      plate(geo.leftX + 9, 'left');
      if (geo.rightW > 0) plate(geo.rightX + geo.rightW - 9, 'right');
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }
  /* THE FIRE IS LIGHT, NOT DRAWN FLAMES. Literal tongues at the end of the
     corridor came out as cartoon candles stuck on the wall - crude, and
     nothing like the register of the rest of the building.

     What you actually see of a fire from down a hallway is a blown-out glow
     around the corner: a core hotter than anything else on screen, a tight
     feather off it, and the doors nearest it going to silhouette. The house
     rule says the same thing - a glow is a thin bright core with a tight
     feather, never a wide wash.

     Drawn UNDER the smoke, so the smoke pouring out of that end is lit from
     behind by it, with only the core punching back through. */
  function fireGlow(now, overSmoke) {
    const f = level.fire, top = roomTop(f), h = geo.floorPx;
    const t = REDUCED ? 0 : now / 1000;
    const flick = REDUCED ? 1 : 0.90 + 0.10 * (Math.sin(t * 3.1) * 0.6 + Math.sin(t * 7.7) * 0.4);
    const sides = [{ x: geo.leftX, dir: 1, w: geo.corW }];
    if (geo.rightW > 0) sides.push({ x: geo.rightX + geo.rightW, dir: -1, w: geo.rightW });
    ctx.save();
    ctx.beginPath(); rr(geo.x - 6, geo.y - 8, geo.w + 12, geo.h + 8, 8); ctx.clip();
    for (const s of sides) {
      /* SATURATION, NOT BRIGHTNESS. Against the old amber wall the fire was
         invisible because orange sat on orange, so it was made near-white -
         and against a CREAM wall that failed the other way, because cream is
         already at the top of the range and nothing can out-brighten it. It
         measured 1.26:1.

         What separates a fire from a pale wall is COLOUR: the wall is
         deliberately desaturated and the fire is the most saturated thing in
         the building. A deep orange-red body with only a small hot centre
         reads instantly on cream, where a white blaze just looked like more
         wall. Luminance contrast is the wrong measure for this one element and
         the numbers say so. */
      const reach = Math.max(20, s.w * (overSmoke ? 0.10 : 0.30));
      const k = overSmoke ? 0.62 : 1;
      const g = ctx.createLinearGradient(s.x, 0, s.x + s.dir * reach, 0);
      g.addColorStop(0, 'rgba(255,244,206,' + (0.95 * k * flick).toFixed(3) + ')');
      g.addColorStop(0.05, 'rgba(255,166,44,' + (0.94 * k * flick).toFixed(3) + ')');
      g.addColorStop(0.18, 'rgba(240,88,20,' + (0.80 * k * flick).toFixed(3) + ')');
      g.addColorStop(0.45, 'rgba(206,52,14,' + (0.42 * k * flick).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(180,40,12,0)');
      ctx.fillStyle = g;
      ctx.fillRect(Math.min(s.x, s.x + s.dir * reach), top, reach, h);
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
    for (const r of fallen) drawFallen(r);
    for (const p of waiting) {
      const q = personXY(p);
      /* PACING. Nobody waiting for a lift in a fire stands still. Some walk a
         few steps back and forth, some hold their ground; whoever is starting
         to struggle stops and crouches instead. The walk is SMALL and centred
         on where they stand, because where they stand is their clock and every
         level is certified against it - so this moves the picture, never the
         model. */
      /* URGENCY. They were strolling. Somebody waiting for a lift in a
         burning building does not stroll: they move quickly, they keep turning
         back to the shaft, and the worse the air gets the more agitated they
         are until they cannot keep it up at all. Pace speed rises with how
         close the smoke is to them. */
      const near = Math.max(0, Math.min(1, (smoke[p.floor] - p.stand + 0.30) / 0.45));
      const urgency = Math.max(near, p.exp * 1.3);
      /* WALKING, then WAITING. They used to oscillate on the spot, which reads
         as a queue at a bus stop. Now while there is corridor between them and
         the doors they are covering it - and the figure moves because p.stand
         moves, so the picture and the model are the same thing rather than an
         animation laid over a static clock.
         Once they reach the front of the queue they stop, and what is left is
         the fidget of somebody waiting for a lift they need: a half step back,
         a turn to look at what is coming down the corridor. They never shuffle
         PAST their place, so the queue holds its shape. */
      const walking = p.stand < p.goal - 0.004;
      let px2 = q.x, face = q.face, gait = -1;
      if (walking && !REDUCED) {
        gait = (tt * (2.1 + 0.7 * hash01(p.id * 2.7)) * (1 + urgency * 0.5)) % 1;
      } else if (!REDUCED && p.exp < 0.62) {
        const sp = (0.42 + 0.26 * hash01(p.id * 5.1 + 2)) * (1 + urgency * 0.9);
        const ph = (tt * sp + hash01(p.id * 9.3 + 3)) % 1;
        px2 = q.x - q.face * Math.abs(Math.sin(ph * Math.PI)) * geo.corW * (0.014 + 0.012 * urgency);
        const lo = (q.face > 0 ? geo.leftX : geo.rightX) + edgePad;
        const hi = (q.face > 0 ? geo.leftX + geo.corW : geo.rightX + geo.rightW) - edgePad;
        px2 = Math.max(lo, Math.min(hi, px2));
        const look = (tt * (0.30 + 0.22 * hash01(p.id * 6.1)) + hash01(p.id * 1.9)) % 1;
        face = look < (0.22 + 0.20 * urgency) ? -q.face : q.face;
        gait = ph;
      }
      /* A COUGH is the warning that somebody is about to go. It is a jolt you
         can see from across the building, it fires on its own rhythm per
         person so a corridor in trouble sounds and looks like one, and it
         arrives well before they are lost. */
      let cough = 0;
      if (p.exp > FIRE.warnAt) {
        const c = (tt * (0.85 + 0.35 * hash01(p.id * 4.3)) + hash01(p.id * 8.1)) % 1;
        /* Reduced motion drops the JOLT, never the warning. Somebody who has
           asked for less movement still needs to hear which corridor is in
           trouble - it is the only notice they get before a strike. */
        if (c < 0.16 && !REDUCED) cough = Math.sin((c / 0.16) * Math.PI);
        if (c < 0.02 && p.coughAt !== Math.floor(tt)) {
          p.coughAt = Math.floor(tt);
          if (snd) snd.cough(p.id);
        }
      }
      const m = drawPerson(px2, q.y, h, p.exp, p.id + 1, now, face, gait, cough);
      drawOxygen(m.hx, m.headTop, m.h, p.exp);
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

  /* A PERSON IN PROFILE, because a front-on figure cannot walk. Legs swinging
     left and right across a body facing the viewer is not a stride, it is a
     shuffle - which is exactly why they read as pictograms sidestepping down
     the hall. Walking is a side-on action, and everyone here is facing the
     lift anyway.

     So: profile. Head with a brow and a jaw and hair, a torso with a chest and
     a back, a near arm and leg over a far arm and leg drawn darker behind, and
     a real two-key gait - thigh swings, knee bends only on the way through,
     arms counter-swing, body bobs on each step. Feet point where they are
     going. Everything is a filled form lit from above, no outline and no face.

     Posture is the second channel on exposure and it is the honest one: as the
     smoke takes hold they sink, a hand comes up to the mouth, and the head
     drops. Colour never carries it alone. */
  function drawPerson(cx, baseY, h0, exp, seed, now, face, gait, cough) {
    const rnd = (k) => hash01(seed * 7.3 + k * 19.7);
    const fem = rnd(8) > 0.5;
    const fit = OUTFITS[Math.floor(rnd(9) * OUTFITS.length) % OUTFITS.length];
    const duck = ease(Math.max(0, (exp - 0.26) / 0.62));
    const h = h0 * (fem ? 0.90 : 0.95) * (0.94 + 0.13 * rnd(1)) * (1 - 0.24 * duck);
    const f = face || 1;
    const t = REDUCED ? 0 : now / 1000;
    const walking = gait != null && gait >= 0 && !REDUCED;
    const ph = walking ? gait * 6.283 : 0;
    const idle = REDUCED ? 0 : Math.sin(t * 1.15 + rnd(2) * 6.283);
    const breath = REDUCED ? 0 : Math.sin(t * 1.9 + rnd(3) * 6.283) * h * 0.005;
    const cg2 = cough || 0;
    const bob = walking ? Math.abs(Math.cos(ph)) * h * 0.016 : idle * h * 0.004;

    const Y = (u) => baseY - h * u - bob;
    const lean = f * h * (walking ? 0.030 : 0.008) + f * h * (0.075 * duck + 0.10 * cg2) + (walking ? 0 : idle * h * 0.006);

    const headR = h * 0.088;
    const hipY = Y(0.495), shoulderY = Y(0.815) + breath;
    const hipX = cx + lean * 0.30, shoulderX = cx + lean;
    const legLen = hipY - baseY;                              // negative, downward
    const armLen = h * 0.335;
    /* WITH SOME MASS TO THEM. A profile body is far narrower than a front-on
       one, and drawn at the old depth they came out gaunt - spindly enough
       that the contrast sweep could barely find them, which was the 1.7 the
       last pass left unresolved. */
    const depth = h * (fem ? 0.150 : 0.180) * (0.92 + 0.16 * rnd(6));

    const dark = ctx.createLinearGradient(0, Y(1.0), 0, baseY);
    dark.addColorStop(0, fit[0]); dark.addColorStop(1, fit[1]);
    const far = 'rgba(14,12,20,0.85)';                        // limbs on the far side

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // a contact shadow, so they are standing on the runner and not floating
    ctx.fillStyle = 'rgba(50,20,10,0.30)';
    ctx.beginPath(); ctx.ellipse(cx + lean * 0.2, baseY + 1, h * 0.15, h * 0.027, 0, 0, Math.PI * 2); ctx.fill();

    /* One leg. `side` is +1 for the near leg and -1 for the far one; they run
       half a cycle apart. The knee only bends on the swing through, which is
       the difference between a walk and a pair of scissors. */
    const drawLeg = (side, colour) => {
      const p2 = ph + (side > 0 ? 0 : Math.PI);
      const a1 = walking ? Math.sin(p2) * 0.52 : side * (0.05 + 0.05 * rnd(4));
      const bend = walking ? Math.max(0, Math.sin(p2 + 1.15)) * 0.95 : 0.06;
      const a2 = a1 - bend - duck * 0.5;
      const thigh = -legLen * 0.47, shin = -legLen * 0.53;
      const kx = hipX + f * Math.sin(a1) * thigh + f * h * 0.05 * duck;
      const ky = hipY + Math.cos(a1) * thigh;
      const ax = kx + f * Math.sin(a2) * shin;
      const ay = Math.min(baseY, ky + Math.cos(a2) * shin);
      ctx.strokeStyle = colour; ctx.lineWidth = Math.max(2.4, h * (fem ? 0.070 : 0.084));
      ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(kx, ky); ctx.lineTo(ax, ay); ctx.stroke();
      // a foot, pointing where they are going
      ctx.lineWidth = Math.max(2, h * 0.052);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + f * h * 0.062, ay + h * 0.004); ctx.stroke();
    };

    const drawArm = (side, colour) => {
      const p2 = ph + (side > 0 ? Math.PI : 0);               // arms oppose the legs
      const cover = side > 0 ? duck : duck * 0.2;             // a hand to the mouth
      const a1 = walking ? Math.sin(p2) * 0.42 : side * (0.06 + 0.05 * rnd(5));
      const a2 = a1 + (walking ? Math.max(0, -Math.sin(p2)) * 0.7 : 0.12);
      const upper = armLen * 0.47, fore = armLen * 0.53;
      let ex = shoulderX + f * Math.sin(a1) * upper, ey = shoulderY + Math.cos(a1) * upper;
      let hx2 = ex + f * Math.sin(a2) * fore, hy2 = ey + Math.cos(a2) * fore;
      if (cover > 0.02) {                                     // fold it up to the face
        ex = shoulderX + f * h * 0.045 * (1 - cover) + f * h * 0.02 * cover;
        ey = shoulderY + upper * (1 - cover * 0.45);
        hx2 = shoulderX + f * h * (0.05 * (1 - cover) + 0.055 * cover);
        hy2 = shoulderY + (fore + upper) * (1 - cover) * 0.9 + (Y(0.855) - shoulderY) * cover;
      }
      ctx.strokeStyle = colour; ctx.lineWidth = Math.max(2.2, h * 0.066);
      ctx.beginPath(); ctx.moveTo(shoulderX, shoulderY); ctx.lineTo(ex, ey); ctx.lineTo(hx2, hy2); ctx.stroke();
      if (side > 0) { ctx.fillStyle = HEAD; ctx.beginPath(); ctx.arc(hx2, hy2, Math.max(1.2, h * 0.026), 0, Math.PI * 2); ctx.fill(); }
    };

    // far side first, then the body, then the near side over it
    drawLeg(-1, far); drawArm(-1, far);

    /* The torso in profile: a back that curves, a chest that stands proud of
       it, and a waist that comes in. Drawn as one filled shape rather than a
       rectangle, which is most of what separates a body from a sign. */
    const sB = shoulderX - f * depth * 0.52, sF = shoulderX + f * depth * 0.48;
    const hB = hipX - f * depth * 0.46, hF = hipX + f * depth * 0.44;
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(sB, shoulderY);
    ctx.quadraticCurveTo(sB - f * depth * 0.10, Y(0.66), hB, hipY);
    ctx.lineTo(hF, hipY);
    ctx.quadraticCurveTo(hF + f * depth * 0.16, Y(0.68), sF, shoulderY);
    ctx.quadraticCurveTo(shoulderX + f * depth * 0.30, Y(0.845), shoulderX, Y(0.845));
    ctx.closePath(); ctx.fill();

    // neck
    ctx.strokeStyle = HEAD; ctx.lineWidth = Math.max(2, h * 0.062);
    ctx.beginPath();
    ctx.moveTo(shoulderX + f * h * 0.006, Y(0.828));
    ctx.lineTo(shoulderX + f * h * 0.016, Y(0.868) + breath);
    ctx.stroke();

    /* The head in profile: a skull, a brow and a nose on the front, a jaw, and
       a hair mass over the back of it. Those four things are what make a small
       circle read as a head facing somewhere. */
    const hx = shoulderX + f * h * 0.022 + lean * 0.25 - f * h * 0.03 * duck;
    const hy = Y(0.925) + breath + h * 0.02 * duck;
    ctx.fillStyle = HEAD;
    ctx.beginPath(); ctx.arc(hx, hy, headR, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();                                          // brow, nose and jaw
    ctx.moveTo(hx + f * headR * 0.20, hy - headR * 0.72);
    ctx.quadraticCurveTo(hx + f * headR * 1.32, hy - headR * 0.10, hx + f * headR * 0.62, hy + headR * 0.52);
    ctx.lineTo(hx - f * headR * 0.10, hy + headR * 0.86);
    ctx.quadraticCurveTo(hx - f * headR * 0.60, hy + headR * 0.40, hx - f * headR * 0.30, hy - headR * 0.30);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = SKIN_HI;                                  // lit from the ceiling
    ctx.beginPath(); ctx.arc(hx - f * headR * 0.18, hy - headR * 0.34, headR * 0.52, 0, Math.PI * 2); ctx.fill();
    // hair: a cap over the crown and back, longer on some people
    const longHair = fem ? rnd(7) > 0.25 : rnd(7) > 0.80;
    ctx.fillStyle = HAIR;
    ctx.beginPath();
    ctx.moveTo(hx + f * headR * 0.52, hy - headR * 0.62);
    ctx.quadraticCurveTo(hx, hy - headR * 1.42, hx - f * headR * 0.92, hy - headR * 0.42);
    ctx.quadraticCurveTo(hx - f * headR * (longHair ? 1.20 : 0.98), hy + headR * (longHair ? 0.95 : 0.15),
                         hx - f * headR * (longHair ? 0.55 : 0.62), hy + headR * (longHair ? 0.85 : 0.05));
    ctx.quadraticCurveTo(hx - f * headR * 0.30, hy - headR * 0.55, hx + f * headR * 0.52, hy - headR * 0.62);
    ctx.closePath(); ctx.fill();

    drawLeg(1, dark);
    /* A SKIRT is most of what tells you at forty pixels that this is a woman
       and that one is a man - the silhouette does it, not detail nobody can
       see. Drawn over the legs, which still show below the hem. */
    if (fem) {
      const hemY = Y(0.30), flare = depth * (1.35 + 0.35 * rnd(10));
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(hipX - f * depth * 0.46, hipY - h * 0.03);
      ctx.quadraticCurveTo(hipX - f * flare * 0.75, Y(0.42), hipX - f * flare, hemY);
      ctx.quadraticCurveTo(hipX, hemY + h * 0.022, hipX + f * flare * 0.86, hemY);
      ctx.quadraticCurveTo(hipX + f * flare * 0.62, Y(0.42), hipX + f * depth * 0.44, hipY - h * 0.03);
      ctx.closePath(); ctx.fill();
    }
    drawArm(1, dark);

    return { headTop: hy - headR * (1 + 0.35), hx, h, hy, bodyY: (shoulderY + hipY) / 2, armY: Y(0.62) };
  }


  const headCYOf = (baseY, h, duck) => baseY - h * (0.905 - 0.02 * duck);

  /* A STRAIGHT CAPSULE, not an arc. How much air somebody has left is the
     number the whole game is played on, and a depleting arc makes you judge an
     angle; a bar you read at a glance. Dark track under it, because a coral
     fill on grey smoke measured 1.06:1 on its own. */
  function drawOxygen(cx, topY, h, exp) {
    const left = Math.max(0, Math.min(1, 1 - exp));
    const bw = Math.max(14, h * 0.72), bh = Math.max(4, h * 0.145);
    const x = cx - bw / 2, y = topY - bh * 1.9;
    ctx.fillStyle = 'rgba(10,8,16,0.85)';
    rr(x - 1.5, y - 1.5, bw + 3, bh + 3, (bh + 3) / 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    rr(x, y, bw, bh, bh / 2); ctx.fill();
    if (left > 0.005) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y - 1, Math.max(1, bw * left), bh + 2); ctx.clip();
      ctx.fillStyle = left > 0.55 ? BREATH_OK : left > 0.28 ? BREATH_MID : BREATH_LOW;
      rr(x, y, bw, bh, bh / 2); ctx.fill();
      ctx.restore();
    }
    if (left < 0.28 && !REDUCED) {
      const pulse = 0.45 + 0.55 * Math.sin(performance.now() / 150);
      ctx.strokeStyle = 'rgba(240,90,70,' + (0.55 * pulse).toFixed(3) + ')';
      ctx.lineWidth = 1.6;
      rr(x - 1.5, y - 1.5, bw + 3, bh + 3, (bh + 3) / 2); ctx.stroke();
    }
  }

  /* THEY COLLAPSE, THEY DO NOT VANISH. Somebody blinking out of existence
     reads as a rendering glitch, not as a person you failed to reach - and it
     hid the one thing the player most needs to see. So they sink down against
     the wall and stay there for the rest of the run: slumped, still, and
     desaturated, so a corridor you have given up on looks like one. Nothing is
     drawn over them and nobody dies on screen; the brigade gets them. */
  function drawFallen(r) {
    const h = geo.floorPx * 0.50;
    const baseY = slabY(r.floor) - 3 - geo.floorPx * 0.055;
    const f = r.side;
    const x = r.x;
    const t = Math.min(1, r.t / 0.9);
    const sink = ease(t);
    const hipY = baseY - h * 0.20 * (1 - sink) - h * 0.12;
    const shX = x - f * h * 0.24 * sink, shY = baseY - h * (0.62 - 0.26 * sink);

    ctx.globalAlpha = 0.55 + 0.45 * (1 - sink * 0.35);
    ctx.fillStyle = 'rgba(40,20,12,0.28)';
    ctx.beginPath(); ctx.ellipse(x, baseY + 1, h * 0.30, h * 0.045, 0, 0, Math.PI * 2); ctx.fill();

    const g = ctx.createLinearGradient(0, shY, 0, baseY);
    g.addColorStop(0, '#4A4552'); g.addColorStop(1, '#2B2733');   // the colour has gone out of them
    ctx.strokeStyle = g; ctx.fillStyle = g;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // legs, out along the floor
    ctx.lineWidth = Math.max(2, h * 0.058);
    ctx.beginPath();
    ctx.moveTo(x, hipY);
    ctx.lineTo(x + f * h * 0.26, baseY - h * 0.05);
    ctx.lineTo(x + f * h * 0.52, baseY - h * 0.012);
    ctx.stroke();
    // torso, leaning back against the wall
    ctx.lineWidth = Math.max(3, h * 0.150);
    ctx.beginPath(); ctx.moveTo(x, hipY); ctx.lineTo(shX, shY); ctx.stroke();
    // an arm gone slack
    ctx.lineWidth = Math.max(1.8, h * 0.048);
    ctx.beginPath();
    ctx.moveTo(shX, shY); ctx.lineTo(shX + f * h * 0.10, shY + h * 0.17);
    ctx.lineTo(shX + f * h * 0.24, baseY - h * 0.02); ctx.stroke();
    // head, fallen forward
    const hr = h * 0.082;
    ctx.fillStyle = '#9C8878';
    ctx.beginPath(); ctx.arc(shX - f * hr * 0.35, shY - hr * 0.75, hr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#241C22';
    ctx.beginPath(); ctx.arc(shX - f * hr * 0.85, shY - hr * 1.05, hr * 0.80, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
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
    const line = 'OUT ' + out + '   ·   ' + inside + ' INSIDE' + (best ? '   ·   BEST ' + best : '');
    const hs = Math.max(0.66, Math.min(1, LW / 620));
    let fs = Math.round(16 * hs);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = INK72; ctx.font = '600 ' + fs + 'px Inter, sans-serif';
    while (fs > 11 && ctx.measureText(line).width > (LW - SIDE_PAD) - readoutMinX) {
      fs -= 1; ctx.font = '600 ' + fs + 'px Inter, sans-serif';
    }
    const readoutLeft = (LW - SIDE_PAD) - ctx.measureText(line).width;
    ctx.fillText(line, LW - SIDE_PAD, topBand() / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    /* THE STRIKES, as dots. Three people overcome ends the run, so how many
       are gone is the second thing worth knowing after the score, and a count
       you have to read as a word is a count you miss. */
    const dotR = 4.5, dg = 12;
    const dx0 = readoutLeft - dg * STRIKES - 12;
    for (let i = 0; i < STRIKES; i++) {
      ctx.beginPath(); ctx.arc(dx0 + i * dg, topBand() / 2, dotR, 0, Math.PI * 2);
      ctx.fillStyle = i < lost ? '#F05A46' : 'rgba(255,255,255,0.18)';
      ctx.fill();
    }

    /* A WAVE HAS TO ANNOUNCE ITSELF. The number in the corner changing is the
       kind of change nobody sees; the game saying it out loud for a moment is
       why arcades did it that way. Drawn over the shaft, never over a
       corridor, so it cannot hide somebody you need to reach. */
    if (waveFlash > 0 && wave > 1) {
      /* It said WAVE 2. A wave number is a designer's word for a difficulty
         step - it tells the player which bucket they are in and nothing about
         their building. Say what actually just happened instead. */
      const a = Math.min(1, waveFlash * 2.2);
      const cy2 = geo.y + geo.h * 0.5;
      const msg = 'THE FIRE IS GETTING STRONGER';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let ms = 22;
      ctx.font = '800 ' + ms + 'px Inter, sans-serif';
      while (ms > 11 && ctx.measureText(msg).width > LW - SIDE_PAD * 2 - 32) {
        ms -= 1; ctx.font = '800 ' + ms + 'px Inter, sans-serif';
      }
      const bw = ctx.measureText(msg).width + 36, bh = ms + 26;
      ctx.fillStyle = 'rgba(10,8,16,' + (0.62 * a).toFixed(3) + ')';
      rr(LW / 2 - bw / 2, cy2 - bh / 2, bw, bh, 12); ctx.fill();
      ctx.fillStyle = 'rgba(255,150,60,' + a.toFixed(3) + ')';
      ctx.fillText(msg, LW / 2, cy2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }

    if (MODE === 'mobile' && statusLane() > 0 && tNow < 14) {
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
    ctx.fillText(out + (out === 1 ? ' PERSON OUT' : ' PEOPLE OUT'), b.px + b.pw / 2, b.py + 34);

    ctx.font = '600 17px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    const uniq = [...new Set(lostFloors)].sort((a, b2) => b2 - a);
    const sub = uniq.length === 1 ? 'Floor ' + uniq[0] + ' was still waiting.'
              : 'Floors ' + uniq.slice(0, 3).join(', ') + ' were still waiting.';
    ctx.fillText(sub, b.px + b.pw / 2, b.py + 84);

    ctx.font = '500 16px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.fillText(out >= best && out > 0 ? 'A new best.' : 'Best so far: ' + best,
                 b.px + b.pw / 2, b.py + 118);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    const label = 'PLAY AGAIN';
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
    get level() { return level; }, get fallen() { return fallen; },
    geo, RUN, start: startRun, snd, FIRE,
    get renderMs() { return renderMs; },
    /* Drive headlessly, for verification: hold a direction, then let go and let
       it brake to rest and serve. */
    drive(dir, secs) {
      const dt = 1 / 120;
      for (let t = 0; t < secs; t += dt) { keyDir = dir; step(dt); }
      keyDir = 0;
      for (let i = 0; i < 2400 && (Math.abs(car.v) > 1e-6 || phase === 'serve' || phase === 'level'); i++) step(dt);
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

  startRun();
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
