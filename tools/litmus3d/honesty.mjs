// What happens in real life that the game must either have or keep out of a level: shared by the Reactor's and the
// Carbon Chamber's level checks (tools/litmus3d/reactor-levels.mjs, carbon-levels.mjs). Sources: iCloud
// Zamborin/Game Briefs/3D-IDEAS/LITMUS_REACTOR_AGENTS.md and LITMUS_CARBON_AGENTS.md.
export function honesty(C) {
  /* ---------- WHAT AN AGENT COULD REALLY DO ----------
     For honest decoys: true if this agent would set something off among these
     molecules in real life (whether or not the game has that reaction). */
  const S = C.SPECIES, tags = (k) => (S[k] && S[k].tags) || [];
  const any = (have, ...ks) => ks.some((k) => have.has(k));
  const anyTag = (have, ...ts) => [...have].some((k) => ts.some((t) => tags(k).includes(t)));
  const fuel = (h) => any(h, 'hydrogen', 'methane', 'carbon-monoxide');
  const COULD = {
    heat: (h) => anyTag(h, 'ammonium', 'hydrogencarbonate') ||
      [...h].some((k) => tags(k).includes('carbonate') && !['sodium-carbonate', 'potassium-carbonate'].includes(k)) ||
      any(h, 'hydrogen-peroxide', 'copper-hydroxide', 'zinc-hydroxide', 'magnesium-hydroxide', 'sodium-nitrate', 'potassium-nitrate', 'calcium-nitrate', 'magnesium-nitrate', 'copper-nitrate', 'zinc-nitrate') ||
      (fuel(h) && any(h, 'oxygen')) || (any(h, 'nitrogen') && any(h, 'oxygen')) ||
      (any(h, 'copper-oxide') && any(h, 'hydrogen', 'carbon-monoxide', 'magnesium', 'zinc')) ||
      (any(h, 'iron-oxide') && any(h, 'carbon-monoxide')) || (any(h, 'magnesium', 'zinc', 'iron', 'copper') && any(h, 'oxygen', 'chlorine')) ||
      anyTag(h, 'oxide') && anyTag(h, 'acid') || any(h, 'silver-nitrate'),
    electricity: (h) => [...h].some((k) => tags(k).some((t) => ['salt', 'acid', 'base', 'strong-base'].includes(t))),
    light: (h) => (any(h, 'chlorine', 'bromine') && any(h, 'hydrogen', 'methane')) || any(h, 'silver-bromide', 'silver-chloride', 'silver-nitrate', 'hydrogen-peroxide', 'nitric-acid'),
    spark: (h) => (fuel(h) && any(h, 'oxygen', 'chlorine', 'bromine')) || (any(h, 'nitrogen') && any(h, 'oxygen')),
    platinum: (h) => any(h, 'hydrogen-peroxide') || (any(h, 'hydrogen', 'methane', 'carbon-monoxide', 'ammonia', 'sulphur-dioxide') && any(h, 'oxygen')) || (any(h, 'carbon-monoxide') && any(h, 'nitrogen-monoxide')),
    iron: (h) => (any(h, 'nitrogen') && any(h, 'hydrogen')) || any(h, 'hydrogen-peroxide'),
    nickel: (h) => any(h, 'methane') && any(h, 'water'),
    vanadium: (h) => any(h, 'sulphur-dioxide') && any(h, 'oxygen'),
    manganese: (h) => any(h, 'hydrogen-peroxide'),
  };
  /* Pairs that react in real life but that the game does not have: never in a
     level together. lab.js takes molecules two at a time, so a metal with a
     one-hydrogen acid, an alkali with carbon dioxide, and the like are left out. */
  function realButMissing(a, b) {
    // the game has it: not missing
    if (C.reactionIn([a, b], null) || C.REACTIONS.some((r) => !r.agent && r.in.some(([k]) => k === a) && r.in.some(([k]) => k === b))) return false;
    const pair = (p, q) => (p(a) && q(b)) || (p(b) && q(a));
    const is = (...ks) => (k) => ks.includes(k);
    const t = (x) => (k) => tags(k).includes(x);
    return pair(is('magnesium', 'zinc', 'iron'), t('acid')) ||
      pair(t('strong-base'), is('carbon-dioxide', 'sulphur-dioxide', 'sulphur-trioxide', 'chlorine')) ||
    // bromine and a strong alkali: bromide and bromate(V) at room temperature (Chemguide), 3 Br2 to 6 NaOH, more than a sphere holds
    pair(t('strong-base'), is('bromine')) ||
      pair(t('strong-base'), (k) => /^(copper|zinc|magnesium|iron)-/.test(k) && tags(k).includes('salt')) ||
      pair(is('nitrogen-monoxide'), is('oxygen')) || pair(is('sulphur-dioxide'), is('water')) ||
      pair(is('silver-nitrate'), (k) => !/^silver/.test(k) && (tags(k).includes('chloride') || /bromide/.test(k))) ||
      pair(is('nitrogen-dioxide'), is('water')) ||
      pair(is('sulphur-trioxide'), t('base'));
  }
  return { COULD, realButMissing };
}
