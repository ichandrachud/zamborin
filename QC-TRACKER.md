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
| 2 | bloom | OK | OK | OK | OK | ~ | OK | OK | audited 2026-08-22. 150/150 solve on both modes. B1 is a copy claim, not a defect |
| 3 | tailwind | OK | OK | OK | OK | OK | OK | OK | audited 2026-08-20, T1 + T2 fixed. T3-T6 open, none breaking play |
| 4 | stained | OK | ! | OK | ! | ~ | ! | ! | audited 2026-08-20; see S1-S4 |
| 5 | kaleido | OK | OK | OK | ~ | ~ | OK | ! | audited 2026-08-20; K1-K4, and K5 found 2026-08-21 night by the new detector |
| 6 | prism | OK | OK | OK | ~ | OK | OK | OK | audited 2026-08-20; rules card fixed + copy trimmed. One tight colour pair, P1 |
| 7 | needle | OK | OK | OK | ~ | OK | OK | OK | audited 2026-08-22. 120/120 plus its own 360-board audit, 0 failures. N1 open |
| 8 | untangle | OK | OK | OK | ~ | OK | OK | OK | audited 2026-08-21. U1-U4 fixed, U5-U8 open |
| 9 | tessera | ~ | OK | OK | ~ | ~ | OK | OK | audited 2026-08-21 night. TE1 open, AX clean bar the shared accent. FN not driven, it is an endless arcade game |
| 10 | sluice | OK | OK | OK | - | OK | OK | OK | audited 2026-08-21 night. 100/100 levels solve. Only AX left |
| 11 | fold | OK | OK | OK | - | ~ | OK | OK | audited 2026-08-21 night. 60/60 levels solve. FO1-FO3 open |
| 12 | mobile | OK | OK | OK | ~ | OK | OK | OK | audited 2026-08-21 night, 39/39 balance exactly. **M4 was a dead end and is fixed.** M1-M3 open |
| 13 | zood | ~ | ! | OK | - | OK | - | OK | 2026-08-22: handle added, 9 sizes clean on load. **Z1 rotation OPEN, and `rotationSafe` now reports it** |
| 14 | carrom | ~ | OK | OK | - | ~ | - | OK | 2026-08-22: handle added, 9 sizes clean, survives rotation. Z3 open |
| 15 | ludo | ~ | OK | OK | - | OK | - | OK | 2026-08-22: handle added, **Z1 FIXED**, 9 sizes clean, state survives 9 rotations |

Row order matches the homepage card order.

## Issue log

Severity: **BREAKS PLAY** | **VISUAL** | **MINOR** | **EMBED GAP**

