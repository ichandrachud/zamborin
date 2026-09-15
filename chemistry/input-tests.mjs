/* Lessons in Chemistry · input-path tests.   node chemistry/input-tests.mjs

   Real mouse and touch events through Chrome, never the game's own drag code:
   a harness that calls the model tests the model, and the controls are a
   separate system. __chem is used only to read state and to set the dish up
   (moving atoms to known places with drift off). Needs the local server. */
import { openPage, BASE, sleep } from './cdp.mjs';

let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log('FAIL  ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); } };
const centre = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

async function withPage(opts, body) {
  const p = await openPage(opts);
  const logical = async (x, y) => p.toPage(x, y);
  const world = async (wx, wy) => { const q = await p.ev(`__chem.toPage(${wx}, ${wy})`); return q; };
  const mouse = async (type, lx, ly) => {
    const q = await logical(lx, ly);
    await p.send('Input.dispatchMouseEvent', { type, x: q.x, y: q.y, button: type === 'mouseMoved' ? 'none' : 'left',
      buttons: type === 'mouseReleased' ? 0 : (type === 'mousePressed' ? 1 : (io.down ? 1 : 0)), clickCount: 1, pointerType: 'mouse' });
    await sleep(16);
  };
  const touch = async (type, lx, ly) => {
    const pts = type === 'touchEnd' ? [] : [await logical(lx, ly)];
    await p.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q) => ({ x: q.x, y: q.y, id: 1 })) });
    await sleep(16);
  };
  const io = {
    ev: p.ev, world, down: false,
    async click(x, y) { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); await sleep(60); },
    // press at a logical point, glide in steps to another, release
    async mouseDrag(from, to, steps = 14) {
      await mouse('mouseMoved', from.x, from.y);
      io.down = true; await mouse('mousePressed', from.x, from.y);
      for (let i = 1; i <= steps; i++) await mouse('mouseMoved', from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps);
      io.down = false; await mouse('mouseReleased', to.x, to.y);
      await sleep(60);
    },
    // press at the first point, glide through every point after it, release at the last
    async mouseDragPath(points, steps = 12) {
      await mouse('mouseMoved', points[0].x, points[0].y);
      io.down = true; await mouse('mousePressed', points[0].x, points[0].y);
      for (let k = 1; k < points.length; k++) {
        const a = points[k - 1], b = points[k];
        for (let i = 1; i <= steps; i++) await mouse('mouseMoved', a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps);
      }
      const last = points[points.length - 1];
      io.down = false; await mouse('mouseReleased', last.x, last.y);
      await sleep(60);
    },
    async touchDrag(from, to, steps = 14) {
      await touch('touchStart', from.x, from.y);
      for (let i = 1; i <= steps; i++) await touch('touchMove', from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps);
      await touch('touchEnd');
      await sleep(60);
    },
    async touchTap(x, y) { await touch('touchStart', x, y); await touch('touchEnd'); await sleep(60); },
    // a new address in the same browser, so what the game saved is still there
    async reload(url) { await p.navigate(url, 2600); },
    async wheel(x, y, dy) { const q = await logical(x, y); await p.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: q.x, y: q.y, deltaX: 0, deltaY: dy }); await sleep(60); },
  };
  try {
    await body(io);
    ok(p.errors.length === 0, opts.url + ': no console errors', p.errors);
  } finally { p.close(); }
}
const atomsOf = (s, el) => s.atoms.filter((a) => a.el === el);
// Drops land 2.6 radii from a partner: inside the 3.0 a grab needs (play.js TUNE.capture).

