---
layout: page
title: "Node Implementation Examples"
description: "Annotated Python node examples for the Python bridge. TypeScript node guides are linked at the top."
---

## Real Examples from Codebase

This document provides annotated examples of **Python** nodes. Each example highlights specific patterns and implementation details to help you build your own nodes.

To write a **TypeScript** node, use the [Custom Nodes Guide](custom-nodes-guide.md), [Node Patterns](node-patterns.md), and [Node Reference](node-reference.md) instead.

The Python base classes live in the separate `nodetool-core` repository (`src/nodetool/`), and `HuggingFacePipelineNode` lives in `nodetool-huggingface`. This repository contains neither. This repository runs those nodes through the Python bridge: it reads the metadata the worker reports (`is_dynamic`, `is_streaming_output`, `is_streaming_input`, `required_settings`, properties, outputs) and sends `execute` and `execute.stream` calls. The samples on this page are checked against both repositories.

Imports used by the samples:

```python
from collections.abc import AsyncGenerator
from typing import Any, ClassVar, TypedDict

from pydantic import Field

from nodetool.metadata.types import AudioRef, ImageRef, TextRef
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.types import SaveUpdate
```

### How the worker finds a node pack

A pack is a Python package under the `nodetool.nodes` namespace, for example `nodetool.nodes.huggingface`. The worker (`nodetool-core/src/nodetool/worker/node_loader.py`) resolves which namespaces to load in this order: the `--namespaces` argument, the `NODETOOL_WORKER_NAMESPACES` environment variable (comma-separated), then auto-discovery (`resolve_namespaces`, lines 283-299). Auto-discovery is the union of the `nodetool.namespaces` entry-point group (each value is a comma-separated list of namespace names) and every subdirectory of the `nodetool.nodes` namespace path (`_discover_namespaces`, lines 12-56). The worker then imports each `nodetool.nodes.<ns>` module and every submodule below it so the `BaseNode` subclasses register. A node's type is its module path without the `nodetool.nodes.` prefix, plus the class name with a trailing `Node` removed (`get_namespace` and `get_node_type`, `workflows/base_node.py:923-946`).

`nodetool-pkg scan` (`package_tools/__main__.py`) builds a package's metadata JSON. `--write` saves it to `<package-dir>/src/nodetool/package_metadata/<name>.json`.

---

## 1. Simple Processing Nodes

These nodes take one or more inputs, perform a calculation, and return a single result. They are the building blocks of most workflows.

### Example: Text Concatenation

**Pattern**: `BaseNode` with simple inputs and a single return value.

```python
class Concat(BaseNode):
    """
    Concatenates two text inputs into a single output.
    text, concatenation, combine, +
    """

    # Define inputs using Pydantic fields
    a: str = Field(default="")
    b: str = Field(default="")

    @classmethod
    def get_title(cls):
        return "Concatenate Text"

    # The return type annotation (str) gives the node its single "output" slot
    async def process(self, context: ProcessingContext) -> str:
        return self.a + self.b
```

**Key Takeaways:**

- Use `Field(default="")` to define inputs.
- The `process` method must be `async`.
- `BaseNode.return_type()` reads the annotation to build the output slots (`workflows/base_node.py:1819`). A plain type gives one slot named `output`.
- `get_title()` defaults to the class name without a trailing `Node`, split on camel case (`workflows/base_node.py:949`). The bridge `discover` payload reads a `title` class attribute instead and falls back to the last part of the node type (`worker/node_loader.py:64`).

---

## 2. Structured Output Nodes

Sometimes a node needs to return multiple values (e.g., an audio transcription that returns both the text and the detected language).

### Example: Automatic Speech Recognition

**Pattern**: Using `TypedDict` to define multiple named outputs.

