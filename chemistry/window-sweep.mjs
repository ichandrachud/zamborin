/* Litmus · the landscape layout in any window.   node chemistry/window-sweep.mjs [quick]

   In an embed, a portal package and full screen the game takes the window's
   own shape (play.js setCanvasVars): laid out at least 760 across and 450
   tall, at most 720 tall, and scaled to the window. This loads it as an embed
   at CrazyGames' ten window sizes, a grid of other landscape windows and a few
   smaller than the site frame, and at each one checks, on the boxes the game
   reports: the canvas fills the window; the controls sit in the top band with
   the read-out clear of them; the target row stays inside the frame, icon
   clear of icon and label, and above the dish; the dish and what sits beside
   it do not meet; every atom and molecule is inside the dish; the bench's
   tube, shelf and petri dish are stacked without touching, their words clear
   of them and on screen; the reaction card and the clue and win cards fit;
   the map's cells are on screen. And the 760x600 site frame, not embedded, is
   the frame as designed, to the pixel; the site's own full screen fills the
   window with the read-out clear of the page's exit button, and leaving it
   gives the frame back. Needs the local server (see cdp.mjs). */
import { openPage, BASE, sleep } from './cdp.mjs';

const QUICK = process.argv.includes('quick');
const CG = [[907, 510], [1216, 684], [1077, 606], [821, 462], [1366, 768], [1920, 1080], [1536, 864], [1280, 720], [800, 450, true], [1080, 607, true]];
const grid = [];
for (const w of [760, 840, 960, 1100, 1280, 1440, 1680]) for (const h of [450, 500, 560, 620, 700, 800, 940]) if (w > h * 1.05) grid.push([w, h]);
const small = [[480, 360], [640, 400], [700, 480], [760, 420]];
const windows = QUICK ? CG : [...CG, ...grid, ...small];

