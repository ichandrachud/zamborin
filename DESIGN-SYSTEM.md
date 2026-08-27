# Zamborin Design System

**Authority.** This overrides any build brief, concept image or older document
that contradicts it. Read it in full before designing, laying out, colouring or
restyling anything.

**Reference implementation: `bloom/`.** Every number below is measured from
Bloom or from `shared/`. Where a game disagrees with this document, the game is
wrong unless this document says otherwise.

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
| Controls | **top band, left aligned** | **bottom**, thumb reach |
| Read-out | top band, right aligned | top band, right aligned |

- **760 x 600 is the one site-wide frame.** Do not invent another. (Carrom,
  Ludo and Zood are pre-existing exceptions. New games are not.)
- **Mobile is measured in JS. Never CSS `dvh`.** iOS Safari with
  `viewport-fit=cover` reports `100dvh` smaller than `innerHeight` and the
  canvas collapses into a strip.
- Keep **every** re-fit listener from the template: `resize`,
  `orientationchange`, `splash-done`, `load`, `visualViewport`.

### 2.1 The band system — measured from Bloom

The HUD is **one top band, not two edges**. Controls sit left in it, the
read-out sits right in the same band, on the same centre line.

| Constant | Desktop | Mobile | Meaning |
|---|---|---|---|
| `SIDE_PAD` | **30** | **30** | Left and right margin for band content and playfield. |
| `topBand()` | **56** | **64** | Height of the top HUD band. |
| `botBand()` | **20** | **96** | Bottom reserve. Mobile holds the control row. |
| Control row centre `cy` | `topBand() / 2` = **28** | `LH - 74` | |
| Read-out baseline | `topBand() / 2` = **28** | same | Right aligned at `LW - SIDE_PAD`. |

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
PILL  h 40   font 15/700   padX 36   gap 10   iconW 44   radius h/2
      fill Tint 07   border Tint 40 at 1.5   label Ink 92   disabled Tint 30
CTA   h 50   font 17/700   minW 210   padX 90   label #FFFFFF   radius h/2
```

Draw with `ZAM_UI.drawPill()` / `ZAM_UI.drawCTA()`. **Sizes are never scaled
per game.** A button is chrome, not content: it is the same physical size in
this game as in Bloom. Mobile's NEXT was once sized as a fraction of a phone
mock and came out 21px tall with a 9px label in the desktop frame.

**Never more than one CTA on screen.**

### 4.2 The control row

Order is fixed, left to right: **sound icon, Undo, Restart, Hint, Rules.**
Omit what a game does not have; never reorder. `gap` 10 between pills.

- Desktop: starts at `x = SIDE_PAD`, centred on `cy = topBand() / 2`.
- Mobile: the row is centred horizontally, on `cy = LH - 74`.
- A dimmed pill is **still clickable** — `dim` only changes label colour. If a
  control must not fire, guard it in the handler, and put the analytics call
  **below** the guard, not above it.

### 4.3 The read-out

One right-aligned line at `LW - SIDE_PAD`, on the band centre. Ink 72,
`600 16px`. All figures in that one line, separated by `   ·   `. It scales
down on narrow frames: `hs = max(0.66, min(1, LW / 620))`.

**Nothing checks whether the control row and the read-out collide.** They lay
out from opposite ends of the same band. Measure the row once, give the
read-out the room that is left, and shrink its type into that with a floor.
Orbit's collided as soon as the score passed four figures.

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

## 10. Sign-off

- [ ] All chrome colour from tokens. No invented hex in chrome. `#1A2A45` for Raised.
- [ ] Portal wash at `0.32 / 0` radius `1.1 x LW`, three stops.
- [ ] Buttons drawn by `ZAM_UI` at `ZAM_UI` sizes, unscaled. One CTA maximum.
- [ ] Control row order sound, Undo, Restart, Hint, Rules. Left on desktop, bottom on mobile.
- [ ] Read-out one right-aligned line; row-versus-read-out collision measured.
- [ ] Desktop 760 x 600 designed as landscape, side space carrying something real.
- [ ] Mobile measured in JS, portrait, inside the 54-target touch budget.
- [ ] No CSS `dvh` in sizing. Every re-fit listener present.
- [ ] Rules modal at the standard box, three zones, body scrolls, type unshrunk.
- [ ] `rulesFit()` written and passing, **tested at 480 x 360**.
- [ ] No outlines on pieces. No emoji. No content copy under 16px.
- [ ] AA swept including hover and focus. Colour transforms null-tested.
- [ ] Splash at both sizes, wordmark inside the safe zone.
- [ ] Audio master gain set, peak checked.
- [ ] `git ls-files | grep ' '` empty; `node --check <game>/play.js` passes; zero console 404s.
