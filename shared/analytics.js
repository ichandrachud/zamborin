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

  /* ---------- VOLUME CONTROL ----------
     Both dials live here and ONLY here, never per game, so tightening later is
     a one-line change rather than thirteen edits. They are deliberately open
     right now: traffic is low enough that full granularity is affordable, and
     early data is worth more than the quota.

     When the Analytics tab shows the monthly allowance being approached, set
     EMIT_LEVEL_START to false and LEVEL_DETAIL_CAP to 10. That is roughly a
     two-thirds cut and it leaves retention untouched, because session_end is
     never gated by either dial.

     LEVEL_DETAIL_CAP suppresses the PER-LEVEL detail above that level —
     level_complete, level_restart and hint_used. The counters behind
     session_end keep running either way, so maxLevel and levelsCompleted stay
     honest no matter how far a player gets. */
  var EMIT_LEVEL_START = true;
  var LEVEL_DETAIL_CAP = Infinity;

  /* ---------- EMBEDDED OR NOT ----------
     A play inside somebody else's page is not the same event as a play here,
     and until this was stamped the two were indistinguishable: embed traffic
     quietly inflated the site's own figures, and there was no way to show a
     portal how a game performs in an embed, which is the evidence those
     conversations run on.

     The URL is the source of truth rather than a flag set by shared/embed.js,
     so the two cannot drift apart. HOST is the referring site's hostname only,
     never a path or a query: it answers "which partner" without following
     anyone anywhere, and a hostname is not personal data. */
  var EMBED = (function () {
    try { return /[?&]embed=(?!0)/.test(window.location.search); } catch (e) { return false; }
  })();
  var HOST = (function () {
    if (!EMBED) return null;
    try {
      var r = document.referrer;
      if (!r) return 'unknown';
      return new URL(r).hostname.slice(0, 64) || 'unknown';
    } catch (e) { return 'unknown'; }
  })();

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

  /* Every event carries the same two extra fields when embedded, so an embed
     play can be filtered in or out of any figure without a second event name. */
  function stamp(data) {
    if (EMBED) { data.embed = 1; data.host = HOST; }
    return data;
  }

  function track(name, props) {
    try {
      var data = { game: game || 'unknown' };
      if (props) for (var k in props) if (Object.prototype.hasOwnProperty.call(props, k)) data[k] = props[k];
      dirty = true;
      send(name, stamp(data));
    } catch (e) {}
  }

  // Something happened worth ending a session over, whether or not an event was
  // EMITTED for it. This has to be separate from track(), or a throttled build
  // would go quiet: with EMIT_LEVEL_START off and LEVEL_DETAIL_CAP at 10, a
  // player who only touches levels 11 and up would emit nothing at all, `dirty`
  // would never be set, and session_end — the retention backbone — would never
  // fire for exactly the players who got furthest.
  function noteActivity() { dirty = true; }

  // session_end goes on visibilitychange -> hidden, NOT beforeunload, which is
  // unreliable on mobile Safari — a large share of this audience.
  function endSession() {
    try {
      if (!dirty) return;              // nothing has happened since the last one
      dirty = false;
      send('session_end', stamp({
        game: game || 'unknown',
        maxLevel: maxLevel,
        levelsCompleted: levelsCompleted,
        seconds: secsSince(sessionT0)
      }));
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

    /* A level began. The per-level clock and maxLevel are updated whether or
       not the event is emitted: level_complete and level_restart both measure
       from levelT0, and session_end reports maxLevel. Only the EMIT is gated. */
    levelStart: function (level) {
      try {
        level = level | 0;
        levelT0 = now();
        if (level > maxLevel) maxLevel = level;
        noteActivity();
        if (!EMIT_LEVEL_START) return;
        track('level_start', { level: level });
      } catch (e) {}
    },

    /* Solved. `moves` is whatever that game counts as a move. The counter runs
       past the cap so session_end's levelsCompleted stays honest. */
    levelComplete: function (level, moves) {
      try {
        level = level | 0;
        levelsCompleted++;
        noteActivity();
        if (level > LEVEL_DETAIL_CAP) return;
        track('level_complete', { level: level, moves: moves | 0, seconds: secsSince(levelT0) });
      } catch (e) {}
    },

    /* Restarted before solving. Against level_start this is how often players
       get stuck, which is what decides whether rewarded video is worth building. */
    levelRestart: function (level) {
      try {
        level = level | 0;
        noteActivity();
        if (level > LEVEL_DETAIL_CAP) return;
        track('level_restart', { level: level, seconds: secsSince(levelT0) });
      } catch (e) {}
    },

    /* Hint, undo or solve-for-me. Only where such a control exists. */
    hintUsed: function (level) {
      try {
        level = level | 0;
        noteActivity();
        if (level > LEVEL_DETAIL_CAP) return;
        track('hint_used', { level: level });
      } catch (e) {}
    },

    /* Escape hatch for anything not in the six. Use sparingly — every extra
       event costs quota and adds noise. */
    track: track
  };
})();
