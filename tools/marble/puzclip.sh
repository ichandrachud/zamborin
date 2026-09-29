#!/bin/bash
# puzclip.sh <outdir> <kind> <square> <seconds> [name]: the puzzle pilot solves one square, a frame of it each screen frame
OUT=$1; K=$2; I=$3; SEC=$4; N=${5:-$K$I}; PORT=$((5500 + RANDOM % 400))
J="[{\"name\":\"$N\",\"url\":\"http://localhost:$PORT/marble/?harness=1#try-$K\",\"w\":390,\"h\":844,\"dpr\":1.5,\"mobile\":true,\"clear\":true,\"wait\":5500,\"actions\":[{\"script\":\"$(dirname $0)/puzpilot.js\"},{\"eval\":\"__marble.quiet(); __pp.show('$K', { only: $I })\"},{\"record\":$((SEC * 1000))},{\"eval\":\"JSON.stringify(window.__ppDone || 'not done')\"}]}]"
SERVE_DIR="$HOME/Projects/zamborin-marble" SERVE_PORT=$PORT node $(dirname $0)/shoot.mjs "$OUT" "$J" 2>&1 | grep -v "saved\|script"
bash $(dirname $0)/encode.sh "$OUT/$N-frames" $SEC "$OUT/$N.webm"
