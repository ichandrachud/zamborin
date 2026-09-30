# integrate-circus.py <play.js> <circus-chunk.js>: the circus world into a play.js that already has the pinball world (as
# main has since 4af344d). The chunk goes in just after the pinball chunk (before the valley's trees); then the few
# lines elsewhere that the circus needs: its marble skin, its #circus link, and setWorld drawing as far as ever.
import sys
p = sys.argv[1]; s = open(p).read()
chunk = open(sys.argv[2]).read()
anchor = "\n// ---------- TREES, GROWN THE WAY EZ-TREE GROWS THEM ----------\n"
assert s.count(anchor) == 1
s = s.replace(anchor, chunk + anchor)
open(p, 'w').write(s)
def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (a[:70], s.count(a))
    s = s.replace(a, b)
# THE CIRCUS mock-ups (cq1..cq5): a marble skin and a link (#circus-bigtop, #circus-tintoy-12)
s = open(p).read()
rep("  pinball() { marble.material = ", "  circus() { marble.material = new MeshStandardMaterial({ map: cqBallTex(), roughness: 0.28, metalness: 0.15, envMap: cqEnv(cqLook), envMapIntensity: 0.9 }); },   // a circus ball\n  pinball() { marble.material = ")
rep("  if (h === 'pinball') {", "  if (h === 'circus') {                                 // #circus-bigtop, #circus-tintoy, #circus-midway (course 27, or the one named: #circus-midway-12)\n    const n = parseInt(w, 10);\n    loadLevel(n >= 1 && n <= LEVELS.length ? n : 27);\n    setWorld('circus-' + (CIRCUS_LOOKS.includes(v) ? v : 'bigtop'));\n    return;\n  }\n  if (h === 'pinball') {")
open(p, 'w').write(s)
rep("function setWorld(name) {\n", "function setWorld(name) {\n  if (camera.far !== 700) { camera.far = 700; camera.updateProjectionMatrix(); }   // a world may draw less far (the circus stops where its fog is total)\n")
print('circus ok')
# THE CIRCUS OBSTACLES (cq10): cleared with each course, built by type, stepped and animated with the rest, try-outs.
rep("  spaceReset();\n", "  spaceReset(); circReset();\n")
rep("  if (pc.t === 'erupt') { buildErupt(pc); return; }\n", "  if (pc.t === 'erupt') { buildErupt(pc); return; }\n  if (pc.t === 'fring') { buildFring(pc); return; }\n  if (pc.t === 'juggle') { buildJuggle(pc); return; }\n  if (pc.t === 'kwheel') { buildKwheel(pc); return; }\n  if (pc.t === 'cannon') { buildCannon(pc); return; }\n  if (pc.t === 'thrower') { buildThrower(pc); return; }\n")
rep("  if (ball.held) { if (state === 'play') { heldStep(dt); return; } ball.held = null; }", "  if (ball.held) { if (state === 'play') { heldStep(dt); return; } ball.held = null; }\n  if (ball.circ) { if (state === 'play') { circHeldStep(dt); return; } ball.circ = null; }   // in the human cannon")
rep("  if (!pocket) { if (space.droids.length) droidStep(dt); if (space.erupts.length) eruptStep(); }\n", "  if (!pocket) { if (space.droids.length) droidStep(dt); if (space.erupts.length) eruptStep(); }\n  if (!pocket && state === 'play') circStep(dt);\n")
rep("  animateSpace(dt); animateSpace2(dt);\n", "  animateSpace(dt); animateSpace2(dt); animateCirc(dt);\n")
rep("    if (TRY_SPACE[test]) for (const spec of TRY_SPACE[test])", "    if (TRY_CIRCUS[test]) for (const spec of TRY_CIRCUS[test]) { on(circLay(spec, pieces, x, y, z)); straight(8, wide); }   // the circus obstacles' try-outs\n    else if (TRY_SPACE[test]) for (const spec of TRY_SPACE[test])")
rep("setWorld(TRY_SPACE[v] || SP_TRY.includes(v) ? 'pinball-chrome' : w === 'tokyo' ? 'tokyo' : 'neon'); return; }", "setWorld(TRY_CIRCUS[v] ? 'circus-tintoy' : TRY_SPACE[v] || SP_TRY.includes(v) ? 'pinball-chrome' : w === 'tokyo' ? 'tokyo' : 'neon'); return; }")
rep("    tap: () => { tapQueued = true; },\n", "    tap: () => { tapQueued = true; },\n    circ: () => circState(),\n")
rep("  for (const c of ferries) updateFerry(c, simT);\n", "  for (const c of ferries) updateFerry(c, simT);\n  circMove(dt);                                          // the circus's moving floors: a trapeze seat, a wire, a teeterboard, the Ferris cars\n")
rep("  if (pc.t === 'thrower') { buildThrower(pc); return; }\n", "  if (pc.t === 'thrower') { buildThrower(pc); return; }\n  if (pc.t === 'trapeze') { buildTrapeze(pc); return; }\n  if (pc.t === 'wire') { buildWire(pc); return; }\n  if (pc.t === 'teeter') { buildTeeter(pc); return; }\n  if (pc.t === 'wod') { buildWod(pc); return; }\n  if (pc.t === 'ferris') { buildFerrisGap(pc); return; }\n")
rep("{ on(circLay(spec, pieces, x, y, z)); straight(8, wide); }", "{ const L = circLay(spec, pieces, x, y, z); if (L.dy) y = cr2(y + L.dy); on(L.len || L); straight(8, wide); }")
rep("  if (pc.t === 'ferris') { buildFerrisGap(pc); return; }\n", "  if (pc.t === 'ferris') { buildFerrisGap(pc); return; }\n  if (pc.t === 'chase') { buildChase(pc); return; }\n  if (pc.t === 'mirror') { buildMirror(pc); return; }\n  if (pc.t === 'coaster') { buildCoaster(pc); return; }\n")
rep("  if (peekCam) { camera.position.set(...peekCam.pos); camera.lookAt(...peekCam.at); }", "  circCam(dt);                                         // in the circus's house of mirrors, swung round\n  if (peekCam) { camera.position.set(...peekCam.pos); camera.lookAt(...peekCam.at); }")
rep("    else if (ball.p.y < level.minTop - 2.2) startFall();", "    else if (ball.p.y < level.minTop - 2.2 && !ball.circ) startFall();   // not while carried: a coaster's drop goes deeper than any rail")
open(p, 'w').write(s)
print('obstacles ok')
# THE CIRCUS PUZZLES (cq13): a circus kind of puzzle square is handed to its cz twin by each of the space puzzles' hooks;
# the pieces the circus's squares push go through czPush; their try-outs open in the circus.
for f, args in [('spBuild', 'P'), ('spBuilt', 'P'), ('spPad', 'P, c, r, cell'), ('spStep', 'P'), ('spReset', 'P, quiet'), ('spArrive', 'P'), ('spAnimate', 'P, dt'), ('spState', 'P')]:
    tw = {'spArrive': 'czLanded'}.get(f, 'cz' + f[2:])
    test = "CZ_KINDS.has(P.pc.sp.kind)" if f == 'spBuild' else "P.spz.cz"
    rep("function %s(%s) {\n" % (f, args), "function %s(%s) {\n  if (%s) return %s(%s);   // a circus puzzle (cq13)\n" % (f, args, test, tw, args))
