
// ---- BATCHES: the tin circus has hundreds of things, and a phone should draw them in a handful of calls ----
// (It drew 420-650 calls a frame against the pinball world's 184.) Every cut-out, its key, the animals in the wagons and
// the horses on the carousels are one instanced plane (each instance told which cell of the atlas to print); the bikes,
// the train cars and the Ferris wheel cars are instanced by shape; tents, boards, signs and globe mesh are merged; the
// smoke is one cloud of points.
// A merged build cut into lengths of the course, so the camera's frustum can drop the lengths it cannot see (merged
// whole, a long level drew every tent and globe along it every frame).
function cqChunks(len = 48) {
  const parts = new Map(), at = (z) => { const k = Math.floor(z / len); if (!parts.has(k)) parts.set(k, pbBuild()); return parts.get(k); };
  return {
    geo(g, m, hex) { at(m.elements[14]).geo(g, m, hex); },
    tri(a, b, c, ...rest) { at((a[2] + b[2] + c[2]) / 3).tri(a, b, c, ...rest); },
    count() { let n = 0; for (const b of parts.values()) n += b.count(); return n; },
    meshes(mat) { const out = []; for (const b of parts.values()) if (b.count()) out.push(new Mesh(b.done(), mat)); return out; },
  };
}
let cqIBA = null;                                        // the instanced-attribute class, borrowed: the bundle does not export it
const cqIBAOf = () => cqIBA || (cqIBA = new InstancedMesh(new BufferGeometry(), undefined, 1).instanceMatrix.constructor);
const cqCellMats = {};
function cqCellMat(base) {                               // a copy of a figure material that prints each instance's own cell
  if (cqCellMats[base.uuid]) return cqCellMats[base.uuid];
  const m = base.clone(); m.userData.keep = true;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <uv_pars_vertex>', '#include <uv_pars_vertex>\nattribute vec2 cellOff;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = uv * 0.25 + cellOff;\n#endif\n#ifdef USE_EMISSIVEMAP\n  vEmissiveMapUv = uv * 0.25 + cellOff;\n#endif');
  };
  m.customProgramCacheKey = () => 'cq-cell';
  return (cqCellMats[base.uuid] = m);
}
function cqBatches(Z) {
  const { K, live } = Z;
  const cuts = [], bikes = [], trains = [], ferris = [], smoke = [];
  Z.cuts = { add: (e) => { cuts.push(e); return e; } };
  Z.bikes = bikes; Z.trains = trains; Z.ferris = ferris; Z.smoke = smoke;
  Z.merge = { canvas: cqChunks(), grid: cqChunks(), posters: cqChunks(), boards: cqChunks(), signs: cqChunks() };
  // The cars of every tin train and every Ferris wheel, by shape (built once).
  return () => {
    const { G, C, tick } = Z, IBA = cqIBAOf(), q = new Quaternion(), q2 = new Quaternion(), eu = new Euler(0, 0, 0, 'YXZ'), p = new Vector3(), s = new Vector3(), M = new Matrix4(), o3 = new Vector3(), zAx = new Vector3(0, 0, 1);
    const steps = [];
    // The cut-outs: a front, a darker back just behind it (the tin's edge), a key turning in the back of the wound ones.
    if (cuts.length) {
      const n = cuts.length, geo = new PlaneGeometry(1, 1); geo.translate(0, 0.5, 0);
      const off = new Float32Array(n * 2); cuts.forEach((e, i) => { off[i * 2] = (e.cell % 4) / 4; off[i * 2 + 1] = 1 - (Math.floor(e.cell / 4) + 1) / 4; });
      geo.setAttribute('cellOff', new IBA(off, 2));
      const front = new InstancedMesh(geo, cqCellMat(K.figs), n), back = new InstancedMesh(geo, cqCellMat(K.figsBack), n);
      const keyed = cuts.filter((e) => e.key).length, keys = new InstancedMesh(cqKeyGeo(C), K.metal, Math.max(1, keyed));
      if (!keyed) keys.visible = false;
      for (const m of [front, back, keys]) { m.frustumCulled = false; G.add(m); }
      steps.push((t) => {
        let ki = 0;
        cuts.forEach((e, i) => {
          if (e.anim) e.anim(t, e);
          eu.set(0, e.yaw, e.key && live ? Math.sin(t * 2.1 + e.ph0) * 0.03 : (e.roll || 0)); q.setFromEuler(eu);
          const fl = e.flip || 1;
          p.set(e.x, e.y, e.z); s.set(e.h * fl, e.h, 1); M.compose(p, q, s); front.setMatrixAt(i, M);
          o3.set(0, -e.h * 0.003, -Math.max(0.08, e.h * 0.012)).applyQuaternion(q); p.add(o3);
          s.set(e.h * 1.012 * fl, e.h * 1.008, 1); M.compose(p, q, s); back.setMatrixAt(i, M);
          if (e.key) {
            o3.set(0, e.h * 0.42, -0.2).applyQuaternion(q); p.set(e.x, e.y, e.z).add(o3);
            q2.setFromAxisAngle(zAx, t * 1.3 + e.ph0); q2.premultiply(q);
            const k = Math.max(0.6, e.h / 9); s.set(k, k, k); M.compose(p, q2, s); keys.setMatrixAt(ki++, M);
          }
        });
        front.instanceMatrix.needsUpdate = back.instanceMatrix.needsUpdate = keys.instanceMatrix.needsUpdate = true;
      });
    }
    // The globes' riders, a batch per colour, and their headlamps in one more.
    if (bikes.length) {
      const geos = cqBikeGeos(), per = [0, 1, 2].map((c) => bikes.filter((b) => b.col === c));
      const meshes = per.map((L, c) => { const m = new InstancedMesh(geos[c], K.paint, Math.max(1, L.length)); m.visible = L.length > 0; m.frustumCulled = false; G.add(m); return m; });
      const lampGeo = new CircleGeometry(0.55, 12); lampGeo.translate(0, 0.55, 0.75);
      const lamps = new InstancedMesh(lampGeo, K.glowWhite, bikes.length); lamps.frustumCulled = false; G.add(lamps);
      const B = new Matrix4(), up = new Vector3(), fw = new Vector3(), sd = new Vector3(), u = new Vector3();
      steps.push((t) => {
        let li = 0;
        per.forEach((L, c) => { L.forEach((b, i) => {
          const th = b.p0 + b.w * t, cs = Math.cos(th), sn = Math.sin(th);
          u.copy(b.a).multiplyScalar(cs).addScaledVector(b.b, sn);
          fw.copy(b.a).multiplyScalar(-sn).addScaledVector(b.b, cs).multiplyScalar(Math.sign(b.w));
          up.copy(u).negate(); sd.crossVectors(up, fw); B.makeBasis(sd, up, fw); q.setFromRotationMatrix(B);
          p.set(b.x, b.cy, b.z).addScaledVector(u, b.R - 0.05); s.setScalar(b.R / 3.6); M.compose(p, q, s);
          meshes[c].setMatrixAt(i, M); lamps.setMatrixAt(li++, M);
        }); meshes[c].instanceMatrix.needsUpdate = true; });
        lamps.instanceMatrix.needsUpdate = true;
      });
    }
    // The trains: four kinds of car, each a batch across every train.
    if (trains.length) {
      const geos = cqTrainGeos(), meshes = geos.map((g) => { const m = new InstancedMesh(g, K.paint, trains.length); m.frustumCulled = false; G.add(m); return m; });
      steps.push((t) => {
        trains.forEach((T, i) => { for (let k = 0; k < 4; k++) { const [px, pz, yaw] = T.car(t, k); eu.set(0, yaw, 0); q.setFromEuler(eu); p.set(px, T.y + 0.15, pz); s.set(1, 1, 1); M.compose(p, q, s); meshes[k].setMatrixAt(i, M); } });
        for (const m of meshes) m.instanceMatrix.needsUpdate = true;
      });
    }
    // The Ferris wheels' cars, a batch per colour.
    if (ferris.length) {
      const geos = cqFerrisCarGeos(), cars = [0, 1, 2, 3].map(() => []);
      ferris.forEach((F) => { for (let k = 0; k < 12; k++) cars[k % 4].push([F, k / 12 * TAU]); });
      const meshes = cars.map((L, c) => { const m = new InstancedMesh(geos[c], K.paint, L.length); m.frustumCulled = false; G.add(m); return m; });
      steps.push((t) => {
        cars.forEach((L, c) => { L.forEach(([F, a0], i) => { const a = a0 + t * 0.14; p.set(F.x + Math.cos(a) * F.R, F.cy + Math.sin(a) * F.R, F.z); M.makeTranslation(p.x, p.y, p.z); meshes[c].setMatrixAt(i, M); }); meshes[c].instanceMatrix.needsUpdate = true; });
      });
    }
    // Smoke: each emitter puffs five rising, growing, fading puffs; all of them one cloud of points.
    if (smoke.length) {
      const N = smoke.length * 5, pos = new Float32Array(N * 3), col = new Float32Array(N * 4);
      const geo = new BufferGeometry(); geo.setAttribute('position', new Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new Float32BufferAttribute(col, 4));
      const pts = new Points(geo, new PointsMaterial({ size: 2.6, map: pbGlow(), vertexColors: true, transparent: true, depthWrite: false }));
      pts.frustumCulled = false; G.add(pts);
      steps.push((t) => {
        const P = geo.attributes.position.array, Cc = geo.attributes.color.array;
        smoke.forEach((e, j) => { const b = e.at(t); for (let k = 0; k < 5; k++) { const u = (((t * (e.rate || 0.9) + k / 5 + j * 0.13) % 1) + 1) % 1, i = j * 5 + k;
          P[i * 3] = b[0] + (e.drift || 0) * u; P[i * 3 + 1] = b[1] + u * (e.rise || 3); P[i * 3 + 2] = b[2];
          Cc[i * 4] = 1; Cc[i * 4 + 1] = 0.97; Cc[i * 4 + 2] = 0.93; Cc[i * 4 + 3] = (e.op || 0.6) * (1 - u) * (b[3] === undefined ? 1 : b[3]); } });
        geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
      });
    }
    // The merged, textured things.
    for (const [k, mat] of [['canvas', K.canvas], ['grid', K.grid], ['posters', K.posters], ['boards', K.boards], ['signs', K.signs]]) for (const m of Z.merge[k].meshes(mat)) G.add(m);
    const all = (t) => { for (const f of steps) f(t); };
    all(0); if (live) tick.push((dt, t) => all(t));
  };
}
// The shapes the batches share, built once.
let cqBikeGeoMemo = null;
function cqBikeGeos() {
  return cqBikeGeoMemo || (cqBikeGeoMemo = [0xE8303A, 0x2A4AE8, 0xF2C230].map((col) => {
    const B = pbBuild();
    for (const dz of [-0.6, 0.6]) B.geo(new TorusGeometry(0.3, 0.1, 4, 10), placeAt(0, 0.34, dz, 0, Math.PI / 2, 0), 0x231A2E);
    B.geo(new BoxGeometry(0.26, 0.34, 1.1), placeAt(0, 0.52, 0), col);
    B.geo(new BoxGeometry(0.38, 0.55, 0.4), placeAt(0, 0.95, -0.12), 0xFFF1D2);
    B.geo(new IcosahedronGeometry(0.22, 1), placeAt(0, 1.34, 0), col);
    B.geo(new BoxGeometry(0.62, 0.07, 0.07), placeAt(0, 0.9, 0.42), 0x8A8A98);
    return B.done();
  }));
}
let cqTrainGeoMemo = null;
function cqTrainGeos() {
  if (cqTrainGeoMemo) return cqTrainGeoMemo;
  const mk = (build) => { const B = pbBuild(); build(B); return B.done(); };
  const wheelsOf = (B, L) => { for (const dz of [-L * 0.3, L * 0.3]) for (const s of [-0.62, 0.62]) B.geo(new CylinderGeometry(0.42, 0.42, 0.16, 16), placeAt(s, 0.45, dz, 0, 0, Math.PI / 2), 0xE8303A); };
  return (cqTrainGeoMemo = [
    mk((B) => { wheelsOf(B, 3.6); B.geo(new BoxGeometry(1.5, 0.35, 3.8), placeAt(0, 0.7, 0), 0x231A2E);
      B.geo(new CylinderGeometry(0.72, 0.72, 2.2, 20), placeAt(0, 1.5, 0.6, Math.PI / 2, 0, 0), 0xE8303A);
      for (const f of [-0.3, 0.3, 0.9]) B.geo(new CylinderGeometry(0.76, 0.76, 0.14, 20), placeAt(0, 1.5, 0.6 + f, Math.PI / 2, 0, 0), 0xF2C230);
      B.geo(new BoxGeometry(1.6, 1.9, 1.3), placeAt(0, 1.8, -1.1), 0x2A4AE8); B.geo(new BoxGeometry(1.8, 0.2, 1.6), placeAt(0, 2.85, -1.1), 0xF2C230);
      B.geo(new CylinderGeometry(0.28, 0.2, 1.1, 12), placeAt(0, 2.5, 1.2), 0x231A2E); B.geo(new CylinderGeometry(0.42, 0.3, 0.3, 12), placeAt(0, 3.1, 1.2), 0xF2C230);
      B.geo(new ConeGeometry(0.7, 0.6, 4), placeAt(0, 0.6, 2.05, -Math.PI / 2, Math.PI / 4, 0), 0xF2C230); }),
    mk((B) => { wheelsOf(B, 3.4); B.geo(new BoxGeometry(1.6, 0.3, 3.4), placeAt(0, 0.7, 0), 0x2AA89A);
      for (let k = 0; k < 7; k++) B.geo(new CylinderGeometry(0.04, 0.04, 1.6, 4), placeAt(0.78, 1.65, -1.5 + k * 0.5), 0xF2C230);
      B.geo(new BoxGeometry(1.4, 1.7, 3.2), placeAt(-0.1, 1.7, 0), 0x3A2448); B.geo(new BoxGeometry(1.8, 0.2, 3.6), placeAt(0, 2.6, 0), 0xE8303A); }),
    mk((B) => { wheelsOf(B, 3.4); B.geo(new BoxGeometry(1.6, 0.3, 3.4), placeAt(0, 0.7, 0), 0xF2C230);
      for (const [dz, col] of [[-1, 0xE8303A], [0, 0x2A6AE8], [1, 0x2AA86A]]) B.geo(new SphereGeometry(0.55, 14, 10), placeAt(0, 1.4, dz), col); }),
    mk((B) => { wheelsOf(B, 3.6); B.geo(new BoxGeometry(1.6, 1.8, 3.6), placeAt(0, 1.55, 0), 0x6A2A9A);
      for (let k = 0; k < 3; k++) B.geo(new BoxGeometry(1.64, 0.6, 0.6), placeAt(0, 1.8, -1.1 + k * 1.1), 0xFFF1D2);
      B.geo(new BoxGeometry(1.8, 0.2, 3.9), placeAt(0, 2.5, 0), 0xF2C230); }),
  ]);
}
let cqFerrisCarMemo = null;
const cqFerrisCarGeos = () => cqFerrisCarMemo || (cqFerrisCarMemo = [0xE8303A, 0x2A4AE8, 0xF2C230, 0x2AA89A].map((col) => {
  const B = pbBuild(); B.geo(new BoxGeometry(2, 1.3, 1.6), placeAt(0, -1.2, 0), col); B.geo(new ConeGeometry(1.4, 0.7, 4), placeAt(0, -0.2, 0, 0, Math.PI / 4, 0), 0xFFF1D2); B.geo(new CylinderGeometry(0.05, 0.05, 1, 4), placeAt(0, 0.3, 0), 0xF2C230);
  return B.done();
}));
