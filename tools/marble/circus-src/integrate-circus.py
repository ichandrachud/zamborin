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
open(p, 'w').write(s)
print('obstacles ok')
