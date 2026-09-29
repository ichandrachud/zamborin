
// ---- THE TIN TOY CIRCUS, FILLED ----
// Owner, 2026-09-29, choosing the tin toy look: "the audience should not exist. Rather this should be filled completely
// with the world of circus objects and characters. Large cutouts. Motorcycle cages, painted animal cages, lights,
// marquees etc." The play camera never sees above its own height, so everything that matters stands on the floor round
// the rail and under it, packed close: giant tin cut-outs of the performers, globes with motorcycles looping inside, cage
// wagons with animals pacing, marquee boards in bulbs, sideshow tents, light towers, a tin train round every ring.

// The marquee boards: eight in a 1024 atlas, two across and four down, each 512 x 256, an arched board with its words.
const CQ_SIGNS = [['CIRCUS', '#E8303A', '#F2C230'], ['BIG TOP', '#2A4AE8', '#FFF1D2'], ['WONDERS', '#2AA89A', '#F2C230'], ['DAREDEVILS', '#231A2E', '#F2C230'],
                  ['WILD BEASTS', '#C8202C', '#FFF1D2'], ['THIS WAY', '#F2C230', '#C8202C'], ['PARADE', '#6A2A9A', '#F2C230'], ['TICKETS', '#E8303A', '#FFF1D2']];
