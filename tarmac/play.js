/* ============================================================
   Tarmac · a Zamborin Game (prototype v1)
   Air-traffic ground-ops. Aircraft fly in with a fuel reserve.
   DRAW A PATH from an aircraft to route it: land on a landing
   runway, taxi to a gate to refuel, then draw a path back out
   over a takeoff runway to depart. Crash or run dry = game over.
   ============================================================ */
(() => {
  'use strict';

  // ---------- CANVAS (fixed 1920x1080 world, scaled to fit) ----------
  const W = 1920, H = 1080;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;

  function worldFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return { x: cx * (W / r.width), y: cy * (H / r.height) };
  }

  // ---------- MAP ----------
  const map = new Image();
  let mapReady = false;
  map.onload = () => { mapReady = true; };
  map.src = './assets/airport.svg';

  // ---------- ZONES (world coords, read off the layout) ----------
  const RW_W = 34;                                  // runway / touchdown tolerance
  const LAND_RUNWAYS = [
    { x1: 330, x2: 645, y: 291 },
    { x1: 430, x2: 645, y: 360 },
  ];
  const TAKEOFF_RUNWAYS = [
    { x1: 390, x2: 840, y: 790 },
    { x1: 470, x2: 840, y: 890 },
  ];
  const GATES = [
    { x: 1000, y: 335 }, { x: 1000, y: 470 }, { x: 1000, y: 600 },
    { x: 1400, y: 335 }, { x: 1400, y: 470 }, { x: 1400, y: 600 },
  ].map(g => ({ ...g, plane: null }));
  const HELIPADS = [
    { x: 825, y: 287 }, { x: 825, y: 360 }, { x: 825, y: 675 }, { x: 825, y: 722 },
  ];

  // ---------- STATE ----------
  let planes = [];
  let phase = 'ready';        // ready | playing | over
  let score = 0;
  let nextSpawn = 0;
  let spawnGap = 5.5;         // seconds between arrivals (shrinks over time)
  let elapsed = 0;
  let showZones = false;      // debug overlay of runways/gates/pads
  let drag = null;            // { plane, pts:[] } while drawing a route

  const PLANE_SPEED = 55;     // world px / sec while moving
  const ARRIVE_SPEED = 28;    // drift speed flying in toward the hold point
  const FUEL_DRAIN = 0.55;    // %/sec while airborne — a full tank lasts ~3 min
  const REFUEL_RATE = 14;     // %/sec at a gate

  function reset() {
    planes = []; score = 0; elapsed = 0; nextSpawn = 0.6; spawnGap = 5.5;
    GATES.forEach(g => g.plane = null);
    phase = 'playing';
  }

  // ---------- SPAWNING ----------
  const EDGES = ['left', 'left', 'left', 'top', 'bottom'];   // weighted toward the water
  function spawnPlane() {
    const edge = EDGES[(Math.random() * EDGES.length) | 0];
    let x, y, dir, hx, hy;
    if (edge === 'left')    { x = -60; y = 200 + Math.random() * 640; dir = 0;           hx = 200; hy = y; }
    else if (edge === 'top'){ x = 300 + Math.random() * 400; y = -60; dir = Math.PI / 2;  hx = x; hy = 150; }
    else                    { x = 300 + Math.random() * 400; y = H + 60; dir = -Math.PI / 2; hx = x; hy = H - 150; }
    planes.push({
      x, y, heading: dir, holdX: hx, holdY: hy,
      fuel: 72 + Math.random() * 28,
      state: 'arriving',      // arriving | taxiing | parked | ready | departing | leaving
      path: [], legTarget: 0,
      gate: null, refuelHold: 0,
      isChopper: Math.random() < 0.22,
      id: Math.random(),
    });
  }

  // ---------- GEOMETRY HELPERS ----------
  function nearSeg(px, py, s, tol) {
    // distance from point to horizontal runway segment
    const cx = Math.max(s.x1, Math.min(s.x2, px));
    const dx = px - cx, dy = py - s.y;
    return Math.hypot(dx, dy) <= tol;
  }
  function onAnyLandingRunway(px, py) { return LAND_RUNWAYS.some(s => nearSeg(px, py, s, RW_W)); }
  function onAnyTakeoffRunway(px, py) { return TAKEOFF_RUNWAYS.some(s => nearSeg(px, py, s, RW_W)); }
  function freeGateNear(px, py) {
    let best = null, bd = 70;
    for (const g of GATES) {
      if (g.plane) continue;
      const d = Math.hypot(px - g.x, py - g.y);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }

  // ---------- INPUT: draw a path from an aircraft ----------
  function planeAt(x, y) {
    let best = null, bd = 55;
    for (const p of planes) {
      if (p.state === 'leaving') continue;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  function onDown(e) {
    e.preventDefault();
    const w = worldFromEvent(e);
    if (phase === 'ready') { reset(); return; }
    if (phase === 'over') { phase = 'ready'; return; }
    const p = planeAt(w.x, w.y);
    if (p && p.state !== 'parked') { drag = { plane: p, pts: [{ x: p.x, y: p.y }] }; }
    else if (p && p.state === 'parked' && p.fuel >= 99) { drag = { plane: p, pts: [{ x: p.x, y: p.y }] }; }
  }
  function onMove(e) {
    if (!drag) return;
    e.preventDefault();
    const w = worldFromEvent(e);
    const last = drag.pts[drag.pts.length - 1];
    if (Math.hypot(w.x - last.x, w.y - last.y) > 22) drag.pts.push(w);
  }
  function onUp() {
    if (!drag) return;
    const p = drag.plane;
    if (drag.pts.length > 1) {
      p.path = drag.pts.slice(1);
      p.legTarget = 0;
      if (p.state === 'parked') { if (p.gate) p.gate.plane = null; p.gate = null; p.state = 'departing'; }
      else if (p.state !== 'departing') p.state = 'taxiing';
    }
    drag = null;
  }
  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener('touchstart', onDown, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp);

  // ---------- UPDATE ----------
  function update(dt) {
    if (phase !== 'playing') return;
    elapsed += dt;
    spawnGap = Math.max(2.6, 5.5 - elapsed / 45);
    nextSpawn -= dt;
    if (nextSpawn <= 0) { spawnPlane(); nextSpawn = spawnGap; }

    for (const p of planes) {
      // fuel
      if (p.state !== 'parked') {
        p.fuel -= FUEL_DRAIN * dt;
        if (p.fuel <= 0 && p.state !== 'leaving') { p.fuel = 0; return gameOver('OUT OF FUEL'); }
      }

      // refuel at gate
      if (p.state === 'parked') {
        p.fuel = Math.min(100, p.fuel + REFUEL_RATE * dt);
      }

      // follow drawn path
      if (p.path.length) {
        const t = p.path[p.legTarget];
        const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
        p.heading = Math.atan2(dy, dx);
        const step = PLANE_SPEED * dt;
        if (d <= step) {
          p.x = t.x; p.y = t.y; p.legTarget++;
          if (p.legTarget >= p.path.length) { p.path = []; arriveAtPathEnd(p); }
        } else { p.x += dx / d * step; p.y += dy / d * step; }
      } else if (p.state === 'departing') {
        // roll off in current heading, then leave once off the map
        p.x += Math.cos(p.heading) * PLANE_SPEED * 1.4 * dt;
        p.y += Math.sin(p.heading) * PLANE_SPEED * 1.4 * dt;
        if (p.x < -80 || p.x > W + 80 || p.y < -80 || p.y > H + 80) p.state = 'leaving';
      } else if (p.state === 'arriving') {
        // drift in to a holding point near the entry edge, then wait for a route
        const dx = p.holdX - p.x, dy = p.holdY - p.y, d = Math.hypot(dx, dy);
        if (d > 2) { const s = Math.min(ARRIVE_SPEED * dt, d); p.x += dx / d * s; p.y += dy / d * s; p.heading = Math.atan2(dy, dx); }
      }
    }

    // collisions between moving aircraft
    const moving = planes.filter(p => p.state === 'taxiing' || p.state === 'arriving' || p.state === 'departing');
    for (let i = 0; i < moving.length; i++)
      for (let j = i + 1; j < moving.length; j++)
        if (Math.hypot(moving[i].x - moving[j].x, moving[i].y - moving[j].y) < 30) return gameOver('CRASH');

    planes = planes.filter(p => p.state !== 'leaving' || (p.justLeft ? false : (p.justLeft = true, score++, false)));
  }

  function arriveAtPathEnd(p) {
    const g = freeGateNear(p.x, p.y);
    if (g && (p.state === 'taxiing' || p.state === 'arriving')) {
      g.plane = p; p.gate = g; p.x = g.x; p.y = g.y; p.state = 'parked';
    } else if (p.state === 'departing' && onAnyTakeoffRunway(p.x, p.y)) {
      // rolling for takeoff — keep departing (will fly off the map)
    }
    // otherwise the aircraft simply waits where the path ended
  }

  function gameOver(reason) { phase = 'over'; window.__overReason = reason; }

  // ---------- RENDER ----------
  function stateColor(p) {
    if (p.state === 'parked') return p.fuel >= 99 ? '#3ddc84' : '#f2b705';
    if (p.state === 'departing' || p.state === 'ready') return '#4db2ff';
    return '#ffffff';
  }
  function quad(a, b, c, d, e, f, g, h) {
    ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.lineTo(e, f); ctx.lineTo(g, h); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  function drawPlane(p) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.heading); ctx.scale(0.9, 0.9);
    const accent = stateColor(p), ink = 'rgba(20,30,45,0.35)';
    ctx.strokeStyle = ink; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
    if (p.isChopper) {
      ctx.fillStyle = accent; quad(-30, -3, -30, 3, -2, 3, -2, -3);      // tail boom
      ctx.fillRect(-36, -10, 4, 20);                                     // tail fin
      ctx.fillStyle = '#f4f6fb'; ctx.beginPath(); ctx.ellipse(2, 0, 16, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(30,40,60,0.75)'; ctx.beginPath(); ctx.ellipse(9, 0, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.rotate(elapsed * 7); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-42, 0); ctx.lineTo(42, 0); ctx.moveTo(0, -42); ctx.lineTo(0, 42); ctx.stroke(); ctx.restore();
    } else {
      ctx.fillStyle = accent;
      quad(2, -6, -22, -32, -30, -31, -8, -5);          // left wing (swept)
      quad(2, 6, -22, 32, -30, 31, -8, 5);              // right wing
      quad(-24, -3, -33, -14, -37, -13, -28, -2);       // left tailplane
      quad(-24, 3, -33, 14, -37, 13, -28, 2);           // right tailplane
      ctx.fillStyle = 'rgba(40,52,72,0.9)';             // engine nacelles
      ctx.beginPath(); ctx.ellipse(-7, -19, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-7, 19, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f4f6fb';                        // fuselage
      ctx.beginPath();
      ctx.moveTo(33, 0); ctx.quadraticCurveTo(20, -7, 6, -7); ctx.lineTo(-30, -5);
      ctx.quadraticCurveTo(-40, 0, -30, 5); ctx.lineTo(6, 7); ctx.quadraticCurveTo(20, 7, 33, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(30,40,60,0.8)';             // cockpit
      ctx.beginPath(); ctx.ellipse(23, 0, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // fuel bar
    const fw = 46, fx = p.x - fw / 2, fy = p.y - 44;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(fx - 1, fy - 1, fw + 2, 8);
    ctx.fillStyle = p.fuel < 25 ? '#ff4d4d' : p.fuel < 55 ? '#f2b705' : '#3ddc84';
    ctx.fillRect(fx, fy, fw * Math.max(0, p.fuel) / 100, 6);
  }

  function drawZones() {
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(80,200,255,0.9)';            // landing = blue
    ctx.fillStyle = 'rgba(80,200,255,0.14)';
    for (const s of LAND_RUNWAYS) { ctx.fillRect(s.x1, s.y - RW_W, s.x2 - s.x1, RW_W * 2); ctx.strokeRect(s.x1, s.y - RW_W, s.x2 - s.x1, RW_W * 2); }
    ctx.strokeStyle = 'rgba(255,170,60,0.9)';            // takeoff = amber
    ctx.fillStyle = 'rgba(255,170,60,0.14)';
    for (const s of TAKEOFF_RUNWAYS) { ctx.fillRect(s.x1, s.y - RW_W, s.x2 - s.x1, RW_W * 2); ctx.strokeRect(s.x1, s.y - RW_W, s.x2 - s.x1, RW_W * 2); }
    for (const g of GATES) {                              // gates
      ctx.beginPath(); ctx.arc(g.x, g.y, 26, 0, Math.PI * 2);
      ctx.fillStyle = g.plane ? 'rgba(255,80,80,0.25)' : 'rgba(60,220,132,0.25)'; ctx.fill();
      ctx.strokeStyle = g.plane ? 'rgba(255,80,80,0.9)' : 'rgba(60,220,132,0.9)'; ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    for (const h of HELIPADS) { ctx.beginPath(); ctx.arc(h.x, h.y, 24, 0, Math.PI * 2); ctx.stroke(); }
  }

  function drawHUD() {
    ctx.fillStyle = '#fff'; ctx.font = '700 34px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('DEPARTED  ' + score, 30, 26);
    ctx.font = '600 20px Inter, system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('blue runways = landing   ·   amber = take-off   ·   green rings = gates', 30, 70);
  }

  function drawOverlay(title, sub) {
    ctx.fillStyle = 'rgba(6,20,14,0.72)'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.font = '800 84px Inter, system-ui, sans-serif'; ctx.fillText(title, W / 2, H / 2 - 60);
    ctx.font = '500 30px Inter, system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    sub.split('\n').forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + 20 + i * 42));
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    if (mapReady) ctx.drawImage(map, 0, 0, W, H); else { ctx.fillStyle = '#129a48'; ctx.fillRect(0, 0, W, H); }
    if (showZones) drawZones();

    if (drag) {                                          // the route being drawn
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 5; ctx.setLineDash([14, 10]);
      ctx.beginPath(); drag.pts.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const p of planes) {                            // committed routes
      if (p.path.length) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3; ctx.setLineDash([8, 8]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); for (let i = p.legTarget; i < p.path.length; i++) ctx.lineTo(p.path[i].x, p.path[i].y); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    for (const p of planes) drawPlane(p);
    drawHUD();

    if (phase === 'ready') drawOverlay('TARMAC', 'Draw a path from each aircraft to guide it.\nLand · taxi to a gate · refuel · take off.\nTap to start');
    if (phase === 'over') drawOverlay(window.__overReason || 'GAME OVER', 'Departed ' + score + ' aircraft\nTap to try again');
  }

  // ---------- LOOP ----------
  let last = 0;
  function loop(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    update(dt); render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // TEMP debug — drive the sim manually since this preview pane pauses rAF.
  window.__t = {
    get phase() { return phase; },
    get planes() { return planes.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), state: p.state, fuel: Math.round(p.fuel), gate: !!p.gate })); },
    start() { reset(); },
    spawn() { spawnPlane(); },
    step(n, dt) { for (let i = 0; i < (n || 1); i++) update(dt || 0.016); render(); },
    route(i, pts) { const p = planes[i]; if (!p) return; p.path = pts; p.legTarget = 0; if (p.state === 'parked') { if (p.gate) p.gate.plane = null; p.gate = null; p.state = 'departing'; } else p.state = 'taxiing'; },
  };
})();
