/* ============================================================
   Ricochet · A Zamborin Game
   ============================================================

   Everything the game DOES lives in sim.js. This file is layout, paint and
   input: it owns no rule and decides no outcome. That split is what lets the
   gate run thousands of bot turns with no browser attached.

   TWO LAYOUTS, ONE GAME. Desktop is the site-wide 760x600 landscape frame with
   the controls left and a stat column right; mobile is the measured portrait
   viewport with the controls at the bottom. Both draw the SAME 7x12 board from
   the same seed at the same difficulty. Only `L.scale` differs.
*/
(() => {
  'use strict';

  const S = window.RICOCHET_SIM;
  const TUNE = S.TUNE;
  const UI = window.ZAM_UI;

  // ---------- MODE ----------
  // A browser can report a 0-wide viewport on the first frame. The obvious
  // `innerWidth < 768` then reads as a phone, MODE is locked for the session,
  // and a desktop player is left on the phone layout for good.
  const MODE = (matchMedia('(pointer: coarse)').matches ||
                (window.innerWidth > 0 && window.innerWidth < 768))
    ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);

  /* BOARD WIDTH IS PER-MODE, and this is the one place the two modes stop being
     the same game. A phone is ~0.46 aspect and the desktop frame's playfield is
     1.42, so no single column count fills both; 7 suits the phone and 17 is what
     the desktop frame holds at the cell size 12 rows of runway allow.
     Because it is a different game and not a different layout, the two keep
     SEPARATE high scores below, and each needs its own gate run. */
  TUNE.cols = MODE === 'desktop' ? TUNE.colsDesktop : TUNE.colsMobile;

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
    fitFullscreen(); resizeCanvas(); layout();
  }

  // ---------- ART ----------
  // GAME ART may carry its own palette; CHROME takes tokens only. The line is
  // the design system's §2 and it decides every colour below: blocks, mirrors,
  // balls and pickups are pieces on the board and are art. The ground, the HUD,
  // every read-out, the cards and the buttons are chrome and restate tokens.
  //
  // The HP bands are NOT the concept art's values. Those measured 2.0 to 3.8:1
  // for the white numeral sitting on them, against a 3:1 bar. These are the
  // same four hues swept down in value until the numeral passes with the lit
  // top edge still clearing 3:1 against the ground, and laid on a rising
  // lightness ladder so the bands separate by lightness as well as hue.
  //   band   numeral   lit edge on --bg
  //   teal     4.58          5.39
  //   amber    4.08          6.14
  //   orange   3.71          6.86
  //   coral    3.31          5.83
  const BANDS = [
    { light: '#319E7A', top: '#298465', bot: '#1D5F49', dark: '#174A39' },  // 1-12
    { light: '#B0952A', top: '#937C23', bot: '#6A5A19', dark: '#524614' },  // 13-23
    { light: '#F28236', top: '#C96C2D', bot: '#914E20', dark: '#713C19' },  // 24-35
    { light: '#FF5860', top: '#FF4A51', bot: '#BD363A', dark: '#932A2D' },  // 36+
  ];
  // ---------- TILE TREATMENT ----------
  // Three ways to draw a block, cycled live with F. Comparing two treatments in
  // two tabs is comparing from memory; on one board it is a flicker test and
  // the eye picks the difference up immediately.
  //   flat       one solid value, no modelling at all   (CHOSEN 2026-08-27)
  //   vertical   lit along the top edge, shadowed along the bottom
  //   diagonal   lit from the top-left corner
  // Flat won on the amber band. Modelled, the lit top edge drags amber toward
  // olive and it sits too close to teal; flat, it is unambiguously gold. The
  // teal band barely changes either way, so amber decided it.
  // Values are read permissively rather than with ===: a URL copied with its
  // closing quote arrives as flat=1" and a strict test silently renders the
  // wrong one, which looks exactly like the flag doing nothing.
  const TILE_STYLES = ['vertical', 'flat', 'diagonal'];
  const truthy = (v) => v !== null && v !== '0' && String(v).toLowerCase() !== 'false';
  let tileStyle = (() => {
    const q = new URLSearchParams(location.search);
    const t = (q.get('tile') || '').toLowerCase().replace(/[^a-z]/g, '');
    const i = TILE_STYLES.indexOf(t);
    if (i >= 0) return i;
    if (truthy(q.get('flat'))) return 1;          // ?flat=1 still works
    return TILE_STYLES.indexOf('flat');           // the default
  })();
  let styleToast = 0;
  const ART = {
    ballCore:  '#FFF3D4',      // warm core, 16.27:1 on --bg
    ballEdge:  '#FFCF7A',
    mirrorHi:  '#E4ECFA',
    mirrorMid: '#9FB0CC',
    mirrorLo:  '#5A6B87',
    pickup:    '#FFD23F',      // --accent-2, a token that is also the right art
    pickupLo:  '#C79A18',
    // Rock: pale warm stone, swept against four constraints at once. The
    // palette here is crowded: anything dark enough to look inert fails 3:1 on
    // the ground, anything light enough to pass collides with the mirror steel
    // or the teal band.
    //   on --bg 11.46 | vs mirror steel 1.46 | vs teal 3.04 | vs amber 2.71
    // The 1.46 against steel is thin, so SHAPE carries that distinction: a rock
    // is a full chamfered square, a mirror a thin diagonal slab. Nothing relies
    // on telling those two apart by colour.
    rock:      '#D4D3C7',
    rockLo:    '#98988F',
  };
  // Chrome, verbatim from shared/tokens.css. Canvas cannot read CSS variables,
  // so this is the one place they get restated.
  const T = {
    bg: '#0E1726', bgCard: '#131F36', bgPanel: '#1A2A45',
    line: '#1F2D4A', lineSoft: 'rgba(255,255,255,0.10)',
    text: '#FFFFFF', textDim: '#C5CFE0', textMute: '#8E9CB5',
    accent: '#C24A39', accentHover: '#A93E2F', accentText: '#FF6B5C',
    accent2: '#FFD23F', green: '#5DD39E',
  };

  // ---------- AUDIO ----------
  // The fleet mixes about 4x too quiet, peaking near -11.7 dBFS. 2.4 is the
  // gain Tailwind settled on with the shared limiter behind it.
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zam.ricochet.sfx', gain: 2.4 }) : null;
  const lastPlay = Object.create(null);
  // Twenty-four balls bouncing freely is a machine gun. Each impact voice gets
  // its own floor and everything inside it is dropped silently.
  const THROTTLE = { tick: 60, pop: 45, glass: 90, unlock: 0, fail: 0, start: 0 };
  function play(name) {
    if (!sfx) return;
    const gap = THROTTLE[name] || 0;
    const now = performance.now();
    if (gap && lastPlay[name] && now - lastPlay[name] < gap) return;
    lastPlay[name] = now;
    try { sfx.play(name); } catch (_) { /* audio is never allowed to break play */ }
  }

  // ---------- ANALYTICS ----------
  const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){}, levelRestart(){}, hintUsed(){}, track(){} };
  const TR = () => (window.ZAM_TRACK || NOOP);
  TR().init('ricochet');

  // ---------- QUERY FLAGS (the tuning harness) ----------
  const Q = new URLSearchParams(location.search);
  const FLAG = {
    seed: Q.has('seed') ? (parseInt(Q.get('seed'), 10) >>> 0) : null,
    bot: Q.get('bot'),                                   // 'random' | 'greedy'
    fast: Q.has('fast') ? Math.max(1, parseFloat(Q.get('fast')) || 6) : 1,
    // Play N greedy turns instantly at boot. "Show me what level 30 looks
    // like" is otherwise a five minute job, and every art and layout question
    // about a full board is a question about a level nobody reaches by hand.
    start: Q.has('start') ? Math.max(0, Math.min(400, parseInt(Q.get('start'), 10) || 0)) : 0,
    // Flat tiles: one solid value per band, no gradient, no lit top edge, no
    // shadowed bottom. Here as a flag rather than a rewrite so the two can be
    // put side by side before either is chosen.
    tile: Q.get('tile') || 'flat',
  };

  // ---------- STATE ----------
  // Per mode. A 17-wide board and a 7-wide board do not produce comparable
  // scores, and a single "best" would quietly be whichever you last played on.
  const BEST_KEY = 'zam.ricochet.best.' + (MODE === 'desktop' ? 'd' : 'm');
  const SEEN_KEY = 'zam.ricochet.seen';
  let state = null;
  let turn = null;
  let best = 0;
  let acc = 0;                    // fixed-step accumulator
  let descend = 0;                // 1 -> 0 while the field slides down a row
  let card = null;                // 'rules' | 'over' | null
  let cardScroll = 0;             // rules card body offset, px
  let scrollDrag = null;
  let aiming = false, aimA = 90 * S.DEG, aimShown = false;
  let dragFrom = null;
  let botRng = null;
  const shards = [];
  const flashes = [];
  const trails = new Map();       // ball index -> [{x,y}, ...] in SIM coords

  try { best = parseInt(localStorage.getItem(BEST_KEY), 10) || 0; } catch (_) { best = 0; }

  function newRun() {
    const seed = FLAG.seed !== null ? FLAG.seed
      : (((Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0) || 1);
    state = S.newState(seed);
    botRng = S.makeRng(seed ^ 0x5EED1E);
    turn = null; acc = 0; descend = 0; card = null;
    aiming = false; aimShown = false; aimA = 90 * S.DEG;
    shards.length = 0; flashes.length = 0; trails.clear();
    TR().gameStart();
    TR().levelStart(1);
    play('start');
  }

  // ---------- LAYOUT ----------
  // Every number the renderer needs, worked out ONCE per resize and never
  // inside a draw call. A card whose size is decided while it is being painted
  // cannot be measured by anything, and three cards in three days were believed
  // fixed and were not.
  const L = {
    scale: 1, cell: 44, bx: 0, by: 0, bw: 0, bh: 0,
    dangerY: 0, launchY: 0, hudH: 62,
    side: 0, lvl: { cx: 0, cy: 0 },
    hit: {},                       // id -> {x,y,w,h}, refreshed each frame
  };

  function layout() {
    L.hit = {};
    if (MODE === 'mobile') {
      const tight = LH < 620;
      const hudH = tight ? 52 : 62;
      const barH = tight ? 52 : 58;
      const launchBand = tight ? 56 : 74;
      const margin = Math.min(20, Math.round(LW * 0.05));
      const availW = Math.max(80, LW - margin * 2);
      const availH = Math.max(120, LH - hudH - launchBand - barH - 6);
      const cell = Math.max(12, Math.min(availW / TUNE.cols, availH / TUNE.rows));
      L.cell = cell;
      L.scale = cell / TUNE.cell;
      L.bw = cell * TUNE.cols; L.bh = cell * TUNE.rows;
      L.bx = Math.round((LW - L.bw) / 2);
      // Sit the field high in the slack: the launcher and the thumb want the
      // room underneath, not above.
      L.by = Math.round(hudH + Math.max(0, (availH - L.bh) * 0.35));
      L.hudH = hudH;
      L.dangerY = L.by + L.bh;
      L.launchY = L.dangerY + Math.min(32, launchBand * 0.44);
      L.barY = LH - barH / 2 - 4;
      L.side = 0;
      L.lvl = { cx: LW - margin, cy: Math.round(hudH * 0.52) };
    } else {
      /* Desktop takes the house header, read from bloom/play.js rather than
         inferred: a band across the top, controls at its LEFT end starting at
         SIDE_PAD, the read-out right-aligned at LW - SIDE_PAD on the same
         centre line. "Controls left" in CONTRIBUTING means the left of that
         row, not a left-hand column.

         The board is 7 wide by 12 tall inside a 760x600 landscape frame, so it
         is limited by HEIGHT and never by width. Freeing the side columns
         cannot make it bigger; the band costs it a little. 41 is what is left
         after the band and the launcher strip, against 44 before. */
      const band = 72, launchBand = 34, pad = 30;
      const cell = Math.max(12, Math.floor(Math.min(
        (LW - pad * 2) / TUNE.cols,
        (LH - band - launchBand) / TUNE.rows)));
      L.cell = cell;
      L.scale = cell / TUNE.cell;
      L.bw = cell * TUNE.cols;
      L.bh = cell * TUNE.rows;
      L.bx = Math.round((LW - L.bw) / 2);
      L.by = band;
      L.dangerY = L.by + L.bh;
      L.launchY = L.dangerY + 18;
      L.hudH = band;
      L.band = band;
      L.sidePad = 30;
      L.ctrlCy = Math.round(band / 2);
      L.side = 0;
    }
  }

  // sim -> screen
  const sx = (x) => L.bx + x * L.scale;
  const sy = (y) => L.by + y * L.scale;

  // ---------- INPUT ----------
  function pt(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX ?? e.changedTouches?.[0]?.clientX) - rect.left) * (LW / rect.width),
      y: ((e.clientY ?? e.changedTouches?.[0]?.clientY) - rect.top) * (LH / rect.height),
    };
  }
  const inBox = (p, b) => b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

  const AIM_MIN_DRAG = 24;        // logical px before an aim is taken seriously

  const NOT_A_BUTTON = { lvlPill: 1 };
  function hitControls(p) {
    for (const id in L.hit) {
      if (NOT_A_BUTTON[id]) continue;
      if (inBox(p, L.hit[id])) return id;
    }
    return null;
  }

  function act(id) {
    if (id === 'mute') {
      if (!sfx) return;
      const on = !sfx.isOn();
      sfx.setOn(on);
      if (on) play('tick');
      return;
    }
    if (id === 'rules')   { card = card === 'rules' ? null : 'rules'; cardScroll = 0; return; }
    if (id === 'close')   { card = null; markSeen(); return; }
    if (id === 'restart') { TR().levelRestart(state ? state.level : 1); newRun(); return; }
    if (id === 'again')   { newRun(); return; }
  }

  function markSeen() { try { localStorage.setItem(SEEN_KEY, '1'); } catch (_) {} }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (sfx) sfx.ensureAudio();
    const p = pt(e);
    const id = hitControls(p);
    if (id) { canvas.setPointerCapture?.(e.pointerId); L.armed = id; return; }
    if (card) {
      // A card swallows the board, but its own body scrolls under a drag.
      const b = L.cardBody;
      if (b && b.max > 0 && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        scrollDrag = { y: p.y, from: cardScroll };
        canvas.setPointerCapture?.(e.pointerId);
      }
      return;
    }
    if (FLAG.bot) return;
    if (!state || state.over || turn || descend > 0) return;
    aiming = true; aimShown = false; dragFrom = p;
    canvas.setPointerCapture?.(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (scrollDrag) {
      e.preventDefault();
      const p = pt(e);
      cardScroll = scrollDrag.from - (p.y - scrollDrag.y);
      render(performance.now());
      return;
    }
    if (!aiming || !dragFrom) return;
    e.preventDefault();
    const p = pt(e);
    const dx = p.x - dragFrom.x, dy = p.y - dragFrom.y;
    if (Math.hypot(dx, dy) < AIM_MIN_DRAG) { aimShown = false; return; }
    // The drag vector IS the shot vector: drag up-left, fire up-left. Precision
    // rises with drag length, and the finger never has to sit on the target it
    // is trying to read.
    aimShown = true;
    aimA = S.legalAngle(Math.atan2(-dy, dx));
  });

  function endPointer(e) {
    if (scrollDrag) { scrollDrag = null; return; }
    const armed = L.armed; L.armed = null;
    if (armed) {
      const p = pt(e);
      if (inBox(p, L.hit[armed])) act(armed);
      return;
    }
    if (!aiming) return;
    aiming = false;
    const fire = aimShown;
    aimShown = false; dragFrom = null;
    if (fire && state && !state.over && !turn && descend <= 0) fireTurn(aimA);
  }
  canvas.addEventListener('pointerup', (e) => { e.preventDefault(); endPointer(e); });
  canvas.addEventListener('pointercancel', () => { aiming = false; aimShown = false; L.armed = null; scrollDrag = null; });

  // Wheel scrolls the open card and nothing else. Passive is off deliberately:
  // without preventDefault the page behind the canvas scrolls instead, which on
  // a laptop trackpad reads as the card being frozen.
  canvas.addEventListener('wheel', (e) => {
    if (!card) return;
    const b = L.cardBody;
    if (!b || b.max <= 0) return;
    e.preventDefault();
    cardScroll = Math.max(0, Math.min(b.max, cardScroll + e.deltaY));
    render(performance.now());
  }, { passive: false });

  // Keyboard: a mouse can drag, but a keyboard is the only precise way to sit
  // on an exact angle, and it is the only way in at all without a pointer.
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'f' || e.key === 'F') {          // cycle the tile treatment
      e.preventDefault();
      tileStyle = (tileStyle + 1) % TILE_STYLES.length;
      styleToast = performance.now();
      render(performance.now());
      return;
    }
    if (card) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); act(card === 'over' ? 'again' : 'close'); return;
      }
      const b = L.cardBody;
      if (b && b.max > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        cardScroll = Math.max(0, Math.min(b.max, cardScroll + (e.key === 'ArrowDown' ? 48 : -48)));
        render(performance.now());
      }
      return;
    }
    if (!state || state.over || turn || descend > 0 || FLAG.bot) return;
    const step = (e.shiftKey ? 0.25 : 1.5) * S.DEG;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); aimA = S.legalAngle(aimA + step); aimShown = true; }
    if (e.key === 'ArrowRight') { e.preventDefault(); aimA = S.legalAngle(aimA - step); aimShown = true; }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (sfx) sfx.ensureAudio();
      if (aimShown) fireTurn(aimA); else aimShown = true;
    }
  });

  // ---------- TURN ----------
  // Play whole turns with no renderer attached. Used by ?start= and by the QC
  // hook, and it is the same call the headless gate makes.
  function fastForward(n) {
    for (let i = 0; i < n && state && !state.over; i++) {
      const t = S.startTurn(state, botAngle());
      S.runToEnd(state, t);
      S.resolveTurn(state, t);
    }
    if (state && state.score > best) {
      best = state.score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (_) {}
    }
    turn = null; descend = 0; trails.clear();
    if (state && state.over) card = 'over';
  }

  function fireTurn(angle) {
    turn = S.startTurn(state, angle, { rec: true });
    acc = 0;
    trails.clear();
    TR().levelStart(state.level);
    play('tick');
  }

  function endTurn() {
    const shots = state.shots + 1;
    const lvl = state.level;
    S.resolveTurn(state, turn);
    TR().levelComplete(lvl, shots);
    turn = null;
    trails.clear();
    descend = 1;
    if (state.score > best) {
      best = state.score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (_) {}
    }
    if (state.over) {
      descend = 0;
      card = 'over';
      play('fail');
      TR().track && TR().track('run_end', { level: lvl, score: state.score, cause: 'crossed_line' });
    }
  }

  function drainEvents() {
    const ev = turn.events;
    let bounced = false, broke = false;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.type === 'wall' || e.type === 'hit') bounced = true;
      else if (e.type === 'break') { broke = true; spawnShards(e); }
      else if (e.type === 'mirror') { play('glass'); flashes.push({ x: e.x, y: e.y, t: 1, kind: 'm' }); }
      else if (e.type === 'pickup') { play('unlock'); flashes.push({ x: e.x, y: e.y, t: 1, kind: 'p' }); }
    }
    if (bounced) play('tick');
    if (broke) play('pop');
    ev.length = 0;
  }

  function spawnShards(e) {
    const b = BANDS[S.band(e.hp0 || 1)];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + (i * 0.7);
      const sp = 40 + (i % 4) * 26;
      shards.push({
        x: e.x, y: e.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        r: 3 + (i % 3), t: 1, col: i % 2 ? b.light : b.top,
        spin: (i % 2 ? 1 : -1) * (2 + i * 0.3), a: a,
      });
    }
  }

  // The in-browser half of the tuning harness. `?bot=greedy` plays the game
  // against itself at speed so a whole run can be watched without touching it;
  // the headless gate in Milestone 2 runs the same two bots over 300 seeds.
  function botAngle() {
    if (FLAG.bot === 'greedy') {
      const lo = TUNE.minAngleDeg * S.DEG, hi = Math.PI - lo;
      let bestA = Math.PI / 2, bestV = -1;
      for (let i = 0; i < 24; i++) {
        const a = lo + (hi - lo) * (i / 23);
        const r = S.tryAngle(state, a);
        const v = r.hp * 1000 + r.pickups;
        if (v > bestV) { bestV = v; bestA = a; }
      }
      return bestA;
    }
    return (TUNE.minAngleDeg + botRng.float() * (180 - 2 * TUNE.minAngleDeg)) * S.DEG;
  }

  // ---------- DRAW HELPERS ----------
  function rr(x, y, w, h, r) { UI.roundRectPath(ctx, x, y, w, h, r); }
  function grad(x0, y0, x1, y1, a, b) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, a); g.addColorStop(1, b); return g;
  }
  function label(text, x, y, size, col, align) {
    ctx.font = '700 ' + size + 'px Inter, sans-serif';
    ctx.fillStyle = col; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
    ctx.textAlign = 'left';
  }
  function tracked(text, x, y, size, col, align) {
    // Small tracked caps for stat labels. Chrome, and exempt from the 16px
    // content-copy floor: nobody reads a HUD label, they recognise it.
    ctx.font = '700 ' + size + 'px Inter, sans-serif';
    ctx.fillStyle = col; ctx.textBaseline = 'alphabetic';
    const sp = size * 0.14;
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width + sp;
    w -= sp;
    let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + sp; }
  }
  const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  // ---------- PIECES ----------
  function drawBlock(x, y, s, hp, hp0) {
    const b = BANDS[S.band(hp0 || hp)];
    const r = Math.max(3, s * 0.14);
    const style = TILE_STYLES[tileStyle];
    if (style === 'flat') {
      // One solid value, and the edge is carried entirely by the block being
      // far lighter than the ground it sits on. Still no stroke: an outline
      // would read cartoonish here exactly as it does on a modelled tile.
      // `b.top` is deliberately the value the numeral contrast was swept
      // against, so flat keeps the measured worst case rather than a new one.
      ctx.fillStyle = b.top;
      rr(x, y, s, s, r); ctx.fill();
    } else if (style === 'diagonal') {
      // Lit from the top-left corner instead of from directly above.
      //
      // The stop positions are the whole trick. On a corner-to-corner gradient
      // a point sits at t = (px + py) / 2s, so the centred numeral starts at
      // about t = 0.27 even for a three digit number. Spending `light` inside
      // the first fifth puts the numeral on b.top or darker, which is exactly
      // what the contrast sweep measured. Ramping it slowly instead would sit
      // white type on the lit corner and give away a full point of ratio
      // without anything on screen looking wrong.
      const g = ctx.createLinearGradient(x, y, x + s, y + s);
      g.addColorStop(0, b.light);
      g.addColorStop(0.22, b.top);
      g.addColorStop(0.78, b.bot);
      g.addColorStop(1, b.dark);
      ctx.fillStyle = g;
      rr(x, y, s, s, r); ctx.fill();
    } else {
      // Body. No stroke anywhere on a piece: the edges are a light band across
      // the top and a dark band across the bottom, which is what makes it read
      // as a lit solid rather than a sticker.
      ctx.save();
      rr(x, y, s, s, r); ctx.clip();
      ctx.fillStyle = grad(x, y, x, y + s, b.top, b.bot);
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = grad(x, y, x, y + s * 0.32, b.light, b.top);
      ctx.globalAlpha = 0.95; ctx.fillRect(x, y, s, s * 0.32);
      ctx.globalAlpha = 1;
      ctx.fillStyle = grad(x, y + s * 0.72, x, y + s, b.bot, b.dark);
      ctx.fillRect(x, y + s * 0.72, s, s * 0.28);
      ctx.restore();
    }

    // Numeral: white 800 at no less than 19 logical px, which puts it above
    // WCAG's large-text threshold, where the bar is 3:1 and the bands clear it.
    numeral(String(hp), x + s / 2, y + s / 2, s, T.text, 'rgba(0,0,0,0.42)');
  }

  function drawMirror(x, y, s, d, hp) {
    const t = Math.max(3.5, s * 0.15);          // half-thickness on screen
    const ax = x + s * 0.06, bx2 = x + s * 0.94;
    const ay = d > 0 ? y + s * 0.94 : y + s * 0.06;
    const by = d > 0 ? y + s * 0.06 : y + s * 0.94;
    ctx.save();
    ctx.lineCap = 'round';
    // Steel slab: a dark under-edge, the body gradient, then a thin bright
    // specular core with a tight feather. Never a wide glow wash.
    ctx.lineWidth = t * 2;
    ctx.strokeStyle = grad(ax, ay, bx2, by, ART.mirrorLo, ART.mirrorMid);
    ctx.beginPath(); ctx.moveTo(ax, ay + t * 0.42); ctx.lineTo(bx2, by + t * 0.42); ctx.stroke();
    ctx.strokeStyle = grad(ax, ay, bx2, by, ART.mirrorMid, ART.mirrorHi);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx2, by); ctx.stroke();
    ctx.lineWidth = Math.max(1, t * 0.34);
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.moveTo(ax + (bx2 - ax) * 0.10, ay + (by - ay) * 0.10 - t * 0.36);
    ctx.lineTo(ax + (bx2 - ax) * 0.90, ay + (by - ay) * 0.90 - t * 0.36);
    ctx.stroke();
    ctx.restore();

    /* A breakable mirror states its cost on a dark disc at the cell centre.
       Measured before it was drawn, because neither obvious option works: white
       type on the light steel is 2.20, and dark type is 1.04 wherever a centred
       numeral overhangs the slab onto the ground. The disc fixes both, at 17.96
       for white on it and 8.17 for it on the steel, and the cell centre is the
       one point the diagonal always crosses whichever way the mirror faces. */
    if (hp > 0) {
      // The plate is SIZED TO THE TEXT, not a fixed disc. A mirror at level 25
      // costs three digits, and a fixed disc at 0.60 of the cell would have had
      // the numeral hanging off both sides onto the steel, which is the 2.20
      // contrast this plate exists to avoid.
      const txt = String(hp);
      const mcx = x + s / 2, mcy = y + s / 2;
      const fs = Math.max(13, Math.round(s * 0.30));
      ctx.font = '800 ' + fs + 'px Inter, sans-serif';
      const tw = ctx.measureText(txt).width;
      const pw = Math.max(s * 0.46, tw + fs * 0.7), ph = fs * 1.5;
      ctx.fillStyle = 'rgba(14,23,38,0.92)';          // --bg
      rr(mcx - pw / 2, mcy - ph / 2, pw, ph, ph / 2); ctx.fill();
      ctx.fillStyle = T.text;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, mcx, mcy + 1);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
  }

  /* Shared numeral, so a block, a rock and a mirror all print HP the same way
     at the same size. Never below 19 logical px, which keeps it above WCAG's
     large-text threshold where the bar is 3:1. */
  function numeral(txt, cx, cy, s, col, shadow) {
    let fs = Math.max(19, Math.round(s * 0.42));
    ctx.font = '800 ' + fs + 'px Inter, sans-serif';
    while (ctx.measureText(txt).width > s * 0.82 && fs > 19) {
      fs -= 1; ctx.font = '800 ' + fs + 'px Inter, sans-serif';
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = shadow;
    ctx.fillText(txt, cx, cy + Math.max(1, s * 0.035));
    ctx.fillStyle = col;
    ctx.fillText(txt, cx, cy + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  /* A rock. Flat like the tiles, and chamfered rather than rounded so its
     silhouette differs from a block before colour registers at all. With HP it
     prints a numeral like anything else; at 0 it prints none, and the absence
     of a number IS the rule being stated. */
  function drawRock(x, y, s, hp) {
    const c = s * 0.22;
    ctx.beginPath();
    ctx.moveTo(x + c, y); ctx.lineTo(x + s - c, y);
    ctx.lineTo(x + s, y + c); ctx.lineTo(x + s, y + s - c);
    ctx.lineTo(x + s - c, y + s); ctx.lineTo(x + c, y + s);
    ctx.lineTo(x, y + s - c); ctx.lineTo(x, y + c);
    ctx.closePath();
    ctx.fillStyle = ART.rock; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = ART.rockLo;                      // one darker facet, value only
    ctx.beginPath();
    ctx.moveTo(x + s, y + s * 0.42); ctx.lineTo(x + s, y + s);
    ctx.lineTo(x + s * 0.42, y + s); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (hp > 0) numeral(String(hp), x + s / 2, y + s / 2, s, '#22252B', 'rgba(255,255,255,0.35)');
  }

  function drawPickup(x, y, s) {
    const cx = x + s / 2, cy = y + s / 2, r = s * 0.28;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.1);
    g.addColorStop(0, 'rgba(255,210,63,0.34)');
    g.addColorStop(1, 'rgba(255,210,63,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 2.1, 0, 7); ctx.fill();
    ctx.fillStyle = grad(cx, cy - r, cx, cy + r, ART.pickup, ART.pickupLo);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.font = '800 ' + Math.max(11, Math.round(s * 0.26)) + 'px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('+1', cx, cy + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  function drawBall(cx, cy, r) {
    const g = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, 0, cx, cy, r * 2.4);
    g.addColorStop(0, 'rgba(255,243,212,0.85)');
    g.addColorStop(0.42, 'rgba(255,207,122,0.22)');
    g.addColorStop(1, 'rgba(255,207,122,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 2.4, 0, 7); ctx.fill();
    ctx.fillStyle = grad(cx, cy - r, cx, cy + r, ART.ballCore, ART.ballEdge);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  }

  function speaker(x, y, on) {
    ctx.save();
    ctx.strokeStyle = UI.PILL.text; ctx.fillStyle = UI.PILL.text;
    ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 7, y - 3.2); ctx.lineTo(x - 3.4, y - 3.2); ctx.lineTo(x + 0.6, y - 7.4);
    ctx.lineTo(x + 0.6, y + 7.4); ctx.lineTo(x - 3.4, y + 3.2); ctx.lineTo(x - 7, y + 3.2);
    ctx.closePath(); ctx.fill();
    if (on) {
      ctx.beginPath(); ctx.arc(x + 1.6, y, 4.6, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 1.6, y, 7.6, -0.9, 0.9); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x + 3.4, y - 4); ctx.lineTo(x + 9.4, y + 4);
      ctx.moveTo(x + 9.4, y - 4); ctx.lineTo(x + 3.4, y + 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- RENDER ----------
  let lastNow = 0;

  function render(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000)) || 0;
    lastNow = now;

    ctx.clearRect(0, 0, LW, LH);

    // Ground: token gradient, with a cool panel glow behind the top of the
    // field. The brief's #0C1224/#070B16 are not tokens and the ground is
    // chrome, so it takes --bg-card into --bg instead.
    ctx.fillStyle = grad(0, 0, 0, LH, T.bgCard, T.bg);
    ctx.fillRect(0, 0, LW, LH);
    const gg = ctx.createRadialGradient(L.bx + L.bw / 2, L.by, 0, L.bx + L.bw / 2, L.by, L.bw * 1.5);
    gg.addColorStop(0, 'rgba(26,42,69,0.85)');
    gg.addColorStop(1, 'rgba(26,42,69,0)');
    ctx.fillStyle = gg; ctx.fillRect(0, 0, LW, LH);

    drawField(dt);
    if (MODE === 'mobile') drawHudMobile(); else drawSideDesktop();
    drawControls();
    if (card) drawCard(card, now);
    drawStyleToast(now);
  }

  /* Which of the three treatments is on screen, named for a moment after F is
     pressed and then gone. Cycling three unlabelled variants means losing track
     of which one you liked by the second press. It sits in a chrome margin and
     never over the board: nothing may cover gameplay. */
  function drawStyleToast(now) {
    if (!styleToast) return;
    const age = (now - styleToast) / 1000;
    if (age > 1.7) { styleToast = 0; return; }
    const a = age < 1.2 ? 1 : Math.max(0, 1 - (age - 1.2) / 0.5);
    const x = MODE === 'mobile' ? Math.min(20, Math.round(LW * 0.05)) : 20;
    const y = MODE === 'mobile' ? L.barY - UI.PILL.h / 2 - 14 : 410;
    ctx.save();
    ctx.globalAlpha = a;
    tracked('TILES', x, y - 15, 10, T.textMute);
    label(TILE_STYLES[tileStyle].toUpperCase(), x, y + 4, 15, T.accent2);
    ctx.restore();
  }

  function drawField(dt) {
    const cell = L.cell;

    // The playfield reads as a distinct panel because it is DARKER than the
    // ground, not because anything is drawn around it.
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = T.bg;
    ctx.fillRect(L.bx, L.by, L.bw, L.bh);
    ctx.restore();

    ctx.fillStyle = T.line;
    for (let c = 1; c < TUNE.cols; c++) ctx.fillRect(Math.round(L.bx + c * cell), L.by, 1, L.bh);

    // Row descent: the field slides in from one row above.
    const off = descend > 0 ? -descend * cell : 0;
    ctx.save();
    ctx.beginPath(); ctx.rect(L.bx, L.by - 1, L.bw, L.bh + 1); ctx.clip();
    ctx.translate(0, off);

    for (let r = 0; r < state.rows.length; r++) {
      const row = state.rows[r];
      for (let c = 0; c < TUNE.cols; c++) {
        const cellv = row[c];
        if (!cellv) continue;
        const x = L.bx + c * cell, y = L.by + r * cell;
        if (y + off > L.by + L.bh) continue;
        const pad = cell * 0.045;
        if (cellv.t === 'b') drawBlock(x + pad, y + pad, cell - pad * 2, cellv.hp, cellv.hp0);
        else if (cellv.t === 'm') drawMirror(x, y, cell, cellv.d, cellv.hp);
        else if (cellv.t === 'r') drawRock(x + pad, y + pad, cell - pad * 2, cellv.hp);
        else drawPickup(x, y, cell);
      }
    }
    ctx.restore();

    drawFlashes(dt);
    drawShards(dt);

    // Danger line: --accent-text used AS a mark, a thin bright core with a
    // tight feather under it, and a warning wash that only exists below.
    // The wash deepens as the wall closes, so the pressure is in the material
    // and not only in the read-out. A player watching the board should not have
    // to look away from it to find out how much trouble they are in.
    const dy = L.dangerY;
    const tl = S.turnsToLine(state);
    const urg = tl <= 1 ? 1 : tl <= 2 ? 0.72 : tl <= 4 ? 0.4 : 0;
    const warn = ctx.createLinearGradient(0, dy, 0, dy + cell * 0.9);
    warn.addColorStop(0, 'rgba(255,107,92,' + (0.18 + 0.30 * urg).toFixed(3) + ')');
    warn.addColorStop(1, 'rgba(255,107,92,0)');
    ctx.fillStyle = warn; ctx.fillRect(L.bx, dy, L.bw, cell * 0.9);
    ctx.fillStyle = 'rgba(255,107,92,0.30)';
    ctx.fillRect(L.bx, dy - 2, L.bw, 5);
    ctx.fillStyle = T.accentText;
    ctx.fillRect(L.bx, dy - 1, L.bw, 2);

    if (turn) drawBallsAndTrails();
    drawLauncher();
    if (aimShown && !turn && descend <= 0 && !card && state && !state.over) drawAim();
  }

  function drawBallsAndTrails() {
    const r = Math.max(3, TUNE.ballR * L.scale);
    for (let i = 0; i < turn.balls.length; i++) {
      const b = turn.balls[i];
      let tr = trails.get(i);
      if (!tr) { tr = []; trails.set(i, tr); }
      if (b.live) {
        tr.push({ x: b.x, y: b.y });
        if (tr.length > 7) tr.shift();
      } else if (tr.length) { tr.length = 0; }

      if (tr.length > 1) {
        ctx.save();
        ctx.lineCap = 'round';
        for (let k = 1; k < tr.length; k++) {
          const a = (k / tr.length) * 0.5;
          ctx.strokeStyle = 'rgba(255,207,122,' + a.toFixed(3) + ')';
          ctx.lineWidth = r * (0.5 + k / tr.length);
          ctx.beginPath();
          ctx.moveTo(sx(tr[k - 1].x), sy(tr[k - 1].y));
          ctx.lineTo(sx(tr[k].x), sy(tr[k].y));
          ctx.stroke();
        }
        ctx.restore();
      }
      if (b.live) drawBall(sx(b.x), sy(b.y), r);
      else { ctx.globalAlpha = 0.5; drawBall(sx(b.x), sy(b.y), r * 0.8); ctx.globalAlpha = 1; }
    }
  }

  function drawLauncher() {
    const x = sx(state.launchX);
    const y = L.launchY;
    const r = Math.max(6, TUNE.ballR * L.scale * 1.7);
    drawBall(x, y, r);
    // The count rides under the launcher on mobile, where it is the only place
    // it exists. On desktop the right column already carries BALLS, and there
    // is not 20px of frame under the launcher to put it in anyway.
    if (MODE !== 'mobile') return;
    const live = turn ? (turn.count - turn.fired) + turn.balls.filter(b => b.live).length : state.balls;
    const fs = 17;
    ctx.font = '800 ' + fs + 'px Inter, sans-serif';
    ctx.fillStyle = ART.ballCore; ctx.textAlign = 'center';
    ctx.fillText('× ' + live, x, y + r + fs + 3);
    ctx.textAlign = 'left';
  }

  function drawAim() {
    const pts = S.previewPath(state, aimA);
    if (pts.length < 2) return;
    ctx.save();
    ctx.setLineDash([2.5, 7]);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,243,212,0.62)';
    ctx.beginPath();
    ctx.moveTo(sx(pts[0].x), L.launchY);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(sx(pts[i].x), sy(pts[i].y));
    ctx.stroke();
    ctx.setLineDash([]);
    // A small mark at the first contact, so the read is "it lands HERE", not a
    // line trailing off. The second leg is deliberately the last thing shown:
    // the full path would remove the decision.
    const p1 = pts[1];
    ctx.strokeStyle = 'rgba(255,243,212,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx(p1.x), sy(p1.y), 5.5, 0, 7); ctx.stroke();
    ctx.restore();
  }

  function drawShards(dt) {
    for (let i = shards.length - 1; i >= 0; i--) {
      const s2 = shards[i];
      s2.t -= dt * 1.9;
      if (s2.t <= 0) { shards.splice(i, 1); continue; }
      s2.x += s2.vx * dt; s2.y += s2.vy * dt; s2.vy += 320 * dt;
      s2.a += s2.spin * dt;
      ctx.save();
      ctx.globalAlpha = Math.max(0, s2.t) * 0.9;
      ctx.translate(sx(s2.x), sy(s2.y)); ctx.rotate(s2.a);
      ctx.fillStyle = s2.col;
      const w = s2.r * L.scale * 1.6;
      ctx.fillRect(-w / 2, -w / 2, w, w * 0.72);
      ctx.restore();
    }
  }

  function drawFlashes(dt) {
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.t -= dt * 2.6;
      if (f.t <= 0) { flashes.splice(i, 1); continue; }
      const r = (1 - f.t) * L.cell * 0.85 + 4;
      const col = f.kind === 'p' ? '255,210,63' : '228,236,250';
      ctx.save();
      ctx.globalAlpha = Math.max(0, f.t) * 0.5;
      ctx.strokeStyle = 'rgba(' + col + ',1)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), r, 0, 7); ctx.stroke();
      ctx.restore();
    }
  }

  function liveScore() { return state.score + (turn ? turn.hpDestroyed : 0); }

  function drawHudMobile() {
    const m = Math.min(20, Math.round(LW * 0.05));
    const big = Math.round(Math.min(32, LW * 0.082));
    const sTxt = commas(liveScore());
    label(sTxt, m, L.hudH * 0.60, big, T.text);
    ctx.font = '700 ' + big + 'px Inter, sans-serif';
    L.scoreRight = m + ctx.measureText(sTxt).width;
    ctx.font = '700 11px Inter, sans-serif';
    tracked('BEST  ' + commas(best), m, L.hudH * 0.88, 11, T.textMute);
    lvlPill();
    L.turnsBox = turnsReadout(LW * 0.53, L.hudH * 0.62, true);
  }

  /* HOW LONG HAVE I GOT.
     The one thing the board never said out loud. On a phone the ball count is
     the only other number on screen, so "x 12" was being read as twelve lives.
     This says TURNS on it, in a different weight and colour, and it counts the
     thing that actually ends the run. Colour carries the urgency so it can be
     read without stopping to parse a digit.
     Returns its own box, because on a 320px phone this sits between a five
     figure score and the level pill and the only honest way to know it clears
     both is to measure it. */
  function turnsReadout(x, y, compact) {
    const n = S.turnsToLine(state);
    const col = n <= 1 ? T.accentText : n <= 3 ? T.accent2 : T.textDim;
    const num = String(n);
    if (compact) {
      ctx.font = '800 21px Inter, sans-serif';
      const nw = ctx.measureText(num).width;
      const lw = 10 * 0.6 * 5 + 10 * 0.14 * 4 + 6;      // "TURNS" tracked, plus a gap (widest case)
      const total = nw + lw;
      const x0 = x - total / 2;
      label(num, x0, y, 21, col);
      tracked(n === 1 ? 'TURN' : 'TURNS', x0 + nw + 6, y - 1, 10, T.textMute);
      return { x: x0, y: y - 18, w: total, h: 24 };
    }
    tracked(n === 1 ? 'TURN TO THE LINE' : 'TURNS TO THE LINE', x, y, 10, T.textMute);
    label(num, x, y + 26, 22, col);
    // The real inked extent: label cap-height above the baseline through to the
    // numeral's descender. Reported honestly, or the detector checks a fiction.
    return { x: x, y: y - 11, w: 150, h: 42 };
  }

  function lvlPill() {
    const txt = 'LVL ' + state.level;
    const w = UI.pillWidth(ctx, txt);
    // Recorded, not registered as a control: it is a read-out and must not be
    // pressable, but the fit check still needs to know where it sits.
    L.hit.lvlPill = UI.drawPill(ctx, txt, L.lvl.cx - w / 2, L.lvl.cy, { w: w });
  }

  /* The desktop read-out: right-aligned in the header band, opposite the
     controls, exactly as bloom and fold do it. The legend that used to live in
     a right-hand column has moved into the rules card — it is reference, and
     reference does not need to be on screen during play. */
  function drawSideDesktop() {
    const rx = LW - L.sidePad, cy = L.ctrlCy;
    const live = turn ? (turn.count - turn.fired) + turn.balls.filter(b => b.live).length : state.balls;
    const n = S.turnsToLine(state);
    const turnCol = n <= 1 ? T.accentText : n <= 3 ? T.accent2 : 'rgba(255,255,255,0.72)';

    // Line one: the run's state, in the fleet's voice.
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = '600 15px Inter, sans-serif';
    const tail = n + (n === 1 ? ' turn to the line' : ' turns to the line');
    const head = 'Level ' + state.level + '   ·   × ' + live + ' balls   ·   ';
    const tw = ctx.measureText(tail).width;
    ctx.fillStyle = turnCol; ctx.fillText(tail, rx, cy - 13);
    ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.fillText(head, rx - tw, cy - 13);

    // Line two: the number the game is actually about.
    ctx.font = '800 22px Inter, sans-serif';
    const sTxt = commas(liveScore());
    const sw = ctx.measureText(sTxt).width;
    ctx.fillStyle = T.text; ctx.fillText(sTxt, rx, cy + 15);
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = T.textMute;
    const bTxt = 'BEST ' + commas(best);
    ctx.fillText(bTxt, rx - sw - 12, cy + 15);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    L.readoutLeft = rx - sw - 12 - ctx.measureText(bTxt).width;
  }

  function drawControls() {
    const muted = sfx ? !sfx.isOn() : false;
    const put = (id, box) => { L.hit[id] = box; };

    if (MODE === 'mobile') {
      const m = Math.min(20, Math.round(LW * 0.05));
      const cy = L.barY;
      const mb = UI.drawPill(ctx, '', m + UI.PILL.iconW / 2, cy, { w: UI.PILL.iconW });
      speaker(m + UI.PILL.iconW / 2, cy, !muted);
      put('mute', mb);

      const wR = UI.pillWidth(ctx, 'RESTART');
      const wU = UI.pillWidth(ctx, 'RULES');
      const rightEdge = LW - m;
      const rb = UI.drawPill(ctx, 'RESTART', rightEdge - wR / 2, cy, { w: wR });
      put('restart', rb);
      const ub = UI.drawPill(ctx, 'RULES', rightEdge - wR - UI.PILL.gap - wU / 2, cy, { w: wU });
      put('rules', ub);
    } else {
      // A row at the left of the header band, the house pattern.
      const cy = L.ctrlCy, gap = UI.PILL.gap;
      let x = L.sidePad;
      const mb = UI.drawPill(ctx, '', x + UI.PILL.iconW / 2, cy, { w: UI.PILL.iconW });
      speaker(x + UI.PILL.iconW / 2, cy, !muted);
      put('mute', mb); x += UI.PILL.iconW + gap;
      const wU = UI.pillWidth(ctx, 'RULES');
      put('rules', UI.drawPill(ctx, 'RULES', x + wU / 2, cy, { w: wU })); x += wU + gap;
      const wR = UI.pillWidth(ctx, 'RESTART');
      put('restart', UI.drawPill(ctx, 'RESTART', x + wR / 2, cy, { w: wR }));
      L.controlsRight = x + wR;
    }
  }

  /* ---------- CARDS ----------
     Sized OUTSIDE the draw, and measured. Buttons are never shrunk; the type
     shrinks, and only as far as the 16px content-copy floor. Past that the card
     gives up its own size and takes the whole frame, because a card that will
     not fit is a space problem and the card is what gives way. */
  const CARD_COPY = {
    rules: [
      'Drag anywhere to aim. Release to fire the whole stream.',
      'Every hit takes one off a block. Clear a row before it reaches the red line.',
      'Your next shot fires from wherever the first ball came to rest.',
    ],
    over: [],
  };

  function wrap(text, maxW, size) {
    ctx.font = '500 ' + size + 'px Inter, sans-serif';
    const words = text.split(' ');
    const out = []; let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; }
      else line = t;
    }
    if (line) out.push(line);
    return out;
  }

  /* The piece legend. It used to sit in a desktop side column; it is reference
     rather than live state, so it belongs on the card a player opens when they
     want reference, and the playfield gets the room back. */
  function legendRows() {
    const rows = [
      ['b', 'Block', 'The number is how many hits are left'],
      ['m', 'Mirror', TUNE.mirrorHpMult > 0
        ? 'Turns the ball a right angle. Breakable, but it costs several blocks'
        : 'Turns the ball a right angle, and never breaks'],
    ];
    if (TUNE.rockChance > 0) rows.push(['r', 'Rock', TUNE.rockHpMult > 0
      ? 'Solid stone, but it can be broken'
      : 'Solid stone. It never breaks, and it never ends a run']);
    rows.push(['p', 'Pickup', 'One more ball in your stream, permanently']);
    return rows;
  }

  /* Card geometry, worked out ONCE and never inside a draw call.
     The rules card now carries a demo, the copy and the whole legend, which is
     more than fits a short frame. Rather than shrink the type past the 16px
     content floor, the body SCROLLS: the title stays, the button stays, and the
     middle is a clipped viewport. Buttons are never shrunk. */
  function cardLayout(kind) {
    const MIN_BODY = 16;
    const outerM = 12;
    let full = false;
    let W = Math.min(460, LW - 40);
    let padX = 24, padT = 20, padB = 18;
    let body = 18;
    let demoH = kind === 'rules' ? 92 : 0;

    const build = () => {
      const innerW = W - padX * 2;
      const lh = Math.round(body * 1.34);
      const items = [];
      if (kind === 'rules') {
        if (demoH) items.push({ t: 'demo', h: demoH + 14 });
        for (const c of CARD_COPY.rules) {
          const lines = wrap(c, innerW, body);
          items.push({ t: 'copy', lines: lines, lh: lh, h: lines.length * lh + 10 });
        }
        items.push({ t: 'label', text: 'THE PIECES', h: 30 });
        for (const row of legendRows()) {
          const sub = wrap(row[2], innerW - 52, 13);
          items.push({ t: 'piece', row: row, sub: sub, h: Math.max(40, 20 + sub.length * 17) + 10 });
        }
      } else {
        items.push({ t: 'stats', h: 118 });
      }
      let contentH = 0;
      for (const it of items) contentH += it.h;
      return { items: items, contentH: contentH, lh: lh,
               titleH: 22, ctaH: UI.CTA.h, gapBefore: 18 };
    };

    let b = build();
    const availH = LH - outerM * 2;
    const chrome = () => padT + b.titleH + b.gapBefore + b.ctaH + padB;

    /* SCROLLING CHANGES THE LADDER. The old order dropped the demo first, then
       shrank the type. That was right when the only way to fit was to give
       something up — but it meant the card silently lost the one thing that
       teaches the mirror rule, which is the whole reason the demo exists.
       With a scrolling body nothing has to be given up: the card takes what
       height it can and the rest scrolls. Type never shrinks, the demo never
       goes, and the button is never touched.
       The narrow-frame fallback stays, because a card narrower than about 300
       leaves the copy unreadable however far it scrolls. */
    if (W < 300 && LW - outerM * 2 > W) {
      full = true;
      W = LW - outerM * 2; padX = Math.min(28, W * 0.08); padT = 16; padB = 14;
      b = build();
    }
    void MIN_BODY;   // the floor is now guaranteed by never shrinking at all

    const H = Math.min(chrome() + b.contentH, availH);
    const x = Math.round((LW - W) / 2);
    const y = Math.round((LH - H) / 2);
    const viewTop = y + padT + b.titleH;
    const ctaCy = y + H - padB - b.ctaH / 2;
    const ctaTop = ctaCy - b.ctaH / 2;
    const viewH = Math.max(40, ctaTop - b.gapBefore - viewTop);
    const maxScroll = Math.max(0, b.contentH - viewH);

    return {
      kind: kind, x: x, y: y, w: W, h: H, padX: padX, padT: padT, padB: padB,
      body: body, demoH: demoH, items: b.items, lh: b.lh,
      title: kind === 'rules' ? 'HOW TO PLAY' : 'RUN OVER',
      viewTop: viewTop, viewH: viewH, contentH: b.contentH, maxScroll: maxScroll,
      ctaCy: ctaCy, ctaTop: ctaTop, full: full,
      contentEnd: viewTop + Math.min(b.contentH, viewH),
      gap: Math.round(ctaTop - (viewTop + Math.min(b.contentH, viewH))),
    };
  }

  function drawCard(kind, now) {
    const c = cardLayout(kind);
    cardScroll = Math.max(0, Math.min(cardScroll, c.maxScroll));
    L.cardBody = { x: c.x, y: c.viewTop, w: c.w, h: c.viewH, max: c.maxScroll };

    ctx.save();
    ctx.fillStyle = 'rgba(14,23,38,0.72)';        // --bg
    ctx.fillRect(0, 0, LW, LH);

    ctx.fillStyle = T.bgCard;
    rr(c.x, c.y, c.w, c.h, 18); ctx.fill();
    ctx.strokeStyle = T.line; ctx.lineWidth = 1;
    rr(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1, 18); ctx.stroke();

    tracked(c.title, c.x + c.padX, c.y + c.padT + 14, 13, T.textMute);

    // --- scrolling body ---
    ctx.save();
    ctx.beginPath(); ctx.rect(c.x, c.viewTop, c.w, c.viewH); ctx.clip();
    let yy = c.viewTop - cardScroll;
    const ix = c.x + c.padX;
    for (const it of c.items) {
      if (yy + it.h > c.viewTop - 40 && yy < c.viewTop + c.viewH + 40) {
        if (it.t === 'demo') drawMirrorDemo(ix, yy, c.w - c.padX * 2, it.h - 14, now);
        else if (it.t === 'copy') {
          ctx.font = '500 ' + c.body + 'px Inter, sans-serif';
          ctx.fillStyle = T.textDim;
          for (let i = 0; i < it.lines.length; i++) ctx.fillText(it.lines[i], ix, yy + i * it.lh + c.body);
        } else if (it.t === 'label') {
          tracked(it.text, ix, yy + 18, 11, T.textMute);
        } else if (it.t === 'piece') {
          const k = it.row[0], sz = 34;
          if (k === 'b') drawBlock(ix, yy, sz, 7, 7);
          else if (k === 'm') drawMirror(ix, yy, sz, 1, 0);
          else if (k === 'r') drawRock(ix, yy, sz, 0);
          else drawPickup(ix, yy, sz);
          label(it.row[1], ix + 48, yy + 14, 15, T.text);
          ctx.font = '500 13px Inter, sans-serif'; ctx.fillStyle = T.textMute;
          for (let i = 0; i < it.sub.length; i++) ctx.fillText(it.sub[i], ix + 48, yy + 31 + i * 17);
        } else if (it.t === 'stats') {
          const cx = c.x + c.w / 2;
          ctx.textAlign = 'center';
          tracked('SCORE', cx, yy + 14, 11, T.textMute, 'center');
          label(commas(state.score), cx, yy + 56, 38, T.text, 'center');
          const isBest = state.score >= best && state.score > 0;
          label(isBest ? 'NEW BEST' : 'BEST  ' + commas(best), cx, yy + 84, 15,
            isBest ? T.accent2 : T.textMute, 'center');
          label('Reached level ' + state.level, cx, yy + 108, 16, T.textDim, 'center');
          ctx.textAlign = 'left';
        }
      }
      yy += it.h;
    }
    ctx.restore();

    // A track only when there is somewhere to go, so it never claims a card
    // scrolls when it does not.
    if (c.maxScroll > 0) {
      const tx = c.x + c.w - 7, th = c.viewH;
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      rr(tx, c.viewTop, 3, th, 1.5); ctx.fill();
      const kh = Math.max(28, th * (c.viewH / c.contentH));
      const ky = c.viewTop + (th - kh) * (cardScroll / c.maxScroll);
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      rr(tx, ky, 3, kh, 1.5); ctx.fill();
    }

    const lab = kind === 'over' ? 'PLAY AGAIN' : 'GOT IT';
    L.hit[kind === 'over' ? 'again' : 'close'] =
      UI.drawCTA(ctx, lab, c.x + c.w / 2, c.ctaCy, T.accent);
    ctx.restore();
    return c;
  }

  /* The mirror rule is the one thing in this game that a still picture cannot
     teach: "it bends the ball" says nothing about WHICH WAY. So the card runs
     a loop of the simplest possible case, a ball going straight up turning a
     clean right angle, which is the whole rule in one gesture. */
  function drawMirrorDemo(x, y, w, h, now) {
    const t = ((now || 0) % 2600) / 2600;
    const s2 = Math.min(h * 0.52, w * 0.16);
    const midY = y + h * 0.30;
    const mx = x + w * 0.34, bx2 = x + w * 0.68;

    ctx.save();
    ctx.fillStyle = 'rgba(14,23,38,0.55)';
    rr(x, y, w, h, 10); ctx.fill();
    ctx.beginPath(); rr(x, y, w, h, 10); ctx.clip();

    const hit = 0.46, arrive = 0.86;
    drawMirror(mx, midY, s2, 1);
    const broken = t > arrive;
    if (!broken) drawBlock(bx2, midY, s2, 2, 2);
    else { ctx.globalAlpha = 0.25; drawBlock(bx2, midY, s2, 1, 2); ctx.globalAlpha = 1; }

    // The whole path, faint and dotted, under the moving ball. The loop carries
    // the rule, but a single frame has to carry it too: a paused tab, a reduced
    // motion setting or a screenshot all show one frame, and one frame of a
    // ball sitting on a slab says nothing about which way it leaves.
    ctx.save();
    ctx.setLineDash([2, 5]);
    ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,243,212,0.30)';
    ctx.beginPath();
    ctx.moveTo(mx + s2 / 2, y + h * 0.92);
    ctx.lineTo(mx + s2 / 2, midY + s2 / 2);
    ctx.lineTo(bx2, midY + s2 / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // A small arrowhead at the turn, pointing the way out.
    ctx.strokeStyle = 'rgba(255,243,212,0.55)'; ctx.lineWidth = 1.8;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const ax2 = mx + s2 * 0.5 + 16, ay2 = midY + s2 / 2;
    ctx.beginPath();
    ctx.moveTo(ax2 - 5, ay2 - 4); ctx.lineTo(ax2, ay2); ctx.lineTo(ax2 - 5, ay2 + 4);
    ctx.stroke();
    ctx.restore();

    let px, py;
    if (t < hit) {
      const k = t / hit;
      px = mx + s2 / 2;
      py = (y + h * 0.92) + (midY + s2 / 2 - (y + h * 0.92)) * k;
    } else if (t < arrive) {
      const k = (t - hit) / (arrive - hit);
      px = (mx + s2 / 2) + (bx2 - (mx + s2 / 2)) * k;
      py = midY + s2 / 2;
    } else { px = bx2; py = midY + s2 / 2; }
    if (t < arrive) drawBall(px, py, 5.5);

    ctx.restore();
  }

  // ---------- LOOP ----------
  function frame(now) {
    if (state) {
      const dt = Math.min(0.05, Math.max(0, (now - (frame.last || now)) / 1000));
      frame.last = now;

      if (descend > 0) {
        descend -= dt * 4.6;
        if (descend <= 0) { descend = 0; }
      }

      if (turn && !turn.done) {
        // Long turns are the genre's main frustration, so the clock ramps once
        // a turn passes the threshold. This is PRESENTATION: the simulation
        // still advances in the same fixed steps and the outcome is unchanged.
        const scale = (turn.t >= TUNE.fastForwardAfter ? TUNE.fastForwardScale : 1) * FLAG.fast;
        acc += dt * scale;
        let steps = 0;
        const cap = 4000;
        while (acc >= TUNE.simDt && steps < cap) {
          S.stepTurn(state, turn, TUNE.simDt);
          acc -= TUNE.simDt; steps++;
          if (turn.done) break;
        }
        if (steps >= cap) acc = 0;
        drainEvents();
        if (turn.done) endTurn();
      } else if (FLAG.bot && !turn && descend <= 0 && !state.over && !card) {
        fireTurn(botAngle());
      }

      render(now);
    }
    requestAnimationFrame(frame);
  }

  // ---------- QC HOOK ----------
  // A card is not fixed until something can measure it, and a layout that only
  // exists during a paint cannot be swept. Everything a check needs is here.
  window.__RICOCHET_QC = {
    mode: MODE,
    tile: () => TILE_STYLES[tileStyle],
    openCard: () => card,
    setCard: (k) => { card = k; cardScroll = 0; onResize(); render(performance.now()); return card; },
    scroll: (v) => { cardScroll = v; render(performance.now()); return cardScroll; },
    hits: () => Object.fromEntries(Object.entries(L.hit).map(([k, b]) => [k, [b.x, b.y, b.w, b.h]])),
    frame: () => ({ LW, LH, dpr: window.devicePixelRatio || 1 }),
    layout: () => ({
      mode: MODE, LW, LH, cell: L.cell, scale: L.scale,
      bx: L.bx, by: L.by, bw: L.bw, bh: L.bh,
      dangerY: L.dangerY, launchY: L.launchY, hudH: L.hudH,
      cols: TUNE.cols, rows: TUNE.rows,
    }),
    card: (kind) => {
      const c = cardLayout(kind || 'rules');
      return {
        kind: c.kind, x: c.x, y: c.y, w: c.w, h: c.h,
        bodySize: c.body, demoH: c.demoH, fullFrame: c.full,
        contentEnd: c.contentEnd, ctaTop: c.ctaTop, gap: c.gap,
        fitsFrame: c.h <= LH - 20 && c.w <= LW - 20,
        copyClearsButton: c.gap >= 8,
        bodyAtOrAboveFloor: c.body >= 16,
        contentH: c.contentH, viewH: c.viewH, maxScroll: c.maxScroll,
        scrolls: c.maxScroll > 0,
        // Everything is reachable either because it fits or because it scrolls.
        allContentReachable: c.contentH <= c.viewH || c.maxScroll > 0,
      };
    },
    // Does anything the player must press, or read, land outside the canvas or
    // under something else? One assertion, run over a swept grid of viewports.
    fit: () => {
      const problems = [];
      const boxes = Object.entries(L.hit).filter(([id]) => !NOT_A_BUTTON[id]);
      for (const [id, b] of boxes) {
        if (b.x < 0 || b.y < 0 || b.x + b.w > LW || b.y + b.h > LH) problems.push('offscreen:' + id);
        if (b.h < UI.PILL.h - 0.5) problems.push('shrunk:' + id);
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i][1], b = boxes[j][1];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
          problems.push('overlap:' + boxes[i][0] + '/' + boxes[j][0]);
      }
      if (L.by < L.hudH - 0.5) problems.push('board-under-hud');
      // The turns read-out shares the HUD strip with the score on its left and
      // the level pill on its right, and the score grows a digit every decade.
      // Desktop: the right column stacks a legend that GROWS with the piece
      // count on top of a read-out. Nothing was watching that seam.
      // Desktop: controls and the read-out now share ONE row, so the seam that
      // matters is between them, and it moves whenever the score gains a digit
      // or the level read-out gets longer.
      if (MODE === 'desktop') {
        if (L.controlsRight && L.readoutLeft && L.readoutLeft < L.controlsRight + 16)
          problems.push('readout-collides-controls');
        if (L.by < L.band) problems.push('board-under-header');
        if (L.launchY + 12 > LH) problems.push('launcher-past-frame');
        // The whole point of the wider desktop board is that it FILLS the
        // frame. If a future change quietly stops it doing that, say so.
        const fillPct = L.bw / (LW - 60);
        if (fillPct < 0.85) problems.push('board-leaves-gutter:' + Math.round(100 - fillPct * 100) + '%');
      }
      if (MODE === 'mobile' && L.turnsBox) {
        const b = L.turnsBox;
        if (b.x < L.scoreRight + 8) problems.push('turns-collides-score');
        if (L.hit.lvlPill && b.x + b.w > L.hit.lvlPill.x - 8) problems.push('turns-collides-lvl');
        if (b.x < 0 || b.x + b.w > LW) problems.push('turns-offscreen');
      }
      if (MODE === 'mobile' && L.launchY + 30 > L.barY - UI.PILL.h / 2) problems.push('launcher-under-controls');
      if (L.bx < 0 || L.bx + L.bw > LW) problems.push('board-wider-than-frame');
      if (L.by + L.bh > LH) problems.push('board-taller-than-frame');
      if (L.cell < 20) problems.push('cell-too-small:' + L.cell.toFixed(1));
      return { ok: problems.length === 0, problems, cell: L.cell };
    },
    state: () => state && ({ seed: state.seed, level: state.level, score: state.score, balls: state.balls, over: state.over,
                             rows: state.rows.length, turn: turn ? { t: turn.t, done: turn.done, hp: turn.hpDestroyed } : null }),
    // A hidden preview pane reports innerWidth 0 and never fires rAF, so a
    // check that waits for the game to play itself waits for ever. These two
    // advance and paint on demand, with no animation frame involved.
    advance: (n) => { fastForward(n || 1); render(performance.now()); return window.__RICOCHET_QC.state(); },
    paint: () => { onResize(); render(performance.now()); return { LW: LW, LH: LH }; },
    sim: S,
  };

  // ---------- BOOT ----------
  setCanvasVars();
  resizeCanvas();
  fitFullscreen();
  resizeCanvas();
  layout();
  newRun();
  if (FLAG.start) fastForward(FLAG.start);
  try { if (!localStorage.getItem(SEEN_KEY) && !FLAG.start && !FLAG.bot) card = 'rules'; } catch (_) {}

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', onResize);
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);   // iOS URL-bar collapse
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  requestAnimationFrame(frame);
})();
