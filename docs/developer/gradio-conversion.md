---
layout: page
title: "Gradio Conversion Guide"
---

This guide provides a reference for converting NodeTool workflows into Gradio applications. It covers the architectural differences, graph structure, and strategies for mapping NodeTool concepts to Gradio components.

## Overview

NodeTool workflows are Directed Acyclic Graphs (DAGs) where each node runs as an independent actor. Gradio applications, by contrast, are typically defined by sequential functions. Converting a workflow requires flattening the graph and mapping distributed logic into a cohesive function or set of functions.

## Graph Structure (JSON)

To convert a workflow, you often need to parse its JSON representation.

```json
{
  "nodes": [
    {
      "id": "input-1",
      "type": "nodetool.input.StringInput",
      "data": { "name": "user_name", "value": "" }
    },
    {
      "id": "process-1",
      "type": "nodetool.text.Concat",
      "data": { "a": "Hello, ", "b": "" }
    }
  ],
  "edges": [
    {
      "source": "input-1",
      "sourceHandle": "output",
      "target": "process-1",
      "targetHandle": "b"
    }
  ]
}
```

**Key Components:**

- **Nodes**: Contain `id`, `type` (class path), and `data` (parameters).
- **Edges**: Define data flow via `source`/`sourceHandle` and `target`/`targetHandle`.

## Architectural Differences

| Aspect | NodeTool | Gradio |
|--------|----------|--------|
| **Model** | Graph-based DAG | Sequential function-based |
| **Execution** | Async Actor Model (Distributed) | Synchronous/Threaded Function |
| **State** | Flows through edges | Function parameters/returns |
| **Streaming** | Async Generators (First-class) | Generator functions (Limited) |

## Conversion Strategy

### 1. Graph Analysis

- **Flatten** the graph if it contains nested groups.
- **Sort** nodes topologically to determine execution order.
- **Identify** InputNodes (parameters) and OutputNodes (returns).

### 2. Function Extraction

Convert the linear sequence of nodes into a single Python function.

**NodeTool Workflow:**
`StringInput` → `Concat` → `StringOutput`

**Gradio Equivalent:**

```python
def concatenate_text(prefix: str, suffix: str) -> str:
    return prefix + suffix

gr.Interface(
    fn=concatenate_text,
    inputs=["text", "text"],
    outputs="text"
)
```

### 3. Handling Multiple Outputs

Map multiple `OutputNode`s to a tuple return type.

```python
def process_text(text: str) -> tuple[str, float]:
    # ... processing logic ...
    return processed_text, score

gr.Interface(
    fn=process_text,
    inputs="text",
    outputs=["text", "number"]
)
```

### 4. Streaming Conversion

Map NodeTool's `async def gen_process` to Python generators.

```python
# NodeTool
async def gen_process(self, context):
    for item in items:
        yield {"output": item}

# Gradio
def process_items(items):
    for item in items:
        yield item
```

### 5. Asset Handling

NodeTool uses `AssetRef` (ImageRef, AudioRef). Gradio typically uses raw types (PIL.Image, numpy arrays) or file paths.

```python
# NodeTool
async def process(self, context) -> ImageRef:
    pil_img = await context.image_to_pil(self.image)
    return await context.image_from_pil(result)

# Gradio
def process_image(image: PIL.Image) -> PIL.Image:
    # process directly with PIL
    return result_image
```

## Type Mapping Reference

| NodeTool Node | Gradio Component | Python Type |
|---------------|------------------|-------------|
| `StringInput` | `Textbox` | `str` |
| `IntegerInput` | `Number` (precision=0) | `int` |
| `FloatInput` | `Slider` / `Number` | `float` |
| `BooleanInput` | `Checkbox` | `bool` |
| `ImageInput` | `Image` | `PIL.Image` / `str` (path) |
| `AudioInput` | `Audio` | `tuple` / `str` (path) |
| `VideoInput` | `Video` | `str` (path) |
| `DataframeOutput`| `Dataframe` | `pd.DataFrame` |
| `ColorInput` | `ColorPicker` | `str` (hex) |

## Best Practices

1. **Statelessness**: Keep functions pure. Avoid global state.
2. **Environment Variables**: Use `os.environ` for API keys (OpenAI, etc.) instead of passing them as graph inputs if possible.
3. **Error Handling**: Gradio functions fail entirely on error. Add try/catch blocks to handle graceful failures if needed.
