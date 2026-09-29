/* LEVELS 151-200: THE CIRCUS (owner, 2026-09-29: levels 151-200, "fresh start, gentler", climbing to 200; three circus
   puzzles a level, as the pinball machine has three; the obstacles are the circus's own). Five districts of ten, each
   bringing its acts in at their easiest, the way the machine's districts did:
     151-160  The Big Top      rings of fire, the juggler, the knife wheel
     161-170  High Above       the trapeze, the high wire, the human cannon
     171-180  Sideshow Alley   the ball thrower, the house of mirrors, the clown car chase
     181-190  The Midway       the Ferris wheel, the teeterboard, the Wheel of Death
     191-200  Grand Finale     the roller coaster, and all of it
   makeLevel(n) makes a level from 151 on as the city makes level czEff(n) (20 at 151, 96 at 200), on the level's own seed,
   with these districts' acts (circLay, each from the easiest of its try-out ladder at the level that brings it in to
   the hardest at 200: czSpec) and the puzzles of CZ_ROAD_AT and CZ_PLAZA_AT. The rail keeps the city's pieces, dressed
   as the circus's (juggling pins, hurdles, trunks, clown cars, magic glass, springboards, carousels ...). */
const CZ_DISTRICTS = ['The Big Top', 'High Above', 'Sideshow Alley', 'The Midway', 'Grand Finale'];
const czEff = (n) => Math.round(20 + 76 * (n - 151) / 49);
const CZ_OBS = { fring: 151, juggle: 154, kwheel: 157, trapeze: 161, wire: 164, cannon: 167, thrower: 171, mirror: 174, chase: 177, ferris: 181, teeter: 184, wod: 187, coaster: 191 };
const CZ_OWN = [
  ['fring', 'juggle', 'kwheel', 'jog', 'ramp', 'narrow', 'bollards', 'fring', 'juggle'],
  ['trapeze', 'wire', 'cannon', 'bridge', 'jump', 'slide', 'trapeze', 'kwheel'],
  ['thrower', 'mirror', 'chase', 'crates', 'barriers', 'cross', 'thrower', 'wire'],
  ['ferris', 'teeter', 'wod', 'round', 'wormhole', 'tube', 'ferris', 'cannon'],
  ['coaster', 'fring', 'kwheel', 'cannon', 'thrower', 'chase', 'wod', 'ferris', 'teeter', 'mirror', 'loop', 'switch'],
];
const CZ_BASE = ['jog', 'ramp', 'narrow', 'bridge', 'slide', 'boostJump', 'jump', 'cross', 'fork'];
function czDistrict(n) { return Math.min(4, Math.floor((n - 151) / 10)); }
// The pool a feature is drawn from: the district's own on even turns, everything brought in so far on odd ones.
function czPool(n, f) {
  const d = czDistrict(n);
  if (!(f % 2)) return CZ_OWN[d].filter((k) => !(k in CZ_OBS) || n >= CZ_OBS[k]);
  const all = [...CZ_BASE]; for (let i = 0; i <= d; i++) all.push(...CZ_OWN[i]);
  return all.filter((k) => !(k in CZ_OBS) || n >= CZ_OBS[k]);
}
// What a level opens with: the newest act for the three levels after it comes in, else one of the district's.
function czOpener(n) {
  let best = null; for (const [k, at] of Object.entries(CZ_OBS)) if (n >= at && n < at + 3 && (!best || at > CZ_OBS[best])) best = k;
  if (best) return best;
  const own = CZ_OWN[czDistrict(n)].filter((k) => k in CZ_OBS && n >= CZ_OBS[k]);
  return own[n % own.length];
}
// An act's settings at level n: along its try-out ladder (easy, middling, hard: all three played through), from the
// easiest at the level that brings it in to the hardest at 200. A second ring or wheel only in the top quarter.
const CZ_TRY_OF = { fring: 'fire', juggle: 'juggler', kwheel: 'knives', cannon: 'cannon', thrower: 'thrower', trapeze: 'trapeze', wire: 'wire', teeter: 'teeter', wod: 'wod', ferris: 'ferris', chase: 'chase', mirror: 'mirrors', coaster: 'coaster' };
const CZ_WHOLE = new Set(['holes', 'n', 'rows', 'parts', 'pins']), CZ_ZERO = new Set(['slide', 'sway', 'pins']);
function czSpec(k, n, r) {
  const L = TRY_CIRCUS[CZ_TRY_OF[k]], t = clamp((n - CZ_OBS[k]) / (200 - CZ_OBS[k]), 0, 1), [a, b, u] = t < 0.5 ? [L[0], L[1], t * 2] : [L[1], L[2], t * 2 - 1];
  const out = { t: L[0].t };
  for (const key of new Set([...Object.keys(L[0]), ...Object.keys(L[1]), ...Object.keys(L[2])])) {
    if (key === 't') continue;
    if (key === 'twin') { if (t > 0.75 && L[2].twin) out.twin = L[2].twin; continue; }
    const va = key in a ? a[key] : CZ_ZERO.has(key) ? 0 : b[key], vb = key in b ? b[key] : va;
    if (typeof va !== 'number' || typeof vb !== 'number') { out[key] = u < 0.5 ? va : vb; continue; }
    const v = va + (vb - va) * u; out[key] = CZ_WHOLE.has(key) ? Math.round(v) : Math.round(v * 100) / 100;
  }
  if (out.slide === 0) { delete out.slide; delete out.period; }   // (a ring that does not slide has no period)
  if (out.pins === 0) delete out.pins;
  return out;
}
// How many acts a level may have: two at first, four by the end.
const czActMax = (n) => 2 + Math.round(2 * (n - 151) / 49);
// Lay one act inside a level, its rails and all tagged as one stretch (the level autopilot hands the stretch to its
// circus controller). Returns what circLay returns.
let czSegN = 0;
function czLayAct(k, n, r, pieces, x, y, z) {
  const n0 = pieces.length, L = circLay(czSpec(k, n, r), pieces, x, y, z), seg = ++czSegN;
  for (let i = n0; i < pieces.length; i++) pieces[i].czSeg = seg;
  return L;
}