| ID | Game | Sev | Issue | State |
|---|---|---|---|---|
| E1 | empyrean | BREAKS PLAY (if committed) | Finder renames in the working tree would have 404'd the desert background and swapped the Zephyr sprite. Verified by hash, not just size. | FIXED 2026-08-20, files restored from git, nothing lost |
| K1 | kaleido | EMBED GAP + VISUAL | Rules card overflows in a small container: the Colourblind and PLAY buttons draw on top of rules 3 and 4, and rule 4 is clipped. Reproduced at 480x360 and 480x430, in a plain window as well as an iframe. Fine at 640x480, 760x600, 375x812 and 812x375. | FIXED and deployed. Verified in the tree 2026-08-21. |
| K2 | all 15 games | EMBED GAP | Favicon and logo loaded by root-absolute path in every game, so they 404 off-origin. Scanned all 15: exactly the same four root-absolute references in each. | FIXED and deployed. All 15 games verified relative 2026-08-21. |
| K2b | tessera | EMBED GAP | Worse case of K2: `tessera/play.js` loaded both HOW TO PLAY instruction images by root-absolute path, so off-origin the game's own teaching screen would have lost its art. | FIXED on the same branch |
| K2c | all 15 games | EMBED GAP, RESOLVED 2026-08-21 by the iframe embed: the page is served from zamborin.com, so the Vercel scripts load normally. The problem only existed for a copied folder. | `/_vercel/insights/script.js` and `/_vercel/speed-insights/script.js` are Vercel edge endpoints with no file in the repo, so they cannot be made relative. Off-origin they 404 harmlessly and analytics simply do not record. Would need an embed build that omits them. | ACCEPTED |
| O1 | orbit, fold | **CORRECTED 2026-08-21, and it changes the decision** | The entry said about 28 MB of working art was "deployed and never served", and the same premise sits behind P4. **Neither folder is deployed.** `orbit/splash-images/` and `fold/Images/` are both named in `.gitignore` and `git ls-files` returns zero files for each, so they have never been in a commit and Vercel has never received them. The tracked repo is 142 MB. The cost of keeping them is local disk, not bandwidth or deploy weight, and git history is not holding them either. | The deletion question is now purely about tidiness. Owner's call, but with no cost to leaving them |
| P1 | prism | ACCESSIBILITY, moderate | Blue vs purple measure 4.2 dE apart under deuteranopia, B alone versus R+B, which is tighter than Stained's worst pair. Everything else is comfortable and protanopia has nothing under 10. Stained's corner-pip mode would transplant almost unchanged. | **RE-CATEGORISED 2026-08-22, and it is NOT a quick fix.** Prism's channels are additive-mixing semantics: 1 is Red, 2 Yellow, 4 Blue, and **5 is red+blue, which is why it is Purple**. Recolouring purple to separate it from blue would break "red plus blue makes purple", which is the mechanic itself. `CNAME` already names every colour but is used only in the debug handle and never drawn, so the player has no non-colour signal at all today. The fix is a feature, pips or shapes on the gems as Stained did, not a tweak. Moved back to the owner's list |
| K3 | kaleido | MINOR | No aria-live region, so a screen reader is told nothing when the board changes. The canvas itself is labelled. | **FIXED 2026-08-22.** `.sr-only` added to `shared/chrome.css` so the other fourteen can adopt it, a `role=status aria-live=polite` region added to the page, and `announce()` wired into `after()`, the one funnel every board change already passes through, so placing, clearing, undo and hint are all covered by one call. It also announces on level START, which the first version missed: without it the first thing ever spoken is the result of a move. Verified: hidden correctly at 1px with `clip-path: inset(50%)`, and it reads "0 of 11 panes placed." on entering level 40 and "Window 40 complete." on solving it. **No other game on the site has a live region**, so this is the first of fifteen |
| S1 | stained | BREAKS PLAY (phone landscape) + EMBED GAP | The rules card clamped its height while the copy kept flowing, so the Resume button drew through the rules and the last two were unreadable. Measured overlap 170px at 480x360, 134px at 812x375 in mobile mode which is a phone turned sideways, 29px even at 640x480. Fine at 760x600 and 375x812. | FIXED and deployed. `menuFit` verified present 2026-08-21. |
| S2 | stained | ACCESSIBILITY, moderate | No colourblind mode, and the mechanic is reading which primaries overlap. **Corrected 2026-08-20:** the first measurement used a colour-vision simulation with two wrong coefficients in its inverse matrix and overstated this badly. Redone with a matrix that maps neutrals to neutrals: under deuteranopia NO pair falls below dE 10, and under protanopia one does, red vs brown at 8.5, with blue vs purple at 10.8. Tight rather than collapsed. It still matters because red is R alone and brown is all three, the most expensive confusion on the board, and 55 of the 100 levels carry both. | SHIPPED, opt-in. Verified in the tree 2026-08-21. |
| S3 | stained | SEO | No `VideoGame` JSON-LD. The only game of fifteen with no structured data at all. | FIXED on the same branch |
| S5 | stained | MINOR, premise questioned 2026-08-21 (see W8) | On desktop `resizeCanvas` pins the canvas to exactly 760x600 CSS px and it never scales down, so in a short window the board runs below the fold. At a 1366x620 laptop it is 108px under and the page scrolls, so it is reachable; at extreme sizes the wrap clips it and the page does not grow. Kaleido handles the same case by letting CSS scale it to fit, so there is a known-good reference. The pinning was itself a fix for the narrow-strip bug, so do not simply revert it. | OPEN |
| S4 | stained | MINOR, consistency | **Corrected 2026-08-21.** The original entry named stained, untangle and carrom, on the evidence that they do not load `shared/sfx.js`. Two of the three do have sound, written inline rather than taken from the toolkit: Untangle carries its own `AudioContext`, five cues and a speaker toggle at the canvas top-left that persists to `zamborin-untangle.sound`, and Carrom has its own as well. **Stained is the only one of fifteen with no sound at all.** Not loading a shared file is not the same as not having the feature; the check has to be for the behaviour. | **CLOSED 2026-08-24, superseded by the sound block.** Stained now loads `shared/sfx.js` and uses `glass`, `turn`, `pop`, `click` and `win`, with a mute pill in its control row. The entry also asserted Stained was the only silent game of fifteen, which S6 disproved: Needle was silent too |
| T1 | tailwind, stained | MINOR | These two were the only games of fifteen not loading `shared/analytics.js`, and they had none of the call sites either, so they reported nothing at all. | FIXED and deployed 2026-08-20. Stained got the full fleet pattern; Tailwind got init + gameStart only, since it has no levels and faking them would break maxLevel fleet-wide. |
| T2 | tailwind | MINOR (AA) | The personal-best figure on each aircraft card was white at 45% over the card, measuring 4.37:1 at 12px against a 4.5:1 bar. | FIXED and deployed 2026-08-20, raised to 55% which measures 5.83:1. |
| T3 | tailwind | LOW (AA) | The sound glyph in its OFF state is white at 34%, measuring 2.96 to 3.11:1 depending on the panel behind it. Graphical objects want 3:1, so it passes over two backgrounds and fails over the third. | **FIXED 2026-08-22.** The bar is only 82% opaque, so the photograph behind it decides: white at 0.34 measured 3.10 over grass but 2.90 over mid sky and 2.70 over bright sky. Raised to 0.45, which measures 4.43 / 3.96 / 3.57 across those three and is still half the lit state's 0.92, so off still reads as off |
| T4 | site-wide | MINOR | Em dashes in body copy on 7 of the 15 games plus the homepage, about 26 instances (tessera 6, zood 4, ludo 4, tailwind 3, untangle 3, carrom 3, needle 1, index 2). The `Name — A Zamborin Game` title pattern is on all 15 and reads as deliberate branding. | **FIXED 2026-08-24, and the count was wrong in the entry.** T4 said about 26 instances. Measured properly it was **114 visible**, and it split into two populations that need opposite treatment. **~36 are `Name — description` label separators**: the game lists on the homepage and About, section headings like "Blockades — stack two tokens", and `<strong>Easy</strong> — …` definitions. Those are the same deliberate pattern the page titles use and they are KEPT. **75 were running prose**, all in seven guide pages, and those are rewritten one at a time with the punctuation each sentence actually wanted: a colon where the second half explains the first, a full stop where it was really two sentences, a comma where it was an aside. A mechanical swap to commas would have produced worse prose than the em dashes. Verified: 9 pages re-audited at 390x844 with zero problems, so no markup was broken |
| T5 | site-wide | OBSERVATION | Canvas copy runs 10 to 15px across the fleet, under the site's 16px content-copy floor. Tailwind's stat-bar labels are the smallest at 10px. The floor was written for CSS text classes with a badge exemption, so this may be out of scope by design. | **CLOSED AS ACCEPTED 2026-08-23, out of scope by design.** The 16px floor was written for CSS text CLASSES with a stated exemption for chrome, badges and timestamps. Canvas HUD labels are chrome: a level counter, a par figure, a stat-bar label. Enforcing the floor on them would inflate every game's HUD to fix something the rule was never aimed at. The floor still applies, and still does apply, to document copy, which is where W17 and W20 live |
| U1 | untangle, tessera | BREAKS PLAY (embed) | A game loaded inside a HIDDEN iframe and revealed later renders nothing, permanently. `safeViewport()` filters every reading above 120px, a `display:none` frame reports 0 for all of them, the filter empties, and `Math.min()` of an empty list is **Infinity**. That became the logical canvas size and left the 2d transform at **scale 0**: a canvas of exactly the right pixel size that paints nothing, and goes on painting nothing after the frame is shown. Measured 2026-08-21, scale 0.000 in both games. A closed accordion, an inactive tab panel and an off-screen carousel slide are all ordinary ways for a partner to place an embed. Untangle and Tessera bake their layout at load; Fold recomputes on resize and escapes, Tailwind escapes by another route. | FIXED and DEPLOYED 2026-08-21, verified across 10 reveal cases and confirmed live |
| U2 | untangle | VISUAL (short frames) | The instructions card is a stack of fixed offsets either side of the frame's centre, with no clamp and no scale, so on a short frame it runs off the TOP rather than overlapping itself. Swept 145 heights: the boundary is exactly **430px of viewport height**, and below it the overhang grows 5px at 420, 35px at 360, 65px at 300. That takes "HOW TO PLAY" and then the top of the title. Hits every phone held sideways and the 480x360 embed. Not a lockout, because the rules and the button stay on screen. | FIXED and DEPLOYED 2026-08-21. Re-swept after the control row landed: zero failures, 300 to 1000px |
| U3 | untangle, tessera | VISUAL | Both draw a dashed **"AD · 320 × 50" placeholder** into the canvas on mobile, ungated. Every HTML ad slot on the same page is hidden behind `body.ads-on`, which nothing sets, so a phone player saw an empty box advertising an ad slot under the board. The only two games of fifteen that do this. | FIXED and DEPLOYED 2026-08-21, gated on `ads-on`; the band stays reserved so switching ads on is still a visual no-op |
| U5 | untangle, tessera, stained, ludo, tailwind, and 3 content pages | ACCESSIBILITY, moderate | White on the accent `#D8523F` measured **4.04:1** as a button fill, and the accent AS TEXT measured **4.07:1** on a card. One colour was doing two jobs that pull in opposite directions. | **RESOLVED 2026-08-22** by the token split. See the write-up below |
| U6 | untangle | MINOR (AA) | Three of the twelve vertex colours fall under the 3:1 bar for graphical objects against the playfield: `#C2185B` at 2.45, `#7E57C2` at 2.76, `#3D5AFE` at 2.80. Mitigated in practice by each dot's own glow and a white highlight, and dot colour carries no meaning in this game, so it is legibility rather than information loss. | **FIXED 2026-08-22.** Each of the three lifted along its own hue to 3.30, matching `#00897B` which was already the lowest passing one: `#C2185B` to `#CE477C`, `#7E57C2` to `#8A67C8`, `#3D5AFE` to `#506AFE`. All twelve now clear 3:1 and the tightest pair among them is dE 14.9, so nothing became confusable |
| W1 | tarmac | NOT A FINDING, withdrawn | Logged as an SEO exposure because `tarmac/` is a bare prototype page carrying no `noindex` while the other eight shelved prototypes all carry one. **It is in `.gitignore`, so it is not in the repo and Vercel has never had it**; `zamborin.com/tarmac/` is a 404. It is the only page of the 49 on disk that is not deployed. A `noindex` was added to the local copy anyway, which is untracked and therefore not in this branch. | WITHDRAWN, no live exposure |
| W2 | site-wide | MINOR, caching, DEPLOYED | All 16 guide pages asked for `shared/chrome.css?v=13` while the other 30 pages asked for `?v=14`. A returning visitor with v13 cached keeps getting the older stylesheet on guides only, so one site served two different chromes to the same person. | FIXED and DEPLOYED 2026-08-21 |
| W3 | llms.txt | FACTUAL | The file written specifically to tell AI crawlers what the site is described **Untangle as a "Daily planar-graph puzzle ... same puzzle for everyone today (daily seed)"** and **Ludo as having a "Daily seed shared across all players"**. Neither is true: Untangle seeds from the level number and nothing else, and Ludo has no date logic anywhere and rolls `Math.random()`. Tessera's cross-link also called Untangle daily. | FIXED and DEPLOYED 2026-08-21, all three corrected against the code and confirmed live |
| W4 | embed/ | SEO | The Embed page's `og:image` pointed at `images/zamborin-og.jpg`, which does not exist. The one page most likely to be shared with a prospective partner had a broken share card. Found only after extending the link checker to `content=` attributes; it had been checking `href` and `src` only. | FIXED and DEPLOYED 2026-08-21, repointed at `zamborin-og-image.jpg`, which returns 200 live |
| W5 | cookies/, terms/, faq/, embed/ | MINOR, SEO | Cookies and Terms had no Open Graph or Twitter tags at all; FAQ and Embed had Open Graph but no Twitter card. Every other page has the full set. | FIXED and DEPLOYED 2026-08-21, mirroring the existing title and description, no new copy |
| W6 | shared/new-game-template | MINOR, would repeat | The scaffold was three fixes behind the fleet: `chrome.css?v=13`, `analytics.js?v=2`, **no `shared/embed.js` at all**, and the favicon and logo by root-absolute path, which is the K2 bug the fleet was swept for. The next game copied from it would have shipped with no embed support and a logo that 404s off-origin. | FIXED and DEPLOYED 2026-08-21, template and README |
| W7 | vercel.json | RESOLVED 2026-08-21 | The framing guard covered the ten content pages and left the nine shelved prototypes open, so any site could iframe them off our bandwidth. **Closed by deleting them** rather than by adding headers: the only routes left are the fifteen games, which are meant to be framable, and the content pages, which are guarded. |
| W8 | mobile | RESOLVED 2026-08-21 | Mobile's `fitFullscreen` shrank the WRAP to the height available below the header and `resizeCanvas` never shrank the canvas element to match, so under `overflow: hidden` the game was cut off: measured at a 1280x620 window, wrap 588x464 against a 760x600 canvas, 172px of width and 136px of height never on screen. Fixed by giving both boxes in one `setBox()`, which makes the two unable to disagree rather than merely agreeing today. Re-measured at ten window sizes from 1280x900 down to 1280x500 and on two phones: **zero clipped pixels at every one**, with the transform scaling from 2.0 down to 1.2 so the whole sculpture stays on screen. | DONE |
| U4 | untangle | RESOLVED and DEPLOYED 2026-08-21 | Undo and Restart added, and the game moved onto `shared/ui.js`. The control row is a house icon pill plus Undo and Restart, 40px tall, the same physical size as Prism's. Undo restores the dot exactly and **costs a move**, which is the rule Prism, Sluice, Bloom and Orbit already share for a scored counter, and is what dragging the dot back by hand would cost anyway. Restart re-lays the level with the counter at zero and does not re-fire `gameStart`. Keyboard z and r. The "beat your own score" tip is gone from the game page, and the How-to-play paragraph now states the undo cost plainly. | DONE |
| U7 | untangle | VISUAL, pre-existing | The WIN card overflows the frosted playfield panel on a short frame. It needs about 350px of panel and the panel is `PLAY_H + 12`, so it overflows below roughly 530px of viewport height, which is every phone in landscape. It stays legible, because it spills onto a background of nearly the same colour, but it collides with the HUD above and the control row below. Not caused by the control band, which cost it 20px of an already-failing budget. `__untangle.winFit()` reports it. Fixing it properly means letting the win card use the whole frame rather than the playfield panel when the panel is too short, which is a redesign rather than a scale. | **FIXED 2026-08-22** with the full-frame fallback, the fourth game to get it. 112 probes: zero win-card failures, zero rules-card failures, control row correct at every one, and the frame is used at 24 of them. Landscape phones keep SHARE at 0.87 where they used to lose it |
| U8 | untangle, tessera | OBSERVATION | The mobile layout reserves 50px of banner plus 22px of pad for an ad that is not running, and the reserve is unconditional while the paint is now gated on `ads-on`. On a 320px-tall frame that is 72px, nearly a quarter of the screen, held for nothing. Making the reserve conditional too would hand it back today at the price of a re-layout on the day ads switch on. | **CLOSED AS ACCEPTED 2026-08-23.** The reserve is 50px of banner plus 22px of pad on a mobile frame, held for ads that are not running. Making it conditional hands the space back today at the price of a re-layout on the day `ads-on` is switched on, and the whole point of the reserve is that switching ads on is a visual no-op. Paying a certain future cost for an uncertain present gain is the wrong trade |
| W10 | fleet | SWEPT 2026-08-21, and see K5 | Only Untangle had a `winFit()`. Swept all fifteen: the distinction that decides it is what the card is centred on. Untangle and Tessera centred on a SUB-PANEL and both were broken; bloom, sluice, prism, needle, zood and kaleido centre on the full frame; stained's `endBlock()` measures its own need. Both sub-panel cases fixed. Kaleido's missing detector, the other half of this entry, is now built and **immediately found K5**. | Tessera FIXED, kaleido detector DONE |
| W11 | index | **ACCESSIBILITY, and it was invisible** | The single link in the homepage's opening paragraph rendered in the browser's DEFAULT `#0000EE`, which measures **1.91:1** on the page background. Unreadable, on the most-read sentence on the site. The rule at the bottom of `index.html` styles `.lobby-about a` and was never extended to `.lobby-intro a`, so the intro's link had no colour of its own. `#4DC3FF` measures 9.04:1. Found by looking at a phone screenshot taken for something else entirely. | FIXED 2026-08-21 |
| W12 | about, faq, guides, terms, privacy, cookies, contact, embed | LAYOUT | **On any viewport at or below 1151px these eight pages have no header at all**: no logo, nothing to tap home from the top. The collapse rule inside the 1151 media query scopes the footer, ad slots and sidebar to `body:not(.lobby-page)` but leaves `body .site-header .brand` unscoped, so it hides the brand everywhere. The homepage escapes only because `index.html` carries its own override restoring a 64px header. Pre-existing, and it means the new logo does not appear on eight pages on a phone. The footer nav is still there, so it is not a dead end; it is a missing masthead. | **FIXED 2026-08-24, and it was wider than logged.** The entry named eight content pages; it was **24**: eight content pages, fifteen guides and the 404, every page carrying `body.lobby-page`. The three collapse rules in the 1151 media query are right for a GAME page, where the canvas wants the whole screen, but they were never scoped, so they stripped the masthead from every lobby page too. Only the homepage escaped, because `index.html` carried the fix inline: **the fix was already written and simply in the wrong file.** Moved into `shared/chrome.css` and the inline duplicate deleted so the two cannot drift. Verified at 390x844: **13 of 13 lobby pages now render a 64px header with a visible brand at a 34px logo, 3 of 3 game pages stay collapsed, no horizontal overflow anywhere** |
| W13 | index | MINOR, follow-on from the logo | The homepage pins its own mobile logo height and was left at 28px when the desktop header went to 44, so the new wordmark's letters sat at 15.4px there. Raised to 34, giving 18.7px letters and a 228px logo with 130px of clearance on a 390px phone. | FIXED 2026-08-21 |
| W14 | stained | **BREAKS THE PAGE on mobile** | Stained is the only game of fifteen with no inline `<style>` block, and the piece that mattered was not the typography: the block carries the `@media (max-width: 1151px)` override that releases `body:not(.lobby-page)` from `position: fixed; overflow: hidden`. Without it, **on a phone the page could not scroll at all**. Measured at 390x844: `scrollHeight` equalled the viewport at 844, the footer was hidden, and the entire `.game-info` article sat at y=844, off-screen and unreachable. Orbit and Kaleido scroll to 3745 and 4230 at the same size. The article is the whole SEO case for the page and no phone visitor could reach a word of it. The same missing block also left the desktop measure at 1088px instead of 760, the body copy pure white instead of the dim grey, the line-height at browser default, and four inline links at the unstyled `#0000EE`, which is **1.91:1** on the page background. | FIXED 2026-08-21. Stained now matches Orbit on every measure at both sizes, and the canvas is untouched |
| W15 | guides/kaleido | **BREAKS THE PAGE on mobile** | Second instance of W14, different file, found the same evening. `guides/kaleido/index.html` opens `<body>` with no class where all fourteen sibling guides open `<body class="lobby-page">`, so `body:not(.lobby-page) { position: fixed; overflow: hidden }` applied at phone width. Measured at 390x844: the article is **4220px inside an 844px locked viewport**, `scrollY` never moves off 0, the footer is `display: none`. **The entire strategy guide was unreachable past the first screenful.** Orbit's guide at the same size scrolls to 3491 with everything reachable. One missing attribute. | FIXED 2026-08-21. Now scrolls to 3492, bottom reachable, identical to Orbit |
| W16 | about, contact, privacy | ACCESSIBILITY | The "Send a message" button was white on `#D8523F` at 15px, **4.04:1**. | **RESOLVED 2026-08-22** with U5. The document audit now reports **zero** contrast failures across all 40 pages, where these three were its only remaining ones |
| W17 | guides/ | MINOR, type scale | All 15 card descriptions on the guides index render at **15px**, one under the site's 16px content-copy floor. Real body copy, not a label or a timestamp, so the exemptions do not cover it. The only page on the site where content copy sits under the floor once eyebrows, breadcrumbs and timestamps are excluded. | FIXED 2026-08-22, 15px to 16px. The audit now reports 0 items under the floor on that page, from 15 |
| W18 | shared footer, guide breadcrumbs | MINOR, target size | The footer nav's nine links measure about **13px tall** and the guide breadcrumbs about **17px**, against the 24px of WCAG 2.5.8 Target Size (Minimum, AA). Both are navigation rather than links inside a sentence, so the inline exemption does not apply to them. One finding about two shared components rather than forty page findings. Easy miss on a phone; nothing is unreachable. | **FIXED 2026-08-22, and swept.** Footer links given `display: inline-block` and 6px of vertical padding, taking them from 13px to **25px**; the row-gap went to 0 because the padding now supplies the space between wrapped rows, 12px where there used to be 10. Guide breadcrumbs given 4px padding, 17px to **31.8px**. The "More puzzles" row was also caught: those are navigation formatted as a paragraph, not links inside prose, so the inline exemption does not cover them, 18px to 26px on all 15 guides. **Measured across all 40 pages: small tap targets went from about 330 to 0** |
| TE1 | tessera | **SILENT TOTAL FAILURE** | Tessera fetches its 358KB, 51,852-word dictionary at load. If that request fails, `VALID_WORDS` stays empty, **no word the player ever forms will score**, and the only signal is a `console.error`. Tiles keep falling and the game looks alive. `dictLoaded` is set on success and then **never read by anything**, so the flag that exists to describe this state is dead code. The slow-load case is genuinely fine, as the comment says, because the first tile takes seconds; it is the FAILED case that has no handling. A line on the canvas when the catch fires would close it. | **FIXED 2026-08-22**, and the failure path was tested rather than argued about: the fetch was pointed at a missing file, `dictFailed` came back true with 0 words, and the message rendered on the canvas in accent red where the controls hint sits. Restored and re-verified at 51,852 words. `dictLoaded` is gone; the flag that replaced it is read |
| FO1 | fold | MINOR | Two em dashes in copy drawn to the player, not in comments: "Folded too far — the sheet is now smaller than the figure" and "two pieces stacked — undo and fold elsewhere". The only drawn em dashes left in the four games checked tonight; tessera, sluice and mobile have none. | FIXED 2026-08-22, both recast with a colon and a full stop |
| FO2 | fold | MINOR, confusing | The shipped game exposes its debug handle as **`window.__foldfig`**, which is the name of the foldfig PROTOTYPE deleted on 2026-08-21. Anyone reaching for `window.__fold` finds nothing. | FIXED 2026-08-22. Renamed `__fold`, with `__foldfig` kept as an alias to the same object so an old console snippet still works |
| FO3 | fold, mobile | MINOR | Neither carries a fit detector. Kaleido is the third. After tonight the pattern is clear enough to state as a rule: a card drawn to a canvas with no way to measure it is how every fit bug on this site has survived. | **PART DONE 2026-08-22.** Fold has `winFit()` and it found FO4 on its first run. **Mobile needs no detector**: it has no card. Its own source says the rules panel was removed deliberately, the mockups carry no text, and the only thing ever drawn is one CTA anchored to the frame's bottom edge. A fit detector there would measure nothing |
| K5 | kaleido | RESOLVED 2026-08-22 | The card could not hold its content at the 0.72 floor with the demo already dropped, so it clamped while the copy kept flowing and the two buttons hanging off its bottom edge drew through the last rule. 8 of 63 sizes, including **480x360, a size printed on the embed page**, and iPhone SE landscape by 29px. Fixed with the full-frame fallback: when the card cannot hold the copy, stop drawing a card. That returns the 20px outer margin, the card's internal padding and a tighter text inset, about 55px of height plus a wider column that wraps to fewer lines. **All 17 named devices now pass**, 480x360 at scale 0.80 rather than clamped, iPhone SE landscape clean. Card mode is byte-identical above the threshold, verified by screenshot at 1280x900, and all 100 levels still solve. | DONE, see K6 for what is left |
| K6 | kaleido, and the embed page | **RESOLVED 2026-08-22 by stating the minimum** | After K5, 12 of 147 sizes still overlapped and every one was both narrow and short: width at or under about 440 AND height at or under about 360. The smallest thing that passed was 480x360, the documented embed size, and 568x320, a phone turned sideways. The residual was containers smaller in BOTH axes than anything the site suggested. The real gap was never the card: **/embed/ stated no minimum.** Its copy said "anything from about 480 by 360 upward works", which is a hedge, not a floor, and nothing stopped a partner choosing 360x320. It now states plainly that **480 by 360 is the smallest frame supported**, that every game is checked at that size, and why not to go below it. That turns an unbounded promise into a bounded one, which was worth doing for the embed product regardless of either card. | DONE, and it closes FO5 on the same line |
| FO4 | fold | **RESOLVED 2026-08-22, and both proposed fixes were measured and killed first** | Fold's win card is placed BELOW the figure on purpose. On a short frame there is no room, so it clamped upward onto the picture: 29px of overlap at 480x360, the documented embed size. **Shrinking the figure is dead.** Below about 430px tall the cell is already at its 12px floor, so a 4x4 figure is 48px high; shrinking it 30% took the overlap from 29px to 15px and never to zero, paying with the very picture the fix protects. **Making the card sheer is wrong.** What reads through is not the figure, which sits above the card, but the game's own win banner and button row. It looks like a rendering fault; the screenshot settled it in one look. Both fail for one reason: at 480x360 this is a SPACE problem, not a placement one. The card wants 219px of a 360px frame. **The fix is an editorial cut**, the same answer Prism's six rules got. When the card cannot fit, it drops the score BREAKDOWN, which is the arithmetic behind a number the player still sees, and keeps the figure's name, the level score, the total and the button. The par line survives as the subtitle. The bottom margin gives from 10px to 4px before the picture does. | **216 probes, 18 sizes x 12 levels: 204 pass, 0 unsolved.** Clean at every frame **344px tall or taller**, 480x360 included. Compact is used only where needed and the full card is byte-identical at 640x480 and above. Residual: see FO5 |
| W9 | ludo | OBSERVATION | The computer opponents pick a random legal move, marked `AI (placeholder — random legal moves)` in the source. No page claims more than "computer opponents", so nothing is untrue, but the guide invites the reader to "put it into practice against three AI opponents". The homepage card also says "Roll the die" where the game rolls two. | **CLOSED AS ACCEPTED 2026-08-23.** Ludo's opponents pick a random legal move, marked as a placeholder in the source. **No page claims more than "computer opponents"**, so nothing on the site is untrue. The guide's "put it into practice against three AI opponents" is a fair description of playing against them. Reopen only as a feature, if the AI is ever worth improving, not as a correction |
| K4 | kaleido | MINOR | By default colour is the only thing separating three of the four glasses (all within 1.3:1 of each other in lightness). Mitigated by a built-in colourblind mode that swaps colour for shape, offered on the rules card, but it is off by default. | **CLOSED AS ACCEPTED 2026-08-23, by design and correctly so.** Colourblind mode swaps colour for shape, which costs every player some legibility to help some players a lot. Opt-in is the right default, it is offered on the rules card where a new player meets it, and the same reasoning now covers Mobile's palette switch. An accessibility affordance being OFF by default is not automatically a defect when the ON state has a cost of its own |