rep("  if (W.sat) { satPush(W, dx, dz); return; }        // a satellite glides on\n", "  if (W.sat) { satPush(W, dx, dz); return; }        // a satellite glides on\n  if (W.cz) { czPush(W, dx, dz); return; }          // a circus piece: its own rules\n")
rep("      if (W.sat) satArrive(W);\n", "      if (W.sat) satArrive(W);\n      if (W.cz) czArrive(W);\n")
rep("setWorld(TRY_CIRCUS[v] ? 'circus-tintoy'", "setWorld(TRY_CIRCUS[v] || CZ_TRY.includes(v) ? 'circus-tintoy'")
rep("function buildGate(P, e, x, z, alongX, ek) {\n", "function buildGate(P, e, x, z, alongX, ek) {\n  if (e.czturn || e.czglass) { czEdge(P, e, x, z, alongX, ek); return; }   // a circus turnstile, or a pane of the house of mirrors (cq16)\n")
rep("  if (c.gate) gateTouch(c.gate);\n", "  if (c.gate) { if (c.gate.cz) czTouch(c.gate, _N); else gateTouch(c.gate); }\n")
open(p, 'w').write(s)
print('puzzles ok')
# LEVELS 151-200 (cq18, cq19): made as the pinball machine's are, on the circus's own curve, acts and puzzles; the world
# follows the course.
rep("  if (pin) n = pinEff(pin);\n", "  if (pin) n = pin > 150 ? czEff(pin) : pinEff(pin);   // (151-200, the circus, the same way on its own curve)\n")
rep("(pin ? SP_ROAD_AT[pin] : ROAD_AT[n])", "(pin ? (pin > 150 ? CZ_ROAD_AT : SP_ROAD_AT)[pin] : ROAD_AT[n])")
rep("    const pool = pin ? pinPool(pin, f) :", "    const pool = pin ? (pin > 150 ? czPool(pin, f) : pinPool(pin, f)) :")
rep("    let pick = pin && f === 0 ? pinOpener(pin) :", "    let pick = pin && f === 0 ? (pin > 150 ? czOpener(pin) : pinOpener(pin)) :")
rep("    if (pin && pick in PIN_SPACE && spaceN >= pinSpaceMax(pin)) pick = 'jog';   // enough of the new obstacles for one level\n",
    "    if (pin && pick in PIN_SPACE && spaceN >= pinSpaceMax(pin)) pick = 'jog';   // enough of the new obstacles for one level\n    if (pin > 150 && pick in CZ_OBS && spaceN >= czActMax(pin)) pick = 'jog';     // (or of the circus's acts)\n")
