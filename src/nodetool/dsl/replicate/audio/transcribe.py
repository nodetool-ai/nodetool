from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.replicate.audio.transcribe import Task
from nodetool.nodes.replicate.audio.transcribe import Language
from nodetool.nodes.replicate.audio.transcribe import Timestamp

class IncrediblyFastWhisper(GraphNode):
    task: Task | GraphNode | tuple[GraphNode, str] = Field(default='transcribe', description='Task to perform: transcribe or translate to another language.')
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='Audio file')
    hf_token: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Provide a hf.co/settings/token for Pyannote.audio to diarise the audio clips. You need to agree to the terms in 'https://huggingface.co/pyannote/speaker-diarization-3.1' and 'https://huggingface.co/pyannote/segmentation-3.0' first.")
    language: Language | GraphNode | tuple[GraphNode, str] = Field(default='None', description="Language spoken in the audio, specify 'None' to perform language detection.")
    timestamp: Timestamp | GraphNode | tuple[GraphNode, str] = Field(default='chunk', description='Whisper supports both chunked as well as word level timestamps.')
    batch_size: int | GraphNode | tuple[GraphNode, str] = Field(default=24, description='Number of parallel batches you want to compute. Reduce if you face OOMs.')
    diarise_audio: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Use Pyannote.audio to diarise the audio clips. You will need to provide hf_token below too.')
    @classmethod
    def get_node_type(cls): return "replicate.audio.transcribe.IncrediblyFastWhisper"


from nodetool.nodes.replicate.audio.transcribe import Language
from nodetool.nodes.replicate.audio.transcribe import Transcription

class Whisper(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='Audio file')
    model: str | GraphNode | tuple[GraphNode, str] = Field(default='large-v3', description='This version only supports Whisper-large-v3.')
    language: Language | GraphNode | tuple[GraphNode, str] = Field(default=None, description='language spoken in the audio, specify None to perform language detection')
    patience: float | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='optional patience value to use in beam decoding, as in https://arxiv.org/abs/2204.05424, the default (1.0) is equivalent to conventional beam search')
    translate: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Translate the text to English when set to True')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='temperature to use for sampling')
    transcription: Transcription | GraphNode | tuple[GraphNode, str] = Field(default='plain text', description='Choose the format for the transcription')
    initial_prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='optional text to provide as a prompt for the first window.')
    suppress_tokens: str | GraphNode | tuple[GraphNode, str] = Field(default='-1', description="comma-separated list of token ids to suppress during sampling; '-1' will suppress most special characters except common punctuations")
    logprob_threshold: float | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='if the average log probability is lower than this value, treat the decoding as failed')
    no_speech_threshold: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='if the probability of the <|nospeech|> token is higher than this value AND the decoding has failed due to `logprob_threshold`, consider the segment as silence')
    condition_on_previous_text: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='if True, provide the previous output of the model as a prompt for the next window; disabling may make the text inconsistent across windows, but the model becomes less prone to getting stuck in a failure loop')
    compression_ratio_threshold: float | GraphNode | tuple[GraphNode, str] = Field(default=2.4, description='if the gzip compression ratio is higher than this value, treat the decoding as failed')
    temperature_increment_on_fallback: float | GraphNode | tuple[GraphNode, str] = Field(default=0.2, description='temperature to increase when falling back when the decoding fails to meet either of the thresholds below')
    @classmethod
    def get_node_type(cls): return "replicate.audio.transcribe.Whisper"