// ---------- desktop: build iron chloride by dragging chlorine in from the panel ----------
await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&crowd=0&level=3' }, async ({ ev, world, mouseDrag, click }) => {
  let s = await ev('__chem.state');
  ok(s.mode === 'desktop' && s.LW === 760 && s.LH === 600, 'desktop frame is 760x600', [s.mode, s.LW, s.LH]);
  const [fe] = atomsOf(s, 'Fe'), [h1, h2] = atomsOf(s, 'H'), [na] = atomsOf(s, 'Na');
  // a clean dish: the iron in the open, the trouble in the far corners
  await ev(`(() => { __chem.move(${fe.id}, 9, 11); __chem.move(${h1.id}, 3, 3); __chem.move(${h2.id}, 3, 20); __chem.move(${na.id}, 24, 20); })()`);
  const g = await ev('__chem.geom()');
  const slot = centre(g.slots.find((q) => q.el === 'Cl'));
  const feAt = async () => (await ev('__chem.state')).atoms.find((a) => a.id === fe.id);
  const molOf = (st, id) => st.atoms.find((a) => a.id === id).mol;

  let f = await feAt();
  await mouseDrag(slot, await world(f.x + 2.6, f.y));
  s = await ev('__chem.state');
  const cl1 = s.atoms.find((a) => a.el === 'Cl');
  ok(cl1 && cl1.mol === molOf(s, fe.id), 'a chlorine dragged to the iron is grabbed by it', s.atoms);
  ok(s.avail.Cl === 2 && s.lost === 0 && s.wasted === 0, 'one chlorine used, nothing lost', [s.avail, s.lost]);

  f = await feAt();
  await mouseDrag(slot, await world(f.x, f.y + 2.6));
  f = await feAt();
  await mouseDrag(slot, await world(f.x - 2.6, f.y - 0.4), 20);
  s = await ev('__chem.state');
  ok(s.made['iron-chloride'] === 1, 'three chlorines on the iron make iron chloride, and it is collected', s.made);
  ok(s.result && s.result.kind === 'win', 'every molecule made: the level is won', s.result);
  await sleep(1600);
  const g2 = await ev('__chem.geom()');
  ok(!!g2.cta, 'the win card shows');
  if (g2.cta) await click(g2.cta.x + g2.cta.w / 2, g2.cta.y + g2.cta.h / 2);
  s = await ev('__chem.state');
  ok(s.level === 4 && !s.card, 'NEXT LEVEL loads level 4', [s.level, s.card]);
});

// ---------- desktop: the path matters, and a lost molecule fails the level ----------
await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&crowd=0&level=3' }, async ({ ev, world, mouseDragPath, click }) => {
  let s = await ev('__chem.state');
  const [fe] = atomsOf(s, 'Fe'), [h1, h2] = atomsOf(s, 'H'), [na] = atomsOf(s, 'Na');
  // the hydrogen sits right on the way to the iron
  await ev(`(() => { __chem.move(${fe.id}, 6, 11); __chem.move(${h1.id}, 14, 11.5); __chem.move(${h2.id}, 3, 20); __chem.move(${na.id}, 24, 21); })()`);
  const g = await ev('__chem.geom()');
  const slot = centre(g.slots.find((q) => q.el === 'Cl'));
  const edge = await world(g.dish.WW + 0.3, 11);     // just outside the dish's right wall, level with the iron
  await mouseDragPath([slot, edge, await world(9, 11)], 16);
  s = await ev('__chem.state');
  ok(s.wasted === 1 && s.lost === 1, 'dragged past a hydrogen, the chlorine is grabbed on the way: hydrogen chloride', [s.wasted, s.lost, s.lastEvent]);
  ok(s.result && s.result.kind === 'fail', 'two chlorines cannot finish the iron: the level fails', s.result);
  ok(!s.cardShown, 'the card waits, so the loss is seen first');
  await sleep(1800);
  const g2 = await ev('__chem.geom()');
  ok(!!g2.cta, 'then the fail card shows');
  const restart = g.ctrl.find((b) => b.id === 'restart');
  await click(restart.x + restart.w / 2, restart.y + restart.h / 2);
  ok((await ev('__chem.state')).card === 'fail', 'with the card up, Restart under the scrim does nothing');
  await click(g2.cta.x + g2.cta.w / 2, g2.cta.y + g2.cta.h / 2);
  s = await ev('__chem.state');
  ok(s.level === 3 && !s.card && s.lost === 0 && s.avail.Cl === 3, 'TRY AGAIN restarts the level with the panel full', [s.level, s.avail]);
});

