
/* THE CIRCUS (owner, 2026-09-29: "the next world I want to build is a circus ... Show me image options first and then
   we can decide what direction to go"). Three looks, built around the course as the other worlds are, for the owner
   to choose from before any of it becomes track pieces:
     bigtop   inside a long big top: red and cream canvas rising to a peak over each ring, king poles, bleachers of
              people fading into the dark, strings of warm bulbs up the seams, spotlights sweeping the sawdust
     tintoy   the same big top as a wind-up tin toy: printed tin in candy colours, rivets and tabs, keys in the backs
              of the performers, a brighter, toy-shop light
     midway   outside at dusk: the midway under strings of bulbs, booths with striped awnings, the big top beyond,
              a Ferris wheel, a helter-skelter, a carousel, the sky going from amber to violet
   All the art is our own (no circus's name or show). Animals are wind-up toys, not live ones. */
const CIRCUS_LOOKS = ['bigtop', 'tintoy', 'midway'];
const CQ = {
  bigtop: { canvas: ['#B8202C', '#F2E4C4'], canvasDark: '#3A0C10', trim: '#D8A640', floor: '#7A5634', floorDot: ['#9A7248', '#5A3C22', '#C49A64'],
            ring: '#7A4A26', curb: '#B8202C', curbTop: '#F2E4C4', pole: 0xE8D8B0, poleStripe: 0xB8202C, wood: 0x3A2418, seat: 0x5A3420,
            bulb: 0xFFD9A0, bulbDim: 0x5A3A20, fog: [0x0C0503, 26, 120], bg: ['#030101', '#0C0503', '#1A0A06'], hemi: [0xFFC890, 0x1A0804, 0.32],
            sun: [0xFFD8A8, 0.7], haze: [0xFF9A50, 2.2], spot: 0xFFF2D8, crowd: [0x6A3A30, 0x4A3A5A, 0x7A6A40, 0x3A4A5A, 0x8A5040, 0x5A5A5A],
            deck: { base: '#F4E8CC', band: '#B8202C', stud: '#D8A640', side: 0x8A1A20 }, brass: 0xD8A640 },
  tintoy: { canvas: ['#2AA89A', '#FFF1D2'], canvasDark: '#0A3A36', trim: '#F2C230', floor: '#E8D2A0', floorDot: ['#E85A4A', '#2AA89A', '#F2C230'],
            ring: '#F2C230', curb: '#2A5AC8', curbTop: '#FFF1D2', pole: 0xF2C230, poleStripe: 0xE85A4A, wood: 0x2A5AC8, seat: 0xE85A4A,
            bulb: 0xFFF4D8, bulbDim: 0x6A6050, fog: [0x2A2438, 50, 200], bg: ['#1A1428', '#3A2A48', '#5A3A58'], hemi: [0xFFF6EC, 0x3A3048, 1.3],
            sun: [0xFFF4E4, 1.6], haze: [0xFFD8B0, 2], spot: 0xFFFFFF, crowd: [0xE85A4A, 0x2AA89A, 0xF2C230, 0x2A5AC8, 0xF4A0B0, 0xFFF1D2],
            deck: { base: '#FFF1D2', band: '#E85A4A', stud: '#2A5AC8', side: 0x2A5AC8 }, brass: 0xF2C230 },
  midway: { canvas: ['#C8202C', '#F4ECD8'], canvasDark: '#3A0C10', trim: '#E8B040', floor: '#4A3A2A', floorDot: ['#5A4A34', '#3A2E22', '#6A5A40'],
            ring: '#5A4028', curb: '#C8202C', curbTop: '#F4ECD8', pole: 0xE8E0D0, poleStripe: 0xC8202C, wood: 0x5A3A22, seat: 0x7A4A28,
            bulb: 0xFFD8A0, bulbDim: 0x4A3420, fog: [0x2A1E40, 45, 210], bg: ['#140E2A', '#3A2450', '#FF8A5A'], hemi: [0xFFB890, 0x1A1030, 0.5],
            sun: [0xFFB070, 1.3], haze: [0xFF8A50, 3], spot: 0xFFF2D8, crowd: [0x6A3A30, 0x4A3A5A, 0x7A6A40, 0x3A4A5A, 0x8A5040, 0x5A5A5A],
            deck: { base: '#EFE4CC', band: '#C8202C', stud: '#E8B040', side: 0xC8202C }, brass: 0xE8B040, lane: '#3A2C20' },
};
let cqLook = 'bigtop';
const cqKits = {};
// Everything a look draws once and keeps from course to course.
function cqKit(look) {
  if (cqKits[look]) return cqKits[look];
  const C = CQ[look], keep = (m) => { m.userData.keep = true; return m; }, tin = look === 'tintoy';
  const env = cqEnv(look);
  // The canvas of the tent: gores of the two colours, a seam of bulbs' light down every fourth, darker towards the eaves.
  const gores = canvasTex(1024, 512, (g) => {
    const n = 16;
    for (let i = 0; i < n; i++) { g.fillStyle = C.canvas[i % 2]; g.fillRect(i * 1024 / n, 0, 1024 / n + 1, 512); }
    if (tin) {                                               // printed tin: stars on the pale gores, a halftone, a printed edge
      const r = seeded(5);
      for (let i = 1; i < n; i += 2) for (let k = 0; k < 7; k++) { g.fillStyle = C.trim; cqStar(g, i * 64 + 32 + (r() - 0.5) * 20, 30 + k * 70 + r() * 20, 9, 4); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,0.08)'; for (let y = 0; y < 512; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < 1024; x += 6) g.fillRect(x, y, 2, 2);
    }
    g.fillStyle = pbLin(g, 0, 0, 0, 512, [[0, 'rgba(0,0,0,0)'], [0.55, 'rgba(0,0,0,0.1)'], [1, 'rgba(0,0,0,0.55)']]); g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i <= n; i++) { g.fillStyle = 'rgba(40,10,8,0.35)'; g.fillRect(i * 1024 / n - 2, 0, 4, 512); }
  });
  gores.wrapS = RepeatWrapping;
  // The sidewall: upright stripes, a scalloped band at the top.
  const wallT = canvasTex(512, 256, (g) => {
    for (let i = 0; i < 16; i++) { g.fillStyle = C.canvas[i % 2]; g.fillRect(i * 32, 0, 33, 256); }
    g.fillStyle = C.trim; g.fillRect(0, 0, 512, 22);
    for (let x = 0; x < 512; x += 32) { g.fillStyle = C.canvas[0]; g.beginPath(); g.arc(x + 16, 22, 16, 0, Math.PI); g.fill(); }
    g.fillStyle = pbLin(g, 0, 0, 0, 256, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.6)']]); g.fillRect(0, 0, 512, 256);
  }, true);
  // The sawdust floor (or printed tin, or trodden earth), and the ring's raked sawdust.
  const floorT = canvasTex(512, 512, (g) => {
    g.fillStyle = C.floor; g.fillRect(0, 0, 512, 512);
    const r = seeded(9);
    if (tin) { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#F2DDB0' : '#E4C890'; g.fillRect(x * 64, y * 64, 64, 64); }
      for (let i = 0; i < 64; i++) { g.fillStyle = C.floorDot[i % 3]; g.beginPath(); g.arc((i % 8) * 64 + 32, Math.floor(i / 8) * 64 + 32, 6, 0, 7); g.fill(); } }
    else {
      for (let i = 0; i < 40; i++) { const x = r() * 512, y = r() * 512; g.fillStyle = pbRad(g, x, y, 0, 40 + r() * 60, [[0, 'rgba(255,220,160,0.12)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(x - 100, y - 100, 200, 200); }
      for (let i = 0; i < 26000; i++) { g.fillStyle = C.floorDot[Math.floor(r() * 3)]; g.fillRect(r() * 512, r() * 512, 1 + r() * 1.6, 1 + r() * 1.2); }
    }
  }, true);
  const ringT = canvasTex(512, 512, (g) => {
    g.fillStyle = C.ring; g.fillRect(0, 0, 512, 512);
    const r = seeded(11);
    if (tin) { for (let k = 0; k < 12; k++) { g.fillStyle = k % 2 ? '#F2C230' : '#E85A4A'; g.beginPath(); g.moveTo(256, 256); g.arc(256, 256, 256, k * Math.PI / 6, (k + 1) * Math.PI / 6); g.fill(); }
      g.fillStyle = '#FFF1D2'; cqStar(g, 256, 256, 90, 38); g.fill(); }
    else {
      for (let i = 0; i < 6000; i++) { g.fillStyle = C.floorDot[Math.floor(r() * 3)]; g.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 1.5); }
      g.strokeStyle = 'rgba(40,20,8,0.25)'; g.lineWidth = 3; for (let k = 20; k < 256; k += 14) { g.beginPath(); g.arc(256, 256, k, 0, Math.PI * 2); g.stroke(); }   // raked
      g.fillStyle = 'rgba(255,230,180,0.35)'; cqStar(g, 256, 256, 70, 30); g.fill();
    }
  });
  // The ring curb: the look's colour, a pale top, stars along it (tin: rivets and a printed band).
  const curbT = canvasTex(1024, 64, (g) => {
    g.fillStyle = C.curb; g.fillRect(0, 0, 1024, 64); g.fillStyle = C.curbTop; g.fillRect(0, 0, 1024, 14);
    for (let x = 32; x < 1024; x += 64) { g.fillStyle = C.trim; if (tin) { pbCircle(g, x, 40, 5); g.fill(); } else { cqStar(g, x, 40, 13, 5.5); g.fill(); } }
  }, true);
  // The rail: painted boards (or printed tin, or a boardwalk), a band down each edge, studs in it.
  const deckT = canvasTex(256, 256, (g) => {
    const D = C.deck; g.fillStyle = D.base; g.fillRect(0, 0, 256, 256);
    if (look === 'midway') { for (let y = 0; y < 256; y += 32) { g.fillStyle = y % 64 ? '#E6DAC0' : '#EFE4CC'; g.fillRect(0, y, 256, 30); g.fillStyle = 'rgba(60,40,20,0.35)'; g.fillRect(0, y + 30, 256, 2); } }
    else { g.fillStyle = 'rgba(0,0,0,0.06)'; for (let y = 0; y < 256; y += 32) g.fillRect(0, y + 30, 256, 2); }
    if (tin) { g.fillStyle = D.band; for (let k = 0; k < 4; k++) { cqStar(g, 64 + (k % 2) * 128, 32 + k * 64, 14, 6); g.fill(); } }
  }, true);
  const runT = canvasTex(256, 512, (g) => {
    if (look === 'midway') { for (let y = 0; y < 512; y += 24) { g.fillStyle = (y / 24) % 2 ? '#3A2C20' : '#44342A'; g.fillRect(0, y, 256, 22); g.fillStyle = '#1A1208'; g.fillRect(0, y + 22, 256, 2); } return; }
    g.fillStyle = tin ? '#2A5AC8' : '#7A0E16'; g.fillRect(0, 0, 256, 512);
    g.fillStyle = tin ? '#FFF1D2' : '#D8A640'; g.fillRect(0, 0, 18, 512); g.fillRect(238, 0, 18, 512);
    g.fillStyle = tin ? '#E85A4A' : '#5A0A10'; g.fillRect(22, 0, 8, 512); g.fillRect(226, 0, 8, 512);
    for (let y = 64; y < 512; y += 128) { g.fillStyle = tin ? '#F2C230' : 'rgba(216,166,64,0.55)'; cqStar(g, 128, y, 44, 18); g.fill(); g.strokeStyle = tin ? '#FFF1D2' : 'rgba(216,166,64,0.4)'; g.lineWidth = 4; pbCircle(g, 128, y, 56); g.stroke(); }
    if (!tin) { const r = seeded(29); for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.18})`; g.fillRect(r() * 256, r() * 512, 1, 2); } }
  }, true);
  const edgeT = canvasTex(64, 256, (g) => { g.fillStyle = C.deck.band; g.fillRect(0, 0, 64, 256); g.fillStyle = C.deck.stud; for (let y = 16; y < 256; y += 32) { pbCircle(g, 32, y, 7); g.fill(); } }, true);
  const std = (o) => keep(hazed(new MeshStandardMaterial(o)));
  const K = {
    env,
    canvas: std({ map: gores, side: DoubleSide, roughness: tin ? 0.35 : 0.9, metalness: tin ? 0.45 : 0, envMap: env, envMapIntensity: tin ? 0.8 : 0.2, emissive: 0xFFFFFF, emissiveMap: gores, emissiveIntensity: tin ? 0.18 : 0.12 }),
    wall: std({ map: wallT, side: DoubleSide, roughness: 0.9, metalness: tin ? 0.4 : 0, envMap: env, envMapIntensity: 0.3, emissive: 0xFFFFFF, emissiveMap: wallT, emissiveIntensity: 0.08 }),
    floor: std({ map: floorT, roughness: 0.95, metalness: tin ? 0.3 : 0 }),
    ring: std({ map: ringT, roughness: 0.9, metalness: tin ? 0.3 : 0 }),
    curb: std({ map: curbT, roughness: 0.5, metalness: tin ? 0.6 : 0.1, envMap: env, envMapIntensity: 0.6 }),
    paint: std({ vertexColors: true, roughness: tin ? 0.35 : 0.55, metalness: tin ? 0.5 : 0.05, envMap: env, envMapIntensity: tin ? 0.9 : 0.4 }),
    metal: std({ vertexColors: true, roughness: 0.25, metalness: 1, envMap: env, envMapIntensity: 1.2 }),
    lit: keep(new MeshBasicMaterial({ vertexColors: true, toneMapped: false })),
    deckTop: std({ map: deckT, roughness: tin ? 0.3 : 0.55, metalness: tin ? 0.55 : 0.05, envMap: env, envMapIntensity: 0.7 }),
    deckSide: std({ map: edgeT, roughness: 0.4, metalness: tin ? 0.6 : 0.2, envMap: env, envMapIntensity: 0.8 }),
    deckUnder: std({ color: 0x1A0E0A, roughness: 0.9 }),
    runner: std({ map: runT, roughness: 0.85, metalness: tin ? 0.4 : 0, envMap: env, envMapIntensity: tin ? 0.6 : 0.1 }),
    figs: keep(new MeshStandardMaterial({ map: cqFigures(look), alphaTest: 0.35, side: DoubleSide, roughness: tin ? 0.3 : 0.7, metalness: tin ? 0.4 : 0,
                                         envMap: env, envMapIntensity: tin ? 0.9 : 0.2, emissive: 0xFFFFFF, emissiveMap: cqFigures(look), emissiveIntensity: 0.2 })),
    posters: keep(new MeshStandardMaterial({ map: cqPosters(look), roughness: 0.8, emissive: 0xFFFFFF, emissiveMap: cqPosters(look), emissiveIntensity: 0.25 })),
    curtain: std({ map: cqCurtain(look), roughness: 0.85, side: DoubleSide, emissive: 0xFFFFFF, emissiveMap: cqCurtain(look), emissiveIntensity: 0.1 }),
    halo: keep(new MeshBasicMaterial({ map: pbGlow(), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false })),
    cone: keep(new MeshBasicMaterial({ map: cqConeTex(), color: C.spot, transparent: true, opacity: 0.16, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false })),
  };
  K.gores = gores;
  return (cqKits[look] = K);
}
function cqStar(g, x, y, r1, r2, n = 5) { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r2 : r1; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); }
const cqEnvs = {};
function cqEnv(look) {                                     // warm bulbs in the dark, for the brass and the tin to shine with
  if (cqEnvs[look] || !renderer) return cqEnvs[look] || envTex;
  const C = CQ[look];
  const t = canvasTex(512, 256, (g) => {
    g.fillStyle = pbLin(g, 0, 0, 0, 256, [[0, C.bg[0]], [0.5, C.bg[1]], [1, C.bg[2]]]); g.fillRect(0, 0, 512, 256);
    const r = seeded(23);
    for (let i = 0; i < 140; i++) { const x = r() * 512, y = 20 + r() * 150; g.fillStyle = pbRad(g, x, y, 0, 5 + r() * 8, [[0, '#FFFFFF'], [0.4, '#FFD9A0'], [1, 'rgba(0,0,0,0)']]); g.fillRect(x - 14, y - 14, 28, 28); }
    for (let k = 0; k < 16; k++) { g.fillStyle = k % 2 ? 'rgba(200,40,40,0.35)' : 'rgba(240,220,190,0.25)'; g.fillRect(k * 32, 0, 32, 60); }
  });
  const pm = new PMREMGenerator(renderer);
  cqEnvs[look] = pm.fromEquirectangular(t).texture; pm.dispose(); t.dispose();
  return cqEnvs[look];
}
let cqConeMemo = null;
function cqConeTex() {                                      // a spotlight's beam: bright at the lamp, fading down, soft at the edges
  return cqConeMemo || (cqConeMemo = canvasTex(64, 256, (g) => {
    for (let x = 0; x < 64; x++) { const e = Math.sin(Math.PI * x / 64); g.fillStyle = pbLin(g, 0, 0, 0, 256, [[0, `rgba(255,255,255,${0.9 * e})`], [1, `rgba(255,255,255,${0.15 * e})`]]); g.fillRect(x, 0, 1, 256); }
  }));
}
// The heavy curtain at the performers' entrance: velvet folds, a gold fringe and tie-backs.
function cqCurtain(look) {
  const C = CQ[look];
  return canvasTex(512, 512, (g) => {
    const base = look === 'tintoy' ? '#E85A4A' : '#8A1018';
    g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    for (let x = 0; x < 512; x += 32) { g.fillStyle = pbLin(g, x, 0, x + 32, 0, [[0, 'rgba(0,0,0,0.45)'], [0.5, 'rgba(255,220,200,0.18)'], [1, 'rgba(0,0,0,0.45)']]); g.fillRect(x, 0, 32, 512); }
    g.fillStyle = C.trim; g.fillRect(0, 0, 512, 40);
    for (let x = 0; x < 512; x += 8) { g.fillRect(x, 40, 4, 22 + (x % 16 ? 0 : 8)); }
    g.fillRect(0, 490, 512, 22);
  });
}
