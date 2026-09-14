/* Lessons in Chemistry · input-path tests.   node chemistry/input-tests.mjs

   Real mouse and touch events through Chrome, never the game's own functions:
   a harness that calls the model tests the model, and the controls are a
   separate system (Crucible shipped with every button dead). State is read
   back through window.__chem. Needs the local server (see cdp.mjs). */
import { openPage, BASE, sleep } from './cdp.mjs';

let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log('FAIL  ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); } };
const centre = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

async function withPage(opts, body) {
  const p = await openPage(opts);
  const mouseAt = async (type, x, y) => {
    const q = await p.toPage(x, y);
    await p.send('Input.dispatchMouseEvent', { type, x: q.x, y: q.y, button: type === 'mouseMoved' ? 'none' : 'left',
      buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1, pointerType: 'mouse' });
    await sleep(50);
  };
  const io = {
    ev: p.ev,
    hover: (x, y) => mouseAt('mouseMoved', x, y),
    down: (x, y) => mouseAt('mousePressed', x, y),
    up: (x, y) => mouseAt('mouseReleased', x, y),
    async click(x, y) { await io.hover(x, y); await io.down(x, y); await io.up(x, y); },
    async touch(type, x, y) {
      const pts = type === 'touchEnd' ? [] : [await p.toPage(x, y)];
      await p.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q) => ({ x: q.x, y: q.y, id: 1 })) });
      await sleep(50);
    },
  };
  try {
    await body(io);
    ok(p.errors.length === 0, opts.url + ': no console errors', p.errors);
  } finally { p.close(); }
}

// ---------- desktop, mouse ----------
await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&level=1' }, async ({ ev, hover, down, up, click }) => {
  let g = await ev('__chem.geom()');
  ok(g.mode === 'desktop' && g.LW === 760 && g.LH === 600, 'desktop frame is 760x600', [g.mode, g.LW, g.LH]);
  const cell = (c, r) => g.cells[c + r * g.dish.cols];
  await hover(cell(2, 2).x, cell(2, 2).y);
  let s = await ev('__chem.state');
  ok(s.hover === 2 + 2 * 8, 'mouse hover previews the cell under it', s.hover);
  const ghost = JSON.stringify(s.ghostBonds);
  ok(ghost === JSON.stringify([{ to: 0, order: 1, dir: 1 }]), 'the ghost draws the bond to the oxygen', s.ghostBonds);
  await down(cell(2, 2).x, cell(2, 2).y); await up(cell(2, 2).x, cell(2, 2).y);
  s = await ev('__chem.state');
  ok(s.placements === 1, 'a click on an empty cell places the atom in hand', s.placements);
  ok(JSON.stringify(s.lastPlaced) === ghost, 'the bonds placed are the bonds the ghost drew', [ghost, s.lastPlaced]);
  await down(cell(5, 4).x, cell(5, 4).y); await up(cell(6, 4).x, cell(6, 4).y);
  ok((await ev('__chem.state')).placements === 1, 'press on one cell and release on another places nothing');
  // drag from the tray
  g = await ev('__chem.geom()');
  const hand = centre(g.hand);
  await hover(hand.x, hand.y); await down(hand.x, hand.y);
  await hover(cell(4, 2).x - 20, cell(4, 2).y + 30); await hover(cell(4, 2).x, cell(4, 2).y);
  s = await ev('__chem.state');
  ok(s.dragging && s.hover === 4 + 2 * 8, 'a drag from the tray previews the cell under the pointer', [s.dragging, s.hover]);
  const ghost2 = JSON.stringify(s.ghostBonds);
  await up(cell(4, 2).x, cell(4, 2).y);
  s = await ev('__chem.state');
  ok(s.placements === 2 && JSON.stringify(s.lastPlaced) === ghost2, 'release places exactly what the ghost drew', [ghost2, s.lastPlaced]);
  ok(s.result && s.result.kind === 'win' && s.made.water === 1, 'water made, level won', s.result);
  await sleep(1300);
  g = await ev('__chem.geom()');
  ok(!!g.cta, 'the win card shows with its CTA');
  if (g.cta) await click(g.cta.x + g.cta.w / 2, g.cta.y + g.cta.h / 2);
  s = await ev('__chem.state');
  ok(s.level === 2 && s.placements === 0 && !s.card, 'NEXT LEVEL loads level 2', [s.level, s.card]);
  g = await ev('__chem.geom()');
  const c2 = (c, r) => g.cells[c + r * g.dish.cols];
  await click(c2(1, 1).x, c2(1, 1).y);
  ok((await ev('__chem.state')).placements === 1, 'level 2: one placement by click');
  const restart = g.ctrl.find((b) => b.id === 'restart');
  await click(restart.x + restart.w / 2, restart.y + restart.h / 2);
  s = await ev('__chem.state');
  ok(s.placements === 0 && s.level === 2, 'Restart clears the dish and keeps the level', [s.placements, s.level]);
  const snd = g.ctrl.find((b) => b.id === 'sound');
  const before = await ev(`localStorage.getItem('zam.chemistry.sfx')`);
  await click(snd.x + snd.w / 2, snd.y + snd.h / 2);
  const after = await ev(`localStorage.getItem('zam.chemistry.sfx')`);
  ok(after === '0' && before !== '0', 'the sound pill turns sound off and remembers it', [before, after]);
  await click(c2(1, 1).x, c2(1, 1).y);
  await click(c2(1, 1).x, c2(1, 1).y);
  ok((await ev('__chem.state')).placements === 1, 'a click on an occupied cell does nothing');
});

