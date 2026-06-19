// Compose all out/buildings/building-*.svg into a preview strip on a shared
// ground line (every building uses viewBox H=600 with ground at y=560).
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'out/buildings');
const files = fs.readdirSync(dir).filter((f) => /^building-\d+\.svg$/.test(f)).sort();
const gap = 30;
let x = gap;
const parts = [];
let H = 600;
for (let i = 0; i < files.length; i++) {
  const svg = fs.readFileSync(path.join(dir, files[i]), 'utf8');
  const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const w = parseFloat(vb[1]), h = parseFloat(vb[2]);
  H = Math.max(H, h);
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  // align ground lines: each building's ground is at y=h-40; shift so grounds coincide at H-40
  const dy = (H - 40) - (h - 40);
  parts.push(`<g transform="translate(${x},${dy})">${inner}</g>`);
  x += w + gap;
}
const W = x;
const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
  `<rect x="0" y="0" width="${W}" height="${H}" fill="#eef0f2"/>` +
  `<line x1="0" y1="${H - 40}" x2="${W}" y2="${H - 40}" stroke="#9aa0a8" stroke-width="2"/>` +
  parts.join('') + `</svg>`;
fs.writeFileSync(path.join(__dirname, 'out/preview-strip.svg'), out);
console.log(`preview-strip.svg  ${files.length} buildings  ${W}x${H}`);
