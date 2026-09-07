/* Karrots — forging levels backwards from a solved board.
 *
 * Hand-drawing boards stopped working the moment the rules changed. With a
 * slat sliding only along its own axis, a 9x6 board packed with sixteen of
 * them locks solid: of eight hand-drawn layouts benched on 2026-09-07, seven
 * had NO SOLUTION AT ALL and the eighth was par 9. Forward design has no way
 * of knowing whether a board can be opened.
 *
 * So it is built the other way round, which is what §4.4 said all along. Start
 * from the position where the bunny is already ON the carrot and walk away
 * from it at random, never stepping through a position the fox could win from.
 * Wherever the walk ends is a level, and it is solvable BY CONSTRUCTION -
 * retracing the walk solves it. The unpruned search then measures the true
 * par, which is usually a good deal shorter than the walk.
 *
 * Run: node --max-old-space-size=8192 karrots/tune-forge.mjs [count]
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('./model.js');
import { solve, foxChangesTheAnswer } from './solve.mjs';

const rng = seed => { let s = (seed >>> 0) || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
const pick = (a, r) => a[(r() * a.length) | 0];

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

/** A board shape: holes, walls, a domino tiling of the rest, the fox in one
 *  hole and the carrot in another far from him, with the bunny standing on the
 *  carrot. That last part is the point: this is a SOLVED position. */
function solvedBoard(nHoles, nWalls, r) {
  for (let attempt = 0; attempt < 600; attempt++) {
    const order = [...Array(M.N).keys()].sort(() => r() - 0.5);
    const holes = order.slice(0, nHoles), walls = order.slice(nHoles, nHoles + nWalls);
    let d = 0, l = 0;
    holes.concat(walls).forEach(i => { const p = M.rc(i); ((p.r + p.c) & 1) ? l++ : d++; });
    if (d !== l) continue;
    const free = new Array(M.N).fill(true);
    holes.concat(walls).forEach(i => free[i] = false);
    const tiling = tile(free);
    if (!tiling) continue;

    const grid = new Uint8Array(M.N);
    walls.forEach(i => grid[i] = M.BRICK);
    tiling.forEach(([a, b]) => {
      if (b === a + 1) { grid[a] = M.HL; grid[b] = M.HR; }
      else { grid[a] = M.VT; grid[b] = M.VB; }
    });
    /* The carrot goes near one end of the board and the fox is PARKED for now
       at the far end, out of the way. He is placed properly later, once the
       walk has said where the bunny ends up: a fox chosen before the route
       exists is a fox nowhere near it, which is exactly what the first forge
       produced - fifteen levels and not one where he changed the answer. */
    let carrot = null, park = null, best = -1;
    for (const i of holes) for (const j of holes) {
      if (i === j) continue;
      const a = M.rc(i), b = M.rc(j), dd = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
      if (dd > best) { best = dd; carrot = i; park = j; }
    }
    const st = { grid, bunny: carrot, fox: park, carrot };
    if (M.caught(st)) return null;
    return { st, holes };
  }
  return null;
}

/** Walk away from the solved position, LEANING AWAY from the carrot.
 *
 *  An unbiased walk wanders and comes back: the first forge took up to
 *  forty-eight steps and produced par 3, because the bunny had hopped in a
 *  circle. Two thirds of the time the walk now takes the move that puts her
 *  furthest from her carrot, which turns a wander into a journey. */
function forge(st0, steps, r) {
  let st = st0;
  const dist = (a, b) => { const p = M.rc(a), q = M.rc(b);
    return Math.abs(p.r - q.r) + Math.abs(p.c - q.c); };
  for (let n = 0; n < steps; n++) {
    const legal = M.moves(st).filter(mv => !M.caught(M.apply(st, mv)));
    if (!legal.length) break;
    if (r() < 0.66) {
      let bestMv = null, bestD = -1;
      for (const mv of legal) {
        const ns = M.apply(st, mv);
        const d = dist(ns.bunny, ns.carrot);
        if (d > bestD) { bestD = d; bestMv = mv; }
      }
      st = M.apply(st, bestMv);
    } else st = M.apply(st, pick(legal, r));
  }
  return st;
}

/** Put him ONE WRONG SLIDE AWAY.
 *
 *  "Near the middle of her trip" sounds like the right place and is not: it
 *  put him behind two walls as often as beside the route, and a fox who cannot
 *  be reached by any single slide is scenery. What actually matters is
 *  countable - how many of the slides available RIGHT NOW would join his holes
 *  to hers - so that is what candidates are ranked by, with distance to the
 *  middle of her trip only breaking ties. */
