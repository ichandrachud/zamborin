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
  };
  try {
    await body(io);
    ok(p.errors.length === 0, opts.url + ': no console errors', p.errors);
  } finally { p.close(); }
}
const atomsOf = (s, el) => s.atoms.filter((a) => a.el === el);

// ---------- desktop: build iron chloride by dragging chlorine in from the panel ----------
await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&level=3' }, async ({ ev, world, mouseDrag, click }) => {
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
  await mouseDrag(slot, await world(f.x + 3.0, f.y));
  s = await ev('__chem.state');
  const cl1 = s.atoms.find((a) => a.el === 'Cl');
  ok(cl1 && cl1.mol === molOf(s, fe.id), 'a chlorine dragged to the iron is grabbed by it', s.atoms);
  ok(s.avail.Cl === 2 && s.lost === 0 && s.wasted === 0, 'one chlorine used, nothing lost', [s.avail, s.lost]);

  f = await feAt();
  await mouseDrag(slot, await world(f.x, f.y + 3.0));
  f = await feAt();
  await mouseDrag(slot, await world(f.x - 3.0, f.y - 0.4), 20);
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
await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&level=3' }, async ({ ev, world, mouseDragPath, click }) => {
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
await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&level=2' }, async ({ ev, world, mouseDrag }) => {
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
  await mouseDrag(await world(12, 14), await world(22 - 3.0, 20));
  s = await ev('__chem.state');
  ok(s.reactions === 1 && s.lost === 1, 'dragging a dish atom into a radical is a reaction too, and it can lose a molecule', [s.reactions, s.lost]);
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
await withPage({ w: 390, h: 844, dpr: 2, mobile: true, url: BASE + '?drift=0&level=1' }, async ({ ev, world, touchDrag, touchTap }) => {
  let s = await ev('__chem.state');
  ok(s.mode === 'mobile' && s.LW === 390 && s.LH === 844, 'a touch phone gets the mobile layout at its own size', [s.mode, s.LW, s.LH]);
  const [o] = atomsOf(s, 'O');
  await ev(`__chem.move(${o.id}, 9, 10)`);
  const g = await ev('__chem.geom()');
  const slot = centre(g.slots.find((q) => q.el === 'H'));
  // the atom rides above the finger, so the finger goes a little below where the atom should land
  const land = await world(9 + 3.0, 10 + 2.3);
  await touchDrag(slot, land, 20);
  s = await ev('__chem.state');
  const h = s.atoms.find((a) => a.el === 'H');
  ok(h && h.mol === s.atoms.find((a) => a.id === o.id).mol && s.avail.H === 1, 'a hydrogen dragged in by touch is grabbed by the oxygen', s.atoms);
  const rs = g.ctrl.find((b) => b.id === 'restart');
  await touchTap(rs.x + rs.w / 2, rs.y + rs.h / 2);
  s = await ev('__chem.state');
  ok(s.avail.H === 2 && s.reactions === 0, 'Restart works by touch', [s.avail, s.reactions]);
});

console.log((fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
