// The puzzle squares' rules, as a search: which moves the marble can make from
// each state, and the shortest way out. The game follows the same rules; the
// autopilot uses this to play a square; the checker uses it to test layouts.
// Works in the browser (window.__pz) and in node (module.exports).
(function (root) {
  const DIRS = { n: [0, 1], s: [0, -1], e: [1, 0], w: [-1, 0] };
  const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
  const BIT = { n: 1, e: 2, s: 4, w: 8 };
  const ORDER = ['n', 'e', 's', 'w'];
  const rotCW = (m) => { let o = 0; ORDER.forEach((d, i) => { if (m & BIT[d]) o |= BIT[ORDER[(i + 1) % 4]]; }); return o; };
  const K = (c, r) => c + ',' + r;

  function parse(T) {
    const lines = T.map, rows = (lines.length - 1) / 2, cols = (lines[0].length - 1) / 2;
    const cells = {}, H = {}, V = {};
    lines.forEach((L, li) => {
      if (L.length !== 2 * cols + 1) throw new Error(`${T.id}: line ${li} is ${L.length} long, not ${2 * cols + 1}: "${L}"`);
      if (li % 2 === 0) { const k = rows - li / 2; for (let c = 0; c < cols; c++) H[K(c, k)] = L[2 * c + 1]; }
      else {
        const r = rows - 1 - (li - 1) / 2;
        for (let c = 0; c < cols; c++) cells[K(c, r)] = L[2 * c + 1];
        for (let c = 0; c <= cols; c++) V[K(c, r)] = L[2 * c];
      }
    });
    return { cols, rows, cells, H, V };
  }

  class Square {
    constructor(T) {
      this.T = T;
      Object.assign(this, parse(T));
      const L = T.legend || {};
      const edgeOf = (ch) => (ch === ' ' || ch === '+' ? null : ch === '-' || ch === '|' ? 'wall' : { ...L[ch], ch });
      this.cell = {}; this.edge = {};
      for (const [k, ch] of Object.entries(this.cells)) {
        if (ch === '.') this.cell[k] = {};
        else if (ch === '#') this.cell[k] = { void: true };
        else { if (!L[ch]) throw new Error(`${T.id}: no legend for cell "${ch}"`); this.cell[k] = { ...L[ch], ch }; }
      }
      for (const [k, ch] of Object.entries(this.H)) { if (ch !== ' ' && ch !== '-' && !L[ch]) throw new Error(`${T.id}: no legend for edge "${ch}"`); this.edge['H' + k] = edgeOf(ch); }
      for (const [k, ch] of Object.entries(this.V)) { if (ch !== ' ' && ch !== '|' && !L[ch]) throw new Error(`${T.id}: no legend for edge "${ch}"`); this.edge['V' + k] = edgeOf(ch); }
      this.entry = T.entry; this.exit = T.exit;
      if (this.edge['H' + K(this.entry, 0)] !== null) throw new Error(`${T.id}: the way in must be open`);
      const keys = (f) => Object.keys(this.cell).filter((k) => f(this.cell[k])).sort();
      const ekeys = (f) => Object.keys(this.edge).filter((k) => this.edge[k] && this.edge[k] !== 'wall' && f(this.edge[k])).sort();
      this.peds = keys((d) => 'key' in d);
      this.sgates = ekeys((e) => 'sgate' in e);
      this.kgates = ekeys((e) => 'keygate' in e);
      this.tiles = keys((d) => 'tile' in d);
      this.mirrors = keys((d) => 'mirror' in d);
      this.weights0 = keys((d) => d.weight).join(';');
      this.pits = keys((d) => d.pit);                                // pits: a crate pushed in fills one, and it is floor after
      const src = ekeys((e) => 'source' in e);
      this.source = src[0] || null;
    }
    edgeKey(c, r, d) { return d === 'n' ? 'H' + K(c, r + 1) : d === 's' ? 'H' + K(c, r) : d === 'e' ? 'V' + K(c + 1, r) : 'V' + K(c, r); }
    inside(c, r) { return c >= 0 && c < this.cols && r >= 0 && r < this.rows; }
    start() {
      return { pos: [this.entry, 0], held: 0, ped: this.peds.map((k) => this.cell[k].key), kg: this.kgates.map(() => 0),
               sg: this.sgates.map((k) => (this.edge[k].open ? 1 : 0)), W: this.weights0, tiles: this.tiles.map((k) => this.cell[k].tile),
               charged: 0, mir: this.mirrors.map((k) => this.cell[k].mirror), F: '' };
    }
    id(s) { return `${s.pos};${s.held};${s.ped};${s.kg};${s.sg};${s.W};${s.tiles};${s.charged};${s.mir.join('')};${s.F || ''}`; }
    filled(s, k) { return !!s.F && s.F.split(';').includes(k); }
    weights(s) { return s.W ? s.W.split(';') : []; }
    mask(s, c, r) {
      const d = this.cell[K(c, r)];
      if (d.void) return 0;
      if (d.pit && !this.filled(s, K(c, r))) return 0;             // an open pit: the marble would drop
      if ('tile' in d) return s.tiles[this.tiles.indexOf(K(c, r))];
      return 15;
    }
    // The beam: from the source, along its row or column, turned by each mirror; lit if it leaves through the receptor.
    beam(s) {
      if (!this.source) return { lit: false, path: [] };
      const e = this.edge[this.source], kind = this.source[0], [a, b] = this.source.slice(1).split(',').map(Number);
      let d = e.source, c, r;
      if (kind === 'V') { r = b; c = d === 'e' ? a : a - 1; } else { c = a; r = d === 'n' ? b : b - 1; }
      const path = [[c, r, d]];
      for (let i = 0; i < 80; i++) {
        if (!this.inside(c, r)) return { lit: false, path };
        const mi = this.mirrors.indexOf(K(c, r));
        if (mi >= 0) d = s.mir[mi] === '/' ? { n: 'e', e: 'n', s: 'w', w: 's' }[d] : { n: 'w', w: 'n', s: 'e', e: 's' }[d];
        const ek = this.edgeKey(c, r, d), ed = this.edge[ek];
        const [dc, dr] = DIRS[d];
        if (!this.inside(c + dc, r + dr)) return { lit: !!(ed && ed !== 'wall' && ed.receptor), path, out: [c, r, d] };
        c += dc; r += dr; path.push([c, r, d]);
      }
      return { lit: false, path };
    }
    pressed(s, letter) { return this.weights(s).some((k) => this.cell[k].plate === letter); }
    // Can the marble (or a crate) cross the edge from (c, r) toward d? And does crossing use up the key it holds?
    passable(s, c, r, d, crate) {
      const ek = this.edgeKey(c, r, d), e = this.edge[ek];
      if (e === 'wall') return [false];
      if (e === null || e === undefined) return [true];
      if (crate) return [false];                                   // crates never cross a gate, open or shut
      if ('keygate' in e) {
        const i = this.kgates.indexOf(ek);
        if (s.kg[i]) return [true];
        if (s.held === e.keygate) return [true, i];
        return [false];
      }
      if ('sgate' in e) return [!!s.sg[this.sgates.indexOf(ek)]];
      if ('pgate' in e) return [this.pressed(s, e.pgate)];
      if ('cgate' in e) return [!!s.charged];
      if ('lgate' in e) return [this.beam(s).lit];
      return [false];                                             // a source or a receptor: part of the wall
    }
    enter(s, c, r) {
      const d = this.cell[K(c, r)];
      s = { ...s, pos: [c, r] };
      if (d.reset) { const z = this.start(); return { ...z, pos: [c, r] }; }
      if ('key' in d) {
        const i = this.peds.indexOf(K(c, r)), ped = s.ped.slice();
        [s.held, ped[i]] = [ped[i], s.held]; s.ped = ped;
      }
      if ('switch' in d) s.sg = s.sg.map((v, i) => (this.edge[this.sgates[i]].sgate.includes(d.switch) ? 1 - v : v));
      if ('lever' in d && !('tile' in d)) s.tiles = s.tiles.map((m, i) => (this.cell[this.tiles[i]].lever.includes(d.lever) ? rotCW(m) : m));
      if (d.charger) s.charged = 1;
      if (d.ground) s.charged = 0;
      if ('mirror' in d) { const i = this.mirrors.indexOf(K(c, r)), mir = s.mir.slice(); mir[i] = mir[i] === '/' ? '\\' : '/'; s.mir = mir; }
      return s;
    }
    *moves(s) {
      const [c, r] = s.pos;
      for (const d of ORDER) {
        const [dc, dr] = DIRS[d], nc = c + dc, nr = r + dr;
        if (c === this.exit && r === this.rows - 1 && d === 'n') { if (this.passable(s, c, r, d)[0]) yield [d, 'EXIT']; continue; }
        if (!this.inside(nc, nr)) continue;
        if (!(this.mask(s, c, r) & BIT[d]) || !(this.mask(s, nc, nr) & BIT[OPP[d]])) continue;
        const [ok, used] = this.passable(s, c, r, d);
        if (!ok) continue;
        if (this.cell[K(nc, nr)].magnet && s.charged) continue;
        let t = { ...s };
        if (used !== undefined) { const kg = t.kg.slice(); kg[used] = 1; t.kg = kg; t.held = 0; }
        const W = this.weights(s), at = K(nc, nr);
        if (W.includes(at)) {                                       // a push
          const tc = nc + dc, tr = nr + dr, to = K(tc, tr);
          if (!this.inside(tc, tr) || !this.passable(t, nc, nr, d, true)[0] || W.includes(to)) continue;
          const td = this.cell[to];
          if (td.void || 'tile' in td) continue;
          if (td.pit && !this.filled(t, to)) {                       // into an open pit: it fills it, and is gone
            t.W = W.filter((k) => k !== at).join(';');
            t.F = [...(t.F ? t.F.split(';') : []), to].sort().join(';');
          } else t.W = W.map((k) => (k === at ? to : k)).sort().join(';');
        }
        yield [d, this.enter(t, nc, nr)];
      }
    }
    solve(limit = 300000, from = null) {
      const s0 = from || this.start(), prev = new Map([[this.id(s0), null]]), states = new Map([[this.id(s0), s0]]), q = [s0];
      for (let h = 0; h < q.length; h++) {
        const s = q[h];
        for (const [d, t] of this.moves(s)) {
          if (t === 'EXIT') {
            const path = [];
            for (let k = this.id(s); k; k = prev.get(k)) path.push(states.get(k));
            path.reverse();
            return { path, explored: prev.size };
          }
          const k = this.id(t);
          if (!prev.has(k)) { prev.set(k, this.id(s)); states.set(k, t); q.push(t); if (prev.size > limit) return { path: null, explored: prev.size }; }
        }
      }
      return { path: null, explored: prev.size };
    }
    // Every state the marble can reach, and how many of them can no longer reach the way out (traps).
    survey(limit = 300000) {
      const s0 = this.start(), ids = new Map([[this.id(s0), 0]]), list = [s0], out = [], exits = new Set();
      for (let h = 0; h < list.length; h++) {
        const s = list[h], mine = [];
        for (const [d, t] of this.moves(s)) {
          if (t === 'EXIT') { exits.add(h); continue; }
          const k = this.id(t);
          if (!ids.has(k)) { ids.set(k, list.length); list.push(t); if (list.length > limit) return null; }
          mine.push(ids.get(k));
        }
        out.push(mine);
      }
      const rev = list.map(() => []);
      out.forEach((m, i) => m.forEach((j) => rev[j].push(i)));
      const good = new Set(exits), q = [...exits];
      while (q.length) { const i = q.pop(); for (const p of rev[i]) if (!good.has(p)) { good.add(p); q.push(p); } }
      return { states: list.length, traps: list.length - good.size };
    }
    // The cells on a solution where something happens, in order.
    actions(path) {
      const out = [];
      for (let i = 1; i < path.length; i++) {
        const [c, r] = path[i].pos, d = this.cell[K(c, r)];
        const pushed = path[i].W !== path[i - 1].W;
        if (pushed) out.push('push@' + K(c, r));
        if (['key', 'switch', 'lever', 'charger', 'ground', 'mirror', 'reset'].some((k) => k in d)) out.push(Object.keys(d).filter((k) => k !== 'ch')[0] + '@' + K(c, r));
      }
      return out;
    }
  }
  // Mirror a layout left to right: the map, the ways in and out, and anything that points.
  function flip(T) {
    const sw = (s) => s.split('').reverse().join('');
    const cols = (T.map[0].length - 1) / 2, legend = {};
    for (const [ch, v] of Object.entries(T.legend || {})) {
      const u = { ...v };
      if (u.mirror) u.mirror = u.mirror === '/' ? '\\' : '/';
      if (u.source) u.source = { e: 'w', w: 'e' }[u.source] || u.source;
      if ('tile' in u) { const m = u.tile; u.tile = (m & 5) | (m & 2 ? 8 : 0) | (m & 8 ? 2 : 0); }
      legend[ch] = u;
    }
    return { ...T, id: T.id + '~', map: T.map.map(sw), legend, entry: cols - 1 - T.entry, exit: cols - 1 - T.exit, flipped: !T.flipped };
  }
  const api = { Square, parse, flip, rotCW, BIT, DIRS, ORDER, K };
  if (typeof module !== 'undefined') module.exports = api; else root.__pz = api;
})(typeof window !== 'undefined' ? window : globalThis);
