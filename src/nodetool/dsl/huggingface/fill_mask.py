from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class FillMask(GraphNode):
    """
    Fills in a masked token in a given text.
    text, fill-mask, natural language processing

    Use cases:
    - Text completion
    - Sentence prediction
    - Language understanding tasks
    - Generating text options
    """

    model: HFFillMask | GraphNode | tuple[GraphNode, str] = Field(default=HFFillMask(type='hf.fill_mask', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model ID to use for fill-mask task')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='The capital of France is [MASK].', description='The input text with [MASK] token to be filled')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=5, description='Number of top predictions to return')

    @classmethod
    def get_node_type(cls): return "huggingface.fill_mask.FillMask"


