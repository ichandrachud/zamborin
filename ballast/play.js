/* ============================================================
   Ballast · A Zamborin Game
   ------------------------------------------------------------
   Drop orbs into a vessel that hangs from a pivot. Two of a size
   that come to rest touching fuse into the next size up. The
   vessel is not bolted down: it tips toward whichever side the
   mass sits on, and a piece that goes over the low rim ends the
   run.

   The solver is in phys.js and is measured on its own by
   tune-m0.mjs. This file is the game on top of it: layout, aim,
   score, and the two screens.
   ============================================================ */
(() => {
  'use strict';

  // ---------- MODE ----------
  // A browser can report a 0-wide viewport on the first frame. The obvious
  // `innerWidth < 768` then reads as a phone, MODE is locked for the session,
  // and a desktop player is left on the phone layout for good. Zero means "not
  // measured yet", so it must not count as narrow.
  const MODE = (matchMedia('(pointer: coarse)').matches ||
                (window.innerWidth > 0 && window.innerWidth < 768))
    ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);

  const PHYSLIB = window.BallastPhys;
  const { World, makeBody, makeRng, resetIds, TIER_R } = PHYSLIB;

  /* The rules live in rules.js, so the page and the headless gate cannot
     drift into being two different games. Only view-side numbers are
     local to this file. */
  const RULES = window.BallastRules;
  const TUNE = RULES.TUNE;
  const VIEW = { GAUGE_DANGER: 0.62 };   // fraction of THETA_MAX where the band turns red

  const STORE_BEST = 'zam.ballast.best';
  const STORE_SEEN = 'zam.ballast.seen';

  // ---------- CANVAS ----------
  // Logical size. Desktop is the ONE site-wide frame; do not invent another.
  // Mobile is the measured viewport, in JS, never CSS dvh: iOS Safari with
  // viewport-fit=cover reports 100dvh smaller than innerHeight and the canvas
  // collapses into a strip.
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

  // ---------- AUDIO ----------
  // The fleet is mixed about 4x too quiet, peaking near -11.7 dBFS. The master
  // gain is opt-in and defaults to 1; set it.
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zam.ballast.sfx', gain: 3.6 }) : null;

  // ---------- BUTTONS ----------
  // Sizes come from here and are NEVER scaled per game. A button is chrome,
  // not content: it should be the same physical size in every game.
  const UI = window.ZAM_UI;

  // ---------- ANALYTICS ----------
  const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){}, levelRestart(){}, hintUsed(){}, track(){} };
  const T = () => (window.ZAM_TRACK || NOOP);
  T().init('ballast');

  /* ---------- COLOUR ----------
     Two different things, and the line between them decides every
     colour question here.

     GAME ART is the playfield: the orbs, the vessel, the ground they
     sit on. It carries its own warm forge palette, deliberately
     unlike the cool calm line, the way Kaleido and Tailwind do.

     CHROME is everything else: HUD, gauge, cards, buttons, all type.
     It takes tokens only, restated here because canvas cannot read a
     CSS variable, with the token name beside each one. */
  /* The GROUND is tokens, not game art. §2: game art may carry its own
     palette but it has to sit on a token ground, and a near-black warm
     brown was an invented hex doing the job of --bg. These three are the
     house ground, identical to Bloom and Prism. The forge stays: it is a
     warm pool of light around the vessel, drawn ON the token ground,
     which is where the warmth belonged all along. */
  const BG_TOP = '#1B2A47';   // --bg-panel
  const BG_MID = '#131F36';   // --bg-card
  const BG_BOT = '#0E1726';   // --bg
  const ART = {
    glow:   'rgba(196,116,48,0.20)',   // the forge pool, over the token ground
    inner:  '#241710',          // the vessel's interior ground
    innerLo:'#1A0F09',
    // The wall and the cords are graphical objects and take the 3:1 floor
    // like anything else. The first pass had them at 1.59:1 and 2.53:1
    // against the page: a vessel you could barely find the edge of.
    metal:  '#907050',          // 3.68:1 on the page ground
    metalHi:'#C09A76',          // 7.04:1
    metalLo:'#7F6046',          // 3.13:1, the darkest point of the gradient
    rimLit: '#FFD9A8',          // the bright edge on the loaded side
    cord:   '#7E6249'           // 3.19:1
  };
  /* Deep red at tier 0 through to white-hot at tier 6, top of the ramp kept
     WARM because a green-tinted white reads sickly. Each tier is a highlight
     and a shadow; the edge is the gradient between them, never a stroke.

     GENERATED, not picked. Every adjacent pair is 1.27:1 apart and tier 0
     clears 3:1 on the lightest part of the ground, which hand-tuning could
     not do: fixing one pair kept breaking its neighbour, because seven steps
     across a bounded luminance range only work if they are evenly spaced in
     log space. Re-derive with the solver rather than nudging a value. */
  const TIER_COL = [
    ['#D54029', '#7C2112'],
    ['#E15E25', '#85310D'],
    ['#EA7C28', '#8D4209'],
    ['#EF9B36', '#945407'],
    ['#F4BA4F', '#9B6605'],
    ['#F4DA91', '#A2790A'],
    ['#FBF5EC', '#BD8524']
  ];
  const TIER_NAME = ['EMBER','COAL','FLAME','BRASS','AMBER','GOLD','STAR'];
  const TOK = {
    text:     '#FFFFFF',              // --text
    dim:      '#C5CFE0',              // --text-dim
    mute:     '#8E9CB5',              // --text-mute
    accent:   '#C24A39',              // --accent, a fill under white type
    accentTx: '#FF6B5C',              // --accent-text, coral AS a mark
    accent2:  '#FFD23F',              // --accent-2
    green:    '#5DD39E',              // --green
    card:     '#131F36',              // --bg-card
    panel:    '#1A2A45',              // --bg-panel
    line:     '#1F2D4A'               // --line
  };

  // ---------- STATE ----------
  const QS = new URLSearchParams(location.search);
  const TUNING = QS.get('tune') === '1';

  let run, world;
  let phase = 'intro';               // intro | playing | over
  let best = 0;
  let aimLocalX = 0;
  let flashes = [];                  // merge sparks
  let shake = 0;

  try { best = parseInt(localStorage.getItem(STORE_BEST) || '0', 10) || 0; } catch (e) { best = 0; }

  function newRun(withSeed) {
    const seed = withSeed != null ? withSeed
      : ((Date.now() ^ (performance.now() * 1000)) >>> 0);
    run = new RULES.Run(seed);
    world = run.world;
    aimLocalX = 0; flashes = []; shake = 0;
    runStart = performance.now();
  }
  let runStart = 0;

  // ============================================================
  // LAYOUT
  // ------------------------------------------------------------
  // The PHYSICS world is fixed: interior 300 x 410, pivot 158 above
  // the rim, the radii from the brief. It is identical in both modes
  // and at every viewport size, so the game cannot be easier on one
  // screen than another. Only the mapping to pixels changes.
  // ============================================================
  const L = {};      // filled by layout()

  /* The house bands, taken from the shipped games rather than invented.
     "Controls on the LEFT" means a horizontal pill row in the TOP band,
     left-aligned; on a phone that same row moves to the bottom and
     centres. The read-out is one right-aligned line in the top band. */
  const sidePad = () => (MODE === 'mobile' ? 18 : 30);
  const topBand = () => (MODE === 'mobile' ? 64 : 56);
  const botBand = () => (MODE === 'mobile' ? 112 : 22);

  /* How much room the vessel needs to SWING in, which is not how wide it
     is. It rotates about a pivot 158 above its own rim, so its bottom
     corner swings out to |150 cos t + 568 sin t|: at 10 degrees that is
     249 units against a resting half-width of 150. Sizing the frame to
     the resting width is what put the vessel through the right-hand
     column. Derived from THETA_MAX so that changing the physics moves
     the layout with it. */
  function sweptExtent() {
    const P = world.P, hw = world.halfW;
    const ped = P.TILT_MODEL === 'pedestal';
    const tm = ped ? P.LAYOUT_THETA : P.THETA_MAX;
    let mx = 0, my = -1e9;
    for (const t of [-tm, 0, tm]) {
      const c = Math.cos(t), s = Math.sin(t);
      const ao = {};
      const save = world.theta; world.theta = t;
      world.anchorOffset(c, s, ao);
      world.theta = save;
      for (const p of [[-hw, world.rimY], [hw, world.rimY], [-hw, world.floorY], [hw, world.floorY]]) {
        const wx = p[0] * c - p[1] * s + ao.x, wy = p[0] * s + p[1] * c + ao.y;
        if (Math.abs(wx) > mx) mx = Math.abs(wx);
        if (wy > my) my = wy;
      }
    }
    if (ped) my = Math.max(my, P.PEDESTAL_Y + 56);   // the dome and its gauge band

    /* The TOP of what is actually drawn, not local y = 0. That origin is a
       leftover from the hanging-pivot frame: the vessel's rim is at 158, so
       reserving from zero held 158 units of empty air above it, and on
       desktop the height is what binds the scale. The claw is the only
       thing up there, so measure it. */
    const rMax = TIER_R[2];                          // the largest droppable tier
    const top = Math.min(0, RULES.TUNE ? (world.rimY - RULES.TUNE.SPAWN_ABOVE_RIM - rMax) - rMax * 2.35 : 0);
    const topY = (world.rimY - RULES.TUNE.SPAWN_ABOVE_RIM - rMax) - rMax * 2.35 - 8;

    return { halfW: mx + 15, top: topY, height: my + 15 };
  }

  function layout() {
    const sw = sweptExtent();
    const SPAN = sw.height - sw.top;   // claw's top down to the lowest swung point
    const WIDE = sw.halfW * 2;
    L.topOff = sw.top;
    L.pad = sidePad(); L.topH = topBand(); L.botH = botBand();

    if (MODE === 'mobile') {
      L.rightW = 0;
      L.nextH = 0;               // the claw is inside SPAN now
      const availW = LW - 22;
      const availH = LH - L.topH - L.nextH - L.botH - 12;
      L.S = Math.min(availW / WIDE, availH / SPAN);
      L.OX = LW / 2;
      // Width binds S on a phone, so there is height to spare: centre the
      // assembly in it rather than hanging it from the top band.
      L.OY = L.topH + L.nextH + Math.max(0, (availH - SPAN * L.S) / 2) - sw.top * L.S;
    } else {
      /* Nothing lives beside the vessel any more, so it takes the whole
         width. That is not an empty gutter: the vessel and its mound grow
         to fill it. */
      L.rightW = 0;
      L.nextH = 0;
      const availW = LW - 56;
      const availH = LH - L.topH - L.nextH - L.botH;
      L.S = Math.min(availW / WIDE, availH / SPAN);
      L.OX = LW / 2;
      L.OY = L.topH + L.nextH + Math.max(0, (availH - SPAN * L.S) / 2) - sw.top * L.S;
    }
    L.floorY = L.OY + SPAN * L.S;
    L.rimYs  = L.OY + 158 * L.S;
    L.buttons = [];               // rebuilt every render, hit-tested on tap
  }

  // world (pivot at the origin) -> screen
  function sx(wx, wy) { return L.OX + wx * L.S; }
  function sy(wx, wy) { return L.OY + wy * L.S; }

  /* Screen x -> the vessel's local x, taken across the rim so the
     answer does not depend on how high up the player is dragging.
     Reading local.x off the touch point directly would swing the aim
     by 150px between a drag at the rim and one at the floor. */
  const _p1 = {}, _p2 = {};
  function aimFromScreenX(px) {
    const c = Math.cos(world.theta), s = Math.sin(world.theta);
    _p1.x = L.OX + (-world.halfW * c - 158 * s) * L.S;
    _p2.x = L.OX + ( world.halfW * c - 158 * s) * L.S;
    const span = _p2.x - _p1.x;
    if (Math.abs(span) < 1) return 0;
    const t = (px - _p1.x) / span;
    return (t * 2 - 1) * world.halfW;
  }

  // ============================================================
  // INPUT
  // ============================================================
  let pointerDown = false, downX = 0, downY = 0, downOnButton = null, moved = false;

  function toLogical(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX ?? e.changedTouches?.[0]?.clientX;
    const cy = e.clientY ?? e.changedTouches?.[0]?.clientY;
    return { x: (cx - rect.left) * (LW / rect.width), y: (cy - rect.top) * (LH / rect.height) };
  }
  function hitButton(p) {
    for (const b of L.buttons) {
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
    }
    return null;
  }
  /* Compare buttons by ID, never by object identity. L.buttons is rebuilt
     from scratch every frame, so the object under the finger at pointerup
     is never the same object that was there at pointerdown, and an
     identity test silently swallows every press. */
  const sameButton = (a, b) => !!a && !!b && a.id === b.id;

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (sfx) sfx.ensureAudio();
    const p = toLogical(e);
    pointerDown = true; downX = p.x; downY = p.y; moved = false;
    downOnButton = hitButton(p);
    if (downOnButton) return;
    if (phase === 'playing') aimLocalX = run.clampAim(aimFromScreenX(p.x));
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointerDown || downOnButton) return;
    const p = toLogical(e);
    if (Math.abs(p.x - downX) > 3 || Math.abs(p.y - downY) > 3) moved = true;
    if (phase === 'playing') aimLocalX = run.clampAim(aimFromScreenX(p.x));
  });

  function endPointer(e) {
    if (!pointerDown) return;
    pointerDown = false;
    const p = toLogical(e);
    const b = hitButton(p);
    if (downOnButton) { if (sameButton(b, downOnButton)) b.act(); downOnButton = null; return; }
    downOnButton = null;
    if (phase === 'playing') {
      aimLocalX = run.clampAim(aimFromScreenX(p.x));
      dropPiece();
    }
  }
  canvas.addEventListener('pointerup', (e) => { e.preventDefault(); endPointer(e); });
  canvas.addEventListener('pointercancel', () => { pointerDown = false; downOnButton = null; });

  window.addEventListener('keydown', (e) => {
    if (phase !== 'playing') {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startRun(); }
      return;
    }
    const step = e.shiftKey ? 24 : 8;
    if (e.key === 'ArrowLeft')  { aimLocalX = run.clampAim(aimLocalX - step); e.preventDefault(); }
    if (e.key === 'ArrowRight') { aimLocalX = run.clampAim(aimLocalX + step); e.preventDefault(); }
    if (e.key === ' ' || e.key === 'ArrowDown' || e.key === 'Enter') { dropPiece(); e.preventDefault(); }
  });

  // ============================================================
  // PLAY
  // ============================================================
  function dropPiece() {
    if (phase !== 'playing') return;
    if (!run.drop(aimLocalX)) return;
    aimLocalX = run.clampAim(aimLocalX);
    if (sfx) sfx.play('drop');
  }

  function endRun(cause) {
    phase = 'over';
    if (run.score > best) {
      best = run.score;
      try { localStorage.setItem(STORE_BEST, String(best)); } catch (e) {}
    }
    if (sfx) sfx.play('fail');
    T().track && T().track('run_end', {
      score: run.score | 0, biggest: run.biggest | 0, cause: cause,
      seconds: Math.round((performance.now() - runStart) / 1000)
    });
  }

  function startRun() {
    newRun();
    phase = 'playing';
    try { localStorage.setItem(STORE_SEEN, '1'); } catch (e) {}
    T().gameStart && T().gameStart();
    if (sfx) sfx.play('start');
  }

  /* A cascade must not be six sounds at full level. Each successive
     merge in the same burst is ducked and pitched up, so six merges
     read as one rising run rather than a pile-up. */
  let burst = 0, burstT = 0;
  function mergeSound(tier) {
    if (!sfx) return;
    burst = burstT > 0 ? Math.min(burst + 1, 7) : 0;
    burstT = 0.45;
    const f = 300 * Math.pow(1.16, tier * 2 + burst);
    sfx.tone(Math.min(f, 2600), 0.075, 0.075 * Math.pow(0.72, burst), 'triangle');
  }

  function update(dt) {
    if (burstT > 0) { burstT -= dt; if (burstT <= 0) burst = 0; }
    if (shake > 0) shake = Math.max(0, shake - dt * 3.2);
    for (let i = flashes.length - 1; i >= 0; i--) {
      flashes[i].t += dt;
      if (flashes[i].t > flashes[i].life) flashes.splice(i, 1);
    }
    if (phase !== 'playing') return;

    const events = run.advance(dt);
    for (const ev of events) {
      if (ev.type === 'clear') {
        shake = 1;
        flashes.push({ x: ev.x, y: ev.y, r: TIER_R[ev.tier] * 2.4, t: 0, life: 0.5, big: true });
        if (sfx) sfx.play('glass');
      } else {
        flashes.push({ x: ev.x, y: ev.y, r: TIER_R[ev.tier] * 1.5, t: 0, life: 0.32, big: false });
        mergeSound(ev.tier);
        if (ev.tier >= 4) shake = Math.max(shake, 0.35);
      }
    }
    if (run.over) endRun(run.cause);
  }

  // ============================================================
  // DRAWING
  // ============================================================
  function roundRect(x, y, w, h, r) { UI.roundRectPath(ctx, x, y, w, h, r); }

  function drawOrb(wx, wy, r, tier, alpha) {
    const X = sx(wx, wy), Y = sy(wx, wy), R = r * L.S;
    const [hi, lo] = TIER_COL[tier];
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    // Body: light from up-left, darkening toward the bottom. No stroke;
    // the edge is the value change, because a cut line reads cartoonish.
    const g = ctx.createRadialGradient(X - R * 0.34, Y - R * 0.40, R * 0.04, X, Y, R);
    g.addColorStop(0, hi); g.addColorStop(0.62, hi); g.addColorStop(1, lo);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(X, Y, R, 0, 6.2832); ctx.fill();
    // Specular: a thin bright core with a tight feather, never a wide wash.
    const s = ctx.createRadialGradient(X - R * 0.36, Y - R * 0.42, 0, X - R * 0.36, Y - R * 0.42, R * 0.52);
    s.addColorStop(0, 'rgba(255,255,255,0.62)');
    s.addColorStop(0.35, 'rgba(255,255,255,0.16)');
    s.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = s;
    ctx.beginPath(); ctx.arc(X, Y, R, 0, 6.2832); ctx.fill();
    // Contact shadow along the lower edge, so the orb sits rather than floats.
    const d = ctx.createRadialGradient(X + R * 0.18, Y + R * 0.30, R * 0.30, X, Y, R);
    d.addColorStop(0, 'rgba(0,0,0,0)');
    d.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = d;
    ctx.beginPath(); ctx.arc(X, Y, R, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* The ground it rocks on. Flat, and drawn unrotated, because the
     bowl now has a CURVED foot and rolls on a flat surface instead of
     perching on a narrow stem. A round base on a flat table cannot slide
     off anything, which is the point: the old drawing showed a flat bowl
     balanced on a point, and at any real tilt that would slide rather
     than turn. */
  function drawGround() {
    const w = world, P = w.P, S = L.S;
    if (P.TILT_MODEL !== 'pedestal') return;
    const R2 = P.GROUND_R;
    const cxw = L.OX, cyw = L.OY + (P.PEDESTAL_Y + R2) * S;   // the dome's centre
    /* Only the crown of the dome is real ground. The bowl's contact point
       travels to about x = 98 at the topple angle and never further, so
       the curve has to BE the true circle out to there or the bowl sinks
       or floats. Past that nothing ever touches it, so it eases off to a
       plain ground line running to the edges: a small mound, not a ball. */
    const TOUCH_X = 98;                 // as far as the contact ever rolls
    const EDGE_DROP = 30;               // where the ground settles either side
    const d1 = R2 - Math.sqrt(R2 * R2 - TOUCH_X * TOUCH_X);
    const s1 = TOUCH_X / Math.sqrt(R2 * R2 - TOUCH_X * TOUCH_X);
    const ctrlX = TOUCH_X + (EDGE_DROP - d1) / s1;
    const halfSpan = (w.halfW + 260);
    const gy = (d) => L.OY + (P.PEDESTAL_Y + d) * S;
    const gxs = (x) => L.OX + x * S;

    // where it is actually resting, which travels as it rolls
    const phi = P.BASE_R * w.theta / (P.BASE_R + R2);
    const conX = L.OX + R2 * S * Math.sin(phi);
    const conY = L.OY + (P.PEDESTAL_Y + R2 - R2 * Math.cos(phi)) * S;
    const sh = ctx.createRadialGradient(conX, conY, 2, conX, conY, 80 * S);
    sh.addColorStop(0, 'rgba(0,0,0,0.5)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath(); ctx.arc(conX, conY, 80 * S, 0, 6.2832); ctx.fill();

    const gg = ctx.createLinearGradient(gxs(-halfSpan), 0, gxs(halfSpan), 0);
    gg.addColorStop(0, 'rgba(138,106,80,0)');
    gg.addColorStop(0.16, ART.metal);
    gg.addColorStop(0.84, ART.metal);
    gg.addColorStop(1, 'rgba(138,106,80,0)');
    ctx.strokeStyle = gg; ctx.lineWidth = Math.max(2, 3.5 * S); ctx.lineCap = 'butt';
    ctx.beginPath();
    /* One quadratic each side, with the control placed where the two
       tangents meet, so the flat run-out leaves the circle at exactly the
       circle's own slope. An intermediate lineTo here puts a visible kink
       at the join. */
    ctx.moveTo(gxs(-halfSpan), gy(EDGE_DROP));
    ctx.quadraticCurveTo(gxs(-ctrlX), gy(EDGE_DROP), gxs(-TOUCH_X), gy(d1));
    for (let i = -TOUCH_X; i <= TOUCH_X; i += 6) {
      ctx.lineTo(gxs(i), gy(R2 - Math.sqrt(R2 * R2 - i * i)));
    }
    ctx.quadraticCurveTo(gxs(ctrlX), gy(EDGE_DROP), gxs(halfSpan), gy(EDGE_DROP));
    ctx.stroke();

    /* The balance read-out lives ON the ground it rocks on. The mound is
       already the thing that decides whether the bowl comes back, so
       colouring it puts the rule in the material rather than in a dial
       somewhere else on screen: green where it rights itself, red where it
       will not. The tick shows where the CURRENT LOAD is headed, so it
       arrives before the lean does, and the vessel's own contact point
       shows where it has actually got to. */
    const domeY = (x) => gy(R2 - Math.sqrt(Math.max(0, R2 * R2 - x * x)));
    const DROP = 13;                 // clear of the vessel, which rests on the crown
    const band = (fromF, toF, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(5, 8 * S); ctx.lineCap = 'butt';
      ctx.beginPath();
      for (let i = 0; i <= 26; i++) {
        const x = domeX(fromF + (toF - fromF) * (i / 26));
        const yy = domeY(x) + DROP * S;
        if (i === 0) ctx.moveTo(gxs(x), yy); else ctx.lineTo(gxs(x), yy);
      }
      ctx.stroke();
    };
    const D = VIEW.GAUGE_DANGER;
    band(-D, D, TOK.green);                       // --green: it rights itself
    band(-1, -D, TOK.accentTx);                   // --accent-text: it does not
    band(D, 1, TOK.accentTx);

    const f = Math.max(-1.1, Math.min(1.1, w.balance.frac));
    const tx = domeX(f);
    ctx.strokeStyle = TOK.text; ctx.lineWidth = Math.max(2, 3 * S); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(gxs(tx), domeY(tx) + (DROP - 8) * S);
    ctx.lineTo(gxs(tx), domeY(tx) + (DROP + 8) * S);
    ctx.stroke();

    if (Math.abs(w.balance.frac) > D) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = TOK.accentTx; ctx.font = '800 11px Inter, sans-serif';
      ctx.fillText(!w.balance.stable ? 'GOING OVER' : (f > 0 ? 'LEANING RIGHT' : 'LEANING LEFT'),
                   L.OX, gy(EDGE_DROP) + 26 * S);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }
  }

  /* Where a balance reading sits along the dome: run the predicted lean
     through the same rolling relation the vessel uses, so the tick and the
     vessel's real contact point are on one scale. */
  function domeX(frac) {
    const P = world.P;
    const th = frac * P.TOPPLE_ANGLE;
    const phi = P.BASE_R * th / (P.BASE_R + P.GROUND_R);
    return P.GROUND_R * Math.sin(phi);
  }

  function drawVessel() {
    const w = world, S = L.S, P = w.P;
    const hw = w.halfW, rim = w.rimY, flo = w.floorY;
    const ped = P.TILT_MODEL === 'pedestal';
    ctx.save();
    ctx.translate(L.OX, L.OY);
    if (ped) {
      /* Take the transform from the PHYSICS rather than restating it. This
         line was still the old edge-pivot formula after the model became a
         rolling one, so the drawn vessel turned about a point the solver
         had stopped using. Asking the solver removes the whole class of
         bug: the picture cannot drift from the maths. */
      const ao = {};
      w.anchorOffset(Math.cos(w.theta), Math.sin(w.theta), ao);
      ctx.translate(ao.x * S, ao.y * S);
    }
    ctx.rotate(w.theta);
    ctx.scale(S, S);

    if (!ped) {
      // the cords from the pivot to the rim corners
      ctx.strokeStyle = ART.cord; ctx.lineWidth = 2 / S; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-hw + 6, rim); ctx.lineTo(0, 6); ctx.lineTo(hw - 6, rim);
      ctx.stroke();
    }

    /* The vessel is ONE solid with two boundaries: a flat inner floor and
       a curved outer underside. Drawing it as a stroked outline that
       followed the OUTSIDE left the space between the two boundaries
       unfilled, so the pieces sat on a floor with nothing beneath it and
       read as floating. It is a U-channel, open at the top, so it closes
       as a single path: down the outside, across the curved base, up the
       outside, over the rim, then back along the inside. */
    const WALL = 7;
    const outer = hw + WALL;
    const arcCy = P.PEDESTAL_Y - P.BASE_R;
    const ax = Math.asin(Math.min(1, outer / P.BASE_R));
    const yEdge = arcCy + Math.cos(ax) * P.BASE_R;
    const innerR = 10;                      // the small radius on the inner floor

    /* No interior fill. The vessel is a drawn container, not a filled box:
       the ground shows through it and the whole thing reads airier, which
       is what the shape wanted. The orbs still clear 3:1 against the page
       ground, so nothing is lost by taking the dark well away. */

    // the body itself, one flat colour
    ctx.fillStyle = ART.metal;
    ctx.beginPath();
    if (ped) {
      ctx.moveTo(-outer, rim);
      ctx.lineTo(-outer, yEdge);
      ctx.arc(0, arcCy, P.BASE_R, Math.PI / 2 + ax, Math.PI / 2 - ax, true);
      ctx.lineTo(outer, rim);
    } else {
      ctx.moveTo(-outer, rim);
      ctx.lineTo(-outer, flo + WALL - 30);
      ctx.quadraticCurveTo(-outer, flo + WALL, -outer + 30, flo + WALL);
      ctx.lineTo(outer - 30, flo + WALL);
      ctx.quadraticCurveTo(outer, flo + WALL, outer, flo + WALL - 30);
      ctx.lineTo(outer, rim);
    }
    ctx.lineTo(hw, rim);
    ctx.lineTo(hw, flo - innerR);
    ctx.quadraticCurveTo(hw, flo, hw - innerR, flo);
    ctx.lineTo(-hw + innerR, flo);
    ctx.quadraticCurveTo(-hw, flo, -hw, flo - innerR);
    ctx.lineTo(-hw, rim);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    if (!ped) {
      // the pivot itself, drawn unrotated: it is the fixed point
      const px = L.OX, py = L.OY;
      const pg = ctx.createRadialGradient(px - 2, py - 3, 0, px, py, 8);
      pg.addColorStop(0, ART.metalHi); pg.addColorStop(1, ART.metalLo);
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(px, py, 7, 0, 6.2832); ctx.fill();
    }
  }

  /* The guide is the piece's real fall line: it starts at the spawn,
     which is in vessel-local space and therefore swings with the
     vessel, and runs straight down the way gravity will actually take
     it. Drawing it parallel to the walls would be a picture of the
     wrong thing. */
  /* The guide marks where the orb is RELEASED and nothing else. It used to
     draw the fall line all the way down and put an arc on the exact orb it
     would land on, which solved the only sum the game asks: the orb falls
     world-vertically from a release point that swings with the leaning
     vessel, so where it ends up is a judgement. Showing the answer made
     aiming a lining-up exercise. */
  /* The guide marks where the orb is RELEASED and nothing else. It used to
     draw the fall line down to the exact orb it would land on, which
     solved the only sum the game asks: the orb falls world-vertically from
     a release point that swings with the leaning vessel, so where it ends
     up is a judgement.

     There is also no separate NEXT preview any more. The claw is holding
     the very orb that is about to drop, so a second copy of it up in a
     band was the same orb twice, joined by a dotted line that read as a
     chain. */
  function drawGuide() {
    if (phase !== 'playing') return;
    const t = run.nextTier, R = TIER_R[t];
    const p = run.spawnPoint(aimLocalX, t);
    drawClaw(sx(p.x, p.y), sy(p.x, p.y), R * L.S, run.cooldown > 0);
    drawOrb(p.x, p.y, R, t, run.cooldown > 0 ? 0.3 : 1);
  }

  /* The claw. Two jaws on a short stem, closed around the orb and springing
     open for a beat after a release. It gives the drop a mechanism instead
     of an orb hovering by itself, and it makes the release point a thing
     you can see rather than the end of a dotted line. */
  function drawClaw(X, Y, r, justDropped) {
    const open = justDropped ? 1 : 0;
    const spread = r * (0.95 + open * 0.85);
    const jaw = r * 1.35, lift = r * 1.05;
    ctx.save();
    ctx.strokeStyle = ART.metalHi; ctx.lineWidth = Math.max(2.5, r * 0.22);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    /* The chain it hangs from, running up out of the top of the frame. The
       claw used to end in a short stub in mid-air; a hoist has to come from
       somewhere, and the chain is the bit that says so. */
    const chainTop = Math.max(L.topH + 2, 0);
    const linkH = Math.max(5, r * 0.34), lw = Math.max(1.6, r * 0.13);
    ctx.lineWidth = lw;
    for (let ly = Y - lift - r * 0.5; ly > chainTop; ly -= linkH) {
      const wide = ((Math.round((Y - lift - ly) / linkH)) % 2) === 0;
      ctx.beginPath();
      ctx.ellipse(X, ly - linkH * 0.5, wide ? linkH * 0.34 : linkH * 0.16,
                  linkH * 0.52, 0, 0, 6.2832);
      ctx.stroke();
    }
    ctx.lineWidth = Math.max(2.5, r * 0.22);
    ctx.beginPath(); ctx.moveTo(X, Y - lift - r * 0.6); ctx.lineTo(X, Y - lift); ctx.stroke();
    // the crossbar
    ctx.beginPath();
    ctx.moveTo(X - spread * 0.6, Y - lift);
    ctx.lineTo(X + spread * 0.6, Y - lift);
    ctx.stroke();
    // two jaws, curling in around the orb and springing open on release
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(X + sgn * spread * 0.6, Y - lift);
      ctx.quadraticCurveTo(X + sgn * spread * (1.06 + open * 0.3), Y - lift + jaw * 0.5,
                           X + sgn * spread * (0.6 + open * 0.75), Y - lift + jaw);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFlashes() {
    for (const f of flashes) {
      const k = f.t / f.life, X = sx(f.x, f.y), Y = sy(f.x, f.y);
      const R = f.r * L.S * (0.5 + k * 0.9);
      const g = ctx.createRadialGradient(X, Y, R * 0.55, X, Y, R);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.72, f.big ? 'rgba(255,246,224,' + (0.75 * (1 - k)) + ')'
                                 : 'rgba(255,210,140,' + (0.55 * (1 - k)) + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(X, Y, R, 0, 6.2832); ctx.fill();
    }
  }

  // ---------- HUD ----------
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }

  /* A read-out, never a control. It shows where theta sits inside the
     safe band and how much of the danger band is left. */
  function speakerIcon(cx, cy, on) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - 3); ctx.lineTo(cx - 3, cy - 3); ctx.lineTo(cx + 1, cy - 7);
    ctx.lineTo(cx + 1, cy + 7); ctx.lineTo(cx - 3, cy + 3); ctx.lineTo(cx - 7, cy + 3);
    ctx.closePath(); ctx.fill();
    if (on) {
      ctx.beginPath(); ctx.arc(cx + 3, cy, 4.2, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 3, cy, 7.2, -0.9, 0.9); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(cx + 4, cy - 4); ctx.lineTo(cx + 10, cy + 4);
      ctx.moveTo(cx + 10, cy - 4); ctx.lineTo(cx + 4, cy + 4); ctx.stroke();
    }
    ctx.restore();
  }

  function pill(id, label, cx, cy, act, opts) {
    const box = UI.drawPill(ctx, label, cx, cy, opts);
    box.act = act; box.id = id; L.buttons.push(box);
    return box;
  }
  function iconPill(id, cx, cy, draw, act) {
    const box = UI.drawPill(ctx, '', cx, cy, { w: UI.PILL.iconW });
    draw(box.x + box.w / 2, box.y + box.h / 2);
    box.act = act; box.id = id; L.buttons.push(box);
    return box;
  }

  function drawControls() {
    /* Top-left on desktop, bottom and centred on a phone where a thumb can
       reach. Same row, same order, same ZAM_UI sizes, exactly as Sluice
       and Prism place theirs. */
    const soundOn = sfx ? sfx.isOn() : false;
    const cy = MODE === 'mobile' ? LH - 74 : Math.round(L.topH / 2);
    const labels = ['Restart', 'Rules'];
    ctx.font = '700 ' + UI.PILL.font + 'px Inter, sans-serif';
    const tw = labels.map(l => ctx.measureText(l).width);
    const wS = UI.PILL.iconW;
    // Tighten padding rather than type or height when the row is close: a
    // smaller pill costs a tap target, tighter padding costs only air.
    const roomy = wS + tw.reduce((a, b) => a + Math.round(b + 36), 0) + 12 * 2 <= LW - 20;
    const pad = roomy ? UI.PILL.padX : 26, gap = roomy ? 12 : 10;
    const w = tw.map(t => Math.round(t + pad));
    const total = wS + w[0] + w[1] + gap * 2;
    let x = MODE === 'mobile' ? Math.round(LW / 2 - total / 2) : L.pad;

    iconPill('mute', x + wS / 2, cy, (ix, iy) => speakerIcon(ix, iy, soundOn),
             () => { if (sfx) { sfx.setOn(!sfx.isOn()); sfx.play('click'); } });
    x += wS + gap;
    pill('restart', 'Restart', x + w[0] / 2, cy, () => startRun(), { w: w[0] });
    x += w[0] + gap;
    pill('rules', 'Rules', x + w[1] / 2, cy, () => { phase = 'intro'; }, { w: w[1] });
  }

  function drawHud() {
    /* One right-aligned read-out line in the top band, in the house format.
       Everything else that used to be here has gone somewhere better: the
       balance is on the dome the vessel rocks on, the ladder is in the
       rules card, and the NEXT preview is the orb in the claw. That frees
       the whole right-hand column on desktop and a band on mobile. */
    const hs = Math.max(0.66, Math.min(1, LW / 620));
    const sep = LW >= 560 ? '   ·   ' : ' · ';
    const big = run.biggest >= 0 ? TIER_NAME[run.biggest] : '—';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '600 ' + Math.round(16 * hs) + 'px Inter, sans-serif';
    ctx.fillText(fmt(run.score) + sep + 'best ' + fmt(best) + sep + big,
                 LW - L.pad, Math.round(L.topH / 2));
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  // ---------- CARDS ----------
  /* Cards are measured, not eyeballed. The rule that matters is that
     clamping a card's height does not stop its content: bottom-anchored
     buttons draw straight through the copy. So the type shrinks and the
     buttons never do, and cardMetrics reports the copy-end to
     button-start gap as a number that a detector can read. */
  const CARD_PAD = 24;
  /* A card is sized to what is in it, then clamped. Sizing it to a fixed
     430 and letting the button sit at the bottom leaves a hole on a
     short card and, on a small frame, puts the button straight through
     the copy. Two passes: measure the content at the current type
     scale, then take the height that content actually needs. */
  function cardBox(contentH) {
    const maxW = Math.min(430, LW - 40), maxH = Math.min(460, LH - 40);
    const want = CARD_PAD + (contentH || 300) + 18 + UI.CTA.h + CARD_PAD;
    const h = Math.min(maxH, want);
    return { x: (LW - maxW) / 2, y: (LH - h) / 2, w: maxW, h: h, maxH: maxH };
  }
  function cardScale(w, h) {
    // 1 at the design size, shrinking on a small frame, never above 1.
    return Math.max(0.70, Math.min(1, Math.min(w / 400, h / 400)));
  }

  function drawCardShell(box) {
    ctx.save();
    ctx.fillStyle = 'rgba(6,4,3,0.72)';
    ctx.fillRect(0, 0, LW, LH);
    ctx.fillStyle = TOK.card;                 // --bg-card
    roundRect(box.x, box.y, box.w, box.h, 20); ctx.fill();
    ctx.strokeStyle = TOK.line; ctx.lineWidth = 1;   // --line
    roundRect(box.x, box.y, box.w, box.h, 20); ctx.stroke();
    ctx.restore();
  }

  /* One loop that teaches both rules, and teaches them as one thing.

     Two equal orbs meet and become a bigger one. That bigger one sits
     off to one side, its weight crosses the edge of the stem, and the
     bowl goes over. Which is the actual dynamic of the game: merging is
     not just points, it MOVES MASS, and moving mass is what kills you.

     A still cannot show either rule. Showing them separately would
     teach two rules; showing them chained teaches the game. */
  const DEMO_SPAN = 0.91;    // fraction of h from the bowl's rim to the foot
  function drawMergeToppleDemo(cx, cy, w, h, tms) {
    const t = (tms / 4200) % 1;
    /* Proportions taken from the real thing, because a demo that does not
       look like the object it is explaining teaches the wrong shape. The
       vessel is 300 wide by 410 deep and the stem it stands on is 44
       across: the stem is 15% of the bowl's width, and that narrowness
       IS the rule. */
    const bowlH = h * 0.70;
    const hw = bowlH * (150 / 410);
    /* Derive the radius from the SAG we want, never pick it. Picking
       0.34*bowlH made rockR smaller than the bowl's own half-width, so
       asin(hw/rockR) clamped at 1 and the base collapsed into a half
       circle narrower than the vessel: the body stepped inward well above
       the floor and the dark interior was drawn out past it. The clamp
       hid the mistake instead of failing on it. */
    const SAG = hw * 0.37;                          // ~3x the real vessel's, to read at this size
    const rockR = (hw * hw + SAG * SAG) / (2 * SAG);
    const topY = h * 0.02, stemTop = topY + bowlH;
    void w;

    // phases: 0 approach, 1 merge, 2 tip, 3 over
    let sep, merged = false, th = 0, alpha = 1;
    if (t < 0.34) { sep = 1 - t / 0.34; }
    else if (t < 0.44) { sep = 0; merged = true; }
    else if (t < 0.82) { merged = true; const k = (t - 0.44) / 0.38; th = 0.34 * k * k; }
    else { merged = true; const k = (t - 0.82) / 0.18; th = 0.34 + k * k * 1.05; alpha = 1 - k * k; }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy - h * 0.465);   // the assembly's own centre; see DEMO_SPAN

    // the ground it rolls on, unrotated. The bowl's lowest point IS the
    // contact, so the ground sits there and nowhere else.
    const groundY = stemTop;
    ctx.strokeStyle = ART.metal; ctx.lineWidth = 2.5; ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(-hw * 2.1, groundY); ctx.lineTo(hw * 2.1, groundY); ctx.stroke();

    // the bowl ROLLS: it rotates about its centre of curvature, and that
    // centre travels sideways by R * theta. A curved base on a flat
    // surface cannot slide off anything.
    ctx.save();
    const c = Math.cos(th), sn = Math.sin(th);
    const arcCy = groundY - rockR;
    ctx.translate(arcCy * sn + rockR * th, arcCy * (1 - c));
    ctx.rotate(th);
    /* Same construction as the real vessel: one solid, flat inside,
       curved outside, a single colour. */
    // Flat inner floor, sitting just above where the curved outside
    // reaches at the bowl's edge: thin at the sides, a lens in the middle.
    const wallD = 4, inHw = hw - wallD;
    const floY = stemTop - SAG - wallD;
    ctx.fillStyle = ART.inner;
    ctx.beginPath();
    ctx.moveTo(-inHw, topY); ctx.lineTo(-inHw, floY - 5);
    ctx.quadraticCurveTo(-inHw, floY, -inHw + 5, floY);
    ctx.lineTo(inHw - 5, floY);
    ctx.quadraticCurveTo(inHw, floY, inHw, floY - 5);
    ctx.lineTo(inHw, topY); ctx.closePath(); ctx.fill();

    const dAx = Math.asin(Math.min(1, hw / rockR));
    const dArcCy = stemTop - rockR;
    ctx.fillStyle = ART.metal;
    ctx.beginPath();
    ctx.moveTo(-hw, topY);
    ctx.lineTo(-hw, dArcCy + Math.cos(dAx) * rockR);
    ctx.arc(0, dArcCy, rockR, Math.PI / 2 + dAx, Math.PI / 2 - dAx, true);
    ctx.lineTo(hw, topY);
    ctx.lineTo(inHw, topY);
    ctx.lineTo(inHw, floY - 5);
    ctx.quadraticCurveTo(inHw, floY, inHw - 5, floY);
    ctx.lineTo(-inHw + 5, floY);
    ctx.quadraticCurveTo(-inHw, floY, -inHw, floY - 5);
    ctx.lineTo(-inHw, topY);
    ctx.closePath(); ctx.fill();

    const big = hw * 0.34, small = hw * 0.235, orbY = floY - big;
    const home = hw * 0.46;                       // where the merged orb ends up
    if (!merged) {
      for (const side of [-1, 1]) {
        const x = home + side * sep * hw * 0.5;
        const g = ctx.createRadialGradient(x - 2.4, orbY - 3, 0, x, orbY, small);
        g.addColorStop(0, TIER_COL[2][0]); g.addColorStop(1, TIER_COL[2][1]);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, orbY, small, 0, 6.2832); ctx.fill();
      }
    } else {
      if (t < 0.50) {                              // the flash of the merge
        const k = Math.max(0, 1 - (t - 0.34) / 0.16);
        const fg = ctx.createRadialGradient(home, orbY, big * 0.6, home, orbY, big * 2.1);
        fg.addColorStop(0, 'rgba(255,246,224,0)');
        fg.addColorStop(0.7, 'rgba(255,220,150,' + (0.6 * k) + ')');
        fg.addColorStop(1, 'rgba(255,246,224,0)');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(home, orbY, big * 2.1, 0, 6.2832); ctx.fill();
      }
      const g = ctx.createRadialGradient(home - 3.4, orbY - 4, 0, home, orbY, big);
      g.addColorStop(0, TIER_COL[3][0]); g.addColorStop(1, TIER_COL[3][1]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(home, orbY, big, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
    ctx.restore();
    ctx.globalAlpha = 1;
    demoState = { t: +t.toFixed(3), merged: merged, theta: +th.toFixed(3), sep: +(sep || 0).toFixed(2) };
  }
  let demoState = null;

  let cardMetrics = { gap: 0, fits: true };

  /* Three lengths of the same explanation, longest first.

     A card that will not fit is a space problem, and the card gives up
     CONTENT rather than shrinking the type or the picture. The type
     floor is 16px because this is copy a player has to read, and the
     site rule has no exemption for that; the demo keeps its size
     because "the vessel leans" is the one thing words are worst at. */
  const COPY_SETS = [
    ['Drag to aim, release to drop.',
     'Two orbs of the same size that come to',
     'rest touching fuse into the next size up.',
     'The bowl has a round base, so it rocks. A',
     'low, even pile rights itself. A high or',
     'lopsided one rolls right over.'],
    ['Drag to aim, release to drop.',
     'Two orbs of the same size fuse into the',
     'next size up. The bowl rocks on a round',
     'base: keep the pile low and even.'],
    ['Drag to aim, release to drop.',
     'Two of a size fuse into the next size up.',
     'The bowl rocks. Keep the pile low and even.']
  ];
  const MIN_COPY = 16;      // site-wide floor for anything a player reads

  /* The ladder lives here now. It is a reference, not a live read-out:
     seven sizes in order, which the board already shows you. Off the
     playfield it costs nothing and gives the vessel the space back. */
  const LADDER_H = 34;
  function drawLadderStrip(cx, y, w) {
    const n = TIER_R.length, gap = Math.min(34, (w - 24) / n);
    const x0 = cx - (n - 1) * gap / 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = TOK.mute; ctx.font = '800 10px Inter, sans-serif';
    ctx.fillText('SMALLEST', x0, y + 22);
    ctx.fillText('BIGGEST', x0 + (n - 1) * gap, y + 22);
    ctx.textBaseline = 'top';
    for (let t = 0; t < n; t++) {
      const r = 4.5 + t * 1.25, x = x0 + t * gap;
      const [hi, lo] = TIER_COL[t];
      const g = ctx.createRadialGradient(x - r * 0.32, y - r * 0.36, 0, x, y, r);
      g.addColorStop(0, hi); g.addColorStop(1, lo);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
    ctx.textAlign = 'left';
  }

  function introLayout() {
    const availW = Math.min(430, LW - 40), availH = Math.min(460, LH - 40);
    const k = cardScale(availW, availH);
    const fs = Math.max(MIN_COPY, Math.round(16 * k));
    const lineH = Math.round(fs * 1.45);
    let demoH = Math.round(108 * k);
    const budget = availH - CARD_PAD * 2 - 18 - UI.CTA.h;
    const head = 30 * k;
    for (const lines of COPY_SETS) {
      const h = head + demoH + 12 * k + lines.length * lineH + LADDER_H;
      if (h <= budget) return { k, fs, lineH, demoH, lines, contentH: h };
    }
    // Nothing fits even at the shortest copy: the picture gives way last.
    const lines = COPY_SETS[COPY_SETS.length - 1];
    demoH = Math.max(40, budget - head - 12 * k - lines.length * lineH - LADDER_H);
    return { k, fs, lineH, demoH, lines,
             contentH: head + demoH + 12 * k + lines.length * lineH + LADDER_H };
  }

  function drawIntro(now) {
    const M = introLayout();
    const k = M.k, fs = M.fs, demoH = M.demoH;
    const box = cardBox(M.contentH);
    drawCardShell(box);
    const cx = box.x + box.w / 2;
    let y = box.y + CARD_PAD * k;

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = TOK.text;
    ctx.font = '800 ' + Math.round(22 * k) + 'px Inter, sans-serif';
    ctx.fillText('How to play', cx, y);
    y += 30 * k;

    const demoTop = y;
    drawMergeToppleDemo(cx, y + demoH / 2, box.w * 0.62, demoH, now);
    // Where the picture ACTUALLY ends, not where its box does.
    const demoBottom = (y + demoH / 2) - demoH * 0.465 + demoH * DEMO_SPAN;
    y += demoH + 12 * k;
    const demoGap = Math.round(y - demoBottom);
    void demoTop;

    ctx.fillStyle = TOK.dim;
    ctx.font = '500 ' + fs + 'px Inter, sans-serif';
    for (const ln of M.lines) { ctx.fillText(ln, cx, y); y += M.lineH; }
    y += 6;
    drawLadderStrip(cx, y + 8, box.w - 40);
    y += LADDER_H;
    const copyEnd = y;

    // The button keeps its size at every frame size. Only the type above
    // it moved, which is the rule.
    const btnY = box.y + box.h - 24 - UI.CTA.h / 2;
    const gap = Math.round(btnY - UI.CTA.h / 2 - copyEnd);
    cardMetrics = { gap: gap, demoGap: demoGap,
                    fits: copyEnd < btnY - UI.CTA.h / 2 && demoGap >= 0 };
    L.buttons.length = 0;
    const b = UI.drawCTA(ctx, run.dropped > 0 ? 'RESUME' : 'START', cx, btnY, TOK.accent);
    b.id = 'cta';
    b.act = () => { if (run.dropped > 0 && !run.over) phase = 'playing'; else startRun(); };
    L.buttons.push(b);
    ctx.textAlign = 'left';
  }

  function drawOver() {
    const availW = Math.min(430, LW - 40), availH = Math.min(460, LH - 40);
    const k = cardScale(availW, availH);
    const bigFs = Math.max(MIN_COPY, Math.round(16 * k));
    const contentH = 22 * k + 54 * k + 26 * k + 34 * k + bigFs + 14 * k;
    const box = cardBox(contentH);
    drawCardShell(box);
    const cx = box.x + box.w / 2;
    let y = box.y + CARD_PAD * k;

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = TOK.accentTx;                 // --accent-text as a mark
    ctx.font = '800 ' + Math.round(13 * k) + 'px Inter, sans-serif';
    // Say which of the two endings it was; they look nothing alike.
    ctx.fillText(run.cause === 'topple' ? 'THE BOWL WENT OVER' : 'IT SPILLED OUT', cx, y);
    y += 22 * k;
    ctx.fillStyle = TOK.text;
    ctx.font = '800 ' + Math.round(46 * k) + 'px Inter, sans-serif';
    ctx.fillText(fmt(run.score), cx, y);
    y += 54 * k;
    ctx.fillStyle = TOK.mute;
    ctx.font = '700 ' + Math.round(13 * k) + 'px Inter, sans-serif';
    ctx.fillText(run.score >= best ? 'A NEW BEST' : 'BEST  ' + fmt(best), cx, y);
    y += 26 * k;

    // The ladder as a collection: which sizes this run ever made.
    const n = TIER_R.length, gap = Math.min(30, (box.w - 60) / n);
    const x0 = cx - (n - 1) * gap / 2;
    for (let t = 0; t < n; t++) {
      const got = (run.everReached >> t) & 1;
      const r = (5 + t * 1.5) * k;
      ctx.globalAlpha = got ? 1 : 0.22;
      const [hi, lo] = TIER_COL[t];
      const g = ctx.createRadialGradient(x0 + t * gap - r * 0.3, y + 14 - r * 0.3, 0, x0 + t * gap, y + 14, r);
      g.addColorStop(0, hi); g.addColorStop(1, lo);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x0 + t * gap, y + 14, r, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
    }
    y += 34 * k;
    ctx.fillStyle = TOK.dim;
    ctx.font = '700 ' + bigFs + 'px Inter, sans-serif';
    ctx.fillText('Biggest reached: ' + (run.biggest >= 0 ? TIER_NAME[run.biggest] : 'none'), cx, y);
    const copyEnd = y + bigFs + 4;

    const btnY = box.y + box.h - 24 - UI.CTA.h / 2;
    cardMetrics = { gap: Math.round(btnY - UI.CTA.h / 2 - copyEnd), fits: copyEnd < btnY - UI.CTA.h / 2 };
    L.buttons.length = 0;
    const b = UI.drawCTA(ctx, 'PLAY AGAIN', cx, btnY, TOK.accent);
    b.id = 'cta';
    b.act = () => startRun();
    L.buttons.push(b);
    ctx.textAlign = 'left';
  }

  // ---------- TUNING HARNESS ----------
  let fpsT = 0, fpsN = 0, fps = 0;
  function drawTuning() {
    const rows = [
      'seed ' + run.seed,
      'bodies ' + world.bodies.length + '  contacts ' + world.stats.contacts,
      'awake ' + world.awakeCount() + (world.atRest ? '  VESSEL AT REST' : ''),
      'theta ' + (world.theta * 180 / Math.PI).toFixed(2) + 'deg  target ' + (world.thetaTarget * 180 / Math.PI).toFixed(2),
      'com.x ' + world.com.x.toFixed(1) + '  K_TILT ' + world.P.K_TILT + '  THETA_MAX ' + world.P.THETA_MAX,
      'S ' + L.S.toFixed(3) + '  LW/LH ' + LW + 'x' + LH + '  ' + MODE,
      'fps ' + fps.toFixed(0) + '  card gap ' + cardMetrics.gap + (cardMetrics.fits ? '' : '  CARD OVERLAP')
    ];
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.66)';
    ctx.fillRect(4, 4, 300, rows.length * 15 + 10);
    ctx.fillStyle = '#5DD39E'; ctx.font = '500 11px ui-monospace, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    rows.forEach((r, i) => ctx.fillText(r, 10, 10 + i * 15));
    ctx.restore();
  }

  // ---------- RENDER ----------
  function render(now) {
    ctx.clearRect(0, 0, LW, LH);
    // House ground, same geometry as Bloom and Prism.
    const g = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
    g.addColorStop(0, BG_TOP); g.addColorStop(0.6, BG_MID); g.addColorStop(1, BG_BOT);
    ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
    // The forge, as a pool of warm light around the vessel rather than as
    // the colour of the whole page.
    const fy = L.OY + 330 * L.S, fr = Math.max(240, 420 * L.S);
    const fg = ctx.createRadialGradient(L.OX, fy, 0, L.OX, fy, fr);
    fg.addColorStop(0, ART.glow);
    fg.addColorStop(0.55, 'rgba(160,92,40,0.09)');
    fg.addColorStop(1, 'rgba(160,92,40,0)');
    ctx.fillStyle = fg; ctx.fillRect(0, 0, LW, LH);

    L.buttons.length = 0;
    ctx.save();
    if (shake > 0) {
      const a = shake * shake * 5;
      ctx.translate(Math.sin(now * 0.06) * a, Math.cos(now * 0.083) * a);
    }
    if (world) {
      drawGround();
      drawVessel();
      for (const b of world.bodies) drawOrb(b.x, b.y, b.r, b.tier, 1);
      drawFlashes();
      drawGuide();
    }
    ctx.restore();

    if (world) { drawHud(); drawControls(); }
    if (phase === 'intro') drawIntro(now);
    else if (phase === 'over') drawOver();
    if (TUNING && world) drawTuning();
  }

  // ---------- LOOP ----------
  let lastT = 0;
  function frame(now) {
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 1 / 60;
    lastT = now;
    fpsN++; fpsT += dt;
    if (fpsT >= 0.5) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
    update(dt);
    render(now);
    requestAnimationFrame(frame);
  }

  // ---------- BOOT ----------
  // Every one of these re-fit hooks is part of the pattern, not belt and
  // braces. Tailwind shipped without them and collapsed into a narrow column
  // on a phone; a strip always means the CSS box and the JS W/H disagree about
  // aspect. Timers rather than rAF, because rAF is throttled to nothing in
  // some embedded browsers, which is exactly where a stale size would stick.
  newRun();
  phase = 'intro';

  setCanvasVars();
  resizeCanvas();
  fitFullscreen();
  resizeCanvas();
  layout();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', () => { onResize(); });
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);   // iOS URL-bar collapse
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  requestAnimationFrame(frame);

  // A handle for the measurement harnesses, never used by the game itself.
  window.__ballast = {
    get world() { return world; }, get L() { return L; },
    get phase() { return phase; }, set phase(v) { phase = v; },
    get cardMetrics() { return cardMetrics; },
    get demoState() { return demoState; },
    get mode() { return MODE; }, TUNE: TUNE, TIER_COL: TIER_COL, ART: ART, TOK: TOK,
    start: startRun, drop: dropPiece,
    aim(v) { aimLocalX = run.clampAim(v); },
    // Pump one frame by hand. A hidden preview pane throttles rAF to
    // nothing, so a visual check has to drive the loop itself. The game
    // never calls this.
    tick(dt, now) { update(dt || 1 / 60); render(now || performance.now()); },
    get run() { return run; },
    get nextTier() { return run.nextTier; },
    get score() { return run.score; }, get best() { return best; },
    get biggest() { return run.biggest; }, get seed() { return run.seed; }
  };
})();
