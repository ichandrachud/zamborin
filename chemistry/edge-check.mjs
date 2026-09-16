/* Litmus · nothing within 10px of the rim.   node chemistry/edge-check.mjs [quick]

   The owner, 2026-09-15: atoms were going over the dish's border; "make sure
   they stay inside at least 10 px". This reads the painted canvas, not the
   positions: the strip from 2 to 10px inside the glass rim, along all four
   sides, must hold nothing brighter than the dark glass. Every part of an
   atom (arms, palms, bodies) and every formula label is far brighter. The
   strip starts 2px in because the rim's own soft edge is lighter; a palm is
   at least 5px across, so one that reached the first 2px shows in the rest.
   The rounded corners are left out; the walls keep hands clear of them too.

   Checked, at four phone sizes and the desktop frame: every level of all
   three chapters as it loads and after 20 seconds of drift, and, in chapter
   1, an atom dragged hard against each wall. `quick` runs a few levels at two
   sizes. Needs the local server (see cdp.mjs). */
import { openPage, BASE } from './cdp.mjs';

const QUICK = process.argv.includes('quick');
const frames = QUICK ? [[320, 568, true], [760, 600, false]]
  : [[320, 568, true], [375, 667, true], [390, 844, true], [430, 932, true], [760, 600, false]];

const EDGE = `(() => {
  const g = __chem.geom(), s = __chem.state, cv = document.getElementById('game'), cx = cv.getContext('2d'), k = cv.width / s.LW;
  const d = g.dish, ix = d.x + 7, iy = d.y + 7, iw = d.w - 14, ih = d.h - 14, skip = 22;
  const lum = (r, gg, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b); };
  const out = [];
  const scan = (x0, y0, w, h, side) => {
    const X = Math.round(x0 * k), Y = Math.round(y0 * k), W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k));
    const px = cx.getImageData(X, Y, W, H).data;
    let worst = 0;
    for (let i = 0; i < px.length; i += 4) worst = Math.max(worst, lum(px[i], px[i + 1], px[i + 2]));
    if (worst > 0.05) out.push(side + ' ' + worst.toFixed(3));
  };
  scan(ix + skip, iy + 2, iw - 2 * skip, 8, 'top');
  scan(ix + skip, iy + ih - 10, iw - 2 * skip, 8, 'bottom');
  scan(ix + 2, iy + skip, 8, ih - 2 * skip, 'left');
  scan(ix + iw - 10, iy + skip, 8, ih - 2 * skip, 'right');
  return out; })()`;
// An organic level opens on its clue card, which holds the dish still: press START.
const START = `(() => { const s = __chem.state, g = __chem.geom();
  if (s.card !== 'clue' || !g.cta) return;
  const cv = document.getElementById('game'), r = cv.getBoundingClientRect();
  const x = r.left + (g.cta.x + g.cta.w / 2) * r.width / s.LW, y = r.top + (g.cta.y + g.cta.h / 2) * r.height / s.LH;
  for (const type of ['pointerdown', 'pointerup']) cv.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', bubbles: true }));
})()`;

const p = await openPage({ w: 390, h: 844, dpr: 2, mobile: true, settle: 0 });
let bad = 0, checks = 0;
const report = (where, hits) => { checks++; if (hits.length) { bad++; console.log(where + ': ' + hits.join(', ')); } };
try {
  for (const [w, h, mob] of frames) {
    await p.metrics(w, h, 2, mob);
    const tag = w + 'x' + h;
    for (const chapter of [1, 2, 3]) {
      await p.navigate(BASE + '?seed=11&chapter=' + chapter + '&level=1' + (mob ? '' : '&embed=1'), 900);
      const count = await p.ev(`(${chapter} === 1 ? ChemLevels : ${chapter} === 2 ? ChemLevels.lab : ChemLevels.organic)[__chem.state.mode].length`);
      const levels = QUICK ? [1, Math.ceil(count / 2), count] : Array.from({ length: count }, (_, i) => i + 1);
      for (const n of levels) {
        await p.ev(`(__chem.goto(${n}, ${chapter}), __chem.freeze(0))`);
        await p.ev(START);
        report(`${tag} chapter ${chapter} level ${n} as it loads`, await p.ev(EDGE));
        await p.ev('__chem.advance(20000)');
        report(`${tag} chapter ${chapter} level ${n} after 20 s of drift`, await p.ev(EDGE));
      }
    }
    // an atom carried hard against each wall: the oxygen of level 1, alone in the dish
    await p.navigate(BASE + '?seed=11&crowd=0&level=1' + (mob ? '' : '&embed=1'), 900);
    for (const [name, fx, fy] of [['top', 0.5, -9], ['bottom', 0.5, 9], ['left', -9, 0.5], ['right', 9, 0.5]]) {
      const hits = await p.ev(`(() => { __chem.freeze(0); const s = __chem.state, d = __chem.geom().dish, o = s.atoms.find((a) => a.el === 'O');
        const tx = ${fx} < 0 ? -9 : ${fx} > 1 ? d.WW + 9 : d.WW * ${fx}, ty = ${fy} < 0 ? -9 : ${fy} > 1 ? d.WH + 9 : d.WH * ${fy};
        __chem.carry(o.id, tx, ty, { hold: true, steps: 80 });
        const out = ${EDGE};
        __chem.drop();
        return out; })()`);
      report(`${tag} dragged against the ${name} wall`, hits);
    }
  }
  if (p.errors.length) { bad++; console.log('console errors: ' + p.errors.join(' | ')); }
} finally { p.close(); }
console.log(bad ? `FAILED  ${bad} of ${checks} checks` : `ok  nothing within 10px of the rim in ${checks} checks`);
process.exit(bad ? 1 : 0);
