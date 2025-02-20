from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AmplitudeToDB(GraphNode):
    """
    Converts an amplitude spectrogram to a dB-scaled spectrogram.
    audio, analysis, spectrogram

    This node is useful for:
    - Compressing the dynamic range of spectrograms for visualization
    - Preparing input for audio models that expect dB-scaled data
    """

    tensor: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='The amplitude tensor to be converted to dB scale.')

    @classmethod
    def get_node_type(cls): return "lib.audio.librosa.analysis.AmplitudeToDB"



class ChromaSTFT(GraphNode):
    """
    This node creates a chromagram from a waveform or power spectrogram to identify different pitch classes in an audio signal.
    audio, analysis, chromagram, pitch

    Applications:
    - Chord recognition in music
    - Music genre classification based on pitch content
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to extract chromagram from.')
    n_fft: int | GraphNode | tuple[GraphNode, str] = Field(default=2048, description='The number of samples per frame.')
    hop_length: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The number of samples between frames.')

    @classmethod
    def get_node_type(cls): return "lib.audio.librosa.analysis.ChromaSTFT"



class DBToAmplitude(GraphNode):
    """
    The DBToAmplitude node Converts a dB-scaled spectrogram to an amplitude spectrogram.
    audio, analysis, spectrogram
    Useful for:
    - Reversing dB scaling before audio synthesis
    - Preparing data for models that expect linear amplitude scaling
    """

    tensor: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='The dB-scaled tensor to be converted to amplitude scale.')

    @classmethod
    def get_node_type(cls): return "lib.audio.librosa.analysis.DBToAmplitude"



class DBToPower(GraphNode):
    """
    This node converts a decibel (dB) spectrogram back to power scale.
    audio, analysis, spectrogram

    Useful for:
    - Reversing dB scaling for audio synthesis
    - Preparing data for models that expect power-scaled data
    """

    tensor: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='The tensor containing the decibel spectrogram.')

    @classmethod
    def get_node_type(cls): return "lib.audio.librosa.analysis.DBToPower"



class GriffinLim(GraphNode):
    """
    GriffinLim Node performs phase reconstruction on a magnitude spectrogram utilizing the Griffin-Lim algorithm.
    audio, synthesis, phase reconstruction

    Applications:
    - Audio synthesis from spectrograms
    - Phase reconstruction in audio processing pipelines
    """

    magnitude_spectrogram: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='Magnitude spectrogram input for phase reconstruction.')
    n_iter: int | GraphNode | tuple[GraphNode, str] = Field(default=32, description='Number of iterations for the Griffin-Lim algorithm.')
    hop_length: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Number of samples between successive frames.')
    win_length: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Each frame of audio is windowed by `window()`. The window will be of length `win_length` and then padded with zeros to match `n_fft`.')
    window: str | GraphNode | tuple[GraphNode, str] = Field(default='hann', description='Type of window to use for Griffin-Lim transformation.')
    center: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If True, the signal `y` is padded so that frame `D[:, t]` is centered at `y[t * hop_length]`.')
    length: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='If given, the resulting signal will be zero-padded or clipped to this length.')

    @classmethod
    def get_node_type(cls): return "lib.audio.librosa.analysis.GriffinLim"



class MFCC(GraphNode):
    """
    MFCC Node computes the Mel-frequency cepstral coefficients (MFCCs) from an audio signal.
    audio, analysis, frequency, MFCC, MEL
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to extract MFCCs from.')
    n_mfcc: int | GraphNode | tuple[GraphNode, str] = Field(default=13, description='The number of MFCCs to extract.')
    n_fft: int | GraphNode | tuple[GraphNode, str] = Field(default=2048, description='The number of samples per frame.')
    hop_length: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The number of samples between frames.')
    fmin: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The lowest frequency (in Hz).')
    fmax: int | GraphNode | tuple[GraphNode, str] = Field(default=8000, description='The highest frequency (in Hz).')

    @classmethod
    def get_node_type(cls): return "lib.audio.librosa.analysis.MFCC"



