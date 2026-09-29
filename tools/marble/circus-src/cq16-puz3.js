/* THE CIRCUS PUZZLES, the two to find a way through:
     tickets  golden tickets lie about the square, one to a board; roll over one to pick it up (the number over the
              marble is how many you hold). A turnstile in a doorway (a cabinet and a red and white arm across it)
              takes the tickets on its sign once, from either side, and its arm lifts and stays up; the way out is a turnstile too. There are never enough tickets for every
              turnstile: pay for the right ones, in an order that gets you to the tickets behind them. Roll into a
              turnstile and lean on it to pay. Short: it buzzes. Wrong ones paid: the pad by the road puts it back
      mirrors  getting out of the house of mirrors (the owner's own). A striped roof over the whole maze, and you see
              only through the hole round the marble; the walls are mirrors, and some doorways are glass you cannot
              see until you bump into it (it cracks, so you know it next time). Find the way out */
const CZ_TKT_L = { t: { ticket: 1 } };
for (let k = 1; k <= 5; k++) CZ_TKT_L[k] = { czturn: k };
const CZ_MIR_L = { '=': CZG, g: { czglass: 1 } };

function czKit3() {
  const Z = czKit2(); if (Z.ticket) return Z;
  const std = (o) => keepMat(hazed(new MeshStandardMaterial({ roughness: 0.35, metalness: 0.5, envMap: Z.K.env, envMapIntensity: 0.9, ...o })));
  const ticketT = canvasTex(256, 128, (g) => {            // a golden ticket: ADMIT ONE, a star, a perforated stub
    g.clearRect(0, 0, 256, 128);
    g.fillStyle = '#F2C230'; UI.roundRectPath(g, 6, 10, 244, 108, 12); g.fill();
    g.strokeStyle = INK; g.lineWidth = 5; UI.roundRectPath(g, 6, 10, 244, 108, 12); g.stroke();
    g.fillStyle = '#FFF1D2'; g.fillRect(24, 26, 150, 76); g.fillStyle = '#E8303A'; cqStar(g, 214, 64, 26, 11); g.fill();
    g.setLineDash([6, 6]); g.beginPath(); g.moveTo(186, 14); g.lineTo(186, 114); g.stroke(); g.setLineDash([]);
    g.fillStyle = INK; g.font = '800 30px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ADMIT', 99, 50); g.fillText('ONE', 99, 82);
  });
  const roofT = canvasTex(256, 256, (g) => {              // the house of mirrors' roof: striped canvas, stars, a scalloped seam
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#FFF1D2' : '#6A2A9A'; g.fillRect(i * 32, 0, 32, 256); }
    const r = seeded(4); g.fillStyle = '#F2C230'; for (let i = 0; i < 10; i++) { cqStar(g, r() * 256, r() * 256, 9, 4); g.fill(); }
  }, true);
  const crackT = canvasTex(128, 128, (g) => {             // glass, cracked where you hit it
    g.clearRect(0, 0, 128, 128); g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 2.5; const r = seeded(12);
    for (let k = 0; k < 9; k++) { g.beginPath(); g.moveTo(64, 64); let x = 64, y = 64; const a = k * TAU / 9 + r() * 0.4; for (let s = 0; s < 4; s++) { x += Math.cos(a + (r() - 0.5) * 0.6) * 16; y += Math.sin(a + (r() - 0.5) * 0.6) * 16; g.lineTo(x, y); } g.stroke(); }
    g.beginPath(); g.arc(64, 64, 14, 0, TAU); g.stroke(); g.beginPath(); g.arc(64, 64, 32, 0.4, 2.2); g.stroke();
  });
  return Object.assign(Z, {
    ticket: keepMat(new MeshBasicMaterial({ map: ticketT, transparent: true, side: DoubleSide, depthWrite: false })),
    mirror: std({ color: 0xE8F0FF, metalness: 1, roughness: 0.04, envMapIntensity: 1.6 }),
    glass: keepMat(new MeshStandardMaterial({ color: 0xCFF4FF, metalness: 0.9, roughness: 0.05, envMap: Z.K.env, envMapIntensity: 1.2, transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide })),
    crack: crackT, roofT,
    arm: std({ color: 0xE8303A, metalness: 0.6, roughness: 0.25 }),
  });
}
const czHeldTex = {};
function czHeldTexOf(n) {                                  // over the marble: a ticket and how many you hold
  return czHeldTex[n] || (czHeldTex[n] = canvasTex(192, 96, (g) => {
    g.clearRect(0, 0, 192, 96);
    g.fillStyle = 'rgba(26,14,40,0.82)'; UI.roundRectPath(g, 4, 8, 184, 80, 30); g.fill();
    g.fillStyle = '#F2C230'; UI.roundRectPath(g, 20, 26, 70, 44, 8); g.fill(); g.fillStyle = '#E8303A'; cqStar(g, 55, 48, 13, 6); g.fill();
    g.fillStyle = '#FFFFFF'; g.font = '800 46px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 138, 50);
  }));
}
const czPriceTex = {};
function czPriceTexOf(n, paid) {                           // a turnstile's sign: a ticket and its price, or a tick once paid
  const k = paid ? 'ok' : n;
  return czPriceTex[k] || (czPriceTex[k] = canvasTex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = paid ? '#2AA89A' : '#F2C230'; pbCircle(g, 64, 64, 62); g.fill(); g.fillStyle = '#FFF1D2'; pbCircle(g, 64, 64, 52); g.fill();
    if (paid) { g.strokeStyle = '#2AA89A'; g.lineWidth = 14; g.lineCap = 'round'; g.beginPath(); g.moveTo(36, 66); g.lineTo(56, 86); g.lineTo(94, 42); g.stroke(); return; }
    g.fillStyle = '#F2C230'; UI.roundRectPath(g, 18, 28, 34, 24, 4); g.fill(); g.strokeStyle = INK; g.lineWidth = 3; UI.roundRectPath(g, 18, 28, 34, 24, 4); g.stroke();
    g.fillStyle = INK; g.font = '800 64px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 76, 76);
  }));
}

