/* Litmus · input-path tests.   node chemistry/input-tests.mjs

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
await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&crowd=0&level=17' }, async ({ ev, world, mouseDrag, click }) => {
  let s = await ev('__chem.state');
  ok(s.mode === 'desktop' && s.LW === 760 && s.LH === 600, 'desktop frame is 760x600', [s.mode, s.LW, s.LH]);
  const [fe] = atomsOf(s, 'Fe'), [h1, h2] = atomsOf(s, 'H'), [na] = atomsOf(s, 'Na');
  // a clean dish: the iron in the open, the trouble in the far corners
  await ev(`(() => { __chem.move(${fe.id}, 9, 11); __chem.move(${h1.id}, 3, 3); __chem.move(${h2.id}, 3, 20); __chem.move(${na.id}, 24, 20); })()`);
  const g = await ev('__chem.geom()');
  const slot = centre(g.slots.find((q) => q.el === 'Cl'));
  const feAt = async () => (await ev('__chem.state')).atoms.find((a) => a.id === fe.id);
  const molOf = (st, id) => st.atoms.find((a) => a.id === id).mol;

  /* A chlorine from the panel, let go right beside the iron, clasps it: a grab
     that helps (owner, 2026-09-25). It used to land free there, under the rule
     of 2026-09-15, which now covers only grabs that would lose a molecule. */
  let f = await feAt();
  await mouseDrag(slot, await world(f.x + 2.6, f.y));
  s = await ev('__chem.state');
  const first = s.atoms.find((a) => a.el === 'Cl');
  ok(first && first.mol === molOf(s, fe.id) && s.reactions === 1 && s.avail.Cl === 2,
     'a chlorine carried in from the panel and let go beside the iron clasps it', [s.reactions, s.avail, s.atoms]);
  // Let go in open water, one lands free; moved again from the dish, it is grabbed.
  const bring = async (dx, dy) => {
    await mouseDrag(slot, await world(18, 4));
    const st2 = await ev('__chem.state');
    const loose = st2.atoms.filter((a) => a.el === 'Cl' && a.free === 1).pop();
    ok(!!loose && loose.mol !== molOf(st2, fe.id), 'let go in open water, a chlorine from the panel lands free', st2.atoms);
    if (!loose) return -1;
    const fe2 = await feAt();
    await mouseDrag(await world(loose.x, loose.y), await world(fe2.x + dx, fe2.y + dy), 20);
    return loose.id;
  };
  const second = await bring(0, 2.6);
  s = await ev('__chem.state');
  ok(s.atoms.find((a) => a.id === second)?.mol === molOf(s, fe.id), 'dragged to the iron from the dish, the chlorine is grabbed', s.atoms);
  ok(s.avail.Cl === 1 && s.lost === 0 && s.wasted === 0, 'two chlorines used, nothing lost', [s.avail, s.lost]);
  await bring(-2.6, -0.4);
  s = await ev('__chem.state');
  ok(s.made['iron-chloride'] === 1, 'three chlorines on the iron make iron chloride, and it is collected', s.made);
  ok(s.result && s.result.kind === 'win', 'every molecule made: the level is won', s.result);
  await sleep(1600);
  const g2 = await ev('__chem.geom()');
  ok(!!g2.cta, 'the win card shows');
  if (g2.cta) await click(g2.cta.x + g2.cta.w / 2, g2.cta.y + g2.cta.h / 2);
  s = await ev('__chem.state');
  ok(s.level === 18 && !s.card, 'NEXT LEVEL loads level 18', [s.level, s.card]);
});

