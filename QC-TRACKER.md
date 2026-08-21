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
| 1 | orbit | OK | OK | OK | OK | OK | OK | OK | audited 2026-08-21. Cleanest game audited so far. One item, O1 |
| 2 | bloom | - | - | - | - | - | - | - | rules card fixed 2026-08-21, not yet audited |
| 3 | tailwind | OK | OK | OK | OK | OK | OK | OK | audited 2026-08-20, T1 + T2 fixed. T3-T6 open, none breaking play |
| 4 | stained | OK | ! | OK | ! | ~ | ! | ! | audited 2026-08-20; see S1-S4 |
| 5 | kaleido | OK | OK | OK | ~ | OK | OK | ! | audited 2026-08-20; see K1-K4 |
| 6 | prism | OK | OK | OK | ~ | OK | OK | OK | audited 2026-08-20; rules card fixed + copy trimmed. One tight colour pair, P1 |
| 7 | needle | - | - | - | - | - | - | - | rules card fixed 2026-08-21, not yet audited |
| 8 | untangle | OK | OK | OK | ~ | ~ | OK | OK | audited 2026-08-21. U1-U3 fixed, U4-U6 open |
| 9 | tessera | - | - | - | - | - | - | ~ | not audited, but U1 and U3 were shared with Untangle and are fixed here too |
| 10 | sluice | - | - | - | - | - | - | - | rules card fixed 2026-08-21, not yet audited |
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
| K2c | all 15 games | EMBED GAP, RESOLVED 2026-08-21 by the iframe embed: the page is served from zamborin.com, so the Vercel scripts load normally. The problem only existed for a copied folder. | `/_vercel/insights/script.js` and `/_vercel/speed-insights/script.js` are Vercel edge endpoints with no file in the repo, so they cannot be made relative. Off-origin they 404 harmlessly and analytics simply do not record. Would need an embed build that omits them. | ACCEPTED |
| O1 | orbit, fold | **CORRECTED 2026-08-21, and it changes the decision** | The entry said about 28 MB of working art was "deployed and never served", and the same premise sits behind P4. **Neither folder is deployed.** `orbit/splash-images/` and `fold/Images/` are both named in `.gitignore` and `git ls-files` returns zero files for each, so they have never been in a commit and Vercel has never received them. The tracked repo is 142 MB. The cost of keeping them is local disk, not bandwidth or deploy weight, and git history is not holding them either. | The deletion question is now purely about tidiness. Owner's call, but with no cost to leaving them |
| P1 | prism | ACCESSIBILITY, moderate | Blue vs purple measure 4.2 dE apart under deuteranopia, B alone versus R+B, which is tighter than Stained's worst pair. Everything else is comfortable and protanopia has nothing under 10. Stained's corner-pip mode would transplant almost unchanged. | OPEN |
| K3 | kaleido | MINOR | No aria-live region, so a screen reader is told nothing when the board changes. The canvas itself is labelled. | OPEN |
| S1 | stained | BREAKS PLAY (phone landscape) + EMBED GAP | The rules card clamped its height while the copy kept flowing, so the Resume button drew through the rules and the last two were unreadable. Measured overlap 170px at 480x360, 134px at 812x375 in mobile mode which is a phone turned sideways, 29px even at 640x480. Fine at 760x600 and 375x812. | FIXED on branch `fix-stained-rules-card`, not yet deployed |
| S2 | stained | ACCESSIBILITY, moderate | No colourblind mode, and the mechanic is reading which primaries overlap. **Corrected 2026-08-20:** the first measurement used a colour-vision simulation with two wrong coefficients in its inverse matrix and overstated this badly. Redone with a matrix that maps neutrals to neutrals: under deuteranopia NO pair falls below dE 10, and under protanopia one does, red vs brown at 8.5, with blue vs purple at 10.8. Tight rather than collapsed. It still matters because red is R alone and brown is all three, the most expensive confusion on the board, and 55 of the 100 levels carry both. | BUILT on branch `fix-stained-rules-card`, opt-in, not yet deployed |
| S3 | stained | SEO | No `VideoGame` JSON-LD. The only game of fifteen with no structured data at all. | FIXED on the same branch |
| S5 | stained | MINOR | On desktop `resizeCanvas` pins the canvas to exactly 760x600 CSS px and it never scales down, so in a short window the board runs below the fold. At a 1366x620 laptop it is 108px under and the page scrolls, so it is reachable; at extreme sizes the wrap clips it and the page does not grow. Kaleido handles the same case by letting CSS scale it to fit, so there is a known-good reference. The pinning was itself a fix for the narrow-strip bug, so do not simply revert it. | OPEN |
| S4 | stained | MINOR, consistency | **Corrected 2026-08-21.** The original entry named stained, untangle and carrom, on the evidence that they do not load `shared/sfx.js`. Two of the three do have sound, written inline rather than taken from the toolkit: Untangle carries its own `AudioContext`, five cues and a speaker toggle at the canvas top-left that persists to `zamborin-untangle.sound`, and Carrom has its own as well. **Stained is the only one of fifteen with no sound at all.** Not loading a shared file is not the same as not having the feature; the check has to be for the behaviour. | OPEN, and now one game not three |
| T1 | tailwind, stained | MINOR | These two were the only games of fifteen not loading `shared/analytics.js`, and they had none of the call sites either, so they reported nothing at all. | FIXED and deployed 2026-08-20. Stained got the full fleet pattern; Tailwind got init + gameStart only, since it has no levels and faking them would break maxLevel fleet-wide. |
| T2 | tailwind | MINOR (AA) | The personal-best figure on each aircraft card was white at 45% over the card, measuring 4.37:1 at 12px against a 4.5:1 bar. | FIXED and deployed 2026-08-20, raised to 55% which measures 5.83:1. |
| T3 | tailwind | LOW (AA) | The sound glyph in its OFF state is white at 34%, measuring 2.96 to 3.11:1 depending on the panel behind it. Graphical objects want 3:1, so it passes over two backgrounds and fails over the third. | OPEN |
| T4 | site-wide | MINOR | Em dashes in body copy on 7 of the 15 games plus the homepage, about 26 instances (tessera 6, zood 4, ludo 4, tailwind 3, untangle 3, carrom 3, needle 1, index 2). The `Name — A Zamborin Game` title pattern is on all 15 and reads as deliberate branding. | OPEN, owner's call |
| T5 | site-wide | OBSERVATION | Canvas copy runs 10 to 15px across the fleet, under the site's 16px content-copy floor. Tailwind's stat-bar labels are the smallest at 10px. The floor was written for CSS text classes with a badge exemption, so this may be out of scope by design. | OPEN, owner's call |
| U1 | untangle, tessera | BREAKS PLAY (embed) | A game loaded inside a HIDDEN iframe and revealed later renders nothing, permanently. `safeViewport()` filters every reading above 120px, a `display:none` frame reports 0 for all of them, the filter empties, and `Math.min()` of an empty list is **Infinity**. That became the logical canvas size and left the 2d transform at **scale 0**: a canvas of exactly the right pixel size that paints nothing, and goes on painting nothing after the frame is shown. Measured 2026-08-21, scale 0.000 in both games. A closed accordion, an inactive tab panel and an off-screen carousel slide are all ordinary ways for a partner to place an embed. Untangle and Tessera bake their layout at load; Fold recomputes on resize and escapes, Tailwind escapes by another route. | FIXED 2026-08-21 on branch `qc-obvious-fixes`, verified across 10 reveal cases |
| U2 | untangle | VISUAL (short frames) | The instructions card is a stack of fixed offsets either side of the frame's centre, with no clamp and no scale, so on a short frame it runs off the TOP rather than overlapping itself. Swept 145 heights: the boundary is exactly **430px of viewport height**, and below it the overhang grows 5px at 420, 35px at 360, 65px at 300. That takes "HOW TO PLAY" and then the top of the title. Hits every phone held sideways and the 480x360 embed. Not a lockout, because the rules and the button stay on screen. | FIXED 2026-08-21, 188 probes, one 2px failure left at 300px tall |
| U3 | untangle, tessera | VISUAL | Both draw a dashed **"AD · 320 × 50" placeholder** into the canvas on mobile, ungated. Every HTML ad slot on the same page is hidden behind `body.ads-on`, which nothing sets, so a phone player saw an empty box advertising an ad slot under the board. The only two games of fifteen that do this. | FIXED 2026-08-21, gated on `ads-on`; the band stays reserved so switching ads on is still a visual no-op |
| U4 | untangle | MINOR, feature gap | **No undo and no restart**, and no way back to an earlier level. Of the nine levelled puzzles, the other eight all have both. It also makes two pieces of copy untrue: the game page says "solve it first, then learn the shape and beat your own score" and the guide says "replay and beat your own par", and there is no route to a replay. The per-level best IS stored, at `zamborin-untangle.best.L<n>`, and can never be improved. | OPEN, owner's call: add a Restart pill, or correct both sentences |
| U5 | untangle | ACCESSIBILITY, moderate | White on the accent `#D8523F` measures **4.04:1** at 14px bold. 14px bold is not large text, so the bar is 4.5:1. This is the START / CONTINUE button and the NEXT LEVEL button, the primary action on both screens. The tier name in the HUD is the same accent on the page background at **4.07:1**. The house CTA in `shared/ui.js` is white at 17px on "the game's accent", so this is a palette question rather than an untangle bug, and Tailwind, Tessera, Kaleido and Ludo carry the same `#D8523F`. Null-tested: white/black 21.00, white/white 1.00, #767676/white 4.54. | OPEN, owner's call, it is a brand colour |
| U6 | untangle | MINOR (AA) | Three of the twelve vertex colours fall under the 3:1 bar for graphical objects against the playfield: `#C2185B` at 2.45, `#7E57C2` at 2.76, `#3D5AFE` at 2.80. Mitigated in practice by each dot's own glow and a white highlight, and dot colour carries no meaning in this game, so it is legibility rather than information loss. | OPEN |
| W1 | tarmac | NOT A FINDING, withdrawn | Logged as an SEO exposure because `tarmac/` is a bare prototype page carrying no `noindex` while the other eight shelved prototypes all carry one. **It is in `.gitignore`, so it is not in the repo and Vercel has never had it**; `zamborin.com/tarmac/` is a 404. It is the only page of the 49 on disk that is not deployed. A `noindex` was added to the local copy anyway, which is untracked and therefore not in this branch. | WITHDRAWN, no live exposure |
| W2 | site-wide | MINOR, caching | All 16 guide pages asked for `shared/chrome.css?v=13` while the other 30 pages asked for `?v=14`. A returning visitor with v13 cached keeps getting the older stylesheet on guides only, so one site served two different chromes to the same person. | FIXED 2026-08-21 |
| W3 | llms.txt | FACTUAL | The file written specifically to tell AI crawlers what the site is described **Untangle as a "Daily planar-graph puzzle ... same puzzle for everyone today (daily seed)"** and **Ludo as having a "Daily seed shared across all players"**. Neither is true: Untangle seeds from the level number and nothing else, and Ludo has no date logic anywhere and rolls `Math.random()`. Tessera's cross-link also called Untangle daily. | FIXED 2026-08-21, all three corrected against the code |
| W4 | embed/ | SEO | The Embed page's `og:image` pointed at `images/zamborin-og.jpg`, which does not exist. The one page most likely to be shared with a prospective partner had a broken share card. Found only after extending the link checker to `content=` attributes; it had been checking `href` and `src` only. | FIXED 2026-08-21, repointed at `zamborin-og-image.jpg` |
| W5 | cookies/, terms/, faq/, embed/ | MINOR, SEO | Cookies and Terms had no Open Graph or Twitter tags at all; FAQ and Embed had Open Graph but no Twitter card. Every other page has the full set. | FIXED 2026-08-21, mirroring the existing title and description, no new copy |
| W6 | shared/new-game-template | MINOR, would repeat | The scaffold was three fixes behind the fleet: `chrome.css?v=13`, `analytics.js?v=2`, **no `shared/embed.js` at all**, and the favicon and logo by root-absolute path, which is the K2 bug the fleet was swept for. The next game copied from it would have shipped with no embed support and a logo that 404s off-origin. | FIXED 2026-08-21, template and README |
| W7 | vercel.json | OBSERVATION | The framing guard covers the ten content pages. The nine shelved prototypes (socket, bunny, empyrean, foldfig, pane, pins, plumb, tarmac, wire) carry no guard, so any site can iframe them and serve them off our bandwidth. Socket in particular is delisted but complete and playable. | OPEN, owner's call |
| W8 | stained, mobile | MINOR | S5 is not stained alone. Loaded in a 1000x700 frame, thirteen games scale the 760x600 board down to fit; **stained and mobile both hold exactly 760x600**. Same cause, same fix, and the same caution applies: the pinning was itself the fix for the narrow-strip bug. | OPEN, extends S5 |
| W9 | ludo | OBSERVATION | The computer opponents pick a random legal move, marked `AI (placeholder — random legal moves)` in the source. No page claims more than "computer opponents", so nothing is untrue, but the guide invites the reader to "put it into practice against three AI opponents". The homepage card also says "Roll the die" where the game rolls two. | OPEN, owner's call |
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
- **P4 (fold, WITHDRAWN 2026-08-21).** `fold/Images/` is 24 MB of 147 jpegs and is
  referenced nowhere in the repo. It looks like the pre-conversion source of the
  148 webp files the game actually uses in `fold/art/`. **It is gitignored and has
  never been committed**, so it is not deploy weight; see the corrected O1.
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


