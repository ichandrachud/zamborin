
// ---- THE MIDWAY AT DUSK: the course over the fairground, booths along both sides, the big top beyond ----
function cqMidway(G, K, C, paint, metal, lit, bulbs, tick, fig, CX, HW, FL, Z_TOP, Z_BOT, r, live) {
  const awn = [[0xC8202C, 0xF4ECD8], [0x2A6AD8, 0xF4ECD8], [0x2AA86A, 0xF4ECD8], [0xE8B040, 0x8A1A20]];
  // Booths: a body, a striped awning, a counter with prizes, a painted sign; every other one lit inside.
  for (const s of [-1, 1]) for (let z = Z_TOP - 10, i = 0; z > Z_BOT + 10; z -= 11, i++) {
    const x = CX + s * (HW + 2.5), col = awn[(i + (s > 0 ? 2 : 0)) % 4];   // right under the edges of the rail, where the camera looks
    paint.geo(new BoxGeometry(7, 3.6, 8), placeAt(x + s * 1.5, FL + 1.8, z), 0x3A2418);
    for (let k = 0; k < 8; k++) paint.geo(new BoxGeometry(2.4, 0.12, 1.02), placeAt(x - s * 1.8, FL + 4.2 - 0.0, z - 3.5 + k, 0, 0, s * 0.35), col[k % 2]);   // the awning's stripes
    paint.geo(new BoxGeometry(0.8, 1.2, 7.6), placeAt(x - s * 1.6, FL + 0.6, z), col[0]);
    for (let k = 0; k < 6; k++) lit.geo(new SphereGeometry(0.22, 8, 6), placeAt(x - s * 1.6, FL + 1.45, z - 3 + k * 1.2), [0xFF5A5A, 0xFFD23F, 0x5AC8FF, 0x7AF08A, 0xFF8AD8, 0xFFFFFF][k]);
    const sign = new Mesh(new PlaneGeometry(4, 4), K.posters); const cell = (i + (s > 0 ? 1 : 0)) % 4;
    const uv = sign.geometry.attributes.uv; for (let q = 0; q < 4; q++) uv.setXY(q, (cell % 2) * 0.5 + uv.getX(q) * 0.5, 1 - Math.floor(cell / 2) * 0.5 - (1 - uv.getY(q)) * 0.5);
    sign.rotation.y = s * -Math.PI / 2; sign.position.set(x - s * 0.9, FL + 5.8, z); G.add(sign);
    for (let k = 0; k < 7; k++) bulbs.push([x - s * 2.9, FL + 3.4, z - 3.6 + k * 1.2, 200 + i, k]);   // bulbs along the awning's edge
  }
  const lane = new Mesh(new PlaneGeometry(HW * 2 - 2, Z_TOP - Z_BOT), K.runner); K.runner.map.repeat.set(1, (Z_TOP - Z_BOT) / 10); lane.rotation.x = -Math.PI / 2; lane.position.set(CX, FL + 0.02, (Z_TOP + Z_BOT) / 2); G.add(lane);
  for (let z = Z_TOP; z > Z_BOT; z -= 12) for (let k = 1; k < 12; k++) { const f = k / 12; bulbs.push([CX - HW + 2 + (HW * 2 - 4) * f, FL + 6.4 - 1.4 * Math.sin(Math.PI * f), z, 800 + z, k]); }   // strung low across the lane
  // Tall poles along both sides with strings of bulbs swagged between them, just clear of the course.
  for (const s of [-1, 1]) {
    for (let z = Z_TOP; z > Z_BOT; z -= 16) {
      const x = CX + s * (HW + 3), top = FL + 12.5;
      paint.geo(new CylinderGeometry(0.18, 0.24, top - FL, 8), placeAt(x, (top + FL) / 2, z), C.pole);
      lit.geo(new SphereGeometry(0.3, 8, 6), placeAt(x, top + 0.3, z), C.bulb);
      for (let k = 1; k < 16; k++) { const f = k / 16; bulbs.push([x, top - 3.2 * Math.sin(Math.PI * f), z - f * 16, 300 + s + z, k]); }
      for (let k = 1; k < 10; k++) { const f = k / 10, x2 = CX + s * (HW + 16); bulbs.push([x + (x2 - x) * f, top - 2.5 * Math.sin(Math.PI * f), z, 400 + z, k]); }
    }
  }
  // The big top beyond the booths: striped canvas, flags, bulbs up its seams; one every 200 m, on alternate sides.
  for (let z = Z_TOP - 60, i = 0; z > Z_BOT - 60; z -= 200, i++) {
    const s = i % 2 ? 1 : -1, x = CX + s * 52, rad = 26, eave = FL + 11, peak = FL + 34;
    const prof = []; for (let k = 0; k <= 12; k++) { const f = k / 12; prof.push(new Vector2(rad * (1 - f) + 1.5 * f, eave + (peak - eave) * Math.pow(f, 1.5))); }
    const roof = new Mesh(new LatheGeometry(prof, 48), K.canvas); roof.position.set(x, 0, z); G.add(roof);
    const wall = new Mesh(new CylinderGeometry(rad, rad, eave - FL, 48, 1, true), K.wall); wall.position.set(x, (eave + FL) / 2, z); G.add(wall);
    paint.geo(new CylinderGeometry(0.4, 0.4, 8, 8), placeAt(x, peak + 4, z), C.pole);
    paint.geo(new BoxGeometry(0.1, 1.6, 2.6), placeAt(x, peak + 7, z + 1.3), C.poleStripe);
    for (let sm = 0; sm < 12; sm++) { const a = sm / 12 * Math.PI * 2; for (let k = 0; k < 14; k++) { const f = k / 13, rr = rad * (1 - f) + 1.5 * f; bulbs.push([x + Math.cos(a) * rr, eave + (peak - eave) * Math.pow(f, 1.5) + 0.3, z + Math.sin(a) * rr, 500 + sm + i * 20, k]); } }
  }
  // The Ferris wheel, turning slowly, its rim of bulbs; the helter-skelter; the carousel; the high striker.
  const fx = CX + 34, fz = Z_TOP - 120, FR = 17;
  const wheel = new Group(); wheel.position.set(fx, FL + FR + 3, fz); wheel.rotation.y = Math.PI / 2; G.add(wheel);
  const WB = pbBuild();
  for (const dz of [-1.2, 1.2]) WB.geo(new TorusGeometry(FR, 0.25, 8, 64), placeAt(0, 0, dz), 0xE8E0D0);
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; for (const dz of [-1.2, 1.2]) WB.geo(new CylinderGeometry(0.1, 0.1, FR, 4), placeAt(Math.cos(a) * FR / 2, Math.sin(a) * FR / 2, dz, 0, 0, a + Math.PI / 2), 0xC8C0B0); }
  wheel.add(new Mesh(WB.done(), K.metal));
  for (const s of [-1, 1]) metal.geo(new CylinderGeometry(0.4, 0.6, FR + 5, 8), placeAt(fx + s * 0, FL + (FR + 3) / 2, fz + s * 6, s * 0.3, 0, 0), 0xC8C0B0);
  const wp = [], wc = [];
  for (let k = 0; k < 96; k++) { const a = k / 96 * Math.PI * 2; wp.push(Math.cos(a) * FR, Math.sin(a) * FR, 1.3); const c = new Color([0xFFD9A0, 0xFF6A5A, 0x6AC8FF][k % 3]); wc.push(c.r, c.g, c.b); }
  const wg = new BufferGeometry(); wg.setAttribute('position', new Float32BufferAttribute(wp, 3)); wg.setAttribute('color', new Float32BufferAttribute(wc, 3));
  wheel.add(new Points(wg, new PointsMaterial({ size: 1.4, map: pbGlow(), vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false })));
  const cars = [];
  for (let k = 0; k < 12; k++) { const g = new Mesh(new BoxGeometry(2, 1.6, 1.8), new MeshStandardMaterial({ color: awn[k % 4][0], roughness: 0.5 })); G.add(g); cars.push([g, k / 12 * Math.PI * 2]); }
  const placeCars = (t) => cars.forEach(([g, a0]) => { const a = a0 + t * 0.12; g.position.set(fx, FL + FR + 3 + Math.sin(a) * FR - 1.4, fz + Math.cos(a) * FR); });
  placeCars(0); if (live) tick.push((dt, t) => { wheel.rotation.x = t * 0.12; placeCars(t); });
  // The helter-skelter: a striped tower, the slide winding down round it, a pointed roof and a flag.
  const hx = CX - 22, hz = Z_TOP - 80;
  for (let k = 0; k < 10; k++) paint.geo(new CylinderGeometry(3, 3.2, 2, 20), placeAt(hx, FL + 1 + k * 2, hz), k % 2 ? 0xF4ECD8 : 0xC8202C);
  paint.geo(new ConeGeometry(4, 4, 20), placeAt(hx, FL + 22, hz), 0x2A6AD8);
  for (let k = 0; k < 120; k++) { const f = k / 120, a = f * Math.PI * 8; paint.geo(new BoxGeometry(1.8, 0.2, 1.1), placeAt(hx + Math.cos(a) * 4.2, FL + 19 - f * 18, hz + Math.sin(a) * 4.2, 0, -a, -0.35), 0xE8B040); }
  // The high striker: ring the bell. A puck shoots up the pole now and then.
  const sx = CX + HW + 20, sz = Z_TOP - 40;
  paint.geo(new BoxGeometry(0.8, 11, 0.5), placeAt(sx, FL + 5.5, sz), 0xF4ECD8);
  for (let k = 0; k < 10; k++) paint.geo(new BoxGeometry(0.86, 0.9, 0.52), placeAt(sx, FL + 1 + k * 1.05, sz), [0x2AA86A, 0x2AA86A, 0xE8B040, 0xE8B040, 0xE8B040, 0xE86A20, 0xE86A20, 0xC8202C, 0xC8202C, 0xC8202C][k]);
  metal.geo(new SphereGeometry(0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), placeAt(sx, FL + 11.6, sz), C.brass);
  const puck = new Mesh(new BoxGeometry(0.5, 0.3, 0.5), new MeshBasicMaterial({ color: 0xFFFFFF, toneMapped: false })); G.add(puck);
  if (live) tick.push((dt, t) => { const u = (t % 5) / 5, f = u < 0.3 ? Math.sin(Math.PI * u / 0.3) : 0; puck.position.set(sx, FL + 0.6 + f * 10.6, sz + 0.4); });
  cqCarousel(G, K, C, paint, metal, lit, tick, fig, CX - HW - 12, FL, Z_TOP - 25, false, live);
  fig(11, CX + HW + 9, FL, Z_TOP - 16, 7); fig(10, CX - HW - 9, FL, Z_TOP - 50, 3.8); fig(1, CX + HW + 10, FL, Z_TOP - 62, 3.6);
  // Fairgoers along the lanes between the booths.
  cqCrowd(G, C, CX, HW - 10, FL - 1.3, Z_TOP, Z_BOT, r);
}
// The marble as a circus ball: red, a navy band of white stars round its middle, gold at the poles.
let cqBallMemo = null;
function cqBallTex() {
  return cqBallMemo || (cqBallMemo = canvasTex(512, 256, (g) => {
    g.fillStyle = '#C8202C'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#1A2A6A'; g.fillRect(0, 88, 512, 80);
    g.fillStyle = '#FFFFFF'; for (let i = 0; i < 8; i++) { cqStar(g, 32 + i * 64, 128, 24, 10); g.fill(); }
    g.fillStyle = '#E8B040'; g.fillRect(0, 0, 512, 22); g.fillRect(0, 234, 512, 22);
    g.fillStyle = '#F4ECD8'; g.fillRect(0, 80, 512, 8); g.fillRect(0, 168, 512, 8);
  }));
}
