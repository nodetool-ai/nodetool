#!/usr/bin/env bash
# usage: sample-lanes.sh <lane-dir> <label> <ft-data.sh sample options...>
#
# Runs one `ft-data.sh sample` per non-empty <lane-dir>/lane*.txt, in
# parallel, each with --tasks from its file and
# --out <lane-dir>/<label>-l<n>.jsonl (log in <label>-l<n>.log). Waits for
# every lane and exits non-zero if one failed. Give --models, -p, --split,
# --manifest, --budget and the rest as usual. Make the lane files with
# make-lanes.py. A rerun resumes: the sampler skips runs already in its --out.
#
#   sample-lanes.sh data/glm-pass1 glm -p openrouter --models z-ai/glm-5.3-flash \
#     --generated 30 --budget 10 --manifest "$FT_HOME/manifest.json"
#
# Each lane's --budget is its own, counted over its own --out file.
set -euo pipefail
usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; }
case "${1:-}" in "" | -h | --help) usage; exit 0 ;; esac
[ $# -ge 3 ] || { usage >&2; exit 2; }
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
dir=$(cd "$1" && pwd) label=$2
shift 2

pids=()
for lane in "$dir"/lane*.txt; do
  [ -s "$lane" ] || continue
  n=$(basename "$lane" .txt)
  n=${n#lane}
  out="$dir/$label-l$n.jsonl"
  "$here/ft-data.sh" sample "$@" --tasks "$(cat "$lane")" --out "$out" >"$dir/$label-l$n.log" 2>&1 &
  pids+=($!)
  echo "lane $n: $(awk -F, '{n += NF} END {print n}' "$lane") tasks -> $out"
done
[ ${#pids[@]} -gt 0 ] || { echo "no non-empty lane files in $dir" >&2; exit 1; }

failed=0
for pid in "${pids[@]}"; do
  wait "$pid" || failed=$((failed + 1))
done
for log in "$dir/$label"-l*.log; do
  echo "$(basename "$log"): $(grep -c '^PASS' "$log" || true) pass, $(grep -c '^FAIL' "$log" || true) fail" \
    "$(grep -oE 'total=\$[0-9.]+' "$log" | tail -1 || true)"
done
[ "$failed" -eq 0 ] || { echo "$failed lane(s) failed: read their logs" >&2; exit 1; }
