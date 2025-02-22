from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.google.gemini

class Gemini(GraphNode):
    """
    Generate text using Gemini.
    google, llm, chat, vision, multimodal
    """

    GeminiModel: typing.ClassVar[type] = nodetool.nodes.google.gemini.Gemini.GeminiModel
    model: nodetool.nodes.google.gemini.Gemini.GeminiModel = Field(default=GeminiModel.Gemini1_5_Pro, description=None)
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    messages: list[Message] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='History of messages to send to the model.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Image to use for generation')
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='Audio to use for generation')
    system_instruction: str | GraphNode | tuple[GraphNode, str] = Field(default='You are a helpful assistant.', description='Instructions for the model to steer it toward better performance.\n        For example, "Answer as concisely as possible" or "Don\'t use technical\n        terms in your response".\n        ')
    code_execution: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to enable code execution tool. \n        You can use this code execution capability to build applications that \n        benefit from code-based reasoning and that produce text output.\n        ')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Value that controls the degree of randomness in token selection.\n        Lower temperatures are good for prompts that require a less open-ended or\n        creative response, while higher temperatures can lead to more diverse or\n        creative results.\n        ')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Tokens are selected from the most to least probable until the sum\n        of their probabilities equals this value. Use a lower value for less\n        random responses and a higher value for more random responses.\n        ')
    top_k: float | GraphNode | tuple[GraphNode, str] = Field(default=40, description='For each token selection step, the ``top_k`` tokens with the\n        highest probabilities are sampled. Then tokens are further filtered based\n        on ``top_p`` with the final token selected using temperature sampling. Use\n        a lower number for less random responses and a higher number for more\n        random responses.\n        ')
    max_output_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='Maximum number of tokens that can be generated in the response.\n      ')
    presence_penalty: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Positive values penalize tokens that already appear in the\n        generated text, increasing the probability of generating more diverse\n        content.\n        ')
    frequency_penalty: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Positive values penalize tokens that repeatedly appear in the\n        generated text, increasing the probability of generating more diverse\n        content.\n        ')

    @classmethod
    def get_node_type(cls): return "google.gemini.Gemini"


