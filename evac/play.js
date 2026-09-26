/* ============================================================
   Evac · A Zamborin Game

   A hotel is on fire. Smoke rises from the fire floor and fills the corridors
   above it, and the way out is the lobby at the bottom. You are the elevator.

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

  const M = window.EvacModel;
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
  const HARNESS = new URLSearchParams(location.search).get('harness') === '1';
  let frozen = false;                  // a test holding the picture still (HARNESS)

  /* ---------- CANVAS ---------- */
  let LW, LH;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const gameWrap = canvas.parentElement;

  /* THE FRAME FILLS ITS WINDOW WHEN THE GAME IS THE WHOLE PAGE (DESIGN-SYSTEM
     2.2, as Comb does). On zamborin.com the desktop game sits in the 760x600
     site frame. In an embed and in full screen the window IS the frame, one
     CSS pixel to one unit, and the hotel is laid out in it instead of the
     760x600 picture being letterboxed into it. A desktop window narrower than
     760 is laid out 760 across and scaled, so the top band keeps its row of
     pills. A zero reading (a hidden frame's first tick) falls back to the
     site frame until the real size arrives on the next resize. */
  const fillsWindow = () => MODE === 'mobile' ||
    document.documentElement.classList.contains('embed') ||
    document.body.classList.contains('focus-mode');
  function setCanvasVars() {
    if (fillsWindow()) {
      const vw = window.innerWidth > 0 ? window.innerWidth : 760;
      const vh = window.innerHeight > 0 ? window.innerHeight : 600;
      const k = (MODE === 'desktop' && vw < 760) ? 760 / vw : 1;
      LW = Math.round(vw * k); LH = Math.round(vh * k);
    } else { LW = 760; LH = 600; }
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
    if (fillsWindow()) {
      gameWrap.style.width = (window.innerWidth > 0 ? window.innerWidth : LW) + 'px';
      gameWrap.style.height = (window.innerHeight > 0 ? window.innerHeight : LH) + 'px';
      return;
    }
    gameWrap.style.width = ''; gameWrap.style.height = '';
  }
  function onResize() {
    setCanvasVars();
    fitFullscreen(); resizeCanvas(); layout(); render(performance.now());
  }

  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zam.evac.sfx', gain: 1.5 }) : null;
  const UI = window.ZAM_UI;

  /* ---------- THE SOUND OF A BUILDING ON FIRE ----------
     The voices live in sound.js so the bench can play each one alone; the
     first version of this was judged by looking at the code rather than by
     listening, which is not a way to judge a sound. What is left here is the
     wiring: what the game tells the sound about itself, once a frame. */
  const snd = window.EvacSound ? window.EvacSound.create(sfx) : null;

  /* THE ALARM HAS ITS OWN SWITCH. It is the one voice in the game that carries
     no information - the cough points at a person, the collapse at a strike,
     the bell at your own stop - so it is the one somebody might reasonably want
     gone while keeping the rest. Muting everything to escape it is too blunt a
     trade. Remembered per device, like the sound setting. */
  const ALARM_KEY = 'zam.evac.alarm';
  let alarmOn = (() => { try { return localStorage.getItem(ALARM_KEY) !== '0'; } catch (e) { return true; } })();

  function stepAmbience(dt) {
    if (!snd) return;
    let burn = 0;
    if (smoke && level) for (let f = 1; f <= level.floors; f++) burn += smoke[f];
    snd.ambience(dt, {
      alarm: alarmOn,
      live: phase !== 'over' && !document.hidden,
      burn: burn / Math.max(1, level ? level.floors * 0.7 : 1),
      speed: Math.abs(car.v) / T.vMax
    });
  }

  const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){}, levelRestart(){}, hintUsed(){}, track(){} };
  const TR = () => (window.ZAM_TRACK || NOOP);
  TR().init('evac');

  /* ---------- COLOUR ----------
     Chrome takes tokens (shared/tokens.css). The hotel is game art and carries
     its own palette. Canvas cannot read CSS variables, so this is the one place
     they are restated. */
  const GROUND = '#0E1726', SURFACE = '#131F36', RAISED = '#1A2A45';
  const INK72 = 'rgba(255,255,255,0.72)', CORAL = '#C24A39';

  /* FLAT NIGHT (owner, 2026-09-25, chosen from four styles and then tuned).
     The night is OUTSIDE: a deep teal sky with a moon, and the building's
     shell in the same teal. Inside, the warm beige walls that let the old
     painted hotel's smoke stand out, walnut doors, a honey-wood floor, brick
     planters, and lamps drawn as a flat disc in rings of fading halo. Every
     piece of art is flat fills with no outline; the only gradient left is the
     sky. The people are drawn rather than painted, because a realistic figure
     always looked a little off. */
  const NIGHT = '#143A49', NIGHT_HI = '#1C4A5B', MIST = 'rgba(47,103,120,0.55)';
  const SHELL = '#0D2A35', SHELL_HI = '#1A4453', CEIL = '#17414F';
  const WALL = '#F3DBB0', WALL_LO = '#E6C592', RAIL = '#D6AC72';
  const DOOR = '#7A4A32', DOOR_HI = '#93603F', DOOR_FRAME = '#57331F';
  const FLOOR = '#B98050', FLOOR_LINE = '#CF9866', FLOOR_LIP = '#8E5E36';
  const BRICK = '#B5553C', BRICK_DK = '#8E3F2C', BRICK_LT = '#CB6B4E', LEAF = '#2FA37A', LEAF_LT = '#45C08F';
  const MOON = '#F6D94A', MOON_SPOT = '#EDA83C', GLOW = '246,217,74', LAMP_GLOW = '255,248,222';
  const EXIT = '#35C2B4', EXIT_RGB = '53,194,180';
  const SHAFT = '#0A2530', SHAFT_RAIL = '#123644', CABLE = '#1D4C5C';
  const CAR = '#F6D94A', CAR_DK = '#EDA83C', CAR_IN = '#FFF3CF', CAR_FLOOR = '#F3DDA8', CAR_RAIL = '#EDC98A';
  /* SMOKE IS CLUSTERS OF FLAT CIRCLES, like soap bubbles (owner): three
     tones of slate, drawn solid into a layer of their own and laid down
     see-through, so the corridor shows through it and no two bubbles darken
     where they overlap. The fire's own floor burns warmer. */
  const SMOKE_T = ['#3E4A5C', '#4D5A6E', '#5E6C84'], SMOKE_WARM_T = ['#5B4449', '#6B525A', '#7E646C'];
  const SMOKE_ALPHA = 0.5;
  /* THE PEOPLE: dark legs and hair carry a figure against the lit wall
     (10.9:1) and inside the smoke (5.3:1); the light face and the white of
     the eye carry it in the smoke too. Every shirt clears 3:1 on the beige
     on its own, measured, so a party still reads as its colour. */
  const LEGS = '#1A2A33', NOSE = '#E24E5A', PUPIL = '#10222B';
  const OUTFITS = ['#D64B55', '#A1721C', '#8A5CD0', '#377FBE', '#468B2D', '#BD5A86', '#BE6324', '#1A897D'];
  const SKINS = ['#F4B9A6', '#E9A283', '#C98363', '#9A5D40', '#734330'];
  const HAIRS = ['#151515', '#2D1B12', '#4A2A1A', '#9A6A2A', '#8E3A22', '#6E7684'];
  const BREATH_OK = '#5DD39E', BREATH_MID = '#F0B23C', BREATH_LOW = '#F05A46';

  /* ---------- LAYOUT ----------
     CONTROLS AT THE TOP, THE READ-OUT AT THE BOTTOM LEFT, the fleet's
     arrangement since 2026-09-16 (DESIGN-SYSTEM 2.1, 4.2, 4.3). A phone has
     Restart and Rules as round icons across the top, the read-out bottom left
     and the two sound switches standing bare at the bottom right; the desktop
     keeps its pills top left and puts the read-out under the building. */
  const SIDE_PAD = 30;
  const PHONE_PAD = 16;          // a phone's side margin, for the bands and the building
  const PHONE_LEGEND = 52;       // a phone's bottom band, tall enough to clear the home indicator
  const DESK_READ_BAND = 40;     // the desktop's bottom band
  /* The roof line stands 12 above the top floor. Left out of the sum, it sat
     on the bottom edge of the pills in the 760x600 frame. */
  const ROOF = 12;
  const topBand = () => (MODE === 'mobile' ? 64 : 56);
  const botBand = () => (MODE === 'mobile' ? PHONE_LEGEND : DESK_READ_BAND);
  const buildPad = () => (MODE === 'mobile' ? PHONE_PAD : SIDE_PAD);
  const statusLane = () => (MODE === 'mobile' && LH >= 560 ? 26 : 0);
  const SEP = '   ·   ';

  const geo = {
    floorPx: 74, shaftW: 64, carW: 54, carH: 62,
    x: 0, y: 0, w: 0, h: 0, corW: 0, leftX: 0, shaftX: 0, rightX: 0, rightW: 0,
  };
  let ctrl = [], rowRight = 0, exitBox = null;

  function floors() { return level ? level.floors : 7; }

  function layout() {
    const availW = Math.max(80, LW - buildPad() * 2);
    const availH = Math.max(80, LH - topBand() - ROOF - botBand() - statusLane());
    const F = floors();
    /* The floor height is set by a five-floor building at minimum, so a small
       hotel is SHORT rather than stretched: you see its roof and the street,
       and the building grows into the frame as the levels do. */
    const maxFloor = MODE === 'mobile' ? 120 : 104;
    geo.floorPx = Math.max(30, Math.min(maxFloor, Math.floor(availH / Math.max(4, F))));
    geo.shaftW = Math.max(30, Math.min(84, Math.round(geo.floorPx * 0.80)));
    geo.h = geo.floorPx * F;
    geo.y = Math.round(topBand() + ROOF + (availH - geo.h) / 2);

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

  /* GUESTS SAVED, not OUT. "Out" is the programmer's word for the counter;
     the player is running a hotel and what they are counting is people.
     A LINE THAT WILL NOT FIT TAKES A SHORTER FORM, NEVER A SMALLER SIZE: the
     read-out keeps the fleet's 16px and a 320-wide phone gets fewer words
     (DESIGN-SYSTEM 4.3, 10.3). BEST yields first, because it is the one figure
     that is not about this run. */
  function readoutForms(saved, inside, bestV) {
    const f = [];
    if (bestV) f.push('GUESTS SAVED ' + saved + SEP + inside + ' INSIDE' + SEP + 'BEST ' + bestV);
    f.push('GUESTS SAVED ' + saved + SEP + inside + ' INSIDE');
    f.push('SAVED ' + saved + SEP + inside + ' INSIDE');
    f.push('SAVED ' + saved);
    return f;
  }
  /* The five strikes lead the read-out as dots, so they hold still while the
     figures grow to their right. */
  const DOT_R = 4.5, DOT_GAP = 12, DOTS_W = DOT_GAP * 4 + DOT_R * 2, DOTS_TO_TEXT = 14;

  /* The site's full-screen exit button hangs over the top band's right end
     from 1152 wide up, and whatever sits at that end stops 12 short of it
     (DESIGN-SYSTEM 4.2). Measured from the page each time the layout runs. */
  function exitButtonBox() {
    const el = document.getElementById('focus-toggle');
    if (!el || !document.body.classList.contains('focus-mode')) return null;
    const b = el.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    if (!b.width || !c.width) return null;
    const k = LW / c.width;
    const box = { x: (b.left - c.left) * k, y: (b.top - c.top) * k, w: b.width * k, h: b.height * k };
    return box.y < topBand() && box.x < LW ? box : null;
  }
  const bandRight = () => (exitBox ? Math.min(LW - buildPad(), exitBox.x - 12) : LW - buildPad());

  function layoutControls() {
    exitBox = exitButtonBox();
    if (MODE === 'mobile') {
      const D = UI.PILL.iconW, cy = topBand() / 2;       // 44 across: a circle, and the touch target
      const row = ['restart', 'rules'];
      const gap = Math.max(4, Math.min(28, (LW - PHONE_PAD * 2 - row.length * D) / (row.length - 1)));
      ctrl = row.map((id, i) => {
        const cx = PHONE_PAD + D / 2 + i * (D + gap);
        return { id, kind: 'round', cx, cy, x: Math.round(cx - D / 2), y: Math.round(cy - D / 2), w: D, h: D };
      });
      rowRight = ctrl[ctrl.length - 1].x + D;
      /* THE TWO SOUND SWITCHES STAND BARE at the bottom right: the speaker
         where every game keeps it, its drawing ending 16 from the edge (it runs
         from 7 left of its centre to 11 right), and the alarm bell one full
         target to its left. No circles, and each keeps a 44x44 target. */
      const ly = LH - PHONE_LEGEND / 2, sx = LW - PHONE_PAD - 11;
      const sBox = { x: Math.round(Math.min(LW - 44, sx - 20)), y: Math.round(Math.min(LH - 44, ly - 22)), w: 44, h: 44 };
      ctrl.push({ id: 'alarm', kind: 'bare', cx: sBox.x - 22, cy: ly, x: sBox.x - 44, y: sBox.y, w: 44, h: 44 });
      ctrl.push({ id: 'sound', kind: 'bare', cx: sx, cy: ly, x: sBox.x, y: sBox.y, w: 44, h: 44 });
      return;
    }
    const items = [{ id: 'sound', icon: true }, { id: 'alarm', icon: true }, { id: 'restart', label: 'Restart' }, { id: 'rules', label: 'Rules' }];
    ctx.save();
    items.forEach(it => { it.w = it.icon ? UI.PILL.iconW : UI.pillWidth(ctx, it.label); });
    ctx.restore();
    const cy = topBand() / 2;
    let x = SIDE_PAD;
    ctrl = items.map(it => {
      const box = { id: it.id, kind: 'pill', label: it.label, icon: it.icon, x, y: Math.round(cy - UI.PILL.h / 2),
                    w: it.w, h: UI.PILL.h, cx: x + it.w / 2, cy };
      x += it.w + UI.PILL.gap;
      return box;
    });
    rowRight = x - UI.PILL.gap;
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
  const SAVE = 'zam.evac.save';
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
  /* ARRIVALS CLOSE ON THE CAR'S LIMIT, THEN CRAWL.

     The linear ramp was measured and it made a cliff, not a curve. Across 25
     runs the first person was lost at 1:56 and the fifth at 2:28: nothing went
     wrong for two minutes and then the whole game happened in 31 seconds. The
     cause is that a lift is a queue, and a queue has a threshold rather than a
     slope - below the rate the car can serve, the corridors drain and nobody
     can be lost at all; above it the queue grows without bound and everybody
     is. A straight line through that threshold spends about half a minute in
     the only band where playing well is what saves anyone.

     So the rate FALLS FAST to about the rate the car can hold, and then
     tightens by a hair a wave. The run is spent just the wrong side of
     break-even, where one bad choice costs exactly one person and a good one
     wins them back, which is the only place a score means anything. */
  const RUN = {
    floors: 8,
    startPeople: 4,
    waveS: 16,                                          // how long a wave lasts
    spawnFrom: 5.2, spawnStep: 0.58,                    // seconds between arrivals, and the approach
    spawnKnee: 2.9, spawnCrawl: 0.24, spawnMin: 1.25,   // where it slows, and how slowly it tightens
    /* THE FIRE BURNS AT ONE STRENGTH. It used to ramp, and the ramp was
       measured as inert: the fire floor saturates inside the first forty
       seconds and is pinned there for the rest of the run, so freezing the
       ramp altogether moved the median run by zero seconds. Driving the
       SPREAD with it instead does land - and it lands the wrong way, flooding
       the whole building back to one flat lethal sheet and taking the skill
       gap from 3.78x down to 0.76x. The arrivals are the ramp now. */
    rateFrom: 0.028, rateStep: 0, rateMax: 0.028,       // how fast the smoke moves
    /* WHERE THE FIRE STARTS, AND WHY IT IS NOT ANYWHERE.

       Once corridors vent, the fire's floor decides how much of the building
       is permanently lost, and it decided too much: measured at fourteen runs
       a floor, a fire on 7 was worth 108 guests and a fire on 3 was worth 68.
       That is a 1.59x swing handed out by the seed before a button is pressed,
       against 1.77x for playing well - half your score was the draw.

       Low is the half to keep. A fire high in the building leaves a safe zone
       so large there is nothing left to triage, and the skill gap collapses
       with it: across 5-7 it is 1.17x and across 4-6 it is 1.23x, while 2-4
       holds 1.74x - the full range's gap, at a tenth of the luck. Most of the
       building is above the fire and in trouble, which is the situation the
       game is actually about. */
    fireLow: 2, fireHigh: 4,
  };

  let level = null;                    // the building this run is in
  const car = { y: 1, v: 0 };
  let smoke = null, carSmoke = 0;
  let waiting = [], aboard = [], fallen = [], out = 0, lost = 0, lostFloors = [], standsBy = {};
  let phase = 'play';                  // 'play' | 'serve' | 'level' | 'over'
  let serveT = 0, serveFloor = 1, doorOpen = 0, didWork = false, didClose = false;
  /* CALLS. Dragging a heavy car is a fine verb and a hard landing: players
     reported both, that it is difficult to steer and that it does not arrive
     level. A called floor is a promise the car keeps by itself - it leaves at
     full pull, brakes on a curve and arrives with nothing left, so it lands
     level every time. The drag is gone: a call is now the only control.
     The queue is served in the order the buttons were pressed, which is the
     only order a player can predict. */
  let calls = [];
  let settleT = 0, settleDir = 1, sag = 0;
  let levelFrom = 1, levelTo = 1, levelT = 0, levelDir = 1;
  let departed = false, stopsMade = 0, nextId = 0, nextSpawn = 0;
  let puffs = [], runners = [], tNow = 0, endT = 0, best = 0;
  let wave = 1, waveFlash = 0, fullT = 0, fullFlash = 0;
  /* THE MOMENTS, on the game clock so a still of a named moment is the same
     picture every time: the last guest out through the lobby doors, and the
     last strike. A guest counts as out when their run is this far through. */
  const SAVED_AT = 0.72, HINT_S = 14, END_HOLD = 1.1;
  let savedAt = -99, lostAt = -99;
  let rulesOpen = false, rulesScroll = 0;
  let rng = M.makeRng(1);

  function loadBest() {
    try { return (JSON.parse(localStorage.getItem(SAVE) || '{}').best | 0) || 0; } catch (e) { return 0; }
  }
  function putBest() { try { localStorage.setItem(SAVE, JSON.stringify({ best })); } catch (e) {} }

  const waveNow = () => 1 + Math.floor(tNow / RUN.waveS);
  const spawnEvery = () => {
    const w = waveNow() - 1;
    const fast = RUN.spawnFrom - w * RUN.spawnStep;
    if (fast > RUN.spawnKnee) return fast;
    const kneeAt = (RUN.spawnFrom - RUN.spawnKnee) / RUN.spawnStep;   // the wave it lands on
    return Math.max(RUN.spawnMin, RUN.spawnKnee - (w - kneeAt) * RUN.spawnCrawl);
  };
  const smokeRate = () => Math.min(RUN.rateMax, RUN.rateFrom + (waveNow() - 1) * RUN.rateStep);

  /* A RUN NEEDS A SEED THAT IS NOT THE CLOCK'S LOW BITS. It used to be
     Date.now() & 0xffff, which throws away everything above sixteen bits for
     no reason - makeRng takes a full 32 - and sixteen bits of a millisecond
     clock wrap every 65.5 seconds. Two runs started about a minute apart got
     the same building. Restarting is exactly the thing a player does over and
     over, and often at a fairly regular interval, so the collision was aimed
     squarely at the way the game is actually played. The seed is kept on the
     level so a run can be named when one behaves strangely. */
  function freshSeed() {
    try {
      const c = window.crypto;
      if (c && c.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0] || 1;
    } catch (e) {}
    return ((Math.random() * 4294967296) >>> 0) || 1;
  }

  function startRun(seedIn) {
    const seed = (seedIn >>> 0) || freshSeed();          // a test may name the building
    rng = M.makeRng(seed);
    const F = RUN.floors;
    const fHi = Math.min(RUN.fireHigh, F), fLo = Math.min(RUN.fireLow, fHi);
    level = { floors: F, seed, fire: fLo + Math.floor(rng() * (fHi - fLo + 1)) };
    car.y = 1; car.v = 0;
    smoke = new Float64Array(F + 1);
    carSmoke = 0;
    waiting = []; aboard = []; fallen = []; calls = [];
    out = 0; lost = 0; lostFloors = [];
    phase = 'play'; doorOpen = 0; serveT = 0; sag = 0; settleT = 0;
    departed = false; stopsMade = 0; nextId = 0;
    puffs = []; runners = []; tNow = 0; endT = 0; wave = 1; waveFlash = 0; fullT = 0; fullFlash = 0;
    savedAt = -99; lostAt = -99;
    best = loadBest();
    /* Doors keep clear of EVERY standing position, not just the occupied ones,
       because in a run people arrive where they like and a door cannot appear
       and disappear under them. */
    standsBy = {};
    for (let f = 2; f <= F; f++) {
      standsBy[f] = [0, 1, 2, 3].map(s => ({ stand: M.queueAt(s), right: false }));
    }
    for (let i = 0; i < RUN.startPeople; i++) spawnPerson();
    nextSpawn = spawnEvery();
    layout();
    TR().gameStart();
  }

  /* Somebody comes out of a room. They take a free standing slot, and by
     preference not one already lost to the smoke - emerging straight into a
     corridor you cannot see across is a death you could not have prevented. */
  /* PARTIES. Some of the people who come out of their rooms come out TOGETHER
     and will not be separated - a family, a couple - so they board as one or
     not at all.
     The reason this exists is measured, not decorative: with only singles the
     car's capacity never binds. Filling to four measured WORSE than leaving at
     three (20.8 against 24.4), because holding somebody in a smoky car costs
     them air, so there was never a reason to think about who fits. A party of
     three that cannot be split is the thing that makes four a number you have
     to plan around. */
  const PARTY = { chance: 0.38, three: 0.45 };   // how often, and how often a THREE
  let nextGid = 1;

  function spawnPerson() {
    const F = level.floors;
    const byFloor = {};
    for (let f = 2; f <= F; f++) {
      const used = new Set(waiting.filter(p => p.floor === f).map(p => p.slot));
      for (const p of fallen) if (p.floor === f) used.add(p.slot);
      const open = [], clear = [];
      for (let s = 0; s < T.capacity; s++) {
        if (used.has(s)) continue;
        open.push(s);
        if (smoke[f] < M.standAt(s) + 0.10) clear.push(s);
      }
      if (open.length) byFloor[f] = { open, clear };
    }
    const floors = Object.keys(byFloor).map(Number);
    if (!floors.length) return;

    /* A party needs room for all of it, so pick the size first and then a
       floor that can actually hold it - otherwise a three would silently
       become a one and the mechanic would quietly not exist. */
    let size = 1;
    if (rng() < PARTY.chance) size = rng() < PARTY.three ? 3 : 2;
    /* A party has to stand TOGETHER, so it needs slots NEXT TO each other -
       0,1,3 leaves a stranger in the middle of a family. So the floor is chosen
       by whether it has a long enough RUN of free slots, not by how many it has
       free in total; picking on the total and then failing on adjacency would
       quietly turn threes into ones without ever saying so.
       Within a run the window is random rather than the front. Slicing from the
       front put every single in slot 0, the place nearest the doors and the last
       the smoke reaches, which made the game about five rescues a run easier and
       had nothing to do with parties. */
    const runsOf = (slots) => {
      const out = []; let cur = [];
      for (const sl of slots) {
        if (cur.length && sl !== cur[cur.length - 1] + 1) { out.push(cur); cur = []; }
        cur.push(sl);
      }
      if (cur.length) out.push(cur);
      return out;
    };
    let pick = null;
    for (let want = size; want >= 1 && !pick; want--) {
      for (const src of ['clear', 'open']) {
        const cand = [];
        for (const f of floors)
          for (const run of runsOf(byFloor[f][src]))
            if (run.length >= want) cand.push({ f, run });
        if (!cand.length) continue;
        const c = cand[Math.floor(rng() * cand.length)];
        const start = Math.floor(rng() * (c.run.length - want + 1));
        pick = { f: c.f, slots: c.run.slice(start, start + want), size: want };
        break;
      }
    }
    if (!pick) return;
    /* A PARTY STANDS TOGETHER. Which side of the shaft somebody waits on used
       to be their slot's parity, which would have put a family of three two on
       one side and one on the other - a rule the player cannot see is not a
       rule they can play. Side is a property of the person now, and everyone
       in a party shares it. */
    const gid = pick.size > 1 ? nextGid++ : 0;
    const side = geo.rightW > 0 ? (rng() < 0.5 ? 1 : 0) : 0;
    for (const sl of pick.slots) {
      waiting.push({ id: nextId++, floor: pick.f, slot: sl, stand: M.standAt(sl),
                     goal: M.queueAt(sl), exp: 0, gid, gsize: pick.size, side });
    }
  }

  /* ---------- INPUT ----------
     THE CAR IS CALLED, NEVER STEERED. Dragging a heavy car was this game's
     original verb, and it is gone: players reported it as hard to control and
     as landing between floors, and a velocity-coupled drag is genuinely both.
     Pressing a floor is now the whole interface. keyDir survives as an
     internal for the headless harness at the bottom of this file; nothing a
     player can touch sets it. */
  let keyDir = 0;

  function toLocal(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (LW / r.width), y: (e.clientY - r.top) * (LH / r.height) };
  }
  /* A pill takes a little slop round its 40px height. A round or bare icon is
     already a full 44x44 target, and the phone's two bare switches sit edge to
     edge, so slop there would let one steal the other's press. */
  const hitCtrl = (x, y) => ctrl.find(c => {
    const sx = c.kind === 'pill' ? 6 : 0, sy = c.kind === 'pill' ? 8 : 0;
    return x >= c.x - sx && x <= c.x + c.w + sx && y >= c.y - sy && y <= c.y + c.h + sy;
  }) || null;

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (sfx) sfx.ensureAudio();
    const p = toLocal(e);
    if (rulesOpen) { onRulesPointer(p); return; }
    const c = hitCtrl(p.x, p.y);
    if (c) { onCtrl(c.id); return; }
    if (phase === 'over') { onEndPointer(p); return; }
    const cb = callButtons().find(q => Math.hypot(p.x - q.x, p.y - q.y) <= q.r + 10);
    if (cb) pressCall(cb.f);
  });

  /* A keyboard presses the BUTTONS; it does not drive the car. 1-9 call that
     floor, which is the same act as tapping it, so the game stays playable
     without a pointer now that the drag is gone. */
  window.addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '9') {
      const f = Number(e.key);
      if (f <= floors()) { pressCall(f); e.preventDefault(); }
    }
    else if (e.key === 'Escape' && rulesOpen) { rulesOpen = false; }
    else if (e.key === 'Enter' && endShown()) { advanceFromCard(); }
    else return;
    if (sfx) sfx.ensureAudio();
  });

  /* The buttons live in the shaft itself, one at each landing, on the back
     wall the car runs past. The car covers the one it is standing at, which is
     exactly right: you cannot call a lift that is already with you. */
  function callButtons() {
    const r = Math.max(8, Math.min(14, Math.min(geo.shaftW * 0.36, geo.floorPx * 0.19)));
    const out = [];
    for (let f = 1; f <= floors(); f++) {
      out.push({ f: f, x: geo.shaftX + geo.shaftW / 2, y: roomTop(f) + geo.floorPx * 0.42, r: r });
    }
    return out;
  }
  function pressCall(f) {
    if (phase !== 'play' && phase !== 'serve') return;
    if (calls.includes(f)) { calls = calls.filter(c => c !== f); return; }  // press again to cancel
    calls.push(f);
    if (snd) snd.bell();
    TR().track('call', { floor: f, queued: calls.length });
    if (phase === 'play' && Math.abs(car.y - f) < 0.02 && Math.abs(car.v) < 0.02) {
      car.y = f; startServe(f);
    }
  }
  /* EACH BUTTON IS A SMALL MOON in the dark shaft: a flat yellow disc with a
     spot on it, the floor printed on it, and its own rings of halo, so every
     button is always lit and always legible. CALLED is a different kind of
     light, not a brighter one: a ring burns round it and its halo breathes,
     the way a hall call does when it takes your press. */
  function drawCallButtons(now) {
    for (const b of callButtons()) {
      const lit = calls.indexOf(b.f) >= 0;
      const pulse = (lit && !REDUCED) ? 0.84 + 0.16 * Math.sin(now / 230 + b.f) : 1;
      halo(ctx, b.x, b.y, b.r * 0.8, GLOW, lit ? 1.9 * pulse : 0.8);
      disc(ctx, b.x, b.y, b.r * 0.92, MOON);
      ctx.save(); ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.92, 0, Math.PI * 2); ctx.clip();
      disc(ctx, b.x + b.r * 0.55, b.y + b.r * 0.5, b.r * 0.34, MOON_SPOT);
      ctx.restore();
      ctx.fillStyle = PUPIL;
      ctx.font = '800 ' + Math.max(9, Math.round(b.r * 1.1)) + 'px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(b.f), b.x, b.y + b.r * 0.07);
      if (lit) {
        ctx.strokeStyle = 'rgba(255,248,222,' + (0.95 * pulse).toFixed(3) + ')';
        ctx.lineWidth = Math.max(1.6, b.r * 0.2);
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.22, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  function onCtrl(id) {
    if (id === 'sound') { if (sfx) sfx.setOn(!sfx.isOn()); return; }
    if (id === 'alarm') { alarmOn = !alarmOn; try { localStorage.setItem(ALARM_KEY, alarmOn ? '1' : '0'); } catch (e) {} return; }
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
    for (const p of puffs) p.t += dt / 1.1;
    puffs = puffs.filter(p => p.t < 1);
    for (const r of runners) {
      const was = r.t; r.t += dt;
      if (r.kind === 'out' && was < r.dur * SAVED_AT && r.t >= r.dur * SAVED_AT) savedAt = tNow;
    }
    runners = runners.filter(r => r.t < r.dur);
    /* The last collapse still plays out after the run ends: the card waits
       for it (END_HOLD), and a person frozen mid-fall behind it was never
       seen only because the card used to arrive on the same frame. */
    if (phase === 'over') { endT += dt; for (const r of fallen) r.t += dt; return; }

    M.stepSmoke(smoke, level.floors, level.fire, smokeRate(), dt, FIRE);
    if (waveNow() !== wave) {
      wave = waveNow(); waveFlash = 1;
      if (snd) snd.waveUp();
      TR().track('wave', { wave, out, lost });
    }
    if (waveFlash > 0) waveFlash = Math.max(0, waveFlash - dt / 2.2);
    const wasFull = fullT > 0;
    fullT = aboard.length >= T.capacity ? Math.min(1, fullT + dt / 0.20) : 0;
    if (fullT > 0 && !wasFull) fullFlash = 1;                // it just filled: say so
    if (fullFlash > 0) fullFlash = Math.max(0, fullFlash - dt / 1.9);
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
    lost++; lostFloors.push(floor); lostAt = tNow;
    const q = personXY(p);
    fallen.push({ floor, slot: p.slot, stand: p.stand, x: q.x, side: q.face, seed: p.id + 1, gid: p.gid, t: 0 });
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
    if (keyDir) input = { mode: 'key', dir: keyDir };        // the harness only
    else if (calls.length) {
      /* Brake on a curve rather than bang-bang: v = sqrt(2 b d) is exactly the
         speed the car can still stop from, so it arrives with nothing left and
         onStopped puts it level. 0.92 keeps a margin for the frame it misses. */
      const d = calls[0] - car.y, ad = Math.abs(d);
      const v = Math.sign(d) * Math.min(T.vMax, Math.sqrt(2 * T.b * ad) * 0.92);
      input = { mode: 'drag', targetV: ad < 0.004 ? 0 : v };
    } else input = { mode: 'free' };

    const before = car.v;
    M.stepCar(car, dt, input, level.floors, T);
    if (Math.abs(car.v) > 0.02) departed = true;
    if (departed && !keyDir && Math.abs(car.v) < 1e-6) onStopped(before);
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
    calls = calls.filter(c => c !== f);                      // this one is answered
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
        /* THEY LEAVE ONE BEHIND THE OTHER. Four runners starting together on
           alternating sides read as one person: the eye cannot count a crowd
           that moves as a block, and the whole point of a full car is that you
           see four people saved. Same door, a fifth of a second apart, each
           stopping a little shorter than the one in front - and all six of a
           full car still inside the doors' width, where the old spacing, set
           for four, left the last two fading out in the middle of the lobby. */
        aboard.forEach((p, i) => {
          out++;
          runners.push({ floor: 1, kind: 'out', seed: p.id + 1, gid: p.gid, t: -0.22 * i, dur: 0.95,
            x0: geo.shaftX - 4,
            x1: geo.leftX + geo.corW * (0.12 + 0.03 * i) });
        });
        if (aboard.length && snd) snd.rescue(aboard.length);
        aboard = [];
      } else {
        const here = waiting.filter(p => p.floor === serveFloor).sort((a, b) => b.exp - a.exp);
        /* WHOLE PARTIES ONLY. Walk the floor in order of who is worst off and
           take what fits: a single needs one slot, a party needs all of its
           own. A party that will not fit is SKIPPED rather than ending the
           boarding, so a single behind it still gets on - which is exactly the
           decision the mechanic is for. */
        const take = [], seen = new Set();
        let room = T.capacity - aboard.length;
        for (const p of here) {
          if (seen.has(p.id)) continue;
          if (!p.gid) { if (room >= 1) { take.push(p); seen.add(p.id); room--; } continue; }
          const party = here.filter(q => q.gid === p.gid);
          if (party.length <= room) { for (const q of party) { take.push(q); seen.add(q.id); } room -= party.length; }
          else for (const q of party) seen.add(q.id);
          if (room <= 0) break;
        }
        /* NOBODY IS LEFT BEHIND FOR A SEAT THAT IS FREE. Whole parties are
           still preferred and still board together when they fit. But if
           skipping one leaves the car with room, the people on that floor take
           it one at a time, worst off first - which is what `here` is already
           sorted by. Driving away with an empty place while somebody is
           suffocating in front of the doors is not a mechanic, it is a bug,
           and it is what players hit at three aboard. */
        if (room > 0) {
          const taken = new Set(take.map(q => q.id));
          for (const q of here) {
            if (room <= 0) break;
            if (taken.has(q.id)) continue;
            take.push(q); taken.add(q.id); room--;
          }
        }
        if (take.length) {
          const ids = new Set(take.map(p => p.id));
          for (const p of take) {
            const q = personXY(p);
            runners.push({ floor: serveFloor, kind: 'in', seed: p.id + 1, gid: p.gid, t: 0, dur: T.boardS,
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
    drawBackdrop();
    if (!level) return;

    drawShell();
    drawCorridor(geo.leftX, geo.corW, 'left');
    if (geo.rightW > 0) drawCorridor(geo.rightX, geo.rightW, 'right');
    drawSpill();
    drawSmoke(now);                                          // behind everyone: it takes the room, not them
    drawFire(now);                                           // the flames over their own smoke
    drawFloorAlerts();
    drawPeople(now);
    drawShaft();
    drawCallButtons(now);                                    // on the shaft wall, behind the car
    drawCar(now);
    drawPuffs();
    drawHud();
    if (phase === 'over') drawEndCard();
    if (rulesOpen) drawRulesCard(now);
  }

  /* Every size in the art is set at a 61-unit floor (the desktop frame's) and
     scaled by this, so a phone, the site frame and a full screen all get the
     same drawing at their own size. */
  const U = () => geo.floorPx / 61;
  function disc(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2); c.fill(); }
  function fillRR(c, x, y, w, h, r, col) { c.fillStyle = col; UI.roundRectPath(c, x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); c.fill(); }
  // light as a flat disc's rings: three circles of fading alpha, no gradient
  function halo(c, x, y, r, rgb, a) {
    for (const [k, al] of [[2.6, 0.06], [1.9, 0.10], [1.4, 0.16]]) {
      c.fillStyle = 'rgba(' + rgb + ',' + Math.min(1, al * (a || 1)).toFixed(3) + ')';
      c.beginPath(); c.arc(x, y, r * k, 0, Math.PI * 2); c.fill();
    }
  }
  // doors: small round corners on top, square at the foot (owner)
  function topRR(c, x, y, w, h, r, col) {
    r = Math.min(r, w / 2, h);
    c.fillStyle = col; c.beginPath();
    c.moveTo(x, y + h); c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r);
    c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r); c.lineTo(x + w, y + h);
    c.closePath(); c.fill();
  }

  /* THE NIGHT OUTSIDE: the sky runs from the chrome's navy in the bands to a
     deep teal behind the hotel, with tall dark shapes, drifting bars of mist
     and a moon in whatever margin the frame leaves. A phone has no margin,
     and gets the sky alone. */
  function drawBackdrop() {
    const g = ctx.createLinearGradient(0, 0, 0, LH);
    g.addColorStop(0, GROUND);
    g.addColorStop(Math.min(0.45, topBand() / LH + 0.04), NIGHT);
    g.addColorStop(Math.max(0.55, 1 - botBand() / LH - 0.04), NIGHT);
    g.addColorStop(1, GROUND);
    ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
    if (!level) return;
    const u = U(), mL = geo.x - 7 * u, mR = LW - (geo.x + geo.w + 7 * u);
    for (const [m, x0, side] of [[mL, 0, -1], [mR, LW - mR, 1]]) {
      if (m < 18) continue;
      ctx.fillStyle = NIGHT_HI; ctx.fillRect(x0 + m * 0.18, geo.y - 10, m * 0.5, geo.h + 10);
      for (const [fy, fw] of [[0.12, 1.5], [0.62, 1.3]]) fillRR(ctx, side < 0 ? x0 - 20 : x0 + m * 0.2, geo.y + geo.h * (fy + (side > 0 ? 0.14 : 0)), m * fw, 14, 7, MIST);
      for (const [fx, fy, r] of [[0.7, 0.45, 1.4], [0.3, 0.62, 1], [0.8, 0.8, 1.1]]) disc(ctx, x0 + m * fx, geo.y + geo.h * fy, r, 'rgba(255,255,255,0.8)');
    }
    if (mL >= 18) {
      const r = Math.min(17, mL * 0.38), x = mL * 0.55, y = geo.y + 34;
      halo(ctx, x, y, r, GLOW, 1);
      disc(ctx, x, y, r, MOON);
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
      for (const [dx, dy, rr2] of [[-0.35, -0.2, 0.26], [0.3, 0.25, 0.2], [0.05, 0.5, 0.14], [0.45, -0.35, 0.12]]) disc(ctx, x + dx * r, y + dy * r, rr2 * r, MOON_SPOT);
      ctx.restore();
    }
  }

  // the building: a dark teal shell with a lit parapet, the roof inside ROOF
  function drawShell() {
    const u = U();
    fillRR(ctx, geo.x - 7 * u, geo.y - ROOF, geo.w + 14 * u, geo.h + ROOF + 4 * u, 10 * u, SHELL);
    fillRR(ctx, geo.x - 7 * u, geo.y - ROOF, geo.w + 14 * u, 5 * u, 2.5 * u, SHELL_HI);
  }

  /* THE CORRIDOR IS BAKED. Its walls, lamps, doors, pictures, planters and
     floor never change during a run, so each corridor is drawn once into its
     own canvas and blitted: the whole static hotel costs one drawImage a
     floor. Rebuilt when the layout changes. */
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
    // mirror the right-hand corridor so both run "outward from the elevator"
    if (right) { b.translate(w, 0); b.scale(-1, 1); }
    paintRoom(b, w, h, f, right);
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

  /* A corridor's bands, and the lobby's exit doors, in the corridor's own
     terms: x runs from the far wall (the stairwell) to the elevator. The
     baked art and the light that answers a rescue both use these. */
  function roomBands(h) {
    const u = h / 61;
    return { u, wallTop: 8 * u, floorTop: h - 8 * u };
  }
  function exitDoor(w, h) {
    const B = roomBands(h), u = B.u;
    const gw = Math.min(52 * u, w * 0.2), gh = B.floorTop - B.wallTop - 2 * u;
    return { x: 8 * u, y: B.floorTop - gh, w: gw, h: gh };
  }

  function paintRoom(b, w, h, f, right) {
    const B = roomBands(h), u = B.u, ft = B.floorTop;
    b.fillStyle = SHELL; b.fillRect(0, 0, w, 4 * u);
    b.fillStyle = CEIL; b.fillRect(0, 4 * u, w, 4 * u);
    b.fillStyle = WALL; b.fillRect(0, B.wallTop, w, ft - B.wallTop);
    b.fillStyle = WALL_LO; b.fillRect(0, ft - 12 * u, w, 12 * u);
    b.fillStyle = RAIL; b.fillRect(0, ft - 13 * u, w, 1.5 * u);
    // lamps: a flat disc under the ceiling in its own rings of light
    const n = Math.max(2, Math.round(w / (90 * u)));
    for (let i = 0; i < n; i++) {
      const lx = w * (i + 0.5) / n, ly = B.wallTop + 7 * u;
      halo(b, lx, ly, 7 * u, LAMP_GLOW, 2.2);
      disc(b, lx, ly, 4 * u, '#FFE58A');
      disc(b, lx - 1.2 * u, ly - 1.2 * u, 1.5 * u, '#FFF8DC');
    }
    if (f === 1) paintLobby(b, w, h, B);
    else {
      /* THREE DOORS a head taller than the people, square at the foot, each
         with its number over it (owner: the old ones were people-sized). */
      [0.09, 0.36, 0.63].forEach((k, i) => {
        const dw = 21 * u, dh = 41 * u, dx = w * k;
        topRR(b, dx - 2 * u, ft - dh - 2 * u, dw + 4 * u, dh + 2 * u, 4 * u, DOOR_FRAME);
        topRR(b, dx, ft - dh, dw, dh, 3 * u, DOOR);
        b.fillStyle = DOOR_HI;
        b.fillRect(dx + 3.5 * u, ft - dh + 4 * u, dw - 7 * u, 14 * u);
        b.fillRect(dx + 3.5 * u, ft - dh + 21 * u, dw - 7 * u, 15 * u);
        disc(b, dx + dw - 4 * u, ft - dh * 0.46, 1.7 * u, MOON);
        b.fillStyle = DOOR_FRAME; b.fillRect(dx + dw / 2 - 5 * u, ft - dh - 8 * u, 10 * u, 4.5 * u);
        drawUnflipped(b, String(f * 100 + (right ? 4 : 1) + i), dx + dw / 2, ft - dh - 5.6 * u,
          '800 ' + (3.6 * u).toFixed(2) + 'px Inter, sans-serif', MOON);
      });
      for (const k of [0.255, 0.525]) painting(b, w * k, B.wallTop + 9 * u, u);
      planter(b, w * 0.88, ft, u * 0.95);
    }
    // the floor: honey-wood planks with a lit edge and a dark lip
    b.fillStyle = FLOOR; b.fillRect(0, ft, w, 4.5 * u);
    b.fillStyle = FLOOR_LINE; b.fillRect(0, ft, w, 1.3 * u);
    b.fillStyle = FLOOR_LIP; b.fillRect(0, ft + 4.5 * u, w, h - ft - 4.5 * u);
    for (let x = (7 + (f % 2) * 8) * u; x < w; x += 16 * u) b.fillRect(x, ft + 1.3 * u, u, 3.2 * u);
  }

  /* THE LOBBY. Tall glazed doors out to the night, square at the foot, with
     the OUT sign on the wall beside them pointing at them (owner); the front
     desk with its lamp and the receptionist behind it; brick planters and a
     picture. */
  function paintLobby(b, w, h, B) {
    const u = B.u, ft = B.floorTop, d = exitDoor(w, h);
    halo(b, d.x + d.w / 2, d.y + d.h / 2, d.h * 0.40, EXIT_RGB, 1.1);
    topRR(b, d.x - 2.5 * u, d.y - 2.5 * u, d.w + 5 * u, d.h + 2.5 * u, 3 * u, SHELL);
    topRR(b, d.x, d.y, d.w, d.h, 2 * u, EXIT);
    b.fillStyle = SHELL; b.fillRect(d.x + d.w / 2 - 1.2 * u, d.y, 2.4 * u, d.h);
    b.fillStyle = 'rgba(255,255,255,0.38)';
    b.fillRect(d.x + 6 * u, d.y + 5 * u, 3.5 * u, d.h - 10 * u);
    b.fillRect(d.x + d.w / 2 + 5 * u, d.y + 5 * u, 3.5 * u, d.h - 10 * u);
    b.fillStyle = SHELL;
    b.fillRect(d.x + d.w / 2 - 7 * u, d.y + d.h * 0.48, 4 * u, 1.8 * u);
    b.fillRect(d.x + d.w / 2 + 3 * u, d.y + d.h * 0.48, 4 * u, 1.8 * u);
    // the sign, beside the doors, its arrow pointing back at them
    const sw = 30 * u, sh = 12 * u, sx = d.x + d.w + 7 * u, sy = d.y + 3 * u;
    b.fillStyle = SHELL; b.fillRect(sx, sy, sw, sh);
    b.fillStyle = EXIT;
    b.beginPath(); b.moveTo(sx + 4 * u, sy + sh / 2); b.lineTo(sx + 9 * u, sy + sh / 2 - 3.5 * u); b.lineTo(sx + 9 * u, sy + sh / 2 + 3.5 * u); b.closePath(); b.fill();
    drawUnflipped(b, 'OUT', sx + sw / 2 + 3 * u, sy + sh / 2 + 0.4 * u, '800 ' + (7 * u).toFixed(2) + 'px Inter, sans-serif', EXIT);
    /* The rest lays itself out from the sign outward, because a phone's lobby
       is a third narrower than the desktop's: the desk keeps clear of the
       sign, a planter stands between them only where it fits, and the far
       planter moves along or stays away rather than sit on the desk. */
    const signEnd = sx + sw, dx = Math.max(w * 0.46, signEnd + 25 * u), dw = 62 * u;
    // the receptionist first, then the desk in front of them
    figure(b, dx + 20 * u, ft - 9 * u, 1, RECEPTION, {});     // on the raised step behind the desk: face and shoulders show
    b.fillStyle = DOOR; b.fillRect(dx, ft - 17 * u, dw, 17 * u);
    b.fillStyle = DOOR_HI; b.fillRect(dx - 2 * u, ft - 20 * u, dw + 4 * u, 4 * u);
    b.fillStyle = DOOR_FRAME; b.fillRect(dx + 5 * u, ft - 12 * u, dw - 10 * u, 2 * u);
    halo(b, dx + 50 * u, ft - 27 * u, 4 * u, GLOW, 1.4);
    disc(b, dx + 50 * u, ft - 27 * u, 3 * u, '#FFE58A');
    b.fillStyle = DOOR_FRAME; b.fillRect(dx + 49.4 * u, ft - 24 * u, 1.2 * u, 4 * u);
    if (dx - signEnd >= 22 * u) planter(b, (signEnd + dx) / 2, ft, u * 1.05);
    const far = Math.max(w * 0.88, dx + dw + 14 * u), hasFar = far <= w - 9 * u;
    const pic = Math.max(w * 0.76, dx + dw + 12 * u);
    if (!hasFar || Math.abs(pic - far) > 20 * u) painting(b, pic, B.wallTop + 9 * u, u);
    if (hasFar) planter(b, far, ft, u * 0.9);
  }
  const RECEPTION = { outfit: '#8E2F3C', skin: '#C98363', hair: '#2D1B12', size: 1, bun: true, badge: true };

  // a plant in a brick planter, standing on the floor at (x, ft)
  function planter(b, x, ft, s) {
    for (const [ox, oy, r] of [[0, -25, 7], [-6, -20, 5.5], [6, -19, 5.5], [-2, -30, 4.5]]) disc(b, x + ox * s, ft + oy * s, r * s, LEAF);
    for (const [ox, oy, r] of [[-2, -27, 3], [4, -22, 2.4]]) disc(b, x + ox * s, ft + oy * s, r * s, LEAF_LT);
    b.fillStyle = BRICK; b.fillRect(x - 7 * s, ft - 12 * s, 14 * s, 12 * s);
    b.fillStyle = BRICK_LT; b.fillRect(x - 8 * s, ft - 13 * s, 16 * s, 3 * s);
    b.fillStyle = BRICK_DK; b.fillRect(x - 7 * s, ft - 7 * s, 14 * s, 1.2 * s); b.fillRect(x - 7 * s, ft - 3.5 * s, 14 * s, 1.2 * s);
  }
  // a small painting of the night and its moon, in a walnut frame
  function painting(b, cx, y, u) {
    b.fillStyle = DOOR; b.fillRect(cx - 9 * u, y, 18 * u, 13 * u);
    b.fillStyle = '#2A6273'; b.fillRect(cx - 7 * u, y + 2 * u, 14 * u, 9 * u);
    disc(b, cx + 2.5 * u, y + 5.5 * u, 2.3 * u, MOON);
    b.fillStyle = '#1F4A57'; b.fillRect(cx - 7 * u, y + 9 * u, 14 * u, 2 * u);
  }

  /* Where a person stands, in a corridor's own coordinates with the elevator at
     the right-hand end. The baked art and the live figures have to agree, so
     both go through this. */
  const personXInCorridor = (stand, w) => {
    const m = geo.floorPx * 0.14;
    return m + (w - m * 2) * stand;
  };

  function drawCorridor(x, w, side) {
    if (w <= 0) return;
    if (bakeKey !== corridorKey()) bakeCorridors();
    const F = floors();
    for (let f = 1; f <= F; f++) {
      const img = baked[(side === 'left' ? 'L' : 'R') + f];
      if (img) ctx.drawImage(img, x, roomTop(f), w, geo.floorPx);
    }
  }
  // both corridors, each described from its far (stairwell) wall
  function corridors() {
    const out = [{ x: geo.leftX, w: geo.corW, farX: geo.leftX, dir: 1 }];
    if (geo.rightW > 0) out.push({ x: geo.rightX, w: geo.rightW, farX: geo.rightX + geo.rightW, dir: -1 });
    return out;
  }

  /* Smoke banks against the ceiling and the layer comes DOWN, so the cloud
     fills that band rather than the whole floor. It is also a second thing the
     player can read without being told. */
  const layerFrac = (front) => 0.20 + 0.80 * Math.min(1, front * 1.7);

  /* SMOKE AS SOAP BUBBLES (owner). Clusters of flat circles, a few big and
     many small, banked against the ceiling: big and crowded at the stairwell
     end where the smoke comes from, thinning and shrinking to the leading
     edge, so the corridor shows between them and which way the smoke is
     travelling reads at a glance. Each bubble drifts a little on its own
     phase; reduced motion holds them still. They are drawn solid into a
     layer of their own and laid down see-through. */
  let smokeCv = null, smokeCx = null;
  function drawSmoke(now) {
    if (!smoke || !level) return;
    if (!smokeCv || smokeCv.width !== canvas.width || smokeCv.height !== canvas.height) {
      smokeCv = document.createElement('canvas');
      smokeCv.width = canvas.width; smokeCv.height = canvas.height;
      smokeCx = smokeCv.getContext('2d');
    }
    const sc = smokeCx, u = U(), t = REDUCED ? 0 : now / 1000;
    sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, smokeCv.width, smokeCv.height);
    sc.setTransform(ctx.getTransform());
    let any = false;
    for (let f = 1; f <= floors(); f++) {
      const front = smoke[f];
      if (front < 0.005) continue;
      const top = roomTop(f) + 8 * u, floorTop = slabY(f) - 8 * u;
      const depth = Math.min(floorTop, roomTop(f) + geo.floorPx * layerFrac(front)) - top;
      for (const s of corridors()) {
        sc.save(); sc.beginPath(); sc.rect(s.x, top, s.w, floorTop - top); sc.clip();
        bubbles(sc, s, f, s.w * front, top, floorTop, depth, f === level.fire, u, t);
        sc.restore();
        any = true;
      }
    }
    if (!any) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = SMOKE_ALPHA;
    ctx.drawImage(smokeCv, 0, 0);
    ctx.restore();
  }
  function bubbles(c, s, f, reach, top, floorTop, depth, warm, u, t) {
    const seed = f * 97 + (s.dir > 0 ? 0 : 41);
    const nC = Math.max(2, Math.round(reach / (17 * u)));
    const pal = warm ? SMOKE_WARM_T : SMOKE_T;
    const list = [];
    for (let i = 0; i < nC; i++) {
      const q = (k) => hash01(seed + i * 7.31 + k * 1.93);
      const along = Math.min(1, (i + 0.25 + 0.5 * q(0)) / nC);    // 0 at the far wall, 1 at the front
      const dens = Math.pow(1 - along, 0.75);
      const cx = s.farX + s.dir * reach * along;
      const cy = top + depth * (0.16 + 0.42 * q(1)) * (0.45 + 0.55 * dens);
      const n = 2 + Math.round(7 * dens + 1.5 * q(2));
      for (let k = 0; k < n; k++) {
        const a = q(10 + k), b2 = q(20 + k), c2 = q(30 + k);
        let r = Math.max(3.2 * u, (2.8 + 10 * Math.pow(a, 2.1)) * u * (0.5 + 0.5 * dens));
        if (k === 0) r += 5 * u * dens;                             // each cluster has one big one
        const dx = t ? Math.sin(t * 0.35 + a * 6.283) * 1.6 * u : 0;
        const dy = t ? Math.sin(t * 0.27 + b2 * 6.283) * 1.2 * u : 0;
        const x = cx + (b2 - 0.5) * (12 + 18 * dens) * u + dx;
        const y = Math.max(top + r * 0.35, Math.min(floorTop - r * 0.7, cy + (c2 - 0.5) * (8 + 16 * dens) * u - r * 0.15 + dy));
        list.push({ x, y, r, tone: r > 8 * u ? (a > 0.5 ? 0 : 1) : r > 4.5 * u ? (b2 > 0.4 ? 1 : 2) : 2 });
      }
    }
    list.sort((p, q2) => q2.r - p.r);                                // big ones behind the small
    for (const p of list) {
      disc(c, p.x, p.y, p.r, pal[p.tone]);
      if (p.r > 6.5 * u) disc(c, p.x - p.r * 0.38, p.y - p.r * 0.38, p.r * 0.2, 'rgba(255,255,255,0.30)');
    }
  }

  /* THE NUMERALS ARE GONE. They were carrying two jobs and only one of them
     was real: nobody drives this car by floor NUMBER - you drag it to a
     corridor you can see - so the numeral told the player nothing they were
     not already looking at.
     The job that WAS real stays. Somebody about to go is no use if it can only
     be found by scanning eight corridors, so the floor in trouble announces
     itself: its floor lights and pulses red, drawn flat like the rest. That
     is emergency lighting rather than a label, it needs no ground of its own
     to be legible on, and it points at the floor instead of sitting beside it. */
  function drawFloorAlerts() {
    const F = floors();
    for (let f = 1; f <= F; f++) {
      let crit = 0, flash = 0;
      for (const p of waiting) if (p.floor === f && p.exp > FIRE.warnAt) crit = Math.max(crit, p.exp);
      /* A STRIKE FLASHES ITS FLOOR. The floor lights once, hard, where
         somebody has just gone down, so the dot landing in the read-out has
         a place in the building to point at. */
      for (const r of fallen) if (r.floor === f && r.t < 1) flash = Math.max(flash, 1 - r.t);
      if (!crit && !flash) continue;
      /* The pulse has a FLOOR. 0.55 + 0.45*sin swings down to 0.10, so the
         alert all but vanished twice a second - a warning you can miss by
         blinking is not a warning. It breathes between 0.62 and 1.0 now, and
         the band is thick enough to survive a small screen. */
      const pulse = Math.max(flash, !crit ? 0 : REDUCED ? 1 : 0.81 + 0.19 * Math.sin(performance.now() / 190));
      const u = U(), y = slabY(f) - 8 * u, hgt = Math.max(3, 4.5 * u);
      const glowH = hgt * (2.6 + 3.4 * flash);
      for (const s of corridors()) {
        ctx.fillStyle = 'rgba(255,80,60,' + (0.22 * pulse).toFixed(3) + ')';
        ctx.fillRect(s.x, y - glowH, s.w, glowH);
        ctx.fillStyle = 'rgba(255,' + Math.round(120 + 80 * pulse) + ',96,' + (0.92 * pulse).toFixed(3) + ')';
        ctx.fillRect(s.x, y, s.w, hgt);
      }
    }
  }

  /* THE FIRE: flat tongues in red, orange and yellow at the stairwell end of
     its floor, inside their own rings of hot light, with embers rising. It is
     drawn over its own smoke so it stays the brightest thing in the building,
     and it flickers; reduced motion holds it still. */
  function drawFire(now) {
    const f = level.fire, T = roomTop(f), B = slabY(f), u = U();
    const t = REDUCED ? 0 : now / 1000;
    for (const s of corridors()) {
      ctx.save(); ctx.beginPath(); ctx.rect(s.x, T + 8 * u, s.w, B - T - 8 * u); ctx.clip();
      const x = s.farX + s.dir * 6 * u, fl = (k) => REDUCED ? 1 : 0.9 + 0.1 * Math.sin(t * (6.1 + k) + k * 2.3);
      halo(ctx, x, B - 22 * u, 16 * u * fl(0), '255,120,50', 1.6);
      const flame = (dx, hh, wv, col) => {
        const xx = x + s.dir * dx, yb = B - 8 * u;
        ctx.fillStyle = col; ctx.beginPath();
        ctx.moveTo(xx - wv, yb);
        ctx.quadraticCurveTo(xx - wv, yb - hh * 0.6, xx, yb - hh);
        ctx.quadraticCurveTo(xx + wv, yb - hh * 0.6, xx + wv, yb);
        ctx.closePath(); ctx.fill();
      };
      flame(4 * u, 38 * u * fl(1), 12 * u, '#E8505B'); flame(18 * u, 28 * u * fl(2), 9 * u, '#E8505B');
      flame(5 * u, 28 * u * fl(3), 8 * u, '#FF8A3D'); flame(18 * u, 19 * u * fl(4), 6 * u, '#FF8A3D');
      flame(5 * u, 16 * u * fl(5), 4.5 * u, '#FFD166');
      for (let k = 0; k < 3; k++) {
        const rise = t ? ((t * 14 + k * 11) % 28) : k * 9;
        disc(ctx, x + s.dir * (12 + k * 11) * u, B - (24 + rise) * u, (1.6 - k * 0.2) * u,
          'rgba(255,209,102,' + (1 - rise / 28).toFixed(3) + ')');
      }
      ctx.restore();
    }
  }

  /* `stand` is 1 at the elevator doors and 0 at the far wall. The desktop frame
     lays the queue across both corridors, so odd slots are mirrored into the
     right-hand one at the same depth - same clock, different side. Both this
     and the baked doors go through personXInCorridor, so the art and the
     people always agree about where somebody is. */
  function personXY(p) {
    const base = slabY(p.floor) - 3 - geo.floorPx * 0.055;   // they stand on the runner
    const onRight = geo.rightW > 0 && p.side === 1;
    if (onRight) return { x: geo.rightX + geo.rightW - personXInCorridor(p.stand, geo.rightW), y: base, face: -1 };
    return { x: geo.leftX + personXInCorridor(p.stand, geo.corW), y: base, face: 1 };
  }

  function drawPeople(now) {
    const h = geo.floorPx * 0.52;
    const tt = now / 1000;
    for (const r of fallen) drawFallen(r);
    /* A PARTY IS ONE PATCH OF FLOOR. The held hands were drawn as a line
       between two figures and at 32px that is a string tied round them, not an
       arm. They already wear the same clothes; what they gain here is a single
       pooled shadow instead of one each, which is what standing together
       actually looks like and reads at any size. Drawn before the people so
       their own contact shadows sink into it. */
    {
      const g = new Map();
      for (const p of waiting) {
        if (!p.gid) continue;
        const q = personXY(p);
        const l = g.get(p.gid) || []; l.push({ x: q.x, y: q.y }); g.set(p.gid, l);
      }
      ctx.fillStyle = 'rgba(60,30,10,0.20)';
      for (const l of g.values()) {
        if (l.length < 2) continue;
        l.sort((a, b) => a.x - b.x);
        const a = l[0], b = l[l.length - 1];
        if (b.x - a.x > h * 2.6) continue;                // too spread to be together
        const pad = h * 0.17;
        ctx.beginPath();
        ctx.ellipse((a.x + b.x) / 2, a.y + 1, (b.x - a.x) / 2 + pad, h * 0.040, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const p of waiting) {
      const q = personXY(p);
      /* WALKING, then STILL. There is no idle animation any more, and that is
         deliberate: three attempts to make waiting "look urgent" all read as a
         figure vibrating on the spot, because at 32 pixels ANY repeating motion
         does. A half-step shuffle, a glance that mirrors the whole body, a
         sub-pixel breath - each looked reasonable written down and each was the
         same artefact on screen.
         So a figure that is not walking does not move. The urgency lives where
         it belongs now: in the walk down the corridor, and in the cough. */
      const walking = p.stand < p.goal - 0.004;
      /* THE LEGS ARE DRIVEN BY THE GROUND THEY COVER - and by nothing else.
         The last version gated the walk pose on a per-frame SPEED test, and
         that test was the vibration rather than the cure: any small movement
         is a sine, its speed passes through zero at both ends, so the legs
         snapped between the walking pose and the standing pose twice per step,
         forever. Worse, the measurement that said it was fixed - "25% of
         frames moving" - was that strobe, being read as success.
         There is nothing to infer. We KNOW who is walking: walking is p.stand
         still short of p.goal. The phase advances by MODEL distance only, so
         nothing a drawing does can touch it, and a figure at the doors is
         simply standing. */
      const stride = h * 0.42;
      if (p.px == null) { p.px = q.x; p.gp = 0; }
      if (walking) p.gp = (p.gp + Math.abs(q.x - p.px) / stride) % 1;
      p.px = q.x;
      const gait = (walking && !REDUCED) ? p.gp : -1;

      /* A COUGH is the warning that somebody is about to go. It is a jolt you
         can see from across the building, it fires on its own rhythm per
         person so a corridor in trouble sounds and looks like one, and it
         arrives well before they are lost. */
      let cough = 0;
      if (p.exp > FIRE.warnAt) {
        /* IN BOUTS, NOT ON A METRONOME. This fired a three-pixel lurch every
           second for as long as somebody was in trouble - and these are exactly
           the people too far gone to sway, so the cough was the ONLY motion
           they had. A figure standing perfectly still and twitching once a
           second is the thing that reads as stuck and vibrating. Two coughs
           together and then four or five seconds of nothing is both what a
           person does and something you can watch.
           Reduced motion drops the JOLT, never the warning: somebody who asked
           for less movement still needs to hear which corridor is in trouble. */
        const cyc = 4.2 + 2.0 * hash01(p.id * 4.3), off = hash01(p.id * 8.1);
        const c = (tt / cyc + off) % 1, w = 0.055;
        if (!REDUCED) {
          const b1 = c < w ? Math.sin((c / w) * Math.PI) : 0;
          const b2 = (c > w * 1.8 && c < w * 2.8) ? Math.sin(((c - w * 1.8) / w) * Math.PI) : 0;
          cough = Math.max(b1, b2);
        }
        const bout = Math.floor(tt / cyc + off);
        if (c < 0.012 && p.coughAt !== bout) { p.coughAt = bout; if (snd) snd.cough(p.id); }
      }
      p.cg = cough; p.gt = gait;                              // what was DRAWN, for the sweep
      const duck = Math.max(0, Math.min(1, (p.exp - 0.3) / 0.5));
      const m = figure(ctx, q.x, q.y, q.face, lookOf(p.id, p.gid), { gait, cough, duck });
      drawOxygen(m.hx, m.headTop, m.h, p.exp);
      /* WHERE IT ACTUALLY DREW. A contrast sweep that guesses these from the
         nominal height samples empty air, because a figure shrinks as they duck
         and every person has their own height. Three separate false readings
         came out of guessing before this existed. */
      p.mark = { x: q.x, side: q.face, h: m.h, headY: m.hy, bodyY: m.bodyY, armY: m.armY };
    }
    drawRunners(now);
  }

  /* They RUN for the doors when the car lands, and out of the lobby when it
     gets them there. The model has already moved them; this is the second of
     boarding time drawn rather than skipped. */
  function drawRunners(now) {
    void now;
    const h = geo.floorPx * 0.52;
    /* THE DOORS ANSWER A RESCUE. Each guest going out lights the glazed doors
       from the street side, a flare that peaks as they pass through, so a car
       emptying at the lobby is counted out in light as well as in the
       read-out. */
    let flare = 0;
    for (const r of runners) {
      if (r.kind !== 'out' || r.t < 0) continue;
      const k = (r.t / r.dur - 0.60) / 0.28;
      if (k > 0 && k < 1) flare = Math.max(flare, Math.sin(Math.PI * k));
    }
    if (flare > 0.01) {
      const d = exitDoor(geo.corW, geo.floorPx), gx = geo.leftX + d.x, gy = roomTop(1) + d.y;
      ctx.save();
      ctx.beginPath(); ctx.rect(gx, gy, d.w, d.h); ctx.clip();
      ctx.fillStyle = 'rgba(214,255,246,' + (0.55 * flare).toFixed(3) + ')';
      ctx.fillRect(gx, gy, d.w, d.h);
      ctx.restore();
      halo(ctx, gx + d.w / 2, gy + d.h * 0.62, d.h * 0.5, EXIT_RGB, 1.6 * flare);
    }
    for (const r of runners) {
      if (r.t < 0) continue;                                 // still waiting their turn
      const k = Math.min(1, r.t / r.dur);
      const x = r.x0 + (r.x1 - r.x0) * (r.kind === 'out' ? ease(k) : k);
      const dir = r.x1 >= r.x0 ? 1 : -1;
      /* Same rule as the people waiting: the ground drives the legs. A fixed
         3.4 Hz over a dash this quick wants a stride four times the one this
         figure has, which is skating rather than running. */
      const stride = h * 0.42;
      if (r.px == null) { r.px = x; r.gp = 0; }
      r.gp = (r.gp + Math.abs(x - r.px) / stride) % 1;
      r.px = x;
      ctx.globalAlpha = r.kind === 'out' ? 1 - Math.max(0, (k - 0.65) / 0.35) : 1;
      figure(ctx, x, slabY(r.floor) - 3 - geo.floorPx * 0.055, dir, lookOf(r.seed - 1, r.gid || 0), { gait: REDUCED ? -1 : r.gp });
      ctx.globalAlpha = 1;
    }
  }

  const hash01 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  /* A PARTY SHARES ITS CLOTHES but not its build: same colour, their own
     hair, skin and height, because a family is not three copies of one
     person. */
  function lookOf(id, gid) {
    const k = gid ? gid * 13.7 : id * 5.3;
    return {
      outfit: OUTFITS[Math.floor(hash01(k) * OUTFITS.length)],
      skin: SKINS[Math.floor(hash01(id * 2.9 + 1) * SKINS.length)],
      hair: HAIRS[Math.floor(hash01(id * 7.1 + 3) * HAIRS.length)],
      size: 0.94 + 0.12 * hash01(id * 3.7 + 2),
    };
  }

  /* THE PEOPLE ARE DRAWN, NOT PAINTED (owner, 2026-09-25: a realistic person
     "is always going to look a little off"). A big round head with the hair
     massed behind it, a big nose and one round eye facing where they are
     going, a rounded body in their own colour and short dark legs. No
     outline anywhere.
     Posture still carries the exposure, because colour never should alone:
     deep in the smoke they duck, and a hand comes up to the mouth. A cough
     jolts the whole figure; the walk swings the legs. */
  function figure(c, x, baseY, face, lk, o) {
    const u = U() * (lk.size || 1);
    const duck = o.duck || 0, cough = o.cough || 0, gait = o.gait == null ? -1 : o.gait;
    const r = 9.5 * u, legH = 6 * u, bodyH = 10 * u * (1 - duck * 0.15), bodyW = 13 * u;
    const bodyTop = baseY - legH - bodyH + duck * 1.5 * u - cough * 1.6 * u;
    const sw = gait >= 0 ? Math.sin(gait * Math.PI * 2) * 3 * u : 0;
    c.fillStyle = 'rgba(60,30,10,0.18)';
    c.beginPath(); c.ellipse(x, baseY + u, 8 * u, 1.8 * u, 0, 0, Math.PI * 2); c.fill();
    for (const [dx, s] of [[-2.8 * u, sw], [2.8 * u, -sw]]) fillRR(c, x + dx - 2.2 * u + s * 0.5, baseY - legH - u, 4.4 * u, legH + u, 2.2 * u, lk.legs || LEGS);
    fillRR(c, x - bodyW / 2, bodyTop, bodyW, bodyH + u, 5 * u, lk.outfit);
    if (lk.badge) disc(c, x + face * 3 * u, bodyTop + 3.5 * u, 1.4 * u, MOON);
    const hy = bodyTop - r * 0.7 + duck * 2 * u;
    disc(c, x - face * 2.2 * u, hy - 1.5 * u, r * 1.02, lk.hair);
    if (lk.bun) disc(c, x - face * 8.8 * u, hy - 5.5 * u, 3.8 * u, lk.hair);
    disc(c, x + face * 1.6 * u, hy + 1.2 * u, r * 0.82, lk.skin);
    disc(c, x + face * 8.2 * u, hy + 2.8 * u, 3.1 * u, lk.nose || NOSE);
    disc(c, x + face * 4.6 * u, hy - 0.6 * u, 2.5 * u, lk.eye || '#FFFFFF');
    if (lk.shut) { c.fillStyle = PUPIL; c.fillRect(x + face * 4.6 * u - 2 * u, hy - 0.8 * u, 4 * u, 1.1 * u); }
    else disc(c, x + face * 5.3 * u, hy - 0.4 * u, 1.2 * u, PUPIL);
    if (duck > 0.3) disc(c, x + face * 7 * u, hy + 5.5 * u, 2.6 * u, lk.skin);   // a hand over the mouth
    return { hx: x + face * u, headTop: hy - r * 1.05, h: 34 * u, hy, bodyY: bodyTop + bodyH / 2, armY: bodyTop + bodyH * 0.6 };
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
     hid the one thing the player most needs to see. So they go down: in their
     own colours they crouch and sink for half the fall, then lie along the
     floor for the rest of the run, the colour gone out of them and the eye
     shut. They fall back, away from the doors they were walking to. Nothing
     is drawn over them and nobody dies on screen; the brigade gets them.
     (Tipping the standing figure over was tried first: with a head this big
     it lands like a ball, not a person.) */
  const FALLEN_LOOK = { outfit: '#7F939A', skin: '#A9B4B8', hair: '#3A4A52', legs: '#3A4A52' };
  function drawFallen(r) {
    const u = U(), baseY = slabY(r.floor) - 3 - geo.floorPx * 0.055;
    const k = Math.min(1, r.t / 0.9);
    if (k < 0.5 && !REDUCED) {
      ctx.save();
      ctx.translate(r.x, baseY); ctx.scale(1, 1 - 0.5 * ease(k / 0.5));
      figure(ctx, 0, 0, r.side, lookOf(r.seed - 1, r.gid || 0), { duck: 1 });
      ctx.restore();
      return;
    }
    const f = -r.side, x = r.x;
    ctx.fillStyle = 'rgba(60,30,10,0.18)';
    ctx.beginPath(); ctx.ellipse(x + f * 3 * u, baseY + u, 20 * u, 2 * u, 0, 0, Math.PI * 2); ctx.fill();
    fillRR(ctx, Math.min(x, x - f * 14 * u), baseY - 4.5 * u, 14 * u, 4.5 * u, 2.2 * u, FALLEN_LOOK.legs);
    fillRR(ctx, Math.min(x + f * u, x + f * 13 * u), baseY - 8.5 * u, 12 * u, 8.5 * u, 4 * u, FALLEN_LOOK.outfit);
    const hx = x + f * 18 * u, hy = baseY - 6.5 * u;
    disc(ctx, hx + f * 1.5 * u, hy - 0.5 * u, 7.4 * u, FALLEN_LOOK.hair);
    disc(ctx, hx - f * 0.5 * u, hy + 0.5 * u, 6 * u, FALLEN_LOOK.skin);
    ctx.fillStyle = FALLEN_LOOK.hair;
    ctx.fillRect(Math.min(hx - f * 3 * u, hx - f * 0.8 * u), hy - 1.2 * u, 2.2 * u, 1.2 * u);
  }

  // the light from an open car, laid across the corridor it is serving
  function drawSpill() {
    if (doorOpen <= 0.01) return;
    const base = slabY(serveFloor), top = base - geo.floorPx;
    const sides = [{ x0: geo.shaftX, dir: -1, w: geo.corW, cx: geo.leftX }];
    if (geo.rightW > 0) sides.push({ x0: geo.shaftX + geo.shaftW, dir: 1, w: geo.rightW, cx: geo.rightX });
    for (const s of sides) {
      const reach = Math.max(24, s.w * 0.4) * doorOpen;
      ctx.save();
      ctx.beginPath(); ctx.rect(s.cx, top, s.w, geo.floorPx); ctx.clip();
      ctx.beginPath();
      ctx.moveTo(s.x0, top + geo.floorPx * 0.22);
      ctx.lineTo(s.x0 + s.dir * reach, top + geo.floorPx * 0.08);
      ctx.lineTo(s.x0 + s.dir * reach, base);
      ctx.lineTo(s.x0, base);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,229,138,' + (0.20 * doorOpen).toFixed(3) + ')'; ctx.fill();
      ctx.restore();
    }
  }

  function drawShaft() {
    const u = U();
    ctx.fillStyle = SHAFT; ctx.fillRect(geo.shaftX, geo.y, geo.shaftW, geo.h);
    ctx.fillStyle = SHAFT_RAIL;
    ctx.fillRect(geo.shaftX + 5 * u, geo.y, 3 * u, geo.h);
    ctx.fillRect(geo.shaftX + geo.shaftW - 8 * u, geo.y, 3 * u, geo.h);
    const carTop = carBaseY() - geo.carH;
    ctx.fillStyle = CABLE; ctx.fillRect(geo.shaftX + geo.shaftW / 2 - u, geo.y, 2 * u, Math.max(0, carTop - geo.y));
  }

  function carBaseY() {
    const settle = settleT > 0 ? Math.sin(settleT * Math.PI) * 4 * settleDir : 0;
    return geo.y + (floors() - car.y + 1) * geo.floorPx + sag + settle;
  }

  /* THE CAR: a flat yellow cab in its own ring of light, lit and empty inside
     (owner: nobody needs to be drawn in it), with a floor and a handrail, and
     doors that slide from both sides. The two lanterns in its top band still
     say which way it is travelling, and the FULL lamp sits on its roof. */
  function drawCar(now) {
    void now;
    const w = geo.carW, h = geo.carH, u = U();
    const x = Math.round(geo.shaftX + (geo.shaftW - w) / 2);
    const yb = carBaseY(), y = Math.round(yb - h);
    const speed = Math.min(1, Math.abs(car.v) / T.vMax);
    if (!REDUCED && speed > 0.25) {
      ctx.globalAlpha = 0.20 * speed;
      fillRR(ctx, x, y + (car.v > 0 ? 4 : -4), w, h, 8 * u, CAR);
      ctx.globalAlpha = 1;
    }
    halo(ctx, x + w / 2, y + h / 2, h * 0.42, GLOW, 0.5);
    fillRR(ctx, x, y, w, h, 8 * u, CAR);
    ctx.save(); UI.roundRectPath(ctx, x, y, w, h, Math.min(8 * u, w / 2)); ctx.clip();
    ctx.fillStyle = CAR_DK; ctx.fillRect(x, y + h * 0.8, w, h);
    ctx.restore();
    const up = car.v > 0.15, dn = car.v < -0.15;
    disc(ctx, x + 6 * u, y + 4 * u, 1.5 * u, up ? '#FFF8DC' : CAR_DK);
    disc(ctx, x + w - 6 * u, y + 4 * u, 1.5 * u, dn ? '#FFF8DC' : CAR_DK);

    const ix = x + 4 * u, iy = y + 8 * u, iw = w - 8 * u, ih = h - 14 * u;
    fillRR(ctx, ix, iy, iw, ih, 5 * u, CAR_IN);
    ctx.save(); UI.roundRectPath(ctx, ix, iy, iw, ih, Math.min(5 * u, iw / 2)); ctx.clip();
    ctx.fillStyle = CAR_FLOOR; ctx.fillRect(ix, iy + ih * 0.72, iw, ih);
    ctx.fillStyle = CAR_RAIL; ctx.fillRect(ix, iy + ih * 0.45, iw, 1.5 * u);
    if (carSmoke > 0.02) {
      ctx.fillStyle = 'rgba(62,74,92,' + Math.min(0.55, carSmoke * 0.7).toFixed(3) + ')';
      ctx.fillRect(ix, iy, iw, ih);
    }
    const leaf = (iw / 2) * (1 - doorOpen);
    if (leaf > 0.5) {
      ctx.fillStyle = CAR_DK; ctx.fillRect(ix, iy, leaf, ih); ctx.fillRect(ix + iw - leaf, iy, leaf, ih);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(ix + leaf - 0.8 * u, iy, 0.8 * u, ih); ctx.fillRect(ix + iw - leaf, iy, 0.8 * u, ih);
    }
    ctx.restore();

    /* FULL, ON THE CAR. A full car stopping at a floor takes nobody on, and
       with no word for it that looks like the game ignoring you. The word was
       a banner across the middle of the building, over the corridors, for two
       seconds; it is a lamp on the car's roof now, where the eye already is
       when it picks the next floor, and it stays lit for as long as the car
       is full, the way a lift's own FULL lamp does. It flares as it lights. */
    if (fullT > 0) {
      const on = REDUCED ? 1 : ease(fullT), flare = REDUCED ? 0 : fullFlash;
      const fs = Math.max(9, Math.round(9 * u));
      ctx.font = '800 ' + fs + 'px Inter, sans-serif';
      const pw = Math.max(30 * u, ctx.measureText('FULL').width + fs * 1.1), ph = Math.round(fs * 1.35);
      const px = x + w / 2 - pw / 2, py = y - ph - 3 * u;
      if (flare > 0.01) halo(ctx, x + w / 2, py + ph / 2, pw * 0.45, GLOW, 1.4 * flare);
      ctx.globalAlpha = on;
      fillRR(ctx, px, py, pw, ph, ph / 2, SHAFT);
      ctx.fillStyle = MOON; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('FULL', x + w / 2, py + ph / 2 + 0.5);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.globalAlpha = 1;
    }
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
  let hud = { readout: null, note: null, hint: null };     // where the chrome last drew, for hudFit()

  function drawHud() {
    hud = { readout: null, note: null, hint: null };
    for (const c of ctrl) {
      if (c.kind === 'round') { UI.drawRound(ctx, c.cx, c.cy); UI.drawIcon(ctx, c.id, c.cx, c.cy); continue; }
      if (c.kind === 'pill' && !c.icon) { UI.drawPill(ctx, c.label, c.cx, c.cy); continue; }
      if (c.kind === 'pill') UI.drawPill(ctx, '', c.cx, c.cy, { w: UI.PILL.iconW });
      if (c.id === 'alarm') drawBell(c.cx, c.cy, alarmOn);
      else UI.drawIcon(ctx, 'sound', c.cx, c.cy, { on: !sfx || sfx.isOn() });
    }
    drawReadout();
    drawBandNote();
    drawPhoneHint();
  }

  /* THE READ-OUT, at the bottom left (DESIGN-SYSTEM 4.3): the five strike
     dots, then one line in Ink 72 at 600 16px. Its room runs to the phone's
     bell or to the desktop's right margin, and it draws the longest form that
     fits there. Both halves of the comparison, and the damage when there is
     any: a count that only goes up tells you nothing about whether you are
     still winning. */
  function planReadout(saved, inside, bestV) {
    const pad = buildPad();
    const alarm = MODE === 'mobile' ? ctrl.find(c => c.id === 'alarm') : null;
    const right = alarm ? alarm.x - 8 : LW - SIDE_PAD;
    const textX = pad + DOTS_W + DOTS_TO_TEXT;
    const forms = readoutForms(saved, inside, bestV);
    ctx.save();
    ctx.font = '600 16px Inter, sans-serif';
    let line = null, w = 0;
    for (const f of forms) {
      w = ctx.measureText(f).width;
      if (textX + w <= right) { line = f; break; }
    }
    ctx.restore();
    return { line, x: pad, textX, w: line ? w : 0, right, cy: LH - botBand() / 2 };
  }
  /* A RESCUE IS COUNTED AS IT HAPPENS. The score used to jump by the whole
     car the instant the lobby doors opened; it counts each guest now as they
     go out through the doors, and the line brightens as it does, so a full
     car arriving is six small moments rather than one number changing. */
  const shownSaved = () => out - runners.filter(r => r.kind === 'out' && r.t < r.dur * SAVED_AT).length;
  function drawReadout() {
    const p = planReadout(shownSaved(), waiting.length + aboard.length, best);
    const cy = p.cy;
    /* THE STRIKES, as dots. How many are gone is the second thing worth
       knowing after the score, and a count you have to read as a word is a
       count you miss. An empty place is a Tint 40 socket; a strike is coral,
       and the newest one lands: it swells and throws a ring. */
    for (let i = 0; i < STRIKES; i++) {
      const dx = p.x + DOT_R + i * DOT_GAP;
      let r = DOT_R;
      if (i < lost) {
        const age = i === lost - 1 ? tNow - lostAt : 99;
        if (!REDUCED && age < 0.6) {
          const k = age / 0.6;
          ctx.strokeStyle = 'rgba(255,107,92,' + (0.7 * (1 - k)).toFixed(3) + ')';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(dx, cy, DOT_R + 10 * ease(k), 0, Math.PI * 2); ctx.stroke();
          r = DOT_R * (1 + 0.6 * (1 - ease(Math.min(1, age / 0.35))));
        }
        ctx.fillStyle = '#FF6B5C';                             // --accent-text
      } else ctx.fillStyle = 'rgba(255,255,255,0.40)';        // Tint 40
      ctx.beginPath(); ctx.arc(dx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
    if (p.line) {
      const glow = REDUCED ? 0 : Math.max(0, 1 - (tNow - savedAt) / 0.6);
      ctx.font = '600 16px Inter, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,' + (0.72 + 0.28 * glow).toFixed(3) + ')';   // Ink 72, Ink 100 as it counts
      ctx.fillText(p.line, p.textX, cy);
      ctx.textBaseline = 'top';
    }
    hud.readout = { x: p.x, y: cy - 10, w: p.textX - p.x + p.w, h: 20, right: p.right, line: p.line };
  }

  /* THE TOP BAND'S RIGHT END carries what the building says that needs no
     answer. MORE GUESTS ARE ARRIVING was a banner across the middle of the
     building, over the very corridors a player is watching, and nothing may
     cover play; it is a line of coral at the end of the band now, and the
     desktop's first-seconds hint shares the place (a phone keeps its hint
     under the building). Right aligned to the margin, or 12 short of the
     site's full-screen exit button, and a note too long for the room after
     the controls takes a shorter form or is not drawn. */
  const NOTES = {
    wave: { font: '700 16px Inter, sans-serif', ink: '255,107,92',            // --accent-text
            forms: ['MORE GUESTS ARE ARRIVING', 'MORE GUESTS ARRIVING', 'MORE GUESTS'] },
    hint: { font: '600 16px Inter, sans-serif', ink: '255,255,255', max: 0.72, // Ink 72
            forms: ['click a floor button · take them to the lobby', 'click a floor button'] },
  };
  function planNote(kind) {
    const n = NOTES[kind], right = bandRight(), left = rowRight + 24;
    ctx.save();
    ctx.font = n.font;
    let msg = null, w = 0;
    for (const f of n.forms) {
      w = ctx.measureText(f).width;
      if (right - w >= left) { msg = f; break; }
    }
    ctx.restore();
    return msg ? { msg, x: right - w, w, right, left } : null;
  }
  function drawBandNote() {
    if (phase === 'over') return;
    let kind = null, a = 0;
    if (waveFlash > 0 && wave > 1) { kind = 'wave'; a = Math.min(1, waveFlash * 2.2); }
    else if (MODE === 'desktop' && tNow < HINT_S) { kind = 'hint'; a = Math.min(1, (HINT_S - tNow) / 0.8); }
    if (!kind) return;
    const p = planNote(kind);
    if (!p) return;
    const n = NOTES[kind];
    ctx.font = n.font; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(' + n.ink + ',' + ((n.max || 1) * a).toFixed(3) + ')';
    ctx.fillText(p.msg, p.x, topBand() / 2);
    ctx.textBaseline = 'top';
    hud.note = { x: p.x, y: topBand() / 2 - 10, w: p.w, h: 20, msg: p.msg };
  }

  /* THE PHONE'S FIRST-SECONDS HINT, in its own lane under the building. The
     first thing a thumb should try is the thing the buttons are for. It keeps
     16px and takes a shorter form on a narrow phone, where it used to shrink
     to 10. */
  function planPhoneHint() {
    ctx.save();
    ctx.font = '600 16px Inter, sans-serif';
    let msg = null, w = 0;
    for (const f of ['tap a floor button · take them to the lobby', 'tap a floor · take them to the lobby', 'tap a floor button']) {
      w = ctx.measureText(f).width;
      if (w <= LW - PHONE_PAD * 2) { msg = f; break; }
    }
    ctx.restore();
    return msg ? { msg, w, cy: geo.y + geo.h + statusLane() / 2 + 4 } : null;
  }
  function drawPhoneHint() {
    if (MODE !== 'mobile' || statusLane() <= 0 || tNow >= HINT_S || phase === 'over') return;
    const p = planPhoneHint();
    if (!p) return;
    const a = Math.min(1, (HINT_S - tNow) / 0.8);
    ctx.font = '600 16px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,' + (0.72 * a).toFixed(3) + ')';   // Ink 72
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.msg, LW / 2, p.cy);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    hud.hint = { x: LW / 2 - p.w / 2, y: p.cy - 10, w: p.w, h: 20, msg: p.msg };
  }

  /* A BELL, struck through when it is off, drawn to the weight of the shared
     speaker so the pair reads as one set of switches rather than two ideas. */
  function drawBell(cx, cy, on) {
    ctx.save();
    ctx.strokeStyle = UI.PILL.text; ctx.fillStyle = UI.PILL.text;
    ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy + 3);
    ctx.quadraticCurveTo(cx - 5.5, cy - 4, cx - 1.5, cy - 5.5);
    ctx.lineTo(cx + 1.5, cy - 5.5);
    ctx.quadraticCurveTo(cx + 5.5, cy - 4, cx + 6, cy + 3);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(cx - 7, cy + 3, 14, 1.6);
    ctx.beginPath(); ctx.arc(cx, cy + 6.5, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy - 6.6, 1.3, 0, Math.PI * 2); ctx.fill();
    if (!on) {
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 8, cy + 8); ctx.lineTo(cx + 8, cy - 8); ctx.stroke();
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
  /* THE RUN ENDS ON THE BOARD FIRST (DESIGN-SYSTEM 10.2). The fifth guest
     goes down, their floor's runner flashes, the last strike lands in the
     read-out and the building's lights go down; the card follows END_HOLD
     later, rising a little as it fades in. Reduced motion keeps the wait,
     which is time and not movement, and drops the fade and the rise. */
  const endShown = () => phase === 'over' && endT >= END_HOLD;
  function drawEndCard() {
    const dim = REDUCED ? 1 : ease(Math.min(1, endT / END_HOLD));
    ctx.fillStyle = 'rgba(10,8,16,' + (0.34 * dim).toFixed(3) + ')';
    rr(geo.x, geo.y - 8, geo.w, geo.h + 8, 8); ctx.fill();
    if (!endShown()) { endCTA = null; return; }
    const a = REDUCED ? 1 : ease(Math.min(1, (endT - END_HOLD) / 0.35));
    const b = endBox();
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(10,16,28,0.82)'; ctx.fillRect(0, 0, LW, LH);
    ctx.translate(0, Math.round(14 * (1 - a)));
    ctx.fillStyle = SURFACE; rr(b.px, b.py, b.pw, b.ph, 22); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    rr(b.px, b.py, b.pw, b.ph, 22); ctx.stroke();

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const t = endTitle(out, b.pw - 40);
    ctx.fillStyle = '#FFFFFF'; ctx.font = '800 ' + t.fs + 'px Inter, sans-serif';
    ctx.fillText(t.text, b.px + b.pw / 2, b.py + 34 + (34 - t.fs) / 2);

    ctx.font = '600 17px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';                // Ink 82
    ctx.fillText(endSub(lostFloors, b.pw - 40), b.px + b.pw / 2, b.py + 84);

    ctx.font = '500 16px Inter, sans-serif';
    ctx.fillStyle = INK72;
    ctx.fillText(out >= best && out > 0 ? 'A new best.' : 'Best so far: ' + best,
                 b.px + b.pw / 2, b.py + 118);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    const label = 'PLAY AGAIN';
    endCTA = UI.drawCTA(ctx, label, b.px + b.pw / 2, b.py + b.ph - 40 - 25, CORAL);
    ctx.restore();
  }
  /* THE CARD'S WORDS ARE MEASURED. A three-figure score made the title wider
     than a phone's card, and three floors made the line under it wider than
     a 320 phone's, both off the edge of the card since the card was drawn.
     The title steps down to 26px and then drops GUESTS; the floors line drops
     "were", then names only the highest floor. */
  function endTitle(n, room) {
    const forms = [n + (n === 1 ? ' GUEST SAVED' : ' GUESTS SAVED'), n + ' SAVED'];
    ctx.save();
    let pick = null;
    for (const f of forms) {
      for (let fs = 34; fs >= 26 && !pick; fs -= 2) {
        ctx.font = '800 ' + fs + 'px Inter, sans-serif';
        if (ctx.measureText(f).width <= room) pick = { text: f, fs, w: ctx.measureText(f).width };
      }
      if (pick) break;
    }
    ctx.restore();
    return pick || { text: forms[1], fs: 26, w: Infinity };
  }
  function endSub(floorsLost, room) {
    const uniq = [...new Set(floorsLost)].sort((a, b) => b - a);
    const forms = uniq.length === 1 ? ['Floor ' + uniq[0] + ' was still waiting.']
      : ['Floors ' + uniq.slice(0, 3).join(', ') + ' were still waiting.',
         'Floors ' + uniq.slice(0, 3).join(', ') + ' still waiting.',
         'Floor ' + uniq[0] + ' was still waiting.'];
    ctx.save();
    ctx.font = '600 17px Inter, sans-serif';
    const pick = forms.find(f => ctx.measureText(f).width <= room) || forms[forms.length - 1];
    ctx.restore();
    return pick;
  }
  function onEndPointer(p) {
    if (endCTA && p.x >= endCTA.x && p.x <= endCTA.x + endCTA.w && p.y >= endCTA.y && p.y <= endCTA.y + endCTA.h) advanceFromCard();
  }

  /* ---------- RULES ---------- */
  const RULES_TEXT = [
    'A hotel is on fire. Smoke comes along every corridor from the stairwell at the far end, and the way out is the lobby.',
    'Smoke climbs, so the floors above the fire stay the worst ones in the building. A corridor the fire is no longer feeding clears again, which is why the floors below it come back and are the ones you can leave for later.',
    'You do not drive the car. Press a floor button and it goes there and lands level. Press several and it answers them in that order; press a lit one again to cancel it. On a keyboard, the number keys call a floor.',
    'The bar over someone is the air they have left. It only runs down once the smoke has reached them, so whoever stands deepest is on the shortest clock.',
    'Six fit in the car. Every door you open lets smoke into it, so a stop you did not need costs everyone already aboard.',
    'People holding on to each other board together when there is room for all of them. When there is not, the free place goes to whoever has the least air.',
    'Five people overcome ends the run, and more guests keep arriving the longer you last.',
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
    ctx.fillText('Evac', b.px + 43, b.py + 34);
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
     called up to it, the doors, somebody getting in, and the ride down to the
     lobby. The whole verb, in the order you meet it, drawn in the game's own
     art. */
  function drawDemo(x, y, w, h, now) {
    const t = (now / 1000) % 8;
    const rows = 3, fh = h / rows;
    const shaftW = Math.round(w * 0.16), corW = w - shaftW, sx = x + corW;
    ctx.save();
    ctx.beginPath(); rr(x, y, w, h, 6); ctx.clip();
    for (let r = 0; r < rows; r++) {
      const ry = y + r * fh;
      ctx.fillStyle = CEIL; ctx.fillRect(x, ry, corW, Math.max(2, fh * 0.12));
      ctx.fillStyle = WALL; ctx.fillRect(x, ry + fh * 0.12, corW, fh * 0.76);
      ctx.fillStyle = FLOOR; ctx.fillRect(x, ry + fh * 0.88, corW, fh * 0.12);
      if (r < rows - 1) { ctx.fillStyle = DOOR; ctx.fillRect(x + 8 + r * 3, ry + fh * 0.88 - fh * 0.62, fh * 0.3, fh * 0.62); }
    }
    ctx.fillStyle = EXIT; ctx.fillRect(x + 6, y + h - fh * 0.12 - fh * 0.66, 18, fh * 0.66);
    ctx.fillStyle = SHAFT; ctx.fillRect(sx, y, shaftW, h);
    // smoke gathering in the top corridor, as a few see-through bubbles
    const dens = Math.min(1, t / 5);
    if (dens > 0.02) {
      ctx.save(); ctx.beginPath(); ctx.rect(x, y + fh * 0.12, corW, fh * 0.76); ctx.clip();
      ctx.globalAlpha = SMOKE_ALPHA;
      [[0.06, 0.35, 0.30], [0.16, 0.25, 0.22], [0.26, 0.40, 0.26], [0.36, 0.28, 0.18], [0.45, 0.38, 0.14], [0.53, 0.30, 0.10]]
        .forEach(([fx, fy, fr], i) => { if (fx < dens * 0.6) disc(ctx, x + corW * fx, y + fh * fy, fh * fr, SMOKE_T[i % 3]); });
      ctx.restore();
    }

    let cf, open = 0, personIn = true;
    if (t < 1.0) cf = 2;
    else if (t < 2.5) cf = 2 - 2.4 * ease((t - 1.0) / 1.5);
    else if (t < 3.2) cf = -0.4;
    else if (t < 3.9) cf = -0.4 + 0.4 * ease((t - 3.2) / 0.7);
    else if (t < 4.7) { cf = 0; open = ease((t - 3.9) / 0.8); }
    else if (t < 5.5) { cf = 0; open = 1; personIn = t < 5.1; }
    else if (t < 6.1) { cf = 0; open = 1 - ease((t - 5.5) / 0.6); }
    else if (t < 7.4) { cf = 2 * ease((t - 6.1) / 1.3); }
    else { cf = 2; open = ease((t - 7.4) / 0.6); }

    if (personIn) drawTinyFigure(x + corW * 0.72, y + fh * 0.9, fh * 0.52);
    const carH = fh - 6, carW = shaftW - 5;
    const cxx = sx + (shaftW - carW) / 2, cyy = y + (cf + 1) * fh + (t >= 2.5 && t < 3.2 ? 2 : 0) - carH;
    ctx.fillStyle = CABLE; ctx.fillRect(sx + shaftW * 0.5 - 1, y, 2, Math.max(0, cyy - y));
    fillRR(ctx, cxx, cyy, carW, carH, 4, CAR);
    const ix = cxx + 3, iy = cyy + 4, iw = carW - 6, ih = carH - 7;
    ctx.fillStyle = CAR_IN; ctx.fillRect(ix, iy, iw, ih);
    const leaf = (iw / 2) * (1 - open);
    ctx.fillStyle = CAR_DK;
    ctx.fillRect(ix, iy, leaf, ih); ctx.fillRect(ix + iw - leaf, iy, leaf, ih);
    ctx.restore();
  }
  function drawTinyFigure(cx, baseY, h) {
    const r = h * 0.26;
    ctx.fillStyle = LEGS;
    ctx.fillRect(cx - h * 0.13, baseY - h * 0.2, h * 0.1, h * 0.2);
    ctx.fillRect(cx + h * 0.03, baseY - h * 0.2, h * 0.1, h * 0.2);
    fillRR(ctx, cx - h * 0.19, baseY - h * 0.48, h * 0.38, h * 0.3, h * 0.1, OUTFITS[3]);
    disc(ctx, cx - h * 0.06, baseY - h * 0.7, r * 1.02, HAIRS[1]);
    disc(ctx, cx + h * 0.04, baseY - h * 0.66, r * 0.82, SKINS[1]);
    disc(ctx, cx + h * 0.23, baseY - h * 0.62, r * 0.33, NOSE);
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
    const top = topBand() + ROOF, bot = LH - botBand() - statusLane();
    return {
      mode: MODE, LW, LH, floors: floors(), floorPx: geo.floorPx, shaftW: geo.shaftW, corW: geo.corW,
      buildTop: geo.y, buildBottom: geo.y + geo.h,
      overTop: Math.max(0, top - geo.y),
      overBottom: Math.max(0, (geo.y + geo.h) - bot),
      fits: geo.y >= top && (geo.y + geo.h) <= bot && geo.corW > 40 && geo.shaftW >= 30,
    };
  };
  /* THE CHROME, MEASURED (DESIGN-SYSTEM 10.3). Every control, the read-out
     at a long line (three-figure scores by default), each note at the form it
     would take, and the phone's hint, checked against one another, the
     building (roof included) and the frame. The two notes share one place and
     are never drawn together, so that pair is not compared. Pure layout: no
     frame has to be painted, so it works with the preview pane hidden. */
  window.hudFit = function (saved = 999, inside = 99, bestV = 999) {
    const boxes = ctrl.map(c => ({ name: c.id, x: c.x, y: c.y, w: c.w, h: c.h }));
    const r = planReadout(saved, inside, bestV);
    boxes.push({ name: 'readout', x: r.x, y: r.cy - 10, w: r.textX - r.x + r.w, h: 20 });
    const notes = {};
    for (const k of Object.keys(NOTES)) {
      if (k === 'hint' && MODE !== 'desktop') continue;      // a phone's hint lives under the building
      const n = planNote(k);
      notes[k] = n ? n.msg : null;
      if (n) boxes.push({ name: 'note:' + k, x: n.x, y: topBand() / 2 - 10, w: n.w, h: 20 });
    }
    const ph = MODE === 'mobile' && statusLane() > 0 ? planPhoneHint() : null;
    if (ph) boxes.push({ name: 'hint', x: LW / 2 - ph.w / 2, y: ph.cy - 10, w: ph.w, h: 20 });
    const build = { name: 'building', x: geo.x - 4, y: geo.y - ROOF, w: geo.w + 8, h: geo.h + ROOF };
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const problems = [];
    if (!r.line) problems.push('readout: no form fits');
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i];
      if (a.x < 0 || a.y < 0 || a.x + a.w > LW || a.y + a.h > LH) problems.push(a.name + ' leaves the frame');
      if (hit(a, build)) problems.push(a.name + ' is on the building');
      if (exitBox && hit(a, { x: exitBox.x - 12, y: exitBox.y, w: exitBox.w + 12, h: exitBox.h })) problems.push(a.name + ' is under the exit button');
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j];
        if (a.name.startsWith('note:') && b.name.startsWith('note:')) continue;
        if (hit(a, b)) problems.push(a.name + ' overlaps ' + b.name);
      }
    }
    return { ok: problems.length === 0, problems, readout: r.line, room: Math.round(r.right - r.textX - r.w),
             notes, hint: ph ? ph.msg : null, boxes };
  };
  /* The card, and the longest things written on it: the title at a
     three-figure score, and the floors line naming three floors. */
  window.endFit = function () {
    const b = endBox(), inner = b.pw - 40;
    const t = endTitle(888, inner), sub = endSub([8, 7, 6], inner);
    ctx.save();
    ctx.font = '600 17px Inter, sans-serif';
    const subW = ctx.measureText(sub).width;
    ctx.restore();
    return { fits: b.py >= 0 && b.py + b.ph <= LH && t.w <= inner && subW <= inner,
             cardH: b.ph, frameH: LH, overlapPx: Math.max(0, (b.py + b.ph) - LH),
             cardW: b.pw, title: t.text, titleFs: t.fs, sub };
  };
  window.evac = {
    get car() { return car; }, get phase() { return phase; }, get out() { return out; },
    get lost() { return lost; }, get waiting() { return waiting; }, get aboard() { return aboard; },
    get smoke() { return Array.from(smoke || []); }, get carSmoke() { return carSmoke; },
    get level() { return level; }, get fallen() { return fallen; },
    get calls() { return calls.slice(); }, call(f) { pressCall(f); },
    geo, RUN, PARTY, start: startRun, snd, FIRE, get runners() { return runners; },
    /* STILLS, behind ?harness=1: a named building, the clock advanced with no
       one at the controls, and the picture held while it is drawn, so two
       looks can be compared on the same moment of the same run. */
    ...(HARNESS ? {
      seed(n) { startRun(n); return level.seed; },
      freeze(on) { frozen = on !== false; acc = 0; return frozen; },
      advance(secs) { for (let t = 0; t < secs; t += DT) step(DT); return { t: tNow, out, lost, waiting: waiting.length }; },
      paint(now) { render(now == null ? performance.now() : now); },
    } : {}),
    get hud() { return hud; }, get ctrl() { return ctrl; },
    /* Live getters live here, not in the harness block above: spreading an
       object copies what a getter returns once, at startup. */
    get doorOpen() { return doorOpen; }, get serveFloor() { return serveFloor; },
    get fullT() { return fullT; }, get best() { return best; },
    get renderMs() { return renderMs; }, get t() { return tNow; }, get wave() { return wave; },
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
    if (!document.hidden && !rulesOpen && !frozen) {
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
  window.addEventListener('splash-done', () => { render(performance.now()); });
  window.addEventListener('load', onResize);
  window.visualViewport && window.visualViewport.addEventListener('resize', onResize);
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  TR().gameStart();
  requestAnimationFrame(frame);
})();
