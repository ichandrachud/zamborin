/* THE CIRCUS PUZZLES (owner, 2026-09-29, the circus's third stage: seven picked for its puzzle squares, "Getting out of a
   house of mirrors" (the owner's own), balance scales, the shell game, the knife thrower, ticket turnstiles, the clown
   car and the acrobat pyramid). Each is a kind of puzzle square, laid and played as the space puzzles are (the same
   hooks, P.sp and P.spz: spBuild and the rest hand a circus kind to its cz twin), dressed as the tin circus's own. The
   way out is a stage curtain that parts once the square is solved; the pad on the bay beside the road in puts the
   square back as it was. Every layout was found by a search in tools/marble/puz/ (circpush.js and the rest), which
   also checks that the careless way does not work.
     clowncar  push the clowns into the little car. They get in only through its back door, where the white arrows
               point in; every other side of the car is a wall. All of them in, and it honks
     pyramid   push the acrobats onto the gold stars. On every star, they climb into a pyramid
     scales    push the weights onto the scale's two pans until it hangs level: the same kilos each side (a pan may
               hold an anvil already, its kilos on the board over it) */
const CZG = { spgate: 1 };                                 // the way out (a space gate underneath, dressed as a curtain)
const CZ_CAR_L = { '=': CZG, k: { weight: 1, clown: 1 }, x: { drum: 1 }, N: { car: 'n' }, S: { car: 's' }, E: { car: 'e' }, W: { car: 'w' } };
const CZ_PYR_L = { '=': CZG, a: { weight: 1, acro: 1 }, A: { weight: 1, acro: 1, spot: 1 }, o: { spot: 1 }, x: { drum: 1 } };
const CZ_SCL_L = { '=': CZG, l: { pan: 'l' }, r: { pan: 'r' }, '^': { post: 1 }, x: { drum: 1 } };
for (let k = 1; k <= 9; k++) CZ_SCL_L[k] = { weight: 1, kg: k };
const CZ_KINDS = new Set(['clowncar', 'pyramid', 'scales']);
const CZ_PUSH = new Set(['clowncar', 'pyramid', 'scales']);
const CZ_OPP = { n: 's', s: 'n', e: 'w', w: 'e' }, CZ_DIR = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] };
const CZ_TRY = [];                                          // the circus puzzles' try-outs (filled with the ladders)
const CZ_PARTS = {};                                        // the kinds the later files add: { build, pad, step, reset, landed, animate, state }

