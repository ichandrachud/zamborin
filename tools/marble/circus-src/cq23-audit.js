/* THE STORE AUDIT'S FIXES (2026-09-30: the owner, "go through the entire game and check for any bugs or errors ... from
   the POV of this getting versioned and submitted to App Store, Play store, game distribution and crazy games"). Each
   is wired into the game by integrate-circus.py; what they are:
   - freeMat: a course's materials were freed at a level's end but not their pictures (three frees a material, never its
     textures), so a long session kept a few on the GPU for every level played.
   - sleepAudio: nothing ever suspended the sound, so the city's hum, the roll and the wind played on with the game
     hidden (the frame loop stops, and the last volume holds): a store reviewer's first test.
   - cardSubtitle: the one place the cards' opening lines are written, so the card's header can grow a line for them on
     a narrow phone (the rules card's third line was dropped at 320 and 375 wide); and level 200's card said "the last
     of the forty courses". */
function freeMat(m) {
  for (const t of [m.map, m.emissiveMap, m.alphaMap, m.bumpMap]) if (t && t.isCanvasTexture && t !== dot) t.dispose();   // (a picture shared with a kit is only sent to the GPU again when next drawn)
  m.dispose();
}
function sleepAudio() {
  const o = sfx && sfx.out && sfx.out();
  if (o && o.context && o.context.state === 'running') o.context.suspend().catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (document.hidden) sleepAudio(); });
window.addEventListener('pagehide', sleepAudio);
hud.addEventListener('contextmenu', (e) => e.preventDefault());   // (a right-click or a long press on the game is not a menu)
function cardSubtitle(kind) {
  return kind === 'rules' ? 'Roll the marble along the course and through the orange ring.'
    : levelNo >= LEVELS.length ? 'That was the last of the two hundred courses.'
    : falls === 0 ? 'The whole course without a single fall.'
    : 'Home, with ' + falls + (falls === 1 ? ' fall' : ' falls') + ' on the way.';
}
