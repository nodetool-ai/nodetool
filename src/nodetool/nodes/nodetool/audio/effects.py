import io
from typing import IO
import numpy as np
from pydantic import Field
import pydub
from pydub import AudioSegment
from pedalboard.io import AudioFile
from nodetool.metadata.types import AudioRef
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


class Reverb(BaseNode):
    """
    Applies a reverb effect to an audio file.
    audio, effect, reverb

    Use cases:
    - Add spatial depth to dry recordings
    - Simulate different room acoustics
    - Create atmospheric sound effects
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to process."
    )
    room_scale: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Size of the simulated room. Higher values create larger spaces.",
    )
    damping: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Amount of high frequency absorption. Higher values create a duller sound.",
    )
    wet_level: float = Field(
        default=0.15,
        ge=0.0,
        le=1.0,
        description="Level of the reverb effect in the output.",
    )
    dry_level: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Level of the original signal in the output.",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        from pedalboard import Reverb

        samples, sample_rate, num_channels = await context.audio_to_numpy(self.audio)

        reverb = Reverb(
            room_size=self.room_scale,
            damping=self.damping,
            wet_level=self.wet_level,
            dry_level=self.dry_level,
        )

        processed = reverb(samples, sample_rate)

        return await context.audio_from_numpy(processed, sample_rate, num_channels)


class Compress(BaseNode):
    """
    Applies dynamic range compression to an audio file.
    audio, effect, dynamics

    Use cases:
    - Even out volume levels in a recording
    - Increase perceived loudness of audio
    - Control peaks in audio signals
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to process."
    )
    threshold: float = Field(
        default=-20.0,
        ge=-60.0,
        le=0.0,
        description="Threshold in dB above which compression is applied.",
    )
    ratio: float = Field(
        default=4.0,
        ge=1.0,
        le=20.0,
        description="Compression ratio. Higher values result in more compression.",
    )
    attack: float = Field(
        default=5.0, ge=0.1, le=100.0, description="Attack time in milliseconds."
    )
    release: float = Field(
        default=50.0, ge=5.0, le=1000.0, description="Release time in milliseconds."
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        from pedalboard import Compressor

        samples, sample_rate, num_channels = await context.audio_to_numpy(self.audio)

        compressor = Compressor(
            threshold_db=self.threshold,
            ratio=self.ratio,
            attack_ms=self.attack,
            release_ms=self.release,
        )

        processed = compressor(samples, sample_rate)
        return await context.audio_from_numpy(processed, sample_rate, num_channels)


class TimeStretch(BaseNode):
    """
    Changes the speed of an audio file without altering its pitch.
    audio, transform, time

    Use cases:
    - Adjust audio duration to fit video length
    - Create slow-motion or fast-motion audio effects
    - Synchronize audio tracks of different lengths
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to process."
    )
    rate: float = Field(
        default=1.0,
        ge=0.5,
        le=2.0,
        description="Time stretch factor. Values > 1 speed up, < 1 slow down.",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        import librosa
        import soundfile as sf
        import io

        samples, sample_rate, num_channels = await context.audio_to_numpy(self.audio)

        stretched = librosa.effects.time_stretch(samples, rate=self.rate)

        return await context.audio_from_numpy(stretched, sample_rate, num_channels)


class PitchShift(BaseNode):
    """
    Shifts the pitch of an audio file without changing its duration.
    audio, effect, pitch

    Use cases:
    - Transpose audio to a different key
    - Create harmonies or vocal effects
    - Adjust instrument tuning
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to process."
    )
    semitones: float = Field(
        default=0.0,
        ge=-12.0,
        le=12.0,
        description="Number of semitones to shift the pitch. Positive values shift up, negative values shift down.",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        import librosa

        samples, sample_rate, num_channels = await context.audio_to_numpy(self.audio)

        shifted = librosa.effects.pitch_shift(
            samples, sr=sample_rate, n_steps=self.semitones
        )

        return await context.audio_from_numpy(shifted, sample_rate, num_channels)


class NoiseGate(BaseNode):
    """
    Applies a noise gate effect to an audio file.
    audio, effect, dynamics

    Use cases:
    - Reduce background noise in recordings
    - Clean up audio tracks with unwanted low-level sounds
    - Create rhythmic effects by gating sustained sounds
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to process."
    )
    threshold_db: float = Field(
        default=-50.0,
        ge=-90.0,
        le=0.0,
        description="Threshold in dB below which the gate is active.",
    )
    attack_ms: float = Field(
        default=1.0,
        ge=0.1,
        le=100.0,
        description="Attack time in milliseconds.",
    )
    release_ms: float = Field(
        default=100.0,
        ge=5.0,
        le=1000.0,
        description="Release time in milliseconds.",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        from pedalboard import NoiseGate

        samples, sample_rate, num_channels = await context.audio_to_numpy(self.audio)

        gate = NoiseGate(
            threshold_db=self.threshold_db,
            attack_ms=self.attack_ms,
            release_ms=self.release_ms,
        )

        processed = gate(samples, sample_rate)
        return await context.audio_from_numpy(processed, sample_rate, num_channels)


class LowShelfFilter(BaseNode):
    """
    Applies a low shelf filter to boost or cut low frequencies.
    audio, effect, equalizer

    Use cases:
    - Enhance or reduce bass frequencies
    - Shape the low-end response of audio
    - Compensate for speaker or room deficiencies
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to process."
    )
    cutoff_frequency_hz: float = Field(
        default=200.0,
        ge=20.0,
        le=1000.0,
        description="The cutoff frequency of the shelf filter in Hz.",
    )
    gain_db: float = Field(
        default=0.0,
        ge=-24.0,
        le=24.0,
        description="The gain to apply to the frequencies below the cutoff, in dB.",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        from pedalboard import LowShelfFilter

        samples, sample_rate, num_channels = await context.audio_to_numpy(self.audio)

        low_shelf = LowShelfFilter(
            cutoff_frequency_hz=self.cutoff_frequency_hz,
            gain_db=self.gain_db,
        )

        processed = low_shelf(samples, sample_rate)
        return await context.audio_from_numpy(processed, sample_rate, num_channels)


class HighShelfFilter(BaseNode):
    """
    Applies a high shelf filter to boost or cut high frequencies.
    audio, effect, equalizer

    Use cases:
    - Enhance or reduce treble frequencies
    - Add brightness or air to audio
    - Tame harsh high frequencies
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to process."
    )
    cutoff_frequency_hz: float = Field(
        default=5000.0,
        ge=1000.0,
        le=20000.0,
        description="The cutoff frequency of the shelf filter in Hz.",
    )
    gain_db: float = Field(
        default=0.0,
        ge=-24.0,
        le=24.0,
        description="The gain to apply to the frequencies above the cutoff, in dB.",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        from pedalboard import HighShelfFilter

        samples, sample_rate, num_channels = await context.audio_to_numpy(self.audio)

        high_shelf = HighShelfFilter(
            cutoff_frequency_hz=self.cutoff_frequency_hz,
            gain_db=self.gain_db,
        )

        processed = high_shelf(samples, sample_rate)
        return await context.audio_from_numpy(processed, sample_rate, num_channels)


class HighPassFilter(BaseNode):
    """
    Applies a high-pass filter to attenuate frequencies below a cutoff point.
    audio, effect, equalizer

    Use cases:
    - Remove low-frequency rumble or noise
    - Clean up the low end of a mix
    - Create filter sweep effects
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to process."
    )
    cutoff_frequency_hz: float = Field(
        default=80.0,
        ge=20.0,
        le=5000.0,
        description="The cutoff frequency of the high-pass filter in Hz.",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        from pedalboard import HighpassFilter

        samples, sample_rate, num_channels = await context.audio_to_numpy(self.audio)

        highpass = HighpassFilter(cutoff_frequency_hz=self.cutoff_frequency_hz)

        processed = highpass(samples, sample_rate)
        return await context.audio_from_numpy(processed, sample_rate, num_channels)


class LowPassFilter(BaseNode):
    """
    Applies a low-pass filter to attenuate frequencies above a cutoff point.
    audio, effect, equalizer

    Use cases:
    - Reduce high-frequency harshness
    - Simulate muffled or distant sounds
    - Create dub-style effects
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to process."
    )
    cutoff_frequency_hz: float = Field(
        default=5000.0,
        ge=500.0,
        le=20000.0,
        description="The cutoff frequency of the low-pass filter in Hz.",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        from pedalboard import LowpassFilter

        samples, sample_rate, num_channels = await context.audio_to_numpy(self.audio)

        lowpass = LowpassFilter(cutoff_frequency_hz=self.cutoff_frequency_hz)

        processed = lowpass(samples, sample_rate)
        return await context.audio_from_numpy(processed, sample_rate, num_channels)


class PeakFilter(BaseNode):
    """
    Applies a peak filter to boost or cut a specific frequency range.
    audio, effect, equalizer

    Use cases:
    - Isolate specific frequency ranges
    - Create telephone or radio voice effects
    - Focus on particular instrument ranges in a mix
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to process."
    )
    cutoff_frequency_hz: float = Field(
        default=1000.0,
        ge=20.0,
        le=20000.0,
        description="The cutoff frequency of the band-pass filter in Hz.",
    )
    q_factor: float = Field(
        default=1.0,
        ge=0.1,
        le=10.0,
        description="The Q factor, determining the width of the band. Higher values create narrower bands.",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        from pedalboard import PeakFilter

        samples, sample_rate, num_channels = await context.audio_to_numpy(self.audio)

        bandpass = PeakFilter(
            cutoff_frequency_hz=self.cutoff_frequency_hz, gain_db=0, q=self.q_factor
        )

        processed = bandpass(samples, sample_rate)
        return await context.audio_from_numpy(processed, sample_rate, num_channels)


class Distortion(BaseNode):
    """
    Applies a distortion effect to an audio file.
    audio, effect, distortion

    Use cases:
    - Add grit and character to instruments
    - Create aggressive sound effects
    - Simulate overdriven amplifiers
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to process."
    )
    drive_db: float = Field(
        default=25.0,
        ge=0.0,
        le=100.0,
        description="Amount of distortion to apply in decibels.",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        from pedalboard import Distortion

        samples, sample_rate, num_channels = await context.audio_to_numpy(self.audio)

        distortion = Distortion(drive_db=self.drive_db)

        processed = distortion(samples, sample_rate)
        return await context.audio_from_numpy(processed, sample_rate, num_channels)


class Phaser(BaseNode):
    """
    Applies a phaser effect to an audio file.
    audio, effect, modulation

    Use cases:
    - Create sweeping, swooshing sounds
    - Add movement to static sounds
    - Produce psychedelic or space-like effects
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to process."
    )
    rate_hz: float = Field(
        default=1.0,
        ge=0.1,
        le=10.0,
        description="Rate of the phaser effect in Hz.",
    )
    depth: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Depth of the phaser effect.",
    )
    centre_frequency_hz: float = Field(
        default=1300.0,
        ge=100.0,
        le=5000.0,
        description="Centre frequency of the phaser in Hz.",
    )
    feedback: float = Field(
        default=0.0,
        ge=-1.0,
        le=1.0,
        description="Feedback of the phaser effect. Negative values invert the phase.",
    )
    mix: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Mix between the dry (original) and wet (effected) signals.",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        from pedalboard import Phaser

        samples, sample_rate, num_channels = await context.audio_to_numpy(self.audio)

        phaser = Phaser(
            rate_hz=self.rate_hz,
            depth=self.depth,
            centre_frequency_hz=self.centre_frequency_hz,
            feedback=self.feedback,
            mix=self.mix,
        )

        processed = phaser(samples, sample_rate)
        return await context.audio_from_numpy(processed, sample_rate, num_channels)


