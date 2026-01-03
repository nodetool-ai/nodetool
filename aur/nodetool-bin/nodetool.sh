#!/usr/bin/bash

XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
NODETOOL_USER_FLAGS=()

# Allow users to override command-line options
if [[ -f "${XDG_CONFIG_HOME}/nodetool-flags.conf" ]]; then
    while IFS= read -r line; do
        # Skip empty lines and comments
        [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
        NODETOOL_USER_FLAGS+=("$line")
    done < "${XDG_CONFIG_HOME}/nodetool-flags.conf"

    if [[ ${#NODETOOL_USER_FLAGS[@]} -gt 0 ]]; then
        echo "User flags:" "${NODETOOL_USER_FLAGS[@]}"
    fi
fi

# Launch
exec /opt/nodetool/nodetool.AppImage "${NODETOOL_USER_FLAGS[@]}" "$@"
