// Writes ../pb13-ladders.js from the five ladders (lad-*.json): the layouts, their test courses and notes, and the
// schedule of three puzzles a level for 101-150.
const fs = require('fs'), J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const L = { N: J('lad-stars.json'), U: J('lad-fuel.json'), V: J('lad-holes.json'), O: J('lad-orbit.json'), A: J('lad-air.json') };
const legend = { N: 'SP_STAR_L', U: 'SP_FUEL_L', V: 'SP_HOLE_L', O: 'SP_ORBIT_L', A: 'SP_AIR_L' };
const kind = { N: 'stars', U: 'fuel', V: 'wormholes', O: 'orbit', A: 'airlock' };
let out = `
/* THE MACHINE'S LADDERS (owner, 2026-09-29: levels 101-150 are the pinball machine's, "fresh start, gentler", three
   space puzzles a level as 41-100 have three puzzles). Thirty layouts of each puzzle, easy to hard, each found by a
   search in the scratchpad's puz/ (gen*.js) and played through by the pilot: SN constellations (4 to 9 stars, 2 to 6 to
   roll over, one answer each), SU refuel (the best three cells against the nearest-first and the looks-nearest three),
   SV wormholes (1 to 5 scoops, 1 to 3 colours, no state you cannot get out of), SO satellites (1 to 3, 2 to 10 pushes),
   SA airlock (3 to 6 keys, codes of 3 to 8). Written by puz/mk-pb13.js: change the ladders there. */
Object.assign(PLAZAS, {
`;
for (const [K, list] of Object.entries(L)) list.slice(0, 30).forEach((o, i) => {
  const sp = K === 'N' ? `{ kind: 'stars', lines: '${o.lines}' }` : K === 'U' ? `{ kind: 'fuel', leak: ${o.leak}, line: 0.8, gap: 7, recharge: 8 }` : `{ kind: '${kind[K]}' }`;
  const entry = 2, exit = K === 'N' ? o.exit : 2;
  out += `  S${K}${i + 1}: { entry: ${entry}, exit: ${exit}, legend: ${legend[K]},${K === 'A' ? ` tune: '${o.tune}',` : ''} sp: ${sp}, map: [\n` + o.map.map((l) => `    '${l}',`).join('\n') + `] },\n`;
});
out += `});\n`;
// Test courses: ten of a ladder at a time (#try-ln0 is constellations 1-10, #try-lu2 refuel 21-30 ...).
const tries = {};
for (const K of Object.keys(L)) for (let b = 0; b < 3; b++) tries['l' + K.toLowerCase() + b] = Array.from({ length: 10 }, (_, i) => 'S' + K + (b * 10 + i + 1));
out += `Object.assign(TRY_COURSES, ${JSON.stringify(tries)});\nSP_TRY.push(...${JSON.stringify(Object.keys(tries))});\n`;
out += `Object.assign(TRY_TITLES, ${JSON.stringify(Object.fromEntries(Object.keys(tries).map((k) => [k, { n: 'STARS', u: 'REFUEL', v: 'WORMHOLES', o: 'SATELLITES', a: 'AIRLOCK' }[k[1]] + ' ' + (+k[2] * 10 + 1) + '-' + (+k[2] * 10 + 10)])))});\n`;
// The schedule: the five kinds in turn, three to a level, each kind a step harder every time it comes.
const cycle = ['N', 'U', 'V', 'O', 'A'], seen = { N: 0, U: 0, V: 0, O: 0, A: 0 }, road = {}, sq = {};
for (let i = 0; i < 50; i++) {
  const ids = [0, 1, 2].map((k) => { const K = cycle[(3 * i + k) % 5]; return 'S' + K + (++seen[K]); });
  road[101 + i] = ids.slice(0, 2); sq[101 + i] = ids[2];
}
out += `const SP_ROAD_AT = ${JSON.stringify(road)};\nconst SP_PLAZA_AT = ${JSON.stringify(sq)};\n`;
fs.writeFileSync('../pb13-ladders.js', out);
console.log('written', out.length, 'chars; level 101', road[101], sq[101], '; 150', road[150], sq[150]);
