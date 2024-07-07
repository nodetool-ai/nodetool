from typing import Any, Literal

from pydantic import Field
from nodetool.metadata.types import Message
from nodetool.metadata.types import ImageTensor, Tensor
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import AudioRef
from nodetool.metadata.types import DataframeRef
from nodetool.metadata.types import ModelRef
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import (
    BaseNode,
    OutputNode,
)
from nodetool.metadata.types import TextRef
from nodetool.metadata.types import VideoRef


class ListOutput(OutputNode):
    """
    Output node for a list of arbitrary values.
    list, output, any

    Use cases:
    - Returning multiple results from a workflow
    - Aggregating outputs from multiple nodes
    """

    value: list[Any] = []

    async def process(self, context: ProcessingContext) -> list[Any]:
        return self.value

    def get_json_schema(self):
        return {
            "type": "array",
            "items": {
                "type": "object",
            },
            "description": self.description,
        }


class ChatOutput(OutputNode):
    """
    Output node for chat message lists.
    chat, messages, conversation

    Use cases:
    - Displaying conversation history
    - Returning chatbot responses
    - Formatting dialog for presentation
    """

    value: list[Message] = Field(
        default=[],
        description="The messages to display in the chat.",
    )

    async def process(self, context: ProcessingContext) -> list[Message]:
        return self.value

    def get_json_schema(self):
        return {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "thread_id": {"type": "string"},
                    "role": {"type": "string"},
                    "content": {"type": "string"},
                },
            },
            "description": self.description,
        }


class ImageListOutput(OutputNode):
    """
    Output node for a list of image references.
    images, list, gallery

    Use cases:
    - Displaying multiple images in a grid
    - Returning image search results
    """

    value: list[ImageRef] = Field(
        default=[],
        description="The images to display.",
    )

    async def process(self, context: ProcessingContext) -> list[ImageRef]:
        return self.value

    def get_json_schema(self):
        return {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "uri": {"type": "string"},
                    "type": {"type": "string"},
                },
            },
            "description": self.description,
        }


class IntegerOutput(OutputNode):
    """
    Output node for a single integer value.
    integer, number, count

    Use cases:
    - Returning numeric results (e.g. counts, indices)
    - Passing integer parameters between nodes
    - Displaying numeric metrics
    """

    value: int = 0

    async def process(self, context: ProcessingContext) -> int:
        return self.value

    def get_json_schema(self):
        return {
            "type": "integer",
            "description": self.description,
        }


class FloatOutput(OutputNode):
    """
    Output node for a single float value.
    float, decimal, number

    Use cases:
    - Returning decimal results (e.g. percentages, ratios)
    - Passing floating-point parameters between nodes
    - Displaying numeric metrics with decimal precision
    """

    value: float = 0

    async def process(self, context: ProcessingContext) -> float:
        return self.value

    def get_json_schema(self):
        return {
            "type": "number",
            "description": self.description,
        }


class BooleanOutput(OutputNode):
    """
    Output node for a single boolean value.
    boolean, true/false, flag

    Use cases:
    - Returning binary results (yes/no, true/false)
    - Controlling conditional logic in workflows
    - Indicating success/failure of operations
    """

    value: bool = False

    async def process(self, context: ProcessingContext) -> bool:
        return self.value

    def get_json_schema(self):
        return {
            "type": "boolean",
            "description": self.description,
        }


class StringOutput(OutputNode):
    """
    Output node for a single string value.
    string, text, output

    Use cases:
    - Returning text results or messages
    - Passing string parameters between nodes
    - Displaying short text outputs
    """

    value: str = ""

    async def process(self, context: ProcessingContext) -> str:
        return self.value

    def get_json_schema(self):
        return {
            "type": "string",
            "description": self.description,
        }


class TextOutput(OutputNode):
    """
    Output node for structured text content.
    text, content, document

    Use cases:
    - Returning longer text content or documents
    - Passing formatted text between processing steps
    - Displaying rich text output
    """

    value: TextRef = TextRef()

    async def process(self, context: ProcessingContext) -> TextRef:
        return self.value

    def get_json_schema(self):
        return {
            "type": "string",
            "description": self.description,
        }


