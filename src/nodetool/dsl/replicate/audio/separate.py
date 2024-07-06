from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.replicate.audio.separate import Stem
from nodetool.nodes.replicate.audio.separate import Model
from nodetool.nodes.replicate.audio.separate import Clip_mode
from nodetool.nodes.replicate.audio.separate import Mp3_preset
from nodetool.nodes.replicate.audio.separate import Wav_format
from nodetool.nodes.replicate.audio.separate import Output_format

class Demucs(GraphNode):
    jobs: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Choose the number of parallel jobs to use for separation.')
    stem: Stem | GraphNode | tuple[GraphNode, str] = Field(default=Stem('none'), description='If you just want to isolate one stem, you can choose it here.')
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='Upload the file to be processed here.')
    model: Model | GraphNode | tuple[GraphNode, str] = Field(default=Model('htdemucs'), description='Choose the demucs audio that proccesses your audio. The readme has more information on what to choose.')
    split: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Choose whether or not the audio should be split into chunks.')
    shifts: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Choose the amount random shifts for equivariant stabilization. This performs multiple predictions with random shifts of the input and averages them, which makes it x times slower.')
    overlap: float | GraphNode | tuple[GraphNode, str] = Field(default=0.25, description='Choose the amount of overlap between prediction windows.')
    segment: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Choose the segment length to use for separation.')
    clip_mode: Clip_mode | GraphNode | tuple[GraphNode, str] = Field(default=Clip_mode('rescale'), description='Choose the strategy for avoiding clipping. Rescale will rescale entire signal if necessary or clamp will allow hard clipping.')
    mp3_preset: Mp3_preset | GraphNode | tuple[GraphNode, str] = Field(default=Mp3_preset(2), description='Choose the preset for the MP3 output. Higher is faster but worse quality. If MP3 is not selected as the output type, this has no effect.')
    wav_format: Wav_format | GraphNode | tuple[GraphNode, str] = Field(default=Wav_format('int24'), description='Choose format for the WAV output. If WAV is not selected as the output type, this has no effect.')
    mp3_bitrate: int | GraphNode | tuple[GraphNode, str] = Field(default=320, description='Choose the bitrate for the MP3 output. Higher is better quality but larger file size. If MP3 is not selected as the output type, this has no effect.')
    output_format: Output_format | GraphNode | tuple[GraphNode, str] = Field(default=Output_format('mp3'), description='Choose the audio format you would like the result to be returned in.')
    @classmethod
    def get_node_type(cls): return "replicate.audio.separate.Demucs"


