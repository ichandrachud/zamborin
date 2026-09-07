/* ============================================================
   Zamborin · Karrots · the rules

   THE HOLES ARE ONE SHARED RESOURCE, AND THE FOX LIVES IN THEM. Every game in
   this genre asks the player to open space. This is the only one where opening
   space is also how you die, and that single sentence is what the rest of this
   file exists to make true.

   A 6x6 board. Every cell is a hole, an immovable brick, or half of a domino.
   Two moves: slide a tile one cell into holes it fits, or hop the bunny into
   an adjacent hole. Both cost one move.

   After every move the holes are split into 4-connected components. If the
   bunny's component contains the fox, he walks it and the level is lost. The
   check runs after the move resolves, so a slide that opens a corridor kills
   at once - and the board showed it before the player let go.

   No physics, no timers, no randomness. The whole game is this file, and a
   replay of a move list reproduces a level exactly.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KarrotsModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* NINE WIDE, SIX TALL. The desktop frame is 760x600 landscape and the house
     rule for a landscape grid is `rows + (rows <= 6 ? 2 : 3)`, which puts a
     six-row board at nine columns exactly. 54 cells is also exactly the mobile
     touch budget. A phone plays the SAME levels TRANSPOSED - six wide, nine
     tall - which is a domino board either way and has an identical par,
     because a transposed sliding puzzle is the same puzzle. The model only
     ever knows the landscape orientation; the renderer does the turning. */
  var C = 9, R = 6, N = C * R;

  /* A cell holds exactly one of these. A tile is stored as its two halves so
     the grid alone answers "what is at this cell" without a lookup table. */
  var HOLE = 0, BRICK = 1, HL = 2, HR = 3, VT = 4, VB = 5;

  var DIRS = [{ dx: 0, dy: -1, n: 'up' }, { dx: 1, dy: 0, n: 'right' },
              { dx: 0, dy: 1, n: 'down' }, { dx: -1, dy: 0, n: 'left' }];

  function rc(i) { return { r: (i / C) | 0, c: i % C }; }

  /* Neighbour tables. The search walks these tens of millions of times, and
     rc() returns a fresh object every call, so the readable form of this loop
     is most of the solver's running time. NB4[i] holds i's orthogonal
     neighbours; NBD[i][k] is the neighbour in direction k, or -1. */
  var NB4 = [], NBD = [];
  (function () {
    for (var i = 0; i < N; i++) {
      var r = (i / C) | 0, c = i % C, list = [], byDir = [];
      for (var k = 0; k < 4; k++) {
        var nr = r + [-1, 0, 1, 0][k], nc = c + [0, 1, 0, -1][k];
        var ok = nr >= 0 && nr < R && nc >= 0 && nc < C;
        byDir.push(ok ? nr * C + nc : -1);
        if (ok) list.push(nr * C + nc);
      }
      NB4.push(list); NBD.push(byDir);
    }
  })();
  function idx(r, c) { return r * C + c; }
  function inside(r, c) { return r >= 0 && r < R && c >= 0 && c < C; }

  /* ---------- reading a level ----------
     Levels are written as six strings, one per row:

         '.' a hole            '#' an immovable brick
         'B' the bunny         'F' the fox          'C' the carrot
         a-z  one tile, the SAME letter on both of its cells

     Letters rather than '--' and '||' on purpose. A row of four dashes is two
     tiles or one illegal one depending on how you pair them, and a hand-made
     level that pairs the wrong way is a different puzzle that still looks
     right. A letter appearing exactly twice, orthogonally adjacent, cannot be
     read two ways, and the parser says so out loud when it is wrong. */
  function parse(rows, name, opts) {
    var where = name ? ' in ' + name : '';
    opts = opts || {};
    if (!Array.isArray(rows) || rows.length !== R)
      throw new Error('level needs ' + R + ' rows' + where);

    var grid = new Uint8Array(N), bunny = -1, fox = -1, carrot = -1, seen = {};
    var r, c, i, ch;

    for (r = 0; r < R; r++) {
      if (rows[r].length !== C) throw new Error('row ' + r + ' is not ' + C + ' wide' + where);
      for (c = 0; c < C; c++) {
        i = idx(r, c); ch = rows[r][c];
        if (ch === '.') { grid[i] = HOLE; }
        else if (ch === '#') { grid[i] = BRICK; }
        else if (ch === 'B') { grid[i] = HOLE; bunny = i; }
        else if (ch === 'F') { grid[i] = HOLE; fox = i; }
        else if (ch === 'C') { grid[i] = HOLE; carrot = i; }
        else if (ch >= 'a' && ch <= 'z') { (seen[ch] || (seen[ch] = [])).push(i); }
        else throw new Error('unknown character "' + ch + '" at row ' + r + ' col ' + c + where);
      }
    }

    Object.keys(seen).forEach(function (ch) {
      var cells = seen[ch];
      if (cells.length !== 2)
        throw new Error('tile "' + ch + '" covers ' + cells.length + ' cells, needs 2' + where);
      var a = rc(cells[0]), b = rc(cells[1]);
      if (a.r === b.r && b.c === a.c + 1) { grid[cells[0]] = HL; grid[cells[1]] = HR; }
      else if (a.c === b.c && b.r === a.r + 1) { grid[cells[0]] = VT; grid[cells[1]] = VB; }
      else throw new Error('tile "' + ch + '" is not two adjacent cells' + where);
    });

    if (bunny < 0) throw new Error('no bunny' + where);
    if (fox < 0) throw new Error('no fox' + where);
    /* THE CARROT SQUARE IS RESERVED. Nothing slides over it and nothing else
       ever stands on it; the bunny arriving there is the win. The earlier rule
       let a tile sit on top of it, which made a two-move opening level
       possible, and it is gone: a goal you can bury is a goal that can be
       hidden, and this one has to be visible from the first frame. */
    if (opts.carrotAt) throw new Error('carrotAt is gone: the goal square is reserved' + where);
    if (carrot < 0) throw new Error('no carrot' + where);
    if (bunny === carrot) throw new Error('bunny starts on the carrot' + where);

    var st = { grid: grid, bunny: bunny, fox: fox, carrot: carrot };
    var p = parity(grid);
    if (!p.ok) throw new Error('parity: ' + p.dark + ' dark and ' + p.light +
      ' light cells are blocked, so no domino tiling of the rest exists' + where);
    if (caught(st)) throw new Error('the fox already has her on the first frame' + where);
    return st;
  }

  /* ---------- parity, and it is not optional ----------
     A domino always covers one dark and one light cell of the checkerboard.
     So the cells the dominoes do NOT cover - the holes and the bricks - have
     to split evenly between the two colours, or no tiling of the rest exists
     at all. The generator will assert this before it searches; here it catches
     a mistyped hand-made board, which is how it was found in the first place. */
  function parity(grid) {
    var dark = 0, light = 0, i, p;
    for (i = 0; i < N; i++) {
      if (grid[i] !== HOLE && grid[i] !== BRICK) continue;
      p = rc(i); if ((p.r + p.c) & 1) light++; else dark++;
    }
    return { ok: dark === light, dark: dark, light: light };
  }

  /* ---------- tiles ---------- */
  function tileAt(grid, i) {
    switch (grid[i]) {
      case HL: return { a: i, b: i + 1, horiz: true };
      case HR: return { a: i - 1, b: i, horiz: true };
      case VT: return { a: i, b: i + C, horiz: false };
      case VB: return { a: i - C, b: i, horiz: false };
      default: return null;
    }
  }

  /* A TILE SLIDES ALONG ITS OWN AXIS AND NOTHING ELSE. A horizontal domino
     goes left and right; a vertical one goes up and down. That is the rule the
     whole sliding-block family runs on and it is what the 2014 game did: a
     brick that can also be shoved sideways is a different, looser game, and it
     was the wrong reading of §4.2.
       Directions are 0 up, 1 right, 2 down, 3 left, so the axis test is simply
     whether the direction is odd (horizontal) and the tile is too.
       The cell it moves into must be an empty hole. The bunny and the fox
     stand in holes and a brick does not slide over an animal. NOR OVER THE
     CARROT: the goal square is reserved, and the only thing that may ever
     share it is the bunny. */
  function canSlide(st, a, b, k) {
    var g = st.grid, horiz = (g[a] === HL);
    if (horiz !== ((k & 1) === 1)) return false;          // off-axis: refused
    var na = NBD[a][k], nb = NBD[b][k];
    if (na < 0 || nb < 0) return false;
    if (na !== a && na !== b && !freeForTile(st, na)) return false;
    if (nb !== a && nb !== b && !freeForTile(st, nb)) return false;
    return true;
  }
  function freeForTile(st, i) {
    return st.grid[i] === HOLE && i !== st.bunny && i !== st.fox && i !== st.carrot;
  }

  function slideMoves(st) {
    var out = [], g = st.grid, i, a, b, k;
    for (i = 0; i < N; i++) {
      if (g[i] !== HL && g[i] !== VT) continue;            // visit each tile once
      a = i; b = (g[i] === HL) ? i + 1 : i + C;
      for (k = 0; k < 4; k++)
        if (canSlide(st, a, b, k)) out.push({ type: 'slide', a: a, b: b, dir: k });
    }
    return out;
  }

  /* THE BUNNY IS NOT A MOVE ANY MORE. The owner's rule of 2026-09-07: the
     moment a path of holes joins her to the carrot she simply goes and takes
     it. So hopping her one square at a time is gone, sliding a slat is the
     only thing a player does, and a MOVE MEANS A SLIDE - which is what the
     move counter and par now count.

     What she still does is stand in the way: a slat cannot slide over an
     animal, so where she is placed is still part of the board. */
  function moves(st) { return slideMoves(st); }

  function apply(st, mv) {
    var g = new Uint8Array(st.grid), next;
    if (mv.type === 'hop') {
      next = { grid: g, bunny: mv.to, fox: st.fox, carrot: st.carrot };
    } else {
      var horiz = (st.grid[mv.a] === HL);
      var na = NBD[mv.a][mv.dir], nb = NBD[mv.b][mv.dir];
      g[mv.a] = HOLE; g[mv.b] = HOLE;
      g[na] = horiz ? HL : VT; g[nb] = horiz ? HR : VB;
      next = { grid: g, bunny: st.bunny, fox: st.fox, carrot: st.carrot };
    }
    return next;
  }

  /* ---------- the fox ----------
     4-connected components of holes. The bunny's cell, the fox's cell and the
     carrot's cell are all holes, so they take part. Returns a Uint8Array
     marking the fox's component, which is both the losing test and the shape
     the coral edge is drawn around. */
  function foxRegion(st) {
    var seen = new Uint8Array(N), stack = [st.fox], i, nb, k, ni;
    seen[st.fox] = 1;
    while (stack.length) {
      i = stack.pop(); nb = NB4[i];
      for (k = 0; k < nb.length; k++) {
        ni = nb[k];
        if (seen[ni] || st.grid[ni] !== HOLE) continue;
        seen[ni] = 1; stack.push(ni);
      }
    }
    return seen;
  }

  /* Whether he can reach her, without building the region array. The search
     asks this about every new position it generates and throws the array away
     every time, so it gets its own flood fill over ONE reused scratch buffer
     that stops the moment it touches her. */
  var _mark = new Uint8Array(N), _stack = new Int16Array(N), _epoch = 0;
  function caught(st) {
    _epoch++;
    if (_epoch > 250) { _mark = new Uint8Array(N); _epoch = 1; }   // wrap before 255
    var top = 0, i, nb, k, ni, g = st.grid, bunny = st.bunny;
    _mark[st.fox] = _epoch; _stack[top++] = st.fox;
    while (top) {
      i = _stack[--top]; nb = NB4[i];
      for (k = 0; k < nb.length; k++) {
        ni = nb[k];
        if (_mark[ni] === _epoch || g[ni] !== HOLE) continue;
        if (ni === bunny) return true;
        _mark[ni] = _epoch; _stack[top++] = ni;
      }
    }
    return false;
  }
  /* Won the moment the carrot is in the same pocket of holes she is. She walks
     the rest herself. Reaching it used to mean standing on it, which only made
     sense while hopping was a move the player spent. */
  function won(st) { return regionFrom(st, st.bunny)[st.carrot] === 1; }

  /* The 4-connected pocket of holes containing `cell`. foxRegion is this with
     the fox's cell filled in; both are here because the two questions - what
     can he reach, what can she reach - are asked about different cells. */
  function regionFrom(st, cell) {
    var seen = new Uint8Array(N), stack = [cell], i, nb, k, ni;
    seen[cell] = 1;
    while (stack.length) {
      i = stack.pop(); nb = NB4[i];
      for (k = 0; k < nb.length; k++) {
        ni = nb[k];
        if (seen[ni] || st.grid[ni] !== HOLE) continue;
        seen[ni] = 1; stack.push(ni);
      }
    }
    return seen;
  }

  /* Everything that must be true of a position, said out loud. A GENERATOR can
     produce a state no parse would ever accept - a fox standing on a slat, say
     - and nothing here complains: foxRegion starts from wherever he is, and
     canSlide keeps tiles off his cell either way. So he sits on a domino,
     unable to reach anything, and the level looks fine right up until
     something tries to write it down and finds half a tile missing. That is
     exactly what happened on 2026-09-07. */
  function validate(st, where) {
    var w = where ? ' in ' + where : '';
    if (st.grid[st.bunny] !== HOLE) throw new Error('the bunny is not standing in a hole' + w);
    if (st.grid[st.fox] !== HOLE) throw new Error('the fox is not standing in a hole' + w);
    if (st.grid[st.carrot] !== HOLE) throw new Error('the carrot is not in a hole' + w);
    if (st.bunny === st.fox) throw new Error('the bunny and the fox share a cell' + w);
    if (!parity(st.grid).ok) throw new Error('blocked cells do not split evenly by colour' + w);
    return true;
  }

  /* The key a search dedupes on. Nothing but the slats moves now, so the grid
     alone would do - the bunny is kept in it because she is still an obstacle
     and a level could in principle place her differently. Tiles are
     deliberately NOT labelled: two boards that differ only in which identical
     domino sits where are the same position, and labelling them would inflate
     the search space without changing a single answer. */
  /* Thirty-six cells each holding 0..5, plus where she is standing. Built with
     fromCharCode rather than by concatenating digits: the search makes one of
     these per generated position and string building was a real share of the
     running time. */
  function key(st) {
    return String.fromCharCode.apply(null, st.grid) + String.fromCharCode(st.bunny);
  }

  function clone(st) {
    return { grid: new Uint8Array(st.grid), bunny: st.bunny, fox: st.fox, carrot: st.carrot };
  }

  function ascii(st) {
    var out = [], r, c, i, g = st.grid, ch;
    for (r = 0; r < R; r++) {
      var line = '';
      for (c = 0; c < C; c++) {
        i = idx(r, c);
        ch = g[i] === BRICK ? '#' : g[i] === HOLE ? '.' :
             (g[i] === HL || g[i] === HR) ? '-' : '|';
        if (i === st.bunny) ch = 'B'; else if (i === st.fox) ch = 'F';
        else if (i === st.carrot && g[i] === HOLE) ch = 'C';
        line += ch;
      }
      out.push(line);
    }
    return out;
  }

  return {
    C: C, R: R, N: N,
    HOLE: HOLE, BRICK: BRICK, HL: HL, HR: HR, VT: VT, VB: VB,
    DIRS: DIRS, rc: rc, idx: idx, inside: inside, NB4: NB4, NBD: NBD,
    parse: parse, parity: parity, tileAt: tileAt, validate: validate,
    slideMoves: slideMoves, moves: moves, apply: apply,
    foxRegion: foxRegion, regionFrom: regionFrom, caught: caught, won: won,
    key: key, clone: clone, ascii: ascii
  };
});
