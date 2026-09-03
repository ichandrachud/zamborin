/* ============================================================
   Junction · A Zamborin Game — the yard (milestone 1)
   ============================================================

   The rules are in model.js and there are none in here. This file is the
   renderer and the hands: it draws a yard, turns a drag into track, and turns
   a tap into a switch. Everything it knows about what a train does, it asks.

   TWO LAYOUTS, NOT ONE SCALED. A square grid is the one board shape that fits
   both frames without reflowing, which is why the brief specifies one, so the
   difference between the layouts is where the PAPERWORK goes. Portrait puts
   the tunnel queue in a strip under the board and the controls at the bottom
   where a thumb is. Landscape, which includes the 760x600 desktop frame and a
   phone turned sideways, puts the queue in a column beside the board and the
   control row in the top band. Same level, same budget, same square.

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
  let level = M.getLevel(1);
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
  /* One top band, not two edges: controls sit left in it and the read-out sits
     right in it, on the same centre line. Portrait moves the controls to the
     bottom because the top of a tall screen is the one place a control should
     not be when a thumb has to reach it. */
  const SIDE_PAD = 30;
  /* The stacked portrait layout carries about 300px of fixed furniture below
     the board: the queue strip, the CTA and the control row, none of which may
     be scaled. On an aspect test alone a 480x420 frame counts as portrait by a
     hair and gets 56px left for a seven-row board, which collapses it to the
     8px floor. So the layout is chosen by whether it FITS as well as by shape:
     under STACK_MIN_H the landscape arrangement is used whatever the aspect.
     500 and not higher, because 320x568 is the smallest phone still in service
     and it must keep its controls at the bottom. */
  const STACK_MIN_H = 500;
  const wide = () => LW >= LH * 1.15 || LH < STACK_MIN_H;
  const topBand = () => 56;
  const QUEUE_H = 112;   // the landscape column: label, engines, tally
  /* The board's own margin in portrait, and it is NOT SIDE_PAD. Band content
     still gets 30 because type needs a margin; a board does not, and on a
     phone the board is bound by width, so this number IS the cell size. */
  const BOARD_PAD = 10;

  function layout() {
    const R = level.R, C = level.C;
    L.wide = wide();
    L.hit = {};
    L.plan = null;
    if (L.wide) {
      const bot = 76;
      L.ctrlCy = Math.round(topBand() / 2);
      const colW = Math.round(Math.max(150, Math.min(214, LW * 0.28)));
      const gap = 18;
      const availW = Math.max(60, LW - SIDE_PAD * 2 - colW - gap);
      const availH = Math.max(60, LH - topBand() - bot);
      const cell = Math.max(8, Math.floor(Math.min(availW / C, availH / R)));
      const bw = C * cell, bh = R * cell;
      const ox = Math.round(SIDE_PAD + (availW - bw) / 2);
      const oy = Math.round(topBand() + (availH - bh) / 2);
      L.g = { ox, oy, cell, R, C };
      L.yard = { x: SIDE_PAD + availW + gap, y: topBand() + 10, w: colW, h: availH - 20, vertical: true };
      L.ctaCx = ox + bw / 2;
      L.ctaCy = Math.round(LH - bot / 2);
    } else {
      /* PORTRAIT IS ITS OWN GAME, not the landscape one folded up. The chrome
         was taking 364 of 852 pixels — a control row, a CTA and a whole yard
         panel below the board, with the board itself squeezed to 39% of the
         screen — so the phone was being asked to display a desktop.

         The controls go to the TOP. That is a deliberate departure from a
         locked rule: CONTRIBUTING and DESIGN-SYSTEM 2.1 both put them at the
         bottom on phones, for thumb reach, and every other game on the site
         does. The owner asked for it in order to give the board the screen.
         The one thing kept at the bottom is the CTA, because RELEASE is the
         button pressed over and over and it is the one a thumb has to reach.

         The panel goes entirely. Everything it held is on the board already:
         the engines waiting in a tunnel are drawn in its mouth, and an arch
         lights when its own engine is home. The only figure that was not on
         the board is the sleeper tally, which moves into the read-out.

         And the board takes the width. It is the only lever that exists: a
         square grid on a tall phone is bound by WIDTH, so every pixel of side
         margin is a pixel off the cell, and no amount of moving furniture
         around changes that. 10 rather than the site's 30, which is the second
         departure and takes the 7x7 cell from 47 to 53. */
      L.ctrlCy = 30;
      const ctaCy = Math.round(LH - 20 - UI.CTA.h / 2);
      const readoutY = Math.round(ctaCy - UI.CTA.h / 2 - 22);
      const top = topBand() + 10;
      const availW = Math.max(60, LW - BOARD_PAD * 2);
      const availH = Math.max(60, (readoutY - 20) - top);
      const cell = Math.max(8, Math.floor(Math.min(availW / C, availH / R)));
      const bw = C * cell, bh = R * cell;
      L.g = {
        ox: Math.round((LW - bw) / 2),
        oy: Math.round(top + (availH - bh) / 2),
        cell, R, C,
      };
      L.yard = null;              // the board is the legend
      L.readoutY = readoutY;
      L.ctaCx = LW / 2;
      L.ctaCy = ctaCy;
    }
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
  function drawTies(d, cell, alpha, hot) {
    const half = cell * 0.20, w = Math.max(1.1, cell * 0.045);
    ctx.strokeStyle = hot ? 'rgba(190,206,232,' + alpha + ')' : 'rgba(90,106,132,' + alpha + ')';
    ctx.lineWidth = w; ctx.lineCap = 'butt';
    for (let k = 0; k < 5; k++) {
      const t = (k + 0.5) / 5;
      const p = pointOn(d, t), h = headingOn(d, t) + Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(h) * half, p.y + Math.sin(h) * half);
      ctx.lineTo(p.x - Math.cos(h) * half, p.y - Math.sin(h) * half);
      ctx.stroke();
    }
  }
  // Ties first, then twin rails on top: the order a real board is built in,
  // and the only order in which the rails read as sitting on the sleepers.
  function drawSegment(g, i, a, b, opts) {
    const o = opts || {};
    const d = pathOf(g, i, a, b), cell = g.cell;
    drawTies(d, cell, (o.dim ? 0.34 : 0.55) * (o.alpha == null ? 1 : o.alpha), o.hot);
    const gauge = cell * 0.115, w = Math.max(1.1, cell * 0.05);
    /* The branch the switch is NOT feeding is still real rail — a train that
       reaches it ALONG that branch still takes it to the trunk, whatever the
       switch says — so it is dimmed, not removed. 0.60 and no lower: measured
       on the painted pixel against the lightest corner of the felt, 0.38 came
       out at 2.37:1 against a 3:1 bar for a graphical object and 0.59 is where
       it crosses. The visible difference is 3.0:1 against 5.8:1, which is a
       real step in value, and the BLADE on the stand is what actually carries
       the decision. Dimming was never going to carry it on its own. */
    const col = o.dim ? 'rgba(159,176,200,0.60)' : (o.hot ? ART.railHot : ART.rail);
    railStroke(d, -gauge, w, col);
    railStroke(d, gauge, w, col);
  }

  function drawTrackCell(g, i, c, now) {
    if (!c) return;
    if (c.segs.length === 1) { drawSegment(g, i, c.segs[0][0], c.segs[0][1]); return; }
    const trunk = M.trunkOf(c);
    const live = M.activeBranch(c), idle = M.idleBranch(c);
    const hot = flash && flash.i === i && now - flash.at < 400;
    drawSegment(g, i, trunk, idle, { dim: true });
    drawSegment(g, i, trunk, live, { hot });
    drawSwitchStand(g, i, c, now);
  }

  /* The switch shows its answer. A brass ring at the centre of the cell with a
     lever lying along the branch it feeds, swinging over 150ms when tapped, so
     the change is something you watch rather than something you infer. Glow is
     a thin bright core with a tight feather, never a wash. */
  function drawSwitchStand(g, i, c, now) {
    const p = cellCentre(g, i), cell = g.cell;
    const r = cell * 0.155;
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
    ctx.lineTo(p.x + cos * cell * 0.40, p.y + sin * cell * 0.40);
    ctx.strokeStyle = ART.brassDeep; ctx.lineWidth = Math.max(3, cell * 0.105);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x + cos * r * 0.7, p.y + sin * r * 0.7);
    ctx.lineTo(p.x + cos * cell * 0.38, p.y + sin * cell * 0.38);
    ctx.strokeStyle = ART.brass; ctx.lineWidth = Math.max(1.6, cell * 0.055);
    ctx.stroke();

    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,26,38,0.85)'; ctx.fill();
    ctx.strokeStyle = ART.brassDeep; ctx.lineWidth = Math.max(2.4, cell * 0.08); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = ART.brass; ctx.lineWidth = Math.max(1, cell * 0.032); ctx.stroke();
    ctx.restore();
  }
  const sideAngle = (s) => (s === N ? -Math.PI / 2 : s === E ? 0 : s === S ? Math.PI / 2 : Math.PI);

  // ---------- PAINTING THE YARD ----------
  function drawRock(g, i) {
    const b = cellRect(g, i), cell = b.s;
    const p = { x: b.x + cell / 2, y: b.y + cell / 2 };
    const rr = cell * 0.34;
    // Deterministic wobble from the cell index: no Math.random anywhere, so
    // the same board draws the same rocks on every load.
    const seed = (i * 2654435761) >>> 0;
    ctx.save();
    ctx.beginPath();
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const wob = 0.82 + (((seed >> (k * 3)) & 7) / 7) * 0.30;
      const x = p.x + Math.cos(a) * rr * wob, y = p.y + Math.sin(a) * rr * wob * 0.9;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const gr = ctx.createLinearGradient(p.x - rr, p.y - rr, p.x + rr * 0.6, p.y + rr);
    gr.addColorStop(0, ART.rockHi); gr.addColorStop(1, ART.rockLo);
    ctx.fillStyle = gr; ctx.fill();
    /* The lit rim, up and left, and it is doing a job rather than decorating.
       A dark stone on dark felt measured 2.15:1 against a 3:1 bar, and the
       answer is NOT to lighten the whole rock: an obstacle that reads as
       bright as the rails is an obstacle the eye goes to first. So the body
       stays dark and the EDGE carries the contrast, which is what the design
       system means by an edge made of value. */
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = ART.rockRim;
    ctx.lineWidth = Math.max(1.6, cell * 0.055);
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr * 0.98, Math.PI * 0.78, Math.PI * 1.86);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(p.x - rr * 0.30, p.y - rr * 0.34, rr * 0.26, rr * 0.15, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
    ctx.restore();
  }

  /* An arch: near-black opening, a band across its head, and for a shed a
     coloured interior glow. Drawn in a local frame with the mouth facing down
     and then turned to face the yard. */
  function archPath(w, h, bottomY) {
    const top = bottomY - h;
    ctx.beginPath();
    ctx.moveTo(-w / 2, bottomY);
    ctx.lineTo(-w / 2, top + w / 2);
    ctx.arc(0, top + w / 2, w / 2, Math.PI, 0);
    ctx.lineTo(w / 2, bottomY);
    ctx.closePath();
  }

  function drawArch(g, i, face, colour, lit, count) {
    const b = cellRect(g, i), cell = b.s;
    const p = { x: b.x + cell / 2, y: b.y + cell / 2 };
    const w = cell * 0.58, h = cell * 0.62;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(face === N ? Math.PI : face === E ? -Math.PI / 2 : face === S ? 0 : Math.PI / 2);
    // Nudged toward the mouth so the lintel is not flush with the board edge:
    // every portal and shed sits on an edge cell by definition, so the head of
    // the arch is always the thing nearest the frame.
    ctx.translate(0, cell * 0.045);

    /* THE STONE FACE, and it exists because of a measurement. A near-black
       opening sitting straight on the felt is an edge of 1.31:1: the two are
       both dark and the boundary between them is not there to be seen, which
       is why the tunnels read as vague dark squares rather than as mouths.
       A real portal has a stone face around the hole, so the hole is a hole in
       something. Now the pairs that touch are stone against felt and mouth
       against stone, and both of those have somewhere to go. */
    archPath(w * 1.36, h * 1.20, h / 2);
    const fg = ctx.createLinearGradient(0, h / 2 - h * 1.20, 0, h / 2);
    fg.addColorStop(0, ART.stoneHi);
    fg.addColorStop(1, ART.stone);
    ctx.fillStyle = fg; ctx.fill();

    archPath(w, h, h / 2);
    const mouth = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    mouth.addColorStop(0, ART.archMouth);
    mouth.addColorStop(1, colour ? mix(ART.archMouth, colour, lit ? 0.34 : 0.16) : '#141A26');
    ctx.fillStyle = mouth; ctx.fill();
    if (lit) {
      ctx.save(); ctx.clip();
      const gl = ctx.createRadialGradient(0, h * 0.2, 0, 0, h * 0.2, h);
      gl.addColorStop(0, hexA(colour, 0.55)); gl.addColorStop(1, hexA(colour, 0));
      ctx.fillStyle = gl; ctx.fillRect(-w, -h, w * 2, h * 2);
      ctx.restore();
    }

    // The lintel across the head of the face. On a shed it is the identity.
    const lh = cell * 0.15, lw = w * 1.48, ly = h / 2 - h * 1.20 - lh * 0.42;
    ctx.beginPath();
    roundRect(-lw / 2, ly, lw, lh, lh * 0.40);
    const lg = ctx.createLinearGradient(0, ly, 0, ly + lh);
    if (colour) {
      lg.addColorStop(0, shade(colour, lit ? 0.34 : 0.12));
      lg.addColorStop(1, shade(colour, -0.22));
    } else {
      lg.addColorStop(0, ART.stoneHi); lg.addColorStop(1, ART.stone);
    }
    ctx.fillStyle = lg; ctx.fill();
    ctx.restore();
    if (colour) drawMark(p.x, p.y - cell * 0.03, cell * 0.16, colour, face);
    if (count > 0) drawCount(b.x + cell * 0.86, b.y + cell * 0.14, cell * 0.19, count);
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
  function drawEngine(x, y, heading, colour, size, opts) {
    const o = opts || {};
    const len = size, wid = size * 0.6;
    const e = ENGINE[colour] || ENGINE[0];
    ctx.save();
    ctx.save();
    ctx.translate(x, y); ctx.rotate(heading);
    ctx.beginPath(); roundRect(-len / 2, -wid / 2, len, wid, wid * 0.34);
    ctx.restore();
    const gr = ctx.createLinearGradient(0, y - wid * 0.7, 0, y + wid * 0.7);
    gr.addColorStop(0, shade(e.hi, 0.10));
    gr.addColorStop(1, e.lo);
    ctx.fillStyle = gr; ctx.fill();

    ctx.save();
    ctx.translate(x, y); ctx.rotate(heading);
    // flanks: the wheels, implied
    ctx.fillStyle = 'rgba(8,12,20,0.34)';
    ctx.fillRect(-len * 0.36, -wid / 2, len * 0.72, wid * 0.14);
    ctx.fillRect(-len * 0.36, wid / 2 - wid * 0.14, len * 0.72, wid * 0.14);
    // roof band across the middle
    ctx.fillStyle = hexA(shade(e.hi, 0.26), 0.85);
    ctx.beginPath(); roundRect(-len * 0.10, -wid * 0.30, len * 0.26, wid * 0.60, wid * 0.14); ctx.fill();
    // the one lit window, at the front
    ctx.fillStyle = o.dark ? 'rgba(214,236,255,0.28)' : ART.win;
    ctx.beginPath(); roundRect(len * 0.20, -wid * 0.22, len * 0.16, wid * 0.44, wid * 0.10); ctx.fill();
    // the engraved mark
    ctx.strokeStyle = 'rgba(12,16,26,0.55)'; ctx.fillStyle = 'rgba(12,16,26,0.55)';
    ctx.lineWidth = Math.max(1, size * 0.055); ctx.lineCap = 'round';
    const r = size * 0.13, mx = -len * 0.26;
    if (e.mark === 'dot') { ctx.beginPath(); ctx.arc(mx, 0, r * 0.6, 0, Math.PI * 2); ctx.fill(); }
    else if (e.mark === 'bar') { ctx.beginPath(); ctx.moveTo(mx, -r * 0.7); ctx.lineTo(mx, r * 0.7); ctx.stroke(); }
    else if (e.mark === 'chevron') {
      ctx.beginPath(); ctx.moveTo(mx - r * 0.4, -r * 0.7); ctx.lineTo(mx + r * 0.35, 0); ctx.lineTo(mx - r * 0.4, r * 0.7); ctx.stroke();
    } else { ctx.beginPath(); ctx.arc(mx, 0, r * 0.6, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
    ctx.restore();
  }

  /* The signature detail: the lit window paints a faint moving glow onto the
     rail ahead. The engine carries its own light, and it is the one thing that
     makes the yard read as night rather than as a diagram. */
  function drawLamp(x, y, heading, size) {
    const ax = x + Math.cos(heading) * size * 0.9, ay = y + Math.sin(heading) * size * 0.9;
    const gl = ctx.createRadialGradient(ax, ay, 0, ax, ay, size * 1.15);
    gl.addColorStop(0, 'rgba(214,236,255,0.20)');
    gl.addColorStop(1, 'rgba(214,236,255,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(ax, ay, size * 1.15, 0, Math.PI * 2); ctx.fill();
  }

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
    if (!plain) {
      ctx.beginPath(); roundRect(g.ox, g.oy, bw, bh, Math.min(18, g.cell * 0.4));
      ctx.clip();
      const warm = o.warm || 0;
      const pg = ctx.createLinearGradient(g.ox, g.oy, g.ox + bw * 0.5, g.oy + bh);
      pg.addColorStop(0, shade(TOK.bgPanel, 0.02 + warm));
      pg.addColorStop(1, shade(TOK.bgCard, -0.10 + warm * 0.6));
      ctx.fillStyle = pg; ctx.fillRect(g.ox, g.oy, bw, bh);
    }

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

    for (let i = 0; i < lvl.size; i++) if (lvl.kind[i] === M.ROCK) drawRock(g, i);
    for (let i = 0; i < lvl.size; i++) drawTrackCell(g, i, trk[i], now);

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

    /* The queue is ON THE BOARD, which is what lets the phone drop the panel
       entirely: the next engine out of a tunnel sits in its mouth, in its own
       colour, and a badge appears only when more than one is behind it. The
       brief asked for the order to be shown at the tunnel mouth, and a shape
       in the hole is a better answer than a legend somewhere else. */
    for (let pi = 0; pi < lvl.portals.length; pi++) {
      const p = lvl.portals[pi];
      const q = rn
        ? rn.trains.filter((t) => t.portal === pi && t.state === 'queued').map((t) => t.colour)
        : p.queue.slice();
      drawArch(g, p.i, p.face, null, false, q.length > 1 ? q.length : 0);
      if (q.length) {
        const c0 = cellCentre(g, p.i);
        const back = g.cell * 0.10;
        drawEngine(c0.x - Math.cos(sideAngle(p.face)) * back,
                   c0.y - Math.sin(sideAngle(p.face)) * back,
                   sideAngle(p.face), q[0], g.cell * 0.52, { dark: true });
      }
    }
    for (const d of lvl.depots) {
      const home = rn ? rn.trains.filter((t) => t.state === 'parked' && t.cell === d.i && t.colour === d.colour) : [];
      const lit = home.length > 0 && (!o.litAt || now >= o.litAt(home[0]));
      drawArch(g, d.i, d.face, ENGINE[d.colour].hi, lit, 0);
    }

    if (rn) drawTrains(g, lvl, rn, now);
    ctx.restore();

    if (!plain) {
      // the frame edge, a hairline of value rather than a border
      ctx.strokeStyle = TOK.tint10; ctx.lineWidth = 1;
      ctx.beginPath();
      roundRect(g.ox + 0.5, g.oy + 0.5, bw - 1, bh - 1, Math.min(18, g.cell * 0.4));
      ctx.stroke();
    }
  }

  function drawTrains(g, lvl, rn, now) {
    const size = g.cell * 0.68;
    for (const t of rn.trains) {
      if (t.state === 'queued') continue;
      const d = pathFor(g, t);
      // The nose is what the model tracks, so the body hangs back from it and
      // two engines meeting stop nose to nose rather than overlapping.
      const back = 0.34;
      const at = reduced() ? 0.5 : t.prog - back;
      const p = posOn(d, at);
      const heading = headingOn(d, Math.max(0, Math.min(1, at)));
      if (t.state !== 'parked' && t.state !== 'parking') drawLamp(p.x, p.y, heading, size * 0.8);
      drawEngine(p.x, p.y, heading, t.colour, size, { dark: t.state === 'parked' });
      if (t.state === 'waiting' || t.state === 'stopped') drawSteam(p.x, p.y - size * 0.1, size * 0.5, now);
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
    const rowIcon = wS + wU + wR + UI.PILL.iconW + gap * 3;
    /* Landscape keeps the tally in the panel beside the board, so the band
       carries the level and nothing else. Portrait has no panel, so the tally
       comes here — and it is at the BOTTOM of the frame, on its own line above
       the CTA, where nothing can collide with it. */
    const used = sleepersUsed();
    const texts = L.wide
      ? ['LEVEL ' + level.n, 'L' + level.n]
      : ['LEVEL ' + level.n + '   ·   SLEEPERS ' + used + ' / ' + level.budget,
         'LEVEL ' + level.n + '  ·  ' + used + ' / ' + level.budget,
         'L' + level.n + '  ·  ' + used + '/' + level.budget];
    const hs0 = Math.max(0.66, Math.min(1, LW / 620));
    const width = (t, hs) => {
      ctx.font = '600 ' + Math.round(16 * hs) + 'px Inter, sans-serif';
      return ctx.measureText(t).width;
    };
    if (!L.wide) {
      // Portrait puts the row alone in the top band and the read-out alone on
      // its own line at the foot, so neither can crowd the other: the only
      // questions are whether each fits its own width.
      const icon = rowFull > LW - 20;
      let text = texts[0], hs = hs0, k = 0;
      while (width(text, hs) > LW - 24 && k < texts.length - 1) text = texts[++k];
      while (width(text, hs) > LW - 24 && hs > 0.655) hs -= 0.02;
      return { iconRules: icon, text, hs };
    }
    for (const icon of [false, true]) {
      const row = icon ? rowIcon : rowFull;
      for (const t of texts) {
        for (let hs = hs0; hs >= 0.655; hs -= 0.02) {
          if (SIDE_PAD + row + 24 + width(t, hs) <= LW - SIDE_PAD) return { iconRules: icon, text: t, hs };
        }
      }
    }
    return { iconRules: true, text: texts[1], hs: 0.66 };
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

  /* One right-aligned line, in the same band as the control row, laid out from
     the opposite end of it. Nothing else checks whether the two collide, so
     this measures the room the row left and shrinks the type into it with a
     floor. */
  function drawReadout() {
    const plan = L.plan;
    if (!L.wide) {
      ctx.font = '600 ' + Math.round(16 * plan.hs) + 'px Inter, sans-serif';
      ctx.fillStyle = TOK.ink72;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(plan.text, LW / 2, L.readoutY);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      L.readoutW = ctx.measureText(plan.text).width;
      L.readoutLeft = LW / 2 - L.readoutW / 2;
      return;
    }
    const cy = Math.round(topBand() / 2);
    /* The sleeper tally sits in the yard panel, not here. It was in both, and
       in a landscape frame the two strings collided; the brief puts it with the
       tunnel queue in the first place, and one number in one place is also one
       fewer thing to keep in step. */
    const txt = plan.text;
    ctx.font = '600 ' + Math.round(16 * plan.hs) + 'px Inter, sans-serif';
    ctx.fillStyle = TOK.ink72;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, LW - SIDE_PAD, cy);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    L.readoutW = ctx.measureText(txt).width;
    L.readoutLeft = LW - SIDE_PAD - L.readoutW;
  }

  /* The yard's paperwork: which engines are still in the tunnel and which
     sheds have their own back. Every figure here is something the board is
     already showing, so it is a read-out and not a solving aid. */
  function drawYard(now) {
    const y = L.yard;
    if (!y) { L.yardInk = null; return; }   // portrait has no panel: the board is the legend
    ctx.save();
    ctx.beginPath(); roundRect(y.x, y.y, y.w, y.h, 14);
    ctx.fillStyle = TOK.tint03; ctx.fill();
    ctx.strokeStyle = TOK.tint10; ctx.lineWidth = 1;
    ctx.beginPath(); roundRect(y.x + 0.5, y.y + 0.5, y.w - 1, y.h - 1, 14); ctx.stroke();

    const waiting = [];
    for (const p of level.portals) {
      const pi = level.portals.indexOf(p);
      const qs = run
        ? run.trains.filter((t) => t.portal === pi && t.state === 'queued')
        : p.queue.map((c) => ({ colour: c }));
      for (const t of qs) waiting.push(t.colour);
    }
    const sheds = level.depots.map((d) => ({
      colour: d.colour,
      home: run ? run.trains.filter((t) => t.state === 'parked' && t.cell === d.i && t.colour === d.colour).length : 0,
      need: level.portals.reduce((a, p) => a + p.queue.filter((c) => c === d.colour).length, 0),
    }));

    /* The panel has to hold whatever the LEVEL holds, and a tier 9 board holds
       five engines and four sheds where level 1 holds two and two. Laid out
       for two, the third shed drew straight through the floor of the panel and
       the fifth engine would have run into the divider. So nothing here is
       sized for a count: the queue takes its pitch from the room it has, and
       `ink()` records what was actually painted so a test can see the day one
       of them stops fitting. */
    L.yardInk = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const ink = (x0, y0, x1, y1) => {
      L.yardInk.x0 = Math.min(L.yardInk.x0, x0); L.yardInk.y0 = Math.min(L.yardInk.y0, y0);
      L.yardInk.x1 = Math.max(L.yardInk.x1, x1); L.yardInk.y1 = Math.max(L.yardInk.y1, y1);
    };
    if (y.vertical) {
      let yy = y.y + 22;
      label('IN THE TUNNEL', y.x + 16, yy); yy += 16;
      if (!waiting.length) dim('none waiting', y.x + 16, yy + 8);
      else queue(y.x + 24, yy + 12, y.w - 44);
      yy += 46;
      rule(y.x + 14, yy); yy += 24;
      label('SHEDS', y.x + 16, yy); yy += 24;
      const ty = y.y + y.h - 20;
      packSheds(y.x + 24, yy, y.w - 40, (ty - 30) - yy);
      rule(y.x + 14, ty - 26);
      label('SLEEPERS', y.x + 16, ty - 13);
      tallyValue(y.x + 16, ty + 6);
    } else {
      /* Two ROWS, not two columns. The sheds used to sit beside the tunnel in
         the right half of the strip, which is fine for the two colours level 1
         has and runs out at three: on a 330 wide frame the count of one shed
         printed straight through the chip of the next, and a tier 9 board has
         four. So the sheds get the full width on a row of their own, and a
         colour with one engine shows no fraction at all, because the chip
         lighting up already says it. */
      label('IN THE TUNNEL', y.x + 16, y.y + 18);
      const tallyX = y.x + y.w * 0.62;
      label('SLEEPERS', tallyX, y.y + 18);
      if (!waiting.length) dim('none waiting', y.x + 16, y.y + 46);
      else queue(y.x + 26, y.y + 46, tallyX - y.x - 44);
      tallyValue(tallyX, y.y + 46);
      rule(y.x + 14, y.y + 68);
      label('SHEDS', y.x + 16, y.y + 92);
      packSheds(y.x + 74, y.y + 92, y.w - 90, y.h - 76);
    }
    ctx.restore();
    void now;

    /* Sheds go in a column while there is height for one and in a wrapping row
       when there is not. Both layouts pack the same way for the same reason:
       a fixed 28px pitch fitted three colours in a 600 tall frame and put the
       third through the floor of a 320 tall one, which is a landscape phone.
       Nothing here is sized for a count. */
    function packSheds(x, yy, w, h) {
      const stack = sheds.length * 28 <= h;
      if (stack) { let cy = yy; for (const sh of sheds) { shedChip(x, cy, sh); cy += 28; } return; }
      let cx = x, cy = yy;
      for (const sh of sheds) {
        const wide2 = sh.need > 1 ? 62 : 20;
        if (cx > x && cx + wide2 > x + w) { cx = x; cy += 26; }
        cx += shedChip(cx, cy, sh) + 16;
      }
    }
    function rule(x0, yy) {
      ctx.strokeStyle = TOK.tint10; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(y.x + y.w - 14, yy); ctx.stroke();
    }
    function queue(x, yy, room) {
      const pitch = Math.min(30, room / Math.max(1, waiting.length));
      const sz = Math.max(14, Math.min(26, pitch - 4));
      for (let k = 0; k < waiting.length; k++) {
        const ex = x + k * pitch;
        drawEngine(ex, yy, 0, waiting[k], sz, {});
        ink(ex - sz / 2, yy - sz * 0.32, ex + sz / 2, yy + sz * 0.32);
      }
    }
    /* The budget, and it is a puzzle constraint rather than a score: no timer,
       no par, nothing counting up. It turns amber as the last few go, which is
       information the board is already showing, just harder to count. */
    function tallyValue(x, yy) {
      const used = sleepersUsed(), left = level.budget - used;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = left <= 2 ? TOK.accent2 : TOK.ink90;
      ctx.font = '700 16px Inter, sans-serif';
      const t = used + ' / ' + level.budget;
      ctx.fillText(t, x, yy);
      ink(x, yy - 10, x + ctx.measureText(t).width, yy + 10);
    }
    function label(t, x, yy) {
      ink(x, yy - 7, x + 90, yy + 7);
      ctx.fillStyle = TOK.ink72;
      ctx.font = '700 12px Inter, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, x, yy);
    }
    function dim(t, x, yy) {
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.font = '600 14px Inter, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, x, yy);
    }
    /* Returns the width it used, so a row can pack itself without knowing what
       is in one. A colour with a single engine shows no fraction: the chip
       lights when its engine is home, which is exactly what the arch on the
       board does, and the same fact in two notations is one too many. */
    function shedChip(x, yy, sh) {
      const col = ENGINE[sh.colour].hi;
      const lit = sh.home >= sh.need;
      ctx.beginPath(); roundRect(x - 9, yy - 8, 20, 16, 5);
      const gr = ctx.createLinearGradient(0, yy - 8, 0, yy + 8);
      gr.addColorStop(0, shade(col, lit ? 0.30 : 0.00));
      gr.addColorStop(1, shade(col, lit ? -0.08 : -0.44));
      ctx.fillStyle = gr; ctx.fill();
      drawMark(x + 1, yy + 15.5, 6, col, S);
      let w = 20;
      if (sh.need > 1) {
        ctx.fillStyle = lit ? TOK.green : TOK.ink72;
        ctx.font = '700 14px Inter, sans-serif';
        ctx.textBaseline = 'middle';
        const t = sh.home + ' / ' + sh.need;
        ctx.fillText(t, x + 18, yy);
        w = 18 + ctx.measureText(t).width;
      }
      ink(x - 9, yy - 9, x + w, yy + 9);
      return w;
    }
  }

  // ---------- CARDS ----------
  const RULES = [
    'Drag across the yard to lay track. Lifting a piece again is free, and expected.',
    'Where two lines meet, a junction forms. Tap its brass ring to set which way it points.',
    'An engine arriving on a branch always joins the main line. Only an engine arriving ON the main line follows the switch.',
    'Press RELEASE. Every engine takes the rails exactly as set, and parks in whatever shed it reaches.',
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
    const ph = Math.min(LH - 20, 420);
    const px = Math.round((LW - pw) / 2);
    const py = Math.max(10, Math.round((LH - ph) / 2));
    const HEADER = 154, FOOTER = 98;
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
    const sub = wrapText(c.subtitle, c.pw - 68, 17).slice(0, 2);
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
    const w2 = L.wide ? 0 : warm;
    const bg = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
    bg.addColorStop(0, shade(TOK.bgPanel, w2));
    bg.addColorStop(0.6, shade(TOK.bgCard, w2));
    bg.addColorStop(1, shade(TOK.bg, w2));
    ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);
    L.plan = bandPlan();

    // The lamp warms 8% for two seconds when the yard comes right.
    drawBoard(L.g, level, track, run, now, {
      ghost: stroke && stroke.ok ? stroke.adds : null,
      warm: L.wide ? warm : 0,
      plain: !L.wide,
      litAt: (t) => winAt + (reduced() ? 0 : 200 * arrivalRank(t)),
    });
    drawYard(now);
    drawControls(now);
    drawReadout();

    const label = !run ? 'RELEASE' : (run.settled ? 'RESET' : 'HALT');
    L.hit.release = UI.drawCTA(ctx, label, L.ctaCx, L.ctaCy, TOK.accent);

    /* The win IS the yard working, so the card waits for it. The arches light
       in arrival order 200ms apart and the lamp warms over two seconds, and a
       card drawn the instant the last engine parks covers every bit of that.
       L.hit.cta is only set while the card is actually drawn, so nothing can
       be pressed through the gap either. */
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
        cells.push({ i, r: M.rowOf(level, i), c: M.colOf(level, i),
                     x: Math.round(p.x), y: Math.round(p.y),
                     kind: level.kind[i], junction: M.isJunction(track[i]) });
      }
      return {
        mode: MODE, LW, LH, wide: L.wide, phase, cell: L.g.cell,
        board: { x: L.g.ox, y: L.g.oy, w: L.g.C * L.g.cell, h: L.g.R * L.g.cell },
        yard: L.yard,
        hasPanel: !!L.yard,
        /* Does everything the panel draws still fit inside the panel? With
           three sheds instead of two the third row drew through the floor of
           it, and nothing could see that but an eye. */
        yardInk: L.yardInk,
        yardFits: !L.yard ? true : !!L.yardInk &&
          L.yardInk.x0 >= L.yard.x - 0.5 && L.yardInk.x1 <= L.yard.x + L.yard.w + 0.5 &&
          L.yardInk.y0 >= L.yard.y - 0.5 && L.yardInk.y1 <= L.yard.y + L.yard.h + 0.5,
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
        sameBand: !!L.wide,
        bandClear: L.wide ? (L.readoutLeft || 0) - (L.rowRight || 0) > 0 : true,
        bandGap: L.wide ? Math.round((L.readoutLeft || 0) - (L.rowRight || 0)) : null,
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
      level = M.buildLevel({
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
  if (jump) level = M.getLevel(jump);
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