| W19 | index, contact, shared/contact-modal | **ACCESSIBILITY, and worse than the row it was found under** | Four button HOVER states put white type on a LIGHTER coral, which is the exact inverse of the U5 fix. The homepage's **Play now** and the Contact **email pill** hovered to `#FF6B5C` at **2.80:1**; the contact modal's trigger and primary button hovered to `#E66752` at **3.27:1**. Hovering a game card made its button less readable than leaving it alone, on the most-visited page on the site. Confirmed from the live page's computed styles, not from reading CSS. There is almost no headroom to go lighter and stay legible: the lightest coral holding 4.5:1 is `#CB4D3C`, exactly on the bar. | **FIXED 2026-08-22.** All four now deepen to `--accent-hover` `#A93E2F`, **6.15:1** |
| W20 | guides/<game> x15 | MINOR, type scale | The `p.more` "More puzzles:" cross-link paragraph renders at **15px** on each of the 15 individual guide pages, one under the 16px content-copy floor. Same rule as W17, which fixed the guides INDEX; this is the sibling element on the guide pages themselves and the earlier fix did not reach it. Found by the document audit, which reports exactly one type-floor item on each of those 15 pages and none anywhere else. | **FIXED 2026-08-24.** 15px to 16px on all 15 guide pages, the same decision W17 got for the guides index |
| W21 | tailwind | OBSERVATION | `tailwind/play.js` carries a comment saying the two INK values are dark enough to hold AA against sky and grass "which the accent itself does not, so accent is used for marks and ink for type". But the BEST line's label at `play.js:670` is drawn in the accent as **12px/700 type** over the sky, which is the thing the comment says not to do. Not measurable by sweep, because the background is a photograph. Belongs with the sluice/fold/mobile reading pass. | **FIXED 2026-08-22.** The label now uses `INK`, which is what every other label in the file uses and what the file's own palette note says exists for this exact reason. The dashed line stays `ACCENT_MARK`, so the mark still reads as the personal best; only the words changed |
| K7 | kaleido | NOT A FINDING, scope note | Kaleido was the one game of six carrying `#D8523F` that was deliberately **left alone** by the accent split. Its `Z.accent` is not a UI token: it is one of the four glass colours in `PANE_COL`, plus its own glow at `play.js:1124`. Darkening it would move the very separations K4 and the colourblind mode were tuned against. Same reasoning the tracker already applies to sluice, fold and mobile. | NO CHANGE, deliberate |

| K8 | kaleido | **FEATURE, built 2026-08-24. NOT YET DEPLOYED, sits on branch `kaleido-motif`** | The panes were flat colour, so the game's best idea, that a pane placed in the wedge lands in every wedge at once, paid off in a block of colour. Each glass now carries a stamped motif revealed only on placement, so one tap blooms the same mark all the way round the wheel. Per COLOUR and not per cell: per cell would imply a rule that does not exist, and per colour gives a second channel carrying exactly what hue carries, which is what K4 is about. All four are HANDED, because the copies are ROTATIONS (`domainOf` maps s to s mod SEC/fold, there is no mirror in the file) and a symmetric mark repeats flatly. The first set drawn was a comb and a hook and the finished wheel read as rows of the letters **T and L**; Latin letterforms are horizontal and vertical strokes at right angles, so anything on that grid gets read as type. Shipped set is triangles, zigzags, beads and a notched disc, none of which can be. One ink, `--bg`, **measured from rendered pixels rather than arithmetic**: 4.45:1 on coral and 9.6 to 12.5 on the other three, so coral needed no special case; white is 1.4 to 1.9 on three of four and was never an option. **The brief's pane sizes were wrong, in the game's favour.** Desktop boardR is 256.5 and not 177.5, and 177 is what a PHONE measures, so that row had been taken in a narrow window. The 480x360 embed has 23x24 panes and not 25x12, because the touch budget caps that frame at TWO rings. Complexity steps down at 44px and drops out entirely below 26, so the embed is flat colour and byte-identical to before. The palette carries the motif as a legend, but only when the board is showing marks too, per `drawPalette`'s own rule about not advertising what the board does not use. | **400 level-solves across four frames, 0 failures.** Frame cost 0.135 to 0.315ms at level 100, up from 0.135, which is 1.9% of a 16.7ms frame; each colour is rasterised once per detail level and size to an offscreen tile and blitted. New detector `__kaleido.motif()` reports per-ring pane size, ladder rung and whether the ink can escape its pane. It never can: reach 22.5px against a 25.8px inscribed circle, which is why there is no per-pane clip and no clip cost |
| K9 | kaleido | **FIXED 2026-08-24, same branch** | The win banner was two lines, 32px over 15px, both hung off `topBand() * 0.42`. That block is about 48px tall in a strip that is 63, so it had roughly seven pixels of air above it and eight between the second line and the glass. Owner reported it as too big and asked for one line with real padding. | **DONE.** One line, 20px title and 16px subtitle joined by the same middle dot the HUD uses, centred in the gap between the frame edge and the RIM OF THE WHEEL rather than inside an invisible band boundary. Top pad is capped at 30 so it does not float in the middle of a tall phone strip, and the split is EVEN with no lower clamp, because forcing a minimum on the TOP pad is exactly what pushed the bottom one negative. Width capped at 84% of the frame as well as by `SIDE_PAD`: 341px across a 390px phone fitted and still read wall to wall. **Swept 15,600 frames: 0 overlaps, 0 overflows, pads symmetric everywhere.** At or above the documented 480x360 minimum the clearances never fall below 22.3px top and bottom and 70px at the sides. The only frames that go tight are height 332 and below, all under the minimum `/embed/` states, same residual and same reasoning as K6 and FO5. Detector `__kaleido.winBanner()` |
| K10 | kaleido | **TOOLING, fixed 2026-08-24, same branch** | `__kaleido.set()` wrote straight into `dom[]`, but a given's colour is read back from `solved[]` and not from `dom[]` (see `tokAt`). A probe that set a given therefore produced a board whose DRAWN colours and whose CLASH COUNT disagreed: the wheel carried the dark clash arcs while the read-out said nothing was touching. Cost most of an afternoon chasing a bug that did not exist. The game was right throughout, and `place()` has always refused those cells at the tap. | **FIXED.** `set()` now refuses a given exactly as `place()` does, and a new `givens()` exposes which wedge cells are clues so a probe can plan around them. Belongs beside the file's standing lesson about checks: **a debug handle that can reach a state the game cannot is a source of false findings, not a shortcut** |
| K11 | kaleido | **FEATURE, built 2026-08-24, same branch. LOCKED to `both` by the owner** | Owner asked whether the completed wheel could turn the way Orbit's does. Orbit does it in one line at `orbit/play.js:714`, a continuous drift at 0.09 rad/s from 300ms after the win. Kaleido can mean more by it: this wheel has EXACT N-fold rotational symmetry and its copies literally are rotations, so a turn of one fold step lands the figure back on itself. That is the mechanic stated in motion rather than decorated. The motif is what makes it legible, because a wheel of flat colour just looks like colours sliding around. Variants: `drift` copies Orbit, `step` turns one fold step and stops, `both` lands the step then drifts on. Step duration scales as the SQUARE ROOT of the fold: a step is 60 degrees at six-fold and a 180 degree half turn at two-fold, and a constant duration whipped the late levels round while a linear one made them crawl. | **The landing claim is verified from PIXELS, not arithmetic.** Rendered the solved wheel unrotated and after one exact fold step, then compared: at six, three and two-fold, **not one pixel differs by more than 120**, where swapping coral for green is 347. The whole residual is 1.6 to 2.8% of pixels at low magnitude, it grows with the turn angle, and it is antialiasing along the came. Null test (same frame twice) 0%, positive control (an arbitrary drift angle) 24 to 34% at the same threshold, so the test can see rotation and did not. Measured: `step` lands at 1.047 rad, which is 60 degrees to three decimals, and RELEASES the animation loop; `off` never opens it. `drift` and `both` hold the loop open until the player taps, which is the real cost and the same one Orbit accepts. Gated on `REDUCED`, which **Orbit's own drift line is not** and which is worth a separate row. 100 levels re-swept, 0 failures. Detector `__kaleido.spin(mode)`. **Owner compared all four and chose `both`**: the wheel lands its fold step, then drifts on from where it landed. `?spin=` was a temporary comparison aid and is now REMOVED, same reasoning that took this file's `?level=` shortcut out before launch. The accepted cost is that a drift never ends, so the win screen redraws until the player taps; `step` was the only mode that let the frame go quiet and it lost on the look. Owner also decided the turn takes NO sound |
| K12 | kaleido | **FIXED 2026-08-24, same branch** | Owner reported the game as having no sound but the level-complete one. It had SIX, and they were all firing. The whole bed sat at roughly 43% of the shared library's own numbers: placing a pane was gain 0.030 against `sfx.js`'s `drop` at 0.070, which is the level that file uses for `click` and `tick`, its UI chrome. The win was 0.045 against a house 0.08 to 0.10, but a win is a SUSTAINED chime at 900ms where a placement is a 60ms blip, so the win registered and nothing else did. Not a design gap, a level gap. **Separately, the real missing sound was the copies.** Placing one pane lands it in N_FOLD wedges on a 45ms stagger and that whole cascade made one blip, so the game's signature moment was silent. **And the palette fired `snd.place()`**, the identical sound as placing a pane on the board, which quietly taught that picking and placing were the same act. | **DONE.** Levels lifted toward the house numbers without reaching them, because "games to help you unwind" is a real reason to sit under standard: place 0.030 to 0.055, win 0.045 to 0.070, the rest in proportion. Each copy now gets its own tick on the SAME constant the draw ripples with, `COPY_MS`, which the draw now reads instead of repeating the literal 45, so sight and sound cannot drift apart. Same pitch for every copy, deliberately, because they ARE copies and a rising figure would say they were different; only the gain falls, at 0.72 a step. Palette got its own `pick()`, higher and shorter. **Verified by REAL CLICKS with `AudioContext.createOscillator` patched underneath the game's closure**, not by driving the debug handle, which is what returned zero for four games in the earlier sound sweep: six-fold gives seven oscillators at 0, 0, 55, 92, 137, 181, 226ms against a 225ms visual ripple; two-fold gives two notes, so the cascade is bound to the fold; the palette gives exactly one 880Hz tick and no cascade; the win gives three tones and no cascade. 100 levels re-swept, 0 failures |
| O4 | orbit | **FOUND 2026-08-24 while building Kaleido's. NOT FIXED, deliberately out of scope** | Orbit's solved mandala drifts at `orbit/play.js:714`, one line, 0.09 rad/s from 300ms after the win. It is **not gated on `prefers-reduced-motion`**, so a player who has asked their operating system for less motion gets a continuously rotating figure anyway, with no way to stop it short of muting the whole page. Kaleido's equivalent (K11) is gated, which is what made the gap visible. Orbit's own `REDUCED` handling elsewhere was not checked. | **NO CHANGE in this branch, by choice.** Kaleido's branch is not the place to edit a second game, and a fix wants its own look at how Orbit treats reduced motion generally rather than one line patched in passing. Owner acknowledged 2026-08-24. Reopen as an Orbit accessibility pass |