// ---------- desktop: the path matters, and a lost molecule fails the level ----------
await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&crowd=0&level=17' }, async ({ ev, world, mouseDragPath, click }) => {
  let s = await ev('__chem.state');
  const [fe] = atomsOf(s, 'Fe'), [h1, h2] = atomsOf(s, 'H'), [na] = atomsOf(s, 'Na');
  // the hydrogen sits right on the way to the iron
  await ev(`(() => { __chem.move(${fe.id}, 6, 11); __chem.move(${h1.id}, 14, 11.5); __chem.move(${h2.id}, 3, 20); __chem.move(${na.id}, 24, 21); })()`);
  const g = await ev('__chem.geom()');
  const slot = centre(g.slots.find((q) => q.el === 'Cl'));
  const edge = await world(g.dish.WW + 0.3, 11);     // just outside the dish's right wall, level with the iron
  // from the panel, wide of the hydrogen, into open water: it lands free
  await mouseDragPath([slot, edge, await world(20, 4)], 16);
  s = await ev('__chem.state');
  const cl = s.atoms.find((a) => a.el === 'Cl');
  ok(cl && s.reactions === 0 && s.avail.Cl === 2, 'a chlorine carried from the panel wide of the hydrogen lands free', [s.reactions, s.avail]);
  // moved again through the hydrogen, it is grabbed on the way
  await mouseDragPath([await world(cl.x, cl.y), await world(17, 11), await world(9, 11)], 16);
  s = await ev('__chem.state');
  ok(s.wasted === 1 && s.lost === 1, 'dragged from the dish past a hydrogen, the chlorine is grabbed on the way: hydrogen chloride', [s.wasted, s.lost, s.lastEvent]);
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
  ok(s.level === 17 && !s.card && s.lost === 0 && s.avail.Cl === 3, 'TRY AGAIN restarts the level with the panel full', [s.level, s.avail]);
  // The panel is no safe route (owner, 2026-09-25): carried from it straight over the hydrogen, it is grabbed on the way.
  const [fe3] = atomsOf(s, 'Fe'), [h3, h4] = atomsOf(s, 'H'), [na3] = atomsOf(s, 'Na');
  await ev(`(() => { __chem.move(${fe3.id}, 6, 11); __chem.move(${h3.id}, 14, 11.5); __chem.move(${h4.id}, 3, 20); __chem.move(${na3.id}, 24, 21); })()`);
  await mouseDragPath([slot, edge, await world(14, 11.5), await world(20, 4)], 16);
  s = await ev('__chem.state');
  ok(s.wasted === 1 && s.lost === 1 && s.avail.Cl === 2, 'carried from the panel right over a hydrogen, the chlorine is grabbed on the way: hydrogen chloride', [s.wasted, s.lost, s.avail, s.lastEvent]);
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
await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&level=22' }, async ({ ev }) => {
  const s = await ev('__chem.state');
  ok(s.atoms.length === 18, 'desktop level 22 floats 18 radicals', s.atoms.length);
  ok(s.placement.reachable === s.placement.needed && s.placement.needed === 6, 'and every one the list needs can be reached without passing another', s.placement);
  ok(Object.values(s.palm).length === 18, 'all of them charged');
  const g = await ev('__chem.geom()');
  ok(Object.values(g.atoms).every((a) => a.x > g.dish.x && a.x < g.dish.x + g.dish.w && a.y > g.dish.y && a.y < g.dish.y + g.dish.h), 'all inside the dish');
});
await withPage({ w: 390, h: 844, dpr: 2, mobile: true, url: BASE + '?drift=0&level=10' }, async ({ ev }) => {
  const s = await ev('__chem.state');
  ok(s.atoms.length === 11 && s.placement.reachable === s.placement.needed, 'a 390x844 phone gets level 10 with its full crowd of 11, every needed radical reachable', [s.atoms.length, s.placement]);
});
await withPage({ w: 320, h: 568, dpr: 2, mobile: true, url: BASE + '?drift=0&level=22' }, async ({ ev }) => {
  const s = await ev('__chem.state');
  ok(s.atoms.length < 12 && s.atoms.length >= 7 && s.placement.reachable === s.placement.needed,
     'a short phone gets a thinner crowd, and still every needed radical reachable', [s.atoms.length, s.placement]);
});

