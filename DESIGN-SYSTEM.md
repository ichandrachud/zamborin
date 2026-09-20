# Zamborin Design System

**Authority.** This overrides any build brief, concept image or older document
that contradicts it. Read it in full before designing, laying out, colouring or
restyling anything.

**Reference implementation: `bloom/`.** Every number below is measured from
Bloom or from `shared/`, except the controls, the read-out and the pieces
waiting to be played (2.1, 4.2 to 4.5), which are measured from `comb/`. Where
a game disagrees with this document, the game is wrong unless this document
says otherwise.

**Do not infer the system from a screenshot or a concept image.** Those are art
direction. The specification is `shared/tokens.css`, `shared/chrome.css`,
`shared/ui.js`, and this file.

---

## 1. Colour

### 1.1 The ground ladder — five surfaces, named

Every background in the product is one of these five. There is no sixth, and
you may not invent one.

| Name | Token | Value | Use |
|---|---|---|---|
| **Ground** | `--bg` | `#0E1726` | The page. The deepest surface. Canvas floor. |
| **Surface** | `--bg-card` | `#131F36` | Cards, modals, the game card's mid-tone. |
| **Raised** | `--bg-panel` | `#1A2A45` | Panels, the lit top of a gradient, anything above Surface. |
| **Edge** | `--line` | `#1F2D4A` | Solid 1px divisions. |
| **Hairline** | `--line-soft` | `rgba(255,255,255,0.10)` | Divisions over art or gradient. |

They are a **lightness ladder, not a hue set** — same hue family, rising
lightness. Never reorder them: Raised must never sit under Surface.

**Scrim** is a sixth value that is deliberately *below* Ground:
`#0A101C`, used only as `rgba(10,16,28,α)` over a full frame to push a modal
forward. `α 0.88` for the rules card, `α 0.82` for the win card. Scrim is not a
surface and nothing is ever filled with it.

### 1.2 The Portal wash — the canvas background, exactly

Every game's canvas floor is the same radial gradient. Do not re-derive it.

```js
const BG_TOP = '#1A2A45';   // Raised
const BG_MID = '#131F36';   // Surface
const BG_BOT = '#0E1726';   // Ground

const bg = ctx.createRadialGradient(LW * 0.32, 0, 0, LW * 0.32, 0, LW * 1.1);
bg.addColorStop(0,   BG_TOP);
bg.addColorStop(0.6, BG_MID);
bg.addColorStop(1,   BG_BOT);
```

Centre at **32% of width, on the top edge**, radius **1.1 x width**. The light
comes from up and slightly left, always, in every game. The `.game-wrap` CSS
gradient in `chrome.css` is the same three stops at `at 30% 0%`.

> **Comb's wax comb (2026-09-15).** Comb's empty cells are wax: game art on
> the Portal wash, which 1.5 allows. A honey ground with honey cards and scrims
> was built and played the same day and the owner put the ground back to blue,
> keeping the wax and the pieces. Comb's floor, cards and scrims are the house
> tokens; do not re-try the honey ground without the owner.
>
> **Comb's colour and light pass (2026-09-16), each piece the owner's call.** The
> wax is lit from the upper left with a gentle gradation, and its cup reads as a
> hollow. Honey standing in the cups, a comb pattern across the ground, and
> diagonal light with highlights on the pieces were all built and all taken out;
> do not re-propose them. The pieces keep their straight-down gradient by choice,
> although the light rule above says up and left. The piece colours are the old
> set nudged apart, and they are judged on how alike two TOUCHING clusters look on
> the painted canvas (worst 30.6, median 32.8 delta E over 425 pairs), not on how
> evenly they sit round the wheel: an even ladder at one lightness measured worse
> than the colours it replaced.

> **KNOWN DRIFT, fix on sight.** `#1B2A47` is in production as BG_TOP in
> `bloom`, `needle`, `orbit`, `prism`, `sluice` **and in `shared/chrome.css`**,
> against the `--bg-panel` token `#1A2A45` used by `kaleido`, `tailwind`,
> `tessera`, `untangle`, `ricochet` and the new-game template. Two units per
> channel apart, invisible on screen, and it means "the panel colour" has two
> values. **Raised is `#1A2A45`.** Use the token. Do not add a third.

### 1.3 Tint and ink ranges — the only alphas you may use

