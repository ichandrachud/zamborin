
// HARNESS: does anything of the world hide the course? From the camera's own place over points all along the course,
// render the course alone (red on black), then again with the world in front of it (the world black, keeping its
// cut-out shapes); a red pixel that turns black is course the world hides. This checks the drawn meshes, not the
// footprints the fill planned with, so it catches a banner or an arm that reaches further than its plan.
if (HARNESS) window.__cqHide = (step = 3, sabotage = false, show = false) => {
  const G = world.group; if (!G || !renderer || !level) return null;
  let sab = null;                                         // the null test: a post planted beside the course's middle, tall enough to hide it
  if (sabotage) { const f = level.pieces.filter((p) => p.t === 'flat')[Math.floor(level.pieces.filter((p) => p.t === 'flat').length / 2)]; sab = new Mesh(new BoxGeometry(1.5, 14, 1.5), new MeshStandardMaterial()); sab.position.set(f.x + (f.w || 4) / 2 + 1, f.y, f.z - 4); G.add(sab); }
  const gl = renderer.getContext(), Wd = renderer.domElement.width, Ht = renderer.domElement.height;
  const A = new Uint8Array(Wd * Ht * 4), B = new Uint8Array(Wd * Ht * 4);
  const red = new MeshBasicMaterial({ color: 0xFF0000, fog: false, toneMapped: false }), blacks = new Map(), saved = [];
  const inG = (o) => { for (let p = o; p; p = p.parent) if (p === G) return true; return false; };
  const blackOf = (m) => {
    if (!blacks.has(m.uuid)) {
      const b = new MeshBasicMaterial({ color: 0x000000, map: m.alphaTest ? m.map : null, alphaTest: m.alphaTest || 0, side: m.side, fog: false, toneMapped: false });
      if (m.customProgramCacheKey && m.customProgramCacheKey() === 'cq-cell') { b.onBeforeCompile = m.onBeforeCompile; b.customProgramCacheKey = () => 'cq-cell-black'; }   // a batched cut-out prints its own cell
      blacks.set(m.uuid, b);
    }
    return blacks.get(m.uuid);
  };
  scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isSprite)) return;
    saved.push([o, o.material, o.visible]);
    if (o === G) return;
    if (inG(o)) {
      const m = o.material;
      if (o.isPoints || o.isSprite || Array.isArray(m) || m.blending === AdditiveBlending || (m.transparent && !m.alphaTest)) o.visible = false;
      else o.material = blackOf(m);
    } else if (o.isMesh) o.material = red; else o.visible = false;
  });
  // The floor stays in both renders (course below it, such as a wind tower's foot, is not the world hiding anything).
  const above = G.children.filter((o) => !o.userData.ground), aboveVis = above.map((o) => o.visible);
  const bg = scene.background, fog = scene.fog, cc = new Color(), ca = renderer.getClearAlpha(), fov = camera.fov;
  renderer.getClearColor(cc); scene.background = null; scene.fog = null; renderer.setClearColor(0x000000, 1);
  const P = camParams(); camera.fov = P.fov; camera.updateProjectionMatrix();
  const pts = [];
  for (const p of level.pieces) {
    if (p.t === 'ramp') { for (let z = Math.max(p.z0, p.z1); z >= Math.min(p.z0, p.z1); z -= step) pts.push([p.x, p.y0 + (p.y1 - p.y0) * (z - p.z0) / ((p.z1 - p.z0) || 1), z]); continue; }
    if (p.x === undefined || typeof p.y !== 'number' || typeof p.z !== 'number') continue;
    const hd = p.t === 'round' ? p.ro : (p.d || 6) / 2, hw = p.t === 'round' ? p.ro : (p.w || 4) / 2;
    for (let z = p.z + hd; z >= p.z - hd - 0.01; z -= step) for (const dx of hw > 1.5 ? [-hw + 0.6, 0, hw - 0.6] : [0]) pts.push([p.x + dx, p.y, z]);
  }
  let worst = 0, worstAt = null, bad = 0, worstImg = null, worstView = null;
  const out = [], views = pts.map(([x, y, z]) => [x, y, z, [x, y + P.h, z + P.back], [x, y, z - P.ahead]]);
  for (const c of cqHighCams()) views.push([c.at.x, c.at.y, c.at.z, c.pos.toArray(), c.at.toArray()]);   // the climbing cameras too (all screen shapes; the one this screen uses is among them)
  for (const [x, y, z, cp, ca2] of views) {
    camera.position.set(...cp); camera.lookAt(...ca2);
    for (const o of above) o.visible = false; renderer.render(scene, camera); gl.readPixels(0, 0, Wd, Ht, gl.RGBA, gl.UNSIGNED_BYTE, A);
    above.forEach((o, i) => { o.visible = aboveVis[i]; }); renderer.render(scene, camera); gl.readPixels(0, 0, Wd, Ht, gl.RGBA, gl.UNSIGNED_BYTE, B);
    let n = 0, hid = 0;
    for (let i = 0; i < A.length; i += 12) if (A[i] > 128) { n++; if (B[i] < 128) hid++; }
    const f = n ? hid / n : 0;
    if (f > worst) { worst = f; worstAt = [+x.toFixed(1), +y.toFixed(1), +z.toFixed(1)]; worstView = [cp, ca2];
      if (show) { const d = new Uint8ClampedArray(Wd * Ht * 4); for (let r = 0; r < Ht; r++) for (let c = 0; c < Wd; c++) { const i = ((Ht - 1 - r) * Wd + c) * 4, o = (r * Wd + c) * 4, a = A[i] > 128, b = B[i] > 128; d[o] = a && !b ? 255 : a ? 90 : 0; d[o + 1] = a && !b ? 230 : a ? 90 : 0; d[o + 2] = a && !b ? 0 : a ? 90 : 0; d[o + 3] = 255; } worstImg = d; } }
    if (f > 0.002) { bad++; if (out.length < 8) out.push([+x.toFixed(1), +z.toFixed(1), +(f * 100).toFixed(2)]); }
  }
  for (const [o, m, v] of saved) { o.material = m; o.visible = v; }
  for (const o of above) o.visible = true;
  if (sab) G.remove(sab);
  for (const m of blacks.values()) m.dispose(); red.dispose();
  scene.background = bg; scene.fog = fog; renderer.setClearColor(cc, ca); camera.fov = fov; camera.updateProjectionMatrix();
  if (show && worstImg) {                                  // the worst view: yellow is course hidden, grey course seen; beside it, the view as drawn
    const [x, y, z] = worstAt, c1 = document.createElement('canvas'); c1.width = Wd; c1.height = Ht; c1.getContext('2d').putImageData(new ImageData(worstImg, Wd, Ht), 0, 0);
    camera.fov = P.fov; camera.updateProjectionMatrix(); camera.position.set(...worstView[0]); camera.lookAt(...worstView[1]); renderer.render(scene, camera);
    const c2 = document.createElement('canvas'); c2.width = Wd; c2.height = Ht; c2.getContext('2d').drawImage(renderer.domElement, 0, 0);
    camera.fov = fov; camera.updateProjectionMatrix();
    const box = document.createElement('div'); box.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;background:#000';
    for (const c of [c1, c2]) { c.style.cssText = 'width:50%;height:100%;object-fit:contain'; box.appendChild(c); }
    document.body.appendChild(box);
  }
  return { cams: views.length, bad, worstPct: +(worst * 100).toFixed(3), worstAt, first: out };
};
// HARNESS: what one frame of the world costs to draw, from the play camera where it stands now.
if (HARNESS) window.__cqCost = () => {
  if (!renderer) return null;
  const t0 = performance.now(); renderer.info.autoReset = false; renderer.info.reset(); renderer.render(scene, camera); const ms = performance.now() - t0;
  const i = renderer.info, G = world.group; let meshes = 0, ticks = 0; if (G) G.traverse((o) => { if (o.isMesh || o.isPoints) meshes++; });
  renderer.info.autoReset = true;
  return { calls: i.render.calls, tris: i.render.triangles, meshes, geos: i.memory.geometries, texs: i.memory.textures, ms: +ms.toFixed(1) };
};
if (HARNESS) window.__cqSnap = () => { updateCamera(0, true); return camera.position.toArray().map((v) => +v.toFixed(1)); };
// HARNESS: the same, split: the course and the rest with the world hidden, then everything.
if (HARNESS) window.__cqCostSplit = () => {
  const G = world.group; if (!renderer || !G) return null;
  const one = () => { renderer.info.autoReset = false; renderer.info.reset(); renderer.render(scene, camera); const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; renderer.info.autoReset = true; return r; };
  G.visible = false; const course = one(); G.visible = true; const all = one();
  return { course, world: { calls: all.calls - course.calls, tris: all.tris - course.tris }, shadows: renderer.shadowMap.enabled };
};
// HARNESS: which kinds of piece each level has (and its obstacles), to find a level that shows a given piece.
if (HARNESS) window.__cqKinds = () => LEVELS.map((L, i) => [i + 1, [...new Set(L.pieces.map((p) => p.t + (p.kind ? ':' + p.kind : '') + (p.pad ? ':' + p.pad : '') + (p.lane ? ':lane' : '') + (p.dark !== undefined ? ':dark' : '')))]]);
