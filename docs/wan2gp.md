---
layout: page
title: "Wan2GP"
description: "Generate video, images, audio and 3D models in NodeTool with a Wan2GP server you run yourself: start the server, point NodeTool at it, and use the lib.wan2gp nodes or the wangp provider."
---

NodeTool calls a [Wan2GP](https://github.com/deepbeepmeep/Wan2GP) server you
run yourself, over MCP. The models run in Wan2GP's own process and Python
environment, never inside NodeTool, so NodeTool installs no PyTorch for them.
Two parts use the server:

- the `lib.wan2gp` nodes, for workflows;
- the `wangp` provider, which lists the server's models in the chat composer,
  the Create view and ejected preset workflows.

Both are built in. No Python pack is needed.

| Node | What it does |
|---|---|
| `lib.wan2gp.TextToVideo` | Generates a clip from a prompt |
| `lib.wan2gp.ImageToVideo` | Animates a still image |
| `lib.wan2gp.Generate` | Runs any Wan2GP model with a settings dict on top of that model's defaults. Takes start and end images, reference images, control, mask and source videos, audio, and a custom file, and returns an image, video, audio or 3D model |
| `lib.wan2gp.ListModels` | Lists the models your server offers and the media each one accepts |

The nodes and the provider are local only. The cloud profile excludes them.

## 1. Run a Wan2GP server

Wan2GP needs its own conda environment and its own PyTorch build. Do not
install it into NodeTool's Python environment. Follow Wan2GP's
[installation guide](https://github.com/deepbeepmeep/Wan2GP/blob/main/docs/INSTALLATION.md).
It gives one PyTorch build for RTX 20xx to RTX 50xx cards and an older one for
GTX 10xx cards.

Start it with its MCP server on streamable HTTP and asynchronous jobs:

```bash
python wgp.py --mcp --mcp-async --mcp-transport streamable-http --mcp-host 127.0.0.1 --mcp-port 7866
```

The MCP endpoint is then `http://127.0.0.1:7866/mcp`. Bind to `0.0.0.0` only
on a trusted network or behind an authenticated reverse proxy. NodeTool needs
MCP API v2 or later, which has the `wangp_session` tool. It refuses an older
server with a message that says so.

## 2. Point NodeTool at the server

The nodes resolve the server URL when they run, in this order:

1. The node's `server_url` field, when it is not blank.
2. `WAN2GP_MCP_URL`, set in **Settings → Integrations** or in the environment.
3. `http://127.0.0.1:7866/mcp`.

The `wangp` provider uses `WAN2GP_MCP_URL`, then the default. A server on the
same machine at the default port needs no setting. A changed setting applies
to the next call, without a restart.

`WAN2GP_MCP_TOKEN` is a bearer token for a server behind an authenticating
proxy, such as the combined GPU image below. The nodes and the provider send
it on every request when it is set. A server that refuses the request names
the setting in its error.

## Use presets with your server

The nodes take a plain prompt. In the chat composer, the Create view and
ejected preset workflows, pick a model under **Wan2GP**. The `wangp` provider
lists the server's video and image models and the tasks each one supports, and
[presets](presets.md#local-wan2gp-models) compile for the chosen model before
the prompt reaches the server. The list is empty while no server answers.

| Task | What the provider sends |
|---|---|
| Text to video | The prompt and the generation settings |
| Image to video | The first frame as `image_start`, and the last frame as `image_end` when given |
| Reference to video | Reference images as `image_refs`. Reference videos and audio are refused: use the Generate node for those |
| Text to image | The prompt with `image_mode` 1, which picks the image output on models that also make video |
| Image to image | The image as `image_start` or as `image_refs`, whichever role the model declares |

A resolution tier such as `720p` sets the short side, and the aspect ratio,
`16:9` by default, sets the long one. Wan2GP aligns the size to its own block.

## Combined GPU worker

The [nodetool-wan2gp](https://github.com/nodetool-ai/nodetool-wan2gp)
repository builds `Dockerfile.combined`, a GPU image that runs a pinned Wan2GP
release with its MCP server behind a proxy that requires a bearer token. Point
NodeTool at it with the token the container was started with:

```bash
export WAN2GP_MCP_URL=http://<gpu-host>:7866/mcp
export WAN2GP_MCP_TOKEN=<the container's WAN2GP_MCP_TOKEN>
```

Build and run instructions are in the
[nodetool-wan2gp README](https://github.com/nodetool-ai/nodetool-wan2gp#combined-non-commercial-gpu-image).

## Licensing

Wan2GP has its own license, which limits commercial use and forbids embedding
it in a paid product without a separate license. NodeTool reaches it only over
the network and ships none of it. Each model has a separate license. MiniMax
H3's license excludes the European Union, the United Kingdom, South Korea and
the United States, and LTX-2's requires a paid license above 10 million US
dollars in annual revenue. The nodetool-wan2gp
[README](https://github.com/nodetool-ai/nodetool-wan2gp#model-licenses)
summarizes both. The combined image is for free, non-monetized use only. Read
its [NOTICE](https://github.com/nodetool-ai/nodetool-wan2gp/blob/main/NOTICE.md)
before you redistribute or sell access to it.

## Related

- [Supported Models](models.md): local engines and hardware
- [Configuration](configuration.md): `WAN2GP_MCP_URL` and `WAN2GP_MCP_TOKEN`
- [Node reference](nodes/lib/wan2gp/): the `lib.wan2gp` nodes
