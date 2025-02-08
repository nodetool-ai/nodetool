from datetime import datetime
from typing import Any, Literal

from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import AudioRef, Datetime, DocumentRef, JSONRef
from nodetool.metadata.types import Date as DateType
from nodetool.metadata.types import DataframeRef as DataFrameRef
from nodetool.metadata.types import ImageRef
from nodetool.metadata.types import TextRef
from nodetool.metadata.types import VideoRef
from datetime import date


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


class Document(Constant):
    """Represents a document constant in the workflow.
    document, pdf, word, docx
    """

    value: DocumentRef = Field(title="Document", default=DocumentRef())

    async def process(self, context: ProcessingContext) -> DocumentRef:
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
    array, sequence, collection

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


class Date(BaseNode):
    """
    Make a date object from year, month, day.
    date, make, create
    """

    year: int = Field(default=1900, description="Year of the date")
    month: int = Field(default=1, description="Month of the date")
    day: int = Field(default=1, description="Day of the date")

    async def process(self, context: ProcessingContext) -> DateType:
        return DateType.from_date(date(self.year, self.month, self.day))  # type: ignore


class DateTime(BaseNode):
    """
    Make a datetime object from year, month, day, hour, minute, second.
    datetime, make, create
    """

    year: int = Field(default=1900, description="Year of the datetime")
    month: int = Field(default=1, description="Month of the datetime")
    day: int = Field(default=1, description="Day of the datetime")
    hour: int = Field(default=0, description="Hour of the datetime")
    minute: int = Field(default=0, description="Minute of the datetime")
    second: int = Field(default=0, description="Second of the datetime")
    microsecond: int = Field(default=0, description="Microsecond of the datetime")
    tzinfo: str = Field(default="UTC", description="Timezone of the datetime")
    utc_offset: int = Field(default=0, description="UTC offset of the datetime")

    async def process(self, context: ProcessingContext) -> Datetime:
        return Datetime(
            year=self.year,
            month=self.month,
            day=self.day,
            hour=self.hour,
            minute=self.minute,
            second=self.second,
            microsecond=self.microsecond,
            tzinfo=self.tzinfo,
            utc_offset=self.utc_offset,
        )


class JSON(Constant):
    """Represents a JSON constant in the workflow.
    json, object, dictionary
    """

    value: JSONRef = JSONRef()

    async def process(self, context: ProcessingContext) -> JSONRef:
        return self.value