```python
class AutomaticSpeechRecognition(BaseNode):
    """
    Automatic speech recognition node.
    audio, speech, recognition
    """

    # Define the output structure
    class OutputType(TypedDict):
        text: str
        language: str

    model: ASRModel = Field(...)
    audio: AudioRef = Field(...)

    async def process(self, context: ProcessingContext) -> OutputType:
        # ... logic to transcribe audio ...
        return {
            "text": "Hello world",
            "language": "en"
        }
```

**Key Takeaways:**

- Define a `TypedDict` named `OutputType` inside your class. `return_type()` checks for this attribute first, then the annotation of `gen_process`, then the annotation of `process` (`workflows/base_node.py:1827-1844`). Each key becomes an output slot.
- Annotate `process` with `OutputType` by convention.
- Return a dictionary matching the structure.

---

## 3. Streaming Nodes

For operations that take a long time or produce results incrementally (like reading a large folder of images), use a generator.

### Example: Load Image Folder

**Pattern**: `gen_process` with `AsyncGenerator`.

```python
class LoadImageFolder(BaseNode):
    """
    Load all images from a folder.
    image, load, folder
    """
    
    folder: str = Field(default="")

    class OutputType(TypedDict):
        image: ImageRef
        path: str

    # Use gen_process instead of process
    async def gen_process(
        self, context: ProcessingContext
    ) -> AsyncGenerator[OutputType, None]:
        
        # Iterate over files and yield results one by one
        for path in list_image_paths(self.folder):  # your own helper
            image = await context.image_from_bytes(read_bytes(path))
            yield {"image": image, "path": path}
```

**Key Takeaways:**

- Use `gen_process` instead of `process`. A node is streaming when it overrides `gen_process` (`is_streaming_output`, `workflows/base_node.py:1806-1812`), and such a node is not cacheable (`is_cacheable`, line 1703).
- Return type is `AsyncGenerator[OutputType, None]`.
- Yield a dictionary that maps output names to values. `BaseNode.run()` and the worker raise `TypeError` for any other item, even though the `gen_process` docstring mentions yielding a bare value (`workflows/base_node.py:2137`, `2183`, `worker/executor.py:591`, `615`).
- `yield` results as they become available. This allows downstream nodes to start processing immediately.

---

## 4. Dynamic Nodes

Some nodes need to adapt their inputs based on user configuration. For example, a template node might need different inputs depending on the variables in the template string.

### Example: Format Text (Jinja2)

**Pattern**: `_is_dynamic` flag and `_dynamic_properties`.

{% raw %}

```python
import jinja2


class FormatText(BaseNode):
    """
    Replaces placeholders in a string with dynamic inputs.
    """

    # 1. Flag this node as dynamic
    _is_dynamic: ClassVar[bool] = True

    template: str = Field(default="Hello {{ name }}!")

    async def process(self, context: ProcessingContext) -> str:
        # 2. Read the dynamic inputs provided by the user
        # These are inputs that were added to the node at runtime
        dynamic_inputs = self._dynamic_properties

        # Render the template using these inputs
        return jinja2.Template(self.template).render(**dynamic_inputs)
```

{% endraw %}

**Key Takeaways:**

- Set `_is_dynamic = True`.
- The UI will allow users to add arbitrary inputs to this node.
- Read the values from `self._dynamic_properties` (a `dict[str, Any]`) or the `dynamic_properties` property. `get_dynamic_properties()` returns a dict of `Property` type descriptions, not the values (`workflows/base_node.py:1711-1726`).
- `BaseNode.is_dynamic()` reads `_is_dynamic`, and the worker reports it in `discover` (`workflows/base_node.py:665`, `worker/node_loader.py:101`). Assigning an undeclared property on a dynamic node stores it in `_dynamic_properties` (`workflows/base_node.py:1292`).

---

## 5. Working with Assets

Nodes often need to load or save heavy assets like images or audio.

### Example: Save Text to File

**Pattern**: Using `ProcessingContext` to create assets.

