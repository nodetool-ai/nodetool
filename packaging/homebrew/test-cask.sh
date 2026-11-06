#!/bin/bash
# Tests a rendered nodetool cask on macOS the way Homebrew/homebrew-cask CI
# would, then installs it and launches the app.
#
#   packaging/homebrew/test-cask.sh nodetool.rb 0.8.11
#
# It audits and styles the cask in a throwaway tap, checks that livecheck finds
# a stable version, installs it, checks the installed app's signature,
# notarization, architecture, version and updater feed, launches it until the
# backend answers /health, and removes it with --zap.
set -euo pipefail

cask_file="${1:?usage: test-cask.sh <cask.rb> <version>}"
version="${2:?usage: test-cask.sh <cask.rb> <version>}"
tap="nodetool-ai/test"
cask="${tap}/nodetool"
app="/Applications/Nodetool.app"

export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 HOMEBREW_NO_ENV_HINTS=1

log() { printf '\n==> %s\n' "$*"; }
fail() { echo "test-cask.sh: $*" >&2; exit 1; }

# Runner images ship different Homebrew versions. Test against the current
# one, which is what homebrew-cask CI runs.
log "brew update"
brew update

log "Adding the cask to the ${tap} tap"
brew tap-new --no-git "${tap}"
tap_dir="$(brew --repository "${tap}")"
mkdir -p "${tap_dir}/Casks"
cp "${cask_file}" "${tap_dir}/Casks/nodetool.rb"
# Homebrew refuses to load casks from a tap nobody has trusted.
brew trust "${tap}"

log "brew style"
brew style --cask "${cask}"

log "brew audit"
brew audit --cask --new --online --strict "${cask}"

log "brew livecheck"
latest="$(brew livecheck --cask --json "${cask}" | python3 -c '
import json, sys
print(json.load(sys.stdin)[0]["version"]["latest"])
')"
echo "livecheck: ${latest}"
[[ "${latest}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "livecheck returned '${latest}', not a stable X.Y.Z version"

log "brew install"
brew install --cask "${cask}"
[[ -d "${app}" ]] || fail "${app} is missing after install"

log "Checking the installed app"
# homebrew-cask CI runs its signing audit only for the official tap, so run
# the same checks here: Apple's notarization check and, where the OS has it,
# Gatekeeper's scan of the quarantined app.
codesign --verify --deep --strict --verbose=2 "${app}"
codesign --display --verbose=2 "${app}" 2>&1 | grep -q "^Authority=Developer ID Application:" \
  || fail "the app is not signed with a Developer ID Application certificate"
codesign --verify -R=notarized --check-notarization --verbose=2 "${app}" \
  || fail "the app is not notarized"
# stapler asks Apple's ticket service, so a dropped connection is retried.
stapled=0
for attempt in 1 2 3; do
  if xcrun stapler validate "${app}"; then
    stapled=1
    break
  fi
  echo "stapler validate failed (attempt ${attempt}); retrying"
  sleep $((attempt * 10))
done
[[ "${stapled}" == 1 ]] || fail "the app has no valid stapled notarization ticket"
if command -v gktool >/dev/null; then
  gktool scan "${app}" || fail "Gatekeeper rejected the app"
else
  echo "gktool is not available on this macOS; skipping the Gatekeeper scan"
fi

machine="$(uname -m)"
archs="$(lipo -archs "${app}/Contents/MacOS/Nodetool")"
echo "architectures: ${archs}, runner: ${machine}"
grep -qw "${machine}" <<<"${archs}" || fail "the app has no ${machine} binary"

installed="$(defaults read "${app}/Contents/Info" CFBundleShortVersionString)"
[[ "${installed}" == "${version}" ]] || fail "installed version ${installed}, expected ${version}"

# auto_updates true hands upgrades to electron-updater, which reads its feed
# from this file.
feed="${app}/Contents/Resources/app-update.yml"
[[ -f "${feed}" ]] || fail "${feed} is missing"
grep -qx "provider: github" "${feed}" || fail "${feed} does not name the GitHub feed"
cat "${feed}"

log "Launching the app"
# The Gatekeeper scan above is the decision a first open makes. Clearing the
# quarantine flag keeps the first-open dialog from blocking a headless run.
xattr -dr com.apple.quarantine "${app}"
CI=true "${app}/Contents/MacOS/Nodetool" >/tmp/nodetool-cask.log 2>&1 &
app_pid=$!

status=0
healthy=0
for _ in $(seq 1 180); do
  if curl -fsS http://127.0.0.1:7777/health >/dev/null 2>&1; then
    healthy=1
    break
  fi
  kill -0 "${app_pid}" 2>/dev/null || break
  sleep 1
done
if [[ "${healthy}" == 1 ]]; then
  echo "backend: $(curl -fsS http://127.0.0.1:7777/health)"
else
  echo "backend never answered /health" >&2
  status=1
fi
kill -0 "${app_pid}" 2>/dev/null || { echo "app exited early" >&2; status=1; }
if [[ "${status}" != 0 ]]; then
  echo "----- app log -----" >&2
  tail -n 120 /tmp/nodetool-cask.log >&2
fi
kill "${app_pid}" 2>/dev/null || true
for _ in $(seq 1 30); do
  pgrep -f "${app}/Contents/" >/dev/null || break
  sleep 1
done
pkill -9 -f "${app}/Contents/" 2>/dev/null || true
[[ "${status}" == 0 ]] || fail "launch smoke test failed"

user_data="${HOME}/Library/Application Support/nodetool-electron"
[[ -d "${user_data}" ]] || fail "the app did not create ${user_data}, which the zap stanza names"

log "brew uninstall --zap"
brew uninstall --cask --zap "${cask}"
[[ ! -e "${app}" ]] || fail "${app} is still present after uninstall"
[[ ! -e "${user_data}" ]] || fail "zap left ${user_data}"

log "nodetool cask ${version} passed"