## Tailwind audit, 2026-08-20

**Functionality: partial, and the part I could measure is strong.** The game has no
browser debug handle, but it ships a Node gate harness (`tailwind/measure.js`), so I ran
that instead of clicking. Against the game's own stated thresholds, printed at the bottom
of its own output:

| Its threshold | Measured | |
|---|---|---|
| random near 85% of informed means no skill | 43 to 50% | pass |
| by feel well under informed means a needle | 84 to 86% | pass |
| adjacent-cell jump p99 over 15% means cliffs | 5 to 13% | pass |
| bounce share over 25% means luck decides | 0% | pass |
| a bimodal spread means one lucky outcome dominates | unimodal, peak 253m | pass |
| good region under 2% means a needle | **1% on all six planes** | **at the line** |

Optima are interior (62.5 to 67.7 degrees, pull 0.51 to 0.85) and the wind matrix shows a
wind-blind player losing 17% on the worst day, so the dial is worth reading. See T6.

**Not checked: the input path end to end.** Pick a plane, three timed taps, a launch, and a
best written to storage. The whole game is driven by `requestAnimationFrame`, and the
preview pane in this environment stays hidden, where rAF fires zero frames, so a launch
never advances. Synthetic taps dispatched correctly and no best was recorded, which is the
expected result of a frozen loop rather than evidence of a bug. Needs a visible pane.

