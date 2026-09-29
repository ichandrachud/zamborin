#!/bin/bash
# circrun.sh <kind> [careless runs]: the circus pilot on one try-out course (#try-fire ...), careful once, then careless
# N times with different waits; one JSON result a line.
K=$1; N=${2:-3}; PORT=$((5500 + RANDOM % 400)); T=$(dirname $0)
EV="(() => { const out = [__cp.run('$K')]; for (let s = 1; s <= $N; s++) out.push(__cp.run('$K', { careless: true, seed: s * 7 })); return JSON.stringify(out.map((o) => ({ won: o.won, falls: o.falls, clock: o.clock, first: o.log && o.log[0] }))); })()"
J="[{\"name\":\"cp\",\"url\":\"http://localhost:$PORT/marble/?harness=1#try-$K\",\"w\":390,\"h\":844,\"dpr\":1,\"mobile\":true,\"clear\":true,\"wait\":6000,\"actions\":[{\"script\":\"$T/circuspilot.js\"},{\"eval\":\"$EV\"}]}]"
SERVE_DIR="$HOME/Projects/zamborin-marble" SERVE_PORT=$PORT node $T/shoot.mjs /tmp/cp-$PORT "$J" 2>&1 | grep "eval:\|ERROR" | grep -v "circus pilot ready" | sed 's/^cp eval: //'
rm -rf /tmp/cp-$PORT
