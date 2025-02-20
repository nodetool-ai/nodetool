from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ConvertToArray(GraphNode):
    """
    Converts an audio file to a Array for further processing.
    audio, conversion, tensor

    Use cases:
    - Prepare audio data for machine learning models
    - Enable signal processing operations on audio
    - Convert audio to a format suitable for spectral analysisr
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to convert to a tensor.')

    @classmethod
    def get_node_type(cls): return "lib.audio.conversion.ConvertToArray"



class CreateSilence(GraphNode):
    """
    Creates a silent audio file with a specified duration.
    audio, silence, empty

    Use cases:
    - Generate placeholder audio files
    - Create audio segments for padding or spacing
    - Add silence to the beginning or end of audio files
    """

    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The duration of the silence in seconds.')

    @classmethod
    def get_node_type(cls): return "lib.audio.conversion.CreateSilence"



class Trim(GraphNode):
    """
    Trim an audio file to a specified duration.
    audio, trim, cut

    Use cases:
    - Remove silence from the beginning or end of audio files
    - Extract specific segments from audio files
    - Prepare audio data for machine learning models
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to trim.')
    start: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The start time of the trimmed audio in seconds.')
    end: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The end time of the trimmed audio in seconds.')

    @classmethod
    def get_node_type(cls): return "lib.audio.conversion.Trim"


