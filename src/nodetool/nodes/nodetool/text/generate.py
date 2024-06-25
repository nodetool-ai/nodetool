from enum import Enum
from pydantic import Field, validator
from nodetool.metadata.types import LlamaModel
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.base_node import BaseNode


class GPT2(BaseNode):
    """
    GPT-2 is a transformer-based language model. This node uses the GPT-2 model to generate text based on a prompt.

    # Applications
    - Generating text based on a prompt.
    - Generating text for chatbots.
    - Generating text for creative writing.
    """

    prompt: str = Field(default="", description="Prompt to send to the model.")
    max_tokens: int = Field(
        default=128,
        ge=1,
        le=1024,
        description="Maximum number of tokens to generate. A word is generally 2-3 tokens (minimum: 1)",
    )
    temperature: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="The temperature to use for the model.",
    )
    top_k: int = Field(
        default=50,
        ge=1,
        le=100,
        description="The number of highest probability tokens to keep for top-k sampling.",
    )
    top_p: float = Field(
        default=0.95,
        ge=0.0,
        le=1.0,
        description="The cumulative probability cutoff for nucleus/top-p sampling.",
    )

    async def process(self, context: ProcessingContext) -> str:
        from transformers import pipeline

        pipe = pipeline(task="text-generation", model="gpt2")
        res = pipe(
            self.prompt,
            max_new_tokens=self.max_tokens,
            do_sample=True,
            temperature=self.temperature,
            top_k=self.top_k,
            top_p=self.top_p,
            return_full_text=False,
        )
        return res[0]["generated_text"]  # type: ignore
