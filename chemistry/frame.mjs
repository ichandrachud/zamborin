/* Lessons in Chemistry · a still frame of any moment.
   node chemistry/frame.mjs <out.png> <query> <desktop|mobile> [snippet]

   Opens the game, waits out the splash, runs a snippet against window.__chem
   (freeze the clock, place atoms, hover a cell), and saves a 2x screenshot.
   This is how M1's frames for the owner were made. Example:
     node chemistry/frame.mjs /tmp/f.png "level=6" mobile \
       "__chem.freeze(0); __chem.place(1,1); __chem.advance(900); __chem.hoverAt(2,1)"
   Needs the local server (see cdp.mjs). */
import fs from 'fs';
import { openPage, BASE } from './cdp.mjs';

const [, , out, query = '', layout = 'desktop', snippet = ''] = process.argv;
if (!out) { console.log('usage: node chemistry/frame.mjs <out.png> <query> <desktop|mobile> [snippet]'); process.exit(1); }
const mobile = layout === 'mobile';
const p = await openPage({ w: mobile ? 390 : 760, h: mobile ? 844 : 600, dpr: 2, mobile,
                           url: BASE + '?' + (mobile ? '' : 'embed=1&') + query });
try {
  if (snippet) await p.ev('(() => { ' + snippet + '; })()');
  const shot = await p.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log('wrote ' + out + (p.errors.length ? '  console errors: ' + p.errors.join(' | ') : ''));
} finally { p.close(); }
process.exit(0);    // a killed Chrome can leave a handle open; do not hang on it
