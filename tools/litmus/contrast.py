# Contrast on the painted pixel for Litmus in 3D: reads tools/litmus/contrast.mjs's screenshots and word lists. Each
# word's colour is laid over the pixels round its box (its own alpha), and measured against the lightest of those pixels
# (the 90th percentile, so one stray bright pixel does not decide it): WCAG's ratio, 4.5 for text under 24px (18.66px
# bold), 3 above. usage: python3 tools/litmus/contrast.py <outdir>
import sys, json, re
from PIL import Image
out = sys.argv[1]
def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def lum(rgb): return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
def parse(col):
    col = col.strip()
    m = re.match(r'#([0-9a-fA-F]{6})', col)
    if m: h = m.group(1); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 1.0)
    m = re.match(r'#([0-9a-fA-F]{3})$', col)
    if m: h = m.group(1); return tuple(int(x * 2, 16) for x in h) + (1.0,)
    m = re.match(r'rgba?\(([^)]*)\)', col)
    if m:
        p = [float(x) for x in m.group(1).replace('/', ',').split(',') if x.strip()]
        return (p[0], p[1], p[2], p[3] if len(p) > 3 else 1.0)
    return None
bad, total = [], 0
dist = lambda p, q: sum((p[i] - q[i]) ** 2 for i in range(3)) ** 0.5
for base in json.load(open(f'{out}/index.json')):
    im = Image.open(f'{out}/{base}.png').convert('RGB'); W, H = im.size; px = im.load()
    seen = set()
    for t in json.load(open(f'{out}/{base}.json')):
        key = (t['text'], round(t['x']), round(t['y']))
        if key in seen: continue          # a word drawn twice in the frame counts once
        seen.add(key)
        c = parse(t['color'])
        if not c: continue
        a = c[3] * t.get('alpha', 1)
        x0, y0, x1, y1 = int(t['x']) - 3, int(t['y']) - 3, int(t['x'] + t['w']) + 3, int(t['y'] + t['h']) + 3
        ring = []
        for x in range(max(0, x0), min(W, x1 + 1)):
            for y in (y0, y1):
                if 0 <= y < H: ring.append(px[x, y])
        for y in range(max(0, y0), min(H, y1 + 1)):
            for x in (x0, x1):
                if 0 <= x < W: ring.append(px[x, y])
        if not ring or a < 0.02: continue
        ring.sort(key=lum)
        bg0 = ring[len(ring) // 2]
        # what is really behind the letters: the word's own box, less its letters (pixels near the word's colour); the
        # lightest of those (90th percentile) decides, so a light patch behind a word counts and a neighbour's does not
        p0 = tuple(c[i] * a + bg0[i] * (1 - a) for i in range(3)); gap = dist(p0, bg0)
        inner = [px[x, y] for x in range(max(0, int(t['x'])), min(W, int(t['x'] + t['w'])))
                 for y in range(max(0, int(t['y'])), min(H, int(t['y'] + t['h']))) if dist(px[x, y], p0) > gap * 0.85]
        pool = inner if len(inner) >= 12 else ring
        pool.sort(key=lum)
        bg = pool[int(len(pool) * 0.9) - 1 if len(pool) > 10 else -1]
        paint = tuple(c[i] * a + bg[i] * (1 - a) for i in range(3))
        # a word that is not painted at all (scrolled out of its card, under a clip) is not measured
        far = dist(paint, bg)
        if far > 30:
            hits = 0
            for x in range(max(0, int(t['x'])), min(W, int(t['x'] + t['w']))):
                for y in range(max(0, int(t['y'])), min(H, int(t['y'] + t['h']))):
                    if dist(px[x, y], bg) > far * 0.35: hits += 1
            if hits < 3: continue
        L1, L2 = lum(paint), lum(bg)
        ratio = (max(L1, L2) + 0.05) / (min(L1, L2) + 0.05)
        bold = re.search(r'\b(7|8|9)00\b', t.get('font', ''))
        large = t['size'] >= 24 or (bold and t['size'] >= 18.66)
        need = 3.0 if large else 4.5
        total += 1
        if ratio < need: bad.append((ratio, need, base, t['text'][:40], t['color'], round(t['size'], 1)))
bad.sort()
for r, need, base, text, col, size in bad[:80]:
    print(f'{r:4.2f} < {need}  {base:34s} {size:>4}px {col:24s} "{text}"')
print(f'\n{total} words measured; {len(bad)} below AA')
