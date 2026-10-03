/* ============================================================
   Litmus in 3D · what the Moleculator teaches

   The "What you built" card for every molecule a level asks for (owner,
   2026-10-03), in a science textbook's words, never the game's "hands".
   Headless except drawElectrons, which is handed a 2D context:
     card(key)       the card's words, made from the molecule's atoms and
                     bonds (model.js) and its entry in cards.js
     shape3d(key)    the molecule in its real shape (VSEPR: electron pairs
                     spread as far apart as they can), turned to show it
     drawElectrons   the dot-and-cross diagram schools use
   ============================================================ */
(function (root, factory) {
  const M = root.ChemModel || (typeof require === 'function' ? require('../chemistry/model.js') : null);
  const api = factory(M, root.LITMUS3D_CARDS);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LitmusLearn = api;
}(typeof self !== 'undefined' ? self : this, function (M, CARDS) {

// outer-shell electrons of each non-metal; the charge each metal's ion carries
const OUTER = { H: 1, C: 4, N: 5, O: 6, F: 7, Cl: 7, Al: 3 };
const ION = { Na: 1, K: 1, Mg: 2, Ca: 2, Zn: 2, Cu: 2, Al: 3, Fe: 3 };
const ION_NAME = { Fe: 'iron(III)', Cu: 'copper(II)' };
const ANION = { Cl: ['chloride', 1], F: ['fluoride', 1], O: ['oxide', 2] };
// the metals whose ions keep a full outer shell (main groups); iron, copper and zinc are transition metals
const NOBLE_ION = new Set(['Na', 'K', 'Mg', 'Ca', 'Al']);
const WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const ORDER_WORD = ['', 'single', 'double', 'triple'];
const SUB = '₀₁₂₃₄₅₆₇₈₉', SUP = { 1: '', 2: '²', 3: '³' };
const sub = (n) => (n > 1 ? String(n).split('').map((d) => SUB[d]).join('') : '');
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const an = (w) => (/^[aeiou]/.test(w) ? 'an ' : 'a ') + w;

const T = (key) => M.MOLECULES[key];
const nameOf = (el) => M.ELEMENTS[el].name;
const isMetal = (el) => !!M.ELEMENTS[el].metal;
const card0 = (key) => CARDS[key] || {};
const kindOf = (key) => card0(key).kind || (T(key).els.some(isMetal) ? 'ionic' : 'covalent');
const covalent = (key) => /^covalent/.test(kindOf(key));
const bondSum = (t, i) => t.adj[i].reduce((s, [, o]) => s + o, 0);
// lone pairs: the outer electrons an atom keeps, in pairs, once its bonds are made
const lonePairs = (t, i) => (isMetal(t.els[i]) && t.els[i] !== 'Al' ? 0 : Math.max(0, (OUTER[t.els[i]] - bondSum(t, i)) / 2));
function counts(els) { const c = {}; for (const e of els) c[e] = (c[e] || 0) + 1; return c; }
// Hill order: carbon, then hydrogen, then the rest A to Z
function hill(els) {
  const c = counts(els), ks = Object.keys(c).sort();
  const ord = c.C ? ['C', ...(c.H ? ['H'] : []), ...ks.filter((k) => k !== 'C' && k !== 'H')] : ks;
  return ord.map((k) => k + sub(c[k])).join('');
}
function list(parts) { return parts.length < 2 ? parts.join('') : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1]; }
const atoms = (n, el) => `${WORD[n]} ${nameOf(el)} atom${n > 1 ? 's' : ''}`;
// a formula, read as tokens: an element with its count, or a bracketed group with its count
function tokens(formula) {
  const s = formula.replace(/[\u2080-\u2089]/g, (d) => SUB.indexOf(d)), out = [];
  const re = /\(([^)]+)\)(\d*)|([A-Z][a-z]?)(\d*)/g; let m;
  while ((m = re.exec(s))) out.push(m[1] ? { group: m[1], n: +(m[2] || 1) } : { el: m[3], n: +(m[4] || 1) });
  return out;
}
const pretty = (s) => s.replace(/\d/g, (d) => SUB[d]);

/* ---------- THE WORDS ---------- */
function ionsOf(key) {
  const t = T(key), c = counts(t.els), kind = kindOf(key);
  const metal = Object.keys(c).find(isMetal);
  const cat = { el: metal, n: c[metal], q: ION[metal], name: (ION_NAME[metal] || nameOf(metal)) };
  cat.sym = metal + (SUP[cat.q] || '') + '⁺';
  let ani;
  if (kind === 'ionic-oh') ani = { el: 'OH', n: c.O, q: 1, name: 'hydroxide', sym: 'OH⁻' };
  else { const el = Object.keys(c).find((e) => !isMetal(e)), [nm, q] = ANION[el]; ani = { el, n: c[el], q, name: nm, sym: el + (SUP[q] || '') + '⁻' }; }
  return { cat, ani };
}
function reading(key) {
  const t = T(key), f = t.formula, cd = card0(key);
  if (!covalent(key)) {
    const { cat, ani } = ionsOf(key);
    return `${f}: ${WORD[cat.n]} ${cat.name} ion${cat.n > 1 ? 's' : ''} for every ${ani.n > 1 ? WORD[ani.n] + ' ' : ''}${ani.name} ion${ani.n > 1 ? 's' : ''}.`;
  }
  const tk = tokens(f), els = tk.filter((x) => x.el).map((x) => x.el);
  const simple = !tk.some((x) => x.group) && new Set(els).size === els.length;
  if (simple) return tk.map((x) => `${x.el}${sub(x.n)}: ${atoms(x.n, x.el)}.`).join(' ');
  if (tk.some((x) => x.group) && new Set(els).size === els.length) {
    const parts = tk.map((x) => (x.el ? atoms(x.n, x.el)
      : `${WORD[x.n]} ${pretty(x.group)} groups, each of ${list(tokens(x.group).map((y) => atoms(y.n, y.el)))}`));
    return `${f}: ${list(parts)}.`;
  }
  const c = counts(t.els), mf = hill(t.els);
  const order = Object.keys(c).sort((a, b) => (a === 'C' ? -1 : b === 'C' ? 1 : a === 'H' ? -1 : b === 'H' ? 1 : a < b ? -1 : 1));
  let s = `Its molecular formula is ${mf}: ${list(order.map((e) => atoms(c[e], e)))}.`;
  if (cd.group) s += ` Written ${f}, it shows the ${cd.group}${cd.family ? `, which makes it ${an(cd.family)}` : ''}.`;
  return s;
}
const angleText = (cd) => (cd.angle == null ? '' : `${cd.about ? 'about ' : ''}${cd.angle}°`);
// the bonding, then (after the shape) a hydrocarbon's family, read from its bonds
function bondingWords(key) {
  const t = T(key), n = t.els.length, cd = card0(key), c = counts(t.els);
  // valency as the textbook gives it (an atom's usual number of bonds), read from the built molecule
  const valency = {}; t.els.forEach((el, i) => { valency[el] = bondSum(t, i); });
  let s;
  const inner = t.els.map((_, i) => i).filter((i) => t.adj[i].length > 1);
  if (n === 2) {
    const [a, b] = t.els, o = t.adj[0][0][1];
    s = `${cap(nameOf(a))} (valency ${valency[a]}) and ${nameOf(b)} (valency ${valency[b]}) share ${WORD[o]} pair${o > 1 ? 's' : ''} of electrons: ${an(ORDER_WORD[o])} covalent bond.`;
  } else if (inner.length === 1) {
    // one central atom, every other atom bonded to it alone
    const ci = inner[0], groups = [];
    for (const [j, o] of t.adj[ci]) {
      const g = groups.find((x) => x.el === t.els[j] && x.o === o);
      if (g) g.k++; else groups.push({ el: t.els[j], o, k: 1 });
    }
    // the strongest bond first; hydrogen first among the single ones; a second group of the same bond is "and with"
    groups.sort((x, y) => y.o - x.o || (x.el === 'H' ? -1 : y.el === 'H' ? 1 : 0));
    const said = new Set([t.els[ci]]);
    const parts = groups.map((g, gi) => {
      const v = said.has(g.el) ? '' : ` (valency ${valency[g.el]})`; said.add(g.el);
      const who = `with ${g.k > 1 || c[g.el] > g.k ? 'each' : 'the'} ${nameOf(g.el)} atom${v}`;
      return gi > 0 && groups[gi - 1].o === g.o ? who : `${an(ORDER_WORD[g.o])}${gi === 0 ? ' covalent' : ''} bond ${who}`;
    });
    s = `${cap(nameOf(t.els[ci]))} (valency ${valency[t.els[ci]]}) forms ${list(parts)}.`;
  } else {
    const order = Object.keys(c).sort((a, b) => valency[b] - valency[a]);
    s = `Each atom forms as many covalent bonds as its valency: ${list(order.map((e) => `${nameOf(e)} ${valency[e]}`))}.`;
    for (let i = 0; i < n; i++) for (const [j, o] of t.adj[i]) {
      if (j < i || o < 2) continue;
      const a = t.els[i], b = t.els[j];
      const one = (el) => (c[el] === 1 ? `the ${nameOf(el)}` : an(nameOf(el))) + ' atom';
      const pair = a === b ? (c[a] === 2 ? `the two ${nameOf(a)} atoms` : `two of the ${nameOf(a)} atoms`) : `${one(a)} and ${one(b)}`;
      s += ` There is ${an(ORDER_WORD[o])} bond between ${pair}.`;
    }
  }
  let fam = '';
  if (Object.keys(c).every((e) => e === 'C' || e === 'H')) {
    const top = Math.max(...t.adj.flat().map(([, o]) => o));
    fam = top === 1 ? ' All its bonds are single bonds: it is a saturated hydrocarbon, an alkane.'
      : top === 2 ? ' It is an unsaturated hydrocarbon, an alkene.' : ' It is an unsaturated hydrocarbon, an alkyne.';
  }
  return { s, fam };
}
function shapeWords(cd) {
  if (!cd.shape) return '';
  return ` The molecule is ${cd.shape}${cd.angle != null ? `, with a bond angle of ${angleText(cd)}` : ''}.`;
}
function lonePairWords(key) {
  const t = T(key), c = counts(t.els), per = [];
  for (const el of Object.keys(c)) {
    const i = t.els.indexOf(el), k = lonePairs(t, i);
    if (k && t.els.every((e, j) => e !== el || lonePairs(t, j) === k)) per.push({ el, k });
  }
  if (!per.length) return '';
  const ph = per.map((p, i) => {
    const who = c[p.el] > 1 ? `each ${nameOf(p.el)} atom` : `the ${nameOf(p.el)} atom`;
    return i === 0 ? `${cap(who)} also has ${WORD[p.k]} lone pair${p.k > 1 ? 's' : ''}` : `${who} ${WORD[p.k]}`;
  });
  return ' ' + (ph.length === 1 ? ph[0] : ph.length === 2 ? `${ph[0]}, and ${ph[1]}` : `${ph.slice(0, -1).join(', ')} and ${ph[ph.length - 1]}`) + '.';
}
function card(key) {
  const t = T(key), cd = card0(key), kind = kindOf(key);
  const out = {
    key, kind, formula: t.formula, fact: cd.fact || '',
    name: cd.name || cap(t.name), also: cd.name && cd.name.toLowerCase() !== t.name.toLowerCase() ? t.name : null,
    kicker: covalent(key) ? 'Covalent bonds' : 'Ionic bonds',
    read: reading(key), angle: angleText(cd),
    legend: electronKey(key).legend,
  };
  if (kind === 'covalent') {
    const bw = bondingWords(key); out.atoms = bw.s + shapeWords(cd) + bw.fam;
    const two = Object.keys(counts(t.els)), ek = electronKey(key).sym, has = (o) => t.adj.some((l) => l.some(([, x]) => x === o));
    // "one from oxygen and one from hydrogen" holds only when every bond joins the two elements, singly
    const mixed = two.length === 2 && t.adj.every((l, i) => l.every(([j, o]) => o === 1 && t.els[j] !== t.els[i]));
    const multi = has(2) && has(3) ? '; a double bond is two shared pairs and a triple bond three'
      : has(2) ? '; a double bond is two shared pairs' : has(3) ? '; a triple bond is three shared pairs' : '';
    out.electrons = (mixed
      ? `Each covalent bond is a shared pair of electrons, one from ${nameOf(two[0])} (${ek[two[0]]}) and one from ${nameOf(two[1])} (${ek[two[1]]}).`
      : `Each covalent bond is a shared pair of electrons, one from each atom${multi}.`)
      + lonePairWords(key)
      + (t.els.includes('H') ? ' Each atom now has a full outer shell: eight electrons, or two for hydrogen.' : ' Each atom now has a full outer shell of eight electrons.');
  } else if (kind === 'covalent-metal') {
    out.atoms = `Aluminium is a metal, but the bonds in aluminium chloride are mostly covalent: aluminium (valency 3) forms a single covalent bond with each chlorine atom (valency 1).` + shapeWords(cd);
    out.electrons = `Each covalent bond is a shared pair of electrons, one from aluminium (×) and one from chlorine (•).` + lonePairWords(key)
      + ' Each chlorine atom has a full outer shell of eight electrons, but aluminium has only six.';
  } else {
    const { cat, ani } = ionsOf(key), oh = kind === 'ionic-oh';
    const mName = nameOf(cat.el);
    let s = oh
      ? `${cap(mName)} (a metal) forms ${mName} ions, ${cat.sym}. A hydroxide ion, OH⁻, is an oxygen atom and a hydrogen atom joined by a covalent bond, with one extra electron.`
      : `${cap(mName)} (a metal) and ${nameOf(ani.el)} (a non-metal) form ions: ${cat.sym} and ${ani.sym}.`;
    s += ' The oppositely charged ions attract strongly: this is ionic bonding.';
    if (cat.n !== 1 || ani.n !== 1) s += cat.n === 1
      ? ` One ${cat.sym} ion balances the charge of ${WORD[ani.n]} ${ani.sym} ions.`
      : ` ${cap(WORD[cat.n])} ${cat.sym} ions (${cat.n * cat.q}+) balance ${WORD[ani.n]} ${ani.sym} ion${ani.n > 1 ? 's' : ''} (${ani.n * ani.q}−).`;
    s += ' In the solid, the ions form a giant ionic lattice.';
    out.atoms = s;
    const ek = electronKey(key).sym, lose = `${WORD[cat.q]} electron${cat.q > 1 ? 's' : ''}`;
    // where the electrons go: to one partner, one to each of several, or (Al₂O₃, Fe₂O₃) shared out across the lattice
    const goes = oh ? (cat.q === 1 ? ' to a hydroxide group' : ', one to each hydroxide group')
      : cat.n === 1 && ani.n === 1 ? ` to ${an(nameOf(ani.el))} atom`
      : cat.n === 1 && ani.q === 1 ? `, one to each ${nameOf(ani.el)} atom`
      : ani.n === 1 ? ` to the ${nameOf(ani.el)} atom` : '';
    out.electrons = oh
      ? `Each ${mName} atom loses ${lose} (${ek[cat.el]})${goes}. Inside the hydroxide ion, oxygen (${ek.O}) and hydrogen (${ek.H}) share a pair of electrons: a covalent bond.`
      : `Each ${mName} atom loses ${lose} (${ek[cat.el]})${goes}. Each ${ani.name} ion then has a full outer shell of eight electrons${NOBLE_ION.has(cat.el) ? `, and so does each ${mName} ion` : ''}.`;
  }
  return out;
}

/* ---------- WHICH MARK STANDS FOR WHOSE ELECTRONS ----------
   Hydrogen's are crosses (as in every textbook water); a metal's are crosses
   too, or rings beside hydrogen; every other atom takes dots, then the next
   free mark. Each mark is drawn in its element's colour. */
const MARKS = ['•', '×', '○', '■'];
function electronKey(key) {
  const t = T(key), c = counts(t.els), sym = {}, used = new Set();
  const take = (el, prefs) => { const m = prefs.find((p) => !used.has(p)); sym[el] = m; used.add(m); };
  if (c.H) take('H', ['×']);
  for (const el of Object.keys(c)) if (isMetal(el)) take(el, ['×', '○', '■']);
  for (const tk of tokens(t.formula)) for (const el of tk.group ? tokens(tk.group).map((y) => y.el) : [tk.el])
    if (!sym[el]) take(el, ['•', '×', '○', '■']);
  for (const el of Object.keys(c)) if (!sym[el]) take(el, MARKS);
  const order = Object.keys(sym).sort((a, b) => MARKS.indexOf(sym[a]) - MARKS.indexOf(sym[b]));
  return { sym, legend: order.map((el) => [sym[el], el, nameOf(el)]) };
}

/* ---------- THE REAL SHAPE ----------
   Each atom's electron pairs (its bonds, a double or triple bond counting
   once, and its lone pairs) spread as far apart as they can: two in a line,
   three flat at 120 degrees, four at the corners of a tetrahedron. Lone
   pairs push a little harder, so water closes to 104.5 and ammonia to 107
   (the textbook values). A chain is drawn staggered, a double bond flat. */
const D = Math.PI / 180;
const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const subv = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => mul(a, 1 / (len(a) || 1));
function perpTo(a, hint) {
  let r = subv(hint, mul(a, dot(hint, a)));
  if (len(r) < 1e-6) r = subv(Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], mul(a, Math.abs(a[0]) < 0.9 ? a[0] : a[1]));
  return nrm(r);
}
function pairsOf(t, i) {
  const metal = isMetal(t.els[i]) && t.els[i] !== 'Al';
  const lp = metal ? 0 : lonePairs(t, i), k = t.adj[i].length, sn = Math.min(4, k + lp);
  const theta = sn === 4 ? (lp === 2 ? 104.5 : lp === 1 ? 107 : 109.47) : sn === 3 ? 120 : 180;
  return { k, lp, sn, theta };
}
function shape3d(key) {
  const t = T(key), n = t.els.length, P = new Array(n).fill(null);
  let r0 = 0; for (let i = 1; i < n; i++) if (t.adj[i].length > t.adj[r0].length) r0 = i;
  P[r0] = v3();
  // the root's bonds, symmetric about straight down
  {
    const { k, sn, theta } = pairsOf(t, r0), nb = t.adj[r0].map(([j]) => j);
    let dirs;
    if (k === 1) dirs = [[1, 0, 0]];
    else if (sn === 2 || theta === 180) dirs = [[-1, 0, 0], [1, 0, 0]];
    else if (k === 2) { const h = theta / 2 * D; dirs = [[-Math.sin(h), -Math.cos(h), 0], [Math.sin(h), -Math.cos(h), 0]]; }
    else if (k === 3 && sn === 3) dirs = [90, 210, 330].map((a) => [Math.cos(a * D), Math.sin(a * D), 0]);
    else if (k === 3) { const b = Math.asin(Math.sqrt((1 - Math.cos(theta * D)) / 1.5)); dirs = [90, 210, 330].map((a) => [Math.sin(b) * Math.cos(a * D), -Math.cos(b), Math.sin(b) * Math.sin(a * D)]); }
    else { const s = 1 / Math.sqrt(3); dirs = [[s, s, s], [s, -s, -s], [-s, s, -s], [-s, -s, s]]; }
    nb.forEach((j, x) => { P[j] = dirs[x]; });
  }
  // then outward, each atom's other bonds set from the bond it was reached by
  const parent = new Array(n).fill(-1), q = [];
  for (const [j] of t.adj[r0]) { parent[j] = r0; q.push(j); }
  for (let qi = 0; qi < q.length; qi++) {
    const u = q[qi], p = parent[u], kids = t.adj[u].map(([j]) => j).filter((j) => j !== p && !P[j]);
    if (!kids.length) continue;
    const { sn, theta } = pairsOf(t, u), a = nrm(subv(P[p], P[u]));
    // the reference: another of the parent's neighbours, so a chain runs anti (zigzag) and a double bond stays flat
    const other = t.adj[p].map(([j]) => j).find((j) => j !== u && P[j]);
    const r = perpTo(a, other != null ? subv(P[other], P[p]) : [0, 0, 1]), s = crs(a, r);
    const slots = Math.max(1, sn - 1);
    const place = (off) => kids.map((j, x) => {
      if (sn <= 2) return add(P[u], mul(a, -1));
      const phi = Math.PI + off + x * 2 * Math.PI / slots;
      return add(P[u], nrm(add(mul(a, Math.cos(theta * D)), mul(add(mul(r, Math.cos(phi)), mul(s, Math.sin(phi))), Math.sin(theta * D)))));
    });
    // anti first, then flat the other way (syn), then the staggered turns: the first that keeps clear of what is placed
    const clear = (pts) => Math.min(9, ...pts.flatMap((pt) => P.filter((o, i) => o && i !== u).map((o) => len(subv(pt, o)))));
    let best = null;
    for (const off of [0, Math.PI, 2 * Math.PI / 3, -2 * Math.PI / 3, Math.PI / 3, -Math.PI / 3]) {
      const pts = place(off), c = clear(pts);
      if (!best || c > best.c + 1e-6) best = { pts, c };
      if (c >= 1.55) break;
    }
    kids.forEach((j, x) => { P[j] = best.pts[x]; parent[j] = u; q.push(j); });
  }
  // the angle a card names, at the root, between two of its neighbours (alike and at the ends, where there are such)
  const cd = card0(key);
  let arc = null;
  if (cd.angle != null && covalent(key)) {
    const nb = t.adj[r0].map(([j]) => j), end = (j) => t.adj[j].length === 1;
    let pick = null;
    for (const a of nb) for (const b of nb) if (!pick && a < b && end(a) && end(b) && t.els[a] === t.els[b]) pick = [a, b];
    if (!pick) for (const a of nb) for (const b of nb) if (!pick && a < b && end(a) && end(b)) pick = [a, b];
    arc = [r0, ...(pick || nb.slice(0, 2))];
  }
  // turn it to be seen: the named angle flat to the eye and opening downward, as in a textbook; else its widest face
  const mid = mul(P.reduce(add, v3()), 1 / n), Q = P.map((p) => subv(p, mid));
  let X, Y, Z;
  if (arc) {
    const u1 = nrm(subv(P[arc[1]], P[arc[0]])), u2 = nrm(subv(P[arc[2]], P[arc[0]]));
    let w = add(u1, u2);
    if (len(w) < 1e-3) w = perpTo(u1, [0, -1, 0.0001]);
    w = nrm(w); Y = mul(w, -1); X = perpTo(Y, subv(u2, u1)); Z = crs(X, Y);
    // what is not on the angle comes toward the eye
    if (P.reduce((s2, p, i) => s2 + (arc.includes(i) ? 0 : dot(subv(p, P[arc[0]]), Z)), 0) < -1e-6) { X = mul(X, -1); Z = mul(Z, -1); }
  } else {
    [X, Y, Z] = axes(Q);
  }
  let pts = Q.map((p) => [dot(p, X), dot(p, Y), dot(p, Z)]);
  // a slight turn so the depth reads
  const yaw = arc ? 0.22 : 0.4, pitch = arc ? 0.12 : 0.28;
  pts = pts.map(([x, y, z]) => { const x1 = x * Math.cos(yaw) + z * Math.sin(yaw), z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
    return [x1, y * Math.cos(pitch) - z1 * Math.sin(pitch), y * Math.sin(pitch) + z1 * Math.cos(pitch)]; });
  const bonds = []; t.adj.forEach((l, i) => l.forEach(([j, o]) => { if (i < j) bonds.push([i, j, o]); }));
  return { els: t.els.slice(), p: pts, bonds, arc };
}
// principal axes, widest first (Jacobi on the 3x3 spread)
function axes(Q) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of Q) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) A[i][j] += p[i] * p[j];
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 30; sweep++) for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
    if (Math.abs(A[p][q]) < 1e-12) continue;
    const th = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]), c = Math.cos(th), s = Math.sin(th);
    for (let k = 0; k < 3; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
    for (let k = 0; k < 3; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
    for (let k = 0; k < 3; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
  }
  const ev = [0, 1, 2].map((i) => ({ l: A[i][i], v: [V[0][i], V[1][i], V[2][i]] })).sort((a, b) => b.l - a.l);
  const X = nrm(ev[0].v), Y = nrm(ev[1].v);
  return [X, Y, crs(X, Y)];
}

/* ---------- THE FLAT LAYOUT FOR THE DIAGRAM ----------
   The displayed formula's grid (bonds at right angles), as model.js lays it
   out, or, where that comes out cramped, the best of a few hundred other
   grid layouts: the one whose shells can be drawn largest in the space the
   card gives. Lengths in shell radii: a bond is its two shells less their
   overlap; hydrogen's shell is smaller. */
const OV = 0.42, radOf = (el) => (el === 'H' ? 0.72 : 1);
const flatCache = {};
function flatLayout(key, aspect) {
  const ck = key + '|' + aspect.toFixed(2);
  if (flatCache[ck]) return flatCache[ck];
  const t = T(key), n = t.els.length, L = M.layoutMolecule(key);
  let seed = 0; for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let x = seed; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const VEC = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const tryOne = (k) => {
    const g = new Array(n).fill(null), from = new Array(n).fill(-1), taken = new Set();
    let r0;
    if (k === 0) { g.forEach((_, i) => { g[i] = [L.atoms[i].x, L.atoms[i].y]; }); }
    else {
      const heavy = t.els.map((e, i) => i).filter((i) => t.els[i] !== 'H');
      r0 = heavy[Math.floor(rnd() * heavy.length)]; g[r0] = [0, 0]; taken.add('0,0');
      const q = [r0];
      for (let qi = 0; qi < q.length; qi++) {
        const u = q[qi];
        let prefs = VEC.slice().sort(() => rnd() - 0.5);
        if (from[u] >= 0 && rnd() < 0.7) { const dx = g[u][0] - g[from[u]][0], dy = g[u][1] - g[from[u]][1]; prefs = [[dx, dy], ...prefs.filter(([a, b]) => a !== dx || b !== dy)]; }
        for (const [v] of t.adj[u].slice().sort(() => rnd() - 0.5)) {
          if (g[v]) continue;
          const pick = prefs.find(([a, b]) => !taken.has((g[u][0] + a) + ',' + (g[u][1] + b)));
          if (!pick) return null;
          g[v] = [g[u][0] + pick[0], g[u][1] + pick[1]]; taken.add(g[v].join(',')); from[v] = u; q.push(v);
        }
      }
    }
    // real lengths, walked out from atom 0
    const P = new Array(n).fill(null); P[0] = [0, 0]; const q = [0];
    for (let qi = 0; qi < q.length; qi++) {
      const u = q[qi];
      for (const [v] of t.adj[u]) {
        if (P[v]) continue;
        const d = radOf(t.els[u]) + radOf(t.els[v]) - OV;
        P[v] = [P[u][0] + (g[v][0] - g[u][0]) * d, P[u][1] + (g[v][1] - g[u][1]) * d]; q.push(v);
      }
    }
    // an end atom that crowds a neighbour it is not bonded to swings a little round its partner (propanone's hydrogens beside the O)
    const bonded = (i, j) => t.adj[i].some(([x]) => x === j), gapOf = (i, j) => Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]) - radOf(t.els[i]) - radOf(t.els[j]);
    for (let it = 0; it < 40; it++) {
      let moved = false;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (i === j || bonded(i, j) || t.adj[i].length !== 1 || gapOf(i, j) >= 0.03) continue;
        const c = P[t.adj[i][0][0]], a0 = Math.atan2(P[i][1] - c[1], P[i][0] - c[0]), r = Math.hypot(P[i][0] - c[0], P[i][1] - c[1]);
        const at = (a) => [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
        const plus = at(a0 + 0.04), minus = at(a0 - 0.04);
        P[i] = plus; const gp = gapOf(i, j); P[i] = minus; const gm = gapOf(i, j);
        P[i] = gp >= gm ? plus : minus; moved = true;
      }
      if (!moved) break;
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (!bonded(i, j) && gapOf(i, j) < -0.02) return null;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    P.forEach(([x, y], i) => { const r = radOf(t.els[i]); x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r); });
    return { P, box: [x0, x1, y0, y1], score: Math.min(aspect / (x1 - x0), 1 / (y1 - y0)) };
  };
  let best = tryOne(0);
  for (let k = 1; k < 400; k++) { const c = tryOne(k); if (c && (!best || c.score > best.score * 1.08)) best = c; }
  return (flatCache[ck] = best);
}