| B1 | bloom, guides/bloom, index | **FACTUAL, FIXED 2026-08-22 by correcting the copy** | Three surfaces claimed the garden grows as you climb. Measured, `gridDims()` has two branches: on DESKTOP rows go `5 + min(floor((lvl-1)/3), 3)`, so 5x7 to 8x10 across levels 1 to 10 and then nothing, with **141 of 150 levels on the same 8x10 board** and flower count correlating with level at **r = 0.078** over levels 10 to 310; on MOBILE the branch ignores `lvl` entirely and sizes from the viewport, so level 1 and level 300 are the same board. Owner chose to correct the copy, which is what W3 got. The game page now says the garden opens out over the first handful of levels and from there deals a fresh tangle rather than a bigger one, which is true on desktop AND on a phone. The guide's "as the garden grows" became "on a full-sized garden". The homepage card's "the layouts grow more knotted as you climb" became "every level deals a fresh tangle". `llms.txt`, the FAQ, About and 404 were swept too and make no growth claim, so three edits closed it. | DONE |
| B2 | bloom | MINOR, FIXED 2026-08-22 | One em dash in a string drawn to the player: "A flower blooms only when the water reaches it — open them all." The only one in the file. Same family as FO1. | **FIXED 2026-08-22**, recast with a full stop. String literals now 0 in both bloom and needle |
| N1 | needle | **ACCESSIBILITY, FIXED 2026-08-22 by retuning two silks** | The eight silks are a discrete categorical palette, so unlike flower or paper colour they can be measured honestly. Null-tested first, both simulations returning neutrals with **zero drift**. Two pairs sat at or under the bar: **fuchsia vs aqua at dE 9.2 under deuteranopia** and **lapis vs iris at exactly 10.0 under protanopia**, and since thread count caps at eight and there are exactly eight silks, both pairs are on the board in most levels. Owner chose to retune rather than add a dash pattern. **Each colour was moved WITHIN its own hue family** so the palette still reads as the same eight silks: fuchsia `#FF6BD6` to `#F41593`, iris `#B08CFF` to `#BA9FF4`, with matching highlights. A wider search did better on paper by abandoning the purple entirely, and was rejected: purple and magenta are exactly what collapses under both kinds of colour blindness, so the numbers were satisfied by colours that would read as two blues and two reds in a game about TRACING threads. Verified by re-reading the palette out of the shipped file rather than trusting the search: **no pair under dE 10 in any of the three vision models**, tightest anywhere now saffron/amber at 16.3 under deuteranopia and jade/amber at 17.5 under protanopia, both pairs untouched by this change. Normal vision improved too, 24.6 to 28.5. All eight silks still clear 3:1 against the board. | DONE |
| N2 | needle | NOT A FINDING, recorded so it is not re-raised | Needle's ramp completes at **level 16** (6x8 with 3 threads to 10x13 with 8) and from 16 to 400 it only ever oscillates between two configurations. That looks like B1, and it is not, because **the source already documents it**: it calls this "a RAMP, and the only one this game has", caps thread count at eight deliberately because "eight silks is already the limit of telling colours apart at a glance", and records that the intended deeper dial, asking three crossings per thread, was **tried and backed out** because the generator took 1.4 seconds at level 20 and still dropped half the threads. A known limit with the reasoning written down, and no page claims more. | CLOSED |

## Bloom and Needle, 2026-08-22: the roster's last two puzzle games

**Bloom, functionality: pass, both modes.** `solve()` writes each pipe's stored
solution, so every level ships a witness. Drove **150 levels on desktop and 150 on
mobile: 0 unsolved**, every one reaching `phase === 'won'` with `watered === flowers`.

**Needle, functionality: pass, and twice over.** 120 levels driven through `solve()`
against the game's own `isSolved()`, which is `allConnected && weaveOK && allWovenIn &&
allSewn`: **0 failures**. Then its own `audit(30, 12)` on **360 freshly generated
boards: 0 failures**, no board served with threads already drawn, none under three
threads, average 8.64 crossings and 64.9% grid fill.

**One wrong assertion before a right one, and it is the Mobile lesson again.** My first
Needle sweep reported **120 of 120 failing** because I asserted `crossings === 0`.
Needle is a WEAVING game: threads are supposed to cross. Every "failing" row already
said `solved: true` and `phase: 'won'` in the data on screen. A sweep that fails
everywhere is a claim about the sweep.

**Cards: clean.** Bloom's `menuFit()` at 16 sizes and Needle's `menuFit()` AND
`snagFit()` at 18 sizes x 7 levels: **252 card measurements, zero overlap, zero
off-screen, no horizontal overflow.**

**Mobile: pass.** At 375x812 Bloom's canvas is 375x812 CSS on a 750x1624 buffer, the
aspects agree to three decimals and it fills 100% of the width, which is the
narrow-strip test.

**A false finding, worth more than the check that produced it.** Rotating the window to
812x375 left Bloom's canvas at 375x812, filling 46% of the width, which looks exactly
like the narrow-strip bug. It is not. `resize_window` changes the viewport WITHOUT
dispatching a resize event to the page: firing one by hand re-fitted the canvas
instantly and correctly. **The harness cannot test re-fitting on its own**, and any
future orientation check has to dispatch the event or it is measuring nothing.

**A second dead check in the same pass.** The card sweep ran in a hidden iframe, where
the canvas reports 0x0. My aspect test compared `(0/0).toFixed(3)` against itself, and
since that is the STRING "NaN" it compared equal and passed at every size. It was
reporting a pass on garbage. Canvas geometry has to be measured in a real window; only
the games' own fit detectors survive the iframe.

**Accessibility.** Bloom is genuinely clean rather than merely unswept: its canvas UI
measures 10.07 to 13.08:1, all null-tested, and its flower colours are assigned by
`Math.random()` so **colour carries no information in that game at all**. Bloom's CTA is
green `#3DDC84` with a dark label, which is why it never appeared in the accent sweep.
Needle is N1.

**Consistency, SEO, embed: pass for both.** Header, brand logo, focus button labelled
"Play fullscreen", footer, favicon, labelled canvas, no emoji, all five re-fit
listeners, `shared/sfx.js`, `ui.js`, `analytics.js` and `embed.js` all loaded, no
frame-busting, no root-absolute asset paths, no runtime fetch, no `setInterval`, storage
namespaced. The only root-absolute `src` in either is the accepted K2c Vercel pair.
Needle also reads `zamborin-weave.level` once, which is a deliberate migration after the
2026-08-17 rename and not a leak.

**Document audit, both game pages and both guides at 390x844: clean.** No scroll lock,
bottom reachable, footer shown, no default-blue links, no horizontal overflow, no
contrast failures, one h1 each, no heading skips, no failed resources. The only items
are the known W18 tap targets and the known 15px `p.more` on the two guide pages.

**That is 12 of 15 games audited.** Only zood, carrom and ludo are left, and they were
always their own mini-project.

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

| T6 | tailwind | OBSERVATION, design | The gate's own reading guide says a good region under about 2% is a needle, and every plane measures exactly 1%. But by-feel measures 84 to 86%, which the same guide reads as clearly not a needle. Two of its own metrics disagree, so the question is which one describes the player. Not a QC defect and presumably seen at ship. | **CLOSED AS ACCEPTED 2026-08-23, not a defect.** Tailwind's own gate says a good region under about 2% means a needle, and every plane measures 1%; the same gate's by-feel metric measures 84 to 86%, which it reads as clearly not a needle. Two of its own metrics disagree, which is interesting and is not a fault in the game. It was visible at ship and the game plays well. Revisit only if the gate is ever rewritten |


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


## The nine shelved prototypes deleted, 2026-08-21

Owner's call, acted on the same day. `socket`, `bunny`, `empyrean`, `foldfig`, `pane`,
`pins`, `plumb`, `tarmac` and `wire` are off the site and now live only at
`iCloud/Claude Projects/Zamborin/shelved-prototypes-2026-08-21/`, alongside
`_guides/socket`.

**Copied first, verified, then removed.** Every folder was rsynced to iCloud and checked
both ways, file count and kilobytes, before anything was deleted. 185 files, 94 MB, all
matching. Git history holds them too, so there are two ways back.

**What it moved.** 178 tracked files removed. The tracked repo goes **142 MB to 48 MB**,
and Empyrean alone was 90 MB of that. The sitemap now lists 39 URLs and there are exactly
39 pages on disk, one for one: fifteen games, fifteen guides, the guides index, embed,
about, faq, contact, privacy, cookies, terms and the homepage.

**Two pieces of fallout, both handled.**

- `vercel.json` redirected `/lacerta`, `/lacerta/` and `/lacerta/:path*` to `/empyrean/`.
  A permanent redirect to a page that no longer exists is worse than a plain 404, so the
  three rules are gone. `/lacerta` and `/empyrean` now both 404 onto the custom page. The
  `/weave` to `/needle` rules stay: Needle is live.
- The only pages that still linked to any of the nine were `pane`, `wire` and `bunny`
  linking to `/socket/`, and all four went together. Re-ran the link checker afterwards:
  every `href`, `src`, `content` and CSS `url()` in the 42 remaining HTML files resolves,
  and the 404 page links only to live routes.

Socket and Empyrean were both publicly listed within the last month, so Google will hold
index entries for a while and they will 404. That is the correct signal for removed
content; a redirect to the homepage would read as a soft 404 anyway.


## Untangle: Undo, Restart, and onto the button system, 2026-08-21

Owner's call, all three parts.

**Undo and Restart, as house pills.** The control row is `shared/ui.js`: a 44x40 icon
pill for sound, then Undo and Restart at `PILL.h` 40 with 15px labels, the same physical
size as Prism's. Undo dims when there is nothing to undo, Restart when no move has been
made. Keyboard z and r. Verified by driving real pointer events through the canvas
handlers rather than by poking state: two drags, moves 0 to 2 and history 0 to 2, both
dots measurably moved; undo restores each dot to its exact pre-drag coordinates in
reverse order; a third undo does nothing; Restart returns moves to 0, history to 0, the
dots to the scramble and the crossings to 9, with the level unchanged.

**An undo costs a move.** Prism, Sluice, Bloom and Orbit all charge one, and every one of
them shows a scored counter, as Untangle does. It is also simply the true price: dragging
the dot back by hand costs a move too, so Undo buys exactness rather than a discount, and
Restart is what a clean run is for. The How-to-play copy says so plainly.

**The rest of the game moved onto the system with it.** START, CONTINUE and NEXT LEVEL are
now `UI.drawCTA`; SHARE RESULT is a control pill rather than a second loud button; and the
bespoke 28px sound square at the top left is gone, replaced by the house icon pill in the
row. Untangle had been loading `shared/ui.js` and drawing its own buttons anyway, which is
how the drift the module was written to end starts again.

**The band under the playfield is the control row now, not a line of hint text.** The strip
used to hold "CLICK AND DRAG ANY DOT, REMOVE EVERY EDGE CROSSING", which repeats the rules
card and was also this game's only em dash in body copy. 36px was shorter than a house pill
in any case, so the band is 56.

### Three fit measurements, because the layout moved

Every number from `rulesFit()`, `winFit()` and `controls()` over 145 heights, 12 widths and
20 named devices.

- **Rules card: zero failures**, 300px to 1000px. Reserving the control band cost the card
  56px and put frames 320 to 335 over the edge by up to 10px, so on the instructions
  screen, where there is no playfield, the control row now drops to the BOTTOM of the frame
  and hands the height back. That closed the band outright.
- **Control row: correct everywhere.** One pill on the instructions screen, three in play,
  every box on the canvas, no horizontal overflow at any width from 320 to 1200.
- **Win card: the boundary moved from 590px to 430px.** It had never been measured. It
  needed `PLAY_H >= 380`, so it spilled out of the frosted panel on anything under about
  578px tall, which includes a small phone in PORTRAIT, and the control band would have
  taken that to 590. It now scales on the same two-stage rule as the rules card, dropping
  the SHARE pill below 490px rather than squeezing further. What is left is landscape
  phones under 430px tall, where it still spills by up to 51px onto a background of nearly
  the same colour. See U7.

The lesson is the one from the rules-card sweep, arriving again: **the win card had a
detector-shaped hole in it too.** Nothing in this game could report its own fit until this
pass, and the moment one existed it turned up a failure on a real phone in portrait that
predated any change made here.


## Deployed, 2026-08-21

Four commits pushed to main, `19c5966..a47cabd`. Verified against the live site rather
than assumed:

- Every live route 200; **all eleven deleted routes 404**, including `/lacerta/` and
  `/guides/socket/`.
- The cropped logo and favicon are being served: `viewBox="169.06 304.86 269.27 40.1"`
  and `viewBox="124.73 248.86 344.82 344.82"`.
- `untangle/play.js?v=16` carries `undo`, `restart` and the blind-boot recovery;
  `tessera/play.js?v=21` carries the recovery too.
- The embed corner mark is `94 x 14`. The guides are on `chrome.css?v=14`.
- `/embed/`'s `og:image` now points at a file that returns 200.
- `llms.txt` contains no occurrence of "daily". Sitemap: 39 URLs.

**One thing the deploy settled.** Vercel serves these static files with
`cache-control: public, max-age=0, must-revalidate`, so the browser revalidates every
time and the `?v=2` on the logo and favicon was not strictly needed to get the new art
in front of returning visitors. It is still worth having: those two were the only shared
assets on the site with no version at all, and W2 is what happens when versions drift.

**Still held at 36px:** the header logo size. The specimens are with the owner.


## The win-card sweep, 2026-08-21

Prompted by Untangle: its win card had never been measured, and the first detector put
on it found the card spilling out of its own panel on a phone in PORTRAIT. The obvious
worry was that the rest of the fleet carried the same thing. Swept all fifteen.

**One distinction decides the whole question: what the card is centred on.**

| Centred on | Games | Verdict |
|---|---|---|
| The full frame | bloom, sluice (banner, no button, ~130px), prism, needle (banner + one CTA, ~196px), zood, kaleido | Safe. The frame is always larger than the card. |
| Its own measured need | stained | Safe by construction. `endBlock()` declares `need = 178` and falls back to covering the whole frame when there is not room below the window. This is the pattern the others should copy. |
| The frame's bottom edge | mobile | Safe. One CTA anchored to the frame, not to a panel. |
| **A sub-panel** | **untangle, tessera** | **Both were broken.** Both fixed. |
| A sub-panel, but tiny | ludo | Two short lines, no button, about 78px, inside a board that is most of the canvas. Low risk, unmeasured. |
| No win card at all | orbit, tailwind, carrom, fold | n/a |

