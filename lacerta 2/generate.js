#!/usr/bin/env node
'use strict';

/**
 * Parametric alien building generator — flat orthographic SVG.
 *
 * One template, all variation from seeded params. See README.md.
 *
 * Two bugs are impossible by construction (and asserted at build time):
 *   1. Disproportionate cap  -> capWidth === bodyWidth, capHeight = capWidth*capRatio.
 *   2. Stray / floating pipes -> pipe x derived from body edges, y clamped to [bodyTop, groundY].
 */

const fs = require('fs');
const path = require('path');

/* ------------------------------------------------------------------ *
 *  Seeded RNG (mulberry32) — fully deterministic per seed.
 * ------------------------------------------------------------------ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(seed) {
  const r = mulberry32(seed);
  return {
    f: r,
    range: (lo, hi) => lo + (hi - lo) * r(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * r()),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    bool: (p = 0.5) => r() < p,
    weighted: (pairs) => { // [[value, weight], ...]
      const total = pairs.reduce((s, p) => s + p[1], 0);
      let x = r() * total;
      for (const [v, w] of pairs) { if ((x -= w) < 0) return v; }
      return pairs[pairs.length - 1][0];
    },
    sample: (arr, n) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a.slice(0, n);
    },
  };
}

/* ------------------------------------------------------------------ *
 *  Material ramps (weathered tin-toy palette).
 * ------------------------------------------------------------------ */
const RAMPS = {
  white:  { mid: '#d2d4d6', e1: '#90939a', e2: '#aeb0b4' },
  red:    { mid: '#d84e30', e1: '#8a2814', e2: '#b83824' },
  orange: { mid: '#d86a2c', e1: '#923f12', e2: '#b85220' },
  yellow: { mid: '#e6a828', e1: '#946410', e2: '#c08818' },
  slate:  { mid: '#9aa4b0', e1: '#414954', e2: '#828c98' },
  steel:  { mid: '#b4bac2', e1: '#5c626a', e2: '#787e88' },
  green:  { mid: '#8fae84', e1: '#4a6b46', e2: '#6f8f68' },
};
const DOOR_COLORS = {
  orange: '#c85f24', red: '#bb3a24', green: '#5f8a4a', yellow: '#cf9a1f',
};

/* small numeric formatter to keep SVG tidy */
const n = (v) => Math.round(v * 10) / 10;

/* ------------------------------------------------------------------ *
 *  randomParams(seed) — resolve all variation knobs.
 * ------------------------------------------------------------------ */
function randomParams(seed) {
  const R = makeRng(seed >>> 0);
  const bodyWidth = R.int(180, 280);
  const bodyHeightRatio = R.range(1.4, 1.8);
  const capStyle = R.pick(['shallowDome', 'tallDome', 'conical', 'flatCollar']);
  const backDrum = R.weighted([['none', 0.4], ['left', 0.3], ['right', 0.3]]);
  const backDrumTop = R.pick(['gun', 'smallDome', 'finial', 'vent']);
  const bayWindow = R.weighted([['none', 0.3], ['left', 0.35], ['right', 0.35]]);

  return {
    seed: seed >>> 0,
    bodyWidth,
    bodyHeightRatio,
    floors: R.pick([2, 2, 3]),
    windowsPerFloor: R.int(2, 4),
    bodyColor: R.weighted([['white', 0.45], ['red', 0.18], ['orange', 0.18], ['yellow', 0.12], ['slate', 0.07]]),
    baseColor: R.weighted([['white', 0.5], ['yellow', 0.2], ['orange', 0.15], ['green', 0.15]]),
    capStyle,
    capColor: R.pick(['red', 'slate', 'body']),
    backDrum,
    backDrumTop,
    bayWindow,
    bayBalcony: R.bool(0.55),
    roofClutter: R.sample(['ventBox', 'pipeStub', 'hatch', 'finialSpike', 'railing'], R.int(1, 3)),
    sideGun: backDrum !== 'none' && backDrumTop === 'gun',
    doorColor: R.pick(['orange', 'red', 'green', 'yellow']),
    pipesPerSide: R.int(1, 2),
    _R: R, // reused for incidental detail placement
  };
}

