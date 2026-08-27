/* ============================================================
   RELIC · colour measurement
   ------------------------------------------------------------
   The whole rule of this game is reading a colour sequence, so
   the palette is not a taste question and is not eyeballed.

   NULL TEST FIRST. Two typo'd matrix coefficients once produced
   alarming, specific and completely wrong accessibility findings
   in this repo. Nothing below is believed until the transform
   returns white for white, grey for grey and black for black,
   and until the luminance function returns the three values
   everybody already knows.
   Run: node relic/tune-colour.mjs
   ============================================================ */

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v)))
  .toString(16).padStart(2, '0')).join('').toUpperCase();
const lin = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const relL = h => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [relL(a), relL(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/* Viénot, Brettel and Mollon 1999, the LMS-plane projection. */
const RGB2LMS = [[17.8824, 43.5161, 4.11935],
                 [3.45565, 27.1554, 3.86714],
                 [0.0299566, 0.184309, 1.46709]];
const LMS2RGB = [[0.080944, -0.130504, 0.116721],
                 [-0.0102485, 0.0540194, -0.113615],
                 [-0.000365294, -0.00412163, 0.693513]];
const DEUTAN = [[1, 0, 0], [0.494207, 0, 1.24827], [0, 0, 1]];
const PROTAN = [[0, 2.02344, -2.52581], [0, 1, 0], [0, 0, 1]];
const mul = (M, v) => M.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);

function simulate(h, M) {
  const rgb = hex(h).map(v => Math.pow(v / 255, 2.2) * 255);
  const out = mul(LMS2RGB, mul(M, mul(RGB2LMS, rgb)));
  return toHex(out.map(v => Math.pow(Math.max(0, v) / 255, 1 / 2.2) * 255));
}

// ---------- NULL TEST ----------
let nullOk = true;
const nulls = [];
/* A NEUTRAL is R = G = B. #4C5A70 was in this list on the first run and failed
   by 13; it is a blue-grey, not a neutral, and a deuteranope shifts it for
   real. The check was wrong, not the transform. */
for (const [name, h] of [['white', '#FFFFFF'], ['grey', '#808080'],
                         ['dark grey', '#333333'], ['black', '#000000']]) {
  const d = simulate(h, DEUTAN), p = simulate(h, PROTAN);
  const dOff = Math.max(...hex(d).map((v, i) => Math.abs(v - hex(h)[i])));
  const pOff = Math.max(...hex(p).map((v, i) => Math.abs(v - hex(h)[i])));
  const ok = dOff <= 3 && pOff <= 3;          // a neutral must survive untouched
  nullOk = nullOk && ok;
  nulls.push({ name, in: h, deutan: d, protan: p, maxOff: Math.max(dOff, pOff), ok });
}
/* POSITIVE CONTROL. A transform that did nothing at all would sail through the
   null test, exactly as a mute check that only ever reports 0 reads the same
   whether the mute works or the shot never touched a piece. A pure red MUST
   move a long way under deuteranopia, or the matrices are not being applied. */
for (const [name, h, floor] of [['red (must MOVE)', '#FF0000', 40],
                                ['green (must MOVE)', '#00FF00', 40]]) {
  const d = simulate(h, DEUTAN), p = simulate(h, PROTAN);
  const dOff = Math.max(...hex(d).map((v, i) => Math.abs(v - hex(h)[i])));
  const pOff = Math.max(...hex(p).map((v, i) => Math.abs(v - hex(h)[i])));
  const ok = dOff >= floor && pOff >= floor;
  nullOk = nullOk && ok;
  nulls.push({ name, in: h, deutan: d, protan: p, maxOff: Math.max(dOff, pOff), ok });
}
const lumNull = [['white', '#FFFFFF', 1], ['black', '#000000', 0], ['mid grey', '#777777', 0.1845]]
  .map(([n, h, want]) => ({ n, got: +relL(h).toFixed(4), want, ok: Math.abs(relL(h) - want) < 0.004 }));
const lumOk = lumNull.every(r => r.ok);

console.log('NULL TEST — a neutral must come back unchanged, and luminance must be known values');
console.table(nulls);
console.table(lumNull);
console.log(nullOk && lumOk ? 'NULL TEST PASSES. Numbers below may be trusted.\n'
                            : 'NULL TEST FAILS. Everything below is meaningless.\n');
if (!(nullOk && lumOk)) process.exit(1);

// ---------- THE PALETTE UNDER TEST ----------
const INK = process.env.INK || '#2B2438';
const SLOT = process.env.SLOT || '#05070D';
const P = (process.env.PAL || [
  'chalk:#D8EEF3', 'sun:#F5C63C', 'green:#3DAE7C',
  'violet:#9B7FE8', 'rust:#D9573F', 'ocean:#2E7FB8',
].join(',')).split(',').map(s => { const [id, h] = s.split(':'); return { id, hex: h }; });

console.log('LIGHTNESS LADDER (the second channel a deuteranope reads)');
console.table(P.map(c => ({ id: c.id, hex: c.hex, relL: +relL(c.hex).toFixed(3),
  vsInk: +ratio(c.hex, INK).toFixed(2), clears3: ratio(c.hex, INK) >= 3 })).sort((a, b) => b.relL - a.relL));

/* A pair is READABLE when normal sight OR either dichromat can tell them
   apart. "Tell apart" here is a perceptual distance in sRGB-ish space plus a
   lightness ratio; the point is to find the pair that is closest under
   simulation, not to score the whole set. */
function dist(a, b) {
  const [x, y] = [hex(a), hex(b)];
  const rm = (x[0] + y[0]) / 2;
  return Math.sqrt((2 + rm / 256) * (x[0] - y[0]) ** 2 + 4 * (x[1] - y[1]) ** 2 +
                   (2 + (255 - rm) / 256) * (x[2] - y[2]) ** 2);
}
const rows = [];
for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
  const a = P[i], b = P[j];
  rows.push({
    pair: a.id + ' / ' + b.id,
    normal: Math.round(dist(a.hex, b.hex)),
    deutan: Math.round(dist(simulate(a.hex, DEUTAN), simulate(b.hex, DEUTAN))),
    protan: Math.round(dist(simulate(a.hex, PROTAN), simulate(b.hex, PROTAN))),
    lightRatio: +ratio(a.hex, b.hex).toFixed(2),
  });
}
rows.sort((a, b) => Math.min(a.deutan, a.protan) - Math.min(b.deutan, b.protan));
console.log('\nCLOSEST PAIRS UNDER SIMULATION — worst first. The worst pair is the palette.');
console.table(rows.slice(0, 8));
const worst = rows[0];
console.log('\nworst pair under either dichromacy:', worst.pair,
  '| distance', Math.min(worst.deutan, worst.protan),
  '| lightness ratio', worst.lightRatio);
console.log('slot vs ink (a gap must not read as a dark band):',
  ratio(SLOT, INK).toFixed(2) + ':1  — this is deliberately LOW; the gap is told',
  'apart by depth, not by flat contrast. See play.js drawHoles.');
