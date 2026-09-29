
// ---- THE WORLD ----
const CQ_BAY = 64, CQ_DROP = 9;                            // a big top every 64 m along the course; the sawdust 9 m under the rail
function circusWorld(w, look) {
  cqLook = look;
  const C = CQ[look], K = cqKit(look), G = w.group, r = seeded(71 + CIRCUS_LOOKS.indexOf(look) * 13), end = courseEnd(), tin = look === 'tintoy', out = look === 'midway', live = !REDUCED;
  const pieces = level ? level.pieces : [];
  let lo = 0, hi = -1e9, minX = 1e9, maxX = -1e9;
  for (const p of pieces) {
    lo = Math.min(lo, p.t === 'ramp' ? Math.min(p.y0, p.y1) : (p.y || 0)); hi = Math.max(hi, p.t === 'ramp' ? Math.max(p.y0, p.y1) : (p.y || 0));
    if (p.t === 'plaza') { minX = Math.min(minX, p.x0); maxX = Math.max(maxX, p.x0 + p.cols * CELL); }
    else if (p.x !== undefined) { const hw = p.t === 'round' ? p.ro : (p.w || 4) / 2, sh = p.shift || 0; minX = Math.min(minX, p.x + Math.min(0, sh) - hw); maxX = Math.max(maxX, p.x + Math.max(0, sh) + hw); }
  }
  if (minX > maxX) { minX = -4; maxX = 10; }
  if (hi < lo) hi = lo;
  // The canvas must clear the camera over the highest part of the course: it rides some 9 m over the rail.
  // So must it clear the camera that climbs over a puzzle square to show the whole of it.
  const high = cqHighCams(), camTop = high.reduce((m, c) => Math.max(m, c.pos.y), -1e9);
  const FL = lo - CQ_DROP, SKY = Math.max(FL + 17, hi + 13, camTop + 5), OV = SKY - 17, CX = (minX + maxX) / 2, HW = Math.max(6, (maxX - minX) / 2 + 1), Z_TOP = 70, Z_BOT = end - 130;
  scene.background = coverTex(512, (g) => cqSky(g, look));
  scene.fog.color.setHex(C.fog[0]); scene.fog.near = C.fog[1]; scene.fog.far = C.fog[2];
  camera.far = C.fog[2] + 30; camera.updateProjectionMatrix();          // nothing past the fog's end is drawn: it could not be seen
  HAZE.col.value.setHex(C.haze[0]); HAZE.k.value = C.haze[1]; HAZE.dir.set(0, out ? 0.12 : 0.3, -1).normalize();
  hemi.color.setHex(C.hemi[0]); hemi.groundColor.setHex(C.hemi[1]); hemi.intensity = C.hemi[2];
  sun.color.setHex(C.sun[0]); sun.intensity = C.sun[1];
  w.marble = 'circus'; w.rings = [0x34E0FF, 0xFF6A3C];
  w.restyle = () => circusCourse(look);
  const paint = cqChunks(), metal = cqChunks(), lit = cqChunks(), tick = [];
  const bulbs = [];                                         // [x, y, z, string, index along it]
  const figs = [];                                          // cut-outs that turn to face the camera
  // A painted cut-out from the atlas, standing on its feet at (x, y, z), h tall.
  const fig = (cell, x, y, z, h, face = true) => {
    const u0 = (cell % 4) / 4, v1 = 1 - Math.floor(cell / 4) / CQ_ROWS, geo = new PlaneGeometry(h, h);
    const uv = geo.attributes.uv; for (let i = 0; i < 4; i++) uv.setXY(i, u0 + uv.getX(i) / 4, v1 - (1 - uv.getY(i)) / CQ_ROWS);
    geo.translate(0, h / 2, 0);
    const m = new Mesh(geo, K.figs); m.position.set(x, y, z); G.add(m);
    if (face) figs.push(m);
    return m;
  };
  const bays = []; for (let z = Z_TOP - 30; z > Z_BOT; z -= CQ_BAY) bays.push(z);

  // THE FLOOR: sawdust (printed tin, trodden earth) under everything, with a ring under every big top.
  const floor = new Mesh(new PlaneGeometry(out ? 600 : 120, Z_TOP - Z_BOT + 200), K.floor);
  floor.rotation.x = -Math.PI / 2; floor.position.set(CX, FL, (Z_TOP + Z_BOT) / 2);
  K.floor.map.repeat.set((out ? 600 : 120) / 8, (Z_TOP - Z_BOT + 200) / 8); floor.userData.ground = true; G.add(floor);
  const ringAt = (x, z, rad = 6.5) => {
    const disc = new Mesh(new CircleGeometry(rad, 48), K.ring); disc.rotation.x = -Math.PI / 2; disc.position.set(x, FL + 0.02, z); disc.userData.ground = true; G.add(disc);
    const curb = new Mesh(new LatheGeometry([new Vector2(rad, 0), new Vector2(rad + 0.6, 0), new Vector2(rad + 0.6, 0.55), new Vector2(rad, 0.55), new Vector2(rad, 0)], 64), K.curb);
    K.curb.map.repeat.set(6, 1); curb.position.set(x, FL, z); G.add(curb);
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; bulbs.push([x + Math.cos(a) * (rad + 0.3), FL + 0.7, z + Math.sin(a) * (rad + 0.3), -1, k]); }   // footlights round the curb
  };

  if (!out) {
    // THE BIG TOPS: an oval of canvas over each ring, rising to its peak over the course, bulbs up every fourth seam.
    const RX = 52, RZ = 40, EAVE = SKY, PEAK = SKY + 29, n = 14;
    const prof = []; for (let k = 0; k <= n; k++) { const f = k / n; prof.push(new Vector2(RZ * (1 - f) + 2.2 * f, EAVE + (PEAK - EAVE) * Math.pow(f, 1.7))); }
    const heightAt = (rad) => { const f = Math.max(0, Math.min(1, (RZ - rad) / (RZ - 2.2))); return EAVE + (PEAK - EAVE) * Math.pow(f, 1.7); };
    K.gores.repeat.set(2, 1);
    for (const zc of bays) {
      const dome = new Mesh(new LatheGeometry(prof, 56), K.canvas); dome.scale.set(RX / RZ, 1, 1); dome.position.set(CX, 0, zc); G.add(dome);
      metal.geo(new TorusGeometry(2.3, 0.35, 8, 24), placeAt(CX, PEAK - 0.2, zc, Math.PI / 2, 0, 0), C.brass);   // the bale ring at the peak
      for (let s = 0; s < 8; s++) {                          // bulbs down eight seams
        const a = s / 8 * Math.PI * 2 + Math.PI / 16;
        for (let k = 0; k < 26; k++) { const rad = 3 + (RZ - 3) * k / 25, y = heightAt(rad) - 0.4; bulbs.push([CX + Math.cos(a) * rad * RX / RZ, y, zc + Math.sin(a) * rad, s + zc * 10, k]); }
      }
      for (let k = 0; k < 44; k++) { const a = k / 44 * Math.PI * 2; bulbs.push([CX + Math.cos(a) * (RX - 0.5), EAVE - 0.6, zc + Math.sin(a) * (RZ - 0.5), 99, k]); }   // round the eaves
      for (const s of [-1, 1]) {                             // the king poles either side of the course, rigging up to the peak
        const px = CX + s * (HW + 7), top = heightAt(Math.abs(px - CX) * RZ / RX);
        paint.geo(new CylinderGeometry(0.45, 0.55, top - FL, 12), placeAt(px, (top + FL) / 2, zc), C.pole);
        for (let y = FL + 2; y < top - 1; y += 3) paint.geo(new CylinderGeometry(0.47, 0.47, 1.1, 12), placeAt(px, y, zc), C.poleStripe);
        metal.geo(new CylinderGeometry(0.06, 0.06, Math.hypot(px - CX, top - PEAK) + 0.5, 4), placeAt((px + CX) / 2, (top + PEAK) / 2, zc, 0, 0, Math.atan2(px - CX, PEAK - top)), 0x8A7A60);
        metal.geo(new BoxGeometry(1.6, 0.5, 1.2), placeAt(px - s * 0.9, top - 4, zc), 0x2A2A2E);   // a spotlight fixture
        cqSpot(G, K, tick, px - s * 0.9, top - 4.3, zc, CX, FL, zc, 5 + r() * 3, r() * 6, live);
      }
      ringAt(CX, zc);
    }
    // THE TRACK under the whole rail, as round a circus's rings: darker sawdust between painted curbs, footlights along them.
    const tLen = Z_TOP - Z_BOT, tMid = (Z_TOP + Z_BOT) / 2, TW = HW + 3;
    const track = new Mesh(new PlaneGeometry(TW * 1.3, tLen), K.runner); track.rotation.x = -Math.PI / 2; track.position.set(CX, FL + 0.01, tMid); K.runner.map.repeat.set(1, tLen / (TW * 2.6)); track.userData.ground = true; G.add(track);   // the runner
    if (!tin) for (const s of [-1, 1]) {
      paint.geo(new BoxGeometry(0.6, 0.55, tLen), placeAt(CX + s * TW, FL + 0.27, tMid), tin ? 0x2A5AC8 : 0x8A1A20);
      paint.geo(new BoxGeometry(0.64, 0.08, tLen), placeAt(CX + s * TW, FL + 0.58, tMid), tin ? 0xFFF1D2 : 0xF2E4C4);
      for (let z = Z_TOP; z > Z_BOT; z -= 3) bulbs.push([CX + s * TW, FL + 0.8, z, -1, Math.round(z / 3)]);
    }
    // Under and around every ring, close to the path: a warm pool of light, balance balls on pedestals, hoops, a clown car, ladders, trunks.
    bays.forEach((zc, i) => {
      const pool = new Mesh(new CircleGeometry(12, 40), new MeshBasicMaterial({ map: pbGlow(), color: tin ? 0xFFF0D0 : 0xFFD8A0, transparent: true, opacity: tin ? 0.3 : 0.85, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(CX, FL + 0.04, zc); G.add(pool);
      if (!tin) cqRingProps(paint, metal, C, CX, FL, zc, TW, i, tin, r);
      // Garlands of bulbs swagged across between the king poles, high over the course, and along each side to the next pair.
      const x0 = CX - (HW + 7), x1 = CX + (HW + 7), gy = OV + 20;
      for (let k = 1; k < 24; k++) { const f = k / 24; bulbs.push([x0 + (x1 - x0) * f, gy - 3.5 * Math.sin(Math.PI * f), zc, 600 + i, k]); }
      for (const s of [-1, 1]) for (let k = 1; k < 20; k++) { const f = k / 20; bulbs.push([CX + s * (HW + 7), gy - 4 * Math.sin(Math.PI * f), zc - f * CQ_BAY, 700 + i * 2 + s, k]); }
    });
    // The sidewalls, the bleachers stepping up to them, a crowd on the bleachers fading into the dark.
    const len = Z_TOP - Z_BOT, midZ = (Z_TOP + Z_BOT) / 2;
    if (!tin) for (const s of [-1, 1]) {
      const wall = new Mesh(new PlaneGeometry(len, 18), K.wall); K.wall.map.repeat.set(len / 16, 1);
      wall.rotation.y = s * -Math.PI / 2; wall.position.set(CX + s * RX, FL + 9, midZ); G.add(wall);
      for (let k = 0; k < 9; k++) {
        const x0 = CX + s * (HW + 14 + k * 3.6), y = FL + 1.3 * (k + 1);
        paint.geo(new BoxGeometry(3.6, 1.3 * (k + 1), len), placeAt(x0 + s * 1.8, FL + 0.65 * (k + 1), midZ), k % 2 ? C.wood : C.seat);
      }
    }
    if (!tin) cqCrowd(G, C, CX, HW, FL, Z_TOP, Z_BOT, r);
    else for (const s of [-1, 1]) { const wall = new Mesh(new PlaneGeometry(len, SKY - FL + 1), K.wall); K.wall.map.repeat.set(len / 16, 1); wall.rotation.y = s * -Math.PI / 2; wall.position.set(CX + s * RX, (SKY + FL) / 2, midZ); G.add(wall); }
    // Painted sideshow banners high on the walls, and the performers' entrance: a curtain in a gilded arch.
    if (!tin) for (const [i, zc] of bays.entries()) for (const s of [-1, 1]) {
      const b = new Mesh(new PlaneGeometry(6, 6), K.posters); const cell = (i * 2 + (s > 0 ? 1 : 0)) % 4;
      const uv = b.geometry.attributes.uv; for (let q = 0; q < 4; q++) uv.setXY(q, (cell % 2) * 0.5 + uv.getX(q) * 0.5, 1 - Math.floor(cell / 2) * 0.5 - (1 - uv.getY(q)) * 0.5);
      b.rotation.y = s * -Math.PI / 2; b.position.set(CX + s * (RX - 0.3), FL + 13.5, zc + 18); G.add(b);
      if ((i + (s > 0 ? 1 : 0)) % 2) {
        const cur = new Mesh(new PlaneGeometry(9, 11), K.curtain); cur.rotation.y = s * -Math.PI / 2; cur.position.set(CX + s * (RX - 0.4), FL + 5.5, zc - 14); G.add(cur);
        metal.geo(new TorusGeometry(4.8, 0.3, 8, 24, Math.PI), placeAt(CX + s * (RX - 0.6), FL + 9, zc - 14, 0, Math.PI / 2, 0), C.brass);
      }
    }
  } else cqMidway(G, K, C, paint, metal, lit, bulbs, tick, fig, CX, HW, FL, Z_TOP, Z_BOT, r, live);

  // THE ACTS, in the rings and over the course.
  const acts = out ? [] : bays.slice(0, 4);
  if (tin) {                                                   // the tin toy fills its floor itself; over it, the trapeze and the wire
    cqTinKit(K);
    bays.forEach((zc, i) => { if (i % 2) cqTrapeze(G, K, C, paint, metal, tick, fig, CX, OV, zc, HW, live); else cqHighWire(G, K, C, metal, tick, fig, CX, OV, zc, HW, live); });
    cqTinFill({ G, K, C, paint, metal, lit, tick, fig, FL, live, r }, CX, HW, Z_TOP, Z_BOT, bays, bulbs, pieces, high);
  } else acts.forEach((zc, i) => {
    if (i === 0) {                                             // the ringmaster in the first ring; a clown beside; the human cannon aimed over the course
      fig(0, CX - 2, FL, zc + 1, 4.2); fig(1, CX + 3, FL, zc - 2, 3.6);
      cqCannon(G, K, C, paint, metal, tick, fig, CX + HW + 9, FL, zc - 16, CX - HW - 14, FL + 0.5, zc - 16, live);
      cqCarousel(G, K, C, paint, metal, lit, tick, fig, CX - HW - 11, FL, zc + 12, tin, live);
    } else if (i === 1) {                                      // the flying trapeze over the course; a juggler and a strongman below
      cqTrapeze(G, K, C, paint, metal, tick, fig, CX, OV, zc, HW, live);
      cqJuggle(G, K, tick, fig, CX - 2, FL, zc + 2, live); fig(4, CX + 3, FL, zc - 1, 3.8);
      cqCalliope(G, K, C, paint, metal, lit, tick, CX + HW + 13, FL, zc + 10, live);
    } else if (i === 2) {                                      // a unicyclist crossing on the high wire; clowns tumbling; the fire-breather
      cqHighWire(G, K, C, metal, tick, fig, CX, OV, zc, HW, live);
      const tumbler = fig(5, CX + 2, FL, zc, 3.4); tick.push((dt, t) => { tumbler.position.x = CX + 2 + Math.sin(t * 0.8) * 4; });
      fig(10, CX - 3, FL, zc + 2, 3.8); fig(tin ? 6 : 11, CX - HW - 8, FL, zc - 8, tin ? 4 : 7);
    } else {
      fig(tin ? 9 : 1, CX, FL, zc, tin ? 4 : 3.6); fig(tin ? 6 : 3, CX + 3, FL, zc + 2, tin ? 4 : 3.8);
      cqBandstand(G, K, C, paint, metal, CX - HW - 12, FL, zc, live);
    }
  });
  cqBalloons(G, tick, CX, HW, FL, Z_TOP, Z_BOT, r, live);
  cqDust(G, C, tick, FL, live);

  // The bulbs: one set of shapes, their glow as points; each string chases, the footlights breathe.
  const nb = bulbs.length, bm = new InstancedMesh(new IcosahedronGeometry(0.2, 0), new MeshBasicMaterial({ color: 0xFFFFFF, toneMapped: false }), nb);
  const o = new Object3D(), bc = new Color(C.bulb), dim = new Color(C.bulbDim), gp = new Float32Array(nb * 3), gc = new Float32Array(nb * 3);
  bulbs.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.updateMatrix(); bm.setMatrixAt(i, o.matrix); bm.setColorAt(i, bc); gp.set([x, y, z], i * 3); gc.set([bc.r, bc.g, bc.b], i * 3); });
  bm.frustumCulled = false; G.add(bm);
  const gg = new BufferGeometry(); gg.setAttribute('position', new Float32BufferAttribute(gp, 3)); gg.setAttribute('color', new Float32BufferAttribute(gc, 3));
  const glowPts = new Points(gg, new PointsMaterial({ size: 2.2, map: pbGlow(), vertexColors: true, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  glowPts.frustumCulled = false; G.add(glowPts);
  const tmp = new Color();
  tick.push((dt, t) => {
    if (!live) return;
    const ca = gg.attributes.color;
    bulbs.forEach(([, , , s, k], i) => {
      const on = s === -1 ? 0.7 + 0.3 * Math.sin(t * 2 + k * 0.5) : s === 99 ? ((((t * 3 - k * 0.25) % 1) + 1) % 1 < 0.6 ? 1 : 0.35) : ((((t * 1.6 - k / 6) % 1) + 1) % 1 < 0.5 ? 1 : 0.45);
      tmp.copy(dim).lerp(bc, on); bm.setColorAt(i, tmp); ca.setXYZ(i, tmp.r * on, tmp.g * on, tmp.b * on);
    });
    bm.instanceColor.needsUpdate = true; ca.needsUpdate = true;
  });

  for (const [b, mat] of [[paint, K.paint], [metal, K.metal], [lit, K.lit]]) for (const m of b.meshes(mat)) G.add(m);
  let T = 0;
  w.tick = (dt) => {
    T += dt;
    for (const f of tick) f(dt, T, camera.position.z);
    for (const m of figs) m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z);
  };
}
// What stands round a ring, near the path: pedestals with big striped balls, a stack of hoops, a clown car, a ladder, trunks.
function cqRingProps(paint, metal, C, CX, FL, zc, TW, i, tin, r) {
  const side = i % 2 ? 1 : -1, stripe = [C.poleStripe, tin ? 0xFFF1D2 : 0xF2E4C4];
  for (const [dx, dz] of [[side * (TW - 2.2), 8.5], [-side * (TW - 2), -9]]) {           // a pedestal (a striped drum) and a balance ball on it
    for (let k = 0; k < 4; k++) paint.geo(new CylinderGeometry(1.3, 1.3, 0.5, 20), placeAt(CX + dx, FL + 0.25 + k * 0.5, zc + dz), stripe[k % 2]);
    const B = 1.3; for (let k = 0; k < 8; k++) paint.geo(new SphereGeometry(B, 16, 8, k * Math.PI / 4, Math.PI / 4), placeAt(CX + dx, FL + 2 + B, zc + dz), [C.poleStripe, 0x2A5AC8, 0xF2C230, 0xF2E4C4][k % 4]);
  }
  for (let k = 0; k < 5; k++) metal.geo(new TorusGeometry(1.1, 0.08, 6, 24), placeAt(CX - side * (TW - 1.5), FL + 0.1 + k * 0.17, zc + 3, Math.PI / 2, 0, 0), [C.brass, 0xE0302A, 0x2A8AD8, 0xF2C230, 0x2AB88A][k]);   // hoops, stacked
  const cx = CX + side * (TW - 3.5), cz = zc - 2;                                         // the clown car: a tiny round car, wheels too big
  paint.geo(new BoxGeometry(1.6, 1.0, 2.6), placeAt(cx, FL + 1.0, cz), tin ? 0xE85A4A : 0xE0302A);
  paint.geo(new SphereGeometry(0.85, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), placeAt(cx, FL + 1.5, cz - 0.1), tin ? 0x2AA89A : 0xF2C230);
  for (const [wx, wz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) metal.geo(new TorusGeometry(0.42, 0.16, 8, 16), placeAt(cx + wx, FL + 0.55, cz + wz, 0, Math.PI / 2, 0), 0x1A1A1E);
  metal.geo(new TorusGeometry(0.22, 0.06, 6, 12), placeAt(cx, FL + 1.3, cz - 1.35), C.brass);                   // the horn
  for (const s of [-1, 1]) metal.geo(new CylinderGeometry(0.06, 0.06, 6, 6), placeAt(CX + side * (TW + 1.8) + s * 0.35, FL + 2.8, zc + 14, 0.25, 0, 0), 0xC8B890);   // a ladder, leaning
  for (let k = 0; k < 9; k++) metal.geo(new CylinderGeometry(0.04, 0.04, 0.7, 4), placeAt(CX + side * (TW + 1.8), FL + 0.4 + k * 0.62, zc + 14 - 0.15 - k * 0.155, 0, 0, Math.PI / 2), 0xC8B890);
  for (let k = 0; k < 3; k++) paint.geo(new BoxGeometry(1.4, 1.0, 1.0), placeAt(CX - side * (TW + 1.6), FL + 0.5 + (k === 2 ? 1 : 0), zc - 12 + (k === 2 ? 0.5 : k * 1.1)), [0x5A3A22, 0x3A2A5A, C.poleStripe][k]);   // prop trunks
}
// The sky beyond the tent (its darkness), or the midway's dusk.
function cqSky(g, look) {
  const C = CQ[look];
  g.fillStyle = pbLin(g, 0, 0, 0, 512, [[0, C.bg[0]], [0.55, C.bg[1]], [1, C.bg[2]]]); g.fillRect(0, 0, 512, 512);
  if (look === 'midway') {
    const r = seeded(4); for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`; g.fillRect(r() * 512, r() * 240, 1.5, 1.5); }
    g.fillStyle = pbRad(g, 300, 470, 10, 200, [[0, 'rgba(255,200,120,0.9)'], [1, 'rgba(255,120,60,0)']]); g.fillRect(0, 280, 512, 232);
  }
}
// A spotlight on a king pole: a beam and its pool, sweeping the sawdust round the ring.
function cqSpot(G, K, tick, x, y, z, cx, fl, cz, rad, ph, live) {
  const cone = new Mesh(new CylinderGeometry(0.35, 1, 1, 24, 1, true), K.cone), pool = new Mesh(new CircleGeometry(2.6, 32), K.halo);
  pool.rotation.x = -Math.PI / 2; G.add(cone, pool);
  const q = new Quaternion(), up = new Vector3(0, 1, 0), d = new Vector3();
  const place = (t) => {
    const tx = cx + Math.cos(t * 0.35 + ph) * rad, tz = cz + Math.sin(t * 0.5 + ph) * rad * 0.8;
    d.set(x - tx, y - fl, z - tz); const L = d.length(); d.normalize();
    q.setFromUnitVectors(up, d); cone.quaternion.copy(q); cone.scale.set(3.2, L, 3.2); cone.position.set((x + tx) / 2, (y + fl) / 2, (z + tz) / 2);
    pool.position.set(tx, fl + 0.05, tz);
  };
  place(0); if (live) tick.push((dt, t) => place(t));
}
// The crowd: one shape (head and shoulders), many coats, row on row, the far ones in the dark.
function cqCrowd(G, C, CX, HW, FL, Z_TOP, Z_BOT, r) {
  const B = pbBuild(); B.geo(new IcosahedronGeometry(0.24, 0), placeAt(0, 0.95, 0), 0xF2C6A0); B.geo(new BoxGeometry(0.62, 0.7, 0.4), placeAt(0, 0.45, 0), 0xFFFFFF);
  const geo = B.done(), spots = [];
  for (const s of [-1, 1]) for (let k = 1; k < 9; k++) for (let z = Z_TOP - 10; z > Z_BOT + 10; z -= 1.25) if (r() < 0.82) spots.push([CX + s * (HW + 14 + k * 3.6 + 1.2 + (r() - 0.5) * 0.8), FL + 1.3 * (k + 1), z + (r() - 0.5) * 0.4, s]);
  const mesh = new InstancedMesh(geo, new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), spots.length), o = new Object3D(), col = new Color();
  spots.forEach(([x, y, z, s], i) => { o.position.set(x, y, z); o.rotation.set(0, s > 0 ? -Math.PI / 2 : Math.PI / 2, 0); o.scale.setScalar(0.9 + r() * 0.25); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); col.setHex(C.crowd[Math.floor(r() * C.crowd.length)]).multiplyScalar(0.55 + r() * 0.35); mesh.setColorAt(i, col); });
  mesh.frustumCulled = false; G.add(mesh);
}
// THE HUMAN CANNON: a brass barrel on a painted wagon aimed over the course; every few seconds it fires an aerialist in
// an arc over the rail into the net across the way, with a puff of smoke and a burst of confetti.
function cqCannon(G, K, C, paint, metal, tick, fig, x, fl, z, nx, ny, nz, live) {
  const dir = Math.atan2(nx - x, nz - z), el = 0.62, L = 7;
  paint.geo(new BoxGeometry(4.2, 1.6, 6.5), placeAt(x, fl + 1.6, z, 0, dir, 0), C.poleStripe);
  for (const [dx, dz] of [[-2.2, -2], [2.2, -2], [-2.2, 2], [2.2, 2]]) { const c = Math.cos(dir), s = Math.sin(dir); metal.geo(new TorusGeometry(0.9, 0.18, 8, 20), placeAt(x + dx * c + dz * s, fl + 0.9, z - dx * s + dz * c, 0, dir + Math.PI / 2, 0), C.brass); }
  const barrel = new Group(); barrel.position.set(x, fl + 2.8, z); barrel.rotation.set(0, dir, 0); G.add(barrel);
  const Bb = pbBuild(); Bb.geo(new CylinderGeometry(1.0, 1.35, L, 28), placeAt(0, L / 2, 0), C.brass);
  for (const f of [0.15, 0.5, 0.92]) Bb.geo(new TorusGeometry(1.0 + 0.35 * (1 - f) + 0.08, 0.14, 8, 28), placeAt(0, L * f, 0, Math.PI / 2, 0, 0), 0x8A1A20);
  const tube = new Mesh(Bb.done(), K.metal); tube.rotation.x = Math.PI / 2 - el; barrel.add(tube);
  const stars = new Mesh(new CylinderGeometry(1.02, 1.37, L * 0.5, 28, 1, true), new MeshBasicMaterial({ map: cqStarsTex(), transparent: true, toneMapped: false }));
  stars.position.y = L * 0.45; tube.add(stars);
  const net = pbBuild(); net.geo(new BoxGeometry(7, 0.2, 9), placeAt(nx, ny + 2.5, nz, 0, dir, 0), 0x3A3A40);
  for (const [dx, dz] of [[-3.4, -4.4], [3.4, -4.4], [-3.4, 4.4], [3.4, 4.4]]) net.geo(new CylinderGeometry(0.15, 0.15, 2.6, 6), placeAt(nx + dx, ny + 1.3, nz + dz), 0x8A7A60);
  G.add(new Mesh(net.done(), K.paint));
  const flyer = fig(2, x, fl, z, 3.2, false); flyer.visible = false;
  const smoke = new Mesh(new CircleGeometry(2.4, 24), new MeshBasicMaterial({ map: pbGlow(), color: 0xE8DCC8, transparent: true, opacity: 0, depthWrite: false }));
  G.add(smoke);
  const confetti = cqConfetti(G);
  const mouth = new Vector3(x + Math.sin(dir) * Math.cos(el) * L, fl + 2.8 + Math.sin(el) * L, z + Math.cos(dir) * Math.cos(el) * L);
  if (!live) return;
  tick.push((dt, t) => {
    const u = t % 7;                                          // a shot every seven seconds: the flight takes two
    tube.position.z = u < 0.2 ? -0.6 * (1 - u / 0.2) : 0;
    flyer.visible = u < 2;
    if (u < 2) { const f = u / 2; flyer.position.set(mouth.x + (nx - mouth.x) * f, mouth.y + (ny + 3 - mouth.y) * f + 14 * Math.sin(Math.PI * f), mouth.z + (nz - mouth.z) * f); flyer.rotation.set(0, dir + Math.PI / 2, -Math.PI / 2 + f * Math.PI); }
    smoke.position.copy(mouth); smoke.position.y += u * 1.2; smoke.scale.setScalar(1 + u * 1.5); smoke.material.opacity = Math.max(0, 0.6 - u * 0.4);
    smoke.quaternion.copy(camera.quaternion);
    if (u < dt * 1.5) confetti.burst(mouth, 160);
  });
  tick.push((dt) => confetti.step(dt));
}
let cqStarsMemo = null;
const cqStarsTex = () => cqStarsMemo || (cqStarsMemo = canvasTex(256, 128, (g) => { g.clearRect(0, 0, 256, 128); g.fillStyle = '#FFF4D8'; for (let i = 0; i < 8; i++) { cqStar(g, 16 + i * 32, 40 + (i % 2) * 44, 12, 5); g.fill(); } }));
// Confetti: a few hundred scraps of colour, bursting out and fluttering down.
function cqConfetti(G) {
  const N = 400, pos = new Float32Array(N * 3).fill(-999), col = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N);
  const cols = [[1, 0.3, 0.3], [1, 0.85, 0.2], [0.3, 0.8, 1], [0.4, 1, 0.5], [1, 0.5, 0.9], [1, 1, 1]];
  for (let i = 0; i < N; i++) col.set(cols[i % cols.length], i * 3);
  const geo = new BufferGeometry(); geo.setAttribute('position', new Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  const pts = new Points(geo, new PointsMaterial({ size: 0.28, vertexColors: true, toneMapped: false })); pts.frustumCulled = false; G.add(pts);
  let next = 0;
  return {
    burst(at, n) { const p = geo.attributes.position.array; for (let k = 0; k < n; k++) { const i = next; next = (next + 1) % N; p[i * 3] = at.x; p[i * 3 + 1] = at.y; p[i * 3 + 2] = at.z;
      const a = Math.random() * 6.3, e = Math.random(); vel[i * 3] = Math.cos(a) * 6 * e; vel[i * 3 + 1] = 5 + Math.random() * 7; vel[i * 3 + 2] = Math.sin(a) * 6 * e; life[i] = 4 + Math.random() * 2; } },
    step(dt) { const p = geo.attributes.position.array; for (let i = 0; i < N; i++) { if (life[i] <= 0) continue; life[i] -= dt;
      vel[i * 3 + 1] = Math.max(-1.6, vel[i * 3 + 1] - 9 * dt); vel[i * 3] *= 0.985; vel[i * 3 + 2] *= 0.985;
      p[i * 3] += (vel[i * 3] + Math.sin(life[i] * 7 + i) * 0.8) * dt; p[i * 3 + 1] += vel[i * 3 + 1] * dt; p[i * 3 + 2] += vel[i * 3 + 2] * dt; if (life[i] <= 0) p[i * 3 + 1] = -999; }
      geo.attributes.position.needsUpdate = true; },
  };
}
// THE CAROUSEL: a striped canopy on a centre pole, painted horses rising and falling as it turns.
function cqCarousel(G, K, C, paint, metal, lit, tick, fig, x, fl, z, tin, live, cuts = null) {
  const grp = new Group(); grp.position.set(x, fl, z); G.add(grp);
  const B = pbBuild();
  B.geo(new CylinderGeometry(5.6, 5.8, 0.6, 32), placeAt(0, 0.3, 0), C.poleStripe);
  B.geo(new CylinderGeometry(0.5, 0.5, 6.5, 12), placeAt(0, 3.5, 0), C.brass);
  for (let k = 0; k < 16; k++) B.geo(new ConeGeometry(6.4, 2.4, 3, 1, true, k / 16 * Math.PI * 2, Math.PI * 2 / 16), placeAt(0, 7.6, 0), k % 2 ? 0xF2E4C4 : C.poleStripe);
  B.geo(new CylinderGeometry(6.2, 6.2, 0.8, 32, 1, true), placeAt(0, 6.2, 0), C.brass);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; B.geo(new CylinderGeometry(0.07, 0.07, 5.4, 6), placeAt(Math.cos(a) * 4.4, 3.4, Math.sin(a) * 4.4), C.brass); }   // the brass poles, turning with it
  const body = new Mesh(B.done(), K.paint); grp.add(body);
  const horses = [];
  if (cuts) {                                                // in a batch: each horse works out where the turning carousel has it
    for (let k = 0; k < 8; k++) { const a0 = k / 8 * Math.PI * 2; cuts.add({ cell: 8, x, y: fl + 1.2, z, h: 2.6, yaw: -a0, key: false, ph0: 0,
      anim: (t, e) => { const A = a0 - (live ? t * 0.45 : 0); e.x = x + Math.cos(A) * 4.4; e.z = z + Math.sin(A) * 4.4; e.yaw = -A; e.y = fl + 1.2 + (live ? 0.5 * Math.sin(t * 2.2 + k * 1.3) : 0); } }); }
    if (live) tick.push((dt, t) => { grp.rotation.y = t * 0.45; });
    return;
  }
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, h = fig(8, 0, 0, 0, 2.6, false); G.remove(h); grp.add(h); h.position.set(Math.cos(a) * 4.4, 1.2, Math.sin(a) * 4.4); h.rotation.y = -a; horses.push([h, a]); }
  if (!live) return;
  tick.push((dt, t) => { grp.rotation.y = t * 0.45; horses.forEach(([h, a], k) => { h.position.y = 1.2 + 0.5 * Math.sin(t * 2.2 + k * 1.3); }); });
}
// THE FLYING TRAPEZE: two small boards high on the king poles, a bar swinging between them across the course, an aerialist on it.
function cqTrapeze(G, K, C, paint, metal, tick, fig, CX, fl, zc, HW, live) {
  const y = fl + 27, piv = new Group(); piv.position.set(CX, y + 9, zc - 6); G.add(piv);
  for (const s of [-1, 1]) paint.geo(new BoxGeometry(2.4, 0.3, 2), placeAt(CX + s * (HW + 5.5), y - 2, zc - 6), C.poleStripe);
  const B = pbBuild(); for (const dz of [-0.9, 0.9]) B.geo(new CylinderGeometry(0.04, 0.04, 9, 4), placeAt(0, -4.5, dz), 0xE8E0D0);
  B.geo(new CylinderGeometry(0.09, 0.09, 2, 8), placeAt(0, -9, 0, Math.PI / 2, 0, 0), C.brass);
  piv.add(new Mesh(B.done(), K.metal));
  const flyer = fig(2, 0, 0, 0, 3.4, false); G.remove(flyer); piv.add(flyer); flyer.position.set(0, -12.4, 0);
  if (live) tick.push((dt, t) => { piv.rotation.z = Math.sin(t * 1.1) * 0.95; });
}
// THE HIGH WIRE: a wire between the poles high over the course, a unicyclist crossing and coming back.
function cqHighWire(G, K, C, metal, tick, fig, CX, fl, zc, HW, live) {
  const y = fl + 22, x0 = CX - HW - 7, x1 = CX + HW + 7;
  metal.geo(new CylinderGeometry(0.04, 0.04, x1 - x0, 4), placeAt(CX, y, zc + 4, 0, 0, Math.PI / 2), 0xD8D8E0);
  const u = fig(7, CX, y, zc + 4, 2.6, false);
  if (live) tick.push((dt, t) => { u.position.x = CX + Math.sin(t * 0.3) * (HW + 4); u.rotation.z = Math.sin(t * 2.3) * 0.08; });
}
// THE JUGGLER, with three clubs going round in the air.
function cqJuggle(G, K, tick, fig, x, fl, z, live) {
  fig(3, x, fl, z, 3.8);
  const clubs = [0, 1, 2].map((k) => { const m = new Mesh(new CylinderGeometry(0.06, 0.16, 0.6, 8), new MeshStandardMaterial({ color: [0xF4F0E8, 0xE0302A, 0x2A8A5A][k], roughness: 0.4 })); G.add(m); return m; });
  if (!live) return;
  tick.push((dt, t) => clubs.forEach((m, k) => { const f = ((t * 0.9 + k / 3) % 1), s = f < 0.5 ? 1 : -1, g = f < 0.5 ? f * 2 : (f - 0.5) * 2;
    m.position.set(x + s * (0.9 - 1.8 * g), fl + 3.3 + Math.sin(Math.PI * g) * 2.2, z + 0.3); m.rotation.z = t * 9 + k; }));
}
// THE CALLIOPE: a painted wagon with rows of brass pipes, puffing steam as it plays.
function cqCalliope(G, K, C, paint, metal, lit, tick, x, fl, z, live) {
  paint.geo(new BoxGeometry(4, 3, 7), placeAt(x, fl + 2.6, z), C.poleStripe);
  paint.geo(new BoxGeometry(4.3, 0.3, 7.3), placeAt(x, fl + 4.2, z), C.brass);
  for (const dz of [-2.6, 2.6]) for (const dx of [-2.1, 2.1]) metal.geo(new TorusGeometry(1.1, 0.15, 8, 20), placeAt(x + dx, fl + 1.1, z + dz, 0, Math.PI / 2, 0), C.brass);
  const tops = [];
  for (let row = 0; row < 2; row++) for (let k = 0; k < 9; k++) { const h = 1 + Math.abs(k - 4) * 0.3 + row * 0.4, px = x - 0.8 + row * 1.6, pz = z - 3 + k * 0.75; metal.geo(new CylinderGeometry(0.16, 0.16, h, 10), placeAt(px, fl + 4.35 + h / 2, pz), C.brass); tops.push([px, fl + 4.35 + h, pz]); }
  const puffs = tops.map(() => { const m = new Mesh(new CircleGeometry(0.5, 16), new MeshBasicMaterial({ map: pbGlow(), color: 0xF4F0E8, transparent: true, opacity: 0, depthWrite: false })); G.add(m); return m; });
  if (!live) return;
  tick.push((dt, t) => puffs.forEach((m, k) => { const f = ((t * 0.7 + k * 0.137) % 1); m.position.set(tops[k][0], tops[k][1] + f * 3, tops[k][2]); m.scale.setScalar(0.6 + f * 2.2); m.material.opacity = 0.5 * (1 - f); m.quaternion.copy(camera.quaternion); }));
}
// THE BANDSTAND: a little stage with a big drum, a tuba, cymbals.
function cqBandstand(G, K, C, paint, metal, x, fl, z) {
  paint.geo(new CylinderGeometry(5, 5.3, 1.2, 24), placeAt(x, fl + 0.6, z), C.wood);
  paint.geo(new CylinderGeometry(1.3, 1.3, 1.1, 24), placeAt(x - 1.5, fl + 2.4, z, Math.PI / 2, 0, 0), 0xF2E4C4);
  metal.geo(new TorusGeometry(1.32, 0.12, 8, 24), placeAt(x - 1.5, fl + 2.4, z - 0.55), C.brass);
  metal.geo(new TorusGeometry(0.9, 0.35, 10, 20), placeAt(x + 1.8, fl + 2.6, z), C.brass);
  metal.geo(new ConeGeometry(0.9, 1.4, 20, 1, true), placeAt(x + 2.4, fl + 3.6, z, 0, 0, -0.6), C.brass);
  for (const dx of [-3, 0.2]) metal.geo(new CylinderGeometry(0.8, 0.8, 0.05, 20), placeAt(x + dx, fl + 3.4, z + 1.6, 0.2, 0, 0), C.brass);
}
// Balloons drifting up out of sight, all along the course, from beside it.
function cqBalloons(G, tick, CX, HW, FL, Z_TOP, Z_BOT, r, live) {
  const N = 90, geo = new IcosahedronGeometry(0.55, 1); geo.scale(1, 1.2, 1);
  const mesh = new InstancedMesh(geo, new MeshStandardMaterial({ roughness: 0.25, metalness: 0.1 }), N), o = new Object3D(), col = new Color(), B = [];
  const cols = [0xE0302A, 0xF2C230, 0x2A8AD8, 0x2AB88A, 0xE85AA8, 0xF4F0E8];
  for (let i = 0; i < N; i++) { const s = r() < 0.5 ? -1 : 1; B.push({ x: CX + s * (HW + 3 + r() * 10), z: Z_TOP - r() * (Z_TOP - Z_BOT), y: FL + r() * 40, v: 0.8 + r() * 0.8, ph: r() * 6 }); col.setHex(cols[i % cols.length]); mesh.setColorAt(i, col); }
  mesh.frustumCulled = false; G.add(mesh);
  const place = (t) => { B.forEach((b, i) => { const y = FL + ((b.y - FL + t * b.v) % 42); o.position.set(b.x + Math.sin(t * 0.5 + b.ph) * 0.6, y, b.z); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); }); mesh.instanceMatrix.needsUpdate = true; };
  place(0); if (live) tick.push((dt, t) => place(t));
}
// Sawdust in the air: motes drifting in the light about the camera.
function cqDust(G, C, tick, FL, live) {
  const N = 700, p = new Float32Array(N * 3), r = seeded(19);
  for (let i = 0; i < N; i++) p.set([(r() - 0.5) * 60, FL + r() * 30, -r() * 80], i * 3);
  const geo = new BufferGeometry(); geo.setAttribute('position', new Float32BufferAttribute(p, 3));
  const pts = new Points(geo, new PointsMaterial({ size: 0.09, color: C.bulb, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  pts.frustumCulled = false; G.add(pts);
  tick.push((dt, t, camZ) => { pts.position.set(camera.position.x, 0, camZ + 10); if (live) pts.rotation.y = Math.sin(t * 0.05) * 0.2; });
}
// The rail dressed as the circus's own: printed tin boards with a studded band down each side. The pieces that mean
// something keep their meaning colours, as in every world: a pad's sides yellow, a moving platform cyan, a magnet strip's
// sides cyan, the colour lanes lime and violet, a puzzle square's floor in panels; a switched road fades in.
const cqCourseMemo = {};
function cqCourseMats(look) {
  if (cqCourseMemo[look]) return cqCourseMemo[look];
  const C = CQ[look], D = C.deck, tin = look === 'tintoy', env = cqEnv(look);
  const print = (base, star, lines) => canvasTex(256, 256, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    if (look === 'midway') { for (let y = 0; y < 256; y += 32) { g.fillStyle = y % 64 ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'; g.fillRect(0, y, 256, 30); g.fillStyle = 'rgba(60,40,20,0.35)'; g.fillRect(0, y + 30, 256, 2); } }
    else { g.fillStyle = lines; for (let y = 0; y < 256; y += 32) g.fillRect(0, y + 30, 256, 2); }
    if (tin) { g.fillStyle = star; for (let k = 0; k < 4; k++) { cqStar(g, 64 + (k % 2) * 128, 32 + k * 64, 14, 6); g.fill(); } }
  }, true);
  const band = (col, stud) => canvasTex(64, 256, (g) => { g.fillStyle = col; g.fillRect(0, 0, 64, 256); g.fillStyle = stud; for (let y = 16; y < 256; y += 32) { pbCircle(g, 32, y, 7); g.fill(); } }, true);
  const cellT = canvasTex(256, 256, (g) => {                // a puzzle square's floor: a printed panel to a cell
    g.fillStyle = D.base; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = D.band; g.lineWidth = 12; g.strokeRect(6, 6, 244, 244); g.strokeStyle = D.stud; g.lineWidth = 4; g.strokeRect(22, 22, 212, 212);
    g.fillStyle = D.stud; for (const [x, y] of [[22, 22], [234, 22], [22, 234], [234, 234]]) { pbCircle(g, x, y, 8); g.fill(); }
    if (tin) { g.fillStyle = D.band; cqStar(g, 128, 128, 30, 13); g.fill(); }
  });
  const std = (o) => keepMat(hazed(new MeshStandardMaterial({ roughness: tin ? 0.3 : 0.55, metalness: tin ? 0.5 : 0.05, envMap: env, envMapIntensity: 0.7, ...o })));
  const top = (base = D.base, star = D.band) => std({ map: print(base, star, 'rgba(0,0,0,0.06)') });
  const side = (col = D.band, stud = D.stud) => std({ map: band(col, stud), roughness: 0.4, metalness: tin ? 0.6 : 0.2, envMap: env, envMapIntensity: 0.8 });
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  return (cqCourseMemo[look] = {
    make: { top: () => top(), side: () => side() },
    top: top(), side: side(), under: std({ color: 0x1A0E0A, roughness: 0.9, metalness: 0 }),
    padTop: top(), padSide: side(hex(PAD_YELLOW), '#FFF1D2'),
    ferryTop: top('#D8F6FF', '#1A8AB8'), ferrySide: side('#2FB6D8', '#FFF1D2'), magSide: side('#2FB6D8', '#FFF1D2'),
    laneTop: [null, top('#E4F8C4', '#5A9A1A'), top('#E8DEFF', '#6A3AC8')], laneSide: [null, side('#8FD83A', '#FFF1D2'), side('#9A6BF0', '#FFF1D2')],
    cellTop: std({ map: cellT }),
  });
}
function circusCourse(look) {
  const M = cqCourseMats(look);
  for (const c of colliders) {
    if (c.holo || c.obstacle) continue;
    c.mesh.castShadow = false;
    if (c.power) {
      const S = c.power;
      if (S.top) { S.top.dispose(); S.side.dispose(); }
      S.top = M.make.top(); S.side = M.make.side(); S.top.transparent = S.side.transparent = true; S.fade = true;
      c.mesh.material = [S.side, S.side, S.top, M.under, S.side, S.side]; setTopUV(c.mesh, false);
      continue;
    }
    const [side, top] = c.ferry ? [M.ferrySide, M.ferryTop] : c.pad ? [M.padSide, M.padTop] : c.mag ? [M.magSide, M.padTop]
      : c.lane ? [M.laneSide[c.lane], M.laneTop[c.lane]] : c.cell ? [M.side, M.cellTop] : [M.side, M.top];
    c.mesh.material = [side, side, top, M.under, side, side]; setTopUV(c.mesh, !!c.cell);
  }
  for (const L of loopsIn) loopLook(L, M.top, M.side, CQ[look].bulb);
  circusPieces(look);                                         // every piece as the circus's own
}
