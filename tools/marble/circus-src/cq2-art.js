
// ---- THE PERFORMERS, printed like lithographed tin: sixteen in a 4 x 4 atlas of 512 cells ----
//   0 ringmaster  1 clown with balloons  2 aerialist  3 juggler  4 strongman  5 clown cartwheeling  6 elephant on a drum
//   7 unicyclist  8 carousel horse  9 lion on a pedestal  10 fire-breather  11 stilt-walker  12 seal with a ball
//   13 bear on a ball  14 monkey with cymbals  15 tiger on a pedestal
// Every shape is printed the way a tin toy is (owner, 2026-09-29: the tin toy look "falls way short of the richness of
// characters"): a flat colour, a pattern, a flat darker tone down its far side eased in with halftone dots, a narrow
// shine, and a dark key line round it.
const CQ_ROWS = 4, INK = '#2A1638';
const cqFigMemo = {};
function cqFigures(look) {
  if (cqFigMemo[look]) return cqFigMemo[look];
  const t = canvasTex(2048, 2048, (G) => {
    const cells = [cqRingmaster, cqClown, cqAerialist, cqJuggler, cqStrongman, cqTumbler, cqElephant, cqUnicyclist,
                   cqHorse, cqLion, cqFireBreather, cqStilts, cqSeal, cqBear, cqMonkey, cqTiger];
    cells.forEach((f, i) => { G.save(); G.translate((i % 4) * 512, Math.floor(i / 4) * 512); G.beginPath(); G.rect(0, 0, 512, 512); G.clip(); f(G); G.restore(); });
  });
  return (cqFigMemo[look] = t);
}
const TAU = Math.PI * 2, SKIN = '#F6CFA8';
const tlPoly = (g, ...p) => () => { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); };
const tlEll = (g, x, y, rx, ry, a = 0) => () => { g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, TAU); };
const tlRR = (g, x, y, w, h, r) => () => { g.beginPath(); g.roundRect(x, y, w, h, r); };
const tlPath = (g, d) => () => { g.beginPath(); d(); g.closePath(); };
function tlHalf(g, x0, y0, x1, y1, col, step = 8) {         // halftone dots, growing towards x1
  g.fillStyle = col;
  for (let j = 0, y = y0; y < y1; y += step, j++) for (let x = x0 + (j % 2) * step / 2; x < x1; x += step) {
    const r = step * 0.56 * (x - x0) / (x1 - x0); if (r > 0.5) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  }
}
// Print a shape: its colour; inside it a pattern, the far side's second tone and the shine; then the key line.
function tl(g, path, fill, o = {}) {
  path(); g.fillStyle = fill; g.fill();
  const b = o.box;
  if (o.pat || b) {
    g.save(); path(); g.clip();
    if (o.pat) o.pat();
    if (b && o.shade !== false) {
      const w = b[2] - b[0], h = b[3] - b[1];
      tlHalf(g, b[0] + w * 0.44, b[1] - 4, b[0] + w * 0.64, b[3] + 4, 'rgba(42,22,56,0.3)', Math.max(6, Math.min(10, w / 12)));
      g.fillStyle = 'rgba(42,22,56,0.27)'; g.fillRect(b[0] + w * 0.64, b[1] - 20, w, h + 40);
      g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(b[0] + w * 0.13, b[1] - 20, Math.max(3, w * 0.07), h + 40);
    }
    g.restore();
  }
  if (o.line !== false) { path(); g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = o.lw || 5; g.strokeStyle = INK; g.stroke(); }
}
// An arm or a leg: a round-ended stroke inside its key line, with a shine down it.
function tlLimb(g, pts, w, col, shine = true) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.strokeStyle = INK; g.lineWidth = w + Math.min(10, 3 + w * 0.3); g.stroke(); g.strokeStyle = col; g.lineWidth = w; g.stroke();
  if (shine && w > 12) { g.save(); g.translate(-w * 0.2, -w * 0.1); g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = w * 0.2; g.stroke(); g.restore(); }
}
const tlDots = (g, b, col, r, s) => () => { g.fillStyle = col; for (let j = 0, y = b[1]; y < b[3] + s; y += s, j++) for (let x = b[0] + (j % 2) * s / 2; x < b[2] + s; x += s) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); } };
const tlStripes = (g, b, cols, w, across = false) => () => { for (let i = 0, v = across ? b[1] : b[0]; v < (across ? b[3] : b[2]); v += w, i++) { g.fillStyle = cols[i % cols.length]; if (across) g.fillRect(b[0], v, b[2] - b[0], w); else g.fillRect(v, b[1], w, b[3] - b[1]); } };
const tlDiamonds = (g, b, col, s) => () => { g.fillStyle = col; for (let j = 0, y = b[1]; y < b[3] + s; y += s / 2, j++) for (let x = b[0] + (j % 2) * s / 2; x < b[2] + s; x += s) { g.beginPath(); g.moveTo(x, y - s / 2); g.lineTo(x + s / 4, y); g.lineTo(x, y + s / 2); g.lineTo(x - s / 4, y); g.closePath(); g.fill(); } };
const tlChecks = (g, b, col, s) => () => { g.fillStyle = col; for (let j = 0, y = b[1]; y < b[3]; y += s, j++) for (let x = b[0] + (j % 2) * s; x < b[2]; x += s * 2) g.fillRect(x, y, s, s); };
const tlStarPat = (g, b, col, r, s) => () => { g.fillStyle = col; for (let j = 0, y = b[1]; y < b[3] + s; y += s, j++) for (let x = b[0] + (j % 2) * s / 2; x < b[2] + s; x += s) { cqStar(g, x, y, r, r * 0.45); g.fill(); } };
const tlSpots = (g, b, s) => () => { const r = seeded(Math.round(b[0] * 7 + b[1])); for (let y = b[1]; y < b[3]; y += s) for (let x = b[0]; x < b[2]; x += s) { const px = x + r() * s * 0.6, py = y + r() * s * 0.6; g.fillStyle = '#5A3010'; g.beginPath(); g.ellipse(px, py, s * 0.28, s * 0.22, r() * 3, 0, TAU); g.fill(); g.fillStyle = '#C8782A'; g.beginPath(); g.ellipse(px, py, s * 0.13, s * 0.1, 0, 0, TAU); g.fill(); } };
// A face: cheeks, eyes with a glint, brows, a nose (a red ball on a clown), a smile.
function tlFace(g, x, y, r, o = {}) {
  tl(g, tlEll(g, x, y, r, r * 1.04), o.skin || SKIN, { box: [x - r, y - r, x + r, y + r] });
  g.fillStyle = 'rgba(232,80,100,0.42)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(x + s * r * 0.54, y + r * 0.3, r * 0.2, r * 0.13, 0, 0, TAU); g.fill(); }
  for (const s of [-1, 1]) {
    const ex = x + s * r * 0.34, ey = y - r * 0.08;
    if (o.marks) { g.fillStyle = o.marks; g.beginPath(); g.moveTo(ex, ey - r * 0.46); g.lineTo(ex + r * 0.1, ey); g.lineTo(ex, ey + r * 0.4); g.lineTo(ex - r * 0.1, ey); g.closePath(); g.fill(); }
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.ellipse(ex, ey, r * 0.16, r * 0.2, 0, 0, TAU); g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
    g.fillStyle = INK; g.beginPath(); g.arc(ex + r * 0.03, ey + r * 0.03, r * 0.095, 0, TAU); g.fill();
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(ex + r * 0.07, ey - r * 0.03, r * 0.035, 0, TAU); g.fill();
    g.strokeStyle = INK; g.lineWidth = 3.5; g.beginPath(); g.arc(ex, ey - r * 0.12, r * 0.24, Math.PI * 1.25, Math.PI * 1.75); g.stroke();
  }
  if (o.nose) { tl(g, tlEll(g, x, y + r * 0.2, r * 0.21, r * 0.19), o.nose, { lw: 3 }); g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.arc(x - r * 0.07, y + r * 0.13, r * 0.055, 0, TAU); g.fill(); }
  else { g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.arc(x, y + r * 0.1, r * 0.08, 0.3, Math.PI - 0.3); g.stroke(); }
  g.fillStyle = o.mouth || '#C8202C'; g.beginPath(); g.arc(x, y + r * 0.4, r * (o.grin || 0.26), 0.12, Math.PI - 0.12); g.closePath(); g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
}
function tlGlove(g, x, y, r = 17) { tl(g, tlEll(g, x, y, r, r * 0.9), '#FFFFFF', { lw: 4 }); g.strokeStyle = INK; g.lineWidth = 2.5; for (const d of [-0.35, 0, 0.35]) { g.beginPath(); g.moveTo(x + d * r, y - r * 0.2); g.lineTo(x + d * r, y + r * 0.6); g.stroke(); } }
function tlStar(g, x, y, r, col = '#F2C230') { cqStar(g, x, y, r, r * 0.45); g.fillStyle = col; g.fill(); g.lineWidth = Math.max(2, r * 0.18); g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke(); }
// A printed drum for a performer to stand on: a top, a band of stars or diamonds, gold rims.
function tlDrum(g, x, y, rx, h, col, band = '#F2C230', kind = 'stars') {
  const box = [x - rx, y, x + rx, y + h];
  tl(g, tlPath(g, () => { g.moveTo(x - rx, y); g.lineTo(x - rx, y + h); g.ellipse(x, y + h, rx, rx * 0.22, 0, Math.PI, 0, true); g.lineTo(x + rx, y); }), col, { box,
    pat: () => { if (kind === 'stars') for (let k = 0; k < 5; k++) { cqStar(g, x - rx * 0.8 + k * rx * 0.4, y + h * 0.5, h * 0.2, h * 0.09); g.fillStyle = band; g.fill(); }
                 else { g.strokeStyle = band; g.lineWidth = 5; for (let k = -6; k < 7; k++) { g.beginPath(); g.moveTo(x + k * rx * 0.3, y); g.lineTo(x + k * rx * 0.3 + h, y + h); g.moveTo(x + k * rx * 0.3 + h, y); g.lineTo(x + k * rx * 0.3, y + h); g.stroke(); } } } });
  tl(g, tlRR(g, x - rx - 4, y - 4, rx * 2 + 8, 14, 6), band, { lw: 4 }); tl(g, tlRR(g, x - rx - 4, y + h - 8, rx * 2 + 8, 14, 6), band, { lw: 4 });
  tl(g, tlEll(g, x, y - 2, rx, rx * 0.2), '#FFF1D2', { lw: 4 });
}
function tlBall(g, x, y, r, cols) {                          // a beach ball: gores of colour, a white pole, a shine
  tl(g, tlEll(g, x, y, r, r), cols[0], { box: [x - r, y - r, x + r, y + r], pat: () => { cols.forEach((c, k) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, r * Math.abs(Math.cos(k * 0.6)) + 1, r + 2, 0, 0, TAU); g.fill(); }); } });
  tl(g, tlEll(g, x - r * 0.1, y - r * 0.55, r * 0.22, r * 0.14), '#FFFFFF', { lw: 3 });
}

