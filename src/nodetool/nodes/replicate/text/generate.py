from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.providers.replicate.replicate_node import ReplicateNode
from enum import Enum


class Llama3_8B(ReplicateNode):
    """Base version of Llama 3, an 8 billion parameter language model from Meta."""

    @classmethod
    def replicate_model_id(cls):
        return "meta/meta-llama-3-8b:9a9e68fc8695f5847ce944a5cecf9967fd7c64d0fb8c8af1d5bdcc71f03c5e47"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/dd9ac11a-edda-4d33-b413-6a721c44dfb0/meta-logo.png",
            "created_at": "2024-04-17T18:04:26.049832Z",
            "description": "Base version of Llama 3, an 8 billion parameter language model from Meta.",
            "github_url": "https://github.com/meta-llama/llama3",
            "license_url": "https://github.com/meta-llama/llama3/blob/main/LICENSE",
            "name": "meta-llama-3-8b",
            "owner": "meta",
            "paper_url": None,
            "run_count": 37049685,
            "url": "https://replicate.com/meta/meta-llama-3-8b",
            "visibility": "public",
        }

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

    @classmethod
    def replicate_model_id(cls):
        return "meta/meta-llama-3-70b:83c5bdea9941e83be68480bd06ad792f3f295612a24e4678baed34083083a87f"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/8e044b4c-0b20-4717-83bd-a94d89fb0dbe/meta-logo.png",
            "created_at": "2024-04-17T18:05:18.044746Z",
            "description": "Base version of Llama 3, a 70 billion parameter language model from Meta.",
            "github_url": None,
            "license_url": "https://github.com/meta-llama/llama3/blob/main/LICENSE",
            "name": "meta-llama-3-70b",
            "owner": "meta",
            "paper_url": None,
            "run_count": 284729,
            "url": "https://replicate.com/meta/meta-llama-3-70b",
            "visibility": "public",
        }

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

    @classmethod
    def replicate_model_id(cls):
        return "meta/meta-llama-3-8b-instruct:5a6809ca6288247d06daf6365557e5e429063f32a21146b2a807c682652136b8"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/927d3fce-75e3-4af9-92da-f537bc34072a/meta-logo.png",
            "created_at": "2024-04-17T21:44:58.480057Z",
            "description": "An 8 billion parameter language model from Meta, fine tuned for chat completions",
            "github_url": "https://github.com/meta-llama/llama3",
            "license_url": "https://github.com/meta-llama/llama3/blob/main/LICENSE",
            "name": "meta-llama-3-8b-instruct",
            "owner": "meta",
            "paper_url": None,
            "run_count": 8805414,
            "url": "https://replicate.com/meta/meta-llama-3-8b-instruct",
            "visibility": "public",
        }

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

    @classmethod
    def replicate_model_id(cls):
        return "meta/meta-llama-3-70b-instruct:fbfb20b472b2f3bdd101412a9f70a0ed4fc0ced78a77ff00970ee7a2383c575d"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/12ed0c29-9236-4a21-ac5a-7faff3045ab1/meta-logo.png",
            "created_at": "2024-04-17T21:44:13.482460Z",
            "description": "A 70 billion parameter language model from Meta, fine tuned for chat completions",
            "github_url": "https://github.com/meta-llama/llama3",
            "license_url": "https://github.com/meta-llama/llama3/blob/main/LICENSE",
            "name": "meta-llama-3-70b-instruct",
            "owner": "meta",
            "paper_url": None,
            "run_count": 29699389,
            "url": "https://replicate.com/meta/meta-llama-3-70b-instruct",
            "visibility": "public",
        }

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


class Snowflake_Arctic_Instruct(ReplicateNode):
    """An efficient, intelligent, and truly open-source language model"""

    @classmethod
    def replicate_model_id(cls):
        return "snowflake/snowflake-arctic-instruct:6133ce49e79282dc4fdbd984779921aa2160fb557ab17e0854aa2a7d690afb9c"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/18259dd0-6c42-441b-90f2-b67af9e4320b/Snowflake_Arctic_Opengraph_1200x6.png",
            "created_at": "2024-04-24T00:08:29.300675Z",
            "description": "An efficient, intelligent, and truly open-source language model",
            "github_url": "https://github.com/Snowflake-Labs/snowflake-arctic",
            "license_url": "https://www.apache.org/licenses/LICENSE-2.0",
            "name": "snowflake-arctic-instruct",
            "owner": "snowflake",
            "paper_url": None,
            "run_count": 527508,
            "url": "https://replicate.com/snowflake/snowflake-arctic-instruct",
            "visibility": "public",
        }

    @classmethod
    def return_type(cls):
        return str

    top_k: int = Field(
        title="Top K",
        description="The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering). Lower to ignore less likely tokens",
        default=50,
    )
    top_p: float = Field(
        title="Top P",
        description="A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751). Lower to ignore less likely tokens.",
        default=0.9,
    )
    prompt: str = Field(
        title="Prompt", description="Prompt to send to the model.", default=""
    )
    temperature: float = Field(
        title="Temperature",
        description="The value used to modulate the next token probabilities. Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic, 0.75 is a good starting value.",
        default=0.6,
    )
    max_new_tokens: int = Field(
        title="Max New Tokens",
        description="The maximum number of tokens the model should generate as output. A word is generally 2-3 tokens.",
        default=512,
    )
    min_new_tokens: int = Field(
        title="Min New Tokens",
        description="The minimum number of tokens the model should generate as output. A word is generally 2-3 tokens.",
        default=0,
    )
    stop_sequences: str = Field(
        title="Stop Sequences",
        description="A comma-separated list of sequences to stop generation at. For example, '<end>,<stop>' will stop generation at the first instance of 'end' or '<stop>'.",
        default="<|im_end|>",
    )
    prompt_template: str = Field(
        title="Prompt Template",
        description="Prompt template. The string `{prompt}` will be substituted for the input prompt. If you want to generate dialog output, use this template as a starting point and construct the prompt string manually, leaving `prompt_template={prompt}`.",
        default="<|im_start|>system\nYou're a helpful assistant<|im_end|>\n<|im_start|>user\n{prompt}<|im_end|>\n\n<|im_start|>assistant\n",
    )
    presence_penalty: float = Field(
        title="Presence Penalty",
        description="A parameter that penalizes repeated tokens regardless of the number of appearances. As the value increases, the model will be less likely to repeat tokens in the output.",
        default=1.15,
    )
    frequency_penalty: float = Field(
        title="Frequency Penalty",
        description="Frequency penalty is similar to presence penalty, but while presence penalty applies to all tokens that have been sampled at least once, the frequency penalty proportional to how often a particular token has already been sampled.",
        default=0.2,
    )
