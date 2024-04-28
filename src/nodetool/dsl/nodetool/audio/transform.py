from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ConcatAudio(GraphNode):
    a: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='The first audio file.')
    b: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='The second audio file.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.ConcatAudio"



class NormalizeAudio(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='The audio file to normalize.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.NormalizeAudio"



class OverlayAudio(GraphNode):
    a: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='The first audio file.')
    b: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='The second audio file.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.OverlayAudio"



class RemoveSilence(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='The audio file to remove silence from.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.RemoveSilence"



class SliceAudio(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='The audio file.')
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