rep("    if (pin && pick in PIN_SPACE) { spaceN++;", "    if (pin > 150 && pick in CZ_OBS) { spaceN++; const L = czLayAct(pick, pin, r, pieces, x, y, z); if (L.dy) y = r2(y + L.dy); on(L.len || L); }   // the circus's own acts\n    else if (pin && pick in PIN_SPACE) { spaceN++;")
rep("  const endSq = pin ? SP_PLAZA_AT[pin] : PLAZA_AT[n];", "  const endSq = pin ? (pin > 150 ? CZ_PLAZA_AT : SP_PLAZA_AT)[pin] : PLAZA_AT[n];")
rep("district: pin ? PIN_DISTRICTS[pinDistrict(pin)]", "district: pin > 150 ? CZ_DISTRICTS[czDistrict(pin)] : pin ? PIN_DISTRICTS[pinDistrict(pin)]")
rep("  if (['neon', 'tokyo', 'dystopia', 'pinball-chrome'].includes(home)) setWorld(levelNo > 100 ? 'pinball-chrome' :", "  if (['neon', 'tokyo', 'dystopia', 'pinball-chrome', 'circus-tintoy'].includes(home)) setWorld(levelNo > 150 ? 'circus-tintoy' : levelNo > 100 ? 'pinball-chrome' :")
rep("name = levelNo > 100 ? 'pinball-chrome' : levelNo > 50 ? 'tokyo' : 'neon';   // the world follows the course", "name = levelNo > 150 ? 'circus-tintoy' : levelNo > 100 ? 'pinball-chrome' : levelNo > 50 ? 'tokyo' : 'neon';   // the world follows the course")
open(p, 'w').write(s)
print('levels ok')
# THE CIRCUS'S SOUNDS (cq20)
rep("function sound(name) {\n", "function sound(name) {\n  if (world.name.startsWith('circus') && CZ_SOUNDS[name]) { if (sfx && sfx.isOn()) CZ_SOUNDS[name](); return; }   // the circus's own (cq20)\n")
open(p, 'w').write(s)
print('sounds ok')
# THE HALL OF MIRRORS (cq21): the circus's wormholes lead there
rep("  const other = pbWorld(pocket.world) ? 'pinball-moon' : P.world;", "  const other = pocket.world.startsWith('circus') ? 'circus-mirrors' : pbWorld(pocket.world) ? 'pinball-moon' : P.world;   // the circus's to its hall of mirrors (cq21)")
open(p, 'w').write(s)
print('hall ok')
# #hall: straight into the hall of mirrors (level 198's cabinet, as if rolled into)
rep("  if (h === 'level') {                                  // #level-17 opens course 17, to look at one\n",
    "  if (h === 'hall') {                                   // #hall: into the circus's hall of mirrors (cq21): level 198, and through its cabinet as soon as it is being played\n    loadLevel(198);\n    let tries = 0; const go = setInterval(() => { const W = wormholes.find((o) => o.pc.dir === 'in'); if (pocket || !W || ++tries > 1000) { clearInterval(go); return; } if (state === 'play') { clearInterval(go); startWarp(W); } }, 300);\n  }\n  if (h === 'level') {                                  // #level-17 opens course 17, to look at one\n")
