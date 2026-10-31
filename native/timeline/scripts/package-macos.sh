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
qt=${QT_PREFIX:-$(brew --prefix qt)}
[[ -x "$qt/bin/qmake" && -x "$qt/bin/macdeployqt" ]] || {
    echo "error: QT_PREFIX must name a Qt SDK with qmake and macdeployqt" >&2
    exit 1
}
qt_version=$("$qt/bin/qmake" -query QT_VERSION)
scripts/build-ffmpeg-lgpl.sh
ffmpeg="$PWD/build-ffmpeg-lgpl/install"
mkdir -p "$build"

# Prefer the LGPL FFmpeg while retaining the development files of its codecs.
PKG_CONFIG_PATH="$ffmpeg/lib/pkgconfig" \
    cmake -S . -B "$build" -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="$qt" -DNT_MACOS_BUNDLE=ON \
    > "$build/package-configure.log"
# Few jobs at low priority: the machine is shared (NT_JOBS overrides).
nice -n 10 cmake --build "$build" -j "${NT_JOBS:-3}" --target nodetool-timeline > "$build/package-build.log"

app="$build/NodeTool Timeline.app"
rm -rf "$app"
cp -R "$build/nodetool-timeline.app" "$app"
app=$(cd "$app" && pwd -P)
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
    done < <(otool -L "$f" | tail -n +2 | sed -E 's/^[[:space:]]+//; s/ \(compatibility.*$//')
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
# tarball and configure line, in the bundle. Qt comes from the selected SDK
# or Homebrew. Other copied libraries (OpenSSL, GLib, PCRE2, ICU, FreeType...)
# come from their unmodified Homebrew bottles. The list comes from the Mach-O files in the bundle, and
# each keg's own install record (sbom.spdx.json, .brew/<formula>.rb) names
# its source archive, patches and licence texts, so a newer Homebrew metadata
# cannot name a source the bundle was not built from (review F4, M6 F8).
src="$app/Contents/Resources/source"
rm -rf "$src"
mkdir -p "$src"
cp build-ffmpeg-lgpl/ffmpeg-*.tar.xz "$src/"
ffmpeg_tar=$(basename "$src"/ffmpeg-*.tar.xz)
ffmpeg_version=${ffmpeg_tar#ffmpeg-}
ffmpeg_version=${ffmpeg_version%.tar.xz}
# Qt uses the full LGPL and GPL texts copied above.
qt_notice=()
if [[ -n "${QT_PREFIX:-}" ]]; then
    qt_archive="qt-everywhere-src-$qt_version.tar.xz"
    qt_source_url="https://download.qt.io/official_releases/qt/${qt_version%.*}/$qt_version/single/$qt_archive"
    curl -fsSL --retry 3 "$qt_source_url.sha256" -o "$build/qt-source.sha256"
    qt_sdk=$(python3 - "$qt" "$qt_version" "$qt_source_url" "$build/qt-source.sha256" "$qt_archive" <<'PYTHON'
import json, re, sys
prefix, version, url, checksum_file, archive = sys.argv[1:]
checksum, filename = open(checksum_file).read().split()
if not re.fullmatch(r"[0-9a-f]{64}", checksum) or filename.lstrip("*") != archive:
    raise SystemExit("Qt source checksum does not name the selected SDK version")
print(json.dumps({"prefix": prefix, "version": version,
                  "licenses": ["Qt-LGPL-3.0.txt", "Qt-GPL-3.0.txt"],
                  "source": {"url": url, "sha256": checksum}}))
PYTHON
)
    qt_notice=(--qt-sdk "$qt_sdk")
fi
python3 scripts/macho-deps.py notices "$app" --brew-prefix "$(brew --prefix)" "${qt_notice[@]}" \
    --local "{\"name\":\"FFmpeg\",\"match\":\"^lib(avcodec|avformat|avutil|avfilter|swscale|swresample)[.]\",\"version\":\"$ffmpeg_version\",\"licenses\":[\"FFmpeg-LGPL-2.1.txt\"],\"source\":{\"file\":\"$ffmpeg_tar\"}}" \
    --default-licence "qt=Qt-LGPL-3.0.txt,Qt-GPL-3.0.txt" > "$build/package-notices.txt"
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
    echo "Qt (GNU LGPL 3, licenses/Qt-LGPL-3.0.txt and Qt-GPL-3.0.txt) and other libraries in"
    echo "Contents/Frameworks and Contents/PlugIns: selected SDK or Homebrew kegs, with source, patches,"
    echo "recipe and licence texts (licenses/third-party/<formula>/; components.json in this folder):"
    cat "$build/package-notices.txt"
    echo
    echo "miniaudio 0.11.22 (public domain or MIT No Attribution, licenses/miniaudio.txt), compiled in."
    echo "Yoga 3.2.1 (MIT), compiled in (licenses/Yoga-MIT.txt)."
    echo "Inter and JetBrains Mono (SIL Open Font License 1.1), embedded."
} > "$src/SOURCES.txt"

# install_name_tool invalidated the linker's ad-hoc signatures: renew them
# (ad-hoc, no identity).
codesign --force --deep --sign - "$app" > /dev/null 2>&1
echo "wrote $app"
