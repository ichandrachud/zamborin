# Marble's measuring tools

Instruments, not the site (`/tools/` is in `.vercelignore`). They run headless Chrome against the repo folder served for
the length of a run (`shoot.mjs`, `SERVE_DIR`/`SERVE_PORT`), and read the game through `?harness=1` (`window.__marble`).

- `pilot.js` (+ `pzsolve.js`): the level autopilot. `__pilot.fast(n)` steps the game by hand; `__pilot.live(n)` drives
  real touch events. From level 101 it hands the machine's obstacles to `spctl.js` and its puzzle squares to
  `puzpilot.js`. `lvrun.sh 101 110 out.json` plays a run of levels (`OPTS="{ race: 7, fork: 'short' }"` to race for stars).
- `puzpilot.js`: plays the space puzzles (`__pp.run('stars')`, `{ careless: true }` for the null test, `{ only: i }`).
  `ladrun.sh n out.json` plays every square of one ladder (n u v o a), careful and careless.
- `spacepilot.js`: the obstacle try-outs (`#try-blackhole` ...). `spctl.js`: the same, one obstacle at a time.
- `score.js`: a course's difficulty from what is on it; levels 101-150's seeds (PIN_VARIANT in play.js) were picked with it.
- `puz/`: the searches behind every space puzzle layout (`gen*.js`, ladders in `lad-*.json`) and the solvers they use.
  `mk-pb13.js` wrote the ladders block of play.js (Object.assign(PLAZAS, { SN1 ...), SP_ROAD_AT, SP_PLAZA_AT);
  to change a ladder, regenerate and replace that block.
- Clips: `puzclip.sh`, `lvclip.sh`, `spaceclip.sh` record JPEG bursts and `encode.sh` makes a webm (Playwright's ffmpeg).
- THE CIRCUS (levels 151-200, being built): its source is `circus-src/` (cq1-kit ... cq9-pieces), put into main's
  play.js at `4af344d` by `circus-src/build-circus.sh` (the chunks go in before the valley's trees, then
  `integrate-circus.py` adds the marble skin, the `#circus-tintoy-N` link and setWorld's far plane). Stills:
  `tinshots.sh outdir N tag` (phone, desktop, two wide views); `pieceshots.sh outdir tag 22:cross 27:wind ...` (each
  piece from just behind it); `cqhide.sh tintoy 1 12 63` (renders the course red and the world black from every camera,
  the climbing ones over puzzle squares too, and counts the course the world hides; `SAB=true` plants a post to prove it
  sees; `__cqHide(3, false, true)` shows the worst view).
