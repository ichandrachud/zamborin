/* ============================================================
   Litmus in 3D · the Moleculator's "What you built" cards

   One entry per molecule a Moleculator level asks for (56). The card's own
   words are a science textbook's (owner, 2026-10-03: "don't say hands, use
   scientific text book language"). Each entry:
     name   the textbook name, where it differs from the game's (the game's
            own name is given after it, "also called ...")
     kind   'covalent'; 'ionic'; 'ionic-oh' (ionic, with the covalent O–H
            inside each hydroxide ion); 'covalent-metal' (a metal compound
            whose bonds are largely covalent)
     shape  the shape, in a textbook's words (covalent only)
     angle  the bond angle in degrees, where a textbook gives one (about: the
            textbook's 120 where the measured angle is a little smaller)
     group, family  for a formula written to show its groups (CH₃COOH): the
            group it shows and the family that group makes it
     fact   one everyday fact, each checked against a source on 2026-10-03
            (Zamborin/Game Briefs/3D-IDEAS/LITMUS_MOLECULE_FACTS.md, in iCloud)
   ============================================================ */
window.LITMUS3D_CARDS = {
  'hydrogen-gas':         { kind: 'covalent', shape: 'linear', fact: 'The lightest gas: with only 7% of the density of air, it once lifted balloons and airships.' },
  'water':                { kind: 'covalent', shape: 'bent', angle: 104.5, fact: 'Water is the only common substance found naturally on Earth as a solid, a liquid and a gas.' },
  'salt':                 { kind: 'ionic', fact: 'Table salt. Seawater tastes salty because sodium chloride is dissolved in it.' },
  'hydrogen-chloride':    { kind: 'covalent', shape: 'linear', fact: 'Dissolved in water it is hydrochloric acid; your stomach makes this acid to help digest food.' },
  'magnesium-oxide':      { kind: 'ionic', fact: 'Magnesium burns with a dazzling white flame and leaves this white powder behind.' },
  'magnesium-chloride':   { kind: 'ionic', fact: 'One of the salts dissolved in seawater; melted and electrolysed, it gives magnesium metal.' },
  'hydrogen-fluoride':    { kind: 'covalent', shape: 'linear', fact: 'Dissolved in water it eats into glass, so it is used to etch and frost glass.' },
  'calcium-chloride':     { kind: 'ionic', fact: 'Spread on icy roads, it melts ice even in very cold weather.' },
  'calcium-oxide':        { kind: 'ionic', fact: 'Quicklime: made by heating limestone, and used in large amounts to make steel.' },
  'sodium-hydroxide':     { kind: 'ionic-oh', fact: 'A strong alkali used to make soap and to clear blocked drains.' },
  'hydrogen-peroxide':    { kind: 'covalent', shape: 'non-planar, bent at each oxygen', fact: 'A bleach and disinfectant; it slowly breaks down into water and oxygen.' },
  'calcium-hydroxide':    { kind: 'ionic-oh', fact: 'Slaked lime. Its solution, limewater, turns milky when carbon dioxide bubbles through it.' },
  'ammonia':              { kind: 'covalent', shape: 'trigonal pyramidal', angle: 107, fact: 'Made from nitrogen and hydrogen in the Haber process, mostly to make fertilisers.' },
  'iron-chloride':        { name: 'Iron(III) chloride', kind: 'ionic', fact: 'Used to etch copper circuit boards and to help clean drinking water.' },
  'aluminium-chloride':   { kind: 'covalent-metal', fact: 'Its hydrated form is used in some strong antiperspirants.' },
  'hydrazine':            { kind: 'covalent', shape: 'trigonal pyramidal around each nitrogen', fact: 'A rocket fuel: it powers the small thrusters that steer many satellites.' },
  'nitrous-acid':         { kind: 'covalent', shape: 'planar, bent at the nitrogen and at the O–H oxygen', fact: 'Too unstable to keep in a bottle: it is made fresh, in solution, when it is needed.' },
  'methane':              { kind: 'covalent', shape: 'tetrahedral', angle: 109.5, fact: 'The main gas in natural gas, burned for heating and cooking.' },
  'carbon-dioxide':       { kind: 'covalent', shape: 'linear', angle: 180, fact: 'You breathe it out, and it makes the bubbles in fizzy drinks.' },
  'formaldehyde':         { name: 'Methanal', kind: 'covalent', shape: 'trigonal planar', angle: 120, about: true, fact: 'Its solution, formalin, is used to preserve specimens.' },
  'methanol':             { group: '–OH group', family: 'alcohol', kind: 'covalent', shape: 'tetrahedral around the carbon', fact: 'Used in windscreen-washer fluid in some countries; it is poisonous to drink.' },
  'ethyne':               { kind: 'covalent', shape: 'linear', angle: 180, fact: 'Burned with oxygen, it gives a flame of over 3,300 °C, used to weld and cut steel.' },
  'ethylene':             { name: 'Ethene', kind: 'covalent', shape: 'trigonal planar around each carbon', angle: 120, about: true, fact: 'Ripening fruit gives it off, and it is the starting material for poly(ethene), the most common plastic.' },
  'ethane':               { kind: 'covalent', shape: 'tetrahedral around each carbon', angle: 109.5, fact: 'Found in natural gas; its main use is to make ethene for plastics.' },
  'ethanol':              { group: '–OH group', family: 'alcohol', kind: 'covalent', shape: 'tetrahedral around each carbon', fact: 'The alcohol in drinks, and the main ingredient of many hand sanitisers.' },
  'dimethyl-ether':       { group: '–O– link between two carbon atoms', family: 'ether', name: 'Methoxymethane', kind: 'covalent', shape: 'bent at the oxygen', fact: 'Used as a propellant in aerosol sprays.' },
  'urea':                 { kind: 'covalent', shape: 'trigonal planar around the carbon', fact: 'Your body gets rid of spare nitrogen as urea in urine; it is also made as a fertiliser.' },
  'potassium-chloride':   { kind: 'ionic', fact: 'Used as a fertiliser and in low-sodium salt substitutes.' },
  'potassium-oxide':      { kind: 'ionic', fact: 'Reacts with water to form potassium hydroxide, a strong alkali.' },
  'zinc-oxide':           { kind: 'ionic', fact: 'A white powder in sunscreens and nappy creams; it blocks ultraviolet light.' },
  'copper-chloride':      { name: 'Copper(II) chloride', kind: 'ionic', fact: 'Copper compounds colour flames blue-green, as in some fireworks.' },
  'potassium-hydroxide':  { kind: 'ionic-oh', fact: 'A strong alkali used in alkaline batteries and to make soft soap.' },
  'zinc-hydroxide':       { kind: 'ionic-oh', fact: 'Amphoteric: it dissolves in both acids and alkalis.' },
  'magnesium-hydroxide':  { kind: 'ionic-oh', fact: 'Milk of magnesia: an antacid that neutralises excess stomach acid.' },
  'calcium-fluoride':     { kind: 'ionic', fact: 'Found in nature as the mineral fluorite, which can glow under ultraviolet light.' },
  'aluminium-fluoride':   { kind: 'ionic', fact: 'Added when aluminium is extracted by electrolysis, to lower the melting point of the mixture.' },
  'aluminium-oxide':      { kind: 'ionic', fact: 'Rubies and sapphires are crystals of aluminium oxide, coloured by traces of other metals.' },
  'iron-oxide':           { name: 'Iron(III) oxide', kind: 'ionic', fact: 'The main part of rust, and of haematite, the main ore of iron.' },
  'aluminium-hydroxide':  { kind: 'ionic-oh', fact: 'Used in antacid tablets to neutralise stomach acid.' },
  'iron-hydroxide':       { name: 'Iron(III) hydroxide', kind: 'ionic-oh', fact: 'Forms as an orange-brown precipitate in the test for iron(III) ions.' },
  'sodium-oxide':         { kind: 'ionic', fact: 'Glassmakers add sodium carbonate, which turns into sodium oxide in the furnace and helps the sand melt at a lower temperature.' },
  'chloromethane':        { kind: 'covalent', shape: 'tetrahedral', fact: 'Once used as a refrigerant; most is now used to make silicones.' },
  'dichloromethane':      { kind: 'covalent', shape: 'tetrahedral', fact: 'A powerful solvent, once common in paint strippers.' },
  'chloroform':           { name: 'Trichloromethane', kind: 'covalent', shape: 'tetrahedral', fact: 'One of the first anaesthetics used in surgery, in the 1840s.' },
  'carbon-tetrachloride': { name: 'Tetrachloromethane', kind: 'covalent', shape: 'tetrahedral', angle: 109.5, fact: 'Once used in fire extinguishers; now banned for most uses because it is toxic and damages the ozone layer.' },
  'tetrafluoromethane':   { kind: 'covalent', shape: 'tetrahedral', angle: 109.5, fact: 'One of the longest-lasting greenhouse gases: it stays in the air for thousands of years.' },
  'hydrogen-cyanide':     { kind: 'covalent', shape: 'linear', angle: 180, fact: 'A deadly poison; some people can smell it as bitter almonds.' },
  'methanoic-acid':       { group: '–COOH group', family: 'carboxylic acid', kind: 'covalent', shape: 'trigonal planar around the carbon', fact: 'Wood ants spray it to defend themselves; it is also found in stinging nettles.' },
  'ethanoic-acid':        { group: '–COOH group', family: 'carboxylic acid', kind: 'covalent', shape: 'trigonal planar around the C=O carbon', fact: 'The acid in vinegar.' },
  'carbonic-acid':        { kind: 'covalent', shape: 'trigonal planar around the carbon', fact: 'Forms when carbon dioxide dissolves in water, making fizzy water slightly acidic.' },
  'acetaldehyde':         { group: '–CHO group', family: 'aldehyde', name: 'Ethanal', kind: 'covalent', shape: 'trigonal planar around the C=O carbon', fact: 'Your liver makes it when it breaks down alcohol.' },
  'propanone':            { group: 'C=O group between two carbon atoms', family: 'ketone', kind: 'covalent', shape: 'trigonal planar around the C=O carbon', fact: 'Also called acetone: the solvent in many nail-polish removers.' },
  'propane':              { kind: 'covalent', shape: 'tetrahedral around each carbon', fact: 'Sold bottled as a fuel for barbecues and camping stoves.' },
  'propene':              { kind: 'covalent', shape: 'trigonal planar around the C=C carbons', fact: 'Joined into long chains it makes poly(propene), used for food tubs and ropes.' },
  'propyne':              { kind: 'covalent', shape: 'linear around the triple bond', fact: 'Mixed with propadiene and propane, it made MAPP gas, a torch fuel for brazing and welding.' },
  'methylamine':          { group: '–NH₂ group', family: 'amine', kind: 'covalent', shape: 'tetrahedral around the carbon', fact: 'It has a strong fishy smell.' },
};
