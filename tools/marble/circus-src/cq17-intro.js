// ---- THE CIRCUS PUZZLES' FIRST-TIME CARDS (as the space puzzles' and the city's: the rule in plain words, and a picture) ----
Object.assign(SP_INTRO, {
  clowncar: { title: 'The clown car', lines: ['Push the clowns into the little car: roll into a clown to push it one board along.', 'They only get in through the back door, where the white arrows point in. Stuck? The pad by the road puts them back.'] },
  pyramid: { title: 'The acrobat pyramid', lines: ['Push an acrobat onto every gold star: roll into one to push it one board along.', 'With every star taken, they climb into a pyramid and the curtain opens. The pad by the road puts them back.'] },
  scales: { title: 'The balance scales', lines: ['Push weights onto the scale\'s two pans. The boards over the pans add up the kilos on each side.', 'Make both sides the same and the scale hangs level: the curtain opens. You will not need every weight.'] },
  shells: { title: 'The shell game', lines: ['The magician shows you the gold star under a cup, then shuffles the cups. Keep your eye on it.', 'When the pads light, roll onto the pad in front of the cup with the star. The wrong cup sends you back to watch again.'] },
  knives: { title: 'The knife thrower', lines: ['Watch where his knives land. Then he pulls them out, the rope drops, and every board looks the same again.', 'Cross on the boards he did not hit. Roll onto one he did, and a knife sends you back.'] },
  tickets: { title: 'Ticket turnstiles', lines: ['Roll over golden tickets to pick them up. The number over the marble is how many you hold.', 'Push into a turnstile to pay the tickets on its sign, and it stays open. There are not enough for all of them: choose.'] },
  mirrors: { title: 'The house of mirrors', lines: ['You see only the part of the maze round the marble. Find the way out on the far side.', 'Some doorways are glass you cannot see until you bump into it. It cracks, so you know it next time.'] },
});
const CZA = { red: '#E8303A', cream: '#FFF1D2', gold: '#F2C230', blue: '#2A4AE8', teal: '#2AA89A', ink: '#2A1638', floor: '#E8D2A0', board: '#B07A3E', purple: '#6A2A9A' };
function czaDrum(x, y, col) {                              // a pushed piece from above: a drum, a figure's head on it
  ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = CZA.gold; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y - 3, 5.5, 0, Math.PI * 2); ctx.fillStyle = CZA.cream; ctx.fill();
}
function czaNum(x, y, r, n, ring = CZA.gold) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = ring; ctx.fill(); ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); ctx.fillStyle = CZA.cream; ctx.fill();
  ctx.fillStyle = CZA.ink; ctx.font = '800 ' + Math.round(r * 1.2) + 'px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), x, y + 1);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}
