import tiktoken
from nodetool.nodes.replicate import ReplicateNode, calculate_llm_cost


from pydantic import Field


from enum import Enum
from typing import ClassVar

from nodetool.nodes.replicate import get_model_version
from nodetool.workflows.processing_context import ProcessingContext


class LlamaNode(ReplicateNode):
    """
    Llama 2 is a tool for generating text based on a given prompt.

    This model, developed by Meta, creates vivid and context-specific textual outputs.
    With Llama 2, users can generate stories, text-based games, chat messages and many more.

    #### Applications
    - Story writing: Create high-quality stories, articles or scripts.
    - Dialogue system: Develop advanced customer service chatbots or characters for video games.
    - Education: Craft personalized learning resources or assist with homework.
    - Business: Generate market analysis reports or help with technical writing.
    """

    class Model(str, Enum):
        llama_2_7b = "meta/llama-2-7b"
        llama_2_13b = "meta/llama-2-13b"
        llama_2_70b = "meta/llama-2-70b"
        llama_2_7b_chat = "meta/llama-2-7b-chat"
        llama_2_13b_chat = "meta/llama-2-13b-chat"
        llama_2_70b_chat = "meta/llama-2-70b-chat"
        mistral_7b = "mistralai/mistral-7b-v0.1"
        mistral_7b_instruct = "mistralai/mistral-7b-instruct-v0.1"
        mistral_8x7b_instruct = "mistralai/mistral-8x7b-instruct-v0.1"

    model: Model = Field(
        default=Model.llama_2_7b,
        description="The version of the model to use.",
    )

    prompt: str = Field(default="", description="Prompt to send to the model.")
    max_new_tokens: int = Field(
        default=128,
        ge=1,
        le=1024,
        description="Maximum number of tokens to generate. A word is generally 2-3 tokens (minimum: 1)",
    )
    min_new_tokens: int = Field(
        default=(-1),
        ge=(-1),
        le=10,
        description="Minimum number of tokens to generate. To disable, set to -1. A word is generally 2-3 tokens. (minimum: -1)",
    )
    temperature: float = Field(
        default=0.75,
        ge=0.01,
        le=5,
        description="Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic, 0.75 is a good starting value. (minimum: 0.01; maximum: 5)",
    )
    top_p: float = Field(
        default=0.9,
        ge=0,
        le=1,
        description="When decoding text, samples from the top p percentage of most likely tokens; lower to ignore less likely tokens (maximum: 1)",
    )
    stop_sequences: str = Field(
        default="<end>,<stop>",
        description="A comma-separated list of sequences to stop generation at. For example, '<end>,<stop>' will stop generation at the first instance of 'end' or '<stop>'.",
    )

    async def process(self, context: ProcessingContext) -> str:
        enc = tiktoken.encoding_for_model("gpt-4")
        input_tokens = enc.encode(self.prompt)
        pred = await self.run_replicate(context, {})
        if pred is None:
            raise ValueError("Prediction failed")
        output_tokens = pred.output or []
        cost = calculate_llm_cost(
            self.model.value, len(input_tokens), len(output_tokens)
        )
        await context.create_prediction(
            provider="replicate",
            node_id=self.id,
            node_type=self.get_node_type(),
            model=self.model.value,
            cost=cost,
        )
        return "".join(output_tokens)

    def replicate_model_id(self) -> str:
        return f"{self.model.value}:{get_model_version(self.model.value)}"
