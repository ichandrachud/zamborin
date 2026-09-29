
/* THE CIRCUS OBSTACLES, the second five: things that carry you, or that you must ride. Try-outs #try-trapeze,
   #try-wire, #try-teeter, #try-wod, #try-ferris, and all five on #try-circus2, easy to hard:
     trapeze        a gap, and a swing hung high above it: its seat waits at the near edge, swings across (dipping as
                    it goes), waits at the far edge, swings back. On at one end, off at the other.
     high wire      a narrow beam over a drop, swaying from side to side; it does not carry you. Stay on it.
     teeterboard    a plank on a fulcrum, a strongman on a perch by its far end: sit on the yellow spot at the near end,
                    and when he jumps down on the far end you are thrown up to the rail above. Anywhere else, thrown off.
     Wheel of Death an arm turning end over end with a cage at each end; roll into a cage as it comes to the bottom and
                    it lifts you up and over to a rail two arms higher. No cage there, and you drop.
     Ferris wheel   a broken rail, a Ferris wheel standing in the gap: board a car as it passes the edge going down,
                    and step off as it comes level with the far side going up. Stay on, and you go round again.
   Each moving floor is a collider moved before the marble each step (circMove); a trapeze seat and a Ferris car carry
   what stands on them (as a ferry does), the wire and the teeterboard do not. */
