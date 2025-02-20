from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Llama3Chat(GraphNode):
    """
    Run chat models using the Aime API with Llama 3.1.
    llm, text generation, language model, ai assistant

    Use cases:
    - Chat with an AI assistant using Llama 3.1
    - Generate responses for conversational workflows
    - Integrate with chat-based applications
    """

    system_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='You are a friendly assistant.', description="System prompt that defines the assistant's behavior.")
    messages: list[Message] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='History of messages in the conversation.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Prompt to send to the model. If provided, it will add a new message to the conversation.')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='The temperature to use for response generation.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=40, description='The number of highest probability tokens to consider.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.9, description='The cumulative probability threshold for token sampling.')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=500, description='Maximum number of tokens to generate.')

    @classmethod
    def get_node_type(cls): return "aime.text.Llama3Chat"



class MixtralChat(GraphNode):
    """
    Run chat models using the Aime API with Mixtral.
    llm, text generation, language model, ai assistant

    Use cases:
    - Chat with an AI assistant using Mixtral
    - Generate responses for conversational workflows
    - Integrate with chat-based applications
    """

    system_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='You are a friendly assistant.', description="System prompt that defines the assistant's behavior.")
    messages: list[Message] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='History of messages in the conversation.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Prompt to send to the model. If provided, it will add a new message to the conversation.')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='The temperature to use for response generation.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=40, description='The number of highest probability tokens to consider.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.9, description='The cumulative probability threshold for token sampling.')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=500, description='Maximum number of tokens to generate.')

    @classmethod
    def get_node_type(cls): return "aime.text.MixtralChat"