White over a dark ground, at fixed steps. Pick from this ladder; do not
interpolate a new one.

| Step | Value | Use |
|---|---|---|
| **Tint 03** | `rgba(255,255,255,0.03)` | Empty cell plots, faint insets. |
| **Tint 07** | `rgba(255,255,255,0.07)` | Control fill (`ZAM_UI.PILL.fill`). |
| **Tint 10** | `rgba(255,255,255,0.10)` | Hairline (`--line-soft`). |
| **Tint 12** | `rgba(255,255,255,0.12)` | Card and modal border. |
| **Tint 40** | `rgba(255,255,255,0.40)` | Control border (`ZAM_UI.PILL.border`). Raised from 0.24 on 2026-08-27: the old value measured 2.12 to 2.19:1 against a 3:1 bar in all seventeen games at once. |
| **Tint 30** | `rgba(255,255,255,0.30)` | **Disabled control label only.** Never copy. |
| **Ink 72** | `rgba(255,255,255,0.72)` | HUD read-outs. |
| **Ink 82** | `rgba(255,255,255,0.82)` | Modal subtitle. |
| **Ink 90** | `rgba(255,255,255,0.90)` | Modal body copy. |
| **Ink 92** | `rgba(255,255,255,0.92)` | Control labels (`ZAM_UI.PILL.text`). |
| **Ink 100** | `--text` `#FFFFFF` | Titles and the one CTA label. |

Dimmed type also exists as tokens for DOM copy: `--text-dim` `#C5CFE0`,
`--text-mute` `#8E9CB5`.

### 1.4 Accent — three coral tokens, not interchangeable

| Token | Value | Contrast | Use |
|---|---|---|---|
| `--accent` | `#C24A39` | white on it, 4.85:1 | A fill under white type. |
| `--accent-hover` | `#A93E2F` | white on it, 6.15:1 | That fill's hover state. |
| `--accent-text` | `#FF6B5C` | on `--bg`, 6.42:1 | Coral used **as** type or a mark. |

**Never put white type on `--accent-text`. It measures 2.80:1.**

Also locked: `--accent-2` `#FFD23F` (sunshine highlight), `--green` `#5DD39E`,
`--brand` `#B0E0E6` (the wordmark, and only the wordmark).

**The logo never re-colours per theme.** Black on light, white on dark.

### 1.5 Chrome versus game art — the line that decides every colour question

**Chrome takes tokens only. No invented hex.** Chrome is the page frame,
panels, cards, the rules modal, the win card, every button, all type, the HUD,
the read-out, the footer, and every state of every control.

**Game art may carry its own palette** — the playfield pieces themselves.
Bloom's flowers and pipes, Kaleido's panes, Tailwind's aircraft. Game art must
still sit on a token ground, pass §7, and never restate a chrome colour
slightly differently.

**If you cannot decide which one a thing is, it is chrome.**

---

## 2. The two layouts

Zamborin ships **two genuinely different layouts**, not one picture scaled. A
brief that says "letterbox the portrait column into the desktop frame" is wrong.

```js
const MODE = (matchMedia('(pointer: coarse)').matches ||
              (window.innerWidth > 0 && window.innerWidth < 768))
  ? 'mobile' : 'desktop';
document.body.classList.add('mode-' + MODE);

if (MODE === 'mobile') { LW = window.innerWidth; LH = window.innerHeight; }
else                   { LW = 760; LH = 600; }
```

The `window.innerWidth > 0` guard is not decoration. A browser can report a
zero-wide viewport on the first frame; without it that reads as a phone, MODE
locks, and a desktop player is stuck on the phone layout all session.

| | Desktop | Mobile |
|---|---|---|
| Logical size | **760 x 600** | measured viewport, e.g. 393 x 852 |
| Aspect | 1.267 landscape | ~0.46 portrait |
| Controls | **top band**: pills at the left, Hint and Skip at the right | **top row** of round icon buttons, across the width |
| Read-out | **bottom left**, under the playfield | **bottom left**, with the sound switch bottom right |

- **760 x 600 is the one site-wide frame.** Do not invent another. (Carrom,
  Ludo and Zood are pre-existing exceptions. New games are not.)
- **Mobile is measured in JS. Never CSS `dvh`.** iOS Safari with
  `viewport-fit=cover` reports `100dvh` smaller than `innerHeight` and the
  canvas collapses into a strip.
