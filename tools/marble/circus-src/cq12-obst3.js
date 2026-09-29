
/* THE CIRCUS OBSTACLES, the last four (owner: "clown car that chases you", "a roller coaster. A carousel. going into
   a house of mirrors (camera angle changes to make going forward confusing)"). Try-outs #try-chase, #try-mirrors,
   #try-coaster, and all three on #try-circus3 (the carousel's horses ride every roundabout in the circus):
     clown car chase   past a line, a clown car honks out of its garage behind you and chases you down the rail;
                       reach the far end first (it turns off into a garage there). Caught, you are sent back.
     house of mirrors  a walled hall of mirrors, its way zigzagging between mirrored partitions, trapdoors in the
                       pockets; inside, the camera swings round, so up the screen is no longer on. Your reflections
                       roll with you in the glass.
     roller coaster    the rail ends at a station; a car comes in and waits, then goes. Roll in while it waits: it
                       takes you up the lift, down the drop and round, to the rail beyond. No car, and you drop.
     carousel          on every roundabout in the circus, tin horses ride round with the floor, bobbing: solid.
                       On and off between them. */
Object.assign(circ, { chases: [], mirrors: [], coasters: [], horses: [] });
Object.assign(TRY_CIRCUS, {
  chase: [{ t: 'chase', L: 24, speed: 5.2, delay: 1.2, pins: 0 }, { t: 'chase', L: 30, speed: 5.8, delay: 0.9, pins: 2 }, { t: 'chase', L: 36, speed: 6.4, delay: 0.7, pins: 4 }],
  mirrors: [{ t: 'mirror', parts: 3, turn: Math.PI / 2 }, { t: 'mirror', parts: 4, turn: Math.PI * 0.75 }, { t: 'mirror', parts: 5, turn: Math.PI }],
  coaster: [{ t: 'coaster', wait: 3.0, period: 7, lift: 5, drop: 8 }, { t: 'coaster', wait: 2.3, period: 6.5, lift: 6, drop: 9 }, { t: 'coaster', wait: 1.8, period: 6, lift: 7, drop: 10 }],
});
TRY_CIRCUS.circus3 = [TRY_CIRCUS.chase[1], TRY_CIRCUS.mirrors[1], TRY_CIRCUS.coaster[1]];
Object.assign(TRY_COURSES, { chase: [], mirrors: [], coaster: [], circus3: [] });
Object.assign(TRY_TITLES, { chase: 'THE CLOWN CAR CHASE', mirrors: 'THE HOUSE OF MIRRORS', coaster: 'THE ROLLER COASTER', circus3: 'CHASE, MIRRORS, COASTER' });
Object.assign(TRY_NEWS, {
  chase: 'Past the line a clown car chases you. Keep going; it turns off at the far end',
  mirrors: 'In the house of mirrors the camera turns round. Find the way between the glass; mind the trapdoors',
  coaster: 'Roll into the coaster car while it waits at the station. No car, no ride',
  circus3: 'The clown car chase, the house of mirrors and the roller coaster',
});
const CH_W = 3.2, MR_W = 3.6, MR_STEP = 4.2, CO_LEN = 2.2;
function circLay3(spec, pieces, x, y, z) {
  const flat = (zc, L, yy = y, w = 2.6, xx = x) => pieces.push(F(xx, cr2(zc), w, L, yy));
  if (spec.t === 'chase') {
    flat(z - spec.L / 2 - 2, spec.L + 4, y, CH_W);
    if (spec.pins) {                                           // juggling pins to weave round, alternate sides
      const pts = []; for (let k = 0; k < spec.pins; k++) pts.push([cr2(x + (k % 2 ? 0.75 : -0.75)), cr2(z - 2 - spec.L * (k + 1) / (spec.pins + 1))]);
      pieces.push(POSTS(pts, y, x, cr2(z - 2 - spec.L / 2), CH_W, spec.L));
    }
    pieces.push({ ...spec, x, z: cr2(z - 2), y, w: CH_W, d: spec.L });
    return spec.L + 4;
  }
  if (spec.t === 'mirror') {
    const L = spec.parts * MR_STEP + 3;
    flat(z - 1.5 - L / 2, L + 3, y, MR_W);                        // one floor; its trapdoors are the house's own
    pieces.push({ ...spec, x, z: cr2(z - 1.5), y, w: MR_W, d: L });
    return L;
  }
  if (spec.t === 'coaster') {
    flat(z - 2, 4); const zs = z - 4, zEnd = zs - 34;
    flat(zEnd - 2.5, 5, y + (spec.dy || 0));
    pieces.push({ ...spec, x, z: cr2(zs), y, w: 2.6, d: 34, zEnd: cr2(zEnd) });
    return { len: 4 + 34 + 5, dy: spec.dy || 0 };
  }
  return 0;
}

