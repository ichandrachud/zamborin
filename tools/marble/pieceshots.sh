#!/bin/bash
# pieceshots.sh <outdir> <tag> <level:type[:kind]> ...: each piece in the circus, from a camera just behind and above it
OUT=$1; TAG=$2; shift 2; PORT=$((5500 + RANDOM % 400)); J='['; NAMES=()
for spec in "$@"; do
  IFS=: read N T KIND <<< "$spec"; NM="$TAG-$N-$T${KIND:+-$KIND}"; NAMES+=("$NM")
  E="(() => { __marble.quiet(); const P = __marble.course().pieces.filter((p) => p.t === '$T' && ('$KIND' === '' || p.kind === '$KIND') && typeof p.z === 'number'); if (!P.length) return 'none'; const p = P[0], y = typeof p.y === 'number' ? p.y : 0, x = typeof p.x === 'number' ? p.x : 0; __marble.peek([x + 2.5, y + 6.5, p.z + 11], [x, y + 0.5, p.z - 1.5], 52); return [x, y, p.z]; })()"
  J="$J{\"name\":\"$NM\",\"url\":\"http://localhost:$PORT/marble/?harness=1&embed=1#circus-tintoy-$N\",\"w\":800,\"h\":600,\"dpr\":1,\"clear\":true,\"wait\":7000,\"actions\":[{\"eval\":\"$E\"},{\"sleep\":1500},{\"snap\":\"$NM\"}]},"
done
J="${J%,}]"
SERVE_DIR="$HOME/Projects/zamborin-marble" SERVE_PORT=$PORT node $(dirname $0)/shoot.mjs "$OUT" "$J" 2>&1 | grep -i "error\|eval" | grep -v googlesyn
cd "$OUT" && python3 - "${NAMES[@]}" <<'PY'
import sys
from PIL import Image, ImageDraw, ImageFont
names=sys.argv[1:]; F=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
cols=4; w,h=400,300; rows=(len(names)+cols-1)//cols
W=Image.new('RGB',(cols*w+(cols-1)*6, rows*(h+30)),'white'); g=ImageDraw.Draw(W)
for i,n in enumerate(names):
    try: im=Image.open(n+'.png').convert('RGB').resize((w,h))
    except Exception: continue
    x=(i%cols)*(w+6); y=(i//cols)*(h+30); W.paste(im,(x,y+30)); g.text((x+4,y+4),n.split('-',1)[1],font=F,fill=(0,0,0))
W.save(names[0].split('-')[0]+'-sheet.png')
PY