const CAP_RATIO = { shallowDome: 0.32, tallDome: 0.5, conical: 0.7, flatCollar: 0.18 };

/* ------------------------------------------------------------------ *
 *  SVG primitive helpers.
 * ------------------------------------------------------------------ */
const rect = (x, y, w, h, fill, extra = '') =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}" ${extra}/>`;
const rrect = (x, y, w, h, r, fill, extra = '') =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}" fill="${fill}" ${extra}/>`;
const circ = (cx, cy, r, fill, extra = '') =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}" ${extra}/>`;
const ell = (cx, cy, rx, ry, fill, extra = '') =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}" ${extra}/>`;
const line = (x1, y1, x2, y2, stroke, w = 1, extra = '') =>
  `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${stroke}" stroke-width="${w}" ${extra}/>`;
const pathEl = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;

/* rivet helper */
const rivet = (x, y) => `<circle cx="${n(x)}" cy="${n(y)}" r="1.4" fill="#3a3d42" opacity="0.55"/>`;

/* ------------------------------------------------------------------ *
 *  Per-file gradient defs.
 * ------------------------------------------------------------------ */
function buildDefs(p, idp) {
  const lin = (id, ramp) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="${ramp.e1}"/>` +
    `<stop offset="0.5" stop-color="${ramp.mid}"/>` +
    `<stop offset="1" stop-color="${ramp.e2}"/></linearGradient>`;

  const capRamp = p.capColor === 'body' ? RAMPS[p.bodyColor]
    : p.capColor === 'red' ? RAMPS.red : RAMPS.slate;

  const defs = [
    lin(`${idp}body`, RAMPS[p.bodyColor]),
    lin(`${idp}base`, RAMPS[p.baseColor]),
    lin(`${idp}steel`, RAMPS.steel),
    lin(`${idp}drum`, RAMPS.slate),
    // glass: diagonal
    `<linearGradient id="${idp}glass" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="#cad4d8"/><stop offset="1" stop-color="#586268"/></linearGradient>`,
    // dome: radial, light upper-left
    `<radialGradient id="${idp}dome" cx="0.34" cy="0.28" r="0.9">` +
      `<stop offset="0" stop-color="${capRamp.mid}"/>` +
      `<stop offset="1" stop-color="${capRamp.e1}"/></radialGradient>`,
  ];
  return `<defs>${defs.join('')}</defs>`;
}

/* ------------------------------------------------------------------ *
 *  Component: deep-set multi-pane window.
 * ------------------------------------------------------------------ */
function windowEl(x, y, w, h, idp, panesX = 2, panesY = 2) {
  const out = [];
  out.push(rrect(x - 3, y - 3, w + 6, h + 6, 2, `url(#${idp}steel)`, 'stroke="#4a4e55" stroke-width="0.8"'));
  out.push(rect(x - 1, y - 1, w + 2, h + 2, '#2c2f34')); // recess shadow
  out.push(rect(x, y, w, h, `url(#${idp}glass)`));
  // mullions
  for (let i = 1; i < panesX; i++) out.push(line(x + (w * i) / panesX, y, x + (w * i) / panesX, y + h, '#3a3e44', 1.2));
  for (let j = 1; j < panesY; j++) out.push(line(x, y + (h * j) / panesY, x + w, y + (h * j) / panesY, '#3a3e44', 1.2));
  // glint
  out.push(line(x + 2, y + 3, x + w * 0.4, y + h * 0.5, '#e8eef0', 1.1, 'opacity="0.5"'));
  // frame rivets
  out.push(rivet(x - 1.5, y - 1.5), rivet(x + w + 1.5, y - 1.5), rivet(x - 1.5, y + h + 1.5), rivet(x + w + 1.5, y + h + 1.5));
  return out.join('');
}

/* ------------------------------------------------------------------ *
 *  Component: door.
 * ------------------------------------------------------------------ */
function doorEl(cx, groundY, idp, color, R) {
  const dw = 46, dh = 78;
  const x = cx - dw / 2, y = groundY - dh;
  const out = [];
  out.push(rrect(x - 9, y - 9, dw + 18, dh + 9, 4, `url(#${idp}steel)`, 'stroke="#4a4e55" stroke-width="1"')); // surround
  out.push(rect(x - 3, y - 3, dw + 6, dh + 3, '#23262b')); // recess
  out.push(rrect(x, y, dw, dh, 3, DOOR_COLORS[color])); // door
  // panels
  out.push(rect(x + 6, y + 10, dw - 12, dh * 0.34, '#00000022', 'stroke="#00000044" stroke-width="0.8"'));
  out.push(rect(x + 6, y + 12 + dh * 0.38, dw - 12, dh * 0.34, '#00000022', 'stroke="#00000044" stroke-width="0.8"'));
  // viewport
  if (R.bool(0.6)) out.push(ell(cx, y + 14, 7, 5, `url(#${idp}glass)`, 'stroke="#4a4e55" stroke-width="1.4"'));
  // handle
  out.push(circ(x + dw - 9, y + dh / 2, 2.4, '#2c2f34'));
  // surround rivets
  for (let i = 0; i < 5; i++) {
    out.push(rivet(x - 6, y - 4 + (i * (dh + 4)) / 4));
    out.push(rivet(x + dw + 6, y - 4 + (i * (dh + 4)) / 4));
  }
  return out.join('');
}

/* ------------------------------------------------------------------ *
 *  Component: cap (trim ring + dome variants + highlight + clutter).
 * ------------------------------------------------------------------ */
function capEl(L, cx, bodyTop, bodyWidth, capHeight, capStyle, idp, R, roofClutter, capColor, bodyColor) {
  const out = [];
  const rx = bodyWidth / 2;
  const ringH = 12;
  // trim ring just inside body top — cap sits on it
  out.push(rrect(L.bodyLeft + 3, bodyTop - 2, bodyWidth - 6, ringH, 3, `url(#${idp}steel)`, 'stroke="#4a4e55" stroke-width="0.8"'));
  for (let i = 0; i <= 6; i++) out.push(rivet(L.bodyLeft + 8 + (i * (bodyWidth - 16)) / 6, bodyTop + 4));

  const capBottom = bodyTop - 1;
  const top = capBottom - capHeight;
  const fill = `url(#${idp}dome)`;

  if (capStyle === 'conical') {
    out.push(pathEl(
      `M ${n(cx - rx)} ${n(capBottom)} L ${n(cx)} ${n(top - 4)} L ${n(cx + rx)} ${n(capBottom)} Z`,
      fill, 'stroke="#3a3e44" stroke-width="0.8"'));
  } else if (capStyle === 'flatCollar') {
    out.push(rrect(cx - rx, top, bodyWidth, capHeight + 3, 6, fill, 'stroke="#3a3e44" stroke-width="0.8"'));
  } else {
    const pull = capStyle === 'tallDome' ? 1.35 : 1.18;
    out.push(pathEl(
      `M ${n(cx - rx)} ${n(capBottom)} C ${n(cx - rx)} ${n(capBottom - capHeight * pull)} ${n(cx + rx)} ${n(capBottom - capHeight * pull)} ${n(cx + rx)} ${n(capBottom)} Z`,
      fill, 'stroke="#3a3e44" stroke-width="0.8"'));
  }
  // soft highlight ellipse upper-left (domes only)
  if (capStyle !== 'flatCollar') {
    out.push(ell(cx - rx * 0.38, capBottom - capHeight * 0.55, rx * 0.26, capHeight * 0.3, '#ffffff', 'opacity="0.28"'));
  }

  // roof clutter
  const apexY = top - 2;
  for (const c of roofClutter) {
    if (c === 'ventBox') out.push(rrect(cx - 18, capBottom - capHeight * 0.45, 16, 12, 2, `url(#${idp}steel)`, 'stroke="#3a3e44" stroke-width="0.8"'));
    else if (c === 'pipeStub') { out.push(rect(cx + 8, apexY - 6, 6, 14, `url(#${idp}steel)`)); out.push(ell(cx + 11, apexY - 6, 4, 2.5, '#5c626a')); }
    else if (c === 'hatch') out.push(ell(cx + 14, capBottom - capHeight * 0.3, 9, 5, `url(#${idp}steel)`, 'stroke="#3a3e44" stroke-width="0.8"'));
    else if (c === 'finialSpike') { out.push(line(cx, apexY, cx, apexY - 26, '#5c626a', 2.5)); out.push(circ(cx, apexY - 26, 3, '#787e88')); }
    else if (c === 'railing') { out.push(line(cx - rx * 0.5, capBottom - 3, cx + rx * 0.5, capBottom - 3, '#5c626a', 1.6)); for (let i = -2; i <= 2; i++) out.push(line(cx + i * rx * 0.22, capBottom - 3, cx + i * rx * 0.22, capBottom - 11, '#5c626a', 1.4)); }
  }
  return out.join('');
}

/* ------------------------------------------------------------------ *
 *  Component: a rooftop/side gun assembly.
 * ------------------------------------------------------------------ */
function gunEl(cx, cy, dir, idp) {
  const out = [];
  out.push(ell(cx, cy, 11, 7, `url(#${idp}steel)`, 'stroke="#3a3e44" stroke-width="0.8"')); // mount
  out.push(rrect(cx - 7, cy - 12, 14, 12, 3, `url(#${idp}drum)`, 'stroke="#3a3e44" stroke-width="0.8"')); // turret
  const bx = cx, by = cy - 8;
  const len = 34 * dir;
  out.push(line(bx, by, bx + len, by - 12, '#4a4e55', 5)); // barrel
  out.push(line(bx, by, bx + len, by - 12, '#787e88', 2));
  out.push(circ(bx + len, by - 12, 2.5, '#3a3e44'));
  return out.join('');
}

/* ------------------------------------------------------------------ *
 *  Surface detail over a panel grid (seams, welds, rivets, patches, grime).
 * ------------------------------------------------------------------ */
function surfaceDetail(x, y, w, h, idp, R) {
  const out = [];
  const seamGap = w / 4;
  // vertical panel seams
  for (let sx = x + seamGap; sx < x + w - 1; sx += seamGap) {
    out.push(line(sx, y, sx, y + h, '#000000', 0.9, 'opacity="0.22"'));
  }
  // horizontal weld bands
  const welds = [];
  for (let wy = y + 80; wy < y + h - 10; wy += 80) {
    welds.push(wy);
    out.push(line(x, wy, x + w, wy, '#000000', 0.9, 'opacity="0.18"'));
  }
  // rivets at seam/band intersections
  for (let sx = x; sx <= x + w + 0.1; sx += seamGap) {
    out.push(rivet(sx, y + 6));
    for (const wy of welds) out.push(rivet(sx, wy));
    out.push(rivet(sx, y + h - 6));
  }
  // patch panels
  const patches = R.int(1, 2);
  for (let i = 0; i < patches; i++) {
    const pw = R.range(24, 40), ph = R.range(20, 34);
    const px = R.range(x + 6, x + w - pw - 6), py = R.range(y + 30, y + h - ph - 30);
    out.push(rect(px, py, pw, ph, '#00000010', 'stroke="#00000033" stroke-width="0.8"'));
  }
  // grime streaks dropping from bands
  const streaks = R.int(2, 4);
  for (let i = 0; i < streaks; i++) {
    const gx = R.range(x + 8, x + w - 8);
    const gy = welds.length ? R.pick(welds) : y + 20;
    out.push(rect(gx, gy, R.range(2, 4), R.range(30, 70), '#000000', 'opacity="0.10"'));
  }
  return out.join('');
}

/* ------------------------------------------------------------------ *
 *  buildBuilding(params) -> { svg, width, height, meta }
 * ------------------------------------------------------------------ */
function buildBuilding(p, idIndex = 0) {
  const idp = `b${idIndex}_`;
  const R = p._R || makeRng(p.seed);

  /* ---- core proportions ---- */
  const bodyWidth = p.bodyWidth;
  const bodyHeight = bodyWidth * p.bodyHeightRatio;
  const baseWidth = bodyWidth * 1.12;
  const baseHeight = bodyHeight * 0.34;

  // BUG #1 prevented by construction: cap is always sized from the body it sits on.
  const capRatio = CAP_RATIO[p.capStyle];
  const capWidth = bodyWidth;
  const capHeight = capWidth * capRatio;

  const margin = 34;
  const seat = 8;            // how far the body plunges into the base rim
  const footH = 20;

  /* ---- vertical layout ---- */
  // reserve room above the body top for cap + clutter and/or back drum peak
  const drumOverhang = p.backDrum !== 'none' ? bodyHeight * 0.18 : 0;
  const drumFeatureH = p.backDrum !== 'none' ? 52 : 0;
  const topReserve = Math.max(capHeight + 36, drumOverhang + drumFeatureH + 12) + 16;

  const bodyTop = margin + topReserve;
  const bodyBottom = bodyTop + bodyHeight;
  const baseTop = bodyBottom - seat;          // body bottom sits below rim top -> seats in
  const rimTop = baseTop;
  const baseBottom = rimTop + baseHeight;
  const groundY = baseBottom;
  const H = groundY + margin;

  /* ---- horizontal layout ---- */
  const pipeGap = 11, pipeW = 8;
  const bayBulge = 18, bayW = bodyWidth * 0.42;
  const drumOffset = bodyWidth * 0.30, drumW = bodyWidth * 0.50;

  // half-extents from the body centre
  const halfFoot = (baseWidth * 1.12) / 2;
  const halfPipe = bodyWidth / 2 + pipeGap + pipeW;
  const halfBay = p.bayWindow !== 'none' ? bodyWidth / 2 + bayBulge : 0;
  const halfDrum = p.backDrum !== 'none' ? drumOffset + drumW / 2 : 0;
  const halfMax = Math.max(halfFoot, halfPipe, halfBay, halfDrum);

  const W = halfMax * 2 + margin * 2;
  const cx = W / 2;

  // named geometry anchors (everything references these)
  const L = {
    cx,
    bodyLeft: cx - bodyWidth / 2,
    bodyRight: cx + bodyWidth / 2,
    bodyTop, bodyBottom,
    baseLeft: cx - baseWidth / 2,
    baseRight: cx + baseWidth / 2,
    rimTop, baseBottom, groundY,
  };

  const out = [];

  /* ---- defs ---- */
  out.push(buildDefs(p, idp));

  /* ============================ LAYER 1: back drum ============================ */
  if (p.backDrum !== 'none') {
    const dir = p.backDrum === 'left' ? -1 : 1;
    const dcx = cx + dir * drumOffset;
    const drumH = bodyHeight * 1.12;
    const dTop = bodyBottom - drumH;
    out.push(rect(dcx - drumW / 2, dTop, drumW, drumH, `url(#${idp}drum)`, 'stroke="#3a3e44" stroke-width="0.8"'));
    out.push(surfaceDetail(dcx - drumW / 2, dTop + 14, drumW, drumH - 20, idp, R));
    // drum cap
    out.push(pathEl(`M ${n(dcx - drumW / 2)} ${n(dTop)} C ${n(dcx - drumW / 2)} ${n(dTop - drumW * 0.4)} ${n(dcx + drumW / 2)} ${n(dTop - drumW * 0.4)} ${n(dcx + drumW / 2)} ${n(dTop)} Z`, `url(#${idp}dome)`, 'stroke="#3a3e44" stroke-width="0.8"'));
    // drum top feature
    const ftY = dTop - drumW * 0.28;
    if (p.backDrumTop === 'smallDome') out.push(ell(dcx, ftY, drumW * 0.22, drumW * 0.16, `url(#${idp}dome)`));
    else if (p.backDrumTop === 'finial') { out.push(line(dcx, ftY, dcx, ftY - 30, '#5c626a', 2.5)); out.push(circ(dcx, ftY - 30, 3, '#787e88')); }
    else if (p.backDrumTop === 'vent') out.push(rrect(dcx - 8, ftY - 10, 16, 12, 2, `url(#${idp}steel)`, 'stroke="#3a3e44" stroke-width="0.8"'));
    if (p.sideGun) out.push(gunEl(dcx, ftY - 2, dir, idp));
  }

  /* ============================ LAYER 2: side pipes ============================ */
  // BUG #2 prevented by construction: x/top/bottom all derived from body geometry.
  const pipes = [];
  for (let s = 0; s < 2; s++) {
    const left = s === 0;
    for (let k = 0; k < p.pipesPerSide; k++) {
      const baseX = left ? L.bodyLeft - pipeGap - k * (pipeW + 5)
                         : L.bodyRight + pipeGap + k * (pipeW + 5);
      const px = baseX - (left ? pipeW : 0);
      const top = bodyTop + 24 + k * 14;     // derived from body top
      const bottom = groundY;                // ends on the ground line
      pipes.push({ x: px, w: pipeW, top, bottom, left });
    }
  }
  for (const pp of pipes) {
    out.push(rect(pp.x, pp.top, pp.w, pp.bottom - pp.top, `url(#${idp}steel)`, 'stroke="#4a4e55" stroke-width="0.6"'));
    // elbow back to the body near the top
    const ex = pp.left ? pp.x + pp.w : pp.x;
    out.push(pathEl(`M ${n(ex)} ${n(pp.top)} Q ${n(ex + (pp.left ? 10 : -10))} ${n(pp.top - 8)} ${n(ex + (pp.left ? 18 : -18))} ${n(pp.top - 8)}`, 'none', `stroke="url(#${idp}steel)" stroke-width="${pp.w}" fill="none"`));
    // brackets every ~110px along the computed length
    for (let by = pp.top + 40; by < pp.bottom - 12; by += 110) {
      out.push(rect(pp.x - 2, by, pp.w + 4, 5, '#5c626a'));
    }
  }

  /* ============================ LAYER: base body + rim + notch ============================ */
  out.push(rect(L.baseLeft, rimTop, baseWidth, baseHeight, `url(#${idp}base)`, 'stroke="#3a3e44" stroke-width="0.8"'));
  out.push(surfaceDetail(L.baseLeft, rimTop + 16, baseWidth, baseHeight - 20, idp, R));
  // rim ring (lighter band, riveted)
  out.push(rect(L.baseLeft, rimTop, baseWidth, 14, `url(#${idp}steel)`, 'stroke="#4a4e55" stroke-width="0.6"'));
  for (let i = 0; i <= 8; i++) out.push(rivet(L.baseLeft + 6 + (i * (baseWidth - 12)) / 8, rimTop + 7));
  // dark shadow notch just above the rim (recess), slightly narrower than body
  out.push(rect(cx - bodyWidth * 0.46, rimTop - 5, bodyWidth * 0.92, 5, '#000000', 'opacity="0.4"'));

  /* ============================ LAYER 3: main body ============================ */
  out.push(rect(L.bodyLeft, bodyTop, bodyWidth, bodyHeight, `url(#${idp}body)`, 'stroke="#3a3e44" stroke-width="1"'));
  out.push(surfaceDetail(L.bodyLeft, bodyTop + 16, bodyWidth, bodyHeight - 22, idp, R));

  /* ---- floors + windows ---- */
  const floors = p.floors, wpf = p.windowsPerFloor;
  const floorTop = bodyTop + 22;
  const floorBottom = bodyBottom - 16;
  const floorH = (floorBottom - floorTop) / floors;
  const winH = floorH * 0.55;
  const winW = Math.min((bodyWidth / (wpf + 1)) * 0.78, winH * 0.85);
  for (let f = 0; f < floors; f++) {
    const fy = floorTop + f * floorH + (floorH - winH) / 2;
    for (let w = 0; w < wpf; w++) {
      const wxCenter = L.bodyLeft + ((w + 1) * bodyWidth) / (wpf + 1);
      out.push(windowEl(wxCenter - winW / 2, fy, winW, winH, idp, R.bool(0.5) ? 2 : 3, 2));
    }
  }

  /* ============================ LAYER 4: bay window ============================ */
  if (p.bayWindow !== 'none') {
    const dir = p.bayWindow === 'left' ? -1 : 1;
    const edge = dir < 0 ? L.bodyLeft : L.bodyRight;
    const bx = dir < 0 ? edge - bayBulge : edge - bayW + bayBulge;
    const byTop = floorTop + floorH * (floors >= 3 ? 1 : 0) + 6;
    const byH = floorH * 0.86;
    out.push(rrect(bx, byTop, bayW, byH, 4, `url(#${idp}body)`, 'stroke="#3a3e44" stroke-width="1"'));
    out.push(line(bx, byTop + 4, bx + bayW, byTop + 4, '#000000', 0.9, 'opacity="0.2"'));
    out.push(windowEl(bx + 8, byTop + 10, bayW - 16, byH - 22, idp, 3, 2));
    // balcony
    if (p.bayBalcony) {
      const rb = byTop + byH;
      out.push(line(bx - 4, rb, bx + bayW + 4, rb, '#5c626a', 2));
      out.push(line(bx - 4, rb + 9, bx + bayW + 4, rb + 9, '#5c626a', 2));
      for (let i = 0; i <= 6; i++) out.push(line(bx - 4 + (i * (bayW + 8)) / 6, rb, bx - 4 + (i * (bayW + 8)) / 6, rb + 9, '#5c626a', 1.4));
    }
  }

  /* ============================ rim front lip (seats body INTO base) ============================ */
  out.push(rect(cx - bodyWidth / 2, rimTop, bodyWidth, seat + 4, `url(#${idp}steel)`, 'stroke="#4a4e55" stroke-width="0.6"'));
  for (let i = 0; i <= 6; i++) out.push(rivet(cx - bodyWidth / 2 + 6 + (i * (bodyWidth - 12)) / 6, rimTop + (seat + 4) / 2));

  /* ============================ LAYER 5: cap ============================ */
  out.push(capEl(L, cx, bodyTop, bodyWidth, capHeight, p.capStyle, idp, R, p.roofClutter, p.capColor, p.bodyColor));

  /* ============================ LAYER 6: base windows + door ============================ */
  const baseWinH = Math.min(baseHeight * 0.4, 34);
  const baseWinW = baseWinH * 0.9;
  const baseWinY = rimTop + 22;
  out.push(windowEl(cx - baseWidth * 0.34, baseWinY, baseWinW, baseWinH, idp, 2, 2));
  if (R.bool(0.5)) out.push(windowEl(cx + baseWidth * 0.34 - baseWinW, baseWinY, baseWinW, baseWinH, idp, 2, 2));
  out.push(doorEl(cx + (R.bool(0.5) ? baseWidth * 0.18 : 0), groundY, idp, p.doorColor, R));

  /* ============================ LAYER 8: flared foot ============================ */
  const fL = cx - halfFoot, fR = cx + halfFoot;
  const fTop = groundY - footH;
  const fd = `M ${n(fL)} ${n(groundY)} ` +
    `L ${n(L.baseLeft + 6)} ${n(fTop)} ` +
    `Q ${n(cx - baseWidth * 0.2)} ${n(fTop + 6)} ${n(cx - baseWidth * 0.06)} ${n(fTop + 2)} ` +
    `Q ${n(cx)} ${n(fTop - 2)} ${n(cx + baseWidth * 0.06)} ${n(fTop + 2)} ` +
    `Q ${n(cx + baseWidth * 0.2)} ${n(fTop + 6)} ${n(L.baseRight - 6)} ${n(fTop)} ` +
    `L ${n(fR)} ${n(groundY)} Z`;
  out.push(pathEl(fd, `url(#${idp}steel)`, 'stroke="#3a3e44" stroke-width="0.8"'));
  for (let i = 0; i <= 8; i++) out.push(rivet(fL + 8 + (i * (halfFoot * 2 - 16)) / 8, groundY - 5));

  /* ------------------------------------------------------------------ *
   *  ACCEPTANCE ASSERTIONS (bugs impossible by construction).
   * ------------------------------------------------------------------ */
  const ratio = bodyHeight / bodyWidth;
  if (ratio > 2.5) throw new Error(`body ratio ${ratio.toFixed(2)} exceeds 1:2.5 (silo)`);
  if (capWidth !== bodyWidth) throw new Error('capWidth must equal bodyWidth');
  if (Math.abs(capHeight - capWidth * capRatio) > 1e-6) throw new Error('capHeight must be capWidth*capRatio');
  if (floors < 2 || wpf < 2) throw new Error('need >=2 floors and >=2 windows/floor');
  for (const pp of pipes) {
    if (pp.top < bodyTop - 1e-6) throw new Error('pipe top above body top');
    if (pp.bottom > groundY + 1e-6) throw new Error('pipe bottom below ground line');
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(W)} ${n(H)}" width="${n(W)}" height="${n(H)}">` +
    out.join('') + `</svg>`;

  return { svg, width: W, height: H, groundY, meta: { ratio, ...p, _R: undefined } };
}

/* ------------------------------------------------------------------ *
 *  Preview strip — all buildings on a shared ground line.
 * ------------------------------------------------------------------ */
function buildPreviewStrip(builds) {
  const pad = 40;
  const maxH = Math.max(...builds.map((b) => b.height));
  const stripH = maxH + 60;
  const groundY = stripH - 40;
  let xCursor = pad;
  const parts = [];
  const tops = [];
  for (let i = 0; i < builds.length; i++) {
    const b = builds[i];
    const inner = b.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    const dy = groundY - b.groundY; // align each building's own ground to the shared line
    parts.push(`<g transform="translate(${n(xCursor)},${n(dy)})">${inner}</g>`);
    xCursor += b.width + pad;
  }
  const W = xCursor;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(W)} ${n(stripH)}" width="${n(W)}" height="${n(stripH)}">` +
    `<rect x="0" y="0" width="${n(W)}" height="${n(stripH)}" fill="#eef0f2"/>` +
    `<line x1="0" y1="${n(groundY)}" x2="${n(W)}" y2="${n(groundY)}" stroke="#9aa0a8" stroke-width="2"/>` +
    parts.join('') + `</svg>`;
}

