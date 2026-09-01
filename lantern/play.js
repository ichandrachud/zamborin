/* ============================================================
   Lantern · A Zamborin Game
   Milestone 0 + 1 — the feel spike, one scene end to end.

   THE ONE RULE THIS FILE EXISTS TO PROTECT:
   the touch NEVER captures. It is a warmth fireflies keep away from, and
   nothing else. There is no grab, no lasso, no tap-to-collect. Only the jar
   takes a fly, and only when the fly crosses its mouth. Every force the touch
   applies points AWAY from the touch, always. `__lantern.assertNoCapture()`
   proves it over the whole field.

   Not built yet (M2 onward): the tune gate, the 54 levels as designed, the
   rules card, the win card, the splash art, the guide, any ship step.
   ============================================================ */
(() => {
  'use strict';

  const UI = window.ZAM_UI;

  // ---------- MODE ----------
  // A browser can report a 0-wide viewport on the first frame. The obvious
  // `innerWidth < 768` then reads as a phone, MODE is locked for the session,
  // and a desktop player is left on the phone layout for good.
  const MODE = (matchMedia('(pointer: coarse)').matches ||
                (window.innerWidth > 0 && window.innerWidth < 768))
    ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);

  /* `let`, not `const`, so QC can flip it. A reduced-motion path that cannot be
     exercised without changing an OS setting is a path nobody checks, and the
     acceptance list asks for reduced motion ON CANVAS, which no CSS media query
     can deliver on its own. */
  let REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PARAMS = new URLSearchParams(location.search);
  const TUNE_UI = PARAMS.get('tune') === '1';

  // ---------- TOKENS ----------
  // Canvas cannot read CSS variables, so shared/tokens.css is restated here and
  // nowhere else. CHROME TAKES THESE AND NOTHING ELSE: the frame, the bands,
  // the read-out, every button, every state of every button.
  const TOK = {
    bg: '#0E1726', bgCard: '#131F36', bgPanel: '#1A2A45',
    text: '#FFFFFF',
    ink92: 'rgba(255,255,255,0.92)', ink90: 'rgba(255,255,255,0.90)',
    ink82: 'rgba(255,255,255,0.82)', ink72: 'rgba(255,255,255,0.72)',
    tint03: 'rgba(255,255,255,0.03)', tint07: 'rgba(255,255,255,0.07)',
    tint10: 'rgba(255,255,255,0.10)', tint12: 'rgba(255,255,255,0.12)',
    tint40: 'rgba(255,255,255,0.40)',
    accent: '#C24A39', accentHover: '#A93E2F', accentText: '#FF6B5C',
    accent2: '#FFD23F', green: '#5DD39E',
    scrim: 'rgba(10,16,28,0.88)', scrimWin: 'rgba(10,16,28,0.82)',
  };

  /* GAME ART, and only game art: the garden inside the arena. Kaleido and
     Tailwind precedent — the playfield carries its own palette, sits on a token
     ground, and never restates a chrome colour slightly differently.

     The canvas FLOOR stays the Portal wash, because the design system names the
     canvas floor as chrome and says so by name. The garden is painted on top of
     it, inside the arena, and the wash is what you see in the margin around the
     garden. That is how both things can be true at once. */
  const ART = {
    nightTop: '#0A1418', nightBot: '#05090C',   // the garden's own night
    flyCore: '#EFFFC2',                          // green-gold, never pure yellow
    flyGlow: [216, 240, 144],
    touchGlow: [255, 232, 170],                  // ember-amber, warmer than a fly
    grass: '#1E3C32',
    thornMass: '#0D1512', thornTip: '#8A4438',   // shape says danger, not colour
    jarGlass: 'rgba(190,220,235,0.10)',
    jarWarm: [255, 214, 138],
  };

  // ---------- TUNE ----------
  /* The brief's starting constants, in WORLD units on a 640 field. Everything
     below the divider is a spike constant the brief did not fix; each one is
     swept in M2 and each is on a slider under ?tune=1. */
  const TUNE = {
    arena: 640,
    nByTier:  [8, 10, 12, 14, 16, 18, 20, 23, 26],
    sep: 46, coh: 0.55, align: 0.3, wander: 0.35, flyMax: 62,
    touchRadius: 120, pushMax: 95,
    panicSpeed: 78, spookSecs: 1.6, spookRadius: 46,
    jarPull: 40, mouthByTier: [120, 110, 100, 88, 80, 74, 66, 80, 64],
    breeze: 22,
    // ---- spike constants, not in the brief ----
    /* HOW FAST THE WARMTH STOPS PUSHING once it is gone. 1.0 is a one-second
       coast: lift your hand and the swarm keeps drifting the way you sent it,
       which is most of what "moving warm air" feels like. It is also the
       constant that decides whether panicSpeed is a dial at all — see
       panicRadius(). */
    shoveDamp: 1.0,
    cohRadius: 132,      // where cohesion reaches
    alignRadius: 92,
    spookCruise: 1.5,    // cruise multiplier while spooked
    spookSpread: 0.62,   // fraction of spookSecs a spook passes on, so a
                         // cascade decays instead of locking the swarm open
    edgeMargin: 64, edgeForce: 210,
    thornR: 30, thornKick: 150,
    touchLift: MODE === 'mobile' ? 34 : 0,   // SCREEN px: lift the warmth clear
                                             // of the fingertip so the panic
                                             // ring is visible while herding
  };

  const DT = 1 / 120;             // fixed timestep; the gate depends on it

  /* WHERE THEY PANIC, solved rather than guessed, so the ring the player sees
     is the ring the physics actually uses.

     A fly carries TWO velocities. Its own flight, which it steers and which
     never exceeds flyMax, and a SHOVE that the touch, the breeze and the thorns
     build up and that decays on its own over about a second. It spooks on the
     two together.

     Both point the same way inside the warmth, because a fly in it is leaving
     rather than fighting, so under a steady push at falloff f:

         own    =  its comfortable speed, fleeing
         shove  =  pushMax * f / shoveDamp
         panic  =  own + shove  >=  panicSpeed

     and f(t) = (1 - t^2)^2 says where in the field that lives. `PANIC_K` is the
     one fitted number in it: the fly is not always flying straight down the
     push, so the analytic radius sits a little outside the measured one.
     `__lantern.calibratePanic()` measures the real radius by simulation and
     prints both. Keep them within a few units of each other or the ring on
     screen is a decoration rather than the rule. */
  const MEAN_OWN = () => TUNE.flyMax * 0.81 * 0.86;   // see `cs` and `comfort`
  /* Fitted 2026-09-01 against __lantern.calibratePanic(): the closed form read
     68 where the simulation put the swarm's real panic radius at 56. A swarm
     panics further out than a lone fly (44) because a spook spreads, which is
     the whole point of the mechanic, so the SWARM number is the one the ring
     has to match. Re-run the calibration after touching pushMax, shoveDamp or
     the steering, and move this if the error grows past a few units. */
  const PANIC_K = 0.46;
  function panicRadius() {
    const need = (TUNE.panicSpeed - MEAN_OWN() * PANIC_K);
    if (need <= 0) return TUNE.touchRadius;          // they panic at cruise
    const f = need * TUNE.shoveDamp / TUNE.pushMax;
    if (f >= 1) return 0;                            // a full push cannot
    return TUNE.touchRadius * Math.sqrt(Math.max(0, 1 - Math.sqrt(f)));
  }
  // The push a fly feels at world distance d. Smooth at both ends: zero slope
  // at the centre and zero slope at the rim, so there is no edge to feel.
  function pushFalloff(d) {
    const t = d / TUNE.touchRadius;
    if (t >= 1) return 0;
    const u = 1 - t * t;
    return u * u;
  }

  // ---------- RNG ----------
  // No Math.random() in game logic anywhere. Scripted replays must reproduce
  // exactly or the gate in M2 measures noise.
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- CANVAS ----------
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
    const s = Math.min(bW / LW, bH / LH);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    // getImageData ignores the transform, so the measurement hooks need the
    // logical-to-device scale written down somewhere they can reach it.
    L.dscale = s;
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
    fitFullscreen(); resizeCanvas(); layout(); buildScenery();
  }

  // ---------- AUDIO ----------
  const sfx = window.ZSFX
    ? window.ZSFX.create({ storageKey: 'zam.lantern.sfx', gain: 2.6 })
    : null;

  // ---------- ANALYTICS ----------
  const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){},
                 levelRestart(){}, hintUsed(){} };
  const T = () => (window.ZAM_TRACK || NOOP);
  T().init('lantern');
  T().gameStart();

  // ---------- BANDS ----------
  const SIDE_PAD = 30;
  const topBand = () => (MODE === 'mobile' ? 64 : 56);
  const botBand = () => (MODE === 'mobile' ? 96 : 20);
  const RIGHT_COL = 176;     // desktop only: the jar illustration column

  // ---------- SCENE ----------
  /* Tier furniture, from the brief:
       T1 open field, big mouth · T2 first thorn · T3 breeze · T4 narrow mouth
       T5 thorn corridor · T6 two thorn islands + breeze · T7 small swarm, tiny
       mouth · T8 large swarm · T9 everything.
     Six levels a tier, so the tier is `(level - 1) / 6`. Every scene is built
     from the level number alone: same number, same garden, on any device. */
  const LEVELS = 54;
  const tierOf = (lvl) => Math.min(8, Math.floor((lvl - 1) / 6));

  function thornCountFor(tier) {
    if (tier <= 0) return 0;
    if (tier === 1) return 1;
    if (tier === 2) return 1;
    if (tier === 3) return 2;
    if (tier === 4) return 4;      // the corridor
    if (tier === 5) return 5;      // two islands
    if (tier === 6) return 3;
    if (tier === 7) return 3;
    return 6;
  }
  const breezeOn = (tier) => (tier === 2 || tier === 5 || tier === 8);

  function buildScene(lvl) {
    const tier = tierOf(lvl);
    const rnd = mulberry32(0x1A27E * lvl + 977);
    const A = TUNE.arena;
    const n = TUNE.nByTier[tier];
    const mouthW = TUNE.mouthByTier[tier];

    // The jar sits low in the scene, the way it does in a garden. Which corner
    // it takes rotates with the level so a tier does not read as one picture.
    const corner = Math.floor(rnd() * 4);
    const jw = mouthW * 1.12, jh = jw * 1.45;
    const inset = 118;
    const jx = (corner & 1) ? A - inset : inset;
    const jy = A - inset * (0.72 + rnd() * 0.20);
    // Tilt, as a jar left in the grass would be. The mouth points up and a
    // little inward, so the swarm is herded across the garden and down.
    const lean = (corner & 1) ? -1 : 1;
    const ang = lean * (0.20 + rnd() * 0.14);

    const jar = { x: jx, y: jy, ang, w: jw, h: jh, mouthW };
    // Mouth centre and the two axes, in world space. `inX/inY` points INTO the
    // jar; `tanX/tanY` runs along the mouth.
    const c = Math.cos(ang), s = Math.sin(ang);
    /* Local +y is INTO the jar, so the mouth is the top and the body hangs
       below it. Getting this the other way round draws an upside-down jar that
       still captures correctly, which is exactly the kind of bug a screenshot
       finds and a test does not. */
    jar.inX = -s; jar.inY = c;
    jar.tanX = c; jar.tanY = s;
    jar.mx = jx - jar.inX * (jh * 0.5);
    jar.my = jy - jar.inY * (jh * 0.5);

    // The swarm starts far from the jar, so every level is a walk.
    const startX = (corner & 1) ? A * 0.30 : A * 0.70;
    const startY = A * (0.26 + rnd() * 0.10);

    const flies = [];
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, r = 26 + rnd() * 62;
      flies.push({
        x: startX + Math.cos(a) * r,
        y: startY + Math.sin(a) * r,
        vx: (rnd() - 0.5) * 30, vy: (rnd() - 0.5) * 30,
        sx: 0, sy: 0,                     // the shove the world has given it
        cs: 0.62 + rnd() * 0.38,          // its own comfortable share of flyMax
        wa: rnd() * Math.PI * 2,          // wander heading
        ws: (rnd() - 0.5) * 1.4,          // wander turn rate
        ph: rnd() * 1.2,                  // flash phase, seeded per fly
        spook: 0, caught: false, capT: 0,
        jx: 0, jy: 0, jr: 0, jsp: 0,      // milling inside the glass
        trail: [],
      });
    }

    // Thorns, kept off the jar and off the swarm's starting patch. Tier 5 is
    // the corridor: a line of bushes the swarm has to be walked around.
    const thorns = [];
    const nThorn = thornCountFor(tier);
    if (tier === 4) {
      const cy = A * (0.48 + rnd() * 0.08);
      for (let i = 0; i < nThorn; i++) {
        thorns.push({ x: A * (0.16 + i * 0.19), y: cy + (rnd() - 0.5) * 40,
                      r: TUNE.thornR, seed: rnd() * 1000 });
      }
    } else {
      let guard = 0;
      while (thorns.length < nThorn && guard++ < 400) {
        const x = A * (0.14 + rnd() * 0.72), y = A * (0.20 + rnd() * 0.58);
        if (Math.hypot(x - jar.mx, y - jar.my) < mouthW * 1.9) continue;
        if (Math.hypot(x - startX, y - startY) < 132) continue;
        let ok = true;
        for (const t2 of thorns) if (Math.hypot(x - t2.x, y - t2.y) < 96) ok = false;
        if (!ok) continue;
        thorns.push({ x, y, r: TUNE.thornR, seed: rnd() * 1000 });
      }
    }

    // A breeze is one lateral band and it is ALWAYS visible. Never a surprise.
    let breeze = null;
    if (breezeOn(tier)) {
      const h = A * (0.22 + rnd() * 0.10);
      const y0 = A * (0.30 + rnd() * 0.24);
      const dir = rnd() < 0.5 ? -1 : 1;
      const motes = [];
      for (let i = 0; i < 26; i++) {
        motes.push({ x: rnd() * A, y: y0 + rnd() * h,
                     v: 0.6 + rnd() * 0.9, len: 18 + rnd() * 34 });
      }
      breeze = { y0, y1: y0 + h, dir, motes };
    }

    return { lvl, tier, n, jar, flies, thorns, breeze, caught: 0,
             spookEvents: 0, splits: 0, seconds: 0 };
  }

  // ---------- STATE ----------
  const save = (() => {
    try {
      const raw = localStorage.getItem('zam.lantern.progress');
      const v = raw ? JSON.parse(raw) : null;
      if (v && typeof v.lvl === 'number') return { lvl: Math.min(LEVELS, Math.max(1, v.lvl | 0)) };
    } catch (_) {}
    return { lvl: 1 };
  })();
  function persist() {
    try { localStorage.setItem('zam.lantern.progress', JSON.stringify(save)); }
    catch (_) {}
  }

  let S = buildScene(save.lvl);
  let phase = 'play';          // 'play' | 'win'
  let winT = 0;                // seconds since the last fly settled
  let clock = 0;               // scene seconds, advanced by the fixed step only
  let touch = null;            // { x, y } in WORLD units, or null when hands off
  let hover = null;            // desktop aiming ring, screen coords, or null
  const L = {};                // layout, filled by layout()
  const hit = {};              // control hit boxes, filled by render

  // ---------- LAYOUT ----------
  /* The arena is a SQUARE 640 field in both modes, because the gate and the
     level seeds only mean the same thing in both if the field does. It is
     scaled to fit whatever box the bands leave and it is never drawn as a box:
     the flies are held inside it by a soft edge force, and the scene is painted
     past it, so the player never sees a frame around the garden.

     Vertically the square sits at 0.42 of the slack rather than 0.5. On a phone
     the box is much taller than it is wide, and the leftover has to go
     somewhere: below the swarm, where the grass is. */
  function layout() {
    L.ctrlCy = MODE === 'mobile' ? LH - 74 : topBand() / 2;
    const availTop = topBand();
    const availH = Math.max(80, LH - topBand() - botBand());
    let availW, boxX;
    if (MODE === 'mobile') {
      // The garden is scene art and runs the full width; SIDE_PAD governs the
      // band content above it, not the picture.
      availW = LW; boxX = 0;
    } else {
      availW = LW - SIDE_PAD * 2 - RIGHT_COL - 16;
      boxX = SIDE_PAD;
    }
    const side = Math.max(120, Math.min(availW, availH));
    L.scale = side / TUNE.arena;
    L.ox = Math.round(boxX + (availW - side) / 2);
    L.oy = Math.round(availTop + (availH - side) * 0.42);
    L.side = side;
    // The play area: everything between the bands. The garden is painted over
    // all of it; only the flies are confined to the square.
    L.playX = MODE === 'mobile' ? 0 : SIDE_PAD;
    L.playY = availTop;
    L.playW = MODE === 'mobile' ? LW : LW - SIDE_PAD * 2 - RIGHT_COL - 16;
    L.playH = availH;
    L.col = { x: LW - SIDE_PAD - RIGHT_COL, y: availTop, w: RIGHT_COL, h: availH };
  }
  const wx2s = (x) => L.ox + x * L.scale;
  const wy2s = (y) => L.oy + y * L.scale;
  const s2wx = (x) => (x - L.ox) / L.scale;
  const s2wy = (y) => (y - L.oy) / L.scale;

  // ---------- SCENERY ----------
  /* Grass is seeded from the level, laid out across the PLAY AREA rather than
     the arena, so the bottom of the frame is garden rather than a cut edge. It
     is regenerated on resize because it is measured in screen pixels. */
  let grass = [], foliage = [];
  function buildScenery() {
    const rnd = mulberry32(0x9E37 * S.lvl + 5);
    grass = [];

    /* FOLIAGE. Without it the top two thirds of the frame is a void, and a void
       is not the same thing as a dark garden. These are not lights and they add
       none: they are a DIFFERENT dark, a few units greener than the night, so
       the frame has depth at rest and something for a passing fly to find. They
       brighten exactly the way the grass does and by the same rule. */
    foliage = [];
    const fw = MODE === 'mobile' ? LW : L.playW;
    const fx0 = L.playX;
    const anchors = [[0, 0], [1, 0], [0, 0.42], [1, 0.58], [0.5, -0.08]];
    const nBlob = 3;
    for (let i = 0; i < nBlob; i++) {
      const a = anchors[Math.floor(rnd() * anchors.length)];
      const cx = fx0 + a[0] * fw + (a[0] < 0.5 ? -1 : 1) * rnd() * fw * 0.10;
      const cy = L.playY + a[1] * L.playH + (rnd() - 0.5) * L.playH * 0.10;
      const lobes = [];
      const nl = 4 + Math.floor(rnd() * 4);
      const R = (0.11 + rnd() * 0.11) * Math.min(fw, L.playH);
      for (let j = 0; j < nl; j++) {
        lobes.push({ dx: (rnd() - 0.5) * R * 1.5, dy: (rnd() - 0.5) * R * 1.1,
                     rx: R * (0.42 + rnd() * 0.5), ry: R * (0.30 + rnd() * 0.42),
                     rot: rnd() * Math.PI });
      }
      foliage.push({ cx, cy, lobes, R });
    }
    const w = MODE === 'mobile' ? LW : L.playW + SIDE_PAD;
    const x0 = MODE === 'mobile' ? 0 : L.playX - 10;

    /* THE GROUND IS THE FIELD'S FLOOR, not the bottom of the frame. On a phone
       the square field is width-bound and the play area is much taller, so the
       two are 160 pixels apart, and anchoring the grass to the frame left the
       jar hanging in mid-air with a band of nothing under it.

       The slack below the field is not a gap to be closed, it is foreground:
       a nearer, taller, darker band of grass in front of everything, which is
       what gives the garden depth on a phone. On a desktop frame the field
       floor and the play floor nearly coincide and the two bands simply
       thicken one another. */
    const fieldY = wy2s(TUNE.arena);
    const playY2 = L.playY + L.playH;
    const gap = Math.max(0, playY2 - fieldY);
    /* Scenery scales with the FIELD, not with the frame. Grass heights were
       fixed screen pixels, so in the 480x360 embed frame, where the square
       field is only 200 across, a blade stood half as tall as the garden and
       the scene read as grass with a puzzle behind it. */
    const gs = Math.max(0.55, Math.min(1, L.side / 400));
    const count = Math.round(w / 6.2);
    for (let i = 0; i < count; i++) {
      const r = rnd();
      const row = r < 0.38 ? 0 : (r < 0.80 ? 1 : 2);   // 0 far · 1 at the jar · 2 near
      const baseY = row === 0 ? fieldY - 4
                  : row === 1 ? fieldY + gap * 0.34
                  : playY2 + 26;
      grass.push({
        x: x0 + (i + rnd() * 0.9) * (w / count),
        y: baseY - rnd() * 8,
        h: (row === 0 ? 46 : row === 1 ? 64 : 82) * (0.5 + rnd() * 0.8) * gs,
        lean: (rnd() - 0.5) * 0.55,
        ph: rnd() * Math.PI * 2,
        row,
        back: row === 0,
      });
    }
    grass.sort((a, b) => a.row - b.row);
  }

  // ---------- SIM ----------
  const TF = { x: 0, y: 0, d: 0 };   // scratch, so the inner loop allocates nothing

  function clampVec(o, max) {
    const m = Math.hypot(o.x, o.y);
    if (m > max && m > 1e-6) { o.x = o.x / m * max; o.y = o.y / m * max; }
  }

  function step(dt) {
    clock += dt;
    const F = S.flies, A = TUNE.arena, jar = S.jar;
    const shoveK = Math.exp(-TUNE.shoveDamp * dt);
    const loose = [];
    for (const f of F) if (!f.caught) loose.push(f);

    // ---- contagion, resolved against last frame's state so a cascade cannot
    // ---- race through the whole swarm inside one step ----
    const wasSpooked = [];
    for (const f of loose) wasSpooked.push(f.spook > 0);
    let newlySpooked = 0;

    for (let i = 0; i < loose.length; i++) {
      const f = loose[i];

      // --- boids ---
      let sx = 0, sy = 0, cx = 0, cy = 0, cn = 0, alx = 0, aly = 0, an = 0;
      for (let j = 0; j < loose.length; j++) {
        if (j === i) continue;
        const g = loose[j];
        const dx = f.x - g.x, dy = f.y - g.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        if (d < TUNE.sep) { const k = (TUNE.sep - d) / TUNE.sep; sx += dx / d * k; sy += dy / d * k; }
        if (d < TUNE.cohRadius) { cx += g.x; cy += g.y; cn++; }
        if (d < TUNE.alignRadius) { alx += g.vx; aly += g.vy; an++; }
      }
      let bx = sx * 2.6, by = sy * 2.6;
      // A spooked fly stops belonging to the swarm. That IS the split.
      if (cn > 0 && f.spook <= 0) {
        const tx = cx / cn - f.x, ty = cy / cn - f.y, m = Math.hypot(tx, ty);
        if (m > 1e-6) { bx += tx / m * TUNE.coh; by += ty / m * TUNE.coh; }
      }
      if (an > 0 && f.spook <= 0) {
        const m = Math.hypot(alx, aly);
        if (m > 1e-6) { bx += alx / m * TUNE.align; by += aly / m * TUNE.align; }
      }
      // Seeded wander, never Math.random. Slower under reduced motion.
      f.wa += f.ws * dt * (REDUCED ? 0.4 : 1);
      const wanW = TUNE.wander * (REDUCED ? 0.4 : 1) * (f.spook > 0 ? 2.1 : 1);
      bx += Math.cos(f.wa) * wanW; by += Math.sin(f.wa) * wanW;

      /* THE WARMTH IS A HEADING AS WELL AS A SHOVE, and this is the line the
         first build got wrong. With the touch as a shove only, the fly's own
         steering kept aiming back at the swarm it was being blown out of, and
         its own flight cancelled the shove almost exactly: own 52, shove 49,
         net 5. Nothing moved and nothing ever panicked.

         The brief says the fireflies DRIFT AWAY from the warmth. They are not
         fighting it. So the touch gives the fly a heading away as well, and the
         two then add: at arm's length that is a gentle 50-a-second drift, and
         up close it is own speed plus a shove of ninety, which is what
         panicSpeed is measured against. */
      if (touch) {
        const dx = f.x - touch.x, dy = f.y - touch.y, m = Math.hypot(dx, dy);
        if (m > 1e-6) {
          const w = 2.4 * pushFalloff(m) + (f.spook > 0 ? 1.5 : 0);
          if (w > 0) { bx += dx / m * w; by += dy / m * w; }
        }
      }

      /* --- what the fly CHOOSES: turning back from the edge of the garden,
         --- and drifting toward the lit mouth of the jar. Both are headings it
         --- steers to, not forces done to it, so they join the boid vector.
         --- Nothing is ever bounced: the garden just leans back. */
      const em = TUNE.edgeMargin, eg = TUNE.edgeForce / 210;
      if (f.x < em)     bx += (1 - f.x / em) * 3.4 * eg;
      if (f.x > A - em) bx -= (1 - (A - f.x) / em) * 3.4 * eg;
      if (f.y < em)     by += (1 - f.y / em) * 3.4 * eg;
      if (f.y > A - em) by -= (1 - (A - f.y) / em) * 3.4 * eg;

      /* THE LANTERN REACHES FURTHER AS IT FILLS, and this is not a difficulty
         concession, it is the thing the brief already says out loud: the level
         literally illuminates as you succeed. Fireflies come to light.

         It exists because the bot measured the endgame and the endgame was a
         different, worse game. Herding the swarm works; herding the LAST TWO
         does not, because two flies have almost no cohesion holding them
         together, so there is nothing to push as a body and the warmth just
         scatters them. Six of fourteen sampled levels stalled at 10-of-16,
         13-of-14, 20-of-26. The craft is in walking the swarm across the
         garden. Mopping up is not craft, it is book-keeping.

         At an empty jar this is exactly what it always was. */
      const glow = S.caught / Math.max(1, S.n);
      const mdx = jar.mx - f.x, mdy = jar.my - f.y;
      const md = Math.hypot(mdx, mdy);
      const pullR = jar.mouthW * (1.1 + 1.3 * glow);
      if (md < pullR && md > 1e-4 && f.spook <= 0) {
        const k = (1 - md / pullR) * (TUNE.jarPull / 40) * (0.7 + 0.7 * glow);
        bx += (mdx / md) * k; by += (mdy / md) * k;
      }

      /* --- ITS OWN FLIGHT. Steered responsively toward the boid heading, at
         --- its own comfortable speed, and hard-capped at flyMax. That cap is
         --- what keeps panic traceable: a fly can never reach panicSpeed by
         --- flying, only by being moved. */
      const comfort = REDUCED ? 0.86 : 0.86 + 0.14 * Math.sin(clock * 0.7 + f.ph * 4.1);
      const cruise = TUNE.flyMax * (f.spook > 0 ? TUNE.spookCruise : f.cs * comfort);
      const bm = Math.hypot(bx, by);
      if (bm > 1e-6) {
        const st = { x: (bx / bm * cruise - f.vx) * 3.2,
                     y: (by / bm * cruise - f.vy) * 3.2 };
        clampVec(st, 340);
        f.vx += st.x * dt; f.vy += st.y * dt;
      }
      const ownCap = TUNE.flyMax * (f.spook > 0 ? TUNE.spookCruise : 1);
      const os = Math.hypot(f.vx, f.vy);
      if (os > ownCap) { f.vx = f.vx / os * ownCap; f.vy = f.vy / os * ownCap; }

      /* --- WHAT IS DONE TO IT. The touch, the breeze, a thorn. These do not
         --- steer the fly, they move it, and they let go on their own over
         --- about a second, which is most of what pushing warm air feels like. */
      if (touch) {
        touchForce(f.x, f.y, touch.x, touch.y, TF);
        f.sx += TF.x * dt; f.sy += TF.y * dt;
      }
      if (S.breeze && f.y > S.breeze.y0 && f.y < S.breeze.y1) {
        f.sx += S.breeze.dir * TUNE.breeze * dt;
      }
      // Thorns scatter, and that is all they do. Nothing dies here.
      for (const th of S.thorns) {
        const tdx = f.x - th.x, tdy = f.y - th.y, td = Math.hypot(tdx, tdy);
        if (td < th.r && td > 1e-4) {
          if (f.spook <= 0) { f.spook = TUNE.spookSecs; newlySpooked++; }
          f.sx += tdx / td * TUNE.thornKick * dt * 6;
          f.sy += tdy / td * TUNE.thornKick * dt * 6;
        }
      }
      f.sx *= shoveK; f.sy *= shoveK;
      const shoveCap = TUNE.flyMax * 2.6;
      const ss = Math.hypot(f.sx, f.sy);
      if (ss > shoveCap) { f.sx = f.sx / ss * shoveCap; f.sy = f.sy / ss * shoveCap; }

      // --- move ---
      const px = f.x, py = f.y;
      f.x += (f.vx + f.sx) * dt; f.y += (f.vy + f.sy) * dt;

      /* --- PANIC, on the two velocities together, and always traceable to the
         --- player's own push or a thorn. Never RNG, and never while already
         --- spooked: the timer runs on, it does not re-arm. */
      if (f.spook <= 0 &&
          Math.hypot(f.vx + f.sx, f.vy + f.sy) > TUNE.panicSpeed) {
        f.spook = TUNE.spookSecs; newlySpooked++;
      }

      // --- the jar: capture through the mouth, glass everywhere else ---
      capture(f, px, py);

      if (f.spook > 0) f.spook = Math.max(0, f.spook - dt);

      /* The trail. Sampled every fourth step rather than every step: at 120Hz
          a nine-point trail covers 0.075 seconds, which at cruise is about
          three pixels and reads as no trail at all. Every fourth step over
          twenty points is two thirds of a second, which is the tail length the
          concept art has. */
      f.tk = (f.tk | 0) + 1;
      if (f.tk % 4 === 0) {
        f.trail.push(f.x, f.y);
        const keep = (f.spook > 0 ? 28 : 20) * 2;
        while (f.trail.length > keep) f.trail.splice(0, 2);
      }

      f.ph += dt;
    }

    // ---- spread, off last frame's spooked set ----
    for (let i = 0; i < loose.length; i++) {
      if (!wasSpooked[i]) continue;
      const a = loose[i];
      for (let j = 0; j < loose.length; j++) {
        if (i === j || wasSpooked[j]) continue;
        const b = loose[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < TUNE.spookRadius) {
          const pass = TUNE.spookSecs * TUNE.spookSpread;
          if (b.spook < pass) { if (b.spook <= 0) newlySpooked++; b.spook = pass; }
        }
      }
    }
    if (newlySpooked > 0) {
      S.spookEvents += newlySpooked;
      // A split is a burst, not a single startled fly.
      if (newlySpooked >= 3) {
        S.splits++;
        if (sfx) sfx.play('thump');
      }
    }

    // ---- flies already in the glass mill about ----
    for (const f of F) {
      if (!f.caught) continue;
      f.capT += dt;
      f.jr += f.jsp * dt * (REDUCED ? 0.3 : 1);
      f.ph += dt;
    }

    S.seconds += dt;
    if (phase === 'play' && S.caught >= S.n) {
      phase = 'win'; winT = 0;
      touch = null;
      T().levelComplete(S.lvl, S.spookEvents);
      if (sfx) sfx.play('finish');
    }
  }

  /* Capture, and the proof that the touch can never do it.

     A fly is taken only by CROSSING the mouth plane, from outside to inside,
     within the aperture. Everywhere else the jar is solid glass and the fly is
     turned away, because a fly that can pass through the wall makes the mouth
     meaningless and the mouth width is the difficulty dial for nine tiers.

     The first version dropped the crossing test and asked only whether the fly
     was inside the mouth COLUMN. probeCapture() found what that costs within a
     minute of existing: the column runs the length of the jar and out through
     the base, so flies were being captured by wandering in from underneath and
     never through the mouth at all. Position is not the same question as
     arrival. */
  function capture(f, px, py) {
    const jar = S.jar;
    // into jar-local: u along the mouth, v into the jar
    const rx = f.x - jar.mx, ry = f.y - jar.my;
    const u = rx * jar.tanX + ry * jar.tanY;
    const v = rx * jar.inX + ry * jar.inY;
    const rpx = px - jar.mx, rpy = py - jar.my;
    const pv = rpx * jar.inX + rpy * jar.inY;
    const half = jar.mouthW / 2, hw = jar.w / 2;

    if (!f.caught && pv <= 0 && v > 0 && Math.abs(u) < half) {
      f.caught = true; S.caught++; f.capT = 0;
      f.jr = (u / half) * Math.PI;
      f.jsp = (u >= 0 ? 1 : -1) * (0.5 + Math.abs(u) / half * 0.5);
      f.trail.length = 0;
      if (sfx) {
        // pitched up the fuller the jar, so the ear hears progress too
        const k = S.caught / Math.max(1, S.n);
        sfx.tone(760 + k * 620, 0.10, 0.05, 'sine');
      }
      return;
    }
    if (f.caught) return;

    // Solid glass. Inside the body and not taken by the mouth means it came
    // over the rim or round the side: put it back out the nearest face.
    if (v > 0 && v < jar.h && Math.abs(u) < hw) {
      const outL = u + hw, outR = hw - u, outB = jar.h - v, outT = v;
      const m = Math.min(outL, outR, outB, outT);
      if (m === outT && Math.abs(u) < half) return;   // standing in the doorway
      const push = (nu, nv, dist) => {
        f.x += (jar.tanX * nu + jar.inX * nv) * (dist + 1);
        f.y += (jar.tanY * nu + jar.inY * nv) * (dist + 1);
        const along = (f.vx + f.sx) * (jar.tanX * nu + jar.inX * nv) +
                      (f.vy + f.sy) * (jar.tanY * nu + jar.inY * nv);
        if (along < 0) {          // kill only the component going INTO the wall
          f.sx -= (jar.tanX * nu + jar.inX * nv) * along;
          f.sy -= (jar.tanY * nu + jar.inY * nv) * along;
        }
      };
      if (m === outL) push(-1, 0, outL);
      else if (m === outR) push(1, 0, outR);
      else if (m === outB) push(0, 1, outB);
      else push(0, -1, outT);
    }
  }

  // ---------- SPRITES ----------
  /* Glows are pre-rendered once and blitted, because building a radial gradient
     per fly per frame is the one thing that stops 26 flies plus lit grass
     holding 60fps on a mid-range phone. Every one is a thin bright core with a
     tight feather. None of them is a wide wash. */
  function makeGlow(size, rgb, stops) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [p, a] of stops) {
      grd.addColorStop(p, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')');
    }
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
    return c;
  }
  const SPR = {
    fly:  makeGlow(128, ART.flyGlow,   [[0, 0.98], [0.10, 0.60], [0.30, 0.18],
                                        [0.62, 0.04], [1, 0]]),
    pool: makeGlow(160, ART.flyGlow,   [[0, 0.11], [0.38, 0.035], [1, 0]]),
    haze: makeGlow(192, ART.touchGlow, [[0, 0.17], [0.30, 0.075], [0.66, 0.018],
                                        [1, 0]]),
    warm: makeGlow(192, ART.jarWarm,   [[0, 0.55], [0.22, 0.26], [0.55, 0.06],
                                        [1, 0]]),
  };
  function blit(spr, cx, cy, r, alpha) {
    if (alpha <= 0.002 || r <= 0.2) return;
    ctx.globalAlpha = alpha;
    ctx.drawImage(spr, cx - r, cy - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  // ---------- LIGHT MODEL ----------
  /* There is no sun and no lamp in this garden. Every lit pixel traces back to
     a fly, the touch or the jar, and this is the list that says so. If a build
     ever adds an ambient fill "so things are visible", the register is gone:
     things become visible because a fly went past. */
  /* MEASUREMENT ONLY. When SOLO is set, the garden draws its night and that
     one thing, so a painted-pixel reading of an object is a reading of THAT
     object. Taking the brightest pixel in a window is not enough on its own:
     the breeze row came back at 18.55:1 holding a firefly, and after that was
     fixed it came back at 5.49:1 holding a thorn barb. A row that names one
     thing and measures another is worse than a row that fails, because it
     passes. */
  let SOLO = null;
  const lights = [];
  function gatherLights() {
    lights.length = 0;
    const s = L.scale;
    for (const f of S.flies) {
      if (f.caught) continue;
      lights.push({ x: wx2s(f.x), y: wy2s(f.y), r: 92 * s, i: 0.34 + flashOf(f) * 0.5 });
    }
    const jar = S.jar;
    const fill = S.caught / Math.max(1, S.n);
    if (S.caught > 0 || phase === 'win') {
      lights.push({ x: wx2s(jar.x), y: wy2s(jar.y), r: (150 + 190 * fill) * s,
                    i: 0.30 + 0.85 * fill });
    }
    if (touch) {
      lights.push({ x: wx2s(touch.x), y: wy2s(touch.y),
                    r: TUNE.touchRadius * s * 1.15, i: 0.42 });
    }
    for (const l of lights) l.r2 = l.r * l.r;
  }
  function lightAt(x, y) {
    let b = 0;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      const dx = x - l.x, dy = y - l.y, d2 = dx * dx + dy * dy;
      if (d2 > l.r2) continue;
      const k = 1 - Math.sqrt(d2) / l.r;
      b += k * k * l.i;
      if (b >= 1) return 1;
    }
    return b;
  }

  /* A loose fly blinks on its own 1.2s cycle, offset per fly. Jarred flies fall
     into one rhythm at the win, which is what real Photinus do and is the whole
     signature of the ending. Nothing here goes above 1.5Hz: three flashes over
     2.1 seconds at the win, one blink per 1.2s in play. */
  function flashOf(f) {
    if (REDUCED) return 0.55;
    const u = ((f.caught && phase === 'win' ? winPhase() : f.ph) / 1.2) % 1;
    const d = u - 0.16;
    return Math.exp(-(d * d) / 0.0052);
  }
  function winPhase() { return winT; }

  // ---------- RENDER ----------
  function render() {
    ctx.clearRect(0, 0, LW, LH);

    /* THE CANVAS FLOOR IS CHROME: the Portal wash, at 32% of width on the top
       edge, radius 1.1 x width, three stops, in every game. It is what shows in
       the margin around the garden. */
    const bg = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
    bg.addColorStop(0, TOK.bgPanel);
    bg.addColorStop(0.6, TOK.bgCard);
    bg.addColorStop(1, TOK.bg);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);

    gatherLights();
    drawGarden();
    drawHUD();
    if (TUNE_UI) drawTuneOverlay();
  }

  function drawGarden() {
    const s = L.scale;
    ctx.save();
    UI.roundRectPath(ctx, L.playX, L.playY, L.playW, L.playH, 14);
    ctx.clip();

    // --- the garden's own night. Colder than the site's navy: this game is its
    // --- own night, and it is game art on a token ground.
    const ng = ctx.createLinearGradient(0, L.playY, 0, L.playY + L.playH);
    ng.addColorStop(0, ART.nightTop);
    ng.addColorStop(1, ART.nightBot);
    ctx.fillStyle = ng;
    ctx.fillRect(L.playX, L.playY, L.playW, L.playH);

    if (SOLO) {
      if (SOLO === 'thorns') for (const th of S.thorns) drawThorn(th);
      if (SOLO === 'breeze') drawBreeze();
      if (SOLO === 'jar') drawJar();
      ctx.restore();
      return;
    }

    drawFoliage();

    // --- ground pools: what each light throws down onto the earth ---
    ctx.globalCompositeOperation = 'lighter';
    for (const f of S.flies) {
      if (f.caught) continue;
      blit(SPR.pool, wx2s(f.x), wy2s(f.y) + 10 * s, 78 * s, 0.55 + flashOf(f) * 0.45);
    }
    const fill = S.caught / Math.max(1, S.n);
    if (S.caught > 0) {
      blit(SPR.warm, wx2s(S.jar.x), wy2s(S.jar.y) + S.jar.h * 0.34 * s,
           (108 + 150 * fill) * s, 0.10 + 0.30 * fill);
    }
    if (touch) blit(SPR.haze, wx2s(touch.x), wy2s(touch.y), TUNE.touchRadius * s * 1.05, 0.85);
    ctx.globalCompositeOperation = 'source-over';

    drawBreeze();
    drawGrass(true);
    for (const th of S.thorns) drawThorn(th);
    drawJar();
    if (touch) drawTouch(); else if (hover && MODE === 'desktop') drawAim();
    if (!SOLO) for (const f of S.flies) if (!f.caught) drawFly(f);
    drawGrass(false);
    drawWinWash();

    ctx.restore();
  }

  /* ONE PATH PER BLOB, ONE FILL. Filling each lobe separately compounds the
     alpha where they overlap, and a mass made of six lobes at 0.55 came out
     effectively opaque: the near-black foliage read as a pale green cloud and
     lifted the whole garden off its register. A compound path fills once. */
  function drawFoliage() {
    for (const b of foliage) {
      ctx.beginPath();
      for (const l of b.lobes) {
        ctx.ellipse(b.cx + l.dx, b.cy + l.dy, l.rx, l.ry, l.rot, 0, Math.PI * 2);
      }
      ctx.fillStyle = 'rgba(12,27,22,0.55)';
      ctx.fill();
      const lit = lightAt(b.cx, b.cy);
      if (lit > 0.02) {
        ctx.fillStyle = 'rgba(78,124,92,' + Math.min(0.16, lit * 0.18).toFixed(3) + ')';
        ctx.fill();
      }
    }
  }

  /* Grass is scenery, and it is the one thing in the garden that is allowed to
     sit under the 3:1 graphical bar: nothing in the game depends on seeing a
     blade. What it does carry is the light model, and that is the detail that
     sells the whole scene: a blade brightens at the tip when a fly goes over
     it. The garden is lit BY its own subjects or it is not lit at all. */
  const GRASS_INK = ['rgba(26,52,44,0.40)', 'rgba(30,60,50,0.62)', 'rgba(16,34,29,0.90)'];
  const GRASS_W = [1.7, 2.4, 3.2];
  function drawGrass(behindTheFlies) {
    const t = REDUCED ? 0 : clock;
    ctx.lineCap = 'round';
    for (const b of grass) {
      if ((b.row < 2) !== behindTheFlies) continue;
      const sway = Math.sin(t * 0.55 + b.ph) * (b.row === 0 ? 4 : b.row === 1 ? 7 : 10);
      const tipX = b.x + b.lean * b.h + sway, tipY = b.y - b.h;
      const midX = b.x + b.lean * b.h * 0.3 + sway * 0.35, midY = b.y - b.h * 0.55;
      ctx.lineWidth = GRASS_W[b.row];
      ctx.strokeStyle = GRASS_INK[b.row];
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.quadraticCurveTo(midX, midY, tipX, tipY);
      ctx.stroke();

      // The nearest band is a silhouette between the player and the garden.
      // Nothing lights it from in front, so it never brightens.
      const lit = b.row === 2 ? 0 : lightAt(tipX, tipY);
      if (lit > 0.02) {
        ctx.lineWidth = GRASS_W[b.row] - 0.2;
        ctx.strokeStyle = 'rgba(196,232,150,' + Math.min(0.78, lit * 0.85).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.quadraticCurveTo((midX + tipX) / 2, (midY + tipY) / 2, tipX, tipY);
        ctx.stroke();
      }
    }
  }

  /* A breeze is never a surprise. The band it acts in is drawn, the direction
     is drawn, and the streaks move at the speed of the thing pushing. */
  function drawBreeze() {
    const B = S.breeze;
    if (!B) return;
    const s = L.scale;
    const y0 = wy2s(B.y0), y1 = wy2s(B.y1);
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0,   'rgba(200,236,255,0)');
    g.addColorStop(0.5, 'rgba(200,236,255,0.045)');
    g.addColorStop(1,   'rgba(200,236,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(L.playX, y0, L.playW, y1 - y0);

    if (!REDUCED) {
      for (const m of B.motes) {
        m.x += B.dir * m.v * 40 * (1 / 60);
        if (m.x > TUNE.arena + 60) m.x = -60;
        if (m.x < -60) m.x = TUNE.arena + 60;
      }
    }
    ctx.lineCap = 'round'; ctx.lineWidth = 1.4;
    for (const m of B.motes) {
      const x = wx2s(m.x), y = wy2s(m.y);
      /* The head of a streak is the readable part and it has to clear 3:1 on
         the night by itself: the brief's own line is that a breeze is never a
         surprise. At 0.30 it painted rgb(74,90,97) and measured 2.72:1 on one
         level and 3.17:1 on another, which is a marginal object rather than a
         visible one. The streak is a 1.4px line fading to nothing along its
         length, so a brighter head is not a brighter breeze; it is a breeze you
         can see. */
      const g2 = ctx.createLinearGradient(x, y, x - B.dir * m.len * s, y);
      g2.addColorStop(0, 'rgba(206,238,255,0.46)');
      g2.addColorStop(1, 'rgba(206,238,255,0)');
      ctx.strokeStyle = g2;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x - B.dir * m.len * s, y); ctx.stroke();
    }
  }

  /* Thorns. The shape says danger, not the colour. Barbs alone came out as a
     red scribble that read as an insect, which in a game about insects is the
     worst possible reading: they need STEMS, because a thorn is a thing that
     grows. Dark woody stems carry the mass, the dried tips sit along them, and
     everything stays inside the radius the bush actually scatters at. Drawn
     wider than that it would promise a danger the rule does not have. */
  function drawThorn(th) {
    const s = L.scale;
    const x = wx2s(th.x), y = wy2s(th.y), r = th.r * s;

    const g = ctx.createRadialGradient(x, y - r * 0.15, 0, x, y, r * 1.35);
    g.addColorStop(0, 'rgba(13,21,18,0.98)');
    g.addColorStop(0.6, 'rgba(13,21,18,0.66)');
    g.addColorStop(1, 'rgba(13,21,18,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, Math.PI * 2); ctx.fill();

    const rnd = mulberry32(th.seed | 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const stems = 5;
    for (let i = 0; i < stems; i++) {
      const a = (i / stems) * Math.PI * 2 + rnd() * 0.7;
      const len = r * (0.62 + rnd() * 0.32);
      const bend = (rnd() - 0.5) * 0.9;
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      const mx = x + Math.cos(a + bend) * len * 0.55;
      const my = y + Math.sin(a + bend) * len * 0.55;

      ctx.strokeStyle = 'rgba(38,30,24,0.90)';
      ctx.lineWidth = Math.max(1.2, 2.6 * s);
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();

      /* Two dried barbs per stem, each a dark matte body with a THIN BRIGHT
         CORE laid down it. The brief's #8A4438 at 0.68 paints as rgb(105,55,46)
         and measures 2.01:1 against the night, under a 3:1 bar for a graphical
         object you have to see before you push a swarm into it. Simply
         brightening the whole barb makes a loud thorn in a game with no other
         warm light, which is the thing the brief spends a line warning against.
         So: mass stays dried, and the edge is made of value. The core paints at
         about 5.2:1 and is a pixel and a bit wide. */
      for (let b = 0; b < 2; b++) {
        const t = 0.45 + b * 0.32;
        const bxp = x + (mx - x) * 2 * t * (1 - t) + (ex - x) * t * t;
        const byp = y + (my - y) * 2 * t * (1 - t) + (ey - y) * t * t;
        const ba = a + bend * 0.5 + (b ? 1 : -1) * (0.7 + rnd() * 0.5);
        const bl = Math.max(3, r * 0.26);
        const tx = bxp + Math.cos(ba) * bl, ty = byp + Math.sin(ba) * bl;
        ctx.strokeStyle = 'rgba(96,48,39,0.90)';
        ctx.lineWidth = Math.max(1.6, 3.0 * s);
        ctx.beginPath(); ctx.moveTo(bxp, byp); ctx.lineTo(tx, ty); ctx.stroke();
        // The core keeps a 1.1px floor on purpose: it is the pixel the
        // contrast sweep reads, and below a pixel antialiasing dims it under
        // the 3:1 bar. Verified at 480x360, the smallest frame /embed/ takes.
        ctx.strokeStyle = 'rgba(198,120,98,0.94)';
        ctx.lineWidth = Math.max(1.1, 1.4 * s);
        ctx.beginPath(); ctx.moveTo(bxp, byp); ctx.lineTo(tx, ty); ctx.stroke();
      }
    }
  }

  /* THE JAR. Progress IS illumination: the interior glow scales with the count,
     so one-of-eighteen is a faint warmth and seventeen-of-eighteen is the
     brightest object the game ever shows. The chip only confirms what the
     picture already said.

     GLASS IS HIGHLIGHTS, NOT FILL, and the first build proved why the brief
     says so twice. A 10% body fill plus two wide gradient slabs down the flanks
     came out as a solid grey tin can, in a game whose whole register is that
     you can see through things. What glass is: a silhouette you can barely see,
     a very narrow bright edge where it turns away from you, a pool of light
     where it thickens at the base, and a band across the rim. Everything else
     is what is behind it. No outline anywhere: every edge here is value.

     There is a floor under the warmth, because an unlit jar in a black garden
     is a target you cannot find. It is a lantern; a lantern is never fully
     out. */
  function jarPath(w, h, mouthW) {
    const bh = w / 2, mh = mouthW / 2, lip = mh * 1.10;
    const neck = h * 0.085, sh = h * 0.15, base = w * 0.20;
    ctx.beginPath();
    ctx.moveTo(-lip, 0);
    ctx.lineTo(-mh, neck * 0.45);
    ctx.lineTo(-mh, neck);
    ctx.quadraticCurveTo(-bh, neck + sh * 0.5, -bh, neck + sh);
    ctx.lineTo(-bh, h - base);
    ctx.quadraticCurveTo(-bh, h, -bh + base, h);
    ctx.lineTo(bh - base, h);
    ctx.quadraticCurveTo(bh, h, bh, h - base);
    ctx.lineTo(bh, neck + sh);
    ctx.quadraticCurveTo(bh, neck + sh * 0.5, mh, neck);
    ctx.lineTo(mh, neck * 0.45);
    ctx.lineTo(lip, 0);
    ctx.closePath();
  }

  function drawJar(atX, atY, atScale, upright) {
    const jar = S.jar;
    const s = (atScale != null ? atScale : L.scale);
    const w = jar.w * s, h = jar.h * s, mouthW = jar.mouthW * s;
    const fill = S.caught / Math.max(1, S.n);
    const inScene = atX == null;
    const lamp = phase === 'win' ? 1 : 0.12 + 0.88 * fill;
    const flare = phase === 'win' ? winFlash() : 0;

    ctx.save();
    ctx.translate(inScene ? wx2s(jar.mx) : atX, inScene ? wy2s(jar.my) : atY);
    if (!upright) ctx.rotate(jar.ang);

    // --- what is BEHIND the glass, clipped by it: the warmth, and the flies
    // --- already in it. Nothing here is the glass; the glass is below.
    ctx.save();
    jarPath(w, h, mouthW);
    ctx.clip();

    const body = ctx.createLinearGradient(0, 0, 0, h);
    body.addColorStop(0, 'rgba(198,224,240,0.055)');
    body.addColorStop(1, 'rgba(198,224,240,0.020)');
    ctx.fillStyle = body;
    ctx.fillRect(-w, -h * 0.1, w * 2, h * 1.3);

    ctx.globalCompositeOperation = 'lighter';
    blit(SPR.warm, 0, h * 0.62, w * (0.85 + 0.60 * lamp + flare * 0.30),
         0.34 + 0.60 * lamp + flare * 0.40);
    for (const f of S.flies) {
      if (!f.caught) continue;
      const fx = Math.sin(f.jr) * w * 0.24;
      const fy = h * 0.60 + Math.cos(f.jr * 0.83) * h * 0.19;
      const br = flashOf(f);
      blit(SPR.fly, fx, fy, Math.max(7, 20 * s) * (0.82 + br * 0.5), 0.55 + br * 0.45);
      ctx.fillStyle = ART.flyCore;
      ctx.globalAlpha = 0.70 + br * 0.30;
      ctx.beginPath(); ctx.arc(fx, fy, Math.max(1.2, 2.0 * s), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';

    /* The four highlights, all of them inside the silhouette clip so each one
       follows the shoulder and the base instead of cutting across them. They
       are NARROW. A highlight a third of the way across a body is a painted
       panel, not a reflection. */
    const bh = w / 2;
    // 1. the lit flank, up and slightly left, as in every Zamborin game
    const g1 = ctx.createLinearGradient(-bh, 0, -bh + w * 0.10, 0);
    g1.addColorStop(0, 'rgba(255,255,255,' + (0.30 + fill * 0.16).toFixed(3) + ')');
    g1.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g1; ctx.fillRect(-bh, 0, w * 0.10, h);
    // 2. the cold rim down the shaded flank, thinner still
    const g2 = ctx.createLinearGradient(bh, 0, bh - w * 0.055, 0);
    g2.addColorStop(0, 'rgba(206,232,246,' + (0.24 + fill * 0.12).toFixed(3) + ')');
    g2.addColorStop(1, 'rgba(206,232,246,0)');
    ctx.fillStyle = g2; ctx.fillRect(bh - w * 0.055, 0, w * 0.055, h);
    // 3. where the glass thickens at the base and pools the light
    const g3 = ctx.createLinearGradient(0, h, 0, h - h * 0.14);
    g3.addColorStop(0, 'rgba(255,236,198,' + (0.16 + lamp * 0.26).toFixed(3) + ')');
    g3.addColorStop(1, 'rgba(255,236,198,0)');
    ctx.fillStyle = g3; ctx.fillRect(-bh, h - h * 0.14, w, h * 0.14);
    // 4. the shoulder catch: a short, narrow vertical streak
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    UI.roundRectPath(ctx, -w * 0.26, h * 0.14, w * 0.035, h * 0.20, w * 0.02);
    ctx.fill();
    ctx.restore();

    // --- the rim of the mouth. A band, never a stroke: the glass turns away
    // --- from you there and catches the sky.
    /* The rim is exactly the lip that jarPath() draws, and no wider. At 0.62
       of mouthW this was being used as though mouthW were a radius, so the
       ellipse came out wider than the jar's own half-width and stuck out of
       both flanks as a grey spike. */
    const rimW = mouthW * 0.55;
    const rg = ctx.createLinearGradient(0, -h * 0.028, 0, h * 0.030);
    rg.addColorStop(0, 'rgba(255,255,255,0.05)');
    rg.addColorStop(0.55, 'rgba(255,255,255,0.30)');
    rg.addColorStop(1, 'rgba(255,255,255,0.03)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.ellipse(0, 0, rimW, Math.max(2, h * 0.032), 0, 0, Math.PI * 2);
    ctx.fill();
    // the mouth itself is a hole, and a hole is darker than what surrounds it
    ctx.fillStyle = 'rgba(4,8,10,0.55)';
    ctx.beginPath();
    ctx.ellipse(0, h * 0.006, rimW * 0.86, Math.max(1.4, h * 0.024), 0, 0, Math.PI * 2);
    ctx.fill();

    // --- the lid, left leaning on the rim the way one is in a garden ---
    ctx.save();
    /* A disc seen almost edge-on reads as a blade, which is what the first two
       versions of this lid looked like. A lid propped against a rim is seen
       from ABOVE and to the side: wide, shallow, and thick enough to have an
       edge of its own. */
    ctx.translate(-w * 0.15, -h * 0.030);
    ctx.rotate(-0.16);
    const lidW = mouthW * 0.78, lidH = mouthW * 0.25;
    const lip = Math.max(1.6, mouthW * 0.055);
    ctx.fillStyle = 'rgba(72,84,92,0.34)';          // the edge, in shadow
    ctx.beginPath();
    ctx.ellipse(0, lip, lidW / 2, lidH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    const lg = ctx.createLinearGradient(-lidW / 2, -lidH / 2, lidW / 2, lidH / 2);
    lg.addColorStop(0, 'rgba(206,220,228,0.40)');   // lit from up and left
    lg.addColorStop(0.6, 'rgba(140,156,166,0.30)');
    lg.addColorStop(1, 'rgba(94,108,118,0.26)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.ellipse(0, 0, lidW / 2, lidH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(240,248,252,0.16)';       // the shallow dome on top
    ctx.beginPath();
    ctx.ellipse(-lidW * 0.09, -lidH * 0.14, lidW / 2 * 0.62, lidH / 2 * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  /* THE TOUCH. A warmth, and only ever a warmth. Three rings breathe at 2s and
     the middle one is not decoration: it is the radius solved in panicRadius(),
     so the line the player can see is the line the physics uses. The haze is
     proportional to the push actually being applied, so the hand shows its own
     strength. */
  function drawTouch() {
    const s = L.scale;
    const x = wx2s(touch.x), y = wy2s(touch.y);
    const breathe = REDUCED ? 1 : 1 + Math.sin(clock * Math.PI) * 0.03;
    const R = TUNE.touchRadius * s * breathe;
    const P = panicRadius() * s * breathe;

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = Math.max(1, 1.4 * s);
    ctx.strokeStyle = 'rgba(255,232,170,0.20)';
    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();

    ctx.lineWidth = Math.max(1.2, 2.0 * s);
    ctx.strokeStyle = 'rgba(255,232,170,0.42)';
    ctx.beginPath(); ctx.arc(x, y, P, 0, Math.PI * 2); ctx.stroke();

    blit(SPR.haze, x, y, Math.max(8, 30 * s), 0.95);
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawFly(f) {
    const s = L.scale;
    const br = flashOf(f);
    const spooked = f.spook > 0;
    const x = wx2s(f.x), y = wy2s(f.y);

    // The trail: fear reads as speed, never as a new colour. A frightened fly
    // simply leaves more of itself behind.
    /* Four strokes, not twenty-eight. A per-sample taper meant 26 flies at a
       28-point trail issued 728 stroke() calls a frame, and a stroke call is
       the expensive kind. Four chunks of rising alpha and width read as the
       same taper and cost 104. */
    const tn = f.trail.length / 2;
    if (tn >= 4) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const CH = 4, per = tn / CH;
      for (let c = 0; c < CH; c++) {
        const i0 = Math.floor(c * per), i1 = Math.min(tn - 1, Math.floor((c + 1) * per));
        if (i1 <= i0) continue;
        const k = (c + 1) / CH;
        ctx.strokeStyle = 'rgba(216,240,144,' + (k * (spooked ? 0.46 : 0.26)).toFixed(3) + ')';
        ctx.lineWidth = Math.max(0.7, k * 2.4 * s);
        ctx.beginPath();
        ctx.moveTo(wx2s(f.trail[i0 * 2]), wy2s(f.trail[i0 * 2 + 1]));
        for (let i = i0 + 1; i <= i1; i++) {
          ctx.lineTo(wx2s(f.trail[i * 2]), wy2s(f.trail[i * 2 + 1]));
        }
        ctx.stroke();
      }
    }

    ctx.globalCompositeOperation = 'lighter';
    // A spooked fly's glow TIGHTENS. Same colour, less spread, harder core.
    const spread = spooked ? 0.62 : 1;
    /* A REAL BLINK. At a 0.58 floor the swing measured 9% of the fly's total
       brightness, which is a shimmer, and the brief asks for flies that blink
       independently. 0.42 to 1.0 is a blink you can count, and at one pulse
       per 1.2s it is 0.83Hz, comfortably under the 3Hz photosensitivity
       ceiling. Under reduced motion flashOf() returns a constant and this
       collapses to a steady lamp on its own. */
    blit(SPR.fly, x, y, Math.max(7, 27 * s) * spread * (0.74 + br * 0.55),
         (0.42 + br * 0.58) * (spooked ? 1.18 : 1));
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = ART.flyCore;
    ctx.globalAlpha = 0.46 + br * 0.54;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.3, 2.2 * s) * (0.86 + br * 0.24) * (spooked ? 1.15 : 1),
            0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* The win: every jarred fly falls into ONE rhythm and flashes together three
     times, which is what Photinus actually do, and each pulse washes the whole
     garden. Then it settles to a steady lamp. No confetti, ever.
     0.83Hz, well under the 3Hz photosensitivity ceiling. */
  function winFlash() {
    if (phase !== 'win') return 0;
    if (REDUCED) return Math.min(1, winT / 1.6) * (winT < 3.2 ? 1 : 1);
    if (winT > 3.0) return 0.55;
    const u = (winT / 1.2) % 1, d = u - 0.16;
    return Math.exp(-(d * d) / 0.0052);
  }
  function drawWinWash() {
    if (phase !== 'win') return;
    const f = winFlash();
    if (f <= 0.01) return;
    const jx = wx2s(S.jar.x), jy = wy2s(S.jar.y);
    const g = ctx.createRadialGradient(jx, jy, 0, jx, jy, Math.max(L.playW, L.playH) * 1.1);
    g.addColorStop(0, 'rgba(255,214,138,' + (0.16 * f).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,214,138,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(L.playX, L.playY, L.playW, L.playH);
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- HUD ----------
  /* All chrome, all from tokens, buttons at ZAM_UI sizes and never scaled.
     One band at the top holds the read-out; the controls sit left in it on
     desktop and at thumb height on a phone. Order is fixed by the house rule
     and RESTART is the only control this game has: there is nothing to undo,
     no hint to give, and the rules card arrives in M4. */
  function speakerGlyph(cx, cy, on) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = TOK.ink92;
    ctx.beginPath();
    ctx.moveTo(-7, -3.4); ctx.lineTo(-2.6, -3.4); ctx.lineTo(2.2, -7.6);
    ctx.lineTo(2.2, 7.6); ctx.lineTo(-2.6, 3.4); ctx.lineTo(-7, 3.4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = TOK.ink92; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
    if (on) {
      ctx.beginPath(); ctx.arc(3.4, 0, 3.6, -0.85, 0.85); ctx.stroke();
      ctx.beginPath(); ctx.arc(3.4, 0, 6.4, -0.85, 0.85); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(4.6, -4.4); ctx.lineTo(9.4, 4.4);
      ctx.moveTo(9.4, -4.4); ctx.lineTo(4.6, 4.4); ctx.stroke();
    }
    ctx.restore();
  }

  function drawHUD() {
    const cy = L.ctrlCy;
    const won = phase === 'win' && winT > 3.2;
    hit.mute = hit.restart = hit.next = null;

    // --- measure the row, then lay it out from its own end ---
    const items = [{ k: 'mute', w: UI.PILL.iconW }];
    if (won) items.push({ k: 'next', w: UI.ctaWidth(ctx, 'NEXT'), cta: true });
    else items.push({ k: 'restart', w: UI.pillWidth(ctx, 'RESTART') });
    let total = 0;
    for (const it of items) total += it.w;
    total += UI.PILL.gap * (items.length - 1);

    const rowLeft = MODE === 'mobile'
      ? Math.round((LW - total) / 2)
      : SIDE_PAD;
    let x = rowLeft;
    for (const it of items) {
      const c = x + it.w / 2;
      if (it.cta) hit[it.k] = UI.drawCTA(ctx, 'NEXT', c, cy, TOK.accent);
      else if (it.k === 'mute') {
        hit.mute = UI.drawPill(ctx, '', c, cy, { w: UI.PILL.iconW });
        speakerGlyph(c, cy, sfx ? sfx.isOn() : true);
      } else {
        hit.restart = UI.drawPill(ctx, 'RESTART', c, cy);
      }
      x += it.w + UI.PILL.gap;
    }

    /* The read-out: one right-aligned line on the band centre, shrunk into
       whatever the row leaves it. They lay out from opposite ends of the same
       band and nothing else checks that they do not collide. */
    const bandCy = topBand() / 2;
    const rowRight = MODE === 'mobile' ? 0 : rowLeft + total;
    const avail = LW - SIDE_PAD - rowRight - 16;
    const txt = MODE === 'mobile'
      ? 'IN THE JAR ' + S.caught + ' / ' + S.n + '   ·   LEVEL ' + S.lvl
      : 'IN THE JAR ' + S.caught + ' / ' + S.n;
    let hs = Math.max(0.66, Math.min(1, LW / 620));
    ctx.font = '600 ' + (16 * hs).toFixed(1) + 'px Inter, sans-serif';
    while (ctx.measureText(txt).width > avail && hs > 0.66) {
      hs -= 0.02;
      ctx.font = '600 ' + (16 * hs).toFixed(1) + 'px Inter, sans-serif';
    }
    ctx.fillStyle = TOK.ink72;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, LW - SIDE_PAD, bandCy);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    L.readoutLeft = LW - SIDE_PAD - ctx.measureText(txt).width;
    L.rowRight = rowRight;

    if (MODE === 'desktop') drawColumn();
  }

  /* The desktop side space carries something real: the same jar, upright and
     drawn large, filling as the scene's jar fills. It mirrors in-scene truth
     and holds no information the garden does not already show. */
  function drawColumn() {
    const c = L.col;
    /* The panel carries the garden's own night. Drawn on the Portal wash the
       jar came out as a grey canister: glass is defined by what is behind it,
       and behind it there has to be a night. */
    const pg = ctx.createLinearGradient(0, c.y, 0, c.y + c.h);
    pg.addColorStop(0, ART.nightTop);
    pg.addColorStop(1, ART.nightBot);
    ctx.fillStyle = pg;
    UI.roundRectPath(ctx, c.x, c.y, c.w, c.h, 14);
    ctx.fill();

    const s = Math.min((c.w - 44) / S.jar.w, (c.h * 0.54) / S.jar.h);
    const cx = c.x + c.w / 2;
    const top = c.y + (c.h - 40 - S.jar.h * s) / 2;
    drawJar(cx, top, s, true);

    ctx.fillStyle = TOK.ink72;
    ctx.font = '600 16px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('LEVEL ' + S.lvl, cx, c.y + c.h - 22);
    ctx.textAlign = 'left';
  }

  // ---------- INPUT ----------
  function inBox(b, x, y) {
    return b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }
  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (LW / r.width),
             y: (e.clientY - r.top) * (LH / r.height) };
  }
  // The warmth is lifted clear of the fingertip on a phone, because the ring
  // that says where they panic is 40 screen pixels across and a fingertip is
  // 45. The forces are identical; only where the hand puts the point moves.
  function toWorld(p) {
    return { x: s2wx(p.x), y: s2wy(p.y - TUNE.touchLift) };
  }
  function inPlay(p) {
    return p.x >= L.playX && p.x <= L.playX + L.playW &&
           p.y >= L.playY && p.y <= L.playY + L.playH;
  }

  let pointerId = null;
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (sfx) sfx.ensureAudio();
    const p = toLogical(e);
    if (inBox(hit.mute, p.x, p.y)) {
      if (sfx) { sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.play('click'); }
      return;
    }
    if (inBox(hit.restart, p.x, p.y)) { restart(); return; }
    if (inBox(hit.next, p.x, p.y)) { nextLevel(); return; }
    if (phase !== 'play' || !inPlay(p)) return;
    pointerId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    touch = toWorld(p);
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = toLogical(e);
    if (pointerId !== null && e.pointerId === pointerId) { touch = toWorld(p); return; }
    hover = (MODE === 'desktop' && phase === 'play' && inPlay(p)) ? p : null;
  });
  function endTouch(e) {
    if (pointerId === null || (e && e.pointerId !== pointerId)) return;
    pointerId = null; touch = null;
  }
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);
  canvas.addEventListener('pointerleave', (e) => { endTouch(e); hover = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') restart();
    else if (e.key === 'm' || e.key === 'M') { if (sfx) sfx.setOn(!sfx.isOn()); }
    else if ((e.key === 'Enter' || e.key === ' ') && phase === 'win') nextLevel();
    else if (e.key === '[') gotoLevel(S.lvl - 1);
    else if (e.key === ']') gotoLevel(S.lvl + 1);
    else return;
    e.preventDefault();
  });

  function restart() {
    T().levelRestart(S.lvl);
    gotoLevel(S.lvl);
    if (sfx) sfx.play('tick');
  }
  function nextLevel() { gotoLevel(Math.min(LEVELS, S.lvl + 1)); }
  function gotoLevel(n) {
    n = Math.min(LEVELS, Math.max(1, n));
    S = buildScene(n);
    phase = 'play'; winT = 0; clock = 0; touch = null; pointerId = null;
    save.lvl = n; persist();
    layout(); buildScenery();
    T().levelStart(n);
  }

  /* THE TOUCH FORCE, in one place, so that the thing the simulation applies and
     the thing the assertion checks cannot drift apart. It writes into `out` to
     keep the inner loop free of allocation.

     Every component of it points AWAY from the touch. There is no branch in
     here that can produce an inward term, and `assertNoCapture()` proves that
     over the whole field rather than taking this comment's word for it. */
  function touchForce(fx, fy, tx, ty, out) {
    const dx = fx - tx, dy = fy - ty;
    const d = Math.hypot(dx, dy);
    if (d >= TUNE.touchRadius) { out.x = 0; out.y = 0; out.d = d; return out; }
    const p = TUNE.pushMax * pushFalloff(d);
    if (d > 1e-4) { out.x = dx / d * p; out.y = dy / d * p; }
    else { out.x = p; out.y = 0; }     // dead centre: pick an axis, never /0
    out.d = d;
    return out;
  }

  // ---------- TUNING (?tune=1) ----------
  /* Dev only, and gated on the query string so it can never ship. The point of
     M0 is to hold the thing and say whether pushing feels like moving warm air;
     that conversation goes faster with the dial in the owner's hand than with a
     round trip through me for every value. */
  const SLIDERS = [
    ['panicSpeed', 62, 130, 1], ['pushMax', 40, 180, 1],
    ['touchRadius', 60, 220, 1], ['flyMax', 30, 110, 1],
    ['shoveDamp', 0.4, 3, 0.05], ['coh', 0, 1.6, 0.05],
    ['sep', 10, 60, 1], ['align', 0, 1.2, 0.05],
    ['wander', 0, 1.2, 0.05], ['spookSecs', 0.4, 4, 0.1],
    ['spookRadius', 16, 110, 1], ['jarPull', 0, 120, 1],
    ['touchLift', 0, 90, 1],
  ];
  function buildTunePanel() {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;right:8px;top:8px;z-index:99;width:212px;' +
      'background:rgba(10,16,28,0.92);border:1px solid rgba(255,255,255,0.12);' +
      'border-radius:12px;padding:10px 12px;font:600 11px Inter,sans-serif;' +
      'color:#C5CFE0;max-height:92vh;overflow:auto';
    box.innerHTML = '<div style="font:800 12px Inter;color:#fff;margin-bottom:6px">' +
      'LANTERN · feel spike</div>';
    for (const [k, lo, hi, st] of SLIDERS) {
      const row = document.createElement('div');
      row.style.cssText = 'margin:5px 0';
      const lab = document.createElement('div');
      lab.textContent = k + '  ' + TUNE[k];
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = lo; inp.max = hi; inp.step = st;
      inp.value = TUNE[k]; inp.style.cssText = 'width:100%';
      inp.addEventListener('input', () => {
        TUNE[k] = parseFloat(inp.value);
        lab.textContent = k + '  ' + TUNE[k];
      });
      row.appendChild(lab); row.appendChild(inp); box.appendChild(row);
    }
    const nav = document.createElement('div');
    nav.style.cssText = 'display:flex;gap:6px;margin-top:8px';
    for (const [txt, fn] of [['◀ LVL', () => gotoLevel(S.lvl - 1)],
                             ['LVL ▶', () => gotoLevel(S.lvl + 1)],
                             ['RESET', () => { location.reload(); }]]) {
      const b = document.createElement('button');
      b.textContent = txt;
      b.style.cssText = 'flex:1;padding:6px 0;border-radius:8px;cursor:pointer;' +
        'background:rgba(255,255,255,0.07);color:#fff;' +
        'border:1px solid rgba(255,255,255,0.40);font:700 11px Inter';
      b.addEventListener('click', fn);
      nav.appendChild(b);
    }
    box.appendChild(nav);
    document.body.appendChild(box);
  }
  let fps = 0, fpsAcc = 0, fpsN = 0;
  function drawTuneOverlay() {
    const lines = [
      'tier ' + (S.tier + 1) + '  ·  flies ' + S.n + '  ·  mouth ' + S.jar.mouthW,
      'panic ring ' + panicRadius().toFixed(1) + ' of ' + TUNE.touchRadius,
      'spooks ' + S.spookEvents + '  ·  splits ' + S.splits,
      'seconds ' + S.seconds.toFixed(1) + '  ·  fps ' + fps.toFixed(0),
    ];
    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], MODE === 'mobile' ? 10 : SIDE_PAD, LH - botBand() + 4 + i * 13);
    }
  }

  // ---------- MEASUREMENT ----------
  /* Everything below reports numbers. Nothing below changes the game.
     A failing check is usually the check, so each one carries its own controls
     and prints them: if a control is wrong the finding is worthless. */
  const srgbL = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (r, g, b) => 0.2126 * srgbL(r) + 0.7152 * srgbL(g) + 0.0722 * srgbL(b);
  function ratio(a, b) {
    const l1 = Math.max(a, b), l2 = Math.min(a, b);
    return (l1 + 0.05) / (l2 + 0.05);
  }
  function devicePx(x, y, w, h) {
    const d = L.dscale || 1;
    return ctx.getImageData(Math.round(x * d), Math.round(y * d),
                            Math.max(1, Math.round(w * d)),
                            Math.max(1, Math.round(h * d)));
  }
  // The brightest and the darkest painted pixel in a logical-space window.
  function extremesIn(x, y, w, h) {
    const im = devicePx(x, y, w, h).data;
    let bi = -1, bl = -1, di = -1, dl = 2;
    for (let i = 0; i < im.length; i += 4) {
      const l = lum(im[i], im[i + 1], im[i + 2]);
      if (l > bl) { bl = l; bi = i; }
      if (l < dl) { dl = l; di = i; }
    }
    return {
      bright: [im[bi], im[bi + 1], im[bi + 2]], brightL: bl,
      dark: [im[di], im[di + 1], im[di + 2]], darkL: dl,
    };
  }

  window.__lantern = {
    state: () => ({
      lvl: S.lvl, tier: S.tier + 1, n: S.n, caught: S.caught,
      spookEvents: S.spookEvents, splits: S.splits,
      seconds: +S.seconds.toFixed(2), phase, mode: MODE,
      panicRadius: +panicRadius().toFixed(2), touchRadius: TUNE.touchRadius,
      scale: +(L.scale || 0).toFixed(4), fps: +fps.toFixed(1),
    }),
    layout: () => ({
      LW, LH, mode: MODE, topBand: topBand(), botBand: botBand(),
      arenaSide: L.side, ox: L.ox, oy: L.oy,
      playX: L.playX, playY: L.playY, playW: L.playW, playH: L.playH,
      ctrlCy: L.ctrlCy, readoutLeft: +(L.readoutLeft || 0).toFixed(1),
      rowRight: L.rowRight,
      // the one collision nothing else checks: the control row and the
      // read-out lay out from opposite ends of the same band
      bandOverlapPx: +Math.max(0, (L.rowRight || 0) - (L.readoutLeft || LW)).toFixed(1),
    }),
    setLevel: (n) => { gotoLevel(n); return S.lvl; },
    tune: (k, v) => { if (v != null) TUNE[k] = v; return TUNE[k]; },
    tuneAll: () => JSON.parse(JSON.stringify(TUNE)),

    /* THE ONE RULE, asserted rather than asserted-in-a-comment. Sweeps the
       whole field: every touch position against every fly position, through the
       SAME function the simulation calls. A future edit that adds an inward
       term to the touch fails here on the next run. */
    assertNoCapture(grid) {
      const g = grid || 41, A = TUNE.arena, out = { x: 0, y: 0, d: 0 };
      let pairs = 0, overMax = 0, notRadial = 0, worstMag = 0, worstRadialErr = 0;
      for (let ti = 0; ti < g; ti++) for (let tj = 0; tj < g; tj++) {
        const tx = (ti / (g - 1)) * A, ty = (tj / (g - 1)) * A;
        for (let fi = 0; fi < g; fi++) for (let fj = 0; fj < g; fj++) {
          const fx = (fi / (g - 1)) * A, fy = (fj / (g - 1)) * A;
          touchForce(fx, fy, tx, ty, out);
          const mag = Math.hypot(out.x, out.y);
          if (mag === 0) continue;
          pairs++;
          if (mag > worstMag) worstMag = mag;
          if (mag > TUNE.pushMax + 1e-9) overMax++;
          const dx = fx - tx, dy = fy - ty, d = Math.hypot(dx, dy);
          if (d > 1e-6) {
            // component along the OUTWARD unit vector. For a purely repulsive
            // force this equals the magnitude exactly.
            const radial = (out.x * dx + out.y * dy) / d;
            const err = mag - radial;
            if (err > worstRadialErr) worstRadialErr = err;
            if (err > 1e-9) notRadial++;
          }
        }
      }
      return {
        pairsTested: pairs,
        pushMax: TUNE.pushMax,
        worstMagnitude: +worstMag.toFixed(6),
        forcesOverPushMax: overMax,
        forcesWithInwardComponent: notRadial,
        worstInwardComponent: +worstRadialErr.toExponential(2),
        pass: overMax === 0 && notRadial === 0,
        // controls: a force that IS inward must be caught, and a zero force
        // must not be counted. If these two are wrong the sweep proves nothing.
        control_inwardIsCaught: (() => {
          const o = { x: -10, y: 0 }, dx = 5, dy = 0, d = 5;
          const radial = (o.x * dx + o.y * dy) / d;
          return Math.hypot(o.x, o.y) - radial > 1e-9;
        })(),
        control_outOfRangeIsZero: (() => {
          touchForce(0, 0, TUNE.touchRadius + 1, 0, out);
          return out.x === 0 && out.y === 0;
        })(),
      };
    },

    /* Contrast on the PAINTED pixel, because source hexes and the screen are
       different numbers: alpha, compositing and 'lighter' all sit in between.
       Null test first, sampler control second, pairing control third. Only then
       the findings. */
    contrast() {
      const nulls = {
        whiteOnBlack: +ratio(lum(255, 255, 255), lum(0, 0, 0)).toFixed(2),  // 21.00
        whiteOnWhite: +ratio(lum(255, 255, 255), lum(255, 255, 255)).toFixed(2), // 1.00
        grey777OnBlack: +ratio(lum(119, 119, 119), lum(0, 0, 0)).toFixed(2), // 4.69
      };
      const nullsOK = Math.abs(nulls.whiteOnBlack - 21) < 0.02 &&
                      Math.abs(nulls.whiteOnWhite - 1) < 0.01 &&
                      Math.abs(nulls.grey777OnBlack - 4.69) < 0.03;

      // sampler control: paint a known colour in DEVICE space, read it back.
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgb(122,60,30)';
      ctx.fillRect(0, 0, 10, 10);
      const got = ctx.getImageData(4, 4, 1, 1).data;
      ctx.restore();
      const samplerOK = got[0] === 122 && got[1] === 60 && got[2] === 30;
      render();   // undo the patch

      if (!nullsOK || !samplerOK) {
        return { verdict: 'CHECK IS BROKEN, findings withheld',
                 nulls, nullsOK, samplerRead: [got[0], got[1], got[2]], samplerOK };
      }

      const rows = [];
      const measure = (name, x, y, w, h, informational) => {
        const e = extremesIn(x, y, w, h);
        rows.push({
          name, informational,
          object: 'rgb(' + e.bright.join(',') + ')',
          ground: 'rgb(' + e.dark.join(',') + ')',
          ratio: +ratio(e.brightL, e.darkL).toFixed(2),
          bar: informational ? 3 : null,
          pass: informational ? ratio(e.brightL, e.darkL) >= 3 : null,
        });
      };

      // pairing control: a window with nothing in it must come out near 1:1,
      // and a window with a fly in it must come out very high. If the low
      // control reads high, the window is picking up something it should not.
      const emptyX = L.playX + 6, emptyY = L.playY + 6;
      measure('CONTROL empty night (want ~1:1)', emptyX, emptyY, 18, 18, false);
      const f0 = S.flies.find((f) => !f.caught);
      if (f0) measure('CONTROL a firefly (want very high)',
                      wx2s(f0.x) - 8, wy2s(f0.y) - 8, 16, 16, false);

      // Each of these is measured with the garden holding nothing else, and on
      // the DARKEST ground it ever sits on, which is the case that has to pass.
      SOLO = 'thorns'; render();
      for (const th of S.thorns) {
        measure('thorn', wx2s(th.x) - th.r * L.scale * 1.2, wy2s(th.y) - th.r * L.scale * 1.2,
                th.r * 2.4 * L.scale, th.r * 2.4 * L.scale, true);
      }
      SOLO = 'jar'; render();
      measure('jar (empty, its hardest case)', wx2s(S.jar.x) - S.jar.w * L.scale * 0.7,
              wy2s(S.jar.my) - 10, S.jar.w * L.scale * 1.4, S.jar.h * L.scale * 1.1, true);
      if (S.breeze) {
        SOLO = 'breeze'; render();
        measure('breeze streaks', L.playX + L.playW * 0.10, wy2s(S.breeze.y0),
                L.playW * 0.80, wy2s(S.breeze.y1) - wy2s(S.breeze.y0), true);
      }
      SOLO = null; render();
      measure('read-out type', LW - SIDE_PAD - 170, topBand() / 2 - 10, 170, 20, true);
      if (hit.restart) {
        measure('RESTART pill', hit.restart.x - 2, hit.restart.y - 2,
                hit.restart.w + 4, hit.restart.h + 4, true);
      }
      const informational = rows.filter((r) => r.informational);
      return {
        nulls, nullsOK, samplerOK,
        failures: informational.filter((r) => !r.pass).map((r) => r.name),
        rows,
      };
    },

    // Where the swarm actually is, in world units. The first thing worth
    // knowing when a garden looks wrong is whether the flies are where the
    // picture says they are.
    flies: () => S.flies.map((f) => ({
      x: +f.x.toFixed(1), y: +f.y.toFixed(1),
      own: +Math.hypot(f.vx, f.vy).toFixed(1),
      shove: +Math.hypot(f.sx, f.sy).toFixed(1),
      total: +Math.hypot(f.vx + f.sx, f.vy + f.sy).toFixed(1),
      spook: +f.spook.toFixed(2), caught: f.caught,
    })),
    swarm: () => {
      const l = S.flies.filter((f) => !f.caught);
      if (!l.length) return { loose: 0 };
      const cx = l.reduce((a, f) => a + f.x, 0) / l.length;
      const cy = l.reduce((a, f) => a + f.y, 0) / l.length;
      const spread = l.reduce((a, f) => a + Math.hypot(f.x - cx, f.y - cy), 0) / l.length;
      const own = l.reduce((a, f) => a + Math.hypot(f.vx, f.vy), 0) / l.length;
      const sh = l.reduce((a, f) => a + Math.hypot(f.sx, f.sy), 0) / l.length;
      const tot = l.reduce((a, f) => a + Math.hypot(f.vx + f.sx, f.vy + f.sy), 0) / l.length;
      const sk = l.filter((f) => f.spook > 0).length;
      return { loose: l.length, cx: +cx.toFixed(1), cy: +cy.toFixed(1),
               spread: +spread.toFixed(1), meanOwn: +own.toFixed(1),
               meanShove: +sh.toFixed(1), meanTotal: +tot.toFixed(1),
               spookedNow: sk, panicAt: TUNE.panicSpeed, arena: TUNE.arena };
    },
    jar: () => ({ x: +S.jar.x.toFixed(1), y: +S.jar.y.toFixed(1),
                  mx: +S.jar.mx.toFixed(1), my: +S.jar.my.toFixed(1),
                  ang: +S.jar.ang.toFixed(3), w: +S.jar.w.toFixed(1),
                  h: +S.jar.h.toFixed(1), mouthW: S.jar.mouthW }),
    // Put the warmth somewhere without a hand, for scripted runs and the gate.
    setTouch: (x, y) => { touch = (x == null) ? null : { x, y }; return touch; },

    /* WHERE THEY ACTUALLY PANIC, by simulation rather than by algebra.
       The ring drawn on screen comes from a closed form, and a closed form for
       a swarm is always a fit. This runs the real step() at the real timestep
       with the warmth parked at a known distance and reports the distance at
       which spooking starts. If the two disagree by much, the ring is a
       decoration and PANIC_K needs moving. */
    probePanic(dist, opts) {
      const o = opts || {};
      const secs = o.secs != null ? o.secs : 2.6;
      const keep = S, keepPhase = phase, keepTouch = touch, keepClock = clock;
      // The `comfort` modulation reads the clock, so a probe run at a different
      // moment gets a slightly different answer. Pinning it is the difference
      // between a repeatable measurement and one that moves 4 units when you
      // run it twice, which the gate in M2 cannot live with.
      clock = 0;
      S = buildScene(S.lvl);
      S.thorns = []; S.breeze = null;
      if (o.single) S.flies = S.flies.slice(0, 1);
      S.n = S.flies.length;
      const A = TUNE.arena, cx = A * 0.5, cy = A * 0.5;
      // Park the swarm mid-field at rest, with the warmth `dist` to its left,
      // and the jar moved far away so nothing gets captured mid-measurement.
      let k = 0;
      for (const f of S.flies) {
        const a = (k / S.flies.length) * Math.PI * 2, r = k === 0 ? 0 : 18;
        f.x = cx + Math.cos(a) * r; f.y = cy + Math.sin(a) * r;
        f.vx = f.vy = f.sx = f.sy = 0; f.spook = 0; f.trail.length = 0;
        k++;
      }
      S.jar.mx = -9999; S.jar.my = -9999; S.jar.x = -9999; S.jar.y = -9999;
      phase = 'play';
      touch = { x: cx - dist, y: cy };
      let peak = 0;
      const steps = Math.round(secs / DT);
      for (let i = 0; i < steps; i++) {
        step(DT);
        for (const f of S.flies) {
          const t2 = Math.hypot(f.vx + f.sx, f.vy + f.sy);
          if (t2 > peak) peak = t2;
        }
      }
      const out = { dist, spooks: S.spookEvents, splits: S.splits,
                    peakSpeed: +peak.toFixed(1), panicSpeed: TUNE.panicSpeed,
                    spooked: S.spookEvents > 0, flies: S.flies.length };
      S = keep; phase = keepPhase; touch = keepTouch; clock = keepClock;
      return out;
    },
    calibratePanic(opts) {
      const o = opts || {};
      const step2 = o.step || 4;
      const rows = [];
      for (let d = 4; d <= TUNE.touchRadius + 8; d += step2) {
        rows.push(this.probePanic(d, o));
      }
      // the largest distance that still spooks them
      let measured = 0;
      for (const r of rows) if (r.spooked && r.dist > measured) measured = r.dist;
      const drawn = panicRadius();
      return {
        measuredPanicRadius: measured,
        drawnPanicRadius: +drawn.toFixed(1),
        touchRadius: TUNE.touchRadius,
        drawnAsShareOfReach: +(drawn / TUNE.touchRadius).toFixed(3),
        errorPx: +(drawn - measured).toFixed(1),
        panicSpeed: TUNE.panicSpeed, pushMax: TUNE.pushMax,
        shoveDamp: TUNE.shoveDamp, PANIC_K,
        // control: at zero distance the push is maximal, so it MUST spook.
        // If this is false the probe is not applying a push at all.
        control_pointBlankSpooks: rows[0] ? rows[0].spooked : null,
        // control: well outside the reach nothing may spook. If this is true
        // something other than the touch is panicking them, i.e. RNG.
        control_outOfReachIsCalm:
          !this.probePanic(TUNE.touchRadius + 40, o).spooked,
        rows,
      };
    },

    /* Does the mouth actually take a fly? Walks one fly in from a ring of
       approach angles around the jar and reports which ones end up in the
       glass. An approach across the mouth should be taken; one into the flank
       should be turned away by the glass and NOT taken. Both halves matter:
       a jar that swallows from every angle has no mouth. */
    probeCapture(opts) {
      const o = opts || {};
      const keep = S, keepPhase = phase, keepTouch = touch, keepClock = clock;
      const rows = [];
      for (let a = 0; a < 12; a++) {
        clock = 0;
        S = buildScene(keep.lvl);
        S.thorns = []; S.breeze = null;
        S.flies = S.flies.slice(0, 1); S.n = 1;
        phase = 'play'; touch = null;
        const jar = S.jar, f = S.flies[0];
        const ang = (a / 12) * Math.PI * 2;
        const start = (o.dist != null ? o.dist : jar.mouthW * 1.05);
        // ring the MOUTH, not the jar's middle, and fly straight at it
        f.x = jar.mx + Math.cos(ang) * start;
        f.y = jar.my + Math.sin(ang) * start;
        const dx = jar.mx - f.x, dy = jar.my - f.y, d = Math.hypot(dx, dy) || 1;
        f.vx = dx / d * TUNE.flyMax; f.vy = dy / d * TUNE.flyMax;
        f.sx = f.sy = 0; f.spook = 0; f.cs = 1;
        /* Point its WANDER at the mouth and stop it turning. Setting the
           velocity alone is not enough: with one fly there is no separation or
           cohesion, so wander is the whole boid heading, and the steering turns
           the fly off course within a step. The first run of this probe was
           measuring whether a wandering fly stumbles into the jar in four and a
           half seconds, which is not the question. */
        f.wa = Math.atan2(dy, dx); f.ws = 0;
        // +1 means the fly is squarely over the mouth heading in; -1 means it
        // is under the base heading up through solid glass.
        const inward = (dx * jar.inX + dy * jar.inY) / d;
        let caught = false, steps = 0, deepest = 0;
        const total = Math.round(6 / DT);
        for (; steps < total && !caught; steps++) {
          step(DT); caught = f.caught;
          if (!caught) {
            // how far INTO the glass a loose fly ever gets. The wall is only a
            // wall if this stays near zero.
            const rx2 = f.x - jar.mx, ry2 = f.y - jar.my;
            const u2 = rx2 * jar.tanX + ry2 * jar.tanY;
            const v2 = rx2 * jar.inX + ry2 * jar.inY;
            if (v2 > 0 && v2 < jar.h && Math.abs(u2) < jar.w / 2) {
              const dep = Math.min(u2 + jar.w / 2, jar.w / 2 - u2, jar.h - v2, v2);
              if (dep > deepest) deepest = dep;
            }
          }
        }
        rows.push({ approachDeg: Math.round(ang * 180 / Math.PI),
                    overTheMouth: +inward.toFixed(2), caught,
                    secs: +(steps * DT).toFixed(2),
                    deepestIntoGlass: +deepest.toFixed(1) });
      }
      S = keep; phase = keepPhase; touch = keepTouch; clock = keepClock;
      const over = rows.filter((r) => r.overTheMouth > 0.55);
      const flank = rows.filter((r) => r.overTheMouth < -0.2);
      const worstDepth = rows.reduce((a, r) => Math.max(a, r.deepestIntoGlass), 0);
      const t = (rs) => {
        const c = rs.filter((r) => r.caught);
        return c.length ? +(c.reduce((a, r) => a + r.secs, 0) / c.length).toFixed(2) : null;
      };
      return {
        /* Over the mouth must always be taken. The flank number is NOT a
           failure when it is high: a fly turned away by the glass can walk
           round the jar and drop in through the mouth, and it should be taken
           when it does. What that costs it is TIME, which is the row below. */
        capturedFromOverTheMouth: over.filter((r) => r.caught).length + ' of ' + over.length,
        secsFromOverTheMouth: t(over),
        secsFromTheFlank: t(flank),
        /* The real wall test. Capture only ever fires on a crossing of the
           mouth plane inside the aperture, so the question left is whether the
           glass holds: how deep a loose fly ever gets into the body. One step
           of travel is about 2 units. */
        deepestIntoGlass: +worstDepth.toFixed(1),
        glassHeld: worstDepth < 6,
        rows,
      };
    },

    /* WHAT A FRAME COSTS, in milliseconds of thread time. `fps` is worthless
       inside a preview pane: the pane throttles frame delivery, so it reported
       8 flies as SLOWER than 26, which is impossible and is the tell that the
       check is measuring the harness. Thread time is not delivered by anyone.
       The 60fps budget is 16.7ms for render plus sim together. */
    renderCost(n) {
      const N = n || 60, t = [];
      for (let i = 0; i < N; i++) { const a = performance.now(); render(); t.push(performance.now() - a); }
      t.sort((x, y) => x - y);
      return { flies: S.n, mode: MODE, samples: N,
               medianMs: +t[N >> 1].toFixed(2), p95Ms: +t[Math.floor(N * 0.95)].toFixed(2),
               budgetMs: 16.7 };
    },
    simCost(n) {
      const N = n || 240, t = [];
      for (let i = 0; i < N; i++) { const a = performance.now(); step(DT); t.push(performance.now() - a); }
      t.sort((x, y) => x - y);
      // one displayed frame is DT-many sim steps at 60Hz, i.e. two
      return { flies: S.n, samples: N, medianStepMs: +t[N >> 1].toFixed(3),
               msPerDisplayedFrame: +(t[N >> 1] * 2).toFixed(2), budgetMs: 16.7 };
    },

    // Where the controls actually ARE, in logical canvas pixels, so a test can
    // press them the way a thumb does instead of calling what they call.
    controls: () => ({ mute: hit.mute, restart: hit.restart, next: hit.next,
                       ctrlCy: L.ctrlCy, muted: sfx ? !sfx.isOn() : null }),

    /* SCRIPTED TIME. Runs the real fixed-step loop synchronously, so a bot can
       play a level without waiting for frames. The gate in M2 is built on this
       and on nothing else: the sim takes no wall-clock input, uses no
       Math.random, and the same script from the same seed gives the same
       answer every time. `assertDeterminism()` below is the proof.  */
    advance(secs) {
      const n = Math.round(secs / DT);
      for (let i = 0; i < n; i++) { if (phase === 'win') winT += DT; step(DT); }
      return this.state();
    },

    /* A CAREFUL BOT. Stands on the far side of the swarm from the jar and
       pushes from there, at a stand-off measured in panic rings rather than
       pixels, so the policy still means the same thing after the dial moves.
       This is Bot C from the brief's gate, minus the pauses; it is here now
       because "M1, one scene end to end" is not shown by a screenshot, it is
       shown by something finishing the level. */
    herdBot(opts) {
      const o = opts || {};
      const standOff = o.standOff != null ? o.standOff : 1.5;
      const limit = o.limit != null ? o.limit : 90;
      const reaim = 0.15;
      if (o.level != null) gotoLevel(o.level);
      const jar = S.jar;
      const spreadOf = (l) => {
        let cx = 0, cy = 0;
        for (const f of l) { cx += f.x; cy += f.y; }
        cx /= l.length; cy /= l.length;
        return { cx, cy,
                 sp: l.reduce((a, f) => a + Math.hypot(f.x - cx, f.y - cy), 0) / l.length };
      };
      const base = spreadOf(S.flies.filter((f) => !f.caught)).sp;
      let t = 0, worstSpread = 0, paused = false, pausedFor = 0;
      while (t < limit && S.caught < S.n) {
        const loose = S.flies.filter((f) => !f.caught);
        if (!loose.length) break;
        const g = spreadOf(loose);
        if (g.sp > worstSpread) worstSpread = g.sp;

        /* TAKE THE HAND AWAY WHEN THE SWARM COMES APART. This is the whole of
           Bot C's "pauses when spread grows", and it is not a bot nicety: a
           scattered swarm cannot be herded, only re-gathered, and the only
           thing that re-gathers it is cohesion with nothing pushing. Chasing a
           split swarm with the warmth still on drives the halves further apart
           every second. */
        if (!paused && g.sp > base * 1.9) paused = true;
        if (paused && g.sp < base * 1.30) paused = false;

        if (paused) { touch = null; pausedFor += reaim; }
        else {
          const dx = g.cx - jar.mx, dy = g.cy - jar.my, d = Math.hypot(dx, dy) || 1;
          const off = panicRadius() * standOff;
          touch = { x: g.cx + dx / d * off, y: g.cy + dy / d * off };
        }
        this.advance(reaim); t += reaim;
      }
      touch = null;
      return { level: S.lvl, tier: S.tier + 1, flies: S.n,
               finished: S.caught >= S.n, caught: S.caught,
               secs: +t.toFixed(1), spooks: S.spookEvents, splits: S.splits,
               worstSpread: +worstSpread.toFixed(0),
               baseSpread: +base.toFixed(0), pausedSecs: +pausedFor.toFixed(1),
               standOff };
    },

    /* Determinism, asserted. Two identical scripted runs from the same level
       must land every fly on the same coordinate. If this ever fails, every
       number the gate produces is noise. */
    assertDeterminism(level) {
      const lv = level || S.lvl;
      const run = () => {
        gotoLevel(lv);
        for (let i = 0; i < 12; i++) {
          touch = { x: 200 + i * 18, y: 300 - i * 9 };
          this.advance(0.4);
        }
        touch = null;
        return S.flies.map((f) => f.x.toFixed(6) + ',' + f.y.toFixed(6)).join('|');
      };
      const a = run(), b = run();
      gotoLevel(lv);
      return { level: lv, identical: a === b,
               fingerprint: a.slice(0, 48) + '...', chars: a.length };
    },

    setReducedMotion(v) { REDUCED = !!v; return REDUCED; },
    reducedMotion: () => REDUCED,

    frameStats() { return { fps: +fps.toFixed(1), samples: fpsN }; },
  };

  /* The aiming ring. On a phone the finger arrives already committed, but a
     cursor has to travel, and a warmth that switched on wherever the mouse
     happened to be would scatter the swarm before the player had decided
     anything. Cold, thin, and it applies no force at all. */
  function drawAim() {
    const s = L.scale;
    const x = hover.x, y = hover.y - TUNE.touchLift;
    ctx.strokeStyle = 'rgba(255,232,170,0.16)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, TUNE.touchRadius * s, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,232,170,0.10)';
    ctx.beginPath(); ctx.arc(x, y, panicRadius() * s, 0, Math.PI * 2); ctx.stroke();
  }

  // ---------- BOOT ----------
  /* Every one of these re-fit hooks is part of the pattern, not belt and
     braces. innerWidth/innerHeight can read 0, or a stale pre-layout value,
     while this script first runs, and a strip always means the CSS box and the
     JS width and height disagree about aspect. Timers rather than rAF, because
     rAF is throttled to nothing in some embedded browsers, which is exactly
     where a stale size would otherwise stick. */
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
    last = now;
    acc += dt;
    let steps = 0;
    while (acc >= DT && steps < 14) {
      if (phase === 'win') winT += DT;
      step(DT);
      acc -= DT; steps++;
    }
    if (steps >= 14) acc = 0;      // a backgrounded tab must not spiral
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    render();
    requestAnimationFrame(frame);
  }

  setCanvasVars();
  resizeCanvas();
  fitFullscreen();
  resizeCanvas();
  layout();
  buildScenery();
  T().levelStart(S.lvl);
  if (TUNE_UI) buildTunePanel();

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', onResize);
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);   // iOS URL bar
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);

  requestAnimationFrame(frame);
})();
