/* ============================================================
   Junction · the drawn art, as data
   ============================================================

   The owner draws in Illustrator; this is what comes out of it, kept as
   coordinates rather than as files. Nothing here is fetched at runtime: the
   game ships no SVGs and makes no extra requests for them, the shapes stay
   sharp at any cell size, and every colour is a SLOT the renderer fills, which
   is what lets one engine drawing be four coloured engines.

   EVERY EXPORT ARRIVES ON AN A4 ARTBOARD. The viewBox is 0 0 595.28 841.89 in
   all seven files and the art sits somewhere in the middle of it, so each
   entry carries its own bounding box, measured with getBBox in a browser
   rather than guessed, and the renderer normalises against that. Draw against
   the viewBox instead and the art lands as a speck in the corner.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JUNCTION_ART = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* THE TREES, exactly as drawn. Two paths each, a darker mass with a lighter
   crown laid over it, which is the same two-layer treatment the hedge already
   uses, so they sit in the same wood. Three silhouettes, and the renderer
   chooses between them by a hash of the cell, so a row of trees is never a row
   of the same tree. */
const TREES = [
  // tree1.svg, cropped from the A4 artboard it was exported on
  { x: 246.85, y: 374.12, w: 101.56, h: 93.06, paths: [
    { fill: '#0eaa4c',
      d: 'M348.4,432.98c0,12.8-10.38,23.18-23.19,23.18-.87,0-1.72-.05-2.57-.14-2.29,3.16-6,5.23-10.21,5.23-1,0-1.96-.13-2.9-.35-4.22,3.9-9.86,6.28-16.06,6.28s-11.44-2.22-15.6-5.87c-2.09-1.83-3.86-4.02-5.19-6.48-6.53-.07-12.11-4.04-14.54-9.7-6.54-2.01-11.29-8.1-11.29-15.3,0-5.74,3.02-10.75,7.56-13.58,0-.03,0-.05,0-.08,0-1.48.27-2.89.74-4.21-1.48-2.65-2.32-5.7-2.32-8.95,0-10.2,8.26-18.46,18.46-18.46.65,0,1.29.03,1.92.1,4.78-6.39,12.41-10.53,21.01-10.53,5.61,0,10.8,1.77,15.06,4.76.55-.34,1.12-.65,1.71-.92,2.05-.97,4.33-1.51,6.75-1.51,8.84,0,16.01,7.17,16.01,16.01,0,2.49-.58,4.84-1.59,6.94,5.43,2.56,9.2,8.07,9.2,14.47,0,.78-.08,1.54-.19,2.29,4.46,4.22,7.24,10.19,7.24,16.82Z' },
    { fill: '#6cbf5b',
      d: 'M332.34,428.91c-2.47,5.17-7.37,8.4-12.68,8.99,0,.03-.02.05-.03.07-.64,1.34-1.49,2.5-2.48,3.49.19,3.03-.37,6.15-1.77,9.08-4.4,9.2-15.43,13.1-24.63,8.7-.58-.28-1.15-.59-1.69-.92-3.44,1.8-7.27,2.84-11.19,2.99-2.09-1.83-3.86-4.02-5.19-6.48-6.53-.07-12.11-4.04-14.54-9.7-6.54-2.01-11.29-8.1-11.29-15.3,0-5.74,3.02-10.75,7.56-13.58,0-.03,0-.05,0-.08,0-1.48.27-2.89.74-4.21-1.48-2.65-2.32-5.7-2.32-8.95,0-10.2,8.26-18.46,18.46-18.46.65,0,1.29.03,1.92.1,4.78-6.39,12.41-10.53,21.01-10.53,5.61,0,10.8,1.77,15.06,4.76.55-.34,1.12-.65,1.71-.92,5.33,4.27,8.47,10.6,8.83,17.23,5.86,2.89,9.19,8.88,8.94,15.03,5.03,4.64,6.7,12.19,3.59,18.69Z' },
  ] },
  // tree2.svg, cropped from the A4 artboard it was exported on
  { x: 250.68, y: 373.95, w: 93.88, h: 93.4, paths: [
    { fill: '#009444',
      d: 'M340.82,433.1c1.52,2.45,2.42,5.33,2.42,8.42,0,8.84-7.17,16.01-16.01,16.01-2.19,0-4.27-.44-6.17-1.23-2.3,3.1-5.97,5.11-10.13,5.11-1,0-1.96-.12-2.9-.34-4.22,3.9-9.86,6.28-16.06,6.28-10.02,0-18.58-6.22-22.04-15.02.2-.15.4-.3.59-.46.44-.37.86-.76,1.25-1.16,8.53,8.52,22.29,9.31,31.76,1.46,4.76-3.95,7.58-9.37,8.34-15.05.85-.43,1.68-.94,2.45-1.58,3.19-2.65,4.73-6.54,4.52-10.38,1.96-.6,3.84-1.59,5.52-2.98,6.8-5.63,7.74-15.7,2.11-22.5-1.97-2.37-4.49-4.02-7.22-4.93-.49-4.3-2.19-8.5-5.16-12.08-1.44-1.74-3.08-3.22-4.87-4.42,2.12-1.04,4.49-1.63,7.01-1.63,8.84,0,16.01,7.16,16.01,16.01,0,2.37-.53,4.62-1.46,6.65,8.12,3.61,13.78,11.74,13.78,21.2,0,4.65-1.37,8.98-3.74,12.62Z' },
    { fill: '#11af4b',
      d: 'M324.36,422.18c-1.68,1.39-3.56,2.38-5.52,2.98.21,3.84-1.33,7.73-4.52,10.38-.77.64-1.6,1.15-2.45,1.58-.76,5.68-3.58,11.1-8.34,15.05-9.47,7.85-23.23,7.06-31.76-1.46-.39.4-.81.79-1.25,1.16-.19.16-.39.31-.59.46-.8-2.02-1.32-4.17-1.53-6.42-.56.06-1.13.1-1.71.1-8.84,0-16.01-7.17-16.01-16.01,0-4.34,1.74-8.27,4.54-11.16-2.05-2.24-3.32-5.22-3.32-8.5,0-6.88,5.52-12.47,12.36-12.6,1.22-13.09,12.05-23.4,25.37-23.77.25-.02.5-.02.75-.02,1.55,0,3.06.13,4.54.39h.01c5-.29,10.04,1.04,14.29,3.91,1.79,1.2,3.43,2.68,4.87,4.42,2.97,3.58,4.67,7.78,5.16,12.08,2.73.91,5.25,2.56,7.22,4.93,5.63,6.8,4.69,16.87-2.11,22.5Z' },
  ] },
  // tree3.svg, cropped from the A4 artboard it was exported on
  { x: 249.57, y: 374.54, w: 96.11, h: 92.22, paths: [
    { fill: '#39b54a',
      d: 'M334.64,435.82c.35,1.69.53,3.43.53,5.22,0,14.2-11.51,25.72-25.72,25.72-7.73,0-14.65-3.41-19.37-8.81-2.28,1.57-5.04,2.48-8.02,2.48-7.22,0-13.17-5.38-14.1-12.34-2.77-.59-5.36-1.66-7.67-3.14-6.45-4.11-10.72-11.33-10.72-19.55,0-6.24,2.47-11.91,6.48-16.08-1.32-2.45-2.07-5.27-2.07-8.25,0-9.64,7.81-17.45,17.44-17.45.92,0,1.81.09,2.69.23,2.14-3.35,5.88-5.57,10.15-5.57,2.85,0,5.46.99,7.53,2.65,3.52-3.34,8.08-5.6,13.15-6.21.92-.12,1.87-.18,2.82-.18,12.8,0,23.19,10.39,23.19,23.19,0,.62-.04,1.24-.08,1.84,8.49,2.05,14.81,9.68,14.81,18.8,0,7.7-4.52,14.34-11.04,17.45Z' },
    { fill: '#8dc63f',
      d: 'M326.61,424.57c-2.81,5.44-7.51,9.25-12.88,11.07.05,2.74-.56,5.52-1.9,8.12-4.34,8.38-14.65,11.66-23.03,7.33-.79-.41-1.53-.9-2.23-1.41-3.37,1.95-7.62,2.2-11.33.28-2.48-1.28-4.31-3.32-5.36-5.69-3.08.9-6.35,1.15-9.59.68-6.45-4.11-10.72-11.33-10.72-19.55,0-6.24,2.47-11.91,6.48-16.08-1.32-2.45-2.07-5.27-2.07-8.25,0-9.64,7.81-17.45,17.44-17.45.92,0,1.81.09,2.69.23,2.14-3.35,5.88-5.57,10.15-5.57,2.85,0,5.46.99,7.53,2.65,3.52-3.34,8.08-5.6,13.15-6.21.44,1.07.79,2.18,1.07,3.31,2.69-.33,5.5.12,8.09,1.45,6.28,3.25,9.04,10.61,6.72,17.09,8.14,6.64,10.81,18.3,5.79,28Z' },
  ] },
];

