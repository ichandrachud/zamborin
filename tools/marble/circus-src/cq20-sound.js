// ---- THE CIRCUS'S OWN SOUNDS (as the pinball machine has its own): a calliope's chime for a ring, a fanfare over a
// drum roll at the finish, slide whistles down for a fall and up for the flight home, a bulb horn, a cannon's boom, a
// kazoo for a no. Anything not here sounds as it does in the city.
function czNoise(dur, gain, f, q = 0.8, delay = 0) {        // a burst of filtered noise (a drum, a cymbal, a boom's rumble)
  const out = sfx && sfx.out && sfx.out(); if (!out || !sfx.isOn()) return;
  const ac = out.context, t0 = ac.currentTime + delay, n = Math.ceil(ac.sampleRate * dur), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = b; fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q;
  g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(fl); fl.connect(g); g.connect(out); s.start(t0); s.stop(t0 + dur + 0.02);
}
const czPipe = (f, dur, gain, delay = 0) => { pbVoice('triangle', f, f, dur, gain, 0, delay); pbVoice('square', f * 2, f * 2, dur * 0.7, gain * 0.18, 0, delay); pbVoice('sine', f * 3, f * 3, dur * 0.5, gain * 0.2, 0, delay); };   // a calliope's pipe
const CZ_SOUNDS = {
  unlock() { [[784, 0], [988, 0.08], [1175, 0.16], [1568, 0.24]].forEach(([f, d]) => czPipe(f, 0.28, 0.05, d)); },                 // a ring, or a puzzle solved
  win() {                                                    // the finish: a drum roll, a cymbal, the fanfare
    for (let k = 0; k < 10; k++) czNoise(0.06, 0.05, 220, 1.2, k * 0.045);
    czNoise(0.9, 0.05, 6500, 0.5, 0.46); pbVoice('sine', 110, 55, 0.4, 0.14, 0, 0.46);
    [[523.25, 0.5], [659.25, 0.62], [783.99, 0.74], [1046.5, 0.86]].forEach(([f, d]) => czPipe(f, 0.3, 0.06, d));
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => czPipe(f, 1.0, 0.03, 1.02));
  },
  drop() { pbVoice('sine', 1500, 260, 0.75, 0.07); pbVoice('sine', 1510, 262, 0.75, 0.03); },                                      // off the rail: a slide whistle down
  home() { pbVoice('sine', 300, 1400, 0.45, 0.06); pbVoice('triangle', 150, 700, 0.45, 0.02); },                                      // flown back: and up
  honk() { for (const d of [0, 0.2]) { pbVoice('square', 420, 360, 0.15, 0.045, 0, d); pbVoice('sawtooth', 212, 182, 0.15, 0.03, 0, d); } },   // a bulb horn
  bomb() { pbVoice('sine', 80, 30, 0.6, 0.18); czNoise(0.5, 0.08, 300, 0.6); czNoise(0.25, 0.04, 2400, 0.7); },                       // the human cannon
  launch() { pbVoice('sine', 90, 40, 0.4, 0.14); czNoise(0.3, 0.05, 900, 0.7); pbVoice('sine', 300, 1300, 0.5, 0.04, 0, 0.05); },   // thrown up
  buzz() { pbVoice('sawtooth', 190, 170, 0.28, 0.04); pbVoice('square', 380, 340, 0.28, 0.012); },                                      // a kazoo: no
  key() { [2093, 2637].forEach((f, i) => pbVoice('sine', f, f, 0.5, 0.04, 0, i * 0.07)); },                                            // a glockenspiel's ding
  door() { czNoise(0.5, 0.035, 1400, 0.4); [[659.25, 0.1], [783.99, 0.2], [1046.5, 0.3]].forEach(([f, d]) => czPipe(f, 0.25, 0.04, d)); },   // the curtain parts: ta-da
  thunk() { pbVoice('sine', 160, 70, 0.16, 0.1); czNoise(0.08, 0.04, 700, 1); },                                                         // wood on wood
  knock() { pbVoice('sine', 520, 480, 0.07, 0.06); pbVoice('triangle', 1040, 900, 0.05, 0.02); },                                       // a woodblock
  pop() { pbVoice('sine', 700, 1500, 0.08, 0.07); czNoise(0.05, 0.03, 3000, 1); },                                                       // a cork
  jump() { pbVoice('sine', 180, 520, 0.22, 0.07); pbVoice('sine', 520, 300, 0.2, 0.03, 0, 0.18); },                                      // a springboard's boing
  bump() { pbVoice('sine', 140, 90, 0.12, 0.08); czNoise(0.05, 0.03, 500, 1); },
  tick() { pbVoice('triangle', 1760, 1760, 0.06, 0.03); },
};
