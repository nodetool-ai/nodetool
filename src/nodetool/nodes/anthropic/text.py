import numpy as np
from nodetool.metadata.types import ImageRef, Provider
from nodetool.metadata.types import AnthropicModel, FunctionModel
from nodetool.metadata.types import Message, MessageImageContent, MessageTextContent
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.types import NodeProgress
from nodetool.chat.chat import Chunk, generate_messages

from anthropic.types.text_block import TextBlock
from anthropic.types.message import Message as AnthropicMessage
from pydantic import Field


class Claude(BaseNode):
    """
    Generate natural language responses using Claude AI models.
    text, llm, chat, generation, anthropic

    Use cases:
    1. Generate creative writing based on prompts
    2. Answer questions and provide explanations on various topics
    3. Assist with tasks like summarization, translation, or code generation
    4. Engage in multi-turn conversations with context retention
    5. Analyze and describe images when provided as input
    """

    model: AnthropicModel = Field(
        title="Model", default=AnthropicModel.claude_3_5_sonnet
    )
    system: str = Field(title="System", default="You are a friendly assistant.")
    prompt: str = Field(title="Prompt", default="")
    messages: list[Message] = Field(title="Messages", default=[])
    image: ImageRef = Field(title="Image", default=ImageRef())
    max_tokens: int = Field(title="Max Tokens", default=100, ge=1, le=10000)
    temperature: float = Field(title="Temperature", default=1.0, ge=0.0, le=1.0)
    top_k: int = Field(title="Top K", default=40, ge=1, le=2048)
    top_p: float = Field(title="Top P", default=1.0, ge=0.0, le=1.0)

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["model", "system", "prompt", "image"]

    async def process(self, context: ProcessingContext) -> str:
        # Create messages list starting with system message
        messages = [
            Message(role="system", content=self.system),
        ]

        if self.messages:
            messages.extend(self.messages)

        # Add user message with prompt and image if provided
        content = []
        if self.image.uri != "":
            image_base64 = await context.image_to_base64(self.image)
            content.append(MessageImageContent(image=ImageRef(uri=image_base64)))

        if self.prompt:
            content.append(MessageTextContent(text=self.prompt))

        if content:
            messages.append(Message(role="user", content=content))

        # Create FunctionModel for Anthropic
        model = FunctionModel(name=self.model.value, provider=Provider.Anthropic)

        # Use generate_messages to stream the response
        result_content = ""

        async for chunk in generate_messages(
            messages=messages,
            model=model,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            top_k=self.top_k,
            top_p=self.top_p,
        ):
            if isinstance(chunk, Chunk):
                context.post_message(
                    NodeProgress(
                        node_id=self._id,
                        progress=0,
                        total=0,
                        chunk=chunk.content,
                    )
                )
                result_content += chunk.content

        return result_content
