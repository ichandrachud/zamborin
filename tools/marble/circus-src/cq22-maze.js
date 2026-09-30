/* THE HALL OF MIRRORS IS A MAZE (owner, 2026-09-30, with two photographs of mirror mazes: "When I said hall of mirrors
   I meant a maze of mirrors where it feels like it is impossible to get out"; the camera: "Low, inside the maze"). A
   circus level's magician's cabinet leads into a maze made for that level (czMazePocket, larger toward 200): walls of
   green mirror glass to the ceiling, a dark ceiling with a lamp over every cell, a dark polished floor with lit seams;
   some walls are clear glass, where there seems to be a way through (bump one and it cracks, so you know it next
   time). The way out is a magician's cabinet against the far wall. Inside, the camera comes down behind the marble,
   under the ceiling, and turns to look the way it rolls; the stick turns with it (up is forward, as you look). The
   three mirror planes most in view are true mirrors (czMazePlanar: the maze drawn again through each, so a dead end
   shows the marble rolling at itself); the rest show a surround map of the maze from the camera (a PMREM every third
   frame, two maps in turn so none is drawn while it is read) with the true mirrors in it, so a mirror in a mirror
   shows them again, a shade darker each time. */
const CZ_MC = 2.6, CZ_MH = 4.2;                               // a cell of the maze, and the height of its walls
function czMazePocket(n) {
  const r = seeded(9901 + n * 173), t = clamp((n - 151) / 49, 0, 1), CS = CZ_MC;
  const cols = 5 + Math.round(3 * t), rows = 6 + Math.round(5 * t), ce = Math.floor(cols / 2), cx = Math.floor(r() * cols);
  const x0 = -(ce + 0.5) * CS, z0 = CS / 2;                   // the way in, cell (ce, 0), centred on the start
  const walls = new Map(), key = (o, a, b) => o + ',' + a + ',' + b;
  for (let c = 0; c < cols; c++) for (let k = 0; k <= rows; k++) walls.set(key('h', c, k), 'm');
  for (let rr = 0; rr < rows; rr++) for (let c = 0; c <= cols; c++) walls.set(key('v', c, rr), 'm');
  const edge = (c, rr, d) => (d === 'n' ? key('h', c, rr + 1) : d === 's' ? key('h', c, rr) : d === 'e' ? key('v', c + 1, rr) : key('v', c, rr));
  const D4 = [['n', 0, 1], ['s', 0, -1], ['e', 1, 0], ['w', -1, 0]], seen = new Set([ce + ',0']), stack = [[ce, 0]];
  while (stack.length) {                                      // one way between any two places (a maze grown from the way in)
    const [c, rr] = stack[stack.length - 1], nx = D4.map(([d, dc, dr]) => [d, c + dc, rr + dr]).filter(([, a, b]) => a >= 0 && a < cols && b >= 0 && b < rows && !seen.has(a + ',' + b));
    if (!nx.length) { stack.pop(); continue; }
    const [d, a, b] = nx[Math.floor(r() * nx.length)]; walls.delete(edge(c, rr, d)); seen.add(a + ',' + b); stack.push([a, b]);
  }
  const inner = [...walls.keys()].filter((k) => { const [o, a, b] = k.split(','); return o === 'h' ? +b > 0 && +b < rows : +a > 0 && +a < cols; });
  for (let k = 2 + Math.round(3 * t); k > 0 && inner.length; k--) walls.delete(inner.splice(Math.floor(r() * inner.length), 1)[0]);   // loops: round in circles
  for (let k = 3 + Math.round(6 * t); k > 0 && inner.length; k--) walls.set(inner.splice(Math.floor(r() * inner.length), 1)[0], 'g');   // glass where it looks open
  const xe = cr2(x0 + (cx + 0.5) * CS), zn = cr2(z0 - rows * CS);
  const pieces = [F(0, 0, 0.6, 0.6, 0),
                  { t: 'czmaze', x: cr2(x0 + cols * CS / 2), z: cr2(z0 - rows * CS / 2), y: 0, w: cols * CS, d: rows * CS, x0: cr2(x0), z0: cr2(z0), cols, rows, cs: CS, h: CZ_MH,
                    walls: [...walls.entries()], entry: ce, exit: cx },
                  WORM(xe, cr2(zn + 0.7), 2, 0, 'exit')];
  return { pieces, start: [0, 0, 1], world: 'mirrors' };
}
// The way through, cell by cell (for the autopilot; the player has only the mirrors): [x, z] of each cell's middle.
function czMazePath(pc) {
  const W = new Map(pc.walls), key = (c, rr, d) => (d === 'n' ? 'h,' + c + ',' + (rr + 1) : d === 's' ? 'h,' + c + ',' + rr : d === 'e' ? 'v,' + (c + 1) + ',' + rr : 'v,' + c + ',' + rr);
  const prev = new Map([[pc.entry + ',0', null]]), Q = [[pc.entry, 0]];
  while (Q.length) {
    const [c, rr] = Q.shift(); if (c === pc.exit && rr === pc.rows - 1) break;
    for (const [d, dc, dr] of [['n', 0, 1], ['s', 0, -1], ['e', 1, 0], ['w', -1, 0]]) {
      const a = c + dc, b = rr + dr; if (a < 0 || a >= pc.cols || b < 0 || b >= pc.rows || W.has(key(c, rr, d)) || prev.has(a + ',' + b)) continue;
      prev.set(a + ',' + b, c + ',' + rr); Q.push([a, b]);
    }
  }
  const out = []; for (let k = pc.exit + ',' + (pc.rows - 1); k; k = prev.get(k)) { const [c, rr] = k.split(',').map(Number); out.unshift([pc.x0 + (c + 0.5) * pc.cs, pc.z0 - (rr + 0.5) * pc.cs]); }
  return out;
}

