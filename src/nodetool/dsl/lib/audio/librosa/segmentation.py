from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class DetectOnsets(GraphNode):
    """
    Detect onsets in an audio file.
    audio, analysis, segmentation

    Use cases:
    - Identify beat locations in music
    - Segment audio based on changes in energy or spectral content
    - Prepare audio for further processing or analysis
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The input audio file to analyze.')
    hop_length: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Number of samples between successive frames.')

    @classmethod
    def get_node_type(cls): return "lib.audio.librosa.segmentation.DetectOnsets"



class SaveAudioSegments(GraphNode):
    """
    Save a list of audio segments to a specified folder.
    audio, save, export

    Use cases:
    - Export segmented audio files for further processing or analysis
    - Create a dataset of audio clips from a longer recording
    - Organize audio segments into a structured format
    """

    segments: list[AudioRef] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The list of audio segments to save.')
    output_folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None, data=None), description='The folder to save the audio segments in.')
    name_prefix: str | GraphNode | tuple[GraphNode, str] = Field(default='segment', description='Prefix for the saved audio file names.')

    @classmethod
    def get_node_type(cls): return "lib.audio.librosa.segmentation.SaveAudioSegments"



class SegmentAudioByOnsets(GraphNode):
    """
    Segment an audio file based on detected onsets.
    audio, segmentation, processing

    Use cases:
    - Split a long audio recording into individual segments
    - Prepare audio clips for further analysis or processing
    - Extract specific parts of an audio file based on onset locations
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The input audio file to segment.')
    onsets: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='The onset times detected in the audio.')
    min_segment_length: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Minimum length of a segment in seconds.')

    @classmethod
    def get_node_type(cls): return "lib.audio.librosa.segmentation.SegmentAudioByOnsets"