```python
class SaveText(BaseNode):
    """
    Saves input text to a file.
    """

    text: str = Field(default="")
    filename: str = Field(default="output.txt")

    async def process(self, context: ProcessingContext) -> TextRef:
        # 1. Create the asset using the context. Passing a name persists it.
        result = await context.text_from_str(self.text, name=self.filename)

        # 2. Notify the UI that a file was saved (optional)
        context.post_message(SaveUpdate(
            node_id=self.id,
            name=self.filename,
            value=result,
            output_type="text"
        ))

        return result
```

**Key Takeaways:**

- Never write directly to disk if you can avoid it. `text_from_str(s, name=...)` stores an asset and returns a `TextRef` with `asset_id` and `uri` set. Without `name` it returns a `memory://` reference and persists nothing (`workflows/processing_context.py:1880-1899`).
- For raw bytes, `context.create_asset(name, content_type, content)` takes a file-like `content` (for example `BytesIO`) and returns a `SimpleNamespace` with `id`, `name`, `content_type`, `file_name`, `size`, `user_id`, `workflow_id` and `node_id`. It has no `uri` (`workflows/processing_context.py:665-709`).
- Return a `Ref` object (like `TextRef`, `ImageRef`) so other nodes can use the asset. Media helpers include `image_from_bytes`, `image_from_pil`, `image_from_numpy`, `audio_from_numpy` and `audio_from_bytes`.
- `SaveUpdate` has the fields `node_id`, `name`, `value`, `output_type` and `metadata` (`workflows/types.py:199-208`). The bridge worker forwards only `NodeProgress`, `PreviewUpdate`, `LogUpdate` and `BinaryUpdate` messages and drops the rest, so a `SaveUpdate` posted by a bridge node does not reach the UI (`worker/context_stub.py:260-285`).
- In the bridge, `WorkerContext` overrides the image and audio helpers to return `blob://` references backed by bytes sent over the bridge (`worker/context_stub.py:55-235`).

---

## 6. Control Flow

Nodes can control the execution flow of the graph.

### Example: If Node

**Pattern**: Conditional logic in `gen_process`.

```python
class If(BaseNode):
    """
    Conditionally executes branches.
    """
    
    condition: bool = Field(default=False)
    value: Any = Field(default=None)

    class OutputType(TypedDict):
        if_true: Any
        if_false: Any

    async def gen_process(self, context: ProcessingContext) -> AsyncGenerator[OutputType, None]:
        if self.condition:
            # Only emit to the 'if_true' output
            yield {"if_true": self.value, "if_false": None}
        else:
            # Only emit to the 'if_false' output
            yield {"if_true": None, "if_false": self.value}
```

**Key Takeaways:**

- Control flow nodes often use `gen_process` to conditionally yield results.
- The TypeScript `nodetool.control.If` returns only the taken branch's key. A key that is absent sends no message, so nodes wired only to the untaken branch do not run.
- In Python, `BaseNode.run()` skips any yielded value that is `None`, so the untaken branch sends nothing (`workflows/base_node.py:2188`). The bridge worker aggregates the final result the same way, but each streamed chunk carries the raw mapping including `None` placeholders (`worker/executor.py:605-625`). What the TypeScript host does with a `null` chunk value is not checked here.

---

## 7. Model Nodes (HuggingFace / model-backed)

Nodes that load a machine-learning model (HuggingFace, diffusers, …) extend
`HuggingFacePipelineNode`, a `BaseNode` subclass in the `nodetool-huggingface`
package (`src/nodetool/nodes/huggingface/huggingface_pipeline.py:94`). It adds
model loading, device placement, a thread-pool inference helper, and the model
cache key hooks. This is the pattern that package uses for its nodes. The sample
below follows `MusicLDM` (`src/nodetool/nodes/huggingface/text_to_audio.py:232`).

### Example: A text-to-audio model node

