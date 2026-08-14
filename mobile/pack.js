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

// strip the tree to plain data, with the ids the renderer needs
let n = 0;
function pure(node) {
  if (M.isHook(node)) return { hook: true, id: node.id };
  return { id: node.id, L: node.L, R: node.R, dropL: node.dropL, dropR: node.dropR,
           left: pure(node.left), right: pure(node.right) };
}

const rnd = mulberry(1898);          // Calder's birth year, for luck
const out = [];
// The mockups show around nine or ten pieces hung, so the set climbs to that.
// Depth has to be dialled per stage as well as hook count: a depth-5 tree
// always comes out with eight to ten hooks, so the tutorial sizes simply could
// not be generated from one setting.
const plan = [
  { count: 3,  hooks: [3, 4],  spare: 0, depth: 2 },   // tutorial: no decoys
  { count: 5,  hooks: [4, 5],  spare: 1, depth: 3 },
  { count: 8,  hooks: [5, 6],  spare: 2, depth: 3 },
  { count: 10, hooks: [6, 7],  spare: 3, depth: 4 },
  { count: 8,  hooks: [7, 8],  spare: 4, depth: 4 },
  { count: 6,  hooks: [8, 10], spare: 4, depth: 5 },
];

M.configure({ SLACK: 0, COLLIDE: false });
for (const stage of plan) {
  let made = 0;
  for (let t = 0; t < 4000 && made < stage.count; t++) {
    const b = M.generate(10 + out.length, rnd, { depth: stage.depth, spare: stage.spare });
    if (!b) continue;
    if (b.hooks.length < stage.hooks[0] || b.hooks.length > stage.hooks[1]) continue;
    const need = b.hooks.map(h => b.need[h]);
    if (Math.max(...need) > 48) continue;
    // the answer must be unique, or "balanced" stops meaning "correct"
    if (b.solutions !== 1) continue;
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
