#!/usr/bin/env bash
# Packages nodetool-timeline as a macOS .app (PLAN M6): Qt through
# macdeployqt, FFmpeg as the LGPL shared libraries of
# scripts/build-ffmpeg-lgpl.sh, miniaudio compiled in. The bundle is not
# signed with an identity and not notarized: it carries only the ad-hoc
# signature that Apple silicon needs to run any binary. A release needs a
# Developer ID signature and notarization; that is the user's step.
#
#   scripts/package-macos.sh        # writes build-package/NodeTool Timeline.app
# Then scripts/check-package-macos.sh verifies it.
set -euo pipefail

cd "$(dirname "$0")/.."
build=${BUILD_DIR:-build-package}
qt=$(brew --prefix qt)
scripts/build-ffmpeg-lgpl.sh
ffmpeg="$PWD/build-ffmpeg-lgpl/install"

# Only the LGPL FFmpeg may be found: pkg-config looks in its folder alone.
PKG_CONFIG_LIBDIR="$ffmpeg/lib/pkgconfig" PKG_CONFIG_PATH="" \
    cmake -S . -B "$build" -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="$qt" -DNT_MACOS_BUNDLE=ON \
    > "$build.configure.log"
# Few jobs at low priority: the machine is shared (NT_JOBS overrides).
nice -n 10 cmake --build "$build" -j "${NT_JOBS:-3}" --target nodetool-timeline > "$build.build.log"

app="$build/NodeTool Timeline.app"
rm -rf "$app"
cp -R "$build/nodetool-timeline.app" "$app"
# Qt frameworks and plugins, the QML imports the module uses, and every
# non-system dylib (FFmpeg) into Contents/Frameworks.
"$qt/bin/macdeployqt" "$app" -qmldir=qml -libpath="$ffmpeg/lib" -always-overwrite -verbose=1 > "$build.deploy.log" 2>&1

# Licences of what the bundle ships.
lic="$app/Contents/Resources/licenses"
mkdir -p "$lic"
cp build-ffmpeg-lgpl/src/ffmpeg-*/COPYING.LGPLv2.1 "$lic/FFmpeg-COPYING.LGPLv2.1"
awk '/^This software is available as a choice/{f=1} f' third_party/miniaudio.h > "$lic/miniaudio.txt"
cp "$qt/share/qt/LICENSES/LGPL-3.0-only.txt" "$lic/Qt-LGPL-3.0-only.txt" 2>/dev/null ||
    echo "Qt 6 is used under the GNU LGPL v3; see https://www.qt.io/licensing/open-source-lgpl-obligations" > "$lic/Qt.txt"

# install_name_tool invalidated the linker's ad-hoc signatures: renew them
# (ad-hoc, no identity).
codesign --force --deep --sign - "$app" > /dev/null 2>&1
echo "wrote $app"
