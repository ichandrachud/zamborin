# Tailwind's six aeroplanes as 3D models in Hummingham's toy look, one .glb each, for the side-scrolling 3D game.
# Every shape is read off its art (assets/<plane>.webp, nose to the right) on a 50 px grid: 1 px = 5 mm, x forward,
# z up, the camera's side is -y. Parts are turned and smooth; colour joins get a rolled rim, as Hummingham's pieces do.
# Materials are named 'paint #RRGGBB', 'chrome', 'glass', 'tyre', 'grille' so the game can give them its own finish.
# Run: bash tools/tailwind/build.sh (Blender -b -P fleet.py -- <out_dir> [plane ...], then gltfpack)
import bpy, bmesh, math, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, ONLY = argv[0], set(argv[1:])
PX = 0.005
TOY = dict(red='#D92A1C', orange='#EE5214', tangerine='#F77420', yellow='#FFCD1F', blue='#45B6FF', teal='#10BEC2', green='#22A846',
           white='#FCFBF8', pale='#B9D3EC', navy='#2F5FA8', silver='#9FAEBF')

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
_mats = {}
def M(key):
    if key in _mats: return _mats[key]
    m = bpy.data.materials.new(key if not key.startswith('#') else 'paint ' + key.upper()); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    if key.startswith('#'): b.inputs['Base Color'].default_value = (*lin(key), 1); b.inputs['Roughness'].default_value = 0.28
    elif key == 'chrome': b.inputs['Base Color'].default_value = (0.92, 0.93, 0.95, 1); b.inputs['Metallic'].default_value = 1; b.inputs['Roughness'].default_value = 0.1
    elif key == 'glass': b.inputs['Base Color'].default_value = (0.8, 0.9, 1, 1); b.inputs['Roughness'].default_value = 0.05; b.inputs['Alpha'].default_value = 0.4
    elif key == 'tyre': b.inputs['Base Color'].default_value = (0.03, 0.035, 0.045, 1); b.inputs['Roughness'].default_value = 0.7
    elif key == 'grille': b.inputs['Base Color'].default_value = (0.05, 0.08, 0.14, 1); b.inputs['Metallic'].default_value = 0.6; b.inputs['Roughness'].default_value = 0.35
    _mats[key] = m; return m
def C(name): return TOY.get(name, name)