function cqRingmaster(g) {
  tl(g, tlPoly(g, 210, 290, 302, 290, 326, 424, 288, 404, 256, 330, 224, 404, 186, 424), '#9A1424', { box: [186, 290, 326, 424] });   // the tails, behind
  tl(g, tlPoly(g, 214, 292, 298, 292, 302, 420, 266, 420, 256, 346, 246, 420, 210, 420), '#FFF6E8', { box: [210, 292, 302, 420] });   // white breeches
  for (const x of [229, 284]) {
    tl(g, tlRR(g, x - 22, 412, 44, 78, 8), '#231A2E', { box: [x - 22, 412, x + 22, 490] });
    tl(g, tlRR(g, x - 26, 404, 52, 20, 6), '#F2C230', { lw: 4, pat: tlDots(g, [x - 26, 404, x + 26, 424], '#C8902A', 3, 9) });
  }
  tl(g, tlEll(g, 222, 494, 32, 11), '#231A2E'); tl(g, tlEll(g, 290, 494, 32, 11), '#231A2E');
  tlLimb(g, [212, 204, 182, 262, 172, 318], 30, '#A8182A');                                              // the arm down, with the whip
  g.strokeStyle = INK; g.lineWidth = 4; g.beginPath(); g.moveTo(170, 330); g.bezierCurveTo(110, 420, 70, 360, 58, 470); g.stroke();
  tl(g, tlRR(g, 164, 314, 12, 36, 4), '#5A3A22', { lw: 3 }); tlGlove(g, 172, 322);
  tl(g, tlPoly(g, 202, 176, 310, 176, 320, 300, 192, 300), '#C8242C', { box: [192, 176, 320, 300] });    // the coat
  tl(g, tlPoly(g, 236, 178, 276, 178, 256, 222), '#FFF6E8', { lw: 4 });                                   // shirt front, bow tie
  tl(g, tlPoly(g, 240, 182, 256, 190, 272, 182, 272, 198, 256, 190, 240, 198), '#231A2E', { lw: 3 });
  for (const y of [228, 248, 268, 288]) {                                                                // gold frogging across the chest
    g.strokeStyle = INK; g.lineWidth = 9; g.beginPath(); g.moveTo(214, y); g.lineTo(298, y); g.stroke(); g.strokeStyle = '#F2C230'; g.lineWidth = 4.5; g.stroke();
    for (const s of [-1, 1]) tl(g, tlEll(g, 256 + s * 44, y, 7, 7), '#F2C230', { lw: 3 });
  }
  tl(g, tlEll(g, 230, 206, 9, 9), '#2A6AE8', { lw: 3 }); tlStar(g, 230, 206, 6, '#F2C230');                // a medal
  for (const s of [-1, 1]) {                                                                             // epaulettes, with fringe
    const x = 256 + s * 58;
    g.strokeStyle = INK; g.lineWidth = 6; for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(x + k * 6, 184); g.lineTo(x + k * 6 + s * 3, 208); g.stroke(); }
    g.strokeStyle = '#F2C230'; g.lineWidth = 3; for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(x + k * 6, 184); g.lineTo(x + k * 6 + s * 3, 208); g.stroke(); }
    tl(g, tlEll(g, x, 182, 26, 12), '#F2C230', { lw: 4 });
  }
  tlLimb(g, [306, 196, 356, 152, 406, 122], 30, '#C8242C');                                             // the arm raised, presenting
  tl(g, tlRR(g, 396, 108, 22, 26, 6), '#F2C230', { lw: 3 }); tlGlove(g, 420, 112, 18);
  tl(g, tlPath(g, () => { g.moveTo(222, 150); g.quadraticCurveTo(210, 190, 234, 176); g.lineTo(234, 140); }), '#4A2414', { lw: 3 });   // sideburns
  tl(g, tlPath(g, () => { g.moveTo(290, 150); g.quadraticCurveTo(302, 190, 278, 176); g.lineTo(278, 140); }), '#4A2414', { lw: 3 });
  tlFace(g, 256, 146, 38, { grin: 0.2 });
  tl(g, tlPath(g, () => { g.moveTo(256, 160); g.bezierCurveTo(236, 150, 214, 158, 204, 146); g.bezierCurveTo(206, 168, 236, 176, 256, 166); g.bezierCurveTo(276, 176, 306, 168, 308, 146); g.bezierCurveTo(298, 158, 276, 150, 256, 160); }), '#4A2414', { lw: 3 });   // the moustache
  tl(g, tlPoly(g, 218, 106, 294, 106, 300, 22, 212, 22), '#231A2E', { box: [212, 22, 300, 106] });       // the top hat
  tl(g, tlRR(g, 216, 82, 80, 18, 2), '#C8242C', { lw: 3 }); tlStar(g, 256, 91, 9);
  tl(g, tlEll(g, 256, 108, 60, 10), '#231A2E', { lw: 4 });
}
function cqClown(g, noBalloons) {
  if (!noBalloons) {
    const bs = [[380, 58, '#E8303A'], [432, 96, '#2A6AE8'], [396, 128, '#F2C230']];
    g.strokeStyle = INK; g.lineWidth = 2; for (const [bx, by] of bs) { g.beginPath(); g.moveTo(bx, by + 34); g.quadraticCurveTo(bx - 20, by + 120, 318, 300); g.stroke(); }   // held behind his back
    for (const [bx, by, c] of bs) { tl(g, tlEll(g, bx, by, 28, 34), c, { box: [bx - 28, by - 34, bx + 28, by + 34] }); tl(g, tlPoly(g, bx - 6, by + 40, bx + 6, by + 40, bx, by + 32), c, { lw: 3 }); }
  }
  if (!noBalloons) { tlLimb(g, [212, 222, 160, 284, 214, 336], 34, '#2A6AE8'); tlLimb(g, [300, 222, 352, 284, 298, 336], 34, '#F2C230'); }   // arms folded behind him: only the elbows show
  tl(g, tlEll(g, 204, 490, 52, 19), '#E8303A', { box: [152, 471, 256, 509] }); tl(g, tlEll(g, 308, 490, 52, 19), '#E8303A', { box: [256, 471, 360, 509] });
  const b = [148, 204, 364, 474];
  tl(g, tlPath(g, () => { g.moveTo(206, 204); g.lineTo(306, 204); g.quadraticCurveTo(368, 330, 338, 470); g.lineTo(268, 470); g.lineTo(256, 392); g.lineTo(244, 470); g.lineTo(174, 470); g.quadraticCurveTo(144, 330, 206, 204); }), '#F2C230',
     { box: b, pat: tlDiamonds(g, b, '#2A6AE8', 52) });                                                 // the baggy suit, harlequin
  for (const x of [209, 303]) for (let k = 0; k < 5; k++) tl(g, tlEll(g, x - 28 + k * 14, 470, 10, 8), '#FFFFFF', { lw: 3 });   // ruffles at the ankles
  for (const y of [256, 306, 356]) { tl(g, tlEll(g, 256, y, 14, 14), '#E8303A', { lw: 4 }); g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(252, y - 4, 4, 0, TAU); g.fill(); }
  if (noBalloons) {                                                                                     // cartwheeling: arms out
    tlLimb(g, [208, 226, 162, 262, 128, 300], 34, '#2A6AE8'); tlLimb(g, [304, 226, 340, 216, 360, 206], 34, '#F2C230');
    tlGlove(g, 124, 304, 19); tlGlove(g, 364, 204, 19);
  }
  for (let k = 0; k < 14; k++) { const a = Math.PI + (k + 0.5) * Math.PI / 14; tl(g, tlEll(g, 256 + Math.cos(a) * 64, 208 + Math.sin(a) * 18 + 10, 13, 10, a), '#FFFFFF', { lw: 3 }); }   // the ruff
  tl(g, tlEll(g, 256, 212, 68, 20), '#FFFFFF', { lw: 4, pat: () => { g.strokeStyle = '#C8C0D8'; g.lineWidth = 2; for (let k = 0; k < 18; k++) { g.beginPath(); g.moveTo(256, 212); g.lineTo(256 + Math.cos(k * TAU / 18) * 80, 212 + Math.sin(k * TAU / 18) * 30); g.stroke(); } } });
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) tl(g, tlEll(g, 256 + s * (44 + k * 6), 136 + k * 18, 20, 18), '#FF7A20', { lw: 3 });   // curly hair
  tlFace(g, 256, 158, 44, { skin: '#FFF8F0', nose: '#E8303A', grin: 0.36, marks: '#2A6AE8' });
  tl(g, tlPoly(g, 220, 124, 292, 124, 262, 30), '#2AA89A', { box: [220, 30, 292, 124], pat: tlDots(g, [220, 30, 292, 124], '#FFF1D2', 5, 18) });   // the cone hat
  tl(g, tlEll(g, 262, 28, 14, 14), '#E8303A', { lw: 4 });
  tl(g, tlEll(g, 256, 124, 42, 8), '#FFF1D2', { lw: 3 });
}
function cqAerialist(g) {
  g.strokeStyle = INK; g.lineWidth = 5; for (const x of [200, 312]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 60); g.stroke(); } g.strokeStyle = '#FFF1D2'; g.lineWidth = 2; for (const x of [200, 312]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 60); g.stroke(); }
  tl(g, tlRR(g, 188, 56, 136, 12, 6), '#F2C230', { lw: 4 });                                              // the bar
  tlLimb(g, [238, 204, 226, 72], 20, SKIN); tlLimb(g, [274, 204, 286, 72], 20, SKIN);
  tlLimb(g, [244, 318, 236, 472], 24, '#F4B0C0'); tlLimb(g, [268, 318, 280, 472], 24, '#F4B0C0');        // tights
  tl(g, tlEll(g, 234, 482, 13, 20), '#F4B0C0', { lw: 3 }); tl(g, tlEll(g, 282, 482, 13, 20), '#F4B0C0', { lw: 3 });
  const b = [220, 190, 292, 322];
  tl(g, tlPoly(g, 222, 192, 290, 192, 284, 300, 256, 322, 228, 300), '#2A4AE8', { box: b, pat: tlStarPat(g, b, '#FFF1D2', 6, 20) });   // the leotard
  for (let k = 0; k < 9; k++) tl(g, tlEll(g, 202 + k * 13.5, 306 + Math.abs(k - 4) * 1.5, 12, 9), k % 2 ? '#F48AB0' : '#FFB8D0', { lw: 3 });   // the tutu
  tl(g, tlEll(g, 256, 300, 60, 12), '#F48AB0', { lw: 3, pat: tlDots(g, [196, 288, 316, 312], '#FFFFFF', 2.5, 10) });
  tlFace(g, 256, 160, 30, { grin: 0.22 });
  tl(g, tlPath(g, () => { g.arc(256, 152, 32, Math.PI * 1.05, Math.PI * 1.95); g.lineTo(256, 140); }), '#6A3418', { lw: 3 });   // hair
  tl(g, tlEll(g, 256, 118, 16, 14), '#6A3418', { lw: 3 });
  tl(g, tlPath(g, () => { g.moveTo(262, 112); g.bezierCurveTo(300, 60, 330, 70, 336, 40); g.bezierCurveTo(320, 84, 296, 96, 270, 120); }), '#F48AB0', { lw: 3 });   // a plume
}
function cqJuggler(g) {
  const clubs = [[150, 130, -0.8], [196, 60, -0.3], [256, 34, 0.2], [316, 60, 0.7], [362, 130, 1.2]];
  for (const [x, y, a] of clubs) {                                                                        // five clubs in the air
    g.save(); g.translate(x, y); g.rotate(a);
    tl(g, tlPath(g, () => { g.moveTo(-4, 30); g.lineTo(-5, 4); g.quadraticCurveTo(-16, -18, 0, -32); g.quadraticCurveTo(16, -18, 5, 4); g.lineTo(4, 30); }), '#FFF6E8', { lw: 3, pat: tlStripes(g, [-20, -34, 20, 34], ['#FFF6E8', '#E8303A'], 8, true) });
    tl(g, tlEll(g, 0, 32, 7, 5), '#E8303A', { lw: 3 });
    g.restore();
  }
  const tb = [208, 318, 304, 470];
  tl(g, tlPoly(g, 212, 318, 300, 318, 304, 468, 264, 468, 256, 370, 248, 468, 208, 468), '#2A2A6A', { box: tb, pat: tlStripes(g, tb, ['#2A2A6A', '#FFF1D2'], 10) });   // striped trousers
  tl(g, tlEll(g, 226, 484, 30, 12), '#231A2E'); tl(g, tlEll(g, 288, 484, 30, 12), '#231A2E');
  tlLimb(g, [220, 214, 184, 170, 166, 150], 30, '#FFF6E8'); tlLimb(g, [292, 214, 328, 170, 346, 150], 30, '#FFF6E8');   // puffed sleeves, arms up
  tlGlove(g, 164, 146); tlGlove(g, 348, 146);
  tl(g, tlRR(g, 214, 190, 84, 134, 12), '#FFF6E8', { box: [214, 190, 298, 324] });                          // the shirt, the waistcoat over it
  tl(g, tlPoly(g, 214, 196, 244, 196, 256, 250, 268, 196, 298, 196, 298, 322, 214, 322), '#2AA86A', { box: [214, 196, 298, 322], pat: tlDots(g, [214, 196, 298, 322], '#1A7A4A', 3, 11) });
  for (const y of [264, 286, 308]) tl(g, tlEll(g, 256, y, 6, 6), '#F2C230', { lw: 3 });
  tl(g, tlPoly(g, 238, 196, 256, 206, 274, 196, 274, 214, 256, 206, 238, 214), '#E8303A', { lw: 3 });
  tlFace(g, 256, 152, 34);
  tl(g, tlEll(g, 256, 124, 44, 9), '#231A2E', { lw: 4 }); tl(g, tlPath(g, () => { g.moveTo(228, 124); g.quadraticCurveTo(226, 82, 256, 80); g.quadraticCurveTo(286, 82, 284, 124); }), '#231A2E', { box: [226, 80, 286, 124] });
  tl(g, tlRR(g, 229, 110, 54, 9, 2), '#E8303A', { lw: 3 });
}
function cqStrongman(g) {
  tlLimb(g, [234, 350, 222, 468], 40, '#231A2E'); tlLimb(g, [280, 350, 292, 468], 40, '#231A2E');
  tl(g, tlRR(g, 196, 460, 50, 36, 8), '#8A4A1A', { lw: 4 }); tl(g, tlRR(g, 268, 460, 50, 36, 8), '#8A4A1A', { lw: 4 });
  tlLimb(g, [200, 206, 156, 150, 138, 98], 42, SKIN); tlLimb(g, [312, 206, 356, 150, 374, 98], 42, SKIN);   // arms up to the bar
  for (const x of [148, 364]) tl(g, tlRR(g, x - 26, 112, 52, 18, 6), '#E8303A', { lw: 4 });                // wristbands
  const cb = [178, 176, 334, 356];
  tl(g, tlEll(g, 256, 262, 78, 92), SKIN, { box: cb });                                                    // the barrel chest
  tl(g, tlPath(g, () => { g.moveTo(190, 236); g.quadraticCurveTo(256, 222, 322, 236); g.lineTo(326, 336); g.quadraticCurveTo(256, 356, 186, 336); }), '#E8A840', { box: cb, pat: tlSpots(g, cb, 26) });   // a leopard singlet
  for (const s of [-1, 1]) tlLimb(g, [256 + s * 44, 238, 256 + s * 50, 196], 12, '#E8A840', false);
  tl(g, tlRR(g, 186, 326, 140, 26, 6), '#6A3A1A', { lw: 4 }); tl(g, tlRR(g, 238, 322, 36, 34, 6), '#F2C230', { lw: 4 });   // belt and buckle
  tl(g, tlRR(g, 60, 80, 392, 16, 8), '#8A8A98', { lw: 4 });                                                 // the barbell
  for (const x of [72, 440]) { tl(g, tlEll(g, x, 88, 52, 52), '#231A2E', { box: [x - 52, 36, x + 52, 140] }); tl(g, tlEll(g, x, 88, 14, 14), '#8A8A98', { lw: 3 }); }
  pbWord(g, '1000', 72, 118, 22, '#FFF1D2', null); pbWord(g, '1000', 440, 118, 22, '#FFF1D2', null);
  tlFace(g, 256, 158, 36, { grin: 0.2 });
  tl(g, tlPath(g, () => { g.moveTo(256, 170); g.bezierCurveTo(230, 160, 206, 170, 196, 150); g.bezierCurveTo(196, 184, 232, 186, 256, 178); g.bezierCurveTo(280, 186, 316, 184, 316, 150); g.bezierCurveTo(306, 170, 282, 160, 256, 170); }), '#231A2E', { lw: 3 });   // a handlebar moustache
  g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.arc(262, 118, 10, Math.PI * 0.2, Math.PI * 1.6); g.stroke();   // the one curl
}
function cqTumbler(g) { g.save(); g.translate(256, 256); g.rotate(Math.PI * 0.85); g.translate(-256, -256); cqClown(g, true); g.restore(); }
function cqElephant(g) {
  tlDrum(g, 256, 392, 118, 96, '#E8303A', '#F2C230', 'lattice');
  const body = '#8AA4CC', b = [130, 200, 400, 390];
  tl(g, tlPath(g, () => { g.moveTo(140, 280); g.quadraticCurveTo(150, 190, 280, 200); g.quadraticCurveTo(360, 206, 362, 290); g.lineTo(356, 330); g.lineTo(150, 330); }), body, { box: b });
  g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.moveTo(144, 270); g.quadraticCurveTo(110, 290, 118, 330); g.stroke();   // the tail
  for (const [x, up] of [[168, 0], [214, 0], [300, 1], [340, 0]]) {                                           // legs, one raised
    tl(g, tlRR(g, x - 22, up ? 290 : 300, 44, up ? 60 : 94, 10), body, { box: [x - 22, 300, x + 22, 394] });
    for (const d of [-10, 2, 14]) tl(g, tlEll(g, x + d - 2, up ? 346 : 390, 5, 4), '#FFF1D2', { lw: 2 });
  }
  const sb = [186, 196, 318, 300];
  tl(g, tlPoly(g, 196, 206, 306, 200, 318, 296, 186, 300), '#E8303A', { box: sb, pat: tlDiamonds(g, sb, '#C8202C', 40) });   // the saddle blanket, fringed
  for (let x = 190; x < 318; x += 10) tlLimb(g, [x, 298, x, 314], 3, '#F2C230', false);
  tlStar(g, 252, 248, 22);
  tl(g, tlEll(g, 360, 232, 64, 58), body, { box: [296, 174, 424, 290] });                                    // the head
  tl(g, tlPath(g, () => { g.moveTo(398, 262); g.quadraticCurveTo(440, 300, 432, 360); g.quadraticCurveTo(470, 350, 468, 300); g.quadraticCurveTo(470, 270, 456, 260); g.quadraticCurveTo(448, 300, 420, 240); }), body, { lw: 5 });   // the trunk, curled up
  g.strokeStyle = 'rgba(42,22,56,0.45)'; g.lineWidth = 2.5; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(426 + k * 6, 278 + k * 12); g.lineTo(446 + k * 4, 272 + k * 12); g.stroke(); }
  tl(g, tlPath(g, () => { g.moveTo(402, 270); g.quadraticCurveTo(420, 286, 414, 302); g.quadraticCurveTo(396, 290, 394, 272); }), '#FFF6E8', { lw: 3 });   // the tusk
  tl(g, tlEll(g, 318, 236, 38, 54, 0.2), '#7A94BC', { box: [280, 182, 356, 290] }); tl(g, tlEll(g, 320, 240, 24, 38, 0.2), '#F4A8B8', { lw: 3 });   // the ear
  g.fillStyle = '#FFFFFF'; g.beginPath(); g.ellipse(378, 222, 10, 12, 0, 0, TAU); g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
  g.fillStyle = INK; g.beginPath(); g.arc(380, 224, 5, 0, TAU); g.fill();
  tl(g, tlPath(g, () => { g.moveTo(320, 184); g.quadraticCurveTo(360, 162, 406, 186); g.lineTo(400, 200); g.quadraticCurveTo(360, 180, 326, 198); }), '#F2C230', { lw: 4, pat: tlDots(g, [320, 160, 410, 200], '#C8902A', 3, 10) });   // headdress
  tl(g, tlEll(g, 364, 186, 10, 12), '#E8303A', { lw: 3 });
  tl(g, tlPath(g, () => { g.moveTo(364, 176); g.bezierCurveTo(350, 120, 380, 100, 372, 70); g.bezierCurveTo(398, 110, 380, 140, 372, 178); }), '#2AA89A', { lw: 3 });
}
function cqUnicyclist(g) {
  tl(g, tlEll(g, 256, 446, 56, 56), '#E8303A', { lw: 5 }); tl(g, tlEll(g, 256, 446, 46, 46), '#FFF1D2', { lw: 4 });   // the wheel
  g.strokeStyle = INK; g.lineWidth = 3; for (let k = 0; k < 12; k++) { const a = k * TAU / 12; g.beginPath(); g.moveTo(256, 446); g.lineTo(256 + Math.cos(a) * 46, 446 + Math.sin(a) * 46); g.stroke(); }
  tl(g, tlEll(g, 256, 446, 9, 9), '#F2C230', { lw: 3 });
  tlLimb(g, [256, 446, 256, 340], 8, '#8A8A98', false); tl(g, tlRR(g, 230, 328, 52, 14, 6), '#231A2E', { lw: 3 });
  tlLimb(g, [244, 334, 222, 390, 238, 430], 22, '#E8303A'); tlLimb(g, [268, 334, 282, 400, 272, 460], 22, '#2A4AE8');   // legs pedalling, one each colour
  const b = [222, 196, 290, 340];
  tl(g, tlPoly(g, 222, 198, 290, 198, 284, 338, 228, 338), '#F2C230', { box: b, pat: tlChecks(g, b, '#E8303A', 17) });
  for (const s of [-1, 1]) {                                                                            // arms out, a fan in each hand
    tlLimb(g, [256 + s * 32, 214, 256 + s * 86, 232, 256 + s * 128, 222], 18, '#F2C230');
    const fx = 256 + s * 150;
    tl(g, tlPath(g, () => { g.moveTo(fx - s * 20, 226); g.arc(fx, 214, 36, s > 0 ? Math.PI * 1.1 : Math.PI * 1.9, s > 0 ? Math.PI * 0.1 : Math.PI * -0.9 + TAU, s < 0); }), '#2AA89A', { lw: 3, pat: () => { g.strokeStyle = '#FFF1D2'; g.lineWidth = 3; for (let k = 0; k < 7; k++) { const a = Math.PI + k * Math.PI / 6; g.beginPath(); g.moveTo(fx - s * 20, 226); g.lineTo(fx + Math.cos(a) * 60 * s, 214 + Math.sin(a) * 60); g.stroke(); } } });
  }
  tlFace(g, 256, 164, 30);
  tl(g, tlRR(g, 234, 118, 44, 24, 5), '#E8303A', { lw: 4 }); tlLimb(g, [256, 118, 276, 96], 3, '#F2C230', false); tl(g, tlEll(g, 278, 94, 6, 6), '#F2C230', { lw: 2 });   // a pillbox hat, its tassel
}
function cqHorse(g) {
  tl(g, tlRR(g, 248, 0, 16, 512, 6), '#F2C230', { lw: 4, pat: () => { g.strokeStyle = '#C8902A'; g.lineWidth = 5; for (let y = -20; y < 530; y += 22) { g.beginPath(); g.moveTo(248, y); g.lineTo(264, y + 14); g.stroke(); } } });   // the brass pole
  const w = '#FFF6EC', b = [120, 220, 390, 340];
  tlLimb(g, [170, 300, 128, 372, 150, 416], 24, w); tlLimb(g, [196, 304, 186, 380, 204, 424], 24, w);       // hind legs
  tlLimb(g, [318, 296, 372, 342, 358, 382], 24, w); tlLimb(g, [300, 302, 332, 360, 318, 400], 24, w);       // forelegs, raised
  for (const [x, y] of [[152, 424], [206, 430], [356, 390], [316, 408]]) tl(g, tlEll(g, x, y, 12, 9), '#F2C230', { lw: 3 });
  tl(g, tlEll(g, 250, 282, 124, 58, -0.08), w, { box: b, pat: tlDots(g, b, '#D8D0E4', 7, 26) });          // the body, dappled
  tl(g, tlPath(g, () => { g.moveTo(318, 262); g.quadraticCurveTo(344, 170, 380, 140); g.lineTo(418, 176); g.quadraticCurveTo(380, 210, 370, 290); }), w, { box: [318, 140, 418, 290] });   // neck
  tl(g, tlEll(g, 410, 150, 54, 28, -0.55), w, { box: [356, 110, 464, 190] });                               // head
  g.fillStyle = INK; g.beginPath(); g.arc(408, 138, 6, 0, TAU); g.fill(); g.beginPath(); g.arc(446, 178, 4, 0, TAU); g.fill();
  g.save(); g.translate(410, 150); g.rotate(-0.55); g.strokeStyle = INK; g.lineWidth = 8; g.beginPath(); g.moveTo(-16, -26); g.lineTo(-16, 26); g.moveTo(-16, 8); g.lineTo(46, 8); g.stroke();   // the bridle
  g.strokeStyle = '#F2C230'; g.lineWidth = 4; g.stroke(); g.restore();
  tl(g, tlPoly(g, 384, 112, 398, 82, 404, 116), w, { lw: 3 });                                             // ear
  for (let k = 0; k < 7; k++) tl(g, tlEll(g, 352 - k * 10, 150 + k * 18, 22, 12, -0.9), k % 2 ? '#2AA89A' : '#F2C230', { lw: 3 });   // the mane, in curls
  const sb = [196, 222, 310, 300];
  tl(g, tlPoly(g, 204, 228, 300, 222, 310, 296, 196, 300), '#E8303A', { box: sb, pat: tlStarPat(g, sb, '#F2C230', 7, 26) });   // the saddle, jewelled
  tl(g, tlRR(g, 192, 292, 122, 14, 5), '#F2C230', { lw: 3 }); tl(g, tlEll(g, 254, 300, 10, 10), '#2A6AE8', { lw: 3 });
  for (let k = 0; k < 5; k++) tl(g, tlEll(g, 124 - k * 4, 272 + k * 22, 18, 12, 1.2), k % 2 ? '#2AA89A' : '#F2C230', { lw: 3 });   // the tail
}
function cqLion(g) {
  tlDrum(g, 256, 404, 96, 84, '#2A4AE8', '#F2C230', 'stars');
  const tan = '#E8A040', b = [184, 240, 330, 404];
  g.strokeStyle = INK; g.lineWidth = 14; g.beginPath(); g.moveTo(308, 380); g.bezierCurveTo(380, 390, 420, 340, 400, 292); g.stroke(); g.strokeStyle = tan; g.lineWidth = 8; g.stroke();   // the tail
  tl(g, tlEll(g, 400, 288, 13, 16), '#8A3A10', { lw: 3 });
  tl(g, tlEll(g, 256, 330, 72, 80), tan, { box: b });                                                        // the body, sitting up
  tl(g, tlEll(g, 256, 346, 38, 50), '#F8D8A0', { line: false });
  tlLimb(g, [224, 360, 214, 400], 30, tan); tlLimb(g, [290, 340, 332, 296, 350, 262], 28, tan);            // a paw raised
  for (const [x, y] of [[214, 404], [352, 256]]) tl(g, tlEll(g, x, y, 17, 14), '#F8D8A0', { lw: 3 });
  for (let ring = 0; ring < 2; ring++) for (let k = 0; k < 18; k++) {                                      // the mane, two rings of flames
    const a = (k + ring * 0.5) * TAU / 18, R = 70 - ring * 16;
    tl(g, tlPath(g, () => { g.moveTo(256 + Math.cos(a - 0.2) * 40, 206 + Math.sin(a - 0.2) * 40); g.lineTo(256 + Math.cos(a) * R, 206 + Math.sin(a) * R); g.lineTo(256 + Math.cos(a + 0.2) * 40, 206 + Math.sin(a + 0.2) * 40); }), ring ? '#E8702A' : '#A8401A', { lw: 3 });
  }
  tlFace(g, 256, 206, 44, { skin: tan, mouth: '#8A2A1A', grin: 0.18 });
  tl(g, tlEll(g, 242, 226, 16, 12), '#FFF1D2', { lw: 2.5 }); tl(g, tlEll(g, 270, 226, 16, 12), '#FFF1D2', { lw: 2.5 });
  tl(g, tlPoly(g, 244, 212, 268, 212, 256, 226), '#5A2A1A', { lw: 3 });
  for (const s of [-1, 1]) tl(g, tlEll(g, 256 + s * 34, 170, 12, 12), tan, { lw: 3 });
}
function cqFireBreather(g) {
  for (const [rr, c] of [[72, '#E8401A'], [52, '#F2901A'], [32, '#F8D040'], [14, '#FFFBE8']]) {            // the plume of fire
    tl(g, tlPath(g, () => { g.moveTo(286, 160); g.bezierCurveTo(340, 130 - rr * 0.6, 400, 40 - rr * 0.3, 470, 60 - rr * 0.4); g.bezierCurveTo(490, 110, 420, 130 + rr * 0.4, 286, 168); }), c, { lw: rr > 60 ? 4 : 0, line: rr > 60 });
    tl(g, tlEll(g, 440, 80, rr * 0.85, rr * 0.6, -0.4), c, { line: rr > 60, lw: 4 });
  }
  const pb = [200, 320, 312, 470];
  tl(g, tlPath(g, () => { g.moveTo(212, 320); g.lineTo(300, 320); g.quadraticCurveTo(326, 400, 304, 466); g.lineTo(266, 466); g.lineTo(256, 380); g.lineTo(246, 466); g.lineTo(208, 466); g.quadraticCurveTo(186, 400, 212, 320); }), '#6A2A9A', { box: pb, pat: tlDots(g, pb, '#9A5AD0', 4, 16) });   // loose trousers
  tl(g, tlEll(g, 226, 480, 28, 12), '#F2C230'); tl(g, tlEll(g, 288, 480, 28, 12), '#F2C230');
  tlLimb(g, [214, 206, 186, 260, 190, 310], 26, '#D8905A'); tlLimb(g, [298, 206, 332, 170, 342, 132], 26, '#D8905A');   // bare arms, the torch held up
  tl(g, tlRR(g, 338, 70, 10, 76, 4), '#6A3A1A', { lw: 3 }); tl(g, tlEll(g, 343, 66, 12, 18), '#F8D040', { lw: 3 }); tl(g, tlEll(g, 343, 70, 6, 10), '#FFFBE8', { line: false });
  const vb = [212, 192, 300, 326];
  tl(g, tlRR(g, 214, 192, 84, 134, 14), '#D8905A', { box: vb });
  tl(g, tlPoly(g, 214, 196, 240, 196, 250, 324, 214, 324), '#F2C230', { box: vb, pat: tlDiamonds(g, vb, '#C8202C', 24) }); tl(g, tlPoly(g, 298, 196, 272, 196, 262, 324, 298, 324), '#F2C230', { box: vb, pat: tlDiamonds(g, vb, '#C8202C', 24) });   // an open waistcoat
  tl(g, tlRR(g, 206, 306, 100, 26, 8), '#C8202C', { lw: 4 }); tl(g, tlPoly(g, 290, 318, 318, 360, 296, 364), '#C8202C', { lw: 3 });   // the sash
  tlFace(g, 256, 158, 32, { skin: '#D8905A', grin: 0.14 });
  tl(g, tlEll(g, 256, 124, 42, 26), '#2AA89A', { box: [214, 98, 298, 150], pat: () => { g.strokeStyle = '#1A7A6A'; g.lineWidth = 4; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(256, 150, 20 + k * 8, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); } } });   // the turban
  tl(g, tlEll(g, 256, 118, 10, 12), '#E8303A', { lw: 3 }); tl(g, tlPath(g, () => { g.moveTo(256, 108); g.bezierCurveTo(250, 70, 276, 60, 270, 36); g.bezierCurveTo(290, 70, 270, 90, 262, 110); }), '#FFF6E8', { lw: 3 });
}
function cqStilts(g) {
  for (const [x, c] of [[228, '#E8303A'], [284, '#C8202C']]) { const b = [x - 16, 196, x + 16, 490]; tl(g, tlRR(g, x - 16, 196, 32, 294, 10), c, { box: b, pat: tlStripes(g, b, [c, '#FFF6E8'], 26, true) }); }   // long striped legs
  tl(g, tlRR(g, 206, 486, 44, 16, 6), '#231A2E'); tl(g, tlRR(g, 262, 486, 44, 16, 6), '#231A2E');
  tl(g, tlPoly(g, 212, 92, 300, 92, 318, 214, 288, 204, 256, 150, 224, 204, 194, 214), '#2A4AE8', { box: [194, 92, 318, 214] });   // a tailcoat
  tl(g, tlPoly(g, 240, 94, 272, 94, 256, 140), '#FFF6E8', { lw: 3 });
  for (const y of [110, 130, 150]) for (const s of [-1, 1]) tl(g, tlEll(g, 256 + s * 22, y + 10, 5, 5), '#F2C230', { lw: 2.5 });
  tlLimb(g, [214, 104, 170, 70, 140, 76], 18, '#2A4AE8'); tlLimb(g, [298, 104, 342, 70, 372, 76], 18, '#2A4AE8');
  tlGlove(g, 134, 78, 13); tlGlove(g, 378, 78, 13);
  tlFace(g, 256, 62, 26);
  tl(g, tlPoly(g, 236, 40, 276, 40, 280, 4, 232, 4), '#E8303A', { box: [232, 4, 280, 40], pat: tlStripes(g, [232, 4, 280, 40], ['#E8303A', '#FFF6E8'], 10) });
  tl(g, tlEll(g, 256, 42, 36, 7), '#231A2E', { lw: 3 });
}
function cqSeal(g) {
  tlDrum(g, 256, 410, 84, 76, '#E8303A', '#F2C230', 'stars');
  const sl = '#4A6A8A', b = [170, 150, 340, 412];
  tl(g, tlPath(g, () => { g.moveTo(190, 410); g.bezierCurveTo(170, 330, 214, 250, 262, 200); g.bezierCurveTo(284, 176, 300, 150, 296, 128); g.bezierCurveTo(320, 132, 334, 160, 322, 196); g.bezierCurveTo(308, 250, 300, 330, 330, 410); }), sl, { box: b });   // the body, arching up
  tl(g, tlPath(g, () => { g.moveTo(220, 400); g.bezierCurveTo(210, 330, 240, 270, 272, 226); g.bezierCurveTo(284, 280, 280, 340, 300, 400); }), '#8AA8C0', { line: false });   // the paler belly
  tl(g, tlPath(g, () => { g.moveTo(236, 300); g.quadraticCurveTo(190, 320, 170, 360); g.quadraticCurveTo(210, 350, 250, 330); }), sl, { lw: 4 });   // a flipper
  tl(g, tlEll(g, 306, 126, 22, 20), sl, { lw: 4 }); tl(g, tlEll(g, 316, 108, 12, 9, -0.6), '#2A3A4A', { lw: 3 });   // the head, nose up
  g.fillStyle = INK; g.beginPath(); g.arc(300, 124, 5, 0, TAU); g.fill();
  tl(g, tlRR(g, 262, 190, 50, 14, 6), '#E8303A', { lw: 3 }); tl(g, tlPoly(g, 286, 196, 270, 186, 270, 208), '#E8303A', { lw: 3 }); tl(g, tlPoly(g, 290, 196, 306, 186, 306, 208), '#E8303A', { lw: 3 });   // a collar and bow
  tlBall(g, 330, 56, 46, ['#E8303A', '#F2C230', '#2A6AE8', '#FFF6E8', '#2AA86A']);
}
function cqBear(g) {
  const bb = [166, 352, 346, 506];
  tl(g, tlEll(g, 256, 430, 88, 76), '#2A4AE8', { box: bb, pat: () => { g.fillStyle = '#E8303A'; g.fillRect(166, 410, 180, 34); for (let k = 0; k < 5; k++) { cqStar(g, 188 + k * 34, 380 + (k % 2) * 90, 12, 5); g.fillStyle = '#FFF6E8'; g.fill(); } } });   // the big ball
  const br = '#9A5A2A', b = [182, 150, 330, 360];
  tlLimb(g, [228, 330, 222, 358], 34, br); tlLimb(g, [284, 330, 290, 358], 34, br);
  tl(g, tlEll(g, 256, 262, 72, 88), br, { box: b }); tl(g, tlEll(g, 256, 280, 42, 56), '#D8A070', { line: false });
  tlLimb(g, [196, 230, 150, 250, 118, 226], 30, br); tlLimb(g, [316, 230, 362, 250, 394, 226], 30, br);   // arms out for balance
  tl(g, tlRR(g, 216, 186, 80, 16, 6), '#F2C230', { lw: 3 }); tl(g, tlEll(g, 256, 208, 10, 10), '#F2C230', { lw: 3 });   // a collar with a bell
  for (const s of [-1, 1]) { tl(g, tlEll(g, 256 + s * 32, 104, 16, 16), br, { lw: 4 }); tl(g, tlEll(g, 256 + s * 32, 104, 8, 8), '#D8A070', { line: false }); }
  tlFace(g, 256, 142, 42, { skin: br, mouth: '#6A2A1A', grin: 0.16 });
  tl(g, tlEll(g, 256, 160, 20, 14), '#D8A070', { lw: 3 }); tl(g, tlEll(g, 256, 154, 8, 6), INK, { line: false });
  tl(g, tlPoly(g, 232, 104, 280, 104, 274, 74, 238, 74), '#C8202C', { box: [232, 74, 280, 104] });       // a fez and its tassel
  tlLimb(g, [256, 76, 286, 90, 290, 112], 3, '#231A2E', false); tl(g, tlEll(g, 290, 116, 6, 8), '#F2C230', { lw: 2 });
}
function cqMonkey(g) {
  tlDrum(g, 256, 420, 78, 70, '#2AA86A', '#F2C230', 'stars');
  const fur = '#7A4A2A';
  g.strokeStyle = INK; g.lineWidth = 16; g.beginPath(); g.moveTo(236, 400); g.bezierCurveTo(160, 420, 130, 330, 170, 300); g.bezierCurveTo(190, 290, 196, 320, 180, 326); g.stroke();   // the tail, curled
  g.strokeStyle = fur; g.lineWidth = 9; g.stroke();
  tlLimb(g, [236, 350, 226, 416], 24, fur); tlLimb(g, [276, 350, 286, 416], 24, fur);
  const b = [212, 226, 300, 358];
  tl(g, tlRR(g, 212, 226, 88, 132, 16), '#E8303A', { box: b });                                            // a little red jacket
  for (const y of [248, 276, 304, 332]) for (const s of [-1, 1]) tl(g, tlEll(g, 256 + s * 16, y, 5, 5), '#F2C230', { lw: 2.5 });
  tl(g, tlRR(g, 212, 226, 88, 14, 6), '#F2C230', { lw: 3 });
  for (const s of [-1, 1]) {                                                                             // cymbals, held apart
    tlLimb(g, [256 + s * 40, 244, 256 + s * 90, 228, 256 + s * 116, 196], 20, '#E8303A');
    tl(g, tlEll(g, 256 + s * 134, 180, 40, 14, s * 1.1), '#F2C230', { box: [256 + s * 134 - 40, 140, 256 + s * 134 + 40, 220] });
  }
  for (const s of [-1, 1]) { tl(g, tlEll(g, 256 + s * 44, 176, 16, 18), fur, { lw: 4 }); tl(g, tlEll(g, 256 + s * 44, 176, 8, 10), '#F4C8A0', { line: false }); }
  tlFace(g, 256, 178, 38, { skin: fur, mouth: '#8A2A1A', grin: 0.2 });
  tl(g, tlEll(g, 256, 190, 26, 20), '#F4C8A0', { line: false }); g.fillStyle = INK; for (const s of [-1, 1]) { g.beginPath(); g.arc(256 + s * 5, 184, 2.5, 0, TAU); g.fill(); }
  g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.arc(256, 192, 10, 0.3, Math.PI - 0.3); g.stroke();
  tl(g, tlPoly(g, 234, 144, 278, 144, 272, 112, 240, 112), '#C8202C', { box: [234, 112, 278, 144] });
  tlLimb(g, [256, 114, 284, 128, 288, 146], 3, '#231A2E', false); tl(g, tlEll(g, 288, 150, 5, 7), '#F2C230', { lw: 2 });
}
function cqTiger(g) {
  tlDrum(g, 256, 404, 96, 84, '#F2C230', '#E8303A', 'lattice');
  const or = '#F2902A', b = [184, 236, 330, 404];
  g.strokeStyle = INK; g.lineWidth = 14; g.beginPath(); g.moveTo(200, 380); g.bezierCurveTo(120, 390, 110, 320, 140, 290); g.stroke(); g.strokeStyle = or; g.lineWidth = 8; g.stroke();   // the tail
  g.strokeStyle = INK; g.lineWidth = 9; for (const t of [0.3, 0.55, 0.8]) { const x = 200 - 60 * t - 10 * t * t, y = 380 - 50 * t * t; g.beginPath(); g.moveTo(x - 4, y - 6); g.lineTo(x + 4, y + 6); g.stroke(); }
  tl(g, tlEll(g, 256, 326, 70, 80), or, { box: b, pat: () => { g.fillStyle = INK; for (let k = 0; k < 6; k++) { const y = 262 + k * 24; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(256 + s * 72, y); g.quadraticCurveTo(256 + s * 40, y + 6, 256 + s * 26, y + 16); g.quadraticCurveTo(256 + s * 44, y + 14, 256 + s * 72, y + 12); g.fill(); } } } });
  tl(g, tlEll(g, 256, 344, 36, 52), '#FFF6E8', { line: false });
  tlLimb(g, [226, 360, 218, 400], 30, or); tlLimb(g, [286, 360, 294, 400], 30, or);
  for (const x of [218, 294]) tl(g, tlEll(g, x, 404, 17, 13), '#FFF6E8', { lw: 3 });
  for (const s of [-1, 1]) { tl(g, tlPoly(g, 256 + s * 22, 180, 256 + s * 50, 150, 256 + s * 52, 196), or, { lw: 4 }); tl(g, tlPoly(g, 256 + s * 30, 182, 256 + s * 46, 164, 256 + s * 46, 190), '#FFF6E8', { line: false }); }
  tlFace(g, 256, 214, 48, { skin: or, mouth: '#8A2A1A', grin: 0.14 });
  g.fillStyle = INK; for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(256 + s * 46, 196 + k * 14); g.lineTo(256 + s * 26, 202 + k * 12); g.lineTo(256 + s * 46, 204 + k * 14); g.fill(); }
  g.beginPath(); g.moveTo(246, 170); g.lineTo(256, 196); g.lineTo(266, 170); g.fill();
  tl(g, tlEll(g, 244, 236, 16, 12), '#FFF6E8', { lw: 2.5 }); tl(g, tlEll(g, 268, 236, 16, 12), '#FFF6E8', { lw: 2.5 });
  tl(g, tlPoly(g, 246, 222, 266, 222, 256, 234), '#E86A7A', { lw: 3 });
}
function cqLimb(g, x0, y0, x1, y1, w, col) { g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
// ---- SIDESHOW BANNERS: four painted canvases along the tent's walls, 2 x 2 in a 1024 atlas ----
const cqPostMemo = {};
function cqPosters(look) {
  if (cqPostMemo[look]) return cqPostMemo[look];
  const C = CQ[look];
  const t = canvasTex(1024, 1024, (g) => {
    const acts = [['STRONGMAN', '#B01C24', (x, y) => { cqLimb(g, x - 120, y, x + 120, y, 14, '#2A2A30'); for (const s of [-1, 1]) { g.fillStyle = '#1A1A1E'; pbCircle(g, x + s * 130, y, 50); g.fill(); } }],
                  ['FIRE EATER', '#E86A20', (x, y) => { for (const [r, c] of [[80, '#FFB040'], [55, '#FFE080'], [30, '#FFFFFF']]) { g.fillStyle = c; g.beginPath(); g.moveTo(x - r * 0.7, y + 60); g.quadraticCurveTo(x - r, y - r * 0.4, x, y - r * 1.5); g.quadraticCurveTo(x + r, y - r * 0.4, x + r * 0.7, y + 60); g.fill(); } }],
                  ['HIGH WIRE', '#2A4AC8', (x, y) => { cqLimb(g, x - 190, y + 40, x + 190, y + 40, 5, '#F4F0E8'); g.fillStyle = '#F4F0E8'; g.fillRect(x - 14, y - 70, 28, 110); pbCircle(g, x, y - 90, 22); g.fill(); cqLimb(g, x - 120, y - 30, x + 120, y - 50, 6, '#D8A640'); }],
                  ['MAGIC', '#5A2A8A', (x, y) => { g.fillStyle = '#1A1210'; g.fillRect(x - 60, y - 70, 120, 110); g.fillRect(x - 90, y + 30, 180, 18); for (let k = 0; k < 6; k++) { g.fillStyle = C.trim; cqStar(g, x - 150 + k * 60, y - 110 + (k % 2) * 30, 14, 6); g.fill(); } }]];
    acts.forEach(([name, col, pic], i) => {
      const ox = (i % 2) * 512, oy = Math.floor(i / 2) * 512;
      g.fillStyle = '#F2E4C4'; g.fillRect(ox, oy, 512, 512);
      g.fillStyle = col; g.fillRect(ox + 18, oy + 18, 476, 476);
      g.fillStyle = pbRad(g, ox + 256, oy + 280, 30, 300, [[0, 'rgba(255,240,200,0.55)'], [1, 'rgba(0,0,0,0.25)']]); g.fillRect(ox + 18, oy + 18, 476, 476);
      g.strokeStyle = C.trim; g.lineWidth = 8; g.strokeRect(ox + 34, oy + 34, 444, 444);
      pic(ox + 256, oy + 300);
      pbWord(g, name, ox + 256, oy + 100, name.length > 8 ? 58 : 72, '#F2E4C4', '#1A0A06', 0.12);
    });
  });
  return (cqPostMemo[look] = t);
}
