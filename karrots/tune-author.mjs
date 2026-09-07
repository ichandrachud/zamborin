/* Karrots — the level authoring bench. An instrument, not the game.
 *
 * M1 ships EIGHT HAND-MADE LEVELS and no generator. What is hand-made is the
 * shape: where the holes are, where the bunny, the fox and the carrot stand,
 * and therefore what the level is about. What is not worth doing by hand is
 * lettering in fourteen dominoes without a typo, and then guessing whether the
 * result can be solved at all.
 *
 * So a layout is written with '?' for "somewhere under a tile", this bench
 * enumerates the domino tilings of those cells, solves every one with the real
 * unpruned BFS, and reports what each is actually like to play: par, par with
 * the fox rule switched off, whether he changed the answer, and how many
 * positions have at least one losing move and at least one safe one.
 *
 * The layouts and the choice are mine; the arithmetic is the machine's.
 *
 * Run: node karrots/tune-author.mjs [name]
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('./model.js');
import { foxChangesTheAnswer } from './solve.mjs';

const LETTERS = 'abcdefghijklmnopqrstuvwxyzABDEGHIJKLMNOPQRSTUVWXYZ'; // no C/F, they are entities

/** Every domino tiling of the '?' cells, up to `cap`. Standard backtracking
 *  from the first free cell, which only ever tries right and down, so each
 *  tiling is produced exactly once. */
function tilings(free, cap = 4000) {
  const out = [];
  const grid = free.slice();                       // true = still to cover
  const placed = [];
  (function rec() {
    if (out.length >= cap) return;
    let i = grid.indexOf(true);
    if (i < 0) { out.push(placed.map(p => p.slice())); return; }
    const { r, c } = M.rc(i);
    // right
    if (c + 1 < M.C && grid[i + 1]) {
      grid[i] = grid[i + 1] = false; placed.push([i, i + 1]);
      rec(); placed.pop(); grid[i] = grid[i + 1] = true;
    }
    // down
    if (r + 1 < M.R && grid[i + M.C]) {
      grid[i] = grid[i + M.C] = false; placed.push([i, i + M.C]);
      rec(); placed.pop(); grid[i] = grid[i + M.C] = true;
    }
  })();
  return out;
}

/** Turn a layout plus one tiling back into the six lettered rows a level is
 *  actually written as, so what gets shipped is text a person can read. */
function letter(layout, tiling) {
  const ch = new Array(M.N);
  layout.join('').split('').forEach((c, i) => { if (c !== '?') ch[i] = c; });
  tiling.forEach(([a, b], n) => { ch[a] = ch[b] = LETTERS[n % LETTERS.length]; });
  const rows = [];
  for (let r = 0; r < M.R; r++) rows.push(ch.slice(r * M.C, r * M.C + M.C).join(''));
  return rows;
}

/** Can these free cells be tiled at all? Cheapest possible answer: try. */
function tileable(free) { return tilings(free, 1).length > 0; }

/** Parity first, and analytically. A domino covers one dark cell and one
 *  light one, so the holes have to split evenly between the two colours or no
 *  tiling exists however they are arranged. An imbalance of 2k is fixed by
 *  moving k holes from the crowded colour to the other, and the least
 *  disruptive way to do that is to move each one to the NEAREST free cell of
 *  the colour that is short. The bunny, the fox and the carrot never move.
 */
export function rebalance(layout) {
  const flat = layout.join('').split('');
  const shadeOf = i => { const p = M.rc(i); return (p.r + p.c) & 1; };   // 1 = light
  const holes = [], moveable = [];
  flat.forEach((c, i) => {
    if (c === '.') { holes.push(i); moveable.push(i); }
    else if (c === 'B' || c === 'F' || c === 'C') holes.push(i);
  });
  let d = 0, l = 0;
  holes.forEach(i => shadeOf(i) ? l++ : d++);
  /* Moving a hole changes the balance by two, so an ODD number of holes can
     never be balanced however they are arranged - and the loop below would
     shuffle for ever trying. It has to be said rather than spun on: the fix is
     to add or remove a hole, which is a design decision, not arithmetic. */
  if ((d + l) % 2) throw new Error(`${d + l} holes is odd. A domino board needs an even ` +
    `number of blocked cells; add or remove one hole (this includes the bunny, the fox ` +
    `and the carrot, which all stand in holes).`);
  let moved = [];
  while (d !== l) {
    const fromShade = d > l ? 0 : 1;                 // take from the crowded colour
    const cand = moveable.filter(i => shadeOf(i) === fromShade);
    if (!cand.length) return null;
    // Nearest free cell of the other colour, so the drawing barely changes.
    let best = null;
    for (const h of cand) {
      const a = M.rc(h);
      for (let j = 0; j < M.N; j++) {
        if (flat[j] !== '?' || shadeOf(j) === fromShade) continue;
        const b = M.rc(j), dist = Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
        if (!best || dist < best.dist) best = { from: h, to: j, dist };
      }
    }
    if (!best) return null;
    flat[best.from] = '?'; flat[best.to] = '.';
    moveable.splice(moveable.indexOf(best.from), 1); moveable.push(best.to);
    moved.push(at2(best.from) + '->' + at2(best.to));
    if (fromShade === 0) { d--; l++; } else { l--; d++; }
  }
  const rows = [];
  for (let r = 0; r < M.R; r++) rows.push(flat.slice(r * M.C, r * M.C + M.C).join(''));
  return { rows, moved };
}