class Plane:
    def __init__(self, name, prof, squash=0.9):
        self.name, self.parts = name, []
        self.prof = sorted(prof)                       # [(x, top_y, bottom_y)] in art px
        self.sq = squash
    # ---- the body's shape where it is ----
    def at(self, x):
        p = self.prof
        if x <= p[0][0]: a = b = p[0]
        elif x >= p[-1][0]: a = b = p[-1]
        else:
            i = max(i for i in range(len(p)) if p[i][0] <= x); a, b = p[i], p[i + 1]
        t = 0 if a[0] == b[0] else (x - a[0]) / (b[0] - a[0]); t = t * t * (3 - 2 * t) * 0.5 + t * 0.5
        top = a[1] + (b[1] - a[1]) * t; bot = a[2] + (b[2] - a[2]) * t
        return (top + bot) / 2, (bot - top) / 2           # centre y, radius (px)
    def side(self, x, y):                                 # the body's half width (m) at a height
        c, r = self.at(x); dz = (y - c)
        return self.sq * math.sqrt(max(r * r - dz * dz, 0)) * PX
    def P(self, x, y, s=0.0): return Vector(((x - 600) * PX, s, (300 - y) * PX))
    def keep(self, o, mat, smooth=True, subd=0):
        o.data.materials.clear(); o.data.materials.append(M(mat))
        if smooth:
            for f in o.data.polygons: f.use_smooth = True
        if subd: s = o.modifiers.new('s', 'SUBSURF'); s.levels = subd; s.render_levels = subd
        self.parts.append(o); return o
    def obj(self, name, me):
        o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o

    # ---- turned shapes ----
    def lathe(self, name, rings, mat, seg=40, sq=None, cap=(True, True), subd=0):
        """rings: [(x, centre_y, radius)] in px, turned about a line along x."""
        sq = self.sq if sq is None else sq
        bm = bmesh.new(); vs = []
        for (x, c, r) in rings:
            X, Z = (x - 600) * PX, (300 - c) * PX; R = max(r, 0.2) * PX
            vs.append([bm.verts.new((X, math.cos(2 * math.pi * k / seg) * R * sq, Z + math.sin(2 * math.pi * k / seg) * R)) for k in range(seg)])
        for a, b in zip(vs, vs[1:]):
            for k in range(seg): bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
        if cap[0]: bm.faces.new(vs[0][::-1])
        if cap[1]: bm.faces.new(vs[-1])
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        return self.keep(self.obj(name, me), mat, subd=subd)
    def body(self, zones, rim='white', step=8):
        """The fuselage in colour zones [(x0, x1, colour)], a rolled rim at every join."""
        for i, (x0, x1, col) in enumerate(zones):
            xs = list(range(int(x0), int(x1), step)) + [x1]
            first, last = i == 0, i == len(zones) - 1
            rings = [(x, *self.at(x)) for x in xs]
            if first: rings = [(x0, rings[0][1], 0.2)] + rings          # close the tail to a point
            if last: rings = rings + [(x1, rings[-1][1], 0.2)]
            self.lathe('body %d' % i, rings, C(col), cap=(False, False))
            if not last and rim: self.ring(x1, *self.at(x1), C(rim) if rim != 'chrome' else 'chrome')
    def ring(self, x, c, r, mat, thick=0.055):
        bpy.ops.mesh.primitive_torus_add(major_radius=r * PX * 1.0, minor_radius=r * PX * thick + 0.012, major_segments=40, minor_segments=8,
                                         location=self.P(x, c), rotation=(0, math.pi / 2, 0))
        o = bpy.context.object; o.scale = (1, self.sq, 1); return self.keep(o, mat)
    def dome(self, name, x0, x1, c, r0, mat, sq=None, blunt=0.0):
        """A rounded nose or tail from radius r0 at x0 to a point at x1 (blunt keeps the front flatter)."""
        n = 14; rings = []
        for k in range(n + 1):
            t = k / n; rings.append((x0 + (x1 - x0) * (1 - (1 - t) ** (1 + blunt)) if blunt else x0 + (x1 - x0) * t, c, r0 * math.sqrt(max(0, 1 - t * t))))
        return self.lathe(name, rings, mat, sq=sq, cap=(True, False))
    def pod(self, name, rings, zones, sq=1.0, y=0.0):
        """A tank or pod: rings [(x, c, r)], coloured by x ranges [(x0, x1, colour)] with rims between."""
        def r_at(x):
            for a, b in zip(rings, rings[1:]):
                if a[0] <= x <= b[0]: t = (x - a[0]) / max(1e-6, b[0] - a[0]); return a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t
            return rings[-1][1], rings[-1][2]
        for i, (x0, x1, col) in enumerate(zones):
            xs = sorted(set([x0, x1] + [r[0] for r in rings if x0 < r[0] < x1] + list(range(int(x0), int(x1), 10))))
            rr = [(x, *r_at(x)) for x in xs]
            o = self.lathe(f'{name} {i}', rr, C(col) if col not in ('chrome', 'grille', 'glass') else col, sq=sq, cap=(i == 0, i == len(zones) - 1))
            o.location.y += y
            if i < len(zones) - 1:
                c, r = r_at(x1); t = self.ring(x1, c, r * 1.02, 'chrome', thick=0.05); t.scale = (1, sq, 1); t.location.y += y

    # ---- flat parts ----
    def slab(self, name, pts, thick, mat, plane='xz', at=0.0, bevel=0.45):
        bm = bmesh.new()
        if plane == 'xz': vs = [bm.verts.new(((x - 600) * PX, at - thick / 2, (300 - y) * PX)) for (x, y) in pts]
        else: vs = [bm.verts.new(((x - 600) * PX, y, at - thick / 2)) for (x, y) in pts]   # xy: y in metres
        f = bm.faces.new(vs); f.normal_update()
        ext = bmesh.ops.extrude_face_region(bm, geom=[f])
        bmesh.ops.translate(bm, vec=Vector((0, thick, 0)) if plane == 'xz' else Vector((0, 0, thick)), verts=[v for v in ext['geom'] if isinstance(v, bmesh.types.BMVert)])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        o = self.keep(self.obj(name, me), mat)
        b = o.modifiers.new('b', 'BEVEL'); b.width = thick * bevel; b.segments = 5; b.limit_method = 'NONE'
        return o
    def fin(self, pts, col, thick=0.09, trim=None):
        self.slab('fin', pts, thick, C(col))
    def wing(self, x0, x1, y, span, col, thick=0.12, sweep=0.15, z=None):
        """A wing at height y (px), root chord x0..x1, out to `span` m each side, the tip rounded."""
        for s in (-1, 1):
            c = x1 - x0; pts = [(x0, 0.0), (x0 + c * sweep, span * 0.92), (x0 + c * (sweep + 0.12), span), (x1 - c * 0.25, span), (x1 - c * 0.1, span * 0.85), (x1, 0.0)]
            pts = [(p[0], s * p[1]) for p in pts] if s > 0 else [(p[0], s * p[1]) for p in pts[::-1]]
            self.slab('wing', pts, thick, C(col), plane='xy', at=(300 - y) * PX)
    def fairing(self, x0, x1, y, h, col, sq=0.42, droop=0.0):
        rings = []
        for k in range(17):
            t = k / 16; x = x0 + (x1 - x0) * t
            r = h * (math.sin(math.pi * t ** 0.8) ** 0.7); rings.append((x, y + droop * t * t, max(r, 0.3)))
        for s in (-1, 1):
            o = self.lathe('fairing', rings, C(col), sq=sq, cap=(False, False)); o.location.y += s * (self.side((x0 + x1) / 2, y) + h * PX * sq * 0.35)
    def tailplane(self, x0, x1, y, span, col, thick=0.06):
        self.wing(x0, x1, y, span, col, thick, sweep=0.35)

    # ---- details ----
    def disc(self, x, y, r, mat, lift=0.006, depth=0.02, both=True, verts=48):
        for s in ((-1, 1) if both else (-1,)):
            w = self.side(x, y)
            bpy.ops.mesh.primitive_cylinder_add(radius=r * PX, depth=depth, vertices=verts, location=self.P(x, y, s * (w + lift)), rotation=(math.pi / 2, 0, 0))
            self.keep(bpy.context.object, mat)
    def bezel(self, x, y, r, mat='chrome', lift=0.012, both=True):
        for s in ((-1, 1) if both else (-1,)):
            w = self.side(x, y)
            bpy.ops.mesh.primitive_torus_add(major_radius=r * PX, minor_radius=max(0.018, r * PX * 0.12), major_segments=48, minor_segments=10,
                                             location=self.P(x, y, s * (w + lift)), rotation=(math.pi / 2, 0, 0))
            self.keep(bpy.context.object, mat)
    def roundel(self, x, y, rings):
        """rings: [(r, colour)] from the outside in, with a chrome bezel round it."""
        for k, (r, col) in enumerate(rings): self.disc(x, y, r, C(col), lift=0.006 + 0.004 * k)
        self.bezel(x, y, rings[0][0])
    def porthole(self, x, y, r, col='glass'):
        self.disc(x, y, r * 0.86, C(col) if col != 'glass' else 'grille', lift=0.008); self.bezel(x, y, r * 0.93)
        if col == 'glass': self.disc(x, y, r * 0.86, 'glass', lift=0.016)
    def vent(self, x, y, w, h):
        for s in (-1, 1):
            for (sc, mat, lift) in ((1.0, 'chrome', 0.006), (0.82, 'grille', 0.014)):
                bpy.ops.mesh.primitive_cylinder_add(radius=h / 2 * PX * sc, depth=0.03, vertices=32, location=self.P(x, y, s * (self.side(x, y) + lift)), rotation=(math.pi / 2, 0, 0))
                o = self.keep(bpy.context.object, mat); o.scale = (w / h * (1 if sc == 1 else 1.03), 1, 1)
    def rod(self, p0, p1, r, mat):
        a, b = Vector(p0), Vector(p1); d = b - a
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, vertices=16, location=(a + b) / 2)
        o = bpy.context.object; o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = d.to_track_quat('Z', 'Y'); return self.keep(o, mat)
    def ball(self, p, r, mat):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=p, segments=24, ring_count=12); return self.keep(bpy.context.object, mat)
    def antenna(self, x, y0, y1):
        self.rod(self.P(x, y1), self.P(x + 8, y0), 0.014, 'chrome'); self.ball(self.P(x + 8, y0), 0.04, C('red'))
    def wheel(self, x, y, r, hub, strut_to=None, spat=None, gap=0.32, pair=True):
        for s in ((-1, 1) if pair else (0,)):
            at = self.P(x, y, s * gap)
            bpy.ops.mesh.primitive_torus_add(major_radius=r * PX * 0.7, minor_radius=r * PX * 0.3, major_segments=48, minor_segments=16, location=at, rotation=(math.pi / 2, 0, 0))
            self.keep(bpy.context.object, 'tyre')
            bpy.ops.mesh.primitive_cylinder_add(radius=r * PX * 0.5, depth=r * PX * 0.42, vertices=40, location=at, rotation=(math.pi / 2, 0, 0)); self.keep(bpy.context.object, C(hub))
            bpy.ops.mesh.primitive_uv_sphere_add(radius=r * PX * 0.2, location=at + Vector((0, -0.12 if s <= 0 else 0.12, 0)), segments=20, ring_count=10); self.keep(bpy.context.object, 'chrome')
            if strut_to: self.rod(at, self.P(strut_to[0], strut_to[1], s * gap * 0.6), max(0.025, r * PX * 0.09), 'chrome')
            if spat:
                bpy.ops.mesh.primitive_uv_sphere_add(radius=r * PX * 1.18, location=at, segments=40, ring_count=20)
                o = bpy.context.object; o.scale = (1.1, 0.42, 1)
                bm = bmesh.new(); bm.from_mesh(o.data)
                bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.05], context='VERTS'); bm.to_mesh(o.data); bm.free()
                sol = o.modifiers.new('t', 'SOLIDIFY'); sol.thickness = 0.03
                self.keep(o, C(spat))
    def prop(self, x, y, R, spinner, blades=3, blade='silver', spin_len=60, spin_r=40):
        self.dome('spinner', x, x + spin_len, y, spin_r, C(spinner), sq=1.0, blunt=0.6)
        hub = bpy.data.objects.new('prop', None); bpy.context.scene.collection.objects.link(hub); hub.location = self.P(x + 12, y)
        self.hub = hub
        for k in range(blades):
            bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(0, 0, 0), segments=24, ring_count=12)
            o = bpy.context.object; o.name = 'blade'; o.scale = (0.045, 0.13, R * PX * 0.5)
            o.data.transform(Matrix.Translation((0, 0, 1.0)))
            o.rotation_euler = (k * 2 * math.pi / blades + 0.35, 0, 0)
            self.keep(o, C(blade) if blade != 'chrome' else 'chrome')
            self.parts.remove(o); o.parent = hub
    def canopy(self, x0, x1, base, top, frames=3, sq=0.62):
        """A bubble canopy on the body's top: glass, with chrome hoops."""
        n = 16; rings = []
        for k in range(n + 1):
            t = k / n; x = x0 + (x1 - x0) * t; h = (base - top) * math.sin(math.pi * t) ** 0.55
            rings.append((x, base, max(h, 0.5)))
        self.lathe('canopy', rings, 'glass', sq=sq, cap=(False, False))
        for k in range(1, frames + 1):
            t = k / (frames + 1); x = x0 + (x1 - x0) * t; h = (base - top) * math.sin(math.pi * t) ** 0.55
            self.ring(x, base, h * 1.0, 'chrome', thick=0.012).scale = (1, sq, 1)
    def greenhouse(self, x0, x1, top_pts, base, cols=8, rows=3):
        """A long glazed cabin: glass over the body's front, a chrome grid of hoops and rails."""
        def h(x):
            for a, b in zip(top_pts, top_pts[1:]):
                if a[0] <= x <= b[0]: t = (x - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * t
            return top_pts[-1][1]
        rings = []
        for k in range(21):
            x = x0 + (x1 - x0) * k / 20; tp = h(x); c, r = self.at(x)
            rr = max(r * 1.015, c - tp); rings.append((x, c, rr))
        # the body under the glass is cut away and a dark cabin put inside, so the glazing reads as windows
        zb = (300 - base) * PX
        for b in [q for q in self.parts if q.name.startswith('body')]:
            bm = bmesh.new(); bm.from_mesh(b.data)
            gone = [f for f in bm.faces if all(((x0 - 600) * PX + 0.02 < v.co.x < (x1 - 600) * PX - 0.02) and v.co.z > zb + 0.02 for v in f.verts)]
            bmesh.ops.delete(bm, geom=gone, context='FACES'); bm.to_mesh(b.data); bm.free()
        cab = self.lathe('cabin', [(x, *self.at(x)[:1], self.at(x)[1] * 0.86) for x in range(int(x0), int(x1) + 1, 20)], C('#34465F'), cap=(True, True))
        for k in range(int((x1 - x0) / 90)):
            xs = x0 + 50 + k * 90; c, r = self.at(xs)
            bpy.ops.mesh.primitive_cube_add(size=1, location=self.P(xs, base - 30)); o = bpy.context.object; o.scale = (0.22, 0.5, 0.35); self.keep(o, C('yellow') if k % 2 else C('blue'))
        o = self.lathe('greenhouse', rings, 'glass', cap=(False, False))
        # keep only the glass above `base`
        bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < (300 - base) * PX], context='VERTS'); bm.to_mesh(o.data); bm.free()
        for k in range(cols + 1):
            x = x0 + (x1 - x0) * k / cols; c, r = self.at(x); rr = max(r * 1.02, c - h(x))
            t = self.ring(x, c, rr, 'chrome', thick=0.025)
            bpy.context.view_layer.update(); mw = t.matrix_world.copy()
            bm = bmesh.new(); bm.from_mesh(t.data); bmesh.ops.delete(bm, geom=[v for v in bm.verts if (mw @ v.co).z < (300 - base) * PX], context='VERTS'); bm.to_mesh(t.data); bm.free()
        for j in range(1, rows + 1):
            yy = base - (base - min(p[1] for p in top_pts)) * j / (rows + 1)
            pts = []
            for k in range(13):
                x = x0 + (x1 - x0) * k / 12; c, r = self.at(x); rr = max(r * 1.02, c - h(x))
                if yy < c - rr: continue
                dz = (yy - c); w = self.sq * math.sqrt(max(rr * rr - dz * dz, 0)) * PX
                pts.append(self.P(x, yy, -(w + 0.01)))
            for a, b in zip(pts, pts[1:]): self.rod(a, b, 0.016, 'chrome')

    def finish(self):
        root = bpy.data.objects.new(self.name, None); bpy.context.scene.collection.objects.link(root)
        for o in self.parts: o.parent = root
        if getattr(self, 'hub', None): self.hub.parent = root
        return root

