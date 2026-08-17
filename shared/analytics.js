/* ============================================================
   Zamborin · analytics
   One tracking entry point for every game. Load it before play.js.

   THE RULES THIS MUST NEVER BREAK
   1. Silent no-op when the tracker is absent or blocked. Assume a third of
      players block it. A blocked tracker must never throw into the game loop,
      so every single call is wrapped.
   2. Never blocks. No await, no promise the game waits on, no retry.
   3. No personal data. Slugs, integers and durations only — no ids, no
      fingerprints, never free text typed by a player.

   BACKEND. Uses Vercel's window.va, which is already loaded on every page, so
   this adds no new dependency and keeps events beside the pageview data. The
   send is isolated in one function: swapping to GA4 or a self-hosted counter
   is a change to `send` and nothing else.

   The module keeps its own clocks. A game reports WHAT happened; seconds,
   maxLevel and levelsCompleted are counted here, so twelve games cannot each
   get the arithmetic subtly different.
   ============================================================ */
(function () {
  'use strict';

  var game = null;
  var sessionT0 = now();
  var levelT0 = now();
  var maxLevel = 0;
  var levelsCompleted = 0;
  var dirty = false;          // something worth reporting since the last session_end

  function now() {
    try { return (window.performance && performance.now) ? performance.now() : Date.now(); }
    catch (e) { return Date.now(); }
  }
  function secsSince(t) { return Math.max(0, Math.round((now() - t) / 1000)); }

  // The ONLY place anything leaves the page.
  function send(name, props) {
    try {
      if (typeof window.va !== 'function') return;     // blocked, or not loaded yet
      window.va('event', { name: name, data: props });
    } catch (e) { /* never surfaces to the caller */ }
  }

  function track(name, props) {
    try {
      var data = { game: game || 'unknown' };
      if (props) for (var k in props) if (Object.prototype.hasOwnProperty.call(props, k)) data[k] = props[k];
      dirty = true;
      send(name, data);
    } catch (e) {}
  }

  // session_end goes on visibilitychange -> hidden, NOT beforeunload, which is
  // unreliable on mobile Safari — a large share of this audience.
  function endSession() {
    try {
      if (!dirty) return;              // nothing has happened since the last one
      dirty = false;
      send('session_end', {
        game: game || 'unknown',
        maxLevel: maxLevel,
        levelsCompleted: levelsCompleted,
        seconds: secsSince(sessionT0)
      });
    } catch (e) {}
  }

  try {
    document.addEventListener('visibilitychange', function () {
      try { if (document.visibilityState === 'hidden') endSession(); } catch (e) {}
    });
  } catch (e) {}

  window.ZAM_TRACK = {
    /* Call once, as early as the game boots. `slug` is the directory name
       (`prism`, `fold`, …) so events join to the pageview data. */
    init: function (slug) {
      try { game = String(slug || '').slice(0, 32); sessionT0 = now(); levelT0 = now(); } catch (e) {}
    },

    /* The player pressed Play on the splash / rules card. Against pageviews
       this says whether the page convinced anyone to start at all. */
    gameStart: function () { track('game_start', null); },

    /* A level began. Also starts the per-level clock used by the next two. */
    levelStart: function (level) {
      try {
        level = level | 0;
        levelT0 = now();
        if (level > maxLevel) maxLevel = level;
        track('level_start', { level: level });
      } catch (e) {}
    },

    /* Solved. `moves` is whatever that game counts as a move. */
    levelComplete: function (level, moves) {
      try {
        levelsCompleted++;
        track('level_complete', { level: level | 0, moves: moves | 0, seconds: secsSince(levelT0) });
      } catch (e) {}
    },

    /* Restarted before solving. Against level_start this is how often players
       get stuck, which is what decides whether rewarded video is worth building. */
    levelRestart: function (level) {
      try { track('level_restart', { level: level | 0, seconds: secsSince(levelT0) }); } catch (e) {}
    },

    /* Hint, undo or solve-for-me. Only where such a control exists. */
    hintUsed: function (level) { try { track('hint_used', { level: level | 0 }); } catch (e) {} },

    /* Escape hatch for anything not in the six. Use sparingly — every extra
       event costs quota and adds noise. */
    track: track
  };
})();
