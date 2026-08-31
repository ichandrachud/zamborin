/* ============================================================
   FATHOM · mineral ladder model
   ------------------------------------------------------------
   Not a spreadsheet of invented numbers. This simulates a dive
   against the sim's own constants and asks one question of every
   candidate table:

     at each depth, in each boat, what load makes the most money
     per minute — and is that load an INTERIOR choice?

   An optimum at "carry nothing" or at "fill the hold" is not a
   decision, it is a script. The whole point of the law is that
   the last fifty kilograms should be a question.

   Run: node ladder-model.mjs
   ============================================================ */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const T = require('./sim.js').TUNE;

const SPARE = T.DISPLACEMENT - T.HULL_DRY;      // 300 kg of lift, the soft wall

/* ---------- one dive, costed ----------
   Descend flooded, dig n pieces, climb home. Air runs the whole time and
   the climb slows as the hold fills, which is where the money is decided. */
export function dive({ depth, kgEach, digSeconds, n, hold, airMax, battMax, travelPerTile = 2.4 }) {
  const cargo = n * kgEach;
  if (cargo > hold) return null;                       // will not fit
  const down = depth / Math.min(T.vMax, (SPARE + T.ballastMax - SPARE) * T.buoyK || 32);
  const dig = n * (digSeconds + travelPerTile);
  const lift = SPARE - cargo;
  if (lift <= 0) return null;                          // cannot rise at all
  const up = depth / Math.min(T.vMax, lift * T.buoyK);
  const seconds = down + dig + up;
  const air = seconds * T.lifeSupport;
  const batt = n * digSeconds * T.digBatt;
  if (air > airMax) return null;                       // drowns
  if (batt > battMax) return null;                     // flat before it fills
  return { n, cargo, seconds, air, batt };
}

/* The best load for one boat at one depth on one mineral, and whether that
   best is interior: neither the first piece nor a full hold. */
export function bestLoad(opts, value) {
  const rows = [];
  for (let n = 1; n <= 200; n++) {
    const d = dive({ ...opts, n });
    if (!d) break;
    rows.push({ ...d, money: n * value, perMin: (n * value) / (d.seconds / 60) });
  }
  if (!rows.length) return null;
  let best = rows[0];
  for (const r of rows) if (r.perMin > best.perMin) best = r;
  const maxN = rows[rows.length - 1].n;
  const holdCap = Math.floor(opts.hold / opts.kgEach);
  return {
    ...best,
    maxN,
    interior: best.n > 1 && best.n < maxN,
    stoppedBy: maxN >= holdCap ? 'hold' : 'the law',
    utilisation: +(best.cargo / SPARE).toFixed(2),
  };
}

export { SPARE, T };