Object.assign(circ, { swings: [], wires: [], teeters: [], wods: [], ferrises: [], movers: [] });
Object.assign(TRY_CIRCUS, {
  trapeze: [{ t: 'trapeze', gap: 5, period: 7.2, dwell: 1.6 }, { t: 'trapeze', gap: 6.5, period: 6.4, dwell: 1.2 }, { t: 'trapeze', gap: 8, period: 5.8, dwell: 0.9 }],
  wire: [{ t: 'wire', len: 8, bw: 0.62, sway: 0, period: 4 }, { t: 'wire', len: 10, bw: 0.56, sway: 0.3, period: 4.4 }, { t: 'wire', len: 12, bw: 0.5, sway: 0.45, period: 3.8 }],
  teeter: [{ t: 'teeter', L: 7, bw: 1.8, tilt: 0.18, period: 4.6, up: 3.5 }, { t: 'teeter', L: 7.5, bw: 1.5, tilt: 0.2, period: 4.0, up: 4.2 }, { t: 'teeter', L: 8, bw: 1.3, tilt: 0.22, period: 3.5, up: 5 }],
  wod: [{ t: 'wod', arm: 3.2, spin: 0.55 }, { t: 'wod', arm: 3.4, spin: 0.7 }, { t: 'wod', arm: 3.6, spin: 0.85 }],
  ferris: [{ t: 'ferris', g: 3.2, Rf: 8, n: 8, spin: 0.22 }, { t: 'ferris', g: 3.8, Rf: 8, n: 7, spin: 0.27 }, { t: 'ferris', g: 4.4, Rf: 8.5, n: 6, spin: 0.32 }],
});
TRY_CIRCUS.circus2 = [TRY_CIRCUS.trapeze[1], TRY_CIRCUS.wire[1], TRY_CIRCUS.teeter[1], TRY_CIRCUS.wod[1], TRY_CIRCUS.ferris[1]];
Object.assign(TRY_COURSES, { trapeze: [], wire: [], teeter: [], wod: [], ferris: [], circus2: [] });
Object.assign(TRY_TITLES, { trapeze: 'THE TRAPEZE', wire: 'THE HIGH WIRE', teeter: 'THE TEETERBOARD', wod: 'THE WHEEL OF DEATH', ferris: 'THE FERRIS WHEEL', circus2: 'CIRCUS RIDES' });
Object.assign(TRY_NEWS, {
  trapeze: 'The trapeze seat waits at each edge. Roll on at one end, off at the other',
  wire: 'The high wire sways and does not carry you. Stay on it',
  teeter: 'Sit on the yellow spot: when the strongman lands, you are thrown up to the rail above',
  wod: 'Roll into a cage as it comes to the bottom; it lifts you up and over',
  ferris: 'Board a car going down at the edge; step off as it comes level with the far side',
  circus2: 'The circus rides: the trapeze, the high wire, the teeterboard, the Wheel of Death and the Ferris wheel',
});
const TRAP_L = 9, TRAP_D = 2.0, TRAP_W = 2.2, WOD_CUP = 0.95, FC_W = 2.0, FC_D = 1.7, FC_HANG = 1.2;
// Lay one at the course's end; returns how far it runs (and how much higher the course goes on, if it does).
function circLay2(spec, pieces, x, y, z) {
  const flat = (zc, L, yy = y, w = 2.6) => pieces.push(F(x, cr2(zc), w, L, yy));
  if (spec.t === 'trapeze') {
    flat(z - 2, 4); const zm = z - 4 - spec.gap / 2; flat(zm - spec.gap / 2 - 2.5, 5);
    pieces.push({ ...spec, x, z: cr2(zm), y, w: TRAP_W, d: spec.gap, phase: 0 });
    return 4 + spec.gap + 5;
  }
  if (spec.t === 'wire') {
    flat(z - 1.5, 3); const zm = z - 3 - spec.len / 2; flat(zm - spec.len / 2 - 2, 4);
    pieces.push({ ...spec, x, z: cr2(zm), y, w: spec.bw, d: spec.len, phase: 0 });
    return 3 + spec.len + 4;
  }
  if (spec.t === 'teeter') {
    const run = spec.L * Math.cos(spec.tilt); flat(z - 1.75, 3.5); flat(z - 3.5 - run - 1 - 2.5, 5, y + spec.up);
    pieces.push({ ...spec, x, z: cr2(z - 3.5 - run / 2), y, w: spec.bw, d: run, phase: 1.5 });
    return { len: 3.5 + run + 1 + 5, dy: spec.up };
  }
  if (spec.t === 'wod') {
    flat(z - 2, 4); const za = z - 4 - 1.1, up = 2 * spec.arm; flat(za - 1.1 - 2.5, 5, y + up);
    pieces.push({ ...spec, x, z: cr2(za), y, w: 3, d: 2.2, up, phase: 0 });
    return { len: 4 + 2.2 + 5, dy: up };
  }
  if (spec.t === 'ferris') {
    // The rail stops half a car short of where a car's floor is level with it, either side, so a car never meets it.
    flat(z - 2, 4, y, FC_W); const e = FC_D / 2 + 0.05, zc = z - 4 - spec.g - e; flat(zc - spec.g - e - 2.5, 5, y, FC_W);
    pieces.push({ ...spec, x, z: cr2(zc), y, w: FC_W, d: 2 * (spec.g + e), phase: 0 });
    return 4 + 2 * (spec.g + e) + 5;
  }
  return circLay3(spec, pieces, x, y, z);
}
// A floor that moves: a box collider moved before the marble each step; `carry` makes it carry what stands on it.
function circMover(mesh, w, h, d, carry, tag) {
  const c = { mesh, pos: mesh.position.clone(), prev: mesh.position.clone(), quat: new Quaternion(), inv: new Quaternion(), half: new Vector3(w / 2, h / 2, d / 2),
              delta: new Vector3(), ferry: carry ? { circus: tag } : null, holo: null, pad: null };
  colliders.push(c); circ.movers.push(c);
  return c;
}
function moveTo(c, x, y, z, q) {
  c.prev.copy(c.pos); c.pos.set(x, y, z); c.delta.subVectors(c.pos, c.prev); c.mesh.position.copy(c.pos);
  if (q) { c.quat.copy(q); c.inv.copy(q).invert(); c.mesh.quaternion.copy(q); }
  // A carrying floor going down takes what rests on it down with it: carried only while touching, it would otherwise
  // drop away from under the marble a little every step, and the marble, never quite on it, be left behind.
  if (c.ferry && c.delta.y < 0 && Math.abs(ball.p.x - c.prev.x) < c.half.x + 0.05 && Math.abs(ball.p.z - c.prev.z) < c.half.z + 0.05) {
    const gap = (ball.p.y - R) - (c.prev.y + c.half.y);
    if (gap > -0.05 && gap < 0.1) ball.p.y += c.delta.y;
  }
}

