#!/bin/bash
# cqhide.sh <look> <levels...>: how much of the course the circus hides, from the camera all along it, phone and desktop
LOOK=$1; shift; PORT=$((5500 + RANDOM % 400)); J='['
for N in "$@"; do
  J="$J{\"name\":\"h$N-p\",\"url\":\"http://localhost:$PORT/marble/?harness=1#circus-$LOOK-$N\",\"w\":390,\"h\":844,\"dpr\":1,\"mobile\":true,\"clear\":true,\"wait\":7000,\"actions\":[{\"eval\":\"__marble.quiet(); JSON.stringify(__cqHide(3, ${SAB:-false}))\"}]},"
  J="$J{\"name\":\"h$N-d\",\"url\":\"http://localhost:$PORT/marble/?harness=1&embed=1#circus-$LOOK-$N\",\"w\":800,\"h\":632,\"dpr\":1,\"clear\":true,\"wait\":7000,\"actions\":[{\"eval\":\"__marble.quiet(); JSON.stringify(__cqHide(3, ${SAB:-false}))\"}]},"
done
J="${J%,}]"
SERVE_DIR="$HOME/Projects/zamborin-marble" SERVE_PORT=$PORT node $(dirname $0)/shoot.mjs ${OUT:-/tmp/cqhide} "$J" 2>&1 | grep -i "eval\|error" | grep -v googlesyn
