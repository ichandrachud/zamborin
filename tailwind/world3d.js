/* TAILWIND — the world in 3D, FACETED AND STRICTLY SIDE ON (owner, 2026-10-30, approving
   tools/tailwind/studies/faceted-study.html #sling-facet and #flight-facet: "Yes, build it").

   play.js still runs the game: the flight model, the three taps, the camera rules, the read-outs and the pick
   screen. This draws the world UNDER its canvas — sky, mountains, forest, clouds, field, slingshot, aeroplane — and
   play.js stops painting those itself once this says it is ready.

   A FLAT LENS. An orthographic camera framed so that anything at z = 0 lands on exactly the pixel play.js would draw
   it on — sx = (x - camX) * ppm, sy = groundY - (y - camY) * ppm. Depth is only LAYERS, each sliding across at its
   own speed (far range 0.07, main range 0.16, the field 1.0), the whole backdrop sinking together slowly as the
   aeroplane climbs (SINK), and the clouds strewn up the sky at their own speed as the painted game had them.
   Every layer is a tile repeated end to end, so the strip never runs out, however far a boost carries.

   CALM, AS THE ORIGINAL BACKDROP: a plain sky, one grey faceted range with a paler one behind, one dense faceted
   forest at about a quarter of the mountains' height, no trunks, flush on the ground, a few faceted clouds, a plain
   green field. Every facet one flat colour by how it faces a light from the top left. The aeroplane is the one
   bright, glossy thing (the six from tools/tailwind/fleet.py, their enamel finish kept).

   THE SLINGSHOT is a faceted wooden Y in a grass mound, its arms branching just above the screw (play.js's pivot).
   THE BAND is the owner's sketch: one flat orange band from a slotted screw, widening to a rounded end past the
   aeroplane's tail, the aeroplane lying along it; it follows the aim and draw every frame and hangs short and slack
   once the aeroplane has gone.

   If WebGL is missing or anything here fails, window.TAILWIND_3D.failed is set and play.js keeps drawing the
   painted 2D world it always had. */
import * as T from './assets/three-r186.min.js';
import { makeFinish } from './finish.js';

const API = window.TAILWIND_3D = { ready: false, failed: false, render() {} };
const fail = (why) => {
  API.failed = true; API.ready = false;
  try { console.warn('Tailwind 3D off:', why); } catch (e) {}
  window.dispatchEvent(new Event('tailwind-3d-failed'));
};

try { start(); } catch (e) { fail(e); }

