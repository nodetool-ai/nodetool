from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Bitcrush(GraphNode):
    """
    Applies a bitcrushing effect to an audio file, reducing bit depth and/or sample rate.
    audio, effect, distortion

    Use cases:
    - Create lo-fi or retro-style audio effects
    - Simulate vintage digital audio equipment
    - Add digital distortion and artifacts to sounds
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to process.')
    bit_depth: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='The bit depth to reduce the audio to. Lower values create more distortion.')
    sample_rate_reduction: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Factor by which to reduce the sample rate. Higher values create more aliasing.')

    @classmethod
    def get_node_type(cls): return "lib.audio.pedalboard.Bitcrush"



class Compress(GraphNode):
    """
    Applies dynamic range compression to an audio file.
    audio, effect, dynamics

    Use cases:
    - Even out volume levels in a recording
    - Increase perceived loudness of audio
    - Control peaks in audio signals
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to process.')
    threshold: float | GraphNode | tuple[GraphNode, str] = Field(default=-20.0, description='Threshold in dB above which compression is applied.')
    ratio: float | GraphNode | tuple[GraphNode, str] = Field(default=4.0, description='Compression ratio. Higher values result in more compression.')
    attack: float | GraphNode | tuple[GraphNode, str] = Field(default=5.0, description='Attack time in milliseconds.')
    release: float | GraphNode | tuple[GraphNode, str] = Field(default=50.0, description='Release time in milliseconds.')

    @classmethod
    def get_node_type(cls): return "lib.audio.pedalboard.Compress"



class Delay(GraphNode):
    """
    Applies a delay effect to an audio file.
    audio, effect, time-based

    Use cases:
    - Create echo effects
    - Add spaciousness to sounds
    - Produce rhythmic patterns
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to process.')
    delay_seconds: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Delay time in seconds.')
    feedback: float | GraphNode | tuple[GraphNode, str] = Field(default=0.3, description='Amount of delayed signal fed back into the effect.')
    mix: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Mix between the dry (original) and wet (delayed) signals.')

    @classmethod
    def get_node_type(cls): return "lib.audio.pedalboard.Delay"



class Distortion(GraphNode):
    """
    Applies a distortion effect to an audio file.
    audio, effect, distortion

    Use cases:
    - Add grit and character to instruments
    - Create aggressive sound effects
    - Simulate overdriven amplifiers
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to process.')
    drive_db: float | GraphNode | tuple[GraphNode, str] = Field(default=25.0, description='Amount of distortion to apply in decibels.')

    @classmethod
    def get_node_type(cls): return "lib.audio.pedalboard.Distortion"



class Gain(GraphNode):
    """
    Applies a gain (volume adjustment) to an audio file.
    audio, effect, volume

    Use cases:
    - Increase or decrease overall volume of audio
    - Balance levels between different audio tracks
    - Prepare audio for further processing
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to process.')
    gain_db: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Gain to apply in decibels. Positive values increase volume, negative values decrease it.')

    @classmethod
    def get_node_type(cls): return "lib.audio.pedalboard.Gain"



class HighPassFilter(GraphNode):
    """
    Applies a high-pass filter to attenuate frequencies below a cutoff point.
    audio, effect, equalizer

    Use cases:
    - Remove low-frequency rumble or noise
    - Clean up the low end of a mix
    - Create filter sweep effects
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to process.')
    cutoff_frequency_hz: float | GraphNode | tuple[GraphNode, str] = Field(default=80.0, description='The cutoff frequency of the high-pass filter in Hz.')

    @classmethod
    def get_node_type(cls): return "lib.audio.pedalboard.HighPassFilter"



class HighShelfFilter(GraphNode):
    """
    Applies a high shelf filter to boost or cut high frequencies.
    audio, effect, equalizer

    Use cases:
    - Enhance or reduce treble frequencies
    - Add brightness or air to audio
    - Tame harsh high frequencies
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to process.')
    cutoff_frequency_hz: float | GraphNode | tuple[GraphNode, str] = Field(default=5000.0, description='The cutoff frequency of the shelf filter in Hz.')
    gain_db: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The gain to apply to the frequencies above the cutoff, in dB.')

    @classmethod
    def get_node_type(cls): return "lib.audio.pedalboard.HighShelfFilter"



class Limiter(GraphNode):
    """
    Applies a limiter effect to an audio file.
    audio, effect, dynamics

    Use cases:
    - Prevent audio clipping
    - Increase perceived loudness without distortion
    - Control dynamic range of audio
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to process.')
    threshold_db: float | GraphNode | tuple[GraphNode, str] = Field(default=-2.0, description='Threshold in dB above which the limiter is applied.')
    release_ms: float | GraphNode | tuple[GraphNode, str] = Field(default=250.0, description='Release time in milliseconds.')

    @classmethod
    def get_node_type(cls): return "lib.audio.pedalboard.Limiter"



