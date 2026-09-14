/* ============================================================
   Lessons in Chemistry · chapter 2, reactions: the bench

   The dish floats whole molecules, each with its formula under it. Drag two
   into the test tube; if they react, what they make lands on the tray. Drag
   the molecule the list wants into the beaker, and a byproduct a later step
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
    const { ctx, TOK, drawAtoms, feather, rr, label, SND, clock } = host;
    const TAU = Math.PI * 2;
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    const grow = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
    const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

    /* Distances in the dish are in world units, as chapter 1's are: a bond is
       1.9, an atom's radius 0.58. Molecules drift slowly, turn a little and
       settle back upright, so a formula always reads the right way up. */
    const L = {
      bond: 1.9, atom: 0.58, labelRoom: 1.5,
      worldW: { desktop: 26, mobile: 22 }, maxScale: 22,
      drift: 0.3, spin: 0.2, tau: 3,
      reactMs: 750, productsAt: 450, chipMs: 1900, eqMs: 3400, dropMs: 600,
      touchLift: 36,
    };

    let level = null, st = null, MODE = 'desktop', LW = 760, LH = 600;
    const pos = new Map();          // dish piece id -> { x, y, th, vx, vy, w }
    const traySlot = new Map();     // tray piece id -> slot 0..2
    let tubeOrder = [];             // tube piece ids, in the order they went in
    let drag = null;                // { id, from, pid, touch, x, y, ox, oy }
    let react = null;               // { t0, used: [key], poured: [{ key, slot }], eq }
    let chips = [], dropped = [];
    const D = { x: 0, y: 0, w: 0, h: 0, S: 16, WW: 26, WH: 26 };
    let tube = { x: 0, y: 0, w: 0, h: 0 }, tray = { x: 0, y: 0, w: 0, h: 0 }, beaker = { x: 0, y: 0, w: 0, h: 0 };
    let targetsArea = { x: 0, y: 0, w: 0, h: 0 };

    function gauss() { const u = 1 - host.rng(), v = host.rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }
    const radiusOf = (key) => X.SPECIES[key].extent * L.bond + L.atom + 0.35;
    const unitPx = () => Math.round(L.bond * D.S * 2) / 2;

    /* ---------- LAYOUT ----------
       Desktop 760x600: the dish on the left, and the bench as a column on the
       right, tube above tray above beaker. Phone: the dish, then the bench as
       one strip, tube, tray and beaker side by side, above the controls. */
    function layout() {
      ({ LW, LH, MODE } = host.size());
      const oldW = D.WW, oldH = D.WH;
      if (MODE === 'mobile') {
        const top = 64, bot = 96, short = LH < 700;
        const flaskH = short ? 70 : 84, benchH = short ? 150 : 176, gap = short ? 8 : 12;
        targetsArea = { x: 16, y: top - 4, w: LW - 32, h: flaskH };
        D.x = 14; D.w = LW - 28; D.y = top + flaskH + gap;
        const benchY = LH - bot - benchH - 4;
        D.h = Math.max(120, benchY - gap - D.y);
        const w = LW - 28, tw = Math.round(w * 0.24), bw = Math.round(w * 0.26), gutter = 8;
        tube = { x: 14, y: benchY + 20, w: tw, h: benchH - 24 };
        tray = { x: 14 + tw + gutter, y: benchY + 20, w: w - tw - bw - gutter * 2, h: benchH - 24 };
        beaker = { x: LW - 14 - bw, y: benchY + 20, w: bw, h: benchH - 24 };
        D.S = Math.min(L.maxScale, D.w / L.worldW.mobile);
      } else {
        targetsArea = { x: 30, y: 58, w: LW - 60, h: 74 };
        D.x = 30; D.y = 140; D.w = 420; D.h = LH - 20 - 140;
        const cx = D.x + D.w + 18, cw = LW - 30 - cx;
        tube = { x: cx, y: 162, w: cw, h: 182 };
        tray = { x: cx, y: 370, w: cw, h: 94 };
        beaker = { x: cx, y: 490, w: cw, h: 90 };
        D.S = Math.min(L.maxScale, D.w / L.worldW.desktop);
      }
      D.WW = D.w / D.S; D.WH = D.h / D.S;
      if (pos.size && oldW && (Math.abs(oldW - D.WW) > 1e-6 || Math.abs(oldH - D.WH) > 1e-6)) {
        for (const q of pos.values()) { q.x *= D.WW / oldW; q.y *= D.WH / oldH; }
      }
    }

    /* ---------- LOADING ---------- */
    function load(lv) {
      level = lv;
      st = X.createLab(lv);
      pos.clear(); traySlot.clear(); tubeOrder = [];
      drag = null; react = null; chips = []; dropped = [];
      layout();
      const r = host.mulberry(lv.seed * 7919 + 5), placed = [];
      for (const p of st.pieces) {
        const rad = radiusOf(p.key);
        let got = null;
        for (let t = 0; t < 3000 && !got; t++) {
          const slack = t > 2000 ? 0.1 : t > 1000 ? 0.4 : 0.9;
          const x = rad + r() * Math.max(0.1, D.WW - 2 * rad), y = rad + r() * Math.max(0.1, D.WH - 2 * rad - L.labelRoom);
          if (placed.every((q) => Math.hypot(q.x - x, q.y - y) >= q.rad + rad + slack)) got = { x, y };
        }
        if (!got) got = { x: rad + r() * Math.max(0.1, D.WW - 2 * rad), y: rad + r() * Math.max(0.1, D.WH - 2 * rad - L.labelRoom) };
        placed.push({ x: got.x, y: got.y, rad });
        pos.set(p.id, { x: got.x, y: got.y, th: (r() - 0.5) * 0.8, vx: 0, vy: 0, w: 0 });
      }
    }

    /* ---------- MOTION ---------- */
    function step(dt) {
      if (!st) return;
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
          const q = pos.get(p.id), rad = radiusOf(p.key);
          q.x = Math.max(rad, Math.min(D.WW - rad, q.x));
          q.y = Math.max(rad, Math.min(D.WH - rad - L.labelRoom, q.y));
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
      drawAtoms(items, Math.max(1.5, unit * L.atom / L.bond));
    }
    // The largest bond length that fits a molecule in a w x h box, capped at the dish's own.
    function fit(key, w, h) {
      const e = X.SPECIES[key].extent;
      return Math.max(3, Math.min(unitPx(), Math.min(w, h) / (2 * e + 1.4)));
    }
    function formulaChip(text, x, y, alpha, size) {
      ctx.save();
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      const fs = size || 13;
      ctx.font = '700 ' + fs + 'px Inter, sans-serif';
      const w = Math.round(ctx.measureText(text).width + 14), h = fs + 9;
      ctx.fillStyle = 'rgba(19,31,54,0.88)';                         // --bg-card
      rr(Math.round(x - w / 2), Math.round(y - h / 2), w, h, h / 2); ctx.fill();
      ctx.fillStyle = TOK.ink92; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + 1);
      ctx.restore();
    }
    function glassRect(r, radius) {
      ctx.save();
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, 'rgba(255,255,255,0.09)'); g.addColorStop(0.2, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0.04)');
      ctx.fillStyle = g; rr(r.x, r.y, r.w, r.h, radius); ctx.fill();
      const ix = r.x + 7, iy = r.y + 7, iw = r.w - 14, ih = r.h - 14;
      const glass = ctx.createLinearGradient(0, iy, 0, iy + ih);
      glass.addColorStop(0, '#0C1424'); glass.addColorStop(1, '#0A1120');
      ctx.fillStyle = glass; rr(ix, iy, iw, ih, Math.max(4, radius - 7)); ctx.fill();
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

    // The test tube: a glass tube, round at the bottom, holding at most two.
    function tubeGlass() {
      const gw = Math.min(MODE === 'mobile' ? tube.w - 8 : 104, tube.w - 8), gh = tube.h - 4;
      return { x: tube.x + (tube.w - gw) / 2, y: tube.y + 2, w: gw, h: gh };
    }
    function tubeSlot(k) {
      const g = tubeGlass();
      return { x: g.x + 4, y: g.y + 8 + k * (g.h - 16) / 2, w: g.w - 8, h: (g.h - 16) / 2 };
    }
    function drawTube(now) {
      const g = tubeGlass(), rad = g.w / 2;
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(g.x, g.y);
        ctx.lineTo(g.x, g.y + g.h - rad);
        ctx.arc(g.x + rad, g.y + g.h - rad, rad, Math.PI, 0, true);
        ctx.lineTo(g.x + g.w, g.y);
        ctx.closePath();
      };
      ctx.save();
      const fill = ctx.createLinearGradient(g.x, 0, g.x + g.w, 0);
      fill.addColorStop(0, 'rgba(255,255,255,0.10)'); fill.addColorStop(0.25, 'rgba(255,255,255,0.04)'); fill.addColorStop(1, 'rgba(255,255,255,0.06)');
      ctx.fillStyle = fill; path(); ctx.fill();
      const active = react && now - react.t0 < L.reactMs;
      if (drag && inside(heldCentre(), grow(tube, 14))) { ctx.fillStyle = 'rgba(93,211,158,0.10)'; path(); ctx.fill(); }
      if (active) {
        const t = (now - react.t0) / L.reactMs;
        ctx.save(); path(); ctx.clip();
        feather(g.x + g.w / 2, g.y + g.h * 0.62, g.w * 0.2, g.h * 0.7, '255,246,220', 0.35 * Math.sin(Math.PI * t));
        for (let b = 0; b < 9; b++) {
          const bt = (t * 1.6 + b / 9) % 1;
          const bx = g.x + g.w * (0.2 + 0.6 * ((b * 37) % 10) / 10), by = g.y + g.h * (1 - bt);
          ctx.globalAlpha = 0.5 * (1 - bt); ctx.fillStyle = '#FFF6DC';
          ctx.beginPath(); ctx.arc(bx, by, 2 + (b % 3), 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();
      if (active) {
        const t = (now - react.t0) / L.reactMs;
        react.used.forEach((key, k) => {
          const r = tubeSlot(k), cc = centre(r);
          drawMolecule(key, cc.x, cc.y, fit(key, r.w, r.h), 0, 1 - easeOut(clamp01(t / 0.7)));
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

    function traySlotRect(k) {
      const n = 3, gap = 6, sw = (tray.w - gap * (n - 1)) / n;
      return { x: tray.x + k * (sw + gap), y: tray.y, w: sw, h: tray.h };
    }
    function drawTray(now) {
      for (let k = 0; k < 3; k++) {
        const r = traySlotRect(k);
        ctx.save(); ctx.fillStyle = TOK.tint03; rr(r.x, r.y, r.w, r.h, 12); ctx.fill(); ctx.restore();
      }
      const appear = react ? clamp01((now - react.t0 - L.productsAt) / 250) : 1;
      if (react && now - react.t0 < 300) {
        const fade = 1 - (now - react.t0) / 300;
        for (const q of react.poured) {
          const r = traySlotRect(q.slot), cc = centre(r);
          drawMolecule(q.key, cc.x, cc.y - 8, fit(q.key, r.w - 8, r.h - 26), 0, fade);
        }
      }
      for (const p of st.pieces) {
        if (p.zone !== 'tray' || !traySlot.has(p.id) || (drag && drag.id === p.id)) continue;
        const r = traySlotRect(traySlot.get(p.id)), cc = centre(r);
        drawMolecule(p.key, cc.x, cc.y - 8, fit(p.key, r.w - 8, r.h - 26), 0, appear);
        formulaChip(X.SPECIES[p.key].formula, cc.x, r.y + r.h - 12, appear, 12);
      }
    }

    function drawBeaker(now) {
      const bw = Math.min(beaker.w - 8, MODE === 'mobile' ? beaker.w - 8 : 150), bh = beaker.h - 4;
      const x = beaker.x + (beaker.w - bw) / 2, y = beaker.y + 2;
      ctx.save();
      const g = ctx.createLinearGradient(x, 0, x + bw, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.3, 'rgba(255,255,255,0.04)'); g.addColorStop(1, 'rgba(255,255,255,0.06)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + bw * 0.06, y + bh - 10);
      ctx.quadraticCurveTo(x + bw * 0.07, y + bh, x + bw * 0.16, y + bh);
      ctx.lineTo(x + bw * 0.84, y + bh); ctx.quadraticCurveTo(x + bw * 0.93, y + bh, x + bw * 0.94, y + bh - 10);
      ctx.lineTo(x + bw, y); ctx.closePath(); ctx.fill();
      if (drag && inside(heldCentre(), grow(beaker, 14))) { ctx.fillStyle = 'rgba(93,211,158,0.10)'; ctx.fill(); }
      ctx.restore();
      const inBeaker = st.pieces.filter((p) => p.zone === 'beaker');
      inBeaker.slice(-3).forEach((p, k, arr) => {
        const fx = dropped.find((d) => d.id === p.id);
        const t = fx ? clamp01((now - fx.t0) / L.dropMs) : 1;
        const cx = x + bw * (arr.length === 1 ? 0.5 : 0.22 + 0.56 * k / (arr.length - 1));
        const cy = y + bh * 0.62 - (1 - easeOut(t)) * bh * 0.7;
        drawMolecule(p.key, cx, cy, fit(p.key, bw / 3, bh * 0.6), 0, 0.4 + 0.6 * t);
      });
    }

    // The target row: each molecule drawn, its name and formula, and how many are made.
    function targetSlots() {
      const n = st.targets.length, out = [];
      ctx.save();
      ctx.font = '700 15px Inter, sans-serif';
      const nameOf = (t, long) => (long ? cap(X.SPECIES[t.key].name) + ' (' + X.SPECIES[t.key].formula + ')' : X.SPECIES[t.key].formula);
      if (MODE === 'mobile') {
        const colW = targetsArea.w / n, unit = 11;
        st.targets.forEach((t, i) => {
          const cx = targetsArea.x + colW * (i + 0.5);
          out.push({ key: t.key, n: t.n, x: cx, y: targetsArea.y + (targetsArea.h - 24) / 2, unit, labelX: cx,
                     labelY: targetsArea.y + targetsArea.h - 12, align: 'center', maxW: colW - 8, name: nameOf(t, false) });
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
      if (MODE === 'mobile') label('MAKE', 30, 32);
      else if (slots[0]) label('MAKE', Math.round(slots[0].x - X.SPECIES[slots[0].key].extent * slots[0].unit - 6), targetsArea.y + 12);
      for (const f of slots) {
        const made = Math.min(f.n, st.made[f.key] || 0), full = made >= f.n;
        drawMolecule(f.key, f.x, f.y, f.unit, 0, 1);
        const text = f.name + '  ' + made + ' / ' + f.n;
        ctx.save();
        let size = 15;
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
      if (MODE === 'mobile') {
        if (on) { eq(tube.x, tube.y - 9, beaker.x + beaker.w - tube.x); return; }
        label('TEST TUBE', tube.x, tube.y - 9); label('PRODUCTS', tray.x, tray.y - 9); label('BEAKER', beaker.x, beaker.y - 9);
        return;
      }
      label('TEST TUBE', tube.x, tube.y - 9);
      label('BEAKER', beaker.x, beaker.y - 9);
      if (on) eq(tray.x, tray.y - 9, tray.w);
      else label('PRODUCTS', tray.x, tray.y - 9);
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
      drawTargets();
      drawDish(now);
      drawTube(now);
      drawTray(now);
      drawBeaker(now);
      drawHeadings(now);
      drawChips(now);
      drawHeld();
    }

    /* ---------- INPUT ----------
       Press a molecule to lift it: on the tray, in the tube, or in the dish.
       Let it go over the tube, the beaker or the dish. Anywhere else, it stays
       where it was. */
    function hit(p) {
      for (const piece of st.pieces) {
        if (piece.zone === 'tray' && traySlot.has(piece.id) && inside(p, traySlotRect(traySlot.get(piece.id)))) return { id: piece.id, from: 'tray' };
      }
      for (let k = 0; k < tubeOrder.length; k++) {
        if (inside(p, tubeSlot(k))) return { id: tubeOrder[k], from: 'tube' };
      }
      let best = null;
      for (const piece of st.pieces) {
        if (piece.zone !== 'dish' || !pos.has(piece.id)) continue;
        const c = dishPx(pos.get(piece.id)), rad = Math.max(24, (X.SPECIES[piece.key].extent * L.bond + L.atom) * D.S + 6);
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
      if (inside(c, grow(beaker, 14))) return intoBeaker(d.id, now);
      if (inside(c, D)) return intoDish(d.id, c);
      return null;
    }
    function equation(r) {
      const f = (k) => X.SPECIES[k].formula, out = [];
      r.products.forEach((k) => { const e = out.find((q) => q.k === k); if (e) e.n++; else out.push({ k, n: 1 }); });
      return f(r.a) + ' + ' + f(r.b) + '  →  ' + out.map((q) => (q.n > 1 ? q.n + ' ' : '') + f(q.k)).join(' + ');
    }
    function intoTube(id, now) {
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
                  eq: equation(ev.reaction) };
        tubeOrder = [];
        traySlot.clear();
        ev.products.forEach((pid, k) => traySlot.set(pid, k));
        SND.clasp(ev.reaction.products.length);
        setTimeout(SND.lift, L.productsAt);
        if (ev.lost) { chip('lost a molecule', { x: centre(tray).x, y: tray.y + tray.h + 6 }, 'amber', now + L.productsAt); setTimeout(SND.lost, L.productsAt + 80); }
        if (ev.result) host.endLevel(ev.result, now + L.reactMs + 1000);
      } else if (ev.noReaction) {
        chip('no reaction', { x: centre(tube).x, y: tube.y + 20 }, 'grey', now);
        SND.set();
      } else {
        SND.set();
      }
      return ev;
    }
    function intoBeaker(id, now) {
      const from = st.pieces[id].zone;
      const ev = X.deliver(st, id);
      if (!ev.ok) {
        const text = ev.why === 'not-on-list' ? 'not on the list' : ev.why === 'enough' ? 'you have enough' : 'not now';
        chip(text, { x: centre(beaker).x, y: beaker.y + 14 }, 'grey', now);
        return ev;
      }
      if (from === 'dish') pos.delete(id);
      traySlot.delete(id);
      tubeOrder = tubeOrder.filter((q) => q !== id);
      dropped.push({ id, t0: now });
      SND.lift();
      if (ev.result) host.endLevel(ev.result, now + L.dropMs + 700);
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
          lost: st.analysis.lost, best: st.analysis.best, reacting: !!react, dragging: drag ? drag.id : -1,
        };
      },
      geom() {
        const pieces = {};
        for (const p of st.pieces) {
          if (p.zone === 'dish' && pos.has(p.id)) pieces[p.id] = dishPx(pos.get(p.id));
          else if (p.zone === 'tray' && traySlot.has(p.id)) pieces[p.id] = centre(traySlotRect(traySlot.get(p.id)));
          else if (p.zone === 'tube') { const k = tubeOrder.indexOf(p.id); if (k >= 0) pieces[p.id] = centre(tubeSlot(k)); }
        }
        return { dish: Object.assign({}, D), tube: Object.assign({}, tube), tray: Object.assign({}, tray), beaker: Object.assign({}, beaker),
                 traySlots: [0, 1, 2].map(traySlotRect), tubeSlots: [0, 1].map(tubeSlot), targets: targetSlots(), pieces };
      },
      // Straight to a place, through the same code a drop uses.
      act(where, id, x, y) {
        const now = clock();
        if (where === 'tube') return intoTube(id, now);
        if (where === 'beaker') return intoBeaker(id, now);
        if (where === 'dish') return intoDish(id, { x: x == null ? D.x + D.w / 2 : x, y: y == null ? D.y + D.h / 2 : y });
        return null;
      },
      find(key) {
        return (st.pieces.find((p) => p.key === key && p.zone === 'tray') || st.pieces.find((p) => p.key === key && p.zone === 'dish') || {}).id;
      },
    };

    return {
      load, layout, step, render, down, move, up, cancel, debug,
      lost: () => (st ? st.analysis.lost : 0),
      result: () => (st ? st.result : null),
      dragging: () => !!drag,
    };
  };
})();