So the fear was half right. It was not a fleet-wide pattern, but it was not Untangle
alone either, and the one other game with the shape was broken in exactly the same way
and by the same amount.

### Tessera, measured

Its game-over card centres on `GRID_Y + GRID_H / 2` with a bottom-anchored PLAY AGAIN
button, unscaled and unclamped. It needs `GRID_H >= 204`. On a phone held sideways
`GRID_H` comes out around 143, so the card ran out of the tinted panel at both ends with
the button over the board.

Swept about 100 sizes, and the before-and-after is from the same detector:

- **Before: 12 failures, worst 44px.** Real devices affected: iPhone SE landscape 31px
  over, Android landscape 11px, the **480x360 embed** 11px, iPhone 12 landscape 5px.
- **After: zero failures, zero off-canvas, everything at full scale** bar one frame that
  shrinks to 0.908.

The scale alone could not do it. At a 300px-tall frame the grid is 117 and the BUTTON on
its own is 52, so the panel can never hold the card at a legible size. It now falls back
to the whole frame, which is Stained's answer to the identical problem. Below 360px tall
it takes the frame; above that it stays in the panel at full size.

`__tessera` did not exist before this, which is the whole reason the card was never
measured. It now carries `overFit()` and `frame()`.

**The lesson, and it is the rules-card lesson again in a different place:** the defect is
never really "the card is too big". It is "the card is centred on a box that is not the
one it needs to fit in, and nothing can say so".


## Three findings that came out of looking at a screenshot, 2026-08-21

The logo change needed checking on a phone. Nothing about that check was aimed at page
layout, and it turned up the worst defect of the whole QC track.

1. **Stained could not scroll on a phone.** W14. The article and the footer were
   off-screen and unreachable, on the one game page whose long-form copy was written
   most recently. One missing `<style>` block, present on the other fourteen.
2. **The homepage's opening sentence had an unreadable link.** W11. Default browser
   blue, `#0000EE`, at 1.91:1 on the page background. The rule styled `.lobby-about a`
   and nobody extended it to `.lobby-intro a`.
3. **Eight content pages have no header on a phone at all.** W12. Open; it is a
   navigation decision rather than a defect, and the footer nav still covers the exits.

**What to take from it.** Every one of these was invisible to the checks already being
run. The link checker reads hrefs, not colours. The fit sweeps measure canvases, not
documents. The contract check counts meta tags, not stylesheets. A page can pass all
three and still be unusable, and the thing that caught it was rendering the page at the
size a person would hold and looking at it.

Worth adding to the per-game audit: **does the page scroll on a phone, is the footer
reachable, and does any link render in the browser default blue.** Three assertions,
cheap to automate, and between them they would have caught all three of these.


## The document sweep, 2026-08-21 (night)

Built because the three worst findings of the day all came from rendering a page at phone
size, and nothing in the existing tooling looks at documents. The sweeps measure canvases;
the link checker reads hrefs; the contract check counts meta tags. A page can pass all
three and be unusable.

Forty pages at 390x844. Checks: can the page scroll and is its bottom reachable, is the
footer shown, does any link render in the browser default blue, horizontal overflow, the
contrast of every rendered text node against its effective background, images without
alt, and heading order. Contrast maths null-tested in the browser first on six known
values including two of this site's own pairs.

**It immediately found W15**, the Kaleido guide locked on mobile. That is two
unreachable-content bugs in one evening, in two different files, neither of which any
previous check could see.

**A hole in the detector, worth more than the finding.** The first version tested
`documentElement.scrollHeight > innerHeight`. On a locked body that reports the VIEWPORT
height, so **the lock hides its own symptom** and the page looks fine. Stained would have
passed it too. `body.scrollHeight` still reports the real content height, 4220 against
844, and the honest test is whether the last element on the page can be brought into view.
Both are in the corrected version. The tell that caught it in the first place was not
scrolling at all: it was the footer being absent on exactly one page of forty.

**Everything else is clean.** After the two fixes: 40 of 40 pages scroll and reach their
bottom, no default-blue links anywhere, no horizontal overflow at 390, every image has an
alt, every page has exactly one h1 and no skipped heading levels, and the only contrast
failures left are the three `Send a message` buttons in W16, which are the accent
question, not a page bug.

**Add these to every future per-game audit.** They are cheap, they run in one pass, and
between them they would have caught W11, W14 and W15 on the day each shipped.


## Tessera, Sluice, Fold, Mobile: the structural pass, 2026-08-21 (night)

Run with the new `shared/qc/doc-audit.js` plus a static read of each `play.js`. This is
the MB, PF, CN, SEO and EMB columns; FN and AX still need driving per game.

**All four are structurally clean.** Sixteen measurements, four games at 375x812,
1280x900, 812x375 and the 480x360 embed: the canvas fills its wrap exactly in every one,
no clipping, no scale-zero, no horizontal overflow, no failed resources, nothing
unreachable, no contrast failure in the document. All four carry the full five re-fit
listeners, all four load `shared/sfx.js`, none busts out of a frame, none loads an asset
by root-absolute path, and all four namespace their storage under `zamborin-<game>.`.

**Two runtime fetches, and they are not equivalent.** Fold pulls `art/manifest.json` and
handles the failure properly, falling back to vector figures with a comment explaining
why, and it streams the 9.6MB of photographs progressively rather than blocking the first
board. Tessera pulls `words.txt` and handles the failure by writing to the console. See
TE1: that is the difference between degrading and dying quietly.

**Three of the four do not use `shared/ui.js`.** Only Mobile draws from it. Tessera,
Sluice and Fold each roll their own button sizes, which is the drift the module exists to
end and which Untangle was brought out of earlier today. Not logged as a defect per game,
because it is one decision about whether the remaining games get the same treatment.

**On em dashes.** Counting them in `play.js` gives 8 to 30 per game and is almost entirely
comments. Counting them in STRING LITERALS gives the real answer: tessera 0, sluice 0,
mobile 0, fold 2. Worth remembering before anyone re-runs that sweep.


## Functionality, driven: Sluice, Fold, Mobile, 2026-08-21 (night)

Every level of all three, through each game's own debug handle, against each game's own
definition of solved.

| Game | Levels | Unsolved | Range |
|---|---|---|---|
| Sluice | **100** | **0** | par 3 to 12, grids 5x7 to 7x9, 4 to 6 flowers |
| Fold | **60** | **0** | 4 to 13 tiles, solutions 2 to 5 folds, 22 distinct figures, all 60 have art |
| Mobile | **39** | **0** | 3 to 10 hooks, 3 to 14 shapes, 2 to 9 rods |

Mobile is the strictest of the three and worth stating precisely: after `solveNow()` and
`settle()`, every hook is filled, the balance error is **exactly 0** on all 39, and every
rod residual is **exactly 0**. The tray carries 0 to 4 more shapes than there are hooks,
so the decoys are real and the solver still places the right ones.

### Three wrong assertions before a right one, all mine

Worth writing down because the pattern will repeat. Mobile "failed" twice before it
passed, and the game was correct every time:

1. I called `settle()` and treated its return as the state summary. It returns per-rod
   residuals, `{r152: 0, r153: 0, ...}`. 39 of 39 "failed".
2. I asserted `hung === shapes`. But the tray deliberately holds MORE shapes than there
   are hooks, so the right test is `hung === hooks`. 36 of 39 "failed".
3. Only the third version, `hung === hooks` and error and every rod residual at zero,
   described the game. 0 of 39 failed.

**A sweep that fails everywhere is a claim about the sweep.** Both times the giveaway was
in the data already on screen: `error: 0` sat in every "failing" row. The rule to carry
forward is to read one row in full and understand the shape of what a game returns
BEFORE writing the assertion over all of them, and to treat a 100% failure rate as a bug
report against the test.


## Kaleido gets a detector, and the detector finds the bug, 2026-08-21 (night)

`__kaleido.rulesFit()` now exists. Its sizing was lifted out of `menuOverlay` into a
`menuLayout()` that both the draw and the detector call, so the two cannot drift; the
extraction is verbatim and the reasoning in the original comments is preserved next to it.

It reports the number that matters, which is not whether the card had to be clamped but
**the gap between where the copy ends and where the switch pill begins**. The two buttons
hang off the card's bottom edge, so a negative gap is a button drawn through the last rule.

**It failed on its first run, at 8 of 63 sizes.** See K5. The one that matters is
480x360, a size on the embed page, overlapping by 4px, and iPhone SE landscape at 29px.

This is the third time in two days the same thing has happened: a card is fixed, the fix
is believed, and it turns out to be wrong at a size nobody sampled. Untangle, Tessera,
now Kaleido. **The rule that would have caught all three: a card is not fixed until
something can measure it, and the measurement is swept, not sampled.** All six of the
rules-card games now have a detector. Fold and Mobile still do not (FO3).


## Accessibility, as far as it sweeps, 2026-08-21 (night)

All four canvases are properly labelled: "Word puzzle", "Sluice puzzle", "Fold puzzle",
"Mobile balancing sculpture".

**Tessera measured exactly**, because it keeps a named palette. Null-tested first.
Everything passes except two entries, and both are the same colour: the accent `#D8523F`
reads **4.07:1** as text on the page background, and white on it reads **4.04:1** as a
button. Its own signal is safe: a letter on a white tile is 16.45:1, which is the thing
the game is actually about.

That is now the fourth and fifth place the same accent has failed, after Untangle's
START and NEXT LEVEL and the three "Send a message" buttons on the content pages. **It is
one decision, not five findings**, and the recommendation has not changed: `#C24A39` for
a fill under white type (4.85), `#FF6B5C` for the accent used as text (5.88), because the
two uses pull in opposite directions and one value cannot serve both.

**Sluice, Fold and Mobile cannot be swept this way and should not be faked.** Their
colours are game ART, not UI tokens: flowers, folded paper, hanging shapes. Running a
contrast test over a pink flower produces a number with no meaning. What those three need
is a person deciding which marks carry information and what sits behind them, which is a
reading pass rather than a sweep. Their AX column stays open deliberately.


## Kaleido's card: the full-frame fallback, 2026-08-22

The third game to get this and the third time the same reasoning has applied, so it is
worth stating as a pattern rather than a fix.

**A card is a container that can be too small.** Stained's `endBlock()` has always known
this: it declares `need = 178` and, when there is no room below the window, covers the
whole frame instead. Tessera got the same treatment on 2026-08-21. Kaleido now has it too.

What the fallback buys, measured: the card's 20px outer margin, its internal padding of
26 + 22 at scale, and a tighter text inset once there is no card edge to respect. About
55px of height, plus a wider column that wraps to fewer lines, which on a narrow frame is
worth more than the padding.

| | Before | After |
|---|---|---|
| 480x360, the documented embed | overlap 4px, clamped 12px, scale 0.72 | **fits**, gap 4px, scale **0.80** |
| iPhone SE landscape 568x320 | overlap 29px | **fits** |
| Named devices passing | 15 of 17 | **17 of 17** |
| Sizes swept | 63 | 147 |

Card mode is untouched above the threshold. The parameterisation was checked to produce
exactly the old numbers, `pw - 96` for the rules and `pw - 70` for the lead at an inset of
30 and a gutter of 36, and confirmed by screenshot at 1280x900 against the shot taken
before the change. All 100 levels still solve.

The scrim goes from 0.88 to 0.96 in frame mode, because without a card panel the copy sits
straight on the game and the scrim has to carry the legibility the panel used to.


## Fit detectors, and what the third one found, 2026-08-22

Untangle's win card got the full-frame fallback, the fourth game to take it after Stained,
Tessera and Kaleido. 112 probes: **zero failures on either card**, control row correct at
every one, frame mode used at 24 of them, and landscape phones now keep the SHARE pill at
0.87 scale where they used to lose it entirely.

One thing the sweep taught about using these detectors. `rulesFit()` was returning failures
after `goto()` had been called, and the card was fine: the control row moves between the
menu and play positions, so measuring the menu card while the game is in PLAY compares it
against a row that is somewhere else. `ctrlCY()` now takes a `forMenu` flag and `rulesFit()`
passes it, so the reading no longer depends on what scene the game happens to be in. The
two scenes were then verified to agree exactly at all 112 sizes.

**Mobile does not need a detector and should not get one.** Its source says so directly:
the rules panel was removed on purpose, the mockups carry no text anywhere, and the only
thing ever drawn over the sculpture is a single CTA anchored to the frame's bottom edge.
There is no card to measure. Writing one would be motion without information.

**Fold's detector found FO4 on its first run**, which is now the pattern: Kaleido's did the
same yesterday. Three cards in three days have been believed correct and were not, and in
every case the thing that settled it was a measurement nobody had been able to take.

The tally on detectors is now: kaleido, stained, prism, needle, bloom, sluice, untangle
(two) and tessera all have one; fold has one; mobile does not need one. That is the whole
fleet.


## The accent split, 2026-08-22

`#D8523F` was doing two jobs that pull in opposite directions. As a **fill** under white
type it has to be dark enough; as **text** on the dark page it has to be light enough. One
value served neither: 4.04:1 as a fill, 4.07:1 as text, against a 4.5 bar in both cases.

Three tokens now, in `shared/tokens.css`:

| Token | Value | Use | Measured |
|---|---|---|---|
| `--accent` | `#C24A39` | fill under white type | **4.85:1** |
| `--accent-hover` | `#A93E2F` | the hover state of a fill | **6.15:1** |
| `--accent-text` | `#FF6B5C` | coral as text or as a mark | **6.42:1** on `--bg` |

`#FF6B5C` is not new; it was already `accentHi` in several palettes. The rule that keeps
them straight is one line: **never put white type on `--accent-text`.** It measures 2.80:1,
which is what W19 was.

### What the split actually found

The task was four tracker rows. The measurement turned up a fifth thing that was worse than
any of them: **the hover states were failing harder than the rest states they replaced**, and
one of them was on the homepage. Nothing had ever measured a hover, because every check runs
against a page at rest.

### Where it was applied, and where it was refused

**Applied.** Untangle (2 fills, 3 text), Tessera (3 fills, 4 marks), Stained (4 fills, 1
mark), Ludo (2 fills, 1 mark), Tailwind (**the button only**), plus the shared layer:
`tokens.css`, `chrome.css` focus rings and `.brand-sub`, the homepage card CTA, the contact
email pill, and both contact-modal buttons.