**Mobile: pass, and it is the best sizing implementation in the fleet.** 375x812 fills
exactly, aspects match, painted across 99% of width, no horizontal overflow. It carries all
five re-fit listeners plus a `viewport()` that takes the smallest of `innerWidth`,
`visualViewport` and `clientWidth`, pins the canvas as well as the wrap, and refuses to fit
a box whose aspect does not match. Touch mapping scales X by width and Y by height.

**Performance: pass.** No `setInterval`. rAF only.

**SEO: pass.** Every tag present including image dimensions and alt, VideoGame JSON-LD, in
the sitemap.

**Consistency: header, footer, favicon, focus button and canvas label all correct.** T1 and
T4 are the gaps.

**Embed: good.** No frame-busting, no runtime fetches other than one for its own
`./assets/catapult.svg` at load, all asset paths relative, and the 806 KB background already
has a 22 KB low-quality placeholder so it degrades on a slow line. One caveat: that `fetch`
means the folder needs a server and will not run from `file://`.

**The extra JS files are not dead weight.** `balance.js`, `bend.js`, `measure.js`,
`meter.js`, `sweep.js`, `whip.js` and `whip2.js` are Node gate and measurement scripts, the
same convention wire, pane, socket, mobile and bunny follow. They do get deployed, so an
embed bundle should exclude them.