function start() {
  const M = window.TAILWIND_MODEL;
  const game = document.getElementById('game');
  if (!M || !game) throw new Error('no game');
  const PHONE = matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
  const Q = new URLSearchParams(location.search);

  const cv = document.createElement('canvas');
  cv.id = 'world3d'; cv.setAttribute('aria-hidden', 'true');
  Object.assign(cv.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', zIndex: '0', pointerEvents: 'none' });
  game.style.position = 'relative'; game.style.zIndex = '1';
  game.parentElement.insertBefore(cv, game);

  const renderer = new T.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NeutralToneMapping; renderer.toneMappingExposure = 1.1;

  // ---- light: only the aeroplane is lit; every facet of the world carries its own flat colour ----
  const scene = new T.Scene();
  scene.environment = new T.PMREMGenerator(renderer).fromScene(new T.RoomEnvironment(), 0.02).texture;
  scene.environmentIntensity = 0.4;
  scene.add(new T.HemisphereLight('#EAF3FF', '#6E7A4A', 1.0));
  const sun = new T.DirectionalLight('#FFF6E8', 2.4); scene.add(sun, sun.target);

  // The sky: the original's own gradient, plain, fixed to the screen.
  {
    const c = document.createElement('canvas'); c.width = 4; c.height = 512; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#1E90FF'); gr.addColorStop(0.7, '#6FB8FF'); gr.addColorStop(1, '#C3E5FF');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; scene.background = t;
  }

  let seed = 23; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); const R = (a, b) => a + (b - a) * rnd();
  const flat = (color, extra) => new T.MeshBasicMaterial(Object.assign({ color, fog: false }, extra));

  // ---- facets ----
  // One flat colour per triangle, chosen from a ramp by how squarely it faces the light (top left): a poster, not a
  // gradient. Returns the triangles moved by `mat`, ready to be merged with the rest of their layer into one mesh.
  const LIGHT = new T.Vector3(-0.62, 0.62, 0.48).normalize();
  function facets(geo, ramp, mat) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (mat) g.applyMatrix4(mat);
    const p = g.attributes.position, col = [], a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), n = new T.Vector3(), cc = new T.Color();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      n.subVectors(c, b).cross(a.sub(b)).normalize(); if (n.z < 0) n.negate();
      const lit = Math.max(0, Math.min(0.999, Math.pow(Math.max(0, n.dot(LIGHT) + 0.15) / 1.15, 1.6)));
      cc.set(ramp[Math.floor(lit * ramp.length)]); for (let k = 0; k < 3; k++) col.push(cc.r, cc.g, cc.b);
    }
    return { pos: p.array, col };
  }
  // Many faceted pieces as ONE mesh: a forest of a thousand trees is one draw, not a thousand.
  function merged(parts) {
    let n = 0; for (const q of parts) n += q.pos.length;
    const pos = new Float32Array(n), col = new Float32Array(n); let o = 0;
    for (const q of parts) { pos.set(q.pos, o); col.set(q.col, o); o += q.pos.length; }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.computeBoundingSphere(); return g;
  }
  const facetMat = flat('#ffffff', { vertexColors: true, side: T.DoubleSide });
  const at = (x, y, z, sx = 1, sy = 1, sz = 1) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion(), new T.Vector3(sx, sy, sz));

  // A rock: a coarse icosahedron, pushed about, stood on its flat base.
  function rock(x, h, w, ramp, z) {
    const geo = new T.IcosahedronGeometry(1, 1), p = geo.attributes.position, v = new T.Vector3(), lean = R(-0.25, 0.25), ph = rnd() * 9;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const k = 1 + 0.18 * Math.sin(v.x * 3.1 + ph) * Math.cos(v.z * 2.3 + ph) + 0.1 * Math.sin(v.y * 4 + ph);
      v.multiplyScalar(k); v.x += lean * Math.max(0, v.y); p.setXYZ(i, v.x * w / 2, Math.max(0, v.y) * h, v.z * w * 0.3);
    }
    return facets(geo, ramp, at(x, 0, z));
  }
  const GREYS = [['#5E646C', '#787F88', '#959BA3', '#B4B9BF', '#D3D6DA'], ['#5B6470', '#76808C', '#939CA6', '#B3BAC2', '#D2D7DD'], ['#646059', '#7F7A72', '#9C978F', '#BAB6AF', '#D7D4CF']];
  const PALE = ['#9AAAB9', '#AAB8C5', '#BAC6D1', '#CAD4DD', '#DCE3EA'];
  const GREENS = [['#2E6E3A', '#3D8A45', '#4FA352', '#68BA60', '#86CF73'], ['#2A6640', '#38804B', '#4A9A57', '#62B067', '#7FC678']];
  const CLOUD = ['#DCE5EF', '#EAF0F6', '#F4F7FB', '#FFFFFF'];

  // ---- the layers ----
  // Each is a group scaled by its speed s and slid so that it moves s as far as the field does; inside it, one tile
  // of scenery TILE wide, laid three times end to end and leapfrogged as the camera passes, so it never ends. A tile's
  // own pattern repeats exactly at its edges (whole periods only), so the seam is nowhere to be seen.
  const SINK = 0.12;     // how fast the backdrop falls away as the aeroplane climbs, against the field's 1.0
  const SLING_Y = 6.6;   // the aeroplane's height in the sling, where the backdrop sits at its own height
  const layers = [];
  function layer(s, base, z, tile, parts, field) {
    const g = new T.Group(); g.scale.setScalar(s); g.position.z = z; scene.add(g);
    const geo = merged(parts), copies = [];
    for (let k = 0; k < 3; k++) {
      const c = new T.Group(); c.add(new T.Mesh(geo, facetMat));
      // its own stretch of field below the mountains' feet, deep enough to fill a tall phone frame on the way up
      if (field) { const f = new T.Mesh(new T.PlaneGeometry(tile + 2, 4000), flat(field)); f.position.set(tile / 2, -2000, field === '#3BB34A' ? 14 : 10); c.add(f); }
      g.add(c); copies.push(c);
    }
    layers.push({ g, s, base, tile, copies });
  }

  // the far range: palest, smallest, nearly still
  {
    const TILE = 1000, parts = [];
    for (let x = R(0, 20); x < TILE; x += R(35, 70)) parts.push(rock(x, R(35, 70), R(60, 110), PALE, R(-30, -10)));
    layer(0.07, 5.2, -500, TILE, parts, '#7FC07A');
  }
  // the main range, greys, and the forest at its feet
  const ratio = {};
  {
    const TILE = 690, MH = 30, parts = [], hs = [];
    for (let x = R(0, 10); x < TILE; x += R(26, 46)) {
      const tall = Math.sin(x / TILE * Math.PI * 4) > 0.2 ? 1 : 0.6, h = MH * tall * R(0.8, 1.2); hs.push(h);
      parts.push(rock(x, h, MH * R(1.3, 1.9), GREYS[Math.floor(rnd() * 3)], R(-12, 0)));
    }
    // THE FOREST (owner): dense, three overlapping rows, the trees 0.55 to 1.45 of the forest's height, which is 27% of
    // the mountains' average (owner: 25-30%), no trunks, each foot flush on the ground.
    ratio.mountainAvg = hs.reduce((a, b) => a + b) / hs.length; ratio.tree = 0.27 * ratio.mountainAvg;
    const treeH = ratio.tree, th = [];
    for (let row = 0; row < 3; row++) for (let x = R(0, 0.3) * treeH; x < TILE; x += R(0.16, 0.32) * treeH) {
      const h = treeH * (0.55 + 0.9 * Math.pow(rnd(), 1.15)) * (row === 2 ? 0.92 : 1), ramp = GREENS[Math.floor(rnd() * 2)], kind = rnd();
      th.push(h);
      const geo = kind < 0.55 ? new T.ConeGeometry(h * 0.32, h * 0.9, 5 + Math.floor(rnd() * 2), 1) : new T.IcosahedronGeometry(h * 0.42, 0);
      if (kind >= 0.55) geo.scale(1, 1.15, 0.8);
      geo.rotateY(rnd() * 3); geo.computeBoundingBox(); geo.translate(0, -geo.boundingBox.min.y, 0);
      parts.push(facets(geo, ramp, at(x, 0, 30 - (2 - row) * 6 + R(-1, 1))));
    }
    ratio.trees = th.length; ratio.treeAvg = th.reduce((a, b) => a + b) / th.length;
    layer(0.16, 4.0, -300, TILE, parts, '#3BB34A');
  }

  // ---- the clouds: faceted, white, sparse, strewn up the sky as the painted game strewed them ----
  // Slots on a grid in the clouds' own layer, a quarter of them left empty, each a hash of its cell, so the same
  // sky comes back whenever the camera does; a small pool of cloud meshes is dealt out to the slots in view.
  const CL = { s: 0.1, col: 230, row: 120, base: 55, top: 1400 };
  const cloudKinds = [];
  for (let k = 0; k < 6; k++) {
    const parts = [], w = R(30, 55);
    for (let j = 0; j < 5; j++) {
      const r = w * R(0.18, 0.3) * (j === 2 ? 1.4 : 1);
      parts.push(facets(new T.IcosahedronGeometry(r, 0), CLOUD, at((j - 2) * w * 0.2, Math.abs(j - 2) * -r * 0.25, 0, 1, 0.75, 1)));
    }
    cloudKinds.push(merged(parts));
  }
  const clouds = new T.Group(); clouds.scale.setScalar(CL.s); clouds.position.z = -450; scene.add(clouds);
  const cloudPool = [];
  for (let i = 0; i < 24; i++) { const m = new T.Mesh(cloudKinds[i % 6], facetMat); m.visible = false; clouds.add(m); cloudPool.push(m); }
  const hash = (a, b) => { let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; };
  function placeClouds(cx, cy, halfW, halfH) {
    // the clouds' own coordinates of the frame's middle are the camera's own; the frame spans halfW / s either side
    clouds.position.set(cx * (1 - CL.s), cy * (1 - CL.s), -450);
    const mx = halfW / CL.s + 40, my = halfH / CL.s + 40;
    let used = 0;
    for (let ci = Math.floor((cx - mx) / CL.col); ci <= Math.ceil((cx + mx) / CL.col); ci++) {
      for (let ri = Math.max(0, Math.floor((cy - my - CL.base) / CL.row)); ri <= Math.ceil((cy + my - CL.base) / CL.row); ri++) {
        const wy = CL.base + ri * CL.row; if (wy > CL.top) continue;
        const h = hash(ci, ri); if ((h & 3) === 0 || used >= cloudPool.length) continue;
        const m = cloudPool[used++];
        m.geometry = cloudKinds[(h >>> 20) % 6];
        m.position.set(ci * CL.col + (((h >>> 4) & 255) / 255 - 0.5) * CL.col * 0.8, wy + (((h >>> 12) & 255) / 255 - 0.5) * CL.row * 0.6, ((h >>> 8) & 7) - 4);
        const sc = 0.8 + ((h >>> 24) & 255) / 255 * 0.5; m.scale.set((h & 4) ? -sc : sc, sc, sc);
        m.visible = true;
      }
    }
    for (let i = used; i < cloudPool.length; i++) cloudPool[i].visible = false;
  }

  // ---- the field the aeroplane flies over and lands on: plain green, a lighter lip where it meets the far field ----
  const near = new T.Group(); scene.add(near);
  { const f = new T.Mesh(new T.PlaneGeometry(4000, 4000), flat('#3BB34A')); f.position.set(0, -2000, 0); near.add(f);
    const lip = new T.Mesh(new T.PlaneGeometry(4000, 0.35), flat('#57C25A')); lip.position.set(0, -0.17, 0.1); near.add(lip); }
  // the aeroplane's shadow on it, as the painted game had: a soft dark lozenge that fades as it climbs
  const planeShadow = new T.Mesh(new T.CircleGeometry(1, 16), flat('#1C8A30', { transparent: true, depthWrite: false }));
  planeShadow.position.z = 0.15; scene.add(planeShadow);

  // ---- the slingshot ----
  const PIVOT_H = M.CFG.PIVOT_H, PLANE_LEN = M.CFG.PLANE_LEN;
  const WOOD = ['#5C3A1E', '#744A26', '#8C5B2F', '#A56E3A', '#BC8247'];
  const sling = new T.Group(); scene.add(sling);
  {
    const SPREAD = 1.05, parts = [];
    const limb = (a, b, r0, r1, z) => {
      const A = new T.Vector3(a[0], a[1], z), B = new T.Vector3(b[0], b[1], z), d = B.clone().sub(A);
      const geo = new T.CylinderGeometry(r1, r0, d.length(), 6, 1); geo.translate(0, d.length() / 2, 0);
      geo.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize())); geo.translate(A.x, A.y, A.z);
      parts.push(facets(geo, WOOD));
    };
    // the stem, and the arms branching just above the screw, one a little in front and one behind
    limb([0, -0.2], [0, PIVOT_H + 0.4], 0.55, 0.4, 0);
    limb([0, PIVOT_H + 0.3], [SPREAD, PIVOT_H + 2.6], 0.38, 0.27, 0.6);
    limb([0, PIVOT_H + 0.3], [-SPREAD, PIVOT_H + 2.6], 0.38, 0.27, -0.6);
    // the grass mound it is planted in
    parts.push(facets(new T.IcosahedronGeometry(1.6, 0).scale(1.6, 0.55, 1), ['#2E8B3A', '#3BA046', '#4FB552', '#69C766'], at(0, -0.15, 0.5)));
    sling.add(new T.Mesh(merged(parts), facetMat));
    const sh = new T.Mesh(new T.CircleGeometry(1, 8), flat('#1C8A30')); sh.scale.set(3.4, 0.35, 1); sh.position.set(-0.8, -0.18, 0.15); sling.add(sh);
  }
  // THE BAND: drawn along +x from the screw, then turned to the aim. Rebuilt only when its length changes.
  const BAND_Z = 3, R0 = 0.3, R1 = 0.66;
  const band = new T.Mesh(new T.BufferGeometry(), flat('#F47A2A')); band.position.z = BAND_Z; scene.add(band);
  const screw = new T.Mesh(new T.CircleGeometry(0.17, 24), flat('#B8BCC2')); screw.position.z = BAND_Z + 0.05; scene.add(screw);
  const slot = new T.Mesh(new T.PlaneGeometry(0.3, 0.035), flat('#2A2D33')); slot.position.z = BAND_Z + 0.1; slot.rotation.z = 0.9; scene.add(slot);
  let bandLen = -1;
  function setBand(px, py, L, ang, r1) {
    L = Math.round(L * 50) / 50;
    if (L !== bandLen) {
      bandLen = L;
      const s = new T.Shape();
      s.moveTo(0, R0); s.lineTo(L - r1 * 0.55, r1);
      s.bezierCurveTo(L + r1 * 0.15, r1, L + r1 * 0.15, -r1, L - r1 * 0.55, -r1);   // the wide end, rounded
      s.lineTo(0, -R0); s.absarc(0, 0, R0, -Math.PI / 2, Math.PI / 2, true);       // the small end, round the screw
      band.geometry.dispose(); band.geometry = new T.ShapeGeometry(s, 24);
    }
    band.position.set(px, py, BAND_Z); band.rotation.z = ang;
    screw.position.set(px, py, BAND_Z + 0.05); slot.position.set(px, py, BAND_Z + 0.1);
  }

  // ---- the aeroplanes ----
  const KEYS = ['Lacerta', 'Vesper', 'Tsunami', 'Sirocco', 'Zephyr', 'Tempest'];
  const PLANES = {};
  const holder = new T.Group(); scene.add(holder);
  const FIN = {
    chrome: () => new T.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.1 }),
    glass: () => new T.MeshPhysicalMaterial({ color: '#8CC8F0', roughness: 0.03, transparent: true, opacity: 0.62, clearcoat: 1, depthWrite: false, envMapIntensity: 2.5 }),
    tyre: () => new T.MeshStandardMaterial({ color: '#2B2F36', roughness: 0.7 }),
    grille: () => new T.MeshStandardMaterial({ color: '#1E2C44', metalness: 0.6, roughness: 0.35 }),
  };
  const finCache = {};
  const finishFor = (name, fallback) => {
    const n = name.replace(/\.\d+$/, '');
    return finCache[n] || (finCache[n] = n.startsWith('paint ') ? new T.MeshPhysicalMaterial({ color: n.slice(6), roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 })
      : (FIN[n] ? FIN[n]() : fallback));
  };
  const loader = new T.GLTFLoader(); loader.setMeshoptDecoder(T.MeshoptDecoder);
  let left = KEYS.length;
  for (const key of KEYS) {
    loader.load(`./assets/planes/${key.toLowerCase()}.glb`, (g) => {
      const model = g.scene;
      model.traverse(o => { if (o.isMesh) { o.material = finishFor(o.material.name, o.material); o.castShadow = true; o.receiveShadow = true; } });
      // Scaled to the game's length, nose to spinner, and hung so its wheels are GEAR_H under the point play.js
      // treats as its centre: the same anchor the sprite used, so it sits in the sling and on the grass alike.
      const box = new T.Box3().setFromObject(model), size = box.getSize(new T.Vector3());
      const k = PLANE_LEN / size.x; model.scale.setScalar(k);
      const gear = M.build(key).gearH;
      model.position.set(-(box.min.x + size.x / 2) * k, -(box.min.y * k + gear) - 0.05, -((box.min.z + box.max.z) / 2) * k);
      const pose = new T.Group(); pose.add(model); pose.visible = false; holder.add(pose);
      PLANES[key] = { pose, model, prop: model.getObjectByName('prop'), aspect: size.x / size.y, box, k };
      if (--left === 0) whenLoaded();
    }, undefined, (e) => fail(e));
  }

  // ---- the camera: orthographic, side on, and nothing else ----
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 3000);
  const fq = new URLSearchParams(location.search); if (!fq.has('ao')) fq.set('ao', '0');   // (a flat lens: no soft dark where things meet)
  let finish = null, size = { w: 0, h: 0, pr: 0 }, spin = 0, lastNow = 0;

  function resize(W, H, scale) {
    const pr = Math.min(PHONE ? 1.5 : 2, scale || 1);
    if (W === size.w && H === size.h && pr === size.pr) return;
    size = { w: W, h: H, pr };
    renderer.setPixelRatio(pr); renderer.setSize(W, H, false);
    if (!finish) { finish = makeFinish({ renderer, scene, cam, phone: PHONE, q: fq }); finish.time({ warm: 0, night: 0, am: false }); finish.night(0); if (finish.grade) finish.grade.uniforms.sat.value = 1.0; }
    else finish.setSize(W, H, pr);
  }

  function render(v) {
    if (!API.ready) return;
    resize(v.W, v.H, v.scale);
    // The frame play.js draws, exactly: its middle in world metres, and its half width and height.
    const hw = v.W / (2 * v.ppm), hh = v.H / (2 * v.ppm);
    const cx = v.camX + hw, cy = v.camY + (v.groundY - v.H / 2) / v.ppm;
    cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh; cam.position.set(cx, cy, 1000); cam.updateProjectionMatrix();

    // The layers: each slides s as far as the field, and sinks together as the aeroplane climbs; their tiles leapfrog.
    // Below the sling's height it eases to rest on the horizon instead, so on the grass the forest still stands
    // clear of the field (a smooth floor: no kink in its motion as the aeroplane comes down).
    const a = (v.pose ? v.pose.y : SLING_Y) - SLING_Y, rise = (a + Math.sqrt(a * a + 16)) / 2 - 2;
    for (const L of layers) {
      L.g.position.x = cx * (1 - L.s);
      L.g.position.y = L.base + rise * (1 - SINK);
      const k0 = Math.floor(cx / L.tile);
      L.copies.forEach((c, i) => { c.position.x = (k0 - 1 + i) * L.tile; });
    }
    placeClouds(cx, cy, hw, hh);
    near.position.x = cx;

    sling.position.set(v.pivot.x, 0, 0);
    const now = performance.now(), dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0; lastNow = now;
    for (const key of KEYS) PLANES[key].pose.visible = false;
    const P = PLANES[v.key];
    planeShadow.visible = false;
    if (P && v.pose) {
      P.pose.visible = true; P.pose.position.set(v.pose.x, v.pose.y, 2); P.pose.rotation.set(0, 0, v.pose.th);
      // (for the test harness: the lowest point of the drawn aeroplane, from its real geometry)
      if (window.__tailwindProbe) { P.pose.updateMatrixWorld(true); window.__w3last = { low: new T.Box3().setFromObject(P.model).min.y }; }
      spin += dt * (v.flying ? 42 : 0); if (P.prop) P.prop.rotation.x = spin;
      const fade = 1 - Math.min(1, Math.max(0, v.pose.y - 1) / 10);
      if (fade > 0.02 && !v.aiming) {
        planeShadow.visible = true; planeShadow.material.opacity = 0.8 * fade;
        planeShadow.position.set(v.pose.x, -0.18, 0.15); planeShadow.scale.set(PLANE_LEN * (0.42 - 0.12 * (1 - fade)), 0.3, 1);
      }
    }
    // The band: from the screw out past the aeroplane's tail while it is in the sling; short and slack once it has gone.
    if (v.aiming && v.pose) {
      const dx = v.pose.x - v.pivot.x, dy = v.pose.y - v.pivot.y;
      setBand(v.pivot.x, v.pivot.y, Math.hypot(dx, dy) + PLANE_LEN / 2, Math.atan2(dy, dx), R1);
    } else setBand(v.pivot.x, v.pivot.y, 2.1, Math.atan2(-1.9, -0.9), R1);

    sun.position.set(cx - 300, cy + 200, 400); sun.target.position.set(cx, cy, 0);
    finish.render(scene, cam);
  }

  // The pick screen's cards: each aeroplane photographed side on, cut to its own outline, in place of the painting.
  function portraits() {
    const pr = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    pr.outputColorSpace = T.SRGBColorSpace; pr.toneMapping = T.NeutralToneMapping; pr.toneMappingExposure = 1.2; pr.setClearColor(0x000000, 0);
    const st = new T.Scene();
    st.environment = new T.PMREMGenerator(pr).fromScene(new T.RoomEnvironment(), 0.02).texture; st.environmentIntensity = 0.5;
    st.add(new T.HemisphereLight('#EEF2F6', '#7A746A', 0.9));
    const key = new T.DirectionalLight('#FFF4E6', 2.6); key.position.set(-30, 40, 45); st.add(key);
    for (const name of KEYS) {
      const P = PLANES[name], m = P.model.clone(true); m.position.set(0, 0, 0); m.scale.setScalar(1);
      const box = new T.Box3().setFromObject(m), s = box.getSize(new T.Vector3()), c = box.getCenter(new T.Vector3());
      const w = 600, h = Math.round(w * s.y / s.x);
      pr.setSize(w, h, false);
      const oc = new T.OrthographicCamera(-s.x / 2, s.x / 2, s.y / 2, -s.y / 2, 0.1, 100); oc.position.set(c.x, c.y, c.z + 30); oc.lookAt(c);
      st.add(m); pr.render(st, oc); st.remove(m);
      const img = new Image(); img.decoding = 'async';
      img.onload = () => window.dispatchEvent(new CustomEvent('tailwind-art', { detail: { key: name, img } }));
      img.src = pr.domElement.toDataURL('image/png');
    }
    pr.dispose(); pr.forceContextLoss && pr.forceContextLoss();
  }

  function whenLoaded() {
    API.render = render;
    API.measure = ratio;   // (for the test harness: the forest against the mountains)
    API.ready = true;
    try { portraits(); } catch (e) {}
    window.dispatchEvent(new Event('tailwind-3d-ready'));
  }
}