# ============================== the fleet ==============================
def lacerta():
    p = Plane('Lacerta', [(90, 265, 315), (240, 238, 345), (300, 212, 372), (400, 190, 402), (500, 172, 422), (620, 166, 433),
                          (760, 166, 436), (870, 176, 428), (940, 186, 412), (1000, 100, 392), (1060, 108, 378), (1100, 140, 330), (1125, 200, 262)], 0.9)
    p.body([(90, 240, 'orange'), (240, 945, 'white'), (945, 1050, 'pale'), (1050, 1126, 'red')])
    p.prop(1120, 230, 235, 'yellow', blades=3, spin_len=78, spin_r=46)
    p.slab('rudder', [(12, 230), (14, 175), (40, 152), (80, 150), (92, 200), (92, 380), (80, 412), (40, 414), (14, 392), (12, 330)], 0.12, C('white'))
    p.slab('rudder trim', [(62, 152), (90, 152), (92, 412), (62, 414)], 0.13, C('pale'))
    p.fin([(90, 288), (95, 165), (130, 175), (240, 250), (240, 290)], 'orange')
    p.fin([(90, 300), (240, 300), (240, 340), (130, 405), (95, 410)], 'orange')
    p.tailplane(10, 215, 300, 1.25, 'white')
    p.wing(520, 790, 330, 2.7, 'white', thick=0.14)
    p.canopy(515, 835, 175, 52, frames=4, sq=0.7)
    p.ball(p.P(690, 108), 0.12, C('yellow'))                             # the pilot's helmet
    p.pod('gun pod', [(520, 155, 6), (540, 155, 18), (560, 155, 22), (800, 155, 22), (840, 152, 36), (930, 150, 44), (985, 152, 30), (995, 152, 8)],
          [(520, 545, 'yellow'), (545, 995, 'orange')])
    p.pod('blister', [(460, 318, 3), (520, 318, 14), (700, 318, 20), (770, 318, 16), (790, 318, 3)], [(460, 790, 'orange')], sq=0.6, y=-p.side(620, 318) - 0.02)
    p.pod('blister r', [(460, 318, 3), (520, 318, 14), (700, 318, 20), (770, 318, 16), (790, 318, 3)], [(460, 790, 'orange')], sq=0.6, y=p.side(620, 318) + 0.02)
    p.roundel(370, 293, [(48, 'pale'), (30, 'yellow'), (14, 'red')])
    p.wheel(740, 450, 62, 'yellow', strut_to=(715, 360))
    p.wheel(85, 470, 18, 'silver', strut_to=(95, 400), pair=False, gap=0)
    for yy in (215, 260): p.rod(p.P(980, yy, -p.side(980, yy) - 0.04), p.P(1015, yy + 30, -p.side(980, yy) - 0.04), 0.03, 'chrome')
    p.antenna(560, 40, 165)
    return p

