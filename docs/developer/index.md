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

export class MyCustomNode extends BaseNode {
  static readonly nodeType = "mypackage.text.Upper";
  static readonly title = "Uppercase Text";
  static readonly description =
    "A simple custom node that converts text to uppercase.\n" +
    "    text, processing, custom";

  static readonly metadataOutputTypes = {
    output: "str",
  };

  @prop({ type: "str", default: "", title: "Input Text", description: "Text to process" })
  declare input_text: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const text = String(inputs.input_text ?? this.input_text ?? "");
    return { output: text.toUpperCase() };
  }
}
```

Register this class in your package's index file and NodeTool discovers the node automatically.

**-> [Full Custom Node Tutorial](node-reference.md)** -- Templates, patterns, and detailed examples

---

## Guides

### Custom Node Development

- **[Node Implementation Quick Reference](node-reference.md)** -- **Start here!** Templates and common `@prop` / `process()` patterns
- [Node Implementation Patterns](node-patterns.md) -- Architectural patterns: multi-output, streaming, stateful, secrets
- [Node Implementation Examples](node-examples.md) -- Real-world examples from the codebase
- [Suspendable Nodes](suspendable-nodes.md) -- Build nodes that can pause and resume workflows

### Programmatic Workflows

- [TypeScript DSL Guide](ts-dsl-guide.md) -- Type-safe workflow definitions with auto-generated factory functions
- [Gradio Conversion Guide](gradio-conversion.md) -- Convert NodeTool workflows to Gradio applications

### API Integration

- [API Reference](../api-reference.md) -- REST API endpoints and authentication
- [Headless Mode](../api-reference.md#headless-mode-running-workflows-via-cliapi) -- Run workflows via CLI and HTTP API
- [Chat API](../chat-api.md) -- OpenAI-compatible chat endpoints
- [Workflow API](../workflow-api.md) -- Execute workflows programmatically

---

## Documentation Development

- [Docs README](../README.md) -- How to build and serve the documentation site locally
- [Theme Guide](../THEME.md) -- Notes on the custom docs theme

---

## Contributing

Contribute to [NodeTool on GitHub](https://github.com/nodetool-ai/nodetool).

### Share Custom Nodes

Options:

1. Publish as a separate package
2. Contribute to the core node library
3. Share workflow examples on Discord
