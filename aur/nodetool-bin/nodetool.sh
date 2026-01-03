#!/usr/bin/bash

XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-~/.config}

# Allow users to override command-line options
if [[ -f "${XDG_CONFIG_HOME}/nodetool-flags.conf" ]]; then
    mapfile -t NODETOOL_USER_FLAGS <<<"$(grep -v '^#' "${XDG_CONFIG_HOME}/nodetool-flags.conf")"
    echo "User flags:" ${NODETOOL_USER_FLAGS[@]}
fi

# Launch
exec /opt/nodetool/nodetool.AppImage ${NODETOOL_USER_FLAGS[@]} "$@"
