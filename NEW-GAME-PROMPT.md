# The new-game prompt

Paste the block below at the start of the session that builds a new Zamborin
game, with `<GAME>` replaced by the name. It is one page on purpose: it is the
bar the game is held to, not the design system, which it points at.

It exists because CrazyGames rejected Comb with one line, "The overall quality
of the game does not yet meet the expectations of our platform." Every rule
here is one of the things that closed that gap. Comb is the worked example:
`comb/play.js` and its `__comb` harness.

---

## THE PROMPT — copy from here

We are building **<GAME>** for zamborin.com, and it has to look like a finished
product on the day it goes live, not like a prototype that gets polished later.

Read in full before writing code: `CLAUDE.md`, `DESIGN-SYSTEM.md`,
`CONTRIBUTING.md`, `shared/new-game-template/README.md`. They override anything
below. Start from `shared/new-game-template`. The idea must already have passed
the Question Set, including a real fail state: no fail state, no game.

Work like this: ask me a quick question rather than deliberating, and show me a
frame early rather than a finished thing late. I am not a developer, so tell me
what you did in plain words, and give me click-by-click steps for anything I
have to do in a dashboard.

### 1. It starts playing

- The first screen is the game, already playable. No title screen, no menu, and
  no rules card in the way. CrazyGames allows at most one click to gameplay.
- A returning player lands in the next thing they were going to do, not on a
  map or a menu.
- The rules live one tap away on a Rules pill, and they are not where a new
  player has to begin.
- The one move the game is made of is **shown at rest**, not explained: a ghost
  piece and a hand that loops on the first board and stops at the first input.
  An affordance that only exists mid-gesture leaves an inert board on screen.

### 2. Every input answers, inside one frame

- Accepted: it lands with a pop, a spark and a sound.
- Refused: it goes back **visibly**. Flying home to where it came from, with a
  shake and a sound, costs the player nothing and teaches the rule. A refusal
  that simply vanishes reads as a bug.
- Won: something happens on the board first, and the result card comes after.
  A static card as the only reward is the thing that reads as unfinished.
- `prefers-reduced-motion` snaps every one of those to its end state. It never
  turns the answer off.
- A dimmed button is still clickable, so the guard lives in the handler.

### 3. It fills the frame it is given

- On zamborin.com the desktop frame is 760x600. In an embed, a portal package
  and full screen, **the window is the frame** (DESIGN-SYSTEM 2.2). A fixed box
  letterboxed into a 16:9 player left 29% of Comb's window empty and was read as
  low quality.
- Prove it at all ten CrazyGames window sizes, at 480x360, on 320 / 360 / 390
  wide phones, and in the site frame.

### 4. Nothing is ever clipped

- Any string that can grow is measured against the space it has, with a chain of
  shorter forms and the shortest last. Never let a sentence run under a button
  or off a pill.
- Every card gets a fit detector that can fail, and the type inside it never
  shrinks below 16px. Sweep the whole width range, 320 to 1920: eight sample
  frames is not a proof.

### 5. Depth without outlines

- No strokes on game pieces. Edges are made of value: a gradient, a lit rim, a
  shadow.
- Draw in two passes, all shadows and then all pieces, so no piece ever casts a
  shadow across its neighbour. One piece shading another is the single note the
  owner gave on Comb's art.
- Contrast is measured on the painted pixel, not on the source hex, and any
  colour transform gets a null test.

### 6. It is measurable, or it is not finished

Behind `?harness=1`, expose `window.__<slug>` with: the state, a way to reach
any level, a way to complete one, `hits()` giving the box of every control and
every cell, a fit check per surface, a contrast check, and the player's record.
Then **drive every check through real pointer events**, never by calling the
game's own functions: an entire game once passed QC with every button dead.
A check that cannot fail proves nothing, so prove each one by breaking it.

### 7. Portal-ready from the first commit

Even if it ships on the site first: no outbound links in the game, the ad
interface only through `shared/portal.js`, gameplay start and stop reported,
never an ad on navigation, and no reward when a video fails, including the
`adsDisabledBasicLaunch` answer CrazyGames gives for a whole Basic Launch.
`node tools/portal-build.mjs <slug> --portal=crazygames` must build, and the
package gets tested as the portal will receive it.

### 8. It gives a reason to come back tomorrow

If the game has a ladder of levels, it also has a daily built from the UTC date,
the same for everyone that day, and a streak that only the daily moves. Say so
on the button, count its stars in the total, and land returning players on it
until it is done. CrazyGames' Basic Launch is judged on next-day return.

### 9. Before you tell me it is done

`node --check`, zero console 404s, zero errors in the harness, AA contrast swept
on painted pixels, fit checks passing at every size above, the input path driven
end to end, and stills for me to look at.

## END OF PROMPT

---

## For a game that is going to a portal

The submission needs three covers (1920x1080, 800x1200, 800x800: title only, no
borders, no logos, nothing blurry; they do not have to show gameplay), two
silent preview videos of 15 to 20 seconds that open on the static cover and do
show real gameplay including one refusal, listing text, and a flat upload folder
whose files are byte-identical to what was tested. Comb's films were shot with
`dist/rig/comb-film.js` in the comb-honey worktree: a virtual clock for
`performance.now`, `requestAnimationFrame` and `setTimeout`, so a frame captured
slowly still animates at true speed.