// ---------- desktop: move things in the dish, and put a panel atom back ----------
await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&crowd=0&level=2' }, async ({ ev, world, mouseDrag }) => {
  let s = await ev('__chem.state');
  const [o, o2nd] = atomsOf(s, 'O'), [na] = atomsOf(s, 'Na');
  const hStart = s.avail.H;
  await ev(`(() => { __chem.move(${o.id}, 6, 6); __chem.move(${o2nd.id}, 22, 4); __chem.move(${na.id}, 22, 20); })()`);
  await mouseDrag(await world(6, 6), await world(12, 14));
  s = await ev('__chem.state');
  const o2 = s.atoms.find((a) => a.id === o.id);
  ok(Math.abs(o2.x - 12) < 0.3 && Math.abs(o2.y - 14) < 0.3, 'an atom in the dish can be dragged somewhere else', o2);
  ok(s.reactions === 0, 'moving it through open space makes nothing');
  const g = await ev('__chem.geom()');
  const slot = centre(g.slots.find((q) => q.el === 'H'));
  await mouseDrag(slot, { x: slot.x - 4, y: slot.y + 60 });
  s = await ev('__chem.state');
  ok(s.avail.H === hStart && s.atoms.length === 3, 'a panel atom let go outside the dish goes back to the panel', [s.avail, s.atoms.length]);
  // carry the oxygen onto the sodium: sodium hydroxide is not on the list, so a hydrogen is still needed... O-Na is a piece nothing wants
  await mouseDrag(await world(12, 14), await world(22 - 2.6, 20));
  s = await ev('__chem.state');
  ok(s.reactions === 1 && s.lost === 1, 'dragging a dish atom into a radical is a reaction too, and it can lose a molecule', [s.reactions, s.lost]);
});

// ---------- the crowd ----------
await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&level=7' }, async ({ ev }) => {
  const s = await ev('__chem.state');
  ok(s.atoms.length === 18, 'desktop level 7 floats 18 radicals', s.atoms.length);
  ok(s.placement.reachable === s.placement.needed && s.placement.needed === 6, 'and every one the list needs can be reached without passing another', s.placement);
  ok(Object.values(s.palm).length === 18, 'all of them charged');
  const g = await ev('__chem.geom()');
  ok(Object.values(g.atoms).every((a) => a.x > g.dish.x && a.x < g.dish.x + g.dish.w && a.y > g.dish.y && a.y < g.dish.y + g.dish.h), 'all inside the dish');
});
await withPage({ w: 390, h: 844, dpr: 2, mobile: true, url: BASE + '?drift=0&level=6' }, async ({ ev }) => {
  const s = await ev('__chem.state');
  ok(s.atoms.length === 11 && s.placement.reachable === s.placement.needed, 'a 390x844 phone gets level 6 with its full crowd of 11, every needed radical reachable', [s.atoms.length, s.placement]);
});
await withPage({ w: 320, h: 568, dpr: 2, mobile: true, url: BASE + '?drift=0&level=7' }, async ({ ev }) => {
  const s = await ev('__chem.state');
  ok(s.atoms.length < 12 && s.atoms.length >= 7 && s.placement.reachable === s.placement.needed,
     'a short phone gets a thinner crowd, and still every needed radical reachable', [s.atoms.length, s.placement]);
});

// ---------- live drift ----------
await withPage({ w: 760, h: 600, url: BASE + '?embed=1&level=7' }, async ({ ev }) => {
  const before = await ev('__chem.state');
  await sleep(5000);
  const after = await ev('__chem.state');
  const moved = after.atoms.filter((a) => { const b = before.atoms.find((q) => q.id === a.id); return Math.hypot(a.x - b.x, a.y - b.y) > 0.05; }).length;
  ok(after.drift && moved >= Math.ceil(before.atoms.length / 2), 'the radicals drift on their own (' + moved + ' of ' + before.atoms.length + ' moved in 5 s)');
  const far = Math.max(...after.atoms.map((a) => { const b = before.atoms.find((q) => q.id === a.id); return Math.hypot(a.x - b.x, a.y - b.y); }));
  ok(far < 6, 'and slowly (furthest ' + far.toFixed(2) + ' radii in 5 s)');
  ok(after.reactions === 0 && after.lost === 0, 'nothing reacts on its own', [after.reactions, after.lost]);
  const charged = after.atoms.filter((a) => a.free > 0);
  let closest = 99;
  for (let i = 0; i < charged.length; i++) for (let j = i + 1; j < charged.length; j++) closest = Math.min(closest, Math.hypot(charged[i].x - charged[j].x, charged[i].y - charged[j].y));
  ok(closest > 3.3, 'no two radicals drift within reach of each other (closest ' + closest.toFixed(2) + ' radii)');
});

