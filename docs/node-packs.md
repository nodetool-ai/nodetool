---
layout: page
title: "Node Packs"
description: "Extend NodeTool with additional nodes and sandbox libraries, from the built-in packs or from npm."
---

Node Packs extend NodeTool with additional nodes and sandbox libraries. Some packs ship with NodeTool and are switched on or off in the app. Others are npm packages you install.

---

## What's in a Pack

A pack is an npm package. The `nodetool` field in its `package.json` says what it contributes:

| Component | Field | Description |
|-----------|-------|-------------|
| **Host nodes** | `register` | An exported function that registers node classes. They appear in the Node Menu and run in the server process, so they need trust before they load. |
| **Sandbox modules** | `sandboxModules` | Libraries that Code nodes and agent actions import. They run inside the [JavaScript sandbox](javascript-sandbox.md) or through a host facade. |
| **npm dependencies** | `dependencies` | Normal npm dependencies of the package. |

See the [Custom Nodes Guide](developer/custom-nodes-guide.md) for the manifest and [Sandbox packages](sandbox-package-design.md) for sandbox modules.

---

## Managing Packs in the App

### Open the Package Manager

Open **Tools > Package Manager** in the desktop app, or go to `/packages` in the web UI. The left rail has four lists. Each list shows a short hint under its name. A list with updates shows the number of updates instead of its size. The Package Manager opens on Engines & tools.

### Engines & tools, Built-in nodes, Python nodes, and Community nodes

