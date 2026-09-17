/* Zamborin — the button system.

   Every game draws its own buttons into its own canvas, so nothing forced them
   to agree, and they drifted: control pills ranged 36 to 40 tall with 13 to 15
   point labels, primary buttons ran 44, 46, 50, 52 and 56, and Mobile's NEXT
   was sized as a fraction of the 393x852 phone mockup, which in the 760x600
   desktop frame came out 21px tall with a 9px label.

   These are the numbers. A game may position its buttons wherever its layout
   needs, but it takes the size, radius, type and colours from here.

   Three classes only:

     PILL   the desktop control row — Undo, Restart, Hint, Rules, sound.
            Quiet: a translucent fill and a hairline border.
     ROUND  the phone's control row (owner, 2026-09-16): one drawn icon in a
            perfect circle PILL.iconW across, which is also the touch target,
            in the pill's own fill and border. The icons are drawIcon()'s, so
            every game shows the same ones.
     CTA    the one primary action on a menu or a win screen — START, NEXT,
            PLAY AGAIN. Loud: solid fill, and never more than one on screen.

   Sizes are in logical canvas pixels and are NOT scaled per game. A button is
   chrome, not content: it should be the same physical size in Bloom as in
   Socket, which is the whole point of writing them down.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ZAM_UI = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const PILL = {
  h: 40,                 // height
  font: 15,              // label size, 700 weight
  padX: 36,              // total horizontal padding around the label
  gap: 10,               // between pills in a row
  iconW: 44,             // square-ish pills that hold an icon, e.g. the speaker
  fill: 'rgba(255,255,255,0.07)',
  /* 0.40, raised from 0.24 on 2026-08-27. At 0.24 the border measured 2.16 to
     2.19:1 against the Portal wash and 2.12 behind Tailwind's control band,
     against a 3:1 bar for graphical objects, in all seventeen games at once
     because this is one shared value. The binding ground is Tailwind's band
     over a pale sky, where the true minimum is 0.37 at 3.02:1 — too close to
     the bar to hold if the art ever gets lighter. 0.40 gives 3.27 there and
     3.27 to 4.09 everywhere else, and still reads as a hairline. */
  border: 'rgba(255,255,255,0.40)',
  borderW: 1.5,
  text: 'rgba(255,255,255,0.92)',
  textDim: 'rgba(255,255,255,0.30)',   // AA-safe against the card only as a
                                        // DISABLED affordance, never for copy
};

const CTA = {
  h: 50,
  font: 17,
  minW: 210,
  padX: 90,
  text: '#FFFFFF',
};

const radius = (h) => h / 2;