def vesper():
    p = Plane('Vesper', [(0, 230, 240), (60, 165, 300), (200, 125, 315), (400, 100, 330), (560, 72, 334), (700, 62, 335), (850, 75, 345),
                         (980, 120, 362), (1040, 150, 372), (1100, 175, 365), (1115, 230, 320)], 0.85)
    p.body([(0, 70, 'orange'), (70, 85, 'blue'), (85, 1020, 'orange'), (1020, 1060, 'yellow'), (1060, 1116, 'orange')])
    p.prop(1110, 300, 245, 'blue', blades=3, spin_len=90, spin_r=52)
    p.slab('spine', [(20, 25), (330, 38), (430, 62), (420, 72), (330, 60), (40, 45), (18, 34)], 0.16, C('orange'))
    p.fin([(110, 160), (130, 55), (165, 40), (215, 120), (240, 160)], 'orange')
    p.fin([(50, 160), (58, 85), (90, 45), (130, 45), (118, 160)], 'yellow')
    p.tailplane(20, 200, 35, 1.1, 'orange', thick=0.08)
    p.canopy(435, 595, 72, 18, frames=2, sq=0.6)
    p.ball(p.P(470, 45), 0.1, C('navy'))
    p.greenhouse(700, 1060, [(700, 65), (850, 70), (980, 100), (1060, 150)], 262, cols=7, rows=2)
    p.pod('cheek', [(370, 210, 4), (420, 205, 60), (520, 200, 90), (640, 200, 80), (720, 215, 40), (760, 235, 6)], [(370, 760, 'orange')], sq=0.5, y=-p.side(560, 210) - 0.05)
    p.pod('cheek r', [(370, 210, 4), (420, 205, 60), (520, 200, 90), (640, 200, 80), (720, 215, 40), (760, 235, 6)], [(370, 760, 'orange')], sq=0.5, y=p.side(560, 210) + 0.05)
    p.porthole(632, 190, 26, 'blue')
    p.pod('belly tank', [(355, 412, 30), (370, 412, 62), (420, 412, 75), (780, 412, 75), (830, 412, 55), (858, 412, 10)],
          [(355, 400, 'grille'), (400, 858, 'silver')])
    p.pod('jet', [(205, 345, 22), (230, 345, 38), (370, 345, 40), (380, 345, 30)], [(205, 380, 'chrome')])
    p.wing(560, 880, 300, 2.6, 'orange', thick=0.13)
    for k in range(5): p.vent(830 + k * 38, 300, 30, 18)
    p.wheel(710, 575, 50, 'silver', strut_to=(690, 470))
    p.wheel(140, 345, 15, 'silver', strut_to=(160, 300), pair=False, gap=0)
    return p

