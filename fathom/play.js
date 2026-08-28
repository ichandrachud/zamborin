/* ============================================================
   Fathom · A Zamborin Game
   ------------------------------------------------------------
   The dive, nothing else: Milestone 1. The model lives in
   sim.js; this file draws it, reads the player, and keeps the
   chrome to the design system. No creature, no vents, no shop,
   no ads yet — see the build brief.
   ============================================================ */
(() => {
  'use strict';

  // ---------- MODE ----------
  // Zero-width first frames must not read as a phone; see the template.
  const MODE = (matchMedia('(pointer: coarse)').matches ||
                (window.innerWidth > 0 && window.innerWidth < 768))
    ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);

  // ---------- CANVAS ----------
  let LW, LH;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const gameWrap = canvas.parentElement;
  const FRAME_W = 760, FRAME_H = 600;   // the one site-wide desktop frame

  const inFocus = () => document.body.classList.contains('focus-mode');

  function setCanvasVars() {
    if (MODE === 'mobile') { LW = window.innerWidth; LH = window.innerHeight; }
    else if (inFocus())    { LW = window.innerWidth; LH = window.innerHeight; }
    else                   { LW = FRAME_W; LH = FRAME_H; }
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
  /* A scrolling-world game in full screen takes the viewport's real pixels
     as LW/LH and keeps the drawing scale anchored to the 760 frame — the
     frame grows, the art does not. Tailwind is the worked example. */
  function fitFullscreen() {
    if (MODE === 'mobile' || inFocus()) {
      gameWrap.style.width = window.innerWidth + 'px';
      gameWrap.style.height = window.innerHeight + 'px';
      return;
    }
    gameWrap.style.width = ''; gameWrap.style.height = '';
  }
  function onResize() {
    setCanvasVars();
    fitFullscreen(); resizeCanvas(); layout(); render(performance.now());
  }

  // ---------- AUDIO ----------
  // The fleet peaks ~4x too quiet; the master gain is the fix, not louder recipes.
  // 2.2 after the owner heard 3.2: the percussive sounds read as crashes.
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zam.fathom.sfx', gain: 2.2 }) : null;

  // ---------- BUTTONS / ANALYTICS ----------
  const UI = window.ZAM_UI;
  const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){}, levelRestart(){}, hintUsed(){} };
  const T = () => (window.ZAM_TRACK || NOOP);
  T().init('fathom');

  // ---------- TOKENS ----------
  // Canvas cannot read CSS variables; this is the one place they are restated.
  const C_BG      = '#0E1726';                  // --bg (Ground)
  const C_SURFACE = '#131F36';                  // --bg-card (Surface)
  const C_RAISED  = '#1A2A45';                  // --bg-panel (Raised)
  const SCRIM     = (a) => 'rgba(10,16,28,' + a + ')';   // Scrim, never a fill
  const TINT = (a) => 'rgba(255,255,255,' + a + ')';
  const INK72 = TINT(0.72), INK82 = TINT(0.82), INK90 = TINT(0.90), INK92 = TINT(0.92);
  const C_ACCENT      = '#C24A39';              // --accent (fill under white)
  const C_ACCENT_TEXT = '#FF6B5C';              // --accent-text (coral AS type/marks)
  const C_GREEN       = '#5DD39E';              // --green
  const C_SUN         = '#FFD23F';              // --accent-2

  // ---------- SIM ----------
  const SIM = window.FathomSim;
  const TUNE = SIM.TUNE;
  const qs = new URLSearchParams(location.search);
  const seed = qs.has('seed') ? (parseInt(qs.get('seed'), 10) >>> 0)
                              : ((Math.random() * 1e9) >>> 0);   // boot-time only; the run itself is seeded
  let run = new SIM.Run(seed);

  // ---------- GAME SHELL STATE ----------
  let card = 'rules';            // 'rules' | 'banked' | 'blackout' | null
  let cardData = null;
  let rulesScroll = 0;
  let started = false;           // first real input → analytics gameStart
  let scheme = 'A';              // mobile control scheme, owner picks by playing
  try { scheme = localStorage.getItem('zam.fathom.controls') === 'B' ? 'B' : 'A'; } catch (_) {}
  let bestEver = 0;              // session best depth

  // ---------- LAYOUT ----------
  const SIDE_PAD = 30;
  const topBand = () => (MODE === 'mobile' ? 84 : 56);
  const botBand = () => (MODE === 'mobile' ? 96 : 20);
  const L = {};                  // everything measured, nothing implicit
  function layout() {
    L.top = topBand(); L.bot = botBand();
    if (MODE === 'desktop') {
      L.colW = 196;
      L.ocean = { x: SIDE_PAD, y: L.top,
                  w: LW - SIDE_PAD * 2 - L.colW - 18, h: LH - L.top - L.bot };
      // ppm anchored to the 760 frame so full screen widens the view, not the art
      L.ppm = (FRAME_W - SIDE_PAD * 2 - L.colW - 18) / TUNE.VIEW_W;
      L.col = { x: L.ocean.x + L.ocean.w + 18, y: L.top, w: L.colW, h: LH - L.top - L.bot };
      const g = L.col;
      /* Column, top to bottom: money 0-46, bars 66-198, gauge 206-376 with
         its state label, manifest 400-505, JETTISON pill centred 540. The
         pill bottom (560) clears the frame bottom band (580); the manifest's
         worst case (4 rows + the overflow line) ends at 505. Measured, so
         the collision cannot come back. */
      L.gauge = { x: g.x + 58, y: g.y + 168, w: 44, h: 144 };
      L.manifestY = g.y + 344;
      L.manifestRows = 4;
      L.jettison = { cx: g.x + g.w / 2, cy: LH - L.bot - 40 };
    } else {
      L.ocean = { x: 0, y: L.top, w: LW, h: LH - L.top - L.bot };
      L.ppm = LW / TUNE.VIEW_W;
      const gh = Math.min(280, L.ocean.h * 0.52);
      L.gauge = { x: LW - SIDE_PAD - 34, y: L.top + 40, w: 34, h: gh };
      L.rowCy = LH - 74;                 // the band system's mobile control row
      L.jettison = { cx: LW / 2, cy: L.rowCy };
      // Scheme A: FLOOD and BLOW thumb-stacked bottom-right, above the row
      L.blowBtn  = { cx: LW - SIDE_PAD - 22, cy: LH - L.bot - 118 };
      L.floodBtn = { cx: LW - SIDE_PAD - 22, cy: LH - L.bot - 62 };
    }
    L.viewWm = L.ocean.w / L.ppm;
    L.viewHm = L.ocean.h / L.ppm;
  }

  // ---------- CAMERA ----------
  const cam = { x: 0, y: -20 };
  function camTarget() {
    const vw = L.viewWm, vh = L.viewHm;
    let tx = run.x - vw / 2;
    let ty = run.y - vh * 0.42 + run.vy * 0.30;
    if (vw >= TUNE.worldW + 24) tx = (TUNE.worldW - vw) / 2;
    else tx = Math.max(-12, Math.min(TUNE.worldW + 12 - vw, tx));
    ty = Math.max(-26, Math.min(TUNE.bottom + 8 - vh, ty));
    return { tx, ty };
  }
  function updateCam(dt) {
    const { tx, ty } = camTarget();
    const a = 1 - Math.exp(-3.5 * dt);
    cam.x += (tx - cam.x) * a;
    cam.y += (ty - cam.y) * a;
  }
  const sx = (wx) => L.ocean.x + (wx - cam.x) * L.ppm;
  const sy = (wy) => L.ocean.y + (wy - cam.y) * L.ppm;

  // ---------- INPUT ----------
  const keys = {};
  const held = { floodBtn: null, blowBtn: null, thrustL: null, thrustR: null, joy: null };
  let joyVec = 0;                // -1..1 from the scheme-B vector drag
  let burstFlood = 0, burstBlow = 0, wantJettison = false;

  function markStarted() {
    if (!started) { started = true; T().gameStart(); }
  }

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
    if (sfx) sfx.ensureAudio();
    if (card) {
      if (e.key === 'Enter' || e.key === ' ') { cardCTA(); e.preventDefault(); }
      return;
    }
    keys[k] = true;
    if (k === 'j') { wantJettison = true; }
    if (['a', 'd', 's', 'w', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(k)) markStarted();
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  function ptXY(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (LW / rect.width),
             y: (e.clientY - rect.top) * (LH / rect.height) };
  }
  const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  const nearBtn = (p, b, slop) => Math.abs(p.x - b.cx) <= 22 + slop && Math.abs(p.y - b.cy) <= 20 + slop;

  // Hit boxes the renderer fills in each frame.
  const hit = { pills: [], cta: null, schemeToggle: null, newOcean: null, rulesBody: null };
  const swipes = new Map();      // pointerId -> {x, y, t, onSub}
  let rulesDrag = null;

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (sfx) sfx.ensureAudio();
    const p = ptXY(e);
    if (card) {
      if (hit.cta && inRect(p, hit.cta)) { cardCTA(); return; }
      if (hit.schemeToggle && inRect(p, hit.schemeToggle)) { toggleScheme(); return; }
      if (hit.newOcean && inRect(p, hit.newOcean)) { newOcean(); return; }
      if (card === 'rules' && hit.rulesBody && inRect(p, hit.rulesBody)) {
        rulesDrag = { y: p.y, s: rulesScroll };
      }
      return;
    }
    // Chrome pills first.
    for (const pill of hit.pills) {
      if (inRect(p, pill.box)) {
        if (pill.id === 'jettison') { wantJettison = true; }   // instant verb
        else pill.tapped = e.pointerId;                        // act on release
        return;
      }
    }
    if (MODE === 'mobile' && scheme === 'A') {
      if (nearBtn(p, L.blowBtn, 14))  { held.blowBtn = e.pointerId;  markStarted(); return; }
      if (nearBtn(p, L.floodBtn, 14)) { held.floodBtn = e.pointerId; markStarted(); return; }
      if (p.y > L.top && p.y < LH - L.bot) {
        if (p.x < LW / 2) held.thrustL = e.pointerId; else held.thrustR = e.pointerId;
        markStarted();
      }
      return;
    }
    if (MODE === 'mobile' && scheme === 'B') {
      const d = Math.hypot(p.x - sx(run.x), p.y - sy(run.y));
      if (d < 70) { held.joy = e.pointerId; joyVec = 0; markStarted(); }
      else swipes.set(e.pointerId, { x: p.x, y: p.y, t: performance.now() });
      return;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptXY(e);
    if (rulesDrag) {
      rulesScroll = rulesDrag.s - (p.y - rulesDrag.y);
      return;
    }
    if (held.joy === e.pointerId) {
      const dx = p.x - sx(run.x);
      joyVec = Math.abs(dx) < 12 ? 0 : Math.max(-1, Math.min(1, dx / 90));
    }
  });
  function endPointer(e) {
    const p = ptXY(e);
    rulesDrag = null;
    for (const pill of hit.pills) {
      if (pill.tapped === e.pointerId) {
        pill.tapped = null;
        if (inRect(p, pill.box)) pillAction(pill.id);
      }
    }
    if (held.floodBtn === e.pointerId) held.floodBtn = null;
    if (held.blowBtn === e.pointerId)  held.blowBtn = null;
    if (held.thrustL === e.pointerId)  held.thrustL = null;
    if (held.thrustR === e.pointerId)  held.thrustR = null;
    if (held.joy === e.pointerId)      { held.joy = null; joyVec = 0; }
    const sw = swipes.get(e.pointerId);
    if (sw) {
      swipes.delete(e.pointerId);
      const dt = performance.now() - sw.t;
      const dy = p.y - sw.y, dx = p.x - sw.x;
      if (dt < 350 && Math.abs(dy) > 48 && Math.abs(dy) > Math.abs(dx)) {
        if (dy > 0) { burstFlood += 40; floatText('FLOOD +40 kg', run.x, run.y - 8, INK92); }
        else {
          const can = Math.min(40, run.ballast, run.air / TUNE.airPerKg);
          burstBlow += 40;
          floatText(can > 1 ? 'BLOW ' + Math.round(can) + ' kg' : 'NO BALLAST', run.x, run.y - 8,
                    can > 1 ? INK92 : C_ACCENT_TEXT);
        }
        markStarted();
      }
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (e) => {
    if (card === 'rules' && hit.rulesBody) { rulesScroll += e.deltaY * 0.6; e.preventDefault(); }
  }, { passive: false });

  function pillAction(id) {
    if (id === 'sound') { if (sfx) { sfx.setOn(!sfx.isOn()); sfx.play('click'); } }
    else if (id === 'restart') { newOcean(); }
    else if (id === 'rules') { card = 'rules'; rulesScroll = 0; }
  }
  function toggleScheme() {
    scheme = scheme === 'A' ? 'B' : 'A';
    try { localStorage.setItem('zam.fathom.controls', scheme); } catch (_) {}
    if (sfx) sfx.play('click');
  }
  function newOcean() {
    run = new SIM.Run((Math.random() * 1e9) >>> 0);
    particles.length = 0; floats.length = 0; jetsam.length = 0; rings.length = 0;
    card = null; cam.y = -20; cam.x = run.x - L.viewWm / 2;
    if (sfx) sfx.play('start');
  }
  function cardCTA() {
    if (card === 'rules') { card = null; }
    else if (card === 'banked' || card === 'blackout') {
      if (run.mode === 'blackout') run.revive();
      card = null;
    }
    if (sfx) sfx.play('click');
  }

  // ---------- PARTICLES (visual only, deterministic per session) ----------
  const vr = SIM.mulberry32(777);
  const particles = [];   // bubbles: {x,y,vy,r,life,pooled}
  const floats = [];      // {text,x,y,life,color}
  const jetsam = [];      // {x,y,type,vy,life}
  const rings = [];       // intake ripples while flooding: {x,y,r,life}
  // Distant massifs at 0.55 parallax: depth for the price of nine ellipses.
  const farBlobs = [];
  function floatText(text, wx, wy, color) {
    floats.push({ text, x: wx, y: wy, life: 1.4, color });
  }
  for (let i = 0; i < 9; i++) farBlobs.push({ x: vr() * 520 - 60, y: 90 + vr() * 760, rx: 50 + vr() * 90, ry: 20 + vr() * 34 });
  const snow = [];
  for (let i = 0; i < 70; i++) snow.push({ x: vr() * 400, y: vr() * 800, r: 0.6 + vr() * 1.1, a: 0.10 + vr() * 0.16, s: 0.5 + vr() });
  const specks = [];
  for (let i = 0; i < 26; i++) specks.push({ x: vr() * TUNE.worldW, y: 280 + vr() * (TUNE.bottom - 290), r: 1 + vr() * 1.2, ph: vr() * 6.28 });
  const fishes = [];
  for (let i = 0; i < 4; i++) fishes.push({ x: vr() * TUNE.worldW, y: 18 + vr() * 60, dir: vr() < 0.5 ? -1 : 1, s: 3 + vr() * 4, ph: vr() * 6.28 });

  function spawnBubbles(n, wx, wy, spread, vyMin, vyMax) {
    if (particles.length > 260) return;
    for (let i = 0; i < n; i++) {
      particles.push({ x: wx + (vr() - 0.5) * spread, y: wy + (vr() - 0.5) * 2,
                       vy: -(vyMin + vr() * (vyMax - vyMin)), r: 0.6 + vr() * 1.4,
                       life: 5 + vr() * 3, pooled: false });
    }
  }
  function stepParticles(dt) {
    const layers = TUNE.LAYER_DEPTH;
    for (let i = particles.length - 1; i >= 0; i--) {
      const b = particles[i];
      if (!b.pooled) {
        const py = b.y;
        b.y += b.vy * dt;
        b.x += Math.sin(b.life * 7) * 1.2 * dt + run.world.currentAt(b.y) * 0.3 * dt;
        // The signature detail: bubbles pool flat against layer undersides.
        for (const Ld of layers) {
          if (py > Ld && b.y <= Ld + 0.5) { b.y = Ld + 1.6 + vr() * 1.4; b.pooled = true; break; }
        }
        if (b.y < 1) { particles.splice(i, 1); continue; }
      } else {
        b.x += Math.sin(b.life * 2.2) * 0.8 * dt;
      }
      b.life -= dt;
      if (b.life <= 0) particles.splice(i, 1);
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.y -= 6 * dt; f.life -= dt;
      if (f.life <= 0) floats.splice(i, 1);
    }
    for (let i = jetsam.length - 1; i >= 0; i--) {
      const j = jetsam[i];
      j.vy = Math.min(50, j.vy + 60 * dt);
      j.y += j.vy * dt; j.life -= dt;
      if (j.life <= 0 || run.world.solid(j.x, j.y)) jetsam.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const g = rings[i];
      g.r += 7 * dt; g.life -= dt;
      if (g.life <= 0) rings.splice(i, 1);
    }
  }

  // ---------- SIM DRIVE ----------
  let lastNow = performance.now();
  let holdFullWas = false;
  function tick(now) {
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    if (!card) {
      const axKeys = (keys['a'] || keys['arrowleft'] ? -1 : 0) + (keys['d'] || keys['arrowright'] ? 1 : 0);
      const axTouch = (held.thrustL != null ? -1 : 0) + (held.thrustR != null ? 1 : 0);
      const ax = Math.max(-1, Math.min(1, axKeys + axTouch + joyVec));
      const inp = {
        ax,
        flood: !!(keys['s'] || keys['arrowdown'] || held.floodBtn != null),
        blow:  !!(keys['w'] || keys['arrowup'] || held.blowBtn != null),
        floodKg: burstFlood, blowKg: burstBlow,
        jettison: wantJettison,
      };
      burstFlood = 0; burstBlow = 0; wantJettison = false;
      const events = run.step(inp, dt);
      for (const ev of events) handleEvent(ev);
      if (run._blowing && sfx && sfx.isOn()) { if (vr() < 0.3) sfx.noise(0.12, 500, 0.7, 0.03); }
      if (run._blowing) spawnBubbles(2, run.x, run.y - 3, 6, 8, 16);
      if (run._flooding && vr() < 0.35 && rings.length < 12) {
        rings.push({ x: run.x + (vr() - 0.5) * 4, y: run.y + 2.4, r: 1.2, life: 0.6 });
      }
      if (run._thrusting) spawnBubbles(1, run.x - run.facing * 6, run.y + 1, 2, 2, 5);
      // A soft dull knock, not a buzzer: the hold refusing is not a crash.
      if (run.holdFull && !holdFullWas && sfx) sfx.tone(170, 0.12, 0.03, 'sine');
      holdFullWas = run.holdFull;
      updateCam(dt);
      stepParticles(dt);
    }
    render(now);
    requestAnimationFrame(tick);
  }
  function handleEvent(ev) {
    if (ev.t === 'grab') {
      const vpk = ev.val / ev.kg;
      if (sfx) sfx.tone(480 + 58 * vpk, 0.1, 0.06, 'triangle');
      floatText('+' + ev.kg + ' kg · $' + ev.val, ev.x, ev.y - 6, INK92);
    } else if (ev.t === 'banked') {
      bestEver = Math.max(bestEver, run.bestDepth);
      cardData = { val: ev.val, kg: ev.kg, depth: Math.round(run.bestDepth) };
      card = 'banked';
      if (sfx) sfx.play('success');
    } else if (ev.t === 'blackout') {
      bestEver = Math.max(bestEver, run.bestDepth);
      cardData = ev;
      card = 'blackout';
      if (sfx) sfx.play('fail');
    } else if (ev.t === 'jettison') {
      jetsam.push({ x: ev.x, y: ev.y + 4, type: ev.type, vy: 10, life: 6 });
      if (sfx) sfx.play('drop');
      floatText('-' + ev.kg + ' kg', ev.x, ev.y - 8, C_ACCENT_TEXT);
    } else if (ev.t === 'sink-through') {
      if (sfx) sfx.noise(0.3, 220, 0.8, 0.05);
    } else if (ev.t === 'rise-through') {
      if (sfx) sfx.tone(560, 0.14, 0.05, 'sine');
      spawnBubbles(6, run.x, run.y + 2, 8, 6, 14);
    } else if (ev.t === 'discover') {
      if (sfx) sfx.play('ping');
      floatText('LAYER ' + (ev.k + 1) + ' · needs ' + TUNE.T[ev.k] + ' kg', run.x, run.y - 10, INK92);
    }
  }

  // ---------- RENDER: THE OCEAN ----------
  // Game art palette. Chrome stays on tokens; this is the water, terrain,
  // ore and the sub — the playfield's own material.
  const WATER_STOPS = [
    [0, 0x1A, 0x5E, 0x86], [120, 0x0F, 0x3D, 0x5F], [260, 0x08, 0x2A, 0x44],
    [420, 0x04, 0x18, 0x2B], [600, 0x01, 0x06, 0x0B], [9999, 0x01, 0x06, 0x0B],
  ];
  function waterColorAt(depth) {
    const d = Math.max(0, depth);
    for (let i = 1; i < WATER_STOPS.length; i++) {
      if (d <= WATER_STOPS[i][0]) {
        const a = WATER_STOPS[i - 1], b = WATER_STOPS[i];
        const t = (d - a[0]) / (b[0] - a[0]);
        const ch = (j) => Math.round(a[j] + (b[j] - a[j]) * t);
        return 'rgb(' + ch(1) + ',' + ch(2) + ',' + ch(3) + ')';
      }
    }
    return '#01060B';
  }

  let terrCan = null, terrCtx = null;
  function drawScene(now) {
    const o = L.ocean, ppm = L.ppm;
    const t = now / 1000;
    ctx.save();
    ctx.beginPath(); ctx.rect(o.x, o.y, o.w, o.h); ctx.clip();

    // Water: the continuous gradient, positioned by camera depth.
    const g = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
    g.addColorStop(0, waterColorAt(cam.y));
    g.addColorStop(1, waterColorAt(cam.y + L.viewHm));
    ctx.fillStyle = g; ctx.fillRect(o.x, o.y, o.w, o.h);

    // Sky above the waterline.
    if (cam.y < 0) {
      const skyH = -cam.y * ppm;
      const sg = ctx.createLinearGradient(0, o.y, 0, o.y + skyH);
      sg.addColorStop(0, '#BFE3EC'); sg.addColorStop(1, '#7FB9CD');
      ctx.fillStyle = sg; ctx.fillRect(o.x, o.y, o.w, skyH);
      ctx.strokeStyle = TINT(0.55); ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let px = 0; px <= o.w; px += 8) {
        const wy = sy(0) + Math.sin(px * 0.06 + t * 1.8) * 2.2;
        px === 0 ? ctx.moveTo(o.x + px, wy) : ctx.lineTo(o.x + px, wy);
      }
      ctx.stroke();
    }

    // Sun shafts, dead within the first hundred metres.
    if (cam.y < 110) {
      for (let i = 0; i < 4; i++) {
        const wx0 = 40 + i * 90 + Math.sin(t * 0.10 + i * 2.4) * 12;
        const x0 = sx(wx0), x1 = sx(wx0 + 26), yTop = sy(0), yBot = sy(105);
        const sg = ctx.createLinearGradient(0, yTop, 0, yBot);
        sg.addColorStop(0, 'rgba(170,220,235,0.10)'); sg.addColorStop(1, 'rgba(170,220,235,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.moveTo(x0, yTop); ctx.lineTo(x1, yTop);
        ctx.lineTo(x1 + 26, yBot); ctx.lineTo(x0 + 26, yBot);
        ctx.closePath(); ctx.fill();
      }
    }

    drawFarMassifs();
    drawCurrents(t);
    drawTerrain();
    drawDeposits(t);
    drawLayers(t);
    drawJetsam();
    drawSnowAndLife(t);
    drawRings();
    drawSub(t);
    drawBubbles();
    drawFloats();
    ctx.restore();
  }

  function drawFarMassifs() {
    const o = L.ocean, par = 0.55, pz = 0.85;
    for (const b of farBlobs) {
      const px = o.x + (b.x - cam.x * par) * L.ppm * pz;
      const py = o.y + (b.y - cam.y * par) * L.ppm * pz;
      const rx = b.rx * L.ppm * pz, ry = b.ry * L.ppm * pz;
      if (py + ry < o.y - 20 || py - ry > o.y + o.h + 20) continue;
      if (px + rx < o.x - 20 || px - rx > o.x + o.w + 20) continue;
      const g = ctx.createRadialGradient(px, py, 0, px, py, rx);
      g.addColorStop(0, 'rgba(4,12,20,0.42)');
      g.addColorStop(0.7, 'rgba(4,12,20,0.28)');
      g.addColorStop(1, 'rgba(4,12,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Terrain into an offscreen so the channel can be carved with
  // destination-out without erasing the water behind it.
  function drawTerrain() {
    const o = L.ocean, ppm = L.ppm, w = run.world;
    if (!terrCan || terrCan.width !== Math.ceil(o.w) || terrCan.height !== Math.ceil(o.h)) {
      terrCan = document.createElement('canvas');
      terrCan.width = Math.ceil(o.w); terrCan.height = Math.ceil(o.h);
      terrCtx = terrCan.getContext('2d');
    }
    const tc = terrCtx;
    tc.setTransform(1, 0, 0, 1, 0, 0);
    tc.clearRect(0, 0, terrCan.width, terrCan.height);
    const wx = (x) => (x - cam.x) * ppm;
    const wy = (y) => (y - cam.y) * ppm;

    // Rock body: everything below the seabed.
    const rock = tc.createLinearGradient(0, 0, 0, terrCan.height);
    rock.addColorStop(0, '#0B1B2C'); rock.addColorStop(1, '#02080F');
    tc.fillStyle = rock;
    tc.beginPath();
    const x0m = cam.x - 6, x1m = cam.x + L.viewWm + 6;
    tc.moveTo(wx(x0m), wy(w.floorY(x0m)));
    for (let xm = x0m; xm <= x1m; xm += 5) tc.lineTo(wx(xm), wy(w.floorY(xm)));
    tc.lineTo(wx(x1m), terrCan.height + 20); tc.lineTo(wx(x0m), terrCan.height + 20);
    tc.closePath(); tc.fill();

    // Carve the channel.
    tc.globalCompositeOperation = 'destination-out';
    tc.beginPath();
    const y0m = Math.max(60, cam.y - 6), y1m = cam.y + L.viewHm + 6;
    tc.moveTo(wx(w.centerX(y0m) - w.halfW(y0m)), wy(y0m));
    for (let ym = y0m; ym <= y1m; ym += 5) tc.lineTo(wx(w.centerX(ym) - w.halfW(ym)), wy(ym));
    for (let ym = y1m; ym >= y0m; ym -= 5) tc.lineTo(wx(w.centerX(ym) + w.halfW(ym)), wy(ym));
    tc.closePath(); tc.fill();
    tc.globalCompositeOperation = 'source-over';

    // Masses: seamounts and ledges inside the channel.
    for (const m of w.masses) {
      if (m.y + m.ry < cam.y - 8 || m.y - m.ry > cam.y + L.viewHm + 8) continue;
      // Grounding shadow first, so the mass sits in the water, not on it.
      const shy = wy(m.y + m.ry * 0.8);
      const sg2 = tc.createRadialGradient(wx(m.x), shy, 0, wx(m.x), shy, m.rx * L.ppm);
      sg2.addColorStop(0, 'rgba(1,4,9,0.38)'); sg2.addColorStop(1, 'rgba(1,4,9,0)');
      tc.fillStyle = sg2;
      tc.beginPath(); tc.ellipse(wx(m.x), shy, m.rx * L.ppm, m.ry * L.ppm * 0.55, 0, 0, Math.PI * 2); tc.fill();
      const mg = tc.createLinearGradient(0, wy(m.y - m.ry), 0, wy(m.y + m.ry));
      mg.addColorStop(0, '#10202F'); mg.addColorStop(1, '#040C15');
      tc.fillStyle = mg;
      tc.beginPath();
      for (let a = 0; a <= 26; a++) {
        const th = (a / 26) * Math.PI * 2;
        const edge = 1 + m.amp * Math.sin(th * 3 + m.ph);
        const px = wx(m.x + Math.cos(th) * m.rx * edge);
        const py = wy(m.y + Math.sin(th) * m.ry * edge);
        a === 0 ? tc.moveTo(px, py) : tc.lineTo(px, py);
      }
      tc.closePath(); tc.fill();
      // Rim light on the top edge: value, not an outline.
      tc.strokeStyle = 'rgba(110,180,210,0.30)'; tc.lineWidth = 2;
      tc.beginPath();
      for (let a = 0; a <= 13; a++) {
        const th = Math.PI + (a / 13) * Math.PI;
        const edge = 1 + m.amp * Math.sin(th * 3 + m.ph);
        const px = wx(m.x + Math.cos(th) * m.rx * edge);
        const py = wy(m.y + Math.sin(th) * m.ry * edge);
        a === 0 ? tc.moveTo(px, py) : tc.lineTo(px, py);
      }
      tc.stroke();
    }

    // Rim light along the seabed and the channel edges.
    tc.strokeStyle = 'rgba(120,190,220,0.35)'; tc.lineWidth = 2.5;
    tc.beginPath();
    let pen = false;
    for (let xm = x0m; xm <= x1m; xm += 5) {
      const fy = w.floorY(xm);
      const inGap = Math.abs(xm - w.centerX(Math.max(95, fy))) < w.halfW(Math.max(95, fy));
      if (inGap) { pen = false; continue; }
      const px = wx(xm), py = wy(fy);
      if (!pen) { tc.moveTo(px, py); pen = true; } else tc.lineTo(px, py);
    }
    tc.stroke();
    tc.strokeStyle = 'rgba(96,170,205,0.22)'; tc.lineWidth = 2;
    for (const side of [-1, 1]) {
      tc.beginPath(); pen = false;
      for (let ym = Math.max(95, y0m); ym <= y1m; ym += 5) {
        const px = wx(w.centerX(ym) + side * w.halfW(ym)), py = wy(ym);
        if (!pen) { tc.moveTo(px, py); pen = true; } else tc.lineTo(px, py);
      }
      tc.stroke();
    }
    ctx.drawImage(terrCan, L.ocean.x, L.ocean.y);
  }

  function drawCurrents(t) {
    const o = L.ocean, w = run.world;
    ctx.save();
    for (let band = 0; band < 5; band++) {
      const yTop = band === 0 ? 8 : TUNE.LAYER_DEPTH[band - 1];
      const yBot = band === 4 ? TUNE.bottom : TUNE.LAYER_DEPTH[band];
      if (yBot < cam.y || yTop > cam.y + L.viewHm) continue;
      const cur = w.current[band];
      // Streaks, drifting with the water. Always visible, never a surprise.
      for (let i = 0; i < 12; i++) {
        const ph = ((i * 47.3) % 1) * 500;
        const ym = yTop + ((i * 89.7) % (yBot - yTop));
        if (ym < cam.y || ym > cam.y + L.viewHm) continue;
        let xm = (ph + t * cur * 3) % (L.viewWm + 40);
        if (xm < 0) xm += L.viewWm + 40;
        xm += cam.x - 20;
        const len = (10 + (i % 4) * 3) * Math.min(1, Math.abs(cur) / 3);
        ctx.strokeStyle = TINT(0.07); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx(xm), sy(ym)); ctx.lineTo(sx(xm) + len, sy(ym)); ctx.stroke();
      }
      // Sparse chevrons pointing the way.
      const dir = Math.sign(cur) || 1;
      for (let i = 0; i < 3; i++) {
        const ym = yTop + (yBot - yTop) * (0.25 + i * 0.25);
        if (ym < cam.y || ym > cam.y + L.viewHm) continue;
        let xm = ((i * 163.7 + t * cur * 3) % (L.viewWm + 60));
        if (xm < 0) xm += L.viewWm + 60;
        xm += cam.x - 30;
        const px = sx(xm), py = sy(ym);
        ctx.strokeStyle = TINT(0.12); ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px - 6 * dir, py - 5); ctx.lineTo(px + 4 * dir, py); ctx.lineTo(px - 6 * dir, py + 5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawLayers(t) {
    const w = run.world;
    for (let k = 0; k < TUNE.LAYER_DEPTH.length; k++) {
      const Ld = TUNE.LAYER_DEPTH[k];
      if (Ld < cam.y - 12 || Ld > cam.y + L.viewHm + 12) continue;
      const o = L.ocean;
      // Soft glow: a thin bright core with a tight feather, never a wash.
      const yMid = sy(Ld);
      const gl = ctx.createLinearGradient(0, yMid - 22, 0, yMid + 22);
      gl.addColorStop(0, 'rgba(150,215,235,0)');
      gl.addColorStop(0.5, 'rgba(150,215,235,0.10)');
      gl.addColorStop(1, 'rgba(150,215,235,0)');
      ctx.fillStyle = gl; ctx.fillRect(o.x, yMid - 22, o.w, 44);
      // The wavy double band.
      const wave = (px, off) => sy(Ld) + off * L.ppm +
        (Math.sin(px * 0.045 + t * 0.7 + k * 2.1) * 1.6 + Math.sin(px * 0.013 - t * 0.3 + k) * 1.1) * L.ppm * 0.5;
      ctx.fillStyle = 'rgba(150,215,235,0.15)';
      ctx.beginPath();
      for (let px = 0; px <= o.w; px += 10) {
        const yy = wave(px, -1.4);
        px === 0 ? ctx.moveTo(o.x + px, yy) : ctx.lineTo(o.x + px, yy);
      }
      for (let px = o.w; px >= 0; px -= 10) ctx.lineTo(o.x + px, wave(px, 1.4));
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(168,226,240,0.45)'; ctx.lineWidth = 1.5;
      for (const off of [-1.4, 1.4]) {
        ctx.beginPath();
        for (let px = 0; px <= o.w; px += 10) {
          const yy = wave(px, off);
          px === 0 ? ctx.moveTo(o.x + px, yy) : ctx.lineTo(o.x + px, yy);
        }
        ctx.stroke();
      }
      // Bubbles pooling flat against the underside — the signature detail.
      ctx.fillStyle = 'rgba(200,240,250,0.40)';
      for (let i = 0; i < 14; i++) {
        const bx = cam.x + ((i * 71.3 + k * 31) % L.viewWm);
        const br = 1 + ((i * 13) % 10) / 6;
        const px = sx(bx), py = wave((bx - cam.x) * L.ppm, 1.4) + 3 + ((i * 7) % 5);
        ctx.beginPath(); ctx.arc(px, py, br, 0, Math.PI * 2); ctx.fill();
      }
      // Luminous motes drifting inside the band.
      for (let i = 0; i < 6; i++) {
        let mx = (i * 47 + t * 3.5 + k * 13) % L.viewWm;
        if (mx < 0) mx += L.viewWm;
        const mpx = sx(cam.x + mx), mpy = sy(Ld) + Math.sin(t * 1.3 + i * 2.1) * 3;
        ctx.globalAlpha = 0.25 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2 + i * 1.7));
        ctx.fillStyle = '#BFEFF8';
        ctx.beginPath(); ctx.arc(mpx, mpy, 1.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawDeposits(t) {
    const w = run.world, ppm = L.ppm;
    for (let i = 0; i < w.deposits.length; i++) {
      const d = w.deposits[i];
      if (d.mined) continue;
      if (d.y < cam.y - 10 || d.y > cam.y + L.viewHm + 10) continue;
      if (d.x < cam.x - 10 || d.x > cam.x + L.viewWm + 10) continue;
      const px = sx(d.x), py = sy(d.y);
      if (d.type === 'nodule') {
        const r = 2.6 * ppm;
        for (const [ox, oy, rr] of [[-0.8, 0.3, 0.8], [0.8, 0.25, 0.75], [0, -0.35, 0.9]]) {
          const gg = ctx.createRadialGradient(px + ox * r - r * 0.25, py + oy * r - r * 0.3, r * 0.1,
                                              px + ox * r, py + oy * r, r * rr);
          gg.addColorStop(0, '#7A6552'); gg.addColorStop(1, '#38302A');
          ctx.fillStyle = gg;
          ctx.beginPath(); ctx.arc(px + ox * r, py + oy * r, r * rr, 0, Math.PI * 2); ctx.fill();
        }
      } else if (d.type === 'sulphide') {
        const s = 2.2 * ppm;
        const gg = ctx.createLinearGradient(px - s, py - s, px + s, py + s);
        gg.addColorStop(0, '#D19A45'); gg.addColorStop(1, '#6E4C1E');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.moveTo(px - s * 1.1, py + s * 0.7); ctx.lineTo(px - s * 0.1, py - s * 0.9);
        ctx.lineTo(px + s * 1.2, py - s * 0.2); ctx.lineTo(px + s * 0.5, py + s * 0.8);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,235,190,0.25)';
        ctx.beginPath();
        ctx.moveTo(px - s * 0.1, py - s * 0.9); ctx.lineTo(px + s * 1.2, py - s * 0.2);
        ctx.lineTo(px + s * 0.6, py - s * 0.05); ctx.closePath(); ctx.fill();
      } else {
        const s = 2.5 * ppm;
        const tw = 0.22 + 0.14 * Math.sin(t * 2.5 + i);   // crystals breathe
        const gl = ctx.createRadialGradient(px, py, 0, px, py, s * 1.8);
        gl.addColorStop(0, 'rgba(140,225,255,' + tw.toFixed(2) + ')'); gl.addColorStop(1, 'rgba(140,225,255,0)');
        ctx.fillStyle = gl;
        ctx.beginPath(); ctx.arc(px, py, s * 1.8, 0, Math.PI * 2); ctx.fill();
        const gg = ctx.createLinearGradient(px, py - s, px, py + s);
        gg.addColorStop(0, '#EAF9FF'); gg.addColorStop(1, '#9FD8EF');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.moveTo(px, py - s * 1.2); ctx.lineTo(px + s * 0.4, py);
        ctx.lineTo(px, py + s * 0.9); ctx.lineTo(px - s * 0.4, py);
        ctx.closePath(); ctx.fill();
      }
      // Seam glint: the direction of the next deposit, never its value.
      if (d.glint) {
        const a = 0.35 + 0.35 * Math.sin(t * 3 + i);
        ctx.strokeStyle = 'rgba(220,245,255,' + a.toFixed(2) + ')';
        ctx.lineWidth = 1.5;
        const gr = 6 + Math.sin(t * 3 + i) * 1.5;
        ctx.beginPath();
        ctx.moveTo(px - gr, py); ctx.lineTo(px + gr, py);
        ctx.moveTo(px, py - gr); ctx.lineTo(px, py + gr);
        ctx.stroke();
      }
    }
    // The grab: claw line and progress ring on the current target.
    if (run.grabTarget >= 0 && !run.holdFull) {
      const d = w.deposits[run.grabTarget];
      const px = sx(d.x), py = sy(d.y);
      ctx.strokeStyle = TINT(0.45); ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(sx(run.x), sy(run.y) + 6); ctx.lineTo(px, py); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = TINT(0.18); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px, py, 15, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = TINT(0.9);
      ctx.beginPath();
      ctx.arc(px, py, 15, -Math.PI / 2, -Math.PI / 2 + (run.grabProgress / TUNE.grabTime) * Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawJetsam() {
    for (const j of jetsam) {
      const px = sx(j.x), py = sy(j.y);
      ctx.fillStyle = j.type === 'crystal' ? '#9FD8EF' : j.type === 'sulphide' ? '#8a6a35' : '#4A3D31';
      ctx.beginPath(); ctx.arc(px, py, 2 * (L.ppm / 3.25), 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawSnowAndLife(t) {
    const o = L.ocean;
    // Marine snow, wrapping around the camera.
    ctx.fillStyle = '#CFE4EE';
    for (const s of snow) {
      const wxr = ((s.x + t * run.world.currentAt(cam.y + s.y % L.viewHm) * 0.4) % 400 + 400) % 400;
      const xm = cam.x + (wxr / 400) * (L.viewWm + 20) - 10;
      const ym = cam.y + (((s.y + t * s.s) % 800 + 800) % 800 / 800) * (L.viewHm + 10) - 5;
      ctx.globalAlpha = s.a;
      ctx.beginPath(); ctx.arc(sx(xm), sy(ym), s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Bioluminescent specks in the deep.
    for (const sp of specks) {
      if (sp.y < cam.y - 5 || sp.y > cam.y + L.viewHm + 5) continue;
      if (sp.x < cam.x - 5 || sp.x > cam.x + L.viewWm + 5) continue;
      const a = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.8 + sp.ph));
      ctx.fillStyle = 'rgba(90,224,195,' + a.toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(sx(sp.x), sy(sp.y), sp.r, 0, Math.PI * 2); ctx.fill();
    }
    // Ambient fish in the sunlit water.
    ctx.fillStyle = '#0A1824';
    for (const f of fishes) {
      f.x += f.dir * f.s * 0.016;
      if (f.x < -10) { f.x = TUNE.worldW + 8; }
      if (f.x > TUNE.worldW + 10) { f.x = -8; }
      const ym = f.y + Math.sin(t * 0.9 + f.ph) * 3;
      if (ym < cam.y - 5 || ym > cam.y + L.viewHm + 5) continue;
      const px = sx(f.x), py = sy(ym);
      ctx.beginPath();
      ctx.ellipse(px, py, 5, 1.8, 0, 0, Math.PI * 2);
      ctx.moveTo(px - f.dir * 5, py);
      ctx.lineTo(px - f.dir * 8, py - 2.2); ctx.lineTo(px - f.dir * 8, py + 2.2);
      ctx.closePath(); ctx.fill();
    }
  }

  /* The sub is the owner's model (assets/sub-1.png, master in iCloud
     source-assets). It faces right natively; the canvas flips it. More
     models are coming as purchasable subs, so everything model-specific
     lives in SUB_SPRITE. The vector fallback below covers the frames
     before the image loads, and failure. */
  const SUB_SPRITE = { src: './assets/sub-1.png?v=1', lenM: 13.5, aspect: 397 / 800,
                       noseX: 0.44, noseY: -0.06, propX: -0.485 };
  const subImg = new Image();
  let subImgOk = false;
  subImg.onload = () => { subImgOk = true; };
  subImg.src = SUB_SPRITE.src;

  function drawSub(t) {
    const ppm = L.ppm;
    const px = sx(run.x), py = sy(run.y);
    const f = run.facing;
    const W = SUB_SPRITE.lenM * ppm, Hh = W * SUB_SPRITE.aspect;
    const len = W / 2, hgt = Hh / 2;
    /* The sub pitches with its vertical motion — the single clearest tell
       that flooding is working, before any depth number changes. */
    const tilt = Math.max(-0.16, Math.min(0.16, run.vy * 0.006));
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(f, 1);          // local space faces right from here on
    ctx.rotate(tilt);
    // Lamp: a bright core cone inside a soft wide one, from the dome.
    const nose = W * SUB_SPRITE.noseX;
    const noseY = Hh * SUB_SPRITE.noseY;
    const coneLen = 55 * ppm;
    for (const [spread, a] of [[0.30, 0.06], [0.16, 0.10]]) {
      const cg = ctx.createLinearGradient(nose, noseY, nose + coneLen, noseY);
      cg.addColorStop(0, 'rgba(190,230,245,' + a + ')'); cg.addColorStop(1, 'rgba(190,230,245,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(nose, noseY - hgt * 0.20);
      ctx.lineTo(nose + coneLen, noseY - coneLen * spread);
      ctx.lineTo(nose + coneLen, noseY + coneLen * spread);
      ctx.lineTo(nose, noseY + hgt * 0.20);
      ctx.closePath(); ctx.fill();
    }
    const lg = ctx.createRadialGradient(nose, noseY, 0, nose, noseY, hgt * 0.9);
    lg.addColorStop(0, 'rgba(220,245,255,0.35)'); lg.addColorStop(1, 'rgba(220,245,255,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(nose, noseY, hgt * 0.9, 0, Math.PI * 2); ctx.fill();
    if (subImgOk) {
      ctx.drawImage(subImg, -W / 2, -Hh / 2, W, Hh);
    } else {
      // Vector stand-in: the pre-model hull, simplified.
      const bg = ctx.createLinearGradient(0, -hgt, 0, hgt);
      bg.addColorStop(0, '#FFDA78'); bg.addColorStop(0.35, '#F0C255');
      bg.addColorStop(0.7, '#C8992F'); bg.addColorStop(1, '#6E4E12');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.ellipse(0, 0, len * 0.94, hgt * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#CFEFF8';
      ctx.beginPath(); ctx.arc(len * 0.42, -hgt * 0.08, hgt * 0.34, 0, Math.PI * 2); ctx.fill();
    }
    // The prop answering the thrusters: a spinning blur at the sprite's tail.
    const bx = W * SUB_SPRITE.propX;
    if (run._thrusting) {
      const spin = t * 26;
      ctx.strokeStyle = 'rgba(230,240,245,0.55)'; ctx.lineWidth = Math.max(1.5, ppm * 0.35);
      ctx.beginPath();
      ctx.moveTo(bx, -Math.abs(Math.sin(spin)) * hgt * 0.42);
      ctx.lineTo(bx, Math.abs(Math.sin(spin)) * hgt * 0.42);
      ctx.stroke();
      const wg = ctx.createRadialGradient(bx - hgt * 0.4, 0, 0, bx - hgt * 0.4, 0, hgt * 1.0);
      wg.addColorStop(0, 'rgba(200,235,245,0.20)'); wg.addColorStop(1, 'rgba(200,235,245,0)');
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.arc(bx - hgt * 0.4, 0, hgt * 1.0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // HOLD FULL tag.
    if (run.holdFull) {
      ctx.font = '700 11px Inter, sans-serif';
      const tw = ctx.measureText('HOLD FULL').width;
      ctx.fillStyle = SCRIM(0.75);
      ctx.beginPath();
      UI.roundRectPath(ctx, px - tw / 2 - 8, py - hgt - 30, tw + 16, 20, 10);
      ctx.fill();
      ctx.fillStyle = C_ACCENT_TEXT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('HOLD FULL', px, py - hgt - 19);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }
  }

  function drawRings() {
    // Intake ripples: the visible answer to holding FLOOD.
    for (const g of rings) {
      const a = Math.max(0, g.life / 0.6) * 0.30;
      ctx.strokeStyle = 'rgba(180,225,240,' + a.toFixed(2) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx(g.x), sy(g.y), g.r * L.ppm, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawBubbles() {
    ctx.fillStyle = 'rgba(200,240,250,0.45)';
    for (const b of particles) {
      const a = Math.min(1, b.life / 2);
      ctx.globalAlpha = a * 0.5;
      ctx.beginPath(); ctx.arc(sx(b.x), sy(b.y), b.r * (L.ppm / 3.25), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloats() {
    ctx.font = '700 13px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of floats) {
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.fillStyle = SCRIM(0.6);
      const tw = ctx.measureText(f.text).width;
      ctx.beginPath();
      UI.roundRectPath(ctx, sx(f.x) - tw / 2 - 7, sy(f.y) - 11, tw + 14, 22, 11);
      ctx.fill();
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sx(f.x), sy(f.y));
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  // ---------- RENDER: CHROME ----------
  function drawBar(x, y, w, h, frac, color) {
    ctx.fillStyle = TINT(0.10);
    ctx.beginPath(); UI.roundRectPath(ctx, x, y, w, h, h / 2); ctx.fill();
    if (frac > 0.005) {
      ctx.fillStyle = color;
      ctx.beginPath(); UI.roundRectPath(ctx, x, y, Math.max(h, w * Math.min(1, frac)), h, h / 2); ctx.fill();
    }
  }
  const fmtMoney = (n) => '$ ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  function drawGauge() {
    const g = L.gauge;
    const RANGE = 260;                       // kg full-scale, both ways
    const net = run.net();
    const k = run.world.ceiling(run.y);      // the layer overhead, -1 in the shallows
    // Track.
    ctx.fillStyle = SCRIM(0.55);
    ctx.beginPath(); UI.roundRectPath(ctx, g.x, g.y, g.w, g.h, g.w / 2); ctx.fill();
    ctx.strokeStyle = TINT(0.10); ctx.lineWidth = 1;
    ctx.beginPath(); UI.roundRectPath(ctx, g.x, g.y, g.w, g.h, g.w / 2); ctx.stroke();
    const yFor = (kg) => g.y + g.h / 2 - (Math.max(-RANGE, Math.min(RANGE, kg)) / RANGE) * (g.h / 2 - 10);
    // The green zone: lift enough to clear the ceiling overhead.
    if (k >= 0) {
      const yA = yFor(RANGE), yB = yFor(TUNE.T[k]);
      ctx.fillStyle = 'rgba(93,211,158,0.16)';                 // --green
      ctx.beginPath(); UI.roundRectPath(ctx, g.x + 4, yA, g.w - 8, Math.max(4, yB - yA), 4); ctx.fill();
      ctx.strokeStyle = 'rgba(93,211,158,0.55)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(g.x + 3, yB); ctx.lineTo(g.x + g.w - 3, yB); ctx.stroke();
      ctx.setLineDash([]);
    }
    // Ticks at each discovered threshold.
    ctx.font = '700 10px Inter, sans-serif'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) {
      if (!run.discovered[i]) continue;
      const yy = yFor(TUNE.T[i]);
      ctx.strokeStyle = TINT(0.40); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(g.x + 5, yy); ctx.lineTo(g.x + g.w - 5, yy); ctx.stroke();
      ctx.fillStyle = INK72;
      // Labels sit outboard of the track: right of it on desktop, left of it
      // on mobile, where the track is pinned to the frame edge.
      if (MODE === 'desktop') { ctx.textAlign = 'left';  ctx.fillText('L' + (i + 1), g.x + g.w + 5, yy); }
      else                    { ctx.textAlign = 'right'; ctx.fillText('L' + (i + 1), g.x - 5, yy); }
    }
    // Centre line.
    ctx.strokeStyle = TINT(0.22); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.x + 6, yFor(0)); ctx.lineTo(g.x + g.w - 6, yFor(0)); ctx.stroke();
    // The marker.
    const my = yFor(net);
    const mcol = (k >= 0 && net >= TUNE.T[k]) ? C_GREEN : net > 4 ? '#9BD4E8' : net < -4 ? C_ACCENT_TEXT : '#FFFFFF';
    ctx.shadowColor = mcol; ctx.shadowBlur = 8;
    ctx.fillStyle = mcol;
    ctx.beginPath(); UI.roundRectPath(ctx, g.x + 3, my - 4, g.w - 6, 8, 4); ctx.fill();
    ctx.shadowBlur = 0;
    // Labels.
    ctx.textAlign = 'center';
    ctx.fillStyle = INK72; ctx.font = '700 10px Inter, sans-serif';
    ctx.fillText('LIFT', g.x + g.w / 2, g.y - 12);
    const state = net < -4 ? 'HEAVY' : net > 4 ? 'LIFT' : 'HOVER';
    ctx.fillStyle = state === 'HEAVY' ? C_ACCENT_TEXT : state === 'LIFT' ? C_GREEN : '#FFFFFF';
    ctx.font = '800 11px Inter, sans-serif';
    ctx.fillText(state, g.x + g.w / 2, g.y + g.h + 13);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  function drawSealedBanner(now) {
    const need = run.sealedNeed();
    if (!need || card) return;
    const o = L.ocean;
    const msg = 'SEALED · drop ' + need + ' kg to rise';
    ctx.font = '700 15px Inter, sans-serif';
    const tw = ctx.measureText(msg).width;
    const w = tw + 74, h = 40;
    const x = o.x + o.w / 2 - w / 2, y = o.y + 26;
    const pulse = 0.75 + 0.25 * Math.sin(now / 300);
    ctx.fillStyle = SCRIM(0.85);
    ctx.beginPath(); UI.roundRectPath(ctx, x, y, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,107,92,' + pulse.toFixed(2) + ')';   // --accent-text
    ctx.lineWidth = 1.5;
    ctx.beginPath(); UI.roundRectPath(ctx, x, y, w, h, h / 2); ctx.stroke();
    // Blocked-rise glyph.
    ctx.strokeStyle = C_ACCENT_TEXT; ctx.lineWidth = 2.5;
    const ax = x + 26, ay = y + h / 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay + 7); ctx.lineTo(ax, ay - 4);
    ctx.moveTo(ax - 5, ay + 1); ctx.lineTo(ax, ay - 4); ctx.lineTo(ax + 5, ay + 1);
    ctx.moveTo(ax - 7, ay - 8); ctx.lineTo(ax + 7, ay - 8);
    ctx.stroke();
    ctx.fillStyle = INK92;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(msg, x + 44, y + h / 2 + 1);
    ctx.textBaseline = 'top';
  }

  function pill(id, label, cx, cy, opts) {
    const box = UI.drawPill(ctx, label, cx, cy, opts);
    let entry = hit.pills.find(p => p.id === id);
    if (!entry) { entry = { id, tapped: null }; hit.pills.push(entry); }
    entry.box = box;
    return box;
  }
  function iconPill(id, cx, cy, draw) {
    const box = pill(id, '', cx, cy, { w: UI.PILL.iconW });
    draw(cx, cy);
    return box;
  }
  function speakerIcon(cx, cy, on) {
    ctx.strokeStyle = INK92; ctx.fillStyle = INK92; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 3); ctx.lineTo(cx - 4, cy - 3); ctx.lineTo(cx + 1, cy - 7);
    ctx.lineTo(cx + 1, cy + 7); ctx.lineTo(cx - 4, cy + 3); ctx.lineTo(cx - 8, cy + 3);
    ctx.closePath(); ctx.fill();
    if (on) {
      ctx.beginPath(); ctx.arc(cx + 4, cy, 4.5, -1, 1); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 4, cy, 7.5, -1, 1); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx + 4, cy - 4); ctx.lineTo(cx + 10, cy + 4);
      ctx.moveTo(cx + 10, cy - 4); ctx.lineTo(cx + 4, cy + 4);
      ctx.stroke();
    }
  }
  function questionIcon(cx, cy) {
    ctx.fillStyle = INK92;
    ctx.font = '700 15px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', cx, cy + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }
  function jettisonPill(cx, cy) {
    ctx.font = '700 ' + UI.PILL.font + 'px Inter, sans-serif';
    const label = 'JETTISON';
    const w = Math.round(ctx.measureText(label).width + UI.PILL.padX + 10);
    const box = pill('jettison', '', cx, cy, { w });
    const has = run.cargo.length > 0;
    const colr = has ? C_ACCENT_TEXT : UI.PILL.textDim;
    ctx.strokeStyle = colr; ctx.lineWidth = 2.2;
    const ax = cx - w / 2 + 18, ay = cy;
    ctx.beginPath();
    ctx.moveTo(ax, ay - 7); ctx.lineTo(ax, ay + 6);
    ctx.moveTo(ax - 5, ay + 1); ctx.lineTo(ax, ay + 7); ctx.lineTo(ax + 5, ay + 1);
    ctx.stroke();
    ctx.fillStyle = has ? INK92 : UI.PILL.textDim;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, cx + 6, cy + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    return box;
  }

  function drawChromeMobile(now) {
    // Top band: solid Ground, $ and depth left; cargo, air, batt right.
    ctx.fillStyle = C_BG;
    ctx.fillRect(0, 0, LW, L.top);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 22px Inter, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(fmtMoney(run.money), SIDE_PAD, 34);
    ctx.fillStyle = INK72; ctx.font = '600 13px Inter, sans-serif';
    ctx.fillText('DEPTH ' + Math.round(run.y) + ' m', SIDE_PAD, 58);
    const zx = LW - SIDE_PAD - 170;
    const rows = [
      ['CARGO', run.cargoKg / run.cargoMax(), C_ACCENT_TEXT, Math.round(run.cargoKg) + '/' + run.cargoMax()],
      ['AIR', run.air / run.airMax(), run.air / run.airMax() < 0.25 ? C_ACCENT_TEXT : C_GREEN, Math.round(run.air) + ''],
      ['BATT', run.batt / run.battMax(), C_SUN, Math.round(run.batt) + ''],
    ];
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) {
      const ry = 16 + i * 24;
      ctx.fillStyle = INK72; ctx.font = '700 10px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(rows[i][0], zx, ry);
      drawBar(zx + 48, ry - 3, 84, 6, rows[i][1], rows[i][2]);
      ctx.fillStyle = INK90; ctx.font = '600 11px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(rows[i][3], LW - SIDE_PAD, ry);
      ctx.textAlign = 'left';
    }
    ctx.textBaseline = 'top';

    drawGauge();
    drawSealedBanner(now);

    // Bottom row on the band system's centre line. The row lays out from
    // both ends of the same band, so the collisions are measured, not hoped
    // away: JETTISON shifts right off the pills, and BEST yields if beaten.
    const cy = L.rowCy;
    const p1 = iconPill('sound', SIDE_PAD + 22, cy, (cx, cyy) => speakerIcon(cx, cyy, sfx ? sfx.isOn() : true));
    const p2 = iconPill('rules', SIDE_PAD + 22 + UI.PILL.iconW + UI.PILL.gap, cy, questionIcon);
    ctx.font = '700 ' + UI.PILL.font + 'px Inter, sans-serif';
    const jw = Math.round(ctx.measureText('JETTISON').width + UI.PILL.padX + 18);
    let jcx = Math.max(LW / 2, p2.x + p2.w + UI.PILL.gap + jw / 2);
    const jbox = jettisonPill(jcx, cy);
    ctx.font = '600 13px Inter, sans-serif';
    const bestStr = 'BEST ' + Math.round(Math.max(bestEver, run.bestDepth)) + ' m';
    if (LW - SIDE_PAD - ctx.measureText(bestStr).width > jbox.x + jbox.w + 12) {
      ctx.fillStyle = INK72;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(bestStr, LW - SIDE_PAD, cy);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }

    // Scheme A: FLOOD and BLOW, thumb-stacked. Chrome-sized, bigger hit slop.
    if (scheme === 'A') {
      const btn = (b, label, up, activeId) => {
        const active = activeId != null;
        ctx.fillStyle = active ? TINT(0.14) : UI.PILL.fill;
        ctx.beginPath(); UI.roundRectPath(ctx, b.cx - 22, b.cy - 20, 44, 40, 20); ctx.fill();
        ctx.strokeStyle = active ? TINT(0.7) : UI.PILL.border; ctx.lineWidth = UI.PILL.borderW;
        ctx.beginPath(); UI.roundRectPath(ctx, b.cx - 22, b.cy - 20, 44, 40, 20); ctx.stroke();
        ctx.strokeStyle = INK92; ctx.lineWidth = 2.4;
        ctx.beginPath();
        if (up) {
          ctx.moveTo(b.cx, b.cy + 6); ctx.lineTo(b.cx, b.cy - 6);
          ctx.moveTo(b.cx - 6, b.cy); ctx.lineTo(b.cx, b.cy - 7); ctx.lineTo(b.cx + 6, b.cy);
        } else {
          ctx.moveTo(b.cx, b.cy - 6); ctx.lineTo(b.cx, b.cy + 6);
          ctx.moveTo(b.cx - 6, b.cy); ctx.lineTo(b.cx, b.cy + 7); ctx.lineTo(b.cx + 6, b.cy);
        }
        ctx.stroke();
        ctx.fillStyle = INK72; ctx.font = '700 9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, b.cx, b.cy + 24);
        ctx.textAlign = 'left';
      };
      btn(L.blowBtn, 'BLOW', true, held.blowBtn);
      btn(L.floodBtn, 'FLOOD', false, held.floodBtn);
    }
  }

  function drawChromeDesktop(now) {
    // The Portal wash behind the frame chrome (the ocean paints over its region).
    // Top band content: control row left, depth read-out right.
    const cy = L.top / 2;
    let x = SIDE_PAD;
    const b1 = iconPill('sound', x + 22, cy, (cx, cyy) => speakerIcon(cx, cyy, sfx ? sfx.isOn() : true));
    x = b1.x + b1.w + UI.PILL.gap;
    const b2 = pill('restart', 'Restart', x + UI.pillWidth(ctx, 'Restart') / 2, cy);
    x = b2.x + b2.w + UI.PILL.gap;
    const b3 = pill('rules', 'Rules', x + UI.pillWidth(ctx, 'Rules') / 2, cy);
    L.rowRight = b3.x + b3.w;
    // Read-out: one right-aligned line, measured against the row.
    const ro = 'DEPTH ' + Math.round(run.y) + ' m   ·   BEST ' + Math.round(Math.max(bestEver, run.bestDepth)) + ' m';
    ctx.font = '600 16px Inter, sans-serif';
    let roW = ctx.measureText(ro).width;
    const roomFor = LW - SIDE_PAD - (L.rowRight + 16);
    let hs = 1;
    if (roW > roomFor) hs = Math.max(0.66, roomFor / roW);
    ctx.save();
    ctx.translate(LW - SIDE_PAD, cy);
    ctx.scale(hs, hs);
    ctx.fillStyle = INK72; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(ro, 0, 1);
    ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';

    // Instrument column.
    const g = L.col;
    ctx.fillStyle = '#FFFFFF'; ctx.font = '800 22px Inter, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(fmtMoney(run.money), g.x, g.y + 26);
    ctx.fillStyle = INK72; ctx.font = '700 10px Inter, sans-serif';
    ctx.fillText('BANKED', g.x, g.y + 42);
    const bars = [
      ['AIR', run.air / run.airMax(), run.air / run.airMax() < 0.25 ? C_ACCENT_TEXT : C_GREEN,
       Math.round(run.air) + ' / ' + run.airMax()],
      ['BATT', run.batt / run.battMax(), C_SUN, Math.round(run.batt) + ' / ' + run.battMax()],
      ['CARGO', run.cargoKg / run.cargoMax(), C_ACCENT_TEXT, Math.round(run.cargoKg) + ' / ' + run.cargoMax() + ' kg'],
    ];
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) {
      const ry = g.y + 66 + i * 34;
      ctx.fillStyle = INK72; ctx.font = '700 11px Inter, sans-serif';
      ctx.fillText(bars[i][0], g.x, ry);
      ctx.fillStyle = INK90; ctx.font = '600 12px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(bars[i][3], g.x + g.w, ry);
      ctx.textAlign = 'left';
      drawBar(g.x, ry + 8, g.w, 8, bars[i][1], bars[i][2]);
    }
    ctx.textBaseline = 'top';

    drawGauge();

    // The cargo manifest: what JETTISON will drop next, highlighted.
    const my = L.manifestY;
    ctx.fillStyle = INK72; ctx.font = '700 10px Inter, sans-serif';
    ctx.fillText('MANIFEST', g.x, my);
    const nextDrop = run.jettisonNext();
    ctx.font = '600 13px Inter, sans-serif'; ctx.textBaseline = 'middle';
    if (!run.cargo.length) {
      ctx.fillStyle = INK72;
      ctx.fillText('Hold empty', g.x, my + 22);
    } else {
      const maxRows = L.manifestRows;
      for (let i = 0; i < Math.min(run.cargo.length, maxRows); i++) {
        const item = run.cargo[i];
        const ry = my + 20 + i * 17;
        const hot = i === nextDrop;
        ctx.fillStyle = hot ? C_ACCENT_TEXT : INK72;
        if (hot) {   // the next-to-drop marker, drawn, not a glyph
          ctx.beginPath();
          ctx.moveTo(g.x + 1, ry - 3); ctx.lineTo(g.x + 9, ry - 3); ctx.lineTo(g.x + 5, ry + 3);
          ctx.closePath(); ctx.fill();
        }
        const name = item.type === 'nodule' ? 'Nodule' : item.type === 'sulphide' ? 'Sulphide' : 'Crystal';
        ctx.fillText(name, g.x + 14, ry);
        ctx.textAlign = 'right';
        ctx.fillText(item.kg + ' kg', g.x + g.w - 44, ry);
        ctx.fillText('$' + item.val, g.x + g.w, ry);
        ctx.textAlign = 'left';
      }
      if (run.cargo.length > maxRows) {
        ctx.fillStyle = INK72;
        ctx.fillText('+ ' + (run.cargo.length - maxRows) + ' more', g.x, my + 20 + maxRows * 17);
      }
    }
    ctx.textBaseline = 'top';
    jettisonPill(L.jettison.cx, L.jettison.cy);
    drawSealedBanner(now);
  }

  // ---------- RENDER: CARDS ----------
  /* The standard modal: 470 x 420 max, three zones, only the body scrolls,
     the type never shrinks and the CTA never moves. */
  function cardBox() {
    const pw = Math.min(LW - 56, 470);
    const ph = Math.min(LH - 20, 420);
    const px = Math.round((LW - pw) / 2);
    const py = Math.max(10, Math.round((LH - ph) / 2));
    return { pw, ph, px, py };
  }
  const HEAD_H = 154, FOOT_H = 98;

  function rulesCopy() {
    if (MODE === 'desktop') return [
      'Heavy sinks, light rises, and ore is weight. Every grab makes the sub heavier.',
      'S floods ballast to sink. W blows ballast to rise, and blowing spends the same air you breathe.',
      'The glowing bands are density layers: floors in the water. Sink through with enough weight, rise through with enough lift, or rest on one for free.',
      'A and D thrust against the current. Touch a deposit and the claw takes it.',
      'J jettisons the heaviest item, instantly. If the banner says SEALED, drop weight until it does not.',
      'Surface to bank the haul. If the air runs out down there, the haul is lost and the bank is kept.',
    ];
    if (scheme === 'A') return [
      'Heavy sinks, light rises, and ore is weight. Every grab makes the sub heavier.',
      'Hold FLOOD to take on water and sink. Hold BLOW to rise. Blowing spends the same air you breathe.',
      'The glowing bands are density layers: floors in the water. Sink through with enough weight, rise through with enough lift, or rest on one for free.',
      'Hold the left or right half of the water to thrust. Touch a deposit and the claw takes it.',
      'JETTISON drops the heaviest item, instantly. If the banner says SEALED, drop weight until it does not.',
      'Surface to bank the haul. If the air runs out down there, the haul is lost and the bank is kept.',
    ];
    return [
      'Heavy sinks, light rises, and ore is weight. Every grab makes the sub heavier.',
      'Swipe down anywhere to flood and sink. Swipe up to blow ballast and rise. Blowing spends the same air you breathe.',
      'The glowing bands are density layers: floors in the water. Sink through with enough weight, rise through with enough lift, or rest on one for free.',
      'Touch the sub and drag left or right to thrust. Touch a deposit and the claw takes it.',
      'JETTISON drops the heaviest item, instantly. If the banner says SEALED, drop weight until it does not.',
      'Surface to bank the haul. If the air runs out down there, the haul is lost and the bank is kept.',
    ];
  }

  let rulesContentH = 0;
  function drawRulesCard() {
    const { pw, ph, px, py } = cardBox();
    ctx.fillStyle = SCRIM(0.88); ctx.fillRect(0, 0, LW, LH);
    ctx.fillStyle = C_SURFACE;
    ctx.beginPath(); UI.roundRectPath(ctx, px, py, pw, ph, 22); ctx.fill();
    ctx.strokeStyle = TINT(0.12); ctx.lineWidth = 1;
    ctx.beginPath(); UI.roundRectPath(ctx, px, py, pw, ph, 22); ctx.stroke();
    const cx = px + pw / 2;
    // Header.
    ctx.fillStyle = '#FFFFFF'; ctx.font = '800 40px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    let y = py + 34 + 40;
    ctx.fillText('FATHOM', cx, y - 8);
    y = py + 34 + 54;
    ctx.fillStyle = INK82; ctx.font = '600 17px Inter, sans-serif';
    ctx.fillText('Only light things may rise', cx, y + 16);
    // Body: clipped viewport, scrolls.
    const bodyY = py + HEAD_H;
    const bodyH = ph - HEAD_H - FOOT_H;
    hit.rulesBody = { x: px, y: bodyY, w: pw, h: bodyH };
    ctx.save();
    ctx.beginPath(); ctx.rect(px, bodyY, pw, bodyH); ctx.clip();
    const rules = rulesCopy();
    const wrapW = pw - 100;
    ctx.font = '500 16px Inter, sans-serif';
    // Measure.
    let contentH = 0;
    const rowsWrapped = rules.map(r => {
      const lines = wrapText(r, wrapW);
      const h = lines.length * 22;
      contentH += h + 13;
      return lines;
    });
    contentH -= 13;
    rulesContentH = contentH;
    const scrollMax = Math.max(0, contentH - bodyH);
    rulesScroll = Math.max(0, Math.min(scrollMax, rulesScroll));
    let ry = bodyY - rulesScroll + 2;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (let i = 0; i < rules.length; i++) {
      const lines = rowsWrapped[i];
      // Number dot.
      ctx.fillStyle = C_ACCENT_TEXT;
      ctx.beginPath(); ctx.arc(px + 43, ry + 11, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C_BG; ctx.font = '800 14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), px + 43, ry + 12);
      ctx.textAlign = 'left';
      ctx.fillStyle = INK90; ctx.font = '500 16px Inter, sans-serif';
      for (let li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], px + 66, ry + 11 + li * 22);
      }
      ry += lines.length * 22 + 13;
    }
    ctx.restore();
    // Edge fades where there is more content.
    if (rulesScroll > 2) {
      const fg = ctx.createLinearGradient(0, bodyY, 0, bodyY + 20);
      fg.addColorStop(0, C_SURFACE); fg.addColorStop(1, 'rgba(19,31,54,0)');
      ctx.fillStyle = fg; ctx.fillRect(px + 2, bodyY, pw - 4, 20);
    }
    if (rulesScroll < scrollMax - 2) {
      const fg = ctx.createLinearGradient(0, bodyY + bodyH - 20, 0, bodyY + bodyH);
      fg.addColorStop(0, 'rgba(19,31,54,0)'); fg.addColorStop(1, C_SURFACE);
      ctx.fillStyle = fg; ctx.fillRect(px + 2, bodyY + bodyH - 20, pw - 4, 20);
    }
    // Footer.
    hit.cta = UI.drawCTA(ctx, started || run.dives > 0 ? 'DIVE' : 'DIVE', cx, py + ph - FOOT_H + 16 + 25, C_ACCENT);
    // Under the card: the scheme toggle (mobile) and a fresh ocean. In a
    // short frame (the 480x360 embed minimum) there is no room below the
    // card and they would sit on the CTA, so they hide instead.
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const underY = py + ph + 30;
    if (MODE === 'mobile' && LH - (py + ph) >= 58) {
      const lab = scheme === 'A' ? 'CONTROLS: BUTTONS' : 'CONTROLS: GESTURES';
      const w1 = UI.pillWidth(ctx, lab);
      const w2 = UI.pillWidth(ctx, 'NEW OCEAN');
      const total = w1 + UI.PILL.gap + w2;
      hit.schemeToggle = UI.drawPill(ctx, lab, LW / 2 - total / 2 + w1 / 2, underY);
      hit.newOcean = UI.drawPill(ctx, 'NEW OCEAN', LW / 2 + total / 2 - w2 / 2, underY);
    } else {
      hit.schemeToggle = null;
      hit.newOcean = null;
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  function drawEndCard(title, subtitle, rows) {
    const { pw, ph, px, py } = cardBox();
    ctx.fillStyle = SCRIM(0.82); ctx.fillRect(0, 0, LW, LH);
    ctx.fillStyle = C_SURFACE;
    ctx.beginPath(); UI.roundRectPath(ctx, px, py, pw, ph, 22); ctx.fill();
    ctx.strokeStyle = TINT(0.12); ctx.lineWidth = 1;
    ctx.beginPath(); UI.roundRectPath(ctx, px, py, pw, ph, 22); ctx.stroke();
    const cx = px + pw / 2;
    ctx.fillStyle = '#FFFFFF'; ctx.font = '800 40px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, cx, py + 34 + 32);
    ctx.fillStyle = INK82; ctx.font = '600 17px Inter, sans-serif';
    ctx.fillText(subtitle, cx, py + 34 + 54 + 16);
    ctx.font = '500 16px Inter, sans-serif'; ctx.textBaseline = 'middle';
    let ry = py + HEAD_H + 18;
    for (const [k, v] of rows) {
      ctx.fillStyle = INK72; ctx.textAlign = 'left';
      ctx.fillText(k, px + 56, ry);
      ctx.fillStyle = INK90; ctx.textAlign = 'right';
      ctx.fillText(v, px + pw - 56, ry);
      ry += 30;
    }
    ctx.textAlign = 'center';
    hit.cta = UI.drawCTA(ctx, 'DIVE AGAIN', cx, py + ph - FOOT_H + 16 + 25, C_ACCENT);
    hit.schemeToggle = null; hit.newOcean = null;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  const wrapCache = new Map();
  function wrapText(text, width) {
    const key = text + '|' + width;
    if (wrapCache.has(key)) return wrapCache.get(key);
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const wd of words) {
      const probe = line ? line + ' ' + wd : wd;
      if (ctx.measureText(probe).width > width && line) { lines.push(line); line = wd; }
      else line = probe;
    }
    if (line) lines.push(line);
    wrapCache.set(key, lines);
    return lines;
  }

  // ---------- RENDER ----------
  function render(now) {
    ctx.clearRect(0, 0, LW, LH);
    // The Portal wash: the one canvas floor, centre 32% width on the top edge.
    const bg = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
    bg.addColorStop(0, C_RAISED); bg.addColorStop(0.6, C_SURFACE); bg.addColorStop(1, C_BG);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);

    drawScene(now);
    if (MODE === 'mobile') drawChromeMobile(now); else drawChromeDesktop(now);

    // Low-air vignette: the warning is ambient before it is terminal.
    if (!card && run.air < 25 && run.y > TUNE.surfaceY) {
      const a = (1 - run.air / 25) * 0.45;
      const vg = ctx.createRadialGradient(LW / 2, LH / 2, LH * 0.3, LW / 2, LH / 2, LH * 0.75);
      vg.addColorStop(0, 'rgba(10,4,4,0)'); vg.addColorStop(1, 'rgba(30,4,4,' + a.toFixed(2) + ')');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, LW, LH);
    }

    hit.cta = null;
    if (card === 'rules') drawRulesCard();
    else if (card === 'banked' && cardData) {
      drawEndCard('HAUL BANKED', fmtMoney(cardData.val) + ' banked · ' + cardData.kg + ' kg',
        [['Deepest point', cardData.depth + ' m'],
         ['Session best', Math.round(bestEver) + ' m'],
         ['Bank total', fmtMoney(run.money)]]);
    } else if (card === 'blackout' && cardData) {
      drawEndCard('BLACKOUT', 'The tank ran dry at ' + cardData.depth + ' m',
        [['Haul lost', fmtMoney(cardData.lostVal) + ' · ' + cardData.lostKg + ' kg'],
         ['Banked money', fmtMoney(run.money) + ' · safe'],
         ['Session best', Math.round(bestEver) + ' m']]);
    }
  }

  // ---------- DETECTORS ----------
  /* A card is not fixed until something can measure it. */
  function rulesFit() {
    const { pw, ph, px, py } = cardBox();
    const bodyH = ph - HEAD_H - FOOT_H;
    const contentH = rulesContentH || 0;
    return {
      fits: (HEAD_H + bodyH + FOOT_H === ph) && py >= 10 && px >= 0 && bodyH > 40,
      cardH: ph, frameH: LH, viewportH: bodyH, contentH,
      scrollMax: Math.max(0, contentH - bodyH),
      overlapPx: Math.max(0, HEAD_H + FOOT_H + 40 - ph),
    };
  }
  function fit() {
    const roRoom = MODE === 'desktop' ? (LW - SIDE_PAD - ((L.rowRight || 0) + 16)) : null;
    return {
      mode: MODE, LW, LH, ppm: L.ppm,
      ocean: L.ocean, gauge: L.gauge,
      viewWm: L.viewWm, viewHm: L.viewHm,
      rowReadoutRoom: roRoom,
      gaugeInsideOcean: L.gauge.y >= L.ocean.y && L.gauge.y + L.gauge.h <= L.ocean.y + L.ocean.h,
    };
  }

  // ---------- HARNESS ----------
  if (qs.get('harness') === '1') {
    window.FATHOM = {
      get run() { return run; },
      TUNE, seed,
      state: () => ({ x: run.x, y: run.y, vx: run.vx, vy: run.vy, net: run.net(),
                      ballast: run.ballast, cargoKg: run.cargoKg, air: run.air,
                      batt: run.batt, money: run.money, mode: run.mode,
                      restingOn: run.restingOn, pressedUnder: run.pressedUnder,
                      sealedNeed: run.sealedNeed(), grabTarget: run.grabTarget }),
      step: (frames, inp) => { for (let i = 0; i < frames; i++) run.step(inp || {}, 1 / 60); },
      teleport: (x, y) => { run.x = x; run.y = y; run.vx = 0; run.vy = 0; },
      setCargo: (kg) => { run.cargo = [{ type: 'nodule', kg, val: 0 }]; run.cargoKg = kg; },
      newRun: (s) => { run = new SIM.Run(s >>> 0); },
      openCard: (c) => { card = c; },
      closeCard: () => { card = null; },
      setScheme: (s) => { scheme = s; },
      get cam() { return cam; },
      rulesFit, fit,
      render: () => render(performance.now()),
      /* The preview pane reports visibilityState 'hidden' and never services
         requestAnimationFrame, so the harness drives frames itself: sim,
         camera and particles at 60 Hz, then one render. */
      drive: (seconds, inp) => {
        const n = Math.round(seconds * 60);
        for (let i = 0; i < n; i++) {
          const base = inp || {};
          // Merge the queued pointer state exactly the way tick() does, so
          // swipes, bursts and the joystick reach the sim in this pane too.
          const events = run.step({
            ax: Math.max(-1, Math.min(1, (base.ax || 0) + joyVec)),
            flood: !!base.flood, blow: !!base.blow,
            floodKg: (base.floodKg || 0) + burstFlood,
            blowKg: (base.blowKg || 0) + burstBlow,
            jettison: !!(base.jettison || wantJettison),
          }, 1 / 60);
          burstFlood = 0; burstBlow = 0; wantJettison = false;
          for (const ev of events) handleEvent(ev);
          updateCam(1 / 60);
          stepParticles(1 / 60);
        }
        render(performance.now());
      },
    };
  }

  // ---------- BOOT ----------
  setCanvasVars();
  resizeCanvas();
  fitFullscreen();
  resizeCanvas();
  layout();
  cam.x = run.x - (L.viewWm || 100) / 2;
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', () => render(performance.now()));
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  requestAnimationFrame(tick);
})();
