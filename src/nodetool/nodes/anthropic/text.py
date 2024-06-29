import numpy as np
from nodetool.metadata.types import ImageRef, Provider
from nodetool.metadata.types import AnthropicModel
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext

from anthropic.types.text_block import TextBlock
from anthropic.types.message import Message
from pydantic import Field


class Claude(BaseNode):
    """
    Use Claude models for generating natural language responses based on input prompts.
    text, llm, t2t, ttt, text-to-text, generate, claude, chat
    """

    model: AnthropicModel = Field(
        title="Model", default=AnthropicModel.claude_3_5_sonnet
    )
    system: str = Field(title="System", default="You are a friendly assistant.")
    prompt: str = Field(title="Prompt", default="")
    image: ImageRef = Field(title="Image", default=ImageRef())
    max_tokens: int = Field(title="Max Tokens", default=100, ge=1, le=10000)
    temperature: float = Field(title="Temperature", default=1.0, ge=0.0, le=1.0)
    top_k: int = Field(title="Top K", default=40, ge=1, le=2048)
    top_p: float = Field(title="Top P", default=1.0, ge=0.0, le=1.0)

    async def process(self, context: ProcessingContext) -> str:
        messages = []
        content = []

        if self.image.uri != "":
            image = await context.image_to_base64(self.image)
            content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": image,
                    },
                }
            )

        content.append(
            {
                "type": "text",
                "text": self.prompt,
            }
        )

        messages.append({"role": "user", "content": content})

        response = await context.run_prediction(
            node_id=self.id,
            provider=Provider.Anthropic,
            model=self.model.value,
            params={
                "system": self.system,
                "messages": messages,
                "max_tokens": self.max_tokens,
                "temperature": self.temperature,
                "top_k": self.top_k,
                "top_p": self.top_p,
            },
        )

        message = Message(**response)

        return "".join([i.text for i in message.content if isinstance(i, TextBlock)])
