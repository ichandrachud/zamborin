// Render an SVG file (or all in out/buildings) to PNG for visual QA.
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

function render(svgPath, outPath, zoom = 2) {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const r = new Resvg(svg, { fitTo: { mode: 'zoom', value: zoom }, background: '#eef0f2' });
  fs.writeFileSync(outPath, r.render().asPng());
}

const arg = process.argv[2];
const outDir = '/tmp/render';
fs.mkdirSync(outDir, { recursive: true });
if (arg && arg.endsWith('.svg')) {
  render(arg, path.join(outDir, path.basename(arg).replace('.svg', '.png')));
  console.log('rendered', arg);
} else {
  const dir = path.join(__dirname, 'out/buildings');
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
    render(path.join(dir, f), path.join(outDir, f.replace('.svg', '.png')));
  }
  console.log('rendered all to', outDir);
}