// Width a pill needs for its label. Pass the 2d context so the measurement uses
// the font actually in effect.
function pillWidth(ctx, label, cls) {
  const c = cls || PILL;
  ctx.font = '700 ' + c.font + 'px Inter, sans-serif';
  return Math.round(ctx.measureText(label).width + c.padX);
}
function ctaWidth(ctx, label) {
  ctx.font = '700 ' + CTA.font + 'px Inter, sans-serif';
  return Math.round(Math.max(CTA.minW, ctx.measureText(label).width + CTA.padX));
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else {
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
}

// Draw a control pill centred on (cx, cy). Returns its hit box.
function drawPill(ctx, label, cx, cy, opts) {
  const o = opts || {};
  const w = o.w || pillWidth(ctx, label);
  const h = PILL.h, r = radius(h);
  const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
  ctx.fillStyle = PILL.fill; roundRectPath(ctx, x, y, w, h, r); ctx.fill();
  ctx.lineWidth = PILL.borderW; ctx.strokeStyle = PILL.border;
  roundRectPath(ctx, x, y, w, h, r); ctx.stroke();
  if (label) {
    ctx.fillStyle = o.dim ? PILL.textDim : PILL.text;
    ctx.font = '700 ' + PILL.font + 'px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }
  return { x, y, w, h };
}

// Draw the one primary action. `fill` is the game's accent.
// `width` is optional: two CTAs that must match (a video offer and the way
// on without it) share one, instead of each sizing to its own label.
function drawCTA(ctx, label, cx, cy, fill, width) {
  const w = width || ctaWidth(ctx, label), h = CTA.h, r = radius(h);
  const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
  ctx.fillStyle = fill; roundRectPath(ctx, x, y, w, h, r); ctx.fill();
  ctx.fillStyle = CTA.text;
  ctx.font = '700 ' + CTA.font + 'px Inter, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  return { x, y, w, h };
}

// Draw a round control button centred on (cx, cy). Returns its hit box.
function drawRound(ctx, cx, cy) {
  const d = PILL.iconW;
  ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
  ctx.fillStyle = PILL.fill; ctx.fill();
  ctx.lineWidth = PILL.borderW; ctx.strokeStyle = PILL.border;
  ctx.beginPath(); ctx.arc(cx, cy, d / 2 - PILL.borderW / 2, 0, Math.PI * 2); ctx.stroke();
  return { x: Math.round(cx - d / 2), y: Math.round(cy - d / 2), w: d, h: d };
}

/* The control icons, drawn. No emoji, anywhere, ever. Keys: map, undo,
   restart, hint, skip, rules, sound. `opts.dim` greys a control that has
   nothing to do; `opts.on` is the sound switch's state. The sound icon also
   stands bare, with no circle, at a phone's bottom right. */
function drawIcon(ctx, key, cx, cy, opts) {
  const o = opts || {};
  ctx.save();
  if (key === 'sound') {
    ctx.strokeStyle = PILL.text; ctx.fillStyle = PILL.text;
    ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - 3); ctx.lineTo(cx - 3, cy - 3); ctx.lineTo(cx + 1, cy - 7);
    ctx.lineTo(cx + 1, cy + 7); ctx.lineTo(cx - 3, cy + 3); ctx.lineTo(cx - 7, cy + 3);
    ctx.closePath(); ctx.fill();
    if (o.on !== false) {
      ctx.beginPath(); ctx.arc(cx + 2, cy, 5.5, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 2, cy, 9, -0.85, 0.85); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx + 5, cy - 4); ctx.lineTo(cx + 12, cy + 4);
      ctx.moveTo(cx + 12, cy - 4); ctx.lineTo(cx + 5, cy + 4);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  const ink = o.dim ? PILL.textDim : PILL.text;
  ctx.strokeStyle = ink; ctx.fillStyle = ink;
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const head = (x, y, dx, dy, s) => {           // a filled arrowhead pointing along (dx, dy)
    const nx = -dy, ny = dx;
    ctx.beginPath();
    ctx.moveTo(x + dx * s * 0.75, y + dy * s * 0.75);
    ctx.lineTo(x - dx * s * 0.35 + nx * s * 0.6, y - dy * s * 0.35 + ny * s * 0.6);
    ctx.lineTo(x - dx * s * 0.35 - nx * s * 0.6, y - dy * s * 0.35 - ny * s * 0.6);
    ctx.closePath(); ctx.fill();
  };
  if (key === 'map') {
    // The levels: four squares. A game may draw its own from its board.
    const s = 6.5, g = 3;
    for (const [ix, iy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      roundRectPath(ctx, cx - s - g / 2 + ix * (s + g), cy - s - g / 2 + iy * (s + g), s, s, 1.5);
      ctx.fill();
    }
  } else if (key === 'undo') {
    // An arc turning back over the top, arrow at its left end.
    const r = 7, ox = cx + 1, oy = cy + 2, a0 = Math.PI * 0.25, a1 = Math.PI * 1.1;
    ctx.beginPath(); ctx.arc(ox, oy, r, a0, a1, true); ctx.stroke();
    head(ox + r * Math.cos(a1), oy + r * Math.sin(a1), Math.sin(a1), -Math.cos(a1), 5);
  } else if (key === 'restart') {
    // Nearly a full turn, clockwise, arrow at the top.
    const r = 7.5, a0 = -Math.PI * 0.35, a1 = Math.PI * 1.42;
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1, false); ctx.stroke();
    head(cx + r * Math.cos(a1), cy + r * Math.sin(a1), -Math.sin(a1), Math.cos(a1), 5);
  } else if (key === 'hint') {
    // A bulb.
    ctx.beginPath(); ctx.arc(cx, cy - 2.5, 6, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 3.2, cy + 5); ctx.lineTo(cx + 3.2, cy + 5);
    ctx.moveTo(cx - 2, cy + 8.2); ctx.lineTo(cx + 2, cy + 8.2);
    ctx.stroke();
  } else if (key === 'skip') {
    // Next: a play triangle against a bar.
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 6.5); ctx.lineTo(cx + 3.5, cy); ctx.lineTo(cx - 6, cy + 6.5);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(cx + 4.5, cy - 6.5, 2.6, 13);
  } else if (key === 'rules') {
    ctx.font = '700 19px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', cx, cy + 1);
  }
  ctx.restore();
}

/* The rewarded mark: a VIDEO glyph in a chip, never the letters AD.
   CrazyGames' rewarded-ad rule asks for "a video icon indicating advertisement
   requirement". It goes inside a pill beside the label, or on the edge of a
   round button at w 20, so the button keeps its size. */
function drawVideoMark(ctx, cx, cy, w, dim) {
  const h = 16, r = 4.5;
  roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, r);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();    // Tint 12
  const s = 5.4;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.40, cy - s * 0.60);
  ctx.lineTo(cx + s * 0.74, cy);
  ctx.lineTo(cx - s * 0.40, cy + s * 0.60);
  ctx.closePath();
  ctx.fillStyle = dim ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.72)';   // Tint 30 / Ink 72
  ctx.fill();
}

return { PILL, CTA, radius, pillWidth, ctaWidth, drawPill, drawCTA, roundRectPath,
         drawRound, drawIcon, drawVideoMark };
}));
