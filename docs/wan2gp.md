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

> **Runs:** locally only (the cloud profile excludes the nodes and the provider). **Needs:** a Wan2GP install or a Wan2GP server you run, and no API key. `WAN2GP_MCP_TOKEN` is needed only for a server behind a bearer token. **Hardware:** a supported GPU and about 12 GB of disk before any model.
{: .callout-note}

## 1. Install Wan2GP

- **Desktop app:** open **Tools → Package Manager → Engines & tools** and
  install **Wan2GP**, or pick a Wan2GP model in the model menu and install it
  there. It needs the Python runtime, which installs first.
- **CLI:** `nodetool runtime add wan2gp`. It needs a Python 3.10 or newer and
  [uv](https://docs.astral.sh/uv/), from the NodeTool conda environment or
  PATH. `--python` and `--uv` name others, and `--profile RTX_40` picks a
  hardware profile instead of the detected one.

Allow about 12 GB of disk before any model. If the install stops with a message about your graphics card, a missing driver is the usual cause. For what the installer picks for each kind of GPU, see [Wan2GP Server](wan2gp-server.md#what-the-package-manager-install-does).

### Download models

With Wan2GP installed, the model menu marks each Wan2GP model as ready or to download. **Download** fetches the model's weights, and the bar shows how much is left. A cancelled download starts the cut-off file again. A generation also downloads what its model lacks before it runs. A server you run yourself manages its own files. See [Wan2GP Server](wan2gp-server.md#files-and-catalog) for where the files go.

NodeTool starts the installed Wan2GP the first time a node or the provider needs it, and stops it after 15 minutes without calls to free GPU memory.

Running Wan2GP on another machine or in Docker? See [Wan2GP Server](wan2gp-server.md#run-wan2gp-yourself).

## 2. Point NodeTool at the server

If you installed Wan2GP from the Package Manager, there is nothing to set. To use a server you run yourself, enter its address as **WAN2GP_MCP_URL** in **Settings → Integrations**. A changed setting applies to the next call, without a restart. Add **WAN2GP_MCP_TOKEN** if the server sits behind a proxy that asks for a token.

The nodes pick the server when they run, in this order:

1. The node's `server_url` field, when it is not blank.
2. The `WAN2GP_MCP_URL` setting.
3. The Wan2GP the Package Manager installed, started on demand.
4. `http://127.0.0.1:7866/mcp`, for a server you run.

The `wangp` provider uses the same order without the first step. With nothing installed and nothing answering at the default address, a generation fails with an error that offers the install.

## Use presets with your server

The nodes take a plain prompt. In the chat composer, the Create view and ejected preset workflows, pick a model under **Wan2GP**. The `wangp` provider lists the server's video and image models and the tasks each one supports, and [presets](developer/presets.md#local-wan2gp-models) compile for the chosen model before the prompt reaches the server. The list is empty while no server answers.

Speech models list their preset voices or languages. Music models that need a file, such as YuE2's score, run only through the Generate node. The transcription models are not offered. A resolution tier such as `720p` sets the short side, and the aspect ratio, `16:9` by default, sets the long one. For how each task maps to Wan2GP settings, see [Wan2GP Server](wan2gp-server.md#how-the-provider-maps-tasks-to-wan2gp-settings).

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
summarizes both. The combined GPU image is for free, non-monetized use only. See [Wan2GP Server](wan2gp-server.md#combined-gpu-worker).

## Related

- [Wan2GP Server](wan2gp-server.md): run Wan2GP yourself, GPU image, task mapping
- [Supported Models](models.md): local engines and hardware
- [Environment Variables](environment-variables.md): `WAN2GP_MCP_URL` and `WAN2GP_MCP_TOKEN`
- [Node reference](nodes/lib/wan2gp/): the `lib.wan2gp` nodes