// ---------- live drift ----------
await withPage({ w: 760, h: 600, url: BASE + '?embed=1&level=22' }, async ({ ev }) => {
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
  // a panel atom rides above the finger, so the finger goes a little below where the atom should land
  await touchDrag(slot, await world(9 + 2.6, 10 + 2.3), 20);
  s = await ev('__chem.state');
  let h = s.atoms.find((a) => a.el === 'H');
  ok(h && h.mol === s.atoms.find((a) => a.id === o.id).mol && s.avail.H === 1 && s.reactions === 1,
     'a hydrogen dragged in by touch and let go by the oxygen clasps it', s.atoms);
  const rs = g.ctrl.find((b) => b.id === 'restart');
  await touchTap(rs.x + rs.w / 2, rs.y + rs.h / 2);
  s = await ev('__chem.state');
  ok(s.avail.H === 2 && s.reactions === 0, 'Restart works by touch', [s.avail, s.reactions]);
  // let go in open water it lands free; lifted from where it is, it is taken to the oxygen
  const [o2] = atomsOf(s, 'O');
  await ev(`__chem.move(${o2.id}, 9, 10)`);
  await touchDrag(slot, await world(18, 18 + 2.3), 20);
  s = await ev('__chem.state');
  h = s.atoms.find((a) => a.el === 'H');
  ok(h && h.mol !== s.atoms.find((a) => a.id === o2.id).mol && s.reactions === 0, 'let go by touch in open water, it lands free', s.atoms);
  await touchDrag(await world(h.x, h.y), await world(9 + 2.6, 10), 20);
  s = await ev('__chem.state');
  ok(s.atoms.find((a) => a.id === h.id).mol === s.atoms.find((a) => a.id === o2.id).mol, 'then dragged to the oxygen by touch, it is grabbed', s.atoms);
});

// ---------- chapter 2: reactions, by real drags ----------
const keyAt = (st, key, zone) => st.pieces.find((q) => q.key === key && (!zone || q.zone === zone));
// A reaction's card, once the tube's colours are done: pressed shut with its own button (Skip while its atoms still fly).
const closeReactionCard = async (ev, press) => {
  for (let k = 0; k < 30; k++) {
    const g = await ev('__chem.geom()');
    if (g.reactionCard && g.reactionCard.button) {
      const b = g.reactionCard.button;
      await press(b.x + b.w / 2, b.y + b.h / 2);
      return !(await ev('__chem.state')).reactionCard;
    }
    await sleep(100);
  }
  return false;
};
await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&chapter=2&level=4' }, async ({ ev, mouseDrag, click }) => {
  let st = await ev('__chem.state'), g = await ev('__chem.geom()');
  ok(st.chapter === 2 && st.pieces.length === 6, 'chapter 2 level 4 floats six molecules', [st.chapter, st.pieces.length]);
  const tubeC = centre(g.tube);
  await mouseDrag(g.pieces[keyAt(st, 'hydrochloric-acid').id], tubeC);
  await mouseDrag(g.pieces[keyAt(st, 'sodium-chloride').id], tubeC);
  st = await ev('__chem.state');
  ok(st.tube.length === 2 && !st.reacting, 'an acid and a salt in the tube: no reaction, both stay', st.tube);
  g = await ev('__chem.geom()');
  await mouseDrag(g.pieces[keyAt(st, 'sodium-chloride', 'tube').id], { x: g.dish.x + 60, y: g.dish.y + 60 });
  st = await ev('__chem.state');
  ok(keyAt(st, 'sodium-chloride').zone === 'dish' && st.tube.length === 1, 'a molecule can be dragged back out of the tube', st.tube);
  g = await ev('__chem.geom()');
  await mouseDrag(g.pieces[keyAt(st, 'hydrochloric-acid', 'tube').id], { x: g.dish.x + 300, y: g.dish.y + 380 });
  g = await ev('__chem.geom()'); st = await ev('__chem.state');
  await mouseDrag(g.pieces[keyAt(st, 'sulphuric-acid').id], tubeC);
  g = await ev('__chem.geom()'); st = await ev('__chem.state');
  await mouseDrag(g.pieces[keyAt(st, 'calcium-hydroxide').id], tubeC);
  st = await ev('__chem.state');
  ok(st.reacting && st.made['calcium-sulphate'] === 1 && st.pieces.filter((q) => q.zone === 'tray').length === 2,
     'sulphuric acid and calcium hydroxide react: the calcium sulphate the list wants counts itself, the two waters stay on the shelves',
     [st.made, st.pieces.filter((q) => q.zone === 'tray')]);
  await sleep(2600);                 // the reaction plays out before its products are on the shelf
  st = await ev('__chem.state');
  ok(st.reactionCard === 'Neutralisation', 'when the colours are done, a card names the reaction', st.reactionCard);
  ok(await closeReactionCard(ev, click), 'Skip closes it');
  st = await ev('__chem.state');
  ok(st.result && st.result.kind === 'win', 'and with the card read, the level is won', st.result);
  await sleep(1900);
  g = await ev('__chem.geom()');
  ok(!!g.cta, 'the win card shows');
  if (g.cta) await click(g.cta.x + g.cta.w / 2, g.cta.y + g.cta.h / 2);
  st = await ev('__chem.state');
  ok(st.level === 5 && !st.card, 'NEXT LEVEL loads reaction level 5', [st.level, st.card]);
});

