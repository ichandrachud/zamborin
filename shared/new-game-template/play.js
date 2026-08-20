/* ============================================================
   __GAME_NAME__ · A Zamborin Game
   ============================================================ */
(() => {
  'use strict';

  // ---------- MODE ----------
  // A browser can report a 0-wide viewport on the first frame. The obvious
  // `innerWidth < 768` then reads as a phone, MODE is locked for the session,
  // and a desktop player is left on the phone layout for good. Zero means "not
  // measured yet", so it must not count as narrow.
  const MODE = (matchMedia('(pointer: coarse)').matches ||
                (window.innerWidth > 0 && window.innerWidth < 768))
    ? 'mobile' : 'desktop';
  document.body.classList.add('mode-' + MODE);

  // ---------- CANVAS ----------
  // Logical size. Desktop is the ONE site-wide frame; do not invent another.
  // Mobile is the measured viewport, in JS, never CSS dvh: iOS Safari with
  // viewport-fit=cover reports 100dvh smaller than innerHeight and the canvas
  // collapses into a strip.
  let LW, LH;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const gameWrap = canvas.parentElement;

  function setCanvasVars() {
    if (MODE === 'mobile') { LW = window.innerWidth; LH = window.innerHeight; }
    else { LW = 760; LH = 600; }
    document.body.style.setProperty('--canvas-w', LW + 'px');
    document.body.style.setProperty('--canvas-h', LH + 'px');
  }
  function resizeCanvas() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const dW = rect.width || LW, dH = rect.height || LH;
    const bW = Math.round(dW * dpr), bH = Math.round(dH * dpr);
    if (canvas.width !== bW) canvas.width = bW;
    if (canvas.height !== bH) canvas.height = bH;
    const scale = Math.min(bW / LW, bH / LH);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  function fitFullscreen() {
    if (MODE === 'mobile') {
      gameWrap.style.width = window.innerWidth + 'px';
      gameWrap.style.height = window.innerHeight + 'px';
      return;
    }
    const active = document.body.classList.contains('focus-mode');
    if (!active) { gameWrap.style.width = ''; gameWrap.style.height = ''; return; }
    const vw = window.innerWidth, vh = window.innerHeight, aspect = LW / LH;
    let cw = vw, ch = Math.round(vw / aspect);
    if (ch > vh) { ch = vh; cw = Math.round(vh * aspect); }
    gameWrap.style.width = cw + 'px'; gameWrap.style.height = ch + 'px';
  }
  function onResize() {
    if (MODE === 'mobile') setCanvasVars();
    fitFullscreen(); resizeCanvas(); layout(); render(performance.now());
  }

  // ---------- AUDIO ----------
  const sfx = window.ZSFX ? window.ZSFX.create({ storageKey: 'zamborin-__GAME_SLUG__.sound' }) : null;

  // ---------- BUTTONS ----------
  // Sizes come from here and are NEVER scaled per game. A button is chrome,
  // not content: it should be the same physical size in every game.
  const UI = window.ZAM_UI;

  // ---------- ANALYTICS ----------
  // Fire and forget. The NOOP keeps tracking from ever throwing into the game
  // loop when the module is absent or blocked, which about a third of players
  // will do. Call the hooks that match THIS game's own structure; a game with
  // no hint or no restart simply does not emit those.
  const NOOP = { init(){}, gameStart(){}, levelStart(){}, levelComplete(){}, levelRestart(){}, hintUsed(){} };
  const T = () => (window.ZAM_TRACK || NOOP);
  T().init('__GAME_SLUG__');

  // ---------- GAME STATE ----------
  // TODO: declare your state here.
  function layout() {
    // TODO: work out board geometry from LW / LH. Hold real clearance between
    // the board and anything the player can press.
  }

  // ---------- INPUT ----------
  // Touch to logical coords. The y scale MUST use LH: using LW for both is a
  // real bug that lands taps on the wrong row, because LW !== LH on mobile.
  canvas.addEventListener('pointerup', (e) => {
    e.preventDefault();
    if (sfx) sfx.ensureAudio();          // browsers only allow audio after a gesture
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX ?? e.changedTouches?.[0]?.clientX) - rect.left) * (LW / rect.width);
    const y = ((e.clientY ?? e.changedTouches?.[0]?.clientY) - rect.top) * (LH / rect.height);
    void x; void y;
    // TODO: hit-test and act.
  });

  // ---------- RENDER ----------
  function render(now) {
    void now;
    ctx.clearRect(0, 0, LW, LH);
    const bg = ctx.createRadialGradient(LW * 0.5, 0, 0, LW * 0.5, 0, Math.max(LW, LH));
    bg.addColorStop(0, '#1A2A45');   // --bg-panel
    bg.addColorStop(0.6, '#131F36'); // --bg-card
    bg.addColorStop(1, '#0E1726');   // --bg
    ctx.fillStyle = bg; ctx.fillRect(0, 0, LW, LH);
    // TODO: draw the game. Take every colour from shared/tokens.css and put the
    // token name in a comment beside it; canvas cannot read CSS variables, so
    // this file is the one place they get restated. Do not invent a colour.
  }

  // ---------- BOOT ----------
  // Every one of these re-fit hooks is part of the pattern, not belt and
  // braces. Tailwind shipped without them and collapsed into a narrow column on
  // a phone; a strip always means the CSS box and the JS W/H disagree about
  // aspect. innerWidth/innerHeight can read 0, or a stale pre-layout value,
  // while this script first runs. Timers rather than rAF, because rAF is
  // throttled to nothing in some embedded browsers, which is exactly where a
  // stale size would otherwise stick.
  setCanvasVars();
  resizeCanvas();
  fitFullscreen();
  resizeCanvas();
  layout();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 100));
  window.addEventListener('splash-done', () => render(performance.now()));
  window.addEventListener('load', onResize);
  window.visualViewport?.addEventListener('resize', onResize);   // iOS URL-bar collapse
  setTimeout(onResize, 0);
  setTimeout(onResize, 300);
  render(performance.now());
})();
