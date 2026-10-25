#!/usr/bin/env bash
# Verifies the macOS bundle of scripts/package-macos.sh (PLAN M6), from a
# copy in a fresh temporary folder, with no window and no sound:
#   1. every Mach-O file in the bundle links only the system, @rpath,
#      @executable_path or @loader_path: no /opt/homebrew, /usr/local or
#      build path, and no LC_RPATH outside the bundle;
#   2. FFmpeg in the bundle is the LGPL build (its licence string), and no
#      library carries --enable-gpl in its configuration;
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
    otool -L "$f" | tail -n +2 | awk '{print $1}' |
        grep -vE '^(/System/|/usr/lib/|@rpath/|@executable_path/|@loader_path/)' | sed "s|^|$(basename "$f"): |"
done)
bad_rpaths=$(for f in "${machos[@]}"; do
    otool -l "$f" | awk '/LC_RPATH/{getline; getline; print $2}' | grep -vE '^@(executable|loader)_path' |
        sed "s|^|$(basename "$f"): |"
done)
[[ -z "$bad_links" ]] || fail+=("absolute library paths")
[[ -z "$bad_rpaths" ]] || fail+=("rpaths outside the bundle")
homebrew_refs=$(for f in "${machos[@]}"; do otool -L "$f"; done | grep -c "/opt/homebrew")

# 2. Licences.
avcodec=$(ls "$app/Contents/Frameworks"/libavcodec*.dylib 2>/dev/null | head -1)
license=$( [[ -n "$avcodec" ]] && strings "$avcodec" | grep -m1 "license: " )
[[ "$license" == *"LGPL version 2.1 or later"* ]] || fail+=("FFmpeg is not the LGPL build")
gpl_config=$(for f in "$app/Contents/Frameworks"/lib{avcodec,avformat,avutil,swscale,swresample}*.dylib; do
    strings "$f" | grep -l -- "--enable-gpl" > /dev/null && basename "$f"
done)
[[ -z "$gpl_config" ]] || fail+=("a library was configured with --enable-gpl")

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
const [pass, machos, homebrew, badLinks, badRpaths, license, signature, team, loaded, outside, stills, psnr, tmp, ...fail] = process.argv.slice(1);
console.log(JSON.stringify({pass: pass === "true", machoFiles: Number(machos), homebrewReferences: Number(homebrew),
  absoluteLinks: badLinks ? badLinks.split("\n") : [], outsideRpaths: badRpaths ? badRpaths.split("\n") : [],
  ffmpegLicense: license, signature, teamIdentifier: team || null, librariesLoadedFromBundle: Number(loaded),
  librariesLoadedFromOutside: outside ? outside.split("\n") : [], stills: Number(stills), stillsMinPsnrDb: Number(psnr),
  copy: tmp, failures: fail}));
' "$pass" "${#machos[@]}" "$homebrew_refs" "$bad_links" "$bad_rpaths" "$license" "$signature" "$team" \
    "$loaded_from_bundle" "$outside" "$stills" "$psnr_min" "$tmp" "${fail[@]+"${fail[@]}"}"
[[ $pass == true ]]
