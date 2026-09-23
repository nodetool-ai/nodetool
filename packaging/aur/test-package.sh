#!/bin/bash
# Builds, lints, installs and launches the nodetool-bin package on Arch Linux.
#
# Run as root inside an archlinux container, with the package directory made
# by render.sh as the only argument:
#
#   docker run --rm -v "$PWD/aur-pkg:/pkg" -v "$PWD/packaging/aur:/aur:ro" \
#     archlinux:latest /aur/test-package.sh /pkg
#
# On success the directory holds the PKGBUILD with real checksums and a
# matching .SRCINFO, ready to push to the AUR. Set SRCDEST to a directory that
# already holds nodetool-<version>.AppImage to skip the download.
#
# The launch test mirrors an Omarchy session: a wlroots compositor (headless
# Sway standing in for Hyprland), a D-Bus session and an unlocked
# gnome-keyring. The app is started from its desktop entry and must open a
# native Wayland window and bring its backend up.
set -euo pipefail

pkg_dir="$(realpath "${1:?usage: test-package.sh <package-dir>}")"
builder=builder
app_id=nodetool-electron
install_dir=/opt/nodetool-bin

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nFAIL: %s\n' "$*" >&2; exit 1; }

log "Installing build and test dependencies"
pacman -Syu --noconfirm --needed \
  base-devel pacman-contrib namcap desktop-file-utils \
  sway jq curl dbus gnome-keyring ttf-dejavu mesa >/dev/null

# Sway ships with cap_sys_nice, which a container without that capability
# refuses to exec for an unprivileged user.
setcap -r /usr/bin/sway 2>/dev/null || true

id "${builder}" >/dev/null 2>&1 || useradd -m "${builder}"
echo "${builder} ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/builder
chown -R "${builder}:" "${pkg_dir}"
[[ -n "${SRCDEST:-}" ]] && chown -R "${builder}:" "${SRCDEST}"

as_builder() {
  sudo -u "${builder}" --preserve-env=SRCDEST,https_proxy,HTTPS_PROXY \
    bash -c "cd '${pkg_dir}' && $*"
}

log "Computing checksums and .SRCINFO"
as_builder updpkgsums
as_builder 'makepkg --printsrcinfo > .SRCINFO'
grep -q "SKIP" "${pkg_dir}/PKGBUILD" && fail "PKGBUILD still has SKIP checksums"

log "namcap: PKGBUILD"
namcap_pkgbuild="$(namcap "${pkg_dir}/PKGBUILD")"
printf '%s\n' "${namcap_pkgbuild}"
grep -q ' E: ' <<<"${namcap_pkgbuild}" && fail "namcap reported errors in PKGBUILD"

log "Building package"
as_builder 'makepkg --syncdeps --force --cleanbuild --clean --noconfirm'
package_file="$(find "${pkg_dir}" -maxdepth 1 -name 'nodetool-bin-*.pkg.tar.*' | head -n1)"
[[ -n "${package_file}" ]] || fail "makepkg produced no package"
ls -lh "${package_file}"

log "namcap: package (report only)"
# The package ships prebuilt Electron, Node and native addon trees whose
# RUNPATHs, helper scripts and optional GPU backends namcap flags. Those
# findings belong to upstream binaries, so they are summarized, not enforced.
namcap "${package_file}" | sed -E "s/ \(.*//; s/'[^']*'/'…'/g" | sort | uniq -c | sort -rn || true

log "Installing package"
pacman -U --noconfirm "${package_file}" >/dev/null
rm -f "${package_file}"

log "Checking installed files"
desktop_file="/usr/share/applications/${app_id}.desktop"
desktop-file-validate "${desktop_file}"
[[ -x /usr/bin/nodetool ]] || fail "/usr/bin/nodetool is missing"
[[ -f "/usr/share/icons/hicolor/512x512/apps/${app_id}.png" ]] || fail "icon is missing"
grep -qx "Icon=${app_id}" "${desktop_file}" || fail "desktop entry icon does not match the app id"
grep -qx "Exec=nodetool %U" "${desktop_file}" || fail "desktop entry does not launch /usr/bin/nodetool"
grep -q "x-scheme-handler/nodetool=${app_id}.desktop" /usr/share/applications/mimeinfo.cache \
  || fail "nodetool:// handler is not registered"
