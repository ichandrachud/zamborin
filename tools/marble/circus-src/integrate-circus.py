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