**Refused, and this is the more useful half.** Two games were left carrying `#D8523F`:

- **Kaleido**, because its accent is a **glass colour**, not a button. See K7.
- **Tailwind's marks**, because they sit over a **photographic sky**, not the dark page, so a
  LIGHTER coral makes them worse rather than better. Tailwind's own source comment already
  says its accent does not hold AA against sky and grass. Only its CTA moved; the marks are
  now `ACCENT_MARK`, unchanged, and named so the next sweep does not take them by accident.

The rule this is an instance of is already in the tracker for sluice, fold and mobile:
**a colour that is game art is not a token, and a contrast sweep over it returns a number
with no meaning.** The split is mechanical only where the colour is chrome.

### Verified, not assumed

- Contrast maths **null-tested first**, in Node and again in the page's own JavaScript:
  white/black 21.00, white/white 1.00, `#767676`/white 4.54. Per
  [[feedback-simulations-need-a-null-test]].
- Untangle measured by **canvas pixel readback** before and after, on the same screen at the
  same level: fill `#D8523F` to `#C24A39`, three text sites `#D8523F` to `#FF6B5C`.
- Stained, Tessera and Ludo each confirmed by readback of the real button interior:
  `#C24A39` with a white label in all three. Stained's `menuFit()` still passes.
- Homepage confirmed from computed style: rest 4.85, hover 6.15.
- **Document audit, 40 pages at 390x844: zero contrast failures.** The three `Send a message`
  buttons were its only remaining ones and they are gone. No scroll lock, no default-blue
  link, no horizontal overflow, no failed resource.
- Every 404 in the console is `/_vercel/*`, which has no file locally. Nothing else fails.

**Not checked:** Tailwind's TRY AGAIN button in situ, because reaching it needs a completed
launch and the CTA colour was verified in source only. Ludo's board was not re-audited; it
remains in the zood/carrom/ludo mini-project.

### One piece of hygiene that came with it

`shared/tokens.css` — the file holding the entire palette — carried **no cache version on any
of the 41 pages**, which is precisely the drift W2 was about. It is now `?v=1` on all 41,
`chrome.css` went 15 to 16 on all 41, and `contact-modal.js` is `?v=1` on its 3. Verified: 41,
41 and 3, with no page left behind. Also, `tokens.css` described the accent as
"4.55:1 white-on-fill". It was 4.04. A wrong comment is a plausible reason this shipped at all.

## Deployed, 2026-08-22

`1783cb8..d2d73b9` merged to main and pushed, live within about 15 seconds. Verified
against the live site rather than assumed. The Browser pane is blocked from the live
domain by policy, so this was read off the server with `curl`.

- `shared/tokens.css?v=1` serves all three coral tokens with their measured ratios.
- The five changed games serve the new value and, bar one, no longer serve the old:
  untangle v19, tessera v26, stained v51, ludo v9 each carry `#C24A39` and zero
  `#D8523F`. **Tailwind v77 carries both**, which is correct: `ACCENT` and
  `ACCENT_MARK`. **Kaleido v74 still carries `#D8523F` and nothing else**, which is
  also correct, and is the check that proves the refusal actually held.
- All four hover rules live: the homepage CTA and the Contact pill on
  `var(--accent-hover)`, and both contact-modal buttons on
  `var(--accent-hover, #A93E2F)`.
- `#FF6B5C` no longer appears anywhere in `index.html`.
- **All 39 sitemap routes return 200**, and every one asks for `tokens.css?v=1` and
  `chrome.css?v=16`. Zero stale, zero non-200.

The 40-page document audit was run against the LOCAL tree before the push, not against
production, because the pane cannot reach the live domain. The files served are
byte-identical to what was audited, but that is an inference, not a live measurement.

| FO5 | fold | **RESOLVED 2026-08-22 with K6** | After FO4 the only frame still overlapping was **568x320, iPhone SE in landscape**, at 26px, down from 81px. The boundary is sharp: clean at 344px tall and above, then 340 gives 6px, 336 gives 4px, 328 gives 12px, 320 gives 26px, 318 gives 37px. Closing it in code would mean cutting the total score or the figure's name, which is more than that frame is worth. **Two games arrived at the same residual from opposite directions**, and in both the answer was the same sentence on /embed/ rather than more geometry. Everything the site now documents is clean in both. | DONE |

## Two findings closed, 2026-08-22

**B1, and the useful part is what the measurement was.** Copy that claims a difficulty
curve is checkable, and the check is a correlation, not a glance. Bloom's flower count
against level number over 300 levels gives **r = 0.078**, and the grid returns exactly
one size from level 10 to 310. That is the difference between "it feels flat" and a
number the copy can be held against.

**N1, and one search was rejected on purpose.** A wider colour search scored better,
dE 33 against 27, by dropping the purple entirely. It was rejected because the metric
did not know what the colours are FOR. Threads are traced by eye across a board, so two
blues and two reds is a worse outcome than a tighter number, and purple and magenta are
precisely the hues that collapse under both kinds of colour blindness. Constraining each
colour to its own hue family cost 6 dE and kept the game legible.

**The verification is the part worth copying.** The final numbers were produced by
reading the palette back out of `needle/play.js` and re-running the whole matrix, not by
trusting the search that proposed it. A search reports what it optimised; only a
re-measurement reports what shipped.

| M4 | mobile | **BREAKS PLAY, and the copy made it worse. FIXED 2026-08-22** | Reported by the owner: at "your sculpture isn't balanced" the only option was **SOLVE**, which hands over the answer. There was no way to take a piece off and try again. Confirmed in the code and then reproduced with a real drag: `pointerdown` carries `if (phase !== 'play') return;` ABOVE the `b.take` branch, so lifting a hung piece was blocked in the `unbalanced` phase. Every hook is full by definition when the verdict fires, so the tray is empty too. The hook hit-boxes are still drawn and still registered, so a player taps a shape and **nothing happens at all**, which reads as broken rather than as refused. The only real escape was the undocumented desktop-only `r` key, which does not exist on a phone. **The source comment 300 lines above says "Taking a piece back off returns to play and the verdict clears", describing behaviour the guard forbids**, and the card said "Keep trying" while the game prevented exactly that. Fixed by allowing `unbalanced` to lift as well as `play`; `verdict()` already returns to `play` the moment a piece comes off. Copy now names the action. Verified with real drags on **8 levels: every one went unbalanced, lifted, returned to `play`, and then completed with error 0.** | DONE |
| M1 | mobile | ACCESSIBILITY, moderate | Mobile is the site's only LIGHT game, a `#EAEAEA` to `#FFFFFF` ground with a white tray, and **4 of its 10 shape colours fall below the 3:1 graphical bar**: yellow `#E4E41F` at 1.36 on the tray and 1.13 on the ground, sky `#8FD7F1` at 1.60/1.33, green `#5DCF37` at 2.01/1.67, orange `#FFA200` at 2.02/1.68. Null-tested. Not decorative: the game's one rule is that the AREA of a shape is its weight, so a shape's edge carries the only information there is. The house rule forbids outlines on game pieces, so the fix is either darkening those four or changing what sits behind them, and both are taste calls. | **FIXED 2026-08-23 with a switch, not a recolour.** The owner's call, and the better one: the colour IS the charm, so it stays the default and an accessible set sits behind a toggle, which is what Stained and Kaleido already do. The four failing colours are **darkened along their own hue** rather than replaced, so the second palette reads as a deeper version of the same set: yellow to `#878712`, sky to `#5C8A9A`, green to `#429427`, orange to `#B67400`. All ten now clear 3:1 against both the white tray and the `#EAEAEA` ground; the six that already passed are untouched. Persists to `zamborin-mobile.palette`, and pixel-verified: with the switch on, the tray paints `#5C8A9A` and no original-only colour appears |
| M2 | mobile | MINOR now, a loaded gun later | `drawControls()` and its `pill()` helper are about 40 lines that are **never called**, confirmed by grep and by screenshot: the shipped game draws no control row. Inside the dead code is a **Rules** button setting `phase = 'menu'`. Nothing renders anything for that phase, and `verdict()` returns early on it, so nothing could leave it. Harmless only because it is unreachable. The moment anyone wires that row up, the first tap on Rules is an unrecoverable soft-lock. Delete it or wire it deliberately. | **FIXED 2026-08-22.** 47 lines deleted. **The first attempt deleted 87 and took `verdictFade`, `drawUnbalanced` and `solveIt` with them**, because they sit between `pill()` and `drawNext()` in the file; the game threw `drawUnbalanced is not defined` on the next run, which is the only reason it was caught. Redone with explicit assertions naming what must survive |
| M3 | mobile | MINOR (AA) | The NEXT and SOLVE buttons are white on `NEXT_RED` `#FF0000`, measuring **4.00:1** against a 4.5 bar. Same family as the accent split shipped earlier today. `#E4001B` measures 4.87 and is visually the same red. | **FIXED 2026-08-22.** `NEXT_RED` `#FF0000` to `#E4001B`, 4.00:1 to 4.87:1 under white type, visually the same red |

## The Mobile dead end, 2026-08-22

Owner-reported, and the most serious functional finding of the whole track, because
nothing automated was ever going to catch it. Every check this week asked "does the
level solve" and Mobile answered **39 of 39, error exactly 0**. It does. What it would
not do is let you FAIL and continue, and no gate had a question for that.

**The shape of it.** One line, `if (phase !== 'play') return;`, sitting above the branch
that lifts a hung piece. When the verdict fires every hook is full, so the tray is empty
and the only remaining interaction is lifting, which that line forbade. The hit-boxes
are still registered, so the tap is received and discarded: the game looks broken rather
than restricted.

**The copy is the part worth remembering.** The card read "Your sculpture isn't
balanced. Keep trying." The code made trying impossible. A comment three hundred lines
above described the correct behaviour as though it already existed. Neither the comment
nor the copy is checkable by any tool here; both were confidently wrong, and the only
thing that found it was somebody playing the game.

**Add to every future per-game audit: can the player RECOVER from a wrong answer?**
Solvability is not the same question. Sluice, Fold, Prism, Stained and Kaleido all have
undo or restart; Mobile's equivalent is lifting a piece back off, and it was switched off
in the one state where it is needed.

**One of my own checks was wrong again, in a new way.** Measuring the contrast behind the
verdict text returned an identical 15.3% at all eight levels with a worst of exactly 1.00,
which is ink measured against ink: the sample included the drawn glyphs. The message now
carries a white halo so it is legible over any shape, and that is verified by screenshot
rather than by a number, because the obvious number is the one that just lied.

## The no-decision batch, 2026-08-22

Eight items that needed no judgement from the owner, cleared in one pass: M2, M3, K3,
U6, T3, W21, W18, and P1 which turned out not to belong in the list at all.

**Site-wide result, measured across all 40 pages at 390x844:** contrast failures **0**,
small tap targets **from about 330 to 0**. The only item the audit still reports is the
15 type-floor entries, which is W20 and an owner call.

**P1 was mis-sorted by me, and the correction matters more than the item.** It looked
like "two colours are too close, move one". Prism's channels are BIT MASKS with additive
meaning: 1 Red, 2 Yellow, 4 Blue, and 5 is red+blue, which is why it is Purple. Moving
purple away from blue breaks "red plus blue makes purple", which is not a palette choice
but the mechanic. A colour finding is only cheap when the colour is arbitrary; here it
is derived. Back on the owner's list, where the honest fix is pips or shapes on the gems.

**One deletion went wrong and the game caught it.** Removing Mobile's dead
`drawControls()` took 87 lines on the first attempt instead of 47, because
`verdictFade`, `drawUnbalanced` and `solveIt` sit between `pill()` and `drawNext()` in
the file and my slice ran from one to the other. The next run threw
`drawUnbalanced is not defined`. **Nothing about the deletion looked wrong** — it parsed
clean, the line count was plausible, and the two greps I ran both passed. Only running
it failed. Redone with assertions naming every function that must survive.

**And the audit's own cache lied once.** The 40-page sweep reported 2 small targets each
on `/guides/bloom/` and `/guides/needle/`, the two files edited earlier the same day.
Measured directly and again with a cache-busting query, both are 0: `ZQC.run` fetches
pages without `no-store`, so a page edited during a session can be read stale. Add a
cache-buster when auditing something just changed.