// ---- THE KIT: the tin circus's materials, and the shapes the puzzles share ----
let czKitMemo = null;
function czKit() {
  if (czKitMemo) return czKitMemo;
  const K = cqKit('tintoy'), PK = cqPieceKit('tintoy');
  const std = (o) => keepMat(hazed(new MeshStandardMaterial({ roughness: 0.35, metalness: 0.5, envMap: K.env, envMapIntensity: 0.9, ...o })));
  const spotT = canvasTex(256, 256, (g) => {                // an acrobat's star: a gold star in a cream disc, a red ring round it
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#E8303A'; pbCircle(g, 128, 128, 124); g.fill();
    g.fillStyle = '#FFF1D2'; pbCircle(g, 128, 128, 104); g.fill();
    g.fillStyle = '#F2C230'; cqStar(g, 128, 134, 88, 36); g.fill();
    g.strokeStyle = INK; g.lineWidth = 5; cqStar(g, 128, 134, 88, 36); g.stroke();
  });
  const arrowT = canvasTex(128, 128, (g) => {               // the car's back door: white chevrons, inked, pointing in
    g.clearRect(0, 0, 128, 128);
    for (let k = 0; k < 2; k++) {
      const y = 84 - k * 38; g.beginPath(); g.moveTo(20, y + 14); g.lineTo(64, y - 14); g.lineTo(108, y + 14); g.lineTo(108, y + 30); g.lineTo(64, y + 2); g.lineTo(20, y + 30); g.closePath();
      g.fillStyle = '#FFFFFF'; g.fill(); g.strokeStyle = INK; g.lineWidth = 5; g.stroke();
    }
  });
  const panT = canvasTex(512, 256, (g) => {                 // a pan of the scale: brass, a raised rim, a cross-hatch where the weights stand
    g.fillStyle = '#C8902A'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = pbRad(g, 256, 128, 10, 300, [[0, '#F8D870'], [1, '#B07A1E']]); g.fillRect(8, 8, 496, 240);
    g.strokeStyle = 'rgba(90,50,10,0.35)'; g.lineWidth = 3; for (let x = 24; x < 512; x += 24) { g.beginPath(); g.moveTo(x, 12); g.lineTo(x - 40, 244); g.stroke(); }
    g.strokeStyle = INK; g.lineWidth = 8; g.strokeRect(6, 6, 500, 244); g.beginPath(); g.moveTo(256, 10); g.lineTo(256, 246); g.stroke();
  });
  return (czKitMemo = { K, PK,
    velvet: std({ color: 0xD8283A, map: PK.velvetT, side: DoubleSide, roughness: 0.85, metalness: 0.05 }),
    iron: std({ color: 0x2E2A36, metalness: 0.75, roughness: 0.3 }),
    spot: keepMat(new MeshBasicMaterial({ map: spotT, transparent: true, depthWrite: false })),
    spotGlow: keepMat(new MeshBasicMaterial({ map: pbGlow(), color: 0xFFD860, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false })),
    arrow: keepMat(new MeshBasicMaterial({ map: arrowT, transparent: true, depthWrite: false })),
    pan: std({ map: panT, metalness: 0.35, roughness: 0.35, emissive: 0xFFFFFF, emissiveMap: panT, emissiveIntensity: 0.3 }),
  });
}
const czNums = {};
function czNumTex(n) {                                     // a number, inked on a cream disc with a gold ring (the weights, the scale's boards)
  return czNums[n] || (czNums[n] = canvasTex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = '#F2C230'; pbCircle(g, 64, 64, 62); g.fill(); g.fillStyle = '#FFF1D2'; pbCircle(g, 64, 64, 52); g.fill();
    g.fillStyle = INK; g.font = '800 ' + (String(n).length > 1 ? 58 : 72) + 'px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 64, 68);
  }));
}
const czDrums = {};
function czDrumGeo(k, h, rad) {                            // a circus pedestal: painted panels, gold bands top and foot
  const key = k + ':' + h + ':' + rad; if (czDrums[key]) return czDrums[key];
  const B = pbBuild(), [a, b] = [[0xE8303A, 0xFFF1D2], [0x2A4AE8, 0xF2C230], [0x2AA89A, 0xFFF1D2], [0xE85A4A, 0x2A5AC8]][k % 4];
  for (let i = 0; i < 12; i++) B.geo(new CylinderGeometry(rad, rad, h, 2, 1, true, i * TAU / 12, TAU / 12), placeAt(0, h / 2, 0), i % 2 ? a : b);
  for (const y of [0.05, h - 0.05]) B.geo(new CylinderGeometry(rad + 0.04, rad + 0.04, 0.1, 24), placeAt(0, y, 0), 0xF2C230);
  B.geo(new CylinderGeometry(rad, rad, 0.02, 24), placeAt(0, h, 0), a);
  return (czDrums[key] = B.done());
}
// A fixed thing on a cell: stops the marble (and whatever is pushed) like a wall.
function czBlock(P, x, y, z, hx, hy, hz, tag) {
  const box = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), HIDDEN); box.visible = false; levelGroup.add(box);
  const pos = new Vector3(x, y, z), q = new Quaternion();
  colliders.push({ mesh: box, pos, prev: pos.clone(), quat: q, inv: q.clone(), half: new Vector3(hx, hy, hz), delta: new Vector3(), ferry: null, holo: null, pad: null, obstacle: tag });
}
// A figure from the tin atlas, standing on a pushed piece and leaning back a little toward the camera over the square.
function czFigure(cell, h) {
  const m = new Mesh(cqCellGeo(cell, h), czKit().K.figs); m.rotation.x = -0.9; m.castShadow = true; levelGroup.add(m); return m;
}

