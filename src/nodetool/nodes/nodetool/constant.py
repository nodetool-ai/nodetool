from typing import Any, Literal
from nodetool.metadata.types import Tensor
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import AudioRef
from nodetool.metadata.types import DataFrame
from nodetool.metadata.types import ModelRef
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import ConstantNode
from nodetool.metadata.types import TextRef
from nodetool.metadata.types import VideoRef


class AudioNode(ConstantNode):
    """
    Represents an audio file in the workflow.
    mp3, wav
    """

    value: AudioRef = AudioRef()

    async def process(self, context: ProcessingContext) -> AudioRef:
        await context.refresh_uri(self.value)
        return self.value


class BoolNode(ConstantNode):
    """
    Represents a fixed boolean value in the workflow.
    boolean
    """

    value: bool = False

    async def process(self, context: ProcessingContext) -> bool:
        return self.value


class DataFrameNode(ConstantNode):
    """
    Represents a fixed DataFrame in the workflow.
    data, table
    """

    value: DataFrame = DataFrame()

    async def process(self, context: ProcessingContext) -> DataFrame:
        return self.value


class DictNode(ConstantNode):
    """
    Represents a fixed dictionary in the workflow.
    dictionary, key, value
    """

    value: dict[(str, Any)] = {}

    async def process(self, context: ProcessingContext) -> dict[(str, Any)]:
        return self.value


class ImageNode(ConstantNode):
    """
    Represents a fixed image in the workflow.
    picture, photo
    """

    value: ImageRef = ImageRef()

    async def process(self, context: ProcessingContext) -> ImageRef:
        await context.refresh_uri(self.value)
        return self.value


class ListNode(ConstantNode):
    """
    Represents a fixed list in the workflow.
    array
    """

    value: list[Any] = []

    async def process(self, context: ProcessingContext) -> list[Any]:
        return self.value


class FloatNode(ConstantNode):
    """
    Represents a fixed float number in the workflow.
    number
    """

    value: float = 0.0

    async def process(self, context: ProcessingContext) -> float:
        return self.value


class StringNode(ConstantNode):
    """
    Represents a fixed string in the workflow.
    text
    """

    value: str = ""

    async def process(self, context: ProcessingContext) -> str:
        return self.value


class TextNode(ConstantNode):
    """
    Represents a text document in the workflow.
    document, markdown
    """

    value: TextRef = TextRef()

    async def process(self, context: ProcessingContext) -> TextRef:
        return self.value


class VideoNode(ConstantNode):
    """
    Represents a fixed video file in the workflow.
    movie, mp4, file
    """

    value: VideoRef = VideoRef()

    async def process(self, context: ProcessingContext) -> VideoRef:
        await context.refresh_uri(self.value)
        return self.value
