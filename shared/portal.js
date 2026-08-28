/* Zamborin — the portal contract.
   ============================================================================
   One interface over GameDistribution and CrazyGames, and a set of harmless
   no-ops when neither is there. The game never learns which portal it is on,
   or whether it is on one at all: it asks for a rewarded ad and is told either
   "here is your reward" or "no". zamborin.com takes the "no" branch on every
   call, which is why the same build runs on the site and in a portal package.

   VERIFIED AGAINST BOTH SDKs' DOCS, 2026-08-28, because the brief said to and
   because two details are not what you would guess:

   1. THE REWARD IS AN EVENT, NOT THE PROMISE. GameDistribution's
      `showAd('rewarded')` resolves whether or not the player watched; the only
      thing that means a reward was earned is the SDK_REWARDED_WATCH_COMPLETE
      event. CrazyGames says the same thing a different way, through an
      adFinished callback separate from adError. A contract built on
      `showAd().then(giveReward)` pays out for a skipped ad, so this one does
      not have that shape.

   2. THE GAME MUST BE MUTED AND PAUSED FOR THE WHOLE AD. CrazyGames requires
      it explicitly: mute and pause on adStarted, restore on adFinished AND on
      adError. That is handled here rather than in each game, and RESTORING
      MEANS RESTORING THE PLAYER'S OWN SETTING, not unmuting — a player who
      had sound off must still have it off afterwards.

   Also learned rather than assumed: CrazyGames enforces its own interstitial
   cooldown, roughly one every three minutes across all ad types, and reports
   `adCooldown` when you ask too soon. That is a normal answer and not a fault,
   so it is never surfaced to the player.

     ZAM_PORTAL.init({ onPause, onResume, isMuted, setMuted })
     ZAM_PORTAL.name            'gd' | 'crazygames' | null
     ZAM_PORTAL.canReward()     is a rewarded ad available to ask for
     ZAM_PORTAL.rewarded(ok, no)
     ZAM_PORTAL.interstitial(done)
     ZAM_PORTAL.gameplayStart() / gameplayStop()
   ============================================================================ */
(function (root) {
  'use strict';

  var hooks = { onPause: null, onResume: null, isMuted: null, setMuted: null };
  var pendingReward = null;
  var wasMuted = false;
  var busy = false;

  function gd()  { return (typeof root.gdsdk !== 'undefined' && root.gdsdk) || null; }
  function cg()  { return (root.CrazyGames && root.CrazyGames.SDK) || null; }
  function name() { return cg() ? 'crazygames' : (gd() ? 'gd' : null); }

  /* Every ad path goes through these two, including the failure paths. An ad
     that errors after pausing and never resumes leaves a dead game, which is a
     worse outcome than never showing the ad. */
  function suspend() {
    if (busy) return;
    busy = true;
    try { wasMuted = hooks.isMuted ? !!hooks.isMuted() : false; } catch (e) { wasMuted = false; }
    try { if (hooks.setMuted) hooks.setMuted(true); } catch (e) {}
    try { if (hooks.onPause) hooks.onPause(); } catch (e) {}
  }
  function restore() {
    if (!busy) return;
    busy = false;
    // Back to what the PLAYER had, not to unmuted.
    try { if (hooks.setMuted) hooks.setMuted(wasMuted); } catch (e) {}
    try { if (hooks.onResume) hooks.onResume(); } catch (e) {}
  }

  var api = {
    get name() { return name(); },

    init: function (h) {
      h = h || {};
      hooks.onPause  = h.onPause  || null;
      hooks.onResume = h.onResume || null;
      hooks.isMuted  = h.isMuted  || null;
      hooks.setMuted = h.setMuted || null;

      // GD reports its own pause and resume around ads it starts itself. The
      // packager turns those into window events; mirror them into the hooks so
      // a game only ever listens to one thing.
      try {
        root.addEventListener('gd-pause',  function () { suspend(); });
        root.addEventListener('gd-resume', function () { restore(); });
        // The packager dispatches this when SDK_REWARDED_WATCH_COMPLETE fires.
        root.addEventListener('gd-rewarded', function () {
          if (pendingReward) { var f = pendingReward; pendingReward = null; try { f(); } catch (e) {} }
        });
      } catch (e) {}

      // CrazyGames v3 wants an explicit init before anything else is called.
      var c = cg();
      if (c && c.init) { try { var p = c.init(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
      return api;
    },

    /* Whether it is worth OFFERING the button. On zamborin.com this is false
       and the caller decides what to do about that; Comb still gives the hint,
       it simply does not draw an ad badge on a button that plays no ad. */
    canReward: function () { return !!name(); },

    /* ok() runs only if the ad was genuinely watched. no(reason) runs
       otherwise, including when there is no portal at all, so the caller
       always hears back exactly once. */
    rewarded: function (ok, no) {
      var done = false;
      function win()  { if (!done) { done = true; restore(); try { ok && ok(); } catch (e) {} } }
      function fail(r) { if (!done) { done = true; restore(); try { no && no(r || 'unavailable'); } catch (e) {} } }

      var c = cg();
      if (c && c.ad && c.ad.requestAd) {
        suspend();
        try {
          c.ad.requestAd('rewarded', {
            adStarted: function () { suspend(); },
            adFinished: function () { win(); },
            adError: function (e) { fail((e && e.code) || 'error'); }
          });
        } catch (e) { fail('threw'); }
        return;
      }

      var g = gd();
      if (g && g.showAd) {
        suspend();
        // The promise says the ad finished its lifecycle, not that it was
        // watched. The reward comes from the event, which arrives first when
        // it is coming at all; if the promise settles without it, that is a
        // decline.
        pendingReward = win;
        try {
          g.showAd('rewarded').then(function () {
            setTimeout(function () { if (!done) { pendingReward = null; fail('not watched'); } }, 0);
          }).catch(function () {
            pendingReward = null; fail('no fill');
          });
        } catch (e) { pendingReward = null; fail('threw'); }
        return;
      }

      fail('no portal');
    },

    /* Fire and forget. done() always runs, ad or no ad, so a caller can put
       the win card up afterwards without caring what happened. */
    interstitial: function (done) {
      var fired = false;
      function end() { if (!fired) { fired = true; restore(); try { done && done(); } catch (e) {} } }

      var c = cg();
      if (c && c.ad && c.ad.requestAd) {
        suspend();
        try {
          c.ad.requestAd('midgame', {
            adStarted: function () { suspend(); },
            adFinished: end,
            // `adCooldown` is CrazyGames telling us it is too soon. That is a
            // normal answer, not a fault, and the player never hears about it.
            adError: function () { end(); }
          });
        } catch (e) { end(); }
        return;
      }

      var g = gd();
      if (g && g.showAd) {
        suspend();
        try { g.showAd().then(end).catch(end); } catch (e) { end(); }
        return;
      }

      end();
    },

    // CrazyGames uses these to decide when its own ad breaks are acceptable.
    // GD has no equivalent and does not mind being told nothing.
    gameplayStart: function () {
      var c = cg();
      if (c && c.game && c.game.gameplayStart) { try { c.game.gameplayStart(); } catch (e) {} }
    },
    gameplayStop: function () {
      var c = cg();
      if (c && c.game && c.game.gameplayStop) { try { c.game.gameplayStop(); } catch (e) {} }
    },
  };

  root.ZAM_PORTAL = api;
}(typeof self !== 'undefined' ? self : this));