| T6 | tailwind | OBSERVATION, design | The gate's own reading guide says a good region under about 2% is a needle, and every plane measures exactly 1%. But by-feel measures 84 to 86%, which the same guide reads as clearly not a needle. Two of its own metrics disagree, so the question is which one describes the player. Not a QC defect and presumably seen at ship. | OPEN, owner's call |


## A concurrency lesson, 2026-08-20

Two sessions were editing this repo at once. The Tailwind session committed
`bdca2d9` and **swept this session's uncommitted `tailwind/play.js` edits into it**
under its own commit message, but not the matching one-line change in
`tailwind/index.html`.

The result was worse than either change alone: `play.js` called `TRACK()` on every
launch while `index.html` never loaded `shared/analytics.js`, so every call resolved
to its own NOOP fallback. Tailwind reported nothing while looking, in the code, like
it did. A silent half-fix is harder to spot than no fix.

**How to work when another session is live in this repo:**

- `git status` before and after any commit. Check what you are about to commit is
  only yours.
- If another session's uncommitted work is in the tree, commit only your own files
  by path. Never `git add -A`.
- Before assuming your work was lost, diff your working copy against their commit.
  Here it was byte-identical, so the merge could safely take their version.
- Check for worktrees with `git worktree list`. That session held `main` checked out
  in `/private/tmp/.../tw-main`, so `git checkout main` failed here; push with
  `git push origin HEAD:main` instead.
- After pushing, their worktree is behind. Say so, or the sweep happens in reverse.


## Stained audit, 2026-08-20

**Functionality: pass, and verified two ways.** Every level ships a `witness`, the exact
placement that produces its target, because the generator scrambles from a solved state.

1. Headlessly in Node against `model.js`: all **100** levels, every witness reproduces its
   target exactly, no pane falls off the board.
