# Firecracker Guest Agent

Reference implementation of the guest-side agent for Firecracker microVM code execution.

## Overview

The guest agent runs as PID 1 (init) inside the microVM. It listens on a vsock port for code execution requests from the host and streams results back using a JSON-line protocol.

## Components

- **`init.sh`** — Init script (PID 1). Mounts filesystems, sets up the environment, and starts `socat` listening on vsock.
- **`execute.sh`** — Execution handler. Invoked per-connection by socat. Parses the JSON request, runs the code, and streams output.

## Rootfs Requirements

The ext4 root filesystem image must contain:

| Package | Purpose |
|---------|---------|
| busybox | Core utilities (sh, mount, mktemp, etc.) |
| jq | JSON parsing |
| socat (>= 1.7.4) | vsock communication |
| Language runtimes | python3, nodejs, bash, ruby, lua as needed |

## Building a Rootfs

### Alpine-based (recommended)

```bash
# Create a 256MB ext4 image
dd if=/dev/zero of=rootfs.ext4 bs=1M count=256
mkfs.ext4 rootfs.ext4

# Mount and populate
sudo mount rootfs.ext4 /mnt
sudo apk --root /mnt --initdb --repositories-file /etc/apk/repositories \
  add alpine-base busybox jq socat

# Add language runtimes
sudo apk --root /mnt add python3       # Python
sudo apk --root /mnt add nodejs        # JavaScript
sudo apk --root /mnt add ruby          # Ruby
sudo apk --root /mnt add lua5.4        # Lua

# Install guest agent
sudo cp init.sh /mnt/init
sudo cp execute.sh /mnt/usr/local/bin/execute.sh
sudo chmod +x /mnt/init /mnt/usr/local/bin/execute.sh

# Unmount
sudo umount /mnt
```

### Separate images per language (smaller)

For production, build separate rootfs images per language to minimize image size:

```bash
# Python-only rootfs (~80MB)
sudo apk --root /mnt --initdb add alpine-base busybox jq socat python3

# Node.js-only rootfs (~90MB)
sudo apk --root /mnt --initdb add alpine-base busybox jq socat nodejs
```

## Protocol

### Request (host → guest)

One JSON line sent after vsock handshake:

```json
{
  "action": "exec",
  "language": "python",
  "code": "print('hello world')",
  "env": {"x": 42, "name": "test"},
  "timeout": 10
}
```

### Response (guest → host)

Stream of JSON lines:

```json
{"type": "stdout", "data": "hello world\n"}
{"type": "stderr", "data": "some warning\n"}
{"type": "exit", "code": 0}
```

The `exit` message is always the last message sent.

## Kernel

You need an uncompressed Linux kernel (`vmlinux`). You can download pre-built kernels from:

- [Firecracker CI artifacts](https://github.com/firecracker-microvm/firecracker/blob/main/docs/getting-started.md#getting-a-rootfs-and-guest-kernel-image)
- Build your own minimal kernel with vsock support enabled (`CONFIG_VIRTIO_VSOCKETS=y`)

Required kernel config options:
```
CONFIG_VIRTIO=y
CONFIG_VIRTIO_VSOCKETS=y
CONFIG_VIRTIO_BLK=y
CONFIG_VIRTIO_NET=y  # only if networking is needed
CONFIG_EXT4_FS=y
```
