from enum import Enum
from pydantic import Field
import numpy as np
from nodetool.metadata.types import AudioRef, Tensor
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.nodes.nodetool.audio.audio_helpers import numpy_to_audio_segment


class PitchEnvelopeCurve(Enum):
    LINEAR = "linear"
    EXPONENTIAL = "exponential"


class OscillatorWaveform(Enum):
    SINE = "sine"
    SQUARE = "square"
    SAWTOOTH = "sawtooth"
    TRIANGLE = "triangle"


class Oscillator(BaseNode):
    """
    Generates basic waveforms (sine, square, sawtooth, triangle).
    audio, synthesis, waveform

    Use cases:
    - Create fundamental waveforms for synthesis
    - Generate test signals
    - Build complex sounds from basic waves
    """

    waveform: OscillatorWaveform = Field(
        default=OscillatorWaveform.SINE,
        description="Type of waveform to generate (sine, square, sawtooth, triangle).",
    )
    frequency: float = Field(
        default=440.0,
        ge=20.0,
        le=20000.0,
        description="Frequency of the waveform in Hz.",
    )
    amplitude: float = Field(
        default=0.5, ge=0.0, le=1.0, description="Amplitude of the waveform."
    )
    duration: float = Field(
        default=1.0, ge=0.0, le=30.0, description="Duration in seconds."
    )
    sample_rate: int = Field(default=44100, description="Sampling rate in Hz.")
    pitch_envelope_amount: float = Field(
        default=0.0,
        ge=-24.0,  # Two octaves down
        le=24.0,  # Two octaves up
        description="Amount of pitch envelope in semitones",
    )
    pitch_envelope_time: float = Field(
        default=0.5,
        ge=0.0,
        le=10.0,
        description="Duration of pitch envelope in seconds",
    )
    pitch_envelope_curve: PitchEnvelopeCurve = Field(
        default=PitchEnvelopeCurve.LINEAR,
        description="Shape of pitch envelope (linear, exponential)",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        t = np.linspace(0, self.duration, int(self.sample_rate * self.duration))

        # Calculate pitch envelope
        env_samples = int(
            min(self.pitch_envelope_time, self.duration) * self.sample_rate
        )
        pitch_env = np.ones_like(t)

        if self.pitch_envelope_amount != 0:
            # Convert semitones to frequency multiplier
            target_mult = 2 ** (self.pitch_envelope_amount / 12)

            if self.pitch_envelope_curve == PitchEnvelopeCurve.EXPONENTIAL:
                envelope = np.exp(-5 * np.linspace(0, 1, env_samples))
            else:  # linear
                envelope = np.linspace(1, 0, env_samples)

            pitch_env[:env_samples] = 1 + (target_mult - 1) * (1 - envelope)
            pitch_env[env_samples:] = target_mult

        # Apply frequency modulation
        phase = 2 * np.pi * self.frequency * np.cumsum(pitch_env) / self.sample_rate

        # Generate waveform
        if self.waveform == OscillatorWaveform.SINE:
            samples = self.amplitude * np.sin(phase)
        elif self.waveform == OscillatorWaveform.SQUARE:
            samples = self.amplitude * np.sign(np.sin(phase))
        elif self.waveform == OscillatorWaveform.SAWTOOTH:
            samples = self.amplitude * 2 * ((phase / (2 * np.pi)) % 1) - 1
        elif self.waveform == OscillatorWaveform.TRIANGLE:
            samples = self.amplitude * 2 * abs(2 * ((phase / (2 * np.pi)) % 1) - 1) - 1
        else:
            raise ValueError("Invalid waveform type")

        audio_segment = numpy_to_audio_segment(samples, self.sample_rate)
        return await context.audio_from_segment(audio_segment)


class WhiteNoise(BaseNode):
    """
    Generates white noise.
    audio, synthesis, noise

    Use cases:
    - Create background ambience
    - Generate percussion sounds
    - Test audio equipment
    """

    amplitude: float = Field(
        default=0.5, ge=0.0, le=1.0, description="Amplitude of the noise."
    )
    duration: float = Field(
        default=1.0, ge=0.0, le=30.0, description="Duration in seconds."
    )
    sample_rate: int = Field(default=44100, description="Sampling rate in Hz.")

    async def process(self, context: ProcessingContext) -> AudioRef:
        samples = self.amplitude * np.random.uniform(
            -1, 1, int(self.sample_rate * self.duration)
        )
        audio_segment = numpy_to_audio_segment(samples, self.sample_rate)
        return await context.audio_from_segment(audio_segment)


class PinkNoise(BaseNode):
    """
    Generates pink noise (1/f noise).
    audio, synthesis, noise

    Use cases:
    - Create natural-sounding background noise
    - Test speaker response
    - Sound masking
    """

    amplitude: float = Field(
        default=0.5, ge=0.0, le=1.0, description="Amplitude of the noise."
    )
    duration: float = Field(
        default=1.0, ge=0.0, le=30.0, description="Duration in seconds."
    )
    sample_rate: int = Field(default=44100, description="Sampling rate in Hz.")

    async def process(self, context: ProcessingContext) -> AudioRef:
        num_samples = int(self.sample_rate * self.duration)

        # Generate white noise in frequency domain
        f_samples = np.random.normal(0, 1, num_samples)

        # Create pink noise filter (1/sqrt(f))
        freqs = np.fft.fftfreq(num_samples)
        freqs[0] = float("inf")  # Avoid division by zero
        pink_filter = 1 / np.sqrt(np.abs(freqs))

        # Apply filter in frequency domain
        f_pink = f_samples * pink_filter

        # Convert back to time domain
        samples = np.real(np.fft.ifft(f_pink))

        # Normalize and apply amplitude
        samples = self.amplitude * samples / np.max(np.abs(samples))

        audio_segment = numpy_to_audio_segment(samples, self.sample_rate)
        return await context.audio_from_segment(audio_segment)


class FM_Synthesis(BaseNode):
    """
    Performs FM (Frequency Modulation) synthesis.
    audio, synthesis, modulation

    Use cases:
    - Create complex timbres
    - Generate bell-like sounds
    - Synthesize metallic tones
    """

    carrier_freq: float = Field(
        default=440.0, ge=20.0, le=20000.0, description="Carrier frequency in Hz."
    )
    modulator_freq: float = Field(
        default=110.0, ge=1.0, le=20000.0, description="Modulator frequency in Hz."
    )
    modulation_index: float = Field(
        default=5.0,
        ge=0.0,
        le=100.0,
        description="Modulation index (affects richness of sound).",
    )
    amplitude: float = Field(
        default=0.5, ge=0.0, le=1.0, description="Amplitude of the output."
    )
    duration: float = Field(
        default=1.0, ge=0.0, le=30.0, description="Duration in seconds."
    )
    sample_rate: int = Field(default=44100, description="Sampling rate in Hz.")

    async def process(self, context: ProcessingContext) -> AudioRef:
        t = np.linspace(0, self.duration, int(self.sample_rate * self.duration))
        modulator = np.sin(2 * np.pi * self.modulator_freq * t)
        carrier = np.sin(
            2 * np.pi * self.carrier_freq * t + self.modulation_index * modulator
        )
        samples = self.amplitude * carrier

        audio_segment = numpy_to_audio_segment(samples, self.sample_rate)
        return await context.audio_from_segment(audio_segment)


class Envelope(BaseNode):
    """
    Applies an ADR (Attack-Decay-Release) envelope to an audio signal.
    audio, synthesis, envelope

    Use cases:
    - Shape the amplitude of synthesized sounds
    - Create percussion-like instruments
    - Control sound dynamics
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio to apply the envelope to."
    )
    attack: float = Field(
        default=0.1, ge=0.0, le=5.0, description="Attack time in seconds."
    )
    decay: float = Field(
        default=0.3, ge=0.0, le=5.0, description="Decay time in seconds."
    )
    release: float = Field(
        default=0.5, ge=0.0, le=5.0, description="Release time in seconds."
    )
    peak_amplitude: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Peak amplitude after attack phase (0-1).",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        samples, sample_rate, num_channels = await context.audio_to_numpy(self.audio)

        total_samples = len(samples)
        attack_samples = int(self.attack * sample_rate)
        decay_samples = int(self.decay * sample_rate)
        release_samples = int(self.release * sample_rate)

        # Ensure we have enough samples for all phases
        total_env = attack_samples + decay_samples + release_samples
        if total_env > total_samples:
            scale = total_samples / total_env
            attack_samples = int(attack_samples * scale)
            decay_samples = int(decay_samples * scale)
            release_samples = total_samples - (attack_samples + decay_samples)

        envelope = np.zeros(total_samples)
        current_pos = 0

        # Attack phase
        if attack_samples > 0:
            envelope[current_pos : current_pos + attack_samples] = np.linspace(
                0, self.peak_amplitude, attack_samples
            )
            current_pos += attack_samples

        # Decay phase
        if decay_samples > 0:
            envelope[current_pos : current_pos + decay_samples] = np.linspace(
                self.peak_amplitude, self.peak_amplitude * 0.3, decay_samples
            )
            current_pos += decay_samples

        # Release phase
        if release_samples > 0:
            start_amplitude = (
                envelope[current_pos - 1]
                if current_pos > 0
                else self.peak_amplitude * 0.3
            )
            envelope[current_pos : current_pos + release_samples] = np.linspace(
                start_amplitude, 0, release_samples
            )
            if current_pos + release_samples < total_samples:
                envelope[current_pos + release_samples :] = 0

        samples = (
            samples * envelope[:, np.newaxis]
            if num_channels > 1
            else samples * envelope
        )

        return await context.audio_from_numpy(samples, sample_rate, num_channels)