/** A layout is a drawing, and a drawing can be a cell or two out. This moves
 *  ONE hole at a time to a nearby cell and stops at the first board that can
 *  actually be tiled, leaving the bunny, the fox and the carrot exactly where
 *  they were put. It repairs the arithmetic of a board; it never invents one.
 *  Returns the repaired rows, or null if a single nudge is not enough. */
export function repair(layout, radius = 2) {
  const flat = layout.join('').split('');
  const free0 = flat.map(c => c === '?');
  if (free0.filter(Boolean).length % 2 === 0 && tileable(free0)) return { rows: layout, moved: null };

  const holes = [], fixed = new Set();
  flat.forEach((c, i) => { if (c === '.') holes.push(i); else if (c !== '?' && c !== '#') fixed.add(i); });

  const tries = [];
  for (const h of holes) {
    const a = M.rc(h);
    for (let dr = -radius; dr <= radius; dr++) for (let dc = -radius; dc <= radius; dc++) {
      if (!dr && !dc) continue;
      const r = a.r + dr, c = a.c + dc;
      if (!M.inside(r, c)) continue;
      const j = M.idx(r, c);
      if (flat[j] !== '?') continue;                      // only into a tile cell
      tries.push({ from: h, to: j, dist: Math.abs(dr) + Math.abs(dc) });
    }
  }
  tries.sort((x, y) => x.dist - y.dist);                  // smallest change first
  for (const t of tries) {
    const f = free0.slice(); f[t.from] = true; f[t.to] = false;
    if (!tileable(f)) continue;
    const out = flat.slice(); out[t.from] = '?'; out[t.to] = '.';
    const rows = [];
    for (let r = 0; r < M.R; r++) rows.push(out.slice(r * M.C, r * M.C + M.C).join(''));
    return { rows, moved: { from: at2(t.from), to: at2(t.to) } };
  }
  return null;
}
const at2 = i => { const p = M.rc(i); return p.r + ',' + p.c; };

