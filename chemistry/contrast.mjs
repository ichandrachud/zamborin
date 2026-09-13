/* Lessons in Chemistry · painted-pixel contrast.   node chemistry/contrast.mjs

   Reads the canvas backing store after the game draws, so it measures the
   pixel actually painted, not the source hex (Relic's source hexes said 3.43
   and the screen said 2.93). The formula is null-tested on known pairs first.
   Needs the local server (see cdp.mjs). */
import { openPage, BASE } from './cdp.mjs';

const LIB = `
  const lum = ([r,g,b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b); };
  const ratio = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A,B) + 0.05) / (Math.min(A,B) + 0.05); };
  const cv = document.getElementById('game'), cx = cv.getContext('2d'), k = cv.width / __chem.state.LW;
  const px = (x, y) => Array.from(cx.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data).slice(0, 3);
  const avg = (pts) => { const s = [0,0,0]; pts.forEach(p => { const c = px(p[0], p[1]); s[0]+=c[0]; s[1]+=c[1]; s[2]+=c[2]; }); return s.map(v => v / pts.length); };
`;
const p = await openPage({ w: 760, h: 600, dpr: 2, url: BASE + '?embed=1&level=5' });
let failed = 0;
try {
  const nul = await p.ev(`(() => { ${LIB} return [ratio([255,255,255],[0,0,0]), ratio([128,128,128],[128,128,128])].map(v => +v.toFixed(2)); })()`);
  const nullOk = nul[0] === 21 && nul[1] === 1;
  console.log('null test, white on black and grey on grey (expect 21, 1):', nul.join(', '), nullOk ? 'ok' : 'FAILED');
  if (!nullOk) failed++;
  // Desktop level 5 carries all four elements: place them apart and sample.
  const res = await p.ev(`(() => { ${LIB}
    const c = __chem; c.freeze(0);
    [[1,1],[0,4],[4,1],[6,4]].forEach(q => { c.place(...q); c.advance(900); });   // O, H (alone), N, C
    const g = c.geom(), R = g.dish.cell * 0.28, cell = (cc, rr) => g.cells[cc + rr * g.dish.cols];
    const out = {};
    for (const [el, cc, rr] of [['H',0,4],['O',1,1],['N',4,1],['C',6,4]]) {
      const q = cell(cc, rr), body = [];
      for (let a = 0; a < 16; a++) for (const f of [0.2, 0.45, 0.7, 0.85]) body.push([q.x + Math.cos(a/16*6.283)*R*f, q.y + Math.sin(a/16*6.283)*R*f]);
      const glass = avg([[q.x - g.dish.cell*0.36, q.y - g.dish.cell*0.36], [q.x + g.dish.cell*0.36, q.y - g.dish.cell*0.36]]);
      out[el] = { body: +ratio(avg(body), glass).toFixed(2), darkEdge: +ratio(px(q.x + R*0.6, q.y + R*0.6), glass).toFixed(2) };
    }
    // a green palm, found on the painted oxygen's cell
    const o = cell(1,1); let green = null;
    for (let dy = -g.dish.cell/2; dy <= g.dish.cell/2 && !green; dy++) for (let dx = -g.dish.cell/2; dx <= g.dish.cell/2 && !green; dx++) {
      const v = px(o.x + dx, o.y + dy); if (v[1] > 180 && v[0] < 120) green = v; }
    out.palmGreen = green ? +ratio(green, [10,17,32]).toFixed(2) : null;
    return out; })()`);
  for (const el of ['H', 'O', 'N', 'C']) {
    const pass = res[el].body >= 3;
    if (!pass) failed++;
    console.log(`${el}: body on glass ${res[el].body}:1 ${pass ? 'ok' : 'UNDER 3:1'}   (darkest edge ${res[el].darkEdge}:1)`);
  }
  console.log('green palm on glass: ' + res.palmGreen + ':1 ' + (res.palmGreen >= 3 ? 'ok' : 'UNDER 3:1'));
  if (!(res.palmGreen >= 3)) failed++;
  if (p.errors.length) { failed++; console.log('console errors: ' + p.errors.join(' | ')); }
} finally { p.close(); }
console.log(failed ? `FAILED  ${failed}` : 'ok');
process.exit(failed ? 1 : 0);
