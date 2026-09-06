/* ============================================================
   Junction · A Zamborin Game — the yard (milestone 1)
   ============================================================

   The rules are in model.js and there are none in here. This file is the
   renderer and the hands: it draws a yard, turns a drag into track, and turns
   a tap into a switch. Everything it knows about what a train does, it asks.

   TWO LAYOUTS, NOT ONE SCALED. A square grid is the one board shape that fits
   both frames without reflowing, which is why the brief specifies one, so the
   difference between the layouts is where the PAPERWORK goes. Portrait carries
   no panel at all: the controls are a row in the top band, the yard is the
   whole screen under it, and the queue is on the board itself — the next
   engine out of each shed stands in its own doorway. Landscape, which includes
   the 760x600 desktop frame and a phone turned sideways, floats a panel on the
   field with the queue in it. Same level, same budget, same square.

   AND THE BOARD IS SIZED TO THE FIELD, not the field to the board. A fixed
   7x7 covered 60% of the desktop field and 48% of a phone's, and measuring
   twelve shapes showed the best any single one manages on BOTH is about 53%:
   the two frames have opposite aspects, so filling one empties the other.
   Scenery was tried in the gap first and the owner was right to reject it —
   "I mean that it should be playable, not filled with decorative elements".

   So the authored level is a CORE and the board is the core padded out with
   real cells until the field is full: 9x7 on the desktop frame, 7x12 on a
   phone, both about 82%, from one 7x7 puzzle. The cell size still comes from
   the core, so the pieces never get smaller — there are simply more of them.
   M.padLevel holds the rules that keep it the same puzzle, and the one that
   matters is that a wall which reached the edge still reaches it.

   COLOURS. Chrome takes tokens and nothing else. The yard itself is game art
   and carries the brief's palette, with one deliberate departure: the brief
   asks for the junction ring in --brand powder blue, and DESIGN-SYSTEM 1.4
   reserves --brand for the wordmark. The ring is brass instead, which is what
   the brief's own prose calls it ("a small brass ring", "a soft brass click"),
   reads warm against steel rails, and restates no chrome colour.
*/
(() => {
  'use strict';

  const M = window.JUNCTION_MODEL;
  const ART_SRC = window.JUNCTION_ART;
  const UI = window.ZAM_UI;
  const { N, E, S, W, opp } = M;

  // ---------- MODE ----------
  // A browser can report a 0-wide viewport on the first frame. The obvious
  // `innerWidth < 768` then reads as a phone, MODE is locked for the session,
  // and a desktop player is left on the phone layout for good.
  const MODE = (matchMedia('(pointer: coarse)').matches ||
                (window.innerWidth > 0 && window.innerWidth < 768))
    ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);

  /* Reduced motion, and a way to CHECK it. The media query cannot be flipped
     from a test harness, so a reduced-motion promise is otherwise only ever
     verified by reading the code, which is how a promise quietly stops being
     true. `?motion=reduce` forces the same path. */
  const rmq = matchMedia('(prefers-reduced-motion: reduce)');
  const forceReduce = new URLSearchParams(location.search).get('motion') === 'reduce';
  const reduced = () => forceReduce || rmq.matches;

  // ---------- TOKENS ----------
  // Canvas cannot read CSS variables, so shared/tokens.css is restated here
  // and nowhere else. Every one of these is chrome.
  const TOK = {
    bg: '#0E1726', bgCard: '#131F36', bgPanel: '#1A2A45',
    text: '#FFFFFF',
    ink92: 'rgba(255,255,255,0.92)', ink90: 'rgba(255,255,255,0.90)',
    ink82: 'rgba(255,255,255,0.82)', ink72: 'rgba(255,255,255,0.72)',
    tint03: 'rgba(255,255,255,0.03)', tint07: 'rgba(255,255,255,0.07)',
    tint10: 'rgba(255,255,255,0.10)', tint12: 'rgba(255,255,255,0.12)',
    tint40: 'rgba(255,255,255,0.40)',
    accent: '#C24A39', accentText: '#FF6B5C', green: '#5DD39E', accent2: '#FFD23F',
    scrim: 'rgba(10,16,28,0.88)', scrimWin: 'rgba(10,16,28,0.82)',
  };

  /* GAME ART, and only game art: the yard and the toys in it. A model railway
     at night, lit by one warm lamp high and to the left. */
  const ART = {
    rail: '#9FB0C8',
    railHot: '#D7E2F0',
    tie: 'rgba(90,106,132,0.55)',
    ghost: 'rgba(176,224,230,0.40)',
    brass: '#D8B36A',
    brassDeep: '#8C6C33',
    // the point boss: warm iron, so it is a machine on the track, not a hole in it
    iron: '#3B342B',
    /* The brief calls these "cool grey" and then gives #57534C / #3A3733,
       which are warm. Painted, they came out the brightest thing on the board
       and read as tan boulders in daylight against a blue field, pulling the
       eye to the obstacles rather than the rails. Taken at the word rather
       than the number, and darkened: an obstacle should sit back. */
    rockHi: '#5F6675', rockLo: '#343945', rockRim: '#8E97A6',
    archMouth: '#0A0F19',
    win: 'rgba(214,236,255,0.75)',
    steam: '214,226,244',
    /* Measured, not chosen: 3:1 against the lightest corner of the felt needs
       a relative luminance of about 0.193, and the #55647F this started as
       came out at 1.98:1. The DARK stop of the gradient is the one that has to
       clear the bar, not the light one, or the sides of the face fail while
       its head passes. 3.11:1 at the bottom, 4.3:1 at the top, both still
       under the rails at 5.7:1, so a portal never out-shouts the track. */
    stone: '#767F92', stoneHi: '#949DAE',
  };

  /* Engine enamel. Lightness as well as hue separates them, and each carries
     an engraved mark that its shed carries too, so colour is never the only
     channel. */
  const ENGINE = [
    { key: 'coral',  hi: '#E86A55', lo: '#A83E2A', mark: 'dot' },
    { key: 'amber',  hi: '#E8B44C', lo: '#A67716', mark: 'bar' },
    { key: 'teal',   hi: '#4FC9B0', lo: '#1E7E6C', mark: 'chevron' },
    { key: 'violet', hi: '#B48CE8', lo: '#7A4FB0', mark: 'ring' },
  ];

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
    fitFullscreen(); resizeCanvas(); layout(); draw();
  }

  // ---------- AUDIO ----------
  // gain 2.4: the fleet is mixed about 4x too quiet, and a muted game has no
  // sound at all rather than quiet sound.
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zam.junction.sfx', gain: 2.4 }) : null;
  const play = (n) => { try { if (sfx) sfx.play(n); } catch (_) { /* audio never breaks play */ } };
  let lastTick = 0;

  // ---------- PORTAL ----------
  // Harmless when there is none, which is every visit to zamborin.com.
  const portalSdk = window.ZAM_PORTAL;
  if (portalSdk) {
    portalSdk.init({
      onPause: () => {}, onResume: () => draw(),
      isMuted: () => (sfx ? !sfx.isOn() : false),
      setMuted: (m) => { if (sfx) sfx.setOn(!m); },
    });
  }

  // ---------- ANALYTICS ----------
  const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){},
                 levelRestart(){}, hintUsed(){}, track(){} };
  const T = () => (window.ZAM_TRACK || NOOP);
  T().init('junction');

  // ---------- PROGRESS ----------
  // Wrapped throughout: a browser in private mode throws on both getItem and
  // setItem, and a game that cannot save must still be a game that runs.
  const SAVE_KEY = 'zam.junction.progress';
  let save = { v: 1, max: 1, seen: false };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) { const o = JSON.parse(raw); if (o && o.v === 1) save = { v: 1, max: o.max | 0 || 1, seen: !!o.seen }; }
  } catch (_) {}
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) {} };

  // ---------- STATE ----------
  /* THE CORE IS THE PUZZLE; `level` IS THE BOARD IT IS SHOWN ON. They are the
     same object until a frame turns out to have room for more cells, at which
     point `level` becomes the core padded out to fill it. Everything that
     plays the game reads `level`; only the code that CHOOSES a level, and
     layout(), touch `core`. */
  let core = M.getLevel(1);
  let level = core;
  let track = M.newTrack(level.size);
  let run = null;
  let history = [];                 // undo: whole-track snapshots, small and safe
  let phase = 'rules';              // 'rules' | 'play' | 'win'
  let started = false;
  let releases = 0;
  let winAt = 0, cardScroll = 0, demoT0 = 0;
  const WIN_HOLD = 1700;      // the arches get to light before the card arrives
  let flash = null;                 // { i, at, from, to } the switch showing its answer
  let tapMark = null;               // { i, at } the "tap again to lift" pulse
  let stroke = null;                // { path, ok, cost, preview }
  const L = { hit: {}, g: { ox: 0, oy: 0, cell: 44, R: 7, C: 7 } };

  const cellsOf = (i) => ({ r: M.rowOf(level, i), c: M.colOf(level, i) });
  const sleepersUsed = () => M.sleepers(track);
  const running = () => !!run && !run.settled;

  function pushHistory() {
    history.push(M.cloneTrack(track));
    if (history.length > 300) history.shift();
  }

  // ---------- BANDS ----------
  /* One top band in BOTH layouts: the controls sit left in it and, in
     landscape, the read-out sits right in it on the same centre line. Portrait
     keeps them at the top too, which is a deliberate departure from the
     thumb-reach rule and is written up at the portrait branch of layout(). */
  const SIDE_PAD = 30;
  /* WHICH LAYOUT, and it is chosen by whether it FITS as well as by shape. A
     frame shorter than STACK_MIN_H has no room to stack a board over a line of
     numbers, so it takes the landscape arrangement whatever its aspect — 500
     and not higher, because 320x568 is the smallest phone still in service and
     it must stay portrait.

     THIS RULE ONCE NEEDED A WIDTH GUARD AS WELL, and the reason it no longer
     does is worth keeping. While landscape floated a fixed 240-wide panel on
     the field, a 340x480 frame passed the height test, went landscape, could
     not seat the panel and collapsed the board to the 8px floor. With the
     panel gone the only furniture left is the action pill, and layout() moves
     it to the bottom margin — and, failing that, buys its room out of the
     board's height — so landscape degrades instead of collapsing: that same
     340x480 frame now lays a 36px cell. Measured, not assumed; the sweep in
     _sweep.html walks 320..560 wide and asserts each frame really is the size
     it asked for. */
  const STACK_MIN_H = 500;
  const wide = () => LW >= LH * 1.15 || LH < STACK_MIN_H;
  /* ONE ROW OF CHROME AT EACH END, which is how the rest of the fleet is
     built. Bloom, Sluice and Comb all carry a topBand and a botBand and put
     the controls at thumb height on a phone; Junction had every button in a
     two-row band at the top, which the owner called terrible and which is also
     twice as much chrome as the fleet spends.

     The controls stay at the TOP here — that was the owner's own instruction
     and it is a deliberate departure from DESIGN-SYSTEM 2.1 — but the button
     and the numbers go back to the foot, where the sketch put them. */
  const topBand = () => 64;
  const botBand = () => (wide() ? 0 : 76);
  /* The board's own margin in portrait, and it is NOT SIDE_PAD. Band content
     still gets 30 because type needs a margin; a board does not, and on a
     phone the board is bound by width, so this number IS the cell size. */
  const BOARD_PAD = 6;

  /* The one button is a PILL, not a CTA, and that is a deliberate reading of
     4.1 rather than a breach of it. The rule is that buttons come from ZAM_UI
     at ZAM_UI sizes and are never scaled per game; a pill IS a ZAM_UI size, the
     same 40px tall as Undo beside it and as every pill in the fleet. What it
     borrows from the CTA is the accent fill, so it still reads as the one thing
     to press. The owner asked for it "much smaller and on the green", and a
     210x50 slab floating on grass is a poster, not a control.

     It is measured on the WIDEST of its three labels, so pressing it does not
     change its size under the finger that is on it. */
  const ACTION_LABELS = ['DISPATCH', 'HALT', 'RESET'];
  function actionW() {
    let w = 0;
    for (const t of ACTION_LABELS) w = Math.max(w, UI.pillWidth(ctx, t));
    return w;
  }

  /* THE GRID SHAPE COMES FROM THE BREAKPOINT. Every other game on the site
     does this and says why in its own margin — Bloom: "a square is bounded by
     the HEIGHT, so no amount of reclaimed chrome widens it; the extra space
     just becomes bigger margins. A grid two columns wider than it is tall
     fills the frame AND is more puzzle."

     Junction was padding one 7x7 core onto both frames, which fills the field
     with cells but leaves the PUZZLE a small square in the middle of them. So
     the level is built to the shape instead: seven columns and as many ranks
     as a phone will hold, seven ranks and as many files as the desktop frame
     will hold. Par follows the geometry — 15 sleepers at 7x7, 27 at 7x13, 21
     at 7x10 — so a bigger board is more track to lay, not more lawn.

     ROWS ARE ODD ON A PHONE, and that is load-bearing rather than tidy: the
     wall sits at floor(R/2), and with an even count the two engines reach the
     gap on the same tick from opposite ends and deadlock. */
  function gridDims() {
    if (!L.wide) {
      const cols = 7;
      const cw = Math.max(8, (LW - BOARD_PAD * 2) / cols);
      let rows = Math.floor(Math.max(60, LH - topBand() - botBand() - 16) / cw);
      rows = Math.max(5, Math.min(rows, 15));
      if (rows % 2 === 0) rows -= 1;
      return [rows, cols];
    }
    const rows = 7;
    const ch = Math.max(8, (LH - topBand() - 6 - 18 - 28) / rows);
    return [rows, Math.max(7, Math.min(Math.floor((LW - 44 - 28) / ch), 13))];
  }

  /* Build the board at that shape. A shape change is a genuinely different
     board — not the same one padded — so the track goes with it, the way a
     new level would. Turning a phone is the only thing that does this. */
  function reshape(R, C) {
    // Only the parametric level follows the frame. A hand-authored board — the
    // tier-5 demo — keeps the shape it was written at, and asking to reshape it
    // every frame would wipe the player's track every frame.
    if (core.n !== 1) return;
    if (level.R === R && level.C === C) return;
    core = level = M.level1(R, C);
    track = M.newTrack(level.size);
    history = []; run = null; winAt = 0;
    if (phase === 'win') phase = 'play';
  }

  function layout() {
    L.wide = wide();
    L.hit = {};
    L.plan = null;
    L.yard = null;
    const bw = actionW(), bh = UI.PILL.h;
    L.actW = bw; L.actH = bh;
    L.ctrlCy = Math.round(topBand() / 2);
    let box;
    if (L.wide) {
      /* LANDSCAPE KEEPS ONE BAND and everything in it — controls left, numbers
         and the button right — which is the fleet's HUD rule, and it leaves the
         field entirely to the board. */
      const m = 22;             // the field's inset from the frame
      L.field = { x: m, y: topBand() + 6, w: LW - m * 2, h: LH - topBand() - 6 - 18, r: 18 };
      const pad = 14;
      box = { x: L.field.x + pad, y: L.field.y + pad,
              w: Math.max(60, L.field.w - pad * 2), h: Math.max(60, L.field.h - pad * 2) };
      L.actCx = Math.round(LW - SIDE_PAD - bw / 2);
      L.actCy = L.ctrlCy;
      L.footY = L.ctrlCy;
    } else {
      /* PORTRAIT HAS A BAND AT EACH END. The controls are at the top, which is
         the owner's own departure from the thumb-reach rule; the numbers and
         DISPATCH are at the foot, which is where the sketch put them and where
         the primary action belongs on a phone. Neither sits on the grass, so
         the field between them is all board. */
      L.field = { x: 0, y: topBand(), w: LW, h: LH - topBand() - botBand(), r: 0 };
      box = { x: BOARD_PAD, y: L.field.y + 8, w: Math.max(60, LW - BOARD_PAD * 2),
              h: Math.max(60, L.field.h - 16) };
      L.footY = Math.round(LH - botBand() / 2);
      L.actCx = Math.round(LW - 18 - bw / 2);
      L.actCy = L.footY;
    }
    /* Build the board to the shape this frame wants, THEN size the cell to it.
       The cell is the largest that seats the whole grid in the box; there is
       no coverage search any more because there is nothing left to search —
       the grid was chosen to fit the box in the first place. */
    const dims = gridDims();
    reshape(dims[0], dims[1]);
    const R = level.R, C = level.C;
    const cell = Math.max(8, Math.floor(Math.min(box.w / C, box.h / R)));
    L.g = {
      ox: Math.round(box.x + (box.w - C * cell) / 2),
      oy: Math.round(box.y + (box.h - R * cell) / 2),
      cell, R, C,
    };
    /* WHERE THE NUMBERS GO IS A LAYOUT DECISION, not a drawing one, because
       the scenery has to know it too: a tree is only kept off the read-out if
       the read-out's position is settled before the board paints. bandPlan
       needs nothing but LW, L.wide and the canvas fonts, so it can answer
       here. */
    L.plan = bandPlan();
    L.readoutY = (L.wide && L.plan.inBand) ? L.ctrlCy : L.footY;
  }

  // ---------- GEOMETRY ----------
  // Everything here takes an explicit geometry so the rules card's looping
  // demo can draw a second, smaller yard with the same code.
  const cellX = (g, c) => g.ox + c * g.cell;
  const cellY = (g, r) => g.oy + r * g.cell;
  function cellRect(g, i) {
    const r = (i / g.C) | 0, c = i % g.C;
    return { x: cellX(g, c), y: cellY(g, r), s: g.cell };
  }
  function sideMid(g, i, s) {
    const b = cellRect(g, i), h = b.s / 2;
    if (s === N) return { x: b.x + h, y: b.y };
    if (s === E) return { x: b.x + b.s, y: b.y + h };
    if (s === S) return { x: b.x + h, y: b.y + b.s };
    return { x: b.x, y: b.y + h };
  }
  const cellCentre = (g, i) => {
    const b = cellRect(g, i);
    return { x: b.x + b.s / 2, y: b.y + b.s / 2 };
  };

  /* A cell traversal as a drawable, walkable path. A straight is a line
     through the centre; a curve is a quarter arc about the corner the two
     sides share, which is shorter than the straight, so an engine reads as
     easing through a bend for free. */
  function pathOf(g, i, a, b) {
    if (opp(a) === b) {
      const p0 = sideMid(g, i, a), p1 = sideMid(g, i, b);
      return { kind: 'line', x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y };
    }
    const box = cellRect(g, i), h = box.s / 2;
    const cx = (a === E || b === E) ? box.x + box.s : (a === W || b === W) ? box.x : box.x + h;
    const cy = (a === N || b === N) ? box.y : (a === S || b === S) ? box.y + box.s : box.y + h;
    const p0 = sideMid(g, i, a), p1 = sideMid(g, i, b);
    let a0 = Math.atan2(p0.y - cy, p0.x - cx);
    let a1 = Math.atan2(p1.y - cy, p1.x - cx);
    let d = a1 - a0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return { kind: 'arc', cx, cy, r: h, a0, a1: a0 + d };
  }
  function pointOn(d, t) {
    if (d.kind === 'line') return { x: d.x0 + (d.x1 - d.x0) * t, y: d.y0 + (d.y1 - d.y0) * t };
    const a = d.a0 + (d.a1 - d.a0) * t;
    return { x: d.cx + Math.cos(a) * d.r, y: d.cy + Math.sin(a) * d.r };
  }
  function headingOn(d, t) {
    if (d.kind === 'line') return Math.atan2(d.y1 - d.y0, d.x1 - d.x0);
    const a = d.a0 + (d.a1 - d.a0) * t;
    return a + (d.a1 > d.a0 ? Math.PI / 2 : -Math.PI / 2);
  }
  // Off the ends, carry straight on. A train's body trails behind its nose and
  // the tail of it is in the cell before.
  function posOn(d, t) {
    if (t >= 0 && t <= 1) return pointOn(d, t);
    const edge = t < 0 ? 0 : 1;
    const p = pointOn(d, edge), h = headingOn(d, edge);
    const over = (t - edge) * (d.kind === 'line'
      ? Math.hypot(d.x1 - d.x0, d.y1 - d.y0)
      : Math.abs(d.a1 - d.a0) * d.r);
    return { x: p.x + Math.cos(h) * over, y: p.y + Math.sin(h) * over };
  }

  function pathFor(g, t) {
    const out = t.outSide >= 0 ? t.outSide : opp(t.inSide);
    return pathOf(g, t.cell, t.inSide, out);
  }

  // ---------- PAINTING THE TRACK ----------
  function railStroke(d, off, w, colour) {
    ctx.strokeStyle = colour; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath();
    if (d.kind === 'line') {
      const h = Math.atan2(d.y1 - d.y0, d.x1 - d.x0);
      const nx = Math.cos(h + Math.PI / 2) * off, ny = Math.sin(h + Math.PI / 2) * off;
      ctx.moveTo(d.x0 + nx, d.y0 + ny); ctx.lineTo(d.x1 + nx, d.y1 + ny);
    } else {
      ctx.arc(d.cx, d.cy, Math.max(0.5, d.r + off), d.a0, d.a1, d.a1 < d.a0);
    }
    ctx.stroke();
  }
  /* THE BLADE RAIL. A road that is NOT set does not simply stop: its two rails
     run in from the branch and close to a point against the stock rail of the
     road that is. That taper is the single clearest thing about a real set of
     points seen from above, and drawing it costs the switch its ambiguity —
     the route that is open is the one made of continuous rail.

     Sampled rather than stroked, because the offset has to shrink along the
     path and neither lineTo nor arc can vary a normal. Twelve samples: at a
     54px cell the taper is about 18px long, so a thirteenth point would move
     nothing. Only the idle branch pays for this; ordinary track keeps the two
     flat strokes it had. */
  function railTaper(d, off, w, colour, t0, t1) {
    ctx.strokeStyle = colour; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath();
    const n = 12;
    for (let k = 0; k <= n; k++) {
      const t = t0 + (t1 - t0) * (k / n);
      const p = pointOn(d, t), a = headingOn(d, t) + Math.PI / 2;
      const s = off * (k / n);
      const x = p.x + Math.cos(a) * s, y = p.y + Math.sin(a) * s;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /* SLEEPERS, and they are the reason a length of track reads as track. They
     used to be translucent bars at 0.55 over a wide grey bed, which from a
     step back is a grey road with a stripe down it. They are timber now:
     opaque, dark, individually countable, each with a lit edge up and to the
     left, sitting on the ballast and carrying the rails. */
  function drawSleepers(d, cell, opts) {
    const o = opts || {};
    const half = cell * 0.18, th = cell * 0.075;
    /* SPACING IS A DISTANCE, not a fraction of a piece. Six sleepers to a cell
       put them 28% closer together on curves than on straights, because a
       quarter arc is only 0.785 of a cell long — obvious the moment anyone
       looks at a bend up close. The count follows the length instead. */
    const t0 = o.from || 0;
    const len = (d.kind === 'line'
      ? Math.hypot(d.x1 - d.x0, d.y1 - d.y0)
      : Math.abs(d.a1 - d.a0) * d.r) * (1 - t0);
    const n = Math.max(2, Math.round(6 * len / cell));
    /* Two strokes with round caps rather than two rotated rounded rects with a
       save and a restore around each: same timber, a third of the cost, and
       the sleepers are drawn six times per segment on every piece of track on
       the board. The lit edge goes down first and the timber sits over it,
       offset toward the shadow, so the light stays up and left. */
    ctx.lineCap = 'round';
    ctx.globalAlpha = o.dim ? 0.55 : 1;
    for (let k = 0; k < n; k++) {
      const t = t0 + (1 - t0) * ((k + 0.5) / n);
      const p = pointOn(d, t), a = headingOn(d, t) + Math.PI / 2;
      const dx = Math.cos(a) * half, dy = Math.sin(a) * half;
      ctx.strokeStyle = TRACK.sleeperLit; ctx.lineWidth = th;
      ctx.beginPath();
      ctx.moveTo(p.x + dx, p.y + dy); ctx.lineTo(p.x - dx, p.y - dy); ctx.stroke();
      ctx.strokeStyle = o.hot ? TRACK.sleeperHot : TRACK.sleeper;
      ctx.lineWidth = th * 0.74;
      ctx.beginPath();
      ctx.moveTo(p.x + dx + 0.6, p.y + dy + 0.7); ctx.lineTo(p.x - dx + 0.6, p.y - dy + 0.7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* Ballast, sleepers, then the rails: the order a real length of track is
     built in, and the only order in which the steel reads as sitting on top of
     the timber rather than being painted through it. */
  function drawSegment(g, i, a, b, opts) {
    const o = opts || {};
    const d = pathOf(g, i, a, b), cell = g.cell;
    drawBallast(d, cell);
    drawSleepers(d, cell, o);
    /* The branch the switch is NOT feeding is still real rail — a train
       reaching it ALONG that branch takes it to the trunk whatever the switch
       says — so it is dimmed and closed to a point, never removed. Trailing
       through a set of points against the blade is what a real train does
       there, and this is what it looks like from above. */
    const gauge = cell * 0.105;
    const base = Math.max(1.2, cell * 0.055), core = Math.max(0.8, cell * 0.028);
    const dim = o.dim ? 0.58 : 1;
    for (const side of [-gauge, gauge]) {
      ctx.globalAlpha = dim;
      if (o.from) {
        railTaper(d, side, base, TRACK.railBase, o.from, 1);
        railTaper(d, side - base * 0.16, core, TRACK.railTop, o.from, 1);
      } else {
        railStroke(d, side, base, TRACK.railBase);
        railStroke(d, side - base * 0.16, core, o.hot ? TRACK.railHot : TRACK.railTop);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawTrackCell(g, i, c, now) {
    if (!c) return;
    if (c.segs.length === 1) { drawSegment(g, i, c.segs[0][0], c.segs[0][1]); return; }
    const trunk = M.trunkOf(c);
    const live = M.activeBranch(c), idle = M.idleBranch(c);
    const hot = flash && flash.i === i && now - flash.at < 400;
    /* 0.34 of the way in from the trunk is where the blade tips sit: far
       enough from the frog at the centre that the point is a shape and not a
       smudge, near enough that the closed road plainly belongs to this
       junction and not to the cell beyond it. */
    drawSegment(g, i, trunk, idle, { dim: true, from: 0.34 });
    drawSegment(g, i, trunk, live, { hot });
    drawSwitchStand(g, i, c, now);
  }

  /* The switch shows its answer. A brass ring at the centre of the cell with a
     lever lying along the branch it feeds, swinging over 150ms when tapped, so
     the change is something you watch rather than something you infer. Glow is
     a thin bright core with a tight feather, never a wash. */
  function drawSwitchStand(g, i, c, now) {
    const p = cellCentre(g, i), cell = g.cell;
    const r = cell * 0.118;
    const live = M.activeBranch(c);
    let ang = sideAngle(live);
    if (flash && flash.i === i && !reduced()) {
      const k = Math.min(1, (now - flash.at) / 150);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      let dA = sideAngle(flash.to) - sideAngle(flash.from);
      while (dA > Math.PI) dA -= Math.PI * 2;
      while (dA < -Math.PI) dA += Math.PI * 2;
      ang = sideAngle(flash.from) + dA * e;
    }
    const cos = Math.cos(ang), sin = Math.sin(ang);
    ctx.save();
    // A thin bright core with a tight feather, never a wash.
    const glow = ctx.createRadialGradient(p.x, p.y, r * 0.5, p.x, p.y, r * 2.4);
    glow.addColorStop(0, 'rgba(216,179,106,0.26)');
    glow.addColorStop(1, 'rgba(216,179,106,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2); ctx.fill();

    /* THE BLADE, and it is the whole point of the drawing. A lever tucked
       inside the ring measured about four pixels of brass at a 47px cell and
       could not be read at arm's length, which makes the one decision in the
       game invisible. It lies along the branch the trunk feeds instead, out
       from the ring to the edge of the cell, exactly where the point rodding
       of a real switch sits, so which way the thing points is a shape and not
       an inference. */
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x + cos * r * 0.7, p.y + sin * r * 0.7);
    ctx.lineTo(p.x + cos * cell * 0.34, p.y + sin * cell * 0.34);
    ctx.strokeStyle = ART.brassDeep; ctx.lineWidth = Math.max(2.6, cell * 0.078);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x + cos * r * 0.7, p.y + sin * r * 0.7);
    ctx.lineTo(p.x + cos * cell * 0.32, p.y + sin * cell * 0.32);
    ctx.strokeStyle = ART.brass; ctx.lineWidth = Math.max(1.4, cell * 0.040);
    ctx.stroke();

    /* THE STRETCHER BAR, across the trunk. On a real set of points one bar
       links the two blades so they move together, and from above it is the
       one part of the mechanism you can actually see. It is also what stops
       the stand reading as a bolt dropped on the track. */
    const t = sideAngle(M.trunkOf(c));
    const tc = Math.cos(t + Math.PI / 2), ts = Math.sin(t + Math.PI / 2);
    const arm = cell * 0.155;
    ctx.strokeStyle = ART.brassDeep; ctx.lineWidth = Math.max(1.8, cell * 0.046);
    ctx.beginPath();
    ctx.moveTo(p.x + tc * arm, p.y + ts * arm);
    ctx.lineTo(p.x - tc * arm, p.y - ts * arm);
    ctx.stroke();

    /* The boss is IRON, not a hole. It used to be a near-black blue disc wide
       enough to swallow both rails, which at any size above a thumbnail reads
       as a puncture in the track rather than as a machine standing on it. It
       is smaller than the gauge now, so the rails run visibly past it, and it
       is warm, so it belongs to the same metal as the fishplates. */
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = ART.iron; ctx.fill();
    ctx.strokeStyle = ART.brassDeep; ctx.lineWidth = Math.max(2, cell * 0.062); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = ART.brass; ctx.lineWidth = Math.max(1, cell * 0.028); ctx.stroke();
    // the pivot the blade turns on
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, r * 0.30), 0, Math.PI * 2);
    ctx.fillStyle = ART.brass; ctx.fill();
    ctx.restore();
  }
  const sideAngle = (s) => (s === N ? -Math.PI / 2 : s === E ? 0 : s === S ? Math.PI / 2 : Math.PI);

  // ---------- PAINTING THE YARD ----------
  /* ---------- LINESIDE SCENERY ----------
     An impassable cell is one thing to the model and several things on the
     screen. Eight of them in a row used to be eight of the same blob, which
     reads as a line of icons rather than as a piece of country, and a line of
     icons is the one thing a model railway board never looks like.

     Three ideas do the work:

     RUNS ARE FENCED, AND THE FENCE IS CONTINUOUS. Where obstacles are next to
     each other they carry a paling fence whose pickets are spaced from the
     START of the run in world pixels, not from each cell. So the fence walks
     across cell boundaries and the eye reads one boundary, not eight tiles.

     THE SCATTER IS NOT THE SAME TWICE. Every cell draws nought to three of
     tree, bush and stone, at its own offsets, sizes and silhouettes. A tree
     is three or four overlapping lobes placed by hash, so no two have the same
     outline; some fenced cells get nothing at all and let the fence show.

     ALL OF IT DETERMINISTIC. Every number comes from a hash of the cell index,
     never Math.random, so a board looks the same on every load and in every
     session, and the gate can still run the model headlessly.

     One light, up and left: bodies stay dark and the moonlit RIM carries the
     contrast, which is the same trick the stones already used and the reason
     an obstacle never out-shouts the rails. */
  /* ---------- THE GROUND ----------
     Grass and gravel rather than felt, and the green is not a taste. The rails
     are light steel, so how green the field can get is bounded by keeping the
     track legible on it: #1B3A22 holds the rails at 5.68:1 and even the
     sleepers at 3.04, and a step lighter starts taking the ties under the bar.
     It is bounded from the other side too, which is the less obvious half —
     green trees standing on green grass — and that is what sets the tree
     toning below, rather than the night. */
  const GROUND = {
    grass: '#1B3A22',
    grassLit: '#254B2E',      // the lamp, up and left, falling on the field
    grit: '#8E9A88',          // gravel catching the same light
    gritDark: '#0F1E12',
    /* The bed the track is laid on, and its crown is capped by the RAIL, not
       by the grass. Ballast wants to be pale stone; the rails are pale steel;
       and at #61615A the crown took the rails to 2.83:1 against the very thing
       they are lying on, which was plainly visible as track disappearing into
       its own bed. #565650 is the lightest crown that keeps them at 3.35. */
    ballast: '#4A4A44',
    ballastLit: '#565650',
  };

  /* THE TRACK. Steel and creosoted timber, both lit from up and left. The rail
     is two strokes, a darker body with a brighter crown offset toward the
     light, which is what makes a 3px line read as a rounded rail rather than
     as a drawn line. */
  const PANEL = { bg: '#152A20' };

  const TRACK = {
    sleeper: '#33291F', sleeperLit: '#7A6650', sleeperHot: '#8A7250',
    railBase: '#77869B', railTop: '#C9D6EA', railHot: '#F0F6FF',
  };

  /* Nothing here is a colour a tree is drawn IN any more — the trees carry
     their own, from the export. This is only the shadow they throw. */
  const SCEN = {
    shadow: 'rgba(10,26,14,0.34)',
  };

  /* THE TONING, and it is a solved number rather than a taste. The exports are
     daylight greens; the field is grass. A tree does not need darkening to sit
     in the night, it needs to stay LIGHT enough to separate from the field it
     stands on, and 0.22 is the darkest toning at which all three crowns still
     clear 3:1 against #1B3A22 — 3.76, 3.01 and 4.11. By 0.26 the darkest is
     under. 0 is the export exactly as drawn. */
  const TREE_NIGHT = 0.22;
  function h32(a, b) {
    let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
    x = (x ^ (x >>> 13)) >>> 0;
    x = Math.imul(x, 1274126177) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
  }
  const rnd = (i, k) => h32(i, k) / 4294967296;

  const isRock = (lvl, j) => j >= 0 && lvl.kind[j] === M.ROCK;
  // Which way this cell's run of obstacles lies, or null if it stands alone.
  function runAxis(lvl, i) {
    const h = (isRock(lvl, M.neighbour(lvl, i, W)) ? 1 : 0) + (isRock(lvl, M.neighbour(lvl, i, E)) ? 1 : 0);
    const v = (isRock(lvl, M.neighbour(lvl, i, N)) ? 1 : 0) + (isRock(lvl, M.neighbour(lvl, i, S)) ? 1 : 0);
    if (!h && !v) return null;
    return h >= v ? 'h' : 'v';
  }
  function runStart(lvl, i, axis) {
    const back = axis === 'h' ? W : N;
    let j = i, guard = 0;
    while (guard++ < 64) {
      const k = M.neighbour(lvl, j, back);
      if (!isRock(lvl, k)) break;
      j = k;
    }
    return j;
  }

  /* THE FIELD, painted once and kept. Gravel is a few thousand specks and not
     one of them moves, so the whole ground is rendered to an offscreen canvas
     at device resolution and blitted after that; drawing the grit every frame
     would cost more than the rest of the board put together. The fade at top
     and bottom is carved into the texture's own alpha rather than painted over
     it afterwards, because the Portal wash underneath is a gradient and no
     solid overlay can match a gradient.

     A small map rather than one slot: the rules card draws its own little yard
     with its own geometry in the same frame as the board, and a single-slot
     cache would rebuild both textures twice a frame forever. */
  const groundTex = new Map();
  function groundTexture(w, h, cell, fade) {
    const dpr = Math.max(1, canvas.width / Math.max(1, LW));
    const key = Math.round(w) + 'x' + Math.round(h) + '@' + Math.round(cell) + ':' + Math.round(fade) + '#' + dpr.toFixed(2);
    if (groundTex.has(key)) return groundTex.get(key);
    const oc = document.createElement('canvas');
    oc.width = Math.max(1, Math.ceil(w * dpr));
    oc.height = Math.max(1, Math.ceil(h * dpr));
    const x = oc.getContext('2d');
    x.scale(dpr, dpr);
    const gr = x.createLinearGradient(0, 0, w * 0.55, h);
    gr.addColorStop(0, GROUND.grassLit);
    gr.addColorStop(1, GROUND.grass);
    x.fillStyle = gr; x.fillRect(0, 0, w, h);

    // gravel, from a hash of its own position: the same field every load
    const pitch = Math.max(5, cell * 0.19);
    const cols = Math.ceil(w / pitch) + 1, rows = Math.ceil(h / pitch) + 1;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const k = r * 977 + c;
      const d = rnd(k, 403);
      if (d > 0.62) continue;
      const px = (c + rnd(k, 401)) * pitch, py = (r + rnd(k, 402)) * pitch;
      const e = rnd(k, 404);
      x.fillStyle = d < 0.24 ? hexA(GROUND.grit, 0.16 + e * 0.20)
                             : hexA(GROUND.gritDark, 0.14 + e * 0.16);
      x.beginPath(); x.arc(px, py, pitch * (0.05 + e * 0.12), 0, Math.PI * 2); x.fill();
    }
    if (fade > 0) {
      x.globalCompositeOperation = 'destination-out';
      for (const top of [true, false]) {
        const y0 = top ? 0 : h - fade;
        const fg = x.createLinearGradient(0, y0, 0, y0 + fade);
        fg.addColorStop(top ? 0 : 1, 'rgba(0,0,0,1)');
        fg.addColorStop(top ? 1 : 0, 'rgba(0,0,0,0)');
        x.fillStyle = fg; x.fillRect(0, y0, w, fade);
      }
      x.globalCompositeOperation = 'source-over';
    }
    if (groundTex.size > 6) groundTex.delete(groundTex.keys().next().value);
    groundTex.set(key, oc);
    return oc;
  }

  /* The bed the track is laid on: under the sleepers, over the field. Two
     passes, wide and dark then narrower and lighter, so it reads as a bank of
     stone with a lit crown rather than as a road with rails painted on it —
     which is what one flat 0.50-wide stroke gave. The shoulder is where the
     ballast meets the grass and it is the only edge it has. */
  function drawBallast(d, cell) {
    ctx.lineCap = 'round';
    const lay = (w, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath();
      if (d.kind === 'line') { ctx.moveTo(d.x0, d.y0); ctx.lineTo(d.x1, d.y1); }
      else ctx.arc(d.cx, d.cy, d.r, d.a0, d.a1, d.a1 < d.a0);
      ctx.stroke();
    };
    lay(cell * 0.46, GROUND.ballast);
    lay(cell * 0.34, GROUND.ballastLit);
  }

  /* ---------- THE LINESIDE ----------
     Every tree on the board is one of the owner's three drawings. The first
     pass at this used them only for the odd standalone tree and drew every
     hedgerow and bush out of overlapping circles, which is most of what is on
     screen — so the board was procedural blobs with the real art hiding in it.
     There are no circles left: a hedgerow is drawn canopies overlapping along
     the run, a bush is a small one, and the only variety comes from which of
     the three, how big, and where.

     THEY ARE NEVER ROTATED. Each drawing is already lit from the top left —
     the lighter of its two shapes sits up and to the left of the darker one —
     and turning it would turn the light with it. Scale and choice give plenty.

     LIGHT COMES FROM UP AND LEFT, so shadows fall down and right. The old halo
     of darkness under every obstacle had no direction in it at all, which is
     exactly why it read as a sticker's drop shadow rather than as light. Every
     tree now casts its own silhouette, offset, in one pass before ANY foliage
     is drawn, so a shadow never lands on top of the tree next to it. */
  const LIGHT = { dx: 0.15, dy: 0.17 };   // shadow offset, as a share of size

  /* The drawings, built once as Path2D straight from the SVG path strings, so
     no curve in them is retyped by hand and nothing is fetched at runtime. */
  const TREE_ART = (ART_SRC ? ART_SRC.TREES : []).map((t) => ({
    x: t.x, y: t.y, w: t.w, h: t.h,
    paths: t.paths.map((p) => ({
      fill: mix(p.fill, '#141F31', TREE_NIGHT),
      path: (typeof Path2D === 'function') ? new Path2D(p.d) : null,
    })),
  }));

  // Where the things in a cell stand. One list, used by the shadow pass and
  // the foliage pass, so a shadow can never drift away from its tree.
  function sceneryItems(g, i, lvl) {
    const b = cellRect(g, i), cell = b.s;
    const cx = b.x + cell / 2, cy = b.y + cell / 2;
    const axis = runAxis(lvl, i);
    const out = [];
    if (axis) {
      const horiz = axis === 'h';
      const sb = cellRect(g, runStart(lvl, i, axis));
      const base = horiz ? sb.x : sb.y;
      const a0 = horiz ? b.x : b.y;
      const cross = (horiz ? b.y : b.x) + cell / 2;
      const openBack = !isRock(lvl, M.neighbour(lvl, i, horiz ? W : N));
      const openFwd = !isRock(lvl, M.neighbour(lvl, i, horiz ? E : S));
      const lo = a0 + (openBack ? cell * 0.20 : -cell * 0.32);
      const hi = a0 + cell - (openFwd ? cell * 0.20 : -cell * 0.32);
      /* Canopies are placed from the FIRST cell of the run in world pixels, so
         they overlap across the cell boundaries into one hedgerow instead of
         restarting inside each tile. Sizes come from a hash in groups of
         three, so the line swells and thins in clumps. */
      const pitch = cell * 0.36;
      let k = Math.ceil((lo - base) / pitch);
      for (; base + k * pitch <= hi; k++) {
        const px = base + k * pitch;
        const swell = 0.74 + rnd((k / 3) | 0, 150) * 0.58;
        const s = cell * 0.54 * swell * (0.88 + rnd(k, 100) * 0.28);
        const wander = (rnd(k, 110) - 0.5) * cell * 0.26;
        out.push({ x: horiz ? px : cross + wander,
                   y: horiz ? cross + wander : px,
                   s, seed: k * 7 + 31 });
      }
    }
    const room = (side) => (isRock(lvl, M.neighbour(lvl, i, side)) ? 0.30 : 0.10);
    const spanX = [-room(W), room(E)], spanY = [-room(N), room(S)];
    const n = axis
      ? (rnd(i, 1) < 0.40 ? 0 : 1)
      : 1 + (rnd(i, 2) < 0.60 ? 1 : 0) + (rnd(i, 3) < 0.26 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const a = rnd(i, 10 + k * 5), b2 = rnd(i, 11 + k * 5), c2 = rnd(i, 12 + k * 5);
      out.push({
        x: cx + (spanX[0] + (spanX[1] - spanX[0]) * a) * cell,
        y: cy + (spanY[0] + (spanY[1] - spanY[0]) * b2) * cell * (axis ? 0.5 : 1),
        s: cell * (0.62 + c2 * 0.34) * (n > 1 ? 0.76 : 1),
        seed: i * 31 + k,
      });
    }
    return out;
  }

  /* LINESIDE BEYOND THE BOARD. A square grid on a tall phone is bound by the
     WIDTH, so the field is always much taller than the board can be and the
     grass around it was simply empty. These are decoration and nothing else:
     they stand outside the grid, no cell is under them, none of them blocks
     anything, and they keep a clear half-cell margin off the board so the edge
     of the playable yard is still obvious.

     It does not make the BOARD bigger — nothing can, while levels are square —
     but it does mean the screen is a piece of country with a railway in it
     rather than a small board on a large lawn. */
  function marginItems(g, f, avoid) {
    if (!f) return [];
    const cell = g.cell;
    const clear = [{
      x: g.ox - cell * 0.6, y: g.oy - cell * 0.6,
      w: g.C * cell + cell * 1.2, h: g.R * cell + cell * 1.2,
    }];
    /* Nothing grows over the writing. A tree behind LEVEL 1 · SLEEPERS 0 / 25
       costs the read-out its contrast for pure decoration, which is the wrong
       way round: the scenery is here to fill space the game cannot use, not to
       take space the game is using. */
    for (const a of (avoid || []))
      if (a) clear.push({ x: a.x - 10, y: a.y - 10, w: a.w + 20, h: a.h + 20 });
    const pitch = cell * 1.2;
    const cols = Math.ceil(f.w / pitch), rows = Math.ceil(f.h / pitch);
    const out = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const k = r * 131 + c;
      if (rnd(k, 501) > 0.52) continue;
      const x = f.x + (c + 0.18 + rnd(k, 502) * 0.64) * pitch;
      const y = f.y + (r + 0.18 + rnd(k, 503) * 0.64) * pitch;
      const s = cell * (0.46 + rnd(k, 504) * 0.52);
      if (x - s / 2 < f.x + 6 || x + s / 2 > f.x + f.w - 6) continue;
      if (y - s / 2 < f.y + 6 || y + s / 2 > f.y + f.h - 6) continue;
      let hit = false;
      for (const q of clear)
        if (x > q.x && x < q.x + q.w && y > q.y && y < q.y + q.h) { hit = true; break; }
      if (hit) continue;
      out.push({ x, y, s, seed: k * 17 + 5 });
    }
    return out;
  }

  function drawSceneryShadow(g, i, lvl) {
    for (const it of sceneryItems(g, i, lvl))
      drawTree(it.x + it.s * LIGHT.dx, it.y + it.s * LIGHT.dy, it.s, it.seed, true);
  }
  function drawScenery(g, i, lvl) {
    for (const it of sceneryItems(g, i, lvl)) drawTree(it.x, it.y, it.s, it.seed, false);
  }

  /* One of the three drawings, at a size, in colour or as its own shadow.
     `shadow` fills every path in one flat dark instead of its own colour,
     which is what a silhouette IS. */
  function drawTree(x, y, s, seed, shadow) {
    if (!TREE_ART.length || !TREE_ART[0].paths[0].path) return;
    const t = TREE_ART[h32(seed, 9) % TREE_ART.length];
    const k = s / Math.max(t.w, t.h);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.translate(-(t.x + t.w / 2), -(t.y + t.h / 2));
    if (shadow) {
      ctx.fillStyle = SCEN.shadow;
      for (const p of t.paths) ctx.fill(p.path);
    } else {
      for (const p of t.paths) { ctx.fillStyle = p.fill; ctx.fill(p.path); }
    }
    ctx.restore();
  }

  /* An arch: near-black opening, a band across its head, and for a shed a
     coloured interior glow. Drawn in a local frame with the mouth facing down
     and then turned to face the yard. */
  /* ---------- THE SHEDS ----------
     Seen from above, which is how everything else in this yard is seen. The
     old ones were an arch drawn flat on the ground with the train running over
     the top of it, which reads as a decal rather than as a building.

     A shed is now a roof, and it is painted in TWO parts around the trains:
     the floor and the doorway go down before them and the roof goes on after,
     so an engine inside is under its own roof and only what is through the
     door is visible. That is the whole idea — a locomotive standing in a shed
     with its nose out in the yard.

     The roof is filled with a SCREEN-space gradient, not a local one, so the
     light stays up and to the left however the building is turned; the ridge
     runs along the track; and the whole thing throws a shadow down and right
     like everything else on the board. A depot's roof carries its own colour,
     the running shed's is slate, so which is which is legible before you
     read a
     single mark. */
  const SHED = {
    roof: '#463F37', roofLit: '#6B6155', ridge: '#8B7F6E',
    wall: '#2C2823', dark: '#16200F',
  };

  function shedBox(g, i, face, cell) {
    const b = cellRect(g, i);
    return {
      x: b.x + cell / 2, y: b.y + cell / 2,
      w: cell * 0.76, h: cell * 0.90,
      rot: face === N ? Math.PI : face === E ? -Math.PI / 2 : face === S ? 0 : Math.PI / 2,
      door: cell * 0.26,          // how much of the front is open doorway
    };
  }

  // Floor and doorway: under the trains.
  function drawShedFloor(g, i, face, colour, lit) {
    const cell = g.cell, S2 = shedBox(g, i, face, cell);
    ctx.save();
    ctx.translate(S2.x, S2.y); ctx.rotate(S2.rot);
    ctx.beginPath(); roundRect(-S2.w / 2, -S2.h / 2, S2.w, S2.h, cell * 0.10);
    ctx.fillStyle = SHED.dark; ctx.fill();
    if (lit && colour) {
      // the shed lit from within, once its own engine is home
      ctx.save(); ctx.clip();
      const gl = ctx.createRadialGradient(0, S2.h * 0.24, 0, 0, S2.h * 0.24, S2.h * 0.9);
      gl.addColorStop(0, hexA(colour, 0.50)); gl.addColorStop(1, hexA(colour, 0));
      ctx.fillStyle = gl; ctx.fillRect(-S2.w, -S2.h, S2.w * 2, S2.h * 2);
      ctx.restore();
    }
    ctx.restore();
  }

  // Roof: over the trains, stopping short of the door.
  function drawShedRoof(g, i, face, colour, lit, count) {
    const cell = g.cell, S2 = shedBox(g, i, face, cell);
    const roofH = S2.h - S2.door;
    const top = -S2.h / 2, bot = top + roofH;
    const r = cell * 0.07;

    // the shadow it throws, down and right, in screen space
    ctx.save();
    ctx.translate(S2.x + cell * 0.07, S2.y + cell * 0.08); ctx.rotate(S2.rot);
    ctx.beginPath(); roundRect(-S2.w / 2, top, S2.w, roofH, r);
    ctx.restore();
    ctx.fillStyle = SCEN.shadow; ctx.fill();

    /* A PITCHED ROOF, not a card. Two slopes meeting at a ridge that runs
       along the track, and which of them is the lit one is worked out from
       where the building is FACING: the slope normals are turned by the same
       rotation as the shed, and dotted against a lamp fixed up and to the
       left. So a shed facing north and a shed facing south are lit on
       opposite sides of their ridge, which is what stops four buildings on one
       board from looking like four copies of one sticker. */
    const lx = -0.707, ly = -0.707;
    const nL = [-Math.cos(S2.rot), -Math.sin(S2.rot)];
    const shine = (n) => Math.max(-1, Math.min(1, n[0] * lx + n[1] * ly));
    const base = colour ? shade(colour, lit ? -0.10 : -0.30) : SHED.roof;
    // both halves, clipped to the rounded roof outline
    ctx.save();
    ctx.save();
    ctx.translate(S2.x, S2.y); ctx.rotate(S2.rot);
    ctx.beginPath(); roundRect(-S2.w / 2, top, S2.w, roofH, r);
    ctx.restore();
    ctx.clip();
    ctx.save();
    ctx.translate(S2.x, S2.y); ctx.rotate(S2.rot);
    ctx.fillStyle = shade(base, 0.30 * shine(nL));
    ctx.fillRect(-S2.w / 2 - 2, top - 2, S2.w / 2 + 2, roofH + 4);
    ctx.fillStyle = shade(base, 0.30 * shine([-nL[0], -nL[1]]));
    ctx.fillRect(0, top - 2, S2.w / 2 + 2, roofH + 4);
    // the ridge, a thin lit line along the track
    ctx.strokeStyle = colour ? hexA(shade(colour, 0.52), 0.80) : SHED.ridge;
    ctx.lineWidth = Math.max(1, cell * 0.024); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, top + cell * 0.07); ctx.lineTo(0, bot - cell * 0.05); ctx.stroke();
    ctx.restore();
    ctx.restore();

    /* The eave over the door, and the shadow it drops into the doorway. This
       is what makes the opening read as UNDER something rather than as a black
       rectangle lying next to a roof. */
    ctx.save();
    ctx.translate(S2.x, S2.y); ctx.rotate(S2.rot);
    ctx.fillStyle = colour ? shade(colour, 0.30) : SHED.ridge;
    ctx.beginPath();
    roundRect(-S2.w / 2, bot - cell * 0.055, S2.w, cell * 0.055, cell * 0.02);
    ctx.fill();
    const sg = ctx.createLinearGradient(0, bot, 0, bot + S2.door * 0.75);
    sg.addColorStop(0, 'rgba(0,0,0,0.62)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(-S2.w / 2, bot, S2.w, S2.door * 0.75);
    ctx.restore();

    /* drawMark carries its own offset — it steps 2.1 radii AWAY from the face
       before it draws, which is exactly the roof side of the cell. So the
       centre of the shed is the right thing to hand it, and the old
       hand-rolled offset on top of that was putting the chevron in the grass
       above the building. The badge is placed the same way, off the face and
       then sideways, so it lands on the roof whichever way the shed points. */
    const ang = sideAngle(face);
    if (colour) drawMark(S2.x, S2.y, cell * 0.13, colour, face);
    if (count > 0) {
      drawCount(S2.x - Math.cos(ang) * cell * 0.26 + Math.cos(ang + Math.PI / 2) * cell * 0.23,
                S2.y - Math.sin(ang) * cell * 0.26 + Math.sin(ang + Math.PI / 2) * cell * 0.23,
                cell * 0.16, count);
    }
  }

  // The second channel. Colour is never the only one.
  function drawMark(x, y, r, colour, face) {
    const kind = markOf(colour);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(face === N ? Math.PI : face === E ? -Math.PI / 2 : face === S ? 0 : Math.PI / 2);
    ctx.translate(0, -r * 2.1);
    ctx.strokeStyle = 'rgba(10,15,25,0.72)';
    ctx.fillStyle = 'rgba(10,15,25,0.72)';
    ctx.lineWidth = Math.max(1.4, r * 0.34); ctx.lineCap = 'round';
    if (kind === 'dot') { ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2); ctx.fill(); }
    else if (kind === 'bar') { ctx.beginPath(); ctx.moveTo(-r * 0.55, 0); ctx.lineTo(r * 0.55, 0); ctx.stroke(); }
    else if (kind === 'chevron') {
      ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.28); ctx.lineTo(0, -r * 0.32); ctx.lineTo(r * 0.5, r * 0.28); ctx.stroke();
    } else { ctx.beginPath(); ctx.arc(0, 0, r * 0.44, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  const markOf = (hex) => {
    const e = ENGINE.find((x) => x.hi === hex || x.lo === hex);
    return e ? e.mark : 'dot';
  };

  function drawCount(x, y, r, n) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = TOK.bgPanel; ctx.fill();
    ctx.strokeStyle = TOK.tint40; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = TOK.ink92;
    ctx.font = '800 ' + Math.max(9, Math.round(r * 1.15)) + 'px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), x, y + 0.5);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // ---------- THE ENGINES ----------
  /* Seen from above: an enamel body with a roof band, one lit window at the
     front, and a darker under-band down each flank where the wheels are. No
     outline anywhere. The gradient is built in SCREEN space, not body space,
     so the lamp stays up and to the left however the engine is turned. */
  /* THE ENGINE, from the owner's drawing. One drawing serves four colours,
     because the fills in art.js are ROLES rather than values: the boiler and
     its highlight take the engine's own colour and everything mechanical keeps
     the greys it was drawn in. An engine that is entirely one colour stops
     reading as a machine, and an engine with no colour at all stops telling
     you which shed it belongs to; this splits the difference the way a real
     livery does.

     The art points DOWN in its own frame, so it is turned by heading - 90 to
     put the nose along the direction of travel. `size` is the nose-to-tail
     LENGTH, which is what the caller has always passed. */
  const ENGINE_PATHS = new Map();
  function enginePath(d) {
    if (!ENGINE_PATHS.has(d)) ENGINE_PATHS.set(d, new Path2D(d));
    return ENGINE_PATHS.get(d);
  }
  function drawEngine(x, y, heading, colour, size, opts) {
    const o = opts || {};
    const e = ART_SRC && ART_SRC.ENGINE;
    const c = ENGINE[colour] || ENGINE[0];
    if (!e || typeof Path2D !== 'function') return drawEngineBlock(x, y, heading, colour, size, o);
    const k = size / e.h;
    /* THE VALUE STRUCTURE IS THE DRAWING'S, not one invented here.

       Engine.svg exports a MID-GREY cab (#676767) with a lighter band down its
       lit side (#818181), a boiler in the livery, and a highlight that is a
       light TINT OF THE LIVERY at 40% — #2baae2 over a #1172ba boiler — not
       white. Reading the cab as "the livery, darkened" turned a third of every
       engine nearly black and reading the highlight as white put a hard pale
       stripe down it: the owner's very dark roof, cabin that feels off, and
       highlight that is too strong, all three.

       So the greys come back. Each is warmed a fifth of the way toward the
       engine's own colour, which is the one thing the game is read by — a
       neutral grey cab on a coral engine and on a violet one look like the
       same engine at this size — and every one of them is lighter than the
       part it replaces, because the engine has to hold its own against grass. */
    const warmed = (hex, t) => mix(hex, c.hi, t);
    const role = {
      body: c.hi,
      bodyLit: shade(c.hi, 0.30),
      // the nose is the brightest thing on the engine, as it is in the drawing
      plough: shade(c.hi, 0.12),
      ploughDark: shade(c.hi, -0.14),
      chassis: warmed('#5C5C5C', 0.14),
      frame: warmed('#8E8E8E', 0.10),
      frameLit: warmed('#BDBDBD', 0.08),
      cab: warmed('#6E6E6E', 0.24),
      // the lit SIDE of the cab roof, and the lamp it carries is the glow the
      // engine throws forward, drawn separately and not on the roof itself
      cabLit: o.dark ? warmed('#8A8A8A', 0.14) : warmed('#A2A2A2', 0.16),
      iron: warmed('#4E4E4E', 0.10), ironEdge: warmed('#9E9E9E', 0.10),
      // the boiler's own shadow: the source's indigo is a shade of ITS blue
      shade: shade(c.lo, -0.22),
    };
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading - Math.PI / 2);
    ctx.scale(k, k);
    ctx.translate(-(e.x + e.w / 2), -(e.y + e.h / 2));
    for (const op of e.ops) {
      ctx.globalAlpha = op.a == null ? 1 : op.a;
      ctx.fillStyle = role[op.f] || '#888';
      if (op.t === 'rect') ctx.fillRect(op.x, op.y, op.w, op.h);
      else if (op.t === 'poly') {
        ctx.beginPath();
        ctx.moveTo(op.p[0], op.p[1]);
        for (let i = 2; i < op.p.length; i += 2) ctx.lineTo(op.p[i], op.p[i + 1]);
        ctx.closePath(); ctx.fill();
      } else if (op.t === 'circle') {
        ctx.beginPath(); ctx.arc(op.cx, op.cy, op.r, 0, Math.PI * 2); ctx.fill();
        if (op.s) { ctx.strokeStyle = role[op.s]; ctx.lineWidth = 1 / k; ctx.stroke(); }
      } else if (op.t === 'path') ctx.fill(enginePath(op.d));
    }
    ctx.globalAlpha = 1;

    /* The lamp is up and to the left in SCREEN space, not in the engine's,
       so the light does not turn with the train. The mass is built under the
       rotation and then filled after it is undone, which is the only way to
       get a screen-space gradient onto a rotated shape. */
    ctx.beginPath();
    ctx.rect(e.x, 322.92, e.w, 195.46);
    ctx.restore();
    /* Half the strength it had. The overlay is the LAMP, not the modelling —
       the drawing does its own modelling with the lit band down each panel —
       and at 0.13 over 0.20 it was adding a second, brighter highlight over
       the top of the drawn one and taking the underside almost to black. */
    const lg = ctx.createLinearGradient(0, y - size * 0.34, 0, y + size * 0.34);
    lg.addColorStop(0, 'rgba(255,255,255,0.07)');
    lg.addColorStop(0.55, 'rgba(255,255,255,0)');
    lg.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = lg; ctx.fill();
  }

  /* The fallback, for a browser with no Path2D. It is the block engine this
     game shipped with: plainer, but it is a coloured thing on a rail that
     points the right way, which is all the game actually requires of it. */
  function drawEngineBlock(x, y, heading, colour, size, o) {
    const len = size, wid = size * 0.52;
    const e = ENGINE[colour] || ENGINE[0];
    ctx.save();
    ctx.translate(x, y); ctx.rotate(heading);
    const gr = ctx.createLinearGradient(0, -wid * 0.7, 0, wid * 0.7);
    gr.addColorStop(0, shade(e.hi, 0.10)); gr.addColorStop(1, e.lo);
    ctx.fillStyle = gr;
    ctx.beginPath(); roundRect(-len / 2, -wid / 2, len, wid, wid * 0.32); ctx.fill();
    ctx.fillStyle = o.dark ? 'rgba(214,236,255,0.28)' : ART.win;
    ctx.beginPath(); roundRect(len * 0.20, -wid * 0.22, len * 0.16, wid * 0.44, wid * 0.10); ctx.fill();
    ctx.restore();
  }

  /* THE HEADLAMP IS GONE. It threw a radial wash a whole cell wide ahead of
     every running engine, and it was written for the board this game started
     on — a dark yard at night, where a moving light was the thing that stopped
     it reading as a diagram. The ground is grass in daylight now, so the wash
     had nothing to be a light against: it just fogged the rails and the grass
     around each train and took the crispness off the one object the eye is
     meant to follow. The engine carries its own modelling and its own steam,
     which is enough to say it is running. */

  function drawSteam(x, y, size, t) {
    const still = reduced();
    for (let k = 0; k < 3; k++) {
      const ph = still ? (k * 0.3 + 0.2) : ((t / 1400 + k * 0.33) % 1);
      const rr = size * (0.16 + ph * 0.34);
      const yy = y - size * (0.30 + ph * 0.9);
      const a = 0.26 * (1 - ph);
      ctx.fillStyle = 'rgba(' + ART.steam + ',' + a.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x + Math.sin(ph * 3 + k) * size * 0.12, yy, rr, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---------- THE BOARD ----------
  function drawBoard(g, lvl, trk, rn, now, opts) {
    const o = opts || {};
    const bw = g.C * g.cell, bh = g.R * g.cell;
    // The felt: Surface, lit from up and left toward Raised, which is the same
    // light the Portal wash behind it comes from.
    /* In portrait the board is NOT a card. No plate, no border, no rounded
       corners: the yard is the screen, and the ground under it is the Portal
       wash that the whole page already stands on. In landscape it stays a
       framed board on a table, which is what a 760x600 frame with a column
       beside it wants to be. */
    const plain = !!o.plain;
    ctx.save();
    /* The field is a rect with a HARD edge, not a fade. On a phone it starts
       flush under the control band; on a desktop it is the whole frame with a
       radius on it. The demo in the rules card has no field of its own, so it
       falls back to painting the ground over its own little board. */
    const f = o.field || { x: g.ox, y: g.oy, w: bw, h: bh, r: Math.min(18, g.cell * 0.4) };
    ctx.save();
    ctx.beginPath(); roundRect(f.x, f.y, f.w, f.h, f.r);
    ctx.clip();
    ctx.drawImage(groundTexture(f.w, f.h, g.cell, 0), f.x, f.y, f.w, f.h);
    if (o.warm > 0) {
      ctx.fillStyle = 'rgba(255,232,190,' + (o.warm * 1.6).toFixed(3) + ')';
      ctx.fillRect(f.x, f.y, f.w, f.h);
    }
    ctx.restore();

    // empty cell plots, Tint 03
    ctx.fillStyle = TOK.tint03;
    for (let r = 0; r < g.R; r++) for (let c = 0; c < g.C; c++) {
      const i = r * g.C + c;
      if (lvl.kind[i] !== M.EMPTY || trk[i]) continue;
      const p = cellCentre(g, i);
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, g.cell * 0.035), 0, Math.PI * 2); ctx.fill();
    }

    // a dashed stub at every mouth, so "the rails join HERE" needs no words
    ctx.save();
    ctx.setLineDash([g.cell * 0.13, g.cell * 0.11]);
    ctx.strokeStyle = ART.ghost; ctx.lineWidth = Math.max(1, g.cell * 0.035);
    for (const m of lvl.portals.concat(lvl.depots)) {
      const nb = M.neighbour(lvl, m.i, m.face);
      if (nb < 0 || trk[nb]) continue;
      const a = sideMid(g, m.i, m.face), b2 = cellCentre(g, nb);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
    }
    ctx.restore();

    /* Order is the light. Every shadow is laid down first, so no shadow ever
       falls across the tree standing next to it; then the track; then the
       foliage over both, because a tree is the tallest thing in the yard. */
    const margin = o.field ? marginItems(g, o.field, o.avoid) : [];
    if (margin.length) {
      ctx.save();
      ctx.beginPath(); roundRect(f.x, f.y, f.w, f.h, f.r); ctx.clip();
      for (const it of margin) drawTree(it.x + it.s * LIGHT.dx, it.y + it.s * LIGHT.dy, it.s, it.seed, true);
      for (const it of margin) drawTree(it.x, it.y, it.s, it.seed, false);
      ctx.restore();
    }
    for (let i = 0; i < lvl.size; i++) if (lvl.kind[i] === M.ROCK) drawSceneryShadow(g, i, lvl);
    for (let i = 0; i < lvl.size; i++) drawTrackCell(g, i, trk[i], now);
    for (let i = 0; i < lvl.size; i++) if (lvl.kind[i] === M.ROCK) drawScenery(g, i, lvl);

    // the stroke under the finger, as chalk
    if (o.ghost && o.ghost.length) {
      ctx.save();
      ctx.setLineDash([g.cell * 0.16, g.cell * 0.12]);
      ctx.strokeStyle = ART.ghost; ctx.lineWidth = Math.max(1.4, g.cell * 0.055);
      ctx.lineCap = 'round';
      for (const s of o.ghost) {
        const d = pathOf(g, s.i, s.a, s.b);
        ctx.beginPath();
        if (d.kind === 'line') { ctx.moveTo(d.x0, d.y0); ctx.lineTo(d.x1, d.y1); }
        else ctx.arc(d.cx, d.cy, d.r, d.a0, d.a1, d.a1 < d.a0);
        ctx.stroke();
      }
      ctx.restore();
    }

    // "tap again to lift"
    if (tapMark && now - tapMark.at < 420 && !o.demo) {
      const k = 1 - (now - tapMark.at) / 420;
      const p = cellCentre(g, tapMark.i);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.34 * k).toFixed(3) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(p.x, p.y, g.cell * (0.30 + 0.14 * (1 - k)), 0, Math.PI * 2); ctx.stroke();
    }

    /* THREE PASSES AROUND THE TRAINS, and the order is the whole picture:
       floors and doorways go down, then every engine — the ones running, the
       ones parked and the one waiting in each shed — and then the roofs over
       the lot. An engine inside a shed is under its own roof and only the part
       of it through the door is in the yard.

       The queue is on the board rather than in a legend, which is what lets
       the phone carry no panel at all: the next engine out of a shed stands
       in its doorway in its own colour, and a badge appears only when there is
       another behind it. */
    const shedState = [];
    for (let pi = 0; pi < lvl.portals.length; pi++) {
      const p = lvl.portals[pi];
      const q = rn
        ? rn.trains.filter((t) => t.portal === pi && t.state === 'queued').map((t) => t.colour)
        : p.queue.slice();
      shedState.push({ i: p.i, face: p.face, colour: null, lit: false,
                       count: q.length > 1 ? q.length : 0, waiting: q[0] });
    }
    for (const d of lvl.depots) {
      const home = rn ? rn.trains.filter((t) => t.state === 'parked' && t.cell === d.i && t.colour === d.colour) : [];
      const lit = home.length > 0 && (!o.litAt || now >= o.litAt(home[0]));
      shedState.push({ i: d.i, face: d.face, colour: ENGINE[d.colour].hi, lit, count: 0 });
    }
    for (const sh of shedState) drawShedFloor(g, sh.i, sh.face, sh.colour, sh.lit);

    if (rn) drawTrains(g, lvl, rn, now);
    // the engine standing in a shed doorway, nose out into the yard
    for (const sh of shedState) {
      if (sh.waiting == null) continue;
      const c0 = cellCentre(g, sh.i), ang = sideAngle(sh.face);
      const out = g.cell * 0.34;
      drawEngine(c0.x + Math.cos(ang) * out, c0.y + Math.sin(ang) * out,
                 ang, sh.waiting, g.cell * 0.56, {});
    }
    for (const sh of shedState) drawShedRoof(g, sh.i, sh.face, sh.colour, sh.lit, sh.count);
    ctx.restore();

  }

  function drawTrains(g, lvl, rn, now) {
    /* A locomotive with a cab, a cowcatcher and frames needs room to say all
       of that. 0.92 of a cell: it sits on the sleepers with its frames just
       inside them, and the engine is the thing the eye should go to. */
    const size = g.cell * 0.92;
    for (const t of rn.trains) {
      if (t.state === 'queued') continue;
      const d = pathFor(g, t);
      // The nose is what the model tracks, so the body hangs back from it and
      // two engines meeting stop nose to nose rather than overlapping.
      const back = 0.34;
      const at = reduced() ? 0.5 : t.prog - back;
      const p = posOn(d, at);
      const heading = headingOn(d, Math.max(0, Math.min(1, at)));
      // Steam BEFORE the engine, so the puffs come out from under it rather
      // than sitting on top of the boiler.
      if (t.state === 'moving') drawExhaust(d, t, size, now);
      drawEngine(p.x, p.y, heading, t.colour, size, { dark: t.state === 'parked' });
      if (t.state === 'waiting' || t.state === 'stopped') drawSteam(p.x, p.y - size * 0.1, size * 0.5, now);
    }
  }

  /* STEAM FROM THE CHIMNEY, seen from above: puffs that leave the smokebox,
     fall behind as the engine runs on, and spread and thin as they go. They
     are laid along the track the engine has just covered rather than in a
     straight line behind it, so a train coming out of a curve leaves a curved
     trail — which is the whole reason to draw it from the path instead of
     from the heading.

     Deterministic: the phase comes from the RUN's own clock, not the wall
     clock, so the same run makes the same smoke twice. */
  function drawExhaust(d, t, size, now) {
    const puffs = 5;
    const phase = (t.cells + t.prog) * 1.7;
    for (let k = 0; k < puffs; k++) {
      const age = ((phase + k) % puffs) / puffs;          // 0 fresh, 1 gone
      const back = 0.30 + age * 0.85;                     // how far behind, in cells
      const at = t.prog - back;
      const p = posOn(d, at);
      const h = headingOn(d, Math.max(0, Math.min(1, at)));
      // drift sideways, always the same way relative to travel, so it reads
      // as one plume rather than as scattered dots
      const drift = (age * age) * size * 0.22;
      const a = 0.30 * (1 - age) * (1 - age * 0.4);
      if (a <= 0.01) continue;
      const r = size * (0.13 + age * 0.34);
      ctx.fillStyle = 'rgba(226,236,246,' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(h + Math.PI / 2) * drift,
              p.y + Math.sin(h + Math.PI / 2) * drift, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- HUD ----------
  function speakerIcon(cx, cy, on) {
    const s = 7;
    ctx.save();
    ctx.strokeStyle = TOK.ink92; ctx.fillStyle = TOK.ink92;
    ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.8, cy - s * 0.3); ctx.lineTo(cx - s * 0.35, cy - s * 0.3);
    ctx.lineTo(cx + s * 0.15, cy - s * 0.75); ctx.lineTo(cx + s * 0.15, cy + s * 0.75);
    ctx.lineTo(cx - s * 0.35, cy + s * 0.3); ctx.lineTo(cx - s * 0.8, cy + s * 0.3);
    ctx.closePath(); ctx.fill();
    if (on) {
      ctx.beginPath(); ctx.arc(cx + s * 0.35, cy, s * 0.42, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + s * 0.35, cy, s * 0.78, -0.85, 0.85); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.42, cy - s * 0.42); ctx.lineTo(cx + s * 1.0, cy + s * 0.42);
      ctx.moveTo(cx + s * 1.0, cy - s * 0.42); ctx.lineTo(cx + s * 0.42, cy + s * 0.42);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* Order is fixed site wide: sound, Undo, Restart, Rules. On a frame under
     about 340 logical pixels the four of them plus their gaps do not fit
     between the margins, and a button is chrome, so it is not scaled: the
     Rules pill drops to its icon width instead. That is a documented fallback,
     not a rounding. */
  /* The row and the read-out lay out from opposite ends of the SAME band, and
     nothing in the shared code checks whether they meet. So the decision is
     made once, for both, before either is drawn: measure the row, measure the
     read-out, and step down through the fallbacks until there is real
     clearance. At 480x360, the smallest frame /embed/ supports, the full row
     is 315 wide and the long read-out needs 130 more than the band has, which
     is a 31px overlap and two strings drawn through each other. */
  function bandPlan() {
    const gap = UI.PILL.gap, wS = UI.PILL.iconW;
    ctx.font = '700 ' + UI.PILL.font + 'px Inter, sans-serif';
    const wU = UI.pillWidth(ctx, 'Undo'), wR = UI.pillWidth(ctx, 'Restart');
    const rowFull = wS + wU + wR + UI.pillWidth(ctx, 'Rules') + gap * 3;
    /* One line of numbers, and where it goes is the only difference between
       the two layouts. Landscape puts it in the band, right-aligned, opposite
       the control row — the fleet's standard HUD, which Junction had drifted
       out of while it had a panel. Portrait has no room beside four pills, so
       the same line sits on the grass at the foot of the field, opposite the
       button. */
    const used = sleepersUsed();
    const texts = ['LEVEL ' + level.n + '   ·   SLEEPERS ' + used + ' / ' + level.budget,
                   'LEVEL ' + level.n + '  ·  ' + used + ' / ' + level.budget,
                   'L' + level.n + '  ·  ' + used + '/' + level.budget];
    const hs0 = Math.max(0.66, Math.min(1, LW / 620));
    const width = (t, hs) => {
      ctx.font = '600 ' + Math.round(16 * hs) + 'px Inter, sans-serif';
      return ctx.measureText(t).width;
    };
    /* In landscape the row and the read-out lay out from opposite ends of the
       SAME band and nothing in the shared code checks whether they meet, so the
       decision is made once, here, for both: measure the row, measure the line,
       and step down through the fallbacks until there is real clearance. In
       portrait the line is at the foot of the field, so the only question is
       whether each fits its own width. */
    /* THE BAND HAS THREE OCCUPANTS IN LANDSCAPE NOW, not two: the control row
       from the left, the action pill from the right, and the numbers in what
       is left between them. Measuring against the frame edge instead of
       against the pill is how DISPATCH came to be drawn straight through
       "SLEEPERS 17 / 25". */
    const rightEdge = L.wide ? L.actCx - L.actW / 2 - 18 : LW - 18;
    const leftEdge = (extra) => (L.wide ? SIDE_PAD : 18) + (rowFull - extra) + 24;
    const room = L.wide
      ? rightEdge - leftEdge(0)
      : LW - 36 - (actionW() + 18);
    const iconRoom = L.wide
      ? rightEdge - leftEdge(UI.pillWidth(ctx, 'Rules') - UI.PILL.iconW)
      : room;
    /* WHERE THE ROW FITS DEPENDS ON HOW IT IS ANCHORED, and a single magic
       number cannot say it for both. Landscape lays the pills from SIDE_PAD
       rightward, so it needs a SIDE_PAD margin at each end; portrait centres
       them, so 12px each side is enough. `LW - 24` for both let a 315px row
       start at 30 in a 340px frame and finish 5px past the edge. */
    const rowRoom = L.wide ? LW - SIDE_PAD * 2 : LW - 24;
    let icon = rowFull > rowRoom;
    let text = texts[0], hs = hs0, k = 0;
    const fits = (r) => width(text, hs) <= r;
    while (!fits(room) && k < texts.length - 1) text = texts[++k];
    while (!fits(room) && hs > 0.655) hs -= 0.02;
    // last resort: give Rules its icon back and hand the room to the numbers
    if (!fits(room) && fits(iconRoom)) icon = true;
    /* AND IF THE BAND STILL WILL NOT HOLD BOTH, the numbers leave it. Below
       about 420 wide the row and the line are laid out from opposite ends of
       the same band and overlap — 71px at 320 — with every rung of the ladder
       above already spent. The alternatives were shrinking the type past its
       floor or dropping a control, and both are worse than moving one line of
       chrome to the place PORTRAIT already keeps it: on the grass at the foot
       of the field. So landscape borrows the portrait position rather than
       inventing a third one. */
    const inBand = fits(icon ? iconRoom : room);
    return { iconRules: icon, text, hs, inBand };
  }

  function drawControls(now) {
    const gap = UI.PILL.gap, wS = UI.PILL.iconW;
    const wU = UI.pillWidth(ctx, 'Undo'), wR = UI.pillWidth(ctx, 'Restart');
    const plan = L.plan;
    const iconRules = plan.iconRules;
    const wH = iconRules ? UI.PILL.iconW : UI.pillWidth(ctx, 'Rules');
    const total = wS + wU + wR + wH + gap * 3;
    const cy = L.ctrlCy;
    let x = L.wide ? SIDE_PAD : Math.round(LW / 2 - total / 2);   // portrait: centred, in the TOP band
    L.rowLeft = x;

    const b = UI.drawPill(ctx, '', x + wS / 2, cy, { w: wS });
    speakerIcon(x + wS / 2, cy, sfx ? sfx.isOn() : false);
    L.hit.sound = b; x += wS + gap;

    const busy = running();
    L.hit.undo = UI.drawPill(ctx, 'Undo', x + wU / 2, cy, { w: wU, dim: busy || !history.length });
    x += wU + gap;
    L.hit.restart = UI.drawPill(ctx, 'Restart', x + wR / 2, cy, { w: wR, dim: busy || !sleepersUsed() });
    x += wR + gap;
    L.hit.rules = UI.drawPill(ctx, iconRules ? '' : 'Rules', x + wH / 2, cy, { w: wH });
    if (iconRules) {
      ctx.fillStyle = TOK.ink92;
      ctx.font = '800 17px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', x + wH / 2, cy + 1);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    L.rowRight = x + wH;
    void now;
  }

  /* THE NUMBERS. One line, laid out from the end of its band opposite whatever
     shares that band: the control row in landscape, the button in portrait.
     Nothing in the shared code checks whether the two meet, so bandPlan sizes
     the type against the room the other one left and this only draws it. */
  function drawReadout() {
    const plan = L.plan;
    ctx.font = '600 ' + Math.round(16 * plan.hs) + 'px Inter, sans-serif';
    const w = ctx.measureText(plan.text).width;
    /* Three places, not two. Landscape shares one band with the control row
       and the pill, so the line is right-aligned against the pill. Portrait
       has its own second band row and reads left, under the controls. And if
       a band cannot hold the line at all it falls onto the grass, where it
       needs the weight the band was giving it for free. */
    const onBand = L.wide ? plan.inBand : true;
    ctx.fillStyle = onBand ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.88)';
    L.readoutLeft = (L.wide && plan.inBand)
      ? Math.round(L.actCx - L.actW / 2 - 18 - w)
      : 18;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(plan.text, L.readoutLeft, L.readoutY);
    ctx.textBaseline = 'alphabetic';
    L.readoutW = w;
  }

  /* THE ACTION. A pill in the accent, resting on the grass, and the only
     coloured control in the game. It gets the standard pill border because the
     accent alone does not carry against a dark field: #C24A39 on the grass
     measures about 2.6:1 where a graphical object needs 3, and the Tint 40
     hairline is the house answer to exactly that. */
  function drawAction(label, cx, cy) {
    const w = L.actW, h = L.actH, r = UI.radius(h);
    const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    // the same cast shadow every solid thing on this field has, down and right
    ctx.fillStyle = 'rgba(8,20,10,0.30)';
    UI.roundRectPath(ctx, x + 2, y + 3, w, h, r); ctx.fill();
    ctx.fillStyle = TOK.accent;
    UI.roundRectPath(ctx, x, y, w, h, r); ctx.fill();
    ctx.lineWidth = UI.PILL.borderW; ctx.strokeStyle = UI.PILL.border;
    UI.roundRectPath(ctx, x, y, w, h, r); ctx.stroke();
    ctx.fillStyle = UI.CTA.text;
    ctx.font = '700 ' + UI.PILL.font + 'px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    return { x, y, w, h };
  }

  // ---------- CARDS ----------
  const RULES = [
    'Drag across the yard to lay track. Lifting a piece again is free, and expected.',
    'Where two lines meet, a junction forms. Tap its brass ring to set which way it points.',
    'An engine arriving on a branch always joins the main line. Only an engine arriving ON the main line follows the switch.',
    'Press DISPATCH. Every engine takes the rails exactly as set, and parks in whatever shed it reaches.',
    'Two engines on one rail stop nose to nose and wait. Halt, change the yard, release again. Nothing is ever lost.',
  ];

  function wrapText(text, maxW, size) {
    ctx.font = '500 ' + size + 'px Inter, sans-serif';
    const words = text.split(' '); const lines = []; let line = '';
    for (const w of words) {
      const tt = line ? line + ' ' + w : w;
      if (ctx.measureText(tt).width > maxW && line) { lines.push(line); line = w; }
      else line = tt;
    }
    if (line) lines.push(line);
    return lines;
  }

  function cardLayout(kind) {
    const pw = Math.min(LW - 56, 470);
    const px = Math.round((LW - pw) / 2);
    /* THE HEADER FOLLOWS THE COPY. It was a flat 154 with the standfirst
       clipped to two lines by a .slice(0, 2), which on a 375px phone dropped
       the third line and left the sentence hanging at "and send every" — copy
       cut mid-thought, with nothing on screen to say so. The card gives up
       BODY to a scroll, which is its design; it must never give up a sentence
       silently. Two lines is the desktop case and costs nothing there. */
    const subLines = wrapText(kind === 'rules'
      ? 'Lay the track, set the switches, and send every engine to the shed of its own colour.'
      : 'Every engine home, through rails they had to share.', pw - 68, 17).length;
    const HEADER = 130 + subLines * 24, FOOTER = 98;
    /* THE CARD IS AS TALL AS WHAT IT HOLDS, and the two kinds hold very
       different amounts. 420 was a desktop number applied to a phone: on an
       812-tall frame it left 792px of room, used 420, and once the standfirst
       took a third line the body had 96px and dropped the demo — which is how
       a junction explains itself without words — for want of space that was
       sitting right there. The rules card takes what the frame gives it up to
       a reading measure; the win card holds one tally and should not be a
       560px slab with 300px of nothing under it. */
    const ph = kind === 'win'
      ? Math.min(LH - 40, HEADER + 116 + FOOTER)
      : Math.min(LH - 40, 560);
    const py = Math.max(10, Math.round((LH - ph) / 2));
    const viewTop = py + HEADER;
    const viewH = Math.max(40, ph - HEADER - FOOTER);
    const items = [];
    if (kind === 'rules') {
      /* The demo is supporting and must not eat the zone it supports. It takes
         what is left after the first rule has its lines, so the card opens on
         a picture AND a sentence rather than on a picture alone; below 86 it
         is dropped rather than shrunk, because a demo too small to read is
         clutter sitting where a sentence should be. */
      const first = wrapText(RULES[0], pw - 100, 16).length * 22 + 13;
      const room = viewH - first;
      if (room >= 86) items.push({ t: 'demo', h: Math.min(122, room) });
      for (const r of RULES) {
        const lines = wrapText(r, pw - 100, 16);
        items.push({ t: 'rule', lines, h: lines.length * 22 + 13 });
      }
    } else {
      items.push({ t: 'won', h: 116 });
    }
    let contentH = 0; for (const it of items) contentH += it.h;
    contentH = Math.max(0, contentH - 13);
    return {
      kind, px, py, pw, ph, HEADER, FOOTER, viewTop, viewH, items, contentH,
      scrollMax: Math.max(0, contentH - viewH),
      ctaCy: py + ph - FOOTER + 16 + UI.CTA.h / 2,
      title: kind === 'rules' ? 'JUNCTION' : 'ALL HOME',
      cta: kind === 'rules' ? 'PLAY' : 'AGAIN',
      subtitle: kind === 'rules'
        ? 'Lay the track, set the switches, and send every engine to the shed of its own colour.'
        : 'Every engine home, through rails they had to share.',
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
    ctx.fillText(c.title, c.px + 34, c.py + 68);
    ctx.fillStyle = TOK.ink82;
    ctx.font = '600 17px Inter, sans-serif';
    const sub = wrapText(c.subtitle, c.pw - 68, 17);
    ctx.font = '600 17px Inter, sans-serif';
    for (let i = 0; i < sub.length; i++) ctx.fillText(sub[i], c.px + 34, c.py + 105 + i * 24);

    ctx.save();
    ctx.beginPath(); ctx.rect(c.px, c.viewTop, c.pw, c.viewH); ctx.clip();
    let yy = c.viewTop - cardScroll;
    let n = 0;
    for (const it of c.items) {
      if (yy + it.h > c.viewTop - 80 && yy < c.viewTop + c.viewH + 80) {
        if (it.t === 'demo') drawDemo(c.px + 34, yy, c.pw - 68, it.h - 12, now);
        else if (it.t === 'won') {
          const mid = c.px + c.pw / 2;
          ctx.textAlign = 'center';
          ctx.fillStyle = TOK.ink90; ctx.font = '500 16px Inter, sans-serif';
          ctx.fillText('Level ' + level.n, mid, yy + 22);
          const used = sleepersUsed();
          ctx.fillStyle = TOK.ink82; ctx.font = '600 16px Inter, sans-serif';
          ctx.fillText(used + ' of ' + level.budget + ' sleepers   ·   ' +
                       releases + (releases === 1 ? ' release' : ' releases'), mid, yy + 54);
          if (run) {
            ctx.fillStyle = TOK.ink72; ctx.font = '500 16px Inter, sans-serif';
            ctx.fillText(run.meetings === 0 ? 'Nobody had to wait.'
              : run.meetings === 1 ? 'One engine waited for another.'
              : run.meetings + ' waits at the shared rail.', mid, yy + 86);
          }
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
          for (let i = 0; i < it.lines.length; i++) ctx.fillText(it.lines[i], c.px + 66, yy + 17 + i * 22);
        }
      }
      yy += it.h;
    }
    ctx.restore();
    if (cardScroll > 1) fadeEdge(c, true);
    if (cardScroll < c.scrollMax - 1) fadeEdge(c, false);

    L.hit.cta = UI.drawCTA(ctx, c.cta, c.px + c.pw / 2, c.ctaCy, TOK.accent);
    ctx.restore();
  }

  /* THE LOOPING DEMO, and it is mandatory: "an engine on the main line follows
     the switch, an engine on a branch does not" cannot be guessed from a still
     picture. Six seconds, no words, and it tells the truth about the model —
     the switch is set BETWEEN runs, never during one, so the loop runs the
     engine, flips the ring, and runs it again. */
  const DEMO = (() => {
    const lvl = M.buildLevel({
      n: 0, R: 3, C: 5, rocks: [],
      portals: [{ at: [1, 0], face: E, queue: [0] }],
      depots: [{ at: [0, 4], face: S, colour: 2 }, { at: [2, 4], face: N, colour: 0 }],
      budget: 40,
    });
    const trk = M.layout(lvl, [
      [1, 1, W, E], [1, 2, W, N], [1, 2, W, S],
      [0, 3, S, E], [2, 3, N, E],
    ]);
    return { lvl, trk, j: 1 * 5 + 2 };
  })();

  function drawDemo(x, y, w, h, now) {
    const cell = Math.max(8, Math.floor(Math.min(w / DEMO.lvl.C, h / DEMO.lvl.R)));
    const g = {
      ox: Math.round(x + (w - cell * DEMO.lvl.C) / 2),
      oy: Math.round(y + (h - cell * DEMO.lvl.R) / 2),
      cell, R: DEMO.lvl.R, C: DEMO.lvl.C,
    };
    if (!demoT0) demoT0 = now;
    const LOOP = 6000, t = (now - demoT0) % LOOP;
    // Leg one runs it as drawn; the ring turns at 2600; leg two runs it again.
    const wrongLeg = t < 2600;
    const sw = wrongLeg ? 0 : 1;
    if (DEMO.trk[DEMO.j].sw !== sw) DEMO.trk[DEMO.j].sw = sw;
    const legT = wrongLeg ? t : Math.max(0, t - 3000);
    const rn = M.createRun(DEMO.lvl, DEMO.trk);
    const secs = Math.min(2.6, legT / 1000);
    const steps = Math.round(secs / M.RUN_DT);
    for (let k = 0; k < steps && !rn.settled; k++) M.stepRun(DEMO.lvl, DEMO.trk, rn, M.RUN_DT);
    const turning = !wrongLeg && t < 3000;
    if (turning) flashDemo(now);
    drawBoard(g, DEMO.lvl, DEMO.trk, rn, now, { demo: true });
    if (turning) {
      const p = cellCentre(g, DEMO.j);
      const k = (t - 2600) / 400;
      ctx.strokeStyle = 'rgba(216,179,106,' + (0.55 * (1 - k)).toFixed(3) + ')';
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(p.x, p.y, cell * (0.24 + k * 0.34), 0, Math.PI * 2); ctx.stroke();
    }
  }
  let demoFlashAt = 0;
  function flashDemo(now) { if (!demoFlashAt || now - demoFlashAt > 5000) demoFlashAt = now; }

  // ---------- RENDER ----------
  let rafId = 0;
  function draw() { if (!rafId) rafId = requestAnimationFrame(frame); }
  let lastFrame = 0, acc = 0;

  function frame(now) {
    rafId = 0;
    if (run && !run.settled) {
      let d = lastFrame ? (now - lastFrame) / 1000 : 0;
      if (d > 0.25) d = 0.25;
      acc += d;
      let guard = 0;
      while (acc >= M.RUN_DT && !run.settled && guard++ < 600) {
        M.stepRun(level, track, run, M.RUN_DT);
        acc -= M.RUN_DT;
      }
      if (run.settled) {
        acc = 0;
        onSettled();
      }
    }
    lastFrame = now;
    render(now);
    if (needsFrames(now)) rafId = requestAnimationFrame(frame);
    else { lastFrame = 0; acc = 0; }
  }

  function needsFrames(now) {
    if (phase === 'rules') return true;                  // the demo loops
    if (run && !run.settled) return true;
    if (run && run.settled && run.trains.some((t) => t.state === 'waiting' || t.state === 'stopped')) return true;
    if (winAt && now - winAt < WIN_HOLD + 500) return true;
    if (flash && now - flash.at < 420) return true;
    if (tapMark && now - tapMark.at < 460) return true;
    return false;
  }

  function render(now) {
    ctx.clearRect(0, 0, LW, LH);
    // The Portal wash. Same three stops, same centre, in every game.
    // The lamp warms 8% for the first second of a finished yard. In portrait
    // there is no plate to warm, so the WASH warms: the whole room, which is
    // what a lamp coming up actually does.
    const warm = winAt ? Math.min(1, (now - winAt) / 1000) * 0.08 : 0;
    const bg = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
    bg.addColorStop(0, TOK.bgPanel);
    bg.addColorStop(0.6, TOK.bgCard);
    bg.addColorStop(1, TOK.bg);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);
    L.plan = bandPlan();

    // The lamp warms 8% for two seconds when the yard comes right.
    drawBoard(L.g, level, track, run, now, {
      ghost: stroke && stroke.ok ? stroke.adds : null,
      warm,
      field: L.field,
      /* Scenery keeps off whatever the layout has put ON THE GRASS — and
         which of these is on the grass changes with the layout, so the list
         asks rather than assumes. Both live in the band now on a phone. */
      avoid: [
        { x: L.actCx - L.actW / 2 - 14, y: L.actCy - L.actH / 2 - 12,
          w: L.actW + 28, h: L.actH + 24 },
        { x: 0, y: L.readoutY - 16, w: LW, h: 32 },
      ].filter((r) => r.y + r.h > L.field.y && r.y < L.field.y + L.field.h),
      litAt: (t) => winAt + (reduced() ? 0 : 200 * arrivalRank(t)),
    });
    drawControls(now);
    drawReadout();

    /* DISPATCH, not RELEASE. A dispatcher is the person whose job is sending
       trains; hounds are what you release. It is also the transitive one — you
       dispatch a train, where a train departs of its own accord — and it pairs
       with HALT. */
    const label = !run ? 'DISPATCH' : (run.settled ? 'RESET' : 'HALT');
    L.hit.release = drawAction(label, L.actCx, L.actCy);

    /* The win IS the yard working, so the card waits for it. The arches light
       in arrival order 200ms apart and the lamp warms over two seconds, and a
       card drawn the instant the last engine parks covers every bit of that.
       L.hit.cta is only set while the card is actually drawn, so nothing can
       be pressed through the gap either. */
    /* Clear the card's hit box before deciding whether to draw one. L.hit is
       only reset in layout(), so after a card closed its CTA box stayed in the
       handle and hits().card still reported a card that was not on screen.
       Nothing could be pressed through it — the input path only consults it in
       the card phases — but a CHECK cannot tell a covered board from a bare
       one, and one of them read the win card and called it the yard. */
    L.hit.cta = null;
    if (phase === 'rules') drawCard('rules', now);
    else if (phase === 'win') {
      const k = (now - winAt - WIN_HOLD) / 400;
      if (k > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, k);
        drawCard('win', now);
        ctx.restore();
      } else L.hit.cta = null;
    }
  }

  function arrivalRank(t) {
    if (!run) return 0;
    const order = run.trains.filter((x) => x.state === 'parked').sort((a, b) => a.parkedAt - b.parkedAt);
    const k = order.indexOf(t);
    return k < 0 ? 0 : k;
  }

  // ---------- ACTIONS ----------
  function markStarted() { if (!started) { started = true; T().gameStart(); T().levelStart(level.n); } }

  function release() {
    markStarted();
    if (sfx) sfx.ensureAudio();
    if (run) { clearRun(); return; }
    run = M.createRun(level, track);
    releases++;
    lastFrame = 0; acc = 0;
    play('start');
    draw();
  }
  function clearRun() {
    run = null; winAt = 0;
    draw();
  }
  function onSettled() {
    if (run.won) {
      winAt = performance.now();
      phase = 'win';
      play('win');
      save.max = Math.max(save.max, level.n); save.seen = true; persist();
      T().levelComplete(level.n, releases);
      T().track('releases', { level: level.n, n: releases });
      T().track('meetings', { level: level.n, n: run.meetings });
      T().track('budget_left', { level: level.n, n: level.budget - sleepersUsed() });
    } else {
      play('pop');
    }
  }
  function undo() {
    if (running() || !history.length) return;
    if (run) clearRun();
    track = history.pop();
    play('tick');
    draw();
  }
  function restart() {
    if (running() || !sleepersUsed()) return;
    if (run) clearRun();
    pushHistory();
    track = M.newTrack(level.size);
    T().levelRestart(level.n);
    play('tick');
    draw();
  }

  // ---------- INPUT ----------
  function toLocal(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX ?? (e.changedTouches && e.changedTouches[0].clientX);
    const cy = e.clientY ?? (e.changedTouches && e.changedTouches[0].clientY);
    return { x: (cx - rect.left) * (LW / rect.width), y: (cy - rect.top) * (LH / rect.height) };
  }
  const inBox = (p, b) => !!b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  const rectsOverlap = (a, b) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w &&
                                 a.y < b.y + b.h && b.y < a.y + a.h;
  function cellAt(p) {
    const g = L.g;
    const c = Math.floor((p.x - g.ox) / g.cell), r = Math.floor((p.y - g.oy) / g.cell);
    if (r < 0 || c < 0 || r >= g.R || c >= g.C) return -1;
    return r * g.C + c;
  }

  /* THE RING IS THE ONE THING YOU HAVE TO HIT, and the target for it is the
     cell, which is exactly what a bigger board spends: 47px at 7x7 on a phone,
     37 at 9x9, 30 at 11x11, against the 44 a thumb wants. So a tap that lands
     on BARE GROUND next to a junction is given to the junction. It only ever
     rescues a tap that would otherwise have done nothing at all — a tap on
     track, on a rock, on an arch or on a second junction is left exactly where
     it fell — so it cannot take a tap away from anything. */
  function nearestRing(p, fallback) {
    if (track[fallback] || level.kind[fallback] !== M.EMPTY) return fallback;
    const reach = Math.max(22, L.g.cell * 0.75);
    let best = fallback, bestD = reach;
    for (let i = 0; i < level.size; i++) {
      if (!M.isJunction(track[i])) continue;
      const c = cellCentre(L.g, i);
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  let down = null, lastTap = { i: -1, at: 0, wasToggle: false };

  canvas.addEventListener('pointerdown', (e) => {
    const p = toLocal(e);
    if (sfx) sfx.ensureAudio();
    down = { p, start: p, cell: cellAt(p), moved: false, scroll: false };

    if (phase === 'rules' || phase === 'win') {
      if (inBox(p, L.hit.cta)) return;
      if (L.cardBody && inBox(p, L.cardBody) && L.cardBody.max > 0) down.scroll = true;
      return;
    }
    if (inBox(p, L.hit.sound) || inBox(p, L.hit.undo) || inBox(p, L.hit.restart) ||
        inBox(p, L.hit.rules) || inBox(p, L.hit.release)) return;
    if (running()) return;
    const i = down.cell;
    if (i < 0) return;
    // A settled run is cleared by the first touch on the board, so a player
    // who has seen where the engines ended up just carries on drawing.
    if (run && run.settled) { clearRun(); phase = 'play'; }
    if (level.kind[i] === M.ROCK) return;
    stroke = { path: [i], adds: [], ok: false, cost: 0 };
    // Throws NotFoundError for a pointer id the browser does not consider
    // active, which is every synthetic event a test dispatches. A capture that
    // fails is a slightly leakier drag, never a dead one.
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!down) return;
    const p = toLocal(e);
    if (Math.hypot(p.x - down.start.x, p.y - down.start.y) > 7) down.moved = true;
    if (down.scroll) {
      cardScroll = Math.max(0, Math.min(L.cardBody.max, cardScroll + (down.p.y - p.y)));
      down.p = p; draw(); return;
    }
    down.p = p;
    if (!stroke) return;
    const target = cellAt(p);
    if (target < 0) return;
    /* WALK to the cell under the finger rather than jumping to it. A pointer
       moving quickly reports one move event every few cells, and a handler
       that only accepts the ADJACENT next cell silently stops the stroke the
       moment a finger goes faster than the event stream. The screen never says
       why; the rails just stop appearing. So step one cell at a time toward
       the target, longer axis first, and let each step be validated on its own
       merits. Dragging back over the path retraces it, which is what a finger
       that has overshot expects. */
    let advanced = false, guard = 0;
    while (guard++ < 40) {
      const last = stroke.path[stroke.path.length - 1];
      if (last === target) break;
      const back = stroke.path.indexOf(target);
      if (back >= 0) { stroke.path.length = back + 1; revalidate(); advanced = true; break; }
      let took = false;
      for (const step of stepOptions(last, target)) {
        if (stroke.path.indexOf(step) >= 0) continue;
        const v = M.validateStroke(level, track, stroke.path.concat([step]));
        if (!v.ok) continue;                  // the stroke simply stops there
        stroke.path.push(step);
        stroke.adds = v.adds; stroke.ok = true; stroke.cost = v.cost; stroke.preview = v.track;
        took = true; advanced = true;
        break;
      }
      if (!took) break;
    }
    if (!advanced) return;
    const t = performance.now();
    if (t - lastTick > 45) { play('tick'); lastTick = t; }
    draw();
  });

  // The one or two orthogonal steps that get closer to the target, longer axis
  // first, so a diagonal drag turns into the L a player would have drawn.
  function stepOptions(from, to) {
    /* A shed is open at ONE side, so a drag that starts on one
       has exactly one legal first step whatever direction the finger flicks.
       Offering it the two cells nearest the target instead meant a flick that
       was even slightly off the doorway validated as nothing, and the stroke
       died in the cell it started in: the owner's "drawing a line right out of
       the parked position is very hard". */
    const kd = level.kind[from];
    if (kd === M.PORTAL || kd === M.DEPOT) {
      const out = M.neighbour(level, from, level.face[from]);
      return out >= 0 ? [out] : [];
    }
    const r0 = M.rowOf(level, from), c0 = M.colOf(level, from);
    const dr = M.rowOf(level, to) - r0, dc = M.colOf(level, to) - c0;
    const vert = [r0 + Math.sign(dr), c0], horz = [r0, c0 + Math.sign(dc)];
    const order = Math.abs(dr) >= Math.abs(dc) ? [vert, horz] : [horz, vert];
    const out = [];
    for (const [r, c] of order) {
      if ((r === r0 && c === c0) || r < 0 || c < 0 || r >= level.R || c >= level.C) continue;
      out.push(r * level.C + c);
    }
    return out;
  }

  function revalidate() {
    if (!stroke) return;
    const v = M.validateStroke(level, track, stroke.path);
    stroke.ok = v.ok; stroke.adds = v.adds; stroke.cost = v.cost; stroke.preview = v.track;
  }

  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const p = toLocal(e);
    const d = down; down = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}

    if (phase === 'rules' || phase === 'win') {
      if (inBox(p, L.hit.cta) && !d.moved) {
        if (phase === 'win') { restartLevel(); }
        else { phase = 'play'; save.seen = true; persist(); markStarted(); }
        cardScroll = 0; play('click'); draw();
      }
      return;
    }

    if (!d.moved) {
      if (inBox(p, L.hit.sound)) { if (sfx) { sfx.setOn(!sfx.isOn()); play('click'); } draw(); return; }
      if (inBox(p, L.hit.undo)) { undo(); return; }
      if (inBox(p, L.hit.restart)) { restart(); return; }
      if (inBox(p, L.hit.rules)) { phase = 'rules'; cardScroll = 0; demoT0 = 0; play('click'); draw(); return; }
      if (inBox(p, L.hit.release)) { release(); return; }
    }

    const committed = stroke;
    stroke = null;
    if (committed && committed.path.length >= 2 && committed.ok && d.moved) {
      pushHistory();
      track = committed.preview;
      play('drop');
      draw();
      return;
    }
    if (!d.moved && d.cell >= 0 && !running()) tap(nearestRing(p, d.cell));
    draw();
  });

  canvas.addEventListener('pointercancel', () => { down = null; stroke = null; draw(); });
  canvas.addEventListener('wheel', (e) => {
    if (phase !== 'rules' && phase !== 'win') return;
    if (!L.cardBody || !L.cardBody.max) return;
    e.preventDefault();
    cardScroll = Math.max(0, Math.min(L.cardBody.max, cardScroll + e.deltaY));
    draw();
  }, { passive: false });

  /* A tap on a junction sets it. A second tap on the same cell lifts it, and
     when the first of the two was a switch, the two edits are merged into one
     so Undo steps back over the pair rather than through the middle of it. */
  function tap(i) {
    const c = track[i];
    if (!c) { lastTap = { i: -1, at: 0, wasToggle: false }; return; }
    const now = performance.now();
    const again = lastTap.i === i && now - lastTap.at < 420;
    if (again) {
      /* When the first of the pair was a switch, it ALREADY pushed a snapshot,
         and that snapshot is the state before both edits — exactly the point a
         single Undo should come back to. So the merge is to push nothing here,
         not to pop what is there. Popping it threw away the only record of the
         yard before the pair, and the next Undo went back to whatever was
         underneath: from a full seventeen-sleeper yard, one Undo emptied the
         board. Found by pressing the actual buttons; no check that called
         toggle() and erase() directly would ever have seen it. */
      if (!lastTap.wasToggle) pushHistory();
      M.eraseCell(track, i);
      play('turn');
      lastTap = { i: -1, at: 0, wasToggle: false };
      tapMark = null;
      draw();
      return;
    }
    if (M.isJunction(c)) {
      pushHistory();
      const from = M.activeBranch(c);
      M.toggleSwitch(track, i);
      flash = { i, at: now, from, to: M.activeBranch(track[i]) };
      play('click');
      lastTap = { i, at: now, wasToggle: true };
    } else {
      tapMark = { i, at: now };
      lastTap = { i, at: now, wasToggle: false };
    }
    draw();
  }

  function restartLevel() {
    phase = 'play'; run = null; winAt = 0; releases = 0;
    history = []; track = M.newTrack(level.size);
    T().levelStart(level.n);
    draw();
  }

  // ---------- SMALL HELPERS ----------
  function roundRect(x, y, w, h, r) {
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const m = (v) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))));
    return '#' + ((1 << 24) + (m(r) << 16) + (m(g) << 8) + m(b)).toString(16).slice(1);
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const c = (sh) => Math.round((((pa >> sh) & 255) * (1 - t)) + (((pb >> sh) & 255) * t));
    return '#' + ((1 << 24) + (c(16) << 16) + (c(8) << 8) + c(0)).toString(16).slice(1);
  }

  // ---------- DEBUG ----------
  /* Small on purpose, and every handle is something a future session actually
     needs: reach a state, prove the level is completable, and press the real
     buttons rather than call the functions behind them. Every control in
     Crucible was dead through a full QC pass because each check called the
     game's own code. */
  window.__junction = {
    get state() {
      return {
        level: level.n, phase, mode: MODE, LW, LH, wide: L.wide, cell: L.g.cell,
        reduced: reduced(),
        sleepers: sleepersUsed(), budget: level.budget, releases,
        undo: history.length,
        junctions: track.reduce((a, c) => a + (M.isJunction(c) ? 1 : 0), 0),
        run: run ? {
          settled: run.settled, won: run.won, meetings: run.meetings,
          steps: run.steps,
          trains: run.trains.map((t) => ({ id: t.id, colour: t.colour, state: t.state, cell: t.cell })),
        } : null,
      };
    },
    // Lay the reference solution. Proves the level is completable and is the
    // fastest way to the win card.
    solve() { pushHistory(); track = M.layout(level, level.solution); phase = 'play'; draw(); return this.state; },
    flip(i) { M.toggleSwitch(track, i); draw(); return this.state; },
    // Run the settled outcome without a clock, for a check that cannot wait.
    settle(cap) {
      if (!run) { run = M.createRun(level, track); releases++; }
      let k = 0; while (!run.settled && k++ < (cap || 20000)) M.stepRun(level, track, run, M.RUN_DT);
      if (run.settled) onSettled();
      draw();
      return this.state;
    },
    /* Where everything is, in logical canvas coordinates, so a test can PRESS
       the buttons. Cell centres included: the board is a control surface too. */
    hits() {
      render(performance.now());
      const cells = [];
      for (let i = 0; i < level.size; i++) {
        const p = cellCentre(L.g, i);
        /* The PIECE, not just whether there is one. "Which way does the rail
           in this cell run" is the question every drawing check actually asks,
           and without it a test can only count sleepers and guess. */
        const t = track[i];
        cells.push({ i, r: M.rowOf(level, i), c: M.colOf(level, i),
                     x: Math.round(p.x), y: Math.round(p.y),
                     kind: level.kind[i], junction: M.isJunction(t),
                     face: level.face ? level.face[i] : -1,
                     segs: t ? t.segs.map((g) => g.slice()) : null });
      }
      return {
        mode: MODE, LW, LH, wide: L.wide, phase, cell: L.g.cell,
        board: { x: L.g.ox, y: L.g.oy, w: L.g.C * L.g.cell, h: L.g.R * L.g.cell },
        field: L.field,
        /* How much of the field is BOARD. This is the number the owner was
           pointing at, twice, on both frames, and the padding is what moves
           it: a fixed 7x7 covered 60% of the desktop field and 48% of a
           phone's, and no single shape does better than about 53% on both. */
        boardShare: +((L.g.C * L.g.cell * L.g.R * L.g.cell) /
                      Math.max(1, L.field.w * L.field.h)).toFixed(3),
        yard: null,
        hasPanel: false,
        yardFits: true,
        /* The button now rests on the field instead of on a panel, so the
           thing to check is that it does not rest on the BOARD. */
        actionOnBoard: !!L.hit.release && rectsOverlap(L.hit.release, {
          x: L.g.ox, y: L.g.oy, w: L.g.C * L.g.cell, h: L.g.R * L.g.cell }),
        /* WHERE THE BUTTON BELONGS DEPENDS ON THE LAYOUT. Landscape puts it in
           the top band so the field can be all board, which makes "inside the
           field" false by design there; portrait keeps it on the grass at the
           foot. What holds in both is that it is inside the FRAME and clear of
           the board, so that is what the containment test asks. */
        actionInFrame: !!L.hit.release &&
          L.hit.release.x >= 0 && L.hit.release.x + L.hit.release.w <= LW + 0.5 &&
          L.hit.release.y >= 0 && L.hit.release.y + L.hit.release.h <= LH + 0.5,
        /* THE BUTTON IS CHROME AND LIVES IN THE BAND, in both layouts now —
           landscape beside the numbers, portrait on the band's second row. It
           used to rest on the grass on a phone, and the strip it held there is
           precisely the space the owner asked to get back. So the assertion is
           the same for both: it must be clear of the field. */
        /* The button is chrome and belongs in a band — the top one in
           landscape, the foot one on a phone — so what has to hold is that it
           is CLEAR of the field, on either side of it. */
        actionWhereItBelongs: !L.hit.release ||
          L.hit.release.y + L.hit.release.h <= L.field.y + 0.5 ||
          L.hit.release.y >= L.field.y + L.field.h - 0.5,
        controls: { sound: L.hit.sound, undo: L.hit.undo, restart: L.hit.restart, rules: L.hit.rules },
        cta: L.hit.release || null,
        card: L.hit.cta || null,
        cellTarget: L.g.cell,
        ringTarget: Math.round(Math.max(22, L.g.cell * 0.75) * 2),
        rowRight: Math.round(L.rowRight || 0),
        readoutLeft: Math.round(L.readoutLeft || 0),
        /* Only meaningful when the row and the read-out share the band, which
           is the landscape layout. In portrait the row is at the bottom of the
           frame and the read-out is at the top, so comparing their x positions
           compares two different lines and reports a collision that is not
           there. It failed on all seven portrait sizes at once, which is the
           usual shape of a check being wrong rather than a layout being. */
        /* In landscape the row and the numbers share the top band and are laid
           out from opposite ends of it. In portrait they are on two different
           lines — the row in the band, the numbers at the foot of the field —
           so comparing their x positions compares two different rows and
           reports a collision that is not there. It once failed on all seven
           portrait sizes at once, which is the usual shape of a check being
           wrong rather than a layout being. What portrait must clear instead is
           the numbers against the BUTTON on their own line. */
        /* Whatever the numbers share their line with. In the band that is the
           control row; on the grass it is the action pill. Following L.wide
           instead of where the read-out ACTUALLY went would compare two
           different rows the moment the band gave up and handed the line to
           the field. */
        sameBand: !!(L.wide && L.plan && L.plan.inBand),
        bandClear: (L.wide && L.plan && L.plan.inBand)
          ? (L.readoutLeft || 0) - (L.rowRight || 0) > 0
          : (L.actCx - L.actW / 2) - ((L.readoutLeft || 0) + (L.readoutW || 0)) > 0,
        bandGap: (L.wide && L.plan && L.plan.inBand)
          ? Math.round((L.readoutLeft || 0) - (L.rowRight || 0))
          : Math.round((L.actCx - L.actW / 2) - ((L.readoutLeft || 0) + (L.readoutW || 0))),
        rowWithinFrame: (L.rowLeft || 0) >= 0 && (L.rowRight || 0) <= LW,
        rowLeft: Math.round(L.rowLeft || 0),
        cells,
      };
    },
    /* Does the card fit, and does anything draw through anything? Tested at
       480x360, the smallest frame /embed/ supports, where the card is 340 tall
       and the body is 88, so it WILL scroll, which is the design. */
    rulesFit(kind) {
      const c = cardLayout(kind || (phase === 'win' ? 'win' : 'rules'));
      const sum = c.HEADER + c.viewH + c.FOOTER;
      const demo = c.items.find((i) => i.t === 'demo');
      const first = c.items.find((i) => i.t === 'rule');
      const firstH = first ? first.lines.length * 22 + 13 : 0;
      return {
        kind: c.kind, LW, LH, mode: MODE,
        cardH: Math.round(c.ph), frameH: LH,
        headerH: c.HEADER, viewportH: Math.round(c.viewH), footerH: c.FOOTER,
        contentH: Math.round(c.contentH), scrollMax: Math.round(c.scrollMax),
        scrolls: c.scrollMax > 0,
        demoH: demo ? demo.h : 0, firstRuleH: firstH,
        firstRuleVisible: (demo ? demo.h : 0) + firstH <= c.viewH,
        firstRulePossible: firstH <= c.viewH,
        ctaTop: Math.round(c.ctaCy - UI.CTA.h / 2),
        bodyBottom: Math.round(c.viewTop + c.viewH),
        overlapPx: Math.round(Math.max(0, (c.viewTop + c.viewH) - (c.ctaCy - UI.CTA.h / 2))),
        onCanvas: c.py >= 0 && c.py + c.ph <= LH,
        fits: Math.abs(sum - c.ph) < 0.5 && c.py >= 0 && c.py + c.ph <= LH,
      };
    },
    /* Every drawn size, in one place, derived from the cell rather than
       restated. The question "what does shrinking the board cost" is a
       question about these numbers, and answering it by reading the draw code
       is how a number quietly stops being true. */
    /* The worst board the tiers will ever ask for: 11x11, five engines, four
       colours. It exists so the LAYOUT can be measured against tier 9 before
       tier 9 is designed, because every count in the panel and every size in
       the yard is a function of those two numbers, and finding out at level 65
       that four sheds do not fit is finding out too late. It carries no
       solution and is not a level. */
    stress() {
      core = level = M.buildLevel({
        n: 99, tier: 8, R: 11, C: 11,
        rocks: [[5, 0], [5, 1], [5, 2], [5, 3], [5, 5], [5, 6], [5, 7], [5, 8], [5, 10]],
        portals: [
          { at: [0, 1], face: M.S, queue: [0, 0] },
          { at: [10, 1], face: M.N, queue: [2] },
          { at: [10, 3], face: M.N, queue: [1] },
          { at: [5, 9], face: M.N, queue: [3] },
        ],
        depots: [
          { at: [0, 9], face: M.S, colour: 2 },
          { at: [8, 10], face: M.W, colour: 0 },
          { at: [9, 10], face: M.W, colour: 1 },
          { at: [0, 5], face: M.S, colour: 3 },
        ],
        budget: 60, par: 0,
      });
      track = M.newTrack(level.size);
      history = []; run = null; winAt = 0; phase = 'play';
      layout(); draw();
      return { ...this.state, art: this.art(), fit: this.hits().yardFits };
    },
    /* PUT A LEVEL ON THE BOARD. Only a session asking "what would this shape
       look like" needs it, and it is the honest way to answer: the real
       layout, the real renderer, a real level object — not a mock-up drawn
       beside the game. */
    install(lvl) {
      core = level = lvl;
      track = M.newTrack(level.size);
      history = []; run = null; winAt = 0; phase = 'play';
      layout(); draw();
      const t = this.hits();
      return { R: level.R, C: level.C, cell: t.cell, share: t.boardShare };
    },
    /* A BARE BOARD OF A GIVEN SHAPE, for answering "how much of the frame
       would a 6x9 fill" with the real layout rather than with arithmetic
       copied out of it. No puzzle, no solution: just the geometry. */
    shape(M2, R, C) {
      const Md = M2 || M;
      core = level = Md.buildLevel({
        n: 0, tier: 0, R, C, rocks: [],
        portals: [{ at: [0, 0], face: Md.S, queue: [0] }],
        depots: [{ at: [R - 1, C - 1], face: Md.N, colour: 0 }],
        budget: 999, par: 0,
      });
      track = Md.newTrack(level.size);
      history = []; run = null; winAt = 0; phase = 'play';
      layout(); draw();
      return { R, C, cell: L.g.cell };
    },
    /* Colour is never the only channel: every shed and every engine carries an
       engraved dot, bar, chevron or ring. That promise is a function of SIZE,
       and it is the first thing a smaller board spends. This renders the four
       marks at a given radius and reports how different the shapes actually
       are, so "can you still tell them apart at 11x11" has an answer.

       The metric is the Jaccard distance between the INK of two marks: the
       pixels where exactly one of them is dark, over the pixels where either
       is. A mean difference over the whole patch was the first attempt and it
       was worthless twice over — dominated by the white space the two marks
       share, and, at a large radius, quietly reading off the end of the canvas
       and calling black-versus-white a difference of 70%. Both controls below
       exist because of that. */
    markLegibility(r) {
      const R = r || L.g.cell * 0.16;
      const pad = Math.ceil(R * 1.9) + 3, side = pad * 2, step = side + 6;
      if (24 + step * 2 > Math.min(LW, LH)) {
        return { error: 'patches would not fit on this canvas at r=' + R };
      }
      const dpr = canvas.width / LW;
      const masks = [];
      ctx.save();
      for (let k = 0; k < 4; k++) {
        const cx = 24 + (k % 2) * step + pad, cy = 24 + ((k / 2) | 0) * step + pad;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(cx - pad, cy - pad, side, side);
        drawMark(cx, cy + R * 2.1, R, ENGINE[k].hi, S);
        const d = ctx.getImageData(Math.round((cx - pad) * dpr), Math.round((cy - pad) * dpr),
                                   Math.round(side * dpr), Math.round(side * dpr)).data;
        const m = [];
        for (let i = 0; i < d.length; i += 4) m.push((d[i] + d[i + 1] + d[i + 2]) / 3 < 170 ? 1 : 0);
        masks.push({ mark: ENGINE[k].mark, m, ink: m.reduce((a, v) => a + v, 0) });
      }
      ctx.restore();
      const jaccard = (a, b) => {
        let inter = 0, uni = 0;
        for (let i = 0; i < a.m.length; i++) { if (a.m[i] & b.m[i]) inter++; if (a.m[i] | b.m[i]) uni++; }
        return uni ? Math.round((1 - inter / uni) * 1000) / 10 : 0;
      };
      const pairs = [];
      let worst = 101, worstPair = '';
      for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
        const d = jaccard(masks[a], masks[b]);
        pairs.push(masks[a].mark + ' vs ' + masks[b].mark + ': ' + d + '%');
        if (d < worst) { worst = d; worstPair = masks[a].mark + '/' + masks[b].mark; }
      }
      draw();
      return {
        radius: Math.round(R * 10) / 10,
        // A mark against ITSELF must be 0, or the metric cannot report "same".
        selfControl: jaccard(masks[0], masks[0]),
        inkPixels: masks.map((m) => m.ink),
        pairs, worstPairPercent: worst, worstPair,
      };
    },
    art(cell) {
      const c = cell || L.g.cell;
      const engine = c * 0.68;
      return {
        cell: c,
        grid: level.C + 'x' + level.R,
        engineLen: r1(engine), engineWid: r1(engine * 0.6),
        engineWindow: r1(engine * 0.16) + ' x ' + r1(engine * 0.6 * 0.44),
        engineMark: r1(engine * 0.13),
        ringRadius: r1(c * 0.155),
        bladeLen: r1(c * 0.40 - c * 0.155 * 0.7),
        railGauge: r1(c * 0.23), railWidth: r1(Math.max(1.1, c * 0.05)),
        tieLen: r1(c * 0.40), tieSpacing: r1(c / 5),
        archW: r1(c * 0.58), archH: r1(c * 0.62),
        shedMark: r1(c * 0.16),
        tapTarget: c,
        cells: level.R * level.C,
      };
      function r1(v) { return Math.round(v * 10) / 10; }
    },
    // Sample the PAINTED pixel, not the source hex. The screen is the only
    // ground that counts, and a gradient under a thing is not its source hex.
    sample(x, y) {
      const dpr = canvas.width / LW;
      const d = ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
      return [d[0], d[1], d[2]];
    },
    model: M,
    get level() { return level; },
    get track() { return track; },
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
  if (jump) core = level = M.getLevel(jump);
  layout();
  if (save.seen && !params.get('rules')) phase = 'play';
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', () => draw());
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);   // iOS URL-bar collapse
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  draw();
})();
