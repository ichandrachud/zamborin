/* Karrots — sprite pipeline.
 *
 * The 2014 cast was drawn with black cut-lines. DESIGN-SYSTEM.md §6 forbids
 * outlines on game pieces, and the owner ruled on 2026-09-06 to strip them
 * rather than keep them as a stated exception. Stripping alone is not the
 * whole job, because §6 does not say "delete the edge", it says define it with
 * VALUE. Three things happen here:
 *
 *   1. Every stroke is removed.
 *   2. Elements the strip made INVISIBLE get a value fill instead. A white
 *      shape edged in black — the tail, the smile, the muzzle — is white on
 *      white once the edge goes, and simply vanishes. Which elements those are
 *      is not guessed: `tune-art.mjs` renders each one hidden and shown and
 *      diffs the pixels, and the ones that make no difference are listed in
 *      art/invisible.json. See feedback_detector_must_compare_independent_things.
 *   3. The viewBox is re-cropped to the painted box in art/bbox.json. The
 *      Illustrator exports carry sheet coordinates, so a sprite drawn 1:1 into
 *      a cell would land somewhere off in an empty artboard.
 *
 * Every stroked element gets a `kvN` class on the way through so steps 2 and 3
 * can address one element rather than a whole Illustrator class, which is
 * shared by the fox's body and the curve of its ear alike.
 *
 * Run: node karrots/build-sprites.mjs
 * Not served: .mjs is not part of the deployment.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = '/Users/indrajeetchandrachud/Library/Mobile Documents/com~apple~CloudDocs/' +
            'Claude Projects/Zamborin/source-assets/karrots/2014-vector';
const OUT = new URL('./art/', import.meta.url).pathname;

export const CAST = {
  'bunny-idle':  'bunny-idle-1.svg',
  'bunny-down-1':'bunny-down-1.svg', 'bunny-down-2':'bunny-down-2.svg',
  'bunny-down-3':'bunny-down-3.svg', 'bunny-down-4':'bunny-down-4.svg',
  'bunny-down-5':'bunny-down-5.svg',
  'bunny-up-1':  'bunny-up-1.svg',   'bunny-up-2':  'bunny-up-2.svg',
  'bunny-up-3':  'bunny-up-3.svg',   'bunny-up-4':  'bunny-up-4.svg',
  'bunny-side-1':'bunny-side-1.svg', 'bunny-side-2':'bunny-side-2.svg',
  'bunny-side-3':'bunny-side-3.svg',
  'fox-still':   'new/fox still.svg',
  'fox-walk-1':  'new/fox walk 1.svg',
  'fox-walk-2':  'new/fox walk 2.svg',
  // The owner redrew this on 2026-09-07. The old one was a crop out of a
  // sprite sheet: a viewBox that cut the leaves off and a drop shadow baked in.
  'carrot':      'carrot-2026-09-07.svg',
  'brick':       'new/brick wall.svg',
};

/* --- the value palette -------------------------------------------------
 * Light from up and slightly left, per §6. `recede` is what a shape that used
 * to be held by a line becomes: a tone of the body colour, dark enough to read
 * as form and light enough not to read as a line.
 */
const VALUE = {
  bunny: { recede: '#E6DEE8', deep: '#D4CAD8' },   // cool off-white on #FFFFFF
  fox:   { recede: '#D8452A', deep: '#BE3A26' },   // the fox's own darker reds
};
const familyOf = n => n.startsWith('fox') ? 'fox' : 'bunny';
const LINE_W = 4;   // source units; the 2014 files drew these at 2 and they all but vanish

/* --- stroke removal ----------------------------------------------------- */
const STROKE_PROPS = /(?:^|[;{\s])(stroke|stroke-width|stroke-miterlimit|stroke-linecap|stroke-linejoin|stroke-dasharray)\s*:\s*[^;}]*;?/g;

function parseRules(css) {
  const out = {};
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const decls = {};
    for (const d of body.split(';')) {
      const i = d.indexOf(':');
      if (i > 0) decls[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    }
    for (const s of sel.split(',')) {
      const t = s.trim();
      if (t.startsWith('.')) Object.assign(out[t.slice(1)] ??= {}, decls);
    }
  }
  return out;
}

