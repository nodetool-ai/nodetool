from typing import Any, Literal
from nodetool.metadata.types import Tensor
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import AudioRef

from nodetool.metadata.types import DataframeRef as DataFrameRef
from nodetool.metadata.types import ModelRef
from nodetool.metadata.types import ImageRef
from nodetool.metadata.types import TextRef
from nodetool.metadata.types import VideoRef


class Constant(BaseNode):
    pass


class Audio(Constant):
    """
    Represents an audio file in the workflow.
    mp3, wav
    """

    value: AudioRef = AudioRef()

    async def process(self, context: ProcessingContext) -> AudioRef:
        await context.refresh_uri(self.value)
        return self.value


class Bool(Constant):
    """
    Represents a fixed boolean value in the workflow.
    boolean
    """

    value: bool = False

    async def process(self, context: ProcessingContext) -> bool:
        return self.value


class DataFrame(Constant):
    """
    Represents a fixed DataFrame in the workflow.
    table, data, dataframe
    """

    value: DataFrameRef = DataFrameRef()

    async def process(self, context: ProcessingContext) -> DataFrameRef:
        return self.value


class Dict(Constant):
    """
    Represents a fixed dictionary in the workflow.
    dictionary, key, value
    """

    value: dict[(str, Any)] = {}

    async def process(self, context: ProcessingContext) -> dict[(str, Any)]:
        return self.value


class Image(Constant):
    """
    Represents a fixed image in the workflow.
    picture, photo
    """

    value: ImageRef = ImageRef()

    async def process(self, context: ProcessingContext) -> ImageRef:
        await context.refresh_uri(self.value)
        return self.value


class List(Constant):
    """
    Represents a fixed list in the workflow.
    array
    """

    value: list[Any] = []

    async def process(self, context: ProcessingContext) -> list[Any]:
        return self.value


class Float(Constant):
    """
    Represents a fixed float number in the workflow.
    number
    """

    value: float = 0.0

    async def process(self, context: ProcessingContext) -> float:
        return self.value


class String(Constant):
    """
    Represents a fixed string in the workflow.
    text
    """

    value: str = ""

    async def process(self, context: ProcessingContext) -> str:
        return self.value


class Text(Constant):
    """
    Represents a text document in the workflow.
    document, markdown
    """

    value: TextRef = TextRef()

    async def process(self, context: ProcessingContext) -> TextRef:
        return self.value


class Video(Constant):
    """
    Represents a fixed video file in the workflow.
    movie, mp4, file
    """

    value: VideoRef = VideoRef()

    async def process(self, context: ProcessingContext) -> VideoRef:
        await context.refresh_uri(self.value)
        return self.value
