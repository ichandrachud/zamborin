
/* THE CIRCUS OBSTACLES, the first five (owner, 2026-09-29: human cannon, trapeze, high wire, rings of fire, juggler,
   knife wheel, teeterboard, Wheel of Death, "Clown that throws balls at you", "clown car that chases you", the Ferris
   wheel over a broken rail, a roller coaster, a carousel, a house of mirrors). These five first, each with its own
   try-out course (#try-fire, #try-juggler, #try-knives, #try-cannon, #try-thrower; all five on #try-circus), easy to hard:
     rings of fire   flaming hoops set into the rail, their lower arc through a slot in it: roll through the middle;
                     later ones slide from side to side. Touching the flames sends you back.
     juggler         a giant juggler beside the rail bounces balls on a row of spots across it, left to right and back;
                     a ring on each spot closes as its ball comes down. Under a ball, you are sent back.
     knife wheel     a target wheel stands across the rail, turning, holes cut in it near its rim: roll through a hole
                     as it comes round at the bottom. Its face bristles with knives: touch it and you are sent back.
     human cannon    the rail ends in a cannon swinging from side to side over a gap; roll in, and it fires you where it
                     points. A spot on the net beyond shows where that is; go in when it is on the net.
     ball thrower    a clown beside the rail throws big balls at where you are going; a ring marks where each will land.
                     Change your pace after he throws. A ball knocks you off.
   A try-out course is laid by circLay from TRY_CIRCUS, as spaceLay lays the machine's. */
