/* Zamborin — the ad switch.
   ============================================================================
   ADS ARE OFF until SLOTS below carry real ad unit ids. Leave them empty and
   every slot stays hidden exactly as it is today; fill them in and ads appear
   on all fifteen games at once. Nothing else needs editing.

   HOW TO TURN ADS ON
   1. AdSense -> Ads -> By ad unit -> Create a Display unit for each size.
   2. Each unit gives a `data-ad-slot` number, ten digits or so.
   3. Paste them below. Deploy. That is the whole change.

   WHY THIS FILE EXISTS. The slots in the markup are placeholder <div>s, not ad
   units, so before this the switch meant hand-editing sixty blocks across
   fifteen pages and getting every one right. Now the markup stays as it is and
   this file turns each placeholder into a real <ins> at run time.

   CONSENT. Google's own CMP is enabled from the AdSense dashboard and injects
   itself through the AdSense tag that every page already loads. It is not
   configured here, and this file deliberately does NOT try to reimplement it:
   a home-made banner is not a certified CMP and would not satisfy the EEA/UK
   requirement. See the ADS READINESS section of QC-TRACKER.md.
   ============================================================================ */
(function () {
  'use strict';

  var CLIENT = 'ca-pub-9207689324865969';

  // Paste the data-ad-slot numbers here. Empty string = that size stays off.
  var SLOTS = {
    leaderboard: '',   // the 728 x 90 units, two per game page
    medrec: ''         // the 300 x 250 units, two per game page in the sidebar
  };

  function slotFor(el) {
    if (el.classList.contains('ad-leaderboard')) return SLOTS.leaderboard;
    if (el.classList.contains('ad-medrec')) return SLOTS.medrec;
    return '';
  }

  var placeholders = document.querySelectorAll('.ad-slot');
  if (!placeholders.length) return;

  // Nothing configured: leave the page exactly as it is. This is the state the
  // site ships in, and it is why `ads-on` is never set today.
  var any = false;
  for (var i = 0; i < placeholders.length; i++) if (slotFor(placeholders[i])) { any = true; break; }
  if (!any) return;

  for (var j = 0; j < placeholders.length; j++) {
    var box = placeholders[j];
    var id = slotFor(box);
    if (!id) continue;
    // The dashed placeholder label is replaced, not hidden, so a live unit can
    // never sit behind the words "AD · 728 × 90".
    box.innerHTML = '';
    var ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', CLIENT);
    ins.setAttribute('data-ad-slot', id);
    ins.setAttribute('data-full-width-responsive', 'true');
    box.appendChild(ins);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
  }

  // Only once real units exist, so the reserve is never shown holding nothing.
  document.body.classList.add('ads-on');
})();
