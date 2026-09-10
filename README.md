# NodeTool

[![Stars](https://img.shields.io/github/stars/nodetool-ai/nodetool?style=social)](https://github.com/nodetool-ai/nodetool/stargazers)
[![Downloads](https://img.shields.io/github/downloads/nodetool-ai/nodetool/total?color=3fb950)](https://github.com/nodetool-ai/nodetool/releases)
[![Latest Release](https://img.shields.io/github/v/release/nodetool-ai/nodetool?display_name=tag&sort=semver)](https://github.com/nodetool-ai/nodetool/releases/latest)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/WmQTWZRcYE)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE.txt)
[![Powered by Atlas Cloud](https://www.atlascloud.ai/oss-program/powered-by-atlas-cloud.svg)](https://www.atlascloud.ai/?ref=PW9AD2)

**Agent-first creative workspace**

Create and edit images, video, audio, and text with agents that work alongside
you. Describe what you want, let the agent build it, then take over whenever you
like. Refine a shot, try a different voice, or rework the cut, yourself or with
the agent.

You get an editable project, not just a finished file. Your workflows, assets,
and edits stay together, so you can inspect how something was made and change
individual parts without starting over.

**[Download NodeTool Studio](https://github.com/nodetool-ai/nodetool/releases/latest)** ·
**[Quick start](#first-run-in-studio)** ·
**[Documentation](https://docs.nodetool.ai/)** · **[MCP setup](#mcp)** ·
**[Contribute](#contributing)**

![NodeTool: one sentence becomes a storyboard, rendered stills and clips, and a cut on the timeline](marketing/public/hero-project-readme.gif)

## Every model you need, on your own keys

Run local models or connect cloud providers with your own API keys. Choose your
models and pay providers directly: NodeTool calls the provider with your key at
their price, with no NodeTool billing unit in between. When a better model
ships, add it the day it ships.

[Models and Providers](docs/models-and-providers.md) lists what runs where.

## Why NodeTool

- Agents drive the real editors. They wire the graph, run it, and you take the wheel at any
  point.
- Inspect intermediate results, swap a model, and rerun only the part that
  changed.
- The graph, inputs, assets, and edits stay together in your project. 
- Run the same workflow from the studio, the CLI, or an external agent over
  [MCP](#mcp).

Studio is free and runs on macOS, Windows, and Linux. Local models have
hardware requirements that depend on the model, and working offline needs both
the models and the assets on your machine.
[NodeTool Cloud](https://nodetool.ai/cloud) is in alpha; it runs on hosted
storage and cloud providers rather than your machine's local models.

## First run in Studio

1. Download the [latest release](https://github.com/nodetool-ai/nodetool/releases/latest)
   for your operating system and install it. See the
   [installation guide](docs/installation.md) for requirements and per-OS steps.
2. Connect providers through **Settings → Models & Providers** to enable agents and media generation.
3. Start a new project and follow along.


## One workspace, brief through final cut

Write a brief and ask the agent for a storyboard. Approve the stills before
spending on video generation, then assemble the clips on a timeline. Trim and
reorder the cut, add narration, and export an MP4. Revise an individual shot
without regenerating the rest of the film. The
[film quick start](docs/getting-started.md) walks through each step, including
model setup and export.

Five editors share one project, so a piece never leaves the studio to be
finished, and an agent drives every one of them through the same actions you
have.

### Storyboard

![NodeTool storyboard](marketing/public/surface-storyboard-poster.webp)

Board the film shot by shot. Pitch a concept and a visual style, pick a shot
count, and the Director node returns a typed screenplay: one structured shot
per card with action, camera, motion, and duration, plus the logline, style
bible, narration, and music direction.

- **Cheap stages first.** A still costs cents, a clip costs dollars. Generate
  stills until one looks right, pick it, and only then generate the clip.
- **Revise one shot, not the reel.** "Make it darker, add rain" runs
  video-to-video on the existing clip and swaps the result in place. Fixing
  shot 3 never re-rolls shots 1 to 5.
- **Entities keep the cast steady.** Characters, locations, styles, and props
  are named objects whose canonical descriptor is pasted verbatim into every
  prompt that names them.
- **Assemble the cut.** One click lays the rendered shots onto a timeline with
  narration and music tracks, each clip still linked to its shot.

Agents drive the same board through the `ui_storyboard_*` tools, or headlessly
with `render_storyboard_stills`, `render_storyboard_clips`, and
`assemble_storyboard_timeline`.
[Creative agent guide →](https://docs.nodetool.ai/creative-agent)

### Script and voice

![NodeTool script editor: the transcript panel beside the sequence it assembles into](marketing/public/surface-script-poster.webp)

Draft the dialogue, cast a provider, model, and voice per character, and
audition alternate line readings. Voicing a line saves a take with its own word
timings rather than overwriting the last one. Change the words and the take
flags itself stale, so you see exactly what still needs voicing. The current
takes assemble into a sequence end to end, word timings riding along as
captions.

Without the editor open, `voice_script_lines` voices every draft or stale line
with its cast voice, and `assemble_script_timeline` cuts the result into a
saved sequence that `validate_timeline` then checks.

### Timeline

![NodeTool timeline](marketing/public/surface-timeline-poster.webp)

Arrange, trim, and layer generated video and audio across multiple tracks, down
to the frame and the stem. Drop in your own footage or bind a workflow to a
clip (text-to-image, image-to-video, or text-to-speech) and generate it in
place: change a parameter and the clip regenerates, tweak the bound workflow
and the clip flags itself stale. Export the sequence to MP4. The agent edits
the same document when you ask it to tighten the opening.
[Video editor guide →](https://docs.nodetool.ai/video-editor)

### Sketch

![NodeTool sketch editor](marketing/public/screen_sketch_editor.webp)

Build a composition in layers with blend modes and masks, then bind a layer to
a model or one of your own workflows and generate where you are painting.
Change a prompt or an upstream input and the layer flags itself stale. The node
hands the rest of the workflow a flattened image, a mask, and per-layer
outputs, so it pairs with the mask, inpaint, outpaint, and compositing nodes.
[Sketch editor guide →](https://docs.nodetool.ai/sketch-editor)

### 3D

![NodeTool 3D scene editor](marketing/public/surface-3d-poster.webp)

Place primitives and lights in a glTF scene by hand or by tool call, then
capture a view as a depth or composition reference for an image or video model.
The same operations run headlessly through `create_model3d`, `get_model3d`,
`edit_model3d`, `validate_model3d`, and `render_model3d`, so a scene is
reproducible with no editor open.

## The node editor

![NodeTool workflow canvas](marketing/public/screen_workflow.webp)

Every project is a graph you can open. Drag nodes in, connect typed ports, and
read the live output at each step. Double-click the canvas to search and add a
node, or drag a connection into empty space to see compatible next steps. The
editor refuses a mismatch, so an image cannot land in a text field.

Every editor above sits on this canvas, and an agent wires it through the
same actions you have.

## Recipes

Each recipe is a downloadable bundle that runs on your keys at provider list
prices. Whether the result is an editable timeline or an exported video depends
on the workflow you choose.

| Recipe | What you end up holding | Models the shipped chain calls |
| --- | --- | --- |
| [Viral video ad](https://nodetool.ai/recipes/viral-video-ad-engine) | A vertical product ad, plus the hook lines and thumbnails to test it against | GPT-5 mini, FLUX.1 Schnell, Kling 2.6 |
| [Multilingual dub](https://nodetool.ai/recipes/multilingual-video-dubber) | One presenter clip in a second language, lip-synced, with subtitles and a back-translation | GPT-4o mini Transcribe, GPT-5 mini, OpenAI TTS, Inworld TTS, Sync Lipsync |
| [SKU visual set](https://nodetool.ai/recipes/ecommerce-sku-visual-factory) | One packshot becomes the channel set: cutout, studio scene, seasonal relight, turntable clip, print master, listing copy | Bria background removal, Nano Banana, image relighting, LTX 2.3, Clarity upscaler, GPT-5 mini |
| [Storyboard to trailer](https://nodetool.ai/recipes/storyboard-to-trailer) | A logline becomes a beat sheet, a numbered shot list, a cut teaser, and a score under it | GPT-5 mini, Gemini 3.1 Pro, GPT Image 2, Veo 3.1, Stable Audio 2.5 |

The [recipe gallery](https://nodetool.ai/recipes) has the model chain and
contact sheet for each run. The [showcase](https://nodetool.ai/showcase) and
[template gallery](https://nodetool.ai/templates) hold the single workflows the
recipes chain.

## How NodeTool compares

The comparison is against the closed AI studios, because that is what a
production team is choosing between.

| | NodeTool | Closed AI studios |
| :--- | :--- | :--- |
| **Models** | Every major provider, switched in one click | The list they picked |
| **When a better model ships** | Add it the day it ships | Wait for them to add it |
| **What you pay** | Provider list prices, on your own keys | Their credits |
| **What you keep** | The board, the takes, and the multi-track cut as an editable project | An exported video; the project stays in their app |
| **Source** | Open, AGPL-3.0 | Closed |
| **Where it runs** | Desktop app and browser, self-host any time | Their servers only |

Choosing against a node tool instead? See
[ComfyUI](https://nodetool.ai/alternatives/comfyui) and
[Figma Weave](https://nodetool.ai/alternatives/figma-weave).

## The agent

Most tools bolt a chat panel onto an editor. NodeTool built the editors around
the agent: every surface hands it the same actions you have — wire a graph,
paint a layer, cut a clip, revise a shot, voice a line.

- **Build workflows.** Describe the pipeline. The agent picks the nodes, wires
  the edges, and validates the graph, and what it leaves behind is a workflow
  you own.
- **Build apps.** Ask for a custom UI. The agent plans the workflow, places
  widgets, and replays interactions. A separate judge model grades the result.
  No passing verdict, no app.
- **Repair on the fly.** Put an agent on the failure path and it decides
  whether to retry, repair, skip, or stop, within the cost budget you set.
- **Bring your own agent.** The toolbelt is exposed over [MCP](#mcp), so Claude
  Desktop, Claude Code, or Codex can drive the studio.

Underneath, a planner turns an objective into a DAG of steps, executors walk it
in parallel, and every LLM call emits an OpenTelemetry span with tokens and
cost. See the [agent guide](https://docs.nodetool.ai/agents/) and
[docs/AGENTS.md](docs/AGENTS.md).

## What is underneath

Everything the film surfaces do is reachable on the canvas without the film.

| | |
| :--- | :--- |
| **Mini apps** | Give a workflow a screen: inputs, a Run button, a place for the result. Hand it to a teammate who never sees the canvas. |
| **Editing tools as nodes** | Mask, inpaint, outpaint, relight, upscale, layer, and composite. |
| **Every modality** | Image, video, audio, and text in one workflow. |
| **Every major provider** | OpenAI, Anthropic, Gemini, FAL, KIE, Replicate, ElevenLabs, HuggingFace, plus one node for every model on Replicate, fal.ai, and KIE. |
| **Open weights** | Ollama, MLX (Apple Silicon), and GGUF on your own hardware. |
| **Document search** | Index and query your files with the built-in vector store. |
| **JS scripts** | Versioned JavaScript documents with declared ports, saved test cases, and a QuickJS sandbox. |
| **MCP server** | Point Claude Desktop, Claude Code, Codex, or any MCP agent at the toolbelt. |
| **Custom nodes** | Extend in TypeScript or Python. |
| **Deploy and scale** | Self-host with Docker. Rent GPU workers on RunPod or Vast. |

## Documentation

- **[Getting Started](https://docs.nodetool.ai/getting-started)** — Build your first workflow
- **[Agents](https://docs.nodetool.ai/agents/)** — Let an agent build, run, and repair your workflows
- **[Mini Apps](https://docs.nodetool.ai/mini-apps)** — Wrap a workflow in an interface
- **[App Builder](https://docs.nodetool.ai/app-builder)** — Place widgets, wire them to a workflow, publish
- **[Creative Agent](https://docs.nodetool.ai/creative-agent)** — Storyboard a film, gate the spend, assemble the cut
- **[JavaScript Sandbox](https://docs.nodetool.ai/javascript-sandbox)** — What JS scripts and Code nodes can reach
- **[Video Editor](https://docs.nodetool.ai/video-editor)** — Sequence and generate clips on a timeline
- **[Sketch Editor](https://docs.nodetool.ai/sketch-editor)** — Draw, mask, and generate on a layered canvas
- **[Node Packs](https://docs.nodetool.ai/packs)** — Available nodes and integrations
- **[Custom Nodes](https://docs.nodetool.ai/developer/custom-nodes-guide)** — Extend NodeTool
- **[Provider Guides](https://docs.nodetool.ai/developer/providers/)** — Add new models and nodes for any provider
- **[Deployment](https://docs.nodetool.ai/deployment)** — Share your work
- **[API Reference](https://docs.nodetool.ai/api)** — Programmatic access

## MCP

The installed CLI registers NodeTool's local toolbelt with Claude Code, Codex,
or OpenCode:

```bash
npm install -g @nodetool-ai/cli
nodetool mcp install
```

For Claude Desktop, build the source MCP bundle after installing dependencies
and building packages:

```bash
npm run build:mcpb
# writes dist/nodetool.mcpb
```

The MCP server can drive workflows and creative editing surfaces. See the
[MCP production guide](docs/mcp-production.md) and
[agent architecture](docs/AGENTS.md).

## First run from source

This deterministic example uses the repository's
[`hello_input_output_cli.json`](examples/workflows/hello_input_output_cli.json)
template. It does not call a model, so it needs no API key:

```bash
git clone https://github.com/nodetool-ai/nodetool.git
cd nodetool
nvm use                         # Requires nvm and Node.js 22.22.1
npm install
npm run build:packages
npm run workflow -- ./examples/workflows/hello_input_output_cli.json \
  --input text='hello from NodeTool'
```

The input node named `text` connects to a `Reroute` output node. The command's
JSON summary includes `hello from NodeTool` in its outputs. Change the `text`
input and run it again to see the new value. See
[`examples/workflows/README.md`](examples/workflows/README.md) for more
examples and expected behavior.

To run an agent or a model-backed workflow, configure a provider first. For
example, obtain an OpenAI key, export it in the shell, and use the checked-in
OpenAI example:

```bash
export OPENAI_API_KEY='your-key'
npm run workflow -- ./examples/workflows/agent_openai_basic_cli.json \
  --input prompt='Write one sentence about workflow testing.'
```

This makes a paid provider request. The example selects GPT-4o. Access and
billing depend on your provider account. See
[Models and Providers](docs/models-and-providers.md) and
[Provider Guides](https://docs.nodetool.ai/developer/providers/) for other
providers and local setup. Do not add a key to a committed file.

## CLI

Install the CLI as shown in [MCP](#mcp), using Node.js 22.22.1. The
[CLI package guide](packages/cli/README.md) covers running workflows with the
installed command.

To serve the API, run `nodetool serve` in a separate terminal. Commands that
support remote execution accept `--api-url` or `NODETOOL_API_URL`.
For interactive agent chat, connect a provider first as described in the
[CLI package guide](packages/cli/README.md), then run `nodetool-chat`.

See the [CLI reference](https://docs.nodetool.ai/cli) and
[CLI package guide](packages/cli/README.md). A one-off install is available with
`npx --package=@nodetool-ai/cli nodetool --help`.

## Development setup

After the [source quick start](#first-run-from-source), start the API and web
UI from the prepared checkout:

```bash
npm run dev
```

For an automatic install, build, and launch from a fresh checkout, use
`./start.sh full`. To start only the API, use `./start.sh`; to inspect the
environment without changing it, use `./start.sh doctor`.
These commands do not launch the Electron desktop app.

In a separate terminal, launch the desktop shell with `npm run electron` from
the prepared checkout. Node.js 22.22.1 is pinned in
[`.nvmrc`](.nvmrc). Python 3.11 and conda are optional, for Python nodes. For
locked-down environments or missing WebGPU, see [development environment](docs/dev-environment.md).

## Testing

After a code change, run these four repository-root checks from the commands in
[`AGENTS.md`](AGENTS.md):

```bash
npm run test:affected
npm run typecheck
npm run lint
npm run dev:nodetool -- harness gate --base origin/main
```

The web testing guide is at [`web/TESTING.md`](web/TESTING.md). The complete
repository gate is `npm run check`.

## Project layout

| Path | Purpose |
| --- | --- |
| [`packages/`](packages/) | TypeScript runtime, workflow kernel, agents, providers, and nodes |
| [`web/`](web/) | React web UI |
| [`electron/`](electron/) | Desktop Studio shell |
| [`mobile/`](mobile/) | React Native app |
| [`docs/`](docs/) | Documentation and development guides |
| [`examples/workflows/`](examples/workflows/) | Runnable workflow examples |

## Contributing

Read [`AGENTS.md`](AGENTS.md) and the
[development standards](docs/DEVELOPMENT_STANDARDS.md), then open an issue for
larger changes. Pull requests for bug fixes, nodes, providers, workflows, and
documentation are welcome. Run the narrowest relevant checks before opening a
PR and include the command results.

## License and community

NodeTool is licensed under [AGPL-3.0](LICENSE.txt).

[GitHub](https://github.com/nodetool-ai/nodetool) ·
[Discord](https://discord.gg/WmQTWZRcYE) · [Website](https://nodetool.ai)