let czMazeNow = null, czYaw = 0, czEnv = null, czEnvFrame = 0, czEnvAt = null;
function czMazeKit() {
  const K = cqKit('tintoy'); if (K.maze) return K.maze;
  const keep = (m) => { m.userData.keep = true; return m; };
  const seamT = canvasTex(256, 256, (g) => {                 // the floor: dark polished glass tiles, their seams lit
    g.fillStyle = '#0C2422'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(120,255,230,0.35)'; g.lineWidth = 10; for (let k = 0; k <= 256; k += 128) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 256); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(256, k); g.stroke(); }
    g.strokeStyle = '#C8FFF4'; g.lineWidth = 3; for (let k = 0; k <= 256; k += 128) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 256); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(256, k); g.stroke(); }
  }, true);
  const lightT = canvasTex(256, 256, (g) => {                // the ceiling: dark glass, a lamp over every cell, thin lit seams
    g.fillStyle = '#061614'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(160,255,235,0.6)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 253, 253);
    g.fillStyle = pbRad(g, 128, 128, 0, 30, [[0, '#FFFFFF'], [0.3, '#DFFFF8'], [1, 'rgba(6,22,20,0)']]); g.fillRect(96, 96, 64, 64);
    for (const [x, y] of [[40, 40], [216, 40], [40, 216], [216, 216]]) { g.fillStyle = pbRad(g, x, y, 0, 10, [[0, '#E8FFFA'], [1, 'rgba(6,22,20,0)']]); g.fillRect(x - 10, y - 10, 20, 20); }
  }, true);
  return (K.maze = {
    mirror: keep(new MeshStandardMaterial({ color: 0x5E9A8E, metalness: 1, roughness: 0, envMapIntensity: 1 })),   // (green glass: each mirror in a mirror a shade darker, so the corridors in them fade away instead of adding up to a glare)
    floor: keep(new MeshStandardMaterial({ color: 0xFFFFFF, map: seamT, emissive: 0xFFFFFF, emissiveMap: seamT, emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.08, envMapIntensity: 0.6 })),
    ceil: keep(new MeshBasicMaterial({ map: lightT, side: DoubleSide })),
    glass: keep(new MeshStandardMaterial({ color: 0xD8FFF8, metalness: 0.3, roughness: 0.02, envMapIntensity: 0.8, transparent: true, opacity: 0.14, depthWrite: false, side: DoubleSide })),
    edge: keep(new MeshBasicMaterial({ color: 0xE8FFFA, toneMapped: false, transparent: true, opacity: 0.55 })),
    crack: czKit3().crack,
  });
}
function buildCzMaze(pc) {
  const Z = czMazeKit(), CS = pc.cs, H = pc.h, X = (c) => pc.x0 + (c + 0.5) * CS, Zr = (rr) => pc.z0 - (rr + 0.5) * CS, T = 0.12;
  const mir = pbBuild(), edges = pbBuild(), panes = [];
  const box = (x, y, z, hx, hy, hz, tag, gate) => {
    const m = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), HIDDEN); m.visible = false; levelGroup.add(m);
    const pos = new Vector3(x, y, z), q = new Quaternion();
    colliders.push({ mesh: m, pos, prev: pos.clone(), quat: q, inv: q.clone(), half: new Vector3(hx, hy, hz), delta: new Vector3(), ferry: null, holo: null, pad: null, obstacle: tag, gate });
  };
  for (const [k, type] of pc.walls) {
    const [o, a, b] = k.split(','), A = +a, Bn = +b, along = o === 'h';
    const x = along ? X(A) : pc.x0 + A * CS, z = along ? pc.z0 - Bn * CS : Zr(Bn), lx = along ? CS + T : T, lz = along ? T : CS + T;
    if (type === 'm') { mir.geo(new BoxGeometry(lx, H, lz), placeAt(x, H / 2, z), 0xFFFFFF); box(x, H / 2, z, lx / 2, H / 2, lz / 2, 'czfix'); continue; }
    const pane = new Mesh(new BoxGeometry(along ? CS - 0.04 : 0.03, H, along ? 0.03 : CS - 0.04), Z.glass); pane.position.set(x, H / 2, z); levelGroup.add(pane);
    for (const s of [-1, 1]) edges.geo(new BoxGeometry(along ? 0.03 : 0.04, H, along ? 0.04 : 0.03), placeAt(x + (along ? s * (CS / 2 - 0.02) : 0), H / 2, z + (along ? 0 : s * (CS / 2 - 0.02))), 0xFFFFFF);
    const crackMat = new MeshBasicMaterial({ map: Z.crack, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide });
    const crack = new Mesh(new PlaneGeometry(1.4, 1.4), crackMat); crack.position.set(x, 0.75, z); if (!along) crack.rotation.y = Math.PI / 2; levelGroup.add(crack);
    const g = { cz: true, kind: 'czglass', state: 'shut', flash: 0, cracked: 0, crackMat, P: null };
    box(x, H / 2, z, lx / 2, H / 2, lz / 2, 'gate', g); panes.push(g);
  }
  for (let c = 0; c <= pc.cols; c++) for (let rr = 0; rr <= pc.rows; rr++)   // a bright seam up every corner: the grid the mirrors repeat
    edges.geo(new BoxGeometry(0.05, H, 0.05), placeAt(pc.x0 + c * CS, H / 2, pc.z0 - rr * CS), 0xFFFFFF);
  const walls = new Mesh(mir.done(), Z.mirror); levelGroup.add(walls);
  const seams = new Mesh(edges.done(), Z.edge); levelGroup.add(seams);
  const W = pc.cols * CS, D = pc.rows * CS;
  const floor = new Mesh(new PlaneGeometry(W, D), Z.floor); floor.rotation.x = -Math.PI / 2; floor.position.set(pc.x, 0.002, pc.z); Z.floor.map.repeat.set(W / CS, D / CS); floor.receiveShadow = true; levelGroup.add(floor);
  const ceil = new Mesh(new PlaneGeometry(W, D), Z.ceil); ceil.rotation.x = Math.PI / 2; ceil.position.set(pc.x, H, pc.z); Z.ceil.map.repeat.set(W / CS, D / CS); levelGroup.add(ceil);
  box(pc.x, -0.25, pc.z, W / 2, 0.25, D / 2, undefined);         // the floor the marble rolls on
  const lamps = [];                                           // little lamps in the ceiling, one over every cell: in the mirrors, stars without end
  for (let c = 0; c < pc.cols; c++) for (let rr = 0; rr < pc.rows; rr++) lamps.push(X(c), H - 0.04, Zr(rr));
  const lg = new BufferGeometry(); lg.setAttribute('position', new Float32BufferAttribute(lamps, 3));
  const pts = new Points(lg, new PointsMaterial({ size: 0.5, map: pbGlow(), color: 0xE8FFF8, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  pts.frustumCulled = false; levelGroup.add(pts);
  for (const c of colliders) if (c.mesh && c.mesh.visible && Math.abs(c.pos.x) < 0.01 && Math.abs(c.pos.z) < 0.01 && c.half.x < 0.4) c.mesh.visible = false;   // the start's little tile
  const planes = new Map(), faces = new Map();              // each mirror's two faces, gathered by the plane they lie in (for the true mirrors)
  for (const [k, type] of pc.walls) {
    if (type !== 'm') continue;
    const [o, a, b] = k.split(','), A = +a, Bn = +b, along = o === 'h', line = along ? Bn : A, last = along ? pc.rows : pc.cols;
    for (const sg of [1, -1]) {
      if (along ? (sg > 0 ? line === 0 : line === last) : (sg > 0 ? line === last : line === 0)) continue;   // (the outside of the outer wall: never seen)
      const key = o + ',' + line + ',' + (sg > 0 ? '+' : '-');
      if (!faces.has(key)) faces.set(key, pbBuild());
      const f = along ? [X(A), H / 2, pc.z0 - Bn * CS + sg * T / 2, 0, sg > 0 ? 0 : Math.PI, 0] : [pc.x0 + A * CS + sg * T / 2, H / 2, Zr(Bn), 0, sg > 0 ? Math.PI / 2 : -Math.PI / 2, 0];
      faces.get(key).geo(new PlaneGeometry(CS, H), placeAt(...f), 0xFFFFFF);
      if (!planes.has(key)) planes.set(key, { n: along ? new Vector3(0, 0, sg) : new Vector3(sg, 0, 0), p: new Vector3(f[0], 0, f[2]), mesh: null });
    }
  }
  for (const [key, B] of faces) { const P = planes.get(key); P.mesh = new Mesh(B.done(), Z.mirror); P.mesh.visible = false; levelGroup.add(P.mesh); }
  levelGroup.traverse((o) => { o.frustumCulled = false; });   // (a small maze, all of it near: and a mirror's tilted view culls wrongly)
  czMazeNow = { pc, lg: levelGroup, panes, walls: new Map(pc.walls), mats: [Z.mirror, Z.floor, Z.glass], planes, shown: [] };
  czYaw = 0;
}
const czMazeActive = () => !!(czMazeNow && pocket && czMazeNow.lg === levelGroup);
// The stick, turned to the camera's way of looking (the harness's own stick is the world's, and left as it is).
function czMazeInput(v) {
  if (!czMazeActive() || forced) return v;
  const [ix, iz] = v, hx = Math.sin(czYaw), hz = -Math.cos(czYaw);
  return [ix * -hz + -iz * hx, ix * hx + -iz * hz];         // right is across the view, up is along it
}
// How far the camera can stand back from (x, z) along (dx, dz) before a wall: along the maze's own grid.
function czMazeFree(x, z, dx, dz, maxD) {
  const M = czMazeNow, pc = M.pc, CS = pc.cs, cell = (px, pz) => [Math.floor((px - pc.x0) / CS), Math.floor((pc.z0 - pz) / CS)];
  let [c, rr] = cell(x, z), d = 0;
  for (; d < maxD; d += 0.05) {
    const [c2, r2x] = cell(x + dx * (d + 0.05), z + dz * (d + 0.05));
    if (c2 === c && r2x === rr) continue;
    const k = c2 > c ? 'v,' + (c + 1) + ',' + rr : c2 < c ? 'v,' + c + ',' + rr : r2x > rr ? 'h,' + c + ',' + (rr + 1) : 'h,' + c + ',' + rr;
    if (M.walls.has(k) || c2 < 0 || c2 >= pc.cols || r2x < 0 || r2x >= pc.rows) break;
    c = c2; rr = r2x;
  }
  return Math.max(0.55, d - 0.3);
}
let czFovOn = false;
function czMazeCam(dt, snap) {
  if (!czMazeActive()) {
    if (czFovOn) { czFovOn = false; fitCamera(); }
    if (czPlanar || czEnv) {                                  // out of the maze: its mirrors' pictures go (made again on the next maze)
      if (czPlanar) for (const S of czPlanar.slots) { S.rt.dispose(); S.m.dispose(); }
      if (czEnv) { for (const T of czEnv.T) T.dispose(); czEnv.pm.dispose(); }
      czPlanar = null; czEnv = null; czEnvAt = null; czMazeNow = null;
    }
    return;
  }
  const fov = camParams().fov + 28;                           // wider inside: on a phone the walls either side would be out of view
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); czFovOn = true; }
  const sp = Math.hypot(ball.v.x, ball.v.z);
  if (sp > 0.9) {                                             // turn to look the way it rolls (not round to face it when it rolls back)
    const want = Math.atan2(ball.v.x, -ball.v.z); let d = want - czYaw; d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
    if (Math.abs(d) < 2.0) czYaw += d * (snap || REDUCED ? 1 : 1 - Math.exp(-3 * dt));
  }
  const hx = Math.sin(czYaw), hz = -Math.cos(czYaw), back = czMazeFree(ball.p.x, ball.p.z, -hx, -hz, 3.2);
  camera.position.set(ball.p.x - hx * back, ball.p.y + 1.1 + 0.28 * back + 0.55 * (3.2 - back), ball.p.z - hz * back);   // (higher, looking down, where a wall is close behind)
  camera.lookAt(ball.p.x + hx * 3, ball.p.y + 0.15, ball.p.z + hz * 3);
}
// The mirrors' reflection: the maze round the camera, drawn into one of two maps while the mirrors show the other.
function czMazeReflect() {
  if (!renderer || (czEnvFrame++ % 3)) return;
  const q = camera.position, k = czEnvAt;                     // (a camera standing still sees the same mirrors: no new map)
  if (czEnv && k && Math.abs(q.x - k[0]) + Math.abs(q.y - k[1]) + Math.abs(q.z - k[2]) < 0.004) return;
  czEnvAt = [q.x, q.y, q.z];
  try {
    if (!czEnv) {
      const pm = new PMREMGenerator(renderer), A = pm.fromScene(scene, 0, 0.05, 40, { size: 128, position: camera.position }), B = pm.fromScene(scene, 0, 0.05, 40, { size: 128, position: camera.position });
      czEnv = { pm, T: [A, B], i: 0 };
    } else {
      const E = czEnv, old = E.T[1 - E.i];                    // (drawing again into a map already made came out a flat blur: a fresh one each time)
      E.T[1 - E.i] = E.pm.fromScene(scene, 0, 0.05, 40, { size: 128, position: camera.position }); old.dispose();
      E.i = 1 - E.i;
    }
    for (const m of czMazeNow.mats) if (m.envMap !== czEnv.T[czEnv.i].texture) { m.envMap = czEnv.T[czEnv.i].texture; m.needsUpdate = true; }
  } catch (e) { czEnvFrame = 1; }                            // (if the library will not, the mirrors keep the last map they had)
}
/* The true mirrors: the walls most in view (a fan of rays from the camera, along the maze's grid, weighed by
   nearness) are each drawn again as three's Reflector draws a mirror: the maze seen from the camera's image behind the
   mirror, clipped at the mirror's plane, laid on the wall where each point of it falls. So a dead end ahead shows the
   marble rolling at itself and the corridor behind it; a mirror seen in a mirror shows the surround map. */
