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
- Local preview: the `zamborin` config in `.claude/launch.json`, port 5230.
- **A failing check is usually the check.** It has been, six times in one week.
  The tells: it fails everywhere, the numbers are identical across cases, the
  rate is exactly 100%, or a failing row contains a value that passes. Verify a
  detector on a case you know is good before reporting what it found.

## Sharing this repo with other sessions — the rules, not the guidance

**Several sessions work in this one directory at the same time.** On 2026-08-28
three of them had work stranded here at once: a tracker edit uncommitted for
eight hours with no copy anywhere, a whole game committed but never pushed, and
one session's edits swept into another's commit. Every rule below is one of
those.

**Start.** Know where you are before you write anything:

```bash
git worktree list && git branch --show-current && git status --short
```

If the branch is not what you expected, **do not check out `main`** — another
session is likely mid-work on it. Use a worktree instead:
`git worktree add ../zamborin-<task> -b <task> main`.

**While you work.**

- **Never `git add -A`, `git add .`, or `git commit -a`.** Stage by explicit
  path, always.
- **Staging by path is NOT enough on a file more than one session touches** —
  `QC-TRACKER.md`, `index.html`, `sitemap.xml`, `llms.txt`, `shared/*`.
  **Diff the path before you stage it**, and only stage it if every line in the
  diff is yours:

  ```bash
  git diff -- <path>          # read it. Is all of this yours?
  ```

- **If a shared file holds someone else's uncommitted work**, check how old it
  is (`date -r <path>`). Minutes old means they are still working: leave it,
  and put your change elsewhere or wait. Hours old means that session has ended:
  commit it **unedited**, and say in your message which lines are not yours and
  why you took them. Never edit their lines to make yours fit.

**Finish with a PUSH, not a commit.** Committed-but-unpushed is invisible to
every other session and to the owner. Before you end a turn that changed
anything:

```bash
git status --short                     # nothing of yours left unstaged
git log --oneline origin/main..HEAD    # nothing left unpushed
```

If the owner has not authorised a push yet, **say so explicitly in your final
message** and name the commits that are waiting. Silence is how work gets lost.

**Pushing carries everything ahead of `origin/main`, including other people's
commits.** Check `git log --oneline origin/main..HEAD` before you push and say
what is in it. If it includes a new game directory, verify it carries
`<meta name="robots" content="noindex">` and is linked from nowhere before it
goes live.
