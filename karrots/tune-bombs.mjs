/* Karrots — where a bomb earns its place.
 *
 * One bomb per level, in every world, and it MUST CHANGE PAR. That gate is
 * the same one the predator passes: a piece that does not change the answer is
 * scenery, and measured over 248 placements four in five dominoes are exactly
 * that.
 *
 * A bomb is a TRADE, not a gift, which is why the gate is worth having. It
 * adds the option to destroy a domino for two extra holes, and it removes the
 * option to slide that domino normally, so on the wrong piece it lengthens the
 * shortest solution and on a few it removes the solution altogether.
 *
 * Every candidate is put through the whole ship gate, not just the par test:
 * solvable at the full cap, par unchanged once the animals are free to wander,
 * and the predator still changing the answer. A bomb that quietly made a level
 * soluble without the predator would be a worse bug than no bomb at all.
 *
 * Run: node --max-old-space-size=8192 karrots/tune-bombs.mjs [world]
 * Writes /tmp/karrots-bombs.json.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
const require = createRequire(import.meta.url);
const M = require('./model.js');
const WORLDS = require('./worlds.json');
const { solve, foxChangesTheAnswer, parWhileTheyWander, BFS_CAP } = await import('./solve.mjs');

const CAP = 400000;
const dominoes = rows => {
  const s = new Set();
  rows.join('').split('').forEach(ch => {
    if (((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')) && !'BCF'.includes(ch)) s.add(ch);
  });
  return [...s].sort();
};

function assess(world, lv) {
  const base = M.parse(lv.rows, `${world}/${lv.n}`);
  const basePar = solve(base, { cap: CAP, path: false }).par;
  const out = { world, n: lv.n, basePar, candidates: [] };
  if (basePar === null) return out;
  for (const ch of dominoes(lv.rows)) {
    let st;
    try { st = M.parse(lv.rows, `${world}/${lv.n}`, { bombs: [ch] }); } catch { continue; }
    const r = solve(st, { cap: CAP, path: false });
    if (r.par === null) continue;                 // unsolvable with the bomb there
    if (r.par === basePar) continue;              // scenery: does not change the answer
    // the full ship gate, only for the few that got this far
    const wander = parWhileTheyWander(st, { cap: CAP });
    if (wander !== r.par) continue;               // leans on a doorway
    const fx = foxChangesTheAnswer(st, { cap: CAP, path: false });
    if (!fx.withFox.solved) continue;
    if (fx.without.solved && fx.without.par === r.par) continue;   // predator stopped mattering
    out.candidates.push({ bomb: ch, par: r.par, delta: r.par - basePar });
  }
  return out;
}

if (isMainThread) {
  const arg = process.argv[2];
  const jobs = [];
  if (arg && arg.endsWith('.json')) {
    /* A pool of unshipped boards, asked the same question: does any single
       domino on you carry a bomb that changes your par honestly? */
    const pool = require(arg);
    pool.forEach((b, i) => jobs.push({ world: 'spare', lv: { n: i, rows: b.rows } }));
  } else {
    for (const [world, levels] of Object.entries(WORLDS)) {
      if (arg && world !== arg) continue;
      levels.forEach(lv => jobs.push({ world, lv }));
    }
  }
  const N = 8;                       // eight cores; more processes make it slower, not faster
  const results = [];
  let next = 0, done = 0;
  await new Promise(resolve => {
    for (let w = 0; w < N; w++) {
      const spawn = () => {
        if (next >= jobs.length) { if (++done === N) resolve(); return; }
        const job = jobs[next++];
        const worker = new Worker(new URL(import.meta.url), { workerData: job });
        worker.on('message', m => { results.push(m); 
          console.log(`${m.world.padEnd(7)} ${String(m.n).padStart(2)}  par ${String(m.basePar).padStart(2)}  ` +
            `${m.candidates.length} placement(s) change it` +
            (m.candidates.length ? '  [' + m.candidates.map(c=>c.bomb+(c.delta>0?'+':'')+c.delta).join(' ') + ']' : '  NONE'));
          worker.terminate(); spawn(); });
        worker.on('error', e => { console.log('worker error', e.message); worker.terminate(); spawn(); });
      };
      spawn();
    }
  });
  results.sort((a,b) => a.world.localeCompare(b.world) || a.n - b.n);
  writeFileSync(process.env.KOUT || '/tmp/karrots-bombs.json', JSON.stringify(results, null, 1));
  const none = results.filter(r => !r.candidates.length);
  console.log(`\n${results.length} levels. ${results.length - none.length} have at least one placement that changes par.`);
  if (none.length) console.log('NO PLACEMENT: ' + none.map(r=>r.world+'/'+r.n).join(', '));
  const all = results.flatMap(r => r.candidates.map(c => c.delta));
  console.log(`${all.length} valid placements: ${all.filter(d=>d<0).length} shorten par, ${all.filter(d=>d>0).length} lengthen it.`);
  console.log('written to /tmp/karrots-bombs.json');
} else {
  parentPort.postMessage(assess(workerData.world, workerData.lv));
}
