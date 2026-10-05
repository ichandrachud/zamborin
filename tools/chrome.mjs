// The browser the harnesses drive: Playwright's chrome-headless-shell, never the
// owner's own Google Chrome. A headless copy of the real Chrome that outlives its
// script sits in the Dock and takes the Chrome icon's click, so Chrome opens no
// window (2026-10-05: three such copies, 1 to 6 days old). The shell is a
// separate program with no Dock presence. Install it once on each Mac:
//   npx playwright install chromium-headless-shell
import { spawn } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const cache = join(homedir(), 'Library/Caches/ms-playwright');
const builds = existsSync(cache)
  ? readdirSync(cache).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort((a, b) => a.split('-')[1] - b.split('-')[1])
  : [];
const shell = builds.length && readdirSync(join(cache, builds.at(-1))).find((d) => d.startsWith('chrome-headless-shell-mac'));
if (!shell) throw new Error('chrome-headless-shell is not installed. Run: npx playwright install chromium-headless-shell');
const CHROME = join(cache, builds.at(-1), shell, 'chrome-headless-shell');

// Kill a spawned browser when this script ends for any reason it can catch:
// a timeout's SIGALRM or SIGTERM, Ctrl-C, or an exit that skips the finally.
const children = new Set();
let armed = false;
function guard(child) {
  if (!armed) {
    armed = true;
    const killAll = () => { for (const c of children) try { c.kill('SIGKILL'); } catch (e) {} };
    process.on('exit', killAll);
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGALRM']) process.on(sig, () => { killAll(); process.exit(1); });
  }
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}

// Start the shell, guarded. Left to itself it draws WebGL in software
// (SwiftShader), about 1.6x slower than the real Chrome these tools used to
// drive: a 3D game is still on its loading card at 6 s. These two flags put it
// on the Mac's GPU through Metal, the same renderer and speed as before.
export const launch = (args, opts) => guard(spawn(CHROME, ['--enable-gpu', '--use-angle=metal', ...args], opts));
