/* THE CIRCUS PUZZLES, the two to watch:
     shells  the shell game. The magician lifts the cup with the gold star under it, puts it down, and shuffles the
             cups. When the pads in front of them light, roll onto the pad of the cup you think it is under. The
             wrong cup: he shows where it was, and you are sent back to watch again from the start (a guess costs
             something). Later squares take two or three rounds, more swaps, quicker hands, and two pairs at once
     knives  the knife thrower stands on the wall. He throws a knife into every target that counts, lets you look,
             and pulls them out; the rope across the way in drops, and every board looks the same again. Roll across
             on the boards he did not hit: onto one he did, and a knife pins you and sends you back (he throws them
             again for you, and the pad by the road has him throw them again)
   Both begin when the marble rolls in, and again after a fall. */
const CZ_SHL_L = { '=': CZG, t: { table: 1 }, p: { pick: 1 } };
const CZ_KNF_L = { '=': CZG, o: { target: 1 } };

function czKit2() {
  const Z = czKit(); if (Z.cup) return Z;
  const std = (o) => keepMat(hazed(new MeshStandardMaterial({ roughness: 0.35, metalness: 0.5, envMap: Z.K.env, envMapIntensity: 0.9, ...o })));
  const cupT = canvasTex(256, 128, (g) => {               // a cup: red tin, white spots, gold bands top and foot
    g.fillStyle = '#E8303A'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#FFF1D2'; for (let y = 0; y < 3; y++) for (let x = 0; x < 8; x++) { pbCircle(g, x * 32 + (y % 2) * 16 + 8, 30 + y * 30, 7); g.fill(); }
    g.fillStyle = '#F2C230'; g.fillRect(0, 0, 256, 12); g.fillRect(0, 112, 256, 16);
  }, true);
  const starT = canvasTex(128, 128, (g) => { g.clearRect(0, 0, 128, 128); g.fillStyle = '#F2C230'; cqStar(g, 64, 68, 58, 24); g.fill(); g.strokeStyle = INK; g.lineWidth = 5; cqStar(g, 64, 68, 58, 24); g.stroke(); });
  const boardT = canvasTex(256, 256, (g) => {             // a knife thrower's board: wood, a painted bullseye (every one the same)
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#B07A3E'; pbCircle(g, 128, 128, 124); g.fill();
    g.strokeStyle = 'rgba(80,40,10,0.35)'; g.lineWidth = 3; for (let y = 20; y < 256; y += 18) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y + 6); g.stroke(); }
    for (const [r, c] of [[96, '#FFF1D2'], [72, '#E8303A'], [48, '#FFF1D2'], [24, '#E8303A']]) { g.fillStyle = c; pbCircle(g, 128, 128, r); g.fill(); }
    g.strokeStyle = INK; g.lineWidth = 6; pbCircle(g, 128, 128, 121); g.stroke();
  });
  const feltT = canvasTex(256, 64, (g) => {               // the magician's table: red velvet with a gold fringe
    g.fillStyle = '#A81C28'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = 'rgba(0,0,0,0.18)'; for (let x = 0; x < 256; x += 16) g.fillRect(x, 0, 8, 50);
    g.fillStyle = '#F2C230'; g.fillRect(0, 48, 256, 6); g.fillStyle = '#C8902A'; for (let x = 2; x < 256; x += 6) g.fillRect(x, 54, 3, 10);
  }, true);
  return Object.assign(Z, {
    cup: std({ map: cupT, metalness: 0.45 }), star: keepMat(new MeshBasicMaterial({ map: starT, transparent: true, depthWrite: false, toneMapped: false })),
    board: keepMat(new MeshStandardMaterial({ map: boardT, transparent: true, roughness: 0.7, metalness: 0, depthWrite: false })),
    felt: std({ map: feltT, roughness: 0.8, metalness: 0.05 }), tabletop: std({ color: 0x1E5A3A, roughness: 0.8, metalness: 0.05 }),
    steel: std({ color: 0xE6ECF4, metalness: 1, roughness: 0.15 }),
    padRing: () => keepMat(new MeshBasicMaterial({ color: PAD_YELLOW, transparent: true, opacity: 0.25, toneMapped: false })),
    rope: std({ color: 0xC8202C, roughness: 0.6, metalness: 0.1 }),
  });
}
let czKnifeGeoMemo = null;
function czKnifeGeo() {                                   // a knife, its tip at the origin, pointing down
  if (czKnifeGeoMemo) return czKnifeGeoMemo;
  const B = pbBuild();
  B.geo(new BoxGeometry(0.1, 0.62, 0.025), placeAt(0, 0.31, 0), 0xE6ECF4);
  B.geo(new ConeGeometry(0.05, 0.12, 4), placeAt(0, -0.02, 0, Math.PI, 0, 0, 1, 1, 0.3), 0xE6ECF4);
  B.geo(new BoxGeometry(0.26, 0.05, 0.07), placeAt(0, 0.64, 0), 0xF2C230);
  B.geo(new CylinderGeometry(0.045, 0.05, 0.36, 8), placeAt(0, 0.84, 0), 0xE8303A);
  B.geo(new SphereGeometry(0.06, 8, 6), placeAt(0, 1.03, 0), 0xF2C230);
  return (czKnifeGeoMemo = B.done());
}
const czSeeded = (seed) => { let s = seed % 2147483646 + 1; const f = () => ((s = (s * 16807) % 2147483647) / 2147483647); f(); f(); f(); return f; };   // (the first few draws of a small seed are small: skipped)