const circ = { rings: [], juggles: [], wheels: [], cannons: [], throwers: [] };
function circReset() { for (const k in circ) circ[k] = []; ball.circ = null; }
const TRY_CIRCUS = {
  fire: [{ t: 'fring', r: 1.5, ft: 0.12 }, { t: 'fring', r: 1.45, ft: 0.13, slide: 1.15, period: 3.6 }, { t: 'fring', r: 1.4, ft: 0.14, slide: 1.25, period: 3.0, twin: 3.4 }],
  juggler: [{ t: 'juggle', n: 3, period: 3.4, rows: 1 }, { t: 'juggle', n: 4, period: 3.0, rows: 1 }, { t: 'juggle', n: 4, period: 2.7, rows: 2 }],
  knives: [{ t: 'kwheel', holes: 4, rh: 0.82, spin: 0.55 }, { t: 'kwheel', holes: 3, rh: 0.78, spin: 0.7 }, { t: 'kwheel', holes: 3, rh: 0.76, spin: 0.85, twin: 1 }],
  cannon: [{ t: 'cannon', gap: 5, netW: 3.6, swing: 0.3, period: 3.6 }, { t: 'cannon', gap: 6.5, netW: 3.1, swing: 0.4, period: 3.0 }, { t: 'cannon', gap: 8, netW: 2.7, swing: 0.48, period: 2.6 }],
  thrower: [{ t: 'thrower', period: 3.4, flight: 1.25, L: 12 }, { t: 'thrower', period: 2.8, flight: 1.1, L: 14 }, { t: 'thrower', period: 2.3, flight: 1.0, L: 16 }],
};
TRY_CIRCUS.circus = [TRY_CIRCUS.fire[1], TRY_CIRCUS.juggler[1], TRY_CIRCUS.knives[1], TRY_CIRCUS.cannon[1], TRY_CIRCUS.thrower[1]];
Object.assign(TRY_COURSES, { fire: [], juggler: [], knives: [], cannon: [], thrower: [], circus: [] });
Object.assign(TRY_TITLES, { fire: 'RINGS OF FIRE', juggler: 'THE JUGGLER', knives: 'THE KNIFE WHEEL', cannon: 'THE HUMAN CANNON', thrower: 'THE BALL THROWER', circus: 'CIRCUS OBSTACLES' });
Object.assign(TRY_NEWS, {
  fire: 'Rings of fire. Roll through the middle; the flames send you back',
  juggler: 'The juggler bounces balls on the rail. Cross behind the last one',
  knives: 'The knife wheel turns. Roll through a hole as it comes round at the bottom; the face has knives',
  cannon: 'Roll into the cannon when its spot is on the net across the gap',
  thrower: 'The clown throws at where you are going. Change your pace after he throws',
  circus: 'The circus: rings of fire, the juggler, the knife wheel, the human cannon and the ball thrower',
});
const cr2 = (v) => Math.round(v * 100) / 100;           // metres to the centimetre, as the courses are laid
const FRING_H0 = 0.5, JUG_BALL = 0.45, KW_TH = 0.22, CAN_EL = 0.62, CAN_L = 3.2, THROW_BALL = 0.6;
// Lay one obstacle at the course's end (x, y, z runs on toward -z); returns how far it runs.
function circLay(spec, pieces, x, y, z) {
  const rail = (w, L) => pieces.push(F(x, cr2(z - L / 2), w, L, y));
  if (spec.t === 'fring') {
    const L = spec.twin ? 6 + spec.twin : 6; rail(3.2, L);
    pieces.push({ ...spec, x, z: cr2(z - 3), y, w: 3.2, d: 0.4, phase: 0 });
    if (spec.twin) pieces.push({ ...spec, x, z: cr2(z - 3 - spec.twin), y, w: 3.2, d: 0.4, phase: Math.PI, twin: 0 });
    return L;
  }
  if (spec.t === 'juggle') {
    const L = 6 + (spec.rows - 1) * 4.5; rail(3.4, L);
    for (let k = 0; k < spec.rows; k++) pieces.push({ ...spec, x, z: cr2(z - 3 - k * 4.5), y, w: 3.4, d: 1.2, side: k % 2 ? 1 : -1, phase: k * 0.9 });
    return L;
  }
  if (spec.t === 'kwheel') {
    const L = spec.twin ? 10 : 6; rail(3.4, L);
    pieces.push({ ...spec, x, z: cr2(z - 3), y, w: 3.4, d: 0.4, dir: 1, phase: 0 });
    if (spec.twin) pieces.push({ ...spec, x, z: cr2(z - 7), y, w: 3.4, d: 0.4, dir: -1, phase: 0.7, twin: 0 });
    return L;
  }
  if (spec.t === 'cannon') {
    pieces.push(F(x, cr2(z - 2.5), 2.6, 5, y));                                    // the run-up, into the breech
    const zb = cr2(z - 5), land = cr2(zb - spec.gap - 2);
    pieces.push(F(x, land, spec.netW, 4, y));                                     // the net beyond the gap
    pieces.push({ ...spec, x, z: zb, y, w: 3, d: 1, land, phase: 0 });
    return 5 + spec.gap + 4;
  }
  if (spec.t === 'thrower') {
    rail(3.4, spec.L);
    pieces.push({ ...spec, x, z: cr2(z - spec.L / 2), y, w: 3.4, d: spec.L, side: 1, phase: 0.8 });
    return spec.L;
  }
  return circLay2(spec, pieces, x, y, z);
}
let cqFlameMemo = null;
const cqFlameTex = () => cqFlameMemo || (cqFlameMemo = canvasTex(64, 64, (g) => {   // a lick of flame: white at its root, orange out to nothing
  const rg = g.createRadialGradient(32, 40, 2, 32, 34, 30);
  rg.addColorStop(0, 'rgba(255,255,230,1)'); rg.addColorStop(0.3, 'rgba(255,200,80,0.9)'); rg.addColorStop(0.65, 'rgba(255,90,20,0.45)'); rg.addColorStop(1, 'rgba(255,40,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
}));
const circMat = () => { const K = cqKit(cqLook); return { K, PK: cqPieceKit(cqLook) }; };

// ---- RINGS OF FIRE ----
function buildFring(pc) {
  const { K, PK } = circMat(), grp = new Group(), cy = pc.y + FRING_H0;
  grp.position.set(pc.x, cy, pc.z);
  const B = pbBuild();
  B.geo(new TorusGeometry(pc.r, 0.07, 8, 64), placeAt(0, 0, 0), 0x8A1A20);            // the hoop of tin under the flames
  for (let k = 0; k < 16; k++) { const a = k * TAU / 16; B.geo(new TorusGeometry(0.1, 0.035, 5, 10), placeAt(Math.cos(a) * pc.r, Math.sin(a) * pc.r, 0, 0, 0, a), 0xF2C230); }
  grp.add(new Mesh(B.done(), K.metal));
  const n = 110, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), seed = [];
  for (let i = 0; i < n; i++) { const a = i / n * TAU; seed.push([a, Math.random() * 7, 0.5 + Math.random() * 0.5]); }
  const geo = new BufferGeometry(); geo.setAttribute('position', new Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  const flames = new Points(geo, new PointsMaterial({ size: 0.55, map: cqFlameTex(), vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  flames.frustumCulled = false; grp.add(flames);
  const glow = new Mesh(new TorusGeometry(pc.r, pc.ft + 0.16, 8, 64), glowMat(0xFF7A2A, 0.35)); grp.add(glow);
  levelGroup.add(grp);
  if (pc.slide) {                                          // the slot the hoop runs along
    const slot = new Mesh(new BoxGeometry(2 * (pc.slide + pc.r) + 0.3, 0.02, 0.2), new MeshBasicMaterial({ color: 0x1A0E0A }));
    slot.position.set(pc.x, pc.y + 0.012, pc.z); levelGroup.add(slot);
  }
  circ.rings.push({ pc, grp, geo, seed, flames, glow, x: pc.x, y: cy, z: pc.z });
}
const fringX = (F, t) => F.pc.x + (F.pc.slide ? F.pc.slide * Math.sin(TAU * t / F.pc.period + F.pc.phase) : 0);
function fringStep() {
  for (const F of circ.rings) {
    const dz = ball.p.z - F.z; if (Math.abs(dz) > 1) continue;
    const dx = ball.p.x - fringX(F, simT), dy = ball.p.y - F.y, rho = Math.hypot(dx, dy);
    if (Math.hypot(rho - F.pc.r, dz) < R + F.pc.ft - 0.02) {   // in the flames: a puff of smoke, back to the last ring
      burst(ball.p.x, ball.p.y, ball.p.z, 0xFF7A2A, 26, 4); burst(ball.p.x, ball.p.y + 0.3, ball.p.z, 0x5A4A40, 14, 2);
      sound('bomb'); shake = Math.max(shake, 0.25); ball.v.set(0, 0, 0); startFall(); return;
    }
  }
}

// ---- THE JUGGLER ----
// A row of spots across the rail; a ball comes down on them in turn, left to right and back, each thrown up from the
// juggler's hand a second before and caught a second after.
function jugTimes(J) { const n = J.pc.n, m = Math.max(1, 2 * n - 2); return { m, dt: J.pc.period / m, order: Array.from({ length: m }, (_, k) => (k < n ? k : 2 * n - 2 - k)) }; }
function buildJuggle(pc) {
  const { K } = circMat(), J = { pc, spots: [], z: pc.z, y: pc.y };
  const hx = pc.x + pc.side * (pc.w / 2 + 2.6);
  J.hand = new Vector3(hx - pc.side * 0.8, pc.y + 4.6, pc.z);
  const man = new Mesh(cqCellGeo(3, 6), K.figs); man.position.set(hx, pc.y - 0.4, pc.z + 0.3); levelGroup.add(man);
  const drum = new Mesh(new CylinderGeometry(1.3, 1.4, 0.6, 24), cqPieceKit(cqLook).red); drum.position.set(hx, pc.y - 0.7, pc.z + 0.3); levelGroup.add(drum);
  for (let i = 0; i < pc.n; i++) {
    const sx = pc.x - pc.w / 2 + (i + 0.5) * pc.w / pc.n;
    const spot = new Mesh(new RingGeometry(0.46, 0.56, 32), new MeshBasicMaterial({ color: 0xFFF1D2, toneMapped: false, transparent: true, opacity: 0.8 }));
    spot.rotation.x = -Math.PI / 2; spot.position.set(sx, pc.y + 0.015, pc.z); levelGroup.add(spot);
    const warn = new Mesh(new RingGeometry(0.9, 1.0, 32), new MeshBasicMaterial({ color: 0xFF2A20, toneMapped: false, transparent: true, opacity: 0 }));
    warn.rotation.x = -Math.PI / 2; warn.position.set(sx, pc.y + 0.02, pc.z); levelGroup.add(warn);
    J.spots.push({ x: sx, spot, warn });
  }
  J.balls = new InstancedMesh(new IcosahedronGeometry(JUG_BALL, 2), new MeshStandardMaterial({ roughness: 0.3, metalness: 0.2 }), 6);
  const cols = [0xE8303A, 0x2A6AE8, 0xF2C230, 0x2AA86A, 0xFF8AD8, 0xFFFFFF];
  for (let i = 0; i < 6; i++) J.balls.setColorAt(i, new Color(cols[i]));
  J.balls.frustumCulled = false; levelGroup.add(J.balls);
  circ.juggles.push(J);
}
// Where each ball in the air is now (hand, spot, hand), and whether it is down on the rail.
function jugBalls(J, t) {
  const { m, dt, order } = jugTimes(J), out = [], k0 = Math.floor((t - J.pc.phase) / dt);
  for (let k = k0 - 3; k <= k0 + 3; k++) {
    const tl = J.pc.phase + k * dt, u = t - tl;             // u: time since this ball's landing
    if (u < -1 || u > 1) continue;
    const S = J.spots[order[((k % m) + m) % m]], f = Math.abs(u), up = 1 - f;
    const x = S.x + (J.hand.x - S.x) * f, y = J.y + JUG_BALL + (J.hand.y - J.y - JUG_BALL) * f + 3.2 * f * (1 - f);
    out.push({ x, y, z: J.z, u, S });
  }
  return out;
}
function juggleStep() {
  for (const J of circ.juggles) {
    if (Math.abs(ball.p.z - J.z) > 2) continue;
    for (const b of jugBalls(J, simT)) {
      if (Math.hypot(ball.p.x - b.x, ball.p.y - b.y, ball.p.z - b.z) < JUG_BALL + R - 0.04) {
        burst(ball.p.x, ball.p.y + 0.3, ball.p.z, 0xFFFFFF, 16, 3); sound('clamp'); shake = Math.max(shake, 0.25);
        ball.v.set(0, 0, 0); startFall(); return;
      }
    }
  }
}

// ---- THE KNIFE WHEEL ----
// A disc across the rail, its lower part through a slot, turning; holes near its rim pass the marble's height at the bottom.
function kwGeom(pc) { const rc = pc.rh + R + 0.35; return { rc, c: rc + R, Rw: rc + pc.rh + 0.35 }; }
const kwAngle = (W, t) => W.pc.dir * W.pc.spin * t + W.pc.phase;
function buildKwheel(pc) {
  const { K, PK } = circMat(), { rc, c, Rw } = kwGeom(pc), grp = new Group();
  grp.position.set(pc.x, pc.y + c, pc.z); levelGroup.add(grp);
  const face = canvasTex(512, 512, (g) => {                  // a target: rings of red and cream, the holes cut out, a gold rim
    g.clearRect(0, 0, 512, 512);
    for (let k = 8; k >= 1; k--) { g.fillStyle = k % 2 ? '#E8303A' : '#FFF1D2'; pbCircle(g, 256, 256, k * 31); g.fill(); }
    g.fillStyle = '#F2C230'; pbCircle(g, 256, 256, 22); g.fill();
    g.strokeStyle = '#F2C230'; g.lineWidth = 12; pbCircle(g, 256, 256, 250); g.stroke();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < pc.holes; i++) { const a = i * TAU / pc.holes; pbCircle(g, 256 + Math.cos(a) * 256 * rc / Rw, 256 - Math.sin(a) * 256 * rc / Rw, 256 * pc.rh / Rw); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = INK; g.lineWidth = 5;
    for (let i = 0; i < pc.holes; i++) { const a = i * TAU / pc.holes; pbCircle(g, 256 + Math.cos(a) * 256 * rc / Rw, 256 - Math.sin(a) * 256 * rc / Rw, 256 * pc.rh / Rw + 2); g.stroke(); }
  });
  const mat = new MeshStandardMaterial({ map: face, alphaTest: 0.5, side: DoubleSide, roughness: 0.35, metalness: 0.3, envMap: K.env, envMapIntensity: 0.6 });
  const disc = new Mesh(new CircleGeometry(Rw, 64), mat); grp.add(disc);
  const B = pbBuild();
  B.geo(new TorusGeometry(Rw, 0.12, 8, 64), placeAt(0, 0, 0), 0xF2C230);
  B.geo(new CylinderGeometry(0.3, 0.3, KW_TH + 0.2, 16), placeAt(0, 0, 0, Math.PI / 2, 0, 0), 0xF2C230);
  for (let i = 0; i < pc.holes; i++) for (const off of [0.5, -0.5]) {                     // knives stuck between the holes
    const a = (i + 0.5) * TAU / pc.holes + off * 0.25, rr = rc * (0.75 + 0.2 * off);
    B.geo(new BoxGeometry(0.1, 0.6, 0.05), placeAt(Math.cos(a) * rr, Math.sin(a) * rr, 0.14, 0, 0, a + 0.3), 0xD8DCE8);
    B.geo(new BoxGeometry(0.14, 0.28, 0.12), placeAt(Math.cos(a) * (rr + 0.4), Math.sin(a) * (rr + 0.4), 0.2, 0, 0, a + 0.3), 0x5A3A22);
  }
  grp.add(new Mesh(B.done(), K.metal));
  const slot = new Mesh(new BoxGeometry(2 * Rw * 0.9, 0.02, 0.4), new MeshBasicMaterial({ color: 0x1A0E0A })); slot.position.set(pc.x, pc.y + 0.012, pc.z); levelGroup.add(slot);
  for (const s of [-1, 1]) {                                   // a striped post either side, holding the axle
    const post = new Mesh(new CylinderGeometry(0.16, 0.2, c + 0.4, 10), PK.gold); post.position.set(pc.x + s * (Rw + 0.35), pc.y + (c + 0.4) / 2 - 0.4, pc.z); levelGroup.add(post);
  }
  circ.wheels.push({ pc, grp, x: pc.x, y: pc.y + c, z: pc.z, rc, Rw });
}
function kwheelStep() {
  for (const W of circ.wheels) {
    const dz = ball.p.z - W.z, reach = R + KW_TH / 2;
    if (Math.abs(dz) >= reach || Math.abs(ball.p.x - W.x) > W.Rw + 0.5) continue;
    const a = Math.sqrt(Math.max(0, R * R - Math.max(0, Math.abs(dz) - KW_TH / 2) ** 2));   // the marble's cut through the wheel
    const ang = kwAngle(W, simT), dx = ball.p.x - W.x, dy = ball.p.y - W.y, cs = Math.cos(-ang), sn = Math.sin(-ang);
    const u = dx * cs - dy * sn, v = dx * sn + dy * cs;       // in the wheel's own frame
    let near = 1e9;
    for (let i = 0; i < W.pc.holes; i++) { const h = i * TAU / W.pc.holes; near = Math.min(near, Math.hypot(u - Math.cos(h) * W.rc, v - Math.sin(h) * W.rc)); }
    if (near <= W.pc.rh - a + 0.04) continue;                // through a hole
    // Into the face, among the knives: a clang, sparks, back to the last ring.
    burst(ball.p.x, ball.p.y, ball.p.z, 0xD8DCE8, 20, 4); burst(ball.p.x, ball.p.y, ball.p.z, 0xFFE070, 10, 3);
    sound('clamp'); shake = Math.max(shake, 0.3); ball.v.set(0, 0, 0); startFall(); return;
  }
}

// ---- THE HUMAN CANNON ----
function canYaw(C, t) { return C.pc.swing * Math.sin(TAU * t / C.pc.period + C.pc.phase); }
function canMouth(C, yaw) { const h = CAN_L * Math.cos(CAN_EL); return new Vector3(C.px + Math.sin(yaw) * h, C.py + CAN_L * Math.sin(CAN_EL), C.pz - Math.cos(yaw) * h); }
// The shot: flat speed at the cap, lobbed to land level with the net's middle, the air's drag counted in; and where it lands.
function canShot(C, yaw) {
  const M = canMouth(C, yaw), D = Math.max(0.5, M.z - C.pc.land), v0 = VMAX * 0.995, k = DAMP_AIR;
  const t = -Math.log(Math.max(0.05, 1 - D * k / v0)) / k, vy = (C.pc.y + R - M.y + G * t * t / 2) / t;
  return { M, v: new Vector3(Math.sin(yaw) * v0, vy, -Math.cos(yaw) * v0), at: new Vector3(M.x + Math.sin(yaw) * D, C.pc.y, C.pc.land) };
}
function buildCannon(pc) {
  const { K, PK } = circMat(), C = { pc, px: pc.x, py: pc.y + 0.55, pz: pc.z - 0.3 };
  const carr = pbBuild();                                      // the carriage, under the breech, and its wheels
  carr.geo(new BoxGeometry(2.4, 0.5, 1.6), placeAt(pc.x, pc.y - 0.3, pc.z - 0.4), 0x2A4AE8);
  carr.geo(new BoxGeometry(2.5, 0.12, 1.7), placeAt(pc.x, pc.y - 0.02, pc.z - 0.4), 0xF2C230);
  for (const s of [-1, 1]) { carr.geo(new CylinderGeometry(0.75, 0.75, 0.16, 20), placeAt(pc.x + s * 1.35, pc.y - 0.35, pc.z - 0.4, 0, 0, Math.PI / 2), 0xE8303A); carr.geo(new CylinderGeometry(0.2, 0.2, 0.2, 10), placeAt(pc.x + s * 1.35, pc.y - 0.35, pc.z - 0.4, 0, 0, Math.PI / 2), 0xF2C230); }
  levelGroup.add(new Mesh(carr.done(), K.paint));
  C.grp = new Group(); C.grp.position.set(C.px, C.py, C.pz); levelGroup.add(C.grp);
  const tube = new Group(); tube.rotation.x = -(Math.PI / 2 - CAN_EL); C.grp.add(tube);   // the barrel, up at its angle, turning with the group
  const B = pbBuild();
  B.geo(new CylinderGeometry(0.62, 0.8, CAN_L, 24, 1, true), placeAt(0, CAN_L / 2, 0), 0xD8A640);
  for (const f of [0.08, 0.45, 0.94]) B.geo(new TorusGeometry(0.72 - 0.16 * f + 0.06, 0.1, 8, 24), placeAt(0, CAN_L * f, 0, Math.PI / 2, 0, 0), 0xE8303A);
  B.geo(new SphereGeometry(0.8, 16, 10, 0, TAU, Math.PI / 2, Math.PI / 2), placeAt(0, 0, 0), 0xD8A640);
  tube.add(new Mesh(B.done(), K.metal));
  const stars = new Mesh(new CylinderGeometry(0.64, 0.78, CAN_L * 0.36, 24, 1, true), new MeshBasicMaterial({ map: cqStarsTex(), transparent: true, toneMapped: false }));
  stars.position.y = CAN_L * 0.26; tube.add(stars);
  const mouthDark = new Mesh(new CircleGeometry(0.58, 20), new MeshBasicMaterial({ color: 0x120A08 })); mouthDark.position.y = CAN_L - 0.02; mouthDark.rotation.x = -Math.PI / 2; tube.add(mouthDark);
  C.mark = new Group();                                        // where it would land you now: a ring and a dot, bright
  const mk = new MeshBasicMaterial({ color: 0xFFE070, toneMapped: false, transparent: true, opacity: 0.95 });
  C.mark.add(new Mesh(new RingGeometry(0.42, 0.62, 32).rotateX(-Math.PI / 2), mk), new Mesh(new CircleGeometry(0.16, 16).rotateX(-Math.PI / 2), mk)); C.mark.material = mk;
  levelGroup.add(C.mark);
  const netT = canvasTex(128, 128, (g) => { g.fillStyle = '#231A2E'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#FFF1D2'; g.lineWidth = 3; for (let k = 0; k <= 128; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 128); g.moveTo(0, k); g.lineTo(128, k); g.stroke(); } }, true);
  netT.repeat.set(pc.netW / 0.8, 4 / 0.8);
  const net = new Mesh(new PlaneGeometry(pc.netW - 0.2, 3.8), new MeshStandardMaterial({ map: netT, roughness: 0.8 })); net.rotation.x = -Math.PI / 2; net.position.set(pc.x, pc.y + 0.012, pc.land); levelGroup.add(net);
  for (const s of [-1, 1]) for (const e of [-1, 1]) { const p = new Mesh(new CylinderGeometry(0.08, 0.08, 0.9, 8), PK.red); p.position.set(pc.x + s * pc.netW / 2, pc.y + 0.45, pc.land + e * 1.9); levelGroup.add(p); }
  C.confetti = cqConfetti(levelGroup);
  circ.cannons.push(C);
}
function cannonStep(dt) {
  for (const C of circ.cannons) {
    if (ball.circ) continue;
    if (ball.p.z > C.pc.z + 0.9 || ball.p.z < C.pc.z - 0.3 || Math.abs(ball.p.x - C.pc.x) > 1.4 || Math.abs(ball.p.y - R - C.pc.y) > 0.4) continue;
    ball.circ = { C, t: 0, from: ball.p.clone() }; sound('thunk');       // in: it loads, and fires where it points then
  }
}
// Held in the cannon: drawn down the barrel for a moment, then fired.
function circHeldStep(dt) {
  circMove(dt);                                            // the rides go on turning while one carries you (owner: "the wheel and the ball
                                                            // are not in unison": the Wheel of Death stood still once it had you)
  if (ball.circ.wod) { wodHeld(dt); return; }              // in a cage of the Wheel of Death
  if (ball.circ.coaster) { coasterHeld(dt); return; }      // riding the roller coaster
  const H = ball.circ, C = H.C;
  H.t += dt;
  const yaw = canYaw(C, simT), M = canMouth(C, yaw), f = Math.min(1, H.t / 0.22);
  ball.p.lerpVectors(H.from, M, f); ball.v.set(0, 0, 0);
  if (H.t < 0.22) return;
  const S = canShot(C, yaw);
  ball.p.copy(S.M); ball.v.copy(S.v); ball.grounded = false; ball.circ = null;
  sound('bomb'); shake = Math.max(shake, 0.35);
  burst(S.M.x, S.M.y, S.M.z, 0xFFF6EC, 24, 3); C.confetti.burst(S.M, 150); C.flash = 1;
}

// ---- THE BALL THROWER ----
function buildThrower(pc) {
  const { K } = circMat(), T = { pc, balls: [], next: 0 };
  const cx = pc.x + pc.side * (pc.w / 2 + 2.3);
  T.hand = new Vector3(cx - pc.side * 0.9, pc.y + 3.4, pc.z);
  T.man = new Mesh(cqCellGeo(1, 4.6), K.figs); T.man.position.set(cx, pc.y + 0.3, pc.z); levelGroup.add(T.man);
  const drum = new Mesh(new CylinderGeometry(1.1, 1.2, 1.0, 24), cqPieceKit(cqLook).red); drum.position.set(cx, pc.y - 0.2, pc.z); levelGroup.add(drum);
  T.mesh = new InstancedMesh(new IcosahedronGeometry(THROW_BALL, 2), new MeshStandardMaterial({ roughness: 0.3, metalness: 0.2 }), 4);
  for (let i = 0; i < 4; i++) T.mesh.setColorAt(i, new Color([0xE8303A, 0x2A6AE8, 0xF2C230, 0x2AA86A][i]));
  T.mesh.frustumCulled = false; levelGroup.add(T.mesh);
  T.rings = [0, 1, 2, 3].map(() => { const m = new Mesh(new RingGeometry(0.7, 0.85, 32), new MeshBasicMaterial({ color: 0xFF2A20, toneMapped: false, transparent: true, opacity: 0 })); m.rotation.x = -Math.PI / 2; levelGroup.add(m); return m; });
  circ.throwers.push(T);
}
// A throw every period: at where the marble will be when the ball lands, if it is near; otherwise down the middle.
function throwerStep(dt) {
  for (const T of circ.throwers) {
    const pc = T.pc, k = Math.floor((simT - pc.phase) / pc.period);
    if (k > T.next - 1 && simT >= pc.phase) {
      T.next = k + 1;
      const near = Math.abs(ball.p.z - pc.z) < pc.L / 2 + 8 && state === 'play';
      let tx = pc.x, tz = pc.z + pc.L / 2 - 2 - (k % 3) * (pc.L - 4) / 2;
      if (near) { tx = ball.p.x + ball.v.x * pc.flight; tz = ball.p.z + ball.v.z * pc.flight; }
      tx = clamp(tx, pc.x - pc.w / 2 + 0.5, pc.x + pc.w / 2 - 0.5); tz = clamp(tz, pc.z - pc.L / 2 + 0.6, pc.z + pc.L / 2 - 0.6);
      T.balls.push({ t0: simT, at: new Vector3(tx, pc.y + THROW_BALL, tz), i: k % 4 }); T.wind = simT;
      if (T.balls.length > 4) T.balls.shift();
    }
    for (const b of T.balls) {
      const p = throwPos(T, b, simT); if (!p || p.y > b.at.y + 1.2) continue;
      if (Math.hypot(ball.p.x - p.x, ball.p.y - p.y, ball.p.z - p.z) < THROW_BALL + R - 0.05 && state === 'play' && !b.hit) {
        b.hit = true; sound('clamp'); shake = Math.max(shake, 0.3); burst(ball.p.x, ball.p.y + 0.2, ball.p.z, 0xFFFFFF, 14, 3);
        ball.v.set(-pc.side * 7.5, 3.2, (ball.p.z - p.z) * 2); ball.grounded = false;   // knocked across and off
      }
    }
  }
}
// Where a thrown ball is: in its arc from the hand to the ring, then rolling on across the rail and off it.
function throwPos(T, b, t) {
  const u = t - b.t0, fl = T.pc.flight;
  if (u < 0) return null;
  if (u < fl) { const f = u / fl; return new Vector3(T.hand.x + (b.at.x - T.hand.x) * f, T.hand.y + (b.at.y - T.hand.y) * f + 2.6 * f * (1 - f) * 2, T.hand.z + (b.at.z - T.hand.z) * f); }
  const r = u - fl, x = b.at.x - T.pc.side * 4.2 * r, off = Math.abs(x - T.pc.x) > T.pc.w / 2 + 0.3;
  if (r > 2.2) return null;
  const dropT = off ? (Math.abs(x - T.pc.x) - T.pc.w / 2 - 0.3) / 4.2 : 0;
  return new Vector3(x, b.at.y - (off ? 11 * dropT * dropT : 0), b.at.z);
}

// Each physics step in play.
function circStep(dt) {
  if (circ.rings.length) fringStep();
  if (circ.juggles.length) juggleStep();
  if (circ.wheels.length) kwheelStep();
  if (circ.cannons.length) cannonStep(dt);
  if (circ.throwers.length) throwerStep(dt);
  if (circ.wods.length) wodStep();
  if (circ.teeters.length) teeterStep();
  circStep3(dt);
}
// Each frame: the flames, the balls, the wheel, the cannon's swing, the thrower's wind-up.
function animateCirc(dt) {
  animateCirc3();
  const o = new Object3D();
  for (const F of circ.rings) {
    const x = fringX(F, simT); F.grp.position.x = x;
    const P = F.geo.attributes.position.array, Cc = F.geo.attributes.color.array, r = F.pc.r;
    F.seed.forEach(([a, ph, s], i) => {
      const lick = REDUCED ? 0.5 : (Math.sin(simT * 9 + ph) * 0.5 + 0.5), rr = r + (lick - 0.3) * 0.12;
      P[i * 3] = Math.cos(a) * rr; P[i * 3 + 1] = Math.sin(a) * rr + lick * 0.18; P[i * 3 + 2] = (Math.sin(ph * 3) * 0.08);
      const c = 0.6 + 0.4 * lick; Cc[i * 3] = c; Cc[i * 3 + 1] = c * (0.45 + 0.3 * lick); Cc[i * 3 + 2] = c * 0.12;
    });
    F.geo.attributes.position.needsUpdate = true; F.geo.attributes.color.needsUpdate = true;
    F.glow.material.opacity = 0.28 + 0.12 * Math.sin(simT * 13);
  }
  for (const J of circ.juggles) {
    const list = jugBalls(J, simT);
    for (let i = 0; i < 6; i++) { const b = list[i]; o.position.set(b ? b.x : 0, b ? b.y : -999, b ? b.z : 0); o.rotation.set(simT * 3 + i, simT * 2, 0); o.updateMatrix(); J.balls.setMatrixAt(i, o.matrix); }
    J.balls.instanceMatrix.needsUpdate = true;
    for (const S of J.spots) S.warn.material.opacity = 0;
    for (const b of list) if (b.u > -0.9 && b.u < 0.05) { const f = 1 + b.u / 0.9; b.S.warn.material.opacity = 0.35 + 0.6 * f; b.S.warn.scale.setScalar(1 - 0.45 * f); }
  }
  for (const W of circ.wheels) W.grp.rotation.z = kwAngle(W, simT);
  for (const C of circ.cannons) {
    const yaw = canYaw(C, simT); C.grp.rotation.y = -yaw;
    const S = canShot(C, yaw), onNet = Math.abs(S.at.x - C.pc.x) < C.pc.netW / 2 - 0.3;
    C.mark.position.set(S.at.x, C.pc.y + 0.03, S.at.z); C.mark.material.color.setHex(onNet ? 0x3DFF8A : 0xFFE070);
    C.confetti.step(dt);
  }
  for (const T of circ.throwers) {
    const since = simT - (T.wind || -9); T.man.rotation.z = T.pc.side * (since < 0.35 ? Math.sin(since / 0.35 * Math.PI) * 0.25 : 0);
    for (let i = 0; i < 4; i++) {
      const b = T.balls[i], p = b ? throwPos(T, b, simT) : null;
      o.position.set(p ? p.x : 0, p ? p.y : -999, p ? p.z : 0); o.rotation.set(simT * 4, 0, simT * 3); o.updateMatrix(); T.mesh.setMatrixAt(i, o.matrix);
      const ring = T.rings[i], u = b ? simT - b.t0 : 9;
      ring.material.opacity = b && u < T.pc.flight ? 0.45 + 0.5 * (u / T.pc.flight) : 0;
      if (b) { ring.position.set(b.at.x, T.pc.y + 0.02, b.at.z); ring.scale.setScalar(1.4 - 0.6 * Math.min(1, u / T.pc.flight)); }
    }
    T.mesh.instanceMatrix.needsUpdate = true;
  }
}
// What the harness reads, for the autopilot.
function circState() {
  return {
    rings: circ.rings.map((F) => ({ x: fringX(F, simT), z: F.z, r: F.pc.r, ft: F.pc.ft, slide: F.pc.slide || 0, period: F.pc.period || 0, phase: F.pc.phase, cx: F.pc.x })),
    juggles: circ.juggles.map((J) => ({ z: J.z, spots: J.spots.map((S) => S.x), balls: jugBalls(J, simT).map((b) => [b.x, b.y, b.u]), period: J.pc.period, n: J.pc.n, phase: J.pc.phase })),
    wheels: circ.wheels.map((W) => ({ x: W.x, y: W.y, z: W.z, rc: W.rc, rh: W.pc.rh, holes: W.pc.holes, ang: kwAngle(W, simT), spin: W.pc.spin * W.pc.dir })),
    cannons: circ.cannons.map((C) => { const yaw = canYaw(C, simT), S = canShot(C, yaw); return { x: C.pc.x, z: C.pc.z, land: C.pc.land, netW: C.pc.netW, yaw, atX: S.at.x, swing: C.pc.swing, period: C.pc.period, phase: C.pc.phase }; }),
    throwers: circ.throwers.map((T) => ({ z: T.pc.z, L: T.pc.L, period: T.pc.period, flight: T.pc.flight, balls: T.balls.map((b) => [b.at.x, b.at.z, simT - b.t0]) })),
    held: !!ball.circ,
    ...circState2(),
    ...circState3(),
  };
}