def tsunami():
    p = Plane('Tsunami', [(10, 330, 345), (100, 268, 420), (200, 190, 462), (400, 140, 500), (600, 112, 512), (800, 104, 516), (930, 102, 522),
                          (1000, 106, 525), (1060, 118, 512), (1082, 170, 460)], 0.95)
    p.body([(10, 935, 'red'), (935, 1083, 'red')], rim='orange')
    p.ring(965, *p.at(965), C('orange'), thick=0.04)
    p.prop(1080, 315, 250, 'orange', blades=3, blade='white', spin_len=110, spin_r=55)
    p.fin([(12, 38), (70, 45), (300, 170), (310, 230), (110, 285), (90, 200)], 'red', thick=0.12)
    p.tailplane(0, 250, 375, 1.4, 'red')
    p.canopy(520, 795, 110, 35, frames=1, sq=0.8)
    p.antenna(690, 0, 45)
    p.wing(360, 930, 372, 2.9, 'orange', thick=0.12, sweep=0.3)
    p.fairing(320, 955, 372, 68, 'tangerine', droop=40)
    p.pod('tank', [(505, 490, 8), (520, 490, 38), (560, 490, 46), (860, 490, 46), (895, 490, 30), (905, 490, 6)], [(505, 905, 'orange')])
    for (x, y, r, col) in ((183, 305, 21, 'white'), (280, 318, 23, 'yellow'), (472, 300, 22, 'white'), (720, 232, 25, 'blue'), (815, 155, 15, 'blue')):
        p.disc(x, y, r, C(col), lift=0.012); p.bezel(x, y, r)
    p.porthole(372, 288, 46, 'blue')
    p.disc(372, 288, 36, C('blue'), lift=0.02)
    p.rod(p.P(520, 280, -p.side(700, 280) - 0.03), p.P(910, 275, -p.side(700, 280) - 0.03), 0.025, C('blue'))
    p.pod('canister', [(815, 240, 18), (880, 240, 18)], [(815, 880, 'yellow')], y=-p.side(850, 240) - 0.1)
    p.pod('exhaust', [(330, 515, 24), (460, 515, 24)], [(330, 460, 'silver')])
    p.wheel(820, 630, 70, 'silver', strut_to=(810, 500))
    p.wheel(155, 637, 32, 'silver', strut_to=(225, 470), pair=False, gap=0)
    return p

