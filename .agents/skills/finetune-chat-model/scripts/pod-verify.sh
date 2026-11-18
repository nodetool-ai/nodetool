#!/usr/bin/env bash
# usage: pod-verify.sh <pod-id> <remote-root> <local-root> <path> [path...]
#
# Compares a copy between a pod and this machine. For every file under each
# <path> (relative to both roots) it computes the sha256 and the size on both
# sides and prints one line per file. Exits 0 only when both sides list the
# same files, there is at least one, and every checksum and size is present,
# equal and non-zero. A missing or empty value counts as a mismatch: an
# earlier fetch script compared two empty checksums, reported "ok", and the
# pod was stopped with its results unfetched.
set -euo pipefail
usage() { sed -n '2,/^[^#]/s/^# \{0,1\}//p' "$0"; }
case "${1:-}" in "" | -h | --help) usage; exit 0 ;; esac
[ $# -ge 4 ] || { usage >&2; exit 2; }
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
pod=$1 remote=$2 local=$3
shift 3

# One line per file: sha256, size, path. The same text runs on both sides.
list='find "$@" -type f | LC_ALL=C sort | while IFS= read -r f; do
  printf "%s %s %s\n" "$(sha256sum <"$f" | cut -c1-64)" "$(stat -c %s "$f")" "$f"; done'
quoted=$(printf '%q ' "$@")
there=$("$here/pod-ssh.sh" "$pod" "cd $(printf %q "$remote") && bash -c $(printf %q "$list") _ $quoted") || {
  echo "could not list the files on the pod" >&2
  exit 1
}
mine=$(cd "$local" && bash -c "$list" _ "$@") || { echo "could not list the local files" >&2; exit 1; }

python3 -I - "$there" "$mine" <<'PY'
import re, sys
def parse(text):
    out = {}
    for line in text.splitlines():
        parts = line.split(" ", 2)
        if len(parts) == 3:
            out[parts[2]] = (parts[0], parts[1])
    return out
there, mine = parse(sys.argv[1]), parse(sys.argv[2])
bad = 0
for path in sorted(set(there) | set(mine)):
    a, b = there.get(path), mine.get(path)
    ok = (a is not None and b is not None and a == b
          and re.fullmatch(r"[0-9a-f]{64}", a[0]) and a[1].isdigit() and a[1] != "0")
    bad += not ok
    print(f"{'ok ' if ok else 'BAD'} {path} pod={a} local={b}")
if not there:
    print("BAD: no files listed on the pod")
    bad += 1
print(f"{len(there)} files on the pod, {len(mine)} here, {bad} bad")
sys.exit(1 if bad else 0)
PY
