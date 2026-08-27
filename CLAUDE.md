# Zamborin Games — read this before you touch anything

This file is loaded into every session automatically. It is deliberately short.
Its only job is to send you to the documents that are not.

## The problem this file exists to solve

The design system was written, and then four games were built without it,
because it lived in iCloud and nothing in the repo pointed at it. If you are
about to design, lay out, colour or restyle anything, **you are the person that
happened to.** Read `DESIGN-SYSTEM.md` first.

## Mandatory reads, in this order

| When | Read |
|---|---|
| **Any design, layout, colour or UI work** | `DESIGN-SYSTEM.md` — **in full, before writing code.** It overrides every build brief. |
| Any structural change, new game, shipping | `CONTRIBUTING.md` — the rulebook. Every rule cost a cleanup. |
| Any QC, audit or bug hunt | `QC-TRACKER.md` — go to **START HERE** at the very bottom. Everything above it is history. |
| Building a new game | `shared/new-game-template/README.md` — a production checklist, not a readme. |

Do not infer the design system from a screenshot, a concept image, or another
game's output. Concept images are art direction, not specification. Read the
source files: `shared/tokens.css`, `shared/chrome.css`, `shared/ui.js`.

## The five that get broken most

These are here because they are the ones that keep coming back. They are not a
summary of the design system and they do not replace reading it.

1. **Two layouts, never one scaled.** Desktop is **760 x 600 landscape**, the
   one site-wide frame. Mobile is the **measured viewport in JS**, portrait.
   Never CSS `dvh`. Never letterbox one into the other.
2. **Chrome takes tokens only.** No invented hex in the page frame, cards,
   buttons, type, HUD or controls. Game *art* may have its own palette. If you
   cannot decide which a thing is, it is chrome.
3. **Buttons come from `ZAM_UI` at `ZAM_UI` sizes, never scaled per game.**
   A button is chrome, not content.
4. **No outlines on game pieces.** Edges are made of value — gradients, a light
   band, a shadow. No emoji anywhere, ever.
5. **A card is not fixed until something can measure it.** Write the detector,
   report a number, and test the rules card at 480 x 360.

## Working here

- This is a **live site**. `git push origin main` deploys in about 15 seconds.
  Say what you are changing and why before a sweeping change, work on a branch
  for anything non-trivial, and only push when the owner says so.
- Another session may be in this repo at the same time. Commit your own files
  **by path**; never `git add -A`. Run `git worktree list` before checking out
  `main`.
- Local preview: the `zamborin` config in `.claude/launch.json`, port 5230.
- **A failing check is usually the check.** It has been, six times in one week.
  The tells: it fails everywhere, the numbers are identical across cases, the
  rate is exactly 100%, or a failing row contains a value that passes. Verify a
  detector on a case you know is good before reporting what it found.