- Keep **every** re-fit listener from the template: `resize`,
  `orientationchange`, `splash-done`, `load`, `visualViewport`.

### 2.1 The band system, measured from Comb

**Controls at the top, the read-out at the bottom left, in both layouts**
(owner, 2026-09-16; Comb is the worked example). The top band holds every
control. A band along the bottom holds the read-out and, on a phone, the sound
switch at its right end. Sections 4.2 to 4.5 say what goes in each.

| Constant | Desktop | Mobile | Meaning |
|---|---|---|---|
| `SIDE_PAD` | **30** | **16** | Left and right margin for band content and playfield. Comb's phone value is `PHONE_PAD`. |
| `topBand()` | **56** | **64** | Height of the top band: the controls. |
| `botBand()` | **40** | **52** | Height of the bottom band: the read-out. The phone's is taller to clear the home indicator. |
| Control centre `cy` | `topBand() / 2` = **28** | `topBand() / 2` = **32** | |
| Read-out centre | `LH - botBand() / 2` | same | Left aligned at the side margin. |

> **Litmus, by the owner, 2026-09-20.** It has **no bottom band**: the read-out
> ends the **top** band, right aligned at the side margin, white on the band's
> blue (5.2:1), and the phone's sound switch joins the round icons at the
> band's left instead of standing bare at the bottom. The bottom of the screen
> is plain air — `botPad()` is **20** in both layouts — and the play area keeps
> the height the read-out line used to take. In the site's own full screen the
> page's exit button floats over the band's right end (2.2), so the read-out is
> inset by its width there. A read-out too long for the room between the last
> control and that edge drops the chapter's name before it drops the level.

Playfield, both modes:

```js
const availW = Math.max(60, LW - SIDE_PAD * 2);
const availH = Math.max(60, LH - topBand() - botBand());
cell = Math.max(8, Math.floor(Math.min(availW / C, availH / R)));
ox = Math.round((LW - C * cell) / 2);
oy = Math.round(topBand() + (availH - R * cell) / 2);
```

Cells are square and integer. The board is centred horizontally in the frame
and vertically in the band-free area — **not in the frame**.

**Desktop side space must carry something real** — a tray, a next-piece
preview, a score column. Not an empty gutter. A landscape grid needs roughly a
1.39 ratio as it grows: use `rows + (rows <= 6 ? 2 : 3)`.

**Mobile touch budget is about 54 comfortable positions** — a 390 x 620
playfield over 56px targets. Buy depth from relationships, not more positions.

### 2.2 Full screen

**When the game IS the whole page, the window is the frame.** Comb takes the
window's own size as `LW`/`LH` in an embed, a portal package and full screen
(one CSS pixel to one unit), instead of contain-fitting 760 x 600 into it:
the fitted frame left 29% of every CrazyGames 16:9 window empty and set 16px
type at 12.3px in their smallest (821 x 462). A desktop window narrower than
760 is laid out at 760 across and scaled, so the top band keeps its row.

**Litmus adds three things to that rule** (2026-09-16, pending the owner's
look at before and after frames). In an embed or a package the window's
**shape** picks the layout, not the pointer: CrazyGames plays phones and
tablets on their side (800 x 450, 1080 x 607), where the portrait phone layout
squeezed the dish into a strip. The landscape layout is laid out at **least
760 x 450 and at most 720 tall** and scaled to the window, so every full screen
shows the 1280 x 720 layout enlarged instead of 16px type in a room-sized
dish. And its dishes keep the **frame's room in world units** (radii squared)
whatever the shape, so a crowd is as thick in a wide short dish as in
760 x 600. In the site's own full screen the page's exit button (44px, 24px in
from the top right) sits over the right end of the top band once the game
fills the window, which is where Hint and Skip go (4.2): measure them against
it. `chemistry/window-sweep.mjs` checks all of it.

`body.focus-mode` is shared chrome. For a **fixed-board** game the board grows
with the frame and that is correct. For a **scrolling-world** game the frame
grows and the drawing scale must not — take the viewport's real pixels as
`LW`/`LH` and anchor the world scale to `FRAME_W`. Tailwind is the worked
example. Measured across all 15 games: nothing clips in full screen.

---