class ImageOutput(OutputNode):
    """
    Output node for a single image reference.
    image, picture, visual

    Use cases:
    - Displaying a single processed or generated image
    - Passing image data between workflow nodes
    - Returning image analysis results
    """

    value: ImageRef = ImageRef()

    async def process(self, context: ProcessingContext) -> ImageRef:
        return self.value

    def get_json_schema(self):
        return {
            "type": "object",
            "description": self.description,
            "properties": {
                "uri": {
                    "type": "string",
                    "description": "The URI of the image.",
                },
                "asset_type": {
                    "type": "string",
                    "description": "The type of the asset.",
                },
            },
        }


class ComfyImageOutput(OutputNode):
    """
    Output node for raw image tensor data.
    image, tensor, raw

    Use cases:
    - Outputting directly from image generation models
    - Passing raw image data for further processing
    - Interfacing with tensor-based image libraries
    """

    value: ImageTensor = Field(default=ImageTensor(), description="A raw image tensor.")

    def assign_property(self, name: str, value: Any):
        setattr(self, name, value)

    async def process(self, context: ProcessingContext) -> ImageRef:
        import numpy as np

        image = self.value[0]  # type: ignore
        i = 255.0 * image.cpu().detach().numpy()  # type: ignore
        img = np.clip(i, 0, 255).astype(np.uint8)
        return await context.image_from_numpy(img)


class VideoOutput(OutputNode):
    """
    Output node for video content references.
    video, media, clip

    Use cases:
    - Displaying processed or generated video content
    - Passing video data between workflow steps
    - Returning results of video analysis
    """

    value: VideoRef = VideoRef()

    async def process(self, context: ProcessingContext) -> VideoRef:
        return self.value


class TensorOutput(OutputNode):
    """
    Output node for generic tensor data.
    tensor, array, numerical

    Use cases:
    - Passing multi-dimensional data between nodes
    - Outputting results from machine learning models
    - Representing complex numerical data structures
    """

    value: Tensor = Tensor()

    async def process(self, context: ProcessingContext) -> Tensor:
        return self.value


class ModelOutput(OutputNode):
    """
    Output node for machine learning model references.
    model, ml, ai

    Use cases:
    - Passing trained models between workflow steps
    - Outputting newly created or fine-tuned models
    - Referencing models for later use in the workflow
    """

    value: ModelRef = ModelRef()

    async def process(self, context: ProcessingContext) -> ModelRef:
        return self.value


class AudioOutput(OutputNode):
    """
    Output node for audio content references.
    audio, sound, media

    Use cases:
    - Displaying processed or generated audio
    - Passing audio data between workflow nodes
    - Returning results of audio analysis
    """

    value: AudioRef = AudioRef()

    async def process(self, context: ProcessingContext) -> AudioRef:
        return self.value


class DataframeOutput(OutputNode):
    """
    Output node for structured data references.
    dataframe, table, structured

    Use cases:
    - Outputting tabular data results
    - Passing structured data between analysis steps
    - Displaying data in table format
    """

    value: DataframeRef = DataframeRef()

    async def process(self, context: ProcessingContext) -> DataframeRef:
        return self.value


class DictionaryOutput(OutputNode):
    """
    Output node for key-value pair data.
    dictionary, key-value, mapping

    Use cases:
    - Returning multiple named values
    - Passing complex data structures between nodes
    - Organizing heterogeneous output data
    """

    value: dict[str, Any] = {}

    async def process(self, context: ProcessingContext) -> dict[str, Any]:
        return self.value


class GroupOutput(BaseNode):
    """
    Generic output node for grouped data from any node.
    group, composite, multi-output

    Use cases:
    - Aggregating multiple outputs from a single node
    - Passing varied data types as a single unit
    - Organizing related outputs in workflows
    """

    input: Any = None
    _value: Any = None

    async def process(self, context: Any) -> list[Any]:
        return self._value
