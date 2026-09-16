/* Litmus · phone layout sweep.   node chemistry/layout-sweep.mjs [level]

   The phone layout at 59 phone and tablet sizes. Each check compares two
   different things' boxes: target icons against their labels and the top
   band, labels against the dish, the dish against the Available panel, the
   panel against the controls, every slot inside the panel, every atom inside
   the dish, and nothing past the edges. Also the atom size, and the hit
   radius a finger gets. Needs the local server (see cdp.mjs). */
import { openPage, BASE } from './cdp.mjs';

const LEVEL = process.argv[2] || '22';
const MAP = LEVEL === 'map';                         // node chemistry/layout-sweep.mjs map
/* node chemistry/layout-sweep.mjs all: every molecules level at six phone sizes
   and the desktop frame. Each level's radicals placed with every one the list
   needs reachable, and its target row inside the frame, icon clear of icon. */
if (LEVEL === 'all') {
  const frames = [[320, 568, true], [360, 640, true], [375, 667, true], [390, 844, true], [430, 932, true], [768, 1024, true], [760, 600, false]];
  const q = await openPage({ w: 390, h: 844, dpr: 2, mobile: true, settle: 0 });
  let failed = 0;
  try {
    for (const [w, h, mob] of frames) {
      await q.metrics(w, h, mob ? 2 : 1, mob);
      await q.navigate(BASE + '?drift=0&level=1' + (mob ? '' : '&embed=1'), 900);
      const out = await q.ev(`(() => {
        const bad = [];
        for (let n = 1; n <= ChemLevels[__chem.state.mode].length; n++) {
          __chem.goto(n, 1);
          const s = __chem.state, g = __chem.geom(), f = g.flaskSlots, issues = [];
          if (s.placement.reachable !== s.placement.needed) issues.push('walled in ' + (s.placement.needed - s.placement.reachable) + ' of ' + s.placement.needed);
          const half = (t) => { const lay = ChemModel.layoutMolecule(t.key); return ((lay.w - 1) * t.span) / 2 + t.span * 0.4; };
          f.forEach((t, i) => {
            if (t.x - half(t) < 0 || t.x + half(t) > s.LW) issues.push(t.key + ' icon past the frame');
            if (i && f[i - 1].x + half(f[i - 1]) > t.x - half(t) - 2) issues.push(t.key + ' icon into ' + f[i - 1].key);
            if (s.mode === 'desktop' && t.labelX + t.maxW - 10 > s.LW - 20) issues.push(t.key + ' label past the frame');
            if (s.mode === 'desktop' && i && f[i - 1].labelX + f[i - 1].maxW - 10 > t.x - half(t)) issues.push(t.key + ' into the label before it');
          });
          if (issues.length) bad.push('level ' + n + ': ' + issues.join(', '));
        }
        return bad; })()`);
      if (out.length) { failed++; console.log(`${w}x${h}\n  ` + out.join('\n  ')); }
    }
    if (q.errors.length) { failed++; console.log('console errors: ' + q.errors.join(' | ')); }
  } finally { q.close(); }
  console.log(failed ? `FAILED  at ${failed} of ${frames.length} frames` : `ok  all molecules levels placed and fitted at ${frames.length} frames`);
  process.exit(failed ? 1 : 0);
}
const LAB = process.argv.find((a) => a === 'chapter=2' || a === 'chapter=3');     // node chemistry/layout-sweep.mjs 7 chapter=2
const sizes = [];
for (const w of [320, 340, 360, 375, 390, 414, 430]) for (const h of [568, 640, 667, 720, 780, 844, 896, 932]) sizes.push([w, h]);
sizes.push([768, 1024], [820, 1180], [1024, 1366]);

