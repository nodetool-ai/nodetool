#!/usr/bin/env bash
# usage: pod-resume.sh <pod-id>
#
# Starts a stopped pod without a GPU, through Runpod's GraphQL mutation
# podResumeZeroGpu. Use it when `runpodctl pod start` leaves a pod at
# awaiting_container: a pod's own volume lives on one machine, and the pod
# cannot start while that machine's GPU is rented to someone else. Without a
# GPU it starts, and its files can be copied off with pod-fetch.sh. CPU-only
# steps such as quantize.sh also run there.
#
# The API key is read from ~/.runpod/config.toml (RUNPOD_CONFIG overrides
# the path), the file runpodctl writes. The key goes to curl in a header
# file, never on the command line.
set -euo pipefail
usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; }
case "${1:-}" in "" | -h | --help) usage; exit 0 ;; esac
pod=$1
case "$pod" in *[!a-z0-9]* | "") echo "not a pod id: $pod" >&2; exit 2 ;; esac
key=$(python3 -I -c '
import os, sys, tomllib
path = os.environ.get("RUNPOD_CONFIG") or os.path.expanduser("~/.runpod/config.toml")
c = tomllib.load(open(path, "rb"))
print(c.get("apikey") or c.get("api_key") or c.get("apiKey") or "")')
[ -n "$key" ] || { echo "no API key in the Runpod config" >&2; exit 1; }
curl -sS https://api.runpod.io/graphql -H @<(printf 'Authorization: Bearer %s\n' "$key") \
  -H 'content-type: application/json' \
  -d "{\"query\":\"mutation { podResumeZeroGpu(input: { podId: \\\"$pod\\\" }) { id desiredStatus } }\"}"
echo
