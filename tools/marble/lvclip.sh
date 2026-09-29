#!/bin/bash
# lvclip.sh <outdir> <level> <seconds> [fromZ]: the level autopilot plays through real touch; a burst of frames, made a webm
OUT=$1; N=$2; SEC=$3; FZ=$4; PORT=$((5500 + RANDOM % 400)); T=$(dirname $0)
FROM="{}"; [ -n "$FZ" ] && FROM="(() => { const C = __marble.course(); const f = C.pieces.find((p) => p.t === 'flat' && Math.abs(p.z - ($FZ)) < p.d / 2); return { from: [f.x, f.y + 0.43, $FZ] }; })()"
J="[{\"name\":\"lv$N\",\"url\":\"http://localhost:$PORT/marble/?harness=1#level-$N\",\"w\":390,\"h\":844,\"dpr\":1.5,\"mobile\":true,\"clear\":true,\"wait\":6000,\"actions\":[{\"script\":\"$T/pzsolve.js\"},{\"script\":\"$T/pilot.js\"},{\"script\":\"$T/puzpilot.js\"},{\"script\":\"$T/spctl.js\"},{\"eval\":\"__marble.quiet(); __pilot.live($N, $((SEC + 5)), 0.25, $FROM); 'driving'\"},{\"record\":$((SEC * 1000))}]}]"
SERVE_DIR="$HOME/Projects/zamborin-marble" SERVE_PORT=$PORT node $T/shoot.mjs "$OUT" "$J" 2>&1 | grep -v "saved\|script"
bash $T/encode.sh "$OUT/lv$N-frames" $SEC "$OUT/level-$N.webm"
