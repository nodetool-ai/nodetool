#!/usr/bin/env bash
# Verifies the macOS bundle of scripts/package-macos.sh (PLAN M6), from a
# copy in a fresh temporary folder, with no window and no sound:
#   1. every Mach-O file in the bundle links only the system, @rpath,
#      @executable_path or @loader_path: no /opt/homebrew, /usr/local or
#      build path, and no LC_RPATH outside the bundle;
#   2. FFmpeg in the bundle is the LGPL build (its licence string), no
#      library carries --enable-gpl in its configuration, every bundled
#      library has its licence texts and source (macho-deps.py
#      notices-check), and each Qt framework's source is its own version;
#   3. the signature is ad-hoc only: no team identifier, no notarization ticket;
#   4. the bundled binary runs headless from the copy: --audio-dry-run,
#      --dump-plan, --probe-media and --stills, and DYLD_PRINT_LIBRARIES
#      shows no library loaded from outside the bundle and the system;
#   5. its stills match the development build's stills (PSNR 50 dB or more).
# Exit 0 only when every check passes. Prints one JSON summary line.
set -uo pipefail

cd "$(dirname "$0")/.."
root=$PWD
src_app=${1:-"build-package/NodeTool Timeline.app"}
dev_bin=${DEV_BIN:-build-m6/nodetool-timeline}
[[ -d "$src_app" ]] || { echo "{\"pass\":false,\"error\":\"no bundle at $src_app\"}"; exit 1; }
tmp=$(mktemp -d "${TMPDIR:-/tmp}/nt-package-check.XXXXXX")
tmp=$(cd "$tmp" && pwd -P)  # dyld reports /private/var, not /var
cp -R "$src_app" "$tmp/"
app="$tmp/$(basename "$src_app")"
bin="$app/Contents/MacOS/nodetool-timeline"
fail=()

# 1. Load commands.
machos=()
while IFS= read -r f; do
    file -b "$f" | grep -q "Mach-O" && machos+=("$f")
done < <(find "$app" -type f)
bad_links=$(for f in "${machos[@]}"; do
    otool -L "$f" | tail -n +2 | sed -E 's/^[[:space:]]+//; s/ \(compatibility.*$//' |
        grep -E -v '^(/System/|/usr/lib/|@rpath/|@executable_path/|@loader_path/)' | sed "s|^|$(basename "$f"): |"
    # A relative reference that still names a build machine path.
    otool -L "$f" | tail -n +2 | sed -E 's/^[[:space:]]+//; s/ \(compatibility.*$//' | grep -E '/opt/homebrew|/usr/local|/Users/|/private/' |
        sed "s|^|$(basename "$f"): |"
done)
bad_rpaths=$(for f in "${machos[@]}"; do
    otool -l "$f" | awk '/LC_RPATH/{getline; getline; print $2}' | grep -vE '^@(executable|loader)_path' |
        sed "s|^|$(basename "$f"): |"
done)
[[ -z "$bad_links" ]] || fail+=("absolute library paths")
# Every @rpath, @loader_path and @executable_path reference resolves to a
# file inside the bundle, and no rpath leaves it.
deps_json=$(python3 scripts/macho-deps.py check "$app")
deps_ok=$?
[[ $deps_ok == 0 ]] || fail+=("unresolved or escaping library references")
dangling=$(find "$app" -type l ! -exec test -e {} \; -print | wc -l | tr -d ' ')
[[ $dangling == 0 ]] || fail+=("$dangling dangling links in the bundle")
deps_problems=$(node -e 'console.log(JSON.parse(process.argv[1]).problems.length)' "$deps_json")
[[ -z "$bad_rpaths" ]] || fail+=("rpaths outside the bundle")
homebrew_refs=$(for f in "${machos[@]}"; do otool -L "$f" | tail -n +2; done | grep -c "/opt/homebrew")
[[ $homebrew_refs == 0 ]] || fail+=("library references into /opt/homebrew")

# 2. Licences.
avcodec=$(ls "$app/Contents/Frameworks"/libavcodec*.dylib 2>/dev/null | head -1)
license=""
if [[ -n "$avcodec" ]] && strings "$avcodec" > "$tmp/avcodec-strings.txt"; then
    license=$(grep -m1 "license: " "$tmp/avcodec-strings.txt")
