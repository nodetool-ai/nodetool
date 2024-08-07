from typing import Any, Literal

from pydantic import Field
from nodetool.metadata.types import ColumnDef, Tensor
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
    """Represents an audio file constant in the workflow.
    audio, file, mp3, wav

    Use cases:
    - Provide a fixed audio input for audio processing nodes
    - Reference a specific audio file in the workflow
    - Set default audio for testing or demonstration purposes
    """

    value: AudioRef = AudioRef()

    async def process(self, context: ProcessingContext) -> AudioRef:
        await context.refresh_uri(self.value)
        return self.value


class Bool(Constant):
    """Represents a boolean constant in the workflow.
    boolean, logic, flag

    Use cases:
    - Control flow decisions in conditional nodes
    - Toggle features or behaviors in the workflow
    - Set default boolean values for configuration
    """

    value: bool = False

    async def process(self, context: ProcessingContext) -> bool:
        return self.value


class DataFrame(Constant):
    """Represents a fixed DataFrame constant in the workflow.
    table, data, dataframe, pandas

    Use cases:
    - Provide static data for analysis or processing
    - Define lookup tables or reference data
    - Set sample data for testing or demonstration
    """

    value: DataFrameRef = Field(title="DataFrame", default=DataFrameRef())

    async def process(self, context: ProcessingContext) -> DataFrameRef:
        return self.value


class Dict(Constant):
    """Represents a dictionary constant in the workflow.
    dictionary, key-value, mapping

    Use cases:
    - Store configuration settings
    - Provide structured data inputs
    - Define parameter sets for other nodes
    """

    value: dict[(str, Any)] = {}

    async def process(self, context: ProcessingContext) -> dict[(str, Any)]:
        return self.value


class Image(Constant):
    """Represents an image file constant in the workflow.
    picture, photo, image

    Use cases:
    - Provide a fixed image input for image processing nodes
    - Reference a specific image file in the workflow
    - Set default image for testing or demonstration purposes
    """

    value: ImageRef = ImageRef()

    async def process(self, context: ProcessingContext) -> ImageRef:
        await context.refresh_uri(self.value)
        return self.value


class Integer(Constant):
    """Represents an integer constant in the workflow.
    number, integer, whole

    Use cases:
    - Set numerical parameters for calculations
    - Define counts, indices, or sizes
    - Provide fixed numerical inputs for processing
    """

    value: int = 0

    async def process(self, context: ProcessingContext) -> int:
        return self.value


class List(Constant):
    """Represents a list constant in the workflow.
    array, squence, collection

    Use cases:
    - Store multiple values of the same type
    - Provide ordered data inputs
    - Define sequences for iteration in other nodes
    """

    value: list[Any] = []

    async def process(self, context: ProcessingContext) -> list[Any]:
        return self.value


class Float(Constant):
    """Represents a floating-point number constant in the workflow.
    number, decimal, float

    Use cases:
    - Set numerical parameters for calculations
    - Define thresholds or limits
    - Provide fixed numerical inputs for processing
    """

    value: float = 0.0

    async def process(self, context: ProcessingContext) -> float:
        return self.value


class String(Constant):
    """Represents a string constant in the workflow.
    text, string, characters

    Use cases:
    - Provide fixed text inputs for processing
    - Define labels, identifiers, or names
    - Set default text values for configuration
    """

    value: str = ""

    async def process(self, context: ProcessingContext) -> str:
        return self.value


class Text(Constant):
    """Represents a text document constant in the workflow.
    document, markdown, content

    Use cases:
    - Provide larger text inputs for natural language processing
    - Store formatted content or documentation
    - Set default text documents for analysis
    """

    value: TextRef = TextRef()

    async def process(self, context: ProcessingContext) -> TextRef:
        return self.value


class Video(Constant):
    """Represents a video file constant in the workflow.
    video, movie, mp4, file

    Use cases:
    - Provide a fixed video input for video processing nodes
    - Reference a specific video file in the workflow
    - Set default video for testing or demonstration purposes
    """

    value: VideoRef = VideoRef()

    async def process(self, context: ProcessingContext) -> VideoRef:
        await context.refresh_uri(self.value)
        return self.value