await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&chapter=2&level=16' }, async ({ ev, mouseDrag, click }) => {
  let st = await ev('__chem.state'), g = await ev('__chem.geom()');
  const tubeC = centre(g.tube);
  await mouseDrag(g.pieces[keyAt(st, 'ammonium-chloride').id], tubeC);
  g = await ev('__chem.geom()'); st = await ev('__chem.state');
  await mouseDrag(g.pieces[keyAt(st, 'sodium-hydroxide').id], tubeC);
  await sleep(2600);                 // the reaction plays out before its products are on the shelf
  ok(await closeReactionCard(ev, click), 'the reaction card closes');
  st = await ev('__chem.state'); g = await ev('__chem.geom()');
  ok(['sodium-chloride', 'water', 'ammonia'].every((k) => keyAt(st, k, 'tray')), 'ammonium chloride and sodium hydroxide give salt, water and ammonia');
  await mouseDrag(g.pieces[keyAt(st, 'ammonia', 'tray').id], { x: g.dish.x + g.dish.w / 2, y: g.dish.y + g.dish.h - 60 });
  st = await ev('__chem.state');
  ok(keyAt(st, 'ammonia').zone === 'dish', 'the ammonia byproduct is kept, back in the dish');
  g = await ev('__chem.geom()');
  await mouseDrag(g.pieces[keyAt(st, 'nitric-acid').id], tubeC);
  g = await ev('__chem.geom()'); st = await ev('__chem.state');
  await mouseDrag(g.pieces[keyAt(st, 'ammonia', 'dish').id], tubeC);
  await sleep(2600 + 2700);           // the reaction, then the whole of its card's animation
  g = await ev('__chem.geom()');
  ok(g.reactionCard && g.reactionCard.button.w >= 200, 'when the atoms have landed the card offers CONTINUE', g.reactionCard);
  ok(await closeReactionCard(ev, click), 'CONTINUE closes it');
  st = await ev('__chem.state'); g = await ev('__chem.geom()');
  ok(st.made['ammonium-nitrate'] === 1 && !keyAt(st, 'water', 'tray') && !keyAt(st, 'sodium-chloride', 'tray'),
     'ammonia and nitric acid make ammonium nitrate, which counts itself, and the salt and water left on the shelves are poured away',
     [st.made, st.pieces.filter((q) => q.zone === 'tray')]);
  ok(st.result && st.result.kind === 'win', 'and the level is won', st.result);
});

await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&chapter=2&level=1' }, async ({ ev, mouseDrag, click }) => {
  let st = await ev('__chem.state'), g = await ev('__chem.geom()');
  const tubeC = centre(g.tube);
  await mouseDrag(g.pieces[keyAt(st, 'hydrochloric-acid').id], tubeC);
  g = await ev('__chem.geom()'); st = await ev('__chem.state');
  await mouseDrag(g.pieces[keyAt(st, 'sodium-hydroxide').id], tubeC);
  st = await ev('__chem.state'); g = await ev('__chem.geom()');
  ok(st.reacting && st.made['sodium-chloride'] === 1, 'two in the tube: the reaction starts and the salt the list wants counts itself', [st.reacting, st.made]);
  await mouseDrag(g.traySlots[1], { x: g.dish.x + 60, y: g.dish.y + 60 });
  st = await ev('__chem.state');
  ok(keyAt(st, 'water', 'tray'), 'while it reacts, what is on the shelves cannot be picked up yet', st.pieces);
  await mouseDrag(g.pieces[keyAt(st, 'water', 'dish').id], tubeC);
  st = await ev('__chem.state');
  ok(st.tube.length === 0 && keyAt(st, 'water', 'dish'), 'and nothing more goes in the tube', st.tube);
  await sleep(2600);
  ok(await closeReactionCard(ev, click), 'the reaction card closes');
  st = await ev('__chem.state'); g = await ev('__chem.geom()');
  ok(!st.reacting, 'the reaction is over after about two and a half seconds', st.reacting);
  ok(st.result && st.result.kind === 'win', 'and the level is won, with nothing to carry', st.result);
});

