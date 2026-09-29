#!/bin/bash
# lvrun.sh <first> <last> <out>: the level autopilot plays levels first..last in fast mode (careful), one result each
A=$1; B=$2; OUT=$3; PORT=$((5500 + RANDOM % 400)); T=$(dirname $0)
EV="(() => { const res = []; for (let n = $A; n <= $B; n++) { let r; try { r = __pilot.fast(n, 900, ${OPTS}); } catch (e) { r = { n, error: e.message + ' ' + (e.stack || '').split('\\\\n')[1] }; } res.push({ n, won: r.won, clock: r.clock, falls: r.falls, why: r.why, step: r.step, of: r.of, ball: r.ball, log: r.log && r.log.slice(0, 4), error: r.error, len: __marble.course().length }); } return JSON.stringify(res); })()"
J="[{\"name\":\"lv\",\"url\":\"http://localhost:$PORT/marble/?harness=1#level-$A\",\"w\":390,\"h\":844,\"dpr\":1,\"mobile\":true,\"clear\":true,\"wait\":5000,\"actions\":[{\"script\":\"$T/pzsolve.js\"},{\"script\":\"$T/pilot.js\"},{\"script\":\"$T/puzpilot.js\"},{\"script\":\"$T/spctl.js\"},{\"eval\":\"$EV\"}]}]"
SERVE_DIR="$HOME/Projects/zamborin-marble" SERVE_PORT=$PORT node $T/shoot.mjs /tmp/lv-$PORT "$J" 2>&1 | grep "eval:\|ERROR" | sed 's/^lv eval: //' > $OUT
rm -rf /tmp/lv-$PORT
