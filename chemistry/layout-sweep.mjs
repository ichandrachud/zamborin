/* Lessons in Chemistry · mobile layout sweep.   node chemistry/layout-sweep.mjs [level]

   The phone layout at 59 phone and tablet sizes: flask icons against their
   labels, labels against the dish, the dish against the tray, the tray against
   the controls, horizontal overflow, and the cell size. Each check compares
   two different things' boxes, never a number against the formula that made
   it. Needs the local server (see cdp.mjs). */
import { openPage, BASE, sleep } from './cdp.mjs';

const LEVEL = process.argv[2] || '4';          // 4 has methane, the tallest icon
const sizes = [];
for (const w of [320, 340, 360, 375, 390, 414, 430]) for (const h of [568, 640, 667, 720, 780, 844, 896, 932]) sizes.push([w, h]);
sizes.push([768, 1024], [820, 1180], [1024, 1366]);

const p = await openPage({ w: 390, h: 844, dpr: 2, mobile: true, settle: 0 });
let bad = 0;
const small = [];
try {
  for (const [w, h] of sizes) {
    await p.metrics(w, h, 2, true);
    await p.navigate(BASE + '?level=' + LEVEL, 700);
    const g = await p.ev(`(() => { const g = __chem.geom(), box = document.getElementById('game').getBoundingClientRect();
      const half = f => { const lay = ChemModel.layoutMolecule(f.key); return ((lay.h - 1) * f.span) / 2 + f.span * 0.28; };
      return { LW: g.LW, LH: g.LH, cw: Math.round(box.width), ch: Math.round(box.height), cell: g.dish.cell,
        iconTop: Math.min(...g.flaskSlots.map(f => f.y - half(f))), iconBottom: Math.max(...g.flaskSlots.map(f => f.y + half(f))),
        labelTop: Math.min(...g.flaskSlots.map(f => f.labelY - 8)), labelBottom: Math.max(...g.flaskSlots.map(f => f.labelY + 9)),
        dishTop: g.dish.y, dishBottom: g.dish.y + g.dish.h, dishL: g.dish.x, dishR: g.dish.x + g.dish.w,
        trayTop: g.tray.y, trayBottom: g.tray.y + g.tray.h, trayL: g.tray.x, trayR: g.tray.x + g.tray.w,
        ctrlTop: Math.min(...g.ctrl.map(b => b.y)), ctrlBottom: Math.max(...g.ctrl.map(b => b.y + b.h)) }; })()`);
    const issues = [];
    if (g.LW !== w || g.LH !== h) issues.push('frame ' + g.LW + 'x' + g.LH);
    if (g.cw !== w || g.ch !== h) issues.push('canvas box ' + g.cw + 'x' + g.ch);
    if (g.iconTop < 44) issues.push('icon into the read-out band');
    if (g.iconBottom > g.labelTop) issues.push('icon into its label by ' + (g.iconBottom - g.labelTop).toFixed(1));
    if (g.labelBottom > g.dishTop) issues.push('label into the dish by ' + (g.labelBottom - g.dishTop));
    if (g.dishBottom > g.trayTop) issues.push('dish into the tray by ' + (g.dishBottom - g.trayTop));
    if (g.trayBottom > g.ctrlTop) issues.push('tray into the controls by ' + (g.trayBottom - g.ctrlTop));
    if (g.ctrlBottom > h) issues.push('controls off screen');
    if (g.dishL < 0 || g.dishR > w || g.trayL < 0 || g.trayR > w) issues.push('horizontal overflow');
    if (g.cell < 44) small.push(w + 'x' + h + ' (' + g.cell + ')');
    if (issues.length) { bad++; console.log(`${w}x${h}  ${issues.join('; ')}`); }
  }
  if (p.errors.length) { bad++; console.log('console errors: ' + p.errors.join(' | ')); }
} finally { p.close(); }
console.log(bad ? `FAILED  ${bad} of ${sizes.length} sizes` : `ok  no collisions at ${sizes.length} sizes, level ${LEVEL}`);
console.log('cells under 44px: ' + (small.join(', ') || 'none'));
process.exit(bad ? 1 : 0);