// ---- THE CLOWN CAR CHASE ----
function buildChase(pc) {
  const { K, PK } = circMat(), Ch = { pc, state: 'armed', z: 0, x: pc.x, t: 0 };
  Ch.car = new Group(); levelGroup.add(Ch.car); Ch.car.visible = false;
  const body = new Mesh(cqClownCarGeo(1), K.paint); body.scale.setScalar(1.35); body.rotation.y = Math.PI / 2; Ch.car.add(body);   // nose toward -z
  const clown = new Mesh(cqCellGeo(1, 1.6), K.figs); clown.position.set(0, 0.25, 0.4); Ch.car.add(clown);
  const line = new Mesh(new PlaneGeometry(pc.w, 0.25), new MeshBasicMaterial({ color: 0xFFE070, toneMapped: false })); line.rotation.x = -Math.PI / 2; line.position.set(pc.x, pc.y + 0.02, pc.z); levelGroup.add(line);
  for (const [gz, s] of [[pc.z + 1.5, -1], [pc.z - pc.d - 1, 1]]) {   // a garage at each end: out of one, into the other
    const g = pbBuild();
    for (let k = 0; k < 5; k++) g.geo(new BoxGeometry(2.4, 0.42, 2.6), placeAt(pc.x + s * (pc.w / 2 + 1.5), pc.y + 0.21 + k * 0.42, gz), k % 2 ? 0xFFF1D2 : 0x2A4AE8);
    g.geo(new ConeGeometry(1.9, 1.1, 4), placeAt(pc.x + s * (pc.w / 2 + 1.5), pc.y + 2.65, gz, 0, Math.PI / 4, 0), 0xE8303A);
    g.geo(new BoxGeometry(0.06, 1.4, 1.8), placeAt(pc.x + s * (pc.w / 2 + 0.27), pc.y + 0.7, gz), 0x1A1024);
    levelGroup.add(new Mesh(g.done(), K.paint));
  }
  Ch.puffs = cqConfetti(levelGroup);
  circ.chases.push(Ch);
}
function chaseStep(dt) {
  for (const Ch of circ.chases) {
    const pc = Ch.pc, end = pc.z - pc.d;
    if (Ch.state === 'armed') {
      if (state === 'play' && ball.p.z < pc.z - 0.4 && ball.p.z > end && Math.abs(ball.p.y - R - pc.y) < 1) { Ch.state = 'wait'; Ch.t = 0; sound('honk'); }
      continue;
    }
    if (ball.p.z > pc.z + 0.5 || state !== 'play') { if (state === 'play' || state === 'home') { Ch.state = 'armed'; Ch.car.visible = false; } continue; }   // back behind the line: it goes home
    Ch.t += dt;
    if (Ch.state === 'wait') {                                  // out of its garage, onto the rail behind you
      const f = Math.min(1, Ch.t / pc.delay); Ch.car.visible = true;
      Ch.x = pc.x - (pc.w / 2 + 1.5) * (1 - f); Ch.z = pc.z + 1.5 - 1.5 * f; Ch.car.rotation.y = (1 - f) * Math.PI / 2;
      if (f >= 1) { Ch.state = 'run'; Ch.v = 2; }
    } else if (Ch.state === 'run') {                             // after you, faster and faster up to its speed, steering for you
      Ch.v = Math.min(pc.speed, Ch.v + 4 * dt); Ch.z -= Ch.v * dt;
      Ch.x += clamp(ball.p.x - Ch.x, -2 * dt, 2 * dt); Ch.car.rotation.y = 0;
      if (Math.hypot(ball.p.x - Ch.x, ball.p.z - Ch.z) < 1.15 && Math.abs(ball.p.y - R - pc.y) < 0.8) {   // caught
        sound('honk'); sound('bump'); shake = Math.max(shake, 0.3); burst(ball.p.x, ball.p.y + 0.2, ball.p.z, 0xFFE070, 20, 4);
        ball.v.set(0, 0, 0); startFall(); Ch.state = 'armed'; Ch.car.visible = false; continue;
      }
      if (Ch.z < end - 0.5) { Ch.state = 'off'; Ch.t = 0; }
    } else if (Ch.state === 'off') {                             // into the garage at the far end
      const f = Math.min(1, Ch.t / 0.8); Ch.x = pc.x + (pc.w / 2 + 1.5) * f; Ch.z = end - 0.5 - 0.5 * f; Ch.car.rotation.y = -f * Math.PI / 2;
      if (f >= 1) { Ch.state = 'done'; Ch.car.visible = false; }
    }
    Ch.car.position.set(Ch.x, pc.y + 0.55 + (Ch.state === 'run' ? Math.abs(Math.sin(simT * 12)) * 0.06 : 0), Ch.z);
  }
}

