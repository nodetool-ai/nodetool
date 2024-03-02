from typing import Any, Literal
from genflow.metadata.types import Tensor
from genflow.workflows.processing_context import ProcessingContext
from genflow.metadata.types import AudioRef
from genflow.metadata.types import DataFrame
from genflow.metadata.types import ModelRef
from genflow.metadata.types import ImageRef
from genflow.workflows.genflow_node import (
    OutputNode,
)
from genflow.metadata.types import TextRef
from genflow.metadata.types import VideoRef


class ListOutputNode(OutputNode):
    value: list[Any] = []

    async def process(self, context: ProcessingContext):
        return self.value


class IntOutputNode(OutputNode):
    value: int = 0

    async def process(self, context: ProcessingContext):
        return self.value


class FloatOutputNode(OutputNode):
    value: float = 0

    async def process(self, context: ProcessingContext):
        return self.value


class BoolOutputNode(OutputNode):
    value: bool = False

    async def process(self, context: ProcessingContext):
        return self.value


class StringOutputNode(OutputNode):
    value: str = ""

    async def process(self, context: ProcessingContext):
        return self.value


class TextOutputNode(OutputNode):
    value: TextRef = TextRef()

    async def process(self, context: ProcessingContext):
        return self.value


class ImageOutputNode(OutputNode):
    value: ImageRef = ImageRef()

    async def process(self, context: ProcessingContext):
        return self.value


class VideoOutputNode(OutputNode):
    value: VideoRef = VideoRef()

    async def process(self, context: ProcessingContext):
        return self.value


class TensorOutputNode(OutputNode):
    value: Tensor = Tensor()

    async def process(self, context: ProcessingContext):
        return self.value


class ModelOutputNode(OutputNode):
    value: ModelRef = ModelRef()

    async def process(self, context: ProcessingContext):
        return self.value


class AudioOutputNode(OutputNode):
    value: AudioRef = AudioRef()

    async def process(self, context: ProcessingContext):
        return self.value


class DataframeOutputNode(OutputNode):
    value: DataFrame = DataFrame()

    async def process(self, context: ProcessingContext):
        return self.value


class DictOutputNode(OutputNode):
    value: dict[str, Any] = {}

    async def process(self, context: ProcessingContext):
        return self.value
