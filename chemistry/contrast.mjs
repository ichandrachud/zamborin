/* Litmus · painted-pixel contrast.   node chemistry/contrast.mjs

   Reads the canvas backing store after the game draws, so it measures the
   pixel actually painted, not the source hex. Each atom's body (the mean of
   the disc) against the darkest glass around it. The formula is null-tested
   on known pairs first. Needs the local server (see cdp.mjs). */
import { openPage, BASE } from './cdp.mjs';

const LIB = `
  const lum = ([r,g,b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b); };
  const ratio = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A,B) + 0.05) / (Math.min(A,B) + 0.05); };
  const cv = document.getElementById('game'), cx = cv.getContext('2d'), k = cv.width / __chem.state.LW;
  const px = (x, y) => Array.from(cx.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data).slice(0, 3);
  const avg = (pts) => { const s = [0,0,0]; pts.forEach(p => { const c = px(p[0], p[1]); s[0]+=c[0]; s[1]+=c[1]; s[2]+=c[2]; }); return s.map(v => v / pts.length); };
`;
const p = await openPage({ w: 760, h: 600, dpr: 2, url: BASE + '?embed=1&drift=0&motion=reduce&level=22' });
let failed = 0;
try {
  const nul = await p.ev(`(() => { ${LIB} return [ratio([255,255,255],[0,0,0]), ratio([128,128,128],[128,128,128])].map(v => +v.toFixed(2)); })()`);
  const nullOk = nul[0] === 21 && nul[1] === 1;
  console.log('null test, white on black and grey on grey (expect 21, 1):', nul.join(', '), nullOk ? 'ok' : 'FAILED');
  if (!nullOk) failed++;
  // Desktop level 22's crowd carries every element in the game but carbon and nitrogen; level 44 needs both.
  const measure = (level) => p.ev(`(() => { ${LIB}
    __chem.goto(${level}, 1); __chem.freeze(0);
    const g = __chem.geom(), R = g.dish.S, out = {};
    for (const a of __chem.state.atoms) {
      if (out[a.el]) continue;
      const q = g.atoms[a.id], body = [];
      for (let t = 0; t < 16; t++) for (const f of [0.2, 0.45, 0.7, 0.85]) body.push([q.x + Math.cos(t/16*6.283)*R*f, q.y + Math.sin(t/16*6.283)*R*f]);
      // the page is the LIGHTEST thing around a marble now, so the ground is the lightest sample
      let glass = null;
      for (let t = 0; t < 12; t++) {
        const c = px(q.x + Math.cos(t/12*6.283)*R*2.7, q.y + Math.sin(t/12*6.283)*R*2.7);
        if (!glass || lum(c) > lum(glass)) glass = c;
      }
      out[a.el] = { body: +ratio(avg(body), glass).toFixed(2), glass };
    }
    return out; })()`);
  /* The Chem Lab's own marbles: potassium, zinc, copper, bromine and sulphur
     never float in chapter 1, so they are measured on the bench instead, where
     the molecules are drawn smaller and the glass behind them is the same. */
  const bench = (chapter, level) => p.ev(`(() => { ${LIB}
    __chem.goto(${level}, ${chapter}); __chem.freeze(0); __chem.advance(200);
    const g = __chem.geom(), R = g.marble, out = {};
    for (const a of g.atoms) {
      if (out[a.el]) continue;
      const body = [];
      for (let t = 0; t < 16; t++) for (const f of [0.2, 0.45, 0.7]) body.push([a.x + Math.cos(t/16*6.283)*R*f, a.y + Math.sin(t/16*6.283)*R*f]);
      let glass = null;
      for (let t = 0; t < 12; t++) {
        const c = px(a.x + Math.cos(t/12*6.283)*R*3.4, a.y + Math.sin(t/12*6.283)*R*3.4);
        if (!glass || lum(c) > lum(glass)) glass = c;
      }
      out[a.el] = { body: +ratio(avg(body), glass).toFixed(2), glass };
    }
    return out; })()`);
  const res = Object.assign(await measure(44), await measure(22));
  const lab = Object.assign({}, await bench(2, 26), await bench(2, 28), await bench(2, 3), await bench(2, 9));
  for (const el of ['H', 'O', 'N', 'C', 'F', 'Cl', 'Na', 'Mg', 'Al', 'Ca', 'Fe']) {
    const r = res[el];
    const pass = r && r.body >= 3;
    if (!pass) failed++;
    console.log(`${el}: body on glass ${r ? r.body : '?'}:1 ${pass ? 'ok' : 'UNDER 3:1'}`);
  }
  for (const el of ['K', 'Zn', 'Cu', 'Br', 'S']) {
    const r = lab[el];
    const pass = r && r.body >= 3;
    if (!pass) failed++;
    console.log(`${el}: body on the bench glass ${r ? r.body : 'never drawn'}:1 ${pass ? 'ok' : 'UNDER 3:1'}`);
  }
  /* The palms: the dot at the end of every free hand, which was white and
     vanished on the paper page (owner, 2026-09-19). On the ring a palm sits
     on, the darkest pixel is the palm; the paper is the lightest pixel further
     out. Every free atom on a crowded molecules level. */
  const palms = await p.ev(`(() => { ${LIB}
    __chem.goto(22, 1); __chem.freeze(0); __chem.advance(200);
    const g = __chem.geom(), s = __chem.state, S = g.dish.S, reach = 1.8, out = [];
    for (const a of s.atoms.filter((q) => q.free > 0)) {
      const c = g.atoms[a.id]; if (!c) continue;
      let dark = null, ground = null;
      for (let t = 0; t < 180; t++) { const q = px(c.x + Math.cos(t / 180 * 6.2832) * reach * S, c.y + Math.sin(t / 180 * 6.2832) * reach * S); if (!dark || lum(q) < lum(dark)) dark = q; }
      for (let t = 0; t < 24; t++) { const q = px(c.x + Math.cos(t / 24 * 6.2832) * 3.2 * S, c.y + Math.sin(t / 24 * 6.2832) * 3.2 * S); if (!ground || lum(q) > lum(ground)) ground = q; }
      out.push([a.el, +ratio(dark, ground).toFixed(2)]);
    }
    return out; })()`);
  const worst = palms.reduce((m, q) => (q[1] < m[1] ? q : m), ['none', 99]);
  const palmsOk = palms.length > 0 && worst[1] >= 3;
  if (!palmsOk) failed++;
  console.log(`palms: ${palms.length} measured, lowest ${worst[0]} ${worst[1]}:1 ${palmsOk ? 'ok' : 'UNDER 3:1'}`);
  if (p.errors.length) { failed++; console.log('console errors: ' + p.errors.join(' | ')); }
} finally { p.close(); }
console.log(failed ? `FAILED  ${failed}` : 'ok');
process.exit(failed ? 1 : 0);
