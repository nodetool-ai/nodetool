---
layout: page
title: "Wan2GP"
description: "Generate video, images, audio and 3D models in NodeTool with Wan2GP: install it from the Package Manager, or point NodeTool at a Wan2GP server you run, and use the lib.wan2gp nodes or the wangp provider."
---

[Wan2GP](https://github.com/deepbeepmeep/Wan2GP) runs Wan, LTX-2, MiniMax
H3, Flux, Qwen and other models. NodeTool talks to its MCP server, and the
models run in Wan2GP's own process and Python environment. Two parts use it:

- the `lib.wan2gp` nodes, for workflows;
- the `wangp` provider, which lists Wan2GP's models in the chat composer,
  the Create view and ejected preset workflows.

| Node | What it does |
|---|---|
| `lib.wan2gp.TextToVideo` | Generates a clip from a prompt |
| `lib.wan2gp.ImageToVideo` | Animates a still image |
| `lib.wan2gp.Generate` | Runs any Wan2GP model with a settings dict on top of that model's defaults. Takes start and end images, reference images, control, mask and source videos, audio, and a custom file, and returns an image, video, audio or 3D model |
| `lib.wan2gp.ListModels` | Lists the models your server offers and the media each one accepts |

> **Runs:** locally only (the cloud profile excludes the nodes and the provider). **Needs:** a Wan2GP install or a Wan2GP server you run, and no API key. `WAN2GP_MCP_TOKEN` is needed only for a server behind a bearer token. **Hardware:** a supported GPU (table below) and about 12 GB of disk before any model.
{: .callout-note}

## 1. Install Wan2GP

- **Desktop app:** open **Tools → Package Manager → Engines & tools** and
  install **Wan2GP**, or pick a Wan2GP model in the model menu and install it
  there. It needs the Python runtime, which installs first.
- **CLI:** `nodetool runtime add wan2gp`. It needs a Python 3.10 or newer and
  [uv](https://docs.astral.sh/uv/), from the NodeTool conda environment or
  PATH. `--python` and `--uv` name others, and `--profile RTX_40` picks a
  hardware profile instead of the detected one.

The install downloads Wan2GP v19.02 from GitHub and runs Wan2GP's own
unattended installer (`setup.py install --env uv --auto`). That installer
reads the GPU and picks the Python, PyTorch and attention kernels for it:

| Hardware | Python and PyTorch |
|---|---|
| NVIDIA RTX 20xx to 50xx, Windows or Linux | Python 3.11, PyTorch 2.10 with CUDA 13.0 |
| NVIDIA GTX 10xx, Windows or Linux | Python 3.10, PyTorch 2.7.1 with CUDA 12.8 |
| AMD, Windows or Linux | Python 3.12, PyTorch 2.13 with ROCm 10 |
| Apple Silicon | Python 3.11, PyTorch with MPS |

Without a supported graphics card the install stops with a message that
names the card it found and the profiles to choose from. A missing driver is
the usual cause. Allow about 12 GB before any model. Each model's weights
download the first time it runs, into `wan2gp/ckpts`, which an update keeps.

The install ends by writing the model catalog, `catalog.json` beside the
release. It holds every model, the media it accepts, its voices or languages,
and whether its weights are on disk. The model menus read this file, so they
list Wan2GP's models without starting Wan2GP. An install made before the
catalog existed writes it the first time a menu opens. A Package Manager
install or uninstall reloads the model menus that are open.

### Download models

With Wan2GP installed, the model menu marks each Wan2GP model as ready or to
download, from the same file check Wan2GP's own model selector uses. **Download**
fetches the model's weights with Wan2GP's own downloader into `wan2gp/ckpts`.
Before it starts, Hugging Face reports the size of the files still missing,
so the bar shows how much is left. Wan2GP sometimes fetches small files the
estimate leaves out, and past the estimate the bar shows the bytes written.
A cancelled download starts the cut-off file again. A generation also
downloads what its model lacks before it runs. A server you run yourself
manages its own files.

### The server

NodeTool starts the installed server the first time a node or the provider
needs it, on a free port on `127.0.0.1`. A finished model download starts it
too, so the first generation does not wait for Wan2GP to start. Opening a
model menu does not start it. It stops the server after 15 minutes
without calls, which frees the GPU memory Wan2GP holds, and when NodeTool
exits.

### Run Wan2GP yourself instead

Follow Wan2GP's
[installation guide](https://github.com/deepbeepmeep/Wan2GP/blob/main/docs/INSTALLATION.md)
in its own environment, then start its MCP server:

```bash
python wgp.py --mcp --mcp-async --mcp-transport streamable-http --mcp-host 127.0.0.1 --mcp-port 7866
```

The MCP endpoint is then `http://127.0.0.1:7866/mcp`. Bind to `0.0.0.0` only
on a trusted network or behind an authenticated reverse proxy. NodeTool needs
MCP API v2 or later, which has the `wangp_session` tool. It refuses an older
server with a message that says so.

## 2. Point NodeTool at the server

The nodes pick the server when they run, in this order:

1. The node's `server_url` field, when it is not blank.
2. `WAN2GP_MCP_URL`, set in **Settings → Integrations** or in the environment.
3. The Wan2GP the Package Manager installed, started on demand.
4. `http://127.0.0.1:7866/mcp`, for a server you run.

The `wangp` provider uses the same order without the first step. With
nothing installed and nothing answering at the default address, a generation
fails with an error that offers the install. A changed setting applies to the
next call, without a restart.

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
| Text to speech | The text as `prompt`, the voice (Qwen3 Custom Voice) or language as `model_mode`, the instructions or reference transcript as `alt_prompt`, and a reference voice as `audio_guide` on the models that take one |
| Text to music | The lyrics as `prompt` and the style as `alt_prompt`, or `[Instrumental]` without lyrics. Stable Audio takes the style as `prompt`. The duration as `duration_seconds` |

Speech models list their preset voices or languages. Music models that need a
file, such as YuE2's score, run only through the Generate node. The
transcription models are not offered.

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

Wan2GP is under the WanGP Community License 2.0. You may use it for free,
including for client work. Selling it, white-labelling it, embedding it in a
paid product, or offering paid hosted access to it needs a separate license
from its author. NodeTool does not ship Wan2GP: the Package Manager downloads
it from its GitHub repository when you install it. Each model has a separate license. MiniMax
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
