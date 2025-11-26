---
layout: page
title: "Node Implementation Patterns"
---

## Overview

This guide explains how to create custom nodes for NodeTool. Whether you're adding a new AI model, a data transformation utility, or an integration with an external service, all nodes follow the same architectural patterns.

## Node Architecture

### Base Classes

All nodes inherit from one of three base classes provided by `nodetool.workflows.base_node`:

1. **`BaseNode`**: The standard class for processing nodes. Most of your nodes will inherit from this.
2. **`InputNode`**: Special nodes that serve as entry points for data into the workflow.
3. **`OutputNode`**: Special nodes that capture the final results of a workflow.

### The Processing Context

Every node execution receives a `ProcessingContext` object. This is your gateway to the runtime environment, providing access to:

- **Asset Management**: Loading and saving images, audio, and files.
- **AI Providers**: Accessing configured LLM, embedding, or image generation providers.
- **Logging**: Sending logs and progress updates to the UI.

---

## Anatomy of a Node

A typical node consists of four main parts:

1. **Class Definition**: Inherits from `BaseNode`.
2. **Metadata**: Docstrings and class methods that define how the node appears in the UI.
3. **Inputs**: Pydantic fields that define parameters and connections.
4. **Processing Logic**: An async method that performs the actual work.

### Example Structure

```python
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext

class MyCustomNode(BaseNode):
    """
    Short description of the node.
    keyword1, keyword2, search_terms
    
    Use cases:
    - Explain when to use this node
    """
    
    # Inputs
    text: str = Field(default="", description="Input text")
    factor: float = Field(default=1.0, ge=0.0, le=10.0)

    # Processing Logic
    async def process(self, context: ProcessingContext) -> str:
        return self.text * int(self.factor)
```

---

## Implementation Patterns

### 1. Simple Processing

For nodes that take inputs and return a single result, implement the `process` method. The return type annotation is used to determine the output type in the UI.

```python
async def process(self, context: ProcessingContext) -> str:
    return "Result"
```

### 2. Multiple Outputs

If your node produces multiple results (e.g., an audio transcription that returns both text and detected language), use a `TypedDict` to define the output structure.

```python
from typing import TypedDict

class OutputType(TypedDict):
    text: str
    confidence: float

async def process(self, context: ProcessingContext) -> OutputType:
    return {"text": "Hello", "confidence": 0.99}
```

### 3. Streaming (Generators)

For nodes that produce results incrementally (like reading a large file or generating tokens), use `gen_process` and return an `AsyncGenerator`.

```python
from typing import AsyncGenerator

async def gen_process(self, context: ProcessingContext) -> AsyncGenerator[str, None]:
    for i in range(5):
        yield f"Chunk {i}"
```

### 4. Dynamic Nodes

Some nodes need to change their inputs or outputs based on configuration.

- **Dynamic Inputs**: Set `_is_dynamic = True`.
- **Dynamic Outputs**: Set `_supports_dynamic_outputs = True` and implement `get_dynamic_output_slots()`.

---

## Working with Assets

NodeTool uses reference objects (like `ImageRef`, `AudioRef`) to pass heavy assets between nodes without loading them entirely into memory.

### Receiving Assets

Use the `ProcessingContext` to convert references into usable data.

```python
async def process(self, context: ProcessingContext) -> ImageRef:
    # Convert input ImageRef to PIL Image
    pil_image = await context.image_to_pil(self.input_image)
    
    # Process the image...
    processed_pil = pil_image.rotate(90)
    
    # Save back to an asset
    return await context.image_from_pil(processed_pil)
```

### Saving Assets

When your node creates a new file, save it using the context to ensure it's properly stored and accessible.

```python
# Save text to a file asset
asset_ref = await context.create_asset(
    filename="output.txt",
    mime_type="text/plain",
    data=b"Hello World"
)
```

---

## Best Practices

1. **Docstrings Matter**: The first line of your docstring becomes the node's description in the UI. The lines following are used for search keywords.
2. **Type Hints**: Always type-hint your inputs and return values. The system uses these to validate connections between nodes.
3. **Pydantic Constraints**: Use `Field(ge=0, le=100)` to enforce limits on numeric inputs directly in the UI.
4. **Async/Await**: All processing is asynchronous. Use `await` for I/O operations to keep the workflow responsive.
5. **Error Handling**: Let exceptions propagate or raise clear `ValueError`s. The system will catch them and display them on the node in the UI.

---

## File Structure

Nodes are organized by category in `src/nodetool/nodes/`:

- **`nodetool/`**: Core nodes (text, image, control flow).
- **`lib/`**: Wrappers for standard libraries (json, math, pillow).
- **`openai/`, `gemini/`, etc.**: Provider-specific integrations.

To add a new node, simply create a new file in the appropriate directory (or add to an existing one). The system automatically discovers all classes inheriting from `BaseNode`.
