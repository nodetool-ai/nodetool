#!/usr/bin/env bash
# Build judge sheets: reference and candidate frames at the same frame numbers,
# nine cells per image. See JUDGE.md.
# Usage: sheets.sh <candidate.mp4> <reference.mp4> <out-dir> [samples-per-second]
# Set SCENE_LABELS=0 to leave the scene names out, for a reference with other timing.
set -euo pipefail
cand=$1
ref=$2
out=$3
per_second=${4:-2}
fps=30
step=$((fps / per_second))
# Sample the middle of each interval, so no sample sits on a beat cut.
offset=$((step / 2))
w=480
h=270
label=28

mkdir -p "$out"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/ref" "$tmp/cand" "$tmp/cells"

extract() {
  ffmpeg -v error -i "$1" -vf \
    "fps=$fps,select='gte(n\,$offset)*not(mod(n-$offset\,$step))',scale=$w:$h" \
    -fps_mode passthrough "$2/%04d.png"
}
extract "$ref" "$tmp/ref"
extract "$cand" "$tmp/cand"

# The scene at a frame of the reference cut, from RECIPE.md.
scene() {
  awk -v n="$1" 'BEGIN {
    split("245 324 403 483 562 642 721", s, " ")
    split("Direct. Board. Render. Compare. Paint. Voice. Cut.", w, " ")
    split("800 827 853", h, " ")
    split("Your-keys No-markup Open-source", hw, " ")
    if (n < 123) { print "Open"; exit }
    if (n < 192) { print "Hit"; exit }
    if (n < 245) { print "Brief"; exit }
    if (n < 800) { for (i = 7; i >= 1; i--) if (n >= s[i]) { printf "Montage %d-7 %s\n", i, w[i]; exit } }
    if (n < 880) { for (i = 3; i >= 1; i--) if (n >= h[i]) { printf "Honesty %d-3 %s\n", i, hw[i]; exit } }
    print "Close"
  }'
}

tag="fontcolor=white:fontsize=16:box=1:boxcolor=black@0.6:boxborderw=4"
count=0
for r in "$tmp"/ref/*.png; do
  k=$(basename "$r" .png)
  idx=$((10#$k - 1))
  frame=$((offset + idx * step))
  t=$(awk -v f="$frame" -v r="$fps" 'BEGIN { printf "%.2f", f / r }')
  title="#$((idx + 1))  frame $frame  t $t s"
  if [ "${SCENE_LABELS:-1}" != 0 ]; then title="$title  $(scene "$frame")"; fi
  c="$tmp/cand/$k.png"
  if [ -f "$c" ]; then
    cand_in=(-i "$c")
  else
    cand_in=(-f lavfi -i "color=c=0x400000:s=${w}x${h},drawtext=text='NO FRAME':x=(w-tw)/2:y=(h-th)/2:fontcolor=white:fontsize=32")
  fi
  ffmpeg -v error -y -i "$r" "${cand_in[@]}" -frames:v 1 -filter_complex \
    "[0:v]drawtext=text='REF':x=6:y=6:$tag[a];[1:v]scale=$w:$h,drawtext=text='CAND':x=6:y=6:$tag[b];[a][b]vstack,pad=$w:$((h * 2 + label)):0:$label:color=0x262626,drawtext=text='$title':x=8:y=6:fontcolor=white:fontsize=16" \
    "$tmp/cells/$(printf %04d "$idx").png"
  count=$((count + 1))
done

samples=$count
# Pad the last sheet with blank cells, then tile nine cells to a sheet.
while [ $((count % 9)) -ne 0 ]; do
  ffmpeg -v error -y -f lavfi -i "color=c=0x101010:s=${w}x$((h * 2 + label))" -frames:v 1 \
    "$tmp/cells/$(printf %04d "$count").png"
  count=$((count + 1))
done
rm -f "$out"/sheet_*.png
ffmpeg -v error -y -framerate 1 -i "$tmp/cells/%04d.png" \
  -vf "tile=3x3:padding=6:margin=6:color=0x101010" -fps_mode passthrough "$out/sheet_%02d.png"
echo "$samples samples, $(ls "$out"/sheet_*.png | wc -l | tr -d ' ') sheets in $out"