| Z1 | zood, ludo | **BREAKS USABILITY on a phone, and no event can recover it** | Both bake their logical size at load: `let W, H; if (MODE === 'mobile') { W = innerWidth; H = innerHeight; }`, which then drives the `--canvas-w` / `--canvas-h` CSS variables. `resizeCanvas()` re-reads the rect and fixes the backing store and the transform, so the ASPECT always agrees and the classic narrow-strip test passes, but **W and H themselves never change and neither do the CSS variables**. Measured at 812x375: loaded fresh the canvas is 500x375 in Zood and 375x375 in Ludo; **rotated into that size from portrait both collapse to 173x375, 21.3% of the width**, and dispatching `resize` AND `orientationchange` by hand recovers neither. This is P6 confirmed. **Carrom is unaffected**, because a square board sized to the smaller axis cannot get its aspect wrong. | **HALF FIXED 2026-08-22.** **Ludo is done**: `computeCanvasDims()` and `computeLayout()` were already separate pure functions and Ludo's game state lives in BOARD coordinates, not pixels, so re-running both on resize cannot corrupt a game. Measured: 21.3% to **100%** of the width after a real resize event, board rescaling 351 to 206, and **16 tokens plus the active player unchanged across 9 rotations**. It now listens on `resize`, `orientationchange`, `load` and `visualViewport`, the full set. **Zood is not fixed and see Z2.** Its `geom.rotationSafe` now reports the defect: after a real rotation it returns `false` while `aspectAgrees` returns `true`, which is exactly the pair that made this invisible to every previous check |
| Z2 | zood | SCOPE NOTE on Z1 | Zood cannot simply recompute W and H on rotation. `COLS`, `TILE` and `MAX_ROWS` are `const`, derived from W and H at module load, and they define the bubble grid itself. Changing the logical size mid-game means rebuilding the grid and re-mapping every bubble on it, which is a redesign rather than a patch. **Ludo is more tractable**: it already has a `computeLayout()` that could be re-run. So Z1 is one finding with two different sized fixes, and the cheap options are worth weighing first: lock the orientation, or show a rotate-back hint, or accept and document. | OPEN, owner's call, and the cost is smaller than it looks: a player who rotates gets a correctly-shaped but smaller game, recoverable by rotating back or reloading. Nothing is unreachable and no state is lost |
| Z3 | carrom | MINOR | The only game of fifteen with **no `localStorage` key at all**. It has its own inline `AudioContext` (see S4), but nothing persists, so the sound setting does not survive a reload. Every other game namespaces something under `zamborin-<game>.` | **CORRECTED 2026-08-22, and it is worse than logged.** The original entry said Carrom's sound setting does not survive a reload. There IS no setting: Carrom has procedural Web Audio with **no toggle, no mute and no storage**, and it does not load `shared/sfx.js`. It is the only game of fifteen that plays sound with no way to turn it off, which sits badly against a site whose positioning is games to help you unwind. The fix is the shared `ZSFX` toggle plus a speaker glyph, which is a small feature rather than a one-liner |
| Z4 | carrom, ludo | MINOR | Em dashes in strings drawn to the player, not comments: carrom 3 ("Queen pocketed — cover it with an own piece next shot.", " covered the Queen — claimed.", "Cover missed — Queen returned to centre.") and ludo 2 ("No legal moves — ", "No move with remaining die — turn ends."). Same family as FO1 and B2, both of which were recast. | **FIXED 2026-08-22.** All five recast with a full stop. String-literal count is now 0 in all three, matching FO1 and B2 |
| Z5 | zood, carrom, ludo | MINOR, and it is why FN is still blank | **None of the three exposes a debug handle**, so unlike the other twelve there is no way to drive levels, assert on state, or measure a card. They are the only games on the site that cannot be measured, which is precisely the condition that hid every card bug found this week. Giving each a small handle is the enabling work for their FN, AX and card columns. | **FIXED 2026-08-22.** `window.__zood`, `window.__carrom` and `window.__ludo` all exist, read-only apart from Ludo's `start()` and `refit()`. All fifteen games can now be measured. Swept 3 games x 9 sizes on load: **0 aspect failures, 0 layout failures**, worst fill 46.2% which is the correct letterbox of a square board in a landscape window. **One bug in my own handle, caught immediately:** Ludo reported all four players `finished` before a game started, because `allFinished()` is `every()` and `every` on an empty array is TRUE. Gated on there being tokens. A vacuous truth in a debug handle is how a future sweep gets a confident wrong answer |

## Zood, Carrom and Ludo: the sizing pass, 2026-08-22

Held back all along as their own mini-project, and the reason was right: they share the
least chrome and sit at non-standard frame sizes. The structural pre-scan and the
sizing tests are done; **functionality is not, and cannot be until Z5 is fixed.**

**P6 is confirmed, and sharper than it was written.** The prediction was that these three
would show the narrow-strip bug. Two of them do, and not in the way the existing test
looks for. The aspect always agrees, so the narrow-strip assertion PASSES; what breaks is
that the logical size is captured once at load, so after a rotation the canvas is the
right shape and a third of the right size.

**The test that finds it is not the test we had.** Every previous sizing check either
loaded a page at a size or compared CSS aspect to backing-store aspect. Neither catches
this. What catches it is loading at one orientation and then changing to the other, and
comparing against a FRESH load at the destination size. Zood: 500x375 fresh, 173x375
rotated. Ludo: 375x375 fresh, 173x375 rotated.

**And dispatching the events by hand is what proved it is real.** Bloom looked identical
earlier the same day and was a harness artefact: firing `resize` re-fitted it instantly.
Here `resize` and `orientationchange` both change nothing, because nothing recomputes W
and H. The same two-step told the truth in both directions.

## The last three get handles, and Ludo gets its rotation back, 2026-08-22

**All fifteen games can now be measured.** Zood, Carrom and Ludo were the only three
without a debug handle, which is why their FN column stayed blank while the other twelve
were driven level by level.

**The two games with the same symptom needed opposite treatment**, and that was the whole
call. Ludo's `computeCanvasDims()` and `computeLayout()` were already separate pure
functions, and its game state is in BOARD coordinates rather than pixels, so re-running
them on resize cannot corrupt a game in progress: 16 tokens and the active player came
through 9 rotations unchanged. Zood's `COLS`, `TILE` and `MAX_ROWS` are `const`, derived
from W and H at load, and they index the bubble grid, so the same change there means
rebuilding a live board. Same symptom, opposite risk. Fixing them together because they
present identically was the trap.

**The detector is the durable part.** `__zood.geom.rotationSafe` returns **false** after a
rotation while `aspectAgrees` returns **true**. That pair is the entire reason this
survived every previous sweep: the narrow-strip test asks whether the CSS box and the
backing store agree about shape, and they always did. The canvas was the right shape and
a third of the right size.

**And one bug in my own handle, worth more than the handle.** Ludo's first version
reported all four players `finished` before a game had started, because `allFinished()`
is `every()` and `every` on an empty array is true. It looked like a real result. A
vacuous truth inside a debug handle is how a future sweep gets a confident wrong answer,
which is the same family as the Mobile assertion that failed 39 of 39 and the contrast
check that measured ink against ink.

| S6 | needle | **SILENT, and S4 was wrong about being the only one. FIXED 2026-08-23** | Needle loaded `shared/sfx.js` in its `index.html` and **never called it once**, so it shipped completely silent while looking wired up. S4 recorded Stained as "the only one of fifteen with no sound at all"; that was true of Stained and false of the fleet. Found by auditing sound across all fifteen rather than by trusting the module being loaded. Needle now has `stitch` on a completed thread, `snag` when the cloth refuses, `pop` on undo and `win` on solve, plus a mute pill at `PILL.iconW` first in its control row | DONE |
| S7 | fold | **SOUND QUALITY, owner-reported. FIXED 2026-08-23** | The fold crease was `noise(0.13, 1100, 0.7, 0.045)`. `noise()` decays LINEARLY, so a crease came out as a soft even hiss rather than paper. Paper is a sharp attack with a fast tail whose character is a burst of fibre snaps. A new **`paper(dur, gain, bright)`** primitive in `shared/sfx.js` does that with a cubic decay plus a sparse random crackle riding on the body, and three named effects, `crease`, `unfold` and `paper-slide`, are built on it. Fold now asks for the sound by name rather than carrying numbers | DONE |
| S8 | stained | **S4 CLOSED 2026-08-23.** Stained had no sound at all, the longest-standing gap on the roster | It now loads `shared/sfx.js` and uses two new glass effects, `glass` for a pane meeting the window and `turn` for one rotating in place, plus `pop` for lifting, `click` for the light switch and `win` on solve. Glass wants brightness and a short ring, which is why it does not reuse the wooden knocks the board games use. Mute pill added first in its control row | DONE |

## Sound across the fleet, 2026-08-23

Prompted by the owner asking that every game have proper sound. Auditing all fifteen
rather than trusting the tracker turned up a game nobody knew was silent.

**Needle loaded `shared/sfx.js` and never called it.** Zero references in `play.js`. It
looked wired because the module was in the HTML, and S4's claim that Stained was "the
only one of fifteen with no sound at all" had been carried forward unchallenged since.
Loading a module is not using it, and the check that finds that is counting call sites,
not script tags.

**The fold sound was wrong for a reason worth naming.** `noise()` decays LINEARLY. That
is fine for a wall bounce and wrong for paper, which is a sharp attack with a fast tail
and a character made of fibre snaps rather than air. The new `paper()` primitive uses a
cubic decay plus a sparse random crackle, and lives in `shared/sfx.js` rather than in
Fold, so Stained and Needle could draw on the same vocabulary the same day.

**Three of my checks in a row measured nothing, and the pattern is now familiar.** A
sound probe returned 0 nodes for all four games because driving a debug handle bypasses
`pointerdown`, which is what wakes audio under the autoplay policy. Rewriting it to fire
a real gesture STILL returned 0, because `solve()` sets thread paths directly and never
passes the commit path the sound hangs off. What finally proved it was tapping the new
mute pill through the real UI: **0 nodes with sound off, 1 node with it on**, and the
control row going from 4 buttons to 5. Measure the path the player takes, not the path
the test finds convenient.

**Corrected once on the owner's ear, and the diagnosis is worth keeping.** The first
version was heard as **"a metal case shutting"**, which was three mistakes:

- a **pure tone** was mixed underneath as a landing. Nothing about paper is pitched, and
  a sine is the most metallic thing available.
- the filter was a **bandpass**, which resonates. A resonance is a ring, and ringing is
  what metal does. A highpass takes the boom out without putting a pitch in.
- the body was mostly **smooth noise** with crackle on top, so there was a continuous
  tail for the filter to ring through. The signal is now ONLY crackle, which is what
  paper physically is: many tiny fibre releases rather than a tone.

Also two hits 26ms apart read as click-then-clunk, a latch rather than a crease. One
gesture now, and 70ms rather than 130. The same sine was pulled out of `stitch`, so
Needle would have had the same metallic edge.

**Verified objectively as well as by ear**, because "does it ring" is measurable: the
shipped crease rendered offline gives a **peak autocorrelation of 0.049**, which is no
periodicity at all, and a zero-crossing rate of 0.297, which is broadband. Accepted by
the owner on the second version.

**What still cannot be verified here.** Whether a sound is RIGHT is a judgement this
environment cannot make. The envelope, the crackle density and the
filter centres are designed choices; they are measurable as audio nodes and not as
quality. That one needs the owner's ears.

## The site OG graphic, 2026-08-23

Replaced `images/zamborin-og-image.jpg` with the owner's new art: the orange orbit rings
and the wordmark. 1200x630, which matches the `og:image:width` and `og:image:height`
already declared on all 17 pages, and **98KB against the old 496KB**.

**The filename stayed and the URL changed.** Social platforms cache an OG image by its
URL, so overwriting the file alone would have left LinkedIn and Facebook serving the old
graphic indefinitely. All 18 tags, 9 `og:image` and 9 `twitter:image`, now carry `?v=2`,
which is the same versioning the site uses for every other shared asset. Keeping the
filename matters too: W4 was a broken share card caused by a page pointing at a
DIFFERENT og filename, so there is only one canonical name here on purpose.

Verified by fetching the served file and sampling it rather than trusting the copy: 200,
`image/jpeg`, 1200x630, and three regions read as the new art, the bulb glow at #FEFFF9,
the purple mark at #9E94C6 and the dark field at #0D1719.

**A re-scrape is still worth doing by hand** for anything already shared: the LinkedIn
Post Inspector and Facebook Sharing Debugger both re-fetch on demand, and X refreshes on
its own schedule. The `?v=2` guarantees a NEW share picks up the new art; it does not
retroactively repair a post already published.

| M5 | mobile | **Mobile had no rules screen at all. FIXED 2026-08-23** | The only game of fifteen that never explained itself, so a new player was never told the one rule it has: the AREA of a shape is its weight. A small card now opens on a first visit, persisted to `zamborin-mobile.seen`, and is reachable afterwards from a single quiet `?` mark bottom-left rather than a control row over a sculpture the mockups deliberately leave bare. It carries both switches, which is where Stained and Kaleido put theirs. It draws its own light-theme controls because `shared/ui.js` pills are white-on-transparent for a dark board and would be invisible on this one | DONE |
| M6 | mobile | **I made the same card bug the site has found six times. FIXED before shipping** | The first version hard-coded the card at 300px and put PLAY at `y + ch - 4`, hanging the button **21px off the card's own bottom edge**. Caught by looking at it, then properly by giving the card a `menuFit()` and sweeping. The card is now measured from its content, the type scales with a 0.72 floor and **the button never scales**, and `menuFit()` reports the copy-to-button gap and whether the card is on the canvas. **18 sizes, zero failures**, scales 1.0 down to 0.75, worst gap 84px. The rule earned again: a card is not fixed until something can measure it | DONE |
| L1 | site-wide | **NAMING RISK, owner-raised. FIXED 2026-08-23** | The site named a specific artist across 15 files: page titles, meta descriptions, JSON-LD, `og:image:alt`, the homepage card, `about`, `llms.txt`, source comments, an identifier, and **a palette button labelled with the name**, which is the strongest form because it is a product feature name rather than a description. Accurately: a name is not protected by copyright, so the exposure is **trademark and implied endorsement**, not copying. Nothing about the game needed it. Replaced throughout with plain description: "a hanging mobile", "a balancing mobile", "the mid-century mobile style". Zero occurrences remain in tracked files; `tessera/words.txt` keeps CALDERA, a volcanic crater, which is unrelated. **This is risk reduction, not legal advice** | DONE, and see the note on SEO |

## Mobile's card, and a name removed, 2026-08-23

**M1 went the owner's way and the owner was right.** My instinct had been to recolour;
the answer was a switch. Recolouring would have destroyed the thing worth keeping, and
the site already had the pattern twice over in Stained and Kaleido. The accessible set
darkens each failing colour ALONG ITS OWN HUE, so it is a deeper version of the same
palette rather than a different one.

**Building the card, I made the exact bug this track has found six times.** PLAY hung
21px off the card's bottom edge. It is worth being blunt about that: I had written the
rule up twice in this same file, and still hard-coded a card height and placed a button
against it. What caught it was looking at the screenshot; what FIXED it properly was
giving the card a detector and sweeping 18 sizes rather than trusting the one I could
see. The detector is the deliverable, not the fix.

**On the name.** The owner raised it as a copyright question. The accurate framing is
different and worth recording: a name is not copyrightable, so the risk was never
copying. It was **trademark and implied endorsement**, and the site had drifted well past
description into association: the artist's name sat in a page `<title>`, in JSON-LD
`description`, and as the label on a palette BUTTON, which reads as a product feature
rather than a comparison. Removing it cost nothing, because the mechanic describes itself
perfectly well as a hanging balance sculpture.

**One real cost, stated plainly.** The guide page title carried the name and presumably
drew some search traffic on it. That is now gone by choice. If the traffic mattered it
would have been a reason to think harder, not a reason to keep the risk.

**Not legal advice.** Anything material here wants a professional, and the removal is a
cheap way to stop needing one.

## ADS READINESS, audited 2026-08-24 (overnight)

The goal is switching ads on at the earliest. Audited end to end. **Three blockers, and
two of them are dashboard tasks that only the account owner can do.**

### A1. There is no consent banner, and five pages say there is

`about`, `cookies`, `faq`, `privacy` and `llms.txt` all state that EEA, UK and Swiss
visitors are shown a consent banner. Measured: **`__tcfapi` is undefined, `googlefc` is
undefined, there is no banner markup and no CMP anywhere in the repo.** The claim is
false on all five surfaces, and `privacy` is the one that matters because it is the
document a regulator or a user reads.

