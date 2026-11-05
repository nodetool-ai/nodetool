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

log "Adding the cask to the ${tap} tap"
brew tap-new --no-git "${tap}"
tap_dir="$(brew --repository "${tap}")"
mkdir -p "${tap_dir}/Casks"
cp "${cask_file}" "${tap_dir}/Casks/nodetool.rb"

log "brew style"
brew style --cask "${cask}"

log "brew audit"
brew audit --cask --new --online --strict --signing "${cask}"

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
# `brew audit --signing` above ran Gatekeeper's scan on the app. These check
# the installed copy: a Developer ID signature and a stapled notarization
# ticket.
codesign --verify --deep --strict --verbose=2 "${app}"
codesign --display --verbose=2 "${app}" 2>&1 | grep -q "^Authority=Developer ID Application:" \
  || fail "the app is not signed with a Developer ID Application certificate"
xcrun stapler validate "${app}"

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
# The audit's Gatekeeper scan is the decision a first open makes. Clearing the
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
