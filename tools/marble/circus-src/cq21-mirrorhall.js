/* THE HALL OF MIRRORS (owner, 2026-09-30: "in circus the warp zone was supposed to be a hall of mirrors"): where the
   circus's magician's cabinets lead, as the pinball machine's wormholes lead to its moon playfield and the city's to
   the crystal canyon. SUPERSEDED the same day by the maze (cq22: "I meant a maze of mirrors where it feels like it is
   impossible to get out"): this world is now only the maze's air, the maze its course. What follows was the first go. The same warp courses and their rule (the floor is polished: as slippery as the canyon), in a
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
  const G = w.group;
  scene.background = coverTex(64, (g) => { g.fillStyle = '#041412'; g.fillRect(0, 0, 64, 64); });
  scene.fog.color.setHex(0x062220); scene.fog.near = 7; scene.fog.far = 45;   // (the far corridors, and the corridors in the mirrors, fade into a dark sea green)
  camera.far = 60; camera.updateProjectionMatrix();
  HAZE.col.value.setHex(0x2A8A80); HAZE.k.value = 0.6; HAZE.dir.set(0, 0.2, -1).normalize();
  hemi.color.setHex(0xE8FFFA); hemi.groundColor.setHex(0x3A6A66); hemi.intensity = 1.25;
  sun.color.setHex(0xF4FFFC); sun.intensity = 0.9;
  w.marble = 'circus'; w.rings = [0x34E0FF, 0xFF6A3C];
  w.restyle = () => { circusCourse('tintoy'); czMirrorPieces(); };
  w.news = NEWS_CIRCUS; w.rules = RULES_CIRCUS;
  const glow = new Mesh(new PlaneGeometry(400, 400), new MeshBasicMaterial({ color: 0x041412 })); glow.rotation.x = -Math.PI / 2; glow.position.y = -30; G.add(glow);
  w.tick = (dt) => { czMazeAnimate(dt); };
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
POCKET_NEWS['circus-mirrors'] = 'The hall of mirrors: find the way out. Every mirror shows another corridor, and some doorways are glass';