export function bench(layout, opts = {}) {
  const flat = layout.join('').split('');
  if (flat.length !== M.N) throw new Error('layout must be ' + M.R + ' rows of ' + M.C);
  const free = flat.map(c => c === '?');
  const nFree = free.filter(Boolean).length;
  if (nFree % 2) throw new Error(`${nFree} tile cells is odd; a domino board needs an even number`);

  let dark = 0, light = 0;
  flat.forEach((c, i) => { if (c === '?') return; const p = M.rc(i);
    if (c !== '#') { if ((p.r + p.c) & 1) light++; else dark++; } });
  if (dark !== light)
    throw new Error(`parity: ${dark} dark and ${light} light cells are blocked. ` +
      `A domino covers one of each, so no tiling exists. Move ` +
      `${Math.abs(dark - light) / 2} hole${Math.abs(dark-light)>2?'s':''} from the ` +
      `${dark > light ? 'dark' : 'light'} squares to the ${dark > light ? 'light' : 'dark'} ones.`);

  /* Balanced parity is necessary and NOT sufficient. Holes can also cut the
     tile cells into separate pockets, and a pocket with an odd number of cells
     cannot be filled by dominoes however the rest goes. Saying which pocket
     saves the ten minutes otherwise spent re-checking a layout that is right. */
  const comps = [];
  const mark = new Uint8Array(M.N);
  for (let i = 0; i < M.N; i++) {
    if (!free[i] || mark[i]) continue;
    const stack = [i], cells = []; mark[i] = 1;
    while (stack.length) {
      const j = stack.pop(); cells.push(j);
      const p = M.rc(j);
      for (const d of M.DIRS) {
        if (!M.inside(p.r + d.dy, p.c + d.dx)) continue;
        const nj = M.idx(p.r + d.dy, p.c + d.dx);
        if (free[nj] && !mark[nj]) { mark[nj] = 1; stack.push(nj); }
      }
    }
    comps.push(cells);
  }
  const shade = c => { let d = 0, l = 0; c.forEach(i => { const p = M.rc(i);
    ((p.r + p.c) & 1) ? l++ : d++; }); return { d, l }; };
  const at = i => { const p = M.rc(i); return p.r + ',' + p.c; };
  const bad = comps.filter(c => { const s2 = shade(c); return c.length % 2 || s2.d !== s2.l; });
  if (bad.length) throw new Error('pockets ' + comps.map(c => {
      const s2 = shade(c);
      return c.length + (c.length % 2 || s2.d !== s2.l ? `(${s2.d}D/${s2.l}L BAD)` : '');
    }).join(' + ') + '. ' + bad.map(c => '{' + c.slice(0, 5).map(at).join(' ') +
      (c.length > 5 ? ' …' : '') + '}').join(' ') +
    ' — a pocket needs an even count AND equal dark and light, whatever the whole board says.');

  const all = tilings(free, opts.cap ?? 10);
  const results = [];
  for (const t of all) {
    const rows = letter(layout, t);
    let st;
    try { st = M.parse(rows, null, opts.carrotAt ? { carrotAt: opts.carrotAt } : undefined); }
    catch (e) { results.push({ rows, error: e.message }); continue; }
    const r = foxChangesTheAnswer(st, { cap: opts.cap2 ?? 400000, path: false });
    results.push({ rows, par: r.withFox.par, noFoxPar: r.without.par,
                   changed: r.changed, parDelta: r.parDelta, naiveDies: r.naiveDies,
                   branch: r.withFox.branchPoints, fatal: r.withFox.fatal,
                   states: r.withFox.states, solved: r.withFox.solved,
                   capped: r.withFox.capped });
  }
  return { tilings: all.length, results };
}

/* ---------- the layouts under consideration ----------
 * '.' hole   '#' brick   'B' bunny   'F' fox   'C' carrot   '?' under a tile
 */
