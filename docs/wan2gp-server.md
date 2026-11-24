---
layout: page
title: "Wan2GP Server"
description: "Run Wan2GP yourself for NodeTool: the manual install, the MCP server, the catalog and model files, how the provider maps tasks to Wan2GP settings, and the combined GPU worker image."
---

This page is for people who run Wan2GP outside the Package Manager, on a GPU server or in a container, and for contributors who need to know how NodeTool talks to it. For the desktop setup, see [Wan2GP](wan2gp.md).

> **Runs:** on a machine with a supported GPU, which NodeTool reaches over the network. **Needs:** Python and [uv](https://docs.astral.sh/uv/) for a manual install, or Docker for the combined image.
{: .callout-note}

## What the Package Manager install does

The install downloads Wan2GP v19.02 from GitHub and runs Wan2GP's own unattended installer (`setup.py install --env uv --auto`). That installer reads the GPU and picks the Python, PyTorch and attention kernels for it:

| Hardware | Python and PyTorch |
|---|---|
| NVIDIA RTX 20xx to 50xx, Windows or Linux | Python 3.11, PyTorch 2.10 with CUDA 13.0 |
| NVIDIA GTX 10xx, Windows or Linux | Python 3.10, PyTorch 2.7.1 with CUDA 12.8 |
| AMD, Windows or Linux | Python 3.12, PyTorch 2.13 with ROCm 10 |
| Apple Silicon | Python 3.11, PyTorch with MPS |

Without a supported graphics card the install stops with a message that names the card it found and the profiles to choose from. A missing driver is the usual cause. On the CLI, `nodetool runtime add wan2gp` needs Python 3.10 or newer and uv, from the NodeTool conda environment or PATH. `--python` and `--uv` name others, and `--profile RTX_40` picks a hardware profile instead of the detected one.

## Files and catalog

Each model's weights download the first time it runs, into `wan2gp/ckpts`, which an update keeps. The install ends by writing the model catalog, `catalog.json` beside the release. It holds every model, the media it accepts, its voices or languages, and whether its weights are on disk. The model menus read this file, so they list Wan2GP's models without starting Wan2GP. An install made before the catalog existed writes it the first time a menu opens. A Package Manager install or uninstall reloads the model menus that are open.

The model menu marks each Wan2GP model as ready or to download, from the same file check Wan2GP's own model selector uses. **Download** fetches the weights with Wan2GP's own downloader. Before it starts, Hugging Face reports the size of the files still missing. Wan2GP sometimes fetches small files the estimate leaves out, and past the estimate the bar shows the bytes written. A cancelled download starts the cut-off file again.

## The managed server

NodeTool starts the installed server the first time a node or the provider needs it, on a free port on `127.0.0.1`. A finished model download starts it too. Opening a model menu does not. It stops the server after 15 minutes without calls, which frees the GPU memory Wan2GP holds, and when NodeTool exits.

## Run Wan2GP yourself

Follow Wan2GP's [installation guide](https://github.com/deepbeepmeep/Wan2GP/blob/main/docs/INSTALLATION.md) in its own environment, then start its MCP server:

```bash
python wgp.py --mcp --mcp-async --mcp-transport streamable-http --mcp-host 127.0.0.1 --mcp-port 7866
```

The MCP endpoint is then `http://127.0.0.1:7866/mcp`. Bind to `0.0.0.0` only on a trusted network or behind an authenticated reverse proxy. NodeTool needs MCP API v2 or later, which has the `wangp_session` tool. It refuses an older server with a message that says so.

Then point NodeTool at it, as described under [Point NodeTool at the server](wan2gp.md#2-point-nodetool-at-the-server). `WAN2GP_MCP_TOKEN` is a bearer token for a server behind an authenticating proxy, such as the combined GPU image below. The nodes and the provider send it on every request when it is set.

## How the provider maps tasks to Wan2GP settings

The `wangp` provider turns each task into Wan2GP settings before the prompt reaches the server.

| Task | What the provider sends |
|---|---|
| Text to video | The prompt and the generation settings |
| Image to video | The first frame as `image_start`, and the last frame as `image_end` when given |
| Reference to video | Reference images as `image_refs`. Reference videos and audio are refused: use the Generate node for those |
| Text to image | The prompt with `image_mode` 1, which picks the image output on models that also make video |
| Image to image | The image as `image_start` or as `image_refs`, whichever role the model declares |
| Text to speech | The text as `prompt`, the voice (Qwen3 Custom Voice) or language as `model_mode`, the instructions or reference transcript as `alt_prompt`, and a reference voice as `audio_guide` on the models that take one |
| Text to music | The lyrics as `prompt` and the style as `alt_prompt`, or `[Instrumental]` without lyrics. Stable Audio takes the style as `prompt`. The duration as `duration_seconds` |

A resolution tier such as `720p` sets the short side, and the aspect ratio, `16:9` by default, sets the long one. Wan2GP aligns the size to its own block.

## Combined GPU worker

The [nodetool-wan2gp](https://github.com/nodetool-ai/nodetool-wan2gp) repository builds `Dockerfile.combined`, a GPU image that runs a pinned Wan2GP release with its MCP server behind a proxy that requires a bearer token. Point NodeTool at it with the token the container was started with:

```bash
export WAN2GP_MCP_URL=http://<gpu-host>:7866/mcp
export WAN2GP_MCP_TOKEN=<the container's WAN2GP_MCP_TOKEN>
```

Build and run instructions are in the [nodetool-wan2gp README](https://github.com/nodetool-ai/nodetool-wan2gp#combined-non-commercial-gpu-image). The combined image is for free, non-monetized use only. Read its [NOTICE](https://github.com/nodetool-ai/nodetool-wan2gp/blob/main/NOTICE.md) before you redistribute or sell access to it.

## Related

- [Wan2GP](wan2gp.md): desktop setup and presets
- [Configuration](configuration.md): `WAN2GP_MCP_URL` and `WAN2GP_MCP_TOKEN`