await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0' }, async ({ ev }) => {
  ok((await ev('__chem.state')).level === 1, 'a fresh browser starts on level 1');
});

// ---------- desktop, a lost molecule through the input path ----------
await withPage({ w: 760, h: 600, url: BASE + '?embed=1&drift=0&level=3' }, async ({ ev, click }) => {
  const g = await ev('__chem.geom()');
  const cell = (c, r) => g.cells[c + r * g.dish.cols];
  await click(cell(4, 2).x, cell(4, 2).y);      // a chlorine beside the iron, with a hydrogen below it
  let s = await ev('__chem.state');
  ok(s.wasted === 1 && s.lost === 1, 'the hydrogen takes the chlorine: hydrogen chloride, iron chloride lost', [s.wasted, s.lost]);
  ok(s.result && s.result.kind === 'fail' && s.result.made === 0, 'two chlorines cannot finish the iron: the level fails', s.result);
  ok(!s.cardShown, 'the card waits, so the loss is seen first');
  const restart = g.ctrl.find((b) => b.id === 'restart');
  await sleep(1200);
  const g2 = await ev('__chem.geom()');
  ok(!!g2.cta, 'then the fail card shows');
  await click(restart.x + restart.w / 2, restart.y + restart.h / 2);
  ok((await ev('__chem.state')).card === 'fail', 'with the card up, Restart under the scrim does nothing');
  await click(g2.cta.x + g2.cta.w / 2, g2.cta.y + g2.cta.h / 2);
  s = await ev('__chem.state');
  ok(s.level === 3 && s.placements === 0 && !s.card && s.lost === 0, 'TRY AGAIN restarts the level', [s.level, s.placements, s.lost]);
});

// ---------- drift, live ----------
await withPage({ w: 760, h: 600, url: BASE + '?embed=1&level=7' }, async ({ ev }) => {
  const before = await ev('__chem.state');
  await sleep(9000);
  const after = await ev('__chem.state');
  ok(after.drift && after.hops >= 1, 'radicals drift on their own (' + after.hops + ' in 9 s)', after.hops);
  ok(after.hops <= 6, 'and slowly (' + after.hops + ' in 9 s)');
  ok(after.placements === 0 && after.lost === 0 && after.version === before.version + after.hops, 'drifting places nothing and loses nothing', [after.lost, after.version]);
  const cells = after.cells, byCell = new Map(cells.map((a) => [a.c + ',' + a.r, a]));
  const touching = cells.some((a) => a.free > 0 && [[0,-1],[1,0],[0,1],[-1,0]].some(([dc, dr]) => {
    const b = byCell.get((a.c + dc) + ',' + (a.r + dr)); return b && b.free > 0; }));
  ok(!touching, 'no two free hands side by side after drifting');
});

// ---------- mobile, touch ----------
await withPage({ w: 390, h: 844, dpr: 2, mobile: true, url: BASE + '?drift=0&level=1' }, async ({ ev, touch }) => {
  let g = await ev('__chem.geom()');
  ok(g.mode === 'mobile' && g.LW === 390 && g.LH === 844, 'a touch phone gets the mobile layout at its own size', [g.mode, g.LW, g.LH]);
  const cell = (c, r) => g.cells[c + r * g.dish.cols];
  const hand = centre(g.hand);
  await touch('touchStart', cell(1, 2).x, cell(1, 2).y); await touch('touchEnd');
  ok((await ev('__chem.state')).placements === 0, 'a tap on the dish places nothing on a phone (no hover, so no ghost)');
  const lift = 0.9 * g.dish.cell;
  await touch('touchStart', hand.x, hand.y);
  await touch('touchMove', hand.x, hand.y - 40);
  await touch('touchMove', cell(1, 2).x, cell(1, 2).y + lift);
  let s = await ev('__chem.state');
  ok(s.dragging && s.hover === 1 + 2 * 5, 'the atom rides above the finger and previews the cell it is over', [s.dragging, s.hover]);
  const ghost = JSON.stringify(s.ghostBonds);
  await touch('touchEnd');
  s = await ev('__chem.state');
  ok(s.placements === 1 && JSON.stringify(s.lastPlaced) === ghost && ghost === JSON.stringify([{ to: 0, order: 1, dir: 1 }]),
     'touch drag places exactly what the ghost drew', [ghost, s.lastPlaced]);
  await touch('touchStart', hand.x, hand.y); await touch('touchMove', 10, 20); await touch('touchEnd');
  ok((await ev('__chem.state')).placements === 1, 'a drag dropped off the dish places nothing');
  g = await ev('__chem.geom()');
  const rs = g.ctrl.find((b) => b.id === 'restart');
  await touch('touchStart', rs.x + rs.w / 2, rs.y + rs.h / 2); await touch('touchEnd');
  ok((await ev('__chem.state')).placements === 0, 'Restart works by touch');
});

console.log((fail ? 'FAILED  ' : 'ok  ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
