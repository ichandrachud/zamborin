# Zamborin QC and Embed-Readiness Tracker

Living record. One row per live game. Started 2026-08-20.

Status key: `-` not yet checked | `OK` passed | `!` issue logged | `~` partial / needs re-check | `n/a` not applicable

## Roster (15 live games)

Confirmed against `index.html` (card grid) and `sitemap.xml` on 2026-08-20. Both
lists agree exactly, and every game has a `/guides/<game>/` page.

**Socket was delisted on 2026-08-20** at the owner's request. Route and guide route
stay live and playable, both now carry `noindex`, and every link to them was removed
from the homepage, 404 page, sitemap, llms.txt, about, guides index and two cross-links.
The folder stays in the repo. See branch `delist-socket`.

Delisted and NOT in scope: socket, bunny, empyrean, foldfig, pane, pins, plumb, tarmac, wire.

## Checklist columns

| Col | Check |
|---|---|
| FN | Functionality: loads clean, rules/menu shows, level solvable, win detected, undo + restart, autosave restores, no soft-lock |
| MB | Responsive and mobile: fills screen desktop and 375-wide portrait; narrow-strip bug; touch-to-cell Y scaling |
| PF | Performance: rAF pauses when hidden, no runaway loop, no memory growth, loads fast |
| AX | Accessibility: AA contrast, colour never the only signal, aria labels on canvas and controls |
| CN | Consistency: header, footer, favicon, fullscreen toggle, splash, blue chrome; no em dashes; no emoji icons; logo not recoloured |
| SEO | Title, description, canonical, OG, Twitter, VideoGame JSON-LD, in sitemap |
| EMB | Embed-readiness: works in a small iframe, self-contained paths, no frame-busting, own localStorage keys, chrome-free build path, works offline |

## Status table

| # | Game | FN | MB | PF | AX | CN | SEO | EMB | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | orbit | - | - | - | - | - | - | - | |
| 2 | bloom | - | - | - | - | - | - | - | |
| 3 | tailwind | - | - | - | - | - | - | - | |
| 4 | stained | - | - | - | - | - | - | - | |
| 5 | kaleido | OK | OK | OK | ~ | OK | OK | ! | audited 2026-08-20; see K1-K4 |
| 6 | prism | - | - | - | - | - | - | - | |
| 7 | needle | - | - | - | - | - | - | - | |
| 8 | untangle | - | - | - | - | - | - | - | |
| 9 | tessera | - | - | - | - | - | - | - | |
| 10 | sluice | - | - | - | - | - | - | - | |
| 11 | fold | - | - | - | - | - | - | - | |
| 12 | mobile | - | - | - | - | - | - | - | |
| 13 | zood | - | - | - | - | - | - | - | |
| 14 | carrom | - | - | - | - | - | - | - | |
| 15 | ludo | - | - | - | - | - | - | - | |

Row order matches the homepage card order.

## Issue log

Severity: **BREAKS PLAY** | **VISUAL** | **MINOR** | **EMBED GAP**

| ID | Game | Sev | Issue | State |
|---|---|---|---|---|
| E1 | empyrean | BREAKS PLAY (if committed) | Finder renames in the working tree would have 404'd the desert background and swapped the Zephyr sprite. Verified by hash, not just size. | FIXED 2026-08-20, files restored from git, nothing lost |
| K1 | kaleido | EMBED GAP + VISUAL | Rules card overflows in a small container: the Colourblind and PLAY buttons draw on top of rules 3 and 4, and rule 4 is clipped. Reproduced at 480x360 and 480x430, in a plain window as well as an iframe. Fine at 640x480, 760x600, 375x812 and 812x375. | FIXED on branch `fix-kaleido-rules-card`, not yet deployed |
| K2 | all 15 games | EMBED GAP | Favicon and logo loaded by root-absolute path in every game, so they 404 off-origin. Scanned all 15: exactly the same four root-absolute references in each. | FIXED on branch `fix-embed-absolute-paths`, not yet deployed |
| K2b | tessera | EMBED GAP | Worse case of K2: `tessera/play.js` loaded both HOW TO PLAY instruction images by root-absolute path, so off-origin the game's own teaching screen would have lost its art. | FIXED on the same branch |
| K2c | all 15 games | EMBED GAP, won't fix | `/_vercel/insights/script.js` and `/_vercel/speed-insights/script.js` are Vercel edge endpoints with no file in the repo, so they cannot be made relative. Off-origin they 404 harmlessly and analytics simply do not record. Would need an embed build that omits them. | ACCEPTED |
| K3 | kaleido | MINOR | No aria-live region, so a screen reader is told nothing when the board changes. The canvas itself is labelled. | OPEN |
| K4 | kaleido | MINOR | By default colour is the only thing separating three of the four glasses (all within 1.3:1 of each other in lightness). Mitigated by a built-in colourblind mode that swaps colour for shape, offered on the rules card, but it is off by default. | OPEN, by design |

