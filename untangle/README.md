# Untangle — a Zamborin Game

A daily planar-graph puzzle. Drag the dots so no two edges cross. Every player
gets the same graph on the same day. Fewer moves than par = bragging rights.

- Pure static site — HTML, CSS, vanilla JS, no build step.
- Procedural daily graphs (TUTORIAL → EXPERT difficulty curve).
- Sharp canvas rendering on every DPR.
- Mode-aware: 760 × 570 desktop frame; mobile uses the full viewport.

## Run locally

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deploy

Static site — drop the repo on Vercel / Netlify / Cloudflare Pages and it
works. No environment variables, no build command, no output directory
override needed.

## Brand

Untangle is a Zamborin Game.
