/* ============================================================
   Comb · A Zamborin Game — board and placement (milestone 1)
   ============================================================

   The lattice, the catalogue, the generator and the solvers are in gen.js and
   have no DOM in them, because the gate has to play thousands of levels
   headlessly. This file is the renderer and the hands: it draws that model
   and turns a drag into a placement. It holds no rules of its own.

   TWO LAYOUTS, NOT ONE SCALED. Desktop is the 760x600 site frame with the
   tray as a column on the right, because a landscape frame has width to spare
   and a short sideways drag beats a long vertical one. Mobile is the measured
   portrait viewport with the tray as a strip above the controls. Same level,
   same par, different picture.

   THE HEX SIZE IS NOT FIXED AT R = 25. The brief's 25 comes from a full 7x13
   region, and no level fills one: the gate measured that a board past about 26
   cells stops being solvable by reasoning, so every level here is 9 to 17
   cells and its outline is a small irregular patch. Drawing that patch at a
   fixed 25 would leave it stranded in the middle of an empty frame. The
   radius is fitted to the level's own bounding box and capped, so a small
   level is drawn large and the board always fills the space it is given.
*/
(() => {
  'use strict';

  const G = window.COMB_GEN;
  const UI = window.ZAM_UI;

  // ---------- MODE ----------
  // A browser can report a 0-wide viewport on the first frame. The obvious
  // `innerWidth < 768` then reads as a phone, MODE is locked for the session,
  // and a desktop player is left on the phone layout for good.
  const MODE = (matchMedia('(pointer: coarse)').matches ||
                (window.innerWidth > 0 && window.innerWidth < 768))
    ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);

  // ---------- TOKENS ----------
  // Canvas cannot read CSS variables, so shared/tokens.css is restated here
  // and nowhere else. Chrome takes these and nothing else.
  const TOK = {
    bg: '#0E1726', bgCard: '#131F36', bgPanel: '#1A2A45',
    text: '#FFFFFF', ink92: 'rgba(255,255,255,0.92)', ink90: 'rgba(255,255,255,0.90)',
    ink82: 'rgba(255,255,255,0.82)', ink72: 'rgba(255,255,255,0.72)',
    tint03: 'rgba(255,255,255,0.03)', tint07: 'rgba(255,255,255,0.07)',
    tint10: 'rgba(255,255,255,0.10)', tint12: 'rgba(255,255,255,0.12)',
    tint40: 'rgba(255,255,255,0.40)',
    accent: '#C24A39', accentText: '#FF6B5C', green: '#5DD39E',
    accent2: '#FFD23F', tint30: 'rgba(255,255,255,0.30)',
    scrim: 'rgba(10,16,28,0.88)', scrimWin: 'rgba(10,16,28,0.82)',
  };

  /* GAME ART, and only game art: the pieces on the playfield, one per piece in
     tray order. What these colours are FOR is telling two clusters apart where
     they touch, so that is what they are measured on: the closest pair of
     touching cells from different clusters, read off the painted canvas over
     14 shipped levels, 425 pairs, in CIE76 delta E.

     The set these replace scored 19.4 at worst and 25.5 at the median, with a
     pair under 20 in 6 levels of 14. An evenly spaced ladder solved to one
     lightness was built on 2026-09-15 and measured WORSE, 16.9 and 17.6:
     colours of equal lightness can differ only in hue, and the old set's
     uneven lightness was what kept neighbours apart. An optimiser left free to
     maximise the number returned neon green and bright yellow. These are the
     old set NUDGED, the owner's call on 2026-09-16: each held within delta E
     13 of the colour it replaces, index for index, and moved only to open the
     closest pairs. 30.6 at worst, 32.8 at the median, no level under 20. Every
     one is also measured against the Portal wash in __comb.contrast(). */
  const PIECE = [
    '#859DEB', '#E74C65', '#45B16C', '#C86FDC', '#25AEA5',
    '#D379A5', '#6571EE', '#80A12B', '#25A8D4', '#D35A28',
  ];

  /* THE WAX COMB ON THE HOUSE BLUE. The empty cells are wax: game art on the
     Portal wash, which DESIGN-SYSTEM 1.5 allows. A honey ground with honey
     cards was built and played on 2026-09-15; the owner kept the wax and the
     pieces and put the ground back to blue.

     LIT FROM THE UPPER LEFT, GENTLY. The wash is centred at 32% of the width on
     the top edge, so the room was always lit from up and left while the cells
     were shaded straight down. Owner, 2026-09-16: angled, deeper than before,
     "not so dark, just a gentle gradation". Honey standing in the cups and a
     comb pattern across the ground were both built that day and both taken
     out on the owner's call, and the pieces keep their straight-down
     gradient, also the owner's call. Measured in __comb.contrast. */
  const WAX = { rimLit: '#E5B159', rimMid: '#C89340', rimDark: '#A57530',
                cupDark: '#6E4715', cupLit: '#A66F2E' };
  /* LIGHT points FROM the lit face TOWARDS the shaded one. The wash is a lamp
     in the room, not a sun at infinity, so each cell takes its light from a
     slightly different angle: 65% towards the lamp and 35% towards this fixed
     diagonal, enough to be felt across a board without lighting a cell at the
     edge of a wide window from the side. */
  const LIGHT = { x: 0.6, y: 0.8 };

  // ---------- CANVAS ----------
  let LW, LH;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const gameWrap = canvas.parentElement;

  /* THE FRAME FILLS ITS WINDOW WHEN THE GAME IS THE WHOLE PAGE. On zamborin.com
     the desktop game sits in the 760x600 site frame. In an embed, a portal
     package and full screen the window IS the frame, and contain-fitting the
     760x600 picture into CrazyGames' 16:9 player left 29% of every one of their
     windows empty and set 16px type at 12.3px in the smallest (measured
     2026-09-15). There the logical size is the window's own, one CSS pixel to
     one unit, and the layout decides what goes where instead of a scale factor.
     A zero reading (a hidden frame's first tick) falls back to the site frame
     until the real size arrives on the next resize. */
  const fillsWindow = () => MODE === 'mobile' ||
    document.documentElement.classList.contains('embed') ||
    document.body.classList.contains('focus-mode');
  function setCanvasVars() {
    if (fillsWindow()) {
      const vw = window.innerWidth > 0 ? window.innerWidth : 760;
      const vh = window.innerHeight > 0 ? window.innerHeight : 600;
      /* Narrower than the site frame, a desktop top band cannot hold its row
         of house-size pills beside the read-out: at 480x360, the smallest
         frame /embed/ supports, they collided on every level. Such a window
         keeps its own shape but is laid out 760 across and scaled down, as
         the whole game used to be. CrazyGames' smallest window is 821. */
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
    fitFullscreen(); resizeCanvas(); layout(); draw();
  }

  // ---------- AUDIO ----------
  // gain 2.4: the fleet is mixed about 4x too quiet and a muted game has no
  // sound at all, not quiet sound.
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zam.comb.sfx', gain: 2.4 }) : null;
  const play = (n) => { try { if (sfx) sfx.play(n); } catch (_) { /* audio never breaks play */ } };

  /* ---------- PORTAL ----------
     Harmless when there is no portal, which is every visit to zamborin.com.
     The mute hooks matter: CrazyGames requires the game silenced for the whole
     ad, and restoring means restoring the PLAYER's setting rather than
     unmuting someone who had chosen silence. */
  const portal = window.ZAM_PORTAL;
  let adPaused = false;
  if (portal) {
    portal.init({
      onPause: () => { adPaused = true; },
      onResume: () => { adPaused = false; draw(); },
      isMuted: () => (sfx ? !sfx.isOn() : false),
      setMuted: (m) => { if (sfx) sfx.setOn(!m); },
    });
    /* Bracket the boot. CrazyGames measures load time up to gameplayStart, and
       gameplayStart cannot fire until the player presses PLAY on the rules
       card — so without this pair the reported load time is the splash plus
       however long they spent reading, which came back as 15.1 seconds for a
       0.4 MB game. loadingStop fires when the splash lifts, which is the first
       moment the game will actually take an input. */
    portal.loadingStart();
    window.addEventListener('splash-done', () => portal.loadingStop(), { once: true });
    // No splash in this frame (the site's embed can skip it): close it now.
    if (!document.getElementById('splash')) portal.loadingStop();
  }

  // ---------- ANALYTICS ----------
  const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){},
                 levelRestart(){}, hintUsed(){}, track(){} };
  const T = () => (window.ZAM_TRACK || NOOP);
  T().init('comb');

  /* ---------- PROGRESS ----------
     One record in localStorage, written on every completion. Everything here
     is wrapped: a browser in private mode throws on both getItem and setItem,
     and a game that cannot save must still be a game that runs. A corrupt or
     future-version record is discarded rather than migrated — there is nothing
     in it worth a migration path, and half-read progress is worse than none. */
  const SAVE_KEY = 'zam.comb.progress';
  const LEVELS = 100;
  const blankSave = () => ({ v: 1, max: 1, stars: {}, streak: 0, last: '', daily: { date: '', stars: 0 }, dailyStars: 0 });

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return blankSave();
      const o = JSON.parse(raw);
      if (!o || o.v !== 1 || typeof o.max !== 'number') return blankSave();
      const b = blankSave();
      return { v: 1,
        max: Math.max(1, Math.min(LEVELS, o.max | 0)),
        stars: (o.stars && typeof o.stars === 'object') ? o.stars : b.stars,
        streak: Math.max(0, o.streak | 0),
        last: typeof o.last === 'string' ? o.last : '',
        daily: (o.daily && typeof o.daily === 'object') ? o.daily : b.daily,
        // Added 2026-09-15; a record from before simply starts it at zero.
        dailyStars: Math.max(0, o.dailyStars | 0) };
    } catch (_) { return blankSave(); }
  }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) {} }
  let save = loadSave();

  /* UTC, not local. The daily has to be the same puzzle for everyone at the
     same moment, and a streak has to mean the same thing in every timezone. */
  const utcDay = (shift) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + (shift || 0));
    return d.toISOString().slice(0, 10);
  };
  const dailySeed = () => { const p = utcDay().split('-'); return (+p[0]) * 10000 + (+p[1]) * 100 + (+p[2]); };

  // 3 at par, 2 within two of it, 1 otherwise. Undo costs a move, so a perfect
  // run and a run with one rethink are genuinely different results.
  const starsFor = (m, par) => (m <= par + G.TUNE.starPar ? 3 : m <= par + G.TUNE.starPlus ? 2 : 1);
  const starsAt = (n) => (save.stars[n] | 0);
  const totalStars = () => Object.keys(save.stars).reduce((a, k) => a + (save.stars[k] | 0), 0) + (save.dailyStars | 0);
  /* The streak as it stands today: alive if the daily was finished today or
     yesterday, broken otherwise. The stored number is kept until the next
     completion decides it, but the map never shows a streak that the next
     daily would not continue. */
  const liveStreak = () => (save.last === utcDay() || save.last === utcDay(-1)) ? save.streak : 0;
  const unlocked = (n) => n <= save.max;

  function recordWin(n, isDaily, moves, par, forced) {
    /* A skip awards ONE star and never more, however few moves are on the
       counter. That is the anti-trap in the brief: a player may buy past a
       wall they are stuck on, but cannot buy a perfect record, so the map goes
       on telling the truth. */
    const st = forced || starsFor(moves, par);
    if (isDaily) {
      const prev = save.daily.date === utcDay() ? save.daily.stars | 0 : 0;
      const best = Math.max(st, prev);
      // Daily stars join the total, once per day at that day's best: a replay
      // that beats the morning's result adds only the difference.
      save.dailyStars = (save.dailyStars | 0) + (best - prev);
      save.daily = { date: utcDay(), stars: best };
      T().track('daily_played', { stars: st });
    } else {
      if (st > starsAt(n)) save.stars[n] = st;
      if (n + 1 > save.max) save.max = Math.min(LEVELS, n + 1);
    }
    T().track('stars_awarded', { level: n, stars: st, daily: isDaily ? 1 : 0 });

    /* THE STREAK IS THE DAILY'S (owner's call 2026-09-15). It counts days on
       which that day's puzzle was finished, so it moves at most once a day and
       only ever forward by one. Yesterday continues it, anything older starts
       again at one. It used to count ANY completion, which left the daily with
       no job: a player kept the streak without ever opening it. */
    const today = utcDay();
    if (isDaily && save.last !== today) {
      save.streak = (save.last === utcDay(-1)) ? save.streak + 1 : 1;
      save.last = today;
      T().track('streak_day', { n: save.streak });
    }
    persist();
    return st;
  }

  // ---------- BANDS ----------
  const SIDE_PAD = 30;
  const topBand = () => (MODE === 'mobile' ? 64 : 56);
  /* 150 rather than 96 on a phone, because the play screen now carries TWO
     rows: the controls at thumb height and HINT/SKIP above them, which is
     where the brief puts them rather than squeezing a fifth pill into a row
     already measured at 315 of 330. It costs the board no size at all: the
     board is width-bound in portrait, capped by PORTRAIT_COLS, so the height
     given up was slack. The map has one row and takes 96 directly. */
  const botBand = () => (MODE === 'mobile' ? 150 : 80);
  const mapBotBand = () => (phoneLayout() ? 16 : MODE === 'mobile' ? 96 : 20);

  /* THE PHONE LAYOUT, from the owner's mockup and notes (2026-09-16). Every
     control in one row across the top as a round icon button, so a thumb
     resting at the bottom of the screen can never land on Restart; the board;
     under it EVERY piece at once, sitting straight on the canvas and loosely
     arranged, drawn smaller than the board and growing to board size the
     moment it is touched; and along the bottom the level and moves at the
     left and the sound switch, bare, at the right. Icons wherever a word is
     not needed: six round icons fit a 390 phone with room to spare, where six
     buttons with words need about 390px on their own. Portrait phones only; a
     phone held sideways keeps the layout it had. */
  const phoneLayout = () => MODE === 'mobile' && !landscape();
  const PHONE_PAD = 16;        // side margin, from the mockup
  const PHONE_LEGEND = 52;     // the bottom row, clear of the home indicator
  /* THE DESKTOP FRAME, owner's notes 2026-09-16: Hint and Skip move up into the
     right end of the top band, the level and moves read-out moves to the
     bottom left under the board, and the tray column shows every piece at once
     with no panel behind them. Landscape desktop frames only. */
  const deskLayout = () => MODE === 'desktop' && landscape();
  const DESK_READ_BAND = 40;
  const TRAY_H = 118;          // the tray as a strip, under a portrait board
  // As a column: 170 in the site frame, wider in a big window so the pieces
  // are drawn at a size that belongs to the board beside them.
  const trayW = () => Math.round(Math.min(LW * 0.30, Math.max(170, LH * 0.30)));

  /* WHICH WAY THE TRAY GOES IS DECIDED BY THE FRAME'S SHAPE, NOT BY MODE.
     The two layouts are landscape and portrait; desktop and mobile is only
     usually the same question. It is not the same question at 480x360, the
     smallest frame /embed/ supports, which is landscape and reports a coarse
     pointer. Stacking HUD, board, tray and controls down that frame left the
     board 68 logical pixels of height and the hexagons collapsed to their
     minimum radius of 10. boardFit() reported it on its first run. */
  const landscape = () => LW >= LH * 1.15;
  // Widest board, in hex columns, of every tier of the shipped ladder.
  const TIER_MAX_COLS = [5, 6, 5.5, 5.5, 5.5, 5.5, 6, 6, 6, 6, 6, 7, 6.5, 7.5];
  const SQ3 = Math.sqrt(3);

  // ---------- HEX PIXEL MATH ----------
  // Pointy-top. Centre of axial (q, r) at radius R, with the lattice origin at
  // (0, 0); the board's own offset is added by the caller.
  const hexX = (q, r, R) => R * SQ3 * (q + r / 2);
  const hexY = (q, r, R) => R * 1.5 * r;

  // Pixel back to the nearest axial cell: fractional axial, then cube rounding.
  function pixelToAxial(x, y, R) {
    const rf = (2 / 3) * y / R;
    const qf = (SQ3 / 3 * x - y / 3) / R;
    let cx = qf, cz = rf, cy = -cx - cz;
    let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
    const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return [rx, rz];
  }

  function hexPath(cx, cy, R) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (-90 + 60 * i) * Math.PI / 180;
      const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  // ---------- STATE ----------
  let level = null;         // the generated model from gen.js
  let levelNo = 1;
  let occ = null;           // Uint8Array over board cells
  let owner = null;         // which queue piece owns each cell, -1 empty
  let placedMask = null;    // Uint8Array over queue pieces
  let placedAt = null;      // queue index -> {idx, t}
  let history = [];         // queue indices in placement order, for Undo
  let moves = 0;
  let phase = 'rules';      // 'rules' | 'map' | 'play' | 'win'
  let isDaily = false;      // the date-seeded puzzle, outside the 100
  let lastStars = 0;        // what the level just finished was worth
  let skipped = false;      // this level was bought past, not solved
  let mapScroll = 0;
  const DAILY_TIER = 5;     // tier 6: past the tutorial, inside the derivable band
  let hintsUsed = 0;        // per level, capped
  let completions = 0;      // this session, for the interstitial cadence
  let lastInterstitial = 0;
  const HINT_CAP = 2;
  let drag = null;          // {qi, shape, x, y, grabDX, grabDY, ghost}
  let cardScroll = 0;
  let trayScroll = 0;
  let back = null;          // a refused piece flying home: {qi, x, y, r, t}
  let bursts = [];          // placement sparks: {x, y, R, t}
  let celebrate = null;     // the filled comb's wave of light: {x, y, t}
  let winT0 = 0;            // when the win card opened, for its stars
  let tutor = false;        // the first-drag demonstration is showing
  let tutorT0 = 0;
  let toast = null;         // a one-line notice: {msg, t}
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CELEBRATE_MS = REDUCED ? 0 : 800;
  const BACK_MS = 200;
  const celebrating = () => !!celebrate && performance.now() - celebrate.t < CELEBRATE_MS;
  let seatT = new Map();    // queue index -> when it seated, for the settle
  const L = { hit: {} };    // layout + hit boxes, rebuilt every layout()

  function genLevel(n, opts) {
    const o = opts || {};
    isDaily = !!o.daily;
    levelNo = isDaily ? 0 : Math.max(1, Math.min(LEVELS, n));
    const tier = isDaily ? DAILY_TIER : G.tierOf(levelNo);
    const seed = isDaily ? dailySeed() : levelNo;
    /* The hundred come off the LADDER, not straight from the generator: it is
       built forward so that no level is the one before it repeated, which the
       generator on its own cannot know. The daily has no neighbour and is
       generated directly. */
    level = isDaily ? G.makeLevel(seed, tier) : G.shippedLevel(levelNo);
    // The ladder handles its own retries; only the daily can still come back
    // empty, and it gets the same nudge.
    let bump = 0;
    while (!level && bump < 24) level = G.makeLevel(seed + (++bump) * 7919, tier);
    occ = new Uint8Array(level.n);
    owner = new Int16Array(level.n).fill(-1);
    placedMask = new Uint8Array(level.queue.length);
    placedAt = new Array(level.queue.length).fill(null);
    history = []; moves = 0; drag = null; seatT = new Map(); trayScroll = 0;
    back = null; bursts = []; celebrate = null; toast = null;
    lastStars = 0;
    hintsUsed = 0;
    skipped = false;
    layout();
    T().levelStart(levelNo);
  }

  const remaining = () => level.queue.length - history.length;
  const won = () => { for (let i = 0; i < level.n; i++) if (!occ[i]) return false; return true; };

  /* Can this shape sit at this translation? Returns the covered cell indices
     or null. Every placement in the game goes through here. */
  function tryPlace(shapeId, tq, tr) {
    const cells = level.catalogue[shapeId].cells;
    const idx = [];
    for (const c of cells) {
      const i = level.placements.index.get(G.key(c[0] + tq, c[1] + tr));
      if (i === undefined || occ[i]) return null;
      idx.push(i);
    }
    return idx;
  }

  function seat(qi, tq, tr, now) {
    const idx = tryPlace(level.queue[qi].shape, tq, tr);
    if (!idx) return false;
    for (const i of idx) { occ[i] = 1; owner[i] = qi; }
    placedMask[qi] = 1;
    placedAt[qi] = { idx, t: [tq, tr] };
    history.push(qi);
    const t = now || performance.now();
    seatT.set(qi, t);
    layoutTray();
    moves++;
    tutor = false;
    play('drop');
    let sx = 0, sy = 0;
    for (const i of idx) { sx += cellX(i); sy += cellY(i); }
    const mid = { x: sx / idx.length, y: sy / idx.length };
    if (!REDUCED) {
      bursts.push({ x: mid.x, y: mid.y, R: L.R, t });
      if (bursts.length > 6) bursts.shift();
    }
    if (won()) {
      lastStars = recordWin(levelNo, isDaily, moves, level.par);
      play('win');
      T().levelComplete(levelNo, moves);
      if (portal) portal.gameplayStop();
      /* THE COMB FILLS, THEN THE CARD. A wave of honey light runs out from the
         last cluster across every cell before anything covers the board, so
         solving is seen rather than replaced by a result. Input waits for it.
         The ad, if one is due, still goes before the card, never over it. */
      celebrate = { x: mid.x, y: mid.y, t };
      setTimeout(() => {
        maybeInterstitial(() => {
          phase = 'win'; winT0 = performance.now(); cardScroll = 0;
          if (!REDUCED) for (let i = 0; i < lastStars; i++) setTimeout(() => play('ping'), 240 + i * 140 + 200);
          draw();
        });
      }, CELEBRATE_MS);
    }
    return true;
  }

  function lift(qi) {
    const p = placedAt[qi];
    if (!p) return null;
    for (const i of p.idx) { occ[i] = 0; owner[i] = -1; }
    placedMask[qi] = 0; placedAt[qi] = null;
    const h = history.indexOf(qi);
    if (h >= 0) history.splice(h, 1);
    seatT.delete(qi);
    layoutTray();
    return p;
  }

  function undo() {
    if (!history.length || phase !== 'play') return;
    lift(history[history.length - 1]);
    moves++;               // an undo costs a move, the house rule from Untangle
    play('click');
    draw();
  }

  function restart() {
    if (phase === 'win') return;
    occ.fill(0); owner.fill(-1); placedMask.fill(0);
    placedAt.fill(null); history = []; moves = 0; drag = null; seatT.clear();
    trayScroll = 0; layoutTray();
    T().levelRestart(levelNo);
    play('click');
    draw();
  }

  /* ---------- HINT AND SKIP ----------
     Rewarded on a portal, free here. The owner's call, and it costs nothing:
     zamborin.com was never the revenue channel for this line, and one code
     path is worth more than a few pennies. The button simply carries no ad
     badge where there is no ad to play.

     A hint places the next unplaced piece where the level's own solution puts
     it. If the player has put something else in that space, the hint lifts
     exactly the pieces in the way and returns them to the tray first, which is
     always possible because the solution is what the level was built from. The
     whole thing costs ONE move, not one per lift. */
  function hintPlacement() {
    for (let qi = 0; qi < level.queue.length; qi++) {
      if (placedMask[qi]) continue;
      const p = level.queue[qi];
      const blockers = new Set();
      for (const i of p.idx) if (occ[i] && owner[i] !== qi) blockers.add(owner[i]);
      return { qi, t: p.t, blockers: Array.from(blockers) };
    }
    return null;
  }

  function applyHint() {
    if (phase !== 'play' || hintsUsed >= HINT_CAP) return false;
    const h = hintPlacement();
    if (!h) return false;
    for (const b of h.blockers) lift(b);
    const now = performance.now();
    if (!seat(h.qi, h.t[0], h.t[1], now)) return false;
    hintsUsed++;
    T().hintUsed(isDaily ? 0 : levelNo);
    return true;
  }

  function applySkip() {
    if (phase !== 'play') return false;
    // Lay the level's own solution out, then score it as one star whatever the
    // move counter says.
    occ.fill(0); owner.fill(-1); placedMask.fill(0); placedAt.fill(null);
    history = []; seatT.clear(); drag = null;
    const now = performance.now();
    for (let qi = 0; qi < level.queue.length; qi++) {
      const p = level.queue[qi];
      for (const i of p.idx) { occ[i] = 1; owner[i] = qi; }
      placedMask[qi] = 1; placedAt[qi] = { idx: p.idx, t: p.t };
      history.push(qi); seatT.set(qi, now);
    }
    layoutTray();
    phase = 'win'; cardScroll = 0; winT0 = performance.now(); celebrate = null; tutor = false;
    lastStars = recordWin(levelNo, isDaily, moves, level.par, 1);
    skipped = true;
    play('success');
    T().track('skip_used', { level: isDaily ? 0 : levelNo });
    T().levelComplete(levelNo, moves);
    return true;
  }

  /* Ask the portal, then act on the answer. On zamborin.com `canReward` is
     false and the action simply runs, which is the owner's decision recorded
     as one branch rather than two builds. */
  /* CrazyGames switches ads off for a game in Basic Launch, and every request
     then answers `adsDisabledBasicLaunch`. There is no way to ask before
     requesting one, so the first refusal is how the game finds out, and Skip
     goes for the rest of the session: offered again, it could only fail again. */
  let videosOff = false;

  function withReward(kind, act) {
    const P = window.ZAM_PORTAL;
    if (!P || !P.canReward()) { act(); draw(); return; }
    T().track('rewarded_offered', { kind: kind, level: isDaily ? 0 : levelNo });
    P.rewarded(function () {
      T().track('rewarded_watched', { kind: kind, level: isDaily ? 0 : levelNo });
      act(); draw();
    }, function (reason) {
      /* No finished video, no reward. CrazyGames' ad rules say it in as many
         words ("When our rewarded ad returns with an adError callback, do NOT
         reward the player"), and granting it anyway was an integration breach
         in the build they rejected. The player is told, and Hint stays free,
         which is the alternative to an ad their rules also ask for. */
      if (reason === 'adsDisabledBasicLaunch') videosOff = true;
      toast = { msg: videosOff ? 'Skip is not available yet' : 'No video available right now', t: performance.now() };
      draw();
    });
  }

  /* Interstitials: every third completion, at least two minutes apart, and
     never before level 4. CrazyGames enforces its own cooldown on top of this
     and answers `adCooldown` when it disagrees, which portal.js swallows. */
  function maybeInterstitial(then) {
    completions++;
    const P = window.ZAM_PORTAL;
    const now = Date.now();
    const eligible = P && P.name && !isDaily && levelNo >= 4 &&
                     completions % 3 === 0 && (now - lastInterstitial) > 120000;
    if (!eligible) { then(); return; }
    lastInterstitial = now;
    T().track('interstitial_shown', { level: levelNo });
    P.interstitial(then);
  }

  // ---------- LAYOUT ----------
  function layout() {
    L.hit = {};
    L.ctrlCy = (MODE === 'mobile' && !phoneLayout()) ? LH - 74 : topBand() / 2;
    if (!level) return;

    /* The level's own extent, measured at unit radius from the REAL cells.

       The first version worked from the bounding box in offset coordinates and
       anchored the origin on the corner cell (minC, minR). That corner is
       often not a cell at all, and a hexagon's x depends on its row's PARITY
       as well as its column: odd rows sit half a width to the right. When the
       topmost row was odd but the leftmost cell sat on an even row, the whole
       board was placed half a cell out and the plate hung 17px past the edge
       of the area it was given. boardFit() caught it; nothing else could.

       Measuring the cells directly has no parity in it to get wrong. Measured
       before the frame is divided, because the phone gives the tray only the
       height the board does not need. */
    let rx0 = 1e9, rx1 = -1e9, ry0 = 1e9, ry1 = -1e9;
    for (const k of level.board) {
      const q = G.keyQ(k), r = G.keyR(k);
      const x = hexX(q, r, 1), y = hexY(q, r, 1);
      if (x < rx0) rx0 = x;
      if (x > rx1) rx1 = x;
      if (y < ry0) ry0 = y;
      if (y > ry1) ry1 = y;
    }
    // Full pixel box at unit radius: centre span plus the hexagon's own size.
    const unitW = (rx1 - rx0) + SQ3, unitH = (ry1 - ry0) + 2;
    const PAD = 0.55;
    const ownCols = unitW / SQ3;
    const tierCols = isDaily ? ownCols : Math.max(ownCols, TIER_MAX_COLS[Math.min(TIER_MAX_COLS.length - 1, G.tierOf(levelNo))]);

    /* Which way the tray goes is decided by the frame's shape. See
       `landscape` above for what that fixed. */
    let bx, by, bw, bh;
    if (deskLayout()) {
      const TW = trayW();
      bx = SIDE_PAD; by = topBand();
      bw = LW - SIDE_PAD * 2 - TW - 20;
      bh = LH - DESK_READ_BAND - by;      // the read-out sits under the board
      // The column runs the full height now that Hint and Skip are at the top.
      const ty = topBand() + 6, th = LH - SIDE_PAD - ty;
      const g = deskTrayGrid(TW, th, Math.max(44, LH / 12) * 0.5);
      L.trayBand = { x: LW - SIDE_PAD - TW, y: ty, w: TW, h: th, vertical: true, grid: g };
    } else if (landscape()) {
      const TW = trayW();
      bx = SIDE_PAD; by = topBand();
      bw = LW - SIDE_PAD * 2 - TW - 20;
      /* On desktop HINT and SKIP sit under the tray column, so the board's
         side of the frame has nothing below it to reserve room for: it runs to
         a bottom margin. Worth 60px of height, which on a 16:9 window is
         where the board's size is decided. A phone held sideways keeps its
         bottom control row and so keeps the reserve. */
      bh = LH - (MODE === 'desktop' ? SIDE_PAD : botBand()) - by;
      // The BAND the tray may occupy, not the panel. The panel is sized to
      // what it holds, in layoutTray().
      // The bottom reserve already holds HINT and SKIP, so the column simply
      // fills what is left.
      const room = LH - botBand() - topBand() - 12;
      const th = Math.min(room, 150 * 3 + 20);
      L.trayBand = { x: LW - SIDE_PAD - TW, y: topBand() + 6 + (room - th) / 2,
                     w: TW, h: th, vertical: true };
    } else if (phoneLayout()) {
      bx = PHONE_PAD; by = topBand();
      bw = LW - PHONE_PAD * 2;
      /* The board first: the size its tier's widest board allows across, and
         the height this level needs at that size. The tray takes what is left,
         and its pieces get smaller before the board does (owner: "make them
         smaller if needed"). */
      const boardR = Math.min(44, bw / ((tierCols + 0.5) * SQ3 + PAD * 2));
      const trayRoom = LH - by - PHONE_LEGEND - 14 - (unitH + PAD * 2) * boardR;
      // The board's radius once a tray of height h has been taken out.
      const boardRWith = (h) => Math.min(boardR, (LH - by - PHONE_LEGEND - 16 - h) / (unitH + PAD * 2));
      const g = phoneTrayGrid(bw, trayRoom, boardR, boardRWith);
      const trayTop = LH - PHONE_LEGEND - g.h;
      bh = trayTop - 14 - by;
      L.trayBand = { x: PHONE_PAD, y: trayTop, w: bw, h: g.h, vertical: false, grid: g };
    } else {
      bx = SIDE_PAD; by = topBand();
      bw = LW - SIDE_PAD * 2;
      bh = LH - botBand() - TRAY_H - 14 - by;
      L.trayBand = { x: SIDE_PAD, y: LH - botBand() - TRAY_H, w: LW - SIDE_PAD * 2, h: TRAY_H, vertical: false };
    }
    L.boardMid = bx + bw / 2;   // a toast about the whole level centres here

    /* The plate's own padding is part of the fit, not something added after
       it. Fitting the board first and then wrapping a 0.55R plate round it
       overflowed the area by 3px, which boardFit() caught and nothing else
       could have: the plate is derived from the board, so a check that
       measured one against the other would always have passed. */
    /* Two pixels of slack on a phone, where the height binds far more often
       than in the other layouts: the plate rounds its padding outward and a
       height-bound board came out up to 2px past its area on four levels. */
    const fitR = Math.min(bw / (unitW + PAD * 2), (bh - (phoneLayout() ? 2 : 0)) / (unitH + PAD * 2));

    /* THE CELL IS CAPPED BY HOW WIDE A BOARD THE FRAME MUST BE ABLE TO HOLD,
       not by how wide this level happens to be. Owner's call 2026-08-28: on a
       phone the cell should be small enough that a board of PORTRAIT_COLS
       across still fits, which is headroom the generator can spend later
       without the renderer having to change.

       Sized to the level's own extent instead, a four-column outline was
       drawn at 76px across the flats and a nine-column one could not have
       been drawn at all. The cost is that today's narrow boards are drawn
       smaller than they were, because today's levels do not use the width. */
    /* On a phone the cell is sized to the widest board IN THIS TIER, not to
       an 8-column board no level has. Measured over all 100 shipped levels
       (2026-09-15): tier 1 is 5 columns and the widest anywhere is 7.5, so the
       8-column rule drew level 1 at 10% of a 390x844 screen. The owner's
       2026-08-28 reason still holds within a tier: a run of levels keeps one
       cell size and only a new tier changes it. The table is re-derived by
       __comb.tierColsCheck(); the daily, which is outside the ladder, is
       never drawn narrower than its own width. */
    // The landscape cap grows with the window: 44 in the site frame, larger
    // in full screen, where a fixed 44 left the board small in the middle.
    const capR = landscape() ? Math.max(44, LH / 12) : 44;
    const capCols = landscape() ? capR
      : bw / ((tierCols + 0.5) * SQ3 + PAD * 2);
    /* The floor is 8, not 10, and it only ever binds BELOW the smallest frame
       the embed documents. A landscape phone at 568x320 gives the board 106px
       of height, and a six-row outline needs a radius under 10 to fit it: at a
       floor of 10 three levels in a hundred overflowed by 8px. Small and
       legible is the right way to fail there; clipped is not. */
    L.R = Math.max(8, Math.min(capR, capCols, fitR));

    L.ox = bx + (bw - unitW * L.R) / 2 - rx0 * L.R + L.R * SQ3 / 2;
    L.oy = by + (bh - unitH * L.R) / 2 - ry0 * L.R + L.R;

    /* NO PLATE BEHIND THE BOARD, owner's call 2026-08-28. The empty cells
       carry the outline on their own and a panel behind them only boxed in a
       shape whose whole point is being irregular. `L.plate` stays as the
       board's measured extent because boardFit() reports against it; nothing
       draws it. PAD is still part of the fit so the board keeps its breathing
       room inside the area. */
    const padP = Math.round(L.R * PAD);
    L.plate = {
      x: Math.round(L.ox + rx0 * L.R - L.R * SQ3 / 2 - padP),
      y: Math.round(L.oy + ry0 * L.R - L.R - padP),
      w: Math.round(unitW * L.R + padP * 2),
      h: Math.round(unitH * L.R + padP * 2),
    };
    L.area = { x: bx, y: by, w: bw, h: bh };

    layoutTray();
  }

  /* THE PHONE TRAY: every piece at once (owner, 2026-09-16: "I want all the
     game pieces to be visible. Make them smaller if needed"). Rows of three as
     the mockup draws them, four or five across only when that draws the pieces
     bigger in the room the board leaves. One radius for every piece, taken off
     the largest shape in the WHOLE queue, so no piece changes size as others
     are placed, and never more than about half the board's own cell. The width
     of a slot is a hard limit; the height is the room the board leaves, down to
     a floor where a piece is still worth drawing. */
  // No panels (owner: "let them sit on the canvas"), so a row needs no padding
  // of its own; the cell's padding is the room a piece has to sit off-line in.
  const PHONE_ROW_GAP = 8, PHONE_CELL_GAP = 10, PHONE_CELL_PAD = 8;
  const PHONE_TRAY_RMIN = 8;
  function phoneTrayGrid(bw, room, boardR, boardRWith) {
    const n = level.queue.length;
    let maxW = 1, maxH = 1;
    for (const p of level.queue) {
      const sh = level.catalogue[p.shape];
      if (sh.w > maxW) maxW = sh.w;
      if (sh.h > maxH) maxH = sh.h;
    }
    const needW = (maxW + 0.5) * SQ3, needH = maxH * 1.5 + 0.5;
    const innerW = bw;
    let best = null;
    for (let cols = Math.min(3, n); cols <= Math.min(5, n); cols++) {
      const rows = Math.ceil(n / cols);
      const cellW = (innerW - PHONE_CELL_GAP * (cols - 1)) / cols;
      const rW = (cellW - PHONE_CELL_PAD * 2) / needW;
      const rowRoom = (room - PHONE_ROW_GAP * (rows - 1)) / rows - PHONE_CELL_PAD * 2;
      const r = Math.min(rW, Math.max(PHONE_TRAY_RMIN, Math.min(rowRoom / needH, boardR * 0.55)));
      const h = rows * (r * needH + PHONE_CELL_PAD * 2) + PHONE_ROW_GAP * (rows - 1);
      /* THE BOARD DECIDES FIRST. Choosing the biggest pieces kept three across
         on a 320x568 phone, where three rows of pieces at their floor size
         crushed a tall board to the minimum cell (swept 2026-09-16); four
         across is two rows, and the board got the height back. So: the most
         board, then the biggest pieces, then the fewest columns. */
      const bR = boardRWith(h);
      const better = !best || bR > best.bR + 0.5 ||
        (Math.abs(bR - best.bR) <= 0.5 && r > best.r + 0.25);
      if (better) best = { cols, rows, r, cellW, bR };
    }
    const cellH = best.r * needH + PHONE_CELL_PAD * 2;
    return { cols: best.cols, rows: best.rows, r: best.r, cellW: best.cellW, cellH,
             rowGap: PHONE_ROW_GAP, cellGap: PHONE_CELL_GAP, y0: 0, organic: true,
             h: best.rows * cellH + PHONE_ROW_GAP * (best.rows - 1) };
  }

  /* THE DESKTOP COLUMN: every piece at once, with no scrolling (owner,
     2026-09-16). One, two or three across, whichever draws the pieces biggest;
     the height is a hard limit here, because nothing may sit out of view. The
     pieces stay in a tidy column, centred in the height they leave. */
  function deskTrayGrid(w, h, rCap) {
    const n = level.queue.length, CELL_GAP = 10, ROW_GAP = 8, CELL_PAD = 6;
    let maxW = 1, maxH = 1;
    for (const p of level.queue) {
      const sh = level.catalogue[p.shape];
      if (sh.w > maxW) maxW = sh.w;
      if (sh.h > maxH) maxH = sh.h;
    }
    const needW = (maxW + 0.5) * SQ3, needH = maxH * 1.5 + 0.5;
    let best = null;
    for (let cols = 1; cols <= Math.min(3, n); cols++) {
      const rows = Math.ceil(n / cols);
      const cellW = (w - CELL_GAP * (cols - 1)) / cols;
      const rW = (cellW - CELL_PAD * 2) / needW;
      const rH = ((h - ROW_GAP * (rows - 1)) / rows - CELL_PAD * 2) / needH;
      const r = Math.max(4, Math.min(rW, rH, rCap));
      if (!best || r > best.r + 0.25) best = { cols, rows, r, cellW };
    }
    const cellH = best.r * needH + CELL_PAD * 2;
    const gh = best.rows * cellH + ROW_GAP * (best.rows - 1);
    return { cols: best.cols, rows: best.rows, r: best.r, cellW: best.cellW, cellH,
             rowGap: ROW_GAP, cellGap: CELL_GAP, y0: Math.max(0, (h - gh) / 2), organic: false, h: gh };
  }

  /* A slot belongs to its piece for the whole level: its row and column come
     from the piece's place in the queue, and a short last row is centred. A
     piece placed on the board leaves its slot empty rather than letting the
     rest slide along under the player's hand.

     ON A PHONE THE PIECES SIT A LITTLE OFF-LINE (owner, 2026-09-16: "they can
     be arranged a little organically"). Each is nudged within the room its own
     slot leaves around it, by an amount fixed for that piece on that level, so
     the arrangement is loose but never moves and never crosses a neighbour.
     The slot rectangle stays the tap target; `ox`, `oy` say where the piece is
     drawn inside it. */
  function gridSlot(qi, n) {
    if (qi === undefined) return null;
    /* A phone keeps every piece in its own slot, because the thumb is on the
       tray. A desktop column closes up instead: with a mouse nothing slides
       under the hand, and a two-column tray with gaps where placed pieces had
       been looked scattered rather than tidy (framed 2026-09-16). */
    const g = L.tray.grid;
    const k = g.organic ? qi : n, total = g.organic ? level.queue.length : L.remaining.length;
    const row = Math.floor(k / g.cols), col = k % g.cols;
    const inRow = row === g.rows - 1 ? total - g.cols * (g.rows - 1) : g.cols;
    const shift = (g.cols - inRow) * (g.cellW + g.cellGap) / 2;
    const box = { x: L.tray.x + shift + col * (g.cellW + g.cellGap),
                  y: L.tray.y + g.y0 + row * (g.cellH + g.rowGap),
                  w: g.cellW, h: g.cellH, ox: 0, oy: 0 };
    if (g.organic) {
      const sh = level.catalogue[level.queue[qi].shape], R = g.r;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const c of sh.cells) {
        const x = hexX(c[0], c[1], R), y = hexY(c[0], c[1], R);
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      const slackX = Math.max(0, (box.w - (x1 - x0 + R * SQ3)) / 2 - 1);
      const slackY = Math.max(0, (box.h - (y1 - y0 + R * 2)) / 2 - 1);
      let hsh = ((qi + 1) * 2654435761 ^ ((levelNo + (isDaily ? dailySeed() : 0) + 7) * 40503)) >>> 0;
      hsh = Math.imul(hsh ^ (hsh >>> 15), 2246822519) >>> 0;
      const u = ((hsh & 0xffff) / 0xffff) * 2 - 1, v = (((hsh >>> 16) & 0xffff) / 0xffff) * 2 - 1;
      box.ox = u * slackX * 0.85;
      box.oy = v * slackY * 0.85;
    }
    return box;
  }
  // Where a piece is DRAWN in its slot: the slot, moved by the piece's own nudge.
  const drawnBox = (b) => ({ x: b.x + (b.ox || 0), y: b.y + (b.oy || 0), w: b.w, h: b.h });

  /* ONE TRAY, not three slots. Owner's call 2026-08-28: the tray is a single
     scrollable unit holding every piece still to be placed, rather than a
     three-slot window onto a queue.

     This is safe to do, and it is safe because it was measured rather than
     assumed. The gate found tray size is not a difficulty dial at all: greedy
     solves an identical share of levels at traySize 1, 2, 3, 4, 6 and 99, to
     the digit, because it takes the first slot in 92% of placements and a
     wider tray has nothing to change. So showing every piece costs no
     difficulty and removes a piece of book-keeping the player was carrying
     for no reason.

     THIS IS A SEPARATE FUNCTION BECAUSE IT HAS TO RUN ON EVERY PLACEMENT, not
     only on a resize. Folded into layout() it ran when the level loaded and
     never again, so a piece seated on the board went on being drawn in the
     tray as well: the sizing depends on WHICH pieces are left, so it cannot
     live anywhere the set of remaining pieces is not current. */
  function layoutTray() {
    if (!level || !L.trayBand) return;
    const PADT = 12, GAPT = 10;
    const band = L.trayBand;
    L.tray = { x: band.x, y: band.y, w: band.w, h: band.h, vertical: band.vertical, grid: band.grid };
    const rem = [];
    for (let i = 0; i < level.queue.length; i++) if (!placedMask[i]) rem.push(i);
    L.remaining = rem;
    if (band.grid) {
      // Nothing scrolls on a phone: every piece already has a slot on screen.
      L.trayR = band.grid.r; L.trayStep = 1; L.trayGap = 0; L.trayPad = 0;
      L.trayContent = 0; L.trayView = 0; L.trayMax = 0; L.trayOffset = 0; trayScroll = 0;
      return;
    }
    if (!rem.length) {
      L.trayR = L.R * 0.5; L.trayStep = 1; L.trayView = 1;
      L.trayContent = 0; L.trayMax = 0; trayScroll = 0;
      L.tray.h = band.vertical ? 0 : L.tray.h;
      L.tray.w = band.vertical ? L.tray.w : 0;
      return;
    }

    /* One radius for every piece in the tray, sized off the largest, so a
       three-cell bar and a six-cell cluster keep their honest relative sizes.

       Measured over the WHOLE queue and not only over what is left, so the
       pieces do not change size as you play. Sized off the remainder, placing
       the biggest piece made every other piece grow. */
    let maxW = 1, maxH = 1;
    for (const p of level.queue) {
      const sh = level.catalogue[p.shape];
      if (sh.w > maxW) maxW = sh.w;
      if (sh.h > maxH) maxH = sh.h;
    }
    const vert = L.tray.vertical;
    const innerW = L.tray.w - PADT * 2, innerH = L.tray.h - PADT * 2;

    /* Aim to show about three pieces at once, but NEVER below TRAY_RMIN. A
       short landscape frame — the 446x339 the pane hands you, or the 480x360
       the embed supports — gives the tray column about 120px, and dividing
       that three ways drew the pieces at 11px across. A piece you cannot read
       is not a piece. Below the floor the tray shows fewer and scrolls, which
       is what the scroll indicator is for. */
    const TRAY_RMIN = 14;
    const along = vert ? innerH : innerW;
    const across = vert ? innerW : innerH;
    const needAcross = vert ? (maxW + 0.5) * SQ3 : (maxH * 1.5 + 0.5);
    const needAlong = vert ? (maxH * 1.5 + 0.5) : (maxW + 0.5) * SQ3;
    const forThree = (along / 3 - GAPT) / needAlong;
    /* TRAY_RMIN stops a piece being illegibly small in a band that has room.
       It must never make one TALLER THAN THE BAND: at 568x320 the tray column
       is 94px and the floor produced a 97px piece, so a level's pieces could
       not all be scrolled into view. The floor is a preference; fitting the
       window is not. */
    const fitsWindow = along / needAlong;
    /* EVERY PIECE AT ONCE when they fit at a comfortable size. Sized to show
       three, a four-piece level scrolled its tray in CrazyGames' standard
       907x510 window with the fourth piece cut in half behind a scroll bar,
       which is the first thing a new player would have to work out. Sized off
       the whole queue so pieces keep their size as the tray empties. */
    const nAll = level.queue.length;
    const fitAll = (along - GAPT * (nAll - 1)) / (nAll * needAlong);
    const want = fitAll >= TRAY_RMIN ? fitAll : Math.max(forThree, TRAY_RMIN);
    L.trayR = Math.max(6, Math.min(L.R, across / needAcross, fitsWindow, want));

    /* A SHORT TRAY GETS MORE AIR BETWEEN ITS PIECES. Owner's call 2026-08-28:
       under four pieces, the base gap packs them tighter than the space
       deserves. The radius is deliberately NOT part of this — it is computed
       above from the base gap and the full band, so the pieces keep the size
       they had when the tray was full and only the spacing moves. Taken only
       if the wider content still fits the band: extra air must never be the
       thing that makes a tray scroll. */
    const bandLen = (band.vertical ? band.h : band.w) - PADT * 2;
    const unit = needAlong * L.trayR;
    let gap = GAPT;
    if (rem.length > 1 && rem.length < 4) {
      const wide = GAPT + (4 - rem.length) * 9;
      if (rem.length * unit + (rem.length - 1) * wide <= bandLen) gap = wide;
    }
    L.trayStep = unit + gap;
    // Stored, not re-typed. trayBox() had the base gap written into it as a
    // literal 10, so the moment the gap could vary, every slot was 18px taller
    // than its piece and the last one hung out of the panel.
    L.trayGap = gap;
    L.trayPad = PADT;
    L.trayContent = Math.max(0, rem.length * L.trayStep - gap);

    /* THE PANEL SHRINKS TO WHAT IT HOLDS. Owner's call 2026-08-28: a
       full-height column holding two pieces reads as a tall empty box. It
       still fills the band and scrolls when the pieces overflow it.

       Only along the column, and only in the landscape layout. A horizontal
       strip on a phone that narrowed as pieces were placed would slide its own
       contents sideways under the player's thumb, which the column does not do
       because the control row below it does not move. */
    if (band.vertical) {
      const want = Math.min(band.h, L.trayContent + PADT * 2);
      L.tray.h = want;
      L.tray.y = Math.round(band.y + (band.h - want) / 2);
    }
    L.trayView = (band.vertical ? L.tray.h : L.tray.w) - PADT * 2;
    L.trayMax = Math.max(0, L.trayContent - L.trayView);
    trayScroll = Math.max(0, Math.min(trayScroll, L.trayMax));

    /* Centre the run of pieces when it fits, which on the shrinking column is
       a no-op and on the phone's fixed-width strip is the difference between
       two pieces sitting in the middle and two pieces huddled at the left end
       of a full-width bar. */
    L.trayOffset = L.trayMax > 0 ? 0 : Math.max(0, (L.trayView - L.trayContent) / 2);
  }

  // Where a tray piece sits right now, scroll included. Null when it is
  // scrolled out of sight.
  function trayBox(n) {
    if (L.tray.grid) return gridSlot(L.remaining[n], n);
    const vert = L.tray.vertical;
    const pad = L.trayPad, gap = L.trayGap;
    const a = L.tray[vert ? 'y' : 'x'] + pad + (L.trayOffset || 0) + n * L.trayStep - trayScroll;
    const len = L.trayStep - gap;
    if (a + len < L.tray[vert ? 'y' : 'x'] - 4 ||
        a > L.tray[vert ? 'y' : 'x'] + L.tray[vert ? 'h' : 'w'] + 4) return null;
    return vert
      ? { x: L.tray.x + pad, y: a, w: L.tray.w - pad * 2, h: len }
      : { x: a, y: L.tray.y + pad, w: len, h: L.tray.h - pad * 2 };
  }

  // Where does board cell index i sit on screen?
  const cellX = i => L.ox + hexX(G.keyQ(level.board[i]), G.keyR(level.board[i]), L.R);
  const cellY = i => L.oy + hexY(G.keyQ(level.board[i]), G.keyR(level.board[i]), L.R);

  /* The radius at which a piece fills a box, never larger than the board's. */
  function pieceFit(shape, w, h) {
    const r = Math.min((w - 12) / ((shape.w + 0.5) * SQ3), (h - 12) / (shape.h * 1.5 + 0.5));
    return Math.max(6, Math.min(L.R, r));
  }

  // ---------- DRAWING PIECES ----------
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const m = (v) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))));
    return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
  }

  /* The rim stops at 0.88 R so a dark wall of ground runs between cells, as
     it does in real comb. That wall is what a seated cluster actually touches:
     jewel pieces and amber wax are both mid-tones, and at 0.92 R the wall was
     2px, so the only thing separating a piece from the wax beside it was hue. */
  function drawWaxCell(cx, cy, R) {
    const rim = R * 0.88, cup = R * 0.66;
    // Which way the light falls on THIS cell. See LIGHT.
    const lx = cx - LW * 0.32, ly = cy + LH * 0.5, m = Math.hypot(lx, ly) || 1;
    let dx = LIGHT.x * 0.35 + (lx / m) * 0.65, dy = LIGHT.y * 0.35 + (ly / m) * 0.65;
    const k = Math.hypot(dx, dy) || 1; dx /= k; dy /= k;
    // The rim stands proud, so it is lit on the arc facing the light.
    const g = ctx.createLinearGradient(cx - dx * rim, cy - dy * rim, cx + dx * rim, cy + dy * rim);
    g.addColorStop(0, WAX.rimLit); g.addColorStop(0.5, WAX.rimMid); g.addColorStop(1, WAX.rimDark);
    hexPath(cx, cy, rim); ctx.fillStyle = g; ctx.fill();
    /* The cup is a HOLLOW, so it reads the other way round: the wall under the
       light is the shaded one and the floor opposite catches the light. Lit
       the same way round as the rim, an empty cell reads as a flat ring. */
    const c = ctx.createLinearGradient(cx - dx * cup, cy - dy * cup, cx + dx * cup, cy + dy * cup);
    c.addColorStop(0, WAX.cupDark); c.addColorStop(1, WAX.cupLit);
    hexPath(cx, cy, cup); ctx.fillStyle = c; ctx.fill();
  }

  /* One cell of a seated piece. Full radius, so cells inside a piece tile
     exactly and merge into one mass. The edge is made of value and nothing
     else: a vertical gradient, a light band across the top. No outline. */
  function drawPieceCell(cx, cy, R, col, lift) {
    const g = ctx.createLinearGradient(0, cy - R, 0, cy + R);
    g.addColorStop(0, shade(col, 0.20 + lift * 0.10));
    g.addColorStop(0.55, col);
    g.addColorStop(1, shade(col, -0.22));
    hexPath(cx, cy, R + 0.5); ctx.fillStyle = g; ctx.fill();
    // The light band: the top two facets, up and slightly left, matching the
    // Portal wash. Clipped to the cell so it reads as a lit face, not a shape.
    ctx.save(); hexPath(cx, cy, R); ctx.clip();
    const band = ctx.createLinearGradient(0, cy - R, 0, cy - R * 0.28);
    band.addColorStop(0, 'rgba(255,255,255,0.26)');
    band.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = band; ctx.fillRect(cx - R, cy - R, R * 2, R * 0.8);
    ctx.restore();
  }

  /* The seam. Only the edges BETWEEN two cells of the same piece are drawn, so
     a player can still count cells while the piece's outer boundary stays a
     silhouette. Stroking each hexagon would have outlined the piece, which is
     the thing the design system forbids. */
  function drawSeams(cells, at, R) {
    const inPiece = new Set(cells.map(c => G.key(c[0], c[1])));
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = Math.max(1, R * 0.045);
    ctx.beginPath();
    for (const c of cells) {
      const cx = at.x + hexX(c[0], c[1], R), cy = at.y + hexY(c[0], c[1], R);
      for (let d = 0; d < 6; d++) {
        const dir = G.AX_DIRS[d];
        if (!inPiece.has(G.key(c[0] + dir[0], c[1] + dir[1]))) continue;
        const ang = Math.atan2(hexY(dir[0], dir[1], 1), hexX(dir[0], dir[1], 1));
        if (ang < -0.01 || ang >= Math.PI - 0.01) continue;   // draw each shared edge once
        const ap = R * SQ3 / 2;
        const mx = cx + ap * Math.cos(ang), my = cy + ap * Math.sin(ang);
        const px = -Math.sin(ang) * R / 2, py = Math.cos(ang) * R / 2;
        ctx.moveTo(mx - px, my - py); ctx.lineTo(mx + px, my + py);
      }
    }
    ctx.stroke();
  }

  function drawPieceAt(shape, ax, ay, R, col, lift) {
    for (const c of shape.cells) {
      drawPieceCell(ax + hexX(c[0], c[1], R), ay + hexY(c[0], c[1], R), R, col, lift || 0);
    }
    drawSeams(shape.cells, { x: ax, y: ay }, R);
  }

  // Top-left anchor that centres a shape's own bounding box in a box.
  function shapeAnchor(shape, bx, by, bw, bh, R) {
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const c of shape.cells) {
      const x = hexX(c[0], c[1], R), y = hexY(c[0], c[1], R);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return { x: bx + bw / 2 - (minX + maxX) / 2, y: by + bh / 2 - (minY + maxY) / 2 };
  }

  // ---------- RENDER ----------
  let rafId = 0;
  function draw() { if (!rafId) rafId = requestAnimationFrame(frame); }
  function frame(now) {
    rafId = 0;
    render(now);
    // Keep animating only while something is actually moving.
    if (drag || anySettling(now) || animating(now)) draw();
  }
  function animating(now) {
    return (back && now - back.t < BACK_MS + 260) ||
           bursts.some(b => now - b.t < 460) ||
           (!!celebrate && now - celebrate.t < CELEBRATE_MS + 200) ||
           (phase === 'win' && now - winT0 < 1100) ||
           (tutor && phase === 'play') ||
           (!!toast && now - toast.t < 2400);
  }
  function anySettling(now) {
    for (const t of seatT.values()) if (now - t < 220) return true;
    return false;
  }

  function render(now) {
    ctx.clearRect(0, 0, LW, LH);
    // The Portal wash, exactly: centre at 32% of width on the top edge,
    // radius 1.1 x width, three stops. Do not re-derive it.
    const bg = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
    bg.addColorStop(0, TOK.bgPanel);
    bg.addColorStop(0.6, TOK.bgCard);
    bg.addColorStop(1, TOK.bg);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);
    if (!level) return;

    if (phase === 'map') { drawMap(now); drawHUD(); return; }
    drawBoard(now);
    drawCelebration(now);
    drawTray(now);
    drawHUD();
    drawExtras();
    drawBursts(now);
    drawBack(now);
    if (tutor && phase === 'play' && !drag) drawTutor(now);
    drawToast(now);
    if (drag) drawDrag(now);
    if (phase === 'rules') drawCard('rules', now);
    else if (phase === 'win') drawCard('win', now);
  }

  function shapeMid(shape, R) {
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const c of shape.cells) {
      const x = hexX(c[0], c[1], R), y = hexY(c[0], c[1], R);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  }

  // After the flight home, one short shake in the slot.
  function shakeAt(dt) {
    if (dt < BACK_MS || dt > BACK_MS + 260) return 0;
    const k = (dt - BACK_MS) / 260;
    return Math.sin(k * Math.PI * 4) * (1 - k) * 6;
  }

  function drawBack(now) {
    if (!back || now - back.t >= BACK_MS) return;
    const n = L.remaining.indexOf(back.qi);
    const box = n >= 0 ? trayBox(n) : null;
    if (!box) return;
    const shape = level.catalogue[level.queue[back.qi].shape];
    const hb = drawnBox(box);
    const home = shapeAnchor(shape, hb.x, hb.y, hb.w, hb.h, L.trayR);
    const k = 1 - Math.pow(1 - (now - back.t) / BACK_MS, 3);
    const r = back.r + (L.trayR - back.r) * k;
    const m0 = shapeMid(shape, back.r), m1 = shapeMid(shape, L.trayR), m = shapeMid(shape, r);
    const cx = back.x + m0.x + ((home.x + m1.x) - (back.x + m0.x)) * k;
    const cy = back.y + m0.y + ((home.y + m1.y) - (back.y + m0.y)) * k;
    drawPieceAt(shape, cx - m.x, cy - m.y, r, PIECE[back.qi % PIECE.length], 0);
  }

  // Sparks where a cluster seats: a bright core, no wash (DESIGN-SYSTEM 6).
  function drawBursts(now) {
    for (const b of bursts) {
      const dt = now - b.t;
      if (dt < 0 || dt > 460) continue;
      const k = dt / 460;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#FFE08A';
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + b.x * 0.013;
        const d = b.R * (0.6 + 1.3 * (1 - Math.pow(1 - k, 2)));
        ctx.beginPath();
        ctx.arc(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d - k * b.R * 0.3,
                Math.max(0.5, b.R * 0.09 * (1 - k)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // The comb filling: light runs out from the last cluster across every cell.
  function drawCelebration(now) {
    if (!celebrate) return;
    const dt = now - celebrate.t;
    if (dt < 0 || dt > CELEBRATE_MS + 200) return;
    let far = 1;
    for (let i = 0; i < level.n; i++) far = Math.max(far, Math.hypot(cellX(i) - celebrate.x, cellY(i) - celebrate.y));
    for (let i = 0; i < level.n; i++) {
      const cx = cellX(i), cy = cellY(i);
      const u = (dt - (Math.hypot(cx - celebrate.x, cy - celebrate.y) / far) * CELEBRATE_MS * 0.5) / 380;
      if (u <= 0 || u >= 1) continue;
      const a = Math.sin(Math.PI * u) * 0.55;
      const g = ctx.createRadialGradient(cx, cy - L.R * 0.3, 0, cx, cy, L.R);
      g.addColorStop(0, 'rgba(255, 236, 170, ' + a.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255, 190, 60, ' + (a * 0.6).toFixed(3) + ')');
      hexPath(cx, cy, L.R); ctx.fillStyle = g; ctx.fill();
    }
  }

  /* THE FIRST DRAG, SHOWN. A new player lands in level 1 with no card in the
     way, so the one move the game is made of is demonstrated where it happens:
     the first cluster leaves the tray and sets where the level's own solution
     puts it, with a finger under it held the way a real drag holds a piece.
     It loops until the player takes hold of anything. Drawn, never an emoji.
     With reduced motion it holds still at the end of the carry. */
  const TUTOR_LOOP = 2600;
  function drawTutor(now) {
    const qi = L.remaining[0];
    const box = qi === undefined ? null : trayBox(0);
    if (!box) return;
    const p = level.queue[qi], shape = level.catalogue[p.shape];
    const fb = drawnBox(box);
    const from = shapeAnchor(shape, fb.x, fb.y, fb.w, fb.h, L.trayR);
    const fm = shapeMid(shape, L.trayR), tm = shapeMid(shape, L.R);
    const c0 = { x: from.x + fm.x, y: from.y + fm.y };
    const c1 = { x: L.ox + hexX(p.t[0], p.t[1], L.R) + tm.x, y: L.oy + hexY(p.t[0], p.t[1], L.R) + tm.y };
    const u = REDUCED ? 0.6 : ((now - tutorT0) % TUTOR_LOOP) / TUTOR_LOOP;
    const carry = Math.max(0, Math.min(1, (u - 0.14) / 0.42));
    const e = carry < 0.5 ? 4 * carry * carry * carry : 1 - Math.pow(-2 * carry + 2, 3) / 2;
    const fade = u < 0.74 ? 1 : Math.max(0, 1 - (u - 0.74) / 0.18);
    const r = L.trayR + (L.R - L.trayR) * e;
    const m = shapeMid(shape, r);
    const cx = c0.x + (c1.x - c0.x) * e, cy = c0.y + (c1.y - c0.y) * e;
    ctx.save();
    ctx.globalAlpha = 0.62 * fade;
    drawPieceAt(shape, cx - m.x, cy - m.y, r, PIECE[qi % PIECE.length], 0.4);
    // The finger sits under the piece, as far below it as a real drag lifts it.
    const pressed = u > 0.08 && u < 0.62;
    const fx = cx, fy = cy - liftY() * e;
    ctx.globalAlpha = fade;
    ctx.fillStyle = TOK.tint40;
    ctx.beginPath(); ctx.arc(fx, fy, pressed ? 21 : 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = TOK.ink92;
    ctx.beginPath(); ctx.arc(fx, fy, pressed ? 9 : 11, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // One line of plain words, below the board if there is room, else above.
    ctx.font = '600 16px Inter, sans-serif';
    ctx.fillStyle = TOK.ink90; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const below = L.plate.y + L.plate.h + 18, above = L.plate.y - 16;
    const tx = L.area.x + L.area.w / 2;
    if (below <= L.area.y + L.area.h - 4) ctx.fillText('Drag each cluster into the honeycomb', tx, below);
    else if (above >= L.area.y + 10) ctx.fillText('Drag each cluster into the honeycomb', tx, above);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  function drawToast(now) {
    if (!toast || !L.toast) return;
    const dt = now - toast.t;
    if (dt > 2400) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, dt / 150, (2400 - dt) / 300));
    ctx.font = '600 16px Inter, sans-serif';
    const w = ctx.measureText(toast.msg).width + 36, h = 38;
    // A toast about Skip sits by Skip. One about the whole level goes over the
    // board, under the top band: by the tray it covered the pieces on a phone.
    const y = toast.top ? topBand() + 12 + h / 2 : L.toast.y;
    const x = Math.max(SIDE_PAD + w / 2, Math.min(LW - SIDE_PAD - w / 2, toast.top ? L.boardMid : L.toast.x));
    UI.roundRectPath(ctx, x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fillStyle = TOK.bgCard; ctx.fill();
    ctx.strokeStyle = TOK.tint12; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = TOK.ink90; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(toast.msg, x, y + 1);
    ctx.restore();
  }

  function drawBoard(now) {
    // Empty cells: wax. A lit rim at 0.92 R round a recessed cup, so each
    // reads as a honeycomb cell and the board's outline is the brightest
    // thing on the ground. The old 4.5% white plot measured 1.19:1 there.
    for (let i = 0; i < level.n; i++) {
      if (occ[i]) continue;
      drawWaxCell(cellX(i), cellY(i), L.R);
    }

    // The ghost: where the dragged piece would land. A value wash of the
    // piece's own colour, never a dashed outline.
    if (drag && drag.ghost) {
      const col = PIECE[drag.qi % PIECE.length];
      ctx.save(); ctx.globalAlpha = 0.30;
      for (const i of drag.ghost.idx) drawPieceCell(cellX(i), cellY(i), L.R, col, 0);
      ctx.restore();
    }

    // Seated pieces.
    const seated = [];
    for (const qi of history) {
      if (drag && drag.qi === qi) continue;
      const p = placedAt[qi];
      if (!p) continue;
      const shape = level.catalogue[level.queue[qi].shape];
      const t = seatT.get(qi) || 0;
      const k = Math.min(1, (now - t) / 220);
      seated.push({ qi, shape, pop: 1 + 0.06 * Math.sin(Math.PI * k) * (1 - k),
                    anchor: { x: L.ox + hexX(p.t[0], p.t[1], L.R), y: L.oy + hexY(p.t[0], p.t[1], L.R) } });
    }
    /* TWO PASSES: every shadow, then every piece. A shadow underneath is the
       edge DESIGN-SYSTEM 6 allows instead of an outline, and it gives a seated
       cluster a dark value edge against the wax beside it (jewel pieces and
       wax are both mid-tones). Drawn piece by piece, each cluster's shadow fell
       across the one seated before it, which the owner saw at once ("it
       doesn't look neat", 2026-09-15). Now a shadow only lands on wax and
       ground, because every piece is drawn over every shadow. */
    const withPop = (s, fn) => {
      ctx.save();
      if (s.pop !== 1) { ctx.translate(s.anchor.x, s.anchor.y); ctx.scale(s.pop, s.pop); ctx.translate(-s.anchor.x, -s.anchor.y); }
      fn();
      ctx.restore();
    };
    for (const s of seated) withPop(s, () => {
      ctx.shadowColor = 'rgba(10, 16, 28, 0.62)';
      ctx.shadowBlur = L.R * 0.35; ctx.shadowOffsetY = L.R * 0.10;
      ctx.fillStyle = PIECE[s.qi % PIECE.length];
      for (const c of s.shape.cells) { hexPath(s.anchor.x + hexX(c[0], c[1], L.R), s.anchor.y + hexY(c[0], c[1], L.R), L.R); ctx.fill(); }
    });
    for (const s of seated) withPop(s, () => drawPieceAt(s.shape, s.anchor.x, s.anchor.y, L.R, PIECE[s.qi % PIECE.length], 0));
  }

  function drawTray(now) {
    const t = L.tray, vert = t.vertical;
    // Nothing left to hold: no panel. A zero-height rounded rect with an 18px
    // radius does not degrade into nothing, it degrades into a sliver.
    if (!L.remaining.length) return;

    if (t.grid) {
      // No panel: the pieces sit on the canvas (owner, 2026-09-16).
      for (let n = 0; n < L.remaining.length; n++) {
        const qi = L.remaining[n];
        const box = trayBox(n);
        L.hit['tray' + n] = { ...box, qi };
        if (drag && drag.qi === qi) continue;
        if (back && back.qi === qi && now - back.t < BACK_MS) continue;
        const shape = level.catalogue[level.queue[qi].shape];
        const d = drawnBox(box);
        const a = shapeAnchor(shape, d.x, d.y, d.w, d.h, L.trayR);
        const shake = (back && back.qi === qi && !back.quiet) ? shakeAt(now - back.t) : 0;
        drawPieceAt(shape, a.x + shake, a.y, L.trayR, PIECE[qi % PIECE.length], 0);
      }
      return;
    }

    // The panel. Chrome, so it takes a tint and not an invented hex.
    UI.roundRectPath(ctx, t.x, t.y, t.w, t.h, 18);
    ctx.fillStyle = TOK.tint03; ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.rect(t.x, t.y, t.w, t.h); ctx.clip();
    for (let n = 0; n < L.remaining.length; n++) {
      const qi = L.remaining[n];
      const box = trayBox(n);
      if (!box) continue;
      L.hit['tray' + n] = { ...box, qi };
      if (drag && drag.qi === qi) continue;
      if (back && back.qi === qi && now - back.t < BACK_MS) continue;   // still flying home
      const shape = level.catalogue[level.queue[qi].shape];
      const a = shapeAnchor(shape, box.x, box.y, box.w, box.h, L.trayR);
      const shake = (back && back.qi === qi) ? shakeAt(now - back.t) : 0;
      drawPieceAt(shape, a.x + shake, a.y, L.trayR, PIECE[qi % PIECE.length], 0);
    }
    ctx.restore();

    /* The scroll indicator, and only when there is something to scroll. It is
       the one affordance saying the tray holds more than it shows; without it
       a player has no reason to believe there is anything below the fold. */
    if (L.trayMax > 0.5) {
      const pad = 6, thick = 4;
      const runStart = (vert ? t.y : t.x) + pad;
      const runLen = (vert ? t.h : t.w) - pad * 2;
      const thumbLen = Math.max(24, runLen * (L.trayView / L.trayContent));
      const at = runStart + (runLen - thumbLen) * (trayScroll / L.trayMax);
      const cross = vert ? t.x + t.w - pad - thick : t.y + t.h - pad - thick;
      ctx.fillStyle = TOK.tint10;
      UI.roundRectPath(ctx, vert ? cross : runStart, vert ? runStart : cross,
                       vert ? thick : runLen, vert ? runLen : thick, thick / 2);
      ctx.fill();
      ctx.fillStyle = TOK.tint40;
      UI.roundRectPath(ctx, vert ? cross : at, vert ? at : cross,
                       vert ? thick : thumbLen, vert ? thumbLen : thick, thick / 2);
      ctx.fill();
    }
    void now;
  }

  function drawDrag(now) {
    const shape = level.catalogue[level.queue[drag.qi].shape];
    const col = PIECE[drag.qi % PIECE.length];
    const k = Math.min(1, (now - drag.t0) / 120);
    const r = drag.r0 + (L.R - drag.r0) * k;          // grows to board scale
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 18; ctx.shadowOffsetY = 10;
    drawPieceAt(shape, drag.x, drag.y, r, col, 0.5);
    ctx.restore();
  }

  function drawHUD() {
    const onMap = phase === 'map';
    if (phoneLayout()) { drawPhoneHUD(onMap); return; }

    /* THE MAP BUTTON IS ALWAYS TOP-BAND-LEFT, in both layouts. On desktop that
       is where the control row already lives, so it is simply the first pill
       in it. On a phone the row is at the bottom for thumb reach and the top
       band is otherwise empty, so it sits up there alone.

       It is not in the row on mobile because it does not fit: measured, the
       four existing pills come to 315 of the 330 available on a 390 phone, and
       the smallest possible fifth needs 54. Sizes are house sizes and are
       never scaled, so the button had to go somewhere else rather than the row
       being squeezed. */
    if (!onMap) {
      const b = UI.drawPill(ctx, '', SIDE_PAD + UI.PILL.iconW / 2, topBand() / 2, { w: UI.PILL.iconW });
      drawMapGlyph(SIDE_PAD + UI.PILL.iconW / 2, topBand() / 2);
      L.hit.map = b;
    }

    // Controls: one top band on desktop, the bottom row on a phone. Order is
    // fixed site-wide: sound, Undo, Restart, Rules.
    const cy = L.ctrlCy;
    const items = onMap
      ? [{ key: 'sound', icon: true, w: UI.PILL.iconW }, { key: 'rules', label: 'Rules' }]
      : [{ key: 'sound', icon: true, w: UI.PILL.iconW },
         { key: 'undo', label: 'Undo', dim: history.length === 0 },
         { key: 'restart', label: 'Restart', dim: history.length === 0 },
         { key: 'rules', label: 'Rules' }];
    for (const it of items) it.w = it.w || UI.pillWidth(ctx, it.label);
    const total = items.reduce((a, it) => a + it.w, 0) + UI.PILL.gap * (items.length - 1);
    // On desktop the map button shares the band with the row, so the row
    // starts clear of it.
    const rowLeft = MODE === 'mobile' ? (LW - total) / 2
                                      : SIDE_PAD + (onMap ? 0 : UI.PILL.iconW + UI.PILL.gap);
    let x = rowLeft;
    for (const it of items) {
      const box = UI.drawPill(ctx, it.icon ? '' : it.label, x + it.w / 2, cy, { w: it.w, dim: it.dim });
      if (it.icon) drawSpeaker(x + it.w / 2, cy, sfx ? sfx.isOn() : true);
      L.hit[it.key] = box;
      x += it.w + UI.PILL.gap;
    }

    /* The read-out: one right-aligned line on the band centre. It shrinks into
       whatever the band's left-hand content leaves, with a floor, because the
       two lay out from opposite ends of the same band and nothing else checks. */
    const bandCy = topBand() / 2;
    const rowRight = MODE === 'mobile'
      ? (onMap ? 0 : SIDE_PAD + UI.PILL.iconW)
      : rowLeft + total;
    const avail = (deskLayout() && !onMap && L.area) ? L.area.w : LW - SIDE_PAD - rowRight - 16;
    const txt = onMap
      ? 'DAILY STREAK ' + liveStreak() + '   ·   ' + totalStars() + ' STARS'
      : (isDaily ? 'DAILY' : 'LEVEL ' + levelNo) + '   ·   MOVES ' + moves;
    let hs = Math.max(0.66, Math.min(1, LW / 620));
    ctx.font = '600 ' + (16 * hs).toFixed(1) + 'px Inter, sans-serif';
    while (ctx.measureText(txt).width > avail && hs > 0.66) {
      hs -= 0.02;
      ctx.font = '600 ' + (16 * hs).toFixed(1) + 'px Inter, sans-serif';
    }
    ctx.fillStyle = TOK.ink72;
    if (deskLayout() && !onMap) {
      /* On a desktop level the read-out sits at the bottom left, under the
         board (owner, 2026-09-16), and Hint and Skip take its place at the top
         right. drawExtras() then records Hint's edge for bandFit(). */
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, SIDE_PAD, LH - DESK_READ_BAND / 2);
      L.readoutW = ctx.measureText(txt).width;
      L.deskRead = { x: SIDE_PAD, y: LH - DESK_READ_BAND / 2 - 10, w: L.readoutW, h: 20 };
      L.readoutLeft = LW;
    } else {
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, LW - SIDE_PAD, bandCy);
      L.readoutW = ctx.measureText(txt).width;
      L.readoutLeft = LW - SIDE_PAD - L.readoutW;
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    L.rowRight = rowRight;
  }

  /* THE PHONE'S CONTROLS (owner's notes, 2026-09-16). Every control across the
     top as a round icon button, spread over the width the way the mockup
     draws them. Along the bottom, the level and moves at the left and the sound
     switch, bare, at the right. The map shows the levels and nothing else: no
     controls, no read-out, no title and no daily button (the daily still opens
     itself for a returning player who has not played it today). */
  function drawPhoneHUD(onMap) {
    if (onMap) {
      // Nothing is drawn, so nothing from the play screen may stay tappable.
      L.hit.sound = L.hit.rules = null;
      L.rowRight = 0; L.readoutLeft = LW; L.phoneLegend = null;
      return;
    }
    const D = UI.PILL.iconW, cy = topBand() / 2;   // 44 across: a circle, and the touch target
    const P = window.ZAM_PORTAL;
    const items = [{ key: 'map' },
                   { key: 'undo', dim: history.length === 0 },
                   { key: 'restart', dim: history.length === 0 },
                   { key: 'hint', dim: hintsUsed >= HINT_CAP },
                   ...(videosOff ? [] : [{ key: 'skip', badged: !!(P && P.canReward()) }]),
                   { key: 'rules' }];
    const room = LW - PHONE_PAD * 2;
    const gap = Math.max(4, Math.min(28, (room - items.length * D) / (items.length - 1)));
    let x = PHONE_PAD;
    for (const it of items) {
      const box = drawCircleButton(x + D / 2, cy, D);
      drawGlyph(it.key, x + D / 2, cy, it.dim);
      // The rewarded mark rides the edge of Skip, so every button keeps one size.
      if (it.badged) drawVideoMark(x + D - 6, cy - D / 2 + 3, 20, false);
      L.hit[it.key] = box;
      x += D + gap;
    }

    const ly = LH - PHONE_LEGEND / 2;
    const txt = (isDaily ? 'DAILY' : 'LEVEL ' + levelNo) + '   ·   MOVES ' + moves;
    ctx.font = '600 16px Inter, sans-serif';
    ctx.fillStyle = TOK.ink72; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, PHONE_PAD, ly);
    const tw = ctx.measureText(txt).width;
    // The speaker's drawing runs from 7px left of its centre to 11px right.
    const sx = LW - PHONE_PAD - 11;
    drawSpeaker(sx, ly, sfx ? sfx.isOn() : true);
    // No circle, but still a full-size target.
    L.hit.sound = { x: Math.round(Math.min(LW - 44, sx - 20)), y: Math.round(Math.min(LH - 44, ly - 22)), w: 44, h: 44 };
    L.phoneLegend = { textEnd: PHONE_PAD + tw, sound: L.hit.sound };
    L.rowRight = PHONE_PAD + tw;
    L.readoutLeft = L.hit.sound.x;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // A perfect circle (owner, 2026-09-16), in the house button's fill and border.
  function drawCircleButton(cx, cy, d) {
    ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
    ctx.fillStyle = UI.PILL.fill; ctx.fill();
    ctx.lineWidth = UI.PILL.borderW; ctx.strokeStyle = UI.PILL.border;
    ctx.beginPath(); ctx.arc(cx, cy, d / 2 - UI.PILL.borderW / 2, 0, Math.PI * 2); ctx.stroke();
    return { x: Math.round(cx - d / 2), y: Math.round(cy - d / 2), w: d, h: d };
  }

  // The phone's controls, drawn. No emoji, anywhere, ever.
  function drawGlyph(key, cx, cy, dim) {
    if (key === 'map') { drawMapGlyph(cx, cy); return; }
    if (key === 'sound') { drawSpeaker(cx, cy, sfx ? sfx.isOn() : true); return; }
    const ink = dim ? UI.PILL.textDim : TOK.ink92;
    ctx.save();
    ctx.strokeStyle = ink; ctx.fillStyle = ink;
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const head = (x, y, dx, dy, s) => {           // a filled arrowhead pointing along (dx, dy)
      const nx = -dy, ny = dx;
      ctx.beginPath();
      ctx.moveTo(x + dx * s * 0.75, y + dy * s * 0.75);
      ctx.lineTo(x - dx * s * 0.35 + nx * s * 0.6, y - dy * s * 0.35 + ny * s * 0.6);
      ctx.lineTo(x - dx * s * 0.35 - nx * s * 0.6, y - dy * s * 0.35 - ny * s * 0.6);
      ctx.closePath(); ctx.fill();
    };
    if (key === 'undo') {
      // An arc turning back over the top, arrow at its left end.
      const r = 7, ox = cx + 1, oy = cy + 2, a0 = Math.PI * 0.25, a1 = Math.PI * 1.1;
      ctx.beginPath(); ctx.arc(ox, oy, r, a0, a1, true); ctx.stroke();
      head(ox + r * Math.cos(a1), oy + r * Math.sin(a1), Math.sin(a1), -Math.cos(a1), 5);
    } else if (key === 'restart') {
      // Nearly a full turn, clockwise, arrow at the top.
      const r = 7.5, a0 = -Math.PI * 0.35, a1 = Math.PI * 1.42;
      ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1, false); ctx.stroke();
      head(cx + r * Math.cos(a1), cy + r * Math.sin(a1), -Math.sin(a1), Math.cos(a1), 5);
    } else if (key === 'hint') {
      // A bulb.
      ctx.beginPath(); ctx.arc(cx, cy - 2.5, 6, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 3.2, cy + 5); ctx.lineTo(cx + 3.2, cy + 5);
      ctx.moveTo(cx - 2, cy + 8.2); ctx.lineTo(cx + 2, cy + 8.2);
      ctx.stroke();
    } else if (key === 'skip') {
      // Next: a play triangle against a bar.
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy - 6.5); ctx.lineTo(cx + 3.5, cy); ctx.lineTo(cx - 6, cy + 6.5);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(cx + 4.5, cy - 6.5, 2.6, 13);
    } else if (key === 'rules') {
      ctx.font = '700 19px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', cx, cy + 1);
    }
    ctx.restore();
  }

  /* HINT and SKIP, with their rewarded badge where an ad can actually back
     them. On zamborin.com there is no portal, so there is no badge and the
     buttons simply work. */
  function drawExtras() {
    if (phase !== 'play') { L.hit.hint = L.hit.skip = null; return; }
    // On a phone Hint and Skip are icons in the top row; a toast sits under it.
    if (phoneLayout()) { L.toast = { x: LW / 2, y: topBand() + 26 }; return; }
    const P = window.ZAM_PORTAL;
    const badged = !!(P && P.canReward());   // Skip only: a hint is free
    const cy = MODE === 'mobile' ? LH - 128 : deskLayout() ? topBand() / 2 : LH - 44;
    const hw = UI.pillWidth(ctx, 'Hint');
    const sw = UI.pillWidth(ctx, 'Skip') + (badged ? 38 : 0);
    const gap = 12;
    const rowW = videosOff ? hw : hw + gap + sw;
    let x;
    if (MODE === 'mobile') x = (LW - rowW) / 2;
    else if (deskLayout()) x = LW - SIDE_PAD - rowW;   // the top band's right end
    else x = L.trayBand.x + (L.trayBand.w - rowW) / 2;
    if (deskLayout()) L.readoutLeft = x;              // bandFit: the control row against Hint

    const out = hintsUsed >= HINT_CAP;
    const rowMid = x + rowW / 2;
    L.hit.hint = rewardPill('Hint', x, hw, cy, false, out);
    x += hw + gap;
    L.hit.skip = videosOff ? null : rewardPill('Skip', x, sw, cy, badged, false);
    L.toast = { x: rowMid, y: deskLayout() ? topBand() + 30 : cy - 50 };
  }

  /* A pill whose label and video mark are centred TOGETHER.
     The old version drew the label centred in the padded pill and then put the
     badge near the right edge, so at 'Hint' the two overlapped by about 7px and
     read as one cramped word, "HintAD". Measuring the pair and centring the
     group is what fixes it; nothing here changes the hit box, which is still
     the whole pill. */
  function rewardPill(label, x, w, cy, badged, dim) {
    const box = UI.drawPill(ctx, badged ? '' : label, x + w / 2, cy, { w, dim });
    if (!badged) return box;
    const BW = 22, GAP = 9;
    ctx.font = '700 ' + UI.PILL.font + 'px Inter, sans-serif';
    const lw = ctx.measureText(label).width;
    const lx = x + w / 2 - (lw + GAP + BW) / 2;
    ctx.fillStyle = dim ? UI.PILL.textDim : UI.PILL.text;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, lx, cy + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    drawVideoMark(lx + lw + GAP + BW / 2, cy, BW, dim);
    return box;
  }

  /* The mark is a VIDEO glyph, not the letters AD. CrazyGames' rewarded-ad
     rule asks for "a video icon indicating advertisement requirement", and a
     play triangle in a chip is the mark every portal player already reads that
     way — where "AD" at 10px was both illegible and the wrong promise. Drawn,
     never an emoji. Chrome, so tokens only. */
  function drawVideoMark(cx, cy, w, dim) {
    const h = 16, r = 4.5;
    UI.roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, r);
    ctx.fillStyle = TOK.tint12; ctx.fill();
    const s = 5.4;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.40, cy - s * 0.60);
    ctx.lineTo(cx + s * 0.74, cy);
    ctx.lineTo(cx - s * 0.40, cy + s * 0.60);
    ctx.closePath();
    ctx.fillStyle = dim ? TOK.tint30 : TOK.ink72;
    ctx.fill();
  }

  // Four little cells: the level map, and a way back to it.
  function drawMapGlyph(cx, cy) {
    ctx.save();
    ctx.fillStyle = TOK.ink92;
    const r = 4.6, dx = r * Math.sqrt(3), dy = r * 1.5;
    for (const [ox, oy] of [[-dx / 2, -dy], [dx / 2, -dy], [-dx, dy * 0.15], [0, dy * 0.15], [dx, dy * 0.15]]) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (-90 + 60 * i) * Math.PI / 180;
        const x = cx + ox + r * 0.86 * Math.cos(a), y = cy + oy + r * 0.86 * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // A speaker, drawn. No emoji, anywhere, ever.
  function drawSpeaker(cx, cy, on) {
    ctx.save();
    ctx.strokeStyle = TOK.ink92; ctx.fillStyle = TOK.ink92;
    ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - 3); ctx.lineTo(cx - 3, cy - 3); ctx.lineTo(cx + 1, cy - 7);
    ctx.lineTo(cx + 1, cy + 7); ctx.lineTo(cx - 3, cy + 3); ctx.lineTo(cx - 7, cy + 3);
    ctx.closePath(); ctx.fill();
    if (on) {
      ctx.beginPath(); ctx.arc(cx + 2, cy, 5.5, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 2, cy, 9, -0.85, 0.85); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx + 5, cy - 4); ctx.lineTo(cx + 12, cy + 4);
      ctx.moveTo(cx + 12, cy - 4); ctx.lineTo(cx + 5, cy + 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- THE MAP ----------
     A hundred levels, the daily, and what every one of them is worth. It is
     the first screen a returning player sees rather than something behind a
     menu, because the row of unfinished levels is the whole pull of a
     progression game and a menu hides exactly that. */
  function mapLayout() {
    const phone = phoneLayout();
    const pad = phone ? PHONE_PAD : SIDE_PAD;
    const viewTop = phone ? 16 : topBand() + 6;
    const viewH = Math.max(80, LH - mapBotBand() - viewTop);
    const availW = LW - pad * 2;
    /* 68 rather than 74: on a 390 phone that is five columns of 66 rather
       than four of 82, which halves the scroll without taking the cell below
       the comfortable touch target. mapFit() reports the smallest cell any
       frame produces. */
    const cols = Math.max(4, Math.min(10, Math.round(availW / 68)));
    const cw = availW / cols;
    const ch = Math.max(52, Math.min(84, cw * 0.92));
    const headH = phone ? 0 : 132;           // title, then the two-line daily button; none on a phone
    const rows = Math.ceil(LEVELS / cols);
    const contentH = headH + rows * ch + 12;
    return { pad, viewTop, viewH, availW, cols, cw, ch, headH, rows, contentH,
             scrollMax: Math.max(0, contentH - viewH) };
  }

  const cellRect = (M, i) => ({
    x: M.pad + (i % M.cols) * M.cw + 4,
    y: M.viewTop + M.headH + Math.floor(i / M.cols) * M.ch - mapScroll + 4,
    w: M.cw - 8, h: M.ch - 8,
  });

  /* A five-point star, drawn. No emoji anywhere, ever. */
  function drawStar(cx, cy, r, on) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (-90 + i * 36) * Math.PI / 180;
      const rr = i % 2 ? r * 0.46 : r;
      const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = on ? TOK.accent2 : TOK.tint12;
    ctx.fill();
  }
  // The win card's stars: each socket is always there, and each earned star
  // lands in turn with a small overshoot.
  function drawStarsPop(cx, cy, r, n, gap, dt) {
    for (let i = 0; i < 3; i++) {
      const x = cx + (i - 1) * gap;
      drawStar(x, cy, r, false);
      if (i >= n) continue;
      const d = REDUCED ? 1e9 : dt - (240 + i * 140);
      if (d <= 0) continue;
      const s = d >= 380 ? 1 : (d < 220 ? 1.25 * (d / 220) : 1.25 - 0.25 * ((d - 220) / 160));
      ctx.save(); ctx.translate(x, cy); ctx.scale(s, s);
      drawStar(0, 0, r, true);
      ctx.restore();
    }
  }
  function drawStars(cx, cy, r, n, gap) {
    const g = gap || r * 2.4;
    for (let i = 0; i < 3; i++) drawStar(cx + (i - 1) * g, cy, r, i < n);
  }

  function drawMap(now) {
    const M = mapLayout();
    mapScroll = Math.max(0, Math.min(mapScroll, M.scrollMax));
    L.mapBody = { x: 0, y: M.viewTop, w: LW, h: M.viewH, max: M.scrollMax };

    ctx.save();
    ctx.beginPath(); ctx.rect(0, M.viewTop, LW, M.viewH); ctx.clip();
    let y = M.viewTop - mapScroll;

    // On a phone the map is the levels and nothing else (owner, 2026-09-16).
    if (phoneLayout()) { L.hit.daily = null; L.dailyNote = null; }
    else {
    ctx.fillStyle = TOK.text;
    ctx.font = '800 30px Inter, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('COMB', M.pad, y + 34);

    // The daily. One puzzle a day, the same one for everyone.
    const doneToday = save.daily.date === utcDay();
    const dy = y + 62;
    const dh = 58;
    L.hit.daily = { x: M.pad, y: dy, w: M.availW, h: dh };
    UI.roundRectPath(ctx, M.pad, dy, M.availW, dh, dh / 2);
    ctx.fillStyle = doneToday ? TOK.tint03 : TOK.tint07; ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = doneToday ? TOK.tint12 : TOK.accentText;
    UI.roundRectPath(ctx, M.pad, dy, M.availW, dh, dh / 2); ctx.stroke();
    ctx.fillStyle = doneToday ? TOK.ink72 : TOK.ink92;
    ctx.font = '700 15px Inter, sans-serif';
    ctx.textAlign = 'left';
    // Once done, its stars take the right end of this line, and the long label
    // ran into them on a 320 phone. The dim button and the stars still say done.
    const long = "TODAY'S PUZZLE, DONE";
    const label = doneToday && M.pad + 20 + ctx.measureText(long).width + 12 <= M.pad + M.availW - 65 ? long : "TODAY'S PUZZLE";
    ctx.fillText(label, M.pad + 20, dy + 23);
    if (doneToday) drawStars(M.pad + M.availW - 44, dy + 18, 6, save.daily.stars | 0, 15);
    /* The second line says what makes it the daily. Nothing on screen used to:
       "the same puzzle for everyone" was true and invisible, and the streak it
       now carries was not mentioned anywhere. Measured into the button, so a
       narrow phone gets the short form rather than a clipped sentence. It is
       read, not glanced at, so it keeps the 16px floor. */
    ctx.fillStyle = TOK.ink72;
    ctx.font = '600 16px Inter, sans-serif';
    const roomW = M.availW - 40;
    const lines = doneToday
      ? ['Same for everyone · back tomorrow for your streak', 'Same for everyone · back tomorrow',
         'Back tomorrow for your streak', 'Back tomorrow']
      : ['Same for everyone · keeps your daily streak', 'Same for everyone · keeps your streak', 'Same for everyone'];
    const line = lines.find(t => ctx.measureText(t).width <= roomW) || lines[lines.length - 1];
    ctx.fillText(line, M.pad + 20, dy + 43);
    L.dailyNote = { text: line, w: Math.round(ctx.measureText(line).width), room: Math.round(roomW), label };
    }

    // The hundred.
    for (let i = 0; i < LEVELS; i++) {
      const n = i + 1;
      const r = cellRect(M, i);
      if (r.y + r.h < M.viewTop - 40 || r.y > M.viewTop + M.viewH + 40) continue;
      const open = unlocked(n), st = starsAt(n), next = n === save.max;
      UI.roundRectPath(ctx, r.x, r.y, r.w, r.h, 14);
      ctx.fillStyle = open ? TOK.tint07 : TOK.tint03; ctx.fill();
      if (next) {
        ctx.lineWidth = 2; ctx.strokeStyle = TOK.accentText;
        UI.roundRectPath(ctx, r.x, r.y, r.w, r.h, 14); ctx.stroke();
      }
      ctx.fillStyle = open ? TOK.ink92 : TOK.tint30;
      ctx.font = '700 17px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(n), r.x + r.w / 2, r.y + r.h / 2 - 6);
      if (st > 0) drawStars(r.x + r.w / 2, r.y + r.h - 15, 5, st, 12);
      L.hit['lv' + i] = { ...r, n, open };
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();

    // Edges, so it is obvious there is more.
    if (mapScroll > 1) mapFade(M, true);
    if (mapScroll < M.scrollMax - 1) mapFade(M, false);
    void now;
  }

  function mapFade(M, top) {
    const y = top ? M.viewTop : M.viewTop + M.viewH - 24;
    const g = ctx.createLinearGradient(0, y, 0, y + 24);
    g.addColorStop(top ? 0 : 1, 'rgba(14,23,38,0.92)');
    g.addColorStop(top ? 1 : 0, 'rgba(14,23,38,0)');
    ctx.fillStyle = g; ctx.fillRect(0, y, LW, 24);
  }

  // ---------- CARDS ----------
  /* RULE 1 IS ONE SENTENCE BECAUSE IT IS THE ONE THAT HAS TO BE READ. It used
     to carry the reassurance as well — "...Nothing is timed and there is no way
     to lose." — which made it 123px of the 168px body on a 360-wide phone, so
     the still above it had to be dropped for the rule to be readable at all.
     The reassurance is not a rule and it is not urgent; it sits with the other
     no-penalty line in rule 3, where its length costs nothing because rule 3 is
     below the fold either way. */
  const RULES = [
    'Every cell of the honeycomb has to end up filled.',
    'Drag a cluster out of the tray and onto the board. It seats only where all of its cells land on empty ones.',
    'A cluster that will not fit simply goes back to the tray. Nothing is timed and there is no way to lose.',
    'Pick a seated cluster back up whenever you like. Look for the tightest gap first: usually only one cluster closes it.',
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
      /* THE ART IS SUPPORTING, AND IT WAS EATING THE ZONE IT SUPPORTS. At a
         fixed 104 it took 62% of the 168px body, so a player opening the card
         saw the still and one and a half lines of rule 1 — three of the four
         rules were below the fold on every frame. The fade was drawing
         correctly; there was simply nothing left to read.

         The scroll itself is right and stays: DESIGN-SYSTEM 5.3 says content
         taller than the viewport scrolls and a 20px fade marks the edge, and
         5.4 says the card at 480x360 WILL scroll and that is the point. What
         is out of spec is the art, which is not in the 5.2 zone table at all
         — that zone is "the numbered rules". So the art gives up height, not
         the type (which never shrinks) and not the CTA (which never moves).

         It yields exactly as much as the first rule needs rather than taking a
         fixed number, because the card is 470 wide on a desktop frame and 334
         on a phone, so the same sentence is three lines in one and four in the
         other. A single height that clears the fold on one clips the other.
         56 is the smallest it stays legible at, and BELOW that it is dropped
         rather than shrunk: a 9px illustration is not a smaller picture, it is
         clutter sitting where a sentence should be. So on the short landscape
         frames and on 360-wide-and-under phones — where rule 1 alone wraps to
         123 of the 168 body — the rules get the whole zone. */
      const rule1 = wrapText(RULES[0], pw - 100, 16).length * 22 + 13;
      const room = viewH - rule1;
      if (room >= 56) items.push({ t: 'art', h: Math.min(84, room) });
      for (const r of RULES) {
        const lines = wrapText(r, pw - 100, 16);
        items.push({ t: 'rule', lines, h: lines.length * 22 + 13 });
      }
    } else {
      items.push({ t: 'won', h: 128 });
    }
    let contentH = 0; for (const it of items) contentH += it.h;
    contentH = Math.max(0, contentH - 13);
    return {
      kind, px, py, pw, ph, HEADER, FOOTER, viewTop, viewH, items, contentH,
      scrollMax: Math.max(0, contentH - viewH),
      ctaCy: py + ph - FOOTER + 16 + UI.CTA.h / 2,
      title: kind === 'rules' ? 'COMB' : 'FILLED',
      cta: kind === 'rules' ? 'PLAY'
        : isDaily ? (starsAt(LEVELS) > 0 ? 'MAP' : 'LEVEL ' + save.max)
        : (levelNo >= LEVELS ? 'MAP' : 'NEXT'),
      subtitle: kind === 'rules'
        ? 'Fit the clusters together until no cell is left open.'
        : (lastStars === 3 ? 'Not a move wasted.'
           : lastStars === 2 ? 'Every cell covered, with a little to spare.'
           : 'Every cell is covered. Nothing left over.'),
    };
  }

  function fadeEdge(c, top) {
    const y = top ? c.viewTop : c.viewTop + c.viewH - 20;
    const g = ctx.createLinearGradient(0, y, 0, y + 20);
    g.addColorStop(top ? 0 : 1, TOK.bgCard);
    g.addColorStop(top ? 1 : 0, 'rgba(19,31,54,0)');
    ctx.fillStyle = g; ctx.fillRect(c.px + 1, y, c.pw - 2, 20);
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

    ctx.save();
    ctx.beginPath(); ctx.rect(c.px, c.viewTop, c.pw, c.viewH); ctx.clip();
    let yy = c.viewTop - cardScroll;
    let n = 0;
    for (const it of c.items) {
      if (yy + it.h > c.viewTop - 60 && yy < c.viewTop + c.viewH + 60) {
        if (it.t === 'art') drawCardArt(c.px + 34, yy, c.pw - 68, it.h - 12);
        else if (it.t === 'won') {
          const mid = c.px + c.pw / 2;
          ctx.textAlign = 'center';
          ctx.fillStyle = TOK.ink90; ctx.font = '500 16px Inter, sans-serif';
          ctx.fillText(isDaily ? "Today's puzzle · daily streak " + liveStreak() : 'Level ' + levelNo, mid, yy + 22);
          drawStarsPop(mid, yy + 58, 17, lastStars, 44, now - winT0);
          ctx.fillStyle = TOK.ink82; ctx.font = '600 16px Inter, sans-serif';
          ctx.fillText(moves + (moves === 1 ? ' move' : ' moves') + '   ·   par ' + level.par,
                       mid, yy + 104);
          ctx.textAlign = 'left';
        } else {
          n++;
          ctx.beginPath(); ctx.arc(c.px + 43, yy + 11, 12, 0, Math.PI * 2);
          ctx.fillStyle = TOK.accentText; ctx.fill();
          ctx.fillStyle = TOK.bg; ctx.font = '800 14px Inter, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(n), c.px + 43, yy + 12);
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = TOK.ink90; ctx.font = '500 16px Inter, sans-serif';
          for (let i = 0; i < it.lines.length; i++)
            ctx.fillText(it.lines[i], c.px + 66, yy + 17 + i * 22);
        }
      }
      yy += it.h;
    }
    ctx.restore();
    if (cardScroll > 1) fadeEdge(c, true);
    if (cardScroll < c.scrollMax - 1) fadeEdge(c, false);

    L.hit[kind === 'win' ? 'next' : 'close'] =
      UI.drawCTA(ctx, c.cta, c.px + c.pw / 2, c.ctaCy, TOK.accent);
    ctx.restore();
    void now;
  }

  /* A still, not a loop. Two clusters and the gap between them, at the moment
     one of them is about to close it: the rule is guessable from that, which
     is why the brief says this card does not need a demo. */
  function drawCardArt(x, y, w, h) {
    const r = Math.min(h / 4.4, w / 12);
    const cx = x + w / 2, cy = y + h / 2;
    const empt = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 1], [2, 0], [-1, 2], [0, 2]];
    const ox = cx - hexX(0.5, 1, r), oy = cy - hexY(0, 1, r);
    for (const c of empt) drawWaxCell(ox + hexX(c[0], c[1], r), oy + hexY(c[0], c[1], r), r);
    const a = { cells: [[0, 0], [1, 0], [0, 1]], w: 2, h: 2 };
    for (const c of a.cells) drawPieceCell(ox + hexX(c[0], c[1], r), oy + hexY(c[0], c[1], r), r, PIECE[0], 0);
    drawSeams(a.cells, { x: ox, y: oy }, r);
    const b = { cells: [[-1, 1], [-1, 2], [0, 2]] };
    ctx.save(); ctx.globalAlpha = 0.34;
    for (const c of b.cells) drawPieceCell(ox + hexX(c[0], c[1], r), oy + hexY(c[0], c[1], r), r, PIECE[2], 0);
    ctx.restore();
  }

  // ---------- INPUT ----------
  function toLocal(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX ?? e.changedTouches?.[0]?.clientX) - rect.left) * (LW / rect.width),
      y: ((e.clientY ?? e.changedTouches?.[0]?.clientY) - rect.top) * (LH / rect.height),
    };
  }
  const inBox = (p, b) => b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

  // The piece is held ABOVE the finger, so a thumb never covers the thing it
  // is placing. On a mouse the offset is small; on a phone it is a whole cell.
  const liftY = () => (MODE === 'mobile' ? -Math.max(56, L.R * 1.7) : -Math.max(18, L.R * 0.5));

  function updateDrag(p) {
    drag.x = p.x + drag.grabDX;
    drag.y = p.y + drag.grabDY + liftY();
    // Which lattice cell is the piece's anchor cell nearest to?
    const [q, r] = pixelToAxial(drag.x - L.ox, drag.y - L.oy, L.R);
    const idx = tryPlace(level.queue[drag.qi].shape, q, r);
    drag.ghost = idx ? { idx, t: [q, r] } : null;
  }

  /* A pointer that goes down on a tray piece is ambiguous: it could be a
     pick-up or it could be a scroll. Nothing is decided until the pointer
     moves, and then the direction decides it — ALONG the tray scrolls, ACROSS
     it lifts the piece out.

     That works because the board is always across the tray from the player's
     hand: on desktop the tray is a column on the right and the board is left
     of it, on a phone the tray is a strip at the bottom and the board is
     above. In both, the gesture that takes a piece to the board is
     perpendicular to the one that scrolls, so neither has to be learned. */
  let pending = null, trayPan = null;
  const TRAY_SLOP = 6;

  /* p0 is where the pointer went DOWN, p is where it is now. The grab offset
     has to come from p0: it is the relationship between the finger and the
     piece at the moment it was taken hold of. Computing it from p instead put
     the piece wherever the pointer had already travelled to before the
     six-pixel threshold fired, which on a slow drag is a small jump and on a
     flick is the whole distance. */
  function beginDrag(qi, box, r0, p0, p) {
    const shape = level.catalogue[level.queue[qi].shape];
    const a = shapeAnchor(shape, box.x, box.y, box.w, box.h, r0);
    drag = { qi, from: 'tray', t0: performance.now(), r0,
             grabDX: a.x - p0.x, grabDY: a.y - p0.y - liftY(), x: a.x, y: a.y, ghost: null };
    tutor = false;
    markStarted();
    play('click');
    updateDrag(p);
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (sfx) sfx.ensureAudio();          // browsers only allow audio after a gesture
    const p = toLocal(e);
    // Pieces are only picked up in play. The map is drawn OVER the level just
    // finished, and a tap on it used to lift a hidden piece and put it back,
    // which won that level again: its card came back instead of the level.
    if (phase !== 'play') return;
    if (celebrating()) return;

    // From the tray.
    for (let n = 0; n < L.remaining.length; n++) {
      const hit = L.hit['tray' + n];
      if (!inBox(p, hit)) continue;
      if (L.tray.grid) {
        /* Nothing scrolls on a phone, so there is nothing to wait for: the
           piece is taken up where it lies and grows to board size the moment
           it is touched (owner, 2026-09-16). */
        beginDrag(hit.qi, drawnBox(hit), L.trayR, p, p);
        drag.p0 = p; drag.moved = false;
        canvas.setPointerCapture?.(e.pointerId);
        draw();
        return;
      }
      pending = { qi: hit.qi, box: { x: hit.x, y: hit.y, w: hit.w, h: hit.h }, p0: p };
      canvas.setPointerCapture?.(e.pointerId);
      return;
    }
    // Empty tray space scrolls it, when there is anything to scroll.
    if (inBox(p, L.tray)) {
      if (L.trayMax > 0.5) { trayPan = { p0: p, s0: trayScroll }; canvas.setPointerCapture?.(e.pointerId); }
      return;
    }

    // Or pick a seated piece back up. It leaves the board the moment it is
    // grabbed, so its own cells become a legal place to put it down again.
    const [q, r] = pixelToAxial(p.x - L.ox, p.y - L.oy, L.R);
    const ci = level.placements.index.get(G.key(q, r));
    if (ci !== undefined && occ[ci]) {
      const qi = owner[ci];
      const was = placedAt[qi];
      const anchor = { x: L.ox + hexX(was.t[0], was.t[1], L.R), y: L.oy + hexY(was.t[0], was.t[1], L.R) };
      lift(qi);
      drag = { qi, from: 'board', t0: performance.now(), r0: L.R,
               grabDX: anchor.x - p.x, grabDY: anchor.y - p.y - liftY(), x: anchor.x, y: anchor.y, ghost: null };
      canvas.setPointerCapture?.(e.pointerId);
      play('click');
      updateDrag(p); draw();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (trayPan) {
      e.preventDefault();
      const p = toLocal(e);
      const d = L.tray.vertical ? p.y - trayPan.p0.y : p.x - trayPan.p0.x;
      trayScroll = Math.max(0, Math.min(L.trayMax, trayPan.s0 - d));
      draw();
      return;
    }
    if (!pending) return;
    e.preventDefault();
    const p = toLocal(e);
    const dx = p.x - pending.p0.x, dy = p.y - pending.p0.y;
    if (Math.hypot(dx, dy) < TRAY_SLOP) return;
    const vert = L.tray.vertical;
    const alongD = Math.abs(vert ? dy : dx), acrossD = Math.abs(vert ? dx : dy);
    if (L.trayMax > 0.5 && alongD > acrossD) {
      trayPan = { p0: pending.p0, s0: trayScroll };
      pending = null;
    } else {
      beginDrag(pending.qi, pending.box, L.trayR, pending.p0, p);
      pending = null;
    }
    draw();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    e.preventDefault();
    const pt = toLocal(e);
    if (drag.p0 && !drag.moved && Math.hypot(pt.x - drag.p0.x, pt.y - drag.p0.y) >= TRAY_SLOP) drag.moved = true;
    updateDrag(pt);
    draw();
  });

  function endDrag(e) {
    // A tap that never moved: no pick-up, no scroll, nothing to undo.
    if (pending) { pending = null; canvas.releasePointerCapture?.(e.pointerId); }
    if (trayPan) { trayPan = null; canvas.releasePointerCapture?.(e.pointerId); }
    if (!drag) return;
    const now = performance.now();
    if (drag.ghost) {
      seat(drag.qi, drag.ghost.t[0], drag.ghost.t[1], now);
    } else {
      // A refusal costs nothing, and it goes back VISIBLY: the cluster flies
      // home to its slot and the slot shakes once. It used to vanish on
      // release, with a timestamp set for a flash that nothing ever drew.
      /* A touch on a phone that never moved is not a refusal: the piece that
         grew under the finger simply settles back into its slot, with no
         shake and no sound. */
      const quiet = !!drag.p0 && !drag.moved;
      if (!quiet) play('snag');
      const grown = drag.r0 + (L.R - drag.r0) * Math.min(1, (now - drag.t0) / 120);
      back = REDUCED ? null : { qi: drag.qi, x: drag.x, y: drag.y, r: quiet ? grown : L.R, t: now, quiet };
    }
    drag = null;
    canvas.releasePointerCapture?.(e.pointerId);
    draw();
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // Taps on chrome, the map and the cards.
  let rulesFrom = 'play';
  let started = false;
  // game_start marks the session, not the level, so it fires once on the first
  // transition into play however the player got there.
  function markStarted() { if (!started) { started = true; T().gameStart(); } }

  function openLevel(n, opts) {
    genLevel(n, opts);
    phase = 'play';
    markStarted();
    if (portal) portal.gameplayStart();
    draw();
  }

  canvas.addEventListener('click', (e) => {
    const p = toLocal(e);

    if (phase === 'rules') {
      if (inBox(p, L.hit.close)) {
        phase = rulesFrom;
        /* THE FIRST PLAY OF A SESSION COMES THROUGH HERE, NOT openLevel().
           openLevel() is only reached from the win card and the map, so a
           player who presses PLAY on the rules card and never finishes a level
           used to be invisible to the portal: CrazyGames' QA panel showed
           Gameplay Start unlit, and Load size / Load time never resolved,
           because both are measured up to that event. */
        if (phase === 'play') { markStarted(); if (portal) portal.gameplayStart(); }
        draw();
      }
      return;
    }
    if (phase === 'win') {
      if (inBox(p, L.hit.next)) {
        // After the daily, on to the player's own next level; the map is the
        // top-left button. Only a finished ladder sends it back to the map.
        if (isDaily && starsAt(LEVELS) === 0) { openLevel(save.max); return; }
        if (isDaily || levelNo >= LEVELS) { phase = 'map'; draw(); return; }
        const wasTier = G.tierOf(levelNo);
        openLevel(levelNo + 1);
        if (G.tierOf(levelNo) !== wasTier) play('unlock');
        return;
      }
      if (inBox(p, L.hit.map)) { phase = 'map'; draw(); return; }
      return;
    }

    // Nothing but the comb filling while it fills: a Rules tap here opened the
    // card and the win card replaced it a moment later.
    if (celebrating()) return;
    if (inBox(p, L.hit.sound)) {
      if (sfx) { sfx.setOn(!sfx.isOn()); if (sfx.isOn()) play('click'); }
      draw(); return;
    }
    if (inBox(p, L.hit.rules)) {
      // Opening the rules mid-level is a break, and their docs name entering a
      // menu as one. Paired with the start above so the two always balance.
      if (phase === 'play' && portal) portal.gameplayStop();
      rulesFrom = phase; phase = 'rules'; cardScroll = 0; draw(); return;
    }

    if (phase === 'map') {
      // A drag that scrolled the map is not a tap on whatever it ended over.
      if (mapDragged) { mapDragged = false; return; }
      if (inBox(p, L.hit.daily)) { openLevel(0, { daily: true }); return; }
      for (let i = 0; i < LEVELS; i++) {
        const h = L.hit['lv' + i];
        if (!inBox(p, h)) continue;
        if (!h.open) { play('error'); return; }   // locked, and says so
        openLevel(h.n);
        return;
      }
      return;
    }

    if (inBox(p, L.hit.map)) { phase = 'map'; draw(); return; }
    if (inBox(p, L.hit.undo)) { undo(); return; }
    if (inBox(p, L.hit.restart)) { restart(); return; }
    // A dimmed pill is still clickable, so the guard lives in the handler and
    // the analytics call sits BELOW it.
    if (inBox(p, L.hit.hint)) {
      if (hintsUsed >= HINT_CAP) { play('error'); return; }
      applyHint(); draw();
      return;
    }
    if (inBox(p, L.hit.skip)) { withReward('skip', applySkip); return; }
  });

  // The card body scrolls: wheel, drag and touch. No scrollbar, no arrows.
  canvas.addEventListener('wheel', (e) => {
    if (phase === 'map') {
      if (!L.mapBody || !L.mapBody.max) return;
      e.preventDefault();
      mapScroll = Math.max(0, Math.min(L.mapBody.max, mapScroll + e.deltaY));
      draw();
      return;
    }
    if (phase === 'play' && L.trayMax > 0.5 && inBox(toLocal(e), L.tray)) {
      e.preventDefault();
      trayScroll = Math.max(0, Math.min(L.trayMax, trayScroll + e.deltaY));
      draw();
      return;
    }
    if (phase !== 'rules' && phase !== 'win') return;
    if (!L.cardBody || !L.cardBody.max) return;
    e.preventDefault();
    cardScroll = Math.max(0, Math.min(L.cardBody.max, cardScroll + e.deltaY));
    draw();
  }, { passive: false });

  let cardTouch = null, mapTouch = null, mapDragged = false;
  canvas.addEventListener('pointerdown', (e) => {
    const p = toLocal(e);
    if (phase === 'map') {
      if (L.mapBody && inBox(p, L.mapBody)) { mapTouch = { y: p.y, s: mapScroll }; mapDragged = false; }
      return;
    }
    if (phase !== 'rules' && phase !== 'win') return;
    if (inBox(p, L.cardBody)) cardTouch = { y: p.y, s: cardScroll };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (mapTouch && L.mapBody) {
      e.preventDefault();
      const dy = toLocal(e).y - mapTouch.y;
      if (Math.abs(dy) > 5) mapDragged = true;
      mapScroll = Math.max(0, Math.min(L.mapBody.max, mapTouch.s - dy));
      draw();
      return;
    }
    if (!cardTouch || !L.cardBody) return;
    e.preventDefault();
    cardScroll = Math.max(0, Math.min(L.cardBody.max, cardTouch.s - (toLocal(e).y - cardTouch.y)));
    draw();
  });
  canvas.addEventListener('pointerup', () => { cardTouch = null; mapTouch = null; });

  // ---------- DEBUG ----------
  // Small on purpose. Every handle here is something a future session will
  // actually need: reach a level, prove it is completable, and ask the two
  // questions no check running on a page at rest can answer for itself.
  if (new URLSearchParams(location.search).get('harness') === '1') window.__comb = {
    get state() {
      return { level: levelNo, tier: G.tierOf(levelNo) + 1, phase, moves,
               cells: level.n, par: level.par, placed: history.length,
               empty: level.n - history.reduce((a, qi) => a + placedAt[qi].idx.length, 0),
               R: Math.round(L.R * 10) / 10, mode: MODE, LW, LH };
    },
    goto(n) { genLevel(n); phase = 'play'; draw(); return this.state; },
    // Lay the generated solution out. Proves the level is completable and is
    // the fastest way to reach the win card.
    solve() {
      restart();
      const now = performance.now();
      for (let qi = 0; qi < level.queue.length; qi++) {
        const p = level.queue[qi];
        if (!seat(qi, p.t[0], p.t[1], now)) return { failed: qi, ...this.state };
      }
      draw(); return this.state;
    },
    /* Does the rules card fit, and does anything draw through anything? The
       number that matters is the gap between where the copy stops and where
       the CTA starts. Tested at 480x360, the smallest frame /embed/ supports,
       where the card is 340 tall and the body is 88, so it WILL scroll. */
    rulesFit() {
      const c = cardLayout(phase === 'win' ? 'win' : 'rules');
      const sum = c.HEADER + c.viewH + c.FOOTER;
      /* The card is allowed to scroll — that is the design — but the FIRST
         rule reading complete on open is the thing the art height is derived
         to guarantee, and nothing else here could see it. Without this the
         art could drift back to a fixed number and the only symptom would be
         a sentence cut mid-word, which no `fits` flag reports. */
      const artItem = c.items.find(i => i.t === 'art');
      const art = artItem ? artItem.h : 0;
      const first = c.items.find(i => i.t === 'rule');
      const firstH = first ? first.lines.length * 22 + 13 : 0;
      return {
        artH: art, firstRuleH: firstH,
        // Two separate facts, not one verdict with an escape hatch in it. On a
        // 320-tall landscape frame the body is 48 and the first rule is 101,
        // so no art height can clear it; that is `firstRulePossible` false,
        // and it must not be reported as the art having done its job.
        firstRuleVisible: art + firstH <= c.viewH,
        firstRulePossible: firstH <= c.viewH,
        LW, LH, mode: MODE, kind: c.kind,
        cardH: Math.round(c.ph), frameH: LH,
        headerH: c.HEADER, viewportH: Math.round(c.viewH), footerH: c.FOOTER,
        contentH: Math.round(c.contentH), scrollMax: Math.round(c.scrollMax),
        scrolls: c.scrollMax > 0,
        ctaTop: Math.round(c.ctaCy - UI.CTA.h / 2),
        bodyBottom: Math.round(c.viewTop + c.viewH),
        overlapPx: Math.round(Math.max(0, (c.viewTop + c.viewH) - (c.ctaCy - UI.CTA.h / 2))),
        onCanvas: c.py >= 0 && c.py + c.ph <= LH,
        fits: Math.abs(sum - c.ph) < 0.5 && c.py >= 0 && c.py + c.ph <= LH,
      };
    },
    /* Where everything actually is, in logical canvas coordinates. This exists
       so a test can PRESS THE BUTTONS rather than call the functions behind
       them: every control in Crucible was dead through a full QC pass because
       each check called the game's own code. A test needs coordinates to aim
       at, and inventing them from the layout rules would just be the same
       mistake one level up. */
    hits() {
      render(performance.now());
      const cells = [];
      for (let i = 0; i < level.n; i++) cells.push({ i, x: Math.round(cellX(i)), y: Math.round(cellY(i)), filled: !!occ[i] });
      const tray = [];
      for (let n = 0; n < L.remaining.length; n++) {
        const b = L.hit['tray' + n];
        if (b) tray.push({ n, qi: b.qi, cx: Math.round(b.x + (b.ox || 0) + b.w / 2), cy: Math.round(b.y + (b.oy || 0) + b.h / 2) });
      }
      // On the map, the level cells are the buttons, so they are what a test
      // has to be able to aim at.
      const levels = [];
      if (phase === 'map') {
        for (let i = 0; i < LEVELS; i++) {
          const h = L.hit['lv' + i];
          if (h) levels.push({ n: h.n, open: h.open, stars: starsAt(h.n),
                               cx: Math.round(h.x + h.w / 2), cy: Math.round(h.y + h.h / 2) });
        }
      }
      return {
        mode: MODE, LW, LH, phase, R: L.R, liftY: liftY(),
        controls: { sound: L.hit.sound, undo: L.hit.undo, restart: L.hit.restart,
                    rules: L.hit.rules, map: L.hit.map || null,
                    hint: L.hit.hint || null, skip: L.hit.skip || null },
        tutor, toast: toast ? toast.msg : null,
        cta: L.hit.close || L.hit.next || null,
        daily: L.hit.daily || null,
        levels,
        trayPanel: L.tray, tray, cells,
      };
    },

    /* Can every level actually be reached, and is every cell big enough to
       hit? A hundred cells behind a scroll is exactly the kind of thing that
       looks right in a screenshot and strands level 97 off the bottom. */
    mapFit() {
      const before = { phase, scroll: mapScroll };
      phase = 'map';
      const M = mapLayout();
      let unreachable = 0, smallest = 1e9;
      for (let i = 0; i < LEVELS; i++) {
        mapScroll = Math.max(0, Math.min(M.scrollMax, M.headH + Math.floor(i / M.cols) * M.ch - M.viewH / 2));
        render(performance.now());
        const h = L.hit['lv' + i];
        const inside = h && h.y >= M.viewTop - 1 && h.y + h.h <= M.viewTop + M.viewH + 1;
        if (!inside) unreachable++;
        if (h) smallest = Math.min(smallest, h.w, h.h);
      }
      mapScroll = before.scroll; phase = before.phase;
      render(performance.now());
      return {
        mode: MODE, LW, LH, levels: LEVELS,
        cols: M.cols, cellW: Math.round(M.cw - 8), cellH: Math.round(M.ch - 8),
        smallestSide: Math.round(smallest),
        touchOK: smallest >= 44,
        rowsVisible: Math.floor(M.viewH / M.ch),
        contentH: Math.round(M.contentH), viewH: Math.round(M.viewH),
        scrollMax: Math.round(M.scrollMax),
        unreachable,
        fits: unreachable === 0 && smallest >= 44,
      };
    },

    /* Re-derive TIER_MAX_COLS from the ladder itself, so the table cannot
       drift from the levels it describes. Slow: it builds all 100. */
    tierColsCheck() {
      const got = [];
      for (let n = 1; n <= LEVELS; n++) {
        const lv = G.shippedLevel(n);
        let x0 = 1e9, x1 = -1e9;
        for (const k of lv.board) { const x = hexX(G.keyQ(k), G.keyR(k), 1); if (x < x0) x0 = x; if (x > x1) x1 = x; }
        const t = G.tierOf(n), cols = Math.round(((x1 - x0) / SQ3 + 1) * 2) / 2;
        got[t] = Math.max(got[t] || 0, cols);
      }
      return { table: TIER_MAX_COLS, measured: got, matches: got.every((v, i) => v === TIER_MAX_COLS[i]) };
    },

    /* What the player's record actually says. */
    progress() {
      return { max: save.max, stars: totalStars(), streak: save.streak, liveStreak: liveStreak(),
               dailyStars: save.dailyStars | 0, dailyNote: L.dailyNote || null,
               last: save.last, daily: save.daily,
               perLevel: Object.keys(save.stars).length };
    },

    /* The tray is a scroll region now, so it needs the same treatment the
       rules card got: something that can ask whether every piece is reachable.
       A piece scrolled out of sight with no way to reach it is a level that
       cannot be finished, and no screenshot at rest would show it. */
    trayFit() {
      render(performance.now());
      const boxes = [];
      const before = trayScroll;
      let unreachable = 0;
      for (let n = 0; n < L.remaining.length; n++) {
        // Scroll to where this piece would be and check it lands inside.
        trayScroll = Math.max(0, Math.min(L.trayMax, n * L.trayStep));
        render(performance.now());
        const b = trayBox(n);
        const inside = b && (L.tray.vertical
          ? b.y >= L.tray.y - 1 && b.y + b.h <= L.tray.y + L.tray.h + 1
          : b.x >= L.tray.x - 1 && b.x + b.w <= L.tray.x + L.tray.w + 1);
        if (!inside) unreachable++;
        boxes.push({ n, reachable: !!inside });
      }
      trayScroll = before;
      render(performance.now());
      const step = L.trayStep, view = L.trayView;
      /* `matchesState` exists because of the bug this detector did not catch
         on 2026-08-28: the tray went on drawing pieces that were already
         seated on the board. Every check that ran asked the move counter and
         the placed count, which were both right; nothing asked what the tray
         was DRAWING. A detector for a scroll region has to assert its contents
         as well as its geometry. */
      let unplaced = 0;
      for (let i = 0; i < level.queue.length; i++) if (!placedMask[i]) unplaced++;
      return {
        mode: MODE, vertical: L.tray.vertical,
        pieces: L.remaining.length,
        unplaced, matchesState: L.remaining.length === unplaced,
        trayR: Math.round(L.trayR * 10) / 10,
        pieceFlats: Math.round(L.trayR * SQ3),
        step: Math.round(step), view: Math.round(view),
        content: Math.round(L.trayContent), scrollMax: Math.round(L.trayMax),
        visibleAtOnce: Math.max(1, Math.floor((view + 10) / step)),
        scrolls: L.trayMax > 0.5,
        unreachable,
        fits: unreachable === 0 && L.remaining.length === unplaced,
      };
    },

    /* The control row and the read-out lay out from opposite ends of the same
       band and nothing else in the file checks whether they meet. Orbit's
       collided as soon as the score passed four figures. */
    bandFit() {
      render(performance.now());
      return {
        mode: MODE, LW,
        rowRight: Math.round(L.rowRight), readoutLeft: Math.round(L.readoutLeft),
        gap: Math.round(L.readoutLeft - L.rowRight),
        clear: L.readoutLeft - L.rowRight > 0,
      };
    },
    /* THE PHONE LAYOUT (2026-09-16), measured rather than trusted: the round
       controls inside the top band and clear of each other; the level and
       moves clear of the sound switch at the bottom; and EVERY piece still to
       be placed visible at once, DRAWN (nudge included) inside its own slot,
       clear of every other piece, clear of the board and inside the frame. */
    phoneFit() {
      render(performance.now());
      if (!phoneLayout()) return { phone: false };
      const over = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      const onMap = phase === 'map';
      const top = onMap ? [] : ['map', 'undo', 'restart', 'hint', 'skip', 'rules'].map(k => L.hit[k]).filter(Boolean);
      let controlOverlaps = 0, controlsOutside = 0;
      for (let i = 0; i < top.length; i++) {
        const a = top[i];
        if (a.x < 0 || a.x + a.w > LW || a.y < 0 || a.y + a.h > topBand()) controlsOutside++;
        for (let j = i + 1; j < top.length; j++) if (over(a, top[j])) controlOverlaps++;
      }
      const leg = L.phoneLegend;
      const legendClear = onMap || (!!leg && leg.textEnd + 8 <= leg.sound.x &&
        leg.sound.x >= 0 && leg.sound.x + leg.sound.w <= LW && leg.sound.y + leg.sound.h <= LH);
      const mapClear = !onMap || (!L.hit.sound && !L.hit.rules && !L.hit.daily);
      let hidden = 0, pieceOutsideSlot = 0, pieceOverlaps = 0, outsideTray = 0;
      const drawn = [];
      if (phase === 'play') {
        for (let n = 0; n < L.remaining.length; n++) {
          const b = trayBox(n);
          if (!b) { hidden++; continue; }
          const sh = level.catalogue[level.queue[L.remaining[n]].shape], R = L.trayR;
          const d = drawnBox(b), a = shapeAnchor(sh, d.x, d.y, d.w, d.h, R);
          let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
          for (const c of sh.cells) {
            const cx = a.x + hexX(c[0], c[1], R), cy = a.y + hexY(c[0], c[1], R);
            x0 = Math.min(x0, cx - R * SQ3 / 2); x1 = Math.max(x1, cx + R * SQ3 / 2);
            y0 = Math.min(y0, cy - R); y1 = Math.max(y1, cy + R);
          }
          const pb = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
          if (pb.x < b.x - 0.5 || pb.x + pb.w > b.x + b.w + 0.5 || pb.y < b.y - 0.5 || pb.y + pb.h > b.y + b.h + 0.5) pieceOutsideSlot++;
          if (b.x < L.tray.x - 0.5 || b.x + b.w > L.tray.x + L.tray.w + 0.5 ||
              b.y < L.tray.y - 0.5 || b.y + b.h > L.tray.y + L.tray.h + 0.5) outsideTray++;
          for (const o of drawn) if (over(pb, o)) pieceOverlaps++;
          drawn.push(pb);
        }
      }
      const trayInFrame = L.tray.y >= topBand() && L.tray.y + L.tray.h <= LH - PHONE_LEGEND + 0.5;
      const boardClear = phase !== 'play' || L.plate.y + L.plate.h <= L.tray.y;
      const nudged = phase === 'play' ? L.remaining.filter((_, k) => { const b = trayBox(k); return b && (Math.abs(b.ox) > 1 || Math.abs(b.oy) > 1); }).length : 0;
      return {
        phone: true, LW, LH, phase,
        controls: top.length, controlOverlaps, controlsOutside, legendClear, mapClear,
        pieces: L.remaining.length, hidden, pieceOutsideSlot, pieceOverlaps, outsideTray, nudged,
        cols: L.tray.grid ? L.tray.grid.cols : null, rows: L.tray.grid ? L.tray.grid.rows : null,
        trayR: Math.round(L.trayR * 10) / 10, boardR: Math.round(L.R * 10) / 10,
        trayInFrame, boardClear,
        fits: controlOverlaps === 0 && controlsOutside === 0 && legendClear && mapClear && hidden === 0 &&
              pieceOutsideSlot === 0 && pieceOverlaps === 0 && outsideTray === 0 && trayInFrame && boardClear,
      };
    },

    /* THE DESKTOP FRAME (2026-09-16), measured: Hint and Skip at the top right,
       inside the frame and clear of the control row; the read-out at the bottom
       left, inside the frame and clear of the board; and EVERY piece in the
       column visible at once, with nothing to scroll, each inside its slot and
       inside the column. */
    deskFit() {
      render(performance.now());
      if (!deskLayout()) return { desk: false };
      const over = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      const onMap = phase === 'map';
      const hint = L.hit.hint, skip = L.hit.skip;
      const extras = [hint, skip].filter(Boolean);
      const extrasInBand = extras.every(b => b.x >= 0 && b.x + b.w <= LW && b.y >= 0 && b.y + b.h <= topBand());
      const rowClear = onMap || !hint || L.rowRight + 12 <= hint.x;
      const rd = L.deskRead;
      const readoutClear = onMap || (!!rd && rd.y + rd.h <= LH && rd.x + rd.w <= L.area.x + L.area.w &&
        L.plate.y + L.plate.h <= rd.y + 2);
      let hidden = 0, pieceOutsideSlot = 0, slotOverlaps = 0, outsideColumn = 0;
      const slots = [];
      if (phase === 'play') {
        for (let n = 0; n < L.remaining.length; n++) {
          const b = trayBox(n);
          if (!b) { hidden++; continue; }
          const sh = level.catalogue[level.queue[L.remaining[n]].shape];
          if ((sh.w + 0.5) * SQ3 * L.trayR > b.w + 0.5 || (sh.h * 1.5 + 0.5) * L.trayR > b.h + 0.5) pieceOutsideSlot++;
          if (b.x < L.tray.x - 0.5 || b.x + b.w > L.tray.x + L.tray.w + 0.5 ||
              b.y < L.tray.y - 0.5 || b.y + b.h > L.tray.y + L.tray.h + 0.5 || b.y + b.h > LH) outsideColumn++;
          for (const o of slots) if (over(b, o)) slotOverlaps++;
          slots.push(b);
        }
      }
      return {
        desk: true, LW, LH, phase, extrasInBand, rowClear, readoutClear,
        pieces: L.remaining.length, hidden, pieceOutsideSlot, slotOverlaps, outsideColumn, scrolls: L.trayMax > 0.5,
        cols: L.tray.grid ? L.tray.grid.cols : null, trayR: Math.round(L.trayR * 10) / 10,
        fits: extrasInBand && rowClear && readoutClear && hidden === 0 && pieceOutsideSlot === 0 &&
              slotOverlaps === 0 && outsideColumn === 0 && !(L.trayMax > 0.5),
      };
    },
    /* Does the board fit inside its plate, and is a cell big enough to hit?
       The radius is fitted per level, so this is a different answer on every
       level and on every frame size. */
    boardFit() {
      // Half a hexagon is R*sqrt3/2 ACROSS and R DOWN. Using R for both
      // over-reported the width by 12px a level and would eventually have
      // reported an overflow that was not there.
      const hw = L.R * SQ3 / 2;
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (let i = 0; i < level.n; i++) {
        const x = cellX(i), y = cellY(i);
        if (x - hw < minX) minX = x - hw;
        if (x + hw > maxX) maxX = x + hw;
        if (y - L.R < minY) minY = y - L.R;
        if (y + L.R > maxY) maxY = y + L.R;
      }
      /* Against the AREA the board was given, not against the plate: the
         plate is now derived from the board, so measuring one against the
         other would always pass and report nothing. */
      const p = L.area;
      return {
        level: levelNo, cells: level.n, R: Math.round(L.R * 10) / 10,
        acrossFlats: Math.round(L.R * Math.sqrt(3)),
        boardW: Math.round(maxX - minX), boardH: Math.round(maxY - minY),
        areaX: Math.round(p.x), areaY: Math.round(p.y),
        areaW: Math.round(p.w), areaH: Math.round(p.h),
        plateX: L.plate.x, plateY: L.plate.y, plateW: L.plate.w, plateH: L.plate.h,
        overflowX: Math.round(Math.max(0, p.x - L.plate.x, (L.plate.x + L.plate.w) - (p.x + p.w))),
        overflowY: Math.round(Math.max(0, p.y - L.plate.y, (L.plate.y + L.plate.h) - (p.y + p.h))),
        trayTop: Math.round(L.tray.y),
        boardBottom: Math.round(maxY),
        landscape: landscape(),
        boardClearsTray: landscape() ? true : L.plate.y + L.plate.h <= L.tray.y,
        fits: L.plate.x >= p.x - 1 && L.plate.x + L.plate.w <= p.x + p.w + 1 &&
              L.plate.y >= p.y - 1 && L.plate.y + L.plate.h <= p.y + p.h + 1,
      };
    },
    // The piece palette against the ground it actually sits on. Game art is
    // allowed its own colours; it is not allowed to be invisible.
    contrast() {
      const lum = (c) => {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
      };
      const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
      const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
      // NULL TEST FIRST. White on black must be 21, white on white 1. A colour
      // routine that has not been checked on the answers you already know will
      // report confident, specific, wrong numbers.
      const nullTest = {
        whiteOnBlack: Math.round(ratio([255, 255, 255], [0, 0, 0]) * 100) / 100,
        whiteOnWhite: Math.round(ratio([255, 255, 255], [255, 255, 255]) * 100) / 100,
        greyOnGrey: Math.round(ratio([128, 128, 128], [128, 128, 128]) * 100) / 100,
      };
      /* The grounds a piece actually meets: the three stops of the Portal wash.
         The tray and the walls between cells sit over these, and the wall is
         what a seated cluster touches (see drawWaxCell's 0.88 R). */
      const grounds = { panel: TOK.bgPanel, card: TOK.bgCard, bg: TOK.bg };
      const out = {};
      let worst = Infinity, worstAt = '';
      for (const [gn, gv] of Object.entries(grounds)) {
        out[gn] = PIECE.map((p, i) => {
          const v = Math.round(ratio(rgb(p), rgb(gv)) * 100) / 100;
          if (v < worst) { worst = v; worstAt = p + ' on ' + gn; }
          return { i, hex: p, ratio: v };
        });
      }
      /* THE WAX IS A GRADIENT, so it is swept end to end and not read at one
         stop. Read at the rim's top alone, one blue looked uniquely broken at
         1.03:1; swept, every colour in the old palette and the new one matches
         the wax's lightness somewhere along the rim (measured 2026-09-16).
         Lightness never parted a piece from the wax. The dark wall between
         cells and the seated shadow do, so the wax is reported on its own and
         kept out of passes3to1 rather than failing it forever. */
      const mix = (a, b, t) => rgb(a).map((v, j) => Math.round(v + (rgb(b)[j] - v) * t));
      let waxLowest = Infinity, waxAt = '';
      for (let t = 0; t <= 10; t++) {
        for (const w of [mix(WAX.rimLit, WAX.rimMid, t / 10), mix(WAX.rimMid, WAX.rimDark, t / 10),
                         mix(WAX.cupDark, WAX.cupLit, t / 10)]) {
          for (const p of PIECE) {
            const v = ratio(rgb(p), w);
            if (v < waxLowest) { waxLowest = v; waxAt = p; }
          }
        }
      }
      return { nullTest, worst, worstAt, passes3to1: worst >= 3, byGround: out,
               wax: { lowest: Math.round(waxLowest * 100) / 100, at: waxAt,
                      partedBy: 'the dark wall between cells and the seated shadow' } };
    },
  };

  // ---------- BOOT ----------
  // Every one of these re-fit hooks is part of the pattern, not belt and
  // braces. A strip always means the CSS box and the JS W/H disagree about
  // aspect, and innerWidth can read 0 while this script first runs.
  setCanvasVars();
  resizeCanvas();
  fitFullscreen();
  resizeCanvas();
  const params = new URLSearchParams(location.search);
  const jump = parseInt(params.get('level'), 10);
  if (jump) {
    genLevel(jump); phase = 'play';
  } else if (params.get('daily')) {
    genLevel(0, { daily: true }); phase = 'play';
  } else if (save.max > 1 || totalStars() > 0) {
    /* A returning player lands IN their next level, with the map one tap
       away on the top-left button. It used to open on the map, which
       CrazyGames counts as a menu between the player and the game: their
       standard is to "land new users in gameplay immediately".
       TODAY'S PUZZLE FIRST, until it is done (owner's call 2026-09-15). The
       button on the map was the only way in, so a player could come back
       every day and never see it. Its win card goes on to their own level. */
    const dailyFirst = save.daily.date !== utcDay();
    genLevel(dailyFirst ? 0 : save.max, { daily: dailyFirst }); phase = 'play';
    if (dailyFirst) {
      // Say so when the splash lifts: this is not the level they left.
      const hello = () => {
        if (phase !== 'play' || !isDaily) return;
        const long = "Today's puzzle · same for everyone";
        ctx.font = '600 16px Inter, sans-serif';
        toast = { msg: ctx.measureText(long).width + 36 <= LW - SIDE_PAD * 2 ? long : "Today's puzzle", t: performance.now(), top: true };
        draw();
      };
      if (document.getElementById('splash')) window.addEventListener('splash-done', hello, { once: true });
      else hello();
    }
  } else {
    /* A new player lands in level 1 with no card in the way (owner's call
       2026-09-15). The rules stay one tap away on the Rules pill, and the one
       move the game is made of is shown by the hand. */
    genLevel(1); phase = 'play'; tutor = true; tutorT0 = performance.now();
  }
  /* Landing in a level IS the session's first gameplay. The portal hears it
     when the splash lifts, the first moment a player can act. */
  if (phase === 'play' && portal) {
    if (document.getElementById('splash')) {
      window.addEventListener('splash-done', () => { if (phase === 'play') portal.gameplayStart(); }, { once: true });
    } else portal.gameplayStart();
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', () => draw());
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);   // iOS URL-bar collapse
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  draw();
})();