export const DRAFTS = {
  /* THE TWO THINGS THE BENCH SETTLED, both of them measured.

     ONE. The fox only changes anything when his region sits ACROSS the route.
     The first drafts put him at an edge and par came out identical with the
     rule and without it on seven boards out of eight, which is the definition
     of decoration. From L2 on he stands between her and the carrot.

     TWO. The ladder is the DISTANCE from the bunny to her carrot, not how open
     the board is. Opening the board up was the obvious lever and it is the
     wrong one: tune-holes.mjs swept 8 to 22 holes and found that past about
     ten the reachable state space grows faster than the search can hold, so a
     loose board is easier to PLAY and impossible to produce an honest par for.
     Every level here keeps eight holes and moves the carrot further away.

     THREE, for the record: §5 of the brief cannot be built as written. Every
     tier sets holes + bricks to nine, and nine is odd, so 27 cells are left
     for dominoes that cover two each. */

  /* L1 — slide, then hop, and nothing else. The carrot starts UNDER a tile, so
     the first move a player ever makes is the move the game is named for, and
     the second is the reward. He is sealed into two cells across the board:
     the coral edge is on screen from the first frame, which is how the rule is
     SHOWN before it is ever enforced. No move here loses. */
  L1: { layout: ['?????.',
                 '???.??',
                 '.B?.??',
                 '??.??.',
                 '????.?',
                 'F.????'], carrotAt: [2, 2], show: 2 },

  /* L2 — the carrot is two squares along and one brick is in the way, and that
     brick has an obvious hole to go to, so the whole level is three moves. He
     is on the SAME ROW, two squares past the carrot, with one tile between:
     move that one and she walks into him. The rule gets shown here. */
  L2n: { layout: ['?.????',
                 '??????',
                 'B?C?F.',
                 '??????',
                 '?.????',
                 '??.??.'], show: 3 },

  /* L3 — three squares, two bricks in the way, and he is at the end of the
     row again so the last gap she opens is the dangerous one. */
  L3n: { layout: ['?..???',
                 '?????.',
                 'B??C?F',
                 '??????',
                 '?.????',
                 '???.??'], show: 3 },

  /* L4 — four squares, and he moves off the row and underneath it, so the
     danger stops being at the end and starts being in the middle. */
  L4n: { layout: ['?..???',
                 '????.?',
                 'B???C?',
                 '??F???',
                 '??.???',
                 '????.?'], show: 3 },
  /* L2 — the carrot two squares along and one brick in the way, with him directly below the gap she needs. */
  L2: { layout: ['????.?',
                 '?.????',
                 'B?C???',
                 '.F????',
                 '???.??',
                 '?????.'], show: 3 },
  /* L3 — three squares, and his pocket now touches the middle of the route. */
  L3: { layout: ['?????.',
                 '?.????',
                 'B??C??',
                 '??F.??',
                 '????.?',
                 '.?????'], show: 3 },
  /* L4 — four squares, and he is ABOVE the route for the first time, so the safe side changes. */
  L4: { layout: ['.?????',
                 '??F.??',
                 'B???C?',
                 '?.????',
                 '?????.',
                 '??.???'], show: 3 },
  /* L5 — right across the board, with him beside the far end of it. */
  L5: { layout: ['????.?',
                 '?.????',
                 'B??.?C',
                 '???F??',
                 '????.?',
                 '?.????'], show: 3 },
  /* L6 — the carrot drops off the row: the route turns a corner past him. */
  L6: { layout: ['???.??',
                 '.?????',
                 'B?????',
                 '??F.??',
                 '?.??C?',
                 '?????.'], show: 3 },
  /* L7 — down the far side of the board, and the lane that gets there fastest is his. */
  L7: { layout: ['?????.',
                 '?.????',
                 'B?.???',
                 '??F???',
                 '?????.',
                 '.???C?'], show: 3 },
  /* L8 — corner to corner, the longest trip in the world, and he is sitting in the middle of it. */
  L8: { layout: ['????.?',
                 '?.????',
                 'B??F??',
                 '???.??',
                 '.?????',
                 '?.???C'], show: 3 },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const want = process.argv[2];
  const names = want ? [want] : Object.keys(DRAFTS);
  for (const n of names) {
    const d = DRAFTS[n];
    let layout = d.layout, note = '';
    let bal;
    try { bal = rebalance(layout); }
    catch (e) { console.log(`\n=== ${n}  ${e.message}`); continue; }
    if (!bal) { console.log(`\n=== ${n}  parity cannot be balanced from this layout`); continue; }
    if (bal.moved.length) { layout = bal.rows; note += `  [parity: ${bal.moved.join(' ')}]`; }
    const fix = repair(layout);
    if (!fix) { console.log(`\n=== ${n}  cannot be tiled, and moving one hole does not fix it`); continue; }
    if (fix.moved) {
      layout = fix.rows;
      note += `  [tileable: ${fix.moved.from} -> ${fix.moved.to}]`;
    }
    let out;
    try { out = bench(layout, d); }
    catch (e) { console.log(`\n=== ${n}  ${e.message}`); continue; }
    const good = out.results.filter(r => r.solved);
    const errs = {};
    out.results.filter(r => !r.solved).forEach(r => {
      const why = r.error || (r.capped ? 'search hit the cap' : 'no solution exists');
      errs[why] = (errs[why] || 0) + 1;
    });
    const hist = {};
    good.forEach(r => { hist[r.par] = (hist[r.par] || 0) + 1; });
    const changed = good.filter(r => r.changed).length;
    console.log(`\n=== ${n}${note} · ${out.tilings} tilings · ${good.length} solvable · ` +
      `fox changed the answer on ${changed}` +
      `\n    par spread ` + (Object.keys(hist).length
        ? Object.keys(hist).sort((a,b)=>a-b).map(k=>`${k}:${hist[k]}`).join('  ')
        : '(none)') +
      (Object.keys(errs).length ? '\n    rejected: ' +
        Object.entries(errs).map(([k, v]) => `${v}x ${k}`).join(' · ') : ''));
    // ONE BOARD PER DISTINCT PAR. The ladder is built by par, so a list of
    // three boards that are all par 18 is no use for choosing between them.
    // Within a par: the one where the fox matters most, then the smallest
    // search, which is the board a person can most nearly hold in their head.
    const byPar = new Map();
    good.slice().sort((a, b) =>
      (b.changed - a.changed) || ((b.parDelta || 0) - (a.parDelta || 0)) || (a.states - b.states))
      .forEach(r => { if (!byPar.has(r.par)) byPar.set(r.par, r); });
    const pick = [...byPar.values()].sort((a, b) => a.par - b.par);
    if (note) console.log('    benched layout: ' + layout.join(' / '));
    for (const r of pick) {
      console.log(`  par ${r.par}  (no fox ${r.noFoxPar})  ` +
                  (r.parDelta > 0 ? `par +${r.parDelta}` : r.naiveDies ? 'naive line dies' : 'fox irrelevant') +
                  `  branch ${r.branch}  fatal ${r.fatal}  states ${r.states}`);
      r.rows.forEach(row => console.log('      ' + row));
    }
  }
}
