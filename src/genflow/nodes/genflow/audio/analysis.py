import io
import librosa
from matplotlib import pyplot as plt
import numpy as np
from genflow.metadata.types import Tensor
from genflow.workflows.processing_context import ProcessingContext
from genflow.nodes.genflow.audio.audio_helpers import (
    convert_to_float,
)
from genflow.metadata.types import AudioRef
from genflow.metadata.types import ImageRef
from genflow.workflows.genflow_node import GenflowNode
from pydantic import Field
from typing import Literal, Optional


class AmplitudeToDBNode(GenflowNode):
    """
    Converts an amplitude spectrogram to a dB-scaled spectrogram.

    It is an audio transformation node that takes an input in the form of an amplitude spectrogram and converts it into a dB-scaled spectrogram. This conversion is beneficial as it makes observing nuances in the data more manageable which can be vital for tasks that require audio analysis and classification.

    #### Applications
    - Audio Analysis: By converting to dB scale, it accentuates the variances in the data making it easier to analyze the audio signal.
    - Audio Classification: When classifying audio signals, converting to dB scale can help distinguish between different classes by amplifying subtle details.

    #### Example
    In a pipeline designed to analyze and classify different audio signals, you would first generate an amplitude spectrogram for your audio sample.
    The 'AmplitudeToDB' node takes this spectrogram tensor as input and outputs a dB-scaled spectrogram.
    This output could then be fed into other nodes designed for audio analysis or classification.
    """

    tensor: Tensor = Field(
        description="The amplitude tensor to be converted to dB scale."
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        db_tensor = librosa.amplitude_to_db(self.tensor.to_numpy(), ref=np.max)
        return Tensor.from_numpy(db_tensor)


class ChromaSTFTNode(GenflowNode):
    """
    This node creates a chromagram from a waveform or power spectrogram to identify different pitch classes in an audio signal.

    The ChromaSTFTNode allows for the visual representation of musical notes present in an audio signal over time. It is particularly useful for tasks like chord recognition and music genre classification. It works by collapsing the spectrum of an audio signal into 12 bins, each representing a distinct semitone of the musical octave.

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


class DBToAmplitudeNode(GenflowNode):
    """
    ## DBToAmplitude Node
    ### Namespace: Audio.Analysis

    #### Description
    The DBToAmplitude node Converts a dB-scaled spectrogram to an amplitude spectrogram.

    The purpose of the node is to convert audio data that was previously transformed to decibels back to the amplitude scale. This node is useful for tasks that require the original signal strength, such as inverse transforms or audio synthesis.

    #### Applications
    - Audio processing: Converting transformed audio data back to its original amplitude scale is crucial for further data processing or synthesis.
    - Noise reduction: If you've used a dB conversion for visualization or noise reduction purposes, this node can convert the data back to its original state.

    #### Example
    Let's take an example of a pipeline where you have previously applied a node that converted your audio data to a dB-scale for noise reduction. To further process the data or synthesise it, you would use the DBToAmplitude node to convert the dB-scaled data back to the amplitude scale. This can easily be done by dragging and dropping the DBToAmplitude node after the dB node and selecting the dB-scaled tensor as its input.

    ##### Inputs
    - `tensor`: A Tensor. This is the dB-scaled tensor to be converted to amplitude scale.

    ##### Outputs
    - A Tensor representing the amplitude spectrogram is output. This Tensor is the converted version of the input dB-scaled tensor.
    """

    tensor: Tensor = Field(
        description="The dB-scaled tensor to be converted to amplitude scale."
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        amplitude_tensor = librosa.db_to_amplitude(self.tensor.to_numpy())
        return Tensor.from_numpy(amplitude_tensor)


class DBToPowerNode(GenflowNode):
    """
    This node converts a decibel (dB) spectrogram back to power scale.

    The DBToPower Node is used when there is a need to convert a spectrogram represented in decibel scale back to power scale. The need to revert to power scale arises when specific algorithms require inputs in power scale form or when there is a need to reverse a previous dB conversion.

    #### Applications
    - Audio Signal Processing: Convert decibel spectrograms to power scale for algorithms that require power scale inputs.
    - Audio Data Analysis: Convert back to power scale to reverse a previous dB conversion for further analysis.
    """

    tensor: Tensor = Field(
        default=Tensor(), description="The tensor containing the decibel spectrogram."
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        db_spec = self.tensor.to_numpy()
        return Tensor.from_numpy(librosa.db_to_power(db_spec))


class GriffinLimNode(GenflowNode):
    """
    GriffinLim Node performs phase reconstruction on a magnitude spectrogram utilizing the Griffin-Lim algorithm.

    The main purpose of this node is to reconstruct the phase when only the magnitude spectrogram is available. This allows the recovery of the time-domain signal. It features various control points such as the number of iterations, hop length, win length, window type, and output signal length adjustments.

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


class MelSpectrogramNode(GenflowNode):
    class MelSpectrogramNode(GenflowNode):
        """
        This node converts an audio file to a Mel Spectrogram using librosa.

        A Mel Spectrogram is a representation of an audio signal that captures frequency and time information, which is very useful for audio analysis. It is particularly effective for tasks such as audio classification and speech recognition, and can serve as input for further machine learning tasks.

        Applications:
        - Audio Classification: The MelSpectrogram node can be used to extract features from audio data, which can then be fed into a classifier for tasks such as music genre classification, emotion detection from speech, and more.
        - Speech Recognition: The features extracted by the MelSpectrogram node can be used to build speech recognition models that convert spoken language into written text.
        - Audio Analysis: The MelSpectrogram node can aid in the analysis of audio files, revealing patterns and features that may not be immediately apparent from the raw time-domain signal.
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
        fmax: int = Field(
            default=8000, ge=0, description="The highest frequency (in Hz)."
        )

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


class MFCCNode(GenflowNode):
    class MFCCNode(GenflowNode):
        """
        This node transforms an audio file into MFCC, a compact representation commonly used in audio analysis and speech recognition.

        The MFCC Node takes in an audio file and transforms it into a representation that can be used for audio analysis tasks, specially speech recognition. Fine control over the characteristics of the transformation is available through optional fields - such as the number of coefficients to extract and frequency range.

        Applications:
        - Speech Recognition: MFCCs are widely used as features for speech recognition tasks.
        - Audio Analysis: The node can also be used in various audio analysis tasks, such as speaker identification, or sound classification.
        """

        audio: AudioRef = Field(
            default=AudioRef(), description="The audio file to extract MFCCs from."
        )
        n_mfcc: int = Field(
            default=13, ge=0, description="The number of MFCCs to extract."
        )
        n_fft: int = Field(
            default=2048, ge=0, description="The number of samples per frame."
        )
        hop_length: int = Field(
            default=512, ge=0, description="The number of samples between frames."
        )
        fmin: int = Field(default=0, ge=0, description="The lowest frequency (in Hz).")
        fmax: int = Field(
            default=8000, ge=0, description="The highest frequency (in Hz)."
        )

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


class PlotSpectrogramNode(GenflowNode):
    class PlotSpectrogramNode(GenflowNode):
        """
        The PlotSpectrogram node generates a visual representation of the spectrum of frequencies in an audio signal as they vary with time.

        This node is used to convert an audio signal into a 2D image. It is specifically tailored for analyzing audio signals, rendering an image that displays how the frequencies of the audio signal are distributed over time. This can be particularly useful in audio analysis tasks like music genre classification, speech recognition, and sound event detection.

        #### Applications
        - Audio Analysis: Allows users to visually see the spectrum of frequencies in their data.
        - Machine Learning: Used as a preprocessing step for feeding data into image-based ML models.
        - Sound engineering: Helps in identifying specific tones or frequencies in a music piece or a sound bite.
        """

        tensor: Tensor = Field(
            default=Tensor(), description="The tensor containing the mel spectrogram."
        )
        fmax: int = Field(
            default=8000, ge=0, description="The highest frequency (in Hz)."
        )

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

    class PowertToDBNode(GenflowNode):
        """
        Converts a power spectrogram to decibel (dB) scale.

        This node takes a power spectrogram and converts it into decibel scale. The purpose of this conversion is to make data less skewed and easier to handle, thus facilitating visualization and further signal processing.

        #### Applications
        - Audio Signal Processing: The inputted power spectrogram is processed to convert it into a decibel scale which is utilised further.
        - Audio Visualization: The decibel-scaled spectrogram is a better fit for visualizations due to its reduced skewness.

        #### Example
        In a pipeline, you might use PowertToDB Node after generating a power spectrogram from an audio source (with nodes like FFT). The next node could be any visualization node that can display the decibel-scaled spectrogram or another signal processing node.
        """

        tensor: Tensor = Field(
            default=Tensor(), description="The tensor containing the power spectrogram."
        )

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


class PowertToDBNode(GenflowNode):
    """
    Converts a power spectrogram to decibel (dB) scale.

    This node takes a power spectrogram and converts it into decibel scale. The purpose of this conversion is to make data less skewed and easier to handle, thus facilitating visualization and further signal processing.

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


class SpectralContrastNode(GenflowNode):
    class SpectralContrastNode(GenflowNode):
        """
        This node computes the spectral contrast.

        The spectral contrast measures the difference in amplitude between the most noticeable parts (peaks) and the less noticeable parts (valleys) in a sound spectrum. This node is used to analyze audio files and is useful for distinguishing timbre, or the color of sound.

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


class STFTNode(GenflowNode):
    class STFTNode(GenflowNode):
        """
        This node computes the Short-Time Fourier Transform (STFT) matrix for an audio signal.
        The STFT matrix represents the signal in both time and frequency domains, forming the foundation for many audio processing tasks.

        STFT Node is crucial for tasks like filtering, equalization, and more. By providing a 2D representation of a 1D audio signal, it allows for a more in-depth analysis of the signal.

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
            default=None,
            description="The window length. If None, it defaults to n_fft.",
        )
        window: str = Field(default="hann", description="The type of window to use.")
        center: bool = Field(
            default=True,
            description="If True, the signal is padded so that each frame is centered.",
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
            return Tensor.from_numpy(stft_matrix)

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
