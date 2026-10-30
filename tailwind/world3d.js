/* TAILWIND — the world in 3D (owner, 2026-10-30: "update the planes to be a little nicer and then make it strictly
   side scrolling", in Hummingham's look).

   play.js still runs the game: the flight model, the three taps, the camera rules, the read-outs and the pick
   screen. This draws the world UNDER its canvas — sky, valley, slingshot, aeroplane — from the same camera, and
   play.js stops painting those itself once this says it is ready.

   STRICTLY SIDE ON. The camera never turns: it looks straight down -z at the plane the aeroplane flies in (z = 0)
   and only slides and dollies. Its distance is chosen so that something at z = 0 lands on exactly the pixel
   play.js would have drawn it on — sx = (x - camX) * ppm, sy = groundY - (y - camY) * ppm — so every framing
   rule play.js has (the chase, the zooms, the backstops) holds unchanged, and the scenery behind gets real depth
   from the same move. The horizon is the camera's eye level.

   THE LOOK IS HUMMINGHAM'S, BY DAY: its light, haze and cartoon clouds (citysky.js), its finishing pass
   (finish.js, copied), its toy palette, lollipop trees and smooth turned shapes. The valley's rock pillars are
   Tailwind's karst made as Hummingham would make them. The six aeroplanes are tools/tailwind/fleet.py.

   THE SLINGSHOT IS A REAL Y. Its prongs open toward and away from the camera, so side on it reads as the old post
   with the band hung off one point (play.js's pivot), and the aeroplane flies OUT BETWEEN the prongs instead of
   through a trunk. The two bands run from the prongs to a pouch behind the tail.

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
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.NeutralToneMapping; renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;      // (r186 folds the soft kind into this one; radius softens it)

  // ---- light and air, as Hummingham's day (town.html, citysky.js) ----
  const HAZE = '#A9D6F4';
  const scene = new T.Scene();
  scene.fog = new T.Fog(HAZE, 380, 4200);
  scene.environment = new T.PMREMGenerator(renderer).fromScene(new T.RoomEnvironment(), 0.02).texture;
  scene.environmentIntensity = 0.45;
  scene.add(new T.HemisphereLight('#EEF2F6', '#7A746A', 0.9));
  const sun = new T.DirectionalLight('#FFF4E6', 2.6);
  sun.castShadow = true; sun.shadow.mapSize.set(PHONE ? 1024 : 2048, PHONE ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 300 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const SUN_OFF = new T.Vector3(-55, 120, 70);   // high and a little toward the camera: shadows fall behind, on grass we can see

  // The sky behind everything is screen-fixed: the camera never tilts, so its eye level — the horizon — is always the
  // middle of the frame, and one vertical gradient from Hummingham's day blue down to the haze is the whole sky.
  {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#2C86E6'); gr.addColorStop(0.32, '#5AA9EE'); gr.addColorStop(0.5, HAZE); gr.addColorStop(1, HAZE);
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; scene.background = t;
  }

  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const TOY = { red: '#FF3A2F', blue: '#45B6FF', yellow: '#FFCD1F', teal: '#10BEC2', orange: '#FF8526', green: '#22A846', cream: '#FCFBF8' };
  const enamel = (c, rough = 0.3, coat = 0.8) => new T.MeshPhysicalMaterial({ color: c, roughness: rough, clearcoat: coat, clearcoatRoughness: 0.12 });
  const shadowy = (o) => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

  // ---- the field ----
  function grassTex() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#4A9036'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * 256, y = rnd() * 256, r = 2 + rnd() * 8;
      g.fillStyle = rnd() < 0.5 ? 'rgba(62,128,40,0.22)' : 'rgba(120,190,78,0.18)';
      for (const [dx, dy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) { g.beginPath(); g.ellipse(x + dx, y + dy, r * 1.6, r, 0, 0, 7); g.fill(); }
    }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(600, 220);
    t.colorSpace = T.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
  }
  const ground = new T.Mesh(new T.PlaneGeometry(24000, 8800), new T.MeshStandardMaterial({ map: grassTex(), roughness: 0.92 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(5000, 0, -3800); ground.receiveShadow = true; scene.add(ground);

  // ---- the valley: rock pillars made the Hummingham way, lollipop trees, cartoon clouds ----
  // A turned lathe profile: porcelain thumb, rounded crown, a green cap draping down it in soft drips.
  const rock = enamel('#F4EEE4', 0.4, 0.5);
  const caps = [TOY.green, '#3CC060', '#2E9E4A'].map(c => enamel(c, 0.45, 0.35));
  const prof = (r, h, t) => { const b = r * (0.5 + 0.375 * Math.pow(1 - Math.min(t, 0.82) / 0.82, 0.8) + 0.12);
    if (t <= 0.82) return b; const u = (t - 0.82) / 0.18; return b * Math.sqrt(Math.max(0, 1 - u * u)); };
  function pillar(x, z, h, r) {
    const g = new T.Group(), pts = [];
    for (let i = 0; i <= 28; i++) { const t = i / 28; pts.push(new T.Vector2(prof(r, h, t), t * h)); }
    g.add(new T.Mesh(new T.LatheGeometry(pts, 40), rock));
    const t0 = 0.62 + rnd() * 0.12, cp = [];
    for (let i = 0; i <= 16; i++) { const t = t0 + (1 - t0) * i / 16; cp.push(new T.Vector2(prof(r, h, t) * 1.035 + 0.6, t * h + 0.5)); }
    const capG = new T.LatheGeometry(cp, 40), p = capG.attributes.position, ph = rnd() * 6, y0 = t0 * h;
    for (let i = 0; i < p.count; i++) {
      const ang = Math.atan2(p.getX(i), p.getZ(i)), f = (p.getY(i) - y0) / (h - y0);
      p.setY(i, p.getY(i) - (Math.max(0, Math.sin(ang * 7 + ph)) ** 3 * 0.10 + Math.sin(ang * 3 + ph) * 0.03) * h * Math.pow(1 - f, 3));
    }
    capG.computeVertexNormals();
    const cap = new T.Mesh(capG, caps[Math.floor(rnd() * 3)]); cap.material.side = T.DoubleSide; g.add(cap);
    g.position.set(x, 0, z); g.rotation.y = rnd() * 6; scene.add(g);
  }
  for (let x = -700; x < 7000; x += 120 + rnd() * 160) pillar(x, -950 - rnd() * 1100, 190 + rnd() * 300, 55 + rnd() * 50);

  // Lollipop trees (Hummingham plants them so): a glossy round crown on a slim trunk, in a treeline well back across
  // the field. A nearer row was tried and loomed over the close shots at the sling and the landing, hiding the plane.
  {
    const crownG = new T.SphereGeometry(1, 16, 12), trunkG = new T.CylinderGeometry(0.12, 0.16, 1, 8);
    const spots = [];
    for (let x = -500; x < 7000; x += 3 + rnd() * 5) spots.push([x, -240 - rnd() * 220]);
    const N = spots.length;
    const crowns = new T.InstancedMesh(crownG, enamel('#ffffff', 0.45, 0.3), N);
    const trunks = new T.InstancedMesh(trunkG, new T.MeshStandardMaterial({ color: '#9A6A44', roughness: 0.7 }), N);
    const o = new T.Object3D(), c = new T.Color(), greens = ['#22A846', '#3CC060', '#2E9E4A', '#7CCB45'];
    spots.forEach(([x, z], i) => {
      const s = 4 + rnd() * 4.5, th = s * 1.3;
      o.position.set(x, th * 0.5, z); o.scale.set(s * 0.9, th, s * 0.9); o.updateMatrix(); trunks.setMatrixAt(i, o.matrix);
      o.position.set(x, th + s * 0.8, z); o.scale.set(s, s * 1.05, s); o.updateMatrix(); crowns.setMatrixAt(i, o.matrix);
      crowns.setColorAt(i, c.set(rnd() < 0.1 ? TOY.yellow : greens[Math.floor(rnd() * 4)]));
    });
    crowns.receiveShadow = trunks.receiveShadow = true; scene.add(crowns, trunks);
  }

  // Hummingham's cartoon clouds (citysky.js): loose clusters of puffs with a soft blue-grey underside, crisp edges,
  // on cards that face the camera. Strewn through the height the flights reach, so a climb passes them.
  {
    let ps = 41; const pr = () => (ps = (ps * 16807) % 2147483647) / 2147483647;
    const mats = [0, 1, 2, 3].map(() => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
      const n = 9 + Math.floor(pr() * 6), spread = 0.7 + pr() * 0.25; g.fillStyle = '#FFFFFF';
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n * 2 - 1, mid = 1 - u * u;
        const x = 256 + u * 200 * spread + (pr() - 0.5) * 30, y = 140 + (pr() - 0.5) * 34 - mid * 22, rad = 26 + mid * 52 * (0.7 + pr() * 0.5);
        g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
        if (pr() < 0.6) { g.beginPath(); g.arc(x + (pr() - 0.5) * rad, y + rad * (0.35 + pr() * 0.3), rad * (0.45 + pr() * 0.25), 0, 7); g.fill(); }
      }
      g.globalCompositeOperation = 'source-atop';
      const sh = g.createLinearGradient(0, 70, 0, 236); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(206,222,240,0.45)'); sh.addColorStop(1, 'rgba(176,198,226,0.85)');
      g.fillStyle = sh; g.fillRect(0, 0, 512, 256);
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
      return new T.MeshBasicMaterial({ map: t, transparent: true, fog: false, depthWrite: false });
    });
    const card = new T.PlaneGeometry(1, 0.5);
    for (let x = -300; x < 7000; x += 55 + rnd() * 70) {
      const y = 55 + Math.pow(rnd(), 1.4) * 600, z = -150 - rnd() * 380, w = 40 + rnd() * 70 + z * -0.08;
      const m = new T.Mesh(card, mats[Math.floor(rnd() * 4)]); m.position.set(x, y, z); m.scale.set(w * (rnd() < 0.5 ? -1 : 1), w, 1);
      m.renderOrder = -1; scene.add(m);
    }
  }

  // ---- the slingshot ----
  const PIVOT_H = M.CFG.PIVOT_H, PLANE_LEN = M.CFG.PLANE_LEN;
  const PRONG = 3.1;                                      // how far out each prong is at the pivot's height
  const sling = new T.Group(); scene.add(sling);
  const post = enamel(TOY.blue, 0.3, 0.9), rim = enamel(TOY.cream, 0.3, 0.9);
  const chrome = new T.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.12 });
  function rod(a, b, r0, r1, m) {
    const A = new T.Vector3(...a), B = new T.Vector3(...b), d = B.clone().sub(A);
    const o = new T.Mesh(new T.CylinderGeometry(r1, r0, d.length(), 24), m);
    o.position.copy(A).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); sling.add(o); return o;
  }
  const FORK = 4.4, TOP = 10.1, OUT = PRONG * (TOP - FORK) / (PIVOT_H - FORK);
  rod([0, 0, 0], [0, FORK + 0.2, 0], 0.42, 0.34, post);
  { const b = new T.Mesh(new T.CylinderGeometry(1.15, 1.3, 0.4, 40), rim); b.position.y = 0.2; sling.add(b);
    const c = new T.Mesh(new T.TorusGeometry(0.38, 0.12, 12, 40), rim); c.rotation.x = Math.PI / 2; c.position.y = FORK; sling.add(c); }
  for (const s of [-1, 1]) {
    rod([0, FORK, 0], [0, TOP, s * OUT], 0.27, 0.2, post);
    const k = new T.Mesh(new T.SphereGeometry(0.3, 20, 14), rim); k.position.set(0, TOP, s * OUT); sling.add(k);
    const n = new T.Mesh(new T.SphereGeometry(0.2, 16, 12), chrome); n.position.set(0, PIVOT_H, s * PRONG); sling.add(n);
  }
  shadowy(sling);

  // The bands: two ribbons, prong to pouch, broad at the pouch (play.js's BAND_T0/T1 in world metres), and the pouch.
  const T0 = 2.8 * PIVOT_H / 140, T1 = 5.4 * PIVOT_H / 140;
  const bandMat = new T.MeshStandardMaterial({ color: TOY.orange, roughness: 0.5, side: T.DoubleSide });
  const ribbons = [-1, 1].map(() => {
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(12), 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    const m = new T.Mesh(g, bandMat); m.frustumCulled = false; m.castShadow = true; scene.add(m); return m;
  });
  const pouch = new T.Mesh(new T.BoxGeometry(0.5, 1, 1), enamel('#E2671C', 0.45, 0.3)); pouch.castShadow = true; scene.add(pouch);
  function setBands(px, py, ex, ey) {
    const dx = ex - px, dy = ey - py, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    ribbons.forEach((m, i) => {
      const s = i ? 1 : -1, a = m.geometry.attributes.position, zA = s * PRONG, zB = s * 0.55;
      a.setXYZ(0, px + nx * T0, py + ny * T0, zA); a.setXYZ(1, ex + nx * T1, ey + ny * T1, zB);
      a.setXYZ(2, ex - nx * T1, ey - ny * T1, zB); a.setXYZ(3, px - nx * T0, py - ny * T0, zA);
      a.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere();
    });
    pouch.position.set(ex, ey, 0); pouch.rotation.set(0, 0, Math.atan2(dy, dx)); pouch.scale.set(0.5, T1 * 2.4, 1.3);
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

  // ---- the camera: side on, and nothing else ----
  const FOV = 30, TAN = Math.tan(T.MathUtils.degToRad(FOV) / 2);
  const cam = new T.PerspectiveCamera(FOV, 1, 0.5, 9000);
  let finish = null, size = { w: 0, h: 0, pr: 0 }, spin = 0, lastNow = 0;

  function resize(W, H, scale) {
    const pr = Math.min(PHONE ? 1.5 : 2, scale || 1);
    if (W === size.w && H === size.h && pr === size.pr) return;
    size = { w: W, h: H, pr };
    renderer.setPixelRatio(pr); renderer.setSize(W, H, false);
    cam.aspect = W / H; cam.updateProjectionMatrix();
    if (!finish) { finish = makeFinish({ renderer, scene, cam, phone: PHONE, q: Q }); finish.time({ warm: 0, night: 0, am: false }); finish.night(0); }
    else finish.setSize(W, H, pr);
  }

  function render(v) {
    if (!API.ready) return;
    resize(v.W, v.H, v.scale);
    // The pixel scale play.js draws at fixes how far off the camera stands; where it points fixes the rest.
    const D = v.H / (2 * v.ppm * TAN);
    cam.position.set(v.camX + v.W / (2 * v.ppm), v.camY + (v.groundY - v.H / 2) / v.ppm, D);
    cam.far = D + 6000; cam.updateProjectionMatrix();

    sling.position.set(v.pivot.x, 0, 0);
    const now = performance.now(), dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0; lastNow = now;
    for (const key of KEYS) PLANES[key].pose.visible = false;
    const P = PLANES[v.key];
    if (P && v.pose) {
      P.pose.visible = true; P.pose.position.set(v.pose.x, v.pose.y, 0); P.pose.rotation.set(0, 0, v.pose.th);
      spin += dt * (v.flying ? 42 : 0); if (P.prop) P.prop.rotation.x = spin;
    }
    // The bands: stretched to the pouch behind the tail while loading and aiming; slack off the prongs once it has gone.
    if (v.aiming && v.pose) {
      const dx = v.pose.x - v.pivot.x, dy = v.pose.y - v.pivot.y, L = Math.hypot(dx, dy) || 1;
      setBands(v.pivot.x, v.pivot.y, v.pose.x + dx / L * PLANE_LEN * 0.5, v.pose.y + dy / L * PLANE_LEN * 0.5);
    } else setBands(v.pivot.x, v.pivot.y, v.pivot.x - 0.9, v.pivot.y - 1.9);

    // The sun's shadow box rides with the aeroplane, or the slingshot before the launch.
    const fx = v.pose ? v.pose.x : v.pivot.x;
    sun.target.position.set(fx, 0, -3); sun.position.copy(sun.target.position).add(SUN_OFF);
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
    API.ready = true;
    try { portraits(); } catch (e) {}
    window.dispatchEvent(new Event('tailwind-3d-ready'));
  }
}