function czaStar(x, y, r, col = CZA.gold) { ctx.fillStyle = col; cqStar(ctx, x, y, r, r * 0.42); ctx.fill(); }
Object.assign(INTRO_ART, {
  clowncar(cx, y, w, h, my) {                              // a clown pushed in at the car's back door; at its side, a knock
    const s = 36, x0 = cx - 2 * s;
    for (let i = 0; i < 4; i++) icCell(x0 + i * s, my + 6, s - 3, CZA.floor);
    introMarble(x0, my + 6); czaDrum(x0 + s, my + 6, CZA.red); introArrow(x0 + s + 14, my - 18, x0 + 2 * s + 10, my - 18);
    const cxr = x0 + 3 * s;                               // the car, its door toward us (the left), white arrows pointing in
    UI.roundRectPath(ctx, cxr - 16, my - 6, 34, 24, 8); ctx.fillStyle = CZA.red; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = CZA.gold; ctx.stroke();
    for (const dx of [-8, 10]) for (const dy of [-8, 20]) { ctx.beginPath(); ctx.arc(cxr + dx, my + dy, 4, 0, Math.PI * 2); ctx.fillStyle = CZA.ink; ctx.fill(); }
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3; for (const d of [0, 7]) { ctx.beginPath(); ctx.moveTo(cxr - 26 + d, my); ctx.lineTo(cxr - 20 + d, my + 6); ctx.lineTo(cxr - 26 + d, my + 12); ctx.stroke(); }
    ctx.strokeStyle = TOK.ink72; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cxr - 6, my - 26); ctx.lineTo(cxr + 6, my - 16); ctx.moveTo(cxr + 6, my - 26); ctx.lineTo(cxr - 6, my - 16); ctx.stroke();
  },
  pyramid(cx, y, w, h, my) {                               // an acrobat pushed onto its star; all on their stars, a pyramid
    const s = 36, x0 = cx - w * 0.36;
    for (let i = 0; i < 3; i++) icCell(x0 + i * s, my + 6, s - 3, CZA.floor);
    czaStar(x0 + 2 * s, my + 7, 13); introMarble(x0, my + 6); czaDrum(x0 + s, my + 6, CZA.blue); introArrow(x0 + s + 14, my - 18, x0 + 2 * s + 8, my - 18);
    introArrow(cx + w * 0.02, my + 6, cx + w * 0.12, my + 6);
    const px = cx + w * 0.3, fig = (x, yy) => { ctx.beginPath(); ctx.arc(x, yy - 12, 5, 0, Math.PI * 2); ctx.fillStyle = CZA.cream; ctx.fill(); ctx.fillStyle = CZA.red; ctx.fillRect(x - 5, yy - 7, 10, 14); };
    fig(px - 9, my + 24); fig(px + 9, my + 24); fig(px, my + 2); czaStar(px, my - 22, 7);
  },
  scales(cx, y, w, h, my) {                                // two weights one side, an anvil the other: level
    const px = cx, top = my - 18;
    ctx.fillStyle = CZA.red; ctx.fillRect(px - 4, top, 8, 46); ctx.fillStyle = CZA.gold; ctx.fillRect(px - 70, top - 3, 140, 6);
    ctx.beginPath(); ctx.moveTo(px - 7, top - 14); ctx.lineTo(px + 7, top - 14); ctx.lineTo(px, top - 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = CZA.gold; ctx.fillRect(px - 110, my + 26, 80, 8); ctx.fillRect(px + 30, my + 26, 80, 8);
    czaNum(px - 88, my + 12, 12, 3); czaNum(px - 54, my + 12, 12, 4);
    ctx.fillStyle = '#B8B4C4'; ctx.fillRect(px + 52, my + 10, 36, 14); ctx.fillRect(px + 62, my + 2, 16, 8); ctx.fillRect(px + 48, my - 4, 44, 8);   // an anvil, pale enough to see on the card
    czaNum(px - 70, top - 8, 11, 7); czaNum(px + 70, top - 8, 11, 7);
  },
  shells(cx, y, w, h, my) {                                // the cups, one lifted over the star; a swap; the pad in front of the right one
    const xs = [cx - 60, cx, cx + 60];
    for (const [i, x] of xs.entries()) {
      const lift = i === 1 ? 16 : 0;
      if (i === 1) czaStar(x, my + 8, 9);
      ctx.fillStyle = CZA.red; ctx.beginPath(); ctx.moveTo(x - 16, my + 12 - lift); ctx.lineTo(x - 11, my - 16 - lift); ctx.lineTo(x + 11, my - 16 - lift); ctx.lineTo(x + 16, my + 12 - lift); ctx.closePath(); ctx.fill();
      ctx.fillStyle = CZA.gold; ctx.fillRect(x - 16, my + 9 - lift, 32, 4); ctx.beginPath(); ctx.arc(x, my - 18 - lift, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, my + 34, 9, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = i === 1 ? PAD_YELLOW_CSS : 'rgba(255,210,63,0.3)'; ctx.stroke();
    }
    ctx.setLineDash([4, 4]); ctx.strokeStyle = TOK.ink72; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx + 30, my - 26, 26, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.setLineDash([]);
    introMarble(cx, my + 34, 5);
  },
  knives(cx, y, w, h, my) {                                // boards, knives in some; the way across on the others
    const s = 26, x0 = cx - 2 * s, y0 = my - 28, hit = new Set(['0,0', '2,0', '3,0', '0,1', '1,1', '3,1', '1,2', '2,2']);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const x = x0 + c * s + s / 2, yy = y0 + r * s + s / 2;
      ctx.beginPath(); ctx.arc(x, yy, 11, 0, Math.PI * 2); ctx.fillStyle = CZA.board; ctx.fill(); ctx.beginPath(); ctx.arc(x, yy, 7, 0, Math.PI * 2); ctx.fillStyle = CZA.red; ctx.fill(); ctx.beginPath(); ctx.arc(x, yy, 3, 0, Math.PI * 2); ctx.fillStyle = CZA.cream; ctx.fill();
      if (hit.has(c + ',' + r)) { ctx.strokeStyle = '#E6ECF4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 1, yy); ctx.lineTo(x + 7, yy - 12); ctx.stroke(); ctx.strokeStyle = CZA.red; ctx.beginPath(); ctx.moveTo(x + 7, yy - 12); ctx.lineTo(x + 10, yy - 17); ctx.stroke(); }
    }
    ctx.setLineDash([5, 5]); ctx.strokeStyle = TOK.ink72; ctx.lineWidth = 2.5; ctx.beginPath();
    ctx.moveTo(x0 + 1.5 * s, y0 + 3.4 * s); ctx.lineTo(x0 + 1.5 * s, y0 + 0.5 * s); ctx.lineTo(x0 + 1.5 * s, y0 - 0.3 * s); ctx.stroke(); ctx.setLineDash([]);
    introMarble(x0 + 1.5 * s, y0 + 3.4 * s, 6);
    introArrow(cx + w * 0.12, my + 4, cx + w * 0.22, my + 4); ctx.fillStyle = TOK.ink90; ctx.font = '700 15px Inter, sans-serif'; ctx.fillText('hit: back', cx + w * 0.24, my + 9);
  },
  tickets(cx, y, w, h, my) {                               // a ticket picked up; a turnstile of two taking both
    const tk = (x, yy) => { UI.roundRectPath(ctx, x - 14, yy - 9, 28, 18, 3); ctx.fillStyle = CZA.gold; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = CZA.ink; ctx.stroke(); czaStar(x + 6, yy, 4, CZA.red); };
    tk(cx - w * 0.36, my - 6); tk(cx - w * 0.36 + 10, my + 8);
    introArrow(cx - w * 0.24, my + 2, cx - w * 0.12, my + 2);
    const tx = cx + w * 0.06;
    ctx.fillStyle = CZA.red; ctx.fillRect(tx - 30, my - 12, 12, 34); ctx.fillStyle = CZA.gold; ctx.fillRect(tx - 32, my - 15, 16, 5);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(tx - 18, my + 2, 52, 5); ctx.fillStyle = CZA.red; for (let k = 0; k < 3; k++) ctx.fillRect(tx - 10 + k * 16, my + 2, 7, 5);
    czaNum(tx - 24, my - 30, 12, 2);
    introArrow(tx + 44, my + 4, tx + 70, my + 4); introMarble(tx + 82, my + 4);
  },
  mirrors(cx, y, w, h, my) {                               // the roof, the hole round the marble, a bit of maze in it, and cracked glass
    const x0 = cx - w * 0.36, ww = w * 0.72, top = my - 32, hh = 76;
    for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? CZA.cream : CZA.purple; ctx.fillRect(x0 + i * ww / 12, top, ww / 12 + 0.5, hh); }
    const hx = cx - 10, hy = my + 6;
    ctx.save(); ctx.beginPath(); ctx.arc(hx, hy, 30, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = CZA.floor; ctx.fillRect(hx - 30, hy - 30, 60, 60);
    ctx.fillStyle = '#C8D2E6'; ctx.fillRect(hx - 30, hy - 14, 34, 5); ctx.fillRect(hx + 10, hy - 30, 5, 40);
    ctx.strokeStyle = 'rgba(160,230,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx - 24, hy + 16); ctx.lineTo(hx + 4, hy + 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx - 12, hy + 16); ctx.lineTo(hx - 16, hy + 10); ctx.moveTo(hx - 12, hy + 16); ctx.lineTo(hx - 6, hy + 11); ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.arc(hx, hy, 30, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = CZA.gold; ctx.stroke();
    introMarble(hx - 6, hy + 2, 6);
  },
});
const PAD_YELLOW_CSS = '#' + PAD_YELLOW.toString(16).padStart(6, '0');
