#!/usr/bin/env node
/* ============================================================
   Zamborin · portal package builder

   Produces the zip GameDistribution hosts. Run by hand:

     node tools/portal-build.mjs

   WHY A BUILD STEP AND NOT A QUERY PARAMETER. ?embed=1 works because the page
   is still served from zamborin.com inside an iframe, so every relative path
   still resolves. GD does not iframe us — they host the files themselves
   ("We do not permit external hosting of games, except for Real Multiplayer
   games"). Once the files move to their disk, ../shared/ points at nothing a
   flag can repair. The paths have to be flat before the zip is made.

   WHAT THIS DOES NOT DO. It never touches the game. play.js, play.css,
   model.js and every asset are copied byte-for-byte, which is both less to
   maintain and what GD's agreement asks for: 2.6.4 requires their copy to be
   identical to the version published elsewhere. The only file transformed is
   index.html, and only to remove site chrome and add their SDK.

   Every removal below asserts it matched. A silent miss would ship a package
   with a tracker or an outbound link still in it, which is a rejection.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAME    = 'tailwind';
const GAME_ID = '1a95f9ebc00d4da9a26e431242260751';
/* --no-sdk builds the identical package minus GameDistribution's SDK. The SDK
   cannot serve ads from localhost and puts up its anti-adblock wall instead,
   which sits on top of the game and makes local play-testing impossible. The
   uploadable package is ALWAYS the one WITH the SDK; this exists only so the
   game can be judged without it. Separate output directory and separate zip
   name, so the two can never be confused at upload time. */
const NO_SDK  = process.argv.includes('--no-sdk');
const OUT     = join(ROOT, 'dist', NO_SDK ? `${GAME}-local` : `${GAME}-gd`);

/* Files the game actually requests. Deliberately NOT the whole directory:
   balance/bend/measure/meter/sweep/whip/whip2.js are tuning harnesses that
   index.html never loads, and shipping them would put the workings of the
   difficulty curve in a stranger's zip. */
const GAME_FILES = ['play.js', 'play.css', 'model.js',
                    'splash-desktop.jpg', 'splash-mobile.jpg'];
const SHARED     = ['tokens.css', 'chrome.css', 'ui.js', 'sfx.js'];
/* analytics.js  — GD §7 names third-party analytics as prohibited
   ads.js        — contract 2.6.8, no third-party advertising
   embed.js      — it appends a link home, and 2.6.7 forbids outbound links */

let cuts = 0;
function cut(html, re, what) {
  const n = (html.match(re) || []).length;
  if (n === 0) throw new Error(`FAILED to find: ${what} — index.html has changed, fix this script`);
  cuts += n;
  return html.replace(re, '');
}

// ---- 1. lay the files out flat ------------------------------------------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'shared'), { recursive: true });
for (const f of GAME_FILES) cpSync(join(ROOT, GAME, f), join(OUT, f));
for (const f of SHARED)     cpSync(join(ROOT, 'shared', f), join(OUT, 'shared', f));
cpSync(join(ROOT, GAME, 'assets'), join(OUT, 'assets'), { recursive: true });

// ---- 2. transform index.html --------------------------------------------
let h = readFileSync(join(ROOT, GAME, 'index.html'), 'utf8');