2. Then through the running game via `window.__stained`: 100 levels, 878 placements, zero
   refusals from `place()`, and all 100 registered as won by the game's own `checkWin`.

Ramp: 2 to 15 panes, 6x6 boards up to level ~60 then 8x8. Undo verified with a real tap on
the pill (placed count 2 to 1), Restart clears the board and resets `won`, and the level is
saved to `zamborin-stained.level.v1` and restored on reload with the card reading Resume.

**Mobile portrait: pass.** 375x812 fills exactly, aspects match to three decimals, no
horizontal overflow, canvas occupies the full viewport confirmed by hit-testing all four
corners. Landscape is S1.

**Performance: pass.** No `setInterval`. The menu runs its own rAF loop only while the card
is open and stops when it closes.

**SEO: everything present except structured data.** See S3.

**Embed: mechanically fine, blocked by S1.** No frame-busting, no runtime fetches, all
asset paths relative, and it runs and resizes in a 480x360 iframe. It is the rules card that
breaks, not the plumbing.

**A note on the numbers.** Stained ships 100 levels, not the 9 it launched with. It also
carries its own fit assertion, `__stained.menuFit()`, which returns `textUnderButton`
directly. Someone anticipated S1 exactly and built the detector; it was never wired to
anything that prevents it.

**Two things I nearly logged and did not.** A dark band down the right and bottom of the
mobile screenshot looked like a sizing bug and was the preview pipeline capturing at a
different scale than the page had laid out. Hit-testing the corners settled it. See
[[feedback-preview-pane-hidden-blanks-canvas]] for the family this belongs to.


## S2: primary pips, built 2026-08-20

An opt-in mode that marks each lit cell with which primaries made it, so the recipe is
readable without relying on hue.

**Corners, not a row.** A row of three slots was tried first and does not work: with one
pip showing you cannot tell which slot it is in unless the empty slots are drawn too, and an
empty slot faint enough to stay subordinate measures about 1.2:1, which is invisible. A
corner locates itself. Red top-left, yellow top-right, blue bottom-left, each drawn only
when present. Bottom-right stays clear of the goal's own unmatched dot.

Ink is picked per glass rather than one colour over all of them. Measured against its own
glass, worst 4.43:1 and best 12.4:1, and it holds under both deuteranopia and protanopia.

Verified by reading canvas pixels: all seven colours draw exactly the pips their recipe
calls for, and none they do not. Toggle sits on the rules card beside Play, the same place
Kaleido puts its switch, and persists to `zamborin-stained.pips.v1`.

**A lesson worth keeping.** Two typo'd coefficients made a simulation that turned mid grey
into bright green, and it produced confident, specific, wrong numbers that a whole
recommendation was built on. Sanity-check any colour transform on neutrals first: white,
mid grey and black must come back unchanged. See [[feedback-simulations-need-a-null-test]].


### Where the marks go, and why not everywhere

Three surfaces read colour: the **goal** (what to make), the **tray** (what you can pick
up) and the **window** (what you have made). The marks go on the first two and deliberately
not the third.

- The goal and the tray are where a colour has to be DECODED. The window is where it is
  looked at, and the goal already flags every cell that does not match yet, so nothing on
  the window needs reading in order to play.
- Measured on level 50, a median board: goal 23 marks, tray 11, window 28. Putting them on
  the window nearly triples the count and puts all of it on the one surface the palette
  and the came work were for.
- **70 of 100 levels hold a confusable PANE pair in the tray at once** (blue+purple 44,
  red+orange 41, yellow+orange 37), which is why a goal-only version would not have worked:
  you could read what was wanted and still not know what you were holding.

The rules-card demo carries the marks too, so the mode teaches its own legend: you watch one
mark meet another and become two. Without that it is a cipher with no key, because working
the legend out from the board requires already knowing what colour a cell is.

### One regression this caused, and the fix

Adding the switch to the rules card cost a pill's worth of height and put the shortest
frames back over the line: 45px of overlap at 480x360 and 14px at 812x375. The single-stage
type shrink could not recover it at its 0.72 floor.

Now two-stage, in Kaleido's order: shrink the DEMO first and drop it outright rather than
keep it too small to read, and only then shrink the copy. Re-verified across eight frames
from 480x360 to 1024x768: all fit, no overlap. All 100 levels still place and win.


## The rules-card bug is a FLEET pattern, swept 2026-08-20

Found in Kaleido, then Stained, then Prism. Rather than keep meeting it one game at a time,
I swept all fifteen for the shape: a canvas rules card whose height is fixed or clamped
against the viewport, with a button anchored to the card's BOTTOM edge. Nine games have no
canvas rules card or no bottom-anchored button and are not at risk.

