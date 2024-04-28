from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.huggingface.audio.speech_recognition import ModelId

class AutomaticSpeechRecognition(GraphNode):
    model: ModelId | GraphNode | tuple[GraphNode, str] = Field(default=ModelId('openai/whisper-large-v3'), description='The model ID to use for the speech recognition')
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='The input audio to transcribe')
    @classmethod
    def get_node_type(cls): return "huggingface.audio.speech_recognition.AutomaticSpeechRecognition"


