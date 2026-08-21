/* ============================================================
   Zamborin document audit

   The QC sweeps built up to 2026-08-21 all measure CANVASES. They are good at
   it. What none of them looked at was the DOCUMENT the canvas sits in, and in
   one evening that gap produced three findings, two of them serious:

     - Stained could not scroll on a phone. Its whole article and its footer
       were off-screen and unreachable.
     - guides/kaleido could not either, for a different reason: a missing body
       class. 4220px of article inside an 844px locked viewport.
     - The homepage's opening sentence carried a link at 1.91:1, the browser
       default blue, on the page background.

   A page can pass the link checker, the head-contract check and every canvas
   fit sweep and still be unusable. This is the missing pass.

   HOW TO USE IT. From any page on the same origin, in the browser console or
   through the preview tools:

     await fetch('/shared/qc/doc-audit.js').then(r => r.text()).then(eval);
     const out = await ZQC.run(ZQC.ALL_PAGES, { w: 390, h: 844 });
     ZQC.summary(out);

   It builds one hidden iframe, walks the list, and returns a row per page.
   Nothing is mutated on the pages under test.

   A NOTE ON THE SCROLL CHECK, WHICH IS THE WHOLE REASON THIS FILE EXISTS.
   The first version asked whether `documentElement.scrollHeight` exceeded
   `innerHeight`. That does not work: when the body is locked with
   `position: fixed; overflow: hidden`, documentElement reports the VIEWPORT
   height, so a locked page looks exactly like a short one. The lock hides its
   own symptom, and Stained passed. `body.scrollHeight` still reports the real
   content height, and the honest question is whether the last element on the
   page can be brought into view. Both are below. Do not "simplify" this back.
   ============================================================ */
