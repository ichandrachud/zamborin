/* SOCKET — the exact model, headless so it can be measured before anything is drawn.

   A strip is N sockets in a line. A plug has a BODY that occupies a run of
   consecutive sockets and a PIN somewhere inside that body — the pin is the
   socket it actually draws power from, the body is the plastic that covers its
   neighbours. That single distinction is the whole game: a fat plug takes one
   socket and wastes two.

   An asymmetric plug (pin at one end of the body, cable out the side) can be
   FLIPPED, which swaps which neighbour it covers. That is the second verb.

   THE OPEN QUESTION THIS FILE EXISTS TO ANSWER. If the bodies exactly tile the
   strip, any ordering of the plugs is a solution, so the puzzle has K! answers
   and is not a puzzle. Something has to make POSITION matter. This file can
   apply three candidate constraints and count solutions under each, so the
   choice is made from numbers instead of taste.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SOCKET_MODEL = api;
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

// A plug: span = how many sockets its body covers, pinAt = index of the pin
// within the body (0 .. span-1). Symmetric plugs have the pin centred.
// flippable is true when pinAt is not the centre, since flipping then changes
// which sockets get covered.
function makePlug(id, span, pinAt, kind, pins) {
  return { id, span, pinAt, kind, pins: pins || 2, flippable: pinAt * 2 !== span - 1 };
}

// Two-pin things are unearthed: lamps, chargers, a radio. Three-pin things are
// earthed: anything with a metal case or a motor. Only some sockets on the bank
// carry an earth, so the three-pin plugs compete for a scarce resource that the
// two-pin ones are free to ignore.
const CATALOGUE = {
  slim:   (id) => makePlug(id, 1, 0, 'slim', 2),   // a bare two-pin
  wide:   (id) => makePlug(id, 2, 0, 'wide', 3),   // body sits to one side of the pin
  brick:  (id) => makePlug(id, 3, 1, 'brick', 2),  // wall wart, pin centred, eats both neighbours
  angle:  (id) => makePlug(id, 2, 1, 'angle', 3),  // right-angle, body to the other side
  bar:    (id) => makePlug(id, 3, 0, 'bar', 3),    // long adapter hanging off one side
};

// Every way this plug could sit: pin socket p, flipped or not.
// Returns { pin, from, to, flipped } with from..to the covered run.
function placements(plug, N) {
  const out = [];
  const orientations = plug.flippable ? [plug.pinAt, plug.span - 1 - plug.pinAt] : [plug.pinAt];
  orientations.forEach((pinAt, oi) => {
    for (let p = 0; p < N; p++) {
      const from = p - pinAt, to = from + plug.span - 1;
      if (from < 0 || to > N - 1) continue;          // body would hang off the end
      out.push({ pin: p, from, to, flipped: oi === 1 });
    }
  });
  return out;
}

// Count every complete arrangement. Exhaustive on purpose: boards are tiny and
// an exact count is the only thing that answers "is this a puzzle".
// `limit` stops the count early so a trivial board does not take all day.
function countSolutions(board, limit = 200000) {
  const { N, plugs } = board;
  const occupied = new Array(N).fill(false);
  let found = 0;
  const order = plugs.map((_, i) => i).sort((a, b) => plugs[b].span - plugs[a].span);

  (function place(k) {
    if (found >= limit) return;
    if (k === order.length) { found++; return; }
    const plug = plugs[order[k]];
    for (const pl of placements(plug, N)) {
      if (!legal(board, plug, pl)) continue;
      let clash = false;
      for (let i = pl.from; i <= pl.to; i++) if (occupied[i]) { clash = true; break; }
      if (clash) continue;
      for (let i = pl.from; i <= pl.to; i++) occupied[i] = true;
      place(k + 1);
      for (let i = pl.from; i <= pl.to; i++) occupied[i] = false;
      if (found >= limit) return;
    }
  })(0);
  return found;
}

// One solution, or null. Same walk, first hit wins.
function solve(board) {
  const { N, plugs } = board;
  const occupied = new Array(N).fill(false);
  const chosen = new Array(plugs.length).fill(null);
  const order = plugs.map((_, i) => i).sort((a, b) => plugs[b].span - plugs[a].span);
  const ok = (function place(k) {
    if (k === order.length) return true;
    const idx = order[k], plug = plugs[idx];
    for (const pl of placements(plug, N)) {
      if (!legal(board, plug, pl)) continue;
      let clash = false;
      for (let i = pl.from; i <= pl.to; i++) if (occupied[i]) { clash = true; break; }
      if (clash) continue;
      for (let i = pl.from; i <= pl.to; i++) occupied[i] = true;
      chosen[idx] = pl;
      if (place(k + 1)) return true;
      for (let i = pl.from; i <= pl.to; i++) occupied[i] = false;
      chosen[idx] = null;
    }
    return false;
  })(0);
  return ok ? chosen : null;
}

// ---- the candidate constraints ----
// Each makes POSITION matter in a different way. Which one to ship is decided
// by measuring solution counts, not by argument.
function legal(board, plug, pl) {
  // D: earth — a three-pin plug needs a socket that has one.
  if (plug.pins === 3 && board.earthed && !board.earthed.has(pl.pin)) return false;
  // A: dead sockets — the pin must land on a live one, but a body may bridge over it.
  if (board.dead && board.dead.has(pl.pin)) return false;
  // B: reach — the plug's device sits at a fixed place along the strip and the
  // cable only stretches so far.
  if (board.reach) {
    const r = board.reach[plug.id];
    if (r && Math.abs(pl.pin - r.at) > r.slack) return false;
  }
  // C: switched bank — some devices must be on the switched half.
  if (board.needsSwitched && board.needsSwitched.has(plug.id)) {
    if (pl.pin > board.switchedUpTo) return false;
  }
  return true;
}


// ---- generation ----
// Bloom's shape: build a solved board, then describe it as a puzzle. Reach
// centres come FROM the solution, so every level is solvable by construction
// and the only question left is how tightly the reaches pin it down.
function generate(level, rnd = Math.random) {
  // Search effort climbs to level 30 and then falls back, because the strip
  // capped at 10 and the plug count stopped growing with it. The ceiling was
  // the board, not the rules. 12 still leaves a 45px pitch on the desktop card
  // and 52px on a phone, both comfortably above a thumb.
  const N = Math.min(12, 6 + Math.floor((level - 1) / 3));
  // Slack is per-plug, and NEVER zero. A pinned plug sounds harder and measures
  // easier: it has one legal socket, so it solves itself and takes a decision
  // out of the board. Tried it — greedy play went from failing on 60 of 60 late
  // boards to walking 23 of them. Difficulty is not fewer options, it is options
  // that collide. So the mix only ever shifts between 2 and 1.
  const tight = Math.min(0.8, Math.max(0, (level - 6) * 0.055));
  const kinds = ['slim', 'wide', 'brick', 'angle', 'bar'];
  // Uniform choice over kinds favours the big bodies, because three fat plugs
  // fill a strip that would take six slim ones. Measured, that pinned every
  // late level at 4 plugs and made the top of the curve one repeated shape.
  // Aim at a plug COUNT first and weight the draw toward whatever hits it.
  const wantPlugs = Math.max(3, Math.min(N - 1, 3 + Math.floor((level - 1) / 3) + ((rnd() * 2) | 0)));
  for (let attempt = 0; attempt < 800; attempt++) {
    const plugs = []; let total = 0, id = 0;
    while (total < N) {
      const room = N - total;
      const left = wantPlugs - plugs.length;
      // rough body size still to allocate per remaining plug
      const target = left > 0 ? Math.max(1, Math.round(room / left)) : 1;
      const opts = kinds.filter(k => CATALOGUE[k](0).span <= room);
      if (!opts.length) break;
      const weighted = opts.flatMap(k => {
        const sp = CATALOGUE[k](0).span;
        const w = sp === target ? 4 : (Math.abs(sp - target) === 1 ? 2 : 1);
        return Array(w).fill(k);
      });
      const p = CATALOGUE[weighted[(rnd() * weighted.length) | 0]](id++);
      plugs.push(p); total += p.span;
    }
    if (total !== N || plugs.length < 3) continue;
    const sol = solve({ N, plugs });
    if (!sol) continue;
    const reach = {};
    plugs.forEach((p, i) => {
      const r = rnd();
      const sl = level <= 3 ? 2 : (r < tight ? 1 : 2);
      reach[p.id] = { at: sol[i].pin, slack: sl };
    });
    // Earth whatever the solution needs, then add spares so the earthed sockets
    // are not simply a map of the answer.
    const earthed = new Set();
    plugs.forEach((p, i) => { if (p.pins === 3) earthed.add(sol[i].pin); });
    const spares = Math.max(0, Math.round(N * Math.max(0.06, 0.34 - level * 0.012)));
    for (let k = 0; k < spares; k++) earthed.add((rnd() * N) | 0);
    const b = { N, plugs, reach, earthed };
    const n = countSolutions(b, 400);
    // A single answer is the aim; a handful is fine and keeps generation cheap.
    if (n < 1 || n > 6) continue;
    return { ...b, solution: sol, solutions: n, level, slack: Math.min(...plugs.map(p => reach[p.id].slack)), earthedList: [...earthed].sort((a, b2) => a - b2) };
  }
  return null;
}

  return { CATALOGUE, makePlug, placements, countSolutions, solve, legal, generate };
}));
