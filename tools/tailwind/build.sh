#!/bin/bash
# Tailwind's 3D: the six aeroplanes (Blender, then packed) and the three.js bundle.
# Needs Blender in /Applications and a folder with three@0.186.1, esbuild and gltfpack installed (THREE_BUILD,
# default ~/Projects/three-build). Run from anywhere: bash tools/tailwind/build.sh
set -e
HERE=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$HERE/../.." && pwd)
TB=${THREE_BUILD:-$HOME/Projects/three-build}; OUT="$REPO/tailwind/assets/planes"; TMP=$(mktemp -d)
/Applications/Blender.app/Contents/MacOS/Blender -b -P "$HERE/fleet.py" -- "$TMP" "$@" 2>&1 | grep -E "BUILT|Error|Traceback" || true
for f in "$TMP"/*.glb; do
  "$TB/node_modules/.bin/gltfpack" -i "$f" -o "$OUT/$(basename "$f")" -c -si 0.7 -kn -km >/dev/null
  echo "packed $(basename "$f"): $(( $(stat -f%z "$OUT/$(basename "$f")") / 1024 )) KB"
done
rm -rf "$TMP"
NODE_PATH="$TB/node_modules" "$TB/node_modules/.bin/esbuild" "$HERE/three-entry.js" --bundle --format=esm --minify \
  --outfile="$REPO/tailwind/assets/three-r186.min.js" --log-level=warning
echo "three: $(( $(stat -f%z "$REPO/tailwind/assets/three-r186.min.js") / 1024 )) KB"
