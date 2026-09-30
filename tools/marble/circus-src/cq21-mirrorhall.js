/* THE HALL OF MIRRORS (owner, 2026-09-30: "in circus the warp zone was supposed to be a hall of mirrors"): where the
   circus's magician's cabinets lead, as the pinball machine's wormholes lead to its moon playfield and the city's to
   the crystal canyon. The same warp courses and their rule (the floor is polished: as slippery as the canyon), in a
   long hall: tall gilt mirrors down both sides, and in them the rail and the marble again and again (each mirror is
   faint glass with the hall's reflection built behind it: the rail's decks, the marble and the far wall's frames
   mirrored across it, and once more in the mirror opposite); more mirrors standing at angles on the floor below the
   rail; a velvet ceiling hung with bulbs; a black and white floor. Its crystals are shards of mirror, gold and rose;
   its fireballs are mirror balls; its bridges panes of silvered glass. */
let czMirrorBalls = [];
function czMirrorKit() {
  const K = cqKit('tintoy'); if (K.hall) return K.hall;
  const keep = (m) => { m.userData.keep = true; return m; };
  const checkT = canvasTex(256, 256, (g) => {               // the floor: black and white marble, polished
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#F2EEE6' : '#1A1418'; g.fillRect(x * 64, y * 64, 64, 64); }
    const r = seeded(3); g.strokeStyle = 'rgba(160,150,170,0.35)'; g.lineWidth = 1.5;
    for (let k = 0; k < 40; k++) { g.beginPath(); let x = r() * 256, y = r() * 256; g.moveTo(x, y); for (let s = 0; s < 4; s++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
  }, true);
  const velvetT = canvasTex(256, 256, (g) => {              // the ceiling: deep red velvet in folds, gold stars
    for (let x = 0; x < 256; x++) { const v = 0.55 + 0.45 * Math.cos(x / 256 * Math.PI * 8); g.fillStyle = `rgb(${Math.round(90 * v)},${Math.round(12 * v)},${Math.round(28 * v)})`; g.fillRect(x, 0, 1, 256); }
    const r = seeded(8); g.fillStyle = '#C8902A'; for (let k = 0; k < 10; k++) { cqStar(g, r() * 256, r() * 256, 6, 2.6); g.fill(); }
  }, true);
  const tileT = canvasTex(256, 128, (g) => {                // a mirror ball's facets
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) { const v = 140 + ((x * 37 + y * 91) % 110); g.fillStyle = `rgb(${v},${v},${Math.min(255, v + 12)})`; g.fillRect(x * 8 + 0.5, y * 8 + 0.5, 7, 7); }
  });
  return (K.hall = {
    floor: keep(hazed(new MeshStandardMaterial({ map: checkT, roughness: 0.12, metalness: 0.35, envMap: K.env, envMapIntensity: 1.1 }))),
    glass: keep(new MeshStandardMaterial({ color: 0xD8E6F4, metalness: 1, roughness: 0.04, envMap: K.env, envMapIntensity: 1.6, transparent: true, opacity: 0.28, depthWrite: false, side: DoubleSide })),
    silver: keep(hazed(new MeshStandardMaterial({ color: 0xE8EEF6, metalness: 1, roughness: 0.03, envMap: K.env, envMapIntensity: 1.7 }))),
    ghost: keep(hazed(new MeshStandardMaterial({ color: 0xB9AE9E, roughness: 0.5, metalness: 0.2 }))),   // the rail, as seen in a mirror
    velvet: keep(new MeshStandardMaterial({ map: velvetT, roughness: 0.9, side: DoubleSide })),
    ball: keep(new MeshStandardMaterial({ map: tileT, metalness: 1, roughness: 0.12, envMap: K.env, envMapIntensity: 2 })),
    shard: keep(new MeshStandardMaterial({ color: 0xFFFFFF, metalness: 1, roughness: 0.05, envMap: K.env, envMapIntensity: 1.8, flatShading: true })),
  });
}
function czMirrorHall(w) {
  cqLook = 'tintoy';
  const K = cqKit('tintoy'), M = czMirrorKit(), G = w.group, end = courseEnd(), pieces = level ? level.pieces : [], live = !REDUCED, r = seeded(313);
  let lo = 0, hi = -1e9, minX = 1e9, maxX = -1e9;
  for (const p of pieces) {
    if (typeof p.y === 'number') { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }
    if (typeof p.x === 'number') { const hw = (p.w || 4) / 2; minX = Math.min(minX, p.x - hw); maxX = Math.max(maxX, p.x + hw); }
  }
  if (minX > maxX) { minX = -4; maxX = 6; }
  if (hi < lo) hi = lo;
  const FL = lo - CQ_DROP, xL = minX - 3.5, xR = maxX + 3.5, Dx = 2 * (xR - xL), CX = (xL + xR) / 2, Z_TOP = 25, Z_BOT = end - 45, TOP = hi + 15, LEN = Z_TOP - Z_BOT;
  scene.background = coverTex(512, (g) => { g.fillStyle = pbLin(g, 0, 0, 0, 512, [[0, '#0A0410'], [0.5, '#1E0A1E'], [1, '#0A0410']]); g.fillRect(0, 0, 512, 512); });
  scene.fog.color.setHex(0x160A1C); scene.fog.near = 35; scene.fog.far = 150;
  camera.far = 180; camera.updateProjectionMatrix();
  HAZE.col.value.setHex(0x8A3A7A); HAZE.k.value = 1.4; HAZE.dir.set(0, 0.25, -1).normalize();
  hemi.color.setHex(0xFFE8DA); hemi.groundColor.setHex(0x2A1024); hemi.intensity = 1.0;
  sun.color.setHex(0xFFF0DC); sun.intensity = 1.35;
  w.marble = 'circus'; w.rings = [0x34E0FF, 0xFF6A3C];
  w.restyle = () => { circusCourse('tintoy'); czMirrorPieces(); };
  w.news = NEWS_CIRCUS; w.rules = RULES_CIRCUS;
  w.physics = { acc: 10, damp: 0.4 };                       // the floor is polished: as slippery as the canyon it stands in for
  const tick = [], bulbs = [];

  // The floor, the ceiling.
  const floor = new Mesh(new PlaneGeometry(Dx * 3, LEN + 60), M.floor); floor.rotation.x = -Math.PI / 2; floor.position.set(CX, FL, (Z_TOP + Z_BOT) / 2);
  M.floor.map.repeat.set(Dx * 3 / 6, (LEN + 60) / 6); floor.userData.ground = true; G.add(floor);
  const ceil = new Mesh(new PlaneGeometry(Dx * 3, LEN + 60), M.velvet); ceil.rotation.x = Math.PI / 2; ceil.position.set(CX, TOP, (Z_TOP + Z_BOT) / 2);
  M.velvet.map.repeat.set(Dx * 3 / 10, (LEN + 60) / 10); G.add(ceil);

  // The mirror walls: glass panels in gilt frames down both sides, and their images in each other.
  const PW = 3.2, H = TOP - FL, glass = pbBuild(), frames = pbBuild();
  const wall = (B, x, face, withGlass) => {
    for (let z = Z_TOP; z > Z_BOT; z -= PW) {
      if (withGlass) glass.geo(new PlaneGeometry(PW - 0.3, H - 1.2), placeAt(x, FL + H / 2, z - PW / 2, 0, face * Math.PI / 2, 0), 0xFFFFFF);
      B.geo(new BoxGeometry(0.34, H, 0.3), placeAt(x, FL + H / 2, z, 0, 0, 0), 0xD8A640);                       // a gilt pilaster between panels
      B.geo(new CylinderGeometry(0.3, 0.3, 0.2, 12), placeAt(x - face * 0.1, TOP - 0.9, z - PW / 2, 0, 0, Math.PI / 2), 0xF2C230);   // a rosette over the panel
      if (withGlass) for (let k = 0; k < 3; k++) bulbs.push([x - face * 0.25, TOP - 0.45, z - PW * (k + 0.5) / 3, k]);
    }
    B.geo(new BoxGeometry(0.5, 0.5, LEN), placeAt(x, TOP - 0.25, (Z_TOP + Z_BOT) / 2), 0xC8902A);   // the cornice
    B.geo(new BoxGeometry(0.5, 0.6, LEN), placeAt(x, FL + 0.3, (Z_TOP + Z_BOT) / 2), 0xC8902A);     // the skirting
  };
  wall(frames, xL, 1, true); wall(frames, xR, -1, true);
  const images = pbBuild();                                  // the far wall, as each mirror shows it, and the near one twice over
  wall(images, 2 * xR - xL, -1, false); wall(images, 2 * xL - xR, 1, false); wall(images, xR + Dx, -1, false); wall(images, xL - Dx, 1, false);
  G.add(new Mesh(glass.done(), M.glass));
  G.add(new Mesh(frames.done(), K.metal));
  G.add(new Mesh(images.done(), K.metal));

  // The rail, as the mirrors show it: its decks mirrored across each wall, and again in the wall opposite.
  const ghosts = pbBuild();
  for (const p of pieces) {
    if (p.t !== 'flat' || typeof p.x !== 'number') continue;
    for (const gx of [2 * xR - p.x, 2 * xL - p.x, p.x + Dx, p.x - Dx]) ghosts.geo(new BoxGeometry(p.w, 0.5, p.d), placeAt(gx, (p.y || 0) - 0.25, p.z), 0xFFFFFF);
  }
  if (ghosts.count()) G.add(new Mesh(ghosts.done(), M.ghost));
  // And the marble, as the mirrors show it.
  const twins = [0, 1, 2, 3].map(() => { const m = new Mesh(marble.geometry, marble.material); G.add(m); return m; });
  tick.push(() => {
    const p = marble.position, xs = [2 * xR - p.x, 2 * xL - p.x, p.x + Dx, p.x - Dx];
    twins.forEach((m, i) => { m.material = marble.material; m.position.set(xs[i], p.y, p.z); m.quaternion.copy(marble.quaternion); if (i === 0 || i === 1) m.scale.set(-1, 1, 1); m.visible = marble.visible; });
  });

  // Mirrors standing at angles on the floor, below the rail: the maze the hall is.
  const stand = pbBuild(), standF = pbBuild();
  for (let z = Z_TOP - 6; z > Z_BOT; z -= 5 + r() * 4) for (let k = 0; k < 2; k++) {
    const x = xL + 2 + r() * (xR - xL - 4), yaw = r() * Math.PI, h = 4.5 + r() * 2.5, wdt = 2.2 + r() * 1.2;
    if (FL + h > lo - 1.5) continue;                          // never up to the rail
    stand.geo(new BoxGeometry(wdt, h, 0.06), placeAt(x, FL + h / 2, z, 0, yaw, 0), 0xFFFFFF);
    standF.geo(new BoxGeometry(wdt + 0.24, 0.16, 0.16), placeAt(x, FL + h + 0.08, z, 0, yaw, 0), 0xD8A640);
    for (const s of [-1, 1]) standF.geo(new BoxGeometry(0.14, h, 0.14), placeAt(x + Math.cos(yaw) * s * (wdt / 2 + 0.07), FL + h / 2, z - Math.sin(yaw) * s * (wdt / 2 + 0.07), 0, yaw, 0), 0xD8A640);
  }
  if (stand.count()) { G.add(new Mesh(stand.done(), M.silver)); G.add(new Mesh(standF.done(), K.metal)); }

  // Bulbs along the cornices, chasing; their glow.
  const nb = bulbs.length, bm = new InstancedMesh(new IcosahedronGeometry(0.16, 0), new MeshBasicMaterial({ color: 0xFFFFFF, toneMapped: false }), nb);
  const o = new Object3D(), bc = new Color(0xFFE6B0), dim = new Color(0x6A4A30), gp = new Float32Array(nb * 3), gc = new Float32Array(nb * 3);
  bulbs.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.updateMatrix(); bm.setMatrixAt(i, o.matrix); bm.setColorAt(i, bc); gp.set([x, y, z], i * 3); gc.set([bc.r, bc.g, bc.b], i * 3); });
  bm.frustumCulled = false; G.add(bm);
  const gg = new BufferGeometry(); gg.setAttribute('position', new Float32BufferAttribute(gp, 3)); gg.setAttribute('color', new Float32BufferAttribute(gc, 3));
  const glowPts = new Points(gg, new PointsMaterial({ size: 1.8, map: pbGlow(), vertexColors: true, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  glowPts.frustumCulled = false; G.add(glowPts);
  const tmp = new Color();
  tick.push((dt, t) => {
    if (!live) return;
    const ca = gg.attributes.color;
    bulbs.forEach(([, , , k], i) => { const on = ((((t * 1.8 - i / 9) % 1) + 1) % 1) < 0.5 ? 1 : 0.45; tmp.copy(dim).lerp(bc, on); bm.setColorAt(i, tmp); ca.setXYZ(i, tmp.r * on, tmp.g * on, tmp.b * on); });
    bm.instanceColor.needsUpdate = true; ca.needsUpdate = true;
    for (const b of czMirrorBalls) b.rotation.y += dt * 2.4;
  });
  let T = 0;
  w.tick = (dt) => { T += dt; for (const f of tick) f(dt, T); };
}
// The warp course's own pieces, as the hall's: shards of mirror, mirror balls, silvered glass.
function czMirrorPieces() {
  const M = czMirrorKit();
  czMirrorBalls = [];
  for (const m of levelGroup.children) {                     // the crystals: the same points, silvered (their gold and rose tints kept)
    if (m.isInstancedMesh && m.material && m.material.customProgramCacheKey && m.material.customProgramCacheKey() === 'shard-crystals') tkSet(m, 'material', M.shard);
  }
  for (const c of crossings) {
    const X = c.cross; if (!X || !X.fire) continue;
    for (const car of X.cars) {                              // a fireball: a mirror ball instead, rolling across
      tkHide(...car.mesh.children, ...car.trail);
      const b = tkAdd(car.mesh, new Mesh(new SphereGeometry(FB_R, 24, 16), M.ball)); czMirrorBalls.push(b);
      const glint = tkAdd(car.mesh, new Sprite(new SpriteMaterial({ map: dot, color: 0xFFFFFF, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false })));
      glint.scale.set(1.6, 1.6, 1); glint.position.set(0.2, 0.3, 0.4);
    }
  }
  for (const c of cracks) if (c.crackFx) {                  // the bridges: silvered glass
    tkSet(c.crackFx.glass, 'color', new Color(0xDCE8F6)); tkSet(c.crackFx.glass, 'emissive', new Color(0x6A8AB0));
    tkSet(c.crackFx.top, 'emissive', new Color(0xB8D0F0));
  }
}
WORLDS_ADD('circus-mirrors', (w) => czMirrorHall(w));
POCKET_NEWS['circus-mirrors'] = 'The hall of mirrors: the floor is polished, so brake early. Only one of those marbles is you';
