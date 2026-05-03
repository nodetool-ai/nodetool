---
layout: page
title: "Node Packs"
description: "Extend NodeTool with additional nodes, integrations, and workflow templates."
---

Node Packs extend NodeTool with additional nodes, integrations, and workflow templates. Packs are distributed through the public registry and can be installed directly from the app or via the command line.

---

## What's in a Pack

A Node Pack can include any combination of:

| Component | Description |
|-----------|-------------|
| **Node definitions** | New processing nodes that appear in the Node Menu |
| **npm dependencies** | Required libraries bundled with the pack |
| **Workflow templates** | Pre-built workflows that demonstrate the pack's capabilities |
| **Chat tools** | Tools accessible from Global Chat agents |

---

## Installing Packs from the App

### Open the Package Manager

1. Launch the desktop app
2. Go to **Tools > Packs** to open the Package Manager

### Browse and Search

- **Search by name** -- Use the search box to filter by package name, description, or repository
- **Search by node** -- Use the "Search nodes" field to find specific nodes across all packs. You can install the required pack directly from node search results.

### Install, Update, or Remove

- Click **Install** to add a pack. It downloads as an npm package.
- Click **Update** when a new version is available.
- Click **Uninstall** to remove a pack you no longer need.

Once installed, the pack's nodes automatically appear in the Node Menu under new namespaces.

---

## Installing Packs via CLI

For terminal users:

```bash
# List all available packs
nodetool package list -a

# Install a pack
npm install @nodetool-ai/<pack-name>

# Update a pack
npm update @nodetool-ai/<pack-name>

# Remove a pack
npm uninstall @nodetool-ai/<pack-name>
```

---

## Built-in Node Libraries

NodeTool ships with extensive built-in nodes organized by provider:

| Library | Categories | Examples |
|---------|-----------|----------|
| **nodetool** | Agents, audio, code, constants, control flow, data, documents, generators, images, input/output, text, video | Core processing nodes for any workflow |
| **openai** | Agents, audio, image, text | GPT models, DALL-E, Whisper, TTS |
| **anthropic** | Text | Claude models |
| **gemini** | Audio, image, text, video | Google Gemini multimodal models |
| **huggingface** | 27+ categories | Thousands of open-source models |
| **comfy** | Image-to-image, LoRA, text-to-image | ComfyUI-powered diffusion workflows |
| **mlx** | ASR, image, text, TTS | Apple Silicon optimized models |
| **lib** | 30+ utility categories | NumPy, Pillow, PDF, Excel, SQLite, HTTP, RSS, and more |

Browse the full node library in the [Node Reference](nodes/).

---

## Publishing Your Own Pack

Create and share your own Node Packs with the community:

1. Follow the guidelines in the [NodeTool Packs Registry](https://github.com/nodetool-ai/nodetool-registry) on GitHub
2. Structure your pack as an npm package with node definitions
3. Publish to the registry so others can discover and install your work

For details on building custom nodes, see the [Developer Guide](developer/) and [Custom Nodes Guide](developer/custom-nodes-guide.md).

---

## Next Steps

- [Developer Guide](developer/) -- Build custom nodes and packs
- [Custom Nodes Guide](developer/custom-nodes-guide.md) -- Step-by-step node development
- [Node Patterns](developer/node-patterns.md) -- Common node implementation patterns
- [CLI Reference](cli.md) -- Package management commands