def sirocco():
    p = Plane('Sirocco', [(8, 195, 235), (30, 158, 268), (120, 138, 308), (220, 132, 332), (420, 133, 357),
                          (700, 137, 373), (860, 134, 390), (950, 130, 430), (1040, 132, 468), (1062, 142, 462)], 0.92)
    p.body([(8, 1045, 'red'), (1045, 1065, 'red')], rim='chrome')
    p.dome('nose glass', 1062, 1135, 302, 160, 'glass', sq=0.92, blunt=1.2)
    p.lathe('engine', [(1060, 302, 120), (1100, 302, 112), (1112, 302, 60), (1114, 302, 5)], 'chrome', sq=0.92)
    p.prop(1130, 302, 175, 'red', blades=3, blade='silver', spin_len=70, spin_r=42)
    p.fin([(10, 230), (12, 60), (40, 8), (90, 2), (140, 30), (190, 95), (215, 135), (220, 210)], 'red')
    p.tailplane(0, 215, 200, 0.95, 'red')
    p.wing(560, 900, 368, 2.15, 'red', thick=0.12)
    p.canopy(520, 710, 150, 88, frames=2)
    p.antenna(445, 8, 140)
    p.pod('pod', [(62, 452, 4), (120, 452, 38), (185, 451, 62), (300, 450, 78), (420, 450, 82), (820, 450, 82), (900, 450, 80), (980, 450, 68), (1030, 452, 45), (1056, 452, 6)],
          [(62, 410, 'yellow'), (410, 630, 'red'), (630, 680, 'blue'), (680, 820, 'red'), (820, 1056, 'grille')], sq=0.95)
    p.pod('pylon', [(430, 375, 30), (800, 378, 30)], [(430, 800, 'red')], sq=0.6)
    p.roundel(355, 250, [(82, 'blue'), (40, 'yellow')])
    p.vent(940, 222, 90, 32); p.vent(940, 300, 90, 32)
    p.wheel(765, 615, 78, 'silver', strut_to=(740, 520))
    p.wheel(75, 365, 22, 'silver', strut_to=(100, 320), pair=False, gap=0)
    return p