**Six are, in three variants:**

| Game | Variant | What a player sees at 480x360 | State |
|---|---|---|---|
| kaleido | clamp | button through the copy | FIXED |
| stained | clamp | button through the copy | FIXED |
| prism | clamp | button through the copy | FIXED, copy trimmed too |
| needle | clamp, in TWO places | PLAY across rule 3, rule 4 cut mid-sentence | FIXED, cut to four rules and floor 0.66 |
| bloom | height HARD-CODED at 372px | no overlap today, but the card is 16px taller than the frame and one copy edit from breaking, with no detector | FIXED |
| sluice | no clamp at all | rule 4 cut off and **PLAY entirely off-screen** | FIXED |

Needle carries it twice: the rules card at `play.js:1327` and a second "GOT IT" card at
`play.js:1242`.

**A severity correction.** Five of the six let you start by tapping anywhere, not only on the
button, so an off-screen or overlapped CTA does not strand the player. **Stained was the
exception** and the only one where the card's buttons were the sole live target, which is
why its overlap was the one that could genuinely trap someone. For the others the cost is
unreadable rules, which still matters because the card is the only teaching surface, but it
is comprehension rather than a lockout.

**The shape of the fix, now proven three times:** measure the card at a type scale, shrink
until it genuinely fits, floor 0.72, and leave horizontal geometry alone so a smaller face
wraps to fewer lines. Never scale the button, which is a house size and a touch target.
Where the copy is simply too long for the frame, as in Prism at six rules, the last of it is
an editorial cut, not a mechanical one.


## All six closed, 2026-08-21

Sluice, Bloom and Needle shipped. Every game that had the rules-card bug is fixed.

**Each of the six now carries a `menuFit()` or `rulesFit()` on its debug handle** reporting
the real defect: the gap between the copy's last line and the button's top edge, not merely
whether the card had to be clamped. Prism and Stained both shipped with detectors nothing was
wired to, and the bug lived in them for months. These report a number a future session can
assert on.

### The lesson that cost the most

**Eight sample frames is not a proof.** I checked Needle at eight sizes, reported it fixed
bar one corner, and the owner sent a screenshot of it still broken. Sweeping 713 sizes showed
the overlap ran across a whole BAND — any frame under about 460px tall at narrow widths, and
under 370 at any width — and the samples had landed almost entirely outside it.

A card's fit is a continuous two-dimensional space. Sample it and you learn about the samples.
The grid sweep costs about the same and answers the question. Use `menuFit()` in a loop over
widths 320-1200 and heights 300-900, then check the real device sizes by name.

Needle's final state: ten of ten real sizes clean, iPhone SE through iPad, portrait and
landscape, plus both embed sizes. What is left is under 300px tall, which is shorter than any
screen and any embed anyone would build.


## Embed build shipped, 2026-08-21

`?embed=1` on any game address. Chrome off, game fills the frame, small Zamborin mark
linking back, `noindex, follow` so the variant does not compete with the canonical page.

**The delivery choice did the work.** An iframe rather than a copied folder means the page
is still served from zamborin.com, so every embed gap logged over three days, the favicon
and logo 404ing, the Vercel scripts failing, Google Fonts, relative asset paths, simply
does not arise. K2c is resolved by that alone. It also means a game improves after a
partner has embedded it, which a copied folder can never do.

Most of it already existed: `focus-mode` hid the footer, ads and sidebar and gave the game
the viewport. Embed mode is its cousin, written beside it in `shared/chrome.css`.

**Hardening, from asking how it could be misused rather than whether it worked:**

- Embed plays now carry `embed:1` and the referring hostname. Without it, embed traffic
  silently inflated the site's own figures AND there was no way to show a portal how a game
  performs in an embed, which is the evidence a licensing conversation runs on.
- The free tier no longer covers portals, ad-supported sites, use above roughly 50k plays a
  month, or products with a game inside. It was giving away exactly what there is a budget
  to charge for.
- Framing is restricted to the fifteen games. There were no framing headers at all before,
  so anyone could iframe the contact page or the terms.

**A trap worth remembering:** `trailingSlash` is on, so canonical URLs end in a slash and a
Vercel header `source` of `/about/:path*` does NOT match `/about/`. The first deploy guarded
only the bare `/`. Use literal paths.

**Still open, and neither can be answered from localhost:**

- **Bandwidth is on our bill.** Every embed play is served from our hosting, with no cap and
  no alert. Watch Vercel usage once anyone embeds; the 30-day revocation clause is the lever.
