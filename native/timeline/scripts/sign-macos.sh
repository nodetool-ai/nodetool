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
# NOTARY_PROFILE (default AC_PASSWORD), MACOS_PROVISIONING_PROFILE (optional
# .provisionprofile embedded for Data Protection keychain sharing),
# MACOS_KEYCHAIN_ACCESS_GROUP (optional, default "<TEAM_ID>.ai.nodetool.native"
# when MACOS_PROVISIONING_PROFILE is set).
set -euo pipefail

[[ $# == 1 && -d "$1" ]] || { echo "usage: $0 APP" >&2; exit 2; }
app=$(cd "$1" && pwd -P)
identity=${MACOS_SIGN_IDENTITY:-Developer ID Application}
profile=${NOTARY_PROFILE:-AC_PASSWORD}
profile_file=${MACOS_PROVISIONING_PROFILE:-}
access_group=${MACOS_KEYCHAIN_ACCESS_GROUP:-}
entitlements="$(cd "$(dirname "$0")/../../.." && pwd)/electron/entitlements.mac.plist"
tmp_entitlements=""
# An if, not "test && rm": the EXIT trap's last status becomes the script's
# exit status, so a false test would fail a signing run that succeeded.
cleanup() {
    if [[ -n "$tmp_entitlements" && -f "$tmp_entitlements" ]]; then
        rm -f "$tmp_entitlements"
    fi
}
trap cleanup EXIT
if [[ -n "$profile_file" ]]; then
    [[ -f "$profile_file" ]] || { echo "error: provisioning profile not found: $profile_file" >&2; exit 2; }
    cp "$profile_file" "$app/Contents/embedded.provisionprofile"
    if [[ -z "$access_group" ]]; then
        team_id=$(security cms -D -i "$profile_file" 2>/dev/null \
            | /usr/libexec/PlistBuddy -c "Print :ApplicationIdentifierPrefix:0" /dev/stdin 2>/dev/null || true)
        [[ -n "$team_id" ]] || { echo "error: could not read ApplicationIdentifierPrefix from $profile_file" >&2; exit 2; }
        access_group="${team_id}.ai.nodetool.native"
    fi
    tmp_entitlements="${TMPDIR:-/tmp}/nodetool-entitlements-$$.plist"
    cp "$entitlements" "$tmp_entitlements"
    /usr/libexec/PlistBuddy -c "Delete :keychain-access-groups" "$tmp_entitlements" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Add :keychain-access-groups array" "$tmp_entitlements"
    /usr/libexec/PlistBuddy -c "Add :keychain-access-groups:0 string $access_group" "$tmp_entitlements"
    entitlements="$tmp_entitlements"
fi
# Gatekeeper treats every file in Contents/MacOS as code. A data file there
# keeps the ad-hoc signature of the build and makes spctl reject the app.
stray=()
while IFS= read -r -d '' f; do
    [[ $(file -bL "$f") == *Mach-O* ]] || stray+=("${f#"$app"/}")
done < <(find "$app/Contents/MacOS" -type f -print0)
if (( ${#stray[@]} )); then
    echo "error: Contents/MacOS holds files that are not Mach-O code. Move them to Contents/Resources:" >&2
    printf '  %s\n' "${stray[@]}" >&2
    exit 2
fi
sign=(codesign --force --timestamp --options runtime --sign "$identity")

# Inside out: every Mach-O file, then each framework, then the app. A file
# with execute permission runs as a process (the bundled Node) and gets the
# entitlements. Libraries take them from the process that loads them.
while IFS= read -r -d '' f; do
    # Not "file | grep -q": under pipefail, grep closing the pipe early can
    # fail the pipeline and skip a Mach-O file.
    [[ $(file -b "$f") == *Mach-O* ]] || continue
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
xcrun stapler validate "$app"
assessed=0
for attempt in 1 2 3 4 5; do
    if spctl --assess --type execute --ignore-cache --verbose=4 "$app"; then
        assessed=1
        break
    fi
    if [[ $attempt -lt 5 ]]; then
        echo "spctl assessment attempt $attempt/5 failed; retrying in 15s..." >&2
        sleep 15
    fi
done
if [[ $assessed -ne 1 ]]; then
    # The notary log lists every path and cdhash the ticket covers.
    echo "notarization log of $id:" >&2
    xcrun notarytool log "$id" --keychain-profile "$profile" >&2 || true
    # Gatekeeper allows nested code through its notarized Developer ID
    # rule. A plain "notarized" requirement also passes ad-hoc code whose
    # cdhash is in the ticket, so test the rule's full requirement, on
    # files, framework bundles and symlinks alike.
    rule='anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and notarized'
    echo "spctl assessment failed; code that fails Gatekeeper's notarized Developer ID rule:" >&2
    while IFS= read -r -d '' f; do
        [[ -L $f && -d $f ]] && continue
        if [[ ! -d $f ]]; then
            [[ $(file -bL "$f") == *Mach-O* && $(file -bL "$f") != *object* ]] || continue
        fi
        codesign -v -R="$rule" --check-notarization "$f" > /dev/null 2>&1 && continue
        echo "  ${f#"$app"/}" >&2
        codesign -dvv "$f" 2>&1 | grep -E '^(Format|Authority|TeamIdentifier|CDHash)=' | sed 's/^/      /' >&2 || true
    done < <(find "$app/Contents" \( -type f -o -type l -o -type d -name '*.framework' \) -print0)
    echo "running syspolicy_check for diagnostics:" >&2
    syspolicy_check distribution "$app" >&2 || true
    exit 3
fi
