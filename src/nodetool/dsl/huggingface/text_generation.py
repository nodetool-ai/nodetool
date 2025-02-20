from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class TextGeneration(GraphNode):
    """
    Generates text based on a given prompt.
    text, generation, natural language processing

    Use cases:
    - Creative writing assistance
    - Automated content generation
    - Chatbots and conversational AI
    - Code generation and completion
    """

    model: HFTextGeneration | GraphNode | tuple[GraphNode, str] = Field(default=HFTextGeneration(type='hf.text_generation', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model ID to use for the text generation')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The input text prompt for generation')
    max_new_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The maximum number of new tokens to generate')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Controls randomness in generation. Lower values make it more deterministic.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Controls diversity of generated text. Lower values make it more focused.')
    do_sample: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to use sampling or greedy decoding')

    @classmethod
    def get_node_type(cls): return "huggingface.text_generation.TextGeneration"