const p = await openPage({ w: 390, h: 844, dpr: 2, mobile: true, settle: 0 });
let bad = 0;
const notes = [];
try {
  for (const [w, h] of sizes) {
    await p.metrics(w, h, 2, true);
    if (MAP) {
      await p.navigate(BASE + '?drift=0&map=1&unlock=all', 800);
      const g = await p.ev('__chem.geom()'), v = g.view, issues = [];
      const ctrlTop = Math.min(...g.ctrl.map((b) => b.y)), ctrlBottom = Math.max(...g.ctrl.map((b) => b.y + b.h));
      if (g.phase !== 'map') issues.push('not on the map');
      if (v.titleW > w - 2 * v.pad + 0.5) issues.push('title wider than the frame');
      for (const hd of v.heads) {
        if (hd.titleRight > w - v.pad + 0.5) issues.push('"' + hd.text + '" past the side');
        if (hd.oneLine && hd.titleRight + 12 > hd.countLeft) issues.push('"' + hd.text + '" into its count');
      }
      if (g.cells.some((q) => q.x < 8 || q.x + q.w > w - 8)) issues.push('a cell past the side');
      if (g.cells.some((q) => q.w < 44 || q.h < 44)) issues.push('a cell under 44px');
      if (g.mode === 'mobile' && v.y + v.h > ctrlTop - 4) issues.push('map into the controls');
      if (v.y < Math.max(...g.ctrl.filter((b) => b.y < h / 2).map((b) => b.y + b.h), 0)) issues.push('map into the top controls');
      if (ctrlBottom > h) issues.push('controls off screen');
      const end = await p.ev('(__chem.scrollMap(1e9), __chem.geom())');
      const last = end.cells[end.cells.length - 1];
      if (!last || last.c !== 3 || last.y + last.h > end.view.y + end.view.h) issues.push('the last level cannot be scrolled into view');
      if (issues.length) { bad++; console.log(`${w}x${h}  ${issues.join('; ')}`); }
      continue;
    }
    await p.navigate(BASE + '?drift=0&level=' + LEVEL + (LAB ? '&' + LAB : ''), 800);
    if (LAB) {
      const g = await p.ev('__chem.geom()');
      const issues = [];
      const bottom = (r) => r.y + r.h, right = (r) => r.x + r.w;
      const ctrlTop = Math.min(...g.ctrl.map((b) => b.y)), ctrlBottom = Math.max(...g.ctrl.map((b) => b.y + b.h));
      const labelTop = Math.min(g.tube.y - 18, g.hints.tube.y);
      const targetBottom = Math.max(...g.targets.map((f) => f.labelY + 9));
      if (targetBottom > g.dish.y) issues.push('targets into the dish by ' + (targetBottom - g.dish.y).toFixed(1));
      if (bottom(g.dish) > labelTop) issues.push('dish into the bench headings by ' + (bottom(g.dish) - labelTop).toFixed(1));
      if (Math.max(bottom(g.tube), bottom(g.tray), bottom(g.beaker)) > ctrlTop) issues.push('bench into the controls');
      if (ctrlBottom > h) issues.push('controls off screen');
      if (g.tube.x < 0 || right(g.beaker) > w || right(g.tube) > g.tray.x || right(g.tray) > g.beaker.x) issues.push('bench overlaps or overflows');
      if (Object.values(g.pieces).some((c) => c.x < g.dish.x || c.x > right(g.dish) || c.y < g.dish.y || c.y > bottom(g.dish))) issues.push('a molecule outside the dish');
      // the words on the bench: on screen, clear of the shelf, the dish's words under the petri dish and above the controls
      const meets = (a, b) => a.x < right(b) && right(a) > b.x && a.y < bottom(b) && bottom(a) > b.y;
      for (const [name, box] of Object.entries(g.hints)) {
        if (box.x < 8 || right(box) > w - 8) issues.push(name + ' words past the side');
        if (g.traySlots.some((r) => meets(box, r))) issues.push(name + ' words over the shelf');
        if (bottom(box) > ctrlTop - 2) issues.push(name + ' words into the controls');
      }
      if (bottom(g.hints.tube) > g.tube.y + 2) issues.push('tube words into the tube');
      if (g.hints.dish.y < bottom(g.petri)) issues.push('dish words into the petri dish');
      if (bottom(g.hints.dish) > bottom(g.beaker) + 2) issues.push('dish words below their space');
      // the reaction card, for the reactions with the most to say and one with three products: all on screen, words clear of the button
      for (const [a, b] of [['hydrochloric-acid', 'calcium-hydroxide'], ['ammonium-nitrate', 'sodium-hydroxide'], ['calcium-oxide', 'water']]) {
        const rc = await p.ev(`(() => { __chem.lab.showCard('${a}', '${b}'); const r = __chem.geom().reactionCard; __chem.lab.closeCard(); return r; })()`);
        if (!rc) { issues.push('no card for ' + a + ' + ' + b); continue; }
        if (rc.box.x < 0 || right(rc.box) > w || rc.box.y < 0 || bottom(rc.box) > h) issues.push('reaction card off screen');
        if (rc.box.wordsBottom + 8 > rc.button.y) issues.push('reaction card words into its button by ' + (rc.box.wordsBottom + 8 - rc.button.y).toFixed(1));
        if (bottom(rc.button) > bottom(rc.box)) issues.push('reaction card button outside it');
      }
      if (LAB === 'chapter=3') {
        // the clue card, then the win card after the level's own solution: every line above the button, all on screen
        const cardOk = (c, cta, what) => {
          if (!c || !cta) { issues.push(what + ' card missing'); return; }
          if (c.textBottom + 8 > cta.y) issues.push(what + ' card text into its button by ' + (c.textBottom + 8 - cta.y).toFixed(1));
          if (c.y < 0 || bottom(c) > h) issues.push(what + ' card off screen');
          if (cta.y + cta.h > bottom(c)) issues.push(what + ' button outside its card');
        };
        cardOk(g.card, g.cta, 'clue');
        const won = await p.ev(`(() => { __chem.freeze(0); const s = __chem.state, L = __chem.lab;
          for (const [where, key] of ChemLevels.organic[s.mode][s.level - 1].solution) { L.act(where, L.find(key)); __chem.advance(2800); }
          __chem.advance(2600); return Object.assign(__chem.geom(), { kind: __chem.state.card }); })()`);
        if (won.kind !== 'win') issues.push('the solution did not win');
        else cardOk(won.card, won.cta, 'win');
      }
      if (issues.length) { bad++; console.log(`${w}x${h}  ${issues.join('; ')}`); }
      continue;
    }
    const g = await p.ev(`(() => { const g = __chem.geom(), box = document.getElementById('game').getBoundingClientRect();
      const half = (f) => { const lay = ChemModel.layoutMolecule(f.key); return ((lay.h - 1) * f.span) / 2 + f.span * 0.3; };
      return { g, cw: Math.round(box.width), ch: Math.round(box.height),
        iconTop: Math.min(...g.flaskSlots.map((f) => f.y - half(f))), iconBottom: Math.max(...g.flaskSlots.map((f) => f.y + half(f))),
        labelTop: Math.min(...g.flaskSlots.map((f) => f.labelY - 8)), labelBottom: Math.max(...g.flaskSlots.map((f) => f.labelY + 9)) }; })()`);
    const G = g.g, d = G.dish, pn = G.panel;
    const issues = [];
    if (G.LW !== w || G.LH !== h) issues.push('frame ' + G.LW + 'x' + G.LH);
    if (g.cw !== w || g.ch !== h) issues.push('canvas box ' + g.cw + 'x' + g.ch);
    if (g.iconTop < 44) issues.push('target icon into the top band');
    if (g.iconBottom > g.labelTop) issues.push('target icon into its label by ' + (g.iconBottom - g.labelTop).toFixed(1));
    if (g.labelBottom > d.y) issues.push('label into the dish by ' + (g.labelBottom - d.y).toFixed(1));
    if (d.y + d.h > pn.y) issues.push('dish into the panel by ' + (d.y + d.h - pn.y).toFixed(1));
    const ctrlTop = Math.min(...G.ctrl.map((b) => b.y)), ctrlBottom = Math.max(...G.ctrl.map((b) => b.y + b.h));
    if (pn.y + pn.h > ctrlTop) issues.push('panel into the controls by ' + (pn.y + pn.h - ctrlTop).toFixed(1));
    if (ctrlBottom > h) issues.push('controls off screen');
    if (d.x < 0 || d.x + d.w > w || pn.x < 0 || pn.x + pn.w > w) issues.push('horizontal overflow');
    if (G.slots.some((s) => s.x < pn.x - 0.5 || s.x + s.w > pn.x + pn.w + 0.5 || s.y < pn.y - 0.5 || s.y + s.h > pn.y + pn.h + 0.5)) issues.push('a slot outside the panel');
    if (Object.values(G.atoms).some((a) => a.x < d.x || a.x > d.x + d.w || a.y < d.y || a.y > d.y + d.h)) issues.push('an atom outside the dish');
    if (d.S < 12) issues.push('atoms under 12px radius (' + d.S.toFixed(1) + ')');
    if (d.WH < 11) notes.push(w + 'x' + h + ' dish only ' + d.WH.toFixed(1) + ' radii tall');
    if (issues.length) { bad++; console.log(`${w}x${h}  ${issues.join('; ')}`); }
  }
  if (p.errors.length) { bad++; console.log('console errors: ' + p.errors.join(' | ')); }
} finally { p.close(); }
console.log(bad ? `FAILED  ${bad} of ${sizes.length} sizes` : `ok  no collisions at ${sizes.length} sizes, ${MAP ? 'the map' : 'level ' + LEVEL}`);
if (notes.length) console.log('tight: ' + notes.join(', '));
process.exit(bad ? 1 : 0);