// An edge of a square that is a circus thing, not a gate: a turnstile, or a pane of glass.
function czEdge(P, e, x, z, alongX, ek) {
  const Z = czKit3(), span = CELL - WALL_T, grp = new Group(); grp.position.set(x, P.y, z); if (!alongX) grp.rotation.y = Math.PI / 2; levelGroup.add(grp);
  const g = { P, e, ek, cz: true, x, z, alongX, state: 'shut', open: 0, flash: 0, buzzT: 0, pushT: 0, grp };
  if (e.czturn) {
    g.kind = 'czturn'; g.price = e.czturn;
    const B = pbBuild();                                   // the stand at one side: a tin cabinet, a gold cap
    B.geo(new BoxGeometry(0.36, 0.95, 0.5), placeAt(-span / 2 + 0.2, 0.475, 0), 0xE8303A);
    B.geo(new BoxGeometry(0.42, 0.08, 0.56), placeAt(-span / 2 + 0.2, 0.99, 0), 0xF2C230);
    B.geo(new CylinderGeometry(0.1, 0.1, 0.12, 12), placeAt(-span / 2 + 0.44, 0.62, 0, 0, 0, Math.PI / 2), 0xF2C230);
    const stand = new Mesh(B.done(), Z.K.paint); stand.castShadow = true; grp.add(stand);
    g.arms = new Group(); g.arms.position.set(-span / 2 + 0.44, 0.62, 0); grp.add(g.arms);   // the arm across the doorway, red and white, lifting once paid
    const L = span - 0.5, arm = new Mesh(new CylinderGeometry(0.06, 0.06, L, 10), Z.arm); arm.rotation.z = Math.PI / 2; arm.position.x = L / 2; arm.castShadow = true; g.arms.add(arm);
    for (let k = 1; k <= 3; k++) { const band = new Mesh(new CylinderGeometry(0.065, 0.065, 0.14, 10), Z.PK.cream); band.rotation.z = Math.PI / 2; band.position.x = L * k / 4; g.arms.add(band); }
    g.signMat = new SpriteMaterial({ map: czPriceTexOf(g.price, false), transparent: true, depthWrite: false });
    const sign = new Sprite(g.signMat); sign.scale.set(0.8, 0.8, 1); sign.position.set(-span / 2 + 0.2, 1.5, 0); grp.add(sign); g.sign = sign;
    if (ek === 'H' + P.pc.exit + ',' + P.rows) P.spz.exitTurn = g;   // the way out
  } else {
    g.kind = 'czglass';
    const pane = new Mesh(new BoxGeometry(span, 1.4, 0.04), Z.glass); pane.position.y = 0.7; grp.add(pane);
    g.crackMat = new MeshBasicMaterial({ map: Z.crack, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide });
    const crack = new Mesh(new PlaneGeometry(1.2, 1.2), g.crackMat); crack.position.set(0, 0.6, 0.03); grp.add(crack);
  }
  const q = new Quaternion(), box = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), HIDDEN); box.visible = false; levelGroup.add(box);
  colliders.push({ mesh: box, pos: new Vector3(x, P.y + 0.7, z), prev: new Vector3(x, P.y + 0.7, z), quat: q, inv: q.clone(), gate: g,
                   half: alongX ? new Vector3(span / 2, 0.7, 0.1) : new Vector3(0.1, 0.7, span / 2), delta: new Vector3(), ferry: null, holo: null, pad: null, obstacle: 'gate' });
  (P.czEdges = P.czEdges || []).push(g);
}
// Touching one (n: out of it, toward the marble): a turnstile takes its tickets if you lean into it, and a pane cracks.
function czTouch(g, n) {
  const P = g.P, S = P.spz;
  if (g.kind === 'czglass') { if (!g.cracked) { g.cracked = 1; sound('knock'); } g.flash = 1; return; }
  if (g.state !== 'shut' || !S) return;
  const lean = -(ball.in[0] * n.x + ball.in[1] * n.z), hit = -(ball.v.x * n.x + ball.v.z * n.z);
  g.pushT = lean > 0.45 ? g.pushT + STEP : 0;
  if (hit < 1.4 && g.pushT < 0.12) return;
  g.pushT = 0;
  if (S.held >= g.price) {                                 // paid: it turns once, and stays open
    S.held -= g.price; g.state = 'open'; g.spin = 0; g.signMat.map = czPriceTexOf(g.price, true); g.signMat.needsUpdate = true;
    sound('key'); burst(g.x, P.y + 1.2, g.z, 0xF2C230, 12, 2.4);
    if (g === S.exitTurn) S.done = true;
  } else if (g.buzzT <= 0) { g.buzzT = 0.45; g.flash = 1; sound('buzz'); }
}