// ---------- mobile, touch ----------
await withPage({ w: 390, h: 844, dpr: 2, mobile: true, url: BASE + '?drift=0&crowd=0&level=1' }, async ({ ev, world, touchDrag, touchTap }) => {
  let s = await ev('__chem.state');
  ok(s.mode === 'mobile' && s.LW === 390 && s.LH === 844, 'a touch phone gets the mobile layout at its own size', [s.mode, s.LW, s.LH]);
  const [o] = atomsOf(s, 'O');
  await ev(`__chem.move(${o.id}, 9, 10)`);
  const g = await ev('__chem.geom()');
  const slot = centre(g.slots.find((q) => q.el === 'H'));
  // the atom rides above the finger, so the finger goes a little below where the atom should land
  const land = await world(9 + 2.6, 10 + 2.3);
  await touchDrag(slot, land, 20);
  s = await ev('__chem.state');
  const h = s.atoms.find((a) => a.el === 'H');
  ok(h && h.mol === s.atoms.find((a) => a.id === o.id).mol && s.avail.H === 1, 'a hydrogen dragged in by touch is grabbed by the oxygen', s.atoms);
  const rs = g.ctrl.find((b) => b.id === 'restart');
  await touchTap(rs.x + rs.w / 2, rs.y + rs.h / 2);
  s = await ev('__chem.state');
  ok(s.avail.H === 2 && s.reactions === 0, 'Restart works by touch', [s.avail, s.reactions]);
});

// ---------- chapter 2: reactions, by real drags ----------
const keyAt = (st, key, zone) => st.pieces.find((q) => q.key === key && (!zone || q.zone === zone));
await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&chapter=2&level=2' }, async ({ ev, mouseDrag, click }) => {
  let st = await ev('__chem.state'), g = await ev('__chem.geom()');
  ok(st.chapter === 2 && st.pieces.length === 7, 'chapter 2 level 2 floats seven molecules', [st.chapter, st.pieces.length]);
  const tubeC = centre(g.tube), beakerC = centre(g.beaker);
  await mouseDrag(g.pieces[keyAt(st, 'hydrochloric-acid').id], tubeC);
  await mouseDrag(g.pieces[keyAt(st, 'sodium-chloride').id], tubeC);
  st = await ev('__chem.state');
  ok(st.tube.length === 2 && !st.reacting, 'an acid and a salt in the tube: no reaction, both stay', st.tube);
  g = await ev('__chem.geom()');
  await mouseDrag(g.pieces[keyAt(st, 'sodium-chloride', 'tube').id], { x: g.dish.x + 60, y: g.dish.y + 60 });
  st = await ev('__chem.state');
  ok(keyAt(st, 'sodium-chloride').zone === 'dish' && st.tube.length === 1, 'a molecule can be dragged back out of the tube', st.tube);
  g = await ev('__chem.geom()');
  await mouseDrag(g.pieces[keyAt(st, 'sodium-chloride').id], beakerC);
  st = await ev('__chem.state');
  ok(keyAt(st, 'sodium-chloride').zone === 'dish' && !st.made['sodium-chloride'], 'the beaker refuses what is not on the list');
  g = await ev('__chem.geom()');
  await mouseDrag(g.pieces[keyAt(st, 'hydrochloric-acid', 'tube').id], { x: g.dish.x + 300, y: g.dish.y + 380 });
  g = await ev('__chem.geom()'); st = await ev('__chem.state');
  await mouseDrag(g.pieces[keyAt(st, 'sulphuric-acid').id], tubeC);
  g = await ev('__chem.geom()'); st = await ev('__chem.state');
  await mouseDrag(g.pieces[keyAt(st, 'calcium-hydroxide').id], tubeC);
  st = await ev('__chem.state');
  ok(st.reacting && keyAt(st, 'calcium-sulphate', 'tray') && st.pieces.filter((q) => q.zone === 'tray').length === 3,
     'sulphuric acid and calcium hydroxide react: calcium sulphate and two waters on the tray', st.pieces.filter((q) => q.zone === 'tray'));
  await sleep(700);
  g = await ev('__chem.geom()');
  await mouseDrag(g.pieces[keyAt(st, 'calcium-sulphate', 'tray').id], beakerC);
  st = await ev('__chem.state');
  ok(st.made['calcium-sulphate'] === 1 && st.result && st.result.kind === 'win', 'calcium sulphate into the beaker: the level is won', [st.made, st.result]);
  await sleep(1900);
  g = await ev('__chem.geom()');
  ok(!!g.cta, 'the win card shows');
  if (g.cta) await click(g.cta.x + g.cta.w / 2, g.cta.y + g.cta.h / 2);
  st = await ev('__chem.state');
  ok(st.level === 3 && !st.card, 'NEXT LEVEL loads reaction level 3', [st.level, st.card]);
});

