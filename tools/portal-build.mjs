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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* One line per game. The ID comes from the GD control panel, EDIT tab, after
   the entry is saved. */
const GAMES = {
  tailwind: '1a95f9ebc00d4da9a26e431242260751',
  ludo:     '6eedf3fa8030453ab29c7cdaea3599ab',
  zood:     'a916b78506ab4816a24526a4b28a84cf',
};

const GAME = process.argv.slice(2).find(a => !a.startsWith('--')) || 'tailwind';
const NO_SDK = process.argv.includes('--no-sdk');

/* WHICH PORTAL. The package is identical either way apart from the SDK in the
   head, because shared/portal.js is what the game talks to and it works out
   for itself which SDK is present. Adding a third portal is a case here and a
   branch in portal.js, and no change to any game.

     node tools/portal-build.mjs comb                     GameDistribution
     node tools/portal-build.mjs comb --portal=crazygames CrazyGames
     node tools/portal-build.mjs comb --no-sdk            local play-test */
const PORTAL = (process.argv.find(a => a.startsWith('--portal=')) || '--portal=gd').split('=')[1];
if (!['gd', 'crazygames'].includes(PORTAL)) throw new Error(`unknown portal "${PORTAL}"`);
// A local play-test build carries no SDK, so it needs no game id. Only the
// uploadable package does, which is also the only one that can be got wrong.
// Only GameDistribution needs an id, and only for an uploadable package.
// CrazyGames identifies the game by the listing it is uploaded to.
if (!NO_SDK && PORTAL === 'gd' && !GAMES[GAME]) {
  throw new Error(`no GD game id for "${GAME}" — add it to GAMES at the top of this file`);
}
const GAME_ID = GAMES[GAME] || '__NOT_SET__';
/* --no-sdk builds the identical package minus GameDistribution's SDK. The SDK
   cannot serve ads from localhost and puts up its anti-adblock wall instead,
   which sits on top of the game and makes local play-testing impossible. The
   uploadable package is ALWAYS the one WITH the SDK; this exists only so the
   game can be judged without it. Separate output directory and separate zip
   name, so the two can never be confused at upload time. */
const OUT     = join(ROOT, 'dist', NO_SDK ? `${GAME}-local` : `${GAME}-gd`);

/* THE MANIFEST IS DERIVED, NOT LISTED. Hardcoding it worked for one game and
   would have shipped the wrong files for the next: Tailwind has model.js and
   splash-desktop.jpg, Ludo has ludo-board.svg and ludo-splash-desktop.jpg, and
   Tailwind's directory also holds seven tuning harnesses index.html never
   loads. Find what the code REQUESTS — index.html's own tags, plus the
   relative assets play.js and play.css fetch at runtime — and copy that.
   Anything not requested is not shipped, which is the correct default. */
const NEVER_SHIP = new Set(['analytics.js', 'ads.js', 'embed.js']);
/* analytics.js  — GD §7 names third-party analytics as prohibited
   ads.js        — contract 2.6.8, no third-party advertising
   embed.js      — it appends a link home, and 2.6.7 forbids outbound links */

function manifest(html) {
  const game = new Set(), shared = new Set();
  for (const m of html.matchAll(/(?:src|href)="(?!https?:|\/)([^"?]+)/g)) {
    const ref = m[1];
    if (ref.startsWith('../images/')) continue;            // nothing links home
    const base = ref.split('/').pop();
    if (NEVER_SHIP.has(base)) continue;
    if (ref.startsWith('../shared/')) shared.add(base);
    else if (ref.startsWith('./'))    game.add(base);
  }
  // assets requested at runtime rather than declared in the markup
  for (const f of [...game].filter(f => /\.(js|css)$/.test(f))) {
    const src = readFileSync(join(ROOT, GAME, f), 'utf8');
    for (const m of src.matchAll(/['"(]\.\/([^'")]+\.(?:webp|jpg|jpeg|png|svg|json))/g)) {
      game.add(m[1].split('?')[0]);
    }
  }
  return { game: [...game], shared: [...shared] };
}

let cuts = 0;
function cut(html, re, what) {
  const n = (html.match(re) || []).length;
  if (n === 0) throw new Error(`FAILED to find: ${what} — index.html has changed, fix this script`);
  cuts += n;
  return html.replace(re, '');
}

// ---- 1. lay the files out flat ------------------------------------------
let h = readFileSync(join(ROOT, GAME, 'index.html'), 'utf8');
const MAN = manifest(h);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'shared'), { recursive: true });
for (const f of MAN.game) {
  mkdirSync(dirname(join(OUT, f)), { recursive: true });
  cpSync(join(ROOT, GAME, f), join(OUT, f));
}
for (const f of MAN.shared) cpSync(join(ROOT, 'shared', f), join(OUT, 'shared', f));
if (existsSync(join(ROOT, GAME, 'assets'))) {
  cpSync(join(ROOT, GAME, 'assets'), join(OUT, 'assets'), { recursive: true });
}
console.log(`\n  ${GAME}: ${MAN.game.length} game files, ${MAN.shared.length} shared`);

// ---- 2. transform index.html --------------------------------------------

