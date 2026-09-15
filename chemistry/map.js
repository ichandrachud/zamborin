/* ============================================================
   Lessons in Chemistry · the level map

   Every level of every chapter as a numbered cell: done, next, or not yet.
   All three chapters are open from the start (owner, 2026-09-15: the
   reactions are the most fun, so they should not wait behind fifty levels);
   inside a chapter, levels open in order. It is the first screen, where the
   player picks a chapter.

   play.js hands it the canvas and the house helpers through `host`, as it
   does the bench, and says what each chapter holds and how far the player
   has got. Tapping an open cell asks play.js to start that level.
   ============================================================ */
(function () {
  'use strict';

  window.ChemMap = function (host) {
    const { ctx, TOK, rr } = host;
    const TITLE = 'LESSONS IN CHEMISTRY';
    const CELL = 68;                                    // five columns on a 390 phone, ten on the desktop frame
    const TITLE_H = 60, GAP = 18;
    let LW = 760, LH = 600, MODE = 'desktop', pad = 30;
    let view = { x: 0, y: 0, w: 0, h: 0 }, cols = 10, cw = 70, ch = 64;
    let scroll = 0, contentH = 0, maxScroll = 0;
    let press = null;                                   // { y, scroll0, moved, pid }
    let shown = [], heads = [], titleW = 0;             // as last drawn, in canvas px, for the checks

    function layout() {
      ({ LW, LH, MODE } = host.size());
      pad = host.pad;
      const top = host.topBand() + 4;
      const bottom = MODE === 'mobile' ? LH - host.botBand() - 10 : LH - 16;
      view = { x: 0, y: top, w: LW, h: Math.max(80, bottom - top) };
      const availW = LW - pad * 2;
      cols = Math.max(4, Math.min(10, Math.round(availW / CELL)));
      cw = availW / cols;
      ch = Math.max(52, Math.min(72, cw * 0.92));
    }

    /* A chapter's heading: its title, and how many of its levels are done,
       beside the title when there is room and under it when not. */
    function heading(chap) {
      const count = chap.done + ' of ' + chap.count + ' done';
      let size = 17;
      ctx.save();
      ctx.font = '700 ' + size + 'px Inter, sans-serif';
      while (size > 15 && ctx.measureText(chap.name).width > LW - pad * 2) { size -= 1; ctx.font = '700 ' + size + 'px Inter, sans-serif'; }
      const tw = ctx.measureText(chap.name).width;
      ctx.font = '600 15px Inter, sans-serif';
      const cwid = ctx.measureText(count).width;
      ctx.restore();
      const oneLine = tw + 20 + cwid <= LW - pad * 2;
      return { count, size, tw, cwid, oneLine, h: oneLine ? 46 : 64 };
    }
    // Sections and cells in content coordinates (0 at the top of the scroll).
    function build() {
      const sections = [], cells = [];
      let y = TITLE_H;
      host.chapters().forEach((chap, c) => {
        const head = heading(chap);
        sections.push({ chap, y, head });
        y += head.h;
        for (let i = 0; i < chap.count; i++) {
          cells.push({
            c: c + 1, i, x: pad + (i % cols) * cw + 4, y: y + Math.floor(i / cols) * ch + 4, w: cw - 8, h: ch - 8,
            done: i < chap.done, next: i === chap.done, open: chap.all || i <= chap.done,
          });
        }
        y += Math.ceil(chap.count / cols) * ch + GAP;
      });
      contentH = y;
      maxScroll = Math.max(0, contentH - view.h);
      return { sections, cells };
    }

    function check(cx, cy) {
      ctx.save();
      ctx.strokeStyle = TOK.green; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(cx - 6, cy); ctx.lineTo(cx - 2, cy + 4); ctx.lineTo(cx + 6, cy - 4); ctx.stroke();
      ctx.restore();
    }

    function render() {
      layout();
      const B = build();
      scroll = Math.max(0, Math.min(scroll, maxScroll));
      const oy = view.y - scroll;
      ctx.save();
      ctx.beginPath(); ctx.rect(view.x, view.y, view.w, view.h); ctx.clip();

      let size = 30;
      ctx.font = '800 ' + size + 'px Inter, sans-serif';
      while (size > 18 && ctx.measureText(TITLE).width > LW - pad * 2) { size -= 1; ctx.font = '800 ' + size + 'px Inter, sans-serif'; }
      ctx.fillStyle = TOK.white; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(TITLE, pad, oy + 38);
      titleW = ctx.measureText(TITLE).width;
      heads = [];

      for (const s of B.sections) {
        const H = s.head, y = oy + s.y + 23;
        ctx.textBaseline = 'middle';
        ctx.font = '700 ' + H.size + 'px Inter, sans-serif'; ctx.fillStyle = TOK.ink92; ctx.textAlign = 'left';
        ctx.fillText(s.chap.name, pad, y);
        ctx.font = '600 15px Inter, sans-serif'; ctx.fillStyle = TOK.ink72;
        if (H.oneLine) { ctx.textAlign = 'right'; ctx.fillText(H.count, LW - pad, y); }
        else ctx.fillText(H.count, pad, y + 20);
        heads.push({ titleRight: pad + H.tw, countLeft: H.oneLine ? LW - pad - H.cwid : pad, oneLine: H.oneLine, text: s.chap.name });
      }

      shown = [];
      for (const q of B.cells) {
        const y = oy + q.y;
        if (y + q.h < view.y - 20 || y > view.y + view.h + 20) continue;
        rr(q.x, y, q.w, q.h, 14);
        ctx.fillStyle = q.open ? TOK.tint07 : TOK.tint03; ctx.fill();
        if (q.next) { ctx.lineWidth = 2; ctx.strokeStyle = TOK.accentText; rr(q.x, y, q.w, q.h, 14); ctx.stroke(); }
        ctx.fillStyle = q.open ? TOK.ink92 : TOK.tint30;
        ctx.font = '700 17px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(q.i + 1), q.x + q.w / 2, y + q.h / 2 - (q.done ? 7 : 0));
        if (q.done) check(q.x + q.w / 2, y + q.h / 2 + 11);
        shown.push(Object.assign({}, q, { y }));
      }
      ctx.restore();

      /* Fades at the edges, so it is plain there is more. The page's own wash
         is painted back over the cells in thin bands, fullest at the edge, so
         they melt into the ground rather than under a darker shelf. */
      ctx.save();
      ctx.fillStyle = host.washStyle();
      for (const top of [true, false]) {
        if (top ? scroll <= 1 : scroll >= maxScroll - 1) continue;
        for (let k = 0; k < 12; k++) {
          ctx.globalAlpha = 1 - k / 12;
          ctx.fillRect(0, top ? view.y + k * 2 : view.y + view.h - (k + 1) * 2, LW, 2);
        }
      }
      ctx.restore();
    }

    /* ---------- INPUT ----------
       A press that travels more than 8px scrolls; one that does not is a tap,
       and a tap on an open cell starts that level. */
    const inView = (p) => p.x >= view.x && p.x <= view.x + view.w && p.y >= view.y && p.y <= view.y + view.h;
    function down(p, e) {
      if (!inView(p)) return false;
      press = { y: p.y, scroll0: scroll, moved: false, pid: e.pointerId };
      return true;
    }
    function move(p, e) {
      if (!press || e.pointerId !== press.pid) return false;
      if (press.moved || Math.abs(p.y - press.y) > 8) {
        press.moved = true;
        scroll = Math.max(0, Math.min(maxScroll, press.scroll0 - (p.y - press.y)));
      }
      return true;
    }
    function up(p, e) {
      if (!press || e.pointerId !== press.pid) return false;
      const was = press;
      press = null;
      if (was.moved) return true;
      const q = shown.find((c) => c.open && p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h);
      if (q) host.open(q.c, q.i);
      return true;
    }
    function wheel(dy) { scroll = Math.max(0, Math.min(maxScroll, scroll + dy)); }
    /* Where the map opens: at the top for someone who has played nothing yet,
       otherwise with the next level of chapter c (the one last played) in
       the middle of the view. */
    function focus(c, fresh) {
      layout();
      const next = build().cells.find((q) => q.c === c && q.next);
      scroll = !fresh && next ? Math.max(0, Math.min(maxScroll, next.y + next.h / 2 - view.h / 2)) : 0;
    }

    return {
      render, down, move, up, wheel, focus,
      cancel() { press = null; },
      debug: {
        cells: () => shown.map((q) => ({ c: q.c, n: q.i + 1, x: q.x, y: q.y, w: q.w, h: q.h, open: q.open, done: q.done, next: q.next })),
        view: () => Object.assign({ scroll, maxScroll, contentH, cols, titleW, heads, pad }, view),
        scrollTo(v) { scroll = Math.max(0, Math.min(maxScroll, v)); },
      },
    };
  };
})();
