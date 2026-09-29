
// ---- THE CIRCUS'S OWN PIECES (owner, 2026-09-29: "let's proceed with building the game") ----
// Every piece the city built, dressed as the tin circus's own, as chromePieces does for the pinball machine: the neon
// parts hidden, the circus's added, all of it listed (tk*) so restoreCourse puts the city back for any other world.
//   bollards      giant juggling pins          barriers    striped tin hurdles, bulbs along the top
//   crates        tin circus trunks            crossings   CLOWN CARS, out of little striped garages either side
//   holo roads    magic glass, stars in it     jump pads   springboards (the yellow rings stay: they mean a jump)
//   speed strips  arrows of yellow bulbs       magnets     tin horseshoe magnets along the edge they pull to
//   wind          big tin fans on striped pylons, turning faster before a gust
//   wormholes     MAGICIAN'S CABINETS round the swirl       roundabouts  CAROUSELS
//   glass tubes   red, cream and gold hoops    scanners    SPOTLIGHTS, the beam down to the rail
//   switches      a big red button             colour lanes stage curtains in their colour, gold fringe
//   sky train     a painted circus carriage    puzzle squares  striped ring walls, trunks to push
function cqPieceKit(look) {
  const K = cqKit(look); if (K.pk) return K.pk;
  const std = (o) => keepMat(hazed(new MeshStandardMaterial({ roughness: 0.32, metalness: 0.5, envMap: K.env, envMapIntensity: 0.9, ...o })));
  const trunkT = canvasTex(256, 256, (g) => {               // a tin trunk: a painted panel, brass bands, a star on the lid
    g.fillStyle = '#6A2A9A'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(255,255,255,0.08)'; for (let k = 0; k < 256; k += 16) g.fillRect(k, 0, 8, 256);
    g.fillStyle = '#F2C230'; g.fillRect(0, 0, 256, 18); g.fillRect(0, 238, 256, 18); g.fillRect(0, 0, 18, 256); g.fillRect(238, 0, 18, 256); g.fillRect(118, 0, 20, 256);
    g.fillStyle = '#C8902A'; for (const [x, y] of [[9, 9], [247, 9], [9, 247], [247, 247], [128, 9], [128, 247]]) { pbCircle(g, x, y, 6); g.fill(); }
    tlStar(g, 64, 128, 30); tlStar(g, 192, 128, 30, '#E8303A');
  });
  const carouselT = canvasTex(512, 512, (g) => {            // a carousel's floor: sectors in red and cream, a gold ring, bulbs
    for (let k = 0; k < 24; k++) { const a = k * TAU / 24; g.fillStyle = k % 2 ? '#FFF1D2' : '#E8303A'; g.beginPath(); g.moveTo(256, 256); g.arc(256, 256, 256, a, a + TAU / 24); g.closePath(); g.fill(); }
    g.strokeStyle = '#F2C230'; g.lineWidth = 16; pbCircle(g, 256, 256, 240); g.stroke(); g.strokeStyle = INK; g.lineWidth = 4; pbCircle(g, 256, 256, 248); g.stroke(); pbCircle(g, 256, 256, 232); g.stroke();
    g.fillStyle = '#FFFFFF'; for (let k = 0; k < 48; k++) { const a = k * TAU / 48; pbCircle(g, 256 + Math.cos(a) * 240, 256 + Math.sin(a) * 240, 5); g.fill(); }
  });
  const starsT = canvasTex(128, 128, (g) => { g.clearRect(0, 0, 128, 128); const r = seeded(9); for (let i = 0; i < 9; i++) { g.fillStyle = r() < 0.5 ? '#FFFFFF' : '#FFE08A'; cqStar(g, r() * 128, r() * 128, 4 + r() * 7, 2 + r() * 2); g.fill(); } }, true);
  const bulbArrowT = canvasTex(64, 64, (g) => {             // a chevron of bulbs, for a speed strip
    g.clearRect(0, 0, 64, 64); g.fillStyle = '#FFE070';
    for (let k = -3; k <= 3; k++) { const x = 32 + k * 7, y = 20 + Math.abs(k) * 7; pbCircle(g, x, y, 3.4); g.fill(); pbCircle(g, x, y + 14, 3.4); g.fill(); }
  }, true);
  const velvetT = canvasTex(64, 128, (g) => {               // stage curtain: folds, and a gold fringe along the foot (tinted by the lane's colour)
    for (let x = 0; x < 64; x++) { const v = 0.6 + 0.4 * Math.cos(x / 64 * TAU * 3); g.fillStyle = `rgb(${Math.round(255 * v)},${Math.round(255 * v)},${Math.round(255 * v)})`; g.fillRect(x, 0, 1, 112); }
    g.fillStyle = '#FFE08A'; g.fillRect(0, 112, 64, 16); g.fillStyle = '#C8902A'; for (let x = 2; x < 64; x += 5) g.fillRect(x, 116, 2, 12);
  }, true);
  const sunT = canvasTex(256, 256, (g) => {                 // a springboard's face: a sunburst, the middle clear for the pad's own rings
    for (let k = 0; k < 16; k++) { const a = k * TAU / 16; g.fillStyle = k % 2 ? '#F2C230' : '#E8303A'; g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 128, a, a + TAU / 16); g.closePath(); g.fill(); }
  });
  return (K.pk = {
    trunk: std({ map: trunkT }), gold: std({ color: 0xF2C230, metalness: 0.9, roughness: 0.22 }), red: std({ color: 0xE8303A }),
    cream: std({ color: 0xFFF1D2, metalness: 0.3 }), dark: std({ color: 0x2A1E36, metalness: 0.3, roughness: 0.6 }), stripe: std({ color: 0xFFFFFF }),
    carousel: std({ map: carouselT, metalness: 0.35 }), sun: std({ map: sunT, metalness: 0.3 }), starsT, bulbArrowT, velvetT,
  });
}
// Shapes built once: a juggling pin (a bollard's size), a clown car in four paints.
let cqPinMemo = null;
function cqPinGeo() {
  if (cqPinMemo) return cqPinMemo;
  const B = pbBuild(), h = POST_H, r = POST_R;
  const prof = [[0.75, 0], [1.05, 0.05], [1.25, 0.25], [1.2, 0.45], [0.75, 0.62], [0.55, 0.72], [0.7, 0.86], [0.6, 0.96], [0, 1]].map(([a, b]) => new Vector2(a * r, b * h));
  B.geo(new LatheGeometry(prof, 16), placeAt(0, 0, 0), 0xFFF6EC);
  for (const f of [0.32, 0.4]) B.geo(new TorusGeometry(r * 1.24, 0.03, 5, 16), placeAt(0, h * f, 0, Math.PI / 2, 0, 0), 0xE8303A);
  B.geo(new TorusGeometry(r * 0.58, 0.035, 5, 16), placeAt(0, h * 0.72, 0, Math.PI / 2, 0, 0), 0x2A4AE8);
  B.geo(new IcosahedronGeometry(r * 0.62, 1), placeAt(0, h * 0.94, 0), 0xE8303A);
  return (cqPinMemo = B.done());
}
const cqCarMemo = {};
function cqClownCarGeo(k) {
  if (cqCarMemo[k]) return cqCarMemo[k];
  const B = pbBuild(), col = [0xE8303A, 0x2A4AE8, 0xF2C230, 0x2AA89A][k % 4], trim = [0xF2C230, 0xF2C230, 0xE8303A, 0xF2C230][k % 4];
  B.geo(new BoxGeometry(1.7, 0.42, 0.9), placeAt(-0.1, -0.02, 0), col);                  // the body, short and tall, the front round
  B.geo(new SphereGeometry(0.46, 14, 10, 0, TAU, 0, Math.PI / 2), placeAt(0.72, 0.05, 0, 0, 0, -Math.PI / 2, 1, 1, 0.98), col);
  B.geo(new BoxGeometry(1.74, 0.07, 0.94), placeAt(-0.1, 0.2, 0), trim);
  B.geo(new BoxGeometry(0.9, 0.36, 0.86), placeAt(-0.3, 0.36, 0), col);                  // the seat's back, where the clown stands
  for (const sx of [-0.62, 0.62]) for (const sz of [-0.5, 0.5]) {                       // wheels too big for it
    B.geo(new CylinderGeometry(0.32, 0.32, 0.16, 16), placeAt(sx, -0.14, sz, Math.PI / 2, 0, 0), 0x231A2E);
    B.geo(new CylinderGeometry(0.14, 0.14, 0.18, 12), placeAt(sx, -0.14, sz, Math.PI / 2, 0, 0), 0xF2C230);
  }
  B.geo(new ConeGeometry(0.12, 0.34, 10, 1, true), placeAt(0.5, 0.42, 0.3, 0, 0, -Math.PI / 2), 0xF2C230);   // the horn, and its bulb
  B.geo(new SphereGeometry(0.09, 8, 6), placeAt(0.3, 0.42, 0.3), 0xE8303A);
  return (cqCarMemo[k] = B.done());
}
function circusPieces(look) {
  const K = cqKit(look), PK = cqPieceKit(look), o = new Object3D();
  const metal = pbBuild(), paint = pbBuild(), lit = pbBuild(), bulbs = [];
  // BOLLARDS: giant juggling pins.
  if (postKit && posts.length) {
    tkHide(...levelGroup.children.filter((m) => m.isInstancedMesh && [postKit.body, postKit.band, postKit.cap, postKit.pool, postKit.halo].includes(m.geometry)));
    const pin = new InstancedMesh(cqPinGeo(), K.paint, posts.length);
    posts.forEach((P, i) => { o.position.set(P.x, P.y, P.z); o.rotation.set(0, i * 0.7, 0); o.updateMatrix(); pin.setMatrixAt(i, o.matrix); });
    pin.castShadow = true; tkAdd(levelGroup, pin);
  }
  // BARRIERS: a hurdle of red and cream boards between gold posts, bulbs along its top. CRATES: tin trunks.
  for (const c of colliders) {
    if (c.obstacle === 'crate') tkSet(c.mesh, 'material', PK.trunk);
    if (c.obstacle !== 'barrier') continue;
    tkHide(c.mesh);
    const w = c.half.x * 2, h = c.half.y * 2, at = new Matrix4().compose(new Vector3(c.pos.x, c.pos.y - c.half.y, c.pos.z), c.quat, new Vector3(1, 1, 1));
    const put = (Bd, g, mtx, hex) => Bd.geo(g, at.clone().multiply(mtx), hex);
    for (const s of [-1, 1]) { put(metal, new CylinderGeometry(0.09, 0.12, h + 0.25, 10), placeAt(s * (w / 2 - 0.12), (h + 0.25) / 2, 0), 0xF2C230); put(lit, new SphereGeometry(0.13, 10, 8), placeAt(s * (w / 2 - 0.12), h + 0.3, 0), 0xFFE070); }
    const n = Math.max(3, Math.round((w - 0.3) / 0.45));
    for (let k = 0; k < n; k++) put(paint, new BoxGeometry((w - 0.3) / n + 0.005, h * 0.62, c.half.z * 2), placeAt(-(w - 0.3) / 2 + (k + 0.5) * (w - 0.3) / n, h * 0.5, 0), k % 2 ? 0xFFF1D2 : 0xE8303A);
    for (let k = 0; k < n; k++) { const p = new Vector3(-(w - 0.3) / 2 + (k + 0.5) * (w - 0.3) / n, h * 0.84, c.half.z + 0.02).applyMatrix4(at); bulbs.push(p.toArray()); }
  }
  // CROSSINGS: clown cars. Each lane gets a checkered strip across the rail and a little striped garage at each end;
  // each car is a clown car with a clown standing in it; a row of bulbs at the stop line shows green, or red running.
  for (const c of crossings) {
    const X = c.cross;
    if (X.fire) continue;
    tkHide(...X.parts, ...X.lights.map((L) => L.lamp.parent));
    const near = c.pos.z + c.half.z, top = X.top;
    for (const L of X.lanes) {
      const strip = new Mesh(new PlaneGeometry(X.w + 1.2, 2 * CAR_HZ + 0.3), glowMat(0xFFFFFF, 0.35, cqCheckTex()));
      strip.material.map = cqCheckTex().clone(); strip.material.map.repeat.set((X.w + 1.2) / 0.6, 2); strip.material.map.needsUpdate = true;
      strip.rotation.x = -Math.PI / 2; strip.position.set(X.x, top + 0.02, L.z); tkAdd(levelGroup, strip);
      for (const s of [-1, 1]) {                            // the garage the cars come out of: striped walls, a pointed roof, a dark door to the road
        const gx = X.x + s * (X.w / 2 + 2.6);
        for (let k = 0; k < 5; k++) paint.geo(new BoxGeometry(1.7, 0.36, 1.5), placeAt(gx, top + 0.18 + k * 0.36, L.z), k % 2 ? 0xFFF1D2 : 0x2A4AE8);
        paint.geo(new ConeGeometry(1.3, 0.9, 4), placeAt(gx, top + 2.25, L.z, 0, Math.PI / 4, 0), 0xE8303A);
        paint.geo(new BoxGeometry(0.06, 1.2, 1.1), placeAt(gx - s * 0.86, top + 0.6, L.z), 0x1A1024);
        for (let k = 0; k < 5; k++) bulbs.push([gx - s * 0.9, top + 1.45, L.z - 0.6 + k * 0.3]);
      }
    }
    X.cars.forEach((car, i) => {
      for (const ch of car.mesh.children) tkHide(ch);
      const g = new Group(), body = new Mesh(cqClownCarGeo(i + (X.lanes.indexOf(car.lane) * 2)), K.paint);
      const clown = new Mesh(cqCellGeo(1, 1.2), K.figs); clown.position.set(-0.3, 0.1, 0); clown.rotation.y = -car.mesh.rotation.y;   // he faces the camera whichever way the car goes
      g.add(body, clown); tkAdd(car.mesh, g);
      tkTick(() => { if (!REDUCED) g.position.y = Math.abs(Math.sin(simT * 9 + i)) * 0.06; });   // bouncing along
    });
    const n = Math.max(3, Math.floor(X.w / 0.5)), row = new InstancedMesh(new SphereGeometry(0.11, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new MeshBasicMaterial({ color: 0xFFFFFF, toneMapped: false }), n);
    for (let i = 0; i < n; i++) { o.position.set(X.x - X.w / 2 + (i + 0.5) * X.w / n, top, near - 0.2); o.rotation.set(0, 0, 0); o.updateMatrix(); row.setMatrixAt(i, o.matrix); row.setColorAt(i, new Color(0x3DFF8A)); }
    tkAdd(levelGroup, row);
    const col = new Color();
    tkTick(() => {
      const on = REDUCED || ((simT * 2) % 1) < 0.5;
      for (let i = 0; i < n; i++) row.setColorAt(i, X.green ? col.setHex(0x3DFF8A) : col.setHex(((i + Math.floor(simT * 12)) % 3 === 0) && on ? 0xFFE0D0 : 0xFF2A20));
      row.instanceColor.needsUpdate = true;
    });
  }
  // HOLOGRAM ROADS: magic glass, gold at its edges, stars in it.
  for (const c of holos) {
    const old = c.holoMats, mats = [glowMat(0xFFC86A, 0.5), glowMat(0xFFFFFF, 1, PK.starsT), glowMat(0xFFC86A, 0.2), glowMat(0xFFF4C2, 1)];
    mats[1].map = PK.starsT.clone(); mats[1].map.repeat.set(Math.max(1, c.half.x * 2 / 1.2), Math.max(1, c.half.z * 2 / 1.2)); mats[1].map.needsUpdate = true;
    for (const ch of c.mesh.children) if (ch.material === old[3]) tkSet(ch, 'material', mats[3]);
    c.holoMats = mats;
    tkUndo.push(() => { c.holoMats = old; for (const m of mats) { if (m.map && m.map !== PK.starsT) m.map.dispose(); m.dispose(); } });
  }
  // PADS: a jump pad is a springboard (a sunburst face under its yellow rings, a gold rim); a speed strip, arrows of bulbs.
  for (const c of pads) {
    const top = c.half.y;
    if (c.pad === 'jump') {
      for (const ch of c.mesh.children) if (!c.padFx.rings.includes(ch)) tkHide(ch);
      const R0 = c.padFx.R + 0.06;
      const rim = new Mesh(new TorusGeometry(R0, 0.08, 8, 48), PK.gold); rim.rotation.x = Math.PI / 2; rim.position.y = top + 0.02; tkAdd(c.mesh, rim);
      const face = new Mesh(new CircleGeometry(R0 - 0.02, 48), PK.sun); face.rotation.x = -Math.PI / 2; face.position.y = top + 0.004; tkAdd(c.mesh, face);
      const core = new Mesh(new CircleGeometry(0.22, 24), glowMat(0xFFF4C2, 1)); core.rotation.x = -Math.PI / 2; core.position.y = top + 0.01; tkAdd(c.mesh, core);
    } else {
      const deco = c.mesh.children.find((m) => m.material && m.material.map === c.padFx.tex);
      if (!deco) continue;
      const t = PK.bulbArrowT.clone(); t.repeat.copy(c.padFx.tex.repeat); t.needsUpdate = true;
      const mat = glowMat(0xFFFFFF, 1, t);
      tkSet(deco, 'material', mat); tkSet(c.padFx, 'tex', t);
      tkUndo.push(() => { t.dispose(); mat.dispose(); });
    }
  }
  // MAGNET STRIPS: tin horseshoe magnets along the edge the strip pulls to, open end to the rail.
  for (const c of mags) {
    const s = Math.sign(c.mag), d = c.half.z * 2, n = Math.max(1, Math.floor(d / 1.3)), at = new Matrix4().compose(c.pos, c.quat, new Vector3(1, 1, 1));
    for (let k = 0; k < n; k++) {
      const z = -d / 2 + (k + 0.5) * d / n, m = (dx, dy, dz, rx, ry, rz) => at.clone().multiply(placeAt(s * (c.half.x + dx), c.half.y + dy, z + dz, rx, ry, rz));
      paint.geo(new TorusGeometry(0.24, 0.09, 8, 16, Math.PI), m(0.34, 0.14, 0, Math.PI / 2, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2), 0xE8303A);
      for (const e of [-1, 1]) metal.geo(new BoxGeometry(0.2, 0.18, 0.18), m(0.12, 0.14, e * 0.24, 0, 0, 0), 0xD8DCE8);
    }
  }
  // WIND: big tin fans. The towers go; at each, a fan on a striped pylon faces across the road, its blades turning faster
  // as a gust gathers, its middle glowing with it.
  for (const W of winds) {
    tkHide(...W.towers);
    tkColor(W.streaks.material.color, 0xFFF6E0);
    const heads = [];
    for (const t of W.towers) {
      if (t.geometry.type !== 'BoxGeometry') continue;
      const x = t.position.x + W.dir * TOWER_W / 2, y = W.y + 1.3, z = t.position.z;
      for (let k = 0; k < 6; k++) paint.geo(new CylinderGeometry(0.28, 0.3, 2, 10), placeAt(x - W.dir * 0.9, y - 1.3 - k * 2, z), k % 2 ? 0xFFF1D2 : 0xE8303A);
      paint.geo(new CylinderGeometry(0.62, 0.72, 1.2, 18), placeAt(x - W.dir * 0.9, y, z, 0, 0, Math.PI / 2), 0x2A4AE8);   // the motor
      const head = new Group(); head.position.set(x + W.dir * 0.1, y, z); head.rotation.y = W.dir * Math.PI / 2;   // its face toward the road
      const cage = pbBuild();
      for (const rr of [0.7, 1.25, 1.75]) cage.geo(new TorusGeometry(rr, 0.04, 5, 32), placeAt(0, 0, 0.35), 0xF2C230);
      for (let k = 0; k < 12; k++) { const a = k * TAU / 12; cage.geo(new CylinderGeometry(0.03, 0.03, 1.75, 4), placeAt(Math.cos(a) * 0.88, Math.sin(a) * 0.88, 0.35, 0, 0, a + Math.PI / 2), 0xF2C230); }
      cage.geo(new TorusGeometry(1.78, 0.09, 8, 40), placeAt(0, 0, 0.3), 0xF2C230);
      head.add(new Mesh(cage.done(), K.metal));
      const blades = new Group(), bl = pbBuild();
      for (let k = 0; k < 4; k++) { const a = k * TAU / 4; bl.geo(new SphereGeometry(0.62, 12, 8), placeAt(Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0.1, 0, 0, a, 1, 0.45, 0.12), k % 2 ? 0xE8303A : 0xFFF1D2); }
      bl.geo(new SphereGeometry(0.26, 12, 8), placeAt(0, 0, 0.2), 0xF2C230);
      blades.add(new Mesh(bl.done(), K.paint)); head.add(blades);
      const glow = new Mesh(new CircleGeometry(0.5, 24), glowMat(0xFFE08A, 0.2)); glow.position.z = 0.36; head.add(glow);
      tkAdd(levelGroup, head); heads.push([blades, glow]);
    }
    let ang = 0;
    tkTick((dt) => { const st = windState(W, simT); ang += dt * (1.5 + 14 * st.show); for (const [b, g] of heads) { if (!REDUCED) b.rotation.z = ang; g.material.opacity = 0.15 + 0.85 * st.show; } });
  }
  // WORMHOLES: magician's cabinets. The swirl is the cabinet's doorway: purple posts with gold stars, a crested top,
  // red drapes tied back either side, bulbs round the door.
  for (const W of wormholes) {
    const [disc, ring, halo] = W.grp.children;
    tkHide(ring, halo); tkColor(disc.material.color, 0xE8D8FF);
    const B = pbBuild(), R = W.rad, id = 1700;
    for (const s of [-1, 1]) {
      B.geo(new BoxGeometry(0.5, R * 2 + 0.5, 0.6), placeAt(s * (R + 0.3), -0.25, 0), 0x5A2A8A);
      B.geo(new BoxGeometry(0.58, 0.2, 0.68), placeAt(s * (R + 0.3), -R - 0.4, 0), 0xF2C230);
      B.geo(new ConeGeometry(0.55, R * 1.8, 8, 1, true), placeAt(s * (R - 0.15), -0.2, 0.15, 0, 0, s * 0.18, 1, 1, 0.35), 0xC8202C);   // a drape
    }
    B.geo(new BoxGeometry(R * 2 + 1.3, 0.6, 0.7), placeAt(0, R + 0.25, 0), 0x5A2A8A);
    B.geo(new BoxGeometry(R * 2 + 1.5, 0.14, 0.78), placeAt(0, R + 0.58, 0), 0xF2C230);
    B.geo(new CylinderGeometry(R * 0.7, R * 0.7, 0.4, 24, 1, false, -Math.PI / 2, Math.PI), placeAt(0, R + 0.62, 0, Math.PI / 2, 0, 0), 0x5A2A8A);   // the crest
    B.geo(new SphereGeometry(0.2, 10, 8), placeAt(0, R + 1.35, 0), 0xF2C230);
    const cab = new Mesh(B.done(), K.paint); tkAdd(W.grp, cab);
    const lamps = new InstancedMesh(new IcosahedronGeometry(0.09, 0), new MeshBasicMaterial({ color: 0xFFE8A0, toneMapped: false }), 24);
    for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; o.position.set(Math.cos(a) * (R + 0.02), Math.sin(a) * (R + 0.02), 0.35); o.rotation.set(0, 0, 0); o.updateMatrix(); lamps.setMatrixAt(k, o.matrix); }
    tkAdd(W.grp, lamps);
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { const st = new Mesh(new CircleGeometry(0.12, 5), new MeshBasicMaterial({ color: 0xF2C230, toneMapped: false })); st.position.set(s * (R + 0.3), -R + 0.3 + k * R * 0.55, 0.31); tkAdd(W.grp, st); }
  }
  // ROUNDABOUTS: carousels. The floor in red and cream sectors with a gold ring of bulbs; over the island in the middle
  // (never ridden), a little striped canopy on a brass pole.
  for (const Rd of rounds) {
    const [top, rim, , lamps] = Rd.spinGrp.children, fixed = Rd.gyro.parent, [island, lip, glow] = fixed.children;
    tkSet(top, 'material', PK.carousel); tkSet(rim, 'material', PK.gold); tkColor(lamps.material.color, 0xFFE8A0);
    tkHide(lip, glow, Rd.gyro); tkSet(island, 'material', PK.red);
    const cap = new Group(), B = pbBuild(), ri = Rd.ri;
    B.geo(new CylinderGeometry(0.1, 0.1, 1.4, 10), placeAt(0, ISLAND_H + 0.7, 0), 0xF2C230);
    for (let k = 0; k < 12; k++) B.geo(new ConeGeometry(ri * 0.85, 0.7, 3, 1, true, k / 12 * TAU, TAU / 12), placeAt(0, ISLAND_H + 1.65, 0), k % 2 ? 0xFFF1D2 : 0xE8303A);
    B.geo(new CylinderGeometry(ri * 0.85, ri * 0.85, 0.16, 24, 1, true), placeAt(0, ISLAND_H + 1.25, 0), 0xF2C230);
    B.geo(new SphereGeometry(0.14, 10, 8), placeAt(0, ISLAND_H + 2.08, 0), 0xF2C230);
    cap.add(new Mesh(B.done(), K.paint)); tkAdd(fixed, cap);
    carouselHorses(Rd);                                      // and horses riding round on it
    tkTick((dt) => { if (!REDUCED) cap.rotation.y += dt * 0.6 * Math.sign(Rd.spin || 1); });
  }
  // GLASS TUBES: the rings red, cream and gold; gold hoops at each end.
  for (const U of tubes) {
    tkSet(U, 'pal', [0.91, 0.19, 0.23, 1, 0.88, 0.45]);   // red at rest, gold as the marble passes
    for (const e of U.ends) tkColor(e.material.color, 0xFFE8A0);
    for (const e of U.ends) { const h = new Mesh(new TorusGeometry(TUBE_R + 0.2, 0.12, 10, 40), PK.gold); h.position.copy(e.position); h.quaternion.copy(e.quaternion); tkAdd(levelGroup, h); }
  }
  // SCANNERS: spotlights. A tin lamp on a yoke rides each bar, its beam down to the rail; the red line on the rail stays.
  for (const Sc of scans) {
    const d = Sc.d, hy = SCAN_H + 1.25;
    for (const g of Sc.bars) {
      const [sheet, core, glow, strands, ...nubs] = g.children;
      tkHide(sheet, core, glow, ...nubs); tkColor(strands.material.color, 0xFFF0B0);
      const S = pbBuild();
      S.geo(new CylinderGeometry(0.42, 0.34, 0.8, 16, 1, true), placeAt(0, hy + 0.1, 0), 0x2A4AE8);
      S.geo(new TorusGeometry(0.42, 0.06, 6, 20), placeAt(0, hy - 0.3, 0, Math.PI / 2, 0, 0), 0xF2C230);
      for (const s of [-1, 1]) S.geo(new BoxGeometry(0.08, 0.7, 0.12), placeAt(s * 0.52, hy + 0.25, 0), 0xF2C230);
      S.geo(new BoxGeometry(1.12, 0.1, 0.12), placeAt(0, hy + 0.62, 0), 0xF2C230);
      tkAdd(g, new Mesh(S.done(), K.paint));
      const lens = new Mesh(new CircleGeometry(0.36, 20), new MeshBasicMaterial({ color: 0xFFF6D8, toneMapped: false })); lens.rotation.x = Math.PI / 2; lens.position.y = hy - 0.31; tkAdd(g, lens);
      const cone = new Mesh(new CylinderGeometry(0.36, 1, hy - 0.35, 28, 1, true), glowMat(0xFFF0B0, 0.4, cqConeTex()));
      cone.material.side = DoubleSide; cone.scale.set(0.34, 1, d / 2); cone.position.y = (hy - 0.35) / 2; tkAdd(g, cone);
      const foot = new Mesh(new CircleGeometry(1, 32), glowMat(0xFFF4C2, 0.75, dot)); foot.rotation.x = -Math.PI / 2; foot.scale.set(0.5, d / 2, 1); foot.position.y = 0.03; tkAdd(g, foot);
    }
  }
  // SWITCHES: a big red button in a gold ring; gold bulbs along the cable.
  for (const S of switches) {
    tkSet(S.button, 'material', PK.red);
    tkColor(S.faceMat.color, 0xFFE08A); tkColor(S.ringMat.color, 0xF2C230); tkColor(S.halo.material.color, 0xFFC040);
    for (const g of S.decals) tkColor(g.material.color, 0xFFE8B0);
    tkSet(S, 'dotOn', new Color(0xFFE070)); tkSet(S, 'dotOff', new Color(0x4A3A2A));
    const paintDots = (on, off) => { S.at.forEach((a, i) => S.dots.setColorAt(i, S.on && a <= S.t * PULSE_V ? on : off)); S.dots.instanceColor.needsUpdate = true; };
    paintDots(S.dotOn, S.dotOff);
    tkUndo.push(() => paintDots(DOT_ON, DOT_OFF));
  }
  // COLOUR LANES: stage curtains in the lane's own colour (lime, violet), gold fringe, on a gold rod between striped posts.
  for (const C of curtains) {
    const [sheet, bar] = C.parts;
    const t = PK.velvetT.clone(); t.repeat.set(Math.max(1, C.w / 1.2), 1); t.needsUpdate = true;
    const m = glowMat(TINTS[C.col], 0.92, t); m.side = DoubleSide;
    tkSet(sheet, 'material', m); tkSet(C, 'mat', m); tkSet(bar, 'material', PK.gold);
    tkUndo.push(() => { t.dispose(); m.dispose(); });
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) paint.geo(new CylinderGeometry(0.09, 0.09, 0.42, 8), placeAt(C.x + s * (C.w / 2 + 0.12), C.y + 0.21 + k * 0.42, C.z), k % 2 ? 0xFFF1D2 : 0xE8303A);
      lit.geo(new SphereGeometry(0.12, 10, 8), placeAt(C.x + s * (C.w / 2 + 0.12), C.y + 1.8, C.z), TINTS[C.col]);
    }
  }
  for (const L of locks) for (const f of L.frames) tkSet(f, 'material', PK.gold);
  // THE SKY TRAIN you ride: a painted circus carriage on a gold guideway.
  for (const c of ferries) {
    if (!c.train) continue;
    tkHide(c.train.model);
    const Sh = pbBuild(), Ld = TRAIN_DECK, y0 = -TRAIN_H / 2 - 1.05;
    Sh.geo(new BoxGeometry(2.3, 1.6, Ld - 1), placeAt(0, y0 - 0.2, 0), 0xE8303A);
    Sh.geo(new BoxGeometry(2.4, 0.16, Ld - 0.8), placeAt(0, y0 + 0.62, 0), 0xF2C230);
    Sh.geo(new BoxGeometry(2.4, 0.16, Ld - 0.8), placeAt(0, y0 - 1.0, 0), 0xF2C230);
    for (let k = 0; k < 6; k++) for (const s of [-1, 1]) Sh.geo(new CylinderGeometry(0.34, 0.34, 0.14, 5), placeAt(s * 1.18, y0 - 0.2, -Ld / 2 + 2 + k * (Ld - 4) / 5, 0, 0, Math.PI / 2), 0xF2C230);
    for (const e of [-1, 1]) for (const s of [-1, 1]) Sh.geo(new CylinderGeometry(0.55, 0.55, 0.2, 16), placeAt(s * 1.1, y0 - 1.1, e * (Ld / 2 - 2.4), 0, 0, Math.PI / 2), 0x231A2E);
    tkAdd(c.mesh, new Mesh(Sh.done(), K.paint));
    const [beam, ...rails] = c.train.parts;
    tkSet(beam, 'material', PK.gold);
  }
  // PUZZLE SQUARES: walls of red and cream, gold where the tiles' walls are, a dark base, tin trunks to push.
  for (const c of colliders) if (c.obstacle === 'wall') tkSet(c.mesh, 'material', PK.red);
  for (const P of plazas) {
    levelGroup.traverse((m) => { if (m.isMesh && (m.material === P.mats.line || m.material === P.mats.halo)) tkHide(m); });
    for (const T of P.tiles) T.grp.traverse((m) => {
      if (m.material === P.mats.wall) tkSet(m, 'material', PK.gold);
      else if (Array.isArray(m.material) && m.material[2] === P.mats.tile) tkSet(m, 'material', [PK.gold, PK.gold, cqCourseMats(look).cellTop, PK.dark, PK.gold, PK.gold]);
    });
    levelGroup.traverse((m) => {
      if (!m.isMesh) return;
      if (m.material === P.mats.base) tkSet(m, 'material', PK.dark);
      else if (m.material === P.mats.wall && m.parent !== levelGroup) tkSet(m, 'material', PK.gold);
    });
    for (const W of P.crates) if (!W.sat && !W.cz) tkSet(W.mesh, 'material', PK.trunk);   // (the circus puzzles' pieces are dressed already)
  }
  if (bulbs.length) {                                       // the pieces' own bulbs, softly lit
    const bm = new InstancedMesh(new IcosahedronGeometry(0.09, 0), new MeshBasicMaterial({ color: 0xFFE8A0, toneMapped: false }), bulbs.length);
    bulbs.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.rotation.set(0, 0, 0); o.updateMatrix(); bm.setMatrixAt(i, o.matrix); });
    tkAdd(levelGroup, bm);
  }
  if (metal.count()) tkAdd(levelGroup, new Mesh(metal.done(), K.metal));
  if (paint.count()) tkAdd(levelGroup, new Mesh(paint.done(), K.paint));
  if (lit.count()) tkAdd(levelGroup, new Mesh(lit.done(), K.lit));
}
let cqCheckMemo = null;
const cqCheckTex = () => cqCheckMemo || (cqCheckMemo = canvasTex(64, 64, (g) => { g.fillStyle = '#E8303A'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#FFF1D2'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32); }, true));
