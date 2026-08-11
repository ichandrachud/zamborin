/* FOLD · FIGURES — the figure library.

   Each figure is drawn inside the unit square (0,0)-(1,1). The game slices the
   unit square into a gw x gh tile grid and scatters those tiles across the
   sheet; folding brings them back together. So a figure has to read when it is
   cut into 9 or 16 pieces — that means bold, connected, silhouette-first
   shapes, no thin detail and nothing that relies on a single hairline.

   Drawn as filled paths rather than strokes: a stroke's width does not survive
   being clipped at a tile boundary as cleanly as a fill does, and a filled
   silhouette is what makes the assembled picture read at a glance. */
(function () {
  'use strict';

  // Helpers that keep the path definitions readable.
  const P = (ctx, pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p.length === 2) ctx.lineTo(p[0], p[1]);
      else ctx.bezierCurveTo(p[0], p[1], p[2], p[3], p[4], p[5]);
    }
    ctx.closePath();
  };
  const ell = (ctx, cx, cy, rx, ry, rot) => {
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, rot || 0, 0, Math.PI * 2);
  };

  const FIGURES = [
    {
      name: 'Jug',
      draw(ctx, ink) {
        ctx.fillStyle = ink;
        // body
        P(ctx, [[0.30, 0.42],
          [0.16, 0.55, 0.16, 0.86, 0.34, 0.92],
          [0.46, 0.96, 0.62, 0.96, 0.72, 0.90],
          [0.88, 0.80, 0.86, 0.54, 0.72, 0.42]]);
        ctx.fill();
        // neck + lip
        P(ctx, [[0.36, 0.44], [0.36, 0.20],
          [0.36, 0.12, 0.44, 0.10, 0.52, 0.10],
          [0.62, 0.10, 0.70, 0.13, 0.68, 0.21],
          [0.66, 0.28, 0.66, 0.34, 0.66, 0.44]]);
        ctx.fill();
        // handle
        ctx.strokeStyle = ink; ctx.lineWidth = 0.075; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0.70, 0.30);
        ctx.bezierCurveTo(0.92, 0.30, 0.95, 0.62, 0.78, 0.66);
        ctx.stroke();
      },
    },
    {
      name: 'Elephant',
      draw(ctx, ink) {
        ctx.fillStyle = ink;
        // body
        ell(ctx, 0.56, 0.52, 0.30, 0.24); ctx.fill();
        // head
        ell(ctx, 0.26, 0.46, 0.18, 0.19); ctx.fill();
        // ear
        ell(ctx, 0.34, 0.40, 0.12, 0.15, -0.3); ctx.fill();
        // trunk — a thick tapering curve
        ctx.strokeStyle = ink; ctx.lineCap = 'round';
        ctx.lineWidth = 0.11;
        ctx.beginPath();
        ctx.moveTo(0.16, 0.52);
        ctx.bezierCurveTo(0.06, 0.66, 0.08, 0.80, 0.18, 0.84);
        ctx.stroke();
        // legs
        ctx.lineWidth = 0.13;
        for (const x of [0.40, 0.58, 0.74]) {
          ctx.beginPath(); ctx.moveTo(x, 0.68); ctx.lineTo(x, 0.88); ctx.stroke();
        }
        // tail
        ctx.lineWidth = 0.035;
        ctx.beginPath();
        ctx.moveTo(0.85, 0.44);
        ctx.bezierCurveTo(0.93, 0.50, 0.92, 0.62, 0.87, 0.66);
        ctx.stroke();
      },
    },
    {
      name: 'Cat',
      draw(ctx, ink) {
        ctx.fillStyle = ink;
        // head
        ell(ctx, 0.40, 0.30, 0.20, 0.18); ctx.fill();
        // ears
        P(ctx, [[0.24, 0.20], [0.26, 0.04], [0.40, 0.16]]); ctx.fill();
        P(ctx, [[0.56, 0.16], [0.56, 0.03], [0.42, 0.16]]); ctx.fill();
        // body
        P(ctx, [[0.24, 0.42],
          [0.18, 0.62, 0.20, 0.86, 0.30, 0.90],
          [0.46, 0.95, 0.66, 0.92, 0.68, 0.80],
          [0.70, 0.62, 0.62, 0.46, 0.56, 0.40]]);
        ctx.fill();
        // tail
        ctx.strokeStyle = ink; ctx.lineWidth = 0.075; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0.68, 0.84);
        ctx.bezierCurveTo(0.90, 0.86, 0.94, 0.58, 0.82, 0.48);
        ctx.stroke();
      },
    },
    {
      name: 'House',
      draw(ctx, ink) {
        ctx.fillStyle = ink;
        P(ctx, [[0.50, 0.08], [0.94, 0.44], [0.06, 0.44]]); ctx.fill();      // roof
        ctx.fillRect(0.16, 0.44, 0.68, 0.46);                                 // walls
        // chimney
        ctx.fillRect(0.70, 0.14, 0.10, 0.16);
        // door punched out
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillRect(0.42, 0.60, 0.18, 0.30);
        ctx.fillRect(0.22, 0.52, 0.14, 0.14);
        ctx.globalCompositeOperation = 'source-over';
      },
    },
    {
      name: 'Fish',
      draw(ctx, ink) {
        ctx.fillStyle = ink;
        P(ctx, [[0.14, 0.50],
          [0.28, 0.24, 0.62, 0.22, 0.78, 0.46],
          [0.80, 0.50, 0.80, 0.52, 0.78, 0.56],
          [0.62, 0.80, 0.28, 0.78, 0.14, 0.50]]);
        ctx.fill();
        P(ctx, [[0.78, 0.50], [0.96, 0.30], [0.96, 0.70]]); ctx.fill();      // tail
        P(ctx, [[0.40, 0.26], [0.52, 0.08], [0.58, 0.30]]); ctx.fill();      // top fin
        // eye
        ctx.globalCompositeOperation = 'destination-out';
        ell(ctx, 0.30, 0.44, 0.045, 0.045); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      },
    },
    {
      name: 'Tree',
      draw(ctx, ink) {
        ctx.fillStyle = ink;
        ell(ctx, 0.50, 0.34, 0.34, 0.28); ctx.fill();
        ell(ctx, 0.28, 0.46, 0.20, 0.17); ctx.fill();
        ell(ctx, 0.72, 0.46, 0.20, 0.17); ctx.fill();
        ctx.fillRect(0.43, 0.52, 0.14, 0.40);                                 // trunk
        ctx.strokeStyle = ink; ctx.lineWidth = 0.05; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0.50, 0.68); ctx.lineTo(0.32, 0.56);
        ctx.moveTo(0.50, 0.74); ctx.lineTo(0.70, 0.60);
        ctx.stroke();
      },
    },
  ];

  window.FOLD_FIGURES = FIGURES;
})();