// ---- THE HOUSE OF MIRRORS ----
let cqMirrorSignMemo = null;
const cqMirrorSign = () => cqMirrorSignMemo || (cqMirrorSignMemo = canvasTex(512, 160, (g) => {
  tl(g, tlRR(g, 8, 8, 496, 144, 30), '#6A2A9A', { lw: 8, box: [8, 8, 504, 152], pat: tlStarPat(g, [8, 8, 504, 152], 'rgba(255,255,255,0.12)', 8, 36) });
  pbWord(g, 'HALL OF MIRRORS', 262, 86, 56, INK, null); pbWord(g, 'HALL OF MIRRORS', 256, 80, 56, '#F2C230', INK, 0.14);
}));
function buildMirror(pc) {
  const { K, PK } = circMat(), M = { pc, zs: pc.z, ze: pc.z - pc.d, walls: [], clones: [] };
  const glassT = canvasTex(128, 256, (g) => {                 // silvered glass: pale, a soft sheen down it, a few streaks of light
    g.fillStyle = pbLin(g, 0, 0, 128, 0, [[0, '#B8C8E0'], [0.35, '#F4F8FF'], [0.6, '#D0DCEE'], [1, '#A8B8D4']]); g.fillRect(0, 0, 128, 256);
    g.fillStyle = 'rgba(255,255,255,0.5)'; for (const x of [22, 30, 88]) { g.save(); g.translate(x, 0); g.rotate(0.3); g.fillRect(0, -20, 5, 320); g.restore(); }
  }, true);
  const glass = new MeshStandardMaterial({ map: glassT, metalness: 0.7, roughness: 0.1, envMap: K.env, envMapIntensity: 1.2, emissive: 0xFFFFFF, emissiveMap: glassT, emissiveIntensity: 0.35 });
  const H = 1.1, x0 = pc.x - pc.w / 2, x1 = pc.x + pc.w / 2;
  const wall = (cx, cz, w, d) => {                             // a mirror pane in a gold frame; solid
    const m = new Mesh(new BoxGeometry(w, H, d), glass); m.position.set(cx, pc.y + H / 2, cz); levelGroup.add(m);
    const fr = new Mesh(new BoxGeometry(w + 0.06, 0.1, d + 0.06), PK.gold); fr.position.set(cx, pc.y + H, cz); levelGroup.add(fr);
    colliders.push({ mesh: m, pos: m.position.clone(), prev: m.position.clone(), quat: new Quaternion(), inv: new Quaternion(), half: new Vector3(w / 2, H / 2, d / 2), delta: new Vector3(), ferry: null, holo: null, pad: null, obstacle: 'mirror' });
    M.walls.push({ cx, cz, w, d });
  };
  wall(x0 - 0.1, pc.z - pc.d / 2, 0.2, pc.d); wall(x1 + 0.1, pc.z - pc.d / 2, 0.2, pc.d);   // the side walls
  for (let k = 0; k < pc.parts; k++) {                         // partitions from alternate sides, a gap of 1.25 m left at the other
    const zc = pc.z - MR_STEP * (k + 0.75), side = k % 2 ? 1 : -1, len = pc.w - 1.25;
    wall(side < 0 ? x0 + len / 2 : x1 - len / 2, zc, len, 0.2);
    // the trapdoor: in the pocket this partition closes, behind it, a dark hole in the floor
    const hx = side < 0 ? x0 + 0.9 : x1 - 0.9, hz = zc + 1.15;
    M.traps = M.traps || []; M.traps.push({ x: hx, z: hz, r: 0.62 });
    const hole = new Mesh(new CircleGeometry(0.62, 28), new MeshBasicMaterial({ color: 0x08040C })); hole.rotation.x = -Math.PI / 2; hole.position.set(hx, pc.y + 0.015, hz); levelGroup.add(hole);
    const rim = new Mesh(new RingGeometry(0.62, 0.72, 28), new MeshBasicMaterial({ color: 0xFF2A20, toneMapped: false })); rim.rotation.x = -Math.PI / 2; rim.position.set(hx, pc.y + 0.018, hz); levelGroup.add(rim);
  }
  const arch = pbBuild();                                      // the front: a purple arch, a sign
  for (const s of [-1, 1]) arch.geo(new BoxGeometry(0.5, 3.4, 0.6), placeAt(pc.x + s * (pc.w / 2 + 0.35), pc.y + 1.7, pc.z + 0.2), 0x6A2A9A);
  arch.geo(new BoxGeometry(pc.w + 1.3, 0.5, 0.7), placeAt(pc.x, pc.y + 3.4, pc.z + 0.2), 0x6A2A9A);
  levelGroup.add(new Mesh(arch.done(), K.paint));
  const sign = new Mesh(new PlaneGeometry(4.2, 1.3), new MeshBasicMaterial({ map: cqMirrorSign(), transparent: true, toneMapped: false })); sign.position.set(pc.x, pc.y + 4.3, pc.z + 0.5); levelGroup.add(sign);
  for (let k = 0; k < 3; k++) { const c = marble.clone(); c.visible = false; levelGroup.add(c); M.clones.push(c); }   // reflections
  circ.mirrors.push(M);
}
function mirrorStep() {                                        // a trapdoor: in, and down
  for (const M of circ.mirrors) for (const T of M.traps || []) {
    if (Math.hypot(ball.p.x - T.x, ball.p.z - T.z) < T.r - 0.12 && Math.abs(ball.p.y - R - M.pc.y) < 0.3 && state === 'play') { ball.p.y -= 0.3; ball.v.set(0, -3, 0); sound('drop'); startFall(); return; }
  }
}
function animateMirrors() {
  for (const M of circ.mirrors) {
    const inside = ball.p.z < M.zs + 0.5 && ball.p.z > M.ze - 0.5 && Math.abs(ball.p.x - M.pc.x) < M.pc.w;
    const x0 = M.pc.x - M.pc.w / 2 - 0.1, x1 = M.pc.x + M.pc.w / 2 + 0.1;
    const pos = [[2 * x0 - ball.p.x, ball.p.z], [2 * x1 - ball.p.x, ball.p.z]];
    const part = M.walls.slice(2).sort((a, b) => Math.abs(a.cz - ball.p.z) - Math.abs(b.cz - ball.p.z))[0];   // in the nearest partition too
    if (part && Math.abs(ball.p.x - part.cx) < part.w / 2 + 0.4) pos.push([ball.p.x, 2 * part.cz - ball.p.z]);
    M.clones.forEach((c, i) => { const p = pos[i]; c.visible = inside && !!p; if (p) { c.position.set(p[0], ball.p.y, p[1]); c.quaternion.copy(marble.quaternion); c.material = marble.material; } });
  }
}
// The camera inside: swung round the marble by the house's turn, easing in at the door and out at the far end.
let mirrorYaw = 0;
function circCam(dt) {
  let want = 0;
  for (const M of circ.mirrors) if (ball.p.z < M.zs - 0.3 && ball.p.z > M.ze + 0.3 && Math.abs(ball.p.x - M.pc.x) < M.pc.w) want = M.pc.turn;
  mirrorYaw += (want - mirrorYaw) * (REDUCED ? 1 : 1 - Math.exp(-2.4 * dt));
  if (Math.abs(mirrorYaw) < 0.002) return;
  const P = camParams(), c = Math.cos(mirrorYaw), s = Math.sin(mirrorYaw), fx = camFocus.x, fz = camFocus.z;
  camera.position.set(fx + s * P.back, camera.position.y, fz + c * P.back);
  camera.lookAt(fx - s * P.ahead, camY, fz - c * P.ahead);
}

