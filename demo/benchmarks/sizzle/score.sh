#!/usr/bin/env bash
# Check a sizzle candidate's format, cuts and audio against the reference.
# The picture is judged from sheets.sh output. See RECIPE.md and JUDGE.md.
# Usage: score.sh <candidate.mp4> <reference.mp4>
# Exit status: 0 when every check passes, 1 when a check fails.
set -euo pipefail
cand=$1
ref=$2
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
failed=0
verdict() { if [ "$1" = pass ]; then echo "$2: pass"; else echo "$2: FAIL"; failed=1; fi; }

echo "## G1 format"
format=$(ffprobe -v error -count_frames -select_streams v:0 \
  -show_entries stream=width,height,r_frame_rate,nb_read_frames -of csv=p=0 "$cand" | tr -d ' ' | sed 's/,$//')
audio=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "$cand")
echo "video: $format (want 1920,1080,30/1,977), audio: ${audio:-none}"
[ "$format" = "1920,1080,30/1,977" ] && [ "$audio" = audio ] && g1=pass || g1=fail
verdict "$g1" G1

echo "## G2 cuts (expected frame, found frame)"
ffmpeg -v info -i "$cand" -vf "fps=30,scdet=threshold=12" -an -f null - 2>&1 \
  | grep -o 'lavfi.scd.time: [0-9.]*' | awk '{printf "%d\n", $2 * 30 + 0.5}' > "$tmp/cuts" || true
hits=0
for e in 25 123 245 324 403 483 562 642 721 800 827 853 880; do
  f=$(awk -v e="$e" 'function abs(x){return x<0?-x:x} abs($1-e)<=1 {print $1; exit}' "$tmp/cuts")
  if [ -n "$f" ]; then hits=$((hits + 1)); echo "$e $f"; else echo "$e missing"; fi
done
echo "found $hits/13"
[ "$hits" -eq 13 ] && g2=pass || g2=fail
verdict "$g2" G2

echo "## G3 audio"
rms() {
  ffmpeg -v error -i "$1" -vn -af \
    "aresample=48000,asetnsamples=24000,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-" \
    -f null - | grep RMS_level | cut -d= -f2 | sed 's/-inf/-120/'
}
rms "$cand" > "$tmp/a" || true
rms "$ref" > "$tmp/b"
# A window that one file lacks counts as silence (-120 dB).
diff_db=$(paste "$tmp/a" "$tmp/b" | awk -F'\t' '{a = ($1 == "") ? -120 : $1; b = ($2 == "") ? -120 : $2
  d = a - b; if (d < 0) d = -d; if (d > 40) d = 40; s += d; n++} END { printf "%.2f", s / n }')
echo "mean RMS difference over 0.5 s windows: $diff_db dB (want <= 1.00)"
awk -v d="$diff_db" 'BEGIN { exit !(d <= 1.0) }' && g3=pass || g3=fail
verdict "$g3" G3

echo "## Result"
if [ "$failed" -eq 0 ]; then echo "PASS"; else echo "FAIL"; fi
exit "$failed"
