from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.replicate.audio.transcribe
import nodetool.nodes.replicate.audio.transcribe
import nodetool.nodes.replicate.audio.transcribe

class IncrediblyFastWhisper(GraphNode):
    """whisper-large-v3, incredibly fast, powered by Hugging Face Transformers! 🤗"""

    Task: typing.ClassVar[type] = nodetool.nodes.replicate.audio.transcribe.IncrediblyFastWhisper.Task
    Language: typing.ClassVar[type] = nodetool.nodes.replicate.audio.transcribe.IncrediblyFastWhisper.Language
    Timestamp: typing.ClassVar[type] = nodetool.nodes.replicate.audio.transcribe.IncrediblyFastWhisper.Timestamp
    task: nodetool.nodes.replicate.audio.transcribe.IncrediblyFastWhisper.Task = Field(default=Task.TRANSCRIBE, description='Task to perform: transcribe or translate to another language.')
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='Audio file')
    hf_token: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="Provide a hf.co/settings/token for Pyannote.audio to diarise the audio clips. You need to agree to the terms in 'https://huggingface.co/pyannote/speaker-diarization-3.1' and 'https://huggingface.co/pyannote/segmentation-3.0' first.")
    language: nodetool.nodes.replicate.audio.transcribe.IncrediblyFastWhisper.Language = Field(default=Language.NONE, description="Language spoken in the audio, specify 'None' to perform language detection.")
    timestamp: nodetool.nodes.replicate.audio.transcribe.IncrediblyFastWhisper.Timestamp = Field(default=Timestamp.CHUNK, description='Whisper supports both chunked as well as word level timestamps.')
    batch_size: int | GraphNode | tuple[GraphNode, str] = Field(default=24, description='Number of parallel batches you want to compute. Reduce if you face OOMs.')
    diarise_audio: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Use Pyannote.audio to diarise the audio clips. You will need to provide hf_token below too.')

    @classmethod
    def get_node_type(cls): return "replicate.audio.transcribe.IncrediblyFastWhisper"