class Delay(BaseNode):
    """
    Applies a delay effect to an audio file.
    audio, effect, time-based

    Use cases:
    - Create echo effects
    - Add spaciousness to sounds
    - Produce rhythmic patterns
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to process."
    )
    delay_seconds: float = Field(
        default=0.5,
        ge=0.01,
        le=5.0,
        description="Delay time in seconds.",
    )
    feedback: float = Field(
        default=0.3,
        ge=0.0,
        le=0.99,
        description="Amount of delayed signal fed back into the effect.",
    )
    mix: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Mix between the dry (original) and wet (delayed) signals.",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        from pedalboard import Delay

        samples, sample_rate, num_channels = await context.audio_to_numpy(self.audio)

        delay = Delay(
            delay_seconds=self.delay_seconds,
            feedback=self.feedback,
            mix=self.mix,
        )

        processed = delay(samples, sample_rate)
        return await context.audio_from_numpy(processed, sample_rate, num_channels)


class Gain(BaseNode):
    """
    Applies a gain (volume adjustment) to an audio file.
    audio, effect, volume

    Use cases:
    - Increase or decrease overall volume of audio
    - Balance levels between different audio tracks
    - Prepare audio for further processing
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to process."
    )
    gain_db: float = Field(
        default=0.0,
        ge=-60.0,
        le=24.0,
        description="Gain to apply in decibels. Positive values increase volume, negative values decrease it.",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        from pedalboard import Gain

        samples, sample_rate, num_channels = await context.audio_to_numpy(self.audio)

        gain = Gain(gain_db=self.gain_db)

        processed = gain(samples, sample_rate)
        return await context.audio_from_numpy(processed, sample_rate, num_channels)


class Limiter(BaseNode):
    """
    Applies a limiter effect to an audio file.
    audio, effect, dynamics

    Use cases:
    - Prevent audio clipping
    - Increase perceived loudness without distortion
    - Control dynamic range of audio
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to process."
    )
    threshold_db: float = Field(
        default=-2.0,
        ge=-60.0,
        le=0.0,
        description="Threshold in dB above which the limiter is applied.",
    )
    release_ms: float = Field(
        default=250.0,
        ge=1.0,
        le=1000.0,
        description="Release time in milliseconds.",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        from pedalboard import Limiter

        samples, sample_rate, num_channels = await context.audio_to_numpy(self.audio)

        limiter = Limiter(
            threshold_db=self.threshold_db,
            release_ms=self.release_ms,
        )

        processed = limiter(samples, sample_rate)
        return await context.audio_from_numpy(processed, sample_rate, num_channels)


class Bitcrush(BaseNode):
    """
    Applies a bitcrushing effect to an audio file, reducing bit depth and/or sample rate.
    audio, effect, distortion

    Use cases:
    - Create lo-fi or retro-style audio effects
    - Simulate vintage digital audio equipment
    - Add digital distortion and artifacts to sounds
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to process."
    )
    bit_depth: int = Field(
        default=8,
        ge=1,
        le=16,
        description="The bit depth to reduce the audio to. Lower values create more distortion.",
    )
    sample_rate_reduction: int = Field(
        default=1,
        ge=1,
        le=100,
        description="Factor by which to reduce the sample rate. Higher values create more aliasing.",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        samples, sample_rate, num_channels = await context.audio_to_numpy(self.audio)

        # Reduce bit depth
        max_value = 2 ** (self.bit_depth - 1) - 1
        samples = np.round(samples * max_value) / max_value

        # Reduce sample rate
        if self.sample_rate_reduction > 1:
            samples = samples[:: self.sample_rate_reduction]
            samples = np.repeat(samples, self.sample_rate_reduction, axis=0)

        return await context.audio_from_numpy(samples, sample_rate, num_channels)