const CZ_PLANES = 3, CZ_RT_SCALE = 0.5;
let czPlanar = null;
function czPlanarKit() {
  if (czPlanar) return czPlanar;
  const RT = czEnv.T[0].constructor, type = czEnv.T[0].texture.type;   // (the library's render target, as the reflection maps are made: the build exports no other way to one)
  const slots = [];
  for (let i = 0; i < CZ_PLANES; i++) {
    const rt = new RT(4, 4, { type, depthBuffer: true }), U = { value: new Matrix4() };
    const m = new MeshBasicMaterial({ color: 0xA4D2C6, map: rt.texture, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.userData.keep = true;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.czTexMat = U;
      sh.vertexShader = 'uniform mat4 czTexMat;\nvarying vec4 vCzUv;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vCzUv = czTexMat * modelMatrix * vec4( transformed, 1.0 );');
      sh.fragmentShader = 'varying vec4 vCzUv;\n' + sh.fragmentShader.replace('#include <map_fragment>', 'vec3 czP = vCzUv.xyz / vCzUv.w;\n  diffuseColor.rgb *= vCzUv.w <= 0.0 || czP.x < 0.0 || czP.x > 1.0 || czP.y < 0.0 || czP.y > 1.0 ? vec3( 0.002, 0.016, 0.014 ) : texture2D( map, czP.xy ).rgb;');   // (outside the picture: the dark of the far corridors)
    };
    m.customProgramCacheKey = () => 'czplanar';
    slots.push({ rt, U, m });
  }
  return (czPlanar = { slots, cam: new PerspectiveCamera(), size: new Vector2(), v: new Vector3(), t: new Vector3(), pp: new Vector3(), la: new Vector3(), q: new Matrix4(), bias: new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1) });
}
// The first mirror face a ray from (x, z) meets, stepping the grid (clear glass lets it through): [plane, metres].
function czMazeRay(x, z, dx, dz, maxD) {
  const M = czMazeNow, pc = M.pc, CS = pc.cs, u = (x - pc.x0) / CS, w = (pc.z0 - z) / CS, du = dx, dw = -dz;
  let c = Math.floor(u), r = Math.floor(w);
  const sc = du > 0 ? 1 : -1, sr = dw > 0 ? 1 : -1, su = du ? 1 / Math.abs(du) : Infinity, sw = dw ? 1 / Math.abs(dw) : Infinity;
  let tu = du ? (sc > 0 ? c + 1 - u : u - c) * su : Infinity, tw = dw ? (sr > 0 ? r + 1 - w : w - r) * sw : Infinity;
  for (let k = 0; k < 40; k++) {
    if (tu < tw) {
      const line = sc > 0 ? c + 1 : c; if (M.walls.get('v,' + line + ',' + r) === 'm') return ['v,' + line + ',' + (sc > 0 ? '-' : '+'), tu * CS];
      tu += su; c += sc;
    } else {
      const line = sr > 0 ? r + 1 : r; if (M.walls.get('h,' + c + ',' + line) === 'm') return ['h,' + line + ',' + (sr > 0 ? '+' : '-'), tw * CS];
      tw += sw; r += sr;
    }
    if (c < 0 || c >= pc.cols || r < 0 || r >= pc.rows || Math.min(tu, tw) * CS > maxD) return null;
  }
  return null;
}
// Before the frame is drawn: the surround map (every other frame), then the true mirrors.
function czMazePlanar() {
  if (!czMazeActive()) return;
  const M = czMazeNow;
  camera.updateMatrixWorld();
  czMazeReflect();                                            // (the true mirrors are in it: their pictures were taken from this same eye, so a mirror in a mirror shows them, a shade darker, and so on without end)
  for (const P of M.shown) P.mesh.visible = false;           // (but a true mirror's picture is wrong from any other eye)
  if (!czEnv) return;
  const K = czPlanarKit(), C = camera, score = new Map();
  const yaw = Math.atan2(C.getWorldDirection(K.v).x, -K.v.z), half = Math.atan(Math.tan(C.fov * Math.PI / 360) * C.aspect) * 1.15;
  for (let i = 0; i < 17; i++) {                              // what fills the view: which planes the rays meet, and how near
    const a = yaw - half + (2 * half * i) / 16, hit = czMazeRay(C.position.x, C.position.z, Math.sin(a), -Math.cos(a), 40);
    if (hit) score.set(hit[0], (score.get(hit[0]) || 0) + 1 / Math.max(0.6, hit[1]) * (M.shown.includes(M.planes.get(hit[0])) ? 1.25 : 1));
  }
  const pick = [...score].sort((a, b) => b[1] - a[1]).slice(0, CZ_PLANES).map(([k]) => M.planes.get(k)).filter(Boolean);
  renderer.getDrawingBufferSize(K.size);
  const w = Math.max(64, Math.round(K.size.x * CZ_RT_SCALE)), h = Math.max(64, Math.round(K.size.y * CZ_RT_SCALE));
  const auto = renderer.shadowMap.autoUpdate, prev = renderer.getRenderTarget(), V = K.cam;
  renderer.shadowMap.autoUpdate = false;                      // (the shadows were drawn for this frame's view already, or will be)
  const cull = marble.frustumCulled; marble.frustumCulled = false;   // (the tilted near plane tilts the far one too, and the library's culling reads it: small things would vanish from the mirror)
  pick.forEach((P, i) => {
    const S = K.slots[i];
    if (S.rt.width !== w || S.rt.height !== h) S.rt.setSize(w, h);
    // the camera's image behind the mirror, looking at the mirror image of what it looks at (three's Reflector)
    const n = P.n, pp = K.pp.set(n.x ? P.p.x : C.position.x, C.position.y, n.z ? P.p.z : C.position.z);
    K.v.subVectors(pp, C.position).reflect(n).negate().add(pp); V.position.copy(K.v);
    K.q.extractRotation(C.matrixWorld); K.la.set(0, 0, -1).applyMatrix4(K.q).add(C.position);
    K.t.subVectors(pp, K.la).reflect(n).negate().add(pp);
    V.up.set(0, 1, 0).applyMatrix4(K.q).reflect(n); V.lookAt(K.t); V.far = C.far; V.near = C.near; V.updateMatrixWorld();
    V.projectionMatrix.copy(C.projectionMatrix);
    S.U.value.copy(K.bias).multiply(V.projectionMatrix).multiply(V.matrixWorldInverse);
    // the near plane laid on the mirror (Lengyel's oblique clip), so nothing behind the wall is drawn
    const vi = V.matrixWorldInverse.elements, e = V.projectionMatrix.elements;
    const nx = vi[0] * n.x + vi[4] * n.y + vi[8] * n.z, ny = vi[1] * n.x + vi[5] * n.y + vi[9] * n.z, nz = vi[2] * n.x + vi[6] * n.y + vi[10] * n.z;
    const px = vi[0] * pp.x + vi[4] * pp.y + vi[8] * pp.z + vi[12], py = vi[1] * pp.x + vi[5] * pp.y + vi[9] * pp.z + vi[13], pz = vi[2] * pp.x + vi[6] * pp.y + vi[10] * pp.z + vi[14];
    let cx = nx, cy = ny, cz = nz, cw = -(nx * px + ny * py + nz * pz);
    const qx = (Math.sign(cx) + e[8]) / e[0], qy = (Math.sign(cy) + e[9]) / e[5], qz = -1, qw = (1 + e[10]) / e[14], k = 2 / (cx * qx + cy * qy + cz * qz + cw * qw);
    cx *= k; cy *= k; cz *= k; cw *= k;
    e[2] = cx; e[6] = cy; e[10] = cz + 1 - 0.003; e[14] = cw;
    renderer.setRenderTarget(S.rt); renderer.clear(); renderer.render(scene, V);
  });
  renderer.setRenderTarget(prev); renderer.shadowMap.autoUpdate = auto; marble.frustumCulled = cull;
  pick.forEach((P, i) => { P.mesh.material = K.slots[i].m; P.mesh.visible = true; });
  M.shown = pick;

}
function czMazeAnimate(dt) {
  if (!czMazeActive()) return;
  for (const g of czMazeNow.panes) { g.flash = Math.max(0, g.flash - dt * 2.5); g.crackMat.opacity = g.cracked ? 0.8 + 0.2 * g.flash : 0; }
}
