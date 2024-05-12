from typing import Any, Literal

from pydantic import Field
from nodetool.metadata.types import ImageTensor, Tensor, ThreadMessage
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
    value: list[ThreadMessage] = Field(
        default=[],
        description="The messages to display in the chat.",
    )

    async def process(self, context: ProcessingContext) -> list[ThreadMessage]:
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
    value: int = 0

    async def process(self, context: ProcessingContext) -> int:
        return self.value

    def get_json_schema(self):
        return {
            "type": "integer",
            "description": self.description,
        }


class FloatOutput(OutputNode):
    value: float = 0

    async def process(self, context: ProcessingContext) -> float:
        return self.value

    def get_json_schema(self):
        return {
            "type": "number",
            "description": self.description,
        }


class BooleanOutput(OutputNode):
    value: bool = False

    async def process(self, context: ProcessingContext) -> bool:
        return self.value

    def get_json_schema(self):
        return {
            "type": "boolean",
            "description": self.description,
        }


class StringOutput(OutputNode):
    value: str = ""

    async def process(self, context: ProcessingContext) -> str:
        return self.value

    def get_json_schema(self):
        return {
            "type": "string",
            "description": self.description,
        }


class TextOutput(OutputNode):
    value: TextRef = TextRef()

    async def process(self, context: ProcessingContext) -> TextRef:
        return self.value

    def get_json_schema(self):
        return {
            "type": "string",
            "description": self.description,
        }


class ImageOutput(OutputNode):
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
    value: VideoRef = VideoRef()

    async def process(self, context: ProcessingContext) -> VideoRef:
        return self.value


class TensorOutput(OutputNode):
    value: Tensor = Tensor()

    async def process(self, context: ProcessingContext) -> Tensor:
        return self.value


class ModelOutput(OutputNode):
    value: ModelRef = ModelRef()

    async def process(self, context: ProcessingContext) -> ModelRef:
        return self.value


class AudioOutput(OutputNode):
    value: AudioRef = AudioRef()

    async def process(self, context: ProcessingContext) -> AudioRef:
        return self.value


class DataframeOutput(OutputNode):
    value: DataframeRef = DataframeRef()

    async def process(self, context: ProcessingContext) -> DataframeRef:
        return self.value


class DictionaryOutput(OutputNode):
    value: dict[str, Any] = {}

    async def process(self, context: ProcessingContext) -> dict[str, Any]:
        return self.value


class GroupOutput(BaseNode):
    """
    Output node for any group node.
    """

    input: Any = None
    name: str = ""

    async def process(self, context: Any) -> list[Any]:
        return self.input
