from typing import Any, Literal

from pydantic import Field
from nodetool.metadata.types import ImageTensor, Tensor, ThreadMessage
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import AudioRef
from nodetool.metadata.types import DataFrame
from nodetool.metadata.types import ModelRef
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import (
    OutputNode,
)
from nodetool.metadata.types import TextRef
from nodetool.metadata.types import VideoRef


class ListOutputNode(OutputNode):
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


class ChatOutputNode(OutputNode):
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


class IntOutputNode(OutputNode):
    value: int = 0

    async def process(self, context: ProcessingContext) -> int:
        return self.value

    def get_json_schema(self):
        return {
            "type": "integer",
            "description": self.description,
        }


class FloatOutputNode(OutputNode):
    value: float = 0

    async def process(self, context: ProcessingContext) -> float:
        return self.value

    def get_json_schema(self):
        return {
            "type": "number",
            "description": self.description,
        }


class BoolOutputNode(OutputNode):
    value: bool = False

    async def process(self, context: ProcessingContext) -> bool:
        return self.value

    def get_json_schema(self):
        return {
            "type": "boolean",
            "description": self.description,
        }


class StringOutputNode(OutputNode):
    value: str = ""

    async def process(self, context: ProcessingContext) -> str:
        return self.value

    def get_json_schema(self):
        return {
            "type": "string",
            "description": self.description,
        }


class TextOutputNode(OutputNode):
    value: TextRef = TextRef()

    async def process(self, context: ProcessingContext) -> TextRef:
        return self.value

    def get_json_schema(self):
        return {
            "type": "string",
            "description": self.description,
        }


class ImageOutputNode(OutputNode):
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


class ComfyImageOutputNode(OutputNode):
    value: ImageTensor = Field(default=ImageTensor(), description="A raw image tensor.")

    def assign_property(self, name: str, value: Any):
        setattr(self, name, value)

    async def process(self, context: ProcessingContext) -> ImageRef:
        import numpy as np

        image = self.value[0]  # type: ignore
        i = 255.0 * image.cpu().detach().numpy()  # type: ignore
        img = np.clip(i, 0, 255).astype(np.uint8)
        return await context.image_from_numpy(img)


class VideoOutputNode(OutputNode):
    value: VideoRef = VideoRef()

    async def process(self, context: ProcessingContext) -> VideoRef:
        return self.value


class TensorOutputNode(OutputNode):
    value: Tensor = Tensor()

    async def process(self, context: ProcessingContext) -> Tensor:
        return self.value


class ModelOutputNode(OutputNode):
    value: ModelRef = ModelRef()

    async def process(self, context: ProcessingContext) -> ModelRef:
        return self.value


class AudioOutputNode(OutputNode):
    value: AudioRef = AudioRef()

    async def process(self, context: ProcessingContext) -> AudioRef:
        return self.value


class DataframeOutputNode(OutputNode):
    value: DataFrame = DataFrame()

    async def process(self, context: ProcessingContext) -> DataFrame:
        return self.value


class DictOutputNode(OutputNode):
    value: dict[str, Any] = {}

    async def process(self, context: ProcessingContext) -> dict[str, Any]:
        return self.value