[[ "$(stat -c '%a %U' "${install_dir}/chrome-sandbox")" == "4755 root" ]] || fail "chrome-sandbox is not setuid root"
unreadable="$(find "${install_dir}" ! -perm -o+r -print -quit)"
[[ -z "${unreadable}" ]] || fail "files unreadable by other users, e.g. ${unreadable}"
[[ -f "${install_dir}/resources/app.asar" ]] || fail "app.asar is missing"
[[ -f "${install_dir}/resources/backend/server.mjs" ]] || fail "backend bundle is missing"
[[ -x "${install_dir}/resources/backend/runtime/node" ]] || fail "backend Node runtime is missing"
pacman -Qkk nodetool-bin >/dev/null || fail "installed files do not match the package"

log "Launching from the desktop entry in a headless Wayland session"
cat > /usr/local/bin/nodetool-smoke <<'SMOKE'
#!/bin/bash
set -euo pipefail
app_id="$1"
export XDG_RUNTIME_DIR="/tmp/xdg-$(id -u)"
mkdir -p -m 700 "${XDG_RUNTIME_DIR}"
export XDG_SESSION_TYPE=wayland XDG_CURRENT_DESKTOP=sway
export WLR_BACKENDS=headless WLR_LIBINPUT_NO_DEVICES=1 WLR_RENDERER=pixman

# An unlocked login keyring, as a desktop login leaves it.
mkdir -p ~/.local/share/keyrings
printf 'ci' | gnome-keyring-daemon --unlock --components=secrets >/dev/null
gnome-keyring-daemon --start --components=secrets >/dev/null

printf 'output HEADLESS-1 resolution 1600x1000\n' > /tmp/sway.conf
sway -c /tmp/sway.conf >/tmp/sway.log 2>&1 &
for _ in $(seq 1 50); do
  ls "${XDG_RUNTIME_DIR}"/sway-ipc.* >/dev/null 2>&1 && break
  sleep 0.2
done
export SWAYSOCK="$(ls "${XDG_RUNTIME_DIR}"/sway-ipc.* | head -n1)"
export WAYLAND_DISPLAY="$(basename "$(ls "${XDG_RUNTIME_DIR}"/wayland-? | head -n1)")"

# Containers have no user namespaces for the Chromium sandbox. The flags file
# is the documented way to pass Electron switches, so this also covers it.
mkdir -p ~/.config
printf '# test flags\n--no-sandbox\n' > ~/.config/nodetool-flags.conf

# Launch the Exec line of the desktop entry, as an app launcher would.
exec_line="$(sed -n 's/^Exec=//p' "/usr/share/applications/${app_id}.desktop" | sed 's/ %U//')"
CI=true ${exec_line} >/tmp/nodetool.log 2>&1 &
app_pid=$!

windows() {
  swaymsg -t get_tree | jq -r '.. | objects | select(.type? == "con" and .pid?) | "\(.app_id)|\(.shell)"'
}

status=0
window=""
for _ in $(seq 1 60); do
  window="$(windows | head -n1)"
  [[ -n "${window}" ]] && break
  sleep 1
done
if [[ "${window}" != "${app_id}|xdg_shell" ]]; then
  echo "expected a native Wayland window '${app_id}|xdg_shell', got '${window:-none}'" >&2
  status=1
else
  echo "window: ${window}"
fi

healthy=0
for _ in $(seq 1 120); do
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
  tail -n 80 /tmp/nodetool.log >&2
  echo "----- sway log -----" >&2
  tail -n 20 /tmp/sway.log >&2
fi
kill "${app_pid}" 2>/dev/null || true
exit "${status}"
SMOKE
chmod 755 /usr/local/bin/nodetool-smoke
sudo -u "${builder}" -H dbus-run-session -- timeout 300 /usr/local/bin/nodetool-smoke "${app_id}" \
  || fail "desktop launch smoke test failed"

log "nodetool-bin package passed"
