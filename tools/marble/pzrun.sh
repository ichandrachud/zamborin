#!/bin/bash
# pzrun.sh <kinds...>: the puzzle pilot, careful then careless, on each try-out course (fast mode)
PORT=$((5500 + RANDOM % 400)); T=$(dirname $0); J='['
for K in "$@"; do J="$J{\"name\":\"run-$K\",\"url\":\"http://localhost:$PORT/marble/?harness=1#try-$K\",\"w\":390,\"h\":844,\"dpr\":1,\"mobile\":true,\"clear\":true,\"wait\":4500,\"actions\":[{\"script\":\"$T/puzpilot.js\"},{\"eval\":\"JSON.stringify(__pp.run('$K'))\"},{\"eval\":\"JSON.stringify(__pp.run('$K', { careless: true, limit: 45 }))\"}]},"; done
J="${J%,}]"
SERVE_DIR="$HOME/Projects/zamborin-marble" SERVE_PORT=$PORT node $T/shoot.mjs /tmp/pzrun-$PORT "$J" 2>&1 | grep -v "saved$\|script:"
rm -rf /tmp/pzrun-$PORT