**And it is live, not hypothetical.** The AdSense tag `adsbygoogle.js` loads on **all 40
pages today**, with the `adsbygoogle` global present, even though no ad is rendered. The
tag is what sets and reads advertising identifiers, so the gap exists now rather than
starting on the day the ads appear.

**Google requires a certified CMP for EEA/UK traffic** before it will serve personalised
ads there. Google publishes its own, free, and it needs **no code** because the AdSense
tag is already on every page.

**Owner task, in the AdSense dashboard:**
1. Sign in at adsense.google.com
2. Left menu, **Privacy & messaging**
3. **European regulations**, then **Create message**
4. Pick the site, accept the defaults, **Publish**

That single change makes the existing copy true and unblocks EEA/UK serving. Nothing in
the repo needs editing IF this is done. If the decision is instead to NOT run ads in
those regions, the five copy claims must be corrected rather than left standing.

### A2. Every ad slot is a placeholder, not an ad unit

`body.ads-on` is described everywhere as the switch, and it is not sufficient. The slots
are `<div class="ad-slot">` holding a `<span>AD · 728 × 90</span>` label. Measured across
the repo: **zero `<ins class="adsbygoogle">`, zero `data-ad-slot`, zero `adsbygoogle.push()`.**
Turning `ads-on` on today would show empty dashed boxes captioned "AD · 728 × 90".

Each real unit needs a slot ID that only exists once the unit is created in AdSense, so
this cannot be finished from the repo alone.

**Owner task:** AdSense, **Ads**, **By ad unit**, create one **Display** unit per size
(728x90 leaderboard and 300x250 rectangle is enough to start) and paste the two
`data-ad-slot` numbers into `shared/ads.js`. **That is the entire change.**

**`shared/ads.js` is provider-neutral as of 2026-08-24.** Changing ad provider means
setting `PROVIDER`, filling that provider's config, and writing one ~10-line `mount`
function. **The fifteen game pages do not change**, because the markup holds sixty
placeholder `<div>`s that name a SIZE and nothing else, so the only provider-specific
knowledge on the site lives in this one file. Only `adsense` is implemented, deliberately:
a half-remembered integration that looks finished is worse than none.

What would and would not survive a provider change, since it was asked: the **unit ids are
throwaway** (`data-ad-slot` means nothing outside AdSense); **Google's CMP goes with the
AdSense tag** it is delivered through, though the consent REQUIREMENT is not an AdSense
rule and any IAB TCF certified CMP satisfies it; **`ads.txt` needs one line changed**; and
the placeholder markup is untouched either way.

**It makes turning ads on a two-line edit.** Before it, switching
ads on meant hand-editing sixty placeholder blocks across fifteen pages and getting every
one right. Now the markup stays as it is and the file turns each placeholder into a real
`<ins>` at run time. It is loaded by all 15 games and the new-game template.

Both paths tested rather than assumed:

- **Slots empty, which is how it ships:** the script loads and changes *nothing*. 0 units
  created, 0 slots visible, `ads-on` not set, the placeholder labels untouched.
- **Slots filled:** 4 placeholders become 4 `<ins class="adsbygoogle">` with the right
  client, the leaderboard and rectangle ids mapped to the right sizes, `ads-on` set, and
  **the "AD · 728 × 90" labels removed**, so a live unit can never render behind
  placeholder text.

One bug found by testing and worth recording: the first wiring inserted the tag after the
opening `<script>` of `embed.js` instead of after its closing tag, **nesting one script
inside another** so `ads.js` never loaded. It looked right in a diff and the page threw
nothing. Only asking whether the tag was in the DOM caught it.

### A3. Four games had no ad inventory at all — FIXED 2026-08-24

`tailwind`, `zood`, `carrom` and `ludo` carried **0 slots and no sidebar** where the other
eleven carried four each: roughly a quarter of the games with no revenue surface. Their
`<main>` structure turned out to be **identical** to a standard game page, `play-row` plus
`game-wrap` plus `game-info`, so the markup transplanted directly.

Safe to do unattended because it is provably inert: `.ad-slot` and `.sidebar` are both
`display: none` in the base stylesheet and only shown by `body.ads-on`, which nothing
sets. Measured on all four plus orbit as a control, at 1280x900 and 390x844:

- **ads OFF: 4 slots in the DOM, 0 visible**, and every canvas the same size it was
- **ads ON: 4 visible on all five**, the switch behaving on the new ones exactly as on orbit
- no horizontal overflow at any size, on or off

**All 15 games now carry 4 slots.** When the units exist, the swap is one shape repeated
60 times rather than 48.

### What is already correct

- **`ads.txt` is right**: `google.com, pub-9207689324865969, DIRECT, f08c47fec0942fa0`,
  serving 200 as `text/plain`, and the publisher ID **matches** the `ca-pub-` in the pages.
- The AdSense script is present site-wide with the correct client ID.
- Ad slots are already hidden behind `body.ads-on`, and both games that PAINT an ad band
  to canvas respect the same switch, so nothing shows a fake ad today.
- Privacy, Cookies and Terms pages exist and describe advertising.

| P2 | prism | **BREAKS THE EMBED PROMISE. FIXED 2026-08-24** | Prism's rules card overflowed at **4 of 18 sizes**, all short frames, including **480x360, which `/embed/` now names as the smallest supported frame**, by 25px, and 568x320 (iPhone SE landscape) by 49px. The card was already at its 0.72 type floor with nowhere left to shrink. The source note said Prism cannot always win this and that shortening the copy belongs to the owner, which is still true of the COPY, **but the full-frame fallback had never been tried here** and that is a container change, not a copy one. It buys the 22px outer margin each side, the card's internal insets, and a wider column that wraps to fewer lines. Now **19 of 20 sizes pass**: 480x360 fits at scale **0.80**, which is BETTER type than the 0.72 it used to clamp to, 568x320 and 600x340 both fit, and **16 sizes stayed a card untouched**. The one residue is 400x300, still 76px over, down from 132, and it is below the stated minimum. Verified by screenshot in both modes | DONE |
| Q1 | fleet | **NOT A FINDING, my check was wrong. Recorded so it is not re-raised** | A fleet sweep asserting `fits === true` on every detector reported 8 failures. Every one was the check. **Stained's `menuFit()` has no `fits` key at all**, returning `textUnderButton: false` instead, so `!!undefined` read as a failure while the card was fine. **Fold's `winFit()` is meaningless outside the won phase**, and driven to a real win it returns `fits: true, overlap 0`. Only Prism's was real, and that became P2. **The detectors have inconsistent return shapes**, which is worth knowing before the next sweep: 9 of 10 expose `fits`, Stained does not | **CLOSED 2026-08-24.** Stained's `menuFit()` now exposes `fits` like the other nine, so one assertion works across the whole fleet. The underlying lesson stays recorded: the sweep reported 8 failures and 7 were its own assumption about the return shape |

## Page weight, 2026-08-24 (overnight) — 28.7 MB of JPEG down to 13.7 MB

Audited because ad viewability depends on the page actually rendering, and because the
About page claims every game "loads in about a second".

**The dimensions were never the problem.** Every splash is already a sensible retina size,
1520x1200 desktop and 1170x2532 mobile, and they are all the SAME size. What varied was
the compression, by a factor of nine: **sluice's mobile splash was 2,975 KB while
tessera's was 180 KB at the same dimensions.** That is an encoder problem, not an art
problem, which is what made it safe to fix without touching a single composition.

**Sluice's mobile splash was nearly 3 MB, served to phones on mobile data.**

**Tooling matters more than the setting.** `sips` at q=80 only reached 1,209 KB. `mozjpeg`
via `cjpeg -quality 86 -optimize -progressive` reached **670 KB**, and matched what WebP
achieved at the same quality — so the JPEG path was taken, because it needs no CSS or
markup change and therefore carries no risk of a missed reference.

**Quality was measured, not assumed.** The recompressed splash was diffed against the
original in the browser: mean absolute difference 2.57/255 and **PSNR 36.9 dB**, which is
"not perceptible in normal viewing", and that is measured against an original which was
itself already lossy. q=90 and q=92 were tested and rejected as diminishing returns.

**33 files rewritten, 8 correctly skipped** because they were already efficient (kaleido,
needle, stained and tailwind's mobile splash all came out LARGER at q=86, which is the
check doing its job). Best results: mobile desktop -87%, orbit desktop -86%, prism -85%,
untangle-og -84%, sluice mobile -78% and still the largest on the site at 670 KB.

**Every reference normalised to `?v=4`.** The versions had drifted again into a mix of
`?v=1`, `?v=2`, `?v=3` and unversioned, which is W2 repeating, so all splash and teaser
references are now on one version and every `play.css` was bumped.

**Verified**: 13 of 13 recompressed images load with dimensions preserved exactly, OG
images still 1200x630, and the games render.

| O2 | orbit | **BREAKS THE HUD, owner-reported from a 14in MacBook. FIXED 2026-08-24** | The control pills lay out **left to right from x=28** and the read-out lays out **right to left from the right edge**, on the same band, and **nothing checked whether they met**. They met as soon as the SCORE grew: the "Rules" pill ran into "Level 6". Measured across 7 score sizes and 4 levels: clean at 0, **1,809 collides by 5px**, 12,500 by 18px, 1.2M by 53px, worst 97px. **This is why it survived every audit: they all ran on a fresh save with a score of 0.** Fixed by measuring the control row once, giving the read-out the room that is left, and shrinking its type into that with a 0.66 floor; the pills never scale, being a house size and a touch target. **28 probes at desktop, 0 collisions, worst clearance +17px**, scale stepping 1.0 down to 0.76 as the score grows. `hudFit()` added, and it reports n/a on mobile where the read-out is stacked and shares no band. Also removed the em dash from "Dashed rings are geared", the last one drawn to a player in this game. **Checked the fleet for the same shape: only Fold shares it, and Fold has +67px of clearance even at a 25 million score**, because its type is smaller and its string shorter | DONE |

| O3 | orbit | **LAYOUT, owner-reported. FIXED 2026-08-24** | The desktop bands were sized by a magic number that then got SCALED DOWN, rather than from what sits in them. `bs = LH/700` turned a 56px top band into **48px at a 600px frame, holding a fixed 40px pill row**: the buttons had **4px of air above them**, and the hint line, placed at a FRACTION of a 29px bottom band, had about **6px below it**. Both read as a mistake rather than as a tight layout. Fixed by sizing the desktop bands from their contents with a floor, 68 top and 44 bottom, and by centring the hint in its band instead of placing it at `botB * 0.62` so its clearance cannot shrink with the band. `PAD` between board and bands dropped 18 to 10, since the bands now carry the breathing room. Measured at 5 desktop sizes: **14px above and below the pills, 15px under the hint, at every one.** Board radius 252 to 239, a 5% trade for the padding | DONE |

## START HERE — session handoff, 2026-08-24 (after the overnight run)

**Repo is clean, on `main`, level with GitHub, one branch, one worktree. Everything in
this file is DEPLOYED and verified live unless a row says otherwise.**

### The one thing that matters most: ads

**Two dashboard tasks block ads, and only you can do them.** Both are written up in full
in the ADS READINESS section below, with click-by-click steps.

1. **Enable Google's consent message (CMP).** Five pages already tell visitors that
   EEA/UK/Swiss users see a consent banner, and there is no CMP anywhere. The AdSense tag
   loads on all 40 pages today, so this is live, not hypothetical. Google's own CMP is
   free, certified, and needs **no code**: AdSense → Privacy & messaging → European
   regulations → Create message → Publish.
2. **Create the ad units.** Every slot on the site is a placeholder `<div>`, not an
   `<ins class="adsbygoogle">`. Setting `body.ads-on` today would show empty dashed boxes
   captioned "AD · 728 × 90". Create one Display unit per size in AdSense and send me the
   `data-ad-slot` numbers; the swap across all 15 games is then mechanical.

Everything else on the ads path is done: `ads.txt` is correct and serving, the publisher
ID matches, all 15 games now carry 4 slots each, robots.txt allows every crawler, the
sitemap is referenced, and no page carries a stray `noindex`.

### State of the audit

**All 15 games audited. 2 rows open, both recommended as leave-alone**, plus one minor:

- **Z2** zood's rotation. Fixing it means rebuilding a live bubble grid; the cost today is
  a smaller-but-playable board, recoverable by rotating back. Recommended: leave.
- **S5** stained's canvas below the fold in a short window. Narrow, and the pinning was
  itself the narrow-strip fix, so it cannot be casually reverted. Recommended: leave.
- **Q1** now fixed; all ten fit detectors expose `fits`.

**The whole-site document audit reports zero on every check**: 40 pages, 0 contrast
failures, 0 small tap targets, 0 under the type floor, 0 failed resources, every page
scrolls and reaches its footer.

### The two tools, and how to run them

- `shared/qc/doc-audit.js`, from any page on the origin:
  `await fetch('/shared/qc/doc-audit.js').then(r=>r.text()).then(eval)` then
  `ZQC.summary(await ZQC.run(ZQC.ALL_PAGES, {w:390, h:844}))`. **Add a cache-buster to
  any page you have just edited**: `ZQC.run` fetches without `no-store` and will read a
  stale copy.
- Every game exposes a debug handle, `window.__<game>`, and every card game a fit
  detector. **All ten now return `fits`.** Mobile has one too, since it gained a card.

### What the last two days cost the most to learn

- **A card is not fixed until something can measure it, and the measurement is swept, not
  sampled.** Proven again on 2026-08-23: I built Mobile's new card with the button 21px
  off its own bottom edge, in a file where this rule was already written down twice.
- **A check that fails everywhere is a claim about the check.** It happened five separate
  times this week: an assertion that failed 39 of 39 Mobile levels, a contrast test that
  measured ink against ink, a sound probe that returned 0 for four games because driving a
  debug handle bypasses the gesture that wakes audio, a debug handle reporting a vacuous
  truth from `every()` on an empty array, and a fleet sweep reporting 8 detector failures
  of which 7 were the sweep's own assumption about the return shape.
- **The preview pane is unreliable for pictures and fine for numbers.** Measure geometry
  through a same-origin iframe harness; use `resize_window` with explicit width and height.
  **`resize_window` does not dispatch a `resize` event**, so a rotation test must fire one
  by hand or it is measuring nothing.
