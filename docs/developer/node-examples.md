---
layout: page
title: "Node Implementation Examples"
---

## Real Examples from Codebase

This document provides annotated examples of real nodes from the NodeTool codebase. Each example highlights specific patterns and implementation details to help you build your own nodes.

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

    # The return type annotation (str) tells the UI what this node outputs
    async def process(self, context: ProcessingContext) -> str:
        return self.a + self.b
```

**Key Takeaways:**

- Use `Field(default="")` to define inputs.
- The `process` method must be `async`.
- The return type annotation is crucial for the UI to validate connections.

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

- Define a `TypedDict` named `OutputType` inside your class.
- Set the return annotation of `process` to `OutputType`.
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
        for path in self.iter_files(self.folder):
            image = await context.image_from_bytes(...)
            yield {"image": image, "path": path}
```

**Key Takeaways:**

- Use `gen_process` instead of `process`.
- Return type is `AsyncGenerator[OutputType, None]`.
- `yield` results as they become available. This allows downstream nodes to start processing immediately.

---

## 4. Dynamic Nodes

Some nodes need to adapt their inputs based on user configuration. For example, a template node might need different inputs depending on the variables in the template string.

### Example: Format Text (Jinja2)

**Pattern**: `_is_dynamic` flag and `_dynamic_properties`.

{% raw %}

```python
class FormatText(BaseNode):
    """
    Replaces placeholders in a string with dynamic inputs.
    """

    # 1. Flag this node as dynamic
    _is_dynamic: ClassVar[bool] = True

    template: str = Field(default="Hello {{ name }}!")

    async def process(self, context: ProcessingContext) -> str:
        # 2. Access the dynamic inputs provided by the user
        # These are inputs that were added to the node at runtime
        dynamic_inputs = self.get_dynamic_properties()
        
        # Render the template using these inputs
        return self.render_template(self.template, **dynamic_inputs)
```

{% endraw %}

**Key Takeaways:**

- Set `_is_dynamic = True`.
- The UI will allow users to add arbitrary inputs to this node.
- Access these inputs via `self.get_dynamic_properties()` or `self._dynamic_properties`.

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
        # 1. Create the asset using the context
        asset = await context.create_asset(
            filename=self.filename,
            mime_type="text/plain",
            data=self.text.encode("utf-8")
        )

        # 2. Create a reference to return
        result = TextRef(uri=asset.uri, asset_id=asset.id)

        # 3. Notify the UI that a file was saved (optional but recommended)
        context.post_message(SaveUpdate(
            node_id=self.id,
            name=self.filename,
            value=result,
            output_type="text"
        ))

        return result
```

**Key Takeaways:**

- Never write directly to disk if you can avoid it. Use `context.create_asset`.
- Return a `Ref` object (like `TextRef`, `ImageRef`) so other nodes can use the asset.
- Use `SaveUpdate` to show the saved file in the UI's "Outputs" tab.

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

    async def gen_process(self, context: Any) -> AsyncGenerator[OutputType, None]:
        if self.condition:
            # Only emit to the 'if_true' output
            yield {"if_true": self.value, "if_false": None}
        else:
            # Only emit to the 'if_false' output
            yield {"if_true": None, "if_false": self.value}
```

**Key Takeaways:**

- Control flow nodes often use `gen_process` to conditionally yield results.
- By yielding `None` for a specific output, you effectively stop execution on that branch (downstream nodes won't trigger).
