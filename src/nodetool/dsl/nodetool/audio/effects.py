from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Bitcrush(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to process.')
    bit_depth: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='The bit depth to reduce the audio to. Lower values create more distortion.')
    sample_rate_reduction: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Factor by which to reduce the sample rate. Higher values create more aliasing.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.effects.Bitcrush"



class Compress(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to process.')
    threshold: float | GraphNode | tuple[GraphNode, str] = Field(default=-20.0, description='Threshold in dB above which compression is applied.')
    ratio: float | GraphNode | tuple[GraphNode, str] = Field(default=4.0, description='Compression ratio. Higher values result in more compression.')
    attack: float | GraphNode | tuple[GraphNode, str] = Field(default=5.0, description='Attack time in milliseconds.')
    release: float | GraphNode | tuple[GraphNode, str] = Field(default=50.0, description='Release time in milliseconds.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.effects.Compress"



class Delay(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to process.')
    delay_seconds: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Delay time in seconds.')
    feedback: float | GraphNode | tuple[GraphNode, str] = Field(default=0.3, description='Amount of delayed signal fed back into the effect.')
    mix: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Mix between the dry (original) and wet (delayed) signals.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.effects.Delay"



class Distortion(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to process.')
    drive_db: float | GraphNode | tuple[GraphNode, str] = Field(default=25.0, description='Amount of distortion to apply in decibels.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.effects.Distortion"



class Gain(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to process.')
    gain_db: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Gain to apply in decibels. Positive values increase volume, negative values decrease it.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.effects.Gain"



class HighPassFilter(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to process.')
    cutoff_frequency_hz: float | GraphNode | tuple[GraphNode, str] = Field(default=80.0, description='The cutoff frequency of the high-pass filter in Hz.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.effects.HighPassFilter"



class HighShelfFilter(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to process.')
    cutoff_frequency_hz: float | GraphNode | tuple[GraphNode, str] = Field(default=5000.0, description='The cutoff frequency of the shelf filter in Hz.')
    gain_db: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The gain to apply to the frequencies above the cutoff, in dB.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.effects.HighShelfFilter"



class Limiter(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to process.')
    threshold_db: float | GraphNode | tuple[GraphNode, str] = Field(default=-2.0, description='Threshold in dB above which the limiter is applied.')
    release_ms: float | GraphNode | tuple[GraphNode, str] = Field(default=250.0, description='Release time in milliseconds.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.effects.Limiter"



class LowPassFilter(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to process.')
    cutoff_frequency_hz: float | GraphNode | tuple[GraphNode, str] = Field(default=5000.0, description='The cutoff frequency of the low-pass filter in Hz.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.effects.LowPassFilter"



class LowShelfFilter(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to process.')
    cutoff_frequency_hz: float | GraphNode | tuple[GraphNode, str] = Field(default=200.0, description='The cutoff frequency of the shelf filter in Hz.')
    gain_db: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The gain to apply to the frequencies below the cutoff, in dB.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.effects.LowShelfFilter"



class NoiseGate(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to process.')
    threshold_db: float | GraphNode | tuple[GraphNode, str] = Field(default=-50.0, description='Threshold in dB below which the gate is active.')
    attack_ms: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Attack time in milliseconds.')
    release_ms: float | GraphNode | tuple[GraphNode, str] = Field(default=100.0, description='Release time in milliseconds.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.effects.NoiseGate"



class PeakFilter(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to process.')
    cutoff_frequency_hz: float | GraphNode | tuple[GraphNode, str] = Field(default=1000.0, description='The cutoff frequency of the band-pass filter in Hz.')
    q_factor: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The Q factor, determining the width of the band. Higher values create narrower bands.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.effects.PeakFilter"



class Phaser(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to process.')
    rate_hz: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Rate of the phaser effect in Hz.')
    depth: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Depth of the phaser effect.')
    centre_frequency_hz: float | GraphNode | tuple[GraphNode, str] = Field(default=1300.0, description='Centre frequency of the phaser in Hz.')
    feedback: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Feedback of the phaser effect. Negative values invert the phase.')
    mix: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Mix between the dry (original) and wet (effected) signals.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.effects.Phaser"



class PitchShift(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to process.')
    semitones: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Number of semitones to shift the pitch. Positive values shift up, negative values shift down.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.effects.PitchShift"



class Reverb(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to process.')
    room_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Size of the simulated room. Higher values create larger spaces.')
    damping: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Amount of high frequency absorption. Higher values create a duller sound.')
    wet_level: float | GraphNode | tuple[GraphNode, str] = Field(default=0.15, description='Level of the reverb effect in the output.')
    dry_level: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Level of the original signal in the output.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.effects.Reverb"



class TimeStretch(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to process.')
    rate: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Time stretch factor. Values > 1 speed up, < 1 slow down.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.effects.TimeStretch"


