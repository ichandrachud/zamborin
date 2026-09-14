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
const p = await openPage({ w: 760, h: 600, dpr: 2, url: BASE + '?embed=1&drift=0&level=6' });
let failed = 0;
try {
  const nul = await p.ev(`(() => { ${LIB} return [ratio([255,255,255],[0,0,0]), ratio([128,128,128],[128,128,128])].map(v => +v.toFixed(2)); })()`);
  const nullOk = nul[0] === 21 && nul[1] === 1;
  console.log('null test, white on black and grey on grey (expect 21, 1):', nul.join(', '), nullOk ? 'ok' : 'FAILED');
  if (!nullOk) failed++;
  // Every element on a real dish: desktop level 6 carries iron, calcium, sodium
  // and hydrogen, a lone chlorine is dropped in a corner, and level 2 has oxygen.
  const SAMPLE = `(() => { ${LIB}
    const c = __chem, g = c.geom(), R = g.dish.cell * 0.28, out = {};
    for (const a of c.state.cells) {
      if (out[a.el]) continue;
      const q = g.cells[a.c + a.r * g.dish.cols], body = [];
      for (let k = 0; k < 16; k++) for (const f of [0.2, 0.45, 0.7, 0.85]) body.push([q.x + Math.cos(k/16*6.283)*R*f, q.y + Math.sin(k/16*6.283)*R*f]);
      const glass = avg([[q.x - g.dish.cell*0.36, q.y - g.dish.cell*0.36], [q.x + g.dish.cell*0.36, q.y - g.dish.cell*0.36]]);
      out[a.el] = { body: +ratio(avg(body), glass).toFixed(2), darkEdge: +ratio(px(q.x + R*0.6, q.y + R*0.6), glass).toFixed(2) };
    }
    return out; })()`;
  const res = {};
  await p.navigate(BASE + '?embed=1&drift=0&motion=reduce&level=6');
  await p.ev('(() => { __chem.freeze(0); __chem.place(7, 5); __chem.advance(900); })()');
  Object.assign(res, await p.ev(SAMPLE));
  await p.navigate(BASE + '?embed=1&drift=0&motion=reduce&level=2');
  await p.ev('__chem.freeze(0)');
  Object.assign(res, await p.ev(SAMPLE));
  for (const el of ['H', 'O', 'Cl', 'Na', 'Ca', 'Fe']) {
    const r = res[el];
    const pass = r && r.body >= 3;
    if (!pass) failed++;
    console.log(`${el}: body on glass ${r ? r.body : '?'}:1 ${pass ? 'ok' : 'UNDER 3:1'}   (darkest edge ${r ? r.darkEdge : '?'}:1)`);
  }
  if (p.errors.length) { failed++; console.log('console errors: ' + p.errors.join(' | ')); }
} finally { p.close(); }
console.log(failed ? `FAILED  ${failed}` : 'ok');
process.exit(failed ? 1 : 0);
