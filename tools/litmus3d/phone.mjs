// Pack Litmus in 3D into one self-contained page for a private phone link (a
// claude.ai Artifact), the way Marble's test links were shared. Everything is
// inlined: the house CSS, shared/sfx.js and ui.js, /chemistry/'s model.js and
// levels.js, the placements, the What-you-built cards (cards.js, learn.js),
// the three.js bundle (its exports become window.__THREE) and play.js (its
// import becomes a read of that). The game is laid out as an
// embed: it fills the window, with no site header or footer.
// usage: node tools/litmus3d/phone.mjs <out.html>
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url).pathname;
const read = (p) => readFileSync(root + p, 'utf8');
const out = process.argv[2];
if (!out) { console.error('usage: node tools/litmus3d/phone.mjs <out.html>'); process.exit(1); }

// three.js: `export{a as B,...}` at the end becomes `window.__THREE={B:a,...}`, inside its own scope.
let three = read('litmus3d/assets/three-r186.min.js');
const at = three.lastIndexOf('export{');
const end = three.indexOf('}', at);
const names = three.slice(at + 7, end).split(',').map((s) => {
  const [local, as] = s.split(' as ');
  return `${(as || local).trim()}:${local.trim()}`;
});
three = '(function(){' + three.slice(0, at) + ';window.__THREE={' + names.join(',') + '};' + three.slice(end + 1) + '})();';

let play = read('litmus3d/play.js');
const imp = play.match(/import \{([\s\S]*?)\} from '\.\/assets\/three-r186\.min\.js';/);
if (!imp) throw new Error('play.js import not found');
play = '(function(){\n' + play.replace(imp[0], `const {${imp[1]}} = window.__THREE;`) + '\n})();';

const page = read('litmus3d/index.html');
// the cover's own script (index.html), from its comment to the end of its <script>
const splashScript = page.match(/\/\* The cover stays[\s\S]*?<\/script>/);
if (!splashScript) throw new Error('splash script not found');
splashScript[0] = '<script>\n    ' + splashScript[0];
const wrap = page.match(/<div class="game-wrap">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
if (!wrap) throw new Error('game-wrap not found');

// the cover's art, inlined: a one-page link has no files beside it
const jpg = (f) => `url('data:image/jpeg;base64,${readFileSync(root + 'litmus3d/' + f).toString('base64')}')`;
const css = [read('shared/tokens.css'), read('shared/chrome.css'), read('litmus3d/play.css').replace(/url\('\.\/(splash-(?:mobile|desktop)\.jpg)\?v=\d+'\)/g, (m, f) => jpg(f))].join('\n')
  .replace(/@import[^;]+;/g, '');
const noScriptClose = (s) => s.replace(/<\/script/gi, '<\\/script');

const html = `<title>Litmus 3D</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
${css}
/* the phone link: one dark look, the game filling the window */
:root { color-scheme: dark; padding: 0 !important; }
html, body { height: 100%; margin: 0; background: #0E1726; overflow: hidden; }
</style>
<script>
  document.documentElement.classList.add('embed');
  document.body.classList.add('embed');
  (() => {
    const mobile = matchMedia('(pointer: coarse)').matches || (innerWidth > 0 && innerWidth < 768);
    document.body.classList.add('mode-' + (mobile ? 'mobile' : 'desktop'));
    if (mobile && innerWidth > 0 && innerHeight > 0) {
      document.body.style.setProperty('--canvas-w', innerWidth + 'px');
      document.body.style.setProperty('--canvas-h', innerHeight + 'px');
    }
  })();
</script>
<main class="page"><section class="play-row">
${wrap[0]}
</section></main>
${splashScript[0]}
<script>${noScriptClose(read('shared/sfx.js'))}</script>
<script>${noScriptClose(read('litmus3d/sound.js'))}</script>
<script>${noScriptClose(read('shared/ui.js'))}</script>
<script>${noScriptClose(read('chemistry/model.js'))}</script>
<script>${noScriptClose(read('chemistry/levels.js'))}</script>
<script>${noScriptClose(read('litmus3d/places.js'))}</script>
<script>${noScriptClose(read('litmus3d/cards.js'))}</script>
<script>${noScriptClose(read('litmus3d/learn.js'))}</script>
<script>${noScriptClose(read('chemistry/lab.js'))}</script>
<script>${noScriptClose(read('litmus3d/reactor-chem.js'))}</script>
<script>${noScriptClose(read('litmus3d/reactor-levels.js'))}</script>
<script>${noScriptClose(read('litmus3d/carbon-levels.js'))}</script>
<script>${noScriptClose(read('litmus3d/reactor-scene.js'))}</script>
<script>${noScriptClose(read('litmus3d/reactor-cards.js'))}</script>
<script>${noScriptClose(three)}</script>
<script>${noScriptClose(play)}</script>
`;
writeFileSync(out, html);
console.log(out, Math.round(html.length / 1024) + ' KB');
