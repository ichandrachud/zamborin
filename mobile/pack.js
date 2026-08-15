/* MOBILE — build the shipped level pack.

   Sized from the craft measurement rather than guessed: four hooks is trivial
   for anybody (careless 85%), and by seven, attention takes a player from 40%
   to 75%. So the set opens at four as a tutorial and settles at six to eight.

   Run:  node mobile/pack.js
*/
const M = require('./model.js');
const fs = require('fs');

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Does the sculpture foul itself at rest?

   Nothing checked this before, and it shows: rods crossed each other and shapes
   hung straight through the rod below. A real mobile is built so it can turn
   without touching, and a drawing of one has to read the same way.

   Everything below is in model units, at rest, with a shape's radius taken as
   the same proportion the renderer uses. */
function fouls(b) {
  const S = M.layout(b.tree, 0, 0, { hooks: {}, rods: [] }, {});
  const heaviest = Math.max(...b.shapes);
  const need = {}; M.demand(b.tree, need);
  const rad = (w) => 1.02 * Math.sqrt(w / heaviest) * 0.62;   // matches AREA_K 2.05

  // Every line in the drawing, as a segment. Rods run across; strings hang
  // straight down from each rod end to whatever is below it. The first version
  // of this only knew about rods, so strings went straight through shapes.
  const segs = [];
  for (const r of S.rods) {
    segs.push({ x1: r.x - r.L, y1: r.y, x2: r.x + r.R, y2: r.y, id: null });
    segs.push({ x1: r.x - r.L, y1: r.y, x2: r.x - r.L, y2: r.y + r.node.dropL, id: kidOf(r.node.left) });
    segs.push({ x1: r.x + r.R, y1: r.y, x2: r.x + r.R, y2: r.y + r.node.dropR, id: kidOf(r.node.right) });
  }
  function kidOf(n) { return n.hook ? n.id : null; }

  const hung = b.hooks.map(h => {
    const w = need[h], r = rad(w);
    return { id: h, x: S.hooks[h].x, y: S.hooks[h].y + r, r };
  });

  const distToSeg = (px, py, s) => {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const L2 = dx * dx + dy * dy;
    let t = L2 ? ((px - s.x1) * dx + (py - s.y1) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
  };

  // a shape may only touch the one string it hangs from
  for (const sh of hung)
    for (const s of segs) {
      if (s.id === sh.id) continue;
      if (distToSeg(sh.x, sh.y, s) < sh.r * 1.06) return true;
    }
  // shapes must clear each other
  for (let i = 0; i < hung.length; i++)
    for (let j = i + 1; j < hung.length; j++) {
      const a = hung[i], c = hung[j];
      if (Math.hypot(a.x - c.x, a.y - c.y) < (a.r + c.r) * 0.95) return true;
    }
  // and rods at the same height must not run over one another
  for (let i = 0; i < S.rods.length; i++)
    for (let j = i + 1; j < S.rods.length; j++) {
      const a = S.rods[i], c = S.rods[j];
      if (Math.abs(a.y - c.y) > 1.4) continue;
      if (Math.min(a.x + a.R, c.x + c.R) > Math.max(a.x - a.L, c.x - c.L) - 0.5) return true;
    }
  return false;
}

// strip the tree to plain data, with the ids the renderer needs
let n = 0;
function pure(node) {
  if (M.isHook(node)) return { hook: true, id: node.id };
  return { id: node.id, L: node.L, R: node.R, dropL: node.dropL, dropR: node.dropR,
           left: pure(node.left), right: pure(node.right) };
}

/* How often does a thoughtless arrangement already balance?

   This is the question the old `solutions !== 1` check was meant to answer and
   did not. `solutions` counts how many SCALAR MULTIPLES of the weight vector
   the tray can supply — so a board whose hooks all want the same weight counts
   as "unique" even though every arrangement of the pieces wins. That is exactly
   how level 1 shipped as three identical shapes on three hooks: nothing to
   decide, nothing to get wrong, and a first impression that the game is a
   formality.

   So ask it directly. Hang the pieces at random, many times, and measure how
   often that is already correct. A board only earns its place if carelessness
   usually fails. */
const shuffleRnd = mulberry(4242);   // its own stream, so sampling cannot perturb generation
function carelessWinRate(b, N = 4000) {
  const hooks = b.hooks, tray = b.shapes, n = hooks.length;
  const idx = tray.map((_, i) => i);
  let ok = 0;
  for (let t = 0; t < N; t++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = (shuffleRnd() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const at = {};
    for (let k = 0; k < n; k++) at[hooks[k]] = tray[idx[k]];
    if (M.totalError(b.tree, at) === 0) ok++;
  }
  return ok / N;
}

const rnd = mulberry(1898);          // Calder's birth year, for luck
const out = [];
// The mockups show around nine or ten pieces hung, so the set climbs to that.
// Depth has to be dialled per stage as well as hook count: a depth-5 tree
// always comes out with eight to ten hooks, so the tutorial sizes simply could
// not be generated from one setting.
const plan = [
  // `careless` is the ceiling on how often a random arrangement already wins.
  // Three hooks and three distinct shapes gives six arrangements, one correct,
  // so 1/6 is the best a tutorial board can do — hence 0.20 there and tighter
  // after. Without this a board of identical weights sails through.
  { count: 3,  hooks: [3, 4],  spare: 0, depth: 2, careless: 0.20 },   // tutorial: no decoys
  { count: 5,  hooks: [4, 5],  spare: 1, depth: 3, careless: 0.10 },
  { count: 8,  hooks: [5, 6],  spare: 2, depth: 3, careless: 0.05 },
  { count: 10, hooks: [6, 7],  spare: 3, depth: 4, careless: 0.02 },
  { count: 8,  hooks: [7, 8],  spare: 4, depth: 4, careless: 0.02 },
  { count: 6,  hooks: [8, 10], spare: 4, depth: 5, careless: 0.02 },
];

M.configure({ SLACK: 0, COLLIDE: false });
for (const stage of plan) {
  let made = 0;
  for (let t = 0; t < 30000 && made < stage.count; t++) {
    const b = M.generate(10 + out.length, rnd, { depth: stage.depth, spare: stage.spare });
    if (!b) continue;
    if (b.hooks.length < stage.hooks[0] || b.hooks.length > stage.hooks[1]) continue;
    const need = b.hooks.map(h => b.need[h]);
    if (Math.max(...need) > 48) continue;
    // the answer must be unique, or "balanced" stops meaning "correct"
    if (b.solutions !== 1) continue;
    if (fouls(b)) continue;
    // last, because it is the expensive one
    if (carelessWinRate(b) > stage.careless) continue;
    out.push({ tree: pure(b.tree), hooks: b.hooks, shapes: b.shapes,
               need: b.hooks.map(h => b.need[h]), level: out.length + 1 });
    made++;
  }
  if (made < stage.count) console.log('  short on ' + stage.hooks.join('-') + ' hooks: ' + made + '/' + stage.count);
}

fs.writeFileSync('mobile/levels-pack.js', 'window.MOBILE_PACK = ' + JSON.stringify(out) + ';\n');
console.log('  ' + out.length + ' levels, ' + Math.min(...out.map(l => l.hooks.length)) + '-' +
            Math.max(...out.map(l => l.hooks.length)) + ' hooks, ' +
            Math.min(...out.map(l => l.shapes.length)) + '-' + Math.max(...out.map(l => l.shapes.length)) + ' shapes');
