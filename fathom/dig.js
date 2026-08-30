/* ============================================================
   FATHOM DIG · throwaway prototype
   ------------------------------------------------------------
   The owner's pivot sketch, playable: open ocean above, tiled
   rock below. Dig anywhere — but only light things rise. Every
   tunnel floods behind you, the dark eats everything past your
   lamp, and the way home is the shaft you remember digging.

   Deliberately rough: no rules card, no density layers, no
   creature. One page, one file, built to answer one question —
   is drill-plus-float a loop worth rebuilding the game around?
   ============================================================ */
(() => {
  'use strict';

  // ---------- MODE / CANVAS (the house pattern, trimmed) ----------
  const MODE = (matchMedia('(pointer: coarse)').matches ||
                (window.innerWidth > 0 && window.innerWidth < 768))
    ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);
  let LW, LH;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const gameWrap = canvas.parentElement;
  const FRAME_W = 760;
  function setCanvasVars() {
    if (MODE === 'mobile') { LW = window.innerWidth; LH = window.innerHeight; }
    else { LW = 760; LH = 600; }
    document.body.style.setProperty('--canvas-w', LW + 'px');
    document.body.style.setProperty('--canvas-h', LH + 'px');
  }
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const bW = Math.round((rect.width || LW) * dpr), bH = Math.round((rect.height || LH) * dpr);
    if (canvas.width !== bW) canvas.width = bW;
    if (canvas.height !== bH) canvas.height = bH;
    const s = Math.min(bW / LW, bH / LH);
    ctx.setTransform(s, 0, 0, s, 0, 0);
  }
  function onResize() { setCanvasVars(); if (MODE === 'mobile') { gameWrap.style.width = LW + 'px'; gameWrap.style.height = LH + 'px'; } resizeCanvas(); layout(); }
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zam.fathom.sfx', gain: 2.2 }) : null;
  const UI = window.ZAM_UI;

  // ---------- TOKENS ----------
  const C_BG = '#0E1726', C_SURFACE = '#131F36';
  const SCRIM = (a) => 'rgba(10,16,28,' + a + ')';
  const TINT = (a) => 'rgba(255,255,255,' + a + ')';
  const INK72 = TINT(0.72), INK90 = TINT(0.90), INK92 = TINT(0.92);
  const C_ACCENT_TEXT = '#FF6B5C', C_GREEN = '#5DD39E', C_SUN = '#FFD23F';

  // ---------- THE WORLD: TILES ----------
  const TILE = 8;                       // metres
  const COLS = 34, ROWS = 96;           // 272 m wide, 768 m deep
  const SEA_ROWS = 9;                   // open ocean above the rock
  const W_M = COLS * TILE;
  // Tile types.
  const T_WATER = 0, T_SILT = 1, T_ROCK = 2, T_NOD = 3, T_SUL = 4, T_CRY = 5,
        T_GAS = 6, T_BED = 7;
  const HARDNESS = { [T_SILT]: 0.7, [T_ROCK]: 1.7, [T_NOD]: 1.0, [T_SUL]: 1.3, [T_CRY]: 1.5, [T_GAS]: 0.5 };
  const ORE = { [T_NOD]: { kg: 20, val: 26, key: 'nodule' },
                [T_SUL]: { kg: 12, val: 48, key: 'sulphide' },
                [T_CRY]: { kg: 5,  val: 95, key: 'crystal' } };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const qs = new URLSearchParams(location.search);
  const seed = qs.has('seed') ? (parseInt(qs.get('seed'), 10) >>> 0) : ((Math.random() * 1e9) >>> 0);

  let grid, dug;                        // Uint8 tile types; dig progress map
  function genWorld() {
    const rng = mulberry32(seed);
    grid = new Uint8Array(COLS * ROWS).fill(T_WATER);
    dug = new Map();
    for (let r = SEA_ROWS; r < ROWS; r++) {
      const depthT = (r - SEA_ROWS) / (ROWS - SEA_ROWS);
      for (let c = 0; c < COLS; c++) {
        let t = T_SILT;
        if (rng() < 0.12 + depthT * 0.55) t = T_ROCK;
        // ore by depth band
        const roll = rng();
        if (depthT < 0.35 && roll < 0.055) t = T_NOD;
        else if (depthT > 0.2 && depthT < 0.75 && roll < 0.034) t = T_SUL;
        else if (depthT > 0.55 && roll < 0.024) t = T_CRY;
        else if (depthT > 0.12 && rng() < 0.013) t = T_GAS;
        grid[r * COLS + c] = t;
      }
      // the seabed's first row keeps a couple of natural dents
    }
    // caverns: pockets of trapped water, like the sketch's dark-blue holes
    for (let i = 0; i < 26; i++) {
      const cc = 2 + rng() * (COLS - 4), cr = SEA_ROWS + 4 + rng() * (ROWS - SEA_ROWS - 10);
      const rw = 1.2 + rng() * 2.6, rh = 0.8 + rng() * 1.8;
      for (let r = Math.max(SEA_ROWS, Math.floor(cr - rh)); r <= Math.min(ROWS - 3, Math.ceil(cr + rh)); r++) {
        for (let c = Math.max(0, Math.floor(cc - rw)); c <= Math.min(COLS - 1, Math.ceil(cc + rw)); c++) {
          const dx = (c - cc) / rw, dy = (r - cr) / rh;
          if (dx * dx + dy * dy < 1) grid[r * COLS + c] = T_WATER;
        }
      }
    }
    // bedrock floor
    for (let r = ROWS - 2; r < ROWS; r++) for (let c = 0; c < COLS; c++) grid[r * COLS + c] = T_BED;
  }
  const tileAt = (c, r) => (c < 0 || c >= COLS) ? T_BED : (r < 0) ? T_WATER : (r >= ROWS) ? T_BED : grid[r * COLS + c];
  const solidAt = (x, y) => {           // metres
    const t = tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
    return t !== T_WATER;
  };

  // ---------- THE SUB (verbs and law copied from the main game) ----------
  const K = { buoyK: 0.32, vMax: 90, thrust: 90, hMax: 52, drag: 1.3,
              floodRate: 260, blowRate: 260, trimRate: 260,
              RESERVE: 300, ballastMax: 400,
              airPerKg: 0.04, lifeSupport: 0.35, surfaceY: 3, regen: 25,
              subR: 4.2, digBatt: 2.2, thrustBatt: 3.0 };
  // The fleet save carries over: same boat, same bank.
  const FLEET_STATS = [
    { name: 'Minnow', lenM: 13.5, st: { AIR: 1, CARGO: 1, BATT: 1, SPEED: 2, LAMP: 1 }, file: 'sub-1.png' },
    { name: 'Lagoon', lenM: 14, st: { AIR: 3, CARGO: 1, BATT: 2, SPEED: 1, LAMP: 2 }, file: 'sub-2.png' },
    { name: 'Bluefin', lenM: 14, st: { AIR: 2, CARGO: 2, BATT: 2, SPEED: 3, LAMP: 1 }, file: 'sub-3.png' },
    { name: 'Sunfish', lenM: 14.5, st: { AIR: 2, CARGO: 3, BATT: 2, SPEED: 2, LAMP: 2 }, file: 'sub-4.png' },
    { name: 'Dredger', lenM: 15, st: { AIR: 2, CARGO: 5, BATT: 2, SPEED: 1, LAMP: 2 }, file: 'sub-5.png' },
    { name: 'Ember', lenM: 15, st: { AIR: 3, CARGO: 2, BATT: 5, SPEED: 3, LAMP: 1 }, file: 'sub-6.png' },
    { name: 'Sailfin', lenM: 15.5, st: { AIR: 3, CARGO: 3, BATT: 3, SPEED: 5, LAMP: 2 }, file: 'sub-7.png' },
    { name: 'Ghostlight', lenM: 16, st: { AIR: 4, CARGO: 3, BATT: 4, SPEED: 3, LAMP: 5 }, file: 'sub-8.png' },
    { name: 'Poseidon', lenM: 16.5, st: { AIR: 5, CARGO: 5, BATT: 5, SPEED: 4, LAMP: 4 }, file: 'sub-9.png' },
  ];
  const AIR_MAX = [110, 150, 205, 275, 365], CARGO_MAX = [120, 160, 210, 270, 340], BATT_MAX = [100, 140, 190, 250, 320];
  let curSub = 0, bank = 0;
  try {
    const s = JSON.parse(localStorage.getItem('zam.fathom.save') || 'null');
    if (s) { curSub = Math.max(0, Math.min(8, s.cur | 0)); bank = Math.max(0, s.m | 0); }
  } catch (_) {}
  const FS = FLEET_STATS[curSub];
  const airMax = () => AIR_MAX[FS.st.AIR - 1];
  const cargoMax = () => CARGO_MAX[FS.st.CARGO - 1];
  const battMax = () => BATT_MAX[FS.st.BATT - 1];
  const thrustMul = 0.85 + FS.st.SPEED * 0.13;
  const lampR = 13 + FS.st.LAMP * 4.5; // metres of sight inside the rock — tight,
                                       // so remembering the way back is the game
  function saveBank() {
    try {
      const s = JSON.parse(localStorage.getItem('zam.fathom.save') || 'null') || { owned: [0], cur: curSub };
      s.m = bank;
      localStorage.setItem('zam.fathom.save', JSON.stringify(s));
    } catch (_) {}
  }

  const sub = { x: W_M / 2, y: 2, vx: 0, vy: 0, ballast: K.RESERVE, facing: 1,
                cargo: [], cargoKg: 0, air: airMax(), batt: battMax(),
                gasBoost: 0, _flood: 0, _blow: 0, _thrust: 0, _dig: 0 };
  const net = () => K.RESERVE - sub.ballast - sub.cargoKg;

  // ---------- SPRITES ----------
  const IMG = {};
  for (const key of ['nodule', 'sulphide', 'crystal']) {
    IMG[key] = [];
    for (let i = 1; i <= 4; i++) {
      const im = new Image(); im.onload = () => { im._ok = true; };
      im.src = './assets/' + key + '-' + i + '.png?v=1';
      IMG[key].push(im);
    }
  }
  const subImg = new Image(); subImg.onload = () => { subImg._ok = true; };
  subImg.src = './assets/' + FS.file + '?v=1';

  // ---------- INPUT ----------
  const keys = {};
  const held = { up: null, down: null, L: null, R: null };
  let wantDrop = false;
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
    if (sfx) sfx.ensureAudio();
    keys[k] = true;
    if (k === 'j') wantDrop = true;
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  const hitPills = [];
  function ptXY(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (LW / rect.width), y: (e.clientY - rect.top) * (LH / rect.height) };
  }
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (sfx) sfx.ensureAudio();
    const p = ptXY(e);
    for (const pl of hitPills) {
      if (p.x >= pl.box.x && p.x <= pl.box.x + pl.box.w && p.y >= pl.box.y && p.y <= pl.box.y + pl.box.h) {
        if (pl.id === 'drop') wantDrop = true;
        if (pl.id === 'sound' && sfx) { sfx.setOn(!sfx.isOn()); sfx.play('click'); }
        return;
      }
    }
    if (MODE === 'mobile') {
      if (Math.abs(p.x - L.upBtn.cx) < 34 && Math.abs(p.y - L.upBtn.cy) < 32) { held.up = e.pointerId; return; }
      if (Math.abs(p.x - L.dnBtn.cx) < 34 && Math.abs(p.y - L.dnBtn.cy) < 32) { held.down = e.pointerId; return; }
      if (p.y > L.top && p.y < LH - 96) { if (p.x < LW / 2) held.L = e.pointerId; else held.R = e.pointerId; }
    }
  });
  function endPt(e) {
    for (const k of ['up', 'down', 'L', 'R']) if (held[k] === e.pointerId) held[k] = null;
  }
  canvas.addEventListener('pointerup', endPt);
  canvas.addEventListener('pointercancel', endPt);

  // ---------- LAYOUT / CAMERA ----------
  const L = {};
  const SIDE_PAD = 30;
  function layout() {
    L.top = MODE === 'mobile' ? 64 : 56;
    L.ocean = { x: 0, y: L.top, w: LW, h: LH - L.top };
    L.ppm = (MODE === 'mobile' ? LW : FRAME_W) / 55;
    L.viewWm = L.ocean.w / L.ppm; L.viewHm = L.ocean.h / L.ppm;
    L.upBtn = { cx: LW - SIDE_PAD - 22, cy: LH - 210 };
    L.dnBtn = { cx: LW - SIDE_PAD - 22, cy: LH - 150 };
  }
  const cam = { x: 0, y: -20 };
  const sx = (wx) => L.ocean.x + (wx - cam.x) * L.ppm;
  const sy = (wy) => L.ocean.y + (wy - cam.y) * L.ppm;

  // ---------- SIM ----------
  const floats = [];
  let toast = null;                     // { text, life }
  let digTarget = null;                 // { c, r }
  let shake = 0;

  function step(dt) {
    const down = !!(keys['s'] || keys['arrowdown'] || held.down != null);
    const up = !down && !!(keys['w'] || keys['arrowup'] || held.up != null);
    const ax = (keys['a'] || keys['arrowleft'] || held.L != null ? -1 : 0) +
               (keys['d'] || keys['arrowright'] || held.R != null ? 1 : 0);
    // ballast: the law, verbatim from the main game
    if (down) { sub.ballast = Math.min(K.ballastMax, sub.ballast + K.floodRate * dt); sub._flood = 2; }
    else if (up) {
      let blow = Math.min(K.blowRate * dt, sub.ballast, Math.max(0, sub.air) / K.airPerKg);
      if (blow > 0) { sub.ballast -= blow; sub.air -= blow * K.airPerKg; sub._blow = 2; }
    } else {
      const target = Math.max(0, Math.min(K.ballastMax, K.RESERVE - sub.cargoKg));
      const d = Math.max(-K.trimRate * dt, Math.min(K.trimRate * dt, target - sub.ballast));
      sub.ballast += d;
    }
    if (sub._flood > 0) sub._flood--;
    if (sub._blow > 0) sub._blow--;
    // air
    const surfaced = sub.y <= K.surfaceY;
    if (surfaced) {
      sub.air = Math.min(airMax(), sub.air + K.regen * dt);
      sub.batt = Math.min(battMax(), sub.batt + K.regen * dt);
      if (sub.cargo.length) {           // bank
        let val = 0;
        for (const c of sub.cargo) val += c.val;
        bank += val;
        floats.push({ text: '+ $ ' + val + ' banked', x: sub.x, y: sub.y + 6, life: 2.2, color: C_GREEN });
        sub.cargo = []; sub.cargoKg = 0;
        saveBank();
        if (sfx) sfx.play('success');
      }
    } else {
      sub.air -= K.lifeSupport * dt;
      if (sub.air <= 0) {               // blackout-lite
        toast = { text: 'BLACKOUT — the haul is lost. The bank is safe.', life: 4 };
        sub.x = W_M / 2; sub.y = 2; sub.vx = 0; sub.vy = 0;
        sub.cargo = []; sub.cargoKg = 0; sub.ballast = K.RESERVE;
        sub.air = airMax(); sub.batt = battMax();
        if (sfx) { sfx.tone(220, 0.5, 0.04, 'sine'); }
        return;
      }
    }
    // vertical: buoyancy only — the whole point
    let vyT = Math.max(-K.vMax, Math.min(K.vMax, -net() * K.buoyK));
    sub.vy += (vyT - sub.vy) * Math.min(1, 14 * dt);
    if (sub.gasBoost > 0) { sub.vy = -46; sub.gasBoost -= dt; }
    // horizontal
    if (ax !== 0 && sub.batt > 0) {
      sub.vx += ax * K.thrust * thrustMul * dt;
      sub.batt = Math.max(0, sub.batt - K.thrustBatt * dt);
      sub.facing = ax > 0 ? 1 : -1;
      sub._thrust = 2;
    }
    if (sub._thrust > 0) sub._thrust--;
    sub.vx -= sub.vx * Math.min(1, K.drag * dt);
    sub.vx = Math.max(-K.hMax * thrustMul, Math.min(K.hMax * thrustMul, sub.vx));
    // integrate + collide per axis
    const r = K.subR;
    sub.x += sub.vx * dt;
    if (solidAt(sub.x + r, sub.y) ) { sub.x = Math.floor((sub.x + r) / TILE) * TILE - r - 0.01; if (sub.vx > 0) sub.vx = 0; }
    if (solidAt(sub.x - r, sub.y)) { sub.x = Math.ceil((sub.x - r) / TILE) * TILE + r + 0.01; if (sub.vx < 0) sub.vx = 0; }
    let onFloor = false, onCeil = false;
    sub.y += sub.vy * dt;
    if (solidAt(sub.x, sub.y + r)) { sub.y = Math.floor((sub.y + r) / TILE) * TILE - r - 0.01; if (sub.vy > 0) sub.vy = 0; onFloor = true; }
    if (solidAt(sub.x, sub.y - r)) { sub.y = Math.ceil((sub.y - r) / TILE) * TILE + r + 0.01; if (sub.vy < 0) sub.vy = 0; onCeil = true; }
    sub.x = Math.max(r, Math.min(W_M - r, sub.x));
    if (sub.y < 0.6) { sub.y = 0.6; if (sub.vy < 0) sub.vy = 0; }

    // ---------- DIGGING ----------
    /* Hold a direction into a solid tile and the drill eats it. Digging up
       needs you floating against the ceiling — which needs lift — which is
       the law doing its own gatekeeping. */
    digTarget = null;
    let dc = 0, dr = 0;
    if (down && onFloor) { dc = Math.floor(sub.x / TILE); dr = Math.floor((sub.y + r + 0.5) / TILE); }
    else if (up && onCeil) { dc = Math.floor(sub.x / TILE); dr = Math.floor((sub.y - r - 0.5) / TILE); }
    else if (ax > 0 && solidAt(sub.x + r + 0.6, sub.y)) { dc = Math.floor((sub.x + r + 0.6) / TILE); dr = Math.floor(sub.y / TILE); }
    else if (ax < 0 && solidAt(sub.x - r - 0.6, sub.y)) { dc = Math.floor((sub.x - r - 0.6) / TILE); dr = Math.floor(sub.y / TILE); }
    else { dc = -1; }
    if (dc >= 0) {
      const t = tileAt(dc, dr);
      if (t !== T_WATER && t !== T_BED && sub.batt > 0) {
        digTarget = { c: dc, r: dr };
        const key = dr * COLS + dc;
        const need = HARDNESS[t] || 1;
        const p = (dug.get(key) || 0) + dt * (0.9 + thrustMul * 0.4);
        sub.batt = Math.max(0, sub.batt - K.digBatt * dt);
        sub._dig = 2;
        if (p >= need) {
          dug.delete(key);
          grid[key] = T_WATER;
          if (ORE[t]) {
            const ore = ORE[t];
            if (sub.cargoKg + ore.kg <= cargoMax()) {
              sub.cargo.push({ ...ore });
              sub.cargoKg += ore.kg;
              floats.push({ text: '+' + ore.kg + ' kg · $' + ore.val, x: dc * TILE + TILE / 2, y: dr * TILE, life: 1.5, color: INK92 });
              if (sfx) sfx.tone(480 + 58 * (ore.val / ore.kg), 0.1, 0.06, 'triangle');
            } else {
              floats.push({ text: 'HOLD FULL', x: dc * TILE + TILE / 2, y: dr * TILE, life: 1.4, color: C_ACCENT_TEXT });
              if (sfx) sfx.tone(170, 0.12, 0.03, 'sine');
            }
          } else if (t === T_GAS) {
            sub.gasBoost = 1.15;
            shake = 0.55;
            floats.push({ text: 'GAS POCKET', x: dc * TILE + TILE / 2, y: dr * TILE, life: 1.6, color: C_SUN });
            if (sfx) { sfx.noise(0.4, 300, 0.8, 0.12); }
          } else if (sfx) sfx.tone(150 + Math.random() * 40, 0.08, 0.045, 'sine');
        } else {
          dug.set(key, p);
          if (sfx && Math.random() < 0.12) sfx.tone(120 + Math.random() * 60, 0.05, 0.03, 'square');
        }
      }
    }
    if (sub._dig > 0) sub._dig--;
    if (wantDrop) {
      wantDrop = false;
      if (sub.cargo.length) {
        let pick = 0;
        for (let i = 1; i < sub.cargo.length; i++) if (sub.cargo[i].kg >= sub.cargo[pick].kg) pick = i;
        const item = sub.cargo.splice(pick, 1)[0];
        sub.cargoKg -= item.kg;
        floats.push({ text: '-' + item.kg + ' kg', x: sub.x, y: sub.y - 8, life: 1.3, color: C_ACCENT_TEXT });
        if (sfx) sfx.play('drop');
      }
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      floats[i].y -= 5 * dt; floats[i].life -= dt;
      if (floats[i].life <= 0) floats.splice(i, 1);
    }
    if (toast) { toast.life -= dt; if (toast.life <= 0) toast = null; }
    if (shake > 0) shake -= dt;
    // camera
    const tx = sub.x - L.viewWm / 2, ty = sub.y - L.viewHm * 0.44;
    const a = 1 - Math.exp(-4 * dt);
    cam.x += (Math.max(-8, Math.min(W_M + 8 - L.viewWm, tx)) - cam.x) * a;
    cam.y += (Math.max(-24, Math.min(ROWS * TILE - L.viewHm + 8, ty)) - cam.y) * a;
  }

  // ---------- RENDER ----------
  const WATER_STOPS = [[0, 26, 94, 134], [120, 15, 61, 95], [300, 8, 42, 68], [560, 2, 10, 18], [9999, 2, 10, 18]];
  function waterColorAt(d) {
    for (let i = 1; i < WATER_STOPS.length; i++) {
      if (d <= WATER_STOPS[i][0]) {
        const A = WATER_STOPS[i - 1], B = WATER_STOPS[i];
        const t = Math.max(0, (d - A[0]) / (B[0] - A[0]));
        return 'rgb(' + [1, 2, 3].map(j => Math.round(A[j] + (B[j] - A[j]) * t)).join(',') + ')';
      }
    }
    return '#02080F';
  }
  const hsh = (a, b) => {
    let h = Math.imul(a, 374761393) + Math.imul(b, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  let fogCan = null, fogCtx = null;

  function render(now) {
    const t = now / 1000;
    ctx.clearRect(0, 0, LW, LH);
    const o = L.ocean, ppm = L.ppm;
    // water
    const g = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
    g.addColorStop(0, waterColorAt(Math.max(0, cam.y)));
    g.addColorStop(1, waterColorAt(cam.y + L.viewHm));
    ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
    const shx = shake > 0 ? (Math.random() - 0.5) * 6 * shake : 0;
    const shy = shake > 0 ? (Math.random() - 0.5) * 6 * shake : 0;
    ctx.save();
    ctx.translate(shx, shy);
    ctx.beginPath(); ctx.rect(o.x, o.y, o.w, o.h); ctx.clip();
    // sky + waterline
    if (cam.y < 0) {
      const sg = ctx.createLinearGradient(0, o.y, 0, sy(0));
      sg.addColorStop(0, '#BFE3EC'); sg.addColorStop(1, '#7FB9CD');
      ctx.fillStyle = sg; ctx.fillRect(o.x, o.y, o.w, sy(0) - o.y);
      ctx.strokeStyle = TINT(0.55); ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let px = 0; px <= o.w; px += 8) {
        const yy = sy(0) + Math.sin(px * 0.06 + t * 1.8) * 2.2;
        px === 0 ? ctx.moveTo(o.x + px, yy) : ctx.lineTo(o.x + px, yy);
      }
      ctx.stroke();
    }
    // sun shafts in the open sea
    if (cam.y < 80) {
      for (let i = 0; i < 4; i++) {
        const wx0 = 20 + i * 70 + Math.sin(t * 0.1 + i * 2) * 10;
        const sg2 = ctx.createLinearGradient(0, sy(0), 0, sy(70));
        sg2.addColorStop(0, 'rgba(170,220,235,0.10)'); sg2.addColorStop(1, 'rgba(170,220,235,0)');
        ctx.fillStyle = sg2;
        ctx.beginPath();
        ctx.moveTo(sx(wx0), sy(0)); ctx.lineTo(sx(wx0 + 20), sy(0));
        ctx.lineTo(sx(wx0 + 42), sy(70)); ctx.lineTo(sx(wx0 + 22), sy(70));
        ctx.closePath(); ctx.fill();
      }
    }
    // ---------- TILES ----------
    const c0 = Math.max(0, Math.floor(cam.x / TILE) - 1), c1 = Math.min(COLS - 1, Math.ceil((cam.x + L.viewWm) / TILE) + 1);
    const r0 = Math.max(0, Math.floor(cam.y / TILE) - 1), r1 = Math.min(ROWS - 1, Math.ceil((cam.y + L.viewHm) / TILE) + 1);
    for (let rr = r0; rr <= r1; rr++) {
      for (let cc = c0; cc <= c1; cc++) {
        const ty = tileAt(cc, rr);
        if (ty === T_WATER) continue;
        const px = sx(cc * TILE), py = sy(rr * TILE);
        const s = TILE * ppm;
        const h1 = hsh(cc, rr);
        // clay tile body: rounded, slightly irregular
        let top = '#274A43', bot = '#12262A';                    // silt sage
        if (ty === T_ROCK) { top = '#22394A'; bot = '#0E1D28'; }
        if (ty === T_BED) { top = '#131E2C'; bot = '#0A121D'; }
        if (ty === T_GAS) { top = '#2C4A3E'; bot = '#14262A'; }
        if (ORE[ty]) { top = '#274A43'; bot = '#12262A'; }
        const gg = ctx.createLinearGradient(0, py, 0, py + s);
        gg.addColorStop(0, top); gg.addColorStop(1, bot);
        ctx.fillStyle = gg;
        const rad = s * (0.16 + h1 * 0.1);
        ctx.beginPath();
        UI.roundRectPath(ctx, px + 0.5, py + 0.5, s - 0.5, s - 0.5, rad);
        ctx.fill();
        // lit top edge if water above
        if (tileAt(cc, rr - 1) === T_WATER) {
          ctx.strokeStyle = 'rgba(160,215,185,0.4)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(px + rad * 0.7, py + 1.5); ctx.lineTo(px + s - rad * 0.7, py + 1.5); ctx.stroke();
        }
        // crumb speckles
        if (h1 > 0.35) {
          ctx.fillStyle = h1 > 0.7 ? 'rgba(215,240,225,0.06)' : 'rgba(0,0,0,0.18)';
          ctx.beginPath();
          ctx.arc(px + s * (0.25 + hsh(cc + 3, rr) * 0.5), py + s * (0.3 + hsh(cc, rr + 5) * 0.4), s * 0.06, 0, Math.PI * 2);
          ctx.fill();
        }
        // ore sprite on its tile
        if (ORE[ty]) {
          const im = IMG[ORE[ty].key][(cc * 3 + rr) % 4];
          if (im && im._ok) {
            const oh = s * 0.62, ow = oh * (im.width / im.height);
            ctx.drawImage(im, px + (s - ow) / 2, py + s - oh - s * 0.08, ow, oh);
          }
        }
        // gas tell: seeping bubbles
        if (ty === T_GAS) {
          ctx.fillStyle = 'rgba(200,240,250,' + (0.25 + 0.2 * Math.sin(t * 3 + cc)) + ')';
          for (let b = 0; b < 2; b++) {
            const bx = px + s * (0.3 + b * 0.4);
            const by = py - ((t * 7 + b * 4 + cc * 2) % 10) * ppm * 0.4;
            ctx.beginPath(); ctx.arc(bx, by, 1.6, 0, Math.PI * 2); ctx.fill();
          }
        }
        // dig cracks
        const p = dug.get(rr * COLS + cc);
        if (p) {
          const frac = p / (HARDNESS[ty] || 1);
          ctx.strokeStyle = 'rgba(10,16,28,' + (0.4 + frac * 0.4) + ')';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px + s * 0.5, py + s * 0.2);
          ctx.lineTo(px + s * (0.3 + frac * 0.2), py + s * 0.55);
          ctx.lineTo(px + s * 0.6, py + s * 0.5);
          ctx.lineTo(px + s * (0.45), py + s * 0.85);
          ctx.stroke();
        }
      }
    }
    // dig target highlight
    if (digTarget) {
      ctx.strokeStyle = TINT(0.7); ctx.lineWidth = 2;
      ctx.beginPath();
      UI.roundRectPath(ctx, sx(digTarget.c * TILE) + 1, sy(digTarget.r * TILE) + 1, TILE * ppm - 2, TILE * ppm - 2, 5);
      ctx.stroke();
    }
    // ---------- SUB ----------
    const px = sx(sub.x), py = sy(sub.y);
    const Wp = FS.lenM * ppm;
    const aspect = subImg._ok ? subImg.height / subImg.width : 0.5;
    const Hp = Wp * aspect;
    const tilt = Math.max(-0.16, Math.min(0.16, sub.vy * 0.006));
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(sub.facing, 1);
    ctx.rotate(tilt);
    // lamp glow (radial in the dark; cone up top)
    const lg = ctx.createRadialGradient(Wp * 0.4, 0, 0, Wp * 0.4, 0, lampR * ppm * 0.5);
    lg.addColorStop(0, 'rgba(220,245,255,0.20)'); lg.addColorStop(1, 'rgba(220,245,255,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(Wp * 0.4, 0, lampR * ppm * 0.5, 0, Math.PI * 2); ctx.fill();
    if (subImg._ok) ctx.drawImage(subImg, -Wp / 2, -Hp / 2, Wp, Hp);
    else { ctx.fillStyle = '#F0C255'; ctx.beginPath(); ctx.ellipse(0, 0, Wp * 0.45, Hp * 0.4, 0, 0, Math.PI * 2); ctx.fill(); }
    // drill sparks while digging
    if (sub._dig) {
      ctx.fillStyle = 'rgba(255,220,140,' + (0.5 + Math.random() * 0.3) + ')';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(Wp * 0.48 + Math.random() * 6, (Math.random() - 0.5) * Hp * 0.5, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    // ---------- FOG OF THE DEEP ----------
    /* Below the seabed you see your lamp's worth and nothing else — the
       memory of the way back is the game. */
    if (sub.y > SEA_ROWS * TILE - 20 || cam.y + L.viewHm > SEA_ROWS * TILE) {
      if (!fogCan || fogCan.width !== canvas.width) {
        fogCan = document.createElement('canvas');
        fogCan.width = canvas.width; fogCan.height = canvas.height;
        fogCtx = fogCan.getContext('2d');
      }
      const dpr = canvas.width / LW;
      fogCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fogCtx.clearRect(0, 0, LW, LH);
      const fogTop = sy(SEA_ROWS * TILE);
      fogCtx.fillStyle = 'rgba(2,7,12,0.88)';
      fogCtx.fillRect(0, Math.max(o.y, fogTop), LW, LH);
      // soften the fog's start
      const fgrad = fogCtx.createLinearGradient(0, fogTop - 30, 0, fogTop + 40);
      fgrad.addColorStop(0, 'rgba(2,7,12,0)'); fgrad.addColorStop(1, 'rgba(2,7,12,0.88)');
      fogCtx.fillStyle = fgrad;
      fogCtx.fillRect(0, fogTop - 30, LW, 70);
      fogCtx.globalCompositeOperation = 'destination-out';
      const lamp = fogCtx.createRadialGradient(px, py, 0, px, py, lampR * ppm);
      lamp.addColorStop(0, 'rgba(0,0,0,1)');
      lamp.addColorStop(0.55, 'rgba(0,0,0,0.85)');
      lamp.addColorStop(1, 'rgba(0,0,0,0)');
      fogCtx.fillStyle = lamp;
      fogCtx.beginPath(); fogCtx.arc(px, py, lampR * ppm, 0, Math.PI * 2); fogCtx.fill();
      fogCtx.globalCompositeOperation = 'source-over';
      ctx.drawImage(fogCan, 0, 0, LW, LH);
    }
    // floats
    ctx.font = '700 13px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of floats) {
      ctx.globalAlpha = Math.min(1, f.life);
      const tw = ctx.measureText(f.text).width;
      ctx.fillStyle = SCRIM(0.6);
      ctx.beginPath(); UI.roundRectPath(ctx, sx(f.x) - tw / 2 - 7, sy(f.y) - 11, tw + 14, 22, 11); ctx.fill();
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sx(f.x), sy(f.y));
    }
    ctx.globalAlpha = 1;
    ctx.restore();   // shake

    // ---------- CHROME ----------
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = C_BG; ctx.fillRect(0, 0, LW, L.top);
    ctx.textBaseline = 'middle';
    ctx.font = '800 16px Inter, sans-serif'; ctx.fillStyle = '#FFFFFF';
    ctx.fillText('DIG PROTOTYPE', SIDE_PAD, L.top / 2 - 9);
    ctx.font = '600 12px Inter, sans-serif'; ctx.fillStyle = INK72;
    ctx.fillText(FS.name + ' · hold into rock to dig · only light things rise', SIDE_PAD, L.top / 2 + 10);
    ctx.textAlign = 'right';
    ctx.font = '600 15px Inter, sans-serif'; ctx.fillStyle = INK90;
    ctx.fillText('DEPTH ' + Math.round(sub.y) + ' m   ·   $ ' + bank, LW - SIDE_PAD, L.top / 2);
    ctx.textAlign = 'left';
    // bars
    hitPills.length = 0;
    const bars = [
      ['AIR', sub.air / airMax(), sub.air / airMax() < 0.25 ? C_ACCENT_TEXT : C_GREEN, Math.round(sub.air)],
      ['BATT', sub.batt / battMax(), C_SUN, Math.round(sub.batt)],
      ['CARGO', sub.cargoKg / cargoMax(), C_ACCENT_TEXT, Math.round(sub.cargoKg) + '/' + cargoMax()],
    ];
    ctx.fillStyle = SCRIM(0.55);
    ctx.beginPath(); UI.roundRectPath(ctx, 14, L.top + 12, 212, 3 * 24 + 10, 12); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const ry = L.top + 12 + 16 + i * 24;
      ctx.font = '700 10px Inter, sans-serif'; ctx.fillStyle = INK72;
      ctx.fillText(bars[i][0], 26, ry);
      ctx.fillStyle = TINT(0.10);
      ctx.beginPath(); UI.roundRectPath(ctx, 70, ry - 3.5, 92, 7, 3.5); ctx.fill();
      ctx.fillStyle = bars[i][2];
      ctx.beginPath(); UI.roundRectPath(ctx, 70, ry - 3.5, Math.max(7, 92 * Math.min(1, bars[i][1])), 7, 3.5); ctx.fill();
      ctx.font = '600 11px Inter, sans-serif'; ctx.fillStyle = INK90;
      ctx.textAlign = 'right'; ctx.fillText(String(bars[i][3]), 214, ry); ctx.textAlign = 'left';
    }
    // pills
    const cy2 = LH - 34;
    const sb = UI.drawPill(ctx, '', SIDE_PAD + 22, cy2, { w: UI.PILL.iconW });
    ctx.strokeStyle = INK92; ctx.fillStyle = INK92; ctx.lineWidth = 1.8;
    const on = sfx ? sfx.isOn() : true;
    ctx.beginPath();
    ctx.moveTo(SIDE_PAD + 14, cy2 - 3); ctx.lineTo(SIDE_PAD + 18, cy2 - 3); ctx.lineTo(SIDE_PAD + 23, cy2 - 7);
    ctx.lineTo(SIDE_PAD + 23, cy2 + 7); ctx.lineTo(SIDE_PAD + 18, cy2 + 3); ctx.lineTo(SIDE_PAD + 14, cy2 + 3);
    ctx.closePath(); ctx.fill();
    if (!on) {
      ctx.beginPath();
      ctx.moveTo(SIDE_PAD + 26, cy2 - 4); ctx.lineTo(SIDE_PAD + 32, cy2 + 4);
      ctx.moveTo(SIDE_PAD + 32, cy2 - 4); ctx.lineTo(SIDE_PAD + 26, cy2 + 4);
      ctx.stroke();
    }
    hitPills.push({ id: 'sound', box: sb });
    ctx.font = '700 15px Inter, sans-serif';
    const dw = Math.round(ctx.measureText('DROP CARGO').width + UI.PILL.padX + 10);
    const db = UI.drawPill(ctx, '', LW / 2, cy2, { w: dw });
    ctx.fillStyle = sub.cargo.length ? INK92 : UI.PILL.textDim;
    ctx.textAlign = 'center';
    ctx.fillText('DROP CARGO', LW / 2 + 6, cy2 + 1);
    ctx.strokeStyle = sub.cargo.length ? C_ACCENT_TEXT : UI.PILL.textDim; ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(LW / 2 - dw / 2 + 18, cy2 - 7); ctx.lineTo(LW / 2 - dw / 2 + 18, cy2 + 6);
    ctx.moveTo(LW / 2 - dw / 2 + 13, cy2 + 1); ctx.lineTo(LW / 2 - dw / 2 + 18, cy2 + 7); ctx.lineTo(LW / 2 - dw / 2 + 23, cy2 + 1);
    ctx.stroke();
    ctx.textAlign = 'left';
    hitPills.push({ id: 'drop', box: db });
    // mobile up/down buttons
    if (MODE === 'mobile') {
      for (const [b, lab, isUp] of [[L.upBtn, 'UP', true], [L.dnBtn, 'DOWN', false]]) {
        ctx.fillStyle = UI.PILL.fill;
        ctx.beginPath(); UI.roundRectPath(ctx, b.cx - 22, b.cy - 20, 44, 40, 20); ctx.fill();
        ctx.strokeStyle = UI.PILL.border; ctx.lineWidth = UI.PILL.borderW;
        ctx.beginPath(); UI.roundRectPath(ctx, b.cx - 22, b.cy - 20, 44, 40, 20); ctx.stroke();
        ctx.strokeStyle = INK92; ctx.lineWidth = 2.4;
        ctx.beginPath();
        if (isUp) { ctx.moveTo(b.cx, b.cy + 6); ctx.lineTo(b.cx, b.cy - 6); ctx.moveTo(b.cx - 6, b.cy); ctx.lineTo(b.cx, b.cy - 7); ctx.lineTo(b.cx + 6, b.cy); }
        else { ctx.moveTo(b.cx, b.cy - 6); ctx.lineTo(b.cx, b.cy + 6); ctx.moveTo(b.cx - 6, b.cy); ctx.lineTo(b.cx, b.cy + 7); ctx.lineTo(b.cx + 6, b.cy); }
        ctx.stroke();
        ctx.font = '700 9px Inter, sans-serif'; ctx.fillStyle = INK72;
        ctx.textAlign = 'center'; ctx.fillText(lab, b.cx, b.cy + 24); ctx.textAlign = 'left';
      }
    }
    // AIR LOW
    if (sub.air < airMax() * 0.33 && sub.y > K.surfaceY) {
      const pulse = 0.55 + 0.45 * Math.sin(now / 220);
      ctx.font = '800 15px Inter, sans-serif';
      ctx.fillStyle = SCRIM(0.8);
      ctx.beginPath(); UI.roundRectPath(ctx, 14, L.top + 100, 92, 32, 16); ctx.fill();
      ctx.globalAlpha = 0.55 + pulse * 0.45;
      ctx.fillStyle = C_ACCENT_TEXT;
      ctx.textBaseline = 'middle';
      ctx.fillText('AIR LOW', 27, L.top + 117);
      ctx.globalAlpha = 1;
    }
    // toast
    if (toast) {
      ctx.font = '700 14px Inter, sans-serif';
      const tw = ctx.measureText(toast.text).width;
      ctx.fillStyle = SCRIM(0.85);
      ctx.beginPath(); UI.roundRectPath(ctx, LW / 2 - tw / 2 - 16, L.top + 24, tw + 32, 38, 19); ctx.fill();
      ctx.fillStyle = INK92; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(toast.text, LW / 2, L.top + 43);
      ctx.textAlign = 'left';
    }
    ctx.textBaseline = 'top';
  }

  // ---------- LOOP + HARNESS ----------
  let lastNow = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    step(dt);
    render(now);
    requestAnimationFrame(tick);
  }
  if (qs.get('harness') === '1') {
    window.DIG = {
      sub, get grid() { return grid; }, get bank() { return bank; }, tileAt, TILE, COLS, ROWS, SEA_ROWS,
      cam, keys,
      drive: (seconds, ks) => {
        for (const k of Object.keys(keys)) keys[k] = false;
        for (const k of (ks || [])) keys[k] = true;
        const n = Math.round(seconds * 60);
        for (let i = 0; i < n; i++) step(1 / 60);
        for (const k of (ks || [])) keys[k] = false;
        render(performance.now());
      },
      render: () => render(performance.now()),
    };
  }

  genWorld();
  setCanvasVars(); resizeCanvas(); layout();
  cam.x = sub.x - 30; cam.y = -20;
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.visualViewport?.addEventListener('resize', onResize);
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  requestAnimationFrame(tick);
})();
