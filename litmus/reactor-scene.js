/* ============================================================
   Litmus in 3D · chapter 2, the Reactor: the scene

   As the studies the owner approved (2026-10-03), now played: whole
   molecules float all round you in the ember space and revolve slowly; the
   reaction sphere sits in front of you, open-edged, its back frosted so what
   passes behind it blurs; four agent orbs float along the bottom, two
   chances above them. Tap a molecule and it glides into the sphere; tap one
   in the sphere and it floats back out. What reacts as it meets goes at
   once; otherwise tap an agent: right, it drops in and the reaction runs
   (the molecules circle, come apart into dust of their own colour, the dust
   swirls as a cloud round the agent, and the atoms form again as the
   products); wrong, it bounces and spends a chance. A product a goal wants
   flies up to its orb; the rest wait above the sphere on an arc of light:
   tap one to put it back in, drag it away to keep it.

   reactor-chem.js decides everything. play.js hands this file its world,
   camera, look, goal orbs, menu and cards through `host`, as
   /chemistry/'s play.js does for lab-scene.js.
   ============================================================ */
(function () {
'use strict';

window.ReactorScene = function (host) {
  const T3 = host.THREE;
  const { Vector3, Quaternion, Euler, Color, Group, Mesh, Sprite, SpriteMaterial, CanvasTexture, SRGBColorSpace,
    SphereGeometry, CylinderGeometry, BoxGeometry, RoundedBoxGeometry, PlaneGeometry, MeshPhysicalMaterial, MeshBasicMaterial,
    BufferGeometry, Float32BufferAttribute, Points, PointsMaterial, AdditiveBlending, BackSide, DoubleSide, PMREMGenerator, Scene } = T3;
  const { scene, cam, renderer, U, ART, rOf, ballMat, stickMat, letterMat, letterBase, cached, DOT, MODE, REDUCED, Y_UP } = host;
  const X = window.ReactorChem;
  const V = (x, y, z) => new Vector3(x, y, z);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
  const span = (t, a, b) => clamp01((t - a) / (b - a));
  const sec = () => host.clock() / 1000;
  function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const mixHex = (a, b, k) => '#' + new Color(a).lerp(new Color(b), k).getHexString();

  /* ---------- WHERE THINGS SIT ----------
     The sphere, the agents and whatever waits ride with you: they are in your
     view's own frame (`rig`, which follows the camera), placed from points on
     the screen. */
  const rig = new Group(); scene.add(rig);
  const D = 11.2;                                       // the sphere's distance from you
  const DA = 8.5;                                       // the agents' distance
  function local(x, y, d) {
    const { LW, LH } = host.frame(), hh = d * Math.tan(cam.fov * Math.PI / 360), hw = hh * LW / LH;
    return V((x / LW * 2 - 1) * hw, (1 - y / LH * 2) * hh, -d);
  }
  const pxAt = (px, d) => { const { LH } = host.frame(); return px / LH * 2 * d * Math.tan(cam.fov * Math.PI / 360); };
  let SPH = V(0, -2.4, -D), SR = 2.15, AG = [], BAND = null;   // BAND: where the dark fade under the space starts, and where it is full (above the chances)
  function layout() {
    const { LW, LH } = host.frame(), mob = MODE === 'mobile';
    const ay = LH - (mob ? 104 : 86), sp = Math.min((LW - 16) / 4, mob ? 92 : 128);
    AG = [0, 1, 2, 3].map((i) => ({ x: LW / 2 + (i - 1.5) * sp, y: ay, r: mob ? 30 : 32 }));
    /* the sphere a little below the middle, but always in the room between the goals' names and the chances above the
       agents: in a short window (a portal's 800x450, a small phone) it shrinks and rises rather than sit on the chances */
    const top = host.goalsBottom(S ? S.targets : []) + 14, bottom = ay - AG[0].r - 22 - 8 - 14;
    let rpx = mob ? Math.min(LW * 0.31, LH * 0.155) : LH * 0.17;
    rpx = Math.max(24, Math.min(rpx, (bottom - top) / 2));
    const sy = Math.max(top + rpx, Math.min(mob ? LH * 0.6 : LH * 0.52, bottom - rpx));
    SPH = local(LW / 2, sy, D); SR = pxAt(rpx, D);
    BAND = { top: sy + rpx, full: ay - AG[0].r - 32 };
    if (glass) placeGlass();
    agents.forEach((a, i) => placeAgent(a, i));
  }

  /* ---------- PICTURES ON CANVAS (as the studies paint them) ---------- */
  function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t; }
  const RING = tex(256, 256, (g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.82, 'rgba(255,255,255,0)'); r.addColorStop(0.93, 'rgba(255,255,255,0.8)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });
  const sprite = (map, color, size, opacity, additive = true) => { const s = new Sprite(new SpriteMaterial({ map, color, transparent: true, opacity, blending: additive ? AdditiveBlending : 1, depthWrite: false, toneMapped: false })); s.scale.set(size, size, 1); return s; };
  const glowS = (c, s, o) => sprite(DOT, c, s, o);
  function haze(g, c, r, stops) { const gr = g.createRadialGradient(c, c, 0, c, c, r); stops.forEach(([k, col]) => gr.addColorStop(k, col)); g.fillStyle = gr; g.fillRect(0, 0, c * 2, c * 2); }

  // the agents' own animations (Spark, Heat and Light as the studies; the metals' rays; Electricity new)
  function paintSpark(g, S, t) {
    const c = S / 2, R = S * 0.47;
    g.clearRect(0, 0, S, S); g.globalCompositeOperation = 'lighter';
    haze(g, c, R, [[0, 'rgba(90,150,255,0.55)'], [0.35, 'rgba(40,90,230,0.28)'], [1, 'rgba(20,40,160,0)']]);
    for (let i = 0; i < 10; i++) {
      const a = i * 2.39996 + t * 0.15, l = R * (0.55 + 0.4 * ((i * 0.618) % 1));
      g.strokeStyle = 'rgba(150,210,255,0.22)'; g.lineWidth = S / 256; g.beginPath(); g.moveTo(c + Math.cos(a) * R * 0.08, c + Math.sin(a) * R * 0.08); g.lineTo(c + Math.cos(a) * l, c + Math.sin(a) * l); g.stroke();
    }
    const N = 20;
    for (let i = 0; i < N; i++) {
      const R2 = rnd(i * 7919 + Math.floor(t * 13 + i * 0.37) * 131);
      const pts = [[c, c]]; let a = i / N * Math.PI * 2 + (R2() - 0.5) * 0.4, x = c, y = c;
      const len = R * (0.55 + R2() * 0.42), n = 16;
      for (let k = 1; k <= n; k++) { a += (R2() - 0.5) * 0.75; x += Math.cos(a) * len / n; y += Math.sin(a) * len / n; pts.push([x, y]); }
      for (const [lw, col] of [[5, 'rgba(60,120,255,0.16)'], [2.2, 'rgba(90,190,255,0.45)'], [0.9, 'rgba(225,245,255,0.9)']]) {
        g.strokeStyle = col; g.lineWidth = lw * S / 256; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
      }
    }
    haze(g, c, R * 0.42, [[0, 'rgba(255,255,255,1)'], [0.22, 'rgba(220,240,255,0.9)'], [0.5, 'rgba(120,200,255,0.35)'], [1, 'rgba(60,120,255,0)']]);
    g.globalCompositeOperation = 'source-over';
  }
  function paintHeat(g, S, t) {
    const c = S / 2, R = S * 0.48;
    g.clearRect(0, 0, S, S); g.globalCompositeOperation = 'lighter';
    haze(g, c, R, [[0, 'rgba(255,170,70,0.75)'], [0.35, 'rgba(240,90,30,0.4)'], [0.7, 'rgba(180,40,20,0.12)'], [1, 'rgba(140,20,10,0)']]);
    const layer = (n, lo, hi, wid, alpha, seed) => {
      for (let i = 0; i < n; i++) {
        const a0 = i / n * Math.PI * 2 + seed + Math.sin(t * 0.7 + i * 1.3) * 0.15, lift = Math.max(0, -Math.sin(a0));
        const l = R * (lo + (hi - lo) * (0.5 + 0.5 * Math.sin(t * 3.3 + i * 2.1 + seed)) * (0.65 + 0.35 * lift));
        const curl = 0.5 * Math.cos(a0) * (0.6 + 0.4 * Math.sin(t * 2 + i));
        const tipA = a0 + (Math.cos(a0) > 0 ? -1 : 1) * Math.abs(curl) * (Math.sin(a0) > -0.3 ? 1 : 0.3) + Math.sin(t * 7 + i * 2.7) * 0.12;
        const w = R * wid * (0.8 + 0.3 * Math.sin(t * 5 + i)), tx = c + Math.cos(tipA) * l, ty = c + Math.sin(tipA) * l;
        const nx = -Math.sin(a0), ny = Math.cos(a0);
        const m1x = c + Math.cos(a0) * l * 0.35, m1y = c + Math.sin(a0) * l * 0.35, m2x = c + Math.cos((a0 + tipA) / 2) * l * 0.72, m2y = c + Math.sin((a0 + tipA) / 2) * l * 0.72;
        const wave = Math.sin(t * 9 + i * 3.1) * w * 0.35;
        const gr = g.createRadialGradient(c, c, 0, c, c, l);
        gr.addColorStop(0, `rgba(255,245,210,${alpha})`); gr.addColorStop(0.3, `rgba(255,190,80,${alpha * 0.85})`); gr.addColorStop(0.65, `rgba(250,100,35,${alpha * 0.6})`); gr.addColorStop(1, 'rgba(210,40,30,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(c + nx * w * 0.4, c + ny * w * 0.4);
        g.bezierCurveTo(m1x + nx * w * 1.4, m1y + ny * w * 1.4, m2x + nx * (w * 0.8 + wave), m2y + ny * (w * 0.8 + wave), tx, ty);
        g.bezierCurveTo(m2x - nx * (w * 0.8 - wave), m2y - ny * (w * 0.8 - wave), m1x - nx * w * 1.4, m1y - ny * w * 1.4, c - nx * w * 0.4, c - ny * w * 0.4);
        g.fill();
      }
    };
    layer(14, 0.5, 0.98, 0.16, 0.55, 0); layer(9, 0.28, 0.55, 0.13, 0.75, 0.29);
    for (let i = 0; i < 36; i++) {
      const ph = (t * (0.3 + (i % 7) * 0.05) + i * 0.137) % 1, x0 = c + Math.sin(i * 12.9898) * R * 0.55;
      const x = x0 + Math.sin(t * 2 + i) * R * 0.1, y = c + R * 0.25 - ph * R * 1.15, a = Math.sin(ph * Math.PI), sz = S / 150 * (1.3 - ph * 0.7);
      const gr = g.createRadialGradient(x, y, 0, x, y, sz * 2); gr.addColorStop(0, `rgba(255,${220 - ph * 140},${120 - ph * 90},${0.9 * a})`); gr.addColorStop(1, 'rgba(255,80,20,0)');
      g.fillStyle = gr; g.fillRect(x - sz * 2, y - sz * 2, sz * 4, sz * 4);
    }
    haze(g, c, R * 0.45, [[0, 'rgba(255,255,245,1)'], [0.25, 'rgba(255,235,170,0.9)'], [0.6, 'rgba(255,160,60,0.35)'], [1, 'rgba(255,90,40,0)']]);
    g.globalCompositeOperation = 'source-over';
  }
  function paintLight(g, S, t) {
    const c = S / 2, R = S * 0.47;
    g.clearRect(0, 0, S, S); g.globalCompositeOperation = 'lighter';
    haze(g, c, R, [[0, 'rgba(176,122,255,0.5)'], [0.45, 'rgba(110,90,255,0.18)'], [1, 'rgba(80,70,220,0)']]);
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * Math.PI * 2 + t * 0.08, l = R * (0.45 + 0.45 * Math.abs(Math.sin(i * 2.3 + t * 0.6)));
      const gr = g.createLinearGradient(c, c, c + Math.cos(a) * l, c + Math.sin(a) * l); gr.addColorStop(0, 'rgba(210,180,255,0.55)'); gr.addColorStop(1, 'rgba(150,110,255,0)');
      g.strokeStyle = gr; g.lineWidth = (i % 2 ? 1.2 : 2.6) * S / 256; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * l, c + Math.sin(a) * l); g.stroke();
    }
    haze(g, c, R * 0.4, [[0, 'rgba(250,240,255,1)'], [0.3, 'rgba(210,180,255,0.85)'], [1, 'rgba(140,100,255,0)']]);
    g.globalCompositeOperation = 'source-over';
  }
  // the Carbon Chamber's own two, from its study (iCloud 3D-IDEAS/concepts/sources/litmus_carbon_study.js)
  /* ACID (the catalyst for making an ester: a few drops of concentrated sulphuric acid): a glowing drop, falling in slow
     drips that ring outward, small bubbles rising. */
  function paintAcid(g, S, t) {
    const c = S / 2, R = S * 0.47;
    g.clearRect(0, 0, S, S); g.globalCompositeOperation = 'lighter';
    haze(g, c, R, [[0, 'rgba(200,240,90,0.42)'], [0.5, 'rgba(60,200,140,0.16)'], [1, 'rgba(40,160,120,0)']]);
    // a ripple ring where each drip lands
    const ph = (t * 0.45) % 1, ry = c + R * 0.42;
    g.strokeStyle = `rgba(214,242,90,${0.55 * (1 - ph)})`; g.lineWidth = S / 160; g.beginPath(); g.ellipse(c, ry, R * 0.12 + R * 0.45 * ph, (R * 0.12 + R * 0.45 * ph) * 0.32, 0, 0, Math.PI * 2); g.stroke();
    // the drop: a teardrop, lit from the upper left, swelling a little as it gathers
    const sw = 1 + 0.06 * Math.sin(t * 2.2), dh = R * 0.62 * sw, dw = R * 0.36 * sw, dy = c - R * 0.08;
    const gr = g.createRadialGradient(c - dw * 0.3, dy + dh * 0.05, 0, c, dy + dh * 0.1, dh * 0.6);
    gr.addColorStop(0, 'rgba(250,255,220,0.95)'); gr.addColorStop(0.35, 'rgba(214,242,90,0.85)'); gr.addColorStop(1, 'rgba(60,190,120,0.25)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(c, dy - dh * 0.55);
    g.bezierCurveTo(c + dw * 0.25, dy - dh * 0.2, c + dw, dy + dh * 0.05, c + dw, dy + dh * 0.22);
    g.bezierCurveTo(c + dw, dy + dh * 0.45, c + dw * 0.55, dy + dh * 0.6, c, dy + dh * 0.6);
    g.bezierCurveTo(c - dw * 0.55, dy + dh * 0.6, c - dw, dy + dh * 0.45, c - dw, dy + dh * 0.22);
    g.bezierCurveTo(c - dw, dy + dh * 0.05, c - dw * 0.25, dy - dh * 0.2, c, dy - dh * 0.55); g.fill();
    // bubbles rising round it
    for (let i = 0; i < 9; i++) {
      const q = (t * (0.18 + (i % 4) * 0.04) + i * 0.137) % 1, x = c + Math.sin(i * 7.31) * R * 0.62, y = c + R * 0.5 - q * R * 1.05, r = S / 110 * (0.7 + (i % 3) * 0.4);
      g.strokeStyle = `rgba(220,255,200,${0.6 * Math.sin(q * Math.PI)})`; g.lineWidth = S / 300; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
  }
  /* OXIDISER (acidified potassium dichromate, warmed: it oxidises an alcohol to its acid, and turns from orange to green as
     it does). A slow swirl of orange liquid light, its edges drifting toward green and back. */
  function paintOxidiser(g, S, t) {
    const c = S / 2, R = S * 0.47, k = 0.5 + 0.5 * Math.sin(t * 0.35);
    const mixC = (a, b, u) => a.map((v, i) => Math.round(v + (b[i] - v) * u)).join(',');
    const OR = [255, 138, 42], GR = [63, 200, 106];
    g.clearRect(0, 0, S, S); g.globalCompositeOperation = 'lighter';
    haze(g, c, R, [[0, `rgba(${mixC(OR, GR, 0.15 * k)},0.45)`], [0.5, `rgba(${mixC(OR, GR, 0.4 * k)},0.16)`], [1, 'rgba(60,40,10,0)']]);
    // swirls of liquid light, each a wide soft glow under a brighter core, their ends tapering into the haze
    for (let i = 0; i < 6; i++) {
      const a0 = i * 1.047 + t * 0.1, r0 = R * (0.2 + 0.11 * i), len = 1.6 + 0.5 * Math.sin(t * 0.4 + i * 1.3), u = Math.min(1, k * (0.25 + i * 0.16)), col = mixC(OR, GR, u);
      const N = 16 + i * 10;      // more along the longer outer swirls, so they read as one stroke
      for (let j = 0; j < N; j++) {
        const f = j / (N - 1), a = a0 + f * len, taper = Math.sin(f * Math.PI), x = c + Math.cos(a) * r0, y = c + Math.sin(a) * r0;
        const rr = S / 22 * (1.2 - i * 0.12) * (0.4 + 0.6 * taper), gq = g.createRadialGradient(x, y, 0, x, y, rr);
        gq.addColorStop(0, `rgba(${col},${0.32 * taper})`); gq.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gq; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
    }
    haze(g, c, R * 0.36, [[0, 'rgba(255,240,210,0.95)'], [0.35, `rgba(${mixC(OR, GR, 0.2 * k)},0.7)`], [1, 'rgba(255,138,42,0)']]);
    g.globalCompositeOperation = 'source-over';
  }
  // a catalyst: its crystal sits in front; behind it a burst of its own light, rays and glints
  function metalBurst(tint, deep) {
    return (g, S, t) => {
      const c = S / 2, R = S * 0.47;
      g.clearRect(0, 0, S, S); g.globalCompositeOperation = 'lighter';
      haze(g, c, R, [[0, `rgba(${tint},0.45)`], [0.45, `rgba(${deep},0.16)`], [1, `rgba(${deep},0)`]]);
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2 + t * 0.12, l = R * (0.5 + 0.45 * Math.abs(Math.sin(i * 1.7 + t * 0.8)));
        const gr = g.createLinearGradient(c, c, c + Math.cos(a) * l, c + Math.sin(a) * l); gr.addColorStop(0, `rgba(${tint},0.6)`); gr.addColorStop(1, `rgba(${tint},0)`);
        g.strokeStyle = gr; g.lineWidth = (i % 2 ? 1.2 : 2.4) * S / 256; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * l, c + Math.sin(a) * l); g.stroke();
      }
      for (let i = 0; i < 5; i++) {
        const ph = (t * 0.45 + i * 0.29) % 1, k = Math.sin(ph * Math.PI); if (k < 0.05) continue;
        const a = i * 2.4 + Math.floor(t * 0.45 + i * 0.29) * 1.3, r = R * (0.18 + 0.22 * ((i * 0.37) % 1)), x = c + Math.cos(a) * r, y = c + Math.sin(a) * r, L = R * 0.22 * k;
        g.strokeStyle = `rgba(255,255,255,${0.9 * k})`; g.lineWidth = 1.2 * S / 256;
        g.beginPath(); g.moveTo(x - L, y); g.lineTo(x + L, y); g.moveTo(x, y - L); g.lineTo(x, y + L); g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
    };
  }
  /* ELECTRICITY: two electrodes standing in the glass, bubbles rising from each,
     and the current flickering between them. */
  function paintElectricity(g, S, t) {
    const c = S / 2, R = S * 0.47;
    g.clearRect(0, 0, S, S); g.globalCompositeOperation = 'lighter';
    haze(g, c, R, [[0, 'rgba(255,228,90,0.4)'], [0.5, 'rgba(90,184,255,0.16)'], [1, 'rgba(60,120,255,0)']]);
    for (let k = 0; k < 3; k++) {
      const y0 = c - R * 0.2 + k * R * 0.2, fl = 0.5 + 0.5 * Math.sin(t * 17 + k * 2.1);
      g.strokeStyle = `rgba(255,240,150,${0.25 + 0.35 * fl})`; g.lineWidth = (1.2 + fl) * S / 256; g.beginPath();
      for (let i = 0; i <= 12; i++) { const x = c - R * 0.3 + i * R * 0.05, y = y0 + Math.sin(i * 1.9 + t * 23 + k) * R * 0.04; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    for (const s of [-1, 1]) {
      const x = c + s * R * 0.36, w = R * 0.12, top = c - R * 0.55, h = R * 0.95;
      const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0); gr.addColorStop(0, '#3A3E46'); gr.addColorStop(0.5, '#9AA2B0'); gr.addColorStop(1, '#2A2E36');
      g.fillStyle = gr; g.beginPath(); g.roundRect ? g.roundRect(x - w / 2, top, w, h, w / 2) : g.rect(x - w / 2, top, w, h); g.fill();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 12; i++) {
        const ph = (t * 0.7 + i * 0.083 + (s > 0 ? 0.5 : 0)) % 1, y = top + h * 0.95 - ph * h * 1.05, bx = x + s * w * 0.9 + Math.sin(i * 3.1 + t * 2) * R * 0.05, r = S / 220 * (1 + ph * 1.5);
        g.strokeStyle = `rgba(220,240,255,${0.75 * Math.sin(ph * Math.PI)})`; g.lineWidth = S / 300; g.beginPath(); g.arc(bx, y, r, 0, Math.PI * 2); g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
    }
    g.globalCompositeOperation = 'lighter';
    haze(g, c, R * 0.3, [[0, 'rgba(255,250,220,0.8)'], [0.4, 'rgba(255,230,120,0.35)'], [1, 'rgba(255,200,80,0)']]);
    g.globalCompositeOperation = 'source-over';
  }

  /* ---------- THE AGENTS ----------
     Each its own shell colours (two bright sections and nothing between), its
     own animation inside, and for a catalyst its crystal in front: iron the
     warm brass of pyrite, nickel bright silver, platinum white silver,
     vanadium(V) oxide its orange, manganese(IV) oxide nearly black. */
  const LOOK = {
    heat:        { cols: { a: '#FF5A2A', b: '#FFC040' }, paint: paintHeat, pal: [0xFFE08A, 0xFFB04A, 0xFF7A2A, 0xFF4F3A, 0xFF9A5A, 0xFFD27A], aura: 0xFF8A40 },
    spark:       { cols: { a: '#7A6AFF', b: '#2ED8FF' }, paint: (g, S, t) => paintSpark(g, S, t * 0.3), pal: [0xEAF6FF, 0x9AD0FF, 0x5A8CFF, 0x8A5CFF, 0xD07AFF, 0x5AE0FF], aura: 0x7AA8FF, spent: true },
    light:       { cols: { a: '#B07AFF', b: '#5A7CFF' }, paint: paintLight, pal: [0xF0E6FF, 0xC8A8FF, 0xA07AFF, 0x7A6AFF, 0xD0B8FF, 0xFFFFFF], aura: 0xB08AFF, spent: true },
    electricity: { cols: { a: '#FFE45A', b: '#5AB8FF' }, paint: paintElectricity, pal: [0xFFF6B0, 0xFFE45A, 0x9AD8FF, 0x5AB8FF, 0xFFFFFF, 0xFFE8A0], aura: 0xFFE070, spent: true },
    platinum:    { cols: { a: '#F2F4F8', b: '#9AB4E8' }, paint: metalBurst('235,240,255', '150,170,220'), crystal: [0xEEF0F4, 1], pal: [0xFFFFFF, 0xE6ECF8, 0xC8D4F0, 0xA8B8E8, 0xF0F4FF, 0xD8E0F4], aura: 0xDDE6FF },
    iron:        { cols: { a: '#FFC040', b: '#E87A2A' }, paint: metalBurst('255,210,120', '200,140,40'), crystal: [0xC8A050, 1], pal: [0xFFD27A, 0xFF8A3A, 0xFF4F8B, 0xB05CFF, 0x5A7CFF, 0x5AD8FF], aura: 0xFF9A50 },
    nickel:      { cols: { a: '#6AF0D8', b: '#9AD8FF' }, paint: metalBurst('200,255,240', '110,190,200'), crystal: [0xDCE0E6, 1], pal: [0xEAFFF8, 0x9AF0D8, 0x6AD8C8, 0x9AD8FF, 0xC8FFF0, 0xFFFFFF], aura: 0x8AF0E0 },
    vanadium:    { cols: { a: '#FFB030', b: '#FF7A1A' }, paint: metalBurst('255,190,90', '230,110,30'), crystal: [0xD07A2A, 0.35], pal: [0xFFE0A0, 0xFFB030, 0xFF8A1A, 0xFF6A1A, 0xFFC870, 0xFFF0D0], aura: 0xFFA040 },
    manganese:   { cols: { a: '#C08A6A', b: '#8A5AE0' }, paint: metalBurst('220,190,255', '130,90,200'), crystal: [0x2A2422, 0.85], pal: [0xE8D0C0, 0xC08A6A, 0x8A5AE0, 0x6A4AC0, 0xB07AFF, 0xF0E0D8], aura: 0xB08AE0 },
    // the Carbon Chamber's (owner, 2026-10-03): a catalyst's drop that comes back, and the dichromate, used up as it turns green
    acid:        { cols: { a: '#D6F25A', b: '#3AD8A0' }, paint: paintAcid, pal: [0xFFF2A8, 0xC8F07A, 0x6AE0B0, 0x5AC8F0, 0xB08AFF, 0xFFB0D0], aura: 0xC8F07A },
    oxidiser:    { cols: { a: '#FF8A2A', b: '#3FC86A' }, paint: paintOxidiser, pal: [0xFFF0D0, 0xFFB04A, 0xFF8A2A, 0xC8D060, 0x6AD88A, 0x3FC86A], aura: 0xFFA050, spent: true },
  };
  const MEET = { pal: [0xFFFFFF, 0xDDEEFF, 0xFFE6F0, 0xE6ECFF, 0xF4F0FF, 0xFFFFFF], aura: 0xF4ECFF, cols: { a: '#FFD6E6', b: '#D6F2FF' } };
  const SHELL = { a: '#FF2E6E', b: '#22C8F0' };
  const orbLayers = {};
  const orbLayer = (S) => orbLayers[S] || (orbLayers[S] = Object.assign(document.createElement('canvas'), { width: S, height: S }));
  /* The shell (owner, 2026-10-03): a crisp round edge, one band of colour running round it brightest at the rim and
     falling quickly to a dark middle; two sections bright and the quiet ones nothing; a soft light just outside. */
  function paintShell(g, S, o) {
    const c = S / 2, R = S * o.R, cols = o.cols;
    g.clearRect(0, 0, S, S);
    if (o.outer > 0) {
      g.globalCompositeOperation = 'lighter';
      for (const [col, ang] of [[cols.a, -Math.PI / 2], [cols.b, Math.PI * 0.8]]) {
        const x = c + Math.cos(ang) * R * 0.85, y = c + Math.sin(ang) * R * 0.85, gr0 = g.createRadialGradient(x, y, 0, x, y, R * 0.95);
        gr0.addColorStop(0, hexA(col, 0.28 * o.outer)); gr0.addColorStop(1, hexA(col, 0)); g.fillStyle = gr0; g.fillRect(0, 0, S, S);
      }
      g.globalCompositeOperation = 'source-over';
    }
    if (o.bandless) {
      g.globalCompositeOperation = 'destination-in';
      const fe0 = g.createRadialGradient(c, c, S * 0.38, c, c, S * 0.5); fe0.addColorStop(0, 'rgba(0,0,0,1)'); fe0.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fe0; g.fillRect(0, 0, S, S);
      g.globalCompositeOperation = 'source-over'; return;
    }
    let gr = g.createRadialGradient(c - R * 0.15, c - R * 0.2, 0, c, c, R);
    gr.addColorStop(0, `rgba(14,14,26,${o.body})`); gr.addColorStop(1, `rgba(6,6,14,${Math.min(1, o.body + 0.2)})`);
    g.fillStyle = gr; g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.fill();
    if (o.inside) { g.save(); g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.clip(); g.globalCompositeOperation = 'lighter'; o.inside(g, c, R); g.restore(); }
    const L = orbLayer(S), q = L.getContext('2d');
    q.globalCompositeOperation = 'source-over'; q.clearRect(0, 0, S, S);
    if (q.createConicGradient) {
      const cg = q.createConicGradient(-Math.PI / 2, c, c);
      for (const [k, col] of [[0, cols.a], [0.1, cols.a], [0.22, hexA(cols.a, 0)], [0.38, hexA(cols.b, 0)], [0.52, cols.b], [0.7, cols.b], [0.8, hexA(cols.b, 0)], [0.88, hexA(cols.a, 0)], [1, cols.a]]) cg.addColorStop(k, col);
      q.fillStyle = cg;
    } else q.fillStyle = cols.a;
    q.beginPath(); q.arc(c, c, R, 0, Math.PI * 2); q.fill();
    q.globalCompositeOperation = 'destination-in';
    gr = q.createRadialGradient(c, c, 0, c, c, R);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.58, 'rgba(0,0,0,0)'); gr.addColorStop(0.8, 'rgba(0,0,0,0.25)');
    gr.addColorStop(0.93, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.985, 'rgba(0,0,0,0.78)'); gr.addColorStop(1, 'rgba(0,0,0,0.7)');
    q.fillStyle = gr; q.fillRect(0, 0, S, S); q.globalCompositeOperation = 'source-over';
    g.globalCompositeOperation = 'lighter'; g.drawImage(L, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    const fe = g.createRadialGradient(c, c, S * 0.38, c, c, S * 0.5); fe.addColorStop(0, 'rgba(0,0,0,1)'); fe.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fe; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'source-over';
  }
  const insides = {};
  function insideOf(name, t) {
    const cv = insides[name] || (insides[name] = Object.assign(document.createElement('canvas'), { width: 192, height: 192 }));
    const g = cv.getContext('2d');
    LOOK[name].paint(g, 192, t);
    if (name === 'spark') {   // Spark's lightning fades before it reaches the glass (owner, 2026-10-03)
      const c = 96, rim = 192 * 0.47 / 1.15, gr = g.createRadialGradient(c, c, 0, c, c, rim);
      for (const [k, a] of [[0, 1], [0.45, 1], [0.62, 0.8], [0.75, 0.45], [0.85, 0.15], [0.93, 0], [1, 0]]) gr.addColorStop(k, `rgba(0,0,0,${a})`);
      g.globalCompositeOperation = 'destination-in'; g.fillStyle = gr; g.fillRect(0, 0, 192, 192); g.globalCompositeOperation = 'source-over';
    }
    return cv;
  }
  // a studio's light, so a crystal's mirror facets catch it and some go dark, which reads as metal
  let studioEnv = null;
  function studio() {
    if (studioEnv) return studioEnv;
    const sc = new Scene(); sc.add(new Mesh(new SphereGeometry(40, 32, 16), new MeshBasicMaterial({ color: 0x8E8C88, side: BackSide })));
    for (const [x, y, z, w, h, c] of [[-18, 22, 14, 26, 16, 0xFFFFFF], [22, 8, 18, 14, 30, 0xFFF8EE], [6, -16, -24, 30, 10, 0xE8EEFF], [-24, -4, -16, 12, 22, 0xFFFFFF], [0, 30, -10, 34, 8, 0xFFFFFF],
      [20, -20, 10, 18, 18, 0x18181A], [-26, 12, -20, 14, 20, 0x1C1C1E], [10, 4, -34, 16, 12, 0x202022], [-8, -28, 18, 20, 10, 0x141416]]) {
      const p = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: c, side: DoubleSide })); p.position.set(x, y, z); p.lookAt(0, 0, 0); sc.add(p);
    }
    const pm = new PMREMGenerator(renderer); studioEnv = pm.fromScene(sc, 0.01).texture; pm.dispose();
    return studioEnv;
  }
  function crystal(color, metal, seed, size) {
    const g = new Group(), R = rnd(seed);
    const m = new MeshPhysicalMaterial({ color, metalness: metal, roughness: metal > 0.5 ? 0.08 : 0.3, envMap: studio(), envMapIntensity: 2.2, emissive: 0xFF6A1E, emissiveIntensity: 0, transparent: true, depthTest: false });
    for (let i = 0; i < 9; i++) {
      const s = size * (i === 0 ? 0.6 : 0.3 + R() * 0.28);
      const geo = R() < 0.55 ? new BoxGeometry(s, s, s) : new RoundedBoxGeometry(s, s, s, 1, s * 0.2);
      const mesh = new Mesh(geo, m); mesh.renderOrder = 60;
      const a = R() * Math.PI * 2, b = (R() - 0.5) * 1.6, d = i === 0 ? 0 : size * (0.22 + R() * 0.28);
      mesh.position.set(Math.cos(a) * Math.cos(b) * d, Math.sin(b) * d * 0.8, Math.sin(a) * Math.cos(b) * d * 0.7);
      mesh.rotation.set(R() * Math.PI, R() * Math.PI, R() * Math.PI); g.add(mesh);
    }
    g.userData.mat = m;
    return g;
  }
  function makeAgent(name, i) {
    const S = 192, cv = Object.assign(document.createElement('canvas'), { width: S, height: S }), map = new CanvasTexture(cv); map.colorSpace = SRGBColorSpace;
    const orb = new Sprite(new SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })); orb.renderOrder = 55;
    const L = LOOK[name], a = { name, i, cv, map, orb, look: null, home: V(0, 0, 0), size: 1, out: null, dim: 1 };
    rig.add(orb);
    if (L.crystal) { a.look = crystal(L.crystal[0], L.crystal[1], 23 + i * 7, 1); rig.add(a.look); }
    // the agents at rest are drawn after the dark fade at the foot of the screen (play.js), so it never dims them
    orb.layers.set(1); if (a.look) a.look.traverse((o) => o.layers.set(1));
    // the agent itself, travelling into the sphere: its burst of light (and crystal)
    const bcv = Object.assign(document.createElement('canvas'), { width: 256, height: 256 }), bmap = new CanvasTexture(bcv); bmap.colorSpace = SRGBColorSpace;
    a.burst = { cv: bcv, map: bmap, sp: new Sprite(new SpriteMaterial({ map: bmap, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false })) };
    a.burst.sp.visible = false; a.burst.sp.renderOrder = 8; rig.add(a.burst.sp);
    a.glow = glowS(L.aura, 1, 0); a.glow.visible = false; rig.add(a.glow);
    if (L.crystal) { a.inX = crystal(L.crystal[0], L.crystal[1], 41 + i * 7, 0.62); a.inX.visible = false; rig.add(a.inX); }
    return a;
  }
  function placeAgent(a, i) {
    const p = AG[i]; if (!p) return;
    a.home.copy(local(p.x, p.y, DA)); a.size = pxAt(p.r * 2 / 0.72, DA);
    a.orb.position.copy(a.home); a.orb.scale.set(a.size, a.size, 1);
    if (a.look) { a.look.position.copy(a.home); a.look.scale.setScalar(pxAt(p.r * 0.95, DA)); }
  }
  function paintAgent(a, t) {
    const S = 192, L = LOOK[a.name];
    paintShell(a.cv.getContext('2d'), S, { cols: L.cols, R: 0.36, body: 0.5, outer: 0.45, inside: (q, c, R) => {
      const off = insideOf(a.name, t), k = R / (0.47 * S) * 1.15; q.drawImage(off, c - S * k / 2, c - S * k / 2, S * k, S * k);
    } });
    a.map.needsUpdate = true;
  }

  /* ---------- THE SPHERE ----------
     Open-edged (owner, 2026-10-03): only its two bright sections draw it, lit on the graphics card so the colour rises
     smoothly to the edge; its back a surface of frosted glass, so what passes behind it blurs; a soft light outside. */
  const SHELL_GLSL = `
    vec3 sn = normalize(vSN), sv = normalize(vSV);
    float f = 1.0 - clamp(dot(sn, sv), 0.0, 1.0);
    float k = fract(atan(sn.x, sn.y) / 6.2831853 + 1.0);
    float da = k - uCA; da -= floor(da + 0.5);
    float db = k - uCB; db -= floor(db + 0.5);
    float wA = 1.0 - smoothstep(uWA * 0.3, uWA, abs(da)), wB = 1.0 - smoothstep(uWB * 0.4, uWB, abs(db));
    vec3 cA = mix(uA, uA3, smoothstep(0.0, uWA, -da) * uHue); cA = mix(cA, uA2, smoothstep(0.0, uWA, da) * uHue);
    vec3 cB = mix(uB, uB3, smoothstep(0.0, uWB, -db) * uHue); cB = mix(cB, uB2, smoothstep(0.0, uWB, db) * uHue);
    float band = smoothstep(0.15, 0.95, f) * uBand, rim = pow(f, 10.0);
    float w = clamp(wA + wB, 0.0, 1.0), a = clamp((band + rim * uRim) * w, 0.0, 1.0);
    vec3 col = (cA * wA + cB * wB) / max(w, 1e-3);
    col = mix(col, vec3(1.0), rim * uWhite);
    gl_FragColor = vec4(col, a);`;
  function hues(cols) { return { a: cols.a, a2: mixHex(cols.a, '#FF6A3A', 0.45), a3: mixHex(cols.a, '#8A4CFF', 0.6), b: cols.b, b2: mixHex(cols.b, '#2E5CFF', 0.6), b3: mixHex(cols.b, '#2EF0B0', 0.5) }; }
  function shellMesh() {
    const u = { uA: { value: new Color() }, uA2: { value: new Color() }, uA3: { value: new Color() }, uB: { value: new Color() }, uB2: { value: new Color() }, uB3: { value: new Color() },
      uCA: { value: 0.05 }, uWA: { value: 0.17 }, uCB: { value: 0.6 }, uWB: { value: 0.22 }, uHue: { value: 0.4 }, uBand: { value: 1.25 }, uRim: { value: 0.3 }, uWhite: { value: 0.2 } };
    const m = new MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, depthWrite: false, toneMapped: false }); m.dithering = true;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'varying vec3 vSN; varying vec3 vSV;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vSN = normalize(normalMatrix * normal); vSV = normalize(-mvPosition.xyz);');
      sh.fragmentShader = 'varying vec3 vSN; varying vec3 vSV;\nuniform vec3 uA, uA2, uA3, uB, uB2, uB3;\nuniform float uCA, uWA, uCB, uWB, uHue, uBand, uRim, uWhite;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', SHELL_GLSL);
    };
    const mesh = new Mesh(new SphereGeometry(1, 128, 96), m); mesh.renderOrder = 46;
    return { mesh, set(cols, lift = 0) { const H = hues(cols); for (const k of ['a', 'a2', 'a3', 'b', 'b2', 'b3']) u['u' + k.toUpperCase()].value.set(H[k]); u.uBand.value = 1.25 * (1 + 0.2 * lift); u.uRim.value = 0.3 * (1 + 0.4 * lift); } };
  }
  let glass = null;
  function buildGlass() {
    const g = {};
    g.shell = shellMesh(); rig.add(g.shell.mesh);
    g.frost = new Mesh(new SphereGeometry(0.99, 64, 48), new MeshPhysicalMaterial({ color: 0xFFFFFF, transmission: 1, roughness: 0.38, ior: 1.5, thickness: 0,
      metalness: 0, specularIntensity: 0, envMapIntensity: 0, side: BackSide, toneMapped: false }));
    rig.add(g.frost);
    const cv = Object.assign(document.createElement('canvas'), { width: 384, height: 384 }), map = new CanvasTexture(cv); map.colorSpace = SRGBColorSpace;
    g.outer = { cv, map, sp: new Sprite(new SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped: false })) }; g.outer.sp.renderOrder = -5; rig.add(g.outer.sp);
    g.aura = glowS(0xFF9A50, 1, 0); g.aura.renderOrder = 0; rig.add(g.aura);
    g.wave = sprite(RING, 0xFFB070, 1, 0); rig.add(g.wave);
    g.bloom = glowS(0xFFE8C8, 1, 0); rig.add(g.bloom);
    g.lastCols = '';
    glass = g;
    placeGlass();
  }
  function placeGlass() {
    const g = glass;
    g.shell.mesh.position.copy(SPH); g.shell.mesh.scale.setScalar(SR);
    g.frost.position.copy(SPH); g.frost.scale.setScalar(SR);
    // the soft light outside sits just in front of the glass's outline, so the frost does not hide it
    const k = (SPH.length() - SR * 0.5) / SPH.length(); g.outer.sp.position.copy(SPH).multiplyScalar(k); g.outer.sp.scale.set(SR / 0.4 * k, SR / 0.4 * k, 1);
    g.aura.position.copy(SPH); g.wave.position.copy(SPH);
    g.lastCols = '';
  }
  function shellFrame(cols, outer, lift) {
    const key = cols.a + cols.b + outer.toFixed(2);
    if (key !== glass.lastCols) { paintShell(glass.outer.cv.getContext('2d'), 384, { cols, R: 0.4, body: 0, outer, bandless: true }); glass.outer.map.needsUpdate = true; glass.lastCols = key; }
    glass.shell.set(cols, lift);
  }

  /* ---------- A MOLECULE ----------
     Built from its picture (lab.js's 2D drawing, in bond lengths) in the game's own glass, as the goals are: balls,
     sticks in each atom's colour, one rod for each bond, and each atom's letter upright in front. */
  const BOND = 2.6 * U;
  let mols = new Map();                                 // piece id -> view
  function makeMol(id, key) {
    const sp = X.SPECIES[key], g = new Group();
    const atoms = sp.atoms.map((a, i) => ({ el: a.el, local: V(a.x * BOND, -a.y * BOND, ((i * 0.37) % 1 - 0.5) * 0.25 * BOND), r: rOf(a.el) }));
    const own = new Map(), mine = (k, make) => { if (!own.has(k)) own.set(k, make().clone()); return own.get(k); };
    let ext = 0;
    for (const a of atoms) {
      a.ball = new Mesh(cached('ball' + a.r, () => new SphereGeometry(a.r, 40, 28)), mine('b' + a.el, () => ballMat(a.el)));
      a.ball.position.copy(a.local); a.ball.scale.setScalar(0.8); g.add(a.ball);
      a.letter = new Sprite(letterMat(a.el)); const ls = a.r * letterBase(a.el) * 0.8; a.letter.scale.set(ls, ls, 1); a.letter.renderOrder = 50; g.add(a.letter);
      ext = Math.max(ext, a.local.length() + a.r);
    }
    const sticks = [];
    for (const b of sp.bonds) {
      const A = atoms[b.a], B = atoms[b.b], d = B.local.clone().sub(A.local), L = d.length(); d.normalize();
      const side = d.clone().cross(V(0, 0, 1)).normalize();
      const offs = b.order === 1 ? [0] : b.order === 2 ? [-0.16 * U, 0.16 * U] : [-0.22 * U, 0, 0.22 * U], rad = b.order > 1 ? 0.085 * U : 0.12 * U;
      for (const off of offs) for (const [el, k] of [[A.el, 0.25], [B.el, 0.75]]) {
        const s = new Mesh(cached('stick' + rad, () => new CylinderGeometry(rad, rad, 1, 10)), mine('s' + el, () => stickMat(el)));
        s.quaternion.setFromUnitVectors(Y_UP, d); s.scale.set(1, L / 2, 1);
        s.position.copy(A.local).addScaledVector(d, L * k).addScaledVector(side, off); g.add(s); sticks.push(s);
      }
    }
    const m = { id, key, g, atoms, sticks, ext: ext || U, own, where: 'space', pos: V(0, 0, 0), q: new Quaternion(), k: 1, fade: 1,
      spin: V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), anim: null, label: true };
    return m;
  }
  function disposeMol(m) { m.g.parent && m.g.parent.remove(m.g); for (const x of m.own.values()) x.dispose(); }
  function setFade(m, f) { m.fade = f; for (const x of m.own.values()) { x.transparent = true; x.opacity = f; } for (const a of m.atoms) a.letter.material.opacity = 1; }
  function toRig(m) { if (m.g.parent === rig) return; const w = V(0, 0, 0); m.g.getWorldPosition(w); scene.remove(m.g); rig.add(m.g); m.pos.copy(rig.worldToLocal(w)); m.q.premultiply(rig.quaternion.clone().invert()); }
  function toWorld(m) { if (m.g.parent === scene) return; const w = V(0, 0, 0); m.g.getWorldPosition(w); rig.remove(m.g); scene.add(m.g); m.pos.copy(w); m.q.premultiply(rig.quaternion); }

  /* ---------- PLACING THE LEVEL ----------
     The molecules float all round you, above and below as well, far enough to read, none behind another: a nearer
     ring and a farther one, every one of them sharp (owner, 2026-10-03: a lot of molecules, like the flat game's bench,
     not a blur), so wherever you look there are several. */
  function placeSpace(ids, seed) {
    const R = rnd(seed * 977 + 5), n = ids.length, out = [];
    for (let i = 0; i < n; i++) {
      let best = null;
      for (let tries = 0; tries < 40; tries++) {
        // the first two in front of you, inside a phone's narrow view, the rest anywhere round
        const half = MODE === 'mobile' ? 0.17 : 0.34;
        const yaw = i < 2 ? (i === 0 ? -half : half) + (R() - 0.5) * 0.08 : R() * Math.PI * 2;
        // the first two above the sphere, never behind it
        const pitch = i < 2 ? 0.24 + (R() - 0.5) * 0.12 : (R() - 0.5) * 1.3;
        const dir = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
        const sep = Math.min(...out.map((o) => o.dir.angleTo(dir)), 9);
        if (!best || sep > best.sep) best = { dir, sep };
        if (sep > (n > 30 ? 0.3 : n > 16 ? 0.4 : 0.55)) break;
      }
      out.push({ dir: best.dir, dist: i < 2 ? 15 + R() * 2 : (i % 3 === 0 ? 21 + R() * 4 : 14 + R() * 4) });
    }
    return out;
  }

  /* ---------- THE LEVEL IN PLAY ---------- */
  let S = null, level = null, agents = [], busy = null, run = null, bounce = null, waits = [], tNow = 0, poured = null, steps = [];
  const usedAt = new Map();                             // atom of a reactant -> its place, for the dust
  function start(lv, n) {
    clear();
    level = lv; S = X.createReactor(lv);
    layout();
    if (!glass) buildGlass();
    agents = lv.agents.map((name, i) => makeAgent(name, i));
    agents.forEach((a, i) => placeAgent(a, i));
    const ids = S.pieces.map((p) => p.id), spots = placeSpace(ids, lv.seed || n);
    ids.forEach((id, i) => {
      const m = makeMol(id, S.pieces[id].key); mols.set(id, m); scene.add(m.g);
      // a level may say where each floats ([yaw, pitch, distance]: the cover's scene does)
      const at = lv.place && lv.place[i];
      if (at) { const [yaw, pitch, dist] = at; m.pos.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist); }
      else m.pos.copy(spots[i].dir).multiplyScalar(spots[i].dist);
      m.q.setFromEuler(new Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    });
    busy = null; run = null; bounce = null; waits = []; poured = null; steps = [];
    return S;
  }
  // a new level starts clean: nothing of the last one (a molecule still fading, its dust, its agent) carries over
  function clear() {
    for (const m of mols.values()) disposeMol(m);
    for (const f of fadingOut) disposeMol(f.m);
    fadingOut.length = 0; usedAt.clear();
    mols = new Map();
    for (const a of agents) { rig.remove(a.orb, a.burst.sp, a.glow); if (a.look) rig.remove(a.look); if (a.inX) rig.remove(a.inX); a.map.dispose(); a.burst.map.dispose(); }
    agents = [];
    for (const d of dusts) { rig.remove(d.pts); d.pts.geometry.dispose(); }
    dusts.length = 0;
  }

  // slots in the sphere for what it holds, in its own radius
  const SLOTS = { 1: [[0, 0.05, 0]], 2: [[-0.42, 0.18, 0.1], [0.42, -0.16, -0.05]], 3: [[-0.4, 0.3, 0.1], [0.42, 0.24, -0.1], [0, -0.38, 0.12]],
    4: [[-0.35, 0.26, 0.12], [0.4, 0.35, -0.12], [0.33, -0.3, 0.16], [-0.26, -0.37, -0.14]] };
  const inScale = (n) => (n <= 2 ? 0.62 : n === 3 ? 0.55 : 0.48);
  /* a molecule's size inside: the same for small ones, but a big one (the Carbon Chamber's esters) is shrunk until it
     fits its share of the glass, `room` sphere radii from its middle */
  const fitK = (m, base, room) => Math.min(base, room * SR / Math.max(0.01, m.ext));
  const ROOM_IN = { 1: 0.8, 2: 0.5, 3: 0.46, 4: 0.42 }, ROOM_OUT = { 1: 0.8, 2: 0.5, 3: 0.44, 4: 0.4, 5: 0.36 }, ROOM_WAIT = 0.42;
  // what is in the sphere as you see it (the rules may already have reacted it: it still glides in first)
  function sphereSlots() {
    const inside = [...mols.values()].filter((m) => m.where === 'sphere').map((m) => m.id), n = inside.length;
    return inside.map((id, i) => ({ id, p: SPH.clone().add(V(...SLOTS[Math.max(1, n)][i]).multiplyScalar(SR)), k: fitK(mols.get(id), inScale(n) * SR / 2.15, ROOM_IN[Math.max(1, n)]) }));
  }
  // places above the sphere, on an arc of light, for what waits
  const ARCA = [Math.PI / 2 + 0.6, Math.PI / 2 - 0.6, Math.PI / 2, Math.PI / 2 + 1.15, Math.PI / 2 - 1.15];
  const arcAt = (j) => SPH.clone().add(V(Math.cos(ARCA[j % 5]) * SR * 1.5, Math.sin(ARCA[j % 5]) * SR * 1.5, 0.2));

  /* ---------- MOVES ----------
     A glide is a short eased flight in your view's frame, with a fading trail; the rules have already moved. */
  function glideTo(m, to, k, ms, then) {
    toRig(m);
    m.anim = { from: m.pos.clone(), to: to.clone(), k0: m.k, k1: k, t0: tNow, ms: ms / 1000, then };
  }
  function floatOut(m, then) {
    // out of the sphere: a little way out to the side, then it floats in the space again
    toRig(m);
    const side = m.pos.x < SPH.x ? -1 : 1, to = V(SPH.x + side * SR * 2.2, SPH.y + SR * 1.3, SPH.z - SR * 1.2);
    m.anim = { from: m.pos.clone(), to, k0: m.k, k1: 1, t0: tNow, ms: 0.7, then: () => { toWorld(m); m.where = 'space'; if (then) then(); } };
  }
  function tapMolecule(id) {
    const p = S.pieces[id], m = mols.get(id);
    if (p.zone === 'space' || p.zone === 'waiting') {
      const ev = X.toSphere(S, id);
      if (!ev.ok) { host.SND.refuse(); return ev; }
      host.SND.glide();
      waits = waits.filter((w) => w !== id);
      m.where = 'sphere'; m.label = false;
      busy = { kind: 'glide' };
      // every molecule in the sphere moves to its slot (one more came in)
      const slots = sphereSlots();
      let n = slots.length;
      for (const s of slots) {
        const mm = mols.get(s.id);
        glideTo(mm, s.p, s.k, s.id === id ? 650 : 400, () => { if (--n === 0) { busy = null; if (ev.reaction) startRun(ev, null); else afterMove(); } });
      }
      return ev;
    }
    if (p.zone === 'sphere') {
      X.toSpace(S, id); host.SND.pick();
      busy = { kind: 'glide' }; m.label = true;
      floatOut(m, () => { busy = null; resettle(); afterMove(); });
      return { ok: true };
    }
    return { ok: false };
  }
  function keep(id, worldDir) {
    // a waiting molecule dragged away: it floats in the space, where you let it go
    if (!X.toSpace(S, id)) return;
    const m = mols.get(id); waits = waits.filter((w) => w !== id);
    toWorld(m); m.where = 'space'; m.label = true; m.k = 1;
    m.pos.copy(worldDir).multiplyScalar(14); m.anim = null;
    host.SND.pick(); resettleWaits(); afterMove();
  }
  function resettle() { const slots = sphereSlots(); for (const s of slots) glideTo(mols.get(s.id), s.p, s.k, 350, null); }
  const waitK = (m) => fitK(m, 0.42 * SR / 2.15, ROOM_WAIT);
  function resettleWaits() { waits.forEach((id, j) => glideTo(mols.get(id), arcAt(j), waitK(mols.get(id)), 350, null)); }
  function pickAgent(i) {
    const a = agents[i]; if (!a) return { ok: false };
    const ev = X.pickAgent(S, a.name);
    if (!ev.ok) return ev;
    host.SND.agent();      // it flies into the sphere
    if (ev.reaction) startRun(ev, a);
    else startBounce(a, ev);
    return ev;
  }
  function afterMove() { if (S.result) host.ended(S.result); }

  /* ---------- A WRONG AGENT: in, nothing, back ---------- */
  function startBounce(a, ev) {
    busy = { kind: 'bounce' };
    bounce = { a, t0: tNow, ev };
    host.moved();
    host.SND.bounce(0.8, ev.poured ? 2.4 : 0);     // nothing, as it reaches the glass; and poured away as it leaves
  }
  function stepBounce() {
    const b = bounce, t = tNow - b.t0, a = b.a;
    const into = SPH.clone();
    let p;
    if (t < 0.8) p = a.home.clone().lerp(into, ease(t / 0.8)).add(V(0, Math.sin(ease(t / 0.8) * Math.PI) * 1.0, 0));
    else if (t < 1.7) p = into.clone().add(V(Math.sin(t * 31) * 0.05, 0, 0));
    else p = into.clone().lerp(a.home, ease((t - 1.7) / 0.7)).add(V(0, Math.sin(ease((t - 1.7) / 0.7) * Math.PI) * 1.2, 0));
    showAgentAt(a, p, 0.6 * (1 - 0.6 * dullAt()));
    if (t >= 2.4) {
      hideAgentAt(a); bounce = null; busy = null;
      if (b.ev.poured) {
        for (const id of b.ev.poured) { const m = mols.get(id); if (m) dustAway(m); }
      }
      afterMove();
    }
  }
  const dullAt = () => (bounce ? Math.sin(span(tNow - bounce.t0, 0.8, 1.7) * Math.PI) : 0);
  function showAgentAt(a, p, op) {
    a.burst.sp.visible = true; a.burst.sp.position.copy(p); const s = SR * 0.95; a.burst.sp.scale.set(s, s, 1); a.burst.sp.material.opacity = op;
    LOOK[a.name].paint(a.burst.cv.getContext('2d'), 256, tNow); a.burst.map.needsUpdate = true;
    if (a.inX) { a.inX.visible = true; a.inX.position.copy(p); a.inX.scale.setScalar(SR / 2.15); a.inX.rotation.set(tNow * 0.3, tNow * 0.6, 0.2); }
    a.out = true;
  }
  function hideAgentAt(a) { a.burst.sp.visible = false; a.glow.visible = false; if (a.inX) a.inX.visible = false; a.out = false; }

  /* ---------- A REACTION ----------
     As the studies, a little quicker for play: the agent drops in; the molecules circle the middle, faster and
     faster, the bonds trembling; each atom comes apart into dust of its own colour; the dust swirls as a cloud in
     the agent's colours; each atom forms again in its new place, the new bonds grow as threads of light; the
     sphere flashes; the products glow and turn once, then fly to a goal or out to wait. With no agent it starts
     the moment the molecules meet. */
  const dusts = [];
  function equation(r) {
    const side = (list) => list.map(([k, n]) => (n > 1 ? n : '') + X.SPECIES[k].formula).join(' + ');
    const outs = {}; for (const k of r.out) outs[k] = (outs[k] || 0) + 1;
    return side(r.in) + (r.give ? ' + ' + r.give : '') + ' → ' + side(Object.entries(outs));   // the Oxidiser's [O]
  }
  function startRun(ev, agent) {
    busy = { kind: 'run' };
    host.moved();
    const r = ev.reaction, L = agent ? LOOK[agent.name] : MEET;
    const o = agent ? 0.8 : 0;
    const T = { t0: tNow, swirl: tNow + o + 0.3, dis: tNow + o + 1.2, cloud: tNow + o + 1.7, reform: tNow + o + 3.4, bond: tNow + o + 3.95, flash: tNow + o + 4.25,
      celeb: tNow + o + 4.55, fly: tNow + o + 5.95, land: tNow + o + 6.75 };
    // the reactants, their atoms, and which atom each product's atom is (by element, nearest first)
    const ins = ev.used.map((id) => mols.get(id)), inAtoms = [];
    ins.forEach((m) => m.atoms.forEach((a) => inAtoms.push({ m, a })));
    const outs = ev.products.map((id) => { const m = makeMol(id, S.pieces[id].key); mols.set(id, m); rig.add(m.g); m.where = 'made'; m.label = false; return m; });
    const n = outs.length, OUT = { 1: [[0, 0, 0]], 2: [[-0.42, 0.04, 0.1], [0.42, -0.04, -0.1]], 3: [[-0.42, 0.2, 0.1], [0.42, 0.2, -0.1], [0, -0.38, 0.05]],
      4: [[-0.38, 0.3, 0.1], [0.38, 0.3, -0.1], [0.38, -0.3, 0.1], [-0.38, -0.3, -0.1]], 5: [[-0.42, 0.3, 0], [0.42, 0.3, 0], [0, 0, 0.1], [-0.42, -0.32, 0], [0.42, -0.32, 0]] };
    const free = inAtoms.slice(), map = new Map();
    outs.forEach((m, j) => {
      m.pos.copy(SPH).add(V(...OUT[Math.min(5, n)][j]).multiplyScalar(SR)); m.k = fitK(m, (n <= 2 ? 0.62 : n <= 3 ? 0.52 : 0.44) * SR / 2.15, ROOM_OUT[Math.min(5, Math.max(1, n))]);
      m.q.setFromEuler(new Euler(0.2 * j, 0.5 * j, 0.1)); m.g.visible = false;
      for (const a of m.atoms) { const i = free.findIndex((f) => f.a.el === a.el); const src = free.splice(i >= 0 ? i : 0, 1)[0]; map.set(a, src); }
    });
    // a goal's orb turns gold only once its molecule has landed
    if (ev.collected && ev.collected.length) host.hold();
    // what waited is lost as this reaction starts (today's tray rule)
    for (const id of ev.poured) { const m = mols.get(id); if (m) dustAway(m); }
    waits = waits.filter((id) => !ev.poured.includes(id));
    run = { ev, r, agent, L, T, ins, outs, map, eq: equation(r), inAtoms, dust: makeDust(inAtoms, L.pal) };
    steps.push({ r, agent: agent ? agent.name : null });
    host.SND.reaction(o);     // on this timeline: swirl, dust, re-form, flash, fly
  }
  const DUSTC = (el) => new Color(ART[el] ? ART[el].hi : '#FFFFFF');
  function makeDust(inAtoms, pal) {
    const list = [], R = rnd(99 + Math.floor(tNow * 10));
    for (const src of inAtoms) {
      const n = src.a.el === 'H' ? 140 : 260;
      for (let k = 0; k < n; k++) list.push({ src, emit: R(), out: V(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), tw: R() * 6.283, arrive: R(),
        jit: V(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(0.18), p: V(0, 0, 0), v: V(0, 0, 0), state: 0, p0: null, energy: 0, burst: 1.2 + R() * 1.0, home: null });
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(list.length * 3), 3));
    geo.setAttribute('color', new Float32BufferAttribute(new Float32Array(list.length * 3), 3));
    const pts = new Points(geo, new PointsMaterial({ size: 0.11 * SR / 2.15, map: DOT, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
    pts.frustumCulled = false; pts.renderOrder = 4; pts.visible = false; rig.add(pts);
    const d = { list, pts, pos: geo.attributes.position, col: geo.attributes.color, pal: pal.map((c) => new Color(c)) };
    dusts.push(d);
    return d;
  }
  const tmpF = V(0, 0, 0), tmpQ = V(0, 0, 0), tmpW = V(0, 0, 0), tmpP = V(0, 0, 0), tmpC = new Color(), tmpE = new Color();
  const AX = V(0.25, 1, 0.3).normalize(), VIEW = V(0, 0, 1);
  function flowAt(p, t, out) {
    const qx = p.x - SPH.x, qy = p.y - SPH.y, qz = p.z - SPH.z, r = Math.hypot(qx, qy, qz) || 1e-3, k = SR / 2.15;
    tmpW.set(AX.x + 0.5 * Math.sin(t * 0.31), AX.y + 0.5 * Math.cos(t * 0.23), AX.z + 0.5 * Math.sin(t * 0.17 + 1)).normalize();
    out.set(qx, qy, qz).cross(tmpW).multiplyScalar(-1.15 * k / (0.5 * k + r));
    const x = qx * 2.2 / k, y = qy * 2.2 / k, z = qz * 2.2 / k, ph = t * 0.45;
    out.x += 0.75 * k * (Math.sin(z + ph) + 0.7 * Math.cos(y - ph * 0.7));
    out.y += 0.75 * k * (0.85 * Math.sin(x + ph * 0.8) + Math.cos(z - ph * 0.4));
    out.z += 0.75 * k * (0.7 * Math.sin(y + ph * 1.1) + 0.85 * Math.cos(x - ph));
    if (r > SR * 0.7) { const q = -(r - SR * 0.7) * 6 / r; out.x += qx * q; out.y += qy * q; out.z += qz * q; }
    if (r < 0.4 * k) { const q = (0.4 * k - r) * 3 / r; out.x += qx * q; out.y += qy * q; out.z += qz * q; }
    return out;
  }
  const paletteAt = (pal, f, out) => { f = ((f % 1) + 1) % 1; const x = f * (pal.length - 1), i = Math.floor(x); return out.copy(pal[i]).lerp(pal[Math.min(pal.length - 1, i + 1)], x - i); };
  // an atom's place in the world of the rig, from its molecule's pose
  const atomPos = (m, a, out) => out.copy(a.local).multiplyScalar(m.k).applyQuaternion(m.q).add(m.pos);
  function stepRun(dt) {
    const R0 = run, T = R0.T, t = tNow;
    // the agent: in, then (a catalyst) home again once the products have formed; Spark, Light and Electricity are spent in the flash
    if (R0.agent) {
      const a = R0.agent, L = R0.L;
      let p = null, op = 0.85;
      if (t < T.t0 + 0.8) p = a.home.clone().lerp(SPH, ease((t - T.t0) / 0.8)).add(V(0, Math.sin(ease((t - T.t0) / 0.8) * Math.PI) * 1.2, 0));
      else if (L.spent) { if (t < T.flash + 0.45) { p = SPH.clone(); op = 0.9 * (1 - span(t, T.flash, T.flash + 0.45)) * (1 - 0.6 * cloudK(T, t)); } }
      else if (t < T.land) p = SPH.clone().add(V(0, Math.sin(t * 2) * 0.04, 0));
      else if (t < T.land + 0.8) p = SPH.clone().lerp(a.home, ease((t - T.land) / 0.8)).add(V(0, Math.sin(ease((t - T.land) / 0.8) * Math.PI) * 1.0, 0));
      if (p) {
        showAgentAt(a, p, op);
        const hot = ease(span(t, T.t0 + 0.7, T.t0 + 1.2)) * (1 - ease(span(t, T.celeb + 0.2, T.celeb + 1.4)));
        a.glow.visible = true; a.glow.position.copy(p); const gs = SR * (0.5 + 0.9 * hot); a.glow.scale.set(gs, gs, 1); a.glow.material.opacity = 0.1 + 0.3 * hot;
        if (a.inX) a.inX.userData.mat.emissiveIntensity = 0.55 * hot;
      } else hideAgentAt(a);
    }
    // the reactants: in their slots, then round a ring, faster and faster, then each atom comes apart
    const n = R0.ins.length;
    R0.ins.forEach((m, i) => {
      if (t < T.dis + 0.6) {
        const sw = ease(span(t, T.swirl, T.dis)), sp = t < T.swirl ? 0 : Math.pow(Math.min(t, T.cloud) - T.swirl, 2) * 1.6;
        const th = i * Math.PI * 2 / n + 0.6 + sp, RO = SR * 0.6;
        const ring = SPH.clone().add(V(Math.cos(th) * RO, Math.sin(th) * RO * 0.78, Math.sin(th) * RO * 0.38));
        if (!m.ringFrom) m.ringFrom = m.pos.clone();
        m.pos.copy(m.ringFrom).lerp(ring, ease(span(t, T.t0, T.swirl + 0.3)));
        m.q.multiply(new Quaternion().setFromAxisAngle(m.spin, dt * (0.4 + 7 * sw * sw)));
        const spread = 1 + Math.sin(t * 60) * 0.04 * sw;
        m.atoms.forEach((a, j) => {
          const dis = T.dis + R0.inAtoms.findIndex((s) => s.a === a) * 0.05, k = span(t, dis, dis + 0.4);
          a.ball.scale.setScalar(0.8 * (1 - ease(k)) * spread);
          a.letter.visible = k < 0.3;
          if (!usedAt.has(a)) usedAt.set(a, V(0, 0, 0));
          atomPos(m, a, usedAt.get(a));
        });
        for (const s of m.sticks) s.visible = t < T.dis;
      } else m.g.visible = false;
    });
    // the dust
    const d = R0.dust, P = d.pos.array, Cc = d.col.array, on = t > T.dis - 0.05 && t < T.bond + 0.2;
    d.pts.visible = on;
    if (on) {
      d.list.forEach((q, j) => {
        const src = q.src, dis = T.dis + R0.inAtoms.indexOf(src) * 0.05, emitT = dis + q.emit * 0.4;
        let bright = 0;
        // where this mote's atom goes: the product atom it becomes
        if (!q.home) { for (const [pa, s] of R0.map) if (s === src) { q.home = pa; break; } }
        const homeMol = q.home && R0.outs.find((m) => m.atoms.includes(q.home));
        const reT = T.reform + (homeMol ? homeMol.atoms.indexOf(q.home) * 0.07 + R0.outs.indexOf(homeMol) * 0.12 : 0);
        if (t >= emitT) {
          if (!q.state) { q.state = 1; q.p.copy(usedAt.get(src.a) || SPH).addScaledVector(q.out, 0.1); q.v.copy(q.out).multiplyScalar(q.burst * SR / 2.15).add(tmpF.copy(q.out).cross(VIEW).multiplyScalar(0.8)); }
          const u = span(t, reT - 0.2 + q.arrive * 0.25, reT + 0.4 + q.arrive * 0.15);
          if (u <= 0) {
            let left = Math.min(0.1, dt);
            while (left > 1e-4) {
              const h = Math.min(1 / 60, left); left -= h;
              flowAt(q.p, t, tmpQ); q.v.lerp(tmpQ, Math.min(1, h * 2.4));
              tmpF.copy(q.p).sub(SPH); const r = tmpF.length();
              if (r > SR * 0.88) { tmpF.divideScalar(r); const outv = q.v.dot(tmpF); if (outv > 0) q.v.addScaledVector(tmpF, -outv * 1.2); }
              q.p.addScaledVector(q.v, h);
            }
          } else if (homeMol) {
            if (!q.p0) q.p0 = q.p.clone();
            const home = atomPos(homeMol, q.home, tmpQ).addScaledVector(q.jit, 1 - u);
            const diff = q.p0.clone().sub(home).applyAxisAngle(VIEW, ease(u) * 2.0);
            q.p.copy(home).addScaledVector(diff, 1 - ease(u));
          }
          tmpP.copy(q.p);
          const e = span(t, emitT, emitT + 0.6);
          bright = e < 1 ? 1.25 - 0.35 * ease(e) : 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(t * 2.6 + q.tw * 3));
          q.energy = ease(span(t, emitT + 0.1, emitT + 0.9));
          if (u > 0) { bright *= 1 - ease(Math.max(0, (u - 0.55) / 0.45)); q.energy *= 1 - ease(Math.min(1, u * 1.6)); }
        } else { q.state = 0; tmpP.copy(usedAt.get(src.a) || SPH); }
        tmpQ.copy(tmpP).sub(SPH); if (tmpQ.length() > SR * 0.93) tmpP.copy(SPH).add(tmpQ.setLength(SR * 0.93));
        P[j * 3] = tmpP.x; P[j * 3 + 1] = tmpP.y; P[j * 3 + 2] = tmpP.z;
        tmpF.copy(tmpP).sub(SPH);
        paletteAt(d.pal, 0.12 + 0.55 * (tmpF.length() / SR) + 0.22 * Math.sin(1.6 * tmpF.x + 1.2 * tmpF.y - 0.9 * tmpF.z + t * 0.7) + 0.08 * Math.sin(q.tw + t * 0.5), tmpE);
        tmpC.copy(DUSTC(src.a.el)).lerp(tmpE, (q.energy || 0) * 0.92).multiplyScalar(Math.max(0, bright) * (R0.agent ? 1 : 0.6));
        Cc[j * 3] = tmpC.r; Cc[j * 3 + 1] = tmpC.g; Cc[j * 3 + 2] = tmpC.b;
      });
      d.pos.needsUpdate = true; d.col.needsUpdate = true;
    }
    // the products: each atom forms again; the new bonds grow; they glow and turn once; then fly
    R0.outs.forEach((m, j) => {
      const re0 = T.reform + R0.outs.indexOf(m) * 0.12;
      m.g.visible = t >= re0;
      if (!m.g.visible) return;
      m.atoms.forEach((a, i) => { const re = re0 + i * 0.07; a.ball.scale.setScalar(0.8 * ease(span(t, re + 0.1, re + 0.6))); a.letter.visible = t > re + 0.4; });
      const g0 = T.bond; m.sticks.forEach((s, bi) => { s.visible = t >= g0 + bi * 0.04; });
      if (t >= T.celeb && t < T.fly) {
        const cel = span(t, T.celeb, T.fly); if (!m.q0) m.q0 = m.q.clone();
        m.q.copy(new Quaternion().setFromAxisAngle(Y_UP, ease(cel) * Math.PI * 2).multiply(m.q0));
      }
      if (t >= T.fly && !m.flying) {
        m.flying = true;
        const goal = S.pieces[m.id].zone === 'goal';
        if (goal) {
          const gi = S.targets.findIndex((q) => q.key === m.key);
          const to = rig.worldToLocal(host.goalWorld(gi).clone());
          glideTo(m, to, m.k * 0.35, (T.land - T.fly) * 1000, () => { host.landed(gi); m.g.visible = false; m.where = 'goal'; });
        } else {
          const jw = waits.length; waits.push(m.id); m.where = 'waiting';
          glideTo(m, arcAt(jw), waitK(m), (T.land - T.fly) * 1000, null);
        }
      }
    });
    if (t >= T.land + (R0.agent && !R0.L.spent ? 0.8 : 0)) {
      if (R0.agent) hideAgentAt(R0.agent);
      R0.dust.pts.visible = false;
      for (const m of R0.ins) { disposeMol(m); if (mols.get(m.id) === m) mols.delete(m.id); }
      run = null; busy = null;
      afterMove();
    }
  }
  function cloudK(T, t) { return ease(span(t, T.cloud - 0.4, T.cloud + 0.4)) * (1 - ease(span(t, T.reform, T.reform + 0.9))); }
  // lost: still waiting when the next reaction starts, or poured away: it flares and falls to dust
  const fadingOut = [];
  function dustAway(m) { m.where = 'gone'; fadingOut.push({ m, t0: tNow }); }

  /* ---------- EVERY STEP ---------- */
  function step(dt) {
    tNow += dt;
    rig.position.copy(cam.position); rig.quaternion.copy(cam.quaternion);
    // the space revolves round you, slowly; each molecule turns
    const rev = REDUCED || cover ? 0 : 0.035 * dt, q = new Quaternion().setFromAxisAngle(Y_UP, rev);
    for (const m of mols.values()) {
      if (m.anim) {
        const A = m.anim, k = Math.min(1, (tNow - A.t0) / A.ms), e = ease(k);
        m.pos.copy(A.from).lerp(A.to, e); m.pos.y += Math.sin(e * Math.PI) * 0.4; m.k = A.k0 + (A.k1 - A.k0) * e;
        if (k >= 1) { m.anim = null; if (A.then) A.then(); }
      } else if (m.where === 'space') {
        m.pos.applyQuaternion(q);
        m.q.multiply(new Quaternion().setFromAxisAngle(m.spin, dt * 0.25));
      } else if (m.where === 'sphere' || m.where === 'waiting') {
        m.q.multiply(new Quaternion().setFromAxisAngle(m.spin, dt * 0.45));
      }
    }
    if (bounce) stepBounce();
    if (run) stepRun(dt);
    for (let i = fadingOut.length - 1; i >= 0; i--) {
      const f = fadingOut[i], k = (tNow - f.t0) / 0.7;
      if (k >= 1) { disposeMol(f.m); if (mols.get(f.m.id) === f.m) mols.delete(f.m.id); fadingOut.splice(i, 1); continue; }
      f.m.k *= 0.97; setFade(f.m, 1 - k);
    }
  }

  /* ---------- EVERY FRAME ---------- */
  let paintTick = 0, cover = false;
  function draw(now) {
    const t = tNow;
    for (const m of mols.values()) {
      m.g.position.copy(m.pos); m.g.quaternion.copy(m.q); m.g.scale.setScalar(m.k);
    }
    lettersFace();
    // the agents' orbs: painted a few times a second; one in use, or tried and wrong, dims
    paintTick++;
    agents.forEach((a, i) => {
      if (paintTick % 3 === i % 3) paintAgent(a, t);
      const tried = S.tried.has(a.name), op = a.out ? 0.25 : tried ? 0.35 : 1;
      a.orb.material.opacity = op;
      if (a.look) { a.look.rotation.set(0.5 + Math.sin(t * 0.4) * 0.3, 0.4 + t * 0.35, 0.2); a.look.userData.mat.opacity = a.out ? 0.22 : op; a.look.visible = !cover; }
      a.orb.visible = !cover;
    });
    // the sphere: it warms toward the agent's colours, glows while it works, flashes as the bonds close; a wrong agent drains it
    const R0 = run, L = R0 ? R0.L : null, T = R0 ? R0.T : null;
    let hot = 0, cK = 0, react = 0, flash = 0;
    if (R0) {
      const s0 = R0.agent ? T.t0 + 0.7 : T.t0;
      hot = ease(span(t, s0, s0 + 0.5)) * (1 - ease(span(t, T.celeb + 0.2, T.celeb + 1.4)));
      cK = cloudK(T, t);
      react = ease(span(t, s0 + 0.1, s0 + 0.9)) * (1 - ease(span(t, T.celeb + 0.6, T.fly + 0.2)));
      flash = Math.max(0, 1 - Math.abs(t - T.flash) / 0.35);
    }
    const lc = L ? L.cols : SHELL;
    let cols = { a: mixHex(SHELL.a, lc.a, 0.55 * hot), b: mixHex(SHELL.b, lc.b, 0.5 * hot) };
    const dull = dullAt();
    if (dull > 0) cols = { a: mixHex(cols.a, '#5E5A66', 0.7 * dull), b: mixHex(cols.b, '#5A6068', 0.7 * dull) };
    // the glass stays see-through while it works: the glow is around and at the rim, not a milky fill
    shellFrame(cols, 0.45 * (1 - 0.6 * dull) + 0.7 * react + 0.3 * flash, react);
    glass.aura.visible = react > 0.01 || flash > 0.01;
    if (glass.aura.visible) {
      glass.aura.material.color.set(L.aura).lerp(new Color(0xFFFFFF), 0.5 * flash);
      glass.aura.material.opacity = (0.3 * react + 0.18 * cK + 0.3 * flash) * (R0.agent ? 1 : 0.75);
      const ag = SR * (3.6 + 0.6 * cK + 0.3 * Math.sin(t * 1.6) * react); glass.aura.scale.set(ag, ag, 1);
    }
    const w = R0 ? span(t, R0.agent ? T.t0 + 0.8 : T.t0, R0.agent ? T.t0 + 1.45 : T.t0 + 0.65) : bounce ? span(t - bounce.t0, 0.8, 1.4) : 0;
    glass.wave.visible = w > 0 && w < 1;
    if (glass.wave.visible) { const ws = SR * (0.3 + 1.9 * ease(w)); glass.wave.scale.set(ws, ws, 1); glass.wave.material.opacity = (R0 ? 0.75 : 0.45) * (1 - w); glass.wave.material.color.set(R0 ? L.aura : 0x9A98A8); }
    const ex = R0 ? span(t, T.fly + 0.05, T.fly + 0.9) : 0; glass.bloom.visible = ex > 0 && ex < 1;
    if (glass.bloom.visible) { glass.bloom.position.copy(SPH).add(V(0, SR * 0.92, 0)); const bl = SR * (0.9 + 0.8 * ease(ex)); glass.bloom.scale.set(bl, bl * 0.7, 1); glass.bloom.material.opacity = 0.75 * Math.sin(ex * Math.PI); }
    void now;
  }
  // every letter upright and legible: hidden behind a nearer atom, and for a molecule behind the sphere (owner rule)
  const sp1 = V(0, 0, 0), sp2 = V(0, 0, 0);
  function lettersFace() {
    const { LW, LH } = host.frame(), HALF = Math.tan(cam.fov * Math.PI / 360), seen = [];
    const sc = SPH.clone().applyQuaternion(rig.quaternion).add(rig.position), [scx, scy] = proj(sc), sR = SR / (SPH.length() * HALF) * (LH / 2) + 6, far = SPH.length() + SR + 0.5;
    for (const m of mols.values()) {
      if (!m.g.visible) continue;
      for (const a of m.atoms) {
        a.ball.getWorldPosition(sp1); const d = sp1.distanceTo(cam.position), q = sp1.clone().project(cam);
        // the letter on its own atom's face toward you, in front of its sticks (as the Moleculator's): it was left at
        // the molecule's middle, so NaOH's three letters stacked on its oxygen and a lone atom's sat off its centre
        a.letter.position.copy(m.g.worldToLocal(sp2.copy(cam.position).sub(sp1).normalize().multiplyScalar(a.r * 0.8 * m.k * 1.7).add(sp1)));
        if (q.z > 1) { a.letter.visible = false; continue; }
        const x = (q.x + 1) / 2 * LW, y = (1 - q.y) / 2 * LH, r = (a.r * a.ball.scale.x * m.k) / (d * HALF) * (LH / 2);
        let hidden = a.ball.scale.x < 0.35 || r < 4;
        if (m.where === 'space' && d > far && Math.hypot(x - scx, y - scy) < sR) hidden = true;
        seen.push({ a, x, y, d, r, hidden });
      }
    }
    for (const A of seen) {
      let hidden = A.hidden;
      for (const B of seen) { if (hidden) break; if (B !== A && B.d < A.d - 0.05 && Math.hypot(A.x - B.x, A.y - B.y) < B.r * 0.92) hidden = true; }
      A.a.letter.visible = !hidden;
    }
  }
  function proj(p) { const { LW, LH } = host.frame(), v = p.clone().project(cam); return [(v.x + 1) / 2 * LW, (1 - v.y) / 2 * LH, v.z]; }

  /* ---------- THE 2D LAYER ----------
     The agents' names under their orbs, the two chances above them, a floating molecule's formula under it, and
     during a reaction its equation in place of the goals' names (the agent never over the arrow: the player
     works it out). */
  /* Each agent's name as lines: its name (two-word names wrap); and, if any two neighbours' names would meet (a 320-wide
     phone), every catalyst by its symbol instead (Pt, Fe, Ni, V₂O₅, MnO₂): the shorter form, never a cut word. */
  function agentNames(c) {
    const sp = AG.length > 1 ? AG[1].x - AG[0].x : 999, wrapAt = MODE === 'mobile' ? 88 : 120;
    const linesOf = (name) => { const w = name.split(' '); return c.measureText(name).width > wrapAt && w.length > 1 ? [w.slice(0, -1).join(' '), w[w.length - 1]] : [name]; };
    const widest = (lines) => Math.max(...lines.map((l) => c.measureText(l).width));
    const full = agents.map((a) => linesOf(X.AGENTS[a.name].short || X.AGENTS[a.name].name));
    const clash = (L) => L.some((l, i) => i > 0 && (widest(L[i - 1]) + widest(l)) / 2 + 6 > sp);
    return clash(full) ? agents.map((a, i) => (X.AGENTS[a.name].sym ? [X.AGENTS[a.name].sym] : full[i])) : full;
  }
  function hud(ctx, TOK) {
    const { LW } = host.frame();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // formulas under floating molecules in view
    ctx.font = '600 16px Inter, sans-serif';
    const { LH } = host.frame(), HALF = Math.tan(cam.fov * Math.PI / 360), k = ctx.getTransform().a;
    const sc = SPH.clone().applyQuaternion(rig.quaternion).add(rig.position), [scx, scy] = proj(sc), sR = SR / (SPH.length() * HALF) * (LH / 2), far = SPH.length() + SR + 0.5;
    for (const m of mols.values()) {
      if (m.where !== 'space' || m.anim || !m.g.visible) continue;
      const c = V(0, 0, 0); m.g.getWorldPosition(c); const [x, y, z] = proj(c); if (z > 1) continue;
      const d = c.distanceTo(cam.position), px = m.ext * m.k / (d * HALF) * (LH / 2);
      const ly = y + px + 14;
      if (x < -40 || x > LW + 40) continue;
      // under the dark fades at the top and the foot, the name goes as dark as its molecule
      // and once too faint to read (AA on the painted pixel, owner's rule), it is not drawn at all
      const a = 0.86 * (1 - Math.max(host.shade(y), host.shade(ly))); if (a < 0.6) continue;
      const text = X.SPECIES[m.key].formula;
      if (d > far && Math.hypot(x - scx, y - scy) < sR) {
        // seen through the sphere's frosted back, the name blurs as its molecule does (a shadow cast from off the canvas)
        ctx.save(); ctx.shadowColor = `rgba(255,255,255,${(a * 0.7).toFixed(3)})`; ctx.shadowBlur = 7 * k; ctx.shadowOffsetX = 4000 * k;
        ctx.fillStyle = '#fff'; ctx.fillText(text, x - 4000, ly); ctx.restore();
      } else { ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`; ctx.fillText(text, x, ly); }
    }
    // the agents' names, wrapped to two lines where they must be, or their symbols where neighbours would meet
    ctx.font = '600 16px Inter, sans-serif';
    agentNames(ctx).forEach((lines, i) => {
      const p = AG[i], a = agents[i]; if (!p) return;
      ctx.fillStyle = S.tried.has(a.name) ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.92)';     // tried: dimmer, still AA
      lines.forEach((ln, k) => ctx.fillText(ln, p.x, p.y + p.r + 16 + k * 19));
    });
    // two chances, as small orbs above the agents: a spent one goes dark
    const cy = (AG[0] ? AG[0].y - AG[0].r - 22 : 0), cx = LW / 2;
    for (let k = 0; k < X.CHANCES; k++) {
      const x = cx + (k - 0.5) * 22, live = k < S.chances;
      const g = ctx.createRadialGradient(x, cy, 0, x, cy, 8);
      g.addColorStop(0, live ? 'rgba(255,214,150,1)' : 'rgba(90,80,80,0.6)'); g.addColorStop(0.6, live ? 'rgba(255,140,60,0.8)' : 'rgba(60,50,50,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, cy, 8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.textAlign = 'left';
  }
  const eqNow = () => (run && tNow >= (run.agent ? run.T.t0 + 0.8 : run.T.t0) && tNow < run.T.fly ? run.eq : null);

  /* ---------- TAPS ----------
     An agent, then what waits, then what is in the sphere, then what floats in the space. */
  function hitAgent(p) { return AG.findIndex((a) => Math.hypot(p.x - a.x, p.y - a.y) < a.r + 10); }
  function hitMol(p, where) {
    let best = null;
    const { LH } = host.frame(), HALF = Math.tan(cam.fov * Math.PI / 360);
    for (const m of mols.values()) {
      if (m.where !== where || m.anim || !m.g.visible) continue;
      for (const a of m.atoms) {
        a.ball.getWorldPosition(sp1); const [x, y, z] = proj(sp1); if (z > 1) continue;
        const d = sp1.distanceTo(cam.position), r = Math.max(22, (a.r * 0.8 * m.k) / (d * HALF) * (LH / 2) * 1.4), e = Math.hypot(p.x - x, p.y - y);
        if (e < r && (!best || e < best.e)) best = { m, e };
      }
    }
    return best ? best.m : null;
  }
  function tap(p) {
    if (busy || S.result) return false;
    const ai = hitAgent(p); if (ai >= 0) { pickAgent(ai); return true; }
    for (const where of ['waiting', 'sphere', 'space']) { const m = hitMol(p, where); if (m) { tapMolecule(m.id); return true; } }
    return false;
  }
  // a press on something waiting can become a drag: let go away from the sphere and it is kept
  function pressWaiting(p) { if (busy || S.result) return null; const m = hitMol(p, 'waiting'); return m ? m.id : null; }
  function dropWaiting(id, p, dir) {
    const { LH } = host.frame(), sc = SPH.clone().applyQuaternion(rig.quaternion).add(rig.position), [x, y] = proj(sc), r = SR / (SPH.length() * Math.tan(cam.fov * Math.PI / 360)) * (LH / 2);
    if (Math.hypot(p.x - x, p.y - y) < r) tapMolecule(id); else keep(id, dir);
  }
  function dragWaiting(id, dirLocal) { const m = mols.get(id); if (m) { m.anim = null; m.pos.copy(dirLocal.multiplyScalar(D * 0.9)); } }

  const hintPlan = { v: -1, plan: null };
  /* ---------- THE PILOT (checks only) ----------
     What a careful player would do next: from the rules' own shortest plan, the next reaction; take out of the
     sphere what does not belong, put in what does (turning to it if it is not in view), then the agent. */
  function screenOf(m) { const c = V(0, 0, 0); m.g.getWorldPosition(c); const [x, y, z] = proj(c); return { x, y, z }; }
  function pilot(careless) {
    // the level is over only when its card shows (the harness says so): until then, wait
    if (S.result || busy || fadingOut.length) return { type: 'wait' };
    const counts = {}, owed = {};
    for (const p of S.pieces) if (['space', 'sphere', 'waiting'].includes(p.zone)) counts[p.key] = (counts[p.key] || 0) + 1;
    for (const t of S.targets) { const k = t.n - (S.made[t.key] || 0); if (k > 0) owed[t.key] = k; }
    const plan = X.bestPlan(counts, owed, S.agents).plan;
    if (!plan || !plan.length) return { type: 'stuck' };
    const r = plan[0], want = {}; for (const [k, n] of r.in) want[k] = n;
    const inside = S.pieces.filter((p) => p.zone === 'sphere');
    const have = {}; for (const p of inside) have[p.key] = (have[p.key] || 0) + 1;
    const extra = inside.find((p) => (have[p.key] || 0) > (want[p.key] || 0));
    const { LW, LH } = host.frame();
    const tapAt = (m) => { const s = screenOf(m); return { type: 'tap', pt: [s.x, s.y], id: m.id }; };
    if (extra) return tapAt(mols.get(extra.id));
    /* What waits and a later step needs is kept before this step starts (it would be lost): dragged away from the
       sphere, as a player does. What this step itself takes is tapped in below. */
    const later = {}; plan.slice(1).forEach((q) => q.in.forEach(([k, n]) => { later[k] = (later[k] || 0) + n; }));
    const takeNow = {}; for (const k of Object.keys(want)) takeNow[k] = Math.max(0, want[k] - (have[k] || 0));
    for (const p of S.pieces.filter((q) => q.zone === 'waiting')) {
      if (takeNow[p.key] > 0) { takeNow[p.key]--; continue; }
      if (later[p.key] > 0) {
        const m = mols.get(p.id), sc = screenOf(m);
        return { type: 'drag', pts: [sc.x, sc.y, sc.x < LW / 2 ? LW * 0.12 : LW * 0.88, LH * 0.32], keep: p.id };
      }
    }
    const missing = Object.keys(want).find((k) => (have[k] || 0) < want[k]);
    if (missing) {
      const w = S.pieces.find((p) => p.zone === 'waiting' && p.key === missing);
      if (w) return tapAt(mols.get(w.id));
      const f = S.pieces.find((p) => p.zone === 'space' && p.key === missing);
      if (!f) return { type: 'stuck' };
      const m = mols.get(f.id), s = screenOf(m);
      if (s.z < 1 && s.x > 40 && s.x < LW - 40 && s.y > 120 && s.y < (AG[0] ? AG[0].y - 70 : LH - 140)) return tapAt(m);
      // turn toward it: a drag that brings it to the middle of the view
      const dir = V(0, 0, 0); m.g.getWorldPosition(dir); dir.sub(cam.position).normalize().applyQuaternion(cam.quaternion.clone().invert());
      const yaw = Math.atan2(dir.x, -dir.z), pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) - 0.08;
      // the space follows the finger: to bring something on the right to the middle, drag left; something above, drag
      // down; a long turn as long a sweep as the screen allows, from one side across to the other
      const k = LH / (cam.fov * Math.PI / 180), dx = Math.max(-LW * 0.85, Math.min(LW * 0.85, -yaw * k)), dy = Math.max(-LH * 0.3, Math.min(LH * 0.3, pitch * k));
      return { type: 'drag', pts: [LW / 2 - dx / 2, LH * 0.4 - dy / 2, LW / 2 + dx / 2, LH * 0.4 + dy / 2] };
    }
    if (r.agent) {
      const name = careless ? S.agents[(Math.floor(tNow * 7)) % 4] : (S.agents.includes(r.agent) ? r.agent : r.also.find((a) => S.agents.includes(a)));
      const i = S.agents.indexOf(name), a = AG[i];
      return { type: 'tap', pt: [a.x, a.y], agent: name };
    }
    return { type: 'wait' };
  }

  return {
    start, step, draw, hud, tap, pressWaiting, dropWaiting, dragWaiting, pilot, layout, equation: eqNow,
    band: () => { if (!BAND) layout(); return BAND; },
    // the sphere, the agents with their names and the chances, on the screen (frame units): for the window sweep
    geom: () => {
      const { LH } = host.frame(), HALF = Math.tan(cam.fov * Math.PI / 360);
      const sc = SPH.clone().applyQuaternion(rig.quaternion).add(rig.position), [x, y] = proj(sc), r = SR / (SPH.length() * HALF) * (LH / 2);
      const c = document.createElement('canvas').getContext('2d'); c.font = '600 16px Inter, sans-serif';
      const names = agentNames(c);
      const ags = agents.map((a, i) => {
        const p = AG[i];
        return { x: p.x, y: p.y, r: p.r, lines: names[i].map((ln, k) => ({ text: ln, w: c.measureText(ln).width, y: p.y + p.r + 16 + k * 19 })) };
      });
      return { x, y, r, agents: ags, chancesY: AG[0] ? AG[0].y - AG[0].r - 22 : 0 };
    },
    // the frame changed size (full screen, or a phone turned): everything that rides with you moves to its new place
    relayout: () => {
      layout();
      if (!S || busy || run) return;
      for (const sl of sphereSlots()) { const m = mols.get(sl.id); if (m && !m.anim) { m.pos.copy(sl.p); m.k = sl.k; } }
      waits.forEach((id, j) => { const m = mols.get(id); if (m && !m.anim) { m.pos.copy(arcAt(j)); m.k = waitK(m); } });
    },
    state: () => S, busy: () => !!busy || !!run, clear, steps: () => steps.slice(),
    // where a new player's eye should go first: a molecule in view that the shortest way needs
    hintAt: () => {
      if (busy || run || S.result) return null;
      const { LW, LH } = host.frame(), counts = {}, owed = {};
      for (const p of S.pieces) if (p.zone === 'space' || p.zone === 'sphere' || p.zone === 'waiting') counts[p.key] = (counts[p.key] || 0) + 1;
      for (const t of S.targets) { const k = t.n - (S.made[t.key] || 0); if (k > 0) owed[t.key] = k; }
      // the plan once for each state of the rules, not every frame
      if (hintPlan.v !== S.version) { hintPlan.v = S.version; hintPlan.plan = X.bestPlan(counts, owed, S.agents).plan; }
      const plan = hintPlan.plan; if (!plan || !plan.length) return null;
      for (const [key] of plan[0].in) for (const m of mols.values()) {
        if (m.key !== key || m.where !== 'space' || m.anim) continue;
        const sc = screenOf(m); if (sc.z > 1 || sc.x < 0 || sc.x > LW || sc.y < 0 || sc.y > LH) continue;
        const c = V(0, 0, 0); m.g.getWorldPosition(c);
        const r = m.ext * m.k / (c.distanceTo(cam.position) * Math.tan(cam.fov * Math.PI / 360)) * (LH / 2);
        return { x: sc.x, y: sc.y, r };
      }
      return null;
    },
    // an agent's orb as a picture, for the card
    agentImage: (name, S2 = 192) => { const cv = Object.assign(document.createElement('canvas'), { width: S2, height: S2 }); const L = LOOK[name];
      paintShell(cv.getContext('2d'), S2, { cols: L.cols, R: 0.36, body: 0.5, outer: 0.45, inside: (q, c, R) => { const off = insideOf(name, 1.3), k = R / (0.47 * S2) * 1.15; q.drawImage(off, c - S2 * k / 2, c - S2 * k / 2, S2 * k, S2 * k); } }); return cv; },
    // for checks and frames only: the same moves a tap makes
    put: (id) => tapMolecule(id), agent: (name) => pickAgent(S.agents.indexOf(name)),
    // the cover: no agent orbs at the bottom (the agent in use still shows in the sphere)
    setCover: (on) => { cover = on; },
    // the card's steps as the shortest way would take them (checks only: to measure every level's card unplayed)
    planSteps: () => { const counts = {}, owed = {}; for (const p of S.pieces) counts[p.key] = (counts[p.key] || 0) + 1; for (const t of S.targets) owed[t.key] = t.n;
      steps = (X.bestPlan(counts, owed, S.agents).plan || []).map((r) => ({ r, agent: r.agent ? (S.agents.includes(r.agent) ? r.agent : r.also.find((a) => S.agents.includes(a))) : null })); return steps.length; },
    molecules: () => [...mols.values()].map((m) => { const s = screenOf(m); return { id: m.id, key: m.key, where: m.where, x: Math.round(s.x), y: Math.round(s.y), z: +s.z.toFixed(3) }; }),
    agentsAt: () => AG.map((a, i) => ({ name: agents[i] && agents[i].name, x: a.x, y: a.y, r: a.r })),
  };
};
})();
