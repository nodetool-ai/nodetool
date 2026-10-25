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
mkdir -p "$build"

# Only the LGPL FFmpeg may be found: pkg-config looks in its folder alone.
PKG_CONFIG_LIBDIR="$ffmpeg/lib/pkgconfig" PKG_CONFIG_PATH="" \
    cmake -S . -B "$build" -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="$qt" -DNT_MACOS_BUNDLE=ON \
    > "$build/package-configure.log"
# Few jobs at low priority: the machine is shared (NT_JOBS overrides).
nice -n 10 cmake --build "$build" -j "${NT_JOBS:-3}" --target nodetool-timeline > "$build/package-build.log"

app="$build/NodeTool Timeline.app"
rm -rf "$app"
cp -R "$build/nodetool-timeline.app" "$app"
# Qt frameworks and plugins, the QML imports the module uses, and every
# non-system dylib (FFmpeg) into Contents/Frameworks.
"$qt/bin/macdeployqt" "$app" -qmldir=qml -libpath="$ffmpeg/lib" -always-overwrite -verbose=1 > "$build/package-deploy.log" 2>&1

# macdeployqt rewrites the Qt paths it knows, but Homebrew splits Qt into
# kegs (qtbase, qtdeclarative, ...) whose frameworks link each other by
# absolute paths, and some libraries keep their Cellar rpaths. Point every
# absolute reference at the copy in Contents/Frameworks (@rpath), and drop
# every rpath outside the bundle. A reference with no copy fails the script.
frameworks="$app/Contents/Frameworks"
missing=0
while IFS= read -r f; do
    file -b "$f" | grep -q "Mach-O" || continue
    id=$(otool -D "$f" | tail -n +2)  # a dylib's own install name, listed first by otool -L
    while IFS= read -r dep; do
        case "$dep" in /System/* | /usr/lib/* | @*) continue ;; esac
        if [[ "$dep" == *.framework/* ]]; then
            rel=$(sed -E 's|.*/([^/]+\.framework/.*)|\1|' <<< "$dep")  # Name.framework/Versions/A/Name
        else
            rel=$(basename "$dep")
        fi
        if [[ "$dep" == "$id" ]]; then
            install_name_tool -id "@rpath/$rel" "$f" 2> /dev/null
        elif [[ -e "$frameworks/$rel" ]]; then
            install_name_tool -change "$dep" "@rpath/$rel" "$f" 2> /dev/null
        else
            echo "error: $(basename "$f") needs $dep, which the bundle does not have" >&2
            missing=1
        fi
    done < <(otool -L "$f" | tail -n +2 | awk '{print $1}')
done < <(find "$app" -type f)
[[ $missing == 0 ]] || exit 1
# Every rpath that leaves the bundle goes, and so does every plug-in whose
# libraries the bundle does not have (QtPdf, the virtual keyboard, Qt 3D...):
# the app uses none of them, or their libraries would be here.
python3 scripts/macho-deps.py prune "$app" > "$build/package-prune.json"

# Licences, notices and source (review F8). Full texts only, from
# licenses/ in this repository and from the FFmpeg source; a missing text
# fails the script.
lic="$app/Contents/Resources/licenses"
rm -rf "$lic"
mkdir -p "$lic"
ffsrc=$(ls -d build-ffmpeg-lgpl/src/ffmpeg-* | head -1)
cp licenses/LGPL-3.0.txt "$lic/Qt-LGPL-3.0.txt"
cp licenses/GPL-3.0.txt "$lic/Qt-GPL-3.0.txt"  # the LGPL v3 adds its terms to the GPL v3
cp "$ffsrc/COPYING.LGPLv2.1" "$lic/FFmpeg-LGPL-2.1.txt"
awk '/^This software is available as a choice/{f=1} f' third_party/miniaudio.h > "$lic/miniaudio.txt"
cp fonts/LICENSE-Inter.txt "$lic/Inter-OFL-1.1.txt"
cp fonts/LICENSE-JetBrainsMono.txt "$lic/JetBrainsMono-OFL-1.1.txt"
cp third_party/yoga/LICENSE "$lic/Yoga-MIT.txt"
for f in "$lic"/*.txt; do [[ -s "$f" ]] || { echo "error: empty licence $f" >&2; exit 1; }; done
# The corresponding source of the LGPL libraries. FFmpeg: the exact source
# tarball and configure line, in the bundle. Qt: the unmodified Homebrew
# build; its source archives with their checksums, from Homebrew.
src="$app/Contents/Resources/source"
rm -rf "$src"
mkdir -p "$src"
cp build-ffmpeg-lgpl/ffmpeg-*.tar.xz "$src/"
{
    echo "NodeTool Timeline $(git rev-parse --short HEAD 2> /dev/null || echo unknown): corresponding source and build information"
    echo
    echo "This application links the following libraries dynamically. You may replace them with"
    echo "modified versions built from the sources below; the application loads them from"
    echo "Contents/Frameworks through @rpath."
    echo
    echo "FFmpeg (GNU LGPL 2.1 or later, licenses/FFmpeg-LGPL-2.1.txt)"
    echo "  source: $(basename "$src"/ffmpeg-*.tar.xz) in this folder, sha256 $(shasum -a 256 "$src"/ffmpeg-*.tar.xz | cut -d' ' -f1)"
    # The configuration the shipped library reports (avcodec_configuration()).
    strings "$app/Contents/Frameworks/libavcodec.62.dylib" > "$build/avcodec-strings.txt"
    echo "  configured with: $(grep -m1 -- '^--prefix=' "$build/avcodec-strings.txt")"
    echo "  built by: native/timeline/scripts/build-ffmpeg-lgpl.sh"
    echo
    echo "Qt $(brew info --json=v2 qtbase | python3 -c 'import json,sys;print(json.load(sys.stdin)["formulae"][0]["installed"][0]["version"])') (GNU LGPL 3, licenses/Qt-LGPL-3.0.txt and Qt-GPL-3.0.txt)"
    echo "  the Homebrew build, unmodified, of these source archives:"
    brew info --json=v2 $(brew deps qt | grep '^qt') | python3 -c '
import json, sys
for f in json.load(sys.stdin)["formulae"]:
    u = f["urls"]["stable"]
    print("    %s %s\n      %s\n      sha256 %s" % (f["name"], f["versions"]["stable"], u["url"], u.get("checksum")))'
    echo
    echo "miniaudio 0.11.22 (public domain or MIT No Attribution, licenses/miniaudio.txt), compiled in."
    echo "Yoga 3.2.1 (MIT), compiled in (licenses/Yoga-MIT.txt)."
    echo "Inter and JetBrains Mono (SIL Open Font License 1.1), embedded."
} > "$src/SOURCES.txt"

# install_name_tool invalidated the linker's ad-hoc signatures: renew them
# (ad-hoc, no identity).
codesign --force --deep --sign - "$app" > /dev/null 2>&1
echo "wrote $app"
