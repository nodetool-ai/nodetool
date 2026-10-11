---
layout: page
title: "Wan2GP"
description: "Generate video in NodeTool with a Wan2GP server you run yourself: install the server and the pack, point the nodes at it, or attach a combined GPU worker."
---

The Wan2GP pack adds three video nodes that call a
[Wan2GP](https://github.com/deepbeepmeep/Wan2GP) server over MCP. The model
runs in Wan2GP's own process and Python environment, never inside NodeTool, so
the pack itself installs no PyTorch.

| Node | What it does |
|---|---|
| `wan2gp.text_to_video.TextToVideo` | Generates a clip from a prompt |
| `wan2gp.image_to_video.ImageToVideo` | Animates a still image |
| `wan2gp.generate.Generate` | Runs any Wan2GP model with a settings dict on top of that model's defaults |

## 1. Run a Wan2GP server

Wan2GP needs its own conda environment and its own PyTorch build. Do not
install it into the NodeTool environment. Follow Wan2GP's
[installation guide](https://github.com/deepbeepmeep/Wan2GP/blob/main/docs/INSTALLATION.md).
It gives one PyTorch build for RTX 20xx to RTX 50xx cards and an older one for
GTX 10xx cards.

Start it with its MCP server on streamable HTTP:

```bash
python wgp.py --mcp --mcp-transport streamable-http --mcp-host 127.0.0.1 --mcp-port 7866
```

The MCP endpoint is then `http://127.0.0.1:7866/mcp`. Bind to `0.0.0.0` only
on a trusted network or behind an authenticated reverse proxy.

## 2. Install the pack

- **Desktop app:** open **Tools → Package Manager → Python packs** and install
  **Wan2GP**. Python is set up first if it is missing.
- **Without the desktop app:** run `pip install nodetool-wan2gp` in the Python
  environment NodeTool uses. See
  [Python nodes without the desktop app](installation.md#python-nodes-without-the-desktop-app).

## 3. Point the nodes at the server

Each node resolves the server URL when it runs, in this order:

1. The node's `server_url` field, when it is not blank.
2. `WAN2GP_MCP_URL`, set in **Settings → Integrations** or in the environment.
3. `http://127.0.0.1:7866/mcp`.

A server on the same machine at the default port needs no setting. The Python
worker receives `WAN2GP_MCP_URL` when it starts, so restart NodeTool after
changing it. A shell `export` does not reach a desktop app opened from the
Finder or the Start menu. Use the setting or the node's `server_url` there.

## Combined GPU worker

The pack repository also builds `Dockerfile.combined`, a GPU worker image that
runs the NodeTool Python worker with a pinned Wan2GP runtime in one container.
It does not start the NodeTool server. Attach a NodeTool server to it as a
remote worker:

```bash
export NODETOOL_WORKER_URL=ws://<gpu-host>:7777
export NODETOOL_WORKER_TOKEN=<the token the container was started with>
nodetool serve
```

Without `NODETOOL_WORKER_URL`, the server starts a local worker and never
contacts the container. Build and run instructions are in the
[nodetool-wan2gp README](https://github.com/nodetool-ai/nodetool-wan2gp#combined-non-commercial-gpu-image).
See [Worker deployment](worker-deployment.md) for remote workers in general.

## Licensing

The pack is AGPL-3.0-or-later. Wan2GP has its own license, which limits
commercial use, and each model has a separate license. The combined image is
for free, non-monetized use only. Read the pack's
[NOTICE](https://github.com/nodetool-ai/nodetool-wan2gp/blob/main/NOTICE.md)
before you redistribute or sell access to it.

## Related

- [Supported Models](models.md): local engines and hardware
- [Node Packs](node-packs.md): installing and updating packs
- [Configuration](configuration.md): `WAN2GP_MCP_URL` and the worker variables
