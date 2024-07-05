from pydantic import Field
from nodetool.metadata.types import AudioRef
from nodetool.metadata.types import Tensor
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


class ConcatAudio(BaseNode):
    """
    Concatenates two audio files together.
    audio, edit, join

    - Combine multiple audio clips into a single file
    - Create longer audio tracks from shorter segments
    """

    a: AudioRef = Field(default=AudioRef(), description="The first audio file.")
    b: AudioRef = Field(default=AudioRef(), description="The second audio file.")

    async def process(self, context: ProcessingContext) -> AudioRef:
        audio_a = await context.audio_to_audio_segment(self.a)
        audio_b = await context.audio_to_audio_segment(self.b)
        res = audio_a + audio_b
        return await context.audio_from_segment(res)


class NormalizeAudio(BaseNode):
    """
    Normalizes the volume of an audio file.
    audio, fix, dynamics

    - Ensure consistent volume across multiple audio files
    - Adjust overall volume level before further processing
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to normalize."
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        from .audio_helpers import normalize_audio

        audio = await context.audio_to_audio_segment(self.audio)
        res = normalize_audio(audio)
        return await context.audio_from_segment(res)


class OverlayAudio(BaseNode):
    """
    Overlays two audio files together.
    audio, edit, transform

    - Mix background music with voice recording
    - Layer sound effects over an existing audio track
    """

    a: AudioRef = Field(default=AudioRef(), description="The first audio file.")
    b: AudioRef = Field(default=AudioRef(), description="The second audio file.")

    async def process(self, context: ProcessingContext) -> AudioRef:
        audio_a = await context.audio_to_audio_segment(self.a)
        audio_b = await context.audio_to_audio_segment(self.b)
        res = audio_a.overlay(audio_b)
        return await context.audio_from_segment(res)


class RemoveSilence(BaseNode):
    """
    Removes or shortens silence in an audio file with smooth transitions.
    audio, edit, clean

    - Trim silent parts from beginning/end of recordings
    - Remove or shorten long pauses between speech segments
    - Apply crossfade for smooth transitions
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to process."
    )
    min_length: int = Field(
        default=200, description="Minimum length of silence to be processed (in milliseconds).", ge=0, le=10000
    )
    threshold: int = Field(
        default=-40, description="Silence threshold in dBFS (negative integer). Higher values detect more silence.", ge=-60.0, le=0
    )
    reduction_factor: float = Field(
        default=1.0, description="Factor to reduce silent parts (0.0 to 1.0). 0.0 keeps silence as is, 1.0 removes it completely.", ge=0.0, le=1.0
    )
    crossfade: int = Field(
        default=10, description="Duration of crossfade in milliseconds to apply between segments for smooth transitions.", ge=0, le=50
    )
    min_silence_between_parts: int = Field(
        default=100, description="Minimum silence duration in milliseconds to maintain between non-silent segments", ge=0, le=500
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        from .audio_helpers import remove_silence

        audio = await context.audio_to_audio_segment(self.audio)
        res = remove_silence(audio, min_length=self.min_length, threshold=self.threshold, 
                             reduction_factor=self.reduction_factor, crossfade=self.crossfade, 
                             min_silence_between_parts=self.min_silence_between_parts)
        return await context.audio_from_segment(res)


class SliceAudio(BaseNode):
    """
    Extracts a section of an audio file.
    audio, edit, trim

    - Cut out a specific clip from a longer audio file
    - Remove unwanted portions from beginning or end
    """

    audio: AudioRef = Field(default=AudioRef(), description="The audio file.")
    start: float = Field(default=0.0, description="The start time in seconds.", ge=0.0)
    end: float = Field(default=1.0, description="The end time in seconds.", ge=0.0)

    async def process(self, context: ProcessingContext) -> AudioRef:
        import pydub

        audio = await context.audio_to_audio_segment(self.audio)
        res = audio[(self.start * 1000) : (self.end * 1000)]
        assert isinstance(res, pydub.AudioSegment)
        return await context.audio_from_segment(res)


class Tone(BaseNode):
    """
    Generates a constant tone signal.
    audio, generate, sound

    - Create test tones for audio equipment calibration
    - Produce reference pitches for musical applications
    """

    frequency: float = Field(
        default=440.0, description="Frequency of the tone in Hertz."
    )
    sampling_rate: int = Field(
        default=44100, description="Sampling rate.", ge=0, le=44100
    )
    duration: float = Field(default=1.0, description="Duration of the tone in seconds.")
    phi: float = Field(
        default=0.0, description="Initial phase of the waveform in radians."
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        import librosa

        tone_signal = librosa.tone(
            frequency=self.frequency,
            sr=self.sampling_rate,
            length=int((self.sampling_rate * self.duration)),
            phi=self.phi,
        )
        return Tensor.from_numpy(tone_signal)
