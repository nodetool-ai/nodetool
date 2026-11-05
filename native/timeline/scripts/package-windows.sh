#!/usr/bin/env bash
# Run from the repository root after building build-ci.
set -euo pipefail
out=native/timeline/build-ci/package-windows
rm -rf "$out" && mkdir -p "$out"
cp native/timeline/build-ci/nodetool-timeline.exe "$out/"
windeployqt --release --qmldir native/timeline/qml --no-translations "$out/nodetool-timeline.exe"
cp "$FFMPEG_LGPL_BIN"/*.dll "$out/"
pwsh -NoProfile -File "$VCPKG_INSTALLATION_ROOT/scripts/buildsystems/msbuild/applocal.ps1" \
  -targetBinary "$out/nodetool-timeline.exe" \
  -installedDir "$VCPKG_INSTALLATION_ROOT/installed/x64-windows/bin"
mkdir -p "$out/licenses"
for port in harfbuzz freetype zlib bzip2 libpng brotli; do
  cp "$VCPKG_INSTALLATION_ROOT/installed/x64-windows/share/$port/copyright" "$out/licenses/$port.txt"
done
cp native/timeline/licenses/*.txt native/ui_primitives/resources/licenses/* "$out/licenses/"
cp native/ui_primitives/resources/icons/providers/README.md "$out/licenses/Provider-Icons-notice.md"
