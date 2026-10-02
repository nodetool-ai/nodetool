---
layout: page
title: "Developer Guide"
description: "Build custom nodes, extend NodeTool with TypeScript, and integrate workflows programmatically."
---

Resources for building custom nodes, extending NodeTool, and integrating workflows programmatically.

---

## Quick Start: Custom Nodes

Creating custom nodes in TypeScript:

```ts
import { BaseNode, prop } from "@nodetool-ai/node-sdk";

export class UppercaseTextNode extends BaseNode {
  static readonly nodeType = "mypackage.text.Upper";
  static readonly title = "Uppercase Text";
  static readonly description = "Convert text to uppercase.";
  static readonly metadataOutputTypes = { output: "str" };

  @prop({ type: "str", default: "", title: "Input Text" })
  declare inputText: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: String(this.inputText ?? "").toUpperCase() };
  }
}
```

Export a `register(registry)` function and add a `nodetool` field to `package.json` (`{ "apiVersion": 1, "register": "register" }`). At startup the server scans installed packages for that field and calls the export. In production, only packs on the allowlist load.

**-> [Full Custom Nodes Guide (TypeScript)](custom-nodes-guide.md)** -- End-to-end walkthrough: packaging, governance, streaming, testing, distribution.

---

## Guides

### Provider & Model Guides

- **[Provider Guides](providers/index.md)** -- **Add models & nodes to any provider.** Per-provider runbooks (OpenAI, Anthropic, Gemini, xAI, FAL, Replicate, KIE, Together, AtlasCloud, Topaz, MiniMax, Reve, ElevenLabs, HuggingFace, Ollama, local inference, OpenAI-compatible) with exact files, commands, and how past PRs did it. Written for coding agents and contributors.

### Custom Node Development (TypeScript)

- **[Custom Nodes Guide](custom-nodes-guide.md)** -- **Start here!** End-to-end guide for authoring, packaging, and distributing TypeScript node packs.
- [TypeScript DSL Guide](ts-dsl-guide.md) -- Type-safe workflow definitions with auto-generated factory functions.

### Custom Node Reference (TypeScript)

- [Node Implementation Quick Reference](node-reference.md) -- Templates and common `@prop` / `process()` patterns.
- [Node Implementation Patterns](node-patterns.md) -- Architectural patterns: multi-output, streaming, stateful, secrets.

### Python Nodes

- [Node Implementation Examples](node-examples.md) -- Python node examples for the Python bridge.

### Advanced

- [Suspendable Nodes](suspendable-nodes.md) -- Why there is no pause/resume node API, and what `WaitNode` actually does.
- [JavaScript Sandbox](../javascript-sandbox.md) -- The QuickJS guest behind the Code node and agent code actions: capabilities, limits, imports, security model.

### Programmatic Workflows

- [TypeScript DSL Guide](ts-dsl-guide.md) -- Type-safe workflow definitions with auto-generated factory functions

### Architecture

- [Architecture](../architecture.md) -- Packages, execution engine, message types, providers, storage
- [Execution Strategies](../execution-strategies.md) -- How the kernel schedules actors and how the Code node is sandboxed
- [Packages](../packages.md) -- How node packages are structured, registered, and managed from the CLI
- [Node Packs](../node-packs.md) -- Built-in packs, the Package Manager, and installing third-party packs
- [Python Bridge Protocol](../python-bridge-protocol.md) -- Wire protocol between the TypeScript runtime and the Python worker

### API Integration

- [API Reference](../api-reference.md) -- REST API endpoints and authentication
- [Headless Mode](../api-reference.md#headless-mode-running-workflows-via-cliapi) -- Run workflows via CLI and HTTP API
- [Chat API](../chat-api.md) -- OpenAI-compatible chat endpoints
- [Workflow API](../workflow-api.md) -- Execute workflows programmatically

---

## Contributing

Contribute to [NodeTool on GitHub](https://github.com/nodetool-ai/nodetool).

### Share Custom Nodes

Options:

1. Publish as a separate npm package, and list it in the [registry repository](https://github.com/nodetool-ai/nodetool-registry)
2. Contribute to the core node library in the repository
3. Share workflow examples on Discord