fi
[[ "$license" == *"LGPL version 2.1 or later"* ]] || fail+=("FFmpeg is not the LGPL build")
# The whole strings output is read before the search, so pipefail cannot
# turn an early grep exit into a miss; a failed strings run is a failure.
gpl_config=""
ffmpeg_libs=0
for f in "$app/Contents/Frameworks"/lib{avcodec,avformat,avutil,swscale,swresample}*.dylib; do
    [[ -f "$f" ]] || continue
    ffmpeg_libs=$((ffmpeg_libs + 1))
    if ! strings "$f" > "$tmp/strings.txt"; then
        fail+=("cannot read $(basename "$f")")
        continue
    fi
    if grep -q -e "--enable-gpl" -e "--enable-nonfree" "$tmp/strings.txt"; then gpl_config+="$(basename "$f") "; fi
done
[[ $ffmpeg_libs == 5 ]] || fail+=("expected 5 FFmpeg libraries, found $ffmpeg_libs")
[[ -z "$gpl_config" ]] || fail+=("configured with --enable-gpl or --enable-nonfree: $gpl_config")

# Full licence texts and the source information (review F8).
lic="$app/Contents/Resources/licenses"
for name in Qt-LGPL-3.0 Qt-GPL-3.0 FFmpeg-LGPL-2.1 miniaudio Inter-OFL-1.1 JetBrainsMono-OFL-1.1 Yoga-MIT; do
    f="$lic/$name.txt"
    if [[ ! -s "$f" ]] || [[ $(wc -l < "$f") -lt 10 ]]; then fail+=("licence text $name is missing or not the full text"); fi
done
grep -q "Permission is hereby granted" "$lic/Yoga-MIT.txt" 2> /dev/null || fail+=("Yoga licence is not the MIT text")
grep -q "^Yoga 3.2.1 (MIT), compiled in" "$app/Contents/Resources/source/SOURCES.txt" 2> /dev/null ||
    fail+=("SOURCES.txt does not name Yoga")
grep -q "GNU LESSER GENERAL PUBLIC LICENSE" "$lic/Qt-LGPL-3.0.txt" 2> /dev/null || fail+=("Qt LGPL text is not the licence")
grep -q "Version 2.1, February 1999" "$lic/FFmpeg-LGPL-2.1.txt" 2> /dev/null || fail+=("FFmpeg LGPL text is not the licence")
srcdir="$app/Contents/Resources/source"
tarball=$(ls "$srcdir"/ffmpeg-*.tar.xz 2> /dev/null | head -1)
if [[ -z "$tarball" ]] || ! grep -q "$(shasum -a 256 "$tarball" | cut -d' ' -f1)" "$srcdir/SOURCES.txt" 2> /dev/null; then
    fail+=("the FFmpeg source or its checksum in SOURCES.txt is missing")
fi
# Every bundled library has a notice: a component with full licence texts and
# a source in SOURCES.txt, from the bundle's own Mach-O files (M6 F8). Each Qt
# framework's version is the version of the source named for it (review F4).
notices_json=$(python3 scripts/macho-deps.py notices-check "$app")
[[ $? == 0 ]] || fail+=("bundled libraries without notices or with the wrong source")
notice_problems=$(node -e 'console.log(JSON.parse(process.argv[1]).problems.length)' "$notices_json")

# 3. Signature.
sig=$(codesign -dv "$app" 2>&1)
signature=$(echo "$sig" | awk -F= '/^Signature=/{print $2}')
team=$(echo "$sig" | awk -F= '/^TeamIdentifier=/{print $2}')
[[ "$signature" == "adhoc" && ( -z "$team" || "$team" == "not set" ) ]] || fail+=("the bundle is identity-signed")
codesign --verify --deep --strict "$app" 2> /dev/null || fail+=("the ad-hoc signature does not verify")
if xcrun stapler validate "$app" > /dev/null 2>&1; then fail+=("a notarization ticket is stapled"); fi

