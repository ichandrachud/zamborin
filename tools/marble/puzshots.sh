#!/bin/bash
# puzshots.sh <outdir> <try> [w h]: each puzzle square of a try-out course (#try-<try>) as the camera frames it, the
# marble just inside the way in (a phone, 390 x 844, unless a size is given).
OUT=$1; TRY=$2; W=${3:-390}; H=${4:-844}; PORT=$((5500 + RANDOM % 400)); MOB=$([ "$W" -lt 600 ] && echo true || echo false)
A=''; for j in 0 1 2 3 4 5 6 7 8 9; do
  E="(() => { const q = __marble.spz().sort((a, b) => b.z0 - a.z0)[$j]; if (!q) return 'none'; __marble.place(q.x0 + (q.entry + 0.5) * 2.2, q.y + 0.43, q.z0 - 1.1); return q.kind; })()"
  A="$A{\"eval\":\"$E\"},{\"sleep\":2600},{\"snap\":\"$TRY-$j\"},"
done
J="[{\"name\":\"$TRY\",\"url\":\"http://localhost:$PORT/marble/?harness=1&embed=1#try-$TRY\",\"w\":$W,\"h\":$H,\"dpr\":1,\"mobile\":$MOB,\"clear\":true,\"wait\":6000,\"actions\":[{\"eval\":\"__marble.quiet()\"},${A%,}]}]"
SERVE_DIR="$HOME/Projects/zamborin-marble" SERVE_PORT=$PORT node $(dirname $0)/shoot.mjs "$OUT" "$J" 2>&1 | grep -i "error\|eval" | grep -v googlesyn
