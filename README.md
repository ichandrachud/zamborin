# Zamborin

A small studio building daily browser puzzle games. Free. No login.
Same puzzle for everyone today.

## Games

- **[Tessera](./tessera/)** — Drop letter tiles, form English words across or down.
- **[Untangle](./untangle/)** — Drag dots so no two edges cross.

## Project layout

```
.
├── index.html         ← lobby (lists the games)
├── shared/
│   ├── tokens.css     ← Dark Portal palette + base typography
│   └── chrome.css     ← header, footer, splash, focus-button, layout
├── tessera/           ← word game
└── untangle/          ← graph game
```

The `shared/` folder holds everything that is identical across games —
palette, headers, splash mechanics, focus mode, mobile auto-fit. Each
game's `play.css` carries only its own overrides (mostly the splash
image URLs). Each game's `play.js` is independent and game-specific.

## Run locally

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deploy

Static site, no build step. Drop on Vercel / Netlify / Cloudflare Pages.