rep("  let name = h && h !== 'level' ? h : null;", "  let name = h && h !== 'level' && h !== 'hall' ? h : null;")
open(p, 'w').write(s)
print('hall link ok')
# THE MIRROR MAZE (cq22): a circus cabinet's world is a maze; its piece, the stick and the camera inside it
rep("    pieces.push(WORM(x, r2(z + 1.4), wide, y, 'in', makePocket(n)));", "    pieces.push(WORM(x, r2(z + 1.4), wide, y, 'in', pin > 150 ? czMazePocket(pin) : makePocket(n)));   // (the circus's: a mirror maze, cq22)")
rep("  if (pc.t === 'coaster') { buildCoaster(pc); return; }\n", "  if (pc.t === 'coaster') { buildCoaster(pc); return; }\n  if (pc.t === 'czmaze') { buildCzMaze(pc); return; }\n")
rep("  const [ix, iz] = readInput();\n", "  const [ix, iz] = czMazeInput(readInput());              // (in the mirror maze the stick turns with the camera)\n")
rep("  circCam(dt);                                         // in the circus's house of mirrors, swung round\n", "  circCam(dt);                                         // in the circus's house of mirrors, swung round\n  czMazeCam(dt, snap);                                 // inside the mirror maze: low, looking the way it rolls\n")
rep("    renderer.render(scene, camera);\n    perf.update +=", "    czMazePlanar();                                    // the mirror maze's mirrors, drawn for this view\n    renderer.render(scene, camera);\n    perf.update +=")
open(p, 'w').write(s)
print('maze ok')