const cqArch = (t) => [(1 - t) * (1 - t) * 24 + 2 * (1 - t) * t * 256 + t * t * 488, (1 - t) * (1 - t) * 84 - 2 * (1 - t) * t * 68 + t * t * 84];
let cqSignMemo = null;
function cqSigns() {
  return cqSignMemo || (cqSignMemo = canvasTex(1024, 1024, (g) => {
    CQ_SIGNS.forEach(([word, bg, fg], i) => {
      g.save(); g.translate((i % 2) * 512, Math.floor(i / 2) * 256);
      const shape = () => { g.beginPath(); g.moveTo(24, 84); g.quadraticCurveTo(256, -68, 488, 84); g.lineTo(488, 240); g.lineTo(24, 240); g.closePath(); };
      tl(g, shape, bg, { lw: 9, box: [24, 8, 488, 240], pat: () => {
        g.fillStyle = 'rgba(255,255,255,0.13)'; for (let k = 0; k < 18; k++) { const a = Math.PI + k * Math.PI / 18; g.beginPath(); g.moveTo(256, 250); g.arc(256, 250, 420, a, a + Math.PI / 36); g.closePath(); g.fill(); }
      } });
      g.save(); g.translate(256, 150); g.scale(0.9, 0.8); g.translate(-256, -150); shape(); g.restore(); g.strokeStyle = fg; g.lineWidth = 6; g.stroke();
      const size = Math.min(92, 520 / Math.max(4, word.length));
      pbWord(g, word, 262, 158, size, INK, null); pbWord(g, word, 256, 152, size, fg, INK, 0.16);
      if (word === 'THIS WAY') { tl(g, tlPoly(g, 150, 214, 330, 214, 330, 200, 372, 222, 330, 244, 330, 230, 150, 230), '#FFF1D2', { lw: 4 }); }
      else for (const x of [66, 446]) tlStar(g, x, 190, 18, fg);
      g.restore();
    });
  }));
}
// The cage wagons' boards: four in a 1024 atlas, each 1024 x 256: the name between gilded scrolls.
const CQ_WAGONS = [['LIONS', 9, 0xC8202C], ['TIGERS', 15, 0x2A4AE8], ['BEARS', 13, 0x2AA89A], ['MONKEYS', 14, 0x6A2A9A]];
let cqWagMemo = null;
function cqWagonBoards() {
  return cqWagMemo || (cqWagMemo = canvasTex(1024, 1024, (g) => {
    CQ_WAGONS.forEach(([word, , col], i) => {
      g.save(); g.translate(0, i * 256);
      const hex = '#' + col.toString(16).padStart(6, '0');
      tl(g, tlRR(g, 10, 30, 1004, 196, 30), hex, { lw: 8, box: [10, 30, 1014, 226], pat: tlDots(g, [10, 30, 1014, 226], 'rgba(255,255,255,0.1)', 6, 22) });
      g.strokeStyle = '#F2C230'; g.lineWidth = 8; g.beginPath(); g.roundRect(34, 50, 956, 156, 20); g.stroke();
      for (const s of [-1, 1]) {                                          // gilded scrolls at each end
        const cx = 512 + s * 400;
        for (const [r, w] of [[46, 14], [30, 10], [16, 8]]) { g.strokeStyle = INK; g.lineWidth = w + 6; g.beginPath(); g.arc(cx, 128, r, 0, Math.PI * 1.6); g.stroke(); g.strokeStyle = '#F2C230'; g.lineWidth = w; g.stroke(); }
      }
      pbWord(g, word, 518, 136, 118, INK, null, 0, 900, 8); pbWord(g, word, 512, 130, 118, '#FFF1D2', INK, 0.12, 900, 8);
      g.restore();
    });
  }));
}
// A wagon wheel: a gold rim, spokes in red and yellow, a hub.
let cqWheelMemo = null;
const cqWheelTex = () => cqWheelMemo || (cqWheelMemo = canvasTex(256, 256, (g) => {
  g.fillStyle = '#231A2E'; pbCircle(g, 128, 128, 128); g.fill();
  g.fillStyle = '#F2C230'; pbCircle(g, 128, 128, 120); g.fill();
  for (let k = 0; k < 14; k++) { const a = k * TAU / 14; g.fillStyle = k % 2 ? '#E8303A' : '#F2C230'; g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 100, a, a + TAU / 14); g.closePath(); g.fill(); }
  g.strokeStyle = INK; g.lineWidth = 5; pbCircle(g, 128, 128, 100); g.stroke(); pbCircle(g, 128, 128, 120); g.stroke();
  tl(g, tlEll(g, 128, 128, 26, 26), '#FFF1D2', { lw: 5 }); tl(g, tlEll(g, 128, 128, 10, 10), '#E8303A', { lw: 3 });
}));
// The steel mesh of a globe, a fine grid on clear.
let cqGridMemo = null;
const cqGridTex = () => cqGridMemo || (cqGridMemo = canvasTex(512, 256, (g) => {
  g.clearRect(0, 0, 512, 256); g.strokeStyle = 'rgba(220,226,240,1)'; g.lineWidth = 2.5;
  for (let x = 0; x <= 512; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  for (let y = 0; y <= 256; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
}, true));
function cqTinKit(K) {
  if (K.signs) return K;
  const keep = (m) => { m.userData.keep = true; return m; };
  K.signs = keep(new MeshStandardMaterial({ map: cqSigns(), alphaTest: 0.4, side: DoubleSide, roughness: 0.35, metalness: 0.3, envMap: K.env, envMapIntensity: 0.6, emissive: 0xFFFFFF, emissiveMap: cqSigns(), emissiveIntensity: 0.28 }));
  K.boards = keep(new MeshStandardMaterial({ map: cqWagonBoards(), roughness: 0.35, metalness: 0.3, envMap: K.env, envMapIntensity: 0.6, emissive: 0xFFFFFF, emissiveMap: cqWagonBoards(), emissiveIntensity: 0.2 }));
  K.wheel = keep(new MeshStandardMaterial({ map: cqWheelTex(), roughness: 0.35, metalness: 0.4, envMap: K.env, envMapIntensity: 0.7 }));
  K.grid = keep(new MeshStandardMaterial({ map: cqGridTex(), alphaTest: 0.3, side: DoubleSide, roughness: 0.2, metalness: 1, envMap: K.env, envMapIntensity: 1.3, color: 0xDDE2F0 }));
  K.figsBack = keep(new MeshStandardMaterial({ map: K.figs.map, alphaTest: 0.35, side: DoubleSide, color: 0x6A5A48, roughness: 0.3, metalness: 0.8, envMap: K.env, envMapIntensity: 0.9 }));
  K.glowWhite = keep(new MeshBasicMaterial({ map: pbGlow(), color: 0xFFF4D8, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  return K;
}
// A cell of the figures' atlas as a plane h tall, standing on its lower edge.
function cqCellGeo(cell, h) {
  const geo = new PlaneGeometry(h, h), uv = geo.attributes.uv, u0 = (cell % 4) / 4, v1 = 1 - Math.floor(cell / 4) / CQ_ROWS;
  for (let i = 0; i < 4; i++) uv.setXY(i, u0 + uv.getX(i) / 4, v1 - (1 - uv.getY(i)) / CQ_ROWS);
  geo.translate(0, h / 2, 0); return geo;
}
// The wind-up key, one shape for all: a shaft and two loops, turning.
let cqKeyGeoMemo = null;
function cqKeyGeo(C) {
  if (cqKeyGeoMemo) return cqKeyGeoMemo;
  const B = pbBuild();
  B.geo(new CylinderGeometry(0.12, 0.12, 1.3, 6, 1, true), placeAt(0, 0, -0.65, Math.PI / 2, 0, 0), C.brass);
  for (const s of [-1, 1]) B.geo(new TorusGeometry(0.42, 0.13, 5, 12), placeAt(s * 0.5, 0, -1.35, 0, Math.PI / 2, 0), C.brass);
  B.geo(new IcosahedronGeometry(0.2, 0), placeAt(0, 0, -1.35), C.brass);
  return (cqKeyGeoMemo = B.done());
}
// A GIANT CUT-OUT: a performer printed on a sheet of tin h tall, its edge showing, on a printed plinth, a key in its back
// turning, rocking a little on its feet the way a wind-up toy does.
function cqCut(Z, cell, x, z, h, yaw = 0, key = true) {
  const { G, K, C, paint, FL, tick, live } = Z, ph = Math.max(0.5, h * 0.07), pw = h * 0.5;
  paint.geo(new BoxGeometry(pw, ph, Math.max(0.8, h * 0.1)), placeAt(x, FL + ph / 2, z, 0, yaw, 0), [0xE8303A, 0x2A4AE8, 0x2AA89A, 0xF2C230][cell % 4]);
  paint.geo(new BoxGeometry(pw + 0.1, ph * 0.25, Math.max(0.8, h * 0.1) + 0.1), placeAt(x, FL + ph * 0.8, z, 0, yaw, 0), 0xF2C230);
  return Z.cuts.add({ cell, x, y: FL + ph, z, h, yaw, key, ph0: x * 0.37 + z * 0.11 });
}
// A GLOBE with motorcycles looping inside: a frame of steel hoops, a fine mesh, on a striped drum; two or three riders
// on great circles through it, headlamps lit.
function cqGlobe(Z, x, z, R, standH) {
  const { G, K, C, paint, metal, lit, tick, live, FL, r } = Z, cy = FL + standH + R;
  for (let k = 0; k < 4; k++) paint.geo(new CylinderGeometry(R * 0.52, R * 0.6, standH / 4, 28), placeAt(x, FL + standH * (k + 0.5) / 4, z), k % 2 ? 0xFFF1D2 : 0xE8303A);
  metal.geo(new TorusGeometry(R * 0.55, 0.12, 6, 36), placeAt(x, FL + standH, z, Math.PI / 2, 0, 0), C.brass);
  for (let k = 0; k < 6; k++) metal.geo(new TorusGeometry(R, 0.08, 3, 32), placeAt(x, cy, z, 0, k * Math.PI / 6, 0), 0xD8DCE8);
  for (const f of [-0.75, -0.4, 0, 0.4, 0.75]) metal.geo(new TorusGeometry(R * Math.sqrt(1 - f * f), 0.08, 3, 32), placeAt(x, cy + R * f, z, Math.PI / 2, 0, 0), 0xD8DCE8);
  metal.geo(new SphereGeometry(0.35, 10, 8), placeAt(x, cy + R, z), C.brass);
  Z.merge.grid.geo(new SphereGeometry(R, 32, 18), placeAt(x, cy, z), 0xFFFFFF); K.grid.map.repeat.set(3, 3);
  const n = 2 + (r() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const nrm = new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), a = new Vector3(0, 1, 0).cross(nrm).normalize(), b = nrm.clone().cross(a);
    Z.bikes.push({ x, cy, z, R, a, b, p0: r() * TAU, w: (1.6 + r() * 0.7) * (r() < 0.5 ? 1 : -1), col: i % 3 });
  }
}
// A CAGE WAGON: a painted body on four sunburst wheels, gilt posts, brass bars down its front, its name on a board over
// them, and inside an animal pacing up and down. sc scales the whole wagon.
function cqWagon(Z, x, z, kind, bulbs, sc = 1) {
  const { G, K, C, paint, metal, wheels, tick, live, FL } = Z, [, cell, col] = CQ_WAGONS[kind];
  const P = (dx, dy, dz, rx = 0, ry = 0, rz = 0) => placeAt(x + dx * sc, FL + dy * sc, z + dz * sc, rx, ry, rz, sc, sc, sc);
  const L = 7.4, D = 3.2, y0 = 1.5, H = 3.8, top = y0 + H;
  paint.geo(new BoxGeometry(L, 0.5, D), P(0, y0 - 0.1, 0), col);                                     // the chassis
  paint.geo(new BoxGeometry(L + 0.2, 0.14, D + 0.2), P(0, y0 + 0.16, 0), 0xF2C230);
  paint.geo(new BoxGeometry(L - 0.4, 0.1, D - 0.4), P(0, y0 + 0.25, 0), 0xE8C070);                   // straw
  paint.geo(new BoxGeometry(L, H, 0.2), P(0, y0 + H / 2, -D / 2 + 0.1), 0x3A2448);                   // the back, dark inside
  for (const e of [-1, 1]) paint.geo(new BoxGeometry(0.4, H, D), P(e * (L / 2 - 0.2), y0 + H / 2, 0), col);   // the ends
  paint.geo(new BoxGeometry(L + 0.5, 0.4, D + 0.5), P(0, top + 0.2, 0), col);                        // the roof, its gilt cornice
  paint.geo(new BoxGeometry(L + 0.8, 0.18, D + 0.8), P(0, top + 0.45, 0), 0xF2C230);
  paint.geo(new BoxGeometry(L - 1.4, 0.7, D - 0.6), P(0, top + 0.85, 0), col);
  for (const e of [-1, 1]) for (const d of [-1, 1]) metal.geo(new CylinderGeometry(0.16, 0.16, H, 10), P(e * (L / 2 - 0.1), y0 + H / 2, d * (D / 2 + 0.05)), C.brass);   // gilt posts
  for (let bx = -L / 2 + 0.7; bx <= L / 2 - 0.6; bx += 0.42) metal.geo(new CylinderGeometry(0.05, 0.05, H - 1.3, 6), P(bx, y0 + (H - 1.3) / 2 + 0.2, D / 2), C.brass);   // bars
  metal.geo(new BoxGeometry(L - 0.4, 0.1, 0.1), P(0, y0 + 0.35, D / 2), C.brass);
  const bg = new PlaneGeometry((L - 0.5) * sc, 1.2 * sc), uv = bg.attributes.uv;
  for (let q = 0; q < 4; q++) uv.setXY(q, uv.getX(q), 1 - kind * 0.25 - (1 - uv.getY(q)) * 0.25);
  Z.merge.boards.geo(bg, placeAt(x, FL + (top - 0.65) * sc, z + (D / 2 + 0.06) * sc), 0xFFFFFF);
  for (const e of [-1, 1]) for (const d of [-1, 1]) wheels.geo(new CylinderGeometry(1.2, 1.2, 0.24, 28), P(e * (L / 2 - 1.5), 1.2, d * (D / 2 + 0.2), Math.PI / 2, 0, 0), 0xFFFFFF);
  for (let k = 0; k < 12; k++) bulbs.push([x + (-L / 2 + 0.3 + k * (L - 0.6) / 11) * sc, FL + (top + 0.62) * sc, z + (D / 2 + 0.45) * sc, 900 + Math.round(x + z), k]);
  const p0 = x + z, amp = (L / 2 - 2) * sc;                                                           // the animal, pacing
  Z.cuts.add({ cell, x, y: FL + (y0 + 0.2) * sc, z: z - 0.2 * sc, h: 3.3 * sc, yaw: 0, key: false, ph0: 0,
               anim: live ? (t, e) => { e.x = x + Math.sin(t * 0.45 + p0) * amp; e.flip = Math.cos(t * 0.45 + p0) >= 0 ? 1 : -1; } : null });
}
// A MARQUEE BOARD on two striped posts, bulbs all round its edge.
function cqSign(Z, i, x, z, w, postH, bulbs) {
  const { G, K, paint, FL } = Z, hg = w / 2, base = FL + postH;
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) paint.geo(new CylinderGeometry(0.2, 0.2, (postH + hg * 0.5) / 6, 10), placeAt(x + s * w * 0.36, FL + (k + 0.5) * (postH + hg * 0.5) / 6, z - 0.25), k % 2 ? 0xFFF1D2 : 0xE8303A);
  paint.geo(new BoxGeometry(w * 0.92, hg * 0.62, 0.24), placeAt(x, base + hg * 0.33, z - 0.16), 0x231A2E);
  const bg = new PlaneGeometry(w, hg), uv = bg.attributes.uv;
  for (let q = 0; q < 4; q++) uv.setXY(q, (i % 2) * 0.5 + uv.getX(q) * 0.5, 1 - Math.floor(i / 2) * 0.25 - (1 - uv.getY(q)) * 0.25);
  Z.merge.signs.geo(bg, placeAt(x, base + hg / 2, z), 0xFFFFFF);
  const at = (X, Y) => [x + (X / 512 - 0.5) * w, base + (1 - Y / 256) * hg, z + 0.14], id = 1000 + Math.round(x * 3 + z);
  const n = Math.max(10, Math.round(w * 1.6));
  for (let k = 0; k <= n; k++) bulbs.push([...at(...cqArch(k / n)), id, k]);
  for (let k = 1; k < 5; k++) { bulbs.push([...at(24, 84 + k * 31), id, n + k]); bulbs.push([...at(488, 84 + k * 31), id, n + 10 - k]); }
  for (let k = 0; k <= n * 0.6; k++) bulbs.push([...at(24 + k * 464 / (n * 0.6), 240), id, n + 10 + k]);
}
// A MARQUEE STAR or ARROW (owner: "might want to add some marquee lights here and there"): a painted tin plate on a
// striped pole, bulbs all round its edge chasing each other; the arrow points on, up the screen.
function cqMarquee(Z, x, z, u, arrow, bulbs) {
  const { paint, FL } = Z, poleH = 6 * u, R = 2.2 * u, cy = FL + poleH + R, id = 1400 + Math.round(x * 3 + z), d = 0.09;
  for (let k = 0; k < 6; k++) paint.geo(new CylinderGeometry(0.16 * u, 0.16 * u, (poleH + R * 0.4) / 6, 8), placeAt(x, FL + (k + 0.5) * (poleH + R * 0.4) / 6, z - 0.2), k % 2 ? 0xFFF1D2 : 0x2A4AE8);
  const out = arrow ? [[0, 1.1], [0.85, 0.15], [0.36, 0.15], [0.36, -1.0], [-0.36, -1.0], [-0.36, 0.15], [-0.85, 0.15]]
                    : Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 0.45 : 1; return [Math.cos(a) * rr, -Math.sin(a) * rr]; });
  const P = out.map(([a, b]) => [x + a * R, cy + b * R]), face = arrow ? 0xE8303A : 0xF2C230, rim = arrow ? 0xF2C230 : 0xE8303A;
  for (let i = 0; i < P.length; i++) {
    const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
    paint.tri([x, cy, z + d], [ax, ay, z + d], [bx, by, z + d], [0, 0, 1], [0, 0, 1], [0, 0, 1], face);
    paint.tri([x, cy, z - d], [bx, by, z - d], [ax, ay, z - d], [0, 0, -1], [0, 0, -1], [0, 0, -1], face);
    let nx = by - ay, ny = -(bx - ax); const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L; if (nx * ((ax + bx) / 2 - x) + ny * ((ay + by) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
    const n = [nx, ny, 0];
    paint.tri([ax, ay, z - d], [bx, by, z - d], [bx, by, z + d], n, n, n, rim); paint.tri([ax, ay, z - d], [bx, by, z + d], [ax, ay, z + d], n, n, n, rim);
    const steps = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / (0.5 * u)));
    for (let k = 0; k < steps; k++) { const f = k / steps; bulbs.push([ax + (bx - ax) * f, ay + (by - ay) * f, z + d + 0.12, id, i * 20 + k]); }
  }
}
// A SIDESHOW TENT: a striped round wall and roof, a scalloped valance with bulbs, a flag, a painted banner at its door.
function cqTent(Z, x, z, rad, h, poster, bulbs) {
  const { G, K, C, paint, metal, FL } = Z, eave = FL + h * 0.5;
  Z.merge.canvas.geo(new CylinderGeometry(rad, rad, h * 0.5, 32, 1, true), placeAt(x, FL + h * 0.25, z), 0xFFFFFF);
  Z.merge.canvas.geo(new ConeGeometry(rad * 1.12, h * 0.5, 32, 1, true), placeAt(x, eave + h * 0.25, z), 0xFFFFFF);
  for (let k = 0; k < 20; k++) { const a = k * TAU / 20; paint.geo(new SphereGeometry(rad * 0.18, 10, 6, 0, TAU, Math.PI / 2, Math.PI / 2), placeAt(x + Math.cos(a) * rad * 1.1, eave + 0.05, z + Math.sin(a) * rad * 1.1), k % 2 ? 0xF2C230 : 0xE8303A); }
  for (let k = 0; k < 30; k++) { const a = k * TAU / 30; bulbs.push([x + Math.cos(a) * rad * 1.13, eave - rad * 0.18, z + Math.sin(a) * rad * 1.13, 1200 + Math.round(x + z), k]); }
  metal.geo(new CylinderGeometry(0.08, 0.08, 1.6, 6), placeAt(x, eave + h * 0.5 + 0.6, z), C.brass);
  paint.geo(new ConeGeometry(0.45, 1.2, 3), placeAt(x + 0.6, eave + h * 0.5 + 1.1, z, 0, 0, -Math.PI / 2), 0xE8303A);
  paint.geo(new BoxGeometry(rad * 0.7, h * 0.4, 0.3), placeAt(x, FL + h * 0.2, z + rad - 0.1), 0x231A2E);   // the door
  const bg = new PlaneGeometry(rad * 0.9, rad * 0.9), uv = bg.attributes.uv;
  for (let q = 0; q < 4; q++) uv.setXY(q, (poster % 2) * 0.5 + uv.getX(q) * 0.5, 1 - Math.floor(poster / 2) * 0.5 - (1 - uv.getY(q)) * 0.5);
  Z.merge.posters.geo(bg, placeAt(x + rad * 0.62, FL + h * 0.28, z + rad * 0.82, 0, 0.6, 0), 0xFFFFFF);
}
// A LIGHT TOWER: a lattice mast, a bank of big bulbs at the top facing the course.
function cqTower(Z, x, z, H, face, bulbs) {
  const { metal, paint, FL } = Z;
  for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) metal.geo(new CylinderGeometry(0.07, 0.07, H, 5), placeAt(x + dx, FL + H / 2, z + dz), 0xE8303A);
  for (let y = 1; y < H; y += 1.4) for (const [a, dx, dz] of [[0, 0, -0.5], [0, 0, 0.5], [Math.PI / 2, -0.5, 0], [Math.PI / 2, 0.5, 0]]) metal.geo(new CylinderGeometry(0.04, 0.04, 1.5, 4), placeAt(x + dx, FL + y + 0.6, z + dz, 0, a, 0.75), 0xF2C230);
  paint.geo(new BoxGeometry(3.4, 2.4, 0.4), placeAt(x, FL + H + 1, z, 0, face, 0), 0x231A2E);
  paint.geo(new BoxGeometry(3.6, 0.2, 0.6), placeAt(x, FL + H + 2.3, z, 0, face, 0), 0xF2C230);
  const c = Math.cos(face), s = Math.sin(face);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const lx = -1.2 + i * 0.8; bulbs.push([x + lx * c + 0.3 * s, FL + H + 0.3 + j * 0.7, z - lx * s + 0.3 * c, -2, i + j]); }
}
// Props to fill between: stacked drums and a ball; giant juggling pins; stacked trunks; a star on a stick.
function cqProp(Z, x, z, kind) {
  const { paint, metal, C, FL, r } = Z;
  if (kind === 0) {
    let y = FL; for (const [rad, hh, col] of [[1.5, 1.2, 0xE8303A], [1.1, 1.0, 0x2A4AE8], [0.8, 0.8, 0xF2C230]]) { paint.geo(new CylinderGeometry(rad, rad, hh, 24), placeAt(x, y + hh / 2, z), col); metal.geo(new TorusGeometry(rad, 0.08, 6, 28), placeAt(x, y + hh, z, Math.PI / 2, 0, 0), C.brass); y += hh; }
    for (let k = 0; k < 6; k++) paint.geo(new SphereGeometry(0.9, 16, 10, k * TAU / 6, TAU / 6), placeAt(x, y + 0.9, z), [0xE8303A, 0xFFF1D2, 0x2A6AE8, 0xF2C230, 0x2AA86A, 0xFFF1D2][k]);
  } else if (kind === 1) {
    for (let k = 0; k < 3; k++) { const px = x + (k - 1) * 1.2, h = 2.6 + (k % 2) * 0.6, lean = (k - 1) * 0.12;
      paint.geo(new CylinderGeometry(0.22, 0.55, h * 0.6, 14), placeAt(px, FL + h * 0.3, z, 0, 0, lean), 0xFFF1D2);
      paint.geo(new SphereGeometry(0.58, 14, 10), placeAt(px - lean * h * 0.55, FL + h * 0.62, z), 0xFFF1D2);
      paint.geo(new CylinderGeometry(0.18, 0.2, h * 0.36, 10), placeAt(px - lean * h * 0.8, FL + h * 0.85, z, 0, 0, lean), 0xE8303A);
      paint.geo(new CylinderGeometry(0.6, 0.6, 0.2, 14), placeAt(px - lean * h * 0.4, FL + h * 0.45, z), 0x2A4AE8); }
  } else if (kind === 2) {
    for (let k = 0; k < 3; k++) { const col = [0x6A2A9A, 0xE8303A, 0x2AA89A][k], w = 2.4 - k * 0.4, px = x + (r() - 0.5) * 0.4, py = FL + 0.6 + k * 1.1;
      paint.geo(new BoxGeometry(w, 1.1, 1.3), placeAt(px, py, z, 0, (r() - 0.5) * 0.4, 0), col); metal.geo(new BoxGeometry(w + 0.06, 0.12, 1.36), placeAt(px, py + 0.3, z), C.brass); }
  } else {
    metal.geo(new CylinderGeometry(0.1, 0.1, 6, 6), placeAt(x, FL + 3, z), C.brass);
    for (let k = 0; k < 5; k++) paint.geo(new ConeGeometry(0.5, 1.6, 4), placeAt(x + Math.cos(-Math.PI / 2 + k * TAU / 5) * 0.8, FL + 6.6 - Math.sin(-Math.PI / 2 + k * TAU / 5) * 0.8, z, 0, 0, -Math.PI / 2 + k * TAU / 5 - Math.PI / 2), 0xF2C230);
    paint.geo(new SphereGeometry(0.7, 12, 8), placeAt(x, FL + 6.6, z), 0xF2C230);
  }
}
// A WHEEL OF DEATH: an A-frame, and on its axle an arm turning end over end with a hoop at each end, a tumbler in one.
function cqWheelOfDeath(Z, x, z, bulbs) {
  const { G, K, C, paint, metal, tick, live, FL, fig } = Z, ay = FL + 7.5, arm = 5.6;
  for (const s of [-1, 1]) for (const d of [-1, 1]) metal.geo(new CylinderGeometry(0.16, 0.2, 8.2, 8), placeAt(x + s * 2.2, FL + 3.8, z + d * 0.9, 0, 0, s * 0.3), 0xE8303A);
  paint.geo(new CylinderGeometry(3.4, 3.6, 0.5, 28), placeAt(x, FL + 0.25, z), 0x2A4AE8);
  const rot = new Group(); rot.position.set(x, ay, z); G.add(rot);
  const B = pbBuild();
  B.geo(new BoxGeometry(arm * 2, 0.5, 0.5), placeAt(0, 0, 0), 0xF2C230);
  for (const s of [-1, 1]) { B.geo(new TorusGeometry(1.5, 0.14, 8, 32), placeAt(s * arm, 0, 0), 0xE8303A); B.geo(new TorusGeometry(1.5, 0.14, 8, 32), placeAt(s * arm, 0, 0.8), 0xE8303A);
    for (let k = 0; k < 8; k++) { const a = k * TAU / 8; B.geo(new CylinderGeometry(0.05, 0.05, 0.8, 4), placeAt(s * arm + Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0.4, Math.PI / 2, 0, 0), 0xF2C230); } }
  B.geo(new CylinderGeometry(0.45, 0.45, 1.2, 16), placeAt(0, 0, 0.3, Math.PI / 2, 0, 0), C.brass);
  rot.add(new Mesh(B.done(), K.metal));
  const t1 = new Mesh(cqCellGeo(5, 2.6), K.figs); t1.position.set(arm, -1.3, 0.4); rot.add(t1);
  if (live) tick.push((dt, t) => { rot.rotation.z = t * 0.7; t1.rotation.z = -t * 0.7 + Math.sin(t * 3) * 0.5; });
  for (let k = 0; k < 16; k++) { const a = k * TAU / 16; bulbs.push([x + Math.cos(a) * 3.5, FL + 0.6, z + Math.sin(a) * 3.5, 1300 + Math.round(x + z), k]); }
}
// A TIN TRAIN on an oval of track round a ring, under the course: an engine puffing, a cage car, a flatcar of balls, a coach.
function cqTrain(Z, cx, zc, ax, az) {
  const { G, K, C, paint, metal, tick, live, FL } = Z, y = FL + 0.12, N = 180;
  const pt = (a) => [cx + ax * Math.cos(a), zc + az * Math.sin(a)];
  for (let k = 0; k < N; k++) {
    const a0 = k * TAU / N, a1 = (k + 1) * TAU / N, [x0, z0] = pt(a0), [x1, z1] = pt(a1), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
    const nx = Math.cos(yaw), nz = -Math.sin(yaw);
    for (const s of [-0.55, 0.55]) metal.geo(new BoxGeometry(0.12, 0.16, len + 0.04), placeAt(mx + nx * s, y + 0.12, mz + nz * s, 0, yaw, 0), 0xC8CCD8);
    if (k % 2 === 0) paint.geo(new BoxGeometry(1.7, 0.1, 0.3), placeAt(mx, y, mz, 0, yaw, 0), 0x8A4A2A);
  }
  const R = (ax + az) / 2, gap = 4.1 / R, w = -3.6 / R, p0 = zc * 0.1;
  const car = (t, k) => { const a = p0 + w * t + k * gap, [px, pz] = pt(a); return [px, pz, Math.atan2(ax * Math.sin(a), -az * Math.cos(a))]; };
  Z.trains.push({ y, car });
  Z.cuts.add({ cell: 9, x: 0, y: 0, z: 0, h: 1.6, yaw: 0, key: false, ph0: 0,                           // a lion riding in the cage car
               anim: (t, e) => { const [px, pz, yaw] = car(live ? t : 0, 1); e.x = px + Math.cos(yaw) * 0.5; e.z = pz - Math.sin(yaw) * 0.5; e.y = y + 1; e.yaw = yaw + Math.PI / 2; } });
  Z.smoke.push({ at: (t) => { const [px, pz, yaw] = car(live ? t : 0, 0); return [px + Math.sin(yaw) * 1.2, y + 3.4, pz + Math.cos(yaw) * 1.2]; } });
}
// A FERRIS WHEEL in tin: two rims, spokes, twelve cars swinging level, bulbs round the rim; it faces the course.
function cqFerris(Z, fx, fz, FR, bulbPts) {
  const { G, K, metal, tick, live, FL } = Z, cyy = FL + FR + 2.5;
  const wheel = new Group(); wheel.position.set(fx, cyy, fz); G.add(wheel);
  const WB = pbBuild();
  for (const dz of [-1, 1]) { WB.geo(new TorusGeometry(FR, 0.22, 8, 72), placeAt(0, 0, dz), 0xE8303A); WB.geo(new TorusGeometry(FR * 0.55, 0.16, 8, 48), placeAt(0, 0, dz), 0xF2C230); }
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; for (const dz of [-1, 1]) WB.geo(new CylinderGeometry(0.09, 0.09, FR, 4), placeAt(Math.cos(a) * FR / 2, Math.sin(a) * FR / 2, dz, 0, 0, a + Math.PI / 2), 0xFFF1D2); }
  WB.geo(new CylinderGeometry(0.6, 0.6, 2.6, 16), placeAt(0, 0, 0, Math.PI / 2, 0, 0), 0xF2C230);
  wheel.add(new Mesh(WB.done(), K.metal));
  for (const s of [-1, 1]) for (const d of [-1, 1]) metal.geo(new CylinderGeometry(0.3, 0.4, FR + 3.4, 8), placeAt(fx + s * (FR * 0.3), FL + (FR + 2.5) / 2, fz + d * 1.4, 0, 0, s * 0.3), 0x2A4AE8);
  const wp = [], wc = [];
  for (let k = 0; k < 72; k++) { const a = k / 72 * TAU; wp.push(Math.cos(a) * FR, Math.sin(a) * FR, 1.25); const c = new Color([0xFFF4D8, 0xFF7A6A, 0x7AD8FF, 0xFFE070][k % 4]); wc.push(c.r, c.g, c.b); }
  const wg = new BufferGeometry(); wg.setAttribute('position', new Float32BufferAttribute(wp, 3)); wg.setAttribute('color', new Float32BufferAttribute(wc, 3));
  const pts = new Points(wg, new PointsMaterial({ size: 1.5, map: pbGlow(), vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  pts.frustumCulled = false; wheel.add(pts);
  Z.ferris.push({ x: fx, cy: cyy, z: fz, R: FR });
  if (live) tick.push((dt, t) => { wheel.rotation.z = t * 0.14; });
}
// A HELTER-SKELTER: a striped tower, the slide winding down round it, a pointed roof, a flag.
function cqHelter(Z, hx, hz, H) {
  const { paint, FL } = Z, n = Math.round(H / 2);
  for (let k = 0; k < n; k++) paint.geo(new CylinderGeometry(2.8, 3, 2, 24), placeAt(hx, FL + 1 + k * 2, hz), k % 2 ? 0xFFF1D2 : 0xE8303A);
  paint.geo(new ConeGeometry(3.8, 4.2, 24), placeAt(hx, FL + n * 2 + 2.1, hz), 0x2A4AE8);
  paint.geo(new ConeGeometry(0.6, 1.6, 3), placeAt(hx + 0.7, FL + n * 2 + 4.8, hz, 0, 0, -Math.PI / 2), 0xF2C230);
  for (let k = 0; k < 110; k++) { const f = k / 110, a = f * Math.PI * 7; paint.geo(new BoxGeometry(1.7, 0.2, 1.1), placeAt(hx + Math.cos(a) * 3.9, FL + n * 2 - 1 - f * (n * 2 - 2), hz + Math.sin(a) * 3.9, 0, -a, -0.3), k % 2 ? 0xF2C230 : 0xE8962A); }
}
// A CANNON on a painted carriage, aimed up at the tent: now and then a bang of smoke and confetti.
function cqTinCannon(Z, x, z, aim) {
  const { G, K, C, paint, metal, tick, live, FL } = Z, el = 0.7, L = 6;
  paint.geo(new BoxGeometry(3.6, 1.4, 5.4), placeAt(x, FL + 1.6, z, 0, aim, 0), 0x2A4AE8);
  paint.geo(new BoxGeometry(3.8, 0.2, 5.6), placeAt(x, FL + 2.35, z, 0, aim, 0), 0xF2C230);
  const c = Math.cos(aim), s = Math.sin(aim);
  for (const [dx, dz] of [[-1.9, -1.6], [1.9, -1.6], [-1.9, 1.6], [1.9, 1.6]]) Z.wheels.geo(new CylinderGeometry(0.9, 0.9, 0.2, 24), placeAt(x + dx * c + dz * s, FL + 0.9, z - dx * s + dz * c, 0, aim, Math.PI / 2), 0xFFFFFF);
  const B = pbBuild(); B.geo(new CylinderGeometry(0.85, 1.15, L, 28), placeAt(0, L / 2, 0), C.brass);
  for (const f of [0.1, 0.5, 0.93]) B.geo(new TorusGeometry(0.95 + 0.25 * (1 - f), 0.13, 8, 28), placeAt(0, L * f, 0, Math.PI / 2, 0, 0), 0xE8303A);
  const tube = new Mesh(B.done(), K.metal); tube.position.set(x, FL + 2.6, z); G.add(tube);
  tube.rotation.set(-(Math.PI / 2 - el), aim, 0, 'YXZ');
  const mouth = new Vector3(0, L, 0).applyEuler(tube.rotation).add(tube.position);
  const p0 = (x + z) % 5;
  Z.smoke.push({ at: (t) => [mouth.x, mouth.y, mouth.z, Math.max(0, 1 - ((t + p0) % 6) / 2)], rate: 1.6, rise: 2.5, op: 0.8 });
  if (!live) return;
  const confetti = cqConfetti(G);
  tick.push((dt, t) => { const u = (t + p0) % 6; if (u < dt * 1.5) confetti.burst(mouth, 140); confetti.step(dt); });
}

// THE FILL: along both edges of the course, then further out, then under it between the rings.
// Where nothing tall may stand: beside a loop (the camera swings out there), round a wind tower, beside a tube.
function cqKeepZones(pieces) {
  const keep = [];
  for (const p of pieces) {
    if (p.x === undefined) continue;
    const hd = (p.d || 6) / 2;
    if (p.t === 'wind') { const tx = p.x - p.dir * (p.w / 2 + TOWER_OFF + TOWER_W / 2); keep.push([tx - 4.5, tx + 4.5, p.z - hd - 3, p.z + hd + 3]); }
    if (p.t === 'loop') { const side = p.shift > 0 ? -1 : 1, cx = p.x + p.shift / 2; keep.push([Math.min(cx + side * 3, cx + side * 18), Math.max(cx + side * 3, cx + side * 18), p.z - LOOP_RUN - 10, p.z + 10]); }
    if (p.t === 'tube') { const cx = p.x + p.side * 6.5; keep.push([cx - 7.5, cx + 7.5, p.z - p.gap - 3, p.z + 3]); }
  }
  return keep;
}
// WHAT THE CAMERA MUST SEE. Owner, 2026-09-29: "make the cutouts and some elements rise above the height of the rail
// ... they seem like small objects right now". Nothing may hide the course, so rather than keep everything under the
// rail, trace the camera's sight lines: from where it rides (behind and above the marble, on a phone and on a desktop)
// to the course ahead, and note over each metre of floor how low the lowest line passes. A thing may stand only as tall
// as that; beside a straight run nothing crosses, so it may tower over the rail.
function cqSightCaps(pieces, x0, x1, z0, z1, extra = [], high = []) {
  const Q = 2, W = Math.ceil((x1 - x0) * Q), D = Math.ceil((z1 - z0) * Q), cap = new Float32Array(W * D).fill(1e9), pts = [];   // half-metre squares
  for (const p of pieces) {
    let bx0, bx1, bz0, bz1, yAt;
    if (p.t === 'plaza') { bx0 = p.x0; bx1 = p.x0 + p.cols * CELL; bz0 = p.z0 - p.rows * CELL; bz1 = p.z0; yAt = () => p.y; }
    else if (p.t === 'ramp') { const hw = (p.w || 4) / 2; bx0 = p.x - hw; bx1 = p.x + hw; bz0 = Math.min(p.z0, p.z1); bz1 = Math.max(p.z0, p.z1); yAt = (z) => p.y0 + (p.y1 - p.y0) * (z - p.z0) / ((p.z1 - p.z0) || 1); }
    else if (p.x === undefined || typeof p.y !== 'number' || typeof p.z !== 'number') continue;
    else {
      const hw = p.t === 'round' ? p.ro : (p.w || 4) / 2, hd = p.t === 'round' ? p.ro : (p.d || 6) / 2, sh = p.shift || 0;
      const ax = p.amp && p.axis === 'x' ? p.amp : 0, az = p.amp && p.axis === 'z' ? p.amp : 0;
      bx0 = p.x + Math.min(0, sh) - hw - ax; bx1 = p.x + Math.max(0, sh) + hw + ax; bz0 = p.z - hd - az; bz1 = p.z + hd + az; yAt = () => p.y;
    }
    const xs = bx1 - bx0 < 1.6 ? [(bx0 + bx1) / 2] : [bx0 + 0.5, (bx0 + bx1) / 2, bx1 - 0.5];
    for (let z = bz1; z >= bz0 - 0.01; z -= Math.max(1, Math.min(3, (bz1 - bz0) / 2))) for (const x of xs) pts.push([x, yAt(z) + 0.45, z]);
  }
  const targets = pts.concat(extra).sort((a, b) => b[2] - a[2]);
  pts.sort((a, b) => b[2] - a[2]);
  const mark = (ax, ay, az, bx, by, bz) => {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.3);
    for (let k = 0; k <= n; k++) {
      const t = k / n, i = Math.floor((ax + (bx - ax) * t - x0) * Q), j = Math.floor((az + (bz - az) * t - z0) * Q);
      if (i < 0 || j < 0 || i >= W || j >= D) continue;
      const y = ay + (by - ay) * t, q = j * W + i; if (y < cap[q]) cap[q] = y;
    }
  };
  for (const [cx, cy, cz] of pts) for (const [h, back] of [[9.2, 8.6], [6, 7.8]]) {
    const ex = cx, ey = cy + h, ez = cz + back;
    for (const [tx, ty, tz] of targets) { if (tz > ez - 3.5) continue; if (tz < ez - 130) break; mark(ex, ey, ez, tx, ty, tz); }
  }
  for (const c of high) for (const [tx, ty, tz] of targets) if (tx > c.x0 && tx < c.x1 && tz > c.z0 && tz < c.z1) mark(c.pos.x, c.pos.y, c.pos.z, tx, ty, tz);
  // The lowest line over a footprint, with half a metre of slack round it.
  return (x, z, hw, hd) => { let m = 1e9; for (let i = Math.floor((x - hw - 0.5 - x0) * Q); i <= Math.floor((x + hw + 0.5 - x0) * Q); i++) for (let j = Math.floor((z - hd - 0.5 - z0) * Q); j <= Math.floor((z + hd + 0.5 - z0) * Q); j++) if (i >= 0 && j >= 0 && i < W && j < D) m = Math.min(m, cap[j * W + i]); return m; };
}
// The cameras that climb: over a puzzle square or a plank crossing the view goes up and back to show all of it. Where it
// goes depends on the screen, so work it out for a tall phone, a phone on its side and a desktop.
function cqHighCams() {
  const out = [], sw = cssW, sh = cssH, fov = camera.fov, all = [...plazas, ...crossZones];
  for (const [w, h, f] of [[390, 844, 60], [844, 390, 48], [760, 600, 48]]) {
    cssW = w; cssH = h; camera.fov = f;
    for (const P of all) { P.cam = null; const c = plazaCam(P); out.push({ pos: c.pos.clone(), x0: P.x0 - 1, x1: P.x0 + P.cols * CELL + 1, z0: P.z0 - P.rows * CELL - 1, z1: P.z0 + 1, at: c.at.clone() }); }
  }
  cssW = sw; cssH = sh; camera.fov = fov;
  for (const P of all) P.cam = null;
  return out;
}
// How far each performer's paint reaches either side of its sheet's middle, as a share of its height, measured off the atlas.
let cqBoundsMemo = null;
function cqCellBounds(K) {
  if (cqBoundsMemo) return cqBoundsMemo;
  const d = K.figs.map.image.getContext('2d').getImageData(0, 0, 2048, 2048).data, out = [];
  for (let c = 0; c < 16; c++) {
    const ox = (c % 4) * 512, oy = Math.floor(c / 4) * 512; let mn = 512, mx = 0;
    for (let y = 0; y < 512; y += 2) for (let x = 0; x < 512; x += 2) if (d[((oy + y) * 2048 + ox + x) * 4 + 3] > 90) { if (x < mn) mn = x; if (x > mx) mx = x; }
    out.push(Math.max(256 - mn, mx - 256, 40) / 512);
  }
  return (cqBoundsMemo = out);
}
function cqTinFill(Z, CX, HW, Z_TOP, Z_BOT, bays, bulbs, pieces, high) {
  const keep = cqKeepZones(pieces), { r, FL, G, K, paint } = Z, LOW = FL + 8;   // LOW: under the lowest rail, whatever the sight lines say
  Z.wheels = cqChunks();
  const finish = cqBatches(Z);
  const z0 = Z_TOP - 40, z1 = Z_BOT + 60;
  // The course's own tall things (wind towers, posts, loops) must stay in sight too: aim lines at their bodies as well.
  const extra = [], v = new Vector3(), lo = FL + CQ_DROP;
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o === marble || !o.visible) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) { v.set(x, y, z).applyMatrix4(o.matrixWorld); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v.getComponent(k)); mx[k] = Math.max(mx[k], v.getComponent(k)); } }
    if (mx[0] - mn[0] > 30 || mx[2] - mn[2] > 60 || mx[1] - Math.max(mn[1], FL) < 1.5) return;
    for (let y = Math.max(mn[1], FL + 0.5); y <= mx[1] + 0.01; y += Math.max(1.5, (mx[1] - Math.max(mn[1], FL)) / 5)) for (const x of [mn[0], (mn[0] + mx[0]) / 2, mx[0]]) for (const z of [mn[2], mx[2]]) extra.push([x, y, z]);
  });
  const sight = cqSightCaps(pieces, CX - HW - 70, CX + HW + 70, z1 - 30, z0 + 30, extra, high);
  // A plan of the floor in metre squares: whatever stands reserves its ground, and nothing stands on another's.
  const occ = new Set(), key = (i, j) => i * 100003 + j;
  const any = (x, z, hw, hd, f) => { for (let i = Math.floor(x - hw); i <= Math.floor(x + hw); i++) for (let j = Math.floor(z - hd); j <= Math.floor(z + hd); j++) if (f(key(i, j))) return true; return false; };
  // How tall a thing may stand on this ground: under every sight line (0.8 m clear), and low beside loops and towers.
  const room = (x, z, hw, hd) => {
    if (any(x, z, hw, hd, (k) => occ.has(k))) return -1;
    let top = sight(x, z, hw, hd) - 0.8;
    if (keep.some((k) => x + hw > k[0] && x - hw < k[1] && z + hd > k[2] && z - hd < k[3])) top = Math.min(top, LOW);
    return top - FL;
  };
  const take = (x, z, hw, hd) => any(x, z, hw, hd, (k) => { occ.add(k); return false; });
  // Each piece's ground, and so the course's own edges at any z.
  const boxes = [];
  for (const p of pieces) {
    if (p.t === 'plaza') { boxes.push([p.x0, p.x0 + p.cols * CELL, p.z0 - p.rows * CELL, p.z0]); continue; }
    if (p.x === undefined) continue;
    const hw = p.t === 'round' ? p.ro : (p.w || 4) / 2, sh = p.shift || 0, hd = p.t === 'round' ? p.ro : (p.d || 6) / 2;
    const zz = p.t === 'ramp' ? [Math.min(p.z0, p.z1), Math.max(p.z0, p.z1)] : [p.z - hd, p.z + hd];
    boxes.push([p.x + Math.min(0, sh) - hw, p.x + Math.max(0, sh) + hw, zz[0], zz[1]]);
  }
  const edges = (z, span) => { let a = 1e9, b = -1e9; for (const q of boxes) if (z + span > q[2] - 0.5 && z - span < q[3] + 0.5) { a = Math.min(a, q[0]); b = Math.max(b, q[1]); } return a <= b ? [a, b] : null; };
  let cutI = 0, lowI = 0, sigI = 0, wagI = 0, tentI = 0;
  const reach = cqCellBounds(K), cutFp = (cell, h, yaw) => { const w = reach[cell] * h; return [w * Math.cos(yaw) + 0.3, Math.max(1.3, w * Math.abs(Math.sin(yaw)) + 0.4)]; };
  const bigCells = [0, 1, 4, 3, 10, 11, 6, 13, 14, 12, 9, 15, 7, 2], lowCells = [12, 13, 14, 6, 9, 15, 1, 3, 7, 0, 4, 11];
  // THE KINDS, each given the room it has: [its ground's half-width and half-depth at size u (0 smallest .. 1 largest),
  // the height it reaches at u, how to build it at u]. A thing is placed at the largest size that fits under the lines.
  const kinds = {
    cut: { lo: 5.2, hi: 17, fp: (h) => cutFp(h > 9 ? bigCells[cutI % bigCells.length] : lowCells[lowI % lowCells.length], h, 0.32), top: (h) => h * 1.08 + 0.3, build: (x, z, h, s) => cqCut(Z, h > 9 ? bigCells[cutI++ % bigCells.length] : lowCells[lowI++ % lowCells.length], x, z, h, -s * 0.32) },
    globe: { lo: 2.6, hi: 4.6, fp: (R) => [R + 0.4, R + 0.4], top: (R) => R * 2.9 + 0.4, build: (x, z, R) => cqGlobe(Z, x, z, R, R * 0.9) },
    tent: { lo: 3, hi: 5, fp: (R) => [R * 1.15 + 0.3, R * 1.15 + 0.3], top: (R) => R * 3.4 + 1.8, build: (x, z, R) => cqTent(Z, x, z, R, R * 3.4, tentI++ % 4, bulbs) },
    sign: { lo: 5.4, hi: 9, fp: (w) => [w * 0.5 + 0.2, 0.9], top: (w) => w * 1.55, build: (x, z, w) => cqSign(Z, sigI++ % CQ_SIGNS.length, x, z, w, w * 1.05, bulbs) },
    wagon: { lo: 1, hi: 1.5, fp: (u) => [4.1 * u, 2.4 * u], top: (u) => 6.6 * u, build: (x, z, u) => cqWagon(Z, x, z, wagI++ % CQ_WAGONS.length, bulbs, u) },
    prop: { lo: 1, hi: 1, fp: () => [1.8, 1.6], top: () => 7.4, build: (x, z) => cqProp(Z, x, z, Math.floor(r() * 4)) },
    marq: { lo: 0.8, hi: 1.4, fp: (u) => [2.4 * u, 0.9], top: (u) => 10.8 * u, build: (x, z, u) => cqMarquee(Z, x, z, u, r() < 0.4, bulbs) },
  };
  // Place a kind beside an edge at xEdge (s: which side), as large as the room allows; return the depth it took.
  // With no edge given, it hugs the course's own edge along the ground it would take.
  const place = (name, xEdge, z, s, want = 1) => {
    const k = kinds[name];
    for (let f = want; f >= -0.01; f -= 0.2) {
      const u = k.lo + (k.hi - k.lo) * Math.max(0, f), [hw, hd] = k.fp(u), zc = z - hd;
      let xe = xEdge;
      if (xe === null) { const e = edges(zc, hd); xe = e ? (s > 0 ? e[1] : e[0]) : CX + s * HW; }
      const x = xe + s * (hw + 1.1);
      const h = room(x, zc, hw, hd);
      if (h < 0) return 0;
      if (h >= k.top(u)) { take(x, zc, hw, hd); k.build(x, zc, u, s); return hd * 2; }
    }
    return 0;
  };
  // Round every ring: a tin train on its oval, the ring's own performers standing in it.
  const troupe = [[0, 1, 4], [3, 6, 14], [13, 12, 2], [10, 9, 7]];
  bays.forEach((zc, i) => {
    const ax = HW + 3.4, az = 13;
    take(CX, zc, 7.5, 7.5); troupe[i % 4].forEach((cell, j) => cqCut(Z, cell, CX + (j - 1) * 4, zc + (j === 1 ? -2 : 1), 4.6 + (j === 1 ? 0.6 : 0), 0, false));
    for (let k = 0; k < 64; k++) { const a = k * TAU / 64; take(CX + ax * Math.cos(a), zc + az * Math.sin(a), 1.6, 1.6); }
    cqTrain(Z, CX, zc, ax, az);
  });
  // Lane nought, hugging the course's own edges all the way along: big where the sight lines leave room, smaller where not.
  const lane0 = ['cut', 'globe', 'marq', 'tent', 'cut', 'wagon', 'sign', 'cut', 'globe', 'marq', 'prop', 'cut', 'tent', 'wagon'];
  for (const s of [-1, 1]) {
    let li = s > 0 ? 5 : 0;
    for (let z = z0; z > z1;) {
      if (!edges(z - 3, 3)) { z -= 2; continue; }
      const got = place(lane0[li % lane0.length], null, z, s, 0.6 + r() * 0.4);
      if (got) { li++; z -= got + 0.8; } else z -= 1.5;
    }
  }
  // Marquee lights along the edges: striped poles close by the course, strings of bulbs swagged between them, only
  // where every sight line passes above the string.
  let fid = 1600;
  for (const s of [-1, 1]) {
    let prev = null;
    for (let z = z0 - 3; z > z1; z -= 10) {
      const e = edges(z, 0.5); if (!e) { prev = null; continue; }
      const x = (s > 0 ? e[1] : e[0]) + s * 0.9, H = Math.min(11.5, room(x, z, 0.35, 0.35));
      if (H < 7) { prev = null; continue; }
      take(x, z, 0.35, 0.35);
      for (let k = 0; k < 5; k++) paint.geo(new CylinderGeometry(0.11, 0.13, H / 5, 8), placeAt(x, FL + (k + 0.5) * H / 5, z), k % 2 ? 0xFFF1D2 : 0xE8303A);
      paint.geo(new SphereGeometry(0.3, 10, 8), placeAt(x, FL + H + 0.2, z), 0xF2C230);
      const top = FL + H;
      if (prev && Math.abs(prev[1] - z) < 14) {
        const mx = (x + prev[0]) / 2, mz = (z + prev[1]) / 2, hw = Math.abs(x - prev[0]) / 2 + 0.2, hd = Math.abs(z - prev[1]) / 2;
        if (sight(mx, mz, hw, hd) - 0.8 >= Math.max(top, prev[2])) {
          fid++;
          for (let k = 1; k < 16; k++) { const f = k / 16; bulbs.push([prev[0] + (x - prev[0]) * f, prev[2] + (top - prev[2]) * f - 1.3 * Math.sin(Math.PI * f), prev[1] + (z - prev[1]) * f, fid, k]); }
        }
      }
      prev = [x, z, top];
    }
  }
  // Lane one, just beyond: the tall set pieces again, and the Wheel of Death, light towers, cannons.
  const tallA = ['cut', 'globe', 'wagon', 'cut', 'sign', 'tent', 'cut', 'wheel', 'wagon', 'cut', 'tower', 'cannon'];
  for (const s of [-1, 1]) {
    let ci = s > 0 ? 3 : 0;
    for (let z = z0 - (s > 0 ? 5 : 0); z > z1;) {
      const e = CX + s * (HW + 3.5), kind = tallA[ci % tallA.length];
      let got = 0;
      if (kind === 'wheel') { const x = e + s * 7.8, h = room(x, z - 1.8, 7.6, 1.8); if (h >= 15) { take(x, z - 1.8, 7.6, 1.8); cqWheelOfDeath(Z, x, z - 1.8, bulbs); got = 3.6; } }
      else if (kind === 'tower') { const x = e + s * 1.8, H = 15 + r() * 4, hh = room(x, z - 1.2, 1.9, 1.2); if (hh >= H + 3) { take(x, z - 1.2, 1.9, 1.2); cqTower(Z, x, z - 1.2, H, -s * 0.5, bulbs); got = 2.4; } }
      else if (kind === 'cannon') { const x = e + s * 3.4, h = room(x, z - 3.2, 3, 3.2); if (h >= 9) { take(x, z - 3.2, 3, 3.2); cqTinCannon(Z, x, z - 3.2, s > 0 ? Math.PI * 0.8 : -Math.PI * 0.8); got = 6.4; } }
      else got = place(kind, e, z, s, 1);
      if (got) { ci++; z -= got + 1; const px = e + s * 0.2; if (room(px, z - 1.6, 1.8, 1.6) >= 7.4) { take(px, z - 1.6, 1.8, 1.6); cqProp(Z, px, z - 1.6, Math.floor(r() * 4)); } z -= 3.4; }
      else z -= 2;
    }
  }
  // Lane two, beyond: the biggest things, a Ferris wheel, helter-skelters, carousels, the largest cut-outs, tents.
  for (const s of [-1, 1]) {
    let k = s > 0 ? 2 : 0;
    const e = CX + s * (HW + 19);
    for (let z = z0 - (s > 0 ? 14 : 2); z > z1;) {
      const kind = ['ferris', 'bigcut', 'helter', 'tent', 'carousel', 'bigcut', 'globe'][k % 7];
      let ok = false, adv = 0;
      const fits = (x, zc, hw, hd, top) => { if (room(x, zc, hw, hd) < top) return false; take(x, zc, hw, hd); return true; };
      if (kind === 'ferris') { const x = e + s * 12; if ((ok = fits(x, z - 3, 13, 2.5, 28))) cqFerris(Z, x, z - 3, 12, bulbs); adv = 10; }
      else if (kind === 'bigcut') { const h = 18 + r() * 6, cell = bigCells[cutI % bigCells.length], [hw, hd] = cutFp(cell, h, 0.3), x = e + s * hw; if ((ok = fits(x, z - hd, hw, hd, h * 1.1))) { cutI++; cqCut(Z, cell, x, z - hd, h, -s * 0.3); } adv = hd * 2 + 4; }
      else if (kind === 'helter') { const x = e + s * 5; if ((ok = fits(x, z - 5, 5, 5, 34))) cqHelter(Z, x, z - 5, 22 + r() * 6); adv = 13; }
      else if (kind === 'tent') { const x = e + s * 8; if ((ok = fits(x, z - 8, 8, 8, 26))) cqTent(Z, x, z - 8, 7, 22, tentI++ % 4, bulbs); adv = 18; }
      else if (kind === 'carousel') { const x = e + s * 7; if ((ok = fits(x, z - 7, 6.5, 6.5, 9))) cqCarousel(G, K, Z.C, paint, Z.metal, Z.lit, Z.tick, Z.fig, x, FL, z - 7, true, Z.live, Z.cuts); adv = 16; }
      else { const x = e + s * 6; if ((ok = fits(x, z - 7, 6.4, 6.4, 18))) cqGlobe(Z, x, z - 7, 6, 4.5); adv = 16; }
      if (ok) { k++; z -= adv; } else z -= 3;
    }
  }
  // Under the course, wherever the floor is still bare: whatever fits under the lines there, which is not much.
  for (let z = z0, k = 0; z > z1; z -= 4, k++) for (let x = CX - HW + 2 + (k % 2) * 3; x < CX + HW - 1; x += 6) {
    const kind = ['wagon', 'globe', 'cut', 'prop', 'cut'][(((k * 7 + Math.round(x)) % 5) + 5) % 5];
    place(kind, x - 2, z + 2, 1, 0.4);
  }
  for (const m of Z.wheels.meshes(K.wheel)) G.add(m);
  finish();
}
