from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Llama3_70B(GraphNode):
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



class Snowflake_Arctic_Instruct(GraphNode):
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering). Lower to ignore less likely tokens')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.9, description='A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751). Lower to ignore less likely tokens.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Prompt to send to the model.')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.6, description='The value used to modulate the next token probabilities. Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic, 0.75 is a good starting value.')
    max_new_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The maximum number of tokens the model should generate as output. A word is generally 2-3 tokens.')
    min_new_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The minimum number of tokens the model should generate as output. A word is generally 2-3 tokens.')
    stop_sequences: str | GraphNode | tuple[GraphNode, str] = Field(default='<|im_end|>', description="A comma-separated list of sequences to stop generation at. For example, '<end>,<stop>' will stop generation at the first instance of 'end' or '<stop>'.")
    prompt_template: str | GraphNode | tuple[GraphNode, str] = Field(default="<|im_start|>system\nYou're a helpful assistant<|im_end|>\n<|im_start|>user\n{prompt}<|im_end|>\n\n<|im_start|>assistant\n", description='Prompt template. The string `{prompt}` will be substituted for the input prompt. If you want to generate dialog output, use this template as a starting point and construct the prompt string manually, leaving `prompt_template={prompt}`.')
    presence_penalty: float | GraphNode | tuple[GraphNode, str] = Field(default=1.15, description='A parameter that penalizes repeated tokens regardless of the number of appearances. As the value increases, the model will be less likely to repeat tokens in the output.')
    frequency_penalty: float | GraphNode | tuple[GraphNode, str] = Field(default=0.2, description='Frequency penalty is similar to presence penalty, but while presence penalty applies to all tokens that have been sampled at least once, the frequency penalty proportional to how often a particular token has already been sampled.')
    @classmethod
    def get_node_type(cls): return "replicate.text.generate.Snowflake_Arctic_Instruct"


