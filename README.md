# TESSERA Words

A free, endless word puzzle for desktop. Drop falling letter tiles into a 12 × 8
grid and form English words (3-7 letters) horizontally or vertically — the
longer the word, the more the points. The game gets faster the longer you
survive; stack a column to the top and it's over.

- Pure static site — HTML, CSS, vanilla JS, no build step.
- 51 852-word TWL06 Scrabble dictionary bundled (`words.txt`).
- Sharp canvas rendering on every DPR.

## Run locally

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deploy

Static site — drop the repo on Vercel / Netlify / Cloudflare Pages and it
works. No environment variables, no build command, no output directory
override needed.
