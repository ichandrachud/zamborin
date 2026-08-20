/* TAILWIND — the golf meter: BOTH inputs timed.

   The shipped control is a drag, and a drag has no time pressure. You can take
   five seconds lining it up and let go exactly on the number you learned last
   time, so once you know the answer there is no execution risk left. All the
   difficulty is front-loaded into working it out and none of it survives into
   the hundredth attempt. That is the whole complaint, and it is correct.

   A golf meter fixes it without adding a single variable: the same angle and
   the same draw, but each set by a tap against a sweep you cannot sit on.
   Everything already built survives — wind still decides which angle you are
   aiming AT, strain still puts the best draw in the interior, the six planes
   still differ — because the physics is untouched. Only the way you enter the
   two numbers changes.

   Two things had to be checked before believing it.

   1. DO THE TWO ERRORS COMPOUND INTO A LOTTERY? They do not. At 40 ms of
      jitter, angle-only is 90% of perfect and draw-only 92%; both together are
      88%. Independent errors, each quadratic near the peak, so they add far
      less than they look like they should. For scale, today's sloppy-drag
      by-feel figure is 84-86% — so a meter at human timing is NO HARDER than
      the drag already is. It just cannot be opted out of.

   2. HOW OFTEN DO YOU NAIL IT? A personal-best game lives on the tail, not the
      mean: you keep going because a perfect run is possible and rare. That is
      what sets the meter speed, and it is the only dial needed.

   Run:  node tailwind/meter.js
*/
const M = require('./model.js');
const A0 = M.CFG.ANG_MIN, A1 = M.CFG.ANG_MAX, SPAN = A1 - A0;
const f0 = (n) => n.toFixed(0), pct = (n) => (100 * n).toFixed(0) + '%';
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function mul(s) { return function () { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

// the 90%-of-best band around each plane's optimum, in each input
function windows(name) {
  const p = M.build(name), o = M.best(p);
  const at = (a, pu) => M.fly(p, Math.max(A0, Math.min(A1, a)), Math.max(0, Math.min(1, pu))).dist;
  let al = o.angle, ah = o.angle, pl = o.pull, ph = o.pull;
  while (al > A0 && at(al - 0.25, o.pull) >= 0.90 * o.dist) al -= 0.25;
  while (ah < A1 && at(ah + 0.25, o.pull) >= 0.90 * o.dist) ah += 0.25;
  while (pl > 0 && at(o.angle, pl - 0.002) >= 0.90 * o.dist) pl -= 0.002;
  while (ph < 1 && at(o.angle, ph + 0.002) >= 0.90 * o.dist) ph += 0.002;
  return { p, o, aw: (ah - al) / SPAN, pw: ph - pl, adeg: ah - al };
}

console.log('TAILWIND — both inputs on a meter\n');
console.log('plane      best     90% ANGLE band      90% DRAW band   full sweep for a 100 ms window');
const W = {};
for (const n of Object.keys(M.PLANES)) {
  const w = windows(n); W[n] = w;
  console.log(n.padEnd(9) + f0(w.o.dist).padStart(4) + ' m   ' + w.adeg.toFixed(1).padStart(5) +
    '° (' + pct(w.aw) + ' of range)     ' + w.pw.toFixed(3) +
    '          angle ' + (100 / w.aw).toFixed(0) + ' ms / draw ' + (100 / w.pw).toFixed(0) + ' ms');
}

console.log('\nDO THE TWO ERRORS COMPOUND?  both meters at a 100 ms window');
console.log('  jitter    angle only   draw only   BOTH TIMED');
for (const ms of [20, 30, 40, 60]) {
  const row = ['a', 'p', 'both'].map((mode) => {
    const vals = Object.keys(M.PLANES).map((n) => {
      const w = W[n], rnd = mul(999), got = [];
      for (let s = 0; s < 250; s++) {
        const da = mode === 'p' ? 0 : gauss(rnd) * (ms / 100) * w.aw * SPAN;
        const dp = mode === 'a' ? 0 : gauss(rnd) * (ms / 100) * w.pw;
        got.push(M.fly(w.p, Math.max(A0, Math.min(A1, w.o.angle + da)),
                       Math.max(0, Math.min(1, w.o.pull + dp))).dist);
      }
      return mean(got) / w.o.dist;
    });
    return pct(mean(vals));
  });
  console.log('  ' + String(ms).padStart(3) + ' ms       ' + row[0].padStart(5) + '       ' + row[1].padStart(5) + '       ' + row[2].padStart(5));
}

console.log('\nTHE ONE-MORE-GO NUMBER — how often do you nail it?  Lacerta, 40 ms jitter');
console.log('  window   mean   >=95% of perfect   >=99%   best of 20 goes');
const w = W.Lacerta;
for (const win of [60, 80, 100, 140, 200]) {
  const rnd = mul(31337), got = [];
  for (let s = 0; s < 3000; s++) {
    const da = gauss(rnd) * (40 / win) * w.aw * SPAN, dp = gauss(rnd) * (40 / win) * w.pw;
    got.push(M.fly(w.p, Math.max(A0, Math.min(A1, w.o.angle + da)),
                   Math.max(0, Math.min(1, w.o.pull + dp))).dist / w.o.dist);
  }
  const b20 = []; for (let i = 0; i + 20 <= got.length; i += 20) b20.push(Math.max(...got.slice(i, i + 20)));
  console.log('  ' + String(win).padStart(4) + ' ms  ' + pct(mean(got)).padStart(5) + '        ' +
    pct(got.filter((v) => v >= 0.95).length / got.length).padStart(4) + '          ' +
    pct(got.filter((v) => v >= 0.99).length / got.length).padStart(4) + '      ' + pct(mean(b20)));
}

console.log(`
READ IT LIKE THIS
  100-140 ms is the band. At 100 ms one go in five clears 95% of perfect and
  one in a hundred clears 99% — most attempts are decent, a fifth feel good,
  and a true perfect run stays rare enough to keep chasing. At 60 ms only 9%
  feel good, which reads as punishing. At 200 ms 39% do, and there is nothing
  left to chase.

  In sweep terms that is roughly 0.6-0.95 s for the angle meter across the
  full range, and 1.7-2.1 s for the draw. The draw is the slower one because
  its 90% band is only about 5% of the range: it is the tighter skill, which
  is right, because it is the one strain punishes on both sides.`);