/* ------------------------------------------------------------------ *
 *  main()
 * ------------------------------------------------------------------ */
function main() {
  const args = process.argv.slice(2);
  const countArg = args.find((a) => a.startsWith('--count='));
  const seedArg = args.find((a) => a.startsWith('--seed='));
  const count = countArg ? parseInt(countArg.split('=')[1], 10) : 25;
  const baseSeed = seedArg ? parseInt(seedArg.split('=')[1], 10) : 1000;

  const outDir = path.join(__dirname, 'out');
  const bDir = path.join(outDir, 'buildings');
  fs.mkdirSync(bDir, { recursive: true });

  const builds = [];
  for (let i = 1; i <= count; i++) {
    const seed = baseSeed + i;
    const p = randomParams(seed);
    const b = buildBuilding(p, i);
    const name = `building-${String(i).padStart(2, '0')}.svg`;
    fs.writeFileSync(path.join(bDir, name), b.svg);
    builds.push(b);
    console.log(`${name}  seed=${seed}  ${Math.round(b.width)}x${Math.round(b.height)}  ratio=${b.meta.ratio.toFixed(2)}  body=${p.bodyColor} cap=${p.capStyle}`);
  }

  fs.writeFileSync(path.join(outDir, 'preview-strip.svg'), buildPreviewStrip(builds));
  console.log(`\nWrote ${count} building(s) + preview-strip.svg to ${outDir}`);
}

if (require.main === module) main();

module.exports = { buildBuilding, randomParams, buildPreviewStrip, RAMPS };
