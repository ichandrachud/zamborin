#!/bin/bash
# encode.sh <frames dir> <seconds recorded> <out.webm>
FF="$HOME/Library/Caches/ms-playwright/ffmpeg-1011/ffmpeg-mac"
n=$(ls "$1"/*.jpg | wc -l | tr -d ' ')
fps=$(python3 -c "print(round($n / $2, 2))")
cat "$1"/*.jpg | "$FF" -y -hide_banner -loglevel error -f image2pipe -c:v mjpeg -framerate "$fps" -i pipe:0 -c:v libvpx -b:v 2500k "$3" && echo "$3: $n frames at $fps fps"
