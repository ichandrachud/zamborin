/* Karrots — how open should a board be?
 *
 * §5 of the brief sets holesByTier to [9,9,8,8,7,7] with bricks on top. Every
 * one of those totals is NINE blocked cells, and nine is odd, so not one of
 * them can be tiled by dominoes at all: 36 - 9 = 27 cells and a domino covers
 * two. The constants have to change, so this measures what to change them to.
 *
 * For each hole count it lays random boards with the bunny, the fox and the
 * carrot placed at a fixed distance apart, tiles them, and solves them with
 * the real unpruned BFS. It reports the median par, how big the search gets,
 * and how often the fox changes the answer.
 *
 * Run: node --max-old-space-size=6144 karrots/tune-holes.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('./model.js');
import { solve } from './solve.mjs';

function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

/** One tiling of the free cells, or null. Same backtracker as the bench. */
function tile(free) {
  const g = free.slice(), out = [];
  return (function rec() {
    const i = g.indexOf(true);
    if (i < 0) return out.slice();
    const r = (i / M.C) | 0, c = i % M.C;
    if (c + 1 < M.C && g[i + 1]) {
      g[i] = g[i + 1] = false; out.push([i, i + 1]);
      const t = rec(); if (t) return t;
      out.pop(); g[i] = g[i + 1] = true;
    }
    if (r + 1 < M.R && g[i + M.C]) {
      g[i] = g[i + M.C] = false; out.push([i, i + M.C]);
      const t = rec(); if (t) return t;
      out.pop(); g[i] = g[i + M.C] = true;
    }
    return null;
  })();
}

const LETTERS = 'abdeghijklmnopqrstuvwxyzABDEGHIJKLMNOPQRSTUVWXYZ';

/** A random board with `nHoles` holes (the bunny, the fox and the carrot stand
 *  in three of them) that can actually be tiled, or null after `tries`. */
function board(nHoles, rnd, tries = 400) {
  for (let t = 0; t < tries; t++) {
    const cells = [...Array(M.N).keys()].sort(() => rnd() - 0.5).slice(0, nHoles);
    let d = 0, l = 0;
    cells.forEach(i => { const p = M.rc(i); ((p.r + p.c) & 1) ? l++ : d++; });
    if (d !== l) continue;
    const free = new Array(M.N).fill(true);
    cells.forEach(i => free[i] = false);
    const tiling = tile(free);
    if (!tiling) continue;
    const ch = new Array(M.N).fill('.');
    tiling.forEach(([a, b], n) => { ch[a] = ch[b] = LETTERS[n % LETTERS.length]; });
    // Bunny and carrot as far apart as this hole set allows; the fox somewhere
    // between them, which is the placement the bench showed actually matters.
    let bp = null, cp = null, bestD = -1;
    for (const i of cells) for (const j of cells) {
      if (i === j) continue;
      const a = M.rc(i), b = M.rc(j), dd = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
      if (dd > bestD) { bestD = dd; bp = i; cp = j; }
    }
    const rest = cells.filter(i => i !== bp && i !== cp);
    if (!rest.length) continue;
    const fp = rest[(rnd() * rest.length) | 0];
    ch[bp] = 'B'; ch[cp] = 'C'; ch[fp] = 'F';
    const rows = [];
    for (let r = 0; r < M.R; r++) rows.push(ch.slice(r * M.C, r * M.C + M.C).join(''));
    try { const st = M.parse(rows); return { rows, st, spread: bestD }; }
    catch (e) { continue; }
  }
  return null;
}

const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

const CAP = 300000, PER = 14;
console.log('holes  tiles  solved  median par   median states   fox changed   uncapped');
console.log('-----  -----  ------  ----------   -------------   -----------   --------');
for (const h of [8, 10, 12, 14, 16, 18, 20, 22]) {
  const rnd = rng(20260906 + h);
  const pars = [], states = []; let solved = 0, changed = 0, capped = 0, made = 0;
  for (let n = 0; n < PER; n++) {
    const b = board(h, rnd);
    if (!b) continue;
    made++;
    const w = solve(b.st, { fox: true, cap: CAP, path: false });
    const o = solve(b.st, { fox: false, cap: CAP, path: false });
    if (w.capped || o.capped) { capped++; continue; }
    if (!w.solved) continue;
    solved++; pars.push(w.par); states.push(w.states);
    if (o.solved && w.par > o.par) changed++;
  }
  console.log(String(h).padStart(5), String((36 - h) / 2).padStart(6),
    String(solved + '/' + made).padStart(8), String(med(pars) ?? '—').padStart(11),
    String(med(states) ?? '—').padStart(16), String(changed).padStart(13),
    String(made - capped).padStart(11));
}
