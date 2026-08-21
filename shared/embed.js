/* ============================================================
   Zamborin · embed mode

   A partner embeds a game with nothing but an iframe:

     <iframe src="https://zamborin.com/kaleido/?embed=1"
             width="760" height="600" frameborder="0"
             allow="autoplay" title="Kaleido, a Zamborin game"></iframe>

   WHY A QUERY PARAMETER AND NOT A SECOND BUILD. Every embed problem this site
   had — the favicon and logo 404ing, the Vercel analytics scripts failing,
   Google Fonts, relative asset paths — existed only because a copied folder
   moves the files to somebody else's origin. Served from an iframe the page is
   still ours, so none of it arises. It also means a game can be improved after
   a partner has embedded it, which a copied folder can never do.

   WHAT IT CHANGES. Site header, footer, ad slots, sidebar and the SEO copy all
   go; the game takes the whole frame; a small mark sits in the corner linking
   home; and the page tells search engines not to index this variant, because
   ?embed=1 is the same game as the canonical URL and duplicate copies help
   nobody.

   WHAT IT DOES NOT CHANGE. The game. play.js never learns it is embedded, and
   nothing here touches the canvas, its sizing or its input.
   ============================================================ */
(function () {
  'use strict';

  function isEmbed() {
    try {
      var q = new URLSearchParams(window.location.search);
      if (q.has('embed') && q.get('embed') !== '0') return true;
    } catch (e) { /* older browser: fall through to the string check */ }
    return /[?&]embed=(?!0)/.test(window.location.search);
  }

  if (!isEmbed()) return;

  var doc = document;

  function ready(fn) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  /* The class does the layout work; the rules live in shared/chrome.css beside
     the focus-mode ones they are a cousin of. Set on <html> as well so the CSS
     can bite before <body> exists and the chrome never flashes into view. */
  doc.documentElement.classList.add('embed');

  /* ?embed=1 serves the same game as the canonical URL. Left indexable it
     would compete with the page it is a copy of. */
  var robots = doc.createElement('meta');
  robots.name = 'robots';
  robots.content = 'noindex, follow';
  (doc.head || doc.documentElement).appendChild(robots);

  ready(function () {
    doc.body.classList.add('embed');

    /* THE MARK. Small, out of the way, and the only thing the embed asks for
       in return. It carries the wordmark rather than the game's name because
       the point of it is the studio, and it links to the game's own page so a
       click lands somewhere that makes sense rather than on a home page.

       White on the game's dark ground, never re-coloured. */
    var canon = doc.querySelector('link[rel="canonical"]');
    var href = (canon && canon.getAttribute('href')) || 'https://zamborin.com/';
    var sep = href.indexOf('?') === -1 ? '?' : '&';

    var a = doc.createElement('a');
    a.className = 'embed-mark';
    a.href = href + sep + 'utm_source=embed';
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', 'Play more games at Zamborin');

    var img = doc.createElement('img');
    img.src = '../images/zamborin-logo.svg?v=2';
    img.alt = 'Zamborin';
    /* 94 x 14 keeps the wordmark's own 6.715:1. The old 96 x 17 matched the
       previous logo at 5.6:1 and would squash this one by a fifth. */
    img.width = 94; img.height = 14;
    a.appendChild(img);

    doc.body.appendChild(a);
  });
})();