- **Engines & tools** manages programs that run on this computer: local AI engines such as llama.cpp and stable-diffusion.cpp, media tools such as yt-dlp, and languages such as Python. Local models and some nodes need them. The list shows them in groups for languages, media, and AI.
- **Built-in nodes** lists the packs that ship with NodeTool. Switch a pack on or off, then restart the server. The base pack is always on. Provider packs that need an API key are not listed. Their nodes appear after you add the key in **Settings > Models & Providers**.
- **Python nodes** lists the Python node packs that NodeTool offers. They install from PyPI. Use **Install**, **Update**, or **Uninstall**, or **Update all** when several have updates. Installing a pack sets up Python first if it is missing.
  - A pack installs at its newest stable release, not a version tied to the app version. Prereleases are skipped.
  - Each install or update resolves the new pack together with every Python pack already installed, so shared dependencies such as PyTorch stay at versions all of them accept.
  - The HuggingFace pack gets the PyTorch build that matches your graphics card. See [GPU requirements](installation.md#gpu-requirements).
  - A pack appears only where it can install. MLX needs an Apple Silicon Mac. HuggingFace runs on Windows, Linux, and Apple Silicon Macs. On a Mac, both need macOS 14 or newer.
- **Community nodes** installs npm packs from other authors. Paste a package name such as `@acme/cool-nodes` or `cool-nodes@1.2.3` and click **Install**. Restart the server to load it.

Press `/` to focus the search box. It filters by name and description. The status filter next to it shows all packages, the installed ones, or the ones not installed. On the Built-in nodes list, the options are On and Off. Installed includes packages that have an update. The search and the filter stay set when you open another list.

Installing and removing run only in the desktop app. In the web UI, the lists are status-only.

### Trust

Installing a third-party pack runs none of its code and no lifecycle scripts. What happens next depends on what the pack contains:

- **Sandbox modules only.** The pack is active right away. Its modules run inside the sandbox with the capabilities of the node that imports them.
- **Host nodes.** The pack stays inactive until you click **Trust and rebuild** for it in the Third-party list. That button checks the installed files against the recorded lockfile identity, then runs the lifecycle scripts of the pack and its dependencies. If the files changed since install, it refuses and asks you to reinstall.

The Third-party list shows each pack's mode, either sandbox modules only, host nodes, or both, and whether it is active.

Separately, each discovered pack has a **Trusted** switch. It adds the pack name to the `allow` list in `~/.config/nodetool/packs.json` and re-scans packs. The **Load packs that are not on the allowlist** switch sets `allowUnlisted` in the same file. A host-node pack loads only when it is active and passes the allowlist rules in [Installing Packs via CLI](#third-party-and-python-packs). In production, the server refuses changes to trust, so edit the file or set `NODETOOL_PACKS_ALLOWLIST` instead.

---

## Installing Packs via CLI

The npm CLI includes core, text, data, LLM, and code nodes. Install other
first-party packs and npm runtime libraries for the CLI with `nodetool packs`:

```bash
nodetool packs list
nodetool packs add fal
nodetool packs add --for workflow.json

# Restore the recorded packs and runtimes after upgrading the CLI
nodetool packs add --restore
```

Packs use exact versions and integrity pins from the CLI release. Commands
support global installations and npm projects. Add `--yes` to confirm an
installation in a non-interactive terminal. Temporary npx installations and
development checkouts support diagnostics but refuse installation changes.
Restart running `nodetool serve` and `nodetool mcp serve` processes after
adding or removing packs. See [CLI pack commands](cli.md#nodetool-packs).

Other `nodetool packs` subcommands:

- `nodetool packs remove <ids...>` removes packs and keeps the requirements of the packs that stay.
- `nodetool packs doctor` checks install mode, versions, integrity, and registration. It takes `--json`, `--installed`, `--pack <ids...>`, and `--repair`.
- `nodetool packs why <node_type|id>` explains which pack owns a node or runtime library.
- `nodetool packs compile` builds the npm-backed [sandbox modules](sandbox-package-design.md) of installed packs.

### Third-party and Python packs

For the full server and desktop application:

```bash
# List the Python packs the desktop app offers
nodetool package list --available

# Install a pack into the project's node_modules
npm install <pack-name>

# Update a pack
npm update <pack-name>

# Remove a pack
npm uninstall <pack-name>
```

The full server finds third-party packs by scanning `node_modules` directories from the working directory upward. Add more directories with `NODETOOL_PACK_SEARCH_PATHS` (a list of directories) or `NODETOOL_OPTIONAL_NODE_MODULES` (one directory). Restart the server after any change.

In production (`NODETOOL_ENV=production`, or `NODETOOL_PACKS_REQUIRE_ALLOWLIST=1`), only packs on the allowlist load. Set `NODETOOL_PACKS_ALLOWLIST` to a comma-separated list of package names, or edit the `allow` list in `~/.config/nodetool/packs.json`. See the [trust model](developer/custom-nodes-guide.md#4-trust-model-and-governance).

---

## Built-in Node Libraries

The full server and desktop application include these first-party packs. The ids are in `BUILTIN_NODE_PACKS` (`packages/protocol/src/builtin-packs.ts`).

| Pack | Default | Namespaces and contents |
|------|---------|-------------------------|
| **Base Nodes** | Always on | `nodetool` (agents, audio, code, constants, control flow, data, documents, generators, images, input/output, text, video, and more), `openai`, `gemini`, `mistral`, `xai`, `lib`, `messaging` (Discord, Telegram), `vector` |
| **FAL** | On | `fal` image, video, and audio models |
| **Kie.ai** | On | `kie` image and video models |
| **Replicate** | On | `replicate` community models |
| **Hugging Face** | On | `huggingface` Inference Providers nodes |
| **whisper.cpp** | Off | `whisper_cpp` local streaming transcription |
| **ElevenLabs** | Off | `elevenlabs` text-to-speech and voice |
| **MiniMax** | Off | `minimax` image, video, and audio |
| **Transformers.js** | Off | `transformers` local ONNX models |
| **Topaz Labs** | Off | `topaz` upscaling and enhancement |
| **Reve** | Off | `reve` image generation and editing |
| **AtlasCloud** | Off | `atlascloud` image and video |
| **Higgsfield** | Off | `higgsfield` image and video |
| **Together AI** | Off | `together` image, video, speech, and transcription |

Browse the full node library in the [Node Reference](nodes/).

> Anthropic (Claude) and Ollama are reached through the provider system and generic nodes (for example `nodetool.agents.Agent`), not as standalone node namespaces. See [Providers](providers.md).

---

## Publishing Your Own Pack

1. Build the pack as described in the [Custom Nodes Guide](developer/custom-nodes-guide.md).
2. Publish it to npm or provide a Git URL.
3. To offer a Python pack in the Package Manager, publish it to PyPI and add it to `PYTHON_NODE_PACKS` in `packages/protocol/src/python-packs.ts`. `nodetool package list --available` prints the same list.

---

## Next Steps

- [Developer Guide](developer/) -- Build custom nodes and packs
- [Custom Nodes Guide](developer/custom-nodes-guide.md) -- Step-by-step node development
- [Node Patterns](developer/node-patterns.md) -- Common node implementation patterns
- [CLI Reference](cli.md) -- Package management commands