function build(name, file, invisible) {
  let svg = readFileSync(join(SRC, file), 'utf8');
  const css = [...svg.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('');
  const rules = parseRules(css);
  const fam = VALUE[familyOf(name)];

  // 1 — tag every element whose class carries a stroke, in document order, so
  //     the detector and this script agree on what `kv3` refers to.
  let kv = 0;
  svg = svg.replace(/class="(st\d+)"/g, (m, cls) =>
    rules[cls] && 'stroke' in rules[cls] ? `class="${cls} kv${kv++}"` : m);

  // 2 — drop the strokes.
  svg = svg.replace(/<style>([\s\S]*?)<\/style>/g, (m, c) =>
    `<style>${c.replace(STROKE_PROPS, d => (/^[;{\s]/.test(d) ? d[0] : ''))}</style>`);
  svg = svg.replace(/\s(stroke|stroke-width|stroke-miterlimit|stroke-linecap|stroke-linejoin|stroke-dasharray)="[^"]*"/g, '');

  // 3 — give the elements the strip made invisible a value fill. `deep` for a
  //     shape that reads as behind (a stroke-only line had no fill of its own
  //     and was always a crease or a shadow); `recede` for a filled shape that
  //     merely lost its edge.
  //     A shape that had a fill and lost its edge gets a `recede` fill: it is
  //     still a shape, it just needs to differ from the white beside it by
  //     value now instead of by a line. A path that never had a fill was a
  //     drawn LINE - a mouth, a crease - and a fill would close it into a
  //     lens, so it gets its line back in the body's own darker tone. A tonal
  //     line is shading; the thing §6 forbids is the black cut-line.
  const gone = invisible[name] || [];
  if (gone.length) {
    const decls = gone.map(g => g.wasFillNone
      ? `.kv${g.kv}{fill:none;stroke:${fam.deep};stroke-width:${LINE_W};stroke-linecap:round;stroke-miterlimit:10}`
      : `.kv${g.kv}{fill:${fam.recede}}`).join('');
    svg = svg.replace('</style>', decls + '</style>');
  }

  // 4 — a rule left with nothing in it is noise.
  svg = svg.replace(/<style>([\s\S]*?)<\/style>/g, (m, c) =>
    `<style>${c.replace(/[^{}]+\{\s*\}/g, '')}</style>`);
  svg = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/\n\s*\n/g, '\n');

  return { svg, kvCount: kv };
}

function recrop(svg, box) {
  if (!box) return svg;
  const pad = Math.max(box.w, box.h) * 0.02;
  const vb = [box.x - pad, box.y - pad, box.w + pad * 2, box.h + pad * 2]
    .map(n => +n.toFixed(2)).join(' ');
  /* Strip width/height FROM THE ROOT TAG ONLY, so the viewBox governs the
     size. Doing it across the whole file - which is what this did - also ate
     the width and height of every <rect>, and the brick wall is nine
     rectangles: it built, it loaded, it reported a natural size of 150x150,
     and it painted absolutely nothing. */
  return svg.replace(/<svg\b[^>]*>/, tag => tag
      .replace(/viewBox="[^"]*"/, `viewBox="${vb}"`)
      .replace(/\s(width|height)="[^"]*"/g, ''));
}

const readJSON = f => existsSync(join(OUT, f)) ? JSON.parse(readFileSync(join(OUT, f), 'utf8')) : {};

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(OUT, { recursive: true });
  const bbox = readJSON('bbox.json'), invisible = readJSON('invisible.json');
  let kvTotal = 0, fixed = 0;
  for (const [name, file] of Object.entries(CAST)) {
    const { svg, kvCount } = build(name, file, invisible);
    kvTotal += kvCount;
    fixed += (invisible[name] || []).length;
    writeFileSync(join(OUT, name + '.svg'), recrop(svg, bbox[name]));
  }
  console.log(`${Object.keys(CAST).length} sprites · ${kvTotal} stroked elements tagged · ` +
              `${fixed} given a value fill · ${Object.keys(bbox).length} re-cropped`);
}
export { build, VALUE, familyOf };