// ---- THE TRAPEZE ----
function trapGeom(pc) { const a = Math.asin(Math.min(0.9, (pc.gap - TRAP_D) / 2 / TRAP_L)); return { a, py: pc.y + TRAP_L * Math.cos(a) }; }
function trapAngle(T, t) {                                   // held at +a (near), swung across, held at -a (far), swung back
  const { a } = T.g, sw = T.pc.period / 2 - T.pc.dwell, u = (((t + T.pc.phase) % T.pc.period) + T.pc.period) % T.pc.period;
  if (u < T.pc.dwell) return a;
  if (u < T.pc.dwell + sw) return a * Math.cos(Math.PI * (u - T.pc.dwell) / sw);
  if (u < 2 * T.pc.dwell + sw) return -a;
  return -a * Math.cos(Math.PI * (u - 2 * T.pc.dwell - sw) / sw);
}
function buildTrapeze(pc) {
  const { K, PK } = circMat(), g = trapGeom(pc);
  const seat = new Mesh(new BoxGeometry(TRAP_W, 0.24, TRAP_D), faceMats(ferryStone)); levelGroup.add(seat);
  const T = { pc, g, seat, c: circMover(seat, TRAP_W, 0.24, TRAP_D, true, 'trapeze') };
  const ropes = new Group(); levelGroup.add(ropes); T.ropes = ropes;
  const B = pbBuild();
  for (const s of [-1, 1]) B.geo(new CylinderGeometry(0.035, 0.035, TRAP_L - 0.5, 6), placeAt(s * (TRAP_W / 2 - 0.1), -(TRAP_L - 0.5) / 2 - 0.3, 0), 0xFFF1D2);
  B.geo(new CylinderGeometry(0.07, 0.07, TRAP_W, 10), placeAt(0, -1.6, 0, 0, 0, Math.PI / 2), 0xF2C230);   // the bar
  ropes.add(new Mesh(B.done(), K.metal));
  const flyer = new Mesh(cqCellGeo(2, 2.4), K.figs); flyer.position.set(0, -4.2, -0.2); ropes.add(flyer);   // an aerialist on the bar
  ropes.position.set(pc.x, g.py, pc.z);
  circ.swings.push(T); trapPlace(T, 0, true);
}
function trapPlace(T, t, snap) {
  const a = trapAngle(T, t), cz = T.pc.z + TRAP_L * Math.sin(a), cy = T.g.py - TRAP_L * Math.cos(a);
  moveTo(T.c, T.pc.x, cy - 0.12, cz); if (snap) T.c.prev.copy(T.c.pos), T.c.delta.set(0, 0, 0);
  T.ropes.rotation.x = -a;
}

// ---- THE HIGH WIRE ----
function buildWire(pc) {
  const { K, PK } = circMat();
  const beam = new Mesh(new BoxGeometry(pc.bw, 0.18, pc.len), new MeshStandardMaterial({ color: 0xFFF1D2, roughness: 0.35, metalness: 0.4 })); levelGroup.add(beam);
  const cable = new Mesh(new CylinderGeometry(0.06, 0.06, pc.len, 8), PK.gold); cable.rotation.x = Math.PI / 2; cable.position.y = 0.1; beam.add(cable);
  for (let k = 0; k < Math.floor(pc.len / 0.8); k++) { const tick = new Mesh(new BoxGeometry(pc.bw + 0.02, 0.02, 0.12), PK.red); tick.position.set(0, 0.095, -pc.len / 2 + 0.4 + k * 0.8); beam.add(tick); }
  const W = { pc, beam, c: circMover(beam, pc.bw, 0.18, pc.len, false, 'wire') };
  W.c.obstacle = 'wire';
  for (const e of [-1, 1]) for (const s of [-1, 1]) {           // poles at each end, and the guy wires the wire hangs between
    const p = new Mesh(new CylinderGeometry(0.1, 0.12, 5, 8), PK.gold); p.position.set(pc.x + s * 1.2, pc.y + 1.5, pc.z + e * (pc.len / 2 + 0.4)); levelGroup.add(p);
  }
  circ.wires.push(W); wirePlace(W, 0, true);
}
function wirePlace(W, t, snap) {
  const x = W.pc.x + (W.pc.sway ? W.pc.sway * Math.sin(TAU * t / W.pc.period) : 0);
  moveTo(W.c, x, W.pc.y - 0.09, W.pc.z); if (snap) W.c.prev.copy(W.c.pos), W.c.delta.set(0, 0, 0);
}

