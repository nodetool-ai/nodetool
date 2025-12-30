---
layout: page
title: "Developer Guide"
description: "Build custom nodes, extend NodeTool with Python, and integrate workflows programmatically."
---

Welcome to the NodeTool Developer Guide. Here you will find resources for building custom nodes, extending NodeTool's capabilities, and integrating workflows programmatically.

---

## Quick Start: Building Custom Nodes

**Want to extend NodeTool with your own functionality?** Creating custom nodes is straightforward:

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

Save this in a Python file, and NodeTool will automatically discover your node!

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

If you're interested in contributing to the core NodeTool platform or sharing your custom nodes, please check out our [GitHub repository](https://github.com/nodetool-ai/nodetool).

### Share Your Custom Nodes

Built something useful? Consider:
1. Publishing as a separate package that users can install
2. Contributing to the core NodeTool node library
3. Sharing workflow examples in the community Discord