function czBuild2(P) {
  const S = P.spz, Z = czKit2(), sp = P.pc.sp, G = P.grid, top = P.y + 0.016;
  const each = (key, fn) => { for (let r = 0; r < P.rows; r++) for (let c = 0; c < P.cols; c++) if (key in G.cells[r][c]) fn(G.cells[r][c], c, r, P.X(c), P.Z(r)); };
  if (S.kind === 'shells') {
    const slots = []; each('table', (cell, c, r) => slots.push([c, r]));
    const tr = slots[0][1], x0 = P.X(slots[0][0]), x1 = P.X(slots[slots.length - 1][0]), z = P.Z(tr), w = x1 - x0 + CELL - 0.3, H = 0.8;
    const cloth = new Mesh(new BoxGeometry(w, H, CELL - 0.4), [Z.felt, Z.felt, Z.tabletop, Z.felt, Z.felt, Z.felt]); cloth.position.set((x0 + x1) / 2, P.y + H / 2, z); cloth.castShadow = true; cloth.receiveShadow = true;
    levelGroup.add(cloth);
    czBlock(P, (x0 + x1) / 2, P.y + H / 2, z, w / 2, H / 2, (CELL - 0.4) / 2, 'czfix');
    const mag = czFigure(0, 2.8); mag.position.set((x0 + x1) / 2, P.y + 0.02, z - CELL / 2 + 0.05); mag.rotation.x = -0.75;   // the magician, behind the table
    const star = new Mesh(new PlaneGeometry(0.8, 0.8), Z.star); star.rotation.x = -Math.PI / 2; levelGroup.add(star);
    const cups = slots.map(([c], i) => {
      const grp = new Group(); levelGroup.add(grp);
      const body = new Mesh(new CylinderGeometry(0.4, 0.58, 0.95, 28, 1, true), Z.cup); body.position.y = 0.475; body.castShadow = true;
      const lid = new Mesh(new CircleGeometry(0.4, 28), Z.PK.gold); lid.rotation.x = -Math.PI / 2; lid.position.y = 0.95;
      const knob = new Mesh(new SphereGeometry(0.13, 12, 8), Z.PK.gold); knob.position.y = 1.02;
      grp.add(body, lid, knob);
      return { grp, slot: i, from: i, lift: 0, want: 0 };
    });
    const pads = [];
    each('pick', (cell, c, r, x, zz) => {
      const ringMat = Z.padRing(), ring = spRing(x, top + 0.004, zz, 0.62, 0.8, ringMat), dotM = spDisc(x, top + 0.006, zz, 0.24, ringMat);
      levelGroup.add(ring, dotM); pads.push({ c, r, ringMat, flash: 0 });
    });
    Object.assign(S, { slots, tableY: P.y + H, z, cups, star, pads, phase: 'idle', t: 0, round: 0, rounds: sp.rounds || 1, shows: 0, swaps: [], si: 0, prize: 0, picked: -1,
                       swapT: sp.swapT || 0.8, nSwaps: sp.swaps || 3, pairs: sp.pairs || 0 });
    czShellsPlace(P);
  }
  if (S.kind === 'knives') {
    S.targets = []; S.knives = [];
    for (let r = 1; r < P.rows; r++) for (let c = 0; c < P.cols; c++) {   // a board on every cell past the way in: all alike
      if (G.cells[r][c].void) continue;
      levelGroup.add(spDisc(P.X(c), top + 0.003, P.Z(r), 0.92, Z.board));
      if (!G.cells[r][c].target) continue;
      const glow = spDisc(P.X(c), top + 0.006, P.Z(r), 1.05, keepMat(new MeshBasicMaterial({ map: pbGlow(), color: 0xFF3A2A, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false })));
      levelGroup.add(glow); S.targets.push({ c, r, glow, k: 0 });
    }
    const side = sp.side === 'w' ? -1 : 1, wx = side > 0 ? P.x0 + P.cols * CELL : P.x0, mr = Math.floor(P.rows / 2), tz = P.Z(mr);
    const stand = new Mesh(czDrumGeo(2, 0.5, 0.5), Z.K.paint); stand.position.set(wx, P.y + WALL_H, tz); levelGroup.add(stand);
    const man = czFigure(3, 2.6); man.position.set(wx, P.y + WALL_H + 0.5, tz); man.rotation.x = -0.75;
    S.hand = new Vector3(wx - side * 0.3, P.y + WALL_H + 2.2, tz);
    const rng = czSeeded((sp.seed || 1) * 977 + P.rows);
    S.order = S.targets.map((t) => [rng(), t]).sort((a, b) => a[0] - b[0]).map((a) => a[1]);
    for (let i = 0; i < S.targets.length + 1; i++) {        // one for every target, and one for you
      const m = new Mesh(czKnifeGeo(), Z.K.paint); m.scale.setScalar(1.6); m.visible = false; m.castShadow = true; levelGroup.add(m);
      S.knives.push({ m, t: -1, to: null, back: 0 });
    }
    const ropeZ = P.z0 - CELL, rope = new Mesh(new CylinderGeometry(0.07, 0.07, P.cols * CELL - 0.3, 10), Z.rope);   // the rope over the edge past the way in
    rope.rotation.z = Math.PI / 2; rope.position.set(P.x0 + P.cols * CELL / 2, P.y + 0.75, ropeZ); levelGroup.add(rope);
    const posts = [0.12, P.cols * CELL - 0.12].map((dx) => { const m = new Mesh(new CylinderGeometry(0.07, 0.07, 0.9, 10), Z.PK.gold); m.position.set(P.x0 + dx, P.y + 0.45, ropeZ); levelGroup.add(m); return m; });
    const box = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), HIDDEN); box.visible = false; levelGroup.add(box);
    const pos = new Vector3(P.x0 + P.cols * CELL / 2, P.y + 0.6, ropeZ), q = new Quaternion();
    S.ropeCol = { mesh: box, pos, prev: pos.clone(), quat: q, inv: q.clone(), half: new Vector3(P.cols * CELL / 2, 0.6, 0.12), delta: new Vector3(), ferry: null, holo: null, pad: null, obstacle: 'czfix' };
    colliders.push(S.ropeCol);
    Object.assign(S, { rope, posts, ropeK: 1, phase: 'idle', t: 0, throwT: sp.throwT || 0.4, hold: sp.hold || 1.5, hit: null, shown: 0 });
  }
}
// The cups where their slots are (the star under the prize cup).
function czShellsPlace(P) {
  const S = P.spz;
  for (const C of S.cups) { const [c] = S.slots[C.slot]; C.grp.position.set(P.X(c), S.tableY, S.z); C.from = C.slot; }
}
// A new shuffle: n swaps of two slots (or two pairs at once), never the same pair twice running.
function czShellsShuffle(P) {
  const S = P.spz, n = S.slots.length, rng = czSeeded((P.pc.sp.seed || 1) * 131 + S.round * 17 + S.shows * 7919), out = [];
  let last = '';
  for (let k = 0; k < S.nSwaps; k++) {
    let sw;
    for (let t = 0; t < 20; t++) {
      if (S.pairs && n >= 4 && rng() < 0.5) { const p = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]][Math.floor(rng() * 3)]; sw = [[p[0], p[1]], [p[2], p[3]]]; }
      else { const a = Math.floor(rng() * n); let b = Math.floor(rng() * (n - 1)); if (b >= a) b++; sw = [[Math.min(a, b), Math.max(a, b)]]; }
      if (JSON.stringify(sw) !== last) break;
    }
    last = JSON.stringify(sw); out.push(sw);
  }
  S.swaps = out; S.si = 0;
}
function czShellsStart(P) {
  const S = P.spz;
  S.shows = (S.shows || 0) + 1;                            // every show a new shuffle, even after a fall (so it cannot be learnt by heart)
  S.phase = 'show'; S.t = 0; S.picked = -1; S.prize = Math.floor(czSeeded((P.pc.sp.seed || 1) * 7 + S.round * 3 + S.shows * 101)() * S.cups.length);
  czShellsShuffle(P);
}
function czPad2(P, c, r, cell) {
  const S = P.spz;
  if (S.kind === 'shells' && cell.pick && S.phase === 'pick') {
    const slot = S.slots.findIndex(([sc]) => sc === c), C = S.cups.find((u) => u.slot === slot);
    S.picked = S.cups.indexOf(C); C.want = 1; S.phase = 'reveal'; S.t = 0; S.right = S.picked === S.prize;
    const pd = S.pads.find((q) => q.c === c && q.r === r); if (pd) pd.flash = 1;
    sound(S.right ? 'key' : 'buzz');
  }
}
function czStep2(P) {
  const S = P.spz;
  const inside = ball.grounded && ball.p.z < P.z0 - 0.3 && ball.p.z > P.z0 - P.rows * CELL && ball.p.x > P.x0 && ball.p.x < P.x0 + P.cols * CELL && Math.abs(ball.p.y - R - P.y) < 0.3;
  if (S.kind === 'shells') {
    S.t += STEP;
    if (S.phase === 'idle' && inside && !S.done) czShellsStart(P);
    if (S.phase === 'show') {                             // the star shown: its cup up, then down
      const C = S.cups[S.prize]; C.want = S.t > 0.3 && S.t < 1.6 ? 1 : 0;
      if (S.t > 2.1) { S.phase = 'shuffle'; S.t = 0; }
    }
    if (S.phase === 'shuffle') {
      if (S.t >= S.swapT) {                               // a swap done: the cups in their new slots
        for (const [a, b] of S.swaps[S.si]) { const A = S.cups.find((u) => u.slot === a), B = S.cups.find((u) => u.slot === b); A.slot = b; B.slot = a; }
        czShellsPlace(P); S.si++; S.t = 0;
        if (S.si >= S.swaps.length) { S.phase = 'pick'; sound('tick'); }
      }
    }
    if (S.phase === 'reveal') {
      if (!S.right && S.t > 0.5) S.cups[S.prize].want = 1; // the wrong one: where it really was, and back you go
      if (!S.right && S.t > 1.5) { S.phase = 'idle'; ball.v.set(0, 0, 0); startFall(); return; }
      if (S.right && S.t > 1.3) {
        for (const C of S.cups) C.want = 0;
        S.round++; if (S.round >= S.rounds) { S.done = true; S.phase = 'won'; sound('unlock'); czCheer(P); } else { S.phase = 'wait'; S.t = 0; }
      }
    }
    if (S.phase === 'wait' && S.t > 0.7) czShellsStart(P);
  }
  if (S.kind === 'knives') {
    S.t += STEP;
    if (S.phase === 'idle' && inside) { S.phase = 'show'; S.t = 0; S.shown = 0; for (const K of S.knives) { K.t = -1; K.m.visible = false; } }
    if (S.phase === 'show') {                             // one knife after another, each into its board
      while (S.shown < S.order.length && S.t >= S.shown * S.throwT) { const K = S.knives[S.shown]; K.to = S.order[S.shown]; K.t = 0; K.back = 0; S.shown++; }
      if (S.shown >= S.order.length && S.t >= S.order.length * S.throwT + 0.3) { S.phase = 'hold'; S.t = 0; }
    }
    if (S.phase === 'hold' && S.t >= S.hold) { S.phase = 'pull'; S.t = 0; for (const K of S.knives) if (K.to) K.back = 0.0001; sound('whirr'); }
    if (S.phase === 'pull' && S.t >= 0.5) { S.phase = 'cross'; S.t = 0; sound('click'); }
    if (S.phase === 'cross' && !S.done && ball.grounded && !S.hit) {
      const c = Math.floor((ball.p.x - P.x0) / CELL), r = Math.floor((P.z0 - ball.p.z) / CELL);
      const dx = Math.abs(ball.p.x - P.X(c)), dz = Math.abs(ball.p.z - P.Z(r)), deep = dx < CELL / 2 - 0.3 && dz < CELL / 2 - 0.3;
      if (deep && S.targets.some((t) => t.c === c && t.r === r)) {   // on a target: a knife, and back you go
        const K = S.knives[S.knives.length - 1]; K.to = { c, r, ball: true }; K.t = 0; K.back = 0; S.hit = { t: 0 }; sound('knock');
      }
      if (r === P.rows - 1 && c === P.pc.exit && deep) { S.done = true; sound('unlock'); }
    }
    if (S.hit) { S.hit.t += STEP; if (S.hit.t > 0.2) { S.hit = null; ball.v.set(0, 0, 0); startFall(); } }
  }
  const open = S.kind === 'knives' ? S.phase === 'cross' : S.done;
  for (const g of P.gates) if (g.kind === 'space') { const was = g.state; g.state = open ? 'open' : 'shut'; if (was === 'shut' && g.state === 'open') sound('door'); }
}
// As it was: nothing shown, nothing thrown (a fall, the pad by the road, a restart).
function czReset2(P, quiet) {
  const S = P.spz, moved = S.phase !== 'idle' || S.done;
  S.phase = 'idle'; S.t = 0; S.done = false;
  if (S.kind === 'shells') { S.round = 0; for (const C of S.cups) { C.want = 0; if (quiet) C.lift = 0; } for (let i = 0; i < S.cups.length; i++) S.cups[i].slot = i; czShellsPlace(P); }
  if (S.kind === 'knives') { S.hit = null; S.shown = 0; for (const K of S.knives) { K.t = -1; K.to = null; K.m.visible = false; } }
  return moved;
}
function czLanded2(P) { czReset2(P, true); }
function czAnimate2(P, dt) {
  const S = P.spz, e = (rate) => (REDUCED ? 1 : 1 - Math.exp(-rate * dt));
  if (S.kind === 'shells') {
    const u = S.phase === 'shuffle' ? ease(clamp(S.t / S.swapT, 0, 1)) : 0, moving = S.phase === 'shuffle' ? S.swaps[S.si] || [] : [];
    for (const C of S.cups) {
      C.lift += (C.want - C.lift) * e(9);
      let x = P.X(S.slots[C.slot][0]), z = S.z;
      for (const [a, b] of moving) {                       // round each other: one in front, one behind
        if (C.slot !== a && C.slot !== b) continue;
        const to = C.slot === a ? b : a, xa = P.X(S.slots[C.slot][0]), xb = P.X(S.slots[to][0]), mx = (xa + xb) / 2, rx = (xb - xa) / 2, ang = Math.PI * u;
        x = mx - rx * Math.cos(ang); z = S.z + (C.slot === a ? 1 : -1) * Math.min(0.55, Math.abs(rx) * 0.5) * Math.sin(ang);
      }
      C.grp.position.set(x, S.tableY + 1.1 * C.lift, z);
    }
    const P0 = S.cups[S.prize].grp.position, showStar = S.cups[S.prize].lift > 0.05 || S.phase === 'won';
    S.star.visible = showStar; S.star.position.set(P0.x, S.tableY + 0.012, P0.z); S.star.rotation.z += dt * 1.5;
    const lit = S.phase === 'pick';
    for (const pd of S.pads) { pd.flash = Math.max(0, pd.flash - dt * 2); pd.ringMat.opacity = lit ? (REDUCED ? 0.9 : 0.65 + 0.3 * Math.sin(simT * 7)) : 0.18 + 0.6 * pd.flash; }
  }
  if (S.kind === 'knives') {
    S.ropeK += ((S.phase === 'cross' || S.done ? 0 : 1) - S.ropeK) * e(6);      // the rope drops for the crossing
    S.rope.position.y = P.y + 0.75 * S.ropeK - 0.05; S.rope.visible = S.ropeK > 0.05;
    for (const m of S.posts) m.scale.y = Math.max(0.05, S.ropeK);
    S.ropeCol.pos.y = S.ropeK > 0.5 ? P.y + 0.6 : P.y - 50; S.ropeCol.prev.copy(S.ropeCol.pos);
    for (const K of S.knives) {
      if (!K.to || K.t < 0) continue;
      K.t += dt;
      const to = K.to.ball ? _czv.set(ball.p.x, P.y, ball.p.z) : _czv.set(P.X(K.to.c), P.y, P.Z(K.to.r)), f = 0.22;
      const u = Math.min(1, K.t / f);
      if (K.back > 0) {                                    // pulled back to his hand
        K.back = Math.min(1, K.back + dt / 0.35); const b = ease(K.back);
        K.m.position.lerpVectors(to, S.hand, b); K.m.position.y += Math.sin(Math.PI * b) * 0.8; K.m.rotation.set(0, 0, 0);
        K.m.visible = K.back < 1; if (K.back >= 1) { K.to = null; K.t = -1; }
        continue;
      }
      K.m.visible = true;
      K.m.position.lerpVectors(S.hand, to, u); K.m.position.y += Math.sin(Math.PI * u) * 1.2 * (1 - u * 0.3);
      K.m.rotation.set(u < 1 ? -Math.PI / 2 + u * 1.2 : 0.35, 0, u < 1 ? 0 : 0.2);
      if (u >= 1 && !K.stuck) { K.stuck = true; if (!K.to.ball) sound('thunk'); }
      if (u < 1) K.stuck = false;
    }
    for (const T of S.targets) {                           // the board glows red while a knife is in it
      const inIt = S.knives.some((K) => K.to && !K.to.ball && K.to === T && K.stuck && !(K.back > 0));
      T.k += ((inIt ? 1 : 0) - T.k) * e(inIt ? 14 : 5); T.glow.material.opacity = 0.75 * T.k;
    }
  }
}
function czState2(P, o) {
  const S = P.spz;
  if (S.kind === 'shells') Object.assign(o, { phase: S.phase, round: S.round, rounds: S.rounds, prizeSlot: S.cups[S.prize].slot, slots: S.slots, pads: S.pads.map((q) => [q.c, q.r]) });
  if (S.kind === 'knives') Object.assign(o, { phase: S.phase, targets: S.targets.map((t) => [t.c, t.r]) });
  return o;
}
for (const k of ['shells', 'knives']) { CZ_KINDS.add(k); CZ_PARTS[k] = { build: czBuild2, pad: czPad2, step: czStep2, reset: czReset2, landed: czLanded2, animate: czAnimate2, state: czState2 }; }