await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&chapter=2&level=6' }, async ({ ev, mouseDrag }) => {
  let st = await ev('__chem.state'), g = await ev('__chem.geom()');
  const tubeC = centre(g.tube), beakerC = centre(g.beaker);
  await mouseDrag(g.pieces[keyAt(st, 'ammonium-chloride').id], tubeC);
  g = await ev('__chem.geom()'); st = await ev('__chem.state');
  await mouseDrag(g.pieces[keyAt(st, 'sodium-hydroxide').id], tubeC);
  await sleep(600);
  st = await ev('__chem.state'); g = await ev('__chem.geom()');
  ok(['sodium-chloride', 'water', 'ammonia'].every((k) => keyAt(st, k, 'tray')), 'ammonium chloride and sodium hydroxide give salt, water and ammonia');
  await mouseDrag(g.pieces[keyAt(st, 'ammonia', 'tray').id], { x: g.dish.x + g.dish.w / 2, y: g.dish.y + g.dish.h - 60 });
  st = await ev('__chem.state');
  ok(keyAt(st, 'ammonia').zone === 'dish', 'the ammonia byproduct is kept, back in the dish');
  g = await ev('__chem.geom()');
  await mouseDrag(g.pieces[keyAt(st, 'nitric-acid').id], tubeC);
  g = await ev('__chem.geom()'); st = await ev('__chem.state');
  await mouseDrag(g.pieces[keyAt(st, 'ammonia', 'dish').id], tubeC);
  await sleep(600);
  st = await ev('__chem.state'); g = await ev('__chem.geom()');
  ok(keyAt(st, 'ammonium-nitrate', 'tray') && !keyAt(st, 'water', 'tray') && !keyAt(st, 'sodium-chloride', 'tray'),
     'ammonia and nitric acid make ammonium nitrate, and the salt and water left on the tray are poured away', st.pieces.filter((q) => q.zone === 'tray'));
  await mouseDrag(g.pieces[keyAt(st, 'ammonium-nitrate', 'tray').id], beakerC);
  st = await ev('__chem.state');
  ok(st.result && st.result.kind === 'win', 'ammonium nitrate into the beaker: won', st.result);
});

await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&chapter=2&level=7' }, async ({ ev, mouseDrag }) => {
  let st = await ev('__chem.state'), g = await ev('__chem.geom()');
  const tubeC = centre(g.tube);
  await mouseDrag(g.pieces[keyAt(st, 'calcium-oxide').id], tubeC);
  g = await ev('__chem.geom()'); st = await ev('__chem.state');
  await mouseDrag(g.pieces[keyAt(st, 'hydrochloric-acid').id], tubeC);
  st = await ev('__chem.state');
  ok(st.lost === 2 && st.result && st.result.kind === 'fail', 'quicklime with the only hydrochloric acid: no salt and no water, both lost, the level fails', [st.lost, st.result]);
  await sleep(2600);
  ok((await ev('__chem.state')).cardShown, 'the fail card shows');
});

await withPage({ w: 390, h: 844, dpr: 2, mobile: true, url: BASE + '?drift=0&chapter=2&level=1' }, async ({ ev, touchDrag }) => {
  let st = await ev('__chem.state'), g = await ev('__chem.geom()');
  ok(st.mode === 'mobile' && st.chapter === 2, 'a phone gets chapter 2 in the phone layout');
  const tubeC = centre(g.tube), beakerC = centre(g.beaker);
  await touchDrag(g.pieces[keyAt(st, 'hydrochloric-acid').id], tubeC);
  g = await ev('__chem.geom()'); st = await ev('__chem.state');
  await touchDrag(g.pieces[keyAt(st, 'sodium-hydroxide').id], tubeC);
  await sleep(600);
  st = await ev('__chem.state'); g = await ev('__chem.geom()');
  ok(keyAt(st, 'sodium-chloride', 'tray'), 'touch: acid and base react in the tube', st.pieces);
  // a tray molecule rides above the finger, so the finger lands a little below the beaker's middle
  await touchDrag(g.pieces[keyAt(st, 'sodium-chloride', 'tray').id], { x: beakerC.x, y: beakerC.y + 36 });
  st = await ev('__chem.state');
  ok(st.result && st.result.kind === 'win', 'touch: salt into the beaker wins', st.result);
});

