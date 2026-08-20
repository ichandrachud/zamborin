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
| 3 | tailwind | OK | OK | OK | OK | OK | OK | OK | audited 2026-08-20, T1 + T2 fixed. T3-T6 open, none breaking play |
| 4 | stained | OK | ! | OK | ! | ~ | ! | ! | audited 2026-08-20; see S1-S4 |
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
| S1 | stained | BREAKS PLAY (phone landscape) + EMBED GAP | The rules card clamped its height while the copy kept flowing, so the Resume button drew through the rules and the last two were unreadable. Measured overlap 170px at 480x360, 134px at 812x375 in mobile mode which is a phone turned sideways, 29px even at 640x480. Fine at 760x600 and 375x812. | FIXED on branch `fix-stained-rules-card`, not yet deployed |
| S2 | stained | ACCESSIBILITY, moderate | No colourblind mode, and the mechanic is reading which primaries overlap. **Corrected 2026-08-20:** the first measurement used a colour-vision simulation with two wrong coefficients in its inverse matrix and overstated this badly. Redone with a matrix that maps neutrals to neutrals: under deuteranopia NO pair falls below dE 10, and under protanopia one does, red vs brown at 8.5, with blue vs purple at 10.8. Tight rather than collapsed. It still matters because red is R alone and brown is all three, the most expensive confusion on the board, and 55 of the 100 levels carry both. | BUILT on branch `fix-stained-rules-card`, opt-in, not yet deployed |
| S3 | stained | SEO | No `VideoGame` JSON-LD. The only game of fifteen with no structured data at all. | FIXED on the same branch |
| S5 | stained | MINOR | On desktop `resizeCanvas` pins the canvas to exactly 760x600 CSS px and it never scales down, so in a short window the board runs below the fold. At a 1366x620 laptop it is 108px under and the page scrolls, so it is reachable; at extreme sizes the wrap clips it and the page does not grow. Kaleido handles the same case by letting CSS scale it to fit, so there is a known-good reference. The pinning was itself a fix for the narrow-strip bug, so do not simply revert it. | OPEN |
| S4 | stained, untangle, carrom | MINOR, consistency | These three load no `shared/sfx.js` and have no sound or sound toggle. The other twelve do. | OPEN |
| T1 | tailwind, stained | MINOR | These two were the only games of fifteen not loading `shared/analytics.js`, and they had none of the call sites either, so they reported nothing at all. | FIXED and deployed 2026-08-20. Stained got the full fleet pattern; Tailwind got init + gameStart only, since it has no levels and faking them would break maxLevel fleet-wide. |
| T2 | tailwind | MINOR (AA) | The personal-best figure on each aircraft card was white at 45% over the card, measuring 4.37:1 at 12px against a 4.5:1 bar. | FIXED and deployed 2026-08-20, raised to 55% which measures 5.83:1. |
| T3 | tailwind | LOW (AA) | The sound glyph in its OFF state is white at 34%, measuring 2.96 to 3.11:1 depending on the panel behind it. Graphical objects want 3:1, so it passes over two backgrounds and fails over the third. | OPEN |
| T4 | site-wide | MINOR | Em dashes in body copy on 7 of the 15 games plus the homepage, about 26 instances (tessera 6, zood 4, ludo 4, tailwind 3, untangle 3, carrom 3, needle 1, index 2). The `Name — A Zamborin Game` title pattern is on all 15 and reads as deliberate branding. | OPEN, owner's call |
| T5 | site-wide | OBSERVATION | Canvas copy runs 10 to 15px across the fleet, under the site's 16px content-copy floor. Tailwind's stat-bar labels are the smallest at 10px. The floor was written for CSS text classes with a badge exemption, so this may be out of scope by design. | OPEN, owner's call |
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
