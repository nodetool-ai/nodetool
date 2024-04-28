import io
import librosa
from matplotlib import pyplot as plt
import numpy as np
from nodetool.metadata.types import Tensor
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.nodes.nodetool.audio.audio_helpers import (
    convert_to_float,
)
from nodetool.metadata.types import AudioRef
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import BaseNode
from pydantic import Field
from typing import Literal, Optional


class AmplitudeToDB(BaseNode):
    """
    Converts an amplitude spectrogram to a dB-scaled spectrogram.

    #### Applications
    - Audio Analysis: By converting to dB scale, it accentuates the variances in the data making it easier to analyze the audio signal.
    - Audio Classification: When classifying audio signals, converting to dB scale can help distinguish between different classes by amplifying subtle details.
    """

    tensor: Tensor = Field(
        description="The amplitude tensor to be converted to dB scale."
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        db_tensor = librosa.amplitude_to_db(self.tensor.to_numpy(), ref=np.max)
        return Tensor.from_numpy(db_tensor)


class ChromaSTFT(BaseNode):
    """
    This node creates a chromagram from a waveform or power spectrogram to identify different pitch classes in an audio signal.

    #### Applications
    - Chord recognition in music: Helps in identifying the chords used in a piece of music.
    - Music genre classification: Assists in distinguishing the genre of a piece based on the unique pitch classes used.

    #### Notes
    - Parameters 'n_fft' and 'hop_length' control the resolution of the chromagram. A higher 'n_fft' or lower 'hop_length' increases frequency resolution, but decreases time resolution, and vice versa.
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to extract chromagram from."
    )
    n_fft: int = Field(
        default=2048, ge=0, description="The number of samples per frame."
    )
    hop_length: int = Field(
        default=512, ge=0, description="The number of samples between frames."
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        (samples, sample_rate) = await context.audio_to_numpy(self.audio)
        samples = convert_to_float(samples)
        chromagram = librosa.feature.chroma_stft(
            y=samples, sr=sample_rate, n_fft=self.n_fft, hop_length=self.hop_length
        )
        return Tensor.from_numpy(chromagram)


class DBToAmplitude(BaseNode):
    """
    The DBToAmplitude node Converts a dB-scaled spectrogram to an amplitude spectrogram.

    #### Applications
    - Audio processing: Converting transformed audio data back to its original amplitude scale is crucial for further data processing or synthesis.
    - Noise reduction: If you've used a dB conversion for visualization or noise reduction purposes, this node can convert the data back to its original state.
    """

    tensor: Tensor = Field(
        description="The dB-scaled tensor to be converted to amplitude scale."
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        amplitude_tensor = librosa.db_to_amplitude(self.tensor.to_numpy())
        return Tensor.from_numpy(amplitude_tensor)


class DBToPower(BaseNode):
    """
    This node converts a decibel (dB) spectrogram back to power scale.
    """

    tensor: Tensor = Field(
        default=Tensor(), description="The tensor containing the decibel spectrogram."
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        db_spec = self.tensor.to_numpy()
        return Tensor.from_numpy(librosa.db_to_power(db_spec))


class GriffinLim(BaseNode):
    """
    GriffinLim Node performs phase reconstruction on a magnitude spectrogram utilizing the Griffin-Lim algorithm.

    #### Applications
    - Reconstructing audio signals from given spectrograms.
    - Restoring time-related elements in audio processing pipelines.
    """

    magnitude_spectrogram: Tensor = Field(
        description="Magnitude spectrogram input for phase reconstruction."
    )
    n_iter: int = Field(
        default=32, description="Number of iterations for the Griffin-Lim algorithm."
    )
    hop_length: int = Field(
        default=512, description="Number of samples between successive frames."
    )
    win_length: Optional[int] = Field(
        default=None,
        description="Each frame of audio is windowed by `window()`. The window will be of length `win_length` and then padded with zeros to match `n_fft`.",
    )
    window: str = Field(
        default="hann",
        description="Type of window to use for Griffin-Lim transformation.",
    )
    center: bool = Field(
        default=True,
        description="If True, the signal `y` is padded so that frame `D[:, t]` is centered at `y[t * hop_length]`.",
    )
    length: Optional[int] = Field(
        default=None,
        description="If given, the resulting signal will be zero-padded or clipped to this length.",
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        reconstructed_audio = librosa.griffinlim(
            S=self.magnitude_spectrogram.to_numpy(),
            n_iter=self.n_iter,
            hop_length=self.hop_length,
            win_length=self.win_length,
            window=self.window,
            center=self.center,
            length=self.length,
        )
        return Tensor.from_numpy(reconstructed_audio)


class MelSpectrogram(BaseNode):
    """
    MelSpecNode computes the Mel-frequency spectrogram for an audio signal.
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to convert to a tensor."
    )
    n_fft: int = Field(
        default=2048, ge=0, description="The number of samples per frame."
    )
    hop_length: int = Field(
        default=512, ge=0, description="The number of samples between frames."
    )
    n_mels: int = Field(
        default=128, ge=0, description="The number of Mel bands to generate."
    )
    fmin: int = Field(default=0, ge=0, description="The lowest frequency (in Hz).")
    fmax: int = Field(default=8000, ge=0, description="The highest frequency (in Hz).")

    async def process(self, context: ProcessingContext) -> Tensor:
        (samples, sample_rate) = await context.audio_to_numpy(self.audio)
        samples = convert_to_float(samples)
        melspectrogram = librosa.feature.melspectrogram(
            y=samples,
            sr=sample_rate,
            n_fft=self.n_fft,
            hop_length=self.hop_length,
            n_mels=self.n_mels,
            fmin=self.fmin,
            fmax=self.fmax,
        )
        return Tensor.from_numpy(melspectrogram)


