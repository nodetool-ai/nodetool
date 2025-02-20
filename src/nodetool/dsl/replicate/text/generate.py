from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Llama3_1_405B_Instruct(GraphNode):
    """Meta's flagship 405 billion parameter language model, fine-tuned for chat completions"""

    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering).')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.9, description='A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751).')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Prompt')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The maximum number of tokens the model should generate as output.')
    min_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The minimum number of tokens the model should generate as output.')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='The value used to modulate the next token probabilities.')
    system_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='You are a helpful assistant.', description='System prompt to send to the model. This is prepended to the prompt and helps guide system behavior. Ignored for non-chat models.')
    stop_sequences: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="A comma-separated list of sequences to stop generation at. For example, '<end>,<stop>' will stop generation at the first instance of 'end' or '<stop>'.")
    presence_penalty: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Presence penalty')
    frequency_penalty: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Frequency penalty')

    @classmethod
    def get_node_type(cls): return "replicate.text.generate.Llama3_1_405B_Instruct"



class Llama3_70B(GraphNode):
    """Base version of Llama 3, a 70 billion parameter language model from Meta."""

    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering).')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.9, description='A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751).')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Prompt')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The maximum number of tokens the model should generate as output.')
    min_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The minimum number of tokens the model should generate as output.')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='The value used to modulate the next token probabilities.')
    prompt_template: str | GraphNode | tuple[GraphNode, str] = Field(default='{prompt}', description='Prompt template. The string `{prompt}` will be substituted for the input prompt. If you want to generate dialog output, use this template as a starting point and construct the prompt string manually, leaving `prompt_template={prompt}`.')
    presence_penalty: float | GraphNode | tuple[GraphNode, str] = Field(default=1.15, description='Presence penalty')
    frequency_penalty: float | GraphNode | tuple[GraphNode, str] = Field(default=0.2, description='Frequency penalty')

    @classmethod
    def get_node_type(cls): return "replicate.text.generate.Llama3_70B"



class Llama3_70B_Instruct(GraphNode):
    """A 70 billion parameter language model from Meta, fine tuned for chat completions"""

    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering).')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.9, description='A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751).')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Prompt')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The maximum number of tokens the model should generate as output.')
    min_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The minimum number of tokens the model should generate as output.')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='The value used to modulate the next token probabilities.')
    prompt_template: str | GraphNode | tuple[GraphNode, str] = Field(default='{prompt}', description='Prompt template. The string `{prompt}` will be substituted for the input prompt. If you want to generate dialog output, use this template as a starting point and construct the prompt string manually, leaving `prompt_template={prompt}`.')
    presence_penalty: float | GraphNode | tuple[GraphNode, str] = Field(default=1.15, description='Presence penalty')
    frequency_penalty: float | GraphNode | tuple[GraphNode, str] = Field(default=0.2, description='Frequency penalty')

    @classmethod
    def get_node_type(cls): return "replicate.text.generate.Llama3_70B_Instruct"



class Llama3_8B(GraphNode):
    """Base version of Llama 3, an 8 billion parameter language model from Meta."""

    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering).')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.9, description='A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751).')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Prompt')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The maximum number of tokens the model should generate as output.')
    min_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The minimum number of tokens the model should generate as output.')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='The value used to modulate the next token probabilities.')
    prompt_template: str | GraphNode | tuple[GraphNode, str] = Field(default='{prompt}', description='Prompt template. The string `{prompt}` will be substituted for the input prompt. If you want to generate dialog output, use this template as a starting point and construct the prompt string manually, leaving `prompt_template={prompt}`.')
    presence_penalty: float | GraphNode | tuple[GraphNode, str] = Field(default=1.15, description='Presence penalty')
    frequency_penalty: float | GraphNode | tuple[GraphNode, str] = Field(default=0.2, description='Frequency penalty')

    @classmethod
    def get_node_type(cls): return "replicate.text.generate.Llama3_8B"



class Llama3_8B_Instruct(GraphNode):
    """An 8 billion parameter language model from Meta, fine tuned for chat completions"""

    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering).')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.9, description='A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751).')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Prompt')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The maximum number of tokens the model should generate as output.')
    min_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The minimum number of tokens the model should generate as output.')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='The value used to modulate the next token probabilities.')
    prompt_template: str | GraphNode | tuple[GraphNode, str] = Field(default='{prompt}', description='Prompt template. The string `{prompt}` will be substituted for the input prompt. If you want to generate dialog output, use this template as a starting point and construct the prompt string manually, leaving `prompt_template={prompt}`.')
    presence_penalty: float | GraphNode | tuple[GraphNode, str] = Field(default=1.15, description='Presence penalty')
    frequency_penalty: float | GraphNode | tuple[GraphNode, str] = Field(default=0.2, description='Frequency penalty')

    @classmethod
    def get_node_type(cls): return "replicate.text.generate.Llama3_8B_Instruct"



class LlamaGuard_3_11B_Vision(GraphNode):
    """A Llama-3.2-11B pretrained model, fine-tuned for content safety classification"""

    image: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Image to moderate')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='Which one should I buy?', description='User message to moderate')

    @classmethod
    def get_node_type(cls): return "replicate.text.generate.LlamaGuard_3_11B_Vision"



class LlamaGuard_3_8B(GraphNode):
    """A Llama-3.1-8B pretrained model, fine-tuned for content safety classification"""

    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='I forgot how to kill a process in Linux, can you help?', description='User message to moderate')
    assistant: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Assistant response to classify')

    @classmethod
    def get_node_type(cls): return "replicate.text.generate.LlamaGuard_3_8B"



class Snowflake_Arctic_Instruct(GraphNode):
    """An efficient, intelligent, and truly open-source language model"""

    name: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    name_file: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)

    @classmethod
    def get_node_type(cls): return "replicate.text.generate.Snowflake_Arctic_Instruct"


