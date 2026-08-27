# Working on Zamborin

Rules a future session must follow. These exist because each one was broken at
least once and cost a cleanup.

> **Designing, laying out or colouring anything? Read `DESIGN-SYSTEM.md` first,
> in full.** It is the authority on the two layouts, the colour ladder, the
> button sizes, the rules modal and the splash. It overrides every build brief.
> This file covers repository structure and shipping; that one covers how the
> game looks.

## Repository layout

**One directory per game, at `/<game>/`.** It contains exactly:

```
<game>/index.html
<game>/play.js
<game>/play.css
<game>/splash-desktop.jpg     1520x1200
<game>/splash-mobile.jpg      1170x2532
<game>/assets/                only if the game genuinely needs one
```

Nothing else. In particular, **no `splash-images/` folder.** Every game had one
holding the working exports the production splash was cut from, none of them
were referenced by anything, and all of them were being served publicly.

**Shared images live in `/images/`, never inside the game directory:**

```
images/<game>-og.jpg          1200x630   link previews
images/<game>-teaser.jpg      1200x800   the homepage card
```

**Source and master files never enter the repo.** No PSD, no raw sprites, no
pre-conversion exports. `Psd/tessera.psd` was 18 MB and downloadable at
`zamborin.com/Psd/tessera.psd` by anyone who guessed the path. Masters live in
`iCloud/Claude Projects/Zamborin/source-assets/`. `.gitignore` blocks `*.psd`,
`/Psd/` and `**/references/` so this cannot come back by accident.

**No spaces in any filename.** Kebab-case throughout. Spaces need URL encoding
and break quietly in ways nobody notices until a link is shared. Check with:

```bash
git ls-files | grep ' '
```

That must return nothing.

## Shipping a game

A game is not shipped until all seven are done. Doing the first and stopping is
how a finished game ends up live, indexable and linked from nowhere.

1. Card added to the homepage grid in `index.html`, using `images/<game>-teaser.jpg`
2. `https://zamborin.com/<game>/` added to `sitemap.xml`, **with a `lastmod`**
3. Guide written at `/guides/<game>/`, matching the existing guide pattern:
   `Article` JSON-LD, canonical, OG tags, and a link back to the game
4. `/guides/<game>/` added to `sitemap.xml` and to the `/guides/` hub page
5. A link from the game page **to its own guide** (see below)
6. An entry in `llms.txt`
7. **Sitemap resubmitted in Search Console** once the deploy is live:
   Indexing → Sitemaps → type `sitemap.xml` → SUBMIT

Every game page links to its guide, and every guide links back. The guides are
the long-tail search asset; for a long time all twelve linked back to their game
and not one game linked forward, so the strongest pages on the site passed them
nothing.

## Prototypes and shelved games

**`<meta name="robots" content="noindex">` from the first commit.** A game that
is live but unlinked is not hidden — Google finds it through any external link
and indexes an unfinished thing. Add the tag when the directory is created, not
when someone notices.

Keep the route live when a game is shelved rather than deleting it, so existing
external links do not 404.

## Sitemap

Every entry carries `<lastmod>`. Google largely ignores `changefreq` and
`priority` and uses `lastmod` to decide what to re-crawl, so shipping a change
without updating it means the change is invisible for weeks.

**Updating `lastmod` is part of shipping, not a follow-up.**

**So is resubmitting it.** A `lastmod` only does anything once Google re-reads
the file, and it will not come back on its own for a site this young. On
2026-08-25 Search Console showed the sitemap last read on 22 July, when it held
19 URLs. It held 39 by then — so Prism, Needle, Kaleido, Stained, Tailwind and
all five of their guides had never been declared to Google at all. Half the
catalogue was invisible with nothing broken and no error anywhere. Resubmitting
the same sitemap re-queues it, is safe to repeat, and takes five seconds.

## Cache busting

Aggressive caching is on. Any change to a game's JS or CSS needs its query
string bumped in that game's `index.html`:

```html
<script src="./play.js?v=31"></script>
<link rel="stylesheet" href="./play.css?v=4" />
```

Shared files (`shared/chrome.css`, `shared/ui.js`) are referenced by every page,
so bumping one means bumping it everywhere.

## URLs

`vercel.json` sets `trailingSlash: true`. Without it `zamborin.com/weave` served
a 200 and the page's own `./play.js` resolved to `/play.js`, which 404s — a
correctly styled page with a permanently blank canvas, on all fifteen games at
once.

**Redirects run *after* the trailing-slash rewrite**, so every redirect needs
both the bare and the trailing-slash source:

```json
{ "source": "/old",  "destination": "/new/" },
{ "source": "/old/", "destination": "/new/" }
```

Adding only the bare form is how `/lacerta` started 404ing.

## Analytics

`shared/analytics.js` is the only tracking entry point. It must stay
fire-and-forget: silent no-op when blocked, no `await`, no throw into the game
loop. Assume a third of players block it.

**Nothing may ever cover gameplay** — no ad, no overlay, no analytics UI.
`.ad-slot` and `.sidebar` are gated behind a `body.ads-on` class that nothing
sets. Leave it that way until there is traffic data to justify a placement.

## Locked decisions

Do not "improve" these while working nearby:

- Desktop frame is **760x600** for every game (Carrom, Ludo, Zood and Empyrean excepted)
- `shared/ui.js` is the button system; sizes are never scaled per game
- No game name on the canvas. Controls left, level read-out top right
- On phones, controls stay at the **bottom**
- Full-screen sizing is done in JS per game (`fitFullscreen()`), never CSS `dvh`
- Pins' physics constants (K, C, dt) are locked; the system is chaotic at high drive

## Before you commit

```bash
git ls-files | grep ' '          # must be empty
node --check <game>/play.js      # every game you touched
```

Then load each page you touched and confirm **zero console 404s**.
