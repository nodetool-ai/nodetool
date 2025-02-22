from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.replicate.audio.separate
import nodetool.nodes.replicate.audio.separate
import nodetool.nodes.replicate.audio.separate
import nodetool.nodes.replicate.audio.separate
import nodetool.nodes.replicate.audio.separate
import nodetool.nodes.replicate.audio.separate

class Demucs(GraphNode):
    """Demucs is an audio source separator created by Facebook Research."""

    Stem: typing.ClassVar[type] = nodetool.nodes.replicate.audio.separate.Demucs.Stem
    Model: typing.ClassVar[type] = nodetool.nodes.replicate.audio.separate.Demucs.Model
    Clip_mode: typing.ClassVar[type] = nodetool.nodes.replicate.audio.separate.Demucs.Clip_mode
    Mp3_preset: typing.ClassVar[type] = nodetool.nodes.replicate.audio.separate.Demucs.Mp3_preset
    Wav_format: typing.ClassVar[type] = nodetool.nodes.replicate.audio.separate.Demucs.Wav_format
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.audio.separate.Demucs.Output_format
    jobs: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Choose the number of parallel jobs to use for separation.')
    stem: nodetool.nodes.replicate.audio.separate.Demucs.Stem = Field(default=Stem.NONE, description='If you just want to isolate one stem, you can choose it here.')
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='Upload the file to be processed here.')
    model: nodetool.nodes.replicate.audio.separate.Demucs.Model = Field(default=Model.HTDEMUCS, description='Choose the demucs audio that proccesses your audio. The readme has more information on what to choose.')
    split: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Choose whether or not the audio should be split into chunks.')
    shifts: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Choose the amount random shifts for equivariant stabilization. This performs multiple predictions with random shifts of the input and averages them, which makes it x times slower.')
    overlap: float | GraphNode | tuple[GraphNode, str] = Field(default=0.25, description='Choose the amount of overlap between prediction windows.')
    segment: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Choose the segment length to use for separation.')
    clip_mode: nodetool.nodes.replicate.audio.separate.Demucs.Clip_mode = Field(default=Clip_mode.RESCALE, description='Choose the strategy for avoiding clipping. Rescale will rescale entire signal if necessary or clamp will allow hard clipping.')
    mp3_preset: nodetool.nodes.replicate.audio.separate.Demucs.Mp3_preset = Field(default=Mp3_preset._2, description='Choose the preset for the MP3 output. Higher is faster but worse quality. If MP3 is not selected as the output type, this has no effect.')
    wav_format: nodetool.nodes.replicate.audio.separate.Demucs.Wav_format = Field(default=Wav_format.INT24, description='Choose format for the WAV output. If WAV is not selected as the output type, this has no effect.')
    mp3_bitrate: int | GraphNode | tuple[GraphNode, str] = Field(default=320, description='Choose the bitrate for the MP3 output. Higher is better quality but larger file size. If MP3 is not selected as the output type, this has no effect.')
    output_format: nodetool.nodes.replicate.audio.separate.Demucs.Output_format = Field(default=Output_format.MP3, description='Choose the audio format you would like the result to be returned in.')

    @classmethod
    def get_node_type(cls): return "replicate.audio.separate.Demucs"