(function (root) {
  'use strict';

  /* ---------- contrast, with its own null test ---------- */
  function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function lum(p) { return 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]); }
  function parseColor(s) {
    const m = String(s).match(/[\d.]+/g);
    return m ? [+m[0], +m[1], +m[2], m[3] === undefined ? 1 : +m[3]] : null;
  }
  function ratio(fg, bg) {
    const a = lum(fg), b = lum(bg), hi = Math.max(a, b), lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
  }
  /* Any colour transform can produce confident, specific, wrong numbers. This
     runs before anything trusts a reading, on values whose answers are known.
     See the 2026-08-20 note about two typo'd matrix coefficients. */
  function nullTest() {
    const cases = [
      [[255, 255, 255], [0, 0, 0], 21.00],
      [[255, 255, 255], [255, 255, 255], 1.00],
      [[118, 118, 118], [255, 255, 255], 4.54],
      [[119, 119, 119], [255, 255, 255], 4.48],
      [[77, 195, 255], [14, 23, 38], 9.04],
    ];
    const bad = cases.filter(c => Math.abs(ratio(c[0], c[1]) - c[2]) > 0.01);
    return { pass: bad.length === 0, failed: bad };
  }

  /* The background actually behind an element: walk up until something is
     opaque enough to matter. A transparent parent contributes nothing. */
  function effectiveBg(el, w) {
    let n = el;
    while (n && n.nodeType === 1) {
      const p = parseColor(w.getComputedStyle(n).backgroundColor);
      if (p && p[3] > 0.5) return p;
      n = n.parentElement;
    }
    const b = parseColor(w.getComputedStyle(w.document.body).backgroundColor);
    return (b && b[3] > 0.5) ? b : [14, 23, 38, 1];
  }

  const TEXTY = 'p,li,h1,h2,h3,h4,h5,span,a,strong,em,td,th,label,button,figcaption,dt,dd';

  function auditDocument(d, w, opts) {
    const rec = {};
    const body = d.body;
    const vh = w.innerHeight, vw = w.innerWidth;

    /* ---- 1. can the page be read to the end ---- */
    const content = body.scrollHeight;
    const last = d.querySelector('.site-footer')
      || d.querySelector('.guide, .game-info, .legal-page, main');
    w.scrollTo(0, content + 2000);
    const scrolled = w.scrollY;
    const reachable = last ? last.getBoundingClientRect().bottom <= vh + 4 : null;
    w.scrollTo(0, 0);
    rec.contentHeight = content;
    rec.viewport = vh;
    rec.needsScroll = content > vh + 4;
    rec.scrolledTo = Math.round(scrolled);
    rec.bottomReachable = reachable;
    rec.SCROLL_LOCKED = rec.needsScroll && scrolled < 2;
    rec.bodyPosition = w.getComputedStyle(body).position;
    rec.bodyClass = body.className || '(none)';

    /* ---- 2. the footer ---- */
    const foot = d.querySelector('.site-footer');
    rec.footerInHtml = !!foot;
    rec.footerShown = foot ? w.getComputedStyle(foot).display !== 'none' : false;

    /* ---- 3. links left at the browser default ---- */
    rec.defaultBlueLinks = Array.from(d.querySelectorAll('a'))
      .filter(a => /^rgb\(0, 0, (238|255)\)$/.test(w.getComputedStyle(a).color)
        && Array.from(a.childNodes).some(n => n.nodeType === 3 && n.textContent.trim()))
      .map(a => a.textContent.trim().slice(0, 32));

    /* ---- 4. sideways scrolling ---- */
    rec.overflowX = d.documentElement.scrollWidth > vw + 1;

    /* ---- 5. contrast of what is actually rendered ---- */
    const cfails = [], small = [];
    d.querySelectorAll(TEXTY).forEach(el => {
      const own = Array.from(el.childNodes)
        .filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
      if (!own) return;
      const cs = w.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const fg = parseColor(cs.color);
      if (!fg) return;
      const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5;
      const got = ratio(fg, effectiveBg(el, w));
      if (got < need - 0.01) {
        cfails.push({ text: own.slice(0, 34), color: cs.color, px: Math.round(size), ratio: +got.toFixed(2), need });
      }
      /* The 16px floor applies to CONTENT COPY. The first version of this check
         reported 6 to 16 items on every page and every one was a false
         positive, which is worse than no check: uppercase letterspaced
         eyebrows, breadcrumbs, a version line, and above all the inline links
         INSIDE a paragraph, each re-reported at the size their parent already
         set. Report the block, not its children, and honour the exemptions the
         rule actually states. */
      const isBlock = /^(P|LI|H1|H2|H3|H4|DT|DD|TD)$/.test(el.tagName);
      const isLabel = cs.textTransform === 'uppercase' || parseFloat(cs.letterSpacing) >= 1;
      const inChrome = !!el.closest('.site-header, .site-footer, .ad-slot, .ad-label, nav, .crumb, .updated, .meta');
      if (size < 16 && isBlock && !isLabel && !inChrome) {
        small.push({ text: own.slice(0, 34), px: +size.toFixed(1), tag: el.tagName.toLowerCase(),
                     cls: (el.className || '').slice(0, 30) });
      }
    });
    rec.contrastFails = cfails;
    rec.contrastFailCount = cfails.length;
    rec.belowTypeFloor = small.slice(0, 12);
    rec.belowTypeFloorCount = small.length;

    /* ---- 6. images ---- */
    rec.imagesWithoutAlt = Array.from(d.querySelectorAll('img'))
      .filter(i => !i.hasAttribute('alt')).length;

    /* ---- 7. heading order ---- */
    const hs = Array.from(d.querySelectorAll('h1,h2,h3,h4,h5')).map(h => +h.tagName[1]);
    rec.h1Count = hs.filter(x => x === 1).length;
    rec.headingSkip = hs.some((v, i) => i > 0 && v - hs[i - 1] > 1);

    /* ---- 8. tap targets, phone widths only ----
       The bar is WCAG 2.5.8 Target Size (Minimum), which is 24x24 and AA, NOT
       the 44 of Apple's guidance. More importantly it EXEMPTS a link that sits
       inline in a sentence, and the first version of this check did not: it
       returned 9 or 10 hits on all forty pages, every one of them a word in a
       paragraph. A check that fires everywhere tells you nothing. */
    if (vw <= 500) {
      rec.smallTapTargets = Array.from(d.querySelectorAll('a,button,[role="button"],input,select'))
        .filter(el => {
          const cs = w.getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return false;
          /* the inline-in-a-sentence exemption */
          if (cs.display === 'inline' && el.closest('p, li, figcaption, dd, h1, h2, h3, h4')) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24);
        })
        .map(el => ({
          t: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 24),
          w: Math.round(el.getBoundingClientRect().width),
          h: Math.round(el.getBoundingClientRect().height),
        })).slice(0, 10);
      rec.smallTapTargetCount = rec.smallTapTargets.length;
    }

    /* ---- 9. the canvas, if there is one ---- */
    const c = d.querySelector('canvas');
    if (c) {
      const cr = c.getBoundingClientRect();
      const wrapEl = c.parentElement, wr = wrapEl.getBoundingClientRect();
      let t = null;
      try { t = c.getContext('2d').getTransform(); } catch (_) { }
      rec.canvas = {
        css: [Math.round(cr.width), Math.round(cr.height)],
        wrap: [Math.round(wr.width), Math.round(wr.height)],
        backing: [c.width, c.height],
        scale: t ? +t.a.toFixed(3) : null,
        /* scale 0 is the hidden-iframe Infinity bug; clipped is Mobile's */
        SCALE_ZERO: t ? t.a === 0 : false,
        clippedPx: [Math.max(0, Math.round(cr.width - wr.width)), Math.max(0, Math.round(cr.height - wr.height))],
        CLIPPED: cr.width > wr.width + 1 || cr.height > wr.height + 1,
      };
    }

    /* ---- 10. anything that failed to load ---- */
    rec.failedResources = w.performance.getEntriesByType('resource')
      .filter(e => e.responseStatus >= 400 && !/_vercel/.test(e.name))
      .map(e => e.name.replace(w.location.origin, '') + ' [' + e.responseStatus + ']');

    return rec;
  }

  const ALL_PAGES = [
    '/', '/about/', '/faq/', '/contact/', '/privacy/', '/cookies/', '/terms/', '/embed/', '/guides/', '/404.html',
    '/guides/orbit/', '/guides/bloom/', '/guides/untangle/', '/guides/tessera/', '/guides/sluice/',
    '/guides/fold/', '/guides/mobile/', '/guides/kaleido/', '/guides/prism/', '/guides/needle/',
    '/guides/tailwind/', '/guides/stained/', '/guides/zood/', '/guides/carrom/', '/guides/ludo/',
    '/orbit/', '/bloom/', '/tailwind/', '/stained/', '/kaleido/', '/prism/', '/needle/',
    '/untangle/', '/tessera/', '/sluice/', '/fold/', '/mobile/', '/zood/', '/carrom/', '/ludo/',
  ];
  const GAMES = ['orbit', 'bloom', 'tailwind', 'stained', 'kaleido', 'prism', 'needle',
    'untangle', 'tessera', 'sluice', 'fold', 'mobile', 'zood', 'carrom', 'ludo'];

  async function run(urls, size, opts) {
    opts = opts || {};
    const nt = nullTest();
    if (!nt.pass) throw new Error('contrast maths failed its null test: ' + JSON.stringify(nt.failed));
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-5000px;top:0;border:0;width:' + size.w + 'px;height:' + size.h + 'px';
    document.body.appendChild(f);
    const out = [];
    for (const u of urls) {
      const rec = { url: u, size: size.w + 'x' + size.h };
      try {
        await new Promise((res, rej) => {
          const to = setTimeout(() => rej(new Error('timeout')), 12000);
          f.addEventListener('load', () => { clearTimeout(to); res(); }, { once: true });
          f.src = u + (u.indexOf('?') === -1 ? '?' : '&') + 'qc=1';
        });
        await new Promise(r => setTimeout(r, opts.settle || 340));
        Object.assign(rec, auditDocument(f.contentDocument, f.contentWindow, opts));
      } catch (e) { rec.error = String(e); }
      out.push(rec);
    }
    f.remove();
    out.nullTest = nt;
    return out;
  }

  /* Only the rows worth reading. Silence here means the page passed, so the
     summary is deliberately empty-when-clean rather than a wall of ticks. */
  function summary(rows) {
    const s = {
      pages: rows.length,
      SCROLL_LOCKED: rows.filter(r => r.SCROLL_LOCKED).map(r => r.url),
      bottomUnreachable: rows.filter(r => r.bottomReachable === false).map(r => r.url),
      footerMissing: rows.filter(r => r.footerInHtml && !r.footerShown).map(r => r.url),
      defaultBlueLinks: rows.filter(r => r.defaultBlueLinks && r.defaultBlueLinks.length)
        .map(r => ({ url: r.url, n: r.defaultBlueLinks.length, eg: r.defaultBlueLinks[0] })),
      overflowX: rows.filter(r => r.overflowX).map(r => r.url),
      contrast: rows.filter(r => r.contrastFailCount).map(r => ({ url: r.url, n: r.contrastFailCount, worst: r.contrastFails[0] })),
      imagesWithoutAlt: rows.filter(r => r.imagesWithoutAlt).map(r => ({ url: r.url, n: r.imagesWithoutAlt })),
      headings: rows.filter(r => r.h1Count !== 1 || r.headingSkip).map(r => ({ url: r.url, h1: r.h1Count, skip: r.headingSkip })),
      canvasScaleZero: rows.filter(r => r.canvas && r.canvas.SCALE_ZERO).map(r => r.url),
      canvasClipped: rows.filter(r => r.canvas && r.canvas.CLIPPED).map(r => ({ url: r.url, px: r.canvas.clippedPx })),
      failedResources: rows.filter(r => r.failedResources && r.failedResources.length).map(r => ({ url: r.url, r: r.failedResources })),
      errors: rows.filter(r => r.error).map(r => ({ url: r.url, e: r.error })),
      typeFloor: rows.filter(r => r.belowTypeFloorCount).map(r => ({ url: r.url, n: r.belowTypeFloorCount })),
      tapTargets: rows.filter(r => r.smallTapTargetCount).map(r => ({ url: r.url, n: r.smallTapTargetCount })),
    };
    Object.keys(s).forEach(k => {
      if (Array.isArray(s[k]) && !s[k].length) delete s[k];
    });
    return s;
  }

  root.ZQC = { run, summary, auditDocument, nullTest, ratio, ALL_PAGES, GAMES };
}(typeof self !== 'undefined' ? self : this));
