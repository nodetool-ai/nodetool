from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Concat(GraphNode):
    a: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The first audio file.')
    b: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The second audio file.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.Concat"



class FadeIn(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to apply fade-in to.')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Duration of the fade-in effect in seconds.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.FadeIn"



class FadeOut(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to apply fade-out to.')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Duration of the fade-out effect in seconds.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.FadeOut"



class MonoToStereo(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The mono audio file to convert.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.MonoToStereo"



class Normalize(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to normalize.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.Normalize"



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



class Repeat(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to loop.')
    loops: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Number of times to loop the audio. Minimum 1 (plays once), maximum 100.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.Repeat"



class Reverse(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to reverse.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.Reverse"



class SliceAudio(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file.')
    start: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The start time in seconds.')
    end: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The end time in seconds.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.SliceAudio"



class StereoToMono(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The stereo audio file to convert.')
    method: str | GraphNode | tuple[GraphNode, str] = Field(default='average', description="Method to use for conversion: 'average', 'left', or 'right'.")
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.StereoToMono"



class Tone(GraphNode):
    frequency: float | GraphNode | tuple[GraphNode, str] = Field(default=440.0, description='Frequency of the tone in Hertz.')
    sampling_rate: int | GraphNode | tuple[GraphNode, str] = Field(default=44100, description='Sampling rate.')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Duration of the tone in seconds.')
    phi: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Initial phase of the waveform in radians.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.transform.Tone"


