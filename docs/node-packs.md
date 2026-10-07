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

Open **Tools > Package Manager** in the desktop app, or go to `/packages` in the web UI. The left rail has four lists.

### Included, Python packs, Third-party, and Software

- **Included** lists the packs that ship with NodeTool. Switch a pack on or off, then restart the server. The base pack is always on. Provider packs that need an API key are not listed. Their nodes appear after you add the key in **Settings > Models & Providers**.
- **Python packs** lists the Python node packs that NodeTool offers. They install from PyPI. Use **Install**, **Update**, or **Uninstall**, or **Update all** when several have updates.
- **Third-party** installs npm packs. Paste a package name such as `@acme/cool-nodes` or `cool-nodes@1.2.3` and click **Install**. Restart the server to load it.
- **Software** manages runtimes such as Python and FFmpeg, in groups for languages, media, and AI.

Press `/` to focus the search box. It filters by name and description. The status filter next to it shows all packages, the installed ones, or the ones not installed. On the Included list, the options are On and Off. Installed includes packages that have an update. The search and the filter stay set when you open another list.

Installing and removing run only in the desktop app. In the web UI, the lists are status-only.

### Trust

Installing a third-party pack runs none of its code and no lifecycle scripts. What happens next depends on what the pack contains:

- **Sandbox modules only.** The pack is active right away. Its modules run inside the sandbox with the capabilities of the node that imports them.
- **Host nodes.** The pack stays inactive until you switch on **Trusted** for it in the Third-party list. Trusting runs the pack's lifecycle scripts against the artifact that was installed.

The Third-party list shows each pack's mode, either sandbox modules only, host nodes, or both, and whether it is active.

---

## Installing Packs via CLI

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

The server finds packs by scanning `node_modules` directories from the working directory upward. Add more directories with `NODETOOL_PACK_SEARCH_PATHS` (a list of directories) or `NODETOOL_OPTIONAL_NODE_MODULES` (one directory). Restart the server after any change.

In production (`NODETOOL_ENV=production`, or `NODETOOL_PACKS_REQUIRE_ALLOWLIST=1`), only packs on the allowlist load. Set `NODETOOL_PACKS_ALLOWLIST` to a comma-separated list of package names, or edit the `allow` list in `~/.config/nodetool/packs.json`. See the [trust model](developer/custom-nodes-guide.md#4-trust-model-and-governance).

---

## Built-in Node Libraries

NodeTool ships these first-party packs. The ids are in `BUILTIN_NODE_PACKS` (`packages/protocol/src/builtin-packs.ts`).

| Pack | Default | Namespaces and contents |
|------|---------|-------------------------|
| **Base Nodes** | Always on | `nodetool` (agents, audio, code, constants, control flow, data, documents, generators, images, input/output, text, video, and more), `openai`, `gemini`, `mistral`, `xai`, `lib`, `messaging` (Discord, Telegram), `vector` |
| **FAL** | On | `fal` image, video, and audio models |
| **Kie.ai** | On | `kie` image and video models |
| **Replicate** | On | `replicate` community models |
| **Hugging Face** | On | `huggingface` Inference Providers nodes |
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