// ---- BUILDING ----
function czBuild(P) {
  const kind = P.pc.sp.kind, G = P.grid, Z = czKit(), top = P.y + 0.016;
  const S = P.spz = { kind, done: false, cz: true, push: CZ_PUSH.has(kind), fixed: [], cheer: 0 }; P.sp = P.pc.sp;
  const each = (key, fn) => { for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) if (key in G.cells[r][c]) fn(G.cells[r][c], c, r, P.X(c), P.Z(r)); };
  each('drum', (cell, c, r, x, z) => {                     // a tall drum: nothing gets past it
    const m = new Mesh(czDrumGeo(c + r, 1.3, 0.82), Z.K.paint); m.position.set(x, P.y, z); m.castShadow = true; levelGroup.add(m);
    czBlock(P, x, P.y + 0.65, z, 0.84, 0.65, 0.84, 'czfix'); S.fixed.push([c, r]);
  });
  if (kind === 'clowncar') {
    each('car', (cell, c, r, x, z) => {
      const grp = new Group(); grp.position.set(x, P.y, z); levelGroup.add(grp);
      const deck = new Mesh(czDrumGeo(3, 0.26, 1.0), Z.K.paint); grp.add(deck);
      const car = new Mesh(cqClownCarGeo(0), Z.K.paint); car.scale.setScalar(1.15); car.position.y = 0.26 + 0.46 * 1.15; car.castShadow = true;
      car.rotation.y = { n: -Math.PI / 2, s: Math.PI / 2, e: Math.PI, w: 0 }[cell.car]; grp.add(car);   // its back (the door) toward the door's side
      const [dc, dr] = CZ_DIR[cell.car], arrow = new Mesh(new PlaneGeometry(1.0, 1.0), Z.arrow);   // on the deck behind it, pointing in
      arrow.rotation.set(-Math.PI / 2, 0, Math.atan2(-dc, -dr)); arrow.position.set(dc * 0.62, 0.275, -dr * 0.62); grp.add(arrow);
      czBlock(P, x, P.y + 0.7, z, 0.98, 0.7, 0.98, 'czfix');
      S.car = { c, r, door: cell.car, grp, car, bounce: 0, y0: car.position.y }; S.fixed.push([c, r]);
    });
  }
  if (kind === 'pyramid') {
    S.spots = [];
    each('spot', (cell, c, r, x, z) => {
      const m = spDisc(x, top, z, 0.98, Z.spot), glow = spDisc(x, top + 0.004, z, 1.1, Z.spotGlow.clone());
      levelGroup.add(m, glow); S.spots.push({ c, r, x, z, glow, k: 0 });
    });
  }
  if (kind === 'scales') {
    S.panL = []; S.panR = []; const an = P.pc.sp.anvil || '';
    S.offL = an[0] === 'l' ? +an.slice(1) : 0; S.offR = an[0] === 'r' ? +an.slice(1) : 0; S.L = S.offL; S.R = S.offR; S.n = 0;
    each('pan', (cell, c, r) => (cell.pan === 'l' ? S.panL : S.panR).push([c, r]));
    each('post', (cell, c, r, x, z) => {                  // the post: a striped column, the beam on top, a board at each end with the pan's kilos
      const col = new Mesh(czDrumGeo(1, 2.6, 0.34), Z.K.paint); col.position.set(x, P.y, z); col.castShadow = true;
      const foot = new Mesh(czDrumGeo(0, 0.3, 0.8), Z.K.paint); foot.position.set(x, P.y, z);
      levelGroup.add(col, foot);
      czBlock(P, x, P.y + 0.65, z, 0.84, 0.65, 0.84, 'czfix'); S.fixed.push([c, r]);
      const beam = new Group(); beam.position.set(x, P.y + 2.72, z); levelGroup.add(beam);
      const B = pbBuild(), arm = 1.5 * CELL - 0.2;
      B.geo(new BoxGeometry(2 * arm, 0.14, 0.14), placeAt(0, 0, 0), 0xF2C230);
      B.geo(new SphereGeometry(0.2, 12, 8), placeAt(0, 0, 0), 0xE8303A);
      B.geo(new ConeGeometry(0.16, 0.5, 4), placeAt(0, 0.34, 0), 0xF2C230);   // the pointer: straight up when it is level
      for (const s of [-1, 1]) { B.geo(new SphereGeometry(0.12, 10, 8), placeAt(s * arm, 0, 0), 0xF2C230); B.geo(new CylinderGeometry(0.03, 0.03, 0.5, 6), placeAt(s * arm, -0.25, 0), 0xF2C230); }
      beam.add(new Mesh(B.done(), Z.K.metal));
      S.boards = [-1, 1].map((s) => {                     // hanging from each end, kept upright: the pan's kilos
        const hang = new Group(); hang.position.set(s * arm, -0.5, 0); beam.add(hang);
        const mat = new MeshBasicMaterial({ map: czNumTex(0), transparent: true, depthWrite: false }), board = new Mesh(new CircleGeometry(0.56, 32), mat);
        board.position.y = -0.42; board.rotation.x = -0.5; hang.add(board);
        const halo = new Mesh(new CircleGeometry(0.72, 32), keepMat(new MeshBasicMaterial({ map: pbGlow(), color: 0xFFD860, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false })));
        halo.position.set(0, -0.42, -0.02); halo.rotation.x = -0.5; hang.add(halo);
        const off = s < 0 ? S.offL : S.offR;
        if (off) {                                        // an anvil on this end already, its kilos inked on its side
          const A = pbBuild();
          A.geo(new BoxGeometry(0.5, 0.14, 0.26), placeAt(0, 0.1, 0), 0x3A3440); A.geo(new BoxGeometry(0.22, 0.12, 0.2), placeAt(0, 0.23, 0), 0x3A3440);
          A.geo(new BoxGeometry(0.62, 0.12, 0.3), placeAt(0.04, 0.34, 0), 0x3A3440); A.geo(new ConeGeometry(0.1, 0.24, 6), placeAt(0.44, 0.34, 0, 0, 0, -Math.PI / 2), 0x3A3440);
          const anvil = new Mesh(A.done(), Z.K.metal); anvil.position.set(0, 0.16, -0.12); hang.add(anvil);   // on top of its board
        }
        return { hang, mat, halo, shown: -1 };
      });
      S.beam = { beam, tilt: 0 };
    });
    for (const L of [S.panL, S.panR]) {                   // the pans: a brass dish under both cells of each
      const x = (P.X(L[0][0]) + P.X(L[L.length - 1][0])) / 2, z = P.Z(L[0][1]), w = L.length * CELL - 0.24;
      const m = new Mesh(new BoxGeometry(w, 0.05, CELL - 0.24), Z.pan); m.position.set(x, P.y + 0.027, z); m.receiveShadow = true; levelGroup.add(m);
    }
  }
  if (CZ_PARTS[kind]) CZ_PARTS[kind].build(P);
}
// After everything: the curtain on the way out, and the pieces to push dressed as the circus's own.
function czBuilt(P) {
  const S = P.spz, Z = czKit();
  for (const g of P.gates) {
    if (g.kind !== 'space') continue;
    const grp = g.sign.parent, span = CELL - WALL_T, H = GATE_H + 0.1;
    for (const m of [...grp.children]) if (m.material !== P.mats.wall) grp.remove(m);   // all but the posts
    const leaves = [-1, 1].map((s) => {
      const L = new Group(); grp.add(L);
      const geo = new PlaneGeometry(span / 2, H, 10, 1), p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, 0.05 * Math.sin((p.getX(i) / (span / 2) + 0.5) * TAU * 2.5));   // folds
      geo.computeVertexNormals(); geo.translate(-s * span / 4, H / 2, 0);   // hung from its outer edge
      const cloth = new Mesh(geo, Z.velvet); cloth.castShadow = true; L.add(cloth); L.position.x = s * span / 2;
      return { L, s };
    });
    const B = pbBuild();                                   // the pelmet: red, a gold band, scallops; bulbs along it
    B.geo(new BoxGeometry(span + 0.36, 0.3, 0.2), placeAt(0, H + 0.12, 0), 0xE8303A);
    B.geo(new BoxGeometry(span + 0.4, 0.07, 0.24), placeAt(0, H + 0.26, 0), 0xF2C230);
    for (let k = 0; k < 6; k++) B.geo(new CylinderGeometry(0.13, 0.13, 0.2, 12, 1, false, 0, Math.PI), placeAt(-span / 2 + (k + 0.5) * span / 6, H - 0.03, 0, Math.PI / 2, 0, 0), 0xF2C230);
    const pel = new Mesh(B.done(), Z.K.paint); pel.castShadow = true; grp.add(pel);
    const lamps = [];
    for (let k = 0; k < 5; k++) {
      const m = new Mesh(new SphereGeometry(0.075, 10, 8), new MeshBasicMaterial({ color: 0x5A4A30, toneMapped: false }));
      m.position.set((k - 2) * span / 5.5, H + 0.13, 0.12); grp.add(m); lamps.push(m);
    }
    g.door = { leaves, lamps, span, cz: true };
  }
  if (!S.push) return;
  P.crates.forEach((W, i) => {
    const cell = P.grid.cells[W.r0][W.c0];
    W.cz = true; W.mesh.material = HIDDEN; W.mesh.castShadow = false;
    if (cell.kg) {                                        // a strongman's weight: iron, its kilos on a disc on top
      W.kg = cell.kg;
      const body = new Mesh(new CylinderGeometry(0.56, 0.72, 0.86, 24), Z.iron); body.position.y = -CRATE_H / 2 + 0.43; body.castShadow = true;
      const band = new Mesh(new CylinderGeometry(0.62, 0.66, 0.1, 24), Z.PK.gold); band.position.y = -CRATE_H / 2 + 0.66;
      const face = new Mesh(new CircleGeometry(0.5, 32), keepMat(new MeshBasicMaterial({ map: czNumTex(cell.kg) }))); face.rotation.x = -Math.PI / 2; face.position.y = -CRATE_H / 2 + 0.87;
      W.mesh.add(body, band, face);
      return;
    }
    const body = new Mesh(czDrumGeo(cell.clown ? 0 : 1 + (i % 3), 0.7, 0.72), Z.K.paint); body.position.y = -CRATE_H / 2; body.castShadow = true; W.mesh.add(body);
    W.figCell = cell.clown ? 1 : [4, 5, 2, 4][i % 4]; W.fig = czFigure(W.figCell, 2.3);
    W.figK = 0; W.hop = -1;
  });
}