- **Saved progress in a real cross-origin embed is unproven.** The local test frame was
  same-origin so it passed, which says nothing about Safari's tracking prevention or Chrome's
  storage partitioning. Needs a genuine third-party test. If it fails, say so on /embed/
  rather than letting players lose their level.


## Orbit audit, 2026-08-21

**The cleanest game audited so far.** Nothing to fix in the game itself.

**The rules card is right by construction.** Orbit places its button at the y the copy
finished at, rather than anchoring it to the card's bottom edge, so the overlap that hit
six other games cannot happen here. It also scales the card on short screens, floor 0.78.
Swept 192 sizes from 320x300 to 1200x900: **one failure, at 320x300**, which is smaller
than any real screen.

This is worth reading against the six that failed. Same house pattern, same designer, and
the difference is one line: `by` returned from the layout function versus
`py + ph - pad - CTA.h`. Anchoring a button to a box rather than to the content is what
created the whole class of bug.

**Functionality: pass.** Drove all 60 levels through `goto` and `solve`: every one solves,
nothing throws. Par ramps 3 to 16, rings 3 to 5.

**Mobile: pass.** 375x812 and 812x375 both fill exactly with the CSS aspect matching the
backing store to three decimals. All five re-fit listeners present. Canvas labelled
"Orbit puzzle". No console errors, no horizontal overflow.

**Colour: not a concern here**, unlike Stained, Prism and Kaleido. Orbit's signal is lit
versus unlit rather than hue discrimination, and the palette is a single warm gold against
dark. There is one teal used for geared-ring guides, which is the only hue carrying meaning
and it never has to be told apart from another hue.

**SEO, consistency, embed: all pass.** Every tag present, VideoGame JSON-LD, in the sitemap,
no frame-busting, no runtime fetches, sound present, no emoji, no em dashes in canvas copy.


## Untangle audit, 2026-08-21

**Functionality: pass, and verified as a witness rather than by clicking.** Untangle
scrambles a crossing-free circular layout, so putting the dots back on that circle IS
the proof a level is solvable. Added `__untangle.goto(n)` and `__untangle.solve()` and
ran **120 levels across five different frames** (760x600 desktop, 375x812, 320x568,
480x360, 640x480), 600 generations in all: every one solves to zero crossings, none
throws, and **none arrives already solved**, which was the failure the `LEVEL_OFFSET = 2`
comment was written for. Par ramps 3 to 10, starting crossings 2 to 60. Undo and restart
are absent; see U4.

**Mobile: pass.** 375x812 fills exactly, canvas CSS matches the frame and the backing
store is 2x, no horizontal overflow at any of the three sizes swept. All five re-fit
listeners present. Touch mapping scales X by width and Y by height, the correct form.
One caveat worth knowing rather than fixing: rotating the phone mid-level calls
`location.reload()`, and since only the level number is saved, the dots go back to the
scramble. Deliberate, and it is how Tessera behaves too.

**Performance: pass.** `requestAnimationFrame` only; the `setTimeout` calls are one-shot
audio envelopes. The one `setInterval` in the file now is the blind-boot recovery, which
is installed only on a boot that already failed and clears itself.

**Accessibility: partial.** Canvas labelled "Untangle puzzle". Colour is never the only
signal for the mechanic: a crossing edge is red AND pulses AND carries a yellow dot at
the intersection point. Text is comfortable, the dim rules copy 10.47:1 and the muted
labels 5.93:1. The two gaps are U5 and U6. No aria-live region, same as Kaleido's K3.

**Consistency: near pass.** Header, logo, footer with all nine links, favicon, focus
button, splash, VideoGame JSON-LD. The canvas hint row carries one em dash,
"DRAG ANY DOT — REMOVE EVERY CROSSING", which is body copy rather than the title pattern.
Sound is present, contradicting S4.

**SEO: pass.** Every tag including og:image dimensions and alt, and in the sitemap.

**Embed: pass, after U1.** No frame-busting, no runtime `fetch`, every asset path
relative, localStorage namespaced to `zamborin-untangle.*`. Runs at both embed sizes.

**Method note.** The preview pane in this environment is permanently `hidden`, so
`innerWidth` is 0 and rAF never fires. Two things unblock that. `resize_window` with
explicit dimensions gives the top-level page a real viewport even while hidden, and an
**iframe harness** gives any size you like: an iframe styled 375x812 reports exactly that
to its own `window`, regardless of the parent. Every number above came from a same-origin
iframe. What it still cannot do is paint, so nothing here is a screenshot.


## The rules-card sweep found a seventh game, 2026-08-21