// ---- THE NOTES AND THE RULES, in the circus's words ----
const NEWS_CIRCUS = {
  151: 'The circus! Roll through the middle of each ring of fire, never the flames. Later rings slide across the rail',
  154: 'The juggler drops his balls on the rail. Wait at a spot until its ball has just gone up, then go',
  157: 'The knife wheel turns across the rail. Go when a hole will be at the bottom as you reach it',
  161: 'The trapeze seat waits at each edge. Roll on at one end, stay still, and roll off at the other',
  164: 'The high wire sways and does not carry you. Keep to its middle',
  167: 'The human cannon! Roll in when it points at the net, and it fires you over the gap',
  171: 'A clown throws balls at you. Change pace after each throw so it lands clear',
  174: 'The house of mirrors turns you round. Through each gap, clear of the trapdoors',
  177: 'Past the yellow line a clown car chases you. Reach the far end first',
  181: 'The rail is broken: board a Ferris wheel car going down, and step off as it comes level beyond',
  184: 'Sit on the teeterboard\'s yellow spot: when the strongman lands, you are thrown up to the rail above',
  187: 'The Wheel of Death: wait on the yellow spot, and a cage scoops you up and over',
  191: 'The roller coaster! Wait at the station for a car, roll in, and hold on. The grand finale has everything',
};
const RULES_CIRCUS = new Map(Object.entries({
  'Bollards, road barriers': 'Juggling pins, striped hurdles and circus trunks are solid. Steer through the gaps: a hard knock near the edge can throw the marble off the rail.',
  'A wormhole': 'A magician\'s cabinet takes the marble through: roll into its swirl, and out you come on the far side.',
  'The sky train': 'The circus train stops at its stations. Roll onto its carriage, hold on as it pulls away, and roll off at the next station.',
}));
for (const [k, v] of RULES_CHROME) if (!RULES_CIRCUS.has(k)) RULES_CIRCUS.set(k, v.replace(/the machine/g, 'the circus').replace(/The machine/g, 'The circus'));
RULES.push(
  'From level 151 the course runs through the circus, with three circus puzzles in each level. Clown car: push the clowns in through its back door. Acrobat pyramid: push an acrobat onto every gold star. Balance scales: push weights onto the pans until both sides weigh the same.',
  'Shell game: follow the cup with the star and roll onto its pad; the wrong cup sends you back. Knife thrower: remember the boards he hits and cross on the others. Ticket turnstiles: pay the right turnstiles, there are never enough tickets for all. House of mirrors: find the way out; you see only round the marble, and some doorways are glass.',
  'The circus acts: go through rings of fire at their middle; pass the juggler just after a spot\'s ball has gone up; reach the knife wheel as a hole comes to the bottom; ride the trapeze and the Ferris wheel from edge to edge; keep to the high wire\'s middle; wait on the yellow spots of the teeterboard and the Wheel of Death; roll into the cannon as it points at the net; outrun the clown car.',
);
for (const K of ['CK', 'CP', 'CS', 'CH', 'CN', 'CT', 'CM']) for (let i = 1; i <= 22; i++) if (PLAZAS[K + i] && !PLAZA_NEWS[K + i]) PLAZA_NEWS[K + i] = PLAZA_NEWS[K + '1'];