def zephyr():
    p = Plane('Zephyr', [(60, 175, 330), (90, 132, 383), (215, 110, 388), (400, 68, 396), (500, 48, 398), (700, 44, 392), (900, 46, 394),
                         (1040, 56, 390), (1100, 80, 370), (1135, 150, 300), (1142, 210, 236)], 0.88)
    p.body([(60, 215, 'orange'), (215, 430, 'pale'), (430, 712, 'white'), (712, 1040, 'orange'), (1040, 1143, 'red')])
    p.prop(1140, 222, 190, 'silver', blades=3, blade='silver', spin_len=55, spin_r=30)
    p.slab('fin', [(30, 150), (35, 60), (70, 12), (110, 5), (170, 20), (210, 80), (215, 240), (205, 300), (150, 312), (60, 300), (32, 240)], 0.14, C('red'))
    p.tailplane(0, 215, 215, 1.0, 'silver')
    p.canopy(650, 895, 52, 6, frames=3, sq=0.75)
    p.antenna(590, 0, 45)
    p.wing(430, 800, 305, 2.4, 'silver', thick=0.14)
    p.porthole(495, 153, 50, 'white'); p.disc(495, 153, 14, C('navy'), lift=0.024)
    p.porthole(628, 138, 46, 'glass'); p.ball(p.P(628, 138, -p.side(628, 138) - 0.03), 0.09, 'grille')
    p.disc(305, 262, 52, C('white'), lift=0.01); p.disc(305, 262, 22, 'chrome', lift=0.02); p.disc(305, 262, 8, C('red'), lift=0.03)
    p.disc(612, 228, 20, C('red'), lift=0.012)
    p.vent(920, 172, 175, 18)
    p.slab('panel', [(712, 160), (800, 160), (800, 265), (712, 265)], 0.02, C('red'), at=-p.side(756, 212) - 0.005)
    p.slab('panel 2', [(712, 50), (1040, 50), (1040, 100), (712, 100)], 0.02, C('pale'), at=-p.side(870, 75) - 0.005)
    p.wheel(718, 450, 45, 'orange', strut_to=(700, 380))
    p.wheel(278, 455, 26, 'orange', strut_to=(290, 390), pair=False, gap=0)
    return p

