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

/** Domino tilings of the '?' cells, sampled rather than enumerated.
 *
 *  Enumerating in a fixed order was fine on a 6x6 with eight holes. On 9x6
 *  with forty tile cells there are astronomically many tilings, and taking the
 *  first two dozen in right-then-down order returns two dozen boards that are
 *  IDENTICAL except for the last few dominoes - which is a sample of one
 *  dressed up as a sample of twenty-four. Each run now shuffles which
 *  direction is tried first, from a seeded generator so the bench repeats. */
function tilings(free, cap = 4000, seed = 1) {
  const out = [], sig = new Set();
  let s = (seed >>> 0) || 1;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const grid0 = free.slice();
  for (let attempt = 0; attempt < cap * 40 && out.length < cap; attempt++) {
    const grid = grid0.slice(), placed = [];
    const ok = (function rec() {
      const i = grid.indexOf(true);
      if (i < 0) return true;
      const r = (i / M.C) | 0, c = i % M.C;
      const opts = [];
      if (c + 1 < M.C && grid[i + 1]) opts.push([i, i + 1]);
      if (r + 1 < M.R && grid[i + M.C]) opts.push([i, i + M.C]);
      if (opts.length === 2 && rnd() < 0.5) opts.reverse();
      for (const [a, b] of opts) {
        grid[a] = grid[b] = false; placed.push([a, b]);
        if (rec()) return true;
        placed.pop(); grid[a] = grid[b] = true;
      }
      return false;
    })();
    if (!ok) break;                                 // untileable at all
    const k = placed.map(p => p.join(':')).sort().join('|');
    if (sig.has(k)) continue;
    sig.add(k); out.push(placed.map(p => p.slice()));
  }
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
    // Walls and the three of them are blocked cells for parity, but the
    // repairer may not shift them: a wall is a design decision and the bunny,
    // the fox and the carrot were placed on purpose.
    else if (c === 'B' || c === 'F' || c === 'C' || c === '#') holes.push(i);
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
export function repair(layout, radius = 2, nudges = 3) {
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
  /* One nudge was enough on a 6x6 with eight holes. On 9x6 with sixteen it
     usually is not: the tile cells break into several pockets and fixing one
     leaves another wrong. Try the best single nudge that at least reduces the
     damage, then repair what is left, up to `nudges` deep. */
  if (nudges > 1) {
    const score = f => {
      // fewer pockets that are odd or off-colour is closer to tileable
      const mark = new Uint8Array(M.N); let bad = 0;
      for (let i = 0; i < M.N; i++) {
        if (!f[i] || mark[i]) continue;
        const st = [i], cells = []; mark[i] = 1;
        while (st.length) { const j = st.pop(); cells.push(j);
          for (const nj of M.NB4[j]) if (f[nj] && !mark[nj]) { mark[nj] = 1; st.push(nj); } }
        let d = 0, l = 0;
        cells.forEach(j => { const p = M.rc(j); ((p.r + p.c) & 1) ? l++ : d++; });
        if (cells.length % 2 || d !== l) bad++;
      }
      return bad;
    };
    let bestT = null, bestS = score(free0);
    for (const t of tries) {
      const f = free0.slice(); f[t.from] = true; f[t.to] = false;
      const sc = score(f);
      if (sc < bestS) { bestS = sc; bestT = t; }
    }
    if (bestT) {
      const out = flat.slice(); out[bestT.from] = '?'; out[bestT.to] = '.';
      const rows = [];
      for (let r = 0; r < M.R; r++) rows.push(out.slice(r * M.C, r * M.C + M.C).join(''));
      const deeper = repair(rows, radius, nudges - 1);
      if (deeper) return { rows: deeper.rows,
        moved: { from: at2(bestT.from), to: at2(bestT.to) + (deeper.moved ? ' +' : '') } };
    }
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
    ((p.r + p.c) & 1) ? light++ : dark++; });   // '#' counts: a wall is blocked too
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

  const all = tilings(free, opts.cap ?? 24, opts.seed ?? 20260907);
  const results = [];
  for (const t of all) {
    const rows = letter(layout, t);
    let st;
    try { st = M.parse(rows, null, opts.carrotAt ? { carrotAt: opts.carrotAt } : undefined); }
    catch (e) { results.push({ rows, error: e.message }); continue; }
    const r = foxChangesTheAnswer(st, { cap: opts.cap2 ?? 200000, path: false });
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
  /* NINE WIDE, SIX TALL, WITH WALLS, and every one of those three is a
     measurement rather than a preference.

     The board turned landscape because the desktop frame is, and the house
     rule for a landscape grid puts a six-row board at nine columns. A slat now
     slides only along its own axis and the carrot square is reserved, so not
     one par from the 6x6 set survived: this file was rebuilt from nothing on
     2026-09-07.

     THE WALLS ARE WHAT MAKE PAR POSSIBLE. Fifty-four cells packed with twenty
     dominoes has a reachable state space far past an exhaustive search:
     tune-shape.mjs finished only 2 searches in 10 with no walls, and 10 in 10
     with six of them. A wall takes a cell out of the board WITHOUT adding a
     piece, which is the opposite of what a hole does. Six is the shape that
     both searches to the end and still leaves the board open enough to cross.
  */
  /* L1 — four squares along her own row with one slat in the way, and he is under the gap she has to open. */
  L1: { layout: ['????.?#?.',
                 '.?#????.?',
                 'B..?C?#??',
                 '?.?..??#?',
                 '???F.?#?.',
                 '??.??#??.'], show: 6 },
  /* L2 — six squares, and his pocket is against the middle of the route. */
  L2: { layout: ['??#?.??#?',
                 '?.???#.??',
                 'B.?..?C?#',
                 '?.?F??.?.',
                 '????.#?.?',
                 '.?#???.??'], show: 6 },
  /* L3 — the route bends down the board and he is standing on the corner. */
  L3: { layout: ['?.?#?.??.',
                 'B.?.??#??',
                 '?.?.F??#?',
                 '??#..???.',
                 '?#???.?C?',
                 '????#?.?.'], show: 6 },
  /* L4 — top left to bottom right past him, with the walls forcing the crossing. */
  L4: { layout: ['B.?.?#???',
                 '.?#???.?.',
                 '??.?.#??.',
                 '???.F??#?',
                 '??#?.??.?',
                 '???#?.C?.'], show: 6 },
  /* L5 — right across all nine columns, and he is in the middle of them. */
  L5: { layout: ['??#.??#?.',
                 '?.??#?.??',
                 'B.?.?..?C',
                 '?.??F.???',
                 '????.?#.?',
                 '??#??.?#?'], show: 6 },
  /* L6 — the carrot drops three rows, so the route turns exactly where his reach is. */
  L6: { layout: ['B.?.?#?.?',
                 '.?#?.??#?',
                 '??.?F?.??',
                 '???..#??C',
                 '??#??.??.',
                 '???.??#?.'], show: 6 },
  /* L7 — the long way down the far side, past him twice. */
  L7: { layout: ['B.?.#??.?',
                 '?.?.??#??',
                 '?#??.??.?',
                 '??#.F?.?.',
                 '????.??#?',
                 '??.?#.?C?'], show: 6 },
  /* L8 — the wall. Corner to corner, the longest trip on the board. */
  L8: { layout: ['B.??#??.?',
                 '.?#?.????',
                 '??..F?#?.',
                 '?#??.?.??',
                 '?.#???.??',
                 '???.?#?.C'], show: 6 },
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
