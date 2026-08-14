/* MOBILE — the gate.

   One question decides whether this is a game or a toy with good manners:

     the sculpture shows you which way every rod is wrong. Can a player who
     never thinks just follow that downhill until it balances?

   Four ways of playing without planning, all of which get the full droop
   feedback a real player gets:

     climb      try every single change, take whichever most reduces the total
                tilt, repeat until nothing helps. The strongest thoughtless
                player there is, and the one that matters.
     droop      find the worst rod, make its heavy side lighter or its light
                side heavier, repeat. What a person actually does.
     heavy      hang the heaviest piece on the longest arm, and so on down.
     fill       hang pieces in the order they come, then climb from there.

   A board only counts as demanding if it defeats every one of them.

   Run:  node mobile/measure.js
*/
const M = require('./model.js');

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const med = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const pct = (n, d) => d ? (100 * n / d).toFixed(0) + '%' : 'n/a';

// A play state: which shape index sits on which hook, and which are still in
// the tray. An empty hook simply weighs nothing, which is what a real one does.
function freshState(b) { return { on: {}, used: new Array(b.shapes.length).fill(false) }; }
const weights = (b, st) => { const at = {}; for (const h of b.hooks) at[h] = st.on[h] != null ? b.shapes[st.on[h]] : 0; return at; };
const errOf = (b, st) => M.totalError(b.tree, weights(b, st));
const done = (b, st) => b.hooks.every(h => st.on[h] != null) && errOf(b, st) === 0;

// Everything a player could do in one action: hang, take off, or exchange.
function actions(b, st) {
  const out = [];
  for (const h of b.hooks) {
    for (let i = 0; i < b.shapes.length; i++) {
      if (st.used[i]) continue;
      out.push({ kind: st.on[h] == null ? 'hang' : 'swap', h, i });
    }
    if (st.on[h] != null) out.push({ kind: 'off', h });
  }
  // exchange two hanging pieces
  for (let a = 0; a < b.hooks.length; a++)
    for (let c = a + 1; c < b.hooks.length; c++) {
      const ha = b.hooks[a], hc = b.hooks[c];
      if (st.on[ha] != null && st.on[hc] != null && b.shapes[st.on[ha]] !== b.shapes[st.on[hc]])
        out.push({ kind: 'exchange', h: ha, h2: hc });
    }
  return out;
}
function applyAction(st, a) {
  const n = { on: { ...st.on }, used: st.used.slice() };
  if (a.kind === 'off') { n.used[n.on[a.h]] = false; delete n.on[a.h]; }
  else if (a.kind === 'exchange') { const t = n.on[a.h]; n.on[a.h] = n.on[a.h2]; n.on[a.h2] = t; }
  else { if (n.on[a.h] != null) n.used[n.on[a.h]] = false; n.on[a.h] = a.i; n.used[a.i] = true; }
  return n;
}

// score: unfilled hooks are worse than any tilt, so a player fills first
const score = (b, st) => {
  const empty = b.hooks.filter(h => st.on[h] == null).length;
  return empty * 1e6 + errOf(b, st);
};

function climb(b, start, budget = 120) {
  let st = start || freshState(b);
  for (let n = 0; n < budget; n++) {
    if (done(b, st)) return { won: true, n };
    let best = null, bestScore = score(b, st);
    for (const a of actions(b, st)) {
      const s = score(b, applyAction(st, a));
      if (s < bestScore) { bestScore = s; best = a; }
    }
    if (!best) return { won: done(b, st), n, stuck: true };
    st = applyAction(st, best);
  }
  return { won: done(b, st), n: budget };
}