// Trackers and third-party advertising. Both are contractual, not stylistic.
h = cut(h, /\s*<!-- Google AdSense -->/g, 'adsense comment');
h = cut(h, /\s*<meta name="google-adsense-account"[^>]*>/g, 'adsense meta');
h = cut(h, /\s*<script async src="https:\/\/pagead2\.googlesyndication\.com[^<]*<\/script>/g, 'adsense script');
h = cut(h, /\s*<script defer src="\/_vercel\/[^"]*"><\/script>/g, 'vercel analytics');
// [^>]*src rather than a bare `src`: ads.js is loaded with `defer`, and a
// regex that assumed the attribute came first left it in the package, pointing
// at a file this script deliberately does not copy.
h = cut(h, /\s*<script[^>]*src="\.\.\/shared\/(analytics|ads|embed)\.js[^"]*"[^>]*><\/script>/g, 'analytics/ads/embed scripts');

// Anything pointing off the package. GD strips outbound links itself and
// declines games that carry them.
h = cut(h, /\s*<link rel="canonical"[^>]*>/g, 'canonical');
h = cut(h, /\s*<link rel="icon"[^>]*>/g, 'favicon');
h = cut(h, /\s*<!-- Open Graph \/ Twitter -->[\s\S]*?<meta name="twitter:image"[^>]*>/g, 'og/twitter block');
h = cut(h, /\s*<!-- Structured data: VideoGame schema -->\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, 'json-ld');

// Google Fonts. Not forbidden, but it is the last request leaving the page,
// and tokens.css already falls back to system-ui.
h = cut(h, /\s*<link rel="preconnect" href="https:\/\/fonts\.[^>]*>/g, 'font preconnects');
h = cut(h, /\s*<link href="https:\/\/fonts\.googleapis\.com[^>]*>/g, 'google fonts');

// Site chrome. The aside is nested inside play-row, which stays.
h = cut(h, /\s*<aside class="sidebar">[\s\S]*?<\/aside>/g, 'sidebar');
h = cut(h, /\s*<!-- [^>]*ad: [^>]*-->\s*<div class="ad-slot[\s\S]*?<\/div>/g, 'ad slots');
h = cut(h, /\s*<section class="game-info">[\s\S]*?<\/section>/g, 'game-info');
/* The inline <style> exists only for .game-info, plus a <1151px override that
   unlocks body scrolling so a phone can reach the footer. Both are gone, and
   the override is actively wrong here: with no page content below the canvas
   there is nothing to scroll to, and undoing chrome.css's lock would let a
   full-frame game drag around under a player's thumb. */
h = cut(h, /\s*<style>[\s\S]*?<\/style>/g, 'inline game-info styles');
h = cut(h, /\s*<header class="site-header">[\s\S]*?<\/header>/g, 'site header');
h = cut(h, /\s*<footer class="site-footer">[\s\S]*?<\/footer>/g, 'site footer');

/* THE TRAP. The inline block holds two IIFEs. The first binds a click handler
   to #focus-toggle, which lives in the header we just removed — so it throws a
   TypeError, and a throw abandons the whole <script> element. The second IIFE
   is the splash timer. Lose it and the splash never lifts: a package that
   looks perfect and cannot be played. */
h = cut(h, /\s*\(\(\) => \{\s*const btn = document\.getElementById\('focus-toggle'\);[\s\S]*?\}\)\(\);/g,
        'focus-toggle IIFE');

// Flatten the shared paths now that shared/ sits beside index.html.
if (!h.includes('../shared/')) throw new Error('expected ../shared/ paths to rewrite');
h = h.replace(/\.\.\/shared\//g, './shared/');

// Embed layout without embed.js: set the classes it would have set. On <html>
// too, so the chrome never flashes before <body> exists.
h = h.replace('<html lang="en">', '<html lang="en" class="embed">');
h = h.replace('<body class="game-content-page portrait-only">',
              '<body class="game-content-page portrait-only embed">');

// The SDK. GD_OPTIONS must exist before main.min.js loads.
const sdk = `
  <script>
    window.GD_OPTIONS = {
      gameId: '${GAME_ID}',
      onEvent: function (event) {
        switch (event.name) {
          case 'SDK_GAME_START':
            window.dispatchEvent(new Event('gd-resume')); break;
          case 'SDK_GAME_PAUSE':
            window.dispatchEvent(new Event('gd-pause')); break;
        }
      }
    };
    (function (d, s, id) {
      var js, fjs = d.getElementsByTagName(s)[0];
      if (d.getElementById(id)) return;
      js = d.createElement(s); js.id = id;
      js.src = 'https://html5.api.gamedistribution.com/main.min.js';
      fjs.parentNode.insertBefore(js, fjs);
    }(document, 'script', 'gamedistribution-jssdk'));
  </script>
</head>`;
h = h.replace('</head>', NO_SDK ? '</head>' : sdk);

writeFileSync(join(OUT, 'index.html'), h);

// ---- 3. refuse to ship a package that still phones home ------------------
const BANNED = [
  ['zamborin.com',            'a link or reference back to the site'],
  ['adsbygoogle',             'third-party advertising'],
  ['shared/ads.js',           'the site ad loader'],
  ['shared/analytics.js',     'analytics'],
  ['shared/embed.js',         'the script that appends a link home'],
  ['googlesyndication',       'third-party advertising'],
  ['_vercel',                 'analytics'],
  ['fonts.googleapis',        'an external font request'],
  ['../',                     'a path escaping the package'],
  ['class="site-header"',     'site chrome'],
  ['class="site-footer"',     'site chrome'],
  ['focus-toggle',            'the IIFE that aborts the splash timer'],
];
const failures = BANNED.filter(([needle]) => h.includes(needle));
if (failures.length) {
  for (const [needle, why] of failures) console.error(`  STILL PRESENT: ${needle} — ${why}`);
  throw new Error('package failed its own checks; nothing was zipped');
}
const REQUIRED = ['splash-done', './shared/chrome.css', 'id="game"']
  .concat(NO_SDK ? [] : ['GD_OPTIONS']);
for (const must of REQUIRED) {
  if (!h.includes(must)) throw new Error(`package is missing ${must}`);
}

// ---- 4. zip it ----------------------------------------------------------
const zip = join(ROOT, 'dist', NO_SDK ? `${GAME}-local.zip` : `${GAME}-gd.zip`);
rmSync(zip, { force: true });
execSync(`cd "${OUT}" && zip -qr "${zip}" . -x '.*' -x '__MACOSX/*'`);

const size = execSync(`du -h "${zip}" | cut -f1`).toString().trim();
const count = execSync(`unzip -l "${zip}" | tail -1`).toString().trim();
console.log(NO_SDK
  ? '\n  LOCAL BUILD, no GD SDK. For play-testing only — never upload this one.'
  : `\n  ${cuts} removals, all matched.`);
console.log(`  index.html at the zip root, no outbound references.`);
console.log(`\n  ${zip}  (${size})`);
console.log(`  ${count}\n`);
