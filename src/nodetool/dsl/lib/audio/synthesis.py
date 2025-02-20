from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Envelope(GraphNode):
    """
    Applies an ADR (Attack-Decay-Release) envelope to an audio signal.
    audio, synthesis, envelope

    Use cases:
    - Shape the amplitude of synthesized sounds
    - Create percussion-like instruments
    - Control sound dynamics
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio to apply the envelope to.')
    attack: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Attack time in seconds.')
    decay: float | GraphNode | tuple[GraphNode, str] = Field(default=0.3, description='Decay time in seconds.')
    release: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Release time in seconds.')
    peak_amplitude: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Peak amplitude after attack phase (0-1).')

    @classmethod
    def get_node_type(cls): return "lib.audio.synthesis.Envelope"



class FM_Synthesis(GraphNode):
    """
    Performs FM (Frequency Modulation) synthesis.
    audio, synthesis, modulation

    Use cases:
    - Create complex timbres
    - Generate bell-like sounds
    - Synthesize metallic tones
    """

    carrier_freq: float | GraphNode | tuple[GraphNode, str] = Field(default=440.0, description='Carrier frequency in Hz.')
    modulator_freq: float | GraphNode | tuple[GraphNode, str] = Field(default=110.0, description='Modulator frequency in Hz.')
    modulation_index: float | GraphNode | tuple[GraphNode, str] = Field(default=5.0, description='Modulation index (affects richness of sound).')
    amplitude: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Amplitude of the output.')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Duration in seconds.')
    sample_rate: int | GraphNode | tuple[GraphNode, str] = Field(default=44100, description='Sampling rate in Hz.')

    @classmethod
    def get_node_type(cls): return "lib.audio.synthesis.FM_Synthesis"


import nodetool.nodes.lib.audio.synthesis
import nodetool.nodes.lib.audio.synthesis

class Oscillator(GraphNode):
    """
    Generates basic waveforms (sine, square, sawtooth, triangle).
    audio, synthesis, waveform

    Use cases:
    - Create fundamental waveforms for synthesis
    - Generate test signals
    - Build complex sounds from basic waves
    """

    waveform: nodetool.nodes.lib.audio.synthesis.Oscillator.OscillatorWaveform = Field(default=nodetool.nodes.lib.audio.synthesis.Oscillator.OscillatorWaveform('sine'), description='Type of waveform to generate (sine, square, sawtooth, triangle).')
    frequency: float | GraphNode | tuple[GraphNode, str] = Field(default=440.0, description='Frequency of the waveform in Hz.')
    amplitude: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Amplitude of the waveform.')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Duration in seconds.')
    sample_rate: int | GraphNode | tuple[GraphNode, str] = Field(default=44100, description='Sampling rate in Hz.')
    pitch_envelope_amount: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Amount of pitch envelope in semitones')
    pitch_envelope_time: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Duration of pitch envelope in seconds')
    pitch_envelope_curve: nodetool.nodes.lib.audio.synthesis.Oscillator.PitchEnvelopeCurve = Field(default=nodetool.nodes.lib.audio.synthesis.Oscillator.PitchEnvelopeCurve('linear'), description='Shape of pitch envelope (linear, exponential)')

    @classmethod
    def get_node_type(cls): return "lib.audio.synthesis.Oscillator"



class PinkNoise(GraphNode):
    """
    Generates pink noise (1/f noise).
    audio, synthesis, noise

    Use cases:
    - Create natural-sounding background noise
    - Test speaker response
    - Sound masking
    """

    amplitude: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Amplitude of the noise.')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Duration in seconds.')
    sample_rate: int | GraphNode | tuple[GraphNode, str] = Field(default=44100, description='Sampling rate in Hz.')

    @classmethod
    def get_node_type(cls): return "lib.audio.synthesis.PinkNoise"



class WhiteNoise(GraphNode):
    """
    Generates white noise.
    audio, synthesis, noise

    Use cases:
    - Create background ambience
    - Generate percussion sounds
    - Test audio equipment
    """

    amplitude: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Amplitude of the noise.')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Duration in seconds.')
    sample_rate: int | GraphNode | tuple[GraphNode, str] = Field(default=44100, description='Sampling rate in Hz.')

    @classmethod
    def get_node_type(cls): return "lib.audio.synthesis.WhiteNoise"


