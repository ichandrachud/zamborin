/* ============================================================
   Lessons in Chemistry · chapter 2, reactions: the rules

   Headless, like model.js: no canvas, no motion. play.js moves the molecules
   and asks this file what the test tube does.

   From the owner, 2026-09-14: the dish holds whole molecules (sulphuric acid,
   hydrochloric acid, calcium hydroxide, water...). Put two in the test tube;
   the right pair gives the molecule you need. Only the tube reacts. Amounts
   matter, one step at a time: one hydrochloric acid turns calcium hydroxide
   into a basic salt, a second finishes it as calcium chloride. What a
   reaction makes lands on a tray: the molecule you need goes to the beaker,
   a byproduct a later step needs goes back to the dish, and whatever is left
   on the tray is poured away at the next reaction.

   Every reaction here is a real one, written as its equation. tests.mjs
   checks that any two molecules a level can put side by side which would
   react in real life (an acid and a base, an ammonium salt and a strong
   base, lime and water) have their reaction in the table, so the tube never
   says "no reaction" to a pair that would.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChemLab = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ---------- MOLECULES ----------
   Each is drawn, not built: atoms at 2D positions in bond lengths (y down),
   then bonds by atom index, '-' single, '=' double. Ionic pairs sit side by
   side with no stick between them. `tags` say what it can do, for the
   honesty check. */
