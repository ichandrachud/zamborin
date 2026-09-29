#!/bin/bash
# czladrun.sh <id> <out.json>: every square of one circus ladder (#try-l<id>0..2, id as ck, cp, cs ...), alone, careful then careless
K=$1; OUT=$2; PORT=$((5500 + RANDOM % 400)); T=$(dirname $0)
EV="(() => { const res = []; for (const b of [0, 1, 2]) { const kind = 'l$K' + b; __marble.reach(kind); const n = __marble.spz().length; for (let i = 0; i < n; i++) { const c = __pp.run(kind, { only: i, limit: 150 }); const k = __pp.run(kind, { only: i, careless: true, limit: 45 }); const sq = (r) => (r.squares && r.squares[0]) || {}; res.push({ id: kind + ':' + i, ok: c.won, falls: c.falls, t: sq(c).t, note: sq(c).note, careless: k.won && !sq(k).short, cnote: sq(k).note }); } } return JSON.stringify(res); })()"
J="[{\"name\":\"lad-$K\",\"url\":\"http://localhost:$PORT/marble/?harness=1#try-l${K}0\",\"w\":390,\"h\":844,\"dpr\":1,\"mobile\":true,\"clear\":true,\"wait\":5000,\"actions\":[{\"script\":\"$T/puzpilot.js\"},{\"eval\":\"$EV\"}]}]"
SERVE_DIR="$HOME/Projects/zamborin-marble" SERVE_PORT=$PORT node $T/shoot.mjs /tmp/lad-$PORT "$J" 2>&1 | grep "eval:" | sed 's/^lad-[a-z]* eval: //' > $OUT
rm -rf /tmp/lad-$PORT
