#!/bin/bash
# Launcher installed as /usr/bin/nodetool by the nodetool-bin AUR package.
#
# On a Wayland session (Hyprland, Sway, GNOME, KDE) Electron is started with
# the native Wayland backend. Without it Electron falls back to X11 and needs
# XWayland. Extra Electron flags, one per line, can be added to
# ${XDG_CONFIG_HOME:-~/.config}/nodetool-flags.conf. They are passed after the
# defaults, so `--ozone-platform=x11` there forces XWayland.
set -euo pipefail

flags=()
if [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
  flags+=(--ozone-platform=wayland --enable-wayland-ime)
fi

flags_file="${XDG_CONFIG_HOME:-$HOME/.config}/nodetool-flags.conf"
if [[ -r "${flags_file}" ]]; then
  while IFS= read -r line; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "${line}" || "${line}" == \#* ]] && continue
    flags+=("${line}")
  done < "${flags_file}"
fi

exec /opt/nodetool-bin/nodetool-electron "${flags[@]}" "$@"