```python
from typing import Any

from pydantic import Field

from nodetool.huggingface.memory_utils import move_pipeline_to_device
from nodetool.metadata.types import AudioRef, HFTextToAudio, HuggingFaceModel
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext


class MyAudioGen(HuggingFacePipelineNode):
    """
    One-line description shown in the UI.
    audio, generation, text-to-audio
    """

    model: HFTextToAudio = Field(
        default=HFTextToAudio(),
        title="Model",
        description="The model to use.",
    )
    prompt: str = Field(default="", description="Text prompt.")

    _pipeline: Any = None

    @classmethod
    def get_title(cls) -> str:
        return "My Audio Gen"

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        # Fields rendered on the node body; the rest live in the expanded view.
        return ["model", "prompt"]

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        # Checkpoints offered for one-click download in the Model Manager.
        return [
            HFTextToAudio(
                repo_id="org/my-model",
                allow_patterns=["*.safetensors", "*.json", "*.txt"],
            ),
        ]

    async def preload_model(self, context: ProcessingContext):
        # Called once before process(); load the model here.
        from diffusers import MusicLDMPipeline  # use your model's pipeline class

        self._pipeline = await self.load_model(
            context, MusicLDMPipeline, self.model.repo_id
        )

    async def move_to_device(self, device: str):
        # HuggingFacePipelineNode already implements this for self._pipeline.
        # Override only to change how the move happens.
        if self._pipeline:
            move_pipeline_to_device(self._pipeline, device)

    async def process(self, context: ProcessingContext) -> AudioRef:
        # run_pipeline_in_thread keeps the asyncio event loop responsive.
        output = await self.run_pipeline_in_thread(self.prompt)
        return await context.audio_from_numpy(output.audios[0], 16_000)
```

**Key Takeaways:**

- Extend `HuggingFacePipelineNode` and declare a `model:` field of the matching
  HF type (`HFTextToImage`, `HFTextToVideo`, `HFTextToAudio`, `HFTextGeneration`, …,
  all extending `HuggingFaceModel` in `nodetool-core` `metadata/types.py:933`).
- `get_recommended_models()` lists checkpoints the Model Manager can download
  (`BaseNode`, `workflows/base_node.py:967`). `get_basic_fields()` selects which
  fields show on the node body (`base_node.py:1086`). `get_title()` sets the
  display name. The `HuggingFacePipelineNode` default prefixes the class name
  with `HF ` (`huggingface_pipeline.py:205-208`), so override it for a plain name.
- The bridge runs `pre_process`, `preload_model`, `move_to_device`, then
  `process` or `gen_process` (`nodetool-core` `worker/executor.py:281-284`).
  `HuggingFacePipelineNode.pre_process` sets up HF logging, so call
  `super().pre_process(context)` if you override it.
- `load_model(context, model_class, model_id, ...)` is an instance method with
  optional `skip_cache`, `cache_key`, and keyword arguments such as `torch_dtype`,
  `variant` and `device`, which pass through to the module function in
  `nodetool/huggingface/local_provider_utils.py:551`
  (`huggingface_pipeline.py:275-298`). `load_pipeline(context, pipeline_task, model_id, ...)`
  is the transformers pipeline counterpart.
- `run_pipeline_in_thread(*args, **kwargs)` calls `self._pipeline` in a shared
  thread pool under `torch.inference_mode()`, and raises `ValueError` when
  `_pipeline` is `None` (`huggingface_pipeline.py:300-333`).
- `get_model_id()` is not part of the base class. Many nodes define it themselves
  as `return self.model.repo_id` (for example `text_to_audio.py:109`).
  `available_torch_dtype(device=None)` is a helper in
  `nodes/huggingface/stable_diffusion_base.py:590`, not a node method. Pass its
  result as `torch_dtype=` to `load_model` when a pipeline needs a dtype.
- The base `process()` raises `NotImplementedError`, and `requires_gpu()` returns
  `True`.
- To make a model usable outside the node graph (e.g. via an agent or the
  generation API), implement the matching method on the package's
  [local provider](../providers.md#provider-capabilities) — e.g. `text_to_audio()`
  for the `TEXT_TO_AUDIO` capability.
