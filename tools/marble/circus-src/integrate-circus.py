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
