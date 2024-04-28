from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AmplitudeToDB(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The amplitude tensor to be converted to dB scale.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.analysis.AmplitudeToDB"



class ChromaSTFT(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='The audio file to extract chromagram from.')
    n_fft: int | GraphNode | tuple[GraphNode, str] = Field(default=2048, description='The number of samples per frame.')
    hop_length: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The number of samples between frames.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.analysis.ChromaSTFT"



class DBToAmplitude(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The dB-scaled tensor to be converted to amplitude scale.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.analysis.DBToAmplitude"



class DBToPower(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description='The tensor containing the decibel spectrogram.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.analysis.DBToPower"



class GriffinLim(GraphNode):
    magnitude_spectrogram: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='Magnitude spectrogram input for phase reconstruction.')
    n_iter: int | GraphNode | tuple[GraphNode, str] = Field(default=32, description='Number of iterations for the Griffin-Lim algorithm.')
    hop_length: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Number of samples between successive frames.')
    win_length: Optional | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Each frame of audio is windowed by `window()`. The window will be of length `win_length` and then padded with zeros to match `n_fft`.')
    window: str | GraphNode | tuple[GraphNode, str] = Field(default='hann', description='Type of window to use for Griffin-Lim transformation.')
    center: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If True, the signal `y` is padded so that frame `D[:, t]` is centered at `y[t * hop_length]`.')
    length: Optional | GraphNode | tuple[GraphNode, str] = Field(default=None, description='If given, the resulting signal will be zero-padded or clipped to this length.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.analysis.GriffinLim"



class MFCC(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='The audio file to extract MFCCs from.')
    n_mfcc: int | GraphNode | tuple[GraphNode, str] = Field(default=13, description='The number of MFCCs to extract.')
    n_fft: int | GraphNode | tuple[GraphNode, str] = Field(default=2048, description='The number of samples per frame.')
    hop_length: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The number of samples between frames.')
    fmin: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The lowest frequency (in Hz).')
    fmax: int | GraphNode | tuple[GraphNode, str] = Field(default=8000, description='The highest frequency (in Hz).')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.analysis.MFCC"



class MelSpectrogram(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='The audio file to convert to a tensor.')
    n_fft: int | GraphNode | tuple[GraphNode, str] = Field(default=2048, description='The number of samples per frame.')
    hop_length: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The number of samples between frames.')
    n_mels: int | GraphNode | tuple[GraphNode, str] = Field(default=128, description='The number of Mel bands to generate.')
    fmin: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The lowest frequency (in Hz).')
    fmax: int | GraphNode | tuple[GraphNode, str] = Field(default=8000, description='The highest frequency (in Hz).')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.analysis.MelSpectrogram"



class PlotSpectrogram(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description='The tensor containing the mel spectrogram.')
    fmax: int | GraphNode | tuple[GraphNode, str] = Field(default=8000, description='The highest frequency (in Hz).')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.analysis.PlotSpectrogram"



class PowertToDB(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description='The tensor containing the power spectrogram.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.analysis.PowertToDB"



class STFT(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='The audio file to compute the STFT matrix from.')
    n_fft: int | GraphNode | tuple[GraphNode, str] = Field(default=2048, description='The number of samples per frame.')
    hop_length: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The number of samples between frames.')
    win_length: Optional | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The window length. If None, it defaults to n_fft.')
    window: str | GraphNode | tuple[GraphNode, str] = Field(default='hann', description='The type of window to use.')
    center: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='If True, input signal is padded so that frame D[:, t] is centered at y[t * hop_length].')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.analysis.STFT"



class SpectralContrast(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='The audio file to extract spectral contrast from.')
    n_fft: int | GraphNode | tuple[GraphNode, str] = Field(default=2048, description='The number of samples per frame.')
    hop_length: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The number of samples between frames.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.analysis.SpectralContrast"


