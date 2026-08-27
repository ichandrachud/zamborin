/* ============================================================
   RELIC · painted-pixel contrast harness
   ------------------------------------------------------------
   Run from the game page (the same way shared/qc/doc-audit.js is run):

     await fetch('/relic/tune-contrast.js?v=1').then(r=>r.text()).then(eval)
     RELIC_CONTRAST.run()

   WHY IT READS PIXELS RATHER THAN THE SOURCE HEXES
   The figure carries a light across the whole of it, so no band is painted
   the colour it was declared. Checking the constants would have passed a pair
   that measures 2.93:1 on screen against a 3:1 bar.

   WHY IT HAS SO MANY EXCLUSIONS
   Every one of them was a false failure first, and each looked convincing:

     1. Every pair read 1.00:1, identically. The preview pane was hidden, rAF
        never fired, and the read-back was of an unpainted canvas. Hence
        __relic.repaint() and the sampler control below.
     2. Every pair read 1.00:1 again. The sampler used per-axis scales while
        the canvas transform is a uniform min(); it was reading the wrong row.
     3. Pairs read 1.00:1 a third time. Samples were landing on the SEAM
        between two pieces, where both sides are painted the same crack.
     4. A 1.01:1 "failure" between ink and violet turned out to be the moth's
        thorax being compared with itself: the body is drawn over the pieces.
     5. A 2.71:1 violet was a pixel in the shadow falloff inside a hole.
     6. A second 2.71:1 violet was a pixel at the silhouette outline, where
        the band is blended with the page through the figure's edge hairline.

   None of those is a band against its neighbour, which is what the 3:1 bar is
   about. What is left after the exclusions is 334 of 1051 samples, and the
   dropped counts are reported so the filter cannot quietly delete the
   evidence and call the result clean.

   AND WHY IT HAS TWO CONTROLS
     - the SAMPLER control: the rules-card CTA must read exactly #C24A39. If
       the read-back is broken this fails and the run aborts rather than
       reporting a design problem that does not exist.
     - the PAIRING control: chalk against ink must come back above 8:1. A
       filter that had thrown away everything real would otherwise report
       "all clear" with nothing in it.
   ============================================================ */