/* ---------- THE DOT-AND-CROSS DIAGRAM ----------
   Covalent: each atom's outer shell a circle, laid out as the displayed
   formula (model.js's grid); a bond is where two circles overlap, holding its
   shared pairs; lone pairs sit on the shell. Ionic: each ion in square
   brackets with its charge; a non-metal's ion shows its full outer shell. */
function drawElectrons(ctx, key, cx, cy, maxW, maxH, colourOf, font = 'Inter, sans-serif') {
  const ek = electronKey(key).sym, ink = 'rgba(255,255,255,0.45)';
  const mark = (m, el, x, y, R) => {
    const col = colourOf(el); ctx.fillStyle = col; ctx.strokeStyle = col;
    if (m === '•') { ctx.beginPath(); ctx.arc(x, y, 0.075 * R, 0, Math.PI * 2); ctx.fill(); }
    else if (m === '×') { const k = 0.075 * R; ctx.lineWidth = Math.max(1.6, 0.04 * R); ctx.beginPath(); ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k); ctx.stroke(); }
    else if (m === '○') { ctx.lineWidth = Math.max(1.4, 0.035 * R); ctx.beginPath(); ctx.arc(x, y, 0.07 * R, 0, Math.PI * 2); ctx.stroke(); }
    else { const k = 0.065 * R; ctx.fillRect(x - k, y - k, 2 * k, 2 * k); }
  };
  const pair = (el1, el2, x, y, tx, ty, R, gap = 0.14) => { mark(ek[el1], el1, x - tx * gap * R, y - ty * gap * R, R); mark(ek[el2], el2, x + tx * gap * R, y + ty * gap * R, R); };
  const label = (el, x, y, size) => { ctx.font = `700 ${Math.round(size)}px ${font}`; ctx.fillStyle = colourOf(el); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(el, x, y + 1); };
  if (covalent(key)) {
    const t = T(key), { P, box: [x0, x1, y0, y1] } = flatLayout(key, maxW / maxH);
    const R = Math.min(maxW / (x1 - x0), maxH / (y1 - y0), 46), ox = cx - (x0 + x1) / 2 * R, oy = cy - (y0 + y1) / 2 * R;
    const S = P.map(([x, y]) => [ox + x * R, oy + y * R]);
    ctx.lineWidth = 1.5; ctx.strokeStyle = ink;
    const rad = (i) => radOf(t.els[i]);
    S.forEach(([x, y], i) => { ctx.beginPath(); ctx.arc(x, y, rad(i) * R, 0, Math.PI * 2); ctx.stroke(); });
    // the shared pairs, in each overlap, across the bond
    t.adj.forEach((l, i) => l.forEach(([j, o]) => {
      if (j < i) return;
      const ux = (S[j][0] - S[i][0]), uy = (S[j][1] - S[i][1]), d = Math.hypot(ux, uy), nx = -uy / d, ny = ux / d;
      const m = (rad(i) * R + d - rad(j) * R) / 2, px = S[i][0] + ux / d * m, py = S[i][1] + uy / d * m;
      if (o === 1) { pair(t.els[i], t.els[j], px, py, nx, ny, R, 0.14); return; }
      // a double or triple bond: each atom's electrons in a short column on its own side of the overlap
      const ax = ux / d * 0.085 * R, ay = uy / d * 0.085 * R, step = (o === 2 ? 0.2 : 0.17) * R;
      for (let p = 0; p < o; p++) {
        const off = (p - (o - 1) / 2) * step;
        mark(ek[t.els[i]], t.els[i], px - ax + nx * off, py - ay + ny * off, R);
        mark(ek[t.els[j]], t.els[j], px + ax + nx * off, py + ay + ny * off, R);
      }
    }));
    // lone pairs on the shell: an end atom's spread round the far side; any other's in its free directions
    t.els.forEach((el, i) => {
      const k = lonePairs(t, i); if (!k) return;
      const dirs = t.adj[i].map(([j]) => Math.atan2(S[j][1] - S[i][1], S[j][0] - S[i][0]));
      let at;
      if (dirs.length === 1) at = Array.from({ length: k }, (_, x) => dirs[0] + Math.PI + (x - (k - 1) / 2) * 2 * Math.PI / (k + 1));
      else {
        const free = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map((a) => ({ a, d: Math.min(...dirs.map((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))))) }))
          .filter((f) => f.d > 0.3).sort((f, g) => g.d - f.d || (f.a === -Math.PI / 2 ? -1 : 1));
        at = free.slice(0, k).map((f) => f.a);
      }
      const r = rad(i) * R;
      for (const a of at) pair(el, el, S[i][0] + Math.cos(a) * r, S[i][1] + Math.sin(a) * r, -Math.sin(a), Math.cos(a), R, 0.13);
    });
    S.forEach(([x, y], i) => label(t.els[i], x, y, (t.els[i] === 'H' ? 0.4 : 0.48) * R));
    ctx.textAlign = 'left';
    return;
  }
  // ionic: [cation] then [anion], each once, with how many in front
  const { cat, ani } = ionsOf(key), oh = ani.el === 'OH';
  const unitW = { cat: 1.5, ani: oh ? 3.35 : 2.6 }, coefW = 0.7, gapW = 0.7;
  const totalW = (cat.n > 1 ? coefW : 0) + unitW.cat + gapW + (ani.n > 1 ? coefW : 0) + unitW.ani;
  const R = Math.min(maxW / totalW, maxH / 2.7, 40);
  let x = cx - totalW * R / 2;
  const bracket = (xl, xr, charge) => {
    const h = 1.2 * R, k = 0.14 * R; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(xl + k, cy - h); ctx.lineTo(xl, cy - h); ctx.lineTo(xl, cy + h); ctx.lineTo(xl + k, cy + h);
    ctx.moveTo(xr - k, cy - h); ctx.lineTo(xr, cy - h); ctx.lineTo(xr, cy + h); ctx.lineTo(xr - k, cy + h); ctx.stroke();
    ctx.font = `700 ${Math.round(0.42 * R)}px ${font}`; ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(charge, xr + 0.06 * R, cy - h + 0.1 * R);
  };
  const coef = (k) => { if (k < 2) return; ctx.font = `700 ${Math.round(0.6 * R)}px ${font}`; ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(k), x + coefW * R / 2 - 0.1 * R, cy + 1); x += coefW * R; };
  coef(cat.n);
  bracket(x + 0.1 * R, x + unitW.cat * R - 0.3 * R, (cat.q > 1 ? cat.q : '') + '+');
  label(cat.el, x + (unitW.cat - 0.2) * R / 2, cy, 0.56 * R);
  x += (unitW.cat + gapW) * R;
  coef(ani.n);
  if (!oh) {
    const ox = x + unitW.ani * R / 2 - 0.12 * R;
    ctx.lineWidth = 1.5; ctx.strokeStyle = ink; ctx.beginPath(); ctx.arc(ox, cy, R, 0, Math.PI * 2); ctx.stroke();
    // eight in four pairs; the gained ones each the second of a pair
    [-Math.PI / 2, 0, Math.PI / 2, Math.PI].forEach((a, p) => {
      const second = p >= 4 - ani.q ? cat.el : ani.el;
      pair(ani.el, second, ox + Math.cos(a) * R, cy + Math.sin(a) * R, -Math.sin(a), Math.cos(a), R, 0.13);
    });
    label(ani.el, ox, cy, 0.48 * R);
    bracket(ox - R - 0.18 * R, ox + R + 0.18 * R, (ani.q > 1 ? ani.q : '') + '−');
  } else {
    const ox = x + 1.15 * R, hx = ox + (1 + 0.72 - 0.42) * R, rh = 0.72 * R;
    ctx.lineWidth = 1.5; ctx.strokeStyle = ink;
    ctx.beginPath(); ctx.arc(ox, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(hx, cy, rh, 0, Math.PI * 2); ctx.stroke();
    const mx = (ox + R + hx - rh) / 2;
    pair('O', 'H', mx, cy, 0, 1, R, 0.14);
    [-Math.PI / 2, Math.PI, Math.PI / 2].forEach((a, p) => {
      pair('O', p === 1 ? cat.el : 'O', ox + Math.cos(a) * R, cy + Math.sin(a) * R, -Math.sin(a), Math.cos(a), R, 0.13);
    });
    label('O', ox, cy, 0.48 * R); label('H', hx, cy, 0.4 * R);
    bracket(ox - R - 0.18 * R, hx + rh + 0.18 * R, '−');
  }
  ctx.textAlign = 'left';
}

return { card, shape3d, drawElectrons, electronKey, lonePairs };
}));
