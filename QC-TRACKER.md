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
| 5 | kaleido | - | - | - | - | - | - | - | |
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
- **P7 (correction to an older note).** A previous session recorded that untangle,
  tessera and fold still lacked the re-fit listeners. That is no longer true: all
  three now carry the full set. The gap moved to zood, carrom and ludo (P6).
