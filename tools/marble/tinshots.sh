#!/bin/bash
# tinshots.sh <outdir> <level> <tag>: the tin toy circus on a phone (start, part way), desktop, and two wide views
OUT=$1; N=$2; TAG=$3; PORT=$((5500 + RANDOM % 400)); U="http://localhost:$PORT/marble/?harness=1"
PL="(() => { __marble.quiet(); const C = __marble.course(); const fl = C.pieces.filter((p) => p.t === 'flat' && p.w > 1.6); const f = fl[Math.floor(fl.length * FR)]; const p = __marble.place(f.x, f.y + 0.43, f.z); __cqSnap(); return p; })()"
PK="(() => { __marble.quiet(); const C = __marble.course(); const P = C.pieces.filter((p) => typeof p.y === 'number' && typeof p.z === 'number'), xs = P.map((p) => p.x), ys = P.map((p) => p.y), zs = P.map((p) => p.z); const cx = (Math.min(...xs) + Math.max(...xs)) / 2, lo = Math.min(...ys), z0 = Math.max(...zs); __marble.peek([cx + DX, lo + DY, z0 + DZ], [cx, lo - 6, z0 - AZ], FOV); return [cx, lo, z0]; })()"
pk() { local P=${PK//DX/$1}; P=${P//DY/$2}; P=${P//DZ/$3}; P=${P//AZ/$4}; echo "${P//FOV/$5}"; }
J="[{\"name\":\"$TAG-a\",\"url\":\"$U#circus-tintoy-$N\",\"w\":390,\"h\":844,\"dpr\":1.5,\"mobile\":true,\"clear\":true,\"wait\":8000,\"actions\":[{\"eval\":\"__marble.quiet(); 1\"},{\"sleep\":800},{\"snap\":\"$TAG-a\"}]},"
J="$J{\"name\":\"$TAG-b\",\"url\":\"$U#circus-tintoy-$N\",\"w\":390,\"h\":844,\"dpr\":1.5,\"mobile\":true,\"clear\":true,\"wait\":8000,\"actions\":[{\"eval\":\"${PL//FR/0.5}\"},{\"sleep\":2500},{\"snap\":\"$TAG-b\"}]},"
J="$J{\"name\":\"$TAG-d\",\"url\":\"$U&embed=1#circus-tintoy-$N\",\"w\":800,\"h\":632,\"dpr\":1,\"clear\":true,\"wait\":8000,\"actions\":[{\"eval\":\"${PL//FR/0.3}\"},{\"sleep\":2500},{\"snap\":\"$TAG-d\"}]},"
J="$J{\"name\":\"$TAG-w\",\"url\":\"$U&embed=1#circus-tintoy-$N\",\"w\":1200,\"h\":760,\"dpr\":1,\"clear\":true,\"wait\":8000,\"actions\":[{\"eval\":\"$(pk 5 5 22 40 68)\"},{\"sleep\":2500},{\"snap\":\"$TAG-w\"}]},"
J="$J{\"name\":\"$TAG-x\",\"url\":\"$U&embed=1#circus-tintoy-$N\",\"w\":1200,\"h\":760,\"dpr\":1,\"clear\":true,\"wait\":8000,\"actions\":[{\"eval\":\"$(pk -14 4 -10 -44 72)\"},{\"sleep\":2500},{\"snap\":\"$TAG-x\"}]}]"
SERVE_DIR="$HOME/Projects/zamborin-marble" SERVE_PORT=$PORT node $(dirname $0)/shoot.mjs "$OUT" "$J" 2>&1 | grep -i "error\|eval\|exception" | grep -v googlesyn
cd "$OUT" && python3 - <<PY
from PIL import Image
a=Image.open('$TAG-a.png').convert('RGB'); b=Image.open('$TAG-b.png').convert('RGB')
W=Image.new('RGB',(a.width*2+12,a.height),'white'); W.paste(a,(0,0)); W.paste(b,(a.width+12,0)); W.resize((W.width//2,W.height//2)).save('$TAG-phone.png')
ims=[Image.open('$TAG-'+k+'.png').convert('RGB') for k in 'wx']
W=Image.new('RGB',(1200,760*2+12),'white'); W.paste(ims[0],(0,0)); W.paste(ims[1],(0,772)); W.resize((900,(760*2+12)*3//4)).save('$TAG-wide.png')
PY