// Trackers and third-party advertising. Both are contractual, not stylistic.
/* The template's comment grew a sentence ("The site earns from these pages;
   keep both lines"), and an exact-string regex meant every game built from the
   current template failed here instead of building. Match the opening of the
   comment and let it run to its close. */
h = cut(h, /\s*<!-- Google AdSense[^>]*>/g, 'adsense comment');
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
h = cut(h, /\s*<header class="site-header">[\s\S]*?<\/header>/g, 'site header');
h = cut(h, /\s*<footer class="site-footer">[\s\S]*?<\/footer>/g, 'site footer');

/* THE TRAP. The inline block holds two IIFEs. The first binds a click handler
   to #focus-toggle, which lives in the header we just removed — so it throws a
   TypeError, and a throw abandons the whole <script> element. The second IIFE
   is the splash timer. Lose it and the splash never lifts: a package that
   looks perfect and cannot be played. */
h = cut(h, /\s*\(\(\) => \{\s*const btn = document\.getElementById\('focus-toggle'\);[\s\S]*?\}\)\(\);/g,
        'focus-toggle IIFE');
h = cut(h, /\s*<style>[\s\S]*?<\/style>/g, 'inline game-info styles');

// Flatten the shared paths now that shared/ sits beside index.html.
if (!h.includes('../shared/')) throw new Error('expected ../shared/ paths to rewrite');
h = h.replace(/\.\.\/shared\//g, './shared/');

// Embed layout without embed.js: set the classes it would have set. On <html>
// too, so the chrome never flashes before <body> exists.
h = h.replace('<html lang="en">', '<html lang="en" class="embed">');
h = h.replace(/<body class="([^"]*)">/, '<body class="$1 embed">');

// The SDK. GD_OPTIONS must exist before main.min.js loads.
const gdSdk = `
  <script>
    window.GD_OPTIONS = {
      gameId: '${GAME_ID}',
      onEvent: function (event) {
        switch (event.name) {
          case 'SDK_GAME_START':
            window.dispatchEvent(new Event('gd-resume')); break;
          case 'SDK_GAME_PAUSE':
            window.dispatchEvent(new Event('gd-pause')); break;
          /* THE ONLY THING THAT MEANS A REWARD WAS EARNED. showAd('rewarded')
             resolves whether or not the player watched it, so a game that
             pays out on the promise pays out on a skip. shared/portal.js
             waits for this event and treats the promise settling without it
             as a decline. */
          case 'SDK_REWARDED_WATCH_COMPLETE':
            window.dispatchEvent(new Event('gd-rewarded')); break;
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

/* CrazyGames v3 must be loaded in the head and initialised before use, which
   shared/portal.js does on its own init. Verified against their docs on
   2026-08-28; v2 initialised itself and v3 does not. */
const cgSdk = `
  <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
</head>`;

const sdk = PORTAL === 'crazygames' ? cgSdk : gdSdk;
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
/* `splash-done` was the wrong invariant — it is Tailwind's event and Ludo has
   no listener for it. What actually matters is that the splash still LIFTS:
   both games put the focus-toggle handler and the splash timer in one <script>
   element, so removing the header kills the first, the throw abandons the
   block, and the splash sits over an unplayable game forever. Assert the
   removal itself, and only for a game that has a splash to remove. */
const REQUIRED = ['./shared/chrome.css', 'id="game"']
  .concat(h.includes('id="splash"') ? ['splash.remove()'] : [])
  .concat(NO_SDK ? [] : (PORTAL === 'crazygames' ? ['crazygames-sdk-v3.js'] : ['GD_OPTIONS', 'SDK_REWARDED_WATCH_COMPLETE']))
  /* The portal contract must survive into the package, or every ad call in
     the game silently becomes a no-op and the package still looks finished.

     Asked of the MANIFEST and not of the html, because the html is the wrong
     place to ask: the SDK block injected above CONTAINS THE WORDS
     "shared/portal.js" in a comment explaining what it is for, so
     `h.includes('portal.js')` matched the explanation rather than a script
     tag and demanded the file of every game that does not use it. The
     manifest lists what index.html actually loaded. */
  .concat(MAN.shared.includes('portal.js') ? ['./shared/portal.js'] : []);
for (const must of REQUIRED) {
  if (!h.includes(must)) throw new Error(`package is missing ${must}`);
}

// ---- 4. zip it ----------------------------------------------------------
const zip = join(ROOT, 'dist', NO_SDK ? `${GAME}-local.zip` : `${GAME}-${PORTAL}.zip`);
rmSync(zip, { force: true });
execSync(`cd "${OUT}" && zip -qr "${zip}" . -x '.*' -x '__MACOSX/*'`);

const size = execSync(`du -h "${zip}" | cut -f1`).toString().trim();
const count = execSync(`unzip -l "${zip}" | tail -1`).toString().trim();
console.log(NO_SDK
  ? '\n  LOCAL BUILD, no SDK. For play-testing only — never upload this one.'
  : `\n  ${cuts} removals, all matched. Portal: ${PORTAL}.`);
console.log(`  index.html at the zip root, no outbound references.`);
console.log(`\n  ${zip}  (${size})`);
console.log(`  ${count}\n`);