function sp(key, name, formula, atoms, bonds, tags) {
  const at = atoms.map(([el, x, y]) => ({ el, x, y }));
  const bs = bonds ? bonds.split(' ').map((b) => {
    const m = b.match(/^(\d+)([-=#])(\d+)$/);
    return { a: +m[1], b: +m[3], order: m[2] === '-' ? 1 : m[2] === '=' ? 2 : 3 };
  }) : [];
  const cx = at.reduce((n, a) => n + a.x, 0) / at.length, cy = at.reduce((n, a) => n + a.y, 0) / at.length;
  at.forEach((a) => { a.x -= cx; a.y -= cy; });
  const extent = Math.max(...at.map((a) => Math.hypot(a.x, a.y)));
  return { key, name, formula, atoms: at, bonds: bs, extent, tags: tags || [] };
}
const SPECIES = {};
[
  sp('water', 'water', 'H₂O', [['O', 0, -0.2], ['H', -0.8, 0.4], ['H', 0.8, 0.4]], '0-1 0-2', ['water']),
  sp('hydrochloric-acid', 'hydrochloric acid', 'HCl', [['H', -0.5, 0], ['Cl', 0.5, 0]], '0-1', ['acid', 'strong-acid', 'hydrogen-halide', 'chloride']),
  sp('nitric-acid', 'nitric acid', 'HNO₃', [['N', 0, 0], ['O', 0, -1], ['O', 0.87, 0.5], ['O', -0.87, 0.5], ['H', -1.6, 0.1]], '0=1 0-2 0-3 3-4', ['acid', 'strong-acid']),
  sp('sulphuric-acid', 'sulphuric acid', 'H₂SO₄',
     [['S', 0, 0], ['O', 0, -1], ['O', 0, 1], ['O', -1, 0], ['O', 1, 0], ['H', -1.7, -0.55], ['H', 1.7, 0.55]], '0=1 0=2 0-3 0-4 3-5 4-6', ['acid', 'strong-acid']),
  sp('sodium-hydroxide', 'sodium hydroxide', 'NaOH', [['Na', -1, 0], ['O', 0, 0], ['H', 0.8, 0.6]], '0-1 1-2', ['base', 'strong-base']),
  sp('sodium-chloride', 'sodium chloride', 'NaCl', [['Na', -0.5, 0], ['Cl', 0.5, 0]], '0-1', ['salt', 'chloride']),
  sp('sodium-nitrate', 'sodium nitrate', 'NaNO₃', [['N', 0, 0], ['O', 0, -1], ['O', 0.87, 0.5], ['O', -0.87, 0.5], ['Na', -1.74, 1]], '0=1 0-2 0-3 3-4', ['salt']),
  sp('sodium-hydrogen-sulphate', 'sodium hydrogen sulphate', 'NaHSO₄',
     [['S', 0, 0], ['O', 0, -1], ['O', 0, 1], ['O', -1, 0], ['O', 1, 0], ['Na', -2, 0], ['H', 1.7, 0.55]], '0=1 0=2 0-3 0-4 3-5 4-6', ['acid', 'salt']),
  sp('sodium-sulphate', 'sodium sulphate', 'Na₂SO₄',
     [['S', 0, 0], ['O', 0, -1], ['O', 0, 1], ['O', -1, 0], ['O', 1, 0], ['Na', -2, 0], ['Na', 2, 0]], '0=1 0=2 0-3 0-4 3-5 4-6', ['salt']),
  sp('calcium-hydroxide', 'calcium hydroxide', 'Ca(OH)₂',
     [['H', -1.7, -0.55], ['O', -1, 0], ['Ca', 0, 0], ['O', 1, 0], ['H', 1.7, 0.55]], '0-1 1-2 2-3 3-4', ['base', 'strong-base']),
  sp('calcium-hydroxychloride', 'calcium hydroxychloride', 'Ca(OH)Cl',
     [['H', -1.7, -0.55], ['O', -1, 0], ['Ca', 0, 0], ['Cl', 1, 0]], '0-1 1-2 2-3', ['base', 'basic-salt', 'chloride']),
  sp('calcium-chloride', 'calcium chloride', 'CaCl₂', [['Cl', -1, 0], ['Ca', 0, 0], ['Cl', 1, 0]], '1-0 1-2', ['salt', 'chloride']),
  sp('calcium-sulphate', 'calcium sulphate', 'CaSO₄',
     [['S', 0, 0], ['O', 0, -1], ['O', 1, 0], ['O', 0, 1], ['O', -1, 0], ['Ca', -1, 1]], '0=1 0=2 0-3 0-4 3-5 4-5', ['salt']),
  sp('calcium-hydroxynitrate', 'calcium hydroxynitrate', 'Ca(OH)NO₃',
     [['H', -1.7, -0.55], ['O', -1, 0], ['Ca', 0, 0], ['O', 1, 0], ['N', 2, 0], ['O', 2, -1], ['O', 2.87, 0.5]], '0-1 1-2 2-3 3-4 4=5 4-6', ['base', 'basic-salt']),
  sp('calcium-nitrate', 'calcium nitrate', 'Ca(NO₃)₂',
     [['O', -2.87, 0.5], ['O', -2, -1], ['N', -2, 0], ['O', -1, 0], ['Ca', 0, 0], ['O', 1, 0], ['N', 2, 0], ['O', 2, -1], ['O', 2.87, 0.5]],
     '2-0 2=1 2-3 3-4 4-5 5-6 6=7 6-8', ['salt']),
  sp('calcium-chloride-nitrate', 'calcium chloride nitrate', 'CaCl(NO₃)',
     [['Cl', -1, 0], ['Ca', 0, 0], ['O', 1, 0], ['N', 2, 0], ['O', 2, -1], ['O', 2.87, 0.5]], '1-0 1-2 2-3 3=4 3-5', ['salt', 'chloride']),
  sp('calcium-oxide', 'calcium oxide', 'CaO', [['Ca', -0.5, 0], ['O', 0.5, 0]], '0=1', ['base', 'oxide']),
  sp('ammonia', 'ammonia', 'NH₃', [['N', 0, 0], ['H', 0, -1], ['H', 0.87, 0.5], ['H', -0.87, 0.5]], '0-1 0-2 0-3', ['base', 'ammonia']),
  sp('ammonium-chloride', 'ammonium chloride', 'NH₄Cl',
     [['N', 0, 0], ['H', 0, -1], ['H', 1, 0], ['H', 0, 1], ['H', -1, 0], ['Cl', 2.2, 0]], '0-1 0-2 0-3 0-4', ['ammonium', 'salt', 'chloride']),
  sp('ammonium-nitrate', 'ammonium nitrate', 'NH₄NO₃',
     [['N', 0, 0], ['H', 0, -1], ['H', 1, 0], ['H', 0, 1], ['H', -1, 0], ['N', 3, 0], ['O', 3, -1], ['O', 3.87, 0.5], ['O', 2.13, 0.5]],
     '0-1 0-2 0-3 0-4 5=6 5-7 5-8', ['ammonium', 'salt']),
  /* ---------- chapter 3: organic ----------
     Hydrogens sit 0.72 of a bond from their carbon or oxygen, as a C-H bond
     is shorter than a C-C one. Formulas are written the way a school book
     writes them, so the group that reacts shows: C₂H₅OH, CH₃COOH. */
  sp('ethene', 'ethene', 'C₂H₄',
     [['C', -0.5, 0], ['C', 0.5, 0], ['H', -0.95, -0.62], ['H', -0.95, 0.62], ['H', 0.95, -0.62], ['H', 0.95, 0.62]], '0=1 0-2 0-3 1-4 1-5', ['alkene']),
  sp('ethane', 'ethane', 'C₂H₆',
     [['C', -0.5, 0], ['C', 0.5, 0], ['H', -1.2, 0], ['H', -0.72, -0.68], ['H', -0.72, 0.68], ['H', 1.2, 0], ['H', 0.72, -0.68], ['H', 0.72, 0.68]],
     '0-1 0-2 0-3 0-4 1-5 1-6 1-7', ['alkane']),
  sp('hydrogen', 'hydrogen', 'H₂', [['H', -0.36, 0], ['H', 0.36, 0]], '0-1', ['hydrogen']),
  sp('bromine', 'bromine', 'Br₂', [['Br', -0.55, 0], ['Br', 0.55, 0]], '0-1', ['halogen']),
  sp('oxygen', 'oxygen', 'O₂', [['O', -0.5, 0], ['O', 0.5, 0]], '0=1', ['oxygen']),
  sp('carbon-dioxide', 'carbon dioxide', 'CO₂', [['O', -1, 0], ['C', 0, 0], ['O', 1, 0]], '1=0 1=2', []),
  sp('dibromoethane', 'dibromoethane', 'C₂H₄Br₂',
     [['C', -0.5, 0], ['C', 0.5, 0], ['Br', -1.0, -0.87], ['H', -1.12, 0.3], ['H', -0.45, 0.72], ['Br', 1.0, 0.87], ['H', 1.12, -0.3], ['H', 0.45, -0.72]],
     '0-1 0-2 0-3 0-4 1-5 1-6 1-7', ['dihaloalkane']),
  sp('ethanol', 'ethanol', 'C₂H₅OH',
     [['C', -1, 0.25], ['C', 0, -0.25], ['O', 1, 0.25], ['H', 1.64, -0.07], ['H', -0.68, 0.89], ['H', -1.64, 0.57], ['H', -1.32, -0.39], ['H', -0.51, -0.76], ['H', 0.51, -0.76]],
     '0-1 1-2 2-3 0-4 0-5 0-6 1-7 1-8', ['alcohol']),
  sp('ethanoic-acid', 'ethanoic acid', 'CH₃COOH',
     [['C', -0.9, 0.25], ['C', 0.1, -0.2], ['O', 0.1, -1.2], ['O', 1.05, 0.2], ['H', 1.67, -0.16], ['H', -0.6, 0.91], ['H', -1.56, 0.55], ['H', -1.2, -0.41]],
     '0-1 1=2 1-3 3-4 0-5 0-6 0-7', ['acid', 'carboxylic-acid']),
  sp('ethyl-ethanoate', 'ethyl ethanoate', 'CH₃COOC₂H₅',
     [['C', -1.9, 0.3], ['C', -0.9, -0.1], ['O', -0.9, -1.1], ['O', 0.05, 0.3], ['C', 1.0, -0.1], ['C', 2.0, 0.3],
      ['H', -1.63, 0.97], ['H', -2.57, 0.57], ['H', -2.17, -0.37], ['H', 0.49, -0.6], ['H', 1.5, -0.61], ['H', 2.27, -0.37], ['H', 2.67, 0.57], ['H', 1.73, 0.97]],
     '0-1 1=2 1-3 3-4 4-5 0-6 0-7 0-8 4-9 4-10 5-11 5-12 5-13', ['ester']),
  sp('chloroethane', 'chloroethane', 'C₂H₅Cl',
     [['C', -0.5, 0.25], ['C', 0.5, -0.25], ['Cl', 1.35, 0.3], ['H', -0.18, 0.89], ['H', -1.14, 0.57], ['H', -0.82, -0.39], ['H', 0.02, -0.79], ['H', 1.04, -0.73]],
     '0-1 1-2 0-3 0-4 0-5 1-6 1-7', ['haloalkane']),
  sp('sodium-ethanoate', 'sodium ethanoate', 'CH₃COONa',
     [['C', -0.9, 0.25], ['C', 0.1, -0.2], ['O', 0.1, -1.2], ['O', 1.05, 0.2], ['Na', 1.92, -0.3], ['H', -0.6, 0.91], ['H', -1.56, 0.55], ['H', -1.2, -0.41]],
     '0-1 1=2 1-3 3-4 0-5 0-6 0-7', ['salt', 'weak-acid-salt']),
].forEach((s) => { SPECIES[s.key] = s; });

/* ---------- THE IONIC WORLD ----------
   Most of the bench is ionic: a metal (or ammonium) holding what is left of
   an acid. Writing every salt out by hand would be dozens of near-identical
   drawings, so each ion is described once, here, and a compound's picture,
   name, formula and tags are worked out from the pair. The twenty molecules
   above were drawn by hand first and keep their own pictures; this only
   tells the engine what ions they are made of.

   An ion's centre atom is index 0 and coordinates are in bond lengths, y
   down. `arms` say where a partner's centre sits and which atom holds it
   (`h` for a hydrogen, which is small and sits off to one side). `bridge` is
   the second drawing for a partner that takes both charges at once, the way
   the calcium of calcium sulphate does. */
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n) => String(n).split('').map((d) => SUB[+d]).join('');
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const CATIONS = {
  H:   { charge: 1, name: 'hydrogen', formula: 'H', atoms: [['H', 0, 0]], bonds: '' },
  Na:  { charge: 1, name: 'sodium', formula: 'Na', atoms: [['Na', 0, 0]], bonds: '' },
  K:   { charge: 1, name: 'potassium', formula: 'K', atoms: [['K', 0, 0]], bonds: '' },
  NH4: { charge: 1, name: 'ammonium', formula: 'NH₄', group: true, reach: 1.2, loose: true,
         atoms: [['N', 0, 0], ['H', 0, -1], ['H', 1, 0], ['H', 0, 1], ['H', -1, 0]], bonds: '0-1 0-2 0-3 0-4' },
  Mg:  { charge: 2, name: 'magnesium', formula: 'Mg', atoms: [['Mg', 0, 0]], bonds: '' },
  Ca:  { charge: 2, name: 'calcium', formula: 'Ca', atoms: [['Ca', 0, 0]], bonds: '' },
  Zn:  { charge: 2, name: 'zinc', formula: 'Zn', atoms: [['Zn', 0, 0]], bonds: '' },
  Cu:  { charge: 2, name: 'copper', formula: 'Cu', atoms: [['Cu', 0, 0]], bonds: '' },
};
const ANIONS = {
  Cl:   { charge: 1, name: 'chloride', acid: 'hydrochloric acid', formula: 'Cl',
          atoms: [['Cl', 0, 0]], bonds: '', arms: [{ a: 0, p: [-1, 0] }] },
  Br:   { charge: 1, name: 'bromide', acid: 'hydrobromic acid', formula: 'Br',
          atoms: [['Br', 0, 0]], bonds: '', arms: [{ a: 0, p: [-1, 0] }] },
  OH:   { charge: 1, name: 'hydroxide', formula: 'OH', group: true,
          atoms: [['O', 0, 0], ['H', 0.7, 0.55]], bonds: '0-1', arms: [{ a: 0, p: [-1, 0], h: [-0.7, -0.55] }] },
  O:    { charge: 2, name: 'oxide', formula: 'O', atoms: [['O', 0, 0]], bonds: '',
          arms: [{ a: 0, p: [-1, 0] }, { a: 0, p: [1, 0] }], bridge: { p: [-1, 0], a: [0, 0] } },
  NO3:  { charge: 1, name: 'nitrate', acid: 'nitric acid', formula: 'NO₃', group: true,
          atoms: [['N', 0, 0], ['O', -1, 0], ['O', 0.5, -0.87], ['O', 0.5, 0.87]], bonds: '0-1 0=2 0-3',
          arms: [{ a: 1, p: [-2, 0], h: [-1.7, -0.55] }] },
  SO4:  { charge: 2, name: 'sulphate', acid: 'sulphuric acid', formula: 'SO₄', group: true,
          atoms: [['S', 0, 0], ['O', -1, 0], ['O', 1, 0], ['O', 0, -1], ['O', 0, 1]], bonds: '0-1 0-2 0=3 0=4',
          arms: [{ a: 1, p: [-2, 0], h: [-1.7, -0.55] }, { a: 2, p: [2, 0], h: [1.7, 0.55] }],
          bridge: { bonds: '0-1 0=2 0=3 0-4', p: [-1, 1], a: [1, 4] } },
  HSO4: { charge: 1, name: 'hydrogen sulphate', formula: 'HSO₄', group: true,
          atoms: [['S', 0, 0], ['O', -1, 0], ['O', 1, 0], ['O', 0, -1], ['O', 0, 1], ['H', 1.7, 0.55]], bonds: '0-1 0-2 0=3 0=4 2-5',
          arms: [{ a: 1, p: [-2, 0], h: [-1.7, -0.55] }] },
  CO3:  { charge: 2, name: 'carbonate', formula: 'CO₃', group: true,
          atoms: [['C', 0, 0], ['O', -1, 0], ['O', 0.5, -0.87], ['O', 0.5, 0.87]], bonds: '0-1 0=2 0-3',
          arms: [{ a: 1, p: [-2, 0], h: [-1.7, -0.55] }, { a: 3, p: [1, 1.74] }],
          bridge: { p: [-0.65, 1.13], a: [1, 3] } },
  HCO3: { charge: 1, name: 'hydrogencarbonate', formula: 'HCO₃', group: true,
          atoms: [['C', 0, 0], ['O', -1, 0], ['O', 0.5, -0.87], ['O', 0.5, 0.87], ['H', 0.86, 1.49]], bonds: '0-1 0=2 0-3 3-4',
          arms: [{ a: 1, p: [-2, 0], h: [-1.7, -0.55] }] },
};
const ORDER = ['OH', 'O', 'Cl', 'Br', 'NO3', 'SO4', 'HSO4', 'CO3', 'HCO3'];
// Which salts will not dissolve: the ones that drop out of a clear liquid as a solid.
const INSOLUBLE = { CO3: ['Mg', 'Ca', 'Zn', 'Cu'], OH: ['Mg', 'Zn', 'Cu'], SO4: ['Ca'] };
const STRONG_ACID = ['Cl', 'Br', 'NO3', 'SO4'];
const WEAK_OXIDE = ['Zn', 'Cu'];        // these oxides take a hydrogen from an acid, but not from water
const NAMED = { 'Cl,NO3': 'chloride nitrate' };

/* One compound of `cat` and the anions in `ans` (a list, so a half-swapped
   salt like Ca(OH)Cl is two different anions on one calcium). Built once and
   kept; a molecule already drawn by hand above keeps its own picture. */
function ionic(cat, raw) {
  const kinds = [...new Set(raw)];
  const ans = (kinds.length === 1 ? kinds : raw.slice()).sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
  const C = CATIONS[cat], list = ans.map((k) => ANIONS[k]);
  if (!C || list.some((A) => !A)) return null;
  const mixed = ans.length > 1;
  // an oxide takes no partner, and a salt cannot hold a hydroxide and a spare hydrogen at once
  if (ans.includes('O') && (mixed || C.charge === 1)) return null;
  if (mixed && ans.includes('OH') && ans.some((a) => a === 'HSO4' || a === 'HCO3')) return null;
  if (mixed && ans.includes('HSO4') && ans.includes('HCO3')) return null;
  // an acid group beside a second acid group, or beside a spare hydrogen, would not sit still
  if (mixed && ans.filter((a) => ANIONS[a].organic).length &&
      (ans.every((a) => ANIONS[a].organic) || ans.some((a) => a === 'HSO4' || a === 'HCO3'))) return null;
  let m, n;
  if (mixed) {
    if (list.reduce((t, A) => t + A.charge, 0) !== C.charge || ans.length > 2) return null;
    m = 1; n = 1;
  } else {
    const g = gcd(C.charge, list[0].charge);
    m = list[0].charge / g; n = C.charge / g;
  }
  if (m > 2 || n > 2) return null;                       // nothing on this bench needs three of a kind
  if (cat === 'NH4' && (m > 1 || ans.includes('OH'))) return null;   // ammonia already stands for its solution
  const isAcid = cat === 'H';
  if (isAcid && (mixed || ans[0] === 'OH' || ans[0] === 'O')) return null;  // that would be water
  const name = isAcid ? list[0].acid
    : mixed ? C.name + ' ' + (NAMED[ans.join(',')] || (ans[0] === 'OH' ? 'hydroxy' + ANIONS[ans[1]].name : ans.map((k) => ANIONS[k].name).join(' ')))
    : C.name + ' ' + list[0].name;
  if (!name || name.includes('undefined')) return null;
  const key = name.replace(/ /g, '-');

  const tags = [];
  if (isAcid) {
    tags.push('acid');
    if (STRONG_ACID.includes(ans[0])) tags.push('strong-acid');
    if (list[0].charge === 2) tags.push('diprotic-acid');
    if (ans[0] === 'SO4') tags.push('sulphate');
    if (ans[0] === 'Cl' || ans[0] === 'Br') tags.push('hydrogen-halide');
    if (list[0].organic) tags.push('carboxylic-acid');
  } else {
    if (ans.includes('OH') || ans.includes('O')) {
      tags.push('base');
      if (ans.includes('O')) { tags.push('oxide'); if (!WEAK_OXIDE.includes(cat)) tags.push('slakes'); }
      if (!mixed && ans[0] === 'OH' && ['Na', 'K', 'Ca'].includes(cat)) tags.push('strong-base');
      if (mixed) tags.push('basic-salt');
    }
    if (ans.some((a) => ANIONS[a].organic)) tags.push('weak-acid-salt');
    if (ans.includes('HSO4')) tags.push('acid');
    if (ans.some((a) => a !== 'OH' && a !== 'O')) tags.push('salt');
    if (ans.includes('CO3') || ans.includes('HCO3')) tags.push('carbonate');
    if (ans.includes('HCO3')) tags.push('hydrogencarbonate');
    if (cat === 'NH4') tags.push('ammonium');
    if (ans.some((a) => (INSOLUBLE[a] || []).includes(cat))) tags.push('insoluble');
    if (ans.includes('SO4')) tags.push('sulphate');
    // a salt carrying a spare hydrogen gives that up before it swaps anything
    const held = ans.includes('HSO4') || ans.includes('HCO3');
    const free = (a) => (INSOLUBLE[a] || []).includes(cat) && !ans.includes(a) && !held;
    if (free('OH')) tags.push('hydroxide-falls');
    if (free('CO3') && !ans.includes('HCO3')) tags.push('carbonate-falls');
    if (free('SO4') && !ans.includes('HSO4')) tags.push('sulphate-falls');
    if (METALS[cat] && !ans.includes('O') && !ans.includes('OH') && !held) tags.push(METALS[cat] + '-salt');
  }
  if (ans.includes('Cl')) tags.push('chloride');

  const drawn = SPECIES[key];
  const s = drawn || sp(key, name, formula(C, m, list, n, mixed), ...picture(C, m, list, n, mixed), tags);
  for (const t of tags) if (!s.tags.includes(t)) s.tags.push(t);
  s.ions = { cat, m, ans: mixed ? ans.slice() : Array(n).fill(ans[0]) };
  SPECIES[key] = s;
  return s;
}
function formula(C, m, list, n, mixed) {
  const one = (ion, k, force) => (k > 1 || (force && ion.group) ? (ion.group ? '(' + ion.formula + ')' : ion.formula) + (k > 1 ? sub(k) : '') : ion.formula);
  if (!mixed && list[0].organic) return one(list[0], n) + one(C, m);   // CH₃COOH, CH₃COONa
  return one(C, m) + (mixed ? list.map((A) => one(A, 1, true)).join('') : one(list[0], n));
}
/* The picture. One ion is the host and the others hang off its arms: the
   anion holds the metals when there is one of it, and the metal holds the
   anions when there are two. A partner placed on the left is turned right
   round, so its own tail points outwards. */
function picture(C, m, list, n, mixed) {
  const atoms = [], bonds = [];
  const put = (tpl, dx, dy, turn, art) => {
    const base = atoms.length;
    tpl.atoms.forEach(([el, x, y]) => atoms.push([el, dx + turn * x, dy + turn * y]));
    for (const b of ((art && art.bonds) || tpl.bonds || '').split(' ').filter(Boolean)) {
      const [, i, k, j] = b.match(/^(\d+)([-=#])(\d+)$/);
      bonds.push((base + +i) + k + (base + +j));
    }
    return base;
  };
  const link = (i, j, order) => bonds.push(i + (order === 2 ? '=' : '-') + j);
  if (!mixed && n === 1) {                                  // the anion holds the metals
    const A = list[0], bridge = m === 1 && C.charge === 2 && A.charge === 2 && A.bridge;
    const base = put(A, 0, 0, 1, bridge || null);
    if (bridge) {
      const b = put(C, bridge.p[0], bridge.p[1], 1);
      if (bridge.a[0] === bridge.a[1]) link(b, base + bridge.a[0], 2);
      else bridge.a.forEach((i) => link(b, base + i));
    } else {
      for (let i = 0; i < m; i++) {
        const arm = A.arms[i], h = C.formula === 'H' && arm.h ? arm.h : arm.p;
        const away = Math.hypot(arm.p[0], arm.p[1]), push = (C.reach || 0) / (away || 1);
        const x = h[0] * (1 + (h === arm.p ? push : 0)), y = h[1] * (1 + (h === arm.p ? push : 0));
        const b = put(C, x, y, x > 0.01 ? -1 : 1);
        if (!C.loose) link(b, base + arm.a, C.atoms.length === 1 && A.atoms.length === 1 ? Math.min(C.charge, A.charge) : 1);
      }
    }
  } else {                                                  // the metal holds the anions
    const base = put(C, 0, 0, 1);
    const slots = mixed ? list : Array(n).fill(list[0]);
    slots.forEach((A, i) => {
      const turn = slots.length === 1 || i === 0 ? -1 : 1, arm = A.arms[0];
      const b = put(A, -turn * arm.p[0], -turn * arm.p[1], turn);
      link(base, b + arm.a, C.atoms.length === 1 && A.atoms.length === 1 ? Math.min(C.charge, A.charge) : 1);
    });
  }
  return [atoms, bonds.join(' ')];
}

/* ---------- THE CARBON CHAIN ----------
   Carbon has four hands, so an organic molecule is a chain of carbons with
   hydrogens filling whatever is left over. Four skeletons cover the whole
   Carbon Lab — a plain chain, a chain with a double bond in it, a chain
   ending in something, and a chain ending in the acid group — and every
   hydrogen is placed by the same rule: into the widest gap between the
   bonds its atom already has.

   The acid group is put in the ion tables above rather than built here, so
   that every metal's salt of it, and all the hydrogen-moving that goes with
   it, comes out of the same engine as the rest of the bench. */
const STEM = ['meth', 'eth', 'prop'];
const ALKYL = ['methyl', 'ethyl', 'propyl'];
const LONGEST = 3;                                        // three carbons keeps every family closed
const HANDS = { C: 4, O: 2, N: 3, Cl: 1, Br: 1 };
const ZIG = (i) => [i * 0.95, (i % 2) * 0.5];
const ALKANE = ['CH₄', 'C₂H₆', 'C₃H₈'];
const ALKYL_F = ['CH₃', 'C₂H₅', 'C₃H₇'];

// The widest k gaps between the directions an atom is already bonded in.
function gaps(dirs, k) {
  const out = [], list = dirs.slice().sort((a, b) => a - b);
  if (!list.length) { for (let i = 0; i < k; i++) out.push(-Math.PI / 2 + (i * 2 * Math.PI) / k); return out; }
  for (let i = 0; i < k; i++) {
    let at = 0, wide = -1;
    for (let j = 0; j < list.length; j++) {
      const a = list[j], b = j + 1 < list.length ? list[j + 1] : list[0] + 2 * Math.PI;
      if (b - a > wide) { wide = b - a; at = j; }
    }
    const a = list[at], b = at + 1 < list.length ? list[at + 1] : list[0] + 2 * Math.PI;
    const mid = (a + b) / 2;
    out.push(mid);
    list.push(mid > Math.PI ? mid - 2 * Math.PI : mid);
    list.sort((x, y) => x - y);
  }
  return out;
}
function sketch() {
  const at = [], bo = [];
  const dirsAt = (i) => bo.filter((b) => b[0] === i || b[1] === i)
    .map((b) => { const o = at[b[0] === i ? b[1] : b[0]]; return Math.atan2(o[2] - at[i][2], o[1] - at[i][1]); });
  const spare = (i) => HANDS[at[i][0]] - bo.filter((b) => b[0] === i || b[1] === i).reduce((t, b) => t + b[2], 0);
  const g = {
    at, bo, dirsAt,
    add(el, x, y) { at.push([el, x, y]); return at.length - 1; },
    join(a, b, order) { bo.push([a, b, order || 1]); return b; },
    // A new atom on the side of an old one, in its widest gap.
    hang(i, el, order, far) {
      const a = gaps(dirsAt(i), 1)[0], d = far == null ? 1 : far;
      const j = g.add(el, at[i][1] + Math.cos(a) * d, at[i][2] + Math.sin(a) * d);
      g.join(i, j, order);
      return j;
    },
    fill(except) {
      for (let i = at.length - 1; i >= 0; i--) {
        if (!HANDS[at[i][0]] || (except || []).includes(i)) continue;
        for (const a of gaps(dirsAt(i), spare(i))) {
          g.join(i, g.add('H', at[i][1] + Math.cos(a) * 0.72, at[i][2] + Math.sin(a) * 0.72));
        }
      }
      return g;
    },
    out() { return [at, bo.map(([a, b, o]) => a + (o === 2 ? '=' : '-') + b).join(' ')]; },
  };
  return g;
}
// n carbons along the zig-zag, with a double bond at the front if asked.
function backbone(g, n, double) {
  const c = [];
  for (let i = 0; i < n; i++) c.push(g.add('C', ...ZIG(i)));
  for (let i = 1; i < n; i++) g.join(c[i - 1], c[i], double && i === 1 ? 2 : 1);
  return c;
}
function carbon(key, name, formula, tags, note, make) {
  let s = SPECIES[key];                                   // some were drawn by hand, and keep their picture
  if (!s) {
    const g = sketch();
    make(g);
    g.fill();
    s = sp(key, name, formula, ...g.out(), tags);
    SPECIES[key] = s;
  }
  for (const t of tags) if (!s.tags.includes(t)) s.tags.push(t);
  s.carbon = note;
  return s;
}

const HALO = { Cl: ['chloro', 'Cl'], Br: ['bromo', 'Br'] };
const chainF = (n) => 'C' + (n > 1 ? sub(n) : '') + 'H';
for (let n = 1; n <= LONGEST; n++) {
  carbon(STEM[n - 1] + 'ane', STEM[n - 1] + 'ane', ALKANE[n - 1], ['alkane'], { n, kind: 'alkane' }, (g) => backbone(g, n));
  if (n >= 2) carbon(STEM[n - 1] + 'ene', STEM[n - 1] + 'ene', chainF(n) + sub(2 * n), ['alkene'], { n, kind: 'alkene' },
    (g) => backbone(g, n, true));
  carbon(STEM[n - 1] + 'anol', STEM[n - 1] + 'anol', ALKYL_F[n - 1] + 'OH', ['alcohol'], { n, kind: 'alcohol' }, (g) => {
    const c = backbone(g, n);
    g.join(c[n - 1], g.add('O', ...ZIG(n)), 1);
  });
  for (const [X, [pre, sym]] of Object.entries(HALO)) {
    carbon(pre + STEM[n - 1] + 'ane', pre + STEM[n - 1] + 'ane', ALKYL_F[n - 1] + sym,
      ['haloalkane'], { n, kind: 'haloalkane', x: X }, (g) => {
        const c = backbone(g, n);
        g.join(c[n - 1], g.add(X, ...ZIG(n)), 1);
      });
    if (n >= 2) carbon('di' + pre + STEM[n - 1] + 'ane', 'di' + pre + STEM[n - 1] + 'ane', chainF(n) + sub(2 * n) + sym + sub(2),
      ['dihaloalkane'], { n, kind: 'dihalo', x: X },
      (g) => { const c = backbone(g, n); g.hang(c[0], X, 1); g.hang(c[1], X, 1); });
  }
}
// An ester: the acid's chain, its two oxygens, then the alcohol's chain.
for (let a = 1; a <= LONGEST; a++) for (let b = 1; b <= LONGEST; b++) {
  carbon(ALKYL[b - 1] + '-' + STEM[a - 1] + 'anoate', ALKYL[b - 1] + ' ' + STEM[a - 1] + 'anoate',
    (a === 1 ? 'H' : ALKYL_F[a - 2]) + 'COO' + ALKYL_F[b - 1], ['ester'], { n: b, acid: a, kind: 'ester' }, (g) => {
      const c = backbone(g, a);
      g.hang(c[a - 1], 'O', 2);
      let prev = g.add('O', ...ZIG(a));
      g.join(c[a - 1], prev, 1);
      for (let i = 0; i < b; i++) prev = g.join(prev, g.add('C', ...ZIG(a + 1 + i)), 1);
    });
}

/* The acid group goes in the ion tables, so every metal's salt of it and all
   the hydrogen-moving that goes with it come out of the same engine as the
   rest of the bench. A carboxylic acid holds its hydrogen far more tightly
   than hydrochloric acid does, which is what makes it fizz with baking soda
   but leave most things alone. */
for (let n = 1; n <= LONGEST; n++) {
  const g = sketch(), c = backbone(g, n);
  g.hang(c[n - 1], 'O', 2);
  const o = g.add('O', ...ZIG(n));
  g.join(c[n - 1], o, 1);
  g.fill([o]);
  const dir = gaps(g.dirsAt(o), 1)[0], ox = g.at[o][1], oy = g.at[o][2];
  ANIONS[STEM[n - 1] + 'anoate'] = {
    charge: 1, organic: true, group: true, pka: 5,
    name: STEM[n - 1] + 'anoate', acid: STEM[n - 1] + 'anoic acid',
    formula: (n === 1 ? 'H' : ALKYL_F[n - 2]) + 'COO',
    atoms: g.at, bonds: g.bo.map(([a, b, ord]) => a + (ord === 2 ? '=' : '-') + b).join(' '),
    arms: [{ a: o, p: [ox + Math.cos(dir), oy + Math.sin(dir)], h: [ox + Math.cos(dir) * 0.72, oy + Math.sin(dir) * 0.72] }],
  };
  ORDER.push(STEM[n - 1] + 'anoate');
}

/* The bench: the acids, what each metal makes with them, and the half-swapped
   salts in between. */
const METALS = { Mg: 'magnesium', Zn: 'zinc', Cu: 'copper' };
const ABOVE = { Mg: 3, Zn: 2, H: 1, Cu: 0 };                // which metal pushes which out of its salt
for (const an of ['Cl', 'Br', 'NO3', 'SO4']) ionic('H', [an]);
for (const cat of ['Na', 'K', 'NH4', 'Mg', 'Ca', 'Zn', 'Cu']) {
  for (const an of ['Cl', 'Br', 'NO3', 'SO4', 'OH', 'CO3']) ionic(cat, [an]);
}
for (const cat of ['Na', 'K', 'NH4']) for (const an of ['HSO4', 'HCO3']) ionic(cat, [an]);
for (let n = 1; n <= LONGEST; n++) {
  const an = STEM[n - 1] + 'anoate';
  ionic('H', [an]);
  for (const cat of ['Na', 'K', 'NH4', 'Ca']) ionic(cat, [an]);
}
for (const cat of ['Mg', 'Ca', 'Zn', 'Cu']) {
  ionic(cat, ['O']); ionic(cat, ['HSO4']); ionic(cat, ['HCO3']);
  for (const an of ['Cl', 'Br', 'NO3']) { ionic(cat, ['OH', an]); ionic(cat, ['HCO3', an]); }
  ionic(cat, ['Cl', 'NO3']);
}
[
  sp('carbon-dioxide', 'carbon dioxide', 'CO₂', [['C', 0, 0], ['O', -1.1, 0], ['O', 1.1, 0]], '0=1 0=2', ['gas']),
  sp('chlorine', 'chlorine', 'Cl₂', [['Cl', -0.6, 0], ['Cl', 0.6, 0]], '0-1', ['halogen']),
  sp('magnesium', 'magnesium', 'Mg', [['Mg', 0, 0]], '', ['metal', 'beats-hydrogen', 'beats-zinc', 'beats-copper']),
  sp('zinc', 'zinc', 'Zn', [['Zn', 0, 0]], '', ['metal', 'beats-hydrogen', 'beats-copper']),
  sp('copper', 'copper', 'Cu', [['Cu', 0, 0]], '', ['metal']),
].forEach((s) => { if (!SPECIES[s.key]) SPECIES[s.key] = s; SPECIES[s.key].metal = METALS[s.formula] ? s.formula : undefined; });
SPECIES.water.ions = { cat: 'H', m: 2, ans: ['O'] };

/* ---------- REACTIONS ----------
   Two molecules in, one to three out, in the order the tray shows them: the
   interesting product first, water last. */
const REACTIONS = [];
const BY_PAIR = new Map();
function rx(a, b, products, note, kind) {
  const r = { a, b, products, note, kind };
  REACTIONS.push(r);
  BY_PAIR.set(a < b ? a + '+' + b : b + '+' + a, r);
}
// an acid and a base make a salt and water
rx('hydrochloric-acid', 'sodium-hydroxide', ['sodium-chloride', 'water']);
rx('nitric-acid', 'sodium-hydroxide', ['sodium-nitrate', 'water']);
rx('sulphuric-acid', 'sodium-hydroxide', ['sodium-hydrogen-sulphate', 'water']);
rx('sodium-hydrogen-sulphate', 'sodium-hydroxide', ['sodium-sulphate', 'water']);
rx('hydrochloric-acid', 'calcium-hydroxide', ['calcium-hydroxychloride', 'water']);
rx('hydrochloric-acid', 'calcium-hydroxychloride', ['calcium-chloride', 'water']);
rx('sulphuric-acid', 'calcium-hydroxide', ['calcium-sulphate', 'water', 'water']);
rx('nitric-acid', 'calcium-hydroxide', ['calcium-hydroxynitrate', 'water']);
rx('nitric-acid', 'calcium-hydroxynitrate', ['calcium-nitrate', 'water']);
rx('nitric-acid', 'calcium-hydroxychloride', ['calcium-chloride-nitrate', 'water']);
rx('hydrochloric-acid', 'calcium-hydroxynitrate', ['calcium-chloride-nitrate', 'water']);
rx('sulphuric-acid', 'calcium-hydroxychloride', ['calcium-sulphate', 'hydrochloric-acid', 'water']);
rx('sulphuric-acid', 'calcium-hydroxynitrate', ['calcium-sulphate', 'nitric-acid', 'water']);
rx('sodium-hydrogen-sulphate', 'calcium-hydroxide', ['calcium-sulphate', 'sodium-hydroxide', 'water']);
rx('sodium-hydrogen-sulphate', 'calcium-hydroxychloride', ['calcium-sulphate', 'sodium-chloride', 'water']);
rx('sodium-hydrogen-sulphate', 'calcium-hydroxynitrate', ['calcium-sulphate', 'sodium-nitrate', 'water']);
// lime: calcium oxide takes an acid, or water
rx('hydrochloric-acid', 'calcium-oxide', ['calcium-hydroxychloride']);
rx('nitric-acid', 'calcium-oxide', ['calcium-hydroxynitrate']);
rx('sulphuric-acid', 'calcium-oxide', ['calcium-sulphate', 'water']);
rx('sodium-hydrogen-sulphate', 'calcium-oxide', ['calcium-sulphate', 'sodium-hydroxide']);
rx('calcium-oxide', 'water', ['calcium-hydroxide']);
// ammonia: a base with no hydroxide, and an ammonium salt gives it up to a strong base
rx('hydrochloric-acid', 'ammonia', ['ammonium-chloride']);
rx('nitric-acid', 'ammonia', ['ammonium-nitrate']);
rx('ammonium-chloride', 'sodium-hydroxide', ['sodium-chloride', 'water', 'ammonia']);
rx('ammonium-nitrate', 'sodium-hydroxide', ['sodium-nitrate', 'water', 'ammonia']);
// organic: the double bond in an alkene opens and takes something on each carbon
rx('ethene', 'hydrogen', ['ethane']);
rx('ethene', 'bromine', ['dibromoethane']);
rx('ethene', 'water', ['ethanol']);
rx('ethene', 'hydrochloric-acid', ['chloroethane']);
// an alcohol and an acid make an ester and water; water and alkali take it apart again
rx('ethanol', 'ethanoic-acid', ['ethyl-ethanoate', 'water']);
rx('ethyl-ethanoate', 'water', ['ethanol', 'ethanoic-acid']);
rx('ethyl-ethanoate', 'sodium-hydroxide', ['sodium-ethanoate', 'ethanol']);
// oxygen turns an alcohol into its acid; hydrogen chloride swaps its OH for Cl
rx('ethanol', 'oxygen', ['ethanoic-acid', 'water']);
rx('ethanol', 'hydrochloric-acid', ['chloroethane', 'water']);
rx('chloroethane', 'sodium-hydroxide', ['ethanol', 'sodium-chloride']);
// ethanoic acid is an acid like any other, and a strong acid takes its salt back
rx('ethanoic-acid', 'sodium-hydroxide', ['sodium-ethanoate', 'water']);
rx('sodium-ethanoate', 'hydrochloric-acid', ['ethanoic-acid', 'sodium-chloride']);
rx('sodium-ethanoate', 'nitric-acid', ['ethanoic-acid', 'sodium-nitrate']);
rx('sodium-ethanoate', 'sulphuric-acid', ['ethanoic-acid', 'sodium-hydrogen-sulphate']);

/* ---------- THE EQUATIONS, WORKED OUT ----------
   The rules above were written out one by one. The rest of the bench is far
   too big for that, so these are worked out from the ions themselves, in
   three ways a school lab would recognise:

   A hydrogen moves. Every acid is a hydrogen looking for somewhere better to
   sit, and every base is somewhere better. How readily one leaves, and how
   strongly a base holds it, are the two numbers below; the hydrogen moves
   when the giver's number is under the taker's. That one rule covers
   neutralisation, quicklime slaking in water, ammonia coming off an ammonium
   salt, and a carbonate fizzing — and it correctly refuses the pairs that do
   nothing, like ammonium chloride with baking soda. As many hydrogens move
   as both sides can manage, which is why one sulphuric acid takes a whole
   calcium hydroxide but only half a sodium one.

   A metal pushes another out. Magnesium beats zinc, zinc beats hydrogen,
   hydrogen beats copper: the higher metal takes the salt and the lower one
   is left as metal (or as hydrogen, bubbling off).

   Something will not dissolve. Swap the partners of two salts, and if either
   new pair is one of the insoluble ones it falls out of the liquid as a
   solid, which is what drags the reaction along. */
const GIVES = { H: 0, HSO4: 2, NH4: 9, HCO3: 10, water: 16 };
const TAKES = { O: 30, OH: 16, CO3: 10, ammonia: 9, HCO3: 6 };
const count = (list, x) => list.filter((y) => y === x).length;
const drop = (list, x, k) => { const out = list.slice(); for (let i = 0; i < k; i++) out.splice(out.indexOf(x), 1); return out; };

// What this molecule can give a hydrogen from, and how readily.
function gives(key) {
  const io = SPECIES[key].ions;
  if (key === 'water') return { pka: GIVES.water, n: 1, from: 'water' };
  if (!io) return null;
  if (io.cat === 'H') return { pka: ANIONS[io.ans[0]].pka || GIVES.H, n: io.m, from: 'H' };
  if (count(io.ans, 'HSO4')) return { pka: GIVES.HSO4, n: count(io.ans, 'HSO4'), from: 'HSO4' };
  if (io.cat === 'NH4') return { pka: GIVES.NH4, n: io.m, from: 'NH4' };
  if (count(io.ans, 'HCO3')) return { pka: GIVES.HCO3, n: count(io.ans, 'HCO3'), from: 'HCO3' };
  return null;
}
// Every place this molecule could take a hydrogen, the strongest first.
function takes(key) {
  const io = SPECIES[key].ions, out = [];
  if (key === 'ammonia') return [{ pka: TAKES.ammonia, at: -1 }];
  if (!io || io.cat === 'H') return out;
  io.ans.forEach((a, i) => {
    const soft = WEAK_OXIDE.includes(io.cat) ? 14 : null;
    if (a === 'O') out.push({ pka: soft || TAKES.O, at: i }, { pka: soft || TAKES.OH, at: i });
    else if (a === 'OH') out.push({ pka: soft || TAKES.OH, at: i });
    else if (a === 'CO3') out.push({ pka: TAKES.CO3, at: i }, { pka: TAKES.HCO3, at: i });
    else if (a === 'HCO3') out.push({ pka: TAKES.HCO3, at: i });
    else if (ANIONS[a].pka) out.push({ pka: ANIONS[a].pka, at: i });
  });
  return out.sort((x, y) => y.pka - x.pka);
}
/* Move as many hydrogens as both sides can manage, then see what is left:
   loose ions to pair up, and whatever came off as water, gas or ammonia. */
function moveHydrogen(dKey, aKey) {
  const g = gives(dKey), slots = takes(aKey);
  if (!g) return null;
  const use = slots.filter((s) => s.pka > g.pka).slice(0, g.n);
  if (!use.length) return null;
  const D = SPECIES[dKey].ions, A = SPECIES[aKey].ions, k = use.length;
  const cats = [], ans = [], loose = [];
  // the giver, one hydrogen lighter
  if (g.from === 'water') { ans.push('OH'); }
  else if (g.from === 'H') {                             // a hydrogen still on the acid stays on its own anion
    const kept = D.ans.slice();
    for (let i = 0; i < D.m - k; i++) {
      const j = kept.findIndex((x) => x === 'SO4' || x === 'CO3');
      if (j < 0) cats.push('H'); else kept[j] = kept[j] === 'SO4' ? 'HSO4' : 'HCO3';
    }
    ans.push(...kept);
  }
  else if (g.from === 'NH4') { for (let i = 0; i < D.m - k; i++) cats.push('NH4'); for (let i = 0; i < k; i++) loose.push('ammonia'); ans.push(...D.ans); }
  else {
    for (let i = 0; i < D.m; i++) cats.push(D.cat);
    const left = g.from === 'HSO4' ? 'SO4' : 'CO3';
    ans.push(...drop(D.ans, g.from, k), ...Array(k).fill(left));
  }
  // the taker, k hydrogens heavier
  if (aKey === 'ammonia') { cats.push('NH4'); }
  else {
    for (let i = 0; i < A.m; i++) cats.push(A.cat);
    const rest = A.ans.slice();
    for (const s of use) {
      const was = rest[s.at];
      if (was === 'O') rest[s.at] = 'OH';
      else if (was === 'OH') { rest[s.at] = null; loose.push('water'); }
      else if (was === 'CO3') rest[s.at] = 'HCO3';
      else if (was === 'HCO3') { rest[s.at] = null; loose.push('water', 'carbon-dioxide'); }
      else if (ANIONS[was].organic) { rest[s.at] = null; cats.push('H'); ans.push(was); }
    }
    ans.push(...rest.filter(Boolean));
  }
  const got = split(cats, ans);
  if (!got) return null;
  const made = got.keys;
  const first = SPECIES[dKey].ions && SPECIES[dKey].ions.ans[0];
  made.sort((x, y) => (SPECIES[y].ions.ans.includes(first) ? 1 : 0) - (SPECIES[x].ions.ans.includes(first) ? 1 : 0));
  return [...made, ...loose.filter((l) => l === 'water'), ...loose.filter((l) => l !== 'water')];
}
/* Pair loose ions back into compounds: as many separate ones as possible,
   whole salts before half-swapped ones, and a solid that will not dissolve
   ahead of anything else. */
function split(cats, ans) {
  if (!cats.length && !ans.length) return { score: 0, keys: [] };
  if (!cats.length || !ans.length) return null;
  const c = cats[0], cc = CATIONS[c].charge, have = count(cats, c);
  let best = null;
  const tryOne = (who, take, charge) => {
    for (const pick of sets(ans, charge)) {
      const s = ionic(who, pick);
      if (!s || s.ions.ans.length !== pick.length || s.ions.m !== count(cats, who) - count(take, who)) continue;
      const rest = split(take, pick.reduce((l, a) => drop(l, a, 1), ans));
      if (!rest) continue;
      const score = rest.score + 10 - (new Set(pick).size > 1 ? 5 : 0) + (s.tags.includes('insoluble') ? 6 : 0);
      if (!best || score > best.score) best = { score, keys: [s.key, ...rest.keys] };
    }
  };
  for (let k = 1; k <= have; k++) tryOne(c, drop(cats, c, k), k * cc);
  return best;
}
// Every one or two anions from `ans` adding up to `charge` of negative.
function sets(ans, charge) {
  const kinds = [...new Set(ans)], out = [];
  for (const a of kinds) {
    const ca = ANIONS[a].charge;
    if (ca === charge) out.push([a]);
    if (ca * 2 === charge && count(ans, a) > 1) out.push([a, a]);
    for (const b of kinds) if (b !== a && ca + ANIONS[b].charge === charge) out.push([a, b]);
  }
  return out;
}

// A metal pushes a lower one out of its salt, or hydrogen out of an acid.
function pushOut(mKey, sKey) {
  const M = SPECIES[mKey].metal, io = SPECIES[sKey].ions;
  if (!M || !io || ABOVE[M] === undefined || ABOVE[io.cat] === undefined || ABOVE[M] <= ABOVE[io.cat]) return null;
  if (CATIONS[io.cat].charge !== 2 && io.cat !== 'H') return null;
  if (io.cat === 'H' && (io.m !== 2 || io.ans.length !== 1)) return null;   // one metal needs two hydrogens
  if (io.ans.some((a) => a === 'OH' || a === 'O' || a === 'CO3' || a === 'HCO3' || a === 'HSO4')) return null;
  const made = ionic(M, io.ans);
  if (!made || made.ions.m !== 1) return null;
  return [made.key, io.cat === 'H' ? 'hydrogen' : METALS[io.cat]];
}
// Two salts swap partners, and one of the new pairs will not dissolve.
function fallOut(aKey, bKey) {
  const A = SPECIES[aKey].ions, B = SPECIES[bKey].ions;
  const solid = (k) => SPECIES[k].tags.includes('insoluble');
  const stuck = (k) => SPECIES[k].tags.includes('oxide') || (SPECIES[k].ions || { ans: [] }).ans.some((x) => x === 'HSO4' || x === 'HCO3');
  if (!A || !B || solid(aKey) || solid(bKey) || aKey === 'water' || bKey === 'water') return null;
  if (stuck(aKey) || stuck(bKey)) return null;             // an oxide will not swap in water, and a spare hydrogen moves first
  const cats = [...Array(A.m).fill(A.cat), ...Array(B.m).fill(B.cat)];
  const got = split(cats, [...A.ans, ...B.ans]);
  if (!got || !got.keys.some(solid)) return null;
  return [...got.keys.filter(solid), ...got.keys.filter((k) => !solid(k))];
}

/* What a carbon chain does that is not a hydrogen moving or a partner
   swapping: the double bond opening and taking something onto each carbon,
   the acid group and an alcohol joining into an ester and coming apart
   again, and a chain trading whatever sits on its end. The tube brings
   whatever heat, light or catalyst a school lab would. */
const CHAIN_OF = (an) => STEM.indexOf(an.replace('anoate', '')) + 1;
function carbonChange(aKey, bKey) {
  const A = SPECIES[aKey], B = SPECIES[bKey], has = (s, t) => s.tags.includes(t);
  // the carbon chain first, whatever meets it second
  const both = (kind, test) => (A.carbon && A.carbon.kind === kind && test(B) ? [A, B]
    : B.carbon && B.carbon.kind === kind && test(A) ? [B, A] : null);
  const halogenOf = (s) => (s.key === 'bromine' ? 'Br' : s.key === 'chlorine' ? 'Cl' : null);
  const left = (base, take) => {                          // the base, one hydroxide lighter
    const io = base.ions, ans = io.ans.slice();
    ans.splice(ans.indexOf('OH'), 1);
    const got = split(Array(io.m).fill(io.cat), [...ans, take]);
    return got && got.keys;
  };
  let p;
  if ((p = both('alkene', (s) => s.key === 'hydrogen'))) return [STEM[p[0].carbon.n - 1] + 'ane'];
  if ((p = both('alkene', (s) => halogenOf(s)))) return ['di' + HALO[halogenOf(p[1])][0] + STEM[p[0].carbon.n - 1] + 'ane'];
  if ((p = both('alkene', (s) => has(s, 'hydrogen-halide')))) return [HALO[p[1].ions.ans[0]][0] + STEM[p[0].carbon.n - 1] + 'ane'];
  if ((p = both('alkene', (s) => s.key === 'water'))) return [STEM[p[0].carbon.n - 1] + 'anol'];
  if ((p = both('alcohol', (s) => has(s, 'carboxylic-acid')))) {
    return [ALKYL[p[0].carbon.n - 1] + '-' + STEM[CHAIN_OF(p[1].ions.ans[0]) - 1] + 'anoate', 'water'];
  }
  if ((p = both('alcohol', (s) => s.key === 'oxygen'))) return [STEM[p[0].carbon.n - 1] + 'anoic-acid', 'water'];
  if ((p = both('alcohol', (s) => has(s, 'hydrogen-halide')))) {
    return [HALO[p[1].ions.ans[0]][0] + STEM[p[0].carbon.n - 1] + 'ane', 'water'];
  }
  if ((p = both('ester', (s) => s.key === 'water'))) {
    return [STEM[p[0].carbon.n - 1] + 'anol', STEM[p[0].carbon.acid - 1] + 'anoic-acid'];
  }
  if ((p = both('ester', (s) => has(s, 'strong-base')))) {
    const rest = left(p[1], STEM[p[0].carbon.acid - 1] + 'anoate');
    return rest && [STEM[p[0].carbon.n - 1] + 'anol', ...rest];
  }
  if ((p = both('haloalkane', (s) => has(s, 'strong-base')))) {
    if (p[0].carbon.kind !== 'haloalkane') return null;    // both halogens at once is a step too far
    const rest = left(p[1], p[0].carbon.x);
    return rest && [STEM[p[0].carbon.n - 1] + 'anol', ...rest];
  }
  return null;
}

/* Working the equations out makes compounds nobody had asked for, so go
   round again until the bench stops growing. */
for (let pass = 0, seen = 0; pass < 4 && Object.keys(SPECIES).length > seen; pass++) {
  const keys = Object.keys(SPECIES);
  seen = keys.length;
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const a = keys[i], b = keys[j], tag = (k, t) => SPECIES[k].tags.includes(t);
    if (reactionFor(a, b)) continue;
    let kind = 'moves-hydrogen', made = moveHydrogen(a, b) || moveHydrogen(b, a);
    if (made) {
      kind = made.includes('carbon-dioxide') ? 'fizz'
        : made.some((k) => tag(k, 'hydrogencarbonate')) && !tag(a, 'hydrogencarbonate') && !tag(b, 'hydrogencarbonate') ? 'part-fizz'
        : made.includes('ammonia') ? 'ammonia-off'
        : a === 'water' || b === 'water' ? 'slakes'
        : a === 'ammonia' || b === 'ammonia' ? 'ammonia-salt'
        : tag(a, 'oxide') || tag(b, 'oxide') ? 'oxide-and-acid' : 'neutralise';
    } else if ((made = pushOut(a, b) || pushOut(b, a))) {
      kind = made.includes('hydrogen') ? 'hydrogen-off' : 'pushed-out';
    } else if ((made = fallOut(a, b))) kind = 'falls-out';
    else if ((made = carbonChange(a, b))) kind = null;     // the card's own words know these by their tags
    if (!made || !made.length) continue;
    if (made.length === 2 && made.includes(a) && made.includes(b)) continue;
    rx(a, b, made, null, kind);
  }
}

function reactionFor(a, b) {
  return BY_PAIR.get(a < b ? a + '+' + b : b + '+' + a) || null;
}
/* Would these two react in the tube? The honesty check. Chapter 2: an acid
   with a base, an ammonium salt with a strong base or lime, lime with water.
   Chapter 3 (the tube brings whatever heat, light or catalyst a school lab
   would): an alkene with hydrogen, a halogen, a hydrogen halide or water; an
   alcohol with an acid, oxygen or a hydrogen halide; an ester with water or
   alkali; a haloalkane with alkali; the salt of a weak acid with a strong one. */
/* Can two of these trade partners, one unit against one unit? Each metal has
   to be able to take a whole number of the other's anions: one magnesium
   sulphate and one sodium hydroxide cannot, which is why that pair is left
   alone even though a chemist would pour two of the hydroxide in. */
function canSwap(a, b) {
  const A = SPECIES[a].ions, B = SPECIES[b].ions;
  if (!A || !B || A.cat === 'NH4' || B.cat === 'NH4') return false;
  if (A.cat === B.cat) return false;                      // two salts of one metal have nothing to trade
  return (CATIONS[A.cat].charge * A.m) % ANIONS[B.ans[0]].charge === 0 &&
         (CATIONS[B.cat].charge * B.m) % ANIONS[A.ans[0]].charge === 0;
}
function shouldReact(a, b) {
  const A = SPECIES[a].tags, B = SPECIES[b].tags, has = (t, x) => t.includes(x);
  const pair = (p, q) => (has(A, p) && has(B, q)) || (has(A, q) && has(B, p));
  const soluble = !has(A, 'insoluble') && !has(B, 'insoluble');
  const setsFree = (salt, acid) => has(salt, 'weak-acid-salt') && has(acid, 'acid') && !has(acid, 'carboxylic-acid');
  // an ammonium salt gives its hydrogen up to anything that holds one more tightly than ammonia does
  const ammoniumMeets = (t, o) => has(t, 'ammonium') && !has(o, 'ammonia') &&
    (has(o, 'base') || (has(o, 'carbonate') && !has(o, 'hydrogencarbonate')));
  return pair('acid', 'base') || pair('slakes', 'water') ||
    (pair('hydrogencarbonate', 'base') && !has(A, 'ammonia') && !has(B, 'ammonia')) ||
    pair('acid', 'carbonate') || ammoniumMeets(A, B) || ammoniumMeets(B, A) ||
    pair('beats-hydrogen', 'diprotic-acid') ||
    (soluble && (pair('beats-copper', 'copper-salt') || pair('beats-zinc', 'zinc-salt'))) ||
    (soluble && canSwap(a, b) && !has(A, 'oxide') && !has(B, 'oxide') &&
      ((pair('carbonate', 'carbonate-falls') && !has(A, 'hydrogencarbonate') && !has(B, 'hydrogencarbonate')) ||
       pair('sulphate', 'sulphate-falls') ||
       (has(A, 'base') !== has(B, 'base') && pair('base', 'hydroxide-falls')))) ||
    pair('alkene', 'hydrogen') || pair('alkene', 'halogen') || pair('alkene', 'hydrogen-halide') || pair('alkene', 'water') ||
    pair('alcohol', 'carboxylic-acid') || pair('alcohol', 'oxygen') || pair('alcohol', 'hydrogen-halide') ||
    pair('ester', 'water') || pair('ester', 'strong-base') || pair('haloalkane', 'strong-base') ||
    // a weak acid's salt gives its acid back to any acid that holds its hydrogen less tightly
    setsFree(A, B) || setsFree(B, A);
}

/* What a reaction is, in plain words, for the card that follows it (owner,
   2026-09-15: "each complete reaction will give a modal that tells you the
   reaction"). Worked out from the same tags as the honesty check, the most
   particular kinds first; tests.mjs checks every reaction has one. */
const WORDS = {
  fizz: { title: 'Fizzing', words: 'The acid sets the carbonate\u2019s carbon dioxide free, so it bubbles off, leaving a salt and water behind.' },
  'part-fizz': { title: 'Halfway to a fizz', words: 'The carbonate takes one hydrogen from the acid. One more and the carbon dioxide will come off.' },
  'ammonia-off': { title: 'Ammonia released', words: 'The base takes a hydrogen from the ammonium, so ammonia comes off, leaving water and a salt behind.' },
  'ammonia-salt': { title: 'Neutralisation', words: 'The acid hands its hydrogen to the ammonia, which becomes an ammonium salt.' },
  slakes: { title: 'Slaking lime', words: 'Quicklime and water make slaked lime, and it gets hot as it does. Builders have done this for thousands of years.' },
  'oxide-and-acid': { title: 'Neutralisation', words: 'The metal oxide takes the acid\u2019s hydrogens as water, and the metal and the rest of the acid make a salt.' },
  neutralise: { title: 'Neutralisation', words: 'An acid and a base cancel each other out: the acid\u2019s hydrogen and the base\u2019s OH make water, and what is left is a salt.' },
  'hydrogen-off': { title: 'Hydrogen off a metal', words: 'The metal pushes the acid\u2019s hydrogen out of its place, and it bubbles away as gas.' },
  'pushed-out': { title: 'One metal pushes another out', words: 'The livelier metal takes the salt for itself, and leaves the quieter one behind as metal.' },
  'falls-out': { title: 'A solid falls out', words: 'The two salts swap partners, and one new pair will not dissolve: it drops through the liquid as a solid.' },
};
function explain(a, b) {
  const r = reactionFor(a, b);
  if (r && WORDS[r.kind]) return WORDS[r.kind];
  const A = SPECIES[a].tags, B = SPECIES[b].tags, has = (t, x) => t.includes(x);
  const pair = (p, q) => (has(A, p) && has(B, q)) || (has(A, q) && has(B, p));
  const either = (k) => a === k || b === k;
  if (pair('alkene', 'hydrogen')) return { title: 'Hydrogenation', words: 'The double bond opens and takes a hydrogen onto each carbon.' };
  if (pair('alkene', 'halogen')) return { title: 'Addition', words: 'The double bond opens and takes a bromine onto each carbon. That is why orange bromine loses its colour.' };
  if (pair('alkene', 'hydrogen-halide')) return { title: 'Addition', words: 'The double bond opens: the hydrogen goes onto one carbon and the chlorine onto the other.' };
  if (pair('alkene', 'water')) return { title: 'Hydration', words: 'The double bond opens: H goes onto one carbon and OH onto the other, which makes an alcohol.' };
  if (pair('alcohol', 'carboxylic-acid')) return { title: 'Esterification', words: 'An alcohol and an acid join into an ester and give off water. Esters are what make fruit smell sweet.' };
  if (pair('alcohol', 'oxygen')) return { title: 'Oxidation', words: 'Oxygen turns the alcohol into an acid and gives off water. It is how wine turns to vinegar.' };
  if (pair('alcohol', 'hydrogen-halide')) return { title: 'Substitution', words: 'The hydrogen chloride swaps the alcohol\'s OH for a chlorine, and the OH leaves as water.' };
  if (pair('ester', 'water')) return { title: 'Hydrolysis', words: 'Water splits the ester back into the alcohol and the acid it was made from.' };
  if (pair('ester', 'strong-base')) return { title: 'Splitting an ester', words: 'Alkali splits the ester into its alcohol and the sodium salt of its acid. Soap is made this way.' };
  if (pair('haloalkane', 'strong-base')) return { title: 'Substitution', words: 'The alkali swaps the chlorine for an OH, which makes an alcohol again, and leaves salt.' };
  if (pair('weak-acid-salt', 'strong-acid')) return { title: 'An acid set free', words: 'The strong acid hands over its hydrogen, and the salt turns back into the weak acid it came from.' };
  if (pair('ammonium', 'strong-base') || pair('ammonium', 'oxide')) return { title: 'Ammonia released', words: 'The base takes a hydrogen from the ammonium, so ammonia comes off, leaving water and a salt behind.' };
  if (pair('oxide', 'water')) return { title: 'Slaking lime', words: 'Quicklime and water make slaked lime, and it gets hot as it does. Builders have done this for thousands of years.' };
  if (pair('acid', 'base') && either('ammonia')) return { title: 'Neutralisation', words: 'The acid hands its hydrogen to the ammonia, which becomes an ammonium salt.' };
  if (pair('acid', 'base') && (has(A, 'oxide') || has(B, 'oxide'))) return { title: 'Neutralisation', words: 'The metal oxide takes the acid\'s hydrogens as water, and the metal and the rest of the acid make a salt.' };
  if (pair('acid', 'base')) return { title: 'Neutralisation', words: 'An acid and a base cancel each other out: the acid\'s hydrogen and the base\'s OH make water, and what is left is a salt.' };
  return null;
}

/* ---------- THE BENCH ----------
   Every molecule is a piece in one place: the dish, the tube (two at most),
   the tray (what the last reaction made), the beaker, or gone. */
const TUBE = 2;
function createLab(level) {
  const s = {
    pieces: [],
    targets: level.targets.map((t) => ({ key: t[0], n: t[1] })),
    made: {},
    version: 0,
    result: null,
    analysis: null,
  };
  for (const key of level.dish) s.pieces.push({ id: s.pieces.length, key, zone: 'dish' });
  refresh(s);
  return s;
}
const inZone = (s, zone) => s.pieces.filter((p) => p.zone === zone);
function refresh(s) {
  s.version += 1;
  s.analysis = analyse(s);
  s.result = s.analysis.won ? { kind: 'win' }
    : s.analysis.over ? { kind: 'fail', made: s.analysis.made, total: s.analysis.total, lost: s.analysis.lost } : null;
}

/* Into the tube. With two in, they react if they can. */
function toTube(s, id) {
  const p = s.pieces[id];
  if (!p || s.result || p.zone === 'gone' || p.zone === 'beaker' || p.zone === 'tube') return { ok: false, why: 'cannot' };
  const inTube = inZone(s, 'tube');
  if (inTube.length >= TUBE) return { ok: false, why: 'full' };
  const lostBefore = s.analysis.lost;
  p.zone = 'tube';
  const ev = { ok: true, reaction: null, used: [], products: [], poured: [] };
  if (inTube.length + 1 === TUBE) {
    const other = inTube[0], r = reactionFor(other.key, p.key);
    if (r) {
      ev.reaction = r;
      ev.used = [other.id, p.id];
      other.zone = 'gone'; p.zone = 'gone';
      ev.poured = inZone(s, 'tray').map((q) => q.id);
      ev.poured.forEach((qid) => { s.pieces[qid].zone = 'gone'; });
      r.products.forEach((key) => {
        const np = { id: s.pieces.length, key, zone: 'tray' };
        s.pieces.push(np);
        ev.products.push(np.id);
      });
    } else {
      ev.noReaction = true;
    }
  }
  refresh(s);
  ev.lost = s.analysis.lost > lostBefore;
  ev.result = s.result;
  return ev;
}
function toDish(s, id) {
  const p = s.pieces[id];
  if (!p || p.zone === 'gone' || p.zone === 'beaker') return false;
  p.zone = 'dish';
  refresh(s);
  return true;
}
// The beaker takes only what the list still wants.
function deliver(s, id) {
  const p = s.pieces[id];
  if (!p || s.result || p.zone === 'gone' || p.zone === 'beaker') return { ok: false, why: 'cannot' };
  const t = s.targets.find((q) => q.key === p.key);
  if (!t) return { ok: false, why: 'not-on-list' };
  if ((s.made[p.key] || 0) >= t.n) return { ok: false, why: 'enough' };
  p.zone = 'beaker';
  s.made[p.key] = (s.made[p.key] || 0) + 1;
  refresh(s);
  return { ok: true, result: s.result };
}

/* ---------- WHAT THE BENCH CAN STILL MAKE ----------
   A search over what is left, counting molecules by kind: react any pair the
   table allows, deliver anything the list wants, and find the most of the
   list that can still be made. Only molecules that can lead to something on
   the list are counted; the rest cannot help. It assumes the player saves
   every byproduct worth saving, so a molecule poured away is lost only once
   it has actually gone. */
function analyse(s) {
  let total = 0, made = 0;
  const owed = {};
  for (const t of s.targets) {
    const m = Math.min(t.n, s.made[t.key] || 0);
    total += t.n; made += m;
    if (t.n > m) owed[t.key] = t.n - m;
  }
  const counts = {};
  for (const p of s.pieces) if (p.zone === 'dish' || p.zone === 'tube' || p.zone === 'tray') counts[p.key] = (counts[p.key] || 0) + 1;
  const best = bestPlan(counts, owed);
  const left = total - made;
  return { total, made, best, lost: left - best, won: left === 0, over: left > 0 && best === 0 };
}
function relevantTo(keys) {
  const rel = new Set(keys);
  for (let grew = true; grew;) {
    grew = false;
    for (const r of REACTIONS) {
      if (r.products.some((k) => rel.has(k))) {
        for (const k of [r.a, r.b]) if (!rel.has(k)) { rel.add(k); grew = true; }
      }
    }
  }
  return rel;
}
function bestPlan(counts, owed) {
  const tkeys = Object.keys(owed);
  if (!tkeys.length) return 0;
  const rel = [...relevantTo(tkeys)];
  const idx = new Map(rel.map((k, i) => [k, i]));
  const rxs = REACTIONS.filter((r) => idx.has(r.a) && idx.has(r.b)).map((r) => ({
    a: idx.get(r.a), b: idx.get(r.b), out: r.products.filter((k) => idx.has(k)).map((k) => idx.get(k)),
  }));
  const tIdx = tkeys.map((k) => idx.get(k));
  const memo = new Map();
  let budget = 200000;
  /* Some reactions undo others (an ester and water give back the alcohol and
     the acid), so from each mix the search first walks everything the tube
     can reach without delivering, then delivers. A delivery shortens the
     list, so that half never goes round in a circle. */
  function go(c, o) {
    const start = c.join(',') + '|' + o.join(',');
    if (memo.has(start)) return memo.get(start);
    const most = o.reduce((n, v) => n + v, 0);
    const seen = new Set([start]), queue = [c];
    let best = 0;
    while (queue.length && best < most && --budget >= 0) {
      const cur = queue.pop();
      for (let t = 0; t < tIdx.length; t++) {
        if (o[t] > 0 && cur[tIdx[t]] > 0) {
          const nc = cur.slice(), no = o.slice();
          nc[tIdx[t]]--; no[t]--;
          best = Math.max(best, 1 + go(nc, no));
        }
      }
      for (const r of rxs) {
        if (r.a === r.b ? cur[r.a] < 2 : (cur[r.a] < 1 || cur[r.b] < 1)) continue;
        const next = cur.slice();
        next[r.a]--; next[r.b]--;
        r.out.forEach((k) => next[k]++);
        const key = next.join(',') + '|' + o.join(',');
        if (!seen.has(key)) { seen.add(key); queue.push(next); }
      }
    }
    memo.set(start, best);
    return best;
  }
  return go(rel.map((k) => counts[k] || 0), tkeys.map((k) => owed[k]));
}

// Every molecule a level can ever hold: the dish, and everything any reaction among them makes.
function closure(dish) {
  const have = new Set(dish);
  for (let grew = true; grew;) {
    grew = false;
    for (const r of REACTIONS) {
      if (have.has(r.a) && have.has(r.b)) for (const k of r.products) if (!have.has(k)) { have.add(k); grew = true; }
    }
  }
  return have;
}

return { SPECIES, REACTIONS, TUBE, reactionFor, shouldReact, explain, createLab, toTube, toDish, deliver, analyse, bestPlan, closure };
}));