// ---- THE TEETERBOARD ----
// A plank on a fulcrum, its near end down, a yellow spot on it; a tin strongman on a perch beside its far end. Every so
// often he jumps down onto the far end: the plank snaps over, and what sits on the yellow spot is thrown up and on to
// the rail above. Anywhere else on the plank then, it is thrown off; and the plank goes nowhere without him.
function teeterJump(T, t) { const u = (((t - T.pc.phase) % T.pc.period) + T.pc.period) % T.pc.period; return { u, k: Math.floor((t - T.pc.phase) / T.pc.period), toLand: T.pc.period - u }; }
function buildTeeter(pc) {
  const { K, PK } = circMat(), L = pc.L, run = L * Math.cos(pc.tilt);
  const board = new Mesh(new BoxGeometry(pc.bw, 0.26, L), new MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.35, metalness: 0.4, map: cqStripeTex() })); levelGroup.add(board);
  const T = { pc, board, a: pc.tilt, c: circMover(board, pc.bw, 0.26, L, false, 'teeter'), run, next: 0 };
  T.c.obstacle = 'teeter';
  T.py = pc.y + (L / 2) * Math.sin(pc.tilt);
  T.nearZ = pc.z + run / 2; T.farZ = pc.z - run / 2;
  const spot = new Mesh(new CircleGeometry(0.62, 32), new MeshBasicMaterial({ color: PAD_YELLOW, toneMapped: false, transparent: true, opacity: 0.9 }));
  spot.rotation.x = -Math.PI / 2; spot.position.set(0, 0.135, L / 2 - 0.85); board.add(spot); T.spot = spot;
  const ful = pbBuild();                                     // the fulcrum: a gold wedge
  ful.geo(new CylinderGeometry(0.2, 0.9, T.py - pc.y + 1.6, 4, 1), placeAt(pc.x, pc.y + (T.py - pc.y) / 2 - 0.9, pc.z, 0, Math.PI / 4, 0), 0xF2C230);
  ful.geo(new CylinderGeometry(0.16, 0.16, pc.bw + 0.5, 10), placeAt(pc.x, T.py - 0.15, pc.z, 0, 0, Math.PI / 2), 0xE8303A);
  const px = pc.x + (pc.bw / 2 + 1.6), perchY = T.py + L * Math.sin(pc.tilt) / 2 + 2.2;     // his perch, beside the far end
  for (let k = 0; k < 6; k++) ful.geo(new CylinderGeometry(0.75, 0.8, (perchY - pc.y + 4) / 6, 16), placeAt(px, pc.y - 4 + (k + 0.5) * (perchY - pc.y + 4) / 6, T.farZ + 0.6), k % 2 ? 0xFFF1D2 : 0xE8303A);
  levelGroup.add(new Mesh(ful.done(), K.metal));
  T.perch = new Vector3(px, perchY, T.farZ + 0.6);
  T.man = new Mesh(cqCellGeo(4, 2.8), K.figs); levelGroup.add(T.man);
  T.lamp = new Mesh(new SphereGeometry(0.22, 12, 8), new MeshBasicMaterial({ color: 0xFFE070, toneMapped: false })); T.lamp.position.set(px, perchY + 3.2, T.farZ + 0.6); levelGroup.add(T.lamp);
  // Where the throw lands: the middle of the rail above.
  T.land = new Vector3(pc.x, pc.y + pc.up + R, T.farZ - 1 - 2.5);
  circ.teeters.push(T); teeterPlace(T, 0, true);
}
function teeterPlace(T, dt, snap) {
  const pc = T.pc, J = teeterJump(T, simT);
  // The plank: over in a flash as he lands, back while he climbs up again.
  const since = J.u, over = since < 0.12 ? since / 0.12 : since < 0.8 ? 1 : since < 1.6 ? 1 - (since - 0.8) / 0.8 : 0;
  T.a = pc.tilt - 2 * pc.tilt * over;
  const q = new Quaternion().setFromEuler(new Euler(T.a, 0, 0)), up = new Vector3(0, 1, 0).applyQuaternion(q);   // a > 0: the near (+z) end down
  moveTo(T.c, pc.x - up.x * 0.13, T.py - up.y * 0.13, pc.z - up.z * 0.13, q); if (snap) T.c.prev.copy(T.c.pos), T.c.delta.set(0, 0, 0);
}
// Each step: when he lands, the throw.
function teeterStep() {
  for (const T of circ.teeters) {
    const J = teeterJump(T, simT);
    if (J.k < T.next) continue;
    T.next = J.k + 1;
    if (simT < T.pc.phase + 0.01) continue;
    sound('thunk'); shake = Math.max(shake, 0.2);
    const pc = T.pc, onBoard = Math.abs(ball.p.x - pc.x) < pc.bw / 2 + 0.1 && ball.p.z < T.nearZ + 0.2 && ball.p.z > T.farZ - 0.2 && ball.p.y < T.py + pc.L && ball.p.y > pc.y - 1;
    if (!onBoard || state !== 'play') continue;
    if (ball.p.z > T.nearZ - 1.6) {                          // on the spot: up and on, to the middle of the rail above
      const D = ball.p.z - T.land.z, v0 = Math.min(VMAX * 0.995, D * 0.9 + 2.5), k = DAMP_AIR, t = -Math.log(Math.max(0.05, 1 - D * k / v0)) / k;
      ball.v.set((T.land.x - ball.p.x) / t, (T.land.y - ball.p.y + G * t * t / 2) / t, -v0); ball.grounded = false; ball.p.y += 0.05;
      sound('launch'); burst(ball.p.x, ball.p.y, ball.p.z, 0xFFD23F, 26, 4);
    } else { ball.v.set((ball.p.x >= pc.x ? 1 : -1) * 3.5, 6.5, 2); ball.grounded = false; }   // anywhere else: thrown off
  }
}
function animateTeeter() {
  for (const T of circ.teeters) {
    const J = teeterJump(T, simT), f = J.u < 1.2 ? 0 : J.u > T.pc.period - 0.7 ? 1 - J.toLand / 0.7 : 0;
    const land = new Vector3(T.pc.x, T.py - T.pc.L * Math.sin(T.pc.tilt) / 2 + 0.2, T.farZ + 0.4);
    if (J.u < 0.8) T.man.position.copy(land);                    // on the plank's end, then back up to his perch
    else if (J.u < 1.2) T.man.position.lerpVectors(land, T.perch, (J.u - 0.8) / 0.4);
    else if (f > 0) T.man.position.lerpVectors(T.perch, land, f).y += Math.sin(Math.PI * f) * 1.6;
    else T.man.position.copy(T.perch);
    T.lamp.material.color.setHex(J.toLand < 1.2 && Math.floor(J.toLand * 6) % 2 ? 0xFF3020 : 0xFFE070);
    T.spot.material.opacity = J.toLand < 1.2 ? 0.55 + 0.45 * Math.abs(Math.sin(J.toLand * 9)) : 0.85;
  }
}
let cqStripeMemo = null;
const cqStripeTex = () => cqStripeMemo || (cqStripeMemo = canvasTex(64, 256, (g) => { for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#FFF1D2' : '#E8303A'; g.fillRect(0, k * 32, 64, 32); } }));

// ---- THE WHEEL OF DEATH ----
const wodAngle = (Wd, t) => Wd.pc.spin * t + Wd.pc.phase;
function buildWod(pc) {
  const { K, PK } = circMat(), ay = pc.y + pc.arm + R, Wd = { pc, ay };
  const frame = pbBuild();
  for (const s of [-1, 1]) for (const e of [-1, 1]) frame.geo(new CylinderGeometry(0.14, 0.18, ay - pc.y + 3, 8), placeAt(pc.x + s * 1.9, (ay + pc.y - 3) / 2, pc.z + e * 1.3, e * 0.28, 0, 0), 0xE8303A);
  frame.geo(new CylinderGeometry(0.22, 0.22, 4.4, 12), placeAt(pc.x, ay, pc.z, 0, 0, Math.PI / 2), 0xF2C230);
  levelGroup.add(new Mesh(frame.done(), K.metal));
  Wd.rot = new Group(); Wd.rot.position.set(pc.x, ay, pc.z); levelGroup.add(Wd.rot);
  const B = pbBuild();
  B.geo(new BoxGeometry(0.4, pc.arm * 2, 0.4), placeAt(0, 0, 0), 0xF2C230);
  for (const e of [-1, 1]) {                                   // a cage at each end: hoops round the marble's seat
    for (let k = 0; k < 3; k++) B.geo(new TorusGeometry(WOD_CUP, 0.06, 6, 24), placeAt(0, e * pc.arm, 0, 0, k * Math.PI / 3, 0), 0xE8303A);
    B.geo(new TorusGeometry(WOD_CUP, 0.06, 6, 24), placeAt(0, e * pc.arm, 0, Math.PI / 2, 0, 0), 0xF2C230);
  }
  Wd.rot.add(new Mesh(B.done(), K.metal));
  circ.wods.push(Wd);
}
// A cage's centre, for the cage at the arm's end k (0, 1): at the bottom when the angle has it straight down.
function wodCage(Wd, k, t) { const a = wodAngle(Wd, t) + k * Math.PI; return new Vector3(Wd.pc.x, Wd.ay - Wd.pc.arm * Math.cos(a), Wd.pc.z - Wd.pc.arm * Math.sin(a)); }
function wodStep() {
  for (const Wd of circ.wods) {
    if (ball.circ) continue;
    if (Math.abs(ball.p.x - Wd.pc.x) > 1 || Math.abs(ball.p.z - Wd.pc.z) > 1.2 || ball.p.y > Wd.pc.y + 1.2) continue;
    for (let k = 0; k < 2; k++) {
      const C = wodCage(Wd, k, simT);
      if (C.distanceTo(ball.p) < WOD_CUP * 0.9 && C.y < Wd.pc.y + WOD_CUP) { ball.circ = { wod: Wd, k, t: 0 }; sound('thunk'); return; }
    }
  }
}
// Carried in the cage, up and over; let go at the top, rolling on onto the rail above.
function wodHeld(dt) {
  const H = ball.circ, Wd = H.wod, a = ((wodAngle(Wd, simT) + H.k * Math.PI) % TAU + TAU) % TAU;
  const C = wodCage(Wd, H.k, simT); ball.p.copy(C); ball.v.set(0, 0, 0);
  if (a > Math.PI - 0.05 && a < Math.PI + 1) { ball.circ = null; ball.p.set(Wd.pc.x, Wd.pc.y + Wd.pc.up + R + 0.05, Wd.pc.z - 1.2); ball.v.set(0, 0, -2.4); sound('pop'); }
}

// ---- THE FERRIS WHEEL ----
function ferrisGeom(pc) { const s = Math.sqrt(Math.max(0.1, 1 - (pc.g / pc.Rf) ** 2)); return { yc: pc.y + FC_HANG + pc.Rf * s + 0.1 }; }
const ferrisAngle = (Fw, t, k) => -Fw.pc.spin * t + Fw.pc.phase + k * TAU / Fw.pc.n;   // the bottom moves on, toward -z
function buildFerrisGap(pc) {
  const { K, PK } = circMat(), { yc } = ferrisGeom(pc), Fw = { pc, yc, cars: [] };
  Fw.wheel = new Group(); Fw.wheel.position.set(pc.x, yc, pc.z); levelGroup.add(Fw.wheel);
  const B = pbBuild();
  for (const s of [-1, 1]) {                                   // two rims either side of the cars, spokes to the hub
    B.geo(new TorusGeometry(pc.Rf, 0.16, 8, 80), placeAt(s * (FC_W / 2 + 0.35), 0, 0, 0, Math.PI / 2, 0), 0xE8303A);
    for (let k = 0; k < 16; k++) { const a = k * TAU / 16; B.geo(new CylinderGeometry(0.06, 0.06, pc.Rf, 4), placeAt(s * (FC_W / 2 + 0.35), Math.sin(a) * pc.Rf / 2, Math.cos(a) * pc.Rf / 2, a, 0, 0), 0xFFF1D2); }
  }
  B.geo(new CylinderGeometry(0.4, 0.4, FC_W + 1.2, 16), placeAt(0, 0, 0, 0, 0, Math.PI / 2), 0xF2C230);
  Fw.wheel.add(new Mesh(B.done(), K.metal));
  for (const s of [-1, 1]) { const leg = new Mesh(new CylinderGeometry(0.25, 0.4, yc - pc.y + 8, 8), PK.gold); leg.position.set(pc.x + s * (FC_W / 2 + 1.2), (yc + pc.y - 8) / 2, pc.z); levelGroup.add(leg); }
  for (let k = 0; k < pc.n; k++) {
    const floor = new Mesh(new BoxGeometry(FC_W, 0.2, FC_D), faceMats(ferryStone)); levelGroup.add(floor);
    const car = { k, floor, c: circMover(floor, FC_W, 0.2, FC_D, true, 'ferris') };
    const walls = new Group(); floor.add(walls);
    for (const s of [-1, 1]) {                                 // low walls either side keep the marble in; open front and back
      const wm = new Mesh(new BoxGeometry(0.12, 0.5, FC_D), cqPieceKit(cqLook).red); wm.position.set(s * (FC_W / 2 - 0.06), 0.35, 0); walls.add(wm);
      const wmesh = new Mesh(new BoxGeometry(0.12, 0.5, FC_D), cqPieceKit(cqLook).red); wmesh.visible = false; levelGroup.add(wmesh);   // its collider (the wall drawn rides the car)
      const wc = circMover(wmesh, 0.12, 0.5, FC_D, true, 'ferris'); wc.obstacle = 'fwall'; car.walls = car.walls || []; car.walls.push([wc, s]);
    }
    for (const e of [-1, 1]) {                                 // a low lip front and back: it holds a marble sitting still; one rolling climbs over
      const lm = new Mesh(new BoxGeometry(FC_W - 0.2, 0.12, 0.08), cqPieceKit(cqLook).gold); lm.position.set(0, 0.16, e * (FC_D / 2 - 0.04)); walls.add(lm);
      const lmesh = new Mesh(new BoxGeometry(FC_W - 0.2, 0.12, 0.08), cqPieceKit(cqLook).gold); lmesh.visible = false; levelGroup.add(lmesh);
      const lc = circMover(lmesh, FC_W - 0.2, 0.12, 0.08, true, 'ferris'); lc.obstacle = 'fwall'; car.lips = car.lips || []; car.lips.push([lc, e]);
    }
    // No roof: the camera looks down into the car, and must see the marble in it. A gold yoke up the sides to the pivot instead.
    for (const s of [-1, 1]) { const bar = new Mesh(new CylinderGeometry(0.05, 0.05, FC_HANG + 0.1, 6), cqPieceKit(cqLook).gold); bar.position.set(s * (FC_W / 2 - 0.06), FC_HANG / 2 + 0.2, 0); walls.add(bar); }
    const yoke = new Mesh(new CylinderGeometry(0.05, 0.05, FC_W, 6), cqPieceKit(cqLook).gold); yoke.rotation.z = Math.PI / 2; yoke.position.y = FC_HANG + 0.25; walls.add(yoke);
    Fw.cars.push(car);
  }
  circ.ferrises.push(Fw); ferrisPlace(Fw, 0, true);
}
function ferrisPlace(Fw, t, snap) {
  for (const car of Fw.cars) {
    const a = ferrisAngle(Fw, t, car.k), pz = Fw.pc.z + Fw.pc.Rf * Math.cos(a), py = Fw.yc + Fw.pc.Rf * Math.sin(a) - FC_HANG;
    moveTo(car.c, Fw.pc.x, py - 0.1, pz);
    for (const [wc, s] of car.walls) moveTo(wc, Fw.pc.x + s * (FC_W / 2 - 0.06), py + 0.25, pz);
    for (const [lc, e] of car.lips) moveTo(lc, Fw.pc.x, py + 0.06, pz + e * (FC_D / 2 - 0.04));
    if (snap) for (const c of [car.c, ...car.walls.map((w) => w[0]), ...car.lips.map((w) => w[0])]) { c.prev.copy(c.pos); c.delta.set(0, 0, 0); }
  }
  Fw.wheel.rotation.x = -(-Fw.pc.spin * t + Fw.pc.phase);
}

// Before the marble moves each step: every moving floor to where it is now.
function circMove(dt) {
  for (const T of circ.swings) trapPlace(T, simT);
  for (const W of circ.wires) wirePlace(W, simT);
  for (const T of circ.teeters) teeterPlace(T, dt);
  if (circ.teeters.length) animateTeeter();
  for (const Fw of circ.ferrises) ferrisPlace(Fw, simT);
  for (const Wd of circ.wods) Wd.rot.rotation.x = -wodAngle(Wd, simT);
}
function circStep2() { if (circ.wods.length) wodStep(); }
function circState2() {
  return {
    swings: circ.swings.map((T) => ({ z: T.pc.z, gap: T.pc.gap, a: trapAngle(T, simT), amax: T.g.a, seat: T.c.pos.toArray().map((v) => +v.toFixed(2)), period: T.pc.period, dwell: T.pc.dwell, phase: T.pc.phase })),
    wires: circ.wires.map((W) => ({ z: W.pc.z, len: W.pc.len, bw: W.pc.bw, x: W.c.pos.x, sway: W.pc.sway, period: W.pc.period })),
    teeters: circ.teeters.map((T) => ({ z: T.pc.z, L: T.pc.L, a: T.a, tilt: T.pc.tilt, nearZ: T.nearZ, farZ: T.farZ, toLand: teeterJump(T, simT).toLand, y: T.pc.y, up: T.pc.up, pos: T.c.pos.toArray().map((v) => +v.toFixed(3)), q: T.c.quat.toArray().map((v) => +v.toFixed(3)), py: T.py })),
    wods: circ.wods.map((Wd) => ({ z: Wd.pc.z, ang: wodAngle(Wd, simT), spin: Wd.pc.spin, arm: Wd.pc.arm, y: Wd.pc.y })),
    ferrises: circ.ferrises.map((Fw) => ({ z: Fw.pc.z, g: Fw.pc.g, e: FC_D / 2 + 0.05, y: Fw.pc.y, yc: Fw.yc, Rf: Fw.pc.Rf, spin: Fw.pc.spin, phase: Fw.pc.phase, n: Fw.pc.n, hang: FC_HANG,
                                          cars: Fw.cars.map((c) => c.c.pos.toArray().map((v) => +v.toFixed(2))) })),
  };
}
