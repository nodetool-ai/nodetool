#!/usr/bin/env bash
# Build the judge images for a Serein launch film. See EVAL.md and JUDGE.md.
# Usage: sheets.sh <candidate.mp4> <out-dir>
# Writes:
#   checkpoints_1.png, checkpoints_2.png  the 16 checkpoint frames (C1-C16), 9 per sheet
#   motion.png                            6 motion strips (M1-M6), 6 frames each
#   overview.png                          one frame per second, for the craft grade
set -euo pipefail
cand=$1
out=$2
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$out" "$tmp/cp" "$tmp/mo" "$tmp/ov"
rm -f "$out"/checkpoints_*.png "$out"/motion.png "$out"/overview.png
frames=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$cand" | tr -d ' ,')
tag="fontcolor=white:fontsize=18:box=1:boxcolor=black@0.7:boxborderw=5"

# cell <frame> <width> <height> <label> <file>: one labelled frame, or a red panel past the end.
cell() {
  if [ "$1" -lt "$frames" ]; then
    ffmpeg -v error -y -i "$cand" -vf "select=eq(n\,$1),scale=$2:$3,drawtext=text='$4':x=6:y=6:$tag" \
      -frames:v 1 -fps_mode passthrough "$5"
  else
    ffmpeg -v error -y -f lavfi -i "color=c=0x400000:s=${2}x$3" \
      -vf "drawtext=text='$4  NO FRAME':x=6:y=6:$tag" -frames:v 1 "$5"
  fi
}
blank() { ffmpeg -v error -y -f lavfi -i "color=c=0x101010:s=${1}x$2" -frames:v 1 "$3"; }

# Checkpoints, from BRIEF.md section 10.
k=0
for spec in C1:40 C2:110 C3:140 C4:175 C5:225 C6:244 C7:262 C8:330 C9:420 C10:480 \
  C11:530 C12:604 C13:630 C14:655 C15:740 C16:778; do
  cell "${spec#*:}" 640 360 "${spec%%:*}  frame ${spec#*:}" "$tmp/cp/$(printf %02d $k).png"
  k=$((k + 1))
done
while [ $((k % 9)) -ne 0 ]; do blank 640 360 "$tmp/cp/$(printf %02d $k).png"; k=$((k + 1)); done
ffmpeg -v error -y -framerate 1 -i "$tmp/cp/%02d.png" \
  -vf "tile=3x3:padding=6:margin=6:color=0x101010" -fps_mode passthrough "$out/checkpoints_%d.png"

# Motion strips: six frames across one animation, so the judge sees its path and easing.
row=0
for spec in "M1 counter enters:8,10,12,14,17,20" "M2 mark draws:123,127,131,135,139,143" \
  "M3 cards fly:251,256,261,266,271,281" "M4 plane launches:520,524,528,532,536,540" \
  "M5 zero slams:598,600,602,604,606,610" "M6 end card builds:668,673,678,683,690,700"; do
  name=${spec%%:*}
  i=0
  for f in $(echo "${spec#*:}" | tr , ' '); do
    cell "$f" 320 180 "${name%% *} f$f" "$tmp/mo/r${row}_$i.png"
    i=$((i + 1))
  done
  ffmpeg -v error -y -i "$tmp/mo/r${row}_0.png" -i "$tmp/mo/r${row}_1.png" -i "$tmp/mo/r${row}_2.png" \
    -i "$tmp/mo/r${row}_3.png" -i "$tmp/mo/r${row}_4.png" -i "$tmp/mo/r${row}_5.png" \
    -filter_complex "hstack=6,pad=iw:ih+30:0:30:color=0x262626,drawtext=text='$name':x=8:y=6:fontcolor=white:fontsize=18" \
    "$tmp/mo/row$row.png"
  row=$((row + 1))
done
ffmpeg -v error -y -i "$tmp/mo/row0.png" -i "$tmp/mo/row1.png" -i "$tmp/mo/row2.png" \
  -i "$tmp/mo/row3.png" -i "$tmp/mo/row4.png" -i "$tmp/mo/row5.png" -filter_complex "vstack=6" "$out/motion.png"

# Overview: the middle frame of every second.
k=0
for s in $(seq 0 25); do
  cell $((s * 30 + 15)) 320 180 "${s} s" "$tmp/ov/$(printf %02d $k).png"
  k=$((k + 1))
done
while [ $((k % 6)) -ne 0 ]; do blank 320 180 "$tmp/ov/$(printf %02d $k).png"; k=$((k + 1)); done
ffmpeg -v error -y -framerate 1 -i "$tmp/ov/%02d.png" \
  -vf "tile=6x$((k / 6)):padding=4:margin=4:color=0x101010" -frames:v 1 "$out/overview.png"

echo "candidate has $frames frames; wrote $(ls "$out" | tr '\n' ' ')in $out"
