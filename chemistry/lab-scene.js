/* ============================================================
   Litmus · chapter 2, reactions: the bench

   The dish floats whole molecules, each with its formula under it. Drag two
   into the test tube; if they react, what they make lands on the tray. Drag
   what the list wants is counted where it lands, and a byproduct a later step
   needs back into the dish. Whatever is left on the tray is poured away at
   the next reaction.

   lab.js decides every reaction. This file places, moves and draws the
   molecules and takes the drags. play.js hands it the canvas, the marble
   renderer, the HUD and the cards, through `host`.
   ============================================================ */
(function () {
  'use strict';

  window.ChemLabScene = function (host) {
    const X = window.ChemLab;
    const { ctx, TOK, drawAtoms, rr, label, SND, clock, INK } = host;
    const TAU = Math.PI * 2;
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    const grow = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
    const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

    /* Distances in the dish are in world units, as chapter 1's are: a bond is
       1.9, an atom's radius 0.58. Molecules drift slowly, turn a little and
       settle back upright, so a formula always reads the right way up. */
    const L = {
      bond: 1.9, atom: 0.58,
      worldW: { desktop: 26, mobile: 22 }, maxScale: 22,
      drift: 0.3, spin: 0.2, tau: 3,
      reactMs: 2600, productsAt: 2240, chipMs: 1900, eqMs: 4600, dropMs: 600, flyMs: 320,
      touchLift: 36,
    };

    let level = null, st = null, MODE = 'desktop', LW = 760, LH = 600;
    const pos = new Map();          // dish piece id -> { x, y, th, vx, vy, w }
    const traySlot = new Map();     // tray piece id -> slot 0..3
    const collected = new Map();    // a counted molecule on its way up to the list: id -> { slot, t0 }
    let tubeOrder = [];             // tube piece ids, in the order they went in
    let drag = null;                // { id, from, pid, touch, x, y, ox, oy }
    let react = null;               // { t0, used: [key], poured: [{ key, slot }], eq }
    let chips = [];
    const D = { x: 0, y: 0, w: 0, h: 0, S: 16, WW: 26, WH: 26, bond: 1.9, atom: 0.58 };
    let tube = { x: 0, y: 0, w: 0, h: 0 }, tray = { x: 0, y: 0, w: 0, h: 0 };
    let targetsArea = { x: 0, y: 0, w: 0, h: 0 };

    function gauss() { const u = 1 - host.rng(), v = host.rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }
    const radiusOf = (key) => X.SPECIES[key].extent * D.bond + D.atom + 0.35;
    /* How near each edge of the dish a molecule's centre may come, in world
       units: every atom, turned any way, and the formula label under it, at
       least 10px inside the glass rim (owner, 2026-09-15). The rim, the 10px
       and the label are pixels, worked out at the size the dish is drawn. */
    // ...and one pixel more, because a marble's edge is drawn soft and its
    // last faint ring would otherwise sit inside the ten.
    const RIM = 7, CLEAR = 10, FRINGE = 1, chipHalf = new Map();
    function margins(key) {
      const sp = X.SPECIES[key], e = sp.extent * D.bond, pad = (RIM + CLEAR + FRINGE) / D.S;
      let half = chipHalf.get(key);
      if (half == null) {
        ctx.save(); ctx.font = '700 13px Inter, sans-serif';
        half = (ctx.measureText(sp.formula).width + 14) / 2;
        ctx.restore();
        if (!document.fonts || document.fonts.check('700 13px Inter')) chipHalf.set(key, half);
      }
      // the label hangs below the lowest atom: a third of a bond, then 14px to its middle and 11px more to its bottom
      return { side: Math.max(e + D.atom, half / D.S) + pad, top: e + D.atom + pad, bottom: e + 0.32 * D.bond + 25 / D.S + pad };
    }
    const unitPx = () => Math.round(D.bond * D.S * 2) / 2;
    /* The biggest molecule has to sit in the dish with its label under it and
       still keep 10px off the rim. On a short phone that is more than the dish
       can give, so the whole bench is drawn a little smaller until it fits. */
    function fitBench() {
      D.bond = L.bond; D.atom = L.atom;
      if (!st) return;
      const pad = (RIM + CLEAR + FRINGE) / D.S;
      let k = 1;
      for (const key of new Set(st.pieces.map((p) => p.key))) {
        const e = X.SPECIES[key].extent * L.bond;
        k = Math.min(k, (D.WH - 25 / D.S - 2 * pad) / (2 * e + L.atom + 0.32 * L.bond),
                        (D.WW / 2 - pad) / (e + L.atom));
      }
      k = Math.max(0.5, Math.min(1, k));
      D.bond = L.bond * k; D.atom = L.atom * k;
    }

    /* ---------- LAYOUT ----------
       Desktop 760x600: the dish on the left, and the bench as a column on the
       right — the tube at the top, the product boxes and the target glass side
       by side at the bottom, standing on the dish's floor. Phone: the controls
       in the top band, the targets, the dish, then the bench as one strip along
       the bottom, tube, boxes and glass side by side.
       EVERY WORD SITS ON A RULE (owner, 2026-09-16). The words are placed first,
       on the page's own lines, and the glassware and the boxes hang under them,
       so the bench keeps the notebook's grid at any window size.
       A desktop window of another shape (an embed, a portal package, full
       screen) keeps the column 262 wide and gives the dish the rest of the
       width; the tube stands taller or shorter with the window, and the dish
       keeps the frame's room in world units, as chapter 1's does. */
    const FRAME_DISH = { w: 402, h: 420 };        // the 760x600 frame's lab dish, beside a 280 wide bench
    /* THE BENCH, simplified to the owner's drawing (2026-09-19): the test tube
       on the left with what to do written inside it, and the products on open
       shelves to its right. There is no glass to carry a finished molecule to
       any more: the list counts it where it lands. */
    const BENCH = { head: 26, label: 15, cellGap: 10, colGap: 18, headGap: 24, trough: 100, troughGap: 26 };
    // where a shelf's bracket begins, which is what the heading sits above
    const shelfTop = () => shelfDrawn(traySlotRect(0)).y;
    let wordBase = { tray: 0 };
    function layout() {
      ({ LW, LH, MODE } = host.size());
      const oldW = D.WW, oldH = D.WH;
      if (MODE === 'mobile') {
        const top = host.topBand(), short = LH < 700;
        const flaskH = short ? 92 : 108, gap = short ? 8 : 12;
        const floor = LH - host.botBand() - 6, benchH = Math.min(short ? 176 : 212, Math.round(LH * 0.3));
        const benchTop = floor - benchH, m = 16;
        targetsArea = { x: 14, y: top, w: LW - 28, h: flaskH };
        D.x = 14; D.w = LW - 28; D.y = top + flaskH + gap;
        D.h = Math.max(120, benchTop - 14 - D.y);
        tube = { x: m, y: benchTop, w: Math.round(LW * 0.26), h: benchH };
        // the troughs are the same size and spacing here as on a desktop, shrunk only if the phone is too narrow
        const room = LW - m - 14 - (tube.x + tube.w + BENCH.colGap);
        const cw = Math.min(BENCH.trough, (room - BENCH.troughGap) / 2), gw = cw * 2 + BENCH.troughGap;
        const gh = Math.min(benchH - BENCH.head, 2 * 82 + BENCH.cellGap);
        tray = { x: LW - m - 14 - gw, y: floor - gh, w: gw, h: gh, gap: BENCH.troughGap };
        wordBase = { tray: shelfTop() - BENCH.headGap };
        D.S = Math.min(L.maxScale, D.w / L.worldW.mobile);
      } else {
        targetsArea = { x: 30, y: 58, w: LW - 60, h: 74 };
        D.x = 30; D.y = 140; D.w = LW - 60 - 18 - 280; D.h = LH - host.botBand() - 140;
        const cx = D.x + D.w + 18, cw = LW - 30 - cx, floor = D.y + D.h, colTop = D.y + 22;
        /* The owner's desktop drawing, 2026-09-19: the beaker above, the
           heading under it and the four troughs standing on the dish's floor,
           all the column's width, so the equation has the room to read. */
        const gridH = Math.round(Math.min((floor - colTop) * 0.52, 2 * 104 + BENCH.cellGap));
        const gw = Math.min(cw, BENCH.trough * 2 + BENCH.troughGap);
        tray = { x: cx + Math.round((cw - gw) / 2), y: floor - gridH, w: gw, h: gridH, gap: BENCH.troughGap };
        wordBase = { tray: shelfTop() - BENCH.headGap };
        tube = { x: cx, y: colTop, w: cw, h: Math.max(90, wordBase.tray - 26 - colTop) };
        const shape = (D.h / D.w) / (FRAME_DISH.h / FRAME_DISH.w);
        D.S = Math.min(L.maxScale, (D.w / L.worldW.desktop) * Math.sqrt(shape));
      }
      D.WW = D.w / D.S; D.WH = D.h / D.S;
      fitBench();
      if (pos.size && oldW && (Math.abs(oldW - D.WW) > 1e-6 || Math.abs(oldH - D.WH) > 1e-6)) {
        for (const q of pos.values()) { q.x *= D.WW / oldW; q.y *= D.WH / oldH; }
      }
    }

    /* ---------- LOADING ---------- */
    function load(lv) {
      level = lv;
      st = X.createLab(lv);
      pos.clear(); traySlot.clear(); collected.clear(); tubeOrder = [];
      drag = null; react = null; chips = []; modal = null; pendingEnd = null;
      layout();
      const r = host.mulberry(lv.seed * 7919 + 5), placed = [];
      for (const p of st.pieces) {
        const rad = radiusOf(p.key), m = margins(p.key);
        const spot = () => ({ x: m.side + r() * Math.max(0.1, D.WW - 2 * m.side), y: m.top + r() * Math.max(0.1, D.WH - m.top - m.bottom) });
        let got = null;
        for (let t = 0; t < 3000 && !got; t++) {
          const slack = t > 2000 ? 0.1 : t > 1000 ? 0.4 : 0.9, c = spot();
          if (placed.every((q) => Math.hypot(q.x - c.x, q.y - c.y) >= q.rad + rad + slack)) got = c;
        }
        if (!got) got = spot();
        placed.push({ x: got.x, y: got.y, rad });
        pos.set(p.id, { x: got.x, y: got.y, th: (r() - 0.5) * 0.8, vx: 0, vy: 0, w: 0 });
      }
    }

    /* ---------- MOTION ---------- */
    function step(dt) {
      if (!st || modal) return;
      const list = st.pieces.filter((p) => p.zone === 'dish' && pos.has(p.id) && !(drag && drag.id === p.id));
      if (host.drift() && dt > 0) {
        for (const p of list) {
          const q = pos.get(p.id), n = X.SPECIES[p.key].atoms.length;
          const vm = L.drift / Math.sqrt(n), k = Math.sqrt(2 * dt / L.tau);
          q.vx += -q.vx * dt / L.tau + gauss() * vm * k;
          q.vy += -q.vy * dt / L.tau + gauss() * vm * k;
          q.w += (-q.w / L.tau - q.th * 0.25) * dt + gauss() * L.spin * k;
          q.x += q.vx * dt; q.y += q.vy * dt; q.th += q.w * dt;
        }
      }
      for (let it = 0; it < 3; it++) {
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            const a = pos.get(list[i].id), b = pos.get(list[j].id);
            let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
            if (d < 1e-4) { dx = 0.01; dy = 0; d = 0.01; }
            const min = radiusOf(list[i].key) + radiusOf(list[j].key) + 0.2;
            if (d < min) {
              const c = (min - d) * 0.25;
              a.x -= dx / d * c; a.y -= dy / d * c; b.x += dx / d * c; b.y += dy / d * c;
            }
          }
        }
        for (const p of list) {
          const q = pos.get(p.id), m = margins(p.key);
          q.x = Math.max(m.side, Math.min(D.WW - m.side, q.x));
          q.y = Math.max(m.top, Math.min(D.WH - m.bottom, q.y));
        }
      }
    }

    /* ---------- DRAWING ---------- */
    // A molecule as its marbles and sticks, turned by th, one bond `unit` px long.
    function drawMolecule(key, cx, cy, unit, th, alpha) {
      const s = X.SPECIES[key], c = Math.cos(th || 0), sn = Math.sin(th || 0);
      const pts = s.atoms.map((a) => ({ el: a.el, x: cx + (a.x * c - a.y * sn) * unit, y: cy + (a.x * sn + a.y * c) * unit }));
      const items = pts.map((p, i) => ({
        el: p.el, x: p.x, y: p.y, alpha, label: false, free: [],
        bonds: s.bonds.filter((b) => b.a === i || b.b === i).map((b) => {
          const o = pts[b.a === i ? b.b : b.a];
          return { ang: Math.atan2(o.y - p.y, o.x - p.x), half: Math.hypot(o.x - p.x, o.y - p.y) / 2, order: b.order, key: b.a + '-' + b.b };
        }),
      }));
      drawAtoms(items, Math.max(1.5, unit * D.atom / D.bond));
    }
    // The largest bond length that fits a molecule in a w x h box, capped at the dish's own.
    function fit(key, w, h) {
      const e = X.SPECIES[key].extent;
      return Math.max(3, Math.min(unitPx(), Math.min(w, h) / (2 * e + 1.4)));
    }
    function formulaChip(text, x, y, alpha, size, bare) {
      ctx.save();
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      const fs = size || 13;
      ctx.font = '700 ' + fs + 'px Inter, sans-serif';
      if (!bare) {                                   // under a trough the formula is written on the paper itself
        const w = Math.round(ctx.measureText(text).width + 14), h = fs + 9;
        ctx.fillStyle = '#E7EFF4';
        rr(Math.round(x - w / 2), Math.round(y - h / 2), w, h, h / 2); ctx.fill();
      }
      ctx.fillStyle = '#0E3F5C'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + 1);
      ctx.restore();
    }
    // The dish, drawn like the tube: two ink hairlines with the wall between and a faint glass tint.
    function glassRect(r, radius) {
      ctx.save();
      ctx.fillStyle = INK.tint; rr(r.x, r.y, r.w, r.h, radius); ctx.fill();
      ctx.strokeStyle = GLASS.line; ctx.lineWidth = 1.2; rr(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, radius); ctx.stroke();
      ctx.strokeStyle = INK.wall; ctx.lineWidth = 1; rr(r.x + 5.5, r.y + 5.5, r.w - 11, r.h - 11, radius - 5); ctx.stroke();
      ctx.restore();
    }
    const dishPx = (q) => ({ x: D.x + q.x * D.S, y: D.y + q.y * D.S });
    // How far below its centre a molecule's lowest atom sits, turned by th.
    function lowest(key, unit, th) {
      const c = Math.cos(th || 0), sn = Math.sin(th || 0);
      return Math.max(...X.SPECIES[key].atoms.map((a) => (a.x * sn + a.y * c) * unit));
    }

    function drawDish(now) {
      glassRect(D, 24);
      const u = unitPx();
      for (const p of st.pieces) {
        if (p.zone !== 'dish' || !pos.has(p.id) || (drag && drag.id === p.id)) continue;
        const q = pos.get(p.id), c = dishPx(q), s = X.SPECIES[p.key];
        drawMolecule(p.key, c.x, c.y, u, q.th, 1);
        formulaChip(s.formula, c.x, c.y + lowest(p.key, u, q.th) + u * 0.32 + 14);
      }
      void now;
    }

    /* The glassware, in the style of the owner's last picture (2026-09-15):
       the glass as two hairlines, its outer face and its inner, with the
       wall's thickness between them; a rim across the tube's mouth; a long
       highlight down the left that follows the curve of the bottom and
       tapers away; and liquid shaded from dark at the left to light at the
       right, with a lighter line where its surface is. */
    const GLASS = { line: 'rgba(28,115,161,0.85)', shine: 'rgba(28,115,161,0.20)', dark: '#2E8FC0', light: '#9ED8EE',
                    surface: 'rgba(255,255,255,0.9)', bubble: 'rgba(255,255,255,0.65)' };
    const hair = (w) => { ctx.strokeStyle = GLASS.line; ctx.lineWidth = w || 1; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; };
    // liquid across a span of x, dark at the left and light at the right
    const liquidFill = (x0, x1) => { const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, GLASS.dark); g.addColorStop(1, GLASS.light); return g; };

    /* The test tube, holding at most two. Empty at rest; when two molecules
       react, liquid rises in it and falls away again as the products leave. */
    function tubeGlass() {
      // a phone keeps the test tube; a desktop pours into a beaker, wide and flat-bottomed (owner, 2026-09-19)
      const gw = MODE === 'mobile' ? Math.min(60, tube.w - 16) : Math.min(150, tube.w - 30, Math.round((tube.h - 12) * 0.85));
      return { x: tube.x + (tube.w - gw) / 2, y: tube.y + 8, w: gw, h: tube.h - 12 };
    }
    function tubeSlot(k) {
      const g = tubeGlass();
      // in the beaker the two stand side by side; in the tube one above the other
      if (MODE !== 'mobile') return { x: g.x + 4 + k * (g.w - 8) / 2, y: g.y + 8, w: (g.w - 8) / 2, h: g.h - 16 };
      return { x: g.x + 4, y: g.y + 6 + k * (g.h - 12) / 2, w: g.w - 8, h: (g.h - 12) / 2 };
    }
    /* The vessel's outline, inset by `i` from its outer face: a round-bottomed
       tube on a phone, a straight-sided beaker with a flat floor on a desktop.
       Both are open at the mouth. */
    /* The beaker, measured off the owner's drawing (2026-09-19): straight
       double walls that turn OUT at the bottom onto a flat base a little wider
       than the vessel, and that base's top edge is the floor. */
    const beakerFoot = (g) => Math.max(6, Math.round(g.w * 0.07));
    const beakerFlare = (g) => Math.max(4, Math.round(g.w * 0.065));
    function tubeLine(g, i) {
      if (MODE !== 'mobile') {
        const foot = beakerFoot(g), flare = beakerFlare(g), yf = g.y + g.h - foot;
        ctx.beginPath();
        ctx.moveTo(g.x + i, g.y + 3);
        ctx.lineTo(g.x + i, yf - flare);
        ctx.quadraticCurveTo(g.x + i, yf, g.x + i - flare + i, yf);
        ctx.lineTo(g.x + g.w - i + flare - i, yf);
        ctx.quadraticCurveTo(g.x + g.w - i, yf, g.x + g.w - i, yf - flare);
        ctx.lineTo(g.x + g.w - i, g.y + 3);
        return;
      }
      const rad = g.w / 2;
      ctx.beginPath();
      ctx.moveTo(g.x + i, g.y + 3); ctx.lineTo(g.x + i, g.y + g.h - rad);
      ctx.arc(g.x + rad, g.y + g.h - rad, rad - i, Math.PI, 0, true);
      ctx.lineTo(g.x + g.w - i, g.y + 3);
    }
    /* The reaction (owner, 2026-09-15: "show it transform to a couple of
       different colours (2-3 seconds) and then the molecules will be on the
       shelf"). The tube stands empty until both molecules are in. Then liquid
       rises, turns teal, then violet, then amber as it bubbles, and drains
       away as the products appear on the shelf. Each stop: when, as a share
       of the reaction, and the liquid's dark and light shades. */
    const REACTION = [[0, '#5A6068', '#9AA1A8'], [0.2, '#2A9D8F', '#7FD8CC'], [0.36, '#2A9D8F', '#7FD8CC'], [0.5, '#6D4BC9', '#B39DF2'],
                      [0.62, '#6D4BC9', '#B39DF2'], [0.76, '#D9822B', '#F5C07A'], [1, '#D9822B', '#F5C07A']];
    const mixHex = (a, b, k) => 'rgb(' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k)).join(',') + ')';
    function reactionShades(t) {
      let i = 0;
      while (i < REACTION.length - 2 && t > REACTION[i + 1][0]) i++;
      const [t0, d0, l0] = REACTION[i], [t1, d1, l1] = REACTION[i + 1], k = clamp01((t - t0) / Math.max(1e-6, t1 - t0));
      return [mixHex(d0, d1, k), mixHex(l0, l1, k)];
    }
    // How full the tube is through a reaction: it fills, holds, then drains as the products leave.
    const reactionLevel = (t) => (t < 0.18 ? easeOut(t / 0.18) : t < 0.86 ? 1 : 1 - easeInOut(clamp01((t - 0.86) / 0.14)));
    function drawTube(now) {
      const g = tubeGlass(), active = react && now - react.t0 < L.reactMs, gap = Math.max(3, g.w * 0.045);
      const t = active ? (now - react.t0) / L.reactMs : 0, fill = active ? reactionLevel(t) : 0;
      const rad = g.w / 2, cx = g.x + rad, cy = g.y + g.h - rad;
      ctx.save();
      if (drag && inside(heldCentre(), grow(tube, 14))) { ctx.fillStyle = 'rgba(23,116,74,0.14)'; tubeLine(g, gap); ctx.closePath(); ctx.fill(); }
      if (fill > 0) {
        const level = g.y + g.h - gap - (g.h - gap - 8) * 0.7 * fill;
        ctx.save();
        tubeLine(g, gap); ctx.closePath(); ctx.clip();
        const [dark, light] = reactionShades(t), shade = ctx.createLinearGradient(g.x + gap, 0, g.x + g.w - gap, 0);
        shade.addColorStop(0, dark); shade.addColorStop(1, light);
        ctx.fillStyle = shade; ctx.fillRect(g.x, level, g.w, g.h);
        ctx.fillStyle = GLASS.surface; ctx.fillRect(g.x, level, g.w, 1.2);
        ctx.fillStyle = GLASS.bubble;
        for (let b = 0; b < 8; b++) {
          const bt = (t * 5 + b / 8) % 1, br = 1.4 + (b % 3) * 0.7;
          const bx = g.x + g.w * (0.3 + 0.45 * ((b * 37) % 10) / 10), by = g.y + g.h - gap - 4 - bt * (g.y + g.h - gap - 4 - level);
          if (by > level + br + 1) { ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill(); }
        }
        ctx.restore();
      }
      /* The highlight: a bar down the left wall. A tube's carries on round its
         round bottom and tapers away; a beaker's stops above its flat floor. */
      const wb = Math.max(3, Math.min(7, g.w * 0.06)), xl = g.x + gap + 5, ra = rad - gap - 5;
      ctx.fillStyle = GLASS.shine;
      if (MODE !== 'mobile') {
        ctx.fillRect(xl, g.y + 6, wb, g.h - 6 - gap - 12);
      } else {
        ctx.fillRect(xl, g.y + 6, wb, cy - g.y - 6);
        ctx.save();
        ctx.beginPath(); ctx.rect(g.x, cy, rad * 1.15, rad + 2); ctx.clip();
        ctx.beginPath();
        ctx.arc(cx, cy, ra, 0, TAU);
        ctx.arc(cx + wb * 0.95, cy - wb * 0.3, ra, 0, TAU, true);
        ctx.fill('evenodd');
        ctx.restore();
      }
      // the glass: its outer face and its inner, open at the mouth (owner's drawing, 2026-09-19: no lip)
      hair(1); tubeLine(g, 0); ctx.stroke();
      hair(1); tubeLine(g, gap); ctx.stroke();
      if (MODE !== 'mobile') {                       // the base the beaker stands on
        const foot = beakerFoot(g), flare = beakerFlare(g);
        hair(1); rr(g.x - flare - 1, g.y + g.h - foot, g.w + 2 * (flare + 1), foot, foot / 2); ctx.stroke();
      }
      ctx.restore();
      if (active) {
        react.used.forEach((key, k) => {
          const r = tubeSlot(k), cc = centre(r);
          drawMolecule(key, cc.x, cc.y, fit(key, r.w, r.h), 0, 1 - easeOut(clamp01((now - react.t0) / 500)));
        });
      }
      tubeOrder = tubeOrder.filter((id) => st.pieces[id].zone === 'tube');
      tubeOrder.forEach((id, k) => {
        if (drag && drag.id === id) return;
        const r = tubeSlot(k), cc = centre(r), key = st.pieces[id].key;
        drawMolecule(key, cc.x, cc.y - 6, fit(key, r.w, r.h - 14), 0, 1);
        formulaChip(X.SPECIES[key].formula, cc.x, r.y + r.h - 8, 1, 12);
      });
    }

    /* FOUR OPEN SHELVES in a square (owner's drawing, 2026-09-19): each one an
       ink bracket, open at the top, with what the reaction made standing in it
       and its formula written underneath. */
    const TRAY_SLOTS = 4;
    function traySlotRect(k) {
      const cw = (tray.w - BENCH.cellGap) / 2, ch = (tray.h - BENCH.cellGap) / 2;
      return { x: tray.x + (k % 2) * (cw + BENCH.cellGap), y: tray.y + Math.floor(k / 2) * (ch + BENCH.cellGap), w: cw, h: ch };
    }
    const shelfBox = (r) => ({ x: r.x, y: r.y, w: r.w, h: r.h - BENCH.label });   // a shelf's room, above its label
    // what is actually drawn: the bracket's own arms and floor, which is what anything else must keep clear of
    const shelfDrawn = (r) => { const b = shelfBox(r), d = troughDepth(b); return { x: b.x, y: b.y + b.h - d, w: b.w, h: d }; };
    /* A trough, as the owner drew it: short straight sides, a flat floor and
       small corners, about a third as deep as it is wide. */
    const troughDepth = (b) => Math.round(Math.min(b.h * 0.42, b.w * 0.3));
    function bracketPath(r) {
      const b = shelfBox(r), d = troughDepth(b), rad = Math.min(11, d * 0.6), top = b.y + b.h - d;
      ctx.beginPath();
      ctx.moveTo(b.x, top);
      ctx.lineTo(b.x, b.y + b.h - rad);
      ctx.arcTo(b.x, b.y + b.h, b.x + rad, b.y + b.h, rad);
      ctx.lineTo(b.x + b.w - rad, b.y + b.h);
      ctx.arcTo(b.x + b.w, b.y + b.h, b.x + b.w, b.y + b.h - rad, rad);
      ctx.lineTo(b.x + b.w, top);
    }
    function drawTray(now) {
      ctx.save();
      ctx.strokeStyle = INK.wall; ctx.lineWidth = 1.3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (let k = 0; k < TRAY_SLOTS; k++) { bracketPath(traySlotRect(k)); ctx.stroke(); }
      ctx.restore();
      const appear = react ? clamp01((now - react.t0 - L.productsAt) / 250) : 1;
      /* A molecule stands IN its trough with nothing behind it: the paper is
         the background (owner, 2026-09-19). Its formula goes under the floor. */
      const stand = (key, r, alpha) => {
        const b = shelfBox(r), d = troughDepth(b);
        const cc = { x: b.x + b.w / 2, y: b.y + b.h - d + d * 0.3 };   // standing in the trough's mouth
        drawMolecule(key, cc.x, cc.y, fit(key, b.w - 10, b.h), 0, alpha);
        formulaChip(X.SPECIES[key].formula, cc.x, r.y + r.h - 5, alpha, 12, true);
      };
      if (react && now - react.t0 < 300) {
        const fade = 1 - (now - react.t0) / 300;
        for (const q of react.poured) stand(q.key, traySlotRect(q.slot), fade);
      }
      for (const p of st.pieces) {
        if (p.zone !== 'tray' || !traySlot.has(p.id) || (drag && drag.id === p.id)) continue;
        stand(p.key, traySlotRect(traySlot.get(p.id)), appear);
      }
      /* What the list wanted is counted where it lands, then flies up to the
         list, the way a finished molecule does in the dish. */
      for (const [id, c] of collected) {
        const t = (now - c.t0) / L.flyMs;
        if (t < 0 || t >= 1) continue;
        const p = st.pieces[id], r = traySlotRect(c.slot), b = shelfBox(r);
        const from = { x: b.x + b.w / 2, y: b.y + b.h * 0.56 };
        const to = targetSlots().find((f) => f.key === p.key) || from;
        const k = easeOut(t);
        drawMolecule(p.key, from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k,
                     fit(p.key, b.w - 12, b.h * 0.62) * (1 - 0.5 * k), 0, 1 - 0.2 * k);
      }
    }

    // The target row: each molecule drawn, its name and formula, and how many are made.
    function targetSlots() {
      const n = st.targets.length, out = [];
      ctx.save();
      ctx.font = '700 15px Inter, sans-serif';
      const nameOf = (t, long) => (long ? cap(X.SPECIES[t.key].name) + ' (' + X.SPECIES[t.key].formula + ')' : X.SPECIES[t.key].formula);
      if (MODE === 'mobile') {
        /* One size for the whole row: the biggest at which every molecule on the
           list fits its column, measured from its centre as it is drawn. */
        const colW = targetsArea.w / n, labelY = targetsArea.y + targetsArea.h - 12;
        const iconTop = targetsArea.y + 24, iconH = labelY - 16 - iconTop, across = (2 * L.atom) / L.bond;
        let unit = 40;
        for (const t of st.targets) {
          const at = X.SPECIES[t.key].atoms;
          const hx = Math.max(...at.map((a) => Math.abs(a.x))), hy = Math.max(...at.map((a) => Math.abs(a.y)));
          unit = Math.min(unit, (colW - 14) / (2 * hx + across), iconH / (2 * hy + across));
        }
        unit = Math.max(6, Math.floor(unit));
        st.targets.forEach((t, i) => {
          const cx = targetsArea.x + colW * (i + 0.5);
          out.push({ key: t.key, n: t.n, x: cx, y: iconTop + iconH / 2, unit, labelX: cx,
                     labelY, align: 'center', maxW: colW - 8, name: nameOf(t, false) });
        });
      } else {
        const unit = 12, gapItems = 34, labelGap = 12;
        const measure = (long) => {
          let total = 0;
          const parts = st.targets.map((t) => {
            const iw = (X.SPECIES[t.key].extent * 2 + 1) * unit, name = nameOf(t, long);
            const lw = ctx.measureText(name + '  ' + t.n + ' / ' + t.n).width;
            total += iw + labelGap + lw;
            return { t, iw, lw, name };
          });
          return { parts, total: total + gapItems * (n - 1) };
        };
        let m = measure(true);
        if (m.total > targetsArea.w) m = measure(false);
        let x = targetsArea.x + Math.max(0, (targetsArea.w - m.total) / 2);
        const y = targetsArea.y + 44;
        m.parts.forEach((p) => {
          out.push({ key: p.t.key, n: p.t.n, x: x + p.iw / 2, y, unit, labelX: x + p.iw + labelGap, labelY: y, align: 'left', maxW: p.lw + 10, name: p.name });
          x += p.iw + labelGap + p.lw + gapItems;
        });
      }
      ctx.restore();
      return out;
    }
    function drawTargets() {
      const slots = targetSlots();
      if (!slots[0]) { /* nothing to name */ }
      else if (MODE === 'mobile') label('MAKE', targetsArea.x + 2, slots[0].y);
      else label('MAKE', targetsArea.x, slots[0].labelY + 0.9);
      for (const f of slots) {
        const made = Math.min(f.n, st.made[f.key] || 0), full = made >= f.n;
        drawMolecule(f.key, f.x, f.y, f.unit, 0, 1);
        const text = f.name + '  ' + made + ' / ' + f.n;
        ctx.save();
        let size = MODE === 'mobile' ? 16 : 15;
        ctx.font = '700 ' + size + 'px Inter, sans-serif';
        while (size > 11 && ctx.measureText(text).width > f.maxW) { size -= 1; ctx.font = '700 ' + size + 'px Inter, sans-serif'; }
        ctx.fillStyle = full ? TOK.green : TOK.ink82;
        ctx.textAlign = f.align; ctx.textBaseline = 'middle';
        ctx.fillText(text, f.labelX, f.labelY);
        ctx.restore();
      }
    }

    function chip(text, at, tone, t0) { chips.push({ text, x: at.x, y: at.y, tone, t0 }); }
    function drawChips(now) {
      chips = chips.filter((c) => now - c.t0 < L.chipMs);
      for (const c of chips) {
        const t = now - c.t0;
        if (t < 0) continue;
        const al = t < 150 ? t / 150 : t > L.chipMs - 250 ? (L.chipMs - t) / 250 : 1;
        ctx.save();
        ctx.globalAlpha = al;
        ctx.font = '700 15px Inter, sans-serif';
        const w = Math.round(ctx.measureText(c.text).width + 28), h = 30;
        const x = Math.round(Math.max(8, Math.min(LW - 8 - w, c.x - w / 2))), y = Math.round(c.y - h / 2);
        ctx.fillStyle = TOK.card; rr(x, y, w, h, h / 2); ctx.fill();
        ctx.fillStyle = c.tone === 'amber' ? TOK.sun : c.tone === 'green' ? TOK.green : TOK.ink82;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(c.text, x + w / 2, y + h / 2 + 1);
        ctx.restore();
      }
    }
    /* The bench's headings, and the equation of the last reaction in their
       place while it shows: where the eye already is when the tube reacts.
       On a desktop it takes the PRODUCTS line; on a phone the whole row. */
    /* ---------- WORDS ON THE BENCH ----------
       The owner, 2026-09-15 and 2026-09-17: no names over the glassware; short
       lines instead, telling the player what each thing is for, centred over it
       and sitting on the page's rules. */
    /* Bold and in the page's darkest ink, so they read as instructions and not
       as captions; the lines of one label close together; and a clear gap
       above whatever they name (owner, 2026-09-19). */
    const WORD_SIZE = 14, WORD_LH = 16, WORD_FONT = '700 14px Inter, sans-serif';
    const TUBE_SIZE = 12, TUBE_FONT = '700 12px Inter, sans-serif';       // what is written inside the tube
    /* THE BENCH'S WORDS (owner, 2026-09-17): three short lines in the page's
       own hand, centred over what they name, their last line ON a rule and the
       line above it at seven tenths of the pitch — the leading the owner set. */
    function wrapBench(text, maxW, font) {
      ctx.save(); ctx.font = font || WORD_FONT;
      const lines = [];
      let line = '';
      for (const w of text.split(' ')) {
        const t = line ? line + ' ' + w : w;
        if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
      }
      if (line) lines.push(line);
      ctx.restore();
      return lines;
    }
    /* Two lines over the target glass and one over the tube on a desktop, as the
       owner set them; on a phone, or in any window too narrow for that, they
       break to fit the column they stand over. */
    const WORDS = {
      tube: (avail) => wrapBench('Place reactants here', avail, TUBE_FONT),
      tray: () => ['Products'],
    };
    function wordBox(lines, cx, base, lo, hi, font, size) {
      const f = font || WORD_FONT, sz = size || WORD_SIZE, lh = size ? size + 3 : WORD_LH;
      ctx.save(); ctx.font = f;
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
      ctx.restore();
      const x = Math.max(lo + widest / 2, Math.min(hi - widest / 2, cx));
      const top = base - (lines.length - 1) * lh - sz * 0.8;
      return { lines, x, base, font: f, lh, size: sz, box: { x: x - widest / 2, y: top, w: widest, h: base + 3 - top, lines: lines.slice() } };
    }
    /* Two sets of words now (owner, 2026-09-19): what to do, written inside
       the empty tube, and the heading over the shelves. */
    function wordPlan() {
      const g = tubeGlass();
      const inside = wordBox(WORDS.tube(g.w - 14), g.x + g.w / 2, g.y + g.h * 0.62, g.x, g.x + g.w, TUBE_FONT, TUBE_SIZE);
      const heading = wordBox(WORDS.tray(), tray.x + tray.w / 2, wordBase.tray, tray.x - 30, tray.x + tray.w + 30);
      return { tube: inside, tray: heading };
    }
    function drawWords(w) {
      ctx.save();
      ctx.font = w.font; ctx.fillStyle = TOK.ink90;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      w.lines.forEach((l, i) => ctx.fillText(l, w.x, w.base - (w.lines.length - 1 - i) * w.lh - w.size * 0.3013));
      ctx.restore();
    }

    function drawHeadings(now) {
      const t = react ? now - react.t0 : 1e9, on = t < L.eqMs;
      const al = !on ? 0 : t < 200 ? t / 200 : t > L.eqMs - 400 ? (L.eqMs - t) / 400 : 1;
      const eq = (x, y, w) => {
        ctx.save();
        ctx.globalAlpha = al;
        let size = 15;
        ctx.font = '700 ' + size + 'px Inter, sans-serif';
        while (size > 11 && ctx.measureText(react.eq).width > w) { size -= 1; ctx.font = '700 ' + size + 'px Inter, sans-serif'; }
        ctx.fillStyle = TOK.white; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(react.eq, x, y);
        ctx.restore();
      };
      const plan = wordPlan();
      // what to do is written inside the tube, and clears out as soon as anything is in it
      if (!st.pieces.some((q) => q.zone === 'tube') && !(react && now - react.t0 < L.reactMs)) drawWords(plan.tube);
      // the equation takes the heading's line, and on a desktop the whole column's width so it reads at full size
      if (on) eq(tray.x, wordBase.tray, MODE === 'mobile' ? tray.w : tube.w);
      else drawWords(plan.tray);
    }

    function heldCentre() { return drag ? { x: drag.x + drag.ox, y: drag.y + drag.oy } : { x: -1e4, y: -1e4 }; }
    function drawHeld() {
      if (!drag) return;
      const c = heldCentre(), key = st.pieces[drag.id].key;
      const u = unitPx();
      drawMolecule(key, c.x, c.y, u, 0, 1);
      formulaChip(X.SPECIES[key].formula, c.x, c.y + lowest(key, u, 0) + u * 0.32 + 14);
    }

    function render(now) {
      if (!st) return;
      if (react && !react.explained && now - react.t0 >= L.reactMs) openCard(react.reaction, react.eq, now);
      drawTargets();
      drawDish(now);
      drawTube(now);
      drawTray(now);
      drawHeadings(now);
      drawChips(now);
      drawHeld();
    }

    /* ---------- THE REACTION CARD ----------
       The owner, 2026-09-15: "each complete reaction will give a modal that
       tells you the reaction with animations. (there could be a skip button
       on this)". When the tube's colours are done, a card shows the reaction:
       its name; the two molecules that went in coming apart, their atoms
       flying across and joining up as the products, so it is plain every
       atom is kept; the equation; and what happened, in plain words. Skip
       closes it at any time, and once the atoms have landed it says CONTINUE.
       A level the reaction ended waits for the card to close. */
    const CARD = { stillMs: 700, breakMs: 350, flyMs: 1200, formMs: 350 };
    const cardMs = () => CARD.stillMs + CARD.breakMs + CARD.flyMs + CARD.formMs;
    let modal = null, pendingEnd = null, modalBtn = null, modalBox = null;
    const UI = window.ZAM_UI;
    function openCard(reaction, eq, now) {
      if (react) react.explained = true;
      const e = X.explain(reaction.a, reaction.b) || { title: 'Reaction', words: '' };
      modal = { t0: now, a: reaction.a, b: reaction.b, products: reaction.products.slice(), title: e.title, words: e.words, eq, press: false };
    }
    function closeCard() {
      modal = null;
      if (pendingEnd) { const r = pendingEnd; pendingEnd = null; host.endLevel(r, clock() + 400); }
    }
    function wrapWords(text, maxW) {
      const lines = [];
      let line = '';
      for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
      if (line) lines.push(line);
      return lines;
    }
    function cardLayout() {
      const pw = Math.min(LW - (MODE === 'mobile' ? 28 : 56), 560), stageH = MODE === 'mobile' ? 132 : 150;
      ctx.save(); ctx.font = '600 16px Inter, sans-serif';
      const words = wrapWords(modal.words, pw - 48);
      ctx.restore();
      const ph = Math.min(LH - 20, 64 + stageH + 40 + words.length * 23 + 22 + 76);
      const px = Math.round((LW - pw) / 2), py = Math.max(10, Math.round((LH - ph) / 2));
      return { px, py, pw, ph, words, stage: { x: px + 16, y: py + 64, w: pw - 32, h: stageH } };
    }
    // Where each molecule of the reaction sits on the stage: what went in at the left, what came out at the right.
    function stageSpots(S) {
      const ins = [modal.a, modal.b], outs = modal.products, chipRoom = 30;
      const slot = (list, x0, x1) => list.map((key, i) => ({ key, x: x0 + (x1 - x0) * (i + 0.5) / list.length, y: S.y + (S.h - chipRoom) / 2, w: (x1 - x0) / list.length }));
      const left = slot(ins, S.x, S.x + S.w * 0.44), right = slot(outs, S.x + S.w * 0.56, S.x + S.w);
      const unit = Math.min(...left.concat(right).map((q) => fit(q.key, q.w - 2, S.h - chipRoom - 4)));
      return { left, right, unit, chipY: S.y + S.h - chipRoom / 2 };
    }
    const atomsAt = (spots, unit) => spots.flatMap((q) => X.SPECIES[q.key].atoms.map((a) => ({ el: a.el, x: q.x + a.x * unit, y: q.y + a.y * unit })));
    // Each atom that went in, matched to an atom of the same element that came out, nearest first.
    function pairAtoms(from, to) {
      const cand = [];
      from.forEach((f, i) => to.forEach((t, j) => { if (f.el === t.el) cand.push([Math.hypot(f.x - t.x, f.y - t.y), i, j]); }));
      cand.sort((p, q) => p[0] - q[0]);
      const fi = new Set(), tj = new Set(), pairs = [];
      for (const [, i, j] of cand) { if (fi.has(i) || tj.has(j)) continue; fi.add(i); tj.add(j); pairs.push([from[i], to[j]]); }
      return pairs;
    }
    function drawStage(S, t) {
      const Z = stageSpots(S), still = host.reduced() ? cardMs() : t;
      const t1 = CARD.stillMs, t2 = t1 + CARD.breakMs, t3 = t2 + CARD.flyMs, t4 = t3 + CARD.formMs;
      ctx.save();
      ctx.fillStyle = TOK.ink72; ctx.font = '700 22px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // the plus in the gap between the two molecules that went in, not between their middles
      const reach = (key, side) => Math.max(...X.SPECIES[key].atoms.map((a) => side * a.x)) * Z.unit + Z.unit * L.atom / L.bond;
      if (Z.left.length > 1) ctx.fillText('+', ((Z.left[0].x + reach(Z.left[0].key, 1)) + (Z.left[1].x - reach(Z.left[1].key, -1))) / 2, Z.left[0].y);
      ctx.fillText('→', S.x + S.w * 0.5, Z.left[0].y);
      ctx.restore();
      // what went in fades as its atoms leave, and comes back faintly at the end, so the card reads as the whole equation
      const inAlpha = still < t1 ? 1 : still < t3 ? 1 - clamp01((still - t1) / CARD.breakMs) : 0.3 * clamp01((still - t3) / CARD.formMs);
      const outAlpha = clamp01((still - t3) / CARD.formMs);
      Z.left.forEach((q) => { if (inAlpha > 0) drawMolecule(q.key, q.x, q.y, Z.unit, 0, inAlpha); });
      Z.right.forEach((q) => { if (outAlpha > 0) drawMolecule(q.key, q.x, q.y, Z.unit, 0, outAlpha); });
      if (still > t1 && still < t4) {
        const k = easeInOut(clamp01((still - t2) / CARD.flyMs));
        const bare = clamp01((still - t1) / CARD.breakMs) * (1 - clamp01((still - t3) / CARD.formMs));
        const items = pairAtoms(atomsAt(Z.left, Z.unit), atomsAt(Z.right, Z.unit)).map(([f, g]) => ({
          el: f.el, x: f.x + (g.x - f.x) * k, y: f.y + (g.y - f.y) * k - Math.sin(Math.PI * k) * S.h * 0.12, alpha: bare, label: false, bonds: [], free: [],
        }));
        drawAtoms(items, Math.max(1.5, Z.unit * L.atom / L.bond));
      }
      Z.left.forEach((q) => formulaChip(X.SPECIES[q.key].formula, q.x, Z.chipY, 1, 12));
      Z.right.forEach((q) => formulaChip(X.SPECIES[q.key].formula, q.x, Z.chipY, outAlpha, 12));
    }
    function renderModal(now) {
      modalBtn = null; modalBox = null;
      if (!modal) return;
      const M = cardLayout(), t = now - modal.t0, done = host.reduced() || t >= cardMs();
      ctx.save();
      ctx.fillStyle = TOK.scrim; ctx.fillRect(0, 0, LW, LH);
      ctx.fillStyle = TOK.card; rr(M.px, M.py, M.pw, M.ph, 22); ctx.fill();
      ctx.strokeStyle = TOK.tint12; ctx.lineWidth = 1; rr(M.px + 0.5, M.py + 0.5, M.pw - 1, M.ph - 1, 22); ctx.stroke();
      let size = 28;
      ctx.font = '800 ' + size + 'px Inter, sans-serif';
      while (size > 20 && ctx.measureText(modal.title).width > M.pw - 48) { size -= 1; ctx.font = '800 ' + size + 'px Inter, sans-serif'; }
      ctx.fillStyle = TOK.white; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(modal.title, M.px + M.pw / 2, M.py + 38);
      ctx.restore();
      drawStage(M.stage, t);
      ctx.save();
      const eqY = M.stage.y + M.stage.h + 22;
      size = 17;
      ctx.font = '700 ' + size + 'px Inter, sans-serif';
      while (size > 13 && ctx.measureText(modal.eq).width > M.pw - 40) { size -= 1; ctx.font = '700 ' + size + 'px Inter, sans-serif'; }
      ctx.fillStyle = TOK.white; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(modal.eq, M.px + M.pw / 2, eqY);
      ctx.font = '600 16px Inter, sans-serif'; ctx.fillStyle = TOK.ink82;
      M.words.forEach((line, i) => ctx.fillText(line, M.px + M.pw / 2, eqY + 30 + i * 23));
      ctx.restore();
      const by = M.py + M.ph - 40;
      modalBtn = done ? UI.drawCTA(ctx, 'CONTINUE', M.px + M.pw / 2, by, TOK.accent) : UI.drawPill(ctx, 'Skip', M.px + M.pw / 2, by, {});
      modalBox = { x: M.px, y: M.py, w: M.pw, h: M.ph, wordsBottom: eqY + 30 + (M.words.length - 1) * 23 + 11 };
    }
    // While the card is up it takes every press; only its button does anything.
    function modalDown(p) {
      if (!modal) return false;
      modal.press = !!(modalBtn && inside(p, grow(modalBtn, 6)));
      return true;
    }
    function modalUp(p) {
      if (!modal) return false;
      if (modal.press && modalBtn && inside(p, grow(modalBtn, 6))) closeCard();
      else modal.press = false;
      return true;
    }

    /* ---------- INPUT ----------
       Press a molecule to lift it: on the tray, in the tube, or in the dish.
       Let it go over the tube or the dish. Anywhere else, it stays
       where it was. */
    function hit(p) {
      const shelfReady = !react || clock() - react.t0 >= L.productsAt;
      for (const piece of st.pieces) {
        if (shelfReady && piece.zone === 'tray' && traySlot.has(piece.id) && inside(p, traySlotRect(traySlot.get(piece.id)))) return { id: piece.id, from: 'tray' };
      }
      for (let k = 0; k < tubeOrder.length; k++) {
        if (inside(p, tubeSlot(k))) return { id: tubeOrder[k], from: 'tube' };
      }
      let best = null;
      for (const piece of st.pieces) {
        if (piece.zone !== 'dish' || !pos.has(piece.id)) continue;
        const c = dishPx(pos.get(piece.id)), rad = Math.max(24, (X.SPECIES[piece.key].extent * D.bond + D.atom) * D.S + 6);
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d <= rad && (!best || d < best.d)) best = { id: piece.id, from: 'dish', d, c };
      }
      return best;
    }
    function down(p, e) {
      if (!st || st.result || drag) return false;
      const h = hit(p);
      if (!h) return false;
      const touch = e.pointerType !== 'mouse';
      drag = { id: h.id, from: h.from, pid: e.pointerId, touch, x: p.x, y: p.y,
               ox: h.from === 'dish' ? h.c.x - p.x : 0, oy: h.from === 'dish' ? h.c.y - p.y : (touch ? -L.touchLift : 0) };
      if (e.pointerId != null && e.pointerId >= 0) { try { host.canvas.setPointerCapture(e.pointerId); } catch (_) { /* not every browser lets a canvas capture */ } }
      SND.pick();
      return true;
    }
    function move(p, e) {
      if (!drag || e.pointerId !== drag.pid) return false;
      drag.x = p.x; drag.y = p.y;
      return true;
    }
    function up(p, e) {
      if (!drag || e.pointerId !== drag.pid) return false;
      drag.x = p.x; drag.y = p.y;
      drop(clock());
      return true;
    }
    function cancel() { drag = null; }

    function drop(now) {
      const d = drag;
      drag = null;
      const c = { x: d.x + d.ox, y: d.y + d.oy };
      if (inside(c, grow(tube, 14))) return intoTube(d.id, now);
      if (inside(c, D)) return intoDish(d.id, c);
      return null;
    }
    function equation(r) {
      const f = (k) => X.SPECIES[k].formula, out = [];
      r.products.forEach((k) => { const e = out.find((q) => q.k === k); if (e) e.n++; else out.push({ k, n: 1 }); });
      return f(r.a) + ' + ' + f(r.b) + '  →  ' + out.map((q) => (q.n > 1 ? q.n + ' ' : '') + f(q.k)).join(' + ');
    }
    function intoTube(id, now) {
      if (react && now - react.t0 < L.reactMs) {
        chip('still reacting', { x: centre(tube).x, y: tube.y + 20 }, 'grey', now);
        return { ok: false, why: 'reacting' };
      }
      const from = st.pieces[id].zone, slots = new Map(traySlot);
      const ev = X.toTube(st, id);
      if (!ev.ok) {
        chip(ev.why === 'full' ? 'the tube holds two' : 'not now', { x: centre(tube).x, y: tube.y + 20 }, 'grey', now);
        return ev;
      }
      if (from === 'dish') pos.delete(id);
      traySlot.delete(id);
      tubeOrder.push(id);
      if (ev.reaction) {
        const used = tubeOrder.slice();
        react = { t0: now, used: used.map((i) => st.pieces[i].key), poured: ev.poured.map((i) => ({ key: st.pieces[i].key, slot: slots.get(i) || 0 })),
                  eq: equation(ev.reaction), reaction: ev.reaction, explained: false };
        tubeOrder = [];
        traySlot.clear(); collected.clear();
        ev.products.forEach((pid, k) => traySlot.set(pid, k));
        // what the list wanted flies up to it as soon as it lands, before the card explains the reaction
        (ev.collected || []).forEach((pid) => { collected.set(pid, { slot: traySlot.get(pid), t0: now + L.productsAt + 40 }); traySlot.delete(pid); });
        SND.clasp(ev.reaction.products.length);
        setTimeout(SND.lift, L.productsAt);
        if (ev.lost) { chip('lost a molecule', { x: centre(tray).x, y: tray.y + tray.h + 6 }, 'amber', now + L.productsAt); setTimeout(SND.lost, L.productsAt + 80); }
        if (ev.result) pendingEnd = ev.result;
      } else if (ev.noReaction) {
        chip('no reaction', { x: centre(tube).x, y: tube.y + 20 }, 'grey', now);
        SND.set();
      } else {
        SND.set();
      }
      return ev;
    }
    function intoDish(id, c) {
      const piece = st.pieces[id];
      const w = { x: (c.x - D.x) / D.S, y: (c.y - D.y) / D.S };
      if (piece.zone === 'dish') {
        const q = pos.get(id);
        if (q) { q.x = w.x; q.y = w.y; q.vx = 0; q.vy = 0; }
        return { ok: true };
      }
      if (!X.toDish(st, id)) return { ok: false };
      traySlot.delete(id);
      tubeOrder = tubeOrder.filter((q) => q !== id);
      pos.set(id, { x: w.x, y: w.y, th: 0, vx: 0, vy: 0, w: 0 });
      SND.set();
      return { ok: true };
    }

    /* ---------- FOR TESTS AND STILL FRAMES ---------- */
    const debug = {
      state() {
        return {
          pieces: st.pieces.map((p) => ({ id: p.id, key: p.key, zone: p.zone, slot: traySlot.has(p.id) ? traySlot.get(p.id) : null })),
          tube: tubeOrder.slice(), made: Object.assign({}, st.made), result: st.result,
          lost: st.analysis.lost, best: st.analysis.best, reacting: !!(react && clock() - react.t0 < L.reactMs), dragging: drag ? drag.id : -1,
          reactionCard: modal ? modal.title : null,
        };
      },
      geom() {
        const pieces = {};
        for (const p of st.pieces) {
          if (p.zone === 'dish' && pos.has(p.id)) pieces[p.id] = dishPx(pos.get(p.id));
          else if (p.zone === 'tray' && traySlot.has(p.id)) pieces[p.id] = centre(traySlotRect(traySlot.get(p.id)));
          else if (p.zone === 'tube') { const k = tubeOrder.indexOf(p.id); if (k >= 0) pieces[p.id] = centre(tubeSlot(k)); }
        }
        // every marble in the dish, where it is painted, for the contrast check
        const atoms = [], u = unitPx();
        for (const p of st.pieces) {
          if (p.zone !== 'dish' || !pos.has(p.id)) continue;
          const c = dishPx(pos.get(p.id)), q = pos.get(p.id), co = Math.cos(q.th), sn = Math.sin(q.th);
          for (const a of X.SPECIES[p.key].atoms) {
            atoms.push({ el: a.el, x: c.x + (a.x * co - a.y * sn) * u, y: c.y + (a.x * sn + a.y * co) * u });
          }
        }
        return { dish: Object.assign({}, D), tube: Object.assign({}, tube), tray: Object.assign({}, tray),
                 traySlots: [0, 1, 2, 3].map(traySlotRect), tubeSlots: [0, 1].map(tubeSlot), targets: targetSlots(), targetsArea: Object.assign({}, targetsArea), pieces, atoms,
                 marble: Math.max(1.5, u * D.atom / D.bond),
                 words: (() => { const w = wordPlan(); return { tube: w.tube.box, tray: w.tray.box }; })(),
                 glass: tubeGlass(), shelves: [0, 1, 2, 3].map((k) => shelfDrawn(traySlotRect(k))), shelfRoom: [0, 1, 2, 3].map((k) => shelfBox(traySlotRect(k))),
                 reactionCard: modal ? { box: modalBox, button: modalBtn } : null };
      },
      // Straight to a place, through the same code a drop uses.
      act(where, id, x, y) {
        const now = clock();
        if (where === 'tube') return intoTube(id, now);
        if (where === 'dish') return intoDish(id, { x: x == null ? D.x + D.w / 2 : x, y: y == null ? D.y + D.h / 2 : y });
        return null;
      },
      // The card for any reaction, as if the tube had just run it: for the sweeps and still frames.
      showCard(a, b) { const r = X.reactionFor(a, b); if (r) openCard(r, equation(r), clock()); return !!r; },
      closeCard() { if (modal) closeCard(); },
      find(key) {
        return (st.pieces.find((p) => p.key === key && p.zone === 'tray') || st.pieces.find((p) => p.key === key && p.zone === 'dish') || {}).id;
      },
    };

    return {
      load, layout, step, render, renderModal, modalDown, modalUp, down, move, up, cancel, debug,
      modalOpen: () => !!modal,
      lost: () => (st ? st.analysis.lost : 0),
      result: () => (st ? st.result : null),
      dragging: () => !!drag,
    };
  };
})();