function placeFox(st) {
  /* THE HOLES OF THIS POSITION, not the ones the board started with. Passing
     in the original list put the fox on a cell a slat had since slid over: his
     region was then just himself, he could never catch anyone, and the level
     only failed much later when the writer could not letter a domino whose
     other half had been overwritten by an F. */
  const holes = [];
  for (let i = 0; i < M.N; i++) if (st.grid[i] === M.HOLE) holes.push(i);
  const hers = M.foxRegion({ ...st, fox: st.bunny });
  const b = M.rc(st.bunny), c = M.rc(st.carrot);
  const midR = (b.r + c.r) / 2, midC = (b.c + c.c) / 2;
  return holes
    .filter(i => !hers[i] && i !== st.carrot && i !== st.bunny)
    .map(i => {
      const cand = { ...st, fox: i };
      if (M.caught(cand)) return null;
      let oneSlideAway = 0;
      for (const mv of M.slideMoves(cand)) if (M.caught(M.apply(cand, mv))) oneSlideAway++;
      const p = M.rc(i);
      return { i, oneSlideAway, d: Math.abs(p.r - midR) + Math.abs(p.c - midC) };
    })
    .filter(Boolean)
    .sort((x, y) => (y.oneSlideAway - x.oneSlideAway) || (x.d - y.d))
    .map(o => o.i);
}

const CAP = 300000;
const want = Number(process.argv[2] || 40);
const out = [];
let tried = 0;
const r = rng(20260907);
console.log('forging on ' + M.C + 'x' + M.R + '…\n');
console.log(' par  no-fox  delta  naive  branch   states  holes  walls  slats');
console.log(' ---  ------  -----  -----  ------  -------  -----  -----  -----');
while (out.length < want && tried < 400) {
  tried++;
  const nHoles = 12 + 2 * ((r() * 3) | 0);            // 12, 14 or 16
  const nWalls = 6 + 2 * ((r() * 3) | 0);             // 6, 8 or 10
  if ((M.N - nHoles - nWalls) % 2) continue;
  const made = solvedBoard(nHoles, nWalls, r);
  if (!made) continue;
  const walked = forge(made.st, 22 + ((r() * 34) | 0), r);
  if (M.won(walked)) continue;
  /* WHERE HE STANDS IS THE DESIGN, so it is chosen rather than taken. Trying
     the first three obstructive-looking holes and keeping whichever was
     solvable gave a fox who changed the answer on 2 boards in 30 - under the
     30% line that kills the game. Every candidate hole is scored instead, and
     the one where he matters most is the one that ships. */
  let st = null, res = null, score = -1;
  for (const f of placeFox(walked).slice(0, 10)) {
    const cand = { ...walked, fox: f };
    if (M.caught(cand)) continue;
    const rr2 = foxChangesTheAnswer(cand, { cap: CAP });
    if (!rr2.withFox.solved || rr2.withFox.capped || rr2.withFox.par < 4) continue;
    const sc = (rr2.parDelta > 0 ? 1000 + rr2.parDelta * 100 : 0) +
               (rr2.naiveDies ? 500 : 0) + Math.min(400, rr2.withFox.branchPoints);
    M.validate(cand);   // never ship a position the parser would refuse
    if (sc > score) { score = sc; st = cand; res = rr2; }
  }
  if (!st) continue;
  let holes = 0, walls = 0;
  for (let i = 0; i < M.N; i++) {
    if (st.grid[i] === M.HOLE) holes++; else if (st.grid[i] === M.BRICK) walls++;
  }
  const rows = M.ascii(st);
  out.push({ rows: lettered(st), par: res.withFox.par, noFoxPar: res.without.par,
             parDelta: res.parDelta, naiveDies: res.naiveDies,
             branch: res.withFox.branchPoints, states: res.withFox.states,
             holes, walls, slats: (M.N - holes - walls) / 2 });
  const o = out[out.length - 1];
  console.log(String(o.par).padStart(4), String(o.noFoxPar ?? '—').padStart(7),
    String(o.parDelta ?? '—').padStart(6), (o.naiveDies ? 'dies' : '—').padStart(6),
    String(o.branch).padStart(7), String(o.states).padStart(8),
    String(o.holes).padStart(6), String(o.walls).padStart(6), String(o.slats).padStart(6));
  void rows;
}

/** The board written the way a level is written: one letter per domino. */
function lettered(st) {
  const LET = 'abdeghijklmnopqrstuvwxyzABDEGHIJKLMNOPQRSTUVWXYZ';
  const ch = new Array(M.N); let n = 0;
  for (let i = 0; i < M.N; i++) {
    if (st.grid[i] === M.BRICK) ch[i] = '#';
    else if (st.grid[i] === M.HOLE) ch[i] = '.';
  }
  for (let i = 0; i < M.N; i++) {
    if (st.grid[i] === M.HL) { ch[i] = ch[i + 1] = LET[n++ % LET.length]; }
    else if (st.grid[i] === M.VT) { ch[i] = ch[i + M.C] = LET[n++ % LET.length]; }
  }
  ch[st.bunny] = 'B'; ch[st.fox] = 'F'; ch[st.carrot] = 'C';
  const rows = [];
  for (let r2 = 0; r2 < M.R; r2++) rows.push(ch.slice(r2 * M.C, r2 * M.C + M.C).join(''));
  return rows;
}

out.sort((a, b) => a.par - b.par);
console.log(`\n${out.length} levels forged from ${tried} attempts. ` +
  `The fox changed the answer on ${out.filter(o => o.parDelta > 0 || o.naiveDies).length}.`);
import { writeFileSync } from 'node:fs';
writeFileSync('/tmp/karrots-forged.json', JSON.stringify(out, null, 1));
console.log('written to /tmp/karrots-forged.json');