## Pre-scan findings (static file reading only, nothing verified in a browser yet)

These came from reading files, not from running the games. Each still needs
browser confirmation before it counts as a real finding.

- **P1 (site-wide, likely EMBED GAP).** Every game's `index.html` loads the
  favicon and the logo by root-absolute path (`/images/zamborin-favicon.svg`,
  `/images/zamborin-logo.svg`). Served from another origin those 404 and the
  logo goes missing. The `../shared/*` references are relative and are fine.
- **P2 (site-wide, likely EMBED GAP).** Every game loads `/_vercel/insights/script.js`
  and `/_vercel/speed-insights/script.js` plus the AdSense script by absolute URL.
  Off-origin these fail and dirty the console.
- **P3 (site-wide, likely PERF).** No game listens for `visibilitychange` or reads
  `document.hidden`, so the animation loop probably keeps running in a background
  tab. Needs per-game confirmation, since some may pause through another flag.
- **P4 (fold, MINOR / deploy weight).** `fold/Images/` is 24 MB of 147 jpegs and is
  referenced nowhere in the repo. It looks like the pre-conversion source of the
  148 webp files the game actually uses in `fold/art/`. Fold is 37 MB of a 634 MB repo.
- **P5 (repo hygiene).** The working tree has uncommitted changes under `empyrean/assets/`
  from an earlier session: one modified plane sprite, three deleted images, three new
  untracked ones. Empyrean is delisted so this does not affect the live site, but it
  should be resolved rather than left dangling.
- **Good news.** The `https://zamborin.com/...` absolute URLs in each game are only in
  canonical, OG, Twitter and JSON-LD tags. Those are correct as absolute and do not
  break an embed. Every game already uses relative `../shared/` and `./play.js` paths.
- **P6 (zood, carrom, ludo — likely MOBILE).** These three have none of the four
  full-screen re-fit listeners. `orientationchange`, `visualViewport` and a `load`
  handler are absent in all three, and carrom and ludo never listen for `splash-done`
  either. They also sit at non-standard frame sizes for historical reasons, so they
  are the most likely to show the narrow-strip bug and the most invasive to fix.
  Handle them as a separate mini-project, last.
- **P7 (resolved, not a finding).** A summary line in an older note said untangle,
  tessera and fold still lacked the re-fit listeners. Checked and they all carry the
  full set; they were patched on 2026-08-19. The summary line was out of date, the
  detailed note was correct. The real gap is zood, carrom and ludo (P6).


## Kaleido audit, 2026-08-20

Measured, not assumed. Local preview at 5230.

**Functionality: pass.** Drove `window.__kaleido` across the whole ramp: all 100
levels generated, all 100 solved cleanly (`placed == blanks`, `clashes == 0`), and
all 100 reached the `won` phase, so win detection fires everywhere. Gaps ramp 2 to 10,
symmetry loosens 6 folds to 3 to 2, palette moves between 3 and 4 colours. Hint places
a correct pane and enables Undo; Undo reverts and the save follows it; the rules phase
shows at boot and after a state restore rather than being clobbered.

**Mobile: pass.** At 375x812 the wrap and canvas are both exactly 375x812, and the CSS
aspect matches the backing-store aspect to three decimals, which is the narrow-strip
test. No horizontal overflow. Controls sit at the bottom. Touch mapping scales X by
`LW / rect.width` and Y by `LH / rect.height`, which is the correct form.

**Performance: pass, with one gap.** `requestAnimationFrame` is the only driver; the
single `setTimeout` is a one-shot re-arm, not a loop. Measured directly: with
`document.visibilityState === 'hidden'`, rAF fired **zero** times in 3.6 seconds, so the
loop stops when the tab is hidden without the game needing its own `visibilitychange`
handler. Heap grew 2 KB over 3.6 s. **Not checked:** the visible frame rate, because the
preview pane stays hidden in this environment.

**Accessibility: partial.** All text passes comfortably (white 17.96:1, dim 11.44:1,
mute 6.48:1 on the page background). Every glass passes against the page background
(coral 4.45, green 9.64, sunshine 12.44, powder blue 12.53). The weak point is K4.

**Consistency: pass.** Header, logo, footer with all eight links, favicon, focus button
labelled "Play fullscreen", canvas labelled "Kaleido puzzle", no emoji. The only em dash
is in the page title, which is the site-wide pattern on every game.

**SEO: pass.** Title, description, canonical, Open Graph with image dimensions and alt
text, Twitter card, VideoGame JSON-LD, and the page is in the sitemap.

**Embed: mostly ready.** No frame-busting anywhere in the game or in `shared/`, and the
live site sends no `X-Frame-Options` or CSP `frame-ancestors`, so it can be embedded
cross-origin today. Runs in a 480x360 iframe, fits the container exactly, no overflow.
No runtime `fetch` or `XMLHttpRequest`, so it works offline once loaded. localStorage is
namespaced to `zamborin-kaleido.*`. Blocked only by K1 and K2.
