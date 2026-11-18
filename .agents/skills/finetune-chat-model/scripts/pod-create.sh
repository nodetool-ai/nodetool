#!/usr/bin/env bash
# usage: pod-create.sh <pod-name> "<data-center>|<gpu type>" ["<dc>|<gpu>" ...]
#
# Creates a GPU pod on a new network volume, trying each candidate in turn:
# create the volume in that data center, create the pod on it, wait for the
# container. On failure it deletes the pod and the volume and tries the next
# candidate. On success it prints POD=<id> VOL=<id> DC=<dc> GPU=<gpu>.
# This rents a paid GPU: run it only with the operator's approval.
#
# Use a network volume, never the pod's own volume. A pod volume lives on one
# machine, and a stopped pod restarts only when that machine's GPU is free:
# otherwise it hangs at awaiting_container and its files are out of reach (see
# pod-resume.sh). A network volume can be mounted by a new pod in the same
# data center.
#
#   pod-create.sh nodetool-ft-v4 "EUR-NO-2|NVIDIA H100 80GB HBM3" "US-GA-2|NVIDIA H200"
#
# Find candidates with `runpodctl datacenter list` and `runpodctl gpu list`.
# Env: VOLUME_GB (60), DISK_GB (container disk, 40), TEMPLATE (runpod-torch-v21),
#      SSH_PUBKEY (~/.ssh/id_rsa.pub), RUNPODCTL (runpodctl)
set -euo pipefail
usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; }
case "${1:-}" in "" | -h | --help) usage; exit 0 ;; esac
[ $# -ge 2 ] || { usage >&2; exit 2; }
R=${RUNPODCTL:-runpodctl}
name=$1
shift
pub=$(cat "${SSH_PUBKEY:-$HOME/.ssh/id_rsa.pub}")
env_json=$(python3 -I -c 'import json,sys; print(json.dumps({"PUBLIC_KEY": sys.argv[1]}))' "$pub")
json_field() { python3 -I -c 'import json,sys
try: print(json.load(sys.stdin).get(sys.argv[1]) or "")
except ValueError: print("")' "$1"; }

for spec in "$@"; do
  dc=${spec%%|*} gpu=${spec#*|}
  vol=$("$R" network-volume create --name "$name" --size "${VOLUME_GB:-60}" --data-center-id "$dc" 2>&1 | json_field id)
  if [ -z "$vol" ]; then
    echo "$dc: no volume"
    continue
  fi
  out=$("$R" pod create --name "$name" --template-id "${TEMPLATE:-runpod-torch-v21}" --gpu-id "$gpu" \
    --cloud-type SECURE --data-center-ids "$dc" --network-volume-id "$vol" --volume-mount-path /workspace \
    --container-disk-in-gb "${DISK_GB:-40}" --env "$env_json" --ports "22/tcp" \
    --wait-for running --wait-timeout 8m 2>&1 || true)
  id=$(grep -oE '"id": ?"[a-z0-9]{10,}"' <<<"$out" | head -1 | grep -oE '[a-z0-9]{10,}' || true)
  err=$(json_field error <<<"$out" | head -c 160)
  echo "$dc $gpu: pod=${id:--} ${err:+error=$err}"
  if [ -n "$id" ] && [ -z "$err" ]; then
    echo "POD=$id VOL=$vol DC=$dc GPU=$gpu"
    exit 0
  fi
  [ -n "$id" ] && "$R" pod delete "$id" >/dev/null 2>&1 || true
  # A volume cannot be deleted while a pod still holds it, so retry until it goes.
  for _ in $(seq 1 12); do
    sleep 10
    "$R" network-volume list 2>/dev/null | grep -q "\"$vol\"" || break
    "$R" network-volume delete "$vol" >/dev/null 2>&1 || true
  done
done
echo "NO-POD: no candidate had capacity" >&2
exit 1