Untangle was cleared in the fleet sweep because its button is placed at the y the copy
finished at, which is the Orbit pattern and is right. It has the OTHER failure mode:
the whole card is a stack of fixed offsets either side of the frame's centre, with no
clamp and no scale, so a short frame clips it at the top instead of overlapping it.

Sweeping 145 heights at 375 wide put the boundary at exactly **430px**, and a width
sweep at 23 widths from 320 to 1200 showed the overhang identical at every one of them,
which reduces a 2D question to a 1D one and is worth knowing for the next game: in
mobile mode this layout depends on height alone.

The fix follows the two-stage pattern: shrink the copy, and once shrinking further would
go under 0.85 scale, drop the decorative eyebrow outright rather than keep it too small
to read. The button never scales. Re-swept 188 probes, 145 heights plus 23 widths plus
20 named device and embed sizes: **one failure left, 2px of button below the panel on a
300px-tall frame.** Above 435px the layout is byte-identical to what shipped, so nothing
changes on any phone in portrait, any tablet, any desktop or the 640x480 embed.

`__untangle.rulesFit()` reports `overTop`, `overBottom`, `scale` and whether the eyebrow
survived, so this is assertable from now on.


## The hidden-iframe bug, 2026-08-21

The most serious thing found. `Math.min()` of an empty array is `Infinity`, and
`safeViewport()` produces an empty array whenever no reading clears 120px, which is
exactly what a `display:none` iframe reports. Infinity became the logical canvas size and
`Math.min(backingW / Infinity, ...)` set the 2d transform to **scale 0**. The canvas is
sized correctly and paints nothing, before and after the frame is shown.

**Three things about this were only learnt by measuring, and two of them were wrong first.**

1. The first test revealed the frame in PORTRAIT and the game recovered, which looked
   like the bug was harmless. It recovered by accident: the orientation watcher saw
   portrait flip from false to true and reloaded. Revealed in LANDSCAPE the flag does not
   change, nothing reloads, and the transform stays at 0.
2. The obvious fix, reload on the next `resize`, does not work. **An iframe going from
   `display:none` at 0x0 to visible at 700x390 fires ZERO resize events on its own
   window**, even though `innerWidth` goes 0 to 700. Measured directly with a counter.
3. `ResizeObserver` on the document element, the usual answer, fired in **one of six**
   trials. A `display:none` document has no layout box and no animation frames.

So the recovery is a 250ms poll, installed only when the boot was already blind, cleared
the moment it succeeds and abandoned after a minute. Verified across 10 cases, two games
by five reveal sizes: every one now rebuilds against the real frame exactly, and the
never-revealed case sits harmlessly on a 390x700 fallback instead of Infinity.

Fold has the same `safeViewport` but recomputes on resize, so it self-heals; its
`vp.w || 390` guard was hardened to `Number.isFinite` anyway, because Infinity is truthy
and that guard never fired. Tailwind escapes by another route.


## Site-wide sweep, 2026-08-21

Run before the Untangle audit, as a pass over everything rather than one game.

**What is clean.** Every `href` and `src` in all 53 HTML files resolves. Every CSS
`url()` resolves. All 49 pages load with no failed request other than the two Vercel edge
scripts, which have no local file and are expected. No `console.log`, no `debugger`, no
TODO in any shipped game. No duplicate titles or descriptions anywhere. All 15 games are
in the sitemap, all 15 have a guide, every guide links back to its game and every game
links forward to its guide. Socket is unlinked from every live page.

**A hole in my own tooling.** The link checker read `href` and `src` and not `content`,
so every `og:image` on the site had gone unchecked. Extending it found W4 immediately.
Check the attribute the value actually lives in, not the attribute links usually live in.

**Long titles and descriptions, not logged as a defect.** Fourteen guide titles run past
60 characters and 26 descriptions past 160, so Google will truncate them in results.
There is no penalty for it and the copy is deliberate, so this is an editorial call
rather than a finding.

**Check what is DEPLOYED, not what is on disk.** Two entries in this tracker were built on
the assumption that a folder on disk is a folder on the server. `git ls-files` settles it in
one command, and it withdrew W1 and rewrote O1 and P4. Of the 49 pages on disk, 48 are in the
repo; `tarmac/` is gitignored and has never been deployed. The 28 MB of unreferenced source
art in `orbit/splash-images/` and `fold/Images/` is gitignored too and has never been in a
commit, so it was never deploy weight and never in history. This belongs with
[[feedback-unreferenced-assets-by-code-path]]: the question is always what the deployed
artefact actually contains.
