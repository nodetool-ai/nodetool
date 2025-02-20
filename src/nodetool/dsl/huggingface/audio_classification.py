from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AudioClassifier(GraphNode):
    """
    Classifies audio into predefined categories.
    audio, classification, labeling, categorization

    Use cases:
    - Classify music genres
    - Detect speech vs. non-speech audio
    - Identify environmental sounds
    - Emotion recognition in speech

    Recommended models
    - MIT/ast-finetuned-audioset-10-10-0.4593
    - ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition
    """

    model: HFAudioClassification | GraphNode | tuple[GraphNode, str] = Field(default=HFAudioClassification(type='hf.audio_classification', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model ID to use for audio classification')
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The input audio to classify')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='The number of top results to return')

    @classmethod
    def get_node_type(cls): return "huggingface.audio_classification.AudioClassifier"



class ZeroShotAudioClassifier(GraphNode):
    """
    Classifies audio into categories without the need for training data.
    audio, classification, labeling, categorization, zero-shot

    Use cases:
    - Quickly categorize audio without training data
    - Identify sounds or music genres without predefined labels
    - Automate audio tagging for large datasets
    """

    model: HFZeroShotAudioClassification | GraphNode | tuple[GraphNode, str] = Field(default=HFZeroShotAudioClassification(type='hf.zero_shot_audio_classification', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model ID to use for the classification')
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The input audio to classify')
    candidate_labels: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The candidate labels to classify the audio against, separated by commas')

    @classmethod
    def get_node_type(cls): return "huggingface.audio_classification.ZeroShotAudioClassifier"


