#!/usr/bin/env bash
# Signs a packaged NodeTool Timeline bundle with a Developer ID identity,
# notarizes it and staples the ticket. The release workflow runs it after
# check-package-macos.sh, which refuses an identity signature.
#
# The identity and the notarization login are the ones the Electron release
# uses: the Developer ID certificate in a keychain on the search list, and
# the notarytool keychain profile AC_PASSWORD (release.yaml stores both).
# The entitlements are Electron's: the bundled Node needs JIT memory, and
# the native Node modules load without library validation.
#
#   scripts/sign-macos.sh "build-package/NodeTool Timeline.app"
# Environment: MACOS_SIGN_IDENTITY (default "Developer ID Application"),
# NOTARY_PROFILE (default AC_PASSWORD).
set -euo pipefail

[[ $# == 1 && -d "$1" ]] || { echo "usage: $0 APP" >&2; exit 2; }
app=$(cd "$1" && pwd -P)
identity=${MACOS_SIGN_IDENTITY:-Developer ID Application}
profile=${NOTARY_PROFILE:-AC_PASSWORD}
entitlements="$(cd "$(dirname "$0")/../../.." && pwd)/electron/entitlements.mac.plist"
sign=(codesign --force --timestamp --options runtime --sign "$identity")

# Inside out: every Mach-O file, then each framework, then the app. A file
# with execute permission runs as a process (the bundled Node) and gets the
# entitlements. Libraries take them from the process that loads them.
while IFS= read -r -d '' f; do
    file -b "$f" | grep -q "Mach-O" || continue
    if [[ -x "$f" && "$f" != *.dylib && "$f" != *.so && "$f" != *.node ]]; then
        "${sign[@]}" --entitlements "$entitlements" "$f"
    else
        "${sign[@]}" "$f"
    fi
done < <(find "$app/Contents" -type f ! -path "$app/Contents/MacOS/*" -print0)
while IFS= read -r -d '' fw; do
    "${sign[@]}" "$fw"
done < <(find "$app/Contents" -type d -name '*.framework' -print0)
"${sign[@]}" --entitlements "$entitlements" "$app"
codesign --verify --deep --strict "$app"

zip="${TMPDIR:-/tmp}/notarize-$$.zip"
ditto -c -k --sequesterRsrc --keepParent "$app" "$zip"
result=$(xcrun notarytool submit "$zip" --keychain-profile "$profile" --wait --output-format json)
rm -f "$zip"
id=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<< "$result")
status=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])' <<< "$result")
if [[ $status != Accepted ]]; then
    echo "error: notarization $id ended as $status" >&2
    xcrun notarytool log "$id" --keychain-profile "$profile" >&2 || true
    exit 1
fi
xcrun stapler staple "$app"
spctl --assess --type execute --verbose=2 "$app"