class MelSpectrogram(GraphNode):
    """
    MelSpecNode computes the Mel-frequency spectrogram for an audio signal.
    audio, analysis, spectrogram

    Useful for:
    - Audio feature extraction for machine learning
    - Speech and music analysis tasks
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to convert to a tensor.')
    n_fft: int | GraphNode | tuple[GraphNode, str] = Field(default=2048, description='The number of samples per frame.')
    hop_length: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The number of samples between frames.')
    n_mels: int | GraphNode | tuple[GraphNode, str] = Field(default=128, description='The number of Mel bands to generate.')
    fmin: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The lowest frequency (in Hz).')
    fmax: int | GraphNode | tuple[GraphNode, str] = Field(default=8000, description='The highest frequency (in Hz).')

    @classmethod
    def get_node_type(cls): return "lib.audio.librosa.analysis.MelSpectrogram"



class PlotSpectrogram(GraphNode):
    """
    The PlotSpectrogram node generates a visual representation of the spectrum of frequencies in an audio signal as they vary with time.
    audio, analysis, frequency, spectrogram

    #### Applications
    - Audio Analysis: Allows users to visually see the spectrum of frequencies in their data.
    - Machine Learning: Used as a preprocessing step for feeding data into image-based ML models.
    - Sound engineering: Helps in identifying specific tones or frequencies in a music piece or a sound bite.
    """

    tensor: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='The tensor containing the mel spectrogram.')
    fmax: int | GraphNode | tuple[GraphNode, str] = Field(default=8000, description='The highest frequency (in Hz).')

    @classmethod
    def get_node_type(cls): return "lib.audio.librosa.analysis.PlotSpectrogram"



class PowertToDB(GraphNode):
    """
    Converts a power spectrogram to decibel (dB) scale.
    audio, analysis, decibel, spectrogram
    """

    tensor: NPArray | GraphNode | tuple[GraphNode, str] = Field(default=NPArray(type='np_array', value=None, dtype='<i8', shape=(1,)), description='The tensor containing the power spectrogram.')

    @classmethod
    def get_node_type(cls): return "lib.audio.librosa.analysis.PowertToDB"



class STFT(GraphNode):
    """
    This node computes the Short-Time Fourier Transform (STFT) matrix for an audio signal. The STFT matrix represents the signal in both time and frequency domains, forming the foundation for many audio processing tasks.
    audio, analysis, fourier, frequency, time
    #### Applications
    - Audio Analysis: By transforming the audio signal into a visualizable format, it helps in understanding and analyzing the audio signal.
    - Sound Processing: It plays a key foundational role in sound effects, tuning, compression, and more.
    - Audio Feature Extraction: It can be used to analyze frequency-based features for sound classification.
    - Music Information Retrieval: It helps in music transcription, rhythm and tempo analysis.
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to compute the STFT matrix from.')
    n_fft: int | GraphNode | tuple[GraphNode, str] = Field(default=2048, description='The number of samples per frame.')
    hop_length: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The number of samples between frames.')
    win_length: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The window length. If None, it defaults to n_fft.')
    window: str | GraphNode | tuple[GraphNode, str] = Field(default='hann', description='The type of window to use.')
    center: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If True, input signal is padded so that frame D[:, t] is centered at y[t * hop_length].')

    @classmethod
    def get_node_type(cls): return "lib.audio.librosa.analysis.STFT"



class SpectralCentroid(GraphNode):
    """
    Computes the spectral centroid of an audio file.
    audio, analysis, spectral

    The spectral centroid indicates where the "center of mass" of the spectrum is located.
    Perceptually, it has a connection with the impression of "brightness" of a sound.

    Use cases:
    - Analyze the timbral characteristics of audio
    - Track changes in sound brightness over time
    - Feature extraction for music genre classification
    - Audio effect design and sound manipulation
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to analyze.')
    n_fft: int | GraphNode | tuple[GraphNode, str] = Field(default=2048, description='The length of the FFT window.')
    hop_length: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Number of samples between successive frames.')

    @classmethod
    def get_node_type(cls): return "lib.audio.librosa.analysis.SpectralCentroid"



class SpectralContrast(GraphNode):
    """
    The spectral contrast measures the difference in amplitude between the most noticeable parts (peaks) and the less noticeable parts (valleys) in a sound spectrum.
    audio, analysis, decibel, amplitude

    #### Applications
    - Music genre classification: distinguishing between different types of music based on the color of sound.
    - Instrument recognition: recognizing different musical instruments by the difference in their spectral contrast.
    - Audio analysis: determining various characteristics of audio files.

    Useful note: The `n_fft` and `hop_length` parameters affect the resolution of the analysis. A higher `n_fft` provides better frequency resolution but worse time resolution, and vice versa for a lower `hop_length`.
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio file to extract spectral contrast from.')
    n_fft: int | GraphNode | tuple[GraphNode, str] = Field(default=2048, description='The number of samples per frame.')
    hop_length: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The number of samples between frames.')

    @classmethod
    def get_node_type(cls): return "lib.audio.librosa.analysis.SpectralContrast"