// ---- PLAYING ----
function czPad(P, c, r, cell) { const X = CZ_PARTS[P.spz.kind]; if (X) X.pad(P, c, r, cell); }
// Pushed: a cell the way it is pushed, if that cell is free floor; into the clown car only through its door.
function czPush(W, dx, dz) {
  const P = W.P, dc = dx, dr = -dz, tc = W.c + dc, tr = W.r + dr, dir = dc > 0 ? 'e' : dc < 0 ? 'w' : dr > 0 ? 'n' : 's';
  const knock = () => { if (simT - W.blockT > 0.5) { W.blockT = simT; sound('knock'); } };
  if (tc < 0 || tc >= P.cols || tr < 0 || tr >= P.rows || plazaEdge(P, W.c, W.r, dir) !== null) return knock();
  const cell = P.grid.cells[tr][tc];
  if (P.crates.some((o) => o !== W && !o.inCar && ((o.c === tc && o.r === tr) || (o.moving && o.tc === tc && o.tr === tr)))) return knock();
  if ('car' in cell) { if (CZ_OPP[cell.car] !== dir) return knock(); W.intoCar = true; }   // the door faces back the way the clown comes
  else if (cell.void || cell.drum || cell.post) return knock();
  W.moving = true; W.t = 0; W.fc = W.c; W.fr = W.r; W.tc = tc; W.tr = tr; W.into = null; W.slideT = undefined;
  sound('scrape');
}
function czArrive(W) {
  const P = W.P, S = P.spz;
  if (W.intoCar) {                                        // in: the marble cannot touch it now; its figure hops in and is gone
    W.intoCar = false; W.inCar = true; W.docked = true; W.hop = 0;
    W.col.pos.y = P.y - 50; W.col.prev.copy(W.col.pos); W.mesh.visible = false;
    S.car.bounce = 1; sound('thunk'); burst(P.X(W.c), P.y + 1.2, P.Z(W.r), 0xF2C230, 12, 2.4);
  }
}
function czCheer(P) {                                     // solved: confetti in the circus's colours
  const S = P.spz; S.cheer = 1;
  const x = P.X(P.cols / 2 - 0.5), z = P.Z(P.rows / 2 - 0.5);
  for (const col of [0xE8303A, 0xF2C230, 0x2A4AE8, 0x2AA89A]) burst(x, P.y + 2.4, z, col, 14, 4.5);
}
// Every physics step in play: whether it is solved, and the curtain.
function czStep(P) {
  const S = P.spz;
  if (CZ_PARTS[S.kind]) { CZ_PARTS[S.kind].step(P); return; }
  if (S.kind === 'scales') {
    let L = S.offL, R = S.offR, n = 0;
    for (const W of P.crates) {
      if (W.moving) continue;
      if (S.panL.some(([c, r]) => c === W.c && r === W.r)) { L += W.kg; n++; }
      if (S.panR.some(([c, r]) => c === W.c && r === W.r)) { R += W.kg; n++; }
    }
    S.L = L; S.R = R; S.n = n;
  }
  if (!S.done) {
    if (S.kind === 'clowncar') S.done = P.crates.every((W) => W.inCar);
    if (S.kind === 'pyramid') S.done = S.spots.every((q) => P.crates.some((W) => !W.moving && W.c === q.c && W.r === q.r));
    if (S.kind === 'scales') S.done = S.n > 0 && S.L === S.R && !P.crates.some((W) => W.moving);
    if (S.done) {
      sound('unlock'); czCheer(P);
      if (S.kind === 'pyramid') { S.pyr = 0; czPyramidSlots(P); }
      if (S.kind === 'clowncar') S.car.honk = 1;
    }
  }
  for (const g of P.gates) if (g.kind === 'space') { const was = g.state; g.state = S.done ? 'open' : 'shut'; if (was === 'shut' && g.state === 'open') sound('door'); }
}
// Where each acrobat goes in the pyramid, over the middle of the stars: the heaviest along the foot, the lightest on top.
function czPyramidSlots(P) {
  const S = P.spz, A = P.crates, n = A.length, cx = S.spots.reduce((a, q) => a + q.x, 0) / S.spots.length, cz = S.spots.reduce((a, q) => a + q.z, 0) / S.spots.length;
  const rows = n <= 1 ? [1] : n === 2 ? [1, 1] : n === 3 ? [2, 1] : n <= 5 ? [n - 2, 2] : [3, 2, 1];
  const order = A.slice().sort((a, b) => [4, 5, 2].indexOf(a.figCell) - [4, 5, 2].indexOf(b.figCell)); let k = 0;
  rows.forEach((m, j) => { for (let i = 0; i < m; i++) { const W = order[k++]; if (W) W.slot = new Vector3(cx + (i - (m - 1) / 2) * 0.62, P.y + 0.7 + j * 1.05, cz + 0.05 * j); } });
}
// The square as it was (the pad by the road in, or a restart). Says whether anything moved.
function czReset(P, quiet) {
  const S = P.spz; let moved = false;
  if (CZ_PARTS[S.kind]) return CZ_PARTS[S.kind].reset(P, quiet);
  if (S.push) for (const W of P.crates) {                 // (the crates themselves are put back by resetPlaza)
    if (W.inCar) moved = true;
    W.inCar = false; W.intoCar = false; W.docked = false; W.hop = -1; W.mesh.visible = true; W.slot = null;
    if (W.fig) { W.fig.visible = true; W.fig.scale.setScalar(1); }
  }
  if (S.done && S.push) moved = true;
  if (S.push) { S.done = false; S.pyr = undefined; }
  return moved;
}
function czLanded(P) { const X = CZ_PARTS[P.spz.kind]; if (X) X.landed(P); }