def tempest():
    p = Plane('Tempest', [(0, 222, 232), (100, 190, 262), (230, 152, 300), (400, 100, 350), (600, 72, 388), (800, 66, 408), (950, 80, 405),
                          (1050, 120, 385), (1100, 165, 335), (1118, 215, 280)], 0.9)
    p.body([(0, 222, 'orange'), (222, 245, 'yellow'), (245, 1119, 'orange')], rim=None)
    p.prop(1112, 245, 245, 'silver', blades=3, blade='silver', spin_len=85, spin_r=45)
    p.slab('fin', [(45, 228), (42, 150), (60, 100), (100, 85), (150, 100), (190, 150), (205, 228)], 0.12, C('orange'))
    p.slab('fin trim', [(85, 120), (100, 120), (100, 205), (40, 210), (40, 200), (85, 196)], 0.13, C('blue'))
    p.slab('ventral', [(45, 250), (190, 250), (180, 340), (140, 390), (90, 395), (50, 360)], 0.12, C('orange'))
    p.tailplane(0, 195, 225, 1.2, 'orange')
    p.greenhouse(690, 1112, [(690, 66), (850, 68), (980, 95), (1060, 130), (1112, 200)], 248, cols=9, rows=3)
    p.pod('roof pod', [(685, 40, 10), (720, 40, 28), (900, 38, 32), (1010, 40, 26), (1035, 42, 8)], [(685, 1035, 'orange')])
    p.rod(p.P(760, 70), p.P(760, 52), 0.03, 'chrome'); p.rod(p.P(960, 72), p.P(960, 55), 0.03, 'chrome')
    p.canopy(400, 640, 92, 55, frames=4, sq=0.7)
    p.wing(450, 780, 335, 2.9, 'orange', thick=0.12, sweep=0.2)
    p.fairing(425, 795, 335, 78, 'orange', droop=25)
    p.wheel(745, 515, 42, 'silver', strut_to=(720, 400), spat='orange')
    p.antenna(250, 125, 140)
    return p

FLEET = dict(lacerta=lacerta, vesper=vesper, tsunami=tsunami, sirocco=sirocco, zephyr=zephyr, tempest=tempest)
for key, make in FLEET.items():
    if ONLY and key not in ONLY: continue
    bpy.ops.wm.read_factory_settings(use_empty=True); _mats.clear()
    p = make(); root = p.finish()
    bpy.ops.export_scene.gltf(filepath=f'{OUT}/{key}.glb', export_apply=True)
    print('BUILT', key, len(p.parts), 'parts')
