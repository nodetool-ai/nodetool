from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Audio(GraphNode):
    """Represents an audio file constant in the workflow.
    audio, file, mp3, wav

    Use cases:
    - Provide a fixed audio input for audio processing nodes
    - Reference a specific audio file in the workflow
    - Set default audio for testing or demonstration purposes
    """

    value: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.constant.Audio"



class Bool(GraphNode):
    """Represents a boolean constant in the workflow.
    boolean, logic, flag

    Use cases:
    - Control flow decisions in conditional nodes
    - Toggle features or behaviors in the workflow
    - Set default boolean values for configuration
    """

    value: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.constant.Bool"



class Constant(GraphNode):

    @classmethod
    def get_node_type(cls): return "nodetool.constant.Constant"



class DataFrame(GraphNode):
    """Represents a fixed DataFrame constant in the workflow.
    table, data, dataframe, pandas

    Use cases:
    - Provide static data for analysis or processing
    - Define lookup tables or reference data
    - Set sample data for testing or demonstration
    """

    value: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.constant.DataFrame"



class Date(GraphNode):
    """
    Make a date object from year, month, day.
    date, make, create
    """

    year: int | GraphNode | tuple[GraphNode, str] = Field(default=1900, description='Year of the date')
    month: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Month of the date')
    day: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Day of the date')

    @classmethod
    def get_node_type(cls): return "nodetool.constant.Date"



class DateTime(GraphNode):
    """
    Make a datetime object from year, month, day, hour, minute, second.
    datetime, make, create
    """

    year: int | GraphNode | tuple[GraphNode, str] = Field(default=1900, description='Year of the datetime')
    month: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Month of the datetime')
    day: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Day of the datetime')
    hour: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Hour of the datetime')
    minute: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Minute of the datetime')
    second: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Second of the datetime')
    microsecond: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Microsecond of the datetime')
    tzinfo: str | GraphNode | tuple[GraphNode, str] = Field(default='UTC', description='Timezone of the datetime')
    utc_offset: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='UTC offset of the datetime')

    @classmethod
    def get_node_type(cls): return "nodetool.constant.DateTime"



class Dict(GraphNode):
    """Represents a dictionary constant in the workflow.
    dictionary, key-value, mapping

    Use cases:
    - Store configuration settings
    - Provide structured data inputs
    - Define parameter sets for other nodes
    """

    value: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.constant.Dict"



class Document(GraphNode):
    """Represents a document constant in the workflow.
    document, pdf, word, docx
    """

    value: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=DocumentRef(type='document', uri='', asset_id=None, data=None), description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.constant.Document"



class Float(GraphNode):
    """Represents a floating-point number constant in the workflow.
    number, decimal, float

    Use cases:
    - Set numerical parameters for calculations
    - Define thresholds or limits
    - Provide fixed numerical inputs for processing
    """

    value: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.constant.Float"



class Image(GraphNode):
    """Represents an image file constant in the workflow.
    picture, photo, image

    Use cases:
    - Provide a fixed image input for image processing nodes
    - Reference a specific image file in the workflow
    - Set default image for testing or demonstration purposes
    """

    value: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.constant.Image"



class Integer(GraphNode):
    """Represents an integer constant in the workflow.
    number, integer, whole

    Use cases:
    - Set numerical parameters for calculations
    - Define counts, indices, or sizes
    - Provide fixed numerical inputs for processing
    """

    value: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.constant.Integer"



class JSON(GraphNode):
    """Represents a JSON constant in the workflow.
    json, object, dictionary
    """

    value: JSONRef | GraphNode | tuple[GraphNode, str] = Field(default=JSONRef(type='json', uri='', asset_id=None, data=None), description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.constant.JSON"



class List(GraphNode):
    """Represents a list constant in the workflow.
    array, sequence, collection

    Use cases:
    - Store multiple values of the same type
    - Provide ordered data inputs
    - Define sequences for iteration in other nodes
    """

    value: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.constant.List"



class String(GraphNode):
    """Represents a string constant in the workflow.
    text, string, characters

    Use cases:
    - Provide fixed text inputs for processing
    - Define labels, identifiers, or names
    - Set default text values for configuration
    """

    value: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.constant.String"



class Video(GraphNode):
    """Represents a video file constant in the workflow.
    video, movie, mp4, file

    Use cases:
    - Provide a fixed video input for video processing nodes
    - Reference a specific video file in the workflow
    - Set default video for testing or demonstration purposes
    """

    value: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.constant.Video"


