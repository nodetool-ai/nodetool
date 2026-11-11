#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p corpus/media_probe
ffmpeg -hide_banner -loglevel error -y -f lavfi -i 'color=c=red:s=16x16:r=1:d=1' \
    -frames:v 1 -c:v mpeg4 -an corpus/media_probe/tiny.mp4
ffmpeg -hide_banner -loglevel error -y -f lavfi -i 'sine=frequency=440:sample_rate=8000:duration=0.05' \
    -c:a pcm_s16le corpus/media_probe/tiny.wav
ffmpeg -hide_banner -loglevel error -y -f lavfi -i 'color=c=blue:s=16x16:r=1:d=1' \
    -frames:v 1 corpus/media_probe/tiny.png
