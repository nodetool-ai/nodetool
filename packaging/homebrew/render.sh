#!/bin/bash
# Renders the nodetool Homebrew cask for one stable release.
#
#   packaging/homebrew/render.sh 0.8.11 nodetool.rb
#
# The checksums are the sha256 digests GitHub records for the release's arm64
# and x64 DMGs. `brew install` verifies them against the downloads.
# Set GH_TOKEN to raise the GitHub API rate limit.
set -euo pipefail

version="${1:?usage: render.sh <version> <out-file>}"
out_file="${2:?usage: render.sh <version> <out-file>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="nodetool-ai/nodetool"

if [[ ! "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "render.sh: '${version}' is not a stable X.Y.Z version" >&2
  exit 1
fi

auth=()
[[ -n "${GH_TOKEN:-}" ]] && auth=(-H "Authorization: Bearer ${GH_TOKEN}")
release_json="$(curl -fsSL ${auth[@]+"${auth[@]}"} -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${repo}/releases/tags/v${version}")"

sha256_of() {
  printf '%s' "${release_json}" | python3 -c '
import json, sys
name = sys.argv[1]
digests = [a.get("digest") or "" for a in json.load(sys.stdin)["assets"] if a["name"] == name]
if not digests or not digests[0].startswith("sha256:"):
    sys.exit(f"render.sh: release asset {name} is missing or has no sha256 digest")
print(digests[0].removeprefix("sha256:"))
' "$1"
}

sha_arm64="$(sha256_of "Nodetool-${version}-arm64.dmg")"
sha_x64="$(sha256_of "Nodetool-${version}-x64.dmg")"
for sha in "${sha_arm64}" "${sha_x64}"; do
  if [[ ! "${sha}" =~ ^[0-9a-f]{64}$ ]]; then
    echo "render.sh: '${sha}' is not a sha256 digest" >&2
    exit 1
  fi
done

mkdir -p "$(dirname "${out_file}")"
sed -e "s|@VERSION@|${version}|g" \
    -e "s|@SHA256_ARM64@|${sha_arm64}|g" \
    -e "s|@SHA256_X64@|${sha_x64}|g" \
    "${here}/nodetool.rb" > "${out_file}"
