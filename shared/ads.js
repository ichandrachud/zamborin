/* Zamborin — the ad switch.
   ============================================================================
   ADS ARE OFF until a provider below carries real unit ids. Leave them empty
   and every slot stays hidden exactly as it is today; fill them in and ads
   appear on all fifteen games at once. Nothing else needs editing.

   HOW TO TURN ADS ON (AdSense)
   1. AdSense -> Ads -> By ad unit -> create a Display unit per size.
   2. Each unit gives a `data-ad-slot` number.
   3. Paste them into CONFIG.adsense.units below. Deploy. That is the change.

   HOW TO CHANGE PROVIDER
   Set PROVIDER to another key in PROVIDERS, fill that provider's CONFIG, and
   deploy. **The fifteen game pages do not change.** The markup holds sixty
   placeholder <div>s that name a SIZE and nothing else, so the only
   provider-specific knowledge on the whole site lives in this file. Adding a
   provider means writing one `mount` function, below, of about ten lines.

   Only `adsense` is implemented, because it is the only one in use. The others
   are deliberately absent rather than guessed at: a half-remembered
   integration that looks finished is worse than none.

   CONSENT IS NOT HANDLED HERE, for any provider. The EEA/UK requirement is a
   certified CMP, and a home-made banner is not one. Google's CMP is a dashboard
   toggle that injects through the AdSense tag; other providers pair with other
   IAB TCF certified CMPs. See the ADS READINESS section of QC-TRACKER.md.
   ============================================================================ */
(function () {
  'use strict';

  var PROVIDER = 'adsense';

  var CONFIG = {
    adsense: {
      client: 'ca-pub-9207689324865969',
      // Paste the data-ad-slot numbers. Empty string = that size stays off.
      units: {
        leaderboard: '',   // the 728 x 90 slots, two per game page
        medrec: ''         // the 300 x 250 slots, two per game page, in the sidebar
      }
    }
  };

  /* A provider needs two things: a way to name the unit for a size, and a way
     to mount it into a placeholder. `mount` receives the emptied placeholder
     element, the provider's config, and the unit id for that size. */
  var PROVIDERS = {
    adsense: {
      unitFor: function (cfg, size) { return (cfg.units && cfg.units[size]) || ''; },
      mount: function (box, cfg, id) {
        var ins = document.createElement('ins');
        ins.className = 'adsbygoogle';
        ins.style.display = 'block';
        ins.setAttribute('data-ad-client', cfg.client);
        ins.setAttribute('data-ad-slot', id);
        ins.setAttribute('data-full-width-responsive', 'true');
        box.appendChild(ins);
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
      }
    }
  };

  // The markup names a size and nothing else, which is what keeps the pages
  // provider-neutral. Add a size here if a new slot class is ever introduced.
  function sizeOf(el) {
    if (el.classList.contains('ad-leaderboard')) return 'leaderboard';
    if (el.classList.contains('ad-medrec')) return 'medrec';
    return '';
  }

  var provider = PROVIDERS[PROVIDER];
  var cfg = CONFIG[PROVIDER];
  if (!provider || !cfg) return;

  var boxes = document.querySelectorAll('.ad-slot');
  if (!boxes.length) return;

  // Nothing configured: leave the page exactly as it is. This is the state the
  // site ships in, and it is why `ads-on` is never set today.
  var any = false;
  for (var i = 0; i < boxes.length; i++) {
    if (provider.unitFor(cfg, sizeOf(boxes[i]))) { any = true; break; }
  }
  if (!any) return;

  for (var j = 0; j < boxes.length; j++) {
    var box = boxes[j];
    var id = provider.unitFor(cfg, sizeOf(box));
    if (!id) continue;
    // The dashed placeholder label is replaced, not hidden, so a live unit can
    // never sit behind the words "AD · 728 × 90".
    box.innerHTML = '';
    provider.mount(box, cfg, id);
  }

  // Only once real units exist, so the reserve is never shown holding nothing.
  document.body.classList.add('ads-on');
})();
