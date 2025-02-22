from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.fal.llm

class AnyLLM(GraphNode):
    """
    Use any large language model from a selected catalogue (powered by OpenRouter).
    Supports various models including Claude 3, Gemini, Llama, and GPT-4.
    llm, text, generation, ai, language

    Use cases:
    - Generate natural language responses
    - Create conversational AI interactions
    - Process and analyze text content
    - Generate creative writing
    - Assist with problem-solving tasks
    """

    ModelEnum: typing.ClassVar[type] = nodetool.nodes.fal.llm.AnyLLM.ModelEnum
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to send to the language model')
    system_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Optional system prompt to provide context or instructions')
    model: nodetool.nodes.fal.llm.AnyLLM.ModelEnum = Field(default=ModelEnum.GEMINI_FLASH, description='The language model to use for the completion')

    @classmethod
    def get_node_type(cls): return "fal.llm.AnyLLM"