// ---------- chapter 3: organic, the same bench ----------
await withPage({ w: 390, h: 844, dpr: 2, mobile: true, url: BASE + '?drift=0&chapter=3&level=1' }, async ({ ev, touchDrag, touchTap }) => {
  let g = await ev('__chem.geom()'), st = await ev('__chem.state');
  ok(st.mode === 'mobile' && st.chapter === 3 && st.pieces.length === 3, 'a phone gets chapter 3 with three molecules', [st.mode, st.chapter, st.pieces.length]);
  ok(st.card === 'clue' && st.cardShown && g.card && g.card.lines >= 2, 'an organic level opens on its clue card', [st.card, st.cardShown, g.card]);
  await touchTap(g.cta.x + g.cta.w / 2, g.cta.y + g.cta.h / 2);
  st = await ev('__chem.state'); g = await ev('__chem.geom()');
  ok(st.card === null, 'touch: START puts the clue away', st.card);
  const tubeC = centre(g.tube), beakerC = centre(g.beaker);
  await touchDrag(g.pieces[keyAt(st, 'ethene').id], tubeC);
  g = await ev('__chem.geom()'); st = await ev('__chem.state');
  await touchDrag(g.pieces[keyAt(st, 'hydrogen').id], tubeC);
  await sleep(600);
  st = await ev('__chem.state'); g = await ev('__chem.geom()');
  ok(keyAt(st, 'ethane', 'tray'), 'touch: ethene and hydrogen make ethane', st.pieces);
  await touchDrag(g.pieces[keyAt(st, 'ethane', 'tray').id], { x: beakerC.x, y: beakerC.y + 36 });
  st = await ev('__chem.state');
  ok(st.result && st.result.kind === 'win', 'touch: ethane into the beaker wins', st.result);
});

await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&chapter=3&level=3' }, async ({ ev, mouseDrag, click }) => {
  let g = await ev('__chem.geom()'), st = await ev('__chem.state');
  const tubeC = centre(g.tube);
  await mouseDrag(g.pieces[keyAt(st, 'ethene').id], tubeC);
  st = await ev('__chem.state');
  ok(st.card === 'clue' && st.tube.length === 0, 'mouse: nothing can be dragged while the clue is up', [st.card, st.tube]);
  await click(g.cta.x + g.cta.w / 2, g.cta.y + g.cta.h / 2);
  st = await ev('__chem.state'); g = await ev('__chem.geom()');
  ok(st.card === null, 'mouse: START puts the clue away', st.card);
  await mouseDrag(g.pieces[keyAt(st, 'ethene').id], tubeC);
  g = await ev('__chem.geom()'); st = await ev('__chem.state');
  await mouseDrag(g.pieces[keyAt(st, 'hydrogen').id], tubeC);
  await sleep(600);
  st = await ev('__chem.state');
  ok(keyAt(st, 'ethane', 'tray') && st.lost === 1, 'mouse: ethene with hydrogen when the list wants ethanol loses it', [st.lost, st.pieces]);
  await sleep(2600);
  st = await ev('__chem.state');
  ok(st.card === 'fail' && st.cardShown, 'and the fail card shows', [st.card, st.cardShown]);
});