await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&chapter=2&level=13' }, async ({ ev, mouseDrag, click }) => {
  let st = await ev('__chem.state'), g = await ev('__chem.geom()');
  const tubeC = centre(g.tube);
  await mouseDrag(g.pieces[keyAt(st, 'calcium-oxide').id], tubeC);
  g = await ev('__chem.geom()'); st = await ev('__chem.state');
  await mouseDrag(g.pieces[keyAt(st, 'hydrochloric-acid').id], tubeC);
  st = await ev('__chem.state');
  ok(st.lost === 2 && st.result && st.result.kind === 'fail', 'quicklime with the only hydrochloric acid: no salt and no water, both lost, the level fails', [st.lost, st.result]);
  await sleep(3000);
  st = await ev('__chem.state');
  ok(st.reactionCard && !st.cardShown, 'the fail card waits while the reaction card is up', [st.reactionCard, st.cardShown]);
  ok(await closeReactionCard(ev, click), 'the reaction card closes');
  await sleep(700);
  ok((await ev('__chem.state')).cardShown, 'then the fail card shows');
});

await withPage({ w: 390, h: 844, dpr: 2, mobile: true, url: BASE + '?drift=0&chapter=2&level=1' }, async ({ ev, touchDrag, touchTap }) => {
  let st = await ev('__chem.state'), g = await ev('__chem.geom()');
  ok(st.mode === 'mobile' && st.chapter === 2, 'a phone gets chapter 2 in the phone layout');
  const tubeC = centre(g.tube);
  await touchDrag(g.pieces[keyAt(st, 'hydrochloric-acid').id], tubeC);
  g = await ev('__chem.geom()'); st = await ev('__chem.state');
  await touchDrag(g.pieces[keyAt(st, 'sodium-hydroxide').id], tubeC);
  await sleep(2600);                 // the reaction plays out before its products are on the shelf
  ok(await closeReactionCard(ev, touchTap), 'touch: the reaction card closes with its button');
  st = await ev('__chem.state'); g = await ev('__chem.geom()');
  ok(st.made['sodium-chloride'] === 1, 'touch: acid and base react in the tube, and the salt counts itself', [st.made, st.pieces]);
  ok(st.result && st.result.kind === 'win', 'touch: the level is won', st.result);
});

// ---------- chapter 3: organic, the same bench ----------
await withPage({ w: 390, h: 844, dpr: 2, mobile: true, url: BASE + '?drift=0&chapter=3&level=1' }, async ({ ev, touchDrag, touchTap }) => {
  let g = await ev('__chem.geom()'), st = await ev('__chem.state');
  ok(st.mode === 'mobile' && st.chapter === 3 && st.pieces.length === 3, 'a phone gets chapter 3 with three molecules', [st.mode, st.chapter, st.pieces.length]);
  ok(st.card === 'clue' && st.cardShown && g.card && g.card.lines >= 2, 'an organic level opens on its clue card', [st.card, st.cardShown, g.card]);
  await touchTap(g.cta.x + g.cta.w / 2, g.cta.y + g.cta.h / 2);
  st = await ev('__chem.state'); g = await ev('__chem.geom()');
  ok(st.card === null, 'touch: START puts the clue away', st.card);
  const tubeC = centre(g.tube);
  await touchDrag(g.pieces[keyAt(st, 'ethene').id], tubeC);
  g = await ev('__chem.geom()'); st = await ev('__chem.state');
  await touchDrag(g.pieces[keyAt(st, 'hydrogen').id], tubeC);
  await sleep(2600);                 // the reaction plays out before its products are on the shelf
  ok(await closeReactionCard(ev, touchTap), 'touch: the reaction card closes with its button');
  st = await ev('__chem.state'); g = await ev('__chem.geom()');
  ok(st.made.ethane === 1, 'touch: ethene and hydrogen make ethane, which counts itself', [st.made, st.pieces]);
  ok(st.result && st.result.kind === 'win', 'touch: the level is won', st.result);
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
  await sleep(2600);                 // the reaction plays out before its products are on the shelf
  st = await ev('__chem.state');
  ok(keyAt(st, 'ethane', 'tray') && st.lost === 1, 'mouse: ethene with hydrogen when the list wants ethanol loses it', [st.lost, st.pieces]);
  ok(await closeReactionCard(ev, click), 'its reaction card closes');
  await sleep(700);
  st = await ev('__chem.state');
  ok(st.card === 'fail' && st.cardShown, 'and the fail card shows', [st.card, st.cardShown]);
});

