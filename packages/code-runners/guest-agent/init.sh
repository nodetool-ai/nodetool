#!/bin/sh
# ==========================================================================
# Firecracker Guest Agent — init.sh
#
# Reference implementation of the guest-side agent for Firecracker-based
# code runners. This script is intended to run as PID 1 (init) inside the
# microVM rootfs.
#
# Requirements in the rootfs:
#   - busybox (sh, cat, timeout, kill, etc.)
#   - jq (for JSON parsing)
#   - socat (built with vsock support, >= 1.7.4)
#   - Language runtimes as needed (python3, node, bash, ruby, lua)
#
# Protocol:
#   The agent listens on vsock port 1024 (configurable via AGENT_PORT env).
#   After the vsock handshake (CONNECT/OK), it reads one JSON-line request:
#
#     {"action":"exec","language":"python","code":"print(42)","env":{"x":1},"timeout":10}
#
#   It then streams JSON-line responses:
#
#     {"type":"stdout","data":"42\n"}
#     {"type":"stderr","data":"some warning\n"}
#     {"type":"exit","code":0}
#
# Building a rootfs:
#   1. Create an ext4 image:
#        dd if=/dev/zero of=rootfs.ext4 bs=1M count=256
#        mkfs.ext4 rootfs.ext4
#   2. Mount and populate with Alpine:
#        mount rootfs.ext4 /mnt
#        apk --root /mnt --initdb add alpine-base busybox jq socat
#        apk --root /mnt add python3   # or nodejs, ruby, lua5.4, etc.
#   3. Copy this script:
#        cp init.sh /mnt/init
#        cp execute.sh /mnt/usr/local/bin/execute.sh
#        chmod +x /mnt/init /mnt/usr/local/bin/execute.sh
#   4. Unmount:
#        umount /mnt
# ==========================================================================

set -e

AGENT_PORT="${AGENT_PORT:-1024}"

# --------------------------------------------------------------------------
# Phase 1: Mount essential virtual filesystems
# --------------------------------------------------------------------------
mount -t proc     proc     /proc 2>/dev/null || true
mount -t sysfs    sysfs    /sys  2>/dev/null || true
mount -t devtmpfs devtmpfs /dev  2>/dev/null || true

mkdir -p /dev/pts /dev/shm /tmp /run
mount -t devpts devpts /dev/pts 2>/dev/null || true
mount -t tmpfs  tmpfs  /dev/shm 2>/dev/null || true
mount -t tmpfs  tmpfs  /tmp     2>/dev/null || true
mount -t tmpfs  tmpfs  /run     2>/dev/null || true

# --------------------------------------------------------------------------
# Phase 2: Basic system setup
# --------------------------------------------------------------------------
hostname firecracker
export HOME=/root
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# --------------------------------------------------------------------------
# Phase 3: Listen for code execution requests on vsock
# --------------------------------------------------------------------------
# socat's VSOCK-LISTEN binds on AF_VSOCK with the guest's CID.
# For each connection, it forks and runs the execute.sh handler.
# --------------------------------------------------------------------------

echo "guest-agent: listening on vsock port ${AGENT_PORT}" > /dev/console 2>/dev/null || true

exec socat \
  "VSOCK-LISTEN:${AGENT_PORT},reuseaddr,fork" \
  "EXEC:/usr/local/bin/execute.sh"
