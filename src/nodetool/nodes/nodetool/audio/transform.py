from pydantic import Field
from nodetool.metadata.types import AudioRef
from nodetool.metadata.types import Tensor
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


class ConcatAudio(BaseNode):
    """
    The ConcatAudio Node concatenates two audio files together.

    This node is a tool used to combine two separate audio files into a single, continuous audio file. This can be particularly useful in audio processing workflows where multiple audio snippets need to be joined together in a linear sequence.

    #### Applications
    - Combining voice recordings: If you have two separate voice recordings and you want them to play continuously as if it was one recording, you use this node.
    - Building soundtracks: Sequentially join multiple short music files to create a longer soundtrack.
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
    This node normalizes the volume of an audio file.

    The Normalize Audio Node specifically helps in adjusting the volume of an audio file to a standard level. This process makes all audio files, irrespective of their original volume, of equal loudness for optimal listening. A key feature of this node is that it maintains the relative dynamic range within an audio file during normalization.

    #### Applications
    - Volume consistency: Ensures that all audio files output at the same volume level.
    - Audio processing: Can be used in audio editing and processing to make sound consistent and balanced.
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
    The OverlayAudioNode is used to overlay two audio files together.

    The OverlayAudioNode is a node which purpose is to combine two audio files into one. This creates an interesting audio effect and can be used for mixing and producing audio. The node takes two audio files as inputs and overlays them, meaning that both audios play simultaneously in the final output.

    #### Applications
    - Audio Editing: Overlay two audio tracks to create a new, mixed audio clip.
    - Music Production: Overlap different tracks to produce new musical compositions.
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
    Removes silence from an audio file.

    This node is designed to clean up audio files by automatically detecting and removing sections with silence. It is primarily used for enhancing the quality of the audio files and making them more concise.

    #### Applications
    - Audio Editing: Remove silent parts to make the audio content more engaging and fluent.
    - Speech Processing: Improve the efficiency of speech recognition systems by removing non-informative silent parts.
    - Podcast Production: Enhance listener experience by eliminating awkward silent pauses.
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to remove silence from."
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        from .audio_helpers import remove_silence

        audio = await context.audio_to_audio_segment(self.audio)
        res = remove_silence(audio)
        return await context.audio_from_segment(res)


class SliceAudio(BaseNode):
    """
    This node halves an audio file into two audio files.

    The SliceAudioNode is designed to split an audio file from the start to the end time specified in seconds. By setting the desired start and end points, the node processes the input audio file and outputs another generated audio file which contains only the sliced audio.

    Noteworthy features of this node include its ability to handle various audio file formats and the precision with which it slices the audio files in seconds.

    #### Applications
    - Audio Editing: Conveniently cut out specific sections from an audio file for use in different contexts or merely remove undesired parts.
    - Audio Sampling: Extract particular sections from the entire audio file for creating samples in music production, sound design, etc.
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
    class Tone(BaseNode):
        """
        This node generates a constant tone.

        The Tone Node is purposed for creating a tone signal at a specified frequency and duration. It is used to simulate audio signals for testing or for creating specific sound effects in an AI audio processing workflow. The node has the ability to tweak the initial phase of the waveform and is capable of delivering up to CD quality (44.1kHz sampling rate).

        #### Applications
        - Generate a test tone for debugging or calibrating audio systems.
        - Create specific sound effects in audio processing.
        """

        frequency: float = Field(
            default=440.0, description="Frequency of the tone in Hertz."
        )
        sampling_rate: int = Field(
            default=44100, description="Sampling rate.", ge=0, le=44100
        )
        duration: float = Field(
            default=1.0, description="Duration of the tone in seconds."
        )
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
