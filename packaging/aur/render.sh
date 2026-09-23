#!/bin/bash
# Renders the nodetool-bin AUR package directory for one release.
#
#   packaging/aur/render.sh 0.7.0 aur-pkg
set -euo pipefail

version="${1:?usage: render.sh <version> <out-dir>}"
out_dir="${2:?usage: render.sh <version> <out-dir>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "render.sh: '${version}' is not a stable X.Y.Z version" >&2
  exit 1
fi

mkdir -p "${out_dir}"
sed "s|@PKGVER@|${version}|g" "${here}/PKGBUILD" > "${out_dir}/PKGBUILD"
cp "${here}/nodetool.sh" "${here}/nodetool-electron.desktop" "${out_dir}/"