const p = await openPage({ w: 907, h: 510, dpr: 1, settle: 0 });
let bad = 0;
const fail = (tag, issues) => { if (issues.length) { bad++; console.log(`${tag}  ${issues.join('; ')}`); } };
const right = (r) => r.x + r.w, bottom = (r) => r.y + r.h;
const meets = (a, b) => a.x < right(b) && right(a) > b.x && a.y < bottom(b) && bottom(a) > b.y;
try {
  // the site frame, not embedded: exactly as designed
  await p.metrics(1280, 900, 1, false);
  await p.navigate(BASE + '?drift=0&seed=11&level=22', 1200);
  const site = await p.ev(`(() => { const g = __chem.geom(); __chem.goto(16, 2); const b = __chem.geom();
    return { LW: g.LW, LH: g.LH, dish: [g.dish.x, g.dish.y, g.dish.w, g.dish.h, g.dish.S], lab: [b.dish.x, b.dish.y, b.dish.w, b.dish.h, b.dish.S],
             tube: [b.tube.y, b.tube.h], tray: [b.tray.y, b.tray.h], beaker: [b.beaker.y, b.beaker.h] }; })()`);
  fail('site frame', [
    ...(site.LW === 760 && site.LH === 600 ? [] : ['frame ' + site.LW + 'x' + site.LH]),
    ...(JSON.stringify(site.dish) === JSON.stringify([30, 140, 532, 440, 532 / 36]) ? [] : ['molecules dish ' + site.dish]),
    ...(JSON.stringify(site.lab) === JSON.stringify([30, 140, 420, 440, 420 / 26]) ? [] : ['lab dish ' + site.lab]),
    ...(JSON.stringify([site.tube, site.tray, site.beaker]) === '[[162,182],[370,94],[490,90]]' ? [] : ['bench ' + JSON.stringify([site.tube, site.tray, site.beaker])]),
  ]);

  // the site's own full screen
  await p.metrics(1440, 900, 1, false);
  await p.navigate(BASE + '?drift=0&seed=11&chapter=2&level=16', 1200);
  const FULL = `(() => { const s = __chem.state, g = __chem.geom(), r = document.getElementById('game').getBoundingClientRect(), b = document.getElementById('focus-toggle').getBoundingClientRect();
    return { LW: s.LW, LH: s.LH, box: [r.left, r.top, r.width, r.height].map(Math.round), button: b.left, readoutRight: (g.readout.x + g.readout.w) * r.width / s.LW }; })()`;
  await p.ev(`document.getElementById('focus-toggle').click()`); await sleep(500);
  const on = await p.ev(FULL);
  await p.ev(`document.getElementById('focus-toggle').click()`); await sleep(500);
  const off = await p.ev(FULL);
  fail('site full screen', [
    ...(on.box.join() === '0,0,1440,900' && on.LW === 1152 && on.LH === 720 ? [] : ['fills ' + on.box + ' at ' + on.LW + 'x' + on.LH]),
    ...(on.readoutRight <= on.button - 8 ? [] : ['read-out under the exit button (ends ' + on.readoutRight.toFixed(0) + ', button at ' + on.button + ')']),
    ...(off.LW === 760 && off.LH === 600 && off.box[2] === 760 ? [] : ['leaving it gives ' + off.LW + 'x' + off.LH + ' in ' + off.box]),
  ]);

  for (const [w, h, touch] of windows) {
    const tag = `${w}x${h}${touch ? ' touch' : ''}`;
    await p.metrics(w, h, 1, !!touch);
    await p.navigate(BASE + '?embed=1&drift=0&seed=11&level=22', 1000);
    const issues = [];
    const frame = await p.ev(`(() => { const s = __chem.state, r = document.getElementById('game').getBoundingClientRect();
      return { mode: s.mode, LW: s.LW, LH: s.LH, box: [r.left, r.top, r.width, r.height].map(Math.round) }; })()`);
    if (frame.mode !== 'desktop') issues.push('mode ' + frame.mode);
    if (frame.box.join() !== [0, 0, w, h].join()) issues.push('canvas box ' + frame.box.join(','));
    if (frame.LW < 760 || frame.LH < 450 || (frame.LH > 720 && frame.LW > 760)) issues.push('logical ' + frame.LW + 'x' + frame.LH);
    if (Math.abs(frame.LW / frame.LH - w / h) > 0.01) issues.push('logical shape ' + frame.LW + 'x' + frame.LH + ' is not the window\'s');
    const LW = frame.LW, LH = frame.LH;
    const band = (g) => {
      const top = Math.min(...g.ctrl.map((b) => b.y)), low = Math.max(...g.ctrl.map((b) => b.y + b.h)), rgt = Math.max(...g.ctrl.map((b) => b.x + b.w));
      const out = [];
      if (top < 0 || low > 56) out.push('controls outside the top band');
      if (!g.readout || g.readout.x < rgt + 2 || right(g.readout) > LW) out.push('read-out into the controls or off the side');
      return { out, low };
    };

    // chapter 1: two crowded levels, one of them with three molecules to make
    for (const n of [22, 44]) {
      const m = await p.ev(`(() => { __chem.goto(${n}, 1); const g = __chem.geom(), s = __chem.state;
        const half = (f) => { const lay = ChemModel.layoutMolecule(f.key); return { x: ((lay.w - 1) * f.span) / 2 + f.span * 0.4, y: ((lay.h - 1) * f.span) / 2 + f.span * 0.3 }; };
        return { g, placement: s.placement, rows: g.flaskSlots.map((f) => ({ key: f.key, l: f.x - half(f).x, r: f.x + half(f).x, t: f.y - half(f).y, b: f.y + half(f).y, labelX: f.labelX, maxW: f.maxW, labelY: f.labelY })) }; })()`);
      const g = m.g, d = g.dish, pn = g.panel, where = 'molecules ' + n + ': ';
      const b = band(g);
      b.out.forEach((q) => issues.push(where + q));
      m.rows.forEach((f, i) => {
        if (f.l < 0 || f.r > LW) issues.push(where + f.key + ' icon past the frame');
        if (f.t < b.low + 4) issues.push(where + f.key + ' icon into the controls');
        if (i && m.rows[i - 1].labelX + m.rows[i - 1].maxW - 10 > f.l) issues.push(where + f.key + ' into the label before it');
        if (f.labelX + f.maxW - 10 > LW - 20) issues.push(where + f.key + ' label past the frame');
        if (Math.max(f.b, f.labelY + 9) > d.y) issues.push(where + f.key + ' into the dish');
      });
      if (d.x < 0 || right(d) > pn.x || right(pn) > LW || bottom(d) > LH || bottom(pn) > LH) issues.push(where + 'dish and panel overlap or overflow');
      if (g.slots.some((s) => s.x < pn.x - 0.5 || right(s) > right(pn) + 0.5 || s.y < pn.y - 0.5 || bottom(s) > bottom(pn) + 0.5)) issues.push(where + 'a slot outside the panel');
      if (Object.values(g.atoms).some((a) => a.x < d.x || a.x > right(d) || a.y < d.y || a.y > bottom(d))) issues.push(where + 'an atom outside the dish');
      if (m.placement.reachable !== m.placement.needed) issues.push(where + 'a needed radical walled in');
      // the smallest logical window, 760x450, draws them at 11.997px: the 12px the phones hold, to rounding
      if (d.S < 11.99) issues.push(where + 'atoms under 12px radius (' + d.S.toFixed(3) + ')');
      const room = d.WW * d.WH, frameRoom = 36 * (440 / (532 / 36));
      if (d.S < 21.999 && Math.abs(room / frameRoom - 1) > 0.001) issues.push(where + 'room ' + room.toFixed(0) + ' radii squared, not the frame\'s ' + frameRoom.toFixed(0));
    }

    // chapters 2 and 3: a bench with three molecules to make, and the organic bench with its clue and win cards
    for (const [c, n] of QUICK ? [[2, 16], [3, 40]] : [[2, 16], [2, 49], [3, 1], [3, 40]]) {
      const where = (c === 2 ? 'Chem Lab ' : 'Carbon Lab ') + n + ': ';
      const g = await p.ev(`(__chem.goto(${n}, ${c}), __chem.geom())`);
      const b = band(g);
      b.out.forEach((q) => issues.push(where + q));
      const tops = await p.ev(`__chem.geom().targets.map((f) => ({ key: f.key, t: f.y - Math.max(...ChemLab.SPECIES[f.key].atoms.map((a) => Math.abs(a.y))) * f.unit - f.unit * 0.305,
        l: f.x - (ChemLab.SPECIES[f.key].extent * f.unit + f.unit * 0.305), r: f.x + (ChemLab.SPECIES[f.key].extent * f.unit + f.unit * 0.305), labelX: f.labelX, maxW: f.maxW, labelY: f.labelY }))`);
      tops.forEach((f, i) => {
        if (f.t < b.low + 4) issues.push(where + f.key + ' into the controls');
        if (f.l < 0 || f.labelX + f.maxW - 10 > LW - 20) issues.push(where + f.key + ' past the frame');
        if (i && tops[i - 1].labelX + tops[i - 1].maxW - 10 > f.l) issues.push(where + f.key + ' into the label before it');
        if (f.labelY + 9 > g.dish.y) issues.push(where + f.key + ' label into the dish');
      });
      const col = [g.tube, g.tray, g.beaker];
      if (right(g.dish) > g.tube.x || col.some((r) => right(r) > LW - 20 || r.x < right(g.dish))) issues.push(where + 'dish into the bench column');
      if (bottom(g.dish) > LH || bottom(g.beaker) > LH - 4) issues.push(where + 'off the bottom');
      if (bottom(g.tube) > g.tray.y - 18) issues.push(where + 'tube into the shelf heading by ' + (bottom(g.tube) - g.tray.y + 18).toFixed(1));
      if (bottom(g.tray) > g.beaker.y) issues.push(where + 'shelf into the petri dish');
      if (g.hints.tube.y < g.targetsArea.y + g.targetsArea.h - 2) issues.push(where + 'tube words into the target row');
      if (bottom(g.hints.tube) > g.tube.y + 2) issues.push(where + 'tube words into the tube');
      if (g.hints.dish.y < bottom(g.petri)) issues.push(where + 'dish words into the petri dish');
      if (bottom(g.hints.dish) > LH - 4) issues.push(where + 'dish words off the bottom');
      for (const box of Object.values(g.hints)) if (box.x < g.tube.x - 8 || right(box) > LW - 8 || g.traySlots.some((r) => meets(box, r))) issues.push(where + 'bench words out of place');
      if (Object.values(g.pieces).some((q) => q.x < g.dish.x || q.x > right(g.dish) || q.y < g.dish.y || q.y > bottom(g.dish))) issues.push(where + 'a molecule outside the dish');
      if (g.marble < 7) issues.push(where + 'marbles under 7px (' + g.marble.toFixed(1) + ')');
      if (c === 2 && n === 16) {
        for (const [a, bb] of [['hydrochloric-acid', 'calcium-hydroxide'], ['ammonium-nitrate', 'sodium-hydroxide'], ['calcium-oxide', 'water']]) {
          const rc = await p.ev(`(() => { __chem.lab.showCard('${a}', '${bb}'); const r = __chem.geom().reactionCard; __chem.lab.closeCard(); return r; })()`);
          if (!rc) { issues.push(where + 'no card for ' + a); continue; }
          if (rc.box.x < 0 || right(rc.box) > LW || rc.box.y < 0 || bottom(rc.box) > LH) issues.push(where + 'reaction card off screen');
          if (rc.box.wordsBottom + 8 > rc.button.y) issues.push(where + 'reaction card words into its button by ' + (rc.box.wordsBottom + 8 - rc.button.y).toFixed(1));
          if (bottom(rc.button) > bottom(rc.box)) issues.push(where + 'reaction card button outside it');
        }
      }
      if (c === 3) {
        const cardOk = (card, cta, what) => {
          if (!card || !cta) { issues.push(where + what + ' card missing'); return; }
          if (card.textBottom + 8 > cta.y) issues.push(where + what + ' card text into its button');
          if (card.y < 0 || bottom(card) > LH) issues.push(where + what + ' card off screen');
          if (bottom(cta) > bottom(card)) issues.push(where + what + ' button outside its card');
        };
        cardOk(g.card, g.cta, 'clue');
        const won = await p.ev(`(() => { __chem.freeze(0); const s = __chem.state, L = __chem.lab;
          for (const [where, key] of ChemLevels.organic[s.mode][s.level - 1].solution) { L.act(where, L.find(key)); __chem.advance(2800); }
          __chem.advance(2600); return Object.assign(__chem.geom(), { kind: __chem.state.card }); })()`);
        if (won.kind !== 'win') issues.push(where + 'the solution did not win');
        else cardOk(won.card, won.cta, 'win');
        await p.ev('__chem.thaw()');
      }
    }

    // the map
    const mp = await p.ev('(__chem.map(), __chem.scrollMap(0), __chem.geom())');
    const b = band(mp);
    b.out.forEach((q) => issues.push('map: ' + q));
    if (mp.cells.some((q) => q.x < 8 || right(q) > LW - 8 || q.w < 44 || q.h < 44)) issues.push('map: a cell past the side or under 44px');
    if (mp.view.y < b.low || bottom(mp.view) > LH) issues.push('map: view off the frame');
    fail(tag + ' (' + LW + 'x' + LH + ')', issues);
  }
  if (p.errors.length) { bad++; console.log('console errors: ' + p.errors.join(' | ')); }
} finally { p.close(); }
console.log(bad ? `FAILED  at ${bad} of ${windows.length + 2} windows` : `ok  the landscape layout fits ${windows.length} windows, the site frame is as designed, and its full screen fills the window`);
process.exit(bad ? 1 : 0);