/* THE ENGINE. The drawing points DOWN in its own frame, cab at the top and
   cowcatcher at the bottom, so the renderer turns it a quarter turn to put the
   nose along the direction of travel.

   Colours are ROLES, not values. 'body' and 'bodyLit' are the boiler and its
   highlight and take the engine's own colour, so one drawing serves coral,
   amber, teal and violet; the cab, the frames and the smokebox keep the greys
   they were drawn in, because an engine that is entirely one colour stops
   looking like a machine.

   Two things are deliberately dropped: the forty-two cowcatcher slats and the
   axle-end caps. At the size a cell gives an engine, about 36px long on a
   phone, a 4px slat is a fifth of a pixel, so they would cost around 210 extra
   stroke calls a frame across five trains and draw nothing anyone could see.
   They are in the source file if a bigger frame ever wants them. */
const ENGINE = {
  x: 248.78, y: 322.92, w: 97.70, h: 195.46,
  ops: [
    // the cowcatcher, first, so the body sits over it
    { t: 'poly', f: 'plough',     p: [297.62,484.23, 297.62,518.38, 346.47,507.11, 338.54,489.13] },
    { t: 'poly', f: 'ploughDark', p: [297.62,484.23, 297.62,518.38, 248.78,507.11, 256.70,489.13] },
    // frames down each flank: wheels implied, never drawn as spokes
    { t: 'rect', f: 'frame',    x: 338.80, y: 359.95, w: 4.43, h: 34.5 },
    { t: 'rect', f: 'frameLit', x: 338.80, y: 384.63, w: 4.43, h: 8.21 },
    { t: 'rect', f: 'frame',    x: 338.80, y: 409.08, w: 4.43, h: 34.5 },
    { t: 'rect', f: 'frameLit', x: 338.80, y: 433.76, w: 4.43, h: 8.21 },
    { t: 'rect', f: 'frame',    x: 338.80, y: 458.20, w: 4.43, h: 34.5 },
    { t: 'rect', f: 'frameLit', x: 338.80, y: 482.88, w: 4.43, h: 8.21 },
    { t: 'rect', f: 'frame',    x: 252.01, y: 359.95, w: 4.43, h: 34.5 },
    { t: 'rect', f: 'frameLit', x: 252.01, y: 384.63, w: 4.43, h: 8.21 },
    { t: 'rect', f: 'frame',    x: 252.01, y: 409.08, w: 4.43, h: 34.5 },
    { t: 'rect', f: 'frameLit', x: 252.01, y: 433.76, w: 4.43, h: 8.21 },
    { t: 'rect', f: 'frame',    x: 252.01, y: 458.20, w: 4.43, h: 34.5 },
    { t: 'rect', f: 'frameLit', x: 252.01, y: 482.88, w: 4.43, h: 8.21 },
    // chassis, then the boiler in the engine's own colour over it
    { t: 'rect', f: 'chassis',  x: 256.44, y: 363.52, w: 82.36, h: 125.61 },
    { t: 'rect', f: 'body',     x: 268.20, y: 363.52, w: 58.84, h: 125.61 },
    { t: 'rect', f: 'bodyLit',  x: 312.47, y: 363.52, w: 8.46,  h: 125.61, a: 0.4 },
    { t: 'path', f: 'shade',    a: 0.5,
      d: 'M296.06,462.33l3.59-7.19s-14.53-17.13-31.45-11.17v24s11.39-1.88,23.75,11.22' },
    // smokebox door and dome
    { t: 'circle', f: 'iron', s: 'ironEdge', cx: 297.62, cy: 467.96, r: 15.33 },
    { t: 'circle', f: 'iron', s: 'ironEdge', cx: 297.62, cy: 420.80, r: 6.40 },
    // the cab last, because it stands above everything
    { t: 'rect', f: 'cab',    x: 248.78, y: 322.92, w: 97.70, h: 65.56 },
    { t: 'rect', f: 'cabLit', x: 310.67, y: 322.92, w: 18.15, h: 65.56 },
  ],
};

return { TREES, ENGINE };
}));
