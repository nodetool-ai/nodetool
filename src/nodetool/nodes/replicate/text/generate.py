from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.common.replicate_node import ReplicateNode
from enum import Enum


class Llama3_8B(ReplicateNode):
    """Base version of Llama 3, an 8 billion parameter language model from Meta."""

    def replicate_model_id(self):
        return "meta/meta-llama-3-8b:9a9e68fc8695f5847ce944a5cecf9967fd7c64d0fb8c8af1d5bdcc71f03c5e47"

    def get_hardware(self):
        return "None"

    @classmethod
    def return_type(cls):
        return str

    top_k: int = Field(
        title="Top K",
        description="The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering).",
        default=50,
    )
    top_p: float = Field(
        title="Top P",
        description="A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751).",
        default=0.9,
    )
    prompt: str = Field(title="Prompt", description="Prompt", default="")
    max_tokens: int = Field(
        title="Max Tokens",
        description="The maximum number of tokens the model should generate as output.",
        default=512,
    )
    min_tokens: int = Field(
        title="Min Tokens",
        description="The minimum number of tokens the model should generate as output.",
        default=0,
    )
    temperature: float = Field(
        title="Temperature",
        description="The value used to modulate the next token probabilities.",
        default=0.6,
    )
    prompt_template: str = Field(
        title="Prompt Template",
        description="Prompt template. The string `{prompt}` will be substituted for the input prompt. If you want to generate dialog output, use this template as a starting point and construct the prompt string manually, leaving `prompt_template={prompt}`.",
        default="{prompt}",
    )
    presence_penalty: float = Field(
        title="Presence Penalty", description="Presence penalty", default=1.15
    )
    frequency_penalty: float = Field(
        title="Frequency Penalty", description="Frequency penalty", default=0.2
    )


class Llama3_70B(ReplicateNode):
    """Base version of Llama 3, a 70 billion parameter language model from Meta."""

    def replicate_model_id(self):
        return "meta/meta-llama-3-70b:83c5bdea9941e83be68480bd06ad792f3f295612a24e4678baed34083083a87f"

    def get_hardware(self):
        return "None"

    @classmethod
    def return_type(cls):
        return str

    top_k: int = Field(
        title="Top K",
        description="The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering).",
        default=50,
    )
    top_p: float = Field(
        title="Top P",
        description="A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751).",
        default=0.9,
    )
    prompt: str = Field(title="Prompt", description="Prompt", default="")
    max_tokens: int = Field(
        title="Max Tokens",
        description="The maximum number of tokens the model should generate as output.",
        default=512,
    )
    min_tokens: int = Field(
        title="Min Tokens",
        description="The minimum number of tokens the model should generate as output.",
        default=0,
    )
    temperature: float = Field(
        title="Temperature",
        description="The value used to modulate the next token probabilities.",
        default=0.6,
    )
    prompt_template: str = Field(
        title="Prompt Template",
        description="Prompt template. The string `{prompt}` will be substituted for the input prompt. If you want to generate dialog output, use this template as a starting point and construct the prompt string manually, leaving `prompt_template={prompt}`.",
        default="{prompt}",
    )
    presence_penalty: float = Field(
        title="Presence Penalty", description="Presence penalty", default=1.15
    )
    frequency_penalty: float = Field(
        title="Frequency Penalty", description="Frequency penalty", default=0.2
    )


class Llama3_8B_Instruct(ReplicateNode):
    """An 8 billion parameter language model from Meta, fine tuned for chat completions"""

    def replicate_model_id(self):
        return "meta/meta-llama-3-8b-instruct:5a6809ca6288247d06daf6365557e5e429063f32a21146b2a807c682652136b8"

    def get_hardware(self):
        return "None"

    @classmethod
    def return_type(cls):
        return str

    top_k: int = Field(
        title="Top K",
        description="The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering).",
        default=50,
    )
    top_p: float = Field(
        title="Top P",
        description="A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751).",
        default=0.9,
    )
    prompt: str = Field(title="Prompt", description="Prompt", default="")
    max_tokens: int = Field(
        title="Max Tokens",
        description="The maximum number of tokens the model should generate as output.",
        default=512,
    )
    min_tokens: int = Field(
        title="Min Tokens",
        description="The minimum number of tokens the model should generate as output.",
        default=0,
    )
    temperature: float = Field(
        title="Temperature",
        description="The value used to modulate the next token probabilities.",
        default=0.6,
    )
    prompt_template: str = Field(
        title="Prompt Template",
        description="Prompt template. The string `{prompt}` will be substituted for the input prompt. If you want to generate dialog output, use this template as a starting point and construct the prompt string manually, leaving `prompt_template={prompt}`.",
        default="{prompt}",
    )
    presence_penalty: float = Field(
        title="Presence Penalty", description="Presence penalty", default=1.15
    )
    frequency_penalty: float = Field(
        title="Frequency Penalty", description="Frequency penalty", default=0.2
    )


class Llama3_70B_Instruct(ReplicateNode):
    """A 70 billion parameter language model from Meta, fine tuned for chat completions"""

    def replicate_model_id(self):
        return "meta/meta-llama-3-70b-instruct:fbfb20b472b2f3bdd101412a9f70a0ed4fc0ced78a77ff00970ee7a2383c575d"

    def get_hardware(self):
        return "None"

    @classmethod
    def return_type(cls):
        return str

    top_k: int = Field(
        title="Top K",
        description="The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering).",
        default=50,
    )
    top_p: float = Field(
        title="Top P",
        description="A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751).",
        default=0.9,
    )
    prompt: str = Field(title="Prompt", description="Prompt", default="")
    max_tokens: int = Field(
        title="Max Tokens",
        description="The maximum number of tokens the model should generate as output.",
        default=512,
    )
    min_tokens: int = Field(
        title="Min Tokens",
        description="The minimum number of tokens the model should generate as output.",
        default=0,
    )
    temperature: float = Field(
        title="Temperature",
        description="The value used to modulate the next token probabilities.",
        default=0.6,
    )
    prompt_template: str = Field(
        title="Prompt Template",
        description="Prompt template. The string `{prompt}` will be substituted for the input prompt. If you want to generate dialog output, use this template as a starting point and construct the prompt string manually, leaving `prompt_template={prompt}`.",
        default="{prompt}",
    )
    presence_penalty: float = Field(
        title="Presence Penalty", description="Presence penalty", default=1.15
    )
    frequency_penalty: float = Field(
        title="Frequency Penalty", description="Frequency penalty", default=0.2
    )
