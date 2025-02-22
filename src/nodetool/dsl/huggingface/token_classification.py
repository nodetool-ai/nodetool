from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.huggingface.token_classification

class TokenClassification(GraphNode):
    """
    Performs token classification tasks such as Named Entity Recognition (NER).
    text, token classification, named entity recognition, natural language processing

    Use cases:
    - Named Entity Recognition in text
    - Part-of-speech tagging
    - Chunking and shallow parsing
    - Information extraction from unstructured text
    """

    AggregationStrategy: typing.ClassVar[type] = nodetool.nodes.huggingface.token_classification.TokenClassification.AggregationStrategy
    model: HFTokenClassification | GraphNode | tuple[GraphNode, str] = Field(default=HFTokenClassification(type='hf.token_classification', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model ID to use for token classification')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The input text for token classification')
    aggregation_strategy: nodetool.nodes.huggingface.token_classification.TokenClassification.AggregationStrategy = Field(default=AggregationStrategy.SIMPLE, description='Strategy to aggregate tokens into entities')

    @classmethod
    def get_node_type(cls): return "huggingface.token_classification.TokenClassification"