// ---- THE ROLLER COASTER ----
// A track from the station out over hills and back to a rail beyond; a car comes in every period, waits, and goes.
function coasterPath(pc) {
  const y = pc.y, z0 = pc.z, x = pc.x, L = pc.z - pc.zEnd, ey = pc.y + (pc.dy || 0), pts = [];
  const key = [[0, 0, 0], [0.12, 0, 0.2], [0.34, 0, pc.lift], [0.46, 0, pc.lift + 0.5], [0.62, 1.5, pc.lift - pc.drop], [0.72, 3.2, pc.lift - pc.drop + 1.2], [0.8, 3.4, 2.4], [0.88, 1.6, 1.4], [0.96, 0.2, (ey - y) * 0.6], [1, 0, ey - y]];
  for (const [f, dx, dy] of key) pts.push(new Vector3(x + dx, y + dy + 0.35, z0 - f * L));
  const out = [];                                               // Catmull-Rom through the key points, a point every 0.25 m or so
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)], n = Math.ceil(p1.distanceTo(p2) / 0.25);
    for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push(new Vector3().addScaledVector(p0, -0.5 * t3 + t2 - 0.5 * t).addScaledVector(p1, 1.5 * t3 - 2.5 * t2 + 1).addScaledVector(p2, -1.5 * t3 + 2 * t2 + 0.5 * t).addScaledVector(p3, 0.5 * t3 - 0.5 * t2)); }
  }
  out.push(pts[pts.length - 1].clone());
  const s = [0]; for (let i = 1; i < out.length; i++) s.push(s[i - 1] + out[i].distanceTo(out[i - 1]));
  return { pts: out, s, len: s[s.length - 1] };
}
function coasterAt(Co, d) {                                     // the point and heading d metres along
  const { pts, s } = Co.path; let i = 1; while (i < s.length - 1 && s[i] < d) i++;
  const f = clamp((d - s[i - 1]) / Math.max(1e-6, s[i] - s[i - 1]), 0, 1);
  return { p: new Vector3().lerpVectors(pts[i - 1], pts[i], f), dir: new Vector3().subVectors(pts[i], pts[i - 1]).normalize() };
}
function buildCoaster(pc) {
  const { K, PK } = circMat(), Co = { pc, path: coasterPath(pc), car: null };
  const B = pbBuild(), path = Co.path;
  for (let i = 1; i < path.pts.length; i++) {                   // two red rails, white ties, supports down to the floor every few metres
    const a = path.pts[i - 1], b = path.pts[i], mid = new Vector3().addVectors(a, b).multiplyScalar(0.5), dir = new Vector3().subVectors(b, a), len = dir.length();
    const yaw = Math.atan2(dir.x, dir.z), pitch = -Math.asin(clamp(dir.y / len, -1, 1));
    for (const sx of [-0.5, 0.5]) B.geo(new BoxGeometry(0.1, 0.1, len + 0.02), placeAt(mid.x + sx * Math.cos(yaw), mid.y - 0.3, mid.z - sx * Math.sin(yaw), pitch, yaw, 0), 0xE8303A);
    if (i % 3 === 0) B.geo(new BoxGeometry(1.2, 0.06, 0.12), placeAt(mid.x, mid.y - 0.36, mid.z, pitch, yaw, 0), 0xFFF1D2);
    if (i % 12 === 0) B.geo(new CylinderGeometry(0.07, 0.09, mid.y - (pc.y - 9), 6), placeAt(mid.x, (mid.y + pc.y - 9) / 2, mid.z), 0xFFF1D2);
  }
  levelGroup.add(new Mesh(B.done(), K.paint));
  const car = pbBuild();                                        // a tin car: a seat with a high back, red, a gold rim, a star
  car.geo(new BoxGeometry(1.5, 0.5, CO_LEN), placeAt(0, -0.05, 0), 0xE8303A);
  car.geo(new BoxGeometry(1.56, 0.08, CO_LEN + 0.06), placeAt(0, 0.22, 0), 0xF2C230);
  car.geo(new BoxGeometry(1.5, 0.7, 0.2), placeAt(0, 0.5, CO_LEN / 2 - 0.1), 0xE8303A);
  for (const sx of [-0.5, 0.5]) for (const sz of [-0.7, 0.7]) car.geo(new CylinderGeometry(0.16, 0.16, 0.12, 12), placeAt(sx, -0.3, sz, 0, 0, Math.PI / 2), 0x231A2E);
  Co.car = new Mesh(car.done(), K.paint); levelGroup.add(Co.car);
  // Its run, worked out once: how far along it is every twentieth of a second, faster the lower it is.
  const top = pc.y + pc.lift + 0.85; Co.tab = [0];
  for (let d = 0, k = 0; d < Co.path.len && k < 2000; k++) { const at = coasterAt(Co, d); d += Math.max(3.2, Math.sqrt(Math.max(0, 2 * 9.8 * (top - at.p.y)))) * 0.05; Co.tab.push(d); }
  pc.period = Math.max(pc.period, 0.8 + pc.wait + Co.tab.length * 0.05 + 0.5);   // the next car only once this one is home
  const sta = pbBuild();                                        // the station: a striped canopy on gold posts over the stop
  for (const s of [-1, 1]) for (const e of [-1, 1]) sta.geo(new CylinderGeometry(0.08, 0.08, 2.6, 8), placeAt(pc.x + s * 1.3, pc.y + 1.3, pc.z + e * 1.4 - 1.2), 0xF2C230);
  for (let k = 0; k < 8; k++) sta.geo(new BoxGeometry(2.9, 0.12, 0.42), placeAt(pc.x, pc.y + 2.65, pc.z - 2.6 + 1.4 - k * 0.36), k % 2 ? 0xFFF1D2 : 0x2A4AE8);
  levelGroup.add(new Mesh(sta.done(), K.paint));
  circ.coasters.push(Co);
}
// Where the car is: coming in (0.8 s), waiting, then out along the track at a speed that goes with its height.
function coasterCar(Co, t) {
  const pc = Co.pc, u = (((t - (pc.phase || 0)) % pc.period) + pc.period) % pc.period;
  if (u < 0.8) return { d: -6 + 6 * Math.sin(Math.PI / 2 * u / 0.8), wait: false, going: false };
  if (u < 0.8 + pc.wait) return { d: 0, wait: true, left: 0.8 + pc.wait - u, going: false };
  const tt = u - 0.8 - pc.wait, T = Co.tab, i = Math.min(T.length - 1, Math.floor(tt / 0.05)), f = Math.min(1, tt / 0.05 - i);
  const d = i + 1 < T.length ? T[i] + (T[i + 1] - T[i]) * f : T[T.length - 1];
  return { d: Math.min(d, Co.path.len), wait: false, going: true, done: d >= Co.path.len };
}
function coasterStep() {
  for (const Co of circ.coasters) {
    if (ball.circ) continue;
    const C = coasterCar(Co, simT);
    if (!C.wait) continue;
    if (Math.abs(ball.p.x - Co.pc.x) < 0.8 && ball.p.z < Co.pc.z + 0.4 && ball.p.z > Co.pc.z - 1.6 && Math.abs(ball.p.y - R - Co.pc.y) < 0.5) { ball.circ = { coaster: Co }; sound('thunk'); }
  }
}
// Riding: in the car, wherever it is; at the end, out onto the rail beyond. The camera follows the car up and down.
function coasterHeld(dt) {
  const Co = ball.circ.coaster, C = coasterCar(Co, simT), at = coasterAt(Co, Math.max(0, C.d));
  ball.p.copy(at.p).y += R - 0.15; ball.v.set(0, 0, 0); lastGroundY = ball.p.y - R;
  if (C.done || (C.going && C.d >= Co.path.len - 0.05)) {
    ball.circ = null; ball.p.set(Co.pc.x, Co.pc.y + (Co.pc.dy || 0) + R + 0.05, Co.pc.zEnd - 0.6); ball.v.set(0, 0, -3); sound('pop');
  }
}
function animateCoasters() {
  for (const Co of circ.coasters) {
    const C = coasterCar(Co, simT);
    if (C.d < 0) { const p = new Vector3(Co.pc.x, Co.pc.y + 0.35, Co.pc.z - C.d); Co.car.position.copy(p); Co.car.rotation.set(0, 0, 0); continue; }
    const at = coasterAt(Co, C.d); Co.car.position.copy(at.p).y -= 0.1;
    Co.car.rotation.set(0, 0, 0); Co.car.lookAt(at.p.x - at.dir.x, at.p.y - 0.1 - at.dir.y, at.p.z - at.dir.z);
    Co.car.visible = !C.done;
  }
}

