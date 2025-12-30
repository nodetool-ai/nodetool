---
layout: page
title: "Node Implementation Quick Reference"
---



## Essential Node Template

```python
from typing import Any, AsyncGenerator, TypedDict, ClassVar
from pydantic import Field
from nodetool.workflows.base_node import BaseNode, InputNode, OutputNode
from nodetool.workflows.processing_context import ProcessingContext


# SIMPLE PROCESSING NODE
class SimpleNode(BaseNode):
    """
    Clear description of what this node does.
    keyword1, keyword2, keyword3
    
    Use cases:
    - What you can do with this
    - Another useful application
    - And one more example
    """
    
    # Input properties
    input_value: str = Field(default="", description="Help text")
    threshold: int = Field(default=100, ge=0, le=255)
    
    # Optional: Custom title in UI
    @classmethod
    def get_title(cls):
        return "Node Title"
    
    # Main execution method
    async def process(self, context: ProcessingContext) -> str:
        # Do work here
        return f"Result: {self.input_value}"


# TYPED OUTPUT NODE
class TypedNode(BaseNode):
    """Multi-value output. keywords"""
    
    class OutputType(TypedDict):
        text: str
        count: int
        success: bool
    
    async def process(self, context: ProcessingContext) -> OutputType:
        return {
            "text": "hello",
            "count": 42,
            "success": True
        }


# STREAMING/GENERATOR NODE
class StreamingNode(BaseNode):
    """Emit multiple items. keywords"""
    
    items: list[str] = []
    
    class OutputType(TypedDict):
        item: str
        index: int
    
    async def gen_process(
        self, context: ProcessingContext
    ) -> AsyncGenerator[OutputType, None]:
        for i, item in enumerate(self.items):
            yield {"item": item, "index": i}


# INPUT NODE
class CustomInput(InputNode):
    """Parameter input. keywords"""
    
    value: str = ""
    
    @classmethod
    def return_type(cls):
        return str
    
    async def process(self, context: ProcessingContext) -> str:
        return self.value


# OUTPUT NODE
class CustomOutput(OutputNode):
    """Collect output. keywords"""
    
    value: str = ""
    
    async def process(self, context: ProcessingContext) -> str:
        return self.value
```

## Common Field Patterns

```python
# Text input
text: str = Field(default="")
text: str = Field(default="", description="Help text")

# Number with constraints
count: int = Field(default=0, ge=0, le=100)
threshold: float = Field(default=0.5, ge=0.0, le=1.0)

# Optional
optional_value: str | None = Field(default=None)

# List
items: list[str] = Field(default=[])
tags: list[str] = Field(
    default=["tag1", "tag2"],
    description="List of tags"
)

# Enum choices
class MyEnum(str, Enum):
    OPTION_A = "a"
    OPTION_B = "b"

choice: MyEnum = Field(default=MyEnum.OPTION_A)

# Model selections
from nodetool.metadata.types import LanguageModel, ImageModel

model: LanguageModel = Field(default=LanguageModel())
image_model: ImageModel = Field(default=ImageModel())

# Asset references
from nodetool.metadata.types import ImageRef, AudioRef, VideoRef, DocumentRef, FolderRef

image: ImageRef = Field(default=ImageRef())
audio: AudioRef = Field(default=AudioRef())
folder: FolderRef = Field(default=FolderRef())

# Data structures
dataframe: DataframeRef = Field(default=DataframeRef())
columns: RecordType = Field(default=RecordType())
```

## Processing Context Essentials

```python
# Get provider for LLM calls
provider = await context.get_provider(Provider.OpenAI)
result = await provider.generate_message(model="gpt-4", ...)

# Work with images
image = await context.image_from_bytes(bytes_data)
pil_image = await context.image_to_pil(image_ref)
new_image = await context.image_from_pil(pil_image)

# Work with dataframes
df = await context.dataframe_to_pandas(df_ref)
new_df_ref = await context.dataframe_from_pandas(df)

# Work with assets
asset = await context.create_asset(filename, mime_type, file_obj, parent_id)
asset_url = await context.get_asset_url(asset_id)
file_bytes = await context.asset_to_bytes(ref)

# Emit updates to UI
context.post_message(SaveUpdate(
    node_id=self.id,
    name="filename",
    value=result,
    output_type="text"
))
```

## Input Nodes Quick List

```text
StringInput          - Text value
IntegerInput         - Whole number (min/max)
FloatInput           - Decimal (min/max)
BooleanInput         - True/False toggle
StringListInput      - List of strings

HuggingFaceModelInput    - Select HF model
LanguageModelInput       - Select LLM
ImageModelInput          - Select image model

ImageInput           - Image asset reference
AudioInput           - Audio asset reference
VideoInput           - Video asset reference
DocumentInput        - Document asset reference
AssetFolderInput     - Folder asset reference
ColorInput           - Color picker
CollectionInput      - Vector DB collection

FolderPathInput      - Local folder path
FilePathInput        - Local file path
DocumentFileInput    - Load document from file
```

