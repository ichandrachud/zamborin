#!/bin/bash
# build-circus.sh: marble/play.js = main's play.js at 4af344d (the pinball world live) + the circus chunks here.
# Run from anywhere; writes the worktree's marble/play.js and checks that it parses.
H=$(cd $(dirname $0) && pwd); R=$(cd $H/../../.. && pwd)
cat $H/cq1-kit.js $H/cq2-art.js $H/cq3-world.js $H/cq4-midway.js $H/cq8-batch.js $H/cq6-tin.js $H/cq9-pieces.js $H/cq7-check.js $H/cq5-register.js > /tmp/circus-chunk.$$.js
cd "$R" && git show 4af344d:marble/play.js > marble/play.js && python3 $H/integrate-circus.py marble/play.js /tmp/circus-chunk.$$.js && rm /tmp/circus-chunk.$$.js
node -e "const s=require('fs').readFileSync('marble/play.js','utf8'); try { new Function(s.replace(/^import[\s\S]*?from '.\/assets\/three-r186.min.js';/m,'')); console.log('parses'); } catch(e) { console.log('SYNTAX', e.message); }"
