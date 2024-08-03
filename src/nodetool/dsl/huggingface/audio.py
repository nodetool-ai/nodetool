from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.huggingface.audio import AudioClassifierModelId

class AudioClassifier(GraphNode):
    model: AudioClassifierModelId | GraphNode | tuple[GraphNode, str] = Field(default=AudioClassifierModelId('MIT/ast-finetuned-audioset-10-10-0.4593'), description='The model ID to use for audio classification')
    inputs: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The input audio to classify')
    @classmethod
    def get_node_type(cls): return "huggingface.audio.AudioClassifier"


from nodetool.nodes.huggingface.audio import ASRModelId

class AutomaticSpeechRecognition(GraphNode):
    model: ASRModelId | GraphNode | tuple[GraphNode, str] = Field(default=ASRModelId('openai/whisper-large-v3'), description='The model ID to use for the speech recognition')
    inputs: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The input audio to transcribe')
    @classmethod
    def get_node_type(cls): return "huggingface.audio.AutomaticSpeechRecognition"


from nodetool.nodes.huggingface.audio import TextToAudioModelId

class TextToAudio(GraphNode):
    model: TextToAudioModelId | GraphNode | tuple[GraphNode, str] = Field(default=TextToAudioModelId('facebook/musicgen-small'), description='The model ID to use for the audio generation')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The input text to the model')
    @classmethod
    def get_node_type(cls): return "huggingface.audio.TextToAudio"


from nodetool.nodes.huggingface.audio import TTSModelId

class TextToSpeech(GraphNode):
    model: TTSModelId | GraphNode | tuple[GraphNode, str] = Field(default=TTSModelId('suno/bark'), description='The model ID to use for the image generation')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The input text to the model')
    @classmethod
    def get_node_type(cls): return "huggingface.audio.TextToSpeech"


from nodetool.nodes.huggingface.audio import ZeroShotAudioClassifierModelId

class ZeroShotAudioClassifier(GraphNode):
    model: ZeroShotAudioClassifierModelId | GraphNode | tuple[GraphNode, str] = Field(default=ZeroShotAudioClassifierModelId('laion/clap-htsat-unfused'), description='The model ID to use for the classification')
    inputs: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The input audio to classify')
    candidate_labels: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The candidate labels to classify the audio against, separated by commas')
    @classmethod
    def get_node_type(cls): return "huggingface.audio.ZeroShotAudioClassifier"


