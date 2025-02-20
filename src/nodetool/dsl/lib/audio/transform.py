from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AudioMixer(GraphNode):
    """
    Mix up to 5 audio tracks together with individual volume controls.
    audio, mix, volume, combine, blend, layer, add, overlay

    Use cases:
    - Mix multiple audio tracks into a single output
    - Create layered soundscapes
    - Combine music, voice, and sound effects
    - Adjust individual track volumes
    """

    track1: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='First audio track to mix.')
    track2: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='Second audio track to mix.')
    track3: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='Third audio track to mix.')
    track4: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='Fourth audio track to mix.')
    track5: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='Fifth audio track to mix.')
    volume1: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Volume for track 1. 1.0 is original volume.')
    volume2: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Volume for track 2. 1.0 is original volume.')
    volume3: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Volume for track 3. 1.0 is original volume.')
    volume4: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Volume for track 4. 1.0 is original volume.')
    volume5: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Volume for track 5. 1.0 is original volume.')

    @classmethod
    def get_node_type(cls): return "lib.audio.transform.AudioMixer"



class Concat(GraphNode):
    """
    Concatenates two audio files together.
    audio, edit, join, +

    Use cases:
    - Combine multiple audio clips into a single file
    - Create longer audio tracks from shorter segments
    """

    a: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The first audio file.')
    b: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The second audio file.')

    @classmethod
    def get_node_type(cls): return "lib.audio.transform.Concat"



class ConcatList(GraphNode):
    """
    Concatenates multiple audio files together in sequence.
    audio, edit, join, multiple, +

    Use cases:
    - Combine multiple audio clips into a single file
    - Create longer audio tracks from multiple segments
    - Chain multiple audio files in order
    """

    audio_files: list[AudioRef] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of audio files to concatenate in sequence.')

    @classmethod
    def get_node_type(cls): return "lib.audio.transform.ConcatList"



class FadeIn(GraphNode):
    """
    Applies a fade-in effect to the beginning of an audio file.
    audio, edit, transition

    Use cases:
    - Create smooth introductions to audio tracks
    - Gradually increase volume at the start of a clip
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to apply fade-in to.')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Duration of the fade-in effect in seconds.')

    @classmethod
    def get_node_type(cls): return "lib.audio.transform.FadeIn"



class FadeOut(GraphNode):
    """
    Applies a fade-out effect to the end of an audio file.
    audio, edit, transition

    Use cases:
    - Create smooth endings to audio tracks
    - Gradually decrease volume at the end of a clip
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to apply fade-out to.')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Duration of the fade-out effect in seconds.')

    @classmethod
    def get_node_type(cls): return "lib.audio.transform.FadeOut"



class MonoToStereo(GraphNode):
    """
    Converts a mono audio signal to stereo.
    audio, convert, channels

    Use cases:
    - Expand mono recordings for stereo playback systems
    - Prepare audio for further stereo processing
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The mono audio file to convert.')

    @classmethod
    def get_node_type(cls): return "lib.audio.transform.MonoToStereo"



class Normalize(GraphNode):
    """
    Normalizes the volume of an audio file.
    audio, fix, dynamics, volume

    Use cases:
    - Ensure consistent volume across multiple audio files
    - Adjust overall volume level before further processing
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to normalize.')

    @classmethod
    def get_node_type(cls): return "lib.audio.transform.Normalize"



class OverlayAudio(GraphNode):
    """
    Overlays two audio files together.
    audio, edit, transform

    Use cases:
    - Mix background music with voice recording
    - Layer sound effects over an existing audio track
    """

    a: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The first audio file.')
    b: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The second audio file.')

    @classmethod
    def get_node_type(cls): return "lib.audio.transform.OverlayAudio"



class RemoveSilence(GraphNode):
    """
    Removes or shortens silence in an audio file with smooth transitions.
    audio, edit, clean

    Use cases:
    - Trim silent parts from beginning/end of recordings
    - Remove or shorten long pauses between speech segments
    - Apply crossfade for smooth transitions
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to process.')
    min_length: int | GraphNode | tuple[GraphNode, str] = Field(default=200, description='Minimum length of silence to be processed (in milliseconds).')
    threshold: int | GraphNode | tuple[GraphNode, str] = Field(default=-40, description='Silence threshold in dB (relative to full scale). Higher values detect more silence.')
    reduction_factor: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Factor to reduce silent parts (0.0 to 1.0). 0.0 keeps silence as is, 1.0 removes it completely.')
    crossfade: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='Duration of crossfade in milliseconds to apply between segments for smooth transitions.')
    min_silence_between_parts: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='Minimum silence duration in milliseconds to maintain between non-silent segments')

    @classmethod
    def get_node_type(cls): return "lib.audio.transform.RemoveSilence"



class Repeat(GraphNode):
    """
    Loops an audio file a specified number of times.
    audio, edit, repeat

    Use cases:
    - Create repeating background sounds or music
    - Extend short audio clips to fill longer durations
    - Generate rhythmic patterns from short samples
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to loop.')
    loops: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Number of times to loop the audio. Minimum 1 (plays once), maximum 100.')

    @classmethod
    def get_node_type(cls): return "lib.audio.transform.Repeat"



class Reverse(GraphNode):
    """
    Reverses an audio file.
    audio, edit, transform

    Use cases:
    - Create reverse audio effects
    - Generate backwards speech or music
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to reverse.')

    @classmethod
    def get_node_type(cls): return "lib.audio.transform.Reverse"



class SliceAudio(GraphNode):
    """
    Extracts a section of an audio file.
    audio, edit, trim

    Use cases:
    - Cut out a specific clip from a longer audio file
    - Remove unwanted portions from beginning or end
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file.')
    start: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The start time in seconds.')
    end: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The end time in seconds.')

    @classmethod
    def get_node_type(cls): return "lib.audio.transform.SliceAudio"



class StereoToMono(GraphNode):
    """
    Converts a stereo audio signal to mono.
    audio, convert, channels

    Use cases:
    - Reduce file size for mono-only applications
    - Simplify audio for certain processing tasks
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The stereo audio file to convert.')
    method: str | GraphNode | tuple[GraphNode, str] = Field(default='average', description="Method to use for conversion: 'average', 'left', or 'right'.")

    @classmethod
    def get_node_type(cls): return "lib.audio.transform.StereoToMono"



class Tone(GraphNode):
    """
    Generates a constant tone signal.
    audio, generate, sound

    Use cases:
    - Create test tones for audio equipment calibration
    - Produce reference pitches for musical applications
    """

    frequency: float | GraphNode | tuple[GraphNode, str] = Field(default=440.0, description='Frequency of the tone in Hertz.')
    sampling_rate: int | GraphNode | tuple[GraphNode, str] = Field(default=44100, description='Sampling rate.')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Duration of the tone in seconds.')
    phi: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Initial phase of the waveform in radians.')

    @classmethod
    def get_node_type(cls): return "lib.audio.transform.Tone"


