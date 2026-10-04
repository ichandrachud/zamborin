/* ============================================================
   Litmus in 3D · the Reactor's "What just happened" cards

   After a won Reactor level, a card for each reaction it took (owner,
   2026-10-03: a teacher's favourite; textbook words, never the game's). Each
   card: the topic; the word and the balanced equation (a plain arrow: the
   agent is the player's to work out, so it is named only after); the atoms
   counted on each side; what the agent did; one line from the real world.
   Every real-world line here is from a source in iCloud
   `Zamborin/Game Briefs/3D-IDEAS/LITMUS_REACTOR_AGENTS.md` (the row is given);
   a reaction with no line here shows none. A reaction that goes as its
   molecules meet takes its words from lab.js, as the 2D game does.
   ============================================================ */
(function (root) {
  const X = root.ReactorChem, LAB = root.ChemLab;
  // what each agent does, in a textbook's words
  const JOB = {
    catalyst: (name) => `${name} is a catalyst: it increases the rate of reaction without being used up.`,
    decompose: 'Heat breaks the compound down into simpler substances: this is thermal decomposition.',
    heat: 'Heat gives the particles enough energy to react.',
    warm: 'A school lab warms this reaction: heat makes it go faster.',
    spark: 'A spark gives the energy to start the reaction; the energy it gives out keeps it going.',
    light: 'Light gives the energy that starts the reaction.',
    electricity: 'An electric current splits the compound: this is electrolysis.',
    none: 'No agent: these react as soon as they meet.',
    // the Carbon Chamber's (iCloud 3D-IDEAS/LITMUS_CARBON_AGENTS.md: each as a school lab or industry really does it)
    oxidiser: 'The oxidising agent, acidified potassium dichromate(VI), gives the oxygen, written [O]. It turns from orange to green as it is used up.',
    nickel: 'Nickel is a catalyst: it increases the rate of reaction without being used up. The mixture is heated to about 150 °C.',
    phosphoric: 'Phosphoric acid is the catalyst: it increases the rate of reaction without being used up. Industry uses steam at 300 °C and 60–70 atmospheres.',
    sulphuric: 'A few drops of concentrated sulphuric acid are the catalyst, and the mixture is warmed.',
    dilute: 'A dilute acid is the catalyst, and the mixture is heated under reflux.',
    reflux: 'The mixture is heated under reflux: it boils, and its vapour cools and drips back, so nothing escapes.',
  };
  // per reaction: its topic, which of the agent's jobs, and a line from the real world (research row)
  const CARD = {
    'haber':                     { topic: 'Catalysts', world: 'This is the Haber process, used in industry to make ammonia, mostly for fertilisers.' },                       // 1
    'steam-reforming':           { topic: 'Catalysts', world: 'This is where the hydrogen for the Haber process comes from: methane and steam.' },                         // 2
    'contact':                   { topic: 'Catalysts', world: 'This is the Contact process, the main step in making sulphuric acid.' },                                     // 3
    'peroxide':                  { topic: 'Catalysts', world: 'Hydrogen peroxide breaks down slowly on its own; the catalyst makes it fast.' },                             // 4
    'converter':                 { topic: 'Catalysts', world: 'This happens in a car’s catalytic converter, which turns harmful exhaust gases into nitrogen and carbon dioxide.' },  // 6
    'limestone':                 { topic: 'Thermal decomposition', job: 'decompose', world: 'This is how quicklime is made from limestone, in a lime kiln.' },          // 7
    'copper-carbonate':          { topic: 'Thermal decomposition', job: 'decompose', world: 'Green copper(II) carbonate turns black as it becomes copper(II) oxide.' },  // 8
    'zinc-carbonate':            { topic: 'Thermal decomposition', job: 'decompose', world: 'Zinc oxide is yellow while it is hot and white when it cools.' },          // 9
    'magnesium-carbonate':       { topic: 'Thermal decomposition', job: 'decompose', world: 'Group 2 carbonates break down on heating, magnesium’s more easily than calcium’s.' }, // 10
    'baking-soda':               { topic: 'Thermal decomposition', job: 'decompose', world: 'This is how baking soda on its own raises a cake: the carbon dioxide makes it rise.' }, // 11
    'sal-ammoniac':              { topic: 'Reversible reactions', job: 'decompose', world: 'It is reversible: as the two gases cool, they join up again into white ammonium chloride.' }, // 12
    'copper-from-oxide':         { topic: 'Reduction', job: 'heat', world: 'Hydrogen takes the oxygen away from copper(II) oxide, leaving the metal: this is reduction.' },  // 13
    'magnesium-and-copper-oxide':{ topic: 'Reactivity', job: 'heat', world: 'Magnesium is more reactive than copper, so it takes copper’s oxygen.' },                // 14
    'blast-furnace':             { topic: 'Extracting metals', job: 'heat', world: 'This is how iron is made from its ore in a blast furnace.' },                         // 15
    'hydrogen-burns':            { topic: 'Combustion', world: 'This is the squeaky pop of the test for hydrogen.' },                                                     // 16
    'methane-burns':             { topic: 'Combustion', world: 'This is the complete combustion of methane, the main gas in natural gas.' },                              // 17
    'lightning':                 { topic: 'Pollution', world: 'Lightning, and the heat in car engines, make the nitrogen and oxygen in the air react.' },                // 18
    'hydrogen-bromide':          { topic: 'Halogens', world: 'A lighted taper sets the mixture off in a mild explosion.' },                                              // 19
    'hydrogen-chloride':         { topic: 'Halogens', world: 'Hydrogen and chlorine explode when light reaches them, so the mixture is kept out of sunlight.' },          // 20
    'silver-bromide-light':      { topic: 'Light and reactions', world: 'Light splits silver halides: this is how black-and-white photographs were made.' },             // 21
    'silver-chloride-light':     { topic: 'Light and reactions', world: 'Light splits silver halides: this is how black-and-white photographs were made.' },             // 21
    'chlorination':              { topic: 'Substitution', world: 'Ultraviolet light swaps a hydrogen on methane for a chlorine: this is substitution.' },               // 22
    'water-split':               { topic: 'Electrolysis', world: 'Electrolysis of water gives twice as much hydrogen as oxygen.' },                                      // 23
    'brine':                     { topic: 'Electrolysis', world: 'This is how industry makes chlorine, hydrogen and sodium hydroxide from salt water.' },                 // 24
    'copper-chloride-split':     { topic: 'Electrolysis', world: 'Copper forms at the negative electrode, and chlorine bubbles off at the positive one.' },             // 25
    'limewater':                 { topic: 'Testing for gases', world: 'This is the test for carbon dioxide: limewater turns milky.' },                                   // link
    'sulphuric-acid-made':       { topic: 'Acids', world: 'Sulphur trioxide and water make sulphuric acid.' },                                                          // link
    'nitrogen-dioxide':          { topic: 'Pollution', world: 'Colourless nitrogen monoxide turns into brown nitrogen dioxide as it meets oxygen.' },                    // link
    'bleach':                    { topic: 'Halogens', world: 'Chlorine and cold sodium hydroxide make bleach.' },                                                       // link
    'sulphurous-acid':           { topic: 'Acids', world: 'Sulphur dioxide dissolves in water to make an acidic solution.' },                                           // link
    'sulphur-trioxide-and-alkali': { topic: 'Neutralisation' },
    'carbon-dioxide-and-alkali': { topic: 'Neutralisation' },
    'carbon-monoxide-burns':     { topic: 'Combustion', world: 'Carbon monoxide burns with a pale blue flame.' },                                                       // link
    'silver-bromide-falls':      { topic: 'Precipitation', world: 'Silver bromide does not dissolve: it falls out of the liquid as a cream solid.' },
    'silver-chloride-falls':     { topic: 'Precipitation', world: 'Silver chloride does not dissolve: it falls out of the liquid as a white solid.' },
    // the Carbon Chamber's Oxidiser (LITMUS_CARBON_AGENTS.md)
    'methanol-oxidised':         { topic: 'Oxidation' },
    'ethanol-oxidised':          { topic: 'Oxidation', world: 'Wine left open turns to vinegar the same way: bacteria use oxygen from the air.' },
    'propanol-oxidised':         { topic: 'Oxidation' },
    'methanoic-acid-oxidised':   { topic: 'Oxidation', world: 'Methanoic acid is easily oxidised on, all the way to carbon dioxide and water.' },
    'hydrobromic-acid-oxidised': { topic: 'Halogens', world: 'Acidified dichromate is a strong enough oxidising agent to free bromine from a bromide, but not chlorine from a chloride.' },
    'sodium-bromide-oxidised':   { topic: 'Halogens', world: 'Acidified dichromate is a strong enough oxidising agent to free bromine from a bromide, but not chlorine from a chloride.' },
    'potassium-bromide-oxidised':{ topic: 'Halogens', world: 'Acidified dichromate is a strong enough oxidising agent to free bromine from a bromide, but not chlorine from a chloride.' },
  };
  // the atoms of one side, in the order the left side first has them, so the two sides read alike
  function atomsLine(list, order, extra) {
    const c = {};
    for (const [key, n] of list) for (const a of X.SPECIES[key].atoms) c[a.el] = (c[a.el] || 0) + n;
    for (const [el, n] of Object.entries(extra || {})) { c[el] = (c[el] || 0) + n; if (!order.includes(el)) order.push(el); }
    const els = Object.keys(c).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return els.map((el) => `${c[el]} ${el}`).join(', ');
  }
  const count = (out) => { const c = {}; for (const k of out) c[k] = (c[k] || 0) + 1; return Object.entries(c); };
  /* A gas made away from water is named as the gas: hydrogen and chlorine make hydrogen chloride, which is
     hydrochloric acid only once it dissolves (lab.js names its HCl and HBr as the acids, for the bench). */
  const GAS = { 'hydrochloric-acid': 'hydrogen chloride', 'hydrobromic-acid': 'hydrogen bromide' };
  const AS_GAS = new Set(['hydrogen-chloride', 'hydrogen-bromide', 'sal-ammoniac', 'chlorination']);
  const word = (list, id) => list.map(([k]) => (AS_GAS.has(id) && GAS[k]) || X.SPECIES[k].name).join(' + ');
  const sym = (list) => list.map(([k, n]) => (n > 1 ? n : '') + X.SPECIES[k].formula).join(' + ');
  // one reaction as it happened (with the agent that set it off, or none)
  function card(r, agent) {
    const C = CARD[r.id] || {};
    const outs = count(r.out);
    let topic = C.topic, job = null, world = C.world || null;
    if (!agent) {
      const pair = r.id.startsWith('lab:') && r.in.length ? r.in.map(([k]) => k) : null;
      const e = pair && LAB.explain(pair[0], pair[1] || pair[0]);
      if (e) { topic = topic || e.title; world = world || e.words; }
      job = JOB.none;
    } else {
      const A = X.AGENTS[agent];
      if (r.how && JOB[r.how]) job = JOB[r.how];     // the Carbon Chamber's: how a lab really does it
      else if (A.catalyst) job = JOB.catalyst(A.name);
      else if (agent === 'heat') job = r.id.startsWith('lab:') ? JOB.warm : JOB[C.job || 'heat'];
      else job = JOB[agent];
      if (r.id.startsWith('lab:') && !topic) { const e = LAB.explain(r.in[0][0], (r.in[1] || r.in[0])[0]); if (e) { topic = e.title; world = world || e.words; } }
    }
    /* what the agent itself gives (the Oxidiser's oxygen, written [O]; with a bromide, its sulphuric acid too):
       in the equation, the words and the atoms counted, so the two sides still balance */
    const give = r.give ? ` + ${r.give}` : '', giveWords = r.give ? (/H₂SO₄/.test(r.give) ? ' + sulphuric acid + oxygen from the oxidising agent' : ' + oxygen from the oxidising agent') : '';
    return {
      topic: topic || 'Reactions', agent,
      words: `${word(r.in, r.id)}${giveWords} → ${word(outs, r.id)}`,
      equation: `${sym(r.in)}${give} → ${sym(outs)}`,
      atoms: (() => { const order = []; for (const [k] of r.in) for (const a of X.SPECIES[k].atoms) if (!order.includes(a.el)) order.push(a.el);
        const left = atomsLine(r.in, order, r.extra);
        return `${left} on the left${r.give ? ', counting what the oxidising agent gives' : ''}; ${atomsLine(outs, order)} on the right.`; })(),
      mass: 'The same atoms on each side, only rearranged: this is conservation of mass.',
      job, world,
      tab: sym(outs).replace(/ \+ /g, '+').slice(0, 14),
    };
  }
  root.ReactorCards = { card, CARD, JOB };
}(typeof self !== 'undefined' ? self : this));
