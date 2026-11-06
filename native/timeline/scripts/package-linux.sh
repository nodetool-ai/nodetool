#!/usr/bin/env bash
# Run from the repository root after building build-ci.
set -euo pipefail
dir=native/timeline/build-ci/AppDir
rm -rf "$dir" && mkdir -p "$dir/usr/bin" "$dir/usr/share/licenses/nodetool-timeline"
cp native/timeline/build-ci/nodetool-timeline "$dir/usr/bin/"
cp native/timeline/licenses/*.txt native/ui_primitives/resources/licenses/* "$dir/usr/share/licenses/nodetool-timeline/"
cp native/ui_primitives/resources/icons/providers/README.md "$dir/usr/share/licenses/nodetool-timeline/Provider-Icons-notice.md"
printf '[Desktop Entry]\nType=Application\nName=NodeTool Timeline\nExec=nodetool-timeline\nIcon=nodetool-timeline\nCategories=AudioVideo;\n' > "$dir/nodetool-timeline.desktop"
# Write the existing solid-color icon without depending on ImageMagick or a distro logo.
python3 - "$dir/nodetool-timeline.png" <<'PYTHON'
import struct, sys, zlib
from pathlib import Path
def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
rows = (b'\x00' + b'\x20\x20\x24' * 256) * 256
Path(sys.argv[1]).write_bytes(b'\x89PNG\r\n\x1a\n' +
    chunk(b'IHDR', struct.pack('>IIBBBBB', 256, 256, 8, 2, 0, 0, 0)) +
    chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))
PYTHON
curl -sSfL -o "$RUNNER_TEMP/linuxdeploy" https://github.com/linuxdeploy/linuxdeploy/releases/download/1-alpha-20250213-2/linuxdeploy-x86_64.AppImage
curl -sSfL -o "$RUNNER_TEMP/linuxdeploy-qt" https://github.com/linuxdeploy/linuxdeploy-plugin-qt/releases/download/1-alpha-20250213-1/linuxdeploy-plugin-qt-x86_64.AppImage
(cd "$RUNNER_TEMP" && sha256sum -c - <<'SUMS'
4648f278ab3ef31f819e67c30d50f462640e5365a77637d7e6f2ad9fd0b4522a  linuxdeploy
15106be885c1c48a021198e7e1e9a48ce9d02a86dd0a1848f00bdbf3c1c92724  linuxdeploy-qt
SUMS
)
chmod +x "$RUNNER_TEMP/linuxdeploy" "$RUNNER_TEMP/linuxdeploy-qt"
export PATH="$RUNNER_TEMP:$PATH" QMAKE="$QT_PREFIX/bin/qmake" QML_SOURCES_PATHS=native/timeline/qml APPIMAGE_EXTRACT_AND_RUN=1
ln -sf "$RUNNER_TEMP/linuxdeploy-qt" "$RUNNER_TEMP/linuxdeploy-plugin-qt"
linuxdeploy --appdir "$dir" --desktop-file "$dir/nodetool-timeline.desktop" --icon-file "$dir/nodetool-timeline.png" \
  --plugin qt --output appimage
ls -la ./*.AppImage