// ---- EVERY FRAME ----
function czAnimate(P, dt) {
  const S = P.spz, e = (rate) => (REDUCED ? 1 : 1 - Math.exp(-rate * dt));
  S.cheer = Math.max(0, S.cheer - dt);
  for (const g of P.gates) {                              // the curtain parts, gathering to each side; the bulbs over it light
    if (!g.door || !g.door.cz) continue;
    const u = ease(clamp(g.open, 0, 1)), D = g.door, sc = 1 - 0.8 * u;
    for (const { L, s } of D.leaves) { L.scale.x = sc; L.position.x = s * D.span / 2; }
    D.lamps.forEach((m, i) => m.material.color.setHex(S.done ? (REDUCED || ((simT * 4 + i) | 0) % 2 ? 0xFFE8A0 : 0xFFB850) : g.flash > 0.05 ? 0xFF6A5A : 0x5A4A30));
  }
  if (CZ_PARTS[S.kind]) { CZ_PARTS[S.kind].animate(P, dt); return; }
  if (!S.push) return;
  for (const W of P.crates) {
    if (!W.fig) continue;
    const F = W.fig;
    if (W.hop >= 0) {                                     // into the car: a hop over its side and down, smaller and smaller
      W.hop = Math.min(1, W.hop + dt / 0.45);
      const u = W.hop, x = P.X(S.car.c), z = P.Z(S.car.r);
      F.position.set(x, P.y + 0.7 + Math.sin(Math.PI * u) * 1.1 - 0.5 * u, z + 0.1);
      F.scale.setScalar(Math.max(0.001, 1 - u * 0.9)); F.visible = u < 1;
      if (u >= 1) W.hop = -2;
      continue;
    }
    if (W.hop === -2) continue;
    if (W.slot && S.pyr !== undefined) {                  // the pyramid: each leaps to its place in turn
      const i = P.crates.indexOf(W), u = ease(clamp(S.pyr * 1.6 - i * 0.25, 0, 1)), from = _czv.set(W.mesh.position.x, P.y + 0.7, W.mesh.position.z + 0.1);
      F.position.lerpVectors(from, W.slot, u); F.position.y += Math.sin(Math.PI * u) * 1.2;
      continue;
    }
    F.position.set(W.mesh.position.x, P.y + 0.7, W.mesh.position.z + 0.1);
  }
  if (S.pyr !== undefined) S.pyr = Math.min(2, S.pyr + dt);
  if (S.kind === 'clowncar') {
    const C = S.car; C.bounce = Math.max(0, C.bounce - dt * 2.5); C.honk = Math.max(0, (C.honk || 0) - dt * 0.8);
    C.car.position.y = C.y0 + (REDUCED ? 0 : 0.18 * Math.sin(Math.PI * C.bounce) + 0.12 * Math.abs(Math.sin(simT * 18)) * C.honk);
  }
  if (S.kind === 'pyramid') for (const q of S.spots) {
    const on = P.crates.some((W) => !W.moving && W.c === q.c && W.r === q.r) ? 1 : 0;
    q.k += (on - q.k) * e(8); q.glow.material.opacity = 0.55 * q.k + (S.done ? 0.25 * Math.sin(simT * 6) ** 2 : 0);
  }
  if (S.kind === 'scales' && S.beam) {
    const want = clamp((S.L - S.R) * 0.07, -0.3, 0.3);    // the heavier side down
    S.beam.tilt += (want - S.beam.tilt) * e(4); S.beam.beam.rotation.z = S.beam.tilt;
    [S.L, S.R].forEach((v, i) => {
      const B = S.boards[i]; B.hang.rotation.z = -S.beam.tilt;
      if (B.shown !== v) { B.shown = v; B.mat.map = czNumTex(v); B.mat.needsUpdate = true; }
      B.halo.material.opacity = S.done ? 0.6 + 0.3 * Math.sin(simT * 6) : S.L === S.R && S.n ? 0.4 : 0;
    });
  }
}
const _czv = new Vector3();
// For the pilot and the tests: what a square is doing.
function czState(P) {
  const S = P.spz, o = { kind: S.kind, x0: P.x0, z0: P.z0, y: P.y, cols: P.cols, rows: P.rows, map: P.pc.map, entry: P.pc.entry, exit: P.pc.exit, done: !!S.done, sp: P.pc.sp };
  if (S.push) Object.assign(o, { pieces: P.crates.map((W) => ({ c: W.c, r: W.r, v: W.kg || 1, moving: !!W.moving, gone: !!W.inCar })), fixed: S.fixed,
                                  car: S.car ? { c: S.car.c, r: S.car.r, door: S.car.door } : null, spots: S.spots ? S.spots.map((q) => [q.c, q.r]) : null,
                                  panL: S.panL || null, panR: S.panR || null, offL: S.offL || 0, offR: S.offR || 0, L: S.L, R: S.R });
  if (CZ_PARTS[S.kind]) CZ_PARTS[S.kind].state(P, o);
  return o;
}