// ---- THE CAROUSEL: horses on every roundabout ----
function carouselHorses(Rd) {
  const { K } = circMat(), n = 5, rm = (Rd.ri + Rd.ro) / 2;
  tkUndo.push(() => { circ.horses = circ.horses.filter((h) => h.Rd !== Rd); });   // gone with the circus's dress
  for (let k = 0; k < n; k++) {
    const a0 = k / n * TAU, h = new Mesh(cqCellGeo(8, 1.9), K.figs), pole = new Mesh(new CylinderGeometry(0.06, 0.06, 2.4, 8), cqPieceKit(cqLook).gold);
    h.position.set(Math.cos(a0) * rm, 0.2, Math.sin(a0) * rm); h.rotation.y = -a0; pole.position.set(Math.cos(a0) * rm, 1.2, Math.sin(a0) * rm);
    tkAdd(Rd.spinGrp, h); tkAdd(Rd.spinGrp, pole);
    circ.horses.push({ Rd, a0, rm, h, ph: k * 1.3 });
  }
}
function horseStep() {                                          // solid: as a bollard is, turning with the floor
  for (const Hr of circ.horses) {
    const a = Hr.a0 - Hr.Rd.spinGrp.rotation.y, hx = Hr.Rd.x + Math.cos(a) * Hr.rm, hz = Hr.Rd.z + Math.sin(a) * Hr.rm;
    postContact({ x: hx, z: hz, y: Hr.Rd.y, r: 0.36, h: 2 });
  }
}
function animateHorses() { for (const Hr of circ.horses) Hr.h.position.y = 0.2 + (REDUCED ? 0 : 0.35 * Math.sin(simT * 2.2 + Hr.ph)); }

function circStep3(dt) {
  if (circ.chases.length) chaseStep(dt);
  if (circ.mirrors.length) mirrorStep();
  if (circ.coasters.length) coasterStep();
  if (circ.horses.length) horseStep();
}
function animateCirc3() { animateMirrors(); animateCoasters(); animateHorses(); }
function circState3() {
  return {
    chases: circ.chases.map((Ch) => ({ z: Ch.pc.z, d: Ch.pc.d, state: Ch.state, car: [Ch.x, Ch.z], speed: Ch.pc.speed, pins: Ch.pc.pins })),
    mirrors: circ.mirrors.map((M) => ({ z: M.zs, d: M.pc.d, w: M.pc.w, parts: M.pc.parts, x: M.pc.x, traps: M.traps })),
    coasters: circ.coasters.map((Co) => { const C = coasterCar(Co, simT); return { z: Co.pc.z, zEnd: Co.pc.zEnd, wait: C.wait, left: C.left || 0, d: C.d, y: Co.pc.y }; }),
    horses: circ.horses.length,
  };
}
