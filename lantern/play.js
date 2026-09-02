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
    /* THE CTA IS BLUE HERE. Coral is the site's accent and it is correct on a
       navy page, but on a night garden lit by one warm flame a red button is
       the loudest thing on screen and it belongs to nothing in the picture.
       #2170A8 is already in the fleet, measures 5.32:1 under white type, and
       3.51:1 against the night so the button reads as an object. The rule dots
       take its lighter sibling, which is what Bloom does with its dots. */
    cta: '#2170A8', dot: '#4E9BD6',
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
    /* BLUE, not black. The garden was teal-black and read as an absence rather
       than a night, and it sat in a different hue family from every other page
       on the site. These two sit just under the Ground token #0E1726, so the
       garden is the same night the rest of Zamborin is, only deeper. */
    nightTop: '#0D1729', nightBot: '#070D18',   // the garden's own night
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
    /* A FEW FLIES, not a swarm. Twenty-six of anything is a cloud you shove;
       four is a string you thread, and each one is worth going back for. */
    nByTier:  [3, 3, 4, 4, 5, 5, 6, 7, 8],
    sep: 40, wander: 0.35,
    flyMax: 62,          // how fast one drifts with no light to follow
    /* THE FLAME */
    lure: 3.4,           // how hard it pulls, against wander at 0.35
    lureR: 155,          // how far it reaches
    lureHold: 34,        // inside this they gather round it instead of piling in
    lureSpeed: 150,      // their ceiling while following: outrun this and they
                         // are left behind, and this is the whole game
    jarShy: 2.4,         // how hard an UNLED fly steers away from the mouth
    jarShyR: 130,
    freeR: 62,           // hold the flame this close to work one out of silk
    touchRadius: 155, pushMax: 95,
    /* spookRadius 34, down from the brief's 46, swept against the careful and
       careless bots together. The finding is the brief's own claim, measured:
       turn contagion OFF and CARELESS play wins more levels than careful play
       does, 5 of 9 against 4 of 9, because with nothing spreading there is
       nothing a bad push costs you. Turn it on and care wins two to three
       times as often. Splitting is not a hazard in this game, it is the entire
       reason care is worth anything. 34 keeps that gap at its widest while
       letting more levels actually finish. */
    panicSpeed: 78, spookSecs: 1.6, spookRadius: 34,
    mouthByTier: [120, 110, 100, 88, 80, 74, 66, 80, 64],
    breeze: 22,
    // ---- spike constants, not in the brief ----
    /* HOW FAST THE WARMTH STOPS PUSHING once it is gone. 1.0 is a one-second
       coast: lift your hand and the swarm keeps drifting the way you sent it,
       which is most of what "moving warm air" feels like. It is also the
       constant that decides whether panicSpeed is a dial at all — see
       the flame. */
    shoveDamp: 1.0,
    edgeMargin: 64, edgeForce: 210,
    thornR: 30, thornKick: 150,
    /* THE WEB, and the reason there is a game here at all.
       A web is visible to the PLAYER and invisible to the FLIES. That
       asymmetry is the whole design: you are the only one in the garden who
       can see what is coming, which is what makes walking a swarm home a
       thing worth doing rather than a thing that happens. */
    /* A WEB IS AN EVENT, NOT WEATHER. At radius 46 with four or five of them,
       measured, a tier-9 level took 105 sticks in 240 seconds - one every 2.3
       seconds - and a bot that rescued perfectly spent 158 of those seconds
       doing nothing else. That is not a hazard you steer around, it is a
       treadmill, and it left no time to play the game underneath. Smaller,
       fewer, and with the silk needing a moment to be rebuilt after it lets
       something go. */
    webR: 30,
    webCool: 4.5,        // seconds before torn silk can hold anything again
    /* 12, not 7. At 7 the measured window from a fly sticking to the spider
       reaching it was shorter than the time it takes to notice, cross the
       garden and hold a push, so the loss was an ambush rather than a decision.
       Twelve is long enough to be a choice and short enough to be a real one,
       and it makes the spider's walk a slow dreadful thing you watch rather
       than a snap you miss. */
    spiderSecs: 12.0,    // from the first fly stuck to the spider reaching it
    /* freePush is DERIVED, not set: see freeReach(). Kept here only so the
       slider panel can show it. */
    freePush: 0,
    freeSecs: 1.4,       // held for this long, and it comes loose
    webImmune: 3.0,      // grace after a rescue, so it cannot re-stick at once
    /* THE STICK, in SCREEN pixels, because a thumb is a thumb whatever the
       field is scaled to. The flame burns at the far end and your hand holds
       the near one, which is the whole reason this exists: on a phone the
       brightest thing in the game was directly under the fingertip that was
       steering it. There WAS an offset before - 34 pixels, invisible, so the
       lure simply was not where you touched and nothing on screen said why.
       Drawing the stick makes the offset a fact about the world instead of a
       quirk of the controls, and it takes about one second to learn. */
    stick: MODE === 'mobile' ? 92 : 68,
  };

  const DT = 1 / 120;             // fixed timestep; the gate depends on it
  const TAU = Math.PI * 2;

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

  // ---------- SCENE ----------
  /* Tier furniture, from the brief:
       T1 open field, big mouth · T2 first thorn · T3 breeze · T4 narrow mouth
       T5 thorn corridor · T6 two thorn islands + breeze · T7 small swarm, tiny
       mouth · T8 large swarm · T9 everything.
     Six levels a tier, so the tier is `(level - 1) / 6`. Every scene is built
     from the level number alone: same number, same garden, on any device. */
  const LEVELS = 54;
  const tierOf = (lvl) => Math.min(8, Math.floor((lvl - 1) / 6));

  // Thorns scatter, webs hold. Both are in play from T5 on, and a scattered
  // fly bolting in a straight line near a web is the moment the two furniture
  // types stop being two obstacles and start being one situation.
  /* Thorns are gone. They scattered a swarm, and there is no swarm to scatter:
     the hazard is the silk, and one clear hazard reads better than two. */
  const THORNS = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  /* WEBS is gone: the corridor decides how many it takes to line itself, and
     that is a better number than one I would have picked, because it follows
     the shape of the level rather than being imposed on it. */
  /* HOW MANY THE JAR HOLDS, against how many are in the garden. The slack is
     what a mistake spends. Losing one fly early costs you a spare; losing your
     last spare costs you the level, and RESTART is always right there. This is
     what lets loss be permanent without every slip meaning start again. */
  /* The slack rises with the WEB COUNT rather than falling with the tier,
     because the worst case a tier can throw at you is every web full at once,
     and a tier with five webs and two spares is decided by one bad drift.
     Difficulty still climbs: more flies, a narrower mouth, more thorns, wind. */
  /* Every firefly counts. With three to eight of them a spare is most of the
     level, so there are none until the boards get crowded enough that one
     unlucky corner should not mean starting over. */
  const SLACK  = [0, 0, 0, 0, 1, 1, 1, 1, 2];
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
    /* IT STANDS UP. A jar lying at twenty degrees in the grass was picturesque
       and it made the mouth a moving target you had to read before you could
       aim at it, on top of everything else the level asks. Upright, with the
       faintest settle. */
    const ang = (rnd() - 0.5) * 0.05;

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
        sx: 0, sy: 0,                     // the shove a hand or a thorn gave it
        wx: 0, wy: 0,                     // and the air it happens to be in
        web: -1, hold: 1, immune: 0, freedAt: null,   // in silk, working loose
        led: false,                                   // can it see the flame
        lost: false,
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
    const nThorn = THORNS[tier];
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

    /* THE WEBS ARE THE COURSE. Scattered at random with a minimum spacing they
       measured as no hazard at all: the speed gate lost ZERO flies at every
       hand speed from 40 to 360, because a random field almost always leaves a
       straight lane, and a straight lane has no corners in it.

       Corners are the entire mechanic. A fly steers at where the flame is NOW,
       so a bend taken quickly is a bend the tail cuts the inside of, and what
       is on the inside of the bend is silk. So the level is built as a winding
       CORRIDOR from the flies to the jar, with the webs lining both walls: a
       route always exists, it is always visible, and it always turns.

       The corridor narrows with the tier. That is the only difficulty dial
       here, and it acts on the one thing the player controls. */
    const webs = [];
    const bends = 2 + Math.floor(tier / 3);          // 2 to 4 turns
    const halfW = 152 - tier * 8;                    // 152 down to 88
    const path = [{ x: startX, y: startY }];
    {
      const ex = jar.mx - jar.inX * 40, ey = jar.my - jar.inY * 40;
      const vx = ex - startX, vy = ey - startY, vl = Math.hypot(vx, vy) || 1;
      const nx = -vy / vl, ny = vx / vl;
      let side = rnd() < 0.5 ? 1 : -1;
      for (let i = 1; i <= bends; i++) {
        const t = i / (bends + 1);
        const swing = (0.55 + rnd() * 0.65) * halfW * 1.5 * side;
        path.push({ x: startX + vx * t + nx * swing,
                    y: startY + vy * t + ny * swing });
        side = -side;
      }
      path.push({ x: ex, y: ey });
    }
    {
      const spacing = TUNE.webR * 3.2;
      for (let seg = 0; seg < path.length - 1; seg++) {
        const a = path[seg], b = path[seg + 1];
        const vx = b.x - a.x, vy = b.y - a.y, vl = Math.hypot(vx, vy) || 1;
        const nx = -vy / vl, ny = vx / vl;
        const steps = Math.max(1, Math.round(vl / spacing));
        for (let k = 0; k <= steps; k++) {
          const t = k / steps;
          const px = a.x + vx * t, py = a.y + vy * t;
          for (const sgn of [1, -1]) {
            const wx0 = px + nx * halfW * sgn, wy0 = py + ny * halfW * sgn;
            if (wx0 < 40 || wx0 > A - 40 || wy0 < 40 || wy0 > A - 40) continue;
            if (Math.hypot(wx0 - startX, wy0 - startY) < 120) continue;
            if (Math.hypot(wx0 - jar.mx, wy0 - jar.my) < mouthW * 1.15) continue;
            let ok = true;
            for (const w2 of webs) {
              if (Math.hypot(wx0 - w2.x, wy0 - w2.y) < TUNE.webR * 2.3) ok = false;
            }
            // never block the corridor itself
            for (const q of path) {
              if (Math.hypot(wx0 - q.x, wy0 - q.y) < TUNE.webR + 30) ok = false;
            }
            if (!ok) continue;
            /* Every web is its own web. Uniform circles at one radius read as
               a pattern rather than as a garden, and the reference art is all
               ragged silhouettes and long sweeping anchors. `r` is the honest
               catching radius and the drawing always covers it - the variety
               is in HOW it covers it, never in promising more danger than the
               rule has. */
            /* A WEDGE, NOT A DISC, and this is the thing two passes of
               detail work could not fix. Almost nothing in the reference art
               is a complete circle: a web is strung in the CROOK of two long
               lines and fills the angle between them, which is why real ones
               live in corners. Varying the spoke lengths of a full orb by ten
               per cent does not change that it is an orb.

               So a web is an apex, a span, and a radius - and the RULE is the
               same wedge the drawing is, because a sector that caught a whole
               circle would be the old lie in a new shape. It also makes better
               levels: a wedge only guards the way it faces, so its open side
               is a way through. */
            const toPath = Math.atan2(py - wy0, px - wx0);
            const span = Math.PI * (0.42 + rnd() * 0.50);   // 76 to 166 degrees
            webs.push({ x: wx0, y: wy0,
                        r: TUNE.webR * (1.08 + rnd() * 0.72),
                        a0: toPath - span / 2,              // it faces the corridor
                        span,
                        seed: rnd() * 1000,
                        resident: false, link: -1,
                        holding: false, cool: 0, spiderT: 0, seat: 0,
                        tx: wx0, ty: wy0 });
          }
        }
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

    /* A SPIDER OR TWO, AT HOME. An empty web is a shape; a web with something
       living on it is a warning, and it takes no words. One or two per garden
       is enough - every web with a tenant would read as an infestation and
       nothing that is everywhere reads as anything. */
    if (webs.length) {
      const first = Math.floor(rnd() * webs.length);
      webs[first].resident = true;
      if (webs.length > 5) {
        let second = Math.floor(rnd() * webs.length);
        for (let g = 0; g < 12 && second === first; g++) second = Math.floor(rnd() * webs.length);
        webs[second].resident = true;
      }
    }
    /* And they are strung TO each other. In the reference the long curves run
       right across the picture and everything hangs off them, which is what
       stops a web looking like a sticker placed on the dark. */
    for (let i2 = 0; i2 < webs.length; i2++) {
      let best = -1, bd = 1e9;
      for (let j2 = 0; j2 < webs.length; j2++) {
        if (j2 === i2) continue;
        const d2 = Math.hypot(webs[i2].x - webs[j2].x, webs[i2].y - webs[j2].y);
        if (d2 < bd) { bd = d2; best = j2; }
      }
      if (bd < 260) webs[i2].link = best;
    }

    const need = Math.max(2, n - SLACK[tier]);
    return { lvl, tier, n, need, jar, flies, thorns, webs, breeze,
             caught: 0, lost: 0, stuckNow: 0,
             sticks: 0, resticks: 0, rescues: 0,
             seconds: 0 };
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
  let lureVX = 0, lureVY = 0;  // how fast the flame is travelling, world units/s
  const lureTrail = [];        // where it has been, for the ribbon
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
      /* No side column. A second jar drawn beside the first told the player
         nothing the scene was not already telling them, and the design system's
         rule is that side space must carry something REAL - so the side space
         is garden. The square field is centred in the full frame and the
         leftover width either side is more night, more grass, more of the same
         garden, exactly the way the leftover HEIGHT works on a phone. */
      availW = LW - SIDE_PAD * 2;
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
    L.playW = MODE === 'mobile' ? LW : LW - SIDE_PAD * 2;
    L.playH = availH;
  }
  const wx2s = (x) => L.ox + x * L.scale;
  const wy2s = (y) => L.oy + y * L.scale;
  const s2wx = (x) => (x - L.ox) / L.scale;
  const s2wy = (y) => (y - L.oy) / L.scale;

  // ---------- SCENERY ----------
  /* Grass is seeded from the level, laid out across the PLAY AREA rather than
     the arena, so the bottom of the frame is garden rather than a cut edge. It
     is regenerated on resize because it is measured in screen pixels. */
  let grass = [], foliage = [], motes = [];
  function buildScenery() {
    const rnd = mulberry32(0x9E37 * S.lvl + 5);
    grass = [];

    /* DUST IN THE AIR. Not a light and never a light: motes are invisible
       until something bright passes near them, and then they are the thing
       that makes the flame look like it is IN the garden rather than on top of
       a picture of one. They also give the dark middle of the frame, which is
       most of it, something to be. */
    motes = [];
    for (let i = 0; i < 90; i++) {
      motes.push({ x: rnd() * TUNE.arena, y: rnd() * TUNE.arena,
                   r: 0.5 + rnd() * 1.5, ph: rnd() * Math.PI * 2,
                   sp: 0.15 + rnd() * 0.5, drift: (rnd() - 0.5) * 0.5 });
    }

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
      const nl = 5 + Math.floor(rnd() * 5);
      const R = (0.11 + rnd() * 0.13) * Math.min(fw, L.playH);
      for (let j = 0; j < nl; j++) {
        // leaf-shaped rather than round: a long axis and a short one, turned
        lobes.push({ dx: (rnd() - 0.5) * R * 1.6, dy: (rnd() - 0.5) * R * 1.2,
                     rx: R * (0.40 + rnd() * 0.55), ry: R * (0.16 + rnd() * 0.26),
                     rot: rnd() * Math.PI });
      }
      // near masses sit in front of everything and never light up
      foliage.push({ cx, cy, lobes, R, near: i === 0 && rnd() < 0.5 });
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
        lean: (rnd() - 0.5) * 0.75,   // real blades fold further over
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

  let lastTouchX = null, lastTouchY = null;
  function step(dt) {
    clock += dt;

    /* HOW FAST THE HAND IS MOVING. Not decoration: it leans the flame, it
       feeds the ribbon, and it is the number `probeSpeed()` sweeps, because
       the speed of your hand is the only difficulty setting this game has. */
    if (touch) {
      if (lastTouchX != null) {
        const inv = 1 / dt;
        lureVX = (touch.x - lastTouchX) * inv;
        lureVY = (touch.y - lastTouchY) * inv;
      }
      lastTouchX = touch.x; lastTouchY = touch.y;
      if (lureTrail.length < 2 ||
          Math.hypot(touch.x - lureTrail[lureTrail.length - 2],
                     touch.y - lureTrail[lureTrail.length - 1]) > 5) {
        lureTrail.push(touch.x, touch.y);
        while (lureTrail.length > 44) lureTrail.splice(0, 2);
      }
    } else {
      lastTouchX = lastTouchY = null; lureVX = lureVY = 0;
      if (lureTrail.length) lureTrail.length = 0;
    }
    const F = S.flies, A = TUNE.arena, jar = S.jar;
    const shoveK = Math.exp(-TUNE.shoveDamp * dt);
    // A fly in silk is not part of the swarm: it cannot fly, it cannot be
    // herded, and the others hold no formation with it.
    const loose = [];
    for (const f of F) if (!f.caught && !f.lost && f.web < 0) loose.push(f);


    for (let i = 0; i < loose.length; i++) {
      const f = loose[i];

      /* --- SEPARATION AND WANDER, and nothing else. Cohesion and alignment
         --- went with the swarm: three to eight fireflies following a flame
         --- are a string, not a flock, and a flock is exactly what stopped the
         --- old build being able to put one fly anywhere in particular. */
      let sx = 0, sy = 0;
      for (let j = 0; j < loose.length; j++) {
        if (j === i) continue;
        const g = loose[j];
        const dx = f.x - g.x, dy = f.y - g.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 1e-6 || d2 > TUNE.sep * TUNE.sep) continue;
        const d = Math.sqrt(d2), k = (TUNE.sep - d) / TUNE.sep;
        sx += dx / d * k; sy += dy / d * k;
      }
      let bx = sx * 2.6, by = sy * 2.6;

      f.wa += f.ws * dt * (REDUCED ? 0.4 : 1);
      const wanW = TUNE.wander * (REDUCED ? 0.4 : 1) * (f.spook > 0 ? 2.4 : 1);
      bx += Math.cos(f.wa) * wanW; by += Math.sin(f.wa) * wanW;

      /* THE FLAME. The verb is LEADING now, not pushing, and every hard thing
         about the old build dissolves in that one change.

         A radial push cannot thread an insect through a gap - measured, herding
         put flies at the jar's mouth for 755 frames of a two-minute run and
         captured three - because the only thing it can ever say to a fly is
         "away from me, in a straight line". A lure can put a fly anywhere you
         can put your finger. Precision comes free, and with it the whole
         obstacle course: you are not shoving a cloud across a garden, you are
         drawing a thread of light between spiders.

         What makes it a skill is that they LAG. A fly steers at where the flame
         is NOW, at a speed of its own, so a corner taken quickly is a corner
         the tail cuts across - and the silk is in the corners. Slow, and the
         string tracks your path. Fast, and it swings wide. Outrun them
         altogether and they lose the light and begin to wander, which is how
         you leave one behind without noticing. */
      f.led = false;
      if (touch) {
        const dx = touch.x - f.x, dy = touch.y - f.y, m = Math.hypot(dx, dy);
        if (m < TUNE.lureR && m > 1e-4 && f.spook <= 0) {
          f.led = true;
          // ease off right at the flame so they gather ROUND it rather than
          // collapsing onto a point and jostling each other into the dark
          const w = TUNE.lure * Math.min(1, m / TUNE.lureHold);
          bx += dx / m * w; by += dy / m * w;
        }
      }

      /* --- the soft edge of the garden. Nothing is ever bounced: a fly that
         --- reaches the far side simply turns back. */
      const em = TUNE.edgeMargin, eg = TUNE.edgeForce / 210;
      if (f.x < em)     bx += (1 - f.x / em) * 3.4 * eg;
      if (f.x > A - em) bx -= (1 - (A - f.x) / em) * 3.4 * eg;
      if (f.y < em)     by += (1 - f.y / em) * 3.4 * eg;
      if (f.y > A - em) by -= (1 - (A - f.y) / em) * 3.4 * eg;

      /* A FLY THAT IS NOT FOLLOWING YOU IS SHY OF THE JAR. Nothing walks into
         a glass trap on its own, and without this the "no free captures" rule
         was resting on nothing but low odds: stripping the old push model took
         jarShy out with it, and three levels in fifty-four quietly scored a
         capture in five minutes of no one playing. Rare is not the standard.
         A LED fly is exempt, because a led fly is going where you are taking
         it, so this can never make the game harder to play - only harder to
         win by leaving it alone. */
      if (!f.led) {
        const jdx = f.x - jar.mx, jdy = f.y - jar.my;
        const jd = Math.hypot(jdx, jdy);
        if (jd < TUNE.jarShyR && jd > 1e-4) {
          const k = (1 - jd / TUNE.jarShyR) * TUNE.jarShy;
          bx += (jdx / jd) * k; by += (jdy / jd) * k;
        }
      }

      /* --- ITS OWN FLIGHT. Steered responsively toward the boid heading, at
         --- its own comfortable speed, and hard-capped at flyMax. That cap is
         --- what keeps panic traceable: a fly can never reach panicSpeed by
         --- flying, only by being moved. */
      const comfort = REDUCED ? 0.86 : 0.86 + 0.14 * Math.sin(clock * 0.7 + f.ph * 4.1);
      /* A LED FLY FLIES HARDER. `lureSpeed` is the ceiling on how fast one can
         chase a light, and therefore the exact speed above which your hand
         leaves them behind. It is the single number this game is about. */
      const cruise = f.led ? TUNE.lureSpeed * comfort
                           : TUNE.flyMax * f.cs * comfort;
      const bm = Math.hypot(bx, by);
      if (bm > 1e-6) {
        const st = { x: (bx / bm * cruise - f.vx) * 3.2,
                     y: (by / bm * cruise - f.vy) * 3.2 };
        clampVec(st, 340);
        f.vx += st.x * dt; f.vy += st.y * dt;
      }
      const ownCap = f.led ? TUNE.lureSpeed : TUNE.flyMax;
      const os = Math.hypot(f.vx, f.vy);
      if (os > ownCap) { f.vx = f.vx / os * ownCap; f.vy = f.vy / os * ownCap; }

      /* --- WHAT IS DONE TO IT. The touch, the breeze, a thorn. These do not
         --- steer the fly, they move it, and they let go on their own over
         --- about a second, which is most of what pushing warm air feels like. */
      /* WIND IS NOT A FRIGHT. It rides in its own velocity, apart from the
          shove, because panic is measured on the two that are done TO a fly by
          a hand or a thorn, and a fly carried along by steady air is not
          alarmed by it - it is just somewhere else.

          Held in the shove, a breeze of 22 settled at 22, which on top of a
          fly's own 62 clears a panic threshold of 78 all by itself. So every
          windy tier - three, six and nine, which is exactly where the failures
          were - spooked itself continuously from the weather. The brief's own
          line is that panic must always be traceable to the player's push or a
          thorn and never to RNG, and a wind the player did not summon is RNG
          with a nice name. */
      if (S.breeze && f.y > S.breeze.y0 && f.y < S.breeze.y1) {
        f.wx += S.breeze.dir * TUNE.breeze * dt;
      }
      f.wx *= shoveK; f.wy *= shoveK;
      // Thorns scatter. It is the silk that keeps what it catches.
      for (const th of S.thorns) {
        const tdx = f.x - th.x, tdy = f.y - th.y, td = Math.hypot(tdx, tdy);
        if (td < th.r && td > 1e-4) {
          if (f.spook <= 0) f.spook = TUNE.spookSecs;
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
      f.x += (f.vx + f.sx + f.wx) * dt; f.y += (f.vy + f.sy + f.wy) * dt;

      /* NO PANIC, AND NO CONTAGION. Both belonged to a verb that shoved: a
         swarm you push can be pushed too hard, and that was the old cost of
         carelessness. A string you LEAD has a truer one - go too fast and it
         swings wide into the silk - so `spook` survives only as the shake a fly
         carries for a moment after being pulled out of a web, during which it
         will not follow the light. */

      /* --- SILK. The flies cannot see it. You can. That asymmetry is what the
         --- game is built on: leaving the swarm to drift is not neutral, it is
         --- a decision to let the garden have a turn. */
      if (f.immune > 0) f.immune = Math.max(0, f.immune - dt);
      else {
        for (let wi = 0; wi < S.webs.length; wi++) {
          const w = S.webs[wi];
          /* A WEB HOLDS ONE. A swarm travels as a body, so a web that could
             take any number took NINE at once on tier 6, against two spares:
             one drifting mistake and the level was over before it had a
             decision in it. One apiece caps the worst case at the number of
             webs, gives each its own clock, and lets a rescue be a rescue
             rather than triage. */
          if (w.holding || w.cool > 0) continue;
          const wdx = f.x - w.x, wdy = f.y - w.y;
          if (wdx * wdx + wdy * wdy >= w.r * w.r) continue;
          // inside the radius: now, is it inside the WEDGE the web actually is
          let wda = Math.atan2(wdy, wdx) - w.a0;
          wda = ((wda % TAU) + TAU) % TAU;
          if (wda > w.span) continue;
          {
            w.holding = true;
            S.sticks++;
            if (f.freedAt != null && S.seconds - f.freedAt < 3.5) S.resticks++;
            f.web = wi; f.hold = 1;
            f.vx = f.vy = f.sx = f.sy = f.wx = f.wy = 0;
            f.trail.length = 0;
            if (sfx) sfx.play('snag');
            break;
          }
        }
      }
      if (f.web >= 0) continue;

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

    /* ---- SILK, AND WHAT COMES FOR IT ----
       A stuck fly can be worked loose by a sustained push. The push has to be
       a real one, near enough to matter, and that is the same nearness that
       panics everything else in reach: a rescue is bought with the swarm's
       composure. That is the decision the whole game turns on. */
    S.stuckNow = 0;
    for (const f of S.flies) {
      if (f.caught || f.lost || f.web < 0) continue;
      S.stuckNow++;
      const w = S.webs[f.web];
      // Hold the flame close and it strains toward the light hard enough to
      // tear itself out. Which means standing over the trapped one, and not
      // over the others.
      const near = touch ? Math.hypot(f.x - touch.x, f.y - touch.y) : 1e9;
      if (near <= TUNE.freeR) f.hold -= dt / TUNE.freeSecs;
      else f.hold = Math.min(1, f.hold + dt / (TUNE.freeSecs * 2.2));
      if (f.hold <= 0) {
        // free, and thrown clear of the silk so it cannot fall straight back in
        const ax2 = f.x - w.x, ay2 = f.y - w.y, am = Math.hypot(ax2, ay2) || 1;
        w.holding = false; w.cool = TUNE.webCool;
        S.rescues++; f.freedAt = S.seconds;
        f.web = -1; f.hold = 1; f.immune = TUNE.webImmune;
        f.sx = ax2 / am * 120; f.sy = ay2 / am * 120;
        f.spook = TUNE.spookSecs * 0.5;
        if (sfx) sfx.play('unfold');
      }
    }

    /* The spider is the clock, and it is a clock made of garden rather than of
       numbers. It sits in its web until something lands in it, then it walks
       out. Nothing chases the swarm and nothing hunts: it comes to collect what
       the web already caught, and it goes back when the web is empty. */
    for (let wi = 0; wi < S.webs.length; wi++) {
      const w = S.webs[wi];
      let held = null, worst = -1;
      for (const f of S.flies) {
        if (f.web === wi && !f.lost && f.hold > worst) { worst = f.hold; held = f; }
      }
      if (held) {
        w.spiderT += dt;
        w.tx = held.x; w.ty = held.y;      // it is coming for THAT one
        if (w.spiderT >= TUNE.spiderSecs) {
          held.lost = true; held.web = -1;
          w.holding = false;
          S.lost++;
          w.spiderT = 0;
          if (sfx) { sfx.tone(196, 0.26, 0.06, 'triangle'); sfx.play('thump'); }
        }
      } else {
        w.spiderT = Math.max(0, w.spiderT - dt * 1.6);   // it goes home
      }
      if (w.cool > 0) w.cool = Math.max(0, w.cool - dt);
      w.seat = Math.min(1, w.spiderT / TUNE.spiderSecs);
    }

    /* ---- SILK, AND WHAT COMES FOR IT ----
       A stuck fly can be worked loose by a sustained push. The push has to be
       a real one, near enough to matter, and that is the same nearness that
       panics everything else in reach: a rescue is bought with the swarm's
       composure. That is the decision the whole game turns on. */
    S.stuckNow = 0;
    for (const f of S.flies) {
      if (f.caught || f.lost || f.web < 0) continue;
      S.stuckNow++;
      const w = S.webs[f.web];
      // Hold the flame close and it strains toward the light hard enough to
      // tear itself out. Which means standing over the trapped one, and not
      // over the others.
      const near = touch ? Math.hypot(f.x - touch.x, f.y - touch.y) : 1e9;
      if (near <= TUNE.freeR) f.hold -= dt / TUNE.freeSecs;
      else f.hold = Math.min(1, f.hold + dt / (TUNE.freeSecs * 2.2));
      if (f.hold <= 0) {
        // free, and thrown clear of the silk so it cannot fall straight back in
        const ax2 = f.x - w.x, ay2 = f.y - w.y, am = Math.hypot(ax2, ay2) || 1;
        w.holding = false; w.cool = TUNE.webCool;
        S.rescues++; f.freedAt = S.seconds;
        f.web = -1; f.hold = 1; f.immune = TUNE.webImmune;
        f.sx = ax2 / am * 120; f.sy = ay2 / am * 120;
        f.spook = TUNE.spookSecs * 0.5;
        if (sfx) sfx.play('unfold');
      }
    }

    /* The spider is the clock, and it is a clock made of garden rather than of
       numbers. It sits in its web until something lands in it, then it walks
       out. Nothing chases the swarm and nothing hunts: it comes to collect what
       the web already caught, and it goes back when the web is empty. */
    for (let wi = 0; wi < S.webs.length; wi++) {
      const w = S.webs[wi];
      let held = null, worst = -1;
      for (const f of S.flies) {
        if (f.web === wi && !f.lost && f.hold > worst) { worst = f.hold; held = f; }
      }
      if (held) {
        w.spiderT += dt;
        w.tx = held.x; w.ty = held.y;      // it is coming for THAT one
        if (w.spiderT >= TUNE.spiderSecs) {
          held.lost = true; held.web = -1;
          w.holding = false;
          S.lost++;
          w.spiderT = 0;
          if (sfx) { sfx.tone(196, 0.26, 0.06, 'triangle'); sfx.play('thump'); }
        }
      } else {
        w.spiderT = Math.max(0, w.spiderT - dt * 1.6);   // it goes home
      }
      if (w.cool > 0) w.cool = Math.max(0, w.cool - dt);
      w.seat = Math.min(1, w.spiderT / TUNE.spiderSecs);
    }

    // ---- flies already in the glass mill about ----
    for (const f of F) {
      if (!f.caught) continue;
      f.capT += dt;
      f.jr += f.jsp * dt * (REDUCED ? 0.3 : 1);
      f.ph += dt;
    }

    S.seconds += dt;
    if (phase !== 'play') return;
    if (S.caught >= S.need) {
      phase = 'win'; winT = 0;
      touch = null;
      T().levelComplete(S.lvl, S.sticks);
      if (sfx) sfx.play('finish');
      return;
    }
    /* Out of spares. Not a defeat screen and not a penalty: the jar simply
       cannot be filled from what is left in the garden, and RESTART has been
       sitting there the whole time costing nothing. */
    let gettable = 0;
    for (const f of S.flies) if (!f.lost && !f.caught) gettable++;
    if (S.caught + gettable < S.need) { phase = 'short'; winT = 0; touch = null; }
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
        const k = S.caught / Math.max(1, S.need);
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
      if (f.caught || f.lost) continue;
      const held = f.web >= 0;
      lights.push({ x: wx2s(f.x), y: wy2s(f.y), r: (held ? 104 : 92) * s,
                    i: held ? 0.85 : 0.34 + flashOf(f) * 0.5, c: LC.fly });
    }
    const jar = S.jar;
    const fill = S.caught / Math.max(1, S.need);
    if (S.caught > 0 || phase === 'win') {
      lights.push({ x: wx2s(jar.x), y: wy2s(jar.y), r: (150 + 190 * fill) * s,
                    i: 0.30 + 0.85 * fill, c: LC.jar });
    }
    if (touch) {
      // The brightest thing in the garden, and the reason anything near it is
      // visible at all.
      lights.push({ x: wx2s(touch.x), y: wy2s(touch.y),
                    r: TUNE.lureR * s * 1.1, i: 1.0, c: LC.flame });
    }
    for (const l of lights) l.r2 = l.r * l.r;
  }

  /* LIGHT HAS A COLOUR NOW. A blade of grass under the flame should be warm and
     one under a firefly should be green-gold, and until this the light model
     returned a single brightness so everything lit came out the same colour as
     everything else. It is the difference between a lit garden and a garden
     with a brightness slider. */
  const LC = { fly: [196, 232, 150], flame: [255, 206, 132], jar: [255, 214, 158] };
  const litAcc = { b: 0, r: 0, g: 0, bl: 0 };
  function lightAt(x, y) {
    let b = 0, r = 0, g = 0, bl = 0;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      const dx = x - l.x, dy = y - l.y, d2 = dx * dx + dy * dy;
      if (d2 > l.r2) continue;
      const k = 1 - Math.sqrt(d2) / l.r;
      const w = k * k * l.i;
      b += w; r += l.c[0] * w; g += l.c[1] * w; bl += l.c[2] * w;
    }
    if (b > 1e-4) { const inv = 1 / b; litAcc.r = r * inv; litAcc.g = g * inv; litAcc.bl = bl * inv; }
    else { litAcc.r = LC.fly[0]; litAcc.g = LC.fly[1]; litAcc.bl = LC.fly[2]; }
    litAcc.b = Math.min(1, b);
    return litAcc;
  }
  const litRGB = (a) => Math.round(a.r) + ',' + Math.round(a.g) + ',' + Math.round(a.bl);

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
    endCard(performance.now());
    if (rulesOpen) drawRules(performance.now());
    if (TUNE_UI) drawTuneOverlay();
  }

  function drawGarden() {
    const s = L.scale;
    /* FULL BLEED, no panel. The garden used to be clipped into a rounded
       rectangle inset from the frame, which made it read as a CARD floating on
       the site's navy - and no other game does that. Bloom and Prism both run
       one continuous ground from edge to edge with the HUD sitting on top of
       it, and Tailwind runs its own sky the same way. The night is this game's
       ground, so it covers the whole canvas and the bands sit on it. */
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, LW, LH);
    ctx.clip();

    const ng = ctx.createLinearGradient(0, 0, 0, LH);
    ng.addColorStop(0, ART.nightTop);
    ng.addColorStop(1, ART.nightBot);
    ctx.fillStyle = ng;
    ctx.fillRect(0, 0, LW, LH);

    /* A CLEAR SECTION FOR THE CHROME. Bloom's board starts below an empty band
       and the separation is obvious because its tiles are lighter than the
       ground. Lantern's garden is darker than anything, so the band had nothing
       to be clear OF: the controls floated on the same black as the webs. The
       bands take the Ground token and a hairline marks the edge, which is the
       same structure Bloom has and just made visible. */
    ctx.fillStyle = TOK.bg;
    ctx.fillRect(0, 0, LW, L.playY);
    if (botBand() > 4) ctx.fillRect(0, L.playY + L.playH, LW, LH - (L.playY + L.playH));
    ctx.fillStyle = TOK.tint10;
    ctx.fillRect(0, L.playY - 1, LW, 1);
    if (botBand() > 4) ctx.fillRect(0, L.playY + L.playH, LW, 1);

    // and nothing in the garden may paint into them
    ctx.beginPath(); ctx.rect(0, L.playY, LW, L.playH); ctx.clip();

    if (SOLO) {
      if (SOLO === 'thorns') for (const th of S.thorns) drawThorn(th);
      if (SOLO === 'webs') { drawWebLinks(); for (const w of S.webs) drawWeb(w); }
      if (SOLO === 'breeze') drawBreeze();
      if (SOLO === 'jar') drawJar();
      if (SOLO === 'stick' && touch) drawStick();
      ctx.restore();
      return;
    }

    drawFoliage(false);
    drawMotes();

    // --- ground pools: what each light throws down onto the earth ---
    ctx.globalCompositeOperation = 'lighter';
    for (const f of S.flies) {
      if (f.caught || f.lost) continue;
      blit(SPR.pool, wx2s(f.x), wy2s(f.y) + 10 * s, 78 * s,
           f.web >= 0 ? 1 : 0.55 + flashOf(f) * 0.45);
    }
    const fill = S.caught / Math.max(1, S.need);
    if (S.caught > 0) {
      blit(SPR.warm, wx2s(S.jar.x), wy2s(S.jar.y) + S.jar.h * 0.34 * s,
           (108 + 150 * fill) * s, 0.10 + 0.30 * fill);
    }
    if (touch) blit(SPR.haze, wx2s(touch.x), wy2s(touch.y), TUNE.lureR * s * 1.0, 1);
    ctx.globalCompositeOperation = 'source-over';

    drawBreeze();
    drawGrass(true);
    drawWebLinks();
    for (const w of S.webs) drawWeb(w);
    for (const th of S.thorns) drawThorn(th);
    drawJar();
    if (touch) { drawFlameTrail(); drawStick(); drawFlame(); }
    else if (hover && MODE === 'desktop') drawAim();
    if (!SOLO) for (const f of S.flies) if (!f.caught && !f.lost) drawFly(f);
    drawFoliage(true);
    drawGrass(false);
    drawVignette();
    drawWinWash();

    ctx.restore();
  }

  /* ONE PATH PER BLOB, ONE FILL. Filling each lobe separately compounds the
     alpha where they overlap, and a mass made of six lobes at 0.55 came out
     effectively opaque: the near-black foliage read as a pale green cloud and
     lifted the whole garden off its register. A compound path fills once. */
  function drawMotes() {
    const s = L.scale, t = REDUCED ? 0 : clock;
    ctx.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      const x = wx2s(m.x + Math.sin(t * m.sp + m.ph) * 9);
      const y = wy2s(m.y + Math.cos(t * m.sp * 0.7 + m.ph) * 7 - t * m.drift * 4);
      const la = lightAt(x, y);
      if (la.b < 0.06) continue;
      ctx.fillStyle = 'rgba(' + litRGB(la) + ',' + Math.min(0.55, la.b * 0.6).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.6, m.r * s * (0.7 + la.b * 0.8)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawFoliage(near) {
    for (const b of foliage) {
      if (!!b.near !== !!near) continue;
      ctx.beginPath();
      for (const l of b.lobes) {
        ctx.ellipse(b.cx + l.dx, b.cy + l.dy, l.rx, l.ry, l.rot, 0, Math.PI * 2);
      }
      ctx.fillStyle = near ? 'rgba(5,12,10,0.88)' : 'rgba(12,27,22,0.55)';
      ctx.fill();
      const lit = near ? { b: 0 } : lightAt(b.cx, b.cy);
      if (lit.b > 0.02) {
        ctx.fillStyle = 'rgba(' + litRGB(lit) + ',' + Math.min(0.13, lit.b * 0.15).toFixed(3) + ')';
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
  const GRASS_W = [1.6, 2.2, 3.0];
  function drawGrass(behindTheFlies) {
    const t = REDUCED ? 0 : clock;
    ctx.lineCap = 'round';
    for (const b of grass) {
      if ((b.row < 2) !== behindTheFlies) continue;
      /* A BLADE, not a wire. Grass drawn as a constant-width stroke reads as
         pick-up-sticks: a real blade is broad at the root, tapers to nothing at
         the tip, and folds over rather than leaning straight. Each one is a
         filled shape between two curves, wide at the base and meeting at a
         point, which costs the same as the stroke did. */
      const sway = Math.sin(t * 0.55 + b.ph) * (b.row === 0 ? 4 : b.row === 1 ? 7 : 10);
      const fold = b.lean * b.h;
      const tipX = b.x + fold + sway, tipY = b.y - b.h;
      const midX = b.x + fold * 0.22 + sway * 0.28, midY = b.y - b.h * 0.62;
      const wRoot = GRASS_W[b.row] * 1.5;
      ctx.fillStyle = GRASS_INK[b.row];
      ctx.beginPath();
      ctx.moveTo(b.x - wRoot / 2, b.y);
      ctx.quadraticCurveTo(midX - wRoot * 0.30, midY, tipX, tipY);
      ctx.quadraticCurveTo(midX + wRoot * 0.30, midY, b.x + wRoot / 2, b.y);
      ctx.closePath();
      ctx.fill();

      // The nearest band is a silhouette between the player and the garden.
      // Nothing lights it from in front, so it never brightens.
      const lit = b.row === 2 ? null : lightAt(tipX, tipY);
      if (lit && lit.b > 0.02) {
        // the lit half of the blade, tapering with it
        ctx.fillStyle = 'rgba(' + litRGB(lit) + ',' + Math.min(0.80, lit.b * 0.88).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(midX - wRoot * 0.26, midY);
        ctx.quadraticCurveTo((midX + tipX) / 2 - wRoot * 0.16, (midY + tipY) / 2, tipX, tipY);
        ctx.quadraticCurveTo((midX + tipX) / 2 + wRoot * 0.16, (midY + tipY) / 2, midX + wRoot * 0.26, midY);
        ctx.closePath(); ctx.fill();
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

  /* THE LONG LINES. In the reference art the eye is carried by great sweeping
     curves that run right across the picture with the webs hanging off them,
     and without those a web is a sticker placed on the dark. Drawn under
     everything and very faint: they are structure, not silk you can be caught
     in, and nothing in the rules touches them. */
  function drawWebLinks() {
    if (!S.webs.length) return;
    ctx.lineCap = 'round';
    for (let i = 0; i < S.webs.length; i++) {
      const w = S.webs[i];
      if (w.link < 0 || w.link < i) continue;          // draw each pair once
      const v = S.webs[w.link];
      const ax = wx2s(w.x), ay = wy2s(w.y), bx = wx2s(v.x), by = wy2s(v.y);
      const la = lightAt((ax + bx) / 2, (ay + by) / 2);
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const nx = -(by - ay), ny = bx - ax;
      const nl = Math.hypot(nx, ny) || 1;
      const sag = (0.10 + ((w.seed | 0) % 13) / 90) * nl;
      ctx.strokeStyle = 'rgba(206,220,232,' + (0.07 + Math.min(1, la.b) * 0.14).toFixed(3) + ')';
      ctx.lineWidth = Math.max(0.5, 0.8 * L.scale);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(mx + (nx / nl) * sag, my + (ny / nl) * sag, bx, by);
      ctx.stroke();
    }
  }

  /* THE WEB, as a wedge strung in the crook of two long lines.

     Two passes of detail work - sagging spans, free zones, wobble, gaps - and
     the owner still could not see a difference, because none of it touched the
     SHAPE. Every web was a complete circle, and almost nothing in the reference
     art is: a web is built in an angle, hanging off two long frame threads that
     run well past it, and the silk fills the wedge between them. That is why
     real ones live in corners.

     Which also fixes the density problem. A few long lines and five or six big
     sagging arcs read as a web; eleven spokes and six concentric rings read as
     a doily, and no amount of jitter rescues it. Fewer strands, longer spans,
     deeper sag. The chords between neighbouring radii have to be LONG or the
     sag has nothing to show. */
  function drawWeb(w) {
    const s = L.scale;
    const hx = wx2s(w.x), hy = wy2s(w.y), r = w.r * s;
    const rnd = mulberry32(w.seed | 0);
    const la = lightAt(hx, hy);
    const lit = Math.min(1, la.b * 1.2);
    const torn = w.cool > 0 ? Math.min(1, w.cool / TUNE.webCool) : 0;
    const ink = Math.round(la.r * 0.30 + 218 * 0.70) + ',' +
                Math.round(la.g * 0.30 + 230 * 0.70) + ',' +
                Math.round(la.bl * 0.30 + 240 * 0.70);

    // FEW radii, so every chord between them is long enough for the sag to read
    const N = 4 + Math.floor(rnd() * 3);          // 4 to 6 gaps, 5 to 7 threads
    const ang = [], reach = [], wob = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      ang.push(w.a0 + w.span * t + (i && i < N ? (rnd() - 0.5) * (w.span / N) * 0.45 : 0));
      reach.push(r * (i === 0 || i === N ? 1.0 : 0.86 + rnd() * 0.18));
      wob.push((rnd() - 0.5) * 0.34);
    }
    const jx = (i, t) => hx + Math.cos(ang[i] + wob[i] * Math.sin(t * 2.6) * 0.30) * reach[i] * t;
    const jy = (i, t) => hy + Math.sin(ang[i] + wob[i] * Math.sin(t * 2.6) * 0.30) * reach[i] * t;

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    /* --- THE TWO LONG FRAME LINES. The dominant thing in the reference and
       --- the thing that was missing: they run well past the silk, so the web
       --- hangs in the garden instead of floating on it. */
    ctx.strokeStyle = 'rgba(' + ink + ',' + (0.20 + lit * 0.26).toFixed(3) + ')';
    ctx.lineWidth = Math.max(0.7, 1.0 * s);
    ctx.beginPath();
    for (const i of [0, N]) {
      const far = 1.8 + ((w.seed | 0) % 5) * 0.22;
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(ang[i]) * reach[i] * far, hy + Math.sin(ang[i]) * reach[i] * far);
    }
    ctx.stroke();

    // --- the radii between them, thinner ---
    ctx.strokeStyle = 'rgba(' + ink + ',' + ((0.13 + lit * 0.15) * (1 - torn * 0.5)).toFixed(3) + ')';
    ctx.lineWidth = Math.max(0.5, 0.7 * s);
    ctx.beginPath();
    for (let i = 1; i < N; i++) {
      ctx.moveTo(hx, hy);
      for (let t = 0.25; t <= 1.0001; t += 0.25) ctx.lineTo(jx(i, t), jy(i, t));
    }
    ctx.stroke();

    /* --- THE ARCS, and this is the whole look. Each span between two radii is
       --- a thread under its own weight: the control point is pulled a third of
       --- the way back to the apex, which across a long chord is a deep,
       --- obvious catenary rather than the faint bow it was before. Spacing
       --- widens outward, the way a real capture spiral does. */
    ctx.strokeStyle = 'rgba(' + ink + ',' +
      (Math.min(0.70, 0.42 + lit * 0.26) * (1 - torn * 0.8)).toFixed(3) + ')';
    ctx.lineWidth = Math.max(0.8, 1.05 * s);
    const rings = 5 + Math.floor(rnd() * 3);
    for (let k = 0; k < rings; k++) {
      if (torn > 0.3 && k % 2 === 1) continue;
      const f0 = k / (rings - 1);
      const t = 0.20 + 0.80 * (f0 * f0 * 0.55 + f0 * 0.45);   // widening outward
      let drawing = false;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const jitter = 1 + (((i * 7 + k * 5 + (w.seed | 0)) % 7) - 3) * 0.020;
        const ta = t * jitter, tb = t * (1 + (((i + k) % 5) - 2) * 0.018);
        if (((i * 3 + k * 7 + (w.seed | 0)) % 11) === 0) { drawing = false; continue; }
        const ax = jx(i, ta), ay = jy(i, ta);
        const bx2 = jx(i + 1, tb), by2 = jy(i + 1, tb);
        if (!drawing) { ctx.moveTo(ax, ay); drawing = true; }
        const mx = (ax + bx2) / 2, my = (ay + by2) / 2;
        const sag = 0.30 + ((i + k) % 3) * 0.06;
        ctx.quadraticCurveTo(mx + (hx - mx) * sag, my + (hy - my) * sag, bx2, by2);
      }
      ctx.stroke();
    }

    // --- glints where threads cross ---
    if (lit > 0.12 && !REDUCED) {
      ctx.fillStyle = 'rgba(255,255,255,' + (lit * 0.34).toFixed(3) + ')';
      for (let i = 1; i < N; i++) {
        const t = 0.36 + ((i * 41) % 55) / 100;
        const g = 0.5 + 0.5 * Math.sin(clock * 1.7 + i * 2.1 + w.seed);
        if (g < 0.6) continue;
        ctx.beginPath();
        ctx.arc(jx(i, t), jy(i, t), Math.max(0.5, 0.9 * s * g), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* --- WHO LIVES HERE. A resident potters about its own web and never leaves
       --- it: not a threat that hunts, a sign that says what this shape is.
       --- Once something is caught it stops pottering and comes, and its
       --- position is the only clock in the game. */
    const heat = w.seat;
    const mid = w.a0 + w.span / 2;
    if (heat > 0.001) {
      const ax2 = hx + Math.cos(ang[0]) * reach[0] * 1.05;
      const ay2 = hy + Math.sin(ang[0]) * reach[0] * 1.05;
      const tx = wx2s(w.tx), ty = wy2s(w.ty);
      const sx2 = ax2 + (tx - ax2) * heat, sy2 = ay2 + (ty - ay2) * heat;
      drawSpider(sx2, sy2, Math.max(5.6, 14 * s), Math.atan2(ty - ay2, tx - ax2),
                 0.96, heat * 9);
    } else if (w.resident) {
      const q = REDUCED
        ? { x: hx + Math.cos(mid) * r * 0.5, y: hy + Math.sin(mid) * r * 0.5,
            face: mid, gait: 0 }
        : residentAt(w, hx, hy, r);
      drawSpider(q.x, q.y, Math.max(5.6, 14 * s), q.face, 0.90, q.gait);
    }
  }

  /* THE SPIDER. It looked like a tick, and a tick is exactly what you draw if
     you give something a fat oval body and short legs: the proportions ARE the
     animal. A spider is a small body carrying very long jointed legs - the legs
     reach nearly twice the body's length, they bend hard at the knee, and they
     splay forward and back rather than fanning out sideways. Get that right and
     eight lines read as a spider at eight pixels.

     `gait` runs the walk cycle. Diagonal legs swing together the way a real one
     moves, and a swinging leg lifts off the silk, which is drawn as a higher
     knee and a brighter line. It is driven by DISTANCE TRAVELLED, not by the
     clock, so a spider standing still has still legs. */
  function drawSpider(x, y, r, face, a, gait) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(face);
    const white = (al) => 'rgba(240,246,250,' + Math.max(0, al).toFixed(3) + ')';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(0.65, r * 0.085);

    /* TWO PAIRS FORWARD, TWO BACK, AND A GAP AT THE SIDES. Fanning eight legs
       evenly around the body draws an asterisk, not an animal - the empty
       quarter at ninety degrees is most of what makes the silhouette read.
       30, 53, 127 and 150 degrees, mirrored. */
    const BASE = [0.52, 0.92, 2.22, 2.62];
    const ox = r * 0.10;
    for (let i = 0; i < 4; i++) {
      for (const sgn of [1, -1]) {
        // alternating tetrapod: diagonally opposite legs swing together
        const ph = ((i + (sgn > 0 ? 0 : 1)) % 2) * 0.5;
        const sw = Math.sin((gait + ph) * TAU);
        const lift = Math.max(0, sw);
        const ang = (BASE[i] + sw * 0.17) * sgn;
        const femur = r * (0.86 + lift * 0.07);
        const tibia = r * (1.30 + lift * 0.12);
        const kx = ox + Math.cos(ang) * femur, ky = Math.sin(ang) * femur;
        /* A REAL KNEE. At 21 degrees the leg was near enough straight, which
           is the other half of why it read as a starburst: a spider's leg
           brackets sharply at the knee and the knee is the outermost point of
           the whole animal. */
        const bend = (0.86 + lift * 0.34) * sgn;
        const ex = kx + Math.cos(ang - bend) * tibia;
        const ey = ky + Math.sin(ang - bend) * tibia;
        ctx.strokeStyle = white(a * (0.70 + lift * 0.26));
        ctx.beginPath();
        ctx.moveTo(ox, 0); ctx.lineTo(kx, ky); ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    }

    // a small cephalothorax in front, a rounder abdomen behind. Both together
    // are shorter than one leg.
    ctx.fillStyle = white(a);
    ctx.beginPath(); ctx.ellipse(-r * 0.54, 0, r * 0.42, r * 0.33, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 0.12, 0, r * 0.25, r * 0.21, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* WHERE A RESIDENT IS, at this moment. It walks out along a thread to the far
     end of the web, waits there a while, walks back to the hub, waits, and then
     picks a different thread. Fifteen seconds a circuit, so it is always moving
     and never hurrying, and it covers most of its web rather than fidgeting on
     the spot - a spider that shifts a few pixels reads as a smudge with a
     twitch. It runs out past the rim onto the frame threads too, which is where
     real ones sit. */
  function residentAt(w, hx, hy, r) {
    const PERIOD = 15;
    const tt = clock * 0.62 + (w.seed | 0) % 97;
    const cyc = Math.floor(tt / PERIOD);
    const u = (tt % PERIOD) / PERIOD;
    const rnd2 = mulberry32(((w.seed | 0) + cyc * 977) | 0);
    const aim = w.a0 + w.span * (0.12 + rnd2() * 0.76);
    const ease = (k) => k * k * (3 - 2 * k);
    let frac, outward = true, moving = false;
    if (u < 0.12) frac = 0;
    else if (u < 0.44) { frac = ease((u - 0.12) / 0.32); moving = true; }
    else if (u < 0.58) frac = 1;
    else if (u < 0.90) { frac = 1 - ease((u - 0.58) / 0.32); moving = true; outward = false; }
    else frac = 0;
    const rr = r * (0.12 + 1.48 * frac);
    return {
      x: hx + Math.cos(aim) * rr, y: hy + Math.sin(aim) * rr,
      face: outward ? aim : aim + Math.PI,
      // the walk cycle advances with the journey, so standing still is still
      gait: frac * 7,
      moving,
    };
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

  function drawJar() {
    const jar = S.jar;
    const s = L.scale;
    const w = jar.w * s, h = jar.h * s, mouthW = jar.mouthW * s;
    const fill = S.caught / Math.max(1, S.need);
    const lamp = phase === 'win' ? 1 : 0.12 + 0.88 * fill;
    const flare = phase === 'win' ? winFlash() : 0;

    /* The glass catches whatever light is near it, so bringing the flame down
       to the mouth makes the jar answer. Before this it only ever brightened
       from the inside, and the last few feet of a level - the part that
       matters - looked exactly like the first. */
    const catchLit = Math.min(1, lightAt(wx2s(jar.x), wy2s(jar.y)).b);
    ctx.save();
    ctx.translate(wx2s(jar.mx), wy2s(jar.my));
    ctx.rotate(jar.ang);

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
    g1.addColorStop(0, 'rgba(255,255,255,' + (0.30 + fill * 0.16 + catchLit * 0.30).toFixed(3) + ')');
    g1.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g1; ctx.fillRect(-bh, 0, w * 0.10, h);
    // 2. the cold rim down the shaded flank, thinner still
    const g2 = ctx.createLinearGradient(bh, 0, bh - w * 0.055, 0);
    g2.addColorStop(0, 'rgba(206,232,246,' + (0.24 + fill * 0.12 + catchLit * 0.26).toFixed(3) + ')');
    g2.addColorStop(1, 'rgba(206,232,246,0)');
    ctx.fillStyle = g2; ctx.fillRect(bh - w * 0.055, 0, w * 0.055, h);
    // 3. where the glass thickens at the base and pools the light
    const g3 = ctx.createLinearGradient(0, h, 0, h - h * 0.14);
    g3.addColorStop(0, 'rgba(255,236,198,' + (0.16 + lamp * 0.26).toFixed(3) + ')');
    g3.addColorStop(1, 'rgba(255,236,198,0)');
    ctx.fillStyle = g3; ctx.fillRect(-bh, h - h * 0.14, w, h * 0.14);

    /* THE BACK WALL. This is what was missing and it is most of why the jar
       read as a painted shape rather than glass: you see through a jar to its
       FAR side, so the inside of the back wall catches light too and draws a
       second, fainter edge inboard of the front one. One pair of lines is a
       silhouette; two pairs is a vessel. */
    const g5 = ctx.createLinearGradient(-bh + w * 0.13, 0, -bh + w * 0.20, 0);
    g5.addColorStop(0, 'rgba(214,236,248,0)');
    g5.addColorStop(1, 'rgba(214,236,248,' + (0.13 + fill * 0.07).toFixed(3) + ')');
    ctx.fillStyle = g5; ctx.fillRect(-bh + w * 0.13, h * 0.10, w * 0.07, h * 0.82);
    const g6 = ctx.createLinearGradient(bh - w * 0.16, 0, bh - w * 0.10, 0);
    g6.addColorStop(0, 'rgba(214,236,248,' + (0.10 + fill * 0.05).toFixed(3) + ')');
    g6.addColorStop(1, 'rgba(214,236,248,0)');
    ctx.fillStyle = g6; ctx.fillRect(bh - w * 0.16, h * 0.10, w * 0.06, h * 0.82);
    // and the base is a thick disc of glass, seen through the front wall
    const g7 = ctx.createLinearGradient(0, h - h * 0.08, 0, h);
    g7.addColorStop(0, 'rgba(226,242,252,0)');
    g7.addColorStop(1, 'rgba(226,242,252,0.20)');
    ctx.fillStyle = g7;
    ctx.beginPath();
    ctx.ellipse(0, h - h * 0.045, bh * 0.86, h * 0.055, 0, 0, TAU);
    ctx.fill();
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
    // a rolled lip: the rim of a jar is a torus of glass, not an edge
    const rimW = mouthW * 0.55;
    const rg = ctx.createLinearGradient(0, -h * 0.028, 0, h * 0.030);
    rg.addColorStop(0, 'rgba(255,255,255,0.05)');
    rg.addColorStop(0.55, 'rgba(255,255,255,' + (0.30 + catchLit * 0.38).toFixed(3) + ')');
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
    // the inner face of the far lip, which is the give-away that it is hollow
    ctx.strokeStyle = 'rgba(232,246,252,0.30)';
    ctx.lineWidth = Math.max(0.9, h * 0.008);
    ctx.beginPath();
    ctx.ellipse(0, h * 0.004, rimW * 0.86, Math.max(1.4, h * 0.024), 0, Math.PI * 1.06, Math.PI * 1.94);
    ctx.stroke();

    ctx.restore();
  }

  /* THE FLAME. It is the brightest thing in the garden and it is the only
     thing in it the player controls, so it gets the strongest light in the
     scene and the softest edge. No rings: rings said "keep out", and this is
     the opposite instruction. A ribbon of light showing where it has just been
     is the one piece of information the hand needs, because the whole skill is
     how fast you moved it. */
  /* THE STICK ITSELF. A twig, held in the dark: it is lit at the tip by the
     flame it carries and fades to nothing toward the hand, which is both how a
     torch actually looks and the reason it never competes with the fireflies
     for attention. Slightly bowed, because a straight one reads as a ruler. */
  function drawStick() {
    const tx = wx2s(touch.x), ty = wy2s(touch.y);
    const gx = tx, gy = ty + TUNE.stick;
    /* IT HAS TO BE VISIBLE. The first version faded to near-black at the hand,
       which on a near-black garden is nothing at all - and the stick is the
       player's own instrument, the thing that says where their hand is in
       relation to the light it carries. A torch handle catches its own flame
       anyway, so it stays warm and readable the whole way down and only loses
       a little toward the grip. */
    const g = ctx.createLinearGradient(tx, ty, gx, gy);
    g.addColorStop(0, 'rgba(248,214,158,0.98)');
    g.addColorStop(0.20, 'rgba(206,158,104,0.94)');
    g.addColorStop(0.65, 'rgba(150,112,74,0.86)');
    g.addColorStop(1, 'rgba(104,78,54,0.74)');
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(2.8, 4.4 * L.scale);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.quadraticCurveTo(tx + TUNE.stick * 0.10, (ty + gy) / 2, tx, ty);
    ctx.stroke();
    // the ferrule the flame sits in
    ctx.fillStyle = 'rgba(214,176,124,0.55)';
    ctx.beginPath();
    ctx.ellipse(tx, ty + Math.max(2, 3 * L.scale), Math.max(1.8, 2.6 * L.scale),
                Math.max(1.2, 1.8 * L.scale), 0, 0, TAU);
    ctx.fill();
  }

  function drawFlame() {
    const s = L.scale;
    const x = wx2s(touch.x), y = wy2s(touch.y);
    const flick = REDUCED ? 1 : 1 + Math.sin(clock * 11.3) * 0.06
                              + Math.sin(clock * 7.1 + 1.3) * 0.04;

    ctx.globalCompositeOperation = 'lighter';
    // the reach, as a wide soft bloom rather than a drawn edge: a fly inside
    // this is a fly that can see you
    blit(SPR.haze, x, y, TUNE.lureR * s * 0.92, 0.50);
    blit(SPR.haze, x, y, 46 * s * flick, 0.95);

    // the body of the flame: a teardrop, leaning the way it is travelling
    const vx = lureVX, vy = lureVY, vm = Math.hypot(vx, vy);
    const lean = vm > 4 ? Math.atan2(vy, vx) : -Math.PI / 2;
    const stretch = Math.min(2.1, 1 + vm / 260);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);
    const r = Math.max(4.5, 11 * s) * flick;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.4);
    g.addColorStop(0, 'rgba(255,246,214,1)');
    g.addColorStop(0.26, 'rgba(255,214,138,0.92)');
    g.addColorStop(0.62, 'rgba(232,150,70,0.34)');
    g.addColorStop(1, 'rgba(232,150,70,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(-r * 0.30 * (stretch - 1), 0, r * 2.4 * stretch, r * 2.0, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,252,238,0.98)';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.62, r * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  /* WHERE THE FLAME HAS BEEN, for as long as it takes a fly to get there. The
     lag is the mechanic, so the lag is drawn: this ribbon is literally the path
     the string is still catching up with, and a corner you cut shows up here as
     a corner before it shows up as a fly in a web. */
  function drawFlameTrail() {
    if (lureTrail.length < 4) return;
    const n = lureTrail.length / 2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let c = 0; c < 3; c++) {
      const i0b = Math.floor((c / 3) * n), i1b = Math.min(n - 1, Math.floor(((c + 1) / 3) * n));
      if (i1b <= i0b) continue;
      const k = (c + 1) / 3;
      ctx.strokeStyle = 'rgba(255,206,132,' + (k * 0.20).toFixed(3) + ')';
      ctx.lineWidth = Math.max(1, k * 5 * L.scale);
      ctx.beginPath();
      ctx.moveTo(wx2s(lureTrail[i0b * 2]), wy2s(lureTrail[i0b * 2 + 1]));
      for (let i = i0b + 1; i <= i1b; i++) {
        ctx.lineTo(wx2s(lureTrail[i * 2]), wy2s(lureTrail[i * 2 + 1]));
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawFly(f) {
    const s = L.scale;
    const br = flashOf(f);
    const spooked = f.spook > 0;
    const x = wx2s(f.x), y = wy2s(f.y);

    /* HELD. A fly in silk does not blink on its own rhythm any more: it
       struggles, fast and bright, and `hold` shows how far you have worked it
       loose. Fear reads as speed here too, just with nowhere to go. */
    if (f.web >= 0) {
      const shake = REDUCED ? 0 : Math.sin(clock * 26 + f.ph * 9) * (2.2 * s) * f.hold;
      const bx2 = x + shake, by2 = y + Math.cos(clock * 21 + f.ph * 7) * (1.6 * s) * f.hold;
      ctx.globalCompositeOperation = 'lighter';
      blit(SPR.fly, bx2, by2, Math.max(8, 30 * s) * (0.9 + (1 - f.hold) * 0.5), 0.92);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = ART.flyCore;
      ctx.beginPath(); ctx.arc(bx2, by2, Math.max(1.5, 2.6 * s), 0, Math.PI * 2); ctx.fill();
      // how far loose it is, as a shrinking bright arc rather than a bar
      if (f.hold < 0.985) {
        ctx.strokeStyle = 'rgba(239,255,194,0.85)';
        ctx.lineWidth = Math.max(1.6, 2.2 * s);
        ctx.beginPath();
        ctx.arc(bx2, by2, Math.max(7, 13 * s), -Math.PI / 2,
                -Math.PI / 2 + Math.PI * 2 * (1 - f.hold));
        ctx.stroke();
      }
      return;
    }

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
        ctx.strokeStyle = 'rgba(216,240,144,' + (k * (spooked ? 0.46 : 0.34)).toFixed(3) + ')';
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
    blit(SPR.fly, x, y, Math.max(8, 31 * s) * spread * (0.74 + br * 0.55),
         (0.48 + br * 0.52) * (spooked ? 1.18 : 1));
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
  /* A vignette, which is the cheapest thing in the world and the difference
     between a rectangle of dark and a garden with a middle to it. It darkens
     the corners only, so nothing the player has to see is ever behind it. */
  function drawVignette() {
    const cx = L.playX + L.playW / 2, cy = L.playY + L.playH / 2;
    const r = Math.hypot(L.playW, L.playH) / 2;
    const g = ctx.createRadialGradient(cx, cy, r * 0.52, cx, cy, r);
    g.addColorStop(0, 'rgba(2,5,7,0)');
    g.addColorStop(1, 'rgba(2,5,7,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(L.playX, L.playY, L.playW, L.playH);
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
    const short = phase === 'short';
    hit.mute = hit.restart = hit.rules = null;

    // --- measure the row, then lay it out from its own end ---
    const items = [{ k: 'mute', w: UI.PILL.iconW }];
    /* THE CONTROL ROW NEVER CHANGES. Sentence case, three quiet pills, exactly
       what Bloom and Prism carry. The end of a level belongs in a MODAL - which
       is what every other game on the site does - and not as a 210px blue slab
       dropped into the middle of the controls, where it shouted over the row it
       had elbowed out of the way. */
    items.push({ k: 'restart', w: UI.pillWidth(ctx, 'Restart') });
    items.push({ k: 'rules', w: UI.pillWidth(ctx, 'Rules') });
    void won; void short;
    let total = 0;
    for (const it of items) total += it.w;
    total += UI.PILL.gap * (items.length - 1);

    const rowLeft = MODE === 'mobile'
      ? Math.round((LW - total) / 2)
      : SIDE_PAD;
    let x = rowLeft;
    for (const it of items) {
      const c = x + it.w / 2;
      if (it.k === 'mute') {
        hit.mute = UI.drawPill(ctx, '', c, cy, { w: UI.PILL.iconW });
        speakerGlyph(c, cy, sfx ? sfx.isOn() : true);
      } else if (it.k === 'restart') {
        hit.restart = UI.drawPill(ctx, 'Restart', c, cy);
      } else {
        hit.rules = UI.drawPill(ctx, 'Rules', c, cy);
      }
      x += it.w + UI.PILL.gap;
    }

    /* The read-out: one right-aligned line on the band centre, shrunk into
       whatever the row leaves it. They lay out from opposite ends of the same
       band and nothing else checks that they do not collide. */
    const bandCy = topBand() / 2;
    const rowRight = MODE === 'mobile' ? 0 : rowLeft + total;
    const avail = LW - SIDE_PAD - rowRight - 16;
    /* The count is against what the JAR HOLDS, not against how many are in the
       garden, because the garden always has more. The spare column is the
       margin a mistake spends, and it is only shown once one has actually been
       spent: a running tally of what you have lost, printed from the first
       second, would turn a garden into a scoreboard. */
    /* Level first, sentence case, figures in one line: "Level 1 · 3/10 watered
       · 0 turns" is what Bloom says and "Level 1 · 0/3 lit · 0 turns" is what
       Prism says. This was shouting IN THE JAR 0 / 6 · LEVEL 54. */
    const spare = S.n - S.lost - S.need;
    const bits = ['Level ' + S.lvl, S.caught + '/' + S.need + ' in the jar'];
    if (S.lost > 0) bits.push(spare > 0 ? spare + ' spare' : 'no spares');
    const txt = bits.join('   ·   ');
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

  }

  /* ---------- THE RULES CARD ----------
     Built to the standard box in the design system, not to a size that happened
     to fit: 470 wide capped, 420 tall capped, a fixed 154 header, a fixed 98
     footer, and a BODY THAT SCROLLS in between. The type never shrinks and the
     CTA never moves, because shrinking type was the old workaround for
     unbounded content and a bounded scroll region is the fix.

     It carries a looping demo, and that is not decoration. "Move slowly and
     they follow your path, move fast and the tail cuts the corner" cannot be
     conveyed by a still picture of a garden, and the design system's rule is
     that a game whose rule cannot be guessed from a still carries a demo.
     Stained's does. */
  const CARD = { header: 154, footer: 98, radius: 22, maxW: 470, maxH: 420 };
  const RULES = [
    'Hold anywhere. A flame lights on your stick and the fireflies come to it.',
    'Go gently and they follow your path. Go fast and the back of the line cuts the corner.',
    'They cannot see the webs. You can. Lead them to the jar and take your corners wide.',
  ];
  const DEMO_MS = 7200;
  const DEMO_SAY = [
    { at: 0,    say: 'Lead them with the flame' },
    { at: 2600, say: 'Slowly, and the line follows you' },
    { at: 4300, say: 'Too fast, and the last one clips the silk' },
    { at: 6100, say: 'So take your corners wide' },
  ];
  let demoClock = null;          // test hook: freeze the loop at a given ms
  let rulesOpen = false, rulesScroll = 0, rulesGeom = null;

  function cardBox() {
    const pw = Math.min(LW - 56, CARD.maxW);
    const ph = Math.min(LH - 20, CARD.maxH);
    const px = Math.round((LW - pw) / 2);
    const py = Math.max(10, Math.round((LH - ph) / 2));
    return { pw, ph, px, py, bodyH: ph - CARD.header - CARD.footer };
  }

  /* One loop of the demo. A flame walks a bent path; three fireflies trail it
     with the same lag the game uses, so the corner-cutting the caption talks
     about is the corner-cutting you can see. */
  function drawDemo(x, y, w, h, ms) {
    const u = (ms % DEMO_MS) / DEMO_MS;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const ng = ctx.createLinearGradient(0, y, 0, y + h);
    ng.addColorStop(0, ART.nightTop); ng.addColorStop(1, ART.nightBot);
    ctx.fillStyle = ng; ctx.fillRect(x, y, w, h);

    // the path: in from the left, a hard corner, out to the right
    const p0 = { x: x + w * 0.10, y: y + h * 0.30 };
    const p1 = { x: x + w * 0.58, y: y + h * 0.30 };
    const p2 = { x: x + w * 0.86, y: y + h * 0.80 };
    const fast = u > 0.52 && u < 0.86;          // the second pass is hurried
    const t = fast ? ((u - 0.52) / 0.34) : (u < 0.52 ? u / 0.52 : (u - 0.86) / 0.14);
    const at = (k) => (k < 0.55
      ? { x: p0.x + (p1.x - p0.x) * (k / 0.55), y: p0.y + (p1.y - p0.y) * (k / 0.55) }
      : { x: p1.x + (p2.x - p1.x) * ((k - 0.55) / 0.45), y: p1.y + (p2.y - p1.y) * ((k - 0.55) / 0.45) });

    // the web sits on the inside of the corner, which is what gets clipped
    const web = { x: p1.x + w * 0.06, y: p1.y + h * 0.26, r: Math.min(w, h) * 0.11 };
    ctx.strokeStyle = 'rgba(214,226,236,0.5)';
    ctx.lineWidth = 1;
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.arc(web.x, web.y, web.r * (k / 3), -0.4, 3.1);
      ctx.stroke();
    }
    for (let k = 0; k < 5; k++) {
      const a = -0.4 + (3.5 * k) / 4;
      ctx.beginPath(); ctx.moveTo(web.x, web.y);
      ctx.lineTo(web.x + Math.cos(a) * web.r, web.y + Math.sin(a) * web.r);
      ctx.stroke();
    }

    const tip = at(Math.min(1, t));
    // three fireflies, lagging further the faster the flame is going
    const lag = fast ? 0.26 : 0.09;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const k = Math.max(0, Math.min(1, t - lag * (i + 1)));
      let f = at(k);
      // hurrying cuts the corner: the tail crosses the inside of the bend
      if (fast && k > 0.40 && k < 0.80) {
        const c = 1 - Math.abs(k - 0.60) / 0.20;
        f = { x: f.x + (web.x - f.x) * c * 0.75, y: f.y + (web.y - f.y) * c * 0.75 };
      }
      blit(SPR.fly, f.x, f.y, 9, 0.95);
      ctx.fillStyle = ART.flyCore;
      ctx.beginPath(); ctx.arc(f.x, f.y, 1.7, 0, TAU); ctx.fill();
    }
    blit(SPR.haze, tip.x, tip.y, 34, 0.9);
    ctx.fillStyle = 'rgba(255,250,232,0.98)';
    ctx.beginPath(); ctx.arc(tip.x, tip.y, 3.4, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // the stick, so the card teaches that too
    ctx.strokeStyle = 'rgba(206,158,104,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x, tip.y + 22); ctx.stroke();
    ctx.restore();
  }

  function demoSay(ms) {
    const u = ms % DEMO_MS;
    let say = DEMO_SAY[0].say;
    for (const st of DEMO_SAY) if (u >= st.at) say = st.say;
    return say;
  }

  function drawRules(now) {
    const b = cardBox();
    ctx.fillStyle = TOK.scrim;
    ctx.fillRect(0, 0, LW, LH);
    ctx.fillStyle = TOK.bgCard;
    UI.roundRectPath(ctx, b.px, b.py, b.pw, b.ph, CARD.radius);
    ctx.fill();
    ctx.strokeStyle = TOK.tint12; ctx.lineWidth = 1;
    UI.roundRectPath(ctx, b.px, b.py, b.pw, b.ph, CARD.radius);
    ctx.stroke();

    // --- header: title, subtitle, and the demo underneath them
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = TOK.text;
    ctx.font = '800 40px Inter, sans-serif';
    ctx.fillText('LANTERN', b.px + b.pw / 2, b.py + 34 + 34);
    ctx.fillStyle = TOK.ink82;
    ctx.font = '600 17px Inter, sans-serif';
    ctx.fillText('Lead the fireflies home.', b.px + b.pw / 2, b.py + 34 + 54 + 17);

    /* THE BODY IS HEADER-TO-FOOTER, and the demo lives INSIDE it rather than
       stealing from it. The first version hung the demo off the header by eight
       pixels and let the scroll viewport take whatever was left, and the
       detector reported the three zones missing the card height by 94: true,
       useless, and exactly the kind of number that gets waved through. Demo,
       caption and viewport now divide the body exactly, and rulesFit() checks
       both sums. */
    /* THE DEMO GIVES WAY BEFORE THE RULES DO. At 480x360, the smallest frame
       /embed/ supports, the body is 88 pixels: demo plus caption took 68 of
       them and left the rules TWENTY, which is one clipped line. The detector
       said fits:true, because it was measuring arithmetic rather than whether
       a person could read anything - a card that passes with a 20 pixel
       viewport is exactly the kind of pass this house has learned to distrust.
       Below 130 the demo is dropped and the rules take the whole body, which
       is the 88 the design system says to expect there. */
    const bodyTop = b.py + CARD.header;
    const showDemo = b.bodyH >= 130;
    const CAP_H = showDemo ? 24 : 0;
    const demoH = showDemo ? Math.max(44, Math.min(84, Math.round(b.bodyH * 0.36))) : 0;
    if (showDemo) {
      drawDemo(b.px + 22, bodyTop, b.pw - 44, demoH, demoClock != null ? demoClock : now);
      ctx.fillStyle = TOK.ink82;
      ctx.font = '600 14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(demoSay(demoClock != null ? demoClock : now),
                   b.px + b.pw / 2, bodyTop + demoH + 16);
    }

    // --- the numbered rules, scrolling in what the demo leaves
    const viewTop = bodyTop + demoH + CAP_H;
    const viewH = Math.max(0, b.bodyH - demoH - CAP_H);
    ctx.save();
    ctx.beginPath(); ctx.rect(b.px, viewTop, b.pw, viewH); ctx.clip();
    ctx.textAlign = 'left';
    let ry = viewTop - rulesScroll;
    const wrapW = b.pw - 100;
    let contentH = 0;
    for (let i = 0; i < RULES.length; i++) {
      const lines = wrapLines(RULES[i], wrapW, '500 16px Inter, sans-serif');
      ctx.fillStyle = TOK.dot;
      ctx.beginPath(); ctx.arc(b.px + 43, ry + 11, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = TOK.bg;
      ctx.font = '800 14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), b.px + 43, ry + 16);
      ctx.textAlign = 'left';
      ctx.fillStyle = TOK.ink90;
      ctx.font = '500 16px Inter, sans-serif';
      for (let k = 0; k < lines.length; k++) ctx.fillText(lines[k], b.px + 66, ry + 16 + k * 22);
      const blockH = Math.max(24, lines.length * 22);
      ry += blockH + 13; contentH += blockH + 13;
    }
    ctx.restore();
    const scrollMax = Math.max(0, contentH - 13 - viewH);
    if (rulesScroll > scrollMax) rulesScroll = scrollMax;
    // a 20px fade marks an edge with more beyond it
    if (rulesScroll > 1) fadeEdge(b.px, viewTop, b.pw, 20, true);
    if (rulesScroll < scrollMax - 1) fadeEdge(b.px, viewTop + viewH - 20, b.pw, 20, false);

    // --- footer: the one CTA, at its house size, never moved
    const cy = b.py + b.ph - 32 - UI.CTA.h / 2;
    hit.rulesPlay = UI.drawCTA(ctx, 'PLAY', b.px + b.pw / 2, cy, TOK.cta);
    rulesGeom = { pw: b.pw, ph: b.ph, px: b.px, py: b.py, viewTop, viewH,
                  bodyH: b.bodyH, demoH, capH: CAP_H, showDemo,
                  contentH: contentH - 13, scrollMax };
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  function fadeEdge(x, y, w, h, top) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(top ? 0 : 1, 'rgba(19,31,54,1)');
    g.addColorStop(top ? 1 : 0, 'rgba(19,31,54,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  }

  function wrapLines(text, maxW, font) {
    ctx.font = font;
    const words = text.split(' ');
    const out = []; let line = '';
    for (const wd of words) {
      const test = line ? line + ' ' + wd : wd;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = wd; }
      else line = test;
    }
    if (line) out.push(line);
    return out;
  }

  /* ---------- THE END OF A LEVEL ----------
     A scrim, a title, one line that says what happened, and one button. That is
     what Prism does and what Bloom does, and it is what the owner expects
     everywhere on the site: the level ends with a modal, not with a control row
     quietly changing shape underneath you.

     It waits for the garden to finish saying its piece first - the jar flashes
     three times when you win, and covering that with a panel would be throwing
     away the only celebration the game has. */
  function endCard(now) {
    if (phase === 'play') return;
    const won = phase === 'win';
    const wait = won ? 3.2 : 0.7;
    const t = Math.max(0, Math.min(1, (winT - wait) / 0.42));
    if (t <= 0) { hit.endCta = null; return; }
    ctx.globalAlpha = t;
    ctx.fillStyle = TOK.scrimWin;
    ctx.fillRect(0, 0, LW, LH);

    const cx = LW / 2, cy = LH / 2;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = TOK.text;
    ctx.font = '800 ' + (MODE === 'mobile' ? 38 : 46) + 'px Inter, sans-serif';
    ctx.fillText(won ? 'HOME SAFE' : 'TOO FEW LEFT', cx, cy - 30);

    /* IT WRAPS, and it is short. At 390 wide an eighteen-pixel sentence about
       the jar needing three ran off both edges of the phone it was written on.
       17px Ink 82 is the house modal subtitle, and the wrap width is the card
       width the design system uses, so a long line breaks instead of leaving. */
    ctx.fillStyle = TOK.ink82;
    ctx.font = '600 17px Inter, sans-serif';
    const n = S.caught, lost = S.lost, left = S.n - lost;
    const line = won
      ? (lost === 0 ? 'every one home, and none touched the silk'
                    : n + ' in the jar, ' + lost + ' lost to the webs')
      : 'the jar needs ' + S.need + ', and ' + left + ' are left';
    const lines = wrapLines(line, Math.min(LW - 56, 420), '600 17px Inter, sans-serif');
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], cx, cy + 12 + i * 24);

    hit.endCta = UI.drawCTA(ctx, won ? 'NEXT LEVEL' : 'TRY AGAIN',
                            cx, cy + 52 + lines.length * 24, TOK.cta);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
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
  // Your hand is at p. The flame is at the other end of the stick.
  function toWorld(p) {
    return { x: s2wx(p.x), y: s2wy(p.y - TUNE.stick) };
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
    /* The card takes every press while it is open, or a tap that dismisses it
       also lights a flame underneath and the swarm moves before the player has
       read anything. */
    if (rulesOpen) {
      if (inBox(hit.rulesPlay, p.x, p.y)) { rulesOpen = false; if (sfx) sfx.play('click'); }
      return;
    }
    if (inBox(hit.rules, p.x, p.y)) { rulesOpen = true; rulesScroll = 0; return; }
    if (inBox(hit.mute, p.x, p.y)) {
      if (sfx) { sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.play('click'); }
      return;
    }
    if (inBox(hit.restart, p.x, p.y)) { restart(); return; }
    if (inBox(hit.endCta, p.x, p.y)) { nextLevel(); return; }
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
  canvas.addEventListener('wheel', (e) => {
    if (!rulesOpen || !rulesGeom) return;
    e.preventDefault();
    rulesScroll = Math.max(0, Math.min(rulesGeom.scrollMax, rulesScroll + e.deltaY));
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && rulesOpen) rulesOpen = false;
    else if (e.key === 'r' || e.key === 'R') restart();
    else if (e.key === 'm' || e.key === 'M') { if (sfx) sfx.setOn(!sfx.isOn()); }
    else if ((e.key === 'Enter' || e.key === ' ') && phase !== 'play') nextLevel();
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
  // The same button in both places, because it is the same gesture: get on
  // with it. After a win that is the next garden; after running short it is
  // this one again, which was always free.
  function nextLevel() {
    if (phase === 'short') { T().levelRestart(S.lvl); gotoLevel(S.lvl); return; }
    gotoLevel(Math.min(LEVELS, S.lvl + 1));
  }
  function gotoLevel(n) {
    n = Math.min(LEVELS, Math.max(1, n));
    S = buildScene(n);
    phase = 'play'; winT = 0; clock = 0; touch = null; pointerId = null;
    save.lvl = n; persist();
    layout(); buildScenery();
    T().levelStart(n);
  }

  // ---------- TUNING (?tune=1) ----------
  /* Dev only, and gated on the query string so it can never ship. The point of
     M0 is to hold the thing and say whether pushing feels like moving warm air;
     that conversation goes faster with the dial in the owner's hand than with a
     round trip through me for every value. */
  const SLIDERS = [
    ['lureSpeed', 60, 320, 5], ['lureR', 70, 280, 5],
    ['lure', 0.5, 8, 0.1], ['lureHold', 8, 90, 2],
    ['flyMax', 20, 110, 1], ['sep', 10, 90, 1],
    ['wander', 0, 1.2, 0.05],
    ['jarShy', 0, 6, 0.1], ['jarShyR', 60, 260, 5],
    ['webR', 14, 70, 1], ['spiderSecs', 4, 24, 0.5],
    ['freeR', 20, 140, 2], ['freeSecs', 0.4, 4, 0.1],
    ['webCool', 0, 12, 0.5], ['breeze', 0, 70, 1],
    ['stick', 0, 160, 2],
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
      'hand ' + Math.hypot(lureVX, lureVY).toFixed(0) + ' of ' + TUNE.lureSpeed + ' they can follow',
      'stuck ' + S.stuckNow + '  ·  lost ' + S.lost + '  ·  left behind ' + S.flies.filter((f) => !f.caught && !f.lost && f.web < 0 && !f.led).length,
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
      lvl: S.lvl, tier: S.tier + 1, n: S.n, need: S.need, caught: S.caught,
      lost: S.lost, stuck: S.stuckNow, spare: S.n - S.lost - S.need,
      sticks: S.sticks, resticks: S.resticks, rescues: S.rescues,
      webs: S.webs.length, thorns: S.thorns.length,
      seconds: +S.seconds.toFixed(2), phase, mode: MODE,
      handSpeed: +Math.hypot(lureVX, lureVY).toFixed(0), canFollow: TUNE.lureSpeed,
      led: S.flies.filter((f) => f.led).length,
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
      /* THE WEBS, which are now the single most important thing in the garden
         to be able to see: everything lost is lost to one, and the contract is
         that the flies cannot see silk and you can. Measured in the dark, with
         nothing else drawn and no light on them, which is the hardest case and
         the one that has to hold. */
      if (S.webs.length) {
        SOLO = 'webs'; render();
        for (const w of S.webs.slice(0, 4)) {
          measure('web', wx2s(w.x) - w.r * L.scale * 1.5, wy2s(w.y) - w.r * L.scale * 1.5,
                  w.r * 3 * L.scale, w.r * 3 * L.scale, true);
        }
      }
      if (touch) {
        SOLO = 'stick'; render();
        const tx0 = wx2s(touch.x), ty0 = wy2s(touch.y);
        measure('the stick', tx0 - 14, ty0 + TUNE.stick * 0.45,
                28, TUNE.stick * 0.5, true);
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
      web: f.web, hold: +f.hold.toFixed(2), lost: f.lost, led: f.led,
      own: +Math.hypot(f.vx, f.vy).toFixed(1),
      shove: +Math.hypot(f.sx, f.sy).toFixed(1),
      total: +Math.hypot(f.vx + f.sx, f.vy + f.sy).toFixed(1),
      spook: +f.spook.toFixed(2), caught: f.caught,
    })),
    swarm: () => {
      const l = S.flies.filter((f) => !f.caught && !f.lost && f.web < 0);
      if (!l.length) return { loose: 0 };
      const cx = l.reduce((a, f) => a + f.x, 0) / l.length;
      const cy = l.reduce((a, f) => a + f.y, 0) / l.length;
      const spread = l.reduce((a, f) => a + Math.hypot(f.x - cx, f.y - cy), 0) / l.length;
      const own = l.reduce((a, f) => a + Math.hypot(f.vx, f.vy), 0) / l.length;
      const sh = l.reduce((a, f) => a + Math.hypot(f.sx, f.sy), 0) / l.length;
      const tot = l.reduce((a, f) => a + Math.hypot(f.vx + f.sx, f.vy + f.sy), 0) / l.length;
      const sk = l.filter((f) => f.spook > 0).length;
      return { loose: l.length, led: l.filter((f) => f.led).length,
               stuck: S.stuckNow, lost: S.lost,
               cx: +cx.toFixed(1), cy: +cy.toFixed(1),
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
        f.sx = f.sy = f.wx = f.wy = 0; f.spook = 0; f.cs = 1;
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
    controls: () => ({ mute: hit.mute, restart: hit.restart, rules: hit.rules,
                       next: hit.endCta, rulesPlay: hit.rulesPlay,
                       ctrlCy: L.ctrlCy, muted: sfx ? !sfx.isOn() : null,
                       rulesOpen }),

    /* SCRIPTED TIME. Runs the real fixed-step loop synchronously, so a bot can
       play a level without waiting for frames. The gate in M2 is built on this
       and on nothing else: the sim takes no wall-clock input, uses no
       Math.random, and the same script from the same seed gives the same
       answer every time. `assertDeterminism()` below is the proof.  */
    advance(secs) {
      const n = Math.round(secs / DT);
      for (let i = 0; i < n; i++) { if (phase !== 'play') winT += DT; step(DT); }
      return this.state();
    },

    /* A BOT THAT LEADS. It walks the flame from the flies to the jar's mouth
       and then INTO it, at a chosen speed, going round the webs on the way and
       stopping to hold the light over anything caught in silk.

       `speed` is the whole experiment. There is exactly one difficulty setting
       in this game and it is how fast you move your hand, so the gate is a
       sweep of this one number: too slow and you are loitering next to spiders,
       too fast and the string swings wide on the corners and the tail goes into
       the silk. If there is no interior optimum, there is no game. */
    leadBot(opts) {
      const o = opts || {};
      const speed = o.speed != null ? o.speed : 110;
      const limit = o.limit != null ? o.limit : 120;
      const tick = 1 / 30;
      if (o.level != null) gotoLevel(o.level);
      const jar = S.jar;
      // start the flame on the flies so it has something to lead
      let lx = 0, ly = 0, n0 = 0;
      for (const f of S.flies) if (!f.caught && !f.lost) { lx += f.x; ly += f.y; n0++; }
      if (n0) { lx /= n0; ly /= n0; }
      touch = { x: lx, y: ly };

      let t = 0, held = 0, insideJar = 0;
      while (t < limit && phase === 'play') {
        // 1. anything in silk outranks everything: it is the only thing on a clock
        let save = null, worst = -1;
        if (!o.noRescue) for (const f of S.flies) {
          if (f.caught || f.lost || f.web < 0) continue;
          const w = S.webs[f.web];
          if (w.spiderT > worst) { worst = w.spiderT; save = f; }
        }
        let tx, ty, cap = speed;
        if (save) { tx = save.x; ty = save.y; held += tick; }
        else {
          // 2. otherwise gather the stragglers, then take everyone to the jar
          let far = null, fd = -1;
          for (const f of S.flies) {
            if (f.caught || f.lost || f.web >= 0) continue;
            const d = Math.hypot(f.x - lx, f.y - ly);
            if (d > TUNE.lureR * 0.92 && d > fd) { fd = d; far = f; }
          }
          if (far) { tx = far.x; ty = far.y; }
          else {
            // into the mouth, and then a little way inside, so the string
            // follows the light through rather than stopping at the doorway
            tx = jar.mx + jar.inX * jar.h * 0.34;
            ty = jar.my + jar.inY * jar.h * 0.34;
            insideJar += tick;
          }
          if (!o.careless) {
            const vx = tx - lx, vy = ty - ly, vl = Math.hypot(vx, vy) || 1;
            let bestAlong = Infinity;
            for (const w of S.webs) {
              const rx = w.x - lx, ry = w.y - ly;
              const along = (rx * vx + ry * vy) / vl;
              if (along < 0 || along > vl) continue;
              const side = (rx * -vy + ry * vx) / vl;
              const clear = w.r + TUNE.lureR * 0.42;
              if (Math.abs(side) > clear || along >= bestAlong) continue;
              bestAlong = along;
              const push = (side >= 0 ? -1 : 1) * (clear + 20);
              tx = w.x + (-vy / vl) * push; ty = w.y + (vx / vl) * push;
            }
          }
        }
        // 3. move the flame, at no more than the speed being tested
        const dx = tx - lx, dy = ty - ly, d = Math.hypot(dx, dy);
        const stepLen = Math.min(d, cap * tick);
        if (d > 1e-6) { lx += dx / d * stepLen; ly += dy / d * stepLen; }
        touch = { x: lx, y: ly };
        this.advance(tick); t += tick;
      }
      const out = { level: S.lvl, tier: S.tier + 1, flies: S.n, need: S.need,
                    speed, careless: !!o.careless, noRescue: !!o.noRescue,
                    finished: S.caught >= S.need, caught: S.caught,
                    lost: S.lost, sticks: S.sticks, rescues: S.rescues,
                    secs: +t.toFixed(1), secsRescuing: +held.toFixed(1),
                    secsAtTheMouth: +insideJar.toFixed(1) };
      touch = null;
      return out;
    },

    /* THE GATE. Sweeps the one dial the player has - hand speed - and reports
       what it costs at each setting. A craft game has to have an interior
       optimum or the right answer is "do the extreme thing", which is not a
       decision. */
    probeSpeed(opts) {
      const o = opts || {};
      const speeds = o.speeds || [40, 70, 100, 130, 170, 220, 280];
      const levels = o.levels || [9, 21, 33, 45];
      const rows = [];
      for (const sp of speeds) {
        let won = 0, lost = 0, sticks = 0, secs = 0, runs = 0;
        for (const lv of levels) {
          const r = this.leadBot({ level: lv, speed: sp, limit: o.limit || 150 });
          runs++; if (r.finished) { won++; secs += r.secs; }
          lost += r.lost; sticks += r.sticks;
        }
        rows.push({ handSpeed: sp, won: won + '/' + runs,
                    meanSecsWhenWon: won ? +(secs / won).toFixed(1) : null,
                    fliesLost: lost, sticks });
      }
      const best = rows.filter((r) => r.meanSecsWhenWon != null)
                       .sort((a, b) => a.meanSecsWhenWon - b.meanSecsWhenWon)[0];
      return {
        theyCanFollow: TUNE.lureSpeed,
        fastest: best ? best.handSpeed : null,
        interiorOptimum: best ? (best.handSpeed !== speeds[0] &&
                                 best.handSpeed !== speeds[speeds.length - 1]) : false,
        rows,
      };
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

    /* THE CHECK THAT SHOULD HAVE EXISTED FROM THE FIRST COMMIT. Nobody plays,
       nothing is touched, and the count must stay at zero on every level. The
       craft gate asks whether care beats carelessness; it is meaningless until
       ABSENCE loses, and absence used to win. */
    assertNoFreeCaptures(opts) {
      const o = opts || {};
      const secs = o.secs || 300;
      const step2 = o.step || 1;
      const keepLvl = S.lvl;
      const bad = [];
      let worst = 0;
      for (let lv = 1; lv <= LEVELS; lv += step2) {
        gotoLevel(lv); touch = null;
        this.advance(secs);
        if (S.caught > 0) bad.push('L' + lv + ' ' + S.caught + '/' + S.n);
        if (S.caught > worst) worst = S.caught;
      }
      gotoLevel(keepLvl);
      return { levelsTested: Math.ceil(LEVELS / step2), secondsEach: secs,
               levelsThatPlayedThemselves: bad, worstFreeCaptures: worst,
               pass: bad.length === 0 };
    },

    /* SAVE AND RESTORE MUST BALANCE, and nothing about a canvas tells you when
       they do not. Removing the jar's lid left one save() without its
       restore(), so every single thing drawn after the jar - the flame, the
       flies, the near foliage, the front grass, the vignette - was quietly
       drawn inside the jar's own rotated, translated frame. The picture still
       rendered. It just rendered the second half of itself somewhere else, and
       the only symptom was "the flame is not there".

       This counts the stack depth across a whole frame and reports any drift.
       Zero, or the frame is lying to you. */
    assertTransformBalanced() {
      const realSave = ctx.save.bind(ctx), realRestore = ctx.restore.bind(ctx);
      let depth = 0, worst = 0, unders = 0;
      ctx.save = () => { depth++; if (depth > worst) worst = depth; realSave(); };
      ctx.restore = () => { depth--; if (depth < 0) unders++; realRestore(); };
      try { render(); } finally { ctx.save = realSave; ctx.restore = realRestore; }
      return { leftOpenAtEndOfFrame: depth, deepest: worst,
               restoredTooOften: unders, pass: depth === 0 && unders === 0 };
    },

    /* DOES A RESIDENT ACTUALLY GO ANYWHERE? "A few pixels here or there" was
       the complaint about the last one, and a spider that fidgets on the spot
       reads as a smudge with a twitch. Samples a full circuit and reports how
       far it really travels, in the pixels the player sees. */
    spiderPatrol(secs) {
      const w = S.webs.find((q) => q.resident);
      if (!w) return { note: 'no resident on this level' };
      const keepClock = clock;
      const s = L.scale, r = w.r * s;
      const hx = wx2s(w.x), hy = wy2s(w.y);
      const pts = [];
      const span = secs || 30;
      for (let i = 0; i <= 120; i++) {
        clock = keepClock + (i / 120) * span;
        const q = residentAt(w, hx, hy, r);
        pts.push(q);
      }
      clock = keepClock;
      let far = 0, path = 0, moving = 0, gaitRun = 0;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
          if (d > far) far = d;
        }
        if (i) {
          path += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
          // total steps taken, not end-minus-start: the gait resets each
          // circuit, so a difference reads -1 when the answer is fourteen
          gaitRun += Math.abs(pts[i].gait - pts[i - 1].gait);
        }
        if (pts[i].moving) moving++;
      }
      return {
        overSeconds: span,
        furthestApartPx: +far.toFixed(1),
        pathLengthPx: +path.toFixed(1),
        webRadiusPx: +r.toFixed(1),
        fractionOfTimeWalking: +(moving / pts.length).toFixed(2),
        legStridesTaken: +gaitRun.toFixed(1),
      };
    },

    /* rulesFit(). "A card is not fixed until something can measure it" - three
       cards in three days were believed fixed and were not, and each was caught
       by a detector on its first run. Reports the real geometry, and it only
       reports it while the card is the thing on screen: a detector that answers
       outside the phase it describes is worth nothing. */
    rulesFit() {
      const wasOpen = rulesOpen;
      rulesOpen = true; render();
      const g = rulesGeom;
      rulesOpen = wasOpen; render();
      if (!g) return { fits: false, note: 'card did not lay out' };
      const zones = CARD.header + g.bodyH + CARD.footer;
      const insideBody = g.demoH + g.capH + g.viewH;
      const bottomOfBody = g.viewTop + g.viewH;
      const topOfCta = g.py + g.ph - 32 - UI.CTA.h;
      return {
        fits: g.py >= 10 && g.py + g.ph <= LH && bottomOfBody <= topOfCta + 0.5 &&
              Math.abs(zones - g.ph) < 0.5 && Math.abs(insideBody - g.bodyH) < 0.5 &&
              // two lines of copy, or nobody can read it whatever the sums say
              g.viewH >= 44,
        frameW: LW, frameH: LH,
        cardW: g.pw, cardH: g.ph,
        headerH: CARD.header, footerH: CARD.footer,
        viewportH: +g.viewH.toFixed(1), contentH: +g.contentH.toFixed(1),
        scrollMax: +g.scrollMax.toFixed(1),
        scrolls: g.scrollMax > 0.5,
        // the one thing nothing else checks: does the body run under the CTA
        overlapPx: +Math.max(0, bottomOfBody - topOfCta).toFixed(1),
        demoH: g.demoH, captionH: g.capH, bodyH: g.bodyH, demoShown: g.showDemo,
        // both sums, and both have to be zero
        zonesMinusCard: +(zones - g.ph).toFixed(1),
        bodyPartsMinusBody: +(insideBody - g.bodyH).toFixed(1),
      };
    },
    openRules(v) { rulesOpen = v !== false; rulesScroll = 0; return rulesOpen; },
    setDemoClock(ms) { demoClock = ms; return demoClock; },
    scrollRules(px) {
      if (!rulesGeom) return null;
      rulesScroll = Math.max(0, Math.min(rulesGeom.scrollMax, rulesScroll + px));
      return rulesScroll;
    },

    /* PADDING, MEASURED. "Nothing sticking to the edges or to each other" is
       not something you can check by looking, because the thing that bites is
       the frame you did not try: a control row that clears the read-out at 760
       collides at 380, and a card that sits nicely at 420 tall touches the
       frame at 360. So every gap the layout owns is reported as a number with
       the floor it has to clear, and `tightest` names the one closest to
       failing rather than making me hunt for it. */
    paddingAudit() {
      render();
      const g = [];
      const add = (name, px, floor) => g.push({ name, px: +px.toFixed(1), floor,
                                                ok: px >= floor - 0.5 });
      const b = hit;
      if (b.mute) {
        add('frame edge to first control', MODE === 'mobile'
              ? b.mute.x : b.mute.x, MODE === 'mobile' ? 12 : SIDE_PAD);
        add('control row to frame bottom', LH - (b.mute.y + b.mute.h),
            MODE === 'mobile' ? 24 : 12);
        add('control row to frame top', b.mute.y, MODE === 'mobile' ? 24 : 6);
      }
      const row = [b.mute, b.restart, b.rules, b.next].filter(Boolean)
                   .sort((a, c) => a.x - c.x);
      for (let i = 1; i < row.length; i++) {
        add('gap between controls ' + i, row[i].x - (row[i - 1].x + row[i - 1].w),
            UI.PILL.gap - 0.5);
      }
      if (row.length) {
        const right = row[row.length - 1];
        add('last control to frame right', LW - (right.x + right.w), 12);
      }
      if (L.readoutLeft != null) {
        add('read-out to frame right', SIDE_PAD, SIDE_PAD);
        add('read-out to nearest control', L.readoutLeft - (L.rowRight || 0), 16);
      }
      // the playfield's own breathing room
      add('garden to frame side', L.ox, 0);
      add('flies to the control row',
          (MODE === 'mobile' ? L.ctrlCy - UI.PILL.h / 2 : LH) -
          (L.oy + TUNE.arena * L.scale), MODE === 'mobile' ? 0 : -1e9);
      // and the card, at whatever frame it is being asked to live in
      const wasOpen = rulesOpen;
      rulesOpen = true; render();
      if (rulesGeom) {
        add('card to frame top', rulesGeom.py, 10);
        add('card to frame bottom', LH - (rulesGeom.py + rulesGeom.ph), 10);
        add('card to frame side', rulesGeom.px, 28);
        add('CTA to card bottom', 32, 32);
        add('rules body to CTA',
            (rulesGeom.py + rulesGeom.ph - 32 - UI.CTA.h) -
            (rulesGeom.viewTop + rulesGeom.viewH), 16);
      }
      rulesOpen = wasOpen; render();
      const bad = g.filter((r) => !r.ok);
      const tight = g.slice().sort((a, c) => (a.px - a.floor) - (c.px - c.floor))[0];
      return { frame: LW + 'x' + LH, mode: MODE, pass: bad.length === 0,
               tooTight: bad, tightest: tight, all: g };
    },

    frameStats() { return { fps: +fps.toFixed(1), samples: fpsN }; },
  };

  /* THE UNLIT STICK, under the cursor before you press. A cursor has to
     travel, and a flame that lit wherever the mouse happened to be would call
     the flies somewhere nobody had decided on yet - so this shows you where the
     tip will be, and draws nothing to it. */
  function drawAim() {
    const gx = hover.x, gy = hover.y;
    const tx = gx, ty = gy - TUNE.stick;
    ctx.strokeStyle = 'rgba(150,120,88,0.62)';
    ctx.lineWidth = Math.max(2.4, 3.8 * L.scale);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.quadraticCurveTo(tx + TUNE.stick * 0.10, (ty + gy) / 2, tx, ty);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,214,138,0.34)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(tx, ty, Math.max(3.5, 6 * L.scale), 0, TAU);
    ctx.stroke();
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
    if (rulesOpen) acc = 0;
    while (acc >= DT && steps < 14) {
      if (phase !== 'play') winT += DT;
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
