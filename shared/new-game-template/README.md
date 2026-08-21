# New-game scaffold

Copy this folder, rename it to the game's URL slug, find-and-replace the
placeholders, and you have a page that is already at the standard every
shipped Zamborin game is held to.

## Quick start

```bash
# 1. Copy the folder to the project root, named after the URL slug.
cp -R shared/new-game-template chess

# 2. Find-and-replace these placeholders in the new folder.
#   __GAME_NAME__         e.g. "Chess"             (display name)
#   __GAME_SLUG__         e.g. "chess"             (URL + localStorage key)
#   __GAME_DESCRIPTION__  one-sentence pitch for SEO / OG card
#   __GAME_TAGLINE__      short title line, e.g. "Move pieces, take squares"
#   __GAME_OG_ALT__       alt text for the OG image
```

## What you get, already wired

The page is not a bare canvas. It ships with everything a Zamborin game page
needs, because for a long time it did not, and every new game inherited the gap
and had it hand-built back on at launch:

- **The site frame** from `shared/chrome.css`: header, focus button, footer nav.
- **Search metadata**: canonical, theme-color, OG and Twitter cards, and
  VideoGame JSON-LD.
- **AdSense**: the account meta and the async script. The site is free and
  ad-supported; keep both.
- **Four ad slots**, two leaderboards and two medium rectangles in the sidebar,
  all behind the `ads-on` class that nothing sets. Leave them in and leave them
  off. Nothing may ever cover gameplay.
- **A `.game-info` skeleton**: H1, how-to, why-it-is-clever, tips and an FAQ.
  Fill it in properly. It is what makes the page a page for search and for
  AdSense policy alike, and it is where the long-tail traffic comes from.
- **A link forward to the game's guide.** Every guide links back to its game;
  for a long time no game linked forward, so the strongest pages on the site
  passed the guides nothing.
- **Analytics** via `shared/analytics.js`, with the NOOP stub so tracking can
  never throw into the game loop, plus both Vercel scripts.
- **`shared/ui.js`** for buttons, at its sizes, never scaled per game.
- **`shared/embed.js`** so `?embed=1` works from the first commit. Every
  shipped game supports it and a partner's iframe will ask for it.
- **The full canvas sizing pattern** in `play.js`, including every re-fit
  listener. Tailwind shipped without them and collapsed into a narrow column on
  a phone.
- **`robots: noindex`**, from the first commit. Remove it only at ship.

## What you still have to do

1. **Write the game.** Fill in the `TODO`s in `play.js`.
2. **Write the `.game-info` copy for real.** The skeleton is a shape, not text.
   Calm voice, no em dashes.
3. **Art.** `splash-desktop.jpg` 1520x1200 and `splash-mobile.jpg` 1170x2532 in
   the game folder; `images/<slug>-og.jpg` 1200x630 and
   `images/<slug>-teaser.jpg` 1200x800 in the shared images folder. Masters go
   to `iCloud/Claude Projects/Zamborin/source-assets/`, never into the repo, and
   there is no `splash/` folder in a game directory.
4. **Check the splash wordmark safe zone.** `cover` crops the sides: the widest
   the wordmark may be, as a share of image width, is 0.38 divided by the image
   aspect. Fix the art, never the CSS.

## Shipping: all six, or it is not shipped

Doing the first and stopping is how a finished game ends up live, indexable and
linked from nowhere.

1. Card on the homepage grid in `/index.html`, using `images/<slug>-teaser.jpg`
2. `https://zamborin.com/<slug>/` in `sitemap.xml`, **with a `lastmod`**
3. Guide at `/guides/<slug>/`, matching the existing pattern: Article JSON-LD,
   canonical, OG tags, and a link back to the game
4. `/guides/<slug>/` in `sitemap.xml` **and** on the `/guides/` hub page
5. The link from the game page forward to its own guide (already in this
   template, just point it at the right slug)
6. An entry in `llms.txt`

Then remove the `noindex`, add the game to `404.html`, and bump `?v=N` on every
asset you touched. Before committing: `git ls-files | grep ' '` must be empty,
`node --check <game>/play.js` must pass, and every page you touched must load
with zero console 404s.

## Shared modules

| File | Purpose |
|---|---|
| `/shared/tokens.css` | Design tokens. Take every colour from here. |
| `/shared/chrome.css` | Site frame + mobile auto-focus |
| `/shared/ui.js` | `ZAM_UI.drawPill / drawCTA`, the button system |
| `/shared/sfx.js` | `ZSFX.create({ storageKey })` audio engine |
| `/shared/analytics.js` | `window.ZAM_TRACK`, six events, fire-and-forget |
| `/shared/embed.js` | `?embed=1` chrome-free mode for iframes on other sites |
| `/shared/input.js` | `ZInput.onTap / onSwipe / onDrag` helpers |
