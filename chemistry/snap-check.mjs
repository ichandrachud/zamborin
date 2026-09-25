/* Litmus · how near two hands have to come before they clasp.
   node chemistry/snap-check.mjs            (needs the local server, as input-tests does)

   The owner, 2026-09-25: "when 2 atoms come closer the open arm should be
   pulled together and they should snap together more easily. Right now it is
   very hard to get even the right atoms to snap together." Chose: only a grab
   that helps (a green palm) pulls in and snaps; one that would lose a molecule
   (amber) behaves as it always did.

   Real mouse through Chrome on level 17 (iron chloride), drift off, no crowd.
   A chlorine already in the dish is dragged to D radii (centre to centre) from
   a partner, then either held still for 0.3 s or let go at once. Partners:
     the iron      green: iron chloride is on the list;
     a hydrogen    amber: hydrogen chloride would lose a molecule.
   Prints the table, then checks it: a green partner clasps whenever the palms
   touch, held or let go; an amber one only as near as it always needed. */
import { openPage, BASE, sleep } from './cdp.mjs';

let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log('FAIL  ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); } };
const DISTS = [2.6, 2.8, 3.0, 3.2, 3.4, 3.6, 3.8, 4.0, 4.2, 4.4, 4.6, 4.8, 5.2];
const HOLD = 300;

const p = await openPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&crowd=0&level=17' });
const ev = p.ev;
let down = false;
const mouse = async (type, wx, wy) => {
  const q = await ev(`(() => { const a = __chem.toPage(${wx}, ${wy}); const c = document.getElementById('game').getBoundingClientRect(); const s = __chem.state;
    return { x: c.left + a.x * c.width / s.LW, y: c.top + a.y * c.height / s.LH }; })()`);
  await p.send('Input.dispatchMouseEvent', { type, x: q.x, y: q.y, button: type === 'mouseMoved' ? 'none' : 'left',
    buttons: type === 'mouseReleased' ? 0 : (type === 'mousePressed' ? 1 : (down ? 1 : 0)), clickCount: 1, pointerType: 'mouse' });
  await sleep(16);
};
const slotWorld = async (el) => ev(`(() => { const g = __chem.geom(), s = g.slots.find((q) => q.el === '${el}'), d = g.dish;
  return { x: (s.x + s.w / 2 - d.x) / d.S, y: (s.y + s.h / 2 - d.y) / d.S }; })()`);

async function trial(partner, D, hold) {
  await ev('__chem.restart()');
  let s = await ev('__chem.state');
  const fe = s.atoms.find((a) => a.el === 'Fe'), hs = s.atoms.filter((a) => a.el === 'H'), na = s.atoms.find((a) => a.el === 'Na');
  // the iron and one hydrogen far apart in open water, the rest in the corners
  await ev(`(() => { __chem.move(${fe.id}, 8, 11); __chem.move(${hs[0].id}, 22, 11); __chem.move(${hs[1].id}, 3, 20); __chem.move(${na.id}, 24, 20); })()`);
  // a chlorine from the panel, let go in open water above: it lands free
  const slot = await slotWorld('Cl');
  down = false; await mouse('mouseMoved', slot.x, slot.y);
  down = true; await mouse('mousePressed', slot.x, slot.y);
  for (let i = 1; i <= 12; i++) await mouse('mouseMoved', slot.x + (15 - slot.x) * i / 12, slot.y + (4 - slot.y) * i / 12);
  down = false; await mouse('mouseReleased', 15, 4);
  await sleep(60);
  s = await ev('__chem.state');
  const cl = s.atoms.find((a) => a.el === 'Cl');
  const P = partner === 'green' ? s.atoms.find((a) => a.id === fe.id) : s.atoms.find((a) => a.id === hs[0].id);
  const side = partner === 'green' ? 1 : -1;               // come at the iron from its right, at the hydrogen from its left
  const to = { x: P.x + side * D, y: P.y };
  await mouse('mouseMoved', cl.x, cl.y);
  down = true; await mouse('mousePressed', cl.x, cl.y);
  for (let i = 1; i <= 16; i++) await mouse('mouseMoved', cl.x + (to.x - cl.x) * i / 16, cl.y + (to.y - cl.y) * i / 16);
  if (hold) await sleep(hold);
  down = false; await mouse('mouseReleased', to.x, to.y);
  await sleep(120);
  s = await ev('__chem.state');
  const c2 = s.atoms.find((a) => a.id === cl.id), p2 = s.atoms.find((a) => a.id === P.id);
  return !!(c2 && p2 && c2.mol === p2.mol);
}

const rows = [];
for (const D of DISTS) {
  const r = { D };
  for (const partner of ['green', 'amber']) for (const hold of [HOLD, 0]) r[partner + (hold ? ' held' : ' let go')] = await trial(partner, D, hold);
  rows.push(r);
}
const cols = ['green held', 'green let go', 'amber held', 'amber let go'];
console.log('\n  D (radii)  ' + cols.map((c) => c.padEnd(13)).join(''));
for (const r of rows) console.log('  ' + String(r.D).padEnd(9) + '  ' + cols.map((c) => (r[c] ? 'clasps' : '-').padEnd(13)).join(''));
const reach = (c) => Math.max(0, ...rows.filter((r) => r[c]).map((r) => r.D));
console.log('\n  furthest clasp: ' + cols.map((c) => c + ' ' + reach(c)).join(', ') + '\n');

// The palms of two green hands visibly meet at about 4.4 radii: from there, held or let go, it is a clasp.
for (const r of rows) {
  if (r.D <= 4.4) ok(r['green held'] && r['green let go'], `green partner at ${r.D}: clasps held and let go`, r);
  if (r.D <= 2.8) ok(r['amber held'] && r['amber let go'], `amber partner at ${r.D}: still grabbed, as before`, r);
  if (r.D >= 3.2) ok(!r['amber held'] && !r['amber let go'], `amber partner at ${r.D}: no pull, no grab, as before`, r);
}
ok(!rows.find((r) => r.D === 5.2)['green let go'], 'a green partner out of reach is not grabbed on letting go');
ok(p.errors.length === 0, 'no console errors', p.errors);
p.close();

// ---------- the same on a phone, by touch: a finger lifted, not held ----------
const t = await openPage({ w: 390, h: 844, dpr: 2, mobile: true, url: BASE + '?embed=1&drift=0&crowd=0&level=17' });
const tev = t.ev;
const finger = async (type, wx, wy) => {
  const pts = type === 'touchEnd' ? [] : [await tev(`(() => { const a = __chem.toPage(${wx}, ${wy}); const c = document.getElementById('game').getBoundingClientRect(); const s = __chem.state;
    return { x: c.left + a.x * c.width / s.LW, y: c.top + a.y * c.height / s.LH }; })()`)];
  await t.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q) => ({ x: q.x, y: q.y, id: 1 })) });
  await sleep(16);
};
async function touchTrial(partner, D) {
  await tev('__chem.restart()');
  let s = await tev('__chem.state');
  const [WW, WH] = s.world;
  const fe = s.atoms.find((a) => a.el === 'Fe'), hs = s.atoms.filter((a) => a.el === 'H'), na = s.atoms.find((a) => a.el === 'Na');
  // the phone's level 17 has no sodium in its dish; move it only where there is one
  await tev(`(() => { __chem.move(${fe.id}, ${WW * 0.28}, ${WH * 0.4}); __chem.move(${hs[0].id}, ${WW * 0.72}, ${WH * 0.4});
    __chem.move(${hs[1].id}, ${WW * 0.2}, ${WH * 0.85}); ${na ? `__chem.move(${na.id}, ${WW * 0.8}, ${WH * 0.85});` : ''} })()`);
  const slot = await tev(`(() => { const g = __chem.geom(), s = g.slots.find((q) => q.el === 'Cl'), d = g.dish;
    return { x: (s.x + s.w / 2 - d.x) / d.S, y: (s.y + s.h / 2 - d.y) / d.S }; })()`);
  const drop = { x: WW * 0.5, y: WH * 0.14 };
  await finger('touchStart', slot.x, slot.y);
  for (let i = 1; i <= 12; i++) await finger('touchMove', slot.x + (drop.x - slot.x) * i / 12, slot.y + (drop.y - slot.y) * i / 12);
  await finger('touchEnd'); await sleep(80);
  s = await tev('__chem.state');
  const cl = s.atoms.find((a) => a.el === 'Cl');
  const P = s.atoms.find((a) => a.id === (partner === 'green' ? fe.id : hs[0].id));
  const side = partner === 'green' ? 1 : -1;
  const to = { x: P.x + side * D, y: P.y };
  await finger('touchStart', cl.x, cl.y);
  for (let i = 1; i <= 16; i++) await finger('touchMove', cl.x + (to.x - cl.x) * i / 16, cl.y + (to.y - cl.y) * i / 16);
  await finger('touchEnd'); await sleep(120);
  s = await tev('__chem.state');
  const c2 = s.atoms.find((a) => a.id === cl.id), p2 = s.atoms.find((a) => a.id === P.id);
  return { mode: s.mode, clasped: !!(c2 && p2 && c2.mol === p2.mol) };
}
for (const [partner, D, want] of [['green', 4.2, true], ['green', 5.2, false], ['amber', 2.6, true], ['amber', 3.4, false]]) {
  const r = await touchTrial(partner, D);
  ok(r.mode === 'mobile' && r.clasped === want, `phone, by touch: ${partner} partner at ${D}, finger lifted: ${want ? 'clasps' : 'no grab'}`, r);
}
ok(t.errors.length === 0, 'phone: no console errors', t.errors);
t.close();
console.log(fail ? `FAIL  ${pass} passed, ${fail} failed` : `ok  ${pass} passed, 0 failed`);
process.exit(fail ? 1 : 0);