## Output Nodes Quick List

```text
Output               - Generic output for any data type
```

## Special Node Features

```python
# Make available to agents
_expose_as_tool: ClassVar[bool] = True

# Enable dynamic input connectors
_is_dynamic: ClassVar[bool] = True

# Support dynamic output slots
_supports_dynamic_outputs: ClassVar[bool] = True

# Stream input instead of batching
@classmethod
def is_streaming_input(cls) -> bool:
    return True

# Emit streaming output
@classmethod
def is_streaming_output(cls) -> bool:
    return True

# Hide from UI (for base classes)
@classmethod
def is_visible(cls):
    return cls is not BaseClass

# Set basic fields shown first
@classmethod
def get_basic_fields(cls) -> list[str]:
    return ["prompt", "model"]

# Define required inputs
def required_inputs(self):
    return ["text"]

# Set return type
@classmethod
def return_type(cls):
    return dict
```

## Return Type Patterns

```python
# Simple return
async def process(self, context) -> str:
    return "result"

# Structured return (TypedDict)
class OutputType(TypedDict):
    text: str
    score: float

async def process(self, context) -> OutputType:
    return {"text": "...", "score": 0.95}

# Multiple possible types
async def process(self, context) -> int | float | str:
    return result

# Streaming (generator)
async def gen_process(self, context) -> AsyncGenerator[dict, None]:
    for item in items:
        yield {"output": item}

# Custom run method (advanced)
async def run(self, context, inputs: NodeInputs, outputs: NodeOutputs):
    async for item in inputs.stream("input_field"):
        await outputs.emit("output", processed_item)
```

## Docstring Keywords by Category

**Data Types**
text, string, number, integer, float, boolean, list, array, dict, object, document, file

**Operations**
extract, filter, map, reduce, merge, split, join, sort, group, aggregate, transform, analyze

**Media**
image, picture, visual, video, audio, sound, document, file, folder, asset

**AI/ML**
model, embedding, classification, clustering, generation, language, agent, tool

**Control**
flow, condition, loop, iterator, generator, stream, branch, switch

**I/O**
input, output, load, save, read, write, import, export, download, upload

## Common Node Patterns

### Text Processing

```python
# Concatenate
a: str
b: str
→ return self.a + self.b

# Split by delimiter
text: str
delimiter: str
→ return self.text.split(self.delimiter)

# Pattern matching
text: str
pattern: str
→ return re.findall(self.pattern, self.text)
```

### List Operations

```python
# Iterate with streaming
input_list: list[Any]
→ async def gen_process(...) -> AsyncGenerator[OutputType, None]:
    for index, item in enumerate(self.input_list):
        yield {"output": item, "index": index}

# Collect streamed items
input_item: Any
→ async for item in inputs.stream("input_item"):
    collected.append(item)
```

### Media Processing

```python
# Load and process image
image: ImageRef
→ pil_img = await context.image_to_pil(self.image)
   processed = PIL.Image.apply_filter(pil_img)
   return await context.image_from_pil(processed)

# Work with files
folder: str
pattern: str
→ async def gen_process(...) -> AsyncGenerator[OutputType, None]:
    for file in os.listdir(self.folder):
        if fnmatch(file, self.pattern):
            yield {"file": file, ...}
```

### Provider Integration

```python
model: LanguageModel
text: str
→ provider = await context.get_provider(self.model.provider)
   response = await provider.generate_message(
       model=self.model.id,
       messages=[...],
       ...
   )
   return response.content
```

## File Organization

```python
my_node_file.py

from pydantic import Field
from typing import TypedDict, AsyncGenerator
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext

class Node1(BaseNode):
    """..."""
    ...

class Node2(BaseNode):
    """..."""
    ...

# Multiple nodes can be in one file
# All will be auto-discovered
```

## Testing Pattern

```python
# nodes/nodetool/my_nodes.py
class MyNode(BaseNode):
    """My node. keywords"""
    value: str = ""
    
    async def process(self, context: ProcessingContext) -> str:
        return self.value.upper()

# tests/nodetool/test_my_nodes.py
import pytest
from nodetool.nodes.nodetool.my_nodes import MyNode

@pytest.mark.asyncio
async def test_my_node():
    # Mock context
    node = MyNode(value="hello")
    
    # Would need proper context mock
    # result = await node.process(context)
    # assert result == "HELLO"
```

## Key Reminders

1. All nodes must be **async** (use `async def`)
2. Docstring **keywords** are searchable and categorize the node
3. Pydantic **Field** provides validation and UI hints
4. **ProcessingContext** is your gateway to all services
5. Use **TypedDict** for multiple outputs
6. Use **AsyncGenerator** for streaming outputs
7. Docstring format matters: "description. keywords" + "Use cases:"
8. Node auto-discovery is automatic based on inheritance
9. Always include helpful **descriptions** in Field
10. Test with `pytest-asyncio` marker: `@pytest.mark.asyncio`