# ---- the store audit's fixes (cq23-audit.js), 2026-09-30 ----
rep("      if (o.material && !Array.isArray(o.material) && !o.material.userData.keep) o.material.dispose();\n", "      if (o.material && !Array.isArray(o.material) && !o.material.userData.keep) freeMat(o.material);   // (its pictures too: cq23)\n")
rep("    if (o.material && !Array.isArray(o.material) && !o.material.userData.keep) o.material.dispose();\n", "    if (o.material && !Array.isArray(o.material) && !o.material.userData.keep) freeMat(o.material);   // (its pictures too: cq23)\n")
rep("  const HEADER = 154, FOOTER = 98, viewTop = py + HEADER,", "  // (the header takes a line more for an opening that needs three: cq23)\n  const subtitle = cardSubtitle(kind), HEADER = 154 + 24 * Math.max(0, Math.min(3, wrapText(subtitle, pw - 68, 17).length) - 2), FOOTER = 98, viewTop = py + HEADER,")
rep("""    subtitle: kind === 'rules' ? 'Roll the marble along the course and through the orange ring.'
      : last ? 'That was the last of the forty courses.'
      : falls === 0 ? 'The whole course without a single fall.'
      : 'Home, with ' + falls + (falls === 1 ? ' fall' : ' falls') + ' on the way.',
""", "    subtitle,\n")
rep("  const sub = wrapText(c.subtitle, c.pw - 68, 17).slice(0, 2);", "  const sub = wrapText(c.subtitle, c.pw - 68, 17).slice(0, 3);")
# a second finger: the first keeps the stick, and a quick tap of the second is a hop (it used to take the stick over,
# and lifting it stopped the marble with the first still down)
rep("  joy = { id: e.pointerId, ox: p.x, oy: p.y,", "  if (joy && joy.id !== e.pointerId) { tap2 = { id: e.pointerId, t0: performance.now(), sx: p.x, sy: p.y, far: 0 }; return; }\n  joy = { id: e.pointerId, ox: p.x, oy: p.y,")
rep("  if (cardDrag && e.pointerId === cardDrag.id) cardScroll = cardDrag.s + (cardDrag.y - p.y);\n});", "  if (cardDrag && e.pointerId === cardDrag.id) cardScroll = cardDrag.s + (cardDrag.y - p.y);\n  if (tap2 && e.pointerId === tap2.id) tap2.far = Math.max(tap2.far, Math.hypot(p.x - tap2.sx, p.y - tap2.sy));\n});")
rep("  if (cardDrag && e.pointerId === cardDrag.id) cardDrag = null;\n}", "  if (cardDrag && e.pointerId === cardDrag.id) cardDrag = null;\n  if (tap2 && e.pointerId === tap2.id) { if (!cancelled && performance.now() - tap2.t0 < 260 && tap2.far < 14) tapQueued = true; tap2 = null; }\n}\nlet tap2 = null;                                        // a second finger while the first steers: only ever a hop")
rep("window.addEventListener('blur', () => { keys.clear(); joy = null; });", "window.addEventListener('blur', () => { keys.clear(); joy = null; tap2 = null; });")
# the arrows scrolled the page round the game (the host page, in a portal's frame) while a card was up
rep("    else if (state === 'rules' && (k === 'up' || k === 'down')) { cardScroll += k === 'up' ? -40 : 40; e.preventDefault(); }\n", "    else if (state === 'rules' && (k === 'up' || k === 'down')) { cardScroll += k === 'up' ? -40 : 40; e.preventDefault(); }\n    else if (e.code.startsWith('Arrow')) e.preventDefault();   // (a card is up: the arrows still must not scroll the page round the game)\n")
# a save that parses but is not a save (a level that is not a whole number) stopped the game at boot, every time
rep("  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.level) { s.best = s.best || {}; s.stars = s.stars || {}; return s; } } catch (_) {}",
    "  try {\n    const s = JSON.parse(localStorage.getItem(SAVE_KEY));\n    if (s && typeof s === 'object' && Number.isFinite(+s.level) && +s.level >= 1) {   // (a save that is not one starts afresh)\n      s.level = Math.floor(+s.level);\n      for (const k of ['best', 'stars', 'seen']) if (s[k] !== undefined && (!s[k] || typeof s[k] !== 'object')) delete s[k];\n      s.best = s.best || {}; s.stars = s.stars || {};\n      return s;\n    }\n  } catch (_) {}")
rep("loadLevel(save.level || 1);", "loadLevel(Math.min(LEVELS.length, save.level || 1));")
# a switch's lit sides are made afresh for each dressing, each with its own glow picture, and only the materials were
# ever freed (Tokyo's scenery alone left two pictures on the GPU at every level)
rep("{ S.top.dispose(); S.side.dispose(); }", "{ freeMat(S.top); freeMat(S.side); }", 5)
# a world's dressing was forgotten, not undone, when a level ended in the same world: what it had swapped out (Tokyo's
# locks, belts and paper roads took the city's) was never freed. Undone first, the course's own go with the rest.
rep("  if (levelGroup) {\n    for (const c of holos) for (const m of c.holoMats) m.dispose();", "  if (levelGroup) {\n    tkUndoAll();                                        // (the dressing undone first, so what it swapped out is freed with the course: cq23)\n    for (const c of holos) for (const m of c.holoMats) m.dispose();")
open(p, 'w').write(s)
print('audit ok')