## 3. The cover (splash)

| Asset | Size | Where |
|---|---|---|
| `splash-desktop.jpg` | **1520 x 1200** (2x the frame) | game folder |
| `splash-mobile.jpg` | **1170 x 2532** | game folder |
| `images/<slug>-og.jpg` | **1200 x 630** | shared images |
| `images/<slug>-teaser.jpg` | **1200 x 800** | shared images |

- No `splash-images/` working folder. Masters go to
  `iCloud/Claude Projects/Zamborin/source-assets/`, never the repo.
- The `.splash` frame, `cover` sizing and fade come from `chrome.css`. The game
  supplies only the two `background-image` rules, per mode.
- Timing is fixed: reveal **2000ms**, fade **600ms**, removed from the DOM at
  **2700ms**, then `splash-done` fires.
- **Wordmark safe zone.** `cover` crops the sides. Maximum wordmark width as a
  share of image width is **0.38 / image aspect** — 60.8% on a 1200 x 1920.
  Check before shipping, and **fix the art, never the CSS.**

---

## 4. UI

### 4.1 Buttons — `ZAM_UI`, never scaled

```
PILL   h 40   font 15/700   padX 36   gap 10   iconW 44   radius h/2
       fill Tint 07   border Tint 40 at 1.5   label Ink 92   disabled Tint 30
ROUND  a perfect circle PILL.iconW (44) across, which is also its touch target
       fill, border and icon ink as PILL
CTA    h 50   font 17/700   minW 210   padX 90   label #FFFFFF   radius h/2
```

Draw with `ZAM_UI.drawPill()`, `ZAM_UI.drawRound()` and `ZAM_UI.drawCTA()`.
**Sizes are never scaled per game.** A button is chrome, not content: it is the
same physical size in this game as in Bloom. Mobile's NEXT was once sized as a
fraction of a phone mock and came out 21px tall with a 9px label in the desktop
frame.

**Icons come from `ZAM_UI.drawIcon(ctx, key, cx, cy, { dim, on })`**: `map`,
`undo`, `restart`, `hint`, `skip`, `rules` and `sound`, so every game shows the
same ones. The map icon is the one a game may draw for itself from its own
pieces: Comb's is five comb cells. The rewarded mark is
`ZAM_UI.drawVideoMark()`.

**Never more than one CTA on screen.**

### 4.2 The controls, at the top

> **Changed 2026-09-16, by the owner.** Controls used to sit at the bottom of a
> phone, and the read-out top right in both layouts. Comb is the only game on
> the arrangement below so far. **Every other game converts the next time a
> session works on it**, in that session: checked at 320 wide and in the
> 760 x 600 frame, and shown to the owner on a phone and on desktop before it
> ships.

> **Litmus, by the owner, 2026-09-17.** A phone held sideways in an embed keeps
> the landscape arrangement — the window's shape decides the layout there, not
> the pointer — and the game's own screens (its sections screen and its map)
> carry a way back where the map button would be: the left button on the map
> goes home.

**Phone.** Every control is a round icon button, with no label, in one row
across the top. Order, left to right: **map, Undo, Restart, Hint, Skip, Rules.**
Omit what a game does not have; never reorder. The sound switch is not in the
row (4.3).

- The row starts at `x = 16`, centred on `cy = topBand() / 2`, and its gaps
  share out the width: `gap = max(4, min(28, (LW - 32 - n * 44) / (n - 1)))`.
- **Six buttons is the most a 320-wide phone holds**: they fill its 288 units
  between the margins exactly. A seventh control has to replace one.
- A rewarded Skip carries `drawVideoMark()` at `w 20` on its top-right edge, so
  the button keeps its size.

**Desktop.** Labelled pills in the top band, left aligned from `x = SIDE_PAD`:
**map icon, sound icon, Undo, Restart, Rules**, `gap` 10. Hint and Skip are
pills at the band's **right** end, finishing at `LW - SIDE_PAD`, `gap` 12.

- **The two ends of the band can meet.** The row lays out from the left and
  Hint and Skip from the right, so measure both and prove the gap between them
  at the narrowest frame; Comb's `bandFit()` does. Orbit's read-out collided
  with its row this way as soon as the score passed four figures.
