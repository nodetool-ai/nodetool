#!/usr/bin/env bash
# Automatic checks for a Serein launch film: format and hard cuts.
# The picture is judged from sheets.sh output. See EVAL.md and JUDGE.md.
# Usage: score.sh <candidate.mp4>
# Exit status: 0 when every check passes, 1 when a check fails.
set -euo pipefail
cand=$1
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
failed=0
verdict() { if [ "$1" = pass ]; then echo "$2: pass"; else echo "$2: FAIL"; failed=1; fi; }

echo "## G1 format"
format=$(ffprobe -v error -count_frames -select_streams v:0 \
  -show_entries stream=width,height,r_frame_rate,nb_read_frames -of csv=p=0 "$cand" | tr -d ' ' | sed 's/,$//')
echo "video: $format (want 1920,1080,30/1,780)"
[ "$format" = "1920,1080,30/1,780" ] && g1=pass || g1=fail
verdict "$g1" G1

echo "## G2 hard cuts (expected frame, found frame)"
ffmpeg -v info -i "$cand" -vf "fps=30,scdet=threshold=12" -an -f null - 2>&1 \
  | grep -o 'lavfi.scd.time: [0-9.]*' | awk '{printf "%d\n", $2 * 30 + 0.5}' > "$tmp/cuts" || true
expected="123 245 615 642 668"
hits=0
for e in $expected; do
  f=$(awk -v e="$e" 'function abs(x){return x<0?-x:x} abs($1-e)<=1 {print $1; exit}' "$tmp/cuts")
  if [ -n "$f" ]; then hits=$((hits + 1)); echo "$e $f"; else echo "$e missing"; fi
done
echo "found $hits/5"
# Other detected cuts are listed for the judge, not scored: transitions may trigger them.
extra=$(awk -v list="$expected" 'BEGIN { n = split(list, e, " ") }
  { keep = 1; for (i = 1; i <= n; i++) if ($1 >= e[i] - 1 && $1 <= e[i] + 1) keep = 0; if (keep) printf "%s ", $1 }' "$tmp/cuts")
echo "other detected cuts: ${extra:-none}"
[ "$hits" -eq 5 ] && g2=pass || g2=fail
verdict "$g2" G2

echo "## Result"
if [ "$failed" -eq 0 ]; then echo "PASS"; else echo "FAIL"; fi
exit "$failed"