class MFCC(BaseNode):
    """
    MFCC Node computes the Mel-frequency cepstral coefficients (MFCCs) from an audio signal.
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to extract MFCCs from."
    )
    n_mfcc: int = Field(default=13, ge=0, description="The number of MFCCs to extract.")
    n_fft: int = Field(
        default=2048, ge=0, description="The number of samples per frame."
    )
    hop_length: int = Field(
        default=512, ge=0, description="The number of samples between frames."
    )
    fmin: int = Field(default=0, ge=0, description="The lowest frequency (in Hz).")
    fmax: int = Field(default=8000, ge=0, description="The highest frequency (in Hz).")

    async def process(self, context: ProcessingContext) -> Tensor:
        (samples, sample_rate) = await context.audio_to_numpy(self.audio)
        samples = convert_to_float(samples)
        mfccs = librosa.feature.mfcc(
            y=samples,
            sr=sample_rate,
            n_mfcc=self.n_mfcc,
            n_fft=self.n_fft,
            hop_length=self.hop_length,
            fmin=self.fmin,
            fmax=self.fmax,
        )
        return Tensor.from_numpy(mfccs)


class PlotSpectrogram(BaseNode):
    """
    The PlotSpectrogram node generates a visual representation of the spectrum of frequencies in an audio signal as they vary with time.

    #### Applications
    - Audio Analysis: Allows users to visually see the spectrum of frequencies in their data.
    - Machine Learning: Used as a preprocessing step for feeding data into image-based ML models.
    - Sound engineering: Helps in identifying specific tones or frequencies in a music piece or a sound bite.
    """

    tensor: Tensor = Field(
        default=Tensor(), description="The tensor containing the mel spectrogram."
    )
    fmax: int = Field(default=8000, ge=0, description="The highest frequency (in Hz).")

    async def process(self, context: ProcessingContext) -> ImageRef:
        spec = self.tensor.to_numpy()
        plt.figure(figsize=(10, 10))
        librosa.display.specshow(spec, y_axis="mel", fmax=self.fmax, x_axis="time")
        plt.colorbar(format="%+2.0f dB")
        plt.title("Mel spectrogram")
        plt.tight_layout()
        buf = io.BytesIO()
        plt.savefig(buf, format="png")
        buf.seek(0)
        return await context.image_from_bytes(buf.getvalue())


class PowertToDB(BaseNode):
    """
    Converts a power spectrogram to decibel (dB) scale.

    #### Applications
    - Audio Signal Processing: The inputted power spectrogram is processed to convert it into a decibel scale which is utilised further.
    - Audio Visualization: The decibel-scaled spectrogram is a better fit for visualizations due to its reduced skewness.
    """

    tensor: Tensor = Field(
        default=Tensor(), description="The tensor containing the power spectrogram."
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        power_spec = self.tensor.to_numpy()
        return Tensor.from_numpy(librosa.power_to_db(power_spec, ref=np.max))


class SpectralContrast(BaseNode):
    """
    The spectral contrast measures the difference in amplitude between the most noticeable parts (peaks) and the less noticeable parts (valleys) in a sound spectrum.

    #### Applications
    - Music genre classification: distinguishing between different types of music based on the color of sound.
    - Instrument recognition: recognizing different musical instruments by the difference in their spectral contrast.
    - Audio analysis: determining various characteristics of audio files.

    Useful note: The `n_fft` and `hop_length` parameters affect the resolution of the analysis. A higher `n_fft` provides better frequency resolution but worse time resolution, and vice versa for a lower `hop_length`.
    """

    audio: AudioRef = Field(
        default=AudioRef(),
        description="The audio file to extract spectral contrast from.",
    )
    n_fft: int = Field(
        default=2048, ge=0, description="The number of samples per frame."
    )
    hop_length: int = Field(
        default=512, ge=0, description="The number of samples between frames."
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        (samples, sample_rate) = await context.audio_to_numpy(self.audio)
        samples = convert_to_float(samples)
        spectral_contrast = librosa.feature.spectral_contrast(
            y=samples, sr=sample_rate, n_fft=self.n_fft, hop_length=self.hop_length
        )
        return Tensor.from_numpy(spectral_contrast)


class STFT(BaseNode):
    """
    This node computes the Short-Time Fourier Transform (STFT) matrix for an audio signal.
    The STFT matrix represents the signal in both time and frequency domains, forming the foundation for many audio processing tasks.

    #### Applications
    - Audio Analysis: By transforming the audio signal into a visualizable format, it helps in understanding and analyzing the audio signal.
    - Sound Processing: It plays a key foundational role in sound effects, tuning, compression, and more.
    - Audio Feature Extraction: It can be used to analyze frequency-based features for sound classification.
    - Music Information Retrieval: It helps in music transcription, rhythm and tempo analysis.
    """

    audio: AudioRef = Field(
        default=AudioRef(),
        description="The audio file to compute the STFT matrix from.",
    )
    n_fft: int = Field(
        default=2048, ge=0, description="The number of samples per frame."
    )
    hop_length: int = Field(
        default=512, ge=0, description="The number of samples between frames."
    )
    win_length: Optional[int] = Field(
        default=None, description="The window length. If None, it defaults to n_fft."
    )
    window: str = Field(default="hann", description="The type of window to use.")
    center: bool = Field(
        default=True,
        description="If True, input signal is padded so that frame D[:, t] is centered at y[t * hop_length].",
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        (samples, sample_rate) = await context.audio_to_numpy(self.audio)
        samples = convert_to_float(samples)
        stft_matrix = librosa.stft(
            y=samples,
            n_fft=self.n_fft,
            hop_length=self.hop_length,
            win_length=self.win_length,
            window=self.window,
            center=self.center,
        )
        return Tensor.from_numpy(np.abs(stft_matrix))
