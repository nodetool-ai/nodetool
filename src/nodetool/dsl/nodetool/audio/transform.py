from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ConcatAudio(GraphNode):
    a: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The first audio file.')
    b: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The second audio file.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.ConcatAudio"



class NormalizeAudio(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to normalize.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.NormalizeAudio"



class OverlayAudio(GraphNode):
    a: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The first audio file.')
    b: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The second audio file.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.OverlayAudio"



class RemoveSilence(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to process.')
    min_length: int | GraphNode | tuple[GraphNode, str] = Field(default=200, description='Minimum length of silence to be processed (in milliseconds).')
    threshold: int | GraphNode | tuple[GraphNode, str] = Field(default=-40, description='Silence threshold in dB (relative to full scale). Higher values detect more silence.')
    reduction_factor: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Factor to reduce silent parts (0.0 to 1.0). 0.0 keeps silence as is, 1.0 removes it completely.')
    crossfade: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='Duration of crossfade in milliseconds to apply between segments for smooth transitions.')
    min_silence_between_parts: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Minimum silence duration in milliseconds to maintain between non-silent segments')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.RemoveSilence"



class SliceAudio(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file.')
    start: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The start time in seconds.')
    end: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The end time in seconds.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.SliceAudio"



class Tone(GraphNode):
    frequency: float | GraphNode | tuple[GraphNode, str] = Field(default=440.0, description='Frequency of the tone in Hertz.')
    sampling_rate: int | GraphNode | tuple[GraphNode, str] = Field(default=44100, description='Sampling rate.')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Duration of the tone in seconds.')
    phi: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Initial phase of the waveform in radians.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.Tone"


