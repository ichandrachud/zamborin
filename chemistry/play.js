/* ============================================================
   Litmus · A Zamborin Game

   The owner's sketch, 2026-09-14. The dish is open space: free radicals
   drift in it slowly, turning as they go, and every free hand is charged.
   Bring two free hands within reach and they grab each other. The player
   drags atoms in from the Available panel, or moves anything already in the
   dish, and has to steer what they carry past everything it must not meet.

   model.js decides what a bond makes. This file moves the atoms, finds the
   hands that meet, and draws it all.

   Three rules keep it fair, all the owner's:
     nothing reacts on its own: charged radicals keep their distance from
       each other, and only what the player carries can grab;
     what the player moves in the dish grabs anything its hands pass near,
       all along the drag, not only where it is let go;
     an atom carried in from the panel grabs nothing, not even where it is
       let go: it lands free, and is moved again to bond (2026-09-15).
   ============================================================ */
(() => {
  'use strict';

  const M = window.ChemModel, LV = window.ChemLevels;
  const TAU = Math.PI * 2;
  const params = new URLSearchParams(location.search);
  /* ?chapter=2 is the reactions prototype (owner, 2026-09-14): whole molecules
     in the dish and a test tube, run by lab-scene.js through this file's
     canvas, marbles, HUD and cards. ?chapter=3 is the same bench with organic
     reactions. Chapter 1 is everything else here. */
  let CHAPTER = ['2', '3'].includes(params.get('chapter')) && window.ChemLabScene ? +params.get('chapter') : 1;

  /* ---------- MODE ----------
     A browser can report a 0-wide viewport on the first frame; zero means "not
     measured yet". A narrow frame lying on its side with a mouse is an embed,
     not a phone. ?mode=desktop / ?mode=mobile forces a layout.
     In an embed or a portal package the window's shape decides, not the
     pointer: CrazyGames plays its phones and tablets on their side (800x450
     and 1080x607), where the phone layout squeezed the dish into a strip and
     stood the test tube on the page's bottom edge (measured 2026-09-16). */
  const FORCED = /^(desktop|mobile)$/.test(params.get('mode') || '') ? params.get('mode') : null;
  const PORTRAITISH = window.innerHeight >= window.innerWidth;
  const EMBEDDED = document.documentElement.classList.contains('embed');
  const MODE = FORCED || (EMBEDDED && window.innerWidth > 0 ? (PORTRAITISH ? 'mobile' : 'desktop')
    : (matchMedia('(pointer: coarse)').matches ||
       (window.innerWidth > 0 && window.innerWidth < 768 && PORTRAITISH)) ? 'mobile' : 'desktop');
  document.body.classList.add('mode-' + MODE);

  /* ---------- CANVAS ---------- */
  let LW, LH, backing = 1;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const gameWrap = canvas.parentElement;

  /* THE FRAME FILLS ITS WINDOW WHEN THE GAME IS THE WHOLE PAGE: in an embed, a
     portal package and full screen, as Comb does (DESIGN-SYSTEM 2.2). Fitting
     760x600 into CrazyGames' 16:9 windows left 29% of each one empty. There
     the landscape layout takes the window's own shape, laid out at least 760
     across and 450 tall (scaled down to a smaller window) and at most 720 tall
     (scaled up to a bigger one, so a 1920x1080 screen shows the 1280x720
     layout at one and a half times, not 16px type and pills lost in a corner
     of a dish the size of a room). A zero reading falls back to the site frame
     until the real size arrives. */
  const FILL = { minW: 760, minH: 450, maxH: 720 };
  const fillsWindow = () => MODE === 'mobile' || EMBEDDED || document.body.classList.contains('focus-mode');
  /* In the site's own full screen its exit button floats, fixed, over the top
     band's right end, where the read-out now ends: the read-out keeps clear of
     it. An embed or a portal package never shows that button. */
  const FOCUS_BTN = 24 + 44 + 12;                  // its inset from the window, its width, and clear paper
  const chromeInset = () => (!EMBEDDED && window.innerWidth > 0 && document.body.classList.contains('focus-mode')
    ? Math.round(FOCUS_BTN * LW / window.innerWidth) : 0);
  function setCanvasVars() {
    if (MODE === 'mobile') { LW = window.innerWidth; LH = window.innerHeight; }
    else if (fillsWindow() && window.innerWidth > 0 && window.innerHeight > 0) {
      const vw = window.innerWidth, vh = window.innerHeight;
      const down = Math.max(FILL.minW / vw, FILL.minH / vh);
      const k = down > 1 ? down : 1 / Math.max(1, Math.min(vw / FILL.minW, vh / FILL.maxH));
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
    backing = Math.min(bW / LW, bH / LH);
    ctx.setTransform(backing, 0, 0, backing, 0, 0);
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
    fitFullscreen(); resizeCanvas(); layout(); render(clock());
  }

  /* ---------- AUDIO ----------
     A lab at night: quiet and precise. Nothing here may carry information the
     picture does not. */
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zam.chemistry.sfx', gain: 3 }) : null;
  const PITCH = { H: 1175, O: 988, N: 784, C: 587, F: 1047, Cl: 880, Na: 698, Mg: 659, Ca: 523, Al: 622, Fe: 440 };
  const SND = {
    on:     () => !!(sfx && sfx.isOn()),
    ready:  () => { if (sfx) sfx.ensureAudio(); },
    toggle: () => { if (sfx) { sfx.setOn(!sfx.isOn()); if (sfx.isOn()) sfx.play('click'); } },
    pick:   () => { if (sfx) sfx.play('tick'); },
    set:    () => { if (sfx) sfx.play('drop'); },
    clasp:  (el, n) => {
      if (!sfx) return;
      for (let i = 0; i < Math.min(3, n); i++) {
        setTimeout(() => { sfx.woodClack(PITCH[el] * 0.5, 0.06, 0.12); sfx.tone(PITCH[el], 0.09, 0.03, 'triangle'); }, i * 55);
      }
    },
    waste:  () => { if (sfx) sfx.play('thump'); },
    lift:   () => { if (sfx) sfx.play('success'); },
    lost:   () => { if (sfx) sfx.tone(196, 0.16, 0.05, 'sine'); },
    win:    () => { if (sfx) sfx.play('win'); },
    fail:   () => { if (sfx) sfx.play('fail'); },
  };

  const UI = window.ZAM_UI;
  const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){}, levelRestart(){}, hintUsed(){} };
  const T = () => (window.ZAM_TRACK || NOOP);
  T().init('chemistry');

  /* ---------- COLOUR ----------
     Chrome takes tokens only; canvas cannot read CSS variables, so they are
     restated here with their names. The atoms, hands, knots, palms and the
     dish are game art, and none of that palette touches chrome. */
  const TOK = {
    bg: '#0E1726', card: '#131F36', panel: '#1A2A45',          // --bg, --bg-card, --bg-panel
    accent: '#C24A39', sun: '#FFD23F', green: '#5DD39E',       // --accent, --accent-2, --green
    accentText: '#FF6B5C',                                      // --accent-text
    ink72: 'rgba(255,255,255,0.72)', ink82: 'rgba(255,255,255,0.82)',
    ink90: 'rgba(255,255,255,0.90)', ink92: 'rgba(255,255,255,0.92)', white: '#FFFFFF',
    tint03: 'rgba(255,255,255,0.03)', tint07: 'rgba(255,255,255,0.07)', tint10: 'rgba(255,255,255,0.10)',
    tint12: 'rgba(255,255,255,0.12)', tint30: 'rgba(255,255,255,0.30)',
    scrim: 'rgba(10,16,28,0.82)',
  };
  /* Each element: the lit and shaded ends of the marble, the colour of its
     arms, and the ink its symbol is written in. The symbol is what tells two
     similar marbles apart, so colour never has to.
     DEEPENED FOR THE PAPER PAGE, 2026-09-17: on the dark page every marble
     stood clear of its ground; on paper eight of them (H, F, Cl, Na, Ca, Fe,
     Zn, S) measured 1.9 to 2.8:1 against a 3:1 bar for a graphical object.
     Each was darkened in linear light until contrast.mjs measured it over 3:1,
     hue and shading kept, so hydrogen is still the palest marble on the bench. */
  const ART = {
    H:  { hi: '#B9BBBF', lo: '#737D8C', arm: '#A5ABB3', ink: '#1E2A3C' },
    O:  { hi: '#F47A66', lo: '#8A2A1E', arm: '#F5A896', ink: '#FFFFFF' },
    N:  { hi: '#7A9EF2', lo: '#22408F', arm: '#A9C0F6', ink: '#FFFFFF' },
    C:  { hi: '#838C9D', lo: '#343B48', arm: '#9FA8B8', ink: '#FFFFFF' },
    F:  { hi: '#A6CBCC', lo: '#31777C', arm: '#B1CCCC', ink: '#10363A' },
    Cl: { hi: '#ADCD7A', lo: '#42761E', arm: '#B7D095', ink: '#17330B' },
    Na: { hi: '#9E82C5', lo: '#44267B', arm: '#ADA0C6', ink: '#FFFFFF' },
    K:  { hi: '#F0A9D2', lo: '#82255F', arm: '#F5C9E6', ink: '#FFFFFF' },
    Mg: { hi: '#F2D27C', lo: '#8C6A1C', arm: '#F5DFA3', ink: '#3A2A06' },
    Ca: { hi: '#D6CAAE', lo: '#8E764E', arm: '#D8CFBB', ink: '#3A2C12' },
    Al: { hi: '#C3C8DD', lo: '#555C7A', arm: '#D2D6E6', ink: '#1E2233' },
    Fe: { hi: '#CF986D', lo: '#6C3D1F', arm: '#D7B294', ink: '#FFFFFF' },
    S:  { hi: '#BAA952', lo: '#765F0B', arm: '#BBB079', ink: '#3A2E00' },
    Br: { hi: '#E0785A', lo: '#6E2414', arm: '#EBA48C', ink: '#FFFFFF' },
    Zn: { hi: '#ABBDCD', lo: '#3B566B', arm: '#C2CFDA', ink: '#FFFFFF' },
    Cu: { hi: '#F0A878', lo: '#8A3B12', arm: '#F5C6A6', ink: '#FFFFFF' },
    knot: '#FFF6DC',
    palmGreen: '#17744A', palmAmber: '#8F5400', palmOpen: '#12486A',   // 5.3, 5.6 and 8.8:1 on the paper
    glassTop: '#0C1424', glassBot: '#0A1120',
    veil: 'rgba(14,23,38,0.55)', wasteKnot: '#7A8290', wasteArm: '#5A6272',
  };
  /* THE NOTEBOOK (owner, 2026-09-16, screen by screen): the game is played on a
     school notebook page — a very light paper, pale blue rules, everything else
     drawn in one blue ink. The tokens above are the dark page the game was
     built on; these replace them. The marbles keep their own palette. */
  TOK.ground = 'paper';
  Object.assign(TOK, {
    bg: '#E9EFEF', card: '#FFFFFF', panel: '#FDFEFE', accent: '#1C73A1', sun: '#8F5400', green: '#17744A', accentText: '#B83A2B',
    ink72: '#1D6690', ink82: '#175A80', ink90: '#12486A', ink92: '#12486A', white: '#0E3F5C',
    tint03: 'rgba(28,115,161,0.06)', tint07: 'rgba(28,115,161,0.10)', tint10: 'rgba(28,115,161,0.12)',
    tint12: 'rgba(28,115,161,0.20)', tint30: 'rgba(28,115,161,0.45)', scrim: 'rgba(233,239,239,0.86)',
  });
  Object.assign(ART, { glassTop: '#FFFFFF', glassBot: '#F7FAFA' });
  Object.assign(UI.PILL, { fill: 'rgba(28,115,161,0.05)', border: 'rgba(28,115,161,0.85)', text: '#12486A', textDim: 'rgba(18,72,106,0.45)' });
  const INK = { line: 'rgba(28,115,161,0.85)', wall: 'rgba(28,115,161,0.5)', tint: 'rgba(28,115,161,0.035)' };
  const PAPER_KNOT = '#12486A';           // the bond's bead: navy, 8.8:1 on the paper (owner's pick, 2026-09-16)

  /* ---------- TUNING ----------
     Distances are in atom radii, so the dish plays the same at any size. */
  const TUNE = {
    bond: 2.8,        // between two bonded centres
    hand: 1.8,        // a free hand's reach from its atom's centre (1.55 until the owner asked for longer hands, 2026-09-19)
    capture: 3.0,     // centres this close and two free hands grab
    warn: 5.0,        // centres this close and the hands start reaching
    /* Charged radicals drift no closer to each other than this. Tightened from
       6.2 with capture from 3.3 when the owner asked for a crowd: two radicals
       at this spacing still leave a carried atom a lane between them only if
       it threads the middle, which is the searching the owner wants. */
    keep: 5.4,
    collide: 2.3, spread: 1.62,
    /* Thermal motion: a hydrogen wanders at about this many radii a second,
       heavier atoms slower by mass^-0.3, and turns about this many radians a
       second. Slow on purpose: the owner wants motion you notice without it
       getting in the way of thinking. */
    drift: 0.42, spin: 0.5, driftTau: 3,
    touchLift: 2.3,   // radii a panel atom rides above a finger
    grabPx: 24,       // never a smaller hit radius than this
    /* How many radii wide the dish is: more radii, smaller atoms, more room.
       Was 28 and 19 before the crowd. */
    worldW: { desktop: 36, mobile: 23 }, maxScale: 22,
    /* A phone shorter than the one the crowds were written for (390x844, whose
       dish has this much room inside its walls, in radii squared) gets a
       thinner crowd, never under 40% of it. 475 until the walls moved in to
       keep hands 10px off the rim; the same phone measures 383 now. */
    crowdArea: 383,
    liftMs: 900, dimMs: 300, chipMs: 2000, flashMs: 380, cardWinMs: 1300, cardFailMs: 1500,
  };
  const STEP = 1 / 60;
  /* How near the edge of the dish an atom's centre may come, in radii: far
     enough that a hand pointing straight out, palm and all, ends at least
     10px inside the glass rim (owner, 2026-09-15: "make sure they stay
     inside at least 10 px"). The rim, the 10px and the palm are pixels, so
     it is worked out for the size the dish is drawn at. */
  const RIM = 7, CLEAR = 10;
  const wall = () => TUNE.hand + (RIM + CLEAR + Math.max(2.5, G.S * 0.26)) / G.S;
  const DRIFT = params.get('drift') !== '0';
  const CROWD = params.get('crowd') !== '0';        // ?crowd=0: needs and hazards only, for tests
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => REDUCED.matches || params.get('motion') === 'reduce';

  /* A clock a test can stop, so any moment can be drawn on purpose. While it
     is frozen the dish only moves when a test advances it. */
  let frozen = null;
  const clock = () => (frozen !== null ? frozen : performance.now());

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, k) {
    const A = hexRgb(a), B = hexRgb(b);
    return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',') + ')';
  }
  function rr(x, y, w, h, r) { UI.roundRectPath(ctx, x, y, w, h, r); }
  function mulberry(a) {
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rng = Math.random;
  function gauss() { const u = 1 - rng(), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }
  function lerpAng(a, b, k) { return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k; }

  /* ---------- LEVELS AND SAVE ----------
     Three chapters, each its own list per breakpoint: molecules, reactions,
     organic. Progress is kept per breakpoint and chapter, as the level sets
     differ: where the player is, and how many levels are done. Every chapter
     is open from the start; inside one, levels open in order. */
  /* Titles from the owner, 2026-09-15, who found the reactions the most fun
     and wanted all three open from the start; the third's is a nod to organic
     chemistry being the chemistry of carbon. `short` names the chapter in the
     top band. */
  const CHAPTERS = [
    /* The three parts of the game, named by the owner on the sections screen
       (2026-09-17): the same names on the map and in the read-out, so a player
       is never told two names for the same place. */
    { name: 'Moleculator', short: 'Moleculator', levels: () => LV[MODE] },                 // thinned to the room at load, see crowdSize
    { name: 'Reactor', short: 'Reactor', levels: () => LV.lab[MODE] },
    { name: 'Carbon Chamber', short: 'Carbon Chamber', levels: () => LV.organic[MODE] },
  ];
  let LEVELS = CHAPTERS[CHAPTER - 1].levels();
  let phase = 'play';                                        // 'play' | 'map'
  const UNLOCK_ALL = params.get('unlock') === 'all';         // for the owner, trying any level from the map
  const SAVE_KEY = 'zam.chemistry.progress';
  function readSave() {
    try { const v = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return v && typeof v === 'object' ? v : {}; }
    catch (_) { return {}; }
  }
  function progress(c) {
    const v = readSave()[MODE + '-' + c] || {};
    return { at: Number.isInteger(v.at) ? v.at : 0, done: Number.isInteger(v.done) ? v.done : 0 };
  }
  function writeSave(won) {
    try {
      const v = readSave(), was = progress(CHAPTER);
      v[MODE + '-' + CHAPTER] = { at: li, done: won ? Math.max(was.done, li + 1) : was.done };
      localStorage.setItem(SAVE_KEY, JSON.stringify(v));
    } catch (_) {}
  }
  /* Where a section opens: the level the player was on, or the one after it if
     they won that and left before moving on. A section never played opens at
     its first level. */
  function resumeIn(c) {
    const p = progress(c), n = CHAPTERS[c - 1].levels().length;
    const at = p.at === p.done - 1 ? p.done : p.at;
    return Math.max(0, Math.min(at, n - 1));
  }
  // A level's number across the whole game, for analytics: molecules 1-50, then reactions, then organic.
  const gameLevel = () => CHAPTERS.slice(0, CHAPTER - 1).reduce((n, ch) => n + ch.levels().length, 0) + li + 1;

  let li = 0, level = null, st = null, scene = null;
  const P = new Map();      // atom id -> { x, y, th, vx, vy, w }, in radii from the dish's top left
  let drag = null;          // { id, pid, touch, fromPanel, ox, oy, tx, ty, cx, cy }
  let press = null, pointer = null, card = null, cardBox = null;
  let lifts = [], wasteFx = [], flashes = [];
  const claspAt = new Map(), previews = new Map();
  let stepAcc = 0, lastFrame = 0, lastEvent = null, reactions = 0, placement = null;

  function loadLevel(i) {
    li = ((i % LEVELS.length) + LEVELS.length) % LEVELS.length;
    level = LEVELS[li];
    drag = null; press = null; card = null;
    lifts = []; wasteFx = []; flashes = [];
    claspAt.clear(); previews.clear(); P.clear();
    lastEvent = null; reactions = 0;
    const seed = parseInt(params.get('seed'), 10);
    rng = Number.isInteger(seed) ? mulberry(seed * 977 + li) : Math.random;
    if (scene) {
      scene.load(level);
      // an organic level opens on its clue: the rule, never the answer (owner, 2026-09-14)
      if (level.clue) card = { kind: 'clue', sounded: true, showAt: 0 };
      writeSave(false);
      T().levelStart && T().levelStart(gameLevel());
      return;
    }
    layout();
    level = LV.withCrowd(LEVELS[li], crowdSize(LEVELS[li]));
    st = M.createState(level);
    const pts = placeAtoms(level.seed);
    const turn = mulberry(level.seed * 31 + 7);
    st.atoms.forEach((a, k) => P.set(a.id, { x: pts[k].x, y: pts[k].y, th: turn() * TAU, vx: 0, vy: 0, w: 0 }));
    writeSave(false);
    T().levelStart && T().levelStart(gameLevel());
  }
  function setChapter(c) {
    CHAPTER = c;
    LEVELS = CHAPTERS[c - 1].levels();
    scene = c >= 2 ? bench : null;
    window.__chem.lab = scene ? scene.debug : null;
  }
  // From the map, or the last level of a chapter: start level i of chapter c.
  function openLevel(c, i) {
    if (drag) finishDrag();
    if (bench) bench.cancel();
    setChapter(c);
    phase = 'play';
    loadLevel(i);
    layout();
  }
  function openMap() {
    if (drag) finishDrag();
    if (bench) bench.cancel();
    phase = 'map'; card = null; press = null;
    layout();
    map.focus(CHAPTER, !CHAPTERS.some((ch, k) => progress(k + 1).done > 0));
    canvas.style.cursor = 'default';
  }
  function crowdSize(base) {
    if (!CROWD) return 0;
    if (MODE !== 'mobile') return base.crowd[0];
    const m = wall() + 0.6, room = Math.max(0, G.WW - 2 * m) * Math.max(0, G.WH - 2 * m);
    return Math.round(base.crowd[0] * Math.max(0.4, Math.min(1, room / TUNE.crowdArea)));
  }
  function restart() {
    T().levelRestart && T().levelRestart(gameLevel());
    loadLevel(li);
  }
  /* The level's radicals, spread out so no two start within reach of each
     other, and scattered again until every radical the list needs can be
     reached from the edge of the dish without passing within reach of any
     other. A crowd is the point; a crowd with its prize walled in is not.
     If no scatter in forty manages it, the one that walls in the fewest. */
  function placeAtoms(seed) {
    const need = st.atoms.filter((a) => st.analysis.palm[a.id] === 'green').map((a) => a.id);
    let best = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const pts = scatter(st.atoms.length, seed * 7919 + 13 + attempt * 101);
      const open = need.filter((id) => reachable(pts, id)).length;
      if (!best || open > best.open) best = { pts, open, attempt };
      if (open === need.length) break;
    }
    placement = { attempts: best.attempt + 1, reachable: best.open, needed: need.length, atoms: st.atoms.length };
    return best.pts;
  }
  function scatter(n, seed) {
    const r = mulberry(seed);
    const m = wall() + 0.6, pts = [];
    let minD = TUNE.keep * 1.08;
    for (let k = 0; k < n; k++) {
      let got = null;
      for (let tries = 0; !got && tries < 4000; tries++) {
        if (tries && tries % 500 === 0) minD = Math.max(TUNE.warn, minD * 0.95);
        const x = m + r() * Math.max(0.1, G.WW - 2 * m), y = m + r() * Math.max(0.1, G.WH - 2 * m);
        if (pts.every((q) => Math.hypot(q.x - x, q.y - y) >= minD)) got = { x, y };
      }
      pts.push(got || { x: m + r() * Math.max(0.1, G.WW - 2 * m), y: m + r() * Math.max(0.1, G.WH - 2 * m) });
    }
    return pts;
  }
  /* Can an atom carried in from outside the dish get within reach of radical
     t without coming within reach of any other? A walk over a fine grid: a
     point is open when every other radical is further than a grab away. */
  function reachable(pts, t) {
    const step = 0.4, m = wall();
    const nx = Math.max(2, Math.floor((G.WW - 2 * m) / step) + 1), ny = Math.max(2, Math.floor((G.WH - 2 * m) / step) + 1);
    const clear = TUNE.capture + 0.25, goal = TUNE.capture - 0.1;
    const open = new Uint8Array(nx * ny), near = new Uint8Array(nx * ny), seen = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = m + i * step, y = m + j * step;
        let ok = 1;
        for (let k = 0; k < pts.length && ok; k++) {
          const d = Math.hypot(pts[k].x - x, pts[k].y - y);
          if (k === t) { if (d < goal) near[j * nx + i] = 1; if (d < TUNE.collide) ok = 0; }
          else if (d < clear) ok = 0;
        }
        open[j * nx + i] = ok;
      }
    }
    const q = [];
    const push = (c) => { if (open[c] && !seen[c]) { seen[c] = 1; q.push(c); } };
    for (let i = 0; i < nx; i++) { push(i); push((ny - 1) * nx + i); }
    for (let j = 0; j < ny; j++) { push(j * nx); push(j * nx + nx - 1); }
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (near[c]) return true;
      const i = c % nx;
      if (i > 0) push(c - 1);
      if (i < nx - 1) push(c + 1);
      if (c >= nx) push(c - nx);
      if (c + nx < nx * ny) push(c + nx);
    }
    return false;
  }

  /* ---------- LAYOUT ----------
     Desktop 760x600, from the sketch: controls left and the read-out right in
     the top band, the targets under it, the dish on the left and the
     Available panel as a column on the right.
     Mobile, from the owner (2026-09-16): the controls and the read-out on one
     line in the top band, "so that the user doesn't accidentally tap
     restart", the targets under them, the dish, and what is available along
     the bottom with no box round it. On a phone every edge is the dish's own
     14px inset, so the controls, the target row and the dish line up. */
  const SIDE_PAD = 30;
  const EDGE = () => (MODE === 'mobile' ? 14 : SIDE_PAD);
  const topBand = () => (MODE === 'mobile' ? 64 : 56);
  /* The read-out rides at the right end of the top band now (owner,
     2026-09-20), so the bottom of the screen is plain air: the play area keeps
     the height the old read-out line used to take. */
  const botPad = () => 20;
  const G = { x: 0, y: 0, w: 0, h: 0, S: 18, WW: 28, WH: 23 };   // dish in px; S px per radius; world in radii
  let flaskArea = { x: 0, y: 0, w: 0, h: 0 }, panel = { x: 0, y: 0, w: 0, h: 0 };
  let slots = [], ctrl = [], readoutBox = null, ctaBox = null;

  function layout() {
    if (!LW) return;
    if (phase === 'home') { ctrl = []; layoutHome(); return; }
    layoutControls();
    if (phase === 'map' || !level) return;
    if (scene) { scene.layout(); return; }
    const oldW = G.WW, oldH = G.WH;
    if (MODE === 'mobile') layoutMobile(); else layoutDesktop();
    // A resize reshapes the world: carry every atom to the same place in it.
    if (P.size && (Math.abs(oldW - G.WW) > 1e-6 || Math.abs(oldH - G.WH) > 1e-6)) {
      for (const p of P.values()) { p.x *= G.WW / oldW; p.y *= G.WH / oldH; }
    }
    layoutSlots();
  }
  /* The desktop crowds were written for the 760x600 dish, 36 radii across and
     about 30 down. A window of another shape keeps that much room, in radii
     squared, so a crowd is as thick in a wide short dish as in the frame's.
     Only once its atoms are drawn at the largest size (TUNE.maxScale) does
     the room grow instead. */
  const FRAME_DISH = { w: 760 - SIDE_PAD * 2 - 150 - 18, h: 600 - 20 - (56 + 2 + 74 + 8) };   // 532 x 440
  function layoutDesktop() {
    const top = topBand();
    /* In the shortest windows a portal plays (760x450 and the like) the row of
       targets gives up eight pixels so the dish keeps its marbles at 12px. */
    const short = LH < 520, rowH = short ? 66 : 74, rowGap = short ? 6 : 8;
    flaskArea = { x: SIDE_PAD, y: top + 2, w: LW - SIDE_PAD * 2, h: rowH };
    const colW = 150, gap = 18;
    const y0 = flaskArea.y + flaskArea.h + rowGap, y1 = LH - botPad();
    G.x = SIDE_PAD; G.y = y0; G.w = LW - SIDE_PAD * 2 - colW - gap; G.h = y1 - y0;
    panel = { x: G.x + G.w + gap, y: G.y, w: colW, h: G.h };
    // the frame's own scale times the change in shape: exactly 532/36 in the 760x600 frame
    const shape = (G.h / G.w) / (FRAME_DISH.h / FRAME_DISH.w);
    G.S = Math.min(TUNE.maxScale, (G.w / TUNE.worldW.desktop) * Math.sqrt(shape));
    G.WW = G.w / G.S; G.WH = G.h / G.S;
  }
  function layoutMobile() {
    const top = topBand(), short = LH < 700;
    const flaskH = short ? 92 : 108, panelH = short ? 84 : 96, gap = short ? 8 : 12;
    flaskArea = { x: 14, y: top, w: LW - 28, h: flaskH };
    G.x = 14; G.w = LW - 28; G.y = top + flaskH + gap;
    panel = { x: 14, w: LW - 28, h: panelH, y: LH - botPad() - panelH };
    G.h = Math.max(120, panel.y - gap - G.y);
    G.S = Math.min(TUNE.maxScale, G.w / TUNE.worldW.mobile);
    G.WW = G.w / G.S; G.WH = G.h / G.S;
  }
  function layoutSlots() {
    const els = Object.keys(level.avail);
    slots = [];
    if (MODE === 'mobile') {
      const w = panel.w / Math.max(1, els.length);
      els.forEach((el, i) => slots.push({ el, x: panel.x + i * w, y: panel.y, w, h: panel.h }));
    } else {
      const top = panel.y + 30, h = 76;
      els.forEach((el, i) => slots.push({ el, x: panel.x, y: top + i * h, w: panel.w, h: h - 6 }));
    }
  }
  /* Order is fixed: sound, Undo, Restart, Hint, Rules. No Undo (bonds are for
     good), no Hint yet, no Rules card yet; nothing moves to fill their places.
     The map button comes first, as in Comb, and in the same place in both
     layouts: left in the top band. On the map itself it would lead nowhere, so
     only sound is left. */
  function layoutControls() {
    const onMap = phase === 'map', cyTop = topBand() / 2;
    /* A phone gets round icon buttons, a desktop pills (DESIGN-SYSTEM 4.1,
       4.2). They are packed against the left of the top band, the speaker with
       them, and the read-out takes the right end of the same band. From the
       map the left button goes back to the sections. */
    if (MODE === 'mobile') {
      const ids = onMap ? ['home', 'sound'] : ['map', 'restart', 'sound'], D = UI.PILL.iconW;
      let x = 16;
      ctrl = ids.map((id) => { const b = { id, icon: true, x, y: Math.round(cyTop - D / 2), w: D, h: D, cx: x + D / 2, cy: cyTop }; x += D + 10; return b; });
      return;
    }
    const items = onMap ? [{ id: 'home', icon: true }, { id: 'sound', icon: true }]
      : [{ id: 'map', icon: true }, { id: 'sound', icon: true }, { id: 'restart', label: 'Restart' }];
    ctx.save();
    let total = 0;
    items.forEach((it) => { it.w = it.icon ? UI.PILL.iconW : UI.pillWidth(ctx, it.label); total += it.w; });
    ctx.restore();
    total += UI.PILL.gap * (items.length - 1);
    const cy = topBand() / 2;
    let x = EDGE();
    ctrl = items.map((it) => {
      const b = { id: it.id, label: it.label, icon: it.icon, x, y: Math.round(cy - UI.PILL.h / 2),
                  w: it.w, h: UI.PILL.h, cx: x + it.w / 2, cy };
      x += it.w + UI.PILL.gap;
      return b;
    });
  }

  const toPx = (p) => ({ x: G.x + p.x * G.S, y: G.y + p.y * G.S });
  const toWorld = (p) => ({ x: (p.x - G.x) / G.S, y: (p.y - G.y) / G.S });
  const insideAt = (x, y) => x > 0.4 && y > 0.4 && x < G.WW - 0.4 && y < G.WH - 0.4;
  const inDish = (a) => !!a && (a.status === 'live' || a.status === 'waste') && P.has(a.id);

  /* ---------- THE DISH IN MOTION ----------
     Position-based: every atom wanders on its own slow random walk, then
     constraints put the world right. Bonds hold their length, a molecule
     spreads its arms, atoms do not overlap, charged radicals keep their
     distance, and the walls hold everything in. */
  function heldAtom() { return drag ? st.atoms[drag.id] : null; }
  function heldIsLoose() {       // a panel atom still over the panel, outside the dish
    const a = heldAtom();
    return !!a && !a.committed && !insideAt(drag.cx, drag.cy);
  }

  function simStep(dt) {
    const atoms = [];
    for (const a of st.atoms) {
      if (!inDish(a)) continue;
      if (drag && a.id === drag.id && heldIsLoose()) continue;
      atoms.push(a);
    }
    const mol = new Map();
    for (const a of atoms) {
      if (mol.has(a.id)) continue;
      const g = M.groupOf(st, a.id);
      g.forEach((i) => mol.set(i, g[0]));
    }
    const heldMol = drag ? (mol.has(drag.id) ? mol.get(drag.id) : -2) : -1;
    const moving = DRIFT && !reduced() && dt > 0;
    for (const a of atoms) {
      if (!moving) break;
      const p = P.get(a.id);
      const m = M.ELEMENTS[a.el].mass, calm = a.status === 'waste' ? 0.45 : 1;
      const vm = TUNE.drift * calm / Math.pow(m, 0.3), wm = TUNE.spin * calm / Math.pow(m, 0.3);
      const k = Math.sqrt(2 * dt / TUNE.driftTau);
      p.vx += -p.vx * dt / TUNE.driftTau + gauss() * vm * k;
      p.vy += -p.vy * dt / TUNE.driftTau + gauss() * vm * k;
      p.w += -p.w * dt / TUNE.driftTau + gauss() * wm * k;
      p.th += p.w * dt;
      if (mol.get(a.id) !== heldMol) { p.x += p.vx * dt; p.y += p.vy * dt; }
    }
    if (drag && P.has(drag.id)) { const p = P.get(drag.id); p.x = drag.cx; p.y = drag.cy; }
    for (let it = 0; it < 4; it++) relax(atoms, mol, heldMol);
  }

  function relax(atoms, mol, heldMol) {
    const held = drag ? drag.id : -1;
    const wOf = (a) => (a.id === held ? 0 : 1 / Math.sqrt(M.ELEMENTS[a.el].mass));
    const shove = (a, b, pa, pb, dx, dy, d, min, stiff) => {
      const wa = wOf(a), wb = wOf(b);
      if (wa + wb === 0) return;
      const c = (min - d) * stiff / (wa + wb), ux = dx / d, uy = dy / d;
      pa.x -= ux * c * wa; pa.y -= uy * c * wa;
      pb.x += ux * c * wb; pb.y += uy * c * wb;
    };
    for (const a of atoms) {
      for (const b of a.bonds) {
        if (b.to < a.id || !P.has(b.to)) continue;
        const B = st.atoms[b.to], pa = P.get(a.id), pb = P.get(B.id);
        const dx = pb.x - pa.x, dy = pb.y - pa.y, d = Math.hypot(dx, dy) || 1e-6;
        const wa = wOf(a), wb = wOf(B);
        if (wa + wb === 0) continue;
        const c = (d - TUNE.bond) * 0.6 / (wa + wb);
        pa.x += dx / d * c * wa; pa.y += dy / d * c * wa;
        pb.x -= dx / d * c * wb; pb.y -= dy / d * c * wb;
      }
    }
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i], pa = P.get(a.id);
      for (let j = i + 1; j < atoms.length; j++) {
        const b = atoms[j];
        if (a.bonds.some((q) => q.to === b.id)) continue;
        const pb = P.get(b.id);
        let dx = pb.x - pa.x, dy = pb.y - pa.y, d = Math.hypot(dx, dy);
        if (d < 1e-4) { dx = 0.01; dy = 0.005; d = Math.hypot(dx, dy); }
        const same = mol.get(a.id) === mol.get(b.id);
        if (same) {
          const min = TUNE.bond * TUNE.spread;
          if (d < min) shove(a, b, pa, pb, dx, dy, d, min, 0.2);
          continue;
        }
        if (d < TUNE.collide) shove(a, b, pa, pb, dx, dy, d, TUNE.collide, 0.5);
        if (d < TUNE.keep && a.status === 'live' && b.status === 'live' && a.free > 0 && b.free > 0 &&
            mol.get(a.id) !== heldMol && mol.get(b.id) !== heldMol) {
          shove(a, b, pa, pb, dx, dy, d, TUNE.keep, 0.025);
        }
      }
    }
    const m = wall();
    for (const a of atoms) {
      const p = P.get(a.id);
      if (p.x < m) p.x = m; else if (p.x > G.WW - m) p.x = G.WW - m;
      if (p.y < m) p.y = m; else if (p.y > G.WH - m) p.y = G.WH - m;
    }
  }

  /* Move the held atom toward where the pointer wants it in steps of under
     half a radius, and look for grabs at every step, so a fast drag cannot
     jump past a radical it went straight through. */
  function stepWorld(dt) {
    if (!drag) { simStep(dt); return; }
    const p = P.get(drag.id);
    const sx = p.x, sy = p.y, tx = drag.tx, ty = drag.ty;
    const n = Math.max(1, Math.ceil(Math.hypot(tx - sx, ty - sy) / 0.45));
    for (let i = 1; i <= n; i++) {
      drag.cx = sx + (tx - sx) * i / n;
      drag.cy = sy + (ty - sy) * i / n;
      simStep(i === n ? dt : 0);
      react();
      if (!drag) return;
    }
  }

  /* ---------- HANDS THAT MEET ---------- */
  function findCapture() {
    if (!drag || drag.fromPanel || heldIsLoose()) return null;
    const heldIds = M.groupOf(st, drag.id), held = new Set(heldIds);
    let best = null;
    for (const ai of heldIds) {
      const a = st.atoms[ai];
      if (a.status !== 'live' || a.free === 0 || !P.has(ai)) continue;
      const pa = P.get(ai);
      for (const b of st.atoms) {
        if (b.status !== 'live' || b.free === 0 || held.has(b.id) || !P.has(b.id)) continue;
        const pb = P.get(b.id), d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        if (d < TUNE.capture && (!best || d < best.d)) best = { a: ai, b: b.id, d };
      }
    }
    return best;
  }
  function react() {
    for (let guard = 0; guard < 8 && drag; guard++) {
      const c = findCapture();
      if (!c) return;
      bondAtoms(c.a, c.b);
    }
  }
  function bondAtoms(a, b) {
    const pa = P.get(a), pb = P.get(b);
    if (!pa || !pb) return null;
    const now = clock();
    const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    const ev = M.bond(st, a, b);
    if (!ev) return null;
    reactions++;
    lastEvent = ev;
    previews.clear();
    flashes.push({ x: mid.x, y: mid.y, t0: now });
    claspAt.set(Math.min(a, b) + '-' + Math.max(a, b), now);
    SND.clasp(st.atoms[b].el, ev.order);
    if (ev.done && ev.done.kind === 'required') {
      if (drag && ev.done.ids.includes(drag.id)) drag = null;
      startLift(ev.done.key, ev.done.ids, now);
      setTimeout(SND.lift, 120);
    } else if (ev.done) {
      wasteFx.push({ ids: ev.done.ids, t0: now, lost: ev.lost });
      setTimeout(SND.waste, 60);
    } else if (ev.lost) {
      wasteFx.push({ ids: M.groupOf(st, a), t0: now, lost: true, chipOnly: true });
    }
    if (ev.lost) setTimeout(SND.lost, 90);
    if (st.result) endLevel(now);
    return ev;
  }
  function endLevel(now) {
    if (drag) finishDrag();
    const r = st.result;
    card = { kind: r.kind, made: r.made, total: r.total, sounded: false,
             showAt: now + (r.kind === 'win' ? TUNE.cardWinMs : TUNE.cardFailMs) };
    if (r.kind === 'win') { writeSave(true); T().levelComplete && T().levelComplete(gameLevel(), reactions); }
  }
  function previewOf(a, b) {
    const key = a + ':' + b + ':' + st.version;
    if (!previews.has(key)) {
      if (previews.size > 300) previews.clear();
      previews.set(key, M.preview(st, a, b));
    }
    return previews.get(key);
  }
  // Every pair of free hands, one carried and one in the dish, close enough to reach.
  function threatPairs() {
    if (!drag || drag.fromPanel || card || heldIsLoose()) return [];
    const heldIds = M.groupOf(st, drag.id), held = new Set(heldIds), out = [];
    for (const ai of heldIds) {
      const a = st.atoms[ai];
      if (a.status !== 'live' || !a.free || !P.has(ai)) continue;
      const pa = P.get(ai);
      for (const b of st.atoms) {
        if (b.status !== 'live' || !b.free || held.has(b.id) || !P.has(b.id)) continue;
        const pb = P.get(b.id), d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        if (d >= TUNE.warn) continue;
        const pv = previewOf(ai, b.id);
        out.push({ a: ai, b: b.id, d, k: clamp01((TUNE.warn - d) / (TUNE.warn - TUNE.capture)),
                   bad: !pv || pv.lost, pv });
      }
    }
    return out.sort((x, y) => x.d - y.d);
  }

  /* ---------- DRAG ---------- */
  function atomAt(p) {
    let best = null;
    const r = Math.max(TUNE.grabPx, G.S * 1.5);
    for (const a of st.atoms) {
      if (!inDish(a)) continue;
      const c = toPx(P.get(a.id)), d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d <= r && (!best || d < best.d)) best = { id: a.id, d };
    }
    return best ? best.id : null;
  }
  function startDrag(id, p, touch, pid, fromPanel) {
    const w = toWorld(p), q = P.get(id);
    drag = { id, pid, touch, fromPanel,
             ox: fromPanel ? 0 : q.x - w.x, oy: fromPanel ? (touch ? -TUNE.touchLift : 0) : q.y - w.y,
             tx: q.x, ty: q.y, cx: q.x, cy: q.y };
    if (pid != null && pid >= 0) { try { canvas.setPointerCapture(pid); } catch (_) { /* not every browser lets a canvas capture */ } }
    setTargetWorld(w.x + drag.ox, w.y + drag.oy);
  }
  function setTargetWorld(x, y) {
    const a = heldAtom();
    if (!a) return;
    if (a.committed || insideAt(x, y)) {
      const m = wall();
      x = Math.max(m, Math.min(G.WW - m, x));
      y = Math.max(m, Math.min(G.WH - m, y));
    }
    drag.tx = x; drag.ty = y;
  }
  function setTarget(p) { const w = toWorld(p); setTargetWorld(w.x + drag.ox, w.y + drag.oy); }
  /* Let go. A panel atom goes back to the panel if it is let go outside the
     dish, and lands free in the dish if inside, wherever that is: it grabs
     nothing on the way in (owner, 2026-09-15), and is moved again to bond. */
  function finishDrag() {
    if (!drag) return;
    const a = heldAtom();
    if (a && a.status === 'live' && !a.committed) {
      if (!insideAt(drag.cx, drag.cy)) { M.putBack(st, a.id); P.delete(a.id); }
      else { M.commit(st, a.id); SND.set(); }
    }
    drag = null;
    previews.clear();
  }

  /* ---------- DRAWING ----------
     THE PAGE: plain paper with a very light grain, fine speckle, soft mottling
     and a few fibres, made once at device pixels and laid over the paper with
     multiply. It was ruled like a school notebook until the owner took the
     rules off (2026-09-19); nothing is anchored to a line any more. */
  const NOTE = { paper: '#FBFBF9', band: '#1C73A1' };
  let notebookPage = null;
  function paperGrain(W, H) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data, r = mulberry(4021);
    const noise = (cell) => {
      const gw = Math.ceil(W / cell) + 2, grid = new Float32Array(gw * (Math.ceil(H / cell) + 2));
      for (let i = 0; i < grid.length; i++) grid[i] = r();
      return (x, y) => {
        const gx = x / cell, gy = y / cell, x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0;
        const a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1], c2 = grid[(y0 + 1) * gw + x0], e = grid[(y0 + 1) * gw + x0 + 1];
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        return (a * (1 - sx) + b * sx) * (1 - sy) + (c2 * (1 - sx) + e * sx) * sy;
      };
    };
    const broad = noise(90), fine = noise(14);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const speck = Math.pow(r(), 12) * 12, mottle = broad(x, y) * 2.2 + fine(x, y) * 1.4, v = 255 - speck - mottle;
      const k = (y * W + x) * 4; d[k] = v; d[k + 1] = v; d[k + 2] = v - 1.5; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.lineCap = 'round';
    for (let i = 0; i < Math.round(W * H / 14000); i++) {
      const x = r() * W, y = r() * H, len = 14 + r() * 50, ang = r() * Math.PI * 2, bend = (r() - 0.5) * 18;
      g.strokeStyle = 'rgba(110,100,86,' + (0.025 + r() * 0.03).toFixed(3) + ')'; g.lineWidth = 0.6 + r() * 0.5;
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(ang) * len / 2 - Math.sin(ang) * bend, y + Math.sin(ang) * len / 2 + Math.cos(ang) * bend, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    }
    return c;
  }
  function buildPage() {
    const W = Math.round(LW * backing), H = Math.round(LH * backing), key = W + 'x' + H;
    if (notebookPage && notebookPage.key === key) return notebookPage;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = NOTE.paper; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'multiply'; g.drawImage(paperGrain(W, H), 0, 0);
    notebookPage = { key, c };
    return notebookPage;
  }
  // the page itself as a fill, so the map can paint it back over its cells at the scroll's edges
  function washStyle() {
    const page = buildPage();
    const pat = ctx.createPattern(page.c, 'no-repeat');
    if (pat && pat.setTransform && window.DOMMatrix) pat.setTransform(new DOMMatrix([1 / backing, 0, 0, 1 / backing, 0, 0]));
    return pat || NOTE.paper;
  }
  function drawWash() {
    const page = buildPage();
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(page.c, 0, 0); ctx.restore();
    if (phase !== 'home') { ctx.fillStyle = NOTE.band; ctx.fillRect(0, 0, LW, topBand()); }
  }
  // The dish: dark glass in a vessel whose rim catches the light along its top.
  function drawDish() {
    const r = 24;
    ctx.save();
    ctx.fillStyle = INK.tint; rr(G.x, G.y, G.w, G.h, r); ctx.fill();
    ctx.strokeStyle = INK.line; ctx.lineWidth = 1.2; rr(G.x + 0.5, G.y + 0.5, G.w - 1, G.h - 1, r); ctx.stroke();
    ctx.strokeStyle = INK.wall; ctx.lineWidth = 1; rr(G.x + 5.5, G.y + 5.5, G.w - 11, G.h - 11, r - 5); ctx.stroke();
    ctx.restore();
  }

  /* The marble, lit from the upper left, a broad specular and a darker base on
     a soft shadow. No outline: the edge is value. Rendered once per element
     and size into a sprite. */
  const sprites = new Map();
  function bodySprite(el, R) {
    const s = Math.max(1, Math.min(4, backing));
    const key = el + ':' + R.toFixed(2) + ':' + s.toFixed(2);
    let spr = sprites.get(key);
    if (spr) return spr;
    const pad = Math.ceil(R * 0.95), half = R + pad;
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(half * 2 * s);
    const g = c.getContext('2d');
    g.scale(s, s);
    const a = ART[el];
    const shx = half + R * 0.12, shy = half + R * 0.62;
    const sh = g.createRadialGradient(shx, shy, 0, shx, shy, R * 1.15);
    sh.addColorStop(0, 'rgba(0,0,0,0.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.beginPath(); g.ellipse(shx, shy, R * 1.15, R * 0.6, 0, 0, TAU); g.fill();
    const body = g.createRadialGradient(half - R * 0.38, half - R * 0.42, R * 0.06, half - R * 0.1, half - R * 0.1, R * 1.18);
    body.addColorStop(0, a.hi); body.addColorStop(1, a.lo);
    g.fillStyle = body; g.beginPath(); g.arc(half, half, R, 0, TAU); g.fill();
    const spx = half - R * 0.36, spy = half - R * 0.44;
    const sp = g.createRadialGradient(spx, spy, 0, spx, spy, R * 0.44);
    sp.addColorStop(0, 'rgba(255,255,255,0.55)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sp; g.beginPath(); g.arc(spx, spy, R * 0.44, 0, TAU); g.fill();
    spr = { c, half };
    if (sprites.size > 200) sprites.clear();
    sprites.set(key, spr);
    return spr;
  }
  /* A glow is a thin bright core with a tight feather, never a flat disc. */
  function feather(x, y, r0, r1, rgb, a) {
    if (a <= 0) return;
    const g = ctx.createRadialGradient(x, y, r0 * 0.6, x, y, r1);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.globalAlpha = 1; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r1, 0, TAU); ctx.fill();
  }
  /* THE PALM. At rest every free hand ends in the same palm, so nothing but
     the symbol says which radical is the one you need (the owner's call,
     2026-09-14: the search is the game). On the paper page it is the navy of
     the knot two hands make when they clasp, because white could not be seen
     there (owner, 2026-09-19). Only when a carried atom comes within reach
     does a palm turn green and grow, if that grab would help, or amber with a
     bar across it, if it would lose a molecule. Size and the bar are the
     channels that do not depend on seeing colour. */
  function drawPalm(x, y, r, state, k, al) {
    if (state === 'open') {
      ctx.globalAlpha = al; ctx.fillStyle = ART.palmOpen;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      return;
    }
    const amber = state === 'amber' ? (k == null ? 1 : k) : 0;
    r *= 1 + 0.3 * (1 - amber);                      // a helpful grab stands out by size as well as colour
    if (amber < 1) feather(x, y, r, r * 2.4, '23,116,74', 0.40 * al * (1 - amber));
    ctx.globalAlpha = al;
    ctx.fillStyle = amber ? mix(ART.palmGreen, ART.palmAmber, amber) : ART.palmGreen;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (amber > 0) {
      ctx.globalAlpha = al * amber;
      ctx.strokeStyle = ART.glassBot; ctx.lineWidth = Math.max(1.4, r * 0.48); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - r * 0.6, y + r * 0.6); ctx.lineTo(x + r * 0.6, y - r * 0.6); ctx.stroke();
    }
  }
  const offsets = (order, off) => (order === 1 ? [0] : order === 2 ? [-off, off] : [-off * 1.25, 0, off * 1.25]);

  /* Draw a set of atoms of radius R px: arms, then bodies and symbols, then the
     veil on waste, then knots, then palms, so a knot is never under a body and
     a palm never under an arm. Each item: { x, y, el, alpha, label,
     bonds: [{ ang, half, order, key, knot }], free: [{ ang, len, glow }],
     palm, wasteK }. */
  function drawAtoms(items, R) {
    const armW = Math.max(2, R * 0.24), palmR = Math.max(2.5, R * 0.26), knotR = Math.max(1.8, R * 0.2), off = R * 0.34;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = armW;
    for (const a of items) {
      const al = a.alpha == null ? 1 : a.alpha;
      ctx.globalAlpha = al;
      const arm = mix(ART[a.el].lo, '#0E1A26', 0.2);
      ctx.strokeStyle = a.wasteK ? mix(ART[a.el].arm, ART.wasteArm, a.wasteK) : arm;
      for (const b of a.bonds) {
        const ux = Math.cos(b.ang), uy = Math.sin(b.ang), nx = -uy, ny = ux;
        for (const o of offsets(b.order, off)) {
          ctx.beginPath();
          ctx.moveTo(a.x + ux * R * 0.6 + nx * o, a.y + uy * R * 0.6 + ny * o);
          ctx.lineTo(a.x + ux * b.half + nx * o, a.y + uy * b.half + ny * o);
          ctx.stroke();
        }
      }
      for (const h of a.free || []) {
        ctx.beginPath();
        ctx.moveTo(a.x + Math.cos(h.ang) * R * 0.6, a.y + Math.sin(h.ang) * R * 0.6);
        ctx.lineTo(a.x + Math.cos(h.ang) * h.len, a.y + Math.sin(h.ang) * h.len);
        ctx.stroke();
      }
    }
    for (const a of items) {
      const al = a.alpha == null ? 1 : a.alpha;
      const spr = bodySprite(a.el, R);
      ctx.globalAlpha = al;
      ctx.drawImage(spr.c, a.x - spr.half, a.y - spr.half, spr.half * 2, spr.half * 2);
      if (a.label !== false && R >= 9) {
        ctx.fillStyle = ART[a.el].ink;
        ctx.font = '800 ' + Math.round(R * (a.el.length > 1 ? 0.8 : 0.95)) + 'px Inter, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(a.el, a.x, a.y + R * 0.05);
      }
      if (a.wasteK) {
        ctx.globalAlpha = al * a.wasteK;
        ctx.fillStyle = ART.veil;
        ctx.beginPath(); ctx.arc(a.x, a.y, R + 0.5, 0, TAU); ctx.fill();
      }
    }
    const drawn = new Set();
    for (const a of items) {
      const al = a.alpha == null ? 1 : a.alpha;
      for (const b of a.bonds) {
        if (drawn.has(b.key)) continue;
        drawn.add(b.key);
        const ux = Math.cos(b.ang), uy = Math.sin(b.ang), nx = -uy, ny = ux;
        const mx = a.x + ux * b.half, my = a.y + uy * b.half, kr = knotR * (b.knot || 1);
        for (const o of offsets(b.order, off)) {
          const kx = mx + nx * o, ky = my + ny * o;
          if (a.wasteK) {
            ctx.globalAlpha = al; ctx.fillStyle = mix(ART.knot, ART.wasteKnot, a.wasteK);
            ctx.beginPath(); ctx.arc(kx, ky, kr, 0, TAU); ctx.fill();
            continue;
          }
          ctx.globalAlpha = al; ctx.fillStyle = PAPER_KNOT;
          ctx.beginPath(); ctx.arc(kx, ky, kr, 0, TAU); ctx.fill();
        }
      }
    }
    for (const a of items) {
      if (!a.free || !a.free.length || !a.palm) continue;
      const al = a.alpha == null ? 1 : a.alpha;
      for (const h of a.free) {
        const x = a.x + Math.cos(h.ang) * h.len, y = a.y + Math.sin(h.ang) * h.len;
        if (h.glow) feather(x, y, palmR, palmR * 3.4, h.glow.rgb, h.glow.a * al);
        drawPalm(x, y, palmR, h.glow ? (h.glow.bad ? 'amber' : 'green') : a.palm, 1, al);
      }
    }
    ctx.restore();
  }

  // Free hands spread into the widest gaps between what an atom already holds.
  function freeAnglesAround(angs, f) {
    if (f <= 0) return [];
    const sorted = angs.map((x) => ((x % TAU) + TAU) % TAU).sort((a, b) => a - b);
    if (sorted.length === 1) return Array.from({ length: f }, (_, i) => sorted[0] + TAU * (i + 1) / (f + 1));
    const gaps = sorted.map((s, i) => ({ start: s, size: (i + 1 < sorted.length ? sorted[i + 1] : sorted[0] + TAU) - s, n: 0 }));
    for (let k = 0; k < f; k++) {
      let best = gaps[0];
      for (const g of gaps) if (g.size / (g.n + 1) > best.size / (best.n + 1)) best = g;
      best.n++;
    }
    const out = [];
    for (const g of gaps) for (let j = 1; j <= g.n; j++) out.push(g.start + g.size * j / (g.n + 1));
    return out;
  }
  const evenAngles = (th, f) => Array.from({ length: f }, (_, i) => th + TAU * i / f);

  function wasteK(id, now) {
    const w = wasteFx.find((f) => !f.chipOnly && f.ids.includes(id));
    if (!w || reduced()) return 1;
    return clamp01((now - w.t0) / TUNE.dimMs);
  }

  function atomItems(now, threats) {
    const items = [];
    for (const a of st.atoms) {
      if (!inDish(a)) continue;
      const p = P.get(a.id), c = toPx(p);
      const item = { id: a.id, el: a.el, x: c.x, y: c.y, bonds: [], free: [] };
      const nb = [];
      for (const b of a.bonds) {
        const q = P.get(b.to);
        if (!q) continue;
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        nb.push(ang);
        const key = Math.min(a.id, b.to) + '-' + Math.max(a.id, b.to), t0 = claspAt.get(key);
        item.bonds.push({ ang, half: Math.hypot(q.x - p.x, q.y - p.y) * G.S / 2, order: b.order, key,
                          knot: t0 == null || reduced() ? 1 : 1 + 0.9 * clamp01(1 - (now - t0) / 260) });
      }
      if (a.free > 0) {
        const angs = nb.length ? freeAnglesAround(nb, a.free) : evenAngles(p.th, a.free);
        item.free = angs.map((ang) => ({ ang, len: G.S * TUNE.hand }));
        /* A charged hand with a partner in reach swings round to it and
           stretches, more the closer it gets. Amber if that grab would lose a
           molecule, green if not. */
        const used = new Set();
        for (const t of threats) {
          if (t.a !== a.id && t.b !== a.id) continue;
          if (used.size >= item.free.length) break;
          const o = P.get(t.a === a.id ? t.b : t.a);
          const want = Math.atan2(o.y - p.y, o.x - p.x);
          let pick = -1, bd = 9;
          item.free.forEach((h, i) => {
            if (used.has(i)) return;
            const dd = Math.abs(Math.atan2(Math.sin(h.ang - want), Math.cos(h.ang - want)));
            if (dd < bd) { bd = dd; pick = i; }
          });
          if (pick < 0) continue;
          used.add(pick);
          const h = item.free[pick];
          h.ang = lerpAng(h.ang, want, clamp01(t.k * 3));
          const reach = (t.d / 2) * 0.97;
          const quiver = reduced() ? 1 : 1 + 0.05 * Math.sin(now / 70 + a.id * 1.3) * t.k;
          h.len = G.S * (TUNE.hand + (reach - TUNE.hand) * t.k) * quiver;
          h.glow = { rgb: t.bad ? '143,84,0' : '23,116,74', a: 0.18 + 0.42 * t.k, bad: t.bad };
        }
      }
      if (a.status === 'waste') item.wasteK = wasteK(a.id, now);
      else if (a.free > 0) item.palm = 'open';
      items.push(item);
    }
    return items;
  }

  /* A chip at the point of action: HUD, so exempt from the 16px copy rule,
     but 15px and never below 11. Kept inside the dish. */
  function drawChip(text, cx, cy, tone, al) {
    ctx.save();
    ctx.globalAlpha = al == null ? 1 : al;
    ctx.font = '700 15px Inter, sans-serif';
    const w = Math.round(ctx.measureText(text).width + 28), h = 30;
    const x = Math.round(Math.max(G.x + 6, Math.min(G.x + G.w - 6 - w, cx - w / 2)));
    const y = Math.round(Math.max(G.y + 6, Math.min(G.y + G.h - 6 - h, cy - h / 2)));
    ctx.fillStyle = TOK.card; rr(x, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = tone === 'green' ? TOK.green : tone === 'amber' ? TOK.sun : TOK.ink82;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
    ctx.restore();
  }
  function groupPx(ids) {
    const pts = ids.map((i) => P.get(i)).filter(Boolean).map(toPx);
    if (!pts.length) return null;
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    return { cx: (Math.min(...xs) + Math.max(...xs)) / 2, top: Math.min(...ys), bottom: Math.max(...ys) };
  }
  function drawWasteChips(now) {
    wasteFx = wasteFx.filter((w) => now - w.t0 < TUNE.chipMs + 50);
    for (const w of wasteFx) {
      const t = now - w.t0, box = groupPx(w.ids);
      if (!box || t > TUNE.chipMs) continue;
      const al = t < 150 ? t / 150 : t > TUNE.chipMs - 250 ? (TUNE.chipMs - t) / 250 : 1;
      const below = box.bottom + G.S * 2.4;
      const y = below + 15 > G.y + G.h - 6 ? box.top - G.S * 2.4 : below;
      drawChip(w.lost ? 'lost a molecule' : 'wasted', box.cx, y, w.lost ? 'amber' : 'grey', al);
    }
  }
  // Said once, at the closest reach, when it is nearly a grab.
  function drawThreatChip(threats) {
    const t = threats[0];
    if (!t || t.k < 0.72) return;
    const q = P.get(t.b);
    if (!q) return;
    const c = toPx(q);
    let text = null, tone = 'grey';
    if (t.bad) { text = 'loses a molecule'; tone = 'amber'; }
    else if (t.pv && t.pv.done && t.pv.done.kind === 'required') { text = 'makes ' + M.MOLECULES[t.pv.done.key].formula; tone = 'green'; }
    if (!text) return;
    const above = c.y - G.S * 2.6;
    drawChip(text, c.x, above - 15 < G.y + 6 ? c.y + G.S * 2.6 : above, tone, 1);
  }
  function drawFlashes(now) {
    flashes = flashes.filter((f) => now - f.t0 < TUNE.flashMs);
    ctx.save();
    for (const f of flashes) {
      const t = clamp01((now - f.t0) / TUNE.flashMs), c = toPx(f);
      feather(c.x, c.y, G.S * 0.3, G.S * (0.8 + 1.6 * easeOut(t)), '18,72,106', 0.34 * (1 - t));
    }
    ctx.restore();
  }

  /* ---------- THE LIFT ----------
     A finished target rises a little with its name, then flies to its place in
     the target row. */
  function startLift(key, ids, now) {
    const atoms = ids.filter((i) => P.has(i)).map((i) => {
      const c = toPx(P.get(i));
      return { id: i, el: st.atoms[i].el, x: c.x, y: c.y, bonds: st.atoms[i].bonds.map((b) => ({ to: b.to, order: b.order })) };
    });
    ids.forEach((i) => P.delete(i));
    if (!atoms.length) return;
    const xs = atoms.map((a) => a.x), ys = atoms.map((a) => a.y);
    lifts.push({ key, atoms, t0: now, cx: (Math.min(...xs) + Math.max(...xs)) / 2,
                 cy: (Math.min(...ys) + Math.max(...ys)) / 2, top: Math.min(...ys) });
  }
  const inFlight = (key, now) => lifts.filter((L) => L.key === key && now - L.t0 < TUNE.liftMs).length;
  function drawLifts(now) {
    lifts = lifts.filter((L) => now - L.t0 < TUNE.liftMs);
    for (const L of lifts) {
      const t = (now - L.t0) / TUNE.liftMs;
      const dest = flaskSlot(L.key);
      const endR = dest.span * 0.3;
      let cx = L.cx, cy = L.cy, sc = 1, al = 1;
      const rise = G.S * 2.4;
      if (reduced()) al = 1 - t;
      else if (t < 0.4) cy = L.cy - rise * easeOut(t / 0.4);
      else {
        const u = easeInOut((t - 0.4) / 0.6);
        cx = L.cx + (dest.x - L.cx) * u;
        cy = (L.cy - rise) + (dest.y - (L.cy - rise)) * u;
        sc = 1 + (endR / G.S - 1) * u;
        al = 1 - 0.7 * u;
      }
      const byId = new Map(L.atoms.map((a) => [a.id, a]));
      const items = L.atoms.map((a) => ({
        el: a.el, x: cx + (a.x - L.cx) * sc, y: cy + (a.y - L.cy) * sc, alpha: al, free: [],
        bonds: a.bonds.filter((b) => byId.has(b.to)).map((b) => {
          const o = byId.get(b.to);
          return { ang: Math.atan2(o.y - a.y, o.x - a.x), half: Math.hypot(o.x - a.x, o.y - a.y) * sc / 2,
                   order: b.order, key: Math.min(a.id, b.to) + '-' + Math.max(a.id, b.to) };
        }),
      }));
      ctx.save();
      for (const it of items) feather(it.x, it.y, G.S * sc, G.S * sc * 1.9, '18,72,106', 0.16 * al);
      ctx.restore();
      drawAtoms(items, G.S * sc);
      if (t < 0.5 && !reduced()) {
        const m = M.MOLECULES[L.key];
        drawChip(cap(m.name), cx, cy - (L.cy - L.top) - G.S * 2.4, 'green', t > 0.4 ? (0.5 - t) * 10 : 1);
      }
    }
  }

  /* ---------- THE TARGET ROW ----------
     The list, read once: each molecule drawn in its own atoms, its name and
     formula, and how many are made. */
  function flaskSlots() {
    const n = st.targets.length, out = [];
    ctx.save();
    ctx.font = '700 15px Inter, sans-serif';
    const nameOf = (t, long) => {
      const m = M.MOLECULES[t.key];
      return long ? cap(m.name) + ' (' + m.formula + ')' : m.formula;
    };
    if (MODE === 'mobile') {
      // One size for the whole row: the biggest at which every molecule on the list fits its column.
      const colW = flaskArea.w / n, labelY = flaskArea.y + flaskArea.h - 12;
      const iconTop = flaskArea.y + 24, iconH = labelY - 16 - iconTop;
      let span = 40;
      for (const t of st.targets) {
        const lay = M.layoutMolecule(t.key);
        span = Math.min(span, (colW - 14) / (lay.w - 1 + 0.6), iconH / (lay.h - 1 + 0.6));
      }
      span = Math.max(12, Math.floor(span));
      st.targets.forEach((t, i) => {
        const cx = flaskArea.x + colW * (i + 0.5);
        out.push({ key: t.key, n: t.n, x: cx, y: iconTop + iconH / 2, span, labelX: cx, labelY, align: 'center', maxW: colW - 8, name: nameOf(t, false) });
      });
    } else {
      const span = 19, gapItems = 30, labelGap = 12;
      const measure = (long) => {
        let total = 0;
        const parts = st.targets.map((t) => {
          const lay = M.layoutMolecule(t.key), iw = (lay.w - 1) * span + span * 0.8;
          const name = nameOf(t, long), lw = ctx.measureText(name + '  ' + t.n + ' / ' + t.n).width;
          total += iw + labelGap + lw;
          return { t, iw, lw, name };
        });
        return { parts, total: total + gapItems * (n - 1) };
      };
      let m = measure(true);
      if (m.total > flaskArea.w) m = measure(false);
      let x = flaskArea.x + Math.max(0, (flaskArea.w - m.total) / 2);
      const y = flaskArea.y + 44;
      m.parts.forEach((p) => {
        out.push({ key: p.t.key, n: p.t.n, x: x + p.iw / 2, y, span, labelX: x + p.iw + labelGap, labelY: y,
                   align: 'left', maxW: p.lw + 10, name: p.name });
        x += p.iw + labelGap + p.lw + gapItems;
      });
    }
    ctx.restore();
    return out;
  }
  function flaskSlot(key) {
    return flaskSlots().find((f) => f.key === key) || { x: LW / 2, y: 0, span: 17 };
  }
  function iconItems(key, cx, cy, span) {
    const lay = M.layoutMolecule(key);
    const x0 = cx - ((lay.w - 1) * span) / 2, y0 = cy - ((lay.h - 1) * span) / 2;
    return lay.atoms.map((a, i) => ({
      el: a.el, x: x0 + a.x * span, y: y0 + a.y * span, free: [], label: false,
      bonds: lay.bonds.filter((b) => b.a === i || b.b === i).map((b) => {
        const o = lay.atoms[b.a === i ? b.b : b.a];
        return { ang: Math.atan2(o.y - a.y, o.x - a.x), half: span / 2, order: b.order, key: b.a + '-' + b.b };
      }),
    }));
  }
  function label(text, x, y, align, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = TOK.ink72; ctx.font = '700 12px Inter, sans-serif';
    ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1.2px';
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  function drawFlaskRow(now) {
    const slotsF = flaskSlots();
    if (MODE === 'mobile') label('MAKE', flaskArea.x + 2, flaskArea.y + 10);
    else if (slotsF[0]) {
      const f0 = slotsF[0], lay0 = M.layoutMolecule(f0.key);
      label('MAKE', Math.round(f0.x - ((lay0.w - 1) * f0.span) / 2 - f0.span * 0.4), flaskArea.y + 12);
    }
    for (const f of slotsF) {
      const lay = M.layoutMolecule(f.key);
      const made = Math.max(0, (st.made[f.key] || 0) - inFlight(f.key, now));
      const full = made >= f.n;
      drawAtoms(iconItems(f.key, f.x, f.y, f.span), f.span * 0.3);
      if (full) {
        const x0 = f.x - ((lay.w - 1) * f.span) / 2, y0 = f.y - ((lay.h - 1) * f.span) / 2;
        const tx = x0 + (lay.w - 1) * f.span + f.span * 0.55, ty = y0 - f.span * 0.35;
        ctx.save();
        ctx.strokeStyle = TOK.green; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(tx - 5, ty); ctx.lineTo(tx - 1.5, ty + 3.5); ctx.lineTo(tx + 6, ty - 5); ctx.stroke();
        ctx.restore();
      }
      const text = f.name + '  ' + made + ' / ' + f.n;
      ctx.save();
      let size = MODE === 'mobile' ? 16 : 15;
      ctx.font = '700 ' + size + 'px Inter, sans-serif';
      while (size > 11 && ctx.measureText(text).width > f.maxW) { size -= 1; ctx.font = '700 ' + size + 'px Inter, sans-serif'; }
      ctx.fillStyle = full ? TOK.green : TOK.ink82;
      ctx.textAlign = f.align; ctx.textBaseline = 'middle';
      ctx.fillText(text, f.labelX, f.labelY);
      ctx.restore();
    }
  }

  /* ---------- THE AVAILABLE PANEL ----------
     From the sketch: each atom the player can add, its name, its valency and
     how many are left. Drag one out to use it. */
  function panelAtom(el, x, y, R, al) {
    const f = M.ELEMENTS[el].hands;
    drawAtoms([{ el, x, y, alpha: al, bonds: [], palm: 'open',
                 free: evenAngles(-Math.PI / 2, f).map((ang) => ({ ang, len: R * TUNE.hand })) }], R);
  }
  function drawPanel() {
    if (MODE === 'mobile') {
      label('AVAILABLE', panel.x + 2, panel.y + 10);
      for (const s of slots) {
        const n = st.avail[s.el] || 0, al = n > 0 ? 1 : 0.35;
        const cx = s.x + s.w / 2, cy = s.y + s.h * 0.5 + 2;
        panelAtom(s.el, cx - 15, cy, 14, al);
        ctx.save();
        ctx.globalAlpha = al;
        ctx.font = '800 16px Inter, sans-serif'; ctx.fillStyle = TOK.white; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText('×' + n, cx + 8, cy);
        ctx.font = '600 12px Inter, sans-serif'; ctx.fillStyle = TOK.ink72; ctx.textAlign = 'center';
        ctx.fillText(cap(M.ELEMENTS[s.el].name), cx, s.y + s.h - 12);
        ctx.restore();
      }
    } else {
      label('AVAILABLE', panel.x, panel.y + 12);
      for (const s of slots) {
        const n = st.avail[s.el] || 0, al = n > 0 ? 1 : 0.35;
        const R = 12.5, cx = s.x + 21, cy = s.y + s.h / 2;
        panelAtom(s.el, cx, cy, R, al);
        ctx.save();
        ctx.globalAlpha = al;
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.font = '700 15px Inter, sans-serif'; ctx.fillStyle = TOK.ink90;
        ctx.fillText(cap(M.ELEMENTS[s.el].name), s.x + 46, cy - 9);
        ctx.font = '600 13px Inter, sans-serif'; ctx.fillStyle = TOK.ink72;
        ctx.fillText('valency ' + M.ELEMENTS[s.el].hands, s.x + 46, cy + 10);
        ctx.font = '800 17px Inter, sans-serif'; ctx.fillStyle = TOK.white; ctx.textAlign = 'right';
        ctx.fillText('×' + n, s.x + s.w, cy + 10);
        ctx.restore();
      }
    }
  }

  /* ---------- HUD ---------- */
  // Four small squares: the level map. Drawn, never an emoji.
  function drawBackIcon(cx, cy) {                 // no back arrow in the shared set: a plain chevron
    ctx.save();
    ctx.strokeStyle = UI.PILL.text; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(cx + 3.5, cy - 6.5); ctx.lineTo(cx - 3.5, cy); ctx.lineTo(cx + 3.5, cy + 6.5); ctx.stroke();
    ctx.restore();
  }
  function drawCtrlIcon(b) {
    if (b.id === 'home') drawBackIcon(b.cx, b.cy);
    else UI.drawIcon(ctx, b.id, b.cx, b.cy, { on: SND.on() });
  }
  function drawHUD() {
    const pill = UI.PILL, was = { fill: pill.fill, border: pill.border, text: pill.text, ink92: TOK.ink92, ink72: TOK.ink72, tint30: TOK.tint30 };
    Object.assign(pill, { fill: 'rgba(255,255,255,0)', border: 'rgba(255,255,255,0.85)', text: '#FFFFFF' });
    Object.assign(TOK, { ink92: '#FFFFFF', ink72: '#FFFFFF', tint30: 'rgba(255,255,255,0.55)' });
    try {
      for (const b of ctrl) {
        if (MODE === 'mobile') { UI.drawRound(ctx, b.cx, b.cy); drawCtrlIcon(b); }
        else if (b.icon) { UI.drawPill(ctx, '', b.cx, b.cy, { w: b.w }); drawCtrlIcon(b); }
        else UI.drawPill(ctx, b.label, b.cx, b.cy, { w: b.w });
      }
    } finally {
      Object.assign(pill, { fill: was.fill, border: was.border, text: was.text });
      Object.assign(TOK, { ink92: was.ink92, ink72: was.ink72, tint30: was.tint30 });
    }
    /* The read-out ends the top band: white on the band's blue, right
       against the edge the controls start from. A narrow phone drops the
       chapter's name before it would ever reach the last button. */
    const y = topBand() / 2, pad = EDGE();
    let lines;
    if (phase === 'map') {
      const all = CHAPTERS.reduce((n, ch) => n + ch.levels().length, 0);
      const done = CHAPTERS.reduce((n, ch, k) => n + Math.min(ch.levels().length, progress(k + 1).done), 0);
      lines = [done + ' of ' + all + ' done'];
    } else {
      const lost = scene ? scene.lost() : st.analysis.lost, lostTxt = lost ? lost + ' lost' : '';
      const join = (...a) => a.filter(Boolean).join('   ·   ');
      lines = [join(CHAPTERS[CHAPTER - 1].short, 'Level ' + (li + 1), lostTxt),
               join('Level ' + (li + 1), lostTxt), 'Level ' + (li + 1)];
    }
    ctx.save();
    ctx.font = '600 16px Inter, sans-serif'; ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const last = ctrl.length ? Math.max(...ctrl.map((b) => b.x + b.w)) : pad;
    const end = LW - pad - chromeInset(), room = end - last - 16;
    let txt = lines[lines.length - 1].toUpperCase();
    for (const t of lines) { if (ctx.measureText(t.toUpperCase()).width <= room) { txt = t.toUpperCase(); break; } }
    const w = ctx.measureText(txt).width;
    ctx.fillText(txt, end, y);
    readoutBox = { x: end - w, y: y - 10, w, h: 20 };
    ctx.restore();
  }

  /* ---------- CARDS ---------- */
  function cardCopy() {
    if (card.kind === 'clue') return { title: 'Clue', sub: level.clue, cta: 'START' };
    if (card.kind === 'win') {
      const cta = li + 1 < LEVELS.length ? 'NEXT LEVEL' : CHAPTER < CHAPTERS.length ? 'NEXT CHAPTER' : 'LEVEL MAP';
      return { title: 'Flasks full', sub: level.note || '', cta };
    }
    return { title: card.made ? card.made + ' of ' + card.total + ' made' : 'Nothing made',
             sub: 'Every molecule on the list has to be made.', cta: 'TRY AGAIN' };
  }
  function wrapLines(text, maxW) {
    const words = text.split(' '), lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }
  function drawCard(now) {
    ctaBox = null; cardBox = null;
    if (!card || now < card.showAt) return;
    if (!card.sounded) { card.sounded = true; (card.kind === 'win' ? SND.win : SND.fail)(); }
    const copy = cardCopy();
    ctx.save();
    ctx.fillStyle = TOK.scrim; ctx.fillRect(0, 0, LW, LH);
    const pw = Math.min(LW - 56, 470);
    ctx.font = '600 17px Inter, sans-serif';
    const subLines = wrapLines(copy.sub, pw - 60);
    const ph = Math.min(LH - 20, 130 + subLines.length * 24 + 92);
    const px = Math.round((LW - pw) / 2), py = Math.max(10, Math.round((LH - ph) / 2));
    ctx.fillStyle = TOK.card; rr(px, py, pw, ph, 22); ctx.fill();
    ctx.strokeStyle = TOK.tint12; ctx.lineWidth = 1; rr(px + 0.5, py + 0.5, pw - 1, ph - 1, 22); ctx.stroke();
    let size = 34;
    ctx.font = '800 ' + size + 'px Inter, sans-serif';
    while (size > 22 && ctx.measureText(copy.title).width > pw - 48) { size -= 1; ctx.font = '800 ' + size + 'px Inter, sans-serif'; }
    ctx.fillStyle = TOK.white; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(copy.title, px + pw / 2, py + 62);
    ctx.font = '600 17px Inter, sans-serif'; ctx.fillStyle = TOK.ink82;
    subLines.forEach((s, i) => ctx.fillText(s, px + pw / 2, py + 112 + i * 24));
    ctx.restore();
    ctaBox = UI.drawCTA(ctx, copy.cta, px + pw / 2, py + ph - 57, TOK.accent);
    cardBox = { x: px, y: py, w: pw, h: ph, lines: subLines.length, textBottom: py + 112 + (subLines.length - 1) * 24 + 12 };
  }
  function onCTA() {
    if (!card) return;
    if (card.kind === 'clue') { card = null; return; }
    if (card.kind !== 'win') restart();
    else if (li + 1 < LEVELS.length) loadLevel(li + 1);
    else if (CHAPTER < CHAPTERS.length) openLevel(CHAPTER + 1, 0);
    else openMap();
  }

  /* ---------- INPUT ----------
     Buttons compare stable ids between press and release, never objects. */
  const playable = () => phase === 'play' && !card && !(scene && scene.modalOpen()) && !(scene ? scene.result() : st.result);
  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (LW / r.width), y: (e.clientY - r.top) * (LH / r.height) };
  }
  const inBox = (p, b) => b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  const tapBox = (b) => { const h = Math.max(44, b.h); return { x: b.x, y: Math.round(b.y + b.h / 2 - h / 2), w: b.w, h }; };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    SND.ready();
    const p = toLogical(e);
    pointer = { x: p.x, y: p.y, type: e.pointerType };
    press = null;
    if (phase === 'play' && scene && scene.modalDown(p)) return;
    if (card && clock() >= card.showAt) { if (inBox(p, ctaBox)) press = { id: 'cta' }; return; }
    const b = ctrl.find((c) => inBox(p, tapBox(c)));
    if (b) { press = { id: b.id }; return; }
    if (phase === 'home') { const r = homeHit(p); if (r) press = { id: 'home-row', chapter: r.sec.chapter }; return; }
    if (phase === 'map') { map.down(p, e); return; }
    if (!playable() || drag) return;
    if (scene) { if (scene.down(p, e)) canvas.style.cursor = 'grabbing'; return; }
    const touch = e.pointerType !== 'mouse';
    const hit = atomAt(p);
    if (hit !== null) { startDrag(hit, p, touch, e.pointerId, false); canvas.style.cursor = 'grabbing'; return; }
    const slot = slots.find((s) => inBox(p, s));
    if (slot && (st.avail[slot.el] || 0) > 0) {
      const id = M.take(st, slot.el);
      if (id < 0) return;
      const w = toWorld(p);
      P.set(id, { x: w.x, y: w.y + (touch ? -TUNE.touchLift : 0), th: -Math.PI / 2, vx: 0, vy: 0, w: 0 });
      startDrag(id, p, touch, e.pointerId, true);
      canvas.style.cursor = 'grabbing';
      SND.pick();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = toLogical(e);
    pointer = { x: p.x, y: p.y, type: e.pointerType };
    if (phase === 'map') { map.move(p, e); return; }
    if (scene) { scene.move(p, e); return; }
    if (drag && e.pointerId === drag.pid) { setTarget(p); return; }
    if (e.pointerType === 'mouse' && st && !card) {
      const over = atomAt(p) !== null || slots.some((s) => inBox(p, s) && (st.avail[s.el] || 0) > 0);
      canvas.style.cursor = over ? 'grab' : 'default';
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    const p = toLogical(e);
    if (phase === 'play' && scene && scene.modalUp(p)) return;
    if (phase === 'map' && map.up(p, e)) return;
    if (scene && scene.up(p, e)) { canvas.style.cursor = 'default'; return; }
    if (drag && e.pointerId === drag.pid) {
      setTarget(p);
      stepWorld(0);          // carry it the last of the way, grabs included
      finishDrag();
      canvas.style.cursor = 'default';
      return;
    }
    const pr = press;
    press = null;
    if (!pr) return;
    if (pr.id === 'home-row') {
      const r = homeHit(p);
      if (r && r.sec.chapter === pr.chapter) openLevel(pr.chapter, resumeIn(pr.chapter));
      return;
    }
    if (pr.id === 'cta') { if (inBox(p, ctaBox)) onCTA(); return; }
    const b = ctrl.find((c) => c.id === pr.id);
    if (!b || !inBox(p, tapBox(b))) return;
    if (b.id === 'sound') SND.toggle();
    else if (b.id === 'restart') restart();
    else if (b.id === 'map') openMap();
    else if (b.id === 'home') openHome();
  });
  canvas.addEventListener('pointercancel', () => { map.cancel(); if (scene) scene.cancel(); else if (drag) finishDrag(); press = null; });
  canvas.addEventListener('wheel', (e) => { if (phase !== 'map') return; e.preventDefault(); map.wheel(e.deltaY); }, { passive: false });

  /* ---------- THE SECTIONS ----------
     The screen the game opens on (owner, 2026-09-17): the three parts of the
     game, each with a picture drawn from the game's own art — atoms closing in,
     a tube fizzing with what was made, a carbon molecule — the words beside it
     and a solid button under them. No boxes: it all sits on the paper. Every
     picture is on the left with the same gap to its words on every row, the
     same margin left and right, and the same air above, between and below.
     A desktop steps the rows across the page; a phone has no room to step. */
  const SECTIONS = [
    { name: 'Moleculator', sub: 'Take atoms, make molecules.', art: 'atoms', chapter: 1 },
    { name: 'Reactor', sub: 'Derive the right compounds.', art: 'tube', chapter: 2 },
    { name: 'Carbon Chamber', sub: 'Let’s go organic!', art: 'organic', chapter: 3 },
  ];
  let homeRows = [];
  // the whole screen grows and shrinks with the window, between three quarters and a third again
  const homeScale = () => (MODE === 'mobile'
    ? Math.max(0.8, Math.min(1.15, Math.min(LW / 390, LH / 844)))
    : Math.max(0.75, Math.min(1.3, Math.min(LW / 760, LH / 600))));
  // A molecule from the lab's own table, drawn at `unit` px a bond.
  function drawSpecies(key, cx, cy, unit, th) {
    const sp = window.ChemLab.SPECIES[key], c = Math.cos(th || 0), sn = Math.sin(th || 0);
    const pts = sp.atoms.map((a) => ({ el: a.el, x: cx + (a.x * c - a.y * sn) * unit, y: cy + (a.x * sn + a.y * c) * unit }));
    drawAtoms(pts.map((pt, i) => ({
      el: pt.el, x: pt.x, y: pt.y, free: [],
      bonds: sp.bonds.filter((b) => b.a === i || b.b === i).map((b) => {
        const o = pts[b.a === i ? b.b : b.a];
        return { ang: Math.atan2(o.y - pt.y, o.x - pt.x), half: Math.hypot(o.x - pt.x, o.y - pt.y) / 2, order: b.order, key: b.a + '-' + b.b };
      }),
    })), Math.max(2, unit * 0.305));
  }
  function speciesBox(key, unit, th) {
    const sp = window.ChemLab.SPECIES[key], c = Math.cos(th), sn = Math.sin(th), R = Math.max(2, unit * 0.305);
    const xs = sp.atoms.map((a) => (a.x * c - a.y * sn) * unit), ys = sp.atoms.map((a) => (a.x * sn + a.y * c) * unit);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { w: x1 - x0 + R * 2, h: y1 - y0 + R * 2, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  // The tube, in the bench's own hairlines, with liquid to `level` and bubbles in it.
  function tubeShape(cx, top, w, h, i) {
    const rad = w / 2, x = cx - rad, bot = top + h;
    ctx.beginPath();
    ctx.moveTo(x + i, top + 3); ctx.lineTo(x + i, bot - rad);
    ctx.arc(cx, bot - rad, rad - i, Math.PI, 0, true);
    ctx.lineTo(x + w - i, top + 3);
  }
  function drawTube(cx, top, w, h, o) {
    const gap = Math.max(2.5, w * 0.045), x = cx - w / 2;
    ctx.save();
    if (o.level != null) {
      ctx.save(); tubeShape(cx, top, w, h, gap); ctx.closePath(); ctx.clip();
      const g = ctx.createLinearGradient(0, o.level, 0, top + h);
      g.addColorStop(0, o.shade[0]); g.addColorStop(1, o.shade[1]);
      ctx.fillStyle = g; ctx.fillRect(x, o.level, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(x, o.level, w, 1.2);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.1;
      for (const b of o.bubbles || []) { ctx.beginPath(); ctx.arc(cx + b[0], o.level + b[1], b[2], 0, TAU); ctx.stroke(); }
      ctx.restore();
    }
    ctx.strokeStyle = INK.line; ctx.lineWidth = 1.2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    tubeShape(cx, top, w, h, 0); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = INK.wall; tubeShape(cx, top, w, h, gap); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.strokeStyle = INK.line;
    rr(x - 5, top - 3, w + 10, 6, 3); ctx.stroke();
    ctx.restore();
  }
  /* The Reactor's picture: a tube of what the player made, fizzing, with the
     bubbles popping out of it. Drawn in its own units, centred on (cx, cy). */
  function drawFizz(cx, cy, k) {
    const w = 60, h = 136, level = 58, out = 26;           // `out` is the room the loose bubbles need
    const ink = (a) => 'rgba(28,115,161,' + a + ')';
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(0, -(h + out) / 2 + out);
    ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    for (const b of [[-13, -20, 4.2, 0.72], [4, -11, 3.2, 0.6], [15, -23, 2.4, 0.5], [-3, -32, 2, 0.38]]) {
      ctx.strokeStyle = ink(b[3]);                         // the ones that got away
      ctx.beginPath(); ctx.arc(b[0], b[1], b[2], 0, TAU); ctx.stroke();
    }
    drawTube(0, 0, w, h, { level, shade: ['#35A06E', '#1E7B50'],
      bubbles: [[-14, 22, 3.4], [7, 38, 2.6], [17, 16, 3], [-4, 52, 2], [12, 60, 2.4], [-18, 44, 1.8]] });
    for (const b of [[-9, 34, 3.6, 0.7], [8, 20, 2.8, 0.6], [-16, 12, 2.2, 0.5], [3, 46, 2, 0.42]]) {
      ctx.strokeStyle = ink(b[3]);                         // rising in the neck, above the liquid
      ctx.beginPath(); ctx.arc(b[0], level - b[1], b[2], 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  /* The Moleculator's picture: loose atoms closing in on one another, each
     still its own piece with its hands out, the way they sit in the dish. */
  function drawCluster(cx, cy, R) {
    const reach = R * TUNE.hand, span = reach * 2 + R * 0.8;
    const angs = [-2.02, -0.45, 1.12, 2.69];
    const items = [{ el: 'C', x: cx, y: cy, bonds: [], free: angs.map((ang) => ({ ang, len: reach })) }];
    const IN = [{ el: 'O', ang: angs[0], hands: 2 }, { el: 'H', ang: angs[1], hands: 1 },
                { el: 'H', ang: angs[2], hands: 1 }, { el: 'H', ang: angs[3], hands: 1 }];
    ctx.save();
    ctx.strokeStyle = 'rgba(28,115,161,0.34)'; ctx.lineWidth = Math.max(1.2, R * 0.1); ctx.lineCap = 'round';
    for (const a of IN) {
      const x = cx + Math.cos(a.ang) * span, y = cy + Math.sin(a.ang) * span;
      for (const [rad, al] of [[R * 1.55, 0.34], [R * 2.0, 0.2]]) {        // it is moving IN
        ctx.globalAlpha = al;
        ctx.beginPath(); ctx.arc(x, y, rad, a.ang - 0.52, a.ang + 0.52); ctx.stroke();
      }
      const free = [{ ang: a.ang + Math.PI, len: reach }];
      if (a.hands > 1) free.push({ ang: a.ang + Math.PI - 2.09, len: reach });
      items.push({ el: a.el, x, y, bonds: [], free });
    }
    ctx.restore();
    drawAtoms(items, R);
  }
  function artPlan(art, phone, k) {
    if (art === 'atoms') { const R = (phone ? 14 : 15) * k, side = 2 * (0.9 * (2 * TUNE.hand + 0.8) + 1.1) * R; return { R, w: side, h: side }; }
    if (art === 'tube') { const s = (phone ? 1.12 : 0.87) * k; return { k: s, w: 70 * s, h: 172 * s }; }
    // the same marble size as the atoms two rows up, so it does not read as finer work
    const key = phone ? 'ethene' : 'ethyl-ethanoate', unit = (phone ? 46 : 44) * k, th = phone ? -0.12 : -0.13;
    const box = speciesBox(key, unit, th);
    return { key, unit, th, box, w: box.w, h: box.h };
  }
  function drawArt(art, plan, cx, cy) {
    if (art === 'atoms') drawCluster(cx, cy, plan.R);
    else if (art === 'tube') drawFizz(cx, cy, plan.k);
    else drawSpecies(plan.key, cx - plan.box.cx, cy - plan.box.cy, plan.unit, plan.th);
  }
  function layoutHome() {
    const phone = MODE === 'mobile', k = homeScale();
    const PAD = Math.round((phone ? 22 : 45) * k), GAP = Math.round((phone ? 16 : 26) * k);
    const step = phone ? [0, 0, 0] : [0, 0, Math.round(58 * k)];
    const subF = Math.max(13, Math.round(15 * k)), lh = Math.round(subF * 1.33);
    const tallyF = Math.max(11, Math.round(13 * k));
    const rows = SECTIONS.map((sec, i) => {
      const plan = artPlan(sec.art, phone, k), room = LW - PAD * 2 - step[i] - plan.w - GAP;
      let size = Math.max(17, Math.min(34, Math.round((phone ? 25 : 26) * k)));
      ctx.font = '800 ' + size + 'px Inter, sans-serif';
      while (size > 15 && ctx.measureText(sec.name).width > room) { size -= 1; ctx.font = '800 ' + size + 'px Inter, sans-serif'; }
      const p = progress(sec.chapter), n = CHAPTERS[sec.chapter - 1].levels().length;
      return { sec, plan, room, size, i, gapX: GAP, subF, lh, tallyF, count: n,
        done: Math.min(n, p.done),
        started: p.done > 0 || p.at > 0 };      // been in this section before: the button says CONTINUE
    });
    const size = Math.min(...rows.map((r) => r.size));       // one heading size down the page
    for (const r of rows) {
      ctx.font = '600 ' + subF + 'px Inter, sans-serif';
      r.subs = wrapLines(r.sec.sub, r.room);
      const subW = Math.max(...r.subs.map((l) => ctx.measureText(l).width));
      r.label = r.started ? 'CONTINUE' : 'START';
      r.tally = r.done + ' of ' + r.count + ' done';
      r.pillW = UI.pillWidth(ctx, r.label);
      ctx.font = '600 ' + tallyF + 'px Inter, sans-serif';
      const buttonW = r.pillW + 14 + ctx.measureText(r.tally).width;
      ctx.font = '800 ' + size + 'px Inter, sans-serif';
      r.size = size;
      r.blockW = Math.max(ctx.measureText(r.sec.name).width, subW, buttonW);
      r.gapHead = Math.round(6 * k); r.gapButton = Math.max(16, Math.round(30 * k));
      r.textH = size + r.gapHead + (r.subs.length - 1) * lh + r.gapButton + UI.PILL.h;
      r.h = Math.max(r.plan.h, r.textH);
      r.w = r.plan.w + GAP + r.blockW;
      r.x = phone ? PAD : (r.i === 1 ? Math.max(PAD, LW - PAD - r.w) : PAD + step[r.i]);
    }
    // the same air above, between and below
    const total = rows.reduce((t, r) => t + r.h, 0), space = Math.max(8, (LH - total) / 4);
    let y = space;
    for (const r of rows) { r.y = y; y += r.h + space; }
    homeRows = rows;
    return rows;
  }
  function drawHome() {
    for (const r of homeRows) {
      const cy = r.y + r.h / 2, tx = r.x + r.plan.w + r.gapX;
      drawArt(r.sec.art, r.plan, r.x + r.plan.w / 2, cy);
      ctx.save();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      let y = Math.round(cy - r.textH / 2) + r.size / 2;
      ctx.font = '800 ' + r.size + 'px Inter, sans-serif'; ctx.fillStyle = TOK.white;
      ctx.fillText(r.sec.name, tx, y);
      y += r.size / 2 + r.gapHead + r.subF / 2;
      ctx.font = '600 ' + r.subF + 'px Inter, sans-serif'; ctx.fillStyle = TOK.ink72;
      r.subs.forEach((l, i) => ctx.fillText(l, tx, y + i * r.lh));
      y += (r.subs.length - 1) * r.lh + r.gapButton + UI.PILL.h / 2;
      ctx.restore();
      const pill = UI.PILL, was = { fill: pill.fill, border: pill.border, text: pill.text };
      Object.assign(pill, { fill: NOTE.band, border: NOTE.band, text: '#FFFFFF' });   // solid buttons (owner, 2026-09-17)
      const box = UI.drawPill(ctx, r.label, tx + r.pillW / 2, y, { w: r.pillW });
      Object.assign(pill, was);
      r.button = box;
      ctx.save();
      ctx.font = '600 ' + r.tallyF + 'px Inter, sans-serif'; ctx.fillStyle = TOK.ink72;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(r.tally, box.x + box.w + 14, y);
      ctx.restore();
    }
  }
  const homeHit = (p) => homeRows.find((r) => p.x >= r.x - 6 && p.x <= r.x + r.w + 6 && p.y >= r.y - 6 && p.y <= r.y + r.h + 6);
  function openHome() {
    if (drag) finishDrag();
    if (bench) bench.cancel();
    phase = 'home'; card = null; press = null;
    layout();
    canvas.style.cursor = 'default';
  }

  /* ---------- RENDER ---------- */
  function render(now) {
    if (!LW) return;
    if (phase === 'home') { ctx.clearRect(0, 0, LW, LH); drawWash(); drawHome(); return; }
    if (phase === 'map') { ctx.clearRect(0, 0, LW, LH); drawWash(); map.render(); drawHUD(); return; }
    if (!(st || scene)) return;
    ctx.clearRect(0, 0, LW, LH);
    drawWash();
    if (scene) { scene.render(now); drawHUD(); scene.renderModal(now); drawCard(now); return; }
    drawDish();
    const held = drag ? new Set(M.groupOf(st, drag.id)) : null;
    const threats = threatPairs();
    const items = atomItems(now, threats);
    drawAtoms(items.filter((it) => !held || !held.has(it.id)), G.S);
    drawFlashes(now);
    drawWasteChips(now);
    drawFlaskRow(now);
    drawPanel();
    drawLifts(now);
    if (held) drawAtoms(items.filter((it) => held.has(it.id)), G.S);
    drawThreatChip(threats);
    drawHUD();
    drawCard(now);
  }
  function frame(t) {
    if (frozen === null && phase === 'play' && (st || scene)) {
      const dt = lastFrame ? Math.min(0.1, (t - lastFrame) / 1000) : 0;
      lastFrame = t;
      if (!(card && clock() >= card.showAt)) {
        stepAcc += dt;
        let n = 0;
        while (stepAcc >= STEP && n < 6) { if (scene) scene.step(STEP); else stepWorld(STEP); stepAcc -= STEP; n++; }
        if (n === 6) stepAcc = 0;
      }
    }
    render(clock());
    requestAnimationFrame(frame);
  }

  /* ---------- DEBUG HANDLE ----------
     For tests and still frames. World units are atom radii from the dish's
     top left; `carry` drags an atom (or a fresh one from the panel, by
     element) in a straight line, grabs and all. */
  window.__chem = {
    get state() {
      if (phase === 'home' || phase === 'map') {
        return { mode: MODE, LW, LH, phase, progress: CHAPTERS.map((ch, k) => Object.assign({ name: ch.name, count: ch.levels().length }, progress(k + 1))) };
      }
      if (scene) {
        return Object.assign({ mode: MODE, LW, LH, phase, chapter: CHAPTER, level: li + 1, card: card ? card.kind : null, cardShown: !!ctaBox },
                             scene.debug.state());
      }
      return {
        mode: MODE, LW, LH, phase, chapter: 1, level: li + 1, S: +G.S.toFixed(3), world: [+G.WW.toFixed(2), +G.WH.toFixed(2)],
        made: Object.assign({}, st.made), wasted: st.wasted, lost: st.analysis.lost, best: st.analysis.best,
        result: st.result, card: card ? card.kind : null, cardShown: !!ctaBox, avail: Object.assign({}, st.avail),
        dragging: drag ? drag.id : -1, reactions, version: st.version, drift: DRIFT, reduced: reduced(), placement,
        palm: Object.assign({}, st.analysis.palm), lastEvent,
        atoms: st.atoms.filter(inDish).map((a) => {
          const p = P.get(a.id);
          return { id: a.id, el: a.el, status: a.status, free: a.free, committed: a.committed,
                   x: +p.x.toFixed(2), y: +p.y.toFixed(2), mol: M.groupOf(st, a.id)[0] };
        }),
      };
    },
    geom() {
      render(clock());
      const ctrlBoxes = ctrl.map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h }));
      if (phase === 'home') {
        return { mode: MODE, LW, LH, phase, ctrl: ctrlBoxes,
                 rows: homeRows.map((r) => ({ name: r.sec.name, chapter: r.sec.chapter, x: r.x, y: r.y, w: r.w, h: r.h,
                   art: { x: r.x, y: r.y + (r.h - r.plan.h) / 2, w: r.plan.w, h: r.plan.h },
                   text: { x: r.x + r.plan.w + r.gapX, w: r.blockW, h: r.textH }, button: r.button, label: r.label, size: r.size })) };
      }
      if (phase === 'map') return { mode: MODE, LW, LH, phase, ctrl: ctrlBoxes, readout: readoutBox, cells: map.debug.cells(), view: map.debug.view() };
      if (scene) return Object.assign({ mode: MODE, LW, LH, ctrl: ctrlBoxes, readout: readoutBox, cta: ctaBox, card: cardBox }, scene.debug.geom());
      const atoms = {};
      for (const a of st.atoms) if (inDish(a)) atoms[a.id] = toPx(P.get(a.id));
      return { mode: MODE, LW, LH, dish: { x: G.x, y: G.y, w: G.w, h: G.h, S: G.S, WW: G.WW, WH: G.WH },
               slots: slots.map((s) => ({ el: s.el, x: s.x, y: s.y, w: s.w, h: s.h })), atoms, flaskSlots: flaskSlots(),
               ctrl: ctrlBoxes, readout: readoutBox, panel, flask: flaskArea, cta: ctaBox };
    },
    toPage(x, y) { return toPx({ x, y }); },
    goto(n, chapter) { openLevel(chapter || CHAPTER, n - 1); render(clock()); return this.state; },
    map() { openMap(); render(clock()); return this.state; },
    home() { openHome(); render(clock()); return this.state; },
    scrollMap(v) { map.debug.scrollTo(v); render(clock()); return map.debug.view(); },
    restart() { restart(); render(clock()); return this.state; },
    freeze(ms) { frozen = performance.now() + (ms || 0); render(frozen); return frozen; },
    advance(ms) {
      if (frozen === null) frozen = performance.now();
      const n = Math.round((ms || 0) / (STEP * 1000));
      for (let i = 0; i < n; i++) { frozen += STEP * 1000; if (!(card && frozen >= card.showAt)) { if (scene) scene.step(STEP); else stepWorld(STEP); } }
      render(frozen);
      return this.state;
    },
    thaw() { frozen = null; lastFrame = 0; },
    move(id, x, y) { const p = P.get(id); if (p) { p.x = x; p.y = y; } render(clock()); return this.state; },
    carry(what, x, y, opts) {
      const o = opts || {};
      if (card || st.result) return this.state;
      let id = what;
      if (typeof what === 'string') {
        const s0 = slots.find((q) => q.el === what);
        if (!s0) return this.state;
        id = M.take(st, what);
        if (id < 0) return this.state;
        const w = toWorld({ x: s0.x + s0.w / 2, y: s0.y + s0.h / 2 });
        P.set(id, { x: w.x, y: w.y, th: -Math.PI / 2, vx: 0, vy: 0, w: 0 });
        drag = { id, pid: -1, touch: false, fromPanel: true, ox: 0, oy: 0, tx: w.x, ty: w.y, cx: w.x, cy: w.y };
      } else {
        const q = P.get(id);
        if (!q) return this.state;
        drag = { id, pid: -1, touch: false, fromPanel: false, ox: 0, oy: 0, tx: q.x, ty: q.y, cx: q.x, cy: q.y };
      }
      const sx = drag.cx, sy = drag.cy, n = o.steps || 40;
      for (let i = 1; i <= n && drag; i++) {
        setTargetWorld(sx + (x - sx) * i / n, sy + (y - sy) * i / n);
        stepWorld(STEP);
        if (frozen !== null) frozen += STEP * 1000;
      }
      if (drag && !o.hold) finishDrag();
      render(clock());
      return this.state;
    },
    drop() { if (drag) finishDrag(); render(clock()); return this.state; },
    bondNow(a, b) { const ev = bondAtoms(a, b); render(clock()); return ev; },
    render() { render(clock()); },
    lab: null,
  };

  /* ---------- CHAPTERS 2 AND 3 ----------
     The bench gets what it needs from this file and nothing else. */
  const bench = window.ChemLabScene ? window.ChemLabScene({
    ctx, TOK, canvas, drawAtoms, rr, label, clock, mulberry,
    SND: { pick: SND.pick, set: SND.set, lift: SND.lift, lost: SND.lost, clasp: (n) => SND.clasp('O', n) },
    size: () => ({ LW, LH, MODE }),
    topBand, botPad, INK, PAPER: NOTE.paper,
    drift: () => DRIFT && !reduced(),
    reduced: () => reduced(),
    rng: () => rng(),
    endLevel: (result, showAt) => {
      card = { kind: result.kind, made: result.made, total: result.total, sounded: false, showAt };
      if (result.kind === 'win') { writeSave(true); T().levelComplete && T().levelComplete(gameLevel(), 0); }
    },
  }) : null;

  /* ---------- THE MAP ---------- */
  const map = window.ChemMap({
    ctx, TOK, rr, washStyle, INK, get pad() { return EDGE(); }, topBand, botPad,
    size: () => ({ LW, LH, MODE }),
    chapters: () => CHAPTERS.map((ch, k) => ({
      name: ch.name, count: ch.levels().length, done: Math.min(ch.levels().length, progress(k + 1).done),
      all: UNLOCK_ALL,
    })),
    open: (c, i) => openLevel(c, i),
  });

  /* ---------- BOOT ----------
     Every re-fit hook is part of the pattern. Timers as well as events, because
     rAF is throttled to nothing in some embedded browsers. */
  setCanvasVars(); resizeCanvas(); fitFullscreen(); resizeCanvas();
  /* ?chapter and ?level go straight to a level, ?map=1 to the map. Otherwise a
     visit opens on the sections screen (owner, 2026-09-17), which is the game's
     front door: one tap from there is the level the player left off at. */
  setChapter(CHAPTER);
  const jump = parseInt(params.get('level'), 10);
  if (params.get('map') === '1') openMap();
  else if (params.has('chapter') || params.has('level')) openLevel(CHAPTER, jump >= 1 && jump <= LEVELS.length ? jump - 1 : progress(CHAPTER).at);
  else openHome();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', onResize);
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  requestAnimationFrame(frame);
})();
