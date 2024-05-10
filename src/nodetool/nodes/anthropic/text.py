import numpy as np
from nodetool.common.environment import Environment
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext

from anthropic.types.text_block import TextBlock
from pydantic import Field

from enum import Enum


class Model(str, Enum):
    claude_3_opus_20240229 = "claude-3-opus-20240229"
    claude_3_sonnet_20240229 = "claude-3-sonnet-20240229"
    claude_3_haiku_20240307 = "claude-3-haiku-20240307"


class Claude(BaseNode):
    """
    Use Claude models for generating natural language responses based on input prompts.
    text, llm, t2t, ttt, text-to-text, generate, claude, chat
    """

    model: Model = Field(title="Model", default=Model.claude_3_opus_20240229)
    system: str = Field(title="System", default="You are a friendly assistant.")
    prompt: str = Field(title="Prompt", default="")
    max_tokens: int = Field(title="Max Tokens", default=100, ge=1, le=2048)
    temperature: float = Field(title="Temperature", default=1.0, ge=0.0, le=2.0)
    top_k: int = Field(title="Top K", default=40, ge=1, le=2048)
    top_p: float = Field(title="Top P", default=1.0, ge=0.0, le=1.0)

    async def process(self, context: ProcessingContext) -> str:
        client = Environment.get_anthropic_client()
        message = await client.messages.create(
            system=self.system,
            max_tokens=self.max_tokens,
            messages=[{"role": "user", "content": self.prompt}],
            model=self.model.value,
        )

        await context.create_prediction(
            provider="anthropic",
            node_id=self._id,
            node_type=self.get_node_type(),
            model=self.model.value,
            cost=0.0,
        )

        return "".join([i.text for i in message.content if isinstance(i, TextBlock)])
