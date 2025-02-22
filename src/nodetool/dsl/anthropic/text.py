from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.metadata.types

class Claude(GraphNode):
    """
    Generate natural language responses using Claude AI models.
    text, llm, chat, generation, anthropic

    Use cases:
    1. Generate creative writing based on prompts
    2. Answer questions and provide explanations on various topics
    3. Assist with tasks like summarization, translation, or code generation
    4. Engage in multi-turn conversations with context retention
    5. Analyze and describe images when provided as input
    """

    AnthropicModel: typing.ClassVar[type] = nodetool.metadata.types.Claude.AnthropicModel
    model: nodetool.metadata.types.Claude.AnthropicModel = Field(default=AnthropicModel.claude_3_5_sonnet, description=None)
    system: str | GraphNode | tuple[GraphNode, str] = Field(default='You are a friendly assistant.', description=None)
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description=None)
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description=None)
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=40, description=None)
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)

    @classmethod
    def get_node_type(cls): return "anthropic.text.Claude"


