---
layout: page
title: "Developer Guide"
description: "Build custom nodes, extend NodeTool with Python, and integrate workflows programmatically."
---

Resources for building custom nodes, extending NodeTool, and integrating workflows programmatically.

---

## Quick Start: Custom Nodes

Creating custom nodes:

```python
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext

class MyCustomNode(BaseNode):
    """
    A simple custom node that processes text.
    text, processing, custom
    
    Use cases:
    - Transform text in custom ways
    - Integrate with external APIs
    - Add domain-specific functionality
    """
    
    input_text: str = Field(default="", description="Text to process")
    
    async def process(self, context: ProcessingContext) -> str:
        # Your custom logic here
        return self.input_text.upper()
```

Save this in a Python file. NodeTool automatically discovers the node.

**→ [Full Custom Node Tutorial](node-reference.md)** – Templates, patterns, and detailed examples

---

## Guides

### Custom Node Development

- **[Node Implementation Quick Reference](node-reference.md)** – **Start here!** Templates and common patterns for custom nodes
- [Node Implementation Patterns](node-patterns.md) – Comprehensive summary of node implementation patterns and architecture
- [Node Implementation Examples](node-examples.md) – Real-world examples from the codebase

### Programmatic Workflows

- [Python DSL Guide](dsl-guide.md) – Define NodeTool workflows programmatically using Python
- [Gradio Conversion Guide](gradio-conversion.md) – Convert NodeTool workflows to Gradio applications

### API Integration

- [API Reference](../api-reference.md) – REST API endpoints and authentication
- [Headless Mode](../api-reference.md#headless-mode-running-workflows-via-cliapi) – Run workflows via CLI and HTTP API
- [Chat API](../chat-api.md) – OpenAI-compatible chat endpoints
- [Workflow API](../workflow-api.md) – Execute workflows programmatically

---

## Documentation Development

- [Docs README](../README.md) – How to build and serve the documentation site locally
- [Theme Guide](../THEME.md) – Notes on the custom docs theme

---

## Contributing

Contribute to [NodeTool on GitHub](https://github.com/nodetool-ai/nodetool).

### Share Custom Nodes

Options:
1. Publish as a separate package
2. Contribute to the core node library
3. Share workflow examples on Discord
