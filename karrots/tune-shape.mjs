/* Karrots — what shape of 9x6 board can actually be given an honest par?
 *
 * Moving to 9x6 broke the thing that makes par possible. `tune-holes.mjs` on
 * the new board found ZERO of twelve random boards solvable inside a 250k cap
 * at every hole count from 16 to 24: fifty-four cells packed with twenty
 * dominoes has a reachable state space far past any exhaustive search, and
 * §4.4 says a level whose search exceeds the cap is not shipped with a guess.
 *
 * The lever is the IMMOVABLE BRICK. A wall takes a cell out of the board
 * without adding a piece, so it shrinks the state space instead of growing it,
 * which is the opposite of what a hole does. This sweeps walls against holes
 * and reports what can be searched to the end.
 *
 * Run: node --max-old-space-size=8192 karrots/tune-shape.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('./model.js');
import { solve } from './solve.mjs';

function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

function tile(free) {
  const g = free.slice(), out = [];
  return (function rec() {
    const i = g.indexOf(true);
    if (i < 0) return out.slice();
    const r = (i / M.C) | 0, c = i % M.C;
    if (c + 1 < M.C && g[i + 1]) { g[i] = g[i + 1] = false; out.push([i, i + 1]);
      const t = rec(); if (t) return t; out.pop(); g[i] = g[i + 1] = true; }
    if (r + 1 < M.R && g[i + M.C]) { g[i] = g[i + M.C] = false; out.push([i, i + M.C]);
      const t = rec(); if (t) return t; out.pop(); g[i] = g[i + M.C] = true; }
    return null;
  })();
}
const LETTERS = 'abdeghijklmnopqrstuvwxyzABDEGHIJKLMNOPQRSTUVWXYZ';

/** A board with `nHoles` holes and `nWalls` walls, bunny and carrot far apart,
 *  the fox somewhere between. */
function board(nHoles, nWalls, rnd, tries = 500) {
  for (let t = 0; t < tries; t++) {
    const order = [...Array(M.N).keys()].sort(() => rnd() - 0.5);
    const holes = order.slice(0, nHoles), walls = order.slice(nHoles, nHoles + nWalls);
    const blocked = holes.concat(walls);
    let d = 0, l = 0;
    blocked.forEach(i => { const p = M.rc(i); ((p.r + p.c) & 1) ? l++ : d++; });
    if (d !== l) continue;
    const free = new Array(M.N).fill(true);
    blocked.forEach(i => free[i] = false);
    const tiling = tile(free);
    if (!tiling) continue;
    const ch = new Array(M.N).fill('.');
    walls.forEach(i => ch[i] = '#');
    tiling.forEach(([a, b], n) => { ch[a] = ch[b] = LETTERS[n % LETTERS.length]; });
    let bp = null, cp = null, best = -1;
    for (const i of holes) for (const j of holes) {
      if (i === j) continue;
      const a = M.rc(i), b = M.rc(j), dd = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
      if (dd > best) { best = dd; bp = i; cp = j; }
    }
    const rest = holes.filter(i => i !== bp && i !== cp);
    if (!rest.length) continue;
    ch[bp] = 'B'; ch[cp] = 'C'; ch[rest[(rnd() * rest.length) | 0]] = 'F';
    const rows = [];
    for (let r = 0; r < M.R; r++) rows.push(ch.slice(r * M.C, r * M.C + M.C).join(''));
    try { return { rows, st: M.parse(rows), spread: best }; } catch (e) { continue; }
  }
  return null;
}
const med = a => a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : null;

const CAP = 250000, PER = 10;
console.log(`${M.C}x${M.R} = ${M.N} cells. Sweeping walls against holes; ${PER} boards each, cap ${CAP}.\n`);
console.log('holes  walls  slats  finished  solved  median par  median states  spread');
console.log('-----  -----  -----  --------  ------  ----------  -------------  ------');
for (const holes of [12, 14, 16]) {
  for (const walls of [0, 6, 10, 14, 18]) {
    const cells = M.N - holes - walls;
    if (cells < 8 || cells % 2) continue;
    const rnd = rng(20260907 + holes * 100 + walls);
    const pars = [], states = [], spreads = [];
    let made = 0, finished = 0, solved = 0;
    for (let n = 0; n < PER; n++) {
      const b = board(holes, walls, rnd);
      if (!b) continue;
      made++; spreads.push(b.spread);
      const w = solve(b.st, { fox: true, cap: CAP, path: false });
      if (w.capped) continue;
      finished++;
      if (!w.solved) continue;
      solved++; pars.push(w.par); states.push(w.states);
    }
    console.log(String(holes).padStart(5), String(walls).padStart(6), String(cells / 2).padStart(6),
      String(finished + '/' + made).padStart(9), String(solved).padStart(7),
      String(med(pars) ?? '—').padStart(11), String(med(states) ?? '—').padStart(14),
      String(med(spreads) ?? '—').padStart(7));
  }
}