// ---------- the sections screen, and the level map ----------
await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&crowd=0' }, async ({ ev, click, reload }) => {
  let st = await ev('__chem.state'), g = await ev('__chem.geom()');
  const press = (b) => click(b.x + b.w / 2, b.y + b.h / 2);
  ok(st.phase === 'home', 'a visit opens on the sections screen', st.phase);
  ok(g.rows.map((r) => r.name).join() === 'Moleculator,Reactor,Carbon Chamber', 'with all three sections on it', g.rows.map((r) => r.name));
  ok(g.rows.every((r) => r.label === 'START'), 'a new player is offered START in each', g.rows.map((r) => r.label));
  ok(g.rows.every((r, i) => !i || r.y >= g.rows[i - 1].y + g.rows[i - 1].h - 1), 'the rows do not overlap', g.rows.map((r) => [r.y, r.h]));
  await press(g.rows[0].button);
  st = await ev('__chem.state'); g = await ev('__chem.geom()');
  ok(st.phase === 'play' && st.chapter === 1 && st.level === 1, 'the Moleculator button plays molecules level 1', [st.phase, st.chapter, st.level]);
  ok(g.ctrl[0].id === 'map', 'with the map one tap away, first in the control row', g.ctrl.map((b) => b.id));

  await press(g.ctrl[0]);
  st = await ev('__chem.state'); g = await ev('__chem.geom()');
  const cell = (c, n) => g.cells.find((q) => q.c === c && q.n === n);
  ok(st.phase === 'map' && g.view.scroll === 0, 'the map button opens the map, a new player at its top', [st.phase, g.view.scroll]);
  ok(cell(1, 1).open && cell(1, 1).next && !cell(1, 2).open, 'molecules: level 1 open, level 2 not yet', [cell(1, 1), cell(1, 2)]);
  // the map is long now, so gather the cells a screenful at a time
  const seen = await ev(`(() => { const all = [];
    __chem.scrollMap(-1e9);
    for (let i = 0; i < 40; i++) { __chem.scrollMap(i * 150); for (const q of __chem.geom().cells) all.push(q); }
    return all; })()`);
  const any = (c, n) => seen.find((q) => q.c === c && q.n === n);
  ok(any(2, 1) && any(2, 1).open && !any(2, 2).open && any(3, 1) && any(3, 1).open,
     'Chem Lab and Carbon Lab are open from the start, each at level 1', [any(2, 1), any(2, 2), any(3, 1)]);

  // the map's left button goes back to the sections
  g = await ev('(__chem.scrollMap(0), __chem.geom())');
  const back = g.ctrl.find((b) => b.id === 'home');
  ok(!!back, 'the map has a way back to the sections', g.ctrl.map((b) => b.id));
  await press(back);
  st = await ev('__chem.state'); g = await ev('__chem.geom()');
  ok(st.phase === 'home', 'and it goes there', st.phase);
  await press(g.rows[1].button);
  st = await ev('__chem.state'); g = await ev('__chem.geom()');
  ok(st.phase === 'play' && st.chapter === 2 && st.level === 1, 'the Reactor plays Chem Lab level 1, no molecules needed first', [st.phase, st.chapter, st.level]);
  ok(g.ctrl.map((b) => b.id).join() === 'map,sound,restart', 'the map button leads the control row', g.ctrl.map((b) => b.id));

  // back to molecules level 1 through the map, and win it
  await press(g.ctrl[0]);
  g = await ev('(__chem.scrollMap(0), __chem.geom())');
  ok(g.phase === 'map', 'the map button opens the map');
  await press(cell(1, 1));
  st = await ev('__chem.state');
  ok(st.phase === 'play' && st.chapter === 1 && st.level === 1, 'and molecules level 1 from there', [st.phase, st.chapter, st.level]);
  const O = st.atoms.find((a) => a.el === 'O');
  await ev(`__chem.move(${O.id}, 18, 12)`);
  for (const side of [1, -1]) {
    st = await ev(`__chem.carry('H', ${18 + 8 * side}, 12)`);
    // carried across the dish from the panel, it may clasp the oxygen on the way in: a helpful grab (2026-09-25)
    const h = st.atoms.filter((a) => a.el === 'H' && a.free === 1).pop();
    if (h) st = await ev(`__chem.carry(${h.id}, ${18 + 2.6 * side}, 12)`);
  }
  ok(st.result && st.result.kind === 'win', 'level 1 won', st.result);
  const saved = await ev(`JSON.parse(localStorage.getItem('zam.chemistry.progress'))`);
  ok(JSON.stringify(saved && saved['desktop-1']) === JSON.stringify({ at: 0, done: 1 }), 'the win is saved: one molecules level done', saved);

  // a returning player: the sections again, the one they played offering CONTINUE
  await reload(BASE + '?embed=1&drift=0&crowd=0');
  st = await ev('__chem.state'); g = await ev('__chem.geom()');
  ok(st.phase === 'home' && g.rows[0].label === 'CONTINUE' && g.rows[1].label === 'START',
     'a returning player opens on the sections, the one they played offering CONTINUE', [st.phase, g.rows.map((r) => r.label)]);
  await press(g.rows[0].button);
  st = await ev('__chem.state'); g = await ev('__chem.geom()');
  ok(st.phase === 'play' && st.chapter === 1 && st.level === 2, 'and it opens the level after the one they won', [st.phase, st.chapter, st.level]);
  await press(g.ctrl[0]);
  g = await ev('(__chem.scrollMap(0), __chem.geom())');
  ok(g.phase === 'map', 'and the map is still one tap away', g.phase);
  ok(cell(1, 1).done && cell(1, 2).next && cell(1, 2).open && !cell(1, 3).open, 'level 1 ticked, level 2 next, level 3 shut', [cell(1, 1), cell(1, 2), cell(1, 3)]);
  await click(cell(1, 3).x + 20, cell(1, 3).y + 20);
  ok((await ev('__chem.state')).phase === 'map', 'a shut level does not open');
  await press(cell(1, 2));
  st = await ev('__chem.state');
  ok(st.phase === 'play' && st.chapter === 1 && st.level === 2, 'tapping the next level plays it', [st.phase, st.chapter, st.level]);
});

