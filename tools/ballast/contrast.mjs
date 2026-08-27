/* Ballast · contrast sweep.
   Every piece of type and every graphical object: 4.5:1 for normal
   text, 3:1 for large and graphical. Chrome takes tokens; game art
   carries its own palette but is still bound by these numbers.

   The check is null-tested first, because a colour routine gives
   confident numbers whether or not it is correct: two typo'd matrix
   coefficients once produced alarming, specific and entirely wrong
   accessibility findings elsewhere in this repo. */
const hex = h => { h = h.replace('#',''); if (h.length===3) h = h.split('').map(c=>c+c).join('');
  return [0,2,4].map(i => parseInt(h.slice(i,i+2),16)); };
const lin = c => { c/=255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
const lum = rgb => 0.2126*lin(rgb[0]) + 0.7152*lin(rgb[1]) + 0.0722*lin(rgb[2]);
const ratio = (a,b) => { const A = lum(hex(a)), B = lum(hex(b));
  return (Math.max(A,B)+0.05)/(Math.min(A,B)+0.05); };
/* Flatten an rgba over a ground, so translucent chrome is measured as it
   is actually seen rather than as its nominal colour. */
const over = (rgba, ground) => {
  const m = rgba.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  const a = m[4] === undefined ? 1 : parseFloat(m[4]);
  const g = hex(ground);
  const mix = [0,1,2].map(i => Math.round(parseFloat(m[i+1])*a + g[i]*(1-a)));
  return '#' + mix.map(v => v.toString(16).padStart(2,'0')).join('');
};

console.log('--- null test (these are known values; if they are wrong, nothing below means anything) ---');
const nulls = [
  ['white on black', '#FFFFFF', '#000000', 21.00],
  ['white on white', '#FFFFFF', '#FFFFFF', 1.00],
  ['black on black', '#000000', '#000000', 1.00],
  ['#767676 on white (the AA boundary)', '#767676', '#FFFFFF', 4.54],
  ['#595959 on white', '#595959', '#FFFFFF', 7.00]
];
let nullOK = true;
for (const [n, a, b, want] of nulls) {
  const got = ratio(a, b);
  const ok = Math.abs(got - want) < 0.02;
  if (!ok) nullOK = false;
  console.log(`  ${ok?'ok  ':'BAD '} ${n.padEnd(36)} ${got.toFixed(2)} (expected ${want})`);
}
if (!nullOK) { console.log('\nThe checker is wrong. Stop.'); process.exit(1); }

/* The ground is now the house token ground, not an invented warm brown, so
   every pair that was measured against #1E140D has to be measured again. */
const ART = { bgIn:'#131F36', bgOut:'#0E1726', inner:'#241710', innerLo:'#1A0F09',
              metal:'#907050', metalHi:'#C09A76', metalLo:'#7F6046', rimLit:'#FFD9A8', cord:'#7E6249' };
const GROUND = { panel:'#1B2A47', card:'#131F36', bg:'#0E1726' };
const TIER = [['#D54029','#7C2112'],['#E15E25','#85310D'],['#EA7C28','#8D4209'],
              ['#EF9B36','#945407'],['#F4BA4F','#9B6605'],['#F4DA91','#A2790A'],['#FBF5EC','#BD8524']];
const TOK = { text:'#FFFFFF', dim:'#C5CFE0', mute:'#8E9CB5', accent:'#C24A39',
              accentTx:'#FF6B5C', accent2:'#FFD23F', green:'#5DD39E', card:'#131F36',
              panel:'#1A2A45', line:'#1F2D4A' };
const NAME = ['EMBER','COAL','FLAME','BRASS','AMBER','GOLD','STAR'];

const rows = [];
const add = (what, fg, bg, need, kind) => rows.push({ what, fg, bg, need, kind, r: ratio(fg, bg) });

console.log('\n--- game art: orbs against what they sit on (graphical, 3:1) ---');
for (let t = 0; t < TIER.length; t++) {
  // The highlight is the orb's own body; measured against the vessel ground
  // it rests on, and against the darker page beyond the rim.
  add(`orb ${NAME[t]} on vessel ground`, TIER[t][0], ART.inner, 3, 'graphical');
  add(`orb ${NAME[t]} on ground, lightest`, TIER[t][0], GROUND.panel, 3, 'graphical');
}
// Neighbouring tiers must be tellable apart, which is what the merge rule asks.
console.log('--- adjacent tiers against each other (the rule IS the size, so this is advisory) ---');
for (let t = 0; t < TIER.length - 1; t++)
  rows.push({ what: `${NAME[t]} vs ${NAME[t+1]}`, fg: TIER[t][0], bg: TIER[t+1][0],
              need: 1.2, kind: 'advisory', r: ratio(TIER[t][0], TIER[t+1][0]) });

console.log('--- vessel and marks ---');
add('vessel on ground, lightest', ART.metal, GROUND.panel, 3, 'graphical');
add('vessel on ground, darkest',  ART.metal, GROUND.bg, 3, 'graphical');
add('vessel interior vs vessel',  ART.inner, ART.metal, 3, 'graphical');

console.log('--- chrome type ---');
add('SCORE on page ground',        TOK.text,     GROUND.panel, 4.5, 'text');
add('BEST on page ground',         TOK.mute,     GROUND.panel, 4.5, 'text');
add('LADDER labels lit',           TOK.dim,      GROUND.panel, 4.5, 'text');
add('LADDER labels unlit',         TOK.mute,     GROUND.panel, 4.5, 'text');
add('BIGGEST value',               TOK.accent2,  GROUND.panel, 4.5, 'text');
add('gauge label, safe',           TOK.mute,     GROUND.panel, 4.5, 'text');
add('gauge label, danger',         TOK.accentTx, GROUND.panel, 4.5, 'text');
add('gauge safe band',             TOK.green,    GROUND.panel, 3,   'graphical');
add('gauge danger band',           TOK.accentTx, GROUND.panel, 3,   'graphical');
add('gauge needle',                TOK.text,     GROUND.panel, 3,   'graphical');
add('card title on card',          TOK.text,     TOK.card, 4.5, 'text');
add('card copy on card',           TOK.dim,      TOK.card, 4.5, 'text');
add('over-card label on card',     TOK.accentTx, TOK.card, 4.5, 'text');
add('CTA text on accent fill',     '#FFFFFF',    TOK.accent, 4.5, 'text');

console.log('--- buttons, drawn over BOTH grounds they appear on ---');
for (const [gname, g] of [['play ground', GROUND.panel], ['card', TOK.card]]) {
  add(`PILL label on ${gname}`,  over('rgba(255,255,255,0.92)', over('rgba(255,255,255,0.07)', g)), over('rgba(255,255,255,0.07)', g), 4.5, 'text');
  add(`PILL border on ${gname}`, over('rgba(255,255,255,0.24)', g), g, 3, 'graphical');
  add(`PILL fill on ${gname}`,   over('rgba(255,255,255,0.07)', g), g, 1.0, 'advisory');
}
/* Hover, focus and active drift freely because every check runs on a page
   AT REST. The canvas buttons have no hover state at all, which is its own
   finding; the page's links do. */
console.log('--- page states that a rest-time check would miss ---');
add('game-info link on card',      '#4DC3FF', TOK.card, 4.5, 'text');
add('accent-hover under white',    '#FFFFFF', TOK.accentHover || '#A93E2F', 4.5, 'text');

/* Is the pill border a Ballast problem or a fleet problem? Measure it on
   the standard token ground every other game uses. */
console.log('--- the same button on the standard --bg ground, i.e. every other game ---');
for (const [gname, g] of [['--bg', '#0E1726'], ['--bg-card', '#131F36'], ['--bg-panel', '#1A2A45']]) {
  const b = over('rgba(255,255,255,0.24)', g);
  console.log(`      PILL border on ${gname.padEnd(12)} ${ratio(b, g).toFixed(2)}:1  (need 3)  ${b} on ${g}`);
}

let fails = 0;
for (const r of rows) {
  const ok = r.r >= r.need;
  if (!ok && r.kind !== 'advisory') fails++;
  console.log(`${r.kind === 'advisory' ? '    ' : (ok ? 'PASS' : 'FAIL')}  ${r.what.padEnd(34)} ${r.r.toFixed(2)}:1  (need ${r.need})  ${r.fg} on ${r.bg}`);
}
console.log(`\n${fails === 0 ? 'CLEAN' : fails + ' FAILURES'} across ${rows.filter(r=>r.kind!=='advisory').length} measured pairs.`);
