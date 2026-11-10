#!/usr/bin/env bash
# Packages nodetool-node-editor as a macOS .app for a test build: Qt through
# macdeployqt, the Homebrew libraries the editor and the graph runner link,
# and the graph runner guest bundle next to the binary. The bundle carries
# only the ad-hoc signature that Apple silicon needs to run any binary. It
# has no licence or source notices: it is not a release package.
#
#   scripts/package-macos.sh        # writes build-package/NodeTool Node Editor.app
set -euo pipefail

cd "$(dirname "$0")/.."
editor=$PWD
root=$(cd ../.. && pwd)
build=${BUILD_DIR:-build-package}
qt=${QT_PREFIX:-$(brew --prefix qt)}
[[ -x "$qt/bin/macdeployqt" ]] || {
    echo "error: QT_PREFIX must name a Qt SDK with macdeployqt" >&2
    exit 1
}
mkdir -p "$build"

# The guest bundle the in-process runner loads (WorkflowSession guestBundlePath).
(cd "$root" && node native/graph-runner/guest/build.mjs > "$editor/$build/package-guest.log")
guest="$root/native/graph-runner/build/guest.js"
[[ -s "$guest" ]] || { echo "error: no guest bundle at $guest" >&2; exit 1; }

cmake -S . -B "$build" -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="$qt" -DNT_MACOS_BUNDLE=ON \
    > "$build/package-configure.log"
# Few jobs at low priority: the machine is shared (NT_JOBS overrides).
nice -n 10 cmake --build "$build" -j "${NT_JOBS:-3}" --target nodetool-node-editor > "$build/package-build.log"

app="$build/NodeTool Node Editor.app"
rm -rf "$app"
cp -R "$build/nodetool-node-editor.app" "$app"
app=$(cd "$app" && pwd -P)
cp "$guest" "$app/Contents/MacOS/guest.js"
"$qt/bin/macdeployqt" "$app" -qmldir=qml -qmldir=../ui_primitives/qml -always-overwrite -verbose=1 \
    > "$build/package-deploy.log" 2>&1

# As in native/timeline/scripts/package-macos.sh: Homebrew Qt kegs link each
# other by absolute paths. Point every absolute reference at the copy in
# Contents/Frameworks (@rpath). A missing application or framework
# dependency fails here.
frameworks="$app/Contents/Frameworks"
missing=0
while IFS= read -r f; do
    file -b "$f" | grep -q "Mach-O" || continue
    id=$(otool -D "$f" | sed -E '/:$/d; /^[[:space:]]*$/d; s/^[[:space:]]+//' | sort -u)
    while IFS= read -r dep; do
        case "$dep" in /System/* | /usr/lib/* | @*) continue ;; esac
        if [[ "$dep" == *.framework/* ]]; then
            rel=$(sed -E 's|.*/([^/]+\.framework/.*)|\1|' <<< "$dep")
        else
            rel=$(basename "$dep")
        fi
        if [[ "$dep" == "$id" ]]; then
            install_name_tool -id "@rpath/$rel" "$f" 2> /dev/null
        elif [[ -e "$frameworks/$rel" ]]; then
            install_name_tool -change "$dep" "@rpath/$rel" "$f" 2> /dev/null
        elif [[ "$f" == "$app/Contents/PlugIns/"* || "$f" == "$app/Contents/Resources/qml/"* ]]; then
            echo "prune candidate: $(basename "$f") needs missing $dep" >&2
        else
            echo "error: $(basename "$f") needs $dep, which the bundle does not have" >&2
            missing=1
        fi
    done < <(otool -L "$f" | tail -n +2 | sed -E '/ \(compatibility/!d; s/^[[:space:]]+//; s/ \(compatibility.*$//')
done < <(find "$app" -type f)
[[ $missing == 0 ]] || exit 1
python3 ../timeline/scripts/macho-deps.py prune "$app" > "$build/package-prune.json"

# install_name_tool invalidated the linker's ad-hoc signatures: renew them.
codesign --force --deep --sign - "$app" > /dev/null 2>&1
echo "wrote $app"