class LowPassFilter(GraphNode):
    """
    Applies a low-pass filter to attenuate frequencies above a cutoff point.
    audio, effect, equalizer

    Use cases:
    - Reduce high-frequency harshness
    - Simulate muffled or distant sounds
    - Create dub-style effects
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to process.')
    cutoff_frequency_hz: float | GraphNode | tuple[GraphNode, str] = Field(default=5000.0, description='The cutoff frequency of the low-pass filter in Hz.')

    @classmethod
    def get_node_type(cls): return "lib.audio.pedalboard.LowPassFilter"



class LowShelfFilter(GraphNode):
    """
    Applies a low shelf filter to boost or cut low frequencies.
    audio, effect, equalizer

    Use cases:
    - Enhance or reduce bass frequencies
    - Shape the low-end response of audio
    - Compensate for speaker or room deficiencies
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to process.')
    cutoff_frequency_hz: float | GraphNode | tuple[GraphNode, str] = Field(default=200.0, description='The cutoff frequency of the shelf filter in Hz.')
    gain_db: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The gain to apply to the frequencies below the cutoff, in dB.')

    @classmethod
    def get_node_type(cls): return "lib.audio.pedalboard.LowShelfFilter"



class NoiseGate(GraphNode):
    """
    Applies a noise gate effect to an audio file.
    audio, effect, dynamics

    Use cases:
    - Reduce background noise in recordings
    - Clean up audio tracks with unwanted low-level sounds
    - Create rhythmic effects by gating sustained sounds
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to process.')
    threshold_db: float | GraphNode | tuple[GraphNode, str] = Field(default=-50.0, description='Threshold in dB below which the gate is active.')
    attack_ms: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Attack time in milliseconds.')
    release_ms: float | GraphNode | tuple[GraphNode, str] = Field(default=100.0, description='Release time in milliseconds.')

    @classmethod
    def get_node_type(cls): return "lib.audio.pedalboard.NoiseGate"



class PeakFilter(GraphNode):
    """
    Applies a peak filter to boost or cut a specific frequency range.
    audio, effect, equalizer

    Use cases:
    - Isolate specific frequency ranges
    - Create telephone or radio voice effects
    - Focus on particular instrument ranges in a mix
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to process.')
    cutoff_frequency_hz: float | GraphNode | tuple[GraphNode, str] = Field(default=1000.0, description='The cutoff frequency of the band-pass filter in Hz.')
    q_factor: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The Q factor, determining the width of the band. Higher values create narrower bands.')

    @classmethod
    def get_node_type(cls): return "lib.audio.pedalboard.PeakFilter"



class Phaser(GraphNode):
    """
    Applies a phaser effect to an audio file.
    audio, effect, modulation

    Use cases:
    - Create sweeping, swooshing sounds
    - Add movement to static sounds
    - Produce psychedelic or space-like effects
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to process.')
    rate_hz: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Rate of the phaser effect in Hz.')
    depth: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Depth of the phaser effect.')
    centre_frequency_hz: float | GraphNode | tuple[GraphNode, str] = Field(default=1300.0, description='Centre frequency of the phaser in Hz.')
    feedback: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Feedback of the phaser effect. Negative values invert the phase.')
    mix: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Mix between the dry (original) and wet (effected) signals.')

    @classmethod
    def get_node_type(cls): return "lib.audio.pedalboard.Phaser"



class PitchShift(GraphNode):
    """
    Shifts the pitch of an audio file without changing its duration.
    audio, effect, pitch

    Use cases:
    - Transpose audio to a different key
    - Create harmonies or vocal effects
    - Adjust instrument tuning
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to process.')
    semitones: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Number of semitones to shift the pitch. Positive values shift up, negative values shift down.')

    @classmethod
    def get_node_type(cls): return "lib.audio.pedalboard.PitchShift"



class Reverb(GraphNode):
    """
    Applies a reverb effect to an audio file.
    audio, effect, reverb

    Use cases:
    - Add spatial depth to dry recordings
    - Simulate different room acoustics
    - Create atmospheric sound effects
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to process.')
    room_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Size of the simulated room. Higher values create larger spaces.')
    damping: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Amount of high frequency absorption. Higher values create a duller sound.')
    wet_level: float | GraphNode | tuple[GraphNode, str] = Field(default=0.15, description='Level of the reverb effect in the output.')
    dry_level: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Level of the original signal in the output.')

    @classmethod
    def get_node_type(cls): return "lib.audio.pedalboard.Reverb"



class TimeStretch(GraphNode):
    """
    Changes the speed of an audio file without altering its pitch.
    audio, transform, time

    Use cases:
    - Adjust audio duration to fit video length
    - Create slow-motion or fast-motion audio effects
    - Synchronize audio tracks of different lengths
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to process.')
    rate: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Time stretch factor. Values > 1 speed up, < 1 slow down.')

    @classmethod
    def get_node_type(cls): return "lib.audio.pedalboard.TimeStretch"