// What a person does: look at the worst rod, fix that rod.
function droop(b, budget = 120) {
  let st = freshState(b);
  for (let n = 0; n < budget; n++) {
    if (done(b, st)) return { won: true, n };
    const empty = b.hooks.filter(h => st.on[h] == null);
    if (empty.length) {
      // hang the piece that best serves the emptiest rod
      let best = null, bestScore = Infinity;
      for (const h of empty) for (let i = 0; i < b.shapes.length; i++) {
        if (st.used[i]) continue;
        const s = score(b, applyAction(st, { kind: 'hang', h, i }));
        if (s < bestScore) { bestScore = s; best = { kind: 'hang', h, i }; }
      }
      if (!best) return { won: false, n };
      st = applyAction(st, best);
      continue;
    }
    const errs = M.errors(b.tree, weights(b, st));
    const worst = errs.reduce((a, e) => Math.abs(e.err) > Math.abs(a.err) ? e : a, errs[0]);
    if (!worst || worst.err === 0) return { won: done(b, st), n };
    let best = null, bestScore = score(b, st);
    for (const a of actions(b, st)) {
      const s = score(b, applyAction(st, a));
      if (s < bestScore) { bestScore = s; best = a; }
    }
    if (!best) return { won: false, n, stuck: true };
    st = applyAction(st, best);
  }
  return { won: done(b, st), n: budget };
}

function heavyFirst(b) {
  const order = b.hooks.slice();
  let st = freshState(b);
  const idx = b.shapes.map((w, i) => i).sort((a, c) => b.shapes[c] - b.shapes[a]);
  order.forEach((h, k) => { if (idx[k] != null) { st.on[h] = idx[k]; st.used[idx[k]] = true; } });
  return climb(b, st);
}
function fillThenClimb(b, rnd) {
  let st = freshState(b);
  b.hooks.forEach((h, k) => { st.on[h] = k; st.used[k] = true; });
  return climb(b, st);
}

const PLAYERS = { climb: (b) => climb(b), droop, heavy: heavyFirst, fill: fillThenClimb };

function band(lo, hi, want) {
  const rnd = mulberry(41 + lo);
  const boards = [];
  for (let n = 0; n < want; n++) {
    const b = M.generate(lo + ((n * 3) % Math.max(1, hi - lo + 1)), rnd);
    if (b) boards.push(b);
  }
  if (!boards.length) return null;

  let demanding = 0;
  const per = {}; for (const k in PLAYERS) per[k] = 0;
  const sols = [], hookCount = [], spare = [], stuck = [];

  for (const b of boards) {
    let any = false;
    for (const k in PLAYERS) {
      const r = PLAYERS[k](b, rnd);
      if (r.won) { per[k]++; any = true; }
      if (k === 'climb') stuck.push(r.stuck ? 1 : 0);
    }
    if (!any) demanding++;
    sols.push(b.solutions); hookCount.push(b.hooks.length); spare.push(b.spare);
  }
  return { n: boards.length, demanding, per, sols: med(sols),
           hooks: med(hookCount), spare: med(spare), stuck: mean(stuck) };
}

console.log('MOBILE — is it a puzzle, or does the tilt just solve it for you?\n');
for (const [lo, hi] of [[1, 12], [13, 28], [29, 44], [45, 60]]) {
  const r = band(lo, hi, 20);
  if (!r) { console.log(`levels ${lo}-${hi}: no boards generated\n`); continue; }
  console.log(`levels ${lo}-${hi}   (${r.n} boards, ${r.hooks} hooks, ${r.spare} spare pieces)`);
  console.log(`   beats EVERY unplanned player : ${r.demanding} / ${r.n}  ${pct(r.demanding, r.n)}`);
  console.log(`   each on its own              : ` + Object.entries(r.per).map(([k, v]) => `${k} ${pct(v, r.n)}`).join(', '));
  console.log(`   hill climbing gets stuck     : ${(r.stuck * 100).toFixed(0)}% of boards`);
  console.log(`   ways to balance it           : ${r.sols}`);
  console.log('');
}
console.log('READ IT LIKE THIS');
console.log('  climb wins often  -> the droop solves it for you, and it is a toy');
console.log('  gets stuck often  -> there are real local traps, which is the puzzle');
