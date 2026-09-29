#!/bin/bash
# spaceclip.sh <outdir> <kind> <seconds>: the space pilot plays a try-out course, a frame of it each screen frame
OUT=$1; K=$2; SEC=$3; PORT=$((5500 + RANDOM % 400))
J="[{\"name\":\"$K\",\"url\":\"http://localhost:$PORT/marble/?harness=1#try-$K\",\"w\":390,\"h\":844,\"dpr\":1.5,\"mobile\":true,\"clear\":true,\"wait\":5500,\"actions\":[{\"script\":\"$(dirname $0)/spacepilot.js\"},{\"eval\":\"__sp.show('$K')\"},{\"record\":$((SEC * 1000))}]}]"
SERVE_DIR="$HOME/Projects/zamborin-marble" SERVE_PORT=$PORT node $(dirname $0)/shoot.mjs "$OUT" "$J" 2>&1 | grep -v "saved\|script"
bash $(dirname $0)/encode.sh "$OUT/$K-frames" $SEC "$OUT/$K.webm"