await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&chapter=2&level=5' }, async ({ ev, click, reload }) => {
  ok((await ev('__chem.state')).level === 5, 'Chem Lab level 5 opened by its address');
  await reload(BASE + '?embed=1&drift=0');
  let st = await ev('__chem.state');
  const g = await ev('__chem.geom()');
  ok(st.phase === 'home' && g.rows[1].label === 'CONTINUE', 'a returning player opens on the sections, the one they played offering CONTINUE', [st.phase, g.rows.map((r) => r.label)]);
  await click(g.rows[1].button.x + g.rows[1].button.w / 2, g.rows[1].button.y + g.rows[1].button.h / 2);
  st = await ev('__chem.state');
  ok(st.phase === 'play' && st.chapter === 2 && st.level === 5, 'and CONTINUE takes them back where they were', [st.phase, st.chapter, st.level]);
});

await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&chapter=2&level=60' }, async ({ ev, click }) => {
  await ev(`(() => { __chem.freeze(0); const L = __chem.lab;
    for (const [where, key] of ChemLevels.lab.desktop[59].solution) { L.act(where, L.find(key)); __chem.advance(2800); L.closeCard(); }
    __chem.advance(2600); })()`);
  let st = await ev('__chem.state');
  const g = await ev('__chem.geom()');
  ok(st.card === 'win' && g.cta, 'the last reactions level won', st.card);
  await click(g.cta.x + g.cta.w / 2, g.cta.y + g.cta.h / 2);
  st = await ev('__chem.state');
  ok(st.phase === 'play' && st.chapter === 3 && st.level === 1 && st.card === 'clue',
     'its button goes on to the next chapter: organic level 1, on its clue', [st.phase, st.chapter, st.level, st.card]);
});

await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&chapter=3&level=40' }, async ({ ev, click }) => {
  await ev(`(() => { __chem.freeze(0); const L = __chem.lab;
    for (const [where, key] of ChemLevels.organic.desktop[39].solution) { L.act(where, L.find(key)); __chem.advance(2800); L.closeCard(); }
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