(function () {
  'use strict';
  function run(opts) {
    const o = opts || {};
    const r = window.__relic;
    if (!r) return { error: 'no __relic handle on this page' };
    const M = r.model, lvl = r.level, L = r.L;
    const cv = document.getElementById('game'), g = cv.getContext('2d');
    const h = r.hudFit(), LW = h.LW, LH = h.LH;
    const S = Math.min(cv.width / LW, cv.height / LH);   // ONE uniform scale
    const px = (lx, ly) => { const d = g.getImageData(Math.round(lx * S), Math.round(ly * S), 1, 1).data;
                             return [d[0], d[1], d[2]]; };
    const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    const lin = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const LU = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const ratio = (a, b) => +((Math.max(LU(a), LU(b)) + 0.05) / (Math.min(LU(a), LU(b)) + 0.05)).toFixed(2);

    // ---- sampler control ----
    r.setCard('rules');
    const cta = r.L.hit.close;
    const ctaPx = hex(px(cta.x + cta.w / 2, cta.y + cta.h / 2));
    r.setCard(null); r.repaint();
    if (ctaPx !== '#C24A39') return { ABORT: 'sampler control failed', expected: '#C24A39', got: ctaPx };

    const F = lvl.field, ov = lvl.figure.overlay, perPx = 1 / L.fig.s;
    const nearPoly = (x, y, P, m) => {
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const ax = P[j][0], ay = P[j][1], dx = P[i][0] - ax, dy = P[i][1] - ay, l2 = dx * dx + dy * dy;
        if (!l2) continue;
        let t = ((x - ax) * dx + (y - ay) * dy) / l2; t = Math.max(0, Math.min(1, t));
        if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) < m) return true;
      }
      return false;
    };
    const holes = lvl.holes.filter(k => !lvl.pieces.some(p => p.at === k)).map(k => lvl.cells[k]);
    const E = 5 * perPx;
    const edgy = (x, y) => {
      for (let a = 0; a < 8; a++) {
        const t = a * Math.PI / 4;
        if (!M.inFigure(lvl.figure, x + Math.cos(t) * E, y + Math.sin(t) * E)) return true;
      }
      return false;
    };

    const raw = {}, dropped = { hole: 0, overlay: 0, bandFringe: 0, seamFringe: 0, silhouetteEdge: 0 };
    let kept = 0;
    for (const c of lvl.cells) {
      if (c.hole && !lvl.pieces.some(p => p.at === c.id)) continue;
      for (const pt of c.pts) {
        const X = pt[0], Y = pt[1], lx = L.fig.x + X * L.fig.s, ly = L.fig.y + Y * L.fig.s;
        if (lx < 2 || ly < 2 || lx > LW - 2 || ly > LH - 2) continue;
        if (holes.some(H => M.pointInPoly(X, Y, H.poly) || nearPoly(X, Y, H.poly, 12 * perPx))) { dropped.hole++; continue; }
        if (M.pointInPoly(X, Y, lvl.figure.body) || nearPoly(X, Y, lvl.figure.body, 8 * perPx) ||
            Math.hypot(X - lvl.W / 2, Y - ov.headY) < ov.headR + 8 * perPx) { dropped.overlay++; continue; }
        if (edgy(X, Y)) { dropped.silhouetteEdge++; continue; }
        const s = F.sAt(X, Y); let nb = false;
        for (const b of F.bounds) if (Math.abs(s - b) < 3.5 * perPx) { nb = true; break; }
        if (nb) { dropped.bandFringe++; continue; }
        if (nearPoly(X, Y, c.poly, 3.5 * perPx)) { dropped.seamFringe++; continue; }
        kept++;
        const bi = F.bandAt(X, Y);
        (raw[bi] = raw[bi] || []).push({ c: px(lx, ly), x: lx, y: ly });
      }
    }

    const idx = Object.keys(raw).map(Number).sort((a, b) => a - b).filter(b => raw[b].length >= 5);
    const pairs = [];
    for (let i = 1; i < idx.length; i++) {
      if (idx[i] !== idx[i - 1] + 1) continue;
      const A = raw[idx[i - 1]], B = raw[idx[i]];
      let w = 99, at = null;
      // Compare samples that are physically CLOSE. A lit corner of one band
      // against a shadowed corner of another is not a boundary anyone reads.
      for (const a of A) for (const b of B) {
        if (Math.hypot(a.x - b.x, a.y - b.y) > 40) continue;
        const q = ratio(a.c, b.c);
        if (q < w) { w = q; at = hex(a.c) + ' vs ' + hex(b.c); }
      }
      if (at) pairs.push({ pair: F.bands[idx[i - 1]].hue + '/' + F.bands[idx[i]].hue, ratio: w, colours: at });
    }
    pairs.sort((a, b) => a.ratio - b.ratio);

    // ---- pairing control ----
    const chalk = pairs.filter(p => /chalk/.test(p.pair)).map(p => p.ratio);
    const controlOk = chalk.some(v => v > 8);

    // ---- the hole, which is told apart by DEPTH and not by flat contrast ----
    let holeReport = null;
    if (holes.length) {
      const H = holes[0];
      const hc = px(L.fig.x + H.cx * L.fig.s, L.fig.y + H.cy * L.fig.s);
      const rimIn = px(L.fig.x + H.cx * L.fig.s, L.fig.y + (H.cy - lvl.cs * 0.40) * L.fig.s);
      holeReport = { holeCentre: hex(hc), innerShadowRim: hex(rimIn),
                     rimVsCentre: ratio(hc, rimIn),
                     note: 'a gap is read as depth: an inner shadow all round and a lit lip. Flat contrast against the ink band is about 1.4:1 by design.' };
    }

    return {
      samplerControl: 'PASS (#C24A39)',
      pairingControl: { chalkPairs: chalk, ok: controlOk },
      trustworthy: controlOk,
      frame: LW + 'x' + LH, mode: h.mode,
      samplesKept: kept, dropped,
      pairs, minRatio: pairs.length ? pairs[0].ratio : null,
      allAdjacentClear3: pairs.length > 0 && pairs.every(p => p.ratio >= 3),
      hole: holeReport,
    };
  }
  window.RELIC_CONTRAST = { run };
  return window.RELIC_CONTRAST;
})();
