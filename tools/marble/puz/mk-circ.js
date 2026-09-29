// Writes ../circus-src/cq14-ladders.js from the circus puzzles' ladders (lad-<kind>.json): the layouts, their try-outs
// (#try-<kind>: an easy, a middling and a hard one; #try-l<id>0..2: the whole ladder in thirds; #try-cpuzzles: one of
// each) and the notes for each square.
const fs = require('fs'), path = require('path');
const KINDS = [
  // kind, id prefix, legend, try-out title, the try-out's line, the square's note
  ['clowncar', 'CK', 'CZ_CAR_L', 'THE CLOWN CAR', 'Push the clowns into the little car. They get in only through its back door',
   'Push every clown into the car. They get in only through its back door, where the white arrows point in'],
  ['pyramid', 'CP', 'CZ_PYR_L', 'THE ACROBAT PYRAMID', 'Push the acrobats onto the gold stars, and they climb into a pyramid',
   'Push an acrobat onto every gold star. The pad by the road puts them back'],
  ['scales', 'CS', 'CZ_SCL_L', 'THE BALANCE SCALES', 'Push weights onto the two pans until the scale hangs level',
   'Level the scale: the same kilos on each pan. The boards over the pans add them up'],
  ['shells', 'CH', 'CZ_SHL_L', 'THE SHELL GAME', 'Watch the cup with the gold star as the magician shuffles, then roll onto its pad',
   'Keep your eye on the cup with the star. When the pads light, roll onto the pad in front of it. The wrong cup sends you back'],
  ['knives', 'CN', 'CZ_KNF_L', 'THE KNIFE THROWER', 'Watch where the knives land. Then cross on the boards he did not hit',
   'Remember the boards he hits. Cross on the others: a knife sends you back, and he throws again'],
  ['tickets', 'CT', 'CZ_TKT_L', 'TICKET TURNSTILES', 'Pick up tickets and pay the turnstiles. There are never enough for all of them',
   'Each turnstile takes the tickets on its sign, once. There are not enough for all of them: choose. The pad by the road puts it back'],
  ['mirrors', 'CM', 'CZ_MIR_L', 'THE HOUSE OF MIRRORS', 'Find the way out of the house of mirrors. You see only round the marble, and some doorways are glass',
   'Find the way out. You see only round the marble; glass cracks when you bump it, so you know it next time'],
];
const TRY_KEY = { knives: 'knifethrower', mirrors: 'mirrormaze' };
let out = `
/* THE CIRCUS PUZZLES' LADDERS: 22 layouts of each, easy to hard, each found by a search (tools/marble/puz/gencirc*.js)
   and played through by the pilot. Written by tools/marble/puz/mk-circ.js: change the ladders there. */
Object.assign(PLAZAS, {
`;
const tries = {}, titles = {}, news = {}, notes = {}, one = [];
for (const [kind, id, legend, title, line, note] of KINDS) {
  const f = path.join(__dirname, 'lad-' + kind + '.json'); if (!fs.existsSync(f)) continue;
  const L = JSON.parse(fs.readFileSync(f, 'utf8')).slice(0, 22);
  L.forEach((o, i) => {
    const sp = { kind, ...(o.sp || {}) };
    out += `  ${id}${i + 1}: { entry: 2, exit: ${o.exit}, legend: ${legend}, sp: ${JSON.stringify(sp).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'").replace(/,/g, ', ')}, map: [\n` + o.map.map((l) => `    '${l}',`).join('\n') + `] },\n`;
    notes[id + (i + 1)] = note;
  });
  const n = L.length, pick = [0, Math.round(n * 0.45), n - 1], tk = TRY_KEY[kind] || kind;   // (a try-out's name must not be an obstacle's)
  tries[tk] = pick.map((k) => id + (k + 1)); titles[tk] = title; news[tk] = line + '. Three squares, easy to hard';
  for (let b = 0; b < 3; b++) {
    const lo = Math.round(b * n / 3), hi = Math.round((b + 1) * n / 3), k = 'l' + id.toLowerCase() + b;
    tries[k] = Array.from({ length: hi - lo }, (_, i) => id + (lo + i + 1)); titles[k] = title + ' ' + (lo + 1) + '-' + hi;
  }
  one.push(id + (pick[1] + 1));
}
out += `});\n`;
tries.cpuzzles = one; titles.cpuzzles = 'CIRCUS PUZZLES'; news.cpuzzles = 'The circus puzzles, one after another';
out += `Object.assign(TRY_COURSES, ${JSON.stringify(tries)});\nCZ_TRY.push(...${JSON.stringify(Object.keys(tries))});\n`;
out += `Object.assign(TRY_TITLES, ${JSON.stringify(titles)});\nObject.assign(TRY_NEWS, ${JSON.stringify(news)});\nObject.assign(PLAZA_NEWS, ${JSON.stringify(notes)});\n`;
// The schedule for 151-200: the seven kinds in turn, three to a level (two on the road, one in the square at the
// finish), each kind a step harder every time it comes.
const cycle = ['CK', 'CH', 'CT', 'CP', 'CN', 'CM', 'CS'], seen = Object.fromEntries(cycle.map((k) => [k, 0])), road = {}, sq = {};
for (let i = 0; i < 50; i++) {
  const ids = [0, 1, 2].map((k) => { const K = cycle[(3 * i + k) % 7]; return K + (++seen[K]); });
  road[151 + i] = ids.slice(0, 2); sq[151 + i] = ids[2];
}
out += `const CZ_ROAD_AT = ${JSON.stringify(road)};\nconst CZ_PLAZA_AT = ${JSON.stringify(sq)};\n`;
fs.writeFileSync(path.join(__dirname, '../circus-src/cq14-ladders.js'), out);
console.log('written', out.length, 'chars;', Object.keys(tries).join(' '));
