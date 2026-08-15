/* Zamborin — the button system.

   Every game draws its own buttons into its own canvas, so nothing forced them
   to agree, and they drifted: control pills ranged 36 to 40 tall with 13 to 15
   point labels, primary buttons ran 44, 46, 50, 52 and 56, and Mobile's NEXT
   was sized as a fraction of the 393x852 phone mockup, which in the 760x600
   desktop frame came out 21px tall with a 9px label.

   These are the numbers. A game may position its buttons wherever its layout
   needs, but it takes the size, radius, type and colours from here.

   Two classes only:

     PILL   the in-game control row — Undo, Restart, Hint, Rules, sound.
            Quiet: a translucent fill and a hairline border.
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
  border: 'rgba(255,255,255,0.24)',
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
function drawCTA(ctx, label, cx, cy, fill) {
  const w = ctaWidth(ctx, label), h = CTA.h, r = radius(h);
  const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
  ctx.fillStyle = fill; roundRectPath(ctx, x, y, w, h, r); ctx.fill();
  ctx.fillStyle = CTA.text;
  ctx.font = '700 ' + CTA.font + 'px Inter, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  return { x, y, w, h };
}

return { PILL, CTA, radius, pillWidth, ctaWidth, drawPill, drawCTA, roundRectPath };
}));