function czBuild3(P) {
  const S = P.spz, Z = czKit3(), G = P.grid;
  if (S.kind === 'tickets') {
    S.tickets = []; S.held = 0;
    for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {
      if (!G.cells[r][c].ticket) continue;
      const m = new Mesh(new PlaneGeometry(1.1, 0.55), Z.ticket); m.position.set(P.X(c), P.y + 0.7, P.Z(r)); m.rotation.x = -0.9; levelGroup.add(m);
      const glow = spDisc(P.X(c), P.y + 0.02, P.Z(r), 0.8, keepMat(new MeshBasicMaterial({ map: pbGlow(), color: 0xFFD860, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false, toneMapped: false })));
      levelGroup.add(glow); S.tickets.push({ c, r, m, glow, taken: false, fly: -1 });
    }
    S.badge = new Sprite(new SpriteMaterial({ map: czHeldTexOf(0), transparent: true, depthWrite: false, depthTest: false })); S.badge.scale.set(1.4, 0.7, 1); S.badge.renderOrder = 5; S.badge.visible = false; levelGroup.add(S.badge);
    S.shownHeld = 0;
  }
  if (S.kind === 'mirrors') {
    // The maze's walls are mirrors, twice as tall as a square's (to the eye: the marble still stops at the wall it always did).
    for (const c of colliders) {
      if (c.obstacle !== 'wall' || c.pos.x < P.x0 - 0.3 || c.pos.x > P.x0 + P.cols * CELL + 0.3 || c.pos.z > P.z0 + 0.3 || c.pos.z < P.z0 - P.rows * CELL - 0.3 || Math.abs(c.pos.y - P.y - WALL_H / 2) > 0.05) continue;
      c.mesh.userData.cz = true; c.mesh.material = Z.mirror; c.mesh.scale.y = 1.4 / WALL_H; c.mesh.position.y = P.y + 0.7;
    }
    // The roof, and the hole in it where the marble is (worked out each frame along the line from the marble to the camera).
    const W = P.cols * CELL, D = P.rows * CELL, yr = P.y + 1.75;
    const mat = keepMat(new MeshStandardMaterial({ map: Z.roofT, roughness: 0.6, metalness: 0.2, envMap: Z.K.env, envMapIntensity: 0.5, emissive: 0xFFFFFF, emissiveMap: Z.roofT, emissiveIntensity: 0.25 }));
    Z.roofT.repeat.set(W / 4, D / 4);
    const U = { uHole: { value: new Vector3(0, -99, 0) }, uR: { value: 2.3 } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCzW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCzW = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCzW;\nuniform vec3 uHole;\nuniform float uR;')
        .replace('void main() {', 'void main() {\n  if (distance(vCzW.xz, uHole.xz) < uR) discard;');
    };
    mat.customProgramCacheKey = () => 'czroof';
    const roof = new Mesh(new PlaneGeometry(W + 0.3, D + 0.3), mat); roof.rotation.x = -Math.PI / 2; roof.position.set(P.x0 + W / 2, yr, P.z0 - D / 2); roof.renderOrder = 2; levelGroup.add(roof);
    const rim = new Mesh(new RingGeometry(2.3, 2.45, 48), keepMat(new MeshBasicMaterial({ color: 0xF2C230, toneMapped: false }))); rim.rotation.x = -Math.PI / 2; levelGroup.add(rim);
    Object.assign(S, { roof, rim, U, yr, x1: P.x0 + W, z1: P.z0 - D });
    const B = pbBuild();                                   // bulbs round the roof's edge
    for (let i = 0; i <= 2 * (P.cols + P.rows); i++) {
      const u = i / (2 * (P.cols + P.rows)), per = 2 * (W + D), d = u * per;
      const [bx, bz] = d < W ? [P.x0 + d, P.z0] : d < W + D ? [P.x0 + W, P.z0 - (d - W)] : d < 2 * W + D ? [P.x0 + W - (d - W - D), P.z0 - D] : [P.x0, P.z0 - D + (d - 2 * W - D)];
      B.geo(new SphereGeometry(0.09, 8, 6), placeAt(bx, yr + 0.05, bz), 0xFFE8A0);
    }
    levelGroup.add(new Mesh(B.done(), Z.K.lit));
  }
}
function czPad3(P, c, r, cell) {
  const S = P.spz;
  if (S.kind === 'tickets' && cell.ticket) {
    const T = S.tickets.find((q) => q.c === c && q.r === r);
    if (T && !T.taken) { T.taken = true; T.fly = 0; S.held++; sound('tick'); }
  }
}
function czStep3(P) {
  const S = P.spz;
  if (S.kind === 'mirrors' && !S.done) {
    const c = Math.floor((ball.p.x - P.x0) / CELL), r = Math.floor((P.z0 - ball.p.z) / CELL);
    if (c === P.pc.exit && r === P.rows - 1) { S.done = true; sound('unlock'); }
  }
  for (const g of P.gates) if (g.kind === 'space') g.state = 'open';   // the house of mirrors' curtain is open: finding it is the puzzle
  for (const g of P.czEdges || []) { g.buzzT = Math.max(0, g.buzzT - STEP); }
}
function czReset3(P, quiet) {
  const S = P.spz; let moved = false;
  if (S.kind === 'tickets') {
    if (S.held || S.tickets.some((T) => T.taken)) moved = true;
    S.held = 0; S.done = false;
    for (const T of S.tickets) { T.taken = false; T.fly = -1; T.m.visible = true; T.glow.visible = true; T.m.scale.setScalar(1); }
    for (const g of P.czEdges || []) if (g.kind === 'czturn' && g.state === 'open') { moved = true; g.state = 'shut'; g.signMat.map = czPriceTexOf(g.price, false); g.signMat.needsUpdate = true; g.spin = 0; g.arms.rotation.z = 0; }
  }
  if (S.kind === 'mirrors' && quiet) S.done = false;       // (the cracks stay: you found that glass)
  return moved;
}
function czLanded3() {}
function czAnimate3(P, dt) {
  const S = P.spz;
  for (const g of P.czEdges || []) {
    g.flash = Math.max(0, g.flash - dt * 2.5);
    if (g.kind === 'czglass') { g.crackMat.opacity = g.cracked ? 0.85 : 0; continue; }
    if (g.state === 'open') {                              // paid: the arm swings up
      g.spin = Math.min(1, (g.spin || 0) + dt / 0.5); g.arms.rotation.z = Math.PI / 2 * ease(g.spin);
    }
    g.sign.scale.setScalar(0.8 * (1 + 0.25 * g.flash)); g.signMat.color.setHex(g.flash > 0.05 ? 0xFF8A7A : 0xFFFFFF);
  }
  if (S.kind === 'tickets') {
    for (const T of S.tickets) {
      if (T.fly >= 0) {                                    // taken: into the marble
        T.fly = Math.min(1, T.fly + dt / 0.3); const u = ease(T.fly);
        T.m.position.lerp(marble.position, u); T.m.scale.setScalar(Math.max(0.01, 1 - u)); T.glow.visible = false;
        if (T.fly >= 1) { T.m.visible = false; T.fly = -1; }
        continue;
      }
      if (!T.taken) { T.m.position.y = P.y + 0.7 + (REDUCED ? 0 : 0.08 * Math.sin(simT * 2.4 + T.c + T.r)); T.m.position.x = P.X(T.c); T.m.position.z = P.Z(T.r); }
    }
    const inside = ball.p.x > P.x0 - 1 && ball.p.x < P.x0 + P.cols * CELL + 1 && ball.p.z < P.z0 + 1.5 && ball.p.z > P.z0 - P.rows * CELL - 1;
    S.badge.visible = inside && state === 'play';
    if (S.shownHeld !== S.held) { S.shownHeld = S.held; S.badge.material.map = czHeldTexOf(S.held); S.badge.material.needsUpdate = true; }
    S.badge.position.set(marble.position.x, marble.position.y + 1.15, marble.position.z);
  }
  if (S.kind === 'mirrors') {
    const m = marble.position, cp = camera.position, k = (S.yr - m.y) / Math.max(0.1, cp.y - m.y);
    const hx = m.x + (cp.x - m.x) * k, hz = m.z + (cp.z - m.z) * k, near = m.x > P.x0 - 3 && m.x < S.x1 + 3 && m.z < P.z0 + 4 && m.z > S.z1 - 3;
    S.U.uHole.value.set(hx, S.yr, hz); S.rim.position.set(hx, S.yr + 0.01, hz); S.rim.visible = near;
    if (!near) S.U.uHole.value.y = -99, S.U.uHole.value.x = 1e5;
  }
}
function czState3(P, o) {
  const S = P.spz;
  if (S.kind === 'tickets') Object.assign(o, { held: S.held, tickets: S.tickets.map((T) => [T.c, T.r, T.taken ? 1 : 0]),
    turns: (P.czEdges || []).filter((g) => g.kind === 'czturn').map((g) => ({ ek: g.ek, price: g.price, open: g.state === 'open', exit: g === S.exitTurn })) });
  if (S.kind === 'mirrors') Object.assign(o, { glass: (P.czEdges || []).filter((g) => g.kind === 'czglass').map((g) => g.ek) });
  return o;
}
for (const k of ['tickets', 'mirrors']) { CZ_KINDS.add(k); CZ_PARTS[k] = { build: czBuild3, pad: czPad3, step: czStep3, reset: czReset3, landed: czLanded3, animate: czAnimate3, state: czState3 }; }