- **In zamborin.com's full screen the page's exit button hangs over the band's
  right end**: 44 across, 24 in from the top right, shown from 1152 wide up (so
  never on a phone). Hint, Skip and anything else at that end stop 12 short of
  it. Measure the button from the page whenever the layout runs, as Comb's
  `exitButtonBox()` does, and check it in the fit test. At 1440 x 900 it covered
  Skip, and a click meant for Skip left full screen.

**Both.** A dimmed button is **still clickable**: `dim` only changes the ink.
If a control must not fire, guard it in the handler, and put the analytics call
**below** the guard, not above it.

A phone held sideways is not settled yet. Ask the owner before designing it;
Comb still draws its old arrangement there.

### 4.3 The read-out, at the bottom left

One left-aligned line, Ink 72, `600 16px`, every figure in it separated by
`   ·   `: `LEVEL 12   ·   MOVES 4`. It sits at the side margin, centred in
the bottom band. (Litmus moved it to the top band's right end; see 2.1.)

- **Phone:** the **sound switch** sits at the other end of the same band as a
  bare icon, `drawIcon('sound')` with no circle, its drawing ending 16 from the
  edge and its touch target still 44 x 44. The read-out keeps 16px; measure it
  against that target at 320 wide.
- **Desktop:** it may scale down on a narrow frame, to a floor:
  `hs = max(0.66, min(1, LW / 620))`.

### 4.4 The map on a phone shows the levels, and nothing else

No controls, no read-out, no title and no daily button: the level cells fill
the screen. A player picks a level to leave it. The desktop map keeps its top
band. The daily is still what a returning player lands in until it is done
(10.1). What this costs, accepted by the owner: on a phone, a daily left
unfinished cannot be reopened from the map until the next visit.

### 4.5 Pieces waiting to be played

For a game with a tray of pieces:

- **Every piece is visible at once.** No scrolling, no pages, no window of the
  next three. If they do not fit, draw them smaller (Comb's floor on a phone is
  a radius of 8) before anything is hidden.
- **Nothing behind them.** No panel, card or tray fill: they sit on the Portal
  wash.
  > **Litmus, by the owner, 2026-09-17.** Its four product boxes keep an
  > outline and a fill: they are the places a reaction's products land, not
  > pieces waiting to be played, and on a paper page an empty place has to be
  > visible before anything is in it. The pieces themselves — the marbles —
  > still sit on the page with nothing behind them.
- **A piece grows when it is touched.** It lifts at its tray size and grows to
  board size under the finger in 120ms. A touch that does not move puts it back
  quietly, with no refusal shake or sound, because nothing was refused.
- **Phone:** each piece keeps its own slot in a loose grid under the board,
  nudged a little off the grid by a hash of the piece and the level. It looks
  placed by hand, and it never shuffles when a neighbour is played or the level
  is reopened. The board is sized first; the pieces take the room that is left.
- **Desktop:** the pieces stand in the side space at the right, in whichever of
  one to three columns draws them largest, and close up as each one is played.

---

## 5. The rules modal — one standard size, and it scrolls

**This section replaces "shrink the type until it fits" wherever an older
document says it.** Shrinking was a workaround for unbounded content. A bounded
scroll region is the fix, and it lets the type stay at its designed size.

### 5.1 The box

```js
const pw = Math.min(LW - 56, 470);          // width,  470 max, 28 side margin
const ph = Math.min(LH - 20, 420);          // height, 420 standard
```

- Radius **22**. Fill **Surface `#131F36`**. Border **Tint 12** at 1px.
- Centred: `px = (LW - pw) / 2`, `py = (LH - ph) / 2`, `py` floored at 10.
- Scrim **`rgba(10,16,28,0.88)`** over the whole frame behind it.

### 5.2 Three zones. Header and footer are fixed; only the body scrolls.

| Zone | Height | Contents |
|---|---|---|
| **Header** | **154** | top pad 34 · title `800 40px` · advance 54 · subtitle `600 17px` Ink 82, line 24, max 2 lines · gap 18 |
| **Body** | `ph - 154 - 98` → **168** at standard height | the numbered rules, scrolls |
| **Footer** | **98** | 16 clearance · CTA h50 · bottom pad 32 |

Body rows: number dot **r 12** filled `--accent-text`, centred at `px + 43`,
numeral `800 14px` in Ground. Copy starts at `px + 66`, `500 16px` Ink 90,
line height **22**, gap **13** between rules, wrap width `pw - 100`.

> Rules copy is **16px, not 15px.** With a scroll region there is no reason to
> go under the site-wide 16px floor, and there never was a good one.

### 5.3 Scrolling

- The body is clipped to its viewport. Content taller than it scrolls; content
  shorter than it does not, and is top-aligned.
- Wheel, drag and touch all scroll. Offset clamped to
  `[0, contentH - viewportH]`.
- When there is more above or below, a **20px fade** from Surface to
  transparent marks that edge. No scrollbar, no arrows.
- **The type never shrinks and the CTA never moves.** Both are house sizes.

### 5.4 It is not done until it is measured

Expose a `rulesFit()` detector returning, at minimum:

```js
{ fits, cardH, frameH, viewportH, contentH, scrollMax, overlapPx }
```

`fits` is true when the header, body viewport and footer sum to `ph` and the
card sits inside the frame. **Test at 480 x 360 explicitly** — the smallest
frame `/embed/` supports. There the card is 340 tall and the body is 88, so it
*will* scroll, which is the point.

**A card is not fixed until something can measure it.** Three cards in three
days were believed fixed and were not; each was caught by a detector on its
first run. A detector that reports `fits` outside the phase it describes is
worth nothing — Fold's `winFit()` and Tessera's `overFit()` both do.

If the rule cannot be guessed from a still image, the card carries a **looping
demo**. Stained's does.

---

## 6. Pieces, edges and light

- **No outlines on game pieces.** Stroked borders and cut-lines read cartoonish
  and kill the elegance. Define every edge with **value**: gradients, a light
  band across the top, a shadow underneath.
  > **Litmus, by the owner, 2026-09-16 and 09-17.** The game is played on a
  > school notebook page, and its glassware — dish, test tube, target glass,
  > product boxes, map cells — is drawn in blue ink hairlines, because that is
  > what a drawing on paper looks like. The rule still holds where it matters:
  > the pieces, the marbles, keep value-only edges and no outline. A paper page
  > also changes what contrast costs: eight of the sixteen marbles measured
  > under 3:1 on it and were deepened in linear light until they cleared the
  > bar, hue and shading kept (7, and `chemistry/contrast.mjs`).
- **Glow is a thin bright core with a tight feather.** Never a wide wash.
- Light comes from **up and slightly left**, matching the Portal wash.
- **No emoji anywhere.** Flat or outlined SVG and canvas glyphs only. Absolute.

---

## 7. Contrast

- Every piece of type and every graphical object: **4.5:1 normal, 3:1 large and
  graphical.** Sweep before finalising.
- **Hover, focus and active states are never measured by a check that runs on a
  page at rest.** Check them explicitly.
- **Measure against the ground a thing is ACTUALLY drawn on.** The PILL border
  fix nearly shipped at 0.34 because the note recorded only the Portal wash. The
  binding ground turned out to be Tailwind's control band over a pale sky, where
  0.34 gives 2.77:1 and the true minimum is 0.37.
- **Null-test any colour transform on white, grey and black first.** Two typo'd
  matrix coefficients once produced alarming, specific and entirely wrong
  findings.
- Where a game's rule *is* colour, bands must differ in **lightness** as well as
  hue, plus a second channel if lightness is not enough.

---

## 8. Type

- **No content copy below 16px, site-wide.** Every `clamp()` minimum on a text
  class is 16px or more. Chrome, badges, counters and timestamps are exempt.
- The marketing type scale is locked. Reuse it; do not invent sizes.
- Canvas type follows the same spirit: HUD read-outs may be small; anything a
  player has to **read** may not.
- Font is Inter, supplied by `chrome.css`. Do not load another.
- **No em dashes in body copy.**

---

## 9. Audio

`ZSFX.create({ storageKey: 'zam.<slug>.sfx' })`. The fleet is mixed about **4x
too quiet**, peaking near -11.7 dBFS. `shared/sfx.js` carries an opt-in master
gain defaulting to 1; only Tailwind sets it. Set it and check the peak.
**Turning a hiss down just gives a quieter hiss — fix the band.** A muted game
has no sound at all, not quiet sound.

---

## 10. Finished, not a prototype

CrazyGames rejected Comb with one line: "The overall quality of the game does
not yet meet the expectations of our platform." The mechanic was not the
problem, and neither was the art on its own: what was missing was everything
below. A game that skips these reads as a prototype however good the idea is,
and every rule here can be tested.

### 10.1 The first ten seconds

- **The first screen is the game, already playable.** No title screen, no menu,
  no rules card in the way. CrazyGames allows at most one click into gameplay,
  and their standard is to "land new users in gameplay immediately".
- A **returning player lands in the next thing they were going to do**, never on
  a map or a menu. If the game has a daily, that is what they land in until it
  is done, and a single line says which board they are on.
- The rules stay one tap away on the Rules button. They are not where a new
  player has to begin.
- **The verb is shown at rest, not explained.** A ghost piece and a hand that
  loops on the first board, and stops at the first input. An affordance that
  exists only mid-gesture leaves an inert board on screen.

### 10.2 Every input answers, inside one frame

- **Accepted:** it lands with a pop, a spark and a sound.
- **Refused: it goes back visibly.** Flying home to where it came from, with a
  shake and a sound. Comb set a `flash` timestamp for months that nothing ever
  drew, so a refused drop simply vanished, which reads as a bug rather than a
  rule.
- **Won:** something happens on the board first and the result card comes after.
  A static card as the only reward is the thing that reads as unfinished.
- `prefers-reduced-motion` **snaps each of those to its end state**. It never
  turns the answer off.
- A dimmed button is still clickable, so the guard lives in the handler and the
  analytics call sits below it.

### 10.3 Nothing is ever clipped

- Any string that can grow is **measured against the room it has**, with a chain
  of shorter forms and the shortest last. Comb's daily line carries three forms;
  a 320-wide phone gets the shortest rather than a sentence running off a pill.
- Every surface that holds copy gets a **fit detector that can fail**, and the
  type inside it never shrinks below the 16px floor in §8. HUD read-outs may
  scale, down to 0.66.
- Sweep the whole width range, **320 to 1920**. Eight sample frames is not a
  proof: the daily button passed at five sizes and overflowed at 360.

### 10.4 Depth in two passes

Shadows are drawn in a pass of their own, all of them, and then every piece on
top. Drawn piece by piece, each new piece lays its shadow across the one beside
it, which is the single note the owner gave on Comb's finished art. See §6 for
what makes an edge and §7 for what has to be measured.

---

## 11. Sign-off

- [ ] All chrome colour from tokens. No invented hex in chrome. `#1A2A45` for Raised.
- [ ] Portal wash at `0.32 / 0` radius `1.1 x LW`, three stops.
- [ ] Buttons and icons drawn by `ZAM_UI` at `ZAM_UI` sizes, unscaled. One CTA maximum.
- [ ] Controls at the top: on a phone, round icons in the order map, Undo, Restart, Hint, Skip, Rules; on desktop, pills at the left and Hint and Skip at the right, the gap between them measured.
- [ ] Read-out one line at the bottom left; on a phone, the sound switch bare at the bottom right.
- [ ] On a phone, the map shows the levels and nothing else.
- [ ] Every waiting piece visible at once, nothing behind it, growing when touched.
- [ ] Desktop 760 x 600 designed as landscape, side space carrying something real.
- [ ] Mobile measured in JS, portrait, inside the 54-target touch budget.
- [ ] No CSS `dvh` in sizing. Every re-fit listener present.
- [ ] Rules modal at the standard box, three zones, body scrolls, type unshrunk.
- [ ] `rulesFit()` written and passing, **tested at 480 x 360**.
- [ ] No outlines on pieces. No emoji. No content copy under 16px.
- [ ] AA swept including hover and focus. Colour transforms null-tested.
- [ ] Splash at both sizes, wordmark inside the safe zone.
- [ ] Audio master gain set, peak checked.
- [ ] Lands in gameplay, one click at most; the verb shown at rest on the first board.
- [ ] Accept, refuse and win each answer visibly; reduced motion snaps to the end.
- [ ] Growing strings measured with a fallback chain; widths swept 320 to 1920.
- [ ] Shadows in a pass of their own; no piece shades its neighbour.
- [ ] `?harness=1` handle present, and every check driven through pointer events.
- [ ] `git ls-files | grep ' '` empty; `node --check <game>/play.js` passes; zero console 404s.