# 4. Headless runs of the copy. Default platform (cocoa) with no window, as
# every offscreen mode runs; audio mode none.
out="$tmp/out"
mkdir -p "$out"
dry=$("$bin" fixtures/av-sync.json --audio-dry-run 2> /dev/null)
[[ "$dry" == "audio mode: system" ]] || fail+=("--audio-dry-run printed '$dry'")
dry_auto=$("$bin" fixtures/av-sync.json --stills="$out/x" --still-frames=1 --audio-dry-run 2> /dev/null)
[[ "$dry_auto" == "audio mode: none" ]] || fail+=("--audio-dry-run with --stills printed '$dry_auto'")
"$bin" fixtures/three-tracks.json --dump-plan --times 0,8500,12000 > "$out/plan.json" 2> /dev/null ||
    fail+=("--dump-plan failed")
"$dev_bin" fixtures/three-tracks.json --dump-plan --times 0,8500,12000 > "$out/plan-dev.json" 2> /dev/null
cmp -s "$out/plan.json" "$out/plan-dev.json" || fail+=("--dump-plan differs from the development build")
"$bin" fixtures/video-rejections.json --probe-media > "$out/probe.json" 2> /dev/null || fail+=("--probe-media failed")
# The whole QML editor, offscreen: the QML plug-ins the app needs are there.
"$bin" fixtures/three-tracks.json --screenshot "$out/editor.png" --audio none > /dev/null 2> "$out/screenshot.log" &&
    [[ -s "$out/editor.png" ]] || fail+=("--screenshot of the editor failed")
DYLD_PRINT_LIBRARIES=1 "$bin" fixtures/video-cuts.json --stills "$out/stills" --still-frames 0,59,60 --audio none \
    > /dev/null 2> "$out/stills.log" || fail+=("--stills failed")
outside=$(grep -E "^dyld\[[0-9]+\]: <" "$out/stills.log" | sed -E 's/^dyld\[[0-9]+\]: <[^>]*> //' |
    grep -vE "^(/System/|/usr/lib/|$app/)" | sort -u)
[[ -z "$outside" ]] || fail+=("libraries loaded from outside the bundle")
loaded_from_bundle=$(grep -cE "^dyld\[[0-9]+\]: <[^>]*> $app/" "$out/stills.log")

# 5. Stills against the development build.
"$dev_bin" fixtures/video-cuts.json --stills "$out/stills-dev" --still-frames 0,59,60 > /dev/null 2>&1
psnr_min=999
for f in "$out"/stills/frame_*.png; do
    p=$(ffmpeg -hide_banner -nostats -i "$f" -i "$out/stills-dev/$(basename "$f")" -lavfi psnr -f null - 2>&1 |
        sed -nE 's/.*average:([0-9.]+|inf).*/\1/p')
    [[ "$p" == "inf" ]] && p=999
    psnr_min=$(awk -v a="$psnr_min" -v b="${p:-0}" 'BEGIN{print (b < a) ? b : a}')
done
stills=$(ls "$out"/stills/frame_*.png 2> /dev/null | wc -l | tr -d ' ')
[[ "$stills" == 3 ]] || fail+=("expected 3 stills, got $stills")
awk -v p="$psnr_min" 'BEGIN{exit !(p >= 50)}' || fail+=("stills differ from the development build (PSNR $psnr_min)")

pass=true
[[ ${#fail[@]} == 0 ]] || pass=false
node -e '
const [pass, machos, homebrew, badLinks, badRpaths, license, signature, team, loaded, outside, stills, psnr, tmp, deps, notices, ...fail] = process.argv.slice(1);
console.log(JSON.stringify({pass: pass === "true", machoFiles: Number(machos), homebrewReferences: Number(homebrew),
  absoluteLinks: badLinks ? badLinks.split("\n") : [], outsideRpaths: badRpaths ? badRpaths.split("\n") : [],
  ffmpegLicense: license, signature, teamIdentifier: team || null, librariesLoadedFromBundle: Number(loaded),
  librariesLoadedFromOutside: outside ? outside.split("\n") : [], stills: Number(stills), stillsMinPsnrDb: Number(psnr),
  copy: tmp, unresolvedReferences: Number(deps), noticeProblems: Number(notices), failures: fail}));
' "$pass" "${#machos[@]}" "$homebrew_refs" "$bad_links" "$bad_rpaths" "$license" "$signature" "$team" \
    "$loaded_from_bundle" "$outside" "$stills" "$psnr_min" "$tmp" "$deps_problems" "$notice_problems" \
    "${fail[@]+"${fail[@]}"}"
[[ $pass == true ]]