// ---------- the level map ----------
await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&crowd=0' }, async ({ ev, click, reload }) => {
  let st = await ev('__chem.state');
  ok(st.phase === 'play' && st.chapter === 1 && st.level === 1, 'a new player starts on level 1, not the map', [st.phase, st.chapter, st.level]);
  const O = st.atoms.find((a) => a.el === 'O');
  await ev(`__chem.carry('H', ${O.x + 2.6}, ${O.y})`);
  st = await ev(`__chem.carry('H', ${O.x - 2.6}, ${O.y})`);
  ok(st.result && st.result.kind === 'win', 'level 1 won', st.result);
  const saved = await ev(`JSON.parse(localStorage.getItem('zam.chemistry.progress'))`);
  ok(JSON.stringify(saved && saved['desktop-1']) === JSON.stringify({ at: 0, done: 1 }), 'the win is saved: one molecules level done', saved);
  await reload(BASE + '?embed=1&drift=0&crowd=0');
  st = await ev('__chem.state');
  let g = await ev('__chem.geom()');
  ok(st.phase === 'map', 'a returning player starts on the map', st.phase);
  const cell = (c, n) => g.cells.find((q) => q.c === c && q.n === n);
  ok(cell(1, 1).done && cell(1, 2).next && cell(1, 2).open && !cell(1, 3).open && !cell(2, 1).open,
     'level 1 ticked, level 2 next, the rest shut', [cell(1, 1), cell(1, 2), cell(1, 3), cell(2, 1)]);
  await click(cell(1, 3).x + 20, cell(1, 3).y + 20);
  ok((await ev('__chem.state')).phase === 'map', 'a shut level does not open');
  await click(cell(2, 1).x + 20, cell(2, 1).y + 20);
  ok((await ev('__chem.state')).phase === 'map', 'nor does a level in a shut chapter');
  await click(cell(1, 2).x + cell(1, 2).w / 2, cell(1, 2).y + cell(1, 2).h / 2);
  st = await ev('__chem.state');
  ok(st.phase === 'play' && st.chapter === 1 && st.level === 2, 'tapping the next level plays it', [st.phase, st.chapter, st.level]);
  g = await ev('__chem.geom()');
  ok(g.ctrl.map((b) => b.id).join() === 'map,sound,restart', 'the map button leads the control row', g.ctrl.map((b) => b.id));
  const mapBtn = g.ctrl[0];
  await click(mapBtn.x + mapBtn.w / 2, mapBtn.y + mapBtn.h / 2);
  ok((await ev('__chem.state')).phase === 'map', 'the map button opens the map');
});

await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&chapter=2&level=7' }, async ({ ev, click }) => {
  await ev(`(() => { __chem.freeze(0); const L = __chem.lab;
    for (const [where, key] of ChemLevels.lab.desktop[6].solution) { L.act(where, L.find(key)); __chem.advance(1200); }
    __chem.advance(2600); })()`);
  let st = await ev('__chem.state');
  const g = await ev('__chem.geom()');
  ok(st.card === 'win' && g.cta, 'the last reactions level won', st.card);
  await click(g.cta.x + g.cta.w / 2, g.cta.y + g.cta.h / 2);
  st = await ev('__chem.state');
  ok(st.phase === 'play' && st.chapter === 3 && st.level === 1 && st.card === 'clue',
     'its button goes on to the next chapter: organic level 1, on its clue', [st.phase, st.chapter, st.level, st.card]);
});

await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&chapter=3&level=6' }, async ({ ev, click }) => {
  await ev(`(() => { __chem.freeze(0); const L = __chem.lab;
    for (const [where, key] of ChemLevels.organic.desktop[5].solution) { L.act(where, L.find(key)); __chem.advance(1200); }
    __chem.advance(2600); })()`);
  const g = await ev('__chem.geom()');
  ok((await ev('__chem.state')).card === 'win' && g.cta, 'the last organic level won');
  await click(g.cta.x + g.cta.w / 2, g.cta.y + g.cta.h / 2);
  const st = await ev('__chem.state');
  ok(st.phase === 'map', 'after the very last level, its button opens the map', st.phase);
});

await withPage({ w: 375, h: 667, dpr: 2, mobile: true, url: BASE + '?drift=0&map=1' }, async ({ ev, touchDrag, touchTap }) => {
  let g = await ev('__chem.geom()');
  ok(g.phase === 'map' && g.view.maxScroll > 0, 'on a short phone the map scrolls', g.view);
  const x = g.LW / 2, low = g.view.y + g.view.h - 40;
  await touchDrag({ x, y: low }, { x, y: low - 160 });
  g = await ev('__chem.geom()');
  ok(g.phase === 'map' && g.view.scroll > 60, 'touch: a drag scrolls the map and opens nothing', [g.phase, g.view.scroll]);
  await touchDrag({ x, y: g.view.y + 30 }, { x, y: g.view.y + 330 });
  g = await ev('__chem.geom()');
  const one = g.cells.find((q) => q.c === 1 && q.n === 1);
  await touchTap(one.x + one.w / 2, one.y + one.h / 2);
  const st = await ev('__chem.state');
  ok(st.phase === 'play' && st.chapter === 1 && st.level === 1, 'touch: a tap on level 1 plays it', [st.phase, st.level]);
});

console.log((fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
