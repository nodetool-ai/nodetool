from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class FeatureExtraction(GraphNode):
    """
    Extracts features from text using pre-trained models.
    text, feature extraction, embeddings, natural language processing

    Use cases:
    - Text similarity comparison
    - Clustering text documents
    - Input for machine learning models
    - Semantic search applications
    """

    model: HFFeatureExtraction | GraphNode | tuple[GraphNode, str] = Field(default=HFFeatureExtraction(type='hf.feature_extraction', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model ID to use for feature extraction')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text to extract features from')

    @classmethod
    def get_node_type(cls): return "huggingface.feature_extraction.FeatureExtraction"


