from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ArrayOutput(GraphNode):
    """
    Output node for generic array data.
    array, numerical

    Use cases:
    - Outputting results from machine learning models
    - Representing complex numerical data structures
    """

    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.output.ArrayOutput"



class AudioOutput(GraphNode):
    """
    Output node for audio content references.
    audio, sound, media

    Use cases:
    - Displaying processed or generated audio
    - Passing audio data between workflow nodes
    - Returning results of audio analysis
    """

    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.output.AudioOutput"



class BooleanOutput(GraphNode):
    """
    Output node for a single boolean value.
    boolean, true, false, flag, condition, flow-control, branch, else, true, false, switch, toggle

    Use cases:
    - Returning binary results (yes/no, true/false)
    - Controlling conditional logic in workflows
    - Indicating success/failure of operations
    """

    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.output.BooleanOutput"



class DataframeOutput(GraphNode):
    """
    Output node for structured data references.
    dataframe, table, structured

    Use cases:
    - Outputting tabular data results
    - Passing structured data between analysis steps
    - Displaying data in table format
    """

    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.output.DataframeOutput"



class DictionaryOutput(GraphNode):
    """
    Output node for key-value pair data.
    dictionary, key-value, mapping

    Use cases:
    - Returning multiple named values
    - Passing complex data structures between nodes
    - Organizing heterogeneous output data
    """

    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.output.DictionaryOutput"



class DocumentOutput(GraphNode):
    """
    Output node for document content references.
    document, pdf, file

    Use cases:
    - Displaying processed or generated documents
    - Passing document data between workflow nodes
    - Returning results of document analysis
    """

    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: DocumentRef | GraphNode | tuple[GraphNode, str] = Field(default=DocumentRef(type='document', uri='', asset_id=None, data=None), description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.output.DocumentOutput"



class FloatOutput(GraphNode):
    """
    Output node for a single float value.
    float, decimal, number

    Use cases:
    - Returning decimal results (e.g. percentages, ratios)
    - Passing floating-point parameters between nodes
    - Displaying numeric metrics with decimal precision
    """

    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.output.FloatOutput"



class GroupOutput(GraphNode):
    """
    Generic output node for grouped data from any node.
    group, composite, multi-output

    Use cases:
    - Aggregating multiple outputs from a single node
    - Passing varied data types as a single unit
    - Organizing related outputs in workflows
    """

    input: Any | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.output.GroupOutput"



class ImageListOutput(GraphNode):
    """
    Output node for a list of image references.
    images, list, gallery

    Use cases:
    - Displaying multiple images in a grid
    - Returning image search results
    """

    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: list[ImageRef] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The images to display.')

    @classmethod
    def get_node_type(cls): return "nodetool.output.ImageListOutput"



class ImageOutput(GraphNode):
    """
    Output node for a single image reference.
    image, picture, visual

    Use cases:
    - Displaying a single processed or generated image
    - Passing image data between workflow nodes
    - Returning image analysis results
    """

    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.output.ImageOutput"



class IntegerOutput(GraphNode):
    """
    Output node for a single integer value.
    integer, number, count

    Use cases:
    - Returning numeric results (e.g. counts, indices)
    - Passing integer parameters between nodes
    - Displaying numeric metrics
    """

    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.output.IntegerOutput"



class ListOutput(GraphNode):
    """
    Output node for a list of arbitrary values.
    list, output, any

    Use cases:
    - Returning multiple results from a workflow
    - Aggregating outputs from multiple nodes
    """

    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.output.ListOutput"



class ModelOutput(GraphNode):
    """
    Output node for machine learning model references.
    model, ml, ai

    Use cases:
    - Passing trained models between workflow steps
    - Outputting newly created or fine-tuned models
    - Referencing models for later use in the workflow
    """

    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: ModelRef | GraphNode | tuple[GraphNode, str] = Field(default=ModelRef(type='model_ref', uri='', asset_id=None, data=None), description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.output.ModelOutput"



class StringOutput(GraphNode):
    """
    Output node for a single string value.
    string, text, output

    Use cases:
    - Returning text results or messages
    - Passing string parameters between nodes
    - Displaying short text outputs
    """

    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.output.StringOutput"



class TextOutput(GraphNode):
    """
    Output node for structured text content.
    text, content, document

    Use cases:
    - Returning longer text content or documents
    - Passing formatted text between processing steps
    - Displaying rich text output
    """

    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: TextRef | GraphNode | tuple[GraphNode, str] = Field(default=TextRef(type='text', uri='', asset_id=None, data=None), description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.output.TextOutput"



class VideoOutput(GraphNode):
    """
    Output node for video content references.
    video, media, clip

    Use cases:
    - Displaying processed or generated video content
    - Passing video data between workflow steps
    - Returning results of video analysis
    """

    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.output.VideoOutput"


